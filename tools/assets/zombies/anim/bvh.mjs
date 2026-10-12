// BVH (Biovision hierarchy) parser -> source motion in world space.
// Handles arbitrary channel orders (rotations are applied in the order listed, intrinsic), End Sites
// and multi-root-channel joints. Output units are metres (scale argument), +Y up as in the file.
import * as THREE from 'three';
import fs from 'node:fs';

const DEG = Math.PI / 180;
const AX = { X: new THREE.Vector3(1, 0, 0), Y: new THREE.Vector3(0, 1, 0), Z: new THREE.Vector3(0, 0, 1) };

export function parseBVH(text) {
  const tok = text.split(/\s+/).filter(Boolean);
  let i = 0;
  const next = () => tok[i++];
  const expect = (s) => { const t = next(); if (t !== s) throw new Error(`BVH: expected ${s} got ${t} at ${i}`); };
  const joints = [];
  let nChan = 0;
  expect('HIERARCHY');
  function joint(parent, isEnd) {
    const name = isEnd ? (joints[parent].name + '_end') : next();
    expect('{');
    const j = { name, parent, offset: [0, 0, 0], channels: [], chanStart: nChan, end: !!isEnd };
    const idx = joints.length;
    joints.push(j);
    for (;;) {
      const t = next();
      if (t === 'OFFSET') j.offset = [+next(), +next(), +next()];
      else if (t === 'CHANNELS') { const n = +next(); for (let k = 0; k < n; k++) j.channels.push(next()); nChan += n; }
      else if (t === 'JOINT') joint(idx, false);
      else if (t === 'End') { expect('Site'); joint(idx, true); }
      else if (t === '}') break;
      else throw new Error('BVH: unexpected ' + t);
    }
    return idx;
  }
  expect('ROOT');
  joint(-1, false);
  expect('MOTION');
  expect('Frames:');
  const frames = +next();
  expect('Frame'); expect('Time:');
  const frameTime = +next();
  const data = new Float32Array(frames * nChan);
  for (let k = 0; k < data.length; k++) data[k] = +tok[i++];
  return { joints, frames, frameTime, nChan, data };
}

/**
 * Converts a parsed BVH to a source motion: { names, parent, restWorldP, frames, fps,
 * worldQ: Quaternion[frame][joint], worldP: Vector3[frame][joint] } with positions scaled by `scale`.
 * `step` subsamples frames (e.g. 4 for 120 -> 30 fps); `range` = [first, last] source frames.
 */
export function bvhToMotion(bvh, { scale = 1, fps = 30, range = null } = {}) {
  const { joints } = bvh;
  const names = joints.map((j) => j.name);
  const parent = joints.map((j) => j.parent);
  const srcFps = 1 / bvh.frameTime;
  const [a, b] = range || [0, bvh.frames - 1];
  const nOut = Math.floor(((b - a) / srcFps) * fps) + 1;
  // rest world positions (all rotations identity in a BVH rest pose)
  const restWorldP = [];
  joints.forEach((j, k) => {
    const o = new THREE.Vector3(...j.offset).multiplyScalar(scale);
    restWorldP.push(j.parent < 0 ? o : o.add(restWorldP[j.parent]));
  });
  const localAt = (f) => {
    const base = f * bvh.nChan;
    return joints.map((j) => {
      const q = new THREE.Quaternion();
      const p = new THREE.Vector3(...j.offset).multiplyScalar(scale);
      let hasPos = false;
      const pos = [0, 0, 0];
      j.channels.forEach((c, k) => {
        const v = bvh.data[base + j.chanStart + k];
        if (c.endsWith('rotation')) q.multiply(new THREE.Quaternion().setFromAxisAngle(AX[c[0]], v * DEG));
        else { hasPos = true; pos['XYZ'.indexOf(c[0])] = v * scale; }
      });
      if (hasPos) p.set(pos[0], pos[1], pos[2]).add(new THREE.Vector3(...j.offset).multiplyScalar(scale));
      return { q, p };
    });
  };
  const worldQ = [], worldP = [];
  for (let o = 0; o < nOut; o++) {
    const ft = a + (o / fps) * srcFps;
    const f0 = Math.min(Math.floor(ft), b), f1 = Math.min(f0 + 1, b), u = ft - f0;
    const L0 = localAt(f0), L1 = f1 === f0 ? L0 : localAt(f1);
    const wq = [], wp = [];
    for (let k = 0; k < joints.length; k++) {
      const q = L0[k].q.clone().slerp(L1[k].q, u);
      const p = L0[k].p.clone().lerp(L1[k].p, u);
      const pp = parent[k];
      if (pp < 0) { wq.push(q); wp.push(p); continue; }
      wq.push(wq[pp].clone().multiply(q));
      wp.push(p.applyQuaternion(wq[pp]).add(wp[pp]));
    }
    worldQ.push(wq); worldP.push(wp);
  }
  return { names, parent, restWorldP, restWorldQ: names.map(() => new THREE.Quaternion()), fps, frames: nOut, worldQ, worldP };
}

export function loadBVH(file, opts) {
  return bvhToMotion(parseBVH(fs.readFileSync(file, 'utf8')), opts);
}
