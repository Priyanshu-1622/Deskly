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

test('a full boardroom meeting reserves the founder chair and keeps overflow off the table', () => {
  const window = {};
  const source = fs.readFileSync(path.join(__dirname, '../src/renderer/js/agents.js'), 'utf8');
  vm.runInNewContext(source, {
    window, THREE: {}, DesklyPresets: { DEPARTMENTS: {} },
    setTimeout: fn => fn()
  });
  const chairs = [
    { kind: 'chair', room: 'Boardroom', p: [11.1, 0, 32.2], f: [1, 0] },
    ...Array.from({ length: 10 }, (_, i) => ({ kind: 'chair', room: 'Boardroom', p: [12 + Math.floor(i / 2), 0, i % 2 ? 33.6 : 30.8], f: [0, i % 2 ? -1 : 1] }))
  ];
  const people = Array.from({ length: 15 }, (_, i) => ({
    id: String(i), clear() {}, say() {}, goDesk() {},
    approach: seat => ({ x: seat.p[0] - seat.f[0] * 0.62, z: seat.p[2] - seat.f[1] * 0.62 }),
    push(...actions) { this.actions = actions; }
  }));
  const office = Object.create(window.DesklyAgents.Office.prototype);
  office.chairs = chairs;
  office.ctx = { time: 0, player: { seated: false } };
  office.meeting = null;
  const meeting = office.callMeeting('Boardroom', people, 'Project kickoff');
  assert.equal(meeting.playerSeat, chairs[0]);
  assert.equal(people.filter(e => e.meetSeat).length, 10);
  assert.ok(people.every(e => e.meetSeat !== chairs[0]));
  assert.ok(people.filter(e => !e.meetSeat).every(e => e.actions.find(a => a.type === 'goto').z < 30));

  const chosenChair = chairs[4];
  const nextOffice = Object.create(window.DesklyAgents.Office.prototype);
  nextOffice.chairs = chairs;
  nextOffice.ctx = { time: 0, player: { seated: true, seat: chosenChair } };
  nextOffice.meeting = null;
  const next = nextOffice.callMeeting('Boardroom', people, 'Review');
  assert.equal(next.playerSeat, chosenChair);
  assert.ok(people.every(e => e.meetSeat !== chosenChair));
});
