// Authoring helper: inspect a clip of the built library.
//   node tools/assets/zombies/anim/inspect.mjs <clip> [time]          joint positions + bone offsets at time
//   node tools/assets/zombies/anim/inspect.mjs <clip> --steps <bone>   per-frame rotation step (deg) of a bone
// Offsets are printed in the pose.mjs key convention ([x, y, z] degrees relative to the rest pose), so
// they can be pasted into keys (remember keys are additive to the clip's base pose).
import * as THREE from 'three';
import path from 'node:path';
import { readGLB } from './gltf-read.mjs';
import { Skeleton, REPO } from './skeleton.mjs';
import { poseOffset } from './pose.mjs';

const args = process.argv.slice(2);
const [clipName] = args;
if (!clipName) { console.log('usage: inspect.mjs <clip> [time] | --steps <bone>'); process.exit(1); }
const d = readGLB(path.join(REPO, 'game', 'assets', 'zombies', 'anims.glb'));
const skel = new Skeleton();
const clip = d.sampleAnimation(clipName, 30);

const poseAt = (f) => {
  const pose = skel.restPose();
  for (const [name, tr] of clip.tracks) {
    const i = skel.index.get(name);
    if (i === undefined) continue;
    if (tr.r) pose.q[i] = new THREE.Quaternion(...tr.r[Math.min(f, tr.r.length - 1)]);
    if (tr.t && name === 'pelvis') pose.root = new THREE.Vector3(...tr.t[Math.min(f, tr.t.length - 1)]);
  }
  return pose;
};

const si = args.indexOf('--steps');
if (si >= 0) {
  const bone = args[si + 1];
  const r = clip.tracks.get(bone).r;
  const out = [];
  for (let f = 1; f < r.length; f++) {
    const a = r[f - 1], b = r[f];
    const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
    out.push(`${f}:${(2 * Math.acos(Math.min(1, dot)) * 180 / Math.PI).toFixed(0)}`);
  }
  console.log(`${clipName} ${bone} per-frame step (deg):\n${out.join(' ')}`);
} else {
  const f = Math.min(clip.frames - 1, Math.round(+(args[1] || 0) * 30));
  const pose = poseAt(f);
  const fk = skel.fk(pose);
  console.log(`${clipName} @ ${(f / 30).toFixed(2)}s  root ${pose.root.toArray().map((v) => v.toFixed(3)).join(' ')}`);
  for (const n of ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'head', 'clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'hand_l', 'hand_r', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r']) {
    const p = fk.wp[skel.i(n)];
    console.log(`${n.padEnd(11)} pos ${p.toArray().map((v) => v.toFixed(2).padStart(6)).join(' ')}   offset ${JSON.stringify(poseOffset(skel, pose, n))}`);
  }
}
