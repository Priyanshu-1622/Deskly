// Offline distance-detail indices. Original authored meshes and textures stay intact.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { MeshoptSimplifier } from '../.cache/graphics-tools/node_modules/meshoptimizer/meshopt_simplifier.js';
await MeshoptSimplifier.ready;
const root = 'src/renderer/assets', result = {};
for (const id of ['tree_small_02', 'fir_sapling']) {
  const dir = `${root}/models/${id}`, doc = JSON.parse(await fs.readFile(`${dir}/${id}-game.gltf`, 'utf8'));
  const binary = await fs.readFile(`${dir}/${doc.buffers[0].uri}`);
  function read(index, width) {
    const a = doc.accessors[index], v = doc.bufferViews[a.bufferView], data = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
    const array = a.componentType === 5126 ? new Float32Array(a.count * width) : new Uint32Array(a.count * width);
    for (let i = 0; i < a.count; i++) for (let j = 0; j < width; j++) {
      const at = (v.byteOffset || 0) + (a.byteOffset || 0) + i * (v.byteStride || width * 4) + j * 4;
      array[i * width + j] = a.componentType === 5126 ? data.getFloat32(at, true) : data.getUint32(at, true);
    }
    return array;
  }
  const total = doc.meshes.reduce((sum, m) => sum + m.primitives.reduce((n, p) => n + doc.accessors[p.indices].count, 0), 0);
  result[id] = doc.meshes.map(m => m.primitives.map(p => {
    const indices = read(p.indices, 1), positions = read(p.attributes.POSITION, 3), uv = read(p.attributes.TEXCOORD_0, 2);
    return [15000, 3000].map(budget => {
      const target = Math.min(indices.length, Math.max(3, Math.floor(budget * indices.length / total) * 3));
      let [reduced] = MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, uv, 2, [.05, .05], null, target, .12, ['Permissive']);
      if (reduced.length > target) [reduced] = MeshoptSimplifier.simplifySloppy(indices, positions, 3, null, target, 1);
      if (!reduced.length) throw new Error(`Empty tree detail: ${id}`);
      return Buffer.from(reduced.buffer, reduced.byteOffset, reduced.byteLength).toString('base64');
    });
  }));
  for (let level = 0; level < 2; level++) console.log(id, level, result[id].flat().reduce((n, p) => n + Buffer.from(p[level], 'base64').length / 12, 0), 'triangles');
}
const bytes = Buffer.from(JSON.stringify(result)); await fs.writeFile(`${root}/tree-lods.json`, bytes);
const file = `${root}/nature-assets.json`, manifest = JSON.parse(await fs.readFile(file, 'utf8'));
manifest.files = manifest.files.filter(f => f.path !== 'tree-lods.json');
manifest.files.push({ path: 'tree-lods.json', bytes: bytes.length, md5: crypto.createHash('md5').update(bytes).digest('hex'), source: 'Existing CC0 tree game meshes; tools/build-tree-lods.mjs', derived: true });
await fs.writeFile(file, JSON.stringify(manifest, null, 2) + '\n');
