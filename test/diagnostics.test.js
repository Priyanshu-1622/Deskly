const test=require('node:test');
const assert=require('node:assert/strict');
const {diagnostics}=require('../src/main/diagnostics');
const {validateIPC}=require('../src/main/ipc-validation');

test('diagnostic reports contain only safe aggregate fields even when runtime data contains private content',()=>{
  const secret='PRIVATE_KEY_AND_PROJECT_CONTENT';
  const config={founder:secret,company:secret,workspace:secret,settings:{quality:'low'},employees:[{id:secret,name:secret,provider:'openai',apiKey:secret,baseUrl:secret,instructions:secret},{provider:'demo'}]};
  const runtime={tasks:new Map([['t',{status:'failed',description:secret,logs:[secret]}]]),team:{lastSaveError:secret},lastSaveError:secret,notices:[secret],approvals:new Map([['a',{status:'pending',action:secret}]]),groups:{list:()=>[{topic:secret}]},callsActive:1};
  const report=diagnostics({version:'0.1.0',config,runtime,encrypted:true,crashes:1});
  assert.equal(JSON.stringify(report).includes(secret),false);
  assert.equal(report.health.workspaceAccessible,false);assert.equal(report.health.pendingSaveError,true);
  assert.deepEqual(report.office.providers,{openai:1,demo:1});assert.equal(report.activity.tasks.failed,1);
  assert.equal(report.activity.pendingApprovals,1);assert.equal(report.activity.projectDiscussions,1);
  validateIPC('diagnostics:export',[]);assert.throws(()=>validateIPC('diagnostics:export',[secret]),/Invalid/);
});
