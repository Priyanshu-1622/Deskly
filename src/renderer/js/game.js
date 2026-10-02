/* Deskly desktop renderer bootstrap: loads the office once, shows the start
   screen over a slow fly-through, then runs the first-person office. */
(async function () {
  const T = THREE;
  const $ = s => document.querySelector(s);
  const stage = $('#stage');
  let renderer;
  try { renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); }
  catch { const notice = document.createElement('div'); notice.className = 'screen'; const message = document.createElement('p'); message.textContent = 'Deskly could not start 3D graphics. Enable hardware acceleration and update your graphics driver, then retry.'; const retry = document.createElement('button'); retry.textContent = 'Retry graphics'; retry.onclick = () => location.reload(); notice.append(message, retry); document.body.append(notice); return; }
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);
  let contextNotice;
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault(); if (contextNotice) return; contextNotice = document.createElement('div'); contextNotice.className = 'screen'; contextNotice.style.cssText = 'position:fixed;inset:0;z-index:10000;display:grid;place-content:center;background:#171a15;color:white;text-align:center';
    const title = document.createElement('h2'); title.textContent = 'Recovering office graphics'; const message = document.createElement('p'); message.textContent = 'Your agent tasks are safe. Reload the office if graphics do not return.'; const retry = document.createElement('button'); retry.className='btn primary'; retry.textContent='Reload office'; retry.onclick=()=>location.reload(); contextNotice.append(title,message,retry); document.body.append(contextNotice);
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => { contextNotice?.remove(); contextNotice = null; location.reload(); });
  const performanceBudget = new DesklyPerformance(renderer);
  renderer.shadowMap.autoUpdate = false;
  const camera = new T.PerspectiveCamera(70, 1, 0.05, 240);
  const world = new DesklyWorld(renderer);
  world.scene.add(camera);
  const resize = () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
  addEventListener('resize', resize); resize();

  const app = { world, renderer, camera, time: 0, clock: new Date(), playing: false, office: null };
  window.__deskly = app;
  const screens = new DesklyScreens(app); app.screens = screens;
  const bar = $('#bootBar'), bootMsg = $('#bootMsg');
  const boot = (p, m) => { const percent = Math.round(p * 100); bar.style.width = percent + '%'; $('#bootPercent').textContent = String(percent).padStart(2, '0'); if (m) bootMsg.textContent = m; };

  let data;
  try {
    boot(0.1, 'Reading your settings…'); await screens.load();
    boot(0.3, 'Building the office…');
    data = await world.load(m => boot(0.7, m));
    await DesklyHumanAssets.load().catch(error => console.warn('Optional character library unavailable:', error.message));
    for(const employee of screens.cfg?.employees||[]){
      const look=employee.look||(employee.look={}),seed=[...employee.id].reduce((n,c)=>n+c.charCodeAt(0),0);
      look.faceA ??= [0,.2,.45,.65,0][seed%5];look.faceB ??= [0,.4,0,0,.7][seed%5];
      look.detailedHair ??= ['bob','long','braids'].includes(look.hairStyle)?1:['pony','ponytail','bun'].includes(look.hairStyle)?2:0;
    }
  } catch (e) { bootMsg.textContent = 'Deskly could not start: ' + e.message; console.error(e); return; }
  boot(1, 'Ready');
  const nav = new DesklyNav(data.grid);
  const player = new DesklyPlayer(camera, renderer.domElement, nav, data.layout.spawn);
  const audio = new DesklyOfficeAudio();
  renderer.domElement.tabIndex = 0;
  Object.assign(app, { nav, player, data, audio });
  app.campus=world.campus;app.nav=app.campus.attach(app,nav);app.performance=performanceBudget;
  app.nav.doorBlocked = (x, z) => world.doorBlocked(x, z);
  const bus = new DesklyRuntime.EventBus();
  const audit = { entries: [] };
  bus.on('*', ev => { if (!['task.progress', 'task.output'].includes(ev.type)) { audit.entries.push(ev); if (audit.entries.length > 400) audit.entries.shift(); } });
  const runtime = new DesklyRuntime.RuntimeClient(bus, msg => app.ui?.toast(msg, '#f0a020'));
  Object.assign(app, { bus, audit, runtime });
  await runtime.init();
  // Compile the actual lighting and character variants behind the loading
  // screen, before first-person movement can encounter a cold shader.
  boot(.95, 'Preparing graphics…');
  const warmRigs = DesklyHumanAssets.models().map(entry=>DesklyHumanAssets.build({assetId:entry.id})).filter(Boolean);
  for(const rig of warmRigs)world.scene.add(rig.root);
  world.setQuality(screens.settings().quality||'balanced');
  world.updateIndoorLights(camera.position);
  renderer.compile(world.scene,camera);
  // compile() prepares programs but does not upload textures or geometry.
  // Warm their GPU resources off-screen while the loading screen is visible.
  const warmTarget = new T.WebGLRenderTarget(64, 64), cullState = [];
  world.scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    cullState.push([mesh, mesh.frustumCulled]); mesh.frustumCulled = false;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) for (const value of Object.values(material || {})) if (value?.isTexture) renderer.initTexture(value);
  });
  try { renderer.setRenderTarget(warmTarget); renderer.shadowMap.needsUpdate = true; renderer.render(world.scene, camera); }
  finally { renderer.setRenderTarget(null); warmTarget.dispose(); for (const [mesh, culled] of cullState) mesh.frustumCulled = culled; }
  // Retain the shared material sets so compiling them is not immediately
  // undone by Three.js releasing their cached shader programs.
  for(const rig of warmRigs)world.scene.remove(rig.root);
  app.graphicsWarmups=warmRigs;
  const bootEl = $('#boot'); bootEl.classList.add('gone'); setTimeout(() => bootEl.remove(), 600);

  app.refreshClock = () => {
    const settings = screens.settings(), mode = settings.timeMode || 'real';
    if (app.timeMode !== mode) {
      app.timeMode = mode;
      app.previewStartedAt = Date.now(); app.previewDate = new Date();
    }
    app.clock = mode === 'preview' ? new Date(app.previewDate.getTime() + (Date.now() - app.previewStartedAt) * 300) : new Date();
    app.clockInfo = DesklyOfficeTime.info(app.clock, settings.timeZone || 'auto');
    world.setTime(app.clockInfo);
    return app.clockInfo;
  };
  app.refreshClock();

  /* ---------- settings ---------- */
  app.applySettings = () => {
    const st = screens.settings();
    performanceBudget.configure(st.quality || 'balanced', st.smoothPerformance !== false); resize();
    world.setQuality(st.quality || 'balanced');
    camera.fov = st.fov; camera.updateProjectionMatrix();
    player.sens = st.sensitivity; player.invertY = st.invertY;
    audio.setVolume(st.soundVolume);
    app.refreshClock();
    document.body.classList.toggle('no-tags', !st.nameTags);
    if (app.office && screens.cfg && app.teamSig !== teamSig(screens.cfg)) rebuildTeam();
  };
  const teamSig = c => JSON.stringify((c.employees || []).map(e => [e.id, e.name, e.dept, e.role, e.look, e.provider, e.model, e.resume]));

  /* ---------- the office ---------- */
  const M = data.markers;
  const exec = M.find(m => m.kind === 'chair' && m.exec && m.room === 'CEO_Office');
  function buildOffice(arrive) {
    app.config = screens.cfg;
    app.office = new DesklyAgents.Office(app);
    app.office.bindRuntime(bus, runtime);
    app.teamSig = teamSig(screens.cfg);
    if (arrive) app.office.startDay();
    else for (const e of app.office.employees) { const s = e.seat; e.spawnAt(s.p[0], s.p[2], Math.atan2(s.f[0], s.f[1])); e.posture = 'sit'; e.sitSeat = s; e.rig.seatH = s.seat; }
    // restore visible state for tasks that are still running
    for (const t of runtime.list()) {
      const e = app.office.byId(t.employeeId); if (!e) continue;
      const st = { planning: 'PLANNING', queued: 'PLANNING', running: 'WORKING', reviewing: 'WORKING', waiting_for_approval: 'WAITING_FOR_APPROVAL', failed: 'FAILED', interrupted: 'FAILED' }[t.status];
      if (st) e.setState(st); else if (t.status === 'completed' && !t.reviewed) e.setState('COMPLETED');
    }
    app.office.syncShift(true);
  }
  function rebuildTeam() {
    app.office.dispose?.();
    for (const e of app.office.employees) { world.scene.remove(e.rig.root); e.rig.dispose?.(); if (e.screen) { world.scene.remove(e.screen.plane); e.screen.plane.geometry.dispose(); e.screen.plane.material.dispose(); e.screen.tex.dispose(); } }
    world.screens = world.screens.filter(s => s === app.ceoScreens?.[0] || s === app.ceoScreens?.[1]);
    world.dayMaterials = null;
    buildOffice(false);
    ui.buildMinimapBase?.();
  }

  // your own desk screens
  app.ceoScreens = [];
  if (exec) {
    const sm = M.filter(m => m.kind === 'screen' && m.room === 'CEO_Office').sort((a, b) => Math.hypot(a.p[0] - exec.p[0], a.p[2] - exec.p[2]) - Math.hypot(b.p[0] - exec.p[0], b.p[2] - exec.p[2]));
    app.ceoScreens = sm.slice(0, 2).map(m => world.addScreen(m));
  }
  function drawCeo() {
    if (!app.office) return;
    const emps = app.office.employees, half = Math.ceil(emps.length / 2);
    app.ceoScreens.forEach((s, k) => {
      const g = s.ctx, W = s.canvas.width, H = s.canvas.height;
      g.fillStyle = '#0d1117'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#f2c230'; g.fillRect(0, 0, W, 16);
      g.fillStyle = '#1a1706'; g.font = 'bold 11px system-ui, sans-serif'; g.textBaseline = 'middle'; g.fillText(k ? 'E · open your laptop' : `${app.config.company} · Operations`, 6, 8.5);
      g.textBaseline = 'alphabetic';
      const list = k ? emps.slice(half) : emps.slice(0, half), rows = Math.max(1, half);
      list.forEach((e, i) => {
        const y = 30 + i * ((H - 34) / rows);
        g.fillStyle = DesklyAgents.STATUS[e.state].color; g.beginPath(); g.arc(10, y - 3, 3.5, 0, 7); g.fill();
        g.fillStyle = '#c9d1d9'; g.font = '10px system-ui, sans-serif'; g.fillText(e.name.split(' ').find(w => !/^Dr\.?$/.test(w)) || e.name, 18, y);
        g.fillStyle = '#7d8a96'; const t = runtime.activeFor(e.id);
        g.fillText(t ? `${Math.round(t.progress * 100)}% ${t.title}`.slice(0, 30) : (e.present ? DesklyAgents.STATUS[e.state].label : 'Not in yet'), 74, y);
      });
      s.tex.needsUpdate = true;
    });
  }

  /* ---------- UI ---------- */
  const ui = new DesklyUI(app); app.ui = ui;
  const life = new DesklyOfficeLife.OfficeLife(app); app.life = life;
  const surfaceAt = (x, z) => (x < 8 && z > 23) || (x > 15 && x < 25 && z > 1 && z < 27) ? 'wood' : z < 0 ? 'tile' : 'carpet';
  player.onStep = ({ x, z, run }) => audio.play('step', { surface: surfaceAt(x, z), run, gain: run ? 0.78 : 0.67 });
  world.onDoor = door => {
    if (!app.playing || Math.hypot(player.pos.x - door.c.x, player.pos.z - door.c.z) > 7) return;
    audio.play('door', { slide: door.slide, gain: 0.42 });
  };
  world.setLighting?.(life.state.lighting);
  world.setCeoLamp?.(life.state.ceoLamp);
  const updateBadge = () => {
    const emps = screens.cfg?.employees || [], n = emps.filter(e => e.provider && e.provider !== 'demo').length;
    ui.setProvider(n ? 'claude' : 'demo', n ? `${n} of ${emps.length} employees connected to AI` : 'Demo mode · add API keys in Settings');
  };
  bus.on('approval.required', ev => { const e = app.office?.byId(ev.employeeId); if (e) ui.toast(`${e.name.split(' ').find(w => !/^Dr\.?$/.test(w))} needs approval: ${ev.action.summary}`, '#f0a020', { label: 'Review', fn: () => ui.openEmployee(e) }); });
  bus.on('task.completed', ev => { const e = app.office?.byId(ev.employeeId); if (e) ui.toast(`${e.name.split(' ').find(w => !/^Dr\.?$/.test(w))} finished: ${ev.summary}`, '#2fbf71', { label: 'Review', fn: () => ui.openEmployee(e) }); });
  bus.on('task.status_changed', ev => {
    if (ev.status !== 'failed') return;
    const e = app.office?.byId(ev.employeeId);
    if (e) ui.toast(`${e.name.split(' ').find(w => !/^Dr\.?$/.test(w))}'s task failed: ${ev.task?.error || 'unknown error'}`, '#e0504a', { label: 'Open', fn: () => ui.openEmployee(e) });
  });

  /* ---------- interactions ---------- */
  const objects = [
    ...life.objects(M),
    ...app.campus.objects(),
    ...(exec ? [{ key: 'desk', x: exec.p[0] + exec.f[0] * 0.3, z: exec.p[2] + exec.f[1] * 0.3, r: 1.8, desk: true, short: 'Desk', fn: () => player.seated ? app.openLaptop() : app.sit() }] : []),
    ...M.filter(m => m.kind === 'chair' && !m.desk && !m.exec).map(c => ({
      key: `seat${c.p[0]}:${c.p[2]}`, x: c.p[0] - c.f[0] * 0.6, z: c.p[2] - c.f[1] * 0.6,
      r: 1.25, seat: c, short: 'Sit', fn: () => app.sit(c)
    })),
    ...[['Boardroom', 14, 32.2], ['Meeting_1', 20, 32.2], ['Meeting_2', 24, 32.2], ['Meeting_3', 28, 32.2]].map(([id, x, z]) => ({ key: 'room' + id, x, z, r: 2.6, room: id, short: 'Meeting', fn: () => app.office.meeting ? ui.meetingLive() : ui.openMeeting(null, id) }))
  ];
  app.canSitAt = seat => !player.seated &&
    !app.office?.employees.some(e => e.posture === 'sit' && e.sitSeat === seat) &&
    !app.office?.meeting?.people.some(e => e.meetSeat === seat);
  let focus = null;
  const focusLook = new T.Vector3(), focusVector = new T.Vector3();
  function findFocus() {
    const f = player.forward(), eye = camera.position, look = focusLook; camera.getWorldDirection(look);
    let best = null, bs = 1e9;
    for (const e of app.office.employees) {
      if (!e.present) continue;
      const v = focusVector.set(e.pos.x, e.pos.y + (e.posture === 'sit' ? 1.05 : 1.35), e.pos.z).sub(eye), d = v.length();
      if (d > 3.2) continue;
      const ang = v.normalize().angleTo(look); if (ang > 0.55) continue;
      const sc = ang * 3 + d * 0.3; if (sc < bs) { bs = sc; best = { kind: 'emp', e }; }
    }
    if (best) return best;
    for (const e of app.office.employees) {
      const m = e.screenMarker;
      if (!m || !e.present) continue;
      const v = focusVector.set(m.p[0], m.p[1], m.p[2]).sub(eye), d = v.length();
      if (d > 2.25) continue;
      const ang = v.normalize().angleTo(look); if (ang > 0.48) continue;
      const sc = ang * 3 + d * 0.25;
      if (sc < bs) { bs = sc; best = { kind: 'obj', o: { key: `monitor:${e.id}`, monitor: e, short: 'Monitor', fn: () => ui.openMonitor(e) } }; }
    }
    if (best) return best;
    for (const o of objects) {
      if (o.seat && !app.canSitAt(o.seat)) continue;
      const dx = o.x - player.pos.x, dz = o.z - player.pos.z, d = Math.hypot(dx, dz);
      if (d > o.r) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * f.x + dz * f.z) / (d || 1))));
      if (ang > 1.0 && d > 0.9) continue;
      if (d < bs) { bs = d; best = { kind: 'obj', o }; }
    }
    return best;
  }
  const promptFor = f => {
    if (!f) return null;
    if (f.kind === 'emp') {
      const e = f.e, t = runtime.activeFor(e.id);
      const sub = e.state === 'WAITING_FOR_APPROVAL' ? 'needs your approval' : e.state === 'COMPLETED' ? 'result ready' : t ? `${DesklyAgents.STATUS[e.state].label.toLowerCase()} · ${Math.round(t.progress * 100)}%` : e.role;
      return { key: e.id, label: `Talk to ${e.name}`, sub, short: 'Talk' };
    }
    const o = f.o;
    if (o.desk) return player.seated ? { key: 'lap', label: 'Open your laptop', sub: 'or C to call people', short: 'Laptop' } : { key: 'sit', label: 'Sit at your desk', sub: 'work from your chair', short: 'Sit' };
    if (o.seat) return { key: o.key, label: `Sit in ${String(o.seat.room || 'the office').replace(/_/g, ' ')}`, sub: 'W A S D to stand up', short: 'Sit' };
    if (o.monitor) return { key: o.key, label: `Inspect ${o.monitor.name}’s work`, sub: 'live task view · does not interrupt them', short: 'Monitor' };
    if (o.lifeKind === 'coffee') return { key: o.key, label: player.heldDrink?.type === 'coffee' ? 'Refill your coffee' : 'Pour a coffee', sub: 'F to drink · R to discard', short: 'Coffee' };
    if (o.lifeKind === 'water') return { key: o.key, label: player.heldDrink?.type === 'water' ? 'Refill your water' : 'Fill a water cup', sub: 'F to drink · R to discard', short: 'Water' };
    if (o.lifeKind === 'lamp') return { key: o.key, label: life.state.ceoLamp ? 'Switch off your office lamp' : 'Switch on your office lamp', short: 'Lamp' };
    return { key: o.key, label: o.room ? (app.office.meeting ? 'Run the meeting' : `Call a meeting in ${o.room.replace('_', ' ')}`) : o.label, sub: o.sub, short: o.short };
  };
  app.sit = (seat = exec) => {
    if (!seat || player.seated || (seat !== exec && !app.canSitAt(seat))) return;
    const returnPos = player.pos.clone();
    player.onStand = () => { audio.play('chair', { gain: 0.52 }); player.pos.copy(returnPos); player.seat = null; player.onStand = null; };
    player.seat = seat; player.seated = true;
    player.pos.set(seat.p[0], 0, seat.p[2]); player.yaw = Math.atan2(-seat.f[0], -seat.f[1]); player.pitch = -0.12; player.eyeY = (seat.seat || 0.52) + 0.7;
    audio.play('chair', { gain: 0.6 });
    ui.toast(seat === exec ? 'At your desk. L laptop · C call people · Tab board · W to stand up.' : 'Take a seat. M to run a meeting · W A S D to stand up.', '#f2c230');
  };
  app.interact = () => { if (ui.panelKind) return; focus=findFocus();if(!focus)return; if (focus.kind === 'emp') ui.openEmployee(focus.e); else focus.o.fn(); };
  app.office = null;
  app.office_onSay = null;

  /* ---------- flow ---------- */
  app.enterOffice = (fresh) => {
    if (!screens.cfg) return screens.setup();
    app.refreshClock();
    if (!app.office) { buildOffice(true); player.pos.set(app.data.layout.spawn.x, 0, app.data.layout.spawn.z); player.yaw = app.data.layout.spawn.yaw; player.pitch = -0.02; app.time = 0; }
    else if (app.teamSig !== teamSig(screens.cfg)) rebuildTeam();
    app.applySettings(); updateBadge();
    ui.buildMinimapBase?.();
    app.resume();
    if (fresh || !app.welcomed) {
      app.welcomed = true;
      const afterHours = !app.clockInfo.workday || app.clockInfo.hour < 9 || app.clockInfo.hour >= 18;
      setTimeout(() => ui.toast(afterHours ? 'The office is after hours. Press Tab → Team to call people back or assign overtime.' : `Welcome to ${app.config.company}. Walk up to anyone and press E.`, '#f2c230'), 500);
    }
  };
  app.resume = () => {
    screens.show(null); app.playing = true; player.enabled = true; $('#cross').hidden = false;
    renderer.domElement.focus();
    try { const r = renderer.domElement.requestPointerLock?.(); r?.catch?.(() => { }); } catch { }
  };
  app.pause = () => { app.playing = false; player.enabled = false; player.releaseLock(); ui.close(); screens.pause(); };
  app.openLaptop = path => { app.playing = false; player.enabled = false; player.releaseLock(); ui.close(); screens.laptop(path); };
  app.togglePhotoMode = () => {
    document.body.classList.toggle('photo-mode');
    ui.toast(document.body.classList.contains('photo-mode') ? 'Photo mode on · press P to restore the HUD.' : 'Photo mode off.', '#f2c230');
  };
  document.addEventListener('pointerlockchange', () => {
    $('#control-hint').hidden = !app.playing || !!document.pointerLockElement || player.touch;
  });
  $('#control-hint').addEventListener('click', () => {
    renderer.domElement.focus();
    renderer.domElement.requestPointerLock?.()?.catch?.(() => { });
  });
  addEventListener('keydown', e => {
    if (e.defaultPrevented) return;
    if ((e.ctrlKey || e.metaKey) && e.code === 'Comma') { e.preventDefault(); if (screens.cfg) { if (app.playing) app.pause(); screens.openSettings('general'); } return; }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyO') { e.preventDefault(); if (screens.cfg) DK.workspaceOpen().catch(err => screens.flash(err.message)); return; }
    if (e.target.closest && e.target.closest('input,textarea,select')) return;
    if (app.playing && e.code === 'Escape') { e.preventDefault(); app.pause(); }
    else if (!app.playing && e.code === 'Escape' && document.body.dataset.screen === 'screen-laptop') screens.closeLaptop();
    else if (!app.playing && e.code === 'Escape' && document.body.dataset.screen === 'screen-pause') app.resume();
    else if (app.playing && e.code === 'KeyL' && !ui.panelKind) app.openLaptop();
    else if (app.playing && e.code === 'KeyF' && !ui.panelKind) life.sip();
    else if (app.playing && e.code === 'KeyR' && !ui.panelKind) life.discard();
    else if (app.playing && e.code === 'KeyP' && !ui.panelKind) app.togglePhotoMode();
  });

  DesklyOfficeTools.install(app);
  DesklyAtlas.install(app);

  /* ---------- loop ---------- */
  let last = performance.now(), hudT = 0, mmT = 0, panelT = 0, skyT = 0, shiftT = 0, attract = 0;
  let frameErrors = 0, renderAt = 0; const actorPositions = [];
  function frame(now) {
    try {
      if (app.sceneFault) return;
    const rawDt=(now-last)/1000,dt=Math.min(.05,rawDt);last=now;
    const screen = document.body.dataset.screen;
    const panelOpen = !!ui.panelKind;
    const sceneVisible = !document.hidden && !['screen-setup', 'screen-settings'].includes(screen);
    const interactiveScene = app.playing && !panelOpen;
    const animatedMenu = screen === 'screen-start' && !panelOpen;
    const continuousScene = interactiveScene || animatedMenu;
    performanceBudget.update(rawDt,sceneVisible && continuousScene);
    skyT -= dt;
    if (skyT <= 0) { skyT = app.timeMode === 'preview' ? .5 : 5; app.refreshClock(); }
    if (app.office) {
      app.time += dt;
      app.office.runArrivals(app.time);
      shiftT -= dt;
      if (shiftT <= 0) { shiftT = 1; app.office.syncShift(); }
      app.characterStep = (app.characterStep || 0) + dt;
      if (interactiveScene || app.characterStep >= .05) { for (const e of app.office.employees) e.update(app.characterStep); app.characterStep = 0; }
      life.update(dt);
    }
    if (app.playing || app.office) player.update(app.playing ? dt : 0);
    if (animatedMenu) {
      attract += dt * 0.05;
      camera.position.set(30 + Math.cos(attract) * 34, 17 + Math.sin(attract * .7) * 3, 18 + Math.sin(attract) * 24);
      camera.lookAt(30, .5, 18);
    }
    app.campus.update(dt);
    world.sky.mesh.position.copy(camera.position);
    world.sky.uniforms.drift.value = (now * 0.000002) % 1;
    actorPositions.length = 0; if (app.office) { actorPositions.push(player.pos); for (const e of app.office.employees) if (e.present) actorPositions.push(e.pos); }
    world.update(dt, actorPositions);
    if (interactiveScene) { focus = findFocus(); ui.prompt(promptFor(focus)); } else ui.prompt(null);
    $('#hud').hidden = !app.playing; $('#seatbar').hidden = !(app.playing && player.seated);
    const heldbar = $('#heldbar'), held = player.heldDrink;
    heldbar.hidden = !app.playing || !held;
    if (held && heldbar.dataset.drink !== held.type+held.remaining) { heldbar.dataset.drink=held.type+held.remaining; const title=document.createElement('b'), count=document.createElement('span'), key=document.createElement('kbd'), discard=document.createElement('kbd'); title.textContent=held.type==='coffee'?'COFFEE':'WATER';count.textContent='●'.repeat(Math.max(0,held.remaining))+'○'.repeat(Math.max(0,held.max-held.remaining));key.textContent='F';discard.textContent='R';heldbar.replaceChildren(title,count,key,' drink ',discard,' discard'); }
    $('#control-hint').hidden = !app.playing || player.locked || player.touch;
    if(app.office&&interactiveScene){app.tagT=(app.tagT||0)-dt;if(app.tagT<=0){app.tagT=1/30;ui.tagsUpdate(camera);}}else if(ui.tags.size){$('#tags').replaceChildren();ui.tags.clear();}
    hudT -= dt; mmT -= dt; panelT -= dt;
    if (app.office && hudT <= 0) { hudT = 0.5; ui.counters(); ui.clock(app.clockInfo, app.timeMode === 'preview'); drawCeo();const status=$('#building-status');status.hidden=!app.playing||screens.settings().showFps===false;status.textContent=performanceBudget.fps+' FPS'; }
    if (app.office && interactiveScene && mmT <= 0) { mmT = 0.2; ui.minimap(player, app.office.employees); }
    if (panelT <= 0) { panelT = 0.33; ui.tick(); }
    app.lightT=(app.lightT||0)-dt;if(app.lightT<=0){app.lightT=.5;world.updateIndoorLights(camera.position);}
    if (sceneVisible && !contextNotice && (continuousScene || now - renderAt >= 200)) {
      renderAt = now;
      world.setShadowFocus(camera.position);
      performanceBudget.shadow(dt,true);
      renderer.render(world.scene, camera);
    }
    frameErrors = 0;
    } catch (error) { app.frameFaults = (app.frameFaults || 0) + 1; console.error('Office frame failed', error); if (++frameErrors === 3) { app.sceneFault = true; app.playing = false; player.enabled = false; const body = document.createElement('div'), message = document.createElement('p'), retry = document.createElement('button'); message.textContent = 'Office graphics paused after repeated errors. Agent tasks are still saved.'; retry.textContent = 'Reload office'; retry.className = 'btn primary'; retry.onclick = () => location.reload(); body.append(message, retry); ui.open('graphics-recovery', ui.hdr('Office graphics paused', 'Reload to recover'), body); } }
    finally { requestAnimationFrame(frame); }
  }
  app.applySettings = app.applySettings;
  (function initSettings() { const st = screens.settings(); player.sens = st.sensitivity; player.invertY = st.invertY; audio.setVolume(st.soundVolume); })();
  world.dayMaterials = null;
  screens.start();
  requestAnimationFrame(frame);
})();
