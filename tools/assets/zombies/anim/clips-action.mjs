// One-shot action clips: attacks, bite, hit reactions, stagger, scream, spit (keyframed on top of
// the breathing idle), knockdown / get_up / deaths (mocap + keys), leap, climb, eat, crawl.
import * as THREE from 'three';
import { proc, fingerCurl, noise, applyOffsets, DEG } from './pose.mjs';
import { sample, retime, crop, concat, smooth, fixSigns, blendPose } from './clip.mjs';
import { clonePose } from './skeleton.mjs';
import { zombify } from './zombify.mjs';
import { buildLate } from './clips-late.mjs';
import { fromUAL, fromCMU } from './lib.mjs';
import { groundFeet, clampFeetAboveGround } from './ik.mjs';
import { blendIn, blendOut } from './clips-late.mjs';

const SIDED = new Set(['clavicle', 'upperarm', 'lowerarm', 'hand', 'thigh', 'calf', 'foot', 'ball']);
const SWAP = { footL: 'footR', footR: 'footL', handL: 'handR', handR: 'handL', plantL: 'plantR', plantR: 'plantL' };

/** Mirrors a key list left <-> right (for symmetric reaction pairs on an asymmetric base). */
export function mirrorKeys(keys) {
  return keys.map((k) => {
    const o = {};
    for (const [n, v] of Object.entries(k)) {
      if (n === 't' || !Array.isArray(v)) { o[n] = v; continue; }
      if (n === 'root') { o.root = [-v[0], v[1], v[2]]; continue; }
      if (SWAP[n]) { o[SWAP[n]] = n.startsWith('plant') ? v : [-v[0], v[1], v[2]]; continue; }
      if (/_l$/.test(n)) { o[n.replace(/_l$/, '_r')] = v; continue; }
      if (/_r$/.test(n)) { o[n.replace(/_r$/, '_l')] = v; continue; }
      if (SIDED.has(n) || /^(thumb|index|middle|ring|pinky)_0\d$/.test(n)) { o[n] = v; continue; }
      o[n] = [v[0], -v[1], -v[2]];
    }
    return o;
  });
}

/** Scales every rotation / root offset of a key list (stronger or softer variant of the same motion). */
export const scaleKeys = (keys, k) => keys.map((key) => Object.fromEntries(Object.entries(key).map(([n, v]) => [n, Array.isArray(v) && !/^(plant|ik)/.test(n) ? v.map((x) => x * k) : v])));

/** Layer: extra finger curl following an envelope fn(t) (degrees). */
const clawLayer = (env, side = 'both') => (t, pose, { skel }) => {
  const a = env(t);
  if (a) fingerCurl(skel, pose, side, a, { thumb: a * 0.5 });
};
/** Envelope helper: piecewise-linear through [t, v] points with smoothstep easing. */
export const env = (pts) => (t) => {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [t0, v0] = pts[i], [t1, v1] = pts[i + 1];
    if (t <= t1) return v0 + (v1 - v0) * smooth((t - t0) / (t1 - t0));
  }
  return pts[pts.length - 1][1];
};
/** Layer: high-frequency shake on the listed bones while env(t) > 0. */
const shakeLayer = (bones, amp, hz, envFn, seed = 1) => (t, pose, { skel }) => {
  const e = envFn(t);
  if (!e) return;
  const off = {};
  bones.forEach((b, i) => { off[b] = [noise(t * hz, seed + i) * amp * e, noise(t * hz, seed + 10 + i) * amp * e, noise(t * hz, seed + 20 + i) * amp * 0.6 * e]; });
  applyOffsets(skel, pose, off);
};

export function buildActions(skel, only, loco) {
  const idle = loco.idle;
  const base = (t) => sample(idle, t * idle.fps);
  const P = { l: true, r: true };
  const A = (name, dur, keys, extra = {}) => proc(skel, { name, dur, keys, base, plant: P, ...extra });
  const out = {};

  // ------------------------------------------------------------------ attack_a: Quaternius scratch
  {
    const c = fromUAL(skel, 2, 'Zombie_Scratch', { name: 'attack_a' });
    // align with our idle: pelvis start over the origin
    const r0 = c.poses[0].root.clone();
    for (const p of c.poses) { p.root.x -= r0.x; p.root.z -= r0.z; }
    zombify(skel, c, { slump: 2, headTilt: 8, claw: 30, twitch: 0.4, seed: 21 });
    // ground on the standing start, keep the feet out of the floor, start/end on our idle
    groundFeet(skel, c, { pct: 0 });
    clampFeetAboveGround(skel, c);
    blendIn(c, base, 0.2);
    blendOut(c, base, 0.3);
    c.meta.events = { hit: hitTime(skel, c, 'r') };
    c.meta.notes = 'Quaternius UAL2 Zombie_Scratch: right-arm overhead rake with a lurch forward';
    out.attack_a = c;
  }

  // ------------------------------------------------------------------ attack_b: two-arm overhead swipe
  out.attack_b = A('attack_b', 1.5, [
    { t: 0 },
    { t: 0.3, spine_01: [-8, 4, 0], spine_02: [-12, 6, 0], spine_03: [-10, 4, 0], neck_01: [-6, 0, 0], head: [-14, 0, 0], clavicle: [0, 0, 14], upperarm: [-150, 0, 6], lowerarm: [-55, 0, 0], hand: [-25, 0, 0], root: [0, -0.04, -0.06], footR: [0, 0.07, 0.08] },
    { t: 0.38, footR: [0, 0.03, 0.2] },
    { t: 0.46, spine_01: [3, -4, 0], spine_02: [5, -6, 0], spine_03: [4, -4, 0], neck_01: [2, 0, 0], head: [-4, 0, 0], clavicle: [0, 0, -4], upperarm: [-62, 0, -22], lowerarm: [-12, 0, 0], hand: [10, 0, 0], root: [0, -0.09, 0.1], footR: [0, 0, 0.26] },
    { t: 0.58, spine_01: [5, -6, 0], spine_02: [7, -8, 0], spine_03: [6, -6, 0], upperarm: [0, 0, -32], lowerarm: [-24, 0, 0], hand: [20, 0, 0], root: [0, -0.11, 0.12] },
    { t: 0.9, spine_01: [4, -2, 0], spine_02: [5, -3, 0], spine_03: [4, 0, 0], neck_01: [2, 0, 0], head: [2, 0, 6], clavicle: [0, 0, 0], upperarm: [-2, 0, -14], lowerarm: [-14, 0, 0], hand: [0, 0, 0], root: [0, -0.07, 0.09] },
    { t: 1.15, root: [0, -0.04, 0.05], footR: [0, 0.06, 0.13] },
    { t: 1.3, footR: [0, 0, 0] },
    { t: 1.5, spine_01: [0, 0, 0], spine_02: [0, 0, 0], spine_03: [0, 0, 0], neck_01: [0, 0, 0], head: [0, 0, 0], upperarm: [0, 0, 0], lowerarm: [0, 0, 0], hand: [0, 0, 0], root: [0, 0, 0] },
  ], { layers: [clawLayer(env([[0, 0], [0.3, 25], [0.46, 10], [0.6, 45], [1.2, 0]]))] });
  out.attack_b.meta.events = { hit: 0.48 };
  out.attack_b.meta.notes = 'keyframed: both arms rise overhead, step in with the right foot, double rake down and across';

  // ------------------------------------------------------------------ attack_lunge
  out.attack_lunge = A('attack_lunge', 1.8, [
    { t: 0 },
    { t: 0.3, root: [0, -0.17, -0.07], spine_01: [6, 0, 0], spine_02: [8, 0, 0], spine_03: [6, 0, 0], neck_01: [-8, 0, 0], head: [-18, 0, 0], upperarm: [22, 0, 6], lowerarm: [-35, 0, 0], clavicle: [0, 0, 6] },
    { t: 0.38, root: [0, -0.02, 0.06], spine_01: [-4, 0, 0], spine_02: [-8, 0, 0], spine_03: [-6, 0, 0], head: [-16, 0, 0], upperarm: [-55, 0, -4], lowerarm: [-15, 0, 0], footL: [0, 0.02, -0.04], footR: [0, 0.02, -0.02] },
    { t: 0.5, root: [0, 0.0, 0.16], spine_01: [-6, 0, 0], spine_02: [-10, 0, 0], spine_03: [-8, 0, 0], neck_01: [-8, 0, 0], head: [-14, 0, 0], upperarm: [-72, 0, -12], lowerarm: [-4, 0, 0], hand: [-12, 0, 0], footL: [0, 0.2, -0.18], footR: [0, 0.16, 0.1], plantL: [1, 0, 0] },
    { t: 0.62, root: [0, -0.14, 0.26], spine_01: [0, 0, 0], spine_02: [2, 0, 0], spine_03: [0, 0, 0], upperarm: [-68, 0, -14], footR: [0, 0, 0.36], footL: [0, 0.1, -0.12] },
    { t: 0.72, upperarm: [-62, 0, -22], lowerarm: [-40, 0, 0], hand: [10, 0, 0], footL: [0, 0, -0.02] },
    { t: 1.0, root: [0, -0.1, 0.2], upperarm: [-40, 0, -12], lowerarm: [-90, 0, 0], spine_01: [2, 0, 0], spine_02: [3, 0, 0], spine_03: [2, 0, 0], neck_01: [6, 0, 0], head: [6, 12, 10] },
    { t: 1.35, root: [0, -0.04, 0.08], footR: [0, 0.06, 0.15], upperarm: [-20, 0, -6], lowerarm: [-40, 0, 0] },
    { t: 1.5, footR: [0, 0, 0] },
    { t: 1.8, root: [0, 0, 0], footL: [0, 0, 0], spine_01: [0, 0, 0], spine_02: [0, 0, 0], spine_03: [0, 0, 0], neck_01: [0, 0, 0], head: [0, 0, 0], upperarm: [0, 0, 0], lowerarm: [0, 0, 0], hand: [0, 0, 0], clavicle: [0, 0, 0] },
  ], { layers: [clawLayer(env([[0, 0], [0.5, -10], [0.68, 10], [0.75, 70], [1.3, 50], [1.8, 0]]))] });
  out.attack_lunge.meta.events = { launch: 0.36, land: 0.62, hit: 0.72 };
  out.attack_lunge.meta.travel = 1.0;
  out.attack_lunge.meta.notes = 'keyframed pounce: crouch, spring, land on the right foot with both arms grabbing. In place: move the zombie forward up to `travel` m between launch and land';

  // ------------------------------------------------------------------ bite (grab + bite + tear)
  out.bite = A('bite', 1.8, [
    // (keys are cumulative: a channel not named in a key holds its value there - so the foot step keys
    // also name the hands, otherwise the hands would pause and then snap)
    { t: 0, ikL: [0, 0, 0], ikR: [0, 0, 0], handL: [0.2, 1.0, 0.3], handR: [-0.22, 1.0, 0.3] },
    { t: 0.28, ikL: [1, 0, 0], ikR: [1, 0, 0], handL: [0.22, 1.12, 0.64], handR: [-0.24, 1.1, 0.62], upperarm_l: [-68, 0, -26], upperarm_r: [-50, 0, -62], lowerarm: [-40, 0, 0], spine_01: [-8, 0, 0], spine_02: [-12, 0, 0], spine_03: [-8, 0, 0], root: [0, -0.03, 0.06], head: [-14, 0, 0], footR: [0, 0.05, 0.08] },
    { t: 0.48, handL: [0.2, 1.1, 0.48], handR: [-0.22, 1.08, 0.46], upperarm_l: [-52, 0, -30], upperarm_r: [-38, 0, -64], lowerarm: [-100, 0, 0], spine_01: [-5, 0, 0], spine_02: [-8, 0, 0], spine_03: [-5, 0, 0], neck_01: [-12, 0, 0], head: [-24, 0, 0], root: [0, -0.05, 0.08], footR: [0, 0, 0.14] },
    { t: 0.64, handL: [0.19, 1.04, 0.5], handR: [-0.21, 1.02, 0.48], neck_01: [18, 0, 0], head: [20, 0, 8], spine_01: [0, 0, 0], spine_02: [2, 0, 0], spine_03: [2, 0, 0], root: [0, -0.07, 0.11] },
    { t: 0.8, neck_01: [16, 10, 0], head: [16, 24, 12] },
    { t: 0.95, neck_01: [16, -8, 0], head: [20, -20, 2] },
    { t: 1.1, neck_01: [12, 6, 0], head: [12, 18, 10] },
    { t: 1.32, ikL: [1, 0, 0], ikR: [1, 0, 0], handL: [0.21, 1.08, 0.52], handR: [-0.23, 1.06, 0.5], neck_01: [-8, 0, 0], head: [-14, 0, 6], spine_01: [-3, 0, 0], spine_02: [-4, 0, 0], spine_03: [-3, 0, 0], upperarm_l: [-45, 0, -24], upperarm_r: [-32, 0, -50], lowerarm: [-70, 0, 0], root: [0, -0.04, 0.08] },
    { t: 1.52, ikL: [0.45, 0, 0], ikR: [0.45, 0, 0], handL: [0.21, 1.0, 0.42], handR: [-0.23, 0.98, 0.4], neck_01: [-3, 0, 0], head: [-6, 0, 3], spine_01: [-1, 0, 0], spine_02: [-2, 0, 0], spine_03: [-1, 0, 0], upperarm_l: [-22, 0, -12], upperarm_r: [-16, 0, -25], lowerarm: [-35, 0, 0], root: [0, -0.02, 0.04], footR: [0, 0.05, 0.06] },
    { t: 1.66, footR: [0, 0, 0], ikL: [0.1, 0, 0], ikR: [0.1, 0, 0], handL: [0.2, 0.95, 0.35], handR: [-0.22, 0.95, 0.33], neck_01: [-1, 0, 0], head: [-2, 0, 1], upperarm_l: [-6, 0, -3], upperarm_r: [-5, 0, -6], lowerarm: [-10, 0, 0], root: [0, -0.01, 0.01] },
    { t: 1.8, neck_01: [0, 0, 0], head: [0, 0, 0], spine_01: [0, 0, 0], spine_02: [0, 0, 0], spine_03: [0, 0, 0], upperarm_l: [0, 0, 0], upperarm_r: [0, 0, 0], lowerarm: [0, 0, 0], root: [0, 0, 0], ikL: [0, 0, 0], ikR: [0, 0, 0] },
  ], { layers: [clawLayer(env([[0, 0], [0.25, 15], [0.38, 65], [1.35, 60], [1.7, 0]])), shakeLayer(['head', 'neck_01'], 5, 12, env([[0.6, 0], [0.7, 1], [1.2, 1], [1.3, 0]]), 4)] });
  out.bite.meta.events = { grab: 0.3, hit: 0.62 };
  out.bite.meta.notes = 'keyframed: grab with both hands, pull in, bite and tear (head shakes)';

  // ------------------------------------------------------------------ hit reactions
  const hitFront = [
    { t: 0 },
    { t: 0.07, spine_01: [-6, 0, 0], spine_02: [-11, 0, 0], spine_03: [-9, 0, 0], neck_01: [-8, 0, 0], head: [-20, 0, 6], clavicle: [0, 0, 8], upperarm: [14, 0, 16], lowerarm: [-18, 0, 0], root: [0, -0.02, -0.07] },
    { t: 0.2, spine_01: [-3, 0, 0], spine_02: [-6, 0, 0], spine_03: [-4, 0, 0], neck_01: [-1, 0, 0], head: [8, 0, -4], upperarm: [6, 0, 8], lowerarm: [-8, 0, 0], root: [0, -0.04, -0.05] },
    { t: 0.38, spine_01: [3, 0, 0], spine_02: [4, 0, 0], spine_03: [3, 0, 0], neck_01: [3, 0, 0], head: [10, 0, 2], clavicle: [0, 0, 0], upperarm: [-4, 0, 2], lowerarm: [0, 0, 0], root: [0, -0.03, -0.01] },
    { t: 0.7, spine_01: [0, 0, 0], spine_02: [0, 0, 0], spine_03: [0, 0, 0], neck_01: [0, 0, 0], head: [0, 0, 0], upperarm: [0, 0, 0], root: [0, 0, 0] },
  ];
  out.hit_front = A('hit_front', 0.7, scaleKeys(hitFront, 1.35));
  out.hit_back = A('hit_back', 0.7, scaleKeys([
    { t: 0 },
    { t: 0.07, spine_01: [7, 0, 0], spine_02: [12, 0, 0], spine_03: [9, 0, 0], neck_01: [10, 0, 0], head: [16, 0, -4], clavicle: [0, 0, 6], upperarm: [-24, 0, 6], lowerarm: [-12, 0, 0], root: [0, -0.03, 0.07] },
    { t: 0.2, spine_01: [4, 0, 0], spine_02: [7, 0, 0], spine_03: [5, 0, 0], neck_01: [-2, 0, 0], head: [-12, 0, 4], upperarm: [-10, 0, 4], root: [0, -0.04, 0.05] },
    { t: 0.38, spine_01: [-2, 0, 0], spine_02: [-3, 0, 0], spine_03: [-2, 0, 0], neck_01: [-3, 0, 0], head: [-6, 0, 0], clavicle: [0, 0, 0], upperarm: [4, 0, 0], lowerarm: [0, 0, 0], root: [0, -0.02, 0.01] },
    { t: 0.7, spine_01: [0, 0, 0], spine_02: [0, 0, 0], spine_03: [0, 0, 0], neck_01: [0, 0, 0], head: [0, 0, 0], upperarm: [0, 0, 0], root: [0, 0, 0] },
  ], 1.3));
  // impact from the character's left (+X) pushes the body to its right
  const hitLeft = [
    { t: 0 },
    { t: 0.07, spine_01: [0, -6, 6], spine_02: [-2, -10, 9], spine_03: [0, -8, 7], neck_01: [0, -6, 8], head: [-6, -18, 16], clavicle_l: [0, 0, 14], upperarm_l: [-10, 0, 26], lowerarm_l: [-25, 0, 0], upperarm_r: [-6, 0, -10], root: [-0.07, -0.03, 0] },
    { t: 0.2, spine_01: [0, -3, 3], spine_02: [0, -5, 4], spine_03: [0, -4, 3], neck_01: [0, -2, -2], head: [4, 6, -8], upperarm_l: [-4, 0, 12], lowerarm_l: [-10, 0, 0], upperarm_r: [-2, 0, -4], root: [-0.06, -0.04, 0] },
    { t: 0.4, spine_01: [0, 1, -2], spine_02: [0, 2, -3], spine_03: [0, 1, -2], neck_01: [0, 0, 0], head: [2, 2, -3], clavicle_l: [0, 0, 0], upperarm_l: [0, 0, -2], lowerarm_l: [0, 0, 0], upperarm_r: [0, 0, 2], root: [-0.02, -0.02, 0] },
    { t: 0.7, spine_01: [0, 0, 0], spine_02: [0, 0, 0], spine_03: [0, 0, 0], neck_01: [0, 0, 0], head: [0, 0, 0], upperarm_l: [0, 0, 0], upperarm_r: [0, 0, 0], root: [0, 0, 0] },
  ];
  out.hit_left = A('hit_left', 0.7, scaleKeys(hitLeft, 1.3));
  out.hit_right = A('hit_right', 0.7, scaleKeys(mirrorKeys(hitLeft), 1.3));
  for (const k of ['hit_front', 'hit_back', 'hit_left', 'hit_right']) out[k].meta.notes = 'keyframed flinch on the breathing idle; starts and ends on idle (also usable additively)';
  out.hit_front.meta.notes += '; impact from the front pushes the torso back';
  out.hit_left.meta.notes += "; impact on the character's left side";

  // ------------------------------------------------------------------ stagger (stumble back two steps, lurch forward)
  out.stagger = A('stagger', 1.6, [
    { t: 0 },
    { t: 0.08, spine_01: [-8, 0, 0], spine_02: [-12, 0, 0], spine_03: [-10, 0, 0], neck_01: [-8, 0, 0], head: [-22, 0, 8], upperarm: [-30, 0, 34], lowerarm: [-30, 0, 0], clavicle: [0, 0, 10], root: [0, -0.02, -0.08] },
    { t: 0.24, footR: [0, 0.1, -0.16], root: [0, -0.05, -0.16], spine_01: [-6, 0, 0], spine_02: [-8, 0, 0], spine_03: [-6, 0, 0], head: [-10, 0, 4] },
    { t: 0.38, footR: [0, 0, -0.34], root: [0, -0.08, -0.24] },
    { t: 0.5, footL: [0, 0.09, -0.2], root: [0, -0.09, -0.3], spine_01: [2, 0, 0], spine_02: [4, 0, 0], spine_03: [2, 0, 0], upperarm: [-22, 0, 40], lowerarm: [-40, 0, 0], head: [0, 0, 4] },
    { t: 0.64, footL: [0, 0, -0.3], root: [0, -0.08, -0.32], spine_01: [8, 0, 0], spine_02: [10, 0, 0], spine_03: [8, 0, 0], upperarm: [-45, 0, 28], lowerarm: [-30, 0, 0], head: [6, 0, 2] },
    { t: 0.9, root: [0, -0.06, -0.28], spine_01: [6, 0, 0], spine_02: [8, 0, 0], spine_03: [6, 0, 0], upperarm: [-14, 0, 14], lowerarm: [-12, 0, 0], clavicle: [0, 0, 2], head: [4, 0, 0] },
    { t: 1.08, footR: [0, 0.08, -0.16], root: [0, -0.05, -0.17] },
    { t: 1.22, footR: [0, 0, 0], root: [0, -0.04, -0.1] },
    { t: 1.34, footL: [0, 0.07, -0.13], root: [0, -0.02, -0.05] },
    { t: 1.46, footL: [0, 0, 0] },
    { t: 1.6, root: [0, 0, 0], spine_01: [0, 0, 0], spine_02: [0, 0, 0], spine_03: [0, 0, 0], neck_01: [0, 0, 0], head: [0, 0, 0], upperarm: [0, 0, 0], lowerarm: [0, 0, 0], clavicle: [0, 0, 0] },
  ]);
  out.stagger.meta.notes = 'keyframed heavy-hit stumble: two steps back with flailing arms, then lurches back to the start spot';

  // ------------------------------------------------------------------ scream
  out.scream = A('scream', 2.2, [
    { t: 0 },
    { t: 0.38, spine_01: [-4, 0, 0], spine_02: [-8, 0, 0], spine_03: [-10, 0, 0], neck_01: [-10, 0, 0], head: [-18, 0, 0], clavicle: [0, 0, 10], upperarm: [10, 0, 22], lowerarm: [-25, 0, 0], root: [0, 0.01, -0.04] },
    { t: 0.56, spine_01: [-8, 0, 0], spine_02: [-12, 0, 0], spine_03: [-12, 0, 0], neck_01: [-14, 0, 0], head: [-30, 0, 0], clavicle: [0, 0, 14], upperarm: [8, 0, 46], lowerarm: [-42, 0, 0], hand: [-30, 0, 0], root: [0, -0.09, 0.01] },
    { t: 1.5, spine_01: [-7, 0, 0], spine_02: [-10, 0, 0], spine_03: [-11, 0, 0], neck_01: [-12, 0, 0], head: [-26, 0, 0], upperarm: [10, 0, 42], lowerarm: [-46, 0, 0], root: [0, -0.1, 0.02] },
    { t: 1.85, spine_01: [3, 0, 0], spine_02: [4, 0, 0], spine_03: [3, 0, 0], neck_01: [4, 0, 0], head: [8, 0, 4], clavicle: [0, 0, 0], upperarm: [0, 0, 8], lowerarm: [-10, 0, 0], hand: [0, 0, 0], root: [0, -0.04, 0] },
    { t: 2.2, spine_01: [0, 0, 0], spine_02: [0, 0, 0], spine_03: [0, 0, 0], neck_01: [0, 0, 0], head: [0, 0, 0], upperarm: [0, 0, 0], lowerarm: [0, 0, 0], root: [0, 0, 0] },
  ], { layers: [clawLayer(env([[0, 0], [0.5, 55], [1.6, 55], [2.0, 0]])), shakeLayer(['spine_03', 'neck_01', 'head', 'upperarm_l', 'upperarm_r'], 3.5, 16, env([[0.5, 0], [0.62, 1], [1.5, 1], [1.7, 0]]), 7)] });
  out.scream.meta.events = { scream: 0.5 };
  out.scream.meta.notes = 'keyframed: rear back, chest out, head up, arms spread with clawed hands, trembling';

  // ------------------------------------------------------------------ spit
  out.spit = A('spit', 1.4, [
    { t: 0 },
    { t: 0.4, spine_01: [-9, 0, 0], spine_02: [-14, 0, 0], spine_03: [-12, 0, 0], neck_01: [-12, 0, 0], head: [-22, 0, 0], clavicle: [0, 0, 8], upperarm: [16, 0, 16], lowerarm: [-22, 0, 0], root: [0, 0.02, -0.07] },
    { t: 0.52, spine_01: [1, 0, 0], spine_02: [3, 0, 0], spine_03: [3, 0, 0], neck_01: [8, 0, 0], head: [-6, 0, 0], upperarm: [26, 0, 24], lowerarm: [-12, 0, 0], root: [0, -0.06, 0.08] },
    { t: 0.62, neck_01: [12, 0, 0], head: [0, 0, 0] },
    { t: 0.9, spine_01: [3, 0, 0], spine_02: [4, 0, 0], spine_03: [3, 0, 0], neck_01: [6, 0, 0], head: [6, 0, 4], clavicle: [0, 0, 0], upperarm: [6, 0, 8], lowerarm: [-8, 0, 0], root: [0, -0.04, 0.05] },
    { t: 1.4, spine_01: [0, 0, 0], spine_02: [0, 0, 0], spine_03: [0, 0, 0], neck_01: [0, 0, 0], head: [0, 0, 0], upperarm: [0, 0, 0], lowerarm: [0, 0, 0], root: [0, 0, 0] },
  ], { layers: [shakeLayer(['neck_01', 'head'], 4, 10, env([[0.15, 0], [0.25, 1], [0.38, 0.6], [0.45, 0]]), 3)] });
  out.spit.meta.events = { spit: 0.55 };
  out.spit.meta.notes = 'keyframed: gather (retching), rear back, whip the torso and head forward to spit; projectile at events.spit from the head';

  Object.assign(out, buildLate(skel, only, loco, { base, A, env, clawLayer, shakeLayer, mirrorKeys }));
  return out;
}

/** Time (s) of the fastest forward hand motion: the impact moment of a swipe. */
export function hitTime(skel, c, side) {
  const h = skel.i(`hand_${side}`);
  let best = 0, bv = -1;
  let prev = skel.fk(c.poses[0]).wp[h];
  for (let f = 1; f < c.poses.length; f++) {
    const p = skel.fk(c.poses[f]).wp[h];
    const v = p.distanceTo(prev);
    if (v > bv) { bv = v; best = f; }
    prev = p;
  }
  return +(best / c.fps).toFixed(3);
}
