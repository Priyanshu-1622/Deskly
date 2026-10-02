const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readRecover, BufferedJSON } = require('./persistence');

// Local, bounded context. Agents read this only when a person assigns work or
// asks for a reply; posting an update never starts another model request.
class TeamContext {
  constructor(dataDir) {
    this.file = path.join(dataDir, 'team-context.json');
    this.notices = [];
    this.data = readRecover(this.file, () => ({ version: 1, sequence: 0, memories: [], updates: [], usage: {} }), d => d && typeof d === 'object' && Array.isArray(d.memories) && Array.isArray(d.updates) && d.usage && typeof d.usage === 'object' && !Array.isArray(d.usage), this.notices);
    this.data.memories ||= []; this.data.updates ||= []; this.data.usage ||= {}; this.data.sequence ||= 0;
    this.writer = new BufferedJSON(this.file, () => this.data, e => { this.lastSaveError = e.message; });
  }
  projectId(root) {
    if (!root) return null;
    const resolved = path.resolve(root).replace(/\\/g, '/');
    const normalized = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  }
  save() {
    this.writer.schedule();
  }
  flush() { return this.writer.flush(); }
  addMemory({ employeeId, projectRoot, scope = 'project', text, source = 'employee', kind = 'fact', evidence = '' }) {
    const value = String(text || '').trim().slice(0, 700);
    if (!employeeId || !value) throw new Error('Memory needs an employee and a note.');
    if (!['project', 'global'].includes(scope)) throw new Error('Memory scope must be project or global.');
    const projectId = scope === 'project' ? this.projectId(projectRoot) : null;
    if (scope === 'project' && !projectId) throw new Error('Choose a project folder before saving project memory.');
    const existing = this.data.memories.find(m => m.employeeId === employeeId && m.projectId === projectId && m.text === value);
    if (existing) return existing;
    const note = { id: crypto.randomUUID(), employeeId, projectId, scope, text: value, source,
      kind: ['fact', 'decision', 'preference', 'lesson'].includes(kind) ? kind : 'fact',
      status: source === 'founder' ? 'verified' : 'unverified', evidence: String(evidence || '').slice(0, 300),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const bucket = this.data.memories.filter(m => m.employeeId === employeeId && m.scope === scope && m.projectId === projectId);
    if (bucket.length >= 200) {
      const disposable = bucket.find(m => m.status === 'outdated') || bucket.find(m => m.status !== 'verified');
      if (!disposable) throw new Error('This memory collection contains 200 verified notes. Archive a note before adding another; verified notes are never automatically discarded.');
      this.data.memories = this.data.memories.filter(m => m.id !== disposable.id);
    }
    this.data.memories.push(note);
    this.save();
    return note;
  }
  memoriesFor(employeeId, projectRoot, limit = 12, query = '') {
    const projectId = this.projectId(projectRoot);
    const matches = this.data.memories.filter(m => m.employeeId === employeeId && m.status === 'verified' && (m.scope === 'global' || (projectId && m.projectId === projectId)));
    const words = new Set(String(query).toLowerCase().match(/[a-z0-9]{4,}/g) || []);
    if (!words.size) return matches.slice(-Math.min(50, limit));
    return matches.map((m, index) => ({ m, index, score: [...words].filter(w => m.text.toLowerCase().includes(w)).length }))
      .sort((a, b) => b.score - a.score || b.index - a.index).slice(0, Math.min(50, limit))
      .sort((a, b) => a.index - b.index).map(x => x.m);
  }
  listMemories(employeeId, projectRoot) {
    const projectId = this.projectId(projectRoot);
    return this.data.memories.filter(m => m.employeeId === employeeId && (m.scope === 'global' || (projectId && m.projectId === projectId)));
  }
  deleteMemory(id) {
    const before = this.data.memories.length;
    this.data.memories = this.data.memories.filter(m => m.id !== id);
    if (before !== this.data.memories.length) this.save();
    return before !== this.data.memories.length;
  }
  updateMemory(id, employeeId, patch = {}) {
    const note = this.data.memories.find(m => m.id === id && m.employeeId === employeeId);
    if (!note) throw new Error('Memory note not found for this employee.');
    if (patch.status !== undefined) {
      if (!['verified', 'unverified', 'outdated'].includes(patch.status)) throw new Error('Unknown memory status.');
      note.status = patch.status;
    }
    if (patch.kind !== undefined) {
      if (!['fact', 'decision', 'preference', 'lesson'].includes(patch.kind)) throw new Error('Unknown memory type.');
      note.kind = patch.kind;
    }
    if (patch.text !== undefined) {
      const value = String(patch.text).trim();
      if (!value || value.length > 700) throw new Error('Memory must be 1–700 characters.');
      note.text = value;
    }
    note.updatedAt = new Date().toISOString();
    this.save(); return note;
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
