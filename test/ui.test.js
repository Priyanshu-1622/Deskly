const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('closing an employee panel returns keyboard and mouse control to the office', () => {
  const panel = { hidden: false };
  const active = { blurred: false, blur() { this.blurred = true; } };
  const canvas = { focused: false, locked: false, focus() { this.focused = true; }, requestPointerLock() { this.locked = true; return Promise.resolve(); } };
  const document = { activeElement: active, querySelector: selector => selector === '#panel' ? panel : null };
  const window = {};
  const source = fs.readFileSync(path.join(__dirname, '../src/renderer/js/ui.js'), 'utf8');
  vm.runInNewContext(source, { window, document, THREE: {} });
  const ui = Object.create(window.DesklyUI.prototype);
  ui.app = { playing: true, player: { touch: false }, renderer: { domElement: canvas } };
  ui.panelEmp = null;
  ui.close();
  assert.equal(panel.hidden, true);
  assert.equal(active.blurred, true);
  assert.equal(canvas.focused, true);
  assert.equal(canvas.locked, true);
});

test('a panel update error does not stop the office frame loop', () => {
  const window = {};
  const source = fs.readFileSync(path.join(__dirname, '../src/renderer/js/ui.js'), 'utf8');
  vm.runInNewContext(source, { window, THREE: {}, console: { error() {} } });
  const ui = Object.create(window.DesklyUI.prototype);
  const shown = [];
  ui.toast = message => shown.push(message);
  ui.onRender = () => { throw new Error('bad panel data'); };
  assert.doesNotThrow(() => ui.tick());
  assert.equal(ui.onRender, null);
  assert.equal(shown.length, 1);
});
