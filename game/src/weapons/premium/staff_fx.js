// X04 應龍．御霆 effect primitives (docs/PREMIUM_WEAPONS.md §2.31): the 雷矢 dart (sprite seed + two helical strands),
// 雷印 mark rings (one instanced draw for every marked zombie and the homing lock), chained lightning, sky strikes,
// the 雷池 field (rim fence, repel flash), the storm cloud and rain of 震霄, the glazed 應龍 spirit geometry, KE_THUNDER.
// All glow is additive on top of the realistic base layer (impacts, dust, rubble, scorch: §1.1 rule 5).
import * as THREE from 'three';
import { FRAME, DECAL, DECAL_TINT } from '../../fx/fx.js';

const R = Math.random;
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3(), _r = new THREE.Vector3(), _q = new THREE.Quaternion();

// HDR colours (linear): white-hot core, the cyan-white thunder, deep blue, a little gold in the sparks
export const COL = {
  white: [8, 9, 10], core: [2.2, 6.0, 9.5], rim: [5.4, 7.2, 9.2], deep: [0.5, 1.6, 6.0], gold: [6.2, 4.4, 1.3], violet: [2.6, 1.9, 7.0], jade: [0.6, 3.4, 1.9], dim: [0.12, 0.3, 0.5],
};
export const k3 = (c, m) => [c[0] * m, c[1] * m, c[2] * m];

/** Plays `name`, or the stock fallback `fb` while the weapon's own bank is not produced yet. */
export function sfx(g, name, fb, o = {}) {
  const a = g?.audio;
  if (!a) return null;
  const n = !a.has || a.has(name) ? name : fb;
  return n ? a.play(n, o) : null;
}
/** Gun axes in camera space (viewmodel particles live there). */
export function gunAxes(vm) {
  const q = vm.gunRoot.quaternion;
  _f.set(0, 0, -1).applyQuaternion(q); _u.set(0, 1, 0).applyQuaternion(q); _r.set(1, 0, 0).applyQuaternion(q);
  return { f: _f, u: _u, r: _r };
}

// ------------------------------------------------------------------------------------------ textures
let _tex = null;
/** soft glow disc, the 雷印 seal ring (a ring with four square-spiral hooks), a lock bracket */
function textures() {
  if (_tex || typeof document === 'undefined') return _tex;
  const mk = (draw, S = 128) => { const c = document.createElement('canvas'); c.width = c.height = S; draw(c.getContext('2d'), S); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t; };
  const glow = mk((x, S) => {
    const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(235,250,255,0.95)'); g.addColorStop(0.36, 'rgba(140,220,255,0.45)'); g.addColorStop(0.62, 'rgba(60,140,255,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
  });
  const seal = mk((x, S) => {
    x.translate(S / 2, S / 2); x.strokeStyle = '#fff'; x.lineCap = 'square'; x.shadowColor = '#fff'; x.shadowBlur = 3;
    x.lineWidth = S * 0.035; x.beginPath(); x.arc(0, 0, S * 0.36, 0, TAU); x.stroke();
    x.lineWidth = S * 0.03;
    for (let k = 0; k < 4; k++) {
      x.save(); x.rotate(k * Math.PI / 2 + Math.PI / 4); x.translate(0, -S * 0.36);
      // a small square-spiral hook (雲雷紋) standing on the ring
      const u = S * 0.05; x.beginPath(); x.moveTo(-u * 1.6, 0); x.lineTo(-u * 1.6, -u * 2.2); x.lineTo(u * 1.6, -u * 2.2); x.lineTo(u * 1.6, -u * 0.6); x.lineTo(-u * 0.2, -u * 0.6); x.lineTo(-u * 0.2, -u * 1.4); x.lineTo(u * 0.7, -u * 1.4); x.stroke();
      x.restore();
    }
  });
  const bracket = mk((x, S) => {
    x.translate(S / 2, S / 2); x.strokeStyle = '#fff'; x.lineWidth = S * 0.04; x.shadowColor = '#fff'; x.shadowBlur = 3;
    for (let k = 0; k < 4; k++) { x.save(); x.rotate(k * Math.PI / 2); const r = S * 0.38, L = S * 0.12; x.beginPath(); x.moveTo(r - L, -r); x.lineTo(r, -r); x.lineTo(r, -r + L); x.stroke(); x.restore(); }
  });
  _tex = { glow, seal, bracket };
  return _tex;
}

// ------------------------------------------------------------------------------------------ the 雷矢 dart
const _spritePool = [];
/** The flying seed: a white core and a cyan halo (two additive sprites). */
export function dartMesh(scene) {
  const T = textures();
  let o = _spritePool.pop();
  if (!o) {
    o = new THREE.Group();
    const mk = (col, s) => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: T?.glow, color: new THREE.Color(...col), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })); m.scale.setScalar(s); return m; };
    o.add(mk(k3(COL.core, 0.55), 0.55), mk(k3(COL.white, 0.5), 0.16));
    o.userData.pool = true;
  }
  o.scale.setScalar(1);
  scene.add(o);
  return o;
}
export function freeDart(o) { o.removeFromParent(); if (o.userData.pool && _spritePool.length < 40) _spritePool.push(o); }
/** two helical strands chasing the seed (pushed by the caller with the spiral offsets) */
export function dartTrails(g) {
  const fx = g.fx;
  return [0, 1].map((i) => fx?.trail?.({ width: 0.035, life: 0.18, color: [...k3(i ? COL.rim : COL.core, 0.75), 1], color1: [...k3(COL.deep, 0.25), 0], taper: 0.1, segs: 18, profile: 'beam' }));
}
/** crackle off the flying dart */
export function dartSpark(g, p, dir, dt) {
  const P = g.fx?.particles;
  if (!P || R() > dt * 26) return;
  const s = 1.5 + R() * 2;
  P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, vx: (R() - 0.5) * s - dir.x * 2, vy: (R() - 0.5) * s, vz: (R() - 0.5) * s - dir.z * 2, life: 0.12 + R() * 0.1, size: 0.012, color: [...k3(COL.rim, 0.7), 1], color1: [...k3(COL.core, 0.2), 0], frame: FRAME.spark, stretch: 0.03 });
}
/** first-person cast flash at the armillary (centre kept clear: a thin ring + sparks) */
export function castFlash(g, c, f) {
  const P = g.fx?.particles;
  if (!P || !c) return;
  P.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, life: 0.09, size: 0.03, size1: 0.07, color: [...k3(COL.white, 0.35), 1], color1: [...k3(COL.core, 0.1), 0], frame: FRAME.glow });
  P.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, mode: 'flat', dir: [f.x, f.y, f.z], life: 0.14, size: 0.02, size1: 0.085, sizePow: 0.5, color: [...k3(COL.rim, 0.45), 1], color1: [0, 0, 0, 0], frame: FRAME.thinRing });
  for (let i = 0; i < 5; i++) P.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, vx: (R() - 0.5) * 0.6 + f.x * 0.4, vy: (R() - 0.3) * 0.6 + f.y * 0.4, vz: (R() - 0.5) * 0.6 + f.z * 0.4, life: 0.1 + R() * 0.08, size: 0.003, color: [...k3(COL.white, 0.5), 1], color1: [...k3(COL.core, 0.2), 0], frame: FRAME.spark, stretch: 0.015 });
}
/** dart impact: cyan-white burst, short arcs off the point, a scorch dot (world) */
export function dartImpact(g, p, n, dir, { flesh = true, head = false, big = 1 } = {}) {
  const fx = g.fx;
  if (!fx) return;
  const P = fx.particles;
  P?.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.1, size: 0.28 * big, size1: 0.5 * big, color: [...k3(COL.white, 0.5), 1], color1: [...k3(COL.core, 0.1), 0], frame: FRAME.glow });
  fx.sparkBurst?.(p.clone(), { color: k3(COL.rim, 0.6), color1: k3(COL.core, 0.3), count: head ? 14 : 8, speed: 5, glow: 0.4, normal: n || undefined });
  for (let i = 0; i < (head ? 3 : 2); i++) {
    _a.set(R() - 0.5, R() - 0.3, R() - 0.5).normalize().multiplyScalar(0.25 + R() * 0.35).add(p);
    fx.bolt?.(p.clone(), _a.clone(), { col: k3(COL.white, 0.5), glow: k3(COL.core, 0.35), width: 0.03, core: 0.25, levels: 3, jitter: 0.25, branches: 0, regen: 0.03, life: 0.1 });
  }
  if (head) fx.shockwave?.(p.clone(), { normal: dir ? _b.copy(dir).negate() : UP, r0: 0.05, r1: 0.45, life: 0.15, color: k3(COL.rim, 0.5), thin: true });
  if (!flesh && n) fx.decals?.add(p, n, { frame: DECAL.scorch, size: 0.22, tint: DECAL_TINT.scorch, life: 5 });
}

// ------------------------------------------------------------------------------------------ 雷印 marks + lock (instanced)
const MAXM = 128;
/** Billboarded seal rings round marked zombies (1-3 per zombie) and the homing lock bracket: one draw each. */
export class MarkLayer {
  constructor(scene) {
    const T = textures();
    const mk = (map) => {
      const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, toneMapped: true }), MAXM);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXM * 3), 3);
      m.count = 0; m.frustumCulled = false; m.renderOrder = 22; scene.add(m);
      return m;
    };
    this.seal = mk(T?.seal); this.lock = mk(T?.bracket);
    this.t = 0;
  }
  /** list: [{ pos (chest), n (marks 1..3), fresh (0..1 pop), lock }], camera */
  update(list, cam, dt) {
    this.t += dt;
    const M = new THREE.Matrix4(), S = new THREE.Vector3(), C = new THREE.Color();
    let i = 0, j = 0;
    for (const e of list) {
      const d = Math.max(1, e.pos.distanceTo(cam.position)), far = Math.min(2.2, 1 + Math.max(0, d - 10) * 0.05);
      for (let k = 0; k < e.n && i < MAXM; k++) {
        const s = (0.34 + k * 0.12) * far * (1 + 0.6 * (e.fresh || 0)), spin = this.t * (k % 2 ? -1.6 : 1.3) + k;
        _q.setFromAxisAngle(_a.set(0, 0, 1), spin); _q.premultiply(cam.quaternion);
        M.compose(e.pos, _q, S.set(s, s, s)); this.seal.setMatrixAt(i, M);
        const full = e.n >= 3 ? 1.6 + 0.5 * Math.sin(this.t * 18) : 1;
        C.setRGB(...(k === 2 ? k3(COL.gold, 0.35 * full) : k3(COL.core, 0.42 * full))); this.seal.setColorAt(i++, C);
      }
      if (e.lock && j < MAXM) {
        const s = 0.75 * far * (1 + 0.25 * Math.sin(this.t * 9));
        _q.setFromAxisAngle(_a.set(0, 0, 1), this.t * 2.2); _q.premultiply(cam.quaternion);
        M.compose(e.pos, _q, S.set(s, s, s)); this.lock.setMatrixAt(j, M);
        C.setRGB(...k3(COL.rim, 0.32)); this.lock.setColorAt(j++, C);
      }
    }
    this.seal.count = i; this.lock.count = j;
    for (const m of [this.seal, this.lock]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }
  dispose() { for (const m of [this.seal, this.lock]) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); } }
}

// ------------------------------------------------------------------------------------------ lightning
/** A live chain of lightning links (連霆): set([[from, to, weight], ...]) every frame; contact sparks at the ends. */
export class Chain {
  constructor(g) { this.g = g; this.bolts = []; this.t = 0; }
  set(links, dt) {
    const fx = this.g.fx;
    this.t += dt;
    while (this.bolts.length > links.length) this.bolts.pop().stop();
    links.forEach(([from, to, w], i) => {
      let b = this.bolts[i];
      if (!b) {
        b = fx?.bolt?.(from.clone(), to.clone(), { col: k3(COL.white, 0.7), glow: k3(COL.core, 0.42), width: 0.1, core: 0.22, levels: 5, jitter: 0.09, branches: 2, regen: 0.04, life: Infinity });
        if (!b) return;
        this.bolts[i] = b;
      }
      b.width = (i === 0 ? 0.14 : 0.1) * w; b.branches = i === 0 ? 3 : 1;
      b.set(from, to);
      // contact: hot sparks and a flicker glow where the arc bites
      const P = fx?.particles;
      if (P && R() < dt * 30) {
        P.spawn({ additive: true, x: to.x, y: to.y, z: to.z, life: 0.07, size: 0.35 * w, size1: 0.2, color: [...k3(COL.white, 0.4), 1], color1: [...k3(COL.core, 0.1), 0], frame: FRAME.glow });
        for (let k = 0; k < 3; k++) P.spawn({ additive: true, x: to.x, y: to.y, z: to.z, vx: (R() - 0.5) * 6, vy: R() * 4, vz: (R() - 0.5) * 6, life: 0.2 + R() * 0.15, size: 0.014, color: [...k3(COL.rim, 0.7), 1], color1: [...k3(COL.gold, 0.25), 0], frame: FRAME.spark, stretch: 0.03, gravity: 9 });
      }
    });
  }
  stop() { for (const b of this.bolts) b.stop(); this.bolts.length = 0; }
}

/**
 * A strike from the sky onto p: a jagged bolt from a cloud base, a white ground flash, a cold light, a ring of dust,
 * rubble flecks and a glowing radial crack that cools into a dark scorch. size ~1 (pool strike) .. 3 (ultimate).
 */
export function skyStrike(g, p, { size = 1, height = 16, near = 1, crack = true, dust = true, light = true, seed } = {}) {
  const fx = g.fx;
  if (!fx) return;
  const top = _a.set(p.x + (R() - 0.5) * 3 * size, p.y + height, p.z + (R() - 0.5) * 3 * size).clone();
  fx.bolt?.(top, p.clone().add(_b.set(0, 0.05, 0)), { col: k3(COL.white, 0.9 * near), glow: k3(COL.core, 0.55 * near), width: 0.22 * size, core: 0.22, levels: 6, jitter: 0.07, branches: 3, regen: 0.06, life: 0.16 + 0.04 * size });
  fx.bolt?.(top.clone().add(_b.set((R() - 0.5) * 2, 0, (R() - 0.5) * 2)), p.clone().add(_b.set((R() - 0.5) * 1.2 * size, 0.05, (R() - 0.5) * 1.2 * size)), { col: k3(COL.white, 0.5 * near), glow: k3(COL.deep, 0.5 * near), width: 0.1 * size, core: 0.2, levels: 5, jitter: 0.1, branches: 2, regen: 0.05, life: 0.12 });
  const P = fx.particles;
  P?.spawn({ additive: true, x: p.x, y: p.y + 0.6 * size, z: p.z, life: 0.12, size: 2.2 * size * near, size1: 3.2 * size * near, color: [...k3(COL.white, 0.45 * near), 1], color1: [...k3(COL.core, 0.05), 0], frame: FRAME.glow });
  fx.shockwave?.(_b.set(p.x, p.y + 0.06, p.z), { normal: UP, r0: 0.2, r1: 2.2 * size, life: 0.3, color: k3(COL.rim, 0.7), thin: true });
  fx.sparkBurst?.(p.clone().add(_b.set(0, 0.2, 0)), { color: k3(COL.white, 0.6), color1: k3(COL.core, 0.4), count: Math.round(14 * size), speed: 7 * Math.sqrt(size), glow: 0.8, normal: UP });
  if (light) fx.lights?.flash?.(_b.set(p.x, p.y + 2, p.z), 0xbfe8ff, 70 * size, 9 * size, 0.18);
  if (dust) for (let i = 0; i < 6 + 4 * size; i++) { const a = R() * TAU; fx.knockDust?.(_b.set(p.x + Math.cos(a) * 0.6 * size, p.y, p.z + Math.sin(a) * 0.6 * size), _c.set(Math.cos(a) * 4 * size, 0, Math.sin(a) * 4 * size), 0.8); }
  rubble(g, p, Math.round(5 * size), 5 + size);
  if (crack) {
    fx.zfx?.ground?.add?.('crack', _b.set(p.x, p.y + 0.03, p.z), { r: 1.1 * size, life: 0.9, col: k3(COL.core, 0.9), alpha: 0, fadeIn: 0.01, fadeOut: 0.8, seed });
    fx.zfx?.ground?.add?.('crack', _b.set(p.x, p.y + 0.02, p.z), { r: 1.0 * size, life: 4, col: [0.04, 0.035, 0.03], alpha: 0.8, fadeIn: 0.05, fadeOut: 1.6, seed });
    fx.decals?.add(p, UP, { frame: DECAL.scorch, size: 0.9 * size, tint: DECAL_TINT.scorch, life: 6 });
  }
}
/** realistic flecks of broken paving / grit thrown off a strike */
export function rubble(g, p, n, speed) {
  const P = g.fx?.particles;
  if (!P) return;
  for (let i = 0; i < n; i++) {
    const a = R() * TAU, s = speed * (0.4 + R() * 0.6);
    P.spawn({ x: p.x, y: p.y + 0.1, z: p.z, vx: Math.cos(a) * s * 0.5, vy: s * (0.6 + R() * 0.6), vz: Math.sin(a) * s * 0.5, life: 0.9 + R() * 0.5, size: 0.04 + R() * 0.05, color: [0.32, 0.3, 0.27, 1], color1: [0.3, 0.28, 0.25, 1], frame: FRAME.rock, gravity: 14, spin: (R() - 0.5) * 18, collide: true, bounce: 0.25, lit: true });
  }
}

/** First-person arcs (the pearl's plasma, the fingers of a casting hand): camera-space bolt from a to b. */
export function vmArc(g, a, b, { w = 0.004, life = 0.08, k = 1, levels = 3 } = {}) {
  return g.fx?.bolt?.(a.clone(), b.clone(), { vm: true, col: k3(COL.white, 0.6 * k), glow: k3(COL.core, 0.45 * k), width: w, core: 0.25, levels, jitter: 0.22, branches: 0, regen: 0.03, life });
}

// ------------------------------------------------------------------------------------------ 雷池 field
/** The electric fence round the pool: short ground arcs flickering along the rim; flash(at) lights one stretch. */
export class Fence {
  constructor(g, c, r) { this.g = g; this.c = c.clone(); this.r = r; this.t = 0; this.next = 0; this.k = 1; }
  update(dt, k = 1) {
    this.t += dt; this.k = k;
    if ((this.next -= dt) > 0) return;
    this.next = 0.05;
    const fx = this.g.fx, n = 2;
    for (let i = 0; i < n; i++) {
      const a0 = R() * TAU, a1 = a0 + (0.25 + R() * 0.25) * (R() < 0.5 ? -1 : 1);
      const y = this.c.y + 0.12 + R() * 0.25;
      fx?.bolt?.(_a.set(this.c.x + Math.cos(a0) * this.r, y, this.c.z + Math.sin(a0) * this.r).clone(), _b.set(this.c.x + Math.cos(a1) * this.r, y + (R() - 0.5) * 0.3, this.c.z + Math.sin(a1) * this.r).clone(),
        { col: k3(COL.white, 0.45 * k), glow: k3(COL.core, 0.35 * k), width: 0.07, core: 0.2, levels: 4, jitter: 0.18, branches: 1, regen: 0.04, life: 0.12 });
    }
  }
  /** a zombie hit the fence at p: that stretch flares up into a spark wall */
  flash(p) {
    const fx = this.g.fx, P = fx?.particles, a = Math.atan2(p.z - this.c.z, p.x - this.c.x);
    for (let i = -1; i <= 1; i++) {
      const b0 = a + i * 0.18, x = this.c.x + Math.cos(b0) * this.r, z = this.c.z + Math.sin(b0) * this.r;
      fx?.bolt?.(_a.set(x, this.c.y + 0.05, z).clone(), _b.set(x, this.c.y + 1.6 + R() * 0.6, z).clone(), { col: k3(COL.white, 0.7), glow: k3(COL.core, 0.5), width: 0.09, core: 0.22, levels: 4, jitter: 0.15, branches: 1, regen: 0.03, life: 0.16 });
    }
    P?.spawn({ additive: true, x: p.x, y: p.y + 0.9, z: p.z, life: 0.14, size: 1.0, size1: 1.4, color: [...k3(COL.white, 0.3), 1], color1: [...k3(COL.core, 0.05), 0], frame: FRAME.glow });
    fx?.sparkBurst?.(_a.set(p.x, p.y + 0.9, p.z).clone(), { color: k3(COL.white, 0.6), color1: k3(COL.gold, 0.3), count: 12, speed: 6, glow: 0.5 });
  }
}

// ------------------------------------------------------------------------------------------ 震霄: cloud, rain, spirit
/** A dark storm disc gathering over c (height h), lit from inside by flashes; returns { flash(k), stop() } */
export function stormCloud(g, c, { h = 16, r = 7, life = 4.8 } = {}) {
  const P = g.fx?.particles, n = 18;
  if (P) for (let i = 0; i < n; i++) {
    const a = i / n * TAU + R() * 0.3, rr = r * (0.25 + R() * 0.75), x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr, sp = 0.6 + R() * 0.6;
    P.spawn({ x, y: c.y + h + (R() - 0.5) * 1.5, z, vx: -Math.sin(a) * sp, vz: Math.cos(a) * sp, vy: -0.1, life: life * (0.85 + R() * 0.2), delay: R() * 0.25, fadeIn: 0.15,
      size: 3.5 + R() * 2.5, size1: 5.5 + R() * 2, color: [0.08, 0.1, 0.14, 0.92], color1: [0.08, 0.1, 0.13, 0], colorPow: 3, frame: FRAME.puff + (i % 4), lit: true, drag: 0.4, rot: R() * 6 });
  }
  const flash = (k = 1) => {
    const p = _a.set(c.x + (R() - 0.5) * r, c.y + h - 0.5, c.z + (R() - 0.5) * r);
    P?.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.16, size: 5 * k, size1: 7 * k, color: [...k3(COL.rim, 0.22 * k), 1], color1: [...k3(COL.deep, 0.05), 0], frame: FRAME.glow });
    g.fx?.lights?.flash?.(p, 0x9fd8ff, 40 * k, r * 3, 0.14);
  };
  return { flash, stop() {} };
}
/** 甘霖: a soft rain falling over c (radius r) for dur s, with a slow heal ring on the ground */
export function rain(g, c, r, dur) {
  let t = 0, acc = 0;
  const fx = g.fx;
  const ring = fx?.zfx?.ground?.add?.('heal', _a.set(c.x, c.y + 0.03, c.z), { r, life: dur, col: k3(COL.jade, 0.5), fadeIn: 0.4, fadeOut: 0.8 });
  return {
    update(dt) {
      t += dt; acc += dt * 60;
      const P = fx?.particles;
      while (acc >= 1 && P) {
        acc -= 1;
        const a = R() * TAU, d = Math.sqrt(R()) * r;
        P.spawn({ x: c.x + Math.cos(a) * d, y: c.y + 7 + R() * 3, z: c.z + Math.sin(a) * d, vy: -11, life: 0.75, size: 0.012, color: [0.75, 0.85, 0.95, 0.5], color1: [0.75, 0.85, 0.95, 0.35], frame: FRAME.drop, stretch: 0.06, ground: c.y, soft: 0.1 });
      }
      return t < dur;
    },
    stop() { ring?.stop?.(); },
  };
}

/**
 * The 應龍 spirit (≤ 3k tris, 1 m units, head at -z, body trailing +z in a flying S): a scaled tapering body with a
 * dorsal crest, a horned head with an open jaw, two feathered wings (aAnim.x flap) and a fin tail; gold horns, wing
 * edges and crest by aTint. aAnim: x wing weight (signed), y body wave weight, z along the body (head 0).
 */
export function dragonGeometry() {
  const parts = [];
  const push = (g, anim, tint) => {
    g = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    const p = g.attributes.position, n = p.count, A = new Float32Array(n * 4), T = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const r = anim(p.getX(i), p.getY(i), p.getZ(i)); A.set([r[0], r[1], r[2], 0], i * 4);
      const t = tint ? tint(p.getX(i), p.getY(i), p.getZ(i)) : null; if (t) T.set(t, i * 4);
    }
    g.setAttribute('aAnim', new THREE.BufferAttribute(A, 4)); g.setAttribute('aTint', new THREE.BufferAttribute(T, 4));
    parts.push(g);
  };
  const L = 1.0;
  const path = (t) => new THREE.Vector3(Math.sin(t * 6.2) * 0.07 * t, Math.sin(t * 4.5 + 0.6) * 0.05 * t, -0.45 + t * L);
  const rad = (t) => 0.048 * (t < 0.06 ? 0.75 + t * 4 : Math.max(0.08, 1 - Math.pow(t, 1.4) * 0.92));
  // body: rings perpendicular to the path, scale bumps
  {
    const n = 56, m = 10, pos = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, P = path(t), T = path(Math.min(1, t + 0.01)).sub(path(Math.max(0, t - 0.01))).normalize();
      const N = new THREE.Vector3().crossVectors(UP, T).normalize(), B = new THREE.Vector3().crossVectors(T, N);
      for (let j = 0; j < m; j++) {
        const a = j / m * TAU, sc = 1 + 0.06 * ((i + (j % 2)) % 2), r = rad(t) * sc * (Math.sin(a) < -0.5 ? 0.88 : 1);
        pos.push(P.x + (N.x * Math.cos(a) + B.x * Math.sin(a)) * r, P.y + (N.y * Math.cos(a) + B.y * Math.sin(a)) * r, P.z + (N.z * Math.cos(a) + B.z * Math.sin(a)) * r);
      }
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { const a = i * m + j, b = i * m + (j + 1) % m, c = a + m, d = b + m; idx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    push(g, (x, y, z) => { const t = (z + 0.45) / L; return [0, Math.min(1, Math.max(0, t) * 1.5), Math.max(0, t)]; });
    // dorsal crest: flame spikes
    for (let i = 0; i < 18; i++) {
      const t = 0.08 + i * 0.05, P = path(t), h = 0.055 * (1 - t * 0.7);
      const cone = new THREE.ConeGeometry(0.014 * (1 - t * 0.5), h, 4).rotateX(0.6).translate(P.x, P.y + rad(t) * 0.9 + h * 0.35, P.z);
      push(cone, () => [0, Math.min(1, t * 1.5), t], () => [0.95, 0.72, 0.3, 0.8]);
    }
    // tail fin
    const tp = path(0.98);
    push(new THREE.ConeGeometry(0.045, 0.16, 4).scale(1.6, 1, 0.25).rotateX(Math.PI / 2).translate(tp.x, tp.y, tp.z + 0.06), () => [0, 1, 1], () => [0.95, 0.72, 0.3, 0.6]);
  }
  // head: skull + snout + jaw, horns, whiskers, mane
  {
    const h0 = path(0);
    const skull = new THREE.SphereGeometry(0.5, 14, 10).scale(0.11, 0.09, 0.2).translate(h0.x, h0.y + 0.015, h0.z - 0.06);
    const snout = new THREE.SphereGeometry(0.5, 12, 8).scale(0.075, 0.055, 0.14).rotateX(-0.12).translate(h0.x, h0.y + 0.02, h0.z - 0.17);
    const jaw = new THREE.SphereGeometry(0.5, 10, 6).scale(0.07, 0.035, 0.14).rotateX(0.35).translate(h0.x, h0.y - 0.035, h0.z - 0.14);
    for (const g of [skull, snout, jaw]) push(g, () => [0, 0, 0]);
    for (const s of [-1, 1]) {
      const horn = new THREE.ConeGeometry(0.014, 0.17, 5).rotateX(-1.1).rotateZ(-s * 0.3).translate(h0.x + s * 0.04, h0.y + 0.09, h0.z + 0.04);
      push(horn, () => [0, 0, 0], () => [0.98, 0.76, 0.32, 0.9]);
      const tine = new THREE.ConeGeometry(0.008, 0.07, 4).rotateX(-0.4).translate(h0.x + s * 0.05, h0.y + 0.12, h0.z + 0.02);
      push(tine, () => [0, 0, 0], () => [0.98, 0.76, 0.32, 0.9]);
      const eye = new THREE.SphereGeometry(0.014, 6, 4).translate(h0.x + s * 0.045, h0.y + 0.04, h0.z - 0.1);
      push(eye, () => [0, 0, 0], () => [1, 1, 1, 1]);
      // whisker
      const pts = [], m = 10;
      for (let i = 0; i <= m; i++) { const t = i / m; pts.push(new THREE.Vector3(h0.x + s * (0.04 + t * 0.22), h0.y - 0.01 - t * 0.06 + Math.sin(t * 6) * 0.025, h0.z - 0.21 + t * 0.2)); }
      push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.005, 3), () => [0, 0, 0], () => [0.98, 0.76, 0.32, 0.9]);
      // mane flames sweeping back
      for (let k = 0; k < 3; k++) push(new THREE.ConeGeometry(0.025, 0.14 - k * 0.02, 4).scale(1, 1, 0.3).rotateX(1.25).rotateZ(s * (0.5 + k * 0.25)).translate(h0.x + s * 0.06, h0.y + 0.02 - k * 0.02, h0.z + 0.07), () => [0, 0.05, 0.02], () => [0.95, 0.72, 0.3, 0.5]);
    }
  }
  // wings at the shoulders (t 0.16): bone + four feather cards per side, flapping (aAnim.x)
  {
    const sh = path(0.16);
    for (const s of [-1, 1]) {
      const pos = [], idx = [], cols = 6, rows = 4;
      for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
        const u = i / cols, v = j / rows, span = 0.62, x = s * (0.04 + u * span), chord = 0.22 * (1 - u * 0.55) * (0.3 + 0.7 * Math.sin(Math.PI * Math.min(1, (u + 0.15)))) ;
        const sweep = u * u * 0.18, yy = sh.y + 0.03 + u * 0.12 - u * u * 0.08;
        // feather scallops on the trailing edge
        const scal = v === 1 ? 0.03 * Math.abs(Math.sin(u * Math.PI * 4)) : 0;
        pos.push(sh.x + x, yy, sh.z - 0.02 + sweep + v * (chord + scal));
      }
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      push(g, (x) => [s * Math.min(1, Math.abs(x - sh.x) / 0.62), 0.1, 0.16], (x, y, z) => [0.98, 0.78, 0.35, z - sh.z < 0.012 ? 0.9 : 0]);
      // the wing bone along the leading edge
      const bp = [];
      for (let i = 0; i <= 8; i++) { const u = i / 8; bp.push(new THREE.Vector3(sh.x + s * (0.04 + u * 0.62), sh.y + 0.03 + u * 0.12 - u * u * 0.08, sh.z - 0.025 + u * u * 0.18)); }
      push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bp), 10, 0.011, 4), (x) => [s * Math.min(1, Math.abs(x - sh.x) / 0.62), 0.1, 0.16], () => [0.98, 0.76, 0.32, 0.85]);
    }
  }
  // two clawed legs (short)
  for (const [t, s] of [[0.24, 1], [0.24, -1], [0.62, 1], [0.62, -1]]) {
    const P = path(t);
    push(new THREE.ConeGeometry(0.016, 0.1, 4).rotateZ(s * 2.5).translate(P.x + s * 0.05, P.y - 0.05, P.z), () => [0, Math.min(1, t * 1.5), t], () => [0.98, 0.76, 0.32, 0.6]);
  }
  const all = mergeAll(parts);
  all.computeBoundingBox();
  return all;
}
function mergeAll(list) {
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), A = new Float32Array(n * 4), T = new Float32Array(n * 4);
  let o = 0;
  for (const g of list) { const c = g.attributes.position.count; P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); A.set(g.attributes.aAnim.array, o * 4); T.set(g.attributes.aTint.array, o * 4); o += c; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('aAnim', new THREE.BufferAttribute(A, 4)); g.setAttribute('aTint', new THREE.BufferAttribute(T, 4));
  return g;
}

// ------------------------------------------------------------------------------------------ KE_THUNDER
/** Kill: a thin bolt from above onto the corpse, the body crawls with arcs and smokes, a branching scorch below. */
export function thunderKill(g, z, p, { big = false } = {}) {
  const fx = g.fx;
  if (!fx) return;
  const top = _a.set(p.x + (R() - 0.5), p.y + 9, p.z + (R() - 0.5)).clone();
  fx.bolt?.(top, p.clone(), { col: k3(COL.white, 0.8), glow: k3(COL.core, 0.45), width: big ? 0.12 : 0.08, core: 0.22, levels: 5, jitter: 0.08, branches: 2, regen: 0.05, life: 0.12 });
  fx.particles?.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.12, size: 0.7, size1: 1.1, color: [...k3(COL.white, 0.35), 1], color1: [...k3(COL.core, 0.05), 0], frame: FRAME.glow });
  fx.zfx?.status?.(z, 'shocked', 0.8);
  const fy = z.pos?.y ?? p.y - 1;
  fx.zfx?.ground?.add?.('crack', _b.set(z.pos?.x ?? p.x, fy + 0.025, z.pos?.z ?? p.z), { r: big ? 1.3 : 0.9, life: 3, col: k3(COL.core, 0.35), alpha: 0, fadeIn: 0.02, fadeOut: 1.2 });
  fx.zfx?.ground?.add?.('crack', _b.set(z.pos?.x ?? p.x, fy + 0.02, z.pos?.z ?? p.z), { r: big ? 1.2 : 0.85, life: 3, col: [0.035, 0.03, 0.03], alpha: 0.75, fadeIn: 0.05, fadeOut: 1.4 });
  // arcs crawling over the body, then a wisp of scorched smoke
  for (let i = 0; i < 4; i++) {
    _a.set(p.x + (R() - 0.5) * 0.5, p.y + (R() - 0.4) * 0.9, p.z + (R() - 0.5) * 0.5);
    fx.bolt?.(p.clone(), _a.clone(), { col: k3(COL.white, 0.5), glow: k3(COL.core, 0.35), width: 0.035, core: 0.25, levels: 3, jitter: 0.25, branches: 0, regen: 0.04, life: 0.35 + R() * 0.4 });
  }
  for (let i = 0; i < 3; i++) fx.particles?.spawn({ x: p.x + (R() - 0.5) * 0.3, y: p.y + 0.2, z: p.z + (R() - 0.5) * 0.3, vy: 0.5 + R() * 0.4, life: 1.2 + R() * 0.6, delay: 0.2 + i * 0.12, size: 0.18, size1: 0.6, color: [0.12, 0.12, 0.13, 0.5], color1: [0.15, 0.15, 0.16, 0], frame: FRAME.puff + i, lit: true, drag: 1.5 });
}
