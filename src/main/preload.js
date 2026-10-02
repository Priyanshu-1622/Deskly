// The only bridge between the 3D renderer and the main process.
const { contextBridge, ipcRenderer } = require('electron');

const call = async (ch, ...args) => {
  const r = await ipcRenderer.invoke(ch, ...args);
  if (!r.ok) { const e = new Error(r.error); e.code = r.code; throw e; }
  return r.value;
};
const api = {};
for (const ch of ['app:info', 'updates:status', 'updates:check', 'updates:install', 'config:get', 'config:save', 'config:reset', 'data:erase', 'secret:set', 'provider:test', 'workspace:choose', 'workspace:ignore-map', 'workspace:list',
  'workspace:read', 'workspace:write', 'workspace:editor-read', 'workspace:editor-list', 'workspace:editor-save', 'workspace:open', 'terminal:run', 'tasks:snapshot', 'tasks:create', 'tasks:resume', 'tasks:cancel', 'tasks:clear',
  'tasks:reviewed', 'approval:respond', 'memory:list', 'memory:add', 'memory:update', 'memory:delete', 'team:updates', 'usage:get', 'audit:list', 'audit:export', 'employee:reply', 'meeting:ideas', 'meeting:cancel', 'assistant:chat', 'shell:external',
  'group:list','group:start','group:get','group:send','group:cancel','group:end','group:delete','group:decision','diagnostics:export', 'app:fullscreen', 'app:quit']) {
  const name = ch.replace(/[:-](\w)/g, (_, c) => c.toUpperCase());
  api[name] = (...a) => call(ch, ...a);
}
api.onRuntimeEvent = fn => {
  const l = (_e, evt) => fn(evt);
  ipcRenderer.on('runtime:event', l);
  return () => ipcRenderer.removeListener('runtime:event', l);
};
api.native = true;
api.onUpdatesChanged = fn => {
  const listener = (_event, state) => fn(state);
  ipcRenderer.on('updates:changed', listener);
  return () => ipcRenderer.removeListener('updates:changed', listener);
};
contextBridge.exposeInMainWorld('desklyNative', api);
