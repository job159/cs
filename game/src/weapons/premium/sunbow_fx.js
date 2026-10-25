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

/**
 * Camera-space direction the loosed arrow actually takes from the head (into the crosshair line a few metres out):
 * the drawn arrow itself points up-left past the riser (the bow is canted), so release flares must not follow it.
 */
const _sd = new THREE.Vector3();
export function shotDir(h) { return _sd.set(-h.x, -h.y, -4 - h.z).normalize(); }

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

/**
 * Stage trail of a flying arrow: { push(pos), stop() }. 點射/引 thin gold, 滿 vermilion flame, 貫日 a fat white-gold
 * shaft in a flame sheath (seen nearly end-on by the shooter, so it has to be wide). 分曦 arrows: the stage trail x1.5.
 */
export function arrowTrail(g, stage, fan = false) {
  const fx = g.fx;
  if (!fx?.trail) return { push() {}, stop() {} };
  const T = [], m = fan ? 1.5 : 1;
  if (stage <= 1) T.push(fx.trail({ width: 0.03 * m, life: 0.16, color: [...k(COL.gold, 0.7), 1], color1: [...k(COL.verm, 0.25), 0], taper: 0.2, segs: 16 }));
  else if (stage === 2) {
    T.push(fx.trail({ width: 0.08 * m, life: 0.26, color: [...k(COL.flame, 0.9), 1], color1: [...k(COL.verm, 0.3), 0], taper: 0.3, segs: 20 }));
    T.push(fx.trail({ width: 0.024 * m, life: 0.14, color: [...k(COL.white, 0.5), 1], color1: [...k(COL.gold, 0.3), 0], taper: 0.2, segs: 12, profile: 'beam' }));
  } else {
    T.push(fx.trail({ width: 0.32 * m, life: 0.36, color: [...k(COL.flame, 0.6), 1], color1: [...k(COL.verm, 0.15), 0], taper: 0.35, segs: 26 }));
    T.push(fx.trail({ width: 0.09 * m, life: 0.28, color: [...k(COL.white, 0.9), 1], color1: [...k(COL.gold, 0.4), 0], taper: 0.25, segs: 24, profile: 'beam' }));
  }
  return { push(p) { for (const t of T) t.push(p); }, stop() { for (const t of T) t.stop(); } };
}
/**
 * 貫日 aftermath: a line burnt through the horde from the bow to where the arrow stopped (flame sheath + white core,
 * 0.7 s, embers dropping off it and a few flame licks along the way).
 */
export function burnLine(g, a, b) {
  const fx = g.fx, P = fx?.particles, L = a.distanceTo(b);
  if (!fx?.beam || L < 0.5) return;
  fx.beam(a, b, { core: k(COL.white, 0.6), glow: k(COL.flame, 0.35), wCore: 0.08, wGlow: 0.34, life: 0.7, shrink: 0.35, wStart: 0.3, ramp: 2.5 });
  fx.beam(a, b, { core: k(COL.gold, 0.3), glow: k(COL.verm, 0.12), wCore: 0.03, wGlow: 0.75, life: 0.5, shrink: 0.2, wStart: 0.2, ramp: 3 });
  if (!P) return;
  const d = _c.subVectors(b, a).multiplyScalar(1 / L), n = Math.min(60, Math.round(L * 2.2));
  for (let i = 0; i < n; i++) {
    const u = 0.06 + R() * 0.94, x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u, z = a.z + (b.z - a.z) * u;
    P.spawn({ additive: true, x, y, z, vx: (R() - 0.5) * 0.4 + d.x * 0.6, vy: -0.2 - R() * 0.6, vz: (R() - 0.5) * 0.4 + d.z * 0.6, delay: R() * 0.45, life: 0.5 + R() * 0.6,
      size: 0.022, size1: 0.006, color: [...COL.ember, 1], color1: [...k(COL.verm, 0.3), 0], frame: FRAME.spark, stretch: 0.025, gravity: 4, drag: 1.2 });
    if (i % 4 === 0) P.spawn({ additive: true, x, y: y - 0.05, z, vy: 0.5 + R() * 0.4, delay: R() * 0.25, mode: 'align', dir: [0, 1, 0], aspect: 1.8, anchor: 0.3,
      life: 0.35 + R() * 0.25, size: 0.16, size1: 0.05, color: [1.2, 1, 0.8, 1], color1: [1, 0.7, 0.5, 0], frame: FRAME.fire + ((R() * 8) | 0), ramp: RAMP.flame, heat: 1.1, heat1: 0.3 });
  }
}

// pierce count tags ("貫 ×N"), one canvas per count
const _tagTex = new Map();
function tagTex(n) {
  if (_tagTex.has(n) || typeof document === 'undefined') return _tagTex.get(n) || null;
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
  x.font = '900 84px "Noto Serif TC", "Microsoft JhengHei", serif';
  const gr = x.createLinearGradient(0, 24, 0, 104); gr.addColorStop(0, '#fff6d0'); gr.addColorStop(0.5, '#ffc84a'); gr.addColorStop(1, '#ff7a2f');
  x.lineWidth = 12; x.strokeStyle = 'rgba(90,10,12,0.95)'; x.strokeText(`貫×${n}`, 128, 66);
  x.fillStyle = gr; x.fillText(`貫×${n}`, 128, 66);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  _tagTex.set(n, t);
  return t;
}
/** Builds the "貫 ×3..9" tag textures ahead of the first big pierce (prewarm). */
export function warmTags() { for (let n = 3; n <= 9; n++) tagTex(n); }
/**
 * One extra beat for a 貫日 arrow that killed 3+: a gold sun flare and a "貫 ×N" tag rising off the last victim.
 * Returns an updater for g.systems.
 */
export function pierceTag(g, p, n) {
  const fx = g.fx, P = fx?.particles, tex = tagTex(n);
  if (P) {
    P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.35, size: 0.8, size1: 2.2, sizePow: 0.5, color: [...k(COL.gold, 0.45), 1], color1: [...k(COL.verm, 0.05), 0], frame: FRAME.thinRing });
    P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.16, size: 1.6, size1: 0.6, color: [...k(COL.sun, 0.5), 1], color1: [0, 0, 0, 0], frame: FRAME.star4, rot: R() * 6 });
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * 4, vy: 1 + R() * 2.5, vz: Math.sin(a) * 4, life: 0.5, size: 0.04, size1: 0.01, color: [...k(COL.gold, 0.8), 1], color1: [...k(COL.verm, 0.2), 0], frame: FRAME.spark, stretch: 0.04, drag: 2.5, gravity: 3 }); }
  }
  fx?.lights?.flash?.(p, 0xffc060, 40, 7, 0.2);
  if (!tex || !g.scene) return null;
  const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false });
  const s = new THREE.Sprite(m);
  s.renderOrder = 60; s.position.copy(p).add(_a.set(0, 0.7, 0));
  g.scene.add(s);
  let t = 0;
  const y0 = s.position.y;
  return { update(dt) {
    t += dt;
    const pop = t < 0.1 ? 0.6 + 4 * t : 1 + 0.15 * Math.max(0, 1 - (t - 0.1) / 0.15);
    const d = Math.max(0.6, g.camera.position.distanceTo(s.position)) * 0.085;   // about the same size on screen at any range
    s.scale.set(d * 2 * pop, d * pop, 1);
    s.position.y = y0 + t * 0.5;
    m.opacity = t < 0.75 ? 1 : Math.max(0, 1 - (t - 0.75) / 0.35);
    if (t >= 1.1) { s.removeFromParent(); m.dispose(); return false; }
    return true;
  } };
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
 * The drawn head in first person, every frame of the draw (u = string travel 0..1): the head gathers heat from the
 * first pull, 引 a gold glow, 滿 a molten vermilion ball with flame licks and embers, 貫日 a white-hot sun: hot glow,
 * a white disc, a flickering corona ring and a slow star. The head sits left-below the crosshair (outside the centre
 * 20 %, §1.14): the glow sizes keep it there.
 */
export function headFire(g, stage, t, u = 1) {
  const vm = g.vm, P = g.fx?.particles, h = vm?.socketCam?.('head', _a);
  if (!P || !h) return;
  gunAxes(vm);
  const hot = stage === 3, uu = Math.min(1, Math.max(0, u));
  const sz = [0.035, 0.07, 0.12, 0.19][stage] * (0.7 + 0.3 * uu), al = [0.12 * uu, 0.22, 0.4, 0.55][stage];
  const c = hot ? [COL.white[0] * 0.6 + COL.gold[0] * 0.4, COL.white[1] * 0.6 + COL.gold[1] * 0.4, COL.white[2] * 0.5 + COL.gold[2] * 0.5] : stage === 2 ? COL.flame : COL.gold;
  if (al > 0.01) P.spawn({ additive: true, vm: true, x: h.x, y: h.y, z: h.z, life: 0.05, size: sz, size1: sz * 0.92, color: [...k(c, al), 1], color1: [0, 0, 0, 0], frame: FRAME.glow });
  if (stage >= 2) P.spawn({ additive: true, vm: true, x: h.x, y: h.y, z: h.z, life: 0.05, size: hot ? 0.06 : 0.032, size1: hot ? 0.055 : 0.028, color: [...k(hot ? COL.white : COL.sun, hot ? 1.1 : 0.7), 1], color1: [0, 0, 0, 0], frame: FRAME.glow });
  if (hot) {
    // corona: a ring 8-12 cm flickering round the sun, and a slow four-point star
    if (R() < 0.6) P.spawn({ additive: true, vm: true, x: h.x, y: h.y, z: h.z, life: 0.07, size: 0.08 + R() * 0.03, size1: 0.1 + R() * 0.03, color: [...k(COL.gold, 0.35), 1], color1: [...k(COL.verm, 0.04), 0], frame: FRAME.thinRing, rot: R() * 6 });
    P.spawn({ additive: true, vm: true, x: h.x, y: h.y, z: h.z, life: 0.05, size: 0.17, size1: 0.16, color: [...k(COL.gold, 0.16), 1], color1: [0, 0, 0, 0], frame: FRAME.star4, rot: t * 0.8 });
  }
  if (stage >= 2 && R() < 0.85) {
    const lift = 0.05 + R() * 0.06;
    P.spawn({ additive: true, vm: true, x: h.x + (R() - 0.5) * 0.015, y: h.y, z: h.z + (R() - 0.5) * 0.015, vx: _u.x * lift - _f.x * 0.02, vy: _u.y * lift, vz: _u.z * lift - _f.z * 0.02, mode: 'align', dir: [_u.x, _u.y, _u.z],
      aspect: 2.2, anchor: 0.3, life: 0.18 + R() * 0.12, size: hot ? 0.03 : 0.024, size1: 0.006, color: [1.3, 1.1, 0.9, 1], color1: [1, 0.8, 0.6, 0], frame: FRAME.fire + ((R() * 8) | 0), ramp: RAMP.flame, heat: hot ? 1.25 : 1, heat1: 0.4 });
  }
  if (stage >= 1 && R() < [0, 0.2, 0.45, 0.7][stage]) P.spawn({ additive: true, vm: true, x: h.x, y: h.y, z: h.z, vx: (R() - 0.5) * 0.1 + _u.x * 0.07, vy: _u.y * 0.09 + R() * 0.05, vz: (R() - 0.5) * 0.1, life: 0.4 + R() * 0.35, size: 0.0035, color: [...COL.ember, 1], color1: [...k(COL.verm, 0.3), 0], frame: FRAME.glow, gravity: -0.05, drag: 1 });
}
/**
 * The arrow is the energy object: a gold-cored beam along the drawn shaft (thin at the nock, full at the head) that
 * brightens 0 -> 3 with the pull, its edge vermilion, white-hot at 貫日. hold = a holder object ({ rib }); call every
 * frame while drawing, dropRibbon() when the draw ends.
 */
export function drawRibbon(g, hold, u, stage) {
  const vm = g.vm, fx = g.fx, n = vm?.socketCam?.('nock', _a), h = vm?.socketCam?.('head', _b);
  if (!fx?.beam || !n || !h) return;
  const from = _c.lerpVectors(n, h, 0.22);   // clear of the fletching and the draw hand
  const kk = 3 * Math.pow(Math.min(1, Math.max(0, u)), 1.4) * (stage === 3 ? 1.2 : 1);
  let b = hold.rib;
  if (!b || b.age >= b.life) b = hold.rib = fx.beam(from, h, { vm: true, life: 30, shrink: 1, wCore: 0.006, wGlow: 0.03, wStart: 0.25, ramp: 0.3, scroll: 1.4 });
  b.age = 0; b.set(from, h);
  const hot = stage === 3 ? 0.55 : stage === 2 ? 0.2 : 0;
  b.core = [(COL.gold[0] * (1 - hot) + COL.white[0] * hot) * 0.22 * kk, (COL.gold[1] * (1 - hot) + COL.white[1] * hot) * 0.22 * kk, (COL.gold[2] * (1 - hot) + COL.white[2] * hot) * 0.22 * kk];
  b.glow = k(COL.verm, 0.1 * kk);
  b.wGlow = 0.026 + 0.03 * Math.min(1, u) + (stage === 3 ? 0.012 : 0);
  b.wCore = b.wGlow * (stage === 3 ? 0.36 : 0.26);
}
export function dropRibbon(hold) { if (hold.rib) { hold.rib.stop(); hold.rib = null; } }
/**
 * Gathering: motes drawn off the lit sun cores (and the 日珠) into the head while drawing (rate rises with the stage).
 * lit = how many cores are lit (the lowest go dark first: core i lit when i > 9 - lit).
 */
export function gatherMotes(g, stage, lit, dt) {
  const vm = g.vm, P = g.fx?.particles, h = vm?.socketCam?.('head', _a);
  if (!P || !h) return;
  const rate = [14, 26, 40, 60][stage];
  let n = rate * dt + R();
  for (; n >= 1; n--) {
    const pick = R() < 0.25 ? 'sun' : 'ray' + (9 - Math.floor(R() * Math.max(1, lit)));
    const s = vm.socketCam(pick, _b);
    if (!s) continue;
    const L = 0.22 + R() * 0.16, c = stage === 3 ? COL.white : COL.gold;
    // a slight arc: start off the socket sideways, aim at the head
    const ox = (R() - 0.5) * 0.02, oy = (R() - 0.5) * 0.02, oz = (R() - 0.5) * 0.02;
    P.spawn({ additive: true, vm: true, x: s.x + ox, y: s.y + oy, z: s.z + oz, vx: (h.x - s.x - ox) / L, vy: (h.y - s.y - oy) / L, vz: (h.z - s.z - oz) / L, life: L,
      size: 0.007, size1: 0.0035, color: [...k(c, 0.9), 1], color1: [...k(COL.verm, 0.4), 0.6], frame: FRAME.spark, stretch: 0.02 });
  }
}
/** Stage-up cue on the head: a ring snapping out round the arrow axis and a spark puff (stage 1..3). */
export function stagePulse(g, stage) {
  const vm = g.vm, P = g.fx?.particles, h = vm?.socketCam?.('head', _a);
  if (!P || !h) return;
  gunAxes(vm);
  const c = stage === 3 ? COL.white : stage === 2 ? COL.flame : COL.gold;
  P.spawn({ additive: true, vm: true, x: h.x, y: h.y, z: h.z, mode: 'flat', dir: [_f.x, _f.y, _f.z], life: 0.2, size: 0.015, size1: 0.1 + stage * 0.04, sizePow: 0.5, color: [...k(c, 0.35), 1], color1: [...k(c, 0.05), 0], frame: FRAME.thinRing ?? 62 });
  P.spawn({ additive: true, vm: true, x: h.x, y: h.y, z: h.z, life: 0.1, size: 0.05 + stage * 0.03, size1: 0.02, color: [...k(c, 0.35), 1], color1: [0, 0, 0, 0], frame: FRAME.glow });
  for (let i = 0; i < 6 + stage * 4; i++) {
    const a = R() * TAU, sp = 0.18 + R() * 0.25;
    P.spawn({ additive: true, vm: true, x: h.x, y: h.y, z: h.z, vx: (_u.x * Math.cos(a) + _r.x * Math.sin(a)) * sp, vy: (_u.y * Math.cos(a) + _r.y * Math.sin(a)) * sp, vz: (_u.z * Math.cos(a) + _r.z * Math.sin(a)) * sp,
      life: 0.2, size: 0.0035, size1: 0.001, color: [...k(c, 0.55), 1], color1: [0, 0, 0, 0], frame: FRAME.spark, stretch: 0.012, drag: 4 });
  }
}
/**
 * Release in first person: string slap sparks at the nock, a heat ring off the riser (滿 / 貫日), gold dust; 貫日 also
 * a white-gold flare shooting forward off the head (the bow's "muzzle flash") and a wide heat ring.
 */
export function releaseFx(g, stage) {
  const vm = g.vm, P = g.fx?.particles, h = vm?.socketCam?.('head', _a), n = vm?.socketCam?.('nock', _b);
  if (!P || !h) return;
  gunAxes(vm);
  const sd = shotDir(h);
  if (stage >= 2) {
    P.spawn({ additive: true, vm: true, x: h.x + sd.x * 0.04, y: h.y + sd.y * 0.04, z: h.z + sd.z * 0.04, mode: 'flat', dir: [sd.x, sd.y, sd.z], life: stage === 3 ? 0.24 : 0.15,
      size: 0.03, size1: stage === 3 ? 0.8 : 0.3, sizePow: 0.45, color: [...k(stage === 3 ? COL.gold : COL.flame, 0.4), 1], color1: [...k(COL.verm, 0.05), 0], frame: FRAME.thinRing ?? 62 });
    P.spawn({ additive: true, vm: true, x: h.x, y: h.y, z: h.z, life: 0.07, size: stage === 3 ? 0.16 : 0.09, size1: stage === 3 ? 0.22 : 0.12, color: [...k(COL.white, stage === 3 ? 0.4 : 0.15), 1], color1: [0, 0, 0, 0], frame: FRAME.glow });
  }
  if (stage === 3 && g.fx?.beam) {
    const e = _c.copy(h).addScaledVector(sd, 1.0);
    g.fx.beam(h, e, { vm: true, core: k(COL.white, 0.9), glow: k(COL.flame, 0.5), wCore: 0.03, wGlow: 0.12, life: 0.08, shrink: 0.3, wStart: 0.4, ramp: 0.2 });
    P.spawn({ additive: true, vm: true, x: h.x, y: h.y, z: h.z, mode: 'flat', dir: [sd.x, sd.y, sd.z], life: 0.12, size: 0.05, size1: 0.45, sizePow: 0.4, color: [...k(COL.white, 0.25), 1], color1: [...k(COL.gold, 0.02), 0], frame: FRAME.thinRing });
    // a second, wider flame-coloured flare along the same line (camera-facing ribbons: the align flipbook flames read
    // backwards along a line into the screen)
    g.fx.beam(h.clone().addScaledVector(sd, 0.03), _c.copy(h).addScaledVector(sd, 0.6), { vm: true, core: k(COL.gold, 0.6), glow: k(COL.flame, 0.45), wCore: 0.02, wGlow: 0.2, life: 0.1, shrink: 0.2, wStart: 0.5, ramp: 0.15 });
  }
  for (let i = 0; i < 6 + stage * 4; i++) {
    const sp = 0.4 + R() * 0.8;
    P.spawn({ additive: true, vm: true, x: h.x, y: h.y, z: h.z, vx: sd.x * sp + (R() - 0.5) * 0.3, vy: sd.y * sp + (R() - 0.3) * 0.3, vz: sd.z * sp + (R() - 0.5) * 0.3,
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

/** 分曦 in first person: a flat gold fan (±deg about the camera's up, 1.5 m) opening off the head for 0.12 s. */
export function fanFlare(g, deg) {
  const vm = g.vm, fx = g.fx, h = vm?.socketCam?.('head', _a);
  if (!fx?.trail || !h) return;
  gunAxes(vm);
  const t = fx.trail({ vm: true, life: 0.13, color: [...k(COL.gold, 0.55), 1], color1: [...k(COL.verm, 0.2), 0], profile: 'slash', segs: 20 });
  const n = 14, L = 1.5, ca = Math.cos, sa = Math.sin, sd = shotDir(h);
  for (let i = 0; i <= n; i++) {
    const a = (-deg + (2 * deg * i) / n) * Math.PI / 180;
    // the shot direction turned about the camera up (0, 1, 0): the arrows fan out level, as the spread does
    const fx2 = sd.x * ca(a) + sd.z * sa(a), fz2 = -sd.x * sa(a) + sd.z * ca(a);
    t.push(_b.set(h.x + fx2 * 0.03, h.y + sd.y * 0.03, h.z + fz2 * 0.03), _c.set(h.x + fx2 * L, h.y + sd.y * L, h.z + fz2 * L));
  }
  t.stop();
  const P = fx.particles;
  if (!P) return;
  P.spawn({ additive: true, vm: true, x: h.x, y: h.y, z: h.z, life: 0.08, size: 0.1, size1: 0.16, color: [...k(COL.gold, 0.4), 1], color1: [0, 0, 0, 0], frame: FRAME.glow });
  // the flat fan is seen almost edge-on from the eye: camera-facing light too -- five beams along the five arrows'
  // lines (they diverge on screen exactly as the arrows do), starting just in front of the riser so it cannot hide them
  const o = _b.copy(h).addScaledVector(sd, 0.06);
  for (let i = 0; i < 5; i++) {
    const a = (-deg + (2 * deg * i) / 4) * Math.PI / 180, dx = sd.x * ca(a) + sd.z * sa(a), dz = -sd.x * sa(a) + sd.z * ca(a);
    fx.beam?.(o, _c.set(o.x + dx * 0.9, o.y + sd.y * 0.9, o.z + dz * 0.9), { vm: true, core: k(i === 2 ? COL.white : COL.gold, 0.7), glow: k(COL.flame, 0.3), wCore: 0.008, wGlow: 0.035, life: 0.13, shrink: 0.3, wStart: 0.3, ramp: 0.3 });
  }
  P.spawn({ additive: true, vm: true, x: o.x, y: o.y, z: o.z, life: 0.09, size: 0.12, size1: 0.2, color: [...k(COL.gold, 0.3), 1], color1: [0, 0, 0, 0], frame: FRAME.glow });
}

/**
 * A sun striking the street (落九陽): a white-gold flash and star, an expanding corona ring on the ground, radial
 * flame petals, a gold ember fountain, a short fire plume (no billowing smoke), radial cracks and a scorch.
 * r = blast radius; big = the ninth.
 */
export function sunImpact(g, h, r, big = false, glare = 1) {
  const fx = g.fx, P = fx?.particles, Z = fx?.zfx;
  if (!P) return;
  const s = big ? 1.5 : 1, gk = glare;
  P.spawn({ additive: true, x: h.x, y: h.y + 0.8 * s, z: h.z, life: 0.1, size: r * 0.7, size1: r * 1.0, color: [...k(COL.white, 0.32 * gk), 1], color1: [...k(COL.flame, 0.05), 0], frame: FRAME.glow });
  P.spawn({ additive: true, x: h.x, y: h.y + 0.6 * s, z: h.z, life: 0.08, size: r * 0.9, size1: r * 0.5, color: [...k(COL.sun, 0.45 * gk), 1], color1: [0, 0, 0, 0], frame: FRAME.star4, rot: R() * 6 });
  P.spawn({ additive: true, x: h.x, y: h.y + 0.6 * s, z: h.z, life: 0.22, size: 0.4, size1: r * 1.5, sizePow: 0.45, color: [...k(COL.gold, 0.4 * gk), 1], color1: [...k(COL.verm, 0.05), 0], frame: FRAME.thinRing });
  if (Z?.ground) {
    Z.ground.add('shock', _a.set(h.x, h.y + 0.04, h.z), { r: 0.4, r1: r * 1.25, life: 0.42, col: k(COL.gold, 0.55), width: big ? 0.9 : 0.5, ease: 0.45 });
    Z.ground.add('glow', _a.set(h.x, h.y + 0.04, h.z), { r: r * 0.7, life: big ? 2.4 : 1.6, col: k(COL.flame, 0.22), fadeIn: 0.01, fadeOut: big ? 1.6 : 1.1 });
    Z.ground.add('crack', _a.set(h.x, h.y + 0.02, h.z), { r: Math.min(6.5, r * (big ? 1.0 : 0.6)), life: 8, col: [0.04, 0.03, 0.025], alpha: 0.9, fadeIn: 0.02, fadeOut: 2.5 });
  }
  // flame petals racing out along the ground, a plume rising
  const np = big ? 18 : 11;
  for (let i = 0; i < np; i++) {
    const a = (i / np) * TAU + R() * 0.3, c = Math.cos(a), sn = Math.sin(a), sp = r * (1.4 + R() * 0.6);
    P.spawn({ additive: true, x: h.x + c * 0.3, y: h.y + 0.15, z: h.z + sn * 0.3, vx: c * sp, vy: 0.3, vz: sn * sp, mode: 'align', dir: [c * 0.6, 1, sn * 0.6], aspect: 2.2, anchor: 0.2,
      life: 0.4 + R() * 0.15, size: 0.7 * s, size1: 0.3 * s, color: [1.3, 1.1, 0.9, 1], color1: [1, 0.7, 0.5, 0], frame: FRAME.fire + ((R() * 8) | 0), ramp: RAMP.flame, heat: 1.25, heat1: 0.35, drag: 2.6 });
  }
  for (let i = 0; i < (big ? 10 : 6); i++) P.spawn({ additive: true, x: h.x + (R() - 0.5) * 0.8, y: h.y + 0.2, z: h.z + (R() - 0.5) * 0.8, vx: (R() - 0.5) * 1.2, vy: 3 + R() * 3 * s, vz: (R() - 0.5) * 1.2, mode: 'align', dir: [0, 1, 0], aspect: 1.8, anchor: 0.3,
    life: 0.5 + R() * 0.3, size: (1.0 + R() * 0.6) * s, size1: 0.4 * s, color: [1.2, 1, 0.85, 1], color1: [1, 0.7, 0.5, 0], frame: FRAME.fire + ((R() * 8) | 0), ramp: RAMP.flame, heat: 1.15, heat1: 0.3, drag: 1.4 });
  // gold ember fountain
  for (let i = 0; i < (big ? 46 : 24); i++) {
    const a = R() * TAU, hs = R() * 3.2 * s;
    P.spawn({ additive: true, x: h.x, y: h.y + 0.3, z: h.z, vx: Math.cos(a) * hs, vy: 5 + R() * 7 * s, vz: Math.sin(a) * hs, life: 0.9 + R() * 0.9, size: 0.035, size1: 0.01,
      color: [...k(COL.gold, 0.8), 1], color1: [...k(COL.verm, 0.25), 0], frame: FRAME.spark, stretch: 0.035, gravity: 9.8, drag: 0.5, collide: true, bounce: 0.2 });
  }
  // a little dark soot, low (no brown mushroom)
  for (let i = 0; i < (big ? 5 : 3); i++) P.spawn({ x: h.x + (R() - 0.5) * r * 0.6, y: h.y + 0.4, z: h.z + (R() - 0.5) * r * 0.6, vx: (R() - 0.5) * 0.8, vy: 0.8 + R() * 0.6, vz: (R() - 0.5) * 0.8, life: 1.6 + R() * 0.8,
    size: 0.8 * s, size1: 2.2 * s, sizePow: 0.5, color: [0.16, 0.13, 0.11, 0.42], color1: [0.22, 0.2, 0.18, 0], frame: FRAME.puff + ((R() * 4) | 0), lit: true, drag: 1.2, soft: 0.3 });
  fx.decals?.add(_a.set(h.x, h.y + 0.03, h.z), UP, { frame: DECAL.scorch, size: r * (big ? 1.1 : 0.85), tint: DECAL_TINT.scorch, life: 9 });
  fx.lights?.flash?.(_a.set(h.x, h.y + 1, h.z), 0xffb050, (big ? 70 : 40) * gk, r * 2.2, 0.18);
}
/** The ninth sun's 火浪: a ring of fire racing out along the ground to R (0.55 s), with a ground shock and glow. */
export function fireWave(g, c, Rr) {
  const fx = g.fx, P = fx?.particles, Z = fx?.zfx;
  if (!P) return;
  const n = 44, T = 0.55;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + R() * 0.1, cs = Math.cos(a), sn = Math.sin(a), v = (Rr - 0.8) / T * (0.92 + R() * 0.12);
    P.spawn({ additive: true, x: c.x + cs * 0.8, y: c.y + 0.1, z: c.z + sn * 0.8, vx: cs * v, vz: sn * v, mode: 'align', dir: [0, 1, 0], aspect: 1.9, anchor: 0.15,
      life: T + R() * 0.15, size: 0.9, size1: 1.7, sizePow: 0.6, color: [1.3, 1.1, 0.9, 1], color1: [1, 0.65, 0.45, 0], frame: FRAME.fire + ((R() * 8) | 0), ramp: RAMP.flame, heat: 1.3, heat1: 0.35 });
    if (i % 2) P.spawn({ additive: true, x: c.x + cs * 0.8, y: c.y + 0.2, z: c.z + sn * 0.8, vx: cs * v, vy: 1.5 + R() * 2, vz: sn * v, life: T + 0.3, size: 0.04, size1: 0.01,
      color: [...k(COL.gold, 0.8), 1], color1: [...k(COL.verm, 0.2), 0], frame: FRAME.spark, stretch: 0.04, gravity: 6 });
  }
  if (Z?.ground) {
    Z.ground.add('shock', _a.set(c.x, c.y + 0.05, c.z), { r: 0.8, r1: Rr, life: T, col: k(COL.flame, 0.6), width: 1.2, ease: 0.15 });
    Z.ground.add('glow', _a.set(c.x, c.y + 0.04, c.z), { r: Rr * 0.85, life: 2.2, col: k(COL.verm, 0.2), fadeIn: 0.2, fadeOut: 1.5 });
  }
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
