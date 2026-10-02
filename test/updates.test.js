const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Updates } = require('../src/main/updates');
const { validateIPC } = require('../src/main/ipc-validation');
function setup(options = {}) {
  const updater = new EventEmitter(); updater.checkForUpdates = async () => updater.emit('update-not-available');
  const order = []; updater.quitAndInstall = () => order.push('install');
  const service = new Updates({ updater, enabled: true, confirm: async () => true, prepare: async () => order.push('saved'), ...options });
  return { updater, service, order };
}
test('updates cannot install during work or without restart confirmation; save precedes install', async () => {
  let busy = true, confirm = false;
  const { updater, service, order } = setup({ busy: () => busy, confirm: async () => confirm });
  updater.emit('update-downloaded', { version: '0.2.0' });
  await assert.rejects(service.install(), /active tasks/);
  busy = false; assert.equal(await service.install(), false); assert.deepEqual(order, []);
  confirm = true; assert.equal(await service.install(), true); assert.deepEqual(order, ['saved','install']);
  assert.equal(updater.autoInstallOnAppQuit, false); assert.equal(updater.allowDowngrade, false);
});
test('update confirmation rechecks activity and failed save prevents installation', async () => {
  let busy = false;
  const { updater, service, order } = setup({ busy: () => busy, confirm: async () => { busy = true; return true; } });
  updater.emit('update-downloaded', { version: '0.2.0' });
  await assert.rejects(service.install(), /Work started/); assert.deepEqual(order, []);
  busy = false; service.confirm = async () => true; service.prepare = async () => { throw Error('Disk full'); };
  await assert.rejects(service.install(), /Disk full/); assert.deepEqual(order, []);
});
test('update checks coalesce and offline errors remain recoverable without private details', async () => {
  const { updater, service } = setup(); let complete, checks = 0;
  updater.checkForUpdates = () => { checks++; return new Promise(resolve => { complete = resolve; }); };
  const a = service.check(), b = service.check(); await Promise.resolve(); assert.equal(checks, 1);
  complete(); await Promise.all([a,b]);
  updater.checkForUpdates = async () => { throw Error('private-path-or-token'); };
  assert.equal((await service.check()).status, 'error'); assert.ok(!JSON.stringify(service.snapshot()).includes('private-path'));
  updater.checkForUpdates = async () => updater.emit('update-not-available');
  assert.equal((await service.check()).status, 'current');
});
test('source updates are disabled and update IPC accepts no feed or installer arguments', async () => {
  const { service, order } = setup({ enabled: false });
  assert.equal((await service.check()).status, 'unavailable'); assert.equal(await service.install(), false); assert.deepEqual(order, []);
  for (const channel of ['updates:status','updates:check','updates:install']) {
    validateIPC(channel, []); assert.throws(() => validateIPC(channel, ['https://attacker.example']), /unexpected arguments/);
  }
});
