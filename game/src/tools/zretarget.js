// Re-expresses AnimationClips authored on one rest pose of the game_engine skeleton onto another rest pose
// of the same skeleton (same bone names, same overall A-pose; bone local frames and proportions may differ).
// Per bone b with world rest rotations Ws (source) / Wt (target) and C(b) = Ws(b)^-1 * Wt(b):
//   q_t(b) = C(parent)^-1 * q_s(b) * C(b)
// Translation tracks (pelvis / Root) are rotated into the target parent frame and scaled by the height ratio.
// If both skeletons already share frames (max difference < 0.1 deg) the clips are returned unchanged.
import * as THREE from 'three';

function restInfo(root) {
  root.updateMatrixWorld(true);
  const info = new Map();
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  root.traverse((o) => {
    if (!o.name) return;
    const m = new THREE.Matrix4().multiplyMatrices(rootInv, o.matrixWorld);
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    m.decompose(p, q, s);
    info.set(o.name, { world: q, pos: p, local: o.quaternion.clone(), localPos: o.position.clone(), parent: o.parent });
  });
  return info;
}


/**
 * @param clips      AnimationClip[] from the animation GLB
 * @param srcRoot    scene of the animation GLB (rest pose, not yet animated)
 * @param dstRoot    character scene (rest pose)
 * @returns AnimationClip[] usable on dstRoot (track names `<bone>.quaternion` / `<bone>.position`)
 */
export function retargetClips(clips, srcRoot, dstRoot) {
  const S = restInfo(srcRoot), T = restInfo(dstRoot);
  let maxAng = 0;
  const C = new Map();
  for (const [name, t] of T) {
    const s = S.get(name);
    if (!s) continue;
    const c = s.world.clone().invert().multiply(t.world);
    C.set(name, c);
    const isBone = t.parent && (dstRoot.getObjectByName(name)?.isBone);
    if (isBone) maxAng = Math.max(maxAng, 2 * Math.acos(Math.min(1, Math.abs(c.w))));
  }
  const pelvisS = S.get('pelvis'), pelvisT = T.get('pelvis');
  const hRatio = pelvisS && pelvisT && pelvisS.pos.y > 0.1 ? pelvisT.pos.y / pelvisS.pos.y : 1;
  if (maxAng < 0.002 && Math.abs(hRatio - 1) < 0.02) return clips;
  const out = [];
  for (const clip of clips) {
    const tracks = [];
    for (const tr of clip.tracks) {
      const dot = tr.name.lastIndexOf('.');
      const bone = tr.name.slice(0, dot), prop = tr.name.slice(dot + 1);
      const tNode = dstRoot.getObjectByName(bone);
      if (!tNode || !S.has(bone)) continue;
      const cb = C.get(bone) || new THREE.Quaternion();
      // rest world rotations of the two parents (bones or static nodes): W_t(P_t)^-1 * W_s(P_s)
      const sNodeParent = S.get(bone).parent;
      const wsP = sNodeParent && S.has(sNodeParent.name) && sNodeParent !== srcRoot ? S.get(sNodeParent.name).world : new THREE.Quaternion();
      const wtP = tNode.parent && T.has(tNode.parent.name) && tNode.parent !== dstRoot ? T.get(tNode.parent.name).world : new THREE.Quaternion();
      const cpInv = wtP.clone().invert().multiply(wsP);
      if (prop === 'quaternion') {
        const v = tr.values.slice();
        const q = new THREE.Quaternion();
        for (let i = 0; i < v.length; i += 4) {
          q.fromArray(v, i);
          q.premultiply(cpInv).multiply(cb).normalize();
          q.toArray(v, i);
        }
        tracks.push(new THREE.QuaternionKeyframeTrack(tr.name, tr.times, v));
      } else if (prop === 'position') {
        const v = tr.values.slice();
        const restS = S.get(bone).localPos, restT = T.get(bone).localPos;
        const d = new THREE.Vector3();
        for (let i = 0; i < v.length; i += 3) {
          d.fromArray(v, i).sub(restS).applyQuaternion(cpInv).multiplyScalar(hRatio).add(restT);
          d.toArray(v, i);
        }
        tracks.push(new THREE.VectorKeyframeTrack(tr.name, tr.times, v));
      }
    }
    out.push(new THREE.AnimationClip(clip.name, clip.duration, tracks));
  }
  return out;
}
