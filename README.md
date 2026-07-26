# Arete Monitor

> **🖥️ Just want to install and use the app?**
> **[Follow the step-by-step install guide →](INSTALL.md)** — direct download
> links for **macOS**, **Windows**, and **Linux**, written for non-technical
> users. Heads-up: the installers are **not signed**, so your computer will
> show a one-time security warning; the guide walks you through it.

> **🤖 Building your own CNS/CP app?**
> **[ARETE.md](https://github.com/project-arete/sdk/blob/main/ARETE.md)** teaches
> any AI coding assistant how to build on CNS/CP correctly — point yours at
> `https://raw.githubusercontent.com/project-arete/sdk/main/ARETE.md`.



An **Electron** dashboard for monitoring an **Arete CNS/CP realm**, built on the
Node [`arete-sdk`](https://github.com/project-arete/sdk). It connects and
authenticates to a control plane, registers itself as the "Arete Monitor"
system, and renders the realm live across five views:

- **Home** — drill-down: system cards → node/context tiles → capability details
- **Contexts** — realm-wide context venues (grouped by context ID, name variants)
- **Connections** — one panel per governed binding, with live change highlights
- **Graph** — the realm as a force-directed knowledge graph with animated flows
- **Status / Config** — connection status, event log, and realm credentials

It is deliberately **CP-agnostic**: it shows structure, bindings, and raw
property values (enriched with names/roles from the `cp.padi.io` registry) and
applies no CP-specific health rules. It declares no CP itself (stub left in
`arete-service.js`).

## Requirements

- macOS, Windows, or Linux with Node.js 18+ and npm (development runs anywhere Electron does).
- Network reach to your Arete control plane on the WebSocket port (usually 443).

## Run it (development)

```shell
npm install      # downloads the Electron binary for your Mac
npm start        # launches the app
```

In the window: open the **Config** tab, fill in **Host / Port / Username /
Password**, tick **Allow self-signed TLS** if your host uses a self-signed
cert, and click **Connect**. The **Home** tab then shows the realm's systems.
Defaults come from `.env` (copy `.env.example` → `.env`).

### Verify the connection logic without the GUI

```shell
npm run test:connect
# or point it anywhere:
ARETE_HOST=my.realm.example.com ARETE_USER=myuser ARETE_PASS=•••• \
  ARETE_ALLOW_SELF_SIGNED=1 npm run test:connect
```

## Installers for every platform

Every tagged release is built automatically by GitHub Actions for **macOS
(.dmg, Apple Silicon + Intel), Windows (installer .exe), and Linux (AppImage /
.deb)** and attached to the [releases page](https://github.com/project-arete/arete-monitor/releases/latest)
— see [INSTALL.md](INSTALL.md) for the non-technical walkthrough. So for most
people, **there is nothing to build**.

### Building locally (optional)

You can still build your own installer — e.g. a `.dmg` you open once, drag the
app to Applications, and launch like any other app, no Terminal or npm again.

**Easiest — double-click the builder.** In Finder, double-click
**`Build Arete Monitor.command`**. It installs dependencies (first run only),
builds the installer, and opens the `release/` folder with your `.dmg` inside.
(First time, macOS may say it "cannot verify the developer" — right-click the
file → Open → Open once to clear that.)

**Or one command:**

```shell
npm run dist          # electron-builder --mac → release/Arete-Monitor-<ver>-<arch>.dmg
```

Then open the `.dmg`, drag **Arete Monitor** onto the **Applications** shortcut,
and double-click it from Applications or Launchpad.

Notes:

- A macOS installer can only be **built on macOS** (Windows/Linux installers
  have their own targets: `npm run dist:win` / `npm run dist:linux`). The CI
  release workflow builds all three platforms on tag push.
- Builds are **unsigned** (no paid developer accounts needed). On your own
  machine they open normally; anyone else gets a one-time security prompt —
  [INSTALL.md](INSTALL.md) walks them through it (or add Developer ID /
  code-signing config to the `build` block in `package.json`).
- `arm64` is for Apple Silicon, `x64` for Intel Macs; `npm run dist` builds both.

## How it's wired

```
electron/main.js           Main process. Window, config/identity persistence, IPC.
electron/arete-service.js  SDK wrapper: connect/auth/TLS, status polling, register.
electron/arete-system-id.js Sets the stable System-ID seed env var (see "Gotchas").
electron/preload.cjs       contextBridge → window.arete (the only renderer↔main path).
renderer/                  The UI (no Node, no SDK — talks only to window.arete).
scripts/patch-sdk.js       postinstall: patches the SDK's off-Pi System-ID bug.
scripts/test-connect.js    Headless end-to-end connection test.
build/icon.png             App icon (electron-builder converts to .icns).
Build Arete Monitor.command  Double-click in Finder to build the .dmg.
```

The Arete SDK uses `ws` and `fs`, so it runs **only in the main process**. The
renderer is sandboxed and reaches it exclusively through the preload bridge.

## Gotchas this scaffold already handles

These are real edges in the current SDK (`arete-sdk@0.1.6`); the code works
around each so you don't have to.

- **System ID off-Raspberry-Pi.** `get_system_id()` reads Pi devicetree files
  and throws on any other platform — *inside the `Client` constructor*. Patching
  `fs` at runtime does **not** work inside Electron (the SDK's `import * as fs`
  resolves to an already-snapshotted facade / a different fs object). So instead
  a **post-install patch** (`scripts/patch-sdk.js`, wired to `postinstall`) adds
  a fallback to the SDK source: if `process.env.ARETE_SYSTEM_SEED` is set,
  `get_system_id()` returns `uuidv5('oid', seed)`. The app sets that env var to a
  **stable per-install seed** (persisted at `app.getPath('userData')/system-id.txt`)
  before the SDK loads, so the System ID stays constant across restarts. The
  patch is idempotent and re-applies after every `npm install`.
- **Authentication.** The Node `Client` has no username/password option;
  credentials travel as HTTP Basic **userinfo in the WebSocket URL**
  (`wss://user:pass@host`). The service folds URL-encoded credentials into the
  host before constructing the client.
- **Self-signed TLS.** The SDK passes no options to `new WebSocket()`, so the
  only way to accept a self-signed cert is the process-wide
  `NODE_TLS_REJECT_UNAUTHORIZED=0` escape hatch. The **Allow self-signed TLS**
  toggle sets it just for the connection and restores it on disconnect. Leave it
  **off** for hosts with valid public certs.
- **Readiness.** Connection readiness is gated on `client.isOpen()` /
  `waitForOpen()`, not on a version handshake.

## Troubleshooting

- **`dyld: Library not loaded: @rpath/Electron Framework.framework` / paths
  mentioning `.tmp.driveupload`, `.icloud`, or `.dropbox`.** You're running from
  inside a **cloud-synced folder** (Google Drive, iCloud, Dropbox). Sync
  services rewrite files mid-run and don't preserve the Electron `.app` bundle's
  symlinks, corrupting `node_modules/electron`. Copy the project to a normal
  local folder and reinstall there:
  ```shell
  rsync -a --exclude node_modules --exclude release ./ "$HOME/arete-electron-starter/"
  cd "$HOME/arete-electron-starter" && npm install && npm start
  ```
- **`Unable to detect System ID on this platform`.** The SDK source patch didn't
  apply (e.g. `node_modules` was restored without running `postinstall`). Run
  `npm run patch` (or `npm install`) and restart.

## Adding a Connection Profile (the CP logic)

This shell intentionally stops before declaring a CP. When you add one, follow
the project rule **first**:

> Resolve the CP in the registry at `https://cp.padi.io/profiles/<name>` and
> treat its roles and property directions as the source of truth. If the CP is
> not in the registry, stop — do not invent it.

Then implement `declareRole()` in `electron/arete-service.js` and expose it over
IPC in `electron/main.js`. For example, `padi.light` (already in the registry):

```js
// after registerNodeContext(...) you have a `context`
// SWITCH = provider: writes 'sOut' ('1'/'0') and 'sLabel'
const provider = await context.provider('padi.light');
provider.put('sOut', '1');
provider.watch((e) => { /* e.connection, e.property, e.value */ });

// LIGHT = consumer: watches 'sOut', reports actual state on 'cState'
const consumer = await context.consumer('padi.light');
consumer.watch((e) => { if (e.property === 'sOut') consumer.put('cState', e.value); });
```

## Security notes

- `.env` (with any password) is git-ignored. Prefer entering the password in the
  UI over storing it.
- Self-signed TLS disables certificate verification for that connection — use it
  only against a control plane you trust.
- The renderer runs with `contextIsolation` on and `nodeIntegration` off; all
  privileged work happens in the main process behind a narrow IPC surface.
