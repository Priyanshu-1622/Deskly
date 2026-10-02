const fs = require('node:fs');
const os = require('node:os');
const TASK_STATES = ['created','queued','planning','running','waiting_for_approval','reviewing','completed','failed','cancelled','interrupted'];

// Build from an allowlist. Never serialize configuration, logs, paths or errors.
function diagnostics({ version, config = {}, runtime, encrypted, crashes = 0 }) {
  let workspaceAccessible = false;
  try { workspaceAccessible = !!config.workspace && fs.statSync(config.workspace).isDirectory(); } catch {}
  const taskCounts = Object.fromEntries(TASK_STATES.map(state => [state, 0]));
  for (const task of runtime.tasks.values()) if (Object.hasOwn(taskCounts, task.status)) taskCounts[task.status]++;
  const providers = {};
  for (const employee of config.employees || []) {
    const provider = ['demo','openai','anthropic','gemini','openrouter','ollama','custom','codex_cli','claude_code'].includes(employee.provider) ? employee.provider : 'other';
    providers[provider] = (providers[provider] || 0) + 1;
  }
  return {
    schemaVersion: 1, generatedAt: new Date().toISOString(), appVersion: version,
    system: { platform: process.platform, architecture: process.arch, osRelease: os.release(), electron: process.versions.electron || null, node: process.versions.node },
    health: { secureKeyStorage: !!encrypted, workspaceConfigured: !!config.workspace, workspaceAccessible, pendingSaveError: !!runtime.lastSaveError || !!runtime.team.lastSaveError, recoveredDataNotices: runtime.notices.length, recentRendererCrashes: crashes },
    office: { employees: (config.employees || []).length, providers, quality: ['low','balanced','high','ultra'].includes(config.settings?.quality) ? config.settings.quality : 'balanced', automaticPerformance: config.settings?.smoothPerformance !== false },
    activity: { tasks: taskCounts, activeProviderCalls: runtime.callsActive, pendingApprovals: [...runtime.approvals.values()].filter(a => a.status === 'pending').length, projectDiscussions: runtime.groups.list().length },
    excludes: ['API keys','names','project paths','file content','prompts','memories','conversations','command output','provider endpoints','raw error messages']
  };
}
module.exports = { diagnostics };
