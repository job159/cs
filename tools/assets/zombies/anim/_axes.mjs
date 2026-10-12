import path from 'node:path';
import { Skeleton, REPO } from './skeleton.mjs';
import { applyOffsets, fingerCurl } from './pose.mjs';
import { GLBBuilder, addSkeleton, addClips } from './glb-write.mjs';
const skel = new Skeleton();
const tests = {
  armsFwd: { upperarm: [-90, 0, 0] }, spineFwd: { spine_02: [30, 0, 0] }, armOutL: { upperarm_l: [0, 0, 30] },
  legFwdL: { thigh_l: [-60, 0, 0] }, kneeL: { calf_l: [60, 0, 0] }, headNodTurn: { head: [20, 30, 0] },
  armsDown: { upperarm: [0, 0, -40] }, elbow: { lowerarm: [-60, 0, 0] }, twistL: { upperarm_l: [0, 45, 0] },
};
const clips = [];
for (const [n, o] of Object.entries(tests)) {
  const p = applyOffsets(skel, skel.restPose(), o);
  clips.push({ name: n, fps: 30, poses: [p, p], loop: false, meta: {} });
}
for (const a of [60, -60]) { const p = skel.restPose(); fingerCurl(skel, p, 'both', a); clips.push({ name: 'curl' + a, fps: 30, poses: [p, p], meta: {} }); }
const g = new GLBBuilder(); const ids = addSkeleton(g, skel); addClips(g, skel, ids, clips);
g.write(path.join(REPO, 'game', 'dev', 'test_axes.glb'));
