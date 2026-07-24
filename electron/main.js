// main.js — Electron main process.
// Owns the window, persists identity/config, and bridges the AreteService to the
// renderer over IPC. The Arete SDK only runs here (Node context), never in the UI.

import { app, BrowserWindow, ipcMain, shell, safeStorage } from 'electron';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { installSystemIdPatch } from './arete-system-id.js';
import { AreteService } from './arete-service.js';

// IMPORTANT: get `fs` via createRequire, NOT `import fs from 'node:fs'`. A static
// ESM fs import here would create the shared 'fs' module facade and snapshot its
// named exports BEFORE installSystemIdPatch() mutates them — the SDK's own
// `import * as fs from 'fs'` would then read the ORIGINAL get_system_id() path
// checks and throw "Unable to detect System ID on this platform". Using
// createRequire avoids creating that early facade. (Verified fix.)
const require = createRequire(import.meta.url);
const fs = require('fs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ---- personalized default system name -------------------------------------
// A brand-new user's Monitor defaults to "<First>'s Monitor" using the OS
// account's real name — macOS: `id -F` (full name); Linux: the passwd GECOS
// field; otherwise the login username. Falls back to "Arete Monitor" when
// nothing usable is found. Only ever a SEED for the (editable) Monitor name — a
// saved setting or ARETE_SYSTEM_NAME always wins.
let _firstNameMemo; // undefined = not computed; null = none; string = first name
function osFirstName() {
  if (_firstNameMemo !== undefined) return _firstNameMemo;
  _firstNameMemo = null;
  let full = '';
  try {
    if (process.platform === 'darwin') {
      full = execFileSync('id', ['-F'], { timeout: 800, encoding: 'utf8' }).trim();
    } else if (process.platform === 'linux') {
      const line = String(execFileSync('getent', ['passwd', os.userInfo().username], { timeout: 800, encoding: 'utf8' }));
      full = (line.split(':')[4] || '').split(',')[0].trim();
    }
  } catch (_) { /* command missing or denied — fall through to username */ }
  if (!full) { try { full = os.userInfo().username || ''; } catch (_) {} }
  const tok = (full.match(/[\p{L}][\p{L}'’-]*/u) || [''])[0];
  if (tok) _firstNameMemo = tok.charAt(0).toUpperCase() + tok.slice(1);
  return _firstNameMemo;
}
function defaultSystemName() {
  const fn = osFirstName();
  return fn ? `${fn}'s Monitor` : 'Arete Monitor';
}

const service = new AreteService();
let mainWindow = null;

// ---------------------------------------------------------------------------
// Small helpers: base62 IDs, a dependency-free .env reader, and JSON persistence
// under Electron's per-user userData directory.
// ---------------------------------------------------------------------------
const B62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function base62(len = 22) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += B62[bytes[i] % 62];
  return out;
}

function readEnvFile() {
  const p = path.join(ROOT, '.env');
  const env = {};
  try {
    const text = fs.readFileSync(p, 'utf8');
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    }
  } catch (_) {
    /* no .env — fine */
  }
  return env;
}

function userDataPath(name) {
  return path.join(app.getPath('userData'), name);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(userDataPath(file), 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function writeJson(file, obj) {
  try {
    fs.writeFileSync(userDataPath(file), JSON.stringify(obj, null, 2));
  } catch (e) {
    console.error('Failed to persist', file, e);
  }
}

// Stable per-install System-ID seed + Node/Context IDs.
function loadOrCreateIdentity() {
  const seedFile = 'system-id.txt';
  let seed;
  try {
    seed = fs.readFileSync(userDataPath(seedFile), 'utf8').trim();
  } catch (_) {
    seed = crypto.randomUUID();
    try {
      fs.writeFileSync(userDataPath(seedFile), seed);
    } catch (e) {
      console.error('Failed to persist system-id seed', e);
    }
  }

  const ids = readJson('identity.json', null) || {
    nodeId: base62(22),
    nodeName: 'arete-monitor',
    contextId: base62(22),
    contextName: 'Arete Monitor Context',
  };
  writeJson('identity.json', ids);

  return { seed, ids };
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 680,
    minWidth: 720,
    minHeight: 520,
    title: 'Arete Monitor',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload uses ESM import of electron; keep sandbox off
    },
  });
  mainWindow.loadFile(path.join(ROOT, 'renderer', 'index.html'));
  mainWindow.on('closed', () => (mainWindow = null));
}

// Forward service events to the renderer.
function wireServiceEvents() {
  service.on('log', (entry) => mainWindow?.webContents.send('arete:log', entry));
  service.on('status', (status) => mainWindow?.webContents.send('arete:status', status));
  service.on('keys', (keys) => mainWindow?.webContents.send('arete:keys', keys));
}

// CP registry cache. Monitor views ask for a profile by name; we fetch it once
// from cp.padi.io and cache it. Fetching in main keeps the renderer's CSP tight
// (it never talks to the network directly). Returns null on any failure so the
// UI degrades gracefully to "not in registry".
const profileCache = new Map();
async function fetchProfile(name) {
  if (!name) return null;
  if (profileCache.has(name)) return profileCache.get(name);
  try {
    const res = await fetch('https://cp.padi.io/profiles/' + encodeURIComponent(name), {
      headers: { accept: 'application/json' },
    });
    const json = res.ok ? await res.json() : null;
    profileCache.set(name, json);
    return json;
  } catch (_) {
    profileCache.set(name, null);
    return null;
  }
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  const { seed, ids } = loadOrCreateIdentity();
  installSystemIdPatch(seed); // make the SDK's System-ID stable for this install

  const env = readEnvFile();

  // Small user-preferences store (monitor name, theme). Separate from the
  // future credentials/auto-connect config.
  let settings = { monitorName: defaultSystemName(), theme: 'dark', ...readJson('settings.json', {}) };
  const saveSettings = (patch) => {
    settings = { ...settings, ...(patch || {}) };
    writeJson('settings.json', settings);
    return settings;
  };

  ipcMain.handle('arete:getSettings', () => settings);
  ipcMain.handle('arete:saveSettings', (_evt, patch) => {
    // turning "remember token" off wipes the stored (encrypted) token
    if (patch && patch.rememberToken === false) patch.tokenEnc = '';
    return saveSettings(patch);
  });

  // Decrypt the remembered per-realm token (Keychain-backed via safeStorage).
  const savedToken = () => {
    if (!settings.rememberToken || !settings.tokenEnc) return '';
    try {
      if (!safeStorage.isEncryptionAvailable()) return '';
      return safeStorage.decryptString(Buffer.from(settings.tokenEnc, 'base64'));
    } catch (_) { return ''; }
  };

  // IPC: defaults for the Connect form — the last successful connection wins,
  // then .env, then blanks. Token only if "remember token" is on.
  ipcMain.handle('arete:getDefaults', () => {
    const lc = settings.lastConnect || {};
    return {
      protocol: lc.protocol || env.ARETE_PROTOCOL || 'wss:',
      host: lc.host || env.ARETE_HOST || '',
      port: lc.port || Number(env.ARETE_PORT || 443),
      token: savedToken() || env.ARETE_TOKEN || '',
      allowSelfSigned: lc.host ? !!lc.allowSelfSigned : (env.ARETE_ALLOW_SELF_SIGNED ?? '1') === '1',
      identity: ids,
      systemSeed: seed,
      autoConnect: !!settings.autoConnect,
      rememberToken: !!settings.rememberToken,
      appVersion: app.getVersion(), // Monitor's release version (package.json)
    };
  });

  ipcMain.handle('arete:connect', async (_evt, opts) => {
    // Monitor name precedence: what the user typed > saved setting > env > default.
    const systemName =
      (opts && opts.systemName && String(opts.systemName).trim()) ||
      settings.monitorName || env.ARETE_SYSTEM_NAME || defaultSystemName();
    saveSettings({ monitorName: systemName });
    const status = await service.connect({ ...opts, systemName });
    // Remember this host (successful connects only, so typos never pile up).
    // Stores connection shape — protocol/port/TLS — never the token.
    const entry = {
      host: opts.host, protocol: opts.protocol, port: opts.port,
      allowSelfSigned: !!opts.allowSelfSigned,
      lastUsed: Date.now(),
    };
    const hosts = [entry, ...(settings.hosts || []).filter((h) => h.host !== opts.host)].slice(0, 10);
    const patch = { hosts, lastConnect: { protocol: opts.protocol, host: opts.host, port: opts.port, allowSelfSigned: !!opts.allowSelfSigned } };
    // Remember the per-realm token (encrypted via the OS keychain) only when opted in.
    if (settings.rememberToken && opts.token && safeStorage.isEncryptionAvailable()) {
      patch.tokenEnc = safeStorage.encryptString(opts.token).toString('base64');
    }
    saveSettings(patch);
    return status;
  });
  ipcMain.handle('arete:disconnect', async () => {
    await service.disconnect();
    return service.getStatus();
  });
  ipcMain.handle('arete:getStatus', () => service.getStatus());
  ipcMain.handle('arete:getKeys', () => service.getKeys());
  ipcMain.handle('arete:getProfile', (_evt, name) => fetchProfile(name));
  ipcMain.handle('arete:register', async (_evt, override) => {
    const merged = { ...ids, ...(override || {}) };
    return service.registerNodeContext(merged);
  });
  ipcMain.handle('arete:openExternal', (_evt, url) => shell.openExternal(url));

  wireServiceEvents();
  createWindow();

  // Show the Arete icon in the macOS Dock during `npm start` runs too
  // (packaged builds get it from build/icon.png via electron-builder).
  if (process.platform === 'darwin' && app.dock) {
    try { app.dock.setIcon(path.join(ROOT, 'build', 'icon.png')); } catch (_) { /* non-fatal */ }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', async () => {
  await service.disconnect().catch(() => {});
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  await service.disconnect().catch(() => {});
});
