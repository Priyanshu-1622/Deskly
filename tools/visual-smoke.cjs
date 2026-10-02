// Isolated desktop render check; never reads or changes the founder's profile.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const port = 9257;
const profile = process.env.DESKLY_SMOKE_PROFILE ? path.resolve(process.env.DESKLY_SMOKE_PROFILE) : fs.mkdtempSync(path.join(os.tmpdir(), 'deskly-visual-'));
if (process.env.DESKLY_SMOKE_PROFILE && !path.basename(profile).startsWith('deskly-visual-')) throw Error('Smoke profile must be a dedicated deskly-visual directory.');
fs.mkdirSync(profile, { recursive: true });
if ((process.env.DESKLY_NATIVE_CHECK === '1' || process.env.DESKLY_REDESIGN_CHECK === '1' || process.env.DESKLY_GROUP_CHECK === '1' || process.env.DESKLY_README_SHOTS === '1') && process.env.DESKLY_NATIVE_RESTART !== '1') {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'deskly-smoke-project-'));
  fs.writeFileSync(path.join(profile, 'deskly-config.json'), JSON.stringify({ founder: 'Smoke', company: 'Deskly QA', workspace: project, employees: [{ id: 'qa', name: 'QA', role: 'Developer', provider: 'openai' }], assistant: { provider: 'demo' }, security: { approveWrites: true }, settings: { quality: 'low' } }));
}
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const electron = spawn(process.env.DESKLY_SMOKE_EXECUTABLE ? path.resolve(root, process.env.DESKLY_SMOKE_EXECUTABLE) : require('electron'), [root, ...(process.env.DESKLY_README_SHOTS==='1'?[]:['--deskly-visual-check']), `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`], { cwd: root, env, windowsHide: true, stdio: 'ignore' });
const pending = new Map(), errors = []; let id = 0, socket;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function send(method, params = {}) {
  return new Promise((resolve, reject) => { const n = ++id; const timer = setTimeout(() => { pending.delete(n); reject(new Error(`${method} timed out`)); }, 45000); pending.set(n, { resolve, reject, timer }); socket.send(JSON.stringify({ id: n, method, params })); });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function capture(){
  const data=await evaluate(`(()=>{const a=window.__deskly;a.renderer.render(a.world.scene,a.camera);return a.renderer.domElement.toDataURL('image/png').split(',')[1];})()`);
  return{data};
}
async function main() {
  let page;
  for (let tries = 0; tries < 50; tries++) { try { const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); page = pages.find(p => p.type === 'page'); if (page) break; } catch {} await delay(300); }
  if (!page) throw new Error('Deskly did not open a renderer');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data), request = pending.get(message.id);
    if (request) { clearTimeout(request.timer); pending.delete(message.id); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result); }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params.type)) errors.push(message.params.args.map(a => a.value || a.description || '').join(' '));
  });
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  await send('Runtime.enable');
  for (let tries = 0; tries < 70; tries++) { if (await evaluate('!!window.DK')) break; await delay(100); }
  if (process.env.DESKLY_NATIVE_ERASE === '1') {
    const cleared = await evaluate(`(async()=>{const data=await DK.configGet();if(data.config||Object.keys(data.keys).length||localStorage.getItem('deskly.erase-test'))throw Error('Erased data survived startup');const state=await DK.tasksSnapshot();if(state.tasks.length)throw Error('Erased tasks survived');return true;})()`);
    console.log(JSON.stringify({nativeDataErasure:cleared,errors},null,2));if(errors.length)throw Error('Erase smoke renderer errors');return;
  }
  for (let tries = 0; tries < 70; tries++) { if (await evaluate('!!window.__deskly?.world?.data && !!window.__deskly?.player')) break; await delay(300); }
  const ready = await evaluate('!!window.__deskly?.world?.data && !!window.__deskly?.player');
  if (!ready) throw new Error('Office failed to initialize');
  if(process.env.DESKLY_README_SHOTS==='1'){
    await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
    await evaluate(`(async()=>{const a=window.__deskly,c=(await DK.configGet()).config;c.founder='Alex Rivera';c.company='Deskly Studio';c.employees=DesklyPresets.defaultTeam().map(e=>({...e,provider:'demo'}));await DK.configSave(c);a.screens.cfg=c;await document.fonts.ready;a.screens.start();})()`);
    const shot=async name=>{await delay(350);const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(root,'docs/screenshots',name+'.png'),Buffer.from(data,'base64'));};
    await shot('front-desk');
    await evaluate(`window.__deskly.screens.openSettings('team')`);await shot('team-and-providers');
    await evaluate(`(()=>{const a=window.__deskly;a.refreshClock=()=>{const c=DesklyOfficeTime.info(new Date('2026-10-02T06:30:00Z'),'Asia/Kolkata');a.clockInfo=c;a.world.setTime(c);return c;};a.enterOffice();a.ui.close();a.playing=false;a.refreshClock();a.office.arrivals=[];for(const e of a.office.employees){e.clear();e.errand=null;e.spawnAt(e.seat.p[0],e.seat.p[2],0);e.posture='sit';e.sitSeat=e.seat;}a.office.callMeeting('Boardroom',a.office.employees,'Dashboard planning');a.player.pos.set(11.2,0,32.2);a.camera.position.set(11.2,1.5,32.2);a.camera.lookAt(16,1.4,32.2);a.ui.meetingLive();})()`);
    await delay(6500);
    await evaluate(`(()=>{const a=window.__deskly;for(let i=0;i<3000;i++){for(const e of a.office.employees)e.update(.05);if(a.office.meetingArrived()===15)break;}if(a.office.meetingArrived()!==15)throw Error('README meeting did not gather everyone');for(const e of a.office.employees)e.rig.update(.05,e.yaw);a.renderer.render(a.world.scene,a.camera);a.ui.onRender?.();})()`);
    for(let i=0;i<60;i++){if(await evaluate('!!window.__deskly.office.meeting.groupSessionId'))break;await delay(100);}
    await evaluate(`(async()=>{const a=window.__deskly,m=a.office.meeting;await DK.groupSend(m.groupSessionId,'Let’s plan a shared dashboard. What should we build first, and how should frontend and backend connect?',m.people.slice(0,2).map(e=>e.id));a.ui.close();a.ui.meetingLive();})()`);
    for(let i=0;i<60;i++){if(await evaluate('document.querySelectorAll(".group-message").length===3'))break;await delay(100);}
    await shot('shared-discussion');
    console.log(JSON.stringify({readmeScreenshots:['front-desk','team-and-providers','shared-discussion'],errors},null,2));if(errors.length)throw Error('README screenshot renderer errors');return;
  }
  if(process.env.DESKLY_GROUP_CHECK==='1'){
    const report=await evaluate(`(async()=>{
      const a=window.__deskly,c=(await DK.configGet()).config;c.employees=DesklyPresets.defaultTeam().map(e=>({...e,provider:'demo'}));await DK.configSave(c);a.screens.cfg=c;a.enterOffice();a.ui.close();a.playing=false;
      const waitFor=async(fn)=>{for(let i=0;i<100;i++){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('Discussion screen did not settle');};
      const button=text=>[...document.querySelectorAll('#panel button')].find(b=>b.textContent===text);
      a.office.callMeeting('Boardroom',a.office.employees,'Product launch');a.ui.meetingLive();
      await waitFor(()=>a.office.meeting.groupSnapshot?.status==='idle');
      const full=a.office.meeting;if(document.querySelectorAll('.group-person').length!==15)throw Error('Full meeting participants missing');
      const textarea=document.querySelector('#groupMessage');textarea.value='What should we build first?';textarea.dispatchEvent(new Event('input'));button('Post to everyone').click();
      await waitFor(async()=>{const s=await DK.groupGet(full.groupSessionId);return s.status==='idle'&&s.messages.length===1;});
      await waitFor(()=>!button('Discuss with selected').disabled);button('Discuss with selected').click();
      await waitFor(async()=>{const s=await DK.groupGet(full.groupSessionId);return s.status==='idle'&&s.messages.filter(m=>m.kind==='employee').length===3;});
      await waitFor(()=>!button('Save shared decision').disabled);
      document.querySelector('.group-decision input').value='Use an accessible shared dashboard.';button('Save shared decision').click();
      await waitFor(async()=>(await DK.groupGet(full.groupSessionId)).messages.some(m=>m.kind==='decision'));
      for(const e of full.people){if(!(await DK.memoryList(e.id)).some(m=>m.text==='Use an accessible shared dashboard.'))throw Error('Shared participant memory missing');}
      button('End and save meeting').click();await waitFor(()=>!a.office.meeting);
      const saved=await DK.groupGet(full.groupSessionId);if(saved.status!=='ended')throw Error('Meeting did not end');
      a.office.callMeeting('CEO_Office',a.office.employees.slice(0,2),'Design review');a.ui.meetingLive();
      await waitFor(()=>a.office.meeting.groupSnapshot?.status==='idle');
      if(document.querySelectorAll('.group-person').length!==2)throw Error('Private group includes outsiders');
      const small=a.office.meeting,second=small.people[1];c.employees.find(e=>e.id===second.id).provider='openai';await DK.configSave(c);
      const input=document.querySelector('#groupMessage');input.value='Please share your ideas.';input.dispatchEvent(new Event('input'));button('Discuss with selected').click();
      await waitFor(async()=>{const s=await DK.groupGet(small.groupSessionId);return s.status==='idle'&&s.messages.some(m=>m.kind==='error');});
      a.ui.close();if(a.ui.panelKind!==null||!document.querySelector('#panel').hidden)throw Error('Closing discussion left movement blocked');
      a.ui.meetingLive();await waitFor(()=>document.querySelectorAll('.group-message').length===3);
      const view=document.querySelector('.group-transcript');if(view.scrollHeight<view.clientHeight||view.clientHeight<180)throw Error('Transcript has no readable bounded layout');
      const result={fullMeetingParticipants:15,selectedReplies:3,sharedDecisions:15,privateGroup:2,providerErrorRecovered:true,historyReopened:true,controlsRestored:true,transcriptHeight:view.clientHeight};
      button('End and save meeting').click();await waitFor(()=>!a.office.meeting);return result;
    })()`);
    console.log(JSON.stringify({groupConversation:report,errors},null,2));if(errors.length)throw Error('Group discussion renderer errors');return;
  }
  if(process.env.DESKLY_CAMPUS_SKIN_CHECK==='1'){
    const report=await evaluate(`(()=>{const a=window.__deskly;a.screens.cfg={company:'QA',employees:DesklyPresets.defaultTeam(),settings:{quality:'balanced'},security:{},assistant:{provider:'demo'}};a.enterOffice();a.ui.close();a.playing=false;a.player.enabled=false;const tones=[];for(const sex of ['male','female'])for(const color of DesklyPresets.LOOKS.skins){const rig=DesklyHumanAssets.build({assetId:'employee-'+sex,skin:color,height:1.75});let skin;rig.root.traverse(o=>{if(o.material?.name==='Skin')skin=o.material;});tones.push({sex,color,factor:skin.color.toArray()});rig.dispose();}for(const sex of ['male','female']){const list=tones.filter(t=>t.sex===sex);if(new Set(list.map(t=>t.factor.join(','))).size!==8)throw Error('Skin choices indistinguishable');}a.player.pos.set(20,0,-16);for(let i=0;i<220;i++)a.nav.move(a.player.pos,0,.1,.22);if(a.player.pos.z<4)throw Error('Entrance obstructed');if(a.campus.traffic.length!==2)throw Error('Street traffic missing');const car=a.campus.traffic[0],x=car.vehicle.position.x;a.campus.update(1);if(car.vehicle.position.x===x)throw Error('Traffic stationary');if(!a.nav.blockedAt(car.vehicle.position.x,car.vehicle.position.z))throw Error('Vehicle collision missing');a.player.pos.set(car.vehicle.position.x,0,car.vehicle.position.z+2);const stopped=car.vehicle.position.x;a.campus.update(1);if(car.vehicle.position.x!==stopped)throw Error('Traffic does not yield');return{tones,entranceClear:true,trafficMoves:true,trafficYields:true,terraceSeats:a.campus.interactions.filter(i=>i.seat?.room==='Garden terrace').length};})()`);
    fs.mkdirSync(path.join(root,'.cache','campus-skin-check'),{recursive:true});
    await evaluate(`(()=>{const a=window.__deskly;const render=a.renderer.render.bind(a.renderer);window.campusSkinRender=render;for(const e of a.office.employees)e.rig.root.visible=false;window.skinRigs=['#f5d7c4','#6b4029'].map((skin,i)=>{const rig=DesklyHumanAssets.build({assetId:'employee-male',skin,height:1.75});rig.root.position.set(4+(i-.5)*.7,0,31);a.world.scene.add(rig.root);return rig;});a.renderer.render=(s,c)=>{c.position.set(4,1.55,32.4);c.lookAt(4,1.5,31);render(s,c);};for(const el of document.body.children)if(el.id!=='stage'&&el.tagName!=='SCRIPT')el.style.display='none';})()`);
    let shot=await capture();fs.writeFileSync(path.join(root,'.cache','campus-skin-check','skin-comparison.png'),Buffer.from(shot.data,'base64'));
    await evaluate(`(()=>{const a=window.__deskly;for(const rig of skinRigs){a.world.scene.remove(rig.root);rig.dispose();}a.renderer.render=(s,c)=>{c.position.set(20,1.7,-9);c.lookAt(35,1.5,-42);a.campus.update(1);campusSkinRender(s,c);};})()`);
    shot=await capture();fs.writeFileSync(path.join(root,'.cache','campus-skin-check','street.png'),Buffer.from(shot.data,'base64'));
    await evaluate(`(()=>{const a=window.__deskly;a.renderer.render=(s,c)=>{c.position.set(17,1.7,45);c.lookAt(28,1.2,53);a.campus.update(1);campusSkinRender(s,c);};})()`);
    shot=await capture();fs.writeFileSync(path.join(root,'.cache','campus-skin-check','garden.png'),Buffer.from(shot.data,'base64'));
    console.log(JSON.stringify({report,errors},null,2));if(errors.length)throw Error('Campus or skin renderer errors');return;
  }
  if(process.env.DESKLY_TEAM_PAGE_CHECK==='1'){
    await evaluate(`(()=>{const a=window.__deskly;a.screens.cfg={company:'QA',employees:DesklyPresets.defaultTeam(),settings:{quality:'balanced'},security:{},assistant:{provider:'demo'}};a.screens.openSettings('team');})()`);
    for(const [width,height]of [[1280,720],[1920,1080],[720,900]]){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      await evaluate(`(()=>{const tabs=[...document.querySelectorAll('.team-section-tab')];if(tabs.length!==2)throw Error('Team editing navigation missing');for(const tab of tabs){const r=tab.getBoundingClientRect();if(r.top<0||r.bottom>innerHeight)throw Error('Team edit entry outside initial viewport');}tabs[1].click();if(!document.querySelector('.tedit input[type=text]'))throw Error('Team profile unavailable');const name=document.querySelector('.tedit input[type=text]');name.value='Visible team editor';name.dispatchEvent(new Event('input'));tabs[0].click();if(!document.querySelector('.key-directory').textContent.includes('Visible team editor'))throw Error('Switching sections lost draft edits');tabs[0].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));if(tabs[1].getAttribute('aria-selected')!=='true')throw Error('Keyboard tab navigation failed');tabs[0].click();})()`);
    }
    console.log(JSON.stringify({teamNavigationVisible:true,draftPreserved:true,keyboardNavigation:true,viewports:3,errors},null,2));if(errors.length)throw Error('Team page renderer errors');return;
  }
  if (process.env.DESKLY_MEETING_POSE_CHECK === '1') {
    const report=await evaluate(`(async()=>{const a=window.__deskly;a.screens.cfg={company:'QA',employees:DesklyPresets.defaultTeam(),settings:{quality:'balanced'},security:{},assistant:{provider:'demo'}};a.enterOffice();a.ui.close();a.playing=false;a.player.enabled=false;for(const e of a.office.employees){const set=e.rig.setMode.bind(e.rig);e.rig.setMode=mode=>{e.checkedPose=mode;set(mode);};}a.office.callMeeting('Boardroom',a.office.employees,'Pose regression');await new Promise(r=>setTimeout(r,6500));for(let i=0;i<3000;i++){a.time+=.05;for(const e of a.office.employees)e.update(.05);if(a.office.meetingArrived()===15)break;}if(a.office.meetingArrived()!==15)throw Error('Meeting did not assemble');for(let i=0;i<120;i++){a.time+=.05;for(const e of a.office.employees)e.update(.05);}const poses=a.office.employees.map(e=>{e.rig.root.updateMatrixWorld(true);let hand;e.rig.root.traverse(o=>{if(o.userData.name==='wrist.R'||/^wrist[._]?R$/.test(o.name))hand=o;});if(!hand)throw Error('Wrist missing: '+e.id);const wrist=hand.getWorldPosition(new THREE.Vector3());if(e.posture==='sit'&&(wrist.y>e.rig.seatH+.2||wrist.y<e.rig.seatH+.08))throw Error('Hands not resting near lap: '+e.id+' '+wrist.y);if(e.posture==='stand'&&wrist.y>1.05*e.rig.s)throw Error('Standing hands suspended');if(e.rig.talking>0)throw Error('Speech timer stuck: '+e.id);if(e.posture==='stand'&&e.checkedPose!=='stand')throw Error('Standing listener is gesturing');if(e.posture==='sit'&&e.checkedPose!=='sitMeeting')throw Error('Seated listener is typing');return{id:e.id,posture:e.posture,pose:e.checkedPose,handHeight:wrist.y,seatHeight:e.rig.seatH};});const speaker=a.office.employees.find(e=>e.posture==='stand');a.office.meeting.speaking=speaker;speaker.say('Brief update.',1);for(let i=0;i<30;i++)speaker.update(.05);if(speaker.checkedPose!=='talk')throw Error('Speaker gesture missing');a.office.meeting.speaking=null;for(let i=0;i<60;i++)speaker.update(.05);if(speaker.checkedPose!=='stand')throw Error('Speaker did not return to rest');return{poses,speechExpires:true,speakerReturnsToRest:true};})()`);
    await evaluate(`(()=>{const a=window.__deskly;const render=a.renderer.render.bind(a.renderer);a.renderer.render=(s,c)=>{c.position.set(11.9,1.65,34.8);c.lookAt(14.7,1.1,31.8);render(s,c);};for(const el of document.body.children)if(el.id!=='stage'&&el.tagName!=='SCRIPT')el.style.display='none';})()`);
    fs.mkdirSync(path.join(root,'.cache','pose-check'),{recursive:true});const shot=await capture();fs.writeFileSync(path.join(root,'.cache','pose-check','meeting.png'),Buffer.from(shot.data,'base64'));
    console.log(JSON.stringify({report,errors},null,2));if(errors.length)throw Error('Meeting pose renderer error');return;
  }
  if (process.env.DESKLY_PERFORMANCE_CHECK === '1') {
    const report = await evaluate(`(()=>{const a=window.__deskly;a.screens.cfg={company:'QA',employees:DesklyPresets.defaultTeam(),settings:{quality:'balanced'},security:{},assistant:{provider:'demo'}};a.enterOffice();a.ui.close();a.playing=false;a.player.enabled=false;a.camera.position.set(22,1.65,19);a.camera.lookAt(34,1.3,18);a.campus.update(1);a.world.updateIndoorLights(a.camera.position);const gl=a.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');const measure=()=>{a.renderer.render(a.world.scene,a.camera);gl.finish();const start=performance.now();for(let i=0;i<8;i++){for(const e of a.office.employees)e.update(1/60);a.renderer.render(a.world.scene,a.camera);gl.finish();}return{msPerFrame:(performance.now()-start)/8,calls:a.renderer.info.render.calls,triangles:a.renderer.info.render.triangles};};const cold=measure();const normal=measure();a.renderer.shadowMap.needsUpdate=true;const shadowRefresh=measure();a.renderer.shadowMap.enabled=false;const noShadow=measure();for(const e of a.office.employees)e.rig.root.visible=false;const noCharacters=measure();return{gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),cold,normal,shadowRefresh,noShadow,noCharacters};})()`);
    console.log(JSON.stringify(report,null,2));return;
  }
  if (process.env.DESKLY_REDESIGN_CHECK === '1') {
    await require('./redesign-smoke.cjs')({ send, evaluate, delay, root, errors });
    return;
  }
  if (process.env.DESKLY_NATIVE_RESTART === '1') {
    const key = await evaluate(`(async()=>{if(!(await DK.configGet()).keys.qa)throw Error('Native encrypted key missing after process restart');return true;})()`);
    console.log(JSON.stringify({encryptedKeyProcessRestart:key,errors},null,2));if(errors.length)throw Error('Restart smoke renderer errors');return;
  }
  if (process.env.DESKLY_NATIVE_CHECK === '1') {
    const native = await evaluate(`(async()=>{ const info=await DK.appInfo();if(!info.encryption)throw Error('Secure native key storage unavailable'); const cfg=(await DK.configGet()).config;await DK.secretSet('qa','deskly-smoke-dummy-key',cfg.employees[0]);if(!(await DK.configGet()).keys.qa)throw Error('Key save failed'); const changed=JSON.parse(JSON.stringify(cfg));changed.employees[0].provider='custom';changed.employees[0].baseUrl='https://example.invalid/v1';await DK.configSave(changed);if((await DK.configGet()).keys.qa)throw Error('Old key followed endpoint change');await DK.configSave(cfg);const written=await DK.workspaceWrite('smoke.txt','hello');if(await DK.workspaceRead('smoke.txt')!=='hello')throw Error('Editor write failed');try{await DK.workspaceRead('.env');throw Error('Secret read accepted');}catch(error){if(!error.message.includes('secrets'))throw error;}try{await DK.configSave({...cfg,workspace:'C:\\\\'});throw Error('Forged root accepted');}catch(error){if(error.message==='Forged root accepted')throw error;}await DK.appFullscreen(true);await DK.appFullscreen(false);return{encryption:true,keyBinding:true,editor:true,forgedWorkspaceDenied:true,fullscreen:true};})()`);
    await evaluate(`localStorage.setItem('deskly.erase-test','must-disappear')`);
    await send('Page.reload');
    for (let tries=0;tries<100;tries++){if(await evaluate('!!window.__deskly?.player'))break;await delay(300);}
    if (!await evaluate('(async()=>!!(await DK.configGet()).keys.qa)()')) throw Error('Encrypted key did not survive renderer reload');
    await evaluate(`(()=>{window.lossExt=window.__deskly.renderer.getContext().getExtension('WEBGL_lose_context');if(!lossExt)throw Error('Context-loss extension unavailable');lossExt.loseContext();})()`);await delay(500);
    if (!await evaluate(`document.body.textContent.includes('Recovering office graphics')`)) throw Error('Graphics recovery overlay missing');
    await evaluate('lossExt.restoreContext()');await delay(1500);
    for(let tries=0;tries<100;tries++){if(await evaluate('!!window.__deskly?.player'))break;await delay(300);}
    if(!await evaluate('!!window.__deskly?.player'))throw Error('Graphics recovery did not reload the office');
    console.log(JSON.stringify({native,encryptedKeyReload:true,contextRecovery:true,errors},null,2));if(errors.some(e=>!e.includes('CONTEXT_LOST_WEBGL')))throw Error('Native smoke renderer errors');return;
  }
  if(process.env.DESKLY_RELEASE_SHOTS==='1'){
    await evaluate(`(()=>{const a=window.__deskly;window.checkRender=a.renderer.render.bind(a.renderer);a.screens.cfg={company:'Deskly',name:'Founder',employees:DesklyPresets.defaultTeam(),settings:{quality:'balanced'},security:{},assistant:{provider:'demo'}};a.refreshClock=()=>{const c=DesklyOfficeTime.info(new Date('2026-10-01T06:30:00Z'),'Asia/Kolkata');a.clockInfo=c;a.world.setTime(c);return c;};a.enterOffice();a.ui.close();a.playing=false;a.player.enabled=false;a.renderer.setPixelRatio(1);a.renderer.setSize(1920,1080);a.camera.aspect=16/9;a.camera.fov=75;a.camera.updateProjectionMatrix();a.office.arrivals=[];for(const e of a.office.employees){e.clear();e.errand=null;e.spawnAt(e.seat.p[0],e.seat.p[2],0);e.posture='sit';e.sitSeat=e.seat;}a.office.callMeeting('Boardroom',a.office.employees,'Deskly launch planning');})()`);
    await evaluate(`new Promise(resolve=>setTimeout(resolve,6500))`);
    await evaluate(`(()=>{const a=window.__deskly;for(let i=0;i<3000;i++){for(const e of a.office.employees)e.update(.05);if(a.office.meetingArrived()===15)break;}if(a.office.meetingArrived()!==15)throw Error('Meeting screenshot did not gather full team '+JSON.stringify(a.office.employees.filter(e=>!e.arrivedMeeting).map(e=>({name:e.name,p:e.pos,cur:e.cur,q:e.q.length,present:e.present,posture:e.posture}))));for(const e of a.office.employees)e.rig.update(.05,e.yaw);})()`);
    async function shot(name,pos,look){await evaluate(`(()=>{const a=window.__deskly;a.renderer.render=(s,c)=>{c.position.set(${pos.join(',')});c.lookAt(${look.join(',')});a.world.sky.mesh.position.copy(c.position);a.world.setShadowFocus(c.position);a.campus.treeT=0;a.campus.update(0);a.renderer.shadowMap.needsUpdate=true;checkRender(s,c);};})()`);const img=await capture();fs.writeFileSync(path.join(root,'docs/screenshots',name+'.png'),Buffer.from(img.data,'base64'));}
    await shot('meeting',[11.2,1.45,32.2],[16,1.4,32.2]);
    await shot('meeting-wide',[10.9,1.8,29.2],[14.2,1.25,32.8]);
    const portrait=await evaluate(`(()=>{const a=window.__deskly,e=a.office.employees.find(e=>e.meetSeat?.p[2]>33&&e.meetSeat?.p[0]>15)||a.office.employees[0];let head;e.rig.root.traverse(b=>{if(b.isBone&&b.name==='head')head=b;});const p=head.getWorldPosition(new THREE.Vector3());return{pos:[p.x+.35,p.y+.06,p.z-1.25],look:[p.x,p.y-.03,p.z]};})()`);
    await shot('employee-portrait',portrait.pos,portrait.look);

    await evaluate(`(()=>{const a=window.__deskly;a.office.endMeeting();a.world.setTime(DesklyOfficeTime.info(new Date('2026-10-01T06:30:00Z'),'Asia/Kolkata'));})()`);
    await shot('ceo-office',[7.8,1.75,35],[4.7,1.1,32.2]);
    await shot('courtyard',[26,2.1,-21],[20,1.9,7]);
    await evaluate(`(()=>{const a=window.__deskly;window.releaseSunset=DesklyOfficeTime.info(new Date('2026-10-01T12:25:00Z'),'Asia/Kolkata');a.refreshClock=()=>{a.world.setTime(releaseSunset);return releaseSunset;};a.world.setTime(releaseSunset);})()`);
    await shot('sky-sunset',[34,2.4,-21],[6,6,5]);
    await evaluate(`(()=>{const a=window.__deskly;window.releaseNight=DesklyOfficeTime.info(new Date('2026-10-01T17:30:00Z'),'Asia/Kolkata');a.refreshClock=()=>{a.world.setTime(releaseNight);return releaseNight;};a.world.setTime(releaseNight);a.world.setCeoLamp(true);})()`);
    await shot('ceo-night',[7.8,1.75,35],[4.7,1.1,32.2]);

    console.log(JSON.stringify({meetingEmployees:15,screenshots:['meeting','meeting-wide','ceo-office','courtyard','sky-sunset'],errors},null,2));if(errors.length)throw Error('Release screenshots failed');return;
  }
  if(process.env.DESKLY_CHARACTER_CHECK==='1'){
    const checks=await evaluate(`(async()=>{const a=window.__deskly;a.screens.cfg={company:'Deskly',name:'Founder',employees:DesklyPresets.defaultTeam(),settings:{quality:'balanced'},security:{},assistant:{provider:'demo'}};a.enterOffice();a.ui.close();a.playing=false;a.player.enabled=false;a.office.arrivals=[];for(const e of a.office.employees){e.clear();e.present=false;e.rig.root.visible=false;}a.office.employees.forEach(e=>a.office.recall(e));const pending=a.office.arrivals.filter(x=>!x.done&&x.recall);if(pending.length!==a.office.employees.length)throw Error('Missing recalled workers');for(let i=1;i<pending.length;i++)if(pending[i].at-pending[i-1].at<1.79)throw Error('Recall times overlap');a.office.runArrivals(a.time);if(a.office.employees.filter(e=>e.present).length!==1)throw Error('Employees stacked on entrance');const start=performance.now();let maxMs=0;for(let i=0;i<700;i++){a.time+=.05;a.office.runArrivals(a.time);const t=performance.now();for(const e of a.office.employees)e.update(.05);maxMs=Math.max(maxMs,performance.now()-t);}const arrived=a.office.employees.filter(e=>e.present).length;if(arrived!==15)throw Error('Recall did not finish: '+arrived);for(const e of a.office.employees){e.clear();e.present=false;e.rig.root.visible=false;e.meeting=null;}a.office.arrivals=[];a.office.callMeeting('Boardroom',a.office.employees,'Night recall regression');await new Promise(r=>setTimeout(r,6500));for(let i=0;i<2200;i++){a.time+=.05;a.office.runArrivals(a.time);for(const e of a.office.employees)e.update(.05);if(a.office.meetingArrived()===15)break;}if(a.office.meetingArrived()!==15)throw Error('Night recall lost meeting destinations');const necks=[];for(const e of a.office.employees){e.rig.root.traverse(b=>{if(b.isBone&&b.name==='head'){if(!Number.isFinite(b.quaternion.w))throw Error('Invalid head pose');necks.push(b.quaternion.toArray());}});}return{staggeredRecall:true,arrived,nightMeeting:true,simulationMs:Math.round(performance.now()-start),peakUpdateMs:Math.round(maxMs),necks:necks.length};})()`);
    await evaluate(`(()=>{const a=window.__deskly;window.checkRender=a.renderer.render.bind(a.renderer);window.checkRigs=[];for(let i=0;i<6;i++){const rig=DesklyHumanAssets.build(DesklyPresets.lookToRig({...DesklyPresets.defaultTeam()[i].look,faceA:i%3*.35,faceB:i%2*.45}));rig.root.position.set(18+i*.75,0,18);rig.setMode(i%2?'talk':'stand');rig.look={x:20,y:1.6,z:21};rig.update(.1,0);a.world.scene.add(rig.root);checkRigs.push(rig);}a.renderer.render=(s,c)=>{c.position.set(20,1.55,21.7);c.lookAt(20,1.5,18);checkRender(s,c);};})()`);
    const shot=await capture();fs.writeFileSync(path.join(root,'docs/visual-checks/character-necks-fixed.png'),Buffer.from(shot.data,'base64'));
    console.log(JSON.stringify({checks,errors},null,2));if(errors.length)throw Error('Character check failed');return;
  }
  if(process.env.DESKLY_TOOLS_CHECK==='1'){
    const checks=await evaluate(`(async()=>{const a=window.__deskly;a.screens.cfg={company:'Deskly',name:'Founder',employees:DesklyPresets.defaultTeam(),settings:{quality:'balanced'},security:{},assistant:{provider:'demo'}};a.enterOffice();if(a.ui.panelKind!=='guide')throw Error('First-run guide missing');a.ui.close();a.ui.openMap();if(a.ui.panelKind!=='map'||a.player.enabled)throw Error('Map input ownership failed');const roomButtons=[...document.querySelectorAll('.atlas-list button')];const ceo=roomButtons.find(b=>b.textContent.startsWith('CEO office'));if(!ceo)throw Error('CEO destination missing');ceo.click();if(!document.querySelector('.atlas-detail').textContent.includes('Walking route available'))throw Error('CEO route unavailable');document.querySelector('.atlas-detail button').click();if(!a.atlas.destination||!a.atlas.route.length)throw Error('Persistent navigation failed');a.ui.openMap();a.ui.close();if(!a.player.enabled)throw Error('Movement did not recover');await a.ui.openWhiteboard({room:'CEO_Office'});document.querySelector('.tool-bar button').click();const note=document.querySelector('.board-item textarea');note.value='Deskly launch plan';note.dispatchEvent(new Event('input'));const board=await a.freeboards.load('CEO_Office');await a.freeboards.persist('CEO_Office',board);a.freeboards.cache.delete('CEO_Office');const saved=await a.freeboards.load('CEO_Office');if(!saved.items.some(i=>i.text==='Deskly launch plan'))throw Error('Board persistence failed');note.focus();note.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true}));if(a.ui.panelKind||!a.player.enabled)throw Error('Board Escape did not restore controls');return{guide:true,map:true,route:true,boardPersistence:true,escapeMovement:true,physicalBoards:[...a.freeboards.surfaces.values()].reduce((n,s)=>n+s.length,0)};})()`);
    if(process.env.DESKLY_SMOKE_NO_SHOTS==='1'){console.log(JSON.stringify({checks,errors},null,2));if(errors.length)throw Error('Office tools renderer error');return;}
    const atlasShot=await evaluate(`(async()=>{const a=window.__deskly;a.ui.openMap();await new Promise(r=>requestAnimationFrame(r));a.ui.tick();const c=document.querySelector('.atlas-view canvas');if(c.width<700)throw Error('Atlas resolution too low');const img=c.toDataURL('image/png').split(',')[1];a.ui.close();return img;})()`);
    fs.writeFileSync(path.join(root,'docs/visual-checks/office-atlas.png'),Buffer.from(atlasShot,'base64'));
    await evaluate(`(()=>{const a=window.__deskly;window.checkRender=a.renderer.render.bind(a.renderer);a.renderer.render=(s,c)=>{c.position.set(2.8,1.6,27.3);c.lookAt(.2,1.525,27.3);checkRender(s,c);};})()`);
    await evaluate(`(()=>{const a=window.__deskly;a.renderer.render(a.world.scene,a.camera);const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(0,0),a.camera);const first=ray.intersectObjects(a.world.scene.children,true)[0];if(first?.object.name!=='Freeboard_CEO_Office')throw Error('CEO board is hidden by another surface');})()`);
    const boardShot=await capture();fs.mkdirSync(path.join(root,'docs/visual-checks'),{recursive:true});fs.writeFileSync(path.join(root,'docs/visual-checks/office-freeboard.png'),Buffer.from(boardShot.data,'base64'));
    console.log(JSON.stringify({checks,errors},null,2));if(errors.length)throw Error('Office tools renderer error');return;
  }
  if(process.env.DESKLY_CAMPUS_CHECK==='1'){
    await evaluate(`(()=>{const a=window.__deskly;window.checkRender=a.renderer.render.bind(a.renderer);a.screens.cfg={company:'Deskly',name:'Founder',employees:DesklyPresets.defaultTeam(),settings:{quality:'balanced'},security:{},assistant:{provider:'demo'}};a.refreshClock=()=>{const c=DesklyOfficeTime.info(new Date('2026-10-01T06:30:00Z'),'Asia/Kolkata');a.clockInfo=c;a.world.setTime(c);return c;};a.enterOffice();a.playing=false;a.player.enabled=false;for(const el of document.body.children)if(el.id!=='stage'&&el.tagName!=='SCRIPT')el.style.display='none';})()`);
    const restored=await evaluate(`(async()=>{const a=window.__deskly,original=await fetch('assets/world.json').then(r=>r.json());if(JSON.stringify(original.markers)!==JSON.stringify(a.world.markers))throw Error('Original marker positions or roles changed');if(a.headquarters||a.world.scene.getObjectByName('HQ_Exterior'))throw Error('Four-floor scene remains');if(!a.world.envelope.roof.visible)throw Error('Original roof missing');a.player.pos.set(20,0,-16);for(let i=0;i<220;i++)a.nav.move(a.player.pos,0,.1,.22);if(a.player.pos.z<4)throw Error('Courtyard entrance blocked');a.player.pos.set(5.5,0,10.2);for(let i=0;i<36;i++)a.nav.move(a.player.pos,0,-.1,.22);if(a.player.pos.z>6.8)throw Error('Kitchen doorway blocked');const exec=a.world.markers.find(m=>m.exec);a.sit(exec);if(!a.player.seated||a.player.pos.y!==0)throw Error('Original CEO seating failed');a.player.enabled=true;a.player.keys.KeyW=true;a.player.update(.05);a.player.keys={};a.player.enabled=false;if(a.player.seated)throw Error("Movement did not leave CEO seat");return{originalMarkers:true,groundFloor:true,roof:true,entranceWalk:true,ceoSeat:true,employees:a.office.employees.length};})()`);
    fs.mkdirSync(path.join(root,'docs/visual-checks'),{recursive:true});const views=[{pos:[5.5,1.65,10.2],look:[5.5,1.3,4.5],name:'office-kitchen-access'},{pos:[25,2,-22],look:[24,2,10],name:'office-outdoor-grounds'},{pos:[22,1.65,11],look:[13,1.4,20],name:'office-original-interior'},{pos:[7.6,1.65,34.75],look:[4.8,.85,33.45],name:'office-original-ceo'}],stats=[];
    for(const v of views){await evaluate(`(()=>{const a=window.__deskly;a.renderer.render=(s,c)=>{c.position.set(${v.pos.join(',')});c.lookAt(${v.look.join(',')});a.world.setShadowFocus(c.position);a.campus.treeT=0;a.campus.update(0);a.renderer.shadowMap.needsUpdate=true;checkRender(s,c);};})()`);const shot=await capture();fs.writeFileSync(path.join(root,'docs/visual-checks',v.name+'.png'),Buffer.from(shot.data,'base64'));stats.push(await evaluate(`(()=>{const r=window.__deskly.renderer;return{calls:r.info.render.calls,triangles:r.info.render.triangles,webglError:r.getContext().getError()};})()`));}
    await evaluate(`(()=>{const a=window.__deskly;for(const e of a.office.employees){e.clear();e.errand=null;e.spawnAt(e.seat.p[0],e.seat.p[2],0);e.posture='sit';e.sitSeat=e.seat;}a.office.callMeeting('Boardroom',a.office.employees,'Original office regression check');})()`);await delay(6500);
    const meeting=await evaluate(`(()=>{const a=window.__deskly;let steps=0;for(;steps<3000;steps++){for(const e of a.office.employees)e.update(.05);if(a.office.meetingArrived()===15)break;}if(a.office.meetingArrived()!==15)throw Error('Original meeting travel failed');return{arrived:a.office.meetingArrived(),seconds:steps*.05};})()`);
    console.log(JSON.stringify({restored,meeting,stats,errors},null,2));if(errors.length||stats.some(s=>s.webglError))throw Error('Single-floor check failed');return;
  }
  await evaluate(`(() => {
    const app = window.__deskly;
    const render = app.renderer.render.bind(app.renderer);
    window.checkRender=render;
    app.renderer.render = (scene, camera) => {
      camera.position.set(7.6, 1.65, 34.75); camera.lookAt(4.8, .85, 33.45);
      app.world.setShadowFocus(camera.position); render(scene, camera);
    };
    app.refreshClock = () => { const info = DesklyOfficeTime.info(new Date('2026-10-01T06:30:00Z'), 'Asia/Kolkata'); app.world.setTime(info); return info; };
    for (const element of document.body.children) if (element.id !== 'stage' && element.tagName !== 'SCRIPT') element.style.display = 'none';
    app.refreshClock();
  })()`);
  console.log('Office loaded. Capturing fixed daytime view.');
  await delay(1200);
  fs.mkdirSync(path.join(root, 'docs/visual-checks'), { recursive: true });
  const shot = await capture();
  fs.writeFileSync(path.join(root, 'docs/visual-checks/workstation-day.png'), Buffer.from(shot.data, 'base64'));
  const stats = await evaluate(`(() => { const app=window.__deskly; const r=app.renderer.info; return { calls:r.render.calls, triangles:r.render.triangles, textures:r.memory.textures, geometries:r.memory.geometries, authoredChair:!!app.world.scene.getObjectByName('CEO_Authored_Lounge_Chair'), quality:app.renderer.shadowMap.enabled, revision:THREE.REVISION }; })()`);
  if(process.env.DESKLY_VISUAL_CHARACTERS==='1'){
    await evaluate(`(()=>{const app=window.__deskly;window.checkRig=DesklyHumanAssets.build(DesklyPresets.lookToRig(DesklyPresets.defaultTeam()[${process.env.DESKLY_KENJI_CHECK==='1'?2:0}].look));if(!checkRig)throw Error('Detailed character unavailable');checkRig.root.position.set(4,0,31);app.world.scene.add(checkRig.root);app.renderer.render=(scene,camera)=>{camera.position.set(4,1.61,32.05);camera.lookAt(4,1.54,31);checkRig.update(1/60,0);checkRender(scene,camera);};})()`);
    await delay(700);let s=await capture();fs.writeFileSync(path.join(root,'docs/visual-checks/character-face.png'),Buffer.from(s.data,'base64'));
    await evaluate(`(()=>{const app=window.__deskly;app.renderer.render=(scene,camera)=>{camera.position.set(4,1.2,34);camera.lookAt(4,1,31);checkRig.update(1/60,0);checkRender(scene,camera);};})()`);
    await delay(500);s=await capture();fs.writeFileSync(path.join(root,'docs/visual-checks/character-body.png'),Buffer.from(s.data,'base64'));
    await evaluate(`checkRig.setMode('sitType');checkRig.seatH=.52;for(let i=0;i<120;i++)checkRig.update(1/60,0);`);
    await delay(700);s=await capture();fs.writeFileSync(path.join(root,'docs/visual-checks/character-seated.png'),Buffer.from(s.data,'base64'));
    await evaluate(`(()=>{const app=window.__deskly;app.world.scene.remove(checkRig.root);checkRig.dispose();checkRig=DesklyHumanAssets.build(DesklyPresets.lookToRig({...DesklyPresets.defaultTeam()[1].look,faceA:.2,faceB:.3}));checkRig.root.position.set(4,0,31);app.world.scene.add(checkRig.root);app.renderer.render=(scene,camera)=>{camera.position.set(4,1.53,32.1);camera.lookAt(4,1.45,31);checkRig.update(1/60,0);checkRender(scene,camera);};})()`);
    await delay(700);s=await capture();fs.writeFileSync(path.join(root,'docs/visual-checks/character-female.png'),Buffer.from(s.data,'base64'));
      for(const sex of ['male','female']){
        await evaluate(`(()=>{const app=window.__deskly;app.world.scene.remove(checkRig.root);checkRig.dispose();checkRig=DesklyHumanAssets.build(DesklyPresets.lookToRig({...DesklyPresets.defaultTeam()[0].look,assetId:'employee-${sex}'}));checkRig.root.position.set(4,0,31);app.world.scene.add(checkRig.root);checkRig.speed=1.3;checkRig.setMode('walk');})()`);
        for(let phase=0;phase<4;phase++){
          await evaluate(`(()=>{const app=window.__deskly;for(let i=0;i<15;i++)checkRig.update(1/60,0);app.renderer.render=(scene,camera)=>{camera.position.set(${phase%2?7:4},1.1,${phase%2?31:34});camera.lookAt(4,.9,31);checkRender(scene,camera);};})()`);
          s=await capture();fs.writeFileSync(path.join(root,`docs/visual-checks/walk-${sex}-${phase}.png`),Buffer.from(s.data,'base64'));
        }
      }
      await evaluate(`(()=>{const app=window.__deskly;app.world.scene.remove(checkRig.root);checkRig.dispose();app.renderer.render=(scene,camera)=>{camera.position.set(3,1.7,-10);camera.lookAt(10,2.5,-6.5);app.world.setShadowFocus(camera.position);checkRender(scene,camera);};})()`);
    await delay(500);s=await capture();fs.writeFileSync(path.join(root,'docs/visual-checks/outdoor-trees.png'),Buffer.from(s.data,'base64'));
    const roster=await evaluate(`(()=>{const app=window.__deskly;window.checkRoster=DesklyPresets.defaultTeam().map((e,i)=>{const rig=DesklyHumanAssets.build(DesklyPresets.lookToRig(e.look));if(!rig)throw Error('Roster model missing');rig.root.position.set(16+(i%6)*1.25,0,18+Math.floor(i/6)*1.7);rig.root.rotation.y=(i%3)*.2;const modes=['stand','walk','sitType','drink','point','phone'];rig.setMode(modes[i%6]);for(let f=0;f<90;f++)rig.update(1/60,rig.root.rotation.y);app.world.scene.add(rig.root);return rig;});app.renderer.render=(scene,camera)=>{camera.position.set(19,1.8,25);camera.lookAt(19,1.1,20);app.world.setShadowFocus(camera.position);checkRender(scene,camera);};app.renderer.render(app.world.scene,app.camera);const r=app.renderer.info;return{employees:checkRoster.length,calls:r.render.calls,triangles:r.render.triangles,textures:r.memory.textures,webglError:app.renderer.getContext().getError()};})()`);
    console.log('Full roster graphics check:',JSON.stringify(roster));if(roster.webglError)throw Error('Full roster WebGL error '+roster.webglError);
    s=await capture();fs.writeFileSync(path.join(root,'docs/visual-checks/detailed-roster.png'),Buffer.from(s.data,'base64'));
    await evaluate(`for(const rig of checkRoster){window.__deskly.world.scene.remove(rig.root);rig.dispose();}`);
    await evaluate(`(()=>{const app=window.__deskly;app.renderer.render=(scene,camera)=>{camera.position.set(7.6,1.65,34.75);camera.lookAt(4.8,.85,33.45);app.world.setShadowFocus(camera.position);checkRender(scene,camera);};})()`);
  }
  await evaluate(`window.__deskly.refreshClock=()=>{const i=DesklyOfficeTime.info(new Date('2026-10-01T17:30:00Z'),'Asia/Kolkata');window.__deskly.world.setTime(i);return i;}; window.__deskly.refreshClock();`);
  await delay(500);
  const night = await capture();
  fs.writeFileSync(path.join(root, 'docs/visual-checks/workstation-night.png'), Buffer.from(night.data, 'base64'));
  console.log(JSON.stringify({ stats, errors }, null, 2));
  if (errors.length || !stats.authoredChair) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  try { if (socket?.readyState === 1) socket.send(JSON.stringify({id:++id,method:'Browser.close'})); } catch {}
  socket?.close();
  await delay(300);
  electron.kill();
  for (const request of pending.values()) clearTimeout(request.timer);
  pending.clear();
  // Let WebSocket and child-process handles close naturally on Windows.
});
