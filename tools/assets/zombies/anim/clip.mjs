// Clip operations on target-skeleton pose sequences.
// A clip is { name, fps, poses: [{ q: Quaternion[] (local), root: Vector3 (pelvis position) }], loop, meta }.
import * as THREE from 'three';
import { clonePose, mirrorName } from './skeleton.mjs';

export const DEG = Math.PI / 180;
const Yv = new THREE.Vector3(0, 1, 0);

export function makeClip(name, src, extra = {}) {
  return { name, fps: src.fps || 30, poses: src.poses, loop: false, meta: { ...(src.meta || {}) }, ...extra };
}
export const duration = (c) => (c.poses.length - 1) / c.fps;

/** Frames [a, b] inclusive (seconds if `sec`). */
export function crop(c, a, b, sec = true) {
  const f0 = sec ? Math.round(a * c.fps) : a;
  const f1 = sec ? Math.round(b * c.fps) : b;
  return { ...c, poses: c.poses.slice(Math.max(0, f0), Math.min(c.poses.length, f1 + 1)).map(clonePose), meta: { ...c.meta } };
}

/** Pose at fractional frame index (slerp / lerp). */
export function sample(c, ft) {
  const n = c.poses.length;
  if (c.loop) { ft = ((ft % (n - 1)) + (n - 1)) % (n - 1); } else ft = Math.max(0, Math.min(n - 1, ft));
  const f0 = Math.floor(ft), f1 = Math.min(f0 + 1, n - 1), u = ft - f0;
  return blendPose(c.poses[f0], c.poses[f1], u);
}

export function blendPose(a, b, u) {
  return { q: a.q.map((q, i) => q.clone().slerp(b.q[i], u)), root: a.root.clone().lerp(b.root, u) };
}

/** Re-times a clip: newLen frames, or a time-warp function t'(u) in [0,1] -> source u. */
export function retime(c, frames, warp = (u) => u) {
  const n = c.poses.length;
  const out = [];
  for (let k = 0; k < frames; k++) out.push(sample({ ...c, loop: false }, warp(k / (frames - 1)) * (n - 1)));
  return { ...c, poses: out };
}
export const speedUp = (c, factor) => retime(c, Math.max(2, Math.round((c.poses.length - 1) / factor) + 1));

/** Removes the horizontal translation trend (least squares line over time), keeps oscillations. */
export function removeRootMotion(c, { keepX = false, keepZ = false, center = true } = {}) {
  const n = c.poses.length;
  const fit = (get) => {
    let st = 0, sv = 0, stt = 0, stv = 0;
    for (let f = 0; f < n; f++) { const v = get(c.poses[f].root); st += f; sv += v; stt += f * f; stv += f * v; }
    const slope = (n * stv - st * sv) / Math.max(1e-9, n * stt - st * st);
    const icpt = (sv - slope * st) / n;
    return { slope, icpt };
  };
  const fx = fit((p) => p.x), fz = fit((p) => p.z);
  for (let f = 0; f < n; f++) {
    const r = c.poses[f].root;
    if (!keepX) r.x -= fx.slope * f + (center ? fx.icpt : 0);
    if (!keepZ) r.z -= fz.slope * f + (center ? fz.icpt : 0);
  }
  c.meta.speed = Math.hypot(fx.slope, fz.slope) * c.fps;
  c.meta.speedZ = fz.slope * c.fps;
  return c;
}

/** Translates the root so that the first frame's pelvis is above the origin. */
export function zeroRootXZ(c, frame = 0) {
  const r0 = c.poses[frame].root.clone();
  for (const p of c.poses) { p.root.x -= r0.x; p.root.z -= r0.z; }
  return c;
}

/** Rotates the whole clip about +Y by `yaw` radians (root rotation + pelvis position). */
export function rotateClip(c, skel, yaw) {
  const H = new THREE.Quaternion().setFromAxisAngle(Yv, yaw);
  const pel = skel.i('pelvis');
  for (const p of c.poses) { p.q[pel].premultiply(H); p.root.applyQuaternion(H); }
  return c;
}

/**
 * Pose distance for loop matching: weighted local rotation differences + root height and
 * horizontal velocity differences.
 */
function poseDist(skel, c, a, b, weights) {
  let d = 0;
  for (const [bi, w] of weights) {
    const dot = Math.abs(c.poses[a].q[bi].dot(c.poses[b].q[bi]));
    d += w * (1 - Math.min(1, dot)) * 2;
  }
  const ra = c.poses[a].root, rb = c.poses[b].root;
  d += 4 * (ra.y - rb.y) ** 2;
  return d;
}

/**
 * Finds the best loop [start, end) with end-start in [minLen, maxLen] frames inside [lo, hi].
 * Compares a small window of frames around the seam (pose + velocity continuity).
 */
export function findLoop(skel, c, { minLen, maxLen, lo = 0, hi = c.poses.length - 1, win = 3 } = {}) {
  const W = [];
  for (const n of ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'head', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'clavicle_l', 'clavicle_r'])
    W.push([skel.i(n), /thigh|calf|pelvis/.test(n) ? 2 : 1]);
  let best = null;
  for (let s = lo + win; s <= hi - minLen - win; s++) {
    for (let L = minLen; L <= maxLen && s + L + win <= hi; L++) {
      let d = 0;
      for (let k = -win; k <= win; k++) d += poseDist(skel, c, s + k, s + L + k, W);
      if (!best || d < best.d) best = { s, e: s + L, d };
    }
  }
  return best;
}

/**
 * Makes clip frames [s, e] loop seamlessly: the last `blend` frames are cross-faded towards the
 * frames that precede `s` in the take (so the motion continues naturally into the start).
 * Output has e-s+1 frames with pose[last] == pose[0]. Root XZ handled via rootMotion removal first.
 */
export function makeLoop(c, s, e, blend = 8) {
  const L = e - s;
  const out = [];
  for (let k = 0; k <= L; k++) {
    let p = clonePose(c.poses[s + k]);
    const j = k - (L - blend); // 0..blend
    if (j > 0) {
      const pre = c.poses[s + k - L] || c.poses[Math.max(0, s + k - L)];
      const w = smooth(j / blend);
      p = blendPose(p, pre, w);
    }
    out.push(p);
  }
  out[L] = clonePose(out[0]);
  return { ...c, poses: out, loop: true };
}

/** Same as makeLoop but for an already-cropped clip: cross-fades end into start using the clip itself. */
export function seamLoop(c, blend = 6) {
  const n = c.poses.length;
  const out = c.poses.map(clonePose);
  // blend the tail towards the head (time-shifted): frame n-1-k gets (k-window) weight of frame 0-k...
  for (let k = 0; k < blend; k++) {
    const f = n - 1 - k;
    const w = smooth(1 - k / blend);
    // target: pose that continues into frame 0 -> approximate with frame 0 (k=0) easing out
    out[f] = blendPose(out[f], c.poses[0], w * (k === 0 ? 1 : 1 - k / blend));
  }
  out[n - 1] = clonePose(out[0]);
  return { ...c, poses: out, loop: true };
}

export const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };

/** Concatenates clips with a cross-fade of `blend` frames between each. */
export function concat(clips, blend = 6) {
  let poses = clips[0].poses.map(clonePose);
  for (let i = 1; i < clips.length; i++) {
    const nxt = clips[i].poses;
    const b = Math.min(blend, poses.length - 1, nxt.length - 1);
    const head = poses.slice(0, poses.length - b);
    const mid = [];
    for (let k = 0; k < b; k++) mid.push(blendPose(poses[poses.length - b + k], nxt[k], smooth((k + 1) / (b + 1))));
    poses = head.concat(mid, nxt.slice(b).map(clonePose));
  }
  return { ...clips[0], poses };
}

/** Mirrors a clip left <-> right (character space is symmetric about the YZ plane). */
export function mirror(c, skel) {
  // world-space mirror: reflect across X. For rotations: q' = (x, -y, -z, w) in world, then
  // re-express in mirrored bone frames using the rest frames of the mirrored bone.
  const n = skel.names.length;
  const mi = skel.names.map((nm) => skel.i(mirrorName(nm)));
  const reflQ = (q) => new THREE.Quaternion(q.x, -q.y, -q.z, q.w);
  const poses = c.poses.map((P) => {
    const fk = skel.fk(P);
    const G = new Array(n);
    for (let i = 0; i < n; i++) {
      const src = mi[i];
      // delta from rest in world, reflected, applied to mirrored bone rest
      const d = fk.wq[src].clone().multiply(skel.restWorldQ[src].clone().invert());
      G[i] = reflQ(d).multiply(skel.restWorldQ[i]);
    }
    const q = G.map((g, i) => (skel.parent[i] < 0 ? g.clone() : G[skel.parent[i]].clone().invert().multiply(g)));
    return { q, root: new THREE.Vector3(-P.root.x, P.root.y, P.root.z) };
  });
  return { ...c, poses };
}

/** Ensures quaternion continuity (no sign flips between frames). */
export function fixSigns(c) {
  for (let f = 1; f < c.poses.length; f++) {
    const a = c.poses[f - 1].q, b = c.poses[f].q;
    for (let i = 0; i < b.length; i++) if (a[i].dot(b[i]) < 0) b[i].set(-b[i].x, -b[i].y, -b[i].z, -b[i].w);
  }
  return c;
}

/** Light temporal smoothing of rotations/root (removes mocap jitter). */
export function smoothClip(c, passes = 1, bones = null) {
  for (let p = 0; p < passes; p++) {
    const src = c.poses.map(clonePose);
    const n = src.length;
    for (let f = 1; f < n - 1; f++) {
      const P = c.poses[f];
      for (let i = 0; i < P.q.length; i++) {
        if (bones && !bones.has(i)) continue;
        const avg = src[f - 1].q[i].clone().slerp(src[f + 1].q[i], 0.5);
        P.q[i].copy(src[f].q[i]).slerp(avg, 0.5);
      }
      P.root.copy(src[f].root).multiplyScalar(0.5).addScaledVector(src[f - 1].root, 0.25).addScaledVector(src[f + 1].root, 0.25);
    }
  }
  return c;
}
