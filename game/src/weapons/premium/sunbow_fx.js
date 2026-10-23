// X03 彤弓．落陽 effect primitives (docs/PREMIUM_WEAPONS.md §2.30): sun sprites (懸日, the nine suns of 落九陽),
// world arrows (mesh + stage trails), first-person draw / release / forming particles, impacts, KE_SUNMARK.
// Everything is additive glow on top of the realistic base FX (impacts, dust, scorch, quake rings), §1.1 rule 5.
import * as THREE from 'three';
import { FRAME, DECAL, DECAL_TINT, RAMP } from '../../fx/fx.js';

const R = Math.random;
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3(), _r = new THREE.Vector3();

// HDR colours (linear): white-hot core, sun gold, vermilion flame, embers
export const COL = {
  white: [9, 8.2, 6.4], gold: [6.2, 4.3, 1.5], sun: [4.6, 3.0, 0.9], flame: [4.4, 1.5, 0.35], verm: [3.4, 0.75, 0.22], ember: [2.6, 1.15, 0.3], ash: [0.5, 0.42, 0.34],
};
const k = (c, m) => [c[0] * m, c[1] * m, c[2] * m];

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
/** Sun sprite textures (built once): core (soft disc), corona (tapered flame rays, noisy), ring (thin halo). */
function textures() {
  if (_tex || typeof document === 'undefined') return _tex;
  const mk = (draw, S = 256) => { const c = document.createElement('canvas'); c.width = c.height = S; draw(c.getContext('2d'), S); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t; };
  const core = mk((x, S) => {
    const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.22, 'rgba(255,250,235,1)'); g.addColorStop(0.34, 'rgba(255,220,150,0.85)');
    g.addColorStop(0.5, 'rgba(255,160,60,0.32)'); g.addColorStop(0.75, 'rgba(255,90,20,0.08)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
  });
  const corona = mk((x, S) => {
    x.translate(S / 2, S / 2);
    x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU + (R() - 0.5) * 0.12, L = S * (0.26 + R() * 0.22) * (i % 2 ? 0.8 : 1), w = S * (0.018 + R() * 0.02);
      x.save(); x.rotate(a);
      const g = x.createLinearGradient(S * 0.1, 0, L, 0);
      g.addColorStop(0, 'rgba(255,200,110,0.7)'); g.addColorStop(0.6, 'rgba(255,110,40,0.28)'); g.addColorStop(1, 'rgba(255,60,10,0)');
      x.fillStyle = g;
      x.beginPath(); x.moveTo(S * 0.1, -w); x.quadraticCurveTo(L * 0.6, -w * 0.7, L, 0); x.quadraticCurveTo(L * 0.6, w * 0.7, S * 0.1, w); x.closePath(); x.fill();
      x.restore();
    }
  });
  const ring = mk((x, S) => {
    x.translate(S / 2, S / 2);
    const g = x.createRadialGradient(0, 0, S * 0.36, 0, 0, S * 0.48);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,240,200,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, S * 0.48, 0, TAU); x.fill();
  });
  _tex = { core, corona, ring };
  return _tex;
}
function sprite(tex, color, size) {
  const m = new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(...color), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
  const s = new THREE.Sprite(m);
  s.scale.setScalar(size);
  return s;
}

/**
 * A sun in the world (懸日, the nine suns): white core, a rotating corona of flame rays (two layers turning opposite
 * ways), a soft outer glow. { group, set(size, bright), update(dt), remove() }.
 */
export class SunOrb {
  constructor(scene, pos, size = 1.4, { glow = 1 } = {}) {
    const T = textures();
    this.group = new THREE.Group();
    this.group.position.copy(pos);
    this.size = size; this.bright = 1; this.t = R() * 10; this.glowK = glow;
    if (T) {
      this.halo = sprite(T.core, k(COL.verm, 0.35 * glow), size * 3.4);
      this.c1 = sprite(T.corona, k(COL.flame, 0.9), size * 2.3);
      this.c2 = sprite(T.corona, k(COL.gold, 0.55), size * 1.9);
      this.core = sprite(T.core, k(COL.white, 0.55), size * 1.15);
      this.group.add(this.halo, this.c1, this.c2, this.core);
    }
    scene.add(this.group);
  }
  set(size, bright = this.bright) { this.size = size; this.bright = bright; }
  update(dt) {
    this.t += dt;
    if (!this.core) return;
    const p = 1 + 0.06 * Math.sin(this.t * 7.3) + 0.04 * Math.sin(this.t * 13.1), s = this.size, b = this.bright;
    this.c1.material.rotation += dt * 0.35; this.c2.material.rotation -= dt * 0.5;
    this.halo.scale.setScalar(s * 3.4 * p); this.c1.scale.setScalar(s * 2.3 * p); this.c2.scale.setScalar(s * 1.9 / p); this.core.scale.setScalar(s * 1.15 * p);
    this.halo.material.color.setRGB(...k(COL.verm, 0.35 * b * this.glowK)); this.c1.material.color.setRGB(...k(COL.flame, 0.9 * b));
    this.c2.material.color.setRGB(...k(COL.gold, 0.55 * b)); this.core.material.color.setRGB(...k(COL.white, 0.55 * b));
  }
  remove() { this.group.removeFromParent(); for (const c of this.group.children) c.material.dispose(); }
}

// ------------------------------------------------------------------------------------------ world arrows
let _arrowGeo = null;
const _mats = {};
/** Shared flying / stuck arrow geometry (0.74 m along -Z, nock at the origin) and per-stage materials. */
function arrowGeo() {
  if (_arrowGeo) return _arrowGeo;
  const parts = [];
  const shaft = new THREE.CylinderGeometry(0.0048, 0.0048, 0.64, 6); shaft.rotateX(Math.PI / 2); shaft.translate(0, 0, -0.33); parts.push([shaft, 'shaft']);
  const head = new THREE.OctahedronGeometry(1, 0); head.scale(0.016, 0.0045, 0.05); head.translate(0, 0, -0.69); parts.push([head, 'head']);
  for (let i = 0; i < 3; i++) {
    const v = new THREE.PlaneGeometry(0.014, 0.13); v.rotateX(-Math.PI / 2); v.translate(0, 0.011, -0.09); v.rotateZ(i * TAU / 3); parts.push([v, 'fletch']);
  }
  _arrowGeo = parts;
  return parts;
}
function arrowMat(kind, stage) {
  const key = kind + stage;
  if (_mats[key]) return _mats[key];
  const m = kind === 'shaft' ? new THREE.MeshStandardMaterial({ color: 0xb08a5a, roughness: 0.6 })
    : kind === 'fletch' ? new THREE.MeshStandardMaterial({ color: 0x9a1420, roughness: 0.8, side: THREE.DoubleSide })
      : new THREE.MeshStandardMaterial({ color: 0x7a5a2e, metalness: 1, roughness: 0.35, emissive: new THREE.Color(1, 0.45, 0.12), emissiveIntensity: [0, 0.5, 3, 7][stage] ?? 0 });
  return (_mats[key] = m);
}
/** A world arrow mesh (stage tints the head: dark bronze -> molten -> white-hot). */
export function arrowMesh(stage) {
  const g = new THREE.Group();
  for (const [geo, kind] of arrowGeo()) g.add(new THREE.Mesh(geo, arrowMat(kind, stage)));
  return g;
}

/** Stage trail of a flying arrow: { push(pos), stop() }. 點射/引 thin gold, 滿 vermilion flame, 貫日 white-gold shaft + glow. */
export function arrowTrail(g, stage, fan = false) {
  const fx = g.fx;
  if (!fx?.trail) return { push() {}, stop() {} };
  const T = [];
  if (stage <= 1) T.push(fx.trail({ width: fan ? 0.022 : 0.03, life: 0.16, color: [...k(COL.gold, 0.7), 1], color1: [...k(COL.verm, 0.25), 0], taper: 0.2, segs: 16 }));
  else if (stage === 2) {
    T.push(fx.trail({ width: 0.05, life: 0.24, color: [...k(COL.flame, 0.9), 1], color1: [...k(COL.verm, 0.3), 0], taper: 0.3, segs: 20 }));
    T.push(fx.trail({ width: 0.016, life: 0.12, color: [...k(COL.white, 0.5), 1], color1: [...k(COL.gold, 0.3), 0], taper: 0.2, segs: 12, profile: 'beam' }));
  } else {
    T.push(fx.trail({ width: 0.16, life: 0.32, color: [...k(COL.flame, 0.6), 1], color1: [...k(COL.verm, 0.15), 0], taper: 0.35, segs: 24 }));
    T.push(fx.trail({ width: 0.045, life: 0.26, color: [...k(COL.white, 0.9), 1], color1: [...k(COL.gold, 0.4), 0], taper: 0.25, segs: 22, profile: 'beam' }));
  }
  return { push(p) { for (const t of T) t.push(p); }, stop() { for (const t of T) t.stop(); } };
}
/** Head glow + sparks behind a flying arrow, every frame (world particles). */
export function arrowSpark(g, p, dir, stage, dt) {
  const P = g.fx?.particles;
  if (!P) return;
  if (stage >= 2) P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.05, size: stage === 3 ? 0.3 : 0.16, size1: 0.1, color: [...k(stage === 3 ? COL.white : COL.flame, 0.45), 1], color1: [0, 0, 0, 0], frame: FRAME.glow });
  if (R() < (stage === 3 ? 0.9 : stage === 2 ? 0.6 : 0.2) * Math.min(2, dt * 60)) {
    P.spawn({ additive: true, x: p.x - dir.x * 0.3, y: p.y - dir.y * 0.3, z: p.z - dir.z * 0.3, vx: (R() - 0.5) * 1.2, vy: (R() - 0.2) * 1.2, vz: (R() - 0.5) * 1.2, life: 0.35 + R() * 0.4,
      size: 0.018, size1: 0.006, color: [...COL.ember, 1], color1: [...k(COL.verm, 0.3), 0], frame: FRAME.spark, stretch: 0.02, gravity: 3, drag: 1.5 });
  }
}

// ------------------------------------------------------------------------------------------ first person
/** The arrow burning into being on the string (renock): sparks spiral onto the shaft from nock to head. */
export function formSparks(g, u) {
  const vm = g.vm, P = g.fx?.particles;
  const n = vm?.socketCam?.('nock', _a), h = vm?.socketCam?.('head', _b);
  if (!P || !n || !h) return;
  gunAxes(vm);
  const at = _c.lerpVectors(n, h, Math.min(1, u * 1.05));
  for (let i = 0; i < 2; i++) {
    const a = R() * TAU, rr = 0.012 + R() * 0.012;
    const ox = (_u.x * Math.cos(a) + _r.x * Math.sin(a)) * rr, oy = (_u.y * Math.cos(a) + _r.y * Math.sin(a)) * rr, oz = (_u.z * Math.cos(a) + _r.z * Math.sin(a)) * rr;
    P.spawn({ additive: true, vm: true, x: at.x + ox, y: at.y + oy, z: at.z + oz, vx: -ox * 4, vy: -oy * 4, vz: -oz * 4, life: 0.12, size: 0.006, size1: 0.002, color: [...k(COL.gold, 0.8), 1], color1: [...k(COL.verm, 0.3), 0], frame: FRAME.glow });
  }
  P.spawn({ additive: true, vm: true, x: at.x, y: at.y, z: at.z, life: 0.05, size: 0.02, size1: 0.012, color: [...k(COL.white, 0.25), 1], color1: [0, 0, 0, 0], frame: FRAME.glow });
}
/**
 * The drawn head in first person: 滿 = flame licks and embers off the head, 貫日 = a white-hot core with a small sun
 * halo (kept small: the head sits left-below the crosshair, §1.14 centre 20 %).
 */
export function headFire(g, stage, t) {
  const vm = g.vm, P = g.fx?.particles, h = vm?.socketCam?.('head', _a);
  if (!P || !h || stage < 1) return;
  gunAxes(vm);
  if (stage === 1) { if (R() < 0.25) P.spawn({ additive: true, vm: true, x: h.x, y: h.y, z: h.z, life: 0.08, size: 0.012, size1: 0.006, color: [...k(COL.gold, 0.3), 1], color1: [0, 0, 0, 0], frame: FRAME.glow }); return; }
  const hot = stage === 3;
  P.spawn({ additive: true, vm: true, x: h.x, y: h.y, z: h.z, life: 0.05, size: hot ? 0.05 : 0.03, size1: hot ? 0.045 : 0.025, color: [...k(hot ? COL.white : COL.flame, hot ? 0.16 : 0.18), 1], color1: [0, 0, 0, 0], frame: FRAME.glow });
  if (R() < 0.7) {
    const lift = 0.04 + R() * 0.05;
    P.spawn({ additive: true, vm: true, x: h.x + (R() - 0.5) * 0.01, y: h.y, z: h.z + (R() - 0.5) * 0.01, vx: _u.x * lift - _f.x * 0.02, vy: _u.y * lift, vz: _u.z * lift - _f.z * 0.02, mode: 'align', dir: [_u.x, _u.y, _u.z],
      aspect: 2.2, anchor: 0.3, life: 0.16 + R() * 0.1, size: hot ? 0.016 : 0.013, size1: 0.004, color: [1.3, 1.1, 0.9, 1], color1: [1, 0.8, 0.6, 0], frame: FRAME.fire + ((R() * 8) | 0), ramp: RAMP.flame, heat: hot ? 1.2 : 0.95, heat1: 0.4 });
  }
  if (R() < (hot ? 0.5 : 0.3)) P.spawn({ additive: true, vm: true, x: h.x, y: h.y, z: h.z, vx: (R() - 0.5) * 0.08 + _u.x * 0.06, vy: _u.y * 0.08 + R() * 0.04, vz: (R() - 0.5) * 0.08, life: 0.35 + R() * 0.3, size: 0.0028, color: [...COL.ember, 1], color1: [...k(COL.verm, 0.3), 0], frame: FRAME.glow, gravity: -0.05, drag: 1 });
  if (hot && Math.sin(t * 9) > 0.6) P.spawn({ additive: true, vm: true, x: h.x, y: h.y, z: h.z, mode: 'flat', dir: [_f.x, _f.y, _f.z], life: 0.06, size: 0.05, size1: 0.07, color: [...k(COL.gold, 0.12), 1], color1: [0, 0, 0, 0], frame: FRAME.thinRing ?? 62 });
}
/** Stage-up cue on the head: a ring snapping out round the arrow axis and a spark puff (stage 1..3). */
export function stagePulse(g, stage) {
  const vm = g.vm, P = g.fx?.particles, h = vm?.socketCam?.('head', _a);
  if (!P || !h) return;
  gunAxes(vm);
  const c = stage === 3 ? COL.white : stage === 2 ? COL.flame : COL.gold;
  P.spawn({ additive: true, vm: true, x: h.x, y: h.y, z: h.z, mode: 'flat', dir: [_f.x, _f.y, _f.z], life: 0.16, size: 0.012, size1: 0.07 + stage * 0.02, sizePow: 0.5, color: [...k(c, 0.3), 1], color1: [...k(c, 0.05), 0], frame: FRAME.thinRing ?? 62 });
  for (let i = 0; i < 4 + stage * 3; i++) {
    const a = R() * TAU, sp = 0.15 + R() * 0.2;
    P.spawn({ additive: true, vm: true, x: h.x, y: h.y, z: h.z, vx: (_u.x * Math.cos(a) + _r.x * Math.sin(a)) * sp, vy: (_u.y * Math.cos(a) + _r.y * Math.sin(a)) * sp, vz: (_u.z * Math.cos(a) + _r.z * Math.sin(a)) * sp,
      life: 0.18, size: 0.003, size1: 0.001, color: [...k(c, 0.5), 1], color1: [0, 0, 0, 0], frame: FRAME.spark, stretch: 0.01, drag: 4 });
  }
}
/** Release in first person: string slap sparks at the nock, a heat ring off the riser (滿 / 貫日), gold dust. */
export function releaseFx(g, stage) {
  const vm = g.vm, P = g.fx?.particles, h = vm?.socketCam?.('head', _a), n = vm?.socketCam?.('nock', _b);
  if (!P || !h) return;
  gunAxes(vm);
  if (stage >= 2) {
    P.spawn({ additive: true, vm: true, x: h.x + _f.x * 0.04, y: h.y + _f.y * 0.04, z: h.z + _f.z * 0.04, mode: 'flat', dir: [_f.x, _f.y, _f.z], life: stage === 3 ? 0.22 : 0.15,
      size: 0.03, size1: stage === 3 ? 0.42 : 0.24, sizePow: 0.45, color: [...k(stage === 3 ? COL.gold : COL.flame, 0.35), 1], color1: [...k(COL.verm, 0.05), 0], frame: FRAME.thinRing ?? 62 });
    P.spawn({ additive: true, vm: true, x: h.x, y: h.y, z: h.z, life: 0.06, size: 0.08, size1: 0.12, color: [...k(COL.white, stage === 3 ? 0.3 : 0.15), 1], color1: [0, 0, 0, 0], frame: FRAME.glow });
  }
  for (let i = 0; i < 6 + stage * 4; i++) {
    const sp = 0.4 + R() * 0.8;
    P.spawn({ additive: true, vm: true, x: h.x, y: h.y, z: h.z, vx: _f.x * sp + (R() - 0.5) * 0.3, vy: _f.y * sp + (R() - 0.3) * 0.3, vz: _f.z * sp + (R() - 0.5) * 0.3,
      life: 0.2 + R() * 0.2, size: 0.004, size1: 0.001, color: [...k(COL.gold, 0.6), 1], color1: [...k(COL.verm, 0.2), 0], frame: FRAME.spark, stretch: 0.012, drag: 3 });
  }
  if (n) for (let i = 0; i < 5; i++) P.spawn({ additive: true, vm: true, x: n.x, y: n.y, z: n.z, vx: (R() - 0.5) * 0.4, vy: (R() - 0.5) * 0.4, vz: (R() - 0.5) * 0.4, life: 0.12, size: 0.003, color: [...k(COL.gold, 0.5), 1], color1: [0, 0, 0, 0], frame: FRAME.spark, stretch: 0.008 });
}
/** A few embers drifting up off the 日珠 (idle, ≤ 6 alive). */
export function sunEmber(g) {
  const vm = g.vm, P = g.fx?.particles, c = vm?.socketCam?.('sun', _a);
  if (!P || !c) return;
  gunAxes(vm);
  P.spawn({ additive: true, vm: true, x: c.x + (R() - 0.5) * 0.02, y: c.y, z: c.z + (R() - 0.5) * 0.02, vx: _u.x * 0.03 + (R() - 0.5) * 0.01, vy: _u.y * 0.03 + 0.012, vz: _u.z * 0.03,
    life: 1.4 + R() * 0.8, size: 0.0024, size1: 0.0008, color: [...COL.ember, 1], color1: [...k(COL.verm, 0.4), 0], frame: FRAME.glow, drag: 0.6, inertia: 0.4 });
}
/** A sun core flaring (relit, first draw, ready): glint at socket rayN. */
export function rayGlint(g, i, m = 1) {
  const vm = g.vm, P = g.fx?.particles, c = vm?.socketCam?.('ray' + i, _a);
  if (!P || !c) return;
  P.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, life: 0.22, size: 0.012 * m, size1: 0.03 * m, color: [...k(COL.gold, 0.5 * m), 1], color1: [...k(COL.verm, 0.05), 0], frame: FRAME.glint ?? 63, rot: R() * 6 });
  P.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, life: 0.16, size: 0.02 * m, size1: 0.01, color: [...k(COL.white, 0.12 * m), 1], color1: [0, 0, 0, 0], frame: FRAME.glow });
}
/** Gold dust shaken off the string (pluck, first draw). */
export function stringDust(g) {
  const vm = g.vm, P = g.fx?.particles, n = vm?.socketCam?.('nock', _a), b = vm?.socketCam?.('bridgeU', _b);
  if (!P || !n || !b) return;
  for (let i = 0; i < 14; i++) {
    const u = R(), x = n.x + (b.x - n.x) * u, y = n.y + (b.y - n.y) * u, z = n.z + (b.z - n.z) * u;
    P.spawn({ additive: true, vm: true, x, y, z, vx: (R() - 0.5) * 0.05, vy: R() * 0.04, vz: (R() - 0.5) * 0.05, life: 0.5 + R() * 0.5, size: 0.0025, color: [...k(COL.gold, 0.6), 1], color1: [0, 0, 0, 0], frame: FRAME.glow, drag: 2 });
  }
}

// ------------------------------------------------------------------------------------------ world hits
/** Arrow strike: gold spark burst, a small fireball for 滿 / 貫日, a camera-facing sun-disc flash for 貫日. */
export function impact(g, p, n, dir, stage, flesh = false) {
  const fx = g.fx, P = fx?.particles;
  if (!fx) return;
  fx.sparkBurst?.(p, { color: k(COL.gold, 0.8), color1: k(COL.verm, 0.3), count: 6 + stage * 4, speed: 4 + stage * 1.5, glow: 0.25 + stage * 0.12, normal: n || null });
  if (stage >= 2 && P) {
    for (let i = 0; i < (stage === 3 ? 6 : 3); i++) P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, vx: (R() - 0.5) * 1.5, vy: 0.5 + R() * 1.2, vz: (R() - 0.5) * 1.5, mode: 'align', dir: [0, 1, 0], aspect: 1.6,
      life: 0.3 + R() * 0.2, size: 0.18 + stage * 0.06, size1: 0.06, color: [1.2, 1, 0.8, 1], color1: [1, 0.7, 0.5, 0], frame: FRAME.fire + ((R() * 8) | 0), ramp: RAMP.flame, heat: 1.1, heat1: 0.3 });
    P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.08, size: stage === 3 ? 0.9 : 0.5, size1: 0.2, color: [...k(stage === 3 ? COL.white : COL.flame, 0.35), 1], color1: [0, 0, 0, 0], frame: FRAME.glow });
  }
  if (stage === 3 && P) P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.2, size: 0.15, size1: 1.1, sizePow: 0.5, color: [...k(COL.gold, 0.5), 1], color1: [...k(COL.verm, 0.05), 0], frame: FRAME.thinRing ?? 62 });
  if (stage >= 2) fx.lights?.flash(p, 0xffa040, stage === 3 ? 30 : 14, stage === 3 ? 6 : 3.5, 0.12);
  if (!flesh && stage >= 2) fx.decals?.add(p, n || UP, { frame: DECAL.scorch, size: 0.25 + stage * 0.12, tint: DECAL_TINT.scorch, life: 6 });
}
/** KE_SUNMARK: a small sun disc flares where it died, the corpse catches fire, a sun-ring scorch at its feet. */
export function sunMark(g, z, p, big = false) {
  const fx = g.fx, P = fx?.particles;
  if (!fx || !P) return;
  P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.3, size: big ? 0.9 : 0.55, size1: big ? 1.3 : 0.8, color: [...k(COL.sun, 0.55), 1], color1: [...k(COL.verm, 0.05), 0], frame: FRAME.glow });
  P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.3, size: 0.2, size1: big ? 1.6 : 1.1, sizePow: 0.5, color: [...k(COL.gold, 0.45), 1], color1: [0, 0, 0, 0], frame: FRAME.thinRing ?? 62 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * 2.2, vy: 0.4 + R() * 0.6, vz: Math.sin(a) * 2.2, life: 0.4, size: 0.035, size1: 0.01, color: [...k(COL.gold, 0.7), 1], color1: [...k(COL.verm, 0.2), 0], frame: FRAME.spark, stretch: 0.03, drag: 3 });
  }
  if (z?.zfx || fx.zfx) (z.zfx || fx.zfx).status?.(z, 'emberkill', 0.5);
  if (z) fx.zfx?.status?.(z, 'burning', 1.4);
  const fy = g.world?.collision?.floorBelow?.(_c.set(p.x, p.y + 0.3, p.z), 0.2, 4);
  if (Number.isFinite(fy)) {
    fx.decals?.add(_c.set(p.x, fy + 0.02, p.z), UP, { frame: DECAL.scorch, size: big ? 1.4 : 0.9, tint: DECAL_TINT.scorch, life: 3 });
    fx.zfx?.ground?.add?.('shock', _c.set(p.x, fy + 0.04, p.z), { r: 0.2, r1: big ? 1.6 : 1.1, life: 0.35, col: k(COL.gold, 0.5), width: 0.12, ease: 0.4 });
  }
  for (let i = 0; i < 6; i++) P.spawn({ additive: true, x: p.x + (R() - 0.5) * 0.4, y: p.y, z: p.z + (R() - 0.5) * 0.4, vx: (R() - 0.5) * 0.3, vy: 0.8 + R() * 0.8, vz: (R() - 0.5) * 0.3, life: 1 + R() * 0.6, size: 0.02, size1: 0.006, color: [...COL.ember, 1], color1: [...k(COL.verm, 0.2), 0], frame: FRAME.glow, drag: 0.8 });
}
/** Flames licking off a burning target / a burning stuck arrow (world). */
export function lick(g, p, s = 1) {
  const P = g.fx?.particles;
  if (!P) return;
  P.spawn({ additive: true, x: p.x + (R() - 0.5) * 0.1 * s, y: p.y, z: p.z + (R() - 0.5) * 0.1 * s, vy: 0.6 + R() * 0.5, mode: 'align', dir: [0, 1, 0], aspect: 2, anchor: 0.3,
    life: 0.35 + R() * 0.2, size: 0.12 * s, size1: 0.04 * s, color: [1.2, 1, 0.8, 1], color1: [1, 0.7, 0.5, 0], frame: FRAME.fire + ((R() * 8) | 0), ramp: RAMP.flame, heat: 1, heat1: 0.3 });
}

/** Rubble thrown up by a falling sun (lit rock chips that bounce). */
export function rubble(g, p, n = 10, sp = 6) {
  const P = g.fx?.particles;
  if (!P) return;
  for (let i = 0; i < n; i++) {
    const a = R() * TAU, v = sp * (0.4 + R() * 0.6);
    P.spawn({ x: p.x, y: p.y + 0.2, z: p.z, vx: Math.cos(a) * v * 0.5, vy: 3 + R() * v, vz: Math.sin(a) * v * 0.5, life: 1.4 + R() * 0.6, size: 0.03 + R() * 0.05, color: [0.32, 0.29, 0.26, 1], color1: [0.3, 0.28, 0.25, 1],
      frame: FRAME.rock ?? 58, gravity: 9.8, spin: (R() - 0.5) * 20, collide: true, bounce: 0.25, lit: true });
  }
}
