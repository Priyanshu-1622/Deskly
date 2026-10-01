// CC0 source intake and offline game-mesh simplification. Runtime needs no optimizer.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { MeshoptSimplifier } from '../.cache/graphics-tools/node_modules/meshoptimizer/meshopt_simplifier.js';
const root = path.resolve('src/renderer/assets'), cache = path.resolve('.cache/asset-sources');
await fs.mkdir(cache, { recursive:true });
await MeshoptSimplifier.ready;
const records = [];
async function checked(entry, filename) {
  let bytes; try { bytes = await fs.readFile(filename); } catch {}
  if (!bytes || crypto.createHash('md5').update(bytes).digest('hex') !== entry.md5) {
    const r = await fetch(entry.url, { signal:AbortSignal.timeout(180000) }); if (!r.ok) throw Error('Download '+r.status);
    bytes = Buffer.from(await r.arrayBuffer());
    if (crypto.createHash('md5').update(bytes).digest('hex') !== entry.md5) throw Error('Checksum mismatch');
    await fs.mkdir(path.dirname(filename), {recursive:true}); await fs.writeFile(filename,bytes);
  }
  return bytes;
}
for (const id of ['tree_small_02','fir_sapling']) {
  const api = await (await fetch('https://api.polyhaven.com/files/'+id)).json(), entry = api.gltf['1k'].gltf;
  const dir = path.join(root,'models',id); await fs.mkdir(dir,{recursive:true});
  const gltf = JSON.parse(await checked(entry,path.join(cache,id+'.gltf')));
  const binaryEntry = Object.entries(entry.include).find(([name])=>name.endsWith('.bin'));
  const source = await checked(binaryEntry[1],path.join(cache,binaryEntry[0]));
  for (const [name,e] of Object.entries(entry.include)) if (!name.endsWith('.bin')) {
    const bytes = await checked(e,path.join(dir,name)); records.push({path:path.relative(root,path.join(dir,name)).replaceAll('\\','/'),bytes:bytes.length,source:e.url,md5:e.md5});
  }
  const original = structuredClone(gltf), blocks=[], views=[], accessors=[];
  let offset=0, sourceTriangles=0, triangles=0;
  const sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
  function read(i) {
    const a=original.accessors[i],v=original.bufferViews[a.bufferView], width=sizes[a.type];
    const bytes=a.componentType===5126||a.componentType===5125?4:2;
    const data=new DataView(source.buffer,source.byteOffset,source.byteLength);
    const out=a.componentType===5126?new Float32Array(a.count*width):new Uint32Array(a.count*width);
    for(let n=0;n<a.count;n++)for(let j=0;j<width;j++) {
      const p=(v.byteOffset||0)+(a.byteOffset||0)+n*(v.byteStride||width*bytes)+j*bytes;
      out[n*width+j]=a.componentType===5126?data.getFloat32(p,true):bytes===4?data.getUint32(p,true):data.getUint16(p,true);
    }
    return out;
  }
  function write(data,type,componentType,bounds=false) {
    const bytes=Buffer.from(data.buffer,data.byteOffset,data.byteLength),view=views.length;
    views.push({buffer:0,byteOffset:offset,byteLength:bytes.length});blocks.push(bytes);offset+=bytes.length;
    const a={bufferView:view,componentType,count:data.length/sizes[type],type};
    if(bounds){a.min=Array(sizes[type]).fill(Infinity);a.max=Array(sizes[type]).fill(-Infinity);for(let i=0;i<data.length;i++){let j=i%sizes[type];a.min[j]=Math.min(a.min[j],data[i]);a.max[j]=Math.max(a.max[j],data[i]);}}
    accessors.push(a); return accessors.length-1;
  }
  for(const mesh of gltf.meshes)for(const primitive of mesh.primitives) {
    const material=gltf.materials[primitive.material], channel=material.pbrMetallicRoughness?.baseColorTexture?.texCoord||0;
    if(channel===1){primitive.attributes.TEXCOORD_0=primitive.attributes.TEXCOORD_1;delete primitive.attributes.TEXCOORD_1;for(const info of [material.normalTexture,material.pbrMetallicRoughness.baseColorTexture,material.pbrMetallicRoughness.metallicRoughnessTexture])if(info)info.texCoord=0;}
    if(material.alphaMode==='BLEND'){material.alphaMode='MASK';material.alphaCutoff=.35;}
    const indices=read(primitive.indices),positions=read(primitive.attributes.POSITION),uv=read(primitive.attributes.TEXCOORD_0);
    sourceTriangles+=indices.length/3;
    const target=Math.min(indices.length,Math.max(1800,Math.floor(indices.length*.055/3)*3));
    const [reduced,error]=MeshoptSimplifier.simplifyWithAttributes(indices,positions,3,uv,2,[.15,.15],null,target,.018,['Permissive']);
    const [remap,count]=MeshoptSimplifier.compactMesh(reduced);
    // compactMesh already rewrites the index array; its remap is for attributes.
    const compactIndices=new Uint32Array(reduced);
    primitive.indices=write(compactIndices,'SCALAR',5125);
    for(const [semantic,index]of Object.entries(primitive.attributes)) {
      const a=original.accessors[index],data=read(index),width=sizes[a.type],out=new Float32Array(count*width);
      for(let i=0;i<remap.length;i++)if(remap[i]!==0xffffffff)for(let j=0;j<width;j++)out[remap[i]*width+j]=data[i*width+j];
      primitive.attributes[semantic]=write(out,a.type,5126,semantic==='POSITION');
    }
    triangles+=reduced.length/3;console.log(id,'mesh',indices.length/3,'→',reduced.length/3,'error',error.toFixed(4));
  }
  gltf.accessors=accessors;gltf.bufferViews=views;gltf.buffers=[{uri:id+'-game.bin',byteLength:offset}];
  await fs.writeFile(path.join(dir,id+'-game.bin'),Buffer.concat(blocks));
  await fs.writeFile(path.join(dir,id+'-game.gltf'),JSON.stringify(gltf));
  for(const name of [id+'-game.gltf',id+'-game.bin']){const b=await fs.readFile(path.join(dir,name));records.push({path:'models/'+id+'/'+name,bytes:b.length,md5:crypto.createHash('md5').update(b).digest('hex'),source:entry.url,derived:true});}
  console.log(id,sourceTriangles,'→',triangles,'triangles');
}
await fs.writeFile(path.join(root,'nature-assets.json'),JSON.stringify({license:'CC0-1.0',licenseUrl:'https://polyhaven.com/license',assets:['tree_small_02','fir_sapling'].map(id=>({id,source:'https://polyhaven.com/a/'+id})),files:records},null,2)+'\n');
