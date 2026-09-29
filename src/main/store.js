// Deskly settings + secrets. Settings are plain JSON; API keys require
// Electron safeStorage before they can be saved.
const fs = require('fs');
const path = require('path');

class Store {
  constructor(dir, safeStorage) {
    this.dir = dir;
    this.safe = safeStorage;
    this.cfgPath = path.join(dir, 'deskly-config.json');
    this.secPath = path.join(dir, 'deskly-secrets.json');
    fs.mkdirSync(dir, { recursive: true });
  }
  encryptionAvailable() {
    try {
      if (!this.safe?.isEncryptionAvailable()) return false;
      return this.safe.getSelectedStorageBackend?.() !== 'basic_text';
    } catch { return false; }
  }
  readJSON(p, fallback) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
  }
  writeJSON(p, data) {
    const tmp = p + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, p);
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
  setSecret(id, value) {
    const all = this.secrets();
    if (!value) delete all[id];
    else {
      if (!this.encryptionAvailable()) throw new Error('Secure key storage is unavailable on this computer. No API key was saved.');
      all[id] = { enc: true, v: this.safe.encryptString(value).toString('base64') };
    }
    this.writeJSON(this.secPath, all);
  }
  getSecret(id) {
    const s = this.secrets()[id];
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
  reset() {
    for (const p of [this.cfgPath, this.secPath]) { try { fs.unlinkSync(p); } catch { } }
  }
}
module.exports = { Store };
