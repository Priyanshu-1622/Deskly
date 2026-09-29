// Provider adapters. Every AI employee (and your own assistant) can use a
// different provider, model and API key. All calls happen in the main process.
const PROVIDERS = {
  anthropic: { label: 'Anthropic (Claude)', defaultModel: 'claude-sonnet-5-5', needsKey: true },
  openai: { label: 'OpenAI', defaultModel: 'gpt-4o-mini', needsKey: true, baseUrl: 'https://api.openai.com/v1' },
  gemini: { label: 'Google Gemini', defaultModel: 'gemini-3.5-flash-lite', needsKey: true, baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  openrouter: { label: 'OpenRouter', defaultModel: 'anthropic/claude-sonnet-4.5', needsKey: true, baseUrl: 'https://openrouter.ai/api/v1' },
  ollama: { label: 'Ollama (local)', defaultModel: 'llama3.1', needsKey: false, baseUrl: 'http://localhost:11434/v1' },
  custom: { label: 'OpenAI-compatible (custom URL)', defaultModel: '', needsKey: false },
  demo: { label: 'Demo (no AI, simulated)', defaultModel: 'demo', needsKey: false }
};

class ProviderError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}
const tokenCount = value => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;

async function httpJSON(url, opts, signal) {
  let res;
  try { res = await fetch(url, { ...opts, signal }); }
  catch (e) {
    if (e.name === 'AbortError') throw new ProviderError('Cancelled', 'cancelled');
    throw new ProviderError(`Could not reach ${new URL(url).host}. Check your connection.`, 'network');
  }
  const text = await res.text();
  let body = null; try { body = JSON.parse(text); } catch { }
  if (!res.ok) {
    const msg = body?.error?.message || body?.message || text.slice(0, 200);
    const code = res.status === 401 || res.status === 403 ? 'auth' : res.status === 429 ? 'rate_limited' : res.status === 404 ? 'not_found' : 'upstream';
    const geminiModel = url.includes('generativelanguage.googleapis.com') && code === 'not_found';
    const human = geminiModel
      ? `Gemini could not find or access this model. In Settings, set Model to gemini-3.5-flash-lite and test again. Google limits access to some older 2.5 models. Details: ${msg}`
      : ({ auth: 'The API key was rejected. Update it in Settings → Team.', rate_limited: 'The provider is rate limiting this key. Try again in a minute.', not_found: `Model or endpoint not found: ${msg}` }[code] || `Provider error (${res.status}): ${msg}`);
    throw new ProviderError(human, code);
  }
  return body;
}

/**
 * chat(profile, { system, messages, maxTokens }, signal) -> string
 * profile: { provider, model, baseUrl, apiKey }
 */
async function chat(profile, { system, messages, maxTokens = 2048 }, signal, onUsage) {
  const p = PROVIDERS[profile.provider] || PROVIDERS.demo;
  const model = profile.model || p.defaultModel;
  if (profile.provider === 'demo') return demoReply(system, messages);
  if (p.needsKey && !profile.apiKey) throw new ProviderError('No API key set for this employee. Add one in Settings → Team.', 'no_key');
  if (profile.provider === 'anthropic') {
    const body = await httpJSON('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': profile.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages })
    }, signal);
    try { onUsage?.({ input: tokenCount(body.usage?.input_tokens) + tokenCount(body.usage?.cache_creation_input_tokens) + tokenCount(body.usage?.cache_read_input_tokens), output: tokenCount(body.usage?.output_tokens), cached: tokenCount(body.usage?.cache_read_input_tokens) }); } catch { }
    return (body.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  }
  const base = (profile.baseUrl || p.baseUrl || '').replace(/\/$/, '');
  if (!base) throw new ProviderError('Set a base URL for this custom provider.', 'config');
  const headers = { 'content-type': 'application/json' };
  if (profile.apiKey) headers.authorization = `Bearer ${profile.apiKey}`;
  const outputLimit = Math.max(1, Math.min(4096, Number(maxTokens) || 2048));
  const body = await httpJSON(`${base}/chat/completions`, {
    method: 'POST', headers,
    body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, ...messages],
      ...(profile.provider === 'openai' ? { max_completion_tokens: outputLimit } : { max_tokens: outputLimit }) })
  }, signal);
  try { onUsage?.({ input: tokenCount(body.usage?.prompt_tokens ?? body.usage?.input_tokens), output: tokenCount(body.usage?.completion_tokens ?? body.usage?.output_tokens), cached: tokenCount(body.usage?.prompt_tokens_details?.cached_tokens ?? body.usage?.input_tokens_details?.cached_tokens) }); } catch { }
  return body.choices?.[0]?.message?.content || '';
}

function parseJSON(text) {
  const t = String(text).trim();
  const tries = [t, (t.match(/```(?:json)?\s*([\s\S]*?)```/) || [])[1]];
  const a = t.search(/[[{]/), b = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (a >= 0 && b > a) tries.push(t.slice(a, b + 1));
  for (const s of tries) { if (!s) continue; try { return JSON.parse(s); } catch { } }
  throw new ProviderError('The model replied with something that is not valid JSON.', 'invalid_json');
}

// Deterministic stand-in so the whole app works without any key. Progress is
// derived from this task's messages, so simultaneous demo employees do not
// share a global counter.
function demoReply(system, messages) {
  const last = messages[messages.length - 1]?.content || '';
  if (/PLAN_REQUEST/.test(last)) {
    return JSON.stringify({ title: 'Demo task', steps: [{ label: 'Look at the workspace' }, { label: 'Write the deliverable' }, { label: 'Share it with the team', sensitive: true, action: { kind: 'share_externally', summary: 'Post the summary in the team channel', risk: 'low' } }] });
  }
  if (messages.some(m => /AGENT_TURN/.test(m.content || ''))) {
    const n = messages.filter(m => m.role === 'user' && /^TOOL_RESULT/.test(m.content || '')).length + 1;
    const employee = (system.match(/^You are ([^,]+)/) || [,'employee'])[1].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (n === 1) return JSON.stringify({ log: 'Checking what is in the workspace', tool: { name: 'list_dir', args: { path: '.' } } });
    if (n === 2) return JSON.stringify({ log: 'Writing the demo deliverable', tool: { name: 'write_file', args: { path: `deskly-output/${employee}-demo-note.md`, content: '# Demo note\n\nThis file was written by a Deskly employee running in demo mode.\n' } } });
    if (n === 3) return JSON.stringify({ log: 'Asking before sharing', tool: { name: 'request_action', args: { kind: 'share_externally', summary: 'Post the summary in the team channel', risk: 'low', content: 'Demo summary' } } });
    return JSON.stringify({ done: true, summary: 'Demo run finished. Add an API key to do real work.', result: 'Demo mode shows the full flow — planning, tools, approval, result — without calling any AI. Add a key for this employee in Settings → Team.' });
  }
  return 'I\'m running in demo mode. Give me an API key in Settings → Team and I can really help.';
}

async function testProfile(profile) {
  const t0 = Date.now();
  const text = await chat(profile, { system: 'Reply with the single word: ready', messages: [{ role: 'user', content: 'Say ready.' }], maxTokens: 256 });
  if (!text.trim()) throw new ProviderError('The provider returned no text. Try another model or test again.', 'empty_response');
  return { ok: true, ms: Date.now() - t0, sample: text.slice(0, 40) };
}

module.exports = { PROVIDERS, chat, parseJSON, testProfile, ProviderError };
