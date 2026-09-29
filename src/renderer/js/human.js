/* Deskly — procedural human characters.
   Built entirely from code: a joint hierarchy with merged, vertex-coloured
   meshes per bone, a face with blinking eyes and a talking mouth, varied hair,
   clothing and accessories, and a procedural animation layer. */
(function () {
  const T = THREE;
  const merge = T.BufferGeometryUtils.mergeBufferGeometries;
  const MAT = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.02 });
  const MAT_GLOSS = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 0.0 });

  function paint(geo, color) {
    const c = new T.Color(color).convertSRGBToLinear();
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new T.BufferAttribute(arr, 3));
    if (!geo.index) {
      const idx = []; for (let i = 0; i < n; i++) idx.push(i); geo.setIndex(idx);
    }
    return geo;
  }
  function M(pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) {
    const m = new T.Matrix4();
    m.compose(new T.Vector3(...pos), new T.Quaternion().setFromEuler(new T.Euler(...rot)), new T.Vector3(...scl));
    return m;
  }
  const sph = (r, color, m, ws = 16, hs = 12, ps = 0, pl = Math.PI * 2, ts = 0, tl = Math.PI) =>
    paint(new T.SphereGeometry(r, ws, hs, ps, pl, ts, tl), color).applyMatrix4(m || M());
  const cap = (r, len, color, m, rs = 10) => paint(new T.CapsuleGeometry(r, len, 4, rs), color).applyMatrix4(m || M());
  const cylg = (r0, r1, h, color, m, rs = 12) => paint(new T.CylinderGeometry(r0, r1, h, rs), color).applyMatrix4(m || M());
  const boxg = (w, h, d, color, m) => paint(new T.BoxGeometry(w, h, d), color).applyMatrix4(m || M());
  const tor = (r, t, color, m, arc = Math.PI * 2) => paint(new T.TorusGeometry(r, t, 6, 16, arc), color).applyMatrix4(m || M());
  const mesh = (geos, mat = MAT) => {
    const g = merge(geos.filter(Boolean), false);
    const me = new T.Mesh(g, mat); me.castShadow = true; return me;
  };

  function torsoGeo(color, sw, depth, bust) {
    const pts = [[0.142, 0], [0.144, 0.08], [0.146, 0.17], [0.16, 0.29], [0.172, 0.38], [0.165, 0.44], [0.12, 0.482], [0.05, 0.5], [0.0, 0.502]]
      .map(([r, y]) => new T.Vector2(r, y));
    const g = paint(new T.LatheGeometry(pts, 20), color);
    g.applyMatrix4(M([0, 0, 0], [0, 0, 0], [sw, 1, depth]));
    return g;
  }

  function headGeo(skin) {
    const g = new T.SphereGeometry(0.105, 26, 20);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      x *= 0.9; y *= 1.12;
      if (y < 0) { const k = 1 - 0.22 * (-y / 0.118); x *= k; z *= 1 - 0.1 * (-y / 0.118); }   // jaw taper
      if (z > 0 && y < 0.02 && y > -0.07) z *= 1.03;                                          // cheek/face plane
      if (z < 0) z *= 1.04;                                                                   // back of skull
      p.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    return paint(g, skin);
  }

  function hairGeos(style, col, headC) {
    const [hx, hy, hz] = headC;
    const at = (x, y, z) => [hx + x, hy + y, hz + z];
    const sc = [0.93, 1.13, 1.02];
    const W = 1.05;                                  // half-width (rad) of the face opening
    const NF = [Math.PI / 2 + W, Math.PI * 2 - 2 * W];
    const top = (r = 0.112, tl = 0.3) => sph(r, col, M(at(0, 0.004, -0.004), [0, 0, 0], sc), 24, 10, 0, Math.PI * 2, 0, Math.PI * tl);
    const surround = (r = 0.111, tl = 0.56) => sph(r, col, M(at(0, 0.004, -0.004), [0, 0, 0], sc), 24, 14, ...NF, 0, Math.PI * tl);
    const out = [];
    switch (style) {
      case 'short': out.push(top(), surround()); break;
      case 'buzz': out.push(top(0.107, 0.3), surround(0.106, 0.52)); break;
      case 'side': out.push(top(0.114, 0.32), surround(0.112, 0.56), sph(0.055, col, M(at(0.035, 0.092, 0.05), [0.35, 0, -0.45], [1.35, 0.45, 1]))); break;
      case 'bob': out.push(top(0.114), sph(0.121, col, M(at(0, 0.0, -0.006), [0, 0, 0], sc), 24, 16, ...NF, 0, Math.PI * 0.7)); break;
      case 'long': out.push(top(0.114), sph(0.121, col, M(at(0, 0.0, -0.006), [0, 0, 0], sc), 24, 16, ...NF, 0, Math.PI * 0.72),
        cap(0.07, 0.24, col, M(at(0, -0.15, -0.065), [0.12, 0, 0], [1.4, 1, 0.55])),
        cap(0.028, 0.2, col, M(at(0.088, -0.13, -0.01), [0, 0, 0.06])), cap(0.028, 0.2, col, M(at(-0.088, -0.13, -0.01), [0, 0, -0.06]))); break;
      case 'bun': out.push(top(), surround(), sph(0.05, col, M(at(0, 0.125, -0.08)))); break;
      case 'ponytail': out.push(top(), surround(), sph(0.032, col, M(at(0, 0.07, -0.118))), cap(0.03, 0.17, col, M(at(0, -0.035, -0.135), [0.28, 0, 0]))); break;
      case 'curly': {
        for (let i = 0; i < 80; i++) {
          const th = Math.acos(1 - (i + 0.5) / 80 * 1.3), ph = i * 2.39996;
          const x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
          if (z > 0.35 && y < 0.62) continue;
          out.push(sph(0.034, col, M(at(x * 0.106, y * 0.12 + 0.012, z * 0.108)), 8, 6));
        }
        out.push(top(0.108, 0.35));
        break;
      }
      case 'hijab': out.push(top(0.124, 0.32), sph(0.127, col, M(at(0, -0.004, -0.006), [0, 0, 0], sc), 26, 18, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 0, Math.PI * 0.82),
        cylg(0.1, 0.17, 0.17, col, M(at(0, -0.175, -0.01), [0, 0, 0], [1, 1, 0.82]), 18)); break;
      case 'bald': default: break;
    }
    return out;
  }

  /* ------------------------------------------------------------------ build */
  function build(o) {
    const s = o.height / 1.75;
    const sw = o.shoulders || 1, hw = o.hipsW || 1, bust = o.bust || 0;
    const skin = o.skin, top = o.jacket || o.shirt, sleeve = o.jacket || o.shirt;
    const root = new T.Group(); root.scale.setScalar(s);
    const J = {};
    const joint = (name, parent, pos) => { const j = new T.Group(); j.position.set(...pos); parent.add(j); J[name] = j; return j; };

    const hips = joint('hips', root, [0, 0.95, 0]);
    hips.add(mesh([
      sph(1, o.pants, M([0, 0.0, 0], [0, 0, 0], [0.15 * hw, 0.1, 0.1])),
      cylg(0.152 * hw, 0.155 * hw, 0.045, o.belt || '#2b2522', M([0, 0.075, 0], [0, 0, 0], [1, 1, 0.7])),
      boxg(0.035, 0.028, 0.01, '#b8b2a8', M([0, 0.075, 0.105]))
    ]));
    const spine = joint('spine', hips, [0, 0.085, 0]);
    const tg = [torsoGeo(top, 1.0 * sw, 0.64, bust)];
    if (bust > 0) { tg.push(sph(0.11, top, M([0, 0.3, 0.03], [0, 0, 0], [1.25 * sw, 0.62, 0.72]), 18, 12)); }
    if (o.jacket) {
      tg.push(boxg(0.075, 0.33, 0.02, o.shirt, M([0, 0.26, 0.103], [-0.06, 0, 0])));
      tg.push(boxg(0.035, 0.12, 0.012, o.jacket, M([0.045, 0.39, 0.1], [0, 0, 0.35])), boxg(0.035, 0.12, 0.012, o.jacket, M([-0.045, 0.39, 0.1], [0, 0, -0.35])));
      if (o.tie) tg.push(boxg(0.026, 0.26, 0.012, o.tie, M([0, 0.3, 0.114], [-0.06, 0, 0])));
    } else {
      tg.push(tor(0.052, 0.012, o.shirt, M([0, 0.485, 0.012], [Math.PI / 2 - 0.25, 0, 0], [1.1, 1, 1])));      // collar
    }
    if (o.badge) {
      tg.push(tor(0.075, 0.004, o.badge, M([0, 0.43, 0.035], [Math.PI / 2 - 0.35, 0, 0], [1, 1.3, 1]), Math.PI));
      tg.push(boxg(0.045, 0.065, 0.006, '#f4f4f0', M([0.0, 0.29, 0.112], [-0.08, 0, 0])), boxg(0.045, 0.014, 0.007, o.badge, M([0, 0.315, 0.113], [-0.08, 0, 0])));
    }
    spine.add(mesh(tg));

    const neck = joint('neck', spine, [0, 0.48, 0]);
    neck.add(mesh([cylg(0.056, 0.064, 0.1, skin, M([0, 0.035, 0.0]))]));
    const head = joint('head', neck, [0, 0.062, 0.008]);
    const HC = [0, 0.11, 0.0];
    const hg = [headGeo(skin).applyMatrix4(M(HC))];
    hg.push(sph(0.026, skin, M([0.093, 0.105, -0.005], [0, 0, 0], [0.42, 1, 0.75]), 10, 8), sph(0.026, skin, M([-0.093, 0.105, -0.005], [0, 0, 0], [0.42, 1, 0.75]), 10, 8));
    hg.push(sph(0.013, skin, M([0, 0.103, 0.1], [0.35, 0, 0], [0.7, 1.7, 0.95]), 10, 8), sph(0.0115, skin, M([0, 0.086, 0.106], [0, 0, 0], [1.25, 0.8, 0.95]), 8, 6));   // nose
    const eyeY = 0.128, eyeX = 0.034, eyeZ = 0.086;
    for (const sx of [1, -1]) {
      hg.push(sph(0.0185, '#f7f5f0', M([sx * eyeX, eyeY, eyeZ - 0.001], [0, 0, 0], [1, 0.78, 0.62]), 12, 8));
      hg.push(sph(0.0108, o.eyes || '#4a3524', M([sx * eyeX, eyeY, eyeZ + 0.0078], [0, 0, 0], [1, 1, 0.45]), 10, 8));
      hg.push(sph(0.0048, '#0b0b0c', M([sx * eyeX, eyeY, eyeZ + 0.0118], [0, 0, 0], [1, 1, 0.4]), 8, 6));
      hg.push(boxg(0.032, 0.0065, 0.01, o.brows || o.hair, M([sx * (eyeX + 0.002), eyeY + 0.027, eyeZ + 0.008], [0, 0, sx * -0.12])));
    }
    hg.push(...hairGeos(o.hairStyle, o.hair, HC));
    if (o.beard) {
      hg.push(sph(0.1, o.hair, M([0, 0.106, 0.004], [0, 0, 0], [0.9, 1.1, 1.03]), 22, 14, Math.PI / 2 - 1.2, 2.4, Math.PI * 0.6, Math.PI * 0.26));
      hg.push(boxg(0.05, 0.009, 0.01, o.hair, M([0, 0.078, 0.104])));
    }
    if (o.glasses) {
      for (const sx of [1, -1]) {
        hg.push(tor(0.019, 0.0028, o.glasses, M([sx * eyeX, eyeY, eyeZ + 0.022], [0, 0, 0], [1.1, 0.85, 1])));
        hg.push(boxg(0.004, 0.004, 0.1, o.glasses, M([sx * 0.088, eyeY + 0.004, 0.04])));
      }
      hg.push(boxg(0.02, 0.004, 0.004, o.glasses, M([0, eyeY + 0.004, eyeZ + 0.022])));
    }
    if (o.headset) {
      hg.push(tor(0.112, 0.008, '#1c1d20', M([0, 0.115, -0.005], [0, Math.PI / 2, 0], [1, 1.15, 1]), Math.PI));
      hg.push(cylg(0.032, 0.032, 0.025, '#1c1d20', M([0.1, 0.1, 0], [0, 0, Math.PI / 2])), cylg(0.032, 0.032, 0.025, '#1c1d20', M([-0.1, 0.1, 0], [0, 0, Math.PI / 2])));
      hg.push(cap(0.005, 0.1, '#1c1d20', M([-0.07, 0.07, 0.07], [Math.PI / 2 - 0.2, 0.9, 0])), sph(0.01, '#333', M([-0.035, 0.08, 0.105])));
    }
    head.add(mesh(hg));
    // separate face parts for animation
    const mouth = new T.Mesh(merge([boxg(0.036, 0.0075, 0.012, o.lips || '#a45a52', M([0, 0, 0]))]), MAT);
    mouth.position.set(0, 0.063, 0.1); head.add(mouth);
    const lids = new T.Mesh(merge([
      sph(0.0192, skin, M([eyeX, eyeY, eyeZ + 0.001], [0, 0, 0], [1.05, 0.85, 0.68]), 10, 8),
      sph(0.0192, skin, M([-eyeX, eyeY, eyeZ + 0.001], [0, 0, 0], [1.05, 0.85, 0.68]), 10, 8)]), MAT);
    lids.visible = false; head.add(lids);

    // arms (character's right = -x)
    for (const [side, sx] of [['R', -1], ['L', 1]]) {
      const ua = joint('upperArm' + side, spine, [sx * 0.178 * sw, 0.43, 0]);
      ua.add(mesh([sph(0.05, sleeve, M([sx * -0.008, -0.01, 0], [0, 0, 0], [1, 1, 0.95])), cylg(0.05, 0.041, 0.29, sleeve, M([0, -0.145, 0])), sph(0.041, sleeve, M([0, -0.29, 0]), 10, 8)]));
      const fa = joint('foreArm' + side, ua, [0, -0.29, 0]);
      const fcol = o.shortSleeves ? skin : sleeve;
      fa.add(mesh([cylg(0.04, 0.03, 0.25, fcol, M([0, -0.125, 0])), sph(0.04, fcol, M([0, -0.005, 0]), 10, 8), sph(0.03, skin, M([0, -0.25, 0]), 8, 6), o.shortSleeves ? null : cylg(0.04, 0.04, 0.03, o.jacket ? o.shirt : sleeve, M([0, -0.24, 0])),
        o.watch && side === 'L' ? cylg(0.041, 0.041, 0.018, o.watch, M([0, -0.22, 0])) : null]));
      const hand = joint('hand' + side, fa, [0, -0.26, 0]);
      hand.add(mesh([
        boxg(0.058, 0.08, 0.026, skin, M([0, -0.042, 0.004])),
        boxg(0.054, 0.048, 0.022, skin, M([0, -0.1, 0.01], [0.25, 0, 0])),
        cap(0.011, 0.035, skin, M([sx * -0.032, -0.04, 0.018], [0.4, 0, sx * 0.5]))]));
    }
    // legs
    for (const [side, sx] of [['R', -1], ['L', 1]]) {
      const th = joint('thigh' + side, hips, [sx * 0.088 * hw, -0.035, 0]);
      th.add(mesh([sph(0.084, o.pants, M([0, 0, 0]), 12, 10), cylg(0.084, 0.058, 0.44, o.pants, M([0, -0.22, 0]), 14), sph(0.058, o.pants, M([0, -0.44, 0]), 10, 8)]));
      const sh = joint('shin' + side, th, [0, -0.44, 0]);
      const lc = o.skirt ? (o.tights || skin) : o.pants;
      sh.add(mesh([cylg(0.055, 0.04, 0.43, lc, M([0, -0.215, 0]), 14), sph(0.056, lc, M([0, -0.14, -0.012], [0, 0, 0], [1, 2.3, 1.1]), 10, 8), sph(0.041, lc, M([0, -0.43, 0]), 8, 6)]));
      const ft = joint('foot' + side, sh, [0, -0.43, 0]);
      ft.add(mesh([boxg(0.094, 0.065, 0.24, o.shoes, M([0, -0.03, 0.045])), boxg(0.098, 0.015, 0.25, o.sole || '#e8e6e0', M([0, -0.062, 0.045])),
        sph(0.048, o.shoes, M([0, -0.03, 0.16], [0, 0, 0], [1, 0.7, 0.9]), 10, 6)]));
    }
    if (o.skirt) {
      J.hips.add(mesh([cylg(0.19 * hw, 0.235 * hw, 0.36, o.skirt, M([0, -0.17, 0], [0, 0, 0], [1, 1, 0.8]), 18)]));
    }
    // hand props
    const cup = new T.Mesh(merge([cylg(0.036, 0.03, 0.1, '#f4f2ee', M([0, 0, 0]), 12), cylg(0.037, 0.037, 0.03, o.cupSleeve || '#7a4e2d', M([0, 0.005, 0]), 12)]), MAT);
    cup.position.set(0, -0.1, 0.05); cup.visible = false; J.handR.add(cup);
    const phone = new T.Mesh(merge([boxg(0.07, 0.14, 0.008, '#15161a'), boxg(0.062, 0.128, 0.002, '#27456e', M([0, 0, 0.005]))]), MAT_GLOSS);
    phone.position.set(0, -0.11, 0.035); phone.rotation.x = -0.3; phone.visible = false; J.handR.add(phone);

    root.traverse(ob => { ob.matrixAutoUpdate = true; });
    return new Rig(root, J, mouth, lids, cup, phone, s);
  }

  /* ------------------------------------------------------------------ animation */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const JOINTS = ['hips', 'spine', 'neck', 'head', 'upperArmR', 'upperArmL', 'foreArmR', 'foreArmL', 'handR', 'handL', 'thighR', 'thighL', 'shinR', 'shinL', 'footR', 'footL'];

  class Rig {
    constructor(root, J, mouth, lids, cup, phone, s) {
      Object.assign(this, { root, J, mouth, lids, cup, phone, s });
      this.t = Math.random() * 100; this.phase = 0; this.mode = 'stand'; this.speed = 0;
      this.seatH = 0.5; this.talking = 0; this.look = null; this.blinkT = 2 + Math.random() * 3; this.blinkOn = 0;
      this.hipY = 0.95; this.gest = Math.random() * 10; this.modeT = 0;
    }
    setMode(m) { if (m !== this.mode) { this.mode = m; this.modeT = 0; } }
    update(dt, worldYaw) {
      const J = this.J, t = (this.t += dt); this.modeT += dt;
      const tgt = {}; for (const k of JOINTS) tgt[k] = [0, 0, 0];
      tgt.upperArmR[2] = -0.07; tgt.upperArmL[2] = 0.07; tgt.foreArmR[0] = -0.12; tgt.foreArmL[0] = -0.12;
      let hipY = 0.95, hipZ = 0;
      const br = Math.sin(t * 1.6) * 0.012;
      tgt.spine[0] = br;
      const m = this.mode;
      if (m === 'walk' || m === 'run') {
        const amp = m === 'run' ? 0.75 : 0.5;
        this.phase += dt * (m === 'run' ? 9 : 6.3) * clamp(this.speed / 1.3, 0.6, 1.6);
        const p = this.phase, sp = Math.sin(p);
        tgt.thighL[0] = -sp * amp; tgt.thighR[0] = sp * amp;
        tgt.shinL[0] = Math.max(0, Math.sin(p - 1.3)) * 1.0 + 0.05; tgt.shinR[0] = Math.max(0, Math.sin(p + Math.PI - 1.3)) * 1.0 + 0.05;
        tgt.footL[0] = -tgt.thighL[0] * 0.3; tgt.footR[0] = -tgt.thighR[0] * 0.3;
        tgt.upperArmL[0] = sp * amp * 0.75; tgt.upperArmR[0] = -sp * amp * 0.75;
        tgt.foreArmL[0] = -0.35 - Math.max(0, -sp) * 0.3; tgt.foreArmR[0] = -0.35 - Math.max(0, sp) * 0.3;
        tgt.spine[1] = sp * 0.07; tgt.hips[1] = -sp * 0.06; tgt.head[1] = -sp * 0.04;
        hipY = 0.95 - 0.018 + Math.abs(Math.cos(p)) * 0.03;
        tgt.spine[0] = 0.03;
      } else if (m.startsWith('sit')) {
        hipY = this.seatH / this.s + 0.06; hipZ = -0.02;
        tgt.thighL[0] = tgt.thighR[0] = -1.5; tgt.shinL[0] = tgt.shinR[0] = 1.45; tgt.footL[0] = tgt.footR[0] = 0.05;
        tgt.thighL[2] = 0.06; tgt.thighR[2] = -0.06;
        tgt.spine[0] = -0.05 + br;
        if (m === 'sitType') {
          tgt.spine[0] = 0.1 + br; tgt.head[0] = 0.12;
          for (const [sd, sx] of [['R', -1], ['L', 1]]) {
            tgt['upperArm' + sd] = [-0.5, 0, sx * 0.14];
            tgt['foreArm' + sd] = [-1.0 + Math.sin(t * 17 + sx * 1.7) * 0.035 * (Math.sin(t * 0.7 + sx) > -0.3 ? 1 : 0), sx * -0.1, 0];
            tgt['hand' + sd] = [0.2, 0, 0];
          }
          tgt.head[1] = Math.sin(t * 0.37) * 0.08;
        } else if (m === 'sitTalk') {
          const g = Math.sin(t * 2.1 + this.gest);
          tgt.upperArmR = [-0.35 + g * 0.12, 0, -0.18]; tgt.foreArmR = [-1.1 + g * 0.2, 0.2, 0];
          tgt.upperArmL = [-0.3, 0, 0.18]; tgt.foreArmL = [-1.2, -0.2, 0];
        } else if (m === 'sitDrink') {
          const up = (t % 5) < 1.4;
          tgt.upperArmR = [-0.45, 0, -0.15]; tgt.foreArmR = [up ? -2.1 : -1.3, 0, 0]; tgt.head[0] = up ? -0.12 : 0.05;
          tgt.upperArmL = [-0.3, 0, 0.12]; tgt.foreArmL = [-1.1, 0, 0];
        } else {
          tgt.upperArmR = [-0.3, 0, -0.12]; tgt.foreArmR = [-1.15, 0, 0]; tgt.upperArmL = [-0.3, 0, 0.12]; tgt.foreArmL = [-1.15, 0, 0];
        }
      } else if (m === 'talk') {
        const g = Math.sin(t * 2.3 + this.gest), g2 = Math.sin(t * 1.7 + 1 + this.gest);
        tgt.upperArmR = [-0.3 + g * 0.18, 0, -0.2]; tgt.foreArmR = [-1.0 + g2 * 0.25, 0.3, 0];
        tgt.upperArmL = [-0.25 + g2 * 0.12, 0, 0.18]; tgt.foreArmL = [-0.9 + g * 0.2, -0.3, 0];
        tgt.head[0] = Math.sin(t * 1.3) * 0.05;
      } else if (m === 'wave') {
        tgt.upperArmR = [-0.2, 0, -2.55]; tgt.foreArmR = [0, 0, -0.35 + Math.sin(t * 9) * 0.45];
      } else if (m === 'raise') {
        tgt.upperArmR = [-0.35, 0, -2.85]; tgt.foreArmR = [0, 0, Math.sin(t * 4) * 0.12];
        tgt.head[0] = -0.05;
      } else if (m === 'drink') {
        const up = (t % 4.5) < 1.3;
        tgt.upperArmR = [-0.45, 0, -0.18]; tgt.foreArmR = [up ? -2.15 : -1.35, 0, 0]; tgt.head[0] = up ? -0.15 : 0;
      } else if (m === 'phone') {
        tgt.upperArmR = [-0.35, 0, -0.1]; tgt.foreArmR = [-1.55, 0.25, 0]; tgt.upperArmL = [-0.3, 0, 0.1]; tgt.foreArmL = [-1.4, -0.3, 0];
        tgt.head[0] = 0.38; tgt.neck[0] = 0.1;
      } else if (m === 'stretch') {
        const k = Math.min(1, this.modeT);
        tgt.upperArmR = [-2.9 * k, 0, -0.2]; tgt.upperArmL = [-2.9 * k, 0, 0.2]; tgt.foreArmR[0] = tgt.foreArmL[0] = -0.3 * k;
        tgt.spine[0] = -0.12 * k; tgt.head[0] = -0.2 * k;
      } else if (m === 'point') {
        tgt.upperArmR = [-1.35, 0.1, -0.15]; tgt.foreArmR = [-0.1, 0, 0];
      } else if (m === 'present') {
        const g = Math.sin(t * 1.8 + this.gest);
        tgt.upperArmR = [-1.1 + g * 0.2, 0.2, -0.3]; tgt.foreArmR = [-0.3, 0, 0]; tgt.upperArmL = [-0.3, 0, 0.15]; tgt.foreArmL = [-1.1, 0, 0];
      } else if (m === 'carry') {
        tgt.upperArmR = [-0.45, 0, -0.15]; tgt.foreArmR = [-1.3, 0, 0];
      } else if (m === 'nod') {
        tgt.head[0] = Math.max(0, Math.sin(t * 6)) * 0.22;
      } else if (m === 'crossed') {
        tgt.upperArmR = [-0.45, 0, -0.25]; tgt.foreArmR = [-1.6, 0.9, 0]; tgt.upperArmL = [-0.45, 0, 0.25]; tgt.foreArmL = [-1.6, -0.9, 0];
      } else { // stand idle: weight shift
        const w = Math.sin(t * 0.45 + this.gest);
        tgt.hips[2] = w * 0.03; tgt.spine[2] = -w * 0.025; tgt.thighL[2] = -w * 0.03; tgt.thighR[2] = -w * 0.03;
        tgt.head[1] = Math.sin(t * 0.3 + this.gest) * 0.12;
      }
      // walk overrides for carried items keep arm steady
      if ((m === 'walk') && this.cup.visible) { tgt.upperArmR = [-0.4, 0, -0.15]; tgt.foreArmR = [-1.3, 0, 0]; }
      if (this.phone.visible && m === 'walk') { tgt.upperArmR = [-0.35, 0, -0.1]; tgt.foreArmR = [-1.5, 0.25, 0]; tgt.head[0] = 0.3; }

      // look-at (head/neck yaw & pitch in world space)
      if (this.look) {
        const hp = new T.Vector3(); this.J.head.getWorldPosition(hp);
        const dx = this.look.x - hp.x, dz = this.look.z - hp.z, dy = (this.look.y ?? 1.6) - hp.y;
        let yaw = Math.atan2(dx, dz) - (worldYaw || 0);
        yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
        if (Math.abs(yaw) < 2.0) {
          const cy = clamp(yaw, -1.15, 1.15);
          tgt.neck[1] = cy * 0.45; tgt.head[1] = cy * 0.55;
          tgt.head[0] = clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.4, 0.4) * 0.8;
        }
      }
      const k = Math.min(1, dt * 9);
      for (const n of JOINTS) {
        const r = J[n].rotation, g = tgt[n];
        r.x += (g[0] - r.x) * k; r.y += (g[1] - r.y) * k; r.z += (g[2] - r.z) * k;
      }
      const kh = Math.min(1, dt * 6);
      J.hips.position.y += (hipY - J.hips.position.y) * (m === 'walk' ? 1 : kh);
      J.hips.position.z += (hipZ - J.hips.position.z) * kh;

      // face
      this.blinkT -= dt;
      if (this.blinkT < 0) { this.blinkOn = 0.12; this.blinkT = 2 + Math.random() * 4; }
      if (this.blinkOn > 0) { this.blinkOn -= dt; this.lids.visible = true; } else this.lids.visible = false;
      const open = this.talking > 0 ? 1 + Math.abs(Math.sin(t * 13) * Math.sin(t * 5.3)) * 2.6 : 1;
      this.mouth.scale.y += (open - this.mouth.scale.y) * Math.min(1, dt * 20);
      if (this.talking > 0) this.talking -= dt;
    }
  }

  /* ------------------------------------------------------------------ appearance presets */
  const SKINS = ['#f1d0b5', '#e7bb98', '#d49e7a', '#b97c55', '#8d5a3b', '#6b4029', '#f5d7c4', '#c98f68'];
  const HAIRS = ['#1b1512', '#3a2618', '#5b3a22', '#8a5a33', '#b98a52', '#d9b77e', '#2a2a2e', '#7a2e1c', '#9d9a95'];
  window.Human = { build, SKINS, HAIRS };
})();
