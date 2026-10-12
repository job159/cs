// dev: print joint heights of a clip frame from the built anims.glb
import { readGLB } from './gltf-read.mjs';
import { Skeleton } from './skeleton.mjs';
import * as THREE from 'three';
const [clipName, tStr] = process.argv.slice(2);
const d = readGLB('game/assets/zombies/anims.glb');
const skel = new Skeleton();
const clip = d.sampleAnimation(clipName, 30);
const f = Math.min(clip.frames - 1, Math.round(+tStr * 30));
const pose = skel.restPose();
for (const [name, tr] of clip.tracks) { const i = skel.index.get(name); if (i === undefined) continue; if (tr.r) pose.q[i] = new THREE.Quaternion(...tr.r[Math.min(f, tr.r.length - 1)]); if (tr.t && name === 'pelvis') pose.root = new THREE.Vector3(...tr.t[Math.min(f, tr.t.length - 1)]); }
const fk = skel.fk(pose);
for (const n of ['pelvis', 'spine_03', 'head', 'hand_l', 'hand_r', 'calf_l', 'foot_l', 'ball_l', 'foot_r']) { const p = fk.wp[skel.i(n)]; console.log(n.padEnd(10), p.toArray().map(v => v.toFixed(2)).join(' ')); }
console.log('head tail', skel.tail(fk, skel.i('head')).toArray().map(v => v.toFixed(2)).join(' '));
