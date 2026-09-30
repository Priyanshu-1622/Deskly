const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const window = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/renderer/js/office-time.js'), 'utf8'), { window, Intl, Date, Math });
const time = window.DesklyOfficeTime;

test('office clock follows the selected region, weekday, and daylight saving time', () => {
  const instant = new Date('2026-09-30T12:00:00.000Z');
  const india = time.info(instant, 'Asia/Kolkata');
  const newYork = time.info(instant, 'America/New_York');
  assert.equal(india.time, '17:30');
  assert.equal(india.weekday, 'Wed');
  assert.equal(india.offsetMinutes, 330);
  assert.equal(newYork.time, '08:00');
  assert.equal(newYork.offsetMinutes, -240);
  assert.equal(time.info(new Date('2026-12-30T12:00:00.000Z'), 'America/New_York').offsetMinutes, -300);
  const tomorrow = time.info(new Date('2026-09-30T23:00:00.000Z'), 'Asia/Tokyo');
  assert.equal(tomorrow.dateKey, '2026-10-01');
  assert.equal(tomorrow.weekday, 'Thu');
});

test('sun is above the horizon at local midday and below it at midnight', () => {
  const noon = time.solar(time.info(new Date('2026-09-30T06:30:00.000Z'), 'Asia/Kolkata'));
  const midnight = time.solar(time.info(new Date('2026-09-30T18:30:00.000Z'), 'Asia/Kolkata'));
  assert.ok(noon.elevation > 45);
  assert.ok(midnight.elevation < -45);
  assert.ok(noon.sun.y > 0 && midnight.moon.y > 0);
});

test('employees leave in stages while active tasks and overtime keep them present', () => {
  const agentsWindow = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/renderer/js/agents.js'), 'utf8'), {
    window: agentsWindow, THREE: {}, DesklyPresets: { DEPARTMENTS: {} }, setTimeout: () => 1
  });
  const makeEmployee = id => ({ id, present: true, errand: null, meeting: null, interacting: false,
    activity: 'At desk', posture: 'sit', sitSeat: {}, rig: { root: { visible: true }, cup: { visible: false }, phone: { visible: false } },
    clear() { this.actions = []; }, push(...actions) { this.actions = (this.actions || []).concat(actions); },
    goDesk() { this.push({ type: 'goto', x: 8, z: 16 }); },
    say() {}, spawnAt(x, z) { this.present = true; this.position = [x, z]; } });
  const first = makeEmployee('first'), second = makeEmployee('second');
  const active = new Set();
  const saved = { state: {}, save() {} };
  const office = Object.create(agentsWindow.DesklyAgents.Office.prototype);
  office.employees = [first, second]; office.arrivals = [];
  office.shift = { dateKey: '2026-09-30', overtime: [], recalled: [], sentHome: [] };
  office.ctx = { clockInfo: { dateKey: '2026-09-30', workday: true, hour: 18, minute: 0 },
    runtime: { activeFor: id => active.has(id) ? { status: 'running' } : null }, life: saved };
  office.syncShift();
  assert.equal(first.errand, 'leaving');
  assert.equal(second.errand, null);
  office.ctx.clockInfo.minute = 3;
  active.add('second'); office.syncShift();
  assert.equal(second.errand, null);
  active.delete('second'); office.setOvertime(second, true);
  office.syncShift();
  assert.equal(second.errand, null);
  office.setOvertime(second, false);
  assert.equal(second.errand, 'leaving');
  second.present = false;
  office.recall(second);
  assert.equal(second.present, true);
  assert.equal(second.posture, 'stand');
  assert.deepEqual(second.position, [20, -7.4]);
  assert.ok(office.shift.recalled.includes('second'));
  office.recall(first);
  office.ctx.clockInfo = { dateKey: '2026-10-01', workday: true, hour: 0, minute: 2 };
  office.syncShift(true);
  assert.ok(office.shift.recalled.includes('first'));
  assert.ok(office.shift.recalled.includes('second'));
  assert.equal(first.errand, null);
  assert.equal(second.present, true);
  const restored = agentsWindow.DesklyAgents.shiftState(saved.state.shift, '2026-10-02');
  assert.ok(restored.recalled.includes('first'));
  assert.ok(restored.recalled.includes('second'));
  office.release(first);
  assert.ok(office.shift.sentHome.includes('first'));
  assert.ok(!office.shift.recalled.includes('first'));
  assert.equal(first.errand, 'leaving');
  const nextDay = agentsWindow.DesklyAgents.shiftState(office.shift, '2026-10-02');
  assert.equal(nextDay.sentHome.length, 0);
  assert.ok(nextDay.recalled.includes('second'));
});
