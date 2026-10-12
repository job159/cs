// World-space retargeter: source motion (any skeleton) -> poses on the game_engine target skeleton.
//
// Per mapped bone b with source joint s:
//   G_t(b, f) = H * G_s(s, f) * inv(W_s(s)) * A(b) * W_t(b)
// where W are rest world rotations, H is a heading correction (yaw) and A(b) is the rest-pose
// alignment: the minimal rotation taking the target's rest bone direction onto the source's rest
// bone direction (so a T-pose source drives an A-pose target correctly). Unmapped bones keep their
// rest local rotation. Only rotations are transferred; bone lengths come from the target, and the
// pelvis translation is scaled by the leg-length ratio.
import * as THREE from 'three';
import { BONES } from './skeleton.mjs';

const Yv = new THREE.Vector3(0, 1, 0);

function legLen(src, names) {
  const P = src.restWorldP, idx = (n) => { const k = src.names.indexOf(n); if (k < 0) throw new Error('no source joint ' + n); return k; };
  return P[idx(names[0])].distanceTo(P[idx(names[1])]) + P[idx(names[1])].distanceTo(P[idx(names[2])]);
}

/** Yaw (radians, about +Y) that turns direction (x, z) onto +Z. */
export function yawToPlusZ(dx, dz) { return -Math.atan2(dx, dz); }

/**
 * @param src     source motion (sources.mjs)
 * @param map     { targetBone: [sourceJoint, tipJoint|null] }
 * @param skel    target Skeleton
 * @param opts    { heading: radians yaw applied to the motion | 'travel' | 'hips',
 *                  legs: [hip, knee, ankle] source joint names for the scale ratio,
 *                  noAlign: bones whose rest alignment is skipped (default pelvis),
 *                  scale: override root scale }
 */
export function retarget(src, map, skel, opts = {}) {
  const sIdx = new Map(src.names.map((n, k) => [n, k]));
  const sj = (n) => { const k = sIdx.get(n); if (k === undefined) throw new Error(`source ${src.source}: no joint ${n}`); return k; };
  const noAlign = new Set(opts.noAlign || ['pelvis']);
  const entries = [];
  for (const [b, [s, tip]] of Object.entries(map)) {
    if (!skel.index.has(b)) continue;
    if (!sIdx.has(s)) { if (opts.strict) throw new Error('missing ' + s); continue; }
    const k = sj(s), bi = skel.i(b);
    let ds;
    if (tip) ds = src.restWorldP[sj(tip)].clone().sub(src.restWorldP[k]).normalize();
    else ds = Yv.clone().applyQuaternion(src.restWorldQ[k]);
    const dt = skel.restDir(bi);
    const A = noAlign.has(b) ? new THREE.Quaternion() : new THREE.Quaternion().setFromUnitVectors(dt, ds);
    const off = src.restWorldQ[k].clone().invert().multiply(A).multiply(skel.restWorldQ[bi]);
    entries.push({ bi, k, off });
  }
  const mapped = new Map(entries.map((e) => [e.bi, e]));
  // root scale from leg length
  const legs = opts.legs || (sIdx.has('LeftUpLeg') ? ['LeftUpLeg', 'LeftLeg', 'LeftFoot'] : ['thigh_l', 'calf_l', 'foot_l']);
  const tLeg = skel.length[skel.i('thigh_l')] + skel.length[skel.i('calf_l')];
  const k = opts.scale ?? tLeg / legLen(src, legs);
  const hipsK = sj(map.pelvis[0]);
  // heading
  let yaw = 0;
  if (typeof opts.heading === 'number') yaw = opts.heading;
  else if (opts.heading === 'travel') {
    const a = src.worldP[0][hipsK], b = src.worldP[src.frames - 1][hipsK];
    yaw = -Math.atan2(b.x - a.x, b.z - a.z);
  } else if (opts.heading === 'hips' || opts.heading === 'hips0') {
    // average facing of the hips (whole take, or the first 10 frames for 'hips0'): source forward
    // axis (+Z at rest) rotated by the hips world delta
    let sx = 0, sz = 0;
    const nF = opts.heading === 'hips0' ? Math.min(10, src.frames) : src.frames;
    for (let f = 0; f < nF; f++) {
      const d = src.worldQ[f][hipsK].clone().multiply(src.restWorldQ[hipsK].clone().invert());
      const fw = new THREE.Vector3(0, 0, 1).applyQuaternion(d);
      sx += fw.x; sz += fw.z;
    }
    yaw = -Math.atan2(sx, sz);
  }
  const H = new THREE.Quaternion().setFromAxisAngle(Yv, yaw);
  const poses = [];
  const n = skel.names.length;
  for (let f = 0; f < src.frames; f++) {
    const G = new Array(n);
    const q = new Array(n);
    for (let i = 0; i < n; i++) {
      const p = skel.parent[i];
      const e = mapped.get(i);
      if (e) G[i] = H.clone().multiply(src.worldQ[f][e.k]).multiply(e.off);
      else G[i] = p < 0 ? skel.restWorldQ[i].clone() : G[p].clone().multiply(skel.restLocalQ[i]);
      q[i] = p < 0 ? G[i].clone() : G[p].clone().invert().multiply(G[i]);
    }
    const root = src.worldP[f][hipsK].clone().applyQuaternion(H).multiplyScalar(k);
    poses.push({ q, root });
  }
  // UAL-style 2-segment fingers: let segment 03 copy segment 02's bend.
  if (opts.finger3) {
    for (const s of ['l', 'r']) for (const fn of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
      const b2 = skel.i(`${fn}_02_${s}`), b3 = skel.i(`${fn}_03_${s}`);
      const r2i = skel.restLocalQ[b2].clone().invert();
      for (const P of poses) P.q[b3] = skel.restLocalQ[b3].clone().multiply(r2i.clone().multiply(P.q[b2]));
    }
  }
  return { fps: src.fps, poses, meta: { source: src.source, scale: k, yaw } };
}

export { BONES };
