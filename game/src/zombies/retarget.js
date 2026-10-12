// Runtime animation retargeting between two skeletons that share bone names but may differ in rest
// pose, root orientation (Z-up vs Y-up armatures) and proportions. For every keyframe the source pose
// is evaluated in world space and the world-space delta from the source rest pose is applied to the
// destination rest pose:  Qd = Qs * Ws_rest^-1 * Wd_rest ; then converted back to dst local rotations.
// The pelvis (hips) translation is carried over as a world-space offset scaled by the height ratio.
import * as THREE from 'three';

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();

function collect(root) {
  const bones = {};
  root.updateMatrixWorld(true);
  root.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  return bones;
}

/** Rest data: world quaternion + world position per bone, in the space of `root`. */
function restInfo(root, bones) {
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const info = {};
  for (const [n, b] of Object.entries(bones)) {
    _m.multiplyMatrices(inv, b.matrixWorld);
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    _m.decompose(p, q, s);
    info[n] = { q, p, local: b.quaternion.clone(), localPos: b.position.clone(), parent: b.parent };
  }
  // parent world rotation of the non-bone ancestors (armature nodes) for the topmost bones
  return info;
}

function boneOrder(bones) {
  // parents before children
  const order = [];
  const seen = new Set();
  const visit = (b) => { if (seen.has(b.name)) return; if (b.parent?.isBone) visit(b.parent); seen.add(b.name); order.push(b.name); };
  for (const b of Object.values(bones)) visit(b);
  return order;
}

/**
 * @param {THREE.AnimationClip[]} clips   clips authored for srcRoot's skeleton
 * @param {THREE.Object3D} srcRoot         scene containing the source skeleton in rest pose
 * @param {THREE.Object3D} dstRoot         scene containing the destination skeleton in rest pose
 * @returns {THREE.AnimationClip[]}        clips for the destination skeleton (same names)
 */
export function retargetClips(clips, srcRoot, dstRoot, { fps = 30 } = {}) {
  const sb = collect(srcRoot), db = collect(dstRoot);
  const names = Object.keys(db).filter((n) => sb[n]);
  if (!names.length) return clips;
  const sRest = restInfo(srcRoot, sb), dRest = restInfo(dstRoot, db);
  const sOrder = boneOrder(sb).filter((n) => sb[n]);
  const dOrder = boneOrder(db).filter((n) => names.includes(n));
  // world rotation of each skeleton's non-bone ancestors (e.g. a rotated armature root)
  const ancestorQ = (root, bone) => {
    let a = bone.parent; const chain = [];
    while (a && a !== root && !a.isBone) { chain.push(a); a = a.parent; }
    const q = new THREE.Quaternion();
    for (let i = chain.length - 1; i >= 0; i--) q.multiply(chain[i].quaternion);
    return q;
  };
  const hips = sb.pelvis ? 'pelvis' : sb.hips ? 'hips' : null;
  const heightRatio = hips && db[hips] ? (dRest[hips].p.y || 1) / (sRest[hips].p.y || 1) : 1;
  const out = [];
  for (const clip of clips) {
    const frames = Math.max(2, Math.round(clip.duration * fps) + 1);
    const times = new Float32Array(frames);
    for (let f = 0; f < frames; f++) times[f] = Math.min(clip.duration, f / fps);
    // sample the source clip on the source skeleton with a mixer
    const mixer = new THREE.AnimationMixer(srcRoot);
    const action = mixer.clipAction(clip);
    action.play();
    const qVals = {}; for (const n of dOrder) qVals[n] = new Float32Array(frames * 4);
    const hipVals = hips && db[hips] ? new Float32Array(frames * 3) : null;
    const sW = {}, dW = {};
    for (let f = 0; f < frames; f++) {
      mixer.setTime(times[f]);
      srcRoot.updateMatrixWorld(true);
      // source world rotations (relative to srcRoot)
      for (const n of sOrder) {
        const b = sb[n];
        const pw = b.parent?.isBone ? sW[b.parent.name] : ancestorQ(srcRoot, b);
        sW[n] = (sW[n] || new THREE.Quaternion()).copy(pw).multiply(b.quaternion);
      }
      // destination world rotations and locals
      for (const n of dOrder) {
        const b = db[n];
        const qd = (dW[n] || (dW[n] = new THREE.Quaternion()));
        qd.copy(sW[n]).multiply(_q.copy(sRest[n].q).invert()).multiply(dRest[n].q);
        const pw = b.parent?.isBone && dW[b.parent.name] ? dW[b.parent.name] : ancestorQ(dstRoot, b);
        _q2.copy(pw).invert().multiply(qd);
        _q2.toArray(qVals[n], f * 4);
      }
      if (hipVals) {
        // hips: world offset from rest, scaled, expressed in the dst hips' parent space
        const sh = sb[hips];
        _m.copy(srcRoot.matrixWorld).invert().multiply(sh.matrixWorld);
        _v.setFromMatrixPosition(_m).sub(sRest[hips].p).multiplyScalar(heightRatio).add(dRest[hips].p);
        const dp = db[hips].parent;
        const pm = new THREE.Matrix4();
        if (dp && dp !== dstRoot) { dp.updateWorldMatrix(true, false); pm.copy(dstRoot.matrixWorld).invert().multiply(dp.matrixWorld).invert(); }
        _v.applyMatrix4(pm);
        _v.toArray(hipVals, f * 3);
      }
    }
    action.stop();
    mixer.uncacheRoot(srcRoot);
    const tracks = dOrder.map((n) => new THREE.QuaternionKeyframeTrack(`${n}.quaternion`, times, qVals[n]));
    if (hipVals) tracks.push(new THREE.VectorKeyframeTrack(`${hips}.position`, times, hipVals));
    out.push(new THREE.AnimationClip(clip.name, clip.duration, tracks));
  }
  // leave the source skeleton in rest pose
  for (const n of Object.keys(sb)) { sb[n].quaternion.copy(sRest[n].local); sb[n].position.copy(sRest[n].localPos); }
  return out;
}
