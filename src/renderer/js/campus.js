/* Outdoor grounds around the original single-floor office. */
(()=>{const T=THREE,inside=(p,r,pad=0)=>p.x>r[0]-pad&&p.x<r[2]+pad&&p.z>r[1]-pad&&p.z<r[3]+pad;
class Campus{
constructor(world){this.world=world;this.obstacles=[[]];this.interactions=[];this.treeGroups=[];this.batches=new Map();this.floors=[];const get=(name,color)=>world.officeMaterials.materials.get(name)||new T.MeshStandardMaterial({color,roughness:.8});this.mats={wood:get('walnut','#80593c'),stone:get('concrete','#b9b9b3'),metal:get('steel','#7e898f'),paving:get('tile','#b8b5a9'),glass:world.officeMaterials.materials.get('glass'),dark:new T.MeshStandardMaterial({color:'#172b33',roughness:.6}),light:new T.MeshStandardMaterial({color:'#fff2d8',emissive:'#ffe5ac',emissiveIntensity:.7})};this.mats.grass=this.mats.stone.clone();this.mats.grass.color.set('#6d8251');this.mats.grass.roughness=1;this.mats.grass.normalScale?.set(.05,.05);this.mats.road=this.mats.stone.clone();this.mats.road.color.set('#343b3c');this.mats.road.roughness=.96;this.campus=new T.Group();this.campus.name='Office_Outdoor_Grounds';this.shell=this.campus;world.scene.add(this.campus);this.exterior();for(const [parent,materials]of this.batches)for(const [material,geometries]of materials){const mesh=new T.Mesh(T.BufferGeometryUtils.mergeBufferGeometries(geometries,false),material);mesh.castShadow=!material.transparent&&material!==this.mats.light;mesh.receiveShadow=true;parent.add(mesh);for(const g of geometries)g.dispose();}this.batches.clear();this.batchTrees();}
obstacle(f,x,z,w,d){this.obstacles[0].push([x-w/2,z-d/2,x+w/2,z+d/2]);}
action(f,x,z,label,kind,extra={}){this.interactions.push({x,z,label,kind,...extra});}
    box(parent,x,y,z,sx,sy,sz,material){const rounded=[this.mats.wood,this.mats.green,this.mats.leather].includes(material)&&sx>.3&&sz>.3;let g=rounded?DesklyOfficeRealism.rounded(sx,sy,sz,Math.min(.07,sx/8,sz/8)):new T.BoxGeometry(sx,sy,sz);g.translate(x,y+sy/2,z);if(material.map)g=DesklyOfficeMaterials.projectUV(g,material===this.mats.carpet?.78:material===this.mats.green?.48:material===this.mats.woodFloor?1.7:material===this.mats.paint?1.8:.9,T);if(!this.batches.has(parent))this.batches.set(parent,new Map());const b=this.batches.get(parent);if(!b.has(material))b.set(material,[]);b.get(material).push(g);}
    exterior(){const m=this.mats,g=this.campus,s=this.shell;this.box(g,30,-.22,10,260,.2,240,m.grass);this.box(g,30,-.21,-12,95,.2,18,m.paving);this.box(g,30,-.125,-32,200,.12,12,m.road);this.box(g,30,-.09,-24,200,.08,3,m.stone);this.box(g,30,-.09,-40,200,.08,3,m.stone);this.box(g,20,-.06,-10,7,.07,20,m.paving);
      for(let x=-55;x<110;x+=10)this.box(g,x,.002,-32,4,.015,.12,m.light);
      for(let i=0;i<6;i++)this.box(g,20,.002,-36+i*1.5,4,.02,.65,m.paving);
      const rackCurve=new T.CatmullRomCurve3([new T.Vector3(-.35,0,0),new T.Vector3(-.35,.65,0),new T.Vector3(0,.85,0),new T.Vector3(.35,.65,0),new T.Vector3(.35,0,0)]),racks=new T.InstancedMesh(new T.TubeGeometry(rackCurve,24,.028,8,false),m.metal,5);for(let i=0;i<5;i++)racks.setMatrixAt(i,new T.Matrix4().makeTranslation(9+i*.9,0,-20));racks.castShadow=racks.receiveShadow=true;g.add(racks);this.obstacle(0,10.8,-20,5,.3);
      for(const x of [-10,5,38,62,78]){this.box(g,x,0,-20,.12,5,.12,m.metal);this.box(g,x,4.9,-20,1.6,.08,.4,m.light);this.box(g,x,0,-17,3,.6,1.5,m.stone);this.obstacle(0,x,-17,3,1.5);}
      for(const x of [-15,-9,52,58,64]){this.car(g,x,-27);this.obstacle(0,x,-27,4.2,1.9);}
      for(const [x,z]of [[-12,12],[-12,24],[72,12],[72,24],[15,45],[35,45],[52,45]]){this.box(g,x,0,z,3,.4,1.2,m.stone);this.box(g,x,.4,z,2.8,.1,1,m.wood);this.action(0,x,z+1.5,'Sit in the courtyard','outdoorSeat',{seat:{p:[x,0,z],f:[0,1],seat:.5,floor:0,room:'Courtyard'}});this.obstacle(0,x,z,3,1.2);}
      // Fountain: real shallow water surface and a stone basin, bounded collision.
      this.box(g,42,0,-12,5,.45,4,m.stone);this.box(g,42,.45,-12,4.5,.03,3.5,m.glass);this.box(g,42,.5,-12,.45,1.1,.45,m.stone);this.obstacle(0,42,-12,5,4);this.action(0,42,-9,'Pause by the fountain','fountain');
      for(const [x,z,h,sx,sz]of [[-45,15,25,20,30],[100,20,35,24,34],[-30,80,42,26,24],[30,100,55,30,20],[85,85,30,28,24],[-60,-70,32,30,24],[90,-75,48,25,30]]){this.box(g,x,0,z,sx,h,sz,m.stone);for(let y=3;y<h;y+=4)this.box(g,x,y,z-sz/2-.02,sx-.8,1.7,.08,m.glass);}
      // Reuse the authored tree sources with shared geometry and materials.
      const source=wTree(this.world);if(source){this.treeGroups.push(...source.children);for(let i=0;i<8;i++){const tree=source.children[i%source.children.length].clone(true);tree.position.set(i<4?-18:78,0,2+(i%4)*12);g.add(tree);this.treeGroups.push(tree);}}
      function wTree(w){return w.envelope?.trees;}
      this.streetDetails();
    }
    streetDetails(){
      const g=this.campus,m=this.mats;
      const trees=this.world.envelope?.trees?.children;
      for(const x of [8,29]){
        this.box(g,x,0,-11,2.4,.45,2.4,m.stone);this.box(g,x,.45,-11,2.15,.04,2.15,m.grass);this.obstacle(0,x,-11,2.4,2.4);
        if(trees?.length){const tree=trees[1%trees.length].clone(true);tree.position.set(x,.48,-11);tree.scale.setScalar(.75);g.add(tree);this.treeGroups.push(tree);}
        for(const dx of [-3,3]){
          this.box(g,x+dx,0,-11,.6,.48,2.6,m.stone);this.box(g,x+dx,.48,-11,.6,.06,2.6,m.wood);this.obstacle(0,x+dx,-11,.6,2.6);
          this.action(0,x+dx+(dx<0?-.7:.7),-11,'Sit in the entrance garden','outdoorSeat',{seat:{p:[x+dx,0,-11],f:[dx<0?1:-1,0],seat:.54,floor:0,room:'Entrance garden'}});
        }
      }
      // Planted edges, a small terrace, and an opposite street frontage give
      // the existing grounds a human scale without moving the office.
      for(const z of [4,16,28])for(const x of [-4,64]){
        this.box(g,x,0,z,2.5,.48,5,m.stone);this.box(g,x,.48,z,2.2,.08,4.7,m.grass);
        this.obstacle(0,x,z,2.5,5);
      }
      for(const x of [3,10,30,37,50,57]){
        this.box(g,x,-.045,-22,5,.035,.1,m.light);
        for(const dx of [-2.5,2.5])this.box(g,x+dx,-.045,-20.5,.08,.035,3,m.light);
      }
      for(const x of [-22,82])this.box(g,x,-.07,19,3,.07,48,m.paving);
      this.box(g,30,-.07,44,75,.07,5,m.paving);
      this.box(g,30,0,48,75,.24,.3,m.stone);
      // Rear terrace: visible seating, tables, and shade pergolas.
      for(const x of [8,24,40,56]){
        this.box(g,x,-.055,52,10,.06,7,m.paving);
        for(const dx of [-3,3])for(const dz of [-2.5,2.5])this.box(g,x+dx,0,52+dz,.12,2.65,.12,m.metal);
        for(let dx=-3;dx<=3;dx+=.6)this.box(g,x+dx,2.65,52,.12,.12,5.4,m.wood);
        this.box(g,x,0,52,.16,.72,.16,m.metal);this.box(g,x,.72,52,2.2,.08,1.1,m.wood);
        this.obstacle(0,x,52,2.2,1.1);
        for(const dz of [-1.25,1.25]){
          this.box(g,x,0,52+dz,2.4,.48,.5,m.stone);this.box(g,x,.48,52+dz,2.4,.06,.5,m.wood);
          this.obstacle(0,x,52+dz,2.4,.5);
          this.action(0,x,52+dz+(dz<0?-.7:.7),'Sit on the garden terrace','outdoorSeat',{seat:{p:[x,0,52+dz],f:[0,dz<0?1:-1],seat:.54,floor:0,room:'Garden terrace'}});
        }
      }
      // A low street block is nearer than the skyline: doors, shop glazing,
      // awnings, piers, and lit upper windows, all batched by material.
      for(const [x,width,height]of [[-11,14,9],[7,18,12],[34,20,10],[60,16,14]]){
        this.box(g,x,0,-52,width,height,10,m.stone);this.obstacle(0,x,-52,width,10);
        for(let dx=-width/2+2;dx<width/2;dx+=3.3){
          this.box(g,x+dx,.5,-46.99,2.4,2.65,.02,m.dark);
          this.box(g,x+dx,.5,-46.97,2.4,2.65,.05,m.glass);
          this.box(g,x+dx,3.1,-46.65,2.65,.16,.8,m.dark);
          for(let y=4.5;y<height-1;y+=2.8){this.box(g,x+dx,y,-46.99,1.9,1.65,.02,m.dark);this.box(g,x+dx,y,-46.94,1.9,1.65,.06,m.glass);}
        }
        this.box(g,x,.02,-46.9,1.2,2.7,.08,m.dark);
        this.box(g,x,height,-52,width+.4,.2,10.4,m.metal);
      }
      // Sheltered transit stop beside the existing pavement.
      for(const x of [42,48])this.box(g,x,0,-40,.12,2.8,.12,m.metal);
      this.box(g,45,2.8,-40,6.4,.12,2.6,m.dark);
      this.box(g,45,.15,-41,6,2.55,.05,m.glass);
      this.box(g,45,0,-40,4.3,.5,.55,m.stone);this.obstacle(0,45,-40,4.3,.55);
      this.traffic=[];
      for(let i=0;i<2;i++){const vehicle=this.car(g,-40+i*100,-34+i*4);const bounds=[vehicle.position.x-2.2,vehicle.position.z-1,vehicle.position.x+2.2,vehicle.position.z+1];this.obstacles[0].push(bounds);vehicle.rotation.y=i?Math.PI:0;this.traffic.push({vehicle,bounds,direction:i?-1:1,speed:3.8+i*.6});}
    }
    car(parent,x,z){const group=new T.Group();group.position.set(x,0,z);parent.add(group);const paint=new T.MeshPhysicalMaterial({color:x<0?'#455568':'#65706c',roughness:.32,metalness:.35,clearcoat:.8}),rubber=new T.MeshStandardMaterial({color:'#1c2021',roughness:.94}),glass=new T.MeshPhysicalMaterial({color:'#263e49',roughness:.12,metalness:.25});const add=(geometry,material,pos,rotation)=>{const mesh=new T.Mesh(geometry,material);mesh.position.set(...pos);if(rotation)mesh.rotation.set(...rotation);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);};add(DesklyOfficeRealism.rounded(4.1,.58,1.8,.19,.04),paint,[0,.67,0]);add(DesklyOfficeRealism.rounded(2.3,.66,1.5,.19,.04),paint,[-.12,1.12,0]);this.box(group,-.12,1.04,0,2.05,.32,1.52,glass);this.box(group,-.2,1.03,0,.09,.36,1.55,paint);for(const px of [-1.3,1.3])for(const pz of [-.9,.9]){add(new T.CylinderGeometry(.32,.32,.2,24),rubber,[px,.32,pz],[Math.PI/2,0,0]);add(new T.CylinderGeometry(.18,.18,.21,12),this.mats.metal,[px,.32,pz],[Math.PI/2,0,0]);}for(const pz of [-.57,.57]){this.box(group,2.045,.65,pz,.025,.15,.45,this.mats.light);this.box(group,-2.045,.65,pz,.025,.12,.4,this.mats.dark);}this.box(group,2.06,.45,0,.025,.09,.55,this.mats.dark);this.box(group,-2.06,.45,0,.025,.1,.4,this.mats.paving);return group;}

attach(app,office){this.app=app;this.nav=new CampusNav(office,this.obstacles[0],app.data.layout.spawn);app.player.nav=this.nav;return this.nav;}
objects(){return this.interactions.map(o=>({...o,key:'campus:'+o.kind+':'+o.x+':'+o.z,r:1.9,short:'Use',fn:()=>o.kind==='outdoorSeat'?this.app.sit(o.seat):this.app.ui.toast('Take a moment by the courtyard fountain.','#e8c785')}));}
batchTrees(){
  const templates=new Map();this.treeBatches=[];this.world.scene.updateMatrixWorld(true);
  for(const tree of this.treeGroups){const model=tree.children[0],meshes=[];model.traverse(m=>{if(m.isMesh&&!Array.isArray(m.material))meshes.push(m);});const key=meshes.map(m=>m.geometry.uuid+':'+m.material.uuid).join('|');let template=templates.get(key);
    if(!template){template=[];const inverse=model.matrixWorld.clone().invert();for(let level=0;level<3;level++){const groups=new Map();for(const m of meshes){let group=groups.get(m.material);if(!group){group=[];groups.set(m.material,group);}const source=level===0?m.geometry:(m.geometry.treeDetails?.[level-1]||m.geometry);let g=source.index?source.toNonIndexed():source.clone();g.applyMatrix4(inverse.clone().multiply(m.matrixWorld));group.push(g);}for(const [material,geometries]of groups){const merged=T.BufferGeometryUtils.mergeBufferGeometries(geometries,false);const geometry=merged&&T.BufferGeometryUtils.mergeVertices(merged);merged?.dispose();if(!geometry)throw Error('Cannot batch tree geometry');geometries.forEach(g=>g.dispose());template.push({geometry,material,level,entries:[]});}}templates.set(key,template);}
    const sphere=new T.Box3().setFromObject(tree).getBoundingSphere(new T.Sphere());for(const b of template)b.entries.push({tree,sphere,matrix:model.matrixWorld.clone()});for(const m of meshes)m.visible=false;
  }
  for(const template of templates.values())for(const b of template){const mesh=new T.InstancedMesh(b.geometry,b.material,b.entries.length);mesh.frustumCulled=false;mesh.receiveShadow=true;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.name='Campus_Instanced_Tree';b.entries.forEach((e,i)=>mesh.setMatrixAt(i,e.matrix));this.world.scene.add(mesh);this.treeBatches.push({...b,mesh});}
  this.treeFrustum=new T.Frustum();this.treeMatrix=new T.Matrix4();this.treeProjection=new T.Matrix4();
}
update(dt){if(!this.app)return;for(const car of this.traffic||[]){const p=this.app.player.pos,v=car.vehicle.position;if(!(Math.abs(p.z-v.z)<2.5&&Math.abs(p.x-v.x)<6)){v.x+=car.direction*car.speed*dt;if(v.x>115)v.x=-70;if(v.x< -70)v.x=115;}car.bounds[0]=v.x-2.2;car.bounds[2]=v.x+2.2;}this.treeT=(this.treeT||0)-dt;if(this.treeT<=0){this.treeT=1/15;this.app.camera.updateMatrixWorld(true);this.treeProjection.copy(this.app.camera.projectionMatrix);this.treeProjection.elements[0]*=.75;this.treeProjection.elements[5]*=.75;this.treeFrustum.setFromProjectionMatrix(this.treeMatrix.multiplyMatrices(this.treeProjection,this.app.camera.matrixWorldInverse));for(const b of this.treeBatches||[]){let count=0,near=false;for(const e of b.entries){const d=e.tree.position.distanceTo(this.app.camera.position);const level=d<12?0:d<32?1:2;if(d<85&&level===b.level&&this.treeFrustum.intersectsSphere(e.sphere)){b.mesh.setMatrixAt(count++,e.matrix);near ||= d<26;}}b.mesh.count=count;b.mesh.visible=count>0;b.mesh.castShadow=near;b.mesh.instanceMatrix.needsUpdate=true;}for(const tree of this.treeGroups){const d=tree.position.distanceTo(this.app.camera.position);tree.visible=d<85;tree.traverse(m=>{if(m.isMesh)m.castShadow=d<32;});}}this.ambientT=(this.ambientT||0)-dt;if(this.ambientT<=0){this.ambientT=12+Math.random()*8;const p=this.app.player.pos;if(this.app.playing&&(p.z<0||p.z>36||p.x<0||p.x>60))this.app.audio.play('courtyard',{gain:.24,night:(this.app.clockInfo?.hour??12)<6||(this.app.clockInfo?.hour??12)>=19});}}
}
class CampusNav{
constructor(office,obstacles,entry){this.office=office;this.obstacles=obstacles;this.entry=entry;}
inGrid(p){const n=this.office;return p.x>=n.x0&&p.x<n.x0+n.nx*n.cell&&p.z>=n.z0&&p.z<n.z0+n.nz*n.cell;}
blockedAt(x,z,inflated){if(x<-32||x>92||z<-55||z>72||this.obstacles.some(r=>inside({x,z},r)))return true;return this.inGrid({x,z})?this.office.blockedAt(x,z,inflated):false;}
move(p,dx,dz,r=.22){const n=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.08));for(let i=0;i<n;i++){const hit=(x,z)=>{if(this.blockedAt(x,z)||this.doorBlocked?.(x,z))return true;for(let k=0;k<8;k++){const a=k*Math.PI/4;if(this.blockedAt(x+Math.cos(a)*r,z+Math.sin(a)*r)||this.doorBlocked?.(x+Math.cos(a)*r,z+Math.sin(a)*r))return true;}return false;};if(!hit(p.x+dx/n,p.z))p.x+=dx/n;if(!hit(p.x,p.z+dz/n))p.z+=dz/n;}}
path(from,to){const a=this.inGrid(from),b=this.inGrid(to),entry=this.entry;if(a&&b)return this.office.path(from,to);if(a){const first=this.office.path(from,entry),last=this.outsidePath(entry,to);return first&&last?[...first,...last]:null;}if(b){const first=this.outsidePath(from,entry),last=this.office.path(entry,to);return first&&last?[...first,...last]:null;}return this.outsidePath(from,to);}
    outsidePath(from,to){
      // A compact visibility graph follows corners of solid furniture instead
      // of letting employees walk through it in the new rooms.
      if(this.blockedAt(to.x,to.z))return null;
      const points=[{x:from.x,z:from.z},{x:to.x,z:to.z}];
      for(const r of this.obstacles)for(const x of [r[0]-.45,r[2]+.45])for(const z of [r[1]-.45,r[3]+.45])if(!this.blockedAt(x,z))points.push({x,z});
      // Entrance waypoints route around the outside of the building walls.
      points.push({x:-1,z:-1},{x:61,z:-1},{x:-1,z:37},{x:61,z:37},{x:20,z:-6.4});
      const clear=(a,b)=>{const n=Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/.15);for(let i=1;i<=n;i++)if(this.blockedAt(a.x+(b.x-a.x)*i/n,a.z+(b.z-a.z)*i/n))return false;return true;};
      const dist=points.map(()=>Infinity),prev=points.map(()=>-1),done=new Set();dist[0]=0;
      for(let k=0;k<points.length;k++){let a=-1;for(let i=0;i<points.length;i++)if(!done.has(i)&&(a<0||dist[i]<dist[a]))a=i;if(a<0||!Number.isFinite(dist[a]))break;if(a===1)break;done.add(a);for(let b=0;b<points.length;b++)if(!done.has(b)&&clear(points[a],points[b])){const d=dist[a]+Math.hypot(points[a].x-points[b].x,points[a].z-points[b].z);if(d<dist[b]){dist[b]=d;prev[b]=a;}}}
      if(!Number.isFinite(dist[1]))return null;const out=[];for(let i=1;i>0;i=prev[i])out.unshift(points[i]);return out;
    }
}
window.DesklyCampus={Campus,CampusNav};})();
