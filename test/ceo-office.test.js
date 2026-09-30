const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const world = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/renderer/assets/world.json'), 'utf8'));
const context = { window: {}, atob };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/renderer/js/nav.js'), 'utf8'), context);
const nav = new context.window.DesklyNav(world.grid);

test('the entrance has a clear walkable route into the expanded CEO office', () => {
  const door = world.doors.find(d => d.axis === 'x' && d.fixed === 24.8 && d.s0 === 8);
  assert.ok(door);
  assert.ok(door.s1 - door.s0 >= 1.5);
  for (let z = 10.5; z < 24.5; z += 0.5) assert.equal(nav.blockedAt(9, z, true), false, `aisle blocked at z=${z}`);
  const route = nav.path({ x: 19.3, z: 1.3 }, { x: 5, z: 34.3 });
  assert.ok(route?.length);
  const length = route.reduce((total, point, i) => {
    const before = i ? route[i - 1] : { x: 19.3, z: 1.3 };
    return total + Math.hypot(point.x - before.x, point.z - before.z);
  }, 0);
  assert.ok(length < 52, `route is ${length.toFixed(1)} metres`);
});

test('every CEO room activity has a reachable interaction point', () => {
  const kinds = ['whiteboard', 'tvwatch', 'coffee', 'printer', 'archive', 'lamp'];
  for (const kind of kinds) {
    const marker = world.markers.find(m => m.room === 'CEO_Office' && m.kind === kind);
    assert.ok(marker, `${kind} marker missing`);
    const point = { x: marker.p[0] - marker.f[0] * 0.7, z: marker.p[2] - marker.f[1] * 0.7 };
    assert.equal(nav.blockedAt(point.x, point.z, true), false, `${kind} is blocked`);
    assert.ok(nav.path({ x: 8.6, z: 25.6 }, point)?.length, `${kind} cannot be reached`);
  }
});
