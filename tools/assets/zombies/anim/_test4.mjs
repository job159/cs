import path from 'node:path';
import { Skeleton, REPO } from './skeleton.mjs';
import { fromCMU, fromUAL } from './lib.mjs';
import { GLBBuilder, addSkeleton, addClips } from './glb-write.mjs';
import { fixSigns, crop } from './clip.mjs';
import { groundAll } from './ik.mjs';
const skel = new Skeleton();
const clips = [
  crop(fromCMU(skel, '140_01', { heading: 'hips', name: 'c140_01' }), 0.2, 2.2),
  crop(fromCMU(skel, '140_02', { heading: 'hips', name: 'c140_02' }), 0.2, 2.6),
  crop(fromCMU(skel, '90_18', { heading: 'hips', name: 'c90_18' }), 0.5, 2.0),
  fromUAL(skel, 2, 'LayToIdle', { name: 'lay' }),
];
for (const c of clips) { fixSigns(c); groundAll(skel, c, 0.0); }
const g = new GLBBuilder(); const ids = addSkeleton(g, skel); addClips(g, skel, ids, clips);
g.write(path.join(REPO, 'game', 'dev', 'test_falls.glb'));
