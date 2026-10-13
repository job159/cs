// boss_butcher — 屠宰者 THE BUTCHER, round-5 mid-boss (game/src/zombies/brains/butcher.js), 4 m tall.
// Fat, hunched, sack-hooded giant; right forearm grown into a bone cleaver; chains and meat hooks; glowing back tumour.
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { boneSegment, buildSkeleton } from '../lib/rig.mjs';
import { rasterUV, texelSurface } from '../lib/raster.mjs';
import { blurField, normalFromHeight, createImage } from '../lib/image.mjs';

// ---------------------------------------------------------------- small vector helpers (arrays)
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
const S2L = new Float32Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const lin = (rgb) => rgb.map((v) => S2L[v]);
const col = (rgb) => [...lin(rgb), 1];

// ---------------------------------------------------------------- painting helpers (linear light, sRGB storage)
const texSize = (s) => Math.max(64, Math.round(s * +(process.env.ZOMBIE_TEX_SCALE || 1)));
const toByte = (x) => { x = Math.max(0, x); const s = x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(s * 255))); };
const over = (c, k, a) => { if (!(a > 0)) return; a = Math.min(1, a); for (let i = 0; i < 3; i++) c[i] += (k[i] - c[i]) * a; };
const mul = (c, k, a) => { if (!(a > 0)) return; a = Math.min(1, a); for (let i = 0; i < 3; i++) c[i] *= 1 + (k[i] - 1) * a; };
const lum = (c) => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
const hash = (i) => { let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

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
    out.data[di] = img.data[si]; out.data[di + 1] = img.data[si + 1]; out.data[di + 2] = img.data[si + 2]; out.data[di + 3] = img.data[si + 3];
  }
  return resize(out, size, size);
}

/** Closest-point parameter t (0 head .. 1 tail, unclamped) and distance from P to a bone's head->tail segment. */
function boneSeg(bone) {
  const a = [bone.head.x, bone.head.y, bone.head.z], b = [bone.tail.x, bone.tail.y, bone.tail.z];
  const d = sub(b, a), dd = dot(d, d);
  return (P) => {
    const t = dot(sub(P, a), d) / dd;
    const tc = clamp01(t);
    return { t, d: Math.hypot(P[0] - a[0] - d[0] * tc, P[1] - a[1] - d[1] * tc, P[2] - a[2] - d[2] * tc) };
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
 * (roughness), st.me (metalness), st.a (alpha, < 0.5 = cut), st.e (emissive rgb 0..1), st.ao.
 * -> { albedo, normal, orm, emissiveMap, alpha }
 */
function paintPart(part, o, fn) {
  const S = texSize(o.size);
  const tris = part.tris(), nrm = part.normals();
  const r = rasterUV(tris, part.obj.uvs, S, o.pad ?? 6);
  const albedo = createImage(S, S, [0, 0, 0, 255]);
  const H = new Float32Array(S * S), RO = new Float32Array(S * S).fill(o.rough ?? 0.8), ME = new Float32Array(S * S), AO = new Float32Array(S * S).fill(1);
  const EM = o.emissive ? new Float32Array(S * S * 3) : null;
  const P = [0, 0, 0], Nn = [0, 0, 0];
  const st = { c: [0, 0, 0], h: 0, ro: 0, me: 0, a: 1, e: [0, 0, 0], ao: 1 };
  let anyCut = false;
  for (let i = 0; i < S * S; i++) {
    if (!texelSurface(r, tris, part.pos, nrm, i, P, Nn)) continue;
    st.c[0] = st.c[1] = st.c[2] = 0.5; st.h = 0; st.ro = o.rough ?? 0.8; st.me = 0; st.a = 1; st.e[0] = st.e[1] = st.e[2] = 0; st.ao = 1;
    // u, v in the parts' own (OBJ, v up) uv convention: texel row 0 is v = 1
    fn(P, Nn, st, ((i % S) + 0.5) / S, 1 - (((i / S) | 0) + 0.5) / S, i);
    const d = i * 4;
    albedo.data[d] = toByte(st.c[0]); albedo.data[d + 1] = toByte(st.c[1]); albedo.data[d + 2] = toByte(st.c[2]);
    if (st.a < 0.5) { albedo.data[d + 3] = 0; anyCut = true; }
    H[i] = st.h; RO[i] = st.ro; ME[i] = st.me; AO[i] = st.ao;
    if (EM) { EM[i * 3] = st.e[0]; EM[i * 3 + 1] = st.e[1]; EM[i * 3 + 2] = st.e[2]; }
  }
  const NS = texSize(o.normalSize ?? o.size);
  const hS = NS === S ? H : downField(H, S, NS);
  const normal = normalFromHeight(o.hBlur ? blurField(hS, NS, NS, o.hBlur, 1) : hS, NS, NS, (o.normalStrength ?? 2) * NS / 1024);
  const OS = texSize(o.ormSize ?? Math.min(o.size, 512));
  const orm = createImage(OS, OS, [255, 200, 0, 255]);
  const rS = downField(RO, S, OS), mS = downField(ME, S, OS), aS = downField(AO, S, OS);
  for (let i = 0; i < OS * OS; i++) {
    orm.data[i * 4] = Math.round(clamp01(aS[i]) * 255); orm.data[i * 4 + 1] = Math.round(clamp01(rS[i]) * 255); orm.data[i * 4 + 2] = Math.round(clamp01(mS[i]) * 255);
  }
  let emissiveMap = null;
  if (EM) {
    const ES = texSize(o.emissiveSize ?? 256);
    const e = downField(EM, S, ES, 3);
    emissiveMap = createImage(ES, ES, [0, 0, 0, 255]);
    for (let i = 0; i < ES * ES; i++) for (let c = 0; c < 3; c++) emissiveMap.data[i * 4 + c] = toByte(e[i * 3 + c]);
  }
  return { albedo, normal, orm, emissiveMap, alpha: anyCut, raster: r, S };
}

/** Evaluates fn(P, N, i) on a UV raster of `surf` ({tris, pos, nrm}) -> Float32 field (fill outside islands). */
function bakeField(surf, uvs, R, fn, { fill = 1, blur = 1 } = {}) {
  const r = rasterUV(surf.tris, uvs, R, 4);
  const out = new Float32Array(R * R).fill(fill);
  const P = [0, 0, 0], Nn = [0, 0, 0];
  for (let i = 0; i < R * R; i++) if (texelSurface(r, surf.tris, surf.pos, surf.nrm, i, P, Nn)) out[i] = fn(P, Nn, i);
  return blur ? blurField(out, R, R, blur, 1) : out;
}

/** Ray-traced ambient occlusion (cosine-weighted, distance-attenuated) against a BVH. */
function aoTracer(bvh, { rays = 16, maxDist = 0.1, near = 0.003 } = {}) {
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
    const axv = Math.abs(Nn[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const t = norm(cross(axv, Nn)), b = cross(Nn, t);
    const a = hash(i) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    let occ = 0;
    ray.origin.set(P[0] + Nn[0] * 0.002, P[1] + Nn[1] * 0.002, P[2] + Nn[2] * 0.002);
    for (const d of dirs) {
      const x = d[0] * ca - d[1] * sa, y = d[0] * sa + d[1] * ca, z = d[2];
      ray.direction.set(t[0] * x + b[0] * y + Nn[0] * z, t[1] * x + b[1] * y + Nn[1] * z, t[2] * x + b[2] * y + Nn[2] * z);
      const hit = bvh.raycastFirst(ray, THREE.DoubleSide, near, maxDist);
      if (hit) occ += 1 - (hit.distance / maxDist) ** 0.75;
    }
    return 1 - occ / rays;
  };
}

/** Bilinear lookup of a field baked at R x R for texel (x, y) of a W x W image; applies fn(c, ...values) per texel. */
function applyFields(img, fields, R, fn) {
  const W = img.width, c = [0, 0, 0], vals = new Array(fields.length);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const fx = Math.max(0, Math.min(R - 1.001, (x + 0.5) * R / W - 0.5)), fy = Math.max(0, Math.min(R - 1.001, (y + 0.5) * R / W - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, j = y0 * R + x0;
    for (let k = 0; k < fields.length; k++) { const f = fields[k]; vals[k] = (f[j] * (1 - tx) + f[j + 1] * tx) * (1 - ty) + (f[j + R] * (1 - tx) + f[j + R + 1] * tx) * ty; }
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
class Geo {
  constructor() { this.P = []; this.UV = []; this.F = []; this.W = []; }
  v(p, uv, w = null) { this.P.push(p[0], p[1], p[2]); this.UV.push(uv[0], uv[1]); this.W.push(w); return this.P.length / 3 - 1; }
  tri(a, b, c) { this.F.push({ v: [a, b, c], t: [a, b, c], g: 0 }); }
  quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }
  get n() { return this.P.length / 3; }
}

/**
 * Tube along a polyline: radius(t) and `sides` around, parallel-transport frames. uv rect [u0,v0,u1,v1]
 * (u along the tube, v around). Returns the vertex range.
 */
function tube(g, pts, radius, sides, uvr, w = null, { capEnd = false, ref = [0, 1, 0], swapUV = false } = {}) {
  const n = pts.length;
  const T = pts.map((p, i) => norm(sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)])));
  let N0 = norm(cross(T[0], Math.abs(dot(T[0], ref)) > 0.9 ? [1, 0, 0] : ref));
  const frames = [];
  for (let i = 0; i < n; i++) {
    if (i) { const b = cross(T[i - 1], T[i]); if (len(b) > 1e-6) { const ax = norm(b), ang = Math.acos(Math.max(-1, Math.min(1, dot(T[i - 1], T[i])))); N0 = rot(N0, ax, ang); } }
    N0 = norm(sub(N0, scl(T[i], dot(N0, T[i]))));
    frames.push([N0, cross(T[i], N0)]);
  }
  const start = g.n;
  for (let i = 0; i < n; i++) {
    const r = typeof radius === 'function' ? radius(i / (n - 1), i) : radius;
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const d = add(scl(frames[i][0], Math.cos(a)), scl(frames[i][1], Math.sin(a)));
      const uv = swapUV ? [lerp(uvr[0], uvr[2], k / sides), lerp(uvr[1], uvr[3], i / (n - 1))] : [lerp(uvr[0], uvr[2], i / (n - 1)), lerp(uvr[1], uvr[3], k / sides)];
      g.v(madd(pts[i], d, r), uv, typeof w === 'function' ? w(i / (n - 1), pts[i]) : w);
    }
  }
  for (let i = 0; i + 1 < n; i++) for (let k = 0; k < sides; k++) {
    const a = start + i * (sides + 1) + k, b = a + sides + 1;
    g.quad(a, a + 1, b + 1, b);
  }
  return [start, g.n];
}
function rot(v, ax, ang) { // Rodrigues
  const c = Math.cos(ang), s = Math.sin(ang), d = dot(ax, v), cr = cross(ax, v);
  return [v[0] * c + cr[0] * s + ax[0] * d * (1 - c), v[1] * c + cr[1] * s + ax[1] * d * (1 - c), v[2] * c + cr[2] * s + ax[2] * d * (1 - c)];
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
    const raw0 = list;
    list = list.map(([b, w]) => [typeof b === 'string' ? h.skeleton.byName[b].index : b, w]).filter(([, w]) => w > 1e-4);
    if (!list.length) { if (!toPart.warned?.[name]) { (toPart.warned ||= {})[name] = 1; console.warn(`  ${name}: vertex ${i} got no skin weights`, g.W[i] ? 'explicit' : 'skinFn', JSON.stringify(raw0), [g.P[i * 3], g.P[i * 3 + 1], g.P[i * 3 + 2]].map((x) => x.toFixed(3)).join(',')); } list = [[h.skeleton.byName.spine_03.index, 1]]; }
    // merge duplicates, top 4, normalise
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
        if (allow && !allow.includes(name)) continue;
        if (exclude && exclude.includes(name)) continue;
        acc.set(b, (acc.get(b) || 0) + w * wi);
      }
    });
    const list = [...acc.entries()];
    return list.length ? list : [[h.skeleton.byName.spine_02.index, 1]];
  };
}

/** BVH over triangle soups [{pos, tris}] (tris = Part.tris() layout). */
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
  // MeshBVH re-orders the (generated) index buffer: a hit's faceIndex addresses that index, so map it back to
  // the source triangle (vertices k*3.. of the non-indexed soup) before reading positions / binding
  const index = g.index.array;
  const srcTri = (fi) => Math.floor(index[fi * 3] / 3);
  const faceN = (fi) => {
    const b = srcTri(fi) * 9;
    const e1 = [arr[b + 3] - arr[b], arr[b + 4] - arr[b + 1], arr[b + 5] - arr[b + 2]], e2 = [arr[b + 6] - arr[b], arr[b + 7] - arr[b + 1], arr[b + 8] - arr[b + 2]];
    return norm(cross(e1, e2));
  };
  return {
    bvh,
    /** all hits along a ray: [{d, p, n}] sorted by distance */
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

/**
 * Closest-skin weights: the bone weights of the base-mesh surface point nearest to p (barycentric blend of the
 * triangle's three base vertices), filtered to `allow`. Cloth / straps / chains bound this way move exactly
 * with the skin under them (no shearing through the trapezius when the neck bends).
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
    if (!Number.isFinite(wb) || !Number.isFinite(wc)) { wb = 1 / 3; wc = 1 / 3; }   // degenerate triangle
    const wa = Math.max(0, 1 - wb - wc);
    const acc = new Map();
    for (const [v, k] of [[ia, wa], [ib, wb], [ic, wc]]) for (const [b, w] of h.weights[v]) {
      const name = bones[b].name;
      if ((allow && !allow.includes(name)) || (exclude && exclude.includes(name))) continue;
      acc.set(b, (acc.get(b) || 0) + w * k);
    }
    const list = [...acc.entries()].filter(([, w]) => w > 1e-3);
    // the skin right there is driven by bones outside `allow`: blend the allowed bones of the nearest vertices
    return list.length ? list : fallback(p, { allow, exclude });
  };
}
const surf = (part) => ({ pos: part.pos, tris: part.tris() });

/** UV islands of a part: island id per face (union-find over shared UV corners). */
function uvIslands(part) {
  const F = part.obj.faces;
  const par = new Int32Array(part.obj.uvs.length / 2).map((_, i) => i);
  const find = (a) => { while (par[a] !== a) a = par[a] = par[par[a]]; return a; };
  for (const f of F) for (let k = 1; k < f.t.length; k++) { const a = find(f.t[0]), b = find(f.t[k]); if (a !== b) par[a] = b; }
  return F.map((f) => find(f.t[0]));
}

/** Uniformly scales a finished character (all part positions, the base mesh, the skeleton) about the ground origin. */
function scaleCharacter(h, parts, S) {
  const arrays = new Set([h.pos, ...parts.map((p) => p.pos)]);
  for (const a of arrays) for (let i = 0; i < a.length; i++) a[i] *= S;
  for (const b of h.skeleton.bones) { b.head.multiplyScalar(S); b.tail.multiplyScalar(S); b.localPos.multiplyScalar(S); }
  h.height *= S; h.headTop = h.height;
}

/**
 * Sculpts the morphed base mesh with fn(p metres) -> p for EVERY base vertex (joint helper cubes included, so the
 * rebuilt skeleton follows the new shape), then rebuilds the skeleton. Must run before any part is fitted.
 */
async function sculpt(h, fn) {
  const n = h.pos.length / 3, o = h.origin;
  const isBody = new Uint8Array(n);
  for (const v of h.baseObj.groupVerts('body')) isBody[v] = 1;
  for (let i = 0; i < n; i++) {
    const p = fn([h.pos[i * 3], h.pos[i * 3 + 1], h.pos[i * 3 + 2]], !!isBody[i]);
    for (let k = 0; k < 3; k++) { h.pos[i * 3 + k] = p[k]; h.dm[i * 3 + k] = p[k] * 10 + o[k]; }
  }
  h.skeleton = await buildSkeleton(h.baseObj, h.pos);
  let top = 0;
  for (const v of h.baseObj.groupVerts('body')) top = Math.max(top, h.pos[v * 3 + 1]);
  h.height = h.headTop = top;
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

/** Moves the whole character (mesh, every bone but Root) up by d metres: stands it on its boot soles. */
function liftCharacter(h, parts, d) {
  const arrays = new Set([h.pos, ...parts.map((p) => p.pos)]);
  for (const a of arrays) for (let i = 1; i < a.length; i += 3) a[i] += d;
  const sk = h.skeleton;
  for (const b of sk.bones) { if (b.name === 'Root') continue; b.head.y += d; b.tail.y += d; }
  for (const b of sk.bones) if (b.parent >= 0 && sk.bones[b.parent].name === 'Root') b.localPos = b.head.clone().sub(sk.bones[b.parent].head).applyQuaternion(sk.bones[b.parent].world.clone().invert());
  h.height += d; h.headTop = h.height;
}

/**
 * Raises the pelvis bone's REST position by d (children keep their world rest positions, the mesh is unchanged).
 * retargetClips places the pelvis at its rest position + the clip's offset, so in every clip the whole body sits
 * d higher: it compensates the library clips sinking this heavy, short-legged body's feet into the floor.
 */
function liftPelvis(h, d) {
  const sk = h.skeleton, pel = sk.byName.pelvis;
  pel.head.y += d; pel.tail.y += d;
  const fix = (b) => {
    if (b.parent < 0) return;
    const p = sk.bones[b.parent];
    b.localPos = b.head.clone().sub(p.head).applyQuaternion(p.world.clone().invert());
  };
  fix(pel);
  for (const b of sk.bones) if (b.parent === pel.index) fix(b);
}

/** Drops kept faces of `part` that sit in small connected islands (< minFaces), unless keepIsland(centroid) says so. */
function dropIslands(part, minFaces, keepIsland = () => false) {
  const F = part.obj.faces;
  const par = new Int32Array(part.nVerts).map((_, i) => i);
  const find = (a) => { while (par[a] !== a) a = par[a] = par[par[a]]; return a; };
  F.forEach((f, fi) => { if (part.keep[fi]) for (let k = 1; k < f.v.length; k++) { const a = find(f.v[0]), b = find(f.v[k]); if (a !== b) par[a] = b; } });
  const comp = new Map();
  F.forEach((f, fi) => {
    if (!part.keep[fi]) return;
    const r = find(f.v[0]);
    let c = comp.get(r);
    if (!c) comp.set(r, c = { faces: [], cen: [0, 0, 0] });
    c.faces.push(fi);
    for (const v of f.v) for (let k = 0; k < 3; k++) c.cen[k] += part.pos[v * 3 + k] / f.v.length;
  });
  let dropped = 0;
  for (const c of comp.values()) {
    if (c.faces.length >= minFaces) continue;
    const cen = c.cen.map((x) => x / c.faces.length);
    if (keepIsland(cen, c.faces.length)) continue;
    for (const fi of c.faces) part.keep[fi] = 0;
    dropped += c.faces.length;
  }
  return dropped;
}

// cleaver orientation about the forearm (deg; - = edge forward) and the matching arm offsets: see poseOffsets
const BLADE_ROLL = -40;
// rest height (body top, m) and the pelvis rest lift that keeps the boots on the floor in the library clips
const REST_HEIGHT = 4.52;
const PELVIS_LIFT = 0;
const MESH_LIFT = 0.04;
// apron uv layout: front sheet v 0..AP_V, its back layer AP_BV0..AP_BV1, straps / hem / ties above 0.87
const AP_V = 0.7, AP_BV0 = 0.705, AP_BV1 = 0.865;

// =====================================================================================================
export async function build(lib) {
  const N = lib.makeNoise(4242);
  const opts = {
    macro: { gender: 1, age: 0.6, muscle: 1, weight: 1, height: 0.5, proportions: 0.15, race: { caucasian: 1 } },
    modifiers: {
      'head-scale-horiz-decr-incr': -0.5, 'head-scale-vert-decr-incr': -0.45, 'head-scale-depth-decr-incr': -0.35,
      'neck-scale-horiz-decr-incr': 1, 'measure-neck-circ-decr-incr': 1, 'measure-neck-height-decr-incr': -0.8, 'neck-back-scale-depth-decr-incr': 1,
      'measure-shoulder-dist-decr-incr': 0.9, 'upperarm-shoulder-muscle-decr-incr': 1, 'torso-muscle-dorsi-decr-incr': 1,
      'torso-muscle-pectoral-decr-incr': 1, 'torso-scale-horiz-decr-incr': 0.45, 'torso-scale-depth-decr-incr': 0.7,
      'upperarm-muscle-decr-incr': 1, 'measure-upperarm-circ-decr-incr': 1, 'upperarm-fat-decr-incr': 0.4,
      'lowerarm-muscle-decr-incr': 1, 'lowerarm-fat-decr-incr': 0.6, 'lowerarm-scale-horiz-decr-incr': 0.5, 'lowerarm-scale-depth-decr-incr': 0.5, 'measure-wrist-circ-decr-incr': 1,
      'measure-upperarm-length-decr-incr': 0.35, 'measure-lowerarm-length-decr-incr': 0.3,
      'l-hand-scale-decr-incr': 1, 'l-hand-fingers-diameter-decr-incr': 1,
      'stomach-pregnant-decr-incr': 0.8, 'measure-waist-circ-decr-incr': 1, 'stomach-navel-down-up': -0.5,
      'measure-hips-circ-decr-incr': 0.6, 'buttocks-volume-decr-incr': 0.5,
      'upperleg-muscle-decr-incr': 1, 'upperleg-fat-decr-incr': 1, 'measure-thigh-circ-decr-incr': 1,
      'lowerleg-muscle-decr-incr': 1, 'lowerleg-fat-decr-incr': 1, 'measure-calf-circ-decr-incr': 1, 'measure-knee-circ-decr-incr': 0.8, 'measure-ankle-circ-decr-incr': 1,
      'measure-upperleg-height-decr-incr': -0.35, 'measure-lowerleg-height-decr-incr': -0.35,
      'foot-scale-decr-incr': 0.4,
    },
    // the mouth is sewn shut under the sack: no open jaw pushing the cloth out
    expression: {},
  };
  const h = await lib.Human.create(opts);
  {
    // ---- sculpt: a swollen left fist (~1.7x, knuckle growths, thick wrist), Popeye forearms (the right wrist
    // thickens into the blade root), a huge trapezius yoke so the hooded head sinks between the shoulders, a fat
    // gut that overhangs the waistband, love handles rolling over it, back-fat rolls under the tumour, and
    // heavier thighs / calves so the giant does not stand on a bodybuilder's thin legs
    const S0 = h.skeleton.byName, P0 = (n) => V(S0[n].head);
    const Wl = P0('hand_l'), axL = norm(sub(Wl, P0('lowerarm_l'))), Wr = P0('hand_r'), axR = norm(sub(Wr, P0('lowerarm_r')));
    const ElL = P0('lowerarm_l'), ElR = P0('lowerarm_r');
    const neck = P0('neck_01'), clY = (P0('clavicle_l')[1] + P0('upperarm_l')[1]) / 2;
    const knuck = ['index_01_l', 'middle_01_l', 'ring_01_l', 'pinky_01_l'].map(P0);
    const handC = scl(knuck.reduce((a, k) => add(a, k), [0, 0, 0]), 0.25);
    const handAx = norm(sub(handC, Wl));
    // back-of-hand direction (left hand, palm towards the thigh in the A-pose): away from the body
    let dors = norm(cross(handAx, sub(P0('thumb_01_l'), Wl)));
    if (dors[0] < 0) dors = scl(dors, -1);
    const HS = 1.68; // fist scale about the wrist
    const atHand = (p) => add(Wl, scl(sub(p, Wl), HS));
    const handMid = atHand(lerp3(Wl, handC, 0.6));
    const growths = [
      [atHand(add(knuck[1], scl(dors, 0.012))), 0.035, 0.019], [atHand(add(knuck[2], scl(dors, 0.01))), 0.029, 0.016],
      [atHand(add(lerp3(Wl, handC, 0.55), scl(dors, 0.024))), 0.048, 0.026], [atHand(add(lerp3(Wl, knuck[3], 0.45), scl(dors, 0.02))), 0.032, 0.016],
    ];
    const yHip = P0('thigh_l')[1], yW = P0('spine_01')[1], y3 = P0('spine_03')[1];
    const chain0 = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01'].map(P0);
    const axisZ0 = (y) => {
      if (y <= chain0[0][1]) return chain0[0][2];
      for (let i = 0; i + 1 < chain0.length; i++) if (y <= chain0[i + 1][1]) return lerp(chain0[i][2], chain0[i + 1][2], (y - chain0[i][1]) / (chain0[i + 1][1] - chain0[i][1]));
      return chain0[chain0.length - 1][2];
    };
    const legs = [['thigh_l', 'calf_l', 1, 0.1], ['thigh_r', 'calf_r', -1, 0.1], ['calf_l', 'foot_l', 1, 0.17], ['calf_r', 'foot_r', -1, 0.17]]
      .map(([a, b, sx, amt]) => ({ a: P0(a), b: P0(b), sx, amt, t0: a.startsWith('thigh') ? 0.12 : 0.04, t1: a.startsWith('thigh') ? 0.92 : 0.8 }));
    console.log('  sculpt: neck', neck.map((x) => x.toFixed(3)).join(','), 'clavicle', P0('clavicle_l').map((x) => x.toFixed(3)).join(','), 'shoulder', P0('upperarm_l').map((x) => x.toFixed(3)).join(','), 'head', P0('head').map((x) => x.toFixed(3)).join(','), 'waist', yW.toFixed(3), 'hip', yHip.toFixed(3));
    await sculpt(h, (p, isBody) => {
      let q = p;
      {
        // left fist ~1.7x about the wrist, the wrist itself thickened
        const d = sub(q, Wl), tt = dot(d, axL), r = len(sub(d, scl(axL, tt)));
        const k = ss(-0.07, 0.02, tt) * (1 - ss(0.09, 0.13, r)) * (1 - ss(0.24, 0.3, tt));
        if (k > 0) q = add(Wl, scl(d, 1 + (HS - 1) * k));
        const kw = ss(-0.16, -0.06, tt) * (1 - ss(-0.03, 0.03, tt)) * (1 - ss(0.05, 0.09, r));
        if (kw > 0) q = add(q, scl(sub(d, scl(axL, tt)), 0.3 * kw));
      }
      for (const [El, W, ax, amt] of [[ElL, Wl, axL, 0.2], [ElR, Wr, axR, 0.13]]) {
        const L = dist(El, W), d = sub(q, El), tt = dot(d, ax) / L, radial = sub(d, scl(ax, tt * L)), r = len(radial);
        if (tt > -0.1 && tt < 1.08 && r < 0.1) q = add(q, scl(radial, Math.sin(Math.PI * clamp01((tt + 0.05) / 1.12)) ** 0.7 * (1 - ss(0.065, 0.1, r)) * amt));
      }
      if (isBody) {
        // tumorous knuckle / back-of-hand growths
        for (const [c, rr, hgt] of growths) {
          const dd = dist(q, c);
          if (dd < rr) q = madd(q, norm(sub(q, handMid)), hgt * (1 - ss(0, rr, dd)) ** 2);
        }
      }
      {
        const xs = Math.abs(q[0]);
        const w = Math.sin(Math.PI * clamp01((xs - 0.04) / 0.15)) * (1 - ss(0.035, 0.075, Math.abs(q[2] - neck[2] + 0.02))) *
          ss(clY - 0.06, clY + 0.01, q[1]) * (1 - ss(neck[1] + 0.07, neck[1] + 0.13, q[1]));
        if (w > 0) q = [q[0] + Math.sign(q[0]) * 0.006 * w, q[1] + 0.03 * w, q[2] - 0.004 * w];
      }
      if (isBody && q[1] > yHip - 0.12 && q[1] < y3 + 0.02) {
        const zc = axisZ0(q[1]), rx = q[0], rz = q[2] - zc, rh = Math.hypot(rx, rz);
        if (rh > 0.06) {
          const c = rz / rh, sn = Math.abs(rx) / rh, out = [rx / rh, 0, rz / rh];
          const y = q[1] - yW;
          // gut: bulges forward from under the pecs to just below the navel, overhangs (sags down) and folds in
          // sharply at the waistband crease
          const wf = ss(-0.15, 0.75, c) * (1 - ss(0.13, 0.2, Math.abs(rx)) * 0.55);
          const prof = ss(y3 - yW - 0.01, 0.02, y) * (1 - ss(-0.05, -0.085, y));
          const sag = Math.exp(-(((y + 0.02) / 0.045) ** 2));
          let dq = scl(out, 0.075 * prof * wf);
          dq = add(dq, [0, -0.03 * sag * wf * ss(-0.09, -0.06, y), 0]);
          // love handles: lateral / back-lateral rolls over the waistband
          const wl = ss(0.55, 0.85, sn) * ss(-0.5, 0.2, c) * (1 - ss(0.5, 0.9, c));
          const lh = Math.exp(-(((y - 0.01) / 0.04) ** 2)) * (1 - ss(-0.045, -0.07, y));
          dq = add(dq, add(scl(out, 0.03 * lh * wl), [0, -0.012 * lh * wl, 0]));
          // back fat: two horizontal rolls between the waist and the shoulder blades (under the tumour)
          const wb = ss(-0.35, -0.75, c);
          if (wb > 0 && y > -0.02 && y < y3 - yW - 0.01) {
            const ph = (y + 0.02) / 0.072;
            const roll = Math.max(0, Math.sin(Math.PI * ph)) ** 0.6 * (ph < 2 ? 1 : 0) * (1 - ss(0.12, 0.17, Math.abs(rx)));
            dq = add(dq, scl(out, 0.014 * roll * wb));
          }
          q = add(q, dq);
        }
      }
      // heavier thighs / calves: radial scale about the bone axis (each leg only on its own side)
      for (const L of legs) {
        if (Math.sign(q[0]) !== L.sx && Math.abs(q[0]) > 0.01) continue;
        const ab = sub(L.b, L.a), Lb = len(ab), ax = scl(ab, 1 / Lb), d = sub(q, L.a), t = dot(d, ax) / Lb;
        if (t < L.t0 - 0.05 || t > L.t1 + 0.05) continue;
        const radial = sub(d, scl(ax, t * Lb)), r = len(radial);
        if (r > 0.17) continue;
        const w = ss(L.t0 - 0.05, L.t0 + 0.08, t) * (1 - ss(L.t1 - 0.08, L.t1 + 0.05, t)) * (1 - ss(0.13, 0.17, r));
        q = add(q, scl(radial, L.amt * w));
      }
      return q;
    });
  }
  const sk = h.skeleton.byName;
  const B = (n) => V(sk[n].head);
  const A = lib.anchors(h);
  const skinAt = makeSkinner(h);
  console.log('rest height', h.height.toFixed(3), 'pelvis', sk.pelvis.head.y.toFixed(3));

  // ---- MakeHuman parts
  const body = h.basePart({ name: 'body', role: 'skin' });
  const suit = await h.fit('clothes/male_casualsuit04', { name: 'trousers', role: 'cloth', hide: false });
  const waistY = sk.spine_01.head.y + 0.02;
  let suitCrop = null;
  {
    const isl = uvIslands(suit), ib = new Map();
    suit.obj.faces.forEach((f, fi) => { let b = ib.get(isl[fi]); if (!b) ib.set(isl[fi], b = { y: 0, n: 0 }); for (const v of f.v) { b.y += suit.pos[v * 3 + 1]; b.n++; } });
    suit.obj.faces.forEach((f, fi) => { const b = ib.get(isl[fi]); if (b.y / b.n > waistY) suit.keep[fi] = 0; });
    for (const v of suit.deleteVerts) if (h.pos[v * 3 + 1] < waistY - 0.04) h.hidden.add(v);
    // only the trouser islands are kept: crop the UV atlas to them (the shirt half of the casualsuit atlas would
    // otherwise waste half of every trouser texture)
    const uv = suit.obj.uvs, r = [9, 9, -9, -9];
    suit.obj.faces.forEach((f, fi) => { if (suit.keep[fi]) for (const t of f.t) { r[0] = Math.min(r[0], uv[t * 2]); r[1] = Math.min(r[1], uv[t * 2 + 1]); r[2] = Math.max(r[2], uv[t * 2]); r[3] = Math.max(r[3], uv[t * 2 + 1]); } });
    const m = 0.006;
    // snapped to the 2048 source texel grid (the source maps are cropped to exactly this rect)
    suitCrop = [Math.floor(Math.max(0, r[0] - m) * 2048) / 2048, Math.floor(Math.max(0, r[1] - m) * 2048) / 2048, Math.ceil(Math.min(1, r[2] + m) * 2048) / 2048, Math.ceil(Math.min(1, r[3] + m) * 2048) / 2048];
    const nu = new Float32Array(uv.length);
    for (let i = 0; i < uv.length; i += 2) { nu[i] = (uv[i] - suitCrop[0]) / (suitCrop[2] - suitCrop[0]); nu[i + 1] = (uv[i + 1] - suitCrop[1]) / (suitCrop[3] - suitCrop[1]); }
    suit.obj = { ...suit.obj, uvs: nu };
    console.log('  trousers uv crop', suitCrop.map((x) => x.toFixed(3)).join(','));
  }
  const boots = await h.fit('clothes/shoes03', { name: 'boots', role: 'cloth' });
  let bootSole = 9;
  {
    // chunky work boots: shell ~9 % wider about the foot line, a welt that sticks out round the sole, the shaft
    // 2 cm taller. (The sole sits below the bare foot's ground plane: the whole character is lifted onto it
    // at the end, see liftCharacter.)
    let top = 0;
    for (let i = 1; i < boots.pos.length; i += 3) { bootSole = Math.min(bootSole, boots.pos[i]); top = Math.max(top, boots.pos[i]); }
    const lines = [1, -1].map((sx) => {
      const f = B(sx > 0 ? 'foot_l' : 'foot_r'), b = B(sx > 0 ? 'ball_l' : 'ball_r');
      const d = norm([b[0] - f[0], 0, b[2] - f[2]]);
      return { sx, a: madd([f[0], 0, f[2]], d, -0.1), b: madd([b[0], 0, b[2]], d, 0.09) };
    });
    const ankleY = B('foot_l')[1];
    for (let i = 0; i < boots.nVerts; i++) {
      const p = [boots.pos[i * 3], boots.pos[i * 3 + 1], boots.pos[i * 3 + 2]];
      const L = p[0] >= 0 ? lines[0] : lines[1];
      const ab = sub(L.b, L.a), t = clamp01(dot(sub([p[0], 0, p[2]], L.a), ab) / dot(ab, ab));
      const c = madd(L.a, ab, t), o = [p[0] - c[0], 0, p[2] - c[2]];
      const welt = 1 - ss(bootSole + 0.008, bootSole + 0.018, p[1]);
      const k = 1.09 + 0.07 * welt;
      boots.pos[i * 3] = c[0] + o[0] * k;
      boots.pos[i * 3 + 2] = c[2] + o[2] * k;
      boots.pos[i * 3 + 1] = p[1] + 0.02 * ss(ankleY, top, p[1]);
    }
  }
  const eyes = await h.fit('eyes/low-poly', { name: 'eyes', role: 'eye', hide: false });
  let bootTop = 0;
  for (let i = 1; i < boots.pos.length; i += 3) bootTop = Math.max(bootTop, boots.pos[i]);
  console.log('  boots: sole', bootSole.toFixed(3), 'top', bootTop.toFixed(3));

  // BVH of the bare body (rest pose, human scale) + one including the trousers
  const fullBody = h.basePart({ name: 'bvh' });
  const bodyB = makeBVH([surf(fullBody)]);
  // trunk = the body without forearms / hands: the swollen fist and the forearms hang at hip height in the rest
  // pose and must not catch the rays that place the apron, chains, scars...
  const trunkSurf = (() => {
    const fa = new Set(h.skeleton.bones.filter((b) => /^(lowerarm|hand|thumb|index|middle|ring|pinky)/.test(b.name)).map((b) => b.index));
    const aw = new Float32Array(h.pos.length / 3);
    h.weights.forEach((l, v) => { for (const [b, w] of l) if (fa.has(b)) aw[v] += w; });
    const t = fullBody.tris(), keepT = [];
    for (let i = 0; i < t.length; i += 6) if (aw[t[i]] < 0.5 && aw[t[i + 2]] < 0.5 && aw[t[i + 4]] < 0.5) keepT.push(...t.slice(i, i + 6));
    return { pos: h.pos, tris: Int32Array.from(keepT) };
  })();
  const trunkB = makeBVH([trunkSurf]);
  const outerB = makeBVH([trunkSurf, surf(suit), surf(boots)]);
  const skinClosest = makeClosestSkinner(h, fullBody, skinAt);

  // torso axis: z of the spine at height y
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

  // =================================================================== SACK HOOD (cloth)
  // A loose burlap sack pulled over the (small) head: two flat panels (front / back) sewn up the sides and over
  // the crown from ear to ear, two dog-eared top corners (the left one flopped), slack folds, tied round the neck
  // by a rope (low under the chin at the front, at the nape behind) and a frayed skirt below the rope that drapes
  // over the neck stump and the trapezius. The envelope is the head + neck raycast from the head centre, dilated
  // and smoothed over the angular grid so the cloth tents over the nose and lips instead of hugging them.
  const hood = new Geo();
  const headW = new Float32Array(h.pos.length / 3), neckW = new Float32Array(h.pos.length / 3);
  h.weights.forEach((l, v) => { for (const [b, w] of l) { if (b === sk.head.index) headW[v] += w; else if (b === sk.neck_01.index) neckW[v] += w; } });
  const hmin = [9, 9, 9], hmax = [-9, -9, -9];
  for (const v of h.baseObj.groupVerts('body')) if (headW[v] > 0.6) for (let k = 0; k < 3; k++) { hmin[k] = Math.min(hmin[k], h.pos[v * 3 + k]); hmax[k] = Math.max(hmax[k], h.pos[v * 3 + k]); }
  const HC = [0, (hmin[1] + hmax[1]) / 2 + 0.012, (hmin[2] + hmax[2]) / 2];
  const eyeY = (A.eyeL[1] + A.eyeR[1]) / 2;
  const neckTop = B('head'), neckBot = B('neck_01');
  // head + neck only (no trapezius / shoulders) for the envelope rays
  const headB = (() => {
    const t = fullBody.tris(), keepT = [];
    for (let i = 0; i < t.length; i += 6) {
      const vs = [t[i], t[i + 2], t[i + 4]];
      if (vs.every((v) => headW[v] + neckW[v] > 0.55 && h.pos[v * 3 + 1] > neckBot[1] - 0.01)) keepT.push(...t.slice(i, i + 6));
    }
    return makeBVH([{ pos: h.pos, tris: Int32Array.from(keepT) }]);
  })();
  const chinY = hmin[1];
  const ropeBack = lerp(neckBot[1], neckTop[1], 0.6);
  const ropeFront = Math.max(neckBot[1] - 0.025, Math.min(chinY - 0.016, ropeBack - 0.012));
  const nf = bodyB.first([0, ropeBack, 1], [0, 0, -1], 2), nb = bodyB.first([0, ropeBack, -1], [0, 0, 1], 2);
  const neckZ = (nf.p[2] + nb.p[2]) / 2;
  const cinchY = ropeBack;
  const axisZ = (y) => lerp(neckZ, HC[2], ss(ropeFront, HC[1], y));
  const ropeY = (th) => { const w = (1 + Math.cos(th)) / 2; return lerp(ropeBack, ropeFront, w * w * (3 - 2 * w)); };
  const ropeAt = (P) => ropeY(Math.atan2(P[0], P[2] - neckZ));
  const hoodInfo = { HC, cinchY, neckZ, ropeY, ropeAt };
  console.log('  hood: head centre', HC.map((x) => x.toFixed(3)).join(','), 'rope front', ropeFront.toFixed(3), 'back', ropeBack.toFixed(3), 'neck r', ((nf.p[2] - nb.p[2]) / 2).toFixed(3), 'eyeY', eyeY.toFixed(3), 'chin', chinY.toFixed(3), 'neck', neckBot[1].toFixed(3), neckTop[1].toFixed(3));
  const hoodUV = {};
  // skirt length below the rope, measured along the cloth (longer at the front, a little uneven)
  const skirtLen = (th) => lerp(0.038, 0.05, ss(-0.2, 0.9, Math.cos(th))) + N.noise(th * 3, 0.5, 4.1) * 0.005;
  hoodInfo.skirtLen = skirtLen;
  hoodInfo.thetaOf = (P) => Math.atan2(P[0], P[2] - neckZ);
  let hoodSkin;
  {
    const NT = 40;                                    // columns around; panels split at theta = +-90 deg (side seams)
    const thetaOf = (k) => -Math.PI + (k / NT) * Math.PI * 2;   // k = 0 / NT: back centre, NT/2: front centre
    const PHI = [8, 16, 25, 34, 43, 52, 61, 70, 79, 88];
    const NL = 5, NSK = 3;                             // lower rows (equator -> rope), skirt rows below the rope
    const R = PHI.length + NL + 1 + NSK;
    // ---- raw envelope radii (dome rays from HC; lower rows horizontal rays from the neck axis)
    const raw = [];
    const dirOf = (phi, th) => [Math.sin(phi) * Math.sin(th), Math.cos(phi), Math.sin(phi) * Math.cos(th)];
    for (const phiDeg of PHI) {
      const ph = phiDeg * Math.PI / 180, row = [];
      for (let k = 0; k < NT; k++) { const hs = headB.hits(HC, dirOf(ph, thetaOf(k)), 0.2); row.push(hs.length ? hs[hs.length - 1].d : 0.09); }
      raw.push(row);
    }
    const yEqAt = (k) => HC[1] + Math.cos(88 * Math.PI / 180) * raw[PHI.length - 1][k];
    const lowerY = (r, k) => lerp(yEqAt(k), ropeY(thetaOf(k)), (r + 1) / (NL + 1));
    for (let r = 0; r < NL; r++) {
      const row = [];
      for (let k = 0; k < NT; k++) {
        const th = thetaOf(k), y = lowerY(r, k), c = [0, y, axisZ(y)];
        const hs = headB.hits(c, [Math.sin(th), 0, Math.cos(th)], 0.16);
        row.push(hs.length ? hs[hs.length - 1].d : 0.05);
      }
      raw.push(row);
    }
    // dilate (bridge the nose / lips / ears) then smooth around and down
    const RR = raw.length;
    let env = raw.map((row, r) => row.map((_, k) => {
      let m = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dk = -2; dk <= 2; dk++) {
        const rr = r + dr; if (rr < 0 || rr >= RR) continue;
        // compare in a common frame: dome radii and lower-row horizontal radii are close enough near the equator
        m = Math.max(m, raw[rr][(k + dk + NT) % NT] * (dr === 0 && Math.abs(dk) < 2 ? 1 : 0.97));
      }
      return m;
    }));
    for (let it = 0; it < 3; it++) env = env.map((row, r) => row.map((v, k) => {
      const a = row[(k + NT - 1) % NT], b = row[(k + 1) % NT];
      const up = env[Math.max(0, r - 1)][k], dn = env[Math.min(RR - 1, r + 1)][k];
      return Math.max(raw[r][k] + 0.004, v * 0.4 + (a + b) * 0.2 + (up + dn) * 0.1);
    }));
    // ---- final ring positions
    const ring = [];
    const cornerL = norm([0.8, 0.58, -0.08]), cornerR = norm([-0.8, 0.58, -0.08]);
    const slack = (th, phiDeg) => {
      const front = ss(0.35, 0.9, Math.cos(th));
      let o = lerp(0.022, 0.019, front);
      o += 0.008 * Math.exp(-((phiDeg / 30) ** 2));                 // loose crown
      return o;
    };
    const foldN = (p, amp) => madd(p, norm([p[0], 0, p[2] - axisZ(p[1])]), (N.fbm(p[0] * 22, p[1] * 9, p[2] * 22, 3) * 0.7 + N.noise(Math.atan2(p[0], p[2] - axisZ(p[1])) * 5, p[1] * 14, 2.7) * 0.5) * amp);
    for (let r = 0; r < PHI.length; r++) {
      const ph = PHI[r] * Math.PI / 180, row = [];
      for (let k = 0; k < NT; k++) {
        const th = thetaOf(k), d = dirOf(ph, th);
        let rad = env[r][k] + slack(th, PHI[r]);
        // dog-eared corners at both ends of the crown seam; the left one flops over backwards
        const aL = Math.acos(Math.max(-1, Math.min(1, dot(d, cornerL)))), aR = Math.acos(Math.max(-1, Math.min(1, dot(d, cornerR))));
        const eL = Math.exp(-((aL / 0.27) ** 2)), eR = Math.exp(-((aR / 0.24) ** 2));
        rad += 0.05 * eL + 0.042 * eR;
        let p = madd(HC, d, rad);
        p = add(p, scl([0.0, -0.022, -0.016], eL * eL));
        row.push(foldN(p, 0.004 * (1 - 0.6 * ss(0.35, 0.9, Math.cos(th)))));
      }
      ring.push(row);
    }
    const prevR = ring[PHI.length - 1].map((p) => Math.hypot(p[0], p[2] - axisZ(p[1])));
    let prevY = ring[PHI.length - 1].map((p) => p[1]);
    for (let r = 0; r < NL; r++) {
      const row = [];
      for (let k = 0; k < NT; k++) {
        const th = thetaOf(k), y = lowerY(r, k), zc = axisZ(y);
        const gather = ss(0.3, 1, (r + 1) / NL);
        let rad = Math.max(env[PHI.length + r][k] + lerp(0.016, 0.006, gather) + 0.006 * (1 - ss(0.35, 0.9, Math.cos(th))), prevR[k] - 0.55 * (prevY[k] - y));
        rad += gather * 0.007 * Math.sin(th * 11 + N.noise(th * 2, y * 20, 0.3) * 2.5);   // folds gathering into the rope
        prevR[k] = rad; prevY[k] = y;
        row.push(foldN([Math.sin(th) * rad, y, zc + Math.cos(th) * rad], 0.003 * (1 - gather)));
      }
      ring.push(row);
    }
    // rope ring (cinched onto the neck) and the skirt flaring out over the neck stump / trapezius
    const neckHit = (y, th) => {
      const c = [0, y, axisZ(y)], d = [Math.sin(th), 0, Math.cos(th)];
      const hs = bodyB.hits(c, d, 0.3);
      return { c, d, r: hs.length ? hs[0].d : 0.07 };
    };
    const cin = [];
    for (let k = 0; k < NT; k++) {
      const th = thetaOf(k), y = ropeY(th), q = neckHit(y, th);
      cin.push(madd(q.c, q.d, q.r + 0.005 + 0.003 * (0.5 + 0.5 * Math.sin(th * 13 + 0.7))));
    }
    ring.push(cin);
    // skirt: marched DOWN THE BODY SURFACE from the rope in equal arc-length steps (uniform weave density, no
    // near-horizontal shelf fanned out over the trapezius), 7-12 mm clear of the skin. The last ~13 mm of every
    // column (measured along the cloth from the rope, see skirtArc) is the frayed fringe; the skin under the whole
    // skirt is kept (body trimming below), so the fringe shows the bloody neck, never the sky behind the boss.
    {
      const cur = cin.map((p) => p.slice());
      const dir = cin.map((p) => norm(add(scl(norm([p[0], 0, p[2] - axisZ(p[1])]), 0.3), [0, -1, 0])));
      for (let s = 1; s <= NSK; s++) {
        const f = s / NSK, row = [];
        for (let k = 0; k < NT; k++) {
          const th = thetaOf(k), step = skirtLen(th) / NSK;
          let q = madd(cur[k], dir[k], step);
          const c = bodyB.closest(q);
          let n = c.n;
          if (dot(n, sub(c.p, [0, c.p[1], axisZ(c.p[1])])) < 0) n = scl(n, -1);
          q = madd(c.p, n, 0.007 + 0.003 * f + 0.0015 * (1 + Math.sin(th * 7 + 1.3)) * f);
          const d = norm(sub(q, cur[k]));
          q = madd(cur[k], d, step);                   // exact arc length per row
          dir[k] = norm(add(scl(dir[k], 0.35), scl(d, 0.65)));
          cur[k] = q;
          row.push(q);
        }
        ring.push(row);
      }
    }
    hoodInfo.cin = cin;
    hoodInfo.skirtArc = polyDist([...cin, cin[0]]);
    // ---- two panels with arc-length UVs (uniform weave density), stacked: front v 0.02..0.47, back 0.51..0.96
    const panels = [{ k0: NT / 4, k1: (3 * NT) / 4, kc: NT / 2, v0: 0.02 }, { k0: (3 * NT) / 4, k1: NT + NT / 4, kc: NT, v0: 0.51 }];
    const P = (r, k) => ring[r][((k % NT) + NT) % NT];
    const rowLen = (r, a, b) => { let L = 0; for (let k = a; k < b; k++) L += dist(P(r, k), P(r, k + 1)); return L; };
    let maxHalf = 0, maxMer = 0;
    const pole = add(HC, [0, env[0].reduce((a, x) => a + x, 0) / NT + slack(0, 0) + 0.004, 0]);
    for (const pn of panels) {
      pn.s = ring.map((_, r) => { const out = {}; let acc = 0; out[pn.kc] = 0; for (let k = pn.kc; k < pn.k1; k++) { acc += dist(P(r, k), P(r, k + 1)); out[k + 1] = acc; } acc = 0; for (let k = pn.kc; k > pn.k0; k--) { acc -= dist(P(r, k), P(r, k - 1)); out[k - 1] = acc; } return out; });
      pn.t = [];
      for (let k = pn.k0; k <= pn.k1; k++) { let acc = dist(pole, P(0, k)); const col = [acc]; for (let r = 1; r < R; r++) { acc += dist(P(r - 1, k), P(r, k)); col.push(acc); } pn.t[k] = col; }
      for (let r = 0; r < R; r++) maxHalf = Math.max(maxHalf, Math.abs(pn.s[r][pn.k0]), Math.abs(pn.s[r][pn.k1]));
      for (let k = pn.k0; k <= pn.k1; k++) maxMer = Math.max(maxMer, pn.t[k][R - 1]);
    }
    const UC = 0.6, D = Math.min(0.37 / maxHalf, 0.44 / maxMer);   // u 0.23..0.97 (the rope lives in u < 0.22)
    Object.assign(hoodUV, { D, panels: panels.map((p) => ({ v0: p.v0 })), uc: UC, maxHalf, maxMer });
    const vtx = [];
    for (const [pi, pn] of panels.entries()) {
      const ids = [];
      const pv = hood.v(pole, [UC, pn.v0]);
      for (let r = 0; r < R; r++) {
        const row = [];
        for (let k = pn.k0; k <= pn.k1; k++) row.push(hood.v(P(r, k), [UC + pn.s[r][k] * D, pn.v0 + pn.t[k][r] * D]));
        ids.push(row);
      }
      const W = pn.k1 - pn.k0;
      for (let k = 0; k < W; k++) hood.tri(pv, ids[0][k], ids[0][k + 1]);
      for (let r = 0; r + 1 < R; r++) for (let k = 0; k < W; k++) hood.quad(ids[r][k], ids[r + 1][k], ids[r + 1][k + 1], ids[r][k + 1]);
      vtx.push({ ids, pv, pi });
    }
    hoodInfo.rows = R; hoodInfo.ropeRow = PHI.length + NL; hoodInfo.nVertsCloth = hood.n;
    // ---- rope: twisted hemp round the cinch, a knot at the back-left and two frayed hanging ends
    const ropeR = 0.0062;
    const rp = cin.map((p) => { const c = [0, p[1], axisZ(p[1])]; return madd(p, norm([p[0] - c[0], 0, p[2] - c[2]]), ropeR * 0.75); });
    rp.push(rp[0]);
    tube(hood, rp, ropeR, 5, [0.02, 0.02, 0.2, 0.62], null, { swapUV: true });
    const kp = rp[Math.round(NT * 0.18)];
    const kd = norm([kp[0], 0, kp[2] - axisZ(kp[1])]);
    tube(hood, [madd(kp, kd, -0.002), madd(kp, kd, 0.016)], (t) => 0.012 * Math.sin(Math.PI * (0.15 + 0.7 * t)) + 0.005, 7, [0.02, 0.64, 0.2, 0.72], null, { swapUV: true });
    for (const [dx, dz, l] of [[0.016, 0.006, 0.12], [-0.008, 0.012, 0.085]]) {
      const pts = [];
      for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(add(madd(kp, kd, 0.014 + t * 0.012), [dx * t, -l * t, dz * t * t])); }
      tube(hood, pts, (t) => ropeR * (1 - 0.25 * t), 5, [0.02, dx > 0 ? 0.74 : 0.86, 0.2, dx > 0 ? 0.84 : 0.96], null, { swapUV: true });
    }
    hoodInfo.knot = kp;
    // skin weights: the sack rides on the head, blending to the neck towards the rope; rope / skirt follow the skin
    // the skirt binds to the skin it lies on (body below the rope only: never the head inside the sack)
    const below = fullBody.tris().filter(() => true);
    const belowT = [];
    for (let i = 0; i < below.length; i += 6) {
      const vs = [below[i], below[i + 2], below[i + 4]];
      if (vs.every((v) => { const q = [h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]]; return q[1] < ropeAt(q) - 0.008; })) belowT.push(...below.slice(i, i + 6));
    }
    const skinBelowRope = makeClosestSkinner(h, { tris: () => Int32Array.from(belowT) }, skinAt);
    hoodSkin = (p, i) => {
      if (i >= hoodInfo.nVertsCloth) return skinClosest(p, { allow: ['neck_01', 'head', 'spine_03'] });
      const yr = ropeAt(p);
      if (p[1] < yr - 0.003) return skinBelowRope(p, { exclude: ['head'] });
      const kh = ss(yr + 0.005, yr + 0.06, p[1]);
      return [['head', 0.15 + 0.85 * kh], ['neck_01', 0.85 * (1 - kh)]];
    };
  }
  const hoodPart = toPart(lib, h, hood, 'hood', 'cloth', hoodSkin);

  // =================================================================== APRON (cloth)
  // Heavy leather butcher's apron: the bib hangs from a neck strap and bridges flat across the pecs (no pec or
  // nipple contour), standing off the sternum; the sheet drapes over the gut overhang and hangs to the shins.
  const yTop = lerp(sk.spine_03.head.y, sk.neck_01.head.y, 0.66);
  const yWaist = sk.spine_01.head.y + 0.02;
  const yCrotch = sk.thigh_l.head.y - 0.07;
  const yBot = lerp(sk.calf_l.head.y, sk.foot_l.head.y, 0.3);
  const apron = new Geo();
  const apronInfo = { yTop, yWaist, yCrotch, yBot };
  {
    const halfBody = (y) => { const l = around(outerB, 90, y).p[0], r = around(outerB, -90, y).p[0]; return (l - r) / 2; };
    const hwWaist = halfBody(yWaist) * 0.9, hwHip = Math.max(hwWaist, halfBody(yCrotch + 0.05) * 0.88);
    const hw = (y) => {
      if (y > yTop - 0.11) return lerp(0.165, 0.172, ss(yTop, yTop - 0.11, y));
      if (y > yWaist) return lerp(0.172, hwWaist, ss(yTop - 0.11, yWaist, y));
      return lerp(hwWaist, hwHip + 0.02, ss(yWaist, yBot, y));
    };
    const NU = 15, NV = 23;
    const grid = [];
    const zPrev = new Array(NU).fill(null);
    const lows = [];
    for (let r = 0; r < NV; r++) {
      const lowRow = [];
      lows.push(lowRow);
      const row = [];
      for (let c = 0; c < NU; c++) {
        const u = c / (NU - 1) * 2 - 1;
        // the top edge hangs from the two strap corners: corners lifted, the middle sags a little
        const y = lerp(yTop, yBot, r / (NV - 1)) + (r ? 0 : 0.014 * Math.abs(u) ** 3 - 0.008 * (1 - u * u));
        const x = u * hw(y);
        const hit = outerB.first([x, y, 1.5], [0, 0, -1], 2);
        let z = hit ? hit.p[2] : (zPrev[c] ?? 0.1);
        lowRow.push(z + 0.008);
        z += 0.012 + 0.004 * (1 - Math.abs(u));
        // heavy leather: below the gut it falls almost plumb (stands off the thighs, so the knees can swing
        // under it in walk / run without the sheet following each leg)
        if (zPrev[c] !== null) z = Math.max(z, zPrev[c] - (y < yWaist ? 0.15 : 0.24) * (lerp(yTop, yBot, (r - 1) / (NV - 1)) - y));
        zPrev[c] = z;
        // sides wrap a little around the gut
        const wrap = ss(0.75, 1, Math.abs(u)) * ss(yTop - 0.05, yWaist, y) * 0.02;
        const fold = 0.007 * Math.sin(c * 2.3 + N.noise(c * 0.7, 0.3, 0.1) * 2) * ss(yWaist, yCrotch - 0.05, y) +
          0.016 * Math.sin(u * Math.PI * 2.6 + 0.8 + N.noise(u * 2, y * 3, 0.6) * 0.8) * ss(yWaist - 0.05, yBot, y);
        row.push([x, y, z - wrap + fold]);
      }
      grid.push(row);
    }
    // bib: stiff leather spans flat between the pecs (upper concave envelope of each row), never into the body
    for (let r = 0; r < NV; r++) {
      const y = grid[r][0][1];
      if (y < yWaist + 0.04) continue;
      for (let it = 0; it < 30; it++) for (let c = 1; c + 1 < NU; c++) grid[r][c][2] = Math.max(grid[r][c][2], (grid[r][c - 1][2] + grid[r][c + 1][2]) / 2);
    }
    // smooth the hanging part horizontally (cloth does not follow the gap between the legs)
    for (let it = 0; it < 3; it++) for (let r = 1; r < NV; r++) {
      const y = grid[r][0][1];
      if (y > yCrotch + 0.08) continue;
      const k = ss(yCrotch + 0.08, yCrotch - 0.05, y);
      const zs = grid[r].map((p) => p[2]);
      for (let c = 1; c + 1 < NU; c++) grid[r][c][2] = Math.max(zs[c], lerp(zs[c], (zs[c - 1] + zs[c + 1]) / 2, k));
    }
    // relax the sheet (no zig-zag crease where it leaves the pecs / belly), never into the body
    for (let it = 0; it < 6; it++) {
      const zs = grid.map((row) => row.map((p) => p[2]));
      for (let r = 1; r + 1 < NV; r++) for (let c = 0; c < NU; c++) {
        const nb = [zs[r - 1][c], zs[r + 1][c], zs[r][Math.max(0, c - 1)], zs[r][Math.min(NU - 1, c + 1)]];
        const avg = (nb[0] + nb[1] + nb[2] + nb[3]) / 4;
        grid[r][c][2] = Math.max(lows[r][c], lerp(zs[r][c], avg, 0.5));
      }
    }
    // the top corners fold forward where the strap pulls them
    for (const c of [0, 1, NU - 2, NU - 1]) { const k = c === 0 || c === NU - 1 ? 1 : 0.4; grid[0][c][2] += 0.012 * k; grid[1][c][2] += 0.005 * k; }
    const idx = grid.map((row, r) => row.map((p, c) => apron.v(p, [c / (NU - 1), r / (NV - 1) * AP_V])));
    for (let r = 0; r + 1 < NV; r++) for (let c = 0; c + 1 < NU; c++) apron.quad(idx[r][c], idx[r + 1][c], idx[r + 1][c + 1], idx[r][c + 1]);
    // back layer (the dark flesh side of the hide): the sheet again 2.5 mm behind it, wound the other way, in its
    // own squashed uv band, so a fold that turns the apron over shows dark suede, not the front's tint
    const gN = (r, c) => {
      const a = grid[Math.min(NV - 1, r + 1)][c], b = grid[Math.max(0, r - 1)][c], d = grid[r][Math.min(NU - 1, c + 1)], e = grid[r][Math.max(0, c - 1)];
      const n = norm(cross(sub(d, e), sub(b, a)));
      return n[2] < 0 ? scl(n, -1) : n;
    };
    const idxB = grid.map((row, r) => row.map((p, c) => apron.v(madd(p, gN(r, c), -0.0025), [c / (NU - 1), AP_BV0 + r / (NV - 1) * (AP_BV1 - AP_BV0)])));
    for (let r = 0; r + 1 < NV; r++) for (let c = 0; c + 1 < NU; c++) apron.quad(idxB[r][c], idxB[r][c + 1], idxB[r + 1][c + 1], idxB[r + 1][c]);
    apronInfo.grid = grid;
    // rolled, stitched top hem
    tube(apron, grid[0].map((p) => add(p, [0, -0.002, 0.002])), 0.0042, 4, [0, 0.935, 1, 0.955]);
    // straps: neck loop from the bib corners up over the collarbones and round the back of the neck just under
    // the sack's skirt (following the neck contour); waist ties round the back
    const ribbon = (pts, width, uvr, lift = 0.004) => {
      const proj = pts.map((p) => { const c = trunkB.closest(p); const n = dot(c.n, sub(p, c.p)) < 0 ? scl(c.n, -1) : c.n; return { p: madd(c.p, n, lift), n }; });
      const start = apron.n;
      proj.forEach((q, i) => {
        const t = norm(sub(proj[Math.min(proj.length - 1, i + 1)].p, proj[Math.max(0, i - 1)].p));
        const side = norm(cross(t, q.n));
        const u = lerp(uvr[0], uvr[2], i / (proj.length - 1));
        apron.v(madd(q.p, side, width / 2), [u, uvr[1]]);
        apron.v(madd(q.p, side, -width / 2), [u, uvr[3]]);
      });
      for (let i = 0; i + 1 < proj.length; i++) { const a = start + i * 2; apron.quad(a, a + 2, a + 3, a + 1); }
      return proj;
    };
    const tl = grid[0][NU - 1], tr = grid[0][0];
    const neckPt = (thDeg, extra = 0) => {
      const th = thDeg * Math.PI / 180, front = ss(-0.2, 0.9, Math.cos(th));
      const y = ropeY(th) - lerp(0.034, 0.05, front) - 0.014 - extra;
      const c = [0, y, axisZ(y)], d = [Math.sin(th), 0, Math.cos(th)];
      const hs = bodyB.hits(c, d, 0.35);
      return madd(c, d, (hs.length ? hs[0].d : 0.08) + 0.005);
    };
    // the path is placed by rays from the neck / spine axis (no closest-point snapping, which zig-zags between
    // the neck and the trapezius): over the pecs from the bib corners, then round the neck just under the skirt
    const onSurface = (q, clear = 0.006) => {
      const c = [0, q[1], q[1] > yTop ? axisZ(q[1]) : spineZ(q[1])], d = norm([q[0] - c[0], 0, q[2] - c[2]]);
      const hs = trunkB.hits(c, d, 0.6);
      return { p: madd(c, d, (hs.length ? hs[hs.length - 1].d : len(sub(q, c))) + clear), n: d };
    };
    const ring = [60, 90, 120, 150, 180, -150, -120, -90, -60].map((a) => { const p = neckPt(a, 0.006); return { p, n: norm([p[0], 0, p[2] - axisZ(p[1])]) }; });
    const chestRun = (corner, a0) => [0.3, 0.6, 0.85].map((f) => onSurface(lerp3(corner, a0.p, f)));
    const sPts = [{ p: add(tl, [0, 0.004, 0.004]), n: [0, 0, 1] }, ...chestRun(tl, ring[0]), ...ring, ...chestRun(tr, ring[ring.length - 1]).reverse(), { p: add(tr, [0, 0.004, 0.004]), n: [0, 0, 1] }];
    {
      const P = catmull(sPts.map((q) => q.p), 4), Nn = catmull(sPts.map((q) => q.n), 4).map(norm);
      const start = apron.n, width = 0.024;
      P.forEach((p, i) => {
        const t = norm(sub(P[Math.min(P.length - 1, i + 1)], P[Math.max(0, i - 1)]));
        const sd = norm(cross(t, Nn[i]));
        const u = i / (P.length - 1);
        apron.v(madd(p, sd, width / 2), [u, 0.875]);
        apron.v(madd(p, sd, -width / 2), [u, 0.9]);
      });
      for (let i = 0; i + 1 < P.length; i++) { const a = start + i * 2; apron.quad(a, a + 2, a + 3, a + 1); }
    }
    const wy = yWaist - 0.01;
    const sideL = grid.find((row) => row[0][1] <= wy)[NU - 1], sideR = grid.find((row) => row[0][1] <= wy)[0];
    const tie = catmull([sideL, around(outerB, 120, wy).p, around(outerB, 155, wy).p, around(outerB, 180, wy).p, around(outerB, -155, wy).p, around(outerB, -120, wy).p, sideR], 4);
    ribbon(tie, 0.024, [0, 0.905, 1, 0.93], 0.006);
    // knot + hanging tie ends at the small of the back
    const kb = around(outerB, 178, wy);
    for (const [dx, u0] of [[0.03, 0], [-0.025, 0.5]]) {
      const pts = [];
      for (let i = 0; i <= 6; i++) pts.push(add(madd(kb.p, kb.n, 0.012 + i * 0.002), [dx * i / 6, -0.17 * i / 6, 0]));
      const start = apron.n;
      pts.forEach((p, i) => { const u = u0 + 0.48 * i / (pts.length - 1); apron.v(add(p, [0.012, 0, 0]), [u, 0.962]); apron.v(add(p, [-0.012, 0, 0]), [u, 0.992]); });
      for (let i = 0; i + 1 < pts.length; i++) { const a = start + i * 2; apron.quad(a, a + 1, a + 3, a + 2); }
    }
    apronInfo.knot = kb;
  }
  const torsoBones = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01'];
  const apronPart = toPart(lib, h, apron, 'apron', 'cloth', (p) => {
    if (p[1] > yWaist + 0.02 || p[2] < spineZ(p[1])) return skinClosest(p, { allow: [...torsoBones, 'clavicle_l', 'clavicle_r'] });
    // hanging sheet: one heavy panel on the pelvis (+ a little spine_01 at the waist); the thighs only nudge it
    // (at most ~30 % on the outer edge, ~20 % each in the middle, so the middle follows the AVERAGE of the legs
    // and never folds into a wedge between them), fading out again towards the hem so the bottom swings as a whole
    const t = ss(yWaist + 0.02, yCrotch - 0.04, p[1]);
    const k = 0.4 * ss(yCrotch + 0.08, yCrotch - 0.06, p[1]) * (1 - 0.25 * ss(yCrotch - 0.06, yBot, p[1]));
    const side = ss(-0.2, 0.2, p[0]);
    const wl = k * (0.5 + 0.25 * (side - 0.5) * 2), wr = k * (0.5 - 0.25 * (side - 0.5) * 2);
    return [['spine_01', 0.25 * (1 - t)], ['pelvis', 1 - 0.25 * (1 - t) - wl - wr], ['thigh_l', wl], ['thigh_r', wr]];
  });

  // =================================================================== TUMOUR on the upper back (gore, emissive)
  const tum = new Geo();
  const tumInfo = {};
  {
    const yb = sk.spine_03.head.y + 0.035;
    const hit = bodyB.first([-0.015, yb, -1.5], [0, 0, 1], 2);
    const Bp = hit.p, nB = norm([hit.n[0] * 0.3, hit.n[1] * 0.5, -1]);
    const right = norm(cross([0, 1, 0], nB)); // character's right on the back (-X)... sign checked below
    const up = norm(cross(nB, right));
    const R_ = right[0] < 0 ? right : scl(right, -1); // points to the character's right (-X)
    const blobs = [
      [madd(Bp, nB, 0.006), 0.085],
      [add(madd(Bp, nB, -0.006), add(scl(R_, 0.082), scl(up, 0.052))), 0.06],
      [add(madd(Bp, nB, -0.008), add(scl(R_, -0.075), scl(up, -0.03))), 0.056],
      [add(madd(Bp, nB, -0.01), add(scl(R_, 0.025), scl(up, -0.09))), 0.048],
      [add(madd(Bp, nB, -0.01), add(scl(R_, -0.05), scl(up, 0.085))), 0.043],
      [add(madd(Bp, nB, 0.05), add(scl(R_, 0.034), scl(up, 0.024))), 0.04],
      [add(madd(Bp, nB, 0.038), add(scl(R_, -0.036), scl(up, -0.042))), 0.034],
    ];
    const smin = (a, b, k) => { const hh = clamp01(0.5 + 0.5 * (b - a) / k); return lerp(b, a, hh) - k * hh * (1 - hh); };
    const sdf = (p) => { let d = 1; for (const [c, r] of blobs) d = smin(d, dist(p, c) - r, 0.022); return d; };
    const T0 = madd(Bp, nB, -0.03);
    // icosphere directions
    const ico = new THREE.IcosahedronGeometry(1, 7);
    const pa = ico.attributes.position.array;
    // merge duplicate vertices of the (non-indexed) icosphere
    const key = (i) => `${Math.round(pa[i * 3] * 1e4)},${Math.round(pa[i * 3 + 1] * 1e4)},${Math.round(pa[i * 3 + 2] * 1e4)}`;
    const vmap = new Map(), dirs = [], ui = [], faces = [];
    for (let i = 0; i < pa.length / 3; i++) {
      const k = key(i);
      if (!vmap.has(k)) { vmap.set(k, dirs.length); dirs.push([pa[i * 3], pa[i * 3 + 1], pa[i * 3 + 2]]); }
      ui.push(vmap.get(k));
    }
    for (let t = 0; t < ui.length; t += 3) faces.push([ui[t], ui[t + 1], ui[t + 2]]);
    const pts = dirs.map((d) => {
      let lo = 0, hi = 0.3;
      if (sdf(madd(T0, d, hi)) < 0) return madd(T0, d, hi);
      for (let it = 0; it < 28; it++) { const m = (lo + hi) / 2; if (sdf(madd(T0, d, m)) < 0) lo = m; else hi = m; }
      const p = madd(T0, d, lo);
      // pustules / lumps
      const w = N.worley(p[0] * 60, p[1] * 60, p[2] * 60);
      const bump = 0.007 * (1 - ss(0.0, 0.4, w)) + 0.0025 * N.fbm(p[0] * 90, p[1] * 90, p[2] * 90, 3);
      return madd(p, d, bump);
    });
    const depth = pts.map((p) => dot(sub(p, Bp), nB));
    const vi = new Int32Array(pts.length).fill(-1);
    const span = 0.2;
    for (const f of faces) {
      if (f.every((i) => depth[i] < -0.018)) continue;
      const ids = f.map((i) => {
        if (vi[i] < 0) { const q = sub(pts[i], Bp); vi[i] = tum.v(pts[i], [0.5 + dot(q, R_) / (2 * span), 0.5 + dot(q, up) / (2 * span)]); }
        return vi[i];
      });
      tum.tri(ids[0], ids[1], ids[2]);
    }
    Object.assign(tumInfo, { Bp, nB, R: R_, up, blobs });
  }
  const tumPart = toPart(lib, h, tum, 'tumour', 'gore', (p) => skinAt(p, { allow: ['spine_02', 'spine_03', 'neck_01', 'clavicle_l', 'clavicle_r'] }));

  // =================================================================== CLEAVER (bone blade, gear) + flesh sheath (gore)
  // The right ulna has grown out past the wrist into a 1.6 m bone blade: a rounded, ridged cortical shaft along the
  // spine (a long bone, not a plank), a shallow vascular groove beside it, a body that thins into a crude bevel, bone
  // teeth along the inner half of the edge, chipped notches further out and a clipped point where the spine sweeps
  // down to meet the rising belly. Both faces wobble (organic thickness), the +t face is a little fuller. Muscle
  // and tendon from the forearm climb over the root and run up the faces before they sink into the bone.
  const blade = new Geo(), sheath = new Geo();
  const cleaverInfo = {};
  {
    const W0 = B('hand_r');                         // wrist
    const ax = norm(sub(W0, B('lowerarm_r')));       // forearm direction
    const thumb = sub(B('thumb_01_r'), W0);
    const radial = norm(sub(thumb, scl(ax, dot(thumb, ax))));
    let wd = norm(cross(ax, radial));                // dorsal / lateral side (blade width direction)
    if (wd[0] > 0) wd = scl(wd, -1);
    // rolled 40 deg about the forearm so that, with the arm hanging (and abducted by poseOffsets), the edge points
    // forward and out and the flat faces the thigh: the swing of walk / run carries the blade past the leg
    wd = norm(rot(wd, ax, BLADE_ROLL * Math.PI / 180));
    const td = norm(cross(ax, wd));                  // blade thickness direction
    // a slight scimitar sweep back towards the spine; the edge belly stays convex
    const bend = (s) => 0.024 * clamp01(s / 0.65) ** 2;
    const at = (s, q, t) => add(add(madd(W0, ax, s), scl(wd, q - bend(s))), scl(td, t));
    const L = 0.66, s0 = -0.03, qs = -0.026, tipQ = qs + 0.11;
    // bone teeth (sawtooth leaning towards the tip) on the inner half of the edge, broken notches further out
    const serr = (s) => {
      if (s < 0.05 || s > 0.33) return 0;
      const x = (s - 0.05) / 0.029, k = Math.floor(x), fr = x - k;
      const amp = 0.011 * (0.6 + 0.8 * hash(k * 7 + 3)) * ss(0.05, 0.085, s) * (1 - ss(0.29, 0.33, s));
      return amp * (fr < 0.72 ? fr / 0.72 : (1 - fr) / 0.28);
    };
    const CHIPS = [[0.385, 0.007, 0.011], [0.455, 0.012, 0.006], [0.53, 0.009, 0.013], [0.585, 0.006, 0.006]];
    const chip = (s) => CHIPS.reduce((a, [c, w, d]) => a + d * Math.exp(-(((s - c) / w) ** 2)), 0);
    const widthBase = (s) => lerp(0.055, 0.168, ss(-0.035, 0.13, s)) + 0.02 * Math.sin(Math.PI * clamp01(s / L)) ** 1.5;
    const edgeW = (s) => widthBase(s) - serr(s) - chip(s) + 0.0025 * N.noise(s * 55, 0.4, 2.2) * ss(0.02, 0.1, s);
    const qTopF = (s) => lerp(qs, tipQ, ss(0.36, L, s) ** 1.7);
    const qBotF = (s) => { const e = qs + edgeW(Math.min(s, 0.6)); return s <= 0.5 ? e : lerp(e, tipQ, ss(0.5, L, s) ** 1.25); };
    const rSp = (s) => 0.0175 * (1 - 0.45 * ss(0.0, L, s)) * (1 + 0.25 * ss(0.12, -0.03, s));
    // cross-section, one side (+1 / -1): [q, t] from the spine apex to the edge (q increasing)
    const profile = (s, side) => {
      const qT = qTopF(s), qB = qBotF(s), W = Math.max(1e-4, qB - qT);
      const r = Math.min(rSp(s), W * 0.3), qc = qT + r;
      const k = (side > 0 ? 1.08 : 0.93) * (1 + 0.13 * N.noise(s * 9, side * 3.1, 0.7));
      const ridge = 0.002 + 0.0015 * Math.max(0, N.noise(s * 30, 1.7, side));
      const body = (f) => qT + lerp(2 * r, W, f);
      return [
        [qT - ridge, 0],
        [qc - 0.72 * r, side * 0.66 * r * k],
        [qc, side * r * k],
        [qT + 1.85 * r, side * 0.66 * r * k],
        [body(0.07), side * 0.5 * r * k],                 // vascular groove
        [body(0.16), side * 0.62 * r * k],
        [body(0.45), side * 0.5 * r * k],
        [body(0.72), side * 0.4 * r * k],
        [body(0.88), side * (0.3 * r * k + 0.0012)],        // bevel line
        [qB, 0],
      ];
    };
    // section polygon (closed, counter-clockwise in (q, t)): apex, +t side, edge, -t side back to the apex
    const polygon = (s) => { const a = profile(s, 1), b = profile(s, -1); return [...a, ...b.slice(1, -1).reverse()]; };
    // where a ray from the shaft centre at angle a (0 = towards the edge, pi = over the spine) leaves the section
    const sectionRay = (s, a) => {
      const poly = polygon(s), r = Math.min(rSp(s), 0.3 * (qBotF(s) - qTopF(s)));
      const o = [qTopF(s) + r, 0], d = [Math.cos(a), Math.sin(a)];
      let best = null;
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length], e = [q[0] - p[0], q[1] - p[1]];
        const den = d[0] * e[1] - d[1] * e[0];
        if (Math.abs(den) < 1e-12) continue;
        const w = [p[0] - o[0], p[1] - o[1]];
        const t = (w[0] * e[1] - w[1] * e[0]) / den, u = (w[0] * d[1] - w[1] * d[0]) / den;
        if (t > 0 && u >= 0 && u <= 1 && (!best || t < best)) best = t;
      }
      return [o[0] + d[0] * (best || r), o[1] + d[1] * (best || r)];
    };
    // rows along the blade (denser towards the point); ring: edge -> (-t side) -> apex -> (+t side) -> edge, uv
    // u along the blade (0 .. 0.9), v around by arc length (the seam runs along the thin edge)
    const NR = 30;
    const rowsS = [];
    for (let i = 0; i < NR; i++) rowsS.push(lerp(s0, L, Math.pow(i / (NR - 1), 0.85)));
    const rings = rowsS.map((s) => {
      const a = profile(s, 1), b = profile(s, -1);
      const ring = [...b.slice().reverse(), ...a.slice(1)];        // edge(-) ... apex ... edge(+)
      return ring.map(([q, t]) => at(s, q, t));
    });
    const M = rings[0].length;
    const vAcc = rings.map((ring) => { const acc = [0]; for (let k = 1; k < M; k++) acc.push(acc[k - 1] + dist(ring[k - 1], ring[k])); return acc.map((x) => x / (acc[M - 1] || 1)); });
    const base = blade.n;
    rings.forEach((ring, i) => ring.forEach((p, k) => blade.v(p, [0.9 * i / (NR - 1), 0.004 + 0.992 * vAcc[Math.max(1, Math.min(NR - 2, i))][k]])));
    for (let i = 0; i + 1 < NR; i++) for (let k = 0; k + 1 < M; k++) {
      const a = base + i * M + k, b = a + M;
      blade.quad(a, b, b + 1, a + 1);
    }
    // bony knobs (osteophytes) along the spine ridge near the wrist; small uv cells at u > 0.91
    let cell = 0;
    const cellUV = () => { const k = cell++; return [0.915 + (k % 4) * 0.021, 0.02 + Math.floor(k / 4) * 0.05]; };
    for (const [s, hgt] of [[0.2, 0.026], [0.255, 0.02], [0.31, 0.016], [0.37, 0.012], [0.43, 0.008]]) {
      const apex = at(s, qTopF(s), 0);
      const tip = madd(madd(apex, wd, -hgt), ax, 0.01 + 0.006 * hash(s * 100));
      const ring = [];
      for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; ring.push(add(apex, add(scl(ax, Math.cos(a) * 0.013), scl(td, Math.sin(a) * 0.01)))); }
      const [cu, cv] = cellUV();
      const ids = ring.map((p, k) => blade.v(madd(p, wd, 0.004), [cu + 0.004 * k, cv]));
      const t = blade.v(tip, [cu + 0.01, cv + 0.04]);
      for (let k = 0; k < 5; k++) blade.tri(ids[k], ids[(k + 1) % 5], t);
    }
    // bone spurs breaking out of the forearm along the ulna, leading into the blade spine
    for (const [s, hgt] of [[-0.05, 0.04], [-0.11, 0.032], [-0.17, 0.022]]) {
      const c = madd(W0, ax, s);
      const hs = bodyB.hits(c, scl(wd, -1), 0.12);
      const bs = hs.length ? madd(hs[0].p, wd, 0.004) : madd(c, wd, -0.04);
      const tip = add(madd(bs, wd, -hgt), scl(ax, -hgt * 0.45));
      const ring = [];
      for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; ring.push(add(bs, add(scl(ax, Math.cos(a) * 0.011), scl(td, Math.sin(a) * 0.009)))); }
      const [cu, cv] = cellUV();
      const ids = ring.map((p, k) => blade.v(p, [cu + 0.004 * k, cv]));
      const tv = blade.v(tip, [cu + 0.01, cv + 0.04]);
      for (let k = 0; k < 5; k++) blade.tri(ids[k], ids[(k + 1) % 5], tv);
    }
    Object.assign(cleaverInfo, { W0, ax, wd, td, L, qs, tipQ, edgeW, qTopF, qBotF, rSp, serr, chip, CHIPS, profile, at, bend });

    // flesh sheath: the forearm skin swells into a muscular cuff that grips the blade root; its rim is ragged and
    // climbs much further up the spine side (tongues of muscle) than over the edge side
    const NA = 16;
    const sRows = [-0.13, -0.1, -0.07, -0.045, -0.02, 0.0, 0.02, 0.045, 0.07, 0.095, 0.12, 0.145];
    const ext = (a) => 0.02 + 0.075 * (0.5 - 0.5 * Math.cos(a)) ** 2 + 0.045 * Math.max(0, Math.sin(3 * a + 1.3)) ** 2 + 0.012 * N.noise(a * 2.3, 0.4, 5.1);
    const ringPts = sRows.map((s, ri) => {
      const out = [];
      const lastRows = ss(0.03, 0.145, s);              // the rim rows creep up the blade (more on the spine side)
      for (let k = 0; k <= NA; k++) {
        const a = (k / NA) * Math.PI * 2;
        const sE = s + ext(a) * lastRows;
        const dir = add(scl(wd, Math.cos(a)), scl(td, Math.sin(a)));
        const c = madd(W0, ax, sE);
        const hs = bodyB.hits(c, dir, 0.12);
        const rSkin = hs.length ? hs[0].d : 0.04;
        const pSkin = madd(c, dir, rSkin + 0.002);
        const sq = sectionRay(Math.max(sE, s0), a);
        const thick = lerp(0.008, 0.0014, ss(0.0, 0.145, s)) * (0.7 + 0.5 * Math.max(0, N.noise(a * 1.7, s * 30, 1.3)));
        const pBlade = at(Math.max(sE, s0), sq[0] + Math.cos(a) * thick, sq[1] + Math.sin(a) * thick);
        const k2 = ss(-0.06, 0.05, s);
        let p = lerp3(pSkin, pBlade, k2);
        const swell = 0.011 * Math.sin(Math.PI * clamp01((s + 0.12) / 0.17)) * (0.6 + 0.4 * N.noise(a * 1.7, s * 30, 1.3)) * (1 - k2 * 0.6);
        p = madd(p, dir, swell);
        out.push(p);
      }
      return out;
    });
    const sid = ringPts.map((ring, r) => ring.map((p, k) => sheath.v(p, [0.4 * r / (sRows.length - 1), k / NA * 0.78])));
    for (let r = 0; r + 1 < sRows.length; r++) for (let k = 0; k < NA; k++) sheath.quad(sid[r][k], sid[r][k + 1], sid[r + 1][k + 1], sid[r + 1][k]);
    // tendons: thick cords from the cuff up each face, half sunk into the bone, tapering where they fuse with it
    let ti = 0;
    const tendonAt = (s, f, side, lift) => {
      const pr = profile(s, side), qT = qTopF(s), qB = qBotF(s), q = lerp(qT, qB, f);
      let t = 0;
      for (let i = 0; i + 1 < pr.length; i++) if (q >= pr[i][0] && q <= pr[i + 1][0]) { const u = (q - pr[i][0]) / ((pr[i + 1][0] - pr[i][0]) || 1); t = lerp(pr[i][1], pr[i + 1][1], u); break; }
      return at(s, q, t + side * lift);
    };
    for (const side of [1, -1]) {
      for (const [f0, len0, wig, r0] of side > 0 ? [[0.26, 0.24, 0.6, 0.008], [0.55, 0.16, -0.8, 0.0068]] : [[0.3, 0.2, -0.6, 0.0075], [0.58, 0.13, 0.8, 0.0064]]) {
        const pts = [];
        for (let i = 0; i <= 8; i++) {
          const s = 0.1 + (len0 * i) / 8, tt = i / 8;
          const f = f0 + Math.sin(i * 0.8 + f0 * 7) * 0.035 * wig - 0.04 * tt * Math.sign(wig);
          pts.push(tendonAt(s, f, side, r0 * lerp(0.1, -0.45, tt ** 1.5)));
        }
        tube(sheath, pts, (tt) => r0 * lerp(1, 0.08, tt ** 1.3), 5, [0.44, 0.8 + ti * 0.045, 1, 0.84 + ti * 0.045]);
        ti++;
      }
    }
  }
  const rigidR = () => [['lowerarm_r', 1]];
  const bladePart = toPart(lib, h, blade, 'cleaver', 'gear', rigidR);
  const sheathPart = toPart(lib, h, sheath, 'cleaver_flesh', 'gore', (p) => {
    const s = dot(sub(p, cleaverInfo.W0), cleaverInfo.ax);
    return s > -0.05 ? [['lowerarm_r', 1]] : skinAt(p, { allow: ['lowerarm_r', 'upperarm_r'] });
  });

  // =================================================================== CHAINS + MEAT HOOKS (gear)
  const chains = new Geo();
  const chainInfo = { links: 0 };
  {
    const outer2 = makeBVH([trunkSurf, surf(suit), surf(apronPart)]);
    const project = (p, clear, axisOut = true) => {
      const c = outer2.closest(p);
      const ctr = [0, c.p[1], spineZ(c.p[1])];
      let n = c.n;
      if (axisOut && dot(n, sub(c.p, ctr)) < 0) n = scl(n, -1);
      return { p: madd(c.p, n, clear), n };
    };
    const LI = 0.056, WI = 0.028, RW = 0.0088; // inner length / width, wire radius (human scale)
    let uvSlot = 0;
    // links: 10 x 8 slots in v 0..0.8 (hooks own v 0.82..1)
    const slotUV = () => { const k = uvSlot++ % 80; const cx = k % 10, cy = Math.floor(k / 10); return [cx / 10, cy / 10, (cx + 1) / 10, (cy + 1) / 10 - 0.004]; };
    const link = (c, T, side, nrm, standing) => {
      // elongated hexagon centre line in the plane (T, side)
      const hl = LI / 2 + RW * 0.5, hw = WI / 2 + RW * 0.5;
      const cl = [[hl, 0], [hl * 0.62, hw], [-hl * 0.62, hw], [-hl, 0], [-hl * 0.62, -hw], [hl * 0.62, -hw], [hl, 0]];
      const pts = cl.map(([a, b]) => add(add(c, scl(T, a)), scl(side, b)));
      const uvr = slotUV();
      tube(chains, pts, RW, standing ? 3 : 4, uvr, null, { ref: nrm });
      chainInfo.links++;
    };
    const lay = (P, { lift = 0, skin }) => {
      for (let i = 0; i < P.length; i++) {
        const T = norm(sub(P[Math.min(P.length - 1, i + 1)], P[Math.max(0, i - 1)]));
        const pr = project(P[i], 0);
        const n = norm(sub(pr.n, scl(T, dot(pr.n, T))));
        const side = norm(cross(T, n));
        const standing = i % 2 === 1;
        const c = madd(pr.p, n, (standing ? WI / 2 + RW : RW) + 0.003 + (typeof lift === 'function' ? lift(i) : lift));
        const g0 = chains.n;
        link(c, T, standing ? n : side, n, standing);
        const w = skin(c, i / (P.length - 1));
        for (let v = g0; v < chains.n; v++) chains.W[v] = w;
      }
      return P;
    };
    const chainPath = (sgn) => {
      // sgn = +1: from a hook in the LEFT shoulder blade over the left trap, across the chest to the right hip
      const backHook = around(trunkB, 180 - sgn * 34, sk.spine_03.head.y + 0.03);
      // over the trapezius well out from the neck (clear of the sack's skirt)
      const trap = outerB.first([sgn * 0.158, 2.5, spineZ(sk.neck_01.head.y) - 0.012], [0, -1, 0], 3).p;
      const pts = [
        madd(backHook.p, backHook.n, 0.01),
        madd(around(trunkB, 180 - sgn * 50, lerp(sk.spine_03.head.y, trap[1], 0.65)).p, [0, 0, -1], 0.01),
        add(trap, [0, 0.015, 0]),
        madd(around(outerB, sgn * 42, lerp(trap[1], yTop, 0.55)).p, [0, 0, 1], 0.015),
        madd(around(outerB, sgn * 14, yTop - 0.06 - (sgn > 0 ? 0 : 0.05)).p, [0, 0, 1], 0.02),
        madd(around(outerB, -sgn * 22, lerp(yTop, yWaist, 0.75)).p, [0, 0, 1], 0.02),
        madd(around(outerB, -sgn * 40, yWaist - 0.05).p, [0, 0, 1], 0.02),
        madd(around(outerB, -sgn * 50, yWaist - 0.11).p, [0, 0, 1], 0.02),
      ];
      return { pts, backHook };
    };
    // pinned to the skin under them: every link takes the skin's OWN bone mix at its contact point (closest
    // point on the base mesh: trapezius links carry neck / clavicle / upper-arm weights like the skin there, so
    // they ride on the shoulder when the arm is raised instead of hanging in the air); never the head, the
    // forearms or the legs
    const torsoSkin = (c) => skinClosest(c, { allow: ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r'] });
    chainInfo.paths = [];
    const built = [1, -1].map((sgn) => { const { pts, backHook } = chainPath(sgn); return { sgn, backHook, P: resample(catmull(pts, 8), LI) }; });
    // where the two chains cross on the chest, the second passes over the first (no interpenetrating links)
    let best = { d: 9, i: 0, j: 0 };
    built[0].P.forEach((a, i) => built[1].P.forEach((b, j) => { const d = dist(a, b); if (d < best.d) best = { d, i, j }; }));
    chainInfo.cross = best;
    for (const [n, { sgn, backHook, P: Pc }] of built.entries()) {
      const i0 = n === 0 ? best.i : best.j, sign = n === 0 ? -0.35 : 1;
      const P = lay(Pc, { lift: (i) => sign * 2.6 * RW * Math.exp(-(((i - i0) * LI / 0.075) ** 2)), skin: (c) => torsoSkin(c) });
      const end = P[P.length - 1];
      const hip = project(end, 0.02);
      chainInfo.paths.push({ sgn, P, tailEnd: madd(hip.p, hip.n, RW + 0.004), hipN: hip.n, backHook });
    }
    // meat hooks: S-hook profile in a plane (x = outwards, y = up), tube tapering to a point
    const hookCurve = (scale = 1) => {
      const pts = [];
      // small top hook through the last link
      for (let i = 0; i <= 4; i++) { const a = Math.PI * (0.1 + 0.9 * i / 4); pts.push([Math.cos(a) * 0.012, 0.035 + Math.sin(a) * 0.012]); }
      pts.reverse();
      pts.push([0.012 * 0, 0.01], [0, -0.04]);
      // big J
      for (let i = 1; i <= 7; i++) { const a = Math.PI * (1.0 + 0.85 * i / 7); pts.push([0.032 + Math.cos(a) * 0.032, -0.04 + Math.sin(a) * 0.034]); }
      pts.push([0.066, -0.02]);
      return pts.map(([x, y]) => [x * scale, y * scale]);
    };
    const hook = (top, out, upv, sc, w, uvr) => {
      const side = norm(cross(upv, out));
      const pts = hookCurve(sc).map(([x, y]) => add(add(top, scl(out, x)), scl(upv, y)));
      tube(chains, pts, (t) => 0.0058 * sc * (t > 0.82 ? lerp(1, 0.12, (t - 0.82) / 0.18) : 1), 5, uvr, w, { ref: side });
      (chainInfo.tips ||= []).push(pts[pts.length - 1], pts[pts.length - 3]);
    };
    chainInfo.hooks = [];
    for (const c of chainInfo.paths) {
      // hanging hooks at the end of each tail
      const out = norm([c.hipN[0], 0, c.hipN[2]]);
      const fwd = norm(cross([0, 1, 0], out));
      const top = add(c.tailEnd, [0, -LI * 0.45, 0]);
      const thigh = c.sgn > 0 ? 'thigh_r' : 'thigh_l';
      hook(top, fwd, [0, 1, 0], 1.7, [['pelvis', 0.5], [thigh, 0.5]], c.sgn > 0 ? [0, 0.82, 0.5, 0.9] : [0.5, 0.82, 1, 0.9]);
      chainInfo.hooks.push({ p: top, kind: 'hang' });
      // pierced hook in the shoulder blade: the J goes under the skin and out again
      const bh = c.backHook;
      const upb = norm(sub([0, 1, 0], scl(bh.n, dot([0, 1, 0], bh.n))));
      const hp = madd(c.P[0], bh.n, 0.004);
      const pts = [];
      pts.push(madd(hp, upb, 0.012));
      for (let i = 0; i <= 8; i++) {
        const a = Math.PI * i / 8;
        const along = -0.03 - Math.sin(a) * 0.02 - i * 0.004;
        const depth = 0.012 - Math.sin(a) * 0.03 + (i / 8) * 0.004;
        pts.push(add(madd(hp, upb, along), scl(bh.n, depth)));
      }
      tube(chains, pts, (t) => 0.0062 * (t > 0.8 ? lerp(1, 0.15, (t - 0.8) / 0.2) : 1), 5, c.sgn > 0 ? [0, 0.91, 0.5, 0.995] : [0.5, 0.91, 1, 0.995], torsoSkin(hp), { ref: bh.n });
      chainInfo.hooks.push({ p: hp, n: bh.n, up: upb, kind: 'pierce' });
    }
  }
  const chainPart = toPart(lib, h, chains, 'chains', 'gear', (p) => skinClosest(p, { allow: ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r'] }));

  // =================================================================== body trimming
  // right hand gone (the forearm ends in the cleaver)
  const handR = new Set(h.skeleton.bones.filter((b) => b.name === 'hand_r' || /_0\d_r$/.test(b.name)).map((b) => b.index));
  const handW = new Float32Array(h.pos.length / 3);
  h.weights.forEach((l, v) => { for (const [b, w] of l) if (handR.has(b)) handW[v] += w; });
  // Only skin INSIDE the closed sack goes: a vertex counts as covered when it sits above the rope and the sack
  // cloth lies over it (a ray along its normal, or outwards from the neck axis, hits the hood within 9 cm); a face
  // goes when all its corners are covered. The neck / trapezius under the skirt and the shoulders around it stay,
  // so the fringe never shows the background. A window round the eyes stays too (sockets behind the eye holes).
  // Feet / ankles inside the boots go (no toes poking through the shoe).
  const eyeWin = (p) => Math.abs(p[1] - eyeY) < 0.03 && Math.abs(p[0]) < 0.065 && p[2] > A.eyeL[2] - 0.035;
  const inSack = new Uint8Array(h.pos.length / 3);
  {
    const hoodB = makeBVH([surf(hoodPart)]);
    const bn = fullBody.normals();
    for (const v of h.baseObj.groupVerts('body')) {
      const p = [h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]];
      if (p[1] < ropeAt(p) + 0.004 || eyeWin(p)) continue;
      const n = norm([bn[v * 3], bn[v * 3 + 1], bn[v * 3 + 2]]), o = norm([p[0], 0, p[2] - axisZ(p[1])]);
      if (hoodB.first(p, n, 0.09) || hoodB.first(p, o, 0.09)) inSack[v] = 1;
    }
  }
  body.obj.faces.forEach((f, fi) => {
    if (f.v.every((v) => handW[v] > 0.35)) body.keep[fi] = 0;
    else if (f.v.every((v) => inSack[v])) body.keep[fi] = 0;
    else if (f.v.every((v) => h.pos[v * 3 + 1] < bootTop - 0.012)) body.keep[fi] = 0;
  });
  // stray slivers / islands left by the cuts (the eye window stays)
  const droppedIslands = dropIslands(body, 60, (c) => Math.min(dist(c, A.eyeL), dist(c, A.eyeR)) < 0.06);
  console.log('  body: dropped', droppedIslands, 'faces in small islands');

  // =================================================================== TEXTURES
  const set = (c, k) => { c[0] = k[0]; c[1] = k[1]; c[2] = k[2]; };
  const CI = cleaverInfo, T = tumInfo, AP = apronInfo;

  // ---- trousers: dark, filthy work trousers ripped off at the boot tops, worn-through knees, a burst seam on the left thigh
  const suitBase = grade(cropUV(await lib.texture(suit.asset.textures.diffuse, 2048), suitCrop, 1024, lib.resize), (c) => {
    const l = lum(c);
    const g = [l * 0.95, l * 0.84, l * 0.62];
    for (let k = 0; k < 3; k++) c[k] = lerp(c[k], g[k], 0.88) * 0.52;
  });
  const thighSegL = boneSeg(sk.thigh_l);
  const tearW = (P) => {
    let w = ss(bootTop - 0.01, bootTop - 0.055, P[1] + N.fbm(P[0] * 14, P[1] * 4, P[2] * 14, 3) * 0.04) * 1.5;
    const tl = thighSegL(P);
    if (tl.d < 0.17 && P[0] > B('thigh_l')[0] + 0.04) {
      const seam = Math.abs(P[2] - B('thigh_l')[2] - 0.005) + Math.abs(N.noise(P[1] * 30, 0.5, 0.2)) * 0.018;
      w = Math.max(w, (1 - ss(0.0, 0.03, seam)) * ss(0.12, 0.3, tl.t) * (1 - ss(0.55, 0.75, tl.t)) * 1.1);
    }
    return w;
  };
  const cloth = lib.paintCloth(suit, {
    seed: 31, human: h, base: suitBase,
    normal: cropUV(await lib.texture(suit.asset.textures.normal, 2048), suitCrop, 512, lib.resize), ao: cropUV(await lib.texture(suit.asset.textures.ao, 2048), suitCrop, 256, lib.resize),
    size: 1024, normalSize: 512, ormSize: 256,
    fade: 0.3, grime: 1, grimeNoise: 1.1, weave: 0.8, innerDarken: 0,
    blood: { hands: 0.6, splatter: 0.55, edges: 0.7 },
    tear: { amount: 0.22, scale: 6, fray: 0.9, where: tearW, threadColor: [0.1, 0.085, 0.06] },
  });
  // the seat and the backs of the legs (the view players shoot the tumour from): lighter, dusty, worn fabric so
  // the lower half does not read as one black mass from behind; mud splashes low on the calves
  {
    const R = texSize(512), sS = { tris: suit.tris(), pos: suit.pos, nrm: suit.normals() };
    const back = bakeField(sS, suit.obj.uvs, R, (P, Nn) => ss(0.15, -0.55, Nn[2]) * (0.75 + 0.25 * ss(-0.3, 0.4, N.fbm(P[0] * 6, P[1] * 6, P[2] * 6, 3))), { fill: 0, blur: 2 });
    const mud = bakeField(sS, suit.obj.uvs, R, (P) => (1 - ss(bootTop + 0.02, bootTop + 0.22, P[1])) * ss(0.05, 0.5, N.fbm(P[0] * 16 + 3, P[1] * 16, P[2] * 16, 3)), { fill: 0, blur: 1 });
    applyFields(cloth.albedo, [back, mud], R, (c, b, m) => {
      const k = 1 + 1.0 * b; c[0] *= k; c[1] *= k * 0.985; c[2] *= k * 0.95;
      over(c, lin([104, 92, 74]), b * 0.18);
      over(c, lin([92, 78, 60]), m * 0.45);
    });
  }
  suit.material = lib.material('cloth', { ...cloth, alpha: cloth.alpha, doubleSided: true, pngBits: 6 });
  h.hideCovered(body, (p) => cloth.holeAt(p, 0.1));

  // ---- skin: pale, sickly, stretched; striae, bulging veins, scars, chafing under the chains, blood everywhere
  const skinBase = grade(lib.cloneImage(await lib.texture('system', 'skins/old_caucasian_male/old_lightskinned_male_diffuse.png', 2048)), (c) => {
    const l = lum(c);
    const g = [l * 1.04, l * 0.8, l * 0.66];
    for (let k = 0; k < 3; k++) c[k] = lerp(c[k], g[k], 0.72) * 0.45;
  });
  const sUAl = boneSeg(sk.upperarm_l), sUAr = boneSeg(sk.upperarm_r), sLAl = boneSeg(sk.lowerarm_l), sLAr = boneSeg(sk.lowerarm_r);
  const armDirL = norm(sub(B('lowerarm_l'), B('upperarm_l'))), armDirR = norm(sub(B('lowerarm_r'), B('upperarm_r')));
  const perpL = norm(cross(armDirL, [0, 0, 1])), perpR = norm(cross(armDirR, [0, 0, 1]));
  const chainD = chainInfo.paths.map((c) => polyDist(c.P));
  const pierce = chainInfo.hooks.filter((k) => k.kind === 'pierce').flatMap((k) => [madd(k.p, k.up, -0.042), madd(k.p, k.up, -0.066)].map((p) => ({ p: bodyB.closest(p).p })));
  const knuckles = ['index_01_l', 'middle_01_l', 'ring_01_l', 'pinky_01_l'].map(B);
  const scarA = [around(trunkB, 40, yTop + 0.01).p, around(trunkB, 6, yTop - 0.13).p];   // stitched gash across the left pec
  const scarB = [around(trunkB, -70, yWaist + 0.1).p, around(trunkB, -38, yWaist - 0.02).p]; // stapled cut on the right flank
  const scarC = [around(trunkB, 150, yWaist + 0.16).p, around(trunkB, 115, yWaist + 0.02).p]; // stitched, on the left lower back
  const veinRegion = (P) => {
    let w = 0.16;
    for (const [s, k] of [[sLAl, 1], [sLAr, 1.1], [sUAl, 0.8], [sUAr, 0.9]]) { const q = s(P); if (q.t > -0.15 && q.t < 1.05 && q.d < 0.1) w = Math.max(w, k * ss(-0.15, 0.1, q.t)); }
    w = Math.max(w, (1 - ss(0.08, 0.3, dist(P, T.Bp))) * 1.3);
    if (P[1] > yTop - 0.1 && P[1] < cinchY) w = Math.max(w, 0.6);
    return w;
  };
  const veinAt = (P) => {
    const v = N.ridged(P[0] * 19, P[1] * 19, P[2] * 19, 3);
    const gate = ss(-0.3, 0.3, N.fbm(P[0] * 4.5 + 9, P[1] * 4.5, P[2] * 4.5, 2));
    return ss(0.62, 0.88, v) * gate * veinRegion(P);
  };
  const tumVein = (P) => {
    const q = sub(P, T.Bp), dT = len(q);
    if (dT > 0.34 || dT < 0.05) return 0;
    const a = Math.atan2(dot(q, T.up), dot(q, T.R));
    const wv = N.noise(P[0] * 22, P[1] * 22, P[2] * 22) * 1.4 + N.noise(P[0] * 60, P[1] * 60, P[2] * 60) * 0.35;
    const sv = Math.abs(Math.sin(a * 5.5 + wv)) * dT;
    const line = 1 - ss(0.002, 0.006, sv);
    const fade = ss(0.05, 0.085, dT) * (1 - ss(0.12, 0.34, dT + N.fbm(P[0] * 8, P[1] * 8, P[2] * 8, 2) * 0.07));
    return line * fade;
  };
  const scar = (P, Nn, c, st, seg, kind) => {
    const [a, b] = seg, d = sub(b, a), Lg = len(d), dir = scl(d, 1 / Lg);
    const t = dot(sub(P, a), dir);
    if (t < -0.015 || t > Lg + 0.015) return;
    const off = sub(P, madd(a, dir, Math.max(0, Math.min(Lg, t))));
    if (len(off) > 0.03) return;
    const perp = norm(cross(dir, Nn));
    const ac = dot(off, perp) + N.noise(t * 40, 0.3, 1.1) * 0.002;
    const endFade = ss(-0.01, 0.01, t) * ss(Lg + 0.01, Lg - 0.01, t);
    const line = (1 - ss(0.0015, 0.0045, Math.abs(ac))) * endFade;
    over(c, lin([168, 104, 102]), line * 0.75); st.h += line * 0.9; st.ro = lerp(st.ro, 0.38, line);
    over(c, lin([134, 58, 58]), (1 - ss(0.004, 0.014, Math.abs(ac))) * endFade * 0.4);
    if (kind === 'stitch') {
      const m = (((t % 0.013) + 0.013) % 0.013) - 0.0065;
      const th = (1 - ss(0.0008, 0.0018, Math.min(Math.abs(m - ac * 0.8), Math.abs(m + ac * 0.8)))) * (1 - ss(0.006, 0.0085, Math.abs(ac))) * endFade;
      over(c, lin([22, 14, 12]), th * 0.95); st.h += th * 1.1; st.ro = lerp(st.ro, 0.65, th);
      st.bl = Math.max(st.bl, (1 - ss(0.0005, 0.0025, Math.abs(Math.abs(ac) - 0.0068))) * (1 - ss(0.0015, 0.003, Math.abs(m))) * endFade * 0.9);
    } else {
      const m = (((t % 0.017) + 0.017) % 0.017) - 0.0085;
      const bar = (1 - ss(0.0009, 0.0016, Math.abs(m))) * (1 - ss(0.0055, 0.007, Math.abs(ac)));
      const legs = (1 - ss(0.0012, 0.002, Math.abs(Math.abs(ac) - 0.006))) * (1 - ss(0.0012, 0.002, Math.abs(m)));
      const k = Math.max(bar, legs) * endFade;
      over(c, lin([118, 112, 104]), k * 0.9); st.h += bar * endFade * 1.2; st.ro = lerp(st.ro, 0.3, k);
      st.bl = Math.max(st.bl, legs * endFade * 0.6);
    }
  };
  const crust = lin([70, 14, 10]), crustB = lin([34, 9, 7]);
  const skinExtra = (P, Nn, c, st) => {
    // corpse marbling: greenish-yellow blotches and flushed pink-red patches
    const g = N.fbm(P[0] * 4 + 3, P[1] * 4, P[2] * 4, 3);
    mul(c, [0.86, 0.95, 0.7], ss(0.15, 0.6, g) * 0.5);
    mul(c, [1.06, 0.8, 0.86], ss(0.2, 0.7, -g) * 0.45);
    // broad tone variation (no uniform cream): sallow grey-brown patches, capillary mottling (purple-red lace)
    over(c, lin([138, 118, 98]), ss(-0.15, 0.5, N.fbm(P[0] * 2.5 + 7, P[1] * 2.5, P[2] * 2.5, 3)) * 0.42);
    const lace = N.worley(P[0] * 26, P[1] * 26, P[2] * 26);
    mul(c, [0.84, 0.7, 0.78], (1 - ss(0.04, 0.16, Math.abs(lace - 0.5))) * ss(0.1, 0.6, N.fbm(P[0] * 7 + 1, P[1] * 7, P[2] * 7, 2) + 0.2) * 0.55);
    // micro detail for the giant's close-ups: pores (small pits), a fine cross-hatch of skin creases and a strong
    // roughness break-up (oily sheen on chest / shoulders / back, dry dull patches, sweat-glossy folds)
    const pw = N.worley(P[0] * 450, P[1] * 450, P[2] * 450);
    const pore = (1 - ss(0.1, 0.24, pw)) * (0.45 + 0.55 * ss(-0.2, 0.4, N.noise(P[0] * 40, P[1] * 40, P[2] * 40)));
    st.h -= pore * 0.3; mul(c, [0.88, 0.8, 0.78], pore * 0.3);
    const xh = Math.min(Math.abs(N.noise(P[0] * 210, P[1] * 70, P[2] * 210)), Math.abs(N.noise(P[0] * 70 + 5, P[1] * 210, P[2] * 70)));
    st.h -= (1 - ss(0.0, 0.05, xh)) * 0.14;
    const oil = ss(-0.1, 0.5, N.fbm(P[0] * 6 + 11, P[1] * 6, P[2] * 6, 3));
    st.ro = lerp(st.ro, 0.34, oil * 0.65);
    st.ro = lerp(st.ro, 0.8, ss(0.1, 0.6, -N.fbm(P[0] * 9 + 3, P[1] * 9, P[2] * 9, 3)) * 0.7);
    st.ro += N.fbm(P[0] * 60, P[1] * 60, P[2] * 60, 2) * 0.12 + pore * 0.1;
    // stretch marks: the front of the shoulders / armpits (along the arm) and the flanks (oblique)
    let sm = 0;
    for (const [s, perp, adir] of [[sUAl, perpL, armDirL], [sUAr, perpR, armDirR]]) {
      const q = s(P);
      if (q.t < -0.35 || q.t > 0.75 || q.d > 0.12) continue;
      const region = ss(-0.3, -0.12, q.t) * (1 - ss(0.2, 0.42, q.t)) * ss(0.0, 0.5, Nn[2]) * ss(0.35, 0.65, N.fbm(P[0] * 6, P[1] * 6, P[2] * 6, 2) + 0.5);
      if (region <= 0) continue;
      const f = dot(P, perp) / 0.0075 + N.noise(P[0] * 25, P[1] * 25, P[2] * 25) * 0.7;
      const line = 1 - ss(0.06, 0.2, Math.abs(f - Math.round(f)));
      const brk = ss(-0.1, 0.35, N.noise(dot(P, adir) * 35, Math.round(f) * 0.37, 1.7));
      sm = Math.max(sm, line * brk * region);
    }
    if (P[1] > yWaist - 0.12 && P[1] < yWaist + 0.24 && Math.abs(P[0]) > 0.08) {
      const region = ss(0.08, 0.15, Math.abs(P[0])) * ss(yWaist - 0.12, yWaist - 0.03, P[1]) * (1 - ss(yWaist + 0.12, yWaist + 0.24, P[1]));
      const f = (P[1] + 0.45 * Math.abs(P[0]) - 0.2 * P[2]) / 0.009 + N.noise(P[0] * 20, P[1] * 20, P[2] * 20) * 0.8;
      const line = 1 - ss(0.07, 0.22, Math.abs(f - Math.round(f)));
      const brk = ss(-0.1, 0.3, N.noise(P[0] * 30 + P[2] * 30, Math.round(f) * 0.41, 3.1));
      sm = Math.max(sm, line * brk * region);
    }
    if (P[1] > yWaist - 0.09 && P[1] < yWaist + 0.16 && P[2] > spineZ(P[1]) + 0.05) {
      const region = ss(yWaist - 0.09, yWaist - 0.04, P[1]) * (1 - ss(yWaist + 0.08, yWaist + 0.16, P[1])) * ss(0.02, 0.07, Math.abs(P[0]) + 0.03) * ss(0.25, 0.6, N.fbm(P[0] * 5 + 2, P[1] * 5, P[2] * 5, 2) + 0.5);
      const f = (P[1] - 2.2 * P[0] * P[0]) / 0.0085 + N.noise(P[0] * 22, P[1] * 22, P[2] * 22) * 0.8;
      const line = 1 - ss(0.07, 0.22, Math.abs(f - Math.round(f)));
      const brk = ss(-0.1, 0.3, N.noise(P[0] * 35, Math.round(f) * 0.37, 6.1));
      sm = Math.max(sm, line * brk * region);
    }
    if (sm > 0) {
      const fresh = ss(-0.2, 0.4, N.noise(P[0] * 9, P[1] * 9, P[2] * 9 + 4));
      over(c, mix3(lin([200, 182, 176]), lin([128, 56, 74]), fresh), sm * 0.55);
      st.h -= sm * 0.25; st.ro = lerp(st.ro, 0.42, sm * 0.6);
    }
    // bulging veins (dark blue-green under the pale skin), radiating from the tumour
    const vv = Math.max(veinAt(P), tumVein(P) * 1.1);
    if (vv > 0) { over(c, lin([70, 80, 94]), vv * 0.6); st.h += vv * 1.1; }
    // inflamed, swollen skin around the tumour
    const dT = dist(P, T.Bp);
    const infl = 1 - ss(0.08, 0.22, dT + N.fbm(P[0] * 10, P[1] * 10, P[2] * 10, 3) * 0.03);
    if (infl > 0) { over(c, lin([118, 40, 52]), infl * 0.55); mul(c, [0.8, 0.7, 0.8], (1 - ss(0.07, 0.11, dT)) * 0.5); st.ro = lerp(st.ro, 0.35, infl); }
    // raw chafing where the chains rub
    let cd = 0.05;
    for (const f of chainD) cd = Math.min(cd, f(P, 0.05));
    if (cd < 0.035) {
      const k = 1 - ss(0.01, 0.032, cd + N.noise(P[0] * 60, P[1] * 60, P[2] * 60) * 0.006);
      over(c, lin([150, 52, 44]), k * 0.6); mul(c, [0.7, 0.55, 0.5], k * 0.4); st.ro = lerp(st.ro, 0.38, k);
      st.bl = Math.max(st.bl, k * ss(0.2, 0.6, N.noise(P[0] * 80, P[1] * 80, P[2] * 80)) * 0.7);
    }
    // meat hooks through the shoulder blades: puncture holes, stretched skin, trickles of blood
    for (const pc of pierce) {
      const d = dist(P, pc.p);
      if (d > 0.17) continue;
      const hole = 1 - ss(0.004, 0.007, d), rim = 1 - ss(0.006, 0.018, d);
      over(c, lin([156, 76, 80]), rim * 0.6); over(c, lin([16, 4, 4]), hole); st.h += rim * 0.3 - hole * 1.5;
      const below = pc.p[1] - P[1];
      if (below > 0 && below < 0.16) {
        const lat = P[0] - pc.p[0] - Math.sin(below * 40) * 0.003;
        for (const [o2, wd2, ln] of [[0, 0.003, 0.15], [0.007, 0.002, 0.08]]) st.bl = Math.max(st.bl, (1 - ss(wd2 * 0.6, wd2, Math.abs(lat - o2))) * (1 - ss(ln * 0.8, ln, below)) * 0.95);
      }
      st.bl = Math.max(st.bl, (1 - ss(0.007, 0.015, d)) * 0.9);
    }
    // blood soaked out of the sack, running down the neck, chest and back
    {
      const below = ropeAt(P) - 0.03 - P[1];   // from under the skirt down
      const r = Math.hypot(P[0], P[2] - hoodInfo.neckZ);
      if (below > -0.02 && below < 0.32 && r < 0.2) {
        const lenMax = 0.03 + 0.15 * ss(-0.2, 0.6, N.noise(P[0] * 14 + P[2] * 9, 0.7, 2.3));
        const streak = ss(0.3, 0.6, N.noise(Math.atan2(P[0], P[2] - hoodInfo.neckZ) * 12, below * 3, 1.9)) * 0.75;
        const back = ss(0.2, -0.4, Nn[2]);
        const k = streak * (1 - ss(lenMax * 0.7, lenMax, below)) * (1 - back * 0.75) + (1 - ss(0.0, 0.03, below)) * 0.85;
        st.bl = Math.max(st.bl, Math.min(1, k) * 0.9);
      }
    }
    // left fist: swollen, bruised knuckles with split skin
    for (const kp of knuckles) {
      const d = dist(P, kp);
      if (d > 0.045) continue;
      const k = 1 - ss(0.01, 0.035, d);
      over(c, lin([96, 52, 74]), k * 0.55);
      const split = (1 - ss(0.004, 0.01, d)) * ss(0.0, 0.3, N.noise(P[0] * 200, P[1] * 200, P[2] * 200) + 0.2);
      over(c, lin([120, 24, 24]), split); st.bl = Math.max(st.bl, k * 0.65);
    }
    // right forearm where the flesh grows into the cleaver: inflamed, purple, bloody
    {
      const q = sub(P, CI.W0), s = dot(q, CI.ax), rr = len(sub(q, scl(CI.ax, s)));
      if (s > -0.28 && s < 0.02 && rr < 0.1) {
        const k = ss(-0.28, -0.12, s);
        over(c, lin([126, 50, 60]), k * 0.6); mul(c, [0.85, 0.7, 0.75], k * 0.4);
        st.bl = Math.max(st.bl, ss(-0.17, -0.11, s) * ss(0.1, 0.5, N.fbm(P[0] * 30, P[1] * 30, P[2] * 30, 3) + 0.3) * 0.8);
      }
    }
    scar(P, Nn, c, st, scarA, 'stitch');
    scar(P, Nn, c, st, scarB, 'staple');
    scar(P, Nn, c, st, scarC, 'stitch');
    // a butcher's job: fine blood spray over the chest, arms and belly
    const spray = N.worley(P[0] * 70, P[1] * 70, P[2] * 70);
    const sprayMask = ss(0.25, 0.7, N.fbm(P[0] * 3 + 5, P[1] * 3, P[2] * 3, 2) + 0.35) * ss(-0.2, 0.4, Nn[2] + 0.2);
    st.bl = Math.max(st.bl, (1 - ss(0.04, 0.085, spray)) * sprayMask * 0.7);
    // every painted blood mark becomes dried crust (dark brown-maroon, flaky); a few wet cores stay
    if (st.bl > 0) {
      const b = Math.min(1, st.bl);
      const age = ss(-0.45, 0.35, N.noise(P[0] * 22 + 70, P[1] * 22, P[2] * 22));
      over(c, mix3(crust, crustB, age), ss(0.0, 0.5, b) * 0.92);
      st.ro = lerp(st.ro, lerp(0.3, 0.6, age), b);
      st.h += ss(0.45, 0.95, b) * 0.25;
      st.bl = b * 0.1;
    }
  };
  const skin = lib.paintSkin(h, {
    seed: 17, base: skinBase, size: 2048, normalSize: 2048, ormSize: 1024,
    pallor: 0.12, tint: lin([176, 160, 146]), mottle: 0.6, veins: 0.2, bruises: 0.35, socket: 0.9, lips: 0, grime: 0.55,
    coveredDarken: 0.55, normalStrength: 2.1, bumpStrength: 1.7,
    blood: { hands: 0.75, splatter: 0.12 },
    wounds: [
      { bone: 'upperarm_l', t: 0.55, dir: [0.2, 0.3, 1], r: 0.03, kind: 'gash', depth: 1.6 },
      { bone: 'spine_02', t: 0.3, dir: [-0.9, 0, -0.3], r: 0.04, kind: 'bite', depth: 1.8 },
      { bone: 'upperarm_r', t: 0.35, dir: [-0.5, 0.2, -0.8], r: 0.03, kind: 'gash', depth: 1.5 },
    ],
    extra: skinExtra,
  });

  // ---- sack hood: coarse open-weave burlap (over-under jute threads with dark gaps, slubs, stray fibres) at a
  // uniform density (arc-length UVs), sewn side / crown seams, knife-cut eye holes, the mouth sewn shut with
  // heavy cross-stitches, a frayed hem (only warp threads hang below the last weft), blood soaked up from the neck
  const HCc = hoodInfo.HC;
  const seamZ = (y) => (y >= HCc[1] ? HCc[2] : axisZ(y));
  // weave at real jute-sacking density on the 4.45 m giant: 1.9 mm thread pitch here = ~4.7 mm on the full-size
  // boss (the old 4.2 mm pitch was scaled 2.5x into a 1 cm basket weave); 1536 px keeps ~5 px per thread
  const SP = 0.0019;
  const hoodTex = paintPart(hoodPart, { size: 1536, normalSize: 1536, ormSize: 256, rough: 0.94, normalStrength: 2.2 }, (P, Nn, st, u, v) => {
    if (u < 0.22) { // rope / knot / hanging ends (swapped uvs: u around, v along): twisted hemp strands
      const ua = (u - 0.02) / 0.18;
      const tw = Math.sin((v * 160 + ua * 3) * Math.PI * 2);
      set(st.c, mix3(lin([128, 106, 72]), lin([58, 46, 30]), 0.5 + 0.5 * tw));
      mul(st.c, [0.85, 0.8, 0.75], ss(-0.2, 0.6, N.fbm(P[0] * 90, P[1] * 90, P[2] * 90, 2)) * 0.5);
      st.h = tw * 0.9 + N.noise(v * 900, ua * 9, 0.4) * 0.2;
      const fr = v > 0.74 ? ss(0.06, 0.0, ((v - 0.74) % 0.12) - 0.04) : 0;       // frayed tips of the hanging ends
      mul(st.c, [1.15, 1.1, 1.0], fr);
      over(st.c, lin([56, 15, 10]), ss(0.05, 0.6, N.fbm(P[0] * 40, P[1] * 40, P[2] * 40, 3)) * 0.7);
      st.ro = 0.9;
      return;
    }
    st.stitch = 0;
    const pn = v < 0.49 ? 0 : 1;
    const sm = (u - hoodUV.uc) / hoodUV.D, tm = (v - hoodUV.panels[pn].v0) / hoodUV.D;
    const fu = sm / SP + pn * 0.37, fv = tm / SP;
    const iu = Math.floor(fu), iv = Math.floor(fv), tu = fu - iu, tv = fv - iv;
    // thread half-widths with slubs (thick lumps) along each thread
    const wWarp = 0.33 + 0.07 * hash(iu * 31 + pn) + 0.07 * Math.max(0, N.noise(iu * 0.71, fv * 0.11, 3.1));
    const wWeft = 0.31 + 0.07 * hash(iv * 17 + 9 + pn) + 0.07 * Math.max(0, N.noise(fu * 0.11, iv * 0.67, 7.7));
    const pu = 1 - ss(wWarp - 0.1, wWarp, Math.abs(tu - 0.5)), pv = 1 - ss(wWeft - 0.1, wWeft, Math.abs(tv - 0.5));
    const zWarp = 0.5 + 0.5 * Math.cos(Math.PI * (fv + iu)), zWeft = 0.5 - 0.5 * Math.cos(Math.PI * (fu + iv));
    const hWarp = pu * (0.35 + 0.65 * zWarp) * (0.75 + 0.25 * Math.cos(Math.PI * (tu - 0.5) * 2)), hWeft = pv * (0.35 + 0.65 * zWeft) * (0.75 + 0.25 * Math.cos(Math.PI * (tv - 0.5) * 2));
    const warpOn = hWarp >= hWeft;
    const thr = Math.max(hWarp, hWeft);
    const gap = (1 - pu) * (1 - pv);
    // fibre streaks along the visible thread
    const fib = warpOn ? N.noise(fv * 5.5, iu * 1.3, 0.2) : N.noise(fu * 5.5, iv * 1.3, 5.2);
    set(st.c, lin([126, 97, 62]));
    const tvar = warpOn ? hash(iu * 7 + 1 + pn * 101) : hash(iv * 13 + 5 + pn * 77);
    mul(st.c, [0.82 + 0.3 * tvar, 0.82 + 0.28 * tvar, 0.8 + 0.26 * tvar], 1);
    mul(st.c, [1.08, 1.06, 1.0], ss(0.0, 0.5, fib) * 0.6);
    mul(st.c, [0.72, 0.66, 0.6], ss(0.0, -0.5, fib) * 0.5);
    mul(st.c, [0.3, 0.24, 0.2], gap * 0.85);
    mul(st.c, [0.78, 0.72, 0.66], (1 - thr) * (1 - gap) * 0.5);   // threads darken where they dive under
    st.h = thr * 0.9 - gap * 0.35 + fib * 0.08;
    // stray fibres: thin, slightly curved hairs lying across the weave
    const sf = Math.abs(N.noise(P[0] * 260 + P[1] * 40, P[1] * 260, P[2] * 260 - P[0] * 30));
    const stray = (1 - ss(0.0, 0.025, sf)) * ss(0.25, 0.5, N.noise(P[0] * 25, P[1] * 25, P[2] * 25 + 9));
    over(st.c, lin([160, 132, 92]), stray * 0.55); st.h += stray * 0.35;
    // grime, sweat, old stains
    mul(st.c, [0.66, 0.57, 0.48], ss(-0.3, 0.6, N.fbm(P[0] * 18, P[1] * 18, P[2] * 18, 4)) * 0.75);
    mul(st.c, [0.82, 0.75, 0.66], ss(0.0, 0.5, N.fbm(P[0] * 6 + 3, P[1] * 6, P[2] * 6, 3)) * 0.6);
    let bl = 0;
    // side / crown seams: the panels' fabric rolls into a ridge, closed with thick twine stitches
    {
      const sd = Math.abs(P[2] - seamZ(P[1]));
      const ridge = 1 - ss(0.002, 0.008, sd);
      st.h += ridge * 1.1; mul(st.c, [0.72, 0.62, 0.52], ridge * 0.5);
      const along = P[1] < HCc[1] + 0.02 ? P[1] : P[0];
      const m = (((along % 0.011) + 0.011) % 0.011) - 0.0055;
      const th = (1 - ss(0.0009, 0.0018, Math.abs(m - (P[2] - seamZ(P[1])) * 0.45))) * (1 - ss(0.007, 0.009, sd));
      over(st.c, lin([42, 30, 20]), th); st.h += th * 1.2;
    }
    // frayed hem: below the last weft only warp threads hang, each ending at its own length. Distances are
    // measured along the cloth from the rope (the skirt hugs the trapezius, so height would smear the fringe
    // over a wide shelf): dH = cloth left above the hem
    const onSkirt = P[1] < ropeAt(P) - 0.0015;
    const dH = onSkirt ? hoodInfo.skirtLen(hoodInfo.thetaOf(P)) - hoodInfo.skirtArc(P, 0.1) : 1;
    if (dH < 0.012) {
      // the last weft sits at dH = 0.012; each warp thread hangs on below it to its own end
      const end = 0.012 - (0.003 + 0.01 * hash(iu * 3 + 7 + pn * 13));
      if (!(pu > 0.45 && dH > end)) st.a = 0;
      mul(st.c, [0.62, 0.55, 0.5], (1 - ss(0, 0.012, dH)) * 0.6);
    }
    // soaked from the neck up (blood and sweat), dark round the sewn mouth
    bl = Math.max(bl, ss(ropeAt(P) + 0.07, ropeAt(P) - 0.01, P[1] + N.fbm(P[0] * 20, P[1] * 10, P[2] * 20, 3) * 0.03) * 0.9);
    const front = P[2] > HCc[2] + 0.02;
    const dm = Math.hypot((P[0] - A.mouth[0]) * 0.8, P[1] - A.mouth[1]);
    if (front) bl = Math.max(bl, (1 - ss(0.018, 0.05, dm + N.fbm(P[0] * 30, P[1] * 30, 0.5, 3) * 0.012)) * 0.85);
    // eye holes: ragged, cut with a knife; bloody tears running down below them
    for (const e of [A.eyeL, A.eyeR]) {
      if (!front) continue;
      const dx = P[0] - e[0], dy = P[1] - e[1];
      const r = Math.hypot(dx * 0.95, dy * 1.25) + N.fbm(P[0] * 90, P[1] * 90, 0.3, 3) * 0.004;
      if (r < 0.0165) { st.a = 0; continue; }
      const rim = 1 - ss(0.0165, 0.025, r);
      mul(st.c, [0.42, 0.3, 0.24], rim * 0.8); st.h += rim * 0.7;
      if (dy < 0 && dy > -0.08) bl = Math.max(bl, (1 - ss(0.0022, 0.0055, Math.abs(dx - Math.sin(dy * 60) * 0.002))) * (1 - ss(0.045, 0.08, -dy)) * 0.95);
      bl = Math.max(bl, rim * 0.6);
    }
    // the mouth sewn shut: a dark slit closed with big crude X stitches of black twine (read from 10 m)
    if (front) {
      const dx = P[0] - A.mouth[0], dy = P[1] - A.mouth[1] + dx * dx * 1.5;
      if (Math.abs(dx) < 0.04 && Math.abs(dy) < 0.012) {
        const slit = (1 - ss(0.001, 0.0028, Math.abs(dy))) * ss(0.04, 0.032, Math.abs(dx));
        mul(st.c, [0.16, 0.08, 0.06], slit); st.h -= slit * 1.2;
        const pitch = 0.016, m = (((dx % pitch) + pitch) % pitch) - pitch / 2;
        const hx = pitch * 0.4, hy = 0.0105;
        const d1 = Math.abs(m * hy - dy * hx) / Math.hypot(hx, hy), d2 = Math.abs(m * hy + dy * hx) / Math.hypot(hx, hy);
        const inX = Math.abs(dy) < hy && Math.abs(m) < hx + 0.001;
        const th = inX ? (1 - ss(0.0014, 0.0024, Math.min(d1, d2))) * ss(0.04, 0.034, Math.abs(dx)) : 0;
        // pale, bleached twine: reads against the dark bloody slit
        over(st.c, lin([176, 156, 118]), th); st.h += th * 1.8; st.ro = lerp(st.ro, 0.7, th); st.stitch = th;
        // needle holes pulled open, a little blood weeping from each
        const hole = 1 - ss(0.0006, 0.0016, Math.hypot(Math.abs(m) - hx, Math.abs(dy) - hy));
        bl = Math.max(bl, hole * 0.9);
      }
    }
    if (bl > 0) {
      const age = ss(-0.3, 0.5, N.noise(P[0] * 30, P[1] * 30, P[2] * 30));
      over(st.c, mix3(lin([70, 16, 11]), lin([30, 9, 7]), age), Math.min(1, bl) * 0.88 * (1 - (st.stitch || 0)));
      st.ro = lerp(st.ro, lerp(0.55, 0.75, age), bl);
    }
  });

  // ---- apron: heavy dark-brown leather (pebbled grain, creases, scuffed lighter edges, stitched hems), the lower
  // two thirds soaked with oxidised blood (tide marks, gravity drips ending in drops), glossy still-wet patches,
  // bloody hand wipes, a ragged hem, rips, a cleaver slash and a scorched hole. A clear value step below the skin.
  const smears = [[0.16, AP.yWaist - 0.05, -0.6], [0.2, AP.yCrotch + 0.02, -0.75], [-0.18, AP.yWaist - 0.12, 0.7]];
  const apronTex = paintPart(apronPart, { size: 1024, normalSize: 512, ormSize: 512, rough: 0.55, normalStrength: 2.4 }, (P, Nn, st, u, v) => {
    const strap = v > 0.87;
    if (!strap && v > AP_V + 0.002) {
      // back layer: the flesh side of the hide, dark brown suede, blood soaked through in blotches, no sheen
      set(st.c, lin([52, 38, 28]));
      mul(st.c, [0.78, 0.74, 0.7], ss(-0.2, 0.6, N.fbm(P[0] * 9, P[1] * 9, P[2] * 9, 4)) * 0.6);
      const fuzz = N.fbm(P[0] * 300, P[1] * 300, P[2] * 300, 2);
      st.h = fuzz * 0.25; st.ro = 0.88 + 0.06 * fuzz;
      const soak = ss(0.05, 0.4, N.fbm(P[0] * 4.5 + 2, P[1] * 2.5, P[2] * 4.5, 5) + 0.2 * ss(AP.yWaist, AP.yBot, P[1]));
      over(st.c, lin([36, 12, 9]), soak * 0.75);
      apronCut(P, st);
      return;
    }
    set(st.c, strap ? lin([58, 41, 30]) : lin([68, 46, 33]));
    const mott = N.fbm(P[0] * 7, P[1] * 7, P[2] * 7, 4);
    mul(st.c, [0.8, 0.76, 0.72], ss(-0.2, 0.6, mott) * 0.6);
    mul(st.c, [1.12, 1.08, 1.02], ss(-0.1, -0.6, mott) * 0.5);
    // pebbled grain + creases where the leather bends
    const grain = N.worley(P[0] * 520, P[1] * 520, P[2] * 520);
    const crease = ss(0.82, 0.96, N.ridged(P[0] * 9, P[1] * 34, P[2] * 9, 3)) * ss(-0.2, 0.4, N.fbm(P[0] * 3 + 4, P[1] * 3, P[2] * 3, 2) + 0.2);
    st.h = ss(0.0, 0.5, grain) * 0.35 - crease * 0.9 + N.fbm(P[0] * 60, P[1] * 60, P[2] * 60, 3) * 0.15;
    mul(st.c, [0.7, 0.66, 0.62], crease * 0.6);
    st.ro = 0.5 + 0.12 * ss(0.0, 0.5, grain);
    // scuffed, lighter worn edges and highs
    const dSide = strap ? 1 : Math.min(u, 1 - u) * 0.36, dTop = strap ? 1 : v / AP_V * 1.05;
    const worn = Math.max(1 - ss(0.0, 0.03, Math.min(dSide, dTop)), ss(0.3, 0.75, N.fbm(P[0] * 16, P[1] * 16, P[2] * 16, 3)) * 0.5);
    over(st.c, lin([126, 94, 66]), worn * 0.45); st.ro = lerp(st.ro, 0.42, worn * 0.5);
    // stitched hems 8 mm in from the sides and the top (and along both strap edges)
    {
      const sd = strap ? Math.min(Math.abs(v - 0.875), Math.abs(v - 0.9), Math.abs(v - 0.905), Math.abs(v - 0.93)) * 0.9 : Math.abs(Math.min(dSide, dTop) - 0.009);
      const along = strap ? u * 0.9 : dSide < dTop ? P[1] : P[0];
      const dash = ss(0.0028, 0.0018, Math.abs((((along % 0.0075) + 0.0075) % 0.0075) - 0.00375));
      const sti = (1 - ss(0.0008, 0.0016, sd)) * dash;
      over(st.c, lin([150, 128, 96]), sti * 0.85); st.h += sti * 0.9;
      const fold = strap ? 0 : 1 - ss(0.0, 0.006, Math.min(dSide, dTop));
      st.h += fold * 0.6;
    }
    // grease sheen on the bib, dirt towards the hem
    st.ro = lerp(st.ro, 0.34, ss(AP.yTop - 0.3, AP.yTop, P[1]) * 0.6);
    const hem = ss(AP.yBot + 0.2, AP.yBot, P[1]);
    over(st.c, lin([52, 42, 32]), hem * 0.6 * ss(-0.4, 0.4, N.fbm(P[0] * 12, P[1] * 12, P[2] * 12, 3)));
    // blood: soaked into the lower two thirds (oxidised, dark), tide marks, drips with drops, wet glossy cores
    const lowK = ss(AP.yTop - 0.18, AP.yWaist - 0.05, P[1]) ** 1 ;
    const soakN = N.fbm(P[0] * 4.5 + 2, P[1] * 2.5, P[2] * 4.5, 5) + (1 - lowK) * 0.55 - 0.15;
    const core = ss(0.0, 0.35, soakN), tide = ss(-0.07, -0.02, soakN) * (1 - ss(-0.02, 0.03, soakN));
    // gravity drips: from the soaked areas downwards, thin runs with a fat drop at each end
    const col = Math.floor(P[0] / 0.011), cx = (P[0] / 0.011 - col) - 0.5;
    const runStart = AP.yWaist - 0.05 - hash(col * 7 + 3) * 0.35, runLen = 0.06 + hash(col * 13 + 1) * 0.22;
    const below = runStart - P[1];
    const hasRun = hash(col * 29 + 5) > 0.45 && below > 0 && below < runLen;
    const run = hasRun ? (1 - ss(0.14, 0.3, Math.abs(cx) * (1 + below * 6))) : 0;
    const drop = hash(col * 29 + 5) > 0.45 ? 1 - ss(0.25, 0.42, Math.hypot(cx, (P[1] - (runStart - runLen)) / 0.011)) : 0;
    let marks = 0;
    for (const [sx, sy, ang] of smears) {
      const dx = P[0] - sx, dy = P[1] - sy;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const a = dx * ca + dy * sa, b = -dx * sa + dy * ca; // a: along the wipe
      if (Math.abs(b) > 0.06 || a < -0.05 || a > 0.2) continue;
      const palm = 1 - ss(0.03, 0.045, Math.hypot(a * 0.9, b * 1.2));
      const fingers = (1 - ss(0.3, 0.8, Math.abs(Math.sin(b * 160)))) * (1 - ss(0.1, 0.2, a)) * ss(0.0, 0.03, a) * (1 - ss(0.035, 0.05, Math.abs(b)));
      marks = Math.max(marks, Math.max(palm * 0.95, fingers * 0.9) * ss(-0.3, 0.2, N.noise(P[0] * 60, P[1] * 60, 0.3) + 0.2));
    }
    const spray = N.worley(P[0] * 55, P[1] * 55, P[2] * 55);
    marks = Math.max(marks, (1 - ss(0.05, 0.11, spray)) * ss(0.2, 0.6, N.fbm(P[0] * 3, P[1] * 3, P[2] * 3, 2) + 0.4) * 0.85);
    const bloodK = Math.min(1, Math.max(core * (strap ? 0.6 : 1), run * 0.9, drop * 0.95, marks * 0.9));
    const dried = mix3(lin([62, 16, 10]), lin([30, 9, 6]), ss(-0.3, 0.5, N.noise(P[0] * 18, P[1] * 18, P[2] * 18)));
    over(st.c, dried, bloodK * 0.92);
    mul(st.c, [0.5, 0.4, 0.38], tide * 0.6);
    const wet = ss(0.25, 0.55, N.fbm(P[0] * 5 + 11, P[1] * 3, P[2] * 5, 3)) * ss(AP.yTop - 0.15, AP.yWaist, P[1]) * Math.max(core, run, drop);
    over(st.c, lin([96, 6, 6]), wet * 0.8);
    st.ro = lerp(st.ro, lerp(0.72, 0.1, ss(0.0, 0.6, wet)), Math.max(bloodK, wet));
    st.h += core * 0.12 + drop * 0.3 + run * 0.15 - tide * 0.1;
    if (strap) return;
    apronCut(P, st);
  });

  /** Ragged hem, two rips up from it, a cleaver slash across the lower left, a scorched hole on the right (front
   * sheet and back layer alike: both are cut by the same 3D test). */
  function apronCut(P, st) {
    const hemLine = AP.yBot + 0.025 + N.fbm(P[0] * 18, 0.3, 0.7, 4) * 0.035 + Math.abs(N.noise(P[0] * 50, 1.3, 0.2)) * 0.02;
    let cut = P[1] < hemLine;
    for (const [rx, rl] of [[-0.09, 0.17], [0.12, 0.11]]) {
      const upd = P[1] - AP.yBot;
      if (upd < rl && Math.abs(P[0] - rx + N.noise(P[1] * 40, rx * 10, 0.3) * 0.004) < 0.013 * (1 - upd / rl)) cut = true;
    }
    {
      const a = [0.03, AP.yCrotch - 0.03], b = [0.16, AP.yCrotch - 0.17];
      const d = [b[0] - a[0], b[1] - a[1]], L2 = d[0] * d[0] + d[1] * d[1];
      const t = ((P[0] - a[0]) * d[0] + (P[1] - a[1]) * d[1]) / L2;
      if (t > 0 && t < 1) {
        const ex = Math.abs((P[0] - a[0]) * d[1] - (P[1] - a[1]) * d[0]) / Math.sqrt(L2);
        const wdt = 0.009 * Math.sin(Math.PI * t) + N.noise(t * 30, 0.4, 0.1) * 0.0015;
        if (ex < wdt) cut = true;
        else { const lip = 1 - ss(wdt, wdt + 0.008, ex); over(st.c, lin([120, 92, 66]), lip * 0.6); st.h += lip * 0.4; }
      }
    }
    const dh = Math.hypot(P[0] + 0.12, P[1] - (AP.yWaist - 0.2)) + N.fbm(P[0] * 50, P[1] * 50, 0.2, 3) * 0.008;
    if (dh < 0.02) cut = true;
    else mul(st.c, [0.3, 0.24, 0.2], (1 - ss(0.02, 0.035, dh)) * 0.8);
    mul(st.c, [0.75, 0.7, 0.66], (1 - ss(0.0, 0.02, P[1] - hemLine)) * 0.6);
    if (cut) st.a = 0;
  }

  // ---- cleaver: living bone. Ivory to yellowed off-white cortex with brown / grey staining (blotchy, never
  // streaked along the blade like wood grain), fine Haversian pores, hairline cracks, open spongy (cancellous) bone
  // where the edge chipped and at the broken point, a dark vascular groove beside the spine with a vessel in it,
  // blood pooled in the serrations; wet and flushed where it leaves the flesh, dry and chalky towards the point.
  // Rage: the edge, the cracks and the groove vessel glow.
  const bladeTex = paintPart(bladePart, { size: 1024, normalSize: 1024, ormSize: 512, rough: 0.6, emissive: true, emissiveSize: 512, normalStrength: 2.2 }, (P, Nn, st, u, v) => {
    const q = sub(P, CI.W0), s = dot(q, CI.ax), w = dot(q, CI.wd) + CI.bend(s);
    const qT = CI.qTopF(s), qB = CI.qBotF(s), W = Math.max(1e-4, qB - qT);
    const r = Math.min(CI.rSp(s), W * 0.3);
    const f = clamp01((w - qT) / W), dEdge = Math.max(0, qB - w);    // width fraction, distance to the edge (m)
    const shaft = ss((2.2 * r) / W, (1.6 * r) / W, f);               // the rounded spine shaft
    const bevel = ss(0.86, 0.9, (w - qT - 2 * r) / Math.max(1e-4, W - 2 * r));
    const knob = u > 0.905;                                          // osteophytes / spurs
    // ---- base: ivory -> yellowed, yellower and darker along the spine shaft and in the root
    const age = clamp01(0.4 + 0.6 * N.fbm(P[0] * 6 + 2, P[1] * 6, P[2] * 6, 3) + 0.25 * shaft + 0.2 * ss(0.2, 0.0, s));
    set(st.c, mix3(lin([226, 214, 186]), lin([198, 172, 122]), age));
    // brown and grey staining: isotropic blotches at two scales
    const stB = N.fbm(P[0] * 11 + 7, P[1] * 11, P[2] * 11, 4), stG = N.fbm(P[0] * 17 - 3, P[1] * 17, P[2] * 17, 3);
    over(st.c, lin([128, 94, 60]), ss(0.08, 0.5, stB) * 0.62);
    over(st.c, lin([92, 70, 50]), ss(0.3, 0.65, stB) * 0.45);
    mul(st.c, [0.8, 0.74, 0.66], (0.35 + 0.65 * shaft) * ss(-0.2, 0.5, N.fbm(P[0] * 3 + 5, P[1] * 3, P[2] * 3, 2) + 0.2) * 0.5);
    over(st.c, lin([146, 144, 136]), ss(0.18, 0.6, stG) * 0.35);
    mul(st.c, [0.86, 0.82, 0.76], ss(-0.4, 0.4, N.fbm(P[0] * 40, P[1] * 40, P[2] * 40, 3)) * 0.35);     // fine mottle
    // cortical surface: soft undulation + faint fibre texture (height only, short and broken, no long streaks)
    st.h = N.fbm(P[0] * 25, P[1] * 25, P[2] * 25, 3) * 0.35 + N.fbm(P[0] * 160, P[1] * 160, P[2] * 160, 2) * 0.12;
    // the shaft: a raised, knobbly cortical ridge
    st.h += shaft * 0.25 + shaft * N.worley(P[0] * 60, P[1] * 60, P[2] * 60) * 0.3;
    // Haversian pores: small sparse pinholes (denser on the shaft and near the edge)
    const pw = N.worley(P[0] * 520, P[1] * 520, P[2] * 520);
    const poreK = 0.35 + 0.65 * Math.max(shaft, 1 - ss(0.0, 0.03, dEdge));
    const pore = (1 - ss(0.07, 0.13, pw)) * ss(-0.1, 0.3, N.noise(P[0] * 60, P[1] * 60, P[2] * 60) + 0.15) * poreK;
    mul(st.c, [0.55, 0.47, 0.4], pore * 0.7); st.h -= pore * 0.5;
    // vascular groove beside the shaft (both faces): darker, reddish-brown channel with a vessel along it
    const qG = qT + 2 * r + 0.07 * (W - 2 * r), gq = Math.abs(w - qG);
    const groove = (1 - ss(0.002, 0.009, gq)) * ss(0.0, 0.05, s) * (1 - ss(0.5, 0.6, s)) * (knob ? 0 : 1);
    over(st.c, lin([118, 72, 52]), groove * 0.7); st.h -= groove * 0.35;
    const vessel = (1 - ss(0.0007, 0.0022, gq + 0.0006 * N.noise(s * 120, 0.3, 1.1))) * groove;
    over(st.c, lin([92, 20, 24]), vessel * 0.9); st.h += vessel * 0.25;
    // small vessels branching off the groove near the root (living bone), fading out towards the point
    const lv = ss(0.72, 0.9, N.ridged(P[0] * 70, P[1] * 70, P[2] * 70, 2)) * ss(0.3, 0.04, s) * (1 - shaft);
    over(st.c, lin([120, 40, 40]), lv * 0.6); st.h += lv * 0.15;
    // hairline cracks: thin, wiggly, branching dark lines (zero crossings of a noise field), only here and there
    const cn = Math.abs(N.noise(P[0] * 38, P[1] * 38, P[2] * 38) + 0.35 * N.noise(P[0] * 110, P[1] * 110, P[2] * 110));
    const crack = (1 - ss(0.006, 0.018, cn)) * ss(0.15, 0.5, N.fbm(P[0] * 5 + 9, P[1] * 5, P[2] * 5, 2) + 0.25);
    over(st.c, lin([62, 48, 36]), crack * 0.8); st.h -= crack * 0.6;
    // cancellous (spongy) bone where the cortex broke away: the chip notches, the serration roots, the point
    let brk = 0;
    for (const [c, wC, dC] of CI.CHIPS) brk = Math.max(brk, Math.exp(-(((s - c) / (wC * 1.5)) ** 2)) * (1 - ss(0.008, 0.012 + dC, dEdge)));
    brk = Math.max(brk, ss(0.6, 0.65, s) * (1 - ss(0.01, 0.03, dEdge + Math.abs(w - CI.tipQ) * 0.2)));
    brk = Math.max(brk, ss(0.002, 0.006, CI.serr(s)) * (1 - ss(0.003, 0.008, dEdge)) * 0.8);
    if (brk > 0) {
      const sp = N.worley(P[0] * 300, P[1] * 300, P[2] * 300), sp2 = N.worley(P[0] * 700 + 3, P[1] * 700, P[2] * 700);
      const hole = Math.max(1 - ss(0.25, 0.42, sp), (1 - ss(0.2, 0.4, sp2)) * 0.6);
      const k = clamp01(brk * 1.2);
      over(st.c, mix3(lin([212, 196, 160]), lin([86, 44, 32]), hole), k * 0.9);
      st.h -= k * (0.4 + hole * 0.9); st.ro = lerp(st.ro, 0.92, k);
    }
    // blood: pooled in the serrations (fresh, wet), a crust along the edge, splatter, smears near the root
    let bl = 0, wet = 0;
    const pool = ss(0.002, 0.007, CI.serr(s) + 0.003 * N.noise(s * 90, 0.3, 2.2)) * (1 - ss(0.003, 0.012 + 0.008 * Math.max(0, N.noise(P[0] * 80, P[1] * 80, P[2] * 80)), dEdge));
    bl = Math.max(bl, pool); wet = Math.max(wet, pool * 0.9);
    bl = Math.max(bl, (1 - ss(0.004, 0.02, dEdge + N.fbm(P[0] * 30, P[1] * 30, P[2] * 30, 3) * 0.012)) * ss(0.05, 0.12, s) * 0.8);
    bl = Math.max(bl, (1 - ss(0.04, 0.1, N.worley(P[0] * 95, P[1] * 95, P[2] * 95))) * ss(0.1, 0.5, N.fbm(P[0] * 4, P[1] * 4, P[2] * 4, 2) + 0.35) * 0.8);
    bl = Math.max(bl, ss(0.16, 0.0, s) * ss(-0.2, 0.3, N.fbm(P[0] * 20, P[1] * 20, P[2] * 20, 3) + 0.2) * 0.9);
    if (bl > 0) {
      const fresh = clamp01(wet + ss(0.4, 0.8, N.fbm(P[0] * 7 + 3, P[1] * 7, P[2] * 7, 3)) * 0.5);
      over(st.c, mix3(lin([60, 16, 11]), lin([104, 10, 10]), fresh), Math.min(1, bl) * 0.9);
      st.ro = lerp(st.ro, lerp(0.58, 0.12, fresh), Math.min(1, bl));
      st.h += bl * 0.08;
    }
    // gloss: wet and flushed where it grows out of the flesh, dry and chalky towards the point
    const wetRoot = ss(0.16, 0.0, s);
    over(st.c, lin([184, 112, 98]), wetRoot * 0.45 * (1 - bl));
    const chalk = ss(0.35, 0.62, s) * (1 - bl);
    over(st.c, lin([222, 216, 202]), chalk * 0.25);
    st.ro = lerp(st.ro, 0.26, wetRoot * 0.8);
    st.ro = lerp(st.ro, 0.88, chalk * 0.8);
    // the crude bevel: a little cleaner, denser and smoother (honed by use), with nicks
    const nk = Math.floor(s / 0.011 + N.noise(s * 20, 1.7, 0.3) * 1.5);
    const nick = (hash(nk * 7 + 3) > 0.78 ? 1 : 0) * (1 - ss(0.002, 0.005 + 0.004 * hash(nk * 13 + 1), dEdge)) * ss(0.33, 0.36, s);
    over(st.c, lin([216, 200, 160]), bevel * 0.35 * (1 - nick) * (1 - bl));
    st.ro = lerp(st.ro, 0.42, bevel * (1 - nick) * (1 - bl) * 0.7);
    over(st.c, lin([110, 84, 60]), nick * 0.6); st.h -= nick * 0.5;
    st.ao = 1 - groove * 0.35 - pore * 0.25;
    const g = (1 - ss(0.003, 0.016, dEdge)) * (0.65 + 0.35 * N.noise(s * 30, 0.2, 0.4)) + crack * 0.7 + vessel * 0.8 + brk * 0.4;
    st.e[0] = g; st.e[1] = g * 0.32; st.e[2] = g * 0.08;
  });

  // ---- flesh sheath: raw, wet muscle swelling out of the forearm over the blade root; glossy pale tendons
  const sheathTex = paintPart(sheathPart, { size: 512, normalSize: 512, ormSize: 256, rough: 0.3, normalStrength: 3 }, (P, Nn, st, u, v) => {
    const s = dot(sub(P, CI.W0), CI.ax);
    const tendon = u > 0.42;
    const torn = tendon ? 1 : ss(-0.1, -0.055, s + N.fbm(P[0] * 60, P[1] * 60, P[2] * 60, 3) * 0.02);
    // muscle fibres run along the forearm / blade
    const fib = N.ridged(dot(P, CI.wd) * 160, dot(P, CI.td) * 160, s * 18, 3);
    set(st.c, mix3(lin([118, 32, 30]), lin([52, 11, 12]), ss(0.3, 0.8, fib)));
    mul(st.c, [0.75, 0.62, 0.6], ss(-0.2, 0.6, N.fbm(P[0] * 25, P[1] * 25, P[2] * 25, 3)) * 0.6);
    st.h = fib * 0.8 + N.fbm(P[0] * 80, P[1] * 80, P[2] * 80, 3) * 0.4;
    st.ro = 0.26;
    // fascia: pale, glossy sheets and strands over the muscle; fat nodules near the rim
    over(st.c, lin([196, 172, 150]), ss(0.8, 0.95, N.ridged(P[0] * 70, P[1] * 70, P[2] * 70, 2)) * 0.45);
    over(st.c, lin([206, 176, 112]), (1 - ss(0.1, 0.25, N.worley(P[0] * 150, P[1] * 150, P[2] * 150))) * 0.35 * ss(0.0, 0.08, s));
    if (tendon) {
      // tendon: white-pink sinew, wet sheen, darker where it sinks into the bone
      const across = Math.abs((((v - 0.8) / 0.045) % 1) * 2 - 1);   // 0 on the cord's crest, 1 at its sides
      set(st.c, mix3(lin([200, 150, 138]), lin([132, 52, 50]), clamp01(across * 1.2 + 0.3 * N.fbm(P[0] * 40, P[1] * 40, P[2] * 40, 3))));
      over(st.c, lin([226, 206, 190]), (1 - ss(0.1, 0.35, across)) * 0.5);
      const tf = Math.abs(Math.sin(u * 300 + N.noise(P[0] * 90, P[1] * 90, P[2] * 90) * 3));
      st.h = tf * 0.25 - across * 0.4; st.ro = 0.24;
      mul(st.c, [0.7, 0.5, 0.48], ss(0.2, 0.36, s) * 0.5);
    }
    // forearm skin at the far end (matches the inflamed skin it grows out of), a raw torn band where it splits
    over(st.c, mix3(lin([160, 104, 98]), lin([132, 62, 66]), torn), (1 - torn) * 0.95);
    mul(st.c, [0.5, 0.35, 0.35], (1 - Math.abs(torn - 0.5) * 2) * 0.6);
    st.ro = lerp(0.55, st.ro, torn);
    const clot = ss(0.3, 0.6, N.fbm(P[0] * 40 + 2, P[1] * 40, P[2] * 40, 3)) * torn * (tendon ? 0.4 : 1);
    over(st.c, lin([36, 8, 6]), clot * 0.75); st.ro = lerp(st.ro, 0.45, clot);
  });

  // ---- tumour: purple-red swollen lobes, yellow pus heads, dark veins, glowing fissures
  const tumTex = paintPart(tumPart, { size: 512, normalSize: 512, ormSize: 256, rough: 0.28, emissive: true, emissiveSize: 256, normalStrength: 3.2 }, (P, Nn, st) => {
    const depth = dot(sub(P, T.Bp), T.nB);
    const pust = 1 - ss(0.0, 0.3, N.worley(P[0] * 60, P[1] * 60, P[2] * 60));
    set(st.c, mix3(lin([100, 26, 36]), lin([58, 12, 26]), ss(-0.3, 0.5, N.fbm(P[0] * 30, P[1] * 30, P[2] * 30, 3))));
    over(st.c, lin([200, 170, 80]), ss(0.55, 0.95, pust) * 0.85);
    over(st.c, lin([170, 70, 60]), ss(0.2, 0.55, pust) * (1 - ss(0.55, 0.9, pust)) * 0.6);
    st.h = pust * 1.2;
    const vn = ss(0.7, 0.92, N.ridged(P[0] * 35, P[1] * 35, P[2] * 35, 3));
    over(st.c, lin([40, 10, 34]), vn * 0.7); st.h += vn * 0.6;
    const fis = ss(0.8, 0.95, N.ridged(P[0] * 22 + 7, P[1] * 22, P[2] * 22, 2)) * ss(-0.005, 0.01, depth);
    over(st.c, lin([255, 140, 40]), fis * 0.8); st.h -= fis * 0.8;
    const skinBlend = ss(0.012, -0.012, depth);
    over(st.c, lin([140, 70, 70]), skinBlend * 0.7);
    st.ro = lerp(0.24, 0.45, skinBlend);
    const g = fis + ss(0.75, 0.98, pust) * 0.55 + vn * 0.15;
    st.e[0] = g; st.e[1] = g * 0.42; st.e[2] = g * 0.1;
  });

  // ---- chains + hooks: rusty iron links; the meat hooks are worn steel (bright scratched metal, a little rust)
  // with wet blood only where they pierce the skin and at the hanging hooks' points
  const pierceP = chainInfo.hooks.filter((k) => k.kind === 'pierce').map((k) => k.p);
  const tips = chainInfo.tips || [];
  const chainTex = paintPart(chainPart, { size: 512, normalSize: 512, ormSize: 256, rough: 0.45, normalStrength: 2.5 }, (P, Nn, st, u, v) => {
    if (v > 0.81) {
      // butcher's meat hooks: dull, grimy forged steel (no chrome), rust blooms, dried blood and fat in the bend
      set(st.c, lin([88, 86, 84])); st.me = 0.6; st.ro = 0.55;
      const scr = ss(0.6, 0.9, Math.abs(N.noise(P[0] * 400, P[1] * 40, P[2] * 400)));
      mul(st.c, [1.25, 1.24, 1.22], scr * 0.4); st.ro = lerp(st.ro, 0.45, scr * 0.4);   // a few worn, scratched highs
      mul(st.c, [0.62, 0.58, 0.54], ss(-0.2, 0.5, N.fbm(P[0] * 25 + 3, P[1] * 25, P[2] * 25, 3)) * 0.7);   // grime
      const rust = ss(0.05, 0.45, N.fbm(P[0] * 50, P[1] * 50, P[2] * 50, 4) + 0.15);
      over(st.c, mix3(lin([112, 56, 28]), lin([62, 32, 18]), ss(-0.3, 0.4, N.noise(P[0] * 90, P[1] * 90, P[2] * 90))), rust * 0.85);
      st.me = lerp(st.me, 0.12, rust); st.ro = lerp(st.ro, 0.9, rust);
      const dried = ss(0.15, 0.55, N.fbm(P[0] * 18 + 8, P[1] * 18, P[2] * 18, 3));
      over(st.c, lin([46, 12, 9]), dried * 0.8); st.me = lerp(st.me, 0.05, dried); st.ro = lerp(st.ro, 0.62, dried);
      st.h = rust * 0.5 + scr * 0.1 + dried * 0.2;
      let near = 9;
      for (const q of pierceP) near = Math.min(near, dist(P, q) - 0.035);
      for (const q of tips) near = Math.min(near, dist(P, q));
      const wet = (1 - ss(0.0, 0.045, near)) * ss(-0.3, 0.3, N.fbm(P[0] * 60, P[1] * 60, P[2] * 60, 2) + 0.25);
      over(st.c, lin([84, 6, 6]), wet * 0.9); st.me = lerp(st.me, 0.0, wet); st.ro = lerp(st.ro, 0.12, wet);
      return;
    }
    set(st.c, lin([74, 70, 66])); st.me = 0.85; st.ro = 0.42;
    const rust = ss(0.0, 0.45, N.fbm(P[0] * 40, P[1] * 40, P[2] * 40, 4) + 0.15);
    over(st.c, mix3(lin([110, 58, 30]), lin([70, 38, 22]), ss(-0.3, 0.4, N.noise(P[0] * 90, P[1] * 90, P[2] * 90))), rust * 0.85);
    st.me = lerp(0.85, 0.15, rust); st.ro = lerp(0.42, 0.88, rust);
    st.h = rust * 0.6 + N.fbm(P[0] * 150, P[1] * 150, P[2] * 150, 2) * 0.3 * rust;
    const b = ss(0.35, 0.6, N.fbm(P[0] * 12 + 4, P[1] * 12, P[2] * 12, 3));
    over(st.c, lin([50, 14, 10]), b * 0.7); st.me = lerp(st.me, 0.05, b); st.ro = lerp(st.ro, 0.55, b);
  });

  // ---- ambient occlusion bakes (contact shadows under the apron, chains, sack and tumour)
  const nsurf = (part) => ({ tris: part.tris(), pos: part.pos, nrm: part.normals() });
  const baseS = nsurf(h.basePart({ name: 'ao' }));
  const RA = texSize(512);
  {
    const occ = makeBVH([surf(fullBody), surf(hoodPart), surf(apronPart), surf(chainPart), surf(tumPart), surf(sheathPart), surf(suit), surf(boots)]).bvh;
    const ao = bakeField(baseS, h.baseObj.uvs, RA, aoTracer(occ, { rays: 16, maxDist: 0.1 }));
    // contact shadows / creases: darker with a subsurface red tint (light scattered through flesh), not grey
    applyFields(skin.albedo, [ao], RA, (c, a) => { c[0] *= lerp(1, a, 0.6); c[1] *= lerp(1, a, 0.88); c[2] *= lerp(1, a, 0.84); });
    const apS = nsurf(apronPart);
    const occA = makeBVH([surf(apronPart), surf(chainPart), surf(fullBody), surf(hoodPart)]).bvh;
    const aoA = bakeField(apS, apronPart.obj.uvs, texSize(256), aoTracer(occA, { rays: 12, maxDist: 0.08 }));
    applyFields(apronTex.albedo, [aoA], texSize(256), (c, a) => { const k = lerp(1, a, 0.7); c[0] *= k; c[1] *= k; c[2] *= k; });
  }
  // rage glow mask for the skin: veins radiating from the tumour, along the arms and over the chest. 1024 and
  // blurred before encoding, smooth region falloffs (the old 256-512 map with hard region edges broke into JPEG
  // blocks of orange at 2.8x emissive)
  const RE = texSize(1024);
  const glow = bakeField(baseS, h.baseObj.uvs, RE, (P) => {
    const dT = dist(P, T.Bp);
    const near = (seg, r0, k) => { const q = seg(P); return (1 - ss(r0 * 0.7, r0, q.d)) * ss(-0.15, 0.05, q.t) * (1 - ss(0.95, 1.1, q.t)) * k; };
    const region = Math.max(1 - ss(0.12, 0.38, dT), near(sLAr, 0.1, 0.9), near(sUAr, 0.11, 0.6), near(sLAl, 0.1, 0.55),
      ss(yTop - 0.22, yTop - 0.1, P[1]) * ss(-0.02, 0.06, P[2] - spineZ(P[1])) * 0.4);
    return Math.min(1, Math.max(veinAt(P) ** 1.4 * region * 1.5, tumVein(P) * 1.3));
  }, { fill: 0, blur: 2 });
  const skinEm = createImage(RE, RE, [0, 0, 0, 255]);
  for (let i = 0; i < RE * RE; i++) { const gl = glow[i]; skinEm.data[i * 4] = toByte(gl); skinEm.data[i * 4 + 1] = toByte(gl * 0.3); skinEm.data[i * 4 + 2] = toByte(gl * 0.07); }
  for (let i = 0; i < skin.orm.data.length; i += 4) skin.orm.data[i + 1] = Math.max(skin.orm.data[i + 1], 105);

  // ---- materials (only body / cleaver / tumour carry emissive masks: the rage phase lights exactly those, see
  // extras.rage; the eyes keep their own glow)
  body.material = lib.material('skin', { ...skin, emissiveMap: skinEm, emissive: [0, 0, 0] });
  hoodPart.material = lib.material('cloth', { ...hoodTex, alpha: hoodTex.alpha, doubleSided: true, pngBits: 6 });
  apronPart.material = lib.material('cloth', { ...apronTex, alpha: apronTex.alpha, doubleSided: true, pngBits: 6 });
  bladePart.material = lib.material('gear', { ...bladeTex, emissive: [0, 0, 0] });
  sheathPart.material = lib.material('gore', { ...sheathTex });
  tumPart.material = lib.material('gore', { ...tumTex, emissive: [0.42, 0.13, 0.03] });
  chainPart.material = lib.material('gear', { ...chainTex });
  const bootTex = await lib.texture(boots.asset.textures.diffuse, 512);
  boots.material = lib.material('cloth', {
    albedo: lib.grungeTexture(bootTex, { seed: 5, darken: 0.3, dirt: 0.9, blood: 0.35, tint: [0.55, 0.52, 0.48] }),
    roughness: 0.6, metalness: 0,
  });
  const eyeM = lib.paintEyes(await lib.texture('system', 'eyes/materials/brown_eye.png', 256), { style: 'glow', color: [1, 0.42, 0.08] });
  eyes.material = lib.material('eye', { albedo: eyeM.albedo, emissiveMap: eyeM.emissiveMap, emissive: [1, 0.55, 0.25], roughness: 0.15 });
  eyes.extras.noSimplify = true;

  const parts = [body, suit, boots, eyes, hoodPart, apronPart, tumPart, bladePart, sheathPart, chainPart];
  for (const p of parts) console.log('  part', p.name.padEnd(14), p.triCount(), 'tris');
  console.log('  chain links', chainInfo.links, 'cross gap', chainInfo.cross.d.toFixed(3));

  // =================================================================== scale to full size, lift, helper bones, hitboxes
  // Built at ~4.6 m rest (body top) so that, with the clips' hunch partly cancelled by poseOffsets, the sack top
  // sits at ~3.9-4.0 m in idle / walk (def.height 4.0).
  const S = REST_HEIGHT / h.height;
  // cleaver capsule axis: the blade's mid-width line from just past the wrist to one radius short of the point
  const CL_R = 0.092;                                   // human scale (~0.23 m at full size: spine to edge)
  const bladeMid = (s) => CI.at(s, (CI.qTopF(s) + CI.qBotF(s)) / 2, 0);
  const tumourPts = [];
  for (const v of new Set(Array.from(tumPart.tris()).filter((_, i) => i % 2 === 0))) tumourPts.push(v);
  scaleCharacter(h, parts, S);
  // the boot soles reach below the bare foot's ground plane: stand the whole character on them
  const LIFT = -bootSole * S + 0.004;
  liftCharacter(h, parts, LIFT);
  const toFull = (p) => [p[0] * S, p[1] * S + LIFT, p[2] * S];
  console.log('scale', S.toFixed(3), 'lift', LIFT.toFixed(3), 'height', h.height.toFixed(3));

  // Capsules [bone, radius, toBone] in metres at full size. The game picks the capsule a bullet ray enters FIRST,
  // so the weak points must not sit inside a neighbour's end cap: the head capsule (skull base -> crown) covers the
  // whole sack, there is no separate neck capsule, the chest capsule (rage weak point: upper torso + back tumour)
  // ends just under the sack, and the big gut gets its own capsule in front of the spine, below the chest.
  // Leaf helper bones (no skin weights) give the capsules their end points.
  const bones = h.skeleton.bones, byName = h.skeleton.byName;
  const BP = (n) => byName[n].head.clone();
  addHelperBone(h, 'head_top', 'head', toFull(add(HC, [0, 0.035, 0.005])));
  addHelperBone(h, 'cleaver_root', 'lowerarm_r', toFull(bladeMid(0.03 + 0.5 * CL_R)));
  addHelperBone(h, 'cleaver_tip', 'lowerarm_r', toFull(bladeMid(CI.L - 0.8 * CL_R)));
  const ownerOf = (bn) => {
    if (bn === 'head' || bn === 'neck_01') return 'head';
    if (bn === 'spine_03' || bn.startsWith('clavicle')) return 'chest';
    if (bn === 'spine_01' || bn === 'spine_02') return 'belly';
    if (bn === 'pelvis' || bn === 'Root') return 'pelvis';
    if (/^(hand|thumb|index|middle|ring|pinky)/.test(bn)) return bn.endsWith('_l') ? 'hand_l' : 'lowerarm_r';
    if (bn.startsWith('ball')) return 'foot' + bn.slice(4);
    return bn;
  };
  const owned = {};
  for (const part of parts) {
    for (const v of new Set(Array.from(part.tris()).filter((_, i) => i % 2 === 0))) {
      // the flesh tendrils / straps on the blade belong to the cleaver capsule, not the forearm
      const onBlade = part.name === 'cleaver' || (part.name === 'cleaver_flesh' && dot(sub([part.pos[v * 3], part.pos[v * 3 + 1], part.pos[v * 3 + 2]], toFull(CI.W0)), CI.ax) > 0.02 * S);
      const name = onBlade ? 'cleaver' : ownerOf(bones[part.weights[v][0][0]].name);
      (owned[name] ||= []).push(new THREE.Vector3(part.pos[v * 3], part.pos[v * 3 + 1], part.pos[v * 3 + 2]));
    }
  }
  const dSeg = (p, a, b) => new THREE.Line3(a, b).closestPointToPoint(p, true, new THREE.Vector3()).distanceTo(p);
  const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
  const radius = (name, a, b, q = 0.8) => pct(owned[name].map((p) => dSeg(p, a, b)), q);
  // chest (the rage weak point: upper torso + back tumour): ONE horizontal capsule across the shoulder blades
  // (helpers chest_r -> chest_l under spine_03), fitted on the rest pose by a small search: it must hold >= 97 % of
  // the tumour and as much of the upper torso as it can while enclosing as little empty air as possible (the old
  // vertical r 0.70 capsule stuck out 0.25-0.3 m behind the back and above the shoulders and took hits on nothing)
  const s3 = BP('spine_03'), n1 = BP('neck_01');
  const tumV = tumourPts.map((v) => new THREE.Vector3(tumPart.pos[v * 3], tumPart.pos[v * 3 + 1], tumPart.pos[v * 3 + 2]));
  let chestFit;
  {
    const solid = makeBVH([surf(fullBody)]), extra = makeBVH([surf(tumPart), surf(hoodPart), surf(chainPart), surf(apronPart)]);
    // winding check: a point far in front of the chest must be on the outer side of its closest face
    const probe = solid.closest([0, s3.y, 4]);
    const wSign = dot(probe.n, sub([0, s3.y, 4], probe.p)) > 0 ? 1 : -1;
    const tc = tumV.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / tumV.length);
    const air = [], step = 0.08;
    for (let x = -1.1; x <= 1.1; x += step) for (let y = s3.y - 0.7; y <= n1.y + 0.6; y += step) for (let z = tc.z - 0.6; z <= tc.z + 1.3; z += step) {
      const c = solid.closest([x, y, z]);
      if (c.d < 0.05 || dot(c.n, sub([x, y, z], c.p)) * wSign < 0) continue;      // inside the body / on it
      if (extra.closest([x, y, z]).d < 0.05) continue;                             // tumour, sack, chains, apron
      air.push(new THREE.Vector3(x, y, z));
    }
    const chestV = owned.chest.filter((_, i) => i % 3 === 0), tumS = tumV.filter((_, i) => i % 2 === 0);
    const inCap = (list, x0, x1, y, z, r) => {
      let n = 0;
      const r2 = r * r;
      for (const p of list) {
        const dy = p.y - y; if (dy > r || dy < -r) continue;
        const dz = p.z - z; if (dz > r || dz < -r) continue;
        const dx = p.x < x0 ? p.x - x0 : p.x > x1 ? p.x - x1 : 0;
        if (dx * dx + dy * dy + dz * dz <= r2) n++;
      }
      return n;
    };
    const evalCap = (x0, x1, y, z, r) => ({ tum: inCap(tumS, x0, x1, y, z, r) / tumS.length, chest: inCap(chestV, x0, x1, y, z, r) / chestV.length, air: inCap(air, x0, x1, y, z, r) * step ** 3 });
    let best = null;
    const capTop = n1.y - 0.06;
    for (let y = tc.y - 0.25; y <= tc.y + 0.3; y += 0.05) for (let z = tc.z + 0.1; z <= tc.z + 0.75; z += 0.05)
      for (let r = 0.3; r <= 0.66; r += 0.04) for (let a = 0.05; a <= 0.75; a += 0.05) {
        if (y + r > capTop) continue;
        const e = evalCap(tc.x - a, tc.x + a, y, z, r);
        if (e.tum < 0.97) continue;
        const score = e.chest - 1.6 * e.air;
        if (!best || score > best.score) best = { score, y, z, r, a, ...e };
      }
    // the old capsule for comparison (vertical spine_03 -> top, r 0.70)
    const old = (() => { let ca = 0; const top = s3.clone().lerp(n1, 0.35); for (const p of air) if (dSeg(p, s3, top) <= 0.7) ca++; return ca * step ** 3; })();
    chestFit = best;
    console.log(`  chest fit: y ${best.y.toFixed(2)} z ${best.z.toFixed(2)} half-len ${best.a.toFixed(2)} r ${best.r.toFixed(2)} -> tumour ${(best.tum * 100).toFixed(0)}%, upper torso ${(best.chest * 100).toFixed(0)}%, air ${best.air.toFixed(3)} m3 (old vertical r0.70 capsule: air ~${old.toFixed(3)} m3); ${air.length} air voxels`);
    addHelperBone(h, 'chest_r', 'spine_03', [tc.x - best.a, best.y, best.z]);
    addHelperBone(h, 'chest_l', 'spine_03', [tc.x + best.a, best.y, best.z]);
  }
  const rChest = chestFit.r;
  // gut: vertical segment through the centre of the belly vertices, top cap below spine_03
  const gz = owned.belly.reduce((a, p) => a + p.z, 0) / owned.belly.length;
  const s1 = BP('spine_01'), s2 = BP('spine_02');
  let gLo = new THREE.Vector3(0, s1.y, gz), gHi = new THREE.Vector3(0, s2.y, gz);
  let rGut = radius('belly', gLo, gHi);
  gHi.y = Math.max(gLo.y + 0.05, Math.min(gHi.y, s3.y - rGut * 0.85));
  rGut = radius('belly', gLo, gHi, 0.78);
  addHelperBone(h, 'gut_lo', 'spine_01', gLo.toArray());
  addHelperBone(h, 'pelvis_top', 'pelvis', BP('pelvis').lerp(BP('spine_01'), 0.25).toArray());
  addHelperBone(h, 'gut_hi', 'spine_01', gHi.toArray());
  const HB = {
    head: ['head', 'head_top'], chest: ['chest_r', 'chest_l'], belly: ['gut_lo', 'gut_hi'], pelvis: ['pelvis', 'pelvis_top'],
    upperarm_l: ['upperarm_l', 'lowerarm_l'], lowerarm_l: ['lowerarm_l', 'hand_l'], hand_l: ['hand_l', 'middle_02_l'],
    upperarm_r: ['upperarm_r', 'lowerarm_r'], lowerarm_r: ['lowerarm_r', 'hand_r'], cleaver: ['cleaver_root', 'cleaver_tip'],
    thigh_l: ['thigh_l', 'calf_l'], calf_l: ['calf_l', 'foot_l'], foot_l: ['foot_l', 'ball_l'],
    thigh_r: ['thigh_r', 'calf_r'], calf_r: ['calf_r', 'foot_r'], foot_r: ['foot_r', 'ball_r'],
  };
  const hitboxes = {}, capsules = {};
  for (const [name, [b0, b1]] of Object.entries(HB)) {
    const a = BP(b0), b = BP(b1);
    let r = name === 'chest' ? rChest : name === 'belly' ? rGut : radius(name, a, b, name === 'cleaver' ? 0.97 : name === 'head' ? 0.85 : 0.8);
    if (name === 'pelvis') r = Math.min(r, 0.56);
    if (name === 'cleaver') r = Math.max(0.18, Math.min(0.27, r));
    hitboxes[name] = [b0, +r.toFixed(3), b1];
    capsules[name] = { bone: b0, to: b1, radius: +r.toFixed(3), length: +a.distanceTo(b).toFixed(3) };
  }
  console.log('  hitboxes', Object.entries(hitboxes).map(([k, v]) => `${k}:${v[1]}`).join(' '));
  {
    const a = BP('cleaver_root'), b = BP('cleaver_tip'), r = hitboxes.cleaver[1];
    const bv = [];
    for (let i = 0; i < bladePart.pos.length; i += 3) bv.push(new THREE.Vector3(bladePart.pos[i], bladePart.pos[i + 1], bladePart.pos[i + 2]));
    const reach = Math.max(...bv.map((p) => p.distanceTo(toFull(CI.W0).reduce((v, x, k) => (v.setComponent(k, x), v), new THREE.Vector3()))));
    console.log(`  cleaver capsule: ${(bv.filter((p) => dSeg(p, a, b) <= r).length / bv.length * 100).toFixed(0)}% of the blade vertices inside, blade reaches ${reach.toFixed(2)} m from the wrist, capsule ${a.distanceTo(b).toFixed(2)} m + 2 x r ${r}`);
  }
  // self-check (rest pose): which capsule does a ray hit first?
  {
    const caps = Object.entries(hitboxes).map(([name, [b0, r, b1]]) => ({ name, a: BP(b0), b: BP(b1), r }));
    const first = (o, d) => {
      let best = null;
      for (const c of caps) for (let t = 0; t < 12; t += 0.01) { const p = o.clone().addScaledVector(d, t); if (dSeg(p, c.a, c.b) <= c.r) { if (!best || t < best.t) best = { t, name: c.name }; break; } }
      return best?.name;
    };
    const hc = toFull(HC), tb = toFull(T.Bp);
    const tests = {
      'head front': [[hc[0], hc[1], 6], [0, 0, -1]], 'head back': [[hc[0], hc[1], -6], [0, 0, 1]], 'head side': [[6, hc[1] - 0.05, hc[2]], [-1, 0, 0]],
      'head from below (8 m, eye height)': [[0, 1.7, 8], norm(sub(hc, [0, 1.7, 8]))],
      'tumour from behind': [[tb[0], tb[1], -6], [0, 0, 1]], 'tumour from behind-above': [[tb[0], tb[1] + 3, -6], norm(sub(tb, [tb[0], tb[1] + 3, -6]))],
      'pecs front': [[0.35, s3.y + 0.25, 6], [0, 0, -1]], 'gut front': [[0, s1.y + 0.1, 6], [0, 0, -1]],
      'cleaver point (side)': (() => { const p = toFull(CI.at(CI.L - 0.03, CI.tipQ - 0.01, 0)); return [add(p, scl(CI.td, -6)), CI.td]; })(),
      'cleaver edge belly (side)': (() => { const p = toFull(CI.at(0.45, CI.qBotF(0.45) - 0.012, 0)); return [add(p, scl(CI.td, -6)), CI.td]; })(),
      'cleaver spine (side)': (() => { const p = toFull(CI.at(0.3, CI.qTopF(0.3) + 0.01, 0)); return [add(p, scl(CI.td, -6)), CI.td]; })(),
    };
    console.log('  first capsule hit:', Object.entries(tests).map(([k, [o, d]]) => `${k} -> ${first(new THREE.Vector3(...o), new THREE.Vector3(...d))}`).join('; '));
  }
  // The library clips sink this short-legged, heavy-booted body's soles ~4-8 cm into the floor in idle / walk
  // stance / attacks (retargetClips scales the clips' pelvis drop by the pelvis-height ratio while the short legs
  // bend at their own lengths, and the long boots dip at heel and toe). Raising the pelvis REST bone does not help
  // (its children keep their rest, so it only raises that ratio - the feet sank further); instead the MESH is
  // raised against the skeleton by MESH_LIFT: every clip carries the boots up by exactly that much (only the
  // rarely seen bind pose floats by it).
  if (PELVIS_LIFT) liftPelvis(h, PELVIS_LIFT);
  for (const a of new Set([h.pos, ...parts.map((p) => p.pos)])) for (let i = 1; i < a.length; i += 3) a[i] += MESH_LIFT;
  h.height += MESH_LIFT; h.headTop = h.height;

  // Pose offsets (local euler deg, added after the clip every frame):
  //  - the clips' zombie hunch is only partly straightened in the lower / mid spine (keeps a hunched, heavy 4 m
  //    silhouette), and the neck / head are lifted against the clips' head drop so the face reads from below:
  //    walk_a's head hangs ~45-50 deg face-down, which hid the eyes and sewn mouth (the head weak point) behind the
  //    sack's crown at 9-13 m (measured in game: -64 deg raw, -38 with neck -16 / head -11). With neck -22 /
  //    head -16 the face looks ~27-32 deg down in walk_a (readable from a player's eye height at 9-13 m), about
  //    level in idle, slightly up in run; the scream's thrown-back head reaches ~80 deg (a roar to the sky, short
  //    of vertical). A slight head tilt gives a cocked look.
  //  - the cleaver arm is held ~20 deg out from the body so the 1.6 m blade swings past the thigh / apron and never
  //    back into the shoulder blade (validated over idle / walk_a / run / stagger / attack / leap / scream)
  //  - shoulders dropped forward a little, the left hand balled into a fist
  const poseOffsets = {
    spine_01: [-7, 0, 0], spine_02: [-7, 0, 0], spine_03: [-3, 0, 0], neck_01: [-22, 0, 0], head: [-16, 0, 6],
    clavicle_l: [0, 0, -5], clavicle_r: [0, 0, 5], upperarm_r: [0, 0, -20],
  };
  for (const f of ['index', 'middle', 'ring', 'pinky']) Object.assign(poseOffsets, { [f + '_01_l']: [62, 0, 0], [f + '_02_l']: [75, 0, 0], [f + '_03_l']: [55, 0, 0] });
  Object.assign(poseOffsets, { thumb_02_l: [30, 0, 0], thumb_03_l: [35, 0, 0] });
  // rage look for brains/butcher.js: these meshes' emissive masks light up in this colour (x intensity); the
  // tumour (the rage weak point) also pulses
  const rage = { color: [1, 0.35, 0.08], intensity: 2.8, meshes: ['body', 'cleaver', 'tumour'], pulse: ['tumour'], intensityOf: { tumour: 1.5 } };
  return {
    human: h, parts, budget: 18000, partBudget: { body: 7300, trousers: 1300, boots: 650 },
    extras: { poseOffsets, hitboxes, capsules, rage, weakPoints: { head: 'sack-hooded head', chest: 'upper torso across the shoulder blades + the glowing back tumour (rage phase)' }, archetype: 'boss', gender: 'male', boss: 'butcher' },
    // bosses never switch to LOD1 in game (build with --nolod); if one is built anyway the chains stay whole links
    lod1: { budget: 6000, texScale: 0.25, drop: ['eyes'], partBudget: { body: 2400, trousers: 420, boots: 220, hood: 500, apron: 400, tumour: 260, cleaver: 300, cleaver_flesh: 200 } },
  };
}
