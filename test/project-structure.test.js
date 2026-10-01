const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Workspace } = require('../src/main/runtime/workspace');
const { inspect, areaFor, allowNewFile, guidance } = require('../src/main/runtime/project-structure');
const { Runtime } = require('../src/main/runtime/runtime');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'deskly-layout-'));

test('a new project gets one editable map and separate role homes', () => {
  const root = tmp(), ws = new Workspace(root);
  const map = inspect(ws);
  assert.equal(map.areas.frontend, 'frontend');
  assert.equal(map.areas.backend, 'backend');
  assert.ok(fs.statSync(path.join(root, 'frontend')).isDirectory());
  assert.ok(fs.statSync(path.join(root, 'backend')).isDirectory());
  assert.ok(fs.existsSync(path.join(root, 'deskly.project.json')));
  assert.equal(areaFor('Frontend Developer', 'Build a page'), 'frontend');
  assert.equal(areaFor('Developer', 'Implement API'), 'backend');
  assert.ok(allowNewFile(map, 'frontend', 'frontend/src/App.tsx'));
  assert.ok(!allowNewFile(map, 'frontend', 'backend/server.ts'));
  assert.match(guidance(map, 'backend'), /one shared project root/i);
});

test('existing structure is adopted without moving current files', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'apps', 'web'), { recursive: true });
  fs.mkdirSync(path.join(root, 'apps', 'api'), { recursive: true });
  fs.writeFileSync(path.join(root, 'README.md'), 'existing');
  const map = inspect(new Workspace(root));
  assert.equal(map.areas.frontend, 'apps/web');
  assert.equal(map.areas.backend, 'apps/api');
  assert.equal(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), 'existing');
  assert.equal(inspect(new Workspace(root)).areas.backend, 'apps/api');
});

test('new files outside an employee area are refused while existing integration files can be edited', async () => {
  const root = tmp(), cfg = { workspace: root, employees: [{ id: 'front', name: 'A', role: 'Frontend Developer' }] };
  const rt = new Runtime({ dataDir: tmp(), getConfig: () => cfg, profileFor: () => ({ provider: 'demo' }), emit: () => {} });
  const task = { employeeId: 'front', employeeName: 'A', role: 'Frontend Developer', provider: 'openai', projectId: rt.team.projectId(root), projectMap: inspect(new Workspace(root)), workArea: 'frontend', claimedFiles: [], files: [], logs: [] };
  const ws = new Workspace(root);
  const refused = await rt.tool(task, ws, { name: 'write_file', args: { path: 'backend/server.js', content: 'x' } });
  assert.match(refused, /No file was written/);
  assert.equal(fs.existsSync(path.join(root, 'backend', 'server.js')), false);
  const written = await rt.tool(task, ws, { name: 'write_file', args: { path: 'frontend/App.js', content: 'ok' } });
  assert.match(written, /Wrote frontend\/App.js/);
  fs.writeFileSync(path.join(root, 'backend', 'existing.js'), 'old');
  const edited = await rt.tool(task, ws, { name: 'write_file', args: { path: 'backend/existing.js', content: 'new' } });
  assert.match(edited, /Wrote backend\/existing.js/);
});
