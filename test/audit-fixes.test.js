const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { Workspace } = require('../src/main/runtime/workspace');
const { sharedKey } = require('../src/main/runtime/key-sharing');
const { config } = require('../src/main/ipc-validation');
const { atomicSync, readRecover } = require('../src/main/runtime/persistence');
const { Runtime } = require('../src/main/runtime/runtime');
const { chat } = require('../src/main/runtime/providers');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'deskly-audit-'));
test('long chats send recent bounded turns without mutating the saved conversation', () => {
  const window = {}; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/renderer/js/runtime-client.js'), 'utf8'), { window });
  const history = Array.from({ length: 130 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: i === 129 ? 'x'.repeat(60000) : String(i) }));
  const sent = window.DesklyRuntime.historyForIPC(history);
  assert.equal(sent.length, 40); assert.equal(sent[0].content, '90'); assert.equal(sent.at(-1).content.length, 50000); assert.equal(history.at(-1).content.length, 60000);
});
test('door collision follows the moving panel and leaves the opened passage clear', () => {
  const window = {}; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/renderer/js/world.js'), 'utf8'), { window, THREE: {} });
  const world = Object.create(window.DesklyWorld.prototype), g = { userData: { doorWidth: 1 }, position: { x: 0, z: 0 }, rotation: { y: 0 } };
  world.doors = [{ c: { x: .5, z: 0 }, panels: [{ g }] }];
  assert.equal(world.doorBlocked(.5, 0), true); assert.equal(world.doorBlocked(.5, .3), false);
  g.rotation.y = Math.PI / 2; assert.equal(world.doorBlocked(.5, 0), false); assert.equal(world.doorBlocked(0, -.5), true);
});
test('editor refuses binary and truncated saves, preserves CRLF, detects concurrent edits and creates exclusively', () => {
  const ws = new Workspace(tmp());
  ws.writeFile('text.txt', 'one\r\ntwo\r\n');
  const file = ws.openEditor('text.txt'); ws.saveEditor('text.txt', 'three\nfour\n', file.version);
  assert.equal(fs.readFileSync(ws.resolve('text.txt'), 'utf8'), 'three\r\nfour\r\n');
  assert.throws(() => ws.saveEditor('text.txt', 'lost', file.version), /changed/);
  assert.throws(() => ws.saveEditor('text.txt', 'lost', null), /EEXIST/);
  fs.writeFileSync(ws.resolve('binary.dat'), Buffer.from([0, 255, 1]));
  assert.equal(ws.openEditor('binary.dat').readOnly, true);
  assert.throws(() => ws.saveEditor('binary.dat', 'lost', ws.openEditor('binary.dat').version), /Binary/);
  ws.writeFile('large.txt', 'x'.repeat(400001));
  assert.throws(() => ws.saveEditor('large.txt', 'lost', ws.openEditor('large.txt').version), /Large/);
  assert.equal(fs.statSync(ws.resolve('large.txt')).size, 400001);
});
test('secret protection ignores ancestors and permits explicit public templates without exposing private keys', () => {
  const root = path.join(tmp(), 'id_alice', '.environment', 'project'); fs.mkdirSync(root, { recursive: true }); const ws = new Workspace(root);
  for (const name of ['id_utils.js', '.env.example', '.env.sample', '.env.template', 'id_rsa.pub']) { ws.writeFile(name, 'public'); assert.equal(ws.readFile(name), 'public'); }
  for (const name of ['.env', '.env.local', '.env.example.local', 'id_rsa', 'id_ed25519', 'id_ecdsa_sk', 'id_ed25519_sk', 'id_rsa.bak', 'id_ed25519.old', 'private_key.der', 'private-key.json', 'nested/.ssh/config']) assert.throws(() => ws.writeFile(name, 'secret'), /secrets/);
  assert.equal(ws.listDir().length, 5);
});
test('folder pages expose all safe entries without exposing private files or escaping the workspace', () => {
  const ws=new Workspace(tmp());for(let i=0;i<405;i++)ws.writeFile(`file-${String(i).padStart(3,'0')}.txt`,'safe');fs.writeFileSync(ws.resolve('.env'),'secret');
  const first=ws.listPage('.',0),last=ws.listPage('.',400);assert.equal(first.total,405);assert.equal(first.entries.length,400);assert.equal(first.next,400);assert.equal(last.entries.length,5);assert.equal(last.next,null);
  assert.equal(new Set([...first.entries,...last.entries].map(e=>e.path)).size,405);assert.throws(()=>ws.listPage('../',0),/outside/);
});
test('shared keys traverse chains but never cross provider boundaries or loop', () => {
  const cfg = { employees: [{ id: 'a', provider: 'openai', keyFrom: 'b' }, { id: 'b', provider: 'openai', keyFrom: 'assistant' }], assistant: { provider: 'openai' } };
  assert.equal(sharedKey(cfg, 'a', id => id === 'assistant' ? 'key' : ''), 'key');
  assert.equal(sharedKey(cfg, 'a', id => id === 'a' ? 'own' : 'other'), 'own');
  cfg.assistant.keyFrom = 'a'; assert.throws(() => config(cfg), /cyclic/); assert.equal(sharedKey(cfg, 'a', () => ''), '');
  delete cfg.assistant.keyFrom; cfg.employees[1].provider = 'custom'; cfg.employees[1].baseUrl = 'https://example.com/v1'; assert.equal(sharedKey(cfg, 'a', () => ''), '');
});
test('incomplete custom settings may be saved while unsafe nonempty endpoints remain invalid', () => {
  assert.doesNotThrow(() => config({ employees: [{ id: 'draft', provider: 'custom', baseUrl: '' }] }));
  assert.throws(() => config({ employees: [{ id: 'draft', provider: 'custom', baseUrl: 'http://example.com' }] }));
});
test('preload exposes camel-case methods for every separator, including ignore-map and editor APIs', () => {
  let api; const calls = [];
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/main/preload.js'), 'utf8'), { require: () => ({ contextBridge: { exposeInMainWorld: (_name, value) => { api = value; } }, ipcRenderer: { invoke: async (...args) => { calls.push(args); return { ok: true, value: true }; } } }) });
  assert.equal(typeof api.workspaceIgnoreMap, 'function'); assert.equal(typeof api.workspaceEditorRead, 'function'); assert.equal(typeof api.workspaceEditorSave, 'function');
  assert.equal(Object.keys(api).some(key => /[:-]/.test(key)), false);
});
test('a damaged primary does not prevent atomic saving or destroy its valid backup', () => {
  const file = path.join(tmp(), 'state.json'); fs.writeFileSync(file, '{'); fs.writeFileSync(file + '.bak', '{"safe":true}');
  atomicSync(file, { fixed: true }); assert.deepEqual(readRecover(file, {}), { fixed: true });
  assert.equal(fs.readFileSync(file + '.bak', 'utf8'), '{"safe":true}'); assert.ok(fs.readdirSync(path.dirname(file)).some(name => name.includes('.corrupt-')));
});
test('atomic persistence retries transient Windows file locks', t => {
  const file=path.join(tmp(),'state.json'),rename=fs.renameSync;let attempts=0;
  t.mock.method(fs,'renameSync',(from,to)=>{if(to===file&&++attempts<3)throw Object.assign(new Error('locked'),{code:'EPERM'});return rename(from,to);});
  atomicSync(file,{saved:true});assert.equal(attempts,3);assert.equal(JSON.parse(fs.readFileSync(file)).saved,true);
});
test('agent appends support large text but never exceed the bounded write limit', async () => {
  const root=tmp(),ws=new Workspace(root),runtime=new Runtime({dataDir:tmp(),getConfig:()=>({workspace:root,security:{approveWrites:false},employees:[]}),profileFor:()=>({provider:'demo'}),emit:()=>{}});
  const task={employeeId:'a',employeeName:'A',files:[],logs:[],claimedFiles:[]};ws.writeFile('large.txt','x'.repeat(450000));
  assert.match(await runtime.tool(task,ws,{name:'write_file',args:{path:'large.txt',content:'tail',append:true}}),/Wrote/);
  assert.equal(fs.readFileSync(ws.resolve('large.txt'),'utf8').slice(-4),'tail');
  assert.match(await runtime.tool(task,ws,{name:'write_file',args:{path:'large.txt',content:'x'.repeat(600000),append:true}}),/1 MB/);
  assert.equal(fs.statSync(ws.resolve('large.txt')).size,450004);await runtime.shutdown();
});
test('append approvals cannot overwrite a newly created target or truncate an externally grown file', async () => {
  const root=tmp(),ws=new Workspace(root),runtime=new Runtime({dataDir:tmp(),getConfig:()=>({workspace:root,security:{approveWrites:true},employees:[]}),profileFor:()=>({provider:'demo'}),emit:()=>{}});
  const task={employeeId:'a',employeeName:'A',files:[],logs:[],claimedFiles:[]};
  runtime.approve=async()=>{ws.writeFile('new.txt','external edit');return true;};
  assert.match(await runtime.tool(task,ws,{name:'write_file',args:{path:'new.txt',content:'agent chunk',append:true}}),/EEXIST/);
  assert.equal(ws.readFile('new.txt'),'external edit');ws.writeFile('full.txt','x'.repeat(1000000));
  runtime.approve=async()=>{fs.appendFileSync(ws.resolve('full.txt'),'external suffix');return true;};
  assert.match(await runtime.tool(task,ws,{name:'write_file',args:{path:'full.txt',content:'',append:true}}),/changed/);
  assert.equal(fs.statSync(ws.resolve('full.txt')).size,1000015);await runtime.shutdown();
});
test('empty and truncated provider replies fail explicitly instead of reaching the tool parser', async t => {
  let body = { choices: [{ message: { content: '' } }] };
  t.mock.method(global, 'fetch', async () => new Response(JSON.stringify(body)));
  const profile = { provider: 'openai', model: 'light-model', apiKey: 'test' }, input = { system: '', messages: [] };
  await assert.rejects(chat(profile, input), { code: 'empty_response' });
  body = { choices: [{ finish_reason: 'length', message: { content: '{"tool":' } }] };
  await assert.rejects(chat(profile, input), { code: 'truncated_response' });
});
test('approval audit and task logs omit command secrets while live approval retains literal review', async () => {
  const dir = tmp(), events = [], runtime = new Runtime({ dataDir: dir, getConfig: () => ({ employees: [] }), profileFor: () => ({ provider: 'demo' }), emit: event => events.push(event) });
  const task = { id: 'task', employeeId: 'a', employeeName: 'A', logs: [], approvalRequests: [], status: 'running' }; runtime.tasks.set(task.id, task);
  fs.writeFileSync(runtime.auditPath, ' '.repeat(5000000));
  const promise = runtime.approve(task, { kind: 'execute_command', summary: 'tool --token secret-sentinel', content: 'tool --token secret-sentinel', risk: 'high' });
  assert.match(events.find(e => e.type === 'approval.required').action.content, /secret-sentinel/);
  runtime.respondApproval([...runtime.approvals.keys()][0], 'rejected'); await promise; await runtime.auditQueue;
  assert.equal(JSON.stringify(runtime.audit(100000)).includes('secret-sentinel'), false);
  assert.equal(JSON.stringify(task.logs).includes('secret-sentinel'), false);
  assert.equal(fs.readFileSync(runtime.auditPath, 'utf8').includes('secret-sentinel'), false);
  assert.equal(fs.readFileSync(runtime.auditPath + '.1', 'utf8').includes('secret-sentinel'), false);
  runtime.tasks.clear(); await runtime.shutdown();
});
test('cancelling a task resolves approvals and progress uses a small event payload', async () => {
  const events = [], runtime = new Runtime({ dataDir: tmp(), getConfig: () => ({ employees: [] }), profileFor: () => ({ provider: 'demo' }), emit: event => events.push(event) });
  const task = { id: 'task', employeeId: 'a', logs: [], approvalRequests: [], status: 'running', progress: 0 }; runtime.tasks.set(task.id, task);
  const approval = runtime.requestApproval(task, { kind: 'write_file', content: 'x'.repeat(1000000) }); runtime.progress(task, .2);
  const progress = events.find(e => e.type === 'task.progress'); assert.equal(progress.task, undefined); assert.equal(progress.approvals, undefined);
  runtime.cancel(task.id); assert.equal(await approval, false); assert.ok(events.some(e => e.type === 'approval.resolved' && e.approvals.length === 0));
  runtime.tasks.clear(); await runtime.shutdown();
});
