const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function quarantine(file, notices) {
  const archive = `${file}.corrupt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  try {
    fs.renameSync(file, archive);
    notices.push(`Recovered from damaged data. The original is preserved at ${archive}.`);
  } catch {
    notices.push(`Damaged data could not be moved; the original remains at ${file}. Check file permissions.`);
  }
}
function readRecover(file, fallback, validate = () => true, notices = []) {
  for (const candidate of [file, file + '.bak']) {
    try {
      const value = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      if (!validate(value)) throw new Error('Invalid saved data');
      if (candidate !== file) notices.push(`Restored ${path.basename(file)} from its backup.`);
      return value;
    } catch (e) {
      if (e.code !== 'ENOENT') {
        quarantine(candidate, notices);
      }
    }
  }
  return typeof fallback === 'function' ? fallback() : fallback;
}
function atomicSync(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value));
  if (fs.existsSync(file)) {
    try { JSON.parse(fs.readFileSync(file, 'utf8')); fs.copyFileSync(file, file + '.bak'); }
    catch (e) { if (!(e instanceof SyntaxError)) throw e; fs.copyFileSync(file, `${file}.corrupt-${Date.now()}`); }
  }
  for (let attempt = 0; ; attempt++) {
    try { fs.renameSync(temp, file); break; }
    catch (e) { if (attempt >= 3 || !['EPERM', 'EACCES', 'EBUSY'].includes(e.code)) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25 * (attempt + 1)); }
  }
}
class BufferedJSON {
  constructor(file, snapshot, onError) { Object.assign(this, { file, snapshot, onError }); this.queue = Promise.resolve(); }
  schedule() { clearTimeout(this.timer); this.timer = setTimeout(() => { this.timer = null; this.flush().catch(() => {}); }, 300); this.timer.unref?.(); }
  flush() {
    clearTimeout(this.timer); this.timer = null;
    this.queue = this.queue.catch(() => {}).then(async () => {
      const data = JSON.stringify(this.snapshot());
      const temp = `${this.file}.${process.pid}.tmp`;
      await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
      await fs.promises.writeFile(temp, data);
      try { const previous = JSON.parse(await fs.promises.readFile(this.file, 'utf8')); if (this.backupTransform) await fs.promises.writeFile(this.file + '.bak', JSON.stringify(this.backupTransform(previous))); else await fs.promises.copyFile(this.file, this.file + '.bak'); } catch (e) { if (e.code !== 'ENOENT') this.onError?.(e); }
      for (let attempt = 0; ; attempt++) {
        try { await fs.promises.rename(temp, this.file); break; }
        catch (e) { if (attempt >= 3 || !['EPERM', 'EACCES', 'EBUSY'].includes(e.code)) throw e; await new Promise(resolve => setTimeout(resolve, 25 * (attempt + 1))); }
      }
    }).catch(e => { this.onError?.(e); throw e; });
    return this.queue;
  }
}
module.exports = { readRecover, atomicSync, BufferedJSON };
