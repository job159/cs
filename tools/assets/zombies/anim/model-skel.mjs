// Clips authored on one character's own proportions.
//
// The game plays library clips through a world-space rotation retarget (game/src/zombies/retarget.js:
// Wd = Ws * Ws_rest^-1 * Wd_rest, pelvis offset scaled by the pelvis-height ratio). Rotations carry over, bone
// lengths do not: a character with longer forearms / shins than the library body puts IK-planted hands and feet a
// few centimetres into (or above) the floor. Clips made for one character (the crawler's quadruped set) are
// therefore posed on that character's skeleton (rest pose read from its GLB) and converted with toLibrary() into
// the library rotations that the game's retarget maps back onto exactly that pose.
import * as THREE from 'three';
import path from 'node:path';
import { readGLB } from './gltf-read.mjs';
import { Skeleton, REPO } from './skeleton.mjs';

/** Skeleton (same names / hierarchy as `lib`) with the rest pose of game/assets/zombies/<id>.glb. */
export function modelSkeleton(lib, id) {
  const d = readGLB(path.join(REPO, 'game', 'assets', 'zombies', `${id}.glb`));
  const W = new Map();
  const world = (i) => {
    if (W.has(i)) return W.get(i);
    const n = d.nodes[i];
    const loc = n.matrix ? new THREE.Matrix4().fromArray(n.matrix)
      : new THREE.Matrix4().compose(new THREE.Vector3(...n.t), new THREE.Quaternion(...n.r), new THREE.Vector3(...n.s));
    const w = n.parent >= 0 ? world(n.parent).clone().multiply(loc) : loc;
    W.set(i, w);
    return w;
  };
  const s = Object.create(Skeleton.prototype);
  for (const k of ['names', 'index', 'parent', 'children']) s[k] = lib[k];
  s.restWorldQ = []; s.restWorldP = [];
  for (const name of lib.names) {
    const n = d.nodeByName(name);
    if (!n) throw new Error(`${id}: bone ${name} missing`);
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    world(n.index).decompose(p, q, sc);
    s.restWorldQ.push(q); s.restWorldP.push(p);
  }
  s.restLocalQ = []; s.restLocalP = [];
  for (let i = 0; i < s.names.length; i++) {
    const p = s.parent[i];
    if (p < 0) { s.restLocalQ.push(s.restWorldQ[i].clone()); s.restLocalP.push(s.restWorldP[i].clone()); continue; }
    const pqi = s.restWorldQ[p].clone().invert();
    s.restLocalQ.push(pqi.clone().multiply(s.restWorldQ[i]));
    s.restLocalP.push(s.restWorldP[i].clone().sub(s.restWorldP[p]).applyQuaternion(pqi));
  }
  // tails: the head of the child the library bone ends on, else the library tail scaled like the parent bone
  s.tailWorldP = s.names.map((_, i) => {
    const libTail = lib.tailWorldP[i];
    const c = lib.children[i].find((k) => lib.restWorldP[k].distanceTo(libTail) < 1e-3);
    if (c !== undefined) return s.restWorldP[c].clone();
    const p = s.parent[i];
    const k = p >= 0 && lib.length[p] > 1e-4 ? s.restWorldP[i].distanceTo(s.restWorldP[p]) / lib.restWorldP[i].distanceTo(lib.restWorldP[p]) : 1;
    const local = libTail.clone().sub(lib.restWorldP[i]).applyQuaternion(lib.restWorldQ[i].clone().invert()).multiplyScalar(Number.isFinite(k) && k > 0 ? k : 1);
    return local.applyQuaternion(s.restWorldQ[i]).add(s.restWorldP[i]);
  });
  s.length = s.names.map((_, i) => s.tailWorldP[i].distanceTo(s.restWorldP[i]));
  const pel = lib.i('pelvis');
  s.model = id;
  s.heightRatio = s.restWorldP[pel].y / lib.restWorldP[pel].y;
  s.extras = d.json.scenes?.[d.json.scene || 0]?.extras || {};
  return s;
}

/**
 * Converts a clip posed on model skeleton `ms` into library-skeleton poses (in place): every bone's world rotation
 * becomes W * Wm_rest^-1 * Wl_rest and the pelvis offset is divided by the pelvis-height ratio, the inverse of the
 * game's retarget.
 */
export function toLibrary(lib, ms, clip) {
  const pel = lib.i('pelvis');
  const delta = lib.names.map((_, i) => ms.restWorldQ[i].clone().invert().multiply(lib.restWorldQ[i]));
  clip.poses = clip.poses.map((P) => {
    const fk = ms.fk(P);
    const G = fk.wq.map((w, i) => w.clone().multiply(delta[i]));
    const q = G.map((g, i) => (lib.parent[i] < 0 ? g.clone() : G[lib.parent[i]].clone().invert().multiply(g)));
    const root = P.root.clone().sub(ms.restWorldP[pel]).divideScalar(ms.heightRatio).add(lib.restWorldP[pel]);
    return { q, root };
  });
  return clip;
}

/** The character's extras.poseOffsets (local euler degrees, applied after the mixer in the game) on a model pose. */
export function applyModelOffsets(ms, pose) {
  const e = new THREE.Euler();
  for (const [bone, deg] of Object.entries(ms.extras.poseOffsets || {})) {
    const i = ms.index.get(bone);
    if (i === undefined) continue;
    pose.q[i].multiply(new THREE.Quaternion().setFromEuler(e.set(deg[0] * Math.PI / 180, (deg[1] || 0) * Math.PI / 180, (deg[2] || 0) * Math.PI / 180)));
  }
  return pose;
}
