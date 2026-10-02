const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Runtime } = require('../src/main/runtime/runtime');
const { validateIPC } = require('../src/main/ipc-validation');

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deskly-group-'));
  const cfg = { founder: 'Founder', company: 'QA', workspace: path.join(dir, 'project'), employees: [
    { id: 'frontend', name: 'Lena', role: 'Frontend Developer', instructions: 'Respect our accessible design tokens.' },
    { id: 'backend', name: 'Sam', role: 'Backend Developer' },
    { id: 'outside', name: 'Other', role: 'Designer' }
  ] };
  fs.mkdirSync(cfg.workspace);
  const runtime = new Runtime({ dataDir: dir, getConfig: () => cfg, profileFor: () => ({ provider: 'demo' }), emit: () => {} });
  t.after(async () => { await runtime.shutdown(); fs.rmSync(dir, { recursive: true, force: true }); });
  const session = runtime.groups.create('CEO_Office', 'Build a dashboard', ['frontend', 'backend']);
  return { runtime, cfg, dir, session };
}

test('posting is free; selected speakers read founder and earlier replies in sequence', async t => {
  const { runtime: r, session: s } = setup(t), calls = [];
  r.call = async (id, input, signal, task, mode) => {
    calls.push({ id, input, mode });
    assert.equal(signal.aborted, false); assert.equal(task, undefined);
    return id === 'frontend' ? 'Use accessible forms with the API contract from Sam.' : 'Sam agrees and proposes a typed response schema.';
  };
  await r.groups.send(s.id, 'Please discuss the dashboard.', []);
  assert.equal(calls.length, 0);
  const result = await r.groups.send(s.id, '', ['frontend', 'backend']);
  assert.deepEqual(calls.map(c => c.id), ['frontend', 'backend']);
  assert.match(calls[0].input.system, /accessible design tokens/);
  assert.match(calls[0].input.system, /do not execute commands, edit files/);
  assert.match(calls[1].input.messages[0].content, /Use accessible forms with the API contract from Sam/);
  assert.match(calls[1].input.messages[0].content, /Please discuss the dashboard/);
  assert.equal(calls[0].mode, 'light'); assert.equal(calls[0].input.maxTokens, 450);
  assert.equal(result.status, 'idle'); assert.equal(result.messages.length, 3);
  assert.equal(r.tasks.size, 0); assert.equal(r.team.data.memories.length, 0);
});

test('invalid, duplicate and concurrent speakers cannot post or start extra calls', async t => {
  const { runtime: r, session: s } = setup(t);
  assert.throws(() => r.groups.send(s.id, 'Reject me', ['outside']), /not in this discussion/);
  assert.throws(() => r.groups.send(s.id, 'Reject me', ['frontend', 'frontend']), /Write a message/);
  assert.equal(r.groups.snapshot(s.id).messages.length, 0);
  let started, finish;
  const ready = new Promise(resolve => { started = resolve; });
  r.call = () => { started(); return new Promise(resolve => { finish = resolve; }); };
  const run = r.groups.send(s.id, 'Discuss', ['frontend']); await ready;
  assert.throws(() => r.groups.send(s.id, 'Another round', ['backend']), /already running/);
  await assert.rejects(r.groups.decision(s.id, 'Premature'), /Finish/);
  finish('Done'); await run;
});

test('stopping a round saves completed replies and prevents remaining speakers', async t => {
  const { runtime: r } = setup(t);const s=r.groups.create('Boardroom','Cancellation',['frontend','backend','outside']);let started;
  const ready = new Promise(resolve => { started = resolve; }); const calls = [];
  r.call = async (id, input, signal) => {
    calls.push(id);
    if (id === 'frontend') return 'First saved reply';
    started(); return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(Error('Stopped')), { once: true }));
  };
  const run = r.groups.send(s.id, 'Discuss', ['frontend', 'backend', 'outside']); await ready;
  r.groups.cancel(s.id); const result = await run;
  assert.deepEqual(calls, ['frontend', 'backend']);
  assert.equal(result.status, 'idle'); assert.equal(result.messages.length, 2);
  assert.equal(result.messages[1].text, 'First saved reply');
});

test('provider errors are visible and the next selected employee can still reply', async t => {
  const { runtime: r, session: s } = setup(t);
  r.call = async id => { if (id === 'frontend') throw Error('Missing API key'); return 'A proposal'; };
  const result = await r.groups.send(s.id, 'Discuss', ['frontend', 'backend']);
  assert.deepEqual(result.messages.map(m => m.kind), ['founder', 'error', 'employee']);
  assert.equal(result.status, 'idle'); assert.match(result.messages[1].text, /Missing API key/);
});

test('only founder-confirmed decisions enter every participant project memory', async t => {
  const { runtime: r, session: s, cfg } = setup(t);
  await r.groups.send(s.id, 'An idea, not a decision.', []);
  await r.groups.decision(s.id, 'Use a versioned API contract.');
  for (const id of ['frontend', 'backend']) {
    const memories = r.team.memoriesFor(id, cfg.workspace);
    assert.equal(memories.length, 1); assert.equal(memories[0].status, 'verified');
    assert.equal(memories[0].kind, 'decision'); assert.equal(memories[0].source, 'founder');
    assert.match(memories[0].evidence, new RegExp(s.id));
  }
  assert.equal(r.team.memoriesFor('outside', cfg.workspace).length, 0);
  cfg.workspace = path.join(cfg.workspace, 'other');
  assert.deepEqual(r.groups.list(), []); assert.throws(() => r.groups.snapshot(s.id), /unavailable/);
  assert.equal(r.team.memoriesFor('frontend', cfg.workspace).length, 0);
});

test('saved history survives restart; interrupted rounds recover without replaying paid calls', async t => {
  const { runtime: r, session: s, cfg, dir } = setup(t);
  await r.groups.send(s.id, 'Saved founder message', []); await r.flush();
  const data = JSON.parse(fs.readFileSync(path.join(dir, 'group-conversations.json')));
  data[0].status = 'running'; fs.writeFileSync(path.join(dir, 'group-conversations.json'), JSON.stringify(data));
  const reopened = new Runtime({ dataDir: dir, getConfig: () => cfg, profileFor: () => ({ provider: 'demo' }), emit: () => {} });
  try {
    const result = reopened.groups.snapshot(s.id);
    assert.equal(result.status, 'idle'); assert.equal(result.messages[0].text, 'Saved founder message');
    assert.equal(result.messages[1].kind, 'system'); assert.equal(reopened.callsActive, 0);
    await reopened.groups.end(s.id);
    assert.throws(() => reopened.groups.send(s.id, 'No', []), /ended/);
  } finally { await reopened.shutdown(); }
});

test('group IPC validates rooms, participant IDs, sizes and exact argument counts', () => {
  validateIPC('group:start', ['CEO_Office', 'Topic', ['frontend', 'backend']]);
  validateIPC('group:send', ['session', '', ['frontend']]);
  for (const [channel, args] of [
    ['group:start', ['Street', 'Topic', ['frontend']]],
    ['group:start', ['CEO_Office', 'Topic', []]],
    ['group:send', ['session', 'Message', ['frontend', 'frontend']]],
    ['group:send', ['session', 'x'.repeat(5001), []]],
    ['group:get', ['session', 'extra']], ['group:list', ['extra']],
    ['group:decision', ['session', 'x'.repeat(701)]]
  ]) assert.throws(() => validateIPC(channel, args), /Invalid/);
});
