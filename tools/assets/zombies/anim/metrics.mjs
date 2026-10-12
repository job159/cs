// Quality metrics for clips: foot sliding (with the treadmill speed added back), ground
// penetration, loop seam discontinuity and per-frame angular jumps (pops).
import { footPoints } from './ik.mjs';

export function footMetrics(skel, clip, { speed = clip.meta?.speed || 0, contactH = 0.025 } = {}) {
  const fks = clip.poses.map((p) => skel.fk(p));
  const dt = 1 / clip.fps;
  let slideSum = 0, slideN = 0, slideMax = 0, minY = Infinity;
  for (const s of ['l', 'r']) {
    const pts = fks.map((fk) => footPoints(skel, fk, s));
    for (let f = 1; f < pts.length; f++) {
      for (const k of ['heel', 'toe']) {
        const a = pts[f - 1][k], b = pts[f][k];
        minY = Math.min(minY, b.y);
        if (a.y < contactH && b.y < contactH && (k === 'heel' ? pts[f].heel.y <= pts[f].toe.y + 0.005 : pts[f].toe.y <= pts[f].heel.y + 0.005)) {
          const vx = (b.x - a.x) / dt, vz = (b.z - a.z) / dt + speed;
          const v = Math.hypot(vx, vz);
          slideSum += v; slideN++; slideMax = Math.max(slideMax, v);
        }
      }
    }
  }
  return { slideMean: slideN ? slideSum / slideN : 0, slideMax, contactFrames: slideN, minFootY: minY };
}

/** Largest per-frame rotation change (degrees) of any bone and the loop seam jump. */
export function popMetrics(skel, clip) {
  let maxStep = 0, at = '';
  const P = clip.poses;
  for (let f = 1; f < P.length; f++) {
    for (let i = 1; i < P[f].q.length; i++) {
      const d = 2 * Math.acos(Math.min(1, Math.abs(P[f].q[i].dot(P[f - 1].q[i])))) * 180 / Math.PI;
      if (d > maxStep) { maxStep = d; at = `${skel.names[i]}@${f}`; }
    }
  }
  let seam = 0;
  if (clip.loop && P.length > 2) {
    // velocity continuity: compare step (n-2 -> n-1) with (0 -> 1)
    const n = P.length;
    for (let i = 1; i < P[0].q.length; i++) {
      const a = 2 * Math.acos(Math.min(1, Math.abs(P[n - 1].q[i].dot(P[n - 2].q[i]))));
      const b = 2 * Math.acos(Math.min(1, Math.abs(P[1].q[i].dot(P[0].q[i]))));
      seam = Math.max(seam, Math.abs(a - b) * 180 / Math.PI);
    }
  }
  return { maxStepDeg: maxStep, maxStepAt: at, seamVelDiffDeg: seam };
}
