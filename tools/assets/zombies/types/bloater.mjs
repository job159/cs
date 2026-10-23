// bloater — 爆裂者 BLOATER (game/src/zombies/defs.js `bloater`: a slow special that explodes on death into a poison
// cloud; a headshot kill deflates it instead). 1.80 m. A morbidly obese man in the bloat stage of decay, swollen with
// gas until his skin is splitting: a huge, taut, glossy dome of a belly (MakeHuman weight / pregnant targets plus our
// own sculpt: a round dome from under the chest to below the navel, asymmetric gas pockets, love handles, a back roll,
// a fatty chest, a buffalo hump, the lower belly hanging over the belt; the visible dome smooth-subdivided before the
// region simplification), oedematous fat arms ("bingo wings"), sausage fingers and swollen hands, a fat face (jowls
// sagging off the jaw, a double chin hanging over the collar, a thick neck) with swollen-shut slit eyes glowing
// yellow-green, everted violet lips and a swollen, rounded wet tongue lolling out over the lower lip, bile drooling
// down the chin; bald with a cropped grey fringe.
// Skin: grey-olive corpse base with the bloat colours (putrefaction green over the belly and patchy on the face /
// scalp, big dusky purple-violet patches, a dark branching venous "marbling" network over trunk AND head, livor on the
// back), stretch-mark striae on the belly's flanks, skin slippage (raw glossy dermis under curled dead skin), ~45 boils
// (the big ones sculpted as inflamed mounds into the mesh) with tight translucent pus heads and hundreds of tiny
// pustules — all GLOWING (emissive) — and three ruptures torn into the belly by the pressure (irregular, branching,
// different lengths and directions: raised raw lips, a wet dark margin, hairline cracks, glowing meat inside that
// dims where each tear pinches out), oozing drips: the "about to burst" read at 15-25 m. Roughness: dry stretched
// skin 0.58-0.76, glossy only over the dome and wet spots.
// Clothes: the CC0 male_casualsuit01 split in two parts. A washed-out blue chambray work shirt (blue against the olive
// skin and the tan trousers, so the shirt never merges with the body) ripped open by the belly from the second button
// down (lens-shaped rip, ragged frayed edges, 2 of 6 buttons left, thread tufts, slit buttonholes), the back seam
// split, the right sleeve ripped off above the elbow with a seam split over a boil, the left torn below the elbow;
// sweat rings, bile down the front edges, pus soaked through over the boils. Skin is kept under every tear (no dark
// shirt interior through the holes), the shirt is pushed 5-7 mm out of the sculpted skin (collar over the hump), its
// UV islands re-packed (1792 px at the old 2048 px density). Dusty tan work trousers whose front + belt dip under the
// hanging belly (fitted BEFORE the overhang sculpt, the waistband faces under the belly dropped; skin under them found
// by an exit-ray test, which also removes the sock tops inside the cuffs), purge-fluid streaks down the thighs.
// Scuffed casual leather shoes (shoes02) with a derived normal + ORM.
//
// Rig / animation: the dome hangs on its own `belly` bone (child of the pelvis, never keyed by the library clips;
// the gut_lo / gut_hi hitbox helpers ride on it), so the spine bend cannot fold or squash it and the game can scale /
// jiggle it. The shared clips carry a zombie hunch (idle: spine_02 +54 / spine_03 +28 deg): extras.poseOffsets
// straighten the spine for the upright clips, and extras.poseOffsetsByClip overrides them per clip (walk_limp: a light
// lean; attack_a/b: chest up over the dome, upper arms abducted ~30 deg so the rake passes outside it; death_back /
// knockdown / get_up: no spine correction; death_front / crawls: propped on the dome, pelvis pitched up 32 deg).
// The game blends those sets by the mixer's action weights (game/src/zombies/manager.js Zombie.applyClipPose).
//
// Everything specific to this character lives in this file; the shared lib is imported read-only. Implemented here:
// sculpt() (free-form base-mesh edits + skeleton rebuild), reweightBelly() + bellyBone(), keepIslands() (one suit ->
// shirt / trousers parts with cropped UV atlases) + repackIslands(), subdivideRegion() (smooth PN-style 1-to-4 split
// of the dome), simplifyRegions() (cranium / face / hands / trunk / rest budgets in one watertight mesh with a normal
// transfer from the full-resolution mesh), the tongue tube, all the painters, the emissive bake, ray-traced AO into the
// ORM occlusion ONLY (never the albedo), hitbox capsules on helper bones (a vertical belly capsule through the dome, a
// horizontal chest, head to under the crown) with a ray self-check.
// Albedo (tools/assets/zombies/albedo.mjs): skin ~110, shirt ~118, trousers ~95, shoes ~72.
// BLOATER_FAST=1: flat materials (silhouette / skinning iterations in seconds); BLOATER_POSE='{"spine_02":[..]}' /
// BLOATER_POSE_CLIPS='{"death_front":{..}}' override the pose offsets for look-dev; BLOATER_DUMP=<dir> writes the
// shirt textures there.
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { MeshoptSimplifier } from 'meshoptimizer';
import { rasterUV, texelSurface, texelAttr } from '../lib/raster.mjs';
import { blurField, normalFromHeight, createImage } from '../lib/image.mjs';
import { boneSegment, buildSkeleton } from '../lib/rig.mjs';
import { albedoTracer } from '../lib/albedoTrace.mjs';

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
const TAG = '  bloater:';

// ---------------------------------------------------------------- colour helpers (linear light, sRGB storage)
const S2L = new Float32Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const toByte = (x) => { x = Math.max(0, x); const s = x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(s * 255))); };
const lin = (rgb) => rgb.map((v) => S2L[v]);
const lum = (c) => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
const over = (c, k, a) => { if (!(a > 0)) return; a = Math.min(1, a); for (let i = 0; i < 3; i++) c[i] += (k[i] - c[i]) * a; };
const mul = (c, k, a) => { if (!(a > 0)) return; a = Math.min(1, a); for (let i = 0; i < 3; i++) c[i] *= 1 + (k[i] - 1) * a; };
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const hash = (i) => { let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
const texSize = (s) => Math.max(64, Math.round(s * +(process.env.ZOMBIE_TEX_SCALE || 1)));
const FAST = !!process.env.BLOATER_FAST;   // silhouette iterations: flat materials, no painting

/** Per-texel grade of an RGBA image in place: fn(c linear rgb, u, v, alpha, x, y) mutates c. */
function grade(img, fn) {
  const { width: W, height: H, data } = img;
  const c = [0, 0, 0];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    c[0] = S2L[data[i]]; c[1] = S2L[data[i + 1]]; c[2] = S2L[data[i + 2]];
    fn(c, (x + 0.5) / W, (y + 0.5) / H, data[i + 3], x, y);
    data[i] = toByte(c[0]); data[i + 1] = toByte(c[1]); data[i + 2] = toByte(c[2]);
  }
  return img;
}

/** Box-downsamples a float field S x S -> D x D (ch channels interleaved). */
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

/** Crops the UV rect [u0, v0, u1, v1] (OBJ convention, v up) out of an image and resizes it to size x size. */
function cropUV(img, r, size, resize) {
  const W = img.width, H = img.height;
  const x0 = Math.floor(r[0] * W), x1 = Math.ceil(r[2] * W), y0 = Math.floor((1 - r[3]) * H), y1 = Math.ceil((1 - r[1]) * H);
  const w = x1 - x0, h = y1 - y0;
  const out = createImage(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = ((y + y0) * W + x + x0) * 4, d = (y * w + x) * 4;
    for (let c = 0; c < 4; c++) out.data[d + c] = img.data[s + c];
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
    const ax = [a[0] + d[0] * tc, a[1] + d[1] * tc, a[2] + d[2] * tc];
    return { t, d: dist(P, ax), L, a: ax };
  };
}

/**
 * Paints a part through its own UV raster. fn(P, N, st, u, v, i) sets st.c (linear rgb), st.h (height), st.ro
 * (roughness), st.me (metalness), st.e (emissive rgb, linear). -> { albedo, normal, orm, emissiveMap }
 */
function paintPart(part, o, fn) {
  const S = texSize(o.size);
  const tris = part.tris(), nrm = part.normals();
  const r = rasterUV(tris, part.obj.uvs, S, o.pad ?? 6);
  const albedo = createImage(S, S, [0, 0, 0, 255]);
  const H = new Float32Array(S * S), RO = new Float32Array(S * S).fill(o.rough ?? 0.8), ME = new Float32Array(S * S);
  const EM = o.emissive ? new Float32Array(S * S * 3) : null;
  const P = [0, 0, 0], Nn = [0, 0, 0];
  const st = { c: [0, 0, 0], h: 0, ro: 0, me: 0, e: [0, 0, 0] };
  for (let i = 0; i < S * S; i++) {
    if (!texelSurface(r, tris, part.pos, nrm, i, P, Nn)) continue;
    st.c[0] = st.c[1] = st.c[2] = 0.5; st.h = 0; st.ro = o.rough ?? 0.8; st.me = 0; st.e[0] = st.e[1] = st.e[2] = 0;
    fn(P, Nn, st, ((i % S) + 0.5) / S, 1 - (((i / S) | 0) + 0.5) / S, i);
    const d = i * 4;
    albedo.data[d] = toByte(st.c[0]); albedo.data[d + 1] = toByte(st.c[1]); albedo.data[d + 2] = toByte(st.c[2]);
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
  return { albedo, normal, orm, emissiveMap };
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

/** Applies fn(c, ...values) to an albedo image from fields baked at R x R (colour-only detail). */
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

// ---------------------------------------------------------------- custom geometry -> skinned Part
class Geo {
  constructor() { this.P = []; this.UV = []; this.F = []; this.W = []; this.weld = null; }
  v(p, uv, w = null) { this.P.push(p[0], p[1], p[2]); this.UV.push(uv[0], uv[1]); this.W.push(w); return this.P.length / 3 - 1; }
  tri(a, b, c) { this.F.push({ v: [this.weld?.[a] ?? a, this.weld?.[b] ?? b, this.weld?.[c] ?? c], t: [a, b, c], g: 0 }); }
  quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }
  get n() { return this.P.length / 3; }
}
function rot(v, ax, ang) { // Rodrigues
  const c = Math.cos(ang), s = Math.sin(ang), d = dot(ax, v), cr = cross(ax, v);
  return [v[0] * c + cr[0] * s + ax[0] * d * (1 - c), v[1] * c + cr[1] * s + ax[1] * d * (1 - c), v[2] * c + cr[2] * s + ax[2] * d * (1 - c)];
}

/**
 * Tube along a polyline: radius(t) (or number), `sides` around, parallel-transport frames, optional flattening
 * (scale of the frame's first axis) and a rounded tip cap. uv rect [u0,v0,u1,v1] (u along the tube, v around).
 */
function tube(g, pts, radius, sides, uvr, w = null, { ref = [0, 1, 0], flat = 1, tip = false } = {}) {
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
  g.weld ||= {};
  for (let i = 0; i < n; i++) g.weld[start + i * (sides + 1) + sides] = start + i * (sides + 1);
  for (let i = 0; i < n; i++) {
    const r = typeof radius === 'function' ? radius(i / (n - 1), i) : radius;
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const d = add(scl(frames[i][0], Math.cos(a) * flat), scl(frames[i][1], Math.sin(a)));
      g.v(madd(pts[i], d, r), [lerp(uvr[0], uvr[2], i / (n - 1)), lerp(uvr[1], uvr[3], k / sides)], typeof w === 'function' ? w(i / (n - 1), pts[i]) : w);
    }
  }
  for (let i = 0; i + 1 < n; i++) for (let k = 0; k < sides; k++) {
    const a = start + i * (sides + 1) + k, b = a + sides + 1;
    g.quad(a, a + 1, b + 1, b);
  }
  if (tip) {
    const last = start + (n - 1) * (sides + 1);
    const tp = madd(pts[n - 1], T[n - 1], (typeof radius === 'function' ? radius(1, n - 1) : radius) * (tip === true ? 0.6 : tip));
    const ci = g.v(tp, [uvr[2], (uvr[1] + uvr[3]) / 2], typeof w === 'function' ? w(1, pts[n - 1]) : w);
    for (let k = 0; k < sides; k++) g.tri(last + k, last + k + 1, ci);
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

/** UV islands of a part: island id per face (union-find over shared UV corners). */
function uvIslands(part) {
  const F = part.obj.faces;
  const par = new Int32Array(part.obj.uvs.length / 2).map((_, i) => i);
  const find = (a) => { while (par[a] !== a) a = par[a] = par[par[a]]; return a; };
  for (const f of F) for (let k = 1; k < f.t.length; k++) { const a = find(f.t[0]), b = find(f.t[k]); if (a !== b) par[a] = b; }
  return F.map((f) => find(f.t[0]));
}

/**
 * Sculpts the morphed base mesh with fn(p metres, isBody, i) -> p for EVERY base vertex (joint helper cubes
 * included, so the rebuilt skeleton follows the new shape), then rebuilds the skeleton. Parts fitted BEFORE a
 * sculpt keep their positions (used on purpose: the trousers are fitted before the belly overhang).
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
 * Region-weighted simplification of a MakeHuman-topology Part: each pass simplifies one region with every other
 * vertex locked (meshoptimizer vertex_lock), so the regions keep their own triangle budgets and still share one
 * watertight mesh. Returns a new Part on the SAME vertex indexing (pos, weights, seg, binding unchanged; only
 * faces / per-corner UVs change), marked noSimplify, with the full-resolution normals transferred.
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
  const uvs = new Float32Array(nv * 2);
  for (let i = 0; i < nv; i++) { uvs[i * 2] = r.uv[i * 2]; uvs[i * 2 + 1] = 1 - r.uv[i * 2 + 1]; }
  const faces = [];
  for (let t = 0; t < idx.length; t += 3) faces.push({ v: [r.src[idx[t]], r.src[idx[t + 1]], r.src[idx[t + 2]]], t: [idx[t], idx[t + 1], idx[t + 2]], g: 0 });
  const obj = { ...part.obj, uvs, faces };
  const out = new lib.Part({ name: part.name, role: part.role, obj, pos: part.pos, refIdx: part.refIdx, refW: part.refW });
  out.weights = part.weights; out.seg = part.seg;
  const hiN = part.normals();
  out.normals = () => hiN;
  out.extras.noSimplify = true;
  return out;
}

/**
 * Smooth 1-to-4 subdivision of the kept faces of `part` that pass faceTest(face): edge midpoints on cubic Hermite
 * curves built from the smooth vertex normals (PN-triangle style) and Coons-patch quad centres, so the region's
 * silhouette rounds out instead of only gaining flat facets; the simplifier then spends the region's budget where
 * the curvature needs it. Neighbouring plain faces that share a split edge get the midpoint too (no T-junction
 * cracks). Returns a new Part: old vertex indices kept, new vertices appended (weights blended, segment from them).
 */
function subdivideRegion(lib, part, faceTest, bones) {
  const n0 = part.nVerts, nrm = part.normals();
  const P = Array.from(part.pos), UV = Array.from(part.obj.uvs), Wt = part.weights.slice();
  const vp = (i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
  const mergeW = (list) => {
    const m = new Map();
    for (const [ws, k] of list) for (const [b, w] of ws) m.set(b, (m.get(b) || 0) + w * k);
    const a = [...m].sort((x, y) => y[1] - x[1]).slice(0, 4), sum = a.reduce((q, [, w]) => q + w, 0) || 1;
    return a.map(([b, w]) => [b, w / sum]);
  };
  const addV = (p, w) => { P.push(p[0], p[1], p[2]); Wt.push(w); return P.length / 3 - 1; };
  const addT = (uv) => { UV.push(uv[0], uv[1]); return UV.length / 2 - 1; };
  const vMid = new Map(), tMid = new Map();
  const key = (a, b) => (a < b ? a * 4194304 + b : b * 4194304 + a);
  const edgeV = (a, b) => {
    const k = key(a, b);
    if (vMid.has(k)) return vMid.get(k);
    const pa = vp(a), pb = vp(b), na = [nrm[a * 3], nrm[a * 3 + 1], nrm[a * 3 + 2]], nb = [nrm[b * 3], nrm[b * 3 + 1], nrm[b * 3 + 2]];
    const e = sub(pb, pa), f = scl(e, -1);
    const c1 = add(pa, scl(sub(e, scl(na, dot(e, na))), 1 / 3)), c2 = add(pb, scl(sub(f, scl(nb, dot(f, nb))), 1 / 3));
    const m = addV(scl(add(add(pa, pb), scl(add(c1, c2), 3)), 1 / 8), mergeW([[Wt[a], 0.5], [Wt[b], 0.5]]));
    vMid.set(k, m);
    return m;
  };
  const edgeT = (a, b) => {
    const k = key(a, b);
    if (!tMid.has(k)) tMid.set(k, addT([(UV[a * 2] + UV[b * 2]) / 2, (UV[a * 2 + 1] + UV[b * 2 + 1]) / 2]));
    return tMid.get(k);
  };
  const F = part.obj.faces, sel = F.map((f, fi) => !!part.keep[fi] && faceTest(f));
  // pass 1: midpoints on every edge of the selected faces
  F.forEach((f, fi) => { if (sel[fi]) for (let i = 0; i < f.v.length; i++) { const j = (i + 1) % f.v.length; edgeV(f.v[i], f.v[j]); edgeT(f.t[i], f.t[j]); } });
  const faces = [];
  let nSub = 0, nFix = 0;
  F.forEach((f, fi) => {
    if (!part.keep[fi]) return;
    const k = f.v.length;
    if (sel[fi]) {
      nSub++;
      const mv = [], mt = [];
      for (let i = 0; i < k; i++) { const j = (i + 1) % k; mv.push(edgeV(f.v[i], f.v[j])); mt.push(edgeT(f.t[i], f.t[j])); }
      if (k === 4) {
        const cp = sub(scl(mv.reduce((q, m) => add(q, vp(m)), [0, 0, 0]), 0.5), scl(f.v.reduce((q, v) => add(q, vp(v)), [0, 0, 0]), 0.25));
        const c = addV(cp, mergeW(f.v.map((v) => [Wt[v], 0.25])));
        const ct = addT([f.t.reduce((q, t) => q + UV[t * 2], 0) / 4, f.t.reduce((q, t) => q + UV[t * 2 + 1], 0) / 4]);
        for (let i = 0; i < 4; i++) { const h = (i + 3) % 4; faces.push({ v: [f.v[i], mv[i], c, mv[h]], t: [f.t[i], mt[i], ct, mt[h]], g: f.g }); }
      } else {
        faces.push({ v: [f.v[0], mv[0], mv[2]], t: [f.t[0], mt[0], mt[2]], g: f.g }, { v: [mv[0], f.v[1], mv[1]], t: [mt[0], f.t[1], mt[1]], g: f.g },
          { v: [mv[2], mv[1], f.v[2]], t: [mt[2], mt[1], f.t[2]], g: f.g }, { v: [mv[0], mv[1], mv[2]], t: [mt[0], mt[1], mt[2]], g: f.g });
      }
      return;
    }
    // a plain face with split edges: insert the midpoints into its outline, fan from the first one
    const lv = [], lt = [];
    let first = -1;
    for (let i = 0; i < k; i++) {
      const j = (i + 1) % k;
      lv.push(f.v[i]); lt.push(f.t[i]);
      const m = vMid.get(key(f.v[i], f.v[j]));
      if (m !== undefined) { if (first < 0) first = lv.length; lv.push(m); lt.push(edgeT(f.t[i], f.t[j])); }
    }
    if (first < 0) { faces.push(f); return; }
    nFix++;
    faces.push({ v: [...lv.slice(first), ...lv.slice(0, first)], t: [...lt.slice(first), ...lt.slice(0, first)], g: f.g });
  });
  const n = P.length / 3;
  const refIdx = new Int32Array(n * 3), refW = new Float32Array(n * 3);
  refIdx.set(part.refIdx); refW.set(part.refW);
  const out = new lib.Part({ name: part.name, role: part.role, obj: { ...part.obj, uvs: Float32Array.from(UV), faces }, pos: Float32Array.from(P), refIdx, refW });
  out.weights = Wt;
  out.seg = new Uint8Array(n);
  out.seg.set(part.seg);
  for (let i = n0; i < n; i++) {
    const acc = new Float32Array(10);
    for (const [b, w] of Wt[i]) acc[boneSegment(bones[b].name)] += w;
    let best = 0;
    for (let s2 = 1; s2 < 10; s2++) if (acc[s2] > acc[best]) best = s2;
    out.seg[i] = best;
  }
  console.log(`${TAG} ${part.name}: ${nSub} faces subdivided (+${n - n0} vertices), ${nFix} neighbours re-fanned`);
  return out;
}

/** Keeps only the faces of `part` whose UV island passes keepIsland(box), crops the UV atlas to them. */
function keepIslands(part, keepIsland, pad = 0.006) {
  const isl = uvIslands(part), box = new Map();
  part.obj.faces.forEach((f, fi) => {
    let b = box.get(isl[fi]);
    if (!b) box.set(isl[fi], b = { n: 0, min: [9, 9, 9], max: [-9, -9, -9], uv: [9, 9, -9, -9] });
    b.n++;
    for (const v of f.v) for (let k = 0; k < 3; k++) { b.min[k] = Math.min(b.min[k], part.pos[v * 3 + k]); b.max[k] = Math.max(b.max[k], part.pos[v * 3 + k]); }
    for (const t of f.t) { const u = part.obj.uvs[t * 2], w = part.obj.uvs[t * 2 + 1]; b.uv[0] = Math.min(b.uv[0], u); b.uv[1] = Math.min(b.uv[1], w); b.uv[2] = Math.max(b.uv[2], u); b.uv[3] = Math.max(b.uv[3], w); }
  });
  const ok = new Map([...box.entries()].map(([id, b]) => [id, keepIsland(b)]));
  part.obj.faces.forEach((f, fi) => { if (!ok.get(isl[fi])) part.keep[fi] = 0; });
  const r = [9, 9, -9, -9];
  for (const [id, b] of box) if (ok.get(id)) { r[0] = Math.min(r[0], b.uv[0]); r[1] = Math.min(r[1], b.uv[1]); r[2] = Math.max(r[2], b.uv[2]); r[3] = Math.max(r[3], b.uv[3]); }
  const crop = [Math.floor(Math.max(0, r[0] - pad) * 2048) / 2048, Math.floor(Math.max(0, r[1] - pad) * 2048) / 2048, Math.ceil(Math.min(1, r[2] + pad) * 2048) / 2048, Math.ceil(Math.min(1, r[3] + pad) * 2048) / 2048];
  const uv = part.obj.uvs, nu = new Float32Array(uv.length);
  for (let i = 0; i < uv.length; i += 2) { nu[i] = (uv[i] - crop[0]) / (crop[2] - crop[0]); nu[i + 1] = (uv[i + 1] - crop[1]) / (crop[3] - crop[1]); }
  part.obj = { ...part.obj, uvs: nu };
  return { crop, isl, box, ok };
}

/**
 * Re-packs the kept UV islands of a part (after keepIslands: UVs in crop space) into the unit square with a shelf
 * packer, translation + one uniform scale only (the normal map's tangent frame stays valid), as large as fits.
 * The casual-suit atlas left ~40 % of the shirt's texture to the unused jeans islands. Returns { scale,
 * remap(img, size) } where remap resamples an image laid out in the old crop space into the packed layout.
 */
function repackIslands(part, info, { margin = 0.006 } = {}) {
  const uv = part.obj.uvs, nT = uv.length / 2;
  const islOfT = new Int32Array(nT).fill(-1);
  part.obj.faces.forEach((f, fi) => { if (part.keep[fi]) for (const t of f.t) islOfT[t] = info.isl[fi]; });
  const boxes = new Map();
  for (let t = 0; t < nT; t++) {
    const id = islOfT[t];
    if (id < 0) continue;
    let b = boxes.get(id);
    if (!b) boxes.set(id, b = { id, u0: 9, v0: 9, u1: -9, v1: -9 });
    b.u0 = Math.min(b.u0, uv[t * 2]); b.v0 = Math.min(b.v0, uv[t * 2 + 1]); b.u1 = Math.max(b.u1, uv[t * 2]); b.v1 = Math.max(b.v1, uv[t * 2 + 1]);
  }
  const list = [...boxes.values()].sort((a, b) => (b.v1 - b.v0) - (a.v1 - a.v0));
  const place = (sc) => {
    let x = 0, y = 0, row = 0;
    for (const b of list) {
      const w = (b.u1 - b.u0) * sc + 2 * margin, hh = (b.v1 - b.v0) * sc + 2 * margin;
      if (w > 1) return false;
      if (x + w > 1) { x = 0; y += row; row = 0; }
      b.x = x + margin; b.y = y + margin; x += w; row = Math.max(row, hh);
    }
    return y + row <= 1;
  };
  let lo = 0.3, hi = 4;
  for (let it = 0; it < 30; it++) { const mid = (lo + hi) / 2; if (place(mid)) lo = mid; else hi = mid; }
  const sc = lo * 0.995;
  place(sc);
  const nu = new Float32Array(uv.length);
  for (let t = 0; t < nT; t++) {
    const b = boxes.get(islOfT[t]);
    if (!b) { nu[t * 2] = uv[t * 2]; nu[t * 2 + 1] = uv[t * 2 + 1]; continue; }
    nu[t * 2] = b.x + (uv[t * 2] - b.u0) * sc; nu[t * 2 + 1] = b.y + (uv[t * 2 + 1] - b.v0) * sc;
  }
  part.obj = { ...part.obj, uvs: nu };
  let used = 0;
  for (const b of list) used += (b.u1 - b.u0) * (b.v1 - b.v0) * sc * sc;
  console.log(`${TAG} ${part.name}: ${list.length} UV islands re-packed, scale x${sc.toFixed(2)}, ${Math.round(used * 100)} % of the texture covered by island boxes`);
  const remap = (img, size) => {
    const out = createImage(size, size, [0, 0, 0, 0]);
    const W = img.width, H = img.height, d = img.data;
    const m = margin * 0.9;
    for (const b of list) {
      const x0 = Math.max(0, Math.floor((b.x - m) * size)), x1 = Math.min(size, Math.ceil((b.x + (b.u1 - b.u0) * sc + m) * size));
      // OBJ v is up, image rows go down
      const yA = Math.max(0, Math.floor((1 - (b.y + (b.v1 - b.v0) * sc + m)) * size)), yB = Math.min(size, Math.ceil((1 - (b.y - m)) * size));
      for (let y = yA; y < yB; y++) for (let x = x0; x < x1; x++) {
        const U = b.u0 + ((x + 0.5) / size - b.x) / sc, Vv = b.v0 + ((1 - (y + 0.5) / size) - b.y) / sc;
        const fx = Math.max(0, Math.min(W - 1.001, U * W - 0.5)), fy = Math.max(0, Math.min(H - 1.001, (1 - Vv) * H - 0.5));
        const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
        const o = (y * size + x) * 4;
        for (let c = 0; c < 4; c++) {
          const i00 = (iy * W + ix) * 4 + c;
          out.data[o + c] = Math.round((d[i00] * (1 - tx) + d[i00 + 4] * tx) * (1 - ty) + (d[i00 + W * 4] * (1 - tx) + d[i00 + W * 4 + 4] * tx) * ty);
        }
        out.data[o + 3] = Math.max(1, out.data[o + 3]);
      }
    }
    // outside the islands: their average colour (no black bleeding into the island edges in the far mip levels)
    const avg = [0, 0, 0, 0];
    let n = 0;
    for (let i = 0; i < out.data.length; i += 4) if (out.data[i + 3]) { for (let c = 0; c < 4; c++) avg[c] += out.data[i + c]; n++; }
    for (let i = 0; i < out.data.length; i += 4) if (!out.data[i + 3]) for (let c = 0; c < 4; c++) out.data[i + c] = Math.round(avg[c] / Math.max(1, n));
    return out;
  };
  return { scale: sc, remap };
}

/**
 * The belly dome hangs from the pelvis: the stock MakeHuman weights put the upper belly on spine_02 / spine_03,
 * whose pivots sit at navel height, so the clips' zombie hunch (idle: spine_02 +54 deg, spine_03 +28) swung a
 * 45 cm deep belly down through the thighs. Front-of-trunk vertices between the hips and the chest are blended to
 * pelvis / spine_01 (spine_02 / spine_03 only towards the chest); the back keeps the stock weights (it follows the
 * spine), the arms and the legs are untouched.
 */
function reweightBelly(h, { yHip, yW, yB, y3, axisZ, armW, legW }) {
  const sk = h.skeleton.byName;
  const id = { p: sk.pelvis.index, s1: sk.spine_01.index, s2: sk.spine_02.index, s3: sk.spine_03.index, tl: sk.thigh_l.index, tr: sk.thigh_r.index };
  const y2 = sk.spine_02.head.y;
  // [height, {bone: w}] keys, piecewise linear in y
  const keys = [
    [yHip - 0.1, { p: 0.6, s1: 0.4 }], [yW, { p: 0.45, s1: 0.55 }], [yB, { p: 0.25, s1: 0.75 }], [y2 + 0.03, { p: 0.1, s1: 0.78, s2: 0.12 }],
    [y3, { s1: 0.64, s2: 0.29, s3: 0.07 }], [y3 + 0.1, { s1: 0.32, s2: 0.42, s3: 0.26 }], [y3 + 0.2, { s1: 0.1, s2: 0.4, s3: 0.5 }],
  ];
  const target = (y) => {
    if (y <= keys[0][0]) return keys[0][1];
    for (let i = 0; i + 1 < keys.length; i++) {
      const [ya, a] = keys[i], [yb, b] = keys[i + 1];
      if (y > yb) continue;
      const t = (y - ya) / (yb - ya), out = {};
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) out[k] = lerp(a[k] || 0, b[k] || 0, t);
      return out;
    }
    return keys[keys.length - 1][1];
  };
  let n = 0;
  for (const v of h.baseObj.groupVerts('body')) {
    const p = [h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]];
    const aw = armW(v), lw = legW(v);
    if (aw > 0.3) continue;
    const rz = p[2] - axisZ(p[1]), rh = Math.hypot(p[0], rz);
    if (rh < 0.03) continue;
    const c = rz / rh;
    const k = ss(yHip - 0.14, yHip + 0.02, p[1]) * (1 - ss(y3 + 0.12, y3 + 0.26, p[1])) * ss(-0.35, 0.35, c) * (1 - aw / 0.3) * (1 - lw);
    if (k <= 0) continue;
    const acc = new Map();
    for (const [b, w] of h.weights[v]) acc.set(b, w * (1 - k));
    // the underside of the overhang rides on the thighs a little (a crouch lifts it instead of burying it)
    const tw = 0.32 * (1 - ss(yHip - 0.02, yHip + 0.1, p[1])) * ss(0.2, 0.7, c);
    const tl = ss(-0.06, 0.06, p[0]);
    const tgt = target(p[1]);
    for (const [key, w] of Object.entries(tgt)) acc.set(id[key], (acc.get(id[key]) || 0) + w * k * (1 - tw));
    acc.set(id.tl, (acc.get(id.tl) || 0) + k * tw * tl);
    acc.set(id.tr, (acc.get(id.tr) || 0) + k * tw * (1 - tl));
    const list = [...acc.entries()].filter(([, w]) => w > 1e-4);
    const sum = list.reduce((a, [, w]) => a + w, 0);
    h.weights[v] = list.map(([b, w]) => [b, w / sum]);
    n++;
  }
  console.log(`${TAG} belly re-weighted: ${n} base vertices`);
}

/**
 * A dedicated `belly` bone (child of the pelvis, rigid with it in every library clip: the clips never key it) carries
 * the dome: the spine bend can no longer fold or squash the belly, and the game can jiggle / breathe it or shrink it
 * on the headshot deflate (scale about its head, which sits at the back of the dome). The pelvis / spine_01 share of
 * every front-of-trunk vertex between the belt and the chest moves to it (half the spine_02 share too); the chest
 * keeps spine_02 / 03 above y3 so the fold under the chest stays smooth.
 */
function bellyBone(h, { yHip, yB, y3, axisZ, armW, legW }) {
  const sk = h.skeleton.byName;
  const b = addHelperBone(h, 'belly', 'pelvis', [0, yB + 0.02, axisZ(yB) + 0.05]);
  const id = { p: sk.pelvis.index, s1: sk.spine_01.index, s2: sk.spine_02.index };
  let n = 0;
  for (const v of h.baseObj.groupVerts('body')) {
    const p = [h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]];
    const aw = armW(v), lw = legW(v);
    if (aw > 0.3 || lw > 0.6) continue;
    const rz = p[2] - axisZ(p[1]), rh = Math.hypot(p[0], rz);
    if (rh < 0.03) continue;
    const c = rz / rh;
    const k = ss(yHip - 0.17, yHip - 0.03, p[1]) * (1 - ss(y3 - 0.02, y3 + 0.12, p[1])) * ss(-0.5, 0.2, c) * (1 - aw / 0.3) * (1 - lw / 0.6);
    if (k <= 0) continue;
    let moved = 0;
    const list = h.weights[v].map(([bi, w]) => {
      const f = bi === id.p || bi === id.s1 ? k : bi === id.s2 ? k * 0.5 : 0;
      moved += w * f;
      return [bi, w * (1 - f)];
    });
    list.push([b.index, moved]);
    const kept = list.filter(([, w]) => w > 1e-4);
    const sum = kept.reduce((a, [, w]) => a + w, 0) || 1;
    h.weights[v] = kept.map(([bi, w]) => [bi, w / sum]);
    n++;
  }
  console.log(`${TAG} belly bone: ${n} base vertices`);
  return b;
}

// rest height of the finished character (top of the skull, m)
const REST_HEIGHT = 1.8;

// =====================================================================================================
export async function build(lib) {
  const N = lib.makeNoise(4242);
  const TR = albedoTracer('bloater');
  const opts = {
    macro: { gender: 1, age: 0.62, muscle: 0.12, weight: 1, height: 0.56, proportions: 0.3, race: { caucasian: 0.8, asian: 0.1, african: 0.1 } },
    modifiers: {
      // the gas-filled trunk: belly, waist, flanks, hips, seat, a heavy fatty chest
      'stomach-pregnant-decr-incr': 1, 'measure-waist-circ-decr-incr': 1, 'torso-scale-depth-decr-incr': 0.5, 'torso-scale-horiz-decr-incr': 0.3,
      'measure-hips-circ-decr-incr': 0.6, 'buttocks-volume-decr-incr': 0.5, 'measure-bust-circ-decr-incr': 0.8, 'stomach-navel-in-out': 0.6,
      // no neck: a double chin and a fat collar the head sits in
      'neck-double-decr-incr': 1, 'measure-neck-circ-decr-incr': 1, 'measure-neck-height-decr-incr': -0.6, 'neck-back-scale-depth-decr-incr': 0.6,
      // a swollen face: puffed cheeks and jowls, bags under the eyes, fat lips
      'head-fat-decr-incr': 1, 'cheek-volume-decr-incr': 1, 'eye-bag-decr-incr': 1, 'eye-bag-height-decr-incr': 0.5, 'head/head-round': 0.4,
      'mouth-lowerlip-volume-decr-incr': 0.9, 'mouth-upperlip-volume-decr-incr': 0.5, 'chin-width-decr-incr': 0.4,
      // oedematous limbs: fat upper arms, thick forearms and sausage fingers, tree-trunk thighs, swollen calves / ankles
      'upperarm-fat-decr-incr': 1, 'measure-upperarm-circ-decr-incr': 1, 'lowerarm-fat-decr-incr': 1, 'hand-fingers-diameter-decr-incr': 0.8,
      'upperleg-fat-decr-incr': 1, 'measure-thigh-circ-decr-incr': 1, 'lowerleg-fat-decr-incr': 1, 'measure-calf-circ-decr-incr': 0.8,
      'measure-knee-circ-decr-incr': 0.6, 'measure-ankle-circ-decr-incr': 0.8,
    },
    // swollen-shut eyes (slits, the left more), lips everted and parted around the protruding tongue
    expression: { 'mouth-open': 0.36, 'mouth-eversion': 0.45, 'eye-left-slit': 0.55, 'eye-right-slit': 0.4, 'eyebrows-left-inner-up': 0.2 },
  };
  const h = await lib.Human.create(opts);
  {
    const S0 = h.skeleton.byName, P0 = (n) => V(S0[n].head).map((x) => x.toFixed(3));
    console.log(`${TAG} macro body: height ${h.height.toFixed(3)} pelvis ${P0('pelvis')} spine_01 ${P0('spine_01')} spine_03 ${P0('spine_03')} neck ${P0('neck_01')} head ${P0('head')}`);
  }

  // ================================================================ SCULPT A: the gas-bloated body
  const S0 = h.skeleton.byName, P0 = (n) => V(S0[n].head);
  const yHip = P0('thigh_l')[1], yW = P0('spine_01')[1], y3 = P0('spine_03')[1], yNeck = P0('neck_01')[1];
  const yB = yW + 0.03;   // belly centre height (navel)
  const chain0 = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01'].map(P0);
  const axisZ0 = (y) => {
    if (y <= chain0[0][1]) return chain0[0][2];
    for (let i = 0; i + 1 < chain0.length; i++) if (y <= chain0[i + 1][1]) return lerp(chain0[i][2], chain0[i + 1][2], (y - chain0[i][1]) / (chain0[i + 1][1] - chain0[i][1]));
    return chain0[chain0.length - 1][2];
  };
  const armIds = new Set(h.skeleton.bones.filter((b) => /^(clavicle|upperarm|lowerarm|hand|thumb|index|middle|ring|pinky)/.test(b.name)).map((b) => b.index));
  const legIds = new Set(h.skeleton.bones.filter((b) => /^(thigh|calf|foot|ball)/.test(b.name)).map((b) => b.index));
  const wOf = (ids) => (v) => h.weights[v].reduce((a, [b, w]) => a + (ids.has(b) ? w : 0), 0);
  const armW = wOf(armIds), legW = wOf(legIds);
  const pre = h.basePart({ name: 'pre' });
  const preB = makeBVH([surf(pre)]);
  const onSkin = (o, d) => { const hh = preB.first(o, d, 2); return hh ? { p: hh.p, n: dot(hh.n, d) > 0 ? scl(hh.n, -1) : hh.n } : null; };
  // gas pockets: broad asymmetric swellings under the belly skin (lower left, upper right, right flank)
  const pockets = [];
  for (const [o, d, r, hh] of [
    [[0.13, yB - 0.07, 1], [0, 0, -1], 0.16, 0.065],
    [[-0.12, yB + 0.11, 1], [0, 0, -1], 0.13, 0.045],
    [[-1, yB - 0.02, 0.06], [1, 0, 0], 0.12, 0.04],
    [[1, yB + 0.12, -0.02], [-1, 0, 0], 0.1, 0.03],
    [[-0.02, yB - 0.16, 1], [0, 0, -1], 0.1, 0.03],
  ]) { const s = onSkin(o, d); if (s) pockets.push({ ...s, r, h: hh }); }
  // boils: inflamed mounds under the glowing pustule heads (geometry for the big ones; the small ones are texture)
  const boils = [];
  const rnd = lib.rng(77);
  {
    const shL = P0('upperarm_l'), shR = P0('upperarm_r'), elL = P0('lowerarm_l'), elR = P0('lowerarm_r');
    const defs = [
      // [ray origin, ray dir, radius, height]
      [[0.06, yB - 0.13, 1], [0, 0, -1], 0.065, 0.03],        // low belly, left of the navel
      [[-0.17, yB - 0.03, 1], [0, 0, -1], 0.06, 0.028],       // right side of the belly
      [[0.2, yB + 0.06, 1], [-0.2, 0, -1], 0.055, 0.026],     // left upper belly
      [[-0.05, yB + 0.17, 1], [0, 0, -1], 0.045, 0.02],       // under the chest
      [[0.09, yB + 0.02, 1], [0, 0, -1], 0.04, 0.018],        // left of the navel
      [[-1, yB + 0.05, 0.0], [1, 0, 0], 0.06, 0.026],         // right flank
      [[1, yB - 0.04, 0.03], [-1, 0, 0], 0.055, 0.025],       // left flank
      [[0.12, y3 - 0.02, -1], [0, 0, 1], 0.055, 0.022],       // back, left of the spine
      [[-0.09, y3 + 0.09, -1], [0, 0, 1], 0.045, 0.02],       // back, right shoulder blade
      [[0.04, yW + 0.0, -1], [0, 0, 1], 0.05, 0.018],         // lower back
      [[0.07, yNeck - 0.02, -1], [0, 0, 1], 0.04, 0.018],     // back of the neck
      [[-1, yNeck + 0.02, 0.02], [1, 0, 0], 0.03, 0.013],     // right side of the neck
      [[shL[0] + 1, shL[1] - 0.06, shL[2]], [-1, 0, 0], 0.04, 0.018],   // left deltoid
      [[shR[0] - 1, shR[1] - 0.1, shR[2] - 0.02], [1, 0, 0], 0.045, 0.02], // right upper arm (through the split seam)
      [[lerp(elR[0], P0('hand_r')[0], 0.4), lerp(elR[1], P0('hand_r')[1], 0.4) + 1, lerp(elR[2], P0('hand_r')[2], 0.4)], [0, -1, 0], 0.03, 0.012], // right forearm
      [[-0.045, P0('head')[1] - 0.005, 1], [0, 0, -1], 0.026, 0.009],   // right cheek / jaw
      [[0.035, P0('head')[1] + 0.085, 1], [0, -0.3, -1], 0.022, 0.007], // left temple / forehead
      [[lerp(elL[0], P0('hand_l')[0], 0.55), lerp(elL[1], P0('hand_l')[1], 0.55), lerp(elL[2], P0('hand_l')[2], 0.55) + 1], [0, 0, -1], 0.028, 0.012], // left forearm
    ];
    for (const [o, d, r, hh] of defs) { const s = onSkin(o, d); if (s) boils.push({ ...s, r, h: hh, big: true }); else console.warn(`${TAG} boil ray missed`, o); }
    // small satellite pustules around the big ones and scattered over belly / back / arms (texture + small mounds)
    const pool = boils.filter((b) => b.p[1] < yNeck - 0.02);   // no satellite crop on the face
    for (let k = 0; k < 26; k++) {
      const B = pool[Math.floor(rnd() * pool.length)];
      const t = norm(cross(B.n, [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]));
      const o = madd(madd(B.p, t, B.r * (1.1 + 1.3 * rnd())), B.n, 0.2);
      const s = onSkin(o, scl(B.n, -1));
      if (s) boils.push({ ...s, r: 0.012 + 0.016 * rnd(), h: 0.004 + 0.006 * rnd(), big: false });
    }
  }
  console.log(`${TAG} ${pockets.length} gas pockets, ${boils.length} boils (${boils.filter((b) => b.big).length} big)`);
  const handC = (s) => scl(['index_01', 'middle_01', 'ring_01', 'pinky_01'].map((f) => P0(`${f}_${s}`)).reduce((a, k) => add(a, k), [0, 0, 0]), 0.25);
  const Wl = P0('hand_l'), Wr = P0('hand_r');
  const hands = [[Wl, norm(sub(handC('l'), Wl))], [Wr, norm(sub(handC('r'), Wr))]];
  // the face and neck (the MakeHuman fat targets stop at mild puffiness): a double chin hanging over the collar,
  // jowls sagging off the jaw line, puffed cheeks, a thick neck the head sinks into
  const A0 = lib.anchors(h);
  const mo0 = A0.mouth, eyeY0 = (A0.eyeL[1] + A0.eyeR[1]) / 2, eyeZ0 = (A0.eyeL[2] + A0.eyeR[2]) / 2;
  const nkA = P0('neck_01'), nkB = P0('head');
  const neckAxis = (y) => lerp(nkA[2], nkB[2], clamp01((y - nkA[1]) / (nkB[1] - nkA[1])));
  const gauss = (p, c, r) => Math.exp(-(((p[0] - c[0]) / r[0]) ** 2 + ((p[1] - c[1]) / r[1]) ** 2 + ((p[2] - c[2]) / r[2]) ** 2));
  const faceFat = (p) => {
    let f = [0, 0, 0];
    if (p[1] < yNeck - 0.1 || p[1] > eyeY0 + 0.01) return f;
    const dc = gauss(p, [0, mo0[1] - 0.08, mo0[2] - 0.05], [0.075, 0.036, 0.055]);
    f = madd(f, [0, -0.5, 0.86], 0.032 * dc);
    // the crease between the chin and the roll
    const cr = gauss(p, [0, mo0[1] - 0.052, mo0[2] - 0.03], [0.055, 0.009, 0.05]);
    f = madd(f, [0, 0.3, -0.95], 0.007 * cr);
    for (const sx of [1, -1]) {
      const jw = gauss(p, [sx * 0.054, mo0[1] - 0.05, mo0[2] - 0.042], [0.034, 0.034, 0.036]);
      f = madd(f, [sx * 0.72, -0.5, 0.3], 0.02 * jw);
      const ck = gauss(p, [sx * 0.05, eyeY0 - 0.05, eyeZ0 - 0.008], [0.026, 0.024, 0.026]);
      f = madd(f, [sx * 0.55, -0.15, 0.8], 0.006 * ck);
    }
    const ny = ss(yNeck - 0.09, yNeck - 0.03, p[1]) * (1 - ss(mo0[1] - 0.07, mo0[1] - 0.03, p[1]));
    if (ny > 0) {
      const rz = p[2] - neckAxis(p[1]), rh = Math.hypot(p[0], rz);
      if (rh > 0.02) f = madd(f, [p[0] / rh, 0, rz / rh], 0.018 * ny * ss(-0.7, 0.2, rz / rh) * (1 - ss(0.1, 0.14, rh)));
    }
    return f;
  };
  const armInfl = [[boneSeg(S0.upperarm_l), 0.016, 0.9], [boneSeg(S0.upperarm_r), 0.016, 0.9], [boneSeg(S0.lowerarm_l), 0.009, 0.2], [boneSeg(S0.lowerarm_r), 0.009, 0.2]];
  await sculpt(h, (p, isBody, i) => {
    let q = p;
    // swollen hands ~1.1x about the wrist (joint cubes too: the finger bones follow)
    for (const [W, ax] of hands) {
      const d = sub(q, W), tt = dot(d, ax), r = len(sub(d, scl(ax, tt)));
      const k = ss(-0.05, 0.02, tt) * (1 - ss(0.09, 0.13, r)) * (1 - ss(0.22, 0.3, tt));
      if (k > 0) q = add(W, scl(d, 1 + 0.1 * k));
    }
    if (!isBody) return q;
    const aw = armW(i), lw = legW(i);
    if (aw < 0.2) q = add(q, faceFat(p));
    const zc = axisZ0(q[1]), rx = q[0], rz = q[2] - zc, rh = Math.hypot(rx, rz);
    if (rh > 0.04 && aw < 0.5) {
      const c = rz / rh, sn = Math.abs(rx) / rh, out = [rx / rh, 0, rz / rh];
      const trunk = 1 - lw;
      // the dome: from under the chest to below the navel, pushed out round and taut (no pregnant "ball under the
      // breasts"); strongest in front, wrapping round to the flanks
      const dy = q[1] - yB;
      const dome = Math.exp(-((dy / (dy > 0 ? 0.2 : 0.13)) ** 2)) * ss(-0.35, 0.85, c) * trunk;
      let dq = scl(out, 0.07 * dome);
      // fill between the chest and the dome (a convex front line)
      dq = madd(dq, out, 0.035 * Math.exp(-(((q[1] - (yB + 0.2)) / 0.09) ** 2)) * ss(0.0, 0.8, c) * trunk);
      // love handles + a back roll just above the belt line, a crease over them
      const lh = Math.exp(-(((q[1] - (yW - 0.025)) / 0.045) ** 2)) * ss(0.45, 0.9, sn) * (1 - ss(0.2, 0.7, c)) * trunk;
      const roll = Math.exp(-(((q[1] - (yW + 0.01)) / 0.04) ** 2)) * ss(-0.4, -0.8, c) * trunk;
      const crease = Math.exp(-(((q[1] - (yW + 0.06)) / 0.02) ** 2)) * ss(0.3, 0.9, sn + (c < -0.5 ? 0.5 : 0)) * (1 - ss(0.3, 0.7, c)) * trunk;
      dq = madd(dq, out, 0.035 * lh + 0.025 * roll - 0.012 * crease);
      // a heavy fatty chest sagging over the dome, a crease under it
      if (q[1] > y3 - 0.12 && q[1] < y3 + 0.22 && c > 0) {
        for (const sx of [1, -1]) {
          const m = [sx * 0.1, y3 + 0.05, 0];
          const d2 = Math.hypot((q[0] - m[0]) / 0.085, (q[1] - m[1]) / 0.09);
          const k = Math.exp(-d2 * d2) * ss(0.2, 0.8, c);
          dq = add(dq, [sx * 0.004 * k, -0.02 * k, 0.022 * k]);
        }
      }
      // buffalo hump: a fat collar across the back of the neck / top of the back
      const hump = Math.exp(-(((q[1] - (yNeck - 0.04)) / 0.06) ** 2)) * ss(-0.2, -0.75, c) * (1 - ss(0.08, 0.14, Math.abs(q[0])));
      dq = add(dq, [0, 0.008 * hump, -0.035 * hump]);
      q = add(q, dq);
    }
    // gas pockets and boil mounds (displaced along the pre-sculpt normal, soft max where they overlap)
    let dq = [0, 0, 0];
    for (const L of pockets) {
      const d = dist(p, L.p);
      if (d < L.r) dq = madd(dq, L.n, L.h * (0.5 + 0.5 * Math.cos(Math.PI * d / L.r)));
    }
    for (const L of boils) {
      const d = dist(p, L.p);
      if (d >= L.r) continue;
      const k = 0.5 + 0.5 * Math.cos(Math.PI * d / L.r);
      dq = madd(dq, L.n, L.h * k ** 0.6);
    }
    const m = len(dq);
    if (m > 0) q = madd(q, norm(dq), m > 0.07 ? 0.07 + (m - 0.07) * 0.4 : m);
    // swollen arms: fat, oedematous upper arms sagging underneath ("bingo wings"), thick forearms
    if (aw > 0.4) {
      for (const [seg, amt, sag] of armInfl) {
        const a = seg(q);
        if (a.t < -0.1 || a.t > 1.1 || a.d > 0.16) continue;
        const r = sub(q, a.a), rl = len(r);
        if (rl < 1e-4) continue;
        const rn = scl(r, 1 / rl);
        const prof = Math.sin(Math.PI * clamp01((a.t + 0.05) / 1.1)) ** 0.7 * aw;
        const under = ss(-0.1, 0.8, -rn[1]);
        q = madd(q, rn, amt * prof * (1 + sag * under));
      }
    }
    return q;
  });
  // the boil and pocket centres moved with the skin: re-anchor them on the sculpted surface
  {
    const bodyB0 = makeBVH([surf(h.basePart({ name: 'post' }))]);
    for (const L of [...boils, ...pockets]) { const hit = bodyB0.first(madd(L.p, L.n, 0.3), scl(L.n, -1), 0.5); if (hit) L.s = hit.p; else L.s = L.p; }
  }

  reweightBelly(h, { yHip, yW, yB, y3, axisZ: axisZ0, armW, legW });

  // ================================================================ trousers (fitted before the overhang)
  const trousers = await h.fit('clothes/male_casualsuit01', { name: 'trousers', role: 'cloth' });
  const waistY = P0('spine_01')[1] + 0.12;
  const trouserInfo = keepIslands(trousers, (b) => b.max[1] < waistY + 0.1 && b.min[1] < 0.5);
  // front of the waistband (and the belt) dips under the belly: faces above the belt line in front go
  const yFrontCut = yHip - 0.035;
  let waistTop = 0;
  trousers.obj.faces.forEach((f, fi) => { if (trousers.keep[fi]) for (const v of f.v) waistTop = Math.max(waistTop, trousers.pos[v * 3 + 1]); });
  const beltLine = (P) => {
    const th = Math.abs(Math.atan2(P[0], P[2] - axisZ0(P[1]))) * 180 / Math.PI;
    return lerp(yFrontCut, waistTop + 0.01, ss(28, 85, th));
  };
  {
    let n = 0;
    trousers.obj.faces.forEach((f, fi) => {
      if (!trousers.keep[fi]) return;
      const c = [0, 1, 2].map((k) => f.v.reduce((a, v) => a + trousers.pos[v * 3 + k], 0) / f.v.length);
      if (c[1] > beltLine(c)) { trousers.keep[fi] = 0; n++; }
    });
    console.log(`${TAG} trousers: waistband top ${waistTop.toFixed(3)}, front cut ${yFrontCut.toFixed(3)}, ${n} faces under the belly dropped`);
  }

  // ================================================================ SCULPT B: the belly hangs over the belt
  await sculpt(h, (p, isBody, i) => {
    if (!isBody || armW(i) > 0.5) return p;
    const zc = axisZ0(p[1]), rx = p[0], rz = p[2] - zc, rh = Math.hypot(rx, rz);
    if (rh < 0.04) return p;
    const c = rz / rh;
    const front = ss(-0.1, 0.75, c);
    // sag: the lower belly drops and rolls forward over the waistband (most at the belly's lower curve)
    const band = ss(yHip - 0.16, yHip - 0.02, p[1]) * (1 - ss(yB + 0.02, yB + 0.16, p[1]));
    const k = band * front * (1 - legW(i) * 0.7);
    return [p[0] * (1 + 0.04 * k), p[1] - 0.045 * k, p[2] + 0.025 * k];
  });
  const sk = h.skeleton.byName;
  const B = (n) => V(sk[n].head);
  const A = lib.anchors(h);
  // the dome on its own bone (after the last sculpt: a sculpt rebuilds the skeleton); the trousers were bound
  // before it, re-bind them so their waist follows the same bones as the skin under it
  bellyBone(h, { yHip, yB, y3, axisZ: axisZ0, armW, legW });
  trousers.bindWeights(h.weights, h.skeleton.bones);
  console.log(`${TAG} sculpted: height ${h.height.toFixed(3)} pelvis ${sk.pelvis.head.y.toFixed(3)}`);

  // ================================================================ parts
  const body = h.basePart({ name: 'body', role: 'skin' });
  const shirt = await h.fit('clothes/male_casualsuit01', { name: 'shirt', role: 'cloth' });
  const shirtInfo = keepIslands(shirt, (b) => b.min[1] > waistY - 0.25 && b.max[1] > waistY + 0.2);
  const shirtPack = repackIslands(shirt, shirtInfo);
  const shoes = await h.fit('clothes/shoes02', { name: 'shoes', role: 'cloth' });
  const eyes = await h.fit('eyes/low-poly', { name: 'eyes', role: 'eye', hide: false });
  const teeth = await h.fit('teeth/teeth_base', { name: 'teeth', role: 'teeth', hide: false });
  let shoeTop = 0;
  for (let i = 1; i < shoes.pos.length; i += 3) shoeTop = Math.max(shoeTop, shoes.pos[i]);
  {
    // the molars (more than 2.6 cm behind the incisors) never show past the tongue: their triangles go
    let zf = -9;
    for (let i = 2; i < teeth.pos.length; i += 3) zf = Math.max(zf, teeth.pos[i]);
    teeth.obj.faces.forEach((f, fi) => { if (teeth.keep[fi] && f.v.every((v) => teeth.pos[v * 3 + 2] < zf - 0.026)) teeth.keep[fi] = 0; });
  }

  // body vs trousers. A body vertex is UNDER the trousers when the ray along its outward normal exits them (meets a
  // trouser face whose normal points the same way) within 8 cm: those stay / become hidden (the old 3 cm "no trousers
  // nearby" test had un-hidden fat thigh skin a few cm under the cloth, which LOD1's coarser meshes pushed through
  // as dark blotches). Any other hidden vertex of the waist band is visible skin now (the overhang, the belly under
  // the dropped waistband). The same test removes the shoes02 sock tops inside the trouser cuffs (they poked
  // through the left shin).
  const trB = makeBVH([surf(trousers)]);
  const underTrousers = (p, nn) => { const hit = trB.first(madd(p, nn, -0.004), nn, 0.08); return !!hit && dot(hit.n, nn) > 0; };
  {
    const nr = h.basePart({ name: 'n' }).normals();
    let un = 0, hid = 0, kept = 0;
    for (const v of h.baseObj.groupVerts('body')) {
      const p = [h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]];
      if (p[1] > waistY + 0.15 || armW(v) > 0.5) continue;
      if (underTrousers(p, [nr[v * 3], nr[v * 3 + 1], nr[v * 3 + 2]])) { if (!h.hidden.has(v)) { h.hidden.add(v); hid++; } else kept++; }
      else if (h.hidden.has(v) && p[1] > waistY - 0.35) { h.hidden.delete(v); un++; }
    }
    console.log(`${TAG} trousers vs skin: ${un} belly vertices un-hidden, ${kept} stay hidden under the trousers, ${hid} more covered vertices hidden`);
    const sn = shoes.normals();
    let ns = 0;
    const cov = new Uint8Array(shoes.nVerts);
    for (let v = 0; v < shoes.nVerts; v++) cov[v] = underTrousers([shoes.pos[v * 3], shoes.pos[v * 3 + 1], shoes.pos[v * 3 + 2]], [sn[v * 3], sn[v * 3 + 1], sn[v * 3 + 2]]) ? 1 : 0;
    shoes.obj.faces.forEach((f, fi) => { if (shoes.keep[fi] && f.v.every((v) => cov[v])) { shoes.keep[fi] = 0; ns++; } });
    console.log(`${TAG} shoes: ${ns} sock faces inside the trouser cuffs removed`);
  }

  // cloth over the sculpted body: the buffalo hump, the fat chest and the swollen arms left shirt vertices inside the
  // skin (flat pink patches at the collar): every shirt vertex closer than 5 mm to the body surface (7 mm round the
  // collar / hump) or inside it moves out along the body normal; trousers below the overhang likewise (4 mm)
  {
    const bb = makeBVH([surf(h.basePart({ name: 'cl' }))]);
    const pushOut = (part, want, test) => {
      let n = 0;
      for (let v = 0; v < part.nVerts; v++) {
        const p = [part.pos[v * 3], part.pos[v * 3 + 1], part.pos[v * 3 + 2]];
        if (!test(p)) continue;
        const c = bb.closest(p);
        if (!c || c.d > 0.08) continue;
        const off = dot(sub(p, c.p), c.n), w = want(p);
        if (off >= w) continue;
        const q = madd(p, c.n, w - off);
        part.pos[v * 3] = q[0]; part.pos[v * 3 + 1] = q[1]; part.pos[v * 3 + 2] = q[2];
        n++;
      }
      return n;
    };
    const ns = pushOut(shirt, (p) => (p[1] > yNeck - 0.12 && p[2] < axisZ0(p[1]) + 0.02 ? 0.007 : 0.005), () => true);
    const nt = pushOut(trousers, () => 0.004, (p) => p[1] < yHip - 0.17);
    console.log(`${TAG} cloth pushed out of the skin: shirt ${ns}, trousers ${nt} vertices`);
  }

  // ---------------------------------------------------------------- the shirt: torn open by the belly
  const armSeg = { ul: boneSeg(sk.upperarm_l), ur: boneSeg(sk.upperarm_r), ll: boneSeg(sk.lowerarm_l), lr: boneSeg(sk.lowerarm_r) };
  const yOpen = y3 + 0.2;    // the top of the opening: the second button
  const yHem = waistY - 0.2;
  /** > 0 where the shirt is ripped away (smooth, metres-ish), ragged outline from noise. */
  /** The front rip alone (unclamped, ~1 per 2 cm; > 0 inside): a lens from the second button down to the hem,
   *  widest over the belly (the panels stay on the flanks: the shirt colour frames the belly from the front). */
  const frontRip = (P) => {
    const t = clamp01((yOpen - P[1]) / (yOpen - yB));
    const w = P[1] > yOpen ? -0.02 : P[1] > yB ? 0.018 + 0.17 * Math.sin(t * Math.PI / 2) ** 0.85 : 0.188 + 1.6 * (yB - P[1]);
    const xc = -0.014 - 0.02 * t;
    const rag = N.fbm(P[0] * 14, P[1] * 9, P[2] * 14, 3) * 0.02 + N.fbm(P[0] * 45, P[1] * 45, P[2] * 45, 2) * 0.007;
    return (w - Math.abs(P[0] - xc) + rag) / 0.02;
  };
  const shirtCut = (P) => {
    let f = -1;
    const zc = axisZ0(P[1]);
    if (P[2] - zc > 0.02) {
      f = Math.max(f, frontRip(P));
    } else {
      // back seam split: centre back from the shoulder blades to the hem, widening downwards
      const t = clamp01((y3 + 0.12 - P[1]) / (y3 + 0.12 - yHem));
      const w = P[1] > y3 + 0.12 ? -0.02 : 0.004 + 0.05 * t;
      const rag = N.fbm(P[0] * 30, P[1] * 12, P[2] * 30, 3) * 0.012;
      f = Math.max(f, (w - Math.abs(P[0] - 0.01) + rag) / 0.015);
    }
    // right sleeve: ripped off just above the elbow; a split along its outer seam over the boil
    const ur = armSeg.ur(P), lr = armSeg.lr(P), ul = armSeg.ul(P), ll = armSeg.ll(P);
    if (ur.d < 0.16 || lr.d < 0.14) {
      const tR = lr.d < ur.d ? 1 + lr.t : ur.t;
      const rag = N.fbm(P[0] * 20, P[1] * 20, P[2] * 20, 3) * 0.07;
      f = Math.max(f, (tR - 0.82 + rag) / 0.05);
      if (ur.d < 0.16 && ur.t > 0.12 && ur.t < 0.9 && P[0] < -0.02) {
        const outer = norm(sub(P, ur.a));
        const side = dot(outer, [-0.85, 0.2, -0.45]);
        f = Math.max(f, (side - 0.92 + N.fbm(P[0] * 25, P[1] * 25, P[2] * 25, 2) * 0.05) / 0.03 * ss(0.12, 0.3, ur.t));
      }
    }
    // left sleeve: torn off a hand's width below the elbow
    if (ll.d < 0.14 && ll.t > 0) {
      const rag = N.fbm(P[0] * 20 + 4, P[1] * 20, P[2] * 20, 3) * 0.12;
      f = Math.max(f, (ll.t - 0.3 + rag) / 0.08);
    }
    return f;
  };
  // the skin under the big rips is plain exposed skin (not "under the cloth"). Only where the shirt is: the front rip's
  // lens is unbounded below the hem (it had un-hidden / kept the whole front of the thighs under the trousers)
  const inShirt = (p) => p[1] > yHem - 0.06;
  for (const v of [...h.hidden]) { const p = [h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]]; if (inShirt(p) && shirtCut(p) > 0.5) h.hidden.delete(v); }

  // ---------------------------------------------------------------- shared paint fields (rest pose, metres)
  const yNk = sk.neck_01.head.y, zNk = sk.neck_01.head.z;
  const bodyNow = makeBVH([surf(h.basePart({ name: 'now' }))]);
  const onBody = (o, d) => { const hit = bodyNow.first(o, d, 2); return hit ? hit.p : null; };
  for (const L of [...boils, ...pockets]) { const hit = bodyNow.first(madd(L.p, L.n, 0.3), scl(L.n, -1), 0.5); L.s = hit ? hit.p : (L.s || L.p); }
  boils.forEach((b, k) => { b.glow = b.big ? 0.85 + 0.15 * hash(k * 7 + 1) : 0.45 + 0.4 * hash(k * 13 + 5); b.burst = !b.big && hash(k * 3 + 11) < 0.3; });
  // belly splits: the skin tearing under the pressure, glowing inside (the read that it is about to burst). Three
  // ruptures of different lengths and directions (a 15 cm hero tear curving down the lower left belly, a 9 cm one up
  // the right flank, a short one above the navel), each a jittered polyline with thinner side branches; the gap
  // width swells in the middle and pinches out at the ends (as does the glow)
  const splits = [];
  {
    const jit = (pts, amp, seed) => pts.map(([x, y], i) => (i === 0 || i === pts.length - 1 ? [x, y] : [x + (hash(seed + i * 7) - 0.5) * amp, y + (hash(seed + i * 13) - 0.5) * amp]));
    const dens = (pts, n) => { const out = []; for (let i = 0; i + 1 < pts.length; i++) for (let k = 0; k < n; k++) out.push(lerp3([...pts[i], 0], [...pts[i + 1], 0], k / n).slice(0, 2)); out.push(pts[pts.length - 1]); return out; };
    const defs = [
      // [polyline (x, y) on the front of the belly], max half-width, glow, branch (branches: hairline side tears)
      [[[0.0, yB - 0.06], [0.035, yB - 0.07], [0.065, yB - 0.09], [0.088, yB - 0.098], [0.11, yB - 0.124], [0.13, yB - 0.142], [0.142, yB - 0.17]], 0.0048, 1, false],
      [[[0.062, yB - 0.088], [0.058, yB - 0.108], [0.042, yB - 0.124], [0.036, yB - 0.146]], 0.0013, 0.45, true],
      [[[0.118, yB - 0.13], [0.136, yB - 0.124], [0.152, yB - 0.112], [0.166, yB - 0.108]], 0.0011, 0.35, true],
      [[[-0.092, yB - 0.025], [-0.104, yB + 0.0], [-0.118, yB + 0.028], [-0.124, yB + 0.052], [-0.142, yB + 0.074]], 0.0038, 0.85, false],
      [[[-0.116, yB + 0.03], [-0.1, yB + 0.044], [-0.09, yB + 0.064]], 0.0011, 0.35, true],
      [[[0.012, yB + 0.07], [-0.006, yB + 0.084], [-0.002, yB + 0.1], [-0.014, yB + 0.112]], 0.0026, 0.7, false],
    ];
    defs.forEach(([pts, wmax, glow, branch], si) => {
      const P3 = dens(jit(dens(pts, 2), branch ? 0.006 : 0.009, si * 31 + 5), 2).map(([x, y]) => onBody([x, y, 1.5], [0, 0, -1])).filter(Boolean);
      if (P3.length < 2) return;
      const cum = [0];
      for (let i = 1; i < P3.length; i++) cum.push(cum[i - 1] + dist(P3[i - 1], P3[i]));
      const mn = [9, 9, 9], mx = [-9, -9, -9];
      for (const q of P3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], q[k]); mx[k] = Math.max(mx[k], q[k]); }
      splits.push({ pts: P3, cum, L: cum[cum.length - 1], wmax, glow, branch, mn, mx });
    });
  }
  /** nearest split: { d, t (0..1 arclength along it), S, w (local half-width) } or null beyond 6 cm */
  const splitAt = (P) => {
    let best = null;
    for (const S of splits) {
      if (P[0] < S.mn[0] - 0.06 || P[0] > S.mx[0] + 0.06 || P[1] < S.mn[1] - 0.06 || P[1] > S.mx[1] + 0.06 || P[2] < S.mn[2] - 0.06 || P[2] > S.mx[2] + 0.06) continue;
      for (let i = 0; i + 1 < S.pts.length; i++) {
        const a = S.pts[i], dd = sub(S.pts[i + 1], a), l2 = dot(dd, dd) || 1e-9;
        const u = clamp01(dot(sub(P, a), dd) / l2);
        const d = Math.hypot(P[0] - a[0] - dd[0] * u, P[1] - a[1] - dd[1] * u, P[2] - a[2] - dd[2] * u);
        if (d < 0.06 && (!best || d < best.d)) best = { d, t: (S.cum[i] + u * (S.cum[i + 1] - S.cum[i])) / S.L, S };
      }
    }
    if (best) {
      const S = best.S, prof = S.branch ? (1 - best.t) ** 1.3 : Math.sin(Math.PI * best.t) ** 0.75;   // branches taper from their root
      best.w = (S.branch ? 0.0004 : 0.0008) + S.wmax * prof * (0.75 + 0.5 * (0.5 + 0.5 * N.noise(best.t * 11 + S.L * 40, 0.5, 2.5)));
      best.k = prof * S.glow;
    }
    return best;
  };
  // skin slippage (epidermis sloughed off: glossy raw dermis, curled pale rims)
  const slips = [[0.17, y3 + 0.17, 1, [-0.4, 0, -1]], [-1, yB + 0.08, -0.08, [1, 0, 0.2]], [0.3, sk.lowerarm_l.head.y - 0.08, 1, [-0.3, 0, -1]], [-0.12, yW - 0.01, -1, [0, 0, 1]]]
    .map(([x, y, z, d], k) => ({ p: onBody([x, y, z], d), r: [0.05, 0.06, 0.03, 0.045][k] })).filter((q) => q.p);
  /** tiny pustules (texture only): jittered 3D cells kept by density -> 0..1 (1 = centre of a head) */
  const tiny = (P, dens) => {
    if (dens <= 0.01) return 0;
    const C = 0.017, ix = Math.floor(P[0] / C), iy = Math.floor(P[1] / C), iz = Math.floor(P[2] / C);
    let best = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let e = -1; e <= 1; e++) {
      const cx = ix + a, cy = iy + b, cz = iz + e, id = (cx * 73856093) ^ (cy * 19349663) ^ (cz * 83492791);
      if (hash(id) > dens) continue;
      const q = [(cx + hash(id + 1)) * C, (cy + hash(id + 2)) * C, (cz + hash(id + 3)) * C];
      const r = 0.0018 + 0.0035 * hash(id + 4) ** 1.5;
      const d = dist(P, q);
      if (d < r * 2.4) best = Math.max(best, 1 - d / (r * 2.4));
    }
    return best;
  };
  const pustDensity = (P) => {
    const zc = axisZ0(P[1]), c = (P[2] - zc) / (Math.hypot(P[0], P[2] - zc) || 1);
    const belly = ss(yHip - 0.1, yHip, P[1]) * (1 - ss(y3 + 0.05, y3 + 0.15, P[1])) * (0.25 + 0.3 * ss(0.3, 0.9, Math.abs(P[0]) / 0.3));
    const back = ss(-0.2, -0.6, c) * ss(yW - 0.05, yW, P[1]) * (1 - ss(yNk, yNk + 0.06, P[1])) * 0.35;
    const neck = (1 - ss(0.04, 0.09, Math.abs(P[1] - yNk))) * ss(0.04, 0.08, Math.abs(P[0])) * 0.3;
    const g = ss(-0.25, 0.45, N.fbm(P[0] * 6 + 3, P[1] * 6, P[2] * 6, 2));
    return Math.max(belly, back, neck) * g;
  };

  /** Shirt stains: sweat rings, bile down the front, pus seeping through over the boils, grime; buttons. */
  const sweat = [0.92, 0.84, 0.62], tide = [0.66, 0.58, 0.44];
  const armpits = ['l', 'r'].map((sd) => { const u = sk['upperarm_' + sd].head; return [u.x - Math.sign(u.x) * 0.04, u.y - 0.09, u.z - 0.01]; });
  const shirtStains = (P, Nn, c) => {
    const zc = axisZ0(P[1]), front = P[2] - zc > 0.02;
    for (const ap of armpits) {
      const r = dist(P, ap) + N.fbm(P[0] * 18, P[1] * 18, P[2] * 18, 2) * 0.02;
      mul(c, sweat, (1 - ss(0.06, 0.11, r)) * 0.85);
      mul(c, tide, ss(0.09, 0.105, r) * (1 - ss(0.115, 0.135, r)) * 0.7);
    }
    const col = Math.hypot(P[0], (P[1] - yNk) * 1.4, P[2] - zNk) + N.fbm(P[0] * 20, P[1] * 20, P[2] * 20, 2) * 0.012;
    mul(c, sweat, (1 - ss(0.1, 0.15, col)) * 0.7);
    mul(c, tide, ss(0.13, 0.145, col) * (1 - ss(0.15, 0.17, col)) * 0.5);
    if (!front) {
      const bk = ss(-0.15, 0.35, N.fbm(P[0] * 3 + 5, P[1] * 3, P[2] * 3, 3)) * ss(y3 - 0.1, y3 + 0.05, P[1]) * (1 - ss(yNk - 0.08, yNk, P[1]));
      mul(c, sweat, bk * 0.6);
    }
    // bile / vomit: from the collar down both front edges of the rip (wet streaks, yellow-green-brown)
    if (front && P[1] > yB - 0.05) {
      const edge = 1 - ss(0.4, 2.6, -shirtCut(P));
      const streak = ss(0.15, 0.6, N.noise(P[0] * 70, P[1] * 5, P[2] * 70) + 0.25 * N.fbm(P[0] * 9, P[1] * 9, P[2] * 9, 2));
      const top = (1 - ss(yNk - 0.05, yNk + 0.02, P[1])) * ss(yB - 0.05, yB + 0.15, P[1]);
      const k = Math.max(edge * 0.8, (1 - ss(0.05, 0.09, Math.abs(P[0]))) * 0.6) * streak * top;
      over(c, mix3(lin([128, 118, 52]), lin([96, 82, 44]), ss(-0.3, 0.4, N.noise(P[0] * 30, P[1] * 30, P[2] * 30))), k * 0.75);
    }
    // pus seeping through over the boils under the shirt: yellow-green blots with a brown tide line
    for (const L of boils) {
      const d = dist(P, L.s);
      if (d > L.r * 2.6) continue;
      const q = d / (L.r * 2.2) + N.fbm(P[0] * 40, P[1] * 40, P[2] * 40, 2) * 0.18;
      over(c, lin([112, 112, 66]), (1 - ss(0.45, 0.9, q)) * 0.5);
      mul(c, [0.72, 0.66, 0.52], ss(0.82, 0.92, q) * (1 - ss(0.95, 1.05, q)) * 0.55);
    }
    // grime: hem, the shoulders' dust
    mul(c, [0.7, 0.66, 0.58], (1 - ss(yW - 0.05, yW + 0.12, P[1])) * 0.6);
    over(c, lin([118, 112, 98]), ss(0.4, 0.9, Nn[1]) * ss(-0.2, 0.5, N.fbm(P[0] * 8, P[1] * 8, P[2] * 8, 3)) * 0.4);
    // buttons left on the left placket (2 survived, the rest torn off: thread tufts), slit buttonholes on the right
    if (front && P[1] < yOpen + 0.09 && P[1] > yB - 0.05 && Math.abs(P[0]) < 0.2 && Math.min(armSeg.ul(P).d, armSeg.ur(P).d) > 0.11) {
      const e = frontRip(P);
      for (let k = 0; k < 6; k++) {
        const by = yOpen + 0.07 - k * 0.088;
        const dy = P[1] - by;
        if (Math.abs(dy) > 0.014) continue;
        if (P[0] > -0.01) {
          const de = (e + 1.0) * 0.02, r = Math.hypot(dy, de);
          if (k === 0 || k === 2) {
            over(c, lin([158, 152, 140]), 1 - ss(0.0055, 0.0068, r));
            mul(c, [0.6, 0.58, 0.55], (1 - ss(0.0045, 0.0058, r)) * ss(0.0035, 0.0048, r));
            for (const [hx, hy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mul(c, [0.35, 0.33, 0.3], 1 - ss(0.0006, 0.0011, Math.hypot(dy - hy * 0.0016, de - hx * 0.0016)));
          } else {
            mul(c, [0.55, 0.5, 0.45], (1 - ss(0.0015, 0.003, r)) * 0.8);
            over(c, lin([60, 56, 50]), (1 - ss(0.0004, 0.0009, Math.abs(dy + N.noise(de * 900, k, 1) * 0.001))) * (1 - ss(0.0, 0.006, Math.abs(de))) * 0.6);
          }
        } else {
          const de = (e + 0.8) * 0.02;
          mul(c, [0.45, 0.42, 0.38], (1 - ss(0.0007, 0.0014, Math.abs(dy))) * (1 - ss(0.007, 0.0095, Math.abs(de))));
        }
      }
    }
  };

  // paintCloth's tear field = fbm + where - threshold: where() maps the rip field onto it (0 at the rip's edge)
  const shirtWhere = (P) => {
    const upperBack = ss(y3 - 0.06, y3 + 0.04, P[1]) * ss(0.02, -0.06, P[2] - axisZ0(P[1]));
    return Math.max(-0.5, Math.min(1.2, 0.38 + 0.25 * shirtCut(P) - 0.16 * upperBack));
  };
  let shirtCloth = null;
  if (!FAST) {
    const crop = shirtInfo.crop;
    // islands re-packed (shirtPack, x1.12: the 0.84-tall torso panel caps the scale): 1792 px carry the old 2048 px
    // texel density with 23 % fewer texels
    const SHIRT = texSize(1792);
    const src = shirtPack.remap(cropUV(await lib.texture(shirt.asset.textures.diffuse, 2048), crop, 2048, lib.resize), SHIRT);
    let mL = 0, nL = 0;
    for (let i = 0; i < src.data.length; i += 4) { const l = lum([S2L[src.data[i]], S2L[src.data[i + 1]], S2L[src.data[i + 2]]]); if (l > 0.004) { mL += l; nL++; } }
    mL /= Math.max(1, nL);
    // the chambray's weave and baked folds as a luminance ratio over a washed-out, sun-bleached blue work shirt
    // (blue against the olive skin and the brown trousers: the shirt never merges with the body at range)
    const CHAMB = lin([114, 126, 141]);
    const base = grade(src, (c) => { const k = Math.min(1.4, Math.max(0.5, (lum(c) / mL) ** 0.8)); for (let i = 0; i < 3; i++) c[i] = CHAMB[i] * k; });
    TR.snap('shirt: graded source', base, shirt);
    shirtCloth = lib.paintCloth(shirt, {
      seed: 31, human: h, base,
      normal: shirtPack.remap(cropUV(await lib.texture(shirt.asset.textures.normal, 2048), crop, 2048, lib.resize), texSize(1024)),
      ao: shirtPack.remap(cropUV(await lib.texture(shirt.asset.textures.ao, 2048), crop, 2048, lib.resize), texSize(1024)),
      size: 1792, normalSize: 1024, ormSize: 896,   // (the painter's box filter needs size / ormSize integral)
      fade: 0.12, grime: 0.5, grimeNoise: 0.8, weave: 0.5, yellow: 0, innerDarken: 0,
      blood: { collar: 0, hands: 0, splatter: 0, edges: 0 },
      tear: { amount: 0.2, scale: 7, stretch: 0.5, fray: 0.8, where: shirtWhere, threadColor: lin([176, 178, 172]) },
      extra: (P, Nn, c) => shirtStains(P, Nn, c),
    });
    console.log(`${TAG} shirt: ${shirtCloth.removedFaces} faces torn away`);
    TR.snap('shirt: painted', shirtCloth.albedo, shirt);
    if (process.env.BLOATER_DUMP) { lib.savePNG(lib.resize(shirtCloth.albedo, 1024, 1024), `${process.env.BLOATER_DUMP}/shirt_albedo.png`); lib.savePNG(lib.resize(base, 1024, 1024), `${process.env.BLOATER_DUMP}/shirt_base.png`); }
  }
  if (FAST) {
    let n = 0;
    shirt.obj.faces.forEach((f, fi) => {
      if (!shirt.keep[fi]) return;
      const pts = f.v.map((v) => [shirt.pos[v * 3], shirt.pos[v * 3 + 1], shirt.pos[v * 3 + 2]]);
      const cen = [0, 1, 2].map((k) => pts.reduce((a, p) => a + p[k], 0) / pts.length);
      if ([...pts, cen].every((p) => shirtCut(p) > 0.3)) { shirt.keep[fi] = 0; n++; }
    });
    console.log(`${TAG} shirt: ${n} faces torn away`);
  }
  // keep the skin under the big rips AND under every small tear (the deleted faces showed the shirt's dark inside
  // through each hole: black "glyphs" on the back and shoulders)
  const keepSkin = (p) => inShirt(p) && (shirtCut(p) > -0.6 || !!shirtCloth?.holeAt(p, 0.12));
  h.hideCovered(body, keepSkin);
  // inside the shoes
  body.obj.faces.forEach((f, fi) => { if (body.keep[fi] && f.v.every((v) => h.pos[v * 3 + 1] < shoeTop - 0.02)) body.keep[fi] = 0; });

  // ---------------------------------------------------------------- the tongue: swollen, lolling out over the lower lip
  // (~190 tris: a Catmull-Rom resampled centre line, 10 sides with a welded seam -> smooth normals, and a rounded
  // tip from three shrinking rings + a small fan instead of the old flat-cut hexagon)
  const tongueG = new Geo();
  {
    const mo = A.mouth;
    const ctrl = [[0, mo[1] + 0.002, mo[2] - 0.045], [0, mo[1] - 0.002, mo[2] - 0.02], [0.002, mo[1] - 0.007, mo[2] + 0.0], [0.004, mo[1] - 0.016, mo[2] + 0.012], [0.006, mo[1] - 0.029, mo[2] + 0.015]];
    const cr = (t) => {   // Catmull-Rom through ctrl, t 0..1
      const f = t * (ctrl.length - 1), i = Math.min(ctrl.length - 2, Math.floor(f)), u = f - i;
      const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
      return [0, 1, 2].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u * u + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u * u * u));
    };
    const body = 7, rad = (t) => 0.0165 * (1 - 0.28 * t * t) * (t < 0.1 ? 0.8 + 2 * t : 1);
    const pts = [], rs = [];
    for (let i = 0; i < body; i++) { const t = i / (body - 1); pts.push(cr(t)); rs.push(rad(t)); }
    const end = pts[body - 1], Te = norm(sub(end, pts[body - 2])), rEnd = rs[body - 1];
    for (const ph of [32, 58, 78]) { const a = ph * Math.PI / 180; pts.push(madd(end, Te, rEnd * 0.75 * Math.sin(a))); rs.push(rEnd * Math.cos(a)); }
    tube(tongueG, pts, (t, i) => rs[i], 10, [0.02, 0.05, 0.98, 0.95], [['head', 1]], { ref: [0, 0, 1], flat: 0.5, tip: 0.55 });
  }
  const tongue = toPart(lib, h, tongueG, 'tongue', 'gore', () => [['head', 1]]);

  // ================================================================ body: region-weighted simplification
  // the visible belly dome is smooth-subdivided first (its outline was visibly polygonal up close): the trunk pass
  // then simplifies ~4x the faces down to its budget, keeping vertices where the dome / boils curve
  const domeFace = (f) => f.v.every((v) => {
    const p = [h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]];
    if (p[1] < yHip - 0.14 || p[1] > y3 + 0.07 || armW(v) > 0.3 || legW(v) > 0.45) return false;
    const rz = p[2] - axisZ0(p[1]);
    return rz / (Math.hypot(p[0], rz) || 1) > -0.4;
  });
  const bodyS = subdivideRegion(lib, body, domeFace, h.skeleton.bones);
  const wP = (re) => { const ids = new Set(h.skeleton.bones.filter((b) => re.test(b.name)).map((b) => b.index)); return (v) => bodyS.weights[v].reduce((a, [b, w]) => a + (ids.has(b) ? w : 0), 0); };
  const headW = wP(/^(head|neck_01)$/), handW = wP(/^(hand|thumb|index|middle|ring|pinky)/);
  const armP = wP(/^(clavicle|upperarm|lowerarm|hand|thumb|index|middle|ring|pinky)/), legP = wP(/^(thigh|calf|foot|ball)/);
  const bellyRegion = (v) => { const y = bodyS.pos[v * 3 + 1]; return y > yHip - 0.15 && y < y3 + 0.2 && armP(v) < 0.5 && legP(v) < 0.5; };
  // the cranium gets its own budget: low curvature, so the face-weighted pass left it in big flat facets
  const eyeYr = (A.eyeL[1] + A.eyeR[1]) / 2, earZ = (A.eyeL[2] + A.eyeR[2]) / 2 - 0.09;
  const cranium = (v) => headW(v) > 0.5 && (bodyS.pos[v * 3 + 1] > eyeYr + 0.03 || bodyS.pos[v * 3 + 2] < earZ);
  const bodyLow = await simplifyRegions(lib, bodyS, [
    { name: 'cranium', test: cranium, tris: 620, attrW: [1.5, 1.5, 1.5, 1, 1] },
    { name: 'head', test: (v) => headW(v) > 0.5, tris: 1180, attrW: [1.2, 1.2, 1.2, 1, 1] },
    { name: 'hands', test: (v) => handW(v) > 0.5, tris: 420 },
    { name: 'trunk', test: bellyRegion, tris: 2150, attrW: [1.4, 1.4, 1.4, 1, 1] },
    { name: 'rest', test: () => true, tris: 850 },
  ]);

  // ================================================================ materials
  const parts = [bodyLow, shirt, trousers, shoes, eyes, teeth, tongue];
  if (FAST) {
    const flat = (rgb, ro = 0.8) => ({ color: [...lin(rgb), 1], roughness: ro, metalness: 0 });
    bodyLow.material = lib.material('skin', flat([128, 132, 112], 0.55));
    shirt.material = lib.material('cloth', { ...flat([170, 166, 150], 0.85), doubleSided: true });
    trousers.material = lib.material('cloth', { ...flat([86, 80, 66], 0.85), doubleSided: true });
    shoes.material = lib.material('cloth', flat([70, 62, 54], 0.7));
    eyes.material = lib.material('eye', flat([200, 220, 60], 0.2));
    teeth.material = lib.material('teeth', flat([180, 160, 120], 0.4));
    tongue.material = lib.material('gore', flat([90, 50, 70], 0.35));
  } else {
    // ---------------------------------------------------------------- skin
    // Bloat-stage corpse (real decomposition reference: the abdomen turns green first, hemoglobin stains the veins
    // into a dark "marbling" network, the epidermis slips, the skin is stretched glossy and taut): the CC0
    // middle-aged male skin's pores / wrinkles / lips as a luminance ratio over our own grey-olive palette.
    const src = await lib.texture('system', 'skins/middleage_caucasian_male/middleage_lightskinned_male_diffuse.png', 2048);
    let mL = 0, nL = 0;
    for (let i = 0; i < src.data.length; i += 4) { const l = lum([S2L[src.data[i]], S2L[src.data[i + 1]], S2L[src.data[i + 2]]]); if (l > 0.02) { mL += l; nL++; } }
    mL /= Math.max(1, nL);
    const PAL = lin([130, 140, 114]);
    const skinBase = grade(lib.cloneImage(src), (c) => {
      const k = Math.min(1.5, (lum(c) / mL) ** 0.75), s0 = lum(PAL) / mL;
      for (let i = 0; i < 3; i++) c[i] = lerp(PAL[i] * k, c[i] * s0, 0.15);
    });
    TR.snap('skin: graded source', skinBase, bodyLow);
    const eyeY = (A.eyeL[1] + A.eyeR[1]) / 2;
    const headIdx = sk.head.index;
    let HC = [0, 0, 0], nHC = 0;
    for (const v of h.baseObj.groupVerts('body')) if (h.weights[v].some(([b, w]) => b === headIdx && w > 0.8)) { HC = add(HC, [h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]]); nHC++; }
    HC = scl(HC, 1 / Math.max(1, nHC));
    const tips = [];
    for (const sd of ['l', 'r']) for (const fn of ['thumb', 'index', 'middle', 'ring', 'pinky']) { const b = sk[`${fn}_03_${sd}`]; if (b) tips.push(V(b.tail)); }
    const mo = A.mouth;
    // ooze drips run down from the widest stretch of the main tears
    const drips = splits.filter((S) => !S.branch).flatMap((S, si) => [0.38, 0.6].map((t, k) => {
      const i = Math.min(S.pts.length - 2, Math.floor(t * (S.pts.length - 1))), f = t * (S.pts.length - 1) - i;
      return { o: lerp3(S.pts[i], S.pts[i + 1], f), len: 0.03 + 0.045 * hash(si * 9 + k), w: 0.0026 + 0.0016 * hash(si * 5 + k + 3), ph: hash(si * 3 + k) * 6 };
    }));
    const armSegs = [boneSeg(sk.upperarm_l), boneSeg(sk.upperarm_r), boneSeg(sk.lowerarm_l), boneSeg(sk.lowerarm_r)];
    const aw0 = (P) => { let m = 0; for (const f of armSegs) { const a = f(P); if (a.t > 0.05 && a.t < 1.05) m = Math.max(m, 1 - ss(0.06, 0.1, a.d)); } return m; };
    const skinExtra = (P, Nn, c, st) => {
      const zc = axisZ0(P[1]), rz = P[2] - zc, rh = Math.hypot(P[0], rz) || 1, cf = rz / rh;
      const trunk = ss(yHip - 0.14, yHip - 0.02, P[1]) * (1 - ss(yNk - 0.04, yNk + 0.03, P[1]));
      // the head and neck carry the same bloat stage as the body (they read as two different corpses before)
      const headK = ss(yNk - 0.06, yNk + 0.02, P[1]) * (1 - aw0(P));
      const bellyZ = ss(yHip - 0.12, yHip, P[1]) * (1 - ss(y3 + 0.02, y3 + 0.14, P[1])) * ss(-0.25, 0.5, cf);
      // putrefaction green over the belly (patchy, strongest low on the right), dusky violet marbling patches
      const gn = N.fbm(P[0] * 4 + 1, P[1] * 4, P[2] * 4, 3);
      over(c, lin([104, 124, 86]), bellyZ * (0.3 + 0.3 * ss(-0.2, 0.5, gn) + 0.12 * ss(0, -0.2, P[0])));
      over(c, lin([108, 122, 88]), headK * (0.16 + 0.34 * ss(-0.1, 0.5, N.fbm(P[0] * 7 + 4, P[1] * 7, P[2] * 7, 3))));
      // purple-violet bloat discoloration in big patches (taut purple-green: the belly, the flanks, the chest, the face)
      const vp = ss(-0.05, 0.45, N.fbm(P[0] * 4.2 + 7, P[1] * 4.2, P[2] * 4.2, 3));
      over(c, mix3(lin([120, 92, 120]), lin([102, 76, 102]), ss(0.4, 0.9, vp)), vp * (0.36 + 0.28 * trunk + 0.15 * bellyZ + 0.26 * headK));
      // grey-green / violet-grey patchwork at a smaller scale (no flat tone anywhere)
      const pw = N.fbm(P[0] * 13 + 2, P[1] * 13, P[2] * 13, 3);
      mul(c, [0.94, 1.02, 0.9], ss(0.1, 0.5, pw) * 0.5);
      mul(c, [1.0, 0.9, 1.04], ss(0.1, 0.5, -pw) * 0.5);
      // dependent livor: purple-red low on the back and the flanks
      mul(c, [0.9, 0.8, 0.94], ss(0.0, -0.7, cf) * trunk * 0.45);
      // venous marbling: a dark branching network (green-black / purple-brown), raised a touch
      const wx = N.fbm(P[0] * 4, P[1] * 4, P[2] * 4 + 3, 2) * 0.035, wy = N.fbm(P[0] * 4 + 5, P[1] * 4, P[2] * 4, 2) * 0.035;
      const mv = Math.max(N.ridged((P[0] + wx) * 13, (P[1] + wy) * 10, (P[2] - wx) * 13, 2), N.ridged((P[0] - wy) * 30 + 4, (P[1] + wx) * 24, P[2] * 30, 2) * 0.93);
      const marb = ss(0.8, 0.95, mv) * ss(-0.3, 0.35, N.fbm(P[0] * 2.6 + 9, P[1] * 2.6, P[2] * 2.6, 2) + 0.25 * headK) * (0.55 + 0.45 * Math.max(trunk, headK));
      over(c, mix3(lin([54, 66, 46]), lin([76, 46, 80]), ss(-0.3, 0.3, N.noise(P[0] * 8, P[1] * 8, P[2] * 8))), marb * 0.78);
      st.h += marb * 0.35;
      // pores, oily sheen; the taut belly is glossy
      const pore = 1 - ss(0.1, 0.24, N.worley(P[0] * 380, P[1] * 380, P[2] * 380));
      st.h -= pore * 0.22; mul(c, [0.92, 0.9, 0.9], pore * 0.2);
      // roughness: dry, stretched skin (0.58-0.76, patchy) everywhere; only the taut belly dome is glossy, and the wet
      // spots (pustules, splits, slippage, drool, drips) go lower locally below (the arms read as latex before)
      if (st.ro > 0.45) st.ro = lerp(0.58, 0.76, ss(-0.35, 0.45, N.fbm(P[0] * 6 + 11, P[1] * 6, P[2] * 6, 3)));
      st.ro = lerp(st.ro, 0.36, bellyZ * 0.8);
      st.ro = lerp(st.ro, 0.52, headK * 0.5);   // oily face
      // stretch marks: oblique striae over the belly's flanks and under it, purple-red fresh / silvery old
      {
        const sideK = ss(0.35, 0.8, Math.abs(P[0]) / rh);
        const zone = ss(yHip - 0.08, yHip + 0.02, P[1]) * (1 - ss(y3 - 0.04, y3 + 0.06, P[1])) * Math.max(sideK, (1 - ss(yB - 0.1, yB - 0.03, P[1])) * ss(0, 0.5, cf)) * ss(-0.3, 0.2, cf + 0.3);
        if (zone > 0) {
          const ph = (P[1] + 0.38 * Math.abs(P[0]) + N.fbm(P[0] * 12, P[1] * 12, P[2] * 12, 2) * 0.01) / 0.012 * Math.PI;
          const line = ss(0.9, 0.985, Math.abs(Math.sin(ph))) * ss(-0.05, 0.35, N.noise(P[0] * 28, P[1] * 70, P[2] * 28)) * zone;
          over(c, mix3(lin([150, 96, 116]), lin([176, 164, 168]), ss(-0.3, 0.4, N.noise(P[0] * 6, P[1] * 6, P[2] * 6))), line * 0.7);
          st.h -= line * 0.55; st.ro = lerp(st.ro, 0.25, line * 0.6);
        }
      }
      // boils: bruised halo, inflamed ring, a tight glossy pus head (some small ones burst: crater + crust + dribble)
      for (const L of boils) {
        const d = dist(P, L.s);
        if (d > L.r * 2.2) continue;
        const q = d / L.r + N.noise(P[0] * 160, P[1] * 160, P[2] * 160) * 0.06;
        over(c, lin([148, 146, 92]), (1 - ss(0.9, 1.9, q)) * 0.32);
        const vr = N.ridged(P[0] * 70, P[1] * 70, P[2] * 70, 2);
        over(c, lin([70, 62, 66]), ss(0.8, 0.94, vr) * (1 - ss(0.8, 2.1, q)) * ss(0.5, 0.9, q) * 0.6);
        over(c, lin([126, 80, 100]), (1 - ss(0.6, 1.05, q)) * ss(0.18, 0.45, q) * 0.5);
        if (L.burst) {
          const cr = 1 - ss(0.2, 0.42, q);
          over(c, lin([92, 70, 40]), cr * 0.9); over(c, lin([46, 34, 22]), (1 - ss(0.08, 0.22, q)) * 0.8);
          st.h -= cr * 0.8; st.ro = lerp(st.ro, 0.35, cr);
        } else {
          // a tight, translucent pus head: dull yellow-green at its edge, pale and bright in the middle, a dark rim
          const hs = L.big ? 0.3 : 0.36;
          const hd = 1 - ss(hs * 0.55, hs, q);
          over(c, mix3(lin([146, 140, 72]), lin([200, 198, 120]), 1 - ss(0, hs * 0.8, q)), hd * 0.9);
          mul(c, [0.78, 0.7, 0.62], ss(hs * 0.75, hs, q) * (1 - ss(hs, hs * 1.45, q)) * 0.55);
          over(c, lin([226, 224, 170]), (1 - ss(0.0, hs * 0.3, q)) * 0.45);
          st.ro = lerp(st.ro, 0.14, 1 - ss(0.3, 0.75, q));
          st.h += hd * 0.5;
        }
        st.h += Math.max(0, 1 - q * q) * (L.big ? 1.1 : 0.7);
        // a burst boil's dribble: dried pus runs down from it
        if (L.burst && P[1] < L.s[1] && L.s[1] - P[1] < L.r * 3) {
          const dx = Math.abs(P[0] - L.s[0] - N.noise(P[1] * 40, L.r * 90, 0.5) * 0.004);
          const k = (1 - ss(0.0015, 0.003, dx)) * (1 - ss(L.r * 1.5, L.r * 3, L.s[1] - P[1])) * ss(-0.3, 0.3, Nn[2] * Math.sign(L.n[2] || 1));
          over(c, lin([132, 118, 54]), k * 0.7);
        }
      }
      // tiny pustule clusters (texture only)
      const tp = tiny(P, pustDensity(P));
      if (tp > 0) {
        over(c, lin([126, 84, 102]), ss(0.0, 0.4, tp) * (1 - ss(0.4, 0.75, tp)) * 0.4);
        over(c, lin([206, 200, 116]), ss(0.45, 0.8, tp) * 0.9);
        st.h += tp * 0.7; st.ro = lerp(st.ro, 0.18, ss(0.4, 0.8, tp));
      }
      // belly splits: glowing meat in the gap (bright in the middle, dull red-brown where it pinches out), swollen
      // raised lips of raw skin, a dark wet rim, a bruised halo and hairline cracks radiating into the taut skin
      const sp = splitAt(P);
      if (sp) {
        const w = sp.w, k = sp.k;
        const d = sp.d + N.noise(P[0] * 220, P[1] * 220, P[2] * 220) * 0.0011;
        const halo = 1 - ss(w, w + 0.03, d);
        over(c, lin([112, 70, 92]), halo * 0.38);
        // hairline cracks: thin ridged lines round each tear, fading with distance
        const cr = N.ridged(P[0] * 120 + sp.S.L * 30, P[1] * 120, P[2] * 120, 2);
        const crack = ss(0.88, 0.965, cr) * (1 - ss(w + 0.004, w + 0.026, d)) * ss(w, w + 0.003, d);
        over(c, lin([118, 40, 50]), crack * 0.8); st.h -= crack * 0.55; st.ro = lerp(st.ro, 0.3, crack);
        if (d < w) {
          const core = 1 - d / w;
          over(c, mix3(lin([150, 92, 58]), lin([214, 222, 128]), ss(0.15, 0.7, k) * ss(0.0, 0.6, core)), 0.96);
          st.ro = 0.08; st.h -= 1.4 * core;
        } else {
          // the torn edge: a narrow band of raw skin (ragged width), slightly raised, then a wet darker margin
          const lw = 0.0018 + 0.0022 * k + 0.0015 * (0.5 + 0.5 * N.noise(P[0] * 300, P[1] * 300, P[2] * 300));
          const lip = 1 - ss(0, lw, d - w);
          over(c, mix3(lin([150, 64, 66]), lin([132, 84, 86]), ss(0, lw, d - w)), lip * 0.75);
          st.h += Math.sin(Math.PI * clamp01((d - w) / (lw * 1.6))) * 0.7 * (0.4 + 0.6 * k);
          const rim = ss(lw * 0.8, lw * 1.3, d - w) * (1 - ss(lw * 1.6, lw * 2.6, d - w));
          over(c, lin([84, 52, 60]), rim * 0.32 * (0.5 + 0.5 * k));
          st.ro = lerp(st.ro, 0.18, Math.max(lip, rim * 0.7));
        }
      }
      for (const D of drips) {
        const dy = D.o[1] - P[1];
        if (dy < -0.002 || dy > D.len + 0.01 || Math.abs(P[2] - D.o[2]) > 0.08) continue;
        const cx = D.o[0] + Math.sin(dy * 60 + D.ph) * 0.002 + dy * 0.05 * Math.sign(D.o[0] || 1);
        const ww = D.w * (1 - 0.4 * dy / D.len) * (1 + 0.8 * Math.exp(-(((dy - D.len) / 0.005) ** 2)));
        const k = (1 - ss(ww * 0.6, ww, Math.abs(P[0] - cx))) * (1 - ss(D.len, D.len + 0.006, dy));
        if (k > 0) { over(c, lin([178, 182, 86]), k * 0.85); st.ro = lerp(st.ro, 0.1, k); st.h += k * 0.4; }
      }
      // skin slippage: raw glossy dermis under a ragged rim of curled, pale dead epidermis
      for (const S of slips) {
        const d = dist(P, S.p) * (1 + 0.45 * N.fbm(P[0] * 11 + S.r * 40, P[1] * 11, P[2] * 11, 3)) + N.fbm(P[0] * 55, P[1] * 55, P[2] * 55, 2) * 0.006;
        if (d > S.r + 0.012) continue;
        const isle = ss(0.35, 0.55, N.fbm(P[0] * 70, P[1] * 70, P[2] * 70, 2)) * (1 - ss(0.3, 0.7, d / S.r));
        const raw = (1 - ss(S.r * 0.8, S.r, d)) * (1 - isle * 0.8);
        over(c, mix3(lin([146, 98, 98]), lin([118, 74, 84]), ss(-0.2, 0.5, N.noise(P[0] * 50, P[1] * 50, P[2] * 50))), raw * 0.82);
        st.ro = lerp(st.ro, 0.24, raw); st.h -= raw * 0.4;
        const rim = 1 - ss(0.0, 0.006, Math.abs(d - S.r));
        over(c, lin([192, 184, 160]), rim * 0.75); st.h += rim * 0.9;
      }
      // the face: dusky violet swollen cheeks / jowls, bruised puffy lids, dark violet everted lips
      if (P[1] > yNk - 0.02) {
        const front = ss(0.0, 0.5, Nn[2]);
        for (const e of [A.eyeL, A.eyeR]) {
          const dd = Math.hypot((P[0] - e[0]) / 0.032, (P[1] - e[1] + 0.006) / 0.022, (P[2] - e[2]) / 0.03);
          over(c, lin([104, 80, 100]), (1 - ss(0.5, 1.3, dd)) * 0.55 * front);
          over(c, lin([132, 90, 104]), (1 - ss(0.25, 0.55, dd)) * 0.4 * front);
          const cheek = Math.hypot((P[0] - e[0] * 1.5) / 0.03, (P[1] - (eyeY - 0.045)) / 0.03, (P[2] - (e[2] - 0.02)) / 0.035);
          over(c, lin([132, 100, 116]), (1 - ss(0.4, 1.3, cheek)) * 0.3);
        }
        // asymmetric violet-grey decay over the left side of the face and round the mouth
        const fd = ss(-0.1, 0.45, N.fbm(P[0] * 9 + 2, P[1] * 9, P[2] * 9, 3) + ss(-0.02, 0.06, P[0]) * 0.35);
        over(c, lin([110, 88, 108]), fd * 0.45);
        const dm = Math.hypot((P[0] - mo[0]) / 0.03, (P[1] - mo[1]) / 0.02, (P[2] - mo[2]) / 0.03);
        over(c, lin([100, 84, 96]), (1 - ss(1.0, 2.2, dm)) * 0.35);
        over(c, lin([96, 60, 82]), (1 - ss(0.6, 1.0, dm)) * 0.7);
        // mouth interior (behind the lips): dark wet purple-red
        if (Math.abs(P[0] - mo[0]) < 0.03 && Math.abs(P[1] - mo[1]) < 0.026 && P[2] < mo[2] - 0.004) {
          const k = ss(mo[2] - 0.004, mo[2] - 0.014, P[2]);
          over(c, lin([66, 30, 40]), k * 0.92); st.ro = lerp(st.ro, 0.2, k);
        }
        // bile drool: from both mouth corners down the chin and the neck rolls (wet, yellow-green-brown)
        if (P[1] < mo[1] + 0.006 && P[2] > zNk - 0.02 && Nn[2] > -0.3) {
          for (const sx of [1, -0.6]) {
            const dy = mo[1] - 0.004 - P[1];
            if (dy < 0 || dy > 0.24) continue;
            const cx = mo[0] + sx * 0.02 + sx * dy * 0.08 + N.noise(dy * 18, sx * 3, 0.3) * 0.01;
            const w = 0.005 * (1 - 0.5 * dy / 0.24) + 0.0015;
            const k = (1 - ss(w * 0.55, w, Math.abs(P[0] - cx))) * (1 - ss(0.17, 0.24, dy)) * (sx > 0 ? 1 : 0.7);
            if (k > 0) { over(c, mix3(lin([108, 106, 58]), lin([88, 82, 46]), ss(0.05, 0.2, dy)), k * 0.7); st.ro = lerp(st.ro, 0.1, k); st.h += k * 0.3; }
          }
          const chin = (1 - ss(0.4, 1.1, Math.hypot((P[0] - mo[0]) / 0.03, (P[1] - mo[1] + 0.03) / 0.022, (P[2] - mo[2] + 0.005) / 0.03)));
          over(c, lin([96, 92, 56]), chin * ss(0.1, 0.5, N.fbm(P[0] * 50, P[1] * 50, P[2] * 50, 2) + 0.3) * 0.4);
        }
        // balding: a horseshoe fringe of cropped grey-brown hair round the back and sides, bare crown; stubble
        if (P[1] > eyeY - 0.13) {
          const aa = Math.abs(Math.atan2(P[0] - HC[0], P[2] - HC[2])) * 180 / Math.PI;
          const top = eyeY + 0.035 + 0.035 * ss(95, 170, aa) + N.fbm(P[0] * 30, P[1] * 30, P[2] * 30, 2) * 0.012;
          const bot = lerp(eyeY + 0.018, eyeY - 0.11, ss(110, 150, aa));
          const hk = ss(72, 98, aa) * (1 - ss(top - 0.006, top + 0.006, P[1])) * ss(bot - 0.008, bot + 0.008, P[1]);
          if (hk > 0) {
            const strand = 0.55 + 0.45 * N.noise(P[0] * 420, P[1] * 110, P[2] * 420);
            over(c, lin([94, 88, 80]), hk * 0.6 * strand); st.h += hk * 0.25 * strand; st.ro = lerp(st.ro, 0.62, hk);
          }
          if (aa < 70 && P[1] < mo[1] + 0.03 && P[1] > mo[1] - 0.085 && dm > 1.1) {
            const dots = 1 - ss(0.12, 0.28, N.worley(P[0] * 700, P[1] * 700, P[2] * 700));
            over(c, lin([72, 68, 64]), dots * 0.35 * ss(0.0, 0.4, Nn[2] + 0.2));
          }
        }
      }
      // necrotic, swollen fingertips and filthy hands
      let dt = 1;
      for (const t of tips) dt = Math.min(dt, dist(P, t));
      mul(c, [0.62, 0.52, 0.64], (1 - ss(0.008, 0.035, dt)) * 0.75);
      const dh = Math.min(dist(P, A.handL), dist(P, A.handR));
      over(c, lin([84, 74, 60]), (1 - ss(0.03, 0.12, dh)) * ss(-0.2, 0.5, N.fbm(P[0] * 25, P[1] * 25, P[2] * 25, 3)) * 0.5);
    };
    const skin = lib.paintSkin(h, {
      seed: 19, base: skinBase, size: 2048, normalSize: 1024, ormSize: 1024,
      pallor: 0, mottle: 0.35, veins: 0.35, bruises: 0.2, socket: 0.55, lips: 0.5, grime: 0.3,
      coveredDarken: 0.25, coveredShade: 0.08, normalStrength: 2.2, bumpStrength: 2.4, roughness: 0.5,
      blood: {},
      extra: skinExtra,
    });
    TR.snap('skin: painted', skin.albedo, bodyLow);
    // emissive: the pus heads, the tiny pustules, the meat inside the splits (and a faint halo round them)
    const GLOW = [0.62, 1.0, 0.14];
    const ES = texSize(1024);
    const emBase = nsurf(h.basePart({ name: 'em' }));
    const em = bakeField(emBase, h.baseObj.uvs, ES, (P) => {
      let e = 0;
      for (const L of boils) { if (L.burst) continue; const q = dist(P, L.s) / L.r, hs = L.big ? 0.3 : 0.36; if (q < hs) e = Math.max(e, (1 - ss(0, hs, q)) ** 1.5 * L.glow); }
      e = Math.max(e, ss(0.5, 0.85, tiny(P, pustDensity(P))) * 0.55);
      const sp = splitAt(P);
      if (sp) e = Math.max(e, (1 - ss(sp.w * 0.5, sp.w * 1.15, sp.d)) * (0.3 + 0.7 * sp.k), (1 - ss(sp.w, sp.w + 0.016, sp.d)) * 0.14 * sp.k);
      return e;
    }, { fill: 0, blur: 0 });
    const skinEm = createImage(ES, ES, [0, 0, 0, 255]);
    for (let i = 0; i < ES * ES; i++) for (let k = 0; k < 3; k++) skinEm.data[i * 4 + k] = toByte(GLOW[k] * em[i]);

    // ---------------------------------------------------------------- trousers: brown work trousers, filthy
    const tcrop = trouserInfo.crop;
    const tsrc = cropUV(await lib.texture(trousers.asset.textures.diffuse, 2048), tcrop, texSize(1024), lib.resize);
    let tL = 0, tN = 0;
    for (let i = 0; i < tsrc.data.length; i += 4) { const l = lum([S2L[tsrc.data[i]], S2L[tsrc.data[i + 1]], S2L[tsrc.data[i + 2]]]); if (l > 0.004) { tL += l; tN++; } }
    tL /= Math.max(1, tN);
    const BROWN = lin([120, 108, 86]);   // dusty tan work trousers (the brown read near-black in the arena's shade)
    const tbase = grade(tsrc, (c) => { const k = Math.min(1.5, Math.max(0.3, (lum(c) / tL) ** 0.85)); for (let i = 0; i < 3; i++) c[i] = BROWN[i] * k; });
    const crotch = [0, yHip - 0.1, axisZ0(yHip) + 0.09];
    const trouserStains = (P, Nn, c) => {
      // purge fluid soaked down the front from under the belly: dark, wet, greenish-brown streaks
      const dy = yFrontCut - P[1];
      if (dy > -0.02 && dy < 0.5 && Nn[2] > -0.1) {
        const streak = ss(0.1, 0.55, N.noise(P[0] * 55, P[1] * 4, P[2] * 55) + 0.3 * N.fbm(P[0] * 6, P[1] * 6, P[2] * 6, 2));
        const k = streak * (1 - ss(0.08, 0.5, dy)) * ss(-0.1, 0.4, Nn[2]);
        over(c, lin([60, 58, 38]), k * 0.6);
      }
      mul(c, [0.72, 0.7, 0.62], (1 - ss(0.03, 0.09, dist(P, crotch))) * 0.7);
      const knee = Math.min(dist(P, add(V(sk.calf_l.head), [0, 0, 0.07])), dist(P, add(V(sk.calf_r.head), [0, 0, 0.07])));
      over(c, lin([82, 74, 60]), (1 - ss(0.03, 0.1, knee)) * ss(-0.3, 0.3, N.fbm(P[0] * 20, P[1] * 20, P[2] * 20, 3)) * 0.6);
      over(c, lin([66, 58, 46]), (1 - ss(0.1, 0.32, P[1])) * ss(-0.2, 0.4, N.fbm(P[0] * 14, P[1] * 9, P[2] * 14, 3)) * 0.7);
      // dusty seat and backs of the legs (keeps the lower half from reading as one dark mass)
      over(c, lin([118, 108, 90]), ss(0.1, -0.6, Nn[2]) * ss(-0.2, 0.5, N.fbm(P[0] * 7, P[1] * 7, P[2] * 7, 3)) * 0.3);
    };
    const tcloth = lib.paintCloth(trousers, {
      seed: 47, human: h, base: tbase,
      normal: cropUV(await lib.texture(trousers.asset.textures.normal, 2048), tcrop, texSize(512), lib.resize),
      ao: cropUV(await lib.texture(trousers.asset.textures.ao, 2048), tcrop, texSize(512), lib.resize),
      size: 1024, normalSize: 512, ormSize: 512,
      fade: 0.15, grime: 0.7, grimeNoise: 0.9, weave: 0.3, innerDarken: 0, blood: {},
      extra: (P, Nn, c) => trouserStains(P, Nn, c),
    });
    TR.snap('trousers: painted', tcloth.albedo, trousers);

    // ---------------------------------------------------------------- AO -> ORM occlusion only (never the albedo)
    const RA = texSize(512);
    const baseS = nsurf(h.basePart({ name: 'ao' }));
    const trS = nsurf(trousers), shS = nsurf(shirt), shoeS = nsurf(shoes);
    {
      const occ = makeBVH([baseS, trS, shoeS]).bvh;
      const ao = bakeField(baseS, h.baseObj.uvs, RA, occTracer(occ, { rays: 16, maxDist: 0.1 }));
      // the torn shirt's contact shadow: rays pass through the rips
      const shirtB = makeBVH([shS]).bvh;
      const opaque = (hit) => shirtCut([hit.point.x, hit.point.y, hit.point.z]) < -0.15;
      const shade = bakeField(baseS, h.baseObj.uvs, RA, occTracer(shirtB, { rays: 12, maxDist: 0.06, opaque, seed: 7 }));
      applyOcclusion(skin.orm, [ao, shade], RA, (a, s2) => lerp(1, a, 0.85) * lerp(1, s2, 0.85));
    }
    {
      const occ = makeBVH([baseS, trS, shS, shoeS]).bvh;
      const opaqueAll = (hit) => shirtCut([hit.point.x, hit.point.y, hit.point.z]) < -0.15;
      const a1 = bakeField(shS, shirt.obj.uvs, RA, occTracer(occ, { rays: 14, maxDist: 0.1, opaque: opaqueAll }));
      applyOcclusion(shirtCloth.orm, [a1], RA, (a) => lerp(1, a, 0.7));
      const a2 = bakeField(trS, trousers.obj.uvs, RA, occTracer(occ, { rays: 14, maxDist: 0.12, opaque: opaqueAll }));
      applyOcclusion(tcloth.orm, [a2], RA, (a) => lerp(1, a, 0.75));
    }
    bodyLow.material = lib.material('skin', { ...skin, emissiveMap: skinEm, emissive: [1, 1, 1] });
    // 6-bit colour + binary alpha (the GLB writer's own pngBits quantizer zeroes RGB under alpha 0: every torn edge
    // filtered / mipmapped to a black fringe); the cut texels keep the painted cloth colour
    {
      const d = shirtCloth.albedo.data;
      for (let i = 0; i < d.length; i += 4) { for (let k = 0; k < 3; k++) d[i + k] = Math.min(255, Math.round(d[i + k] / 4) * 4); d[i + 3] = d[i + 3] < 128 ? 0 : 255; }
    }
    shirt.material = lib.material('cloth', { ...shirtCloth, alpha: shirtCloth.alpha, doubleSided: true, pngBits: 8 });
    trousers.material = lib.material('cloth', { ...tcloth, doubleSided: true });

    // ---------------------------------------------------------------- shoes: scuffed casual leather, filthy grey socks
    const shoeTex = await lib.texture(shoes.asset.textures.diffuse, 1024);
    const shoeImg = lib.grungeTexture(grade(lib.cloneImage(shoeTex), (c) => {
      const l = lum(c), mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]), sat = mx > 0 ? (mx - mn) / mx : 0;
      const sock = ss(0.25, 0.45, l) * (1 - ss(0.12, 0.28, sat));
      const leather = [l * 1.1, l * 0.86, l * 0.66];
      for (let i = 0; i < 3; i++) c[i] = lerp(lerp(c[i], leather[i], 0.6), lin([98, 94, 86])[i] * Math.min(1.2, l / 0.5), sock);
    }), { seed: 3, darken: 0.15, dirt: 0.9, blood: 0, tint: [0.92, 0.88, 0.82] });
    TR.snap('shoes: final', shoeImg, shoes);
    // normal + ORM like every other cloth: a height from the leather / sock luminance (creases, stitching, laces),
    // roughness worn leather 0.5-0.7 (scuffs rougher), socks 0.92; AO from the asset when it has one
    let shoeN = shoes.asset.textures.normal ? await lib.texture(shoes.asset.textures.normal, 512) : null;
    const shoeAO = shoes.asset.textures.ao ? await lib.texture(shoes.asset.textures.ao, 512) : null;
    const SS = 512, sm = lib.resize(shoeImg, SS, SS), shoeOrm = createImage(SS, SS, [255, 200, 0, 255]);
    const hgt = new Float32Array(SS * SS);
    for (let i = 0; i < SS * SS; i++) {
      const cc = [S2L[sm.data[i * 4]], S2L[sm.data[i * 4 + 1]], S2L[sm.data[i * 4 + 2]]];
      const l = lum(cc), mx = Math.max(...cc), mn = Math.min(...cc), sat = mx > 0 ? (mx - mn) / mx : 0;
      const sock = ss(0.18, 0.32, l) * (1 - ss(0.12, 0.28, sat));
      hgt[i] = Math.sqrt(l);
      shoeOrm.data[i * 4] = shoeAO ? shoeAO.data[i * 4] : 255;
      shoeOrm.data[i * 4 + 1] = Math.round(lerp(lerp(0.5, 0.72, ss(0.02, 0.12, l)), 0.92, sock) * 255);
    }
    if (!shoeN) shoeN = normalFromHeight(blurField(hgt, SS, SS, 1, 1), SS, SS, 1.2);
    shoes.material = lib.material('cloth', { albedo: shoeImg, normal: shoeN, orm: shoeOrm });

    // ---------------------------------------------------------------- eyes / teeth / tongue
    const flatOrm = (ao, rough) => createImage(64, 64, [Math.round(ao * 255), Math.round(rough * 255), 0, 255]);
    const ey = lib.paintEyes(await lib.texture('system', 'eyes/materials/brown_eye.png', 512), { style: 'glow', color: [0.72, 1.0, 0.16], yellow: 1.2, bloodshot: 0.9, seed: 5 });
    eyes.material = lib.material('eye', { albedo: ey.albedo, emissiveMap: ey.emissiveMap, emissive: [1, 1, 1], orm: flatOrm(0.6, 0.15) });
    const teethTex = await lib.texture(teeth.asset.textures.diffuse, 512);
    teeth.material = lib.material('teeth', { albedo: lib.grungeTexture(teethTex, { seed: 9, tint: [0.78, 0.64, 0.4], darken: 0.35, dirt: 0.7, blood: 0.1, freq: 14 }), orm: flatOrm(0.55, 0.45) });
    const tg = paintPart(tongue, { size: 256, rough: 0.3, normalSize: 256, ormSize: 128, normalStrength: 2.5 }, (P, Nn, st, u) => {
      const t = clamp01((mo[2] + 0.025 - P[2]) < 0 ? 1 : 1 - (mo[2] + 0.025 - P[2]) / 0.07);
      const col = mix3(lin([104, 76, 90]), lin([70, 50, 64]), ss(0.55, 1, t));
      for (let k = 0; k < 3; k++) st.c[k] = col[k];
      const coat = ss(0.1, 0.6, Nn[1]) * ss(-0.1, 0.5, N.fbm(P[0] * 120, P[1] * 120, P[2] * 120, 2) + 0.2);
      over(st.c, lin([150, 140, 108]), coat * 0.55);
      const pap = 1 - ss(0.1, 0.3, N.worley(P[0] * 900, P[1] * 900, P[2] * 900));
      st.h = pap * 0.6 - coat * 0.2; st.ro = 0.2 + coat * 0.22;   // wet (the coat drier)
    });
    tongue.material = lib.material('gore', { albedo: tg.albedo, normal: tg.normal, orm: tg.orm });
  }

  // ================================================================ hitboxes (capsules between bones / helper bones)
  // The stock per-bone percentile radii put the 45 cm deep belly on spine_01 as a sphere round the SPINE: shots at
  // the front of the belly would miss. The belly gets its own vertical capsule through the middle of the dome (helper
  // bones on the `belly` bone, which carries the dome's skinning), the chest a horizontal one, the head one from the skull
  // base to under the crown; limbs run bone -> child with radii measured on the dressed mesh.
  const hitboxes = {}, capsules = {};
  {
    const bones = h.skeleton.bones;
    const BP = (n) => sk[n].head.clone();
    const ownerOf = (bn) => {
      if (/^(spine_01|spine_02|belly)$/.test(bn)) return 'belly';
      if (bn === 'spine_03' || /^clavicle/.test(bn)) return 'chest';
      if (bn === 'pelvis' || bn === 'Root') return 'pelvis';
      if (/^(hand|thumb|index|middle|ring|pinky)/.test(bn)) return bn.endsWith('_l') ? 'hand_l' : 'hand_r';
      if (bn.startsWith('ball')) return 'foot' + bn.slice(4);
      if (bn === 'neck_01') return 'neck';
      return bn;
    };
    const owned = {};
    const P3 = (part, v) => new THREE.Vector3(part.pos[v * 3], part.pos[v * 3 + 1], part.pos[v * 3 + 2]);
    for (const part of [bodyLow, shirt, trousers, shoes]) {
      const used = new Set();
      const t = part.tris();
      for (let i = 0; i < t.length; i += 2) used.add(t[i]);
      for (const v of used) (owned[ownerOf(bones[part.weights[v][0][0]].name)] ||= []).push(P3(part, v));
    }
    const dSeg = (p, a, b) => new THREE.Line3(a, b).closestPointToPoint(p, true, new THREE.Vector3()).distanceTo(p);
    const pct = (a, q) => { const s2 = [...a].sort((x, y) => x - y); return s2[Math.min(s2.length - 1, Math.floor(s2.length * q))]; };
    const rad = (list, a, b, q = 0.8) => pct(list.map((p) => dSeg(p, a, b)), q);
    // head: skull base -> one radius under the crown
    const headV = owned.head;
    const top = Math.max(...headV.map((p) => p.y));
    const hc = headV.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / headV.length);
    let rHead = 0.12;
    for (let it = 0; it < 3; it++) rHead = Math.min(0.15, Math.max(0.1, rad(headV, BP('head'), new THREE.Vector3(hc.x, top - rHead, hc.z), 0.85)));
    addHelperBone(h, 'head_top', 'head', [hc.x, top - rHead, hc.z]);
    // belly: vertical segment through the dome (in front of the spine), from just above the belt line to under the chest
    const bellyV = (owned.belly || []).concat(owned.pelvis || []).filter((p) => p.y > yHip - 0.12 && p.y < y3 + 0.06 && p.z > axisZ0(p.y) + 0.05);
    const gz = bellyV.reduce((a, p) => a + p.z, 0) / bellyV.length;
    const gLo = new THREE.Vector3(0, yHip + 0.02, gz), gHi = new THREE.Vector3(0, y3 - 0.1, gz);
    const rG = Math.min(0.36, Math.max(0.2, rad(bellyV, gLo, gHi, 0.85)));
    addHelperBone(h, 'gut_lo', 'belly', gLo.toArray());
    addHelperBone(h, 'gut_hi', 'belly', gHi.toArray());
    // chest: horizontal capsule at the fat chest, its top under the chin
    const chinY = A.mouth[1] - 0.06;
    const chestV = (owned.chest || []).filter((p) => p.y < chinY + 0.03);
    const cz = chestV.reduce((a, p) => a + p.z, 0) / chestV.length;
    const shX = Math.abs(sk.upperarm_l.head.x);
    let rC = 0.2, yc = y3 + 0.12;
    for (let it = 0; it < 4; it++) {
      yc = Math.min(y3 + 0.16, chinY - rC);
      const half = Math.max(0.05, shX - rC * 0.7);
      rC = Math.min(0.26, Math.max(0.16, rad(chestV, new THREE.Vector3(-half, yc, cz), new THREE.Vector3(half, yc, cz), 0.8)));
    }
    const halfC = Math.max(0.05, shX - rC * 0.7);
    addHelperBone(h, 'chest_r', 'spine_03', [-halfC, yc, cz]);
    addHelperBone(h, 'chest_l', 'spine_03', [halfC, yc, cz]);
    addHelperBone(h, 'pelvis_top', 'pelvis', BP('pelvis').lerp(BP('spine_01'), 0.5).toArray());
    const HB = {
      head: ['head', rHead, 'head_top'], neck: ['neck_01', 0.095, 'head'], chest: ['chest_r', rC, 'chest_l'], belly: ['gut_lo', rG, 'gut_hi'],
      pelvis: ['pelvis', null, 'pelvis_top'],
      upperarm_l: ['upperarm_l', null, 'lowerarm_l'], lowerarm_l: ['lowerarm_l', null, 'hand_l'], hand_l: ['hand_l', null, 'middle_01_l'],
      upperarm_r: ['upperarm_r', null, 'lowerarm_r'], lowerarm_r: ['lowerarm_r', null, 'hand_r'], hand_r: ['hand_r', null, 'middle_01_r'],
      thigh_l: ['thigh_l', null, 'calf_l'], calf_l: ['calf_l', null, 'foot_l'], foot_l: ['foot_l', null, 'ball_l'],
      thigh_r: ['thigh_r', null, 'calf_r'], calf_r: ['calf_r', null, 'foot_r'], foot_r: ['foot_r', null, 'ball_r'],
    };
    const clampR = { pelvis: [0.16, 0.3], hand_l: [0.05, 0.08], hand_r: [0.05, 0.08], foot_l: [0.05, 0.09], foot_r: [0.05, 0.09], upperarm_l: [0.07, 0.13], upperarm_r: [0.07, 0.13], lowerarm_l: [0.05, 0.1], lowerarm_r: [0.05, 0.1], thigh_l: [0.1, 0.2], thigh_r: [0.1, 0.2], calf_l: [0.07, 0.14], calf_r: [0.07, 0.14] };
    for (const [name, [b0, r0, b1]] of Object.entries(HB)) {
      const a = BP(b0), b = BP(b1);
      let r = r0;
      if (r === null) { const lst = owned[name] || []; r = lst.length ? rad(lst, a, b, 0.8) : 0.1; const c = clampR[name]; if (c) r = Math.max(c[0], Math.min(c[1], r)); }
      hitboxes[name] = [b0, +r.toFixed(3), b1];
      capsules[name] = { bone: b0, to: b1, radius: +r.toFixed(3), length: +a.distanceTo(b).toFixed(3) };
    }
    console.log(`${TAG} hitboxes ${Object.entries(hitboxes).map(([k, v]) => `${k}:${v[1]}`).join(' ')}; belly axis z ${gz.toFixed(3)}`);
    // self-check (rest pose): which capsule does a ray from the front enter first?
    const caps = Object.entries(hitboxes).map(([name, [b0, r, b1]]) => ({ name, a: BP(b0), b: BP(b1), r }));
    const first = (o, d) => {
      let best = null;
      for (const c of caps) for (let t = 0; t < 12; t += 0.005) { const p = o.clone().addScaledVector(d, t); if (dSeg(p, c.a, c.b) <= c.r) { if (!best || t < best.t) best = { t, name: c.name }; break; } }
      return best?.name;
    };
    const eye = lerp3(A.eyeL, A.eyeR, 0.5);
    const tests = {
      face: [[eye[0], eye[1], 6], [0, 0, -1]], mouth: [[0, A.mouth[1], 6], [0, 0, -1]], 'head (back)': [[0, eye[1] + 0.03, -6], [0, 0, 1]],
      sternum: [[0, y3 + 0.1, 6], [0, 0, -1]], navel: [[0, yB, 6], [0, 0, -1]], 'low belly': [[0.1, yHip - 0.02, 6], [0, 0, -1]],
      'flank (side)': [[6, yB, 0.1], [-1, 0, 0]], 'lower back': [[0, yW, -6], [0, 0, 1]],
    };
    console.log(`${TAG} first capsule hit: ${Object.entries(tests).map(([k, [o, d]]) => `${k} -> ${first(new THREE.Vector3(...o), new THREE.Vector3(...d))}`).join('; ')}`);
  }

  // ================================================================ pose
  // Default set (the hunched upright clips: idle, walk_a = his run, hits, stagger): the library hunch (idle:
  // spine_02 +54 / spine_03 +28 deg) folded the chest down over the dome, so the spine is straightened against the
  // weight in front, the head sunk forward into the fat collar and the upper arms carried out from the belly.
  const poseOffsets = {
    spine_01: [-6, 0, 0], spine_02: [-34, 0, 0], spine_03: [-14, 0, 0], neck_01: [16, 0, 0], head: [8, 0, 3],
    upperarm_l: [0, 0, 18], upperarm_r: [0, 0, -18],
  };
  if (process.env.BLOATER_POSE) Object.assign(poseOffsets, JSON.parse(process.env.BLOATER_POSE));
  // Per-clip OVERRIDES of those entries (manager.js Zombie.applyClipPose blends them by the mixer's action weights,
  // so they cross-fade with the clips; zviewer applies the viewed clip's set):
  //  - walk_limp (his walk) is nearly upright already: the full counter-lean threw the head 0.3 m behind the pelvis
  //    ("pregnant waddle"); a light lean-back keeps the head over the feet, arms out round the dome
  //  - attack_b (his attack) / attack_a: the double rake swept the forearms through the belly: chest held up over
  //    the dome, upper arms abducted ~30 deg so the forearms pass outside it
  //  - lying clips: no spine correction (it arched the chest / head through the floor); face down (death_front,
  //    the crawls) he is propped on the dome: pelvis pitched up 32 deg (thighs back down to the floor), head drooping
  const lying = { spine_01: [0, 0, 0], spine_02: [0, 0, 0], spine_03: [0, 0, 0], neck_01: [0, 0, 0], head: [0, 0, 0] };
  const propped = { ...lying, pelvis: [-32, 0, 0], thigh_l: [32, 0, 0], thigh_r: [32, 0, 0], neck_01: [20, 0, 0], head: [14, 0, 0] };
  const rake = { spine_02: [-42, 0, 0], spine_03: [-20, 0, 0], upperarm_l: [0, 0, 34], upperarm_r: [0, 0, -30] };
  const poseOffsetsByClip = {
    walk_limp: { spine_01: [-1, 0, 0], spine_02: [-8, 0, 0], spine_03: [-4, 0, 0], neck_01: [8, 0, 0], head: [4, 0, 3], upperarm_l: [0, 0, 26], upperarm_r: [0, 0, -26] },
    attack_a: rake, attack_b: rake,
    death_back: lying, knockdown: lying, get_up: lying,
    death_front: propped, crawl: propped, crawl_attack: propped,
  };
  if (process.env.BLOATER_POSE_CLIPS) Object.assign(poseOffsetsByClip, JSON.parse(process.env.BLOATER_POSE_CLIPS));
  TR.report();
  return {
    human: h, parts, budget: 9000, partBudget: { shirt: 1700, trousers: 900, shoes: 420, teeth: 260 },
    extras: { poseOffsets, poseOffsetsByClip, hitboxes, capsules, archetype: 'bloater', gender: 'male', variant: 'gas-bloated obese man: taut purple-green skin, glowing pustules and belly splits, torn blue work shirt, tan trousers under the belly' },
    lod1: { budget: 2500, drop: ['teeth', 'eyebrows'], texScale: 0.5, partBudget: { body: 1200, shirt: 520, trousers: 300, shoes: 120, tongue: 40 } },
  };
}
