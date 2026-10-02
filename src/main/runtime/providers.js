// Provider adapters. Every AI employee (and your own assistant) can use a
// different provider, model and API key. All calls happen in the main process.
const { chatCli, testCli } = require('./cli-providers');
const PROVIDERS = {
  anthropic: { label: 'Anthropic (Claude)', defaultModel: 'claude-sonnet-5-5', needsKey: true },
  openai: { label: 'OpenAI', defaultModel: 'gpt-4o-mini', needsKey: true, baseUrl: 'https://api.openai.com/v1' },
  gemini: { label: 'Google Gemini', defaultModel: 'gemini-3.5-flash-lite', needsKey: true, baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  openrouter: { label: 'OpenRouter', defaultModel: 'anthropic/claude-sonnet-4.5', needsKey: true, baseUrl: 'https://openrouter.ai/api/v1' },
  ollama: { label: 'Ollama (local)', defaultModel: 'llama3.1', needsKey: false, baseUrl: 'http://localhost:11434/v1' },
  custom: { label: 'OpenAI-compatible (custom URL)', defaultModel: '', needsKey: false },
  codex_cli: { label: 'Codex CLI (installed login)', defaultModel: '', needsKey: false, localCli: true },
  claude_code: { label: 'Claude Code (installed login)', defaultModel: '', needsKey: false, localCli: true },
  demo: { label: 'Demo (no AI, simulated)', defaultModel: 'demo', needsKey: false }
};

class ProviderError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}
const tokenCount = value => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
function endpointFor(profile) {
  const p = PROVIDERS[profile.provider];
  if (!p) throw new ProviderError('Unknown AI provider.', 'config');
  if (p.localCli || profile.provider === 'demo') return profile.provider;
  const raw = profile.provider === 'anthropic' ? 'https://api.anthropic.com/v1' : ['custom', 'ollama'].includes(profile.provider) ? (profile.baseUrl || p.baseUrl) : p.baseUrl;
  let url;
  try { url = new URL(raw); } catch { throw new ProviderError('Set a valid provider base URL.', 'config'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || !(url.protocol === 'https:' || (url.protocol === 'http:' && local))) throw new ProviderError('Provider URLs require HTTPS, except HTTP on localhost. Credentials, query strings and fragments are not allowed.', 'config');
  return url.href.replace(/\/+$/, '');
}

function bindTestProfile(request, saved, key) {
  const p = { ...request };
  if (!p.apiKey && saved && p.provider === (saved.provider || 'demo') && endpointFor(p) === endpointFor({ ...saved, provider: saved.provider || 'demo' })) p.apiKey = key || '';
  return p;
}

async function httpJSON(url, opts, signal) {
  const ctl = new AbortController();
  const abort = () => ctl.abort(signal?.reason);
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => ctl.abort(new Error('Provider request timed out.')), 120000);
  try { return await requestJSON(url, opts, ctl.signal, signal); }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
async function requestJSON(url, opts, signal, callerSignal) {
  let res;
  for (let attempt = 0; attempt < 3; attempt++) {
  try { res = await fetch(url, { ...opts, signal, redirect: 'error' }); }
  catch (e) {
    if (signal.aborted) throw new ProviderError(callerSignal?.aborted ? 'Cancelled' : 'Provider request timed out.', callerSignal?.aborted ? 'cancelled' : 'timeout');
    throw new ProviderError(`Could not reach ${new URL(url).host}. Check your connection.`, 'network');
  }
  if (!(res.status === 429 || res.status >= 500) || attempt === 2) break;
  const retry = res.headers?.get('retry-after');
  const seconds = Number(retry);
  const delay = Math.min(10000, Math.max(0, retry && !Number.isFinite(seconds) ? Date.parse(retry) - Date.now() : retry ? seconds * 1000 : 500 * 2 ** attempt));
  await res.body?.cancel();
  await new Promise((resolve, reject) => {
    const onAbort = () => { clearTimeout(t); signal.removeEventListener('abort', onAbort); reject(new ProviderError(callerSignal?.aborted ? 'Cancelled' : 'Provider request timed out.', callerSignal?.aborted ? 'cancelled' : 'timeout')); };
    const t = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, delay);
    if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, { once: true });
  });
  }
  let text = '';
  if (res.body?.getReader) {
    const reader = res.body.getReader(); let bytes = 0;
    try {
      const decoder = new TextDecoder();
      while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > 3000000) { await reader.cancel(); throw new ProviderError('Provider response exceeded 3 MB.', 'response_size'); } text += decoder.decode(value, { stream: true }); }
      text += decoder.decode();
    } catch (e) { if (signal.aborted) throw new ProviderError(callerSignal?.aborted ? 'Cancelled' : 'Provider request timed out.', callerSignal?.aborted ? 'cancelled' : 'timeout'); throw e; }
  } else { text = await res.text(); if (Buffer.byteLength(text) > 3000000) throw new ProviderError('Provider response exceeded 3 MB.', 'response_size'); }
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
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ProviderError('Provider returned an invalid JSON response.', 'invalid_json');
  return body;
}

/**
 * chat(profile, { system, messages, maxTokens }, signal) -> string
 * profile: { provider, model, baseUrl, apiKey }
 */
async function chat(profile, { system, messages, maxTokens = 2048 }, signal, onUsage) {
  const endpoint = endpointFor(profile);
  const p = PROVIDERS[profile.provider];
  const model = profile.model || p.defaultModel;
  if (profile.provider === 'demo') return demoReply(system, messages);
  if (p.localCli) return chatCli(profile, { system, messages, maxTokens }, signal, onUsage);
  if (p.needsKey && !profile.apiKey) throw new ProviderError('No API key set for this employee. Add one in Settings → Team.', 'no_key');
  if (profile.provider === 'anthropic') {
    const body = await httpJSON('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': profile.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages })
    }, signal);
    try { onUsage?.({ input: tokenCount(body.usage?.input_tokens) + tokenCount(body.usage?.cache_creation_input_tokens) + tokenCount(body.usage?.cache_read_input_tokens), output: tokenCount(body.usage?.output_tokens), cached: tokenCount(body.usage?.cache_read_input_tokens) }); } catch { }
    if (body.stop_reason === 'max_tokens') throw new ProviderError('The reply was cut off. Write a smaller chunk, then append the next chunk.', 'truncated_response');
    const text = (body.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    if (!text.trim()) throw new ProviderError('The provider returned no text. Try another model.', 'empty_response');
    return text;
  }
  const base = endpoint;
  if (!base) throw new ProviderError('Set a base URL for this custom provider.', 'config');
  const headers = { 'content-type': 'application/json' };
  if (profile.apiKey) headers.authorization = `Bearer ${profile.apiKey}`;
  const outputLimit = completionBudget(profile, maxTokens);
  const body = await httpJSON(`${base}/chat/completions`, {
    method: 'POST', headers,
    body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, ...messages],
      ...(profile.provider === 'openai' ? { max_completion_tokens: outputLimit } : { max_tokens: outputLimit }) })
  }, signal);
  try { onUsage?.({ input: tokenCount(body.usage?.prompt_tokens ?? body.usage?.input_tokens), output: tokenCount(body.usage?.completion_tokens ?? body.usage?.output_tokens), cached: tokenCount(body.usage?.prompt_tokens_details?.cached_tokens ?? body.usage?.input_tokens_details?.cached_tokens) }); } catch { }
  if (body.choices?.[0]?.finish_reason === 'length') throw new ProviderError('The reply was cut off. Write a smaller chunk, then append the next chunk.', 'truncated_response');
  const text = body.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new ProviderError('The provider returned no text. Try another model.', 'empty_response');
  return text;
}

function parseJSON(text) {
  const t = String(text).trim();
  try { const direct = JSON.parse(t); if (!direct || typeof direct !== 'object' || Array.isArray(direct)) throw new ProviderError('The model must reply with a JSON object.', 'invalid_json'); return direct; }
  catch (e) { if (e instanceof ProviderError) throw e; }
  const tries = [t, (t.match(/```(?:json)?\s*([\s\S]*?)```/) || [])[1]];
  // Balance braces while respecting quoted strings; prose like "Step [1]" is harmless.
  for (let start = t.indexOf('{'), attempts = 0; start >= 0 && attempts < 8; start = t.indexOf('{', start + 1), attempts++) {
    let depth = 0, quoted = false, escaped = false;
    for (let i = start; i < t.length; i++) {
      const c = t[i];
      if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; continue; }
      if (c === '"') quoted = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) { tries.push(t.slice(start, i + 1)); break; }
    }
  }
  for (const s of tries) { if (!s) continue; try { const value = JSON.parse(s); if (value && typeof value === 'object' && !Array.isArray(value)) return value; } catch { } }
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

async function testProfile(profile, signal) {
  if (PROVIDERS[profile.provider]?.localCli) return testCli(profile, undefined, signal);
  const t0 = Date.now();
  const text = await chat(profile, { system: 'Reply with the single word: ready', messages: [{ role: 'user', content: 'Say ready.' }], maxTokens: 256 }, signal);
  if (!text.trim()) throw new ProviderError('The provider returned no text. Try another model or test again.', 'empty_response');
  return { ok: true, ms: Date.now() - t0, sample: text.slice(0, 40) };
}

function completionBudget(profile, requested = 2048) {
  const model = profile.model || PROVIDERS[profile.provider]?.defaultModel || '';
  const reasoning = profile.provider === 'gemini' || profile.provider === 'openai' && /^(?:gpt-5|o[134])(?:[-.]|$)/i.test(model);
  return Math.max(reasoning ? 4096 : 1, Math.min(16384, Number(requested) || 2048));
}
module.exports = { PROVIDERS, chat, parseJSON, testProfile, ProviderError, endpointFor, bindTestProfile, completionBudget };
