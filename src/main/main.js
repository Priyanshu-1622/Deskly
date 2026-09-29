// Deskly — Electron main process.
const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, Menu, session, protocol, net, nativeTheme } = require('electron');
const { pathToFileURL } = require('url');
const fs = require('fs');
const path = require('path');
const { Store } = require('./store');
const { Runtime } = require('./runtime/runtime');
const { PROVIDERS, testProfile, chat } = require('./runtime/providers');
const { Workspace } = require('./runtime/workspace');

const DEV = process.argv.includes('--dev');
const RENDERER = path.join(__dirname, '..', 'renderer');
const APP_URL = 'app://deskly/index.html';
// Serve the renderer from app://deskly/ so fetch() works and the CSP is 'self'.
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
let win = null, store = null, runtime = null;

function profileFor(id) {
  const cfg = store.getConfig() || {};
  const src = id === 'assistant' ? (cfg.assistant || {}) : (cfg.employees || []).find(e => e.id === id) || {};
  let key = store.getSecret(id);
  if (!key && src.keyFrom) key = store.getSecret(src.keyFrom);             // "use the same key as …"
  return { provider: src.provider || 'demo', model: src.model || '', lightweightModel: src.lightweightModel || '', baseUrl: src.baseUrl || '', apiKey: key || '' };
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 680,
    backgroundColor: '#171a15', show: true, title: 'Deskly',
    icon: path.join(RENDERER, 'assets', 'deskly-icon.png'),
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
  });
  win.loadURL(APP_URL);
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (url !== APP_URL) e.preventDefault(); });
  if (DEV) win.webContents.openDevTools({ mode: 'detach' });
}

function menu() {
  const tpl = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { label: 'Deskly', submenu: [{ label: 'Toggle full screen', accelerator: 'F11', click: () => win?.setFullScreen(!win.isFullScreen()) }, { type: 'separator' }, { role: 'quit' }] },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'reload', visible: DEV }, { role: 'toggleDevTools', accelerator: 'F12' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

function wireIPC() {
  const h = (ch, fn) => ipcMain.handle(ch, async (event, ...a) => {
    try {
      if (!win || event.sender !== win.webContents || event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== APP_URL) {
        throw new Error('Refused IPC from an untrusted frame.');
      }
      return { ok: true, value: await fn(...a) };
    }
    catch (err) { return { ok: false, error: err.message || String(err), code: err.code }; }
  });
  h('app:info', () => ({ version: app.getVersion(), platform: process.platform, encryption: store.encryptionAvailable(), providers: PROVIDERS, dataDir: app.getPath('userData') }));
  h('config:get', () => ({ config: store.getConfig(), keys: store.hasSecrets() }));
  h('config:save', cfg => store.saveConfig(cfg));
  h('config:reset', () => { store.reset(); return true; });
  h('secret:set', (id, value) => { store.setSecret(id, String(value || '').trim()); return store.hasSecrets(); });
  h('provider:test', async (profile, id) => {
    const p = { ...profile };
    if (!p.apiKey && id) p.apiKey = store.getSecret(id) || (p.keyFrom ? store.getSecret(p.keyFrom) : '');
    return testProfile(p);
  });
  h('workspace:choose', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Choose your project folder', properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  const ws = () => new Workspace(store.getConfig()?.workspace);
  h('workspace:list', (p, depth) => ws().listDir(p || '.', depth || 3));
  h('workspace:read', p => ws().readFile(p, 400000));
  h('workspace:write', (p, c) => ws().writeFile(p, c));
  h('workspace:open', () => shell.openPath(ws().resolve('.')));
  h('terminal:run', cmd => ws().runCommand(String(cmd), { timeoutMs: 180000 }));   // user typed it on their own laptop
  h('tasks:snapshot', () => runtime.snapshot());
  h('tasks:create', (employeeId, description) => runtime.create({ employeeId, description }));
  h('tasks:cancel', id => runtime.cancel(id));
  h('tasks:clear', () => runtime.clearHistory());
  h('tasks:reviewed', id => runtime.markReviewed(id));
  h('approval:respond', (id, decision) => runtime.respondApproval(id, decision));
  h('memory:list', employeeId => {
    if (employeeId !== 'assistant' && !runtime.employee(employeeId)) throw new Error('Unknown employee');
    return runtime.team.memoriesFor(employeeId, store.getConfig()?.workspace, 50);
  });
  h('memory:add', (employeeId, scope, note) => {
    if (employeeId !== 'assistant' && !runtime.employee(employeeId)) throw new Error('Unknown employee');
    return runtime.team.addMemory({ employeeId, projectRoot: store.getConfig()?.workspace, scope, text: note, source: 'founder' });
  });
  h('memory:delete', id => runtime.team.deleteMemory(String(id)));
  h('team:updates', () => runtime.team.recentUpdates(store.getConfig()?.workspace));
  h('usage:get', () => runtime.team.usage());
  h('audit:list', n => runtime.audit(n || 300));
  h('audit:export', async () => {
    const r = await dialog.showSaveDialog(win, { title: 'Export audit log', defaultPath: 'deskly-audit.json' });
    if (r.canceled) return null;
    require('fs').writeFileSync(r.filePath, JSON.stringify(runtime.audit(100000), null, 2));
    return r.filePath;
  });
  h('employee:reply', (id, ctx, history) => runtime.reply(id, ctx, history));
  h('meeting:ideas', (topic, people) => runtime.meetingIdeas(topic, people));
  h('assistant:chat', (history, context) => runtime.assistant(history, context));
  h('shell:external', url => { if (/^https:\/\//.test(url)) shell.openExternal(url); return true; });
  h('app:fullscreen', v => { win.setFullScreen(v ?? !win.isFullScreen()); return win.isFullScreen(); });
  h('app:quit', () => app.quit());
}

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark';
  protocol.handle('app', req => {
    try {
      const url = new URL(req.url);
      if (url.host !== 'deskly') throw new Error('Unknown host');
      const file = path.resolve(RENDERER, '.' + decodeURIComponent(url.pathname));
      const realRoot = fs.realpathSync(RENDERER);
      const realFile = fs.realpathSync(file);
      const relative = path.relative(realRoot, realFile);
      if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.statSync(realFile).isFile()) throw new Error('Outside renderer');
      return net.fetch(pathToFileURL(realFile).toString());
    } catch { return new Response('Not found', { status: 404 }); }
  });
  store = new Store(app.getPath('userData'), safeStorage);
  runtime = new Runtime({
    dataDir: app.getPath('userData'), getConfig: () => store.getConfig(), profileFor,
    emit: evt => { if (win && !win.isDestroyed()) win.webContents.send('runtime:event', evt); }
  });
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(wc === win?.webContents && wc.getURL() === APP_URL && (perm === 'pointerLock' || perm === 'fullscreen')));
  wireIPC(); menu(); createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
