// Per-vertex bakes for hard-surface meshes: ambient occlusion (ray traced against every mesh of the
// asset), convex edge wear and cavity (from welded-mesh curvature). Written as the custom attribute
// `_bake` (RGBA8 normalized): r = AO (1 = open), g = edge wear, b = cavity, a = per-part random.
// Meshes are tessellated to `tessellate` max edge length, then welded (indexed) so every unique
// vertex is traced once.
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';

const _ray = new THREE.Ray();
const _n = new THREE.Vector3();
const _t = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();

// Low-discrepancy cosine-weighted hemisphere directions (Hammersley).
function hemisphere(n) {
  const dirs = [];
  for (let i = 0; i < n; i++) {
    let bits = i;
    bits = ((bits << 16) | (bits >>> 16)) >>> 0;
    bits = (((bits & 0x55555555) << 1) | ((bits & 0xaaaaaaaa) >>> 1)) >>> 0;
    bits = (((bits & 0x33333333) << 2) | ((bits & 0xcccccccc) >>> 2)) >>> 0;
    bits = (((bits & 0x0f0f0f0f) << 4) | ((bits & 0xf0f0f0f0) >>> 4)) >>> 0;
    bits = (((bits & 0x00ff00ff) << 8) | ((bits & 0xff00ff00) >>> 8)) >>> 0;
    const u = (i + 0.5) / n, v = bits / 4294967296;
    const r = Math.sqrt(u), phi = 2 * Math.PI * v;
    dirs.push([r * Math.cos(phi), r * Math.sin(phi), Math.sqrt(1 - u)]);
  }
  return dirs;
}

function prepare(geo, maxEdge) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (maxEdge) g = new TessellateModifier(maxEdge, 6).modify(g);
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  return mergeVertices(g, 1e-6);
}

/** Curvature per (indexed) vertex, positive = convex. Vertices are welded by position for adjacency. */
function curvature(geo) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, idx = geo.index.array;
  const n = pos.count;
  const weld = new Int32Array(n);
  const map = new Map();
  const q = 1 / 0.00004;
  let W = 0;
  const wp = new Float64Array(n * 3), wn = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = Math.round(pos.getX(i) * q), y = Math.round(pos.getY(i) * q), z = Math.round(pos.getZ(i) * q);
    const k = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
    let bucket = map.get(k), id = -1;
    if (bucket) for (const c of bucket) if (Math.abs(wp[c * 3] - pos.getX(i)) < 1e-5 && Math.abs(wp[c * 3 + 1] - pos.getY(i)) < 1e-5 && Math.abs(wp[c * 3 + 2] - pos.getZ(i)) < 1e-5) { id = c; break; }
    if (id < 0) {
      id = W++;
      wp[id * 3] = pos.getX(i); wp[id * 3 + 1] = pos.getY(i); wp[id * 3 + 2] = pos.getZ(i);
      if (bucket) bucket.push(id); else map.set(k, [id]);
    }
    weld[i] = id;
    wn[id * 3] += nor.getX(i); wn[id * 3 + 1] += nor.getY(i); wn[id * 3 + 2] += nor.getZ(i);
  }
  for (let i = 0; i < W; i++) {
    const l = Math.hypot(wn[i * 3], wn[i * 3 + 1], wn[i * 3 + 2]) || 1;
    wn[i * 3] /= l; wn[i * 3 + 1] /= l; wn[i * 3 + 2] /= l;
  }
  const sum = new Float64Array(W), cnt = new Float64Array(W);
  const edge = (a, b) => {
    if (a === b) return;
    const dx = wp[b * 3] - wp[a * 3], dy = wp[b * 3 + 1] - wp[a * 3 + 1], dz = wp[b * 3 + 2] - wp[a * 3 + 2];
    const l2 = dx * dx + dy * dy + dz * dz;
    if (l2 < 1e-14) return;
    const k = ((wn[b * 3] - wn[a * 3]) * dx + (wn[b * 3 + 1] - wn[a * 3 + 1]) * dy + (wn[b * 3 + 2] - wn[a * 3 + 2]) * dz) / l2;
    sum[a] += k; cnt[a]++; sum[b] += k; cnt[b]++;
  };
  for (let i = 0; i < idx.length; i += 3) {
    const a = weld[idx[i]], b = weld[idx[i + 1]], c = weld[idx[i + 2]];
    edge(a, b); edge(b, c); edge(c, a);
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const id = weld[i]; out[i] = cnt[id] ? sum[id] / cnt[id] : 0; }
  return out;
}

/**
 * Bakes all meshes in place (geometry replaced by a tessellated, indexed copy with `_bake`).
 * opts: tessellate (max edge, metres), aoDist (metres), rays, curvScale (curvature 1/m that maps to 1)
 */
export function bakeMeshes(meshes, opts = {}) {
  const { tessellate: maxEdge = 0.012, aoDist = 0.035, rays = 32, curvScale = 1 / 150, seed = 1, log = false } = opts;
  const t0 = Date.now();
  const worldGeos = [];
  for (const m of meshes) {
    m.geometry = prepare(m.geometry, maxEdge);
    m.updateWorldMatrix(true, false);
    const wg = m.geometry.clone();
    wg.deleteAttribute('normal');
    wg.applyMatrix4(m.matrixWorld);
    worldGeos.push(wg);
  }
  const all = mergeGeometries(worldGeos, false);
  const bvh = new MeshBVH(all);
  const dirs = hemisphere(rays);
  let rnd = seed;
  const random = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
  const nm = new THREE.Matrix3();
  let verts = 0;
  for (const m of meshes) {
    const geo = m.geometry;
    const pos = geo.attributes.position, nor = geo.attributes.normal;
    const n = pos.count;
    verts += n;
    const bake = new Uint8Array(n * 4);
    const curv = curvature(geo);
    nm.getNormalMatrix(m.matrixWorld);
    const partRand = Math.floor(random() * 255);
    for (let i = 0; i < n; i++) {
      _p.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      _n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      if (Math.abs(_n.y) < 0.9) _t.set(0, 1, 0).cross(_n).normalize(); else _t.set(1, 0, 0).cross(_n).normalize();
      _b.crossVectors(_n, _t);
      const rot = random() * Math.PI * 2, cr = Math.cos(rot), sr = Math.sin(rot);
      let open = 0;
      _ray.origin.copy(_p).addScaledVector(_n, 0.0003);
      for (const [dx0, dy0, dz] of dirs) {
        const dx = dx0 * cr - dy0 * sr, dy = dx0 * sr + dy0 * cr;
        _d.set(0, 0, 0).addScaledVector(_t, dx).addScaledVector(_b, dy).addScaledVector(_n, dz);
        _ray.direction.copy(_d);
        const hit = bvh.raycastFirst(_ray, THREE.DoubleSide, 0, aoDist);
        open += hit ? Math.sqrt(Math.min(1, hit.distance / aoDist)) * 0.7 : 1;
      }
      const ao = open / dirs.length;
      const c = curv[i] * curvScale;
      bake[i * 4] = Math.round(Math.max(0, Math.min(1, ao)) * 255);
      bake[i * 4 + 1] = Math.round(Math.max(0, Math.min(1, c)) * 255);
      bake[i * 4 + 2] = Math.round(Math.max(0, Math.min(1, -c * 1.5)) * 255);
      bake[i * 4 + 3] = partRand;
    }
    geo.setAttribute('_bake', new THREE.BufferAttribute(bake, 4, true));
  }
  bvh.geometry.dispose();
  if (log) console.log(`  bake: ${verts} verts, ${rays} rays, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
