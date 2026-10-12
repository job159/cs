import { Skeleton } from './skeleton.mjs';
import { fromUAL, fromCMU } from './lib.mjs';
import * as THREE from 'three';
const skel = new Skeleton();
const show = (c, step = 3) => {
  const pel = skel.i('pelvis'), head = skel.i('head');
  const line = [];
  for (let f = 0; f < c.poses.length; f += step) {
    const fk = skel.fk(c.poses[f]);
    const fw = new THREE.Vector3(0, 0, 1).applyQuaternion(fk.wq[pel].clone().multiply(skel.restWorldQ[pel].clone().invert()));
    line.push(`${(f / 30).toFixed(1)}:p(${c.poses[f].root.x.toFixed(2)},${c.poses[f].root.y.toFixed(2)},${c.poses[f].root.z.toFixed(2)})h${fk.wp[head].y.toFixed(2)}`);
  }
  console.log('==', c.meta.source, '\n', line.join(' '));
};
show(fromCMU(skel, '90_18', { heading: 0 }), 6);
show(fromUAL(skel, 2, 'LayToIdle'));
show(fromUAL(skel, 2, 'Hit_Knockback'));
show(fromUAL(skel, 1, 'Death01'));
show(fromCMU(skel, '90_16', { from: 1.8, to: 4.5, heading: 0 }), 3);
show(fromCMU(skel, '77_16', { heading: 0 }), 6);
