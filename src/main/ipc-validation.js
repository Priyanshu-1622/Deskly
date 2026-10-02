const fs = require('fs');
const os = require('os');
const path = require('path');
const { PROVIDERS, endpointFor } = require('./runtime/providers');
const fail = message => { throw new Error('Invalid request: ' + message); };
const object = v => { if (!v || typeof v !== 'object' || Array.isArray(v)) fail('expected an object'); return v; };
const text = (v, max = 2000, empty = true) => { if (typeof v !== 'string' || v.length > max || (!empty && !v.trim()) || v.includes('\0')) fail('invalid text'); return v; };
const id = v => { text(v, 100, false); if (!/^[a-zA-Z0-9_-]+$/.test(v) || ['__proto__', 'constructor', 'prototype'].includes(v)) fail('invalid identifier'); };
const choice = (v, values) => { if (!values.includes(v)) fail('unsupported option'); };
const number = (v, min, max) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail('invalid number'); };
function profile(v) {
  object(v); choice(v.provider || 'demo', Object.keys(PROVIDERS));
  for (const k of ['model', 'lightweightModel']) if (v[k] !== undefined) text(v[k], 150);
  if (v.baseUrl !== undefined) text(v.baseUrl, 2048);
  if (v.apiKey !== undefined) text(v.apiKey, 16000);
  if (v.keyFrom) id(v.keyFrom);
  endpointFor({ ...v, provider: v.provider || 'demo' });
}
function workspacePath(value) {
  text(value, 2048, false);
  const root = path.resolve(value), real = fs.realpathSync(root), norm = s => process.platform === 'win32' ? s.toLowerCase() : s;
  if (!fs.statSync(real).isDirectory()) fail('project folder is unavailable');
  if (norm(real) === norm(path.parse(real).root) || norm(real) === norm(os.homedir())) fail('choose a project folder rather than a drive root or home folder');
  const system = process.platform === 'win32' ? [process.env.SystemRoot, process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.ProgramData].filter(Boolean) : ['/bin', '/sbin', '/etc', '/usr', '/proc', '/sys', '/dev'];
  if (system.some(s => { const rel = path.relative(s, real); return !rel || (!rel.startsWith('..') && !path.isAbsolute(rel)); })) fail('system folders cannot be projects');
  return real;
}
function history(value) {
  if (!Array.isArray(value) || value.length > 100) fail('invalid conversation history');
  for (const row of value) { object(row); choice(row.role, ['user', 'assistant']); text(row.content, 50000); }
}
function config(value) {
  object(value); if (Buffer.byteLength(JSON.stringify(value)) > 1000000) fail('settings are too large');
  if (!Array.isArray(value.employees) || value.employees.length > 50) fail('invalid team');
  for (const k of ['founder', 'company']) if (value[k] !== undefined) text(value[k], 150);
  if (value.workspace !== undefined) text(value.workspace, 2048);
  const ids = new Set(['assistant']);
  for (const e of value.employees) {
    profile(e); id(e.id); if (ids.has(e.id)) fail('duplicate employee identifier'); ids.add(e.id);
    for (const k of ['name', 'role', 'dept', 'room', 'deliverable']) if (e[k] !== undefined) text(e[k], 150);
    for (const k of ['persona', 'scope', 'instructions']) if (e[k] !== undefined) text(e[k], 10000);
    if (e.workArea !== undefined) choice(e.workArea, ['frontend', 'backend', 'shared', 'docs', 'operations']);
    if (e.resume !== undefined) { object(e.resume); for (const list of Object.values(e.resume)) { if (!Array.isArray(list) || list.length > 100) fail('invalid resume'); list.forEach(v => text(v, 500)); } }
    if (e.look !== undefined) { object(e.look); for (const v of Object.values(e.look)) { if (typeof v === 'number') number(v, -100, 100); else if (typeof v === 'string') text(v, 100); else if (v !== null && typeof v !== 'boolean') fail('invalid appearance'); } }
  }
  if (value.assistant) profile(value.assistant);
  for (const e of [...value.employees, value.assistant || {}]) if (e.keyFrom) { if (!ids.has(e.keyFrom)) fail('unknown key owner'); const owner = e.keyFrom === 'assistant' ? value.assistant : value.employees.find(p => p.id === e.keyFrom); if (!owner || e.provider !== owner.provider || endpointFor(e) !== endpointFor(owner)) fail('shared keys must use the same provider and endpoint'); }
  if (value.security !== undefined) { object(value.security); if (value.security.approveWrites !== undefined) choice(value.security.approveWrites, [true, false]); if (value.security.monthlyTokenLimit !== undefined) number(value.security.monthlyTokenLimit, 0, 1e12); }
  if (value.settings !== undefined) { object(value.settings); for (const [k, v] of Object.entries(value.settings)) { if (typeof v === 'number') number(v, -1000, 10000); else if (typeof v === 'string') text(v, 100); else if (typeof v !== 'boolean' && v !== null) fail('invalid display setting'); } if (value.settings.quality !== undefined) choice(value.settings.quality, ['low', 'balanced', 'high', 'ultra']); if (value.settings.timeMode !== undefined) choice(value.settings.timeMode, ['real', 'preview']); if (value.settings.timeZone && value.settings.timeZone !== 'auto') { try { new Intl.DateTimeFormat('en', { timeZone: value.settings.timeZone }); } catch { fail('invalid timezone'); } } }
  return value;
}
const NO_ARGS = new Set(['app:info', 'config:get', 'config:reset', 'data:erase', 'workspace:choose', 'workspace:ignore-map', 'workspace:open', 'tasks:snapshot', 'tasks:clear', 'team:updates', 'usage:get', 'audit:export', 'app:quit']);
function validateIPC(channel, args) {
  if(channel==='diagnostics:export'){if(args.length)fail('unexpected arguments');return;}
  if(channel==='group:list'){if(args.length)fail('unexpected arguments');return;}
  if(channel.startsWith('group:')){
    const counts={'group:start':3,'group:get':1,'group:send':3,'group:cancel':1,'group:end':1,'group:decision':2};
    if(!(channel in counts)||args.length!==counts[channel])fail('unexpected arguments');
    const [a,b,c]=args;
    const participants=value=>{if(!Array.isArray(value)||value.length>50||new Set(value).size!==value.length)fail('invalid participants');value.forEach(id);};
    if(channel==='group:start'){choice(a,['CEO_Office','Boardroom','Meeting_1','Meeting_2','Meeting_3']);text(b,500);participants(c);if(!c.length)fail('choose participants');}
    else{id(a);if(channel==='group:send'){text(b,5000);participants(c);}if(channel==='group:decision')text(b,700,false);}
    return;
  }
  if (NO_ARGS.has(channel)) { if (args.length) fail('unexpected arguments'); return; }
  const arity = { 'config:save': 1, 'secret:set': 3, 'provider:test': 2, 'workspace:list': 2, 'workspace:read': 1, 'workspace:write': 2, 'terminal:run': 1, 'tasks:create': 2, 'tasks:resume': 1, 'tasks:cancel': 1, 'tasks:reviewed': 1, 'approval:respond': 2, 'memory:list': 1, 'memory:add': 4, 'memory:delete': 1, 'memory:update': 3, 'audit:list': 1, 'employee:reply': 3, 'meeting:ideas': 2, 'assistant:chat': 2, 'shell:external': 1, 'app:fullscreen': 1 };
  if (!(channel in arity) || args.length > arity[channel]) fail('unexpected arguments');
  const [a, b, c, d] = args;
  switch (channel) {
    case 'config:save': config(a); break;
    case 'secret:set': id(a); text(b, 16000); if (b && c === undefined) fail('key storage needs its provider profile'); if (c !== undefined) profile(c); break;
    case 'provider:test': profile(a); if (b !== undefined) id(b); break;
    case 'workspace:list': if (a !== undefined) text(a, 2048); if (b !== undefined) number(b, 1, 3); break;
    case 'workspace:read': text(a, 2048, false); break;
    case 'workspace:write': text(a, 2048, false); text(b, 1000000); break;
    case 'terminal:run': text(a, 20000, false); break;
    case 'tasks:create': id(a); text(b, 5000, false); break;
    case 'tasks:resume': case 'tasks:cancel': case 'tasks:reviewed': case 'memory:list': case 'memory:delete': id(a); break;
    case 'approval:respond': id(a); choice(b, ['approved', 'rejected']); break;
    case 'memory:add': id(a); choice(b, ['project', 'global']); text(c, 700, false); if (d !== undefined) choice(d, ['fact', 'decision', 'preference', 'lesson']); break;
    case 'memory:update': id(a); id(b); object(c); if (Object.keys(c).some(k => !['status', 'kind', 'text'].includes(k))) fail('unknown memory field'); if (c.text !== undefined) text(c.text, 700, false); if (c.status !== undefined) choice(c.status, ['verified', 'unverified', 'outdated']); if (c.kind !== undefined) choice(c.kind, ['fact', 'decision', 'preference', 'lesson']); break;
    case 'audit:list': if (a !== undefined) number(a, 1, 1000); break;
    case 'employee:reply': id(a); text(b, 3000); history(c); break;
    case 'meeting:ideas': text(a, 5000, false); if (!Array.isArray(b) || b.length > 50) fail('invalid participants'); b.forEach(p => { object(p); id(p.id); text(p.status, 500); }); break;
    case 'assistant:chat': history(a); if (b !== undefined) text(b, 20000); break;
    case 'shell:external': { text(a, 2048); let url; try { url = new URL(a); } catch { fail('invalid link'); } if (url.protocol !== 'https:' || url.username || url.password) fail('invalid external link'); break; }
    case 'app:fullscreen': if (a !== undefined) choice(a, [true, false]); break;
  }
}
module.exports = { validateIPC, workspacePath, config };
