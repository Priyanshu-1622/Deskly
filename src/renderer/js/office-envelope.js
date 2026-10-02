/* Full office enclosure with glazed roof lights and authored exterior planting. */
(() => {
  const T = THREE;
  const treePositions = [[-7,4],[-7,14],[-7,24],[-7,33],[67,4],[67,14],[67,24],[67,33],[8,43],[22,44],[38,43],[52,44],[10,-6.5],[30,-6.5],[45,-6.5],[-8,-6]];
  const skylights = [[2,29,8,34],[17,17,29,23],[4,10,10,14],[17,10,23,14],[35,10,41,14],[49,10,55,14],[17,30,23,34],[35,30,41,34],[49,30,55,34]];
  const stairwells = [[9,0,13,8],[56,28,60,36]];
  function roof(world) {
    const group = new T.Group(); group.name='Office_Roof';
    const paint = new T.MeshStandardMaterial({color:'#e3e2dd',roughness:.88,metalness:0});
    const trim = new T.MeshStandardMaterial({color:'#485158',roughness:.38,metalness:.7});
    const glass = new T.MeshPhysicalMaterial({color:'#d3edf3',roughness:.055,metalness:0,transparent:true,opacity:.19,depthWrite:false,side:T.DoubleSide,clearcoat:1,clearcoatRoughness:.045});
    const light = new T.MeshStandardMaterial({color:'#f5f1df',roughness:.6,emissive:'#fff0ce',emissiveIntensity:.85});
    const batches=new Map();
    function box(x0,z0,x1,z1,y,h,material,casts=true) {
      const geometry=new T.BoxGeometry(x1-x0,h,z1-z0);geometry.translate((x0+x1)/2,y+h/2,(z0+z1)/2);
      if(material===glass){const m=new T.Mesh(geometry,material);m.receiveShadow=true;group.add(m);return;}
      if(!batches.has(material))batches.set(material,[]);batches.get(material).push(geometry);
    }
    // Exact partitioning avoids overlapping roof panels above a glazed opening.
    const cuts=[...skylights,...stairwells], xs=[...new Set([0,60,...cuts.flatMap(r=>[r[0],r[2]])])].sort((a,b)=>a-b), zs=[...new Set([0,36,...cuts.flatMap(r=>[r[1],r[3]])])].sort((a,b)=>a-b);
    for(let i=0;i<xs.length-1;i++)for(let j=0;j<zs.length-1;j++){
      const x=(xs[i]+xs[i+1])/2,z=(zs[j]+zs[j+1])/2;
      if(!cuts.some(r=>x>r[0]&&x<r[2]&&z>r[1]&&z<r[3]))box(xs[i],zs[j],xs[i+1],zs[j+1],3.2,.16,paint);
    }
    for(const [x0,z0,x1,z1]of skylights){
      box(x0,z0,x1,z1,3.26,.018,glass);
      for(const z of [z0,z1])box(x0-.04,z-.045,x1+.04,z+.045,3.18,.22,trim);
      for(let x=x0;x<=x1;x+=1.5)box(x-.035,z0,x+.035,z1,3.2,.15,trim);
      const middle=(z0+z1)/2;box(x0,middle-.035,x1,middle+.035,3.2,.15,trim);
    }
    for(const [x0,z0,x1,z1]of stairwells){
      box(x0,z0,x1,z1,5.3,.16,paint);
      box(x0,z0,x1,z0+.12,3.2,2.1,paint);box(x0,z1-.12,x1,z1,3.2,2.1,paint);
      box(x0,z0,x0+.12,z1,3.2,2.1,paint);box(x1-.12,z0,x1,z1,3.2,2.1,paint);
    }
    for(const [x,z]of [[8,16],[20,16],[31,16],[43,16],[54,16],[8,31],[17,31],[28,31],[40,31],[53,31],[20,5]]) {
      if(skylights.some(r=>x>r[0]&&x<r[2]&&z>r[1]&&z<r[3]))continue;
      box(x-.65,z-.19,x+.65,z+.19,3.14,.055,trim);box(x-.59,z-.13,x+.59,z+.13,3.135,.012,light);
    }
    for(const [material,geometries]of batches){const mesh=new T.Mesh(T.BufferGeometryUtils.mergeBufferGeometries(geometries,false),material);mesh.castShadow=material!==light;mesh.receiveShadow=true;group.add(mesh);geometries.forEach(g=>g.dispose());}
    group.userData.skylights=skylights;group.userData.stairwells=stairwells;world.scene.add(group);return group;
  }
  async function trees(world,base) {
    const ids=['tree_small_02','fir_sapling'],detail=await fetch('assets/tree-lods.json').then(r=>r.json());
    const models=await Promise.all(ids.map(id=>new T.GLTFLoader().loadAsync('assets/models/'+id+'/'+id+'-game.gltf')));
    models.forEach((asset,i)=>asset.scene.traverse(mesh=>{if(!mesh.isMesh)return;const ref=asset.parser.associations.get(mesh),levels=detail[ids[i]]?.[ref?.meshes]?.[ref?.primitives];if(!levels)return;mesh.geometry.treeDetails=levels.map(encoded=>{const raw=atob(encoded),bytes=new Uint8Array(raw.length);for(let j=0;j<raw.length;j++)bytes[j]=raw.charCodeAt(j);const g=new T.BufferGeometry();for(const [name,attribute]of Object.entries(mesh.geometry.attributes))g.setAttribute(name,attribute);g.setIndex(new T.BufferAttribute(new Uint32Array(bytes.buffer),1));return g;});}));
    const group=new T.Group();group.name='Authored_Outdoor_Trees';
    treePositions.forEach(([x,z],i)=>{
      const source=i%5===0?models[1].scene.children[i%3]:models[0].scene;
      const model=source.clone(true);model.position.set(0,0,0);
      const bounds=new T.Box3().setFromObject(model),size=bounds.getSize(new T.Vector3()),height=4.7+(i%4)*.35,scale=height/size.y;
      model.scale.setScalar(scale);model.position.set(0,-bounds.min.y*scale-.2,0);
      const wrapper=new T.Group();wrapper.position.set(x,0,z);wrapper.rotation.y=i*2.39996;wrapper.add(model);group.add(wrapper);
      model.traverse(m=>{if(m.isMesh){m.castShadow=m.receiveShadow=true;m.material.envMapIntensity=.45;}});
    });
    const boxes=treePositions.map(([x,z])=>[x-4,-1,z-4,x+4,8,z+4]);
    base.traverse(m=>{if(m.isMesh&&/^Site_(tree_|bark)/.test(m.name)){const old=m.geometry;m.geometry=DesklyOfficeRealism.removeInside(old,boxes);old.dispose();}});
    world.scene.add(group);return group;
  }
  async function apply(world,base){const enclosure=roof(world);let planting;try{planting=await trees(world,base);}catch(e){console.warn('Authored trees unavailable; original planting retained:',e.message);}return{roof:enclosure,trees:planting};}
  window.DesklyOfficeEnvelope={apply,roof,treePositions,skylights,stairwells};
})();
