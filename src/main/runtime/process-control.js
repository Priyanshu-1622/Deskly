const { spawn } = require('child_process');

// Keep login through the CLI's own credential store; do not inherit API secrets.
function cleanEnvironment(source = process.env) {
  const allowed = /^(PATH|PATHEXT|SystemRoot|WINDIR|SystemDrive|ComSpec|TEMP|TMP|TMPDIR|HOME|USERPROFILE|HOMEDRIVE|HOMEPATH|APPDATA|LOCALAPPDATA|ProgramFiles|ProgramFiles\(x86\)|ProgramData|USER|USERNAME|SHELL|LANG|LC_[A-Z_]+|TERM|COLORTERM|CI|NODE_ENV|CODEX_HOME|XDG_CONFIG_HOME|XDG_CACHE_HOME|XDG_DATA_HOME|CARGO_HOME|RUSTUP_HOME|npm_config_cache)$/i;
  const build = /^(JAVA_HOME|GOPATH|GOROOT|NVM_DIR|NVM_HOME|NVM_SYMLINK|PNPM_HOME|VIRTUAL_ENV|CONDA_PREFIX|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY|SSL_CERT_FILE|SSL_CERT_DIR|NODE_EXTRA_CA_CERTS)$/i;
  return Object.fromEntries(Object.entries(source).filter(([key, value]) => (allowed.test(key) || build.test(key)) && !/(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(key) && (!/^(?:HTTP|HTTPS|ALL)_PROXY$/i.test(key) || !/^[a-z]+:\/\/[^/]*@/i.test(value))));
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
