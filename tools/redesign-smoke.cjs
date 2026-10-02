// Source-only design verification. No packaging and no founder profile access.
const fs = require('node:fs');
const path = require('node:path');
module.exports = async function ({ send, evaluate, delay, root, errors }) {
  const directory = path.join(root, '.cache', 'redesign-check');
  fs.mkdirSync(directory, { recursive: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await evaluate(`(async()=>{await document.fonts.ready;const a=window.__deskly;a.screens.cfg={founder:'Alex Rivera',company:'Deskly Studio',workspace:'',employees:DesklyPresets.defaultTeam(),assistant:{provider:'demo'},settings:{quality:'low'},security:{approveWrites:true}};a.screens.start();window.designBoot=new DOMParser().parseFromString(await(await fetch('index.html')).text(),'text/html').querySelector('#boot');})()`);
  const results = [];
  const shot = async name => { await delay(160); const { data } = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(directory, name + '.png'), Buffer.from(data, 'base64')); };
  const layout = async name => {
    const result = await evaluate(`(()=>{const screen=[...document.querySelectorAll('.screen')].find(e=>!e.hidden);if(!screen)return{name:${JSON.stringify(name)}};const bounds=screen.getBoundingClientRect();return{name:${JSON.stringify(name)},width:innerWidth,height:innerHeight,horizontalOverflow:screen.scrollWidth>bounds.width+3};})()`);
    if (result.horizontalOverflow) throw Error('Horizontal overflow: ' + JSON.stringify(result));
    results.push(result);
  };
  await shot('01-main');
  const menuPoint = await evaluate(`(()=>{const r=document.querySelectorAll('#screen-start .mbtn')[1].getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...menuPoint });
  await evaluate(`if(!document.querySelectorAll('#screen-start .mbtn')[1].classList.contains('selected')||document.querySelectorAll('#screen-start .mbtn.selected').length!==1)throw Error('Mouse selection failed');`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown' });
  await evaluate(`if(!document.querySelectorAll('#screen-start .mbtn')[2].classList.contains('selected'))throw Error('Down selection failed');`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowUp', code: 'ArrowUp' });
  await evaluate(`if(!document.querySelectorAll('#screen-start .mbtn')[1].classList.contains('selected'))throw Error('Up selection failed');window.menuCamera=window.__deskly.camera.position.clone();`);
  for (let tries = 0; tries < 30; tries++) { if (await evaluate('window.menuCamera.distanceTo(window.__deskly.camera.position)>.02')) break; await delay(200); }
  await evaluate(`if(window.menuCamera.distanceTo(window.__deskly.camera.position)<.02)throw Error('Menu background stationary');`);
  await evaluate(`(async()=>{const a=window.__deskly;a.screens.cfg.workspace=(await DK.configGet()).config.workspace;await DK.configSave(a.screens.cfg);await DK.workspaceWrite('frontend/app.js',${JSON.stringify('// Source-only redesign fixture\nconst company = "Deskly";\n')});})()`);
  await evaluate(`window.__deskly.screens.setup()`);
  await evaluate(`(()=>{const founder=document.querySelector('#suFounder');founder.value='Taylor Morgan';founder.dispatchEvent(new Event('input'));if(!document.querySelector('.badge-name').textContent.includes('Taylor'))throw Error('Badge not live');})()`);
  await shot('03-badge');
  await evaluate(`document.querySelector('#suNext').click();document.querySelector('#suNext').click()`);
  if (await evaluate(`document.querySelectorAll('.hiring-team .tmember').length`) !== 15) throw Error('Hiring cards missing');
  await shot('04-team');
  await evaluate(`document.querySelector('.hiring-team .tmember').click();if(document.querySelector('.tedit').hidden)throw Error('Employee editor unavailable');`);
  await evaluate(`window.__deskly.screens.openSettings('team')`);
  await evaluate(`window.backgroundDraws=0;window.originalRender=window.__deskly.renderer.render;window.__deskly.renderer.render=function(...args){window.backgroundDraws++;return window.originalRender.apply(this,args);};`);
  await delay(400);
  await evaluate(`window.__deskly.renderer.render=window.originalRender;if(window.backgroundDraws)throw Error('Hidden office still rendering behind settings');`);
  if (await evaluate(`document.querySelectorAll('.key-entry').length`) !== 15) throw Error('Key directory missing');
  await shot('10-keys');
  await evaluate(`document.querySelector('.key-row .btn').click();if(document.querySelector('.key-editor').hidden)throw Error('Provider editor unavailable');`);
  await evaluate(`window.__deskly.enterOffice();window.__deskly.ui.close();`);
  await shot('08-hud');
  await evaluate(`window.__deskly.ui.openEmployee(window.__deskly.office.employees[0]);`);
  await evaluate(`(()=>{document.querySelector('#taskInput').value='Verify redesigned work-order approval';[...document.querySelectorAll('.employee-composer button')].find(button=>button.textContent==='Assign as task').click();})()`);
  for (let tries = 0; tries < 70; tries++) { if (await evaluate('window.__deskly.runtime.pendingApprovals().length>0')) break; await delay(100); }
  await delay(500);
  await evaluate(`(()=>{const approval=window.__deskly.runtime.pendingApprovals()[0];if(!approval)throw Error('Real demo write approval did not appear');window.__deskly.ui.tick();const text=document.querySelector('.approval-slip .log');if(!text||text.textContent!==approval.action.content)throw Error('Approval omitted exact proposed content: '+JSON.stringify({kind:window.__deskly.ui.panelKind,tasks:window.__deskly.runtime.list().map(t=>({id:t.id,status:t.status})),approval:approval.action.kind,text:text?.textContent}));if(document.activeElement?.textContent==='Approve')throw Error('Approval focused by default');})()`);
  await shot('05-agent');
  await evaluate(`(()=>{const buttons=document.querySelectorAll('#panel [role=tab]');buttons[1].click();if(document.querySelectorAll('.employee-page')[1].hidden)throw Error('Talk tab unavailable');buttons[2].click();if(document.querySelectorAll('.employee-page')[2].hidden)throw Error('Resume tab unavailable');buttons[0].click();})()`);
  await evaluate(`window.__deskly.ui.close();window.__deskly.pause()`);
  await shot('09-pause');
  await evaluate(`window.__deskly.screens.laptop('frontend/app.js')`);
  await shot('06-laptop');
  await evaluate(`if(!document.querySelector('#editor')||!document.querySelector('#termIn')||!document.querySelector('#askInput')||!document.querySelector('#delegateTo'))throw Error('Laptop function missing');window.__deskly.screens.closeLaptop();window.__deskly.ui.openBoard('approvals');`);
  await shot('07-operations');
  const rejectedId = await evaluate('window.__deskly.runtime.pendingApprovals()[0].id');
  await evaluate(`document.querySelector('.approval-slip .btn.danger').click()`);
  for (let tries = 0; tries < 50; tries++) { if (await evaluate(`!window.__deskly.runtime.pendingApprovals().some(approval=>approval.id===${JSON.stringify(rejectedId)})`)) break; await delay(100); }
  if (await evaluate(`window.__deskly.runtime.pendingApprovals().some(approval=>approval.id===${JSON.stringify(rejectedId)})`)) throw Error('Approval rejection did not reach runtime');
  await evaluate(`(async()=>{for(const task of window.__deskly.runtime.list())if(DesklyRuntime.ACTIVE.has(task.status))await DK.tasksCancel(task.id);})()`);
  await evaluate(`window.__deskly.ui.close();window.__deskly.playing=false;window.__deskly.screens.show(null);document.querySelector('#hud').hidden=true;document.body.append(designBoot);document.querySelector('#bootPercent').textContent='62';document.querySelector('#bootBar').style.width='62%';document.querySelector('#bootMsg').textContent='Preparing the office…';`);
  await shot('02-boot');
  await evaluate(`designBoot.remove()`);
  for (const [width, height] of [[1280,720], [1920,1080], [2560,1440], [3840,2160], [720,900]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    for (const [name, expression] of [['main','window.__deskly.screens.start()'], ['keys',"window.__deskly.screens.openSettings('team')"], ['pause','window.__deskly.screens.pause()'], ['laptop','window.__deskly.screens.laptop()']]) {
      await evaluate(expression); await delay(100); await layout(name);
      if (name === 'laptop') await evaluate('window.__deskly.screens.closeLaptop()');
    }
  }
  if (errors.length) throw Error('Redesign renderer errors: ' + errors.join('\n'));
  console.log(JSON.stringify({ redesign: true, screens: 10, liveBadge: true, hiringEditor: true, providerEditor: true, employeeTabs: true, realWorkOrder: true, exactApprovalContent: true, rejection: true, layouts: results, errors }, null, 2));
};
