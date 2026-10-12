// boss_butcher — 屠宰者 THE BUTCHER, round-5 mid-boss (game/src/zombies/brains/butcher.js), 4 m tall.
// WIP geometry stage (flat colours).
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
    fn(P, Nn, st, ((i % S) + 0.5) / S, (((i / S) | 0) + 0.5) / S, i);
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
function tube(g, pts, radius, sides, uvr, w = null, { capEnd = false, ref = [0, 1, 0] } = {}) {
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
      g.v(madd(pts[i], d, r), [lerp(uvr[0], uvr[2], i / (n - 1)), lerp(uvr[1], uvr[3], k / sides)], typeof w === 'function' ? w(i / (n - 1), pts[i]) : w);
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
    list = list.map(([b, w]) => [typeof b === 'string' ? h.skeleton.byName[b].index : b, w]).filter(([, w]) => w > 1e-4);
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
  const faceN = (fi) => {
    const b = fi * 9;
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
      return r ? { p: V(r.point), n: faceN(r.faceIndex), d: r.distance } : null;
    },
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
  for (let i = 0; i < n; i++) {
    const p = fn([h.pos[i * 3], h.pos[i * 3 + 1], h.pos[i * 3 + 2]]);
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
      'stomach-pregnant-decr-incr': 1.1, 'measure-waist-circ-decr-incr': 1, 'stomach-navel-down-up': -0.5,
      'measure-hips-circ-decr-incr': 0.5, 'buttocks-volume-decr-incr': 0.4,
      'upperleg-muscle-decr-incr': 1, 'upperleg-fat-decr-incr': 0.7, 'measure-thigh-circ-decr-incr': 1,
      'lowerleg-muscle-decr-incr': 0.8, 'lowerleg-fat-decr-incr': 0.6, 'measure-calf-circ-decr-incr': 1, 'measure-knee-circ-decr-incr': 0.6, 'measure-ankle-circ-decr-incr': 0.8,
      'measure-upperleg-height-decr-incr': -0.35, 'measure-lowerleg-height-decr-incr': -0.35,
      'foot-scale-decr-incr': 0.4,
    },
    expression: { 'mouth-open': 0.3 },
  };
  const h = await lib.Human.create(opts);
  {
    // ---- sculpt: swollen left fist, Popeye forearms (the right wrist thickens into the blade root), a huge
    // trapezius yoke so the hooded head sinks between the shoulders
    const S0 = h.skeleton.byName, P0 = (n) => V(S0[n].head);
    const Wl = P0('hand_l'), axL = norm(sub(Wl, P0('lowerarm_l'))), Wr = P0('hand_r'), axR = norm(sub(Wr, P0('lowerarm_r')));
    const ElL = P0('lowerarm_l'), ElR = P0('lowerarm_r');
    const neck = P0('neck_01'), clY = (P0('clavicle_l')[1] + P0('upperarm_l')[1]) / 2;
    console.log('  sculpt: neck', neck.map((x) => x.toFixed(3)).join(','), 'clavicle', P0('clavicle_l').map((x) => x.toFixed(3)).join(','), 'shoulder', P0('upperarm_l').map((x) => x.toFixed(3)).join(','), 'head', P0('head').map((x) => x.toFixed(3)).join(','));
    await sculpt(h, (p) => {
      let q = p;
      {
        const d = sub(q, Wl), tt = dot(d, axL), r = len(sub(d, scl(axL, tt)));
        const k = ss(-0.06, 0.02, tt) * (1 - ss(0.08, 0.11, r)) * (1 - ss(0.22, 0.28, tt));
        if (k > 0) q = add(Wl, scl(d, 1 + 0.3 * k));
      }
      for (const [El, W, ax, amt] of [[ElL, Wl, axL, 0.17], [ElR, Wr, axR, 0.13]]) {
        const L = dist(El, W), d = sub(q, El), tt = dot(d, ax) / L, radial = sub(d, scl(ax, tt * L)), r = len(radial);
        if (tt > -0.1 && tt < 1.08 && r < 0.1) q = add(q, scl(radial, Math.sin(Math.PI * clamp01((tt + 0.05) / 1.12)) ** 0.7 * (1 - ss(0.065, 0.1, r)) * amt));
      }
      {
        const xs = Math.abs(q[0]);
        const w = Math.sin(Math.PI * clamp01((xs - 0.04) / 0.15)) * (1 - ss(0.035, 0.075, Math.abs(q[2] - neck[2] + 0.02))) *
          ss(clY - 0.06, clY + 0.01, q[1]) * (1 - ss(neck[1] + 0.07, neck[1] + 0.13, q[1]));
        if (w > 0) q = [q[0] + Math.sign(q[0]) * 0.006 * w, q[1] + 0.03 * w, q[2] - 0.004 * w];
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
  {
    const isl = uvIslands(suit), ib = new Map();
    suit.obj.faces.forEach((f, fi) => { let b = ib.get(isl[fi]); if (!b) ib.set(isl[fi], b = { y: 0, n: 0 }); for (const v of f.v) { b.y += suit.pos[v * 3 + 1]; b.n++; } });
    suit.obj.faces.forEach((f, fi) => { const b = ib.get(isl[fi]); if (b.y / b.n > waistY) suit.keep[fi] = 0; });
    for (const v of suit.deleteVerts) if (h.pos[v * 3 + 1] < waistY - 0.04) h.hidden.add(v);
  }
  const boots = await h.fit('clothes/shoes03', { name: 'boots', role: 'cloth' });
  const eyes = await h.fit('eyes/low-poly', { name: 'eyes', role: 'eye', hide: false });

  // BVH of the bare body (rest pose, human scale) + one including the trousers
  const fullBody = h.basePart({ name: 'bvh' });
  const bodyB = makeBVH([surf(fullBody)]);
  const outerB = makeBVH([surf(fullBody), surf(suit), surf(boots)]);

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
  // A burlap sack pulled over the (small) head, gathered round the neck by a rope. Dome rows are rays from the
  // head centre (outermost hit, so ears / jaw are enclosed); below the skull, horizontal slices drape the cloth
  // from the chin / jaw / back of the skull down to the rope, so nothing of the face can poke through.
  const hood = new Geo();
  const headW = new Float32Array(h.pos.length / 3);
  h.weights.forEach((l, v) => { for (const [b, w] of l) if (b === sk.head.index) headW[v] += w; });
  const hmin = [9, 9, 9], hmax = [-9, -9, -9];
  for (const v of h.baseObj.groupVerts('body')) if (headW[v] > 0.6) for (let k = 0; k < 3; k++) { hmin[k] = Math.min(hmin[k], h.pos[v * 3 + k]); hmax[k] = Math.max(hmax[k], h.pos[v * 3 + k]); }
  const HC = [0, (hmin[1] + hmax[1]) / 2 + 0.012, (hmin[2] + hmax[2]) / 2];
  const eyeY = (A.eyeL[1] + A.eyeR[1]) / 2;
  const neckTop = B('head'), neckBot = B('neck_01');
  // the rope sits just under the jaw (the neck is very short: the chin hangs below mid-neck)
  const cinchY = Math.max(neckBot[1] + 0.012, Math.min(lerp(neckBot[1], neckTop[1], 0.5), hmin[1] - 0.012));
  const nf = bodyB.first([0, cinchY, 1], [0, 0, -1], 2), nb = bodyB.first([0, cinchY, -1], [0, 0, 1], 2);
  const neckZ = (nf.p[2] + nb.p[2]) / 2;
  const axisZ = (y) => lerp(neckZ, HC[2], ss(cinchY, HC[1], y));
  const hoodInfo = { HC, cinchY, neckZ };
  console.log('  hood: head centre', HC.map((x) => x.toFixed(3)).join(','), 'cinch', cinchY.toFixed(3), 'neck r', ((nf.p[2] - nb.p[2]) / 2).toFixed(3), 'eyeY', eyeY.toFixed(3), 'chin', hmin[1].toFixed(3));
  {
    const NT = 24;
    const thetaOf = (k) => -Math.PI + (k / NT) * Math.PI * 2; // seam at the back
    const rows = [];
    const wrinkle = (p, amp) => {
      const c = [0, p[1], axisZ(p[1])];
      const d = norm([p[0] - c[0], 0, p[2] - c[2]]);
      return madd(p, d, N.fbm(p[0] * 28, p[1] * 28, p[2] * 28, 3) * amp);
    };
    for (const phiDeg of [13, 26, 39, 52, 65, 78]) {
      const ph = phiDeg * Math.PI / 180, ring = [];
      for (let k = 0; k <= NT; k++) {
        const th = thetaOf(k);
        const d = [Math.sin(ph) * Math.sin(th), Math.cos(ph), Math.sin(ph) * Math.cos(th)];
        const hs = bodyB.hits(HC, d, 0.17);
        const env = hs.length ? hs[hs.length - 1].d : 0.1;
        const front = ss(0.3, 0.85, Math.cos(th)) * ss(45, 78, phiDeg);
        let off = lerp(0.017, 0.006, front);
        // loose, lopsided crown: the bag's surplus flops over towards the back-left; blunt corners at the seam ends
        off += 0.017 * Math.exp(-((phiDeg / 34) ** 2)) * (0.4 + 0.6 * Math.max(0, Math.cos(th - 2.4)));
        off += 0.012 * Math.exp(-(((phiDeg - 40) / 14) ** 2)) * Math.abs(Math.sin(th)) ** 6;
        ring.push(wrinkle(madd(HC, d, env + off), 0.005 * (1 - front)));
      }
      rows.push(ring);
    }
    const yEq = rows[rows.length - 1].reduce((a, p) => a + p[1], 0) / (NT + 1);
    const prevR = rows[rows.length - 1].map((p) => Math.hypot(p[0], p[2] - axisZ(p[1])));
    let prevY = yEq;
    const NS = 7;
    for (let s = 1; s <= NS; s++) {
      const y = lerp(yEq, cinchY, s / (NS + 1));
      const zc = axisZ(y), ring = [];
      for (let k = 0; k <= NT; k++) {
        const th = thetaOf(k), d = [Math.sin(th), 0, Math.cos(th)];
        const hs = bodyB.hits([0, y, zc], d, 0.13);
        const rs = hs.length ? hs[hs.length - 1].d : 0;
        const front = ss(0.3, 0.85, Math.cos(th));
        const off = lerp(0.014, 0.006, front);
        const gather = ss(0.35, 1, s / NS);
        let r = Math.max(rs + off, prevR[k] - 0.5 * (prevY - y));
        r += gather * 0.006 * Math.sin(th * 9 + N.noise(th, y * 20, 0.3) * 2); // folds gathering into the rope
        prevR[k] = r;
        ring.push(wrinkle([Math.sin(th) * r, y, zc + Math.cos(th) * r], 0.003));
      }
      prevY = y;
      rows.push(ring);
    }
    const neckRing = (y, extra, pleat) => {
      const out = [];
      for (let k = 0; k <= NT; k++) {
        const th = thetaOf(k), d = [Math.sin(th), 0, Math.cos(th)];
        const c = [0, y, axisZ(y)];
        const hs = bodyB.hits(c, d, 0.3);
        const r0 = hs.length ? hs[0].d : 0.08;
        out.push(madd(c, d, r0 + extra + pleat * (0.5 + 0.5 * Math.sin(th * 13 + 0.7))));
      }
      return out;
    };
    const cin = neckRing(cinchY, 0.004, 0.004);
    rows.push(cin, neckRing(cinchY - 0.01, 0.012, 0.007));
    const R = rows.length;
    const top = bodyB.hits(HC, [0, 1, 0], 0.2).pop();
    const pole = hood.v(madd(HC, [0, 1, 0], (top ? top.d : 0.1) + 0.02), [0.5, 0.0]);
    const idx = rows.map((ring, r) => ring.map((p, k) => hood.v(p, [k / NT, (r + 1) / R * 0.86])));
    for (let k = 0; k < NT; k++) hood.tri(pole, idx[0][k], idx[0][k + 1]);
    for (let r = 0; r + 1 < R; r++) for (let k = 0; k < NT; k++) hood.quad(idx[r][k], idx[r + 1][k], idx[r + 1][k + 1], idx[r][k + 1]);
    hoodInfo.rows = R;
    // rope round the cinch, a knot at the back-left and two frayed hanging ends
    const ropeR = 0.0058;
    const ring = cin.slice(0, NT).map((p) => { const c = [0, p[1], axisZ(p[1])]; return madd(p, norm([p[0] - c[0], 0, p[2] - c[2]]), ropeR * 0.8); });
    ring.push(ring[0]);
    tube(hood, ring, ropeR, 5, [0, 0.88, 1, 0.94]);
    const kp = ring[Math.round(NT * 0.66)];
    const kd = norm([kp[0], 0, kp[2] - axisZ(kp[1])]);
    tube(hood, [madd(kp, kd, 0.0), madd(kp, kd, 0.013)], (t) => 0.011 * Math.sin(Math.PI * (0.15 + 0.7 * t)) + 0.004, 6, [0, 0.95, 0.3, 1]);
    for (const [dx, l] of [[0.014, 0.1], [-0.01, 0.07]]) {
      const pts = [];
      for (let i = 0; i <= 5; i++) pts.push(add(madd(kp, kd, 0.012 + i * 0.003), [dx * i / 5, -l * i / 5, 0]));
      tube(hood, pts, (t) => ropeR * (1 - 0.3 * t), 4, [0.35, 0.95, 1, 1]);
    }
    hoodInfo.knot = kp;
  }
  const hoodPart = toPart(lib, h, hood, 'hood', 'cloth', (p) => skinAt(p, { allow: ['head', 'neck_01', 'spine_03', 'clavicle_l', 'clavicle_r'] }));

  // =================================================================== APRON (cloth)
  const yTop = lerp(sk.spine_03.head.y, sk.neck_01.head.y, 0.72);
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
      const y = lerp(yTop, yBot, r / (NV - 1)) + (r ? 0 : 0);
      const row = [];
      for (let c = 0; c < NU; c++) {
        const u = c / (NU - 1) * 2 - 1;
        const x = u * hw(y);
        const hit = outerB.first([x, y, 1.5], [0, 0, -1], 2);
        let z = hit ? hit.p[2] : (zPrev[c] ?? 0.1);
        lowRow.push(z + 0.007);
        const off = 0.011 + 0.004 * (1 - Math.abs(u));
        z += off;
        if (zPrev[c] !== null) z = Math.max(z, zPrev[c] - 0.24 * (lerp(yTop, yBot, (r - 1) / (NV - 1)) - y));
        zPrev[c] = z;
        // sides wrap a little around the gut
        const wrap = ss(0.75, 1, Math.abs(u)) * ss(yTop - 0.05, yWaist, y) * 0.02;
        const fold = 0.007 * Math.sin(c * 2.3 + N.noise(c * 0.7, 0.3, 0.1) * 2) * ss(yWaist, yCrotch - 0.05, y);
        row.push([x, y, z - wrap + fold]);
      }
      grid.push(row);
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
    const idx = grid.map((row, r) => row.map((p, c) => apron.v(p, [c / (NU - 1), r / (NV - 1) * 0.86])));
    for (let r = 0; r + 1 < NV; r++) for (let c = 0; c + 1 < NU; c++) apron.quad(idx[r][c], idx[r + 1][c], idx[r + 1][c + 1], idx[r][c + 1]);
    apronInfo.grid = grid;
    // straps: neck loop from the bib corners over the traps behind the neck; waist ties around the back
    const ribbon = (pts, width, uvr, lift = 0.004) => {
      const proj = pts.map((p) => { const c = bodyB.closest(p); const n = dot(c.n, sub(p, c.p)) < 0 ? scl(c.n, -1) : c.n; return { p: madd(c.p, n, lift), n }; });
      const start = apron.n;
      proj.forEach((q, i) => {
        const t = norm(sub(proj[Math.min(proj.length - 1, i + 1)].p, proj[Math.max(0, i - 1)].p));
        const side = norm(cross(t, q.n));
        const u = lerp(uvr[0], uvr[2], i / (proj.length - 1));
        apron.v(madd(q.p, side, width / 2), [u, uvr[1]]);
        apron.v(madd(q.p, side, -width / 2), [u, uvr[3]]);
      });
      for (let i = 0; i + 1 < proj.length; i++) { const a = start + i * 2; apron.quad(a, a + 2, a + 3, a + 1); }
    };
    const tl = grid[0][NU - 1], tr = grid[0][0];
    const trapL = outerB.first([0.1, 2.5, spineZ(sk.neck_01.head.y) + 0.0], [0, -1, 0], 3).p;
    const trapR = [-trapL[0], trapL[1], trapL[2]];
    const backN = around(bodyB, 180, trapL[1] - 0.025).p;
    const neckPts = catmull([tl, madd(trapL, [0, 1, 0], 0.01), add(backN, [0, 0, -0.01]), madd(trapR, [0, 1, 0], 0.01), tr], 5);
    ribbon(neckPts, 0.026, [0, 0.885, 1, 0.915], 0.005);
    const wy = yWaist - 0.01;
    const sideL = grid.find((row) => row[0][1] <= wy)[NU - 1], sideR = grid.find((row) => row[0][1] <= wy)[0];
    const tie = catmull([sideL, around(outerB, 120, wy).p, around(outerB, 155, wy).p, around(outerB, 180, wy).p, around(outerB, -155, wy).p, around(outerB, -120, wy).p, sideR], 4);
    ribbon(tie, 0.024, [0, 0.925, 1, 0.955], 0.006);
    // knot + hanging tie ends at the small of the back
    const kb = around(outerB, 178, wy);
    const ends = [];
    for (const dx of [0.03, -0.025]) {
      const pts = [];
      for (let i = 0; i <= 6; i++) pts.push(add(madd(kb.p, kb.n, 0.012 + i * 0.002), [dx * i / 6, -0.17 * i / 6, 0]));
      ends.push(pts);
    }
    for (const pts of ends) {
      const start = apron.n;
      pts.forEach((p, i) => { const u = i / (pts.length - 1); apron.v(add(p, [0.012, 0, 0]), [u, 0.965]); apron.v(add(p, [-0.012, 0, 0]), [u, 0.995]); });
      for (let i = 0; i + 1 < pts.length; i++) { const a = start + i * 2; apron.quad(a, a + 1, a + 3, a + 2); }
    }
    apronInfo.knot = kb;
  }
  const torsoBones = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01'];
  const apronPart = toPart(lib, h, apron, 'apron', 'cloth', (p) => {
    if (p[1] > yCrotch + 0.06 || p[2] < spineZ(p[1])) return skinAt(p, { allow: [...torsoBones, 'clavicle_l', 'clavicle_r'] });
    // hanging part: pelvis -> thighs (split left / right), so the knees do not punch through when walking
    const t = ss(yCrotch + 0.06, yBot, p[1]);
    const side = ss(-0.07, 0.07, p[0]);
    return [['pelvis', 1 - 0.7 * t], ['thigh_l', 0.7 * t * side], ['thigh_r', 0.7 * t * (1 - side)]];
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
  const blade = new Geo(), sheath = new Geo();
  const cleaverInfo = {};
  {
    const W0 = B('hand_r');                         // wrist
    const ax = norm(sub(W0, B('lowerarm_r')));       // forearm direction
    const thumb = sub(B('thumb_01_r'), W0);
    const radial = norm(sub(thumb, scl(ax, dot(thumb, ax))));
    let wd = norm(cross(ax, radial));                // dorsal / lateral side (blade width direction)
    if (wd[0] > 0) wd = scl(wd, -1);
    const td = norm(cross(ax, wd));                  // blade thickness direction
    const at = (s, q, t) => add(add(madd(W0, ax, s), scl(wd, q)), scl(td, t));
    const L = 0.65, s0 = -0.03, qs = -0.026;
    const tipS = 0.6;
    // edge line (width from the spine) with a convex belly and two chips
    const edgeW = (s) => {
      let w = lerp(0.05, 0.176, ss(-0.035, 0.11, s)) + 0.014 * Math.sin(Math.PI * clamp01(s / L)) + 0.01 * ss(0.3, 0.6, s);
      w -= 0.014 * Math.exp(-(((s - 0.3) / 0.012) ** 2)) + 0.01 * Math.exp(-(((s - 0.48) / 0.01) ** 2)) + 0.006 * Math.exp(-(((s - 0.19) / 0.008) ** 2));
      return w;
    };
    const rowsS = [];
    for (let i = 0; i <= 22; i++) rowsS.push(lerp(s0, L, Math.pow(i / 22, 0.92)));
    // cross-section: [q, t] with the spine at q = qTop and the edge at q = qBot
    const section = (s) => {
      const eW = edgeW(Math.min(s, tipS + 0.02));
      let qTop = qs, qBot = qs + eW;
      if (s > tipS) { const k = (s - tipS) / (L - tipS); qTop = lerp(qs, qBot - 0.004, ss(0, 1, k) ** 0.8); }
      const taper = 1 - 0.3 * clamp01(s / L);
      const Tsp = 0.032 * taper * (s > tipS ? lerp(1, 0.25, (s - tipS) / (L - tipS)) : 1);
      const width = qBot - qTop;
      const T = (f) => (f < 0.75 ? lerp(Tsp, Tsp * 0.45, f / 0.75) : lerp(Tsp * 0.4, 0.002, (f - 0.75) / 0.25));
      return [
        [[qTop - 0.007 * taper, 0], [qTop + 0.002, Tsp / 2], [qTop + width * 0.4, T(0.4) / 2], [qTop + width * 0.75, T(0.75) / 2]],
        [[qTop + width * 0.75, T(0.75) * 0.4 / 0.45 / 2], [qBot, 0]],
        [[qBot, 0], [qTop + width * 0.75, -T(0.75) * 0.4 / 0.45 / 2]],
        [[qTop + width * 0.75, -T(0.75) / 2], [qTop + width * 0.4, -T(0.4) / 2], [qTop + 0.002, -Tsp / 2], [qTop - 0.007 * taper, 0]],
      ];
    };
    // four strips (hard edges at the bevel lines and the edge)
    let vofs = 0;
    for (let strip = 0; strip < 4; strip++) {
      const rows = rowsS.map((s) => section(s)[strip]);
      const m = rows[0].length;
      const base = blade.n;
      rows.forEach((sec, i) => sec.forEach(([q, t], k) => blade.v(at(rowsS[i], q, t), [i / (rowsS.length - 1), vofs + (k / (m - 1)) * 0.22])));
      for (let i = 0; i + 1 < rows.length; i++) for (let k = 0; k + 1 < m; k++) {
        const a = base + i * m + k, b = base + (i + 1) * m + k;
        blade.quad(a, b, b + 1, a + 1);
      }
      vofs += 0.25;
    }
    // bony knobs along the spine near the wrist
    for (const [s, hgt] of [[0.03, 0.03], [0.09, 0.036], [0.15, 0.03], [0.21, 0.024], [0.28, 0.018], [0.35, 0.012]]) {
      const sec = section(s)[0];
      const apex = at(s, sec[0][0], 0);
      const tip = madd(madd(apex, wd, -hgt), ax, 0.012);
      const ring = [];
      for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; ring.push(add(apex, add(scl(ax, Math.cos(a) * 0.013), scl(td, Math.sin(a) * 0.009)))); }
      const ids = ring.map((p, k) => blade.v(madd(p, wd, 0.004), [0.95, 0.9 + k * 0.01]));
      const t = blade.v(tip, [0.98, 0.99]);
      for (let k = 0; k < 5; k++) blade.tri(ids[k], ids[(k + 1) % 5], t);
    }
    // bone spurs breaking out of the forearm along the ulna, leading into the blade spine
    for (const [s, hgt] of [[-0.05, 0.04], [-0.11, 0.032], [-0.17, 0.022]]) {
      const c = madd(W0, ax, s);
      const hs = bodyB.hits(c, scl(wd, -1), 0.12);
      const base = hs.length ? madd(hs[0].p, wd, 0.004) : madd(c, wd, -0.04);
      const tip = add(madd(base, wd, -hgt), scl(ax, -hgt * 0.45));
      const ring = [];
      for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; ring.push(add(base, add(scl(ax, Math.cos(a) * 0.011), scl(td, Math.sin(a) * 0.009)))); }
      const ids = ring.map((p, k) => blade.v(p, [0.9, 0.9 + k * 0.01]));
      const tv = blade.v(tip, [0.93, 0.99]);
      for (let k = 0; k < 5; k++) blade.tri(ids[k], ids[(k + 1) % 5], tv);
    }
    Object.assign(cleaverInfo, { W0, ax, wd, td, L, qs, edgeW, section, at });
    // flesh sheath: forearm skin surface at s<0 swelling into a fleshy cuff that grips the blade base
    const NA = 14;
    const sRows = [-0.13, -0.1, -0.07, -0.045, -0.02, 0.0, 0.02, 0.045, 0.07];
    const ringPts = sRows.map((s, ri) => {
      const sec = section(Math.max(s, s0));
      const qTop = sec[0][0][0], qBot = sec[1][1][0];
      const qc = (qTop + qBot) / 2, hq = (qBot - qTop) / 2, ht = sec[0][1][1];
      const out = [];
      for (let k = 0; k <= NA; k++) {
        const a = (k / NA) * Math.PI * 2;
        const dir = add(scl(wd, Math.cos(a)), scl(td, Math.sin(a)));
        // forearm skin radius along this direction
        const c = madd(W0, ax, s);
        const hs = bodyB.hits(c, dir, 0.12);
        const rSkin = hs.length ? hs[0].d : 0.04;
        // blade envelope (ellipse around the blade section)
        const eq = qc + Math.cos(a) * (hq + 0.006), et = Math.sin(a) * (ht + 0.006);
        const pBlade = add(add(c, scl(wd, eq)), scl(td, et));
        const pSkin = madd(c, dir, rSkin + 0.002);
        const k2 = ss(-0.06, 0.06, s);
        let p = lerp3(pSkin, pBlade, k2);
        const swell = 0.011 * Math.sin(Math.PI * clamp01((s + 0.12) / 0.2)) * (0.6 + 0.4 * N.noise(a * 1.7, s * 30, 1.3));
        const radial = norm(sub(p, add(c, scl(wd, lerp(0, qc, k2)))));
        p = madd(p, radial, swell + (ri === sRows.length - 1 ? -0.003 : 0));
        out.push(p);
      }
      return out;
    });
    const sid = ringPts.map((ring, r) => ring.map((p, k) => sheath.v(p, [r / (sRows.length - 1), k / NA * 0.8])));
    for (let r = 0; r + 1 < sRows.length; r++) for (let k = 0; k < NA; k++) sheath.quad(sid[r][k], sid[r][k + 1], sid[r + 1][k + 1], sid[r + 1][k]);
    let ti = 0;
    for (const side of [1, -1]) {
      for (const [f0, len0, wig] of [[0.25, 0.13, 0.6], [0.5, 0.19, -0.8], [0.78, 0.1, 0.5]]) {
        const pts = [];
        for (let i = 0; i <= 6; i++) {
          const s = 0.05 + (len0 * i) / 6;
          const sec = section(s);
          const qTop = sec[0][0][0], qBot = sec[1][1][0];
          const f = f0 + Math.sin(i * 0.9 + f0 * 7) * 0.05 * wig;
          const q = lerp(qTop, qBot, f);
          const thick = sec[0][2][1] * lerp(1, 0.6, f) + 0.004;
          pts.push(at(s, q, side * thick));
        }
        tube(sheath, pts, (tt) => lerp(0.0075, 0.0018, tt), 4, [0.45, 0.82 + ti * 0.03, 1, 0.84 + ti * 0.03]);
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
    const outer2 = makeBVH([surf(fullBody), surf(suit), surf(apronPart)]);
    const project = (p, clear, axisOut = true) => {
      const c = outer2.closest(p);
      const ctr = [0, c.p[1], spineZ(c.p[1])];
      let n = c.n;
      if (axisOut && dot(n, sub(c.p, ctr)) < 0) n = scl(n, -1);
      return { p: madd(c.p, n, clear), n };
    };
    const LI = 0.056, WI = 0.028, RW = 0.0088; // inner length / width, wire radius (human scale)
    let uvSlot = 0;
    const slotUV = () => { const k = uvSlot++; const cx = k % 8, cy = Math.floor(k / 8); return [cx / 8, cy / 10, (cx + 1) / 8, (cy + 1) / 10]; };
    const link = (c, T, side, nrm, standing) => {
      // elongated hexagon centre line in the plane (T, side)
      const hl = LI / 2 + RW * 0.5, hw = WI / 2 + RW * 0.5;
      const cl = [[hl, 0], [hl * 0.62, hw], [-hl * 0.62, hw], [-hl, 0], [-hl * 0.62, -hw], [hl * 0.62, -hw], [hl, 0]];
      const pts = cl.map(([a, b]) => add(add(c, scl(T, a)), scl(side, b)));
      const uvr = slotUV();
      tube(chains, pts, RW, standing ? 3 : 4, uvr, null, { ref: nrm });
      chainInfo.links++;
    };
    const lay = (path, { lift = 0, skin }) => {
      const P = resample(path, LI);
      for (let i = 0; i < P.length; i++) {
        const T = norm(sub(P[Math.min(P.length - 1, i + 1)], P[Math.max(0, i - 1)]));
        const pr = project(P[i], 0);
        const n = norm(sub(pr.n, scl(T, dot(pr.n, T))));
        const side = norm(cross(T, n));
        const standing = i % 2 === 1;
        const c = madd(pr.p, n, (standing ? WI / 2 + RW : RW) + 0.003 + lift);
        const g0 = chains.n;
        link(c, T, standing ? n : side, n, standing);
        const w = skin(c, i / (P.length - 1));
        for (let v = g0; v < chains.n; v++) chains.W[v] = w;
      }
      return P;
    };
    const chainPath = (sgn) => {
      // sgn = +1: from a hook in the LEFT shoulder blade over the left trap, across the chest to the right hip
      const backHook = around(bodyB, 180 - sgn * 34, sk.spine_03.head.y + 0.03);
      const trap = outerB.first([sgn * 0.125, 2.5, spineZ(sk.neck_01.head.y) - 0.01], [0, -1, 0], 3).p;
      const pts = [
        madd(backHook.p, backHook.n, 0.01),
        madd(around(bodyB, 180 - sgn * 50, lerp(sk.spine_03.head.y, trap[1], 0.65)).p, [0, 0, -1], 0.01),
        add(trap, [0, 0.015, 0]),
        madd(around(outerB, sgn * 42, lerp(trap[1], yTop, 0.55)).p, [0, 0, 1], 0.015),
        madd(around(outerB, sgn * 14, yTop - 0.06 - (sgn > 0 ? 0 : 0.05)).p, [0, 0, 1], 0.02),
        madd(around(outerB, -sgn * 22, lerp(yTop, yWaist, 0.75)).p, [0, 0, 1], 0.02),
        madd(around(outerB, -sgn * 40, yWaist - 0.05).p, [0, 0, 1], 0.02),
        madd(around(outerB, -sgn * 50, yWaist - 0.11).p, [0, 0, 1], 0.02),
      ];
      return { pts, backHook };
    };
    const torsoSkin = (c) => skinAt(c, { allow: [...torsoBones, 'clavicle_l', 'clavicle_r'] });
    chainInfo.paths = [];
    for (const sgn of [1, -1]) {
      const { pts, backHook } = chainPath(sgn);
      const path = catmull(pts, 8);
      const P = lay(path, { lift: sgn < 0 ? 0.012 : 0, skin: (c) => torsoSkin(c) });
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
    };
    chainInfo.hooks = [];
    for (const c of chainInfo.paths) {
      // hanging hooks at the end of each tail
      const out = norm([c.hipN[0], 0, c.hipN[2]]);
      const fwd = norm(cross([0, 1, 0], out));
      const top = add(c.tailEnd, [0, -LI * 0.45, 0]);
      const thigh = c.sgn > 0 ? 'thigh_r' : 'thigh_l';
      hook(top, fwd, [0, 1, 0], 1.25, [['pelvis', 0.5], [thigh, 0.5]], [0, 0.82, 0.5, 0.9]);
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
      tube(chains, pts, (t) => 0.0055 * (t > 0.8 ? lerp(1, 0.15, (t - 0.8) / 0.2) : 1), 5, [0.5, 0.82, 1, 0.9], torsoSkin(hp), { ref: bh.n });
      chainInfo.hooks.push({ p: hp, n: bh.n, up: upb, kind: 'pierce' });
    }
  }
  const chainPart = toPart(lib, h, chains, 'chains', 'gear', (p) => skinAt(p, { allow: torsoBones }));

  // =================================================================== body trimming
  // right hand gone (the forearm ends in the cleaver)
  const handR = new Set(h.skeleton.bones.filter((b) => b.name === 'hand_r' || /_0\d_r$/.test(b.name)).map((b) => b.index));
  const handW = new Float32Array(h.pos.length / 3);
  h.weights.forEach((l, v) => { for (const [b, w] of l) if (handR.has(b)) handW[v] += w; });
  // head under the sack (keep a window around the eyes so the eye holes show sockets, not the inside of the sack)
  const underHood = (v) => {
    const p = [h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]];
    if (p[1] < cinchY + 0.01) return false;
    const eyeWin = Math.abs(p[1] - eyeY) < 0.03 && Math.abs(p[0]) < 0.065 && p[2] > A.eyeL[2] - 0.035;
    return !eyeWin;
  };
  body.obj.faces.forEach((f, fi) => {
    if (f.v.every((v) => handW[v] > 0.35)) body.keep[fi] = 0;
    else if (f.v.every(underHood)) body.keep[fi] = 0;
  });

  // =================================================================== TEXTURES
  const set = (c, k) => { c[0] = k[0]; c[1] = k[1]; c[2] = k[2]; };
  const black = createImage(64, 64, [0, 0, 0, 255]); // emissive mask for parts that must NOT light up in the rage phase
  const CI = cleaverInfo, T = tumInfo, AP = apronInfo;

  // ---- trousers: dark, filthy work trousers ripped off at the boot tops, worn-through knees, a burst seam on the left thigh
  let bootTop = 0;
  for (let i = 1; i < boots.pos.length; i += 3) bootTop = Math.max(bootTop, boots.pos[i]);
  const suitBase = grade(lib.cloneImage(await lib.texture(suit.asset.textures.diffuse, 1024)), (c) => {
    const l = lum(c);
    const g = [l * 0.95, l * 0.84, l * 0.62];
    for (let k = 0; k < 3; k++) c[k] = lerp(c[k], g[k], 0.88) * 0.45;
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
    normal: await lib.texture(suit.asset.textures.normal, 1024), ao: await lib.texture(suit.asset.textures.ao, 1024),
    size: 1024, normalSize: 1024, ormSize: 512,
    fade: 0.3, grime: 1, grimeNoise: 1.1, weave: 0.8, innerDarken: 0,
    blood: { hands: 0.6, splatter: 0.55, edges: 0.7 },
    tear: { amount: 0.22, scale: 6, fray: 0.9, where: tearW, threadColor: [0.1, 0.085, 0.06] },
  });
  suit.material = lib.material('cloth', { ...cloth, alpha: cloth.alpha, doubleSided: true, pngBits: 6, emissiveMap: black, emissive: [0, 0, 0] });
  h.hideCovered(body, (p) => cloth.holeAt(p, 0.1));

  // ---- skin: pale, sickly, stretched; striae, bulging veins, scars, chafing under the chains, blood everywhere
  const skinBase = grade(lib.cloneImage(await lib.texture('system', 'skins/old_caucasian_male/old_lightskinned_male_diffuse.png', 2048)), (c) => {
    const l = lum(c);
    const g = [l * 1.04, l * 0.8, l * 0.66];
    for (let k = 0; k < 3; k++) c[k] = lerp(c[k], g[k], 0.72) * 0.5;
  });
  const sUAl = boneSeg(sk.upperarm_l), sUAr = boneSeg(sk.upperarm_r), sLAl = boneSeg(sk.lowerarm_l), sLAr = boneSeg(sk.lowerarm_r);
  const armDirL = norm(sub(B('lowerarm_l'), B('upperarm_l'))), armDirR = norm(sub(B('lowerarm_r'), B('upperarm_r')));
  const perpL = norm(cross(armDirL, [0, 0, 1])), perpR = norm(cross(armDirR, [0, 0, 1]));
  const chainD = chainInfo.paths.map((c) => polyDist(c.P));
  const pierce = chainInfo.hooks.filter((k) => k.kind === 'pierce').flatMap((k) => [madd(k.p, k.up, -0.042), madd(k.p, k.up, -0.066)].map((p) => ({ p: bodyB.closest(p).p })));
  const knuckles = ['index_01_l', 'middle_01_l', 'ring_01_l', 'pinky_01_l'].map(B);
  const scarA = [around(bodyB, 40, yTop + 0.01).p, around(bodyB, 6, yTop - 0.13).p];   // stitched gash across the left pec
  const scarB = [around(bodyB, -70, yWaist + 0.1).p, around(bodyB, -38, yWaist - 0.02).p]; // stapled cut on the right flank
  const scarC = [around(bodyB, 150, yWaist + 0.16).p, around(bodyB, 115, yWaist + 0.02).p]; // stitched, on the left lower back
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
    mul(c, [0.86, 0.95, 0.7], ss(0.15, 0.6, g) * 0.4);
    mul(c, [1.06, 0.82, 0.86], ss(0.2, 0.7, -g) * 0.35);
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
    if (sm > 0) {
      const fresh = ss(-0.2, 0.4, N.noise(P[0] * 9, P[1] * 9, P[2] * 9 + 4));
      over(c, mix3(lin([200, 182, 176]), lin([128, 56, 74]), fresh), sm * 0.55);
      st.h -= sm * 0.25; st.ro = lerp(st.ro, 0.42, sm * 0.6);
    }
    // bulging veins (dark blue-green under the pale skin), radiating from the tumour
    const vv = Math.max(veinAt(P), tumVein(P) * 1.1);
    if (vv > 0) { over(c, lin([62, 60, 82]), vv * 0.45); st.h += vv * 0.9; }
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
      const below = cinchY - 0.012 - P[1];
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

  // ---- sack hood: coarse burlap, eye holes cut out, mouth sewn shut, soaked with blood from below
  const HCc = hoodInfo.HC;
  const hoodTex = paintPart(hoodPart, { size: 512, normalSize: 512, ormSize: 256, rough: 0.95, normalStrength: 3 }, (P, Nn, st, u, v) => {
    if (v > 0.875) { // rope: twisted hemp strands
      const tw = Math.sin((u * 260 + v * 900) * Math.PI);
      set(st.c, mix3(lin([116, 98, 68]), lin([62, 50, 34]), 0.5 + 0.5 * tw));
      st.h = tw * 0.9;
      over(st.c, lin([56, 15, 10]), ss(0.05, 0.6, N.fbm(P[0] * 40, P[1] * 40, P[2] * 40, 3)) * 0.75);
      return;
    }
    const fu = u * 150, fv = v * 120;
    const iu = Math.floor(fu), iv = Math.floor(fv), tu = fu - iu, tv = fv - iv;
    const thU = Math.sin(Math.PI * tu), thV = Math.sin(Math.PI * tv);
    const top = ((iu + iv) & 1) === 0;
    const hw = top ? thU * (0.55 + 0.45 * thV) : thV * (0.55 + 0.45 * thU);
    const gap = (1 - ss(0.0, 0.4, thU)) * (1 - ss(0.0, 0.4, thV));
    set(st.c, lin([122, 94, 62]));
    mul(st.c, [1 + (hash(iu * 7 + 1) - 0.5) * 0.14, 1 + (hash(iu * 7 + 1) - 0.5) * 0.14, 1 + (hash(iu * 7 + 1) - 0.5) * 0.14], 1);
    mul(st.c, [1 + (hash(iv * 13 + 5) - 0.5) * 0.25, 1 + (hash(iv * 13 + 5) - 0.5) * 0.25, 1 + (hash(iv * 13 + 5) - 0.5) * 0.25], 1);
    mul(st.c, [0.3, 0.24, 0.2], gap * 0.55);
    st.h = hw * 0.8 + N.fbm(P[0] * 70, P[1] * 70, P[2] * 70, 3) * 0.5;
    // grime, sweat, old stains
    mul(st.c, [0.62, 0.54, 0.46], ss(-0.3, 0.6, N.fbm(P[0] * 18, P[1] * 18, P[2] * 18, 4)) * 0.85);
    mul(st.c, [0.8, 0.74, 0.66], ss(0.0, 0.5, N.fbm(P[0] * 6 + 3, P[1] * 6, P[2] * 6, 3)) * 0.6);
    let bl = 0;
    // soaked from the neck up (blood and sweat), dark around the sewn mouth
    bl = Math.max(bl, ss(cinchY + 0.06, cinchY, P[1] + N.fbm(P[0] * 20, P[1] * 10, P[2] * 20, 3) * 0.03) * 0.95);
    const dm = Math.hypot((P[0] - A.mouth[0]) * 0.8, P[1] - A.mouth[1]);
    if (P[2] > HCc[2]) bl = Math.max(bl, (1 - ss(0.015, 0.05, dm + N.fbm(P[0] * 30, P[1] * 30, 0.5, 3) * 0.012)) * 0.95);
    // eye holes: ragged, cut with a knife; bloody tears running down below them
    for (const e of [A.eyeL, A.eyeR]) {
      if (P[2] < e[2] - 0.02) continue;
      const dx = P[0] - e[0], dy = P[1] - e[1];
      const r = Math.hypot(dx, dy * 1.2) + N.fbm(P[0] * 90, P[1] * 90, 0.3, 3) * 0.0035;
      if (r < 0.0145) { st.a = 0; continue; }
      const rim = 1 - ss(0.0145, 0.022, r);
      mul(st.c, [0.45, 0.32, 0.26], rim * 0.8); st.h += rim * 0.6;
      if (dy < 0 && dy > -0.07) bl = Math.max(bl, (1 - ss(0.002, 0.005, Math.abs(dx - Math.sin(dy * 60) * 0.002))) * (1 - ss(0.04, 0.07, -dy)) * 0.9);
      bl = Math.max(bl, rim * 0.6);
    }
    // the mouth sewn shut: a slit with crude cross stitches of black twine
    if (P[2] > HCc[2]) {
      const dx = P[0] - A.mouth[0], dy = P[1] - A.mouth[1] + dx * dx * 2;
      if (Math.abs(dx) < 0.032) {
        const slit = (1 - ss(0.0008, 0.002, Math.abs(dy))) * ss(0.032, 0.026, Math.abs(dx));
        mul(st.c, [0.2, 0.1, 0.08], slit); st.h -= slit;
        const m = (((dx % 0.0085) + 0.0085) % 0.0085) - 0.00425;
        const th = (1 - ss(0.0007, 0.0014, Math.min(Math.abs(m - dy * 0.7), Math.abs(m + dy * 0.7)))) * (1 - ss(0.005, 0.0065, Math.abs(dy))) * ss(0.03, 0.024, Math.abs(dx));
        over(st.c, lin([24, 16, 12]), th); st.h += th * 1.4;
      }
    }
    // the sewn top seam over the crown (ear to ear) with thick stitches
    if (P[1] > HCc[1] + 0.03) {
      const sd = Math.abs(P[2] - HCc[2] - 0.004);
      const ridge = 1 - ss(0.001, 0.006, sd);
      st.h += ridge * 1.2; mul(st.c, [0.7, 0.6, 0.5], ridge * 0.5);
      const m = (((P[0] % 0.011) + 0.011) % 0.011) - 0.0055;
      const th = (1 - ss(0.0008, 0.0016, Math.abs(m - (P[2] - HCc[2]) * 0.5))) * (1 - ss(0.006, 0.008, sd));
      over(st.c, lin([40, 30, 22]), th); st.h += th;
    }
    if (bl > 0) {
      const age = ss(-0.3, 0.5, N.noise(P[0] * 30, P[1] * 30, P[2] * 30));
      over(st.c, mix3(lin([66, 18, 12]), lin([30, 10, 8]), age), Math.min(1, bl) * 0.88);
      st.ro = lerp(st.ro, 0.7, bl);
    }
  });

  // ---- apron: heavy canvas, once white, soaked with old and fresh blood, hand smears, ragged hem, rips and a slash
  const smears = [[0.16, AP.yWaist - 0.05, -0.6], [0.2, AP.yCrotch + 0.02, -0.75], [-0.18, AP.yWaist - 0.12, 0.7]];
  const apronTex = paintPart(apronPart, { size: 1024, normalSize: 1024, ormSize: 512, rough: 0.9, normalStrength: 2.2 }, (P, Nn, st, u, v) => {
    const strap = v > 0.875;
    set(st.c, strap ? lin([150, 140, 120]) : lin([186, 178, 158]));
    const mott = N.fbm(P[0] * 6, P[1] * 6, P[2] * 6, 4);
    mul(st.c, [0.9, 0.85, 0.74], ss(-0.3, 0.6, mott) * 0.65);
    const wu = Math.sin(u * Math.PI * 2 * 170), wv = Math.sin(v * Math.PI * 2 * 230);
    st.h = (wu * 0.5 + 0.5) * 0.22 + (wv * 0.5 + 0.5) * 0.22 + N.fbm(P[0] * 40, P[1] * 40, P[2] * 40, 3) * 0.35;
    // grease / sweat yellowing on the bib, dirt towards the hem
    mul(st.c, [0.95, 0.86, 0.68], ss(AP.yTop - 0.25, AP.yTop, P[1]) * 0.35);
    const hem = ss(AP.yBot + 0.2, AP.yBot, P[1]);
    over(st.c, lin([66, 56, 44]), hem * 0.65 * ss(-0.4, 0.4, N.fbm(P[0] * 12, P[1] * 12, P[2] * 12, 3)));
    // blood: a diluted pink-brown wash where it soaked into the canvas, crusted dark cores with tide-lines at the
    // dried edges, vertical runs, wiped hand smears, fine spray; a few still-wet glossy patches on the belly
    const soakN = N.fbm(P[0] * 4.5 + 2, P[1] * 3, P[2] * 4.5, 5) + ss(AP.yWaist + 0.12, AP.yCrotch - 0.1, P[1]) * 0.35;
    const wash = ss(-0.15, 0.3, soakN), core = ss(0.28, 0.6, soakN);
    const tide = ss(-0.02, 0.05, soakN) * (1 - ss(0.05, 0.16, soakN));
    const runs = ss(0.5, 0.75, N.noise(P[0] * 70, P[1] * 2.2, 0.5)) * ss(0.05, 0.4, soakN + 0.15) * ss(AP.yTop - 0.12, AP.yWaist, P[1]);
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
    const dried = mix3(lin([86, 28, 17]), lin([44, 16, 10]), ss(-0.3, 0.5, N.noise(P[0] * 18, P[1] * 18, P[2] * 18)));
    over(st.c, lin([146, 92, 78]), wash * 0.5);
    over(st.c, dried, Math.max(core * 0.9, runs * 0.85, marks * 0.9));
    mul(st.c, [0.55, 0.42, 0.4], tide * 0.55);
    const fresh = ss(0.35, 0.65, N.fbm(P[0] * 4 + 11, P[1] * 4, P[2] * 4, 3)) * ss(AP.yTop - 0.2, AP.yWaist, P[1]) * core;
    over(st.c, lin([86, 4, 6]), fresh * 0.85);
    const bk = Math.max(wash * 0.35, core, runs, marks);
    st.ro = lerp(st.ro, lerp(0.7, 0.18, fresh), bk);
    st.h += core * 0.15 + marks * 0.1;
    if (strap) return;
    // ragged hem, two rips up from it, a cleaver slash across the lower left, scorched hole on the right
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
        else mul(st.c, [0.6, 0.5, 0.48], (1 - ss(wdt, wdt + 0.008, ex)) * 0.7);
      }
    }
    const dh = Math.hypot(P[0] + 0.12, P[1] - (AP.yWaist - 0.2)) + N.fbm(P[0] * 50, P[1] * 50, 0.2, 3) * 0.008;
    if (dh < 0.02) cut = true;
    else mul(st.c, [0.3, 0.24, 0.2], (1 - ss(0.02, 0.035, dh)) * 0.8);
    mul(st.c, [0.7, 0.62, 0.55], (1 - ss(0.0, 0.02, P[1] - hemLine)) * 0.6);
    if (cut) st.a = 0;
  });

  // ---- cleaver: yellowed bone with growth bands, porous spine, cracks, a honed lighter edge, blood; rage: glowing edge
  const bladeTex = paintPart(bladePart, { size: 1024, normalSize: 1024, ormSize: 512, rough: 0.5, emissive: true, emissiveSize: 256, normalStrength: 2.6 }, (P, Nn, st, u, v) => {
    const q = sub(P, CI.W0), s = dot(q, CI.ax), w = dot(q, CI.wd);
    const f = clamp01((w - CI.qs) / CI.edgeW(Math.min(s, 0.62)));
    set(st.c, mix3(lin([194, 182, 154]), lin([128, 108, 76]), ss(0.5, 0.0, f) * 0.5 + ss(0.25, 0.0, s) * 0.4));
    mul(st.c, [0.95, 0.85, 0.66], ss(0.0, 0.5, N.fbm(P[0] * 4 + 1, P[1] * 4, P[2] * 4, 3)) * 0.7);
    over(st.c, lin([92, 72, 48]), ss(-0.2, 0.6, N.fbm(P[0] * 12, P[1] * 12, P[2] * 12, 4)) * 0.45);
    const band = Math.sin(f * 38 + N.noise(s * 8, f * 3, 0.5) * 3);
    mul(st.c, [0.9, 0.86, 0.78], (band * 0.5 + 0.5) * 0.35);
    st.h = band * 0.15 + N.ridged(s * 40, f * 6, 0.3 + v, 2) * 0.25;
    const pore = N.worley(P[0] * 260, P[1] * 260, P[2] * 260);
    const spine = ss(0.25, 0.0, f);
    over(st.c, lin([92, 72, 50]), (1 - ss(0.08, 0.2, pore)) * spine * 0.7); st.h -= (1 - ss(0.08, 0.2, pore)) * spine * 0.8;
    const cr = N.ridged(P[0] * 30, P[1] * 30, P[2] * 30, 3);
    const crack = ss(0.82, 0.95, cr) * ss(0.2, 0.6, N.fbm(P[0] * 6, P[1] * 6, P[2] * 6, 2) + 0.3);
    over(st.c, lin([60, 42, 28]), crack * 0.8); st.h -= crack * 0.9;
    const bevel = ss(0.74, 0.8, f);
    over(st.c, lin([226, 214, 190]), bevel * 0.6); st.ro = lerp(st.ro, 0.28, bevel);
    st.h += bevel * Math.sin(s * 900 + N.noise(s * 50, f * 20, 1) * 4) * 0.05;
    const base = ss(0.16, 0.0, s);
    over(st.c, lin([150, 70, 66]), base * 0.6);
    // the classic cleaver hole near the spine at the tip (painted: dark hole, worn bevelled rim)
    {
      const dh = Math.hypot(s - 0.545, (f - 0.2) * CI.edgeW(0.545));
      const hole = 1 - ss(0.011, 0.0135, dh), rim = (1 - ss(0.013, 0.022, dh)) * (1 - hole);
      mul(st.c, [0.06, 0.05, 0.05], hole); st.h -= hole * 2; st.ro = lerp(st.ro, 0.9, hole);
      over(st.c, lin([120, 96, 70]), rim * 0.6); st.h += rim * 0.5;
    }
    // living bone: dark red vessels running from the root along the blade
    const lv = ss(0.7, 0.92, N.ridged(s * 14, f * 30, 0.6, 2)) * ss(0.42, 0.08, s) * ss(0.15, 0.3, f) * (1 - ss(0.7, 0.8, f));
    over(st.c, lin([96, 24, 28]), lv * 0.8); st.h += lv * 0.5;
    const ves = ss(0.7, 0.9, N.ridged(P[0] * 50, P[1] * 50, P[2] * 50, 2)) * ss(0.25, 0.02, s);
    over(st.c, lin([90, 20, 26]), ves * 0.8); st.h += ves * 0.4;
    let bl = 0;
    bl = Math.max(bl, ss(0.6, 0.95, f) * ss(-0.1, 0.5, N.fbm(s * 9, f * 4, 0.7, 3) + 0.25));
    bl = Math.max(bl, ss(0.12, -0.02, s) * 0.9);
    bl = Math.max(bl, ss(0.45, 0.7, N.noise(f * 30, s * 2.5, 0.9)) * ss(0.4, 0.05, s) * 0.9);
    bl = Math.max(bl, (1 - ss(0.05, 0.12, N.worley(P[0] * 90, P[1] * 90, P[2] * 90))) * 0.8);
    bl = Math.max(bl, ss(0.15, 0.45, N.fbm(P[0] * 5 + 7, P[1] * 5, P[2] * 5, 4)) * 0.85);
    if (bl > 0) {
      const fresh = ss(0.3, 0.7, N.fbm(P[0] * 7 + 3, P[1] * 7, P[2] * 7, 3));
      over(st.c, mix3(lin([66, 18, 12]), lin([96, 8, 10]), fresh), Math.min(1, bl) * 0.9);
      st.ro = lerp(st.ro, lerp(0.55, 0.18, fresh), Math.min(1, bl));
      st.h += bl * 0.1;
    }
    const g = ss(0.82, 0.98, f) * (0.6 + 0.4 * N.noise(s * 30, 0.2, 0.4)) + crack * 0.5 + ves * 0.4;
    st.e[0] = g; st.e[1] = g * 0.32; st.e[2] = g * 0.08;
  });

  // ---- flesh sheath: raw muscle and tendon growing out of the forearm over the blade root
  const sheathTex = paintPart(sheathPart, { size: 512, normalSize: 512, ormSize: 256, rough: 0.32, normalStrength: 3 }, (P, Nn, st, u, v) => {
    const torn = ss(0.12, 0.24, u + N.fbm(P[0] * 60, P[1] * 60, P[2] * 60, 3) * 0.08);
    const fib = N.ridged(v * 40, u * 4, 0.7, 3);
    set(st.c, mix3(lin([104, 30, 28]), lin([44, 10, 10]), ss(0.3, 0.8, fib)));
    mul(st.c, [0.75, 0.62, 0.6], ss(-0.2, 0.6, N.fbm(P[0] * 25, P[1] * 25, P[2] * 25, 3)) * 0.6);
    st.h = fib * 0.8 + N.fbm(P[0] * 80, P[1] * 80, P[2] * 80, 3) * 0.4;
    const ten = ss(0.75, 0.95, N.ridged(v * 14 + 3, u * 1.5, 2.1, 2));
    over(st.c, lin([196, 170, 140]), ten * 0.75); st.h += ten * 0.6;
    over(st.c, lin([200, 170, 110]), (1 - ss(0.1, 0.25, N.worley(P[0] * 150, P[1] * 150, P[2] * 150))) * 0.4 * ss(0.3, 0.7, u));
    over(st.c, mix3(lin([128, 92, 90]), lin([120, 60, 64]), ss(0.0, 0.15, u)), 1 - torn);
    mul(st.c, [0.5, 0.35, 0.35], (1 - Math.abs(torn - 0.5) * 2) * 0.6);
    st.ro = lerp(0.55, 0.28, torn);
    const clot = ss(0.3, 0.6, N.fbm(P[0] * 40 + 2, P[1] * 40, P[2] * 40, 3));
    over(st.c, lin([32, 8, 6]), clot * 0.8 * torn); st.ro = lerp(st.ro, 0.45, clot * torn);
    over(st.c, lin([150, 120, 96]), ss(0.8, 0.95, N.ridged(P[0] * 70, P[1] * 70, P[2] * 70, 2)) * 0.35 * torn); // fascia strands
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

  // ---- chains + hooks: rusty iron, dried blood
  const chainTex = paintPart(chainPart, { size: 512, normalSize: 512, ormSize: 256, rough: 0.45, normalStrength: 2.5 }, (P, Nn, st) => {
    set(st.c, lin([74, 70, 66])); st.me = 0.85; st.ro = 0.42;
    const rust = ss(0.0, 0.45, N.fbm(P[0] * 40, P[1] * 40, P[2] * 40, 4) + 0.15);
    over(st.c, mix3(lin([110, 58, 30]), lin([70, 38, 22]), ss(-0.3, 0.4, N.noise(P[0] * 90, P[1] * 90, P[2] * 90))), rust * 0.85);
    st.me = lerp(0.85, 0.15, rust); st.ro = lerp(0.42, 0.88, rust);
    st.h = rust * 0.6 + N.fbm(P[0] * 150, P[1] * 150, P[2] * 150, 2) * 0.3 * rust;
    const b = ss(0.25, 0.55, N.fbm(P[0] * 12 + 4, P[1] * 12, P[2] * 12, 3));
    over(st.c, lin([50, 14, 10]), b * 0.8); st.me = lerp(st.me, 0.05, b); st.ro = lerp(st.ro, 0.55, b);
  });

  // ---- ambient occlusion bakes (contact shadows under the apron, chains, sack and tumour)
  const nsurf = (part) => ({ tris: part.tris(), pos: part.pos, nrm: part.normals() });
  const baseS = nsurf(h.basePart({ name: 'ao' }));
  const RA = texSize(512);
  {
    const occ = makeBVH([surf(fullBody), surf(hoodPart), surf(apronPart), surf(chainPart), surf(tumPart), surf(sheathPart), surf(suit), surf(boots)]).bvh;
    const ao = bakeField(baseS, h.baseObj.uvs, RA, aoTracer(occ, { rays: 16, maxDist: 0.1 }));
    applyFields(skin.albedo, [ao], RA, (c, a) => { const k = lerp(1, a, 0.8); c[0] *= k; c[1] *= k; c[2] *= k; });
    const apS = nsurf(apronPart);
    const occA = makeBVH([surf(apronPart), surf(chainPart), surf(fullBody), surf(hoodPart)]).bvh;
    const aoA = bakeField(apS, apronPart.obj.uvs, texSize(256), aoTracer(occA, { rays: 12, maxDist: 0.08 }));
    applyFields(apronTex.albedo, [aoA], texSize(256), (c, a) => { const k = lerp(1, a, 0.7); c[0] *= k; c[1] *= k; c[2] *= k; });
  }
  // rage glow mask for the skin: veins around the tumour, along the arms and over the chest
  const RE = texSize(1024);
  const glow = bakeField(baseS, h.baseObj.uvs, RE, (P) => {
    const dT = dist(P, T.Bp);
    const region = Math.max(1 - ss(0.12, 0.38, dT), (() => { const q = sLAr(P); return q.d < 0.1 ? 0.9 : 0; })(), (() => { const q = sUAr(P); return q.d < 0.11 ? 0.6 : 0; })(), (() => { const q = sLAl(P); return q.d < 0.1 ? 0.55 : 0; })(), P[1] > yTop - 0.15 && P[2] > 0 ? 0.4 : 0);
    return Math.min(1, Math.max(veinAt(P) * region * 1.3, tumVein(P) * 1.2));
  }, { fill: 0, blur: 1 });
  const skinEm = createImage(RE, RE, [0, 0, 0, 255]);
  for (let i = 0; i < RE * RE; i++) { const gl = glow[i]; skinEm.data[i * 4] = toByte(gl); skinEm.data[i * 4 + 1] = toByte(gl * 0.3); skinEm.data[i * 4 + 2] = toByte(gl * 0.07); }
  for (let i = 0; i < skin.orm.data.length; i += 4) skin.orm.data[i + 1] = Math.max(skin.orm.data[i + 1], 84);

  // ---- materials
  body.material = lib.material('skin', { ...skin, emissiveMap: skinEm, emissive: [0, 0, 0] });
  hoodPart.material = lib.material('cloth', { ...hoodTex, alpha: hoodTex.alpha, doubleSided: true, pngBits: 6, emissiveMap: black, emissive: [0, 0, 0] });
  apronPart.material = lib.material('cloth', { ...apronTex, alpha: apronTex.alpha, doubleSided: true, pngBits: 6, emissiveMap: black, emissive: [0, 0, 0] });
  bladePart.material = lib.material('gear', { ...bladeTex, emissive: [0, 0, 0] });
  sheathPart.material = lib.material('gore', { ...sheathTex, emissiveMap: black, emissive: [0, 0, 0] });
  tumPart.material = lib.material('gore', { ...tumTex, emissive: [0.42, 0.13, 0.03] });
  chainPart.material = lib.material('gear', { ...chainTex, emissiveMap: black, emissive: [0, 0, 0] });
  const bootTex = await lib.texture(boots.asset.textures.diffuse, 512);
  boots.material = lib.material('cloth', {
    albedo: lib.grungeTexture(bootTex, { seed: 5, darken: 0.3, dirt: 0.9, blood: 0.35, tint: [0.55, 0.52, 0.48] }),
    roughness: 0.6, metalness: 0, emissiveMap: black, emissive: [0, 0, 0],
  });
  const eyeM = lib.paintEyes(await lib.texture('system', 'eyes/materials/brown_eye.png', 256), { style: 'glow', color: [1, 0.42, 0.08] });
  eyes.material = lib.material('eye', { albedo: eyeM.albedo, emissiveMap: eyeM.emissiveMap, emissive: [1, 0.55, 0.25], roughness: 0.15 });
  eyes.extras.noSimplify = true;

  const parts = [body, suit, boots, eyes, hoodPart, apronPart, tumPart, bladePart, sheathPart, chainPart];
  for (const p of parts) console.log('  part', p.name.padEnd(14), p.triCount(), 'tris');
  console.log('  chain links', chainInfo.links);

  // =================================================================== scale to full size, helper bones, hitboxes
  const S = 4.2 / h.height;
  const bladeMid = (s) => CI.at(s, CI.qs + 0.5 * CI.edgeW(s), 0);
  const tumourPts = [];
  for (const v of new Set(Array.from(tumPart.tris()).filter((_, i) => i % 2 === 0))) tumourPts.push(v);
  scaleCharacter(h, parts, S);
  console.log('scale', S.toFixed(3), 'height', h.height.toFixed(3));

  // Capsules [bone, radius, toBone] in metres at full size. The game picks the capsule a bullet ray enters FIRST,
  // so the weak points must not sit inside a neighbour's end cap: the head capsule (skull base -> crown) covers the
  // whole sack, there is no separate neck capsule, the chest capsule (rage weak point: upper torso + back tumour)
  // ends just under the sack, and the big gut gets its own capsule in front of the spine, below the chest.
  // Leaf helper bones (no skin weights) give the capsules their end points.
  const bones = h.skeleton.bones, byName = h.skeleton.byName;
  const BP = (n) => byName[n].head.clone();
  addHelperBone(h, 'head_top', 'head', scl(add(HC, [0, 0.035, 0.005]), S));
  addHelperBone(h, 'cleaver_root', 'lowerarm_r', scl(bladeMid(0.1), S));
  addHelperBone(h, 'cleaver_tip', 'lowerarm_r', scl(bladeMid(0.56), S));
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
      const name = part.name === 'cleaver' ? 'cleaver' : ownerOf(bones[part.weights[v][0][0]].name);
      (owned[name] ||= []).push(new THREE.Vector3(part.pos[v * 3], part.pos[v * 3 + 1], part.pos[v * 3 + 2]));
    }
  }
  const dSeg = (p, a, b) => new THREE.Line3(a, b).closestPointToPoint(p, true, new THREE.Vector3()).distanceTo(p);
  const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
  const radius = (name, a, b, q = 0.8) => pct(owned[name].map((p) => dSeg(p, a, b)), q);
  // chest: from spine_03 up to a helper placed so the top cap ends at the base of the sack (iterated)
  const s3 = BP('spine_03'), n1 = BP('neck_01'), capTop = n1.y + 0.03;
  const tumV = tumourPts.map((v) => new THREE.Vector3(tumPart.pos[v * 3], tumPart.pos[v * 3 + 1], tumPart.pos[v * 3 + 2]));
  let chestTop = n1.clone(), rChest = 0;
  for (let it = 0; it < 4; it++) {
    rChest = Math.min(0.66, Math.max(radius('chest', s3, chestTop), pct(tumV.map((p) => dSeg(p, s3, chestTop)), 0.97)));
    const k = Math.max(0.05, Math.min(1, (capTop - rChest - s3.y) / (n1.y - s3.y)));
    chestTop = s3.clone().lerp(n1, k);
  }
  addHelperBone(h, 'chest_top', 'spine_03', chestTop.toArray());
  // gut: vertical segment through the centre of the belly vertices, top cap below spine_03
  const gz = owned.belly.reduce((a, p) => a + p.z, 0) / owned.belly.length;
  const s1 = BP('spine_01'), s2 = BP('spine_02');
  let gLo = new THREE.Vector3(0, s1.y, gz), gHi = new THREE.Vector3(0, s2.y, gz);
  let rGut = radius('belly', gLo, gHi);
  gHi.y = Math.max(gLo.y + 0.05, Math.min(gHi.y, s3.y - rGut * 0.85));
  rGut = radius('belly', gLo, gHi, 0.78);
  addHelperBone(h, 'gut_lo', 'spine_01', gLo.toArray());
  addHelperBone(h, 'gut_hi', 'spine_01', gHi.toArray());
  const HB = {
    head: ['head', 'head_top'], chest: ['spine_03', 'chest_top'], belly: ['gut_lo', 'gut_hi'], pelvis: ['pelvis', 'spine_01'],
    upperarm_l: ['upperarm_l', 'lowerarm_l'], lowerarm_l: ['lowerarm_l', 'hand_l'], hand_l: ['hand_l', 'middle_02_l'],
    upperarm_r: ['upperarm_r', 'lowerarm_r'], lowerarm_r: ['lowerarm_r', 'hand_r'], cleaver: ['cleaver_root', 'cleaver_tip'],
    thigh_l: ['thigh_l', 'calf_l'], calf_l: ['calf_l', 'foot_l'], foot_l: ['foot_l', 'ball_l'],
    thigh_r: ['thigh_r', 'calf_r'], calf_r: ['calf_r', 'foot_r'], foot_r: ['foot_r', 'ball_r'],
  };
  const hitboxes = {}, capsules = {};
  for (const [name, [b0, b1]] of Object.entries(HB)) {
    const a = BP(b0), b = BP(b1);
    let r = name === 'chest' ? rChest : name === 'belly' ? rGut : radius(name, a, b, name === 'cleaver' ? 0.6 : name === 'head' ? 0.85 : 0.8);
    if (name === 'pelvis') r = Math.min(r, 0.6);
    hitboxes[name] = [b0, +r.toFixed(3), b1];
    capsules[name] = { bone: b0, to: b1, radius: +r.toFixed(3), length: +a.distanceTo(b).toFixed(3) };
  }
  console.log('  hitboxes', Object.entries(hitboxes).map(([k, v]) => `${k}:${v[1]}`).join(' '));
  // self-check (rest pose): which capsule does a ray hit first?
  {
    const caps = Object.entries(hitboxes).map(([name, [b0, r, b1]]) => ({ name, a: BP(b0), b: BP(b1), r }));
    const first = (o, d) => {
      let best = null;
      for (const c of caps) for (let t = 0; t < 12; t += 0.01) { const p = o.clone().addScaledVector(d, t); if (dSeg(p, c.a, c.b) <= c.r) { if (!best || t < best.t) best = { t, name: c.name }; break; } }
      return best?.name;
    };
    const hc = scl(HC, 1).map((x) => x * S), tb = scl(T.Bp, S);
    const tests = {
      'head front': [[hc[0], hc[1], 6], [0, 0, -1]], 'head back': [[hc[0], hc[1], -6], [0, 0, 1]], 'head side': [[6, hc[1] - 0.05, hc[2]], [-1, 0, 0]],
      'head from below (8 m, eye height)': [[0, 1.7, 8], norm(sub(hc, [0, 1.7, 8]))],
      'tumour from behind': [[tb[0], tb[1], -6], [0, 0, 1]], 'tumour from behind-above': [[tb[0], tb[1] + 3, -6], norm(sub(tb, [tb[0], tb[1] + 3, -6]))],
      'pecs front': [[0.35, s3.y + 0.25, 6], [0, 0, -1]], 'gut front': [[0, s1.y + 0.1, 6], [0, 0, -1]],
    };
    console.log('  first capsule hit:', Object.entries(tests).map(([k, [o, d]]) => `${k} -> ${first(new THREE.Vector3(...o), new THREE.Vector3(...d))}`).join('; '));
  }

  // the clips already carry a zombie hunch: only lift the neck / head so the hood looks at its prey, drop the
  // shoulders forward a little, and keep the left hand balled into a fist
  const poseOffsets = {
    spine_03: [2, 0, 0], neck_01: [-18, 0, 0], head: [-16, 0, 0],
    clavicle_l: [0, 0, -5], clavicle_r: [0, 0, 5],
  };
  for (const f of ['index', 'middle', 'ring', 'pinky']) Object.assign(poseOffsets, { [f + '_01_l']: [62, 0, 0], [f + '_02_l']: [75, 0, 0], [f + '_03_l']: [55, 0, 0] });
  Object.assign(poseOffsets, { thumb_02_l: [30, 0, 0], thumb_03_l: [35, 0, 0] });
  return {
    human: h, parts, budget: 18000, partBudget: { body: 8000, trousers: 1500, boots: 650 },
    extras: { poseOffsets, hitboxes, capsules, weakPoints: { head: 'sack-hooded head', chest: 'upper torso + glowing back tumour (rage phase)' }, archetype: 'boss', gender: 'male', boss: 'butcher' },
    lod1: { budget: 5000, texScale: 0.5, drop: ['eyes'], partBudget: { body: 2000, trousers: 420, boots: 220, hood: 320, apron: 360, tumour: 260, cleaver: 300, cleaver_flesh: 160, chains: 760 } },
  };
}
