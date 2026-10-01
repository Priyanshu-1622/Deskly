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
