// Character parts: a MakeHuman-topology mesh (original vertex indexing + per-corner UVs) whose vertices are
// bound to the hm08 base mesh by barycentric references. Weights, segments and morphs all come through that
// binding. toRender() splits UV seams and produces GPU buffers.
import { boneSegment } from './rig.mjs';

export class Part {
  /**
   * @param o.name, o.role ('skin'|'cloth'|'eye'|'teeth'|'hair'|'gear'|'gore')
   * @param o.obj    loadOBJ() result (topology + uvs)
   * @param o.pos    Float32Array per original vertex, glTF metres
   * @param o.refIdx Int32Array(n*3), o.refW Float32Array(n*3): binding to base vertices
   */
  constructor(o) {
    Object.assign(this, { name: o.name, role: o.role, obj: o.obj, pos: o.pos, refIdx: o.refIdx, refW: o.refW });
    this.material = o.material || { name: o.role };
    this.keep = new Uint8Array(o.obj.faces.length).fill(1);
    if (o.groups) {
      const allowed = new Set(o.groups.map((g) => o.obj.groupIndex.get(g)));
      o.obj.faces.forEach((f, i) => { if (!allowed.has(f.g)) this.keep[i] = 0; });
    }
    this.extras = o.extras || {};
    this.weights = null; // per original vertex [[bone, w] x4]
    this.seg = null;
  }

  get nVerts() { return this.pos.length / 3; }

  /** Triangles of kept faces as Int32Array [v0,t0,v1,t1,v2,t2]... (+ face index list). */
  tris() {
    const out = [], faceOf = [];
    this.obj.faces.forEach((f, fi) => {
      if (!this.keep[fi]) return;
      for (let k = 1; k + 1 < f.v.length; k++) {
        out.push(f.v[0], f.t[0], f.v[k], f.t[k], f.v[k + 1], f.t[k + 1]);
        faceOf.push(fi);
      }
    });
    this._faceOf = faceOf;
    return Int32Array.from(out);
  }

  /** Smooth per-original-vertex normals of the kept faces (area weighted). */
  normals(pos = this.pos) {
    const n = new Float32Array(pos.length);
    const t = this.tris();
    for (let i = 0; i < t.length; i += 6) {
      const a = t[i] * 3, b = t[i + 2] * 3, c = t[i + 4] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
      const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const v of [a, b, c]) { n[v] += nx; n[v + 1] += ny; n[v + 2] += nz; }
    }
    for (let i = 0; i < n.length; i += 3) {
      const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
      n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
    }
    return n;
  }

  /** Transfers top-4 bone weights + dismemberment segment from the base mesh through the binding. */
  bindWeights(baseLists, bones) {
    const n = this.nVerts;
    this.weights = new Array(n);
    this.seg = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const acc = new Map();
      for (let k = 0; k < 3; k++) {
        const w = Math.max(0, this.refW[i * 3 + k]);
        if (!w) continue;
        for (const [b, bw] of baseLists[this.refIdx[i * 3 + k]]) acc.set(b, (acc.get(b) || 0) + bw * w);
      }
      let list = [...acc.entries()].sort((a, b) => b[1] - a[1]);
      // segment = segment with the largest summed weight (fingers count towards the hand/forearm etc.)
      const segAcc = new Float32Array(10);
      for (const [b, w] of list) segAcc[boneSegment(bones[b].name)] += w;
      let best = 0;
      for (let s = 1; s < 10; s++) if (segAcc[s] > segAcc[best]) best = s;
      this.seg[i] = best;
      list = list.slice(0, 4);
      const sum = list.reduce((a, [, w]) => a + w, 0);
      if (!sum) list = [[0, 1]];
      else list = list.map(([b, w]) => [b, w / sum]);
      this.weights[i] = list;
    }
  }

  /** GPU buffers: vertices split on UV seams. */
  toRender() {
    const t = this.tris();
    const map = new Map();
    const pos = [], uv = [], src = [], idx = [];
    const uvs = this.obj.uvs;
    for (let i = 0; i < t.length; i += 2) {
      const v = t[i], ti = t[i + 1];
      const key = v * 1048576 + (ti + 1);
      let o = map.get(key);
      if (o === undefined) {
        o = src.length;
        map.set(key, o);
        src.push(v);
        pos.push(this.pos[v * 3], this.pos[v * 3 + 1], this.pos[v * 3 + 2]);
        uv.push(ti >= 0 ? uvs[ti * 2] : 0, ti >= 0 ? 1 - uvs[ti * 2 + 1] : 0);
      }
      idx.push(o);
    }
    const nrmV = this.normals();
    const n = src.length;
    const normal = new Float32Array(n * 3), joints = new Uint8Array(n * 4), weights = new Float32Array(n * 4), seg = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const v = src[i];
      normal.set(nrmV.subarray(v * 3, v * 3 + 3), i * 3);
      if (this.weights) {
        this.weights[v].forEach(([b, w], k) => { joints[i * 4 + k] = b; weights[i * 4 + k] = w; });
        seg[i] = this.seg[v];
      }
    }
    return { position: Float32Array.from(pos), normal, uv: Float32Array.from(uv), joints, weights, seg, index: Uint32Array.from(idx), src: Int32Array.from(src) };
  }

  triCount() { let n = 0; this.obj.faces.forEach((f, i) => { if (this.keep[i]) n += f.v.length - 2; }); return n; }
}

/** Removes unused vertices from render buffers after index changes (simplification). */
export function compactRender(r) {
  const n = r.position.length / 3;
  const remap = new Int32Array(n).fill(-1);
  let m = 0;
  for (const i of r.index) if (remap[i] < 0) remap[i] = m++;
  const out = { index: new Uint32Array(r.index.length) };
  r.index.forEach((v, k) => { out.index[k] = remap[v]; });
  const per = { position: 3, normal: 3, uv: 2, joints: 4, weights: 4, seg: 1, src: 1 };
  for (const [k, s] of Object.entries(per)) {
    if (!r[k]) continue;
    const a = new r[k].constructor(m * s);
    for (let i = 0; i < n; i++) if (remap[i] >= 0) for (let c = 0; c < s; c++) a[remap[i] * s + c] = r[k][i * s + c];
    out[k] = a;
  }
  return out;
}
