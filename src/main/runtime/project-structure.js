const fs = require('fs');
const path = require('path');

const AREAS = ['frontend', 'backend', 'shared', 'docs', 'operations'];
const DEFAULTS = { frontend: 'frontend', backend: 'backend', shared: 'shared', docs: 'docs', operations: 'operations' };
const CANDIDATES = {
  frontend: ['apps/web', 'apps/frontend', 'packages/web', 'frontend', 'client', 'web', 'ui'],
  backend: ['apps/api', 'apps/backend', 'packages/api', 'backend', 'server', 'api'],
  shared: ['packages/shared', 'shared', 'common'],
  docs: ['docs', 'documentation'],
  operations: ['infra', 'infrastructure', 'ops', 'deploy']
};

function validArea(value) {
  if (typeof value !== 'string' || value.length > 200) throw new Error('Project areas must be text paths.');
  const area = value.replace(/\\/g, '/').replace(/\/$/, '');
  if (!area || area === '.' || path.posix.isAbsolute(area) || area.split('/').some(p => !p || p.startsWith('.') || p.toLowerCase() === 'node_modules' || /[. ]$|~\d/.test(p)) || /[:\x00-\x1f]/.test(area)) throw new Error('Invalid project area path.');
  return area;
}
function validateMap(map) {
  if (!map || typeof map !== 'object' || !map.areas || typeof map.areas !== 'object' || Array.isArray(map.areas)) throw new Error('Invalid project map.');
  const areas = {};
  for (const name of AREAS) areas[name] = validArea(map.areas[name] === undefined ? DEFAULTS[name] : map.areas[name]);
  return { ...map, version: 1, areas };
}
function fingerprint(map) { return require('crypto').createHash('sha256').update(JSON.stringify(validateMap(map).areas)).digest('hex'); }

function inspect(ws) {
  ws.ensure();
  const file = ws.resolve('deskly.project.json');
  if (fs.existsSync(file)) {
    try { return validateMap({ ...JSON.parse(fs.readFileSync(file, 'utf8')), source: 'saved' }); }
    catch (e) { return { version: 1, areas: { ...DEFAULTS }, source: 'fallback', warning: `deskly.project.json could not be used: ${e.message} Safe default areas are active. The original file was left untouched.` }; }
  }
  const entries = fs.readdirSync(ws.root).filter(name => !['.git', 'node_modules', 'deskly-output', '.DS_Store'].includes(name));
  const empty = entries.length === 0;
  const areas = {};
  for (const name of AREAS) {
    areas[name] = CANDIDATES[name].find(candidate => {
      try { return fs.statSync(ws.resolve(candidate)).isDirectory(); } catch { return false; }
    }) || DEFAULTS[name];
  }
  // For existing single-app projects, keep the current source tree as the
  // frontend home; do not migrate or replace any existing project files.
  if (!empty && areas.frontend === DEFAULTS.frontend && fs.existsSync(ws.resolve('src')) && !fs.existsSync(ws.resolve('backend'))) {
    areas.frontend = 'src';
  }
  const map = { version: 1, areas, source: empty ? 'new' : 'existing' };
  if (empty) for (const area of new Set(Object.values(areas))) fs.mkdirSync(ws.resolve(area), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ version: 1, areas }, null, 2) + '\n');
  return map;
}

function areaFor(role, description = '') {
  const r = String(role || '').toLowerCase(), d = String(description || '').toLowerCase();
  if (/frontend/.test(r)) return 'frontend';
  if (/devops|it administrator/.test(r)) return 'operations';
  if (/developer|engineer/.test(r)) return /\b(frontend|front-end|ui|website|web page|component)\b/.test(d) ? 'frontend' : 'backend';
  return 'docs';
}

function guidance(map, area) {
  const rows = AREAS.map(name => `- ${name}: ${map.areas[name]}/`).join('\n');
  return `Project structure (all paths are relative to the ONE shared project root):\n${rows}\nYour assigned area: ${area} → ${map.areas[area]}/. Put new files in that area. Read other areas for integration and inspect existing files before editing them. Agree on shared interfaces via send_update with exact paths and contracts. Existing project files may remain in their current locations. Project-wide configuration files can stay at the root.`;
}

function allowNewFile(map, area, relative) {
  map = validateMap(map);
  const normalize = s => process.platform === 'win32' ? s.toLowerCase() : s;
  const p = normalize(String(relative || '').replace(/\\/g, '/'));
  const home = normalize(map.areas[area]);
  if (p.startsWith(home + '/')) return true;
  if (p.startsWith(normalize(map.areas.shared) + '/') && ['frontend', 'backend'].includes(area)) return true;
  return ['package.json', 'package-lock.json', 'README.md', '.gitignore', 'tsconfig.json', 'vite.config.js', 'vite.config.ts', 'docker-compose.yml', 'compose.yml'].map(normalize).includes(p);
}

module.exports = { inspect, areaFor, guidance, allowNewFile, validArea, validateMap, fingerprint, AREAS };
