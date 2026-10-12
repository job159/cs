// game_engine skeleton from MPFB2's rig.game_engine.json (CC0 data). Joint positions are re-derived on the
// MORPHED base mesh (CUBE = centroid of the joint-* helper cube, MEAN = centroid of listed vertices), and the
// bone frames follow Blender's edit-bone convention (local +Y runs head -> tail, X/Z from the stored roll),
// expressed in glTF space (+Y up, facing +Z) exactly like a Blender glTF export of the MPFB2 rig would be:
// world frame = A * R_blender, A = Blender->glTF axis change (x, y, z) -> (x, z, -y).
import fs from 'node:fs';
import * as THREE from 'three';
import { mpfb2 } from './fetch.mjs';

export const SEGMENTS = ['torso', 'head', 'upperarm_l', 'lowerarm_l', 'upperarm_r', 'lowerarm_r', 'thigh_l', 'calf_l', 'thigh_r', 'calf_r'];

/** Dismemberment segment (contract '_seg') of a game_engine bone. */
export function boneSegment(name) {
  if (name === 'neck_01' || name === 'head') return 1;
  if (name === 'upperarm_l') return 2;
  if (name === 'lowerarm_l' || name === 'hand_l' || /_0\d_l$/.test(name)) return 3;
  if (name === 'upperarm_r') return 4;
  if (name === 'lowerarm_r' || name === 'hand_r' || /_0\d_r$/.test(name)) return 5;
  if (name === 'thigh_l') return 6;
  if (name === 'calf_l' || name === 'foot_l' || name === 'ball_l') return 7;
  if (name === 'thigh_r') return 8;
  if (name === 'calf_r' || name === 'foot_r' || name === 'ball_r') return 9;
  return 0; // Root, pelvis, spine_*, clavicles
}

// Blender's vec_roll_to_mat3_normalized (math only): rotation taking +Y onto `nor`, then rolled about it.
function vecRollToMat3(nor, roll) {
  const [x, y, z] = nor;
  let theta = 1 + y;
  const thetaAlt = x * x + z * z;
  const b = new THREE.Matrix3();
  if (theta > 6.1e-3 || thetaAlt > 2.5e-4 * 2.5e-4) {
    if (theta <= 6.1e-3) theta = thetaAlt * 0.5 + thetaAlt * thetaAlt * 0.125;
    // columns: X axis, Y axis (= nor), Z axis
    b.set(
      1 - (x * x) / theta, x, -(x * z) / theta,
      -x, y, -z,
      -(x * z) / theta, z, 1 - (z * z) / theta,
    );
  } else {
    b.set(-1, 0, 0, 0, -1, 0, 0, 0, 1);
  }
  const r = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(x, y, z), roll));
  return r.multiply(b);
}

const A = new THREE.Matrix3().set(1, 0, 0, 0, 0, 1, 0, -1, 0); // Blender -> glTF
const Ainv = A.clone().invert();

let rigCache = null;
export async function loadRigJSON() {
  if (!rigCache) rigCache = JSON.parse(fs.readFileSync(await mpfb2('rigs/standard/rig.game_engine.json'), 'utf8'));
  return rigCache;
}
let weightCache = null;
export async function loadWeightsJSON() {
  if (!weightCache) weightCache = JSON.parse(fs.readFileSync(await mpfb2('rigs/standard/weights.game_engine.json'), 'utf8')).weights;
  return weightCache;
}

/**
 * Builds bones from the morphed base mesh.
 * @param baseObj loadOBJ(base.obj) (for the joint-* groups)
 * @param pos     morphed base positions already converted to glTF metres (Float32Array, Y up, ground at 0)
 * @returns {bones: [{name, parent, head:Vector3, tail:Vector3, world:Quaternion, localPos, localQuat}], byName}
 */
export async function buildSkeleton(baseObj, pos) {
  const rig = await loadRigJSON();
  const centroid = (list) => {
    const v = new THREE.Vector3();
    let n = 0;
    for (const i of list) { v.x += pos[i * 3]; v.y += pos[i * 3 + 1]; v.z += pos[i * 3 + 2]; n++; }
    return v.multiplyScalar(1 / n);
  };
  const joint = (j) => {
    if (j.strategy === 'CUBE') return centroid(baseObj.groupVerts(j.cube_name));
    if (j.strategy === 'MEAN' || j.strategy === 'VERTEX') return centroid(j.vertex_indices || [j.vertex_index]);
    throw new Error('unknown joint strategy ' + j.strategy);
  };
  // parents before children
  const names = [];
  const visit = (n) => { if (names.includes(n)) return; const p = rig[n].parent; if (p) visit(p); names.push(n); };
  Object.keys(rig).forEach(visit);
  const bones = [];
  const byName = {};
  for (const name of names) {
    const r = rig[name];
    const head = joint(r.head), tail = joint(r.tail);
    const dirG = tail.clone().sub(head);
    if (dirG.lengthSq() < 1e-12) dirG.set(0, 0, -1);
    dirG.normalize();
    const dirB = dirG.clone().applyMatrix3(Ainv);
    const Rb = vecRollToMat3([dirB.x, dirB.y, dirB.z], r.roll || 0);
    const Wg = A.clone().multiply(Rb);
    const m4 = new THREE.Matrix4().setFromMatrix3(Wg);
    const world = new THREE.Quaternion().setFromRotationMatrix(m4).normalize();
    const bone = { name, parent: r.parent ? byName[r.parent].index : -1, head, tail, world, index: bones.length };
    bones.push(bone);
    byName[name] = bone;
  }
  for (const b of bones) {
    if (b.parent < 0) { b.localPos = b.head.clone(); b.localQuat = b.world.clone(); continue; }
    const p = bones[b.parent];
    const inv = p.world.clone().invert();
    b.localPos = b.head.clone().sub(p.head).applyQuaternion(inv);
    b.localQuat = inv.multiply(b.world).normalize();
  }
  return { bones, byName };
}

/** Per base-vertex top-4 weights as {idx: Uint16Array(n*4), w: Float32Array(n*4)} with bone indices. */
export async function baseWeights(skel, nVerts) {
  const W = await loadWeightsJSON();
  const lists = Array.from({ length: nVerts }, () => []);
  for (const [bone, arr] of Object.entries(W)) {
    const b = skel.byName[bone];
    if (!b) continue;
    for (const [v, w] of arr) if (v < nVerts && w > 0) lists[v].push([b.index, w]);
  }
  return lists;
}
