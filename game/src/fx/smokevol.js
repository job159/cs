// CS2-style smoke grenades, approximated for phones: each smoke is 24-64 big lit puffs (normal-mapped
// billboards lit by the scene sun / sky) that flood-fill the floor around the landing point, blocked by
// walls. Timeline (CS2): a small puff at 0.3 s, ~80 % at 0.6 s, fully bloomed at ~1.2 s, holds ~18 s, then
// thins and greys out. Bullets carve short-lived tunnels (capsules evaluated per pixel) and explosions punch
// a sphere that refills over ~1.5 s. Standing inside a smoke greys the screen.
import * as THREE from 'three';
import { FRAME } from './atlas.js';

const R = Math.random;
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _d = new THREE.Vector3();
const _cp = new THREE.Vector3();
const _cf = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);

const OVERLAY_FRAG = /* glsl */`
uniform vec4 uCol;
void main() { gl_FragColor = uCol; }`;

export class SmokeVolumes {
  constructor(fx, { quality = 1 } = {}) {
    this.fx = fx;
    this.game = fx.game;
    this.k = quality;
    this.smokes = [];
    this.holes = [];               // { a, b, r, t, open, life }
    this.layer = fx.particles.makeLayer(Math.round(260 * Math.max(0.5, quality)), { additive: false, holes: true, renderOrder: 12, flat: 0.45 });
    this.layer.mesh.visible = false;
    fx.scene.add(this.layer.mesh);
    // full-screen grey when the camera is inside a smoke (drawn beyond the viewmodel's depth range)
    this.overlay = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.92, 1.0); }', fragmentShader: OVERLAY_FRAG,
      uniforms: { uCol: { value: new THREE.Vector4(0.5, 0.5, 0.5, 0) } }, transparent: true, depthWrite: false, depthTest: true,
    }));
    this.overlay.frustumCulled = false;
    this.overlay.renderOrder = 30;
    this.overlay.visible = false;
    fx.scene.add(this.overlay);
  }

  /** Spawn a smoke at a landing point. opts: radius (3.7 m), duration (18 s), color (albedo), height (3.2 m). */
  spawn(pos, { radius = 3.7, duration = 18, color = [0.72, 0.7, 0.66], height = 3.2 } = {}) {
    const col = this.game.world.collision;
    const n = Math.max(20, Math.round(48 * this.k));
    const ground = col ? col.floorBelow(pos, 0.6, 4) : pos.y;
    const y0 = isFinite(ground) ? ground : pos.y;
    // flood fill on a 0.75 m grid over walkable floor, blocked by walls
    const step = 0.75;
    const cells = new Map();
    const key = (i, j) => i * 1000 + j;
    const queue = [[0, 0, y0]];
    cells.set(key(0, 0), { i: 0, j: 0, y: y0, d: 0 });
    while (queue.length) {
      const [i, j, y] = queue.shift();
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj;
        if (cells.has(key(ni, nj))) continue;
        const x = pos.x + ni * step, z = pos.z + nj * step;
        const d = Math.hypot(ni, nj) * step;
        if (d > radius) continue;
        let ny = y;
        if (col) {
          _v.set(pos.x + i * step, y + 0.6, pos.z + j * step);
          _w.set(x, y + 0.6, z);
          if (col.blocked(_v, _w)) continue;
          ny = col.floorBelow(_w, 1.2, 2.5);
          if (!isFinite(ny) || Math.abs(ny - y) > 1.2) continue;
        }
        cells.set(key(ni, nj), { i: ni, j: nj, y: ny, d });
        queue.push([ni, nj, ny]);
      }
    }
    // candidate puff positions: each cell stacked up to the ceiling
    const cand = [];
    for (const c of cells.values()) {
      const x = pos.x + c.i * step, z = pos.z + c.j * step;
      let top = height;
      if (col) { const h = col.raycast(_v.set(x, c.y + 0.3, z), UP, height); if (h) top = Math.max(0.6, h.dist + 0.1); }
      for (let h = 0.8; h < top; h += 1.15) cand.push({ x: x + (R() - 0.5) * 0.5, y: c.y + h + (R() - 0.5) * 0.3, z: z + (R() - 0.5) * 0.5, gy: c.y, d: c.d + h * 0.35 + R() * 0.3 });
    }
    cand.sort((a, b) => a.d - b.d);
    // keep n, spread over the whole volume (stride) but always including the centre
    const pick = [];
    const stride = Math.max(1, cand.length / n);
    for (let k = 0; k < n && Math.floor(k * stride) < cand.length; k++) pick.push(cand[Math.floor(k * stride)]);
    pick.sort((a, b) => a.d - b.d);
    const s = { pos: pos.clone(), y0, radius, duration, color, t: 0, puffs: [], center: new THREE.Vector3(pos.x, y0 + 1.2, pos.z) };
    pick.forEach((c, k) => {
      s.puffs.push({
        target: new THREE.Vector3(c.x, c.y, c.z), gy: c.gy, p: new THREE.Vector3(pos.x, y0 + 0.2, pos.z), off: new THREE.Vector3(),
        release: 0.06 + k * 0.014, size: 2.4 + R() * 1.5, rot: R() * 6.28, spin: (R() - 0.5) * 0.1, frame: FRAME.puff + (k % 4),
        phase: R() * 100, fadeAt: duration - 2.2 + R() * 1.6, alpha: 0, shade: 0.92 + R() * 0.12,
      });
    });
    this.smokes.push(s);
    this.layer.mesh.visible = true;
    // initial burst at the canister
    for (let k = 0; k < 4; k++) this.fx.particles.spawn({ x: pos.x, y: y0 + 0.15, z: pos.z, vx: (R() - 0.5) * 2, vy: 0.8 + R(), vz: (R() - 0.5) * 2, life: 1.0, size: 0.2, size1: 1.0, sizePow: 0.5, color: [color[0], color[1], color[2], 0.7], color1: [color[0], color[1], color[2], 0], frame: FRAME.puff + k, lit: true, drag: 2 });
    return s;
  }

  /** True when p is inside an active smoke (used by fires: smokes put molotovs out). */
  contains(p, margin = 0) {
    for (const s of this.smokes) {
      if (s.t < 0.4 || s.t > s.duration) continue;
      for (const pf of s.puffs) if (pf.alpha > 0.3 && pf.p.distanceToSquared(p) < (pf.size * 0.55 + margin) ** 2) return true;
    }
    return false;
  }

  /** A bullet path a -> b: carves a tunnel through every smoke it crosses. */
  carve(a, b, radius = 0.22, refill = 1.6) {
    if (!this.smokes.length) return;
    _d.subVectors(b, a);
    const len = _d.length();
    if (len < 0.01) return;
    _d.multiplyScalar(1 / len);
    for (const s of this.smokes) {
      // segment vs bounding sphere of the smoke
      const R0 = s.radius + 1.5;
      _v.subVectors(s.center, a);
      const tc = THREE.MathUtils.clamp(_v.dot(_d), 0, len);
      _w.copy(a).addScaledVector(_d, tc);
      if (_w.distanceTo(s.center) > R0) continue;
      const half = Math.sqrt(Math.max(0, R0 * R0 - _w.distanceToSquared(s.center)));
      const t0 = Math.max(0, tc - half), t1 = Math.min(len, tc + half);
      this._hole(_v.copy(a).addScaledVector(_d, t0), _w.copy(a).addScaledVector(_d, t1), radius, refill, 0.05);
    }
  }

  /** Explosion: clears a sphere for a while and pushes nearby puffs away. */
  blast(p, radius = 3, time = 1.5) {
    let hit = false;
    for (const s of this.smokes) {
      for (const pf of s.puffs) {
        _v.subVectors(pf.p, p);
        const d = _v.length();
        if (d < radius + 1.5) { hit = true; pf.off.addScaledVector(_v.normalize(), (radius + 1.5 - d) * 0.9); }
      }
    }
    if (hit) this._hole(p, p, radius, time, 0.2);
  }

  _hole(a, b, r, life, open) {
    if (this.holes.length >= 8) this.holes.shift();
    this.holes.push({ a: a.clone(), b: b.clone(), r, t: 0, life, open });
  }

  update(dt) {
    if (!this.smokes.length) { if (this.layer.mesh.visible) { this.layer.clear(); this.layer.mesh.visible = false; this.overlay.visible = false; } return; }
    const L = this.layer;
    L.n = 0;
    const cam = this.game.camera;
    _cp.setFromMatrixPosition(cam.matrixWorld);
    _cf.set(0, 0, -1).transformDirection(cam.matrixWorld);
    let inside = 0, insideCol = null;
    for (let si = this.smokes.length - 1; si >= 0; si--) {
      const s = this.smokes[si];
      s.t += dt;
      if (s.t > s.duration + 1) { this.smokes.splice(si, 1); continue; }
      for (const pf of s.puffs) {
        const tt = s.t - pf.release;
        if (tt <= 0) continue;
        const e = Math.min(1, tt / 0.38);
        const ease = 1 - Math.pow(1 - e, 3);
        pf.off.multiplyScalar(Math.max(0, 1 - dt * 0.7));
        // slow curl-ish drift
        const ph = pf.phase + s.t * 0.25;
        pf.p.lerpVectors(_v.set(s.pos.x, s.y0 + 0.25, s.pos.z), pf.target, ease).add(pf.off);
        pf.p.x += Math.sin(ph) * 0.15; pf.p.y += Math.sin(ph * 0.7 + 1) * 0.08; pf.p.z += Math.cos(ph * 0.8) * 0.15;
        const grow = 0.2 + 0.8 * ease;
        const fade = s.t > pf.fadeAt ? Math.max(0, 1 - (s.t - pf.fadeAt) / 1.6) : 1;
        pf.alpha = Math.min(1, tt / 0.12) * fade;
        const grey = s.t > pf.fadeAt - 1.5 ? Math.min(1, (s.t - pf.fadeAt + 1.5) / 2) : 0;
        const size = pf.size * grow * (1 + (1 - fade) * 0.25);
        pf.rot += pf.spin * dt;
        const g = 0.55;
        const cr = (s.color[0] + (g - s.color[0]) * grey) * pf.shade, cg = (s.color[1] + (g - s.color[1]) * grey) * pf.shade, cb = (s.color[2] + (g - s.color[2]) * grey) * pf.shade;
        const a = 0.92 * pf.alpha;
        if (a <= 0.003) continue;
        const i = L.spawn({ x: pf.p.x, y: pf.p.y, z: pf.p.z, life: 1e6, size, rot: pf.rot, color: [cr, cg, cb, a], color1: [cr, cg, cb, a], frame: pf.frame, lit: true, ground: pf.gy, soft: 0.25 });
        L.flags[i] = 0;
        // camera inside?
        const dd = pf.p.distanceTo(_cp);
        const rr = size * 0.42;
        if (dd < rr) { const k = (1 - dd / rr) * pf.alpha; if (k > inside) { inside = k; insideCol = [cr, cg, cb]; } }
      }
    }
    // holes
    for (let h = this.holes.length - 1; h >= 0; h--) {
      const ho = this.holes[h];
      ho.t += dt;
      if (ho.t > ho.life) this.holes.splice(h, 1);
    }
    for (let h = 0; h < 8; h++) {
      const ho = this.holes[h];
      if (!ho) { L.holeB[h].w = 0; continue; }
      const open = Math.min(1, ho.t / ho.open);
      const close = 1 - THREE.MathUtils.smoothstep(ho.t, ho.life * 0.35, ho.life);
      L.holeA[h].set(ho.a.x, ho.a.y, ho.a.z, ho.r * (0.6 + 0.4 * close));
      L.holeB[h].set(ho.b.x, ho.b.y, ho.b.z, open * close);
    }
    // back-to-front
    L.sortBy((i) => (L.pos[i * 3] - _cp.x) * _cf.x + (L.pos[i * 3 + 1] - _cp.y) * _cf.y + (L.pos[i * 3 + 2] - _cp.z) * _cf.z);
    L.geo.instanceCount = L.n;
    for (const a of L.attrs) { a.clearUpdateRanges(); a.addUpdateRange(0, L.n * a.itemSize); a.needsUpdate = true; }
    // in-smoke overlay (lit colour approximated by the scene light)
    if (inside > 0.02) {
      const sl = this.fx.particles.shared.sceneLight.value;
      this.overlay.material.uniforms.uCol.value.set(insideCol[0] * sl.x, insideCol[1] * sl.y, insideCol[2] * sl.z, Math.min(0.97, inside * 1.6));
      this.overlay.visible = true;
    } else this.overlay.visible = false;
    if (!this.smokes.length) { L.clear(); L.mesh.visible = false; }
  }
}
