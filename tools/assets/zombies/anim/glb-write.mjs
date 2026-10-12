// Small GLB builder (skeleton nodes, optional skinned mesh, animations, extras).
import fs from 'node:fs';
import path from 'node:path';

export class GLBBuilder {
  constructor() {
    this.json = { asset: { version: '2.0', generator: 'calamity-front zombie anim tools' }, scenes: [{ nodes: [] }], scene: 0, nodes: [], buffers: [], bufferViews: [], accessors: [] };
    this.chunks = [];
    this.byteLength = 0;
  }

  _view(bytes, target) {
    const pad = (4 - (this.byteLength % 4)) % 4;
    if (pad) { this.chunks.push(Buffer.alloc(pad)); this.byteLength += pad; }
    const view = { buffer: 0, byteOffset: this.byteLength, byteLength: bytes.byteLength };
    if (target) view.target = target;
    this.chunks.push(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    this.byteLength += bytes.byteLength;
    this.json.bufferViews.push(view);
    return this.json.bufferViews.length - 1;
  }

  /** Adds an accessor. arr: typed array; type: SCALAR/VEC2/VEC3/VEC4/MAT4. */
  accessor(arr, type, { target, normalized, minmax } = {}) {
    const ct = arr instanceof Float32Array ? 5126 : arr instanceof Uint32Array ? 5125 : arr instanceof Uint16Array ? 5123 : arr instanceof Uint8Array ? 5121 : null;
    if (!ct) throw new Error('unsupported array type');
    const nc = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[type];
    const acc = { bufferView: this._view(arr, target), componentType: ct, count: arr.length / nc, type };
    if (normalized) acc.normalized = true;
    if (minmax) {
      const mn = new Array(nc).fill(Infinity), mx = new Array(nc).fill(-Infinity);
      for (let i = 0; i < arr.length; i++) { const c = i % nc; mn[c] = Math.min(mn[c], arr[i]); mx[c] = Math.max(mx[c], arr[i]); }
      acc.min = mn; acc.max = mx;
    }
    this.json.accessors.push(acc);
    return this.json.accessors.length - 1;
  }

  node(n) { this.json.nodes.push(n); return this.json.nodes.length - 1; }

  write(file) {
    const bin = Buffer.concat(this.chunks);
    const binPad = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
    this.json.buffers = [{ byteLength: binPad.length }];
    for (const k of ['meshes', 'skins', 'animations', 'materials']) if (this.json[k] && !this.json[k].length) delete this.json[k];
    let js = Buffer.from(JSON.stringify(this.json), 'utf8');
    js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
    const total = 12 + 8 + js.length + 8 + binPad.length;
    const head = Buffer.alloc(12);
    head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
    const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
    const bh = Buffer.alloc(8); bh.writeUInt32LE(binPad.length, 0); bh.writeUInt32LE(0x004e4942, 4);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.concat([head, jh, js, bh, binPad]));
    return total;
  }
}

/**
 * Adds the skeleton as nodes. Returns array of node indices (same order as skel.names).
 * The root bone is added to the scene.
 */
export function addSkeleton(g, skel) {
  const ids = skel.names.map((name, i) => g.node({
    name,
    translation: skel.restLocalP[i].toArray().map((v) => +v.toFixed(6)),
    rotation: skel.restLocalQ[i].toArray().map((v) => +v.toFixed(7)),
  }));
  skel.names.forEach((_, i) => {
    const p = skel.parent[i];
    if (p >= 0) (g.json.nodes[ids[p]].children ||= []).push(ids[i]);
  });
  g.json.scenes[0].nodes.push(ids[0]);
  return ids;
}

/** Greedy key reduction for a sampled track. vals: array of arrays. Returns kept frame indices. */
function reduceKeys(vals, isQuat, tol) {
  const n = vals.length;
  const err = (a, b, u, ref) => {
    if (isQuat) {
      // slerp approx via nlerp (fine for small spans)
      let d = 0; const s = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
      const m = a.map((v, i) => v * (1 - u) + s * b[i] * u); const l = Math.hypot(...m);
      d = Math.abs(m[0] * ref[0] + m[1] * ref[1] + m[2] * ref[2] + m[3] * ref[3]) / l;
      return 2 * Math.acos(Math.min(1, d));
    }
    let d = 0; for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] * (1 - u) + b[i] * u - ref[i]));
    return d;
  };
  // constant?
  let constant = true;
  for (let f = 1; f < n && constant; f++) if (err(vals[0], vals[0], 0, vals[f]) > tol) constant = false;
  if (constant) return [0];
  const keep = [0];
  let a = 0;
  while (a < n - 1) {
    let b = a + 1;
    for (let c = a + 2; c < n; c++) {
      let ok = true;
      for (let m = a + 1; m < c && ok; m++) if (err(vals[a], vals[c], (m - a) / (c - a), vals[m]) > tol) ok = false;
      if (!ok) break;
      b = c;
    }
    keep.push(b);
    a = b;
  }
  return keep;
}

/**
 * Adds clips as glTF animations. clip.poses[f].q (local quats per bone), clip.poses[f].root (pelvis).
 * Every bone gets a rotation channel (single key when constant) so blending never leaves stale bones.
 */
export function addClips(g, skel, nodeIds, clips, { rotTol = 0.0025, posTol = 0.0004 } = {}) {
  g.json.animations ||= [];
  const pel = skel.i('pelvis');
  let keys = 0;
  for (const c of clips) {
    const anim = { name: c.name, channels: [], samplers: [] };
    const n = c.poses.length;
    const times = new Float32Array(n);
    for (let f = 0; f < n; f++) times[f] = f / c.fps;
    const timeCache = new Map();
    const timeAcc = (idx) => {
      const k = idx.join(',');
      if (!timeCache.has(k)) timeCache.set(k, g.accessor(new Float32Array(idx.map((f) => times[f])), 'SCALAR', { minmax: true }));
      return timeCache.get(k);
    };
    skel.names.forEach((name, i) => {
      if (i === 0) return; // Root is never animated (in place)
      const vals = c.poses.map((p) => p.q[i].toArray());
      const kept = reduceKeys(vals, true, rotTol);
      const out = new Float32Array(kept.length * 4);
      kept.forEach((f, k) => out.set(vals[f], k * 4));
      anim.samplers.push({ input: timeAcc(kept), output: g.accessor(out, 'VEC4'), interpolation: 'LINEAR' });
      anim.channels.push({ sampler: anim.samplers.length - 1, target: { node: nodeIds[i], path: 'rotation' } });
      keys += kept.length;
    });
    const pv = c.poses.map((p) => p.root.toArray());
    let kept = reduceKeys(pv, false, posTol);
    if (kept.length === 1) kept = [0, n - 1]; // the root track always spans the whole clip
    const out = new Float32Array(kept.length * 3);
    kept.forEach((f, k) => out.set(pv[f], k * 3));
    anim.samplers.push({ input: timeAcc(kept), output: g.accessor(out, 'VEC3'), interpolation: 'LINEAR' });
    anim.channels.push({ sampler: anim.samplers.length - 1, target: { node: nodeIds[pel], path: 'translation' } });
    g.json.animations.push(anim);
  }
  return keys;
}
