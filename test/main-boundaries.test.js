const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { createRequire } = require('node:module');
const { Store } = require('../src/main/store');
const pause = ms => new Promise(r => setTimeout(r, ms));
async function mainHarness(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deskly-main-')), data = path.join(root, 'data'), project = path.join(root, 'project'); fs.mkdirSync(project);
  const safe = { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s), decryptString: b => b.toString() };
  const initial = { workspace: project, founder: 'Test', company: 'Test', employees: [{ id: 'dev', name: 'Dev', role: 'Developer', provider: 'openai' }], assistant: { provider: 'openai' }, security: { approveWrites: false } };
  const storage = new Store(data, safe); storage.saveConfig(initial); storage.setSecret('dev', 'original-key', initial.employees[0]); storage.setSecret('assistant', 'shared-key', initial.assistant);
  if (options.corruptTeam) { fs.writeFileSync(path.join(data, 'team-context.json'), '{'); fs.writeFileSync(path.join(data, 'team-context.json.bak'), 'broken'); }
  if (options.erase) { for (const name of ['group-conversations.json', 'group-conversations.json.bak', 'group-conversations.json.corrupt-old', 'group-conversations.json.42.tmp']) fs.writeFileSync(path.join(data, name), 'private conversation'); fs.writeFileSync(path.join(data, 'keep.txt'), 'untouched'); fs.writeFileSync(path.join(data, 'erase-on-start'), 'confirmed'); }
  const app = new EventEmitter(); let stopped = false; app.getPath = () => data; app.getVersion = () => 'test'; app.isReady = () => true; app.requestSingleInstanceLock = () => options.lock !== false; app.whenReady = () => Promise.resolve(); app.quit = () => { const event = { prevented: false, preventDefault() { this.prevented = true; } }; app.emit('before-quit', event); if (!event.prevented) stopped = true; }; app.relaunch = () => {};
  let window;
  class BrowserWindow extends EventEmitter {
    constructor() { super(); window = this; this.webContents = new EventEmitter(); this.webContents.mainFrame = { url: 'app://deskly/index.html' }; Object.assign(this.webContents, { getURL: () => this.webContents.mainFrame.url, setWindowOpenHandler: () => {}, send: () => {} }); }
    loadURL() {} isDestroyed() { return false; } setFullScreen() {} isFullScreen() { return false; } isMinimized() { return false; } focus() {} show() {} reload() { this.reloaded = (this.reloaded || 0) + 1; }
    static getAllWindows() { return [window]; }
  }
  const handlers = new Map(), errors = [], dialog = { showErrorBox: (...a) => errors.push(a), showOpenDialog: async () => ({ canceled: false, filePaths: [project] }) };
  const session = { defaultSession: { setPermissionRequestHandler() {}, setPermissionCheckHandler() {}, async clearStorageData() {}, async clearCache() {} } };
  const electron = { app, BrowserWindow, ipcMain: { handle: (ch, fn) => handlers.set(ch, fn) }, dialog, shell: {}, safeStorage: safe, Menu: { buildFromTemplate: x => x, setApplicationMenu() {} }, session, protocol: { registerSchemesAsPrivileged() {}, handle() {} }, net: {}, nativeTheme: {} };
  const mainPath = path.resolve(__dirname, '../src/main/main.js'), nativeRequire = createRequire(mainPath);
  const context = { require: name => name === 'electron' ? electron : nativeRequire(name), __dirname: path.dirname(mainPath), process: { platform: process.platform, argv: [], on() {} }, URL, Response, AbortController, console };
  vm.runInNewContext(fs.readFileSync(mainPath, 'utf8'), context);
  for (let i = 0; i < 50 && !handlers.size; i++) await pause(5);
  assert.equal(errors.length, 0);
  const call = (ch, ...args) => handlers.get(ch)({ sender: window.webContents, senderFrame: window.webContents.mainFrame }, ...args);
  return { call, root, data, project, app, dialog, initial, stopped: () => stopped, window, errors, handlers };
}
test('erase removes discussion persistence siblings and leaves unrelated files intact', async () => {
  const harness = await mainHarness({ erase: true });
  for (const name of fs.readdirSync(harness.data).filter(name => name.startsWith('group-conversations'))) { assert.equal(name, 'group-conversations.json'); assert.deepEqual(JSON.parse(fs.readFileSync(path.join(harness.data, name))), []); }
  assert.equal(fs.readFileSync(path.join(harness.data, 'keep.txt'), 'utf8'), 'untouched');
  assert.equal(fs.existsSync(path.join(harness.data, 'erase-on-start')), false); harness.app.quit();
});
test('missing project does not block unrelated settings or confirmed data erase', async () => {
  const harness = await mainHarness(); fs.rmdirSync(harness.project);
  assert.equal((await harness.call('config:save', { ...harness.initial, settings: { quality: 'low' } })).ok, true);
  harness.dialog.showMessageBox = async () => ({ response: 1 });
  assert.equal((await harness.call('data:erase')).value, true);
  assert.equal(fs.existsSync(path.join(harness.data, 'erase-on-start')), true);
});
test('full IPC settings/test flow cannot redirect an existing key; safe unsaved reuse works', async t => {
  const harness = await mainHarness(), requests = [];
  t.mock.method(global, 'fetch', async (url, options) => { requests.push({ url, headers: options.headers }); return new Response(JSON.stringify({ choices: [{ message: { content: 'ready' } }] })); });
  const forged = { provider: 'custom', baseUrl: 'https://evil.example/v1' };
  assert.equal((await harness.call('config:save', { ...harness.initial, employees: [{ ...harness.initial.employees[0], ...forged }] })).ok, true);
  assert.equal((await harness.call('provider:test', forged, 'dev')).ok, true); assert.equal(requests[0].headers.authorization, undefined);
  const reuse = { provider: 'openai', keyFrom: 'assistant' };
  assert.equal((await harness.call('provider:test', reuse, 'new_employee')).ok, true); assert.equal(requests[1].headers.authorization, 'Bearer shared-key');
  assert.equal((await harness.call('provider:test', { ...forged, keyFrom: 'assistant' }, 'new_employee')).ok, true); assert.equal(requests[2].headers.authorization, undefined);
  harness.app.quit(); for (let i = 0; i < 100 && !harness.stopped(); i++) await pause(10); assert.equal(harness.stopped(), true);
});
test('IPC accepts only chooser-confirmed workspace changes and denies foreign frames', async () => {
  const harness = await mainHarness(), next = path.join(harness.root, 'next'); fs.mkdirSync(next);
  assert.equal((await harness.call('config:save', { ...harness.initial, workspace: next })).ok, false);
  harness.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [next] }); assert.equal((await harness.call('workspace:choose')).value, next);
  assert.equal((await harness.call('config:save', { ...harness.initial, workspace: next })).ok, true);
  assert.equal((await harness.call('config:save', { ...harness.initial, workspace: os.homedir() })).ok, false);
  const denied = await harness.handlers.get('config:get')({ sender: harness.window.webContents, senderFrame: { url: 'app://deskly/index.html' } }); assert.equal(denied.ok, false);
  harness.app.quit(); for (let i = 0; i < 100 && !harness.stopped(); i++) await pause(10);
});
test('quitting stops founder terminal descendants before they can write after exit', async () => {
  const harness = await mainHarness();
  const command = `node -e "setTimeout(()=>require('fs').writeFileSync('quit-marker','alive'),1800)"`;
  const running = harness.call('terminal:run', command); await pause(200); harness.app.quit();
  const result = await running; assert.match(result.value.stderr, /cancelled/);
  for (let i = 0; i < 100 && !harness.stopped(); i++) await pause(10); assert.equal(harness.stopped(), true);
  await pause(1900); assert.equal(fs.existsSync(path.join(harness.project, 'quit-marker')), false);
});
test('a second instance exits without opening a window or writing state', async () => {
  const harness = await mainHarness({ lock: false }); assert.equal(harness.stopped(), true); assert.equal(harness.handlers.size, 0); assert.equal(harness.window, undefined);
});
test('damaged team data allows startup and reports preserved files; renderer crash reload is bounded', async () => {
  const harness = await mainHarness({ corruptTeam: true }); assert.ok(harness.window); const snapshot = await harness.call('tasks:snapshot'); assert.equal(snapshot.value.notices.length, 2);
  for (let i = 0; i < 3; i++) harness.window.webContents.emit('render-process-gone', {}, { reason: 'crashed' }); assert.equal(harness.window.reloaded, 2); assert.equal(harness.errors.length, 1);
  harness.app.quit(); for (let i = 0; i < 100 && !harness.stopped(); i++) await pause(10);
});
