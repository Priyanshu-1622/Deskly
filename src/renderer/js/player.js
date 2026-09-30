/* Deskly first-person player: WASD + mouse look (pointer lock, or drag when
   the frame refuses it), touch joystick + drag-look on phones, collision. */
(function () {
  const T = THREE;
  class Player {
    constructor(camera, dom, nav) {
      Object.assign(this, { camera, dom, nav });
      this.pos = new T.Vector3(20, 0, -6.4); this.sens = 1; this.invertY = false; this.yaw = 0; this.pitch = -0.02; this.eyeY = 1.66;
      this.keys = {}; this.enabled = false; this.bob = 0; this.coffee = 0; this.heldDrink = null; this.sipT = 0;
      this.move = { x: 0, z: 0 }; this.lookDrag = null; this.locked = false; this.sprint = false;
      this.touch = matchMedia('(pointer: coarse)').matches;
      this.bind();
      // first-person held cup
      const cup = new T.Group();
      const mat = new T.MeshStandardMaterial({ color: '#f4f2ee', roughness: 0.4 });
      const sl = new T.MeshStandardMaterial({ color: '#7a4e2d', roughness: 0.8 });
      const liquid = new T.MeshStandardMaterial({ color: '#4a2515', roughness: 0.35 });
      const c1 = new T.Mesh(new T.CylinderGeometry(0.04, 0.034, 0.11, 16), mat);
      const c2 = new T.Mesh(new T.CylinderGeometry(0.041, 0.041, 0.035, 16), sl); c2.position.y = 0.005;
      const lid = new T.Mesh(new T.CylinderGeometry(0.042, 0.042, 0.012, 16), new T.MeshStandardMaterial({ color: '#2a2a2a' })); lid.position.y = 0.06;
      const fill = new T.Mesh(new T.CylinderGeometry(0.031, 0.031, 0.006, 16), liquid); fill.position.y = 0.051;
      cup.add(c1, c2, fill, lid); cup.position.set(0.2, -0.2, -0.38); cup.visible = false;
      camera.add(cup); Object.assign(this, { cup, cupLid: lid, cupSleeve: c2, cupLiquid: fill });
    }
    bind() {
      const d = this.dom;
      addEventListener('keydown', e => {
        if (e.target.closest && e.target.closest('input,textarea')) return;
        this.keys[e.code] = true;
      });
      addEventListener('keyup', e => { this.keys[e.code] = false; });
      addEventListener('blur', () => { this.keys = {}; });
      document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === d; });
      document.addEventListener('mousemove', e => {
        if (!this.enabled) return;
        if (this.locked) this.look(e.movementX, e.movementY, 0.0022);
      });
      d.addEventListener('mousedown', e => {
        if (!this.enabled || this.touch) return;
        if (!this.locked && d.requestPointerLock) {
          try { const r = d.requestPointerLock(); if (r && r.catch) r.catch(() => { }); } catch (err) { }
        }
        this.lookDrag = { x: e.clientX, y: e.clientY, mouse: true };
      });
      addEventListener('mouseup', () => { if (this.lookDrag?.mouse) this.lookDrag = null; });
      addEventListener('mousemove', e => {
        if (this.lookDrag?.mouse && !this.locked) { this.look(e.clientX - this.lookDrag.x, e.clientY - this.lookDrag.y, 0.005); this.lookDrag.x = e.clientX; this.lookDrag.y = e.clientY; }
      });
      // touch: right side drags look; joystick handled by UI and fed via setMove
      d.addEventListener('touchstart', e => {
        for (const t of e.changedTouches) if (t.clientX > innerWidth * 0.4 && !this.touchLook) this.touchLook = { id: t.identifier, x: t.clientX, y: t.clientY };
      }, { passive: true });
      d.addEventListener('touchmove', e => {
        for (const t of e.changedTouches) if (this.touchLook && t.identifier === this.touchLook.id) {
          this.look(t.clientX - this.touchLook.x, t.clientY - this.touchLook.y, 0.0065);
          this.touchLook.x = t.clientX; this.touchLook.y = t.clientY;
        }
      }, { passive: true });
      const end = e => { for (const t of e.changedTouches) if (this.touchLook && t.identifier === this.touchLook.id) this.touchLook = null; };
      d.addEventListener('touchend', end); d.addEventListener('touchcancel', end);
    }
    look(dx, dy, k) {
      this.yaw -= dx * k * this.sens; this.pitch -= dy * k * this.sens * (this.invertY ? -1 : 1);
      this.pitch = Math.max(-1.35, Math.min(1.25, this.pitch));
    }
    releaseLock() { if (document.pointerLockElement) document.exitPointerLock?.(); this.lookDrag = null; }
    setMove(x, z) { this.move.x = x; this.move.z = z; }
    giveCoffee() { return this.giveDrink('coffee'); }
    giveDrink(type = 'coffee') {
      this.heldDrink = { type, remaining: 4, max: 4 };
      this.coffee = type === 'coffee' ? 1 : 0;
      this.cup.visible = true;
      this.cupSleeve.material.color.set(type === 'water' ? '#5c9fb8' : '#7a4e2d');
      this.cupLiquid.material.color.set(type === 'water' ? '#bce8f2' : '#4a2515');
      this.cupLid.visible = type === 'coffee';
      this.cupLiquid.visible = true;
      return this.heldDrink;
    }
    drink() {
      if (!this.heldDrink || this.heldDrink.remaining <= 0 || this.sipT > 0) return null;
      this.sipT = 0.9;
      this.heldDrink.remaining--;
      const result = { ...this.heldDrink };
      if (this.heldDrink.remaining <= 0) {
        this.cupLiquid.visible = false;
        result.empty = true;
      }
      return result;
    }
    discardDrink() {
      if (!this.heldDrink) return false;
      this.heldDrink = null; this.coffee = 0; this.sipT = 0; this.cup.visible = false;
      return true;
    }
    forward() { return new T.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
    update(dt) {
      let mx = this.move.x, mz = this.move.z;
      if (this.enabled) {
        const k = this.keys;
        if (k.KeyW || k.ArrowUp) mz += 1; if (k.KeyS || k.ArrowDown) mz -= 1;
        if (k.KeyA || k.ArrowLeft) mx -= 1; if (k.KeyD || k.ArrowRight) mx += 1;
        if (k.KeyQ) this.yaw += dt * 1.8; if (k.KeyE && false) this.yaw -= dt * 1.8;
      } else { mx = 0; mz = 0; }
      if (this.seated) { if (Math.hypot(mx, mz) > 0.01) { this.seated = false; this.eyeY = 1.66; this.onStand?.(); } mx = 0; mz = 0; }
      const len = Math.hypot(mx, mz);
      const run = this.keys.ShiftLeft || this.keys.ShiftRight || this.sprint;
      const speed = run ? 4.6 : 2.6;
      if (len > 0.01) {
        const f = this.forward(), r = new T.Vector3(-f.z, 0, f.x);
        const nx = mx / Math.max(1, len), nz = mz / Math.max(1, len);
        const vx = (f.x * nz + r.x * nx) * speed * dt, vz = (f.z * nz + r.z * nx) * speed * dt;
        this.nav.move(this.pos, vx, vz);
        if (this.eyeY < 1.5) this.eyeY = 1.66;
        this.bob += dt * (run ? 11 : 8) * Math.min(1, len);
      }
      const bobY = len > 0.01 ? Math.sin(this.bob) * 0.022 : 0;
      this.camera.position.set(this.pos.x, this.eyeY + bobY, this.pos.z);
      this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
      if (this.sipT > 0) this.sipT = Math.max(0, this.sipT - dt);
      if (this.heldDrink) {
        const sip = this.sipT > 0 ? Math.sin((1 - this.sipT / 0.9) * Math.PI) : 0;
        this.cup.position.set(0.2 - sip * 0.12, -0.2 + bobY * 0.5 + sip * 0.19, -0.38 + sip * 0.16);
        this.cup.rotation.set(-sip * 0.85, 0, sip * 0.12);
      }
    }
  }
  window.DesklyPlayer = Player;
})();
