// riot — 防暴屍 RIOT (game/src/zombies/defs.js `riot`: front armour, 450 hp, 1.82 m). A heavy-set infected riot-squad
// officer still wearing his full kit: an olive-drab BDU (right sleeve torn off above the elbow, the hem chafing the
// skin raw; the collar torn round a neck bite), a wolf-grey plate carrier with a rigid bevelled chest plate
// (shooter's-cut hexagon, POLICE on a retro-reflective placard, flattened bullet strikes) and an abdomen plate, shoulder
// straps, MOLLE webbing, a radio on the left side panel, a duty belt; big hard pauldrons (reflective band) with an
// upper-arm plate and strap, chunky forearm guards (the right one strapped onto the bare grey forearm), thigh guards,
// knee cups and shin guards over lug-soled combat boots; a navy riot helmet with a short draped neck curtain and a
// polycarbonate visor pulled down over the face - cracked by an impact and broken out at the lower left, so the slack,
// bloody jaw and the teeth come through the hole. Silhouette: a bulky armoured torso and shoulders, armour on every
// limb, a domed helmet with a visor bulging in front of the face - unlike every other zombie (and unlike walker_a's
// blue work suit) it reads as "armoured" from the front (the game's frontArmor).
//
// Everything specific to this character lives in this file; the shared lib is imported read-only (UV raster,
// blur / normal-from-height, rig segments, painters, Part). Implemented here (the lib has no equivalent):
//  - custom geometry parts (Geo with an atlas packer -> skinned Part with explicit weights): helmet shell + rolled rim
//    + liner + neck curtain + visor pivots + visor gasket, the visor (single-sided BLEND sheet on a spheroid around the
//    pivot axis), vest panels + edge binding + shoulder straps + hard chest / abdomen plates + radio + duty belt,
//    pauldrons, upper-arm / forearm / thigh / shin shells with shrink-wrapped straps, knee cups, lofted boots
//  - fitting: convex-hull rings around the torso for the vest, ray-fitted helmet dome and pauldrons (outermost layer
//    + 7 mm), plates fitted rigidly (single curvature) onto the carrier, guard radii from the sleeve / trouser / skin
//    vertices per angle; trousers tucked into the boots; body faces under the helmet and uniform faces under the vest
//    dropped; molars dropped; region-weighted body simplification (head / hands / skin under the rips / rest); the
//    uniform simplified with its open boundaries locked (torn edges keep their frayed alpha outline)
//  - painting of every custom part (paintPart, incl. a continuous alpha channel for the visor: hairline cracks from an
//    impact on the left cheek, a polygonal break-out over the left jaw), a stroke font for the POLICE lettering (chest
//    plate + back placard) and the helmet number, the black glove / bare bloody hand / face treatment on the skin
//    (shard cuts, stubble, brows, necrotic veins from the bites, the chafed sleeve edge), MOLLE, knife slashes showing
//    yellow aramid, bullet strikes in the plate; retro-reflective placards / pauldron bands (pale + faint emissive)
//  - ray-traced AO baked into the ORM occlusion channel ONLY (never the albedo: see docs/ZOMBIE_PIPELINE.md 2.3)
//  - values tuned for the game's shadow side (measured in the test arena: the tone curve crushes a linear-0.1 albedo
//    to ~9 sRGB there): carrier ~115, plates ~140, guards ~96 slate, helmet ~71 navy, BDU ~93 olive
//  - LOD1: the guards drop their rims / straps instead of being collapsed by the simplifier (see the end of build())
//  - hitbox capsules on leaf helper bones (horizontal chest capsule under the chin, head up to the helmet crown): the
//    frontArmor rewards head shots, so frontal rays at the face must reach the head capsule first (build log self-check)
//  - extras.poseOffsetsByClip: the locomotion / idle clips partly straightened (an upright armoured plod, plate forward)
// RIOT_FAST=1 builds flat-coloured materials (silhouette / skinning iterations in seconds).
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { rasterUV, texelSurface } from '../lib/raster.mjs';
import { blurField, normalFromHeight, createImage } from '../lib/image.mjs';
import { boneSegment } from '../lib/rig.mjs';
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
const D2R = Math.PI / 180;
const TAG = '  riot:';

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
const FAST = !!process.env.RIOT_FAST;

/** Per-texel grade of an RGBA image in place: fn(c linear rgb, x, y) mutates c. */
function grade(img, fn) {
  const { width: W, height: H, data } = img;
  const c = [0, 0, 0];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    c[0] = S2L[data[i]]; c[1] = S2L[data[i + 1]]; c[2] = S2L[data[i + 2]];
    fn(c, x, y);
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
  const a = V(bone.head), b = V(bone.tail);
  const d = sub(b, a), dd = dot(d, d), L = Math.sqrt(dd);
  return (P) => {
    const t = dot(sub(P, a), d) / dd;
    const tc = clamp01(t);
    return { t, d: Math.hypot(P[0] - a[0] - d[0] * tc, P[1] - a[1] - d[1] * tc, P[2] - a[2] - d[2] * tc), L, a };
  };
}

/**
 * Paints a part through its own UV raster. fn(P, N, st, u, v, i, vtx) (vtx = a vertex of the texel's triangle, e.g.
 * to look up its Geo piece) sets st.c (linear rgb), st.h (height), st.ro
 * (roughness), st.me (metalness), st.a (alpha 0..1), st.e (emissive rgb 0..1).
 * o.blend: continuous alpha (BLEND material) instead of a cut-out mask.
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
    fn(P, Nn, st, ((i % S) + 0.5) / S, 1 - (((i / S) | 0) + 0.5) / S, i, tris[r.tri[i] * 6]);
    const d = i * 4;
    albedo.data[d] = toByte(st.c[0]); albedo.data[d + 1] = toByte(st.c[1]); albedo.data[d + 2] = toByte(st.c[2]);
    if (o.blend) albedo.data[d + 3] = Math.round(clamp01(st.a) * 255);
    else if (st.a < 0.5) { albedo.data[d + 3] = 0; anyCut = true; }
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
function bakeField(sf, uvs, R, fn, { fill = 1, blur = 1 } = {}) {
  const r = rasterUV(sf.tris, uvs, R, 4);
  const out = new Float32Array(R * R).fill(fill);
  const P = [0, 0, 0], Nn = [0, 0, 0];
  for (let i = 0; i < R * R; i++) if (texelSurface(r, sf.tris, sf.pos, sf.nrm, i, P, Nn)) out[i] = fn(P, Nn, i);
  return blur ? blurField(out, R, R, blur, 1) : out;
}

/** Cosine-weighted hemisphere ray-traced occlusion (distance-attenuated) against a MeshBVH. */
function occTracer(bvh, { rays = 16, maxDist = 0.1, seed = 0 } = {}) {
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
      const hit = bvh.raycastFirst(ray, THREE.DoubleSide, 0.0005, maxDist);
      if (hit) occ += 1 - (hit.distance / maxDist) ** 0.75;
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

// ---------------------------------------------------------------- custom geometry -> skinned Part
/**
 * Geometry with an atlas: vertices are added inside named pieces with piece-local uvs (0..1); pack() places every
 * piece's rect in the 0..1 atlas proportionally to its physical size (shelf packer) and rewrites the uvs.
 */
class Geo {
  constructor() { this.P = []; this.UV = []; this.F = []; this.W = []; this.pv = []; this.pieces = []; this.cur = -1; }
  begin(name, w, h, info = {}) { this.pieces.push({ name, w, h, v0: this.n, info }); this.cur = this.pieces.length - 1; return this.cur; }
  v(p, uv, w = null) { this.P.push(p[0], p[1], p[2]); this.UV.push(uv[0], uv[1]); this.W.push(w); this.pv.push(this.cur); return this.P.length / 3 - 1; }
  tri(a, b, c) { this.F.push({ v: [a, b, c], t: [a, b, c], g: 0 }); }
  quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }
  get n() { return this.P.length / 3; }
  pack(gap = 0.012) {
    const ps = this.pieces;
    const fits = (s) => {
      let x = gap, y = gap, row = 0;
      const out = [];
      for (const p of [...ps].sort((a, b) => b.h - a.h)) {
        const w = p.w * s, hh = p.h * s;
        if (x + w + gap > 1) { x = gap; y += row + gap; row = 0; }
        if (x + w + gap > 1) return null;
        out.push([p, x, y, w, hh]);
        x += w + gap; row = Math.max(row, hh);
      }
      return y + row + gap <= 1 ? out : null;
    };
    let lo = 0.01, hi = 20;
    for (let it = 0; it < 40; it++) { const m = (lo + hi) / 2; if (fits(m)) lo = m; else hi = m; }
    for (const [p, x, y, w, hh] of fits(lo)) p.rect = [x, y, w, hh];
    this.texelPerM = lo;
    for (let i = 0; i < this.n; i++) {
      const r = ps[this.pv[i]].rect;
      this.UV[i * 2] = r[0] + this.UV[i * 2] * r[2];
      this.UV[i * 2 + 1] = r[1] + this.UV[i * 2 + 1] * r[3];
    }
    return this;
  }
  /** piece (and local uv) at an atlas uv */
  pieceAt(u, v) {
    for (const p of this.pieces) { const r = p.rect; if (u >= r[0] - 0.004 && u <= r[0] + r[2] + 0.004 && v >= r[1] - 0.004 && v <= r[1] + r[3] + 0.004) return { p, lu: (u - r[0]) / r[2], lv: (v - r[1]) / r[3] }; }
    return null;
  }
}

/** Grid of quads ids[r][c] (rows x cols). flip reverses the winding. */
function gridQuads(g, ids, { flip = false, wrap = false } = {}) {
  const R = ids.length, C = ids[0].length;
  for (let r = 0; r + 1 < R; r++) for (let c = 0; c + (wrap ? 0 : 1) < C; c++) {
    const c2 = (c + 1) % C;
    const a = ids[r][c], b = ids[r][c2], cc = ids[r + 1][c2], d = ids[r + 1][c];
    if (flip) g.quad(a, d, cc, b); else g.quad(a, b, cc, d);
  }
}

/** Open box (no back face) with origin c, axes ex (right), ey (up), ez (out), half sizes [hx, hy, hz]; ez face = front.
 *  The piece is unwrapped as a cross (front in the middle). Returns vertex range. */
function box(g, name, c, ex, ey, ez, hs, w, { back = false } = {}) {
  const [hx, hy, hz] = hs;
  const W = 2 * hx + 4 * hz, H = 2 * hy + 4 * hz;
  g.begin(name, W, H, { box: true, c, ex, ey, ez, hs });
  const P = (sx, sy, sz) => add(add(add(c, scl(ex, sx * hx)), scl(ey, sy * hy)), scl(ez, sz * hz));
  const U = (x, y) => [x / W, y / H];   // x, y in metres within the cross
  const x0 = 2 * hz, x1 = 2 * hz + 2 * hx, y0 = 2 * hz, y1 = 2 * hz + 2 * hy;
  const start = g.n;
  const face = (pts, uvs) => { const ids = pts.map((p, k) => g.v(p, U(...uvs[k]), w)); g.quad(ids[0], ids[1], ids[2], ids[3]); };
  // front (+ez)
  face([P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1)], [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
  // top (+ey)
  face([P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), P(-1, 1, -1)], [[x0, y1], [x1, y1], [x1, y1 + 2 * hz], [x0, y1 + 2 * hz]]);
  // bottom (-ey)
  face([P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1)], [[x0, y0 - 2 * hz], [x1, y0 - 2 * hz], [x1, y0], [x0, y0]]);
  // right (+ex)
  face([P(1, -1, 1), P(1, -1, -1), P(1, 1, -1), P(1, 1, 1)], [[x1, y0], [x1 + 2 * hz, y0], [x1 + 2 * hz, y1], [x1, y1]]);
  // left (-ex)
  face([P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1)], [[x0 - 2 * hz, y0], [x0, y0], [x0, y1], [x0 - 2 * hz, y1]]);
  if (back) face([P(1, -1, -1), P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1)], [[0, 0], [x0 * 0.5, 0], [x0 * 0.5, y0 * 0.5], [0, y0 * 0.5]]);
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
  part.geo = g;
  return part;
}

/** Smooth normals across coincident vertices (seams of a Geo part where positions are duplicated per uv). Vertices
 *  in `hard` (a Set of vertex ids) keep their own face normals (crisp creases: rims, plate edges). */
function weldNormals(part, keyScale = 2e4) {
  const base = Object.getPrototypeOf(part).normals;
  part.normals = function (pos = this.pos) {
    const n = base.call(this, pos), acc = new Map(), key = (i) => Math.round(pos[i * 3] * keyScale) + ',' + Math.round(pos[i * 3 + 1] * keyScale) + ',' + Math.round(pos[i * 3 + 2] * keyScale);
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
  const arr = new Float32Array(Math.max(1, n) * 9);
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
    first(o, d, far = 10) {
      ray.origin.set(o[0], o[1], o[2]); ray.direction.set(d[0], d[1], d[2]).normalize();
      const x = bvh.raycastFirst(ray, THREE.DoubleSide, 0, far);
      return x ? { d: x.distance, p: V(x.point), n: faceN(x.faceIndex) } : null;
    },
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
  return (p, { k = 6, allow = null } = {}) => {
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
        if (allow && !allow.includes(bones[b].name)) continue;
        acc.set(b, (acc.get(b) || 0) + w * wi);
      }
    });
    const list = [...acc.entries()];
    return list.length ? list : [[h.skeleton.byName.spine_02.index, 1]];
  };
}

/** Closest-skin weights: the bone weights of the base-mesh surface point nearest to p, filtered to `allow`. */
function makeClosestSkinner(h, fullBody, fallback) {
  const tris = fullBody.tris(), pos = h.pos;
  const Bv = makeBVH([{ pos, tris }]);
  const bones = h.skeleton.bones;
  return (p, { allow = null } = {}) => {
    const c = Bv.closest(p);
    const ia = tris[c.fi * 6], ib = tris[c.fi * 6 + 2], ic = tris[c.fi * 6 + 4];
    const A = [pos[ia * 3], pos[ia * 3 + 1], pos[ia * 3 + 2]], Bp = [pos[ib * 3], pos[ib * 3 + 1], pos[ib * 3 + 2]], C = [pos[ic * 3], pos[ic * 3 + 1], pos[ic * 3 + 2]];
    const v0 = sub(Bp, A), v1 = sub(C, A), v2 = sub(c.p, A);
    const d00 = dot(v0, v0), d01 = dot(v0, v1), d11 = dot(v1, v1), d20 = dot(v2, v0), d21 = dot(v2, v1);
    const den = d00 * d11 - d01 * d01 || 1e-12;
    let wb = clamp01((d11 * d20 - d01 * d21) / den), wc = clamp01((d00 * d21 - d01 * d20) / den);
    if (!Number.isFinite(wb) || !Number.isFinite(wc)) { wb = 1 / 3; wc = 1 / 3; }
    const wa = Math.max(0, 1 - wb - wc);
    const acc = new Map();
    for (const [v, k] of [[ia, wa], [ib, wb], [ic, wc]]) for (const [b, w] of h.weights[v]) {
      if (allow && !allow.includes(bones[b].name)) continue;
      acc.set(b, (acc.get(b) || 0) + w * k);
    }
    const list = [...acc.entries()].filter(([, w]) => w > 1e-3);
    return list.length ? list : fallback(p, { allow });
  };
}
const unit = (l) => { const s = l.reduce((a, [, x]) => a + x, 0) || 1; return l.map(([b, x]) => [b, x / s]); };

/** UV islands of a part: island id per face (union-find over shared UV corners). */
function uvIslands(part) {
  const F = part.obj.faces;
  const par = new Int32Array(part.obj.uvs.length / 2).map((_, i) => i);
  const find = (a) => { while (par[a] !== a) a = par[a] = par[par[a]]; return a; };
  for (const f of F) for (let k = 1; k < f.t.length; k++) { const a = find(f.t[0]), b = find(f.t[k]); if (a !== b) par[a] = b; }
  return F.map((f) => find(f.t[0]));
}

/** Open boundary loops (vertex lists) of a part's kept faces. */
function boundaryLoops(part) {
  const cnt = new Map(), nxt = new Map();
  part.obj.faces.forEach((f, fi) => {
    if (!part.keep[fi]) return;
    for (let k = 0; k < f.v.length; k++) { const a = f.v[k], b = f.v[(k + 1) % f.v.length]; const key = a < b ? `${a},${b}` : `${b},${a}`; cnt.set(key, (cnt.get(key) || 0) + 1); nxt.set(`${a}>${b}`, 1); }
  });
  const edges = new Map();
  for (const [key, c] of cnt) {
    if (c !== 1) continue;
    const [a, b] = key.split(',').map(Number);
    const [s, e] = nxt.has(`${a}>${b}`) ? [a, b] : [b, a];
    edges.set(s, e);
  }
  const loops = [], seen = new Set();
  for (const s of edges.keys()) {
    if (seen.has(s)) continue;
    const loop = [];
    let v = s;
    while (v !== undefined && !seen.has(v)) { seen.add(v); loop.push(v); v = edges.get(v); }
    if (loop.length > 2) loops.push(loop);
  }
  return loops;
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

/**
 * Region-weighted simplification of a MakeHuman-topology Part: each pass simplifies one region with every other
 * vertex locked (meshoptimizer vertex_lock), so the small head keeps its own budget in one watertight mesh. Returns a
 * new Part on the SAME vertex indexing (only faces / per-corner uvs change) with the full-resolution normals.
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

/** Adds a leaf helper bone (same rest frame as its parent, no skin weights) at world position p: hitbox capsule ends. */
function addHelperBone(h, name, parentName, p) {
  const sk = h.skeleton, par = sk.byName[parentName];
  const head = new THREE.Vector3(p[0], p[1], p[2]);
  const b = { name, parent: par.index, head, tail: head.clone().add(new THREE.Vector3(0, 0.05, 0)), world: par.world.clone(), index: sk.bones.length };
  b.localPos = head.clone().sub(par.head).applyQuaternion(par.world.clone().invert());
  b.localQuat = new THREE.Quaternion();
  sk.bones.push(b); sk.byName[name] = b;
  return b;
}

// ---------------------------------------------------------------- stroke font (block capitals / digits, 4 x 6 grid)
const GLYPHS = {
  P: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]]],
  O: [[[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]]],
  L: [[[0, 6], [0, 0], [4, 0]]],
  I: [[[2, 0], [2, 6]], [[1, 0], [3, 0]], [[1, 6], [3, 6]]],
  C: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5]]],
  E: [[[4, 0], [0, 0], [0, 6], [4, 6]], [[0, 3], [3, 3]]],
  1: [[[1, 5], [2, 6], [2, 0]], [[1, 0], [3, 0]]],
  7: [[[0, 6], [4, 6], [1.5, 0]]],
  2: [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [0, 0], [4, 0]]],
  4: [[[3, 0], [3, 6], [0, 2], [4, 2]]],
};
/** Ink coverage (0..1) of `text` at local (x, y) metres: baseline-left origin, cap height H, stroke width sw (m). */
function textInk(text, x, y, H, sw) {
  const u = H / 6, adv = 5.6 * u;
  if (y < -sw || y > H + sw || x < -sw || x > text.length * adv + sw) return 0;
  const k = Math.floor(x / adv);
  let best = 9;
  for (const kk of [k - 1, k, k + 1]) {
    const g = GLYPHS[text[kk]];
    if (!g) continue;
    const lx = (x - kk * adv) / u, ly = y / u;
    for (const stroke of g) for (let i = 0; i + 1 < stroke.length; i++) {
      const a = stroke[i], b = stroke[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], dd = dx * dx + dy * dy || 1;
      const t = clamp01(((lx - a[0]) * dx + (ly - a[1]) * dy) / dd);
      best = Math.min(best, Math.hypot(lx - a[0] - dx * t, ly - a[1] - dy * t) * u);
    }
  }
  return 1 - ss(sw * 0.4, sw * 0.6, best);
}

// rest height of the finished character: top of the skull (m); the helmet adds ~4 cm
const SKULL_TOP = 1.79;

// =====================================================================================================
export async function build(lib) {
  const N = lib.makeNoise(5150);
  const TR = albedoTracer('riot');
  const opts = {
    // a heavy-set riot-squad officer (more muscle and weight than the walkers: this is the 450 hp tank)
    macro: { gender: 1, age: 0.45, muscle: 0.9, weight: 0.66, height: 0.56, proportions: 0.6, race: { caucasian: 0.55, asian: 0.3, african: 0.15 } },
    modifiers: {
      // a fit officer gone to rot: broad shoulders and a thick neck; hollow cheeks under high cheekbones, a heavy brow
      'measure-shoulder-dist-decr-incr': 0.5, 'neck-scale-horiz-decr-incr': 0.45, 'torso-vshape-decr-incr': 0.35,
      'measure-upperarm-circ-decr-incr': 0.35, 'measure-thigh-circ-decr-incr': 0.25,
      'cheek-volume-decr-incr': -0.75, 'cheek-bones-decr-incr': 0.5, 'head-fat-decr-incr': -0.45,
      'chin-width-decr-incr': 0.3, 'chin-prominent-decr-incr': 0.2, 'eyebrows-trans-backward-forward': 0.45, 'forehead-temple-decr-incr': -0.45,
      'eye-bag-decr-incr': 0.55, 'nose-hump-decr-incr': 0.3,
    },
    // a slack, snarling jaw (the visor is broken out in front of it), crushed brows, flared nostrils
    expression: {
      'mouth-open': 0.48, 'mouth-retraction': 0.3, 'mouth-upward-retraction': 0.4, 'mouth-depression': 0.2,
      'eyebrows-left-down': 0.6, 'eyebrows-right-down': 0.6, 'nose-left-elevation': 0.25, 'nose-right-elevation': 0.25,
    },
  };
  const h = await lib.Human.create(opts);
  const sk = h.skeleton.byName;
  const B = (n) => V(sk[n].head);
  const A = lib.anchors(h);
  const skinAt = makeSkinner(h);
  const yEye = (A.eyeL[1] + A.eyeR[1]) / 2, zEye = (A.eyeL[2] + A.eyeR[2]) / 2;
  const yNeck = sk.neck_01.head.y, y3 = sk.spine_03.head.y, y2 = sk.spine_02.head.y, y1 = sk.spine_01.head.y;
  const clY = (sk.clavicle_l.head.y + sk.upperarm_l.head.y) / 2;
  console.log(`${TAG} macro body: height ${h.height.toFixed(3)} eye ${yEye.toFixed(3)} neck ${yNeck.toFixed(3)} spine3 ${y3.toFixed(3)} spine1 ${y1.toFixed(3)} pelvis ${sk.pelvis.head.y.toFixed(3)} shoulderL ${B('upperarm_l').map((x) => x.toFixed(3))} clY ${clY.toFixed(3)} knee ${sk.calf_l.head.y.toFixed(3)} ankle ${sk.foot_l.head.y.toFixed(3)}`);

  // ---------------------------------------------------------------- MakeHuman parts
  const body = h.basePart({ name: 'body', role: 'skin' });
  const uni = await h.fit('clothes/male_casualsuit01', { name: 'uniform', role: 'cloth' });
  const eyes = await h.fit('eyes/low-poly', { name: 'eyes', role: 'eye', hide: false });
  const teeth = await h.fit('teeth/teeth_base', { name: 'teeth', role: 'teeth', hide: false });
  {
    // the molars are never seen through the slack mouth: dropped (the 7k-tri teeth would not simplify below ~500
    // with them; those triangles go to the helmet shell instead)
    let zMin = 9, zMax = -9, n = 0;
    for (let v = 0; v < teeth.nVerts; v++) { zMin = Math.min(zMin, teeth.pos[v * 3 + 2]); zMax = Math.max(zMax, teeth.pos[v * 3 + 2]); }
    teeth.obj.faces.forEach((f, fi) => { if (teeth.keep[fi] && f.v.reduce((a, v) => a + teeth.pos[v * 3 + 2], 0) / f.v.length < zMax - 0.026) { teeth.keep[fi] = 0; n++; } });
    console.log(`${TAG} teeth z ${zMin.toFixed(3)}..${zMax.toFixed(3)}, ${n} molar faces dropped`);
  }
  // garment of every uniform face: 0 shirt, 1 trousers, (shoe islands of the suit dropped: we wear boots)
  const uniIsl = uvIslands(uni);
  const islY = new Map();
  uni.obj.faces.forEach((f, fi) => { let b = islY.get(uniIsl[fi]); if (!b) islY.set(uniIsl[fi], b = { y: 0, n: 0, lo: 9, hi: -9 }); for (const v of f.v) { const y = uni.pos[v * 3 + 1]; b.y += y; b.n++; b.lo = Math.min(b.lo, y); b.hi = Math.max(b.hi, y); } });
  const garment = new Int8Array(uni.obj.faces.length);
  let waistTop = 0;
  uni.obj.faces.forEach((f, fi) => {
    const b = islY.get(uniIsl[fi]);
    if (b.hi < 0.2) { uni.keep[fi] = 0; garment[fi] = 2; return; }
    garment[fi] = b.y / b.n > y1 ? 0 : 1;
  });
  for (const [, b] of islY) if (b.y / b.n <= y1 && b.hi > 0.2) waistTop = Math.max(waistTop, b.hi);
  const uniGarmentV = new Int8Array(uni.nVerts).fill(-1);
  uni.obj.faces.forEach((f, fi) => { if (uni.keep[fi]) for (const v of f.v) if (uniGarmentV[v] < 0 || garment[fi] === 0) uniGarmentV[v] = garment[fi]; });
  console.log(`${TAG} uniform islands ${islY.size}, waist top ${waistTop.toFixed(3)}`);

  // ---------------------------------------------------------------- COMBAT BOOTS (cloth): one lofted piece per foot
  // 14 vertices per ring (super-ellipse outlines sized from the foot's own vertices): a thick lug sole (outset 5 mm), a
  // round toe box and heel, the instep rising to the shin, a laced shaft that hugs the calf skin up to ~25 cm, finished
  // by a padded collar folding inside. The trouser legs are slimmed below the knee (bloused, strapped under the shin
  // guards), pulled in under the collar and dropped inside, like the feet and shins.
  const fullBody0 = h.basePart({ name: 'bvh0' });
  const skinB0 = makeBVH([surf(fullBody0)]);
  {
    let n = 0;
    for (let v = 0; v < uni.nVerts; v++) {
      if (uniGarmentV[v] !== 1) continue;
      const p = [uni.pos[v * 3], uni.pos[v * 3 + 1], uni.pos[v * 3 + 2]];
      const s = p[0] >= 0 ? 'l' : 'r';
      const K = B(`calf_${s}`), F = B(`foot_${s}`);
      if (p[1] > K[1] - 0.01) continue;
      const w = ss(K[1] - 0.01, K[1] - 0.09, p[1]);
      const ax = lerp3(F, K, clamp01((p[1] - F[1]) / (K[1] - F[1])));
      const d = norm([p[0] - ax[0], 0, p[2] - ax[2]]);
      const r = Math.hypot(p[0] - ax[0], p[2] - ax[2]);
      const hs = skinB0.hits([ax[0], p[1], ax[2]], d, 0.2);
      const rs = hs.length ? hs[0].d : r * 0.8;
      const target = Math.max(rs + 0.011, lerp(r, rs + 0.011, 0.6));
      if (target < r) { const nr = lerp(r, target, w); uni.pos[v * 3] = ax[0] + d[0] * nr; uni.pos[v * 3 + 2] = ax[2] + d[2] * nr; n++; }
    }
    console.log(`${TAG} trouser legs slimmed below the knee: ${n} vertices`);
  }
  let footMin = 9;
  for (const v of h.baseObj.groupVerts('body')) footMin = Math.min(footMin, h.pos[v * 3 + 1]);
  const y0 = footMin - 0.024;
  const bg = new Geo();
  const bootInfo = [];
  let bootTop = 0;
  {
    const NS = 14;
    const spow = (x, e) => Math.sign(x) * Math.abs(x) ** e;
    for (const s of ['l', 'r']) {
      const A0 = B(`foot_${s}`), Bl = B(`ball_${s}`), Tt = V(sk[`ball_${s}`].tail), K = B(`calf_${s}`);
      const fw = norm([Tt[0] - A0[0], 0, Tt[2] - A0[2]]), sd = norm(cross([0, 1, 0], fw));
      const Ag = [A0[0], 0, A0[2]];
      const toF = (p) => { const d = sub(p, Ag); return [dot(d, fw), dot(d, sd)]; };
      const toW = (f, sv, y) => [Ag[0] + fw[0] * f + sd[0] * sv, y, Ag[2] + fw[2] * f + sd[2] * sv];
      const axisAt = (y) => toF(lerp3(A0, K, (y - A0[1]) / (K[1] - A0[1])));
      const footIds = new Set([`foot_${s}`, `ball_${s}`].map((n) => sk[n].index));
      const footV = [], legV = [];
      for (const v of h.baseObj.groupVerts('body')) {
        const p = [h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]];
        if (Math.sign(p[0]) !== (s === 'l' ? 1 : -1) || p[1] > K[1]) continue;
        const fwgt = h.weights[v].reduce((a, [b, w]) => a + (footIds.has(b) ? w : 0), 0);
        const [f, sv] = toF(p);
        if (fwgt > 0.5) footV.push([f, sv, p[1]]); else legV.push([f, sv, p[1]]);
      }
      let heelF = 9, toeF = -9, ballS0 = 9, ballS1 = -9, heelS0 = 9, heelS1 = -9;
      for (const [f, sv] of footV) {
        heelF = Math.min(heelF, f); toeF = Math.max(toeF, f);
        if (Math.abs(f - toF(Bl)[0]) < 0.04) { ballS0 = Math.min(ballS0, sv); ballS1 = Math.max(ballS1, sv); }
        if (f < heelF + 0.06) { heelS0 = Math.min(heelS0, sv); heelS1 = Math.max(heelS1, sv); }
      }
      const sc = (ballS0 + ballS1) / 2, wBall = (ballS1 - ballS0) / 2;
      const yA = A0[1], yTop = yA + 0.17;
      bootTop = Math.max(bootTop, yTop + 0.012);
      const front0 = toeF + 0.024, back0 = heelF - 0.016, wF0 = wBall + 0.016, wB0 = Math.max(0.04, (heelS1 - heelS0) / 2 + 0.013);
      const foot = (front, back, wF, wB, n = 2.2) => ({ fc: (front + back) / 2, a: (front - back) / 2, sc, wF, wB, n });
      const shaftRing = (y, below = 0.035, above = 0.035, clr = 0.009) => {
        const [cf, cs] = axisAt(y);
        let aF = 0.045, aB = 0.045, wS = 0.045;
        for (const [f, sv, py] of legV) {
          if (py < y - below || py > y + above) continue;
          const df = f - cf, ds = sv - cs;
          if (Math.abs(ds) < Math.abs(df)) { if (df > 0) aF = Math.max(aF, df); else aB = Math.max(aB, -df); } else wS = Math.max(wS, Math.abs(ds));
        }
        return { fc: cf + (aF - aB) / 2, a: (aF + aB) / 2 + clr, sc: cs, wF: wS + clr, wB: wS + clr, n: 2.05 };
      };
      const sMid = shaftRing(lerp(yA, yTop, 0.5), 0.05, 0.05), sTop = shaftRing(yTop, 0.04, 0.0, 0.013), sAnk = shaftRing(yA + 0.06, 0.03, 0.05);
      for (const k of ['a', 'wF', 'wB']) { sAnk[k] = Math.max(sAnk[k], sMid[k] * 0.9); sTop[k] = Math.min(Math.max(sTop[k], sMid[k]), sMid[k] * 1.05); }
      const blendR = (r0, r1, t) => ({ fc: lerp(r0.fc, r1.fc, t), a: lerp(r0.a, r1.a, t), sc: lerp(r0.sc, r1.sc, t), wF: lerp(r0.wF, r1.wF, t), wB: lerp(r0.wB, r1.wB, t), n: lerp(r0.n, r1.n, t) });
      const out4 = (r, d) => ({ ...r, a: r.a + d, wF: r.wF + d, wB: r.wB + d });
      const upper0 = foot(front0, back0, wF0, wB0);
      const instep = blendR(foot(lerp(front0, sAnk.fc + sAnk.a, 0.6), back0 + 0.004, lerp(wF0, sAnk.wF, 0.45), wB0 + 0.005, 2.2), sAnk, 0.15);
      // a 3 cm lug-sole slab (7 mm proud of the upper all round), then a rounded toe box rising in three steps
      const rings = [
        { y: y0, r: out4(upper0, 0.007), sole: 1 },
        { y: y0 + 0.03, r: out4(upper0, 0.007), sole: 1 },
        { y: y0 + 0.033, r: upper0 },
        { y: y0 + 0.054, r: foot(front0 - 0.005, back0, wF0 - 0.001, wB0 + 0.001, 2.15) },
        { y: y0 + 0.074, r: foot(front0 - 0.019, back0 + 0.0005, wF0 - 0.004, wB0 + 0.002, 2.1) },
        { y: y0 + 0.095, r: foot(front0 - 0.05, back0 + 0.001, wF0 - 0.009, wB0 + 0.003, 2.1) },
        { y: y0 + 0.128, r: instep },
        { y: yA + 0.06, r: sAnk, ank: 1 },
        { y: lerp(yA, yTop, 0.55), r: sMid },
        { y: yTop, r: sTop, top: 1 },
      ];
      const ringPts = (r) => { const pts = []; for (let j = 0; j < NS; j++) { const ph = (j / NS) * Math.PI * 2, cf = Math.cos(ph), sf = Math.sin(ph); const w = lerp(r.wB, r.wF, (1 + cf) / 2); pts.push([r.fc + r.a * spow(cf, 2 / r.n), r.sc + w * spow(sf, 2 / r.n)]); } return pts; };
      // push-out: every foot / leg vertex within a ring's height band stays inside it (+ clearance)
      for (let k = 0; k < rings.length; k++) {
        const R = rings[k];
        const pts = ringPts(R.r), cen = [R.r.fc, R.r.sc];
        const pol = pts.map(([f, sv]) => ({ th: Math.atan2(sv - cen[1], f - cen[0]), r: Math.hypot(f - cen[0], sv - cen[1]) }));
        const yLo = k ? lerp(rings[k - 1].y, R.y, 0.5) : R.y - 0.01, yHi = k + 1 < rings.length ? lerp(R.y, rings[k + 1].y, 0.5) : R.y;
        const src = k <= 6 ? footV.concat(legV) : legV;
        const clr = k <= 2 ? 0.006 : 0.0095;
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
        for (let it = 0; it < 2; it++) { const r0 = pol.map((q) => q.r); pol.forEach((q, j) => { q.r = Math.max(r0[j], 0.5 * r0[j] + 0.25 * (r0[(j + NS - 1) % NS] + r0[(j + 1) % NS])); }); }
        R.pts = pol.map((q) => [cen[0] + Math.cos(q.th) * q.r, cen[1] + Math.sin(q.th) * q.r]);
        R.cen = cen;
      }
      for (const k of [0, 1]) rings[k].pts = rings[2].pts.map(([f, sv]) => { const d = norm([f - rings[2].cen[0], sv - rings[2].cen[1], 0]); return [f + d[0] * 0.005, sv + d[1] * 0.005]; });
      // padded collar: crest 1.1 cm above the shaft top and 5 mm out, folding 1.5 cm down inside
      const top = rings[rings.length - 1];
      const radial = (R, dr) => R.pts.map(([f, sv]) => { const d = norm([f - R.cen[0], sv - R.cen[1], 0]); return [f + d[0] * dr, sv + d[1] * dr]; });
      rings.push({ y: yTop + 0.011, pts: radial(top, 0.005), cen: top.cen, collar: 1 });
      rings.push({ y: yTop - 0.015, pts: radial(top, -0.008), cen: top.cen, collar: 2 });
      const ballF = toF(Bl)[0];
      const wOf = (f, y) => {
        const calf = ss(yA - 0.01, yA + 0.09, y) * (f < -0.04 && y < yA + 0.02 ? 0.4 : 1);
        const ball = (1 - calf) * ss(ballF - 0.03, ballF + 0.05, f) * 0.7;
        return [[`calf_${s}`, calf], [`foot_${s}`, 1 - calf - ball], [`ball_${s}`, ball]];
      };
      // side strip: u around (seam at the heel), v up by the mean ring spacing
      const vAcc = [0];
      for (let k = 1; k < rings.length; k++) { let m = 0; for (let j = 0; j < NS; j++) { const a = rings[k - 1].pts[j], b = rings[k].pts[j]; m += Math.hypot(a[0] - b[0], a[1] - b[1], rings[k - 1].y - rings[k].y); } vAcc.push(vAcc[k - 1] + m / NS); }
      const perim = Math.max(...rings.map((R) => R.pts.reduce((a, p, j) => a + Math.hypot(p[0] - R.pts[(j + 1) % NS][0], p[1] - R.pts[(j + 1) % NS][1]), 0)));
      const Hs = vAcc[vAcc.length - 1];
      bg.begin(`boot_${s}`, perim, Hs, { kind: 'side', s });
      const jOff = Math.round(NS / 2);   // the seam at the heel (j = NS / 2 is the back)
      // heel step: under the arch the sole's tread face is lifted 1.1 cm (a heel block and a forefoot pad)
      const arch = (f) => 0.011 * ss(back0 + 0.068, back0 + 0.082, f) * (1 - ss(ballF - 0.065, ballF - 0.04, f));
      const ids = rings.map((R, k) => {
        const row = [];
        for (let jj = 0; jj <= NS; jj++) {
          const j = (jj + jOff) % NS;
          const [f, sv] = R.pts[j];
          row.push(bg.v(toW(f, sv, R.y + (k === 0 ? arch(f) : 0)), [jj / NS, vAcc[k] / Hs], wOf(f, R.y)));
        }
        return row;
      });
      const f0 = bg.F.length;
      gridQuads(bg, ids);
      // orientation: the ankle ring faces must point away from the ring centre
      {
        const k = rings.findIndex((q) => q.ank), jj = 3, a = ids[k][jj], b = ids[k][jj + 1], c = ids[k + 1][jj + 1];
        const P3 = (i) => [bg.P[i * 3], bg.P[i * 3 + 1], bg.P[i * 3 + 2]];
        const nrm = cross(sub(P3(b), P3(a)), sub(P3(c), P3(a)));
        const ctr = toW(rings[k].cen[0], rings[k].cen[1], rings[k].y);
        const outw = sub(P3(a), ctr); outw[1] = 0;
        if (dot(nrm, outw) < 0) for (let fi = f0; fi < bg.F.length; fi++) { const F = bg.F[fi]; F.v = [F.v[0], F.v[2], F.v[1]]; F.t = F.v.slice(); }
      }
      // sole cap: its own vertices (a crisp edge), strip-triangulated toe -> heel
      const R0 = rings[0];
      const xs = R0.pts.map((p) => p[0]), ysd = R0.pts.map((p) => p[1]);
      const fMin = Math.min(...xs), fMax = Math.max(...xs), sMin = Math.min(...ysd), sMax = Math.max(...ysd);
      bg.begin(`sole_${s}`, sMax - sMin, fMax - fMin, { kind: 'cap', s });
      const cap = R0.pts.map(([f, sv]) => bg.v(toW(f, sv, y0 + arch(f)), [(sv - sMin) / (sMax - sMin), (f - fMin) / (fMax - fMin)], [[`foot_${s}`, 1 - ss(ballF - 0.03, ballF + 0.05, f) * 0.7], [`ball_${s}`, ss(ballF - 0.03, ballF + 0.05, f) * 0.7]]));
      const c0 = bg.F.length;
      for (let j = 0; j < NS / 2; j++) {
        const l0 = j, l1 = j + 1, r0 = (NS - j) % NS, r1 = NS - j - 1;
        if (j === 0) { bg.tri(cap[l0], cap[r1], cap[l1]); continue; }
        if (l1 === r1) { bg.tri(cap[l0], cap[r0], cap[l1]); continue; }
        bg.tri(cap[l0], cap[r0], cap[r1]); bg.tri(cap[l0], cap[r1], cap[l1]);
      }
      for (let fi = c0; fi < bg.F.length; fi++) {
        const F = bg.F[fi], P3 = (i) => [bg.P[i * 3], bg.P[i * 3 + 1], bg.P[i * 3 + 2]];
        const n = cross(sub(P3(F.v[1]), P3(F.v[0])), sub(P3(F.v[2]), P3(F.v[0])));
        if (n[1] > 0) { F.v = [F.v[0], F.v[2], F.v[1]]; F.t = F.v.slice(); }
      }
      bootInfo.push({ s, A: A0, K, fw, sd, Ag, toF, toW, rings, yTop, yA, ballF, front0, back0, sc, NS, arch });
    }
    // trousers tucked in: vertices just above the collar are pulled in under it (fading out 8 cm above), the rest
    // inside the boot (and the feet / shins of the body) dropped
    const outlineR = (R, f, sv) => {
      const th = Math.atan2(sv - R.cen[1], f - R.cen[0]);
      let best = null, bd = 9;
      R.pts.forEach(([pf, ps]) => { const a = Math.atan2(ps - R.cen[1], pf - R.cen[0]); let dd = Math.abs(a - th); if (dd > Math.PI) dd = 2 * Math.PI - dd; if (dd < bd) { bd = dd; best = Math.hypot(pf - R.cen[0], ps - R.cen[1]); } });
      return best;
    };
    const ringNear = (W, y) => W.rings.filter((q) => !q.collar).reduce((best, q) => (Math.abs(q.y - y) < Math.abs(best.y - y) ? q : best));
    let moved = 0;
    for (let v = 0; v < uni.nVerts; v++) {
      if (uniGarmentV[v] !== 1) continue;
      const p = [uni.pos[v * 3], uni.pos[v * 3 + 1], uni.pos[v * 3 + 2]];
      const W = bootInfo[p[0] >= 0 ? 0 : 1];
      if (p[1] > W.yTop + 0.08) continue;
      const top = p[1] >= W.yTop ? W.rings.find((q) => q.top) : ringNear(W, p[1]);
      const [f, sv] = W.toF(p);
      const r = Math.hypot(f - top.cen[0], sv - top.cen[1]);
      if (r < 1e-4 || r > 0.3) continue;
      const rt = outlineR(top, f, sv) - 0.014;
      const w = 1 - ss(W.yTop - 0.01, W.yTop + 0.08, p[1]);
      if (r > rt) {
        const nr = lerp(r, rt, w), k = nr / r;
        const q = W.toW(top.cen[0] + (f - top.cen[0]) * k, top.cen[1] + (sv - top.cen[1]) * k, p[1]);
        uni.pos[v * 3] = q[0]; uni.pos[v * 3 + 2] = q[2]; moved++;
      }
    }
    const inBoot = (p) => {
      const W = bootInfo[p[0] >= 0 ? 0 : 1];
      if (p[1] > W.yTop + 0.004) return false;
      const [f, sv] = W.toF(p);
      const R = ringNear(W, p[1]);
      return Math.hypot(f - R.cen[0], sv - R.cen[1]) < outlineR(R, f, sv) + 0.02;
    };
    const drop = (part) => { let n = 0; part.obj.faces.forEach((f, fi) => { if (part.keep[fi] && f.v.every((v) => inBoot([part.pos[v * 3], part.pos[v * 3 + 1], part.pos[v * 3 + 2]]))) { part.keep[fi] = 0; n++; } }); return n; };
    const dT = drop(uni), dB = drop(body);
    for (const v of h.baseObj.groupVerts('body')) if (inBoot([h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]])) h.hidden.add(v);
    console.log(`${TAG} boots: ${bg.F.length} tris, top ${bootTop.toFixed(3)}, sole ${y0.toFixed(3)}; trousers pulled in ${moved}, dropped inside: trousers ${dT}, body ${dB}`);
  }
  bg.pack();
  const boots = weldNormals(toPart(lib, h, bg, 'boots', 'cloth', () => [['foot_l', 1]]), 5e3);

  // ---------------------------------------------------------------- tears (3D regions, metres)
  const lowR = boneSeg(sk.lowerarm_r), upR = boneSeg(sk.upperarm_r), thighL = boneSeg(sk.thigh_l);
  const neckBite = lib.surfacePoint(h, 'neck_01', 0.55, [0.85, 0.1, 0.5]);
  const armBite = lib.surfacePoint(h, 'lowerarm_r', 0.62, [-0.2, -0.3, 1]);
  /** whole regions ripped away: the right sleeve from just above the elbow down, the collar round the neck bite */
  const bigTear = (P) => {
    let w = 0;
    const a = lowR(P);
    if (a.d < 0.1) w = Math.max(w, ss(-0.16, -0.06, a.t * a.L + N.fbm(P[0] * 18, P[1] * 18, P[2] * 18, 3) * 0.035) * (1 - ss(0.085, 0.1, a.d)));
    const db = dist(P, neckBite.p) + N.fbm(P[0] * 30, P[1] * 30, P[2] * 30, 3) * 0.018;
    w = Math.max(w, 1 - ss(0.03, 0.06, db));
    return w * 1.35;
  };
  // (the earlier thigh rip and upper-arm hole are gone: the thigh guards and the pauldrons cover those places, and
  // the small holes read as flat skin-coloured stickers on the cloth. The random noise holes are suppressed too, so
  // the only rips are the sleeve torn off at the elbow and the collar round the neck bite.)
  void upR; void thighL;
  const tearWhere = (P) => bigTear(P) - 0.25;
  for (const v of [...h.hidden]) if (bigTear([h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]]) > 1.1) h.hidden.delete(v);

  // ---------------------------------------------------------------- uniform texture + tears (removes torn faces)
  let cloth;
  {
    const SRC = await lib.texture(uni.asset.textures.diffuse, FAST ? 512 : 2048);
    const S = SRC.width;
    // texel -> garment (shirt / trousers) from the part's own UV raster (islands share the atlas)
    const gm = new Int8Array(S * S).fill(-1);
    {
      const tr = uni.tris(), faceOf = uni._faceOf;
      const r = rasterUV(tr, uni.obj.uvs, S, 6);
      for (let i = 0; i < S * S; i++) if (r.tri[i] >= 0) gm[i] = garment[faceOf[r.tri[i]]];
    }
    let mL = [0, 0], nL = [0, 0];
    for (let i = 0; i < S * S; i++) { const g = gm[i]; if (g < 0 || g > 1) continue; mL[g] += lum([S2L[SRC.data[i * 4]], S2L[SRC.data[i * 4 + 1]], S2L[SRC.data[i * 4 + 2]]]); nL[g]++; }
    mL = mL.map((m, g) => m / Math.max(1, nL[g]));
    // navy duty shirt (slate blue), darker navy trousers: the source's seams / folds / pockets as a luminance ratio.
    // The source trousers are stonewashed jeans: their large-scale fade (pale thighs, whiskers, dark hems) is
    // flattened (low-passed luminance at a small exponent) and only the fine twill / seams / folds are kept, so the
    // legs read as dyed duty cloth, not denim.
    // olive-drab BDU (shirt a touch lighter / sun-faded): NOT walker_a's blue work suit, and light enough that the
    // game's tone curve keeps it above black on the shadow side (linear albedo ~0.1)
    const SHIRT = lin([112, 114, 84]), PANTS = lin([102, 106, 78]);
    const Lf = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) Lf[i] = lum([S2L[SRC.data[i * 4]], S2L[SRC.data[i * 4 + 1]], S2L[SRC.data[i * 4 + 2]]]);
    const Lb = blurField(Lf, S, S, Math.max(2, Math.round(S / 90)), 2);
    const base = grade(lib.cloneImage(SRC), (c, x, y) => {
      const i = y * S + x, g = gm[i] === 1 ? 1 : 0;
      const k = g ? Math.min(1.45, ((Lb[i] / mL[1]) ** 0.22) * ((Lf[i] / Math.max(1e-4, Lb[i])) ** 0.32)) : Math.min(1.6, (Lf[i] / mL[0]) ** 0.7);
      const col = g ? PANTS : SHIRT;
      for (let q = 0; q < 3; q++) c[q] = col[q] * k;
    });
    TR.snap('uniform: graded', base, uni);
    // cargo pockets on the outer thighs (flap, seams, the shadow of the bellows), lighter worn knees, the neck bite's
    // blood soaking down the left collar and shoulder, grime rubbed into the cuffs
    const thighSeg = { l: boneSeg(sk.thigh_l), r: boneSeg(sk.thigh_r) };
    const kneeP = { l: B('calf_l'), r: B('calf_r') };
    const uniExtra = (P, Nn, c) => {
      if (P[1] < waistTop - 0.06) {
        const s = P[0] >= 0 ? 'l' : 'r', sg = s === 'l' ? 1 : -1;
        const q = thighSeg[s](P);
        if (q.d < 0.15 && q.t > 0.3 && q.t < 0.8) {
          const a = V(sk[`thigh_${s}`].head), ax = norm(sub(V(sk[`thigh_${s}`].tail), a));
          const rv = sub(sub(P, a), scl(ax, q.t * q.L));
          const ref = norm(sub([sg, 0, 0.2], scl(ax, dot([sg, 0, 0.2], ax)))), ref2 = cross(ax, ref);
          const arc = Math.atan2(dot(rv, ref2), dot(rv, ref)) * Math.max(0.05, len(rv));
          const along = q.t * q.L, top = 0.36 * q.L, bot = 0.66 * q.L, hw = 0.072;
          const inX = Math.abs(arc) < hw, inY = along > top && along < bot;
          if (inX && inY) {
            const e = Math.min(hw - Math.abs(arc), along - top, bot - along);
            mul(c, [0.62, 0.62, 0.64], 1 - ss(0.0, 0.004, e));                           // pocket edge shadow
            over(c, mix3(c, lin([128, 126, 98]), 1), (1 - ss(0.0015, 0.0035, Math.abs(e - 0.006))) * 0.45);   // stitching
            const fl = along - (top + 0.05);                                               // flap bottom edge
            if (fl > 0) mul(c, [0.55, 0.55, 0.58], (1 - ss(0.0, 0.007, fl)) * 0.8);
            else mul(c, [1.08, 1.08, 1.06], 0.6);
          }
        }
        const dk = dist(P, kneeP[s]);
        if (dk < 0.1 && Nn[2] > 0) mul(c, [1.18, 1.16, 1.1], (1 - ss(0.03, 0.1, dk)) * ss(-0.2, 0.5, N.fbm(P[0] * 30, P[1] * 30, P[2] * 30, 3) + 0.2) * 0.8);
      }
      // the neck bite bled down the left side of the collar, chest and shoulder (dried brown-black at the edges)
      const nb = neckBite.p, dy = nb[1] - P[1], dx = P[0] - nb[0];
      if (dy > -0.03 && dy < 0.32 && Math.abs(dx) < 0.2) {
        const wv = 0.05 + dy * 0.18 + N.fbm(P[0] * 14, P[1] * 9, P[2] * 14, 3) * 0.03;
        const soak = (1 - ss(wv - 0.02, wv + 0.02, Math.abs(dx - dy * 0.12))) * (1 - ss(0.12, 0.32, dy + N.fbm(P[0] * 10 + 3, P[1] * 10, P[2] * 10, 2) * 0.06));
        const streak = ss(0.4, 0.7, N.noise(P[0] * 70, P[1] * 4, P[2] * 70)) * (1 - ss(0.0, 0.08, Math.abs(dx - 0.02))) * (1 - ss(0.25, 0.5, dy));
        const k = Math.min(1, soak * 0.9 + streak * 0.7);
        if (k > 0) over(c, mix3(lin([74, 8, 8]), lin([40, 10, 8]), ss(0.1, 0.4, dy)), k * 0.85);
      }
      // the bare right forearm bled onto the torn sleeve end
      const ab = armBite.p, da = dist(P, ab);
      if (da < 0.16) over(c, lin([60, 9, 8]), (1 - ss(0.05, 0.16, da)) * ss(-0.1, 0.4, N.fbm(P[0] * 25, P[1] * 25, P[2] * 25, 3) + 0.15) * 0.8);
    };
    cloth = lib.paintCloth(uni, {
      seed: 31, human: h, base, size: FAST ? 256 : 2048,
      normal: FAST ? null : await lib.texture(uni.asset.textures.normal, 1024), ao: FAST ? null : await lib.texture(uni.asset.textures.ao, 1024),
      normalSize: 1024, ormSize: 512,
      fade: 0.25, grime: 0.6, grimeNoise: 0.7, weave: 0.15, innerDarken: 0,
      blood: { splatter: 0.3, hands: 0.4, edges: 0.7 },
      tear: { amount: 0.22, scale: 6, stretch: 0.45, fray: 0.7, where: tearWhere, threadColor: lin([128, 124, 96]) },
      extra: uniExtra,
    });
    TR.snap('uniform: painted', cloth.albedo, uni);
    console.log(`${TAG} uniform: ${cloth.removedFaces} torn faces removed`);
  }

  // ---------------------------------------------------------------- surfaces / BVHs (rest pose)
  const fullBody = h.basePart({ name: 'bvh' });
  const bodyB = makeBVH([surf(fullBody)]);
  const skinClosest = makeClosestSkinner(h, fullBody, skinAt);
  const armBones = new Set(h.skeleton.bones.filter((b) => /^(upperarm|lowerarm|hand|thumb|index|middle|ring|pinky)/.test(b.name)).map((b) => b.index));
  const armW = (part, v) => part.weights[v].reduce((a, [b, w]) => a + (armBones.has(b) ? w : 0), 0);
  const nonArm = (part, lim = 0.5) => { const t = part.tris(), out = []; for (let i = 0; i < t.length; i += 6) if (armW(part, t[i]) < lim && armW(part, t[i + 2]) < lim && armW(part, t[i + 4]) < lim) for (let k = 0; k < 6; k++) out.push(t[i + k]); return { pos: part.pos, tris: Int32Array.from(out) }; };
  const torsoB = makeBVH([nonArm(fullBody, 0.35), nonArm(uni, 0.35)]);
  const spineZ = (y) => {
    const ch = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01'].map((n) => B(n));
    if (y <= ch[0][1]) return ch[0][2];
    for (let i = 0; i + 1 < ch.length; i++) if (y <= ch[i + 1][1]) return lerp(ch[i][2], ch[i + 1][2], (y - ch[i][1]) / (ch[i + 1][1] - ch[i][1]));
    return ch[ch.length - 1][2];
  };
  /** outermost surface point at height y in horizontal direction theta (deg; 0 = front +Z, +90 = character's left +X) */
  const around = (bv, theta, y, xc = 0) => {
    const d = [Math.sin(theta * D2R), 0, Math.cos(theta * D2R)];
    const c = [xc, y, spineZ(y)];
    const hit = bv.first(madd(c, d, 1.2), scl(d, -1), 1.3);
    return hit ? { p: hit.p, n: dot(hit.n, d) < 0 ? scl(hit.n, -1) : hit.n, r: 1.2 - hit.d } : { p: madd(c, d, 0.15), n: d, r: 0.15 };
  };
  const torsoBones = ['spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r'];

  // ================================================================ VEST (gear): ballistic vest, straps, plate, pouches,
  // radio, duty belt. One part, one atlas.
  const vg = new Geo();
  const vest = {};
  {
    const yArm = sk.upperarm_l.head.y - 0.125;          // under the armpits
    const yBotV = waistTop + 0.012;                     // the vest ends on the belt
    const yNF = clY - 0.045, yStrap = clY + 0.012, yNB = clY - 0.012;
    const yTopAt = (th) => {
      const a = Math.abs(((th + 540) % 360) - 180);    // 0 front .. 180 back
      if (a <= 30) return lerp(yNF, yStrap, ss(0, 30, a) ** 0.7);
      if (a <= 64) return lerp(yStrap, yArm, ss(32, 62, a));
      if (a <= 116) return yArm;
      if (a <= 150) return lerp(yArm, yStrap, ss(118, 148, a));
      return lerp(yStrap, yNB, ss(150, 180, a));
    };
    const yBotAt = (th) => { const a = Math.abs(((th + 540) % 360) - 180); return yBotV - 0.012 * (1 - ss(0, 50, a)); };
    const NA = 32, NV = 9, T = 0.021;
    const dTh = 360 / NA;
    // radial distance of the outer shell per (row, col): convex hull around the torso + 2.4 cm
    const R = [], raw = [], Ys = [];
    for (let k = 0; k < NV; k++) {
      const row = [], rr = [], yy = [];
      for (let j = 0; j < NA; j++) {
        const th = j * dTh;
        const y = lerp(yBotAt(th), yTopAt(th), k / (NV - 1));
        const s = around(torsoB, th, y);
        const r = s.r + 0.028;
        row.push(r); rr.push(s.r + 0.023); yy.push(y);
      }
      R.push(row); raw.push(rr); Ys.push(yy);
    }
    const cosD = Math.cos(dTh * D2R);
    for (let it = 0; it < 30; it++) {
      for (let k = 0; k < NV; k++) for (let j = 0; j < NA; j++) {
        const r1 = R[k][(j + NA - 1) % NA], r2 = R[k][(j + 1) % NA];
        R[k][j] = Math.max(R[k][j], 2 * r1 * r2 * cosD / (r1 + r2));
      }
      for (let k = 1; k + 1 < NV; k++) for (let j = 0; j < NA; j++) R[k][j] = Math.max(R[k][j], (R[k - 1][j] + R[k + 1][j]) / 2 - 0.002);
    }
    for (let it = 0; it < 4; it++) {
      const R0 = R.map((r) => r.slice());
      for (let k = 0; k < NV; k++) for (let j = 0; j < NA; j++) {
        const nb = [R0[k][(j + NA - 1) % NA], R0[k][(j + 1) % NA], R0[Math.max(0, k - 1)][j], R0[Math.min(NV - 1, k + 1)][j]];
        R[k][j] = Math.max(raw[k][j], lerp(R0[k][j], (nb[0] + nb[1] + nb[2] + nb[3]) / 4, 0.35));
      }
    }
    // the bottom hem flares a touch
    for (let j = 0; j < NA; j++) R[0][j] += 0.004;
    const outer = (k, j) => { const th = j * dTh, y = Ys[k][j % NA]; return [Math.sin(th * D2R) * R[k][j % NA], y, spineZ(y) + Math.cos(th * D2R) * R[k][j % NA]]; };
    const inner = (k, j, t = T) => { const th = j * dTh, y = Ys[k][j % NA], r = R[k][j % NA] - t; return [Math.sin(th * D2R) * r, y, spineZ(y) + Math.cos(th * D2R) * r]; };
    // main shell: u around (seam at the back centre), v up by height
    const yMin = Math.min(...Ys[0]), yMax = Math.max(...Ys[NV - 1]);
    const circ = R[(NV / 2) | 0].reduce((a, r) => a + r * dTh * D2R, 0);
    vg.begin('vestShell', circ, yMax - yMin);
    const ids = [];
    for (let k = 0; k < NV; k++) {
      const row = [];
      for (let jj = 0; jj <= NA; jj++) {
        const j = (jj + NA / 2) % NA;       // start at the back centre
        row.push(vg.v(outer(k, j), [jj / NA, (Ys[k][j] - yMin) / (yMax - yMin)]));
      }
      ids.push(row);
    }
    gridQuads(vg, ids);
    // edge binding: top and bottom border bands folding 1.7 cm back to the body
    for (const [k, nm] of [[NV - 1, 'vestTop'], [0, 'vestBot']]) {
      vg.begin(nm, circ * 1.1, 0.03);
      const a = [], b = [], c = [];
      for (let jj = 0; jj <= NA; jj++) {
        const j = (jj + NA / 2) % NA;
        const up = k ? 1 : -1;
        const o = outer(k, j);
        a.push(vg.v(o, [jj / NA, 0]));
        b.push(vg.v(add(inner(k, j, T * 0.45), [0, up * 0.004, 0]), [jj / NA, 0.5]));
        c.push(vg.v(inner(k, j), [jj / NA, 1]));
      }
      gridQuads(vg, k ? [a, b, c] : [c, b, a]);
    }
    Object.assign(vest, { NA, NV, R, Ys, dTh, outer, inner, yArm, yBotV, yNF, yStrap, yNB, yTopAt, ids, T });
    // the bare carrier (shell + edge binding), before straps / plates / pouches: what the hard plates sit on
    const shellB = makeBVH([{ pos: Float32Array.from(vg.P), tris: Int32Array.from(vg.F.flatMap((f) => [f.v[0], 0, f.v[1], 0, f.v[2], 0])) }]);
    // ---- shoulder straps over the trapezius: front strap root (th = +-30) -> top of the shoulder -> back (th = +-150)
    const strapPaths = [];
    for (const s of [1, -1]) {
      const jf = Math.round((s > 0 ? 30 : 330) / dTh) % NA, jb = Math.round((s > 0 ? 150 : 210) / dTh) % NA;
      const F = outer(NV - 1, jf), Bk = outer(NV - 1, jb);
      const xs = sk.upperarm_l.head.x * 0.56 * s;
      const top = torsoB.first([xs, 3, spineZ(clY) - 0.005], [0, -1, 0], 4);
      const M = add(top.p, [0, 0.02, 0]);
      const mid1 = lerp3(F, M, 0.5), mid2 = lerp3(M, Bk, 0.5);
      const proj = (q, off) => { const c = torsoB.closest(q); const ctr = [0, c.p[1] - 0.2, spineZ(c.p[1])]; let n = c.n; if (dot(n, sub(c.p, ctr)) < 0) n = scl(n, -1); return { p: madd(c.p, n, off), n }; };
      const ctrl = [F, proj(mid1, 0.022).p, M, proj(mid2, 0.022).p, Bk];
      const P = catmull(ctrl, 3);
      const NN = P.map((q, i) => (i === 0 || i === P.length - 1) ? norm([q[0], 0, q[2] - spineZ(q[1])]) : proj(q, 0).n);
      const Lp = P.reduce((a, q, i) => a + (i ? dist(q, P[i - 1]) : 0), 0);
      const W = 0.072, TH = 0.014;
      vg.begin(`strap${s}`, Lp, W + 2 * TH);
      const rows = [[], [], [], []];
      P.forEach((q, i) => {
        const t = norm(sub(P[Math.min(P.length - 1, i + 1)], P[Math.max(0, i - 1)]));
        const n = NN[i], sd = norm(cross(t, n));
        const u = i / (P.length - 1);
        rows[0].push(vg.v(madd(madd(q, sd, -W / 2), n, -TH), [u, 0]));
        rows[1].push(vg.v(madd(q, sd, -W / 2), [u, TH / (W + 2 * TH)]));
        rows[2].push(vg.v(madd(q, sd, W / 2), [u, (TH + W) / (W + 2 * TH)]));
        rows[3].push(vg.v(madd(madd(q, sd, W / 2), n, -TH), [u, 1]));
      });
      const T2 = rows[0].map((_, i) => rows.map((r) => r[i]));
      for (let i = 0; i + 1 < P.length; i++) for (let r = 0; r < 3; r++) vg.quad(T2[i][r], T2[i][r + 1], T2[i + 1][r + 1], T2[i + 1][r]);
      strapPaths.push({ s, P, NN, W });
    }
    vest.straps = strapPaths;
    // ---- hard armour plates on the front: a rigid chest plate (shooter's-cut hexagon: square bottom, the top
    // corners cut away for the arms) and a smaller abdomen plate under it, like a riot suit's chest / abdomen
    // protector. Each is a single-curvature shell (a cylinder round the vertical axis, tilted to the vest's front
    // slope), 2.2 cm thick: a flat front face, a 6 mm bevel, and a wall down onto the vest, so the outline has a
    // visible edge thickness from the front and the side.
    const vestB = makeBVH([{ pos: Float32Array.from(vg.P), tris: Int32Array.from(vg.F.flatMap((f) => [f.v[0], 0, f.v[1], 0, f.v[2], 0])) }]);
    const vestFront = (x, y) => { const hit = shellB.first([x, y, 2], [0, 0, -1], 3); return hit ? hit.p[2] : spineZ(y) + 0.15; };
    const hardPlate = (name, o) => {
      const { y0, y1, hw, hwTop, cut, NX, rows, Tp, Rc, allow } = o;
      const hwAt = (y) => { const t = (y - y0) / (y1 - y0); return t <= cut ? hw : lerp(hw, hwTop, (t - cut) / (1 - cut)); };
      // the plate's back surface z = a + b y - sag(x) + off, fitted to the vest front centre line, then pushed out
      // until it clears the vest (+3 mm) everywhere inside the outline
      let sy = 0, sz = 0, syy = 0, syz = 0, n = 0;
      for (let k = 0; k <= 8; k++) { const y = lerp(y0, y1, k / 8), z = vestFront(0, y); sy += y; sz += z; syy += y * y; syz += y * z; n++; }
      const b = (n * syz - sy * sz) / (n * syy - sy * sy), a = (sz - b * sy) / n;
      const sag = (x) => Rc - Math.sqrt(Rc * Rc - x * x);
      let off = -1;
      for (let k = 0; k <= 10; k++) for (let i = 0; i <= 10; i++) {
        const y = lerp(y0, y1, k / 10), x = (i / 10 * 2 - 1) * hwAt(y);
        off = Math.max(off, vestFront(x, y) + 0.003 - (a + b * y - sag(x)));
      }
      const zb = (x, y) => a + b * y - sag(x) + off;
      const nz = norm([0, -b, 1]);                       // plate normal (front), ignoring the small sag
      const Pp = (x, y, d) => [x, y + nz[1] * d, zb(x, y) + nz[2] * d];
      const ins = 0.006;                                  // bevel inset
      const ys = rows.map((t) => lerp(y0, y1, t));
      // front face: rows across the outline, inset by the bevel
      const W2 = 2 * hw, H2 = y1 - y0;
      vg.begin(name, W2, H2, { kind: 'plate', which: name });
      const grid = ys.map((y, j) => {
        const yy = j === 0 ? y + ins : j === ys.length - 1 ? y - ins : y;
        const e = hwAt(yy) - ins * (j === 0 || j === ys.length - 1 ? 1 : 1.25);
        const row = [];
        for (let i = 0; i <= NX; i++) { const x = lerp(-e, e, i / NX); row.push(vg.v(Pp(x, yy, Tp), [0.5 + x / W2, (yy - y0) / H2])); }
        return row;
      });
      gridQuads(vg, grid);
      // border loops: front-face boundary (inset), the bevel's outer edge (full outline, 6 mm further back) and the
      // wall foot on the vest
      const loop = [];
      for (let i = 0; i < NX; i++) loop.push([0, i]);
      for (let j = 0; j < ys.length - 1; j++) loop.push([j, NX]);
      for (let i = NX; i > 0; i--) loop.push([ys.length - 1, i]);
      for (let j = ys.length - 1; j > 0; j--) loop.push([j, 0]);
      const outl = loop.map(([j, i]) => {
        const y = ys[j], x = lerp(-hwAt(y), hwAt(y), i / NX);
        return [x, y];
      });
      const Lw = outl.reduce((s, q, k) => s + Math.hypot(q[0] - outl[(k + 1) % outl.length][0], q[1] - outl[(k + 1) % outl.length][1]), 0);
      vg.begin(name + 'Bevel', Lw, 0.024, { kind: 'plateEdge', which: name });
      let acc = 0;
      const rowA = [], rowB = [], rowC = [];
      outl.forEach(([x, y], k) => {
        if (k) acc += Math.hypot(x - outl[k - 1][0], y - outl[k - 1][1]);
        const u = acc / Lw;
        const [j, i] = loop[k];
        const fp = [vg.P[grid[j][i] * 3], vg.P[grid[j][i] * 3 + 1], vg.P[grid[j][i] * 3 + 2]];
        rowA.push(vg.v(fp, [u, 0]));
        rowB.push(vg.v(Pp(x, y, Tp - ins), [u, 0.3]));
        const zf = vestFront(x * 0.995, y);
        const back = Pp(x, y, 0);
        rowC.push(vg.v([back[0], back[1], Math.min(back[2], Math.max(zf - 0.004, back[2] - 0.03))], [u, 1]));
      });
      const close = (r) => [...r, r[0]];
      gridQuads(vg, [close(rowA), close(rowB), close(rowC)], { flip: true });
      return { y0, y1, hw, hwTop, cut, hwAt, zb, Pp, nz, Tp, allow, yc: (y0 + y1) / 2, hh: (y1 - y0) / 2 };
    }
    {
      const ySplit = lerp(yBotV, yNF, 0.27);
      vest.plate = hardPlate('plate', { y0: ySplit, y1: yNF - 0.004, hw: 0.138, hwTop: 0.088, cut: 0.62, NX: 6, rows: [0, 0.2, 0.42, 0.62, 0.82, 1], Tp: 0.022, Rc: 0.34, allow: ['spine_02', 'spine_03'] });
      vest.abPlate = hardPlate('abPlate', { y0: yBotV + 0.006, y1: ySplit - 0.012, hw: 0.118, hwTop: 0.118, cut: 1, NX: 5, rows: [0, 0.5, 1], Tp: 0.016, Rc: 0.3, allow: ['spine_01', 'spine_02'] });
      vest.plate.onVest = (x, y) => ({ p: [x, y, vestFront(x, y)], n: [0, 0, 1] });
    }
    // ---- radio: on the left side panel below the armpit, clear of the plate and the swinging arm (no antenna: a
    // whip on the chest stabbed through the jaw whenever the head pitched forward)
    {
      const th = 70, y = lerp(yBotV, yNF, 0.4);
      const s = around(torsoB, th, y);
      const q = vestB.first(madd(s.p, s.n, 0.3), scl(s.n, -1), 0.4);
      const p = q ? q.p : madd(s.p, s.n, 0.03);
      const ez = norm([s.n[0], 0, s.n[2]]), ey = [0, 1, 0], ex = norm(cross(ey, ez));
      const hs = [0.027, 0.052, 0.016];
      const w = unit(skinClosest(p, { allow: torsoBones.filter((b) => !b.startsWith('clavicle')) }));
      const c = madd(p, ez, hs[2] + 0.001);
      box(vg, 'radio', c, ex, ey, ez, hs, w);
      vest.radio = { c, ex, ey, ez, hs };
    }
    vest.pouches = [];
    // ---- duty belt: a 5 cm band 1 cm off the trousers at the waistband, two pouches on the hips
    {
      const trouserB = makeBVH([nonArm(uni, 0.3)]);
      const yb = waistTop - 0.028, NB = 28;
      const rows = [yb - 0.026, yb + 0.026].map((y) => { const r = []; for (let j = 0; j < NB; j++) { const s = around(trouserB, j * 360 / NB, y); r.push(s.r + 0.009); } return r; });
      // convex
      for (let it = 0; it < 20; it++) for (const r of rows) for (let j = 0; j < NB; j++) { const a = r[(j + NB - 1) % NB], b = r[(j + 1) % NB]; r[j] = Math.max(r[j], 2 * a * b * Math.cos(2 * Math.PI / NB) / (a + b)); }
      const P = (k, j, dr = 0) => { const th = (j % NB) * 360 / NB * D2R, y = k ? yb + 0.026 : yb - 0.026, r = rows[k][j % NB] + dr; return [Math.sin(th) * r, y, spineZ(y) + Math.cos(th) * r]; };
      const circB = rows[0].reduce((a, r) => a + r * 2 * Math.PI / NB, 0);
      vg.begin('belt', circB, 0.052 + 0.02);
      const bw = [['pelvis', 1]];
      const lines = [];
      for (const [k, dr, v] of [[0, -0.01, 0], [0, 0, 0.14], [1, 0, 0.86], [1, -0.01, 1]]) {
        const row = [];
        for (let jj = 0; jj <= NB; jj++) row.push(vg.v(P(k, (jj + NB / 2) % NB, dr), [jj / NB, v], bw));
        lines.push(row);
      }
      gridQuads(vg, lines);
      vest.belt = { yb, rows, P, NB };
      // buckle (front centre) + hip pouches
      const bp = P(0, 0); const bpt = [bp[0], yb, bp[2] + 0.004];
      box(vg, 'buckle', bpt, [1, 0, 0], [0, 1, 0], [0, 0, 1], [0.032, 0.024, 0.006], bw);
      for (const [j, nm, hs] of [[Math.round(NB * 0.2), 'beltPouchL', [0.04, 0.05, 0.022]], [Math.round(NB * 0.8), 'beltPouchR', [0.045, 0.055, 0.026]]]) {
        const th = j * 360 / NB * D2R;
        const p = P(1, j);
        const ez = [Math.sin(th), 0, Math.cos(th)], ey = [0, 1, 0], ex = norm(cross(ey, ez));
        box(vg, nm, madd(add(p, [0, -0.03, 0]), ez, hs[2]), ex, ey, ez, hs, bw);
      }
    }
  }
  vg.pack();
  const vestPart = weldNormals(toPart(lib, h, vg, 'vest', 'gear', (p, i) => {
    const pc = vg.pieces[vg.pv[i]], pn = pc.name;
    if (pn.startsWith('strap')) return skinClosest(p, { allow: ['spine_02', 'spine_03', 'clavicle_l', 'clavicle_r'] });
    // the hard plates follow the spine only (no clavicle pull at the top edge: they stay rigid)
    if (pc.info.which) return skinClosest(p, { allow: (pc.info.which === 'plate' ? vest.plate : vest.abPlate).allow });
    return skinClosest(p, { allow: torsoBones });
  }), 5e3);
  console.log(`${TAG} vest: ${vg.F.length} tris, ${vg.pieces.length} pieces, ${vg.texelPerM.toFixed(2)} atlas/m`);

  // the shirt under the vest goes (never visible; frees triangles for the head)
  {
    const vB = makeBVH([surf(vestPart)]);
    let n = 0;
    const inV = (p) => {
      const th = Math.atan2(p[0], p[2] - spineZ(p[1])) / D2R;
      const yt = vest.yTopAt(th), a = Math.abs(((th + 540) % 360) - 180);
      if (p[1] > yt - 0.03 || p[1] < vest.yBotV + 0.03) return false;
      if (a > 50 && a < 130 && p[1] > vest.yArm - 0.05) return false;
      const d = [Math.sin(th * D2R), 0, Math.cos(th * D2R)];
      return !!vB.first(p, d, 0.15);
    };
    const cov = new Uint8Array(uni.nVerts);
    for (let v = 0; v < uni.nVerts; v++) if (uniGarmentV[v] === 0 && armW(uni, v) < 0.3) cov[v] = inV([uni.pos[v * 3], uni.pos[v * 3 + 1], uni.pos[v * 3 + 2]]) ? 1 : 0;
    uni.obj.faces.forEach((f, fi) => { if (uni.keep[fi] && f.v.every((v) => cov[v])) { uni.keep[fi] = 0; n++; } });
    console.log(`${TAG} shirt faces hidden under the vest: ${n}`);
  }

  // ================================================================ GUARDS (gear): shoulder, forearm, knee / shin
  const gg = new Geo();
  const guards = { shells: [] };
  {
    // ---- pauldrons: a big hard cap over the deltoid (about 1.5x the walkers' size: it wraps from the vest strap
    // over the shoulder and well down the outside of the upper arm), fitted by rays from inside the joint to the
    // OUTERMOST layer (skin / shirt / vest strap) + 7 mm, smoothed convex, with a rolled rim. A second plate round
    // the upper arm (and its strap) is added with the limb shells below.
    const occ = makeBVH([surf(fullBody), surf(uni), surf(vestPart)]);
    for (const s of [1, -1]) {
      const SJ = B(s > 0 ? 'upperarm_l' : 'upperarm_r');
      const C = add(SJ, [-0.03 * s, -0.015, 0]);
      const up = norm([0.62 * s, 1, 0]);
      const e1 = [0, 0, 1];
      const e2 = norm(cross(up, e1));
      const e2o = s > 0 ? e2 : scl(e2, -1);   // out / down the arm
      for (const [lame, t0, t1, sx, clr] of [[0, -0.62, 1.5, 1.75, 0.007]]) {
        const NU = 8, NV = 6;
        const raw = [], dirs = [];
        for (let j = 0; j < NV; j++) {
          const row = [], drow = [];
          for (let i = 0; i < NU; i++) {
            const a = lerp(-sx, sx, i / (NU - 1)), t = lerp(t0, t1, j / (NV - 1));
            const d = norm(add(add(up, scl(e1, a * (1 - 0.18 * ss(0.6, 1.5, t)))), scl(e2o, t)));
            const hs = occ.hits(C, d, 0.3);
            row.push((hs.length ? hs[hs.length - 1].d : 0.11) + clr); drow.push(d);
          }
          raw.push(row); dirs.push(drow);
        }
        let cur = raw.map((r) => r.slice());
        for (let it = 0; it < 40; it++) {
          const nx = cur.map((r) => r.slice());
          for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
            let a = 0, k = 0;
            for (const [dj, di] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const q = cur[j + dj]?.[i + di]; if (q !== undefined) { a += q; k++; } }
            nx[j][i] = Math.max(raw[j][i], lerp(cur[j][i], a / k, 0.6));
          }
          cur = nx;
        }
        const grid = dirs.map((row, j) => row.map((d, i) => madd(C, d, cur[j][i])));
        const nm = `sh${s}_${lame}`;
        gg.begin(nm, 0.2 * sx, 0.12 * (t1 - t0), { kind: 'shoulder', s, lame });
        const ids = grid.map((row, j) => row.map((p, i) => gg.v(p, [i / (NU - 1), j / (NV - 1)])));
        gridQuads(gg, ids, { flip: s < 0 });
        // rolled rim: the border loop 1.2 cm in towards C
        const loop = [];
        for (let i = 0; i < NU; i++) loop.push([0, i]);
        for (let j = 1; j < NV; j++) loop.push([j, NU - 1]);
        for (let i = NU - 2; i >= 0; i--) loop.push([NV - 1, i]);
        for (let j = NV - 2; j > 0; j--) loop.push([j, 0]);
        gg.begin(nm + 'rim', 0.8, 0.02, { kind: 'rim' });
        const outerL = loop.map(([j, i], k) => gg.v(grid[j][i], [k / loop.length, 0]));
        const innerL = loop.map(([j, i], k) => { const p = grid[j][i]; return gg.v(madd(p, norm(sub(C, p)), 0.012), [k / loop.length, 1]); });
        for (let k = 0; k < loop.length; k++) { const k2 = (k + 1) % loop.length; if (s > 0) gg.quad(outerL[k], outerL[k2], innerL[k2], innerL[k]); else gg.quad(outerL[k], innerL[k], innerL[k2], outerL[k2]); }
        guards[`sh${s}`] = { grid, C, up, e1, e2: e2o };
        // the cap rides the shoulder: mostly the upper arm, the inner (neck-side) rows partly the collarbone
        const sd = s > 0 ? 'l' : 'r';
        for (let v = ids[0][0]; v < gg.n; v++) {
          const p = [gg.P[v * 3], gg.P[v * 3 + 1], gg.P[v * 3 + 2]];
          const tIn = clamp01(dot(sub(p, C), e2o) / 0.09 + 0.5);
          gg.W[v] = [['upperarm_' + sd, 0.45 + 0.35 * tIn], ['clavicle_' + sd, 0.55 - 0.35 * tIn]];
        }
      }
    }
    // ---- shells around a limb: forearm guards (outer / dorsal side, wrist -> below the elbow), shin guards (front,
    // boot top -> knee) with a knee cup; radius per angle from the sleeve / trouser / skin vertices + clearance.
    // Two strap bands round the limb.
    const limbVerts = (parts, test) => { const out = []; for (const part of parts) { const used = new Set(); part.obj.faces.forEach((f, fi) => { if (part.keep[fi]) for (const v of f.v) used.add(v); }); for (const v of used) { const p = [part.pos[v * 3], part.pos[v * 3 + 1], part.pos[v * 3 + 2]]; if (test(p, part, v)) out.push(p); } } return out; };
    const shell = (o) => {
      const { name, a0, a1, mid, span, t0, t1, NC, NL, clr, weights, kind, flare = 0, src } = o;
      const ax = norm(sub(a1, a0)), L = dist(a0, a1);
      const ref = norm(sub(mid, scl(ax, dot(mid, ax)))), ref2 = cross(ax, ref);
      // radius table per angle (around the full circle) and per length bin
      const NB = 24, NLB = 8;
      const rT = Array.from({ length: NLB }, () => new Float32Array(NB).fill(0.03));
      for (const p of src) {
        const d = sub(p, a0), t = dot(d, ax) / L;
        if (t < t0 - 0.08 || t > t1 + 0.08) continue;
        const rv = sub(d, scl(ax, t * L)), r = len(rv);
        if (r > (o.rMax ?? 0.12)) continue;
        const ang = Math.atan2(dot(rv, ref2), dot(rv, ref));
        const bi = Math.floor(((ang / (2 * Math.PI)) * NB + NB * 1.5)) % NB;
        const li = Math.max(0, Math.min(NLB - 1, Math.floor((t - t0) / (t1 - t0) * NLB)));
        for (const l of [li - 1, li, li + 1]) if (l >= 0 && l < NLB) for (const b of [bi - 1, bi, bi + 1]) { const bb = (b + NB) % NB; rT[l][bb] = Math.max(rT[l][bb], r); }
      }
      // exact (unfiltered) radius near (t, ang): the max over the source vertices within 1.2 cm along the limb and
      // 14 deg around it - the straps are shrink-wrapped with this (the binned table above is max-filtered over its
      // neighbours, which stood the straps off the back of the calf like rails)
      const srcP = src.map((p) => { const d = sub(p, a0), t = dot(d, ax) / L, rv = sub(d, scl(ax, t * L)); return [t, Math.atan2(dot(rv, ref2), dot(rv, ref)), len(rv)]; });
      const rTight = (t, ang, fb) => {
        let m = 0;
        for (const [tv, av, rv] of srcP) {
          if (Math.abs(tv - t) * L > 0.012 || rv > (o.rMax ?? 0.12) + 0.02) continue;
          let da = Math.abs(av - ang); if (da > Math.PI) da = 2 * Math.PI - da;
          if (da < 14 * D2R) m = Math.max(m, rv);
        }
        return m || fb;
      };
      const rAt = (t, ang) => {
        const l = Math.max(0, Math.min(NLB - 1, (t - t0) / (t1 - t0) * NLB - 0.5)), l0 = Math.floor(l), l1 = Math.min(NLB - 1, l0 + 1), lt = l - l0;
        const b = ((ang / (2 * Math.PI)) * NB + NB * 1.5) % NB, b0 = Math.floor(b) % NB, b1 = (b0 + 1) % NB, bt = b - Math.floor(b);
        return lerp(lerp(rT[l0][b0], rT[l0][b1], bt), lerp(rT[l1][b0], rT[l1][b1], bt), lt);
      };
      // shell grid: angles -span/2..span/2 around `mid`, rows t0..t1; radius = max over the row (rigid tube-ish) blend
      const grid = [];
      for (let r = 0; r <= NL; r++) {
        const t = lerp(t0, t1, r / NL);
        let rowMax = 0;
        for (let k = 0; k < 16; k++) rowMax = Math.max(rowMax, rAt(t, (k / 16 - 0.5) * span * D2R));
        const row = [];
        for (let c = 0; c <= NC; c++) {
          const ang = (c / NC - 0.5) * span * D2R;
          const rr = Math.max(rAt(t, ang), rowMax * (o.rowFloor ?? 0.8)) + clr + flare * ss(0.6, 1, r / NL) + (o.endFlare || 0) * ss(0.4, 0, r / NL);
          row.push(madd(madd(a0, ax, t * L), add(scl(ref, Math.cos(ang)), scl(ref2, Math.sin(ang))), rr));
        }
        grid.push(row);
      }
      const circ = span * D2R * 0.05;
      gg.begin(name, (t1 - t0) * L, circ, { kind });
      const ids = grid.map((row, r) => row.map((p, c) => gg.v(p, [r / NL, c / NC], weights(p))));
      // rows along the limb, columns around: winding so normals point outward
      const T2 = ids[0].map((_, c) => ids.map((row) => row[c]));
      gridQuads(gg, T2, { flip: true });
      // rolled rim (whole border, 8 mm towards the axis)
      const loop = [];
      for (let c = 0; c <= NC; c++) loop.push([0, c]);
      for (let r = 1; r <= NL; r++) loop.push([r, NC]);
      for (let c = NC - 1; c >= 0; c--) loop.push([NL, c]);
      for (let r = NL - 1; r > 0; r--) loop.push([r, 0]);
      gg.begin(name + 'rim', 0.5, 0.012, { kind: 'rim' });
      const oL = loop.map(([r, c], k) => gg.v(grid[r][c], [k / loop.length, 0], weights(grid[r][c])));
      const iL = loop.map(([r, c], k) => { const p = grid[r][c]; const t = dot(sub(p, a0), ax); const q = madd(a0, ax, t); return gg.v(madd(p, norm(sub(q, p)), 0.008), [k / loop.length, 1], weights(grid[r][c])); });
      for (let k = 0; k < loop.length; k++) { const k2 = (k + 1) % loop.length; if (o.flip) gg.quad(oL[k], iL[k], iL[k2], oL[k2]); else gg.quad(oL[k], oL[k2], iL[k2], iL[k]); }
      // straps: full bands round the limb at o.straps (t), on the measured radius + 3 mm
      for (const [si, ts] of (o.straps || []).entries()) {
        gg.begin(`${name}strap${si}`, 0.35, 0.035, { kind: 'strap' });
        const NS = 12, wS = 0.017;
        const rows2 = [-1, 1].map((sg) => { const out = []; for (let k = 0; k <= NS; k++) { const ang = (k / NS - 0.5) * 2 * Math.PI; const tt = ts + sg * wS / L; const rr = Math.max(rTight(ts, ang, rAt(tt, ang) - 0.004), rTight(tt, ang, 0)) + 0.0035; const p = madd(madd(a0, ax, tt * L), add(scl(ref, Math.cos(ang)), scl(ref2, Math.sin(ang))), rr); out.push(gg.v(p, [k / NS, sg < 0 ? 0 : 1], weights(p))); } return out; });
        const T3 = rows2[0].map((_, k) => [rows2[0][k], rows2[1][k]]);
        gridQuads(gg, T3, { flip: true });
      }
      guards.shells.push({ name, a0, ax, L, ref, ref2, span, t0, t1, kind });
      return { grid, rAt, rTight, ax, ref, ref2, L, a0 };
    };
    const used = (part) => part;
    for (const s of ['l', 'r']) {
      const E = B(`lowerarm_${s}`), W = B(`hand_${s}`);
      // dorsal side of the forearm (against the fingers' curl): the back of the hand
      const palm = new THREE.Vector3(0, 0, 1).applyQuaternion(sk[`middle_01_${s}`].world);
      const dors = norm([-palm.x, -palm.y, -palm.z]);
      const out = norm([s === 'l' ? 1 : -1, 0, 0.15]);
      const mid = norm(add(scl(dors, 0.55), scl(out, 0.45)));
      const src = limbVerts([used(uni), body], (p, part, v) => {
        if (part === body && h.hidden.has(v)) return false;
        const d = sub(p, E), ax = norm(sub(W, E)), t = dot(d, ax) / dist(E, W);
        return t > -0.15 && t < 1.15 && len(sub(d, scl(ax, t * dist(E, W)))) < 0.1;
      });
      shell({
        name: `fore_${s}`, kind: 'forearm', a0: E, a1: W, mid, span: 245, t0: 0.12, t1: 0.9, NC: 7, NL: 6, clr: 0.014, endFlare: 0.01, flare: 0.004, rowFloor: 0.92, src,
        weights: () => [[`lowerarm_${s}`, 1]], flip: s === 'r', straps: [0.32, 0.8],
      });
    }
    for (const s of ['l', 'r']) {
      const K = B(`calf_${s}`), Fo = B(`foot_${s}`);
      const fw = norm([V(sk[`ball_${s}`].tail)[0] - Fo[0], 0, V(sk[`ball_${s}`].tail)[2] - Fo[2]]);
      const src = limbVerts([uni], (p) => {
        const d = sub(p, K), ax = norm(sub(Fo, K)), t = dot(d, ax) / dist(K, Fo);
        return t > -0.15 && t < 1.05 && len(sub(d, scl(ax, t * dist(K, Fo)))) < 0.12;
      });
      const tTop = clamp01((K[1] - (bootTop - 0.035)) / (K[1] - Fo[1]));
      const sh = shell({
        name: `shin_${s}`, kind: 'shin', a0: K, a1: Fo, mid: fw, span: 165, t0: 0.07, t1: tTop, NC: 8, NL: 6, clr: 0.01, flare: 0.006, src,
        weights: (p) => [[`calf_${s}`, 1]], flip: s === 'r', straps: [0.3, 0.56],
      });
      // knee cup: a dome over the knee cap (rays from the knee joint, smoothed), calf-rigid with a little thigh
      const kc = madd(K, fw, 0.0);
      const occ2 = makeBVH([surf(uni)]);
      const upK = norm(sub(B(`thigh_${s}`), K));
      const e1 = fw, e2 = norm(cross(upK, e1));
      const NU = 6, NV = 6;
      const raw = [], dirs = [];
      for (let j = 0; j < NV; j++) {
        const row = [], drow = [];
        for (let i = 0; i < NU; i++) {
          const a = lerp(-0.85, 0.85, i / (NU - 1)), b = lerp(-0.55, 0.75, j / (NV - 1));
          const d = norm(add(add(e1, scl(e2, a)), scl(upK, b)));
          const hs = occ2.hits(kc, d, 0.2);
          row.push((hs.length ? hs[hs.length - 1].d : 0.07) + 0.016); drow.push(d);
        }
        raw.push(row); dirs.push(drow);
      }
      let cur = raw.map((r) => r.slice());
      for (let it = 0; it < 30; it++) { const nx = cur.map((r) => r.slice()); for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { let a = 0, k = 0; for (const [dj, di] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const q = cur[j + dj]?.[i + di]; if (q !== undefined) { a += q; k++; } } nx[j][i] = Math.max(raw[j][i], lerp(cur[j][i], a / k, 0.6)); } cur = nx; }
      const grid = dirs.map((row, j) => row.map((d, i) => madd(kc, d, cur[j][i])));
      const kw = (p) => { const up = dot(sub(p, K), upK); return [[`calf_${s}`, 1 - 0.3 * ss(-0.02, 0.06, up)], [`thigh_${s}`, 0.3 * ss(-0.02, 0.06, up)]]; };
      gg.begin(`knee_${s}`, 0.14, 0.12, { kind: 'knee' });
      const ids = grid.map((row, j) => row.map((p, i) => gg.v(p, [i / (NU - 1), j / (NV - 1)], kw(p))));
      gridQuads(gg, ids);
      const loop = [];
      for (let i = 0; i < NU; i++) loop.push([0, i]);
      for (let j = 1; j < NV; j++) loop.push([j, NU - 1]);
      for (let i = NU - 2; i >= 0; i--) loop.push([NV - 1, i]);
      for (let j = NV - 2; j > 0; j--) loop.push([j, 0]);
      gg.begin(`knee_${s}rim`, 0.4, 0.012, { kind: 'rim' });
      const oL = loop.map(([j, i], k) => gg.v(grid[j][i], [k / loop.length, 0], kw(grid[j][i])));
      const iL = loop.map(([j, i], k) => { const p = grid[j][i]; return gg.v(madd(p, norm(sub(kc, p)), 0.009), [k / loop.length, 1], kw(p)); });
      for (let k = 0; k < loop.length; k++) { const k2 = (k + 1) % loop.length; if (s === 'l') gg.quad(oL[k], iL[k], iL[k2], oL[k2]); else gg.quad(oL[k], oL[k2], iL[k2], iL[k]); }
      guards[`knee_${s}`] = { kc, grid };
    }
    // ---- upper-arm plates under the pauldrons (one strap round the arm) and thigh guards (front / outside of the
    // thigh, hip -> knee cup, one strap behind): the armoured bulk of a riot suit from every side, rigid on one bone
    for (const s of ['l', 'r']) {
      const sg = s === 'l' ? 1 : -1;
      const S0 = B(`upperarm_${s}`), E = B(`lowerarm_${s}`);
      const srcA = limbVerts([uni, body], (p, part, v) => {
        if (part === body && h.hidden.has(v)) return false;
        const d = sub(p, S0), ax = norm(sub(E, S0)), t = dot(d, ax) / dist(S0, E);
        return t > 0.1 && t < 1.0 && len(sub(d, scl(ax, t * dist(S0, E)))) < 0.11;
      });
      shell({
        name: `arm_${s}`, kind: 'upperarm', a0: S0, a1: E, mid: norm([sg, 0.05, 0.22]), span: 200, t0: 0.4, t1: 0.74, NC: 6, NL: 3, clr: 0.008, endFlare: 0.003, rowFloor: 0.9, rMax: 0.14, src: srcA,
        weights: () => [[`upperarm_${s}`, 1]], flip: s === 'r', straps: [0.66],
      });
      const T0 = B(`thigh_${s}`), K = B(`calf_${s}`);
      const srcT = limbVerts([uni], (p) => {
        const d = sub(p, T0), ax = norm(sub(K, T0)), t = dot(d, ax) / dist(T0, K);
        return t > 0.1 && t < 0.95 && len(sub(d, scl(ax, t * dist(T0, K)))) < 0.2 && Math.sign(p[0]) === sg;
      });
      shell({
        name: `thigh_${s}`, kind: 'thigh', a0: T0, a1: K, mid: norm([sg * 0.62, 0, 0.78]), span: 140, t0: 0.3, t1: 0.79, NC: 6, NL: 4, clr: 0.011, flare: 0.004, endFlare: 0.004, rowFloor: 0.85, rMax: 0.15, src: srcT,
        weights: () => [[`thigh_${s}`, 1]], flip: s === 'r', straps: [0.56],
      });
    }
  }
  gg.pack();
  const guardPart = weldNormals(toPart(lib, h, gg, 'guards', 'gear', (p) => skinClosest(p)), 5e3);
  // a pauldron is one rigid piece: it goes with the arm when the arm is shot off (its neck-side rows carry some
  // clavicle weight, which would otherwise leave half of it on the torso)
  for (let v = 0; v < gg.n; v++) { const pn = gg.pieces[gg.pv[v]].name; if (/^sh-?1_0/.test(pn)) guardPart.seg[v] = boneSegment(pn.startsWith('sh1') ? 'upperarm_l' : 'upperarm_r'); }
  console.log(`${TAG} guards: ${gg.F.length} tris, ${gg.pieces.length} pieces`);

  // ================================================================ HELMET (gear) + VISOR (gear, BLEND)
  const hg = new Geo();
  const helmet = {};
  {
    const headIdx = sk.head.index;
    let HC = [0, 0, 0], nHC = 0;
    for (const v of h.baseObj.groupVerts('body')) if (h.weights[v].some(([b, w]) => b === headIdx && w > 0.8)) { HC = add(HC, [h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]]); nHC++; }
    HC = scl(HC, 1 / nHC);
    const headW = (v) => h.weights[v].reduce((a, [b, w]) => a + (b === headIdx || b === sk.neck_01.index ? w : 0), 0);
    const ht = [];
    { const t = fullBody.tris(); for (let i = 0; i < t.length; i += 6) if (headW(t[i]) > 0.5 && headW(t[i + 2]) > 0.5 && headW(t[i + 4]) > 0.5) for (let k = 0; k < 6; k++) ht.push(t[i + k]); }
    const headB = makeBVH([{ pos: h.pos, tris: Int32Array.from(ht) }]);
    const Hc = [0, yEye + 0.012, HC[2] - 0.004];
    const dirOf = (phi, el) => [Math.sin(phi * D2R) * Math.cos(el * D2R), Math.sin(el * D2R), Math.cos(phi * D2R) * Math.cos(el * D2R)];
    const skinR = (d) => { const hit = headB.first(madd(Hc, d, 0.32), scl(d, -1), 0.32); return hit ? 0.32 - hit.d : null; };
    const yBrow = yEye + 0.036, ySide = yEye - 0.05, yBack = yEye - 0.062;
    const yRim = (phi) => {
      const a = Math.abs(((phi + 540) % 360) - 180);
      if (a <= 36) return yBrow;
      if (a <= 82) return lerp(yBrow, ySide, ss(36, 80, a));
      return lerp(ySide, yBack, ss(82, 180, a));
    };
    const NU = 32, NV = 10;
    // per column: elevations from the pole down to the rim; the rim row solved so its y = yRim(phi)
    const el = [], R = [], raw = [];
    for (let k = 0; k < NV; k++) { el.push(new Float32Array(NU)); R.push(new Float32Array(NU)); raw.push(new Float32Array(NU)); }
    for (let j = 0; j < NU; j++) {
      const phi = j * 360 / NU;
      let er = -20;
      for (let it = 0; it < 4; it++) {
        const d = dirOf(phi, er);
        const r = (skinR(d) ?? 0.11) + 0.02;
        er = Math.asin(Math.max(-0.95, Math.min(0.95, (yRim(phi) - Hc[1]) / r))) / D2R;
      }
      for (let k = 0; k < NV; k++) {
        const e = lerp(90, er, Math.pow(k / (NV - 1), 0.9));
        el[k][j] = e;
        const r = skinR(dirOf(phi, e)) ?? 0.1;
        raw[k][j] = r + 0.018; R[k][j] = r + 0.022;
      }
    }
    // rigid shell: smooth hard (convex), never under skin + 1.8 cm
    for (let it = 0; it < 40; it++) {
      for (let k = 1; k < NV; k++) for (let j = 0; j < NU; j++) {
        const nb = [R[k][(j + NU - 1) % NU], R[k][(j + 1) % NU], R[k - 1][j], R[Math.min(NV - 1, k + 1)][j]];
        R[k][j] = Math.max(raw[k][j], lerp(R[k][j], (nb[0] + nb[1] + nb[2] + nb[3]) / 4, 0.5));
      }
      let m = 0; for (let j = 0; j < NU; j++) m += R[1][j]; R[0].fill(Math.max(raw[0][0], lerp(R[0][0], m / NU, 0.5)));
    }
    // the rim flares a little outwards (a lip), more at the back
    for (let j = 0; j < NU; j++) { const a = Math.abs(((j * 360 / NU + 540) % 360) - 180); R[NV - 1][j] += 0.004 + 0.006 * ss(60, 180, a); }
    const P = (k, j) => madd(Hc, dirOf(j * 360 / NU, el[k][j % NU]), R[k][j % NU]);
    helmet.Hc = Hc; helmet.P = P; helmet.NU = NU; helmet.NV = NV; helmet.R = R; helmet.el = el; helmet.yRim = yRim; helmet.dirOf = dirOf;
    helmet.covers = (p, margin = 0.004) => {
      // is p under the shell (inside its radius in a direction the shell covers)?
      const d = sub(p, Hc), r = len(d);
      const phi = ((Math.atan2(d[0], d[2]) / D2R) + 360) % 360, e = Math.asin(d[1] / r) / D2R;
      const jf = phi / (360 / NU), j0 = Math.floor(jf) % NU, j1 = (j0 + 1) % NU, tj = jf - Math.floor(jf);
      const er = lerp(el[NV - 1][j0], el[NV - 1][j1], tj);
      if (e < er + 1) return false;
      let k = 1; while (k < NV - 1 && lerp(el[k][j0], el[k][j1], tj) > e) k++;
      const Rk = lerp(R[k][j0], R[k][j1], tj);
      return r < Rk - margin;
    };
    // dome: pole + rings; azimuthal disk uvs
    hg.begin('dome', 0.42, 0.42, { kind: 'dome' });
    const pole = hg.v(add(Hc, [0, R[0][0], 0]), [0.5, 0.5]);
    const ids = [];
    for (let k = 1; k < NV; k++) { const row = []; for (let j = 0; j <= NU; j++) { const rr = 0.5 * k / (NV - 1) * 0.98, ph = j * 2 * Math.PI / NU; row.push(hg.v(P(k, j), [0.5 + rr * Math.sin(ph), 0.5 + rr * Math.cos(ph)])); } ids.push(row); }
    for (let j = 0; j < NU; j++) hg.tri(pole, ids[0][j], ids[0][j + 1]);
    gridQuads(hg, ids, { flip: true });
    // rolled rim + liner: rim -> bead (4 mm out, 6 mm down) -> under edge (1.5 cm in) -> padded liner (3 cm up inside)
    hg.begin('rim', 0.85, 0.06, { kind: 'helmetRim' });
    const ringAt = (fn, v) => { const row = []; for (let j = 0; j <= NU; j++) row.push(hg.v(fn(j % NU), [j / NU, v])); return row; };
    const rimP = (j) => P(NV - 1, j), dOut = (j) => norm([Math.sin(j * 2 * Math.PI / NU), 0, Math.cos(j * 2 * Math.PI / NU)]);
    const rr0 = ringAt((j) => rimP(j), 0);
    const rr1 = ringAt((j) => add(madd(rimP(j), dOut(j), 0.004), [0, -0.006, 0]), 0.25);
    const rr2 = ringAt((j) => add(madd(rimP(j), dOut(j), -0.014), [0, -0.007, 0]), 0.5);
    const rr3 = ringAt((j) => add(madd(rimP(j), dOut(j), -0.019), [0, 0.03, 0]), 1);
    gridQuads(hg, [rr0, rr1, rr2, rr3], { flip: true });
    helmet.rimY = (j) => rimP(j)[1];
    // pivot bosses at the temples (the visor's hinge axis)
    const yH = yEye + 0.024;
    const sideAt = (s) => { const d = [s, 0, 0]; const c = [0, yH, Hc[2] + 0.004]; const hit = makeBVH([{ pos: Float32Array.from(hg.P), tris: Int32Array.from(hg.F.flatMap((f) => [f.v[0], 0, f.v[1], 0, f.v[2], 0])) }]).first(madd(c, d, 0.4), scl(d, -1), 0.4); return hit ? hit.p : madd(c, d, 0.11); };
    const pivots = [1, -1].map((s) => sideAt(s));
    helmet.pivots = pivots;
    for (const [si, s] of [[0, 1], [1, -1]]) {
      const c = pivots[si], ax = [s, 0, 0], e1 = [0, 1, 0], e2 = [0, 0, 1];
      hg.begin(`boss${si}`, 0.13, 0.03, { kind: 'boss' });
      const ring = (o, r, v) => { const row = []; for (let k = 0; k <= 10; k++) { const a = k / 10 * Math.PI * 2; row.push(hg.v(add(madd(c, ax, o), add(scl(e1, Math.cos(a) * r), scl(e2, Math.sin(a) * r))), [k / 10, v])); } return row; };
      const r0 = ring(-0.004, 0.021, 0), r1 = ring(0.009, 0.019, 0.4), r2 = ring(0.013, 0.014, 0.7);
      gridQuads(hg, [r0, r1, r2], { flip: s < 0 });
      const cap = hg.v(madd(c, ax, 0.0145), [0.5, 1]);
      for (let k = 0; k < 10; k++) { if (s > 0) hg.tri(r2[k], r2[k + 1], cap); else hg.tri(r2[k], cap, r2[k + 1]); }
    }
    // neck curtain: a SHORT (8 cm) padded flap from inside the back rim that drapes in onto the back of the neck /
    // collar (its lower rows ride neck_01 / spine_03, so it bends with the neck instead of standing out as a fin when
    // the head pitches forward); it stays behind the ears (128..232 deg), never beside the cheeks
    {
      const occN = makeBVH([surf(fullBody), surf(uni), surf(vestPart)]);
      const cols = [];
      for (let a = 128; a <= 232.1; a += 13) cols.push(a);
      const rows = [0, 0.027, 0.054, 0.08];
      hg.begin('curtain', 0.32, 0.14, { kind: 'curtain' });
      const grid = rows.map((dy, r) => cols.map((a, c) => {
        const j = a / (360 / NU);
        const j0 = Math.floor(j) % NU, j1 = (j0 + 1) % NU, t = j - Math.floor(j);
        const rim = lerp3(rimP(j0), rimP(j1), t);
        const d = norm([Math.sin(a * D2R), 0, Math.cos(a * D2R)]);
        const y = rim[1] + 0.012 - dy;
        const rimR = Math.hypot(rim[0] - Hc[0], rim[2] - Hc[2]);
        // tucked inside the rim at the top, then drawn in onto the neck / collar (+8 mm) as it hangs
        const hs = occN.hits(madd([Hc[0], y, Hc[2]], d, 0.35), scl(d, -1), 0.35);
        const surfR = hs.length ? 0.35 - hs[0].d : 0.06;
        const rr = Math.max(surfR + 0.008, r === 0 ? rimR - 0.012 : lerp(rimR - 0.012, surfR + 0.008, ss(0, 0.08, dy)));
        return hg.v([Hc[0] + d[0] * rr, y, Hc[2] + d[2] * rr], [c / (cols.length - 1), r / (rows.length - 1)]);
      }));
      gridQuads(hg, grid, { flip: true });
      helmet.curtain = { cols, rows, grid };
    }
    // ---- visor: in pivot-axis polar coordinates (psi = angle about the X axis through the pivots, rho = distance from
    // that axis) the sheet is rho(x, psi) = rhoC(psi) * f(x): a centre profile that follows the face ~2.6 cm off it
    // (convex in the side view: brow -> in front of the nose -> under the chin) times a superellipse fall-off that
    // brings the sides in to the pivots, like a moulded riot visor
    const Hv = [0, yH, (pivots[0][2] + pivots[1][2]) / 2];
    const axV = Math.max(Math.abs(pivots[0][0]), Math.abs(pivots[1][0])) + 0.006;
    const rhoOf = (p) => Math.hypot(p[1] - Hv[1], p[2] - Hv[2]);
    const fX = (x) => Math.max(0.05, 1 - Math.min(1, Math.abs(x) / axV) ** 3) ** (1 / 3);
    const psiOf = (p) => Math.atan2(p[1] - Hv[1], p[2] - Hv[2]) / D2R;
    const psiTop = psiOf(P(NV - 1, 0)) + 13;
    // chin: the most forward point under the mouth, then the lowest point within 3 cm behind it (not the throat)
    let tip = null, chinP = null;
    const faceV = [...h.baseObj.groupVerts('body')].filter((v) => headW(v) > 0.5).map((v) => [h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]]);
    for (const p of faceV) if (Math.abs(p[0]) < 0.015 && p[1] < A.mouth[1] - 0.02 && p[1] > A.mouth[1] - 0.09 && (!tip || p[2] > tip[2])) tip = p;
    for (const p of faceV) if (tip && Math.abs(p[0]) < 0.02 && p[2] > tip[2] - 0.03 && p[1] < tip[1] && (!chinP || p[1] < chinP[1])) chinP = p;
    console.log(`${TAG} chin tip ${tip?.map((x) => x.toFixed(3))} bottom ${chinP?.map((x) => x.toFixed(3))} mouth ${A.mouth.map((x) => x.toFixed(3))}`);
    const psiBot = (chinP ? psiOf(chinP) : -55) - 7;
    const NXv = 14, NPv = 9;
    // centre profile: per psi bin the max over the face of (rho + clearance) / f(x), then a convex envelope + smoothing
    const NB = 36;
    const rc = new Float32Array(NB + 1).fill(0.06);
    const bin = (ps) => (ps - psiBot) / (psiTop - psiBot) * NB;
    const need = (p, clr) => {
      if (p[2] < Hv[2] - 0.005 || Math.abs(p[0]) > axV * 0.88) return;
      const b = bin(psiOf(p));
      if (b < -3 || b > NB + 3) return;
      const r = (rhoOf(p) + clr) / fX(p[0]);
      for (let k = Math.floor(b) - 1; k <= Math.ceil(b) + 1; k++) if (k >= 0 && k <= NB) rc[k] = Math.max(rc[k], r);
    };
    for (const p of faceV) need(p, p[1] < A.mouth[1] + 0.03 ? 0.03 : 0.026);
    for (let j = 0; j < NU; j++) for (let k = NV - 3; k < NV; k++) need(P(k, j), 0.006);
    for (const pv of pivots) need(add(pv, [0, 0, 0]), 0.004);
    const dPsi = (psiTop - psiBot) / NB * D2R;
    for (let it = 0; it < 30; it++) {
      for (let k = 1; k < NB; k++) rc[k] = Math.max(rc[k], 2 * rc[k - 1] * rc[k + 1] * Math.cos(dPsi) / (rc[k - 1] + rc[k + 1]));
      const r0 = Float32Array.from(rc);
      for (let k = 1; k < NB; k++) rc[k] = Math.max(r0[k], (r0[k - 1] + 2 * r0[k] + r0[k + 1]) / 4);
    }
    const rhoC = (psi) => { const b = Math.max(0, Math.min(NB, bin(psi))), k0 = Math.min(NB - 1, Math.floor(b)); return lerp(rc[k0], rc[k0 + 1], b - k0); };
    const rho0 = Math.max(...rc);
    const vgv = new Geo();
    vgv.begin('visor', 1, 1);
    const vIds = [];
    const visorPt = (x, psi) => { const rho = rhoC(psi) * fX(x); return [x, Hv[1] + rho * Math.sin(psi * D2R), Hv[2] + rho * Math.cos(psi * D2R)]; };
    for (let r = 0; r <= NPv; r++) {
      const psi = lerp(psiBot, psiTop, r / NPv);
      const row = [];
      for (let c = 0; c <= NXv; c++) {
        const s = c / NXv * 2 - 1;
        const x = Math.sign(s) * Math.abs(s) ** 0.85 * axV * 0.965;
        row.push(vgv.v(visorPt(x, psi), [c / NXv, r / NPv], [['head', 1]]));
      }
      vIds.push(row);
    }
    gridQuads(vgv, vIds);
    helmet.visor = { Hv, axV, rho0, psiTop, psiBot, visorPt, NXv, NPv };
    console.log(`${TAG} visor: pivot axis y ${Hv[1].toFixed(3)} z ${Hv[2].toFixed(3)}, half width ${axV.toFixed(3)}, rho0 ${rho0.toFixed(3)}, psi ${psiBot.toFixed(1)}..${psiTop.toFixed(1)} deg`);
    helmet.visorGeo = vgv;
    // rubber gasket along the visor's top edge (opaque, helmet part)
    hg.begin('gasket', 0.32, 0.03, { kind: 'gasket' });
    const gIds = [[], [], []];
    for (let c = 0; c <= NXv; c++) {
      const s = c / NXv * 2 - 1, x = Math.sign(s) * Math.abs(s) ** 0.85 * axV * 0.965;
      const a = visorPt(x, psiTop + 1.5), b = visorPt(x, psiTop - 3.5);
      const n = norm(sub(a, [x, Hv[1], Hv[2]]));
      gIds[0].push(hg.v(madd(a, n, -0.003), [c / NXv, 0]));
      gIds[1].push(hg.v(madd(lerp3(a, b, 0.5), n, 0.004), [c / NXv, 0.5]));
      gIds[2].push(hg.v(madd(b, n, 0.0005), [c / NXv, 1]));
    }
    gridQuads(hg, gIds, { flip: true });
  }
  hg.pack();
  const helmetPart = weldNormals(toPart(lib, h, hg, 'helmet', 'gear', (p, i) => {
    const pc = hg.pieces[hg.pv[i]];
    if (pc.name === 'curtain') {
      const c = helmet.curtain, t = clamp01((helmet.curtain.grid[0][0] !== undefined ? (hg.UV[i * 2 + 1] - pc.rect[1]) / pc.rect[3] : 0));
      return [['head', 1 - 0.78 * t], ['neck_01', 0.46 * t], ['spine_03', 0.32 * t]];
    }
    return [['head', 1]];
  }), 5e3);
  const visorPart = toPart(lib, h, helmet.visorGeo.pack(0.004), 'visor', 'gear', () => [['head', 1]]);
  console.log(`${TAG} helmet: ${hg.F.length} tris; visor ${helmet.visorGeo.F.length} tris`);

  // ---------------------------------------------------------------- body: hide under the helmet / clothes, cavity
  {
    let n = 0;
    body.obj.faces.forEach((f, fi) => { if (body.keep[fi] && f.v.every((v) => helmet.covers([h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]], 0.006))) { body.keep[fi] = 0; n++; } });
    const hc = h.hideCovered(body, (p) => cloth.holeAt(p, 0.05) || bigTear(p) > 1.1);
    console.log(`${TAG} body faces hidden: ${n} under the helmet, ${hc} under the clothes`);
  }
  // skin kept under the rips (base vertices under the clothes whose faces survived): its own simplification region
  // (in the coarse 'rest' pass the island edge turned into straight-edged skin patches inside the holes), and the
  // part of it still under opaque cloth sunk 5 mm so the coarse surface cannot poke through the tight trousers
  const tearV = new Set();
  {
    const nb = body.normals();
    body.obj.faces.forEach((f, fi) => { if (body.keep[fi]) for (const v of f.v) if (h.hidden.has(v)) tearV.add(v); });
    let sunk = 0;
    for (const v of tearV) {
      const p = [h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]];
      if (cloth.holeAt(p, -0.01) || bigTear(p) > 1.1) continue;
      for (let k = 0; k < 3; k++) h.pos[v * 3 + k] -= nb[v * 3 + k] * 0.005;
      sunk++;
    }
    console.log(`${TAG} skin under the rips: ${tearV.size} vertices, ${sunk} sunk under the cloth`);
  }
  // (no mouth cavity needed: the hm08 base mesh body is watertight, its mouth bag is modelled)
  // per-region triangle budgets: the face keeps its features, the rest (neck, hands, the bare forearm) is cheap
  const boneW = (re) => { const ids = new Set(h.skeleton.bones.filter((b) => re.test(b.name)).map((b) => b.index)); return (v) => h.weights[v].reduce((a, [b, w]) => a + (ids.has(b) ? w : 0), 0); };
  const headWt = boneW(/^(head|neck_01)$/), handWt = boneW(/^(hand|thumb|index|middle|ring|pinky)/);
  const bodyLow = await simplifyRegions(lib, body, [
    { name: 'head', test: (v) => headWt(v) > 0.5, tris: 1420, attrW: [1.2, 1.2, 1.2, 1, 1] },
    { name: 'hands', test: (v) => handWt(v) > 0.5, tris: 450 },
    { name: 'tears', test: (v) => tearV.has(v), tris: 110 },
    { name: 'rest', test: () => true, tris: 430 },
  ]);
  // the uniform: simplified here with its open boundaries LOCKED (cuffs, collar, hems and the edges of the torn-away
  // faces): the exporter's unlocked pass collapsed the torn edges into straight cuts that opened the rips far wider
  // than their frayed alpha outline (blocky skin patches on the thigh)
  const uniBorder = new Set(boundaryLoops(uni).flat());
  const uniLow = await simplifyRegions(lib, uni, [{ name: 'cloth', test: (v) => !uniBorder.has(v), tris: 1300, attrW: [0.6, 0.6, 0.6, 1, 1] }]);

  // ================================================================ TEXTURES
  const parts = [bodyLow, uniLow, boots, eyes, teeth, vestPart, guardPart, helmetPart, visorPart];
  if (FAST) {
    const flat = (rgb, ro = 0.8) => ({ color: [...lin(rgb), 1], roughness: ro, metalness: 0 });
    bodyLow.material = lib.material('skin', flat([150, 146, 132], 0.6));
    uniLow.material = lib.material('cloth', { ...cloth, doubleSided: true, alpha: cloth.alpha, pngBits: 6 });
    boots.material = lib.material('cloth', flat([62, 60, 58], 0.6));
    eyes.material = lib.material('eye', flat([220, 210, 150], 0.2));
    teeth.material = lib.material('teeth', flat([190, 170, 130], 0.4));
    vestPart.material = lib.material('gear', flat([106, 108, 100], 0.7));
    guardPart.material = lib.material('gear', { ...flat([92, 99, 112], 0.45), doubleSided: true });
    helmetPart.material = lib.material('gear', { ...flat([60, 72, 104], 0.35), doubleSided: true });
    visorPart.material = lib.material('gear', { ...flat([60, 70, 80], 0.05), alphaMode: 'BLEND' });
    visorPart.material.color[3] = 0.3;
  } else {
    await paintAll();
  }
  async function paintAll() {
    const T0 = Date.now();
    const lapse = (what) => console.log(`${TAG} painted ${what} (${((Date.now() - T0) / 1000).toFixed(1)} s, rss ${(process.memoryUsage().rss / 1048576).toFixed(0)} MB)`);
    const fb = (P, f, o = 3, off = 0) => N.fbm(P[0] * f + off, P[1] * f, P[2] * f - off, o);
    const Hc = helmet.Hc;
    const facePt = (phi, el) => {
      const d = [Math.sin(phi * D2R) * Math.cos(el * D2R), Math.sin(el * D2R), Math.cos(phi * D2R) * Math.cos(el * D2R)];
      const hit = bodyB.first(madd(Hc, d, 0.4), scl(d, -1), 0.4);
      return hit ? hit.p : madd(Hc, d, 0.1);
    };
    /** thin laceration / line feature: {ac distance across, t along, L, end fade} or null */
    const lineAt = (P, a, b, reach = 0.02) => {
      const d = sub(b, a), L = len(d), dir = scl(d, 1 / L), t = dot(sub(P, a), dir);
      if (t < -reach || t > L + reach) return null;
      const off = len(sub(P, madd(a, dir, Math.max(0, Math.min(L, t)))));
      if (off > reach) return null;
      return { ac: off, t, L, fade: ss(-0.006, 0.004, t) * ss(L + 0.006, L - 0.004, t) };
    };
    // hand frames: the back of each hand (against the fingers' curl), checked against "outwards" in the A pose
    const dorsal = {};
    for (const s of ['l', 'r']) {
      const palm = new THREE.Vector3(0, 0, 1).applyQuaternion(sk[`middle_01_${s}`].world);
      let d = norm([-palm.x, -palm.y, -palm.z]);
      if (dot(d, [s === 'l' ? 1 : -1, 0, 0]) < -0.2) d = scl(d, -1);
      dorsal[s] = d;
    }
    console.log(`${TAG} dorsal L ${dorsal.l.map((x) => x.toFixed(2))} R ${dorsal.r.map((x) => x.toFixed(2))}`);

    // ============================================================== SKIN
    // The middle-aged male skin (pores, stubble shadow, creases, lips) as a luminance ratio over an ashen grey with
    // a faint green-blue cast; decay is layered on top as local detail (target body ~sRGB 110-130, face ~115).
    const skinSrc = await lib.texture('system', 'skins/middleage_caucasian_male/middleage_lightskinned_male_diffuse.png', 2048);
    let mL = 0;
    {
      const R = 512, bp = h.basePart({ name: 'mask' }), r = rasterUV(bp.tris(), h.baseObj.uvs, R, 0), k = skinSrc.width / R;
      let n = 0;
      for (let i = 0; i < R * R; i++) if (r.covered[i]) { const x = Math.floor((i % R) * k), y = Math.floor(((i / R) | 0) * k), d = (y * skinSrc.width + x) * 4; mL += lum([S2L[skinSrc.data[d]], S2L[skinSrc.data[d + 1]], S2L[skinSrc.data[d + 2]]]); n++; }
      mL /= Math.max(1, n);
    }
    const PAL = lin([152, 154, 144]);
    const skinBase = grade(lib.cloneImage(skinSrc), (c) => {
      const k = Math.min(1.5, (lum(c) / mL) ** 0.85), s = lum(PAL) / mL;
      for (let i = 0; i < 3; i++) c[i] = lerp(PAL[i] * k, c[i] * s, 0.12);
    });
    TR.snap('skin: graded source', skinBase, bodyLow);
    const WL = B('hand_l'), axL = norm(sub(WL, B('lowerarm_l')));
    const knuck = { l: ['index', 'pinky'].map((f) => B(`${f}_01_l`)), r: ['index', 'pinky'].map((f) => B(`${f}_01_r`)) };
    const tips = { l: [], r: [] };
    for (const s of ['l', 'r']) for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky']) { const b = sk[`${f}_03_${s}`]; tips[s].push([lerp3(V(b.head), V(b.tail), 0.35), V(b.tail)]); }
    // shard cuts on the left cheek and jaw (where the visor broke out), one across the right brow
    const cuts = [[facePt(26, -16), facePt(50, -30)], [facePt(32, -34), facePt(48, -50)], [facePt(16, -42), facePt(28, -58)], [facePt(-30, 22), facePt(-12, 26)]];
    const thighWound = lib.surfacePoint(h, 'thigh_l', 0.52, [0.35, 0, 1]);
    const faceFwd = zEye - 0.03;
    const skinExtra = (P, Nn, c, st) => {
      // corpse marbling: grey-green and dusky violet blotches, a fine lace of darker capillaries
      const g = fb(P, 4, 3, 3);
      mul(c, [0.9, 0.98, 0.84], ss(0.15, 0.6, g) * 0.45);
      mul(c, [0.97, 0.88, 1.0], ss(0.2, 0.7, -g) * 0.4);
      const lace = N.worley(P[0] * 22, P[1] * 22, P[2] * 22);
      mul(c, [0.88, 0.8, 0.88], (1 - ss(0.04, 0.15, Math.abs(lace - 0.5))) * ss(0.1, 0.6, fb(P, 7, 2, 1) + 0.2) * 0.4);
      // grey-green rot patches and brown-violet spots
      over(c, lin([118, 124, 100]), ss(0.3, 0.7, fb(P, 3.3, 4, 21)) * 0.35);
      over(c, lin([104, 80, 84]), (1 - ss(0.05, 0.16, N.worley(P[0] * 16 + 3, P[1] * 16, P[2] * 16))) * ss(0.1, 0.5, N.noise(P[0] * 5, P[1] * 5, P[2] * 5) + 0.2) * 0.4);
      // pores / fine creases + oily and dry patches
      const pore = (1 - ss(0.1, 0.24, N.worley(P[0] * 420, P[1] * 420, P[2] * 420))) * (0.45 + 0.55 * ss(-0.2, 0.4, N.noise(P[0] * 40, P[1] * 40, P[2] * 40)));
      st.h -= pore * 0.25; mul(c, [0.92, 0.9, 0.9], pore * 0.2);
      st.ro = lerp(st.ro, 0.4, ss(-0.1, 0.5, fb(P, 6, 3, 11)) * 0.5);
      st.ro = lerp(st.ro, 0.78, ss(0.1, 0.6, -fb(P, 9, 3, 3)) * 0.55);
      // necrotic veins spreading from the two bites (dark violet, raised)
      for (const [W, rr] of [[neckBite.p, 0.15], [armBite.p, 0.13], [thighWound.p, 0.08]]) {
        const d = dist(P, W);
        if (d > rr) continue;
        const v = Math.max(N.ridged(P[0] * 34, P[1] * 34, P[2] * 34, 3), N.ridged(P[0] * 12 + 4, P[1] * 12, P[2] * 12, 2) * 0.95);
        const vv = ss(0.55, 0.85, v) * (1 - ss(0.02, rr, d));
        over(c, lin([58, 44, 66]), vv * 0.75); st.h += vv * 1.0;
        mul(c, [0.86, 0.8, 0.9], (1 - ss(0.02, rr * 0.8, d)) * 0.5);
      }
      const front = P[2] > faceFwd && Nn[2] > 0.15;
      const fx = Math.abs(P[0]), fy = P[1] - yEye;
      // the face: reddened lid rims, a dark crease under the eyes, eyebrows (sparse, dark), stubble on the jaw / lip
      if (P[1] > yNeck - 0.02 && P[2] > zEye - 0.12) {
        const de = Math.min(dist(P, A.eyeL), dist(P, A.eyeR));
        mul(c, [1.08, 0.72, 0.74], (1 - ss(0.013, 0.02, de)) * ss(0.009, 0.013, de) * 0.7);
        if (front) {
          const browY = 0.021 + 0.007 * Math.sin(Math.PI * clamp01((fx - 0.012) / 0.05));
          const th = 0.0065 * (1 - ss(0.04, 0.064, fx));
          const bw = (1 - ss(th * 0.5, th, Math.abs(fy - browY))) * ss(0.008, 0.014, fx) * (1 - ss(0.058, 0.066, fx));
          const hair = ss(-0.2, 0.5, N.noise(P[0] * 900, P[1] * 260, P[2] * 400));
          over(c, lin([66, 58, 52]), bw * (0.3 + 0.45 * hair));
          st.h += bw * hair * 0.3;
          const stub = (fy < -0.045 && fy > -0.15 && fx < 0.068 ? 1 : 0) * ss(-0.15, -0.115, -fy - 0.0) * (1 - ss(0.016, 0.026, dist(P, A.mouth)));
          if (stub > 0) {
            const dots = 1 - ss(0.12, 0.3, N.worley(P[0] * 1100, P[1] * 1100, P[2] * 1100));
            mul(c, [0.8, 0.8, 0.83], stub * 0.45); over(c, lin([62, 60, 60]), stub * dots * 0.35);
          }
        }
      }
      for (const [a, b] of cuts) {
        const q = lineAt(P, a, b, 0.012);
        if (!q) continue;
        const ac = q.ac + N.noise(q.t * 70, 0.3, 1.1) * 0.0012;
        const core = (1 - ss(0.0008, 0.002, ac)) * q.fade, rim = (1 - ss(0.002, 0.008, ac)) * q.fade;
        over(c, lin([136, 74, 80]), rim * 0.55); over(c, lin([70, 10, 12]), core * 0.95);
        st.h -= core * 0.9; st.h += (rim - core) * 0.25; st.ro = lerp(st.ro, 0.3, rim);
        st.bl = Math.max(st.bl, rim * 0.6);
      }
      // blood run from the cuts and the mouth down the jaw and neck (left side, the head lolls that way)
      if (P[2] > zEye - 0.09 && P[1] < yEye - 0.05 && P[1] > yNeck - 0.12) {
        const run = ss(0.45, 0.72, N.noise(P[0] * 120, P[1] * 7, P[2] * 120)) * ss(-0.01, 0.03, P[0] + 0.01) * (1 - ss(0.05, 0.09, Math.abs(P[0] - 0.035)));
        st.bl = Math.max(st.bl, run * 0.85);
      }
      // left hand: a black tactical glove (hard knuckle guard, suede palm, worn fingertips, cuff at the wrist)
      if (P[0] > 0.05 && dist(P, WL) < 0.3) {
        const gw = dot(sub(P, WL), axL) + N.noise(P[0] * 90, P[1] * 90, P[2] * 90) * 0.003;
        const glove = ss(-0.04, -0.034, gw);
        if (glove > 0) {
          const dors = dot(Nn, dorsal.l);
          let col = mix3(lin([62, 60, 58]), lin([48, 48, 50]), ss(-0.3, 0.2, dors));
          let ro = lerp(0.82, 0.55, ss(-0.3, 0.2, dors)), hh = N.fbm(P[0] * 300, P[1] * 300, P[2] * 300, 2) * 0.15;
          const cuff = 1 - ss(-0.03, -0.022, gw);
          col = mix3(col, lin([42, 42, 44]), cuff); hh += cuff * 0.6 - (1 - ss(0.0005, 0.0015, Math.abs(gw + 0.022))) * 0.6;
          const kq = lineAt(P, knuck.l[0], knuck.l[1], 0.02);
          if (kq && dors > 0.1) { const k = (1 - ss(0.009, 0.013, kq.ac)) * kq.fade; col = mix3(col, lin([38, 38, 40]), k); ro = lerp(ro, 0.4, k); hh += k * 1.3; }
          for (const [a, b] of tips.l) { const tq = lineAt(P, a, b, 0.012); if (tq) col = mix3(col, lin([84, 80, 76]), (1 - ss(0.006, 0.011, tq.ac)) * 0.6); }
          over(c, col, glove); st.ro = lerp(st.ro, ro + N.fbm(P[0] * 60, P[1] * 60, P[2] * 60, 2) * 0.08, glove); st.h = lerp(st.h, hh, glove);
        }
      }
      // the sleeve torn off above the right elbow: the ragged hem chafed the skin raw - a red abrasion band with
      // scratches along the arm and dried blood just below the edge, a grime line where the fabric rubbed - so the
      // exposed arm reads as a wound under torn cloth, not as a skin-coloured patch
      if (P[0] < 0) {
        const a = lowR(P);
        if (a.d < 0.11) {
          const edgeS = a.t * a.L + N.fbm(P[0] * 18, P[1] * 18, P[2] * 18, 3) * 0.035;   // bigTear's sleeve coordinate
          const below = edgeS + 0.112;                                                    // > 0: the exposed side
          if (below > -0.02 && below < 0.08) {
            const band = ss(-0.012, 0.0, below) * (1 - ss(0.025, 0.07, below + N.noise(P[0] * 60, P[1] * 60, P[2] * 60) * 0.012));
            const raw = band * ss(-0.3, 0.4, fb(P, 45, 3, 9) + 0.15);
            over(c, mix3(lin([156, 78, 70]), lin([112, 40, 38]), ss(0.3, 0.8, fb(P, 90, 2, 4))), raw * 0.75);
            st.ro = lerp(st.ro, 0.38, raw); st.h -= raw * 0.25;
            const scr = ss(0.86, 0.97, N.ridged(P[0] * 260, P[1] * 40, P[2] * 260, 2)) * band;
            over(c, lin([92, 18, 18]), scr * 0.8); st.h -= scr * 0.4;
            const grime = (1 - ss(0.0, 0.008, Math.abs(below - 0.002))) * 0.5;
            over(c, lin([84, 74, 62]), grime);
            st.bl = Math.max(st.bl, band * ss(0.2, 0.6, N.noise(P[0] * 30, P[1] * 90, P[2] * 30) + 0.2) * 0.6);
          }
        }
      }
      // right hand (bare): broken, dirty nails
      if (P[0] < -0.05) for (const [a, b] of tips.r) {
        const tq = lineAt(P, a, b, 0.012);
        if (!tq || dot(Nn, dorsal.r) < 0.25) continue;
        const k = (1 - ss(0.0055, 0.0075, tq.ac)) * ss(0.0, 0.003, tq.t);
        over(c, mix3(lin([96, 86, 70]), lin([46, 34, 28]), ss(0.4, 0.9, tq.t / tq.L)), k * 0.9); st.ro = lerp(st.ro, 0.35, k); st.h += k * 0.4;
      }
      {
        const dR = dist(P, A.handR), dL = dist(P, A.handL);
        if (dR < 0.24) st.bl = Math.max(st.bl, (1 - ss(0.08, 0.24, dR)) * ss(-0.25, 0.3, fb(P, 22, 4, 6) + 0.1) * 0.9);
        if (dL < 0.2) st.bl = Math.max(st.bl, (1 - ss(0.06, 0.2, dL)) * (1 - ss(0.05, 0.11, N.worley(P[0] * 60, P[1] * 60, P[2] * 60))) * 0.7);
      }
    };
    const skin = lib.paintSkin(h, {
      seed: 51, base: skinBase, size: 2048, normalSize: 1024, ormSize: 1024,
      pallor: 0, mottle: 0.55, veins: 0.4, bruises: 0.22, socket: 1, lips: 0.85, grime: 0.2,
      coveredDarken: 0.14, coveredShade: 0.1, normalStrength: 2.3, bumpStrength: 2.4, roughness: 0.6,
      blood: { mouth: 1, hands: 0, splatter: 0.08 },
      wounds: [
        { bone: 'neck_01', t: 0.55, dir: [0.85, 0.1, 0.5], r: 0.032, kind: 'bite', depth: 1.9 },
        { bone: 'lowerarm_r', t: 0.62, dir: [-0.2, -0.3, 1], r: 0.028, kind: 'bite', depth: 1.8 },
        { bone: 'thigh_l', t: 0.52, dir: [0.35, 0, 1], r: 0.022, kind: 'gash', depth: 1.4 },
      ],
      extra: skinExtra,
    });
    TR.snap('skin: painted', skin.albedo, bodyLow);
    lapse('skin');

    // ============================================================== BOOTS: black leather, nylon shaft, lug sole, laces
    const bootTex = paintPart(boots, { size: 1024, normalSize: 1024, ormSize: 256, rough: 0.7, normalStrength: 2.2 }, (P, Nn, st) => {
      const W = bootInfo[P[0] >= 0 ? 0 : 1];
      const [f, sv] = W.toF(P);
      const y = P[1] - y0;
      const hn = norm([Nn[0], 0, Nn[2]]), fwd = dot(hn, [W.fw[0], 0, W.fw[2]]);
      const leather = lin([64, 61, 58]), nylon = lin([76, 76, 73]);
      const shaft = ss(0.088, 0.096, y);
      set3(st.c, mix3(leather, nylon, shaft * 0.85));
      st.ro = lerp(0.55, 0.82, shaft);
      st.h = N.fbm(P[0] * 260, P[1] * 260, P[2] * 260, 2) * (0.12 + 0.2 * shaft);
      // leather creases over the instep / ankle flex
      const crease = ss(0.6, 0.85, N.ridged(f * 90, y * 12, sv * 90, 2)) * (1 - shaft) * ss(0.04, 0.07, y);
      st.h -= crease * 0.5; mul(st.c, [0.82, 0.82, 0.82], crease * 0.5);
      // stitched seam between the leather foot and the nylon shaft, and up the heel
      const seam = (1 - ss(0.0008, 0.002, Math.abs(y - 0.092))) + (1 - ss(0.0008, 0.002, Math.abs(f - W.back0 - 0.001))) * ss(0.03, 0.06, y);
      over(st.c, lin([84, 82, 78]), seam * 0.5); st.h -= seam * 0.3;
      // toe cap: smoother, scuffed to grey-brown
      if (f > W.front0 - 0.075 && y < 0.09) {
        const k = ss(W.front0 - 0.075, W.front0 - 0.055, f);
        st.ro = lerp(st.ro, 0.42, k);
        over(st.c, lin([92, 90, 88]), k * ss(0.2, 0.7, fb(P, 40, 3, 7)) * 0.55);
      }
      // laces + eyelets up the front of the shaft
      if (fwd > 0.55 && y > 0.075 && P[1] < W.yTop - 0.012) {
        const s2 = (sv - W.sc) / 0.019, yy = (y - 0.075) / 0.021;
        if (Math.abs(s2) < 1.25) {
          const fr = yy - Math.floor(yy);
          const lace = Math.max(1 - ss(0.07, 0.13, Math.abs(fr - (0.5 + s2 * 0.45))), 1 - ss(0.07, 0.13, Math.abs(fr - (0.5 - s2 * 0.45)))) * (1 - ss(0.95, 1.1, Math.abs(s2)));
          over(st.c, lin([40, 40, 40]), 0.5 * (1 - ss(0.9, 1.2, Math.abs(s2))));          // tongue gap shadow
          over(st.c, lin([64, 62, 58]), lace); st.h += lace * 0.9; st.ro = lerp(st.ro, 0.8, lace);
          const ey = 1 - ss(0.12, 0.2, Math.hypot(Math.abs(s2) - 1.05, (fr - 0.5) * 2.2));
          over(st.c, lin([120, 118, 112]), ey * 0.8); st.me = Math.max(st.me, ey * 0.7); st.ro = lerp(st.ro, 0.35, ey); st.h += ey * 0.5;
        }
      }
      // padded collar
      if (P[1] > W.yTop - 0.004) { set3(st.c, lin([44, 44, 46])); st.ro = 0.75; st.h += 0.2; }
      // 3 cm sole slab: a black lug outsole (deep tread blocks round the edge and on the tread face, the heel
      // block stepped up under the arch) under a pale grey midsole stripe with a welt stitch along its top
      if (y < 0.031) {
        const mid = ss(0.0185, 0.0205, y - W.arch(f) * 0.35);
        set3(st.c, mix3(lin([40, 39, 38]), lin([98, 96, 92]), mid)); st.ro = lerp(0.88, 0.7, mid);
        const tread = Math.abs(Math.sin(f * 230 + Math.abs(sv - W.sc) * 80));
        const lug = ss(0.25, 0.45, tread);
        st.h = (1 - mid) * (lug * 1.2 - 0.35) + mid * 0.3 - (1 - ss(0.0005, 0.0015, Math.abs(y - 0.0195))) * 0.4;
        over(st.c, lin([118, 112, 100]), (1 - mid) * (1 - lug) * 0.3);                       // dust packed in the grooves
        const stitch = (1 - ss(0.0006, 0.0015, Math.abs(y - 0.0275))) * ss(0.3, 0.6, Math.sin((f + sv) * 900) * 0.5 + 0.5);
        over(st.c, lin([150, 146, 136]), stitch * 0.6); st.h += stitch * 0.3;
        over(st.c, lin([112, 108, 100]), (1 - ss(0.0, 0.003, y - W.arch(f))) * 0.45);         // worn tread edge
      }
      // dust and mud, worst low and at the toe; dried blood flecks
      const low = 1 - ss(0.01, 0.12, y);
      const mud = clamp01(ss(0.0, 0.6, fb(P, 18, 4, 5)) * (low * 0.9 + 0.1));
      over(st.c, lin([104, 98, 88]), mud * 0.4); st.ro = lerp(st.ro, 0.92, mud);
      over(st.c, lin([110, 104, 92]), ss(0.2, 0.7, fb(P, 60, 2, 2)) * 0.18);
      const fl = (1 - ss(0.06, 0.12, N.worley(P[0] * 70, P[1] * 70, P[2] * 70))) * ss(0.3, 0.7, fb(P, 4, 2, 8) + 0.3);
      over(st.c, lin([50, 10, 9]), fl * 0.7);
    });
    lapse('boots');

    // ============================================================== VEST (gear): cordura, MOLLE, plate, POLICE, pouches
    const piece = (g, vtx) => g.pieces[g.pv[vtx]];
    const loc = (pc, u, v) => [clamp01((u - pc.rect[0]) / pc.rect[2]), clamp01((v - pc.rect[1]) / pc.rect[3])];
    // wolf-grey Cordura (sRGB ~115-120; measured in the test arena: on the shadow side the tone curve crushes a flat
    // linear 0.1 (sRGB ~90) to ~9 and a 0.18 (~118) only to ~18, so the plate itself is ~140 to stay >= 20) and
    // mid-grey hard polymer plates; retro-reflective POLICE placards (pale + a faint emissive) catch light in shadow
    const CORD = lin([116, 118, 109]);
    const cordura = (P, st, base = CORD) => {
      set3(st.c, base);
      const n = N.fbm(P[0] * 500, P[1] * 500, P[2] * 500, 2);
      st.h = n * 0.12 + Math.sin(P[1] * 2600) * 0.03; st.ro = 0.84 + n * 0.04;
      mul(st.c, [1.08, 1.08, 1.06], ss(0.3, 0.8, fb(P, 9, 3, 2)) * 0.3);          // sun-faded patches
      over(st.c, lin([128, 122, 108]), ss(0.35, 0.8, fb(P, 22, 3, 6)) * 0.2);      // dust in the weave
    };
    /** scuffed hard polymer: pale matte scuffs, thin bright scratches, a few chips; grey-beige dust (never rust) */
    const hardSurface = (P, st, base, k = 1) => {
      set3(st.c, base); st.ro = 0.4 + N.fbm(P[0] * 30, P[1] * 30, P[2] * 30, 2) * 0.05; st.me = 0;
      st.h = N.fbm(P[0] * 200, P[1] * 200, P[2] * 200, 2) * 0.05;
      const sc = ss(0.25, 0.75, fb(P, 10, 3, 4));
      over(st.c, mix3(base, lin([170, 170, 166]), 0.35), sc * 0.35 * k); st.ro = lerp(st.ro, 0.72, sc * k);
      const a = N.ridged(P[0] * 60 + 3, P[1] * 8, P[2] * 60, 2), b = N.ridged(P[0] * 9, P[1] * 70 + 5, P[2] * 9, 2), c2 = N.ridged(P[0] * 40, P[1] * 40, P[2] * 40 + 7, 2);
      const m = ss(0.0, 0.5, fb(P, 5, 2, 11) + 0.25);
      const scr = Math.max(ss(0.9, 0.98, a), ss(0.9, 0.98, b) * 0.8, ss(0.92, 0.99, c2) * 0.7) * m * k;
      over(st.c, lin([184, 184, 182]), scr * 0.7); st.ro = lerp(st.ro, 0.6, scr); st.h -= scr * 0.35;
      const chip = (1 - ss(0.05, 0.1, N.worley(P[0] * 35, P[1] * 35, P[2] * 35))) * ss(0.3, 0.7, fb(P, 6, 2, 3) + 0.2) * k;
      over(st.c, lin([150, 148, 142]), chip * 0.55); st.h -= chip * 0.4; st.ro = lerp(st.ro, 0.7, chip);
      const dust = ss(0.3, 0.8, fb(P, 4, 3, 19)) * k;
      over(st.c, lin([150, 144, 128]), dust * 0.22); st.ro = lerp(st.ro, 0.85, dust * 0.5);
    };
    /** pale retro-reflective placard tape: high albedo + a faint emissive (it still reads on the shadow side) */
    const reflective = (st, k, col = lin([206, 208, 204])) => {
      over(st.c, col, k); st.ro = lerp(st.ro, 0.38, k); st.me = 0;
      st.e[0] = Math.max(st.e[0], 0.085 * k); st.e[1] = Math.max(st.e[1], 0.085 * k); st.e[2] = Math.max(st.e[2], 0.08 * k);
    };
    const PL = vest.plate, AP = vest.abPlate;
    // bullet strikes on the chest plate (plate-local x, y from its centre, radius): flattened lead splats
    const plateHits = [[-0.062, -0.045, 0.012], [0.058, -0.082, 0.013], [0.03, 0.068, 0.01], [-0.02, -0.01 - PL.hh * 0.35, 0.011], [0.075, 0.01, 0.009]];
    const slashes = [[around(torsoB, 104, lerp(vest.yBotV, vest.yNF, 0.42)).p, around(torsoB, 118, lerp(vest.yBotV, vest.yNF, 0.3)).p], [around(torsoB, -62, lerp(vest.yBotV, vest.yNF, 0.55)).p, around(torsoB, -78, lerp(vest.yBotV, vest.yNF, 0.66)).p], [around(torsoB, 160, lerp(vest.yBotV, vest.yNF, 0.35)).p, around(torsoB, 140, lerp(vest.yBotV, vest.yNF, 0.45)).p]];
    const vestTex = paintPart(vestPart, { size: 2048, normalSize: 1024, ormSize: 512, rough: 0.85, normalStrength: 2.4, emissive: true, emissiveSize: 512 }, (P, Nn, st, u, v, i, vtx) => {
      const pc = piece(vg, vtx), nm = pc.name;
      const th = Math.atan2(P[0], P[2] - spineZ(P[1])) / D2R, aTh = Math.abs(th);
      if (nm === 'vestShell' || nm === 'vestTop' || nm === 'vestBot') {
        cordura(P, st);
        if (nm !== 'vestShell') {
          // binding tape round the edges: darker, a stitch line
          mul(st.c, [0.78, 0.78, 0.8], 1); st.ro = 0.7;
          const [, lv] = loc(pc, u, v);
          const stitch = (1 - ss(0.03, 0.08, Math.abs(lv - 0.28))) * ss(0.2, 0.5, Math.sin(lv * 0 + (P[0] + P[2]) * 1400));
          over(st.c, lin([90, 90, 88]), stitch * 0.5); st.h += 0.3;
        } else {
          // MOLLE / PALS webbing: rows of 25 mm webbing 25 mm apart, bar-tacked every 38 mm, on the back and sides
          const y = P[1];
          const onBack = aTh > 112, onSide = aTh > 64 && aTh <= 112;
          const yLo = vest.yBotV + 0.035, yHi = onBack ? PL.yc - 0.035 : vest.yArm - 0.04;
          if ((onBack || onSide) && y > yLo && y < yHi) {
            const R = Math.hypot(P[0], P[2] - spineZ(P[1]));
            const arc = th * D2R * R;
            const row = (y - yLo) / 0.05, fr = row - Math.floor(row);
            const band = ss(0.0, 0.04, fr) * (1 - ss(0.46, 0.5, fr));
            const tack = 1 - ss(0.0015, 0.0035, Math.abs(((arc / 0.038) % 1 + 1) % 1 - 0.5) * 0.038);
            set3(st.c, mix3(st.c, lin([104, 106, 98]), band));
            st.h += band * 1.1 - band * tack * 0.8;
            over(st.c, lin([62, 64, 60]), (1 - band) * ss(0.48, 0.5, fr) * (1 - ss(0.5, 0.56, fr)) * 0.5);   // shadow under each row
            over(st.c, lin([118, 118, 112]), band * tack * 0.4);
          }
          // panel construction: the front and back panels overlap the side cummerbund (a shadowed edge + stitching)
          for (const edge of [64, 116]) {
            const de = Math.abs(aTh - edge) * D2R * 0.16;
            const lip = 1 - ss(0.0, 0.006, de);
            mul(st.c, [0.62, 0.62, 0.64], lip * (aTh < edge === (edge === 64) ? 0.4 : 0.85)); st.h -= lip * 0.6;
            over(st.c, lin([132, 132, 126]), (1 - ss(0.0006, 0.0016, Math.abs(de - 0.009))) * ss(0.2, 0.6, Math.sin(P[1] * 1300) * 0.5 + 0.5) * 0.45);
          }
          if (onSide && y > yLo) { st.h += Math.sin(y * 900) * 0.08; }
          // back placard: a pale retro-reflective panel, POLICE in dark navy letters
          if (aTh > 100 && P[2] < spineZ(P[1])) {
            const yb = vest.yNB - 0.14, Ht = 0.05, sw = 0.0085;
            const tw = 6 * 5.6 * Ht / 6 - 0.6 * Ht / 6;
            const tx = tw / 2 - P[0], ty = y - yb;
            const patch = (1 - ss(-0.002, 0.002, Math.abs(tx - tw / 2) - tw / 2 - 0.018)) * (1 - ss(-0.002, 0.002, Math.abs(ty - Ht / 2) - Ht / 2 - 0.016));
            const worn = ss(-0.5, 0.05, fb(P, 30, 3, 4));
            reflective(st, patch * (0.55 + 0.4 * worn)); st.h += patch * 0.4;
            const ink = textInk('POLICE', tx, ty, Ht, sw) * patch;
            over(st.c, lin([34, 38, 52]), ink * 0.95); st.e[0] *= 1 - ink; st.e[1] *= 1 - ink; st.e[2] *= 1 - ink; st.ro = lerp(st.ro, 0.7, ink); st.h -= ink * 0.2;
          }
          // knife slashes through the cover: frayed edges, the yellow aramid layers inside
          for (const [a, b] of slashes) {
            const q = lineAt(P, a, b, 0.02);
            if (!q) continue;
            const w = 0.0045 * Math.sin(Math.PI * clamp01(q.t / q.L)) + 0.0005;
            const open = (1 - ss(w * 0.7, w, q.ac)) * q.fade;
            const fray = (1 - ss(w, w + 0.004, q.ac)) * q.fade * ss(0.2, 0.6, N.noise(q.t * 400, q.ac * 900, 1.3));
            over(st.c, mix3(lin([176, 146, 66]), lin([120, 96, 44]), ss(0.4, 0.9, q.ac / w)), open);
            st.h -= open * 0.8; st.ro = lerp(st.ro, 0.9, open);
            over(st.c, lin([110, 108, 100]), fray * 0.6); st.h += fray * 0.3;
          }
        }
      } else if (nm.startsWith('strap')) {
        set3(st.c, lin([106, 108, 100])); st.ro = 0.86;
        const [lu, lv] = loc(pc, u, v);
        st.h = Math.sin(lu * 900) * 0.04;
        const edge = (1 - ss(0.0, 0.08, Math.abs(lv - 0.28))) + (1 - ss(0.0, 0.08, Math.abs(lv - 0.72)));
        over(st.c, lin([120, 120, 114]), edge * 0.35); st.h -= edge * 0.2;
        // ladder-lock buckle at the front root, a velcro tab mid-way
        if (lu < 0.13) { const k = ss(0.05, 0.07, lu) * (1 - ss(0.11, 0.13, lu)); set3(st.c, mix3(st.c, lin([66, 66, 68]), k)); st.ro = lerp(st.ro, 0.5, k); st.h += k * 1.2; }
      } else if (pc.info.which) {
        // hard polymer plates (chest + abdomen): mid grey, smoother and glossier than the Cordura, scuffed, dusty
        // edges; POLICE on a reflective placard across the chest plate; bullet strikes: flattened lead splats with
        // a pale stress-whitened ring in the polymer (stopped, not through)
        const Q = pc.info.which === 'plate' ? PL : AP;
        const edgeP = pc.info.kind === 'plateEdge';
        hardSurface(P, st, lin([140, 142, 136]), 0.85);
        const x = P[0], y = P[1] - Q.yc;
        // distance to the outline (plate metres) -> moulded raised border 1.4 cm in, dust / wear along the edge
        const eo = Math.min(Q.hwAt(P[1]) - Math.abs(x), P[1] - Q.y0, Q.y1 - P[1]);
        st.h += (1 - ss(0.0, 0.003, Math.abs(eo - 0.014))) * 0.6;
        over(st.c, lin([156, 150, 134]), (1 - ss(0.0, 0.012, eo)) * ss(0.0, 0.6, fb(P, 25, 3, 7) + 0.2) * 0.35);
        if (edgeP) {
          // bevel and wall: a touch darker, the front arris worn pale
          mul(st.c, [0.86, 0.86, 0.88], 1);
          const [, lv] = loc(pc, u, v);
          over(st.c, lin([176, 176, 170]), (1 - ss(0.02, 0.12, lv)) * ss(0.0, 0.5, fb(P, 30, 2, 3) + 0.2) * 0.6);
          st.h = 0;
        } else if (pc.info.which === 'plate') {
          const yP = Q.y0 + 0.6 * (Q.y1 - Q.y0) - Q.yc;
          const Ht = 0.036, sw = 0.0068, tw = 6 * 5.6 * Ht / 6 - 0.6 * Ht / 6;
          const tx = x + tw / 2, ty = y - yP + Ht / 2;
          const patch = (1 - ss(-0.002, 0.002, Math.abs(x) - tw / 2 - 0.012)) * (1 - ss(-0.002, 0.002, Math.abs(ty - Ht / 2) - Ht / 2 - 0.011));
          const worn = ss(-0.55, 0.0, fb(P, 40, 3, 9));
          reflective(st, patch * (0.6 + 0.38 * worn)); st.h += patch * 0.35;
          const ink = textInk('POLICE', tx, ty, Ht, sw) * patch;
          over(st.c, lin([34, 38, 52]), ink * 0.95); st.e[0] *= 1 - ink; st.e[1] *= 1 - ink; st.e[2] *= 1 - ink; st.ro = lerp(st.ro, 0.7, ink); st.h -= ink * 0.15;
          // a strip of hook-and-loop above the placard (name tape torn off)
          const vel = (1 - ss(-0.002, 0.002, Math.abs(x) - 0.06)) * (1 - ss(-0.002, 0.002, Math.abs(y - yP - 0.052) - 0.011));
          over(st.c, lin([72, 72, 72]), vel * 0.8); st.h += vel * N.noise(P[0] * 2000, P[1] * 2000, 0.5) * 0.25; st.ro = lerp(st.ro, 0.95, vel);
          for (const [hx, hy, hr] of plateHits) {
            const d = Math.hypot(x - hx, y - hy);
            if (d > hr * 3.4) continue;
            const an = Math.atan2(y - hy, x - hx);
            const jag = 1 + 0.3 * N.noise(Math.cos(an) * 3 + hx * 50, Math.sin(an) * 3, 0.7) + 0.25 * Math.abs(Math.sin(an * 6 + hx * 90));
            const q = d / (hr * jag);
            if (q < 1) {
              // the splat: dull lead grey, darker sooty core, raised petals
              set3(st.c, mix3(lin([138, 138, 134]), lin([66, 64, 62]), 1 - ss(0.15, 0.7, q))); st.me = lerp(0.15, 0.6, ss(0.1, 0.6, q)); st.ro = lerp(0.4, 0.55, q);
              st.h = -0.6 * (1 - q * q) + ss(0.55, 0.95, q) * 1.1;
              st.e[0] = st.e[1] = st.e[2] = 0;
            } else {
              // stress-whitened ring + radial crazing in the polymer, a soot halo
              const ring = (1 - ss(1.0, 1.6, q)) * 0.6;
              const craze = ss(0.55, 0.85, Math.abs(Math.sin(an * 7 + hx * 40))) * (1 - ss(1.0, 2.6, q)) * ss(0.2, 0.6, N.noise(an * 9, d * 400, 3.1));
              over(st.c, lin([196, 194, 186]), Math.max(ring, craze * 0.7)); st.h -= craze * 0.3;
              over(st.c, lin([70, 68, 64]), (1 - ss(1.2, 3.4, q)) * 0.3);
            }
          }
        }
      } else if (nm.startsWith('pouch') || nm.startsWith('beltPouch') || nm === 'radio' || nm === 'buckle') {
        const inf = pc.info;
        const d = sub(P, inf.c), lx = dot(d, inf.ex) / inf.hs[0], ly = dot(d, inf.ey) / inf.hs[1], lz = dot(d, inf.ez) / inf.hs[2];
        if (nm === 'radio') {
          set3(st.c, lin([54, 55, 57])); st.ro = 0.5;
          st.h = N.fbm(P[0] * 400, P[1] * 400, P[2] * 400, 2) * 0.06;
          if (lz > 0.9) {
            // speaker grille, a display window, a status LED (dim red)
            const gx = lx * 0.03 / 0.004, gy = ly * 0.06 / 0.004;
            const grille = ly < 0.1 && ly > -0.8 && Math.abs(lx) < 0.75 ? 1 - ss(0.25, 0.4, Math.hypot(gx - Math.round(gx), gy - Math.round(gy))) : 0;
            st.h -= grille * 0.8; mul(st.c, [0.5, 0.5, 0.5], grille);
            const disp = ly > 0.35 && ly < 0.75 && Math.abs(lx) < 0.6 ? 1 : 0;
            set3(st.c, mix3(st.c, lin([30, 40, 36]), disp)); st.ro = lerp(st.ro, 0.12, disp);
            const led = 1 - ss(0.06, 0.12, Math.hypot(lx - 0.6, ly - 0.88));
            over(st.c, lin([180, 30, 20]), led); st.e[0] = 0.9 * led; st.e[1] = 0.08 * led; st.e[2] = 0.04 * led;
          }
          over(st.c, lin([100, 96, 90]), ss(0.4, 0.8, fb(P, 50, 2, 3)) * 0.25);
        } else if (nm === 'buckle') {
          set3(st.c, lin([96, 96, 94])); st.me = 0.7; st.ro = 0.42;
          const slot = Math.abs(lx) < 0.75 && Math.abs(ly) < 0.5 && lz > 0.8 ? 1 : 0;
          mul(st.c, [0.6, 0.6, 0.6], slot * 0.6); st.h = -slot * 0.5;
          over(st.c, lin([90, 64, 44]), ss(0.3, 0.7, fb(P, 120, 2, 3)) * 0.35);
        } else {
          cordura(P, st);
          // flap over the top third: its bottom edge casts a shadow line, a stitched border, a press-stud
          const flapY = 0.25;
          if (lz > 0.75) {
            const fl = ly - flapY;
            if (fl < 0) mul(st.c, [0.6, 0.6, 0.62], (1 - ss(0.0, 0.12, -fl)) * 0.8);
            st.h += fl > 0 ? 0.5 : 0;
            const stud = 1 - ss(0.1, 0.16, Math.hypot(lx * inf.hs[0] / inf.hs[1], (ly - flapY - 0.14)));
            over(st.c, lin([70, 70, 70]), stud * 0.8); st.h += stud * 0.6; st.ro = lerp(st.ro, 0.5, stud);
          }
          const border = Math.max(1 - ss(0.86, 0.9, Math.abs(lx)) * 0, ss(0.84, 0.9, Math.max(Math.abs(lx), Math.abs(ly))));
          over(st.c, lin([84, 84, 82]), border * 0.3); st.h -= border * 0.2;
        }
      } else if (nm === 'antenna') {
        set3(st.c, lin([34, 34, 36])); st.ro = 0.6;
      } else if (nm === 'belt') {
        set3(st.c, lin([68, 68, 66])); st.ro = 0.7;
        const [, lv] = loc(pc, u, v);
        st.h = Math.sin(P[1] * 3000) * 0.05;
        const edge = (1 - ss(0.0, 0.04, Math.abs(lv - 0.2))) + (1 - ss(0.0, 0.04, Math.abs(lv - 0.8)));
        over(st.c, lin([100, 100, 96]), edge * 0.35); st.h -= edge * 0.25;
        mul(st.c, [0.72, 0.72, 0.72], (lv < 0.14 || lv > 0.86) ? 1 : 0);
      }
      // filth, grime in recesses, blood: splatter on the front, the neck bite's run down the left strap / chest
      over(st.c, lin([136, 128, 112]), ss(0.35, 0.85, fb(P, 7, 3, 13)) * 0.16);
      let bl = 0;
      const nb = neckBite.p, dy = nb[1] - P[1], dx = P[0] - nb[0];
      if (dy > -0.02 && dy < 0.3) bl = Math.max(bl, (1 - ss(0.03 + dy * 0.1, 0.06 + dy * 0.14, Math.abs(dx - dy * 0.1) + N.fbm(P[0] * 12, P[1] * 12, P[2] * 12, 3) * 0.03)) * (1 - ss(0.1, 0.3, dy)) * ss(-0.3, 0.3, Nn[2] + 0.2) * 0.8);
      const spray = (1 - ss(0.05, 0.11, N.worley(P[0] * 55, P[1] * 55, P[2] * 55))) * ss(0.25, 0.7, fb(P, 3, 2, 5) + 0.3) * ss(-0.1, 0.5, Nn[2]);
      bl = Math.max(bl, spray * 0.4 * (pc.info.which ? 0.7 : 1));
      const hand = ss(0.55, 0.75, N.noise(P[0] * 20, P[1] * 60, P[2] * 20)) * ss(0.3, 0.7, fb(P, 5, 2, 17)) * (aTh < 70 ? 1 : 0) * ss(vest.yBotV + 0.2, vest.yBotV + 0.05, P[1]);
      bl = Math.max(bl, hand * 0.7);
      if (bl > 0) { const k = Math.min(1, bl) * 0.88; over(st.c, mix3(lin([72, 8, 8]), lin([36, 10, 8]), ss(-0.3, 0.4, N.noise(P[0] * 18, P[1] * 18, P[2] * 18))), k); st.ro = lerp(st.ro, 0.4, bl); for (let q = 0; q < 3; q++) st.e[q] *= 1 - k; }
    });
    TR.snap('vest: painted', vestTex.albedo, vestPart);
    lapse('vest');

    // ============================================================== GUARDS (gear): hard shells, rubber rims, straps
    // slate-blue hard polymer (sRGB ~100: dark riot-gear plastic that still reads on the shadow side, a cousin of the
    // navy helmet), pale scuffs / scratches, grey-beige dust settling along the rims and in the grooves (NOT rust),
    // blood only as local spatter; a retro-reflective band across each pauldron
    const SHELL = lin([90, 97, 110]);
    const guardTex = paintPart(guardPart, { size: 1024, normalSize: 1024, ormSize: 256, rough: 0.4, normalStrength: 2.6, emissive: true, emissiveSize: 256 }, (P, Nn, st, u, v, i, vtx) => {
      const pc = piece(gg, vtx), kind = pc.info.kind, [lu, lv] = loc(pc, u, v);
      if (kind === 'rim') {
        set3(st.c, lin([62, 63, 66])); st.ro = 0.78; st.h = N.fbm(P[0] * 300, P[1] * 300, P[2] * 300, 2) * 0.1;
        over(st.c, lin([150, 144, 128]), ss(0.2, 0.7, fb(P, 20, 3, 5)) * 0.3);                  // dust caught in the rubber
      } else if (kind === 'strap') {
        set3(st.c, lin([72, 72, 70])); st.ro = 0.88; st.h = Math.sin(lu * 700) * 0.05;
        const edge = (1 - ss(0.0, 0.1, Math.abs(lv - 0.15))) + (1 - ss(0.0, 0.1, Math.abs(lv - 0.85)));
        over(st.c, lin([104, 104, 100]), edge * 0.35);
        const buckle = (1 - ss(0.02, 0.03, Math.abs(lu - 0.5))) * 1;
        set3(st.c, mix3(st.c, lin([70, 70, 72]), buckle)); st.ro = lerp(st.ro, 0.45, buckle); st.h += buckle * 1.2;
      } else {
        hardSurface(P, st, SHELL);
        st.ro = Math.min(0.85, st.ro + 0.08);              // matte moulded polymer, not polished metal
        // moulded detail: a raised spine along the shell, cross grooves, a raised border 1 cm in
        const w = pc.w, hh = pc.h;
        const e = Math.min(lu * w, (1 - lu) * w, lv * hh, (1 - lv) * hh);
        st.h += (1 - ss(0.0, 0.003, Math.abs(e - 0.011))) * 0.7;
        let groove = 0;
        if (kind === 'shin' || kind === 'forearm' || kind === 'thigh' || kind === 'upperarm') {
          const spine = 1 - ss(0.04, 0.07, Math.abs(lv - 0.5));
          st.h += spine * 0.8 * ss(0.05, 0.15, lu) * ss(0.95, 0.85, lu);
          const gl = kind === 'shin' ? [0.33, 0.62] : kind === 'thigh' ? [0.36, 0.68] : kind === 'upperarm' ? [] : [0.45];
          for (const g0 of gl) { const gr = 1 - ss(0.006, 0.014, Math.abs(lu - g0)); groove = Math.max(groove, gr); st.h -= gr * 0.9; mul(st.c, [0.8, 0.8, 0.82], gr * 0.5); }
        }
        if (kind === 'knee') { const r = Math.hypot(lu - 0.5, lv - 0.45); st.h += (1 - ss(0.0, 0.03, Math.abs(r - 0.22))) * 0.8; }
        // dust: along the rim (inside the raised border) and in the grooves, heavier low on the legs; pale edge wear
        const lowK = kind === 'shin' || kind === 'knee' ? 1 - ss(0.1, 0.55, P[1] - y0) : kind === 'thigh' ? 0.3 : 0;
        const nearEdge = 1 - ss(0.004, 0.02, e);
        const dust = clamp01((nearEdge * 0.8 + groove + lowK * 0.6) * ss(-0.2, 0.5, fb(P, 18, 3, 2) + 0.2));
        over(st.c, lin([152, 146, 130]), dust * 0.5); st.ro = lerp(st.ro, 0.88, dust * 0.7);
        const wear = (1 - ss(0.0, 0.006, e)) * ss(0.1, 0.6, fb(P, 40, 2, 6) + 0.25);
        over(st.c, lin([164, 166, 166]), wear * 0.4); st.ro = lerp(st.ro, 0.66, wear);
        // blood: the right forearm guard spattered from the bitten hand, sparse flecks elsewhere
        if (kind === 'forearm' && P[0] < 0) {
          const b = ss(0.35, 0.65, fb(P, 16, 3, 9)) * (1 - ss(0.4, 0.95, lu));
          over(st.c, lin([66, 10, 9]), b * 0.55); st.ro = lerp(st.ro, 0.3, b);
        }
        const spray = (1 - ss(0.04, 0.08, N.worley(P[0] * 60, P[1] * 60, P[2] * 60))) * ss(0.45, 0.8, fb(P, 3, 2, 21) + 0.2);
        over(st.c, lin([70, 10, 9]), spray * 0.6);
        // a retro-reflective band across each pauldron (riot-unit marking): it catches light on the shadow side
        if (kind === 'shoulder') {
          const band = (1 - ss(0.07, 0.085, Math.abs(lv - 0.6))) * (0.55 + 0.45 * ss(-0.2, 0.4, fb(P, 30, 3, 8) + 0.3)) * (1 - spray);
          reflective(st, band * 0.95); st.h += band * 0.2;
        }
      }
    });
    TR.snap('guards: painted', guardTex.albedo, guardPart);
    lapse('guards');

    // ============================================================== HELMET (gear) + VISOR (blend)
    const helmTex = paintPart(helmetPart, { size: 1024, normalSize: 1024, ormSize: 256, rough: 0.35, normalStrength: 2.4 }, (P, Nn, st, u, v, i, vtx) => {
      const pc = piece(hg, vtx), kind = pc.info.kind;
      if (kind === 'dome') {
        hardSurface(P, st, lin([58, 70, 102]), 0.75);
        st.ro = Math.max(0.24, st.ro - 0.12);
        const d = sub(P, Hc), phi = Math.atan2(d[0], d[2]) / D2R, aphi = Math.abs(phi);
        // the unit number on the back and both sides (white stencil), a reflective band round the back
        if (aphi > 150) {
          const Ht = 0.034, tw = 3 * 5.6 * Ht / 6 - 0.6 * Ht / 6, yb = helmet.rimY(Math.round(helmet.NU / 2)) + 0.045;
          const ink = textInk('174', tw / 2 - P[0], P[1] - yb, Ht, 0.0062) * ss(0.1, 0.5, fb(P, 40, 3, 2) + 0.45);
          over(st.c, lin([206, 206, 200]), ink * 0.95); st.ro = lerp(st.ro, 0.5, ink);
        }
        for (const s of [1, -1]) {
          const sphi = phi * s;
          if (sphi > 55 && sphi < 125) {
            const Ht = 0.024, tw = 3 * 5.6 * Ht / 6 - 0.6 * Ht / 6, yb = Hc[1] + 0.035;
            const zc = Hc[2] - 0.03, tx = s > 0 ? (zc - P[2]) + tw / 2 : (P[2] - zc) + tw / 2;   // reads left-to-right from that side
            const ink = textInk('174', tx, P[1] - yb, Ht, 0.005) * ss(0.1, 0.5, fb(P, 40, 3, 6) + 0.45);
            over(st.c, lin([206, 206, 200]), ink * 0.95); st.ro = lerp(st.ro, 0.5, ink);
          }
        }
        // a gouge across the crown (white fibreglass under the paint), a bloody hand smear down the left side
        const gq = lineAt(P, add(Hc, [-0.06, 0.1, 0.05]), add(Hc, [0.04, 0.115, -0.04]), 0.015);
        if (gq) { const k = (1 - ss(0.0015, 0.0045, gq.ac + N.noise(gq.t * 200, 0, 0) * 0.001)) * gq.fade; over(st.c, lin([170, 168, 160]), k); st.h -= k * 1.2; st.ro = lerp(st.ro, 0.8, k); }
        if (phi > 30 && phi < 110) {
          let fing = 0;
          for (let f = 0; f < 4; f++) { const zf = Hc[2] + 0.05 - f * 0.022 - (P[1] - Hc[1]) * 0.3; fing = Math.max(fing, (1 - ss(0.004, 0.008, Math.abs(P[2] - zf))) * ss(Hc[1] - 0.02, Hc[1] + 0.02, P[1]) * (1 - ss(Hc[1] + 0.08, Hc[1] + 0.11, P[1]))); }
          const k = fing * ss(-0.1, 0.5, fb(P, 30, 3, 5) + 0.3);
          over(st.c, lin([70, 9, 9]), k * 0.9); st.ro = lerp(st.ro, 0.3, k);
        }
        const spray = (1 - ss(0.05, 0.1, N.worley(P[0] * 60, P[1] * 60, P[2] * 60))) * ss(0.35, 0.75, fb(P, 3, 2, 31) + 0.2);
        over(st.c, lin([70, 9, 9]), spray * 0.75);
      } else if (kind === 'helmetRim' || kind === 'gasket') {
        set3(st.c, lin([50, 51, 54])); st.ro = 0.8; st.h = N.fbm(P[0] * 300, P[1] * 300, P[2] * 300, 2) * 0.1;
        over(st.c, lin([140, 134, 120]), ss(0.4, 0.8, fb(P, 30, 3, 1)) * 0.25);
      } else if (kind === 'boss') {
        set3(st.c, lin([92, 94, 98])); st.me = 0.7; st.ro = 0.45;
        const d = sub(P, helmet.pivots[P[0] >= 0 ? 0 : 1]);
        const r = Math.hypot(d[1], d[2]);
        st.h = (1 - ss(0.004, 0.006, r)) * -0.8 + (1 - ss(0.0, 0.0015, Math.abs(r - 0.011))) * 0.5;
        over(st.c, lin([40, 38, 36]), 1 - ss(0.003, 0.005, r));
      } else if (kind === 'curtain') {
        // quilted padded neck curtain: diamond stitching, fabric weave, dust
        set3(st.c, lin([62, 70, 92])); st.ro = 0.9;
        const [lu, lv] = loc(pc, u, v);
        const a = (lu * pc.w + lv * pc.h) / 0.035, b = (lu * pc.w - lv * pc.h) / 0.035;
        const q = Math.min(Math.abs(a - Math.round(a)), Math.abs(b - Math.round(b)));
        const stitch = 1 - ss(0.03, 0.08, q);
        st.h = ss(0.0, 0.35, q) * 0.8 + N.fbm(P[0] * 400, P[1] * 400, P[2] * 400, 2) * 0.1;
        mul(st.c, [0.75, 0.75, 0.78], stitch * 0.6);
        over(st.c, lin([132, 126, 112]), ss(0.3, 0.8, fb(P, 12, 3, 4)) * 0.2);
        // bound edge (opaque fabric tape) along the bottom hem
        mul(st.c, [0.8, 0.8, 0.82], ss(0.82, 0.9, lv)); st.h += ss(0.82, 0.9, lv) * 0.4;
      }
    });
    TR.snap('helmet: painted', helmTex.albedo, helmetPart);
    lapse('helmet');

    // visor: smoked polycarbonate (mostly see-through), scuffed and dirty towards the edges; an impact on the left
    // side starred the plastic into radial cracks and concentric rings, and the lower left corner is broken out
    const VW = 2 * helmet.visor.axV, VH = (helmet.visor.psiTop - helmet.visor.psiBot) * D2R * helmet.visor.rho0;
    const imp = [0.63 * VW, 0.6 * VH];                   // impact point (visor metres: x from the right edge, y up)
    const rays = [];
    for (let k = 0; k < 9; k++) rays.push({ a: (k / 9) * Math.PI * 2 + (hash(k * 7 + 1) - 0.5) * 0.5, L: 0.04 + hash(k * 13 + 5) * 0.09 });
    const holeC = [0.72 * VW, 0.33 * VH];
    const shard = [];
    for (let k = 0; k < 13; k++) shard.push({ a: (k + (hash(k * 31 + 7) - 0.5) * 0.7) / 13 * Math.PI * 2, r: 0.75 + 0.5 * hash(k * 17 + 3) });
    const shardR = (ang) => {
      const a = ((ang % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      for (let k = 0; k < shard.length; k++) {
        const p = shard[k], q = shard[(k + 1) % shard.length], qa = k + 1 < shard.length ? q.a : q.a + 2 * Math.PI;
        const aa = a < shard[0].a ? a + 2 * Math.PI : a;
        if (aa >= p.a && aa < qa) { const t = (aa - p.a) / (qa - p.a); return 1 / lerp(1 / p.r, 1 / q.r, t); }
      }
      return 1;
    };
    const visTex = paintPart(visorPart, { size: 1024, normalSize: 512, ormSize: 128, rough: 0.06, normalStrength: 1.2, blend: true, pad: 4 }, (P, Nn, st, u, v, i, vtx) => {
      const pc = visorPart.geo.pieces[0], [lu, lv] = loc(pc, u, v);
      const x = lu * VW, y = lv * VH;
      set3(st.c, lin([58, 64, 72])); st.a = 0.17; st.ro = 0.06; st.h = 0;
      // the moulded edge band (thicker plastic: less clear) + scuffs / grime building up towards the edges and bottom
      const e = Math.min(x, VW - x, y, VH - y);
      const band = 1 - ss(0.004, 0.009, e);
      st.a = Math.max(st.a, band * 0.55);
      const grime = clamp01(ss(-0.2, 0.6, fb(P, 18, 3, 3)) * (0.35 + 0.65 * (1 - ss(0.0, 0.06, e))) + (1 - ss(0.0, 0.07, y)) * 0.3);
      over(st.c, lin([104, 96, 84]), grime * 0.8); st.a = Math.max(st.a, st.a + grime * 0.3); st.ro = lerp(st.ro, 0.6, grime);
      const scr = ss(0.92, 0.99, N.ridged(P[0] * 90, P[1] * 14, P[2] * 90, 2)) * ss(0.0, 0.5, fb(P, 6, 2, 5) + 0.2);
      over(st.c, lin([190, 194, 198]), scr * 0.8); st.a = Math.max(st.a, scr * 0.4); st.ro = lerp(st.ro, 0.5, scr);
      // impact: crushed white core, radial cracks, a few concentric ring segments
      const dx = x - imp[0], dy = y - imp[1], dI = Math.hypot(dx, dy), an = Math.atan2(dy, dx);
      let crack = (1 - ss(0.004, 0.008, dI));
      for (const r of rays) {
        const along = dx * Math.cos(r.a) + dy * Math.sin(r.a), acr = Math.abs(-dx * Math.sin(r.a) + dy * Math.cos(r.a) + N.noise(along * 120, r.a * 3, 0.5) * 0.0025);
        if (along > 0 && along < r.L) crack = Math.max(crack, (1 - ss(0.0003, 0.0008, acr)) * (1 - ss(r.L * 0.55, r.L, along)) * (0.75 + 0.25 * ss(0.012, 0.0, along)));
      }
      // stress cracks running on from the corners of the break
      shard.forEach((p, k) => {
        if (Math.sin(p.a) < -0.25) return;
        const r0 = 0.048 * p.r, ox = holeC[0] + Math.cos(p.a) * r0 / 0.85, oy = holeC[1] + Math.sin(p.a) * r0;
        const a2 = p.a + (hash(k * 5 + 2) - 0.5) * 0.6, L2 = 0.01 + 0.03 * hash(k * 11 + 9);
        const qx = x - ox, qy = y - oy, along = qx * Math.cos(a2) + qy * Math.sin(a2);
        const acr = Math.abs(-qx * Math.sin(a2) + qy * Math.cos(a2) + N.noise(along * 150, k, 0.5) * 0.0015);
        if (along > -0.002 && along < L2) crack = Math.max(crack, (1 - ss(0.0003, 0.0008, acr)) * (1 - ss(L2 * 0.5, L2, along)) * 0.85);
      });
      for (const rr of [0.012, 0.024, 0.04]) {
        const ring = (1 - ss(0.0003, 0.0008, Math.abs(dI - rr - N.noise(an * 4, rr * 50, 1.7) * 0.003))) * ss(-0.1, 0.3, N.noise(an * 2.2 + rr * 90, 0.4, 2.2));
        crack = Math.max(crack, ring * 0.9);
      }
      if (crack > 0) { over(st.c, lin([196, 202, 208]), crack); st.a = Math.max(st.a, crack * 0.62); st.ro = lerp(st.ro, 0.4, crack); st.h += crack * 0.6; }
      // the broken-out lower left corner: no plastic at all, a whitened stress band along the jagged break
      const hx = x - holeC[0], hy = y - holeC[1], ha = Math.atan2(hy, hx);
      const hr = 0.048 * shardR(ha) * (1 + 1.4 * ss(0.0, 1.0, -hy / 0.07));
      const hd = Math.hypot(hx * 0.85, hy) - hr;
      if (hd < 0) st.a = 0;
      else if (hd < 0.0025) { const k = (1 - hd / 0.0025) * (0.6 + 0.4 * ss(-0.3, 0.3, N.noise(ha * 9, 0.5, 4.4))); over(st.c, lin([214, 218, 222]), k * 0.85); st.a = Math.max(st.a, 0.3 + 0.45 * k); st.h += 0.6 * k; st.ro = 0.35; }
      else if (hd < 0.02) { const k = 1 - (hd - 0.005) / 0.015; st.a = Math.max(st.a, st.a + 0.12 * k); over(st.c, lin([170, 176, 182]), 0.25 * k); }
      // blood: flecks and a smear on the lower half, a drip line under the break
      const fl = (1 - ss(0.05, 0.1, N.worley(P[0] * 80, P[1] * 80, P[2] * 80))) * ss(0.25, 0.6, fb(P, 4, 2, 9) + 0.15) * (1 - ss(0.4, 0.8, y / VH));
      const sm = ss(0.35, 0.7, fb(P, 9, 3, 15)) * (1 - ss(0.25, 0.6, y / VH)) * (hd > 0 ? 1 : 0);
      const bl = Math.max(fl * 0.95, sm * 0.7);
      if (bl > 0) { over(st.c, lin([84, 10, 10]), bl); st.a = Math.max(st.a, bl * 0.9); st.ro = lerp(st.ro, 0.3, bl); }
    });
    TR.snap('visor: painted', visTex.albedo, visorPart);
    lapse('visor');

    // ============================================================== AMBIENT OCCLUSION -> ORM only (never the albedo)
    {
      const RA = texSize(512);
      const occAll = makeBVH([surf(fullBody), surf(uniLow), surf(boots), surf(vestPart), surf(guardPart), surf(helmetPart)]).bvh;
      const baseS = nsurf(h.basePart({ name: 'ao' }));
      const ao = bakeField(baseS, h.baseObj.uvs, RA, occTracer(occAll, { rays: 16, maxDist: 0.1 }));
      applyOcclusion(skin.orm, [ao], RA, (a) => lerp(1, a, 0.85));
      const R2 = texSize(256);
      for (const [tex, part, k, md] of [[cloth, uniLow, 0.85, 0.08], [vestTex, vestPart, 0.6, 0.06], [guardTex, guardPart, 0.75, 0.06], [helmTex, helmetPart, 0.7, 0.08], [bootTex, boots, 0.75, 0.06]]) {
        const f = bakeField(nsurf(part), part.obj.uvs, R2, occTracer(occAll, { rays: 12, maxDist: md }));
        applyOcclusion(tex.orm, [f], R2, (a) => lerp(1, a, k));
      }
    }
    lapse('ambient occlusion');

    // ============================================================== materials
    bodyLow.material = lib.material('skin', { albedo: skin.albedo, normal: skin.normal, orm: skin.orm });
    uniLow.material = lib.material('cloth', { albedo: cloth.albedo, normal: cloth.normal, orm: cloth.orm, alpha: cloth.alpha, doubleSided: true, pngBits: 6 });
    boots.material = lib.material('cloth', { albedo: bootTex.albedo, normal: bootTex.normal, orm: bootTex.orm });
    vestPart.material = lib.material('gear', { albedo: vestTex.albedo, normal: vestTex.normal, orm: vestTex.orm, emissiveMap: vestTex.emissiveMap, doubleSided: true });
    guardPart.material = lib.material('gear', { albedo: guardTex.albedo, normal: guardTex.normal, orm: guardTex.orm, emissiveMap: guardTex.emissiveMap, doubleSided: true });
    helmetPart.material = lib.material('gear', { albedo: helmTex.albedo, normal: helmTex.normal, orm: helmTex.orm, doubleSided: true });
    visorPart.material = lib.material('gear', { albedo: visTex.albedo, normal: visTex.normal, orm: visTex.orm, alphaMode: 'BLEND', doubleSided: true });
    // eyes: milky, faintly glowing a sick yellow (they must read behind the smoked visor); teeth stained, bloody
    const eyeTex = lib.paintEyes(await lib.texture('system', 'eyes/materials/brown_eye.png', 256), { style: 'glow', color: [0.78, 0.7, 0.36], bloodshot: 0.9, seed: 4 });
    eyes.material = lib.material('eye', { albedo: eyeTex.albedo, emissiveMap: eyeTex.emissiveMap, emissive: [1, 1, 1], roughness: 0.15 });
    teeth.material = lib.material('teeth', {
      albedo: lib.grungeTexture(await lib.texture(teeth.asset.textures.diffuse, 512), { seed: 9, tint: [0.92, 0.8, 0.6], darken: 0.04, dirt: 0.45, blood: 0.55, freq: 12 }),
      orm: createImage(64, 64, [150, 110, 0, 255]),
    });
    lapse('materials');
  }
  eyes.extras.noSimplify = true;
  for (const p of parts) console.log(`${TAG} part ${p.name.padEnd(10)} ${p.triCount()} tris`);

  // LOD1 guards: the rolled rims and the straps (most of the guard triangles) are dropped instead of letting the
  // exporter's simplifier collapse the shells (at ~440 tris it punched holes in them and the trousers showed
  // through). build.mjs swaps every material for a half-size copy before the LOD1 export, so a material other than
  // the LOD0 one means the LOD1 pass.
  {
    const mat0 = guardPart.material, base = guardPart.toRender.bind(guardPart);
    const detail = guardPart.obj.faces.map((f) => { const k = gg.pieces[gg.pv[f.v[0]]].info.kind; return k === 'rim' || k === 'strap'; });
    guardPart.toRender = function () {
      if (this.material === mat0) return base();
      const keep0 = Array.from(this.keep);
      detail.forEach((d, fi) => { if (d) this.keep[fi] = 0; });
      try { return base(); } finally { keep0.forEach((k, fi) => { this.keep[fi] = k; }); }
    };
    console.log(`${TAG} guards LOD1 (no rims / straps): ${detail.reduce((a, d, fi) => a + (!d && guardPart.keep[fi] ? 1 : 0), 0)} tris`);
  }

  // ---------------------------------------------------------------- scale to full size, stand on the boot soles
  const S = SKULL_TOP / h.height;
  scaleCharacter(h, parts, S);
  const LIFT = -y0 * S + 0.002;
  liftCharacter(h, parts, LIFT);
  let top = 0;
  for (let i = 1; i < helmetPart.pos.length; i += 3) top = Math.max(top, helmetPart.pos[i]);
  console.log(`${TAG} scale ${S.toFixed(3)} lift ${LIFT.toFixed(3)} skull ${h.height.toFixed(3)} helmet top ${top.toFixed(3)}`);

  // ---------------------------------------------------------------- hitboxes (full size): capsules [bone, r, toBone]
  // The game takes the capsule a bullet ray enters FIRST, and this type's frontArmor stops 80 % of a frontal body
  // shot but only 50 % of a head shot: the head must be reachable from the front. The automatic capsules put a
  // 24 cm end cap (the vest inflates the chest radius) round the neck base, in front of the face. Instead: the upper
  // torso is a HORIZONTAL capsule across the vest whose top stays under the chin, the trapezius / shoulder-guard
  // slopes beside the helmet get thin capsules, the gut a vertical one under the chest; the head runs from the skull
  // base to one radius under the helmet crown. Leaf helper bones carry the end points; radii are a percentile of
  // the distances of the vertices each capsule owns (dominant bone) to its segment.
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
    for (const part of [bodyLow, uni, boots, vestPart, guardPart, helmetPart]) {
      for (const v of new Set(Array.from(part.tris()).filter((_, i) => i % 2 === 0))) (owned[ownerOf(bones[part.weights[v][0][0]].name)] ||= []).push(P3(part, v));
    }
    const dSeg = (p, a, b) => new THREE.Line3(a, b).closestPointToPoint(p, true, new THREE.Vector3()).distanceTo(p);
    const pct = (a, q) => { const s2 = [...a].sort((x, y) => x - y); return s2[Math.min(s2.length - 1, Math.floor(s2.length * q))]; };
    const rad = (list, a, b, q = 0.8) => pct(list.map((p) => dSeg(p, a, b)), q);
    // head (+ helmet): skull base -> a helper one radius under the crown
    const headV = owned.head;
    const crown = Math.max(...headV.map((p) => p.y));
    const hc = headV.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / headV.length);
    let rHead = 0.13;
    for (let it = 0; it < 3; it++) rHead = Math.min(0.15, Math.max(0.11, rad(headV, BP('head'), new THREE.Vector3(hc.x, crown - rHead, hc.z), 0.85)));
    addHelperBone(h, 'head_top', 'head', [hc.x, crown - rHead, hc.z]);
    // chest: horizontal capsule across the vest, its top under the chin (the mouth minus 6 cm)
    const chinY = toFull(A.mouth)[1] - 0.06;
    const chestV = owned.chest;
    const s3 = BP('spine_03'), cz = chestV.reduce((a, p) => a + p.z, 0) / chestV.length;
    const shX = Math.abs(BP('upperarm_l').x);
    let rC = 0.22, yc = s3.y;
    for (let it = 0; it < 4; it++) {
      yc = Math.min(s3.y + 0.12, chinY - rC);
      const half = Math.max(0.05, shX - rC * 0.6);
      rC = Math.min(0.27, Math.max(0.17, rad(chestV.filter((p) => p.y < chinY + 0.05), new THREE.Vector3(-half, yc, cz), new THREE.Vector3(half, yc, cz), 0.82)));
    }
    yc = Math.min(s3.y + 0.12, chinY - rC);
    const halfC = Math.max(0.05, shX - rC * 0.6);
    addHelperBone(h, 'chest_r', 'spine_03', [-halfC, yc, cz]);
    addHelperBone(h, 'chest_l', 'spine_03', [halfC, yc, cz]);
    // trapezius / shoulder-guard slopes beside the helmet (from 35 % along the collarbone, lifted onto the yoke)
    const trapR = {};
    for (const sd of ['l', 'r']) {
      const a = BP('clavicle_' + sd).lerp(BP('upperarm_' + sd), 0.35).add(new THREE.Vector3(0, 0.04, 0)), b = BP('upperarm_' + sd);
      addHelperBone(h, 'trap_' + sd + '_in', 'clavicle_' + sd, a.toArray());
      const above = chestV.filter((p) => p.y > yc + rC * 0.5 && Math.sign(p.x) === (sd === 'l' ? 1 : -1));
      trapR[sd] = Math.min(0.12, Math.max(0.07, above.length ? rad(above, a, b, 0.7) : 0.09));
    }
    // gut: vertical segment in front of the spine, its top end cap under the chest capsule's centre line
    const bellyV = owned.belly;
    const gz = bellyV.reduce((a, p) => a + p.z, 0) / bellyV.length;
    const gLo = new THREE.Vector3(0, BP('spine_01').y, gz);
    let rG = Math.min(0.26, rad(bellyV, gLo, new THREE.Vector3(0, yc, gz), 0.8));
    const gHi = new THREE.Vector3(0, Math.max(gLo.y + 0.05, yc - rG - 0.02), gz);
    rG = Math.min(0.26, rad(bellyV, gLo, gHi, 0.8));
    addHelperBone(h, 'gut_lo', 'spine_01', gLo.toArray());
    addHelperBone(h, 'gut_hi', 'spine_01', gHi.toArray());
    addHelperBone(h, 'pelvis_top', 'pelvis', BP('pelvis').lerp(BP('spine_01'), 0.5).toArray());
    const HB = {
      head: ['head', rHead, 'head_top'], neck: ['neck_01', 0.075, 'head'], chest: ['chest_r', rC, 'chest_l'],
      trap_l: ['trap_l_in', trapR.l, 'upperarm_l'], trap_r: ['trap_r_in', trapR.r, 'upperarm_r'],
      belly: ['gut_lo', rG, 'gut_hi'], pelvis: ['pelvis', null, 'pelvis_top'],
      upperarm_l: ['upperarm_l', null, 'lowerarm_l'], lowerarm_l: ['lowerarm_l', null, 'hand_l'], hand_l: ['hand_l', null, 'middle_01_l'],
      upperarm_r: ['upperarm_r', null, 'lowerarm_r'], lowerarm_r: ['lowerarm_r', null, 'hand_r'], hand_r: ['hand_r', null, 'middle_01_r'],
      thigh_l: ['thigh_l', null, 'calf_l'], calf_l: ['calf_l', null, 'foot_l'], foot_l: ['foot_l', null, 'ball_l'],
      thigh_r: ['thigh_r', null, 'calf_r'], calf_r: ['calf_r', null, 'foot_r'], foot_r: ['foot_r', null, 'ball_r'],
    };
    const clampR = { pelvis: [0.14, 0.24], hand_l: [0.05, 0.08], hand_r: [0.05, 0.08], foot_l: [0.05, 0.09], foot_r: [0.05, 0.09], upperarm_l: [0.06, 0.12], upperarm_r: [0.06, 0.12], lowerarm_l: [0.05, 0.09], lowerarm_r: [0.05, 0.09], thigh_l: [0.08, 0.15], thigh_r: [0.08, 0.15], calf_l: [0.06, 0.11], calf_r: [0.06, 0.11] };
    for (const [name, [b0, r0, b1]] of Object.entries(HB)) {
      const a = BP(b0), b = BP(b1);
      let r = r0;
      if (r === null) { const lst = owned[name] || []; r = lst.length ? rad(lst, a, b, 0.8) : 0.08; const c = clampR[name]; if (c) r = Math.max(c[0], Math.min(c[1], r)); }
      hitboxes[name] = [b0, +r.toFixed(3), b1];
      capsules[name] = { bone: b0, to: b1, radius: +r.toFixed(3), length: +a.distanceTo(b).toFixed(3) };
    }
    console.log(TAG + ' hitboxes ' + Object.entries(hitboxes).map(([k, v]) => k + ':' + v[1]).join(' ') + '; chest y ' + yc.toFixed(2) + ' chin ' + chinY.toFixed(2));
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
      'sternum (front)': [[0, s3.y, 6], [0, 0, -1]], 'gut (front)': [[0, BP('spine_01').y + 0.1, 6], [0, 0, -1]], 'shoulder (front)': [[0.2, chinY + 0.02, 6], [0, 0, -1]],
    };
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
    console.log(TAG + ' head capsule first-hit share from a 1.7 m eye at 4 m: front ' + headShare(4) + ' %, behind ' + headShare(-4) + ' %');
    console.log(TAG + ' first capsule hit: ' + Object.entries(tests).map(([k, [o, d]]) => k + ' -> ' + first(new THREE.Vector3(...o), new THREE.Vector3(...d))).join('; '));
  }

  // Pose offsets (local euler deg, added after every clip): the face pitched up a little so it stays readable under
  // the helmet brim from a player's eye height in the hunched clips; the head lolled to one side; the right shoulder
  // (the bitten arm) dropped; the hands half-closed.
  const poseOffsets = { neck_01: [-9, 0, 0], head: [-7, 0, 9], clavicle_r: [0, 0, 7], clavicle_l: [0, 0, -3] };
  for (const s of ['l', 'r']) for (const f of ['index', 'middle', 'ring', 'pinky']) Object.assign(poseOffsets, { [`${f}_01_${s}`]: [28, 0, 0], [`${f}_02_${s}`]: [34, 0, 0], [`${f}_03_${s}`]: [24, 0, 0] });
  // Per-clip OVERRIDES (the game cross-fades them with the clips): in the shambles, the idle and the run the spine is
  // partly straightened - a man in 15 kg of armour plods upright, chest plate (POLICE, bullet strikes) square to
  // the player instead of hanging face-down like a walker - so the neck / head need less lift. Attacks, crawls,
  // falls and deaths keep the plain set (a straightened spine would arch a corpse through the floor).
  const upright = { spine_01: [-6, 0, 0], spine_02: [-8, 0, 0], spine_03: [-4, 0, 0], neck_01: [-4, 0, 0], head: [-3, 0, 9] };
  const poseOffsetsByClip = Object.fromEntries(['walk_a', 'walk_b', 'walk_c', 'walk_limp', 'idle', 'idle_b', 'run', 'sprint'].map((c) => [c, upright]));
  // walk_a is the deepest shamble of the library (the head hangs at chest height): straightened further
  poseOffsetsByClip.walk_a = { spine_01: [-10, 0, 0], spine_02: [-12, 0, 0], spine_03: [-7, 0, 0], neck_01: [-8, 0, 0], head: [-5, 0, 9] };
  TR.report();
  return {
    human: h, parts, budget: 9000, partBudget: { uniform: 1480, boots: 640, teeth: 230 },
    extras: { poseOffsets, poseOffsetsByClip, hitboxes, capsules, height: +top.toFixed(3), archetype: 'riot', gender: 'male', variant: 'infected riot officer: helmet with a cracked, broken-out visor, ballistic vest with a trauma plate, shoulder / forearm / shin guards' },
    lod1: { budget: 2500, drop: ['teeth', 'eyes'], texScale: 0.5, partBudget: { body: 660, uniform: 400, boots: 120, vest: 330, guards: 640, helmet: 180, visor: 40 } },
  };
}
