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
      else if (k === 'markdown') el.innerHTML = md(v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  function md(src) {
    const out = []; const lines = String(src).split('\n'); let i = 0, list = null;
    const inl = t => esc(t).replace(/\[([^\]]+)\]\((https:\/\/[^\s<>]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>');
    const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
    while (i < lines.length) {
      const l = lines[i];
      if (/^```/.test(l)) { close(); const buf = []; i++; while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]); i++; out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`); continue; }
      if (l.includes('|') && /^\s*\|?\s*:?-{3,}/.test(lines[i+1] || '')) { close(); const cells = row => row.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim()); out.push('<table><thead><tr>' + cells(l).map(cell => '<th>' + inl(cell) + '</th>').join('') + '</tr></thead><tbody>'); i += 2; while (i < lines.length && lines[i].includes('|') && lines[i].trim()) { out.push('<tr>' + cells(lines[i++]).map(cell => '<td>' + inl(cell) + '</td>').join('') + '</tr>'); } out.push('</tbody></table>'); continue; }
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
  const STATUS_LABEL = { created: 'Queued', queued: 'Queued', planning: 'Planning', running: 'Running', waiting_for_approval: 'Needs you', reviewing: 'Self-review', interrupted: 'Interrupted', completed: 'Done', failed: 'Failed', cancelled: 'Stopped' };
  const STATUS_COL = { created: '#9b7be0', queued: '#9b7be0', planning: '#9b7be0', running: '#3b8ff0', waiting_for_approval: '#f0a020', reviewing: '#3b8ff0', interrupted: '#f0a020', completed: '#2fbf71', failed: '#e0504a', cancelled: '#9aa3ad' };

  class UI {
    constructor(app) {
      this.app = app; this.tags = new Map(); this.panelKind = null; this.chats = new Map();
      this.mm = $('#mm').getContext('2d');
      // The atlas installs the collision-derived floor plan after UI creation.
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
        h('button', { type: 'button', class: appr ? 'warn' : '', onclick: () => this.openBoard('approvals'), title: 'Approvals waiting' }, h('i', { style: 'background:#f0a020' }), `${appr}`, h('span', {}, ' needs you')),
        h('button', { type: 'button', onclick: () => this.openBoard('tasks'), title: 'Results ready for review' }, h('i', { style: 'background:#2fbf71' }), `${done}`, h('span', {}, ' done'))
      );
    }
    clock(info, preview = false) {
      if (!info) return;
      $('#clockT').textContent = info.time;
      $('#clockD').textContent = `${info.label} · ${info.region.replace(/^.*·\s*/, '')}${preview ? ' · Preview' : ''}`;
      $('#clock').title = `Office time · ${info.zone}${preview ? ' · Fast preview' : ''}`;
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
      const fwd = this.tagForward ||= new T.Vector3(); camera.getWorldDirection(fwd);
      for (const e of this.app.office.employees) {
        let tag = this.tags.get(e.id);
        if (!tag) {
          tag = { el: h('div', { class: 'tag' }), name: h('div', { class: 'name' }), bubble: h('div', { class: 'bubble' }) };
          tag.el.append(tag.bubble, tag.name); $('#tags').append(tag.el); this.tags.set(e.id, tag);
        }
        const p = e.head; p.y += 0.42;
        const d = p.distanceTo(cam);
        const v = (this.tagVector ||= new T.Vector3()).copy(p).sub(cam);
        let show = e.present && d < 14 && v.dot(fwd) > 0.2;
        if (show) for (let step = .4; step < d - .6; step += .4) { const fraction = step / d; if (this.app.nav.blockedAt(cam.x + v.x * fraction, cam.z + v.z * fraction, false)) { show = false; break; } }
        if (!show) { tag.el.style.display = 'none'; continue; }
        const s = (this.tagScreen ||= new T.Vector3()).copy(p).project(camera);
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

    /* ---------------- keys / touch ---------------- */
    bindKeys() {
      addEventListener('keydown', e => {
        if (e.target.closest && e.target.closest('input,textarea,select')) { if (e.key === 'Escape' && this.panelKind) { this.close(); e.preventDefault(); } else if (e.key === 'Escape') e.target.blur(); return; }
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
      this.panelKind = kind; p.dataset.kind = kind; this.app.player.releaseLock();
      this.app.player.enabled = false;
      this.panelScrollUntil = 0;
      if (!this.scrollWatcher) { this.scrollWatcher = () => { this.panelScrollUntil = performance.now() + 160; }; p.addEventListener?.('scroll', this.scrollWatcher, { capture: true, passive: true }); }
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
      this.app.player.enabled = !!this.app.playing;
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
      if (!this.onRender || (this.panelScrollUntil && performance.now() < this.panelScrollUntil)) return;
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
      const header = this.hdr(e.name, `${e.role} · ${e.dept} · ${provLabel}`, h('div', { class: 'avatar', style: `background:${DesklyScreens.departmentColor(e.dept)}` }, initials(e.name)));
      header.querySelector('.who').append(h('div', { style: 'margin-top:6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap' }, chip), activity);
      const taskBox = h('div', { class: 'sect' });
      const chatBox = h('div', { class: 'chat' });
      const ta = h('textarea', { id: 'taskInput', rows: 3, placeholder: `Describe the work for ${fname(e.name)}…` });
      const assignBtn = h('button', { class: 'btn primary', type: 'button' }, 'Assign as task');
      const askBtn = h('button', { class: 'btn', type: 'button' }, 'Just ask');
      const history = this.chats.get(e.id) || []; this.chats.set(e.id, history);
      const renderChat = () => chatBox.replaceChildren(...history.slice(-6).map(m => h('div', { class: m.role === 'user' ? 'me' : 'them' }, m.content)));
      renderChat();
      assignBtn.onclick = async () => {
        const d = ta.value.trim(); if (!d) { ta.focus(); return; }
        if (rt.activeFor(e.id)) { this.toast(`${fname(e.name)} is already on a task. Stop it first or wait for the result.`, '#f0a020'); return; }
        assignBtn.disabled = true;
        const created = await rt.create({ employee: e, description: d }); assignBtn.disabled = false;
        if (!created) return;
        ta.value = '';
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
        try { const r = await DK.employeeReply(e.id, ctxLine.slice(0, 3000), DesklyRuntime.historyForIPC(history)); history.push({ role: 'assistant', content: r }); e.say(r.slice(0, 160), 6); }
        catch (err) { history.pop(); ta.value = d; this.toast(DesklyRuntime.errorCopy(err), '#e0504a'); }
        askBtn.disabled = false; renderChat();
      };
      const ideas = h('div', { class: 'ideas' }, ...e.tasks.map(t => h('button', { type: 'button', onclick: () => { ta.value = t; ta.focus(); } }, t)));
      const orders = h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: () => { const line = app.life?.statusLine(e) || e.activity; e.say(line, 6); this.toast(line, e.color); } }, 'Quick status'),
        h('button', { class: 'btn', type: 'button', onclick: () => { app.office.order(e, 'coffee'); this.close(); } }, 'Bring me a coffee'),
        h('button', { class: 'btn', type: 'button', onclick: () => { app.office.order(e, 'coffeeTogether'); this.close(); } }, 'Take a coffee break'),
        h('button', { class: 'btn', type: 'button', onclick: () => { app.office.order(e, 'follow'); this.close(); } }, 'Follow me'),
        h('button', { class: 'btn', type: 'button', onclick: () => { app.office.order(e, 'introduce'); this.close(); } }, 'Meet a teammate'),
        h('button', { class: 'btn', type: 'button', onclick: () => { app.office.order(e, 'office'); this.close(); } }, 'Wait in my office'),
        h('button', { class: 'btn', type: 'button', onclick: () => { app.office.order(e, 'desk'); this.close(); } }, 'Back to your desk'),
        h('button', { class: 'btn', type: 'button', onclick: () => this.openMeeting([e.dept]) }, 'Call a meeting'));
      const feedback = h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: () => app.life?.feedback(e, 'positive') }, 'Praise this work'),
        h('button', { class: 'btn', type: 'button', onclick: () => app.life?.feedback(e, 'revise') }, 'Needs a better pass'));
      const tabBar = h('div', { class: 'tabs', role: 'tablist' });
      const taskPage = h('div', { class: 'employee-page' }, taskBox, h('div', { class: 'sect' }, h('h3', {}, 'Work ideas'), ideas), h('div', { class: 'sect' }, h('h3', {}, 'Feedback'), feedback));
      const talkPage = h('div', { class: 'employee-page' }, chatBox, h('div', { class: 'sect' }, h('h3', {}, 'Ask in person'), orders));
      const resumePage = h('div', { class: 'employee-page' }, resumeCard, h('p', { class: 'note' }, `Scope: ${e.scope}. ${fname(e.name)} works inside your project folder. Commands and external actions stop for your approval.`), h('button', { class: 'btn', type: 'button', onclick: () => { this.close(); app.pause(); app.screens.openSettings('memory'); } }, 'Review memory in Settings'));
      const pages = [taskPage, talkPage, resumePage];
      const selectTab = index => { pages.forEach((page, i) => page.hidden = i !== index); [...tabBar.children].forEach((button, i) => { button.setAttribute('aria-selected', String(i === index)); button.tabIndex = i === index ? 0 : -1; }); };
      ['Task', 'Talk', 'Résumé & memory'].forEach((label, index) => tabBar.append(h('button', { type: 'button', role: 'tab', 'aria-selected': String(index === 0), onclick: () => selectTab(index), onkeydown: event => { if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return; event.preventDefault(); const next = (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3; selectTab(next); tabBar.children[next].focus(); } }, label)));
      selectTab(0);
      const body = h('div', { class: 'body employee-body' }, e.provider === 'demo' || !e.provider ? h('div', { class: 'card amber' }, h('p', { class: 'note' }, 'Demo mode · work is simulated. Configure a provider in Settings → Team & AI keys.')) : null, ...pages);
      const composer = h('div', { class: 'employee-composer' }, h('h3', {}, 'New work order'), ta, h('div', { class: 'row' }, assignBtn, askBtn));
      let lastKey = '';
      const render = (force) => {
        const s = S(); chip.replaceChildren(h('i', { style: `background:${s.color}` }), s.label); activity.textContent = e.activity;
        const t = rt.activeFor(e.id) || rt.latestFor(e.id);
        const key = t ? `${t.id}|${t.status}|${Math.round(t.progress * 50)}|${t.logs.length}|${t.reviewed}|${rt.pendingApprovals().filter(approval => approval.taskId === t.id).map(approval => approval.id).join(',')}` : 'none';
        if (key === lastKey && !force) return; lastKey = key;
        taskBox.replaceChildren(...this.taskCard(t, e));
      };
      this.open('employee', header, [tabBar, body, composer], render); render(true);
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
      if (t.projectMap && t.workArea) card.append(h('p', { class: 'note' }, `Project area: ${t.projectMap.areas[t.workArea]}/ · ${t.workArea}`));
      if (t.steps && t.steps.length) card.append(h('ol', { class: 'steps' }, ...t.steps.map((s, i) => h('li', { class: i < t.step || t.status === 'completed' ? 'done' : i === t.step ? 'now' : '' }, h('span', {}, i < t.step || t.status === 'completed' ? '✓' : i === t.step ? '▸' : '·'), s.label))));
      if (t.status === 'waiting_for_approval') {
        const a = rt.pendingApprovals().find(x => x.taskId === t.id);
        if (a) card.append(h('div', { class: 'slip approval-slip' },
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
      if (['interrupted', 'failed', 'cancelled'].includes(t.status)) card.append(h('div', { class: 'note' }, t.error || ''), h('div', { class: 'row' },
        t.canResume ? h('button', { class: 'btn primary', type: 'button', onclick: () => rt.resume(t.id) }, 'Resume saved work') : null,
        h('button', { class: 'btn', type: 'button', onclick: () => { const ta = $('#taskInput'); if (ta) { ta.value = t.description; ta.focus(); } } }, 'Edit and retry')));
      out.push(card);
      if (t.status === 'completed' && t.result) out.push(this.resultCard(t, e));
      return out;
    }
    resultCard(t, e) {
      const r = t.result;
      const body = h('div', { class: 'md', markdown: r.body });
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
      const overview = h('aside', { class: 'operations-overview' });
      const bar = h('div', { class: 'tabs', role: 'tablist' });
      const body = h('div', { class: 'body' });
      let cur = tab, lastKey = '', teamOffice = null, teamRoot = null, updateTeam = null;
      const renderTabs = () => bar.replaceChildren(...tabs.map(t => h('button', { type: 'button', role: 'tab', 'aria-selected': String(t === cur), onclick: () => { cur = t; lastKey = ''; renderTabs(); render(); } }, names[t] + (t === 'approvals' && rt.pendingApprovals().length ? ` (${rt.pendingApprovals().length})` : ''))));
      const render = () => {
        const key = cur + '' + rt.list().map(t => t.status + (t.progress * 20 | 0)).join() + rt.pendingApprovals().length + app.office.employees.map(e => `${e.state}:${e.present}:${e.activity}`).join() + app.office.shift.overtime.join() + app.office.shift.recalled.join() + app.office.shift.sentHome.join() + (cur === 'audit' ? app.audit.entries.length : '');
        if (key === lastKey) return; lastKey = key;
        if(cur==='team' && teamOffice===app.office && teamRoot?.isConnected){updateTeam();const counts=overview.querySelectorAll('.operations-counts b');if(counts.length===2){counts[0].textContent=String(rt.pendingApprovals().length).padStart(2,'0');counts[1].textContent=String(rt.list().filter(task=>['created','queued','planning','running','reviewing'].includes(task.status)).length).padStart(2,'0');}return;}
        renderTabs();
        overview.replaceChildren(h('h2', {}, cur === 'approvals' ? 'Needs your say.' : 'Your company, at work.'), h('div', { class: 'operations-counts' }, h('div', {}, h('b', {}, String(rt.pendingApprovals().length).padStart(2, '0')), h('span', { class: 'label' }, 'Waiting')), h('div', {}, h('b', {}, String(rt.list().filter(task => ['created', 'queued', 'planning', 'running', 'reviewing'].includes(task.status)).length).padStart(2, '0')), h('span', { class: 'label' }, 'Running'))), h('p', { class: 'note' }, 'Review exact changes here. Commands can access your computer; approving them does not create a sandbox.'), h('p', { class: 'note' }, 'Protected configuration always asks before writing.'), h('button', { class: 'btn ghost', type: 'button', onclick: () => { this.close(); app.pause(); app.screens.openSettings('memory'); } }, 'Memory & usage settings'));
        DK.tasksSnapshot().then(snapshot => { const errors = [...(snapshot.notices || []), snapshot.lastSaveError, snapshot.lastAuditError].filter(Boolean); if (!body.isConnected || !errors.length) return; const notice = h('div', { class: 'card amber' }, h('h3', {}, 'Local data needs attention'), ...errors.map(message => h('p', {}, message))); body.prepend(notice); }).catch(() => {});
        if (cur === 'tasks') {
          const ts = rt.list();
          const handoffs = h('div', { class: 'list' }, h('p', { class: 'note' }, 'Loading project handoffs…'));
          body.replaceChildren(ts.length ? h('div', { class: 'list' }, ...ts.map(t => {
            const e = app.office.byId(t.employeeId);
            return h('button', { class: 'item', type: 'button', onclick: () => e && this.openEmployee(e) },
              h('div', { class: 'avatar', style: `background:${e?.color || '#555'};width:32px;height:32px;font-size:12px;border-radius:9px` }, initials(t.employeeName)),
              h('div', { class: 'meta' }, h('b', {}, t.title), h('small', {}, `${t.employeeName} · ${new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`)),
              h('span', { class: 'chip' }, h('i', { style: `background:${STATUS_COL[t.status]}` }), STATUS_LABEL[t.status] + (DesklyRuntime.ACTIVE.has(t.status) ? ` ${Math.round(t.progress * 100)}%` : '')));
          })) : h('p', { class: 'note' }, 'No tasks yet. Walk up to anyone and press E to give them work.'),
            ts.some(t => !DesklyRuntime.ACTIVE.has(t.status)) ? h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: () => { rt.clearHistory(); lastKey = ''; render(); } }, 'Clear finished tasks')) : '',
            h('div', { class: 'sect' }, h('h3', {}, 'Project handoffs and dependencies'), handoffs));
          DK.teamUpdates().then(rows => {
            if (!handoffs.isConnected) return;
            handoffs.replaceChildren(...(rows.length ? rows.slice(-12).reverse().map(u => h('div', { class: 'card' },
              h('div', { class: 't' }, `${app.office.byId(u.from)?.name || u.from} → ${u.to === 'all' ? 'team' : app.office.byId(u.to)?.name || u.to}`),
              h('p', {}, u.text),
              u.contract ? h('p', { class: 'note' }, `Interface: ${u.contract}`) : null,
              u.needs ? h('p', { class: 'note' }, `Needs: ${u.needs}`) : null,
              u.files?.length ? h('p', { class: 'note' }, `Files: ${u.files.join(', ')}`) : null)) : [h('p', { class: 'note' }, 'No handoffs yet. Agents share exact files, interfaces, and blockers here as they work.') ]));
          }).catch(e => { if (handoffs.isConnected) handoffs.replaceChildren(h('p', { class: 'note' }, e.message)); });
        } else if (cur === 'approvals') {
          const ap = rt.pendingApprovals();
          body.replaceChildren(ap.length ? h('div', { class: 'list' }, ...ap.map(a => {
            const e = app.office.byId(a.employeeId), t = rt.get(a.taskId);
            return h('div', { class: 'slip approval-slip' }, h('div', { class: 't' }, `${e?.name || a.employeeName || 'Former employee'} · ${t?.title || 'Unavailable task'}`), h('div', { style: 'font-size:13px' }, h('b', {}, a.action.kind.replace(/_/g, ' ')), ' · ', a.action.summary), h('div', { class: 'note' }, `Risk: ${a.action.risk}`), a.action.content ? h('pre', { class: 'log' }, a.action.content) : null,
              h('div', { class: 'row' }, h('button', { class: 'btn warn', type: 'button', onclick: () => rt.respondApproval(a.id, 'approved') }, 'Approve'), h('button', { class: 'btn danger', type: 'button', onclick: () => rt.respondApproval(a.id, 'rejected') }, 'Reject'), h('button', { class: 'btn', type: 'button', onclick: () => this.openEmployee(e) }, 'Open')));
          })) : h('p', { class: 'note' }, 'Nothing is waiting for you.'));
        } else if (cur === 'team') {
          const office = app.office, refresh = () => { lastKey = ''; render(); }, shiftNote=h('p',{class:'note'}), rows=[];
          teamOffice=office;
          teamRoot=h('div',{class:'list'},...office.employees.map(e=>{
            const status=h('small',{}),recall=h('button',{class:'btn',type:'button',onclick:()=>{office.recall(e);refresh();}}),overtime=h('button',{class:'btn',type:'button',onclick:()=>{office.setOvertime(e,!office.shift.overtime.includes(e.id));refresh();}}),summon=h('button',{class:'btn',type:'button',onclick:()=>{office.walkToPlayer(e,'summon');e.say('Coming over!',2);this.close();}},'Summon');
            rows.push({e,status,recall,overtime,summon});
            return h('div',{class:'item team-item'},h('div',{class:'avatar',style:'background:'+e.color+';width:32px;height:32px;font-size:12px;border-radius:9px'},initials(e.name)),h('div',{class:'meta'},h('b',{},e.name+' · '+e.role),status),h('div',{class:'row team-actions'},recall,overtime,h('button',{class:'btn',type:'button',onclick:()=>{office.release(e);refresh();}},'Send home'),summon));
          }));
          updateTeam=()=>{
            const afterHours=!app.clockInfo.workday || office.hour()>=18 || office.hour()<9;
            const note=(afterHours?'After hours.':'The normal shift is 09:00–18:00.')+' Calling the team back keeps them here through the night and across restarts until you send them home. Their active tasks continue if you send them home.';
            if(shiftNote.textContent!==note)shiftNote.textContent=note;
            for(const row of rows){const {e,status,recall,overtime,summon}=row,extra=office.shift.overtime.includes(e.id),held=extra||office.shift.recalled.includes(e.id),text=DesklyAgents.STATUS[e.state].label+' · '+(e.present?e.activity:'At home');if(status.textContent!==text)status.textContent=text;const label=held?'Held here':e.present?'Keep here':'Call back';if(recall.textContent!==label)recall.textContent=label;recall.disabled=held;overtime.textContent=extra?'End overtime':'Overtime';overtime.classList.toggle('primary',extra);summon.disabled=!e.present;}
          };
          body.replaceChildren(h('div',{class:'card'},h('div',{class:'t'},'Office shift'),shiftNote,h('div',{class:'row'},h('button',{class:'btn primary',type:'button',onclick:()=>{office.employees.forEach(e=>office.recall(e));refresh();}},'Call everyone back · keep here'),h('button',{class:'btn',type:'button',onclick:()=>{office.employees.forEach(e=>office.release(e));refresh();}},'Send everyone home'))),teamRoot);
          updateTeam();
        } else {
          body.replaceChildren(h('div', { class: 'audit' }, ...app.audit.entries.slice(-120).reverse().map(ev => h('div', {}, `${ev.timestamp.slice(11, 19)}  ${ev.type}  ${ev.employeeId || ''} ${ev.status || ev.decision || ev.title || (ev.action ? ev.action.summary : '') || ev.text || ''}`.slice(0, 160)))),
            h('p', { class: 'note' }, 'Every task, status change, approval decision and output line is recorded here.'));
        }
      };
      this.panelEmp && (this.panelEmp.interacting = false); this.panelEmp = null;
      this.open('board', this.hdr('Operations board', 'Everything your team is doing, in one place'), [overview, bar, body], render);
      render();
    }

    /* ---------------- physical office objects ---------------- */
    openMonitor(e) {
      const taskBox = h('div', { class: 'sect' });
      const render = () => {
        const t = this.app.runtime.activeFor(e.id) || this.app.runtime.latestFor(e.id);
        taskBox.replaceChildren(...this.taskCard(t, e));
      };
      this.open('monitor', this.hdr(`${fname(e.name)}’s monitor`, `${e.role} · ${e.activity}`),
        h('div', { class: 'body' }, h('div', { class: 'card' }, h('div', { class: 't' }, e.state === 'AVAILABLE' ? 'Ready for work' : DesklyAgents.STATUS[e.state].label), h('p', { class: 'note' }, 'This is a live view of the employee’s current task. Looking at it does not interrupt them or make an AI call.')), taskBox), render);
      render();
    }
    openWhiteboard(marker, life) {
      const room = marker.room || 'Office', saved = life.board(room);
      const area = h('textarea', { rows: 14, placeholder: 'Goals, decisions, architecture notes, blockers…' }); area.value = saved.text || '';
      const save = h('button', { class: 'btn primary', type: 'button', onclick: () => { life.saveBoard(room, area.value); save.textContent = 'Saved'; this.toast(`${room.replace(/_/g, ' ')} whiteboard updated.`, '#2fbf71'); } }, 'Save board');
      const tasks = this.app.runtime.list().slice(0, 8);
      const pin = h('div', { class: 'ideas' }, ...tasks.map(t => h('button', { type: 'button', onclick: () => { const line = `## ${t.title}\n- Owner: ${this.app.office.byId(t.employeeId)?.name || t.employeeId}\n- Status: ${STATUS_LABEL[t.status] || t.status}\n- Progress: ${Math.round((t.progress || 0) * 100)}%`; area.value = [area.value.trim(), line].filter(Boolean).join('\n\n'); } }, `${STATUS_LABEL[t.status] || t.status} · ${t.title}`)));
      const lastMeeting = life.state.meetings[0];
      const lighting = h('div', { class: 'sect' }, h('h3', {}, 'Office lighting'), h('div', { class: 'row' },
        ...['day', 'focus', 'evening'].map(mode => h('button', { class: 'btn' + (life.state.lighting === mode ? ' primary' : ''), type: 'button', onclick: () => life.setLighting(mode) }, mode[0].toUpperCase() + mode.slice(1)))));
      this.open('whiteboard', this.hdr(`${room.replace(/_/g, ' ')} whiteboard`, saved.updatedAt ? `Last updated ${new Date(saved.updatedAt).toLocaleString()}` : 'Shared project notes'),
        h('div', { class: 'body' }, h('div', { class: 'sect' }, h('h3', {}, 'Board'), area, h('div', { class: 'row' }, save,
          h('button', { class: 'btn', type: 'button', disabled: !lastMeeting, onclick: () => { if (lastMeeting) area.value = [area.value.trim(), lastMeeting.summary].filter(Boolean).join('\n\n'); } }, 'Pin latest meeting'))),
          h('div', { class: 'sect' }, h('h3', {}, 'Pin live work'), tasks.length ? pin : h('p', { class: 'note' }, 'No tasks yet.')),
          lighting));
    }
    openPrinter(marker, life) {
      const completed = this.app.runtime.list().filter(t => t.status === 'completed').slice(0, 12);
      const queue = h('div', { class: 'list' });
      const render = () => {
        const rows = life.state.printQueue.length ? life.state.printQueue.map(item => h('button', { class: 'item', type: 'button', onclick: () => { life.collectPrint(item); render(); } },
          h('div', { class: 'meta' }, h('b', {}, item.title), h('small', {}, item.collected ? 'Collected · open again' : 'In printer tray · collect')),
          h('span', { class: 'chip' }, item.collected ? 'Filed' : 'Ready'))) : [h('p', { class: 'note' }, 'The printer tray is empty.')];
        queue.replaceChildren(...rows);
      };
      const jobs = h('div', { class: 'ideas' }, ...completed.map(t => h('button', { type: 'button', onclick: () => { life.queuePrint(t); this.toast(`Printed “${t.title}”.`, '#2fbf71'); render(); } }, `Print · ${t.title}`)));
      this.open('printer', this.hdr('Office printer', marker.room?.replace(/_/g, ' ') || 'Print room'), h('div', { class: 'body' },
        h('div', { class: 'sect' }, h('h3', {}, 'Tray'), queue), h('div', { class: 'sect' }, h('h3', {}, 'Completed reports'), completed.length ? jobs : h('p', { class: 'note' }, 'Completed employee reports will appear here.'))));
      render();
    }
    openPresentationDisplay(marker, life) {
      const employees = this.app.office.employees.filter(e => e.present);
      const recent = this.app.runtime.list().filter(t => t.status === 'completed');
      const now = h('div', { class: 'card' }, h('div', { class: 't' }, 'Office overview'), h('p', { class: 'note' }, `${employees.length} people present · ${this.app.runtime.list().filter(t => DesklyRuntime.ACTIVE.has(t.status)).length} active tasks · ${this.app.runtime.pendingApprovals().length} approvals waiting`));
      const reports = h('div', { class: 'ideas' }, ...recent.slice(0, 10).map(t => h('button', { type: 'button', onclick: () => {
        const e = this.app.office.byId(t.employeeId); now.replaceChildren(h('div', { class: 't' }, t.title), h('p', { class: 'note' }, `${e?.name || t.employeeId} · completed`), h('div', { class: 'md', markdown: String(t.result?.body || 'Result ready.').slice(0, 1200) }));
      } }, `Present · ${t.title}`)));
      this.open('display', this.hdr(`${marker.room?.replace(/_/g, ' ') || 'Office'} display`, 'Presentation and room controls'), h('div', { class: 'body' }, now,
        h('div', { class: 'sect' }, h('h3', {}, 'Present completed work'), recent.length ? reports : h('p', { class: 'note' }, 'Completed work will be available for presentation here.')),
        h('div', { class: 'sect' }, h('h3', {}, 'View'), h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: () => this.app.togglePhotoMode?.() }, 'Toggle photo mode'), ...['day', 'focus', 'evening'].map(mode => h('button', { class: 'btn', type: 'button', onclick: () => life.setLighting(mode) }, mode))))));
    }
    openCeoArchive(marker, life) {
      const board = life.board('CEO_Office');
      const meetings = life.state.meetings.slice(0, 8);
      const reports = this.app.runtime.list().filter(t => t.status === 'completed').slice(0, 10);
      const preview = h('div', { class: 'card' }, h('div', { class: 't' }, 'Select an item'), h('p', { class: 'note' }, 'Your office notes, meeting records, and completed work are kept here.'));
      const show = (title, body) => preview.replaceChildren(h('div', { class: 't' }, title), h('div', { class: 'md', markdown: body }));
      const item = (title, body) => h('button', { class: 'item', type: 'button', onclick: () => show(title, body) }, h('div', { class: 'meta' }, h('b', {}, title)));
      this.open('archive', this.hdr('CEO office archive', 'Your decisions and finished work'), h('div', { class: 'body' },
        preview,
        h('div', { class: 'sect' }, h('h3', {}, 'Office notes'), board.text ? item('CEO whiteboard', board.text) : h('p', { class: 'note' }, 'The CEO whiteboard is empty.'),
          h('button', { class: 'btn', type: 'button', onclick: () => this.openWhiteboard({ room: 'CEO_Office' }, life) }, 'Open whiteboard')),
        h('div', { class: 'sect' }, h('h3', {}, 'Meeting records'), meetings.length ? h('div', { class: 'list' }, ...meetings.map(m => item(`${m.topic} · ${new Date(m.at).toLocaleDateString()}`, m.summary))) : h('p', { class: 'note' }, 'Meeting summaries will appear here.')),
        h('div', { class: 'sect' }, h('h3', {}, 'Completed reports'), reports.length ? h('div', { class: 'list' }, ...reports.map(t => item(t.title, String(t.result?.body || 'Result ready.').slice(0, 6000)))) : h('p', { class: 'note' }, 'Completed employee work will appear here.'))));
    }

    /* ---------------- meetings ---------------- */
    openMeeting(depts, room) {
      const app = this.app, of = app.office;
      if (of.meeting) return this.meetingLive();
      const rooms = [['CEO_Office', 'My office'], ['Boardroom', 'Boardroom · 11 seats'], ['Meeting_1', 'Meeting room 1'], ['Meeting_2', 'Meeting room 2'], ['Meeting_3', 'Meeting room 3']];
      let sel = room || app.player.seat?.room || (app.player.seated ? 'CEO_Office' : 'Boardroom');
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
        this.toast(`${list.length} ${list.length === 1 ? 'person is' : 'people are'} on the way to ${sel === 'CEO_Office' ? 'your office' : sel.replace('_', ' ')}. Press C or M to open your shared discussion.`, '#f2c230');
        this.close();
      } }, 'Call them');
      this.open('meeting', this.hdr('Call people', 'Pick who should come and where. Their tasks keep running while they are with you.'),
        h('div', { class: 'body' }, h('div', { class: 'sect' }, h('h3', {}, 'Where'), roomsEl), h('div', { class: 'sect' }, h('h3', {}, 'Who'), quick, people, h('p', { class: 'note' }, 'Seats fill first; anyone extra stands around the room.')), h('div', { class: 'sect' }, h('h3', {}, 'Topic'), topic), h('div', { class: 'row' }, go)));
    }
    groupConversation(m) {
      const root=h('section',{class:'group-discussion sect'}),status=h('p',{class:'note'},'Loading shared conversation…');
      const history=h('select',{'aria-label':'Saved group conversations',onchange:async()=>{try{const state=await DK.groupGet(history.value);m.groupSessionId=state.id;apply(state);}catch(error){this.toast(DesklyRuntime.errorCopy(error),'#e0504a');}}});
      const transcript=h('div',{class:'group-transcript',role:'log','aria-label':'Shared group conversation','aria-live':'polite'});
      const selected=new Set(m.people.slice(0,3).map(e=>e.id));
      const people=h('div',{class:'group-participants'},...m.people.map(e=>h('label',{class:'group-person'},h('input',{type:'checkbox',checked:selected.has(e.id),onchange:event=>{event.target.checked?selected.add(e.id):selected.delete(e.id);controls();}}),h('span',{},h('b',{},e.name),h('small',{},e.role)))));
      const message=h('textarea',{id:'groupMessage',rows:3,maxlength:5000,placeholder:'Send a message to everyone here, or ask them to discuss an idea…',oninput:()=>controls()});
      const cost=h('p',{class:'note'});
      let state=null,pending=false,refreshing=false,lastRefresh=0,renderKey=null;
      const send=async discuss=>{
        if(!state||pending)return;
        pending=true;controls();const text=message.value.trim();
        try{const result=await DK.groupSend(state.id,text,discuss?[...selected]:[]);if(message.value.trim()===text)message.value='';apply(result);}
        catch(error){this.toast(DesklyRuntime.errorCopy(error),'#e0504a');}
        finally{pending=false;controls();refresh(true);}
      };
      const post=h('button',{class:'btn',type:'button',onclick:()=>send(false)},'Post to everyone');
      const discuss=h('button',{class:'btn primary',type:'button',onclick:()=>send(true)},'Discuss with selected');
      const stop=h('button',{class:'btn danger',type:'button',onclick:async()=>{try{apply(await DK.groupCancel(state.id));status.textContent='Stopping the current reply…';}catch(error){this.toast(error.message,'#e0504a');}}},'Stop discussion');
      const decision=h('input',{type:'text',maxlength:700,placeholder:'A confirmed decision to remember across sessions…'});
      const save=h('button',{class:'btn',type:'button',onclick:async()=>{if(!decision.value.trim()||!state||pending)return;const text=decision.value.trim();pending=true;controls();try{const result=await DK.groupDecision(state.id,text);apply(result);m.actions||=[];m.actions.push(text);if(decision.value.trim()===text)decision.value='';this.toast(result.memoryFailures?.length ? 'Decision saved in the discussion. Some employee memories were not saved; see the discussion for details.' : 'Decision saved to the participants’ project memories.', result.memoryFailures?.length ? '#efad35' : '#2fbf71');}catch(error){this.toast(DesklyRuntime.errorCopy(error),'#e0504a');}finally{pending=false;controls();}}},'Save shared decision');
      const controls=()=>{
        const busy=pending||state?.status==='running',ended=state?.status==='ended';
        post.disabled=!state||busy||ended||!message.value.trim();
        discuss.disabled=!state||busy||ended||!selected.size||(!message.value.trim()&&!state.messages.some(m=>m.kind==='founder'));
        stop.disabled=state?.status!=='running';save.disabled=!state||busy||ended;history.disabled=pending||state?.status==='running';
        people.querySelectorAll('input').forEach(input=>{input.disabled=busy||ended;});
        cost.textContent=`Post: no AI calls. Discuss: one reply per selected employee (${selected.size} calls), in order. Leave the message empty to discuss the latest founder message.`;
      };
      const apply=snapshot=>{
        if(state?.id===snapshot.id&&(Date.parse(snapshot.updatedAt)<Date.parse(state.updatedAt)||(state.status==='ended'&&snapshot.status!=='ended')))return;
        state=snapshot;m.groupSnapshot=snapshot;
        status.textContent=snapshot.status==='ended'?'Saved conversation · read only':snapshot.status==='running'?`${snapshot.participants.find(p=>p.id===snapshot.speakerId)?.name||'Team'} is preparing a reply. You can stop the round.`:'Everyone here shares this conversation. Only selected employees reply.';
        m.groupImported||=new Set();
        for(const line of snapshot.messages){if(m.groupImported.has(line.id))continue;m.groupImported.add(line.id);m.lines.push({e:{id:line.employeeId||'founder',name:line.name},l:line.kind==='error'?'Provider error: '+line.text:line.text});if(line.kind==='employee'&&snapshot.status==='running'&&this.app.office.meeting===m){const e=m.people.find(e=>e.id===line.employeeId);if(e){m.speaking=e;e.say(line.text,4);}}}
        if(m.speaking?.rig.talking<=0&&snapshot.status!=='running')m.speaking=null;
        const key=snapshot.messages.map(line=>line.id).join(',');
        if(key!==renderKey){renderKey=key;const nearBottom=transcript.scrollHeight-transcript.scrollTop-transcript.clientHeight<80;transcript.replaceChildren(...snapshot.messages.map(line=>h('article',{class:'group-message '+line.kind},h('div',{class:'group-message-heading'},h('b',{},line.kind==='decision'?'Confirmed decision · '+line.name:line.name),h('small',{},new Date(line.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))),h('div',{class:'md',markdown:line.kind==='error'?'Provider error: '+line.text:line.text}))));if(!snapshot.messages.length)transcript.append(h('p',{class:'note'},'Start with a message. Everyone can read it; select who should reply.'));if(nearBottom)transcript.scrollTop=transcript.scrollHeight;}
        controls();
      };
      const refresh=async force=>{
        if(!m.groupSessionId||refreshing||(!force&&Date.now()-lastRefresh<1000))return;
        refreshing=true;lastRefresh=Date.now();
        const id=m.groupSessionId;
        try{const snapshot=await DK.groupGet(id);if(m.groupSessionId===id)apply(snapshot);}catch(error){status.textContent=DesklyRuntime.errorCopy(error);}finally{refreshing=false;}
      };
      const remove = h('button', { class: 'btn danger', type: 'button', onclick: async () => { if (!state || state.status === 'running' || pending) return; if (!confirm('Delete this saved discussion?')) return; try { await DK.groupDelete(state.id); m.groupSessionId = null; m.groupPromise = null; this.meetingLive(); } catch (error) { this.toast(error.message, '#e0504a'); } } }, 'Delete saved discussion');
      root.append(h('h3',{},'Shared group conversation'),history,status,people,transcript,message,h('div',{class:'row'},post,discuss,stop),cost,h('div',{class:'group-decision'},decision,save),remove);
      controls();
      (async()=>{
        try{
          if(!m.groupSessionId){m.groupPromise||=DK.groupStart(m.room,m.topic||'Group conversation',m.people.map(e=>e.id));m.groupSessionId=(await m.groupPromise).id;}
          apply(await DK.groupGet(m.groupSessionId));
          const ids=m.people.map(e=>e.id).sort().join('|');
          const sessions=(await DK.groupList()).filter(s=>s.room===m.room&&s.participants.map(p=>p.id).sort().join('|')===ids);
          history.replaceChildren(...sessions.map(s=>h('option',{value:s.id,selected:s.id===m.groupSessionId},`${s.topic} · ${new Date(s.updatedAt).toLocaleString()}${s.status==='ended'?' · saved':''}`)));
        }catch(error){status.textContent=DesklyRuntime.errorCopy(error);m.groupPromise=null;}
      })();
      return{root,refresh,apply,get busy(){return pending||state?.status==='running';}};
    }

    meetingLive() {
      const app = this.app, of = app.office, m = of.meeting;
      m.actions ||= [];
      const group=this.groupConversation(m);
      const status = h('p', { class: 'note' });
      const transcript = h('div', { class: 'chat' });
      const lines = m.lines;
      const addLine = (e, l) => { lines.push({ e, l }); renderT(); };
      const renderT = () => transcript.replaceChildren(...lines.slice(-12).map(x => h('div', { class: 'them' }, h('b', {}, fname(x.e.name) + ': '), x.l)));
      renderT();
      const topic = h('input', { type: 'text', id: 'meetTopic2', value: m.topic || '', placeholder: 'What should the team think about?' });
      let toolsBusy=false;
      const b1 = h('button', { class: 'btn', type: 'button', onclick: async () => { if(group.busy||toolsBusy)return;toolsBusy=true;b1.disabled = b2.disabled = true;try{await of.runStandup(addLine);}finally{toolsBusy=false;b1.disabled=b2.disabled=group.busy;} } }, 'Go around: status updates');
      const b2 = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
        if(group.busy||toolsBusy)return;const tp = topic.value.trim(); if (!tp) { topic.focus(); return; }
        toolsBusy=true;
        b1.disabled = b2.disabled = true;
        try { await of.runBrainstorm(tp, { meeting: (t, p) => DK.meetingIdeas(t, p) }, addLine); } catch (err) { this.toast(DesklyRuntime.errorCopy(err), '#e0504a'); }
        toolsBusy=false;b1.disabled = b2.disabled = group.busy;
      } }, 'Brainstorm this topic');
      let selected = m.people[0] || null;
      const speakerButtons = h('div', { class: 'ideas' });
      const renderSpeakers = () => speakerButtons.replaceChildren(...m.people.map(e => h('button', { type: 'button', style: selected === e ? `border-style:solid;border-color:${e.color};color:#fff` : '', onclick: () => { selected = e; renderSpeakers(); } }, fname(e.name))));
      renderSpeakers();
      const actionInput = h('input', { type: 'text', placeholder: 'Decision or follow-up action…' });
      const actionList = h('div', { class: 'list' });
      const renderActions = () => {
        const rows = m.actions.length ? m.actions.map((x, i) => h('div', { class: 'item' }, h('div', { class: 'meta' }, h('b', {}, x)),
          h('button', { class: 'mini', type: 'button', onclick: () => { m.actions.splice(i, 1); renderActions(); } }, 'Remove'))) : [h('p', { class: 'note' }, 'No decisions captured yet.')];
        actionList.replaceChildren(...rows);
      };
      renderActions();
      const askSpeaker = h('button', { class: 'btn', type: 'button', onclick: () => { if (!selected) return; const line = app.life?.statusLine(selected) || selected.activity; m.speaking = selected; selected.say(line, 6); addLine(selected, line); } }, 'Ask for update');
      const present = h('button', { class: 'btn', type: 'button', onclick: () => { if (!selected) return; app.life?.present(selected, m); renderT(); } }, 'Present latest work');
      const end = h('button', { class: 'btn danger', type: 'button', onclick: async () => {
        end.disabled=true; m.brainstormCancelled = true; await DK.meetingCancel();
        try{if(m.groupPromise&&!m.groupSessionId)m.groupSessionId=(await m.groupPromise).id;if(m.groupSessionId)group.apply(await DK.groupEnd(m.groupSessionId));}
        catch(error){end.disabled=false;this.toast(DesklyRuntime.errorCopy(error),'#e0504a');return;}
        const summary = app.life?.finishMeeting(m); of.endMeeting();
        this.toast(summary ? 'Meeting ended. Notes and action items were pinned to the room whiteboard.' : 'Everyone is heading back to their desks.', '#f2c230'); this.close();
      } }, 'End and save meeting');
      let renderedLines=lines.length,renderedActions=m.actions.length;
      const render = () => { group.refresh();b1.disabled=b2.disabled=toolsBusy||group.busy;if(lines.length!==renderedLines){renderedLines=lines.length;renderT();}if(m.actions.length!==renderedActions){renderedActions=m.actions.length;renderActions();}const a = of.meetingArrived(); status.textContent = `${a} of ${m.people.length} arrived in ${m.room.replace('_', ' ')}. ${a < m.people.length ? 'People are still walking over.' : 'Everyone is here.'}`; };
      this.open('meetingLive', this.hdr(m.room === 'CEO_Office' ? 'In your office' : 'Meeting in progress', m.room === 'CEO_Office' ? `${m.people.length} people called in` : m.room.replace('_', ' ')), h('div', { class: 'body' }, status,
        group.root,h('details',{class:'meeting-tools'},h('summary',{},'Status updates & quick brainstorm'),h('div', { class: 'sect' }, h('h3', {}, 'Run the meeting'), h('div', { class: 'row' }, b1), topic, h('div', { class: 'row' }, b2, h('button', { class: 'btn danger', type: 'button', onclick: () => { m.brainstormCancelled = true; DK.meetingCancel().catch(error => this.toast(error.message)); } }, 'Stop brainstorm')))),
        h('div', { class: 'sect' }, h('h3', {}, 'Choose a speaker'), speakerButtons, h('div', { class: 'row' }, askSpeaker, present)),
        h('div', { class: 'sect' }, h('h3', {}, 'Decisions and actions'), actionInput, h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onclick: () => { const value = actionInput.value.trim(); if (!value) return; m.actions.push(value); actionInput.value = ''; renderActions(); } }, 'Add action item')), actionList),
        h('div', { class: 'sect' }, h('h3', {}, 'Transcript'), transcript), h('div', { class: 'row' }, end)), render);
      render();
    }
  }
  UI.md = md;
  window.DesklyUI = UI;
})();
