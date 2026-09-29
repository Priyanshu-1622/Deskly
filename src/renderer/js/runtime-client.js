/* Renderer-side mirror of the main-process runtime. The office and UI read
   task state from here; every change goes through the secure bridge. */
(function () {
  const ACTIVE = new Set(['created', 'queued', 'planning', 'running', 'waiting_for_approval', 'reviewing']);
  class EventBus {
    constructor() { this.h = new Map(); }
    on(t, fn) { (this.h.get(t) || this.h.set(t, []).get(t)).push(fn); return () => { const a = this.h.get(t); a.splice(a.indexOf(fn) >>> 0, 1); }; }
    emit(t, evt) { for (const k of [t, '*']) (this.h.get(k) || []).slice().forEach(fn => { try { fn(evt); } catch (e) { console.error(e); } }); }
  }
  class RuntimeClient {
    constructor(bus, onError) { this.bus = bus; this.tasks = new Map(); this.approvals = []; this.onError = onError || (() => { }); }
    async init() {
      const s = await DK.tasksSnapshot();
      this.tasks.clear(); s.tasks.forEach(t => this.tasks.set(t.id, t)); this.approvals = s.approvals;
      if (!this.unsub) this.unsub = DK.onRuntimeEvent(evt => {
        if (evt.task) this.tasks.set(evt.task.id, evt.task);
        if (evt.approvals) this.approvals = evt.approvals;
        if (evt.type === 'runtime.history_cleared') this.init();
        this.bus.emit(evt.type, evt);
      });
    }
    list() { return [...this.tasks.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
    get(id) { return this.tasks.get(id); }
    activeFor(id) { return this.list().find(t => t.employeeId === id && ACTIVE.has(t.status)); }
    latestFor(id) { return this.list().find(t => t.employeeId === id); }
    pendingApprovals() { return this.approvals; }
    create({ employee, description }) { return DK.tasksCreate(employee.id, description).catch(e => { this.onError(e.message); return null; }); }
    respondApproval(id, d) { return DK.approvalRespond(id, d); }
    cancel(id) { return DK.tasksCancel(id); }
    markReviewed(id) { return DK.tasksReviewed(id); }
    clearHistory() { return DK.tasksClear(); }
    save() { }
  }
  const errorCopy = e => (e && (e.message || e.error)) || 'Something went wrong.';
  window.DesklyRuntime = { EventBus, RuntimeClient, ACTIVE, errorCopy };
})();
