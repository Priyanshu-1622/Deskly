const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Local, bounded context. Agents read this only when a person assigns work or
// asks for a reply; posting an update never starts another model request.
class TeamContext {
  constructor(dataDir) {
    this.file = path.join(dataDir, 'team-context.json');
    if (fs.existsSync(this.file)) {
      try { this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')); }
      catch {
        try { this.data = JSON.parse(fs.readFileSync(this.file + '.bak', 'utf8')); }
        catch { throw new Error('Team memory could not be read. Its files were preserved for recovery.'); }
      }
    } else this.data = { version: 1, sequence: 0, memories: [], updates: [], usage: {} };
    this.data.memories ||= []; this.data.updates ||= []; this.data.usage ||= {}; this.data.sequence ||= 0;
  }
  projectId(root) {
    if (!root) return null;
    const resolved = path.resolve(root).replace(/\\/g, '/');
    const normalized = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    if (fs.existsSync(this.file)) fs.copyFileSync(this.file, this.file + '.bak');
    fs.renameSync(tmp, this.file);
  }
  addMemory({ employeeId, projectRoot, scope = 'project', text, source = 'employee' }) {
    const value = String(text || '').trim().slice(0, 700);
    if (!employeeId || !value) throw new Error('Memory needs an employee and a note.');
    if (!['project', 'global'].includes(scope)) throw new Error('Memory scope must be project or global.');
    const projectId = scope === 'project' ? this.projectId(projectRoot) : null;
    if (scope === 'project' && !projectId) throw new Error('Choose a project folder before saving project memory.');
    const existing = this.data.memories.find(m => m.employeeId === employeeId && m.projectId === projectId && m.text === value);
    if (existing) return existing;
    const note = { id: crypto.randomUUID(), employeeId, projectId, scope, text: value, source, createdAt: new Date().toISOString() };
    this.data.memories.push(note);
    this.data.memories = this.data.memories.slice(-500);
    this.save();
    return note;
  }
  memoriesFor(employeeId, projectRoot, limit = 12, query = '') {
    const projectId = this.projectId(projectRoot);
    const matches = this.data.memories.filter(m => m.employeeId === employeeId && (m.scope === 'global' || (projectId && m.projectId === projectId)));
    const words = new Set(String(query).toLowerCase().match(/[a-z0-9]{4,}/g) || []);
    if (!words.size) return matches.slice(-Math.min(50, limit));
    return matches.map((m, index) => ({ m, index, score: [...words].filter(w => m.text.toLowerCase().includes(w)).length }))
      .sort((a, b) => b.score - a.score || b.index - a.index).slice(0, Math.min(50, limit))
      .sort((a, b) => a.index - b.index).map(x => x.m);
  }
  deleteMemory(id) {
    const before = this.data.memories.length;
    this.data.memories = this.data.memories.filter(m => m.id !== id);
    if (before !== this.data.memories.length) this.save();
    return before !== this.data.memories.length;
  }
  post({ from, to = 'all', projectRoot, taskId, text, files = [], contract = '', needs = '' }) {
    const projectId = this.projectId(projectRoot);
    const value = String(text || '').trim().slice(0, 1000);
    if (!projectId || !from || !value) throw new Error('A project, sender and message are required.');
    const update = { id: ++this.data.sequence, projectId, from, to, taskId, text: value,
      files: (Array.isArray(files) ? files : []).slice(0, 12).map(f => String(f).slice(0, 200)),
      contract: String(contract || '').slice(0, 500), needs: String(needs || '').slice(0, 500),
      createdAt: new Date().toISOString() };
    this.data.updates.push(update);
    this.data.updates = this.data.updates.slice(-300);
    this.save();
    return update;
  }
  updatesFor(employeeId, projectRoot, after = 0, limit = 8) {
    const projectId = this.projectId(projectRoot);
    return this.data.updates.filter(u => u.projectId === projectId && u.id > after && u.from !== employeeId && (u.to === 'all' || u.to === employeeId)).slice(-Math.min(30, limit));
  }
  recentUpdates(projectRoot, limit = 20) {
    const projectId = this.projectId(projectRoot);
    return this.data.updates.filter(u => u.projectId === projectId).slice(-Math.min(100, limit));
  }
  formatUpdate(update) {
    return `${update.from} → ${update.to}: ${update.text}${update.files?.length ? `\nFiles: ${update.files.join(', ')}` : ''}${update.contract ? `\nInterface/contract: ${update.contract}` : ''}${update.needs ? `\nNeeds: ${update.needs}` : ''}`;
  }
  recordUsage({ employeeId, projectRoot, provider, model, input = 0, output = 0, cached = 0 }) {
    const count = n => Number.isFinite(Number(n)) ? Math.max(0, Math.floor(Number(n))) : 0;
    input = count(input); output = count(output); cached = count(cached);
    if (!input && !output) return;
    const month = new Date().toISOString().slice(0, 7);
    const key = [month, this.projectId(projectRoot) || 'none', employeeId, provider, model].join('|');
    const row = this.data.usage[key] ||= { month, projectId: this.projectId(projectRoot), employeeId, provider, model, calls: 0, input: 0, output: 0, cached: 0 };
    row.calls++; row.input += input; row.output += output; row.cached += cached;
    this.save();
  }
  usage(month = new Date().toISOString().slice(0, 7)) {
    return Object.values(this.data.usage).filter(row => row.month === month);
  }
}

module.exports = { TeamContext };
