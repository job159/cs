// LIGHTMAP BAKER (Node, pure JS + three-mesh-bvh, parallel over worker_threads).
//
//   import { bakeLightmaps } from './lib/lightmap.mjs';
//   const res = await bakeLightmaps(staticMeshes, { sun, skyHdr, resolution: 8, samples: 64, lights });
//   await res.write('game/assets/maps/sector7', 'lm');   // lm_0.png (RGBM) + lm_0_sun.png (sun mask) ...
//
// 1. UV2: per-face planar charts (connected faces within `chartAngle` of the seed normal, projected on
//    their mean plane, minimum-area rectangle), sized by world area x texels/m, padded and packed into
//    one or more atlases with a skyline packer (all charts of one mesh share one atlas; a mesh too big
//    for one atlas is split into several meshes). Written as attribute `uv1` (glTF TEXCOORD_1; three.js
//    material.lightMap.channel = 1). v = 0 is the first PNG row (load with flipY = false).
// 2. Path tracing per texel (conservative rasterisation, texel centres clamped into the triangle):
//    pass A - sun with soft shadows (cone of `sun.angle` + jitter over the texel footprint), sky from the
//             HDRI (cosine-weighted, stratified), static point/spot lights, back-face test (texels inside
//             geometry are marked invalid and later filled from valid neighbours - no leaks at junctions).
//    pass B - sky again + one bounce: hits look up the pass-A irradiance in the atlas and reflect it with
//             the material albedo. `bounces` > 1 repeats pass B with the previous result.
// 3. Invalid fill, edge-aware a-trous denoise (chart / normal / variance-scaled luminance stopping),
//    dilation into the chart padding, RGBM encode (sqrt space, see decode below) + 8-bit sun mask.
//
// Output irradiance E (three.js units: sun intensity * cos + sky radiance integrated over the hemisphere);
// three.js shades lightmaps as albedo / PI * E, the same as its direct lights, so baked and realtime
// lighting match when the runtime uses the same sun / sky / light intensities.
//   decode: E = range * (rgb * a)^2           (rgb, a in 0..1)
// mode 'indirect+mask' (default): lm = sky + bounce + baked lights; the realtime sun is multiplied by the
//   sun mask (and by the realtime shadow map near the player). mode 'full': lm also contains direct sun.
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import * as THREE from 'three';
import { MeshBVH, SAH } from 'three-mesh-bvh';
import { PNG } from 'pngjs';
import { makeSky, parseHDR } from './lightmap-hdr.mjs';
import * as K from './lightmap-trace.mjs';

export const LIGHTMAP_DEFAULTS = {
  resolution: 8,          // texels per metre (x mesh.userData.lightmap.scale)
  maxAtlas: 2048,
  minAtlas: 128,
  padding: 2,             // texels of border around every chart (>= 2)
  maxAtlases: 0,          // > 0: scale the resolution down until everything fits in this many atlases
  chartAngle: 40,         // degrees: max deviation from the seed normal inside one chart
  samples: 64,            // sky / bounce rays per texel (pass B); pass A uses `directSamples`
  directSamples: 0,       // 0 = max(16, samples / 2)
  sunSamples: 16,
  lightSamples: 8,
  bounces: 1,
  denoise: true,
  mode: 'indirect+mask',  // or 'full'
  range: 0,               // RGBM range; 0 = 8 (indirect) / 16 (full)
  threads: 0,             // 0 = all cores
  eps: 0.002,             // ray origin offset along the geometric normal (m)
  far: 5000,
  jitter: true,           // sun samples spread over the texel footprint (anti-aliased shadow edges)
  invalidThreshold: 0.2,  // fraction of back-face hits that marks a texel as inside geometry
  uvAttribute: 'uv1',
  skyIntensity: 1, skyRotation: 0, skyClamp: 'auto',
  lights: [], occluders: [],
  albedo: null,           // (material, mesh) => [r,g,b] linear | undefined
  keepFloat: false,
  log: undefined,         // function | false
};

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function toLinear(c, def) {
  if (c === undefined || c === null) return def;
  if (Array.isArray(c) || ArrayBuffer.isView(c)) return [c[0], c[1], c[2]];
  if (c.isColor) return [c.r, c.g, c.b];
  const col = new THREE.Color(c);
  return [col.r, col.g, col.b];
}
const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

// ------------------------------------------------------------------------------------------ materials
const _texAvg = new Map();
function textureAverage(tex) {
  if (!tex) return null;
  if (tex.userData?.average) return tex.userData.average;
  if (_texAvg.has(tex.uuid)) return _texAvg.get(tex.uuid);
  const img = tex.image;
  let res = null;
  if (img && img.data && img.width && img.height) {
    const d = img.data, n = img.width * img.height, ch = Math.round(d.length / n);
    if (ch >= 3) {
      const isFloat = d instanceof Float32Array;
      let r = 0, g = 0, b = 0;
      const step = Math.max(1, Math.floor(n / 65536));
      let cnt = 0;
      for (let i = 0; i < n; i += step) {
        const k = i * ch;
        if (isFloat) { r += d[k]; g += d[k + 1]; b += d[k + 2]; } else {
          r += srgbToLinear(d[k] / 255); g += srgbToLinear(d[k + 1] / 255); b += srgbToLinear(d[k + 2] / 255);
        }
        cnt++;
      }
      res = [r / cnt, g / cnt, b / cnt];
    }
  }
  _texAvg.set(tex.uuid, res);
  return res;
}
function srgbToLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }

class MaterialTable {
  constructor(o, log) { this.o = o; this.log = log; this.slots = []; this.map = new Map(); this.warned = false; }
  slot(material, mesh) {
    const lmM = mesh.userData?.lightmap || {};
    const lmMat = material?.userData?.lightmap || {};
    const key = (material?.uuid || 'none') + (lmM.albedo || lmM.emissive || lmM.transmission !== undefined || lmM.doubleSided !== undefined ? '|' + mesh.uuid : '');
    let s = this.map.get(key);
    if (s !== undefined) return s;
    let albedo = lmM.albedo || lmMat.albedo || material?.userData?.albedo || (this.o.albedo && this.o.albedo(material, mesh));
    if (albedo) albedo = toLinear(albedo);
    else {
      const c = material?.color ? [material.color.r, material.color.g, material.color.b] : [0.5, 0.5, 0.5];
      let t = material?.map ? textureAverage(material.map) : [1, 1, 1];
      if (!t) {
        t = [0.3, 0.3, 0.3];
        if (!this.warned) { this.log(`albedo of textured material "${material.name}" unknown: assuming 0.3 (set material.userData.albedo or map.userData.average)`); this.warned = true; }
      }
      albedo = [c[0] * t[0], c[1] * t[1], c[2] * t[2]];
    }
    if (material?.metalness > 0.5) albedo = albedo.map((v) => v * 0.5); // metals reflect little diffusely
    albedo = albedo.map((v) => Math.min(0.95, Math.max(0, v)));
    let emissive = lmM.emissive ?? lmMat.emissive;
    if (emissive) emissive = toLinear(emissive);
    else if (material?.emissive) {
      const k = material.emissiveIntensity ?? 1;
      emissive = [material.emissive.r * k, material.emissive.g * k, material.emissive.b * k];
    } else emissive = [0, 0, 0];
    let trans = lmM.transmission ?? lmMat.transmission;
    if (trans === undefined) {
      trans = 0;
      if (material?.transmission > 0) trans = material.transmission;
      else if (material?.transparent && material.opacity < 1) trans = 1 - material.opacity;
      else if (material?.alphaTest > 0) trans = 0.4;
    }
    const ds = lmM.doubleSided ?? lmMat.doubleSided ?? (material?.side === THREE.DoubleSide);
    s = this.slots.length;
    this.slots.push({ albedo, emissive, transmission: Math.min(1, Math.max(0, trans)), doubleSided: ds ? 1 : 0, name: material?.name });
    this.map.set(key, s);
    return s;
  }
  pack() {
    const a = new Float32Array(Math.max(1, this.slots.length) * 8);
    this.slots.forEach((s, i) => {
      a.set(s.albedo, i * 8); a.set(s.emissive, i * 8 + 3); a[i * 8 + 6] = s.transmission; a[i * 8 + 7] = s.doubleSided;
    });
    return a;
  }
}

// ------------------------------------------------------------------------------------------ geometry
function materialOf(mesh, matIndex) {
  return Array.isArray(mesh.material) ? mesh.material[matIndex] ?? mesh.material[0] : mesh.material;
}

/** World-space triangles of a mesh (optionally one instance). Corners keep the source vertex index. */
function extract(mesh, matrix, mats) {
  const g = mesh.geometry;
  const pos = g.attributes.position, nrm = g.attributes.normal, idx = g.index;
  const nt = Math.floor((idx ? idx.count : pos.count) / 3);
  const P = new Float32Array(nt * 9), N = new Float32Array(nt * 9), C = new Int32Array(nt * 3);
  const S = new Int32Array(nt), LM = new Int32Array(nt);
  const nm = new THREE.Matrix3().getNormalMatrix(matrix);
  const e = matrix.elements, ne = nm.elements;
  const flip = matrix.determinant() < 0;
  if (Array.isArray(mesh.material) && g.groups.length) {
    for (const gr of g.groups) {
      const a = Math.floor(gr.start / 3), b = Math.min(nt, Math.floor((gr.start + gr.count) / 3));
      for (let t = a; t < b; t++) LM[t] = gr.materialIndex || 0;
    }
  }
  const slotCache = new Map();
  for (let t = 0; t < nt; t++) {
    for (let c = 0; c < 3; c++) {
      const vi = idx ? idx.getX(t * 3 + c) : t * 3 + c;
      C[t * 3 + c] = vi;
      const cc = flip ? (c === 0 ? 0 : 3 - c) : c; // keep CCW in world space for mirrored transforms
      const x = pos.getX(vi), y = pos.getY(vi), z = pos.getZ(vi);
      const o = t * 9 + cc * 3;
      P[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
      P[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      P[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      if (nrm) {
        const a = nrm.getX(vi), b = nrm.getY(vi), d = nrm.getZ(vi);
        let X = ne[0] * a + ne[3] * b + ne[6] * d, Y = ne[1] * a + ne[4] * b + ne[7] * d, Z = ne[2] * a + ne[5] * b + ne[8] * d;
        const l = Math.hypot(X, Y, Z) || 1;
        N[o] = X / l; N[o + 1] = Y / l; N[o + 2] = Z / l;
      }
    }
    if (!nrm) {
      const o = t * 9;
      const ax = P[o + 3] - P[o], ay = P[o + 4] - P[o + 1], az = P[o + 5] - P[o + 2];
      const bx = P[o + 6] - P[o], by = P[o + 7] - P[o + 1], bz = P[o + 8] - P[o + 2];
      let X = ay * bz - az * by, Y = az * bx - ax * bz, Z = ax * by - ay * bx;
      const l = Math.hypot(X, Y, Z) || 1;
      for (let c = 0; c < 3; c++) { N[o + c * 3] = X / l; N[o + c * 3 + 1] = Y / l; N[o + c * 3 + 2] = Z / l; }
    }
    let s = slotCache.get(LM[t]);
    if (s === undefined) { s = mats.slot(materialOf(mesh, LM[t]), mesh); slotCache.set(LM[t], s); }
    S[t] = s;
  }
  return { P, N, C, S, LM, nt, flip };
}

// ------------------------------------------------------------------------------------------ charts
function triNormalArea(P, t, out) {
  const o = t * 9;
  const ax = P[o + 3] - P[o], ay = P[o + 4] - P[o + 1], az = P[o + 5] - P[o + 2];
  const bx = P[o + 6] - P[o], by = P[o + 7] - P[o + 1], bz = P[o + 8] - P[o + 2];
  const X = ay * bz - az * by, Y = az * bx - ax * bz, Z = ax * by - ay * bx;
  const l = Math.hypot(X, Y, Z);
  if (l < 1e-12) { out[0] = out[1] = out[2] = 0; return 0; }
  out[0] = X / l; out[1] = Y / l; out[2] = Z / l;
  return l / 2;
}

/** Region growing over edge-connected faces. Returns arrays of global triangle ids. */
function growCharts(P, t0, nt, cosA) {
  const fn = new Float64Array(nt * 3), area = new Float64Array(nt);
  const tmp = [0, 0, 0];
  for (let i = 0; i < nt; i++) { area[i] = triNormalArea(P, t0 + i, tmp); fn[i * 3] = tmp[0]; fn[i * 3 + 1] = tmp[1]; fn[i * 3 + 2] = tmp[2]; }
  // weld positions (0.1 mm)
  const vid = new Int32Array(nt * 3);
  const vmap = new Map();
  let nv = 0;
  for (let k = 0; k < nt * 3; k++) {
    const o = (t0 * 3 + k) * 3;
    const key = Math.round(P[o] * 1e4) + ',' + Math.round(P[o + 1] * 1e4) + ',' + Math.round(P[o + 2] * 1e4);
    let id = vmap.get(key);
    if (id === undefined) { id = nv++; vmap.set(key, id); }
    vid[k] = id;
  }
  vmap.clear();
  const adj = new Int32Array(nt * 3).fill(-1);
  const extra = new Map();
  const link = (a, b) => {
    for (let s = 0; s < 3; s++) { if (adj[a * 3 + s] === b) return; if (adj[a * 3 + s] < 0) { adj[a * 3 + s] = b; return; } }
    let l = extra.get(a); if (!l) extra.set(a, (l = [])); if (!l.includes(b)) l.push(b);
  };
  const edges = new Map();
  for (let t = 0; t < nt; t++) {
    for (let e = 0; e < 3; e++) {
      const a = vid[t * 3 + e], b = vid[t * 3 + ((e + 1) % 3)];
      if (a === b) continue;
      const key = a < b ? a * nv + b : b * nv + a;
      const f = edges.get(key);
      if (f === undefined) edges.set(key, t); else if (f !== t) { link(t, f); link(f, t); }
    }
  }
  edges.clear();
  const order = new Uint32Array(nt);
  for (let i = 0; i < nt; i++) order[i] = i;
  order.sort((a, b) => area[b] - area[a]);
  const chartOf = new Int32Array(nt).fill(-1);
  const charts = [];
  const queue = new Int32Array(nt);
  for (let oi = 0; oi < nt; oi++) {
    const s = order[oi];
    if (chartOf[s] >= 0) continue;
    const cid = charts.length;
    chartOf[s] = cid;
    let snx = fn[s * 3], sny = fn[s * 3 + 1], snz = fn[s * 3 + 2];
    const degenerateSeed = area[s] === 0;
    let qh = 0, qt = 0;
    queue[qt++] = s;
    const members = [];
    while (qh < qt) {
      const cur = queue[qh++];
      members.push(t0 + cur);
      const visit = (nb) => {
        if (nb < 0 || chartOf[nb] >= 0) return;
        if (area[nb] > 0 && !degenerateSeed) {
          const d1 = fn[nb * 3] * snx + fn[nb * 3 + 1] * sny + fn[nb * 3 + 2] * snz;
          if (d1 < cosA) return;
          if (area[cur] > 0) {
            const d2 = fn[nb * 3] * fn[cur * 3] + fn[nb * 3 + 1] * fn[cur * 3 + 1] + fn[nb * 3 + 2] * fn[cur * 3 + 2];
            if (d2 < cosA) return;
          }
        } else if (area[nb] > 0 && degenerateSeed) return;
        chartOf[nb] = cid;
        queue[qt++] = nb;
      };
      visit(adj[cur * 3]); visit(adj[cur * 3 + 1]); visit(adj[cur * 3 + 2]);
      const ex = extra.get(cur);
      if (ex) for (const nb of ex) visit(nb);
    }
    charts.push(members);
  }
  return charts;
}

function convexHull(pts) { // pts: array of [x,y]
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

/** Projection frame of a chart: mean normal, in-plane axes rotated to the minimum-area rectangle. */
function frameChart(P, tris) {
  const tmp = [0, 0, 0];
  let Nx = 0, Ny = 0, Nz = 0;
  for (const t of tris) { const a = triNormalArea(P, t, tmp); Nx += tmp[0] * a; Ny += tmp[1] * a; Nz += tmp[2] * a; }
  let l = Math.hypot(Nx, Ny, Nz);
  if (l < 1e-12) { Nx = 0; Ny = 1; Nz = 0; l = 1; }
  const N = [Nx / l, Ny / l, Nz / l];
  // initial tangent: horizontal for walls, world X for floors
  let T = Math.abs(N[1]) < 0.99 ? norm3([N[2], 0, -N[0]]) : norm3([1, 0, 0].map((v, i) => v - N[i] * N[0]));
  const B = [N[1] * T[2] - N[2] * T[1], N[2] * T[0] - N[0] * T[2], N[0] * T[1] - N[1] * T[0]];
  const pts = [];
  const seen = new Set();
  for (const t of tris) for (let c = 0; c < 3; c++) {
    const o = t * 9 + c * 3;
    const key = P[o] + ',' + P[o + 1] + ',' + P[o + 2];
    if (seen.has(key)) continue;
    seen.add(key);
    pts.push([P[o] * T[0] + P[o + 1] * T[1] + P[o + 2] * T[2], P[o] * B[0] + P[o + 1] * B[1] + P[o + 2] * B[2]]);
  }
  const hull = convexHull(pts);
  let bestA = Infinity, bestAng = 0;
  const tryAngle = (ang) => {
    const c = Math.cos(ang), s = Math.sin(ang);
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const p of hull) { const u = p[0] * c + p[1] * s, v = -p[0] * s + p[1] * c; if (u < a0) a0 = u; if (u > a1) a1 = u; if (v < b0) b0 = v; if (v > b1) b1 = v; }
    const A = (a1 - a0) * (b1 - b0);
    if (A < bestA * 0.999) { bestA = A; bestAng = ang; }
  };
  tryAngle(0); // keep the natural (horizontal) orientation unless a rotation is clearly better
  for (let i = 0; i < hull.length; i++) {
    const p = hull[i], q = hull[(i + 1) % hull.length];
    tryAngle(Math.atan2(q[1] - p[1], q[0] - p[0]));
  }
  const c = Math.cos(bestAng), s = Math.sin(bestAng);
  const U = [T[0] * c + B[0] * s, T[1] * c + B[1] * s, T[2] * c + B[2] * s];
  const V = [-T[0] * s + B[0] * c, -T[1] * s + B[1] * c, -T[2] * s + B[2] * c];
  return { N, U, V };
}

function chartExtents(P, ch) {
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  const { U, V } = ch;
  for (const t of ch.tris) for (let c = 0; c < 3; c++) {
    const o = t * 9 + c * 3;
    const u = P[o] * U[0] + P[o + 1] * U[1] + P[o + 2] * U[2], v = P[o] * V[0] + P[o + 1] * V[1] + P[o + 2] * V[2];
    if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
  }
  ch.u0 = u0; ch.v0 = v0; ch.eu = Math.max(0, u1 - u0); ch.ev = Math.max(0, v1 - v0);
}

/** True if two triangles of a (curved) chart overlap once projected (sampled on a texel grid). */
function chartOverlaps(P, ch, dens) {
  const W = Math.ceil(ch.eu * dens) + 1, H = Math.ceil(ch.ev * dens) + 1;
  if (W * H > 4e6) return false;
  const grid = new Int32Array(W * H).fill(-1);
  const { U, V } = ch;
  for (const t of ch.tris) {
    const q = [];
    for (let c = 0; c < 3; c++) {
      const o = t * 9 + c * 3;
      q.push((P[o] * U[0] + P[o + 1] * U[1] + P[o + 2] * U[2] - ch.u0) * dens, (P[o] * V[0] + P[o + 1] * V[1] + P[o + 2] * V[2] - ch.v0) * dens);
    }
    const [ax, ay, bx, by, cx, cy] = q;
    const A = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (Math.abs(A) < 1e-9) continue;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const u = ((px - ax) * (cy - ay) - (cx - ax) * (py - ay)) / A, v = ((bx - ax) * (py - ay) - (px - ax) * (by - ay)) / A;
      if (u > 1e-4 && v > 1e-4 && u + v < 1 - 1e-4) {
        const k = y * W + x;
        if (grid[k] >= 0 && grid[k] !== t) return true;
        grid[k] = t;
      }
    }
  }
  return false;
}

// ------------------------------------------------------------------------------------------ packing
class Skyline {
  constructor(W, H) { this.W = W; this.H = H; this.nodes = [{ x: 0, y: 0, w: W }]; }
  clone() { const s = new Skyline(this.W, this.H); s.nodes = this.nodes.map((n) => ({ ...n })); return s; }
  _fit(i, w, h) {
    const nodes = this.nodes;
    const x = nodes[i].x;
    if (x + w > this.W) return -1;
    let left = w, y = nodes[i].y, j = i;
    while (left > 0) {
      if (j >= nodes.length) return -1;
      if (nodes[j].y > y) y = nodes[j].y;
      if (y + h > this.H) return -1;
      left -= nodes[j].w;
      j++;
    }
    return y;
  }
  insert(w, h) {
    let best = -1, bestY = Infinity, bestW = Infinity;
    for (let i = 0; i < this.nodes.length; i++) {
      const y = this._fit(i, w, h);
      if (y < 0) continue;
      if (y + h < bestY || (y + h === bestY && this.nodes[i].w < bestW)) { best = i; bestY = y + h; bestW = this.nodes[i].w; }
    }
    if (best < 0) return null;
    const x = this.nodes[best].x, y = bestY - h;
    const nodes = this.nodes;
    nodes.splice(best, 0, { x, y: y + h, w });
    for (let i = best + 1; i < nodes.length; i++) {
      const prev = nodes[i - 1];
      if (nodes[i].x < prev.x + prev.w) {
        const shrink = prev.x + prev.w - nodes[i].x;
        nodes[i].x += shrink; nodes[i].w -= shrink;
        if (nodes[i].w <= 0) { nodes.splice(i, 1); i--; } else break;
      } else break;
    }
    for (let i = 0; i < nodes.length - 1; i++) {
      if (nodes[i].y === nodes[i + 1].y) { nodes[i].w += nodes[i + 1].w; nodes.splice(i + 1, 1); i--; }
    }
    return { x, y };
  }
}

/** Packs groups (arrays of charts, each group must stay in one atlas) into W x H atlases. */
function tryPackGroup(sky, charts) {
  const s = sky.clone();
  const places = [];
  for (const ch of charts) {
    const p = s.insert(ch.w, ch.h);
    if (!p) return null;
    places.push(p);
  }
  return { sky: s, places };
}

// ------------------------------------------------------------------------------------------ main
export async function bakeLightmaps(input, options = {}) {
  const T0 = performance.now();
  const o = { ...LIGHTMAP_DEFAULTS, ...options };
  const log = o.log === false ? () => {} : (o.log || ((...a) => console.log('[lightmap]', ...a)));
  const timings = {};
  let tStage = performance.now();
  const stage = (name) => { const t = performance.now(); timings[name] = Math.round(t - tStage); tStage = t; };

  // ---- collect meshes
  const receivers = [], occluders = [];
  const seen = new Set();
  const visible = (m) => { for (let p = m; p; p = p.parent) if (p.visible === false) return false; return true; };
  const visit = (root, asOcc) => root.traverse((m) => {
    if (!m.isMesh || seen.has(m) || !m.geometry?.attributes?.position) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    if (mats.every((x) => x && x.visible === false) || !visible(m)) return;
    const lm = m.userData?.lightmap;
    if (lm === false) return;
    seen.add(m);
    if (m.isInstancedMesh || asOcc || lm?.receive === false) { if (lm?.castShadow !== false) occluders.push(m); }
    else receivers.push(m);
  });
  for (const r of [].concat(input)) { r.updateWorldMatrix(true, true); visit(r, false); }
  for (const r of [].concat(o.occluders || [])) { r.updateWorldMatrix(true, true); visit(r, true); }
  if (!receivers.length) throw new Error('bakeLightmaps: no receiver meshes');

  // ---- sun / sky / lights
  const sunIn = o.sun || {};
  const hdr = typeof o.skyHdr === 'string' ? parseHDR(fs.readFileSync(o.skyHdr)) : o.skyHdr;
  const sky = makeSky({ hdr, intensity: o.skyIntensity, rotation: o.skyRotation, clamp: o.skyClamp, zenith: o.skyZenith, horizon: o.skyHorizon });
  let sunDir = sunIn.dir ? norm3(sunIn.dir) : sky.sunDir ? norm3(sky.sunDir) : norm3([0.4, 0.8, 0.3]);
  if (sunDir[1] < 0) { log('sun.dir points downwards: treating it as the light direction and flipping it (dir = towards the sun)'); sunDir = sunDir.map((v) => -v); }
  const sunColor = toLinear(sunIn.color, [1, 1, 1]);
  const sunIntensity = sunIn.intensity ?? 3;
  const sunAngle = ((sunIn.angle ?? 0.6) * Math.PI) / 180;
  // sky's below-horizon ground estimate wants the sun too
  const sky2 = makeSky({ hdr, intensity: o.skyIntensity, rotation: o.skyRotation, clamp: o.skyClamp, zenith: o.skyZenith, horizon: o.skyHorizon,
    sun: { dir: sunDir, color: sunColor, intensity: sunIntensity } });
  Object.assign(sky, { data: sky2.data, irr: sky2.irr });
  const lights = (o.lights || []).filter((l) => l.bake !== false);
  const L = new Float32Array(Math.max(1, lights.length) * 16);
  lights.forEach((l, i) => {
    const b = i * 16;
    const pos = l.pos || l.position;
    const c = toLinear(l.color, [1, 1, 1]);
    const I = l.intensity ?? 1;
    L[b] = pos[0]; L[b + 1] = pos[1]; L[b + 2] = pos[2];
    L[b + 3] = c[0] * I; L[b + 4] = c[1] * I; L[b + 5] = c[2] * I;
    L[b + 6] = l.range ?? l.distance ?? 0; L[b + 7] = l.radius ?? 0.05;
    L[b + 8] = l.type === 'spot' ? 1 : 0;
    let d = l.dir || (l.target ? [l.target[0] - pos[0], l.target[1] - pos[1], l.target[2] - pos[2]] : [0, -1, 0]);
    d = norm3(d);
    L[b + 9] = -d[0]; L[b + 10] = -d[1]; L[b + 11] = -d[2];
    const ang = l.angle ?? Math.PI / 3, pen = l.penumbra ?? 0;
    L[b + 12] = Math.cos(ang); L[b + 13] = Math.cos(ang * (1 - pen));
    L[b + 14] = l.decay ?? 2;
  });
  if (!lights.length) L.fill(0);

  // ---- triangles
  const mats = new MaterialTable(o, log);
  const recv = receivers.map((m) => ({ mesh: m, ...extract(m, m.matrixWorld, mats), scale: m.userData?.lightmap?.scale ?? 1 }));
  const occ = [];
  for (const m of occluders) {
    if (m.isInstancedMesh) {
      const im = new THREE.Matrix4(), w = new THREE.Matrix4();
      for (let i = 0; i < m.count; i++) { m.getMatrixAt(i, im); w.multiplyMatrices(m.matrixWorld, im); occ.push({ mesh: m, ...extract(m, w, mats) }); }
    } else occ.push({ mesh: m, ...extract(m, m.matrixWorld, mats) });
  }
  let nRecvTris = 0;
  for (const r of recv) { r.t0 = nRecvTris; nRecvTris += r.nt; }
  let nAll = nRecvTris;
  for (const c of occ) { c.t0 = nAll; nAll += c.nt; }
  const P = new Float32Array(nAll * 9), NRM = new Float32Array(nAll * 9), SLOT = new Int32Array(nAll);
  const inBVH = new Uint8Array(nAll);
  for (const r of [...recv, ...occ]) {
    P.set(r.P, r.t0 * 9); NRM.set(r.N, r.t0 * 9); SLOT.set(r.S, r.t0);
    inBVH.fill(r.mesh.userData?.lightmap?.castShadow === false ? 0 : 1, r.t0, r.t0 + r.nt);
  }
  for (const c of occ) { c.P = c.N = null; }
  log(`${receivers.length} receivers (${nRecvTris} tris), ${occluders.length} occluders (${nAll - nRecvTris} tris), ${mats.slots.length} materials, ${lights.length} lights`);
  stage('collect');

  // ---- charts
  const cosA = Math.cos((o.chartAngle * Math.PI) / 180);
  const charts = [];
  for (let ri = 0; ri < recv.length; ri++) {
    const r = recv[ri];
    r.charts = [];
    for (const members of growCharts(P, r.t0, r.nt, cosA)) {
      const ch = { recv: ri, tris: members, ...frameChart(P, members) };
      chartExtents(P, ch);
      r.charts.push(ch);
    }
  }
  // overlap check for curved charts (fall back to strictly planar charts)
  let fixed = 0;
  for (const r of recv) {
    const out = [];
    for (const ch of r.charts) {
      if (ch.tris.length > 1) {
        const tmp = [0, 0, 0];
        let curved = false;
        for (const t of ch.tris) { if (triNormalArea(P, t, tmp) > 0 && tmp[0] * ch.N[0] + tmp[1] * ch.N[1] + tmp[2] * ch.N[2] < 0.9999) { curved = true; break; } }
        if (curved && chartOverlaps(P, ch, o.resolution * r.scale)) {
          fixed++;
          for (const t of ch.tris) { const c2 = { recv: ch.recv, tris: [t], ...frameChart(P, [t]) }; chartExtents(P, c2); out.push(c2); }
          continue;
        }
      }
      out.push(ch);
    }
    r.charts = out;
    for (const ch of r.charts) charts.push(ch);
  }
  if (fixed) log(`${fixed} curved charts overlapped when flattened: split into faces`);
  stage('charts');

  // ---- density (auto-fit into maxAtlases) and chart rectangles
  const pad = Math.max(2, o.padding | 0);
  const maxInterior = o.maxAtlas - 2 * pad - 2;
  let densScale = 1;
  const rectArea = (s) => {
    let A = 0;
    for (const ch of charts) {
      const d = o.resolution * recv[ch.recv].scale * s;
      A += (Math.min(maxInterior, Math.ceil(ch.eu * d)) + 2 * pad) * (Math.min(maxInterior, Math.ceil(ch.ev * d)) + 2 * pad);
    }
    return A;
  };
  if (o.maxAtlases > 0) {
    const budget = o.maxAtlases * o.maxAtlas * o.maxAtlas * 0.78;
    for (let it = 0; it < 12; it++) { const A = rectArea(densScale); if (A <= budget) break; densScale *= Math.sqrt(budget / A) * 0.98; }
    if (densScale < 1) log(`resolution scaled by ${densScale.toFixed(3)} to fit ${o.maxAtlases} atlas(es)`);
  }
  // split charts larger than an atlas
  const finalCharts = [];
  const splitChart = (ch, d) => {
    if (ch.eu * d <= maxInterior && ch.ev * d <= maxInterior) { finalCharts.push(ch); return; }
    const alongU = ch.eu >= ch.ev;
    const A = alongU ? ch.U : ch.V, mid = (alongU ? ch.u0 + ch.eu / 2 : ch.v0 + ch.ev / 2);
    const a = [], b = [];
    for (const t of ch.tris) {
      let s = 0;
      for (let c = 0; c < 3; c++) { const o2 = t * 9 + c * 3; s += P[o2] * A[0] + P[o2 + 1] * A[1] + P[o2 + 2] * A[2]; }
      (s / 3 < mid ? a : b).push(t);
    }
    if (!a.length || !b.length) { finalCharts.push(ch); return; }
    for (const part of [a, b]) { const c2 = { ...ch, tris: part }; chartExtents(P, c2); splitChart(c2, d); }
  };
  for (const ch of charts) splitChart(ch, o.resolution * recv[ch.recv].scale * densScale);
  for (const r of recv) r.charts = [];
  for (const ch of finalCharts) {
    const d = o.resolution * recv[ch.recv].scale * densScale;
    ch.dens = d;
    ch.iw = Math.max(1, Math.ceil(ch.eu * d - 1e-6));
    ch.ih = Math.max(1, Math.ceil(ch.ev * d - 1e-6));
    ch.rot = ch.ih > ch.iw; // lay charts flat for the skyline packer
    ch.w = (ch.rot ? ch.ih : ch.iw) + 2 * pad;
    ch.h = (ch.rot ? ch.iw : ch.ih) + 2 * pad;
    recv[ch.recv].charts.push(ch);
  }
  const sortCharts = (list) => list.sort((a, b) => b.h - a.h || b.w - a.w);

  // ---- pack: every receiver (or receiver part) lives in exactly one atlas
  const groups = []; // { recv, part, charts, area }
  for (let ri = 0; ri < recv.length; ri++) {
    const r = recv[ri];
    sortCharts(r.charts);
    const area = r.charts.reduce((s, c) => s + c.w * c.h, 0);
    const empty = new Skyline(o.maxAtlas, o.maxAtlas);
    if (tryPackGroup(empty, r.charts)) groups.push({ recv: ri, part: 0, charts: r.charts, area });
    else {
      // too big for one atlas: split into parts that each fit
      let part = 0, sky = new Skyline(o.maxAtlas, o.maxAtlas), cur = [];
      for (const ch of r.charts) {
        if (!sky.insert(ch.w, ch.h)) { groups.push({ recv: ri, part: part++, charts: cur, area: 0 }); sky = new Skyline(o.maxAtlas, o.maxAtlas); cur = []; sky.insert(ch.w, ch.h); }
        cur.push(ch);
      }
      groups.push({ recv: ri, part: part++, charts: cur, area: 0 });
      for (const g of groups) if (g.recv === ri) g.area = g.charts.reduce((s, c) => s + c.w * c.h, 0);
      log(`mesh "${r.mesh.name}" needs ${part} atlases: split into ${part} meshes`);
    }
  }
  groups.sort((a, b) => b.area - a.area);
  const totalArea = groups.reduce((s, g) => s + g.area, 0);
  const sizes = [];
  for (let s = o.minAtlas; s <= o.maxAtlas; s *= 2) { if (s > o.minAtlas) sizes.push([s, s / 2]); sizes.push([s, s]); }
  const packAll = (W, H, list) => {
    let sky = new Skyline(W, H);
    const placed = [];
    for (const g of list) {
      const r = tryPackGroup(sky, g.charts);
      if (!r) return null;
      sky = r.sky; placed.push(r.places);
    }
    return placed;
  };
  const atlases = []; // { w, h, groups: [g], places: [[{x,y}]] }
  let pending = groups.slice();
  while (pending.length) {
    const rest = pending.reduce((s, g) => s + g.area, 0);
    let done = false;
    if (rest <= o.maxAtlas * o.maxAtlas) {
      for (const [W, H] of sizes) {
        if (W * H < rest) continue;
        const pl = packAll(W, H, pending);
        if (pl) { atlases.push({ w: W, h: H, groups: pending, places: pl }); pending = []; done = true; break; }
      }
    }
    if (done) break;
    // fill one full-size atlas greedily
    let sky = new Skyline(o.maxAtlas, o.maxAtlas);
    const inA = [], pl = [], left = [];
    for (const g of pending) {
      const r = tryPackGroup(sky, g.charts);
      if (r) { sky = r.sky; inA.push(g); pl.push(r.places); } else left.push(g);
    }
    if (!inA.length) throw new Error('lightmap packing failed');
    atlases.push({ w: o.maxAtlas, h: o.maxAtlas, groups: inA, places: pl });
    pending = left;
  }
  // assign chart placement + per-triangle pixel UVs
  const TUV = new Float32Array(Math.max(1, nRecvTris) * 6);
  const triChart = new Int32Array(nRecvTris).fill(-1);
  const allCharts = [];
  atlases.forEach((A, ai) => {
    A.groups.forEach((g, gi) => {
      g.atlas = ai;
      g.charts.forEach((ch, ci) => {
        const p = A.places[gi][ci];
        ch.atlas = ai; ch.x = p.x; ch.y = p.y; ch.part = g.part; ch.id = allCharts.length;
        allCharts.push(ch);
        const offU = pad + (ch.iw - ch.eu * ch.dens) / 2, offV = pad + (ch.ih - ch.ev * ch.dens) / 2;
        for (const t of ch.tris) {
          triChart[t] = ch.id;
          for (let c = 0; c < 3; c++) {
            const q = t * 9 + c * 3;
            const u = (P[q] * ch.U[0] + P[q + 1] * ch.U[1] + P[q + 2] * ch.U[2] - ch.u0) * ch.dens + offU;
            const v = (P[q] * ch.V[0] + P[q + 1] * ch.V[1] + P[q + 2] * ch.V[2] - ch.v0) * ch.dens + offV;
            TUV[t * 6 + c * 2] = ch.x + (ch.rot ? v : u);
            TUV[t * 6 + c * 2 + 1] = ch.y + (ch.rot ? u : v);
          }
        }
      });
    });
  });
  const usedPx = allCharts.reduce((s, c) => s + c.w * c.h, 0);
  log(`${allCharts.length} charts in ${atlases.length} atlas(es): ${atlases.map((a) => a.w + 'x' + a.h).join(', ')} (fill ${(100 * usedPx / atlases.reduce((s, a) => s + a.w * a.h, 0)).toFixed(0)} %, ${(totalArea / 1e6).toFixed(2)} Mtexel)`);
  stage('pack');

  // ---- BVH (receivers + occluders that cast shadows)
  const bvhTris = [];
  for (let t = 0; t < nAll; t++) if (inBVH[t]) bvhTris.push(t);
  const nB = bvhTris.length;
  const bpos = new Float32Array(nB * 9);
  for (let k = 0; k < nB; k++) bpos.set(P.subarray(bvhTris[k] * 9, bvhTris[k] * 9 + 9), k * 9);
  const bgeo = new THREE.BufferGeometry();
  bgeo.setAttribute('position', new THREE.BufferAttribute(bpos, 3));
  const bidx = new Uint32Array(nB * 3);
  for (let i = 0; i < nB * 3; i++) bidx[i] = i;
  bgeo.setIndex(new THREE.BufferAttribute(bidx, 1));
  const bvh = new MeshBVH(bgeo, { strategy: SAH, maxLeafSize: 4, setBoundingBox: false });
  const root = bvh._roots[0];
  // receivers excluded from the BVH still need triangle data for their texels: append them
  const nExtra = nRecvTris - bvhTris.filter((t) => t < nRecvTris).length;
  const nT = nB + nExtra;
  const sab = (n, Type) => new Type(new SharedArrayBuffer(Math.max(1, n) * Type.BYTES_PER_ELEMENT));
  const TRI = sab(nT * 9, Float32Array), TN = sab(nT * 9, Float32Array), TUVB = sab(nT * 6, Float32Array);
  const TMAT = sab(nT, Int32Array), TATL = sab(nT, Int32Array);
  const g2b = new Int32Array(nAll).fill(-1);
  const ix = bgeo.index.array;
  const putTri = (k, t) => {
    g2b[t] = k;
    const s = t * 9, d = k * 9;
    TRI[d] = P[s]; TRI[d + 1] = P[s + 1]; TRI[d + 2] = P[s + 2];
    for (let c = 0; c < 3; c++) { TRI[d + 3 + c] = P[s + 3 + c] - P[s + c]; TRI[d + 6 + c] = P[s + 6 + c] - P[s + c]; }
    TN.set(NRM.subarray(s, s + 9), d);
    TMAT[k] = SLOT[t];
    if (t < nRecvTris && triChart[t] >= 0) { TATL[k] = allCharts[triChart[t]].atlas; TUVB.set(TUV.subarray(t * 6, t * 6 + 6), k * 6); }
    else TATL[k] = -1;
  };
  for (let k = 0; k < nB; k++) putTri(k, bvhTris[ix[k * 3] / 3]);
  let ke = nB;
  for (let t = 0; t < nRecvTris; t++) if (!inBVH[t]) putTri(ke++, t);
  const nodes = new SharedArrayBuffer(root.byteLength);
  new Uint8Array(nodes).set(new Uint8Array(root));
  log(`BVH: ${nB} triangles, ${(root.byteLength / 32) | 0} nodes`);
  stage('bvh');

  // ---- texels: conservative rasterisation of every chart triangle
  const R = 1.0;            // ring radius (px) traced outside the chart
  const insetPx = Math.max(0.02, 0.004 * o.resolution * densScale);
  const atl = atlases.map((A) => ({ w: A.w, h: A.h, owner: new Int32Array(A.w * A.h).fill(-1), dist: new Float32Array(A.w * A.h).fill(1e9), bary: new Float32Array(A.w * A.h * 2), rect: new Int32Array(A.w * A.h).fill(-1) }));
  for (const ch of allCharts) {
    const a = atl[ch.atlas];
    for (let y = ch.y; y < ch.y + ch.h; y++) a.rect.fill(ch.id, y * a.w + ch.x, y * a.w + ch.x + ch.w);
    for (const t of ch.tris) {
      const ax = TUV[t * 6], ay = TUV[t * 6 + 1], bx = TUV[t * 6 + 2], by = TUV[t * 6 + 3], cx = TUV[t * 6 + 4], cy = TUV[t * 6 + 5];
      const A2 = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
      if (Math.abs(A2) < 1e-10) continue;
      const x0 = Math.max(ch.x, Math.floor(Math.min(ax, bx, cx) - R)), x1 = Math.min(ch.x + ch.w - 1, Math.ceil(Math.max(ax, bx, cx) + R));
      const y0 = Math.max(ch.y, Math.floor(Math.min(ay, by, cy) - R)), y1 = Math.min(ch.y + ch.h - 1, Math.ceil(Math.max(ay, by, cy) + R));
      const gx = (ax + bx + cx) / 3, gy = (ay + by + cy) / 3;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const qx = x + 0.5, qy = y + 0.5;
        let u = ((qx - ax) * (cy - ay) - (cx - ax) * (qy - ay)) / A2;
        let v = ((bx - ax) * (qy - ay) - (qx - ax) * (by - ay)) / A2;
        let d = 0;
        if (u < 0 || v < 0 || u + v > 1) {
          // closest point on the triangle
          let best = Infinity, bu = 0, bv = 0;
          const seg = (x1_, y1_, x2_, y2_, u1, v1, u2, v2) => {
            const ex = x2_ - x1_, ey = y2_ - y1_;
            let s = ((qx - x1_) * ex + (qy - y1_) * ey) / (ex * ex + ey * ey || 1);
            s = s < 0 ? 0 : s > 1 ? 1 : s;
            const dx = x1_ + ex * s - qx, dy = y1_ + ey * s - qy, dd = dx * dx + dy * dy;
            if (dd < best) { best = dd; bu = u1 + (u2 - u1) * s; bv = v1 + (v2 - v1) * s; }
          };
          seg(ax, ay, bx, by, 0, 0, 1, 0); seg(bx, by, cx, cy, 1, 0, 0, 1); seg(cx, cy, ax, ay, 0, 1, 0, 0);
          d = Math.sqrt(best);
          if (d > R) continue;
          // inset towards the centroid so rays never start exactly on a neighbouring surface
          const px2 = ax + (bx - ax) * bu + (cx - ax) * bv, py2 = ay + (by - ay) * bu + (cy - ay) * bv;
          const gd = Math.hypot(gx - px2, gy - py2);
          const s = gd > 0 ? Math.min(1, insetPx / gd) : 0;
          u = bu + (1 / 3 - bu) * s; v = bv + (1 / 3 - bv) * s;
          d += 1e-3;
        }
        const k = y * a.w + x;
        if (d < a.dist[k]) { a.dist[k] = d; a.owner[k] = t; a.bary[k * 2] = u; a.bary[k * 2 + 1] = v; }
      }
    }
  }
  let nTex = 0;
  for (const a of atl) for (let k = 0; k < a.owner.length; k++) if (a.owner[k] >= 0) nTex++;
  const texTri = sab(nTex, Int32Array), texBary = sab(nTex * 2, Float32Array);
  const texAtl = new Uint16Array(nTex), texPix = new Int32Array(nTex);
  {
    let i = 0;
    atl.forEach((a, ai) => {
      a.tex = new Int32Array(a.w * a.h).fill(-1);
      for (let k = 0; k < a.owner.length; k++) {
        if (a.owner[k] < 0) continue;
        texTri[i] = g2b[a.owner[k]]; texBary[i * 2] = a.bary[k * 2]; texBary[i * 2 + 1] = a.bary[k * 2 + 1];
        texAtl[i] = ai; texPix[i] = k; a.tex[k] = i;
        i++;
      }
      a.owner = a.dist = a.bary = null;
    });
  }
  log(`${nTex} texels to trace`);
  stage('raster');

  // ---- shared buffers + workers
  const S1 = o.directSamples || Math.max(16, Math.ceil(o.samples / 2));
  const S2 = o.samples;
  const shared = {
    nodes, tri: TRI.buffer, triN: TN.buffer, triUV: TUVB.buffer, triMat: TMAT.buffer, triAtlas: TATL.buffer,
    mats: toShared(mats.pack()), texTri: texTri.buffer, texBary: texBary.buffer,
    outDirect: sab(nTex * 4, Float32Array).buffer, outSky1: sab(nTex * 3, Float32Array).buffer, outLights: sab(nTex * 3, Float32Array).buffer,
    outBack: sab(nTex, Float32Array).buffer, outSky2: sab(nTex * 3, Float32Array).buffer, outBounce: sab(nTex * 3, Float32Array).buffer,
    outVar: sab(nTex, Float32Array).buffer, valid: sab(nTex, Uint8Array).buffer,
    sky: toShared(sky.data), skyW: sky.w, skyH: sky.h, irr: toShared(sky.irr), irrW: sky.irrW, irrH: sky.irrH,
    lights: toShared(L),
    params: {
      sunDir, sunColor: sunColor.map((c) => c * sunIntensity), sunCos: Math.cos(sunAngle), sunSamples: o.sunSamples,
      skySamples1: S1, skySamples2: S2, eps: o.eps, far: o.far, jitter: !!o.jitter, lightSamples: o.lightSamples,
    },
  };
  K.init(shared);
  const nThreads = Math.max(1, Math.min(o.workers || o.threads || Math.min(6, os.availableParallelism() - 1), 64));
  const pool = nThreads > 1 && nTex > 4096 ? await makePool(nThreads, shared) : null;
  const run = async (kernel, label, arg = 0) => {
    const t = performance.now();
    if (pool) await pool.run(kernel, nTex, arg, (f) => log(`  ${label} ${(f * 100).toFixed(0)} %`));
    else {
      const CH = 4096;
      let last = performance.now();
      for (let s = 0; s < nTex; s += CH) {
        K.kernels[kernel](s, Math.min(nTex, s + CH), arg);
        if (performance.now() - last > 5000) { last = performance.now(); log(`  ${label} ${(s / nTex * 100).toFixed(0)} %`); }
      }
    }
    log(`${label}: ${((performance.now() - t) / 1000).toFixed(1)} s`);
  };

  const O_DIRECT = new Float32Array(shared.outDirect), O_SKY1 = new Float32Array(shared.outSky1), O_LIGHTS = new Float32Array(shared.outLights);
  const O_BACK = new Float32Array(shared.outBack), O_SKY2 = new Float32Array(shared.outSky2), O_BOUNCE = new Float32Array(shared.outBounce);
  const O_VAR = new Float32Array(shared.outVar), VALID = new Uint8Array(shared.valid);

  // per-pixel guides (position, normal) for fill / denoise
  const frame = new Float64Array(6);
  for (const a of atl) {
    a.pos = new Float32Array(a.w * a.h * 3); a.nrm = new Float32Array(a.w * a.h * 3);
    for (let k = 0; k < a.tex.length; k++) {
      const i = a.tex[k];
      if (i < 0) continue;
      K.texelFrame(i, frame);
      a.pos[k * 3] = frame[0]; a.pos[k * 3 + 1] = frame[1]; a.pos[k * 3 + 2] = frame[2];
      a.nrm[k * 3] = frame[3]; a.nrm[k * 3 + 1] = frame[4]; a.nrm[k * 3 + 2] = frame[5];
    }
  }

  try {
    await run('passDirect', 'pass A (sun, sky, lights)');
    stage('passA');
    let nInvalid = 0;
    for (let i = 0; i < nTex; i++) { VALID[i] = O_BACK[i] <= o.invalidThreshold ? 1 : 0; if (!VALID[i]) nInvalid++; }
    log(`${nInvalid} texels inside geometry (${(100 * nInvalid / nTex).toFixed(1)} %) -> filled from neighbours`);

    // irradiance source for the bounce: direct sun + sky + lights (+ previous bounce)
    const skyC = new Float32Array(nTex * 3);
    const bounce = new Float32Array(nTex * 3);
    const sourceAtlases = (withBounce) => atl.map((a) => {
      const E = new Float32Array(new SharedArrayBuffer(a.w * a.h * 3 * 4));
      const st = new Uint8Array(a.w * a.h);
      for (let k = 0; k < a.tex.length; k++) {
        const i = a.tex[k];
        if (i < 0) continue;
        st[k] = VALID[i] ? 1 : 2;
        for (let c = 0; c < 3; c++) {
          const sk = withBounce ? skyC[i * 3 + c] : O_SKY1[i * 3 + c];
          E[k * 3 + c] = O_DIRECT[i * 4 + c] + sk + O_LIGHTS[i * 3 + c] + (withBounce ? bounce[i * 3 + c] : 0);
        }
      }
      fillLayers(a.w, a.h, st, a.rect, [E], [3], 2, 64);
      fillLayers(a.w, a.h, st, a.rect, [E], [3], 0, pad + 1);
      return { w: a.w, h: a.h, E: E.buffer };
    });
    for (let b = 0; b < Math.max(1, o.bounces); b++) {
      const src = sourceAtlases(b > 0);
      if (pool) await pool.atlases(src); else K.setAtlases(src);
      await run('passBounce', `pass B${o.bounces > 1 ? ' #' + (b + 1) : ''} (sky + bounce)`, b);
      for (let i = 0; i < nTex * 3; i++) {
        skyC[i] = (O_SKY1[i] * S1 + O_SKY2[i] * S2) / (S1 + S2);
        bounce[i] = O_BOUNCE[i];
      }
    }
    if (o.bounces === 0) bounce.fill(0);
    stage('passB');

    // ---- per atlas: compose, fill, denoise, dilate, encode
    const full = o.mode === 'full';
    const range = o.range || (full ? 16 : 8);
    const sc = sunColor.map((c) => c * sunIntensity);
    const out = [];
    let clipped = 0, maxE = 0;
    for (let ai = 0; ai < atl.length; ai++) {
      const a = atl[ai], W = a.w, H = a.h, n = W * H;
      const E = new Float32Array(n * 3), M = new Float32Array(n), V = new Float32Array(n), MV = new Float32Array(n);
      const st = new Uint8Array(n);
      for (let k = 0; k < n; k++) {
        const i = a.tex[k];
        if (i < 0) continue;
        st[k] = VALID[i] ? 1 : 2;
        for (let c = 0; c < 3; c++) E[k * 3 + c] = skyC[i * 3 + c] + bounce[i * 3 + c] + O_LIGHTS[i * 3 + c];
        M[k] = O_DIRECT[i * 4 + 3];
        // variance: pass-B estimate scaled to the combined sample count, + sky-1 share
        V[k] = O_VAR[i] * (S2 / (S1 + S2));
        MV[k] = M[k] * (1 - M[k]) / o.sunSamples;
      }
      fillLayers(W, H, st, a.rect, [E, M, V, MV], [3, 1, 1, 1], 2, 128);
      if (o.denoise) {
        atrous(W, H, E, V, st, a.rect, a.nrm, 3, 4);
        atrous(W, H, M, MV, st, a.rect, a.nrm, 1, 3, 1);
      }
      if (full) {
        for (let k = 0; k < n; k++) {
          if (!st[k]) continue;
          const ndl = Math.max(0, a.nrm[k * 3] * sunDir[0] + a.nrm[k * 3 + 1] * sunDir[1] + a.nrm[k * 3 + 2] * sunDir[2]);
          for (let c = 0; c < 3; c++) E[k * 3 + c] += sc[c] * ndl * M[k];
        }
      }
      fillLayers(W, H, st, a.rect, [E, M], [3, 1], 0, pad + 1);
      // encode
      const rgbm = Buffer.alloc(n * 4), mask = Buffer.alloc(n);
      for (let k = 0; k < n; k++) {
        let r = E[k * 3], g = E[k * 3 + 1], b = E[k * 3 + 2];
        const mx = Math.max(r, g, b);
        if (mx > maxE) maxE = mx;
        if (mx > range) clipped++;
        r = Math.sqrt(Math.max(0, r) / range); g = Math.sqrt(Math.max(0, g) / range); b = Math.sqrt(Math.max(0, b) / range);
        let m = Math.min(1, Math.max(r, g, b, 1e-6));
        m = Math.ceil(m * 255) / 255;
        rgbm[k * 4] = Math.min(255, Math.round((r / m) * 255));
        rgbm[k * 4 + 1] = Math.min(255, Math.round((g / m) * 255));
        rgbm[k * 4 + 2] = Math.min(255, Math.round((b / m) * 255));
        rgbm[k * 4 + 3] = Math.round(m * 255);
        mask[k] = Math.round(Math.min(1, Math.max(0, M[k])) * 255);
      }
      const rgbmPng = PNG.sync.write({ width: W, height: H, data: rgbm }, { colorType: 6, inputColorType: 6, deflateLevel: 6 });
      const maskPng = PNG.sync.write({ width: W, height: H, data: mask }, { colorType: 0, inputColorType: 0, deflateLevel: 6 });
      out.push({ index: ai, width: W, height: H, rgbm: rgbmPng, sun: maskPng, ...(o.keepFloat ? { E, mask: M, state: st } : {}) });
    }
    if (clipped) log(`${clipped} texels above the RGBM range ${range} (max ${maxE.toFixed(2)}) were clipped`);
    stage('post');

    // ---- apply uv1 to the meshes
    const result = [];
    for (let ri = 0; ri < recv.length; ri++) {
      const r = recv[ri];
      const parts = new Map();
      for (const ch of r.charts) { if (!parts.has(ch.part)) parts.set(ch.part, []); parts.get(ch.part).push(ch); }
      const partList = [...parts.keys()].sort((x, y) => x - y);
      for (const p of partList) {
        const chs = parts.get(p);
        const A = atlases[chs[0].atlas];
        const geo = rebuildGeometry(r, chs, TUV, A.w, A.h, o.uvAttribute);
        let mesh = r.mesh;
        if (p !== partList[0]) {
          mesh = r.mesh.clone(false);
          mesh.name = `${r.mesh.name || 'mesh'}_lm${p}`;
          mesh.userData = { ...r.mesh.userData };
          if (r.mesh.parent) r.mesh.parent.add(mesh);
        }
        mesh.geometry = geo;
        mesh.userData.lightmapAtlas = chs[0].atlas;
        result.push({ mesh, atlas: chs[0].atlas });
      }
    }
    stage('apply');
    const stats = { texels: nTex, charts: allCharts.length, triangles: nAll, receivers: receivers.length, atlases: atlases.length,
      seconds: (performance.now() - T0) / 1000, timings, densityScale: densScale, maxIrradiance: maxE, clipped };
    log(`done in ${stats.seconds.toFixed(1)} s`, JSON.stringify(timings));
    const res = {
      atlases: out, meshes: result, range, mode: o.mode, encoding: 'rgbm-sqrt',
      sun: { dir: sunDir, color: sunColor, intensity: sunIntensity }, sky: { sunDir: sky.sunDir, sunIrradiance: sky.sunIrradiance, clamp: sky.clampValue },
      stats,
      /** Writes `${name}_${i}.png` (RGBM) and `${name}_${i}_sun.png` (sun mask); returns the metadata. */
      write(dir, name = 'lightmap') {
        fs.mkdirSync(dir, { recursive: true });
        const meta = { encoding: 'rgbm-sqrt', decode: 'E = range * (rgb * a)^2', range, mode: o.mode, uv: o.uvAttribute, flipY: false, atlases: [] };
        for (const a of out) {
          const f1 = `${name}_${a.index}.png`, f2 = `${name}_${a.index}_sun.png`;
          fs.writeFileSync(path.join(dir, f1), a.rgbm);
          fs.writeFileSync(path.join(dir, f2), a.sun);
          meta.atlases.push({ rgbm: f1, sun: f2, width: a.width, height: a.height });
        }
        return meta;
      },
    };
    return res;
  } finally {
    if (pool) await pool.close();
  }
}

function toShared(arr) {
  const s = new SharedArrayBuffer(Math.max(4, arr.byteLength));
  new Uint8Array(s).set(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
  return s;
}

async function makePool(n, shared) {
  const url = new URL('./lightmap-worker.mjs', import.meta.url);
  const workers = [];
  for (let i = 0; i < n; i++) workers.push(new Worker(url, { workerData: { shared } }));
  const call = (w, msg) => new Promise((res, rej) => {
    const onMsg = (m) => { w.off('error', onErr); res(m); };
    const onErr = (e) => { w.off('message', onMsg); rej(e); };
    w.once('message', onMsg); w.once('error', onErr);
    w.postMessage(msg);
  });
  return {
    async atlases(list) { await Promise.all(workers.map((w) => call(w, { cmd: 'atlases', atlases: list }))); },
    async run(kernel, total, arg, progress) {
      const counter = new SharedArrayBuffer(8);
      const c = new Int32Array(counter);
      const chunk = Math.max(64, Math.min(2048, Math.ceil(total / (n * 24))));
      let last = performance.now();
      const timer = setInterval(() => { if (performance.now() - last > 4900) { last = performance.now(); progress(Atomics.load(c, 1) / total); } }, 500);
      try { await Promise.all(workers.map((w) => call(w, { cmd: 'run', kernel, total, chunk, arg, counter }))); } finally { clearInterval(timer); }
    },
    async close() { await Promise.all(workers.map((w) => w.terminate())); },
  };
}

// ------------------------------------------------------------------------------------------ post
/**
 * Breadth-first fill of pixels whose state === target from neighbours (8-connected) of the same chart
 * that hold values (state 1 or 3). Filled pixels become state 3.
 */
function fillLayers(W, H, st, rect, bufs, chans, target, maxLayers) {
  let frontier = [];
  const n = W * H;
  for (let k = 0; k < n; k++) {
    if (st[k] !== target || rect[k] < 0) continue;
    const x = k % W, y = (k / W) | 0;
    let ok = false;
    for (let dy = -1; dy <= 1 && !ok; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const q = yy * W + xx;
      if ((st[q] === 1 || st[q] === 3) && rect[q] === rect[k]) { ok = true; break; }
    }
    if (ok) frontier.push(k);
  }
  for (let layer = 0; layer < maxLayers && frontier.length; layer++) {
    const vals = [];
    for (const k of frontier) {
      const x = k % W, y = (k / W) | 0;
      let wsum = 0;
      const acc = bufs.map((b, bi) => new Float64Array(chans[bi]));
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if ((dx === 0 && dy === 0) || xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const q = yy * W + xx;
        if (!(st[q] === 1 || st[q] === 3) || rect[q] !== rect[k]) continue;
        const w = dx === 0 || dy === 0 ? 1 : 0.5;
        wsum += w;
        bufs.forEach((b, bi) => { const c = chans[bi]; for (let j = 0; j < c; j++) acc[bi][j] += b[q * c + j] * w; });
      }
      vals.push(wsum > 0 ? acc.map((a) => a.map((v) => v / wsum)) : null);
    }
    const next = [];
    frontier.forEach((k, fi) => {
      const v = vals[fi];
      if (!v) return;
      bufs.forEach((b, bi) => { const c = chans[bi]; for (let j = 0; j < c; j++) b[k * c + j] = v[bi][j]; });
      st[k] = 3;
    });
    for (const k of frontier) {
      if (st[k] !== 3) continue;
      const x = k % W, y = (k / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const q = yy * W + xx;
        if (st[q] === target && rect[q] === rect[k]) { st[q] = 255; next.push(q); }
      }
    }
    for (const q of next) st[q] = target;
    frontier = next;
  }
}

/**
 * Edge-avoiding a-trous wavelet filter (5x5 B3 kernel, step 1,2,4..) over chart texels.
 * Stops at chart borders, normal discontinuities and luminance differences larger than `sigmaL`
 * standard deviations of the (filtered) per-texel noise estimate.
 */
function atrous(W, H, val, vari, st, rect, nrm, iterations, sigmaL, ch = 3) {
  const h = [1 / 16, 1 / 4, 3 / 8, 1 / 4, 1 / 16];
  const n = W * H;
  let src = val, sv = vari;
  const has = (k) => st[k] === 1 || st[k] === 3;
  const L = (b, k) => (ch === 3 ? lum(b[k * 3], b[k * 3 + 1], b[k * 3 + 2]) : b[k]);
  for (let it = 0; it < iterations; it++) {
    const step = 1 << it;
    const dst = new Float32Array(n * ch), dv = new Float32Array(n);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = y * W + x;
      if (!has(k)) { for (let c = 0; c < ch; c++) dst[k * ch + c] = src[k * ch + c]; continue; }
      // 3x3 prefiltered variance
      let pv = 0, pw = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const q = yy * W + xx;
        if (!has(q) || rect[q] !== rect[k]) continue;
        const w = (dx === 0 ? 2 : 1) * (dy === 0 ? 2 : 1);
        pv += sv[q] * w; pw += w;
      }
      const sd = Math.sqrt(Math.max(0, pv / pw));
      const lp = L(src, k);
      const nx = nrm[k * 3], ny = nrm[k * 3 + 1], nz = nrm[k * 3 + 2];
      let ws = 0, wv = 0;
      const acc = [0, 0, 0];
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
        const xx = x + i * step, yy = y + j * step;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const q = yy * W + xx;
        if (!has(q) || rect[q] !== rect[k]) continue;
        let w = h[i + 2] * h[j + 2];
        if (q !== k) {
          const dn = nx * nrm[q * 3] + ny * nrm[q * 3 + 1] + nz * nrm[q * 3 + 2];
          if (dn <= 0) continue;
          w *= Math.pow(dn, 32);
          const dl = Math.abs(L(src, q) - lp);
          w *= Math.exp(-dl / (sigmaL * sd + 1e-5));
        }
        ws += w; wv += w * w * sv[q];
        for (let c = 0; c < ch; c++) acc[c] += src[q * ch + c] * w;
      }
      for (let c = 0; c < ch; c++) dst[k * ch + c] = acc[c] / ws;
      dv[k] = wv / (ws * ws);
    }
    src = dst; sv = dv;
  }
  val.set(src);
}

function rebuildGeometry(r, charts, TUV, W, H, uvName) {
  const g = r.mesh.geometry;
  const nvSrc = g.attributes.position.count;
  const tris = [];
  for (const ch of charts) for (const t of ch.tris) tris.push([t, ch.id]);
  // keep material groups: sort by group material index, then by original order
  tris.sort((a, b) => (r.LM[a[0] - r.t0] - r.LM[b[0] - r.t0]) || (a[0] - b[0]));
  const vmap = new Map();
  const corners = [];
  const index = [];
  const swap = r.flip ? [0, 2, 1] : [0, 1, 2];
  for (const [t, cid] of tris) {
    const lt = t - r.t0;
    for (let c = 0; c < 3; c++) {
      const vi = r.C[lt * 3 + c];
      const key = cid * nvSrc + vi;
      let ni = vmap.get(key);
      if (ni === undefined) {
        ni = corners.length;
        vmap.set(key, ni);
        const cc = swap[c];
        corners.push([vi, TUV[t * 6 + cc * 2] / W, TUV[t * 6 + cc * 2 + 1] / H]);
      }
      index.push(ni);
    }
  }
  const out = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(g.attributes)) {
    if (name === uvName) continue;
    const sz = attr.itemSize;
    const arr = new Float32Array(corners.length * sz);
    for (let i = 0; i < corners.length; i++) for (let c = 0; c < sz; c++) arr[i * sz + c] = attr.getComponent(corners[i][0], c);
    out.setAttribute(name, new THREE.BufferAttribute(arr, sz));
  }
  const uv = new Float32Array(corners.length * 2);
  for (let i = 0; i < corners.length; i++) { uv[i * 2] = corners[i][1]; uv[i * 2 + 1] = corners[i][2]; }
  out.setAttribute(uvName, new THREE.BufferAttribute(uv, 2));
  out.setIndex(corners.length > 65535 ? new THREE.BufferAttribute(new Uint32Array(index), 1) : new THREE.BufferAttribute(new Uint16Array(index), 1));
  if (Array.isArray(r.mesh.material) && g.groups.length) {
    let start = 0;
    for (let i = 0; i <= tris.length; i++) {
      const cur = i < tris.length ? r.LM[tris[i][0] - r.t0] : -1;
      const prev = i > 0 ? r.LM[tris[i - 1][0] - r.t0] : cur;
      if (i === tris.length || (i > 0 && cur !== prev)) { out.addGroup(start * 3, (i - start) * 3, prev); start = i; }
    }
  }
  out.name = g.name;
  out.userData = { ...g.userData };
  return out;
}

/** Decodes an RGBM-sqrt atlas (+ optional sun mask) PNG back to floats: { width, height, E: rgb Float32Array, M }. */
export function decodeRGBM(rgbmPng, sunPng, range) {
  const p = PNG.sync.read(Buffer.isBuffer(rgbmPng) ? rgbmPng : fs.readFileSync(rgbmPng));
  const n = p.width * p.height;
  const E = new Float32Array(n * 3), M = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const a = p.data[k * 4 + 3] / 255;
    for (let c = 0; c < 3; c++) { const v = (p.data[k * 4 + c] / 255) * a; E[k * 3 + c] = range * v * v; }
  }
  if (sunPng) {
    const s = PNG.sync.read(Buffer.isBuffer(sunPng) ? sunPng : fs.readFileSync(sunPng));
    const ch = s.data.length / n;
    for (let k = 0; k < n; k++) M[k] = s.data[k * ch] / 255;
  }
  return { width: p.width, height: p.height, E, M };
}

/** Average linear colour of a PNG (pngjs) or JPEG (needs the optional `jpeg-js` package) texture file. */
export async function averageTextureColor(file) {
  const buf = fs.readFileSync(file);
  let data, w, h;
  if (/\.png$/i.test(file)) { const p = PNG.sync.read(buf); data = p.data; w = p.width; h = p.height; }
  else {
    let jpeg;
    try { jpeg = await import('jpeg-js'); } catch { throw new Error('averageTextureColor: install the pure-JS `jpeg-js` devDependency to read JPEG files'); }
    const d = (jpeg.default || jpeg).decode(buf, { useTArray: true, formatAsRGBA: true });
    data = d.data; w = d.width; h = d.height;
  }
  let r = 0, g = 0, b = 0, n = 0;
  const step = Math.max(1, Math.floor((w * h) / 262144));
  for (let i = 0; i < w * h; i += step) { r += srgbToLinear(data[i * 4] / 255); g += srgbToLinear(data[i * 4 + 1] / 255); b += srgbToLinear(data[i * 4 + 2] / 255); n++; }
  return [r / n, g / n, b / n];
}
