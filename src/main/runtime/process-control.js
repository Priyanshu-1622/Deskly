const { spawn } = require('child_process');

// Keep login through the CLI's own credential store; do not inherit API secrets.
function cleanEnvironment(source = process.env) {
  const allowed = /^(PATH|PATHEXT|SystemRoot|WINDIR|SystemDrive|ComSpec|TEMP|TMP|TMPDIR|HOME|USERPROFILE|HOMEDRIVE|HOMEPATH|APPDATA|LOCALAPPDATA|ProgramFiles|ProgramFiles\(x86\)|ProgramData|USER|USERNAME|SHELL|LANG|LC_[A-Z_]+|TERM|COLORTERM|CI|NODE_ENV|CODEX_HOME|XDG_CONFIG_HOME|XDG_CACHE_HOME|XDG_DATA_HOME|CARGO_HOME|RUSTUP_HOME|npm_config_cache)$/i;
  return Object.fromEntries(Object.entries(source).filter(([key]) => allowed.test(key) && !/(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(key)));
}
function stopTree(child) {
  if (!child?.pid) return Promise.resolve();
  if (process.platform === 'win32') {
    return new Promise(resolve => {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      const timer = setTimeout(() => { try { child.kill(); } catch {} resolve(); }, 3000);
      const done = () => { clearTimeout(timer); resolve(); }; killer.once('error', done); killer.once('close', done);
    });
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch {} }
    return Promise.resolve();
  }
}
module.exports = { cleanEnvironment, stopTree };
