const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const THREE = require('../src/renderer/vendor/three.min.js');
const assets = path.join(__dirname, '../src/renderer/assets');
function loadScript(name, extras = {}) {
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/renderer/js', name), 'utf8'), { THREE, window, console, ...extras });
  return window;
}

test('furniture replacement retains crossing architectural triangles and leaves the base geometry unchanged', () => {
  const { DesklyOfficeRealism: realism } = loadScript('office-realism.js');
  const source = new THREE.BufferGeometry();
  source.setAttribute('position', new THREE.Float32BufferAttribute([
    .2,.2,.2, .8,.2,.2, .5,.8,.2,
    -2,0,0, 2,0,0, 0,3,0,
    4,0,0, 5,0,0, 4,1,0
  ], 3));
  for (const indexed of [false, true]) {
    if (indexed) source.setIndex([0,1,2,3,4,5,6,7,8]);
    const result = realism.removeInside(source, [[0,0,0,1,1,1]]);
    assert.deepEqual(Array.from(result.index.array), [3,4,5,6,7,8]);
    assert.equal(source.attributes.position.count, 9);
    assert.equal(source.index?.count || 9, 9);
  }
});

test('imported PBR asset files match source checksums and every glTF dependency is bundled', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(assets, 'realism-assets.json')));
  for (const file of manifest.files) {
    const bytes = fs.readFileSync(path.join(assets, file.path));
    assert.equal(bytes.length, file.bytes);
    assert.equal(crypto.createHash('md5').update(bytes).digest('hex'), file.md5);
  }
  const modelDir = path.join(assets, 'models/modern_arm_chair_01');
  const gltf = JSON.parse(fs.readFileSync(path.join(modelDir, 'modern_arm_chair_01_2k.gltf')));
  for (const dep of [...gltf.buffers, ...gltf.images]) {
    assert.ok(!dep.uri.includes('..') && !dep.uri.includes('://'));
    assert.ok(fs.existsSync(path.join(modelDir, dep.uri)), dep.uri);
  }
});

test('authored employees animate with independent skeletons and retain the existing seating and prop API', async () => {
  const scene = new THREE.Group(), bone = new THREE.Bone(); bone.name = 'RightHand';
  const geometry = new THREE.BoxGeometry(.5, 1.75, .3); geometry.translate(0, .875, 0);
  const count = geometry.attributes.position.count;
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4));
  const weights = new Float32Array(count * 4); for (let i = 0; i < count; i++) weights[i * 4] = 1;
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial()); scene.add(mesh); mesh.add(bone); mesh.bind(new THREE.Skeleton([bone]));
  const asset = { scene, animations: ['Idle', 'Walk', 'Sit'].map(name => new THREE.AnimationClip(name, 1, [new THREE.NumberKeyframeTrack('RightHand.position[x]', [0,1], [0,.1])])) };
  let requested = 0;
  class Loader { async loadAsync() { requested++; return asset; } }
  const warnings = [];
  const library = loadScript('human-assets.js', {
    THREE: { ...THREE, GLTFLoader: Loader },
    console: { warn: m => warnings.push(m) },
    fetch: async () => ({ ok: true, json: async () => ({ models: [
      { id: 'bad', path: 'https://example.com/model.glb' },
      { id: 'person', path: 'assets/characters/person.glb', clips: { stand:'Idle', walk:'Walk', sit:'Sit' }, rightHand:'RightHand' }
    ] }) }),
    Human: { build: () => { const root = new THREE.Group(), cup = new THREE.Group(), phone = new THREE.Group(); root.add(cup, phone); return {root,cup,phone}; } }
  }).DesklyHumanAssets;
  await library.load(); assert.equal(requested, 1); assert.equal(warnings.length, 1);
  assert.equal(library.build({assetId:'missing'}), null);
  const a = library.build({assetId:'person',height:1.75}), b = library.build({assetId:'person',height:1.75});
  a.setMode('walk'); a.update(.25);
  assert.ok(a.root.getObjectByName('RightHand').position.x > 0);
  assert.equal(b.root.getObjectByName('RightHand').position.x, 0);
  assert.equal(bone.position.x, 0);
  a.seatH=.6; a.setMode('sitType'); a.update(.01); assert.ok(Math.abs(a.root.position.y-.1)<.0001);
  assert.equal(a.cup.parent, a.root.getObjectByName('RightHand'));
  a.setMode('stand'); a.update(.01); assert.equal(a.root.position.y,0);
  assert.equal(a.root.children[0].children[0].geometry, b.root.children[0].children[0].geometry);
  let disposed=false;geometry.addEventListener('dispose',()=>{disposed=true;});
  a.dispose();assert.equal(disposed,false,'Removing an employee must preserve shared geometry');
  b.update(.1);assert.ok(b.root.getObjectByName('RightHand'));
});

test('the ceiling encloses every room while skylights and raised stairwell roofs remain clear', () => {
  const {DesklyOfficeEnvelope:envelope}=loadScript('office-envelope.js');
  THREE.BufferGeometryUtils={mergeBufferGeometries:geometries=>{
    const combined=new THREE.BufferGeometry(),positions=[];
    for(const geometry of geometries)positions.push(...geometry.toNonIndexed().attributes.position.array);
    combined.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));return combined;
  }};
  const scene=new THREE.Scene(),roof=envelope.roof({scene});roof.updateMatrixWorld(true);
  const ray=new THREE.Raycaster();
  for(let x=.5;x<60;x+=2)for(let z=.5;z<36;z+=2){
    ray.set(new THREE.Vector3(x,1.6,z),new THREE.Vector3(0,1,0));
    const hits=ray.intersectObject(roof,true);assert.ok(hits.length,`roof gap at ${x}, ${z}`);
    const skylight=envelope.skylights.some(r=>x>r[0]+.1&&x<r[2]-.1&&z>r[1]+.1&&z<r[3]-.1);
    if(skylight)assert.ok(hits.some(h=>h.object.material.transparent),`missing glass at ${x}, ${z}`);
  }
  ray.set(new THREE.Vector3(10,4.2,4),new THREE.Vector3(0,1,0));
  assert.ok(ray.intersectObject(roof,true).some(h=>h.point.y>=4.65));
});

test('game trees are compact, self-contained and use supported texture channels', () => {
  const manifest=JSON.parse(fs.readFileSync(path.join(assets,'nature-assets.json')));
  for(const file of manifest.files){const bytes=fs.readFileSync(path.join(assets,file.path));assert.equal(crypto.createHash('md5').update(bytes).digest('hex'),file.md5);}
  for(const id of ['tree_small_02','fir_sapling']){
    const dir=path.join(assets,'models',id),gltf=JSON.parse(fs.readFileSync(path.join(dir,id+'-game.gltf')));
    const triangles=gltf.meshes.reduce((sum,m)=>sum+m.primitives.reduce((n,p)=>n+gltf.accessors[p.indices].count/3,0),0);
    assert.ok(triangles<120000);
    const bin=fs.readFileSync(path.join(dir,gltf.buffers[0].uri));
    for(const mesh of gltf.meshes)for(const p of mesh.primitives){const a=gltf.accessors[p.indices],v=gltf.bufferViews[a.bufferView],count=gltf.accessors[p.attributes.POSITION].count;for(let i=0;i<a.count;i++)assert.ok(bin.readUInt32LE((v.byteOffset||0)+i*4)<count,'tree index outside vertex buffer');}
    for(const image of gltf.images)assert.ok(fs.existsSync(path.join(dir,image.uri)));
    for(const material of gltf.materials)assert.equal(material.pbrMetallicRoughness.baseColorTexture.texCoord||0,0);
  }
});

test('detailed employees bundle a valid skin, facial morphs, hair and transparent eye maps', () => {
  const manifest=JSON.parse(fs.readFileSync(path.join(assets,'characters/manifest.json')));
  assert.equal(manifest.models.length,2);
  for(const entry of manifest.models){
    const bytes=fs.readFileSync(path.join(assets,entry.path.replace('assets/','')));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),entry.sha256);
    assert.equal(bytes.readUInt32LE(0),0x46546c67);
    const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
    const binaryStart=20+bytes.readUInt32LE(12)+8;
    for(const mesh of gltf.meshes)for(const p of mesh.primitives){
      const w=gltf.accessors[p.attributes.WEIGHTS_0],v=gltf.bufferViews[w.bufferView];
      for(let i=0;i<w.count;i++){
        let sum=0;for(let j=0;j<4;j++){const weight=bytes.readFloatLE(binaryStart+v.byteOffset+i*16+j*4);assert.ok(weight>=0);sum+=weight;}
        assert.ok(Math.abs(sum-1)<.0001);
      }
      if(!['Clothes','Shoes'].includes(mesh.name)){
        assert.equal(p.targets.length,2);
        for(const target of p.targets){
          const normal=gltf.accessors[target.NORMAL];
          assert.equal(normal.count,gltf.accessors[p.attributes.POSITION].count);
          const view=gltf.bufferViews[normal.bufferView];
          for(let i=0;i<normal.count*3;i++)assert.ok(Number.isFinite(bytes.readFloatLE(binaryStart+view.byteOffset+i*4)));
          if(mesh.name==='Eyeballs'){
            const position=gltf.accessors[target.POSITION],buffer=gltf.bufferViews[position.bufferView];
            let shift=0;
            for(let i=0;i<position.count;i++)shift+=bytes.readFloatLE(binaryStart+buffer.byteOffset+i*12+4);
            assert.ok(Math.abs(shift/position.count)<.025,'Facial identity must not move the eyes away from the head skeleton');
          }
        }
      }
    }
    assert.equal(gltf.materials.find(m=>m.name==='Eyes').alphaMode,'MASK');
    assert.ok(gltf.meshes.some(m=>m.name==='Shoes'));
    assert.ok(gltf.images.every(i=>Number.isInteger(i.bufferView)&&!i.uri));
    assert.ok(gltf.nodes.some(n=>n.name===entry.rightHand));
  }
});
