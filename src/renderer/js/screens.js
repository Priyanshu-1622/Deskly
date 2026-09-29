/* Deskly screens: start menu, first-run setup, settings (team editor with live
   character preview and per-employee AI keys), pause menu and your laptop. */
(function () {
  const $ = s => document.querySelector(s);
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false && c !== '') el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  };
  const P = () => window.DesklyPresets;
  const clone = o => JSON.parse(JSON.stringify(o));
  const initials = n => String(n || '?').replace(/^Dr\.\s*/, '').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const field = (label, input, hint) => h('label', { class: 'field' }, h('span', {}, label), input, hint ? h('small', {}, hint) : null);
  const mark = (extra = '') => h('img', { class: `deskly-mark ${extra}`.trim(), src: 'assets/deskly-icon.png', alt: '' });

  const DEFAULT_SETTINGS = { sensitivity: 1, invertY: false, fov: 70, quality: 'high', nameTags: true };

  class Screens {
    constructor(app) {
      this.app = app;
      this.info = null; this.cfg = null; this.keys = {};
    }
    async load() {
      this.info = await DK.appInfo();
      const r = await DK.configGet();
      this.cfg = r.config; this.keys = r.keys || {};
      return this.cfg;
    }
    providers() { return this.info?.providers || {}; }
    settings() { return { ...DEFAULT_SETTINGS, ...(this.cfg?.settings || {}) }; }
    show(id) {
      for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
      document.body.dataset.screen = id || 'game';
    }
    toast(t, c) { this.app.ui ? this.app.ui.toast(t, c) : this.flash(t); }
    flash(t) { const el = h('div', { class: 'flash' }, t); document.body.append(el); setTimeout(() => el.remove(), 3500); }

    /* =============================== START =============================== */
    start() {
      const cfg = this.cfg, s = $('#screen-start');
      const team = cfg?.employees?.length || 0;
      const withAI = (cfg?.employees || []).filter(e => e.provider && e.provider !== 'demo').length;
      const menu = h('nav', { class: 'menu' },
        cfg ? h('button', { class: 'mbtn primary', type: 'button', id: 'mEnter', onclick: () => this.app.enterOffice() }, h('b', {}, this.app.playing || this.app.office ? 'Back to the office' : 'Enter the office'), h('small', {}, `${cfg.company} · ${team} people`)) :
          h('button', { class: 'mbtn primary', type: 'button', id: 'mSetup', onclick: () => this.setup() }, h('b', {}, 'Set up your office'), h('small', {}, 'Name your company, pick a project folder, hire your team')),
        cfg ? h('button', { class: 'mbtn', type: 'button', onclick: () => this.openSettings('team') }, h('b', {}, 'Team & AI keys'), h('small', {}, `${withAI} of ${team} connected to an AI provider`)) : null,
        cfg ? h('button', { class: 'mbtn', type: 'button', onclick: () => this.openSettings('general') }, h('b', {}, 'Settings'), h('small', {}, 'Project folder, controls, display, data')) : null,
        cfg ? h('button', { class: 'mbtn', type: 'button', onclick: () => DK.workspaceOpen().catch(e => this.flash(e.message)) }, h('b', {}, 'Open project folder'), h('small', {}, cfg.workspace || 'Not set')) : null,
        h('button', { class: 'mbtn ghost', type: 'button', onclick: () => DK.appQuit() }, h('b', {}, 'Quit')));
      s.replaceChildren(
        h('div', { class: 'start-left' },
          h('div', { class: 'brand' }, mark(), h('div', {}, h('h1', {}, 'Deskly'), h('p', {}, 'Your AI company, in a real office.'))),
          menu,
          h('footer', {}, h('span', {}, this.info.version === 'web' ? 'Browser preview' : `v${this.info.version}`), h('span', {}, this.info.encryption ? 'API keys encrypted with your OS keychain' : (DK.native ? 'Secure key storage unavailable — API keys cannot be saved' : 'Keys and real work need the desktop app')),
            h('a', { href: '#', onclick: e => { e.preventDefault(); DK.shellExternal('https://github.com/Priyanshu-1622/Deskly'); } }, 'Open source on GitHub'))),
        h('div', { class: 'start-right' }, cfg ? h('div', { class: 'glance' },
          h('h3', {}, 'Today at ' + cfg.company),
          h('div', { class: 'faces' }, ...(cfg.employees || []).slice(0, 12).map(e => h('span', { class: 'face', title: `${e.name} · ${e.role}`, style: `background:${P().DEPARTMENTS[e.dept]?.color || '#555'}` }, initials(e.name)))),
          h('p', {}, `${team} people across ${new Set((cfg.employees || []).map(e => e.dept)).size} departments. Walk in, talk to anyone, hand them real work on your project.`)) :
          h('div', { class: 'glance' }, h('h3', {}, 'How it works'), h('ol', {}, h('li', {}, 'Hire AI employees and give each one a provider and API key.'), h('li', {}, 'Walk your office in first person and hand people real work.'), h('li', {}, 'They work in your project folder, stop for your approval on anything risky, and bring you the result.'), h('li', {}, 'Sit at your own laptop to code and chat with your assistant.'))))
      );
      this.show('screen-start');
      setTimeout(() => s.querySelector('.mbtn.primary')?.focus(), 50);
    }

    /* =============================== SETUP =============================== */
    setup() {
      const draft = this.cfg ? clone(this.cfg) : { founder: '', company: '', workspace: '', employees: P().defaultTeam(), assistant: { provider: 'demo', model: '' }, settings: { ...DEFAULT_SETTINGS }, security: { approveWrites: false } };
      this.pendingKeys = {};
      let step = 0;
      const s = $('#screen-setup');
      const steps = ['You', 'Project', 'Team', 'Assistant', 'Ready'];
      const render = () => {
        const bar = h('ol', { class: 'wsteps' }, ...steps.map((n, i) => h('li', { class: i === step ? 'now' : i < step ? 'done' : '' }, h('span', {}, i < step ? '✓' : i + 1), n)));
        let body, canNext = true;
        if (step === 0) {
          const a = h('input', { type: 'text', id: 'suFounder', value: draft.founder, placeholder: 'e.g. Priyanshu', oninput: e => { draft.founder = e.target.value; } });
          const b = h('input', { type: 'text', id: 'suCompany', value: draft.company, placeholder: 'e.g. Nimbus Labs', oninput: e => { draft.company = e.target.value; } });
          body = h('div', { class: 'wbody narrow' }, h('h2', {}, 'Welcome to Deskly'), h('p', { class: 'lead' }, 'You run the company. Your team is made of AI employees who do real work on your projects while you walk the office.'),
            field('Your name', a, 'Your team will call you this.'), field('Company name', b));
          setTimeout(() => a.focus(), 30);
        } else if (step === 1) {
          const path = h('code', { class: 'path' }, draft.workspace || 'No folder chosen yet');
          body = h('div', { class: 'wbody narrow' }, h('h2', {}, 'Pick a project folder'), h('p', { class: 'lead' }, 'Your team reads and writes files in this folder. Shell commands need your approval, but they can access other locations on your computer.'),
            h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onclick: async () => { const p = await DK.workspaceChoose(); if (p) { draft.workspace = p; render(); } } }, draft.workspace ? 'Change folder' : 'Choose folder…')), path,
            h('p', { class: 'note' }, 'Tip: start with a fresh folder or a Git repository so every change is easy to review.'));
        } else if (step === 2) {
          body = h('div', { class: 'wbody' }, h('div', { class: 'whead' }, h('h2', {}, 'Hire your team'),
            h('div', { class: 'row' },
              h('button', { class: 'btn', type: 'button', onclick: () => { draft.employees = P().defaultTeam(); render(); } }, 'Full team (15)'),
              h('button', { class: 'btn', type: 'button', onclick: () => { draft.employees = P().defaultTeam().filter(e => ['Developer', 'Product Designer', 'Research Lead', 'Office Manager'].includes(e.role)); render(); } }, 'Small team (4)'))),
            this.teamEditor(draft));
        } else if (step === 3) {
          body = h('div', { class: 'wbody narrow' }, h('h2', {}, 'Your own assistant'), h('p', { class: 'lead' }, 'You have a laptop on your desk. Your assistant helps you code, write and think there. It can use a different provider or key from your team.'),
            this.aiFields(draft.assistant, 'assistant', draft));
        } else {
          const withAI = draft.employees.filter(e => e.provider && e.provider !== 'demo').length;
          body = h('div', { class: 'wbody narrow' }, h('h2', {}, `${draft.company || 'Your office'} is ready`),
            h('ul', { class: 'summary' }, h('li', {}, h('b', {}, draft.employees.length), ' employees'), h('li', {}, h('b', {}, withAI), ' connected to an AI provider', withAI < draft.employees.length ? h('small', {}, ' — the rest run in demo mode until you add a key') : ''),
              h('li', {}, 'Project folder: ', h('code', {}, draft.workspace || 'not set'))),
            h('p', { class: 'note' }, 'You can change everything later in Settings. ' + (this.info.encryption ? 'Keys are encrypted with your OS keychain.' : 'Secure key storage is unavailable; API keys cannot be saved.')));
        }
        if (step === 0) canNext = draft.founder.trim() && draft.company.trim();
        if (step === 1) canNext = !!draft.workspace;
        if (step === 2) canNext = draft.employees.length > 0;
        const nav = h('div', { class: 'wnav' },
          h('button', { class: 'btn ghost', type: 'button', onclick: () => { if (step === 0) this.start(); else { step--; render(); } } }, step === 0 ? 'Cancel' : 'Back'),
          h('button', { class: 'btn primary', type: 'button', id: 'suNext', disabled: !canNext, onclick: async () => {
            if (step < steps.length - 1) { step++; render(); return; }
            try { await this.persist(draft); this.app.enterOffice(true); }
            catch (e) { this.flash(e.message || 'Could not save setup.'); }
          } }, step === steps.length - 1 ? 'Enter the office' : 'Continue'));
        s.replaceChildren(h('div', { class: 'wizard' }, h('div', { class: 'app-heading' }, mark(), h('span', {}, 'Deskly'), h('small', {}, 'Office setup')), bar, body, nav));
        s.querySelectorAll('input[type=text]').forEach(i => i.addEventListener('input', () => { if (step === 0) nav.lastChild.disabled = !(draft.founder.trim() && draft.company.trim()); }));
      };
      this.show('screen-setup'); render();
    }
    async persist(draft) {
      for (const [id, key] of Object.entries(this.pendingKeys || {})) this.keys = await DK.secretSet(id, key);
      this.pendingKeys = {};
      this.cfg = await DK.configSave(draft);
      return this.cfg;
    }

    /* =============================== AI FIELDS =============================== */
    aiFields(o, id, draft) {
      const provs = this.providers();
      const wrap = h('div', { class: 'ai' });
      const render = () => {
        const p = provs[o.provider] || provs.demo || {};
        const hasKey = this.keys[id] && this.pendingKeys[id] !== '';
        const keyInput = h('input', { type: 'password', id: 'key_' + id, autocomplete: 'off', placeholder: hasKey ? '•••••••• saved — type to replace' : (p.needsKey ? 'Paste API key' : 'Optional for this provider'), value: this.pendingKeys[id] || '', oninput: e => { this.pendingKeys[id] = e.target.value.trim(); } });
        const others = [['', 'Its own key'], ['assistant', 'Same key as my assistant'], ...(draft.employees || []).filter(e => e.id !== id).map(e => [e.id, `Same key as ${e.name}`])];
        const status = h('span', { class: 'test' });
        wrap.replaceChildren(...[
          h('div', { class: 'grid2' },
            field('Provider', h('select', { onchange: e => { o.provider = e.target.value; o.model = ''; render(); } }, ...Object.entries(provs).map(([k, v]) => h('option', { value: k, selected: k === (o.provider || 'demo') }, v.label)))),
            field('Model', h('input', { type: 'text', value: o.model || '', placeholder: p.defaultModel || 'model name', oninput: e => { o.model = e.target.value.trim(); } }), o.provider === 'gemini' ? 'Recommended for new free-tier projects: gemini-3.5-flash-lite. Clear this field to use the default.' : null)),
          o.provider && o.provider !== 'demo' ? field('Lightweight model (optional)', h('input', { type: 'text', value: o.lightweightModel || '', placeholder: 'Same provider, smaller model', oninput: e => { o.lightweightModel = e.target.value.trim(); } }), 'Used for plans, short conversations and meeting ideas. The main model handles task execution; failures fall back to it.') : null,
          ['custom', 'ollama'].includes(o.provider) ? field('Base URL', h('input', { type: 'text', value: o.baseUrl || '', placeholder: p.baseUrl || 'https://your-endpoint/v1', oninput: e => { o.baseUrl = e.target.value.trim(); } })) : null,
          o.provider && o.provider !== 'demo' ? h('div', { class: 'grid2' },
            field('API key', keyInput, hasKey ? 'A key is saved. Leave empty to keep it.' : 'Save key & test stores it securely, including when the model test fails.'),
            id !== 'assistant' ? field('Or reuse a key', h('select', { onchange: e => { o.keyFrom = e.target.value || undefined; } }, ...others.map(([v, l]) => h('option', { value: v, selected: (o.keyFrom || '') === v }, l)))) : h('span')) : h('p', { class: 'note' }, 'Demo mode simulates the whole flow without calling any AI.'),
          h('div', { class: 'row' },
            o.provider && o.provider !== 'demo' ? h('button', { class: 'btn', type: 'button', onclick: async () => {
              status.textContent = 'Testing…'; status.className = 'test';
              let saved = false;
              try {
                if (this.pendingKeys[id]) {
                  this.keys = await DK.secretSet(id, this.pendingKeys[id]);
                  delete this.pendingKeys[id];
                  keyInput.value = '';
                  keyInput.placeholder = '•••••••• saved — type to replace';
                  saved = true;
                }
                const r = await DK.providerTest({ ...o, apiKey: '' }, id);
                status.textContent = `${saved ? 'Key saved · ' : ''}Connected · ${r.ms} ms`;
                status.className = 'test ok';
              } catch (e) {
                status.textContent = `${saved ? 'Key saved securely · ' : ''}${e.message}`;
                status.className = 'test bad';
              }
            } }, 'Save key & test connection') : null,
            hasKey ? h('button', { class: 'btn ghost', type: 'button', onclick: async () => {
              try { this.keys = await DK.secretSet(id, ''); delete this.pendingKeys[id]; render(); }
              catch (e) { status.textContent = e.message; status.className = 'test bad'; }
            } }, 'Delete saved key') : null,
            status)].filter(Boolean));
      };
      render();
      return wrap;
    }

    /* =============================== TEAM EDITOR =============================== */
    teamEditor(draft) {
      let sel = draft.employees[0]?.id;
      const root = h('div', { class: 'team' });
      const list = h('div', { class: 'tlist' });
      const edit = h('div', { class: 'tedit' });
      const preview = this.preview();
      const D = P().DEPARTMENTS, R = P().ROLES, L = P().LOOKS;
      const renderList = () => {
        const addSel = h('select', { id: 'addRole' }, ...Object.keys(R).map(r => h('option', { value: r }, r)));
        list.replaceChildren(
          ...draft.employees.map(e => h('button', { type: 'button', class: 'tmember' + (e.id === sel ? ' on' : ''), onclick: () => { sel = e.id; renderList(); renderEdit(); } },
            h('span', { class: 'face', style: `background:${D[e.dept]?.color || '#555'}` }, initials(e.name)),
            h('span', { class: 'meta' }, h('b', {}, e.name), h('small', {}, `${e.role} · ${e.provider && e.provider !== 'demo' ? e.provider : 'demo'}`)),
            h('i', { class: 'dot', title: e.provider && e.provider !== 'demo' ? 'AI connected' : 'Demo mode', style: `background:${e.provider && e.provider !== 'demo' && (this.keys[e.id] || this.pendingKeys[e.id] || e.keyFrom || !(this.providers()[e.provider] || {}).needsKey) ? '#2fbf71' : '#f0a020'}` }))),
          h('div', { class: 'tadd' }, addSel, h('button', { class: 'btn primary', type: 'button', onclick: () => {
            const e = P().makeEmployee(addSel.value, { name: 'New ' + addSel.value.toLowerCase() });
            const cap = D[e.dept]?.seats || 10; if (draft.employees.filter(x => x.dept === e.dept).length >= cap) e.dept = 'Engineering';
            draft.employees.push(e); sel = e.id; renderList(); renderEdit();
          } }, 'Hire')));
      };
      const renderEdit = () => {
        const e = draft.employees.find(x => x.id === sel);
        if (!e) { edit.replaceChildren(h('p', { class: 'note' }, 'Hire someone to get started.')); return; }
        const L2 = e.look = e.look || {};
        const upd = () => { preview.set(e.look); renderList(); };
        const swatches = (key, arr) => h('div', { class: 'sw' }, ...arr.map(c => h('button', { type: 'button', title: c, class: L2[key] === c ? 'on' : '', style: `background:${c}`, onclick: ev => { L2[key] = c; ev.target.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === ev.target)); upd(); } })));
        const toggle = (key, label, val) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!L2[key], onchange: ev => { L2[key] = ev.target.checked ? val : undefined; upd(); } }), label);
        edit.replaceChildren(
          h('div', { class: 'tcols' },
            h('div', { class: 'tform' },
              h('h3', {}, 'Profile'),
              h('div', { class: 'grid2' },
                field('Name', h('input', { type: 'text', value: e.name, oninput: ev => { e.name = ev.target.value; renderList(); } })),
                field('Role', h('select', { onchange: ev => { const r = R[ev.target.value]; Object.assign(e, { role: r.role, dept: r.dept, scope: r.scope, persona: r.persona, resume: DesklyResumes.forRole(r.role), instructions: r.instructions, tasks: r.tasks.slice() }); renderList(); renderEdit(); } }, ...Object.keys(R).map(r => h('option', { value: r, selected: r === e.role }, r))))),
              h('div', { class: 'grid2' },
                field('Department (desk area)', h('select', { onchange: ev => { e.dept = ev.target.value; renderList(); } }, ...Object.keys(D).map(d => h('option', { value: d, selected: d === e.dept }, d)))),
                field('Job title', h('input', { type: 'text', value: e.role, oninput: ev => { e.role = ev.target.value; renderList(); } }))),
              field('What they do', h('input', { type: 'text', value: e.scope || '', oninput: ev => { e.scope = ev.target.value; } })),
              field('Personality', h('textarea', { rows: 2, oninput: ev => { e.persona = ev.target.value; } }, e.persona || '')),
              h('h3', {}, 'Résumé · skills and knowledge'),
              ...['skills', 'knowledge', 'tools'].map(key => field({ skills: 'Skills', knowledge: 'Domain knowledge', tools: 'Tools and methods' }[key],
                h('textarea', { rows: 2, oninput: ev => { e.resume = e.resume || DesklyResumes.forRole(e.role); e.resume[key] = DesklyResumes.clean(ev.target.value); } }, DesklyResumes.forEmployee(e)[key].join(', ')),
                'Separate items with commas or new lines. This résumé is shown in the office and guides the AI.')),
              field('Work instructions', h('textarea', { rows: 8, oninput: ev => { e.instructions = ev.target.value; } }, e.instructions || DesklyRolePrompts.forRole(e.role)), 'Editable playbook used for tasks, conversations and meetings.'),
              h('button', { class: 'btn ghost', type: 'button', onclick: () => { e.instructions = DesklyRolePrompts.forRole(e.role); renderEdit(); } }, 'Restore role playbook'),
              h('h3', {}, 'AI brain'), this.aiFields(e, e.id, draft),
              h('div', { class: 'row' },
                h('button', { class: 'btn ghost', type: 'button', onclick: () => {
                  draft.employees.forEach(o => { if (o !== e) { o.provider = e.provider; o.model = e.model; o.baseUrl = e.baseUrl; o.keyFrom = e.id; } });
                  this.flash(`Everyone now uses ${e.name.split(' ')[0]}'s provider and key.`); renderList();
                } }, 'Use this AI setup for the whole team'),
                h('button', { class: 'btn danger', type: 'button', onclick: () => { draft.employees = draft.employees.filter(x => x !== e); sel = draft.employees[0]?.id; renderList(); renderEdit(); } }, 'Remove from team'))),
            h('div', { class: 'tlook' },
              preview.el,
              h('div', { class: 'grid2' },
                field('Body', h('select', { onchange: ev => { L2.body = ev.target.value; upd(); } }, h('option', { value: 'masculine', selected: L2.body !== 'feminine' }, 'Broad'), h('option', { value: 'feminine', selected: L2.body === 'feminine' }, 'Narrow'))),
                field('Height', h('input', { type: 'range', min: 1.5, max: 1.95, step: 0.01, value: L2.height || 1.72, oninput: ev => { L2.height = +ev.target.value; upd(); } }))),
              field('Skin', swatches('skin', L.skins)),
              field('Hair', h('select', { onchange: ev => { L2.hairStyle = ev.target.value; upd(); } }, ...L.hairStyles.map(x => h('option', { value: x, selected: x === L2.hairStyle }, x)))),
              field('Hair colour', swatches('hair', L.hairColors)),
              field('Top', swatches('shirt', L.outfits)),
              field('Trousers', swatches('pants', L.pants)),
              h('div', { class: 'checks' }, toggle('glasses', 'Glasses', '#1a1a1a'), toggle('beard', 'Beard', true), toggle('headset', 'Headset', true), toggle('jacket', 'Blazer', '#2e3440'), toggle('shortSleeves', 'Short sleeves', true)))));
        preview.set(e.look);
      };
      renderList(); renderEdit();
      root.append(list, edit);
      return root;
    }

    preview() {
      if (this._pv) return this._pv;
      const T = THREE;
      const canvas = h('canvas', { width: 320, height: 380, class: 'pvc' });
      const r = new T.WebGLRenderer({ canvas, antialias: true, alpha: true }); r.outputEncoding = T.sRGBEncoding; r.setPixelRatio(Math.min(2, devicePixelRatio));
      const sc = new T.Scene(); sc.add(new T.HemisphereLight(0xffffff, 0x665f58, 1.0)); const d = new T.DirectionalLight(0xffffff, 0.8); d.position.set(1.5, 3, 4); sc.add(d);
      const cam = new T.PerspectiveCamera(26, 320 / 380, 0.1, 20); cam.position.set(0, 1.15, 4.4); cam.lookAt(0, 0.95, 0);
      const floor = new T.Mesh(new T.CircleGeometry(0.6, 32), new T.MeshBasicMaterial({ color: 0x2a3338 })); floor.rotation.x = -Math.PI / 2; sc.add(floor);
      let rig = null, t = 0, alive = true;
      const set = look => {
        if (rig) { sc.remove(rig.root); rig.root.traverse(o => o.geometry?.dispose?.()); }
        rig = Human.build(P().lookToRig(look || {})); rig.setMode('stand'); sc.add(rig.root);
      };
      const loop = () => {
        if (!alive) return;
        if (canvas.isConnected && rig) { t += 1 / 60; rig.root.rotation.y = Math.sin(t * 0.5) * 0.7; rig.update(1 / 60, rig.root.rotation.y); r.render(sc, cam); }
        requestAnimationFrame(loop);
      };
      loop();
      this._pv = { el: h('div', { class: 'pv' }, canvas), set };
      return this._pv;
    }

    /* =============================== SETTINGS =============================== */
    openSettings(tab = 'general') {
      const draft = clone(this.cfg); this.pendingKeys = {};
      draft.settings = { ...DEFAULT_SETTINGS, ...(draft.settings || {}) }; draft.security = draft.security || { approveWrites: false };
      const s = $('#screen-settings');
      const tabs = { general: 'General', team: 'Team & AI keys', memory: 'Memory & usage', assistant: 'Your assistant', controls: 'Controls & display', data: 'Privacy & data' };
      let cur = tab;
      const render = () => {
        let body;
        const st = draft.settings;
        if (cur === 'general') body = h('div', { class: 'sbody narrow' },
          field('Your name', h('input', { type: 'text', value: draft.founder, oninput: e => { draft.founder = e.target.value; } })),
          field('Company name', h('input', { type: 'text', value: draft.company, oninput: e => { draft.company = e.target.value; } })),
          field('Project folder', h('div', { class: 'row' }, h('code', { class: 'path' }, draft.workspace || 'Not set'), h('button', { class: 'btn', type: 'button', onclick: async () => { const p = await DK.workspaceChoose(); if (p) { draft.workspace = p; render(); } } }, 'Change…')), 'Your team can only read and write inside this folder.'));
        else if (cur === 'team') body = h('div', { class: 'sbody' }, this.teamEditor(draft));
        else if (cur === 'memory') body = this.memoryPanel(draft);
        else if (cur === 'assistant') body = h('div', { class: 'sbody narrow' }, h('p', { class: 'lead' }, 'The assistant on your laptop. It sees the file you have open when you ask about it.'), this.aiFields(draft.assistant = draft.assistant || { provider: 'demo' }, 'assistant', draft));
        else if (cur === 'controls') body = h('div', { class: 'sbody narrow' },
          field(`Mouse sensitivity · ${st.sensitivity.toFixed(2)}×`, h('input', { type: 'range', min: 0.3, max: 2.5, step: 0.05, value: st.sensitivity, oninput: e => { st.sensitivity = +e.target.value; e.target.parentNode.firstChild.textContent = `Mouse sensitivity · ${st.sensitivity.toFixed(2)}×`; } })),
          h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: st.invertY, onchange: e => { st.invertY = e.target.checked; } }), 'Invert vertical look'),
          field(`Field of view · ${st.fov}°`, h('input', { type: 'range', min: 55, max: 100, step: 1, value: st.fov, oninput: e => { st.fov = +e.target.value; e.target.parentNode.firstChild.textContent = `Field of view · ${st.fov}°`; } })),
          field('Graphics quality', h('select', { onchange: e => { st.quality = e.target.value; } }, ...[['high', 'High (sharp, needs a decent GPU)'], ['balanced', 'Balanced'], ['low', 'Low (laptops, integrated graphics)']].map(([v, l]) => h('option', { value: v, selected: v === st.quality }, l)))),
          h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: st.nameTags, onchange: e => { st.nameTags = e.target.checked; } }), 'Show name tags and speech bubbles'),
          h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: () => DK.appFullscreen() }, 'Toggle full screen (F11)')),
          h('table', { class: 'keys' }, ...[['W A S D', 'Walk (or stand up)'], ['Shift', 'Hurry'], ['Mouse', 'Look'], ['E', 'Talk / use / sit'], ['Tab', 'Operations board'], ['C', 'Call people'], ['L', 'Open your laptop'], ['Esc', 'Close panel / pause']].map(([k, v]) => h('tr', {}, h('td', {}, h('kbd', {}, k)), h('td', {}, v)))));
        else body = h('div', { class: 'sbody narrow' },
          h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: draft.security.approveWrites, onchange: e => { draft.security.approveWrites = e.target.checked; } }), 'Ask me before an employee writes any file'),
          field('Monthly AI token ceiling', h('input', { type: 'number', min: 0, step: 10000, value: draft.security.monthlyTokenLimit || 0, oninput: e => { draft.security.monthlyTokenLimit = Math.max(0, Number(e.target.value) || 0); } }), '0 means no ceiling. Once reported usage reaches this number, new AI calls stop. A call already in progress can take the total over the ceiling.'),
          h('p', { class: 'note' }, 'Commands and anything leaving the company (email, publishing, deploys, payments) always need your approval, whatever this is set to.'),
          h('div', { class: 'row' },
            h('button', { class: 'btn', type: 'button', onclick: async () => { const p = await DK.auditExport(); if (p) this.flash('Audit log saved to ' + p); } }, 'Export audit log'),
            h('button', { class: 'btn', type: 'button', onclick: async () => { await DK.tasksClear(); this.flash('Finished tasks cleared.'); } }, 'Clear finished tasks')),
          h('h3', {}, 'Danger zone'),
          h('button', { class: 'btn danger', type: 'button', onclick: ev => {
            if (ev.target.dataset.sure) { DK.configReset().then(() => location.reload()); return; }
            ev.target.dataset.sure = 1; ev.target.textContent = 'Click again to erase settings and keys';
          } }, 'Reset Deskly'));
        s.replaceChildren(h('div', { class: 'settings' },
          h('aside', {}, h('div', { class: 'app-heading' }, mark(), h('span', {}, 'Deskly')), h('h2', {}, 'Settings'), ...Object.entries(tabs).map(([k, l]) => h('button', { type: 'button', class: k === cur ? 'on' : '', onclick: () => { cur = k; render(); } }, l))),
          h('section', {}, h('div', { class: 'shead' }, h('h2', {}, tabs[cur]),
            h('div', { class: 'row' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => this.closeSettings(false) }, 'Cancel'),
              h('button', { class: 'btn primary', type: 'button', id: 'saveSettings', onclick: async () => { try { await this.persist(draft); this.closeSettings(true); } catch (e) { this.flash(e.message || 'Could not save settings.'); } } }, 'Save'))), body)));
      };
      this.settingsFrom = document.body.dataset.screen;
      this.show('screen-settings'); render();
    }
    closeSettings(saved) {
      if (saved) { this.app.applySettings(); this.flash('Settings saved.'); }
      if (this.app.playing || this.settingsFrom === 'screen-pause') this.pause(); else this.start();
    }

    memoryPanel(draft) {
      const people = [{ id: 'assistant', name: 'Your assistant' }, ...(draft.employees || [])];
      let selected = people[0]?.id;
      const notes = h('div', { class: 'memory-list' });
      const updates = h('div', { class: 'memory-list' });
      const usage = h('div', { class: 'memory-list' });
      const noteInput = h('textarea', { rows: 3, placeholder: 'A stable preference, decision, or useful project fact' });
      const scopeInput = h('select', {}, h('option', { value: 'project' }, 'This project only'), h('option', { value: 'global' }, 'Across projects'));
      const refresh = async () => {
        try {
          const [saved, recent, rows] = await Promise.all([selected ? DK.memoryList(selected) : [], DK.teamUpdates(), DK.usageGet()]);
          notes.replaceChildren(...(saved.length ? saved.slice().reverse().map(m => h('div', { class: 'memory-row' },
            h('span', {}, h('b', {}, m.scope === 'global' ? 'Across projects' : 'This project'), ' · ', m.text),
            h('button', { class: 'btn ghost', type: 'button', onclick: async () => { await DK.memoryDelete(m.id); refresh(); } }, 'Remove'))) : [h('p', { class: 'note' }, 'No saved notes yet.') ]));
          updates.replaceChildren(...(recent.length ? recent.slice().reverse().slice(0, 12).map(u => h('p', {}, h('b', {}, people.find(e => e.id === u.from)?.name || u.from), ' → ', u.to === 'all' ? 'team' : (people.find(e => e.id === u.to)?.name || u.to), ': ', u.text,
            u.files?.length ? h('small', {}, ' Files: ' + u.files.join(', ')) : null,
            u.contract ? h('small', {}, ' Interface: ' + u.contract) : null,
            u.needs ? h('small', {}, ' Needs: ' + u.needs) : null)) : [h('p', { class: 'note' }, 'No project handoffs yet.') ]));
          const totals = rows.reduce((sum, r) => ({ calls: sum.calls + r.calls, input: sum.input + r.input, output: sum.output + r.output, cached: sum.cached + r.cached }), { calls: 0, input: 0, output: 0, cached: 0 });
          usage.replaceChildren(h('p', {}, `${totals.calls} AI calls · ${totals.input.toLocaleString()} input tokens · ${totals.output.toLocaleString()} output tokens · ${totals.cached.toLocaleString()} cached input tokens`),
            h('p', { class: 'note' }, 'Provider prices vary. This meter records reported tokens so costs can be measured; demo mode makes no paid calls.'));
        } catch (e) { this.flash(e.message || 'Could not load memory and usage.'); }
      };
      const panel = h('div', { class: 'sbody narrow' },
        h('p', { class: 'lead' }, 'Each employee keeps local project notes and approved cross-project notes. Teammate updates appear when the recipient is working; idle characters use no AI.'),
        field('Employee', h('select', { onchange: e => { selected = e.target.value; refresh(); } }, ...people.map(e => h('option', { value: e.id }, e.name)))),
        h('h3', {}, 'Saved notes'), notes,
        field('Add a note', noteInput),
        h('div', { class: 'row' }, scopeInput, h('button', { class: 'btn primary', type: 'button', onclick: async () => {
          if (!selected || !noteInput.value.trim()) return;
          try { await DK.memoryAdd(selected, scopeInput.value, noteInput.value.trim()); noteInput.value = ''; refresh(); }
          catch (e) { this.flash(e.message || 'Could not save memory.'); }
        } }, 'Save note')),
        h('h3', {}, 'Project handoffs'), updates,
        h('h3', {}, 'This month’s AI usage'), usage);
      refresh();
      return panel;
    }

    /* =============================== PAUSE =============================== */
    pause() {
      const s = $('#screen-pause');
      s.replaceChildren(h('div', { class: 'pausebox' }, h('div', { class: 'app-heading' }, mark(), h('span', {}, 'Deskly')), h('h2', {}, 'Paused'), h('p', {}, `${this.cfg.company} · ${new Date(this.app.clock).toTimeString().slice(0, 5)}`),
        h('button', { class: 'mbtn primary', type: 'button', onclick: () => this.app.resume() }, h('b', {}, 'Resume')),
        h('button', { class: 'mbtn', type: 'button', onclick: () => this.app.openLaptop() }, h('b', {}, 'Open your laptop')),
        h('button', { class: 'mbtn', type: 'button', onclick: () => { this.app.resume(); setTimeout(() => this.app.ui.openMeeting(), 60); } }, h('b', {}, 'Call people')),
        h('button', { class: 'mbtn', type: 'button', onclick: () => this.openSettings('team') }, h('b', {}, 'Team & AI keys')),
        h('button', { class: 'mbtn', type: 'button', onclick: () => this.openSettings('controls') }, h('b', {}, 'Settings')),
        h('button', { class: 'mbtn ghost', type: 'button', onclick: () => { this.app.playing = false; this.start(); } }, h('b', {}, 'Main menu'))));
      this.show('screen-pause');
      setTimeout(() => s.querySelector('.mbtn')?.focus(), 30);
    }

    /* =============================== LAPTOP =============================== */
    laptop(openPath) {
      const app = this.app, s = $('#screen-laptop');
      const L = this.lap || (this.lap = { file: null, text: '', dirty: false, chat: [], term: [] });
      const tree = h('div', { class: 'ftree' });
      const ed = h('textarea', { class: 'editor', id: 'editor', spellcheck: 'false', placeholder: 'Open a file from the left, or start typing and save as a new file.' });
      const tabName = h('span', { class: 'fname' });
      const chatLog = h('div', { class: 'achat' });
      const ask = h('textarea', { id: 'askInput', rows: 3, placeholder: 'Ask your assistant… (it can see the open file)' });
      const termOut = h('pre', { class: 'termout' });
      const termIn = h('input', { type: 'text', id: 'termIn', placeholder: 'Run a command in your project folder, e.g. npm test', spellcheck: 'false' });
      const empSel = h('select', { id: 'delegateTo' }, ...app.office.employees.map(e => h('option', { value: e.id }, `${e.name} · ${e.role}`)));
      const delegate = h('input', { type: 'text', id: 'delegateText', placeholder: 'Instruction for the employee…' });
      const setTab = () => { tabName.textContent = (L.file || 'untitled') + (L.dirty ? ' •' : ''); };
      const loadTree = async () => {
        try {
          const list = await DK.workspaceList('.', 4);
          tree.replaceChildren(...list.map(f => h('button', { type: 'button', class: 'fitem' + (f.dir ? ' dir' : '') + (f.path === L.file ? ' on' : ''), style: `padding-left:${8 + (f.path.split('/').length - 1) * 12}px`, disabled: f.dir, onclick: () => openFile(f.path) }, (f.dir ? '▸ ' : '') + f.path.split('/').pop())));
          if (!list.length) tree.replaceChildren(h('p', { class: 'note' }, 'The folder is empty. Ask someone to build something!'));
        } catch (e) { tree.replaceChildren(h('p', { class: 'note' }, e.message)); }
      };
      const openFile = async p => {
        if (L.dirty && !confirmLeave()) return;
        try { L.text = await DK.workspaceRead(p); L.file = p; L.dirty = false; ed.value = L.text; setTab(); loadTree(); } catch (e) { this.flash(e.message); }
      };
      let warned = false;
      const confirmLeave = () => { if (warned) return true; warned = true; this.flash('Unsaved changes — click again to discard them.'); setTimeout(() => { warned = false; }, 3000); return false; };
      const save = async () => {
        let p = L.file;
        if (!p) { p = (prompt ? null : null) || `notes/${new Date().toISOString().slice(0, 10)}-note.md`; }
        try { await DK.workspaceWrite(p, ed.value); L.file = p; L.dirty = false; setTab(); loadTree(); this.flash(`Saved ${p}`); } catch (e) { this.flash(e.message); }
      };
      ed.addEventListener('input', () => { L.dirty = true; L.text = ed.value; setTab(); });
      ed.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); }
        if (e.key === 'Tab') { e.preventDefault(); const a = ed.selectionStart; ed.setRangeText('  ', a, ed.selectionEnd, 'end'); L.dirty = true; setTab(); }
      });
      const renderChat = () => {
        chatLog.replaceChildren(...L.chat.map(m => {
          if (m.role === 'user') return h('div', { class: 'me' }, m.content);
          const el = h('div', { class: 'them md', html: DesklyUI.md(m.content) });
          el.querySelectorAll('pre').forEach(pre => pre.append(h('button', { class: 'ins', type: 'button', onclick: () => { const a = ed.selectionStart; ed.setRangeText(pre.innerText.replace(/Insert$/, '').trimEnd() + '\n', a, ed.selectionEnd, 'end'); L.dirty = true; setTab(); ed.focus(); } }, 'Insert')));
          return el;
        }));
        chatLog.scrollTop = 1e6;
      };
      const send = async () => {
        const q = ask.value.trim(); if (!q) return;
        L.chat.push({ role: 'user', content: q }); ask.value = ''; renderChat();
        const pending = h('div', { class: 'them' }, 'Thinking…'); chatLog.append(pending);
        try {
          const sel = ed.value.slice(ed.selectionStart, ed.selectionEnd);
          const ctx = L.file ? `File: ${L.file}\n${sel ? 'Selected:\n' + sel + '\n\nWhole file:\n' : ''}${ed.value}` : '';
          const r = await DK.assistantChat(L.chat, ctx); L.chat.push({ role: 'assistant', content: r });
        } catch (e) { L.chat.push({ role: 'assistant', content: '⚠ ' + e.message }); }
        renderChat();
      };
      ask.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
      termIn.addEventListener('keydown', async e => {
        if (e.key !== 'Enter' || !termIn.value.trim()) return;
        const cmd = termIn.value.trim(); termIn.value = '';
        L.term.push(`$ ${cmd}`); termOut.textContent = L.term.join('\n');
        try { const r = await DK.terminalRun(cmd); L.term.push((r.stdout || '') + (r.stderr ? '\n' + r.stderr : '') + `\n[exit ${r.code}]`); } catch (err) { L.term.push(err.message); }
        L.term = L.term.slice(-60); termOut.textContent = L.term.join('\n'); termOut.scrollTop = 1e6; loadTree();
      });
      const team = h('div', { class: 'lteam' });
      const renderTeam = () => team.replaceChildren(...app.office.employees.map(e => {
        const t = app.runtime.activeFor(e.id);
        return h('div', { class: 'lrow' }, h('i', { style: `background:${DesklyAgents.STATUS[e.state].color}` }), h('b', {}, e.name.split(' ').find(w => !/^Dr\.?$/.test(w)) || e.name), h('small', {}, t ? `${Math.round(t.progress * 100)}% · ${t.title}` : DesklyAgents.STATUS[e.state].label));
      }));
      renderTeam(); this.lapTimer = setInterval(() => { if (!s.hidden) renderTeam(); }, 1500);
      s.replaceChildren(h('div', { class: 'laptop' },
        h('div', { class: 'lbar' }, mark('small'), h('b', {}, `${this.cfg.founder || 'Your'}'s laptop`), h('span', {}, this.cfg.workspace || ''),
          h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: () => { this.closeLaptop(); if (this.app.exec !== false) this.app.sit?.(); setTimeout(() => this.app.ui.openMeeting(null, 'CEO_Office'), 60); } }, 'Call people to my office'), h('button', { class: 'btn', type: 'button', onclick: () => DK.workspaceOpen() }, 'Open folder'), h('button', { class: 'btn primary', type: 'button', onclick: () => this.closeLaptop() }, 'Close laptop · Esc'))),
        h('div', { class: 'lgrid' },
          h('div', { class: 'lcol' }, h('div', { class: 'lhead' }, 'Project', h('button', { class: 'mini', type: 'button', title: 'Refresh', onclick: loadTree }, '↻')), tree,
            h('div', { class: 'lhead' }, 'Team'), team),
          h('div', { class: 'lcol main' }, h('div', { class: 'lhead' }, tabName, h('button', { class: 'mini', type: 'button', onclick: () => { L.file = null; L.text = ''; ed.value = ''; L.dirty = false; setTab(); } }, 'New'), h('button', { class: 'mini', type: 'button', onclick: save }, 'Save · Ctrl+S')), ed,
            h('div', { class: 'lhead' }, 'Terminal'), termOut, termIn),
          h('div', { class: 'lcol' }, h('div', { class: 'lhead' }, 'Assistant'), chatLog, ask, h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onclick: send }, 'Ask')),
            h('div', { class: 'lhead' }, 'Delegate to your team'), empSel, delegate,
            h('button', { class: 'btn', type: 'button', onclick: () => {
              const e = app.office.byId(empSel.value); const d = delegate.value.trim(); if (!e || !d) return;
              app.runtime.create({ employee: e, description: d + (L.file ? `\n(Related file: ${L.file})` : '') }); delegate.value = '';
              this.flash(`Sent to ${e.name}. They're heading to their desk.`); e.clear(); e.goDesk();
            } }, 'Send as task')))));
      ed.value = L.text; setTab(); renderChat(); termOut.textContent = L.term.join('\n');
      loadTree(); if (openPath) openFile(openPath);
      this.show('screen-laptop');
      setTimeout(() => ed.focus(), 30);
    }
    closeLaptop() { clearInterval(this.lapTimer); this.app.resume(); }
  }
  window.DesklyScreens = Screens;
})();
