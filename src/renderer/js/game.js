/* Deskly desktop renderer bootstrap: loads the office once, shows the start
   screen over a slow fly-through, then runs the first-person office. */
(async function () {
  const T = THREE;
  const $ = s => document.querySelector(s);
  const stage = $('#stage');
  const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  stage.appendChild(renderer.domElement);
  const camera = new T.PerspectiveCamera(70, 1, 0.05, 240);
  const world = new DesklyWorld(renderer);
  world.scene.add(camera);
  const resize = () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
  addEventListener('resize', resize); resize();

  const app = { world, renderer, camera, time: 0, clock: new Date(), playing: false, office: null };
  window.__deskly = app;
  const screens = new DesklyScreens(app); app.screens = screens;
  const bar = $('#bootBar'), bootMsg = $('#bootMsg');
  const boot = (p, m) => { bar.style.width = Math.round(p * 100) + '%'; if (m) bootMsg.textContent = m; };

  let data;
  try {
    boot(0.1, 'Reading your settings…'); await screens.load();
    boot(0.3, 'Building the office…');
    data = await world.load(m => boot(0.7, m));
  } catch (e) { bootMsg.textContent = 'Deskly could not start: ' + e.message; console.error(e); return; }
  boot(1, 'Ready');
  const nav = new DesklyNav(data.grid);
  const player = new DesklyPlayer(camera, renderer.domElement, nav);
  renderer.domElement.tabIndex = 0;
  Object.assign(app, { nav, player, data });
  const bus = new DesklyRuntime.EventBus();
  const audit = { entries: [] };
  bus.on('*', ev => { if (!['task.progress', 'task.output'].includes(ev.type)) { audit.entries.push(ev); if (audit.entries.length > 400) audit.entries.shift(); } });
  const runtime = new DesklyRuntime.RuntimeClient(bus, msg => app.ui?.toast(msg, '#f0a020'));
  Object.assign(app, { bus, audit, runtime });
  await runtime.init();
  const bootEl = $('#boot'); bootEl.classList.add('gone'); setTimeout(() => bootEl.remove(), 600);

  /* ---------- settings ---------- */
  app.applySettings = () => {
    const st = screens.settings();
    const q = { high: Math.min(devicePixelRatio, 2), balanced: 1, low: 0.75 }[st.quality] || 1;
    renderer.setPixelRatio(q); resize();
    camera.fov = st.fov; camera.updateProjectionMatrix();
    player.sens = st.sensitivity; player.invertY = st.invertY;
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
      const st = { planning: 'PLANNING', queued: 'PLANNING', running: 'WORKING', reviewing: 'WORKING', waiting_for_approval: 'WAITING_FOR_APPROVAL' }[t.status];
      if (st) e.setState(st); else if (t.status === 'completed' && !t.reviewed) e.setState('COMPLETED');
    }
  }
  function rebuildTeam() {
    for (const e of app.office.employees) { world.scene.remove(e.rig.root); if (e.screen) world.scene.remove(e.screen.plane); }
    world.screens = world.screens.filter(s => s === app.ceoScreens?.[0] || s === app.ceoScreens?.[1]);
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
    ...M.filter(m => m.kind === 'coffee').map(c => ({ key: 'coffee' + c.p[0], x: c.p[0] + c.f[0] * 0.5, z: c.p[2] + c.f[1] * 0.5, r: 1.6, label: 'Grab a coffee', short: 'Coffee', fn: () => { player.giveCoffee(); ui.toast('Fresh coffee in hand.', '#c08a5a'); } })),
    ...(exec ? [{ key: 'desk', x: exec.p[0] + exec.f[0] * 0.3, z: exec.p[2] + exec.f[1] * 0.3, r: 1.8, desk: true, short: 'Desk', fn: () => player.seated ? app.openLaptop() : app.sit() }] : []),
    ...[['Boardroom', 14, 32.2], ['Meeting_1', 20, 32.2], ['Meeting_2', 24, 32.2], ['Meeting_3', 28, 32.2]].map(([id, x, z]) => ({ key: 'room' + id, x, z, r: 2.6, room: id, short: 'Meeting', fn: () => app.office.meeting ? ui.meetingLive() : ui.openMeeting(null, id) }))
  ];
  let focus = null;
  function findFocus() {
    const f = player.forward(), eye = camera.position, look = new T.Vector3(); camera.getWorldDirection(look);
    let best = null, bs = 1e9;
    for (const e of app.office.employees) {
      if (!e.present) continue;
      const v = new T.Vector3(e.pos.x, e.pos.y + (e.posture === 'sit' ? 1.05 : 1.35), e.pos.z).sub(eye), d = v.length();
      if (d > 3.2) continue;
      const ang = v.normalize().angleTo(look); if (ang > 0.55) continue;
      const sc = ang * 3 + d * 0.3; if (sc < bs) { bs = sc; best = { kind: 'emp', e }; }
    }
    if (best) return best;
    for (const o of objects) {
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
    return { key: o.key, label: o.room ? (app.office.meeting ? 'Run the meeting' : `Call a meeting in ${o.room.replace('_', ' ')}`) : o.label, sub: o.sub, short: o.short };
  };
  app.sit = () => {
    player.seated = true; player.pos.set(exec.p[0], 0, exec.p[2]); player.yaw = Math.atan2(-exec.f[0], -exec.f[1]); player.pitch = -0.12; player.eyeY = 1.22;
    ui.toast('At your desk. L laptop · C call people · Tab board · W to stand up.', '#f2c230');
  };
  app.interact = () => { if (ui.panelKind || !focus) return; if (focus.kind === 'emp') ui.openEmployee(focus.e); else focus.o.fn(); };
  app.office = null;
  app.office_onSay = null;

  /* ---------- flow ---------- */
  app.enterOffice = (fresh) => {
    if (!screens.cfg) return screens.setup();
    if (!app.office) { buildOffice(true); player.pos.set(20, 0, -6.4); player.yaw = Math.PI; player.pitch = -0.02; app.time = 0; }
    else if (app.teamSig !== teamSig(screens.cfg)) rebuildTeam();
    app.applySettings(); updateBadge();
    ui.buildMinimapBase?.();
    app.resume();
    if (fresh || !app.welcomed) { app.welcomed = true; setTimeout(() => ui.toast(`Welcome to ${app.config.company}. Walk up to anyone and press E.`, '#f2c230'), 500); }
  };
  app.resume = () => {
    screens.show(null); app.playing = true; player.enabled = true; $('#cross').hidden = false;
    renderer.domElement.focus();
    try { const r = renderer.domElement.requestPointerLock?.(); r?.catch?.(() => { }); } catch { }
  };
  app.pause = () => { app.playing = false; player.enabled = false; player.releaseLock(); ui.close(); screens.pause(); };
  app.openLaptop = path => { app.playing = false; player.enabled = false; player.releaseLock(); ui.close(); screens.laptop(path); };
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
  });

  /* ---------- loop ---------- */
  let last = performance.now(), hudT = 0, mmT = 0, panelT = 0, attract = 0;
  const start = new Date(); start.setHours(8, 52, 0, 0);
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (app.office) {
      app.time += dt; app.clock = new Date(start.getTime() + app.time * 20000);
      app.office.runArrivals(app.time);
      for (const e of app.office.employees) e.update(dt);
    }
    if (app.playing || app.office) player.update(app.playing ? dt : 0);
    if (!app.office || (!app.playing && document.body.dataset.screen === 'screen-start')) {
      attract += dt * 0.05;
      camera.position.set(30 + Math.cos(attract) * 34, 17 + Math.sin(attract * 0.7) * 3, 18 + Math.sin(attract) * 24);
      camera.lookAt(30, 0.5, 18);
    }
    world.update(dt, app.office ? [player.pos, ...app.office.employees.filter(e => e.present).map(e => e.pos)] : []);
    if (app.playing) { focus = findFocus(); ui.prompt(promptFor(focus)); } else ui.prompt(null);
    $('#hud').hidden = !app.playing; $('#seatbar').hidden = !(app.playing && player.seated);
    $('#control-hint').hidden = !app.playing || player.locked || player.touch;
    if (app.office && app.playing) ui.tagsUpdate(camera); else $('#tags').replaceChildren(), ui.tags?.clear?.();
    hudT -= dt; mmT -= dt; panelT -= dt;
    if (app.office && hudT <= 0) { hudT = 0.5; ui.counters(); ui.clock(app.clock); drawCeo(); }
    if (app.office && app.playing && mmT <= 0) { mmT = 0.2; ui.minimap(player, app.office.employees); }
    if (panelT <= 0) { panelT = 0.33; ui.tick(); }
    renderer.render(world.scene, camera);
    requestAnimationFrame(frame);
  }
  app.applySettings = app.applySettings;
  (function initSettings() { const st = screens.settings(); player.sens = st.sensitivity; player.invertY = st.invertY; })();
  screens.start();
  requestAnimationFrame(frame);
})();
