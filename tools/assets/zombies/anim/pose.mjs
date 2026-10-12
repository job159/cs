// Procedural / keyframed animation authoring on the target skeleton.
//
// Offsets are rotations in DEGREES given as [x, y, z] about the character axes (X = character's
// left, Y = up, Z = forward) *as seen from the parent bone* (i.e. the parent's rest orientation),
// applied in Y (twist) -> X (pitch) -> Z (roll) order:
//   x > 0 tips the bone's far end forward-down for upward bones (spine bends forward, head nods)
//        and swings hanging limbs BACKWARD (thigh extension, arm swings back; calf bends the knee)
//   y > 0 turns towards the character's left
//   z > 0 for a left limb moves it outward (abduction); for the spine leans to the right
// Keys for `_r` bones use the same LEFT-side convention and are mirrored (y, z negated), and a key
// without a side suffix (`upperarm`) applies symmetrically to both sides.
import * as THREE from 'three';
import { clonePose } from './skeleton.mjs';
import { twoBoneIK, LEG, ARM, kneePole } from './ik.mjs';

export const DEG = Math.PI / 180;
const _e = new THREE.Euler();

const SIDED = new Set(['clavicle', 'upperarm', 'lowerarm', 'hand', 'thigh', 'calf', 'foot', 'ball',
  'thumb_01', 'thumb_02', 'thumb_03', 'index_01', 'index_02', 'index_03', 'middle_01', 'middle_02', 'middle_03',
  'ring_01', 'ring_02', 'ring_03', 'pinky_01', 'pinky_02', 'pinky_03']);

/** Expands symmetric keys and mirrors `_r` values. Returns Map<boneName, [x, y, z]> (degrees). */
export function expand(offsets) {
  const out = new Map();
  const add = (name, v) => {
    const cur = out.get(name);
    out.set(name, cur ? [cur[0] + v[0], cur[1] + v[1], cur[2] + v[2]] : [...v]);
  };
  for (const [k, v] of Object.entries(offsets || {})) {
    if (!Array.isArray(v) || k === 'root' || /^ik|^foot[LR]$|^hand[LR]$/.test(k)) continue;
    if (SIDED.has(k)) { add(`${k}_l`, v); add(`${k}_r`, [v[0], -v[1], -v[2]]); }
    else if (k.endsWith('_r')) add(k, [v[0], -v[1], -v[2]]);
    else add(k, v);
  }
  return out;
}

/** Rotation (quaternion) for an offset triplet in degrees, world-axis convention. */
export function offsetQ(v) {
  _e.set(v[0] * DEG, v[1] * DEG, v[2] * DEG, 'ZXY');
  return new THREE.Quaternion().setFromEuler(_e);
}

/** Applies offsets (Map or object) to a pose in place: q(b) = (W(p)^-1 D W(p)) q(b). */
export function applyOffsets(skel, pose, offsets, weight = 1) {
  const m = offsets instanceof Map ? offsets : expand(offsets);
  for (const [name, v] of m) {
    const i = skel.index.get(name);
    if (i === undefined) throw new Error('offset for unknown bone ' + name);
    const D = offsetQ(weight === 1 ? v : v.map((x) => x * weight));
    const p = skel.parent[i];
    const Wp = p < 0 ? new THREE.Quaternion() : skel.restWorldQ[p];
    const A = Wp.clone().invert().multiply(D).multiply(Wp);
    pose.q[i].premultiply(A);
  }
  const r = offsets instanceof Map ? null : offsets?.root;
  if (r) pose.root.add(new THREE.Vector3(r[0], r[1], r[2]).multiplyScalar(weight));
  return pose;
}

/** Rotation in WORLD axes applied to a bone's current world rotation (keeps children following). */
export function rotateWorld(skel, pose, name, v, fk = null) {
  const i = skel.i(name);
  const f = fk || skel.fk(pose);
  const D = offsetQ(v);
  const p = skel.parent[i];
  const G = D.multiply(f.wq[i]);
  pose.q[i] = p < 0 ? G : f.wq[p].clone().invert().multiply(G);
  return pose;
}

// ------------------------------------------------------------------------------- interpolation

/** Catmull-Rom (centripetal-free, uniform in time) through keyed values; cyclic when loop. */
function spline(times, vals, t, loop, period) {
  const n = times.length;
  if (n === 1) return vals[0];
  if (!loop) {
    if (t <= times[0]) return vals[0];
    if (t >= times[n - 1]) return vals[n - 1];
  }
  let k;
  if (loop) {
    t = ((t % period) + period) % period;
    k = n - 1;
    for (let i = 0; i < n; i++) if (times[i] <= t) k = i;
    if (t < times[0]) k = n - 1;
  } else { k = 0; while (k < n - 2 && times[k + 1] <= t) k++; }
  const idx = (i) => (loop ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i)));
  const tm = (i) => {
    if (!loop) return times[Math.max(0, Math.min(n - 1, i))] + (i < 0 ? i : i > n - 1 ? i - n + 1 : 0);
    const w = Math.floor(i / n);
    return times[idx(i)] + w * period;
  };
  const t0 = tm(k - 1), t1 = tm(k), t2 = tm(k + 1), t3 = tm(k + 2);
  let tt = t;
  if (loop && tt < t1) tt += period;
  const p0 = vals[idx(k - 1)], p1 = vals[idx(k)], p2 = vals[idx(k + 1)], p3 = vals[idx(k + 2)];
  const u = (tt - t1) / Math.max(1e-6, t2 - t1);
  // non-uniform Catmull-Rom tangents (scaled to the segment)
  const m1 = (p2 - p0) / Math.max(1e-6, t2 - t0) * (t2 - t1);
  const m2 = (p3 - p1) / Math.max(1e-6, t3 - t1) * (t2 - t1);
  const ease = (!loop && (k === 0 || k === n - 2)) ? 1 : 1;
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p1 + (u3 - 2 * u2 + u) * m1 * ease + (-2 * u3 + 3 * u2) * p2 + (u3 - u2) * m2 * ease;
}

/**
 * Builds per-channel curves from keys. Each key: { t, ...offsets, root: [..], footL: [..], ... }.
 * Keys are cumulative: a bone not mentioned in a key keeps its previous value.
 * Returns fn(t) -> { offsets: Map, root: [x,y,z], extra: {footL, footR, handL, handR, ...} }.
 */
export function curves(keys, { loop = false, period = null, flat = false } = {}) {
  const ks = keys.slice().sort((a, b) => a.t - b.t);
  const state = new Map(); // channel -> value array
  const chans = new Map(); // channel -> { times: [], vals: [[]...] }
  const allNames = new Set();
  for (const k of ks) {
    const exp = expand(k);
    for (const n of exp.keys()) allNames.add(n);
    for (const extra of ['root', 'footL', 'footR', 'handL', 'handR', 'ikL', 'ikR']) if (k[extra]) allNames.add('#' + extra);
  }
  for (const k of ks) {
    const exp = expand(k);
    for (const n of allNames) {
      let v;
      if (n.startsWith('#')) v = k[n.slice(1)];
      else v = exp.get(n);
      if (v) state.set(n, v.slice());
      const cur = state.get(n) || (n === '#handL' || n === '#handR' ? null : [0, 0, 0]);
      if (!chans.has(n)) chans.set(n, { times: [], vals: [] });
      chans.get(n).times.push(k.t);
      chans.get(n).vals.push(cur ? cur.slice() : null);
    }
  }
  const P = period ?? (ks[ks.length - 1].t);
  return (t) => {
    const offsets = new Map();
    const extra = {};
    for (const [n, c] of chans) {
      if (c.vals.some((v) => v === null)) {
        // nullable channel (hand IK targets): step-hold, interpolate only between defined keys
        let k = 0; while (k < c.times.length - 1 && c.times[k + 1] <= t) k++;
        const a = c.vals[k], b = c.vals[k + 1];
        if (!a) { extra[n.slice(1)] = null; continue; }
        if (!b || t <= c.times[k]) { extra[n.slice(1)] = a; continue; }
        const u = (t - c.times[k]) / (c.times[k + 1] - c.times[k]);
        const s = u * u * (3 - 2 * u);
        extra[n.slice(1)] = a.map((x, i) => x + (b[i] - x) * s);
        continue;
      }
      const v = [0, 1, 2].map((ax) => (flat ? linear(c.times, c.vals.map((x) => x[ax]), t) : spline(c.times, c.vals.map((x) => x[ax]), t, loop, P)));
      if (n.startsWith('#')) extra[n.slice(1)] = v; else offsets.set(n, v);
    }
    return { offsets, root: extra.root || null, extra };
  };
}

function linear(times, vals, t) {
  if (t <= times[0]) return vals[0];
  for (let i = 0; i < times.length - 1; i++) if (t <= times[i + 1]) {
    const u = (t - times[i]) / (times[i + 1] - times[i]);
    return vals[i] + (vals[i + 1] - vals[i]) * u;
  }
  return vals[vals.length - 1];
}

// ------------------------------------------------------------------------------- noise

/** Smooth 1D value noise in [-1, 1]. */
export function noise(t, seed = 0) {
  const h = (i) => { const x = Math.sin((i + seed * 57.13) * 127.1 + seed * 311.7) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; };
  const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}
/** Periodic smooth noise with integer `cycles` per period P (loops seamlessly). */
export function loopNoise(t, P, cycles, seed = 0) {
  const ph = (t / P) * Math.PI * 2;
  let v = 0, amp = 1, tot = 0;
  for (let o = 1; o <= 3; o++) {
    v += amp * Math.sin(ph * cycles * o + seed * 1.7 * o + Math.sin(ph * o + seed) * 0.8);
    tot += amp; amp *= 0.5;
  }
  return v / tot;
}

// ------------------------------------------------------------------------------- procedural clip

/**
 * Builds a clip from a base (static pose or fn(t) -> pose) and keys/layers.
 * opts: { name, fps, dur, loop, base, keys, layers: [(t, pose, ctx) => void], plant: { l, r } feet
 *         anchors (true = keep the base pose's frame-0 foot position, or a Vector3), handIK }
 */
export function proc(skel, opts) {
  const { name, fps = 30, dur, loop = false, keys = [], layers = [] } = opts;
  const frames = Math.round(dur * fps) + 1;
  const curve = keys.length ? curves(keys, { loop, period: dur }) : null;
  const baseAt = typeof opts.base === 'function' ? opts.base : () => clonePose(opts.base);
  const anchors = {};
  if (opts.plant) {
    const fk0 = skel.fk(baseAt(0));
    for (const s of ['l', 'r']) {
      const pl = opts.plant[s];
      if (!pl) continue;
      anchors[s] = pl === true ? fk0.wp[skel.i(`foot_${s}`)].clone() : pl.clone();
      anchors[s + 'Q'] = fk0.wq[skel.i(`foot_${s}`)].clone();
    }
  }
  const poses = [];
  for (let f = 0; f < frames; f++) {
    const t = f / fps;
    const pose = clonePose(baseAt(t));
    let ex = {};
    if (curve) {
      const c = curve(t);
      ex = c.extra;
      // foot offsets are world-space rotations of planted feet: keep them out of the FK pass
      const footOff = {};
      for (const s of ['l', 'r']) if (anchors[s] && c.offsets.has(`foot_${s}`)) { footOff[s] = c.offsets.get(`foot_${s}`); c.offsets.delete(`foot_${s}`); }
      applyOffsets(skel, pose, c.offsets);
      if (c.root) pose.root.add(new THREE.Vector3(...c.root));
      ex._footOff = footOff;
    }
    const ctx = { t, f, dur, fps, extra: ex, skel };
    for (const L of layers) L(t, pose, ctx);
    for (const s of ['l', 'r']) {
      if (!anchors[s]) continue;
      const fk = skel.fk(pose);
      const off = ex[s === 'l' ? 'footL' : 'footR'];
      const tgt = anchors[s].clone();
      if (off) tgt.add(new THREE.Vector3(...off));
      const fo = ex._footOff?.[s];
      const endQ = fo ? offsetQ(fo).multiply(anchors[s + 'Q']) : anchors[s + 'Q'].clone();
      twoBoneIK(skel, pose, LEG(skel, s), tgt, kneePole(fk, skel, s), endQ, fk);
    }
    for (const s of ['l', 'r']) {
      const h = ex[s === 'l' ? 'handL' : 'handR'];
      if (!h) continue;
      const fk = skel.fk(pose);
      const pq = fk.wq[skel.i('spine_03')];
      const pole = new THREE.Vector3(s === 'l' ? 0.6 : -0.6, -0.2, -0.8).applyQuaternion(pq.clone().multiply(skel.restWorldQ[skel.i('spine_03')].clone().invert())).normalize();
      twoBoneIK(skel, pose, ARM(skel, s), new THREE.Vector3(...h), pole, fk.wq[skel.i(`hand_${s}`)].clone(), fk);
    }
    if (opts.post) opts.post(t, pose, ctx);
    poses.push(pose);
  }
  if (loop) poses[frames - 1] = clonePose(poses[0]);
  return { name, fps, poses, loop, meta: { source: opts.source || 'procedural' } };
}

/** Curls the fingers of one or both hands (degrees per joint; thumb gets `thumb`). */
export function fingerCurl(skel, pose, side, amount, { thumb = amount * 0.5, spread = 0 } = {}) {
  for (const s of side === 'both' ? ['l', 'r'] : [side]) {
    for (const fn of ['index', 'middle', 'ring', 'pinky', 'thumb']) {
      for (let k = 1; k <= 3; k++) {
        const i = skel.i(`${fn}_0${k}_${s}`);
        const a = (fn === 'thumb' ? thumb : amount) * (k === 1 ? 0.8 : 1) * DEG;
        pose.q[i].multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a));
        if (k === 1 && spread && fn !== 'thumb') {
          const sp = { index: -1, middle: -0.3, ring: 0.3, pinky: 1 }[fn] * spread * DEG;
          pose.q[i].multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), s === 'l' ? sp : -sp));
        }
      }
    }
  }
  return pose;
}
