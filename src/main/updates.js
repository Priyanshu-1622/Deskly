// Only the packaged Windows app can update; the renderer cannot choose a feed.
class Updates {
  constructor({ updater, enabled, notify = () => {}, busy = () => false, confirm, prepare }) {
    Object.assign(this, { updater, enabled, notify, busy, confirm, prepare });
    this.state = { status: enabled ? 'idle' : 'unavailable', version: null, percent: 0 };
    this.pending = null; this.installing = false;
    if (!enabled) return;
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = false;
    updater.allowDowngrade = false;
    updater.allowPrerelease = false;
    // Do not record provider URLs, headers or local paths in app logs.
    updater.logger = null;
    updater.on('checking-for-update', () => this.set({ status: 'checking' }));
    updater.on('update-available', info => this.set({ status: 'downloading', version: info.version, percent: 0 }));
    updater.on('download-progress', info => this.set({ status: 'downloading', percent: Math.round(info.percent) }));
    updater.on('update-not-available', () => this.set({ status: 'current', version: null }));
    updater.on('update-downloaded', info => this.set({ status: 'ready', version: info.version, percent: 100 }));
    updater.on('error', () => this.set({ status: 'error', message: 'Update failed. Check your connection and try again, or download from GitHub Releases.' }));
  }
  set(patch) { this.state = { ...this.state, message: '', ...patch }; this.notify(this.snapshot()); }
  snapshot() { return { ...this.state }; }
  check() {
    if (!this.enabled || this.installing || ['ready','downloading'].includes(this.state.status)) return Promise.resolve(this.snapshot());
    if (this.pending) return this.pending;
    this.pending = Promise.resolve().then(() => this.updater.checkForUpdates()).catch(() => {
      this.set({ status: 'error', message: 'Could not check for updates. Try again when you are online.' });
    }).then(() => this.snapshot()).finally(() => { this.pending = null; });
    return this.pending;
  }
  async install() {
    if (!this.enabled || this.state.status !== 'ready' || this.installing) return false;
    this.installing = true;
    try {
      if (this.busy()) throw Error('Finish or stop active tasks, conversations and commands before updating.');
      if (!await this.confirm()) return false;
      if (this.busy()) throw Error('Work started while confirming. Finish or stop it before updating.');
      await this.prepare();
      this.updater.quitAndInstall(false, true);
      return true;
    } finally { this.installing = false; }
  }
}
module.exports = { Updates };
