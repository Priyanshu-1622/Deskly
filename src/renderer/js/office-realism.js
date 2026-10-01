/* First authored furniture sample. All placements retain the original world
   markers and the navigation grid. The original GLB remains the base scene. */
(function () {
  const T = THREE;
  function inBox(x, y, z, box) { return x >= box[0] && x <= box[3] && y >= box[1] && y <= box[4] && z >= box[2] && z <= box[5]; }
  function removeInside(geometry, boxes) {
    const p = geometry.attributes.position, index = geometry.index, keep = [];
    const count = index ? index.count : p.count;
    for (let i = 0; i < count; i += 3) {
      const vertices = [0, 1, 2].map(n => index ? index.getX(i + n) : i + n);
      const remove = boxes.some(box => vertices.every(v => inBox(p.getX(v), p.getY(v), p.getZ(v), box)));
      if (!remove) keep.push(...vertices);
    }
    const result = geometry.clone(); result.setIndex(keep); return result;
  }
  function rounded(w, h, d, corner = 0.025, bevel = 0.003) {
    bevel = Math.min(bevel, h / 4);
    const x = w / 2 - bevel, z = d / 2 - bevel, r = Math.min(corner, x * 0.8, z * 0.8);
    const shape = new T.Shape();
    shape.moveTo(-x + r, -z); shape.lineTo(x - r, -z); shape.absarc(x - r, -z + r, r, -Math.PI / 2, 0, false);
    shape.lineTo(x, z - r); shape.absarc(x - r, z - r, r, 0, Math.PI / 2, false);
    shape.lineTo(-x + r, z); shape.absarc(-x + r, z - r, r, Math.PI / 2, Math.PI, false);
    shape.lineTo(-x, -z + r); shape.absarc(-x + r, -z + r, r, Math.PI, Math.PI * 1.5, false);
    const g = new T.ExtrudeGeometry(shape, { depth: h - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 6 });
    g.translate(0, 0, -h / 2 + bevel); g.rotateX(-Math.PI / 2); return g;
  }
  function workstation(world) {
    const group = new T.Group(); group.name = 'CEO_Realistic_Workstation';
    const mats = world.officeMaterials.materials;
    const wood = mats.get('walnut'), leather = mats.get('leather');
    const paint = new T.MeshStandardMaterial({ color: '#24282b', roughness: 0.4, metalness: 0 });
    const rubber = new T.MeshStandardMaterial({ color: '#151719', roughness: 0.82 });
    const steel = new T.MeshStandardMaterial({ color: '#a3abb0', roughness: 0.24, metalness: 1 });
    const ceramic = new T.MeshPhysicalMaterial({ color: '#e8e5df', roughness: 0.18, clearcoat: 0.7, clearcoatRoughness: 0.12 });
    const paper = new T.MeshStandardMaterial({ color: '#e7e1d4', roughness: 0.92 });
    const glass = new T.MeshPhysicalMaterial({ color: '#1c242b', roughness: 0.14, metalness: 0, clearcoat: 0.6 });
    const add = (geometry, material, position, rotation) => {
      if (material === wood || material === leather) geometry = DesklyOfficeMaterials.projectUV(geometry, material === wood ? 1.1 : 0.32, T);
      const mesh = new T.Mesh(geometry, material); mesh.position.set(...position); if (rotation) mesh.rotation.set(...rotation);
      mesh.castShadow = mesh.receiveShadow = true; group.add(mesh); return mesh;
    };
    const box = (w, h, d, mat, p, r = 0.02, rot) => add(rounded(w, h, d, r), mat, p, rot);
    const tube = (a, b, radius, mat = steel) => {
      const start = new T.Vector3(...a), end = new T.Vector3(...b), delta = end.clone().sub(start);
      const m = add(new T.CylinderGeometry(radius, radius, delta.length(), 12), mat, start.add(end).multiplyScalar(0.5).toArray());
      m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize()); return m;
    };
    // Same 3.2 x 1.0 m desk footprint and 0.77 m top as the original.
    box(3.2, 0.05, 1, wood, [5, 0.745, 33.4], 0.04);
    box(0.09, 0.7, 0.94, wood, [3.455, 0.35, 33.4]);
    box(0.09, 0.7, 0.94, wood, [6.545, 0.35, 33.4]);
    box(2.98, 0.43, 0.036, wood, [5, 0.465, 32.93], 0.01);
    box(0.67, 0.65, 0.39, wood, [6.155, 0.325, 33.69]);
    for (let i = 0; i < 3; i++) {
      box(0.6, 0.195, 0.014, wood, [6.155, 0.13 + i * 0.207, 33.892], 0.008);
      tube([6.04, 0.2 + i * 0.207, 33.913], [6.27, 0.2 + i * 0.207, 33.913], 0.007);
    }
    // Monitor faces align exactly with the existing live screen markers.
    const monitors = world.markers.filter(m => m.room === 'CEO_Office' && m.kind === 'screen');
    for (const m of monitors) {
      box(m.w + 0.03, m.h + 0.03, 0.032, paint, [m.p[0], m.p[1], m.p[2] - 0.027], 0.008);
      add(new T.PlaneGeometry(m.w, m.h), glass, [m.p[0], m.p[1], m.p[2] - 0.003]);
      tube([m.p[0], 0.79, 33.205], [m.p[0], 1.04, 33.205], 0.014, paint);
      box(0.22, 0.012, 0.18, paint, [m.p[0], 0.782, 33.215], 0.04);
      add(new T.SphereGeometry(0.003, 8, 6), new T.MeshBasicMaterial({ color: '#83ada1' }), [m.p[0] + 0.235, m.p[1] - 0.161, m.p[2]]);
    }
    box(0.92, 0.003, 0.34, leather, [5.22, 0.773, 33.6], 0.025);
    box(0.5, 0.02, 0.15, paint, [5, 0.788, 33.575], 0.012);
    const keyGeometry = rounded(0.024, 0.006, 0.021, 0.003, 0.001);
    const keys = new T.InstancedMesh(keyGeometry, new T.MeshStandardMaterial({ color: '#464b4e', roughness: 0.63 }), 56);
    const matrix = new T.Matrix4(); let key = 0;
    for (let row = 0; row < 4; row++) for (let col = 0; col < 14; col++) {
      matrix.makeTranslation(4.805 + col * 0.028, 0.8, 33.525 + row * 0.025); keys.setMatrixAt(key++, matrix);
    }
    keys.castShadow = keys.receiveShadow = true; group.add(keys);
    box(0.14, 0.006, 0.02, paint, [5, 0.801, 33.635], 0.004);
    const mouse = add(new T.SphereGeometry(1, 24, 12), paint, [5.5, 0.784, 33.59]); mouse.scale.set(0.03, 0.017, 0.05);
    tube([5.5, 0.793, 33.561], [5.5, 0.793, 33.58], 0.003, rubber);
    // Open ceramic mug: real wall thickness, lip and a curved handle.
    const profile = [[0, 0], [.034, 0], [.04, .008], [.043, .087], [.042, .095], [.037, .095], [.036, .012], [0, .012]].map(p => new T.Vector2(...p));
    add(new T.LatheGeometry(profile, 40), ceramic, [5.88, 0.772, 33.57]);
    const handle = new T.CatmullRomCurve3([new T.Vector3(.038, .018, 0), new T.Vector3(.074, .025, 0), new T.Vector3(.074, .073, 0), new T.Vector3(.04, .081, 0)]);
    add(new T.TubeGeometry(handle, 24, 0.006, 8, false), ceramic, [5.88, 0.772, 33.57]);
    const coffee = new T.MeshPhysicalMaterial({ color: '#25120c', roughness: 0.17 });
    add(new T.CylinderGeometry(.036, .036, .001, 40), coffee, [5.88, .857, 33.57]);
    box(0.27, 0.018, 0.2, leather, [4.02, 0.786, 33.54], 0.009);
    box(0.257, 0.012, 0.19, paper, [4.02, 0.786, 33.54], 0.006);
    tube([4.17, 0.785, 33.46], [4.18, 0.785, 33.63], .004, paint);
    // Same founder seat centre, height, facing and outer caster footprint.
    const cx = 5, cz = 34.3;
    box(.5, .08, .48, leather, [cx, .48, cz], .065);
    box(.46, .085, .61, leather, [cx, .9, cz + .27], .055, [Math.PI / 2 + .09, 0, 0]);
    box(.39, .075, .14, leather, [cx, 1.235, cz + .3], .045, [Math.PI / 2 + .09, 0, 0]);
    tube([cx, .12, cz], [cx, .44, cz], .029);
    box(.21, .045, .19, paint, [cx, .415, cz], .02);
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5, x = cx + Math.cos(a) * .29, z = cz + Math.sin(a) * .29;
      tube([cx, .14, cz], [x, .08, z], .02);
      const wheel = add(new T.CylinderGeometry(.031, .031, .034, 16), rubber, [x, .035, z], [Math.PI / 2, 0, a]);
      wheel.rotation.z = a;
    }
    for (const side of [-1, 1]) {
      const x = cx + side * .27;
      tube([x, .47, cz + .08], [x, .68, cz + .08], .012);
      box(.075, .025, .27, leather, [x, .695, cz - .015], .024);
    }
    // Merge static pieces by material, retaining the instanced keyboard.
    group.updateMatrixWorld(true);
    const batches = new Map();
    for (const mesh of [...group.children]) {
      if (!mesh.isMesh || mesh.isInstancedMesh) continue;
      const list = batches.get(mesh.material) || []; list.push(mesh.geometry.clone().applyMatrix4(mesh.matrix)); batches.set(mesh.material, list); group.remove(mesh);
      mesh.geometry.dispose();
    }
    for (const [mat, geometries] of batches) {
      const normalized = geometries.map(g => { const v = g.index ? g.toNonIndexed() : g; return v; });
      const geometry = T.BufferGeometryUtils.mergeBufferGeometries(normalized, false);
      if (!geometry) throw new Error('Could not batch workstation geometry');
      const mesh = new T.Mesh(geometry, mat); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
      for (const g of new Set([...geometries, ...normalized])) g.dispose();
    }
    return group;
  }
  async function apply(world, base) {
    const sample = workstation(world);
    // Only remove triangles fully within a known furniture volume in this room.
    const regions = [[3.39, .02, 32.89, 6.61, 1.48, 33.91], [4.66, .001, 33.95, 5.34, 1.34, 34.64]];
    base.traverse(mesh => { if (mesh.isMesh && mesh.name.startsWith('CEO_Office_')) { const old = mesh.geometry; mesh.geometry = removeInside(old, regions); old.dispose(); } });
    world.scene.add(sample);
    try {
      const gltf = await new T.GLTFLoader().loadAsync('assets/models/modern_arm_chair_01/modern_arm_chair_01_2k.gltf');
      const model = gltf.scene, bounds = new T.Box3().setFromObject(model), size = bounds.getSize(new T.Vector3());
      const scale = Math.min(.8 / size.x, .8 / size.z, .95 / size.y);
      model.scale.setScalar(scale);
      model.position.set(-(bounds.min.x + size.x / 2) * scale, -bounds.min.y * scale, -(bounds.min.z + size.z / 2) * scale);
      const wrapper = new T.Group(); wrapper.add(model); wrapper.position.set(2.6, 0, 29.7); wrapper.rotation.y = Math.PI * 160 / 180;
      wrapper.name = 'CEO_Authored_Lounge_Chair';
      model.traverse(m => { if (m.isMesh) { m.castShadow = m.receiveShadow = true; if (m.material) m.material.envMapIntensity = .7; } });
      base.traverse(mesh => { if (mesh.isMesh && mesh.name.startsWith('CEO_Office_')) { const old = mesh.geometry; mesh.geometry = removeInside(old, [[2.05, .02, 29.15, 3.15, 1.02, 30.25]]); old.dispose(); } });
      world.scene.add(wrapper);
    } catch (error) { console.warn('The authored lounge chair could not load; original chair retained.', error); }
    return { workstation: sample };
  }
  window.DesklyOfficeRealism = { apply, removeInside, rounded };
})();
