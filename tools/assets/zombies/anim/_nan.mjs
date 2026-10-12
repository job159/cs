import { Skeleton } from './skeleton.mjs';
import { ual2, MAP_UE } from './sources.mjs';
import { retarget } from './retarget.mjs';
const skel = new Skeleton();
for (const a of ['Zombie_Scratch', 'Hit_Knockback', 'Consume', 'LayToIdle']) {
  const m = ual2(a);
  let bad = 0; for (const f of m.worldQ) for (const q of f) if (!Number.isFinite(q.x + q.y + q.z + q.w)) bad++;
  const r = retarget(m, MAP_UE, skel, { finger3: true });
  let bad2 = 0, mx = 0; for (const p of r.poses) { for (const q of p.q) if (!Number.isFinite(q.x + q.y + q.z + q.w)) bad2++; mx = Math.max(mx, p.root.length()); }
  console.log(a, bad, bad2, mx.toFixed(2), r.poses[0].root.toArray().map(v => v.toFixed(2)));
}
