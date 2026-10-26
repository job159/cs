// Two-bone IK, foot contact detection and foot locking for target-skeleton clips.
import * as THREE from 'three';
import { smooth } from './clip.mjs';

const _v = new THREE.Vector3();

/**
 * Two-bone IK in place on `pose` (local rotations). chain = [upper, lower, end] bone indices.
 * target: world position for the end joint. pole: world direction the middle joint should bend
 * towards. endWorldQ (optional): world rotation to keep for the end bone.
 */
export function twoBoneIK(skel, pose, chain, target, pole, endWorldQ = null, fkres = null, soft = 0) {
  const [u, l, e] = chain;
  const fk = fkres || skel.fk(pose);
  const a = fk.wp[u], b = fk.wp[l], c = fk.wp[e];
  const l1 = b.distanceTo(a), l2 = c.distanceTo(b);
  const keepLocal = endWorldQ === 'local';
  const keepEnd = keepLocal ? null : endWorldQ || fk.wq[e].clone();
  const toT = target.clone().sub(a);
  let d = toT.length();
  // soft IK: ease into full extension instead of snapping straight (removes elbow/knee pops)
  if (soft > 0) { const L = l1 + l2, ds = L * (1 - soft); if (d > ds) d = ds + (L - ds) * (1 - Math.exp(-(d - ds) / (L - ds))); }
  d = Math.min(Math.max(d, Math.abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4);
  const dir = toT.clone().normalize();
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const perp = pole.clone().addScaledVector(dir, -pole.dot(dir));
  if (perp.lengthSq() < 1e-10) perp.copy(b).sub(a).addScaledVector(dir, -b.clone().sub(a).dot(dir));
  perp.normalize();
  const bNew = a.clone().addScaledVector(dir, l1 * cosA).addScaledVector(perp, l1 * sinA);
  const tEnd = a.clone().addScaledVector(dir, d);
  const R1 = new THREE.Quaternion().setFromUnitVectors(b.clone().sub(a).normalize(), bNew.clone().sub(a).normalize());
  const Gu = R1.clone().multiply(fk.wq[u]);
  const v = c.clone().sub(b).applyQuaternion(R1).normalize();
  const R2 = new THREE.Quaternion().setFromUnitVectors(v, tEnd.clone().sub(bNew).normalize());
  const Gl = R2.clone().multiply(R1).multiply(fk.wq[l]);
  const pu = skel.parent[u];
  pose.q[u] = fk.wq[pu].clone().invert().multiply(Gu);
  pose.q[l] = Gu.clone().invert().multiply(Gl);
  if (!keepLocal) pose.q[e] = Gl.clone().invert().multiply(keepEnd);
  return pose;
}

export const LEG = (skel, s) => [skel.i(`thigh_${s}`), skel.i(`calf_${s}`), skel.i(`foot_${s}`)];
export const ARM = (skel, s) => [skel.i(`upperarm_${s}`), skel.i(`lowerarm_${s}`), skel.i(`hand_${s}`)];

/** World-space pole for a knee: forward of the pelvis plus a little outward. */
export function kneePole(fk, skel, s) {
  const q = fk.wq[skel.i('pelvis')].clone().multiply(skel.restWorldQ[skel.i('pelvis')].clone().invert());
  return new THREE.Vector3(s === 'l' ? 0.25 : -0.25, 0, 1).applyQuaternion(q).normalize();
}

/** Heel and toe contact points of a foot (world) for a FK result. */
export function footPoints(skel, fk, s) {
  const f = skel.i(`foot_${s}`), b = skel.i(`ball_${s}`);
  // heel: below/behind the ankle, defined at rest at ground height, 4 cm behind the ankle
  if (!skel._heel) {
    skel._heel = {};
    for (const side of ['l', 'r']) {
      const fi = skel.i(`foot_${side}`);
      const ankle = skel.restWorldP[fi];
      const heelW = new THREE.Vector3(ankle.x, 0.0, ankle.z - 0.045);
      skel._heel[side] = heelW.sub(ankle).applyQuaternion(skel.restWorldQ[fi].clone().invert());
    }
  }
  const heel = skel._heel[s].clone().applyQuaternion(fk.wq[f]).add(fk.wp[f]);
  const toe = fk.wp[b].clone();
  return { heel, toe, ankle: fk.wp[f].clone() };
}

/**
 * Shifts the root vertically so the feet touch the ground: takes the per-frame lowest foot point,
 * and moves the clip so that its `pct` percentile sits at `ground`.
 */
export function groundFeet(skel, clip, { pct = 0.1, ground = 0.0, perFrame = false } = {}) {
  const lows = clip.poses.map((p) => {
    const fk = skel.fk(p);
    let m = Infinity;
    for (const s of ['l', 'r']) { const fp = footPoints(skel, fk, s); m = Math.min(m, fp.heel.y, fp.toe.y); }
    return m;
  });
  if (perFrame) { clip.poses.forEach((p, f) => { p.root.y += ground - lows[f]; }); return clip; }
  const sorted = [...lows].sort((a, b) => a - b);
  const off = ground - sorted[Math.floor(pct * (sorted.length - 1))];
  for (const p of clip.poses) p.root.y += off;
  return clip;
}

/** Lowest body point per frame (all joints + foot points) -> shift so min over clip == ground. */
export function groundAll(skel, clip, ground = 0.02) {
  let m = Infinity;
  for (const p of clip.poses) {
    const fk = skel.fk(p);
    for (const w of fk.wp) m = Math.min(m, w.y);
    for (const s of ['l', 'r']) { const fp = footPoints(skel, fk, s); m = Math.min(m, fp.heel.y, fp.toe.y); }
  }
  for (const p of clip.poses) p.root.y += ground - m;
  return clip;
}

/**
 * Foot locking for in-place locomotion. Each foot has two contact points (heel, toe). A point is in
 * contact while it is near the ground and its velocity - after adding back the treadmill speed v
 * along +Z - is small. During a contact segment the point is pinned to an anchor that travels
 * backwards at exactly v (so it stays planted when the game moves the character at v) at ground
 * height. The ankle is moved by the (weighted) correction of its planted points and the leg is
 * solved with two-bone IK, the foot keeps its animated orientation so heel-strike / toe-off rolls
 * survive. Corrections fade in/out over `blend` frames. Works cyclically for loops.
 */
export function lockFeet(skel, clip, { speed = clip.meta.speed || 0, hThresh = 0.035, vThresh = 0.45, blend = 3, sides = ['l', 'r'], minLen = 2, ground = 0 } = {}) {
  const n = clip.poses.length;
  const loop = clip.loop;
  const N = loop ? n - 1 : n; // unique frames
  const dt = 1 / clip.fps;
  const wrap = (f) => (loop ? ((f % N) + N) % N : Math.max(0, Math.min(N - 1, f)));
  const report = {};
  const contactY = { heel: ground, toe: ground + 0.01 };
  for (const s of sides) {
    const fks = clip.poses.map((p) => skel.fk(p));
    const pts = fks.map((fk) => footPoints(skel, fk, s));
    const corr = Array.from({ length: N }, () => ({ v: new THREE.Vector3(), w: 0, wmax: 0 }));
    const segs = [];
    for (const k of ['heel', 'toe']) {
      // compensated positions (treadmill added back)
      const P = (f) => { const p = pts[wrap(f)][k].clone(); p.z += speed * f * dt; return p; };
      const contact = [];
      for (let f = 0; f < N; f++) {
        const a = P(f - 1), b = P(f + 1);
        const span = loop ? 2 : wrap(f + 1) - wrap(f - 1);
        const v = span ? Math.hypot(b.x - a.x, b.z - a.z) / (span * dt) : 0;
        contact.push(pts[f][k].y < ground + hThresh && v < vThresh);
      }
      // fill 1-frame gaps
      for (let f = 0; f < N; f++) if (!contact[f] && contact[wrap(f - 1)] && contact[wrap(f + 1)] && (loop || (f > 0 && f < N - 1))) contact[f] = true;
      // segments
      const list = [];
      if (contact.every(Boolean)) list.push([0, N - 1]);
      else {
        const first = loop ? contact.findIndex((c, f) => c && !contact[wrap(f - 1)]) : 0;
        if (first >= 0) {
          for (let f = first; f < first + N; f++) {
            if (!loop && f >= N) break;
            const ff = loop ? f : f;
            if (contact[wrap(ff)] && (ff === first || !contact[wrap(ff - 1)]) && (loop || ff === 0 || !contact[ff - 1])) {
              let g = ff;
              while (g + 1 < first + N && contact[wrap(g + 1)] && (loop || g + 1 < N)) g++;
              if (g - ff + 1 >= minLen) list.push([ff, g]);
              f = g;
            }
          }
        }
      }
      for (const [a, b] of list) {
        const anchor = new THREE.Vector3();
        for (let f = a; f <= b; f++) anchor.add(P(f));
        anchor.divideScalar(b - a + 1);
        anchor.y = contactY[k];
        segs.push(`${k[0]}${a}-${b}`);
        for (let f = a - blend; f <= b + blend; f++) {
          if (!loop && (f < 0 || f >= N)) continue;
          const ff = f < a ? a : f > b ? b : f; // outside the segment: keep the boundary correction, fading
          const wt = f >= a && f <= b ? 1 : smooth(1 - (f < a ? a - f : f - b) / (blend + 1));
          const target = anchor.clone(); target.z -= speed * ff * dt;
          const c = target.sub(pts[wrap(ff)][k]);
          if (f !== ff) {
            // fade: correction measured at the boundary frame, re-expressed for this frame
            const tz = anchor.z - speed * f * dt;
            c.copy(new THREE.Vector3(anchor.x, contactY[k], tz).sub(pts[wrap(f)][k]));
            c.y = Math.max(0, c.y);
          }
          const C = corr[wrap(f)];
          C.v.addScaledVector(c, wt);
          C.w += wt;
          C.wmax = Math.max(C.wmax, wt);
        }
      }
    }
    report[s] = segs.join(',');
    for (let f = 0; f < N; f++) {
      const C = corr[f];
      if (C.w <= 0) continue;
      const d = C.v.clone().divideScalar(C.w).multiplyScalar(C.wmax);
      if (d.lengthSq() < 1e-8) continue;
      const fk = skel.fk(clip.poses[f]);
      const tgt = fk.wp[skel.i(`foot_${s}`)].clone().add(d);
      twoBoneIK(skel, clip.poses[f], LEG(skel, s), tgt, kneePole(fk, skel, s), null, fk);
    }
  }
  if (loop) clip.poses[n - 1] = { q: clip.poses[0].q.map((q) => q.clone()), root: clip.poses[0].root.clone() };
  clip.meta.contacts = report;
  return clip;
}

/** Estimates the treadmill speed of an in-place clip: median backward speed of the lowest foot
 * point (heel or toe) while it is on the ground (m/s along -Z). */
export function estimateSpeed(skel, clip) {
  const fks = clip.poses.map((p) => skel.fk(p));
  const vs = [];
  for (const s of ['l', 'r']) {
    const pts = fks.map((fk) => footPoints(skel, fk, s));
    const low = pts.map((p) => (p.heel.y < p.toe.y ? 'heel' : 'toe'));
    const minY = Math.min(...pts.map((p) => Math.min(p.heel.y, p.toe.y)));
    for (let f = 1; f < pts.length; f++) {
      const k = low[f];
      if (low[f - 1] !== k) continue;
      if (pts[f][k].y < minY + 0.02 && pts[f - 1][k].y < minY + 0.02) vs.push(-(pts[f][k].z - pts[f - 1][k].z) * clip.fps);
    }
  }
  vs.sort((a, b) => a - b);
  return vs.length ? vs[Math.floor(vs.length / 2)] : 0;
}

/** Keeps every foot point above the ground (IK lift) for all frames. */
export function clampFeetAboveGround(skel, clip, ground = 0.0) {
  for (const p of clip.poses) {
    for (const s of ['l', 'r']) {
      const fk = skel.fk(p);
      const fp = footPoints(skel, fk, s);
      const low = Math.min(fp.heel.y, fp.toe.y);
      if (low < ground - 0.002) {
        const t = fp.ankle.clone(); t.y += ground - low;
        twoBoneIK(skel, p, LEG(skel, s), t, kneePole(fk, skel, s), null, fk);
      }
    }
  }
  return clip;
}

void _v;

/**
 * Stride warping: scales every foot's fore/aft distance from the pelvis by k (IK keeps the foot
 * orientation), turning long strides into short choppy ones. The treadmill speed scales by k.
 */
export function strideWarp(skel, clip, k) {
  const pel = skel.i('pelvis');
  for (const p of clip.poses) {
    for (const s of ['l', 'r']) {
      const fk = skel.fk(p);
      const P = fk.wp[pel], A = fk.wp[skel.i(`foot_${s}`)];
      const t = A.clone(); t.z = P.z + (A.z - P.z) * k;
      twoBoneIK(skel, p, LEG(skel, s), t, kneePole(fk, skel, s), null, fk);
    }
  }
  clip.meta.speed = (clip.meta.speed || 0) * k;
  return clip;
}

/**
 * Two-bone IK with anatomical hinges: like twoBoneIK (law of cosines, pole, soft reach), but both bones are oriented
 * so their local +X stays on the hinge axis (the normal of the limb plane, upper x lower; the game_engine elbows and
 * knees bend about local X), so the upper bone's twist follows the bend plane instead of the minimal-arc rotation from
 * whatever pose the solve starts from (which flips the twist when a limb swings far). The end bone keeps the world
 * rotation endWorldQ; `twistShare` of its twist about the lower bone's axis moves into the lower bone (forearm
 * pronation instead of all of it at the wrist).
 */
export function hingeIK(skel, pose, chain, target, pole, endWorldQ, fkres = null, soft = 0, twistShare = 0) {
  const [u, l, e] = chain;
  const fk = fkres || skel.fk(pose);
  const a = fk.wp[u];
  const l1 = fk.wp[l].distanceTo(a), l2 = fk.wp[e].distanceTo(fk.wp[l]);
  const toT = target.clone().sub(a);
  let d = toT.length();
  if (soft > 0) { const L = l1 + l2, ds = L * (1 - soft); if (d > ds) d = ds + (L - ds) * (1 - Math.exp(-(d - ds) / (L - ds))); }
  d = Math.min(Math.max(d, Math.abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4);
  const dir = toT.normalize();
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const perp = pole.clone().addScaledVector(dir, -pole.dot(dir));
  if (perp.lengthSq() < 1e-10) perp.set(0, 0, 1).addScaledVector(dir, -dir.z);
  perp.normalize();
  const b = a.clone().addScaledVector(dir, l1 * cosA).addScaledVector(perp, l1 * sinA);
  const c = a.clone().addScaledVector(dir, d);
  const ud = b.clone().sub(a).normalize(), ld = c.clone().sub(b).normalize();
  const n = ud.clone().cross(ld);
  if (n.lengthSq() < 1e-8) n.copy(perp).cross(dir); // straight limb: the hinge the pole would bend it about
  n.normalize();
  const frame = (x, y) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, x.clone().cross(y)));
  const Gu = frame(n.clone().addScaledVector(ud, -n.dot(ud)).normalize(), ud);
  let Gl = frame(n.clone().addScaledVector(ld, -n.dot(ld)).normalize(), ld);
  const Ge = endWorldQ || fk.wq[e].clone();
  if (twistShare) {
    // twist of the end bone about the lower bone's axis, relative to its rest attachment
    const rel = Gl.clone().invert().multiply(Ge).multiply(skel.restLocalQ[e].clone().invert());
    const tw = new THREE.Quaternion(0, rel.y, 0, rel.w).normalize();
    Gl = Gl.multiply(new THREE.Quaternion().slerp(tw, twistShare));
  }
  pose.q[u] = fk.wq[skel.parent[u]].clone().invert().multiply(Gu);
  pose.q[l] = Gu.clone().invert().multiply(Gl);
  pose.q[e] = Gl.clone().invert().multiply(Ge);
  return pose;
}

/**
 * Longer strides for a locomotion clip: every foot's fore/aft offset from the pelvis is scaled by k (like strideWarp)
 * and the pelvis is lowered wherever a leg would pass `maxExt` of its length (dilated + smoothed over +-win frames,
 * cyclic for loops), so the longer steps bend the knees instead of leaving the feet short of the floor. Foot heights
 * and orientations are kept; the treadmill speed scales by k (re-lock the feet afterwards).
 */
export function lengthenStride(skel, clip, k, { maxExt = 0.96, win = 3 } = {}) {
  const n = clip.poses.length, N = clip.loop ? n - 1 : n;
  const pel = skel.i('pelvis');
  const legLen = (s) => skel.restWorldP[skel.i(`calf_${s}`)].distanceTo(skel.restWorldP[skel.i(`thigh_${s}`)]) + skel.restWorldP[skel.i(`foot_${s}`)].distanceTo(skel.restWorldP[skel.i(`calf_${s}`)]);
  const L = { l: legLen('l') * maxExt, r: legLen('r') * maxExt };
  const tgt = [], need = [];
  for (let f = 0; f < n; f++) {
    const fk = skel.fk(clip.poses[f]);
    const P = fk.wp[pel];
    let drop = 0;
    const t = {};
    for (const s of ['l', 'r']) {
      const fi = skel.i(`foot_${s}`), H = fk.wp[skel.i(`thigh_${s}`)];
      const A = fk.wp[fi].clone();
      A.z = P.z + (A.z - P.z) * k;
      t[s] = { p: A, q: fk.wq[fi].clone() };
      const h2 = (A.x - H.x) ** 2 + (A.z - H.z) ** 2, dy = H.y - A.y;
      if (h2 + dy * dy > L[s] * L[s] && h2 < L[s] * L[s]) drop = Math.max(drop, dy - Math.sqrt(L[s] * L[s] - h2));
    }
    tgt.push(t); need.push(drop);
  }
  const at = (f) => need[clip.loop ? ((f % N) + N) % N : Math.max(0, Math.min(n - 1, f))];
  const dil = need.map((_, f) => { let m = 0; for (let d = -win; d <= win; d++) m = Math.max(m, at(f + d)); return m; });
  const atD = (f) => dil[clip.loop ? ((f % N) + N) % N : Math.max(0, Math.min(n - 1, f))];
  for (let f = 0; f < n; f++) {
    let s = 0, w = 0;
    for (let d = -win; d <= win; d++) { const wt = win + 1 - Math.abs(d); s += atD(f + d) * wt; w += wt; }
    const p = clip.poses[f];
    p.root.y -= s / w;
    for (const side of ['l', 'r']) {
      const fk = skel.fk(p);
      twoBoneIK(skel, p, LEG(skel, side), tgt[f][side].p, kneePole(fk, skel, side), tgt[f][side].q, fk, 0.02);
    }
  }
  clip.meta.speed = (clip.meta.speed || 0) * k;
  clip.meta.strideDrop = +Math.max(...dil).toFixed(3);
  return clip;
}
