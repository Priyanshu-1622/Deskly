// Reproducible CC0 asset intake using Poly Haven's public API.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../src/renderer/assets');
async function json(url) { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status}: ${url}`); return r.json(); }
async function download(entry, relative) {
  const target = path.resolve(ROOT, relative);
  if (!target.startsWith(ROOT + path.sep)) throw new Error('Asset path escapes output folder');
  if (!entry?.url || !entry.url.startsWith('https://dl.polyhaven.org/')) throw new Error('Unexpected asset host');
  const response = await fetch(entry.url);
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${relative}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (crypto.createHash('md5').update(bytes).digest('hex') !== entry.md5) throw new Error(`Checksum failed: ${relative}`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes);
  return { path: relative.replaceAll('\\', '/'), bytes: bytes.length, source: entry.url, md5: entry.md5 };
}
async function main() {
  const chair = await json('https://api.polyhaven.com/files/modern_arm_chair_01');
  const model = chair.gltf['2k'].gltf;
  const base = 'models/modern_arm_chair_01/';
  const files = [await download(model, base + 'modern_arm_chair_01_2k.gltf')];
  for (const [name, entry] of Object.entries(model.include)) files.push(await download(entry, base + name));
  const leather = await json('https://api.polyhaven.com/files/brown_leather');
  for (const [key, suffix] of [['Diffuse', 'diffuse'], ['nor_gl', 'nor_gl'], ['Rough', 'rough']]) files.push(await download(leather[key]['1k'].jpg, `materials/brown_leather-${suffix}.jpg`));
  await fs.writeFile(path.join(ROOT, 'realism-assets.json'), JSON.stringify({ license: 'CC0-1.0', licenseUrl: 'https://polyhaven.com/license', assets: [
    { id: 'modern_arm_chair_01', author: 'Vibrant Nordic', source: 'https://polyhaven.com/a/modern_arm_chair_01' },
    { id: 'brown_leather', source: 'https://polyhaven.com/a/brown_leather' }
  ], files }, null, 2) + '\n');
  console.log(`Imported ${files.length} checked asset files (${(files.reduce((n, f) => n + f.bytes, 0) / 1048576).toFixed(1)} MB).`);
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
