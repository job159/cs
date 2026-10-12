// Fallback character: a skinned capsule mannequin on the same bone names as the game_engine rig, with
// procedural clips. Used only when the real zombie assets (game/assets/zombies/*.glb, anims.glb) are
// missing, so the AI / hit / gore code always has something to drive.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// [name, parent, local offset (x,y,z) from parent in metres]  (character faces +Z)
const BONES = [
  ['root', null, [0, 0, 0]],
  ['pelvis', 'root', [0, 0.98, 0]],
  ['spine_01', 'pelvis', [0, 0.1, 0]], ['spine_02', 'spine_01', [0, 0.14, 0]], ['spine_03', 'spine_02', [0, 0.16, 0]],
  ['neck_01', 'spine_03', [0, 0.17, 0]], ['head', 'neck_01', [0, 0.1, 0.01]],
  ['clavicle_l', 'spine_03', [0.04, 0.12, 0]], ['upperarm_l', 'clavicle_l', [0.15, 0, 0]], ['lowerarm_l', 'upperarm_l', [0, -0.28, 0]], ['hand_l', 'lowerarm_l', [0, -0.26, 0]],
  ['clavicle_r', 'spine_03', [-0.04, 0.12, 0]], ['upperarm_r', 'clavicle_r', [-0.15, 0, 0]], ['lowerarm_r', 'upperarm_r', [0, -0.28, 0]], ['hand_r', 'lowerarm_r', [0, -0.26, 0]],
  ['thigh_l', 'pelvis', [0.1, -0.05, 0]], ['calf_l', 'thigh_l', [0, -0.43, 0]], ['foot_l', 'calf_l', [0, -0.42, 0]],
  ['thigh_r', 'pelvis', [-0.1, -0.05, 0]], ['calf_r', 'thigh_r', [0, -0.43, 0]], ['foot_r', 'calf_r', [0, -0.42, 0]],
];
// capsules: [bone, radius, length along local -Y (0 = sphere), offset]
const SHAPES = [
  ['pelvis', 0.15, 0.1, [0, 0.03, 0]], ['spine_02', 0.17, 0.22, [0, 0.05, 0]], ['spine_03', 0.18, 0.12, [0, 0.08, 0]],
  ['head', 0.11, 0.08, [0, 0.1, 0.02]], ['neck_01', 0.06, 0.08, [0, 0.05, 0]],
  ['upperarm_l', 0.055, 0.26, [0, -0.13, 0]], ['lowerarm_l', 0.045, 0.24, [0, -0.12, 0]], ['hand_l', 0.045, 0.08, [0, -0.06, 0]],
  ['upperarm_r', 0.055, 0.26, [0, -0.13, 0]], ['lowerarm_r', 0.045, 0.24, [0, -0.12, 0]], ['hand_r', 0.045, 0.08, [0, -0.06, 0]],
  ['thigh_l', 0.075, 0.4, [0, -0.2, 0]], ['calf_l', 0.06, 0.38, [0, -0.2, 0]], ['foot_l', 0.05, 0.14, [0, -0.04, 0.06], 'z'],
  ['thigh_r', 0.075, 0.4, [0, -0.2, 0]], ['calf_r', 0.06, 0.38, [0, -0.2, 0]], ['foot_r', 0.05, 0.14, [0, -0.04, 0.06], 'z'],
];

export function buildMannequin(color = 0x6d7a5f) {
  const bones = {};
  const list = [];
  for (const [name, parent, off] of BONES) {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(...off);
    if (parent) bones[parent].add(b);
    bones[name] = b;
    list.push(b);
  }
  bones.root.updateMatrixWorld(true);
  const geos = [];
  for (const [bone, r, len, off, axis] of SHAPES) {
    const g = len > 0 ? new THREE.CapsuleGeometry(r, len, 4, 10) : new THREE.SphereGeometry(r, 10, 8);
    if (axis === 'z') g.rotateX(Math.PI / 2);
    g.translate(...off);
    g.applyMatrix4(bones[bone].matrixWorld);
    const bi = list.indexOf(bones[bone]);
    const n = g.attributes.position.count;
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4).fill(0).map((v, i) => (i % 4 === 0 ? bi : 0)), 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(n * 4).map((v, i) => (i % 4 === 0 ? 1 : 0)), 4));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'skinIndex', 'skinWeight'].includes(k)) g.deleteAttribute(k);
    geos.push(g);
  }
  const geo = mergeGeometries(geos);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const mesh = new THREE.SkinnedMesh(geo, mat);
  const skeleton = new THREE.Skeleton(list);
  const root = new THREE.Group();
  root.add(bones.root);
  mesh.bind(skeleton);
  root.add(mesh);
  mesh.frustumCulled = false;
  root.userData = { type: 'mannequin', height: 1.75 };
  return { scene: root, animations: mannequinClips() };
}

function q(x, y, z) { return new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)).toArray(); }

function track(bone, times, eulers) {
  return new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, eulers.flatMap((e) => q(...e)));
}

function mannequinClips() {
  const T = [0, 0.25, 0.5, 0.75, 1];
  const walk = new THREE.AnimationClip('walk_a', 1, [
    track('thigh_l', T, [[0.45, 0, 0], [0, 0, 0], [-0.4, 0, 0], [0, 0, 0], [0.45, 0, 0]]),
    track('thigh_r', T, [[-0.4, 0, 0], [0, 0, 0], [0.45, 0, 0], [0, 0, 0], [-0.4, 0, 0]]),
    track('calf_l', T, [[-0.2, 0, 0], [-0.7, 0, 0], [-0.1, 0, 0], [-0.2, 0, 0], [-0.2, 0, 0]]),
    track('calf_r', T, [[-0.1, 0, 0], [-0.2, 0, 0], [-0.2, 0, 0], [-0.7, 0, 0], [-0.1, 0, 0]]),
    track('upperarm_l', T, [[-1.2, 0, -0.2], [-1.3, 0, -0.25], [-1.15, 0, -0.2], [-1.3, 0, -0.25], [-1.2, 0, -0.2]]),
    track('upperarm_r', T, [[-1.3, 0, 0.25], [-1.15, 0, 0.2], [-1.3, 0, 0.25], [-1.2, 0, 0.2], [-1.3, 0, 0.25]]),
    track('spine_02', T, [[0.25, 0.08, 0.05], [0.28, 0, 0], [0.25, -0.08, -0.05], [0.28, 0, 0], [0.25, 0.08, 0.05]]),
    track('head', T, [[0.1, 0.2, 0.3], [0.15, 0.1, 0.25], [0.1, 0.2, 0.3], [0.15, 0.1, 0.25], [0.1, 0.2, 0.3]]),
  ]);
  const run = walk.clone(); run.name = 'run';
  const attack = new THREE.AnimationClip('attack_a', 1, [
    track('upperarm_l', [0, 0.35, 0.55, 1], [[-1.2, 0, -0.2], [-2.4, 0, -0.6], [-0.8, 0, 0.3], [-1.2, 0, -0.2]]),
    track('upperarm_r', [0, 0.35, 0.55, 1], [[-1.3, 0, 0.25], [-2.5, 0, 0.6], [-0.7, 0, -0.3], [-1.3, 0, 0.25]]),
    track('spine_02', [0, 0.35, 0.55, 1], [[0.25, 0, 0], [-0.1, 0, 0], [0.5, 0, 0], [0.25, 0, 0]]),
  ]);
  const death = new THREE.AnimationClip('death_back', 1.2, [
    track('pelvis', [0, 0.6, 1.2], [[0, 0, 0], [-0.8, 0, 0], [-1.5, 0, 0]]),
    new THREE.VectorKeyframeTrack('pelvis.position', [0, 0.6, 1.2], [0, 0.98, 0, 0, 0.6, -0.3, 0, 0.18, -0.6]),
    track('upperarm_l', [0, 1.2], [[-1.2, 0, -0.2], [-0.3, 0, -1.2]]), track('upperarm_r', [0, 1.2], [[-1.3, 0, 0.25], [-0.3, 0, 1.2]]),
  ]);
  const deathF = new THREE.AnimationClip('death_front', 1.2, [
    track('pelvis', [0, 0.6, 1.2], [[0, 0, 0], [0.8, 0, 0], [1.5, 0, 0]]),
    new THREE.VectorKeyframeTrack('pelvis.position', [0, 0.6, 1.2], [0, 0.98, 0, 0, 0.6, 0.3, 0, 0.18, 0.6]),
  ]);
  const idle = new THREE.AnimationClip('idle', 2, [track('spine_02', [0, 1, 2], [[0.3, 0, 0.05], [0.35, 0, -0.05], [0.3, 0, 0.05]])]);
  return [walk, run, attack, death, deathF, idle];
}
