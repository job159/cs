// Build-time collision checks for authored clips: CPU-skinned copies of the character's parts posed per frame
// (linear blend skinning, same as the GPU) in a refittable BVH, and the weapon GLBs (game/assets/weapons) as rigid
// meshes in weapon space (origin at S_grip_r). Used by soldier_anims.mjs to fail a build when a rifle stock sinks
// into the torso / gear or the head sinks into the stock.
import fs from 'node:fs';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

const _r = new THREE.Ray();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _one = new THREE.Vector3(1, 1, 1);

/**
 * Skinned triangle set. renders: [{position, joints, weights, index, seg}] (toRender() buffers, joints = bone index
 * of the anim skeleton); keepTri(render, a, b, c) -> bool selects the triangles.
 */
export class PosedSet {
  constructor(skel, renders, keepTri = () => true) {
    this.skel = skel;
    const P = [], J = [], W = [], I = [];
    for (const r of renders) {
      const base = P.length / 3;
      const nv = r.position.length / 3;
      const used = new Int32Array(nv).fill(-1);
      let n = 0;
      for (let t = 0; t < r.index.length; t += 3) {
        const a = r.index[t], b = r.index[t + 1], c = r.index[t + 2];
        if (!keepTri(r, a, b, c)) continue;
        for (const v of [a, b, c]) if (used[v] < 0) {
          used[v] = base + n++;
          P.push(r.position[v * 3], r.position[v * 3 + 1], r.position[v * 3 + 2]);
          for (let k = 0; k < 4; k++) { J.push(r.joints[v * 4 + k]); W.push(r.weights[v * 4 + k]); }
        }
        I.push(used[a], used[b], used[c]);
      }
    }
    this.rest = Float32Array.from(P);
    this.J = Uint8Array.from(J); this.W = Float32Array.from(W);
    this.geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(Float32Array.from(P), 3);
    this.geo.setAttribute('position', this.pos);
    this.geo.setIndex(new THREE.BufferAttribute(Uint32Array.from(I), 1));
    this.bvh = new MeshBVH(this.geo);
    this.mats = new Float32Array(skel.names.length * 16);
    this.restInv = skel.names.map((_, i) => new THREE.Matrix4().compose(skel.restWorldP[i], skel.restWorldQ[i], _one).invert());
  }

  get count() { return this.rest.length / 3; }

  /** Poses the set with a FK result {wq, wp} of the anim skeleton and refits the BVH. */
  pose(fk) {
    const S = this.skel, M = this.mats;
    for (let i = 0; i < S.names.length; i++) {
      _m.compose(fk.wp[i], fk.wq[i], _one).multiply(this.restInv[i]);
      M.set(_m.elements, i * 16);
    }
    const R = this.rest, out = this.pos.array, J = this.J, W = this.W;
    for (let v = 0; v < R.length / 3; v++) {
      const x = R[v * 3], y = R[v * 3 + 1], z = R[v * 3 + 2];
      let ox = 0, oy = 0, oz = 0;
      for (let k = 0; k < 4; k++) {
        const w = W[v * 4 + k];
        if (!w) continue;
        const e = J[v * 4 + k] * 16;
        ox += w * (M[e] * x + M[e + 4] * y + M[e + 8] * z + M[e + 12]);
        oy += w * (M[e + 1] * x + M[e + 5] * y + M[e + 9] * z + M[e + 13]);
        oz += w * (M[e + 2] * x + M[e + 6] * y + M[e + 10] * z + M[e + 14]);
      }
      out[v * 3] = ox; out[v * 3 + 1] = oy; out[v * 3 + 2] = oz;
    }
    this.pos.needsUpdate = true;
    this.bvh.refit();
    return this;
  }

  /** Posed vertex v (world). */
  vertex(v, out = new THREE.Vector3()) { const a = this.pos.array; return out.set(a[v * 3], a[v * 3 + 1], a[v * 3 + 2]); }

  /** First hit along a ray: {dist, back (the ray leaves a surface: the origin is inside)} or null. */
  first(o, d, max = 1) {
    _r.origin.copy(o); _r.direction.copy(d).normalize();
    const h = this.bvh.raycastFirst(_r, THREE.DoubleSide, 0, max);
    if (!h) return null;
    return { dist: h.distance, back: h.face.normal.dot(_r.direction) > 0 };
  }
}

/**
 * Depth of a point inside a (mostly closed) surface set: the first hit along `dirs[0]` must be a back face, the depth
 * is the shortest exit distance over all directions whose first hit is a back face (0 = outside).
 */
export function insideDepth(set, p, dirs, max = 0.5) {
  const h0 = set.first(p, dirs[0], max);
  if (!h0 || !h0.back) return 0;
  let d = h0.dist;
  for (let k = 1; k < dirs.length; k++) {
    const h = set.first(p, dirs[k], max);
    if (h && h.back) d = Math.min(d, h.dist);
  }
  return d;
}

/** Reads a weapon GLB: triangles in weapon space relative to S_grip_r, the named S_* points, and a BVH. */
export function loadWeapon(file) {
  const buf = fs.readFileSync(file);
  const jl = buf.readUInt32LE(12);
  const j = JSON.parse(buf.subarray(20, 20 + jl).toString('utf8'));
  const bin = buf.subarray(20 + jl + 8);
  const read = (ai) => {
    const a = j.accessors[ai], v = j.bufferViews[a.bufferView];
    const nc = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const C = { 5126: Float32Array, 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array }[a.componentType];
    const stride = v.byteStride || nc * C.BYTES_PER_ELEMENT;
    const base = (v.byteOffset || 0) + (a.byteOffset || 0);
    const out = new Float64Array(a.count * nc);
    const dv = new DataView(bin.buffer, bin.byteOffset);
    for (let i = 0; i < a.count; i++) for (let c = 0; c < nc; c++) {
      const o = base + i * stride + c * C.BYTES_PER_ELEMENT;
      out[i * nc + c] = C === Float32Array ? dv.getFloat32(o, true) : C === Uint16Array ? dv.getUint16(o, true) : C === Uint32Array ? dv.getUint32(o, true) : dv.getUint8(o);
    }
    return out;
  };
  const local = j.nodes.map((n) => (n.matrix ? new THREE.Matrix4().fromArray(n.matrix)
    : new THREE.Matrix4().compose(new THREE.Vector3(...(n.translation || [0, 0, 0])), new THREE.Quaternion(...(n.rotation || [0, 0, 0, 1])), new THREE.Vector3(...(n.scale || [1, 1, 1])))));
  const world = new Array(j.nodes.length);
  const walk = (i, pm) => { world[i] = pm.clone().multiply(local[i]); for (const c of j.nodes[i].children || []) walk(c, world[i]); };
  for (const r of j.scenes[j.scene || 0].nodes) walk(r, new THREE.Matrix4());
  const points = {};
  j.nodes.forEach((n, i) => { if (/^S_/.test(n.name) && world[i]) points[n.name] = new THREE.Vector3().setFromMatrixPosition(world[i]); });
  const grip = points.S_grip_r || new THREE.Vector3();
  const P = [], I = [];
  j.nodes.forEach((n, i) => {
    if (n.mesh === undefined || !world[i]) return;
    for (const pr of j.meshes[n.mesh].primitives) {
      if ((pr.mode ?? 4) !== 4) continue;
      const pos = read(pr.attributes.POSITION);
      const base = P.length / 3;
      const v = new THREE.Vector3();
      for (let k = 0; k < pos.length; k += 3) { v.set(pos[k], pos[k + 1], pos[k + 2]).applyMatrix4(world[i]).sub(grip); P.push(v.x, v.y, v.z); }
      const idx = pr.indices !== undefined ? read(pr.indices) : Float64Array.from({ length: pos.length / 3 }, (_, k) => k);
      for (const x of idx) I.push(base + x);
    }
  });
  for (const k of Object.keys(points)) points[k] = points[k].clone().sub(grip);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(P), 3));
  geo.setIndex(new THREE.BufferAttribute(Uint32Array.from(I), 1));
  const bvh = new MeshBVH(geo);
  return {
    file, points, verts: geo.attributes.position.array, bvh,
    /** first hit along a weapon-space ray: {dist, back} */
    first(o, d, max = 0.5) {
      _r.origin.copy(o); _r.direction.copy(d).normalize();
      const h = bvh.raycastFirst(_r, THREE.DoubleSide, 0, max);
      return h ? { dist: h.distance, back: h.face.normal.dot(_r.direction) > 0 } : null;
    },
  };
}

/** World -> weapon space for a gun frame {p, q} (origin = grip point). */
export function toGun(G, w, out = new THREE.Vector3()) {
  return out.copy(w).sub(G.p).applyQuaternion(_q.copy(G.q).invert());
}
