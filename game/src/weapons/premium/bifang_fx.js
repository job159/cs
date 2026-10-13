// 畢方．焚翼 / 鬼車．晦翼 — effect primitives (docs/PREMIUM_WEAPONS.md M03; mechanics + timeline in bifang.js).
// Built only from the FX facade (particles, beam, tracers, decals, lights) and the premium kit (motes, sigils,
// summons): nothing here owns GPU objects except the two spirit geometries (built once) and the burn-stack pips (DOM).
//   crestFan(g, L)            冠羽扇 muzzle: 1-frame white core, 5 flame feathers fanned ±40° up from the beak (hollow
//                             centre), sparks off the tips, sometimes a cyan tongue running back down the feather vein
//   featherTracer / plume     pellets as short gold feather streaks; a hit sends up one small fire feather (≤ 12 alive)
//   killPlume / soulWisp      KE_PLUME (3 rising fire plumes + a feather-shaped scorch) / KE_SOUL (ghost-fire wisp to the gun)
//   fallingFeather            羽落: a burning feather lance from the sky, a pillar of feather flame where it lands
//   FirePath                  the dive's fire trail (flame nodes every 2 m, scorch, one keyed light)
//   craneGeo / nineHeadGeo    GHOST bodies: the one-legged crane 畢方 and the nine-headed 鬼車 (≤ 3k tris, flap weights)
//   BurnPips                  灼羽 stacks: small feather icons over burning targets (DOM, ≤ 12)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FRAME, RAMP, DECAL } from '../../fx/fx.js';

const R = Math.random;
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3(), _r = new THREE.Vector3(), _d = new THREE.Vector3();

// per-look colours (HDR linear). gold = white-hot root, flame = vermilion tip, teal = 青 accent
export const LOOKS = {
  bifang: {
    id: 'bifang', root: [5.2, 4.4, 2.6], flame: [6, 1.5, 0.3], teal: [0.4, 3.6, 3.0], ember: [6, 2.4, 0.6], mote: [4.2, 2.6, 0.9], mote2: [6, 5, 3],
    beamCore: [6, 5.4, 4], beamGlow: [2.6, 1.3, 0.3], ring: [4, 2.2, 0.6], ramp: RAMP.gold, flameRamp: RAMP.flame, sigil: 'flame',
    ghost: { base: [0.93, 0.9, 0.85], core: [0.35, 2.6, 2.2], rim: [3.4, 1.0, 0.28], edge: [5, 2.4, 0.6], opacity: 0.5 },
    wing: { core: [2.2, 1.9, 1.3], tip: [2.6, 0.7, 0.15], enamel: [[0.15, 1.6, 1.5], [2.2, 0.32, 0.12], [2.6, 2.1, 1.3]], gold: [2.6, 1.7, 0.55] },
    xh: '#ffc74a', light: 0xffb050, pitch: 1, echo: false, moteKind: 'glowfeather', scorch: 0,
  },
  guiche: {
    id: 'guiche', root: [3.6, 2.2, 6], flame: [2.6, 0.5, 5.2], teal: [0.4, 4.4, 4], ember: [3, 0.8, 5.4], mote: [2.4, 1.0, 4.4], mote2: [3, 4.6, 5],
    beamCore: [4.4, 3.4, 6.4], beamGlow: [0.5, 2.4, 2.4], ring: [2, 0.8, 4], ramp: RAMP.purple, flameRamp: RAMP.purple, sigil: 'mountainSea',
    ghost: { base: [0.08, 0.07, 0.1], core: [0.3, 2.4, 2.2], rim: [2.0, 0.6, 3.8], edge: [2.4, 1.0, 5], opacity: 0.55, dark: true },
    wing: { core: [1.4, 0.9, 2.4], tip: [0.3, 2.2, 2.0], enamel: [[1.2, 0.3, 2.2], [0.15, 1.6, 1.6], [1.8, 1.2, 2.8]], gold: [1.6, 1.7, 1.9] },
    xh: '#c58bff', light: 0xb070ff, pitch: 0.794, echo: true, moteKind: 'glowfeather', scorch: 0,
  },
};
export const lookOf = (def) => LOOKS[def?.special?.look || def?.premium?.look] || LOOKS.bifang;

/** Sound with the twin's treatment (§1.12: the same samples -4 semitones + an echo); `fb` when the cue is missing. */
export function sfx(g, L, name, fb, o = {}) {
  const a = g?.audio;
  if (!a) return null;
  const n = !a.has || a.has(name) ? name : fb;
  if (!n) return null;
  const pitch = (o.pitch ?? 1) * (L?.pitch ?? 1);
  const v = a.play(n, { ...o, pitch });
  if (L?.echo) a.play(n, { ...o, pitch, volume: (o.volume ?? 1) * 0.34, delay: (o.delay || 0) + 0.17 });
  return v;
}

// ------------------------------------------------------------------------------------- first person: 冠羽扇
/** Gun axes in camera space (viewmodel-layer particles live there). */
function gunAxes(vm) {
  const q = vm.gunRoot.quaternion;
  _f.set(0, 0, -1).applyQuaternion(q); _u.set(0, 1, 0).applyQuaternion(q); _r.set(1, 0, 0).applyQuaternion(q);
}

/**
 * 冠羽扇 (crest fan): a 1-frame white core at the beak, 5 flame feathers (0.12 x 0.03 m) fanned ±40° up from the beak
 * around the barrel axis (centre left hollow), scale 0.6 -> 1.2 and alpha 1 -> 0 over 200 ms, 2 sparks off each tip;
 * 30 % of shots a cyan tongue runs back down the right feather vein.
 */
export function crestFan(g, L, shot = 0) {
  const vm = g.vm, P = g.fx?.particles;
  const c = vm?.socketCam?.('crest', _a), b = vm?.socketCam?.('beak', _b);
  if (!P || !c || !b) return;
  gunAxes(vm);
  // white core in the gape (one frame)
  P.spawn({ additive: true, vm: true, x: b.x, y: b.y, z: b.z, life: 0.03, size: 0.05, size1: 0.07, color: [8, 7.4, 6, 1], color1: [3, 1.8, 0.6, 0], frame: FRAME.glow });
  const rot = (shot % 2) * 0.09;
  for (let i = 0; i < 5; i++) {
    const th = (-40 + i * 20) * Math.PI / 180 + rot + (R() - 0.5) * 0.06;
    _d.copy(_u).multiplyScalar(Math.cos(th)).addScaledVector(_r, Math.sin(th)).addScaledVector(_f, 0.18).normalize();
    // feather roots sit on a small ring round the crest point: the centre stays clear
    const x = c.x + _d.x * 0.012, y = c.y + _d.y * 0.012, z = c.z + _d.z * 0.012;
    const mid = i === 2 ? 1.12 : 1;
    P.spawn({ additive: true, vm: true, x, y, z, mode: 'align', dir: [_d.x, _d.y, _d.z], aspect: 4.2, anchor: 0.5, mirror: i < 2,
      life: 0.2, size: 0.03 * 0.6 * mid, size1: 0.03 * 1.2 * mid, sizePow: 0.6, color: [1.2, 1.1, 1, 1], color1: [1, 0.9, 0.8, 0], colorPow: 1.3,
      frame: FRAME.cone + 1, ramp: L.flameRamp, heat: 1.15, heat1: 0.55, inertia: 0.3 });
    // a soft hot glow along the same feather (reads as a lit plume, not a thin line)
    P.spawn({ additive: true, vm: true, x, y, z, mode: 'align', dir: [_d.x, _d.y, _d.z], aspect: 3.2, anchor: 0.5, life: 0.16, size: 0.04 * mid, size1: 0.055 * mid,
      color: [L.flame[0] * 0.45, L.flame[1] * 0.45, L.flame[2] * 0.45, 1], color1: [L.flame[0] * 0.1, L.flame[1] * 0.1, L.flame[2] * 0.1, 0], frame: FRAME.glow, inertia: 0.3 });
    // two sparks flung off the tip
    const tip = 0.13 * mid;
    for (let k = 0; k < 2; k++) {
      const sp = 0.7 + R() * 0.6;
      P.spawn({ additive: true, vm: true, x: x + _d.x * tip, y: y + _d.y * tip, z: z + _d.z * tip,
        vx: (_d.x + (R() - 0.5) * 0.6) * sp, vy: (_d.y + (R() - 0.5) * 0.6) * sp + 0.1, vz: (_d.z + (R() - 0.5) * 0.6) * sp,
        life: 0.22 + R() * 0.12, size: 0.0025, stretch: 0.012, color: [...L.ember, 1], color1: [L.ember[0] * 0.3, L.ember[1] * 0.2, L.ember[2] * 0.2, 0], frame: FRAME.spark, gravity: 0.6, drag: 3, inertia: 0.4 });
    }
  }
  if (R() < 0.3) veinTongue(g, L, 'r', L.teal, 0.12);
}

/** A tongue of light running along a feather vein (vein1 -> vein0 = backwards, or forwards), viewmodel layer. */
export function veinTongue(g, L, side = 'r', col = L.teal, life = 0.14, forward = false) {
  const vm = g.vm, P = g.fx?.particles;
  const a = vm?.socketCam?.('vein1_' + side, _a), b = vm?.socketCam?.('vein0_' + side, _b);
  if (!P || !a || !b) return;
  if (forward) { const t = _c.copy(a); a.copy(b); b.copy(t); }
  _d.subVectors(b, a);
  const len = _d.length();
  for (let k = 0; k < 4; k++) {
    const sp = len / life * (0.85 + k * 0.08);
    P.spawn({ additive: true, vm: true, x: a.x, y: a.y, z: a.z, vx: _d.x / len * sp, vy: _d.y / len * sp, vz: _d.z / len * sp, life: life * (1 - k * 0.12), delay: k * 0.012,
      size: 0.0028, stretch: 0.02, color: [...col, 1], color1: [col[0] * 0.4, col[1] * 0.4, col[2] * 0.4, 0], frame: FRAME.spark, inertia: 0.15 });
  }
}

/** Idle 流動粒子: an ember drifting along the right feather vein, rear to front, dying before the muzzle. */
export function veinEmber(g, L) {
  const vm = g.vm, P = g.fx?.particles;
  const a = vm?.socketCam?.('vein0_r', _a), b = vm?.socketCam?.('vein1_r', _b);
  if (!P || !a || !b) return;
  _d.subVectors(b, a);
  const life = 1.6 + R() * 0.8, u0 = R() * 0.3;
  const x = a.x + _d.x * u0, y = a.y + _d.y * u0, z = a.z + _d.z * u0;
  const k = (1 - u0) / life * 1.15;
  P.spawn({ additive: true, vm: true, x, y, z, vx: _d.x * k, vy: _d.y * k + 0.004, vz: _d.z * k, life, size: 0.0026, size1: 0.0012,
    color: [L.ember[0] * 0.55, L.ember[1] * 0.55, L.ember[2] * 0.55, 1], color1: [L.ember[0] * 0.2, L.ember[1] * 0.1, L.ember[2] * 0.1, 0], fadeIn: 0.15, frame: FRAME.glow, inertia: 0.2 });
}

// ------------------------------------------------------------------------------------- world
/** A pellet as a short gold feather streak + its fire-feather TRAIL_DROP (only a couple of pellets drop). */
export function featherTracer(g, L, from, to, drop = false, owner = 'bf') {
  const fx = g.fx;
  if (!fx) return;
  fx.glowTracer(from, to, { color: L.root, glow: [L.flame[0] * 0.35, L.flame[1] * 0.35, L.flame[2] * 0.35], width: 0.022, length: 1.3, speed: 150, start: 0.5 });
  if (drop && fx.motes?.trailDrop) fx.motes.trailDrop(from, to, L.moteKind, { owner, spacing: 2.2, max: 24, color: L.mote, color2: L.mote2, size: 0.085, scoped: (g.vm?.aim ?? 0) > 0.5 });
}

/** Hit: one small fire feather rises and burns out in 0.4 s (KE_PLUME, small; ≤ 12 alive per owner). */
export function plume(g, L, p, owner = 'bfp') {
  const M = g.fx?.motes;
  if (!M) return;
  if ((M.owners?.get(owner) || 0) >= 12) return;
  M.spawn(L.moteKind, p, { vel: [(R() - 0.5) * 0.3, 0.8, (R() - 0.5) * 0.3], fall: -0.6, life: 0.42 + R() * 0.1, size: 0.1, color: L.mote, color2: L.mote2, owner });
  g.fx.particles.spawn({ additive: true, x: p.x, y: p.y, z: p.z, vy: 0.5, life: 0.22, size: 0.08, size1: 0.14, color: [1, 1, 1, 0.8], color1: [1, 1, 1, 0],
    frame: FRAME.flick[(R() * 4) | 0], ramp: L.flameRamp, heat: 1, heat1: 0.3, mode: 'align', dir: [0, 1, 0], aspect: 1.2, anchor: 0.3 });
}

/** KE_PLUME (§1.10): 3 small fire plumes rise from the body and burn out; a feather-shaped scorch stays 2 s. */
export function killPlume(g, L, p, floorY) {
  const fx = g.fx;
  if (!fx) return;
  for (let i = 0; i < 3; i++) {
    _a.set(p.x + (R() - 0.5) * 0.35, p.y + 0.15 + R() * 0.25, p.z + (R() - 0.5) * 0.35);
    fx.motes?.spawn(L.moteKind, _a, { vel: [(R() - 0.5) * 0.25, 0.4, (R() - 0.5) * 0.25], fall: -0.38, life: 1.1 + R() * 0.3, size: 0.16, color: L.mote, color2: L.mote2 });
    fx.particles.spawn({ additive: true, x: _a.x, y: _a.y - 0.1, z: _a.z, vy: 0.7, life: 0.5, size: 0.16, size1: 0.26, color: [1, 1, 1, 0.9], color1: [1, 1, 1, 0],
      frame: FRAME.fire, frames: 8, fps: 16, ramp: L.flameRamp, heat: 1, heat1: 0.25, mode: 'align', dir: [0, 1, 0], aspect: 1.6, anchor: 0.35 });
  }
  fx.sparkBurst(_a.set(p.x, p.y + 0.3, p.z), { color: L.ember, color1: L.flame, count: 6, speed: 2.2, glow: 0.25 });
  if (Number.isFinite(floorY)) {
    _b.set(R() - 0.5, 0, R() - 0.5).normalize();
    fx.decals?.add(_a.set(p.x, floorY, p.z), UP, { frame: DECAL.scorch, size: 0.42, aspect: 0.36, along: _b, alpha: 0.85, life: 2, fade: 1, fit: false });
    fx.decals?.add(_a.set(p.x + _b.x * 0.18, floorY, p.z + _b.z * 0.18), UP, { frame: DECAL.scorch, size: 0.22, aspect: 0.3, along: _c.set(_b.z, 0, -_b.x), alpha: 0.6, life: 2, fade: 1, fit: false });
  }
}

/** KE_SOUL (§1.10, 鬼車): a ghost-fire wisp flies a bezier from the body to the gun in 0.4 s. Returns a ticker. */
export function soulWisp(g, L, from, getTo, onArrive) {
  const P = g.fx?.particles;
  const p0 = from.clone(), ctrl = from.clone().add(_a.set((R() - 0.5) * 2, 2.2, (R() - 0.5) * 2));
  let t = 0, done = false;
  return (dt) => {
    if (done) return false;
    t += dt;
    const u = Math.min(1, t / 0.4), to = getTo(_b);
    if (!to) return false;
    // quadratic bezier from the body over a lift point to the gun
    const v = 1 - u;
    _c.set(v * v * p0.x + 2 * v * u * ctrl.x + u * u * to.x, v * v * p0.y + 2 * v * u * ctrl.y + u * u * to.y, v * v * p0.z + 2 * v * u * ctrl.z + u * u * to.z);
    P?.spawn({ additive: true, x: _c.x, y: _c.y, z: _c.z, life: 0.18, size: 0.09 * (1 - u * 0.6), size1: 0.02, color: [...L.flame, 1], color1: [L.teal[0] * 0.3, L.teal[1] * 0.3, L.teal[2] * 0.3, 0], frame: FRAME.glow });
    if (R() < 0.5) P?.spawn({ additive: true, x: _c.x, y: _c.y, z: _c.z, vx: (R() - 0.5) * 0.4, vy: 0.3, vz: (R() - 0.5) * 0.4, life: 0.3, size: 0.012, color: [...L.teal, 1], color1: [0, 0, 0, 0], frame: FRAME.glint });
    if (u >= 1) { done = true; onArrive?.(); return false; }
    return true;
  };
}

/** 羽落: a burning feather lance from the sky (beam streak) and a standing pillar of feather flame where it lands. */
export function fallingFeather(g, L, p, { big = 1 } = {}) {
  const fx = g.fx, P = fx?.particles;
  if (!P) return;
  _a.set(p.x + 1.2, p.y + 13, p.z - 0.6);
  fx.beam?.(_a.clone(), p.clone(), { core: L.root, glow: [L.flame[0] * 0.4, L.flame[1] * 0.4, L.flame[2] * 0.4], wCore: 0.07 * big, wGlow: 0.42 * big, life: 0.26, shrink: 0.6 });
  // the feather itself: an upright flame feather planted in the ground, burning ~0.9 s
  for (let k = 0; k < 2; k++) {
    P.spawn({ additive: true, x: p.x + (R() - 0.5) * 0.1, y: p.y, z: p.z + (R() - 0.5) * 0.1, vy: 0.2, life: 0.75 + R() * 0.25, size: 0.42 * big, size1: 0.5 * big, color: [1, 1, 1, 1], color1: [1, 1, 1, 0], colorPow: 1.4,
      frame: FRAME.cone + 1, ramp: L.flameRamp, heat: 1.2, heat1: 0.4, mode: 'align', dir: [0, 1, 0], aspect: 3.8, anchor: 0.45, mirror: k > 0, rot: (R() - 0.5) * 0.25, ground: p.y, soft: 0.1 });
  }
  P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, vy: 0.6, life: 0.55, size: 0.9 * big, size1: 1.2 * big, color: [1, 1, 1, 0.9], color1: [1, 1, 1, 0],
    frame: FRAME.flick[(R() * 4) | 0], ramp: L.flameRamp, heat: 1.05, heat1: 0.3, mode: 'align', dir: [0, 1, 0], aspect: 1.2, anchor: 0.3, ground: p.y, soft: 0.15 });
  P.spawn({ additive: true, x: p.x, y: p.y + 0.03, z: p.z, life: 0.5, size: 1.6 * big, size1: 2.4 * big, color: [L.flame[0] * 0.3, L.flame[1] * 0.3, L.flame[2] * 0.3, 1], color1: [0, 0, 0, 0], frame: FRAME.glow, mode: 'flat', dir: [0, 1, 0] });
  fx.shockwave(_a.set(p.x, p.y + 0.05, p.z), { normal: UP, r0: 0.2, r1: 1.6 * big, life: 0.32, color: L.ring });
  fx.sparkBurst(_a.set(p.x, p.y + 0.25, p.z), { color: L.ember, color1: L.flame, count: 8, speed: 4, glow: 0.3 });
  fx.knockDust?.(_a.set(p.x, p.y, p.z), _b.set((R() - 0.5) * 3, 0, (R() - 0.5) * 3), 0.7);
  fx.decals?.add(_a.set(p.x, p.y, p.z), UP, { frame: DECAL.scorch, size: 0.8 * big, aspect: 0.42, along: _b.set(R() - 0.5, 0, R() - 0.5), alpha: 0.9, life: 3, fade: 1.2, fit: false });
  fx.motes?.burst?.(L.moteKind, _a.set(p.x, p.y + 0.4, p.z), 2, { speed: 1.4, spread: 0.6, color: L.mote, color2: L.mote2, size: 0.12 });
}

// ------------------------------------------------------------------------------------- the dive's fire path
/** Flame nodes every 2 m along a ground path, emitting for `life` s; scorch as the bird passes; one keyed light. */
export class FirePath {
  constructor(g, L, nodes, { life = 4, key = 'bfpath' } = {}) {
    this.g = g; this.L = L; this.nodes = nodes.map((p) => ({ p: p.clone(), on: -1, emit: R() * 0.1 })); this.life = life; this.key = key + ((R() * 1e6) | 0); this.t = 0;
  }
  /** Light the nodes up to index i (the spirit passes over them). */
  reach(i) {
    const fx = this.g.fx;
    this.nodes.forEach((n, j) => {
      if (j > i || n.on >= 0) return;
      n.on = this.t;
      fx?.decals?.add(_a.set(n.p.x, n.p.y, n.p.z), UP, { frame: DECAL.scorch, size: 1.9, aspect: 0.6, along: _b.set(R() - 0.5, 0, R() - 0.5), alpha: 0.85, life: this.life + 1.5, fade: 1.5, fit: false });
    });
  }
  update(dt) {
    const fx = this.g.fx, P = fx?.particles, L = this.L;
    this.t += dt;
    let alive = 0, cx = 0, cz = 0, cy = 0;
    const k = fx?.k ?? 1;
    for (const n of this.nodes) {
      if (n.on < 0) continue;
      const age = this.t - n.on;
      if (age > this.life) continue;
      alive++; cx += n.p.x; cy += n.p.y; cz += n.p.z;
      const f = Math.min(1, age / 0.2) * Math.min(1, (this.life - age) / 0.6);
      if ((n.emit -= dt) > 0) continue;
      n.emit = (0.09 + R() * 0.06) / Math.max(0.5, k);
      const ox = (R() - 0.5) * 1.6, oz = (R() - 0.5) * 1.6;
      P?.spawn({ additive: true, x: n.p.x + ox, y: n.p.y, z: n.p.z + oz, vy: 0.6 + R() * 0.4, life: 0.4 + R() * 0.25, size: 0.6 * f, size1: 0.8 * f, sizePow: 0.6, color: [1, 1, 1, 0.9], color1: [1, 1, 1, 0], colorPow: 1.4,
        frame: FRAME.flick[(R() * 4) | 0], ramp: L.flameRamp, heat: 1 + R() * 0.15, heat1: 0.3, mode: 'align', dir: [0, 1, 0], aspect: 0.9 + R() * 0.5, anchor: 0.32, mirror: R() < 0.5, ground: n.p.y, soft: 0.12 });
      if (R() < 0.25) P?.spawn({ additive: true, x: n.p.x + ox * 0.5, y: n.p.y + 0.3, z: n.p.z + oz * 0.5, vx: (R() - 0.5) * 0.6, vy: 1.2 + R() * 1.4, vz: (R() - 0.5) * 0.6, life: 0.8, size: 0.012, stretch: 0.025,
        color: [...L.ember, 1], color1: [L.ember[0] * 0.3, L.ember[1] * 0.1, L.ember[2] * 0.1, 1], frame: FRAME.spark, gravity: -0.3, drag: 0.6 });
      if (R() < 0.35) P?.spawn({ additive: true, x: n.p.x, y: n.p.y + 0.03, z: n.p.z, life: 0.25, size: 2.4 * f, color: [L.flame[0] * 0.12, L.flame[1] * 0.12, L.flame[2] * 0.12, 1], color1: [0, 0, 0, 0], frame: FRAME.glow, mode: 'flat', dir: [0, 1, 0] });
    }
    if (alive) fx?.lights?.hold(this.key, _a.set(cx / alive, cy / alive + 1, cz / alive), L.light, 10 + alive * 0.8, 9);
    else if (this.t > 0.5) fx?.lights?.release(this.key);
    return alive > 0 || this.nodes.some((n) => n.on < 0) && this.t < 8;
  }
  stop() { this.g.fx?.lights?.release(this.key); }
}

// ------------------------------------------------------------------------------------- spirit bodies (GHOST)
// Shapes in 1 m units, beak towards -z, wings along ±x, origin at the shoulders (the ghost shader flaps wing vertices
// about the z axis through the origin). aAnim: x = signed wing weight, y = body / neck wave weight, z = along body.
function anim(g, fn) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  const p = g.attributes.position, a = new Float32Array(p.count * 4);
  for (let i = 0; i < p.count; i++) { const r = fn(p.getX(i), p.getY(i), p.getZ(i)); a[i * 4] = r[0]; a[i * 4 + 1] = r[1]; a[i * 4 + 2] = r[2]; }
  g.setAttribute('aAnim', new THREE.BufferAttribute(a, 4));
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}
const still = () => [0, 0, 0];
function tubeAlong(pts, r0, r1, radial = 7, seg = 10) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const g = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  // taper: scale each ring about the curve
  const pos = g.attributes.position, P = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const u = i / seg, c = curve.getPointAt(u), r = r0 + (r1 - r0) * u;
    for (let j = 0; j <= radial; j++) { const k = i * (radial + 1) + j; P.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c); pos.setXYZ(k, P.x, P.y, P.z); }
  }
  g.computeVertexNormals();
  return g;
}
/** A fan wing (one side): `n` long primaries (thin tapered strips) splaying from the shoulder, raised in a V. */
function wing(s, { span = 0.5, n = 7, lift = 0.24, sweep = 0.1 } = {}) {
  const parts = [];
  // inner arm (covert) surface
  const arm = new THREE.BufferGeometry();
  const P = [], I = [];
  const cols = 6;
  for (let i = 0; i <= cols; i++) {
    const u = i / cols, x = s * (0.05 + u * span * 0.62), y = u * lift * 0.62, z0 = -0.07 + u * 0.03, z1 = 0.16 - u * 0.06;
    P.push(x, y, z0, x, y - 0.01, z1);
  }
  for (let i = 0; i < cols; i++) { const a = i * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  arm.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); arm.setIndex(I); arm.computeVertexNormals();
  parts.push(anim(arm, (x) => [x / span, 0, 0.3]));
  // primaries: each a thin leaf from the wrist, fanned backwards
  for (let k = 0; k < n; k++) {
    const a = (k / (n - 1)) * 1.1 - 0.15, len = 0.2 + 0.08 * Math.sin(Math.PI * k / (n - 1));
    const x0 = s * span * 0.6, y0 = lift * 0.6, z0 = -0.02 + k * 0.012;
    const dx = s * Math.cos(a) * 0.95, dz = Math.sin(a) + sweep;
    const g = new THREE.PlaneGeometry(1, 0.08, 4, 1).translate(0.5, 0, 0);
    const pp = g.attributes.position;
    for (let i = 0; i < pp.count; i++) {
      const u = pp.getX(i), w = pp.getY(i) * Math.sin(Math.PI * Math.min(1, u * 1.08 + 0.05));
      const x = x0 + dx * u * len, y = y0 + u * len * 0.45 + w * 0.0, z = z0 + dz * u * len * 0.6 + w * 0.9;
      pp.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    parts.push(anim(g, (x) => [x / span, 0, 0.3]));
  }
  return mergeGeometries(parts);
}

let craneCache = null;
/** 畢方: one-legged crane, wings raised, long neck and beak, crest; standing height ≈ 0.62 below the shoulders. */
export function craneGeo() {
  if (craneCache) return craneCache;
  const parts = [];
  parts.push(anim(new THREE.SphereGeometry(0.5, 12, 8).scale(0.13, 0.12, 0.3).translate(0, -0.03, 0.03), (x, y, z) => [0, 0.1, 0.4 + z]));
  // neck: S-curve up and forward, head, crest, long beak
  parts.push(anim(tubeAlong([[0, 0.02, -0.12], [0, 0.16, -0.17], [0, 0.3, -0.13], [0, 0.4, -0.2]], 0.045, 0.026, 7, 12), (x, y) => [0, 0.25 + y, 0]));
  parts.push(anim(new THREE.SphereGeometry(0.5, 10, 7).scale(0.06, 0.055, 0.1).translate(0, 0.42, -0.24), still));
  parts.push(anim(new THREE.ConeGeometry(0.018, 0.2, 6).rotateX(-Math.PI / 2).translate(0, 0.41, -0.38), still));
  parts.push(anim(new THREE.ConeGeometry(0.02, 0.12, 5).rotateX(0.9).translate(0, 0.48, -0.19), still));
  parts.push(anim(new THREE.ConeGeometry(0.014, 0.09, 5).rotateX(1.1).translate(0.012, 0.47, -0.17), still));
  // tail: three long plumes
  for (let k = -1; k <= 1; k++) parts.push(anim(new THREE.PlaneGeometry(0.06, 0.34, 1, 3).rotateX(-Math.PI / 2 + 0.35).rotateY(k * 0.3).translate(k * 0.03, -0.07, 0.36), still));
  // wings
  parts.push(wing(-1), wing(1));
  // the one leg: thigh, shin, knee, three toes
  parts.push(anim(tubeAlong([[0, -0.08, 0.04], [0, -0.3, 0.06], [0, -0.6, 0.02]], 0.018, 0.012, 6, 6), still));
  parts.push(anim(new THREE.SphereGeometry(0.022, 6, 4).translate(0, -0.3, 0.06), still));
  for (const a of [-0.45, 0.45, Math.PI]) parts.push(anim(new THREE.ConeGeometry(0.01, 0.1, 4).rotateX(-Math.PI / 2).rotateY(a).translate(-Math.sin(a) * 0.04, -0.615, -Math.cos(a) * 0.04), still));
  craneCache = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  craneCache.computeBoundingBox();
  return craneCache;
}

let nineCache = null;
/** 鬼車: a dark bird with nine heads on swaying necks fanned in front, ragged wings, long tail. */
export function nineHeadGeo() {
  if (nineCache) return nineCache;
  const parts = [];
  parts.push(anim(new THREE.SphereGeometry(0.5, 12, 8).scale(0.16, 0.13, 0.3).translate(0, -0.02, 0.04), (x, y, z) => [0, 0.05, 0.5 + z]));
  for (let i = 0; i < 9; i++) {
    const a = (i / 8 - 0.5) * 2.2, len = i === 4 ? 0.36 : 0.26 + 0.04 * Math.cos(a);
    const ex = Math.sin(a) * len, ey = 0.12 + Math.cos(a) * len * 0.5, ez = -0.14 - Math.cos(a) * len * 0.55;
    parts.push(anim(tubeAlong([[0, 0.02, -0.1], [ex * 0.45, ey * 0.7, -0.18], [ex, ey, ez]], 0.03, 0.014, 5, 7), (x, y, z) => [0, 0.6 + Math.abs(x), (i / 8)]));
    parts.push(anim(new THREE.SphereGeometry(0.5, 7, 5).scale(0.04, 0.035, 0.06).translate(ex, ey, ez - 0.03), (x, y, z) => [0, 1, i / 8]));
    parts.push(anim(new THREE.ConeGeometry(0.012, 0.06, 4).rotateX(-Math.PI / 2 - 0.4).translate(ex, ey - 0.01, ez - 0.08), (x, y, z) => [0, 1, i / 8]));
  }
  for (let k = -2; k <= 2; k++) parts.push(anim(new THREE.PlaneGeometry(0.05, 0.42, 1, 3).rotateX(-Math.PI / 2 + 0.25).rotateY(k * 0.22).translate(k * 0.025, -0.05, 0.42), still));
  parts.push(wing(-1, { span: 0.55, n: 8, lift: 0.18, sweep: 0.25 }), wing(1, { span: 0.55, n: 8, lift: 0.18, sweep: 0.25 }));
  parts.push(anim(tubeAlong([[0, -0.06, 0.05], [0, -0.3, 0.06], [0, -0.55, 0.03]], 0.016, 0.01, 5, 5), still));
  nineCache = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  nineCache.computeBoundingBox();
  return nineCache;
}

// ------------------------------------------------------------------------------------- 灼羽 stack pips (DOM)
const FEATHER_SVG = (c) => `<svg viewBox="0 0 10 22" width="7" height="15"><path d="M5 1 C9 5 9 13 5 21 C1 13 1 5 5 1 Z" fill="${c}" stroke="rgba(0,0,0,.6)" stroke-width="1"/><path d="M5 3 L5 20" stroke="rgba(255,255,255,.85)" stroke-width=".9"/></svg>`;
export class BurnPips {
  constructor(game) {
    this.g = game;
    this.root = null;
    this.pool = [];
  }
  _el(i) {
    if (!this.root) {
      this.root = document.createElement('div');
      this.root.className = 'bf-pips';
      Object.assign(this.root.style, { position: 'fixed', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 4 });
      (document.getElementById('ui') || document.body).appendChild(this.root);
    }
    while (this.pool.length <= i) {
      const e = document.createElement('div');
      Object.assign(e.style, { position: 'absolute', left: 0, top: 0, display: 'none', whiteSpace: 'nowrap', filter: 'drop-shadow(0 0 2px rgba(255,140,40,.8))' });
      this.root.appendChild(e);
      this.pool.push({ e, n: -1, c: '' });
    }
    return this.pool[i];
  }
  /** list: [{ pos: Vector3 (head), n (1..5), color }] */
  update(list) {
    const cam = this.g.camera, W = window.innerWidth, H = window.innerHeight;
    let i = 0;
    for (const it of list) {
      if (i >= 12) break;
      _a.copy(it.pos).project(cam);
      if (_a.z > 1 || Math.abs(_a.x) > 1.1 || Math.abs(_a.y) > 1.1) continue;
      const p = this._el(i++);
      if (p.n !== it.n || p.c !== it.color) { p.n = it.n; p.c = it.color; p.e.innerHTML = FEATHER_SVG(it.color).repeat(it.n); }
      p.e.style.display = '';
      p.e.style.transform = `translate(${((_a.x * 0.5 + 0.5) * W - it.n * 3.5).toFixed(0)}px, ${((-_a.y * 0.5 + 0.5) * H - 18).toFixed(0)}px)`;
    }
    for (; i < this.pool.length; i++) if (this.pool[i].e.style.display !== 'none') { this.pool[i].e.style.display = 'none'; this.pool[i].n = -1; }
  }
  dispose() { this.root?.remove(); this.root = null; this.pool = []; }
}
