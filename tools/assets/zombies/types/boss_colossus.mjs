// boss_colossus — 災厄巨像 COLOSSUS -> 深淵之翼 ABYSS WING, the round-10 final boss (game/src/zombies/brains/colossus.js),
// ~7 m standing (idle). A lumbering, mutated giant with knuckle-walking ape proportions: two great trapezius masses
// framing a head carried low and forward on a thick neck, massive forearms long enough to knuckle the ground, short
// heavy legs; an elongated, jutting jaw crowded with fangs, a low bony crest, vertebral spikes along a hunched spine,
// pulsing spore sacs (the mortar) on the back and the shoulders, torn flesh, and a crusted core glowing through its
// cracks in a split-open chest (the weak point). Two bat wings lie folded on the back (wrist knuckle and thumb claw
// over each shoulder, the membrane bundled in pleats); the spread wings (~12 m across) sit under the nodes wing_l /
// wing_r (pivots under the shoulder blades), which ship at node scale 0.01: the brain's metamorphosis scales them to
// 1, and the folded wings shrink into the pivots as the spread ones grow out (see the GLB patch below).
//
// Built on the shared pipeline lib (MakeHuman CC0 base mesh, game_engine skeleton, UV raster, GLB writer). Everything
// specific to this character is implemented here: the sculpt (short heavy legs, arm stretch and forearms, hands,
// yoke, hump, neck and jaw, chest crater), the posture baked into the rest pose (no runtime poseOffsets), the custom
// skinned parts (fangs / gums / tongue, bone spikes / claws / ribs / crest, spore sacs, core, folded + spread wings),
// their painting, the scale to full size, the helper bones, the capsule hitboxes, and a post-write patch of the GLB
// (wing node scale, folded-wing inverse bind matrices; the shared writer has neither).
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { boneSegment, buildSkeleton } from '../lib/rig.mjs';
import { rasterUV, texelSurface, texelAttr } from '../lib/raster.mjs';
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
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const texSize = (s) => Math.max(64, Math.round(s * +(process.env.ZOMBIE_TEX_SCALE || 1)));
const toByte = (x) => { x = Math.max(0, x); const s = x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(s * 255))); };
const over = (c, k, a) => { if (!(a > 0)) return; a = Math.min(1, a); for (let i = 0; i < 3; i++) c[i] += (k[i] - c[i]) * a; };
const mul = (c, k, a) => { if (!(a > 0)) return; a = Math.min(1, a); for (let i = 0; i < 3; i++) c[i] *= 1 + (k[i] - 1) * a; };
const set = (c, k) => { c[0] = k[0]; c[1] = k[1]; c[2] = k[2]; };
const lum = (c) => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
const hash = (i) => { let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
const rot = (v, ax, ang) => { // Rodrigues
  const c = Math.cos(ang), s = Math.sin(ang), d = dot(ax, v), cr = cross(ax, v);
  return [v[0] * c + cr[0] * s + ax[0] * d * (1 - c), v[1] * c + cr[1] * s + ax[1] * d * (1 - c), v[2] * c + cr[2] * s + ax[2] * d * (1 - c)];
};

/** Per-texel grade of an RGBA image in place: fn(c linear rgb, u, v) mutates c. */
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

/** Closest-point parameter t (0 head .. 1 tail, unclamped) and distance from P to a segment a->b. */
function segFn(a, b) {
  const d = sub(b, a), dd = dot(d, d) || 1e-9;
  return (P) => {
    const t = dot(sub(P, a), d) / dd, tc = clamp01(t);
    return { t, d: Math.hypot(P[0] - a[0] - d[0] * tc, P[1] - a[1] - d[1] * tc, P[2] - a[2] - d[2] * tc) };
  };
}
const boneSeg = (bone) => segFn(V(bone.head), V(bone.tail));

/** Distance from P to a polyline (with a bounding-box early out). */
function polyDist(pts) {
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
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

/** Bilinear lookup of a field baked at R x R for texel (x, y) of a W x W image. */
function fieldAt(f, R, W, x, y) {
  const fx = Math.max(0, Math.min(R - 1.001, (x + 0.5) * R / W - 0.5)), fy = Math.max(0, Math.min(R - 1.001, (y + 0.5) * R / W - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, j = y0 * R + x0;
  return (f[j] * (1 - tx) + f[j + 1] * tx) * (1 - ty) + (f[j + R] * (1 - tx) + f[j + R + 1] * tx) * ty;
}

/** Multiplies a field (fn(...values) -> 0..1) into the ORM occlusion channel. */
function applyOcclusion(orm, fields, R, fn) {
  const W = orm.width, vals = new Array(fields.length);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    for (let k = 0; k < fields.length; k++) vals[k] = fieldAt(fields[k], R, W, x, y);
    const i = (y * W + x) * 4;
    orm.data[i] = Math.round(orm.data[i] * clamp01(fn(...vals)));
  }
  return orm;
}

/** Applies fn(c, ...values) per texel of an RGB image with fields baked at R x R. */
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

/** Catmull-Rom through points, `n` samples per span. */
function catmull(pts, n) {
  const out = [];
  const P = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map((a) => 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3)));
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}

// ---------------------------------------------------------------- custom geometry -> skinned Part
class Geo {
  constructor() { this.P = []; this.UV = []; this.F = []; this.W = []; this.tag = []; }
  v(p, uv, w = null, tag = 0) { this.P.push(p[0], p[1], p[2]); this.UV.push(uv[0], uv[1]); this.W.push(w); this.tag.push(tag); return this.P.length / 3 - 1; }
  tri(a, b, c) { this.F.push({ v: [a, b, c], t: [a, b, c], g: 0 }); }
  quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }
  get n() { return this.P.length / 3; }
  p(i) { return [this.P[i * 3], this.P[i * 3 + 1], this.P[i * 3 + 2]]; }
}

/**
 * Tube along a polyline: radius(t) and `sides` around, parallel-transport frames. uv rect [u0,v0,u1,v1]
 * (u along the tube, v around). Optional pointed / capped end. Returns the vertex range [start, end).
 */
function tube(g, pts, radius, sides, uvr, w = null, { ref = [0, 1, 0], tipEnd = false, capStart = false, flat = 1, tag = 0 } = {}) {
  const n = pts.length;
  const T = pts.map((p, i) => norm(sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)])));
  let N0 = norm(cross(T[0], Math.abs(dot(T[0], norm(ref))) > 0.95 ? [1, 0, 0] : ref));
  const frames = [];
  for (let i = 0; i < n; i++) {
    if (i) { const b = cross(T[i - 1], T[i]); if (len(b) > 1e-6) { const ax = norm(b), ang = Math.acos(Math.max(-1, Math.min(1, dot(T[i - 1], T[i])))); N0 = rot(N0, ax, ang); } }
    N0 = norm(sub(N0, scl(T[i], dot(N0, T[i]))));
    frames.push([N0, cross(T[i], N0)]);
  }
  const start = g.n;
  const wOf = (i) => (typeof w === 'function' ? w(i / (n - 1), pts[i]) : w);
  for (let i = 0; i < n; i++) {
    const r = typeof radius === 'function' ? radius(i / (n - 1), i) : radius;
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const d = add(scl(frames[i][0], Math.cos(a) * flat), scl(frames[i][1], Math.sin(a)));
      g.v(madd(pts[i], d, r), [lerp(uvr[0], uvr[2], i / (n - 1)), lerp(uvr[1], uvr[3], k / sides)], wOf(i), tag);
    }
  }
  for (let i = 0; i + 1 < n; i++) for (let k = 0; k < sides; k++) {
    const a = start + i * (sides + 1) + k, b = a + sides + 1;
    g.quad(a, a + 1, b + 1, b);
  }
  if (tipEnd) {
    const last = start + (n - 1) * (sides + 1);
    const tip = g.v(madd(pts[n - 1], T[n - 1], typeof radius === 'function' ? radius(1, n - 1) * 0.9 : radius * 0.9), [uvr[2], (uvr[1] + uvr[3]) / 2], wOf(n - 1), tag);
    for (let k = 0; k < sides; k++) g.tri(last + k, last + k + 1, tip);
  }
  if (capStart) {
    const c = g.v(madd(pts[0], T[0], -(typeof radius === 'function' ? radius(0, 0) : radius) * 0.5), [uvr[0], (uvr[1] + uvr[3]) / 2], wOf(0), tag);
    for (let k = 0; k < sides; k++) g.tri(start + k + 1, start + k, c);
  }
  return [start, g.n];
}

/** Turns a Geo into a lib Part (own UVs, one vertex per UV) with explicit skin weights. */
function toPart(lib, h, g, name, role, skinFn) {
  // drop degenerate triangles (collapsed sphere poles, the wing panels' pinched ends): a vertex left only on
  // zero-area faces would get a zero normal
  g.F = g.F.filter((f) => len(cross(sub(g.p(f.v[1]), g.p(f.v[0])), sub(g.p(f.v[2]), g.p(f.v[0])))) > 1e-12);
  const n = g.n;
  const obj = { positions: Float32Array.from(g.P), uvs: Float32Array.from(g.UV), faces: g.F, groups: ['default'], groupIndex: new Map([['default', 0]]), groupVerts: () => new Set() };
  const part = new lib.Part({ name, role, obj, pos: Float32Array.from(g.P), refIdx: new Int32Array(n * 3), refW: new Float32Array(n * 3) });
  const bones = h.skeleton.bones;
  part.weights = new Array(n);
  part.seg = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let list = g.W[i] || skinFn([g.P[i * 3], g.P[i * 3 + 1], g.P[i * 3 + 2]], i, g.tag[i]);
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
  const index = g.index.array;
  const srcTri = (fi) => Math.floor(index[fi * 3] / 3);
  const faceN = (fi) => {
    const b = srcTri(fi) * 9;
    const e1 = [arr[b + 3] - arr[b], arr[b + 4] - arr[b + 1], arr[b + 5] - arr[b + 2]], e2 = [arr[b + 6] - arr[b], arr[b + 7] - arr[b + 1], arr[b + 8] - arr[b + 2]];
    return norm(cross(e1, e2));
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

/** Closest-skin weights: bone weights of the base-mesh surface point nearest to p, filtered to `allow`. */
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
const surf = (part) => ({ pos: part.pos, tris: part.tris() });
const nsurf = (part) => ({ pos: part.pos, tris: part.tris(), nrm: part.normals() });

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
 * Sculpts the morphed base mesh with fn(p metres, vertexIndex, isBody) -> p for EVERY base vertex (joint helper
 * cubes included, so the rebuilt skeleton follows the new shape), then rebuilds the skeleton.
 */
async function sculpt(h, fn) {
  const n = h.pos.length / 3, o = h.origin;
  const isBody = new Uint8Array(n);
  for (const v of h.baseObj.groupVerts('body')) isBody[v] = 1;
  const out = new Float32Array(h.pos.length);
  for (let i = 0; i < n; i++) {
    const p = fn([h.pos[i * 3], h.pos[i * 3 + 1], h.pos[i * 3 + 2]], i, !!isBody[i]);
    out[i * 3] = p[0]; out[i * 3 + 1] = p[1]; out[i * 3 + 2] = p[2];
  }
  for (let i = 0; i < out.length; i++) { h.pos[i] = out[i]; h.dm[i] = out[i] * 10 + o[i % 3]; }
  h.skeleton = await buildSkeleton(h.baseObj, h.pos);
  let top = 0;
  for (const v of h.baseObj.groupVerts('body')) top = Math.max(top, h.pos[v * 3 + 1]);
  h.height = h.headTop = top;
}

/**
 * Bakes a posture into the REST pose: every base vertex (joint helper cubes included) is skinned (linear blend)
 * by local rotations `offsets` {bone: [x, y, z] deg, Euler XYZ, multiplied after the rest local rotation exactly
 * like extras.poseOffsets}, then the skeleton is rebuilt from the posed joints. The clips are retargeted per bone as
 * world-space deltas from the rest pose (game/src/zombies/retarget.js), so the posture survives in every clip
 * without runtime pose offsets -- which the game re-multiplies every frame onto bones the mixer did not rewrite
 * (a clamped one-shot holding its last frame: the offsets then accumulate and the bones spin).
 */
async function bakePose(h, offsets, arms = null) {
  const bones = h.skeleton.bones, nb = bones.length;
  // world-space rest rotations of the arms (premultiplied, the subtree follows): the upper arm flexed forward
  // (about world X) by fl and abducted (about world Z) by ab, the forearm bent about the elbow axis by el (deg)
  const R = new Array(nb).fill(null);
  if (arms) for (const s of ['l', 'r']) {
    const sg = s === 'l' ? 1 : -1, a = arms[s], D = Math.PI / 180;
    const ua = h.skeleton.byName['upperarm_' + s], fa = h.skeleton.byName['lowerarm_' + s];
    R[ua.index] = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -a.fl * D).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), sg * a.ab * D));
    const uaDir = fa.head.clone().sub(ua.head).normalize().applyQuaternion(R[ua.index]);
    if (a.el) R[fa.index] = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3().crossVectors(uaDir, new THREE.Vector3(0, 0, 1)).normalize(), sg * a.el * D);
  }
  const depth = (b) => { let d = 0; while (b.parent >= 0) { b = bones[b.parent]; d++; } return d; };
  const order = bones.map((b, i) => i).sort((a, b) => depth(bones[a]) - depth(bones[b]));
  const pq = new Array(nb), ph = new Array(nb), dq = new Array(nb);
  const e = new THREE.Euler();
  for (const i of order) {
    const b = bones[i], o = offsets[b.name];
    const off = o ? new THREE.Quaternion().setFromEuler(e.set(o[0] * Math.PI / 180, (o[1] || 0) * Math.PI / 180, (o[2] || 0) * Math.PI / 180)) : new THREE.Quaternion();
    if (b.parent < 0) { pq[i] = b.world.clone().multiply(off); ph[i] = b.head.clone(); }
    else {
      const p = b.parent;
      const local = bones[p].world.clone().invert().multiply(b.world);
      pq[i] = pq[p].clone().multiply(local).multiply(off);
      ph[i] = ph[p].clone().add(b.head.clone().sub(bones[p].head).applyQuaternion(bones[p].world.clone().invert()).applyQuaternion(pq[p]));
    }
    if (R[i]) pq[i].premultiply(R[i]);
    dq[i] = pq[i].clone().multiply(b.world.clone().invert());
  }
  // weights: the rig's own, else (helper geometry without weights) those of the 6 nearest body vertices
  const nv = h.pos.length / 3, bodyV = Int32Array.from(h.baseObj.groupVerts('body'));
  const W = new Array(nv);
  for (let v = 0; v < nv; v++) {
    if (h.weights[v]?.length) { W[v] = h.weights[v]; continue; }
    const px = h.pos[v * 3], py = h.pos[v * 3 + 1], pz = h.pos[v * 3 + 2];
    const best = [], bd = [];
    for (const u of bodyV) {
      const dx = h.pos[u * 3] - px, dy = h.pos[u * 3 + 1] - py, dz = h.pos[u * 3 + 2] - pz, d = dx * dx + dy * dy + dz * dz;
      if (best.length < 6 || d < bd[best.length - 1]) {
        let j = Math.min(best.length, 5);
        if (best.length < 6) { best.push(u); bd.push(d); j = best.length - 1; }
        while (j > 0 && bd[j - 1] > d) { best[j] = best[j - 1]; bd[j] = bd[j - 1]; j--; }
        best[j] = u; bd[j] = d;
      }
    }
    const acc = new Map();
    for (const u of best) for (const [bi, w] of h.weights[u]) acc.set(bi, (acc.get(bi) || 0) + w / best.length);
    W[v] = [...acc.entries()];
  }
  const t = new THREE.Vector3();
  await sculpt(h, (p, vi) => {
    const list = W[vi];
    let sw = 0;
    const out = [0, 0, 0];
    for (const [bi, w] of list) {
      t.set(p[0], p[1], p[2]).sub(bones[bi].head).applyQuaternion(dq[bi]).add(ph[bi]);
      out[0] += t.x * w; out[1] += t.y * w; out[2] += t.z * w; sw += w;
    }
    return sw > 1e-6 ? [out[0] / sw, out[1] / sw, out[2] / sw] : p;
  });
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

/** Drops kept faces of `part` that sit in small connected islands (< minFaces). */
function dropIslands(part, minFaces) {
  const F = part.obj.faces;
  const par = new Int32Array(part.nVerts).map((_, i) => i);
  const find = (a) => { while (par[a] !== a) a = par[a] = par[par[a]]; return a; };
  F.forEach((f, fi) => { if (part.keep[fi]) for (let k = 1; k < f.v.length; k++) { const a = find(f.v[0]), b = find(f.v[k]); if (a !== b) par[a] = b; } });
  const comp = new Map();
  F.forEach((f, fi) => { if (!part.keep[fi]) return; const r = find(f.v[0]); (comp.get(r) || comp.set(r, []).get(r)).push(fi); });
  let dropped = 0;
  for (const faces of comp.values()) if (faces.length < minFaces) { for (const fi of faces) part.keep[fi] = 0; dropped += faces.length; }
  return dropped;
}

/// ---------------------------------------------------------------- GLB post-write patch: wing node scale + fold IBMs
// The shared GLB writer emits bone nodes with translation + rotation only and the plain inverse bind matrices, so
// the written file is patched in place:
// 1. `scale` 0.01 on the nodes named wing_l / wing_r: the spread wings ship hidden (the colossus brain scales the
//    nodes back to 1 during its metamorphosis). Their inverse bind matrices stay those of the full-size wings, so
//    at scale 1 they deform exactly like the rest pose.
// 2. The folded wings must show while those nodes are at 0.01 and vanish once they reach 1, although the brain only
//    ever scales wing_l / wing_r. Each folded-wing vertex is skinned half to wing_fold_* (a child of wing_*) and half
//    to wing_sheath* (children of the spine), and those joints' inverse bind matrices get a uniform scale about the
//    wing pivot P folded in: sheath x FOLD_C, fold x FOLD_K (negative: a point reflection through P). The skinned
//    vertex is then P + (0.5 FOLD_C + 0.5 FOLD_K s)(v - P) for wing node scale s (plus the spine's own motion): 1 at
//    s = 0.01 (exactly the authored fold), FOLD_EPS (collapsed into the pivot, inside the body) at s = 1, linear in
//    between, so the fold shrinks into the back while the spread wings grow out of it.
const WING_NODES = ['wing_l', 'wing_r'];
const WING_REST_SCALE = 0.01;
const FOLD_EPS = 0.003;
const FOLD_WK = (FOLD_EPS - 1) / (1 - WING_REST_SCALE);      // w * k with w = 0.5 on the fold joint
const FOLD_K = FOLD_WK / 0.5, FOLD_C = (1 - WING_REST_SCALE * FOLD_WK) / 0.5;
const FOLD_PIVOTS = {};                                       // side -> wing pivot (final metres), set by build()
function patchGLB(buf, s) {
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  let n = 0;
  for (const node of json.nodes) if (WING_NODES.includes(node.name)) { node.scale = [s, s, s]; n++; }
  if (n !== WING_NODES.length) throw new Error(`boss_colossus: wing nodes found ${n}/${WING_NODES.length}`);
  // inverse bind matrices of the fold / sheath joints (patched in the BIN chunk, in place)
  const skin = json.skins[0], acc = json.accessors[skin.inverseBindMatrices], view = json.bufferViews[acc.bufferView];
  const bin0 = 20 + jsonLen + 8 + (view.byteOffset || 0) + (acc.byteOffset || 0);
  let patched = 0;
  skin.joints.forEach((ni, j) => {
    const m = /^wing_(fold|sheath2?)_([lr])$/.exec(json.nodes[ni].name);
    if (!m) return;
    const P = FOLD_PIVOTS[m[2]];
    if (!P) throw new Error('boss_colossus: fold pivot missing for ' + m[2]);
    const f = m[1] === 'fold' ? FOLD_K : FOLD_C;
    const ibm = new THREE.Matrix4();
    const off = bin0 + j * 64;
    for (let k = 0; k < 16; k++) ibm.elements[k] = buf.readFloatLE(off + k * 4);
    const SP = new THREE.Matrix4().makeTranslation(P[0], P[1], P[2]).multiply(new THREE.Matrix4().makeScale(f, f, f)).multiply(new THREE.Matrix4().makeTranslation(-P[0], -P[1], -P[2]));
    ibm.multiply(SP);
    for (let k = 0; k < 16; k++) buf.writeFloatLE(ibm.elements[k], off + k * 4);
    patched++;
  });
  if (patched !== 6) throw new Error(`boss_colossus: fold joints patched ${patched}/6`);
  let jb = Buffer.from(JSON.stringify(json), 'utf8');
  jb = Buffer.concat([jb, Buffer.alloc((4 - (jb.length % 4)) % 4, 0x20)]);
  const rest = buf.subarray(20 + jsonLen);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + jb.length + rest.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jb.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  return Buffer.concat([header, jh, jb, rest]);
}
function installWingScalePatch() {
  if (fs.__colossusWingPatch) return;
  const orig = fs.writeFileSync;
  fs.writeFileSync = function (file, data, ...rest) {
    if (typeof file === 'string' && /boss_colossus(_lod1)?\.glb$/.test(path.basename(file)) && Buffer.isBuffer(data)) {
      // COLOSSUS_WINGS_OPEN=1 (look-dev): ships the spread wings open (node scale 1; the folded ones collapsed)
      const s = process.env.COLOSSUS_WINGS_OPEN === '1' ? 1 : WING_REST_SCALE;
      data = patchGLB(data, s);
      console.log(`  ${path.basename(file)}: wing nodes ${WING_NODES.join(', ')} scale ${s}; fold joints IBM x${FOLD_K.toFixed(4)} / sheath x${FOLD_C.toFixed(4)}`);
    }
    return orig.call(this, file, data, ...rest);
  };
  fs.__colossusWingPatch = true;
}

// =====================================================================================================
// rest height of the body top (m, full size); the human-scale -> full-size factor follows from it
const REST_HEIGHT = 9.2;
// top of the body in the retargeted idle clip (measured in the zombie viewer: anims idle, every frame)
const IDLE_TOP = 6.96;
// mesh raised against the skeleton (m, full size): the library clips sink this short-legged, big-footed body into the floor
const MESH_LIFT = 0.13;
// posture baked into the rest pose (local Euler deg, like poseOffsets; see bakePose): the neck carries the head
// forward of the trapezius (it stays in sight when scream / stagger throw it back) with the face lifted again; the
// shoulders shrugged a little and the arms brought forward and in, so the long arms knuckle the ground in idle /
// walk_a instead of sinking into it; knuckle-walker fists
const POSTURE = {
  neck_01: [14, 0, 0], head: [-2, 0, 0],
};
// the arms rest pose is turned in WORLD space (the clips' world deltas then hang them forward of the body, the
// knuckles on the ground in idle and walk_a; the idle clip drops the left arm lower, so it gets a bit more)
const POSTURE_ARMS = { l: { fl: 34, ab: -6, el: 0 }, r: { fl: 23, ab: -8, el: 0 } };
for (const s of ['l', 'r']) for (const f of ['index', 'middle', 'ring', 'pinky']) Object.assign(POSTURE, { [`${f}_01_${s}`]: [50, 0, 0], [`${f}_02_${s}`]: [70, 0, 0], [`${f}_03_${s}`]: [35, 0, 0] });

export async function build(lib) {
  installWingScalePatch();
  const N = lib.makeNoise(7171);
  const opts = {
    macro: { gender: 1, age: 0.55, muscle: 1, weight: 0.72, height: 1, proportions: 0.15, race: { caucasian: 0.7, african: 0.3 } },
    modifiers: {
      // ape proportions: long, massive arms, huge hands, short heavy legs
      'measure-upperarm-length-decr-incr': 1, 'measure-lowerarm-length-decr-incr': 1,
      'upperarm-muscle-decr-incr': 1, 'measure-upperarm-circ-decr-incr': 0.8, 'upperarm-shoulder-muscle-decr-incr': 1,
      'lowerarm-muscle-decr-incr': 1, 'lowerarm-scale-horiz-decr-incr': 0.6, 'lowerarm-scale-depth-decr-incr': 0.6, 'measure-wrist-circ-decr-incr': 1,
      'hand-scale-decr-incr': 1, 'hand-fingers-diameter-decr-incr': 1, 'hand-fingers-length-decr-incr': -0.5,
      'measure-upperleg-height-decr-incr': -0.45, 'measure-lowerleg-height-decr-incr': -0.4,
      'upperleg-muscle-decr-incr': 1, 'measure-thigh-circ-decr-incr': 1, 'upperleg-scale-horiz-decr-incr': 0.5, 'upperleg-scale-depth-decr-incr': 0.5,
      'lowerleg-muscle-decr-incr': 1, 'measure-calf-circ-decr-incr': 1, 'lowerleg-scale-horiz-decr-incr': 0.5, 'lowerleg-scale-depth-decr-incr': 0.4,
      'measure-knee-circ-decr-incr': 0.8, 'measure-ankle-circ-decr-incr': 1, 'foot-scale-decr-incr': 1,
      // a barrel chest and a yoke of muscle over a lean, sunken waist
      'measure-shoulder-dist-decr-incr': 1, 'torso-muscle-dorsi-decr-incr': 1, 'torso-muscle-pectoral-decr-incr': 1,
      'torso-vshape-decr-incr': 1, 'torso-scale-depth-decr-incr': 0.85, 'torso-scale-horiz-decr-incr': 0.5,
      'measure-waist-circ-decr-incr': -0.4, 'stomach-pregnant-decr-incr': -0.7, 'measure-hips-circ-decr-incr': -0.1,
      // a thick neck long enough to carry the head forward of the trapezius (a stubby one hid the head behind the
      // yoke whenever a clip tilts it back); a small head with a low brow, a flattened nose, small ears, a long jaw
      'measure-neck-circ-decr-incr': 1, 'neck-scale-horiz-decr-incr': 1, 'measure-neck-height-decr-incr': 0.35, 'neck-back-scale-depth-decr-incr': 0.4,
      'head-scale-horiz-decr-incr': -0.15, 'head-scale-depth-decr-incr': 0.1, 'head-fat-decr-incr': -0.6,
      'forehead-scale-vert-decr-incr': -0.8, 'forehead-nubian-decr-incr': 0.8, 'forehead-trans-backward-forward': -0.5,
      'chin-jaw-drop-decr-incr': 1, 'chin-prognathism-decr-incr': 1, 'chin-height-decr-incr': 1, 'chin-bones-decr-incr': 1, 'chin-width-decr-incr': 0.6,
      'cheek-volume-decr-incr': -1, 'cheek-bones-decr-incr': 1, 'cheek-inner-decr-incr': -0.8,
      'mouth-scale-horiz-decr-incr': 1, 'mouth-trans-backward-forward': 0.6,
      'nose-scale-depth-decr-incr': -1, 'nose-scale-vert-decr-incr': -0.5, 'nose-volume-decr-incr': -0.6, 'nose-flaring-decr-incr': 1, 'nose-nostrils-width-decr-incr': 1, 'nose-compression-compress-uncompress': -1,
      'ear-scale-decr-incr': -0.8, 'ear-shape-pointed-triangle': 1, 'ear-lobe-decr-incr': -1, 'ear-flap-decr-incr': -1,
      'eye-scale-decr-incr': -0.6,
    },
    // the lipless snarl: mouth gaping, lips pulled back off the gums, nose wrinkled, brows down
    expression: {
      'mouth-open': 0.55, 'mouth-retraction': 0.8, 'mouth-upward-retraction': 0.6,
      'nose-left-elevation': 0.6, 'nose-right-elevation': 0.6, 'eyebrows-left-down': 0.8, 'eyebrows-right-down': 0.8, 'neck-platysma': 0.7,
    },
  };
  const h = await lib.Human.create(opts);
  const sk0 = h.skeleton.byName, P0 = (n) => V(sk0[n].head), T0 = (n) => V(sk0[n].tail);
  const A0 = lib.anchors(h);
  console.log('  human height', h.height.toFixed(3), 'pelvis', P0('pelvis')[1].toFixed(3), 'neck', P0('neck_01').map((x) => x.toFixed(3)).join(','), 'mouth', A0.mouth.map((x) => x.toFixed(3)).join(','));

  // ===================================================================== SCULPT
  {
    const bodyB0 = makeBVH([surf(h.basePart({ name: 'probe' }))]);
    const yN = P0('neck_01')[1], yS3 = P0('spine_03')[1], yS1 = P0('spine_01')[1], yP = P0('pelvis')[1];
    const chain0 = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'head'].map(P0);
    const spineZ0 = (y) => {
      if (y <= chain0[0][1]) return chain0[0][2];
      for (let i = 0; i + 1 < chain0.length; i++) if (y <= chain0[i + 1][1]) return lerp(chain0[i][2], chain0[i + 1][2], (y - chain0[i][1]) / (chain0[i + 1][1] - chain0[i][1]));
      return chain0[chain0.length - 1][2];
    };
    // per base vertex: summed weight of each arm / hand chain (body vertices; helper cubes use their position)
    const nv = h.pos.length / 3;
    const armW = { l: new Float32Array(nv), r: new Float32Array(nv) }, handW = { l: new Float32Array(nv), r: new Float32Array(nv) };
    const legW = { l: new Float32Array(nv), r: new Float32Array(nv) };
    const bones0 = h.skeleton.bones;
    h.weights.forEach((list, v) => {
      for (const [b, w] of list) {
        const name = bones0[b].name;
        const side = name.endsWith('_l') ? 'l' : 'r';
        if (/^(thigh|calf|foot|ball)/.test(name)) { legW[side][v] += w; continue; }
        if (!/^(upperarm|lowerarm|hand|thumb|index|middle|ring|pinky)/.test(name)) continue;
        armW[side][v] += w;
        if (!/^(upperarm|lowerarm)/.test(name)) handW[side][v] += w;
      }
    });
    const arms = ['l', 'r'].map((s) => {
      const S = P0('upperarm_' + s), E = P0('lowerarm_' + s), W = P0('hand_' + s), F = T0('middle_03_' + s);
      const knuck = ['index_01_', 'middle_01_', 'ring_01_', 'pinky_01_'].map((n) => P0(n + s));
      const kc = scl(knuck.reduce((a, k) => add(a, k), [0, 0, 0]), 0.25);
      const fingers = [];
      for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky']) for (const j of ['01', '02', '03']) {
        const a0 = P0(`${f}_${j}_${s}`), a1 = T0(`${f}_${j}_${s}`), sf = segFn(a0, a1);
        sf.at = (t) => lerp3(a0, a1, t);
        fingers.push(sf);
      }
      return { s, sx: s === 'l' ? 1 : -1, S, E, W, F, kc, fingers, u1: norm(sub(E, S)), L1: dist(S, E), u2: norm(sub(W, E)), L2: dist(E, W), uh: norm(sub(kc, W)), poly: polyDist([S, E, W, kc, F]) };
    });
    const A1 = 0.36, A2 = 0.52, HS = 1.5;     // upper arm / forearm stretch, hand scale (knuckles reach the ground)
    // legs: short, heavy columns. The hip -> ankle span is compressed (everything above drops with it, the arms
    // included) and the thighs / calves swell about their bones (less on the inner side: the thighs must not merge)
    const legs = ['l', 'r'].map((s) => {
      const H = P0('thigh_' + s), K = P0('calf_' + s), Aj = P0('foot_' + s);
      return { s, sx: s === 'l' ? 1 : -1, H, K, Aj, u1: norm(sub(K, H)), L1: dist(H, K), u2: norm(sub(Aj, K)), L2: dist(K, Aj) };
    });
    const yAnk = (legs[0].Aj[1] + legs[1].Aj[1]) / 2, yHip = (legs[0].H[1] + legs[1].H[1]) / 2;
    const KL = 0.76;
    const legDrop = (yy) => (Math.min(Math.max(yy, yAnk), yHip + 0.02) - yAnk) * (1 - KL);
    const fullDrop = legDrop(1e9);
    const armDisp = (a, p) => {
      const t1 = dot(sub(p, a.S), a.u1) / a.L1, t2 = dot(sub(p, a.E), a.u2) / a.L2;
      return add(scl(a.u1, A1 * a.L1 * ss(0.08, 0.92, t1)), scl(a.u2, A2 * a.L2 * ss(0.08, 0.92, t2)));
    };
    // chest crater (the split sternum the core sits in)
    const yC = lerp(yS3, yN, 0.38);
    const cHit = bodyB0.first([0, yC, 1.5], [0, 0, -1], 3);
    const crater = { c: cHit.p, r: 0.1, depth: 0.045 };
    // jaw
    const mouthY = A0.mouth[1], headZ = P0('head')[2];
    let chinY = 9;
    for (const v of h.baseObj.groupVerts('body')) {
      const x = h.pos[v * 3], y = h.pos[v * 3 + 1], z = h.pos[v * 3 + 2];
      if (Math.abs(x) < 0.01 && z > headZ + 0.03 && y > yN - 0.02 && y < mouthY) chinY = Math.min(chinY, y);
    }
    const ankle = ['l', 'r'].map((s) => ({ sx: s === 'l' ? 1 : -1, A: P0('foot_' + s), B: P0('ball_' + s) }));
    console.log('  sculpt: crater', crater.c.map((x) => x.toFixed(3)).join(','), 'chinY', chinY.toFixed(3), 'mouthY', mouthY.toFixed(3));
    // helper vertices (joint cubes...) take the arm / hand weights of the nearest body vertices, so the rebuilt
    // finger / hand bones follow the sculpted fingers exactly
    {
      const bodyV = Int32Array.from(h.baseObj.groupVerts('body'));
      const isB = new Uint8Array(nv);
      for (const v of bodyV) isB[v] = 1;
      for (let v = 0; v < nv; v++) {
        if (isB[v]) continue;
        const px = h.pos[v * 3], py = h.pos[v * 3 + 1], pz = h.pos[v * 3 + 2];
        const best = [], bd = [];
        for (const u of bodyV) {
          const dx = h.pos[u * 3] - px, dy = h.pos[u * 3 + 1] - py, dz = h.pos[u * 3 + 2] - pz, d = dx * dx + dy * dy + dz * dz;
          if (best.length < 6 || d < bd[best.length - 1]) {
            let j = Math.min(best.length, 5);
            if (best.length < 6) { best.push(u); bd.push(d); j = best.length - 1; }
            while (j > 0 && bd[j - 1] > d) { best[j] = best[j - 1]; bd[j] = bd[j - 1]; j--; }
            best[j] = u; bd[j] = d;
          }
        }
        for (const s of ['l', 'r']) {
          let a = 0, hh = 0, lg = 0;
          for (const u of best) { a += armW[s][u]; hh += handW[s][u]; lg += legW[s][u]; }
          armW[s][v] = a / best.length; handW[s][v] = hh / best.length; legW[s][v] = lg / best.length;
        }
      }
    }
    await sculpt(h, (p0, vi, isBody) => {
      isBody = true;   // every vertex now carries arm / hand weights
      let q = p0.slice();
      const x = p0[0], y = p0[1], z = p0[2], ax = Math.abs(x);
      // ---- jaw: the lower face stretched down and forward from the mouth line (a long, jutting jaw); the throat
      // under the chin follows part of the way
      {
        // (pushed forward as well as down: the lower jaw juts out past the brow ridge, prognathous, ape-like)
        const f = y >= chinY ? ss(mouthY + 0.006, mouthY - 0.03, y) : ss(chinY - 0.08, chinY - 0.0, y);
        const w = f * (1 - ss(0.045, 0.085, ax)) * ss(headZ - 0.05, headZ + 0.035, z);
        const fwd = ss(headZ - 0.02, headZ + 0.06, z);
        if (w > 0) q = add(q, scl([0, -0.07, 0.03 + 0.03 * fwd], w));
      }
      // ---- heavy brow ridge over deep-set eyes, a bony sagittal crest over the skull
      {
        const eyeY = A0.eyeL[1], eyeZ = A0.eyeL[2];
        const wb = Math.exp(-(((y - eyeY - 0.022) / 0.012) ** 2)) * (1 - ss(0.05, 0.072, ax)) * ss(eyeZ - 0.03, eyeZ - 0.005, z);
        if (wb > 0) q = add(q, scl([Math.sign(x) * 0.15 * ax, -0.004, 0.016], wb));
        const top = A0.head[1];
        const wc = ss(eyeY + 0.05, eyeY + 0.1, y) * (1 - ss(0.008, 0.026, ax)) * ss(headZ - 0.11, headZ - 0.06, z) * (1 - ss(eyeZ - 0.03, eyeZ, z));
        if (wc > 0 && y > top) q = add(q, [0, 0.016 * wc * (1 - (ax / 0.026) ** 2), 0]);
      }
      // ---- head + neck carried forward, out in front of the trapezius (the head must stay in sight when the clips
      // tilt it back: scream, stagger), a little lower than a man's
      {
        const r = Math.hypot(x, (z - spineZ0(y)) * 0.8);
        const w = ss(yN - 0.06, yN + 0.1, y) * (1 - ss(0.12, 0.2, r));
        if (w > 0) q = add(q, scl([0, -0.03, 0.095], w));
      }
      // ---- trapezius yoke: two great masses of muscle from the neck to the acromion, rising past the ears on
      // either side of the head (the head sits low and forward between them; the middle stays low)
      {
        const clY = P0('clavicle_l')[1];
        const w = Math.sin(Math.PI * clamp01((ax - 0.045) / 0.21)) ** 1.3 * ss(clY - 0.1, clY + 0.0, y) * (1 - ss(yN + 0.03, yN + 0.12, y)) *
          (1 - ss(0.06, 0.14, Math.abs(z - spineZ0(y) + 0.01)));
        if (w > 0) q = add(q, [Math.sign(x) * 0.02 * w, 0.105 * w, -0.03 * w]);
      }
      // ---- hunched upper back: a hump behind the shoulder blades (low behind the skull), the vertebrae standing
      // out along the spine
      {
        const back = ss(-0.01, -0.06, z - spineZ0(y));
        const yc = lerp(yS3, yN, 0.05);
        const w = back * Math.exp(-(((y - yc) / 0.12) ** 2)) * (1 - ss(0.13, 0.27, ax));
        if (w > 0) q = add(q, scl([0, 0.0, -0.06], w));
        const rid = ss(-0.03, -0.07, z - spineZ0(y)) * (1 - ss(0.012, 0.035, ax)) * ss(yP + 0.05, yP + 0.15, y) * (1 - ss(yN, yN + 0.06, y));
        if (rid > 0) q = add(q, [0, 0, -0.012 * rid]);
      }
      // ---- chest crater: the sternum split open (the core sits in it)
      {
        const d = dist(p0, crater.c);
        if (d < crater.r && z > crater.c[2] - 0.07) q = add(q, [0, 0, -crater.depth * (1 - (d / crater.r) ** 2) ** 2]);
      }
      // ---- upper body widened about the spine (the arms ride out with the shoulders)
      {
        const kOf = (yy) => 0.19 * ss(yS1 - 0.05, yS3 + 0.02, yy) * (1 - ss(yN + 0.01, yN + 0.09, yy));
        const aw = isBody ? Math.min(1, armW.l[vi] + armW.r[vi]) : (arms.some((a) => x * a.sx > 0.05 && a.poly(p0, 0.2) < 0.07) ? 1 : 0);
        const dx = lerp(x * kOf(y), Math.sign(x) * Math.abs(arms[0].S[0]) * kOf(arms[0].S[1]), aw);
        q = add(q, [dx, 0, 0]);
      }
      // ---- arms: stretched (long ape arms), massive forearms, huge hands
      for (const a of arms) {
        if (x * a.sx < 0.05) continue;
        const w = isBody ? armW[a.s][vi] : (a.poly(p0, 0.2) < 0.07 ? 1 : 0);
        if (!(w > 0)) continue;
        // forearm / upper-arm / deltoid swell about the original axes (gorilla forearms)
        const t2 = dot(sub(p0, a.E), a.u2) / a.L2, rad2 = sub(sub(p0, a.E), scl(a.u2, t2 * a.L2)), r2 = len(rad2);
        let pp = p0.slice();
        if (t2 > -0.2 && t2 < 1.05 && r2 < 0.14) pp = add(pp, scl(rad2, 0.88 * Math.sin(Math.PI * clamp01((t2 + 0.16) / 1.18)) ** 0.5 * (1 - 0.35 * ss(0.4, 0.9, t2)) * (1 - ss(0.085, 0.14, r2)) * w));
        const t1 = dot(sub(p0, a.S), a.u1) / a.L1, rad1 = sub(sub(p0, a.S), scl(a.u1, t1 * a.L1)), r1 = len(rad1);
        if (t1 > -0.1 && t1 < 1.0 && r1 < 0.15) pp = add(pp, scl(rad1, (0.3 * Math.sin(Math.PI * clamp01((t1 + 0.05) / 1.0)) + 0.18 * Math.exp(-(((t1 - 0.12) / 0.14) ** 2))) * (1 - ss(0.1, 0.15, r1)) * w));
        // thick, stubby fingers (radial swell about each finger bone)
        const hw0 = isBody ? handW[a.s][vi] : 0;
        if (hw0 > 0.2) {
          let best = null;
          for (const f of a.fingers) { const r = f(p0); if (r.t > -0.25 && r.t < 1.15 && (!best || r.d < best.d)) best = { ...r, f }; }
          if (best && best.d < 0.028) {
            const c = best.f.at(clamp01(best.t)), rad = sub(p0, c);
            pp = add(pp, scl(rad, 0.55 * (1 - ss(0.016, 0.028, best.d)) * ss(0.2, 0.6, hw0)));
          }
        }
        // stretch along the arm
        pp = madd(pp, armDisp(a, p0), w);
        // hands scaled about the moved wrist
        const hw = isBody ? clamp01(handW[a.s][vi] * 1.6) : (dot(sub(p0, a.W), a.uh) > -0.02 && a.poly(p0, 0.2) < 0.07 ? 1 : 0);
        if (hw > 0) {
          const W2 = add(a.W, armDisp(a, a.W));
          const tt = dot(sub(pp, W2), a.uh);
          const k = ss(-0.07, 0.03, tt) * hw;
          pp = add(W2, scl(sub(pp, W2), 1 + (HS - 1) * k));
        }
        q = add(q, sub(pp, p0));
      }
      // ---- legs: thick columns (the thigh and the calf swell about their bones; the inner side much less), set a
      // little wider apart
      for (const L of legs) {
        const w = legW[L.s][vi];
        if (!(w > 0.02) || x * L.sx < -0.03) continue;
        let d = [0, 0, 0];
        const t1 = dot(sub(p0, L.H), L.u1) / L.L1, rad1 = sub(sub(p0, L.H), scl(L.u1, t1 * L.L1)), r1 = len(rad1);
        if (t1 > -0.25 && t1 < 1.1 && r1 < 0.2) {
          const inward = r1 > 1e-6 ? -dot(rad1, [L.sx, 0, 0]) / r1 : 0;
          const k = 0.28 * Math.sin(Math.PI * clamp01((t1 + 0.2) / 1.2)) ** 0.6 * (1 - 0.7 * ss(0.1, 0.8, inward)) * (1 - ss(0.13, 0.2, r1));
          d = madd(d, rad1, k);
        }
        const t2 = dot(sub(p0, L.K), L.u2) / L.L2, rad2 = sub(sub(p0, L.K), scl(L.u2, t2 * L.L2)), r2 = len(rad2);
        if (t2 > -0.1 && t2 < 1.0 && r2 < 0.15) {
          const inward = r2 > 1e-6 ? -dot(rad2, [L.sx, 0, 0]) / r2 : 0, back = r2 > 1e-6 ? -rad2[2] / r2 : 0;
          const k = 0.42 * Math.sin(Math.PI * clamp01((t2 + 0.12) / 0.98)) ** 0.7 * (1 + 0.45 * ss(0, 0.8, back)) * (1 - 0.6 * ss(0.1, 0.8, inward)) * (1 - ss(0.1, 0.15, r2));
          d = madd(d, rad2, k);
        }
        q = add(q, scl(add(d, [L.sx * 0.03, 0, 0]), w));
      }
      // ---- feet: broad, heavy
      for (const f of ankle) {
        if (x * f.sx < 0.02 || y > f.A[1] + 0.06) continue;
        const k = 1 - ss(f.A[1] - 0.02, f.A[1] + 0.06, y);
        const dir = norm([f.B[0] - f.A[0], 0, f.B[2] - f.A[2]]), base = [f.A[0], 0, f.A[2] - 0.04];
        const rel = sub([q[0], 0, q[2]], base), along = dot(rel, dir), lat = sub(rel, scl(dir, along));
        const nq = add(base, add(scl(dir, along * (1 + 0.05 * k)), scl(lat, 1 + 0.3 * k)));
        q = [nq[0], q[1] * (1 + 0.1 * k), nq[2]];
      }
      // ---- short legs: the hip -> ankle span compressed, everything above it (arms too) dropped with it
      {
        const aw = Math.min(1, armW.l[vi] + armW.r[vi]);
        q[1] -= lerp(legDrop(y), fullDrop, aw);
      }
      return q;
    });
  }
  // ===================================================================== POSTURE (baked into the rest pose)
  await bakePose(h, POSTURE, POSTURE_ARMS);
  const sk = h.skeleton.byName;
  const B = (n) => V(sk[n].head);
  console.log('  sculpted height', h.height.toFixed(3), 'pelvis', sk.pelvis.head.y.toFixed(3), 'hand_l', B('hand_l').map((x) => x.toFixed(3)).join(','), 'fingertip', V(sk.middle_03_l.tail).map((x) => x.toFixed(3)).join(','));


  // ===================================================================== SHARED ANCHORS (human scale)
  const A = lib.anchors(h);
  const bones = h.skeleton.bones;
  const skinAt = makeSkinner(h);
  const fullBody = h.basePart({ name: 'bvh' });
  const bodyB = makeBVH([surf(fullBody)]);
  const armBones = new Set(bones.filter((b) => /^(upperarm|lowerarm|hand|thumb|index|middle|ring|pinky)/.test(b.name)).map((b) => b.index));
  const armWt = new Float32Array(h.pos.length / 3);
  h.weights.forEach((l, v) => { for (const [b, w] of l) if (armBones.has(b)) armWt[v] += w; });
  const trunkSurf = (() => {
    const t = fullBody.tris(), keepT = [];
    for (let i = 0; i < t.length; i += 6) if (armWt[t[i]] < 0.5 && armWt[t[i + 2]] < 0.5 && armWt[t[i + 4]] < 0.5) keepT.push(...t.slice(i, i + 6));
    return { pos: h.pos, tris: Int32Array.from(keepT) };
  })();
  const trunkB = makeBVH([trunkSurf]);
  const skinClosest = makeClosestSkinner(h, fullBody, skinAt);
  const chain = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'head'].map(B);
  const spineZ = (y) => {
    if (y <= chain[0][1]) return chain[0][2];
    for (let i = 0; i + 1 < chain.length; i++) if (y <= chain[i + 1][1]) return lerp(chain[i][2], chain[i + 1][2], (y - chain[i][1]) / (chain[i + 1][1] - chain[i][1]));
    return chain[chain.length - 1][2];
  };
  /** trunk surface point at (x, y) seen from behind / the front: {p, n (outward)} */
  const backAt = (x, y) => { const hit = trunkB.first([x, y, spineZ(y) - 1.5], [0, 0, 1], 3); return hit && { p: hit.p, n: hit.n[2] > 0 ? scl(hit.n, -1) : hit.n }; };
  const frontAt = (x, y) => { const hit = trunkB.first([x, y, spineZ(y) + 1.5], [0, 0, -1], 3); return hit && { p: hit.p, n: hit.n[2] < 0 ? scl(hit.n, -1) : hit.n }; };
  const yS1 = B('spine_01')[1], yS2 = B('spine_02')[1], yS3 = B('spine_03')[1], yN = B('neck_01')[1];
  const yHump = lerp(yS3, yN, 0.12);
  const spineBones = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01'];
  // 8 x 8 uv cells for the many small custom pieces (painting is procedural in 3D, cells only need to be disjoint)
  const cellOf = (k, n = 8, m = 0.006) => { const cu = k % n, cv = Math.floor(k / n); return [cu / n + m, cv / n + m, (cu + 1) / n - m, (cv + 1) / n - m]; };

  /** tapered, optionally hooked cone (spike / fang / claw) sunk into the surface at `base` */
  const spike = (g, base, dir, L, r0, uv, w, { hook = null, hookAmt = 0.25, sides = 6, segs = 5, sink = 0.4, flat = 1, tag = 0, tipR = 0.05 } = {}) => {
    const pts = [];
    const start = madd(base, dir, -r0 * sink * 2);
    const Lt = L + r0 * sink * 2;
    for (let i = 0; i <= segs; i++) { const t = i / segs; let p = madd(start, dir, Lt * t); if (hook) p = madd(p, hook, hookAmt * Lt * t * t); pts.push(p); }
    return tube(g, pts, (t) => r0 * ((1 - t) ** 0.85 * (1 - tipR) + tipR), sides, uv, w, { tipEnd: true, capStart: true, flat, tag });
  };

  // ===================================================================== WING LAYOUT (pivots + folded wings)
  // The wing roots sit under the shoulder blades (pivot 2.5 cm inside the skin: at node scale 0.01 the collapsed
  // spread wing hides in the body). Folded wings, a bat's wing folded on its back: the humerus runs from the shoulder
  // blade down to the elbow on the outer back, the thick forearm climbs back up to a big wrist knuckle that sits
  // above the shoulder (a hooked thumb claw on it, it shows over the trapezius from the front), and the finger bones
  // fold back down along the back with the membrane bundled in pleats between them, tucked flat. The folded wings
  // shrink into the pivot while the spread ones grow out of it (see FOLD_* and the GLB patch).
  const S_EST = REST_HEIGHT / h.height;          // human scale -> full size (the same factor as S below)
  const MS = 1 / S_EST;                           // metres at full size -> human scale
  const topAt = (x, z) => { const hit = trunkB.first([x, yN + 0.6, z], [0, -1, 0], 1.2); return hit && hit.p; };
  const wingL = {};
  for (const [s, sx] of [['l', 1], ['r', -1]]) {
    const b = backAt(sx * 0.085, lerp(yS3, yN, 0.45));
    const R0 = madd(b.p, b.n, -0.025);
    const eb = backAt(sx * 0.205, lerp(yS1, yS2, 0.55)), Ef = madd(eb.p, eb.n, 0.05);
    const tp = topAt(sx * 0.205, spineZ(yN) - 0.075) || add(backAt(sx * 0.19, yN - 0.03).p, [0, 0.06, 0]);
    const Kn = add(tp, [sx * 0.012, 0.04, -0.065]);
    // finger tips low on the back, between the forearm and the spine ridge (the outer finger longest)
    const tips = [0, 1, 2].map((k) => { const q = backAt(sx * (0.182 - 0.024 * k), yS1 - 0.03 + 0.05 * k); return madd(q.p, q.n, 0.035); });
    wingL[s] = { sx, R0, n: b.n, fold: { Ef, Kn, tips }, foldD: polyDist([R0, Ef, Kn, tips[0], Kn, tips[1], Kn, tips[2]]) };
  }
  const nearFold = (p, r = 0) => Math.min(wingL.l.foldD(p, 0.3), wingL.r.foldD(p, 0.3)) < 0.05 + r;
  // the folded membrane fills the band between the forearm and the inner finger: nothing else may sit there
  const inFoldBand = (p) => {
    for (const L of [wingL.l, wingL.r]) {
      const x = p[0] * L.sx;
      if (x < 0.118 || x > 0.24 || p[1] < yS1 - 0.02 || p[1] > L.fold.Kn[1]) continue;
      return true;
    }
    return false;
  };

  // ===================================================================== FANGS (teeth)
  // Rows of long, irregular fangs along the gum arcs (the MakeHuman teeth helper groups, which followed the jaw
  // sculpt): sabre canines hanging past the lower lip, tusks rising from the jaw, broken stumps among them.
  const fangs = new Geo();
  const mouthInfo = {};
  {
    const hp = (g) => [...h.baseObj.groupVerts(g)].map((v) => [h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]]);
    const arcOf = (pts, nb = 11) => {
      let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
      for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
      const bins = new Array(nb).fill(null);
      for (const p of pts) { const b = Math.min(nb - 1, Math.floor((p[0] - x0) / (x1 - x0 + 1e-9) * nb)); if (!bins[b] || p[2] > bins[b][2]) bins[b] = p; }
      const arc = bins.filter(Boolean);
      const L = [0];
      for (let i = 1; i < arc.length; i++) L.push(L[i - 1] + dist(arc[i - 1], arc[i]));
      const at = (u) => {
        const s = clamp01(u) * L[L.length - 1];
        let i = 1;
        while (i < arc.length - 1 && L[i] < s) i++;
        return lerp3(arc[i - 1], arc[i], clamp01((s - L[i - 1]) / ((L[i] - L[i - 1]) || 1)));
      };
      const cz = Math.min(...arc.map((p) => p[2]));
      return { at, y0, y1, x0, x1, cen: [(x0 + x1) / 2, (y0 + y1) / 2, cz - 0.015], arc };
    };
    const up = arcOf(hp('helper-upper-teeth')), lo = arcOf(hp('helper-lower-teeth'));
    console.log('  teeth arcs: upper y', up.y0.toFixed(3), up.y1.toFixed(3), 'x', up.x0.toFixed(3), up.x1.toFixed(3), '| lower y', lo.y0.toFixed(3), lo.y1.toFixed(3), 'z', lo.arc.map((p) => p[2].toFixed(3)).join(','));
    let k = 0;
    const fangKinds = [];
    const cell = (kind) => { fangKinds[k] = kind; return cellOf(k++, 8); };
    // crowded, thick, irregular fangs: sabre canines, tusks, chisel incisors leaning every way, broken stumps
    const row = (arc, n, upper) => {
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5 + (hash(i * 7 + (upper ? 3 : 5)) - 0.5) * 0.35) / n, c = Math.abs(u - 0.5) * 2;
        const R = arc.at(u);
        const out = norm([R[0] - arc.cen[0], 0, R[2] - arc.cen[2]]);
        const j = hash(i * 31 + (upper ? 7 : 3));
        let L, r0;
        if (upper) {
          if (c > 0.3 && c < 0.62) { L = 0.055 + 0.025 * j; r0 = 0.011; }               // sabre canines
          else if (c <= 0.3) { L = 0.024 + 0.014 * j; r0 = 0.0078; }
          else { L = 0.018 + 0.01 * j; r0 = 0.0088; }
        } else {
          if (c > 0.38 && c < 0.72) { L = 0.05 + 0.022 * j; r0 = 0.0105; }              // tusks
          else if (c <= 0.38) { L = 0.02 + 0.012 * j; r0 = 0.0072; }
          else { L = 0.016 + 0.009 * j; r0 = 0.0085; }
        }
        if (hash(i * 13 + (upper ? 1 : 2)) > 0.85) L *= 0.4;                               // broken stumps
        const root = [R[0], upper ? arc.y1 + 0.003 : arc.y0 - 0.003, R[2] - 0.002];
        const jit = [(hash(i * 41 + 1) - 0.5) * 0.35, 0, (hash(i * 43 + 2) - 0.5) * 0.3];
        const dir = upper ? norm(add([out[0] * 0.22, -1, out[2] * 0.22 + 0.14], jit)) : norm(add([out[0] * 0.4, 1, out[2] * 0.4 + 0.2], jit));
        spike(fangs, root, dir, L, r0 * (0.85 + 0.3 * hash(i * 47 + 9)), cell('tooth'), [['head', 1]], { hook: scl(out, -1), hookAmt: upper ? 0.18 : -0.1, sides: 5, segs: 4, sink: 0.7, flat: 0.75 + 0.2 * j, tag: upper ? 1 : 2 });
      }
    };
    row(up, 16, true);
    row(lo, 15, false);
    // raw, swollen gums along both arcs (the lips are pulled back off them)
    for (const [arc, upper] of [[up, true], [lo, false]]) {
      const pts = [];
      for (let i = 0; i <= 10; i++) { const R = arc.at(i / 10); pts.push([R[0], upper ? arc.y1 + 0.004 : arc.y0 - 0.004, R[2] - 0.003]); }
      tube(fangs, catmull(pts, 2), (t) => 0.0085 * (0.7 + 0.3 * Math.sin(Math.PI * t)), 7, cell('gum'), [['head', 1]], { ref: [1, 0, 0], flat: 0.7, tag: 3 });
    }
    // a thick tongue lying in the lower jaw, the throat behind it (faint green glow)
    {
      const zb = lo.cen[2] - 0.035, zf = lo.cen[2] + 0.03, y = lo.y1 - 0.004;
      tube(fangs, catmull([[0, y - 0.012, zb - 0.02], [0, y - 0.004, zb + 0.015], [0, y, (zb + zf) / 2 + 0.01], [0, y + 0.004, zf]], 3), (t) => 0.02 * (0.85 + 0.15 * Math.sin(Math.PI * t)) * (1 - 0.35 * ss(0.75, 1, t)), 8, cell('tongue'), [['head', 1]], { ref: [1, 0, 0], flat: 0.45, tipEnd: true, tag: 4 });
    }
    mouthInfo.fangKinds = fangKinds;
    Object.assign(mouthInfo, { up, lo, centre: lerp3(up.cen, lo.cen, 0.5) });
  }
  const fangPart = toPart(lib, h, fangs, 'teeth', 'teeth', () => [['head', 1]]);

  // ===================================================================== BONES: dorsal spikes, spurs, claws, ribs
  const boneG = new Geo();
  let cellK = 0;
  const boneKinds = [];
  const BN = 9;
  const boneCell = (kind) => { boneKinds[cellK] = kind; return cellOf(cellK++, BN); };
  const boneInfo = { spikes: [] };
  const rigid = (name) => [[name, 1]];
  // dorsal spikes: vertebral spines bursting through the skin along the whole back, longest over the hump, raked
  // towards the head (they stop below the neck: nothing behind the skull for a thrown-back head to sink behind; the
  // tall ones break the side silhouette); a row of shorter spurs either side over the shoulder blades
  for (let i = 0; i < 11; i++) {
    const t = i / 10, y = lerp(yS1 - 0.03, yN - 0.035, t);
    const b = backAt(0, y);
    if (!b) continue;
    const prof = Math.exp(-(((y - yHump) / 0.2) ** 2));
    const L = (0.035 + 0.24 * prof) * (0.65 + 0.6 * hash(i * 7 + 1)) * (1 - 0.45 * ss(yN - 0.12, yN - 0.03, y));
    const r0 = 0.018 + 0.03 * prof;
    const dir = norm(add(b.n, [0, 0.62, 0]));
    const w = skinClosest(b.p, { allow: spineBones });
    spike(boneG, b.p, dir, L, r0, boneCell("spine"), w, { hook: [0, 1, 0], hookAmt: 0.3, sides: 7, segs: 5, sink: 0.7, flat: 0.75 });
    boneInfo.spikes.push({ p: b.p, n: b.n, L, r0 });
  }
  for (const sx of [1, -1]) for (let i = 0; i < 5; i++) {
    const y = lerp(yS3 - 0.04, yN - 0.005, i / 4), x = sx * (0.05 + 0.01 * Math.sin(i * 1.7));
    const b = backAt(x, y);
    if (!b || nearFold(b.p, -0.015)) continue;
    const L = 0.05 + 0.07 * Math.exp(-(((y - yHump) / 0.12) ** 2)) * (0.8 + 0.4 * hash(i * 5 + (sx > 0 ? 3 : 9)));
    const dir = norm(add(add(b.n, [0, 0.5, 0]), [sx * 0.35, 0, 0]));
    spike(boneG, b.p, dir, L, 0.016, boneCell("spine"), skinClosest(b.p, { allow: [...spineBones, 'clavicle_l', 'clavicle_r'] }), { hook: [0, 1, 0], hookAmt: 0.25, sides: 6, segs: 4, sink: 0.7 });
    boneInfo.spikes.push({ p: b.p, n: b.n, L, r0: 0.016 });
  }
  // elbow spurs (raked back along the upper arm) and a ridge of knobs down each ulna
  for (const s of ['l', 'r']) {
    const S = B('upperarm_' + s), E = B('lowerarm_' + s), W = B('hand_' + s);
    const u1 = norm(sub(E, S)), u2 = norm(sub(W, E));
    const back = norm(sub(u1, u2));
    const sideBones = new Set(bones.filter((b) => armBones.has(b.index) && b.name.endsWith('_' + s)).map((b) => b.index));
    const aw = new Float32Array(h.pos.length / 3);
    h.weights.forEach((l, v) => { for (const [b, w] of l) if (sideBones.has(b)) aw[v] += w; });
    const ft = fullBody.tris(), kt = [];
    for (let i = 0; i < ft.length; i += 6) if (aw[ft[i]] > 0.5 && aw[ft[i + 2]] > 0.5 && aw[ft[i + 4]] > 0.5) kt.push(...ft.slice(i, i + 6));
    const armB = makeBVH([{ pos: h.pos, tris: Int32Array.from(kt) }]);
    const hs = armB.hits(madd(E, back, 0.3), scl(back, -1), 0.4);
    const base = hs.length ? hs[0].p : madd(E, back, 0.04);
    spike(boneG, base, norm(add(back, scl(u1, -0.75))), 0.13, 0.026, boneCell("spur"), rigid('lowerarm_' + s), { hook: scl(u1, -1), hookAmt: 0.25, sides: 7, segs: 5, sink: 0.6 });
    boneInfo.spikes.push({ p: base, n: back, L: 0.13, r0: 0.026 });
    for (let i = 0; i < 3; i++) {
      const c = lerp3(E, W, 0.28 + i * 0.2);
      const h2 = armB.hits(madd(c, back, 0.3), scl(back, -1), 0.4);
      if (!h2.length) continue;
      spike(boneG, h2[0].p, norm(add(back, scl(u2, -0.5))), 0.05 - i * 0.009, 0.016, boneCell("spur"), rigid('lowerarm_' + s), { sides: 6, segs: 3, sink: 0.6 });
    }
  }
  // bony spurs bursting from the tops of the shoulders (they break the man-shaped silhouette from the front) and a
  // row of blunt horns along the skull crest
  for (const [s, sx] of [['l', 1], ['r', -1]]) {
    const sh = B('upperarm_' + s);
    [[0.0, 0.17, 0.029, 0.7], [0.045, 0.22, 0.035, 0.55], [0.09, 0.15, 0.027, 0.3]].forEach(([dx, L, r0, up], i) => {
      const x = sh[0] + sx * (dx - 0.06), z = sh[2] - 0.0 + 0.015 * i;
      const hit = bodyB.first([x, sh[1] + 0.6, z], [0, -1, 0], 1);
      if (!hit || dist(hit.p, wingL[s].fold.Kn) < 0.09) return;
      const n = hit.n[1] < 0 ? scl(hit.n, -1) : hit.n;
      const dir = norm(add(add(n, [0, up, 0]), [sx * 0.45, 0, -0.25]));
      spike(boneG, hit.p, dir, L, r0, boneCell('spine'), skinClosest(hit.p, { allow: ['clavicle_' + s, 'upperarm_' + s, 'spine_03'] }), { hook: [sx * 0.3, -0.2, -1], hookAmt: 0.25, sides: 7, segs: 5, sink: 0.6, flat: 0.8 });
    });
  }
  // a low bony crest ridge along the skull (a blade of bone half sunk into the scalp, knobbed), not a horn
  {
    const hz = sk.head.head.z, pts = [];
    for (let i = 0; i <= 8; i++) {
      const hit = bodyB.first([0, sk.head.head.y + 0.5, hz + lerp(0.045, -0.075, i / 8)], [0, -1, 0], 1);
      if (hit) pts.push(madd(hit.p, [0, 1, 0], -0.002));
    }
    if (pts.length > 3) tube(boneG, catmull(pts, 2), (t) => 0.011 * Math.sin(Math.PI * clamp01(t * 1.08)) ** 0.6 * (1 + 0.25 * Math.sin(t * 40)) + 0.001, 7, boneCell('spine'), rigid('head'), { flat: 0.45 });
  }
  // claws: thick, hooked, on every finger tip (knuckle-walker: worn blunt on the index / middle) and toe
  for (const s of ['l', 'r']) {
    const W = B('hand_' + s), sx = s === 'l' ? 1 : -1;
    const kc = scl(['index_01_', 'middle_01_', 'ring_01_', 'pinky_01_'].map((n) => B(n + s)).reduce((a, k) => add(a, k), [0, 0, 0]), 0.25);
    const hax = norm(sub(kc, W));
    let dors = norm(cross(hax, sub(B('index_01_' + s), B('pinky_01_' + s))));
    if (dot(dors, [sx, 0, 0]) < 0) dors = scl(dors, -1);
    for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
      const b3 = sk[`${f}_03_${s}`], tip = V(b3.tail), ax = norm(sub(V(b3.tail), V(b3.head)));
      const big = f === 'thumb' ? 0.8 : 1;
      const base = madd(madd(tip, ax, -0.012), dors, 0.006);
      spike(boneG, base, norm(add(ax, scl(dors, 0.15))), 0.034 * big * (f === 'index' || f === 'middle' ? 0.8 : 1), 0.0085 * big, boneCell("claw"), rigid(`${f}_03_${s}`), { hook: scl(dors, -1), hookAmt: 0.45, sides: 6, segs: 4, sink: 0.5, flat: 0.7 });
    }
    // toes: frontmost foot vertices in five bins across the toes
    const ball = sk['ball_' + s].index;
    const fv = [];
    for (const v of h.baseObj.groupVerts('body')) { const l = h.weights[v]; if (l.some(([b, w]) => b === ball && w > 0.5)) fv.push([h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]]); }
    let x0 = 9, x1 = -9;
    for (const p of fv) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); }
    const bins = new Array(5).fill(null);
    for (const p of fv) { const bI = Math.min(4, Math.floor((p[0] - x0) / (x1 - x0 + 1e-9) * 5)); if (p[1] > 0.012 && (!bins[bI] || p[2] > bins[bI][2])) bins[bI] = p; }
    bins.forEach((p, i) => {
      if (!p) return;
      const inner = s === 'l' ? i === 0 : i === 4;
      spike(boneG, add(p, [0, 0.008, -0.01]), norm([0, -0.35, 1]), inner ? 0.032 : 0.022, inner ? 0.011 : 0.0075, boneCell("claw"), rigid('ball_' + s), { hook: [0, -1, 0], hookAmt: 0.35, sides: 6, segs: 3, sink: 0.4, flat: 0.7 });
    });
  }
  // ribs: the split ribcage around the core, broken ends curling over it like a cage
  const coreInfo = {};
  {
    const yC = lerp(yS3, yN, 0.38);
    const f0 = frontAt(0, yC);
    const crR = 0.1;
    coreInfo.base = f0.p; coreInfo.n = f0.n; coreInfo.r = crR;
    for (const sx of [1, -1]) for (const [ang, L, r0] of [[78, 0.062, 0.0085], [40, 0.075, 0.0098], [2, 0.07, 0.009], [-38, 0.058, 0.008], [-72, 0.045, 0.007]]) {
      const a = (sx > 0 ? ang : 180 - ang) * Math.PI / 180;
      const rim = [Math.cos(a) * crR * 1.02, yC + Math.sin(a) * crR * 0.95, 0];
      const fr = frontAt(rim[0], rim[1]);
      if (!fr) continue;
      const toC = norm(sub([0, yC, fr.p[2]], [fr.p[0], fr.p[1], fr.p[2]]));
      const dir = norm(add(scl(fr.n, 1), scl(toC, -0.55)));
      spike(boneG, fr.p, dir, L, r0, boneCell("rib"), rigid('spine_03'), { hook: toC, hookAmt: 0.5, sides: 6, segs: 5, sink: 0.8, flat: 0.6 });
    }
  }
  console.log('  bone pieces', cellK, 'cells');
  const bonePart = toPart(lib, h, boneG, 'bones', 'gear', () => rigid('spine_03'));

  // ===================================================================== SPORE SACS (gore, emissive)
  // Clusters of swollen, translucent sacs over the hump, the shoulder blades and the trapezius, packed round the
  // spine spikes: the mortar's ammunition. Each sac is a dome sunk into the skin, bound to the skin under it.
  const sporeG = new Geo();
  const sacs = [];
  const SAC_N = 8;     // uv cells per row (one cell per sac)
  {
    // clusters: [x, y, big-sac radius, count] -- either side of the spine over the hump (between the folded wings),
    // the lower back, a small one low on the neck (kept low: nothing big behind the skull)
    const clusters = [];
    for (const sx of [1, -1]) {
      clusters.push([sx * 0.07, yHump + 0.02, 0.085, 11], [sx * 0.068, yS2 + 0.035, 0.07, 8], [sx * 0.06, lerp(yS1, yS2, 0.4), 0.055, 5], [sx * 0.05, yN - 0.035, 0.045, 3]);
    }
    const allB = makeBVH([surf(fullBody)]);
    const surfBack = (x, y) => { const hit = allB.first([x, y, spineZ(y) - 1.5], [0, 0, 1], 3); return hit && { p: hit.p, n: hit.n[2] > 0 ? scl(hit.n, -1) : hit.n }; };
    let seed = 1;
    for (const [cx, cy, rBig, n] of clusters) {
      for (let k = 0; k < n * 4 && sacs.filter((s) => s.cl === cx + cy).length < n; k++) {
        const j = seed++;
        const big = k === 0;
        const ang = hash(j * 13) * Math.PI * 2, rad = big ? 0 : (0.6 + 0.9 * hash(j * 7 + 1)) * rBig;
        const b = surfBack(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad * 1.1);
        if (!b || b.n[2] > 0.3) continue;
        const r = big ? rBig : rBig * (0.22 + 0.62 * hash(j * 29 + 3) ** 1.5);
        if (sacs.some((s) => dist(s.p, b.p) < (s.r + r) * 0.58)) continue;
        if (boneInfo.spikes.some((s) => dist(s.p, b.p) < s.r0 * 1.05 + r * 0.55)) continue;
        if (nearFold(b.p, r * 0.5 - 0.02) || inFoldBand(b.p)) continue;
        sacs.push({ p: b.p, n: b.n, r, cl: cx + cy, e: 1.25 * (0.7 + 0.6 * hash(j * 3 + 11)) });
      }
    }
    // shoulder / upper-arm clusters (on top of the deltoids and the front of the shoulders: the mortar sacs read
    // from the front, where the players stand)
    for (const [s, sx] of [['l', 1], ['r', -1]]) {
      const S = B('upperarm_' + s), E = B('lowerarm_' + s), ua = norm(sub(E, S));
      const side = norm(sub([sx, 0.6, 0.35], scl(ua, dot([sx, 0.6, 0.35], ua))));
      const fwd = norm(cross(ua, side)), fw = fwd[2] > 0 ? fwd : scl(fwd, -1);
      const cl = 'arm' + s;
      for (let k = 0; k < 40 && sacs.filter((q) => q.cl === cl).length < 9; k++) {
        const j = seed++;
        const t = lerp(-0.05, 0.42, hash(j * 17 + 5)), a = lerp(-0.9, 1.3, hash(j * 31 + 7));
        const d = norm(add(scl(side, Math.cos(a)), scl(fw, Math.sin(a))));
        const c = madd(S, ua, t * dist(S, E));
        const hit = allB.first(madd(c, d, 0.6), scl(d, -1), 0.8);
        if (!hit) continue;
        const n = dot(hit.n, d) < 0 ? scl(hit.n, -1) : hit.n;
        const big = k === 0, r = big ? 0.07 : 0.07 * (0.25 + 0.6 * hash(j * 29 + 3) ** 1.5);
        if (sacs.some((q) => dist(q.p, hit.p) < (q.r + r) * 0.6)) continue;
        if (boneInfo.spikes.some((q) => dist(q.p, hit.p) < q.r0 * 1.6 + r * 0.7) || nearFold(hit.p, r * 0.5 - 0.02)) continue;
        sacs.push({ p: hit.p, n, r, cl, arm: s, e: 1.25 * (0.7 + 0.6 * hash(j * 3 + 11)) });
      }
    }
    if (sacs.length > SAC_N * SAC_N) sacs.length = SAC_N * SAC_N;
    const NA = 8, NR = 4;
    sacs.forEach((s, si) => {
      const t1 = norm(cross(s.n, Math.abs(s.n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), t2 = cross(s.n, t1);
      const [u0, v0, u1, v1] = cellOf(si, SAC_N, 0.006);
      const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2, rad = (u1 - u0) / 2;
      const w = skinClosest(s.p, { allow: s.arm ? ['clavicle_' + s.arm, 'upperarm_' + s.arm, 'spine_03'] : [...spineBones, 'clavicle_l', 'clavicle_r'] });
      const ids = [];
      for (let j = 0; j <= NR; j++) {
        const phi = lerp(1.95, 0.0, j / NR);                    // from below the equator (sunk) to the pole
        const row = [];
        for (let k = 0; k < (j === NR ? 1 : NA); k++) {
          const a = (k / NA) * Math.PI * 2;
          const lump = 1 + 0.16 * N.noise(Math.cos(a) * 1.7 + si * 3.1, Math.sin(a) * 1.7, phi * 1.3) + 0.08 * Math.sin(a * 3 + si);
          const rr = s.r * Math.sin(phi) * lump, hh = s.r * 1.25 * Math.cos(phi) + s.r * 0.2;
          const p = add(add(madd(s.p, s.n, hh), scl(t1, Math.cos(a) * rr)), scl(t2, Math.sin(a) * rr));
          const pr = (phi / 1.95) * rad;
          row.push(sporeG.v(p, [cu + Math.cos(a) * pr, cv + Math.sin(a) * pr], w, si));
        }
        ids.push(row);
      }
      for (let j = 0; j < NR; j++) {
        const a = ids[j], b = ids[j + 1];
        for (let k = 0; k < NA; k++) {
          if (j + 1 === NR) sporeG.tri(a[k], a[(k + 1) % NA], b[0]);
          else sporeG.quad(a[k], a[(k + 1) % NA], b[(k + 1) % NA], b[k]);
        }
      }
    });
    console.log('  spore sacs', sacs.length, 'radii', sacs.map((s) => s.r.toFixed(3)).join(' '));
  }
  const sporePart = toPart(lib, h, sporeG, 'spores', 'gore', () => rigid('spine_03'));

  // ===================================================================== CHEST CORE (gore, emissive)
  // A lumpy, crusted heart-mass bulging out of the split sternum, swollen lobes, plugged into the body by thick
  // arteries that branch into the crater walls (they swell and glow where the heat runs through them).
  const coreG = new Geo();
  {
    const rc = 0.07;
    const C = madd(coreInfo.base, coreInfo.n, 0.024);
    coreInfo.c = C; coreInfo.rc = rc;
    const lobes = [[0.5, 0.6, 0.6], [-0.6, 0.3, 0.7], [0.2, -0.7, 0.6], [-0.3, -0.4, 0.85], [0.8, -0.2, 0.3]].map(norm);
    const NA = 18, NR = 13;
    const ids = [];
    for (let j = 0; j <= NR; j++) {
      const th = (j / NR) * Math.PI, row = [];
      for (let k = 0; k <= NA; k++) {
        const ph = (k / NA) * Math.PI * 2;
        const d = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
        let lump = 1 + 0.22 * N.noise(d[0] * 2.2 + 4, d[1] * 2.2, d[2] * 2.2) + 0.1 * N.noise(d[0] * 5.5, d[1] * 5.5 + 2, d[2] * 5.5);
        for (const l of lobes) lump += 0.2 * Math.exp(-((1 - dot(d, l)) / 0.09));
        row.push(coreG.v(madd(C, [d[0], d[1] * 1.12, d[2] * 0.82], rc * lump), [0.02 + 0.66 * k / NA, 0.02 + 0.96 * j / NR], null, 0));
      }
      ids.push(row);
    }
    for (let j = 0; j < NR; j++) for (let k = 0; k < NA; k++) coreG.quad(ids[j][k], ids[j][k + 1], ids[j + 1][k + 1], ids[j + 1][k]);
    // arteries: from the core into the crater walls, swollen in the middle, some forking
    let vi = 0;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.4 + (hash(i * 3 + 1) - 0.5) * 0.4;
      const dir2 = [Math.cos(a), Math.sin(a) * 1.1];
      const start = madd(C, norm([dir2[0], dir2[1], 0.15]), rc * 0.75);
      const fr = frontAt(dir2[0] * 0.115, C[1] + dir2[1] * 0.11);
      if (!fr) continue;
      const end = madd(fr.p, fr.n, -0.014);
      const mid = madd(lerp3(start, end, 0.5), coreInfo.n, 0.016 + 0.01 * hash(i * 5 + 1));
      const r0 = 0.012 + 0.004 * hash(i * 3 + 2);
      const uv = (n) => [0.72, 0.01 + n * 0.0825, 0.98, 0.08 + n * 0.0825];
      tube(coreG, catmull([start, mid, end], 3), (t) => r0 * (1 - 0.4 * t) * (1 + 0.25 * Math.sin(Math.PI * t)), 6, uv(vi++), null, { tag: 1 });
      if (i % 2 === 0 && vi < 12) {
        const side = norm(cross(coreInfo.n, sub(end, start)));
        const bEnd = frontAt(dir2[0] * 0.13 + side[0] * 0.04, C[1] + dir2[1] * 0.12 + side[1] * 0.04);
        if (bEnd) tube(coreG, catmull([mid, madd(lerp3(mid, bEnd.p, 0.5), coreInfo.n, 0.01), madd(bEnd.p, bEnd.n, -0.01)], 2), (t) => r0 * 0.55 * (1 - 0.4 * t), 5, uv(vi++), null, { tag: 1 });
      }
    }
  }
  const corePart = toPart(lib, h, coreG, 'core', 'gore', () => rigid('spine_03'));

  // ===================================================================== WINGS
  // Spread (under wing_l / wing_r, node scale 1 after the metamorphosis): a bat wing about 12 m across, laid out in
  // metres at full size (MS converts to the human-scale build space). Raised in a dihedral, the forearm swept
  // forward and the trailing fingers swept back so the wing reads from the side and 3/4, cambered membrane panels
  // sagging between the finger bones, thick bones with knuckle joints, a hooked thumb claw. Skinned to wing_*
  // (humerus, body side of the inner membrane), wing_elbow_* (forearm) and wing_wrist_* (fingers, outer membrane) so
  // a brain can flap them procedurally.
  // Folded (on the back, ground phase): skinned half to the spine (through the wing_sheath* bones) and half to
  // wing_fold_* (a child of wing_*): with the inverse bind matrices patched after writing (see FOLD_*), the folded
  // wing sits exactly in place at wing node scale 0.01 and shrinks into the pivot as the node scale grows to 1.
  const wingG = new Geo();
  const WUV = {
    p4: [0.0, 0.0, 0.42, 0.62], p1: [0.42, 0.0, 0.74, 0.31], p2: [0.42, 0.31, 0.74, 0.62], p3: [0.0, 0.62, 0.37, 1.0],
    f: [[0.37, 0.62, 0.74, 0.745], [0.37, 0.745, 0.74, 0.87], [0.37, 0.87, 0.74, 0.995]],
    hum: [0.75, 0.0, 1.0, 0.07], fore: [0.75, 0.07, 1.0, 0.14], d: [0, 1, 2, 3].map((k) => [0.75, 0.14 + k * 0.07, 1.0, 0.21 + k * 0.07]),
    claw: [0.75, 0.42, 1.0, 0.48], knob: [0.75, 0.48, 1.0, 0.56],
    fhum: [0.75, 0.56, 1.0, 0.63], ffore: [0.75, 0.63, 1.0, 0.72], fd: [0, 1, 2].map((k) => [0.75, 0.72 + k * 0.07, 1.0, 0.79 + k * 0.07]), fclaw: [0.75, 0.93, 1.0, 0.995],
  };
  const pl = (pts) => {
    const L = [0];
    for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + dist(pts[i - 1], pts[i]));
    const T = L[L.length - 1];
    return (s) => { const d = clamp01(s) * T; let i = 1; while (i < pts.length - 1 && L[i] < d) i++; return lerp3(pts[i - 1], pts[i], clamp01((d - L[i - 1]) / ((L[i] - L[i - 1]) || 1))); };
  };
  /** membrane panel between curves Ca(s) (u = 0) and Cb(s) (u = 1); sc scallops the s = 1 edge; camber sags the
   * middle along `back`; lift(p) can push vertices off the body; pleat alternates rows */
  const panel = (g, Ca, Cb, ns, nu, uvr, w, { sc = 0, camber = 0, back = [0, 0, -1], pleat = 0, lift = null, tag = 1 } = {}) => {
    const ids = [];
    for (let i = 0; i <= ns; i++) {
      const s = i / ns, row = [];
      for (let j = 0; j <= nu; j++) {
        const u = j / nu, f = 1 - sc * Math.sin(Math.PI * u);
        let p = lerp3(Ca(s * f), Cb(s * f), u);
        p = madd(p, back, camber * Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, 0.15 + s * 1.1)) + pleat * Math.sin(Math.PI * u) * (j % 2 ? 1 : -0.4));
        if (lift) p = lift(p);
        row.push(g.v(p, [lerp(uvr[0], uvr[2], s), lerp(uvr[1], uvr[3], u)], typeof w === 'function' ? w(p, s, u) : w, tag));
      }
      ids.push(row);
    }
    for (let i = 0; i < ns; i++) for (let j = 0; j < nu; j++) g.quad(ids[i][j], ids[i + 1][j], ids[i + 1][j + 1], ids[i][j + 1]);
  };
  /** a knobbly joint (lumpy sphere) */
  const knob = (g, c, r, uvr, w, tag, seed) => {
    const NA = 8, NR = 5, ids = [];
    for (let j = 0; j <= NR; j++) {
      const th = (j / NR) * Math.PI, row = [];
      for (let k = 0; k <= NA; k++) {
        const ph = (k / NA) * Math.PI * 2, d = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
        const lump = 1 + 0.12 * N.noise(d[0] * 1.6 + seed, d[1] * 1.6, d[2] * 1.6);
        row.push(g.v(madd(c, d, r * lump), [lerp(uvr[0], uvr[2], k / NA), lerp(uvr[1], uvr[3], j / NR)], w, tag));
      }
      ids.push(row);
    }
    for (let j = 0; j < NR; j++) for (let k = 0; k < NA; k++) g.quad(ids[j][k], ids[j][k + 1], ids[j + 1][k + 1], ids[j + 1][k]);
  };
  /** finger bone radius profile: tapering, with knuckle swellings at the joints */
  const fingerR = (r0, r1) => (t) => lerp(r0, r1, t) * (1 + 0.32 * Math.exp(-(((t - 0.36) / 0.045) ** 2)) + 0.26 * Math.exp(-(((t - 0.7) / 0.04) ** 2)) + 0.3 * Math.exp(-((t / 0.06) ** 2)));
  const FOLD_TAG = 5;
  for (const s of ['l', 'r']) {
    const L = wingL[s], sx = L.sx, R0 = L.R0;
    const SWEEP = 0.5;   // rad: the wing plane swept back ~29 deg from the frontal plane
    // the clips carry the chest pitched ~65-75 deg forward (idle / walk_a, also while it flies): the spread wing is
    // built tilted back by WING_TILT about the pivot so it stands up and out in those poses, not flat over the head
    const WING_TILT = -1.0, ct = Math.cos(WING_TILT), st = Math.sin(WING_TILT);
    const tilt = (v) => [v[0], v[1] * ct - v[2] * st, v[1] * st + v[2] * ct];
    const X = (v) => { const c = Math.cos(SWEEP), sn = Math.sin(SWEEP), x = v[0] * 1.13; return tilt([(x * c) * sx * MS, v[1] * MS, (v[2] * c - x * sn) * MS]); };
    addHelperBone(h, 'wing_' + s, 'spine_03', R0);
    // ---------------------------------------------------------------- spread
    const El = add(R0, X([1.0, 1.35, -0.8]));
    const Wr = add(El, X([1.85, 0.55, 0.5]));
    const tipD = [[2.4, 2.1, 0.7], [3.0, -0.1, 0.25], [2.15, -1.95, -0.55], [0.55, -2.85, -1.15]];
    const tips = tipD.map((d) => add(Wr, X(d)));
    // each finger bows backwards and towards the trailing edge between its joints
    const D = tips.map((tip, k) => {
      const a = lerp3(Wr, tip, 0.36), b = lerp3(Wr, tip, 0.7);
      const bow = X([0, -0.12 - 0.05 * k, -0.22 - 0.06 * k]);
      return catmull([Wr, add(a, scl(bow, 0.8)), add(b, bow), tip], 3);
    });
    const bd = backAt(sx * 0.105, yS1 + 0.03), Bd = madd(bd.p, bd.n, 0.01);
    addHelperBone(h, 'wing_elbow_' + s, 'wing_' + s, El);
    addHelperBone(h, 'wing_wrist_' + s, 'wing_elbow_' + s, Wr);
    const wRoot = [['wing_' + s, 1]], wElb = [['wing_elbow_' + s, 1]], wWr = [['wing_wrist_' + s, 1]];
    const segs = [[R0, El, 'wing_' + s], [El, Wr, 'wing_elbow_' + s], [Wr, tips[3], 'wing_wrist_' + s], [Wr, tips[0], 'wing_wrist_' + s], [Bd, R0, 'wing_' + s]].map(([a, b, n]) => ({ f: segFn(a, b), n }));
    const wBlend = (p) => { const acc = {}; for (const g of segs) { const d = g.f(p).d + 0.02 * MS; acc[g.n] = (acc[g.n] || 0) + 1 / (d * d); } return Object.entries(acc); };
    // humerus, forearm (thick, with joint knobs), thumb claw
    tube(wingG, catmull([R0, add(lerp3(R0, El, 0.5), X([0, 0.08, -0.06])), El], 4), (t) => (0.17 - 0.06 * Math.sin(Math.PI * t) + 0.04 * ss(0.8, 1, t)) * MS, 9, WUV.hum, wRoot, { tag: 2 });
    knob(wingG, El, 0.2 * MS, WUV.knob, wElb, 2, 1 + (sx > 0 ? 0 : 5));
    tube(wingG, catmull([El, add(lerp3(El, Wr, 0.5), X([0, 0.06, -0.05])), Wr], 4), (t) => (0.14 - 0.05 * Math.sin(Math.PI * t) + 0.03 * ss(0.85, 1, t)) * MS, 9, WUV.fore, wElb, { tag: 2 });
    knob(wingG, Wr, 0.18 * MS, WUV.knob, wWr, 2, 3 + (sx > 0 ? 0 : 5));
    spike(wingG, Wr, norm(X([0.15, 0.55, 0.8])), 0.5 * MS, 0.085 * MS, WUV.claw, wWr, { hook: X([0, -1, 0.35]), hookAmt: 0.5, sides: 7, segs: 5, sink: 0.3, tag: 2 });
    D.forEach((pts, k) => tube(wingG, pts, fingerR((0.085 - 0.008 * k) * MS, 0.022 * MS), 6, WUV.d[k], wWr, { tag: 2, tipEnd: true }));
    // membrane: three cambered outer panels and the inner panel down to the lower back
    const Dc = D.map(pl);
    const back = norm(tilt([0, 0.25, -1]));
    panel(wingG, Dc[0], Dc[1], 9, 6, WUV.p1, wWr, { sc: 0.24, camber: 0.3 * MS, back });
    panel(wingG, Dc[1], Dc[2], 9, 6, WUV.p2, wWr, { sc: 0.22, camber: 0.32 * MS, back });
    panel(wingG, Dc[2], Dc[3], 9, 6, WUV.p3, wWr, { sc: 0.2, camber: 0.3 * MS, back });
    const edgePts = [];
    for (let i = 1; i < 6; i++) { const t = i / 6, p = lerp3(tips[3], Bd, t); edgePts.push(madd(lerp3(p, lerp3(El, R0, t), 0.28 * Math.sin(Math.PI * t)), back, 0.25 * MS * Math.sin(Math.PI * t))); }
    panel(wingG, pl([Wr, El, R0, Bd]), pl([...D[3], ...edgePts, Bd]), 12, 7, WUV.p4, (p) => wBlend(p), { camber: 0.35 * MS, back: norm(tilt([0.0, 0.2, -1])) });
    L.spread = { El, Wr, tips, Bd };
    // ---------------------------------------------------------------- folded
    addHelperBone(h, 'wing_fold_' + s, 'wing_' + s, R0);
    addHelperBone(h, 'wing_sheath_' + s, 'spine_03', R0);
    addHelperBone(h, 'wing_sheath2_' + s, 'spine_02', R0);
    const F = L.fold;
    const wf = (p) => { const k2 = ss(yS3 - 0.01, yS2 - 0.03, p[1]); return [['wing_fold_' + s, 0.5], ['wing_sheath_' + s, 0.5 * (1 - k2)], ['wing_sheath2_' + s, 0.5 * k2]]; };
    const wt = (t, p) => wf(p);
    // keeps a point at least `off` above the back (outward normal of the trunk under it)
    const lift = (off) => (p) => {
      const c = trunkB.closest(p);
      if (!c) return p;
      let n = c.n;
      if (n[2] > 0) n = scl(n, -1);
      const d = dot(sub(p, c.p), n);
      return d < off ? madd(p, n, off - d) : p;
    };
    const onBack = (a, b, n, off, bulge = 0) => { const out = []; for (let i = 0; i <= n; i++) out.push(lift(off + bulge * Math.sin(Math.PI * i / n))(lerp3(a, b, i / n))); return out; };
    // humerus (mostly under the membrane), elbow knob with a backward spur, forearm up to the wrist knuckle
    tube(wingG, onBack(R0, F.Ef, 4, 0.03), (t) => (0.03 - 0.006 * Math.sin(Math.PI * t)) * (t < 0.15 ? 0.85 : 1), 8, WUV.fhum, wt, { tag: FOLD_TAG });
    knob(wingG, F.Ef, 0.042, WUV.knob, wf(F.Ef), FOLD_TAG, 7 + sx);
    spike(wingG, F.Ef, norm(add(L.n, [sx * 0.3, -0.55, 0])), 0.075, 0.02, WUV.fclaw, wf(F.Ef), { hook: [0, -1, 0], hookAmt: 0.3, sides: 6, segs: 4, sink: 0.5, tag: FOLD_TAG });
    const fore = catmull([F.Ef, lift(0.075)(lerp3(F.Ef, F.Kn, 0.4)), lift(0.07)(lerp3(F.Ef, F.Kn, 0.75)), F.Kn], 3);
    tube(wingG, fore, (t) => 0.04 - 0.01 * Math.sin(Math.PI * t) + 0.01 * ss(0.85, 1, t), 8, WUV.ffore, wt, { tag: FOLD_TAG });
    knob(wingG, F.Kn, 0.05, WUV.knob, wf(F.Kn), FOLD_TAG, 11 + sx);
    // thumb claw: hooked forward over the shoulder
    spike(wingG, madd(F.Kn, [0, 1, 0], 0.035), norm([sx * 0.2, 0.8, 0.55]), 0.15, 0.03, WUV.fclaw, wf(F.Kn), { hook: [0, -0.6, 1], hookAmt: 0.55, sides: 7, segs: 5, sink: 0.5, tag: FOLD_TAG });
    // fingers folded back down along the back
    const FD = F.tips.map((tip) => { const pts = onBack(F.Kn, tip, 5, 0.04, 0.012); pts[0] = F.Kn.slice(); return catmull(pts, 2); });
    FD.forEach((pts, k) => tube(wingG, pts, fingerR(0.022 - 0.002 * k, 0.009), 6, WUV.fd[k], wt, { tag: FOLD_TAG, tipEnd: true }));
    // the membrane bundled in pleats between the forearm and the fingers, lying on the back
    const strips = [pl(fore.slice().reverse()), ...FD.map(pl)];
    for (let k = 0; k < 3; k++) panel(wingG, strips[k], strips[k + 1], 7, 4, WUV.f[k], wf, { pleat: 0.02, camber: 0.05, back: L.n, lift: lift(0.026), tag: FOLD_TAG });
  }
  const wingPart = toPart(lib, h, wingG, 'wings', 'skin', () => rigid('spine_03'));
  const wingFoldV = Uint8Array.from(wingG.tag, (t) => (t === FOLD_TAG ? 1 : 0));
  console.log('  wings', wingPart.triCount(), 'tris; span (full size)', ((wingL.l.spread.tips[1][0] - wingL.r.spread.tips[1][0]) * S_EST).toFixed(2), 'm');

  // ===================================================================== MakeHuman parts
  const body = h.basePart({ name: 'body', role: 'skin' });
  const eyes = await h.fit('eyes/low-poly', { name: 'eyes', role: 'eye', hide: false });
  // torn trousers: only the trouser islands of the suit, cropped uv atlas; shredded to ragged shorts below
  const suit = await h.fit('clothes/male_casualsuit04', { name: 'trousers', role: 'cloth', hide: false });
  const waistY = sk.spine_01.head.y + 0.03;
  const thighY = lerp(sk.thigh_l.head.y, sk.calf_l.head.y, 0.36);
  let suitCrop = null;
  {
    const isl = uvIslands(suit), ib = new Map();
    suit.obj.faces.forEach((f, fi) => { let b = ib.get(isl[fi]); if (!b) ib.set(isl[fi], b = { y: 0, n: 0 }); for (const v of f.v) { b.y += suit.pos[v * 3 + 1]; b.n++; } });
    suit.obj.faces.forEach((f, fi) => { const b = ib.get(isl[fi]); if (b.y / b.n > waistY) suit.keep[fi] = 0; });
    // legs burst off at mid-thigh along a ragged line (higher on the outside of the thigh)
    suit.obj.faces.forEach((f, fi) => {
      if (!suit.keep[fi]) return;
      const c = [0, 0, 0];
      for (const v of f.v) for (let k = 0; k < 3; k++) c[k] += suit.pos[v * 3 + k] / f.v.length;
      const cut = thighY + 0.035 * N.fbm(c[0] * 14, 0.5, c[2] * 14, 3) + 0.03 * ss(0.12, 0.2, Math.abs(c[0])) + 0.015 * Math.abs(N.noise(c[0] * 40, 1.5, c[2] * 40));
      if (c[1] < cut) suit.keep[fi] = 0;
    });
    console.log('  trousers: dropped', dropIslands(suit, 40), 'faces in loose scraps');
    for (const v of suit.deleteVerts) { const y = h.pos[v * 3 + 1]; if (y < waistY - 0.04 && y > thighY + 0.075) h.hidden.add(v); }
    const uv = suit.obj.uvs, r = [9, 9, -9, -9];
    suit.obj.faces.forEach((f, fi) => { if (suit.keep[fi]) for (const t of f.t) { r[0] = Math.min(r[0], uv[t * 2]); r[1] = Math.min(r[1], uv[t * 2 + 1]); r[2] = Math.max(r[2], uv[t * 2]); r[3] = Math.max(r[3], uv[t * 2 + 1]); } });
    const m = 0.006;
    suitCrop = [Math.floor(Math.max(0, r[0] - m) * 2048) / 2048, Math.floor(Math.max(0, r[1] - m) * 2048) / 2048, Math.ceil(Math.min(1, r[2] + m) * 2048) / 2048, Math.ceil(Math.min(1, r[3] + m) * 2048) / 2048];
    const nu = new Float32Array(uv.length);
    for (let i = 0; i < uv.length; i += 2) { nu[i] = (uv[i] - suitCrop[0]) / (suitCrop[2] - suitCrop[0]); nu[i + 1] = (uv[i + 1] - suitCrop[1]) / (suitCrop[3] - suitCrop[1]); }
    suit.obj = { ...suit.obj, uvs: nu };
  }

  // ===================================================================== TEXTURES
  // ---- trousers: what is left of a pair of work trousers, burst at every seam: ragged shorts, filthy and bloody
  const cropUV = (img, r, size) => {
    const W = img.width, H = img.height;
    const x0 = Math.round(r[0] * W), x1 = Math.round(r[2] * W), y0 = Math.round((1 - r[3]) * H), y1 = Math.round((1 - r[1]) * H);
    const w = Math.max(1, x1 - x0), hh = Math.max(1, y1 - y0);
    const out = createImage(w, hh, [0, 0, 0, 255]);
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { const si = ((y0 + y) * W + x0 + x) * 4, di = (y * w + x) * 4; for (let c = 0; c < 4; c++) out.data[di + c] = img.data[si + c]; }
    return lib.resize(out, size, size);
  };
  const suitBase = grade(cropUV(await lib.texture(suit.asset.textures.diffuse, 2048), suitCrop, 1024), (c) => {
    const l = lum(c);
    const g = [l * 0.92, l * 0.86, l * 0.7];
    for (let k = 0; k < 3; k++) c[k] = lerp(c[k], g[k], 0.85) * 1.0;
  });
  const cloth = lib.paintCloth(suit, {
    seed: 77, human: h, base: suitBase,
    normal: cropUV(await lib.texture(suit.asset.textures.normal, 2048), suitCrop, 512), ao: cropUV(await lib.texture(suit.asset.textures.ao, 2048), suitCrop, 256),
    size: 1024, normalSize: 512, ormSize: 256,
    fade: 0.35, grime: 1, grimeNoise: 1.1, weave: 0.8, innerDarken: 0,
    blood: { splatter: 0.5, edges: 0.8 },
    tear: {
      amount: 0.16, scale: 7, fray: 0.55, threadColor: [0.12, 0.1, 0.07],
      where: (P) => {
        // only a ragged band at the burst hem (the legs are cut off in the geometry) and a few small holes: no long
        // seam bursts (they left thin strips of cloth floating off the thighs like paper)
        return ss(thighY + 0.03, thighY - 0.005, P[1] + N.fbm(P[0] * 16, P[1] * 5, P[2] * 16, 3) * 0.025) * 1.3 + 0.25;
      },
    },
  });
  suit.material = lib.material('cloth', { ...cloth, alpha: cloth.alpha, doubleSided: true, pngBits: 6 });
  h.hideCovered(body, (p) => cloth.holeAt(p, 0.1));

  // ---- skin: ashen grey-olive corpse hide stretched over the overgrown muscle. Darker, filthier hands / feet /
  // shins, necrotic grey-violet patches, livor lace on the back, bulging dark veins, purple growth striae on the
  // shoulders and flanks, skin split open by the growth (raw muscle in long tears), calloused knuckles; the mouth a
  // raw, bloody cavity with a faint green throat glow (the breath), inflamed skin and green-lit veins round every
  // spore sac, violet veins burning out of the split sternum. Shadows go to the ORM occlusion (ray-traced AO below).
  const MC = mouthInfo.centre;
  const H0 = h.height;
  const skinBase = grade(lib.cloneImage(await lib.texture('system', 'skins/old_caucasian_male/old_lightskinned_male_diffuse.png', 2048)), (c) => {
    const l = lum(c);
    const g = [l * 0.9, l * 0.95, l * 0.86];
    for (let k = 0; k < 3; k++) c[k] = lerp(c[k], g[k], 0.88) * 0.47;
  });
  // violet veins radiating from the core over the chest: continuous lines (constant physical width, wandering,
  // thinning with distance), a second set of finer branches further out
  const coreVein = (P) => {
    const rel = sub(P, coreInfo.c), d = len(rel);
    if (d > 0.3 || d < 0.06) return 0;
    const ang = Math.atan2(rel[1], rel[0]);
    const vein = (K, seed, w0, w1, d0) => {
      const warp = N.fbm(P[0] * 6 + seed, P[1] * 6, P[2] * 6, 2) * 0.55 + N.noise(P[0] * 18, P[1] * 18 + seed, P[2] * 18) * 0.12;
      const a = ang * K / (2 * Math.PI) + warp + seed * 0.37;
      const fr = Math.abs(a - Math.round(a)) * (2 * Math.PI * d / K);          // metres from the nearest vein line
      const w = lerp(w0, w1, ss(0.08, 0.28, d));
      return (1 - ss(w * 0.5, w, fr)) * ss(d0, d0 + 0.02, d);
    };
    const fall = 1 - ss(0.14, 0.3, d + N.fbm(P[0] * 5, P[1] * 5, P[2] * 5, 2) * 0.04);
    return Math.max(vein(9, 0, 0.0055, 0.0025, 0.07), vein(17, 3.1, 0.003, 0.0015, 0.13) * 0.8) * fall;
  };
  const sacNear = (P) => {
    let best = 0, cl = null;
    for (const s of sacs) { const d = dist(P, s.p) / s.r; if (d < 2.6) { const k = 1 - ss(0.9, 2.6, d); if (k > best) { best = k; cl = s; } } }
    return { k: best, s: cl };
  };
  const sporeVein = (P) => {
    const n = sacNear(P);
    if (!n.k) return 0;
    return ss(0.6, 0.85, N.ridged(P[0] * 55, P[1] * 55, P[2] * 55, 3)) * n.k;
  };
  // torn flesh: the skin split by the growth (surface segments, width)
  const SP = (bone, t, dir) => lib.surfacePoint(h, bone, t, dir).p;
  const gashes = [
    [SP('upperarm_l', 0.25, [1, 0.2, -0.3]), SP('upperarm_l', 0.78, [1, 0, -0.3]), 0.027],
    [SP('upperarm_r', 0.3, [-0.6, 0.3, 0.8]), SP('upperarm_r', 0.62, [-0.9, 0, 0.5]), 0.02],
    [SP('lowerarm_r', 0.35, [-0.5, 0.6, -0.6]), SP('lowerarm_r', 0.62, [-0.7, 0.2, -0.6]), 0.018],
    [SP('spine_02', 0.4, [0.95, 0, 0.3]), SP('spine_02', 0.9, [0.85, 0, -0.5]), 0.022],
    [SP('spine_01', 0.6, [-0.9, 0, -0.5]), SP('spine_02', 0.5, [-0.5, 0, -0.9]), 0.018],
    [SP('clavicle_r', 0.8, [0, 1, -0.2]), SP('upperarm_r', 0.08, [-0.6, 0.6, -0.5]), 0.02],
    [SP('thigh_r', 0.5, [-0.3, 0, 1]), SP('thigh_r', 0.8, [-0.2, 0, 1]), 0.018],
    [SP('neck_01', 0.3, [0.9, 0, 0.4]), SP('neck_01', 0.9, [0.7, 0, 0.7]), 0.014],
  ].map(([a, b, w]) => ({ a, b, w, d: norm(sub(b, a)), L: dist(a, b) }));
  const peels = [
    { p: SP('upperarm_l', 0.1, [0.6, 0.75, -0.2]), r: 0.05, f: norm(sub(B('lowerarm_l'), B('upperarm_l'))) },
    { p: SP('spine_02', 0.6, [-0.85, 0, -0.5]), r: 0.042, f: [0, 1, 0] },
    { p: SP('calf_l', 0.35, [0.8, 0, -0.6]), r: 0.032, f: [0, 1, 0] },
    { p: SP('lowerarm_l', 0.4, [0.4, 0.8, 0.4]), r: 0.03, f: norm(sub(B('hand_l'), B('lowerarm_l'))) },
  ];
  const handsP = ['hand_l', 'hand_r', 'middle_02_l', 'middle_02_r'].map(B), feetP = ['foot_l', 'foot_r', 'ball_l', 'ball_r'].map(B);
  const knuckles = [];
  for (const s of ['l', 'r']) for (const f of ['index', 'middle', 'ring', 'pinky']) knuckles.push(B(`${f}_02_${s}`), B(`${f}_03_${s}`));
  const skinFolds = [];
  for (const s of ['l', 'r']) {
    const dirOf = (a, b) => norm(sub(B(b), B(a)));
    skinFolds.push(
      { p: B('lowerarm_' + s), ax: norm(add(dirOf('upperarm_' + s, 'lowerarm_' + s), dirOf('lowerarm_' + s, 'hand_' + s))), sp: 0.012, reach: 0.045, rad: 0.1, k: 0.75 },
      { p: B('calf_' + s), ax: norm(add(dirOf('thigh_' + s, 'calf_' + s), dirOf('calf_' + s, 'foot_' + s))), sp: 0.016, reach: 0.035, rad: 0.13, k: 0.38 },
      { p: B('hand_' + s), ax: dirOf('lowerarm_' + s, 'hand_' + s), sp: 0.008, reach: 0.028, rad: 0.08, k: 0.6 },
      { p: B('upperarm_' + s), ax: dirOf('upperarm_' + s, 'lowerarm_' + s), sp: 0.013, reach: 0.04, rad: 0.11, k: 0.5 },
    );
  }
  skinFolds.push(
    { p: add(B('neck_01'), [0, 0.03, 0]), ax: norm(sub(B('head'), B('neck_01'))), sp: 0.014, reach: 0.06, rad: 0.15, k: 0.7 },
    { p: [0, lerp(yS1, yS2, 0.35), spineZ(yS1) + 0.1], ax: [0, 1, 0], sp: 0.024, reach: 0.07, rad: 0.24, k: 0.25, side: [0, 0, 1] },
  );
  const sUAl = boneSeg(sk.upperarm_l), sUAr = boneSeg(sk.upperarm_r);
  const crust = lin([70, 16, 12]), crustB = lin([34, 9, 7]);
  const skinExtra = (P, Nn, c, st) => {
    // broad tone: grey-violet necrotic patches, warmer sallow patches, livor lace (back / flanks)
    const g = N.fbm(P[0] * 3.5 + 3, P[1] * 3.5, P[2] * 3.5, 3);
    over(c, lin([96, 86, 98]), ss(0.1, 0.55, g) * 0.45);
    over(c, lin([126, 120, 92]), ss(0.15, 0.6, -g) * 0.35);
    const lace = N.worley(P[0] * 22, P[1] * 22, P[2] * 22);
    mul(c, [0.78, 0.68, 0.8], (1 - ss(0.04, 0.15, Math.abs(lace - 0.5))) * ss(0.0, 0.5, N.fbm(P[0] * 6 + 1, P[1] * 6, P[2] * 6, 2) + 0.15) * 0.5 * ss(0.3, -0.5, Nn[2]));
    // extremities: darker, filthier hands / forearms, feet / shins
    let ext = 0;
    for (const q of handsP) ext = Math.max(ext, 1 - ss(0.06, 0.3, dist(P, q)));
    for (const q of feetP) ext = Math.max(ext, 1 - ss(0.05, 0.28, dist(P, q)));
    mul(c, [0.64, 0.6, 0.56], ext * 0.75);
    over(c, lin([62, 52, 40]), ext * ss(-0.2, 0.5, N.fbm(P[0] * 18, P[1] * 18, P[2] * 18, 3)) * 0.55);
    // pores, fine creases and an oily / dry roughness break-up (close-ups of a 7 m giant)
    const pw = N.worley(P[0] * 380, P[1] * 380, P[2] * 380);
    const pore = (1 - ss(0.1, 0.24, pw)) * (0.4 + 0.6 * ss(-0.2, 0.4, N.noise(P[0] * 40, P[1] * 40, P[2] * 40)));
    st.h -= pore * 0.14; mul(c, [0.86, 0.8, 0.8], pore * 0.22);
    const xh = Math.min(Math.abs(N.noise(P[0] * 170, P[1] * 60, P[2] * 170)), Math.abs(N.noise(P[0] * 60 + 5, P[1] * 170, P[2] * 60)));
    st.h -= (1 - ss(0.0, 0.05, xh)) * 0.06;
    st.ro = lerp(st.ro, 0.36, ss(-0.1, 0.5, N.fbm(P[0] * 6 + 11, P[1] * 6, P[2] * 6, 3)) * 0.55);
    st.ro += N.fbm(P[0] * 60, P[1] * 60, P[2] * 60, 2) * 0.1 + pore * 0.1;
    // bulging veins: dark violet-grey cords over the arms, chest, neck and back
    const vv = ss(0.74, 0.92, N.ridged(P[0] * 13, P[1] * 13, P[2] * 13, 2)) * ss(0.0, 0.45, N.fbm(P[0] * 4 + 9, P[1] * 4, P[2] * 4, 2));
    if (vv > 0) { over(c, lin([66, 62, 84]), vv * 0.45); st.h += vv * 0.7; }
    // big folds and creases where the skin bunches: elbows, knees, wrists, the neck, the belly, the armpits
    for (const J of skinFolds) {
      const r = sub(P, J.p), along = dot(r, J.ax), rad = len(sub(r, scl(J.ax, along)));
      if (Math.abs(along) > J.reach || rad > J.rad) continue;
      const k = (1 - ss(J.reach * 0.4, J.reach, Math.abs(along))) * (1 - ss(J.rad * 0.6, J.rad, rad)) * J.k * ss(-0.2, 0.3, dot(Nn, J.side || Nn));
      const f = Math.sin((along / J.sp + N.noise(P[0] * 22, P[1] * 22, P[2] * 22) * 1.4) * Math.PI * 2);
      const amp = 0.75 * k * ss(-0.5, 0.4, N.fbm(P[0] * 30 + 3, P[1] * 30, P[2] * 30, 2));
      st.h += (f > 0 ? f ** 0.6 : -((-f) ** 2.5) * 1.6) * amp;
      mul(c, [0.86, 0.82, 0.84], ss(0.4, -0.8, f) * 0.35 * k);
    }
    // growth striae: shoulders / armpits (along the arm) and the flanks
    let sm = 0;
    for (const [sg, sx] of [[sUAl, 1], [sUAr, -1]]) {
      const q = sg(P);
      if (q.t < -0.35 || q.t > 0.6 || q.d > 0.16) continue;
      const region = ss(-0.3, -0.1, q.t) * (1 - ss(0.25, 0.55, q.t)) * ss(0.3, 0.65, N.fbm(P[0] * 6, P[1] * 6, P[2] * 6, 2) + 0.5);
      const f = (P[1] * 0.7 - sx * P[0] * 0.7) / 0.011 + N.noise(P[0] * 22, P[1] * 22, P[2] * 22) * 0.8;
      sm = Math.max(sm, (1 - ss(0.06, 0.22, Math.abs(f - Math.round(f)))) * ss(-0.1, 0.35, N.noise(P[2] * 30, Math.round(f) * 0.37, 1.7)) * region);
    }
    if (Math.abs(P[0]) > 0.08 && P[1] > yS1 - 0.05 && P[1] < yS3) {
      const region = ss(0.08, 0.16, Math.abs(P[0])) * ss(yS1 - 0.05, yS1 + 0.02, P[1]) * (1 - ss(yS3 - 0.08, yS3, P[1]));
      const f = (P[1] + 0.5 * Math.abs(P[0])) / 0.012 + N.noise(P[0] * 20, P[1] * 20, P[2] * 20) * 0.8;
      sm = Math.max(sm, (1 - ss(0.07, 0.22, Math.abs(f - Math.round(f)))) * ss(-0.1, 0.3, N.noise(P[0] * 30 + P[2] * 30, Math.round(f) * 0.41, 3.1)) * region);
    }
    if (sm > 0) { over(c, mix3(lin([170, 150, 156]), lin([112, 56, 82]), ss(-0.2, 0.4, N.noise(P[0] * 9, P[1] * 9, P[2] * 9 + 4))), sm * 0.6); st.h -= sm * 0.3; st.ro = lerp(st.ro, 0.42, sm * 0.6); }
    // calloused knuckles (it walks on them)
    for (const kp of knuckles) {
      const d = dist(P, kp);
      if (d > 0.04) continue;
      const k = 1 - ss(0.012, 0.04, d);
      mul(c, [0.66, 0.6, 0.58], k * 0.7); st.h += k * N.fbm(P[0] * 160, P[1] * 160, P[2] * 160, 3) * 0.8; st.ro = lerp(st.ro, 0.85, k);
    }
    // torn flesh: long splits in the skin, raw striated muscle inside, a lifted ragged rim, blood run-off
    for (const gsh of gashes) {
      const q = sub(P, gsh.a), t = dot(q, gsh.d);
      if (t < -0.03 || t > gsh.L + 0.03) continue;
      const off = len(sub(q, scl(gsh.d, clamp01(t / gsh.L) * gsh.L)));
      const wdt = gsh.w * Math.sin(Math.PI * clamp01(t / gsh.L)) ** 0.6 * (0.75 + 0.5 * N.noise(t * 40, gsh.w * 90, 0.3));
      const e = Math.max(0, off + N.fbm(P[0] * 70, P[1] * 70, P[2] * 70, 3) * 0.004);
      if (wdt > 1e-4 && e < wdt) {
        const fib = N.ridged(t * 260, e * 30, P[1] * 40, 2);
        set(c, mix3(lin([104, 26, 26]), lin([38, 7, 9]), ss(0.2, 0.9, fib) * 0.6 + (1 - e / wdt) * 0.4));
        over(c, lin([176, 140, 124]), ss(0.84, 0.96, N.ridged(P[0] * 90, P[1] * 90, P[2] * 90, 2)) * 0.2);       // fascia
        st.h -= 2.4 * (1 - (e / wdt) ** 2); st.h += fib * 0.35; st.ro = 0.22;
        st.bl = Math.max(st.bl, ss(0.4, 0.7, N.fbm(P[0] * 50, P[1] * 50, P[2] * 50, 2) + (1 - e / wdt) * 0.3) * 0.55);
      } else if (e < wdt + 0.016) {
        // swollen, bruised lips of the wound
        const k = 1 - (e - wdt) / 0.016;
        over(c, mix3(lin([96, 54, 66]), lin([128, 70, 74]), k), (0.35 + 0.4 * k) * 0.8); st.h += Math.sin(Math.PI * Math.min(1, k * 1.3)) * 1.1; st.ro = lerp(st.ro, 0.38, k);
      }
      const below = (gsh.a[1] + gsh.b[1]) / 2 - P[1];
      if (below > 0 && below < 0.12 && off < gsh.L * 0.6) st.bl = Math.max(st.bl, ss(0.25, 0.55, N.noise(P[0] * 150, P[1] * 8, P[2] * 150)) * (1 - below / 0.12) * ss(0.02, 0.0, e - wdt - 0.02) * 0.8);
    }
    // peeled patches: skin torn away over the swollen muscle (shoulder, flank, calf)
    for (const pt of peels) {
      const d = dist(P, pt.p);
      if (d > pt.r * 1.6) continue;
      const q = d / pt.r + N.fbm(P[0] * 40, P[1] * 40, P[2] * 40, 3) * 0.35;
      if (q < 1) {
        const fib = N.ridged(dot(P, pt.f) * 240, dot(P, cross(pt.f, Nn)) * 30, 0.5, 2);
        set(c, mix3(lin([108, 28, 28]), lin([42, 8, 10]), ss(0.3, 0.9, fib) * 0.65 + 0.25 * (1 - q)));
        over(c, lin([170, 136, 118]), ss(0.84, 0.96, N.ridged(P[0] * 80, P[1] * 80, P[2] * 80, 2)) * 0.22);
        over(c, lin([170, 142, 92]), (1 - ss(0.08, 0.2, N.worley(P[0] * 140, P[1] * 140, P[2] * 140))) * ss(0.7, 1, q) * 0.3);   // fat at the torn edge
        st.h -= 1.6 * (1 - q * q); st.h += fib * 0.4; st.ro = 0.24;
      } else if (q < 1.3) {
        const k = 1 - (q - 1) / 0.3;
        over(c, lin([112, 66, 72]), k * 0.6); st.h += Math.sin(Math.PI * Math.min(1, k * 1.3)) * 1.0;
        st.bl = Math.max(st.bl, k * 0.4);
      }
    }
    // mouth: raw gums and torn lip edges, a dark throat with a faint green glow down it
    const dm = dist(P, MC);
    if (dm < 0.085 && Math.abs(P[0]) < 0.075) {
      const inner = (1 - ss(0.065, 0.085, dm)) * ss(-0.15, 0.35, dot(Nn, norm(sub(MC, P)))) * (1 - ss(0.04, 0.06, Math.abs(P[0])));
      const inside = ss(MC[2] + 0.028, MC[2] + 0.004, P[2]) * inner;
      over(c, mix3(lin([122, 34, 38]), lin([60, 12, 14]), ss(-0.3, 0.5, N.fbm(P[0] * 90, P[1] * 90, P[2] * 90, 2))), inside * 0.95);
      over(c, lin([14, 4, 4]), ss(MC[2] - 0.0, MC[2] - 0.045, P[2]) * 0.9 * inner);
      st.ro = lerp(st.ro, 0.2, inside);
      st.bl = Math.max(st.bl, ss(MC[2] + 0.045, MC[2] + 0.02, P[2]) * (1 - ss(0.04, 0.085, dm)) * (1 - ss(0.035, 0.055, Math.abs(P[0]))) * 0.75);
    }
    // the split sternum: raw flesh crater, inflamed purple skin round it, violet veins (also emissive)
    const dc = dist(P, coreInfo.c);
    if (dc < 0.2) {
      const raw = 1 - ss(0.085, 0.125, dc + N.fbm(P[0] * 40, P[1] * 40, P[2] * 40, 2) * 0.015);
      over(c, lin([98, 50, 92]), (1 - ss(0.08, 0.2, dc)) * 0.6);
      over(c, mix3(lin([128, 30, 40]), lin([52, 10, 18]), ss(-0.2, 0.6, N.ridged(P[0] * 120, P[1] * 120, P[2] * 120, 2))), raw * 0.95);
      st.ro = lerp(st.ro, 0.24, raw); st.h -= raw * 0.5;
    }
    const cv = coreVein(P);
    if (cv > 0) { over(c, lin([70, 34, 84]), cv * 0.8); st.h += cv * 0.9; }
    // spore sacs: inflamed, swollen skin round their bases, green-lit veins running out of them
    const sn = sacNear(P);
    if (sn.k > 0) {
      over(c, lin([116, 56, 64]), ss(0.55, 0.95, sn.k) * 0.7);
      over(c, lin([104, 110, 52]), ss(0.2, 0.6, sn.k) * (1 - ss(0.6, 0.9, sn.k)) * 0.35);
      const sv = sporeVein(P);
      over(c, lin([78, 96, 40]), sv * 0.8); st.h += sv * 0.8;
      st.ro = lerp(st.ro, 0.3, sn.k * 0.6);
    }
    if (!Number.isFinite(st.h) || !Number.isFinite(st.ro) || !Number.isFinite(st.bl) || !c.every(Number.isFinite)) {
      if (!skinExtra.warned) { skinExtra.warned = 1; console.warn('  skinExtra: non-finite at', P.map((x) => x.toFixed(3)).join(','), st, c); }
      st.h = Number.isFinite(st.h) ? st.h : 0; st.ro = Number.isFinite(st.ro) ? st.ro : 0.6; st.bl = Number.isFinite(st.bl) ? st.bl : 0;
      for (let k = 0; k < 3; k++) if (!Number.isFinite(c[k])) c[k] = 0.1;
    }
    // blood: every painted mark ends as dried crust with a few wet cores
    if (st.bl > 0) {
      const b = Math.min(1, st.bl);
      const age = ss(-0.45, 0.35, N.noise(P[0] * 22 + 70, P[1] * 22, P[2] * 22));
      over(c, mix3(crust, crustB, age), ss(0.0, 0.5, b) * 0.9);
      st.ro = lerp(st.ro, lerp(0.25, 0.55, age), b);
      st.h += ss(0.45, 0.95, b) * 0.2;
      st.bl = b * 0.1;
    }
  };
  const skin = lib.paintSkin(h, {
    seed: 21, base: skinBase, size: 2048, normalSize: 2048, ormSize: 1024,
    pallor: 0.3, tint: lin([146, 152, 138]), mottle: 0.7, veins: 0.25, bruises: 0.35, socket: 1, grime: 0.5, lips: 0,
    coveredDarken: 0.5, coveredShade: 0.2, normalStrength: 2.2, bumpStrength: 1.1,
    blood: { mouth: 1, hands: 0.55, splatter: 0.12 },
    wounds: [{ bone: 'spine_03', t: 0.6, dir: [-0.7, 0.2, 0.7], r: 0.03, kind: 'bite', depth: 1.6 }],
    extra: skinExtra,
  });
  // ray-traced AO from the body and everything attached to it (the folded wings in, the spread ones out: hidden on
  // the ground) -> ORM occlusion only (never into the albedo)
  const baseS = nsurf(h.basePart({ name: 'ao' }));
  {
    const wt = wingPart.tris(), keepW = [];
    for (let i = 0; i < wt.length; i += 6) if (wingFoldV[wt[i]] && wingFoldV[wt[i + 2]] && wingFoldV[wt[i + 4]]) keepW.push(...wt.slice(i, i + 6));
    const occ = makeBVH([surf(fullBody), surf(suit), surf(sporePart), surf(bonePart), surf(corePart), { pos: wingPart.pos, tris: Int32Array.from(keepW) }]).bvh;
    const RA = texSize(512);
    const ao = bakeField(baseS, h.baseObj.uvs, RA, aoTracer(occ, { rays: 16, maxDist: 0.09 }));
    applyOcclusion(skin.orm, [ao], RA, (a) => lerp(1, a, 0.85));
  }
  // emissive: violet veins from the core, green round the spore sacs, a faint green glow deep in the throat
  const RE = texSize(1024);
  const glowV = bakeField(baseS, h.baseObj.uvs, RE, (P) => coreVein(P), { fill: 0, blur: 1 });
  const glowG = bakeField(baseS, h.baseObj.uvs, RE, (P) => {
    const throat = ss(MC[2] - 0.01, MC[2] - 0.05, P[2]) * (1 - ss(0.03, 0.06, dist(P, [MC[0], MC[1], MC[2] - 0.035])));
    return Math.max(sporeVein(P) * 0.75, throat * 0.32);
  }, { fill: 0, blur: 1 });
  const skinEm = createImage(RE, RE, [0, 0, 0, 255]);
  for (let i = 0; i < RE * RE; i++) {
    const v = glowV[i], gg = glowG[i];
    skinEm.data[i * 4] = toByte(v * 0.42 + gg * 0.3); skinEm.data[i * 4 + 1] = toByte(v * 0.08 + gg * 0.85); skinEm.data[i * 4 + 2] = toByte(v * 0.6 + gg * 0.1);
  }
  for (let i = 0; i < skin.orm.data.length; i += 4) skin.orm.data[i + 1] = Math.max(skin.orm.data[i + 1], 100);
  body.material = lib.material('skin', { ...skin, emissiveMap: skinEm, emissive: [1, 1, 1] });
  const eyeM = lib.paintEyes(await lib.texture('system', 'eyes/materials/brown_eye.png', 256), { style: 'glow', color: [0.75, 1, 0.25] });
  eyes.material = lib.material('eye', { albedo: eyeM.albedo, emissiveMap: eyeM.emissiveMap, emissive: [0.85, 1, 0.4], roughness: 0.15 });
  eyes.extras.noSimplify = true;

  // ---- fangs: yellowed, stained enamel, dark at the gum, blood in the cracks; raw swollen gums; a dark wet tongue
  // with a faint green glow from the throat behind it
  const fangTex = paintPart(fangPart, { size: 512, normalSize: 256, ormSize: 128, rough: 0.35, emissive: true, emissiveSize: 128 }, (P, Nn, st, u, v) => {
    const kind = mouthInfo.fangKinds[Math.floor(v * 8) * 8 + Math.floor(u * 8)] || 'tooth';
    if (kind === 'gum') {
      set(st.c, mix3(lin([132, 46, 50]), lin([70, 16, 22]), ss(-0.3, 0.5, N.fbm(P[0] * 160, P[1] * 160, P[2] * 160, 3))));
      over(st.c, lin([40, 8, 10]), ss(0.6, 0.9, N.ridged(P[0] * 220, P[1] * 220, P[2] * 220, 2)) * 0.6);
      st.h = N.fbm(P[0] * 260, P[1] * 260, P[2] * 260, 2) * 0.6; st.ro = 0.22;
      return;
    }
    if (kind === 'tongue') {
      const back = ss(mouthInfo.lo.cen[2] - 0.0, mouthInfo.lo.cen[2] - 0.05, P[2]);
      set(st.c, mix3(lin([96, 36, 42]), lin([40, 14, 18]), back * 0.7 + 0.3 * ss(-0.3, 0.6, N.fbm(P[0] * 200, P[1] * 200, P[2] * 200, 2))));
      st.h = (1 - ss(0.1, 0.3, N.worley(P[0] * 260, P[1] * 260, P[2] * 260))) * 0.5; st.ro = 0.18;
      st.e[0] = back * 0.1; st.e[1] = back * 0.28; st.e[2] = back * 0.03;
      return;
    }
    const dm = Math.min(Math.abs(P[1] - mouthInfo.up.y1), Math.abs(P[1] - mouthInfo.lo.y0));
    set(st.c, mix3(lin([214, 198, 150]), lin([150, 122, 74]), ss(-0.3, 0.6, N.fbm(P[0] * 120, P[1] * 120, P[2] * 120, 3))));
    over(st.c, lin([110, 84, 50]), ss(0.3, 0.8, N.fbm(P[0] * 40 + 3, P[1] * 140, P[2] * 40, 2)) * 0.5);     // long stain streaks
    mul(st.c, [0.55, 0.4, 0.3], (1 - ss(0.002, 0.014, dm)) * 0.85);
    over(st.c, lin([90, 14, 12]), (1 - ss(0.0, 0.008, dm)) * 0.85);
    const crack = 1 - ss(0.01, 0.03, Math.abs(N.noise(P[0] * 200, P[1] * 60, P[2] * 200)));
    over(st.c, lin([60, 30, 22]), crack * 0.6);
    st.h = N.fbm(P[0] * 300, P[1] * 300, P[2] * 300, 2) * 0.3 - crack * 0.4;
  });
  fangPart.material = lib.material('teeth', { ...fangTex, emissive: [1, 1, 1] });

  // ---- bone: yellow-ivory cortex, stained, bloody and fleshy where it bursts from the skin
  // (t: 0 at the root .. 1 at the tip, from the cell's u; claws are dark keratin, the rest living bone)
  const boneTex = paintPart(bonePart, { size: 1024, normalSize: 1024, ormSize: 256, rough: 0.55, normalStrength: 2.4 }, (P, Nn, st, u, v) => {
    const cu = Math.floor(u * BN), cv = Math.floor(v * BN), kind = boneKinds[cv * BN + cu] || "spine";
    const t = clamp01((u - (cu / BN + 0.006)) / (1 / BN - 0.012));
    if (kind === 'claw') {
      set(st.c, mix3(lin([58, 50, 44]), lin([22, 19, 17]), ss(0.1, 0.9, t) * 0.6 + 0.4 * ss(-0.3, 0.5, N.fbm(P[0] * 80, P[1] * 80, P[2] * 80, 2))));
      over(st.c, lin([120, 108, 92]), ss(0.85, 1, t) * 0.5);                       // worn pale tips
      st.h = Math.sin(t * 60 + N.noise(P[0] * 90, P[1] * 90, P[2] * 90) * 2) * 0.15 + N.fbm(P[0] * 200, P[1] * 200, P[2] * 200, 2) * 0.2;
      st.ro = 0.4;
      const root = 1 - ss(0.0, 0.18, t);
      over(st.c, lin([70, 20, 20]), root * 0.7);
      return;
    }
    // cortex: ivory -> yellowed / brown-stained, growth rings along the length, hairline cracks, pores
    const age = clamp01(0.35 + 0.65 * N.fbm(P[0] * 20 + 2, P[1] * 20, P[2] * 20, 3) + 0.3 * (1 - t));
    set(st.c, mix3(lin([222, 210, 182]), lin([160, 132, 90]), age));
    over(st.c, lin([104, 78, 54]), ss(0.15, 0.55, N.fbm(P[0] * 40 + 7, P[1] * 40, P[2] * 40, 3)) * 0.5);
    const ring = Math.abs(Math.sin(t * 34 + N.noise(P[0] * 30, P[1] * 30, P[2] * 30) * 1.5));
    st.h = N.fbm(P[0] * 90, P[1] * 90, P[2] * 90, 3) * 0.35 + (1 - ss(0.0, 0.25, ring)) * 0.35 * (1 - t);
    mul(st.c, [0.8, 0.72, 0.62], (1 - ss(0.0, 0.2, ring)) * 0.35 * (1 - t));
    const crack = 1 - ss(0.008, 0.02, Math.abs(N.noise(P[0] * 70, P[1] * 70, P[2] * 70)));
    over(st.c, lin([70, 52, 40]), crack * 0.7 * ss(0.3, 0.6, t)); st.h -= crack * 0.5;
    const pw = N.worley(P[0] * 500, P[1] * 500, P[2] * 500);
    mul(st.c, [0.6, 0.52, 0.45], (1 - ss(0.06, 0.12, pw)) * 0.5);
    // tips sharp and polished, roots wet with blood and torn flesh where the bone burst out of the skin
    st.ro = lerp(0.62, 0.35, ss(0.6, 1, t));
    over(st.c, lin([232, 224, 206]), ss(0.88, 1, t) * 0.35);
    const root = 1 - ss(kind === 'rib' ? 0.08 : 0.14, kind === 'rib' ? 0.22 : 0.34, t + N.noise(P[0] * 90, P[1] * 90, P[2] * 90) * 0.05);
    over(st.c, mix3(lin([110, 26, 26]), lin([44, 9, 9]), ss(-0.2, 0.5, N.noise(P[0] * 70, P[1] * 70, P[2] * 70))), root * 0.92);
    st.ro = lerp(st.ro, 0.22, root);
    // dried blood runs down from the roots
    const run = ss(0.3, 0.7, N.noise(P[0] * 260, P[1] * 30, P[2] * 260)) * (1 - ss(0.2, 0.55, t));
    over(st.c, lin([60, 14, 12]), run * 0.6);
  });
  bonePart.material = lib.material('gear', boneTex);

  // ---- spore sacs: taut, translucent membrane (yellow-olive, not lime) stretched over a glowing interior: the lit
  // spore clumps inside show through as soft bright lobes, a fine network of dark red-brown veins runs over it, the
  // base is a ring of raw, swollen flesh where the sac bursts out of the skin
  const sporeTex = paintPart(sporePart, { size: 1024, normalSize: 512, ormSize: 256, rough: 0.34, emissive: true, emissiveSize: 512, normalStrength: 2.2 }, (P, Nn, st, u, v) => {
    const cu = Math.floor(u * SAC_N), cv = Math.floor(v * SAC_N);
    const si = cv * SAC_N + cu, s = sacs[si];
    const top = s ? clamp01(dot(sub(P, s.p), s.n) / (s.r * 1.3)) : 0.5;
    const R = s ? s.r : 0.03, q = s ? scl(sub(P, s.p), 1 / R) : P;
    // the glowing interior shows through as a soft, uneven light (brightest where the membrane is thinnest, near the
    // top), a few darker clumps inside; a net of dark red-brown veins over it; the membrane thick and olive at the rim
    const clump = ss(0.25, 0.75, N.worley(q[0] * 1.3 + 3, q[1] * 1.3, q[2] * 1.3));
    const vein = ss(0.42, 0.68, N.ridged(q[0] * 3.2 + 7, q[1] * 3.2, q[2] * 3.2, 2)), fine = ss(0.5, 0.75, N.ridged(q[0] * 8 + 5, q[1] * 8, q[2] * 8, 2));
    const thin = ss(0.12, 0.85, top);
    set(st.c, mix3(lin([78, 74, 40]), lin([136, 130, 70]), thin * (0.5 + 0.5 * clump)));
    over(st.c, lin([62, 26, 20]), vein * 0.85 + fine * 0.45);
    const base = 1 - ss(0.04, 0.32, top);
    const rim = Math.exp(-(((top - 0.3) / 0.08) ** 2));
    over(st.c, mix3(lin([108, 32, 32]), lin([52, 12, 14]), ss(-0.2, 0.5, N.noise(P[0] * 90, P[1] * 90, P[2] * 90))), base * 0.95);
    over(st.c, lin([120, 58, 58]), rim * 0.35);
    st.h = (1 - clump) * 0.3 + vein * 0.9 + fine * 0.3 - base * 0.3 + rim * 0.5;
    st.ro = lerp(0.3, 0.5, base) + vein * 0.1;
    const g = clamp01(thin ** 1.4 * (0.35 + 0.65 * clump) * 1.1) * (1 - vein * 0.9) * (1 - fine * 0.5) * (1 - base) * (s ? s.e : 1);
    st.e[0] = g * 0.24; st.e[1] = g * 0.3; st.e[2] = g * 0.04;
  });
  sporePart.material = lib.material('gore', { ...sporeTex, emissive: [1, 1, 1] });

  // ---- core: a dark crust of plates (violet-black, dry) over a heart that glows through every crack: white-hot
  // where the cracks face the viewer, magenta then violet towards the edges; the arteries dark wine-red, swelling and
  // glowing where the heat runs through them
  const coreN0 = coreInfo.n, coreC0 = coreInfo.c;
  const cellJit = (i, j, k, a) => hash(((i * 73856093) ^ (j * 19349663) ^ (k * 83492791)) + a * 101);
  const worley2 = (x, y, z) => {
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
    let f1 = 9, f2 = 9;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
      const cx = X + i, cy = Y + j, cz = Z + k;
      const d = (cx + cellJit(cx, cy, cz, 1) - x) ** 2 + (cy + cellJit(cx, cy, cz, 2) - y) ** 2 + (cz + cellJit(cx, cy, cz, 3) - z) ** 2;
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    return [Math.sqrt(f1), Math.sqrt(f2)];
  };
  const coreTex = paintPart(corePart, { size: 512, normalSize: 512, ormSize: 128, rough: 0.5, emissive: true, emissiveSize: 512, normalStrength: 3.2 }, (P, Nn, st, u) => {
    if (u > 0.7) {
      const sw = ss(0.1, 0.6, N.fbm(P[0] * 50, P[1] * 50, P[2] * 50, 2)), near = 1 - ss(0.07, 0.13, dist(P, coreC0));
      set(st.c, mix3(lin([70, 18, 34]), lin([118, 44, 96]), sw * 0.5));
      over(st.c, lin([30, 8, 18]), ss(0.7, 0.92, N.ridged(P[0] * 160, P[1] * 160, P[2] * 160, 2)) * 0.6);
      st.h = N.fbm(P[0] * 120, P[1] * 120, P[2] * 120, 2) * 0.5 + sw * 0.4; st.ro = 0.24;
      const g = sw * (0.35 + 0.65 * near);
      st.e[0] = g * 0.55; st.e[1] = g * 0.1; st.e[2] = g * 0.75;
      return;
    }
    const q = scl(sub(P, coreC0), 1 / coreInfo.rc);
    const wq = [q[0] + 0.45 * N.fbm(q[0] * 1.7, q[1] * 1.7, q[2] * 1.7, 2), q[1] + 0.45 * N.fbm(q[0] * 1.7 + 9, q[1] * 1.7, q[2] * 1.7, 2), q[2] + 0.45 * N.fbm(q[0] * 1.7, q[1] * 1.7 + 5, q[2] * 1.7, 2)];
    const [f1, f2] = worley2(wq[0] * 2.2 + 11, wq[1] * 2.2, wq[2] * 2.2);
    const cw = 0.05 + 0.12 * ss(-0.3, 0.6, N.fbm(q[0] * 4, q[1] * 4 + 3, q[2] * 4, 2));          // crack width varies, some close up
    const crack = 1 - ss(0.0, cw, f2 - f1 + 0.03 * N.noise(q[0] * 14, q[1] * 14, q[2] * 14));
    const front = ss(-0.1, 0.95, dot(Nn, coreN0));
    const heat = clamp01(crack * (0.3 + 0.7 * front) + 0.1 * front * ss(0.2, 0.8, N.fbm(q[0] * 3, q[1] * 3, q[2] * 3, 2) + 0.5));
    // crust: dark plates, their raised rims paler, a dry flaking texture
    const plate = ss(0.0, 0.5, f1);
    set(st.c, mix3(lin([46, 22, 42]), lin([22, 10, 22]), plate));
    over(st.c, lin([80, 52, 74]), (1 - ss(0.12, 0.3, f2 - f1)) * (1 - crack) * 0.4);
    over(st.c, mix3(lin([150, 40, 170]), lin([255, 220, 250]), front * front), crack * 0.8);
    st.h = (1 - crack) * 0.8 - crack * 1.0 + N.fbm(q[0] * 14, q[1] * 14, q[2] * 14, 3) * 0.25 * (1 - crack);
    st.ro = lerp(0.62, 0.22, crack);
    // emissive: white-hot -> magenta -> violet with falling heat
    const hot = heat * heat;
    st.e[0] = heat * lerp(0.42, 1.0, Math.min(1, hot * 1.3)); st.e[1] = heat * lerp(0.04, 0.85, hot * hot); st.e[2] = heat * lerp(0.85, 1.0, hot);
  });
  corePart.material = lib.material('gore', { ...coreTex, emissive: [1, 1, 1] });

  // ---- wings: dark leathery membrane on both faces (grey-brown, mottled, a net of dark veins, thinner and redder
  // between them with a faint red translucency glow), wrinkles running along the finger bones, ragged rips cut in
  // from the trailing edge and torn holes (alpha), the trailing edge frayed; the folded bundle darker still, in
  // pleats; the bones dark horn with paler worn knuckles and black claws
  const inRect = (u, v, r) => u >= r[0] && u <= r[2] && v >= r[1] && v <= r[3];
  const rips = [WUV.p1, WUV.p2, WUV.p3, WUV.p4].map((r, pi) => {
    const out = [], n = pi === 3 ? 3 : 2;
    for (let k = 0; k < n; k++) out.push({ c: 0.2 + 0.6 * (k + hash(pi * 17 + k * 5)) / n, d: 0.18 + 0.28 * hash(pi * 23 + k * 7), w: 0.035 + 0.04 * hash(pi * 29 + k * 11) });
    return out;
  });
  const wingTex = paintPart(wingPart, { size: 1024, normalSize: 1024, ormSize: 256, rough: 0.62, normalStrength: 2.4, emissive: true, emissiveSize: 256 }, (P, Nn, st, u, v) => {
    if (u >= 0.745) {
      if (inRect(u, v, WUV.claw) || inRect(u, v, WUV.fclaw)) {
        const t = clamp01((u - 0.75) / 0.25);
        set(st.c, mix3(lin([46, 40, 36]), lin([18, 15, 14]), ss(0.2, 0.9, t)));
        over(st.c, lin([96, 86, 74]), ss(0.88, 1, t) * 0.4);
        st.h = Math.sin(t * 50 + N.noise(P[0] * 90, P[1] * 90, P[2] * 90) * 2) * 0.15;
        st.ro = 0.38;
        return;
      }
      // horn-bone: grey-brown, darker towards the tips, streaked lengthwise (no blotches)
      const t = clamp01((u - 0.75) / 0.25), k = ss(-0.4, 0.6, N.fbm(P[0] * 14, P[1] * 14, P[2] * 14, 2));
      set(st.c, mix3(lin([146, 130, 110]), lin([92, 80, 70]), k * 0.6 + 0.4 * t));
      over(st.c, lin([70, 56, 48]), ss(0.55, 0.9, N.ridged(P[0] * 30, P[1] * 30, P[2] * 30, 2)) * 0.3);
      if (inRect(u, v, WUV.knob)) over(st.c, lin([168, 152, 128]), 0.3 * ss(-0.2, 0.4, N.noise(P[0] * 60, P[1] * 60, P[2] * 60)));
      st.h = N.fbm(P[0] * 140, P[1] * 140, P[2] * 140, 3) * 0.35 + ss(0.6, 0.9, N.ridged(P[0] * 60, P[1] * 60, P[2] * 60, 2)) * 0.3;
      st.ro = lerp(0.42, 0.64, k);
      return;
    }
    let along = 0, across = 0, E = 0, T = 0, pi = -1, fold = false;
    [WUV.p1, WUV.p2, WUV.p3].forEach((r, k) => { if (inRect(u, v, r)) { along = (u - r[0]) / (r[2] - r[0]); across = (v - r[1]) / (r[3] - r[1]); E = along; T = across; pi = k; } });
    if (inRect(u, v, WUV.p4)) { along = (u - WUV.p4[0]) / (WUV.p4[2] - WUV.p4[0]); across = (v - WUV.p4[1]) / (WUV.p4[3] - WUV.p4[1]); E = across * ss(0.42, 0.52, along) * (1 - ss(0.93, 0.99, along)); T = along; pi = 3; }
    for (const r of WUV.f) if (inRect(u, v, r)) { fold = true; along = (u - r[0]) / (r[2] - r[0]); across = (v - r[1]) / (r[3] - r[1]); }
    // leather: dark grey-brown, mottled; thinner, redder membrane between the veins
    const m = N.fbm(P[0] * 7, P[1] * 7, P[2] * 7, 3);
    set(st.c, mix3(lin([90, 74, 72]), lin([56, 44, 46]), ss(-0.4, 0.5, m)));
    const vein = ss(0.62, 0.88, N.ridged(P[0] * 12, P[1] * 12, P[2] * 12, 3)), fine = ss(0.7, 0.92, N.ridged(P[0] * 38 + 3, P[1] * 38, P[2] * 38, 2));
    const thin = (1 - vein) * (1 - 0.6 * fine) * ss(0.04, 0.22, Math.min(across, 1 - across)) * ss(0.1, 0.6, N.fbm(P[0] * 3 + 4, P[1] * 3, P[2] * 3, 2) + 0.3);
    over(st.c, lin([92, 54, 52]), thin * 0.32);
    over(st.c, lin([30, 17, 21]), vein * 0.8 + fine * 0.35);
    // wrinkles along the bones, skin grain, scars
    st.h = vein * 1.0 + fine * 0.35 + N.fbm(P[0] * 110, P[1] * 110, P[2] * 110, 3) * 0.28 + Math.sin(across * 64 + N.noise(P[0] * 18, P[1] * 18, P[2] * 18) * 3) * 0.12 * (1 - ss(0.0, 0.2, Math.min(across, 1 - across)) * 0.6);
    st.ro = lerp(0.5, 0.74, ss(-0.3, 0.4, m));
    mul(st.c, [0.78, 0.74, 0.72], ss(0.2, 0.7, N.fbm(P[0] * 12 + 9, P[1] * 12, P[2] * 12, 3)) * 0.45);
    if (fold) {
      // the folded bundle: darker, the pleats shaded in their creases
      const pl = 0.5 + 0.5 * Math.cos(across * Math.PI * 10);
      mul(st.c, [0.72, 0.66, 0.66], 1);
      mul(st.c, [0.62, 0.58, 0.58], pl * 0.6);
      st.h += pl * 0.4 + Math.sin(along * 30) * 0.1;
      st.ao = 1 - pl * 0.35;
      return;
    }
    st.e[0] = thin * 0.045; st.e[1] = thin * 0.01; st.e[2] = thin * 0.009;
    // rips cut in from the trailing edge (wedges, ragged), torn holes, the frayed trailing edge
    const jag = N.fbm(P[0] * 34, P[1] * 34, P[2] * 34, 3) * 0.022;
    let cut = false, rim = 0;
    for (const r of rips[pi] || []) {
      const depth = E - (1 - r.d);
      if (depth <= 0) continue;
      const half = r.w * depth / r.d, dd = Math.abs(T - r.c + jag);
      if (dd < half) cut = true;
      else rim = Math.max(rim, 1 - ss(0, 0.03, dd - half));
    }
    const hw = N.worley(P[0] * 5, P[1] * 5, P[2] * 5), dens = ss(0.1, 0.5, N.fbm(P[0] * 2 + 1, P[1] * 2, P[2] * 2, 2));
    const holeR = (0.06 + 0.05 * dens) * (1 + 3 * N.fbm(P[0] * 26, P[1] * 26, P[2] * 26, 2) * 0.3);
    const nearBone = Math.min(across, 1 - across) < 0.1;
    if (hw < holeR && dens > 0.3 && !nearBone) cut = true;
    else if (dens > 0.3 && !nearBone) rim = Math.max(rim, 1 - ss(holeR, holeR + 0.05, hw));
    const edgeCut = 0.94 - 0.06 * (0.5 + 0.5 * N.fbm(P[0] * 18, P[1] * 18, P[2] * 18, 3)) - 0.05 * Math.max(0, N.noise(P[0] * 6, P[1] * 6, P[2] * 6));
    if (cut || E > edgeCut) { st.a = 0; return; }
    rim = Math.max(rim, ss(edgeCut - 0.05, edgeCut, E));
    over(st.c, lin([26, 14, 16]), rim * 0.7);
    st.h += rim * 0.5; st.e[0] *= 1 - rim;
  });
  wingPart.material = lib.material('skin', { ...wingTex, alpha: wingTex.alpha, doubleSided: true, pngBits: 6, emissive: [1, 1, 1] });

  // ===================================================================== SCALE + BONES
  const parts = [body, suit, eyes, fangPart, bonePart, sporePart, corePart, wingPart];
  for (const p of parts) console.log('  part', p.name.padEnd(10), p.triCount(), 'tris');
  const S = REST_HEIGHT / h.height;
  // anchors (human scale) for the capsules, taken before scaling
  let headTop = [0, 0, 0], chin = [0, 9, 0];
  {
    const hi = sk.head.index;
    for (const v of h.baseObj.groupVerts('body')) {
      const wH = h.weights[v].reduce((a, [b, w]) => a + (b === hi ? w : 0), 0);
      if (wH < 0.5) continue;
      const p = [h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]];
      if (p[1] > headTop[1]) headTop = p;
      if (Math.abs(p[0]) < 0.03 && p[2] > sk.head.head.z + 0.02 && p[1] < chin[1]) chin = p;
    }
  }
  const coreC = coreInfo.c, coreN = coreInfo.n;
  scaleCharacter(h, parts, S);
  const F = (p) => p.map((x) => x * S);
  console.log('  scale', S.toFixed(3), 'height', h.height.toFixed(3));
  const byName = h.skeleton.byName;
  const BP = (n) => byName[n].head.clone();
  for (const s of ['l', 'r']) FOLD_PIVOTS[s] = V(byName['wing_' + s].head);
  addHelperBone(h, 'head_top', 'head', F(add(headTop, [0, -0.04, -0.01])));
  addHelperBone(h, 'chin', 'head', F(add(chin, [0, 0.035, -0.03])));
  // weak point: a capsule through the core from behind it to its front surface (the glow bulges ~6 cm proud of
  // the sternum); the torso is split in two capsules that both stay BEHIND the core's front: the belly ends well
  // below it, the upper torso's axis runs behind the spine
  const coreY = coreC[1];
  addHelperBone(h, 'core_back', 'spine_03', F(madd(coreC, coreN, -0.05)));
  addHelperBone(h, 'core_front', 'spine_03', F(madd(coreC, coreN, 0.06)));
  addHelperBone(h, 'torso_lo', 'spine_01', F([0, yS1 + 0.02, spineZ(yS1) + 0.02]));
  addHelperBone(h, 'torso_mid', 'spine_02', F([0, coreY - 0.17, spineZ(coreY - 0.17) + 0.01]));
  addHelperBone(h, 'chest_lo', 'spine_03', F([0, coreY - 0.07, spineZ(coreY - 0.07) - 0.07]));
  addHelperBone(h, 'chest_hi', 'spine_03', F([0, yN - 0.1, spineZ(yN - 0.1) - 0.05]));
  addHelperBone(h, 'pelvis_top', 'pelvis', BP('pelvis').lerp(BP('spine_01'), 0.4).toArray());

  // ---- capsule hitboxes [bone, radius m, toBone]. The game takes the capsule a ray enters FIRST: the chest
  // capsule (weak point) is the core itself, sitting proud of the torso capsule so frontal shots at the glowing core
  // hit it; the back / flanks belong to the torso ('belly'). The head capsule runs from the chin to the crest.
  const ownerOf = (bn) => {
    if (bn === 'head' || bn === 'neck_01') return 'head';
    if (/^(spine_0[123]|clavicle)/.test(bn)) return 'belly';
    if (bn === 'pelvis' || bn === 'Root') return 'pelvis';
    if (/^(thumb|index|middle|ring|pinky)/.test(bn)) return 'hand' + bn.slice(-2);
    if (bn.startsWith('ball')) return 'foot' + bn.slice(4);
    return bn;
  };
  const owned = {};
  for (const part of parts) {
    if (part.name === 'wings' || part.name === 'spores') continue;
    for (const v of new Set(Array.from(part.tris()).filter((_, i) => i % 2 === 0))) {
      const name = part.name === 'core' ? 'chest' : ownerOf(bones[part.weights[v][0][0]].name);
      (owned[name] ||= []).push(new THREE.Vector3(part.pos[v * 3], part.pos[v * 3 + 1], part.pos[v * 3 + 2]));
    }
  }
  const dSeg = (p, a, b) => new THREE.Line3(a, b).closestPointToPoint(p, true, new THREE.Vector3()).distanceTo(p);
  const pct = (a, q) => { const s2 = [...a].sort((x, y) => x - y); return s2[Math.min(s2.length - 1, Math.floor(s2.length * q))]; };
  const radius = (name, a, b, q = 0.8) => (owned[name]?.length ? pct(owned[name].map((p) => dSeg(p, a, b)), q) : 0.2);
  const HB = {
    head: ['chin', 'head_top'], chest: ['core_back', 'core_front'], belly: ['torso_lo', 'torso_mid'], torso: ['chest_lo', 'chest_hi'], pelvis: ['pelvis', 'pelvis_top'],
    upperarm_l: ['upperarm_l', 'lowerarm_l'], lowerarm_l: ['lowerarm_l', 'hand_l'], hand_l: ['hand_l', 'middle_02_l'],
    upperarm_r: ['upperarm_r', 'lowerarm_r'], lowerarm_r: ['lowerarm_r', 'hand_r'], hand_r: ['hand_r', 'middle_02_r'],
    thigh_l: ['thigh_l', 'calf_l'], calf_l: ['calf_l', 'foot_l'], foot_l: ['foot_l', 'ball_l'],
    thigh_r: ['thigh_r', 'calf_r'], calf_r: ['calf_r', 'foot_r'], foot_r: ['foot_r', 'ball_r'],
    wing_l: ['wing_l', 'wing_elbow_l'], wingarm_l: ['wing_elbow_l', 'wing_wrist_l'], wing_r: ['wing_r', 'wing_elbow_r'], wingarm_r: ['wing_elbow_r', 'wing_wrist_r'],
  };
  const hitboxes = {}, capsules = {};
  for (const [name, [b0, b1]] of Object.entries(HB)) {
    const a = BP(b0), b = BP(b1);
    let r;
    if (name === 'chest') r = 0.52;
    else if (name === 'belly' || name === 'torso') {
      // the 'belly' owners split at the capsule boundary; each radius is kept behind the core's front surface
      const yCut = F([0, coreY - 0.11, 0])[1];
      const pts = (owned.belly || []).filter((p) => (name === 'belly' ? p.y < yCut : p.y >= yCut));
      r = pts.length ? pct(pts.map((p) => dSeg(p, a, b)), 0.72) : 0.8;
      const front = new THREE.Vector3(...F(madd(coreC, coreN, 0.075)));
      r = Math.min(r, dSeg(front, a, b) - 0.04 * S);
      // and the upper torso stays clear of the head and jaw (scream / stagger throw the head back over it)
      if (name === 'torso') r = Math.min(r, 1.0, dSeg(new THREE.Vector3(...F(chin)), a, b) - 0.05 * S);
    }
    else if (name.startsWith('wing')) r = name.startsWith('wingarm') ? 0.3 : 0.38;
    else r = radius(name, a, b, name === 'head' ? 0.85 : name === 'belly' ? 0.72 : 0.8);
    hitboxes[name] = [b0, +r.toFixed(3), b1];
    capsules[name] = { bone: b0, to: b1, radius: +r.toFixed(3), length: +a.distanceTo(b).toFixed(3) };
  }
  console.log('  hitboxes', Object.entries(hitboxes).map(([k, v]) => `${k}:${v[1]}`).join(' '));
  // self-check (rest pose): which capsule does a ray enter first?
  {
    const caps = Object.entries(hitboxes).map(([name, [b0, r, b1]]) => ({ name, a: BP(b0), b: BP(b1), r }));
    const first = (o, d) => {
      let best = null;
      for (const c of caps) for (let t = 0; t < 30; t += 0.01) { const p = o.clone().addScaledVector(d, t); if (dSeg(p, c.a, c.b) <= c.r) { if (!best || t < best.t) best = { t, name: c.name }; break; } }
      return best?.name;
    };
    const cc = new THREE.Vector3(...F(coreC)), hc = BP('head').lerp(BP('head_top'), 0.4);
    const eye = (x, z) => new THREE.Vector3(x, 1.7, z);
    const tests = {
      'core from the front (eye height, 10 m)': [eye(0, cc.z + 10), cc.clone().sub(eye(0, cc.z + 10)).normalize()],
      'core edge (+0.35 m)': [eye(0.35, cc.z + 10), cc.clone().add(new THREE.Vector3(0.35, 0, 0)).sub(eye(0.35, cc.z + 10)).normalize()],
      'core +0.3 m up': [eye(0, cc.z + 10), cc.clone().add(new THREE.Vector3(0, 0.3, 0)).sub(eye(0, cc.z + 10)).normalize()],
      'core -0.3 m down': [eye(0, cc.z + 10), cc.clone().add(new THREE.Vector3(0, -0.3, 0)).sub(eye(0, cc.z + 10)).normalize()],
      'core from 6 m (steep)': [eye(0, cc.z + 6), cc.clone().sub(eye(0, cc.z + 6)).normalize()],
      'pecs (0.9 m off the core)': [eye(0.9, cc.z + 10), cc.clone().add(new THREE.Vector3(0.9, 0.2, 0)).sub(eye(0.9, cc.z + 10)).normalize()],
      'upper back (from behind)': [eye(0, -10), cc.clone().setZ(0).sub(eye(0, -10)).normalize()],
      'head (front, 12 m)': [eye(0, 12), hc.clone().sub(eye(0, 12)).normalize()],
    };
    console.log('  first capsule hit:', Object.entries(tests).map(([k, [o, d]]) => `${k} -> ${first(o, d)}`).join('; '));
  }
  // the library clips (retargeted by pelvis-height ratio) sink this short-legged, big-footed body ~13 cm into the
  // floor in idle and more at the walk's push-off: the MESH is raised against the skeleton (every clip carries the
  // soles up by that much; only the bind pose floats)
  for (const a of new Set([h.pos, ...parts.map((p) => p.pos)])) for (let i = 1; i < a.length; i += 3) a[i] += MESH_LIFT;
  h.height += MESH_LIFT; h.headTop = h.height;
  const wingSpan = (() => { let mn = 0, mx = 0; for (let i = 0; i < wingPart.pos.length; i += 3) { mn = Math.min(mn, wingPart.pos[i]); mx = Math.max(mx, wingPart.pos[i]); } return mx - mn; })();
  console.log('  wingspan (spread)', wingSpan.toFixed(2), 'm');

  // (no runtime poseOffsets: the posture is baked into the rest pose, see POSTURE / bakePose)
  return {
    human: h, parts, budget: 24000, partBudget: { body: 8800, trousers: 1400 },
    extras: {
      // height = top of the standing idle pose (what the game and the viewer frame), restHeight = the bind pose
      height: IDLE_TOP, restHeight: +h.height.toFixed(3),
      hitboxes, capsules, archetype: 'boss', gender: 'male', boss: 'colossus', bakedPosture: { local: POSTURE, armsWorld: POSTURE_ARMS },   // already in the rest pose: NOT runtime offsets
      weakPoints: { chest: 'the glowing core in the split sternum (front only)', head: 'the head and jaw' },
      // wing nodes ship at scale 0.01 (hidden in the back); brains/colossus.js scales them to 1 when it metamorphoses
      wings: { nodes: WING_NODES, restScale: WING_REST_SCALE, span: +wingSpan.toFixed(2),
        // the folded wings (on the back) are visible at node scale 0.01 and collapse into the pivots at 1 (IBM patch)
        fold: { joints: ['wing_fold_l', 'wing_fold_r', 'wing_sheath_l', 'wing_sheath_r', 'wing_sheath2_l', 'wing_sheath2_r'], k: +FOLD_K.toFixed(5), c: +FOLD_C.toFixed(5) },
        // helper chain for procedural flapping: wing_* -> wing_elbow_* -> wing_wrist_* (fingers + outer membrane)
        flap: ['wing_elbow_l', 'wing_wrist_l', 'wing_elbow_r', 'wing_wrist_r'] },
      // boss budget (validate.mjs reads it): LOD0 up to 24k; LOD1 is never shown for bosses (manager.js keeps LOD0)
      triBudget: { lod0: 24000, lod1: 6000 },
      // for a brain that wants to pulse them: these meshes carry the emissive glow (spore sacs green, core violet)
      glow: { spores: [0.55, 1, 0.15], core: [0.85, 0.35, 1] },
    },
    lod1: { budget: 6000, texScale: 0.25, drop: ['eyes'], partBudget: { body: 2300, trousers: 400, wings: 900, bones: 700, spores: 700, teeth: 300, core: 300 } },
  };
}
