const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { Runtime } = require('../src/main/runtime/runtime');
const { Workspace } = require('../src/main/runtime/workspace');
const { Store } = require('../src/main/store');
const { TeamContext } = require('../src/main/runtime/team-context');
const { forRole } = require('../src/renderer/js/role-prompts');
const { forRole: resumeForRole, forEmployee: resumeForEmployee } = require('../src/renderer/js/resumes');
const { parseJSON, chat, PROVIDERS } = require('../src/main/runtime/providers');

test('Gemini uses a current free-tier model and its documented compatibility endpoint', async t => {
  assert.equal(PROVIDERS.gemini.defaultModel, 'gemini-3.5-flash-lite');
  let request;
  t.mock.method(globalThis, 'fetch', async (url, opts) => {
    request = { url, opts };
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ready' } }] }), { status: 200 });
  });
  const answer = await chat({ provider: 'gemini', apiKey: 'test-key' }, { system: 'Be brief.', messages: [{ role: 'user', content: 'Hello' }] });
  assert.equal(answer, 'ready');
  assert.equal(request.url, 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
  assert.equal(JSON.parse(request.opts.body).model, 'gemini-3.5-flash-lite');
});

test('Gemini model 404 explains how to change the saved model', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: { message: 'Model not found' } }), { status: 404 }));
  await assert.rejects(chat({ provider: 'gemini', model: 'gemini-2.5-flash', apiKey: 'test-key' }, { system: '', messages: [] }), /set Model to gemini-3\.5-flash-lite/);
});

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'deskly-'));

test('workspace refuses paths outside the project', () => {
  const ws = new Workspace(tmp());
  assert.throws(() => ws.resolve('../etc/passwd'), /outside the project/);
  assert.throws(() => ws.readFile('.env'), /./);
  ws.writeFile('a/b.txt', 'hi');
  assert.equal(ws.readFile('a/b.txt'), 'hi');
});

test('workspace blocks secret files on both reads and writes', () => {
  const ws = new Workspace(tmp());
  assert.throws(() => ws.writeFile('.env.local', 'TOKEN=x'), /may contain secrets/);
  assert.throws(() => ws.writeFile('nested/.npmrc', 'token=x'), /may contain secrets/);
  assert.throws(() => ws.readFile('.env.local'), /may contain secrets/);
});

test('workspace refuses a link that escapes the project', t => {
  const root = tmp(), outside = tmp();
  fs.writeFileSync(path.join(outside, 'private.txt'), 'secret');
  try { fs.symlinkSync(outside, path.join(root, 'link'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (e) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(e.code)) return t.skip('links unavailable on this machine'); throw e; }
  const ws = new Workspace(root);
  assert.throws(() => ws.readFile('link/private.txt'), /symbolic link/);
  assert.throws(() => ws.writeFile('link/new.txt', 'x'), /symbolic link/);
  assert.equal(fs.existsSync(path.join(outside, 'new.txt')), false);
});

test('workspace bounds reads and writes', () => {
  const ws = new Workspace(tmp());
  ws.writeFile('large.txt', 'a'.repeat(1000));
  assert.match(ws.readFile('large.txt', 10), /^a{10}\n…\[truncated, 1000 bytes total\]$/);
  assert.throws(() => ws.writeFile('too-large.txt', 'a'.repeat(1000001)), /1 MB limit/);
});

test('API keys require encrypted storage', () => {
  const dir = tmp(), store = new Store(dir, { isEncryptionAvailable: () => false });
  assert.throws(() => store.setSecret('employee', 'sensitive'), /Secure key storage/);
  assert.equal(fs.existsSync(store.secPath), false);
  fs.writeFileSync(store.secPath, JSON.stringify({ legacy: { enc: false, v: Buffer.from('old-key').toString('base64') } }));
  assert.equal(store.getSecret('legacy'), null);
  assert.deepEqual(store.hasSecrets(), {});
});

test('API keys round-trip through secure storage only', () => {
  const safe = {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'gnome_libsecret',
    encryptString: value => Buffer.from('encrypted:' + value),
    decryptString: value => value.toString().replace(/^encrypted:/, '')
  };
  const dir = tmp(), store = new Store(dir, safe);
  store.setSecret('employee', 'private-key');
  assert.equal(store.getSecret('employee'), 'private-key');
  assert.equal(new Store(dir, safe).getSecret('employee'), 'private-key');
  assert.deepEqual(store.hasSecrets(), { employee: true });
  assert.equal(fs.readFileSync(store.secPath, 'utf8').includes('private-key'), false);
});

test('plaintext fallback backend cannot store API keys', () => {
  const store = new Store(tmp(), { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => 'basic_text' });
  assert.equal(store.encryptionAvailable(), false);
  assert.throws(() => store.setSecret('employee', 'private-key'), /Secure key storage/);
});

test('role instructions are specific and can be replaced per employee', () => {
  assert.match(forRole('Frontend Developer'), /keyboard and screen-reader/);
  assert.match(forRole('DevOps Engineer'), /rollback/);
  const cfg = { security: { approveWrites: false }, workspace: tmp(), employees: [{ id: 'e1', name: 'Lena', role: 'Frontend Developer', instructions: 'Follow our design tokens exactly.' }] };
  const rt = new Runtime({ dataDir: tmp(), getConfig: () => cfg, profileFor: () => ({ provider: 'demo' }), emit: () => {} });
  assert.match(rt.systemPrompt(cfg.employees[0], cfg), /Follow our design tokens exactly/);
  assert.doesNotMatch(rt.systemPrompt(cfg.employees[0], cfg), /keyboard and screen-reader/);
});

test('employee résumé defaults and edits reach the AI instructions', () => {
  assert.ok(resumeForRole('Developer').skills.includes('Debugging'));
  const emp = { id: 'e1', name: 'Lena', role: 'Frontend Developer', resume: { skills: ['Motion design'], knowledge: ['WCAG'], tools: ['CSS'] } };
  assert.deepEqual(resumeForEmployee(emp).skills, ['Motion design']);
  const cfg = { company: 'Example', workspace: tmp(), employees: [emp] };
  const rt = new Runtime({ dataDir: tmp(), getConfig: () => cfg, profileFor: () => ({ provider: 'demo' }), emit: () => {} });
  const prompt = rt.rolePrompt(emp, cfg);
  assert.match(prompt, /Skills: Motion design/);
  assert.match(prompt, /Knowledge: WCAG/);
  assert.match(prompt, /Tools and methods: CSS/);
  assert.ok(resumeForEmployee({ role: 'Developer' }).knowledge.length > 0);
});

test('memory is scoped by employee and project, while approved global notes travel', async () => {
  const dir = tmp(), one = tmp(), two = tmp();
  const team = new TeamContext(dir);
  team.addMemory({ employeeId: 'e1', source: 'founder', projectRoot: one, scope: 'project', text: 'Use the local API contract.' });
  team.addMemory({ employeeId: 'e1', source: 'founder', projectRoot: one, scope: 'global', text: 'Founder prefers concise handoffs.' });
  team.addMemory({ employeeId: 'e2', source: 'founder', projectRoot: one, scope: 'global', text: 'Other employee note.' });
  assert.deepEqual(team.memoriesFor('e1', one).map(m => m.text), ['Use the local API contract.', 'Founder prefers concise handoffs.']);
  assert.deepEqual(team.memoriesFor('e1', two).map(m => m.text), ['Founder prefers concise handoffs.']);
  await team.flush();
  assert.deepEqual(new TeamContext(dir).memoriesFor('e1', two).map(m => m.text), ['Founder prefers concise handoffs.']);
  team.addMemory({ employeeId: 'e1', source: 'founder', projectRoot: one, scope: 'project', text: 'Marketing copy uses a warm voice.' });
  assert.deepEqual(team.memoriesFor('e1', one, 1, 'API contract').map(m => m.text), ['Use the local API contract.']);
});

test('teammate updates wait for the recipient and do not start an AI call', () => {
  const project = tmp(), team = new TeamContext(tmp());
  const update = team.post({ from: 'e1', to: 'e2', projectRoot: project, taskId: 'task1', text: 'API ready.', files: ['src/api.js'], contract: 'GET /items → {items: []}', needs: 'Frontend integration' });
  assert.match(team.formatUpdate(update), /GET \/items → \{items: \[\]\}/);
  assert.deepEqual(team.updatesFor('e2', project).map(u => u.id), [update.id]);
  assert.deepEqual(team.updatesFor('e3', project), []);
  assert.deepEqual(team.updatesFor('e2', project, update.id), []);
  assert.deepEqual(team.usage(), []);
});

test('active tasks cannot claim the same file', () => {
  const project = tmp(), cfg = { workspace: project, employees: [] };
  const rt = new Runtime({ dataDir: tmp(), getConfig: () => cfg, profileFor: () => ({ provider: 'demo' }), emit: () => {} });
  const projectId = rt.team.projectId(project);
  const first = { id: 't1', projectId, employeeName: 'Aarav', title: 'API', status: 'running', claimedFiles: [], files: [] };
  const second = { id: 't2', projectId, employeeName: 'Lena', title: 'UI', status: 'running', claimedFiles: [], files: [] };
  rt.tasks.set(first.id, first); rt.tasks.set(second.id, second);
  assert.equal(rt.claimFile(first, new Workspace(project), 'src/api.js'), 'src/api.js');
  assert.throws(() => rt.claimFile(second, new Workspace(project), 'src/api.js'), /being changed by Aarav/);
});

test('usage meter persists provider reported tokens without estimating dollars', async () => {
  const dir = tmp(), project = tmp(), team = new TeamContext(dir);
  team.recordUsage({ employeeId: 'e1', projectRoot: project, provider: 'openai', model: 'example-model', input: 100, output: 20, cached: 40 });
  await team.flush();
  const [row] = new TeamContext(dir).usage();
  assert.deepEqual({ calls: row.calls, input: row.input, output: row.output, cached: row.cached }, { calls: 1, input: 100, output: 20, cached: 40 });
});

test('monthly token ceiling stops a new paid call before contacting a provider', async () => {
  const project = tmp(), cfg = { workspace: project, security: { monthlyTokenLimit: 100 } };
  const rt = new Runtime({ dataDir: tmp(), getConfig: () => cfg, profileFor: () => ({ provider: 'openai', model: 'example-model', apiKey: 'test' }), emit: () => {} });
  rt.team.recordUsage({ employeeId: 'e1', projectRoot: project, provider: 'openai', model: 'example-model', input: 80, output: 20 });
  await assert.rejects(rt.call('e1', { system: 'test', messages: [], maxTokens: 10 }), /Monthly AI token ceiling reached/);
});

test('lightweight model routes short calls and records provider usage', async () => {
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return { ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: 'ready' } }], usage: { prompt_tokens: 12, completion_tokens: 3, prompt_tokens_details: { cached_tokens: 5 } } }) };
  };
  try {
    const project = tmp(), cfg = { workspace: project };
    const rt = new Runtime({ dataDir: tmp(), getConfig: () => cfg, profileFor: () => ({ provider: 'openai', model: 'main-model', lightweightModel: 'light-model', apiKey: 'test' }), emit: () => {} });
    assert.equal(await rt.call('e1', { system: 'test', messages: [], maxTokens: 25 }, undefined, undefined, 'light'), 'ready');
    assert.equal(await rt.call('e1', { system: 'test', messages: [], maxTokens: 25 }), 'ready');
    assert.deepEqual(requests.map(r => [r.model, r.max_completion_tokens]), [['light-model', 25], ['main-model', 25]]);
    assert.equal(rt.team.usage().reduce((n, row) => n + row.input, 0), 24);
    assert.equal(rt.team.usage().reduce((n, row) => n + row.cached, 0), 10);
  } finally { global.fetch = originalFetch; }
});

test('parseJSON tolerates fences and chatter', () => {
  assert.deepEqual(parseJSON('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJSON('Sure! {"done": true} Hope that helps'), { done: true });
});

test('demo employee runs plan → tools → approval → result', async () => {
  const dir = tmp(), ws = tmp();
  const cfg = { security: { approveWrites: false }, company: 'Test Co', founder: 'P', workspace: ws, employees: [{ id: 'e1', name: 'Ada', role: 'Developer', provider: 'demo' }] };
  const events = [];
  const rt = new Runtime({ dataDir: dir, getConfig: () => cfg, profileFor: () => ({ provider: 'demo' }), emit: e => events.push(e) });
  const t = rt.create({ employeeId: 'e1', description: 'Write a note' });
  // wait for approval
  for (let i = 0; i < 100 && !rt.pendingApprovals().length; i++) await new Promise(r => setTimeout(r, 20));
  const [a] = rt.pendingApprovals();
  assert.ok(a, 'approval requested');
  assert.equal(rt.tasks.get(t.id).status, 'waiting_for_approval');
  rt.respondApproval(a.id, 'approved');
  for (let i = 0; i < 100 && rt.tasks.get(t.id).status !== 'completed'; i++) await new Promise(r => setTimeout(r, 20));
  const done = rt.tasks.get(t.id);
  assert.equal(done.status, 'completed', done.error);
  assert.ok(fs.existsSync(path.join(ws, 'deskly-output/ada-demo-note.md')));
  assert.ok(done.result.files.some(f => f.startsWith('deskly-output/')));
  assert.ok(events.some(e => e.type === 'task.completed'));
  await rt.flush();
  assert.ok(fs.readFileSync(path.join(dir, 'audit.jsonl'), 'utf8').includes('approval.responded'));
});

test('rejecting an approval stops nothing silently', async () => {
  const cfg = { security: { approveWrites: false }, workspace: tmp(), employees: [{ id: 'e1', name: 'Ada', role: 'Dev', provider: 'demo' }] };
  const rt = new Runtime({ dataDir: tmp(), getConfig: () => cfg, profileFor: () => ({ provider: 'demo' }), emit: () => { } });
  const t = rt.create({ employeeId: 'e1', description: 'x' });
  for (let i = 0; i < 100 && !rt.pendingApprovals().length; i++) await new Promise(r => setTimeout(r, 20));
  rt.respondApproval(rt.pendingApprovals()[0].id, 'rejected');
  for (let i = 0; i < 100 && rt.tasks.get(t.id).status !== 'completed'; i++) await new Promise(r => setTimeout(r, 20));
  assert.ok(rt.tasks.get(t.id).logs.some(l => /rejected/.test(l.text)));
});

test('simultaneous demo employees keep their task steps separate', async () => {
  const project = tmp();
  const cfg = { security: { approveWrites: false }, workspace: project, employees: [{ id: 'ada', name: 'Ada', role: 'Developer', provider: 'demo' }, { id: 'eve', name: 'Eve', role: 'Developer', provider: 'demo' }] };
  const rt = new Runtime({ dataDir: tmp(), getConfig: () => cfg, profileFor: () => ({ provider: 'demo' }), emit: () => {} });
  const a = rt.create({ employeeId: 'ada', description: 'Write a note' });
  const b = rt.create({ employeeId: 'eve', description: 'Write a note' });
  for (let i = 0; i < 100 && rt.pendingApprovals().length < 2; i++) await new Promise(r => setTimeout(r, 20));
  assert.equal(rt.pendingApprovals().length, 2);
  for (const approval of rt.pendingApprovals()) rt.respondApproval(approval.id, 'approved');
  for (let i = 0; i < 100 && [a, b].some(t => rt.tasks.get(t.id).status !== 'completed'); i++) await new Promise(r => setTimeout(r, 20));
  assert.equal(rt.tasks.get(a.id).status, 'completed');
  assert.equal(rt.tasks.get(b.id).status, 'completed');
  assert.ok(fs.existsSync(path.join(project, 'deskly-output/ada-demo-note.md')));
  assert.ok(fs.existsSync(path.join(project, 'deskly-output/eve-demo-note.md')));
});
