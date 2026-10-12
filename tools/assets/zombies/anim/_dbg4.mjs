import { Skeleton } from './skeleton.mjs';
import { fromUAL } from './lib.mjs';
import { footPoints } from './ik.mjs';
const skel = new Skeleton();
for (const [lib, a] of [[2, 'NinjaJump_Start'], [2, 'NinjaJump_Land'], [2, 'NinjaJump_Idle_Loop'], [1, 'Crouch_Idle_Loop']]) {
  const c = fromUAL(skel, lib, a);
  const line = [];
  c.poses.forEach((p, f) => { if (f % 2) return; const fk = skel.fk(p); const L = footPoints(skel, fk, 'l'), R = footPoints(skel, fk, 'r');
    line.push(`${(f / 30).toFixed(2)}:${p.root.y.toFixed(2)}/${Math.min(L.heel.y, L.toe.y, R.heel.y, R.toe.y).toFixed(2)}/z${p.root.z.toFixed(2)}`); });
  console.log(a, line.join(' '));
}
