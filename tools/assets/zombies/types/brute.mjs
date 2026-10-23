// brute — 重裝屠夫 BRUTE, heavy tank special (game/src/zombies/defs.js `brute`): 2.43 m rest height, ~2.2 m in the
// clips' hunch. A slaughterhouse worker turned experiment: a huge muscular-obese man (MakeHuman macro muscle / weight
// 1, bull neck, trapezius yoke sculpted up to the ears so the SMALL head sinks between the shoulders, Popeye forearms,
// 1.2x hands, hard overhanging gut), the RIGHT shoulder / trapezius / shoulder blade swollen by a tumour mass (sculpted
// lumps in the skin + eight lobed, weeping growths bursting out of it), an autopsy Y-incision and a skull opening
// stapled shut, small deep-red glowing eyes in dark sockets, a snarl of yellow teeth. Heavy blue PVC butcher's apron
// (blood-smeared, torn hem / slash / ripped corner), yellow PVC work trousers tucked into one-piece dirty white
// rubber wellingtons, a rusted oil-drum steel pauldron on the LEFT shoulder held by a heavy chain bandolier, a forged
// iron shackle on the left wrist with two broken links lying on the back of the hand. Silhouette: asymmetric hulk -
// lumpy tumour hump on one side, steel plate on the other, tiny head, long thick arms; blue / yellow / white colour
// blocking (the butcher boss is olive / dark red / black).
//
// Everything specific to this character lives in this file; the shared lib is imported read-only (UV raster,
// blur / normal-from-height, rig segments, painters, Part). Implemented here (the lib has no equivalent):
//  - sculpt(): free-form edits of the morphed base mesh before fitting (rebuilds the skeleton on it)
//  - simplifyRegions(): region-weighted meshoptimizer simplification of the high-res base-mesh body with vertex locks
//    (head 1720 / hands 480 / rest 2480 tris in ONE watertight mesh; the lib's uniform per-part simplification left
//    the small head faceted) + a normal transfer from the full-resolution surface
//  - custom geometry parts (Geo / UGeo -> skinned Part with explicit weights): tumour bulbs, pauldron, apron, chains +
//    shackle, lofted one-piece wellingtons; covered skin / trousers removed under them
//  - all texture painting of the custom parts (paintPart) and the skin / cloth extras; ray-traced AO baked into the
//    ORM occlusion channel ONLY (never the albedo: see docs/ZOMBIE_PIPELINE.md 2.3)
//  - hitbox capsules with helper bones (head / horizontal chest / trapezius / tumour / gut) and ray self-checks
// Albedo (tools/assets/zombies/albedo.mjs, sRGB mean over painted texels): skin ~112, apron ~92 (teal-blue PVC),
// trousers ~103 (yellow PVC), boots ~118 (dirty white rubber, mud / blood from the sole up), tumours ~108.
// BRUTE_FAST=1 builds flat-coloured materials (silhouette / skinning iterations in seconds).
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { rasterUV, texelSurface } from '../lib/raster.mjs';
import { blurField, normalFromHeight, createImage } from '../lib/image.mjs';
import { boneSegment, buildSkeleton } from '../lib/rig.mjs';
import { albedoTracer } from '../lib/albedoTrace.mjs';
import { MeshoptSimplifier } from 'meshoptimizer';

// ---------------------------------------------------------------- vector helpers (arrays)
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const madd = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ss = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const V = (v) => [v.x, v.y, v.z];
const TAG = '  brute:';

// ---------------------------------------------------------------- colour helpers (linear light, sRGB storage)
const S2L = new Float32Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const toByte = (x) => { x = Math.max(0, x); const s = x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(s * 255))); };
const lin = (rgb) => rgb.map((v) => S2L[v]);
const lum = (c) => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
const over = (c, k, a) => { if (!(a > 0)) return; a = Math.min(1, a); for (let i = 0; i < 3; i++) c[i] += (k[i] - c[i]) * a; };
const mul = (c, k, a) => { if (!(a > 0)) return; a = Math.min(1, a); for (let i = 0; i < 3; i++) c[i] *= 1 + (k[i] - 1) * a; };
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const set3 = (c, k) => { c[0] = k[0]; c[1] = k[1]; c[2] = k[2]; };
const hash = (i) => { let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
const texSize = (s) => Math.max(64, Math.round(s * +(process.env.ZOMBIE_TEX_SCALE || 1)));
const FAST = !!process.env.BRUTE_FAST;   // silhouette iterations: flat materials, no painting

/** Per-texel grade of an RGBA image in place: fn(c linear rgb, u, v, alpha) mutates c. */
function grade(img, fn) {
  const { width: W, height: H, data } = img;
  const c = [0, 0, 0];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    c[0] = S2L[data[i]]; c[1] = S2L[data[i + 1]]; c[2] = S2L[data[i + 2]];
    fn(c, (x + 0.5) / W, (y + 0.5) / H, data[i + 3]);
    data[i] = toByte(c[0]); data[i + 1] = toByte(c[1]); data[i + 2] = toByte(c[2]);
  }
  return img;
}

/** Box-downsamples a float field S x S -> D x D (S a multiple of D). */
function downField(f, S, D, ch = 1) {
  if (S === D) return f;
  const k = S / D, out = new Float32Array(D * D * ch);
  for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) for (let c = 0; c < ch; c++) {
    let a = 0;
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) a += f[((y * k + j) * S + x * k + i) * ch + c];
    out[(y * D + x) * ch + c] = a / (k * k);
  }
  return out;
}

/** Crops a UV rect [u0, v0, u1, v1] (OBJ convention, v up) out of an image and resamples it to size x size. */
function cropUV(img, r, size, resize) {
  const W = img.width, H = img.height;
  const x0 = Math.round(r[0] * W), x1 = Math.round(r[2] * W), y0 = Math.round((1 - r[3]) * H), y1 = Math.round((1 - r[1]) * H);
  const w = Math.max(1, x1 - x0), hh = Math.max(1, y1 - y0);
  const out = createImage(w, hh, [0, 0, 0, 255]);
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
    const si = ((y0 + y) * W + x0 + x) * 4, di = (y * w + x) * 4;
    for (let k = 0; k < 4; k++) out.data[di + k] = img.data[si + k];
  }
  return resize(out, size, size);
}

/** Closest-point parameter t (0 head .. 1 tail, unclamped) and distance from P to a bone's head->tail segment. */
function boneSeg(bone) {
  const a = V(bone.head), b = V(bone.tail);
  const d = sub(b, a), dd = dot(d, d), L = Math.sqrt(dd);
  return (P) => {
    const t = dot(sub(P, a), d) / dd;
    const tc = clamp01(t);
    return { t, d: Math.hypot(P[0] - a[0] - d[0] * tc, P[1] - a[1] - d[1] * tc, P[2] - a[2] - d[2] * tc), L, a };
  };
}

/** Distance from P to a polyline (with a bounding-box early out). */
function polyDist(pts) {
  const mn = [9, 9, 9], mx = [-9, -9, -9];
  for (const p of pts) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); }
  return (P, far = 0.05) => {
    for (let k = 0; k < 3; k++) if (P[k] < mn[k] - far || P[k] > mx[k] + far) return far;
    let best = far;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], d = sub(pts[i + 1], a), dd = dot(d, d) || 1e-9;
      const t = clamp01(dot(sub(P, a), d) / dd);
      const e = Math.hypot(P[0] - a[0] - d[0] * t, P[1] - a[1] - d[1] * t, P[2] - a[2] - d[2] * t);
      if (e < best) best = e;
    }
    return best;
  };
}

/**
 * Paints a part through its own UV raster. fn(P, N, st, u, v, i) sets st.c (linear rgb), st.h (height), st.ro
 * (roughness), st.me (metalness), st.a (alpha, < 0.5 = cut), st.e (emissive rgb 0..1).
 * -> { albedo, normal, orm, emissiveMap, alpha }
 */
function paintPart(part, o, fn) {
  const S = texSize(o.size);
  const tris = part.tris(), nrm = part.normals();
  const r = rasterUV(tris, part.obj.uvs, S, o.pad ?? 6);
  const albedo = createImage(S, S, [0, 0, 0, 255]);
  const H = new Float32Array(S * S), RO = new Float32Array(S * S).fill(o.rough ?? 0.8), ME = new Float32Array(S * S);
  const EM = o.emissive ? new Float32Array(S * S * 3) : null;
  const P = [0, 0, 0], Nn = [0, 0, 0];
  const st = { c: [0, 0, 0], h: 0, ro: 0, me: 0, a: 1, e: [0, 0, 0] };
  let anyCut = false;
  for (let i = 0; i < S * S; i++) {
    if (!texelSurface(r, tris, part.pos, nrm, i, P, Nn)) continue;
    st.c[0] = st.c[1] = st.c[2] = 0.5; st.h = 0; st.ro = o.rough ?? 0.8; st.me = 0; st.a = 1; st.e[0] = st.e[1] = st.e[2] = 0;
    fn(P, Nn, st, ((i % S) + 0.5) / S, 1 - (((i / S) | 0) + 0.5) / S, i);
    const d = i * 4;
    albedo.data[d] = toByte(st.c[0]); albedo.data[d + 1] = toByte(st.c[1]); albedo.data[d + 2] = toByte(st.c[2]);
    if (st.a < 0.5) { albedo.data[d + 3] = 0; anyCut = true; }
    H[i] = st.h; RO[i] = st.ro; ME[i] = st.me;
    if (EM) { EM[i * 3] = st.e[0]; EM[i * 3 + 1] = st.e[1]; EM[i * 3 + 2] = st.e[2]; }
  }
  const NS = texSize(o.normalSize ?? o.size);
  const hS = NS === S ? H : downField(H, S, NS);
  const normal = normalFromHeight(o.hBlur ? blurField(hS, NS, NS, o.hBlur, 1) : hS, NS, NS, (o.normalStrength ?? 2) * NS / 1024);
  const OS = texSize(o.ormSize ?? Math.min(o.size, 512));
  const orm = createImage(OS, OS, [255, 200, 0, 255]);
  const rS = downField(RO, S, OS), mS = downField(ME, S, OS);
  for (let i = 0; i < OS * OS; i++) { orm.data[i * 4 + 1] = Math.round(clamp01(rS[i]) * 255); orm.data[i * 4 + 2] = Math.round(clamp01(mS[i]) * 255); }
  let emissiveMap = null;
  if (EM) {
    const ES = texSize(o.emissiveSize ?? 256);
    const e = downField(EM, S, ES, 3);
    emissiveMap = createImage(ES, ES, [0, 0, 0, 255]);
    for (let i = 0; i < ES * ES; i++) for (let c = 0; c < 3; c++) emissiveMap.data[i * 4 + c] = toByte(e[i * 3 + c]);
  }
  return { albedo, normal, orm, emissiveMap, alpha: anyCut, raster: r, S };
}

/** fn(P, N, i) for every texel of a UV raster at R x R ({tris, pos, nrm}); outside islands = fill. */
function bakeField(surf, uvs, R, fn, { fill = 1, blur = 1 } = {}) {
  const r = rasterUV(surf.tris, uvs, R, 4);
  const out = new Float32Array(R * R).fill(fill);
  const P = [0, 0, 0], Nn = [0, 0, 0];
  for (let i = 0; i < R * R; i++) if (texelSurface(r, surf.tris, surf.pos, surf.nrm, i, P, Nn)) out[i] = fn(P, Nn, i);
  return blur ? blurField(out, R, R, blur, 1) : out;
}

/** Cosine-weighted hemisphere ray-traced occlusion (distance-attenuated) against a MeshBVH. */
function occTracer(bvh, { rays = 16, maxDist = 0.1, opaque = null, seed = 0 } = {}) {
  const dirs = [];
  for (let k = 0; k < rays; k++) {
    const u = (k + 0.5) / rays;
    let v = 0, f = 0.5, m = k + 1;
    while (m) { v += f * (m & 1); m >>= 1; f *= 0.5; }
    const s = Math.sqrt(u);
    dirs.push([s * Math.cos(2 * Math.PI * v), s * Math.sin(2 * Math.PI * v), Math.sqrt(1 - u)]);
  }
  const ray = new THREE.Ray();
  return (P, Nn, i) => {
    const ax = Math.abs(Nn[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const t = norm(cross(ax, Nn)), b = cross(Nn, t);
    const a = hash(i + seed) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    let occ = 0;
    for (const d of dirs) {
      const x = d[0] * ca - d[1] * sa, y = d[0] * sa + d[1] * ca, z = d[2];
      ray.origin.set(P[0] + Nn[0] * 0.002, P[1] + Nn[1] * 0.002, P[2] + Nn[2] * 0.002);
      ray.direction.set(t[0] * x + b[0] * y + Nn[0] * z, t[1] * x + b[1] * y + Nn[1] * z, t[2] * x + b[2] * y + Nn[2] * z);
      let travelled = 0;
      for (let k = 0; k < 3; k++) {
        const hit = bvh.raycastFirst(ray, THREE.DoubleSide, 0.0005, maxDist - travelled);
        if (!hit) break;
        travelled += hit.distance;
        if (!opaque || opaque(hit)) { occ += 1 - (travelled / maxDist) ** 0.75; break; }
        ray.origin.copy(hit.point).addScaledVector(ray.direction, 0.002);
        travelled += 0.002;
      }
    }
    return 1 - occ / rays;
  };
}

/** Bilinear lookup of a field baked at R x R for texel (x, y) of a W x W image. */
function fieldAt(f, R, W, x, y) {
  const fx = Math.max(0, Math.min(R - 1.001, (x + 0.5) * R / W - 0.5)), fy = Math.max(0, Math.min(R - 1.001, (y + 0.5) * R / W - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, i = y0 * R + x0;
  return (f[i] * (1 - tx) + f[i + 1] * tx) * (1 - ty) + (f[i + R] * (1 - tx) + f[i + R + 1] * tx) * ty;
}

/** Multiplies the ORM occlusion (R) channel by fn(...fields): AO lives in the ORM, NEVER in the albedo too. */
function applyOcclusion(orm, fields, R, fn) {
  const W = orm.width, vals = new Array(fields.length);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    for (let k = 0; k < fields.length; k++) vals[k] = fieldAt(fields[k], R, W, x, y);
    const i = (y * W + x) * 4;
    orm.data[i] = Math.round(orm.data[i] * clamp01(fn(...vals)));
  }
  return orm;
}

/** Applies fn(c, ...values) to an albedo image from fields baked at R x R (colour-only detail: grime, blood). */
function applyFields(img, fields, R, fn) {
  const W = img.width, c = [0, 0, 0], vals = new Array(fields.length);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    for (let k = 0; k < fields.length; k++) vals[k] = fieldAt(fields[k], R, W, x, y);
    c[0] = S2L[img.data[i]]; c[1] = S2L[img.data[i + 1]]; c[2] = S2L[img.data[i + 2]];
    fn(c, ...vals);
    img.data[i] = toByte(c[0]); img.data[i + 1] = toByte(c[1]); img.data[i + 2] = toByte(c[2]);
  }
  return img;
}

/** Catmull-Rom through points (arrays), `n` samples per span. */
function catmull(pts, n, closed = false) {
  const out = [];
  const P = (i) => closed ? pts[(i + pts.length) % pts.length] : pts[Math.max(0, Math.min(pts.length - 1, i))];
  const spans = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < spans; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map((a) => 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3)));
    }
  }
  if (!closed) out.push(pts[pts.length - 1].slice());
  return out;
}

/** Resamples a polyline at constant spacing. */
function resample(pts, step) {
  const out = [pts[0].slice()];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = dist(a, b);
    let t = step - carry;
    while (t <= L) { out.push(lerp3(a, b, t / L)); t += step; }
    carry = L - (t - step);
  }
  return out;
}

// ---------------------------------------------------------------- custom geometry -> skinned Part
/** Geo with SEPARATE uv indices (positions shared across UV seams: smooth normals there). */
class UGeo {
  constructor() { this.P = []; this.UV = []; this.F = []; this.W = []; }
  v(p, w = null) { this.P.push(p[0], p[1], p[2]); this.W.push(w); return this.P.length / 3 - 1; }
  t(uv) { this.UV.push(uv[0], uv[1]); return this.UV.length / 2 - 1; }
  tri(a, b, c, ta, tb, tc) { this.F.push({ v: [a, b, c], t: [ta, tb, tc], g: 0 }); }
  get n() { return this.P.length / 3; }
}
class Geo {
  constructor() { this.P = []; this.UV = []; this.F = []; this.W = []; }
  v(p, uv, w = null) { this.P.push(p[0], p[1], p[2]); this.UV.push(uv[0], uv[1]); this.W.push(w); return this.P.length / 3 - 1; }
  tri(a, b, c) { this.F.push({ v: [a, b, c], t: [a, b, c], g: 0 }); }
  quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }
  get n() { return this.P.length / 3; }
}
function rot(v, ax, ang) { // Rodrigues
  const c = Math.cos(ang), s = Math.sin(ang), d = dot(ax, v), cr = cross(ax, v);
  return [v[0] * c + cr[0] * s + ax[0] * d * (1 - c), v[1] * c + cr[1] * s + ax[1] * d * (1 - c), v[2] * c + cr[2] * s + ax[2] * d * (1 - c)];
}

/**
 * Tube along a polyline: radius(t) and `sides` around, parallel-transport frames. uv rect [u0,v0,u1,v1]
 * (u along the tube, v around).
 */
function tube(g, pts, radius, sides, uvr, w = null, { ref = [0, 1, 0], closed = false } = {}) {
  const n = pts.length;
  const T = pts.map((p, i) => norm(sub(pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)], pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)])));
  let N0 = norm(cross(T[0], Math.abs(dot(T[0], ref)) > 0.9 ? [1, 0, 0] : ref));
  const frames = [];
  for (let i = 0; i < n; i++) {
    if (i) { const b = cross(T[i - 1], T[i]); if (len(b) > 1e-6) { const ax = norm(b), ang = Math.acos(Math.max(-1, Math.min(1, dot(T[i - 1], T[i])))); N0 = rot(N0, ax, ang); } }
    N0 = norm(sub(N0, scl(T[i], dot(N0, T[i]))));
    frames.push([N0, cross(T[i], N0)]);
  }
  const start = g.n, rows = closed ? n + 1 : n;
  for (let j = 0; j < rows; j++) {
    const i = j % n;
    const r = typeof radius === 'function' ? radius(j / (rows - 1), i) : radius;
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const d = add(scl(frames[i][0], Math.cos(a)), scl(frames[i][1], Math.sin(a)));
      g.v(madd(pts[i], d, r), [lerp(uvr[0], uvr[2], j / (rows - 1)), lerp(uvr[1], uvr[3], k / sides)], typeof w === 'function' ? w(j / (rows - 1), pts[i]) : w);
    }
  }
  for (let j = 0; j + 1 < rows; j++) for (let k = 0; k < sides; k++) {
    const a = start + j * (sides + 1) + k, b = a + sides + 1;
    g.quad(a, a + 1, b + 1, b);
  }
  return [start, g.n];
}

/** Turns a Geo into a lib Part (own UVs, one vertex per UV) with explicit skin weights. */
function toPart(lib, h, g, name, role, skinFn) {
  const n = g.n;
  const obj = { positions: Float32Array.from(g.P), uvs: Float32Array.from(g.UV), faces: g.F, groups: ['default'], groupIndex: new Map([['default', 0]]), groupVerts: () => new Set() };
  const part = new lib.Part({ name, role, obj, pos: Float32Array.from(g.P), refIdx: new Int32Array(n * 3), refW: new Float32Array(n * 3) });
  const bones = h.skeleton.bones;
  part.weights = new Array(n);
  part.seg = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let list = g.W[i] || skinFn([g.P[i * 3], g.P[i * 3 + 1], g.P[i * 3 + 2]], i);
    list = list.map(([b, w]) => [typeof b === 'string' ? h.skeleton.byName[b].index : b, w]).filter(([, w]) => w > 1e-4);
    if (!list.length) list = [[h.skeleton.byName.spine_03.index, 1]];
    const m = new Map();
    for (const [b, w] of list) m.set(b, (m.get(b) || 0) + w);
    list = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = list.reduce((a, [, w]) => a + w, 0) || 1;
    part.weights[i] = list.map(([b, w]) => [b, w / sum]);
    const segAcc = new Float32Array(10);
    for (const [b, w] of part.weights[i]) segAcc[boneSegment(bones[b].name)] += w;
    let best = 0;
    for (let s = 1; s < 10; s++) if (segAcc[s] > segAcc[best]) best = s;
    part.seg[i] = best;
  }
  part.extras.noSimplify = true;
  return part;
}

/** Smooth normals across coincident vertices (closed tube / ring seams of a Geo part, where positions are duplicated
 *  per uv): every vertex takes the average normal of all vertices at the same position. */
function weldNormals(part) {
  const base = Object.getPrototypeOf(part).normals;
  part.normals = function (pos = this.pos) {
    const n = base.call(this, pos), acc = new Map(), key = (i) => Math.round(pos[i * 3] * 2e4) + ',' + Math.round(pos[i * 3 + 1] * 2e4) + ',' + Math.round(pos[i * 3 + 2] * 2e4);
    const nv = pos.length / 3;
    for (let i = 0; i < nv; i++) { const k = key(i); const a = acc.get(k) || [0, 0, 0]; a[0] += n[i * 3]; a[1] += n[i * 3 + 1]; a[2] += n[i * 3 + 2]; acc.set(k, a); }
    for (let i = 0; i < nv; i++) { const a = acc.get(key(i)), l = Math.hypot(a[0], a[1], a[2]) || 1; n[i * 3] = a[0] / l; n[i * 3 + 1] = a[1] / l; n[i * 3 + 2] = a[2] / l; }
    return n;
  };
  return part;
}

/** BVH over triangle soups [{pos, tris}] (tris = Part.tris() layout) with ray / closest-point helpers. */
function makeBVH(list) {
  let n = 0;
  for (const s of list) n += s.tris.length / 6;
  const arr = new Float32Array(n * 9);
  let o = 0;
  for (const { pos, tris } of list) for (let i = 0; i < tris.length; i += 2) { const v = tris[i] * 3; arr[o++] = pos[v]; arr[o++] = pos[v + 1]; arr[o++] = pos[v + 2]; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const bvh = new MeshBVH(g);
  const ray = new THREE.Ray();
  // MeshBVH re-orders the index buffer: map a hit's faceIndex back to the source triangle
  const index = g.index.array;
  const srcTri = (fi) => Math.floor(index[fi * 3] / 3);
  const faceN = (fi) => {
    const b = srcTri(fi) * 9;
    return norm(cross([arr[b + 3] - arr[b], arr[b + 4] - arr[b + 1], arr[b + 5] - arr[b + 2]], [arr[b + 6] - arr[b], arr[b + 7] - arr[b + 1], arr[b + 8] - arr[b + 2]]));
  };
  return {
    bvh,
    hits(o, d, far = 10) {
      ray.origin.set(o[0], o[1], o[2]); ray.direction.set(d[0], d[1], d[2]).normalize();
      return bvh.raycast(ray, THREE.DoubleSide, 0, far).map((x) => ({ d: x.distance, p: V(x.point), n: faceN(x.faceIndex) })).sort((a, b) => a.d - b.d);
    },
    first(o, d, far = 10) { const hs = this.hits(o, d, far); return hs[0] || null; },
    closest(p) {
      const r = bvh.closestPointToPoint(new THREE.Vector3(p[0], p[1], p[2]), {});
      return r ? { p: V(r.point), n: faceN(r.faceIndex), d: r.distance, fi: srcTri(r.faceIndex) } : null;
    },
  };
}
const surf = (part) => ({ pos: part.pos, tris: part.tris() });
const nsurf = (part) => ({ tris: part.tris(), pos: part.pos, nrm: part.normals() });

/** Nearest-base-vertex skin weights (inverse-distance blend of the k nearest body vertices), filtered to `allow`. */
function makeSkinner(h) {
  const verts = Int32Array.from(h.baseObj.groupVerts('body'));
  const P = h.pos, W = h.weights, bones = h.skeleton.bones;
  return (p, { k = 6, allow = null, exclude = null } = {}) => {
    const best = [], bd = [];
    for (const v of verts) {
      const dx = P[v * 3] - p[0], dy = P[v * 3 + 1] - p[1], dz = P[v * 3 + 2] - p[2];
      const d = dx * dx + dy * dy + dz * dz;
      if (best.length < k || d < bd[best.length - 1]) {
        let j = Math.min(best.length, k - 1);
        if (best.length < k) { best.push(v); bd.push(d); j = best.length - 1; }
        while (j > 0 && bd[j - 1] > d) { best[j] = best[j - 1]; bd[j] = bd[j - 1]; j--; }
        best[j] = v; bd[j] = d;
      }
    }
    const acc = new Map();
    best.forEach((v, i) => {
      const wi = 1 / (Math.sqrt(bd[i]) + 0.004);
      for (const [b, w] of W[v]) {
        const name = bones[b].name;
        if ((allow && !allow.includes(name)) || (exclude && exclude.includes(name))) continue;
        acc.set(b, (acc.get(b) || 0) + w * wi);
      }
    });
    const list = [...acc.entries()];
    return list.length ? list : [[h.skeleton.byName.spine_02.index, 1]];
  };
}

/**
 * Closest-skin weights: the bone weights of the base-mesh surface point nearest to p (barycentric blend of the
 * triangle's three base vertices), filtered to `allow`. Gear bound this way moves exactly with the skin under it.
 */
function makeClosestSkinner(h, fullBody, fallback) {
  const tris = fullBody.tris(), pos = h.pos;
  const B = makeBVH([{ pos, tris }]);
  const bones = h.skeleton.bones;
  return (p, { allow = null, exclude = null } = {}) => {
    const c = B.closest(p);
    const ia = tris[c.fi * 6], ib = tris[c.fi * 6 + 2], ic = tris[c.fi * 6 + 4];
    const A = [pos[ia * 3], pos[ia * 3 + 1], pos[ia * 3 + 2]], Bv = [pos[ib * 3], pos[ib * 3 + 1], pos[ib * 3 + 2]], C = [pos[ic * 3], pos[ic * 3 + 1], pos[ic * 3 + 2]];
    const v0 = sub(Bv, A), v1 = sub(C, A), v2 = sub(c.p, A);
    const d00 = dot(v0, v0), d01 = dot(v0, v1), d11 = dot(v1, v1), d20 = dot(v2, v0), d21 = dot(v2, v1);
    const den = d00 * d11 - d01 * d01 || 1e-12;
    let wb = clamp01((d11 * d20 - d01 * d21) / den), wc = clamp01((d00 * d21 - d01 * d20) / den);
    if (!Number.isFinite(wb) || !Number.isFinite(wc)) { wb = 1 / 3; wc = 1 / 3; }
    const wa = Math.max(0, 1 - wb - wc);
    const acc = new Map();
    for (const [v, k] of [[ia, wa], [ib, wb], [ic, wc]]) for (const [b, w] of h.weights[v]) {
      const name = bones[b].name;
      if ((allow && !allow.includes(name)) || (exclude && exclude.includes(name))) continue;
      acc.set(b, (acc.get(b) || 0) + w * k);
    }
    const list = [...acc.entries()].filter(([, w]) => w > 1e-3);
    return list.length ? list : fallback(p, { allow, exclude });
  };
}

/** UV islands of a part: island id per face (union-find over shared UV corners). */
function uvIslands(part) {
  const F = part.obj.faces;
  const par = new Int32Array(part.obj.uvs.length / 2).map((_, i) => i);
  const find = (a) => { while (par[a] !== a) a = par[a] = par[par[a]]; return a; };
  for (const f of F) for (let k = 1; k < f.t.length; k++) { const a = find(f.t[0]), b = find(f.t[k]); if (a !== b) par[a] = b; }
  return F.map((f) => find(f.t[0]));
}

/**
 * Sculpts the morphed base mesh with fn(p metres, isBody) -> p for EVERY base vertex (joint helper cubes included,
 * so the rebuilt skeleton follows the new shape), then rebuilds the skeleton. Must run before any part is fitted.
 */
async function sculpt(h, fn) {
  const n = h.pos.length / 3, o = h.origin;
  const isBody = new Uint8Array(n);
  for (const v of h.baseObj.groupVerts('body')) isBody[v] = 1;
  for (let i = 0; i < n; i++) {
    const p = fn([h.pos[i * 3], h.pos[i * 3 + 1], h.pos[i * 3 + 2]], !!isBody[i], i);
    for (let k = 0; k < 3; k++) { h.pos[i * 3 + k] = p[k]; h.dm[i * 3 + k] = p[k] * 10 + o[k]; }
  }
  h.skeleton = await buildSkeleton(h.baseObj, h.pos);
  let top = 0;
  for (const v of h.baseObj.groupVerts('body')) top = Math.max(top, h.pos[v * 3 + 1]);
  h.height = h.headTop = top;
}

/** Uniformly scales a finished character (all part positions, the base mesh, the skeleton) about the ground origin. */
function scaleCharacter(h, parts, S) {
  const arrays = new Set([h.pos, ...parts.map((p) => p.pos)]);
  for (const a of arrays) for (let i = 0; i < a.length; i++) a[i] *= S;
  for (const b of h.skeleton.bones) { b.head.multiplyScalar(S); b.tail.multiplyScalar(S); b.localPos.multiplyScalar(S); }
  h.height *= S; h.headTop = h.height;
}

/** Moves the whole character (mesh, every bone but Root) up by d metres: stands it on its boot soles. */
function liftCharacter(h, parts, d) {
  const arrays = new Set([h.pos, ...parts.map((p) => p.pos)]);
  for (const a of arrays) for (let i = 1; i < a.length; i += 3) a[i] += d;
  const sk = h.skeleton;
  for (const b of sk.bones) { if (b.name === 'Root') continue; b.head.y += d; b.tail.y += d; }
  for (const b of sk.bones) if (b.parent >= 0 && sk.bones[b.parent].name === 'Root') b.localPos = b.head.clone().sub(sk.bones[b.parent].head).applyQuaternion(sk.bones[b.parent].world.clone().invert());
  h.height += d; h.headTop = h.height;
}

/** Adds a leaf helper bone (same rest frame as its parent) at world position p. */
function addHelperBone(h, name, parentName, p) {
  const sk = h.skeleton, par = sk.byName[parentName];
  const head = new THREE.Vector3(p[0], p[1], p[2]);
  const b = { name, parent: par.index, head, tail: head.clone().add(new THREE.Vector3(0, 0.05, 0)), world: par.world.clone(), index: sk.bones.length };
  b.localPos = head.clone().sub(par.head).applyQuaternion(par.world.clone().invert());
  b.localQuat = new THREE.Quaternion();
  sk.bones.push(b); sk.byName[name] = b;
  return b;
}

/**
 * Region-weighted simplification of a MakeHuman-topology Part (the lib's export simplifies a part uniformly by
 * error, which spent the high-res base mesh's budget on the huge torso and left the small head faceted). Each
 * pass simplifies one region with every other vertex locked (meshoptimizer vertex_lock), so the regions keep
 * their own triangle budgets and still share one watertight mesh. Returns a new Part on the SAME vertex indexing
 * (pos, weights, seg, base binding unchanged; only the faces / per-corner UVs change), marked noSimplify.
 * regions: [{ name, test(vertex) -> bool, tris }] (vertices in no region form the last pass's lock set).
 */
async function simplifyRegions(lib, part, regions, { error = 0.05 } = {}) {
  await MeshoptSimplifier.ready;
  const r = part.toRender();
  const nv = r.position.length / 3;
  const attrs = new Float32Array(nv * 5);
  for (let i = 0; i < nv; i++) {
    attrs[i * 5] = r.normal[i * 3]; attrs[i * 5 + 1] = r.normal[i * 3 + 1]; attrs[i * 5 + 2] = r.normal[i * 3 + 2];
    attrs[i * 5 + 3] = r.uv[i * 2]; attrs[i * 5 + 4] = r.uv[i * 2 + 1];
  }
  const regionOf = new Int8Array(nv).fill(-1);
  for (let i = 0; i < nv; i++) regionOf[i] = regions.findIndex((g) => g.test(r.src[i]));
  let idx = Uint32Array.from(r.index);
  const triRegion = (ix) => { const c = new Int32Array(regions.length); for (let t = 0; t < ix.length; t += 3) { const g = regionOf[ix[t]] >= 0 ? regionOf[ix[t]] : regionOf[ix[t + 1]] >= 0 ? regionOf[ix[t + 1]] : regionOf[ix[t + 2]]; if (g >= 0) c[g]++; } return c; };
  const before = triRegion(idx);
  for (let g = 0; g < regions.length; g++) {
    const lock = new Uint8Array(nv);
    for (let i = 0; i < nv; i++) lock[i] = regionOf[i] === g ? 0 : 1;
    const cur = triRegion(idx);
    const others = idx.length / 3 - cur[g];
    const target = (others + regions[g].tris) * 3;
    if (idx.length <= target) continue;
    const aw = regions[g].attrW || [0.5, 0.5, 0.5, 1, 1];
    [idx] = MeshoptSimplifier.simplifyWithAttributes(idx, r.position, 3, attrs, 5, aw, lock, target, error, []);
    if (idx.length > target * 1.08) [idx] = MeshoptSimplifier.simplifyWithAttributes(idx, r.position, 3, attrs, 5, [0.2, 0.2, 0.2, 0.5, 0.5], lock, target, 1, []);
  }
  const after = triRegion(idx);
  console.log(`${TAG} ${part.name} simplified by region: ${regions.map((g, k) => `${g.name} ${before[k]} -> ${after[k]}`).join(', ')} (total ${idx.length / 3})`);
  // rebuild: faces on the original vertex indices, one uv per render vertex
  const uvs = new Float32Array(nv * 2);
  for (let i = 0; i < nv; i++) { uvs[i * 2] = r.uv[i * 2]; uvs[i * 2 + 1] = 1 - r.uv[i * 2 + 1]; }
  const faces = [];
  for (let t = 0; t < idx.length; t += 3) faces.push({ v: [r.src[idx[t]], r.src[idx[t + 1]], r.src[idx[t + 2]]], t: [idx[t], idx[t + 1], idx[t + 2]], g: 0 });
  const obj = { ...part.obj, uvs, faces };
  const out = new lib.Part({ name: part.name, role: part.role, obj, pos: part.pos, refIdx: part.refIdx, refW: part.refW });
  out.weights = part.weights; out.seg = part.seg;
  // normals of the FULL-resolution surface on the simplified mesh (a normal transfer: the shading stays as round as
  // the 27k-triangle base mesh; normals averaged from the big simplified triangles showed facets on the crown /
  // jaw). Positions only ever scale uniformly / translate after this, so the unit normals stay valid.
  const hiN = part.normals();
  out.normals = () => hiN;
  out.extras.noSimplify = true;
  return out;
}

// rest height of the finished character (top of the skull, m): ~2.2 m standing in the clips' hunch
const REST_HEIGHT = 2.38;

// =====================================================================================================
export async function build(lib) {
  const N = lib.makeNoise(6161);
  const TR = albedoTracer('brute');
  const opts = {
    macro: { gender: 1, age: 0.55, muscle: 1, weight: 1, height: 0.75, proportions: 0.2, race: { caucasian: 0.75, african: 0.15, asian: 0.1 } },
    modifiers: {
      // small, brutish head on a bull neck sunk into the shoulders
      'head-scale-horiz-decr-incr': -0.55, 'head-scale-vert-decr-incr': -0.5, 'head-scale-depth-decr-incr': -0.4, 'head-fat-decr-incr': 0.3,
      'neck-scale-horiz-decr-incr': 1, 'measure-neck-circ-decr-incr': 1, 'measure-neck-height-decr-incr': -1, 'neck-back-scale-depth-decr-incr': 1,
      'chin-prognathism-decr-incr': 0.5, 'chin-width-decr-incr': 0.8, 'chin-height-decr-incr': 0.3, 'chin-bones-decr-incr': 0.5,
      'forehead-trans-backward-forward': 0.6, 'eyebrows-trans-backward-forward': 0.8, 'eyebrows-angle-down-up': -0.6, 'forehead-temple-decr-incr': -0.4,
      'nose-scale-horiz-decr-incr': 0.5, 'nose-hump-decr-incr': 0.6, 'nose-point-width-decr-incr': 0.5, 'nose-flaring-decr-incr': 0.6, 'nose-greek-decr-incr': -0.4,
      'ear-scale-decr-incr': -0.3, 'ear-flap-decr-incr': -0.4, 'cheek-bones-decr-incr': 0.4,
      // a slab of a torso: huge yoke, barrel chest, a hard gut
      'measure-shoulder-dist-decr-incr': 1, 'upperarm-shoulder-muscle-decr-incr': 1, 'torso-muscle-dorsi-decr-incr': 1,
      'torso-muscle-pectoral-decr-incr': 1, 'torso-scale-horiz-decr-incr': 0.6, 'torso-scale-depth-decr-incr': 1, 'torso-vshape-decr-incr': 0.3,
      'stomach-pregnant-decr-incr': 0.8, 'measure-waist-circ-decr-incr': 1, 'stomach-navel-down-up': -0.4,
      'measure-hips-circ-decr-incr': 0.4, 'buttocks-volume-decr-incr': 0.3,
      // long, massive arms with gorilla forearms and big hands
      'upperarm-muscle-decr-incr': 1, 'measure-upperarm-circ-decr-incr': 1, 'upperarm-fat-decr-incr': 0.5,
      'lowerarm-muscle-decr-incr': 1, 'lowerarm-fat-decr-incr': 0.6, 'lowerarm-scale-horiz-decr-incr': 0.6, 'lowerarm-scale-depth-decr-incr': 0.6, 'measure-wrist-circ-decr-incr': 1,
      'measure-upperarm-length-decr-incr': 0.45, 'measure-lowerarm-length-decr-incr': 0.5,
      'hand-scale-decr-incr': 1, 'hand-fingers-diameter-decr-incr': 1, 'hand-fingers-length-decr-incr': -0.2,
      // tree-trunk legs, a little short for the torso
      'upperleg-muscle-decr-incr': 1, 'upperleg-fat-decr-incr': 0.8, 'measure-thigh-circ-decr-incr': 1,
      'lowerleg-muscle-decr-incr': 0.8, 'lowerleg-fat-decr-incr': 0.3, 'measure-calf-circ-decr-incr': 0.6, 'measure-knee-circ-decr-incr': 0.8, 'measure-ankle-circ-decr-incr': 1,
      'measure-upperleg-height-decr-incr': 0.15, 'measure-lowerleg-height-decr-incr': 0.1, 'foot-scale-decr-incr': 0.5,
    },
    // a snarl: upper lip pulled up off the teeth, nose wrinkled, brows crushed down; the jaw only a little open
    expression: {
      'mouth-open': 0.14, 'mouth-retraction': 0.35, 'mouth-upward-retraction': 0.55, 'mouth-depression': 0.25,
      'nose-left-elevation': 0.4, 'nose-right-elevation': 0.4, 'eyebrows-left-down': 0.7, 'eyebrows-right-down': 0.7,
    },
  };
  const h = await lib.Human.create(opts);
  {
    const S0 = h.skeleton.byName, P0 = (n) => V(S0[n].head);
    console.log(`${TAG} macro body: height ${h.height.toFixed(3)} pelvis ${S0.pelvis.head.y.toFixed(3)} neck ${P0('neck_01').map((x) => x.toFixed(3))} head ${P0('head').map((x) => x.toFixed(3))} shoulderL ${P0('upperarm_l').map((x) => x.toFixed(3))} handL ${P0('hand_l').map((x) => x.toFixed(3))}`);
  }
  // ---------------------------------------------------------------- SCULPT
  const tumourLumps = [];
  {
    const S0 = h.skeleton.byName, P0 = (n) => V(S0[n].head);
    const neck = P0('neck_01'), head0 = P0('head');
    const shL = P0('upperarm_l'), shR = P0('upperarm_r');
    const clY = (P0('clavicle_l')[1] + shL[1]) / 2;
    const Wl = P0('hand_l'), Wr = P0('hand_r');
    const ElL = P0('lowerarm_l'), ElR = P0('lowerarm_r');
    const axL = norm(sub(Wl, ElL)), axR = norm(sub(Wr, ElR));
    const yHip = P0('thigh_l')[1], yW = P0('spine_01')[1], y3 = P0('spine_03')[1];
    const chain0 = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01'].map(P0);
    const axisZ0 = (y) => {
      if (y <= chain0[0][1]) return chain0[0][2];
      for (let i = 0; i + 1 < chain0.length; i++) if (y <= chain0[i + 1][1]) return lerp(chain0[i][2], chain0[i + 1][2], (y - chain0[i][1]) / (chain0[i + 1][1] - chain0[i][1]));
      return chain0[chain0.length - 1][2];
    };
    // body BVH (pre-sculpt) for placing the tumour lumps on the skin
    const pre = h.basePart({ name: 'pre' });
    const preB = makeBVH([surf(pre)]);
    // ---- the tumour mass: swollen lumps over the RIGHT trapezius, shoulder blade, deltoid and the side of the neck
    // (character's right = -X). Lumps are displaced along the skin normal (smooth cosine bumps), big ones first.
    const onSkin = (o, d) => { const hh = preB.first(o, d, 2); return hh ? { p: hh.p, n: dot(hh.n, d) > 0 ? scl(hh.n, -1) : hh.n } : null; };
    const lumpDefs = [
      // [origin ray start, ray dir, radius, height]
      [[shR[0] + 0.05, clY + 0.6, axisZ0(clY) - 0.03], [0, -1, 0], 0.16, 0.1],         // top of the right trapezius
      [[shR[0] - 0.01, clY + 0.6, axisZ0(clY) - 0.08], [0, -1, 0], 0.11, 0.07],        // over the shoulder joint, back
      [[shR[0] + 0.08, y3 + 0.03, -1], [0, 0, 1], 0.17, 0.095],                         // right shoulder blade
      [[shR[0] + 0.14, y3 - 0.05, -1], [0, 0, 1], 0.11, 0.06],                          // lower, nearer the spine (4 cm above the bandolier)
      [[-1, shR[1] - 0.05, shR[2] - 0.02], [1, 0, 0], 0.1, 0.06],                       // outside of the deltoid
      [[-1, shR[1] - 0.14, shR[2] - 0.035], [1, 0, 0], 0.07, 0.04],                      // down the upper arm
      [[shR[0] + 0.12, clY + 0.6, axisZ0(clY) + 0.0], [0, -1, 0], 0.08, 0.05],         // between trap and neck
      [[-0.075, neck[1] + 0.02, -1], [0, 0, 1], 0.075, 0.04],                            // back of the neck, right
      [[shR[0] + 0.03, y3 + 0.09, 1], [0, 0, -1], 0.08, 0.035],                          // front, over the right collarbone
    ];
    for (const [o, d, r, hgt] of lumpDefs) {
      const s = onSkin(o, d);
      if (!s) { console.warn(`${TAG} lump ray missed`, o); continue; }
      tumourLumps.push({ p: s.p, n: s.n, r, h: hgt });
    }
    // small satellite nodules around the big lumps
    const rnd = lib.rng(91);
    for (let k = 0; k < 14; k++) {
      const L = tumourLumps[Math.floor(rnd() * Math.min(6, tumourLumps.length))];
      const t = norm(cross(L.n, [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]));
      const o = madd(madd(L.p, t, L.r * (0.7 + 0.5 * rnd())), L.n, 0.2);
      const s = onSkin(o, scl(L.n, -1));
      if (s) tumourLumps.push({ p: s.p, n: s.n, r: 0.025 + 0.025 * rnd(), h: 0.012 + 0.012 * rnd(), small: true });
    }
    console.log(`${TAG} ${tumourLumps.length} tumour lumps`);
    // knuckle growths? no: big, swollen hands instead (scaled about the wrist)
    const HS = 1.22;
    const handC = (s) => scl(['index_01', 'middle_01', 'ring_01', 'pinky_01'].map((f) => P0(`${f}_${s}`)).reduce((a, k) => add(a, k), [0, 0, 0]), 0.25);
    const hands = [[Wl, axL, norm(sub(handC('l'), Wl))], [Wr, axR, norm(sub(handC('r'), Wr))]];
    await sculpt(h, (p, isBody) => {
      let q = p;
      // hands ~1.2x about the wrist
      for (const [W, ax] of hands) {
        const d = sub(q, W), tt = dot(d, ax), r = len(sub(d, scl(ax, tt)));
        const k = ss(-0.06, 0.02, tt) * (1 - ss(0.09, 0.13, r)) * (1 - ss(0.25, 0.32, tt));
        if (k > 0) q = add(W, scl(d, 1 + (HS - 1) * k));
      }
      // Popeye forearms: thickest a third of the way down from the elbow
      for (const [El, W, ax, amt] of [[ElL, Wl, axL, 0.2], [ElR, Wr, axR, 0.2]]) {
        const L = dist(El, W), d = sub(q, El), tt = dot(d, ax) / L, radial = sub(d, scl(ax, tt * L)), r = len(radial);
        if (tt > -0.1 && tt < 1.05 && r < 0.11) q = add(q, scl(radial, Math.sin(Math.PI * clamp01((tt + 0.08) / 1.1)) ** 0.8 * (1 - 0.35 * ss(0.5, 1, tt)) * (1 - ss(0.07, 0.11, r)) * amt));
      }
      // trapezius yoke: a ramp from the ear line down to the shoulders, so the small head sits low between them
      {
        const xs = Math.abs(q[0]);
        const w = Math.sin(Math.PI * clamp01((xs - 0.035) / 0.17)) * (1 - ss(0.04, 0.09, Math.abs(q[2] - neck[2] + 0.025))) *
          ss(clY - 0.07, clY + 0.01, q[1]) * (1 - ss(neck[1] + 0.06, neck[1] + 0.14, q[1]));
        if (w > 0) q = [q[0] + Math.sign(q[0]) * 0.008 * w, q[1] + 0.045 * w, q[2] - 0.006 * w];
      }
      if (isBody && q[1] > yHip - 0.12 && q[1] < y3 + 0.02) {
        // hard, overhanging gut and love handles
        const zc = axisZ0(q[1]), rx = q[0], rz = q[2] - zc, rh = Math.hypot(rx, rz);
        if (rh > 0.06) {
          const c = rz / rh, sn = Math.abs(rx) / rh, out = [rx / rh, 0, rz / rh];
          const y = q[1] - yW;
          const wf = ss(-0.15, 0.75, c) * (1 - ss(0.13, 0.2, Math.abs(rx)) * 0.5);
          const prof = ss(y3 - yW - 0.01, 0.02, y) * (1 - ss(-0.05, -0.09, y));
          const sag = Math.exp(-(((y + 0.02) / 0.045) ** 2));
          let dq = scl(out, 0.1 * prof * wf);
          dq = add(dq, [0, -0.022 * sag * wf * ss(-0.09, -0.06, y), 0]);
          const wl = ss(0.55, 0.85, sn) * ss(-0.5, 0.2, c) * (1 - ss(0.5, 0.9, c));
          const lh = Math.exp(-(((y - 0.01) / 0.04) ** 2)) * (1 - ss(-0.045, -0.07, y));
          dq = add(dq, add(scl(out, 0.035 * lh * wl), [0, -0.014 * lh * wl, 0]));
          q = add(q, dq);
        }
      }
      // tumour lumps (skin only: the joints stay put)
      if (isBody) {
        let dq = [0, 0, 0];
        for (const L of tumourLumps) {
          const dd = dist(q, L.p);
          if (dd >= L.r) continue;
          const k = 0.5 + 0.5 * Math.cos(Math.PI * dd / L.r);
          // lumpy profile: a bulbous cap (k^0.6) rather than a gaussian
          dq = madd(dq, L.n, L.h * k ** 0.65);
        }
        // overlapping lumps do not stack linearly (soft max)
        const m = len(dq);
        if (m > 0) q = madd(q, norm(dq), m > 0.11 ? 0.11 + (m - 0.11) * 0.3 : m);
      }
      return q;
    });
  }
  const sk = h.skeleton.byName;
  const B = (n) => V(sk[n].head);
  const A = lib.anchors(h);
  const skinAt = makeSkinner(h);
  console.log(`${TAG} sculpted: height ${h.height.toFixed(3)} pelvis ${sk.pelvis.head.y.toFixed(3)}`);

  // ---------------------------------------------------------------- MakeHuman parts
  const body = h.basePart({ name: 'body', role: 'skin' });
  const suit = await h.fit('clothes/male_casualsuit04', { name: 'trousers', role: 'cloth', hide: false });
  const waistY = sk.spine_01.head.y + 0.02;
  let suitCrop = null;
  {
    // keep only the trousers of the casual suit (shirt islands dropped), crop the UV atlas to them
    const isl = uvIslands(suit), ib = new Map();
    suit.obj.faces.forEach((f, fi) => { let b = ib.get(isl[fi]); if (!b) ib.set(isl[fi], b = { y: 0, n: 0 }); for (const v of f.v) { b.y += suit.pos[v * 3 + 1]; b.n++; } });
    suit.obj.faces.forEach((f, fi) => { const b = ib.get(isl[fi]); if (b.y / b.n > waistY) suit.keep[fi] = 0; });
    for (const v of suit.deleteVerts) if (h.pos[v * 3 + 1] < waistY - 0.04) h.hidden.add(v);
    const uv = suit.obj.uvs, r = [9, 9, -9, -9];
    suit.obj.faces.forEach((f, fi) => { if (suit.keep[fi]) for (const t of f.t) { r[0] = Math.min(r[0], uv[t * 2]); r[1] = Math.min(r[1], uv[t * 2 + 1]); r[2] = Math.max(r[2], uv[t * 2]); r[3] = Math.max(r[3], uv[t * 2 + 1]); } });
    const m = 0.006;
    suitCrop = [Math.floor(Math.max(0, r[0] - m) * 2048) / 2048, Math.floor(Math.max(0, r[1] - m) * 2048) / 2048, Math.ceil(Math.min(1, r[2] + m) * 2048) / 2048, Math.ceil(Math.min(1, r[3] + m) * 2048) / 2048];
    const nu = new Float32Array(uv.length);
    for (let i = 0; i < uv.length; i += 2) { nu[i] = (uv[i] - suitCrop[0]) / (suitCrop[2] - suitCrop[0]); nu[i + 1] = (uv[i + 1] - suitCrop[1]) / (suitCrop[3] - suitCrop[1]); }
    suit.obj = { ...suit.obj, uvs: nu };
  }
  const boots = await h.fit('clothes/shoes03', { name: 'boots', role: 'cloth' });
  let bootSole = 9, bootTop = 0;
  for (let i = 1; i < boots.pos.length; i += 3) { bootSole = Math.min(bootSole, boots.pos[i]); bootTop = Math.max(bootTop, boots.pos[i]); }
  const eyes = await h.fit('eyes/low-poly', { name: 'eyes', role: 'eye', hide: false });
  const teeth = await h.fit('teeth/teeth_base', { name: 'teeth', role: 'teeth', hide: false });
  {
    // the molars (more than 2.6 cm behind the incisors) never show through the snarl: their triangles go to the head
    let zf = -9;
    for (let i = 2; i < teeth.pos.length; i += 3) zf = Math.max(zf, teeth.pos[i]);
    let n = 0;
    teeth.obj.faces.forEach((f, fi) => { if (teeth.keep[fi] && f.v.every((v) => teeth.pos[v * 3 + 2] < zf - 0.026)) { teeth.keep[fi] = 0; n++; } });
    console.log(`${TAG} teeth: ${n} molar faces dropped`);
  }
  console.log(`${TAG} boots sole ${bootSole.toFixed(3)} top ${bootTop.toFixed(3)}`);

  // body faces under the trousers / inside the boots go
  h.hideCovered(body);
  body.obj.faces.forEach((f, fi) => { if (f.v.every((v) => h.pos[v * 3 + 1] < bootTop - 0.015)) body.keep[fi] = 0; });

  // ---------------------------------------------------------------- BVHs / surface helpers (rest pose, human scale)
  const fullBody = h.basePart({ name: 'bvh' });
  const bodyB = makeBVH([surf(fullBody)]);
  // trunk = the body without forearms / hands (they hang beside the hips in the A pose and must not catch the rays
  // that place the apron, chains and plate)
  const trunkSurf = (() => {
    const fa = new Set(h.skeleton.bones.filter((b) => /^(lowerarm|hand|thumb|index|middle|ring|pinky)/.test(b.name)).map((b) => b.index));
    const aw = new Float32Array(h.pos.length / 3);
    h.weights.forEach((l, v) => { for (const [b, w] of l) if (fa.has(b)) aw[v] += w; });
    const t = fullBody.tris(), keepT = [];
    for (let i = 0; i < t.length; i += 6) if (aw[t[i]] < 0.5 && aw[t[i + 2]] < 0.5 && aw[t[i + 4]] < 0.5) keepT.push(...t.slice(i, i + 6));
    return { pos: h.pos, tris: Int32Array.from(keepT) };
  })();
  const trunkB = makeBVH([trunkSurf]);
  const skinClosest = makeClosestSkinner(h, fullBody, skinAt);
  // winding: a point far in front of the chest lies on the outer side of its closest face
  const wSign = (() => { const c = bodyB.closest([0, sk.spine_03.head.y, 3]); return dot(c.n, sub([0, sk.spine_03.head.y, 3], c.p)) > 0 ? 1 : -1; })();
  const insideBody = (p) => { const c = bodyB.closest(p); return dot(c.n, sub(p, c.p)) * wSign < 0 ? c.d : -c.d; };   // > 0 = depth inside
  const spineZ = (y) => {
    const ch = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01'].map((n) => B(n));
    if (y <= ch[0][1]) return ch[0][2];
    for (let i = 0; i + 1 < ch.length; i++) if (y <= ch[i + 1][1]) return lerp(ch[i][2], ch[i + 1][2], (y - ch[i][1]) / (ch[i + 1][1] - ch[i][1]));
    return ch[ch.length - 1][2];
  };
  /** outermost surface point at height y in horizontal direction theta (0 = front +Z, +90 = character's left +X) */
  const around = (bv, theta, y, xc = 0) => {
    const d = [Math.sin(theta * Math.PI / 180), 0, Math.cos(theta * Math.PI / 180)];
    const c = [xc, y, spineZ(y)];
    const hit = bv.first(madd(c, d, 1.2), scl(d, -1), 1.3);
    return hit ? { p: hit.p, n: dot(hit.n, d) < 0 ? scl(hit.n, -1) : hit.n } : { p: madd(c, d, 0.15), n: d };
  };
  const yNeck = sk.neck_01.head.y, y3 = sk.spine_03.head.y, yW = sk.spine_01.head.y;
  const clY = (sk.clavicle_l.head.y + sk.upperarm_l.head.y) / 2;

  // ================================================================ TUMOUR GROWTHS (gore)
  // Bulbous, lumpy growths bursting out of the swollen right shoulder / trapezius / shoulder blade (on top of the
  // sculpted swelling). Each bulb: a noise-displaced icosphere, faces buried in the body dropped; UVs = azimuthal
  // equidistant disk per bulb (no overlaps, no wrap seam) in a 4 x 2 atlas.
  const grow = new Geo();
  const bulbs = [], bulbOf = [];
  {
    const big = tumourLumps.filter((L) => !L.small);
    // [lump, radius (m), ico detail, sink (fraction of the radius buried under the skin)]
    const specs = [[0, 0.12, 2, 0.4], [2, 0.11, 2, 0.45], [1, 0.07, 1, 0.35], [4, 0.065, 1, 0.4], [6, 0.06, 1, 0.38], [3, 0.065, 1, 0.42], [7, 0.05, 1, 0.38], [8, 0.045, 1, 0.4]];
    let cell = 0;
    for (const [li, rb, detail, sink] of specs) {
      const L = big[li];
      if (!L) continue;
      const hit = bodyB.first(madd(L.p, L.n, 0.4), scl(L.n, -1), 0.6);
      if (!hit) continue;
      const n = L.n;
      const c = madd(hit.p, n, -rb * sink);
      const t1 = norm(cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), t2 = cross(n, t1);
      const ico = new THREE.IcosahedronGeometry(1, detail);
      const pa = ico.attributes.position.array;
      const key = (i) => `${Math.round(pa[i * 3] * 1e4)},${Math.round(pa[i * 3 + 1] * 1e4)},${Math.round(pa[i * 3 + 2] * 1e4)}`;
      const vmap = new Map(), dirs = [], ui = [];
      for (let i = 0; i < pa.length / 3; i++) { const k = key(i); if (!vmap.has(k)) { vmap.set(k, dirs.length); dirs.push([pa[i * 3], pa[i * 3 + 1], pa[i * 3 + 2]]); } ui.push(vmap.get(k)); }
      const seed = cell * 7.31;
      const pts = dirs.map((d0) => {
        // local -> world (z = n), squashed along n, lumpy
        const d = norm(add(add(scl(t1, d0[0]), scl(t2, d0[1])), scl(n, d0[2])));
        // cauliflower lobes: a few big lobes (abs noise ridges between them) + small knobs
        const lump = 1 + 0.22 * N.noise(d[0] * 2.4 + seed, d[1] * 2.4, d[2] * 2.4) - 0.12 * Math.abs(N.noise(d[0] * 3.5 + seed, d[1] * 3.5 + 2, d[2] * 3.5)) + 0.07 * N.noise(d[0] * 7 + seed, d[1] * 7, d[2] * 7);
        const sq = 0.8 + 0.2 * Math.abs(dot(d, n));
        return madd(c, d, rb * lump * sq);
      });
      const inside = pts.map((p) => insideBody(p) > 0.006);
      const cu = (cell % 4) * 0.25, cv = Math.floor(cell / 4) * 0.5;
      const vi = new Int32Array(pts.length).fill(-1);
      const id = (i) => {
        if (vi[i] < 0) {
          const d = norm(sub(pts[i], c)), z = dot(d, n), th = Math.acos(Math.max(-1, Math.min(1, z))), ph = Math.atan2(dot(d, t2), dot(d, t1));
          const rho = th / Math.PI * 0.95;
          vi[i] = grow.v(pts[i], [cu + 0.125 + 0.12 * rho * Math.cos(ph), cv + 0.25 + 0.24 * rho * Math.sin(ph)]);
          bulbOf.push(bulbs.length);
        }
        return vi[i];
      };
      let kept = 0;
      for (let t = 0; t < ui.length; t += 3) {
        const f3 = [ui[t], ui[t + 1], ui[t + 2]];
        if (f3.every((i) => inside[i])) continue;
        const ids = f3.map(id);
        grow.tri(ids[0], ids[1], ids[2]); kept++;
      }
      bulbs.push({ c, n, r: rb, kept, base: hit.p });
      cell++;
    }
    console.log(`${TAG} tumour growths: ${bulbs.map((b) => `r${(b.r * 100).toFixed(1)}cm/${b.kept}t`).join(' ')}`);
  }
  // each bulb moves (nearly) rigidly with the skin under its base: per-vertex weights stretched the bulbs that
  // straddle the neck / trapezius into flat blades when the head turned
  const tumourBones = ['spine_02', 'spine_03', 'clavicle_r', 'upperarm_r'];
  const bulbW = bulbs.map((b) => { const w = skinClosest(b.base, { allow: tumourBones }); const sm = w.reduce((a, [, x]) => a + x, 0) || 1; return w.map(([k, x]) => [k, x / sm]); });
  const growPart = toPart(lib, h, grow, 'tumours', 'gore', (p, i) => {
    const own = skinClosest(p, { allow: tumourBones }), os = own.reduce((a, [, x]) => a + x, 0) || 1;
    return [...bulbW[bulbOf[i]].map(([k, x]) => [k, x * 0.75]), ...own.map(([k, x]) => [k, x * 0.25 / os])];
  });

  // ================================================================ SCRAP-STEEL PAULDRON (gear) on the left shoulder
  // A dented panel cut from an oil drum, bent over the deltoid and trapezius: a dome fitted over the shoulder by
  // rays from inside the joint, smoothed hard (rigid steel does not follow the muscles), with a folded rim.
  const plate = new Geo();
  const plateInfo = {};
  {
    const SJ = B('upperarm_l');
    const C = add(SJ, [-0.035, -0.02, -0.005]);
    const up = norm([0.6, 1, 0.0]);
    const e1 = [0, 0, 1];
    const e2 = norm(cross(up, e1));          // across the shoulder: + out and down the outside of the arm
    const NU = 8, NV = 8;
    const occ = makeBVH([trunkSurf, surf(growPart)]);
    const R = [];
    for (let j = 0; j < NV; j++) {
      const row = [];
      for (let i = 0; i < NU; i++) {
        const s = lerp(-1.2, 1.2, i / (NU - 1)), t = lerp(-0.7, 1.5, j / (NV - 1));
        const d = norm(add(add(up, scl(e1, s)), scl(e2, t)));
        // from inside the shoulder outwards: the first surface is the deltoid / trapezius skin (never the head)
        const hit = occ.first(C, d, 0.5);
        row.push({ d, r: hit ? hit.d : 0.12 });
      }
      R.push(row);
    }
    // smooth (rigid steel) but always >= the skin + clearance
    const raw = R.map((row) => row.map((q) => q.r + 0.02));
    let cur = raw.map((row) => row.slice());
    for (let it = 0; it < 40; it++) {
      const nx = cur.map((row) => row.slice());
      for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
        let a = 0, k = 0;
        for (const [dj, di] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const q = cur[j + dj]?.[i + di]; if (q !== undefined) { a += q; k++; } }
        nx[j][i] = Math.max(raw[j][i], lerp(cur[j][i], a / k, 0.6));
      }
      cur = nx;
    }
    const grid = [];
    for (let j = 0; j < NV; j++) {
      const row = [];
      for (let i = 0; i < NU; i++) {
        const { d } = R[j][i];
        const dent = 0.006 * Math.max(0, N.noise(d[0] * 9 + 3, d[1] * 9, d[2] * 9));
        row.push(madd(C, d, cur[j][i] - dent));
      }
      grid.push(row);
    }
    // ragged outline: border vertices pulled in a little at random
    const cen = grid[(NV / 2) | 0][(NU / 2) | 0];
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
      if (j && i && j < NV - 1 && i < NU - 1) continue;
      grid[j][i] = lerp3(grid[j][i], cen, 0.04 + 0.08 * hash(i * 31 + j * 7 + 5));
    }
    const ids = grid.map((row, j) => row.map((p, i) => plate.v(p, [0.02 + 0.6 * i / (NU - 1), 0.02 + 0.6 * j / (NV - 1)])));
    for (let j = 0; j + 1 < NV; j++) for (let i = 0; i + 1 < NU; i++) plate.quad(ids[j][i], ids[j][i + 1], ids[j + 1][i + 1], ids[j + 1][i]);
    // folded rim: the border loop again 9 mm further in (towards C), joined to the outer border (the steel's
    // visible thickness / rolled edge)
    const loop = [];
    for (let i = 0; i < NU; i++) loop.push([0, i]);
    for (let j = 1; j < NV; j++) loop.push([j, NU - 1]);
    for (let i = NU - 2; i >= 0; i--) loop.push([NV - 1, i]);
    for (let j = NV - 2; j > 0; j--) loop.push([j, 0]);
    const inner = loop.map(([j, i], k) => { const p = grid[j][i]; return plate.v(madd(p, norm(sub(C, p)), 0.009), [0.66 + 0.3 * k / loop.length, 0.9]); });
    const outerIds = loop.map(([j, i], k) => plate.v(grid[j][i], [0.66 + 0.3 * k / loop.length, 0.97]));
    for (let k = 0; k < loop.length; k++) { const k2 = (k + 1) % loop.length; plate.quad(outerIds[k], outerIds[k2], inner[k2], inner[k]); }
    Object.assign(plateInfo, { C, up, e1, e2, grid, NU, NV });
  }
  // rigid-ish: each vertex takes the shoulder's skin weights at the plate centre blended 50/50 with its own
  // strapped to the upper arm like a real pauldron: one rigid 60/40 upper-arm / collarbone blend for the whole
  // plate (with the skin's own weights it sank into the deltoid whenever the arm went up)
  const platePart = toPart(lib, h, plate, 'pauldron', 'gear', () => [['upperarm_l', 0.6], ['clavicle_l', 0.4]]);

  // ================================================================ APRON (cloth): heavy blue PVC butcher's apron
  const outerB = makeBVH([trunkSurf, surf(suit), surf(growPart)]);
  const yTop = lerp(y3, yNeck, 0.45);
  const yWaist = yW + 0.03;
  const yCrotch = sk.thigh_l.head.y - 0.08;
  // hem just above the knees: the skirt rides on the thighs (a shin-length sheet stuck out like a board in the
  // clips' deep attack squats, or the thighs went through it)
  const yBot = sk.calf_l.head.y + 0.035;
  const apron = new Geo();
  const apronInfo = { yTop, yWaist, yCrotch, yBot };
  {
    const halfBody = (y) => { const l = around(outerB, 90, y).p[0], r = around(outerB, -90, y).p[0]; return (l - r) / 2; };
    const hwWaist = halfBody(yWaist) * 1.0, hwHip = Math.max(hwWaist, halfBody(yCrotch + 0.05) * 0.95);
    const hw = (y) => {
      if (y > yTop - 0.12) return lerp(0.2, 0.215, ss(yTop, yTop - 0.12, y));
      if (y > yWaist) return lerp(0.215, hwWaist, ss(yTop - 0.12, yWaist, y));
      return lerp(hwWaist, hwHip + 0.035, ss(yWaist, yBot, y));
    };
    const NU = 11, NV = 16;
    const grid = [], lows = [];
    const zPrev = new Array(NU).fill(null);
    for (let r = 0; r < NV; r++) {
      const row = [], lowRow = [];
      for (let c = 0; c < NU; c++) {
        const u = c / (NU - 1) * 2 - 1;
        const y = lerp(yTop, yBot, r / (NV - 1)) + (r ? 0 : 0.014 * Math.abs(u) ** 3 - 0.008 * (1 - u * u));
        const x = u * hw(y);
        const hit = outerB.first([x, y, 1.5], [0, 0, -1], 2);
        let z = hit ? hit.p[2] : (zPrev[c] ?? 0.1);
        // clearance over the OUTER surface (trousers below the waist): 1.6 cm on the bib, 2.6 cm (3 cm at full
        // size) over the thighs, where the simplified trousers and the leg swing need room
        lowRow.push(z + lerp(0.016, 0.026, ss(yWaist, yCrotch - 0.02, y)));
        z += 0.02 + 0.004 * (1 - Math.abs(u));
        // stiff PVC drapes off the gut, then the waist ties pull it back in onto the thighs (a plumb skirt hung
        // 15-20 cm in front of the legs and stood up off the corpse like a flag in the death / knockdown poses)
        if (zPrev[c] !== null) z = Math.max(z, zPrev[c] - (y < yCrotch ? 0.15 : y < yWaist ? 0.85 : 0.26) * (lerp(yTop, yBot, (r - 1) / (NV - 1)) - y));
        zPrev[c] = z;
        const wrap = ss(0.7, 1, Math.abs(u)) * ss(yTop - 0.05, yWaist, y) * 0.03;
        const fold = 0.006 * Math.sin(c * 2.3 + N.noise(c * 0.7, 0.3, 0.1) * 2) * ss(yWaist, yCrotch - 0.05, y) +
          0.014 * Math.sin(u * Math.PI * 2.4 + 0.8 + N.noise(u * 2, y * 3, 0.6) * 0.8) * ss(yWaist - 0.05, yBot, y);
        row.push([x, y, z - wrap + fold]);
      }
      grid.push(row); lows.push(lowRow);
    }
    // bib bridges flat between the pecs (upper concave envelope of each row)
    for (let r = 0; r < NV; r++) {
      if (grid[r][0][1] < yWaist + 0.04) continue;
      for (let it = 0; it < 30; it++) for (let c = 1; c + 1 < NU; c++) grid[r][c][2] = Math.max(grid[r][c][2], (grid[r][c - 1][2] + grid[r][c + 1][2]) / 2);
    }
    for (let it = 0; it < 3; it++) for (let r = 1; r < NV; r++) {
      const y = grid[r][0][1];
      if (y > yCrotch + 0.08) continue;
      const k = ss(yCrotch + 0.08, yCrotch - 0.05, y);
      const zs = grid[r].map((p) => p[2]);
      for (let c = 1; c + 1 < NU; c++) grid[r][c][2] = Math.max(zs[c], lerp(zs[c], (zs[c - 1] + zs[c + 1]) / 2, k));
    }
    for (let it = 0; it < 6; it++) {
      const zs = grid.map((row) => row.map((p) => p[2]));
      for (let r = 1; r + 1 < NV; r++) for (let c = 0; c < NU; c++) {
        const nb = [zs[r - 1][c], zs[r + 1][c], zs[r][Math.max(0, c - 1)], zs[r][Math.min(NU - 1, c + 1)]];
        grid[r][c][2] = Math.max(lows[r][c], lerp(zs[r][c], (nb[0] + nb[1] + nb[2] + nb[3]) / 4, 0.5));
      }
    }
    for (const c of [0, 1, NU - 2, NU - 1]) { const k = c === 0 || c === NU - 1 ? 1 : 0.4; grid[0][c][2] += 0.012 * k; grid[1][c][2] += 0.005 * k; }
    // never closer than 1.6 cm to the (later simplified) skin / trousers anywhere, the edge rows included
    for (let r = 0; r < NV; r++) for (let c = 0; c < NU; c++) grid[r][c][2] = Math.max(grid[r][c][2], lows[r][c]);
    const idx = grid.map((row, r) => row.map((p, c) => apron.v(p, [c / (NU - 1), r / (NV - 1) * 0.8])));
    for (let r = 0; r + 1 < NV; r++) for (let c = 0; c + 1 < NU; c++) apron.quad(idx[r][c], idx[r + 1][c], idx[r + 1][c + 1], idx[r][c + 1]);
    apronInfo.grid = grid; apronInfo.NU = NU; apronInfo.NV = NV;
    // neck strap: from the bib corners up over the pecs and the trapezius, round the back of the (short) neck
    // (the strap runs on the skin UNDER the tumour bulbs: the growths burst out around it; laid over them it hung in
    // the air whenever the bulbs moved with the shoulder)
    const strapB = makeBVH([trunkSurf, surf(platePart)]);
    const neckAxisZ = spineZ(yNeck);
    const neckPt = (thDeg, y) => {
      const th = thDeg * Math.PI / 180, d = [Math.sin(th), 0, Math.cos(th)];
      const c = [0, y, neckAxisZ];
      const hs = strapB.hits(madd(c, d, 0.6), scl(d, -1), 0.6);
      return { p: madd(c, d, (hs.length ? 0.6 - hs[0].d : 0.09) + 0.006), n: d };
    };
    const tl = grid[0][NU - 1], tr = grid[0][0];
    const yRing = yNeck + 0.015;
    const onSurf = (q, clear = 0.007) => {
      const c = [0, q[1], spineZ(q[1])], d = norm([q[0] - c[0], 0, q[2] - c[2]]);
      const hs = strapB.hits(madd(c, d, 0.7), scl(d, -1), 0.7);
      return { p: madd(c, d, (hs.length ? 0.7 - hs[0].d : len(sub(q, c))) + clear), n: d };
    };
    const ring = [55, 80, 110, 145, 180, -145, -110, -80, -55].map((a) => neckPt(a, yRing - 0.012 * Math.cos(a * Math.PI / 180)));
    const run = (corner, a0) => [0.3, 0.62, 0.85].map((f) => onSurf(lerp3(corner, a0.p, f)));
    const sPts = [{ p: add(tl, [0, 0.004, 0.004]), n: [0, 0, 1] }, ...run(tl, ring[0]), ...ring, ...run(tr, ring[ring.length - 1]).reverse(), { p: add(tr, [0, 0.004, 0.004]), n: [0, 0, 1] }];
    const ribbon = (P, Nn, width, v0, v1) => {
      const start = apron.n;
      P.forEach((p, i) => {
        const t = norm(sub(P[Math.min(P.length - 1, i + 1)], P[Math.max(0, i - 1)]));
        const sd = norm(cross(t, Nn[i]));
        const u = i / (P.length - 1);
        apron.v(madd(p, sd, width / 2), [u, v0]);
        apron.v(madd(p, sd, -width / 2), [u, v1]);
      });
      for (let i = 0; i + 1 < P.length; i++) { const a = start + i * 2; apron.quad(a, a + 2, a + 3, a + 1); }
    };
    ribbon(catmull(sPts.map((q) => q.p), 2), catmull(sPts.map((q) => q.n), 2).map(norm), 0.03, 0.83, 0.87);
    const wy = yWaist - 0.01;
    const rowW = grid.find((row) => row[0][1] <= wy);
    const tie = [rowW[NU - 1], around(outerB, 115, wy), around(outerB, 150, wy), around(outerB, 180, wy), around(outerB, -150, wy), around(outerB, -115, wy), rowW[0]]
      .map((q, i, a) => (i === 0 || i === a.length - 1 ? { p: q, n: [0, 0, 1] } : { p: madd(q.p, q.n, 0.007), n: q.n }));
    ribbon(catmull(tie.map((q) => q.p), 3), catmull(tie.map((q) => q.n), 3).map(norm), 0.026, 0.89, 0.93);
    // knotted tie ends hanging at the small of the back
    const kb = around(outerB, 178, wy);
    for (const [dx, u0] of [[0.025, 0], [-0.02, 0.5]]) {
      const pts = [];
      for (let i = 0; i <= 4; i++) pts.push(add(madd(kb.p, kb.n, 0.012 + i * 0.003), [dx * i / 4, -0.16 * i / 4, 0]));
      const start = apron.n;
      pts.forEach((p, i) => { const u = u0 + 0.48 * i / (pts.length - 1); apron.v(add(p, [0.012, 0, 0]), [u, 0.95]); apron.v(add(p, [-0.012, 0, 0]), [u, 0.99]); });
      for (let i = 0; i + 1 < pts.length; i++) { const a = start + i * 2; apron.quad(a, a + 1, a + 3, a + 2); }
    }
  }
  const torsoBones = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01'];
  const apronAllow = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r', 'thigh_l', 'thigh_r'];
  const unit = (l) => { const sm = l.reduce((a, [, x]) => a + x, 0) || 1; return l.map(([b, x]) => [b, x / sm]); };
  const apronPart = toPart(lib, h, apron, 'apron', 'cloth', (p, i) => {
    // neck strap: rides on the trapezius / collarbones
    if (apron.UV[i * 2 + 1] > 0.82 && p[1] > yWaist + 0.02) return skinClosest(p, { allow: ['spine_03', 'neck_01', 'clavicle_l', 'clavicle_r'] });
    // waist ties round the back: the skin under them
    if (p[2] < spineZ(p[1])) return skinClosest(p, { allow: apronAllow });
    // Down to the crotch the sheet takes the exact bone mix of the skin under it (pecs: clavicles / upper arms, gut:
    // spine / pelvis, lower belly: thighs) and stays its 1.2-1.6 cm in front of it in every clip and with the spine
    // pose offsets (a spine-only bib over a pelvis-only skirt sheared apart at the waist and the gut came through).
    // Below the crotch each half is RIGID with its own thigh, only a 12 cm centre band blends the two legs. Linear
    // blend skinning can only keep a sheet outside a limb if the sheet's weights are at least as rigid as the
    // surface under it: the trousers (blended pelvis / thigh) then always fold inside the arc the apron sweeps. The
    // old 71 % thigh / 25 % pelvis mix lagged ~30 % behind every hip flexion, and the clips' hunched walks flex
    // BOTH hips (pelvis tipped forward), so both trouser thighs came through the outer two thirds of the skirt.
    // An 11 cm band at the crotch blends the skin mix into the rigid halves.
    const skin = unit(skinClosest(p, { allow: apronAllow }));
    const side = ss(-0.06, 0.06, p[0]);
    const skirt = [['thigh_l', side], ['thigh_r', 1 - side]];
    const b = ss(yCrotch - 0.03, yCrotch + 0.08, p[1]);
    return [...skin.map(([bn, x]) => [bn, x * b]), ...skirt.map(([bn, x]) => [bn, x * (1 - b)])];
  });

  // the chest / gut skin right under the bib goes: the stiff bib follows the spine, and when the clips fold the torso
  // or swing the arms forward the pecs and the gut pushed through it. Only skin that the bib covers from the front
  // with a 4 cm margin to its edges and top (never visible) - this also frees triangles for the head.
  {
    const apB = makeBVH([surf(apronPart)]);
    const G = apronInfo.grid, NUa = apronInfo.NU;
    const rows = G.map((row) => ({ y: row[0][1], x0: row[0][0], x1: row[NUa - 1][0] }));
    const extentAt = (y) => {
      for (let r = 0; r + 1 < rows.length; r++) if (y <= rows[r].y && y >= rows[r + 1].y) { const t = (rows[r].y - y) / (rows[r].y - rows[r + 1].y); return [lerp(rows[r].x0, rows[r + 1].x0, t), lerp(rows[r].x1, rows[r + 1].x1, t)]; }
      return null;
    };
    const covered = new Uint8Array(h.pos.length / 3);
    for (const v of h.baseObj.groupVerts('body')) {
      const p = [h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]];
      if (p[1] > yTop - 0.045 || p[1] < yCrotch + 0.03) continue;
      const e = extentAt(p[1]);
      if (!e || p[0] < e[0] + 0.045 || p[0] > e[1] - 0.045) continue;
      if (apB.first(p, [0, 0, 1], 0.2)) covered[v] = 1;
    }
    let n = 0;
    body.obj.faces.forEach((f, fi) => { if (body.keep[fi] && f.v.every((v) => covered[v])) { body.keep[fi] = 0; n++; } });
    console.log(`${TAG} skin faces hidden under the bib: ${n}`);
  }

  // ================================================================ CHAINS (gear): bandolier + wrist shackle
  const chains = new Geo();
  const chainInfo = { links: 0, paths: [] };
  // inner length / width, wire radius (human scale; x1.14 at full size: 10.7 / 4.8 / 1.35 cm, a heavy hoist chain:
  // fewer, bigger links read better at 5-15 m and paid for the boots / head triangles)
  const LI = 0.094, WI = 0.042, RW = 0.0118;
  {
    const outer2 = makeBVH([trunkSurf, surf(suit), surf(apronPart), surf(platePart), surf(growPart)]);
    const project = (p) => {
      const c = outer2.closest(p);
      const ctr = [0, c.p[1], spineZ(c.p[1])];
      let n = c.n;
      if (dot(n, sub(c.p, ctr)) < 0) n = scl(n, -1);
      return { p: c.p, n };
    };
    let slot = 0;
    const slotUV = () => { const k = slot++ % 40; const cx = k % 8, cy = Math.floor(k / 8); return [cx / 8, cy / 8 * 0.8, (cx + 1) / 8, (cy + 1) / 8 * 0.8 - 0.004]; };
    const link = (c, T, side, nrm, broken = false, sz = { li: LI, wi: WI, rw: RW }) => {
      const hl = sz.li / 2 + sz.rw * 0.5, hw = sz.wi / 2 + sz.rw * 0.5;
      let cl = [[hl, 0], [hl * 0.62, hw], [-hl * 0.62, hw], [-hl, 0], [-hl * 0.62, -hw], [hl * 0.62, -hw], [hl, 0]];
      if (broken) cl = cl.slice(0, 5);   // one side of the last link snapped open
      const pts = cl.map(([a, b]) => add(add(c, scl(T, a)), scl(side, b)));
      tube(chains, pts, sz.rw, 3, slotUV(), null, { ref: nrm });
      chainInfo.links++;
    };
    const lay = (P, skin, { closed = false } = {}) => {
      const n = P.length;
      for (let i = 0; i < n; i++) {
        const T = norm(sub(P[closed ? (i + 1) % n : Math.min(n - 1, i + 1)], P[closed ? (i - 1 + n) % n : Math.max(0, i - 1)]));
        const pr = project(P[i]);
        const nn = norm(sub(pr.n, scl(T, dot(pr.n, T))));
        const side = norm(cross(T, nn));
        const standing = i % 2 === 1;
        const c = madd(pr.p, nn, (standing ? WI / 2 + RW : RW) + 0.004);
        const g0 = chains.n;
        link(c, T, standing ? nn : side, nn);
        const w = skin(c);
        for (let v = g0; v < chains.n; v++) chains.W[v] = w;
      }
    };
    // bandolier: a closed loop over the pauldron on the left shoulder, across the chest and the apron bib to the
    // right hip, and back up across the back
    const topL = outer2.first([sk.upperarm_l.head.x * 0.72, 3, spineZ(clY) - 0.01], [0, -1, 0], 4).p;
    const ctrl = [
      add(topL, [0, 0.01, 0]),
      madd(around(outer2, 40, lerp(clY, yTop, 0.5)).p, [0, 0, 1], 0.01),
      madd(around(outer2, 14, yTop - 0.05).p, [0, 0, 1], 0.012),
      madd(around(outer2, -22, lerp(yTop, yWaist, 0.6)).p, [0, 0, 1], 0.012),
      madd(around(outer2, -55, yWaist - 0.02).p, [0, 0, 1], 0.01),
      around(outer2, -95, yWaist - 0.07).p,
      around(outer2, -135, yWaist - 0.03).p,
      around(outer2, -172, lerp(yWaist, y3, 0.4)).p,
      around(outer2, 152, y3 - 0.02).p,
      around(outer2, 125, lerp(y3, clY, 0.6)).p,
    ];
    const P = resample(catmull(ctrl, 8, true), LI);
    if (dist(P[P.length - 1], P[0]) < LI * 0.6) P.pop();
    // torso bones only: links over the shoulder that took upper-arm weights flew apart when the arm went up
    const torsoSkin = (c) => skinClosest(c, { allow: ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'clavicle_l', 'clavicle_r'] });
    lay(P, torsoSkin, { closed: true });
    chainInfo.paths.push(P);
    {
      let worst = 9, wb = -1;
      bulbs.forEach((b, bi) => { for (const q of P) { const d = dist(q, b.c) - b.r - (WI / 2 + RW); if (d < worst) { worst = d; wb = bi; } } });
      console.log(`${TAG} bandolier clearance to the tumour bulbs: ${(worst * 100).toFixed(1)} cm (bulb ${wb})`);
    }
    // iron shackle on the left wrist: a forged band (1.3 cm thick, bulged rounded edges) that follows the wrist's
    // own oval cross-section ~8 mm off the skin (the old 8-sided circle sized by the widest vertex stood several
    // cm off the wrist like a loose bracelet), and two links of the broken chain lying along the back of the hand,
    // weighted from the forearm onto the hand so they move with it as if resting on it (three links hanging off
    // the cuff, rigid with the forearm, stuck out sideways / backwards like a rod in the run and the attacks)
    const W = B('hand_l'), E = B('lowerarm_l'), ax = norm(sub(W, E));
    const ref = norm(cross(ax, [0, 0, 1])), ref2 = cross(ax, ref);
    const NC = 12, T0 = -0.072, T1 = -0.026, TH = 0.013;
    const rAt = new Float32Array(NC).fill(0.03);
    for (const v of h.baseObj.groupVerts('body')) {
      const p = [h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]], d = sub(p, W), t = dot(d, ax);
      if (t < T0 - 0.004 || t > T1 + 0.002) continue;
      const rv = sub(d, scl(ax, t)), r = len(rv);
      if (r > 0.11) continue;
      const fa = ((Math.atan2(dot(rv, ref2), dot(rv, ref)) / (Math.PI * 2)) * NC + NC) % NC, k0 = Math.floor(fa) % NC;
      rAt[k0] = Math.max(rAt[k0], r); rAt[(k0 + 1) % NC] = Math.max(rAt[(k0 + 1) % NC], r);
    }
    const rr = Array.from(rAt, (r, k) => Math.max(r, (rAt[(k + NC - 1) % NC] + 2 * r + rAt[(k + 1) % NC]) / 4) + 0.008);
    const prof = [[T0, 0], [T1, 0], [T1 + 0.0035, TH * 0.5], [T1, TH], [T0, TH], [T0 - 0.0035, TH * 0.5]];
    const cuffStart = chains.n, cuffIds = [];
    for (let k = 0; k <= NC; k++) {
      const a = (k / NC) * Math.PI * 2, d = add(scl(ref, Math.cos(a)), scl(ref2, Math.sin(a))), r = rr[k % NC];
      cuffIds.push(prof.map(([t, dr], q) => chains.v(madd(madd(W, ax, t), d, r + dr), [0.02 + 0.46 * k / NC, 0.82 + 0.15 * q / prof.length])));
    }
    // closing column of the profile loop (its own uv row)
    const cuffClose = [];
    for (let k = 0; k <= NC; k++) { const a = (k / NC) * Math.PI * 2, d = add(scl(ref, Math.cos(a)), scl(ref2, Math.sin(a))); cuffClose.push(chains.v(madd(madd(W, ax, prof[0][0]), d, rr[k % NC] + prof[0][1]), [0.02 + 0.46 * k / NC, 0.97])); }
    for (let k = 0; k < NC; k++) for (let q = 0; q < prof.length; q++) {
      const a = cuffIds[k][q], b = cuffIds[k + 1][q];
      const c = q + 1 < prof.length ? cuffIds[k + 1][q + 1] : cuffClose[k + 1], e = q + 1 < prof.length ? cuffIds[k][q + 1] : cuffClose[k];
      chains.quad(a, e, c, b);
    }
    for (let v = cuffStart; v < chains.n; v++) chains.W[v] = [['lowerarm_l', 1]];
    // the broken chain on the back of the hand: back = against the fingers' curl (the poseOffsets curl them about
    // their local +X, i.e. towards the bone's local +Z = the palm)
    const palm = new THREE.Vector3(0, 0, 1).applyQuaternion(sk.middle_01_l.world);
    const bh = norm([-palm.x, -palm.y, -palm.z]);
    const along0 = norm(sub(B('middle_01_l'), W));
    const along = norm(sub(along0, scl(bh, dot(along0, bh))));
    const sideH = norm(cross(bh, along));
    const knuck = dot(sub(B('middle_01_l'), W), along);
    const L2 = { li: Math.min(0.056, knuck * 0.42), wi: 0.027, rw: 0.0085 };
    const pitch = L2.li - L2.rw * 1.2;
    let dAl = T1 + L2.li * 0.5 - 0.004;
    // links alternate flat / leaning 30 deg (a chain lying on a surface; on edge it stood 4 cm off the hand)
    for (let k = 0; k < 3; k++) {
      const base = madd(W, along, dAl);
      const hit = bodyB.first(madd(base, bh, 0.3), scl(bh, -1), 0.5);
      const tilt = k === 1 ? Math.PI / 6 : 0;
      const sideK = norm(add(scl(sideH, Math.cos(tilt)), scl(bh, Math.sin(tilt))));
      const half = (L2.wi / 2 + L2.rw * 0.5) * Math.sin(tilt) + L2.rw;
      const surfP = hit ? hit.p : madd(base, bh, 0.03);
      // (the first link's end passes through the cuff band: it is fastened to it)
      const c = madd(surfP, bh, half + (k === 0 ? 0.006 : 0.003));
      const g0 = chains.n;
      link(c, along, sideK, bh, k === 2, L2);
      for (let v = g0; v < chains.n; v++) {
        const t = dot(sub([chains.P[v * 3], chains.P[v * 3 + 1], chains.P[v * 3 + 2]], W), ax);
        const wh = ss(-0.04, 0.025, t);
        chains.W[v] = [['lowerarm_l', 1 - wh], ['hand_l', wh]];
      }
      dAl += pitch;
    }
    console.log(`${TAG} shackle r ${rr.map((x) => x.toFixed(3)).join(" ")} (was one circle), hand chain link ${L2.li.toFixed(3)} / knuckles ${knuck.toFixed(3)}`);
    chainInfo.cuff = { c0: madd(W, ax, T0), c1: madd(W, ax, T1), r: Math.max(...rr) - 0.008 };
  }
  const chainPart = weldNormals(toPart(lib, h, chains, 'chains', 'gear', (p) => skinClosest(p, { allow: ['spine_03'] })));
  console.log(`${TAG} chain links ${chainInfo.links}`);

  // ================================================================ RUBBER WELLINGTONS (cloth): one-piece boots
  // One lofted surface per leg (16 vertices per ring, shared positions across the UV seam so the shading is smooth):
  // a thick lug sole (outset 4 mm, dark tread), a wide ROUND toe box and rounded heel (super-ellipse rings sized
  // from the foot's own vertices), the instep rising in one line to the shin, a ribbed ankle (normal map) and a
  // shaft that continues the foot's radius around the calf + trousers up to just under the knee (vertex push-out,
  // no flare), finished by a thick rolled rim folding 2.5 cm inside. The MakeHuman shoe is only measured (sole
  // height = the ground); the foot, the shins and the trouser legs inside the boot are dropped. The old pointed
  // dress shoe + separate shaft tube read as white gaiters over sneakers.
  const y0 = bootSole;
  const wellG = new UGeo();
  const wellInfo = [];
  {
    const NS = 16;
    const otherAxisDist = (p, s) => { const o = B(s === 'l' ? 'calf_r' : 'calf_l'), f = B(s === 'l' ? 'foot_r' : 'foot_l'); return Math.hypot(p[0] - lerp(f[0], o[0], 0.5), p[2] - lerp(f[2], o[2], 0.5)); };
    for (const [s, u0] of [['l', 0], ['r', 1]]) {
      const A = B(`foot_${s}`), Bl = B(`ball_${s}`), T = V(sk[`ball_${s}`].tail), K = B(`calf_${s}`);
      const fw = norm([T[0] - A[0], 0, T[2] - A[2]]), sd = norm(cross([0, 1, 0], fw));
      const A0 = [A[0], 0, A[2]];
      const toF = (p) => { const d = sub(p, A0); return [dot(d, fw), dot(d, sd)]; };
      const toW = (f, sv, y) => [A0[0] + fw[0] * f + sd[0] * sv, y, A0[2] + fw[2] * f + sd[2] * sv];
      const axisAt = (y) => toF(lerp3(A, K, (y - A[1]) / (K[1] - A[1])));
      // the foot's own vertices (frame: f forward from the ankle, s to the character's left)
      const ids = new Set([`foot_${s}`, `ball_${s}`].map((n) => sk[n].index));
      const footV = [], legV = [];
      for (const v of h.baseObj.groupVerts('body')) {
        const p = [h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]];
        if (Math.sign(p[0]) !== (s === 'l' ? 1 : -1) || p[1] > K[1]) continue;
        const fwgt = h.weights[v].reduce((a, [b, w]) => a + (ids.has(b) ? w : 0), 0);
        const [f, sv] = toF(p);
        if (fwgt > 0.5) footV.push([f, sv, p[1]]);
        else if (otherAxisDist(p, s) > Math.hypot(p[0] - lerp(A[0], K[0], 0.5), p[2] - lerp(A[2], K[2], 0.5))) legV.push([f, sv, p[1]]);
      }
      let heelF = 9, toeF = -9, ballS0 = 9, ballS1 = -9, heelS0 = 9, heelS1 = -9;
      for (const [f, sv] of footV) {
        heelF = Math.min(heelF, f); toeF = Math.max(toeF, f);
        if (Math.abs(f - toF(Bl)[0]) < 0.04) { ballS0 = Math.min(ballS0, sv); ballS1 = Math.max(ballS1, sv); }
        if (f < heelF + 0.06) { heelS0 = Math.min(heelS0, sv); heelS1 = Math.max(heelS1, sv); }
      }
      const sc = (ballS0 + ballS1) / 2, wBall = (ballS1 - ballS0) / 2;
      const yA = A[1], yTop = K[1] - 0.115;
      const front0 = toeF + 0.026, back0 = heelF - 0.014, wF0 = wBall + 0.017, wB0 = Math.max(0.042, (heelS1 - heelS0) / 2 + 0.014);
      // rings: [y, kind, analytic outline {fc, a, sc, wF, wB, n}] (foot frame); shaft rings sized by the leg
      const foot = (front, back, wF, wB, n = 2.5) => ({ fc: (front + back) / 2, a: (front - back) / 2, sc, wF, wB, n });
      // shaft rings hug the calf SKIN (the baggy trouser legs inside are pulled in and dropped below)
      const shaftRing = (y, below = 0.035, above = 0.035, clr = 0.014) => {
        const [cf, cs] = axisAt(y);
        let aF = 0.05, aB = 0.05, wS = 0.05;
        for (const [f, sv, py] of legV) {
          if (py < y - below || py > y + above) continue;
          const df = f - cf, ds = sv - cs;
          if (Math.abs(ds) < Math.abs(df)) { if (df > 0) aF = Math.max(aF, df); else aB = Math.max(aB, -df); } else wS = Math.max(wS, Math.abs(ds));
        }
        return { fc: cf + (aF - aB) / 2, a: (aF + aB) / 2 + clr, sc: cs, wF: wS + clr, wB: wS + clr, n: 2.05 };
      };
      const sMid = shaftRing(lerp(yA, yTop, 0.5), 0.06, 0.06), sTop = shaftRing(yTop, 0.05, 0.0, 0.022), sAnk = shaftRing(yA + 0.075, 0.03, 0.05);
      // a straight rubber tube: the ankle no narrower than ~94 % of the mid shaft, the top no wider than 104 % of it
      for (const k of ['a', 'wF', 'wB']) { sAnk[k] = Math.max(sAnk[k], sMid[k] * 0.94); sTop[k] = Math.min(Math.max(sTop[k], sMid[k]), sMid[k] * 1.04); }
      const blendR = (r0, r1, t) => ({ fc: lerp(r0.fc, r1.fc, t), a: lerp(r0.a, r1.a, t), sc: lerp(r0.sc, r1.sc, t), wF: lerp(r0.wF, r1.wF, t), wB: lerp(r0.wB, r1.wB, t), n: lerp(r0.n, r1.n, t) });
      const out4 = (r, d) => ({ ...r, a: r.a + d, wF: r.wF + d, wB: r.wB + d });
      const upper0 = foot(front0, back0, wF0, wB0);
      // instep: the front recedes from the toe box top to the shin in one smooth line; the heel stays round
      const instep = blendR(foot(lerp(front0, sAnk.fc + sAnk.a, 0.62), back0 + 0.004, lerp(wF0, sAnk.wF, 0.45), wB0 + 0.006, 2.35), sAnk, 0.12);
      const rings = [
        { y: y0, r: out4(upper0, 0.004), sole: 1 },                                                     // 0 sole bottom
        { y: y0 + 0.027, r: out4(upper0, 0.004), sole: 1 },                                             // 1 sole top (welt)
        { y: y0 + 0.029, r: upper0, sole: 0 },                                                          // 2 upper starts
        { y: y0 + 0.068, r: foot(front0 - 0.008, back0, wF0 - 0.002, wB0 + 0.001) },                     // 3 toe nose
        { y: y0 + 0.104, r: foot(front0 - 0.05, back0 + 0.001, wF0 - 0.008, wB0 + 0.003, 2.45) },        // 4 toe box top
        { y: y0 + 0.142, r: instep },                                                                   // 5 instep
        { y: yA + 0.075, r: sAnk },                                                                     // 6 ankle
        { y: lerp(yA, yTop, 0.5), r: sMid },                                                            // 7 mid shaft
        { y: yTop, r: sTop },                                                                           // 8 top
      ];
      // ring points (parametric super-ellipse, vertex j at the same parameter on every ring)
      const spow = (x, e) => Math.sign(x) * Math.abs(x) ** e;
      const ringPts = (r) => {
        const pts = [];
        for (let j = 0; j < NS; j++) {
          const ph = (j / NS) * Math.PI * 2, cf = Math.cos(ph), sf = Math.sin(ph);
          const w = lerp(r.wB, r.wF, (1 + cf) / 2);
          pts.push([r.fc + r.a * spow(cf, 2 / r.n), r.sc + w * spow(sf, 2 / r.n)]);
        }
        return pts;
      };
      // push-out: every foot / leg / trouser vertex within a ring's height band stays inside it (+ clearance)
      for (let k = 0; k < rings.length; k++) {
        const R = rings[k];
        const pts = ringPts(R.r);
        const cen = [R.r.fc, R.r.sc];
        const pol = pts.map(([f, sv]) => ({ th: Math.atan2(sv - cen[1], f - cen[0]), r: Math.hypot(f - cen[0], sv - cen[1]) }));
        const yLo = k ? lerp(rings[k - 1].y, R.y, 0.5) : R.y - 0.01, yHi = k + 1 < rings.length ? lerp(R.y, rings[k + 1].y, 0.5) : R.y;
        const src = k <= 5 ? footV.concat(legV) : legV;
        const clr = k <= 2 ? 0.006 : k === 8 ? 0.02 : 0.012;
        for (let it = 0; it < 2; it++) for (const [f, sv, py] of src) {
          if (py < yLo || py > yHi) continue;
          const th = Math.atan2(sv - cen[1], f - cen[0]), rho = Math.hypot(f - cen[0], sv - cen[1]);
          for (let j = 0; j < NS; j++) {
            const a0 = pol[j].th, a1 = pol[(j + 1) % NS].th;
            let span = a1 - a0; if (span < 0) span += Math.PI * 2;
            let rel = th - a0; if (rel < 0) rel += Math.PI * 2;
            if (rel > span) continue;
            const t = rel / span, rr = lerp(pol[j].r, pol[(j + 1) % NS].r, t);
            if (rho + clr > rr) { const g = (rho + clr) / rr; pol[j].r *= 1 + (g - 1) * (1 - t * 0.5); pol[(j + 1) % NS].r *= 1 + (g - 1) * (0.5 + t * 0.5); }
            break;
          }
        }
        // smooth outward only (rubber holds a fair curve, containment kept)
        for (let it = 0; it < 2; it++) { const r0 = pol.map((q) => q.r); pol.forEach((q, j) => { q.r = Math.max(r0[j], 0.5 * r0[j] + 0.25 * (r0[(j + NS - 1) % NS] + r0[(j + 1) % NS])); }); }
        R.pts = pol.map((q) => [cen[0] + Math.cos(q.th) * q.r, cen[1] + Math.sin(q.th) * q.r]);
        R.cen = cen;
      }
      // the sole rings take the pushed-out upper's outline + 4 mm (a crisp welt)
      for (const k of [0, 1]) rings[k].pts = rings[2].pts.map(([f, sv]) => { const d = norm([f - rings[2].cen[0], sv - rings[2].cen[1], 0]); return [f + d[0] * 0.004, sv + d[1] * 0.004]; });
      // rolled rim: crest 7 mm above the top edge and 4 mm out, then folded 2.5 cm down inside
      const top = rings[rings.length - 1];
      const radial = (R, dr) => R.pts.map(([f, sv]) => { const d = norm([f - R.cen[0], sv - R.cen[1], 0]); return [f + d[0] * dr, sv + d[1] * dr]; });
      rings.push({ y: yTop + 0.007, pts: radial(top, 0.004), cen: top.cen, rim: 1 });
      rings.push({ y: yTop + 0.004, pts: radial(top, -0.005), cen: top.cen, rim: 1 });
      rings.push({ y: yTop - 0.025, pts: radial(top, -0.009), cen: top.cen, rim: 2 });
      // positions + weights
      const ballF = toF(Bl)[0];
      const wOf = (f, y) => {
        const calf = ss(yA - 0.01, yA + 0.1, y) * (f < -0.04 && y < yA + 0.02 ? 0.4 : 1);
        const ball = (1 - calf) * ss(ballF - 0.03, ballF + 0.05, f) * 0.7;
        return [[`calf_${s}`, calf], [`foot_${s}`, 1 - calf - ball], [`ball_${s}`, ball]];
      };
      const ids2 = rings.map((R) => R.pts.map(([f, sv]) => wellG.v(toW(f, sv, R.y), wOf(f, R.y))));
      // UVs: side strip (u around, v up by the mean arc length), cap below
      const perim = rings.map((R) => R.pts.reduce((a, p, j) => a + Math.hypot(p[0] - R.pts[(j + 1) % NS][0], p[1] - R.pts[(j + 1) % NS][1]), 0));
      const vAcc = [0];
      for (let k = 1; k < rings.length; k++) {
        let m = 0;
        for (let j = 0; j < NS; j++) { const a = rings[k - 1].pts[j], b = rings[k].pts[j]; m += Math.hypot(a[0] - b[0], a[1] - b[1], rings[k - 1].y - rings[k].y); }
        vAcc.push(vAcc[k - 1] + m / NS);
      }
      wellInfo.push({ s, A, K, fw, sd, A0, toF, toW, rings, yTop, yA, ballF, perim: Math.max(...perim), height: vAcc[vAcc.length - 1], vAcc, ids: ids2, front0, back0, sc });
    }
    // atlas: the two side strips stacked (left boot below), the two soles side by side on the right
    const d = Math.min(0.66 / Math.max(...wellInfo.map((w) => w.perim)), 0.46 / Math.max(...wellInfo.map((w) => w.height)));
    wellInfo.forEach((W, bi) => {
      const v0 = 0.02 + bi * 0.49, NS2 = 16;
      const rows = W.rings.map((R, k) => {
        const row = [];
        let acc = 0;
        for (let j = 0; j <= NS2; j++) {
          if (j) { const a = R.pts[j - 1], b = R.pts[j % NS2]; acc += Math.hypot(a[0] - b[0], a[1] - b[1]); }
          row.push(wellG.t([0.02 + acc * d, v0 + W.vAcc[k] * d]));
        }
        return row;
      });
      // average the u of each column over the rings (no shear in the strip)
      for (let j = 0; j <= NS2; j++) { let m = 0; for (const row of rows) m += wellG.UV[row[j] * 2]; m /= rows.length; for (const row of rows) wellG.UV[row[j] * 2] = m; }
      W.uv = { v0, d, rows };
      for (let k = 0; k + 1 < W.rings.length; k++) for (let j = 0; j < NS2; j++) {
        const a = W.ids[k][j], b = W.ids[k][(j + 1) % NS2], c = W.ids[k + 1][(j + 1) % NS2], e = W.ids[k + 1][j];
        const ta = rows[k][j], tb = rows[k][j + 1], tc = rows[k + 1][j + 1], te = rows[k + 1][j];
        wellG.tri(a, b, c, ta, tb, tc); wellG.tri(a, c, e, ta, tc, te);
      }
      // sole cap: its own vertices (a crisp edge), strip-triangulated across the outline
      const R0 = W.rings[0];
      const capIds = R0.pts.map(([f, sv]) => wellG.v(W.toW(f, sv, R0.y), null));
      const capW = R0.pts.map(([f, sv]) => { const l = [[`foot_${W.s}`, 1 - ss(W.ballF - 0.03, W.ballF + 0.05, f) * 0.7], [`ball_${W.s}`, ss(W.ballF - 0.03, W.ballF + 0.05, f) * 0.7]]; return l; });
      capIds.forEach((id, j) => { wellG.W[id] = capW[j]; });
      const capUV = R0.pts.map(([f, sv]) => wellG.t([0.70 + bi * 0.15 + 0.065 + (sv - W.sc) * d * 0.9, 0.03 + (f - W.back0 + 0.01) * d * 0.9]));
      // strip triangulation between the two sides (j and NS - j), front (0) to back (NS / 2)
      for (let j = 0; j < NS2 / 2; j++) {
        const l0 = j, l1 = j + 1, r0 = (NS2 - j) % NS2, r1 = NS2 - j - 1;
        if (j === 0) { wellG.tri(capIds[l0], capIds[r1], capIds[l1], capUV[l0], capUV[r1], capUV[l1]); continue; }
        if (l1 === r1) { wellG.tri(capIds[l0], capIds[r0], capIds[l1], capUV[l0], capUV[r0], capUV[l1]); continue; }
        wellG.tri(capIds[l0], capIds[r0], capIds[r1], capUV[l0], capUV[r0], capUV[r1]);
        wellG.tri(capIds[l0], capIds[r1], capIds[l1], capUV[l0], capUV[r1], capUV[l1]);
      }
    });
    // consistent winding: side faces point away from the boot's ring centre (the folded lip towards it), the sole
    // cap downwards
    {
      const P = wellG.P;
      const at = (i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
      for (const f of wellG.F) {
        const [a, b, c] = f.v.map(at);
        const n = cross(sub(b, a), sub(c, a));
        const m = scl(add(add(a, b), c), 1 / 3);
        const W = wellInfo[m[0] >= 0 ? 0 : 1];
        let want;
        if (Math.abs(m[1] - y0) < 1e-4 && Math.abs(a[1] - y0) < 1e-4 && Math.abs(b[1] - y0) < 1e-4) want = [0, -1, 0];
        else if (f.v.every((i) => P[i * 3 + 1] > W.yTop + 0.003)) want = [0, 1, 0];
        else {
          const R = W.rings.reduce((best, r) => (Math.abs(r.y - m[1]) < Math.abs(best.y - m[1]) ? r : best));
          const cw = W.toW(R.cen[0], R.cen[1], m[1]);
          want = sub(m, cw); want[1] = 0;
          const inLip = m[1] < W.yTop + 0.0045 && m[1] > W.yTop - 0.03 && f.v.some((i) => P[i * 3 + 1] < W.yTop - 0.02) && f.v.every((i) => P[i * 3 + 1] > W.yTop - 0.03);
          if (inLip) want = scl(want, -1);
        }
        if (dot(n, want) < 0) { f.v = [f.v[0], f.v[2], f.v[1]]; f.t = [f.t[0], f.t[2], f.t[1]]; }
      }
    }
    // trousers tucked in: trouser vertices just above the rim are pulled in under the rolled lip (fading out 9 cm
    // above it), so the bunched knee crease never pokes out through the rubber (also after simplification)
    const outlineR = (W, R, f, sv) => {
      const th = Math.atan2(sv - R.cen[1], f - R.cen[0]);
      let best = null, bd = 9;
      R.pts.forEach(([pf, ps]) => { const a = Math.atan2(ps - R.cen[1], pf - R.cen[0]); let dd = Math.abs(a - th); if (dd > Math.PI) dd = 2 * Math.PI - dd; if (dd < bd) { bd = dd; best = Math.hypot(pf - R.cen[0], ps - R.cen[1]); } });
      return best;
    };
    for (let v = 0; v < suit.nVerts; v++) {
      const p = [suit.pos[v * 3], suit.pos[v * 3 + 1], suit.pos[v * 3 + 2]];
      const W = wellInfo[p[0] >= 0 ? 0 : 1];
      if (p[1] > W.yTop + 0.09) continue;
      const top = p[1] >= W.yTop ? W.rings[8] : W.rings.filter((q) => !q.rim).reduce((best, q) => (Math.abs(q.y - p[1]) < Math.abs(best.y - p[1]) ? q : best));
      const [f, sv] = W.toF(p);
      const r = Math.hypot(f - top.cen[0], sv - top.cen[1]);
      if (r < 1e-4 || r > 0.3) continue;
      const rt = outlineR(W, top, f, sv) - 0.016;
      const w = 1 - ss(W.yTop - 0.01, W.yTop + 0.09, p[1]);
      if (r > rt) {
        const nr = lerp(r, rt, w), k = nr / r;
        const q = W.toW(top.cen[0] + (f - top.cen[0]) * k, top.cen[1] + (sv - top.cen[1]) * k, p[1]);
        suit.pos[v * 3] = q[0]; suit.pos[v * 3 + 2] = q[2];
      }
    }
    // trousers / shins inside the boots go (every vertex below the rim, inside its outline)
    const inBoot = (p) => {
      const W = wellInfo[p[0] >= 0 ? 0 : 1];
      if (p[1] > W.yTop + 0.004) return false;
      const [f, sv] = W.toF(p);
      const R = W.rings.filter((r) => !r.rim).reduce((best, r) => (Math.abs(r.y - p[1]) < Math.abs(best.y - p[1]) ? r : best));
      return Math.hypot(f - R.cen[0], sv - R.cen[1]) < outlineR(W, R, f, sv) + 0.02;
    };
    const drop = (part) => {
      let n = 0;
      part.obj.faces.forEach((f, fi) => { if (part.keep[fi] && f.v.every((v) => inBoot([part.pos[v * 3], part.pos[v * 3 + 1], part.pos[v * 3 + 2]]))) { part.keep[fi] = 0; n++; } });
      return n;
    };
    const dT = drop(suit), dB = drop(body);
    const W0 = wellInfo[0];
    console.log(`${TAG} wellingtons: ${wellG.F.length} tris, ${W0.rings.length} rings; L foot ${(W0.front0 - W0.back0).toFixed(3)} m long, top ${W0.yTop.toFixed(3)}; dropped inside: trousers ${dT}, body ${dB}`);
  }
  const bootPart = toPart(lib, h, wellG, 'boots', 'cloth', () => [['spine_01', 1]]);

  // per-region triangle budgets: the small head keeps its features, the huge torso is cheap
  const boneW = (names) => { const ids = new Set(h.skeleton.bones.filter((b) => names.test(b.name)).map((b) => b.index)); return (v) => h.weights[v].reduce((a, [b, w]) => a + (ids.has(b) ? w : 0), 0); };
  const headW = boneW(/^(head|neck_01)$/), handW = boneW(/^(hand|thumb|index|middle|ring|pinky)/);
  const bodyLow = await simplifyRegions(lib, body, [
    // the head keeps curvature (normal error weighted like the uvs): crown, jaw and ear silhouettes
    { name: 'head', test: (v) => headW(v) > 0.5, tris: 1720, attrW: [1.2, 1.2, 1.2, 1, 1] },
    { name: 'hands', test: (v) => handW(v) > 0.5, tris: 480 },
    { name: 'rest', test: () => true, tris: 2480 },
  ]);

  // ================================================================ TEXTURES
  // Albedo rule (in-game read, docs/ZOMBIE_PIPELINE.md 2.3): base colours at real-world values (skin sRGB mean
  // ~105-125, apron ~95-110, trousers ~65-80, boots ~140-170), blood / grime only as local detail; every shadow-like
  // term (ray-traced AO, contact shadows of the apron / chains / plate / growths) goes into the ORM occlusion only.
  const parts = [bodyLow, suit, bootPart, eyes, teeth, growPart, platePart, apronPart, chainPart];
  const lumpsS = tumourLumps.map((L) => { const hit = bodyB.first(madd(L.p, L.n, 0.4), scl(L.n, -1), 0.6); return { ...L, s: hit ? hit.p : L.p }; });
  const tumourAt = (P) => {
    let k = 0;
    for (const L of lumpsS) { const d = dist(P, L.s); if (d < L.r * 1.7) k = Math.max(k, (1 - ss(L.r * 0.45, L.r * 1.7, d)) * (L.small ? 0.7 : 1)); }
    return k;
  };
  const chainD = chainInfo.paths.map((P) => polyDist(P));
  const cuff = chainInfo.cuff;
  if (FAST) {
    const flat = (rgb, ro = 0.8) => ({ color: [...lin(rgb), 1], roughness: ro, metalness: 0 });
    bodyLow.material = lib.material('skin', flat([150, 140, 128], 0.6));
    suit.material = lib.material('cloth', { ...flat([130, 104, 50], 0.6), doubleSided: true });
    bootPart.material = lib.material('cloth', flat([150, 146, 136], 0.5));
    eyes.material = lib.material('eye', flat([200, 60, 30], 0.2));
    teeth.material = lib.material('teeth', flat([190, 170, 130], 0.4));
    growPart.material = lib.material('gore', flat([120, 50, 60], 0.4));
    platePart.material = lib.material('gear', { ...flat([110, 80, 60], 0.6), doubleSided: true });
    apronPart.material = lib.material('cloth', { ...flat([70, 120, 150], 0.5), doubleSided: true });
    chainPart.material = lib.material('gear', flat([90, 70, 55], 0.6));
  } else {
    // ---------------------------------------------------------------- skin
    const src = await lib.texture('system', 'skins/old_caucasian_male/old_lightskinned_male_diffuse.png', 2048);
    let mL = 0, nL = 0;
    for (let i = 0; i < src.data.length; i += 4) { const l = lum([S2L[src.data[i]], S2L[src.data[i + 1]], S2L[src.data[i + 2]]]); if (l > 0.02) { mL += l; nL++; } }
    mL /= Math.max(1, nL);
    // the old male skin's wrinkles / pores / lips / nipples as a luminance ratio over an ashen grey-olive corpse
    // palette (20 % of the source hue kept so lips and nipples stay a little warmer)
    const PAL = lin([142, 142, 128]);
    const skinBase = grade(lib.cloneImage(src), (c) => {
      const k = Math.min(1.6, (lum(c) / mL) ** 0.8);
      const s = lum(PAL) / mL;
      for (let i = 0; i < 3; i++) c[i] = lerp(PAL[i] * k, c[i] * s, 0.2);
    });
    TR.snap('skin: graded source', skinBase, bodyLow);
    const scarSegs = [];
    const scarLine = (pts, kind) => { for (let i = 0; i + 1 < pts.length; i++) scarSegs.push({ a: pts[i], b: pts[i + 1], kind }); };
    // autopsy-style Y incision, stapled shut (the bib hides most of the stem): from both shoulders to the sternum
    const yS = y3 - 0.1;
    scarLine([around(trunkB, 52, clY - 0.05).p, around(trunkB, 32, lerp(clY, yS, 0.55)).p, around(trunkB, 10, yS + 0.02).p, around(trunkB, 0, yS).p], 'staple');
    scarLine([around(trunkB, -52, clY - 0.05).p, around(trunkB, -32, lerp(clY, yS, 0.55)).p, around(trunkB, -10, yS + 0.02).p, around(trunkB, 0, yS).p], 'staple');
    scarLine([around(trunkB, 0, yS).p, around(trunkB, 0, lerp(yS, yW, 0.5)).p, around(trunkB, 0, yW + 0.03).p], 'staple');
    // the skull opened and stapled back: a horseshoe from above one ear across the forehead to the other
    const headIdx = h.skeleton.byName.head.index;
    let HC = [0, 0, 0], nHC = 0;
    for (const v of h.baseObj.groupVerts('body')) { if (h.weights[v].some(([b, w]) => b === headIdx && w > 0.8)) { HC = add(HC, [h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]]); nHC++; } }
    HC = scl(HC, 1 / nHC);
    const skullPt = (phDeg, elDeg) => {
      const ph = phDeg * Math.PI / 180, el = elDeg * Math.PI / 180;
      const d = [Math.sin(ph) * Math.cos(el), Math.sin(el), Math.cos(ph) * Math.cos(el)];
      const hit = bodyB.first(madd(HC, d, 0.4), scl(d, -1), 0.4);
      return hit ? hit.p : madd(HC, d, 0.1);
    };
    scarLine([-105, -80, -55, -30, -10, 10, 30, 55, 80, 105].map((ph) => skullPt(ph, 38 + 10 * Math.abs(ph) / 105)), 'staple');
    const sUAl = boneSeg(sk.upperarm_l), sUAr = boneSeg(sk.upperarm_r), sLAl = boneSeg(sk.lowerarm_l), sLAr = boneSeg(sk.lowerarm_r);
    const cheekRot = skullPt(38, -32);
    const knuckles = ['index_01_l', 'middle_01_l', 'ring_01_l', 'pinky_01_l', 'index_01_r', 'middle_01_r', 'ring_01_r', 'pinky_01_r'].map(B);
    const scar = (P, Nn, c, st, s) => {
      const d = sub(s.b, s.a), Lg = len(d), dir = scl(d, 1 / Lg);
      const t = dot(sub(P, s.a), dir);
      if (t < -0.015 || t > Lg + 0.015) return;
      const off = sub(P, madd(s.a, dir, Math.max(0, Math.min(Lg, t))));
      if (len(off) > 0.025) return;
      const perp = norm(cross(dir, Nn));
      const ac = dot(off, perp) + N.noise(t * 40, 0.3, 1.1) * 0.0015;
      const endFade = ss(-0.012, 0.004, t) * ss(Lg + 0.012, Lg - 0.004, t);
      const line = (1 - ss(0.0012, 0.0035, Math.abs(ac))) * endFade;
      over(c, lin([120, 62, 64]), line * 0.85); st.h -= line * 0.6; st.ro = lerp(st.ro, 0.4, line);
      over(c, lin([142, 84, 88]), (1 - ss(0.003, 0.011, Math.abs(ac))) * endFade * 0.45);   // puckered, inflamed rim
      st.h += (1 - ss(0.002, 0.008, Math.abs(ac))) * endFade * 0.35;
      // surgical staples: bar across the cut + the two legs, grey steel, a little rust
      const si = Math.round(t / 0.016), sh = hash(si * 7 + Math.round(s.a[0] * 1000));
      const m = t - si * 0.016 - (sh - 0.5) * 0.004 + ac * (hash(si * 13 + 3) - 0.5) * 0.9;   // uneven spacing, tilted
      const miss = sh < 0.18 ? 0 : 1;                                                       // a few pulled out
      const bar = (1 - ss(0.0008, 0.0015, Math.abs(m))) * (1 - ss(0.0055, 0.0068, Math.abs(ac))) * miss;
      const legs = (1 - ss(0.001, 0.0018, Math.abs(Math.abs(ac) - 0.0058))) * (1 - ss(0.001, 0.0018, Math.abs(m)));
      const k = Math.max(bar, legs * miss) * endFade;
      st.bl = Math.max(st.bl, (1 - ss(0.0015, 0.007, Math.abs(ac))) * endFade * ss(0.1, 0.6, N.noise(t * 60, 5.5, 2.2) + 0.3) * 0.75);
      over(c, mix3(lin([150, 146, 140]), lin([110, 70, 46]), ss(0.1, 0.6, N.noise(t * 90, 2.1, 0.4))), k * 0.95);
      st.h += bar * endFade * 1.3; st.ro = lerp(st.ro, 0.32, k);
      st.bl = Math.max(st.bl, legs * endFade * 0.5);
    };
    const skinExtra = (P, Nn, c, st) => {
      // corpse marbling: grey-green blotches and dusky violet patches (no uniform tone)
      const g = N.fbm(P[0] * 4 + 3, P[1] * 4, P[2] * 4, 3);
      mul(c, [0.9, 0.98, 0.8], ss(0.15, 0.6, g) * 0.5);
      mul(c, [0.98, 0.86, 1.0], ss(0.2, 0.7, -g) * 0.45);
      const lace = N.worley(P[0] * 24, P[1] * 24, P[2] * 24);
      mul(c, [0.86, 0.76, 0.86], (1 - ss(0.04, 0.16, Math.abs(lace - 0.5))) * ss(0.1, 0.6, N.fbm(P[0] * 7 + 1, P[1] * 7, P[2] * 7, 2) + 0.2) * 0.45);
      // pooled livor low on the back and on the hanging forearms / hands (violet, soft)
      const low = Math.max(ss(0.1, -0.6, Nn[2]) * ss(y3, yW - 0.05, P[1]) * 0.6, (() => { const a = sLAl(P), b = sLAr(P); return Math.max(a.d < 0.11 ? ss(0.3, 1.1, a.t) : 0, b.d < 0.11 ? ss(0.3, 1.1, b.t) : 0); })() * 0.5);
      mul(c, [0.86, 0.78, 0.92], low * 0.6);
      // decay: grey-green rot patches, brown-violet spots, grime runs from the shoulders down the chest and back
      const rot = ss(0.25, 0.65, N.fbm(P[0] * 3.3 + 21, P[1] * 3.3, P[2] * 3.3, 4));
      over(c, lin([112, 118, 92]), rot * 0.4);
      const spot = 1 - ss(0.05, 0.16, N.worley(P[0] * 16 + 3, P[1] * 16, P[2] * 16));
      over(c, lin([96, 70, 76]), spot * ss(0.1, 0.5, N.noise(P[0] * 5, P[1] * 5, P[2] * 5) + 0.2) * 0.45);
      const runs = ss(0.55, 0.8, N.noise(P[0] * 45, P[1] * 3.5, P[2] * 45)) * ss(0.2, 0.6, N.fbm(P[0] * 3 + 9, P[1] * 1.5, P[2] * 3, 2) + 0.25) * ss(yW, y3, P[1]);
      over(c, lin([92, 84, 70]), runs * 0.45); st.ro = lerp(st.ro, 0.75, runs * 0.5);
      // the face: a necrotic patch on the left cheek / jaw (grey-green, dark spots)
      {
        const dc = dist(P, cheekRot);
        if (dc < 0.06) {
          const k = (1 - ss(0.015, 0.055, dc + N.fbm(P[0] * 40, P[1] * 40, P[2] * 40, 3) * 0.015));
          over(c, lin([104, 108, 84]), k * 0.6); mul(c, [0.75, 0.7, 0.72], k * ss(0.2, 0.6, N.noise(P[0] * 90, P[1] * 90, P[2] * 90) + 0.3) * 0.6);
          st.h -= k * 0.3; st.ro = lerp(st.ro, 0.45, k);
        }
      }
      // pores and fine creases (close-ups) + an oily sheen on the shoulders / chest, dry dull patches
      const pw = N.worley(P[0] * 420, P[1] * 420, P[2] * 420);
      const pore = (1 - ss(0.1, 0.24, pw)) * (0.45 + 0.55 * ss(-0.2, 0.4, N.noise(P[0] * 40, P[1] * 40, P[2] * 40)));
      st.h -= pore * 0.28; mul(c, [0.9, 0.86, 0.84], pore * 0.25);
      const oil = ss(-0.1, 0.5, N.fbm(P[0] * 6 + 11, P[1] * 6, P[2] * 6, 3));
      st.ro = lerp(st.ro, 0.4, oil * 0.55);
      st.ro = lerp(st.ro, 0.78, ss(0.1, 0.6, -N.fbm(P[0] * 9 + 3, P[1] * 9, P[2] * 9, 3)) * 0.6);
      st.ro += N.fbm(P[0] * 60, P[1] * 60, P[2] * 60, 2) * 0.1 + pore * 0.08;
      // the tumour field: skin stretched shiny over the swelling, inflamed violet-red, a dense dark vein web and
      // stretch striae; pus-yellow nodules and a few weeping sores
      const tf = tumourAt(P);
      if (tf > 0) {
        // the swollen field reads like a deep bruise around the growths: yellow-green at the edge, violet, then
        // inflamed red-raw where the bulbs burst out (it was one flat pink-magenta gradient)
        const n1 = N.fbm(P[0] * 9 + 2, P[1] * 9, P[2] * 9, 3);
        const zone = clamp01(tf + 0.18 * n1);
        const bruise = zone < 0.4 ? mix3(lin([150, 144, 100]), lin([126, 88, 112]), ss(0.05, 0.4, zone))
          : mix3(lin([126, 88, 112]), lin([146, 66, 70]), ss(0.4, 0.85, zone));
        over(c, bruise, ss(0.0, 0.25, tf) * 0.72);
        mul(c, [0.86, 0.72, 0.8], ss(0.55, 1, tf) * 0.35);
        // dense vein network (dark violet-blue, raised), thicker trunks running out of the growths
        const vr = N.ridged(P[0] * 30, P[1] * 30, P[2] * 30, 3), vt = N.ridged(P[0] * 11 + 4, P[1] * 11, P[2] * 11, 2);
        const vv = Math.max(ss(0.6, 0.86, vr) * ss(0.15, 0.8, tf), ss(0.72, 0.9, vt) * ss(0.05, 0.5, tf) * 0.9);
        over(c, lin([58, 34, 66]), vv * 0.8); st.h += vv * 1.3;
        // stretched-skin striae fanning out from each bulb's base (pale, shiny, slightly sunken)
        for (const b of bulbs) {
          const d = sub(P, b.base), dd = len(d);
          if (dd > b.r * 1.5 || dd < b.r * 0.6) continue;
          const t1 = norm(cross(b.n, Math.abs(b.n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), t2 = cross(b.n, t1);
          const th = Math.atan2(dot(d, t2), dot(d, t1));
          // sparse: thin lines, only in some sectors, fading out within half a radius of the base
          const str = ss(0.86, 0.98, Math.abs(Math.sin(th * 9 + 3 * N.noise(P[0] * 18, P[1] * 18, P[2] * 18)))) * ss(-0.1, 0.4, N.noise(th * 2 + b.r * 50, 0.3, 1.7))
            * ss(b.r * 0.6, b.r * 0.85, dd) * (1 - ss(b.r * 1.05, b.r * 1.5, dd));
          over(c, lin([184, 150, 150]), str * 0.3); st.h -= str * 0.35; st.ro = lerp(st.ro, 0.32, str * 0.6);
        }
        const nod = 1 - ss(0.0, 0.3, N.worley(P[0] * 55, P[1] * 55, P[2] * 55));
        over(c, lin([176, 150, 92]), nod * ss(0.4, 0.9, tf) * ss(0.3, 0.7, N.noise(P[0] * 20, P[1] * 20, P[2] * 20) + 0.5) * 0.7);
        st.h += nod * tf * 0.8;
        st.ro = lerp(st.ro, 0.3, tf * 0.8);
        const sore = ss(0.55, 0.75, N.noise(P[0] * 26 + 5, P[1] * 26, P[2] * 26)) * ss(0.5, 0.9, tf);
        st.bl = Math.max(st.bl, sore * 0.7);
      }
      // bulging veins on the forearms, upper arms and neck (dark grey-blue under the ashen skin)
      {
        let w = 0;
        for (const [s, k] of [[sLAl, 1], [sLAr, 1], [sUAl, 0.7], [sUAr, 0.8]]) { const q = s(P); if (q.t > -0.15 && q.t < 1.05 && q.d < 0.12) w = Math.max(w, k * ss(-0.15, 0.1, q.t)); }
        if (P[1] > yNeck - 0.05 && P[1] < yNeck + 0.08) w = Math.max(w, 0.6);
        const v = N.ridged(P[0] * 17, P[1] * 17, P[2] * 17, 3) * ss(-0.3, 0.3, N.fbm(P[0] * 4.5 + 9, P[1] * 4.5, P[2] * 4.5, 2));
        const vv = ss(0.62, 0.88, v) * w;
        if (vv > 0) { over(c, lin([74, 82, 96]), vv * 0.55); st.h += vv * 1.1; }
      }
      // raw chafing under the chains and the wrist shackle
      let cd = 0.05;
      for (const f of chainD) cd = Math.min(cd, f(P, 0.05));
      if (cd < 0.035) {
        const k = 1 - ss(0.012, 0.034, cd + N.noise(P[0] * 60, P[1] * 60, P[2] * 60) * 0.006);
        over(c, lin([150, 66, 60]), k * 0.55); st.ro = lerp(st.ro, 0.4, k);
        st.bl = Math.max(st.bl, k * ss(0.2, 0.6, N.noise(P[0] * 80, P[1] * 80, P[2] * 80)) * 0.6);
      }
      if (cuff) {
        const ax = norm(sub(cuff.c1, cuff.c0)), q = sub(P, cuff.c0), t = dot(q, ax), L = dist(cuff.c0, cuff.c1);
        if (t > -0.04 && t < L + 0.04 && len(sub(q, scl(ax, t))) < cuff.r + 0.02) {
          const k = ss(-0.04, 0.0, t) * ss(L + 0.04, L, t);
          over(c, lin([136, 54, 50]), k * 0.7); st.bl = Math.max(st.bl, k * ss(-0.1, 0.5, N.noise(P[0] * 70, P[1] * 70, P[2] * 70)) * 0.8);
          st.ro = lerp(st.ro, 0.35, k);
        }
      }
      // split, scabbed knuckles
      for (const kp of knuckles) {
        const d = dist(P, kp);
        if (d > 0.04) continue;
        const k = 1 - ss(0.008, 0.032, d);
        over(c, lin([110, 66, 76]), k * 0.5);
        st.bl = Math.max(st.bl, (1 - ss(0.004, 0.012, d)) * 0.8);
      }
      for (const s of scarSegs) scar(P, Nn, c, st, s);
      // a slaughterman's spray: fine dried blood over the chest, forearms and face
      const spray = N.worley(P[0] * 62, P[1] * 62, P[2] * 62);
      const sprayMask = ss(0.25, 0.7, N.fbm(P[0] * 3 + 5, P[1] * 3, P[2] * 3, 2) + 0.3) * ss(-0.2, 0.4, Nn[2] + 0.2);
      st.bl = Math.max(st.bl, (1 - ss(0.04, 0.08, spray)) * sprayMask * 0.6);
      // forearms soaked to the elbow (gutting), dried and flaking
      for (const s of [sLAl, sLAr]) {
        const q = s(P);
        if (q.d < 0.12 && q.t > 0.15) st.bl = Math.max(st.bl, ss(0.15, 0.6, q.t) * ss(-0.25, 0.3, N.fbm(P[0] * 14, P[1] * 14, P[2] * 14, 3) + 0.15 * q.t) * 0.85);
      }
    };
    const skin = lib.paintSkin(h, {
      seed: 23, base: skinBase, size: 2048, normalSize: 1024, ormSize: 1024,
      pallor: 0, mottle: 0.65, veins: 0.35, bruises: 0.35, socket: 1, lips: 0.7, grime: 0.6,
      coveredDarken: 0.3, coveredShade: 0.12, normalStrength: 2.3, bumpStrength: 2.2, roughness: 0.6,
      blood: { mouth: 1, hands: 0.9, splatter: 0.1 },
      wounds: [
        { bone: 'lowerarm_r', t: 0.45, dir: [0.2, 0.3, 1], r: 0.026, kind: 'bite', depth: 1.8 },
        { bone: 'upperarm_l', t: 0.8, dir: [0.4, -0.2, 1], r: 0.02, kind: 'gash', depth: 1.5 },
        { bone: 'spine_02', t: 0.5, dir: [0.5, 0, -1], r: 0.022, kind: 'gash', depth: 1.6 },
        { bone: 'neck_01', t: 0.5, dir: [0.8, 0, 0.4], r: 0.018, kind: 'bite', depth: 1.5 },
      ],
      extra: skinExtra,
    });
    TR.snap('skin: painted', skin.albedo, bodyLow);

    // ---------------------------------------------------------------- trousers: yellow rubberised PVC work trousers
    // (slaughterhouse waterproofs, worn and filthy). Olive work trousers made the brute a small copy of the
    // butcher boss (bare-chested hulk, apron, chains, olive trousers); yellow legs under the blue apron over white
    // boots give it its own colour blocking from every side.
    const suitSrc = cropUV(await lib.texture(suit.asset.textures.diffuse, 2048), suitCrop, 1024, lib.resize);
    let sL = 0, sN = 0;
    for (let i = 0; i < suitSrc.data.length; i += 4) { const l = lum([S2L[suitSrc.data[i]], S2L[suitSrc.data[i + 1]], S2L[suitSrc.data[i + 2]]]); if (l > 0.005) { sL += l; sN++; } }
    sL /= Math.max(1, sN);
    const OCHRE = lin([150, 118, 48]);
    const suitBase = grade(suitSrc, (c) => { const k = Math.min(1.5, (lum(c) / sL) ** 0.6); for (let i = 0; i < 3; i++) c[i] = OCHRE[i] * k; });
    const cloth = lib.paintCloth(suit, {
      seed: 41, human: h, base: suitBase,
      normal: cropUV(await lib.texture(suit.asset.textures.normal, 2048), suitCrop, 512, lib.resize), ao: cropUV(await lib.texture(suit.asset.textures.ao, 2048), suitCrop, 256, lib.resize),
      size: 1024, normalSize: 512, ormSize: 256,
      fade: 0.15, grime: 0.75, grimeNoise: 0.9, weave: 0.12, innerDarken: 0,
      blood: { hands: 0.6, splatter: 0.5 },
    });
    // PVC: glossier than cloth (roughness ~0.5 instead of ~0.85), dull where it is grimy
    for (let i = 0; i < cloth.orm.data.length; i += 4) cloth.orm.data[i + 1] = Math.round(cloth.orm.data[i + 1] * 0.62);
    // the seat and the backs of the legs: lighter, dusty, worn (so the lower half never reads as one black mass)
    {
      const R = texSize(256), sS = nsurf(suit);
      const back = bakeField(sS, suit.obj.uvs, R, (P, Nn) => ss(0.15, -0.55, Nn[2]) * (0.75 + 0.25 * ss(-0.3, 0.4, N.fbm(P[0] * 6, P[1] * 6, P[2] * 6, 3))), { fill: 0, blur: 2 });
      applyFields(cloth.albedo, [back], R, (c, b) => { const k = 1 + 0.12 * b; c[0] *= k; c[1] *= k; c[2] *= k * 0.97; over(c, lin([120, 104, 72]), b * 0.15); });
    }
    TR.snap('trousers: painted', cloth.albedo, suit);

    // ---------------------------------------------------------------- rubber wellingtons: dirty white, one piece
    // Off-white rubber (sRGB ~170 clean) under a slaughterhouse floor's worth of dirt: mud rising unevenly from the
    // sole and splashed up the shaft, dried blood spray and runs with a few still-wet glossy patches, grime in the
    // ankle ribs and the instep flex creases, scuffs. Black lug sole (cleats on the side, chevrons underneath).
    // Target baseColor mean ~105-120 (it was 128 / 166 and the feet were the brightest thing on the character).
    const fr = (x) => ((x % 1) + 1) % 1;
    const wellTex = paintPart(bootPart, { size: 1024, normalSize: 512, ormSize: 256, rough: 0.5, normalStrength: 1.7 }, (P, Nn, st, u, v) => {
      const cap = u > 0.69;
      const W = wellInfo[P[0] >= 0 ? 0 : 1];
      const yb = P[1] - y0;
      const arcV = cap ? 0 : (v - W.uv.v0) / W.uv.d;
      const lip = !cap && arcV > W.vAcc[10] - 0.001;
      const [f, sv] = W.toF(P);
      const frontish = ss(-0.2, 0.7, Nn[0] * W.fw[0] + Nn[2] * W.fw[2]);
      // base: off-white rubber, faintly yellowed / greyed in patches
      set3(st.c, lin([154, 151, 140]));
      const f1 = N.fbm(P[0] * 7 + 3, P[1] * 7, P[2] * 7, 3);
      over(st.c, lin([152, 144, 122]), ss(-0.1, 0.5, f1) * 0.55);
      over(st.c, lin([138, 140, 138]), ss(-0.1, 0.5, -f1) * 0.4);
      // floor grime rising up the whole boot, darkest at the welt
      over(st.c, lin([112, 102, 84]), (1 - ss(0.03, 0.34, yb + 0.05 * N.fbm(P[0] * 5, P[1] * 3, P[2] * 5, 2))) * 0.5);
      st.ro = 0.46 + 0.08 * f1;
      st.h = N.fbm(P[0] * 160, P[1] * 160, P[2] * 160, 2) * 0.05;
      // moulded details: toe guard and heel counter bands, the raised band under the rim
      if (!cap) {
        st.h += 0.35 * ss(0.029, 0.033, yb) * (1 - ss(0.047, 0.052, yb)) * (ss(W.ballF - 0.06, W.ballF, f) + ss(-0.02, -0.06, f));
        st.h += 0.3 * ss(W.yTop - 0.03, W.yTop - 0.026, P[1]) * (1 - ss(W.yTop - 0.004, W.yTop, P[1]));
      }
      // ankle ribs (grime in the grooves) and the instep's flex creases
      const ribBand = ss(W.yA - y0 + 0.03, W.yA - y0 + 0.045, yb) * (1 - ss(W.yA - y0 + 0.11, W.yA - y0 + 0.125, yb));
      if (ribBand > 0 && !cap) {
        const rib = 0.5 + 0.5 * Math.cos(yb * Math.PI * 2 / 0.013);
        st.h += rib * ribBand * 0.55;
        over(st.c, lin([92, 84, 70]), (1 - rib) ** 2 * ribBand * 0.45);
      }
      const creaseZone = (1 - ss(0.0, 0.05, Math.abs(yb - (W.yA - y0 + 0.0)))) * ss(0.02, 0.09, f) * frontish;
      if (creaseZone > 0) {
        const cr = 1 - ss(0.03, 0.12, Math.abs(N.noise(P[0] * 14 + f * 30, P[1] * 70, P[2] * 14)));
        st.h -= cr * creaseZone * 0.6;
        over(st.c, lin([96, 88, 74]), cr * creaseZone * 0.45);
      }
      // the sole: black-brown rubber with a lug tread
      const sole = cap ? 1 : 1 - ss(0.026, 0.029, yb);
      if (sole > 0) {
        over(st.c, lin([40, 38, 36]), sole); st.ro = lerp(st.ro, 0.82, sole);
        if (cap) {
          const ch = fr((f + Math.abs(sv - W.sc) * 0.9) / 0.026);
          const lug = ss(0.08, 0.16, ch) * (1 - ss(0.56, 0.64, ch));
          const waist = ss(0.0, 0.012, f) * (1 - ss(0.055, 0.067, f));      // groove between heel block and forefoot
          st.h += lug * (1 - waist) * 1.1;
          over(st.c, lin([74, 64, 52]), (1 - lug * (1 - waist)) * 0.45);    // mud packed in the grooves
          st.ro = lerp(st.ro, 0.95, (1 - lug) * 0.6);
        } else {
          const cl = fr((u - 0.02) / W.uv.d / 0.018);
          const cleat = ss(0.12, 0.22, cl) * (1 - ss(0.62, 0.72, cl)) * (1 - ss(0.013, 0.018, yb));
          st.h += (cleat * 0.7 + ss(0.019, 0.025, yb) * 0.45) * sole;
          over(st.c, lin([70, 62, 52]), (1 - cleat) * (1 - ss(0.013, 0.018, yb)) * 0.4);
        }
      }
      if (!cap) {
        // mud rising unevenly from the sole (wet and dark at the bottom), splashed up the shaft
        const line = 0.05 + 0.085 * ss(-0.4, 0.55, N.fbm(P[0] * 3.5 + 7, P[1] * 1.2, P[2] * 3.5, 3)) + 0.02 * N.noise(P[0] * 16, P[1] * 6, P[2] * 16) + 0.03 * frontish;
        const mud = 1 - ss(line - 0.03, line + 0.015, yb);
        const caked = ss(-0.2, 0.5, N.fbm(P[0] * 55, P[1] * 55, P[2] * 55, 3));
        over(st.c, mix3(lin([66, 56, 44]), lin([104, 92, 72]), ss(0.0, 0.09, yb) * 0.7 + caked * 0.3), mud * (1 - sole * 0.5) * 0.9);
        st.ro = lerp(st.ro, lerp(0.7, 0.95, ss(0.0, 0.06, yb)), mud); st.h += mud * caked * 0.6;
        const spl = (1 - ss(0.05, 0.12, N.worley(P[0] * 34, P[1] * 34, P[2] * 34))) * (1 - ss(0.08, 0.42, yb)) * ss(0.0, 0.5, N.fbm(P[0] * 4, P[1] * 4, P[2] * 4, 2) + 0.35);
        over(st.c, lin([92, 80, 62]), spl * 0.8); st.ro = lerp(st.ro, 0.9, spl); st.h += spl * 0.35;
        // scuffs and grimy wipes
        const scuff = ss(0.62, 0.82, Math.abs(N.noise(P[0] * 26, P[1] * 120, P[2] * 26))) * ss(0.1, 0.5, N.fbm(P[0] * 5 + 2, P[1] * 5, P[2] * 5, 2) + 0.25);
        over(st.c, lin([104, 100, 94]), scuff * 0.45); st.ro = lerp(st.ro, 0.62, scuff);
        over(st.c, lin([128, 120, 104]), ss(0.5, 0.8, N.noise(P[0] * 20, P[1] * 6, P[2] * 20)) * 0.45);
        // blood: spray and drips down the shins and over the toes, dried brown-maroon, wet and glossy in places
        const spray = (1 - ss(0.04, 0.095, N.worley(P[0] * 46 + 3, P[1] * 46, P[2] * 46))) * ss(0.05, 0.5, N.fbm(P[0] * 3 + 8, P[1] * 3, P[2] * 3, 2) + 0.3) * (0.5 + 0.5 * frontish);
        const drip = ss(0.46, 0.72, N.noise(P[0] * 70, P[1] * 4.5, P[2] * 70)) * ss(0.0, 0.45, N.fbm(P[0] * 4 + 1, P[1] * 1.6, P[2] * 4, 2) + 0.25);
        const smear = ss(0.28, 0.5, N.fbm(P[0] * 5 + 11, P[1] * 3, P[2] * 5, 3)) * (0.35 + 0.65 * frontish);
        const bl = Math.min(1, spray * 0.95 + drip * 0.75 + smear * 0.7) * (1 - sole);
        if (bl > 0) {
          const wet = ss(0.25, 0.55, N.fbm(P[0] * 12 + 40, P[1] * 12, P[2] * 12, 2)) * ss(0.4, 0.8, bl);
          over(st.c, mix3(mix3(lin([84, 22, 16]), lin([56, 22, 16]), ss(-0.3, 0.4, N.noise(P[0] * 30, P[1] * 30, P[2] * 30))), lin([112, 14, 12]), wet), bl * 0.88);
          st.ro = lerp(st.ro, lerp(0.58, 0.14, wet), bl); st.h += bl * 0.08;
        }
        if (lip) { mul(st.c, [0.5, 0.48, 0.45], 1); st.ro = 0.85; }
      }
    });
    TR.snap('boots: painted', wellTex.albedo, bootPart);

    // ---------------------------------------------------------------- apron: heavy blue PVC, smeared, torn
    const AG = apronInfo.grid;
    const apronTex = paintPart(apronPart, { size: 1024, normalSize: 512, ormSize: 256, rough: 0.4, normalStrength: 2.2 }, (P, Nn, st, u, v) => {
      const strap = v > 0.82;
      set3(st.c, lin([62, 104, 124]));
      // uneven fade and wear: lighter scuffed patches, darker where it has been wet
      const f1 = N.fbm(P[0] * 5 + 1, P[1] * 5, P[2] * 5, 3);
      over(st.c, lin([96, 128, 140]), ss(0.0, 0.6, f1) * 0.45);
      mul(st.c, [0.8, 0.84, 0.88], ss(0.0, 0.6, -f1) * 0.5);
      const scuff = ss(0.7, 0.95, Math.abs(N.noise(P[0] * 140, P[1] * 22, P[2] * 140))) * ss(0.2, 0.6, N.fbm(P[0] * 6 + 4, P[1] * 6, P[2] * 6, 2) + 0.3);
      over(st.c, lin([150, 170, 176]), scuff * 0.35); st.h -= scuff * 0.3;
      // creases: horizontal folds in the bib where it bends over the gut, vertical folds in the skirt
      st.h += 0.6 * Math.abs(N.noise(P[0] * 6, P[1] * 34, P[2] * 6)) * ss(yWaist - 0.05, yTop, P[1]);
      st.h += 0.5 * Math.abs(N.noise(P[0] * 28, P[1] * 4, P[2] * 28)) * ss(yWaist, yCrotch - 0.1, P[1]);
      st.h += N.fbm(P[0] * 220, P[1] * 220, P[2] * 220, 2) * 0.05;
      st.ro = 0.44 + 0.14 * ss(0.0, 0.6, f1);
      // grime: the lower skirt and the edges darker and dull
      const low = ss(yCrotch, yBot, P[1]);
      over(st.c, lin([62, 70, 66]), low * 0.45 * ss(-0.2, 0.5, N.fbm(P[0] * 7, P[1] * 7, P[2] * 7, 3) + 0.3));
      st.ro = lerp(st.ro, 0.62, low * 0.5);
      // blood: wiped hand smears across the belly (diagonal strokes), splash spray, runs down from the smears,
      // a soaked hem; dried brown-maroon with wet glossy cores
      let bl = 0;
      const sm = N.noise(P[0] * 7 + P[1] * 4, P[1] * 2.5 - P[0] * 1.5, P[2] * 3) * 0.5 + 0.5;
      const stroke = ss(0.5, 0.64, sm) * ss(0.4, 0.75, Math.abs(N.noise(P[0] * 40 + P[1] * 30, P[1] * 4, 1.3))) * ss(yCrotch - 0.05, yWaist + 0.05, P[1]);
      bl = Math.max(bl, stroke * 0.95);
      const big = ss(0.3, 0.48, N.fbm(P[0] * 3.2 + 7, P[1] * 3.2, P[2] * 3.2, 4) + 0.14 * ss(yCrotch, yWaist + 0.1, P[1]));
      bl = Math.max(bl, big * 0.9);
      const dots = (1 - ss(0.05, 0.12, N.worley(P[0] * 34, P[1] * 34, P[2] * 34))) * ss(0.2, 0.7, N.fbm(P[0] * 3 + 2, P[1] * 3, P[2] * 3, 2) + 0.35);
      bl = Math.max(bl, dots * 0.9);
      const runs = ss(0.5, 0.78, N.noise(P[0] * 70, P[1] * 3, P[2] * 70)) * ss(0.35, 0.55, N.fbm(P[0] * 3 + 7, P[1] * 1.2, P[2] * 3, 3)) * (1 - ss(yTop - 0.15, yTop, P[1]));
      bl = Math.max(bl, runs * 0.85);
      bl = Math.max(bl, (1 - ss(yBot + 0.02, yBot + 0.12, P[1])) * ss(0.0, 0.5, N.fbm(P[0] * 9, P[1] * 9, P[2] * 9, 3) + 0.3) * 0.8);
      if (strap) bl *= 0.4;
      if (bl > 0) {
        const age = ss(-0.4, 0.4, N.noise(P[0] * 18 + 40, P[1] * 18, P[2] * 18));
        over(st.c, mix3(lin([92, 10, 10]), lin([52, 16, 12]), age), Math.min(1, bl) * 0.88);
        st.ro = lerp(st.ro, lerp(0.18, 0.5, age), bl);
        st.h += bl * 0.1;
      }
      // tears: a ragged hem, a long knife slash low on the left, a corner ripped away on the right
      if (!strap) {
        const hemV = 0.8 - (0.03 + 0.035 * N.fbm(u * 9, 1.7, 0.2, 3) + 0.012 * N.noise(u * 60, 3.1, 0.7));
        let cut = v > hemV;
        const sl = Math.abs((u - 0.68) * 0.9 - (v - 0.62) * 0.35 + 0.004 * N.noise(v * 80, 1.1, 0));
        if (sl < 0.01 + 0.004 * N.noise(v * 40, 2.2, 0) && v > 0.5 && v < 0.74) cut = true;
        if ((u < 0.18 && v > 0.66 + u * 0.5 + 0.02 * N.noise(u * 30, v * 30, 0)) ) cut = true;
        if (cut) st.a = 0;
        // frayed / stretched PVC at the cut edges is paler and torn
        const edge = 1 - ss(0.0, 0.02, hemV - v);
        over(st.c, lin([96, 136, 156]), edge * 0.3 * (1 - bl));
      }
      if (strap) mul(st.c, [0.85, 0.88, 0.9], 1);
    });
    TR.snap('apron: painted', apronTex.albedo, apronPart);

    // ---------------------------------------------------------------- tumour growths: wet, lobed, varied
    // Each bulb mixes two of four tissue palettes (yellowish necrotic, bruised purple, wet red, raw pink) by
    // lobe-scale noise; dark wet glossy crevices, paler stretched shiny lobe tops, a raised vein web, pus heads,
    // weeping streaks; at the base the skin's bruise colour with stretch striae. Stronger normal-map lobing.
    const PALS = [[[170, 150, 98], [112, 94, 56]], [[122, 76, 116], [70, 38, 74]], [[158, 54, 50], [98, 22, 28]], [[178, 112, 114], [122, 62, 72]]].map((p) => p.map(lin));
    const bulbPal = [[1, 2], [0, 2], [2, 3], [1, 3], [0, 1], [3, 2], [1, 0], [0, 3]];
    const tumTex = paintPart(growPart, { size: 512, normalSize: 512, ormSize: 256, rough: 0.35, normalStrength: 3.4 }, (P, Nn, st) => {
      let bi = 0, bd = 9;
      bulbs.forEach((b, k) => { const d = dist(P, b.c) / b.r; if (d < bd) { bd = d; bi = k; } });
      const B0 = bulbs[bi], pal = bulbPal[bi % bulbPal.length];
      const outside = -insideBody(P);                     // distance out of the skin: the base blends into it
      const lobe = N.fbm(P[0] * 26, P[1] * 26, P[2] * 26, 3);
      const pm = ss(-0.3, 0.35, N.fbm(P[0] * 11 + bi * 3.1, P[1] * 11, P[2] * 11, 2));
      const A0 = PALS[pal[0]], A1 = PALS[pal[1]];
      const hi = mix3(A0[0], A1[0], pm), lo = mix3(A0[1], A1[1], pm);
      set3(st.c, mix3(hi, lo, ss(-0.3, 0.45, lobe)));
      // dark wet crevices between the lobes (glossy), paler stretched tops (shiny)
      const crev = 1 - ss(0.02, 0.11, Math.abs(N.noise(P[0] * 34, P[1] * 34, P[2] * 34)));
      over(st.c, lin([44, 14, 22]), crev * 0.75); st.h -= crev * 1.4; st.ro = lerp(st.ro, 0.12, crev);
      const top = ss(0.2, 0.6, lobe);
      over(st.c, mix3(hi, lin([206, 184, 176]), 0.35), top * 0.4); st.h += top * 1.2; st.ro = lerp(st.ro, 0.26, top);
      // vein web
      const vr = ss(0.62, 0.85, N.ridged(P[0] * 40, P[1] * 40, P[2] * 40, 3));
      over(st.c, lin([54, 24, 60]), vr * 0.75); st.h += vr * 1.0;
      // pus heads / cysts
      const wv = N.worley(P[0] * 70, P[1] * 70, P[2] * 70);
      const pus = (1 - ss(0.0, 0.22, wv)) * ss(0.0, 0.5, N.noise(P[0] * 15, P[1] * 15, P[2] * 15) + 0.2);
      over(st.c, lin([200, 178, 100]), pus * 0.85); st.h += pus * 1.2; st.ro = lerp(st.ro, 0.18, pus);
      // weeping: wet, blood-dark streaks running down
      const weep = ss(0.55, 0.8, N.noise(P[0] * 50, P[1] * 6, P[2] * 50)) * ss(0.0, 0.4, N.fbm(P[0] * 6, P[1] * 6, P[2] * 6, 2) + 0.2);
      over(st.c, lin([70, 10, 14]), weep * 0.7); st.ro = lerp(st.ro, 0.12, weep);
      // base: grows out of the bruised skin, stretch striae radiating from it
      const base = 1 - ss(0.002, 0.03, outside);
      over(st.c, lin([146, 92, 98]), base * 0.6); st.ro = lerp(st.ro, 0.45, base * 0.5);
      {
        const t1 = norm(cross(B0.n, Math.abs(B0.n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), t2 = cross(B0.n, t1), d = sub(P, B0.c);
        const th = Math.atan2(dot(d, t2), dot(d, t1));
        const str = ss(0.86, 0.98, Math.abs(Math.sin(th * 9 + 3 * N.noise(P[0] * 18, P[1] * 18, P[2] * 18)))) * (1 - ss(0.0, 0.025, outside));
        over(st.c, lin([190, 160, 156]), str * 0.3); st.h -= str * 0.3;
      }
      st.h += N.fbm(P[0] * 120, P[1] * 120, P[2] * 120, 2) * 0.15;
      st.ro += 0.05 * N.noise(P[0] * 60, P[1] * 60, P[2] * 60);
    });

    // ---------------------------------------------------------------- pauldron: oil-drum steel, chipped red paint, rust
    const PI = plateInfo;
    const rivets = [];
    for (const [i, j] of [[1, 1], [PI.NU - 2, 1], [1, PI.NV - 2], [PI.NU - 2, PI.NV - 2], [(PI.NU / 2) | 0, 1]]) rivets.push(PI.grid[j][i]);
    const plateTex = paintPart(platePart, { size: 512, normalSize: 512, ormSize: 256, rough: 0.5, normalStrength: 2.4 }, (P, Nn, st, u, v) => {
      const rim = v > 0.85;
      set3(st.c, lin([92, 90, 86])); st.me = 0.85; st.ro = 0.45;          // bare steel
      const paint = ss(-0.05, 0.15, N.fbm(P[0] * 18 + 2, P[1] * 18, P[2] * 18, 4) + 0.1) * (rim ? 0.2 : 1);
      over(st.c, mix3(lin([150, 52, 32]), lin([118, 44, 30]), ss(-0.3, 0.4, N.noise(P[0] * 30, P[1] * 30, P[2] * 30))), paint);   // faded red drum paint
      st.me = lerp(st.me, 0, paint); st.ro = lerp(st.ro, 0.7, paint); st.h += paint * 0.25;
      // a stencilled white band (the drum's hoop stripe), mostly chipped
      const band = (1 - ss(0.012, 0.018, Math.abs(dot(sub(P, PI.C), PI.e1) * 0.4 + dot(sub(P, PI.C), PI.e2) - 0.05))) * paint * ss(-0.1, 0.3, N.noise(P[0] * 40, P[1] * 40, P[2] * 40));
      over(st.c, lin([186, 180, 164]), band * 0.8);
      const rust = ss(0.0, 0.5, N.fbm(P[0] * 30 + 9, P[1] * 30, P[2] * 30, 4) + 0.1 + (rim ? 0.3 : 0)) * (1 - paint * 0.6);
      over(st.c, mix3(lin([122, 62, 30]), lin([72, 38, 22]), ss(-0.3, 0.4, N.noise(P[0] * 80, P[1] * 80, P[2] * 80))), rust * 0.85);
      st.me = lerp(st.me, 0.1, rust); st.ro = lerp(st.ro, 0.88, rust); st.h += rust * 0.4 + N.fbm(P[0] * 160, P[1] * 160, P[2] * 160, 2) * 0.25 * rust;
      // scratches through the paint (bright steel)
      const scr = ss(0.8, 0.95, Math.abs(N.noise(P[0] * 260, P[1] * 30, P[2] * 260))) * ss(0.1, 0.5, N.fbm(P[0] * 5, P[1] * 5, P[2] * 5, 2) + 0.3);
      over(st.c, lin([150, 148, 142]), scr * 0.7); st.me = lerp(st.me, 0.9, scr); st.ro = lerp(st.ro, 0.3, scr); st.h -= scr * 0.3;
      // rivet heads
      for (const r of rivets) { const d = dist(P, r); if (d < 0.012) { const k = 1 - ss(0.006, 0.011, d); set3(st.c, mix3(lin([110, 104, 96]), lin([100, 56, 30]), 0.5)); st.me = 0.6; st.ro = 0.5; st.h += k * 2; } }
      // blood smeared on it and dried
      const b = ss(0.45, 0.62, N.fbm(P[0] * 6 + 3, P[1] * 6, P[2] * 6, 3));
      over(st.c, lin([56, 14, 10]), b * 0.75); st.me = lerp(st.me, 0, b); st.ro = lerp(st.ro, 0.55, b);
    });

    // ---------------------------------------------------------------- chains + shackle: rusty iron
    const chainTex = paintPart(chainPart, { size: 512, normalSize: 256, ormSize: 128, rough: 0.5, normalStrength: 2.5 }, (P, Nn, st, u, v) => {
      set3(st.c, lin([88, 84, 80])); st.me = 0.85; st.ro = 0.4;
      const rust = ss(0.0, 0.45, N.fbm(P[0] * 40, P[1] * 40, P[2] * 40, 4) + 0.15);
      over(st.c, mix3(lin([126, 66, 32]), lin([78, 42, 24]), ss(-0.3, 0.4, N.noise(P[0] * 90, P[1] * 90, P[2] * 90))), rust * 0.85);
      st.me = lerp(0.85, 0.15, rust); st.ro = lerp(0.4, 0.86, rust);
      st.h = rust * 0.6 + N.fbm(P[0] * 150, P[1] * 150, P[2] * 150, 2) * 0.3 * rust;
      const b = ss(0.4, 0.62, N.fbm(P[0] * 12 + 4, P[1] * 12, P[2] * 12, 3));
      over(st.c, lin([56, 14, 10]), b * 0.7); st.me = lerp(st.me, 0.05, b); st.ro = lerp(st.ro, 0.55, b);
      // the shackle's inner face is worn bright by the wrist
      if (v > 0.895 && v < 0.98 && u < 0.5) { over(st.c, lin([140, 136, 130]), 0.5); st.me = 0.9; st.ro = 0.3; }
    });

    // ---------------------------------------------------------------- ambient occlusion -> ORM only
    {
      const baseS = nsurf(h.basePart({ name: 'ao' }));
      const RA = texSize(512);
      const occ = makeBVH([surf(fullBody), surf(suit), surf(bootPart), surf(apronPart), surf(chainPart), surf(platePart), surf(growPart)]).bvh;
      const ao = bakeField(baseS, h.baseObj.uvs, RA, occTracer(occ, { rays: 16, maxDist: 0.1 }));
      applyOcclusion(skin.orm, [ao], RA, (a) => lerp(1, a, 0.85));
      const one = (part, list, R, md = 0.08, k = 0.8) => {
        const o = makeBVH(list).bvh;
        return { f: bakeField(nsurf(part), part.obj.uvs, R, occTracer(o, { rays: 12, maxDist: md })), R, k };
      };
      for (const [tex, part, list] of [
        [apronTex, apronPart, [surf(apronPart), surf(chainPart), surf(fullBody), surf(suit)]],
        [cloth, suit, [surf(suit), surf(apronPart), surf(fullBody), surf(bootPart)]],
        [tumTex, growPart, [surf(growPart), surf(fullBody), surf(apronPart), surf(chainPart)]],
        [plateTex, platePart, [surf(platePart), surf(fullBody), surf(chainPart)]],
        [wellTex, bootPart, [surf(bootPart), surf(suit), surf(apronPart)]],
      ]) {
        const r = one(part, list, texSize(256));
        applyOcclusion(tex.orm, [r.f], r.R, (a) => lerp(1, a, r.k));
      }
    }

    // ---------------------------------------------------------------- materials
    bodyLow.material = lib.material('skin', { ...skin });
    suit.material = lib.material('cloth', { ...cloth, alpha: false });
    bootPart.material = lib.material('cloth', { ...wellTex, doubleSided: true });
    apronPart.material = lib.material('cloth', { ...apronTex, alpha: apronTex.alpha, doubleSided: true, pngBits: 6 });
    growPart.material = lib.material('gore', { ...tumTex });
    platePart.material = lib.material('gear', { ...plateTex, doubleSided: true });
    chainPart.material = lib.material('gear', { ...chainTex });
    // eyes: small deep-red glowing irises (20 % smaller than the source texture's), a dark limbal ring, a
    // bloodshot yellowed sclera; the glow is a deep red (~0.55 / 0.06 / 0.04 linear) that stays a pinpoint at 15 m
    // instead of the old saturated orange disc with a red dot
    const eyeSrc = await lib.texture('system', 'eyes/materials/brown_eye.png', 256);
    const eyeAlb = lib.cloneImage(eyeSrc), ES = eyeSrc.width;
    const eyeEm = createImage(ES, ES, [0, 0, 0, 255]);
    const irisC = [];
    {
      // the source's two iris discs: its saturated pixels, split along the diagonal
      const acc = [[0, 0, 0], [0, 0, 0]];
      for (let y = 0; y < ES; y++) for (let x = 0; x < ES; x++) {
        const i = (y * ES + x) * 4, r = eyeSrc.data[i], g = eyeSrc.data[i + 1], b = eyeSrc.data[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        if (mx > 20 && (mx - mn) / mx > 0.5 && r < 200) { const k = x > y ? 0 : 1; acc[k][0] += x; acc[k][1] += y; acc[k][2]++; }
      }
      for (const a of acc) irisC.push([a[0] / Math.max(1, a[2]), a[1] / Math.max(1, a[2])]);
    }
    const R0 = 29.5 * ES / 256, RI = R0 * 0.8, RP = RI * 0.3;
    const sclera = lin([178, 156, 108]);
    const ec = [0, 0, 0];
    for (let y = 0; y < ES; y++) for (let x = 0; x < ES; x++) {
      const i = (y * ES + x) * 4;
      let k = 0, dmin = 1e9;
      irisC.forEach(([cx, cy], kk) => { const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (d < dmin) { dmin = d; k = kk; } });
      const dn = dmin / RI, ang = Math.atan2(y + 0.5 - irisC[k][1], x + 0.5 - irisC[k][0]);
      ec[0] = S2L[eyeSrc.data[i]]; ec[1] = S2L[eyeSrc.data[i + 1]]; ec[2] = S2L[eyeSrc.data[i + 2]];
      // sclera: the source's eyeball shading as a luminance ratio over a yellowed base (inside the old iris: flat)
      const shade = dmin < R0 * 1.08 ? 1 : Math.min(1.15, lum(ec) / 0.62);
      for (let q = 0; q < 3; q++) ec[q] = sclera[q] * shade;
      // bloodshot: capillaries radiating from the corners towards the iris, redder at the limbus
      const vein = N.ridged(x / ES * 36 + k * 7, y / ES * 36, 0.7, 3) * ss(1.1, 2.2, dn);
      over(ec, lin([150, 26, 22]), ss(0.55, 0.82, vein) * 0.85);
      over(ec, lin([160, 70, 52]), (1 - ss(1.0, 1.7, dn)) * 0.45);
      // limbal ring, iris fibres, pupil
      const limb = ss(0.8, 0.95, dn) * (1 - ss(1.05, 1.22, dn));
      over(ec, lin([34, 8, 8]), limb * 0.92);
      const fib = 0.6 + 0.4 * ss(-0.4, 0.6, N.noise(Math.cos(ang) * 6 + k * 9, Math.sin(ang) * 6, dn * 2.5));
      const iris = 1 - ss(0.86, 0.98, dn);
      over(ec, mix3(lin([128, 16, 12]), lin([70, 8, 8]), ss(0.3, 0.9, dn)), iris * 0.95);
      const pup = 1 - ss(RP / RI * 0.85, RP / RI * 1.15, dn);
      over(ec, lin([16, 4, 4]), pup);
      eyeAlb.data[i] = toByte(ec[0]); eyeAlb.data[i + 1] = toByte(ec[1]); eyeAlb.data[i + 2] = toByte(ec[2]);
      const e = Math.max(iris * fib * (0.75 - 0.25 * ss(0.4, 0.9, dn)), pup);
      eyeEm.data[i] = toByte(0.55 * e); eyeEm.data[i + 1] = toByte(0.06 * e); eyeEm.data[i + 2] = toByte(0.04 * e);
    }
    eyes.material = lib.material('eye', { albedo: eyeAlb, emissiveMap: eyeEm, emissive: [1, 1, 1], roughness: 0.12 });
    teeth.material = lib.material('teeth', {
      albedo: lib.grungeTexture(await lib.texture(teeth.asset.textures.diffuse, 512), { seed: 9, tint: [0.9, 0.78, 0.56], darken: 0.04, dirt: 0.4, blood: 0.45, freq: 12 }),
      orm: createImage(64, 64, [150, 110, 0, 255]),
    });
  }
  eyes.extras.noSimplify = true;
  for (const p of parts) console.log(`${TAG} part ${p.name.padEnd(10)} ${p.triCount()} tris`);

  // ---------------------------------------------------------------- scale to full size, lift onto the soles
  const S = REST_HEIGHT / h.height;
  scaleCharacter(h, parts, S);
  const LIFT = -bootSole * S + 0.004;
  liftCharacter(h, parts, LIFT);
  console.log(`${TAG} scale ${S.toFixed(3)} lift ${LIFT.toFixed(3)} height ${h.height.toFixed(3)}`);

  // ---------------------------------------------------------------- hitboxes (full size): capsules [bone, r, toBone]
  // The game takes the capsule a bullet ray enters FIRST, so the head (the weak point) must not sit inside a
  // neighbour's end cap: the upper torso is a HORIZONTAL capsule across the chest / shoulder blades whose top stays
  // under the chin, the huge trapezius slopes beside the small head get their own thin capsules, the gut a vertical
  // one in front of the spine, and the tumour mass its own (body damage). Leaf helper bones (no skin weights) carry
  // the end points. Radii: a percentile of the distances of the vertices each capsule owns (dominant bone; the
  // hanging shackle chain, the apron sheet and the eyes / teeth excluded) to its segment.
  const hitboxes = {}, capsules = {};
  {
    const bones = h.skeleton.bones, byName = h.skeleton.byName;
    const BP = (n) => byName[n].head.clone();
    const toFull = (p) => [p[0] * S, p[1] * S + LIFT, p[2] * S];
    const ownerOf = (bn) => {
      if (bn === 'head') return 'head';
      if (bn === 'neck_01') return 'neck';
      if (bn === 'spine_03' || bn.startsWith('clavicle')) return 'chest';
      if (bn === 'spine_01' || bn === 'spine_02') return 'belly';
      if (bn === 'pelvis' || bn === 'Root') return 'pelvis';
      if (/^(hand|thumb|index|middle|ring|pinky)/.test(bn)) return bn.endsWith('_l') ? 'hand_l' : 'hand_r';
      if (bn.startsWith('ball')) return 'foot' + bn.slice(4);
      return bn;
    };
    const owned = {};
    const P3 = (part, v) => new THREE.Vector3(part.pos[v * 3], part.pos[v * 3 + 1], part.pos[v * 3 + 2]);
    for (const part of [bodyLow, suit, bootPart, platePart]) {
      for (const v of new Set(Array.from(part.tris()).filter((_, i) => i % 2 === 0))) (owned[ownerOf(bones[part.weights[v][0][0]].name)] ||= []).push(P3(part, v));
    }
    const tumV = [];
    for (const v of new Set(Array.from(growPart.tris()).filter((_, i) => i % 2 === 0))) tumV.push(P3(growPart, v));
    const dSeg = (p, a, b) => new THREE.Line3(a, b).closestPointToPoint(p, true, new THREE.Vector3()).distanceTo(p);
    const pct = (a, q) => { const s2 = [...a].sort((x, y) => x - y); return s2[Math.min(s2.length - 1, Math.floor(s2.length * q))]; };
    const rad = (list, a, b, q = 0.8) => pct(list.map((p) => dSeg(p, a, b)), q);
    // head: skull base -> a helper one radius under the crown
    const headV = owned.head;
    const top = Math.max(...headV.map((p) => p.y));
    const hc = headV.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / headV.length);
    let rHead = 0.13;
    for (let it = 0; it < 3; it++) {
      const a = BP('head'), b = new THREE.Vector3(hc.x, top - rHead, hc.z);
      rHead = Math.min(0.16, Math.max(0.11, rad(headV, a, b, 0.85)));
    }
    addHelperBone(h, 'head_top', 'head', [hc.x, top - rHead, hc.z]);
    // chest: horizontal capsule; its top under the chin (the mouth minus 6 cm)
    const chinY = toFull(A.mouth)[1] - 0.06;
    const chestV = owned.chest;
    const s3 = BP('spine_03'), cz = chestV.reduce((a, p) => a + p.z, 0) / chestV.length;
    const shX = Math.abs(BP('upperarm_l').x);
    let rC = 0.26, yc = s3.y;
    for (let it = 0; it < 4; it++) {
      yc = Math.min(s3.y + 0.12, chinY - rC);
      const half = Math.max(0.05, shX - rC * 0.6);
      rC = Math.min(0.34, Math.max(0.2, rad(chestV.filter((p) => p.y < chinY + 0.05), new THREE.Vector3(-half, yc, cz), new THREE.Vector3(half, yc, cz), 0.82)));
    }
    const halfC = Math.max(0.05, shX - rC * 0.6);
    addHelperBone(h, 'chest_r', 'spine_03', [-halfC, yc, cz]);
    addHelperBone(h, 'chest_l', 'spine_03', [halfC, yc, cz]);
    // trapezius slopes beside the head: from 35 % along the collarbone (a capsule from its root put a 16 cm end cap
    // right behind the skull: almost no head hits from behind) to the shoulder joint
    const trapR = {};
    for (const s of ['l', 'r']) {
      const a = BP(`clavicle_${s}`).lerp(BP(`upperarm_${s}`), 0.35).add(new THREE.Vector3(0, 0.05, 0)), b = BP(`upperarm_${s}`);   // lifted onto the yoke
      addHelperBone(h, `trap_${s}_in`, `clavicle_${s}`, a.toArray());
      const above = chestV.filter((p) => p.y > yc + rC * 0.5 && Math.sign(p.x) === (s === 'l' ? 1 : -1));
      trapR[s] = Math.min(0.14, Math.max(0.08, above.length ? rad(above, a, b, 0.7) : 0.1));
    }
    // gut: vertical segment through the belly vertices, in front of the spine, under the chest capsule
    const bellyV = owned.belly;
    const gz = bellyV.reduce((a, p) => a + p.z, 0) / bellyV.length;
    const s1 = BP('spine_01');
    const gLo = new THREE.Vector3(0, s1.y, gz);
    // (its top end cap stays under the chest capsule's centre line: the gut must not catch chest shots)
    let rG = Math.min(0.36, rad(bellyV, gLo, new THREE.Vector3(0, yc, gz), 0.8));
    const gHi = new THREE.Vector3(0, Math.max(gLo.y + 0.05, yc - rG - 0.02), gz);
    rG = Math.min(0.36, rad(bellyV, gLo, gHi, 0.8));
    addHelperBone(h, 'gut_lo', 'spine_01', gLo.toArray());
    addHelperBone(h, 'gut_hi', 'spine_01', gHi.toArray());
    // tumour mass: from the top-of-trapezius bulb to the shoulder-blade bulb
    // (its upper end 5 cm lower and 3 cm further out than the top bulb's centre, radius <= 17 cm: the old 20 cm cap
    // at the bulb hid the back of the head)
    const tA0 = toFull(bulbs[0].c), tB = toFull(bulbs[1].c);
    const tA = [tA0[0] - 0.03, tA0[1] - 0.05, tA0[2]];
    const rT = Math.min(0.17, Math.max(0.1, rad(tumV, new THREE.Vector3(...tA), new THREE.Vector3(...tB), 0.8)));
    addHelperBone(h, 'tumour_a', 'clavicle_r', tA);
    addHelperBone(h, 'tumour_b', 'spine_03', tB);
    addHelperBone(h, 'pelvis_top', 'pelvis', BP('pelvis').lerp(BP('spine_01'), 0.5).toArray());
    const HB = {
      head: ['head', rHead, 'head_top'], neck: ['neck_01', 0.085, 'head'], chest: ['chest_r', rC, 'chest_l'],
      trap_l: ['trap_l_in', trapR.l, 'upperarm_l'], trap_r: ['trap_r_in', trapR.r, 'upperarm_r'], tumour: ['tumour_a', rT, 'tumour_b'],
      belly: ['gut_lo', rG, 'gut_hi'], pelvis: ['pelvis', null, 'pelvis_top'],
      upperarm_l: ['upperarm_l', null, 'lowerarm_l'], lowerarm_l: ['lowerarm_l', null, 'hand_l'], hand_l: ['hand_l', null, 'middle_01_l'],
      upperarm_r: ['upperarm_r', null, 'lowerarm_r'], lowerarm_r: ['lowerarm_r', null, 'hand_r'], hand_r: ['hand_r', null, 'middle_01_r'],
      thigh_l: ['thigh_l', null, 'calf_l'], calf_l: ['calf_l', null, 'foot_l'], foot_l: ['foot_l', null, 'ball_l'],
      thigh_r: ['thigh_r', null, 'calf_r'], calf_r: ['calf_r', null, 'foot_r'], foot_r: ['foot_r', null, 'ball_r'],
    };
    const clampR = { pelvis: [0.15, 0.32], hand_l: [0.06, 0.1], hand_r: [0.06, 0.1], foot_l: [0.06, 0.1], foot_r: [0.06, 0.1], upperarm_l: [0.08, 0.17], upperarm_r: [0.08, 0.17], lowerarm_l: [0.07, 0.13], lowerarm_r: [0.07, 0.13], thigh_l: [0.1, 0.22], thigh_r: [0.1, 0.22], calf_l: [0.07, 0.15], calf_r: [0.07, 0.15] };
    for (const [name, [b0, r0, b1]] of Object.entries(HB)) {
      const a = BP(b0), b = BP(b1);
      let r = r0;
      if (r === null) { const lst = owned[name] || []; r = lst.length ? rad(lst, a, b, 0.8) : 0.1; const c = clampR[name]; if (c) r = Math.max(c[0], Math.min(c[1], r)); }
      hitboxes[name] = [b0, +r.toFixed(3), b1];
      capsules[name] = { bone: b0, to: b1, radius: +r.toFixed(3), length: +a.distanceTo(b).toFixed(3) };
    }
    console.log(`${TAG} hitboxes ${Object.entries(hitboxes).map(([k, v]) => `${k}:${v[1]}`).join(' ')}; chest y ${yc.toFixed(2)} chin ${chinY.toFixed(2)}`);
    // self-check (rest pose): which capsule does a ray enter first?
    const caps = Object.entries(hitboxes).map(([name, [b0, r, b1]]) => ({ name, a: BP(b0), b: BP(b1), r }));
    const first = (o, d) => {
      let best = null;
      for (const c of caps) for (let t = 0; t < 12; t += 0.005) { const p = o.clone().addScaledVector(d, t); if (dSeg(p, c.a, c.b) <= c.r) { if (!best || t < best.t) best = { t, name: c.name }; break; } }
      return best?.name;
    };
    const eye = toFull(lerp3(A.eyeL, A.eyeR, 0.5));
    const tests = {
      'face (front)': [[eye[0], eye[1], 6], [0, 0, -1]], 'mouth (front)': [[0, toFull(A.mouth)[1], 6], [0, 0, -1]],
      'head (side)': [[6, eye[1] + 0.03, hc.z], [-1, 0, 0]], 'head (back)': [[0, eye[1] + 0.03, -6], [0, 0, 1]],
      'face from 1.7 m eye height at 8 m': [[0, 1.7, 8], new THREE.Vector3(0, eye[1] - 1.7, eye[2] - 8).normalize().toArray()],
      'sternum (front)': [[0, s3.y, 6], [0, 0, -1]], 'gut (front)': [[0, s1.y + 0.1, 6], [0, 0, -1]],
      'tumour (behind)': [[tB[0], tB[1], -6], [0, 0, 1]], 'trapezius (front)': [[0.2, chinY + 0.04, 6], [0, 0, -1]],
    };
    // head seen from a 1.7 m eye at 4 m (front / behind): share of the rays aimed at the head capsule that enter it
    // first
    const headShare = (zc) => {
      const a = BP('head'), b = BP('head_top');
      let n = 0, ok = 0;
      for (let i = -4; i <= 4; i++) for (let j = -2; j <= 6; j++) {
        const tgt = new THREE.Vector3(hc.x + i * rHead / 4.5, a.y + j * (b.y - a.y + rHead) / 6, hc.z);
        const o = new THREE.Vector3(hc.x, 1.7, hc.z + zc), d = tgt.clone().sub(o).normalize();
        let hitsHead = false;
        for (let t = 0; t < 8; t += 0.01) if (dSeg(o.clone().addScaledVector(d, t), a, b) <= rHead) { hitsHead = true; break; }
        if (!hitsHead) continue;
        n++; if (first(o, d) === 'head') ok++;
      }
      return n ? Math.round(ok / n * 100) : 0;
    };
    console.log(`${TAG} head capsule first-hit share from a 1.7 m eye at 4 m: front ${headShare(4)} %, behind ${headShare(-4)} %`);
    console.log(`${TAG} first capsule hit: ${Object.entries(tests).map(([k, [o, d]]) => `${k} -> ${first(new THREE.Vector3(...o), new THREE.Vector3(...d))}`).join('; ')}`);
  }

  // Pose offsets (local euler deg, added after every clip): the library walks are a walker's lurching hunch, which
  // folds this giant over. The spine is partly straightened (chest out, a heavy upright mass), the shoulders hiked
  // forward (the right one higher under the tumour mass) and the hands half-closed.
  // The neck / head lift is small (-4 / -3): the game multiplies these onto EVERY clip, and the old -14 / -12
  // (41 deg with the spine) tipped the face to the sky in the rest pose, idle, the deaths and the charge's run.
  const poseOffsets = {
    spine_01: [-5, 0, 0], spine_02: [-7, 0, 0], spine_03: [-3, 0, 0], neck_01: [-4, 0, 0], head: [-3, 0, 2],
    clavicle_l: [0, 0, -5], clavicle_r: [0, 0, 8],
  };
  // One global set cannot suit both the clips' 30-deg hunched shambles and the upright run / idle: the walks hang the
  // small head below the shoulder line. Per-clip OVERRIDES of poseOffsets entries (same format) for the game to apply
  // while that clip dominates (manager.js applies only poseOffsets so far): the old neck / head lift, walks only.
  const walkLift = { neck_01: [-12, 0, 0], head: [-10, 0, 4] };
  const poseOffsetsByClip = { walk_a: walkLift, walk_b: walkLift, walk_c: walkLift, walk_limp: walkLift };
  for (const s of ['l', 'r']) for (const f of ['index', 'middle', 'ring', 'pinky']) Object.assign(poseOffsets, { [`${f}_01_${s}`]: [35, 0, 0], [`${f}_02_${s}`]: [40, 0, 0], [`${f}_03_${s}`]: [30, 0, 0] });
  TR.report();
  return {
    human: h, parts, budget: 9000, partBudget: { trousers: 900, teeth: 170 },
    extras: { poseOffsets, poseOffsetsByClip, hitboxes, capsules, archetype: 'brute', gender: 'male', variant: 'hulking slaughterhouse brute: tumour-swollen right shoulder, blue PVC apron, scrap-steel pauldron, chains, white rubber boots' },
    // LOD1 (> 22 m): the chains (a few pixels there) go, every other part is simplified (custom parts too)
    lod1: { budget: 2500, drop: ['teeth', 'chains'], texScale: 0.5, partBudget: { body: 1150, trousers: 290, boots: 230, tumours: 190, pauldron: 160, apron: 190 } },
  };
}
