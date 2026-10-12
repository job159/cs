import { readGLB } from './gltf-read.mjs';
import { Skeleton } from './skeleton.mjs';
import { poseOffset } from './pose.mjs';
import * as THREE from 'three';
const [clipName, tStr] = process.argv.slice(2);
const d = readGLB('game/assets/zombies/anims.glb');
const skel = new Skeleton();
const clip = d.sampleAnimation(clipName, 30);
const f = Math.min(clip.frames - 1, Math.round(+(tStr || 0) * 30));
const pose = skel.restPose();
for (const [name, tr] of clip.tracks) { const i = skel.index.get(name); if (i === undefined) continue; if (tr.r) pose.q[i] = new THREE.Quaternion(...tr.r[Math.min(f, tr.r.length - 1)]); if (tr.t && name === 'pelvis') pose.root = new THREE.Vector3(...tr.t[Math.min(f, tr.t.length - 1)]); }
for (const n of ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'head', 'clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'hand_l', 'hand_r', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r']) console.log(n.padEnd(11), JSON.stringify(poseOffset(skel, pose, n)));
console.log('root', pose.root.toArray().map(v => v.toFixed(3)));
