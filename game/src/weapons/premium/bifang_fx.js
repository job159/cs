// 畢方．焚翼 / 鬼車．晦翼 — effect primitives (docs/PREMIUM_WEAPONS.md M03; mechanics + timeline in bifang.js).
// Built only from the FX facade (particles, beam, tracers, decals, lights) and the premium kit (motes, sigils,
// summons): nothing here owns GPU objects except the two spirit geometries (built once) and the burn-stack pips (DOM).
//   crestFan(g, L)            冠羽扇 muzzle: 1-frame white core, 5 flame feathers fanned ±40° up from the beak (hollow
//                             centre), sparks off the tips, sometimes a cyan tongue running back down the feather vein
//   featherTracer / plume     pellets as short gold feather streaks; a hit sends up one small fire feather (≤ 12 alive)
//   killPlume / soulWisp      KE_PLUME (3 rising fire plumes + a feather-shaped scorch) / KE_SOUL (ghost-fire wisp to the gun)
//   FeatherLance              羽落: a burning feather lance from the sky, planted as an upright flame feather for ~1 s
//   featherLick / debris      灼羽's rising feather licks; street chunks + dust (beam ends, the ult's exit)
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
    // the ultimate's 火焰雲紋 on the floor: gold-vermilion, kept dim (additive; ≤ ~0.5 of the screen's range)
    sigilCol: [1.5, 0.36, 0.07], sigilCol1: [1.35, 0.85, 0.2],
    // porcelain body, teal light inside, vermilion rim; the tinted parts (craneGeo aTint) carry beak / crest / gold
    ghost: { base: [0.93, 0.9, 0.84], core: [0.3, 2.4, 2.0], rim: [3.4, 0.9, 0.22], edge: [5, 2.4, 0.6], opacity: 0.66, rimPower: 2.4 },
    wing: { core: [2.2, 1.9, 1.3], tip: [2.6, 0.7, 0.15], enamel: [[0.15, 1.6, 1.5], [2.2, 0.32, 0.12], [2.6, 2.1, 1.3]], gold: [2.6, 1.7, 0.55], hot: [5, 4.4, 3.4] },
    xh: '#ffc74a', light: 0xffb050, pitch: 1, echo: false, moteKind: 'glowfeather', scorch: 0, burnFx: 'featherburn',
  },
  guiche: {
    id: 'guiche', root: [3.6, 2.2, 6], flame: [2.6, 0.5, 5.2], teal: [0.4, 4.4, 4], ember: [3, 0.8, 5.4], mote: [2.4, 1.0, 4.4], mote2: [3, 4.6, 5],
    beamCore: [4.4, 3.4, 6.4], beamGlow: [0.5, 2.4, 2.4], ring: [2, 0.8, 4], ramp: RAMP.purple, flameRamp: RAMP.purple, sigil: 'mountainSea',
    sigilCol: [0.95, 0.22, 1.6], sigilCol1: [0.2, 1.1, 1.0],
    ghost: { base: [0.08, 0.07, 0.1], core: [0.3, 2.4, 2.2], rim: [2.0, 0.6, 3.8], edge: [2.4, 1.0, 5], opacity: 0.55, dark: true },
    // 紫黑漸變到冷青羽尖: dark violet cells shading to cold-teal tips, dim silver wire, thin enamel (the night shows through)
    wing: { core: [1.5, 0.45, 2.8], tip: [0.12, 1.5, 1.35], enamel: [[0.42, 0.08, 0.85], [0.22, 0.04, 0.5], [0.6, 0.14, 1.1]], gold: [0.75, 0.8, 0.95], tipMix: 0.9, alpha: 0.48, hot: [2.4, 4.6, 4.4] },
    xh: '#c58bff', light: 0xb070ff, pitch: 0.794, echo: true, moteKind: 'glowfeather', scorch: 0, burnFx: 'ghostfire',
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
  // (no echo copy of a loop: only the first handle is returned, an echoing loop could never be stopped)
  if (L?.echo && !o.loop) a.play(n, { ...o, pitch, volume: (o.volume ?? 1) * 0.34, delay: (o.delay || 0) + 0.17 });
  return v;
}

// ------------------------------------------------------------------------------------- first person: 冠羽扇
/** Gun axes in camera space (viewmodel-layer particles live there). */
function gunAxes(vm) {
  const q = vm.gunRoot.quaternion;
  _f.set(0, 0, -1).applyQuaternion(q); _u.set(0, 1, 0).applyQuaternion(q); _r.set(1, 0, 0).applyQuaternion(q);
}

/**
 * 冠羽扇 (crest fan): a 1-frame white core at the beak, 5 flame feathers fanned ±44° up from the beak around the
 * barrel axis (centre left hollow), scale 0.6 -> 1.2 and alpha 1 -> 0 over 200 ms, 2 sparks off each tip; a thin
 * gold ring snaps open round the gape (hollow); 30 % of shots a cyan tongue runs back down the right feather vein.
 * Sized for the first-person distance (the beak is ~1 m from the eye): feathers 0.2-0.26 m, the card's 0.12 m
 * reads as a speck there.
 */
export function crestFan(g, L, shot = 0, k = 1) {
  const vm = g.vm, P = g.fx?.particles;
  const c = vm?.socketCam?.('crest', _a), b = vm?.socketCam?.('beak', _b);
  if (!P || !c || !b) return;
  gunAxes(vm);
  // white core in the gape (two frames) + a warm bloom round it
  P.spawn({ additive: true, vm: true, x: b.x, y: b.y, z: b.z, life: 0.04, size: 0.15 * k, size1: 0.2 * k, color: [14, 12.5, 10, 1], color1: [5, 3, 1.2, 0], frame: FRAME.glow });
  P.spawn({ additive: true, vm: true, x: b.x, y: b.y, z: b.z, life: 0.16, size: 0.3 * k, size1: 0.46 * k, color: [L.flame[0] * 0.3, L.flame[1] * 0.3, L.flame[2] * 0.3, 1], color1: [0, 0, 0, 0], frame: FRAME.glow });
  // hollow ring round the gape, facing down the barrel
  P.spawn({ additive: true, vm: true, x: c.x - _f.x * 0.03, y: c.y - _f.y * 0.03, z: c.z - _f.z * 0.03, mode: 'flat', dir: [-_f.x, -_f.y, -_f.z], life: 0.1, size: 0.06 * k, size1: 0.26 * k, sizePow: 0.5,
    color: [L.root[0] * 0.55, L.root[1] * 0.55, L.root[2] * 0.55, 1], color1: [L.flame[0] * 0.15, L.flame[1] * 0.15, L.flame[2] * 0.15, 0], frame: FRAME.thinRing ?? 62 });
  const rot = (shot % 2) * 0.09;
  for (let i = 0; i < 5; i++) {
    const th = (-44 + i * 22) * Math.PI / 180 + rot + (R() - 0.5) * 0.06;
    _d.copy(_u).multiplyScalar(Math.cos(th)).addScaledVector(_r, Math.sin(th)).addScaledVector(_f, 0.22).normalize();
    // feather roots sit on a small ring round the crest point: the centre stays clear
    const x = c.x + _d.x * 0.03 * k, y = c.y + _d.y * 0.03 * k, z = c.z + _d.z * 0.03 * k;
    const mid = (i === 2 ? 1.18 : 1) * k;
    // the flame feather (ramp: white-gold root -> vermilion tip), ~0.55 m: 2.3x the card's 0.24 at the first-person distance
    P.spawn({ additive: true, vm: true, x, y, z, mode: 'align', dir: [_d.x, _d.y, _d.z], aspect: 4.4, anchor: 0.5, mirror: i < 2,
      life: 0.2, size: 0.115 * 0.6 * mid, size1: 0.115 * 1.2 * mid, sizePow: 0.6, color: [1.45, 1.25, 1.05, 1], color1: [1, 0.9, 0.8, 0], colorPow: 1.3,
      frame: FRAME.cone + 1, ramp: L.flameRamp, heat: 1.3, heat1: 0.55, inertia: 0.3 });
    // HDR white root (the first third of the feather burns white)
    P.spawn({ additive: true, vm: true, x, y, z, mode: 'align', dir: [_d.x, _d.y, _d.z], aspect: 3, anchor: 0.45, life: 0.07, size: 0.05 * mid, size1: 0.06 * mid,
      color: [7, 6.2, 4.8, 1], color1: [L.flame[0] * 0.4, L.flame[1] * 0.4, L.flame[2] * 0.4, 0], frame: FRAME.cone + 2, inertia: 0.3 });
    // a soft hot glow along the same feather (reads as a lit plume, not a thin line)
    P.spawn({ additive: true, vm: true, x, y, z, mode: 'align', dir: [_d.x, _d.y, _d.z], aspect: 3.2, anchor: 0.5, life: 0.17, size: 0.15 * mid, size1: 0.2 * mid,
      color: [L.flame[0] * 0.38, L.flame[1] * 0.38, L.flame[2] * 0.38, 1], color1: [L.flame[0] * 0.08, L.flame[1] * 0.08, L.flame[2] * 0.08, 0], frame: FRAME.glow, inertia: 0.3 });
    // two sparks flung off the tip
    const tip = 0.5 * mid;
    for (let q = 0; q < 2; q++) {
      const sp = 1.4 + R() * 1.2;
      P.spawn({ additive: true, vm: true, x: x + _d.x * tip, y: y + _d.y * tip, z: z + _d.z * tip,
        vx: (_d.x + (R() - 0.5) * 0.6) * sp, vy: (_d.y + (R() - 0.5) * 0.6) * sp + 0.1, vz: (_d.z + (R() - 0.5) * 0.6) * sp,
        life: 0.28 + R() * 0.16, size: 0.005, stretch: 0.02, color: [...L.ember, 1], color1: [L.ember[0] * 0.3, L.ember[1] * 0.2, L.ember[2] * 0.2, 0], frame: FRAME.spark, gravity: 0.6, drag: 3, inertia: 0.4 });
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
/**
 * A pellet as a wide feather ribbon: a fast gold head streak plus a short-lived feather-vein ribbon (herringbone
 * barbs, thin where it leaves the beak) that burns out in ~0.1 s; `drop` sheds fire feathers along it (TRAIL_DROP).
 */
export function featherTracer(g, L, from, to, drop = false, owner = 'bf') {
  const fx = g.fx;
  if (!fx) return;
  fx.glowTracer(from, to, { color: L.mote2, glow: [L.flame[0] * 0.45, L.flame[1] * 0.45, L.flame[2] * 0.45], width: 0.05, length: 2.4, speed: 130, start: 0.6 });
  fx.beam?.(from, to, { core: [L.root[0] * 0.55, L.root[1] * 0.55, L.root[2] * 0.55], glow: [L.flame[0] * 0.16, L.flame[1] * 0.16, L.flame[2] * 0.16], wCore: 0.03, wGlow: 0.22,
    life: 0.11, shrink: 0.3, scroll: 6, pattern: 'feather', wStart: 0.15, ramp: 3 });
  if (drop && fx.motes?.trailDrop) fx.motes.trailDrop(from, to, L.moteKind, { owner, spacing: 2.2, max: 24, color: L.mote, color2: L.mote2, size: 0.1, scoped: (g.vm?.aim ?? 0) > 0.5 });
}

/** Hit: one small fire feather rises and burns out in 0.4 s (KE_PLUME, small; ≤ 12 alive per owner). */
export function plume(g, L, p, owner = 'bfp') {
  const M = g.fx?.motes;
  if (!M) return;
  if ((M.owners?.get(owner) || 0) >= 12) return;
  M.spawn(L.moteKind, p, { vel: [(R() - 0.5) * 0.3, 0.9, (R() - 0.5) * 0.3], fall: -0.6, life: 0.5 + R() * 0.1, size: 0.16, color: L.mote, color2: L.mote2, owner });
  g.fx.particles.spawn({ additive: true, x: p.x, y: p.y, z: p.z, vy: 0.5, life: 0.26, size: 0.14, size1: 0.22, color: [1, 1, 1, 0.85], color1: [1, 1, 1, 0],
    frame: FRAME.flick[(R() * 4) | 0], ramp: L.flameRamp, heat: 1, heat1: 0.3, mode: 'align', dir: [0, 1, 0], aspect: 1.3, anchor: 0.3 });
}

/**
 * Pellet impact on a body: a 0.3 m gold-vermilion splash (hot flash + a flame tongue thrown back at the shooter),
 * 4-6 small fire-feather shards and embers (on top of the blood).
 */
export function emberHit(g, L, p, dir) {
  const P = g.fx?.particles;
  if (!P) return;
  const bx = -(dir?.x || 0), bz = -(dir?.z || 0);
  P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.08, size: 0.3, size1: 0.42, color: [L.mote2[0] * 0.7, L.mote2[1] * 0.7, L.mote2[2] * 0.7, 1], color1: [L.flame[0] * 0.25, L.flame[1] * 0.25, L.flame[2] * 0.25, 0], frame: FRAME.glow });
  P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, vx: bx * 0.6, vy: 0.5, vz: bz * 0.6, life: 0.2, size: 0.17, size1: 0.3, color: [1, 1, 1, 0.95], color1: [1, 1, 1, 0], colorPow: 1.3,
    frame: FRAME.flick[(R() * 4) | 0], ramp: L.flameRamp, heat: 1.15, heat1: 0.35, mode: 'align', dir: [bx * 0.7, 0.7, bz * 0.7], aspect: 1.5, anchor: 0.3 });
  const n = 4 + ((R() * 3) | 0);
  for (let k = 0; k < n; k++) {
    // fire-feather shards: little vanes flung back and up, tumbling down
    const vx = (bx + (R() - 0.5) * 1.6) * (1.6 + R() * 1.8), vy = 1 + R() * 2.2, vz = (bz + (R() - 0.5) * 1.6) * (1.6 + R() * 1.8);
    const l = Math.hypot(vx, vy, vz) || 1;
    P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, vx, vy, vz, life: 0.35 + R() * 0.25, mode: 'align', dir: [vx / l, vy / l, vz / l], aspect: 3.4, anchor: 0.5, mirror: R() < 0.5,
      size: 0.035, size1: 0.02, color: [L.mote2[0] * 0.8, L.mote2[1] * 0.8, L.mote2[2] * 0.8, 1], color1: [L.flame[0] * 0.3, L.flame[1] * 0.3, L.flame[2] * 0.3, 0], frame: FRAME.cone + 1, gravity: 4, drag: 2.2, rot: (R() - 0.5) * 0.5 });
  }
  for (let k = 0; k < 3; k++) {
    const sp = 1.6 + R() * 2.4;
    P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, vx: (bx + (R() - 0.5) * 1.4) * sp, vy: (0.4 + R() * 0.9) * sp, vz: (bz + (R() - 0.5) * 1.4) * sp,
      life: 0.25 + R() * 0.25, size: 0.008, stretch: 0.02, color: [...L.ember, 1], color1: [L.ember[0] * 0.3, L.ember[1] * 0.15, L.ember[2] * 0.1, 0], frame: FRAME.spark, gravity: 7, drag: 1.2 });
  }
}

/** A burning target's rising feather lick (灼羽: more of them with more stacks). */
export function featherLick(g, L, p, n = 1) {
  const P = g.fx?.particles;
  if (!P) return;
  const s = 0.07 + 0.012 * n;
  P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, vx: (R() - 0.5) * 0.3, vy: 0.9 + R() * 0.6, vz: (R() - 0.5) * 0.3, life: 0.45 + R() * 0.2, mode: 'align', dir: [0, 1, 0], aspect: 3.6, anchor: 0.4,
    mirror: R() < 0.5, rot: (R() - 0.5) * 0.4, size: s, size1: s * 0.5, color: [1.2, 1.1, 1, 1], color1: [1, 1, 1, 0], colorPow: 1.2, frame: FRAME.cone + 1, ramp: L.flameRamp, heat: 1.2, heat1: 0.35, drag: 1 });
}

/** KE_PLUME (§1.10): three 0.5 m fire feathers rise off the body and burn out, flames at their roots, a scorch. */
export function killPlume(g, L, p, floorY) {
  const fx = g.fx, P = fx?.particles;
  if (!P) return;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + R(), x = p.x + Math.cos(a) * 0.22, z = p.z + Math.sin(a) * 0.22, y = p.y + 0.05 + R() * 0.3;
    const lean = [Math.cos(a) * 0.35, 1, Math.sin(a) * 0.35];
    // the feather: a 0.5 m flame feather (ramp: white root -> vermilion tip) + its white-hot rachis
    P.spawn({ additive: true, x, y, z, vx: lean[0] * 0.3, vy: 0.75, vz: lean[2] * 0.3, life: 0.95 + R() * 0.2, delay: i * 0.06, mode: 'align', dir: lean, aspect: 3.6, anchor: 0.45, mirror: i === 1,
      size: 0.15, size1: 0.11, color: [1.35, 1.2, 1.05, 1], color1: [1, 1, 1, 0], colorPow: 1.6, frame: FRAME.cone + 1, ramp: L.flameRamp, heat: 1.3, heat1: 0.4, drag: 0.6 });
    P.spawn({ additive: true, x, y, z, vx: lean[0] * 0.3, vy: 0.75, vz: lean[2] * 0.3, life: 0.5, delay: i * 0.06, mode: 'align', dir: lean, aspect: 5, anchor: 0.45, size: 0.05, size1: 0.03,
      color: [L.mote2[0], L.mote2[1], L.mote2[2], 1], color1: [L.flame[0] * 0.3, L.flame[1] * 0.3, L.flame[2] * 0.3, 0], frame: FRAME.cone + 2, drag: 0.6 });
    P.spawn({ additive: true, x, y: y - 0.1, z, vy: 0.7, life: 0.55, delay: i * 0.06, size: 0.24, size1: 0.36, color: [1, 1, 1, 0.9], color1: [1, 1, 1, 0],
      frame: FRAME.fire, frames: 8, fps: 16, ramp: L.flameRamp, heat: 1, heat1: 0.25, mode: 'align', dir: [0, 1, 0], aspect: 1.6, anchor: 0.35 });
    fx.motes?.spawn(L.moteKind, _a.set(x, y + 0.3, z), { vel: [(R() - 0.5) * 0.4, 0.5, (R() - 0.5) * 0.4], fall: -0.3, life: 1.2 + R() * 0.3, size: 0.24, color: L.mote, color2: L.mote2 });
  }
  P.spawn({ additive: true, x: p.x, y: p.y + 0.2, z: p.z, life: 0.25, size: 1.1, size1: 1.5, color: [L.flame[0] * 0.25, L.flame[1] * 0.25, L.flame[2] * 0.25, 1], color1: [0, 0, 0, 0], frame: FRAME.glow });
  fx.sparkBurst(_a.set(p.x, p.y + 0.3, p.z), { color: L.ember, color1: L.flame, count: 10, speed: 3, glow: 0.3 });
  if (Number.isFinite(floorY)) {
    _b.set(R() - 0.5, 0, R() - 0.5).normalize();
    // a feather-shaped scorch: a long vane and a short one across its quill
    fx.decals?.add(_a.set(p.x, floorY, p.z), UP, { frame: DECAL.scorch, size: 0.95, aspect: 0.34, along: _b, alpha: 0.9, life: 3, fade: 1.2, fit: false });
    fx.decals?.add(_a.set(p.x + _b.x * 0.3, floorY, p.z + _b.z * 0.3), UP, { frame: DECAL.scorch, size: 0.42, aspect: 0.3, along: _c.set(_b.z, 0, -_b.x), alpha: 0.65, life: 3, fade: 1.2, fit: false });
    P.spawn({ additive: true, x: p.x, y: floorY + 0.03, z: p.z, life: 0.6, size: 1.3, size1: 1.6, color: [L.flame[0] * 0.15, L.flame[1] * 0.15, L.flame[2] * 0.15, 1], color1: [0, 0, 0, 0], frame: FRAME.glow, mode: 'flat', dir: [0, 1, 0] });
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

/**
 * 羽落: a burning feather lance falling from the sky (white-hot head, vermilion trail ribbon), planted in the
 * ground for ~1 s as an upright flame feather; a 1.6 m ring, dust and a scorch where it lands. update(dt) -> alive.
 * `hit(p)` fires on landing (damage / shake: the caller's).
 */
export class FeatherLance {
  constructor(g, L, p, { fall = 0.24, big = 1, hit = null } = {}) {
    this.g = g; this.L = L; this.p = p.clone(); this.big = big; this.hit = hit; this.t = 0; this.fall = fall; this.landed = false;
    // from up and a little to the side (the same lean for all of one cast reads as a volley)
    this.sky = new THREE.Vector3(p.x + 2.2, p.y + 15, p.z - 1.1);
    this.trail = fall > 0.01 ? g.fx?.trail?.({ width: 0.6 * big, life: 0.22, color: [L.flame[0] * 0.85, L.flame[1] * 0.85, L.flame[2] * 0.85, 1], color1: [L.flame[0] * 0.12, L.flame[1] * 0.05, L.flame[2] * 0.02, 0], taper: 0.2, segs: 14 }) : null;
  }
  update(dt) {
    const P = this.g.fx?.particles, L = this.L;
    this.t += dt;
    if (!this.landed) {
      const u = Math.min(1, this.t / this.fall), h = _b.copy(this.sky).lerp(this.p, u * u);
      this.trail?.push(h);
      if (P && u < 1) {
        const d = _c.subVectors(this.p, this.sky).normalize();
        // the lance head: a feather-shaped white-hot spearhead and its bloom
        P.spawn({ additive: true, x: h.x, y: h.y, z: h.z, life: 0.03, mode: 'align', dir: [d.x, d.y, d.z], aspect: 3.4, anchor: 0.2, size: 0.5 * this.big, color: [7, 6, 4.6, 1], color1: [L.flame[0], L.flame[1], L.flame[2], 0], frame: FRAME.cone + 1 });
        P.spawn({ additive: true, x: h.x, y: h.y, z: h.z, life: 0.04, size: 1.3 * this.big, color: [L.flame[0] * 0.4, L.flame[1] * 0.4, L.flame[2] * 0.4, 1], color1: [0, 0, 0, 0], frame: FRAME.glow });
      }
      if (u >= 1) { this.landed = true; this.trail?.stop(); this._land(); }
      return true;
    }
    return this.t < this.fall + 1.1;
  }
  _land() {
    const g = this.g, L = this.L, fx = g.fx, P = fx?.particles, p = this.p, big = this.big;
    if (!P) return;
    // the planted feather: an upright flame feather 1.6 m tall, burning ~1 s, a white rachis down its middle
    for (let k = 0; k < 2; k++) {
      P.spawn({ additive: true, x: p.x + (R() - 0.5) * 0.06, y: p.y, z: p.z + (R() - 0.5) * 0.06, vy: 0.1, life: 0.95 + R() * 0.15, size: 0.52 * big, size1: 0.44 * big, color: [1.3, 1.2, 1.05, 1], color1: [1, 1, 1, 0], colorPow: 1.8,
        frame: FRAME.cone + 1, ramp: L.flameRamp, heat: 1.3, heat1: 0.5, mode: 'align', dir: [0.05, 1, 0], aspect: 3.7, anchor: 0.45, mirror: k > 0, rot: (R() - 0.5) * 0.12, ground: p.y, soft: 0.1 });
    }
    P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.8, size: 0.09 * big, size1: 0.07 * big, color: [L.mote2[0], L.mote2[1], L.mote2[2], 1], color1: [L.flame[0] * 0.2, L.flame[1] * 0.2, L.flame[2] * 0.2, 0], colorPow: 1.6,
      frame: FRAME.cone + 2, mode: 'align', dir: [0.05, 1, 0], aspect: 9, anchor: 0.45, ground: p.y, soft: 0.1 });
    P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, vy: 0.6, life: 0.6, size: 1.0 * big, size1: 1.3 * big, color: [1, 1, 1, 0.9], color1: [1, 1, 1, 0],
      frame: FRAME.flick[(R() * 4) | 0], ramp: L.flameRamp, heat: 1.05, heat1: 0.3, mode: 'align', dir: [0, 1, 0], aspect: 1.2, anchor: 0.3, ground: p.y, soft: 0.15 });
    P.spawn({ additive: true, x: p.x, y: p.y + 0.4, z: p.z, life: 0.07, size: 1.4 * big, color: [L.mote2[0] * 0.9, L.mote2[1] * 0.9, L.mote2[2] * 0.9, 1], color1: [L.flame[0] * 0.3, L.flame[1] * 0.3, L.flame[2] * 0.3, 0], frame: FRAME.glow });
    P.spawn({ additive: true, x: p.x, y: p.y + 0.03, z: p.z, life: 0.7, size: 2.2 * big, size1: 2.8 * big, color: [L.flame[0] * 0.28, L.flame[1] * 0.28, L.flame[2] * 0.28, 1], color1: [0, 0, 0, 0], frame: FRAME.glow, mode: 'flat', dir: [0, 1, 0] });
    fx.shockwave(_a.set(p.x, p.y + 0.05, p.z), { normal: UP, r0: 0.25, r1: 1.6 * big, life: 0.35, color: L.ring, thin: false });
    fx.sparkBurst(_a.set(p.x, p.y + 0.25, p.z), { color: L.ember, color1: L.flame, count: 10, speed: 4.5, glow: 0.3 });
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + R(); fx.knockDust?.(_a.set(p.x + Math.cos(a) * 0.4, p.y, p.z + Math.sin(a) * 0.4), _b.set(Math.cos(a) * 3, 0, Math.sin(a) * 3), 0.7); }
    fx.decals?.add(_a.set(p.x, p.y, p.z), UP, { frame: DECAL.scorch, size: 1.0 * big, aspect: 0.4, along: _b.set(R() - 0.5, 0, R() - 0.5), alpha: 0.9, life: 3.5, fade: 1.2, fit: false });
    fx.motes?.burst?.(L.moteKind, _a.set(p.x, p.y + 0.5, p.z), 3, { speed: 1.6, spread: 0.7, color: L.mote, color2: L.mote2, size: 0.16 });
    this.hit?.(p);
  }
}

/** End pillar debris: chunks of street thrown out of the beam's end, a dust ring. */
export function debris(g, p, n = 10, col = [0.3, 0.28, 0.26]) {
  const fx = g.fx, P = fx?.particles;
  if (!P) return;
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, sp = 3 + R() * 5;
    P.spawn({ x: p.x, y: p.y + 0.15, z: p.z, vx: Math.cos(a) * sp * 0.5, vy: 3 + R() * 5, vz: Math.sin(a) * sp * 0.5, life: 0.9 + R() * 0.6, size: 0.04 + R() * 0.07,
      color: [col[0], col[1], col[2], 1], color1: [col[0], col[1], col[2], 1], frame: FRAME.rock, gravity: 9.8, spin: (R() - 0.5) * 20, collide: true, bounce: 0.25 });
  }
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; fx.knockDust?.(_a.set(p.x + Math.cos(a) * 0.8, p.y, p.z + Math.sin(a) * 0.8), _b.set(Math.cos(a) * 5, 0, Math.sin(a) * 5), 1); }
}

// ------------------------------------------------------------------------------------- the dive's fire path
/** Flame nodes every 2 m along a ground path, emitting for `life` s; scorch as the bird passes; one keyed light. */
export class FirePath {
  // flame: flame width (m; height ~1.3x), spread: lateral scatter (m), light: false = no keyed light (short paths)
  constructor(g, L, nodes, { life = 4, key = 'bfpath', flame = 0.7, spread = 1.6, scorch = 1.9, light = true } = {}) {
    this.g = g; this.L = L; this.nodes = nodes.map((p) => ({ p: p.clone(), on: -1, emit: R() * 0.1 })); this.life = life; this.key = key + ((R() * 1e6) | 0); this.t = 0;
    this.flame = flame; this.spread = spread; this.scorch = scorch; this.light = light;
  }
  /** Light the nodes up to index i (the spirit passes over them). */
  reach(i) {
    const fx = this.g.fx;
    this.nodes.forEach((n, j) => {
      if (j > i || n.on >= 0) return;
      n.on = this.t;
      fx?.decals?.add(_a.set(n.p.x, n.p.y, n.p.z), UP, { frame: DECAL.scorch, size: this.scorch, aspect: 0.6, along: _b.set(R() - 0.5, 0, R() - 0.5), alpha: 0.85, life: this.life + 1.5, fade: 1.5, fit: false });
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
      const ox = (R() - 0.5) * this.spread, oz = (R() - 0.5) * this.spread, fs = this.flame * (0.8 + R() * 0.4);
      P?.spawn({ additive: true, x: n.p.x + ox, y: n.p.y, z: n.p.z + oz, vy: 0.6 + R() * 0.4, life: 0.4 + R() * 0.25, size: fs * f, size1: fs * 1.3 * f, sizePow: 0.6, color: [1, 1, 1, 0.9], color1: [1, 1, 1, 0], colorPow: 1.4,
        frame: FRAME.flick[(R() * 4) | 0], ramp: L.flameRamp, heat: 1 + R() * 0.15, heat1: 0.3, mode: 'align', dir: [0, 1, 0], aspect: 1.0 + R() * 0.5, anchor: 0.32, mirror: R() < 0.5, ground: n.p.y, soft: 0.12 });
      if (R() < 0.25) P?.spawn({ additive: true, x: n.p.x + ox * 0.5, y: n.p.y + 0.3, z: n.p.z + oz * 0.5, vx: (R() - 0.5) * 0.6, vy: 1.2 + R() * 1.4, vz: (R() - 0.5) * 0.6, life: 0.8, size: 0.012, stretch: 0.025,
        color: [...L.ember, 1], color1: [L.ember[0] * 0.3, L.ember[1] * 0.1, L.ember[2] * 0.1, 1], frame: FRAME.spark, gravity: -0.3, drag: 0.6 });
      if (R() < 0.35) P?.spawn({ additive: true, x: n.p.x, y: n.p.y + 0.03, z: n.p.z, life: 0.25, size: 2.4 * f, color: [L.flame[0] * 0.12, L.flame[1] * 0.12, L.flame[2] * 0.12, 1], color1: [0, 0, 0, 0], frame: FRAME.glow, mode: 'flat', dir: [0, 1, 0] });
    }
    if (alive && this.light) fx?.lights?.hold(this.key, _a.set(cx / alive, cy / alive + 1, cz / alive), L.light, 10 + alive * 0.8, 9);
    else if (this.t > 0.5 && this.light) fx?.lights?.release(this.key);
    return alive > 0 || this.nodes.some((n) => n.on < 0) && this.t < 8;
  }
  stop() { this.g.fx?.lights?.release(this.key); }
}

// ------------------------------------------------------------------------------------- spirit bodies (GHOST)
// Shapes in 1 m units, beak towards -z, wings along ±x, origin at the shoulders (the ghost shader flaps wing vertices
// about the z axis through the origin). aAnim: x = signed wing weight, y = body / neck wave weight, z = along body.
// aTint (summons.js): per-vertex glaze colour + weight -- the porcelain body stays white, the vermilion beak, red
// crest, teal / vermilion feather plates and the gold edges read as separate materials on one draw.
const NO_TINT = [0, 0, 0, 0];
function anim(g, fn, tint = NO_TINT) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'aTint') g.deleteAttribute(k);
  const p = g.attributes.position, a = new Float32Array(p.count * 4);
  for (let i = 0; i < p.count; i++) { const r = fn(p.getX(i), p.getY(i), p.getZ(i)); a[i * 4] = r[0]; a[i * 4 + 1] = r[1]; a[i * 4 + 2] = r[2]; }
  g.setAttribute('aAnim', new THREE.BufferAttribute(a, 4));
  if (!g.attributes.aTint) {
    const t = new Float32Array(p.count * 4);
    for (let i = 0; i < p.count; i++) { const c = typeof tint === 'function' ? tint(p.getX(i), p.getY(i), p.getZ(i)) : tint; t.set(c, i * 4); }
    g.setAttribute('aTint', new THREE.BufferAttribute(t, 4));
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}
const still = () => [0, 0, 0];
// glaze colours (linear, ≤ 1: the ghost shader lights them like the porcelain) and weights
const T = {
  beak: [0.95, 0.2, 0.05, 1], beakLo: [0.62, 0.1, 0.03, 1], crest: [0.92, 0.07, 0.04, 1], crown: [0.85, 0.05, 0.03, 0.95], gold: [1, 0.68, 0.2, 0.95], eye: [1, 0.8, 0.25, 1],
  teal: [0.06, 0.62, 0.56, 0.85], verm: [0.92, 0.22, 0.07, 0.85], leg: [0.75, 0.5, 0.18, 0.85],
};
const mixT = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
function tubeAlong(pts, r0, r1, radial = 7, seg = 10) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const g = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  // taper: scale each ring about the curve
  const pos = g.attributes.position, P = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const u = i / seg, c = curve.getPointAt(u), r = typeof r0 === 'function' ? r0(u) : r0 + (r1 - r0) * u;
    for (let j = 0; j <= radial; j++) { const k = i * (radial + 1) + j; P.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c); pos.setXYZ(k, P.x, P.y, P.z); }
  }
  g.computeVertexNormals();
  return g;
}
// A leaf / feather blade: root at `root`, running along `dir` for `len`, `wid` wide, the across axis ⟂ dir and
// `up`, a ridge raised by `camber` (so the fresnel rim has something to catch), lens-shaped outline. tint(u, v)
// (u along 0..1, v across -1..1) colours it: enamel in the vane, gold on the edges.
const _lx = new THREE.Vector3(), _ly = new THREE.Vector3(), _lz = new THREE.Vector3();
function leaf(root, dir, up, len, wid, { camber = 0.25, seg = 6, tipW = 0.3, fn = still, tint = null } = {}) {
  const d = _lx.set(...dir).normalize(), ac = _ly.crossVectors(d, _lz.set(...up)).normalize(), n = _lz.crossVectors(ac, d).normalize();
  const P = [], I = [], C = [];
  for (let i = 0; i <= seg; i++) {
    const u = i / seg, hw = wid * 0.5 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 0.96 + 0.04)), 0.6) * (1 - (1 - tipW) * u * u);
    for (const v of [-1, 0, 1]) {
      const c = camber * hw * (1 - v * v);
      P.push(root[0] + d.x * u * len + ac.x * v * hw + n.x * c, root[1] + d.y * u * len + ac.y * v * hw + n.y * c, root[2] + d.z * u * len + ac.z * v * hw + n.z * c);
      C.push(...(tint ? tint(u, v) : NO_TINT));
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < 2; j++) { const a = i * 3 + j, b = a + 3; I.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aTint', new THREE.Float32BufferAttribute(C, 4)); g.setIndex(I); g.computeVertexNormals();
  return anim(g, fn);
}
/** enamel plate with gold edges (v = ±1) and an optional colour run root -> tip */
const plate = (c0, c1 = c0) => (u, v) => (Math.abs(v) > 0.5 ? T.gold : mixT(c0, c1, u));
/**
 * One side of a spirit wing (s = -1 left / +1 right), spread in the heraldic "displayed" pose (the wing surface
 * faces fore and aft, so it reads broad from the caster's view behind the bird): a cambered arm membrane raised
 * from the shoulder to the wrist, a gold leading-edge bone, two rows of covert plates on the arm, a row of
 * secondaries hanging off its lower edge and a fan of long primaries from the wrist, from straight up to out
 * (cloisonné plates: teal / vermilion enamel, gold edges). Flap weight grows to the tips (rotation about z).
 * o: span (wrist x), lift (wrist y), prim (count), primLen, sec (count), ragged (鬼車: torn, uneven primaries), tint.
 */
function wing(s, { span = 0.34, lift = 0.3, prim = 8, primLen = 0.36, sec = 7, ragged = 0, tint = true } = {}) {
  const wf = (x) => [s * Math.min(1, Math.abs(x) / span), 0, 0.3];
  const parts = [];
  // arm membrane: leading edge on top, the chord hanging down (and a little back), bulged forward
  const arm = new THREE.BufferGeometry(), P = [], I = [], cols = 8;
  const lead = (u) => [s * (0.06 + u * (span - 0.06)), 0.06 + u * (lift - 0.06) + Math.sin(Math.PI * u) * 0.04, -0.03 + u * 0.03];
  for (let i = 0; i <= cols; i++) {
    const u = i / cols, [x, y, z] = lead(u), ch = 0.16 - u * 0.08;
    P.push(x, y, z, x + s * 0.01, y - ch, z + 0.05 - Math.sin(Math.PI * u) * 0.025);
  }
  for (let i = 0; i < cols; i++) { const a = i * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  arm.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); arm.setIndex(I); arm.computeVertexNormals();
  parts.push(anim(arm, wf));
  // leading-edge bone (gold: gives the wing a crisp top line)
  parts.push(anim(tubeAlong([lead(0), lead(0.5), lead(1)], 0.02, 0.011, 6, 8), wf, tint ? T.gold : NO_TINT));
  const tA = tint ? T.teal : null, tB = tint ? T.verm : null;
  // coverts: two rows of short broad plates shingled down the arm (teal row over a vermilion row)
  if (tint) for (const [row, c, n] of [[0.035, tA, 6], [0.085, tB, 7]]) {
    for (let k = 0; k < n; k++) {
      const u = 0.08 + 0.84 * k / (n - 1), [x, y, z] = lead(u);
      parts.push(leaf([x, y - row, z - 0.012], [s * 0.2, -1, 0.05], [0, 0, 1], 0.07 + row * 0.5, 0.05, { fn: wf, camber: 0.35, seg: 4, tint: plate(c) }));
    }
  }
  // secondaries: hanging off the lower edge, down and out, a little back (teal -> vermilion tips)
  for (let k = 0; k < sec; k++) {
    const u = 0.1 + 0.84 * k / Math.max(1, sec - 1), [x, y, z] = lead(u), ch = 0.16 - u * 0.08;
    const L = 0.15 + 0.06 * Math.sin(Math.PI * u) - (ragged ? 0.04 * ((k * 7) % 3) / 2 : 0);
    parts.push(leaf([x, y - ch * 0.75, z + 0.04], [s * (0.15 + u * 0.55), -1, 0.22], [0, 0, 1], L, 0.058, { fn: wf, camber: 0.3, tint: tint ? plate(T.teal, T.verm) : null }));
  }
  // primaries: a fan from the wrist, from straight up to out (slightly down), in the wing plane (vermilion, gold edges)
  const [wx, wy, wz] = lead(1);
  for (let k = 0; k < prim; k++) {
    const u = k / Math.max(1, prim - 1), a = 0.12 + u * 1.55;          // angle from vertical towards the outside
    const dir = [s * Math.sin(a), Math.cos(a), 0.12 + u * 0.18];
    const L = primLen * (0.72 + 0.38 * Math.sin(Math.PI * Math.min(1, u * 0.9 + 0.2))) * (ragged ? 0.78 + 0.38 * (((k * 5) % 4) / 3) : 1);
    parts.push(leaf([wx, wy, wz + u * 0.02], dir, [0, 0, 1], L, ragged ? 0.05 : 0.066, { fn: wf, camber: 0.28, tipW: ragged ? 0.6 : 0.3, tint: tint ? plate(k % 2 ? T.verm : T.teal, T.verm) : null }));
  }
  return parts;
}
function tail(n, len, z = 0.3, spread = 0.16, tint = true) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const f = n > 1 ? k / (n - 1) - 0.5 : 0;
    out.push(leaf([f * 0.05, -0.01, z], [f * spread * 2, -0.3 - Math.abs(f) * 0.2, 1], [0, 1, 0], len * (1 - Math.abs(f) * 0.35), 0.065,
      { fn: (x, y, zz) => [0, 0.15, 0.6 + zz], tint: tint ? plate(T.teal, T.verm) : null }));
  }
  return out;
}
function body(rMax = 0.14) {
  // a bird's body, not a bottle: full breast forward, the back flat, tapering into the tail
  const pts = [[0, -0.21], [0.07, -0.19], [rMax * 0.86, -0.12], [rMax, -0.02], [rMax * 0.95, 0.08], [rMax * 0.76, 0.18], [rMax * 0.45, 0.28], [rMax * 0.18, 0.35], [0, 0.38]].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, 14).rotateX(Math.PI / 2).scale(1, 0.84, 1).rotateX(-0.12).translate(0, -0.03, 0);
  return anim(g, (x, y, z) => [0, 0.1, 0.4 + z]);
}
function leg(tint = true) {
  const tl = tint ? T.leg : NO_TINT, tg = tint ? T.gold : NO_TINT;
  // thigh (porcelain) into a gold-ringed knee, the shank and the three-toed foot in gold
  const parts = [anim(tubeAlong([[0, -0.08, 0.05], [0, -0.2, 0.08], [0, -0.33, 0.09]], 0.034, 0.02, 7, 6), still)];
  parts.push(anim(new THREE.SphereGeometry(0.028, 10, 6).translate(0, -0.33, 0.09), still, tg));
  parts.push(anim(tubeAlong([[0, -0.33, 0.09], [0, -0.47, 0.065], [0, -0.6, 0.03]], 0.018, 0.014, 6, 6), still, tl));
  for (const a of [-0.55, 0, 0.55, Math.PI]) {
    const L = a === Math.PI ? 0.07 : 0.13;
    parts.push(anim(new THREE.ConeGeometry(0.012, L, 6).rotateX(-Math.PI / 2).translate(0, 0, -L / 2).rotateY(a).translate(0, -0.612, 0.03), still, tg));
  }
  return parts;
}

let craneCache = null;
/**
 * 畢方 GHOST (≤ 3k tris): a one-legged crane with a full body, a long S-neck, a red-crowned head, a long vermilion
 * beak (two mandibles), a crest of red plumes, gold eyes; broad wings in the displayed pose (gold leading edge,
 * teal / vermilion covert rows, secondaries, a fan of primaries); a fan of tail plumes; one leg with a gold knee,
 * shank and three toes (+ the hind toe). 1 unit ≈ 1 m at size 1: span ≈ 1.2, standing height ≈ 1.2 (feet 0.62
 * below the shoulders). The light-wing cards attach at the wrists (CRANE_WRIST) at runtime.
 */
export const CRANE_WRIST = [0.34, 0.34, 0];
export function craneGeo() {
  if (craneCache) return craneCache;
  const parts = [body(0.15)];
  // S-neck: thick at the breast, slim under the head
  parts.push(anim(tubeAlong([[0, 0.02, -0.14], [0, 0.17, -0.22], [0, 0.32, -0.15], [0, 0.46, -0.16], [0, 0.56, -0.23]], (u) => 0.062 - 0.03 * u, 0, 9, 16), (x, y) => [0, 0.25 + y, 0]));
  // head, its red crown, gold eyes
  parts.push(anim(new THREE.SphereGeometry(0.058, 12, 9).scale(0.82, 0.8, 1.3).translate(0, 0.585, -0.27), still));
  parts.push(anim(new THREE.SphereGeometry(0.05, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.42).scale(0.84, 0.7, 1.05).translate(0, 0.6, -0.27), still, T.crown));
  for (const sx of [-1, 1]) parts.push(anim(new THREE.SphereGeometry(0.012, 8, 6).translate(sx * 0.043, 0.6, -0.3), still, T.eye));
  // the long beak: upper mandible (vermilion) over a slimmer lower one, the tip turned a touch down
  parts.push(anim(new THREE.ConeGeometry(0.024, 0.3, 10).scale(0.85, 1, 1).rotateX(-Math.PI / 2 - 0.08).translate(0, 0.586, -0.47), still, T.beak));
  parts.push(anim(new THREE.ConeGeometry(0.017, 0.26, 8).scale(0.85, 1, 0.8).rotateX(-Math.PI / 2 + 0.04).translate(0, 0.57, -0.45), still, T.beakLo));
  // crest: four red plumes swept up and back off the crown, gold quills
  for (const [x, l, t] of [[0, 0.2, 0.8], [-0.024, 0.15, 0.6], [0.024, 0.15, 0.6], [0, 0.12, 0.35]]) {
    parts.push(leaf([x, 0.62, -0.25], [x * 3, t, 1 - t * 0.35], [1, 0, 0], l, 0.042, { camber: 0.4, tipW: 0.15, tint: (u, v) => (u < 0.18 ? T.gold : T.crest) }));
  }
  parts.push(...wing(-1), ...wing(1));
  parts.push(...tail(7, 0.46, 0.32, 0.2));
  parts.push(...leg());
  craneCache = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  craneCache.computeBoundingBox();
  return craneCache;
}

let nineCache = null;
/** 鬼車 GHOST: a heavy night bird, nine heads on swaying necks fanned in front, ragged wings, a long tail (a dark
 *  silhouette: only the eyes and the beaks are tinted, violet / cold teal). */
export function nineHeadGeo() {
  if (nineCache) return nineCache;
  const eye = [0.75, 0.3, 1, 1], beak = [0.25, 0.85, 0.8, 0.7];
  const parts = [body(0.16)];
  for (let i = 0; i < 9; i++) {
    const a = (i / 8 - 0.5) * 2.2, len = i === 4 ? 0.38 : 0.27 + 0.04 * Math.cos(a);
    const ex = Math.sin(a) * len, ey = 0.12 + Math.cos(a) * len * 0.55, ez = -0.14 - Math.cos(a) * len * 0.55;
    const fn = () => [0, 1, i / 8];
    parts.push(anim(tubeAlong([[0, 0.03, -0.1], [ex * 0.45, ey * 0.7, -0.18], [ex, ey, ez]], 0.034, 0.016, 6, 8), (x) => [0, 0.6 + Math.abs(x), i / 8]));
    parts.push(anim(new THREE.SphereGeometry(0.5, 8, 6).scale(i === 4 ? 0.06 : 0.045, i === 4 ? 0.05 : 0.04, i === 4 ? 0.085 : 0.065).translate(ex, ey, ez - 0.03), fn));
    for (const sx of [-1, 1]) parts.push(anim(new THREE.SphereGeometry(i === 4 ? 0.011 : 0.008, 6, 4).translate(ex + sx * (i === 4 ? 0.04 : 0.03), ey + 0.01, ez - 0.05), fn, eye));
    // hooked beak
    parts.push(anim(new THREE.ConeGeometry(0.013, 0.07, 5).rotateX(-Math.PI / 2 - 0.5).translate(ex, ey - 0.012, ez - 0.09), fn, beak));
  }
  const W = { span: 0.38, lift: 0.26, prim: 9, primLen: 0.4, sec: 8, ragged: 1, tint: false };
  parts.push(...wing(-1, W), ...wing(1, W));
  parts.push(...tail(7, 0.5, 0.32, 0.22, false));
  parts.push(...leg(false));
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
