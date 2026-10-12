import { Skeleton } from './skeleton.mjs';
import { ualLoop } from './lib.mjs';
import { popMetrics, footMetrics } from './metrics.mjs';
const skel = new Skeleton();
for (const [lib, a] of [[1, 'Jog_Fwd_Loop'], [1, 'Sprint_Loop'], [2, 'Zombie_Walk_Fwd_Loop']]) for (const lock of [false, true]) {
  const c = ualLoop(skel, lib, a, { lock });
  const p = popMetrics(skel, c), f = footMetrics(skel, c);
  console.log(a, 'lock', lock, 'v', c.meta.speed.toFixed(2), 'maxStep', p.maxStepDeg.toFixed(1), p.maxStepAt, 'seam', p.seamVelDiffDeg.toFixed(1), 'slide', f.slideMean.toFixed(3), JSON.stringify(c.meta.contacts));
}
