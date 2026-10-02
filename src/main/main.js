// Deskly — Electron main process.
const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, Menu, session, protocol, net, nativeTheme } = require('electron');
const { pathToFileURL } = require('url');
const fs = require('fs');
const path = require('path');
const { Store } = require('./store');
const { Runtime } = require('./runtime/runtime');
const { PROVIDERS, testProfile, endpointFor, bindTestProfile } = require('./runtime/providers');
const { Workspace } = require('./runtime/workspace');
const { validateIPC, workspacePath } = require('./ipc-validation');

const DEV = process.argv.includes('--dev');
const RENDERER = path.join(__dirname, '..', 'renderer');
const APP_URL = 'app://deskly/index.html';
// Serve the renderer from app://deskly/ so fetch() works and the CSP is 'self'.
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
let win = null, store = null, runtime = null, selectedWorkspace = null, quitting = false, rendererCrashes = [];
const operations = new Map();
function operation(fn) {
  if (quitting) throw new Error('Deskly is shutting down.');
  const controller = new AbortController(), promise = Promise.resolve().then(() => fn(controller.signal));
  operations.set(controller, promise);
  return promise.finally(() => operations.delete(controller));
}
const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.quit();
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });

function savedProfile(id) { const cfg = store.getConfig() || {}; return id === 'assistant' ? cfg.assistant : (cfg.employees || []).find(e => e.id === id); }
function chosenProject(value) {
  const real = workspacePath(value), dataPath = app.getPath('userData'), dataRoot = fs.existsSync(dataPath) ? fs.realpathSync(dataPath) : path.resolve(dataPath), relative = path.relative(dataRoot, real);
  if (!relative || (!relative.startsWith('..') && !path.isAbsolute(relative))) throw new Error('Choose a project outside Deskly’s application data folder.');
  return real;
}

function profileFor(id) {
  const cfg = store.getConfig() || {};
  const src = id === 'assistant' ? (cfg.assistant || {}) : (cfg.employees || []).find(e => e.id === id) || {};
  const selected = { ...src, provider: src.provider || 'demo' };
  let key = store.getSecret(id, selected);
  if (!key && src.keyFrom) { const owner = savedProfile(src.keyFrom); if (owner && owner.provider === src.provider && endpointFor(owner) === endpointFor(src)) key = store.getSecret(src.keyFrom, owner); }
  return { provider: src.provider || 'demo', model: src.model || '', lightweightModel: src.lightweightModel || '', baseUrl: src.baseUrl || '', apiKey: key || '' };
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 680,
    backgroundColor: '#171a15', show: !process.argv.includes('--deskly-visual-check'), title: 'Deskly',
    icon: path.join(RENDERER, 'assets', 'deskly-icon.png'),
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
  });
  win.loadURL(APP_URL);
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (url !== APP_URL) e.preventDefault(); });
  win.webContents.on('will-attach-webview', e => e.preventDefault());
  win.webContents.on('render-process-gone', (_event, details) => {
    if (quitting) return;
    rendererCrashes = rendererCrashes.filter(t => Date.now() - t < 60000); rendererCrashes.push(Date.now());
    if (rendererCrashes.length <= 2) { win.reload(); return; }
    dialog.showErrorBox('Deskly graphics stopped', `The office renderer stopped repeatedly (${details.reason}). Your project work is still in the main process. Restart Deskly and choose a lower graphics quality.`);
  });
  if (DEV) win.webContents.openDevTools({ mode: 'detach' });
}

function menu() {
  const tpl = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { label: 'Deskly', submenu: [{ label: 'Toggle full screen', accelerator: 'F11', click: () => win?.setFullScreen(!win.isFullScreen()) }, { type: 'separator' }, { role: 'quit' }] },
    { role: 'editMenu' },
    { label: 'View', submenu: [...(DEV ? [{ role: 'reload' }, { role: 'toggleDevTools', accelerator: 'F12' }] : []), { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

function wireIPC() {
  const h = (ch, fn) => ipcMain.handle(ch, async (event, ...a) => {
    try {
      if (!win || event.sender !== win.webContents || event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== APP_URL) {
        throw new Error('Refused IPC from an untrusted frame.');
      }
      validateIPC(ch, a);
      return { ok: true, value: await fn(...a) };
    }
    catch (err) { return { ok: false, error: err.message || String(err), code: err.code }; }
  });
  h('app:info', () => ({ version: app.getVersion(), platform: process.platform, encryption: store.encryptionAvailable(), providers: PROVIDERS, dataDir: app.getPath('userData') }));
  h('config:get', () => { const config = store.getConfig(), keys = Object.fromEntries(Object.keys(store.hasSecrets()).filter(id => { try { const profile = savedProfile(id); return profile && store.getSecret(id, profile); } catch { return false; } }).map(id => [id, true])); return { config, keys, notices: store.notices }; });
  h('config:save', cfg => {
    if (cfg.workspace) {
      const next = chosenProject(cfg.workspace), previous = store.getConfig()?.workspace;
      const norm = s => process.platform === 'win32' ? s.toLowerCase() : s;
      if (norm(next) !== norm(selectedWorkspace || '') && (!previous || norm(next) !== norm(chosenProject(previous)))) throw new Error('Choose the project folder with the native folder picker.');
      cfg.workspace = next;
    } else if (store.getConfig()?.workspace) throw new Error('Choose a project folder before saving.');
    return store.saveConfig(cfg);
  });
  h('config:reset', async () => { await runtime.shutdown(); store.reset(); app.relaunch(); app.quit(); return true; });
  h('data:erase', async () => {
    const result = await dialog.showMessageBox(win, { type: 'warning', title: 'Erase all Deskly data?', message: 'Erase settings, keys, memories, boards, tasks and local logs?', detail: 'Your project files will remain. Deskly will restart with a fresh office.', buttons: ['Cancel', 'Erase Deskly data'], defaultId: 0, cancelId: 0 });
    if (result.response !== 1) return false;
    if (store.getConfig()?.workspace) chosenProject(store.getConfig().workspace);
    await runtime.shutdown();
    // Erase on next launch, after Chromium closes its open database files.
    fs.writeFileSync(path.join(app.getPath('userData'), 'erase-on-start'), 'confirmed');
    app.relaunch(); app.quit(); return true;
  });
  h('secret:set', (id, value, profile) => { store.setSecret(id, value.trim(), profile); return store.hasSecrets(); });
  h('provider:test', async (profile, id) => {
    const saved = profile.keyFrom ? savedProfile(profile.keyFrom) : id && savedProfile(id);
    const ownerId = profile.keyFrom || id;
    const p = bindTestProfile(profile, saved, saved ? store.getSecret(ownerId, saved) : '');
    return operation(signal => testProfile(p, signal));
  });
  h('workspace:choose', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Choose your project folder', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled) return null;
    selectedWorkspace = chosenProject(r.filePaths[0]); return selectedWorkspace;
  });
  const ws = () => new Workspace(chosenProject(store.getConfig()?.workspace));
  h('workspace:ignore-map', () => {
    const workspace = ws(), file = workspace.resolve('.gitignore');
    const content = fs.existsSync(file) ? workspace.readFile('.gitignore', 400000) : '';
    if (!content.split(/\r?\n/).some(line => line.trim() === '/deskly.project.json')) workspace.writeFile('.gitignore', content + (content.endsWith('\n') || !content ? '' : '\n') + '/deskly.project.json\n');
    return true;
  });
  h('workspace:list', (p, depth) => ws().listDir(p || '.', depth || 3));
  h('workspace:read', p => ws().readFile(p, 400000));
  h('workspace:write', (p, c) => ws().writeFile(p, c));
  h('workspace:open', () => shell.openPath(ws().resolve('.')));
  h('terminal:run', cmd => operation(signal => ws().runCommand(cmd, { timeoutMs: 180000, founder: true, signal })));
  h('tasks:snapshot', () => runtime.snapshot());
  h('tasks:create', (employeeId, description) => runtime.create({ employeeId, description }));
  h('tasks:resume', id => runtime.resume(String(id)));
  h('tasks:cancel', id => runtime.cancel(id));
  h('tasks:clear', () => runtime.clearHistory());
  h('tasks:reviewed', id => runtime.markReviewed(id));
  h('approval:respond', (id, decision) => runtime.respondApproval(id, decision));
  h('memory:list', employeeId => {
    if (employeeId !== 'assistant' && !runtime.employee(employeeId)) throw new Error('Unknown employee');
    return runtime.team.listMemories(employeeId, store.getConfig()?.workspace);
  });
  h('memory:add', (employeeId, scope, note, kind) => {
    if (employeeId !== 'assistant' && !runtime.employee(employeeId)) throw new Error('Unknown employee');
    return runtime.team.addMemory({ employeeId, projectRoot: store.getConfig()?.workspace, scope, text: note, kind, source: 'founder' });
  });
  h('memory:delete', id => runtime.team.deleteMemory(String(id)));
  h('memory:update', (employeeId, id, patch) => runtime.team.updateMemory(String(id), employeeId, patch));
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
  h('group:list',()=>runtime.groups.list());
  h('group:start',(room,topic,ids)=>runtime.groups.create(room,topic,ids));
  h('group:get',id=>runtime.groups.snapshot(id));
  h('group:send',(id,text,responders)=>runtime.groups.send(id,text,responders));
  h('group:cancel',id=>runtime.groups.cancel(id));
  h('group:end',id=>runtime.groups.end(id));
  h('group:decision',(id,text)=>runtime.groups.decision(id,text));
  h('assistant:chat', (history, context) => runtime.assistant(history, context));
  h('shell:external', url => { if (/^https:\/\//.test(url)) shell.openExternal(url); return true; });
  h('app:fullscreen', v => { win.setFullScreen(v ?? !win.isFullScreen()); return win.isFullScreen(); });
  h('app:quit', () => app.quit());
}

app.whenReady().then(async () => {
  if (!hasLock) return;
  const dataRoot = app.getPath('userData');
  if (fs.existsSync(path.join(dataRoot, 'erase-on-start'))) {
    const resolved = workspacePath(fs.realpathSync(dataRoot));
    if (resolved === path.parse(resolved).root || resolved === require('os').homedir()) throw new Error('Unsafe data directory.');
    // Chromium owns open handles in this directory on Windows. Clear its
    // storage through Electron, and remove only Deskly's own persisted files.
    await session.defaultSession.clearStorageData();
    await session.defaultSession.clearCache();
    for (const name of fs.readdirSync(resolved)) if (/^(?:deskly-(?:config|secrets)\.json|tasks\.json|team-context\.json|project-map-approvals\.json|audit(?:\.1)?\.jsonl|deskly-errors\.log)(?:$|\.)/.test(name)) await fs.promises.rm(path.join(resolved, name), { force: true });
    await fs.promises.unlink(path.join(resolved, 'erase-on-start'));
  }
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
  const saved = store.getConfig();
  if (saved) store.bindLegacySecrets(Object.fromEntries([...(saved.employees || []).map(e => [e.id, e]), ...(saved.assistant ? [['assistant', saved.assistant]] : [])]));
  runtime = new Runtime({
    dataDir: app.getPath('userData'), getConfig: () => store.getConfig(), profileFor,
    emit: evt => { if (win && !win.isDestroyed()) win.webContents.send('runtime:event', evt); }
  });
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(wc === win?.webContents && wc.getURL() === APP_URL && (perm === 'pointerLock' || perm === 'fullscreen')));
  session.defaultSession.setPermissionCheckHandler((wc, perm, origin) => wc === win?.webContents && wc.getURL() === APP_URL && origin === 'app://deskly' && ['pointerLock', 'fullscreen'].includes(perm));
  wireIPC(); menu(); createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}).catch(err => { dialog.showErrorBox('Deskly could not start', String(err.message || err)); app.quit(); });
app.on('before-quit', event => {
  if (quitting || !runtime) return;
  event.preventDefault(); quitting = true;
  for (const controller of operations.keys()) controller.abort();
  Promise.allSettled([...operations.values()]).then(() => runtime.shutdown()).catch(() => dialog.showErrorBox('Deskly could not save', 'Some local state could not be saved. Check available disk space.')).finally(() => app.quit());
});
function unexpected(error) {
  const kind = error instanceof Error ? error.name : 'Unhandled failure';
  try { const file = path.join(app.getPath('userData'), 'deskly-errors.log'); if (fs.existsSync(file) && fs.statSync(file).size > 1000000) fs.renameSync(file, file + '.1'); fs.appendFileSync(file, `${new Date().toISOString()} ${kind}\n`); } catch {}
  if (!quitting && app.isReady()) dialog.showErrorBox('Deskly encountered a problem', 'An unexpected error occurred. Local diagnostics record the error type without prompts or keys. Restart Deskly if the office stops responding.');
}
process.on('unhandledRejection', unexpected);
process.on('uncaughtException', error => { unexpected(error); if (!quitting) app.quit(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
