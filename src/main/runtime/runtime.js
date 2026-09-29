// Deskly runtime: task lifecycle, the agent loop, approvals and the audit log.
// Lives in the main process — the 3D office only renders what happens here.
const fs = require('fs');
const path = require('path');
const { chat, parseJSON } = require('./providers');
const { Workspace } = require('./workspace');
const { TeamContext } = require('./team-context');
const { forRole } = require('../../renderer/js/role-prompts');

const ACTIVE = new Set(['created', 'queued', 'planning', 'running', 'waiting_for_approval', 'reviewing']);
let seq = 0;
const uid = p => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}`;
const now = () => new Date().toISOString();
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'task';

class Runtime {
  /**
   * @param {object} o
   * @param {string} o.dataDir     folder for tasks.json and audit.jsonl
   * @param {() => object} o.getConfig
   * @param {(id: string) => object} o.profileFor  returns {provider, model, baseUrl, apiKey} for an employee id or "assistant"
   * @param {(evt: object) => void} o.emit
   */
  constructor({ dataDir, getConfig, profileFor, emit }) {
    Object.assign(this, { dataDir, getConfig, profileFor, emitFn: emit });
    this.tasks = new Map(); this.approvals = new Map(); this.ctl = new Map();
    this.tasksPath = path.join(dataDir, 'tasks.json');
    this.auditPath = path.join(dataDir, 'audit.jsonl');
    this.team = new TeamContext(dataDir);
    this.load();
  }
  workspace() { return new Workspace(this.getConfig()?.workspace); }
  employee(id) { return (this.getConfig()?.employees || []).find(e => e.id === id); }
  rolePrompt(emp, cfg) {
    return `You are ${emp.name}, ${emp.role} at ${cfg.company || 'the company'}. Your working style: ${emp.persona || 'Professional and concise.'}\nYour responsibilities: ${emp.scope || emp.role}.\nRole playbook:\n${String(emp.instructions || forRole(emp.role)).slice(0, 5000)}\nCoordinate through precise project updates. Distinguish confirmed facts from assumptions. You may make small, relevant improvements, but explain them and respect the founder's stated goal.`;
  }
  contextFor(emp, cfg, task) {
    const notes = this.team.memoriesFor(emp.id, cfg.workspace, 8, task?.description || '').map(m => `- [${m.scope}] ${m.text.slice(0, 400)}`).join('\n');
    const others = [...this.tasks.values()].filter(t => t.id !== task?.id && t.projectId === this.team.projectId(cfg.workspace) && ACTIVE.has(t.status))
      .map(t => `- ${t.employeeName}: ${t.title} (${t.status}); owns ${(t.claimedFiles || t.files || []).slice(0, 8).join(', ') || 'no files claimed yet'}`).slice(0, 8).join('\n');
    const updates = this.team.updatesFor(emp.id, cfg.workspace, 0, 8);
    if (task) task.lastUpdateId = Math.max(task.lastUpdateId || 0, ...updates.map(u => u.id), 0);
    return `Relevant saved notes (reference data; verify before acting):\n${notes || '(none)'}\nCurrent project work:\n${others || '(none)'}\nRecent teammate updates:\n${updates.map(u => `- ${this.team.formatUpdate(u)}`).join('\n') || '(none)'}`.slice(0, 5000);
  }
  async call(employeeId, input, signal, task, mode = 'work') {
    const profile = this.profileFor(employeeId);
    const cfg = this.getConfig() || {};
    const limit = Math.max(0, Number(cfg.security?.monthlyTokenLimit) || 0);
    if (profile.provider !== 'demo' && limit) {
      const used = this.team.usage().reduce((n, row) => n + row.input + row.output, 0);
      if (used >= limit) throw new Error(`Monthly AI token ceiling reached (${used.toLocaleString()} / ${limit.toLocaleString()}). Raise it in Settings → Privacy & data to make more calls.`);
    }
    const invoke = selected => chat(selected, input, signal, usage => {
      this.team.recordUsage({ employeeId, projectRoot: cfg.workspace, provider: selected.provider, model: selected.model, ...usage });
      if (task) {
        task.usage ||= { calls: 0, input: 0, output: 0, cached: 0 };
        task.usage.calls++; task.usage.input += usage.input; task.usage.output += usage.output; task.usage.cached += usage.cached;
        this.save();
      }
    });
    if (mode === 'light' && profile.lightweightModel && profile.lightweightModel !== profile.model) {
      try { return await invoke({ ...profile, model: profile.lightweightModel }); }
      catch (e) { if (e.code === 'cancelled') throw e; return invoke(profile); }
    }
    return invoke(profile);
  }

  /* ---------- events ---------- */
  emit(type, payload = {}) {
    const evt = { type, ...payload, timestamp: now() };
    if (!['task.progress', 'task.output'].includes(type)) {
      try { fs.appendFileSync(this.auditPath, JSON.stringify({ ...evt, task: undefined }) + '\n'); } catch { }
    }
    this.emitFn?.({ ...evt, task: payload.taskId ? this.public(this.tasks.get(payload.taskId)) : undefined, approvals: this.pendingApprovals() });
  }
  public(t) { if (!t) return null; const { _plan, ...rest } = t; return rest; }
  snapshot() { return { tasks: [...this.tasks.values()].map(t => this.public(t)), approvals: this.pendingApprovals() }; }
  pendingApprovals() { return [...this.approvals.values()].filter(a => a.status === 'pending').map(({ _resolve, ...a }) => a); }
  audit(limit = 300) {
    try { return fs.readFileSync(this.auditPath, 'utf8').trim().split('\n').slice(-limit).map(l => JSON.parse(l)); } catch { return []; }
  }

  /* ---------- lifecycle ---------- */
  create({ employeeId, description }) {
    const emp = this.employee(employeeId);
    if (!emp) throw new Error('Unknown employee');
    description = String(description || '').trim();
    if (!description || description.length > 5000) throw new Error('Task description must be 1–5000 characters.');
    if ([...this.tasks.values()].some(t => t.employeeId === employeeId && ACTIVE.has(t.status))) throw new Error(`${emp.name} is already working on a task.`);
    const projectId = this.team.projectId(this.getConfig()?.workspace);
    const task = {
      id: uid('task'), employeeId, employeeName: emp.name, role: emp.role,
      title: description.length > 60 ? description.slice(0, 58) + '…' : description, description,
      status: 'created', progress: 0, steps: [], step: -1, logs: [], files: [], result: null, error: null,
      provider: emp.provider || 'demo', model: emp.model || '', projectId, claimedFiles: [], usage: { calls: 0, input: 0, output: 0, cached: 0 }, createdAt: now(), updatedAt: now(), approvalRequests: []
    };
    this.tasks.set(task.id, task);
    this.emit('task.created', { taskId: task.id, employeeId, title: task.title });
    this.run(task, emp);
    return this.public(task);
  }
  set(task, status, extra = {}) {
    Object.assign(task, extra, { status, updatedAt: now() });
    this.emit('task.status_changed', { taskId: task.id, employeeId: task.employeeId, status });
    this.save();
  }
  log(task, text) {
    task.logs.push({ t: Date.now(), text: String(text).slice(0, 400) });
    if (task.logs.length > 300) task.logs.shift();
    this.emit('task.output', { taskId: task.id, employeeId: task.employeeId, text });
  }
  progress(task, p) {
    task.progress = Math.max(task.progress, Math.min(1, p));
    this.emit('task.progress', { taskId: task.id, employeeId: task.employeeId, progress: task.progress });
  }
  requestApproval(task, action) {
    const a = { id: uid('approval'), taskId: task.id, employeeId: task.employeeId, employeeName: task.employeeName, action, status: 'pending', createdAt: now() };
    this.approvals.set(a.id, a); task.approvalRequests.push(a.id);
    this.set(task, 'waiting_for_approval');
    this.emit('approval.required', { approvalId: a.id, taskId: task.id, employeeId: task.employeeId, action });
    return new Promise(res => { a._resolve = res; });
  }
  respondApproval(id, decision) {
    const a = this.approvals.get(id);
    if (!a || a.status !== 'pending') return false;
    a.status = decision === 'approved' ? 'approved' : 'rejected'; a.decidedAt = now();
    this.emit('approval.responded', { approvalId: id, taskId: a.taskId, employeeId: a.employeeId, decision: a.status });
    a._resolve(a.status === 'approved');
    return true;
  }
  cancel(taskId) {
    const t = this.tasks.get(taskId);
    if (!t || !ACTIVE.has(t.status)) return;
    for (const a of this.approvals.values()) if (a.taskId === taskId && a.status === 'pending') { a.status = 'cancelled'; a._resolve(false); }
    this.ctl.get(taskId)?.abort();
    this.set(t, 'cancelled', { error: 'Stopped by you' });
  }

  /* ---------- the agent loop ---------- */
  systemPrompt(emp, cfg) {
    return `${this.rolePrompt(emp, cfg)}
You report to ${cfg.founder || 'the founder'}. You work inside one project folder and can only use these tools:
- list_dir {"path"}: list files (relative paths)
- read_file {"path"}: read a text file
- write_file {"path","content"}: create or overwrite a text file in the project
- claim_files {"paths":["relative/path"]}: reserve files before editing so teammates avoid collisions
- send_update {"to":"employee id or all","text":"status and handoff","files":["path"],"contract":"exact interface or output shape","needs":"specific dependency"}: post a structured project update without waking an idle teammate
- remember {"scope":"project or global","text":"durable fact"}: save a useful note; global notes must contain only reusable, non-secret process or founder preferences
- run_command {"command"}: run a shell command in the project folder. ALWAYS needs the founder's approval.
- request_action {"kind","summary","risk","content"}: anything that leaves the building (send email, publish, deploy, spend money, share externally). Needs approval and is recorded, not performed.
Rules: do the real work, not a description of it. Keep files focused. Never touch secrets or .env files. Check current teammate ownership before editing; send a precise update when your work changes an interface or unblocks someone. Prefer writing deliverables into the project (for documents use deskly-output/). Save only durable, verified memories. Be efficient: finish within about 8 tool calls.`;
  }

  async run(task, emp) {
    const ctl = new AbortController(); this.ctl.set(task.id, ctl);
    const signal = ctl.signal;
    const cfg = this.getConfig() || {};
    const ws = this.workspace();
    const profile = this.profileFor(emp.id);
    const system = this.systemPrompt(emp, cfg);
    const teamContext = this.contextFor(emp, cfg, task);
    try {
      this.set(task, 'queued');
      this.set(task, 'planning');
      let tree = '';
      try { tree = ws.listDir('.', 2).slice(0, 80).map(f => (f.dir ? f.path + '/' : f.path)).join('\n'); } catch (e) { this.log(task, `! ${e.message}`); }
      this.log(task, `$ deskly plan · ${profile.provider}${profile.model ? ' · ' + profile.model : ''}`);
      const planText = await this.call(emp.id, { system, messages: [{ role: 'user', content: `PLAN_REQUEST
Task from the founder: """${task.description}"""
Project files:
${tree || '(empty folder)'}
${teamContext}

Reply with only JSON: {"title": "max 7 words", "steps": [{"label": "max 8 words", "sensitive": false}]}. 3-6 steps. Mark "sensitive": true only for steps that run commands or act outside the company.` }], maxTokens: 800 }, signal, task, 'light');
      let plan;
      try { plan = parseJSON(planText); }
      catch (e) {
        if (!profile.lightweightModel) throw e;
        const retry = await this.call(emp.id, { system, messages: [{ role: 'user', content: `Plan this task in 3–6 steps. Task: ${task.description}. Reply only with JSON: {"title":"short title","steps":[{"label":"step"}]}.` }], maxTokens: 800 }, signal, task);
        plan = parseJSON(retry);
      }
      task.title = String(plan.title || task.title).slice(0, 80);
      task.steps = (plan.steps || []).slice(0, 6).map(s => ({ label: String(s.label || 'Work').slice(0, 80), sensitive: !!s.sensitive }));
      if (!task.steps.length) task.steps = [{ label: 'Do the work' }];
      task.steps.forEach((s, i) => this.log(task, `  ${i + 1}. ${s.label}${s.sensitive ? '  [needs approval]' : ''}`));
      this.set(task, 'running');

      const messages = [{ role: 'user', content: `AGENT_TURN
Task: """${task.description}"""
Your plan: ${task.steps.map((s, i) => `${i + 1}. ${s.label}`).join(' ')}
Project files:
${tree || '(empty folder)'}
${teamContext}

Reply with exactly ONE JSON object and nothing else:
{"log": "what you're doing, max 12 words", "step": <plan step number>, "tool": {"name": "...", "args": {...}}}
or, when finished:
{"done": true, "summary": "max 20 words", "result": "Markdown report for the founder: what you did, files changed, how to use it, open questions"}` }];
      const maxTurns = 14;
      for (let turn = 0; turn < maxTurns; turn++) {
        if (signal.aborted) return;
        const fresh = this.team.updatesFor(emp.id, cfg.workspace, task.lastUpdateId || 0);
        if (fresh.length) {
          task.lastUpdateId = fresh[fresh.length - 1].id;
          messages.push({ role: 'user', content: `TEAM_UPDATES (check dependencies before acting):\n${fresh.map(u => this.team.formatUpdate(u)).join('\n')}` });
        }
        const reply = await this.call(emp.id, { system, messages, maxTokens: 4096 }, signal, task);
        messages.push({ role: 'assistant', content: reply });
        let msg;
        try { msg = parseJSON(reply); }
        catch { messages.push({ role: 'user', content: 'That was not valid JSON. Reply with exactly one JSON object as specified. AGENT_TURN' }); continue; }
        if (msg.step) task.step = Math.max(0, Math.min(task.steps.length - 1, Number(msg.step) - 1));
        if (msg.log) this.log(task, `▸ ${msg.log}`);
        this.progress(task, Math.min(0.9, 0.08 + (turn + 1) / (task.steps.length * 2 + 2)));
        if (msg.done) {
          this.set(task, 'reviewing');
          const summary = String(msg.summary || task.title);
          let body = String(msg.result || summary);
          try {
            const name = `deskly-output/${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}-${slug(task.title)}.md`;
            const w = ws.writeFile(name, `# ${task.title}\n\n_${emp.name}, ${emp.role} · ${new Date().toLocaleString()}_\n\n${body}\n`);
            task.files.push(w.path); this.log(task, `✓ Report saved → ${w.path}`);
          } catch (e) { this.log(task, `! Could not save report: ${e.message}`); }
          task.result = { summary, body, files: task.files.slice() };
          if (profile.provider !== 'demo') {
            try {
              this.team.addMemory({ employeeId: emp.id, projectRoot: cfg.workspace, text: `Completed ${task.title}: ${summary.slice(0, 300)}. Files: ${task.files.slice(0, 8).join(', ') || 'none'}.`, source: 'task' });
              this.team.post({ from: emp.id, to: 'all', projectRoot: cfg.workspace, taskId: task.id, text: `Finished ${task.title}. ${summary.slice(0, 350)}`, files: task.files.slice(0, 8) });
            } catch (e) { this.log(task, `! Could not save team context: ${e.message}`); }
          }
          this.progress(task, 1);
          this.set(task, 'completed');
          this.emit('task.completed', { taskId: task.id, employeeId: task.employeeId, summary });
          return;
        }
        const out = await this.tool(task, ws, msg.tool || {}, signal);
        if (task.status === 'cancelled') return;
        messages.push({ role: 'user', content: `TOOL_RESULT ${msg.tool?.name}:\n${String(out).slice(0, 12000)}\n\nAGENT_TURN — continue, or finish with {"done": true, ...}.` });
      }
      throw new Error('Ran out of steps before finishing. Try a smaller task.');
    } catch (e) {
      if (e?.code === 'cancelled' || signal.aborted) { if (task.status !== 'cancelled') this.set(task, 'cancelled', { error: 'Stopped' }); return; }
      this.log(task, `✕ ${e.message}`);
      this.set(task, 'failed', { error: e.message, errorCode: e.code || 'error' });
    } finally { this.ctl.delete(task.id); }
  }

  async tool(task, ws, tool, signal) {
    const args = tool.args || {};
    try {
      switch (tool.name) {
        case 'list_dir': return ws.listDir(args.path || '.', 2).map(f => (f.dir ? f.path + '/' : f.path)).join('\n') || '(empty)';
        case 'read_file': this.log(task, `  read ${args.path}`); return ws.readFile(args.path);
        case 'claim_files': {
          const paths = Array.isArray(args.paths) ? args.paths.slice(0, 20) : [];
          if (!paths.length) return 'Provide at least one file path to claim.';
          const claimed = paths.map(p => this.claimFile(task, ws, p));
          this.log(task, `  claimed ${claimed.join(', ')}`);
          return `Claimed: ${claimed.join(', ')}. Send a teammate update if another role depends on these files.`;
        }
        case 'send_update': {
          const cfg = this.getConfig() || {};
          const to = String(args.to || 'all');
          if (to !== 'all' && !(cfg.employees || []).some(e => e.id === to)) return 'Unknown teammate ID. Use a current employee ID or all.';
          const update = this.team.post({ from: task.employeeId, to, projectRoot: cfg.workspace, taskId: task.id, text: args.text, files: args.files, contract: args.contract, needs: args.needs });
          this.log(task, `  update to ${to}: ${update.text.slice(0, 160)}`);
          this.emit('team.update', { taskId: task.id, employeeId: task.employeeId, to });
          return `Update #${update.id} recorded. The recipient sees it during their next active task turn; no idle AI was started.`;
        }
        case 'remember': {
          const cfg = this.getConfig() || {};
          const scope = args.scope === 'global' ? 'global' : 'project';
          const note = String(args.text || '').trim();
          if (!note || note.length > 700) return 'Memory must be 1–700 characters.';
          if (scope === 'global') {
            if (note.length > 300) return 'Global memory must be at most 300 characters for full review.';
            const ok = await this.approve(task, { kind: 'global_memory', summary: note, risk: 'medium' });
            if (!ok) return 'The founder rejected this cross-project memory.';
          }
          this.team.addMemory({ employeeId: task.employeeId, projectRoot: cfg.workspace, scope, text: note, source: 'employee' });
          this.log(task, `  remembered ${scope} note`);
          return `Saved ${scope} memory for ${task.employeeName}.`;
        }
        case 'write_file': {
          const cfg = this.getConfig() || {};
          if (cfg.security?.approveWrites) {
            const ok = await this.approve(task, { kind: 'write_file', summary: `Write ${args.path} (${String(args.content || '').length} chars)`, risk: 'low' });
            if (!ok) return 'The founder rejected this file write.';
          }
          this.claimFile(task, ws, args.path);
          const w = ws.writeFile(args.path, args.content);
          task.files.includes(w.path) || task.files.push(w.path);
          this.log(task, `  ✎ ${w.created ? 'created' : 'updated'} ${w.path} (${w.bytes} bytes)`);
          return `Wrote ${w.path} (${w.bytes} bytes).`;
        }
        case 'run_command': {
          const command = String(args.command || '');
          if (!command.trim() || command.length > 300) return 'Refused: commands must be 1–300 characters so the full command can be reviewed.';
          const ok = await this.approve(task, { kind: 'execute_command', summary: command, risk: 'medium' });
          if (!ok) return 'The founder rejected this command. Continue without it.';
          this.log(task, `  $ ${command}`);
          const r = await ws.runCommand(command, { signal });
          this.log(task, `  exit ${r.code}`);
          return `exit code ${r.code}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`;
        }
        case 'request_action': {
          const ok = await this.approve(task, { kind: String(args.kind || 'other'), summary: String(args.summary || 'External action').slice(0, 300), risk: String(args.risk || 'medium'), content: String(args.content || '').slice(0, 4000) });
          if (!ok) return 'The founder rejected this action. Do not perform it.';
          this.log(task, `  ✓ Approved and recorded: ${args.summary}`);
          return 'Approved. Deskly recorded the action in the audit log (it does not send or publish on its own). Include the final content in your result.';
        }
        default: return `Unknown tool "${tool.name}". Use list_dir, read_file, claim_files, send_update, remember, write_file, run_command or request_action.`;
      }
    } catch (e) { this.log(task, `  ! ${e.message}`); return `Error: ${e.message}`; }
  }
  claimFile(task, ws, p) {
    const file = ws.rel(ws.resolve(p));
    if (file === '.' || file.endsWith('/')) throw new Error('Claim a file path, not the project folder.');
    const key = process.platform === 'win32' ? file.toLowerCase() : file;
    const owner = [...this.tasks.values()].find(t => t.id !== task.id && t.projectId === task.projectId && ACTIVE.has(t.status) && [...(t.claimedFiles || []), ...(t.files || [])].some(f => (process.platform === 'win32' ? f.toLowerCase() : f) === key));
    if (owner) throw new Error(`${file} is being changed by ${owner.employeeName} (${owner.title}). Coordinate before editing.`);
    task.claimedFiles ||= [];
    if (!task.claimedFiles.includes(file)) { task.claimedFiles.push(file); this.save(); }
    return file;
  }
  async approve(task, action) {
    this.log(task, `⏸ Needs approval: ${action.summary}`);
    const ok = await this.requestApproval(task, action);
    if (task.status === 'cancelled') return false;
    this.log(task, ok ? '✓ Approved by you' : '✕ You rejected it');
    this.set(task, 'running');
    return ok;
  }

  /* ---------- conversations ---------- */
  async reply(employeeId, context, history) {
    const emp = this.employee(employeeId); const cfg = this.getConfig() || {};
    if (!emp) throw new Error('Unknown employee');
    const system = `${this.rolePrompt(emp, cfg)}
You are talking face to face with ${cfg.founder || 'the founder'} in the office. Your status: ${context}.
Reply in character in 1-3 short sentences. If they're asking for a piece of work, suggest they press "Assign as task".`;
    const messages = [{ role: 'user', content: this.contextFor(emp, cfg) }, ...history.slice(-10)];
    return this.call(employeeId, { system, messages, maxTokens: 300 }, undefined, undefined, 'light');
  }
  async meetingIdeas(topic, people) {
    const cfg = this.getConfig() || {};
    return Promise.all(people.map(async p => {
      const emp = this.employee(p.id);
      try {
        const line = await this.call(p.id, {
          system: this.rolePrompt(emp, cfg),
          messages: [{ role: 'user', content: `${this.contextFor(emp, cfg)}\nTeam meeting. Topic from the founder: "${topic}". You are currently ${p.status}. Give ONE concrete idea from your role's perspective, first person, max 30 words, no greeting.` }], maxTokens: 120
        }, undefined, undefined, 'light');
        return { id: p.id, line: line.trim().replace(/^"|"$/g, '') };
      } catch (e) { return { id: p.id, line: `(I couldn't think this through: ${e.message})` }; }
    }));
  }
  async assistant(history, context) {
    const cfg = this.getConfig() || {};
    const system = `You are the personal coding and work assistant of ${cfg.founder || 'the founder'} inside Deskly, on their own laptop. Be concise and practical. When you write code, use fenced code blocks with the language. ${context ? '\nContext from their editor:\n' + context.slice(0, 20000) : ''}`;
    const notes = this.contextFor({ id: 'assistant' }, cfg);
    return this.call('assistant', { system, messages: [{ role: 'user', content: notes }, ...history.slice(-12)], maxTokens: 4096 });
  }

  /* ---------- persistence ---------- */
  save() {
    try {
      const keep = [...this.tasks.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 80).map(t => ({ ...this.public(t), logs: t.logs.slice(-60) }));
      fs.writeFileSync(this.tasksPath, JSON.stringify(keep));
    } catch { }
  }
  load() {
    try {
      for (const t of JSON.parse(fs.readFileSync(this.tasksPath, 'utf8'))) {
        if (ACTIVE.has(t.status)) { t.status = 'failed'; t.error = 'Interrupted when Deskly closed'; }
        this.tasks.set(t.id, t);
      }
    } catch { }
  }
  clearHistory() {
    for (const [id, t] of this.tasks) if (!ACTIVE.has(t.status)) this.tasks.delete(id);
    this.save(); this.emit('runtime.history_cleared');
  }
  markReviewed(taskId) { const t = this.tasks.get(taskId); if (t) { t.reviewed = true; this.save(); this.emit('task.reviewed', { taskId, employeeId: t.employeeId }); } }
}
module.exports = { Runtime, ACTIVE };
