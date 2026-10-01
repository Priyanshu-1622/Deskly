/* Authored, in-place GLB characters behind the existing employee rig API. */
(() => {
  const T = THREE, loaded = new Map();
  function named(root,name){let found=root.getObjectByName(name);if(!found)root.traverse(o=>{if(o.userData.name===name)found=o;});return found;}
  async function load() {
    const manifest = await fetch('assets/characters/manifest.json').then(r => { if (!r.ok) throw new Error('Character manifest unavailable'); return r.json(); });
    for (const entry of manifest.models || []) {
      try {
        if (!entry.id || !/^assets\/characters\/[\w/-]+\.glb$/.test(entry.path)) throw new Error('Use a local character GLB path');
        const asset = await new T.GLTFLoader().loadAsync(entry.path);
        let skinned = false; asset.scene.traverse(m => { if (m.isSkinnedMesh) skinned = true; });
        if (!skinned) throw new Error('Character requires a skinned rig');
        if (entry.driver !== 'deskly') for (const mode of ['stand', 'walk', 'sit']) if (!asset.animations.some(c => c.name === entry.clips?.[mode])) throw new Error('Missing ' + mode + ' animation');
        if (entry.rightHand && !named(asset.scene,entry.rightHand)) throw new Error('Right hand bone not found');
        const bounds = new T.Box3().setFromObject(asset.scene), height = bounds.max.y - bounds.min.y;
        if (!Number.isFinite(height) || height <= 0) throw new Error('Invalid character bounds');
        const skinMaterials=[];
        for(const name of entry.skinMaterials||[]){const index=asset.parser.json.materials.findIndex(m=>m.name===name);if(index>=0)skinMaterials.push(await asset.parser.getDependency('material',index));}
        loaded.set(entry.id, { entry, asset, bounds, height,skinMaterials });
      } catch (error) { console.warn('Character skipped: ' + entry.id + ': ' + error.message); }
    }
  }
  function build(look = {}) {
    const selected=look.assetId || ('employee-'+(look.bust || look.body==='feminine' ? 'female':'male'));
    const item = loaded.get(selected); if (!item) return null;
    const { entry, asset, bounds, height } = item;
    const model = asset.scene.clone(true), copies = new Map();
    const originals = [], clones = []; asset.scene.traverse(o => originals.push(o)); model.traverse(o => clones.push(o));
    originals.forEach((o, i) => copies.set(o, clones[i]));
    originals.forEach(o => {
      const m = copies.get(o);
      if (m.isMesh) { m.geometry = o.geometry.clone(); m.castShadow = !/^Hair_|Eyeballs|Eyebrows/.test(m.name);m.receiveShadow = true;m.frustumCulled=true; }
      if (m.isSkinnedMesh) { m.skeleton = o.skeleton.clone(); m.skeleton.bones = o.skeleton.bones.map(b => copies.get(b)); m.bind(m.skeleton, o.bindMatrix); }
    });
    const root = new T.Group(), s = (Number(look.height) || 1.75) / 1.75;
    root.scale.setScalar(s); root.add(model);
    const normalize=entry.driver==='deskly'?1:1.75/height;
    model.scale.setScalar(normalize); model.position.y = -bounds.min.y * normalize; model.rotation.y = entry.facingYaw || 0;
    if(entry.driver==='deskly')return buildDriven(root,model,look,s,item.skinMaterials);
    const mixer = new T.AnimationMixer(model), actions = new Map();
    for (const [mode, name] of Object.entries(entry.clips || {})) {
      const clip = asset.animations.find(c => c.name === name); if (clip) actions.set(mode, mixer.clipAction(clip));
    }
    const props = Human.build(look), cup = props.cup, phone = props.phone;
    const hand = entry.rightHand && named(model,entry.rightHand);
    if (hand) { hand.add(cup, phone); } else { root.add(cup, phone); cup.scale.setScalar(0); phone.scale.setScalar(0); }
    // Keep only prop geometry from the temporary procedural rig.
    props.root.traverse(o => o.geometry?.dispose());
    let active, mode = 'stand';
    const rig = { root, s, cup, phone, seatH: .5, speed: 0, talking: 0, look: null,
      dispose(){root.traverse(o=>{o.geometry?.dispose();o.skeleton?.dispose();});},
      setMode(next) {
        mode = next;
        const action = actions.get(next) || actions.get(next.startsWith('sit') ? 'sit' : next === 'run' ? 'walk' : 'stand');
        if (action === active) return;
        action.reset().play(); if (active) { active.fadeOut(.2); action.fadeIn(.2); } active = action;
      },
      update(dt) {
        const seated = mode.startsWith('sit');
        root.position.y = seated ? this.seatH - (entry.referenceSeatHeight || .5) * s : 0;
        if (active) active.timeScale = mode === 'run' ? 1.6 : 1;
        mixer.update(dt);
      }
    };
    rig.setMode('stand'); return rig;
  }
  function buildDriven(root,model,look,s,skinMaterials) {
    // The existing behaviour animator drives an authored skin; its primitive
    // meshes never enter the visible scene. Each employee retains a private rig.
    const driver=Human.build({...look,height:1.75}), temporary=driver.root;
    const cup=driver.cup,phone=driver.phone,hand=named(model,'wrist.R');hand.add(cup,phone);
    temporary.traverse(o=>o.geometry?.dispose());
    const materials=new Map();model.traverse(o=>{if(o.isMesh){const original=o.material;if(!materials.has(original))materials.set(original,original.clone());o.material=materials.get(original);o.material.envMapIntensity=.45;}});
    const mat=(name)=>[...materials.values()].find(m=>m.name===name);
    // Textured neutral skin is tinted subtly; keep its authored pores and lips.
    if(look.skin){const skin=mat('Skin'),tint=new T.Color(look.skin),brightness=Math.max(tint.r,tint.g,tint.b);const source=skinMaterials[brightness<.34?2:brightness<.67?1:0];if(source&&skin)skin.map=source.map;tint.lerp(new T.Color('#ffffff'),.72);skin?.color.copy(tint);}
    if(look.shirt)mat('Outfit')?.color.copy(new T.Color(look.shirt).lerp(new T.Color('#ffffff'),.48));
    const style=look.detailedHair ?? (['bob','long','braids'].includes(look.hairStyle)?1:['pony','ponytail','bun'].includes(look.hairStyle)?2:0);
    mat('Brows')?.color.set(look.hair||'#3a2618');
    for(let i=0;i<3;i++){const hair=model.getObjectByName('Hair_'+i);if(hair)hair.visible=i===Number(style);mat('Hair_'+i)?.color.set(look.hair||'#ffffff');}
    const a=Math.max(0,Math.min(1,Number(look.faceA)||0)),b=Math.max(0,Math.min(1,Number(look.faceB)||0)),div=Math.max(1,a+b);
    model.traverse(mesh=>{if(mesh.morphTargetInfluences){mesh.morphTargetInfluences[0]=a/div;mesh.morphTargetInfluences[1]=b/div;}});
    model.scale.x*=Math.max(.85,Math.min(1.15,Number(look.buildWidth)||1));
    const names={root:'hips',spine05:'spine'};
    const neck=named(model,'neck01'),head=named(model,'head');
    const restNeck=neck.quaternion.clone(),restHead=head.quaternion.clone();
    for(const side of ['R','L'])Object.assign(names,{['upperarm01.'+side]:'upperArm'+side,['lowerarm01.'+side]:'foreArm'+side,['wrist.'+side]:'hand'+side,['upperleg01.'+side]:'thigh'+side,['lowerleg01.'+side]:'shin'+side,['foot.'+side]:'foot'+side});
    const bindings=[];model.traverse(b=>{
      const name=b.userData.name||b.name;
      if(!b.isBone||!names[name])return;
      const h=b.userData.restHead,t=b.userData.restTail;
      // Split deformation bones do not necessarily point along the complete
      // anatomical segment. Align hip-to-knee and knee-to-ankle, otherwise the
      // second half of each leg inherits an unwanted sideways bend.
      const segmentEnd=name.startsWith('upperleg01.')?named(model,'lowerleg01.'+name.slice(-1)):
        name.startsWith('lowerleg01.')?named(model,'foot.'+name.slice(-1)):null;
      const end=segmentEnd?.userData.restHead||t;
      const rest=new T.Vector3(...end).sub(new T.Vector3(...h)).normalize();
      const limb=/arm|wrist|leg/.test(name), desired=limb?new T.Vector3(0,-1,0):rest;
      bindings.push({bone:b,joint:driver.J[names[name]],align:new T.Quaternion().setFromUnitVectors(rest,desired),position:b.position.clone()});
    });
    const q=new T.Quaternion(),parentQ=new T.Quaternion(),rootQ=new T.Quaternion();
    const hips=model.getObjectByName('root'),restHip=hips.position.y,restZ=hips.position.z,jaw=named(model,'jaw'),lookPoint=new T.Vector3();
    const feet=['L','R'].map(side=>named(model,'foot.'+side)),footPoint=new T.Vector3();
    let mode='stand';
    const rig={root,s,cup,phone,seatH:.5,speed:0,talking:0,look:null,
      dispose(){root.traverse(o=>{o.geometry?.dispose();o.skeleton?.dispose();});for(const material of materials.values())material.dispose();},
      setMode(next){mode=next;driver.setMode(next);},
      update(dt,yaw){
        root.updateMatrixWorld(true);
        driver.seatH=this.seatH/s;driver.speed=this.speed;driver.talking=this.talking;
        driver.look=this.look?root.worldToLocal(lookPoint.set(this.look.x,this.look.y??1.6,this.look.z)):null;
        driver.update(dt,0);temporary.updateMatrixWorld(true);
        hips.position.y=restHip+(driver.J.hips.position.y-.95);
        hips.position.z=restZ+driver.J.hips.position.z;
        model.updateMatrixWorld(true);
        root.getWorldQuaternion(rootQ);
        for(const {bone,joint,align}of bindings){
          joint.getWorldQuaternion(q);q.multiply(align).premultiply(rootQ);
          bone.parent.getWorldQuaternion(parentQ);bone.quaternion.copy(parentQ.invert().multiply(q));bone.updateWorldMatrix(false,false);
        }
        // Keep the authored neck/head relationship and apply only local look motion.
        neck.quaternion.copy(restNeck).multiply(driver.J.neck.quaternion);
        head.quaternion.copy(restHead).multiply(driver.J.head.quaternion);
        neck.updateMatrixWorld(true);
        // Anchor the lower shoe to the floor instead of letting shorter,
        // bent stride poses lift the entire character above it.
        if(mode==='walk'||mode==='run'){
          let lift=Infinity;
          for(const foot of feet){foot.getWorldPosition(footPoint);root.worldToLocal(footPoint);lift=Math.min(lift,footPoint.y-foot.userData.restHead[1]);}
          if(Number.isFinite(lift)){hips.position.y-=lift;model.updateMatrixWorld(true);}
        }
        if(jaw)jaw.rotation.x=driver.talking>0?Math.max(0,(driver.mouth.scale.y-1)*.022):0;
      }
    };rig.setMode('stand');rig.update(0,0);return rig;
  }
  window.DesklyHumanAssets = { load, build, models: () => [...loaded.values()].map(({ entry }) => ({ id: entry.id, label: entry.label || entry.id })) };
})();
