// arete-service.js
// ---------------------------------------------------------------------------
// Thin wrapper around the Arete Node SDK `Client`, meant to run in Electron's
// MAIN process (the SDK uses `ws` + `fs` and cannot run in a renderer).
//
// Responsibilities:
//   - install the stable System-ID patch before constructing a Client
//   - connect + authenticate to a CNS/CP control plane
//   - manage TLS for self-signed control planes
//   - register a System -> Node -> Context (identity scaffolding)
//   - poll/forward status and log events to whoever is listening (the UI)
//
// What it deliberately does NOT do: declare a provider/consumer of a Connection
// Profile. That is the "CP logic" and is left as an annotated stub near the
// bottom of this file — see declareRole().
// ---------------------------------------------------------------------------

import { EventEmitter } from 'events';
import { installSystemIdPatch } from './arete-system-id.js';

// NOTE: the SDK reads System ID at `new Client()` time, so the patch must be
// installed before the first construction. installSystemIdPatch() is idempotent;
// main.js calls it again with the persisted seed. Import the SDK lazily inside
// connect() so the patch is guaranteed to be in place first.
let ClientCtor = null;
async function loadClient() {
  if (!ClientCtor) {
    installSystemIdPatch(); // safety net; real seed is set from main.js
    const mod = await import('arete-sdk');
    ClientCtor = mod.Client;
  }
  return ClientCtor;
}

export class AreteService extends EventEmitter {
  #client = null;
  #statusTimer = null;
  #keysTimer = null;
  #state = 'disconnected'; // disconnected | connecting | connected | error
  #lastError = null;
  #identity = { system: null, node: null, context: null };
  #savedTlsEnv = undefined;
  #systemName = ''; // custom system name registered on connect
  #currentHost = ''; // host of the realm we're connected to (no credentials)

  get state() {
    return this.#state;
  }

  /** Structured snapshot the UI renders. */
  getStatus() {
    const c = this.#client;
    return {
      state: this.#state,
      isOpen: !!(c && c.isOpen && c.isOpen()),
      version: c ? c.version || '' : '',
      stats: c ? c.stats || {} : {},
      identity: this.#identity,
      lastError: this.#lastError,
      host: this.#currentHost,
    };
  }

  /**
   * The full CNS key namespace snapshot the monitor views render from, with
   * secret `/token` keys stripped so they never reach the renderer.
   * @returns {Object<string,string>}
   */
  getKeys() {
    const c = this.#client;
    const src = c && c.keys ? c.keys : {};
    const out = {};
    for (const k in src) {
      if (k.endsWith('/token')) continue; // secrets — never expose
      out[k] = src[k];
    }
    return out;
  }

  // Coalesce bursty SDK 'update' events into at most one 'keys' push per window.
  #scheduleKeysPush() {
    if (this.#keysTimer) return;
    this.#keysTimer = setTimeout(() => {
      this.#keysTimer = null;
      this.emit('keys', this.getKeys());
    }, 400);
    if (this.#keysTimer.unref) this.#keysTimer.unref();
  }

  #log(level, message) {
    this.emit('log', { level, message, ts: Date.now() });
  }

  #setState(state) {
    this.#state = state;
    this.emit('status', this.getStatus());
  }

  /**
   * Connect and authenticate.
   * @param {object} opts
   * @param {string} opts.protocol 'wss:' or 'ws:'
   * @param {string} opts.host     hostname WITHOUT credentials, e.g. 'my.realm.example.com'
   * @param {number} opts.port     e.g. 443
   * @param {string} [opts.token] per-realm Bearer token (sent as Authorization: Bearer)
   * @param {boolean} [opts.allowSelfSigned] disable TLS verification (self-signed hosts)
   * @param {number} [opts.timeout] connect timeout ms (default 8000)
   */
  async connect(opts) {
    if (this.#client) await this.disconnect();

    const {
      protocol = 'wss:',
      host,
      port = 443,
      token = '',
      allowSelfSigned = false,
      timeout = 8000,
      systemName = '',
    } = opts || {};
    this.#systemName = systemName;

    if (!host) throw new Error('A host is required to connect.');

    // --- TLS: the Node SDK passes no options to `new WebSocket()`, so the only
    // way to accept a self-signed cert is the process-wide escape hatch. We set
    // it just before connecting and restore it on disconnect. This is insecure
    // by design and only appropriate for a known self-signed control plane.
    if (allowSelfSigned) {
      this.#savedTlsEnv = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      this.#log('warn', 'TLS verification DISABLED for this connection (self-signed host).');
    }

    // --- Auth: a per-realm BEARER token issued by aretehosting. The SDK is
    // patched (scripts/patch-sdk.js PATCH 4) to send it as
    // `Authorization: Bearer <token>` on the WebSocket handshake — this
    // replaces the old HTTP-Basic username/password userinfo. The host is used
    // verbatim (no credentials folded into the URL).
    this.#lastError = null;
    this.#currentHost = host;
    this.#setState('connecting');
    this.#log('info', `Connecting to ${protocol}//${host}:${port} ...`);

    const Client = await loadClient();

    this.#client = new Client({ protocol, host, port, token });

    // Resolves when the first update (initial cache snapshot) has been merged —
    // the SDK emits 'open' exactly then. Registering/renaming before that loses
    // a race: the snapshot can overwrite our rename in the local cache.
    const firstUpdate = new Promise((res) => this.#client.on('open', res));

    // Forward the SDK's own lifecycle events to the log/UI.
    this.#client.on('open', () => this.#log('info', 'Control plane channel open (first update received).'));
    this.#client.on('update', () => {
      this.emit('status', this.getStatus());
      this.#scheduleKeysPush();
    });
    this.#client.on('close', () => {
      this.#log('warn', 'Connection closed by host.');
      this.#setState('disconnected');
    });
    this.#client.on('error', (err) => {
      this.#lastError = String(err && err.message ? err.message : err);
      this.#log('error', `Socket error: ${this.#lastError}`);
      this.#setState('error');
    });

    try {
      await this.#client.waitForOpen(timeout);
    } catch (e) {
      const msg = typeof e === 'string' ? e : e && e.message ? e.message : String(e);
      this.#lastError = msg;
      this.#log('error', `Failed to connect: ${msg}`);
      this.#setState('error');
      await this.disconnect();
      throw new Error(msg);
    }

    this.#log('info', 'Connected and authenticated to the Arete control plane.');
    this.#setState('connected');

    // Register this app's System and give it its custom name right away, so the
    // realm shows "Arete Electron Dashboard" rather than the machine hostname.
    // Wait for the initial cache snapshot first (see `firstUpdate` above).
    if (this.#systemName) {
      try {
        await Promise.race([firstUpdate, new Promise((r) => setTimeout(r, 5000))]);
        await this.#registerSystem();
      } catch (e) {
        this.#log('warn', `Could not register system name: ${e && e.message ? e.message : e}`);
      }
    }

    this.#startStatusPolling();
    return this.getStatus();
  }

  /**
   * Register this app's System and apply the custom system name.
   * The SDK's `client.system()` hardcodes os.hostname() as the name, so we
   * re-issue the same `systems` command with our name to rename it.
   * @returns {Promise<object>} the SDK System instance (has .id)
   */
  async #registerSystem() {
    const system = await this.#client.system();
    if (this.#systemName) {
      await this.#client.command('systems', system.id, this.#systemName);
      this.#log('info', `Registered system as "${this.#systemName}".`);
    }
    return system;
  }

  /**
   * Register identity: System -> Node -> Context. Requires an authenticated
   * connection (the control plane rejects registration otherwise), so a
   * successful call here is a strong signal that auth actually worked.
   * IDs must be STABLE across restarts (22-char base62 recommended).
   */
  async registerNodeContext({ nodeId, nodeName, contextId, contextName, upstream = false }) {
    if (!this.#client || !this.#client.isOpen()) {
      throw new Error('Not connected. Connect before registering identity.');
    }
    this.#log('info', 'Registering system/node/context ...');
    const system = await this.#registerSystem();
    const node = await system.node(nodeId, nodeName, upstream);
    const context = await node.context(contextId, contextName);

    this.#identity = {
      system: system.id,
      node: { id: nodeId, name: nodeName },
      context: { id: contextId, name: contextName },
    };
    this.#log('info', `Registered node "${nodeName}" and context "${contextName}".`);
    this.emit('status', this.getStatus());
    return this.#identity;
  }

  #startStatusPolling() {
    this.#stopStatusPolling();
    // stats() reads a cache the receiver thread fills; cheap to poll.
    this.#statusTimer = setInterval(() => {
      if (this.#client && this.#client.isOpen()) {
        this.emit('status', this.getStatus());
      }
    }, 2000);
    if (this.#statusTimer.unref) this.#statusTimer.unref();
  }

  #stopStatusPolling() {
    if (this.#statusTimer) {
      clearInterval(this.#statusTimer);
      this.#statusTimer = null;
    }
  }

  async disconnect() {
    this.#stopStatusPolling();
    if (this.#keysTimer) {
      clearTimeout(this.#keysTimer);
      this.#keysTimer = null;
    }
    if (this.#client) {
      try {
        this.#client.close();
      } catch (_) {
        /* ignore */
      }
      this.#client = null;
    }
    // Restore TLS env we may have overridden.
    if (this.#savedTlsEnv === undefined) {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    } else {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = this.#savedTlsEnv;
      this.#savedTlsEnv = undefined;
    }
    this.#identity = { system: null, node: null, context: null };
    this.#currentHost = '';
    this.emit('keys', {}); // clear the monitor
    this.#setState('disconnected');
    this.#log('info', 'Disconnected.');
  }

  // =========================================================================
  // CP LOGIC — INTENTIONALLY A STUB.
  // =========================================================================
  // A starter shell declares NO Connection Profile. When you add one, follow
  // the project's hard rule FIRST: resolve the CP at
  //     https://cp.padi.io/profiles/<cp-name>
  // and treat its roles + property directions as the source of truth. Do not
  // proceed with a CP that is absent from that registry.
  //
  // Once you have a registered context (registerNodeContext) and a validated
  // CP, declaring a role is a couple of lines. For example, padi.light:
  //   SWITCH = provider, writes 'sOut' ('1'/'0') and 'sLabel'
  //   LIGHT  = consumer, watches 'sOut', writes actual state to 'cState'
  //
  //   // provider (switch):
  //   const context = /* from registerNodeContext */;
  //   const provider = await context.provider('padi.light');
  //   provider.put('sOut', '1');
  //   provider.watch((e) => { /* e.connection, e.property, e.value */ });
  //
  //   // consumer (light):
  //   const consumer = await context.consumer('padi.light');
  //   consumer.watch((e) => { if (e.property === 'sOut') consumer.put('cState', e.value); });
  //
  // Wire a real implementation here, then expose it over IPC in main.js.
  async declareRole() {
    throw new Error(
      'CP logic not implemented (starter shell). Resolve your CP at ' +
        'https://cp.padi.io/profiles/<name> first, then implement declareRole() ' +
        'in electron/arete-service.js. See the comment block for a padi.light example.'
    );
  }
}
