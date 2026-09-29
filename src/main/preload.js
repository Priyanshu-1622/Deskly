// The only bridge between the 3D renderer and the main process.
const { contextBridge, ipcRenderer } = require('electron');

const call = async (ch, ...args) => {
  const r = await ipcRenderer.invoke(ch, ...args);
  if (!r.ok) { const e = new Error(r.error); e.code = r.code; throw e; }
  return r.value;
};
const api = {};
for (const ch of ['app:info', 'config:get', 'config:save', 'config:reset', 'secret:set', 'provider:test', 'workspace:choose', 'workspace:list',
  'workspace:read', 'workspace:write', 'workspace:open', 'terminal:run', 'tasks:snapshot', 'tasks:create', 'tasks:cancel', 'tasks:clear',
  'tasks:reviewed', 'approval:respond', 'memory:list', 'memory:add', 'memory:delete', 'team:updates', 'usage:get', 'audit:list', 'audit:export', 'employee:reply', 'meeting:ideas', 'assistant:chat', 'shell:external',
  'app:fullscreen', 'app:quit']) {
  const name = ch.replace(/[:](\w)/, (_, c) => c.toUpperCase());       // "config:get" -> "configGet"
  api[name] = (...a) => call(ch, ...a);
}
api.onRuntimeEvent = fn => {
  const l = (_e, evt) => fn(evt);
  ipcRenderer.on('runtime:event', l);
  return () => ipcRenderer.removeListener('runtime:event', l);
};
api.native = true;
contextBridge.exposeInMainWorld('desklyNative', api);
