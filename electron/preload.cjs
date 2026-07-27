// preload.cjs — the ONLY bridge between the sandboxed renderer and the main
// process. Exposes a small, explicit `window.arete` API over contextBridge.
// CommonJS (.cjs) so it loads synchronously regardless of package "type".

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('arete', {
  // request/response
  getDefaults: () => ipcRenderer.invoke('arete:getDefaults'),
  connect: (opts) => ipcRenderer.invoke('arete:connect', opts),
  recallHost: (host) => ipcRenderer.invoke('arete:recallHost', host),
  disconnect: () => ipcRenderer.invoke('arete:disconnect'),
  getStatus: () => ipcRenderer.invoke('arete:getStatus'),
  register: (override) => ipcRenderer.invoke('arete:register', override),
  openExternal: (url) => ipcRenderer.invoke('arete:openExternal', url),

  // user preferences (monitor name, theme)
  getSettings: () => ipcRenderer.invoke('arete:getSettings'),
  saveSettings: (patch) => ipcRenderer.invoke('arete:saveSettings', patch),

  // live monitor data layer
  getKeys: () => ipcRenderer.invoke('arete:getKeys'),
  getProfile: (name) => ipcRenderer.invoke('arete:getProfile', name),
  onKeys: (cb) => {
    const h = (_e, keys) => cb(keys);
    ipcRenderer.on('arete:keys', h);
    return () => ipcRenderer.removeListener('arete:keys', h);
  },

  // subscriptions (main -> renderer). Return an unsubscribe fn.
  onLog: (cb) => {
    const h = (_e, entry) => cb(entry);
    ipcRenderer.on('arete:log', h);
    return () => ipcRenderer.removeListener('arete:log', h);
  },
  onStatus: (cb) => {
    const h = (_e, status) => cb(status);
    ipcRenderer.on('arete:status', h);
    return () => ipcRenderer.removeListener('arete:status', h);
  },
});
