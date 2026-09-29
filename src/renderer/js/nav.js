/* Deskly navigation: occupancy grid from the generated office, A* paths for
   employees (inflated by their body radius) and sliding collision for the player. */
(function () {
  class Nav {
    constructor(g) {
      Object.assign(this, { x0: g.x0, z0: g.z0, cell: g.cell, nx: g.nx, nz: g.nz });
      const raw = atob(g.bits), n = g.nx * g.nz;
      this.block = new Uint8Array(n);
      for (let i = 0; i < n; i++) this.block[i] = (raw.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1;
      this.dyn = new Uint8Array(n);                     // closed doors etc. (unused by default)
      this.infl = new Uint8Array(n);
      for (let z = 0; z < g.nz; z++) for (let x = 0; x < g.nx; x++) {
        if (!this.block[z * g.nx + x]) continue;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, zz = z + dz;
          if (xx >= 0 && zz >= 0 && xx < g.nx && zz < g.nz) this.infl[zz * g.nx + xx] = 1;
        }
      }
      this.g = new Float32Array(n); this.f = new Float32Array(n); this.from = new Int32Array(n); this.stamp = new Uint32Array(n); this.closed = new Uint32Array(n); this.run = 1;
    }
    ci(x, z) { return [Math.floor((x - this.x0) / this.cell), Math.floor((z - this.z0) / this.cell)]; }
    inb(ix, iz) { return ix >= 0 && iz >= 0 && ix < this.nx && iz < this.nz; }
    blockedAt(x, z, inflated) {
      const [ix, iz] = this.ci(x, z); if (!this.inb(ix, iz)) return true;
      return (inflated ? this.infl : this.block)[iz * this.nx + ix] === 1;
    }
    center(ix, iz) { return { x: this.x0 + (ix + 0.5) * this.cell, z: this.z0 + (iz + 0.5) * this.cell }; }
    nearestFree(ix, iz, inflated = true, maxR = 25) {
      const A = inflated ? this.infl : this.block;
      if (this.inb(ix, iz) && !A[iz * this.nx + ix]) return [ix, iz];
      for (let r = 1; r <= maxR; r++) {
        let best = null, bd = 1e9;
        for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = ix + dx, z = iz + dz;
          if (this.inb(x, z) && !A[z * this.nx + x]) { const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = [x, z]; } }
        }
        if (best) return best;
      }
      return null;
    }
    los(a, b) {    // grid line of sight on inflated grid
      let [x0, z0] = a, [x1, z1] = b;
      const dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0), sx = x0 < x1 ? 1 : -1, sz = z0 < z1 ? 1 : -1;
      let err = dx - dz;
      for (let k = 0; k < 2000; k++) {
        if (this.infl[z0 * this.nx + x0]) return false;
        if (x0 === x1 && z0 === z1) return true;
        const e2 = 2 * err;
        if (e2 > -dz) { err -= dz; x0 += sx; }
        if (e2 < dx) { err += dx; z0 += sz; }
      }
      return false;
    }
    path(from, to) {
      let s = this.nearestFree(...this.ci(from.x, from.z)), e = this.nearestFree(...this.ci(to.x, to.z));
      if (!s || !e) return null;
      const nx = this.nx, run = ++this.run, si = s[1] * nx + s[0], ei = e[1] * nx + e[0];
      const heap = [];
      const push = (i, f) => { heap.push([f, i]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
      const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (; ;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
      const ex = e[0], ez = e[1];
      const h = i => { const x = i % nx, z = (i / nx) | 0, dx = Math.abs(x - ex), dz = Math.abs(z - ez); return (dx + dz) + (1.4142 - 2) * Math.min(dx, dz); };
      this.stamp[si] = run; this.g[si] = 0; this.from[si] = -1; push(si, h(si));
      const D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
      let found = false, iter = 0;
      while (heap.length && iter++ < 60000) {
        const [, cur] = pop();
        if (this.closed[cur] === run) continue;
        this.closed[cur] = run;
        if (cur === ei) { found = true; break; }
        const cx = cur % nx, cz = (cur / nx) | 0;
        for (const [dx, dz, c] of D) {
          const x = cx + dx, z = cz + dz;
          if (x < 0 || z < 0 || x >= nx || z >= this.nz) continue;
          const ni = z * nx + x;
          if (this.infl[ni] || this.closed[ni] === run) continue;
          if (dx && dz && (this.infl[cz * nx + x] || this.infl[z * nx + cx])) continue;
          const g = this.g[cur] + c;
          if (this.stamp[ni] !== run || g < this.g[ni]) { this.stamp[ni] = run; this.g[ni] = g; this.from[ni] = cur; push(ni, g + h(ni)); }
        }
      }
      if (!found) return null;
      const cells = [];
      for (let i = ei; i !== -1; i = this.from[i]) cells.push([i % nx, (i / nx) | 0]);
      cells.reverse();
      // string-pull smoothing
      const out = [cells[0]]; let a = 0;
      while (a < cells.length - 1) {
        let b = cells.length - 1;
        while (b > a + 1 && !this.los(cells[a], cells[b])) b--;
        out.push(cells[b]); a = b;
      }
      const pts = out.map(([x, z]) => this.center(x, z));
      pts.push({ x: to.x, z: to.z });
      pts.shift();
      return pts;
    }
    // player: move a circle with sliding against the raw grid
    move(pos, dx, dz, r = 0.22) {
      const hit = (x, z) => {
        for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; if (this.blockedAt(x + Math.cos(a) * r, z + Math.sin(a) * r, false)) return true; }
        return this.blockedAt(x, z, false);
      };
      const steps = Math.ceil(Math.hypot(dx, dz) / 0.08) || 1;
      for (let i = 0; i < steps; i++) {
        const sx = dx / steps, sz = dz / steps;
        if (!hit(pos.x + sx, pos.z)) pos.x += sx;
        if (!hit(pos.x, pos.z + sz)) pos.z += sz;
      }
    }
  }
  window.DesklyNav = Nav;
})();
