// Workspace-scoped file tools. Shell commands are separately approved by the
// runtime; a working directory does not sandbox a shell process.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const DENY = [/\brm\s+-rf\s+[\/~]/i, /\bformat\s+[a-z]:/i, /\bmkfs\b/i, /\bshutdown\b/i, /\breboot\b/i, /:\(\)\s*\{/, /\bdel\s+\/s\b/i, /\bRemove-Item\b.*-Recurse.*[A-Z]:\\\s*$/i];
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.venv']);
const SECRET = /(^|[\\/])(\.env(?:\..*)?|\.npmrc|\.pypirc|id_rsa|id_ed25519)(?=[\\/]|$)/i;

class Workspace {
  constructor(root) {
    this.root = root ? path.resolve(root) : null;
  }
  ensure() {
    if (!this.root) throw new Error('No project folder is set. Choose one in Settings → General.');
    if (!fs.existsSync(this.root)) fs.mkdirSync(this.root, { recursive: true });
  }
  resolve(p = '.') {
    this.ensure();
    const full = path.resolve(this.root, String(p || '.'));
    const rel = path.relative(this.root, full);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`Refused: ${p} is outside the project folder.`);
    // Refuse links at every existing component, including dangling links. This
    // prevents a link inside the workspace from redirecting file tools outside.
    let part = this.root;
    for (const name of rel.split(path.sep).filter(Boolean)) {
      part = path.join(part, name);
      let stat;
      try { stat = fs.lstatSync(part); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      if (stat?.isSymbolicLink()) throw new Error(`Refused: ${p} contains a symbolic link.`);
    }
    return full;
  }
  rel(full) { return path.relative(this.root, full).split(path.sep).join('/') || '.'; }
  listDir(p = '.', depth = 2) {
    const base = this.resolve(p);
    depth = Math.max(1, Math.min(3, Number(depth) || 2));
    const out = [];
    const walk = (dir, d) => {
      let ents = [];
      try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      ents.sort((a, b) => (b.isDirectory() - a.isDirectory()) || a.name.localeCompare(b.name));
      for (const e of ents) {
        if (SKIP.has(e.name) || SECRET.test(path.join(dir, e.name)) || e.isSymbolicLink()) continue;
        const full = path.join(dir, e.name);
        out.push({ path: this.rel(full), dir: e.isDirectory() });
        if (out.length > 400) return;
        if (e.isDirectory() && d > 1) walk(full, d - 1);
      }
    };
    walk(base, depth);
    return out;
  }
  readFile(p, max = 60000) {
    const full = this.resolve(p);
    if (SECRET.test(full)) throw new Error('Refused: this file may contain secrets.');
    const st = fs.statSync(full);
    if (st.isDirectory()) throw new Error(`${p} is a folder.`);
    const limit = Math.max(1, Math.min(400000, Number(max) || 60000));
    const buf = Buffer.alloc(Math.min(st.size, limit));
    const fd = fs.openSync(full, 'r');
    let bytes;
    try { bytes = fs.readSync(fd, buf, 0, buf.length, 0); }
    finally { fs.closeSync(fd); }
    const text = buf.subarray(0, bytes).toString('utf8');
    return st.size > limit ? text + `\n…[truncated, ${st.size} bytes total]` : text;
  }
  writeFile(p, content) {
    const full = this.resolve(p);
    if (SECRET.test(full)) throw new Error('Refused: this file may contain secrets.');
    const value = String(content ?? '');
    const bytes = Buffer.byteLength(value);
    if (bytes > 1000000) throw new Error('Refused: file content exceeds the 1 MB limit.');
    fs.mkdirSync(path.dirname(full), { recursive: true });
    const existed = fs.existsSync(full);
    fs.writeFileSync(full, value, 'utf8');
    return { path: this.rel(full), bytes, created: !existed };
  }
  runCommand(cmd, { timeoutMs = 120000, signal } = {}) {
    this.ensure();
    if (typeof cmd !== 'string' || !cmd.trim() || cmd.length > 300) return Promise.resolve({ code: -1, stdout: '', stderr: 'Refused: command must be 1–300 characters so it can be reviewed in full.' });
    if (DENY.some(r => r.test(cmd))) return Promise.resolve({ code: -1, stdout: '', stderr: 'Refused: this command is on the blocked list.' });
    return new Promise(resolve => {
      const child = spawn(cmd, { cwd: this.root, shell: true, env: { ...process.env, CI: '1' } });
      let out = '', err = '';
      const cap = (s, d) => (s.length > 20000 ? s : s + d);
      child.stdout.on('data', d => { out = cap(out, d.toString()); });
      child.stderr.on('data', d => { err = cap(err, d.toString()); });
      const t = setTimeout(() => { child.kill(); err += '\n[timed out]'; }, timeoutMs);
      signal?.addEventListener('abort', () => child.kill(), { once: true });
      child.on('close', code => { clearTimeout(t); resolve({ code, stdout: out.slice(0, 20000), stderr: err.slice(0, 8000) }); });
      child.on('error', e => { clearTimeout(t); resolve({ code: -1, stdout: out, stderr: String(e.message) }); });
    });
  }
}
module.exports = { Workspace };
