// Workspace-scoped file tools. Shell commands are separately approved by the
// runtime; a working directory does not sandbox a shell process.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { cleanEnvironment, stopTree } = require('./process-control');

const DENY = [/\brm\s+-rf\s+[\/~]/i, /\bformat\s+[a-z]:/i, /\bmkfs\b/i, /\bshutdown\b/i, /\breboot\b/i, /:\(\)\s*\{/, /\bdel\s+\/s\b/i, /\bRemove-Item\b.*-Recurse.*[A-Z]:\\\s*$/i];
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.venv']);
const SECRET = /(^|[\\/])(\.env(?!(?:\.example|\.sample|\.template)(?:$|[\\/]))[^\\/]*|\.npmrc|\.pypirc|\.netrc|\.git-credentials|\.aws|\.ssh|\.kube[\\/]config|\.docker[\\/]config\.json|\.git[\\/]config|id_(?:rsa|dsa|ecdsa|ed25519)(?:_sk)?(?:\.(?:bak|old|backup|orig)|~)?(?:$|[\\/])|[^\\/]*private[-_]key[^\\/]*|[^\\/]*\.(?:pem|key|p12|pfx|der)|[^\\/]*service[-_]account[^\\/]*\.json)(?=[\\/]|$)/i;
const RISKY = /(^|\/)(\.git|\.github|\.vscode|\.husky)(\/|$)|(^|\/)(package\.json|.*lock.*|Makefile|Dockerfile.*|(?:docker-)?compose\.[^/]+|\.gitlab-ci\.yml|Jenkinsfile)$/i;

class Workspace {
  constructor(root) {
    this.root = root ? path.resolve(root) : null;
  }
  ensure() {
    if (!this.root) throw new Error('No project folder is set. Choose one in Settings → General.');
    if (!fs.existsSync(this.root) || !fs.statSync(this.root).isDirectory()) throw new Error('The project folder is unavailable. Reconnect its drive or choose an existing folder in Settings.');
  }
  resolve(p = '.') {
    this.ensure();
    if (typeof p !== 'string' || p.length > 2048 || /[\x00-\x1f]/.test(p)) throw new Error('Invalid file path.');
    // Reject Windows path aliases on every platform, including ADS and 8.3 names.
    if (p.replace(/\\/g, '/').split('/').some(n => n !== '.' && n !== '..' && (/[. ]$/.test(n) || /:|~\d/.test(n)))) throw new Error('Refused: ambiguous file path alias.');
    const full = path.resolve(this.root, p || '.');
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
  openEditor(p, limit = 400000) {
    const full = this.resolve(p);
    if (SECRET.test(this.rel(full))) throw new Error('Refused: this file may contain secrets.');
    const st = fs.statSync(full);
    if (!st.isFile()) throw new Error('Choose a text file.');
    const fd = fs.openSync(full, 'r'), buffer = Buffer.alloc(Math.min(st.size, limit));
    let bytes;
    try { bytes = fs.readSync(fd, buffer, 0, buffer.length, 0); } finally { fs.closeSync(fd); }
    const raw = buffer.subarray(0, bytes);
    let text = '', reason = st.size > limit ? 'Large file: preview only. Open it in your external editor.' : '';
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(raw); if (raw.includes(0)) throw new Error('Binary file'); }
    catch { reason = 'Binary or unsupported text encoding: preview only.'; text = '[Binary file — open in an external editor]'; }
    const version = require('crypto').createHash('sha256').update(raw).digest('hex');
    return { text, reason, readOnly: !!reason, version, eol: text.includes('\r\n') ? '\r\n' : '\n', bytes: st.size };
  }
  saveEditor(p, text, version = null) {
    const full = this.resolve(p);
    if (version !== null) {
      const current = this.openEditor(p);
      if (current.readOnly) throw new Error(current.reason);
      if (current.version !== version) throw new Error('This file changed outside the laptop. Reopen it before saving.');
      text = text.replace(/\r?\n/g, current.eol);
      this.writeFile(p, text);
    } else {
      if (SECRET.test(this.rel(full))) throw new Error('Refused: this file may contain secrets.');
      if (Buffer.byteLength(text) > 1000000) throw new Error('File content exceeds 1 MB.');
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, text, { encoding: 'utf8', flag: 'wx' });
    }
    return this.openEditor(p);
  }
  listDir(p = '.', depth = 2) {
    const base = this.resolve(p);
    depth = Math.max(1, Math.min(3, Number(depth) || 2));
    const out = [];
    const walk = (dir, d) => {
      let ents = [];
      try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      ents.sort((a, b) => (b.isDirectory() - a.isDirectory()) || a.name.localeCompare(b.name));
      for (const e of ents) {
        if (out.length >= 400) return;
        if (SKIP.has(e.name) || SECRET.test(this.rel(path.join(dir, e.name))) || /[. ]$|:|~\d/.test(e.name) || e.isSymbolicLink()) continue;
        const full = path.join(dir, e.name);
        out.push({ path: this.rel(full), dir: e.isDirectory() });
        if (out.length > 400) return;
        if (e.isDirectory() && d > 1) walk(full, d - 1);
      }
    };
    walk(base, depth);
    return out;
  }
  listPage(p = '.', offset = 0) {
    const base = this.resolve(p);
    const entries = fs.readdirSync(base, { withFileTypes: true }).filter(e => !SKIP.has(e.name) && !SECRET.test(this.rel(path.join(base,e.name))) && !/[. ]$|:|~\d/.test(e.name) && !e.isSymbolicLink());
    entries.sort((a,b) => (b.isDirectory()-a.isDirectory()) || a.name.localeCompare(b.name));
    const page=entries.slice(offset,offset+400).map(e=>({path:this.rel(path.join(base,e.name)),dir:e.isDirectory()}));
    return { entries:page, total:entries.length, next:offset+400<entries.length ? offset+400 : null };
  }
  readFile(p, max = 60000) {
    const full = this.resolve(p);
    if (SECRET.test(this.rel(full))) throw new Error('Refused: this file may contain secrets.');
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
  writeFile(p, content, exclusive = false) {
    const full = this.resolve(p);
    if (SECRET.test(this.rel(full))) throw new Error('Refused: this file may contain secrets.');
    const value = String(content ?? '');
    const bytes = Buffer.byteLength(value);
    if (bytes > 1000000) throw new Error('Refused: file content exceeds the 1 MB limit.');
    fs.mkdirSync(path.dirname(full), { recursive: true });
    const existed = fs.existsSync(full);
    fs.writeFileSync(full, value, { encoding: 'utf8', flag: exclusive ? 'wx' : 'w' });
    return { path: this.rel(full), bytes, created: !existed };
  }
  runCommand(cmd, { timeoutMs = 120000, signal, founder = false } = {}) {
    this.ensure();
    if (typeof cmd !== 'string' || !cmd.trim() || cmd.length > (founder ? 20000 : 300)) return Promise.resolve({ code: -1, stdout: '', stderr: 'Refused: command exceeds the review limit.' });
    if (DENY.some(r => r.test(cmd))) return Promise.resolve({ code: -1, stdout: '', stderr: 'Refused: this command is on the blocked list.' });
    return new Promise(resolve => {
      let child, out = '', err = '', done = false, t, stopping = false;
      const finish = value => { if (done) return; done = true; clearTimeout(t); signal?.removeEventListener('abort', abort); resolve(value); };
      const stop = async message => { if (done || stopping) return; stopping = true; await stopTree(child); finish({ code: -1, stdout: out, stderr: message }); };
      const abort = () => { stop('[cancelled]'); };
      if (signal?.aborted) { abort(); return; }
      child = spawn(cmd, { cwd: this.root, shell: true, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'], env: { ...cleanEnvironment(), CI: '1' } });
      const cap = (s, d) => { const value = s + d; return value.length <= 20000 ? value : value.slice(0, 6000) + '\n…[output omitted]…\n' + value.slice(-13000); };
      child.stdout.on('data', d => { out = cap(out, d.toString()); });
      child.stderr.on('data', d => { err = cap(err, d.toString()); });
      t = setTimeout(() => { stop(err.length > 7800 ? err.slice(0, 1800) + '\n…\n' + err.slice(-5900) + '\n[timed out]' : err + '\n[timed out]'); }, timeoutMs);
      signal?.addEventListener('abort', abort, { once: true });
      child.on('close', code => { if (!stopping) finish({ code, stdout: out, stderr: err.length > 8000 ? err.slice(0, 2000) + '\n…\n' + err.slice(-5900) : err }); });
      child.on('error', e => { if (!stopping) finish({ code: -1, stdout: out, stderr: String(e.message) }); });
    });
  }
}
module.exports = { Workspace, SECRET, riskyWrite: p => RISKY.test(p), displayCommand: command => command.replace(/[^\x20-\x7e]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')) };
