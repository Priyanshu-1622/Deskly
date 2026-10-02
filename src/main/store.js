// Deskly settings + secrets. Settings are plain JSON; API keys require
// Electron safeStorage before they can be saved.
const fs = require('fs');
const path = require('path');
const { readRecover, atomicSync } = require('./runtime/persistence');
const { endpointFor } = require('./runtime/providers');

class Store {
  constructor(dir, safeStorage) {
    this.dir = dir;
    this.safe = safeStorage;
    this.cfgPath = path.join(dir, 'deskly-config.json');
    this.secPath = path.join(dir, 'deskly-secrets.json');
    this.notices = [];
    this.cache = new Map();
    fs.mkdirSync(dir, { recursive: true });
  }
  encryptionAvailable() {
    try {
      if (!this.safe?.isEncryptionAvailable()) return false;
      return this.safe.getSelectedStorageBackend?.() !== 'basic_text';
    } catch { return false; }
  }
  readJSON(p, fallback) {
    if (!this.cache.has(p)) this.cache.set(p, readRecover(p, fallback, v => !!v && typeof v === 'object' && !Array.isArray(v), this.notices));
    return this.cache.get(p);
  }
  writeJSON(p, data) {
    atomicSync(p, data);
    this.cache.set(p, data);
  }
  getConfig() { return this.readJSON(this.cfgPath, null); }
  saveConfig(cfg) {
    // strip anything that looks like a secret before it touches disk in plain text
    const clean = JSON.parse(JSON.stringify(cfg));
    for (const e of clean.employees || []) delete e.apiKey;
    if (clean.assistant) delete clean.assistant.apiKey;
    this.writeJSON(this.cfgPath, clean);
    return clean;
  }
  // secrets are keyed by owner id ("assistant" or an employee id)
  secrets() { return this.readJSON(this.secPath, {}); }
  setSecret(id, value, profile) {
    const all = { ...this.secrets() };
    if (!value) delete all[id];
    else {
      if (!this.encryptionAvailable()) throw new Error('Secure key storage is unavailable on this computer. No API key was saved.');
      all[id] = { enc: true, v: this.safe.encryptString(value).toString('base64'), ...(profile ? { provider: profile.provider, endpoint: endpointFor(profile) } : {}) };
    }
    this.writeJSON(this.secPath, all);
  }
  getSecret(id, profile) {
    const s = this.secrets()[id];
    if (profile && (s?.provider !== profile.provider || s?.endpoint !== endpointFor(profile))) return null;
    if (!s?.enc || !this.encryptionAvailable()) return null;
    try {
      const buf = Buffer.from(s.v, 'base64');
      return this.safe.decryptString(buf);
    } catch { return null; }
  }
  hasSecrets() {
    const all = this.secrets();
    return Object.fromEntries(Object.entries(all).filter(([, s]) => s?.enc && this.encryptionAvailable()).map(([k]) => [k, true]));
  }
  bindLegacySecrets(profiles) {
    const all = { ...this.secrets() }; let changed = false;
    for (const [id, profile] of Object.entries(profiles)) {
      if (all[id]?.enc && !all[id].provider) {
        try { all[id] = { ...all[id], provider: profile.provider || 'demo', endpoint: endpointFor({ ...profile, provider: profile.provider || 'demo' }) }; changed = true; }
        catch { this.notices.push(`The key for ${id} needs a valid provider configuration before it can be restored.`); }
      }
    }
    if (changed) this.writeJSON(this.secPath, all);
  }
  reset() {
    for (const p of [this.cfgPath, this.secPath]) for (const candidate of [p, p + '.bak']) { try { fs.unlinkSync(candidate); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
    this.cache.clear();
  }
}
module.exports = { Store };
