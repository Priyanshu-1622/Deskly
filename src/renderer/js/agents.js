/* Deskly employees — the visual/behavioural layer for real agent work.
   Each Employee is a physical character bound to a role config and a
   workstation. Its visible state is driven by runtime task events. */
(function () {
  const T = THREE;
  const TAU = Math.PI * 2;
  const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];

  /* ---------------------------------------------------------------- roster */
  const DEPT_COLOR = Object.fromEntries(Object.entries(DesklyPresets.DEPARTMENTS).map(([k, v]) => [k, v.color]));
  const STATUS = {
    AVAILABLE: { label: 'Available', color: '#3fae6a' }, INTERACTING: { label: 'Talking with you', color: '#e8eef2' },
    PLANNING: { label: 'Planning', color: '#9b7be0' }, WORKING: { label: 'Working', color: '#3b8ff0' },
    WAITING_FOR_APPROVAL: { label: 'Needs your approval', color: '#f0a020' }, PAUSED: { label: 'Paused', color: '#9aa3ad' },
    COMPLETED: { label: 'Result ready', color: '#2fbf71' }, FAILED: { label: 'Failed', color: '#e0504a' }, IDLE: { label: 'Away', color: '#9aa3ad' }
  };
  const TASK_TO_STATE = { created: 'PLANNING', queued: 'PLANNING', planning: 'PLANNING', running: 'WORKING', reviewing: 'WORKING', waiting_for_approval: 'WAITING_FOR_APPROVAL', completed: 'COMPLETED', failed: 'FAILED', cancelled: 'AVAILABLE' };
  const shiftState = (saved, dateKey) => ({
    dateKey,
    overtime: Array.isArray(saved?.overtime) ? saved.overtime.slice() : [],
    recalled: Array.isArray(saved?.recalled) ? saved.recalled.slice() : [],
    sentHome: saved?.dateKey === dateKey && Array.isArray(saved?.sentHome) ? saved.sentHome.slice() : []
  });

  /* ---------------------------------------------------------------- status sprite */
  function statusSprite() {
    const c = document.createElement('canvas'); c.width = c.height = 96;
    const tex = new T.CanvasTexture(c); tex.encoding = T.sRGBEncoding;
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: true, transparent: true }));
    sp.scale.set(0.28, 0.28, 1);
    sp.userData = { c, ctx: c.getContext('2d'), tex, key: '' };
    return sp;
  }
  function drawStatus(sp, state, progress, t) {
    const key = state + ':' + Math.round((progress || 0) * 40);
    if (sp.userData.key === key) return;
    sp.userData.key = key;
    const { ctx, tex } = sp.userData, S = STATUS[state] || STATUS.AVAILABLE;
    ctx.clearRect(0, 0, 96, 96);
    ctx.fillStyle = 'rgba(20,24,28,0.82)'; ctx.beginPath(); ctx.arc(48, 48, 40, 0, TAU); ctx.fill();
    ctx.strokeStyle = S.color; ctx.lineWidth = 7; ctx.lineCap = 'round';
    if (state === 'WORKING' || state === 'PLANNING') {
      ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(48, 48, 33, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(48, 48, 33, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.04, progress || 0)); ctx.stroke();
    } else { ctx.beginPath(); ctx.arc(48, 48, 33, 0, TAU); ctx.stroke(); }
    ctx.fillStyle = S.color; ctx.font = 'bold 38px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const glyph = { PLANNING: '…', WORKING: Math.round((progress || 0) * 100) + '', WAITING_FOR_APPROVAL: '!', COMPLETED: '✓', FAILED: '×', INTERACTING: '•••', PAUSED: 'II' }[state] || '';
    if (state === 'WORKING') ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText(glyph, 48, 51);
    tex.needsUpdate = true;
  }

  /* ---------------------------------------------------------------- employee */
  class Employee {
    constructor(def, ctx) {
      Object.assign(this, def);
      this.ctx = ctx;                                   // {world, nav, office, runtime, player}
      this.rig = DesklyHumanAssets.build(def.look) || Human.build(def.look);
      this.pos = new T.Vector3(); this.yaw = 0; this.vel = 0;
      this.q = []; this.cur = null; this.posture = 'stand'; this.state = 'AVAILABLE';
      this.activity = 'Arriving'; this.bubble = null; this.nextIdle = rnd(20, 45); this.greeted = false;
      this.sprite = statusSprite(); this.sprite.visible = false;
      this.rig.root.add(this.sprite); this.sprite.position.set(0, 2.08, 0);
      this.present = false; this.rig.root.visible = false;
      ctx.world.scene.add(this.rig.root);
      this.color = DEPT_COLOR[def.dept];
      this.meeting = null; this.errand = null;
      this.screenT = 0;
      this.animationT = [...String(def.id)].reduce((seed,char)=>seed+char.charCodeAt(0),0)%31/930;
    }
    get head() { return new T.Vector3(this.pos.x, this.pos.y + 1.62 * this.rig.s, this.pos.z); }
    taskInfo() { const t = this.ctx.runtime.activeFor(this.id) || (this.state === 'COMPLETED' || this.state === 'FAILED' ? this.ctx.runtime.latestFor(this.id) : null); return t; }

    /* queue helpers */
    clear() { this.q = []; this.cur = null; this.path = null; }
    push(...a) { this.q.push(...a); return this; }
    approach(seat) { return { x: seat.p[0] - seat.f[0] * 0.62, z: seat.p[2] - seat.f[1] * 0.62 }; }
    goDesk() { this.push({ type: 'stand' }, { type: 'goto', ...this.approach(this.seat) }, { type: 'sit', seat: this.seat }); }
    say(text, dur = 4.5) { this.bubble = { text, until: this.ctx.time + dur }; this.rig.talking = Math.min(dur, 2.5 + text.length / 30); this.ctx.office.onSay?.(this, text); }

    spawnAt(x, z, yaw) { this.pos.set(x, 0, z); this.yaw = yaw; this.present = true; this.rig.root.visible = true; }

    setState(s) {
      if (this.state === s) return;
      this.state = s;
      this.sprite.visible = !['AVAILABLE', 'IDLE'].includes(s);
      this.ctx.office.onState?.(this, s);
    }

    update(dt) {
      if (!this.present) return;
      const rig = this.rig, time = this.ctx.time;
      if (!this.cur && this.q.length) { this.cur = this.q.shift(); this.cur.t = 0; }
      const a = this.cur;
      let mode = this.posture === 'sit' ? this.sitMode() : this.standMode();
      if (a) {
        a.t += dt;
        switch (a.type) {
          case 'goto': {
            if (this.posture === 'sit') { this.standUp(); break; }
            if (!this.path) {
              this.path = this.ctx.nav.path(this.pos, a);
              if(!this.path||!this.path.length){this.activity='Waiting for a clear route';if(a.t>12)this.done();break;}
              this.pi = 0;
            }
            const tgt = this.path[this.pi];
            const dx = tgt.x - this.pos.x, dz = tgt.z - this.pos.z, d = Math.hypot(dx, dz);
            const sp = a.run ? 2.4 : 1.3;
            if (d < 0.12) { this.pi++; if (this.pi >= this.path.length) { this.done(); break; } }
            else {
              const nx=this.pos.x+dx/d*.6,nz=this.pos.z+dz/d*.6;
              const yielding=this.ctx.office.employees.some(other=>other!==this&&other.present&&other.posture!=='sit'&&Math.hypot(other.pos.x-nx,other.pos.z-nz)<.45&&Math.hypot(other.pos.x-this.pos.x,other.pos.z-this.pos.z)<.85&&this.ctx.office.employees.indexOf(other)<this.ctx.office.employees.indexOf(this));
              if(yielding){mode='stand';break;}
              const step = Math.min(d, sp * dt);
              this.pos.x += dx / d * step; this.pos.z += dz / d * step;
              this.stepTravel = (this.stepTravel || 0) + step;
              if (this.stepTravel >= (a.run ? 0.72 : 0.88)) {
                this.stepTravel = 0;
                const player = this.ctx.player.pos, distance = Math.hypot(player.x - this.pos.x, player.z - this.pos.z);
                if (this.ctx.playing && distance < 7) this.ctx.audio?.play('step', { actor: this.id, surface: this.pos.x < 8 && this.pos.z > 23 ? 'wood' : 'carpet', gain: Math.max(0.08, 0.28 * (1 - distance / 7)), pan: Math.max(-0.7, Math.min(0.7, (this.pos.x - player.x) / 5)) });
              }
              const ty = Math.atan2(dx, dz);
              this.yaw += angDiff(ty, this.yaw) * Math.min(1, dt * 8);
              mode = a.run ? 'run' : 'walk'; rig.speed = sp;
            }
            if (a.t > 60) { this.done(); }
            // live target (following the player)
            if (a.follow && a.t > 0.8) { const p = a.follow(); if (p && Math.hypot(p.x - a.x, p.z - a.z) > 1.2) { a.x = p.x; a.z = p.z; this.path = null; } }
            if (a.stopNear && a.stopNear()) this.done();
            break;
          }
          case 'sit': {
            const s = a.seat;
            this.pos.x += (s.p[0] - this.pos.x) * Math.min(1, dt * 6); this.pos.z += (s.p[2] - this.pos.z) * Math.min(1, dt * 6);
            const ty = Math.atan2(s.f[0], s.f[1]);
            this.yaw += angDiff(ty, this.yaw) * Math.min(1, dt * 7);
            rig.seatH = s.seat || 0.5;
            if (a.t > 0.45) { this.posture = 'sit'; this.sitSeat = s; this.done(); }
            mode = 'sit';
            break;
          }
          case 'stand': if (this.posture === 'sit') this.standUp(); else this.done(); break;
          case 'anim': mode = a.mode; if (a.t > a.dur) this.done(); break;
          case 'face': { this.yaw += angDiff(a.yaw ?? Math.atan2(a.x - this.pos.x, a.z - this.pos.z), this.yaw) * Math.min(1, dt * 7); if (a.t > 0.5) this.done(); break; }
          case 'say': this.say(a.text, a.dur); this.done(); break;
          case 'wait': if (a.t > a.dur) this.done(); break;
          case 'call': a.fn(this); this.done(); break;
          case 'hide': this.present = false; rig.root.visible = false; this.done(); break;
        }
      } else if (!this.meeting && !this.errand) {
        this.idleBrain(dt);
      }
      if (this.standing) { this.standing -= dt; mode = 'stand'; if (this.standing <= 0) this.standing = 0; }

      // look at the player when they're close and in front
      const P = this.ctx.player.pos;
      const pd = Math.hypot(P.x - this.pos.x, P.z - this.pos.z);
      const pang = Math.abs(angDiff(Math.atan2(P.x - this.pos.x, P.z - this.pos.z), this.yaw));
      rig.look = (pd < 4.5 && pang < 1.9) || this.interacting ? { x: P.x, y: this.ctx.player.eyeY, z: P.z } : (this.lookAt || null);
      if (!this.greeted && pd < 3.2 && this.present && !this.meeting && time > 2) {
        this.greeted = true;
        const hr = this.ctx.office.hour();
        const g = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
        if (!a || a.type !== 'goto') {
          this.say(pick([`${g}!`, `${g}, boss.`, `Hey! ${g}.`, `${g} — good to see you.`]), 2.6);
          if (this.posture === 'stand' && !a) this.push({ type: 'anim', mode: 'wave', dur: 1.6 });
        }
      }
      // animation
      if (this.override && this.override.until > time) mode = this.override.mode;
      if (this.interacting && this.posture === 'stand' && (!a || a.type !== 'goto')) {
        mode = this.rig.talking > 0 ? 'talk' : 'stand';
        this.yaw += angDiff(Math.atan2(P.x - this.pos.x, P.z - this.pos.z), this.yaw) * Math.min(1, dt * 4);
      }
      rig.setMode(mode);
      rig.root.position.copy(this.pos); rig.root.rotation.y = this.yaw;
      const shadowNear=pd<20;if(this.shadowNear!==shadowNear){this.shadowNear=shadowNear;rig.root.traverse(m=>{if(m.isMesh)m.castShadow=shadowNear&&!/^Hair_|Eyeballs|Eyebrows/.test(m.name);});}
      this.animationT=(this.animationT||0)+dt;
      const f=this.ctx.player.forward(),inView=((this.pos.x-P.x)*f.x+(this.pos.z-P.z)*f.z)>-2;
      const interval=pd<5?1/30:inView&&pd<18?1/20:inView&&pd<35?1/10:1/4;
      if(this.animationT>=interval){rig.update(this.animationT,this.yaw);this.animationT=0;}
      const task = this.taskInfo();
      this.statusT=(this.statusT||0)-dt;if(this.statusT<=0){drawStatus(this.sprite,this.state,task?task.progress:0,time);this.statusT=.2;}
      if (this.state === 'WAITING_FOR_APPROVAL') this.sprite.scale.setScalar(0.28 + Math.sin(time * 6) * 0.03);
      else this.sprite.scale.setScalar(0.28);
      if (this.bubble && this.bubble.until < time) this.bubble = null;
      // workstation screen
      this.screenT -= dt;
      if (this.screen && this.screenT <= 0) { this.screenT = 0.5; this.ctx.office.drawScreen(this); }
    }
    done() { this.cur = null; this.path = null; }
    standUp() {
      const s = this.sitSeat;
      this.posture = 'stand'; this.standing = 0.35;
      if (s) { this.pos.x = s.p[0] - s.f[0] * 0.5; this.pos.z = s.p[2] - s.f[1] * 0.5; }
      this.sitSeat = null;
    }
    atDesk() { return this.posture === 'sit' && this.sitSeat === this.seat; }
    sitMode() {
      if (this.meeting) return this.meeting.speaking === this ? 'sitTalk' : 'sitMeeting';
      if (this.rig.cup.visible) return 'sitDrink';
      if (this.atDesk() && ['WORKING', 'PLANNING'].includes(this.state)) return 'sitType';
      if (this.atDesk() && this.state === 'AVAILABLE') return (this.ctx.time % 23) < 15 ? 'sitType' : 'sit';
      return this.rig.talking > 0 ? 'sitTalk' : 'sit';
    }
    standMode() {
      if (this.meeting) return this.meeting.speaking === this ? 'talk' : 'stand';
      if (this.state === 'WAITING_FOR_APPROVAL' && !this.interacting) return 'raise';
      if (this.rig.cup.visible) return 'drink';
      if (this.rig.phone.visible) return 'phone';
      return this.rig.talking > 0 ? 'talk' : 'stand';
    }

    /* ambient life when available */
    idleBrain(dt) {
      if (this.interacting) return;
      const s = this.state;
      if (['WORKING', 'PLANNING'].includes(s)) {
        if (!this.atDesk()) { this.activity = 'Heading to desk'; this.goDesk(); }
        else this.activity = s === 'PLANNING' ? 'Planning the work' : 'Working on the task';
        return;
      }
      if (s === 'WAITING_FOR_APPROVAL') return;          // handled by office
      if (!this.atDesk() && s !== 'COMPLETED') { this.activity = 'Back to desk'; this.goDesk(); return; }
      this.activity = s === 'COMPLETED' ? 'Waiting for your review' : 'At desk';
      this.nextIdle -= dt;
      if (this.nextIdle > 0) return;
      this.nextIdle = rnd(35, 80);
      const o = this.ctx.office, r = Math.random();
      if (r < 0.34) this.coffeeRun();
      else if (r < 0.5) this.push({ type: 'stand' }, { type: 'anim', mode: 'stretch', dur: 2.6 }, { type: 'sit', seat: this.seat }), this.activity = 'Stretching';
      else if (r < 0.7) {
        const mate = o.neighbour(this);
        if (mate) {
          this.activity = `Chatting with ${mate.name.split(' ')[0]}`;
          const sp = { x: mate.seat.p[0] - mate.seat.f[0] * 0.7 + mate.seat.f[1] * 0.5, z: mate.seat.p[2] - mate.seat.f[1] * 0.7 - mate.seat.f[0] * 0.5 };
          this.push({ type: 'stand' }, { type: 'goto', ...sp }, { type: 'face', x: mate.pos.x, z: mate.pos.z },
            { type: 'call', fn: () => { mate.lookAt = this.head; mate.say(pick(o.chatLines(mate)), 3.5); } },
            { type: 'say', text: pick(o.chatLines(this)), dur: 3.5 }, { type: 'anim', mode: 'talk', dur: 4 },
            { type: 'call', fn: () => { mate.lookAt = null; } }, { type: 'goto', ...this.approach(this.seat) }, { type: 'sit', seat: this.seat });
        }
      } else if (r < 0.82) {
        const wc = o.nearestPoi(this.pos, 'water');
        if (wc) { this.activity = 'Getting water'; this.push({ type: 'stand' }, { type: 'goto', x: wc.p[0], z: wc.p[2] }, { type: 'face', yaw: Math.atan2(wc.f[0], wc.f[1]) }, { type: 'anim', mode: 'drink', dur: 4 }); this.goDesk(); }
      } else {
        this.activity = 'Checking phone';
        this.push({ type: 'stand' }, { type: 'call', fn: () => { this.rig.phone.visible = true; } }, { type: 'anim', mode: 'phone', dur: 5 },
          { type: 'call', fn: () => { this.rig.phone.visible = false; } }, { type: 'sit', seat: this.seat });
      }
    }
    coffeeRun(then) {
      const o = this.ctx.office, cm = o.nearestPoi(this.pos, 'coffee');
      if (!cm) return;
      this.activity = 'Getting coffee';
      this.push({ type: 'stand' }, { type: 'goto', x: cm.p[0], z: cm.p[2] }, { type: 'face', yaw: Math.atan2(cm.f[0], cm.f[1]) }, { type: 'anim', mode: 'point', dur: 1.2 },
        { type: 'wait', dur: 2.2 }, { type: 'call', fn: () => { this.rig.cup.visible = true; } });
      if (then) then(this); else {
        this.goDesk();
        this.push({ type: 'wait', dur: 20 }, { type: 'call', fn: () => { this.rig.cup.visible = false; } });
      }
    }
  }

  /* ---------------------------------------------------------------- office controller */
  class Office {
    constructor(ctx) {
      this.ctx = ctx; ctx.office = this;
      const M = ctx.world.markers;
      this.chairs = M.filter(m => m.kind === 'chair');
      this.screensM = M.filter(m => m.kind === 'screen');
      this.pois = M.filter(m => ['coffee', 'water', 'printer', 'whiteboard', 'tvwatch'].includes(m.kind));
      const D = DesklyPresets.DEPARTMENTS;
      this.employees = (ctx.config.employees || []).map(d => new Employee({ ...d, dept: D[d.dept] ? d.dept : 'Engineering', room: (D[d.dept] || D.Engineering).room, tasks: d.tasks || [], look: DesklyPresets.lookToRig(d.look || {}) }, ctx));
      this.assignSeats();
      this.meeting = null;
      const saved = ctx.life?.state.shift;
      this.shift = shiftState(saved, ctx.clockInfo.dateKey);
      if (ctx.life) { ctx.life.state.shift = this.shift; ctx.life.save(); }
    }
    hour() { return this.ctx.clockInfo.hour + this.ctx.clockInfo.minute / 60; }
    assignSeats() {
      const used = new Set();
      const byRoom = r => this.chairs.filter(c => c.room === r);
      const anchors = { Dept_Engineering: [8, 16.5], Dept_Design: [20.5, 17.6], Dept_Marketing: [28.5, 17.6], Dept_Research: [52, 17.6], Dept_Finance: [43, 17.6],
        Dept_Sales: [36, 16.6], Dept_Support: [53, 16.6], Dept_HR: [36.5, 17.6], IT_Helpdesk: [44, 14], Reception: [19, 6.3] };
      const counts = {};
      for (const e of this.employees) {
        let cands = byRoom(e.room).filter(c => (c.desk || e.room === 'Reception' || e.room === 'IT_Helpdesk') && !used.has(c));
        const [ax, az] = anchors[e.room] || [30, 18];
        cands.sort((a, b) => Math.hypot(a.p[0] - ax, a.p[2] - az) - Math.hypot(b.p[0] - ax, b.p[2] - az));
        const k = counts[e.room] = (counts[e.room] || 0) + 1;
        let seat = cands[Math.min(cands.length - 1, (k - 1) * (e.room === 'Reception' ? 1 : 3))] || cands[0];
        if (!seat) seat = this.chairs.filter(c => c.desk && !used.has(c)).sort((a, b) => Math.hypot(a.p[0] - ax, a.p[2] - az) - Math.hypot(b.p[0] - ax, b.p[2] - az))[0];
        used.add(seat); e.seat = seat;
        const fw = seat.f;
        let best = null, bd = 9;
        for (const s of this.screensM) {
          const dx = s.p[0] - seat.p[0], dz = s.p[2] - seat.p[2];
          const along = dx * fw[0] + dz * fw[1], side = Math.abs(dx * fw[1] - dz * fw[0]);
          if (along > 0.3 && along < 1.3 && side < 0.8) { const d = side + Math.abs(along - 0.8); if (d < bd) { bd = d; best = s; } }
        }
        if (best) { e.screenMarker = best; e.screen = this.ctx.world.addScreen(best); }
      }
    }
    nearestPoi(p, kind) {
      let best = null, bd = 1e9;
      for (const m of this.pois) if (m.kind === kind) { const d = Math.hypot(m.p[0] - p.x, m.p[2] - p.z); if (d < bd) { bd = d; best = m; } }
      return best;
    }
    neighbour(e) {
      const c = this.employees.filter(o => o !== e && o.atDesk() && !o.meeting && o.state === 'AVAILABLE' && Math.hypot(o.pos.x - e.pos.x, o.pos.z - e.pos.z) < 9);
      return c.length ? pick(c) : null;
    }
    chatLines(e) {
      return ({
        Engineering: ['Did the build go green?', 'I refactored that module — much cleaner.', 'Pair on this later?', 'Tests are flaky again.'],
        Design: ['What do you think of this layout?', 'The new icons are in Figma.', 'Users loved the prototype.'],
        Marketing: ['The newsletter open rate jumped!', 'Need a headline — any ideas?', 'Launch post is almost ready.'],
        Research: ['Found a great paper on this.', 'The survey results are interesting.', 'Sample size is still small.'],
        Finance: ['Numbers look healthy this week.', 'Churn dipped a bit.', 'Forecast is updated.'],
        Sales: ['Just booked a demo!', 'That pilot looks promising.', 'Pipeline is growing.'],
        Support: ['Queue is under control.', 'Customer sent a lovely note.', 'Found the root cause of that bug.'],
        HR: ['Two new hires start Monday.', 'Offsite plans are coming together.'],
        IT: ['Remember to update your laptop.', 'Rotated the Wi-Fi password.'],
        Reception: ['Visitors at 2pm today.', 'Coffee beans restocked!']
      })[e.dept] || ['How is it going?'];
    }

    /* ---------------- morning arrival ---------------- */
    startDay() {
      if (!this.ctx.clockInfo.workday || this.hour() < 9 || this.hour() >= 18) { this.arrivals = []; return; }
      if (this.hour() >= 11) {
        this.arrivals = [];
        for (const e of this.employees) {
          const s = e.seat; e.spawnAt(s.p[0], s.p[2], Math.atan2(s.f[0], s.f[1]));
          e.posture = 'sit'; e.sitSeat = s; e.rig.seatH = s.seat;
        }
        return;
      }
      const early = new Set(this.employees.filter((e, i) => i % 3 === 0).map(e => e.id));
      const rec = this.employees.find(e => e.dept === 'Reception');
      this.arrivals = [];
      let t = 1.5;
      for (const e of this.employees) {
        if (e === rec) { e.spawnAt(e.seat.p[0], e.seat.p[2], Math.atan2(e.seat.f[0], e.seat.f[1])); e.push({ type: 'sit', seat: e.seat }); continue; }
        if (early.has(e.id)) { const s = e.seat; e.spawnAt(s.p[0], s.p[2], Math.atan2(s.f[0], s.f[1])); e.posture = 'sit'; e.sitSeat = s; e.rig.seatH = s.seat; continue; }
        this.arrivals.push({ e, at: t, via: Math.random() < 0.55 ? 'lift' : 'door' }); t += rnd(3, 6.5);
      }
    }
    runArrivals(time) {
      if (!this.arrivals) return;
      const W = this.ctx.world;
      for (const a of this.arrivals) {
        if (a.done || time < a.at) continue;
        if(a.recall && this.employees.some(e=>e.present&&Math.hypot(e.pos.x-20,e.pos.z+7.4)<.85))continue;
        a.done = true;
        const e = a.e;
        if(e.present)continue;
        if (!this.onShift(e) && !this.shouldStay(e)) continue;
        if(a.recall&&e.meeting){e.posture='stand';e.sitSeat=null;e.spawnAt(20,-7.4,0);e.say('Coming to the meeting.',2);continue;}
        e.clear();e.errand=null;e.posture='stand';e.sitSeat=null;e.greeted=false;
        if(a.recall){e.spawnAt(20,-7.4,0);e.push({type:'goto',x:20,z:2.6});e.goDesk();e.say('Back to the office.',2);continue;}
        if (a.via === 'lift') {
          const L = W.lifts[Math.random() < 0.5 ? 0 : 1];
          const x = (L.x0 + L.x1) / 2;
          e.spawnAt(x, 1.3, 0);
          L.want = 1; setTimeout(() => { L.want = 0; }, 5000);
          e.push({ type: 'wait', dur: 1.2 }, { type: 'goto', x, z: 3.6 });
        } else {
          e.spawnAt(20 + rnd(-1.2, 1.2), -7.5, 0);
          e.push({ type: 'goto', x: 20 + rnd(-0.6, 0.6), z: 2.5 });
        }
        // greet reception, maybe coffee, then desk
        const zara = this.employees.find(z => z.dept === 'Reception' && z !== e);
        e.push({ type: 'call', fn: () => { if (zara && Math.random() < 0.6) { e.say(pick([`Morning, ${zara?.name.split(' ')[0]}!`, 'Hi!', 'Morning!']), 2.2); setTimeout(() => zara.say(pick([`Morning ${e.name.split(' ')[0]}!`, 'Good morning!', 'Hey, welcome in!']), 2.2), 900); } } });
        if (Math.random() < 0.5) e.coffeeRun(() => { e.goDesk(); e.push({ type: 'wait', dur: 25 }, { type: 'call', fn: () => { e.rig.cup.visible = false; } }); });
        else e.goDesk();
      }
    }

    shiftMinutes(e) { return this.employees.indexOf(e) * 3; }
    onShift(e) {
      const t = this.ctx.clockInfo.hour * 60 + this.ctx.clockInfo.minute;
      const stagger = this.shiftMinutes(e);
      return !this.shift.sentHome.includes(e.id) && this.ctx.clockInfo.workday && t >= 9 * 60 + stagger && t < 18 * 60 + stagger;
    }
    shouldStay(e) {
      if (this.shift.sentHome.includes(e.id)) return false;
      return this.shift.overtime.includes(e.id) || this.shift.recalled.includes(e.id) || !!this.ctx.runtime.activeFor(e.id);
    }
    saveShift() { if (this.ctx.life) { this.ctx.life.state.shift = this.shift; this.ctx.life.save(); } }
    recall(e, manual = true) {
      if (!e) return;
      if (manual) {
        this.shift.sentHome = this.shift.sentHome.filter(id => id !== e.id);
        if (!this.shift.recalled.includes(e.id)) this.shift.recalled.push(e.id);
        this.saveShift();
      }
      if (e.present) {
        if (e.errand === 'leaving') { e.clear(); e.errand = null; e.goDesk(); }
        return;
      }
      if(this.arrivals?.some(a=>a.e===e&&!a.done&&a.recall))return;
      this.arrivals?.filter(a=>a.e===e).forEach(a=>{a.done=true;});
      this.arrivals ||= [];
      const now=this.ctx.time||0;
      const last=this.arrivals.filter(a=>!a.done&&a.recall).reduce((t,a)=>Math.max(t,a.at),now-1.8);
      this.arrivals.push({e,at:Math.max(now,last+1.8),via:'door',recall:true,manual});
      e.activity='On the way back to the office';
    }

    setOvertime(e, enabled) {
      this.shift.overtime = this.shift.overtime.filter(id => id !== e.id);
      if (enabled) {
        this.shift.overtime.push(e.id);
        this.shift.sentHome = this.shift.sentHome.filter(id => id !== e.id);
      }
      this.saveShift();
      if (enabled) this.recall(e, false);
      else this.syncShift();
    }
    sendHome(e, immediate = false, directed = false) {
      if (!e?.present || e.errand === 'leaving' || (!directed && this.ctx.runtime.activeFor(e.id)) || e.meeting || e.interacting) return false;
      e.clear(); e.errand = 'leaving'; e.activity = 'Heading home';
      if (immediate) { e.present = false; e.rig.root.visible = false; e.errand = null; e.activity = 'At home'; return true; }
      e.say(['Heading home. See you tomorrow!', 'That’s me done for today.', 'Good night!'][this.employees.indexOf(e) % 3], 3);
      e.push({ type: 'stand' }, { type: 'goto', x: 20, z: -7.4 }, { type: 'call', fn: () => { e.rig.cup.visible = false; e.rig.phone.visible = false; e.activity = 'At home'; e.errand = null; } }, { type: 'hide' });
      return true;
    }
    release(e) {
      this.shift.recalled = this.shift.recalled.filter(id => id !== e.id);
      this.shift.overtime = this.shift.overtime.filter(id => id !== e.id);
      if (!this.shift.sentHome.includes(e.id)) this.shift.sentHome.push(e.id);
      this.saveShift();
      return this.sendHome(e, false, true);
    }
    syncShift(immediate = false) {
      if (this.shift.dateKey !== this.ctx.clockInfo.dateKey) {
        this.shift = shiftState(this.shift, this.ctx.clockInfo.dateKey);
        this.saveShift();
      }
      for (const e of this.employees) {
        const pendingArrival = this.arrivals?.some(a => a.e === e && !a.done);
        if (this.onShift(e) || this.shouldStay(e)) {
          if ((e.present && e.errand === 'leaving') || (!e.present && !pendingArrival)) this.recall(e, false);
        } else this.sendHome(e, immediate, this.shift.sentHome.includes(e.id));
      }
    }

    /* ---------------- task state -> world ---------------- */
    bindRuntime(bus, runtime) {
      bus.on('task.status_changed', ev => {
        const e = this.byId(ev.employeeId); if (!e) return;
        const st = TASK_TO_STATE[ev.status];
        if (st && !e.present && !this.shift.sentHome.includes(e.id)) this.recall(e, false);
        if (ev.status === 'cancelled') { e.setState('AVAILABLE'); e.say('Understood — I stopped that task.', 3); return; }
        if (st) e.setState(st);
        if (ev.status === 'running' && e.approvalWalk) { e.approvalWalk = false; if (!e.meeting) { e.clear(); e.say('Thanks — back to it.', 2.5); e.goDesk(); } }
        if (ev.status === 'planning' && !e.meeting && !e.interacting) { e.clear(); e.goDesk(); }
      });
      bus.on('approval.required', ev => {
        const e = this.byId(ev.employeeId); if (!e) return;
        e.say('I need your approval before I continue.', 4);
        e.approvalTimer = setTimeout(() => this.walkToPlayer(e, 'approval'), 7000);
      });
      bus.on('approval.responded', ev => { const e = this.byId(ev.employeeId); if (e) clearTimeout(e.approvalTimer); });
      bus.on('task.completed', ev => {
        const e = this.byId(ev.employeeId); if (!e) return;
        e.say('Done! The result is ready for your review.', 4);
        setTimeout(() => { if (e.state === 'COMPLETED') this.walkToPlayer(e, 'result'); }, 4500);
      });
    }
    byId(id) { return this.employees.find(e => e.id === id); }
    walkToPlayer(e, why) {
      if (!e.present || e.meeting || e.interacting) return;
      const P = this.ctx.player.pos;
      if (Math.hypot(P.x - e.pos.x, P.z - e.pos.z) < 5) { e.say(why === 'approval' ? 'Could you approve this for me?' : why === 'result' ? 'Want to take a look?' : 'I\'m right here!', 3); return; }
      if (why === 'approval') e.approvalWalk = true;
      e.clear();
      e.errand = why;
      e.activity = why === 'approval' ? 'Coming to ask for approval' : 'Bringing you the result';
      e.push({ type: 'stand' }, { type: 'goto', x: P.x, z: P.z, follow: () => this.ctx.player.pos, stopNear: () => Math.hypot(this.ctx.player.pos.x - e.pos.x, this.ctx.player.pos.z - e.pos.z) < 1.6 },
        { type: 'face', x: P.x, z: P.z },
        { type: 'say', text: why === 'approval' ? `I need your OK: ${this.ctx.runtime.pendingApprovals().find(x => x.employeeId === e.id)?.action?.summary || 'an action on my task'}` : why === 'result' ? `Finished "${this.ctx.runtime.latestFor(e.id)?.title}". Want to review it?` : 'You wanted to see me?', dur: 5 },
        { type: 'wait', dur: 12 }, { type: 'call', fn: () => { e.errand = null; } });
    }

    /* ---------------- orders ---------------- */
    order(e, what) {
      const P = this.ctx.player;
      e.clear(); e.interacting = false;
      if (what === 'desk') { e.errand = null; e.meeting = null; e.goDesk(); e.say('Heading back to my desk.', 2.5); }
      if (what === 'follow') {
        e.errand = 'follow'; e.say('Right behind you.', 2.2); e.activity = 'Following you';
        const loop = () => {
          if (e.errand !== 'follow') return;
          const p = P.pos;
          if (Math.hypot(p.x - e.pos.x, p.z - e.pos.z) > 2.2) e.clear(), e.push({ type: 'goto', x: p.x, z: p.z, follow: () => P.pos, stopNear: () => Math.hypot(P.pos.x - e.pos.x, P.pos.z - e.pos.z) < 1.8 });
          setTimeout(loop, 700);
        };
        loop();
        setTimeout(() => { if (e.errand === 'follow') { e.errand = null; e.say('I\'ll head back to work.', 2.5); e.clear(); e.goDesk(); } }, 90000);
      }
      if (what === 'coffee') {
        e.errand = 'coffee'; e.say(pick(['Coming right up!', 'Sure — how do you take it?', 'One coffee, on it.']), 2.5);
        e.coffeeRun(emp => {
          emp.push({ type: 'goto', x: P.pos.x, z: P.pos.z, follow: () => P.pos, stopNear: () => Math.hypot(P.pos.x - emp.pos.x, P.pos.z - emp.pos.z) < 1.4 },
            { type: 'face', x: P.pos.x, z: P.pos.z }, { type: 'anim', mode: 'carry', dur: 0.8 },
            { type: 'call', fn: () => { emp.rig.cup.visible = false; P.giveCoffee(); emp.say('Here you go — fresh from the machine.', 3); } },
            { type: 'anim', mode: 'nod', dur: 1.2 }, { type: 'call', fn: () => { emp.errand = null; } });
          emp.goDesk();
        });
      }
      if (what === 'coffeeTogether') {
        e.errand = 'coffee-break'; e.say('Coffee break sounds good.', 2.5);
        e.coffeeRun(emp => {
          emp.push({ type: 'goto', x: P.pos.x, z: P.pos.z, follow: () => P.pos, stopNear: () => Math.hypot(P.pos.x - emp.pos.x, P.pos.z - emp.pos.z) < 1.7 },
            { type: 'face', x: P.pos.x, z: P.pos.z }, { type: 'anim', mode: 'drink', dur: 6 },
            { type: 'say', text: pick(['Good to step away for a minute.', 'This is a much better way to catch up.', 'I had a useful idea on the walk over.']), dur: 4 },
            { type: 'call', fn: () => { emp.rig.cup.visible = false; emp.errand = null; } });
          emp.goDesk();
        });
      }
      if (what === 'introduce') {
        const mate = this.employees.filter(o => o !== e && o.present && !o.meeting && !o.errand && o.state === 'AVAILABLE')
          .sort((a, b) => Math.hypot(a.pos.x - e.pos.x, a.pos.z - e.pos.z) - Math.hypot(b.pos.x - e.pos.x, b.pos.z - e.pos.z))[0];
        if (!mate) { e.say('Everyone is busy right now. Let’s try later.', 3); return; }
        e.errand = 'introduction'; e.say(`I’ll go introduce myself to ${mate.name.split(' ')[0]}.`, 3);
        const spot = { x: mate.pos.x + 0.9, z: mate.pos.z + 0.4 };
        e.push({ type: 'stand' }, { type: 'goto', ...spot }, { type: 'face', x: mate.pos.x, z: mate.pos.z },
          { type: 'call', fn: () => { mate.lookAt = e.head; mate.say(`Hey ${e.name.split(' ')[0]} — good to properly meet.`, 3.5); } },
          { type: 'say', text: `Let’s keep each other posted on ${e.dept} and ${mate.dept}.`, dur: 4 },
          { type: 'call', fn: () => { mate.lookAt = null; e.errand = null; } });
        e.goDesk();
      }
      if (what === 'office') {
        const ceo = this.chairs.filter(c => c.room === 'CEO_Office' && !c.exec)[0];
        e.errand = 'office'; e.say('On my way to your office.', 2.5);
        e.push({ type: 'stand' }, { type: 'goto', ...e.approach(ceo) }, { type: 'sit', seat: ceo }, { type: 'wait', dur: 60 }, { type: 'call', fn: () => { e.errand = null; } });
      }
    }

    /* ---------------- meetings ---------------- */
    callMeeting(room, people, topic) {
      if (this.meeting) this.endMeeting();
      people.forEach(e => { if (e.present === false) this.recall(e); });
      const chairs = this.chairs.filter(c => c.room === room && !c.exec).sort((a, b) => a.p[0] - b.p[0] || a.p[2] - b.p[2]);
      // Keep a chair free for the founder, including when everyone is called.
      const occupiedByPlayer = this.ctx.player?.seated && this.ctx.player.seat?.room === room ? this.ctx.player.seat : null;
      const playerSeat = room === 'CEO_Office' ? this.chairs.find(c => c.room === room && c.exec) : occupiedByPlayer || chairs[0];
      if (room !== 'CEO_Office' && playerSeat) chairs.splice(chairs.indexOf(playerSeat), 1);
      const C = { CEO_Office: [3.3, 27.3], Boardroom: [14, 32.2], Meeting_1: [20, 32.2], Meeting_2: [24, 32.2], Meeting_3: [28, 32.2] }[room] || [chairs[0]?.p[0] || 14, chairs[0]?.p[2] || 32];
      const m = { room, topic, people: [], playerSeat, phase: 'gathering', speaking: null, t0: this.ctx.time, lines: [] };
      people.forEach((e, i) => {
        e.clear(); e.errand = null; e.interacting = false; e.meeting = m; m.people.push(e);
        const c = chairs[i];
        e.meetSeat = c || null;
        e.activity = room === 'CEO_Office' ? 'In your office' : 'In a meeting';
        setTimeout(() => {
          e.say(pick(['Coming!', 'On my way.', 'Be right there.', 'Grabbing my notes.']), 2);
          if (c) e.push({ type: 'stand' }, { type: 'goto', ...e.approach(c), run: false }, { type: 'sit', seat: c }, { type: 'call', fn: () => { e.arrivedMeeting = true; } });
          else {
            const k = i - chairs.length, a = k * 0.85 + 0.4, r = 1.25 + Math.floor(k / 7) * 0.7;
            const spot = room === 'Boardroom'
              ? { x: 12 + (k % 5), z: k % 10 < 5 ? 29.4 - Math.floor(k / 10) * 0.5 : 35 + Math.floor(k / 10) * 0.5 }
              : { x: C[0] + Math.cos(a) * r, z: C[1] + Math.sin(a) * r };
            e.push({ type: 'stand' }, { type: 'goto', ...spot }, { type: 'face', x: C[0], z: C[1] }, { type: 'call', fn: () => { e.arrivedMeeting = true; } });
          }
        }, i * 350 + Math.random() * 600);
      });
      this.meeting = m;
      return m;
    }
    meetingArrived() { const m = this.meeting; return m ? m.people.filter(e => e.arrivedMeeting).length : 0; }
    async runStandup(onLine) {
      const m = this.meeting; if (!m) return;
      m.phase = 'standup';
      for (const e of m.people) {
        if (this.meeting !== m) return;
        const t = this.ctx.runtime.activeFor(e.id) || this.ctx.runtime.latestFor(e.id);
        let line;
        if (!t) line = `Nothing assigned yet — I'm free to pick something up in ${e.dept.toLowerCase()}.`;
        else if (t.status === 'waiting_for_approval') line = `"${t.title}" is blocked on your approval.`;
        else if (t.status === 'completed') line = `I finished "${t.title}". It's ready for your review.`;
        else if (t.status === 'failed' || t.status === 'cancelled') line = `"${t.title}" stopped: ${t.error || 'failed'}.`;
        else line = `Working on "${t.title}" — about ${Math.round(t.progress * 100)}% done.`;
        m.speaking = e; e.say(line, 5.5); onLine?.(e, line);
        await new Promise(r => setTimeout(r, 5200));
      }
      m.speaking = null; m.phase = 'ready';
    }
    async runBrainstorm(topic, provider, onLine, signal) {
      const m = this.meeting; if (!m) return;
      m.phase = 'brainstorm';
      m.people.forEach(e => e.say('Hmm…', 3));
      const people = m.people.map(e => { const t = this.ctx.runtime.activeFor(e.id); return { id: e.id, name: e.name, role: e.role, status: t ? `working on "${t.title}"` : 'available' }; });
      const lines = await provider.meeting(topic, people, signal);
      for (const l of (Array.isArray(lines) ? lines : [])) {
        const e = m.people.find(p => p.id === l.id); if (!e || this.meeting !== m) continue;
        m.speaking = e; e.say(String(l.line), 7); onLine?.(e, String(l.line));
        await new Promise(r => setTimeout(r, 6500));
      }
      m.speaking = null; m.phase = 'ready';
    }
    endMeeting() {
      const m = this.meeting; if (!m) return;
      this.meeting = null;
      m.people.forEach((e, i) => {
        e.meeting = null; e.meetSeat = null; e.arrivedMeeting = false; e.clear();
        setTimeout(() => { e.say(pick(['Good meeting.', 'Back to it!', 'Thanks all.', 'Let\'s go.']), 2); e.goDesk(); }, i * 250);
      });
    }

    /* ---------------- workstation screen ---------------- */
    drawScreen(e) {
      const s = e.screen, g = s.ctx, W = s.canvas.width, H = s.canvas.height;
      const t = e.taskInfo();
      const st = e.present ? e.state : 'IDLE';
      g.fillStyle = '#0d1117'; g.fillRect(0, 0, W, H);
      g.fillStyle = e.color; g.fillRect(0, 0, W, 16);
      g.fillStyle = '#fff'; g.font = 'bold 11px system-ui, sans-serif'; g.textBaseline = 'middle';
      g.fillText(`${e.name} · ${e.role}`, 6, 8.5);
      g.font = '10px ui-monospace, Menlo, monospace'; g.textBaseline = 'alphabetic';
      if (!e.present) { g.fillStyle = '#56606a'; g.fillText('Locked', 8, H / 2); }
      else if (!t || st === 'AVAILABLE') {
        g.fillStyle = '#7d8a96'; g.fillText('Ready for work', 8, 34);
        g.fillStyle = '#c9d1d9'; g.font = 'bold 22px system-ui, sans-serif';
        g.fillText(this.ctx.clockInfo.time, 8, 66);
        g.font = '10px ui-monospace, monospace'; g.fillStyle = '#56606a'; g.fillText('No active task', 8, H - 10);
      } else {
        const S = STATUS[st];
        g.fillStyle = S.color; g.font = 'bold 11px system-ui, sans-serif'; g.fillText(S.label.toUpperCase(), 8, 31);
        g.fillStyle = '#c9d1d9'; g.font = '10px system-ui, sans-serif'; g.fillText(t.title.slice(0, 40), 8, 45);
        g.font = '9px ui-monospace, Menlo, monospace';
        const lines = t.logs.slice(-Math.floor((H - 70) / 11));
        lines.forEach((l, i) => { g.fillStyle = l.text.startsWith('✓') || l.text.includes('✓') ? '#56d364' : l.text.startsWith('⏸') ? '#f0a020' : l.text.startsWith('✕') ? '#f85149' : '#8b949e'; g.fillText(l.text.slice(0, 44), 8, 58 + i * 11); });
        g.fillStyle = '#21262d'; g.fillRect(8, H - 12, W - 16, 5);
        g.fillStyle = S.color; g.fillRect(8, H - 12, (W - 16) * (t.progress || 0), 5);
      }
      s.tex.needsUpdate = true;
    }
  }

  window.DesklyAgents = { STATUS, DEPT_COLOR, Office, Employee, shiftState };
})();
