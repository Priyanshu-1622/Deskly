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
      this.scene.add(hemi, sun, fill);
      this.doors = []; this.lifts = []; this.screens = [];
    }

    async load(onProgress) {
      const [data, b64] = await Promise.all([
        fetch('assets/world.json').then(r => { if (!r.ok) throw new Error('world.json ' + r.status); return r.json(); }),
        fetch('assets/office.glb').then(r => { if (!r.ok) throw new Error('office.glb ' + r.status); return r.arrayBuffer(); })
      ]);
      onProgress?.('Unpacking the office…');
      const gltf = await new Promise((res, rej) => new T.GLTFLoader().parse(b64, '', res, rej));
      gltf.scene.traverse(o => {
        if (o.isMesh) {
          o.matrixAutoUpdate = false; o.updateMatrix();
          const m = o.material;
          if (m.transparent) { m.depthWrite = false; o.renderOrder = 2; }
          if (/^screen/.test(m.name)) m.emissiveIntensity = 0.45;
        }
      });
      this.scene.add(gltf.scene);
      this.data = data;
      this.markers = data.markers;
      this.buildDoors(data.doors);
      this.buildLifts(data.lifts);
      return data;
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
          const p = new T.Mesh(new T.BoxGeometry(pw, h, 0.045), mat); p.position.set(pw / 2, h / 2 + 0.01, 0); g.add(p);
          if (mat !== glass) {
            const hd = new T.Mesh(new T.BoxGeometry(0.03, 0.02, 0.2), chrome); hd.position.set(pw - 0.1, 1.02, 0); g.add(hd);
          } else {
            const hd = new T.Mesh(new T.BoxGeometry(0.025, 0.8, 0.12), chrome); hd.position.set(pw - 0.09, 1.1, 0); g.add(hd);
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
        const a = new T.Mesh(new T.BoxGeometry(w, 2.2, 0.03), steel), b = a.clone();
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
