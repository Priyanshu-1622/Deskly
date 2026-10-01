// Isolated desktop render check; never reads or changes the founder's profile.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const port = 9257;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'deskly-visual-'));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const electron = spawn(path.join(root, 'node_modules/electron/dist/electron.exe'), [root, '--deskly-visual-check', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`], { cwd: root, env, windowsHide: true, stdio: 'ignore' });
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
  for (let tries = 0; tries < 70; tries++) { if (await evaluate('!!window.__deskly?.world?.data && !!window.__deskly?.player')) break; await delay(300); }
  const ready = await evaluate('!!window.__deskly?.world?.data && !!window.__deskly?.player');
  if (!ready) throw new Error('Office failed to initialize');
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
    await evaluate(`(()=>{const app=window.__deskly;window.checkRig=DesklyHumanAssets.build(DesklyPresets.lookToRig(DesklyPresets.defaultTeam()[0].look));if(!checkRig)throw Error('Detailed character unavailable');checkRig.root.position.set(4,0,31);app.world.scene.add(checkRig.root);app.renderer.render=(scene,camera)=>{camera.position.set(4,1.61,32.05);camera.lookAt(4,1.54,31);checkRig.update(1/60,0);checkRender(scene,camera);};})()`);
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
  socket?.close(); electron.kill();
  for (const request of pending.values()) clearTimeout(request.timer);
  pending.clear();
  process.exit(process.exitCode || 0);
});
