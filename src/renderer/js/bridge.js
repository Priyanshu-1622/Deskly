/* Deskly bridge. In the desktop app this is the secure preload API
   (window.desklyNative). In a plain browser (development, demos, tests) it
   falls back to a self-contained demo runtime so every screen still works. */
(function () {
  if (window.desklyNative) { window.DK = window.desklyNative; return; }

  const LS = 'deskly.web.';
  const get = (k, d) => { try { return JSON.parse(localStorage.getItem(LS + k)) ?? d; } catch { return d; } };
  const put = (k, v) => { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch { } };
  const listeners = new Set();
  const files = new Map(get('files', [['README.md', '# My project\n\nFiles your team writes appear here.\n']]));
  const tasks = new Map(); const approvals = new Map();
  let n = 0; const uid = p => p + '_' + Date.now().toString(36) + (n++);
  const now = () => new Date().toISOString();
  const pub = t => t && JSON.parse(JSON.stringify(t));
  const pending = () => [...approvals.values()].filter(a => a.status === 'pending').map(({ res, ...a }) => a);
  const emit = (type, p = {}) => { const evt = { type, ...p, timestamp: now(), task: p.taskId ? pub(tasks.get(p.taskId)) : undefined, approvals: pending() }; audit.push(evt); listeners.forEach(f => f(evt)); };
  const audit = [];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const saveFiles = () => put('files', [...files.entries()]);
  const cfg = () => get('config', null);
  const groups = get('groups', []), groupRounds = new Map();
  const groupSave = () => put('groups', groups);
  const groupGet = id => {
    const s = groups.find(s => s.id === id && s.project === (cfg()?.workspace || null));
    if (!s) throw Error('Discussion is unavailable in this project.');
    return s;
  };
  const groupAppend = (s, kind, name, text, employeeId = null) => {
    if (s.messages.length >= 500) throw Error('This discussion is full. Start a new meeting.');
    s.messages.push({ id: uid('message'), kind, name, text, employeeId, at: now() });
    s.updatedAt = now(); groupSave(); emit('group.updated', { groupId: s.id, status: s.status, speakerId: s.speakerId });
  };
  for (const s of groups) if (s.status === 'running') { s.status = 'idle'; s.speakerId = null; if(s.messages.length<500)groupAppend(s, 'system', 'Deskly', 'Completed replies were saved. Start another round to continue.');else groupSave(); }

  async function run(t) {
    const set = (s, x = {}) => { Object.assign(t, x, { status: s, updatedAt: now() }); emit('task.status_changed', { taskId: t.id, employeeId: t.employeeId, status: s }); };
    const log = x => { t.logs.push({ t: Date.now(), text: x }); emit('task.output', { taskId: t.id, employeeId: t.employeeId, text: x }); };
    const prog = p => { t.progress = p; emit('task.progress', { taskId: t.id, employeeId: t.employeeId, progress: p }); };
    set('planning'); log('$ deskly plan · demo'); await wait(1200);
    t.steps = [{ label: 'Look at the workspace' }, { label: 'Write the deliverable' }, { label: 'Share it with the team', sensitive: true }];
    t.steps.forEach((s, i) => log(`  ${i + 1}. ${s.label}`)); set('running');
    t.step = 0; log('▸ Checking what is in the workspace'); prog(0.2); await wait(1800);
    t.step = 1; log('▸ Writing the demo deliverable'); prog(0.45); await wait(1800);
    const path = `deskly-output/${t.id}.md`; files.set(path, `# ${t.title}\n\nWritten in browser demo mode.\n`); saveFiles(); t.files.push(path); log(`  ✎ created ${path}`);
    t.step = 2; log('⏸ Needs approval: Post the summary in the team channel');
    const a = { id: uid('approval'), taskId: t.id, employeeId: t.employeeId, employeeName: t.employeeName, action: { kind: 'share_externally', summary: 'Post the summary in the team channel', risk: 'low' }, status: 'pending' };
    approvals.set(a.id, a); set('waiting_for_approval'); emit('approval.required', { approvalId: a.id, taskId: t.id, employeeId: t.employeeId, action: a.action });
    const ok = await new Promise(r => { a.res = r; });
    if (t.status === 'cancelled') return;
    if (!ok) { log('✕ You rejected it'); set('cancelled', { error: 'You rejected the action' }); return; }
    log('✓ Approved by you'); set('running'); prog(0.8); await wait(1500);
    set('reviewing'); await wait(800);
    t.result = { summary: 'Demo run finished — the desktop app does the real work with your API keys.', body: 'This browser build runs a simulated employee. Install the desktop app and add API keys in **Settings → Team** for real work.', files: t.files.slice() };
    prog(1); set('completed'); emit('task.completed', { taskId: t.id, employeeId: t.employeeId, summary: t.result.summary });
  }

  window.DK = {
    native: false,
    appInfo: async () => ({ version: 'web', platform: 'web', encryption: false, providers: { demo: { label: 'Demo (browser build)', defaultModel: 'demo', needsKey: false }, anthropic: { label: 'Anthropic (Claude)', defaultModel: 'claude-sonnet-5-5', needsKey: true }, openai: { label: 'OpenAI', defaultModel: 'gpt-4o-mini', needsKey: true } } }),
    configGet: async () => ({ config: cfg(), keys: get('keys', {}) }),
    configSave: async c => { put('config', c); return c; },
    configReset: async () => { localStorage.removeItem(LS + 'config'); localStorage.removeItem(LS + 'keys'); return true; },
    secretSet: async (id, v) => { const k = get('keys', {}); if (v) k[id] = true; else delete k[id]; put('keys', k); return k; },   // never stores the key in the browser build
    providerTest: async p => { if (p.provider !== 'demo') throw new Error('Keys can only be tested in the desktop app.'); return { ok: true, ms: 1, sample: 'ready' }; },
    dataErase: async () => { if (!confirm('Erase all Deskly preview settings, notes, tasks and whiteboards?')) return false; await window.DesklyOfficeTools?.erase(); for (const key of Object.keys(localStorage)) if (key.startsWith('deskly.')) localStorage.removeItem(key); location.reload(); return true; },
    workspaceIgnoreMap: async () => { throw Error('Git workspace tools require the desktop app.'); },
    workspaceChoose: async () => 'Browser workspace',
    workspaceList: async () => [...files.keys()].sort().map(p => ({ path: p, dir: false })),
    workspaceRead: async p => { if (!files.has(p)) throw new Error('File not found'); return files.get(p); },
    workspaceWrite: async (p, c) => { files.set(p, c); saveFiles(); return { path: p, bytes: c.length }; },
    workspaceOpen: async () => true,
    terminalRun: async cmd => ({ code: 0, stdout: `(browser build) The terminal runs commands in the desktop app.\n> ${cmd}`, stderr: '' }),
    tasksSnapshot: async () => ({ tasks: [...tasks.values()].map(pub), approvals: pending() }),
    tasksCreate: async (employeeId, description) => {
      const e = (cfg()?.employees || []).find(x => x.id === employeeId);
      if ([...tasks.values()].some(t => t.employeeId === employeeId && !['completed', 'failed', 'cancelled'].includes(t.status))) throw new Error(`${e?.name} is already working on a task.`);
      const t = { id: uid('task'), employeeId, employeeName: e?.name, role: e?.role, title: description.slice(0, 60), description, status: 'created', progress: 0, steps: [], step: -1, logs: [], files: [], result: null, createdAt: now(), updatedAt: now() };
      tasks.set(t.id, t); emit('task.created', { taskId: t.id, employeeId, title: t.title }); run(t); return pub(t);
    },
    tasksResume: async () => { throw new Error('Resuming work requires the desktop app.'); },
    tasksCancel: async id => { const t = tasks.get(id); if (!t) return; t.status = 'cancelled'; t.error = 'Stopped by you'; for (const a of approvals.values()) if (a.taskId === id && a.status === 'pending') { a.status = 'cancelled'; a.res(false); } emit('task.status_changed', { taskId: id, employeeId: t.employeeId, status: 'cancelled' }); },
    tasksClear: async () => { for (const [id, t] of tasks) if (['completed', 'failed', 'cancelled'].includes(t.status)) tasks.delete(id); emit('runtime.history_cleared'); },
    tasksReviewed: async id => { const t = tasks.get(id); if (t) t.reviewed = true; emit('task.reviewed', { taskId: id, employeeId: t?.employeeId }); },
    approvalRespond: async (id, d) => { const a = approvals.get(id); if (!a || a.status !== 'pending') return false; a.status = d; emit('approval.responded', { approvalId: id, taskId: a.taskId, employeeId: a.employeeId, decision: d }); a.res(d === 'approved'); return true; },
    memoryList: async id => get('memories', []).filter(m => m.employeeId === id),
    memoryAdd: async (employeeId, scope, text, kind = 'fact') => { const all = get('memories', []); const note = { id: uid('memory'), employeeId, scope, text: String(text).slice(0, 700), kind, status: 'verified', source: 'founder', createdAt: now() }; all.push(note); put('memories', all); return note; },
    memoryUpdate: async (employeeId, id, patch) => { const all = get('memories', []); const note = all.find(m => m.id === id && m.employeeId === employeeId); if (!note) throw new Error('Memory not found.'); Object.assign(note, patch); put('memories', all); return note; },
    memoryDelete: async id => { const all = get('memories', []); put('memories', all.filter(m => m.id !== id)); return true; },
    teamUpdates: async () => [],
    usageGet: async () => [],
    auditList: async () => audit.filter(e => !['task.progress', 'task.output'].includes(e.type)).map(({ task, approvals, ...e }) => e),
    auditExport: async () => null,
    employeeReply: async (id, ctx) => `(demo) I'm ${ctx}. In the desktop app with an API key I'd give you a real answer.`,
    meetingIdeas: async (topic, people) => people.map(p => ({ id: p.id, line: `(demo) From ${p.role}: I'd look at how "${topic}" changes my current work.` })),
    groupList: async () => groups.filter(s => s.project === (cfg()?.workspace || null)).map(pub).reverse(),
    groupGet: async id => pub(groupGet(id)),
    groupStart: async (room, topic, ids) => {
      if (!ids.length || new Set(ids).size !== ids.length || groups.length >= 200) throw Error('Invalid participants or discussion archive is full.');
      const participants = ids.map(id => { const e = cfg()?.employees?.find(e => e.id === id); if (!e) throw Error('Unknown employee'); return { id, name: e.name, role: e.role }; });
      const s = { id: uid('group'), room, topic: topic || 'Group conversation', project: cfg()?.workspace || null, participants, messages: [], status: 'idle', speakerId: null, createdAt: now(), updatedAt: now() };
      groups.push(s); groupSave(); return pub(s);
    },
    groupSend: async (id, text, responders) => {
      const s = groupGet(id);
      if (s.status !== 'idle') throw Error('This discussion is running or has ended.');
      if (new Set(responders).size !== responders.length || responders.some(id => !s.participants.some(p => p.id === id))) throw Error('Selected speaker is not in this discussion.');
      if (text.length > 5000 || (!text.trim() && (!responders.length || !s.messages.some(m => m.kind === 'founder')))) throw Error('Write a message first.');
      if (s.messages.length + responders.length + 1 > 500) throw Error('This discussion is full.');
      if (text.trim()) groupAppend(s, 'founder', cfg()?.founder || 'Founder', text.trim());
      const round = { stopped: false }; groupRounds.set(id, round); s.status = 'running'; groupSave();
      try {
        for (const employeeId of responders) {
          if (round.stopped || s.project !== (cfg()?.workspace || null)) break;
          const e = s.participants.find(p => p.id === employeeId); s.speakerId = employeeId; groupSave();
          await wait(350);
          if (round.stopped || s.project !== (cfg()?.workspace || null)) break;
          groupAppend(s, 'employee', e.name, `(Browser demo) ${e.role}: I can read the shared discussion. Connect a provider in the desktop app for real ideas and replies.`, employeeId);
        }
      } finally { groupRounds.delete(id); s.speakerId = null; if (s.status !== 'ended') s.status = 'idle'; groupSave(); }
      return pub(s);
    },
    groupCancel: async id => { const s = groupGet(id), round = groupRounds.get(id); if (round) round.stopped = true; return pub(s); },
    groupEnd: async id => { const s = groupGet(id), round = groupRounds.get(id); if (round) round.stopped = true; s.status = 'ended'; s.speakerId = null; groupSave(); return pub(s); },
    groupDecision: async (id, text) => {
      const s = groupGet(id);
      if (s.status !== 'idle' || !text.trim() || text.length > 700) throw Error('Finish the round and enter a decision of up to 700 characters.');
      if (!cfg()?.workspace) throw Error('Choose a project folder first.');
      groupAppend(s, 'decision', cfg()?.founder || 'Founder', text.trim());
      for (const p of s.participants) await window.DK.memoryAdd(p.id, 'project', text.trim(), 'decision');
      return pub(s);
    },
    assistantChat: async () => 'This is the browser build, so your assistant is offline. In the desktop app it uses the provider and key from Settings → Your assistant.',
    shellExternal: async url => { window.open(url, '_blank'); return true; },
    appFullscreen: async () => { try { document.fullscreenElement ? await document.exitFullscreen() : await document.documentElement.requestFullscreen(); } catch { } return !!document.fullscreenElement; },
    appQuit: async () => { location.reload(); },
    onRuntimeEvent: fn => { listeners.add(fn); return () => listeners.delete(fn); }
  };
})();
