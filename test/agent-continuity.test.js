const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Runtime } = require('../src/main/runtime/runtime');
const { TeamContext } = require('../src/main/runtime/team-context');
const { commandFor, parseCliOutput, testCli } = require('../src/main/runtime/cli-providers');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'deskly-continuity-test-'));

test('memory keeps source and verification state across sessions; outdated notes stop entering context', async () => {
  const dataDir = tmp(), project = tmp(), team = new TeamContext(dataDir);
  const note = team.addMemory({ employeeId: 'dev', projectRoot: project, text: 'The auth endpoint returns a token.', source: 'employee', kind: 'fact' });
  assert.equal(note.status, 'unverified');
  team.updateMemory(note.id, 'dev', { status: 'verified', kind: 'decision' });
  await team.flush();
  const reloaded = new TeamContext(dataDir);
  assert.equal(reloaded.memoriesFor('dev', project)[0].kind, 'decision');
  assert.equal(reloaded.memoriesFor('dev', project)[0].status, 'verified');
  assert.throws(() => reloaded.updateMemory(note.id, 'other', { status: 'outdated' }), /not found/);
  reloaded.updateMemory(note.id, 'dev', { status: 'outdated' });
  assert.equal(reloaded.memoriesFor('dev', project).length, 0);
  assert.equal(reloaded.listMemories('dev', project)[0].status, 'outdated');
});

test('interrupted work loads as resumable and completes from its saved turn', async () => {
  const dataDir = tmp(), project = tmp();
  const cfg = { workspace: project, founder: 'Founder', company: 'Deskly', employees: [{ id: 'dev', name: 'Dev', role: 'Developer', provider: 'demo' }] };
  const options = { dataDir, getConfig: () => cfg, profileFor: () => ({ provider: 'demo' }), emit: () => {} };
  const first = new Runtime(options);
  const task = { id: 'resume-me', employeeId: 'dev', employeeName: 'Dev', role: 'Developer', title: 'Finish a report', description: 'Finish a report', status: 'running', progress: 0.4, steps: [{ label: 'Finish' }], step: 0, logs: [], files: [], result: null,
    projectId: first.team.projectId(project), claimedFiles: [], usage: { calls: 0, input: 0, output: 0, cached: 0 }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), approvalRequests: [],
    checkpoint: { stage: 'running', tree: '', messages: [{ role: 'user', content: 'AGENT_TURN\nFinish a report' }], nextTurn: 1, inFlight: { name: 'read_file' } } };
  first.tasks.set(task.id, task); first.save(); await first.flush();
  const second = new Runtime(options);
  assert.equal(second.snapshot().tasks[0].status, 'interrupted');
  assert.equal(second.snapshot().tasks[0].canResume, true);
  second.call = async () => JSON.stringify({ done: true, summary: 'Report finished', result: 'Recovered from the checkpoint.' });
  second.resume(task.id);
  for (let i = 0; i < 30 && second.tasks.get(task.id).status !== 'completed'; i++) await new Promise(r => setTimeout(r, 10));
  const finished = second.tasks.get(task.id);
  assert.equal(finished.status, 'completed');
  assert.match(finished.result.body, /Recovered from the checkpoint/);
  assert.equal(finished.checkpoint, null);
  assert.ok(finished.files.length > 0);
});

test('CLI connectors use installed login and parse completed model replies', async () => {
  const codex = commandFor({ provider: 'codex_cli' });
  assert.ok(codex.args.includes('read-only'));
  assert.ok(codex.args.includes('--ephemeral'));
  const claude = commandFor({ provider: 'claude_code' });
  assert.ok(claude.args.includes('--restricted'));
  assert.ok(claude.args.includes('--tools'));
  assert.throws(() => commandFor({ provider: 'codex_cli', model: 'model;echo unsafe' }), /unsupported/);
  const events = [
    { type: 'item.completed', item: { type: 'agent_message', text: '{"done":true}' } },
    { type: 'turn.completed', usage: { input_tokens: 12, output_tokens: 5, cached_input_tokens: 3 } }
  ].map(x => JSON.stringify(x)).join('\n');
  assert.deepEqual(parseCliOutput('codex_cli', events), { text: '{"done":true}', usage: { input: 12, output: 5, cached: 3 } });
  assert.equal(parseCliOutput('claude_code', JSON.stringify({ result: 'ready', usage: { input_tokens: 4, output_tokens: 1 } })).text, 'ready');
  assert.equal((await testCli({ provider: 'codex_cli' }, async () => 'Logged in using ChatGPT')).ok, true);
  assert.equal((await testCli({ provider: 'claude_code' }, async () => '{"loggedIn":true}')).ok, true);
});
