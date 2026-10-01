/* Physical office interactions. Ambient actions are local and never call an AI
   provider; deliberate questions and task work continue through the runtime. */
(function () {
  const STORE = 'deskly.office-life.v1';
  const cleanRoom = room => String(room || 'Office').replace(/^Dept_/, '').replace(/_/g, ' ');
  const safeParse = value => { try { return JSON.parse(value); } catch { return null; } };
  const initialState = () => ({ boards: {}, printQueue: [], feedback: {}, lighting: 'day', ceoLamp: false, discarded: 0, meetings: [], shift: null });

  class OfficeLife {
    constructor(app) {
      this.app = app;
      const saved = typeof localStorage !== 'undefined' ? safeParse(localStorage.getItem(STORE)) : null;
      this.state = { ...initialState(), ...(saved || {}) };
      this.ambientT = 12;
      this.lastHour = -1;
    }
    save() {
      try { localStorage.setItem(STORE, JSON.stringify(this.state)); } catch { }
    }
    markerPoint(m, distance = 0.7) {
      return { x: m.p[0] - (m.f?.[0] || 0) * distance, z: m.p[2] - (m.f?.[1] || 0) * distance };
    }
    objects(markers) {
      const out = [];
      const add = (m, kind, label, short, r = 1.45) => {
        const p = this.markerPoint(m);
        out.push({ key: `${kind}:${m.room || ''}:${m.p[0]}:${m.p[2]}`, ...p, r, lifeKind: kind, marker: m, label, short, fn: () => this.activate(kind, m) });
      };
      for (const m of markers) {
        if (m.kind === 'coffee') add(m, 'coffee', this.app.player.heldDrink?.type === 'coffee' ? 'Refill your coffee' : 'Pour a coffee', 'Coffee');
        else if (m.kind === 'water') add(m, 'water', this.app.player.heldDrink?.type === 'water' ? 'Refill your water' : 'Fill a water cup', 'Water');
        else if (m.kind === 'printer') add(m, 'printer', 'Use the office printer', 'Printer', 1.6);
        else if (m.kind === 'whiteboard') add(m, 'whiteboard', `Open the ${cleanRoom(m.room)} whiteboard`, 'Whiteboard', 1.8);
        else if (m.kind === 'tvwatch') add(m, 'display', `Use the ${cleanRoom(m.room)} display`, 'Display', 1.8);
        else if (m.kind === 'archive') add(m, 'archive', 'Open your office archive', 'Archive', 1.7);
        else if (m.kind === 'lamp') add(m, 'lamp', `${this.state.ceoLamp ? 'Switch off' : 'Switch on'} your office lamp`, 'Lamp', 1.5);
      }
      for (const lift of this.app.world.lifts || []) {
        const marker = { p: [(lift.x0 + lift.x1) / 2, 0, lift.z], f: [0, -1], room: 'Lift lobby', lift };
        add(marker, 'lift', 'Call the lift', 'Lift', 1.9);
      }
      return out;
    }
    activate(kind, marker) {
      if (kind === 'coffee' || kind === 'water') return this.takeDrink(kind);
      if (kind === 'lift') return this.callLift(marker.lift);
      if (kind === 'whiteboard') { this.app.audio?.play('paper'); return this.app.ui.openWhiteboard(marker, this); }
      if (kind === 'printer') { this.app.audio?.play('printer'); return this.app.ui.openPrinter(marker, this); }
      if (kind === 'display') { this.app.audio?.play('switch'); return this.app.ui.openPresentationDisplay(marker, this); }
      if (kind === 'archive') { this.app.audio?.play('paper'); return this.app.ui.openCeoArchive(marker, this); }
      if (kind === 'lamp') return this.toggleCeoLamp();
    }
    takeDrink(type) {
      const held = this.app.player.heldDrink;
      if (held && held.type !== type && held.remaining > 0) {
        this.app.ui.toast(`Finish or discard your ${held.type} first. Press R to discard it.`, '#f0a020');
        return;
      }
      this.app.player.giveDrink(type);
      this.app.audio?.play('pour', { water: type === 'water' });
      this.app.ui.toast(type === 'coffee' ? 'Fresh coffee. Press F to take a sip · R to discard.' : 'Water cup filled. Press F to drink · R to discard.', type === 'coffee' ? '#c08a5a' : '#6fa8c9');
    }
    sip() {
      const result = this.app.player.drink();
      if (!result) return false;
      this.app.audio?.play('sip', { water: result.type === 'water' });
      this.app.ui.toast(result.empty ? `${result.type === 'coffee' ? 'Coffee' : 'Water'} finished. Press R to discard the empty cup.` : `${result.type === 'coffee' ? 'Coffee' : 'Water'} · ${result.remaining} sips left.`, result.type === 'coffee' ? '#c08a5a' : '#6fa8c9');
      return true;
    }
    discard() {
      if (!this.app.player.discardDrink()) return false;
      this.state.discarded++;
      this.save();
      this.app.audio?.play('cup');
      this.app.ui.toast('Cup discarded.', '#a4a592');
      return true;
    }
    callLift(lift) {
      if (!lift) return;
      lift.want = 1;
      this.app.audio?.play('lift');
      this.app.ui.toast('Lift called. The doors will stay open for a few seconds.', '#f2c230');
      clearTimeout(lift.officeLifeTimer);
      lift.officeLifeTimer = setTimeout(() => { lift.want = 0; }, 6500);
    }
    board(room) { return this.state.boards[room] || { text: '', updatedAt: null }; }
    saveBoard(room, text) {
      this.state.boards[room] = { text: String(text || '').slice(0, 6000), updatedAt: new Date().toISOString() };
      this.save();
    }
    pinToBoard(room, text) {
      const old = this.board(room).text.trim();
      this.saveBoard(room, [old, text].filter(Boolean).join('\n\n').slice(-6000));
    }
    queuePrint(task) {
      if (!task) return;
      const existing = this.state.printQueue.find(x => x.taskId === task.id);
      if (existing) existing.collected = false;
      else this.state.printQueue.unshift({ taskId: task.id, title: task.title, employeeId: task.employeeId, at: new Date().toISOString(), collected: false });
      this.state.printQueue = this.state.printQueue.slice(0, 30);
      this.save();
    }
    collectPrint(item) {
      item.collected = true; this.save();
      const task = this.app.runtime.get(item.taskId);
      const file = task?.result?.files?.[0];
      if (file) this.app.openLaptop(file);
      else this.app.ui.toast(`Collected “${item.title}”. Its report is in the operations board.`, '#2fbf71');
    }
    setLighting(mode) {
      this.state.lighting = mode; this.save();
      this.app.world.setLighting?.(mode);
      this.app.ui.toast(`${mode[0].toUpperCase() + mode.slice(1)} lighting enabled.`, '#f2c230');
    }
    toggleCeoLamp() {
      this.state.ceoLamp = !this.state.ceoLamp;
      this.save();
      this.app.world.setCeoLamp?.(this.state.ceoLamp);
      this.app.audio?.play('switch');
      this.app.ui.toast(`Office lamp ${this.state.ceoLamp ? 'on' : 'off'}.`, '#f2c230');
    }
    statusLine(e) {
      const t = this.app.runtime.activeFor(e.id) || this.app.runtime.latestFor(e.id);
      if (!t) return `I’m available. Nothing is assigned to me right now.`;
      if (t.status === 'waiting_for_approval') return `I’m blocked on your approval for “${t.title}”.`;
      if (t.status === 'completed') return `I finished “${t.title}”. It’s ready for review.`;
      if (t.status === 'failed') return `“${t.title}” stopped: ${t.error || 'the task failed'}.`;
      return `I’m ${t.status === 'planning' ? 'planning' : 'working on'} “${t.title}” — ${Math.round((t.progress || 0) * 100)}% complete.`;
    }
    feedback(e, kind) {
      const row = this.state.feedback[e.id] || { positive: 0, revise: 0 };
      row[kind] = (row[kind] || 0) + 1; row.last = new Date().toISOString();
      this.state.feedback[e.id] = row; this.save();
      e.say(kind === 'positive' ? 'Thank you — I’ll keep that approach.' : 'Understood. I’ll be more careful on the next pass.', 4);
      this.app.ui.toast(kind === 'positive' ? `Feedback saved for ${e.name}.` : `Revision feedback saved for ${e.name}.`, kind === 'positive' ? '#2fbf71' : '#f0a020');
    }
    finishMeeting(m) {
      if (!m) return '';
      const lines = m.lines.map(x => `- ${x.e?.name || 'Team'}: ${x.l}`);
      const actions = (m.actions || []).map(x => `- [ ] ${x}`);
      const summary = [`# ${m.topic || 'Team meeting'}`, `Room: ${cleanRoom(m.room)}`, '', '## Discussion', ...(lines.length ? lines : ['- No transcript captured.']), '', '## Actions', ...(actions.length ? actions : ['- No action items.'])].join('\n');
      this.state.meetings.unshift({ at: new Date().toISOString(), room: m.room, topic: m.topic || 'Team meeting', summary });
      this.state.meetings = this.state.meetings.slice(0, 20);
      this.pinToBoard(m.room, summary);
      this.save();
      return summary;
    }
    present(e, meeting) {
      const task = this.app.runtime.latestFor(e.id);
      const line = task?.status === 'completed' ? `Presenting “${task.title}”: ${String(task.result?.body || 'The work is complete.').replace(/\s+/g, ' ').slice(0, 180)}` : this.statusLine(e);
      meeting.speaking = e; e.say(line, 7); meeting.lines.push({ e, l: line });
      return line;
    }
    update(dt) {
      this.ambientT -= dt;
      if (this.ambientT > 0 || !this.app.office) return;
      this.ambientT = 18 + Math.random() * 18;
      const hour = this.app.clockInfo.hour;
      if (hour === this.lastHour) return;
      this.lastHour = hour;
      const available = this.app.office.employees.filter(e => e.present && e.state === 'AVAILABLE' && !e.meeting && !e.errand);
      if (!available.length) return;
      if (hour >= 12 && hour < 14) {
        const e = available[Math.floor(Math.random() * available.length)];
        e.say('Lunch break — I’ll be back shortly.', 3); e.coffeeRun?.();
      } else if (hour >= 17) {
        available[Math.floor(Math.random() * available.length)].say('Wrapping up for the day.', 3);
      }
    }
  }

  window.DesklyOfficeLife = { OfficeLife, cleanRoom, initialState };
})();
