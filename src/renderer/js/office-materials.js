/* Surface-only material pass for the existing office GLB. The source mesh has
   no UVs, so texture coordinates are projected from its unchanged positions.
   All colour/normal/roughness images are real photographed CC0 PBR sets. */
(function () {
  const ROOT = 'assets/materials/';
  const SETS = ['oak_veneer_02', 'walnut_veneer', 'wood_floor', 'white_stucco',
    'rough_concrete', 'poly_wool_herringbone', 'rough_linen', 'brown_leather'];

  const GROUPS = {
    oak: ['oak', 'door_wood'], walnut: ['walnut'], woodFloor: ['wood_floor'],
    concrete: ['concrete', 'slab', 'paving'], polished: ['floor_polished', 'tile', 'quartz'],
    carpet: ['carpet', 'carpet_accent', 'carpet_design', 'carpet_mkt', 'carpet_hr',
      'carpet_fin', 'carpet_res', 'carpet_sales', 'carpet_support', 'rug'],
    fabric: ['fabric_dark', 'fabric_blue', 'sofa_grey', 'sofa_green'],
    leather: ['leather'],
    painted: ['wall', 'wall_ext', 'accent', 'accent_warm'],
    coated: ['white_metal', 'cabinet', 'frame', 'pot', 'pot_dark', 'terracotta'],
    metal: ['steel', 'chrome', 'bronze'],
    plastic: ['black', 'keyboard', 'mat_purple', 'mat_teal', 'epoxy']
  };
  const LOOKS = {
    oak: { set: 'oak_veneer_02', metres: 0.9, normal: 0.42, roughness: 0.72, tint: '#ddd2bd' },
    walnut: { set: 'walnut_veneer', metres: 1.1, normal: 0.4, roughness: 0.76, tint: '#c3afa0' },
    woodFloor: { set: 'wood_floor', metres: 1.7, normal: 0.36, roughness: 0.72, tint: '#ded4c5' },
    concrete: { set: 'rough_concrete', metres: 1.4, normal: 0.14, roughness: 0.92, tint: '#c9cbd0' },
    polished: { set: 'white_stucco', metres: 1.9, normal: 0.018, roughness: 0.48, tint: '#f4f3f0' },
    carpet: { set: 'poly_wool_herringbone', metres: 0.78, normal: 0.27, roughness: 1, preserveColor: true },
    fabric: { set: 'rough_linen', metres: 0.48, normal: 0.32, roughness: 0.98, preserveColor: true },
    leather: { set: 'brown_leather', metres: 0.32, normal: 0.12, roughness: 0.7, tint: '#a79786' },
    painted: { set: 'white_stucco', metres: 1.8, normal: 0.095, roughness: 0.84, preserveColor: true },
    coated: { roughness: 0.42, metalness: 0 },
    metal: { roughness: 0.28, metalness: 1 },
    plastic: { roughness: 0.5, metalness: 0 }
  };
  const groupFor = name => Object.keys(GROUPS).find(group => GROUPS[group].includes(name));

  // UVs are generated only on the materialized meshes. A per-triangle axis
  // avoids stretching on the scene's floors, walls and box-built furniture.
  function projectUV(geometry, metres, THREE) {
    let g = geometry.index ? geometry.toNonIndexed() : geometry;
    const pos = g.getAttribute('position');
    const uv = new Float32Array(pos.count * 2);
    const scale = 1 / metres;
    for (let i = 0; i < pos.count; i += 3) {
      const ax = pos.getX(i), ay = pos.getY(i), az = pos.getZ(i);
      const bx = pos.getX(i + 1), by = pos.getY(i + 1), bz = pos.getZ(i + 1);
      const cx = pos.getX(i + 2), cy = pos.getY(i + 2), cz = pos.getZ(i + 2);
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx - ax, vy = cy - ay, vz = cz - az;
      const nx = Math.abs(uy * vz - uz * vy), ny = Math.abs(uz * vx - ux * vz), nz = Math.abs(ux * vy - uy * vx);
      const axis = ny >= nx && ny >= nz ? 1 : nx >= nz ? 0 : 2;
      for (let j = i; j < i + 3; j++) {
        const x = pos.getX(j), y = pos.getY(j), z = pos.getZ(j);
        uv[j * 2] = (axis === 0 ? z : x) * scale;
        uv[j * 2 + 1] = (axis === 1 ? z : y) * scale;
      }
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    return g;
  }

  async function loadSets(THREE) {
    const loader = new THREE.TextureLoader();
    const entries = await Promise.all(SETS.map(async id => {
      const maps = await Promise.all(['diffuse', 'nor_gl', 'rough'].map(type =>
        new Promise((resolve, reject) => loader.load(`${ROOT}${id}-${type}.jpg`, resolve, undefined, reject))));
      for (const map of maps) {
        map.wrapS = map.wrapT = THREE.RepeatWrapping;
        map.anisotropy = 8;
      }
      maps[0].encoding = THREE.sRGBEncoding;
      return [id, { color: maps[0], normal: maps[1], rough: maps[2] }];
    }));
    return Object.fromEntries(entries);
  }

  async function apply(scene, THREE) {
    const sets = await loadSets(THREE);
    const materials = new Map();
    let count = 0;
    scene.traverse(mesh => {
      if (!mesh.isMesh || !mesh.material || Array.isArray(mesh.material)) return;
      const original = mesh.material, group = groupFor(original.name);
      if (!group) return;
      const look = LOOKS[group], maps = sets[look.set];
      let material = materials.get(original.name);
      if (!material) {
        material = original.clone();
        material.map = maps?.color || null;
        material.normalMap = maps?.normal || null;
        material.normalScale = new THREE.Vector2(look.normal || 0, look.normal || 0);
        material.roughnessMap = maps?.rough || null;
        material.roughness = original.name === 'chrome' ? 0.13 : look.roughness;
        material.envMapIntensity = group === 'metal' ? 0.55 : 0.32;
        if (look.metalness != null) material.metalness = look.metalness;
        if (look.tint) material.color.set(look.tint);
        else if (look.preserveColor) material.color.multiplyScalar(group === 'carpet' ? 1.2 : 1.05);
        material.needsUpdate = true;
        materials.set(original.name, material);
      }
      if (look.set) mesh.geometry = projectUV(mesh.geometry, look.metres, THREE);
      mesh.material = material;
      count++;
    });
    return { materials, count, sets };
  }

  window.DesklyOfficeMaterials = { apply, projectUV, groupFor, GROUPS };
})();
