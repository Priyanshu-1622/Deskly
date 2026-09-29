/* Deskly UI: HUD, name tags and speech bubbles, minimap, toasts, and the
   conversation / task-review / board / meeting panels. */
(function () {
  const T = THREE;
  const $ = s => document.querySelector(s);
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  function md(src) {
    const out = []; const lines = String(src).split('\n'); let i = 0, list = null;
    const inl = t => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>');
    const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
    while (i < lines.length) {
      const l = lines[i];
      if (/^```/.test(l)) { close(); const buf = []; i++; while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]); i++; out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`); continue; }
      let m;
      if ((m = l.match(/^(#{1,4})\s+(.*)/))) { close(); out.push(`<h3>${inl(m[2])}</h3>`); }
      else if ((m = l.match(/^\s*[-*•]\s+(.*)/))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inl(m[1])}</li>`); }
      else if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inl(m[1])}</li>`); }
      else if (!l.trim()) close();
      else { close(); out.push(`<p>${inl(l)}</p>`); }
      i++;
    }
    close(); return out.join('');
  }
  const fname = n => String(n).split(' ').find(w => !/^Dr\.?$/.test(w)) || n;
  const initials = n => n.replace(/^Dr\.\s*/, '').split(/\s+/).map(w => w[0]).slice(0, 2).join('');
  const STATUS_LABEL = { created: 'Queued', queued: 'Queued', planning: 'Planning', running: 'Working', waiting_for_approval: 'Needs approval', reviewing: 'Self-review', completed: 'Completed', failed: 'Failed', cancelled: 'Stopped' };
  const STATUS_COL = { created: '#9b7be0', queued: '#9b7be0', planning: '#9b7be0', running: '#3b8ff0', waiting_for_approval: '#f0a020', reviewing: '#3b8ff0', completed: '#2fbf71', failed: '#e0504a', cancelled: '#9aa3ad' };

  class UI {
    constructor(app) {
      this.app = app; this.tags = new Map(); this.panelKind = null; this.chats = new Map();
      this.mm = $('#mm').getContext('2d');
      this.buildMinimapBase();
      this.bindKeys();
      if (app.player.touch) this.touchControls();
    }

    /* ---------------- HUD ---------------- */
    setProvider(kind, label) {
      const p = $('#provider');
      p.querySelector('i').style.background = kind === 'claude' ? '#2fbf71' : '#f0a020';
      p.querySelector('span').textContent = label || (kind === 'claude' ? 'AI connected' : 'Demo mode · simulated output');
    }
    counters() {
      const rt = this.app.runtime;
      const tasks = rt.list();
      const working = tasks.filter(t => ['planning', 'running', 'reviewing', 'queued', 'created'].includes(t.status)).length;
      const appr = rt.pendingApprovals().length;
      const done = this.app.office.employees.filter(e => e.state === 'COMPLETED').length;
      const key = `${working}|${appr}|${done}`;
      if (key === this._ck) return; this._ck = key;
      const c = $('#counters'); c.replaceChildren(
        h('button', { type: 'button', onclick: () => this.openBoard('tasks'), title: 'Tasks in progress' }, h('i', { style: 'background:#3b8ff0' }), `${working}`, h('span', {}, ' working')),
        h('button', { type: 'button', class: appr ? 'warn' : '', onclick: () => this.openBoard('approvals'), title: 'Approvals waiting' }, h('i', { style: 'background:#f0a020' }), `${appr}`, h('span', {}, ' to approve')),
        h('button', { type: 'button', onclick: () => this.openBoard('tasks'), title: 'Results ready for review' }, h('i', { style: 'background:#2fbf71' }), `${done}`, h('span', {}, ' ready'))
      );
    }
    clock(d) {
      $('#clockT').textContent = d.toTimeString().slice(0, 5);
    }
    toast(text, color = '#f2c230', action) {
      const el = h('div', { class: 'toast glass' }, h('i', { style: `background:${color}` }), h('span', {}, text), action ? h('button', { type: 'button', onclick: () => { action.fn(); el.remove(); } }, action.label) : null);
      $('#toasts').prepend(el);
      while ($('#toasts').children.length > 3) $('#toasts').lastChild.remove();
      setTimeout(() => el.remove(), action ? 9000 : 5000);
    }
    prompt(p) {
      const el = $('#prompt');
      if (!p || this.panelKind) { el.hidden = true; return; }
      const key = p.key + p.label + (p.sub || '');
      if (this._pk !== key) {
        this._pk = key;
        el.replaceChildren(...[h('kbd', {}, this.app.player.touch ? 'Tap Talk' : 'E'), h('span', {}, p.label), p.sub ? h('small', {}, p.sub) : null].filter(Boolean));
        $('#tAct').textContent = p.short || 'Use';
      }
      el.hidden = false;
    }

    /* ---------------- name tags / bubbles ---------------- */
    tagsUpdate(camera) {
      const W = innerWidth, H = innerHeight, cam = camera.position;
      const fwd = new T.Vector3(); camera.getWorldDirection(fwd);
      for (const e of this.app.office.employees) {
        let tag = this.tags.get(e.id);
        if (!tag) {
          tag = { el: h('div', { class: 'tag' }), name: h('div', { class: 'name' }), bubble: h('div', { class: 'bubble' }) };
          tag.el.append(tag.bubble, tag.name); $('#tags').append(tag.el); this.tags.set(e.id, tag);
        }
        const p = e.head; p.y += 0.42;
        const d = p.distanceTo(cam);
        const v = p.clone().sub(cam);
        const show = e.present && d < 14 && v.dot(fwd) > 0.2;
        if (!show) { tag.el.style.display = 'none'; continue; }
        const s = p.clone().project(camera);
        tag.el.style.display = '';
        tag.el.style.left = ((s.x + 1) / 2 * W) + 'px'; tag.el.style.top = ((1 - s.y) / 2 * H) + 'px';
        tag.el.style.opacity = d > 10 ? String(1 - (d - 10) / 4) : '1';
        const S = DesklyAgents.STATUS[e.state];
        const nk = e.name + e.state + (d < 6);
        if (tag.nk !== nk) {
          tag.nk = nk;
          tag.name.replaceChildren(...[h('i', { style: `background:${S.color}` }), fname(e.name) === 'Dr.' ? e.name.split(' ').slice(0, 2).join(' ') : fname(e.name), d < 6 ? h('em', {}, ' · ' + e.role) : null].filter(Boolean));
        }
        const bt = e.bubble && d < 11 ? e.bubble.text : '';
        if (tag.bt !== bt) { tag.bt = bt; tag.bubble.textContent = bt; tag.bubble.style.display = bt ? '' : 'none'; }
      }
    }

    /* ---------------- minimap ---------------- */
    buildMinimapBase() {
      const nav = this.app.nav, c = document.createElement('canvas');
      c.width = 480; c.height = 288;
      const g = c.getContext('2d'), sx = 480 / 60, sz = 288 / 36;
      g.fillStyle = '#1b2227'; g.fillRect(0, 0, 480, 288);
      const img = g.getImageData(0, 0, 480, 288);
      for (let py = 0; py < 288; py++) for (let px = 0; px < 480; px++) {
        const x = px / sx, z = 36 - py / sz;
        if (nav.blockedAt(x, z, false)) { const o = (py * 480 + px) * 4; img.data[o] = 88; img.data[o + 1] = 101; img.data[o + 2] = 108; }
      }
      g.putImageData(img, 0, 0);
      g.fillStyle = 'rgba(233,238,240,.55)'; g.font = '600 10px Manrope, sans-serif';
      for (const [t, x, z] of [['Engineering', 3, 25.6], ['Design', 17, 25.6], ['Marketing', 25, 25.6], ['HR', 34, 25.6], ['Finance', 40.5, 25.6], ['Research', 47, 25.6], ['Café', 19, 10.4], ['Sales', 31, 10.4], ['IT', 43, 10.4], ['Support', 48, 10.4], ['CEO', 2, 34.6], ['Boardroom', 11, 34.6], ['R&D', 46, 34.6], ['Reception', 16, 1.4], ['Kitchen', 1, 1.4], ['Training', 41, 1.4]])
        g.fillText(t, x * sx, (36 - z) * sz);
      this.mmBase = c; this.mmS = [sx, sz];
    }
    minimap(player, employees) {
      const g = this.mm, [sx, sz] = this.mmS;
      g.drawImage(this.mmBase, 0, 0);
      for (const e of employees) {
        if (!e.present) continue;
        g.fillStyle = DesklyAgents.STATUS[e.state].color;
        g.beginPath(); g.arc(e.pos.x * sx, (36 - e.pos.z) * sz, e.state === 'WAITING_FOR_APPROVAL' ? 5.5 : 4, 0, 7); g.fill();
      }
      const px = player.pos.x * sx, pz = (36 - player.pos.z) * sz, f = player.forward();
      g.save(); g.translate(px, pz); g.rotate(Math.atan2(f.x, -f.z) * -1 + Math.PI);
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, 8); g.lineTo(5.5, -5); g.lineTo(-5.5, -5); g.closePath(); g.fill();
      g.restore();
    }

    /* ---------------- keys / touch ---------------- */
    bindKeys() {
      addEventListener('keydown', e => {
        if (e.target.closest && e.target.closest('input,textarea')) { if (e.key === 'Escape') e.target.blur(); return; }
        if (!this.app.playing) return;
        if (e.code === 'Escape' && this.panelKind) { this.close(); e.preventDefault(); }
        else if (e.code === 'Escape') { this.app.pause(); e.preventDefault(); }
        else if (e.code === 'Tab') { e.preventDefault(); this.panelKind === 'board' ? this.close() : this.openBoard('tasks'); }
        else if (e.code === 'KeyE' && !this.panelKind) this.app.interact();
        else if ((e.code === 'KeyM' || e.code === 'KeyC') && !this.panelKind) this.openMeeting();
      });
    }
    touchControls() {
      $('#joy').hidden = false; $('#tbtns').hidden = false;
      const joy = $('#joy'), knob = joy.querySelector('b');
      let id = null, cx = 0, cy = 0;
      const set = (x, y) => {
        const dx = x - cx, dy = y - cy, d = Math.min(52, Math.hypot(dx, dy)), a = Math.atan2(dy, dx);
        knob.style.transform = `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px)`;
        this.app.player.setMove(Math.cos(a) * d / 52, -Math.sin(a) * d / 52);
      };
      joy.addEventListener('touchstart', e => { const t = e.changedTouches[0]; id = t.identifier; const r = joy.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; set(t.clientX, t.clientY); e.preventDefault(); }, { passive: false });
      joy.addEventListener('touchmove', e => { for (const t of e.changedTouches) if (t.identifier === id) set(t.clientX, t.clientY); e.preventDefault(); }, { passive: false });
      const end = e => { for (const t of e.changedTouches) if (t.identifier === id) { id = null; knob.style.transform = ''; this.app.player.setMove(0, 0); } };
      joy.addEventListener('touchend', end); joy.addEventListener('touchcancel', end);
      $('#tAct').onclick = () => this.app.interact();
      $('#tBoard').onclick = () => this.panelKind === 'board' ? this.close() : this.openBoard('tasks');
      $('#tRun').onclick = () => { this.app.player.sprint = !this.app.player.sprint; $('#tRun').textContent = this.app.player.sprint ? 'Hurry' : 'Walk'; };
    }

    /* ---------------- panels ---------------- */
    open(kind, header, body, onRender) {
      const p = $('#panel');
      this.panelKind = kind; this.app.player.releaseLock();
      p.replaceChildren(header, ...[].concat(body));
      p.hidden = false;
      this.onRender = onRender || null;
      $('#prompt').hidden = true;
      if (this.app.player.touch) { $('#joy').hidden = true; $('#tbtns').hidden = true; }
    }
    close() {
      const e = this.panelEmp;
      if (e) { e.interacting = false; if (e.state === 'INTERACTING') e.setState('AVAILABLE'); if (!e.meeting && !e.errand && !e.atDesk()) { e.clear(); e.goDesk(); } }
      this.panelEmp = null; this.panelKind = null; this.onRender = null;
      $('#panel').hidden = true;
      if (this.app.player.touch) { $('#joy').hidden = false; $('#tbtns').hidden = false; }
      if (this.app.playing) {
        // The task textarea can stay focused after its panel is hidden. That
        // makes Player ignore WASD, so return focus to the office canvas.
        document.activeElement?.blur?.();
        const canvas = this.app.renderer.domElement;
        canvas.focus({ preventScroll: true });
        if (!this.app.player.touch) {
          try { canvas.requestPointerLock?.()?.catch?.(() => { }); } catch { }
        }
      }
    }
    hdr(title, sub, lead) {
      return h('header', {}, lead || null, h('div', { class: 'who' }, h('h2', {}, title), sub ? h('p', {}, sub) : null),
        h('button', { class: 'x', type: 'button', 'aria-label': 'Close', onclick: () => this.close() }, '✕'));
    }
    tick() {
      if (!this.onRender) return;
      try { this.onRender(); }
      catch (error) {
        console.error('Deskly panel update failed', error);
        this.onRender = null;
        this.toast('This panel could not update. Close and reopen it.', '#e0504a');
      }
    }

    /* ---------------- employee conversation ---------------- */
    openEmployee(e) {
      const app = this.app, rt = app.runtime;
      this.panelEmp = e; e.interacting = true;
      if (e.posture === 'stand' && !e.meeting) e.clear();
      if (e.state === 'AVAILABLE') e.setState('INTERACTING');
      e.say(e.state === 'WAITING_FOR_APPROVAL' ? 'Here\'s what I need you to OK.' : e.state === 'COMPLETED' ? 'Here\'s what I made.' : ['Hi! What can I do for you?', 'Sure — what do you need?', 'Hey boss, what\'s up?'][Math.floor(Math.random() * 3)], 3);
      const S = () => DesklyAgents.STATUS[e.state];
      const resume = DesklyResumes.forEmployee(e);
      const resumeCard = h('div', { class: 'card employee-resume' }, h('h3', {}, 'Skills & knowledge'),
        ...[['skills', 'Skills'], ['knowledge', 'Knowledge'], ['tools', 'Tools & methods']].map(([key, label]) =>
          h('div', { class: 'resume-row' }, h('b', {}, label), h('div', { class: 'resume-tags' },
            ...(resume[key].length ? resume[key].map(item => h('span', {}, item)) : [h('small', {}, 'Not set yet')])))));
      const provLabel = e.provider && e.provider !== 'demo' ? `${e.provider}${e.model ? ' · ' + e.model : ''}` : 'demo mode';
      const chip = h('span', { class: 'chip' });
      const activity = h('p', {});
      const header = this.hdr(e.name, `${e.role} · ${e.dept} · ${provLabel}`, h('div', { class: 'avatar', style: `background:${e.color}` }, initials(e.name)));
      header.querySelector('.who').append(h('div', { style: 'margin-top:6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap' }, chip), activity);
      const taskBox = h('div', { class: 'sect' });
      const chatBox = h('div', { class: 'chat' });
      const ta = h('textarea', { id: 'taskInput', rows: 3, placeholder: `Describe the work for ${fname(e.name)}…` });
      const assignBtn = h('button', { class: 'btn primary', type: 'button' }, 'Assign as task');
      const askBtn = h('button', { class: 'btn', type: 'button' }, 'Just ask');
      const history = this.chats.get(e.id) || []; this.chats.set(e.id, history);
      const renderChat = () => chatBox.replaceChildren(...history.slice(-6).map(m => h('div', { class: m.role === 'user' ? 'me' : 'them' }, m.content)));
      renderChat();
      assignBtn.onclick = () => {
        const d = ta.value.trim(); if (!d) { ta.focus(); return; }
        if (rt.activeFor(e.id)) { this.toast(`${fname(e.name)} is already on a task. Stop it first or wait for the result.`, '#f0a020'); return; }
        rt.create({ employee: e, description: d }); ta.value = '';
        e.say(['On it!', 'Got it — starting now.', 'Great, I\'ll get going.'][Math.floor(Math.random() * 3)], 2.5);
        this.toast(`Assigned to ${e.name}: ${d.slice(0, 60)}`, e.color);
        e.interacting = false; e.clear(); e.goDesk();
        render(true);
      };
      askBtn.onclick = async () => {
        const d = ta.value.trim(); if (!d) { ta.focus(); return; }
        history.push({ role: 'user', content: d }); ta.value = ''; renderChat();
        askBtn.disabled = true; const pending = h('div', { class: 'them' }, '…'); chatBox.append(pending);
        const t = rt.activeFor(e.id);
        const ctxLine = t ? `working on "${t.title}" (${STATUS_LABEL[t.status]}, ${Math.round(t.progress * 100)}%)` : 'available, no active task';
        try { const r = await DK.employeeReply(e.id, ctxLine, history); history.push({ role: 'assistant', content: r }); e.say(r.slice(0, 160), 6); }
        catch (err) { history.pop(); this.toast(DesklyRuntime.errorCopy(err), '#e0504a'); }
        askBtn.disabled = false; renderChat();
      };
      const ideas = h('div', { class: 'ideas' }, ...e.tasks.map(t => h('button', { type: 'button', onclick: () => { ta.value = t; ta.focus(); } }, t)));
      const orders = h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: () => { app.office.order(e, 'coffee'); this.close(); } }, 'Bring me a coffee'),
        h('button', { class: 'btn', type: 'button', onclick: () => { app.office.order(e, 'follow'); this.close(); } }, 'Follow me'),
        h('button', { class: 'btn', type: 'button', onclick: () => { app.office.order(e, 'office'); this.close(); } }, 'Wait in my office'),
        h('button', { class: 'btn', type: 'button', onclick: () => { app.office.order(e, 'desk'); this.close(); } }, 'Back to your desk'),
        h('button', { class: 'btn', type: 'button', onclick: () => this.openMeeting([e.dept]) }, 'Call a meeting'));
      const body = h('div', { class: 'body' }, e.provider === 'demo' || !e.provider ? h('div', { class: 'card amber' }, h('div', { class: 'note', style: 'color:#f3d9a6' }, `${fname(e.name)} is in demo mode, so work is simulated. Give them a provider and API key in Settings → Team.`)) : '', resumeCard, taskBox,
        h('div', { class: 'sect' }, h('h3', {}, 'Give work'), ta, h('div', { class: 'row' }, assignBtn, askBtn), chatBox, h('h3', { style: 'margin-top:4px' }, 'Ideas for ' + e.role.toLowerCase()), ideas),
        h('div', { class: 'sect' }, h('h3', {}, 'Ask in person'), orders),
        h('p', { class: 'note' }, `Scope: ${e.scope}. ${fname(e.name)} works inside your project folder. Commands and anything that leaves the company always stop for your approval.`));
      let lastKey = '';
      const render = (force) => {
        const s = S(); chip.replaceChildren(h('i', { style: `background:${s.color}` }), s.label); activity.textContent = e.activity;
        const t = rt.activeFor(e.id) || rt.latestFor(e.id);
        const key = t ? `${t.id}|${t.status}|${Math.round(t.progress * 50)}|${t.logs.length}|${t.reviewed}` : 'none';
        if (key === lastKey && !force) return; lastKey = key;
        taskBox.replaceChildren(...this.taskCard(t, e));
      };
      this.open('employee', header, body, render); render(true);
      setTimeout(() => { if (!this.app.player.touch) ta.focus({ preventScroll: true }); }, 50);
    }

    taskCard(t, e) {
      const rt = this.app.runtime;
      if (!t) return [h('h3', {}, 'Current task'), h('p', { class: 'note' }, `${fname(e.name)} has nothing assigned. Describe some work below — ${fname(e.name)} will plan it, do it, and stop for your approval before anything leaves the building.`)];
      const col = STATUS_COL[t.status];
      const out = [h('h3', {}, 'Current task')];
      const card = h('div', { class: 'card' + (t.status === 'waiting_for_approval' ? ' amber' : t.status === 'completed' ? ' green' : ['failed'].includes(t.status) ? ' red' : '') },
        h('div', { style: 'display:flex;gap:8px;align-items:center;justify-content:space-between' }, h('div', { class: 't' }, t.title), h('span', { class: 'chip' }, h('i', { style: `background:${col}` }), STATUS_LABEL[t.status])),
        h('div', { class: 'bar' }, h('b', { style: `width:${Math.round(t.progress * 100)}%;background:${col}` })));
      if (t.steps && t.steps.length) card.append(h('ol', { class: 'steps' }, ...t.steps.map((s, i) => h('li', { class: i < t.step || t.status === 'completed' ? 'done' : i === t.step ? 'now' : '' }, h('span', {}, i < t.step || t.status === 'completed' ? '✓' : i === t.step ? '▸' : '·'), s.label + (s.sensitive ? ' · needs approval' : '')))));
      if (t.status === 'waiting_for_approval') {
        const a = rt.pendingApprovals().find(x => x.taskId === t.id);
        if (a) card.append(h('div', { class: 'card amber' },
          h('div', { class: 't' }, 'Approval needed'),
          h('div', { style: 'font-size:13px;line-height:1.45' }, h('b', {}, a.action.kind.replace(/_/g, ' ')), ' · ', a.action.summary),
          a.action.content ? h('pre', { class: 'log' }, a.action.content) : null,
          h('div', { class: 'note' }, `Risk: ${a.action.risk}. ${a.action.kind === 'execute_command' ? 'Approving runs this command in your project folder.' : 'Approving records it in the audit log — Deskly never sends or publishes on its own.'}`),
          h('div', { class: 'row' }, h('button', { class: 'btn warn', type: 'button', onclick: () => { rt.respondApproval(a.id, 'approved'); this.toast(`Approved: ${a.action.summary}`, '#2fbf71'); } }, 'Approve'),
            h('button', { class: 'btn danger', type: 'button', onclick: () => { rt.respondApproval(a.id, 'rejected'); } }, 'Reject'))));
      }
      if (DesklyRuntime.ACTIVE.has(t.status)) {
        const log = h('pre', { class: 'log' }, t.logs.slice(-10).map(l => l.text).join('\n'));
        card.append(log); setTimeout(() => { log.scrollTop = 1e6; });
        card.append(h('div', { class: 'row' }, h('button', { class: 'btn danger', type: 'button', onclick: () => rt.cancel(t.id) }, 'Stop task')));
      }
      if (t.status === 'failed' || t.status === 'cancelled') card.append(h('div', { class: 'note' }, t.error || ''), h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: () => { const ta = $('#taskInput'); if (ta) { ta.value = t.description; ta.focus(); } } }, 'Edit and retry')));
      out.push(card);
      if (t.status === 'completed' && t.result) out.push(this.resultCard(t, e));
      return out;
    }
    resultCard(t, e) {
      const r = t.result;
      const body = h('div', { class: 'md', html: md(r.body) });
      const copyBtn = h('button', { class: 'btn', type: 'button' }, 'Copy report');
      copyBtn.onclick = async () => { try { await navigator.clipboard.writeText(r.body); copyBtn.textContent = 'Copied'; } catch (err) { copyBtn.textContent = 'Copy failed'; } };
      const doneBtn = h('button', { class: 'btn primary', type: 'button' }, t.reviewed ? 'Reviewed ✓' : 'Mark reviewed');
      doneBtn.onclick = () => { this.app.runtime.markReviewed(t.id); e.setState('AVAILABLE'); e.say('Thanks! Ready for the next one.', 3); doneBtn.textContent = 'Reviewed ✓'; };
      const files = (r.files || []).map(f => h('button', { class: 'item', type: 'button', onclick: () => { this.close(); this.app.openLaptop(f); } },
        h('div', { class: 'meta' }, h('b', {}, f), h('small', {}, 'Open on your laptop')), h('span', { class: 'chip' }, 'Open')));
      return h('div', { class: 'sect' }, h('h3', {}, 'Result'),
        h('div', { class: 'card green' }, h('div', { class: 't' }, r.summary)),
        files.length ? h('div', { class: 'list' }, ...files) : '',
        body, h('div', { class: 'row' }, doneBtn, copyBtn));
    }

    /* ---------------- board ---------------- */
    openBoard(tab = 'tasks') {
      const app = this.app, rt = app.runtime;
      const tabs = ['tasks', 'approvals', 'team', 'audit'];
      const names = { tasks: 'Tasks', approvals: 'Approvals', team: 'Team', audit: 'Audit log' };
      const bar = h('div', { class: 'tabs', role: 'tablist' });
      const body = h('div', { class: 'body' });
      let cur = tab, lastKey = '';
      const renderTabs = () => bar.replaceChildren(...tabs.map(t => h('button', { type: 'button', role: 'tab', 'aria-selected': String(t === cur), onclick: () => { cur = t; lastKey = ''; renderTabs(); render(); } }, names[t] + (t === 'approvals' && rt.pendingApprovals().length ? ` (${rt.pendingApprovals().length})` : ''))));
      const render = () => {
        const key = cur + rt.list().map(t => t.status + (t.progress * 20 | 0)).join() + rt.pendingApprovals().length + app.office.employees.map(e => e.state).join() + (cur === 'audit' ? app.audit.entries.length : '');
        if (key === lastKey) return; lastKey = key; renderTabs();
        if (cur === 'tasks') {
          const ts = rt.list();
          body.replaceChildren(ts.length ? h('div', { class: 'list' }, ...ts.map(t => {
            const e = app.office.byId(t.employeeId);
            return h('button', { class: 'item', type: 'button', onclick: () => e && this.openEmployee(e) },
              h('div', { class: 'avatar', style: `background:${e?.color || '#555'};width:32px;height:32px;font-size:12px;border-radius:9px` }, initials(t.employeeName)),
              h('div', { class: 'meta' }, h('b', {}, t.title), h('small', {}, `${t.employeeName} · ${new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`)),
              h('span', { class: 'chip' }, h('i', { style: `background:${STATUS_COL[t.status]}` }), STATUS_LABEL[t.status] + (DesklyRuntime.ACTIVE.has(t.status) ? ` ${Math.round(t.progress * 100)}%` : '')));
          })) : h('p', { class: 'note' }, 'No tasks yet. Walk up to anyone and press E to give them work.'),
            ts.some(t => !DesklyRuntime.ACTIVE.has(t.status)) ? h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: () => { rt.clearHistory(); lastKey = ''; render(); } }, 'Clear finished tasks')) : '');
        } else if (cur === 'approvals') {
          const ap = rt.pendingApprovals();
          body.replaceChildren(ap.length ? h('div', { class: 'list' }, ...ap.map(a => {
            const e = app.office.byId(a.employeeId), t = rt.get(a.taskId);
            return h('div', { class: 'card amber' }, h('div', { class: 't' }, `${e.name} · ${t.title}`), h('div', { style: 'font-size:13px' }, h('b', {}, a.action.kind.replace(/_/g, ' ')), ' · ', a.action.summary), h('div', { class: 'note' }, `Risk: ${a.action.risk}`),
              h('div', { class: 'row' }, h('button', { class: 'btn warn', type: 'button', onclick: () => rt.respondApproval(a.id, 'approved') }, 'Approve'), h('button', { class: 'btn danger', type: 'button', onclick: () => rt.respondApproval(a.id, 'rejected') }, 'Reject'), h('button', { class: 'btn', type: 'button', onclick: () => this.openEmployee(e) }, 'Open')));
          })) : h('p', { class: 'note' }, 'Nothing is waiting for you.'));
        } else if (cur === 'team') {
          body.replaceChildren(h('div', { class: 'list' }, ...app.office.employees.map(e => h('div', { class: 'item' },
            h('div', { class: 'avatar', style: `background:${e.color};width:32px;height:32px;font-size:12px;border-radius:9px` }, initials(e.name)),
            h('div', { class: 'meta' }, h('b', {}, `${e.name} · ${e.role}`), h('small', {}, `${DesklyAgents.STATUS[e.state].label} · ${e.present ? e.activity : 'Not in yet'}`)),
            h('button', { class: 'btn', type: 'button', disabled: !e.present, onclick: () => { app.office.walkToPlayer(e, 'summon'); e.say('Coming over!', 2); this.close(); } }, 'Summon')))));
        } else {
          body.replaceChildren(h('div', { class: 'audit' }, ...app.audit.entries.slice(-120).reverse().map(ev => h('div', {}, `${ev.timestamp.slice(11, 19)}  ${ev.type}  ${ev.employeeId || ''} ${ev.status || ev.decision || ev.title || (ev.action ? ev.action.summary : '') || ev.text || ''}`.slice(0, 160)))),
            h('p', { class: 'note' }, 'Every task, status change, approval decision and output line is recorded here.'));
        }
      };
      this.panelEmp && (this.panelEmp.interacting = false); this.panelEmp = null;
      this.open('board', this.hdr('Operations board', 'Everything your team is doing, in one place'), [bar, body], render);
      render();
    }

    /* ---------------- meetings ---------------- */
    openMeeting(depts, room) {
      const app = this.app, of = app.office;
      if (of.meeting) return this.meetingLive();
      const rooms = [['CEO_Office', 'My office'], ['Boardroom', 'Boardroom · 11 seats'], ['Meeting_1', 'Meeting room 1'], ['Meeting_2', 'Meeting room 2'], ['Meeting_3', 'Meeting room 3']];
      let sel = room || (app.player.seated ? 'CEO_Office' : 'Boardroom');
      const quick = h('div', { class: 'row' });
      const present = of.employees.filter(e => e.present);
      const chosen = new Set(depts ? present.filter(e => depts.includes(e.dept)).map(e => e.id) : present.map(e => e.id));
      const people = h('div', { class: 'ideas' });
      const roomsEl = h('div', { class: 'row' });
      const topic = h('input', { type: 'text', id: 'meetTopic', placeholder: 'Topic (optional) — e.g. How do we get our first 100 customers?' });
      const renderSel = () => {
        roomsEl.replaceChildren(...rooms.map(([id, l]) => h('button', { type: 'button', class: 'btn' + (id === sel ? ' primary' : ''), onclick: () => { sel = id; renderSel(); } }, l)));
        const depts = [...new Set(present.map(e => e.dept))];
        quick.replaceChildren(h('button', { type: 'button', class: 'btn', onclick: () => { present.forEach(e => chosen.add(e.id)); renderSel(); } }, 'Everyone'), h('button', { type: 'button', class: 'btn', onclick: () => { chosen.clear(); renderSel(); } }, 'Nobody'),
          ...depts.map(d => h('button', { type: 'button', class: 'btn', onclick: () => { const ids = present.filter(e => e.dept === d).map(e => e.id); const all = ids.every(id => chosen.has(id)); ids.forEach(id => all ? chosen.delete(id) : chosen.add(id)); renderSel(); } }, d)));
        people.replaceChildren(...present.map(e => h('button', { type: 'button', style: chosen.has(e.id) ? `border-style:solid;border-color:${e.color};color:#fff` : '', onclick: () => { chosen.has(e.id) ? chosen.delete(e.id) : chosen.add(e.id); renderSel(); } }, (chosen.has(e.id) ? '✓ ' : '') + fname(e.name) + ' · ' + e.dept)));
      };
      renderSel();
      const go = h('button', { class: 'btn primary', type: 'button', onclick: () => {
        const list = present.filter(e => chosen.has(e.id));
        if (!list.length) { this.toast('Pick at least one person.', '#f0a020'); return; }
        of.callMeeting(sel, list, topic.value.trim());
        this.toast(`${list.length} ${list.length === 1 ? 'person is' : 'people are'} on the way to ${sel === 'CEO_Office' ? 'your office' : sel.replace('_', ' ')}.`, '#f2c230');
        this.close();
      } }, 'Call them');
      this.open('meeting', this.hdr('Call people', 'Pick who should come and where. Their tasks keep running while they are with you.'),
        h('div', { class: 'body' }, h('div', { class: 'sect' }, h('h3', {}, 'Where'), roomsEl), h('div', { class: 'sect' }, h('h3', {}, 'Who'), quick, people, h('p', { class: 'note' }, 'Seats fill first; anyone extra stands around the room.')), h('div', { class: 'sect' }, h('h3', {}, 'Topic'), topic), h('div', { class: 'row' }, go)));
    }
    meetingLive() {
      const app = this.app, of = app.office, m = of.meeting;
      const status = h('p', { class: 'note' });
      const transcript = h('div', { class: 'chat' });
      const lines = m.lines;
      const addLine = (e, l) => { lines.push({ e, l }); renderT(); };
      const renderT = () => transcript.replaceChildren(...lines.slice(-12).map(x => h('div', { class: 'them' }, h('b', {}, x.fname(e.name) + ': '), x.l)));
      renderT();
      const topic = h('input', { type: 'text', id: 'meetTopic2', value: m.topic || '', placeholder: 'What should the team think about?' });
      const b1 = h('button', { class: 'btn', type: 'button', onclick: async () => { b1.disabled = b2.disabled = true; await of.runStandup(addLine); b1.disabled = b2.disabled = false; } }, 'Go around: status updates');
      const b2 = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
        const tp = topic.value.trim(); if (!tp) { topic.focus(); return; }
        b1.disabled = b2.disabled = true;
        try { await of.runBrainstorm(tp, { meeting: (t, p) => DK.meetingIdeas(t, p) }, addLine); } catch (err) { this.toast(DesklyRuntime.errorCopy(err), '#e0504a'); }
        b1.disabled = b2.disabled = false;
      } }, 'Brainstorm this topic');
      const end = h('button', { class: 'btn danger', type: 'button', onclick: () => { of.endMeeting(); this.toast('Everyone is heading back to their desks.', '#f2c230'); this.close(); } }, 'Send everyone back');
      const render = () => { const a = of.meetingArrived(); status.textContent = `${a} of ${m.people.length} seated in ${m.room.replace('_', ' ')}. ${a < m.people.length ? 'People are still walking over.' : 'Everyone is here.'}`; };
      this.open('meetingLive', this.hdr(m.room === 'CEO_Office' ? 'In your office' : 'Meeting in progress', m.room === 'CEO_Office' ? `${m.people.length} people called in` : m.room.replace('_', ' ')), h('div', { class: 'body' }, status, h('div', { class: 'sect' }, h('h3', {}, 'Run the meeting'), h('div', { class: 'row' }, b1), topic, h('div', { class: 'row' }, b2)), h('div', { class: 'sect' }, h('h3', {}, 'Transcript'), transcript), h('div', { class: 'row' }, end)), render);
      render();
    }
  }
  UI.md = md;
  window.DesklyUI = UI;
})();
