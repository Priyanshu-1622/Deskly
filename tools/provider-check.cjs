// Explicit live check: keys are read from environment, never printed or saved.
const { testProfile } = require('../src/main/runtime/providers');
const providers = ['openai', 'anthropic', 'gemini', 'openrouter', 'ollama', 'custom', 'codex_cli', 'claude_code'];
async function main() {
  const selected = (process.env.DESKLY_LIVE_PROVIDERS || '').split(',').filter(Boolean);
  if (!selected.length) { console.log('Set DESKLY_LIVE_PROVIDERS to a comma-separated provider list. HTTP tests make one small live request per provider. Use DESKLY_<PROVIDER>_KEY, _MODEL and _URL variables. CLI checks inspect installed login only.'); return; }
  for (const provider of selected) {
    if (!providers.includes(provider)) throw new Error('Unknown requested provider.');
    const prefix = 'DESKLY_' + provider.toUpperCase();
    try { const result = await testProfile({ provider, apiKey: process.env[prefix + '_KEY'] || '', model: process.env[prefix + '_MODEL'] || '', baseUrl: process.env[prefix + '_URL'] || '' }); console.log(JSON.stringify({ provider, ok: result.ok, ms: result.ms })); }
    catch (e) { console.log(JSON.stringify({ provider, ok: false, code: e.code || 'connection_failed' })); process.exitCode = 1; }
  }
}
main().catch(() => { console.error('Provider check configuration failed.'); process.exitCode = 1; });
