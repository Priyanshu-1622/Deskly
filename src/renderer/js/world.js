/* Deskly world: loads the generated office, adds lighting, animated doors and
   lifts, and the in-world workstation screens that mirror real task state. */
(function () {
  const T = THREE;

  class World {
    constructor(renderer) {
      this.renderer = renderer;
      this.scene = new T.Scene();
      this.scene.background = new T.Color('#cfe0ea');
      this.scene.fog = new T.Fog('#cfe0ea', 60, 140);
      const hemi = new T.HemisphereLight(0xffffff, 0x8a8478, 0.95);
      const sun = new T.DirectionalLight(0xfff4e2, 0.85); sun.position.set(40, 60, -30);
      const fill = new T.DirectionalLight(0xdfe9ff, 0.25); fill.position.set(-30, 25, 50);
      const moon = new T.DirectionalLight(0xb8d0ff, 0);
      this.shadowFocus = new T.Vector3(5, 0, 31);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 150 });
      sun.shadow.bias = -0.00015; sun.shadow.normalBias = 0.025;
      sun.shadow.camera.updateProjectionMatrix();
      const sky = DesklyOfficeSky.create(T);
      const indoor = [[8, 16], [20, 16], [31, 16], [43, 16], [54, 16], [8, 31], [17, 31], [28, 31], [40, 31], [53, 31], [20, 5]]
        .map(([x, z]) => { const l = new T.PointLight(0xffe6bf, 0, 13, 2); l.position.set(x, 2.9, z); return l; });
      Object.assign(this, { hemi, sun, fill, moon, sky, indoor, lightingMode: 'day' });
      this.scene.add(hemi, sun, sun.target, fill, moon, sky.mesh, ...indoor);
      this.doors = []; this.lifts = []; this.screens = [];
      this.setTime(DesklyOfficeTime.info(new Date()));
    }

    setLighting(mode = 'day') {
      if (!['day', 'focus', 'evening'].includes(mode)) return;
      this.lightingMode = mode;
      this.setTime(this.clockInfo || DesklyOfficeTime.info(new Date()));
    }

    setTime(clock) {
      this.clockInfo = clock;
      const position = DesklyOfficeTime.solar(clock);
      this.sunDirection = position.sun;
      const smooth = (a, b, n) => { const t = Math.max(0, Math.min(1, (n - a) / (b - a))); return t * t * (3 - 2 * t); };
      const day = smooth(-8, 7, position.elevation);
      const twilight = smooth(-12, -1, position.elevation) * (1 - smooth(4, 18, position.elevation));
      const s = position.sun, m = position.moon;
      this.sky.uniforms.sunDir.value.set(s.x, s.y, s.z);
      this.sky.uniforms.moonDir.value.set(m.x, m.y, m.z);
      this.sky.uniforms.daylight.value = day;
      this.sky.uniforms.twilight.value = twilight;
      this.sky.uniforms.moonPhase.value = position.phase;
      this.sun.position.set(s.x * 70, s.y * 70, s.z * 70);
      this.sun.color.set('#ffffff').lerp(new T.Color('#ffab68'), twilight * 0.7);
      this.sun.intensity = Math.max(0, s.y) * 1.05 * (this.lightingMode === 'focus' ? 0.8 : 1);
      this.moon.position.set(m.x * 70, m.y * 70, m.z * 70);
      this.moon.intensity = Math.max(0, m.y) * (1 - day) * (0.08 + 0.09 * Math.abs(Math.sin(Math.PI * position.phase)));
      this.hemi.intensity = 0.08 + day * (this.lightingMode === 'focus' ? 0.35 : 0.48);
      this.fill.intensity = 0.045 + day * 0.09;
      const interior = (1 - smooth(-3, 15, position.elevation)) * (this.lightingMode === 'focus' ? 0.72 : 0.88);
      for (const light of this.indoor) light.intensity = .5 + interior;
      const materials = new Set();
      this.scene.traverse(o => { if (o.isMesh) for (const material of (Array.isArray(o.material) ? o.material : [o.material])) if (material?.isMeshStandardMaterial) materials.add(material); });
      for (const material of materials) {
        material.userData.dayEnvironmentIntensity ??= material.envMapIntensity;
        material.envMapIntensity = material.userData.dayEnvironmentIntensity * (0.16 + day * 0.84);
      }
      const haze = new T.Color('#14243a').lerp(new T.Color('#bad9e9'), day).lerp(new T.Color('#df8d62'), twilight * 0.44);
      this.scene.fog.color.copy(haze);
      this.renderer.toneMappingExposure = 1.05 + (1 - day) * 0.13;
    }

    setCeoLamp(on) {
      if (this.ceoLamp) this.ceoLamp.intensity = on ? 1.25 : 0;
    }

    setQuality(quality) {
      this.renderer.shadowMap.enabled = quality !== 'low';
      const size = quality === 'high' ? 2048 : 1024;
      if (this.sun.shadow.mapSize.x !== size) {
        this.sun.shadow.mapSize.set(size, size);
        this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
      }
      this.sun.shadow.needsUpdate = true;
    }

    setShadowFocus(position) {
      // Keep texel-sized focus steps, rather than making static shadows crawl
      // continuously with small first-person camera movements.
      const step = 36 / this.sun.shadow.mapSize.x;
      this.shadowFocus.set(Math.round(position.x / step) * step, 0, Math.round(position.z / step) * step);
      const solar = this.sunDirection;
      if (solar) this.sun.position.set(solar.x * 70, solar.y * 70, solar.z * 70).add(this.shadowFocus);
      this.sun.target.position.copy(this.shadowFocus);
    }

    async load(onProgress) {
      const [data, b64] = await Promise.all([
        fetch('assets/world.json').then(r => { if (!r.ok) throw new Error('world.json ' + r.status); return r.json(); }),
        fetch('assets/office.glb').then(r => { if (!r.ok) throw new Error('office.glb ' + r.status); return r.arrayBuffer(); })
      ]);
      onProgress?.('Unpacking the office…');
      const gltf = await new Promise((res, rej) => new T.GLTFLoader().parse(b64, '', res, rej));
      // Remove redundant hanging signs; retain the CEO room door plaque.
      const signBoxes = [[8.7,2.4,8.5,13.7,3.6,8.9],[6.6,2.4,10.2,11.6,3.6,10.6],[6.6,2.4,21.7,11.6,3.6,22.1]];
      gltf.scene.traverse(mesh => { if (mesh.isMesh && mesh.name.startsWith('Dept_Engineering_')) {
        const old = mesh.geometry; mesh.geometry = DesklyOfficeRealism.removeInside(old, signBoxes); old.dispose();
      } });
      onProgress?.('Finishing office surfaces…');
      this.officeMaterials = await DesklyOfficeMaterials.apply(gltf.scene, T);
      const reflections = await new Promise((resolve, reject) => new T.TextureLoader().load(
        'assets/materials/office-reflections.jpg', resolve, undefined, reject));
      reflections.mapping = T.EquirectangularReflectionMapping;
      reflections.encoding = T.sRGBEncoding;
      const pmrem = new T.PMREMGenerator(this.renderer);
      this.environmentTarget = pmrem.fromEquirectangular(reflections);
      this.scene.environment = this.environmentTarget.texture;
      reflections.dispose(); pmrem.dispose();
      const glass = new T.MeshPhysicalMaterial({ color: '#c7e0e7', metalness: 0, roughness: 0.08,
        clearcoat: 1, clearcoatRoughness: 0.045, transparent: true, opacity: 0.27,
        depthWrite: false, side: T.DoubleSide, envMapIntensity: 0.55 });
      this.officeMaterials.materials.set('glass', glass);
      gltf.scene.traverse(o => {
        if (o.isMesh) {
          o.matrixAutoUpdate = false; o.updateMatrix();
          if (o.material.name === 'glass') o.material = glass;
          const m = o.material;
          o.receiveShadow = !m.transparent;
          o.castShadow = !m.transparent && !/^Floor_|^Outdoor_/.test(o.name);
          if (m.transparent) { m.depthWrite = false; o.renderOrder = 2; }
          if (/^screen/.test(m.name)) m.emissiveIntensity = 0.45;
        }
      });
      this.scene.add(gltf.scene);
      this.data = data;
      this.markers = data.markers;
      this.realism = await DesklyOfficeRealism.apply(this, gltf.scene);
      this.envelope = await DesklyOfficeEnvelope.apply(this, gltf.scene);
      const lamp = this.markers.find(m => m.kind === 'lamp' && m.room === 'CEO_Office');
      if (lamp) {
        this.ceoLamp = new T.PointLight(0xffdfac, 0, 4.6, 2);
        this.ceoLamp.position.set(lamp.p[0], 1.55, lamp.p[2]);
        this.scene.add(this.ceoLamp);
      }
      this.buildDoors(data.doors);
      this.buildLifts(data.lifts);
      this.campus = new DesklyCampus.Campus(this);
      return data;
    }

    finish(mesh, name) {
      const material = this.officeMaterials?.materials.get(name);
      if (material) {
        mesh.material = material;
        if (name !== 'glass') {
          const group = DesklyOfficeMaterials.groupFor(name);
          const metres = { oak: 0.9, concrete: 1.4, metal: 0.72 }[group];
          if (metres) mesh.geometry = DesklyOfficeMaterials.projectUV(mesh.geometry, metres, T);
        }
      }
      return mesh;
    }

    buildDoors(doors) {
      const wood = new T.MeshStandardMaterial({ color: '#8a6446', roughness: 0.55 });
      const steel = new T.MeshStandardMaterial({ color: '#9fa3a8', roughness: 0.35, metalness: 0.6 });
      const glass = new T.MeshStandardMaterial({ color: '#a9cfe0', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.32, depthWrite: false });
      const chrome = new T.MeshStandardMaterial({ color: '#d0d3d6', roughness: 0.2, metalness: 1 });
      for (const d of doors) {
        const w = d.s1 - d.s0 - 0.08, h = d.top - 0.03, kind = d.kind;
        const along = d.axis === 'x' ? new T.Vector3(1, 0, 0) : new T.Vector3(0, 0, 1);
        const c = d.axis === 'x' ? new T.Vector3((d.s0 + d.s1) / 2, 0, d.fixed) : new T.Vector3(d.fixed, 0, (d.s0 + d.s1) / 2);
        const door = { d, c, kind, open: 0, panels: [] };
        const makePanel = (pw, mat) => {
          const g = new T.Group();
          const p = new T.Mesh(new T.BoxGeometry(pw, h, 0.045), mat); p.position.set(pw / 2, h / 2 + 0.01, 0);
          this.finish(p, mat === glass ? 'glass' : mat === wood ? 'door_wood' : 'steel'); g.add(p);
          if (mat !== glass) {
            const hd = this.finish(new T.Mesh(new T.BoxGeometry(0.03, 0.02, 0.2), chrome), 'chrome'); hd.position.set(pw - 0.1, 1.02, 0); g.add(hd);
          } else {
            const hd = this.finish(new T.Mesh(new T.BoxGeometry(0.025, 0.8, 0.12), chrome), 'chrome'); hd.position.set(pw - 0.09, 1.1, 0); g.add(hd);
          }
          if (d.axis === 'z') g.rotation.y = -Math.PI / 2;
          this.scene.add(g); return g;
        };
        const start = d.axis === 'x' ? new T.Vector3(d.s0 + 0.04, 0, d.fixed) : new T.Vector3(d.fixed, 0, d.s0 + 0.04);
        if (kind === 'glassdoor' && w > 2) {           // double sliding entrance
          const a = makePanel(w / 2, glass), b = makePanel(w / 2, glass);
          a.position.copy(start); b.position.copy(start).addScaledVector(along, w / 2);
          door.panels = [{ g: a, base: a.position.clone(), dir: along.clone().multiplyScalar(-w / 2 + 0.05) }, { g: b, base: b.position.clone(), dir: along.clone().multiplyScalar(w / 2 - 0.05) }];
          door.slide = true;
        } else if (kind === 'glassdoor') {
          const a = makePanel(w, glass); a.position.copy(start);
          door.panels = [{ g: a, base: a.position.clone(), dir: along.clone().multiplyScalar(w * 0.92) }]; door.slide = true;
          a.position.addScaledVector(d.axis === 'x' ? new T.Vector3(0, 0, 0.05) : new T.Vector3(0.05, 0, 0), 1);
          door.panels[0].base = a.position.clone();
        } else {
          const a = makePanel(w, kind === 'exitdoor' ? steel : wood); a.position.copy(start);
          door.panels = [{ g: a, baseRot: a.rotation.y }]; door.slide = false;
        }
        this.doors.push(door);
      }
    }

    buildLifts(lifts) {
      const steel = new T.MeshStandardMaterial({ color: '#b3b7bc', roughness: 0.25, metalness: 0.85 });
      for (const L of lifts) {
        const w = (L.x1 - L.x0) / 2;
        const a = this.finish(new T.Mesh(new T.BoxGeometry(w, 2.2, 0.03), steel), 'steel'), b = a.clone();
        a.position.set(L.x0 + w / 2, 1.1, L.z); b.position.set(L.x1 - w / 2, 1.1, L.z);
        this.scene.add(a, b);
        this.lifts.push({ ...L, a, b, open: 0, want: 0, ax: a.position.x, bx: b.position.x, w });
      }
    }

    update(dt, agentsPositions) {
      for (const door of this.doors) {
        let near = false;
        for (const p of agentsPositions) { if (Math.abs(p.x - door.c.x) < 1.7 && Math.abs(p.z - door.c.z) < 1.7) { near = true; break; } }
        const target = near ? 1 : 0;
        if (door.wasNear !== undefined && door.wasNear !== near) this.onDoor?.(door, near);
        door.wasNear = near;
        door.open += (target - door.open) * Math.min(1, dt * (near ? 5 : 2.5));
        for (const pn of door.panels) {
          if (door.slide) pn.g.position.copy(pn.base).addScaledVector(pn.dir, door.open);
          else pn.g.rotation.y = pn.baseRot + door.open * 1.45;
        }
      }
      for (const L of this.lifts) {
        L.open += (L.want - L.open) * Math.min(1, dt * 2.5);
        L.a.position.x = L.ax - L.open * (L.w - 0.04); L.b.position.x = L.bx + L.open * (L.w - 0.04);
      }
    }

    // A live canvas screen laid over a monitor marker.
    addScreen(marker) {
      const W = 256, H = Math.round(256 * marker.h / marker.w);
      const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = Math.max(96, H);
      const tex = new T.CanvasTexture(canvas); tex.encoding = T.sRGBEncoding; tex.anisotropy = 4;
      const mat = new T.MeshBasicMaterial({ map: tex, toneMapped: false });
      const plane = new T.Mesh(new T.PlaneGeometry(marker.w, marker.h), mat);
      const [x, y, z] = marker.p; plane.position.set(x, y, z);
      plane.position.x += marker.f[0] * 0.004; plane.position.z += marker.f[1] * 0.004;
      plane.rotation.y = Math.atan2(marker.f[0], marker.f[1]);
      this.scene.add(plane);
      const s = { canvas, ctx: canvas.getContext('2d'), tex, plane, dirty: true };
      this.screens.push(s);
      return s;
    }
  }
  window.DesklyWorld = World;
})();
