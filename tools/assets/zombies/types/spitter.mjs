// spitter — 酸液噴吐者 Spitter (game/src/zombies/defs.js `spitter`, ranged acid special). A wasted, hunched woman
// (~1.69 m rest height, gaunt, long neck, long bony fingers) who walked out of a hospital ward: her jaw hangs
// unhinged in a tall gape (a 17° extra rotation of the mandible about the TMJ on top of the open-mouth expression,
// dislocated down/forward, the mouth corners split ~3.5 cm back along the cheeks towards the ears: raw gashes with
// swollen rims), and hanging straight from the underside of the jaw a pendulous, bilobed THROAT SAC (sculpted on the
// base mesh, up to ~8.7 cm proud, refined twice) — stretched thin, glossy, striae, a black-green vein web, pustules —
// with the acid shining through it (emissive, the read that tells her apart at 15-25 m). Inside the gape: wet dark-red
// lips, a near-black throat (seven elliptical rings, no corner fans) with an acid-green glow only deep down, a livid
// tongue on the floor of the mouth, the upper and lower teeth rows (gums gone).
// Sickly yellow-green / jaundiced skin with grey-violet livor, green-black veins; acid burns: the drool tracks eaten
// from the lower lip down the chin and over the sac (wet yellow-green chemical burn, orange-brown inflamed edges),
// splash burns on the forearms, a cheek, the right collarbone, a thigh and a shin; burnt fingers. Hair: the CC0
// ponytail01 — greasy ash-brown hair scraped back into a lank tail (cut short, gathered), thinned in strand-shaped gaps
// (not holes) over a scalp painted hair-root grey, an acid-burnt raw patch over the right temple. Two strings of
// glowing acid drool hang off the lower lip. Jaundiced eyes with a clouded acid-green iris (faint glow).
// Hospital details: the gown, an ID band on the left wrist, an IV cannula taped on the back of the right hand (its cut
// line up the wrist, bruised round it), ECG electrode pads on the chest. Bare, filthy feet.
// The gown: the CC0 female_elegantsuit01 (blouse + pencil skirt) turned into ONE straight hospital shift — collar
// removed, every torso / skirt vertex pushed out to the concave hull of the radius profile per 10 deg sector (bust /
// blades -> hips -> flared hem: no waist, no darts), the blouse's hem resting on the skirt (its waistband roll removed),
// tailoring flattened out of the normal / AO maps; repainted as washed-out teal cotton with a faded 3.5 cm snowflake /
// diamond print and a darker sewn hem band; the open back of a hospital gown from the nape to the hem (a gap between
// the blades narrowing down the back, the flaps' painted overlap over the seat, split again at the hem) with three
// cotton ties (knots + hanging strings); the skirt one loose tube in its skinning (pelvis -> both thighs, <= 0.4
// each, all _seg 0); the right sleeve hemmed short, the left torn off high, a ragged hem with a tongue torn up the right
// thigh, acid holes eaten through the front with scorched rims (skin kept under them), bile vomited down the front,
// grime and dried blood. Silhouette: shoulders rolled forward, the neck craned with the head pitched back so it juts
// over the sac, the right forearm clutched to the chest, fingers hooked (poseOffsets; see the posture block for why
// the spine stays nearly straight, and poseOffsetsUpright for a game that blends offsets by state).
//
// Everything specific to this character lives in this file; the shared lib is only imported (UV raster, blur,
// normal-from-height, rig segments, hitbox measure, albedo tracer). Implemented here: the jaw sculpt driven by the
// CC0 MPFB2 default rig's mandible vertex groups (weights.default.json: jaw / special04 / oris01 / oris07 / tongue),
// the sac sculpt on the base mesh (h.pos + h.dm kept in sync, so the proxy and the gown fit over it), proxy
// refinement of the sac and the stretched lower face, the gown conversion (UV-island garment pieces, flare, cut fields
// with frayed edges, face deletion, UV repack), ray-cast skin coverage under the cut gown, the skin composite (CC0
// middle-aged female skin's detail over our own palette) and all painting, the emissive maps, the gore cavity sealed
// to the gaping lip loop (the proxy's lip-bridging flap removed first), the tongue, the drool tubes (draped over the
// chin / sac by a slope envelope), the wristband, the gown ties, gum removal from teeth_base (its gums were bound to
// both teeth helpers and stretched across the gape), ray-traced AO + alpha-aware gown shadow (ORM occlusion only),
// a 16-tri glowing cone standing in for the cavity at LOD1.
//
// Albedo (in-game read; tools/assets/zombies/albedo.mjs): skin ~110 overall (face ~117, arms ~120-125, sac ~153),
// gown ~118, hair ~63. No AO / contact shadow is multiplied into any base colour: it all goes to the ORM occlusion.
import fs from 'node:fs';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { rasterUV, texelSurface, texelAttr } from '../lib/raster.mjs';
import { blurField, createImage, normalFromHeight } from '../lib/image.mjs';
import { boneSegment } from '../lib/rig.mjs';
import { computeHitboxes } from '../lib/export.mjs';
import { albedoTracer } from '../lib/albedoTrace.mjs';

// ---------- colour / vector helpers (linear-light work, sRGB 8-bit storage)
const S2L = new Float32Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const toByte = (x) => { x = Math.max(0, x); const s = x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(s * 255))); };
const lin = (rgb) => rgb.map((v) => S2L[v]);
const lumOf = (c) => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ss = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const over = (c, col, a) => { if (!(a > 0)) return; a = Math.min(1, a); for (let k = 0; k < 3; k++) c[k] += (col[k] - c[k]) * a; };
const mul = (c, col, a) => { if (!(a > 0)) return; a = Math.min(1, a); for (let k = 0; k < 3; k++) c[k] *= 1 + (col[k] - 1) * a; };
const kmul = (c, k) => { c[0] *= k; c[1] *= k; c[2] *= k; };
const hash = (i) => { let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
const texSize = (s) => Math.max(64, Math.round(s * +(process.env.ZOMBIE_TEX_SCALE || 1)));
const TAG = '  spitter:';
const JAW_DEG = 17, JAW_DROP = 0.008, JAW_FWD = 0.006;

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

// ---------- geometry helpers

/** Closest point on a bone's head->tail segment: {t (0 head .. 1 tail, unclamped), d (distance), a (axis point), L}. */
function boneSeg(bone) {
  const a = [bone.head.x, bone.head.y, bone.head.z], b = [bone.tail.x, bone.tail.y, bone.tail.z];
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  const L = Math.sqrt(dd);
  return (P) => {
    const t = ((P[0] - a[0]) * d[0] + (P[1] - a[1]) * d[1] + (P[2] - a[2]) * d[2]) / dd;
    const tc = clamp01(t);
    const ax = [a[0] + d[0] * tc, a[1] + d[1] * tc, a[2] + d[2] * tc];
    return { t, d: Math.hypot(P[0] - ax[0], P[1] - ax[1], P[2] - ax[2]), a: ax, L };
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

/** Ordered boundary loops (open edges) of a part's kept faces. */
function boundaryLoops(part) {
  const F = part.obj.faces, cnt = new Map(), next = new Map();
  const key = (a, b) => (a < b ? a * 4194304 + b : b * 4194304 + a);
  const each = (fn) => F.forEach((f, fi) => { if (part.keep[fi]) for (let k = 0; k < f.v.length; k++) fn(f.v[k], f.v[(k + 1) % f.v.length]); });
  each((a, b) => cnt.set(key(a, b), (cnt.get(key(a, b)) || 0) + 1));
  each((a, b) => { if (cnt.get(key(a, b)) === 1) next.set(a, b); });
  const loops = [], seen = new Set();
  for (const s of next.keys()) {
    if (seen.has(s)) continue;
    const loop = [];
    for (let v = s; v !== undefined && !seen.has(v); v = next.get(v)) { seen.add(v); loop.push(v); }
    if (loop.length > 2) loops.push(loop);
  }
  return loops;
}

/** BVH over the kept triangles of several surfaces [{pos, tris}] (tris = Part.tris() layout). */
function occluders(list) {
  let n = 0;
  for (const s of list) n += s.tris.length / 6;
  const arr = new Float32Array(n * 9);
  let o = 0;
  for (const { pos, tris } of list) for (let i = 0; i < tris.length; i += 2) { const v = tris[i] * 3; arr[o++] = pos[v]; arr[o++] = pos[v + 1]; arr[o++] = pos[v + 2]; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  return new MeshBVH(g);
}

/** Signed distance of p to a closed surface BVH (negative inside; outward normals from the triangle winding). */
function signedDist(bvh, p) {
  const hit = bvh.closestPointToPoint(new THREE.Vector3(p[0], p[1], p[2]));
  if (!hit) return 1;
  const g = bvh.geometry, pos = g.attributes.position, idx = g.index;
  const v = [0, 1, 2].map((k) => { const j = idx ? idx.getX(hit.faceIndex * 3 + k) : hit.faceIndex * 3 + k; return [pos.getX(j), pos.getY(j), pos.getZ(j)]; });
  const n = norm(cross(sub(v[1], v[0]), sub(v[2], v[0])));
  return Math.sign(dot(sub(p, [hit.point.x, hit.point.y, hit.point.z]), n) || 1) * hit.distance;
}

/** fn(P, N, i) for every texel of a UV raster at resolution R, blurred by `blur` texels; outside islands = fill. */
function bakeField(surf, uvs, R, fn, { fill = 1, blur = 1 } = {}) {
  const r = rasterUV(surf.tris, uvs, R, 4);
  const out = new Float32Array(R * R).fill(fill);
  const P = [0, 0, 0], Nn = [0, 0, 0];
  for (let i = 0; i < R * R; i++) if (texelSurface(r, surf.tris, surf.pos, surf.nrm, i, P, Nn)) out[i] = fn(P, Nn, i);
  return blur ? blurField(out, R, R, blur, 1) : out;
}

/** Cosine-weighted hemisphere directions (z up). */
function hemiDirs(rays) {
  const dirs = [];
  for (let k = 0; k < rays; k++) {
    const u = (k + 0.5) / rays;
    let v = 0, f = 0.5, m = k + 1;
    while (m) { v += f * (m & 1); m >>= 1; f *= 0.5; }
    const s = Math.sqrt(u);
    dirs.push([s * Math.cos(2 * Math.PI * v), s * Math.sin(2 * Math.PI * v), Math.sqrt(1 - u)]);
  }
  return dirs;
}

/**
 * Ray-traced occlusion (cosine-weighted, distance-attenuated) against a BVH. `opaque(hit)` (optional) lets rays pass
 * through cut-away cloth (up to 3 layers), so skin seen through a torn hole is dark at its rim, lighter in its middle.
 */
function occTracer(bvh, { rays = 16, maxDist = 0.1, opaque = null, seed = 0 } = {}) {
  const dirs = hemiDirs(rays);
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

/** Multiplies the occlusion (R) channel of an ORM image by fn(...values) of fields baked at R x R (never the albedo). */
function applyOcclusion(orm, fields, R, fn) {
  const W = orm.width, vals = new Array(fields.length);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    for (let k = 0; k < fields.length; k++) vals[k] = fieldAt(fields[k], R, W, x, y);
    const i = (y * W + x) * 4;
    orm.data[i] = Math.round(orm.data[i] * clamp01(fn(...vals)));
  }
  return orm;
}

/** Pull-push fill: every texel outside `mask` takes a smooth multi-scale average of the surrounding island colours. */
function pullPush(img, mask, { raw = false } = {}) {
  const W = img.width, H = img.height;
  const lv = [];
  {
    const c = new Float32Array(W * H * 3), w = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) if (mask[i]) { w[i] = 1; for (let k = 0; k < 3; k++) c[i * 3 + k] = raw ? img.data[i * 4 + k] / 255 : S2L[img.data[i * 4 + k]]; }
    lv.push({ W, H, c, w });
  }
  while (lv.at(-1).W > 1 && lv.at(-1).H > 1) {
    const p = lv.at(-1), w2 = p.W >> 1, h2 = p.H >> 1;
    const c = new Float32Array(w2 * h2 * 3), w = new Float32Array(w2 * h2);
    for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
      let sw = 0, s0 = 0, s1 = 0, s2 = 0;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const j = (y * 2 + dy) * p.W + x * 2 + dx, q = p.w[j];
        if (!(q > 0)) continue;
        sw += q; s0 += p.c[j * 3] * q; s1 += p.c[j * 3 + 1] * q; s2 += p.c[j * 3 + 2] * q;
      }
      const o = y * w2 + x;
      if (sw > 0) { c[o * 3] = s0 / sw; c[o * 3 + 1] = s1 / sw; c[o * 3 + 2] = s2 / sw; }
      w[o] = Math.min(1, sw);
    }
    lv.push({ W: w2, H: h2, c, w });
  }
  for (let l = lv.length - 2; l >= 0; l--) {
    const f = lv[l], g = lv[l + 1];
    for (let y = 0; y < f.H; y++) for (let x = 0; x < f.W; x++) {
      const o = y * f.W + x, a = f.w[o];
      if (a >= 1) continue;
      const gx = Math.max(0, Math.min(g.W - 1.001, (x + 0.5) / 2 - 0.5)), gy = Math.max(0, Math.min(g.H - 1.001, (y + 0.5) / 2 - 0.5));
      const x0 = Math.min(g.W - 1, Math.floor(gx)), y0 = Math.min(g.H - 1, Math.floor(gy)), x1 = Math.min(g.W - 1, x0 + 1), y1 = Math.min(g.H - 1, y0 + 1);
      const tx = gx - x0, ty = gy - y0;
      for (let k = 0; k < 3; k++) {
        const up = (g.c[(y0 * g.W + x0) * 3 + k] * (1 - tx) + g.c[(y0 * g.W + x1) * 3 + k] * tx) * (1 - ty) + (g.c[(y1 * g.W + x0) * 3 + k] * (1 - tx) + g.c[(y1 * g.W + x1) * 3 + k] * tx) * ty;
        f.c[o * 3 + k] = f.c[o * 3 + k] * a + up * (1 - a);
      }
    }
  }
  const c0 = lv[0].c;
  for (let i = 0; i < W * H; i++) if (!mask[i]) for (let k = 0; k < 3; k++) img.data[i * 4 + k] = raw ? Math.max(0, Math.min(255, Math.round(c0[i * 3 + k] * 255))) : toByte(c0[i * 3 + k]);
  return img;
}

/** Pushes colours `passes` texels out of the islands (mask == 1) into the empty texels; returns the grown mask. */
function dilate(img, mask, passes) {
  const W = img.width, H = img.height, d = img.data;
  let m = mask.slice();
  for (let p = 0; p < passes; p++) {
    const next = m.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (m[i]) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
        if (j < 0 || !m[j]) continue;
        r += d[j * 4]; g += d[j * 4 + 1]; b += d[j * 4 + 2]; n++;
      }
      if (!n) continue;
      d[i * 4] = r / n; d[i * 4 + 1] = g / n; d[i * 4 + 2] = b / n;
      next[i] = 1;
    }
    m = next;
  }
  return m;
}

// ---------- custom geometry -> skinned Part
class Geo {
  constructor() { this.P = []; this.UV = []; this.F = []; this.W = []; }
  v(p, uv, w = null) { this.P.push(p[0], p[1], p[2]); this.UV.push(uv[0], uv[1]); this.W.push(w); return this.P.length / 3 - 1; }
  tri(a, b, c) { this.F.push({ v: [a, b, c], t: [a, b, c], g: 0 }); }
  quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }
  get n() { return this.P.length / 3; }
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

/** Barycentric weights of the point on triangle (a, b, c) (offsets into pos) closest to p (Ericson). */
function closestBary(p, pos, a, b, c) {
  const abx = pos[b] - pos[a], aby = pos[b + 1] - pos[a + 1], abz = pos[b + 2] - pos[a + 2];
  const acx = pos[c] - pos[a], acy = pos[c + 1] - pos[a + 1], acz = pos[c + 2] - pos[a + 2];
  const apx = p[0] - pos[a], apy = p[1] - pos[a + 1], apz = p[2] - pos[a + 2];
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return [1, 0, 0];
  const bpx = p[0] - pos[b], bpy = p[1] - pos[b + 1], bpz = p[2] - pos[b + 2];
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return [0, 1, 0];
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [1 - v, v, 0]; }
  const cpx = p[0] - pos[c], cpy = p[1] - pos[c + 1], cpz = p[2] - pos[c + 2];
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return [0, 0, 1];
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [1 - w, 0, w]; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return [0, 1 - w, w]; }
  const den = 1 / (va + vb + vc);
  const v = vb * den, w = vc * den;
  return [1 - v - w, v, w];
}

/**
 * Red-green refinement of a proxy Part inside `zone` (position predicate): every triangle fully inside is split into 4,
 * its neighbours into 2-3 (no T-junctions). New vertices are projected onto the high-resolution (sculpted) base mesh,
 * keeping the proxy's local offset from it, and bound to the base triangle they land on, so they morph, skin and get
 * `_seg` like every other vertex. Returns a new Part.
 */
function refineSurface(lib, h, part, zone) {
  const obj = part.obj, pos = part.pos, n0 = pos.length / 3;
  const Pv = (v) => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
  const inR = new Uint8Array(n0);
  for (let v = 0; v < n0; v++) inR[v] = zone(Pv(v)) ? 1 : 0;
  const hp = h.pos, bodyG = h.baseObj.groupIndex.get('body');
  const bt = [];
  for (const f of h.baseObj.faces) {
    if (f.g !== bodyG || !f.v.every((v) => zone([hp[v * 3], hp[v * 3 + 1], hp[v * 3 + 2]], 0.03))) continue;
    for (let k = 1; k + 1 < f.v.length; k++) bt.push(f.v[0], f.v[k], f.v[k + 1]);
  }
  const project = (p) => {
    let best = Infinity, out = null;
    for (let i = 0; i < bt.length; i += 3) {
      const a = bt[i] * 3, b = bt[i + 1] * 3, c = bt[i + 2] * 3;
      const dx = hp[a] - p[0], dy = hp[a + 1] - p[1], dz = hp[a + 2] - p[2];
      if (dx * dx + dy * dy + dz * dz > 0.0009 + best) continue;
      const w = closestBary(p, hp, a, b, c);
      const q = [0, 1, 2].map((k) => hp[a + k] * w[0] + hp[b + k] * w[1] + hp[c + k] * w[2]);
      const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2;
      if (d < best) { best = d; out = { q, tri: [bt[i], bt[i + 1], bt[i + 2]], w }; }
    }
    return out;
  };
  const tris = [];
  obj.faces.forEach((f, fi) => {
    if (!part.keep[fi]) return;
    for (let k = 1; k + 1 < f.v.length; k++) tris.push({ v: [f.v[0], f.v[k], f.v[k + 1]], t: [f.t[0], f.t[k], f.t[k + 1]], g: f.g });
  });
  const ek = (a, b) => (a < b ? a * 1e6 + b : b * 1e6 + a);
  const split = new Set();
  for (const t of tris) if (inR[t.v[0]] && inR[t.v[1]] && inR[t.v[2]]) for (let k = 0; k < 3; k++) split.add(ek(t.v[k], t.v[(k + 1) % 3]));
  const newPos = Array.from(pos), refIdx = Array.from(part.refIdx), refW = Array.from(part.refW);
  const off = new Map();
  const offsetOf = (v) => {
    if (!off.has(v)) { const p = Pv(v), pr = project(p); off.set(v, pr ? sub(p, pr.q) : [0, 0, 0]); }
    return off.get(v);
  };
  const midV = new Map();
  for (const e of split) {
    const a = Math.floor(e / 1e6), b = e - a * 1e6;
    const m = scl(add(Pv(a), Pv(b)), 0.5);
    const pr = project(m);
    const idx = newPos.length / 3;
    if (pr) {
      const oa = offsetOf(a), ob = offsetOf(b);
      newPos.push(pr.q[0] + (oa[0] + ob[0]) / 2, pr.q[1] + (oa[1] + ob[1]) / 2, pr.q[2] + (oa[2] + ob[2]) / 2);
      refIdx.push(...pr.tri); refW.push(...pr.w);
    } else {
      newPos.push(...m);
      refIdx.push(part.refIdx[a * 3], part.refIdx[b * 3], part.refIdx[a * 3 + 1]); refW.push(0.5, 0.5, 0);
    }
    midV.set(e, idx);
  }
  const uvs = Array.from(obj.uvs), midT = new Map();
  const uvMid = (ta, tb) => {
    if (ta < 0 || tb < 0) return -1;
    const key = ta < tb ? ta * 1e6 + tb : tb * 1e6 + ta;
    if (!midT.has(key)) { midT.set(key, uvs.length / 2); uvs.push((uvs[ta * 2] + uvs[tb * 2]) / 2, (uvs[ta * 2 + 1] + uvs[tb * 2 + 1]) / 2); }
    return midT.get(key);
  };
  const faces = [];
  for (const t of tris) {
    const sp = [0, 1, 2].map((k) => split.has(ek(t.v[k], t.v[(k + 1) % 3])));
    const n = sp.filter(Boolean).length;
    if (!n) { faces.push(t); continue; }
    const r = n === 1 ? sp.indexOf(true) : n === 2 ? (sp.indexOf(false) + 1) % 3 : 0;
    const V = [0, 1, 2].map((k) => t.v[(k + r) % 3]), T = [0, 1, 2].map((k) => t.t[(k + r) % 3]);
    const M = (k) => midV.get(ek(V[k], V[(k + 1) % 3])), MT = (k) => uvMid(T[k], T[(k + 1) % 3]);
    const F = (v, tt) => faces.push({ v, t: tt, g: t.g });
    if (n === 1) {
      F([V[0], M(0), V[2]], [T[0], MT(0), T[2]]); F([M(0), V[1], V[2]], [MT(0), T[1], T[2]]);
    } else if (n === 2) {
      F([M(0), V[1], M(1)], [MT(0), T[1], MT(1)]); F([V[0], M(0), M(1)], [T[0], MT(0), MT(1)]); F([V[0], M(1), V[2]], [T[0], MT(1), T[2]]);
    } else {
      F([V[0], M(0), M(2)], [T[0], MT(0), MT(2)]); F([M(0), V[1], M(1)], [MT(0), T[1], MT(1)]);
      F([M(2), M(1), V[2]], [MT(2), MT(1), T[2]]); F([M(0), M(1), M(2)], [MT(0), MT(1), MT(2)]);
    }
  }
  const nobj = { ...obj, uvs: Float32Array.from(uvs), faces, positions: null };
  const out = new lib.Part({ name: part.name, role: part.role, obj: nobj, pos: Float32Array.from(newPos), refIdx: Int32Array.from(refIdx), refW: Float32Array.from(refW) });
  out.bindWeights(h.weights, h.skeleton.bones);
  out.asset = part.asset; out.binding = part.binding; out.deleteVerts = part.deleteVerts;
  console.log(`${TAG} refined ${part.name}: ${tris.length} -> ${faces.length} tris (${split.size} new verts)`);
  return out;
}

/**
 * Sculpts the 'body' vertices of the morphed base mesh in place: fn(P metres, N outward normal, v) -> displacement
 * (metres) or null. h.pos and h.dm stay in sync, so every proxy / garment fitted afterwards follows the new shape. The
 * joint helper cubes are not touched (the skeleton built on the unsculpted mesh stays valid: the sculpt is local).
 */
function sculptBase(h, fn) {
  const nrm = h.basePart({ name: 'sculpt' }).normals();
  const o = h.origin;
  let moved = 0, maxD = 0;
  const upd = [];
  for (const v of h.baseObj.groupVerts('body')) {
    const P = [h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]];
    const d = fn(P, [nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]], v);
    if (!d) continue;
    const l = Math.hypot(d[0], d[1], d[2]);
    if (l < 1e-6) continue;
    upd.push([v, d]);
    moved++; maxD = Math.max(maxD, l);
  }
  for (const [v, d] of upd) for (let k = 0; k < 3; k++) { h.pos[v * 3 + k] += d[k]; h.dm[v * 3 + k] = h.pos[v * 3 + k] * 10 + o[k]; }
  return { moved, maxD };
}

/** Removes individual teeth (connected components) nearest to the given x on the upper/lower row (front). */
function pullTeeth(teeth, picks) {
  const n = teeth.nVerts;
  const par = new Int32Array(n).map((_, i) => i);
  const find = (x) => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
  teeth.obj.faces.forEach((f) => { for (let k = 1; k < f.v.length; k++) par[find(f.v[k])] = find(f.v[0]); });
  const comps = new Map();
  for (let i = 0; i < n; i++) { const r = find(i); if (!comps.has(r)) comps.set(r, []); comps.get(r).push(i); }
  const list = [...comps.values()].filter((vs) => vs.length < 400).map((vs) => {
    const c = [0, 0, 0];
    for (const v of vs) for (let k = 0; k < 3; k++) c[k] += teeth.pos[v * 3 + k] / vs.length;
    return { vs, c };
  });
  if (!list.length) return 0;
  const midY = list.reduce((a, t) => a + t.c[1], 0) / list.length;
  const gone = new Set();
  for (const [x, row] of picks) {
    let best = null, bd = 1e9;
    for (const t of list) {
      if ((row === 'up') !== (t.c[1] > midY)) continue;
      const d = Math.abs(t.c[0] - x) - t.c[2] * 0.2;
      if (d < bd) { bd = d; best = t; }
    }
    if (best) best.vs.forEach((v) => gone.add(v));
  }
  let removed = 0;
  teeth.obj.faces.forEach((f, fi) => { if (teeth.keep[fi] && f.v.every((v) => gone.has(v))) { teeth.keep[fi] = 0; removed++; } });
  return removed;
}

/**
 * Removes the whole lower row (every tooth component below the middle of the two rows): rotated with the unhinged
 * jaw and stripped of its gums it sat in the gape as a loose, faceted chunk; the tongue lies on the cavity floor now.
 */
function dropLowerTeeth(teeth) {
  // two-means on the face centroid heights splits the rows (each row is one connected piece in teeth_base)
  const F = teeth.obj.faces, cy = new Float32Array(F.length);
  const idx = [];
  F.forEach((f, fi) => { if (teeth.keep[fi]) { cy[fi] = f.v.reduce((a, v) => a + teeth.pos[v * 3 + 1], 0) / f.v.length; idx.push(fi); } });
  if (idx.length < 4) return 0;
  let lo = Math.min(...idx.map((i) => cy[i])), hi = Math.max(...idx.map((i) => cy[i]));
  for (let it = 0; it < 20; it++) {
    const m = (lo + hi) / 2;
    let sl = 0, nl = 0, sh = 0, nh = 0;
    for (const i of idx) if (cy[i] < m) { sl += cy[i]; nl++; } else { sh += cy[i]; nh++; }
    lo = nl ? sl / nl : lo; hi = nh ? sh / nh : hi;
  }
  const cut = (lo + hi) / 2;
  let removed = 0;
  for (const fi of idx) if (cy[fi] < cut) { teeth.keep[fi] = 0; removed++; }
  return removed;
}

/**
 * Repacks the UV islands of a Part's kept faces into the unit square (one uniform scale, shelf packing, no rotation,
 * `pad` UV units of gutter) so the texture is not spent on deleted faces. Rewrites the UVs in place. Returns
 * { s, boxes, islandAt(u, vImg), remap(img, bg) } where remap resamples an image painted in the old layout.
 */
function repackUV(part, { pad = 8 / 2048, fill = [128, 128, 128, 255] } = {}) {
  const F = part.obj.faces, uv = part.obj.uvs;
  const isl = uvIslands(part);
  const byId = new Map();
  F.forEach((f, fi) => {
    if (!part.keep[fi]) return;
    let b = byId.get(isl[fi]);
    if (!b) byId.set(isl[fi], b = { id: isl[fi], x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9, faces: [] });
    b.faces.push(fi);
    for (const t of f.t) {
      const u = uv[t * 2], v = uv[t * 2 + 1];
      b.x0 = Math.min(b.x0, u); b.x1 = Math.max(b.x1, u); b.y0 = Math.min(b.y0, v); b.y1 = Math.max(b.y1, v);
    }
  });
  const boxes = [...byId.values()].sort((a, b) => (b.y1 - b.y0) - (a.y1 - a.y0));
  const pack = (s) => {
    let x = 0, y = 0, row = 0;
    for (const b of boxes) {
      const w = (b.x1 - b.x0) * s + pad * 2, hh = (b.y1 - b.y0) * s + pad * 2;
      if (w > 1) return false;
      if (x + w > 1) { y += row; x = 0; row = 0; }
      if (y + hh > 1) return false;
      b.ox = x + pad; b.oy = y + pad; b.w = w - pad * 2; b.h = hh - pad * 2;
      x += w; row = Math.max(row, hh);
    }
    return true;
  };
  let lo = 0.25, hi = 4;
  for (let it = 0; it < 32; it++) { const m = (lo + hi) / 2; if (pack(m)) lo = m; else hi = m; }
  const s = lo;
  pack(s);
  const old = uv.slice(), done = new Uint8Array(uv.length / 2);
  for (const b of boxes) for (const fi of b.faces) for (const t of F[fi].t) {
    if (done[t]) continue;
    done[t] = 1;
    uv[t * 2] = (old[t * 2] - b.x0) * s + b.ox;
    uv[t * 2 + 1] = (old[t * 2 + 1] - b.y0) * s + b.oy;
  }
  const islandAt = (u, vImg) => {
    const v = 1 - vImg;
    for (const b of boxes) if (u >= b.ox - pad && u < b.ox + b.w + pad && v >= b.oy - pad && v < b.oy + b.h + pad) return b;
    return null;
  };
  const remap = (img, bg = fill) => {
    const W = img.width, H = img.height, out = createImage(W, H, bg), d = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const b = islandAt((x + 0.5) / W, (y + 0.5) / H);
      if (!b) continue;
      const uo = ((x + 0.5) / W - b.ox) / s + b.x0, vo = (1 - (y + 0.5) / H - b.oy) / s + b.y0;
      const fx = Math.max(0, Math.min(W - 1.001, uo * W - 0.5)), fy = Math.max(0, Math.min(H - 1.001, (1 - vo) * H - 0.5));
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const i00 = (y0 * W + x0) * 4, i10 = i00 + 4, i01 = i00 + W * 4, i11 = i01 + 4, o = (y * W + x) * 4;
      for (let k = 0; k < 4; k++) out.data[o + k] = Math.round((d[i00 + k] * (1 - tx) + d[i10 + k] * tx) * (1 - ty) + (d[i01 + k] * (1 - tx) + d[i11 + k] * tx) * ty);
    }
    return out;
  };
  return { s, boxes, islandAt, remap };
}

/**
 * Concavity of a triangle mesh per vertex, normalised so ~1 = strong: `fine` = umbrella Laplacian along the normal
 * (1-ring creases), `broad` = offset to a heavily smoothed copy (folds a few cm wide). Positive = concave.
 */
function cavityFields(tris, pos, nrm) {
  const n = pos.length / 3;
  const used = new Uint8Array(n);
  const edges = [];
  for (let i = 0; i < tris.length; i += 6) {
    const v = [tris[i], tris[i + 2], tris[i + 4]];
    for (let k = 0; k < 3; k++) { edges.push(v[k], v[(k + 1) % 3]); used[v[k]] = 1; }
  }
  const smoothPos = (src) => {
    const acc = new Float32Array(n * 3), cnt = new Float32Array(n);
    for (let e = 0; e < edges.length; e += 2) {
      const a = edges[e], b = edges[e + 1];
      for (let j = 0; j < 3; j++) { acc[a * 3 + j] += src[b * 3 + j]; acc[b * 3 + j] += src[a * 3 + j]; }
      cnt[a]++; cnt[b]++;
    }
    for (let v = 0; v < n; v++) if (cnt[v]) for (let j = 0; j < 3; j++) acc[v * 3 + j] /= cnt[v]; else for (let j = 0; j < 3; j++) acc[v * 3 + j] = src[v * 3 + j];
    return acc;
  };
  const along = (q) => {
    const out = new Float32Array(n);
    for (let v = 0; v < n; v++) out[v] = used[v] ? (q[v * 3] - pos[v * 3]) * nrm[v * 3] + (q[v * 3 + 1] - pos[v * 3 + 1]) * nrm[v * 3 + 1] + (q[v * 3 + 2] - pos[v * 3 + 2]) * nrm[v * 3 + 2] : 0;
    return out;
  };
  const normz = (a) => {
    const vals = [];
    for (let v = 0; v < n; v++) if (used[v] && a[v] > 0) vals.push(a[v]);
    vals.sort((x, y) => x - y);
    const p = vals[Math.floor(vals.length * 0.92)] || 1;
    for (let v = 0; v < n; v++) a[v] /= p;
    return a;
  };
  const fine = normz(along(smoothPos(pos)));
  let q = pos;
  for (let it = 0; it < 14; it++) q = smoothPos(q);
  const broad = normz(along(q));
  return { fine, broad };
}

/**
 * Oral cavity sealed to the (tall, gaping) lip boundary loop of the body proxy: the rim tucked just behind the lip
 * edge, ballooning back and down into the throat and closing deep in it, every ring vertex kept >= 2.5 mm inside the
 * head / neck surface; plus caps behind the eyelid openings and a tongue. UV u: 0.03 (lip rim) .. 0.39 (throat);
 * tongue 0.40..0.46; eye caps u = 0.48. Returns { g, lip, lipLow, lipUp, corners [left, right], rings, eyeCaps }.
 */
function mouthCavity(h, body, A) {
  const loops = boundaryLoops(body);
  const P = (v) => [body.pos[v * 3], body.pos[v * 3 + 1], body.pos[v * 3 + 2]];
  const cen = (loop) => loop.reduce((a, v) => add(a, scl(P(v), 1 / loop.length)), [0, 0, 0]);
  const near = (c, r) => loops.map((l) => [l, dist(cen(l), c)]).filter(([, d]) => d < r).sort((a, b) => a[1] - b[1])[0]?.[0];
  const mouth = near(A.mouth, 0.05), eyes = [near(A.eyeL, 0.03), near(A.eyeR, 0.03)];
  if (!mouth) throw new Error('spitter: mouth boundary loop not found');
  const headBvh = occluders([{ pos: body.pos, tris: body.tris() }]);
  const g = new Geo();
  const wOf = (v) => body.weights[v];
  const inside = (p, axis, minD = 0.0025) => {
    for (let k = 0; k < 16 && signedDist(headBvh, p) > -minD; k++) p = add(axis, scl(sub(p, axis), 0.85));
    return p;
  };
  const Cm = cen(mouth);
  // the gaping opening is wider than the head behind it is deep, so the rings only ever shrink towards the mouth's
  // centre line as they go back (no ring can bulge out through the cheeks); the throat runs down and back. Seven
  // rings (smooth shared-vertex normals, a gradual colour ramp per ring instead of big hard-edged triangles).
  // depth behind the lip vertex, scale about the centre, dy, u (gore atlas: 0.03 lip lining .. 0.39 throat)
  const ringDef = [
    [0.0015, 1, 0, 0.03], [0.008, 1.0, -0.001, 0.06], [0.017, 0.97, -0.002, 0.1], [0.026, 0.88, -0.005, 0.16],
    [0.035, 0.76, -0.008, 0.23], [0.044, 0.62, -0.013, 0.3], [0.053, 0.47, -0.019, 0.35],
  ];
  // Ring 0 follows the lip loop; from ring 2 on every ring is a smooth ellipse (the lip opening's half width / height
  // times the ring scale, at the lip vertex's angle) on a plane behind the front of the lips (never in front of the
  // recessed corners), ring 1 half way between: no fans of long triangles from the corners. Each ring is shrunk as a
  // whole (one factor) until it lies >= 2.5 mm inside the head, so it stays an ellipse.
  const lipPts = mouth.map(P);
  const hwL = Math.max(...lipPts.map((p) => Math.abs(p[0] - Cm[0]))), hhL = Math.max(...lipPts.map((p) => Math.abs(p[1] - Cm[1])));
  const zFront = Math.max(...lipPts.map((p) => p[2]));
  const ang = lipPts.map((p) => Math.atan2((p[1] - Cm[1]) / hhL, (p[0] - Cm[0]) / hwL));
  const shrink = [];
  const rings = ringDef.map(([depth, s, dy, u], ri) => {
    let pts;
    if (ri === 0) pts = lipPts.map((p) => { const r = norm([p[0] - Cm[0], p[1] - Cm[1], 0]); return [p[0] + r[0] * 0.0015, p[1] + r[1] * 0.0015, p[2] - depth]; });
    else {
      const c = [Cm[0], Cm[1] + dy];
      pts = lipPts.map((p, k) => {
        // the roof of the mouth rises behind the upper lip so the upper teeth hang free in the opening
        const roof = (ri <= 2 ? 0.009 : ri === 3 ? 0.007 : ri === 4 ? 0.004 : 0) * Math.max(0, Math.sin(ang[k]));
        const e = [c[0] + Math.cos(ang[k]) * hwL * s, c[1] + Math.sin(ang[k]) * hhL * s + roof];
        const l = [c[0] + (p[0] - Cm[0]) * s, c[1] + (p[1] - Cm[1]) * s + roof];
        const w = ri === 1 ? 0.5 : 1;
        return [mix(l[0], e[0], w), mix(l[1], e[1], w), Math.min(p[2] - depth * 0.45, zFront - depth)];
      });
      // (the two shallow rings sit right behind the lips, where the open mouth makes an inside test meaningless; the
      // deeper ones are shrunk as a whole until at most a few points poke out, those few pulled in individually)
      if (ri >= 3) {
        const cz = pts.reduce((a, q) => a + q[2], 0) / pts.length;
        const axis = [c[0], c[1], cz];
        const at = (q, f) => [axis[0] + (q[0] - axis[0]) * f, axis[1] + (q[1] - axis[1]) * f, q[2]];
        let f = 1;
        for (; f > 0.5; f -= 0.03) if (pts.filter((q) => signedDist(headBvh, at(q, f)) > -0.0025).length <= pts.length * 0.12) break;
        pts = pts.map((q) => inside(at(q, f), [axis[0], axis[1], q[2]]));
        shrink.push(f.toFixed(2));
      }
    }
    return pts.map((q, k) => g.v(q, [u, 0.5], ri < 2 ? wOf(mouth[k]) : [['head', 1]]));
  });
  const apex = g.v(inside([Cm[0], Cm[1] - 0.03, Cm[2] - 0.068], [Cm[0], Cm[1] - 0.025, Cm[2] - 0.06]), [0.39, 0.5], [['head', 0.75], ['neck_01', 0.25]]);
  const L = mouth.length;
  for (let r = 0; r + 1 < rings.length; r++) for (let k = 0; k < L; k++) g.quad(rings[r][k], rings[r][(k + 1) % L], rings[r + 1][(k + 1) % L], rings[r + 1][k]);
  for (let k = 0; k < L; k++) g.tri(rings[rings.length - 1][k], rings[rings.length - 1][(k + 1) % L], apex);
  const eyeCaps = [];
  const addEyeCap = (gg, cap) => {
    const rim = cap.rim.map(([p, w]) => gg.v(p, [0.48, 0.5], w));
    const ci = gg.v(cap.c, [0.48, 0.5], [['head', 1]]);
    for (let k = 0; k < rim.length; k++) gg.tri(ci, rim[k], rim[(k + 1) % rim.length]);
  };
  for (const loop of eyes) {
    if (!loop) continue;
    const cap = { rim: loop.map((v) => [sub(P(v), [0, 0, 0.0025]), wOf(v)]), c: sub(cen(loop), [0, 0, 0.004]) };
    eyeCaps.push(cap);
    addEyeCap(g, cap);
  }
  const lip = mouth.map(P);
  let lipLow = lip[0], lipUp = lip[0], cl = lip[0], cr = lip[0];
  for (const p of lip) {
    if (Math.abs(p[0]) < 0.012 && p[1] < lipLow[1]) lipLow = p;
    if (Math.abs(p[0]) < 0.012 && p[1] > lipUp[1]) lipUp = p;
    if (p[0] > cl[0]) cl = p;
    if (p[0] < cr[0]) cr = p;
  }
  // tongue: a flattened, tapering slab lying on the floor of the cavity (one section per ring, its centre line on the
  // ring's lowest point, sunk a little into it), the tip just behind the lower lip; rigid on the head like the
  // cavity (the jaw has no bone: the gape is baked into the rest mesh). Gore atlas u 0.40..0.46, v across.
  const tongueStart = 1, NS = 8;
  const secs = [];
  for (let ri = tongueStart; ri < rings.length; ri++) {
    const ring = rings[ri].map((id) => [g.P[id * 3], g.P[id * 3 + 1], g.P[id * 3 + 2]]);
    let lo = ring[0];
    for (const p of ring) if (Math.abs(p[0] - Cm[0]) < 0.012 && p[1] < lo[1]) lo = p;
    // half width of the ring a few mm above its floor
    let hw = 0.004;
    for (const p of ring) if (p[1] < lo[1] + 0.008) hw = Math.max(hw, Math.abs(p[0] - Cm[0]));
    secs.push({ lo, hw });
  }
  const tv = [];
  secs.forEach((s, i) => {
    const t = i / (secs.length - 1);
    const w = Math.min(s.hw * 0.72, 0.0165) * (i === 0 ? 0.55 : 1);
    const hh = mix(0.0042, 0.0068, t);
    const cy = s.lo[1] + hh * 0.45, cz = s.lo[2] + (i === 0 ? -0.004 : 0.0015);
    const ids = [];
    for (let k = 0; k <= NS; k++) {
      const a = (k / NS) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      // flat-topped ellipse with a shallow groove down the middle of the upper surface
      const groove = sa > 0 ? 0.0009 * Math.exp(-((ca / 0.3) ** 2)) : 0;
      const y = sa > 0 ? hh * Math.pow(sa, 0.6) - groove : hh * 0.8 * sa;
      ids.push(g.v([Cm[0] + ca * w, cy + y, cz], [0.405 + 0.05 * t, 0.5 + 0.5 * ca * (sa >= 0 ? 0.5 : 1)], [['head', 1]]));
    }
    tv.push(ids);
  });
  for (let i = 0; i + 1 < tv.length; i++) for (let k = 0; k < NS; k++) g.quad(tv[i][k], tv[i + 1][k], tv[i + 1][k + 1], tv[i][k + 1]);
  {
    // rounded tip cap
    const s0 = secs[0], tip = g.v([Cm[0], s0.lo[1] + 0.0035, s0.lo[2] + 0.002], [0.4, 0.5], [['head', 1]]);
    for (let k = 0; k < NS; k++) g.tri(tv[0][k], tv[0][k + 1], tip);
  }
  console.log(`${TAG} mouth loop ${L} verts, ${(dist(lipLow, lipUp) * 100).toFixed(1)} cm tall, ${((cl[0] - cr[0]) * 100).toFixed(1)} cm wide; tongue ${secs.length} sections; deep rings shrunk x${shrink.join("/")}`);
  return { g, lip, lipLow, lipUp, corners: [cl, cr], rings: rings.map((r) => r.map((id) => [g.P[id * 3], g.P[id * 3 + 1], g.P[id * 3 + 2]])), eyeCaps, addEyeCap };
}

/**
 * LOD1 stand-in for the mouth: the lip rim (ring 1 of the cavity, every other vertex) closed by a cone to a point a few
 * cm back, dark at the rim, glowing green at the tip: 16 tris instead of the full cavity. Same gore atlas.
 */
function mouthCap(cavity) {
  const g = new Geo();
  const ring = cavity.rings[1].filter((_, i) => i % 2 === 0);
  const c = ring.reduce((a, p) => add(a, scl(p, 1 / ring.length)), [0, 0, 0]);
  const rim = ring.map((p) => g.v(p, [0.12, 0.5], [['head', 1]]));
  const tip = g.v(add(c, [0, -0.012, -0.035]), [0.36, 0.5], [['head', 1]]);
  for (let k = 0; k < rim.length; k++) g.tri(rim[k], rim[(k + 1) % rim.length], tip);
  // the eye caps stay (LOD1 drops the eyeballs: they close the sockets)
  for (const cap of cavity.eyeCaps) cavity.addEyeCap(g, cap);
  return g;
}

/**
 * Strings of glowing acid drool hanging off the lower lip and the left corner: thin 5-sided tubes that fall in front
 * of the chin and the sac (each point is kept a clearance in front of the face / sac surface under it), thinning out
 * and ending in a swollen drop. Rigid on the head. UV u 0.55 .. 1 along the strand.
 */
function droolStrands(h, lip, A) {
  const bp = h.basePart({ name: 'drool' });
  const bvh = occluders([{ pos: h.pos, tris: bp.tris() }]);
  const ray = new THREE.Ray();
  const frontZ = (x, y) => {
    ray.origin.set(x, y, 0.6); ray.direction.set(0, 0, -1);
    const hit = bvh.raycastFirst(ray, THREE.DoubleSide, 0, 1.2);
    return hit ? hit.point.z : -1;
  };
  const low = lip.filter((p) => Math.abs(p[0]) < 0.02).sort((a, b) => a[1] - b[1]);
  const lc = lip.reduce((a, p) => (p[0] > a[0] ? p : a), lip[0]);
  const defs = [
    { a: low[0], len: 0.07, r0: 0.0014, dx: 0.004 },
    { a: [lc[0] - 0.003, lc[1] - 0.002, lc[2] - 0.002], len: 0.045, r0: 0.0011, dx: 0.006 },
  ];
  const g = new Geo();
  const SIDES = 5, SEG = 10;
  for (const d of defs) {
    // the strand hangs straight down from the lip and drapes over whatever sticks out under it (chin, sac): z of
    // every sample = the upper envelope of (surface in front + clearance) with a 35 % slope, so it bends smoothly
    const xs = [], ys = [], req = [];
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG;
      xs.push(d.a[0] + d.dx * t * t); ys.push(d.a[1] - 0.002 - d.len * t);
      req.push(i === 0 ? d.a[2] + 0.001 : frontZ(xs[i], ys[i]) + 0.0035 + 0.003 * t);
    }
    const pts = [];
    for (let i = 0; i <= SEG; i++) {
      let z = -9;
      for (let j = 0; j <= SEG; j++) z = Math.max(z, req[j] - 0.35 * Math.abs(ys[i] - ys[j]));
      pts.push([xs[i], ys[i], z]);
    }
    const rings = [];
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG;
      const tg = norm(sub(pts[Math.min(SEG, i + 1)], pts[Math.max(0, i - 1)]));
      const s1 = norm(cross(tg, [0, 0, 1])), s2 = cross(s1, tg);
      const r = mix(d.r0, d.r0 * 0.4, ss(0, 0.8, t)) + d.r0 * 1.1 * Math.exp(-(((t - 0.96) / 0.05) ** 2)) + d.r0 * 0.5 * Math.exp(-(((t - 0.45) / 0.06) ** 2));
      const ring = [];
      for (let k = 0; k <= SIDES; k++) {
        const a = (k / SIDES) * Math.PI * 2;
        ring.push(g.v(add(pts[i], add(scl(s1, Math.cos(a) * r), scl(s2, Math.sin(a) * r))), [0.55 + 0.44 * t, k / SIDES]));
      }
      rings.push(ring);
    }
    for (let i = 0; i < SEG; i++) for (let k = 0; k < SIDES; k++) g.quad(rings[i][k], rings[i][k + 1], rings[i + 1][k + 1], rings[i + 1][k]);
    const tip = g.v(add(pts[SEG], [0, -d.r0 * 1.2, 0]), [0.99, 0.5]);
    for (let k = 0; k < SIDES; k++) g.tri(rings[SEG][k + 1], rings[SEG][k], tip);
  }
  return g;
}

/** Hospital ID band round the left forearm just above the wrist (rounded plastic strip, measured on the base mesh). */
function wristband(h, side) {
  const B = h.skeleton.byName['lowerarm_' + side];
  const a0 = B.head.toArray(), a1 = B.tail.toArray(), L = dist(a0, a1), ax = norm(sub(a1, a0));
  const ref = norm(sub([0, 1, 0], scl(ax, ax[1]))), ref2 = cross(ax, ref);
  const tc = 0.86, hw = 0.011 / L;
  const K = 16, R = new Float32Array(K);
  for (const v of h.baseObj.groupVerts('body')) {
    const p = [h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]], q = sub(p, a0), t = dot(q, ax) / L;
    if (t < tc - hw * 2 || t > tc + hw * 2) continue;
    const r = sub(q, scl(ax, t * L)), d = Math.hypot(...r);
    if (d > 0.06) continue;
    const k = ((Math.round(Math.atan2(dot(r, ref2), dot(r, ref)) / (2 * Math.PI) * K) % K) + K) % K;
    for (const dk of [-1, 0, 1]) R[(k + dk + K) % K] = Math.max(R[(k + dk + K) % K], d);
  }
  const g = new Geo();
  const ringsDef = [[tc - hw, 0.0008, 0], [tc - hw * 0.7, 0.0026, 0.15], [tc + hw * 0.7, 0.0026, 0.85], [tc + hw, 0.0008, 1]];
  const rings = ringsDef.map(([t, dr, v]) => {
    const ids = [];
    for (let k = 0; k <= K; k++) {
      const a = (k / K) * Math.PI * 2, r = (R[k % K] || 0.03) + dr;
      ids.push(g.v(add(add(a0, scl(ax, t * L)), add(scl(ref, Math.cos(a) * r), scl(ref2, Math.sin(a) * r))), [k / K * 0.48, v]));
    }
    return ids;
  });
  for (let r = 0; r + 1 < rings.length; r++) for (let k = 0; k < K; k++) g.quad(rings[r][k], rings[r + 1][k], rings[r + 1][k + 1], rings[r][k + 1]);
  return g;
}

/**
 * Tie strings of the gown's open back: at each tie height a small knot over the slit and two cotton strings hanging
 * from it (5-8 cm, ~8 mm wide, splaying a little), draped down the back: every sample is kept 3 mm behind whatever is
 * under it (gown or skin), slope-limited so they hang straight across the gap. Skinned like the nearest base vertex.
 * Gear atlas u 0.5..1 (u along the string, v across).
 */
function tieStrings(h, gownPart, ties, slitX) {
  const bp = h.basePart({ name: 'ties' });
  const bvh = occluders([{ pos: gownPart.pos, tris: gownPart.tris() }, { pos: h.pos, tris: bp.tris() }]);
  const ray = new THREE.Ray();
  const backZ = (x, y) => {
    ray.origin.set(x, y, -0.6); ray.direction.set(0, 0, 1);
    const hit = bvh.raycastFirst(ray, THREE.DoubleSide, 0, 1.2);
    return hit ? hit.point.z : 0;
  };
  const bodyV = [...h.baseObj.groupVerts('body')];
  const near = (p) => {
    let best = -1, bd = 1e9;
    for (const v of bodyV) { const d = (h.pos[v * 3] - p[0]) ** 2 + (h.pos[v * 3 + 1] - p[1]) ** 2 + (h.pos[v * 3 + 2] - p[2]) ** 2; if (d < bd) { bd = d; best = v; } }
    return h.weights[best];
  };
  const g = new Geo();
  const wv = (p, uv) => g.v(p, uv, near(p));
  ties.forEach((ty, ti) => {
    const x0 = slitX(ty), z0 = Math.min(backZ(x0 - 0.02, ty), backZ(x0 + 0.02, ty), backZ(x0, ty)) - 0.004;
    // knot: a squashed 6-sided roll across the slit, ~1.6 cm wide
    const K = 6, rk = [0.0045, 0.0035];
    const ends = [-0.008, 0.008].map((dx) => {
      const ids = [];
      for (let k = 0; k <= K; k++) { const a = (k / K) * Math.PI * 2; ids.push(wv([x0 + dx, ty + Math.cos(a) * rk[0], z0 - 0.002 + Math.sin(a) * rk[1]], [0.52, k / K])); }
      return ids;
    });
    for (let k = 0; k < K; k++) g.quad(ends[0][k], ends[1][k], ends[1][k + 1], ends[0][k + 1]);
    // two strings
    [[-1, 0.075], [1, 0.058]].forEach(([sd, len], si) => {
      const SEG = 6, xs = [], ys = [], req = [];
      for (let i = 0; i <= SEG; i++) {
        const t = i / SEG;
        xs.push(x0 + sd * (0.003 + 0.011 * t * t) + (ti % 2 ? 0.002 : -0.002) * t);
        ys.push(ty - 0.003 - len * t);
        req.push(backZ(xs[i], ys[i]) - 0.003);
      }
      const prev = [];
      for (let i = 0; i <= SEG; i++) {
        let z = 9;
        for (let j = 0; j <= SEG; j++) z = Math.min(z, req[j] + 0.35 * Math.abs(ys[i] - ys[j]));
        z = Math.min(z, z0 - 0.001);
        const t = i / SEG, hw = 0.004 * (1 - 0.25 * t), tw = sd * 0.5 * t; // a slight twist
        const a = wv([xs[i] - hw * Math.cos(tw), ys[i], z - hw * Math.sin(tw)], [0.5 + 0.48 * t + si * 0.01, 0.1]);
        const b = wv([xs[i] + hw * Math.cos(tw), ys[i], z + hw * Math.sin(tw)], [0.5 + 0.48 * t + si * 0.01, 0.9]);
        if (prev.length) g.quad(prev[0], prev[1], b, a);
        prev[0] = a; prev[1] = b;
      }
    });
  });
  return g;
}

/**
 * Gear atlas (256 x 64): u 0..0.48 the wristband (off-white plastic, a printed label with name lines and a barcode,
 * grime, a bile stain); u 0.5..1 the gown's tie strings (the gown's washed-out teal cotton, v across the strip: a
 * darker folded edge, grime towards the ends at u -> 1).
 */
function wristbandTexture() {
  const W = 256, img = createImage(W, 64, [0, 0, 0, 255]);
  const N = { n: (x, y) => Math.sin(x * 12.9898 + y * 78.233) * 43758.5453 % 1 };
  const c = [0, 0, 0];
  for (let y = 0; y < 64; y++) for (let x = 0; x < W; x++) {
    const u0 = (x + 0.5) / W, v = (y + 0.5) / 64, o = (y * W + x) * 4;
    if (u0 >= 0.49) {
      const t = (u0 - 0.5) / 0.5, e = Math.abs(v - 0.5) * 2;
      const b = lin([112, 134, 138]); for (let k = 0; k < 3; k++) c[k] = b[k] * (0.94 + 0.08 * Math.sin(v * 90 + t * 7));
      over(c, lin([84, 104, 112]), ss(0.7, 1, e) * 0.6);
      over(c, lin([104, 98, 82]), ss(0.5, 1, t) * 0.4);
      img.data[o] = toByte(c[0]); img.data[o + 1] = toByte(c[1]); img.data[o + 2] = toByte(c[2]);
      continue;
    }
    const u = u0 / 0.48;
    const b = lin([206, 206, 196]); for (let k = 0; k < 3; k++) c[k] = b[k];
    if (u > 0.08 && u < 0.36 && v > 0.22 && v < 0.78) {
      over(c, lin([236, 236, 230]), 1);
      if ((v > 0.3 && v < 0.36) || (v > 0.42 && v < 0.46 && u < 0.28) || (v > 0.5 && v < 0.54 && u < 0.22)) over(c, lin([40, 40, 44]), 0.8);
      if (v > 0.6 && v < 0.74 && u < 0.3 && Math.sin(u * 900) * Math.sin(u * 377) > 0.1) over(c, lin([30, 30, 32]), 0.85);
    }
    const grime = Math.abs(N.n(Math.floor(u * 40), Math.floor(v * 8)));
    over(c, lin([140, 132, 96]), grime * 0.35 + (1 - Math.abs(v - 0.5) * 2) * 0);
    over(c, lin([150, 146, 70]), u > 0.55 && u < 0.85 ? 0.35 : 0);
    img.data[o] = toByte(c[0]); img.data[o + 1] = toByte(c[1]); img.data[o + 2] = toByte(c[2]);
  }
  return img;
}

/**
 * The garment atlas repainted as hospital-gown cotton: pale, washed-out teal-blue with a small faded diamond-and-dot
 * print laid out in UV space (the elegantsuit's islands share one texel density), fine weave noise. The source's
 * pinstripes are discarded entirely (its fold shading lives in the normal / AO maps).
 */
function hospitalCotton(src, N) {
  const W = src.width, out = createImage(W, W, [0, 0, 0, 255]);
  const base = lin([108, 132, 138]), ink = lin([76, 100, 120]);
  // the classic gown print: a small snowflake / diamond repeat at ~3.5 cm (half-drop), washed out, low contrast
  const P = 0.027;
  const c = [0, 0, 0];
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const u = (x + 0.5) / W, v = (y + 0.5) / W, o = (y * W + x) * 4;
    const n = N.noise(u * 300, v * 300, 4.4) * 0.5 + N.noise(u * 1100, v * 1100, 1.2) * 0.5;
    for (let k = 0; k < 3; k++) c[k] = base[k] * (0.96 + 0.06 * n);
    const gu = u / P, gv = v / P;
    const cell = (a, b) => {
      // snowflake: a small diamond outline, four short arms off its points, a dot in the middle
      const fu = a - Math.floor(a) - 0.5, fv = b - Math.floor(b) - 0.5;
      const m = Math.abs(fu) + Math.abs(fv);
      const outline = (1 - ss(0.13, 0.155, m)) * ss(0.085, 0.11, m);
      const arms = (1 - ss(0.012, 0.024, Math.min(Math.abs(fu), Math.abs(fv)))) * ss(0.15, 0.16, m) * (1 - ss(0.22, 0.25, m));
      const dot = 1 - ss(0.028, 0.045, Math.hypot(fu, fv));
      return Math.max(outline, arms * 0.85, dot * 0.8);
    };
    // half-drop repeat: a second, smaller motif between the snowflakes
    const fu2 = gu + 0.5 - Math.floor(gu + 0.5) - 0.5, fv2 = gv + 0.5 - Math.floor(gv + 0.5) - 0.5;
    const pip = 1 - ss(0.025, 0.045, Math.abs(fu2) + Math.abs(fv2));
    const fade = ss(-0.6, 0.4, N.fbm(u * 18, v * 18, 2.7, 3)) * 0.55 + 0.2;
    over(c, ink, (cell(gu, gv) * 0.62 + pip * 0.4) * fade);
    out.data[o] = toByte(c[0]); out.data[o + 1] = toByte(c[1]); out.data[o + 2] = toByte(c[2]);
  }
  return out;
}

/**
 * Skin albedo composite on the MakeHuman UV layout: the CC0 middle-aged female skin's luminance detail (pores,
 * wrinkles, lips, nails) as a ratio over a sickly yellow-green infected palette (jaundiced and bile-green drifts,
 * grey-violet livor low on the back, darker grey-green extremities), creases / folds from the sculpted mesh (a
 * purple-brown pigment shift; their shadow goes to the ORM via the ray-traced AO), waxy highlights on bony convexities.
 */
async function skinBase(lib, h, S, { N, onSac, eyeY, eyeZ }) {
  const src = await lib.texture('system', 'skins/middleage_caucasian_female/middleage_lightskinned_female_diffuse.png', S);
  const bp = h.basePart({ name: 'composite' });
  const tris = bp.tris(), nrm = bp.normals();
  const r = rasterUV(tris, h.baseObj.uvs, S, 8);
  const B = h.skeleton.byName;
  const n = S * S, Ls = new Float32Array(n), m = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    m[i] = r.covered[i];
    Ls[i] = (S2L[src.data[i * 4]] * 0.2126 + S2L[src.data[i * 4 + 1]] * 0.7152 + S2L[src.data[i * 4 + 2]] * 0.0722) * m[i];
  }
  const rad = Math.max(3, Math.round(S / 96));
  const Lb = blurField(Ls, S, S, rad, 2), mb = blurField(m, S, S, rad, 2);
  const cav = cavityFields(tris, h.pos, nrm);
  const hands = [B.hand_l.head.toArray(), B.hand_r.head.toArray()];
  const P = [0, 0, 0], Nn = [0, 0, 0], c = [0, 0, 0], col = [0, 0, 0];
  const out = lib.cloneImage(src);
  const mask = new Uint8Array(S * S);
  for (let i = 0; i < S * S; i++) {
    const di = i * 4;
    for (let k = 0; k < 3; k++) c[k] = S2L[src.data[di + k]];
    const d = mb[i] > 0.05 && Lb[i] > 1e-4 ? Math.min(1.45, Math.max(0.6, lumOf(c) / (Lb[i] / mb[i]))) ** 1.2 : 1;
    if (r.tri[i] >= 0 && texelSurface(r, tris, h.pos, nrm, i, P, Nn)) {
      mask[i] = 1;
      const n1 = N.fbm(P[0] * 3 + 7, P[1] * 3, P[2] * 3, 3), n2 = N.fbm(P[0] * 4 - 3, P[1] * 4 + 5, P[2] * 4, 3);
      for (let k = 0; k < 3; k++) col[k] = C.skin[k];
      over(col, C.jaundice, ss(-0.1, 0.5, n1) * 0.55);
      over(col, C.bileTone, ss(0.0, 0.5, n2) * 0.5);
      // livor mortis pooled low on the back of the legs / buttocks / lower back, a grey-violet drift elsewhere
      const back = ss(0.2, -0.5, Nn[2]) * ss(1.1, 0.5, P[1]);
      over(col, C.livor, Math.max(back * 0.55, ss(0.1, 0.55, -n1) * 0.3));
      const dh = Math.min(dist(P, hands[0]), dist(P, hands[1]));
      const extr = Math.max(1 - ss(0.06, 0.22, dh), 1 - ss(0.1, 0.45, P[1]));
      over(col, C.extrem, extr * 0.55);
      // face: a grey, waxy yellow; the sac is painted later (paler, stretched)
      const face = ss(B.neck_01.head.y + 0.02, B.neck_01.head.y + 0.1, P[1]) * ss(-0.2, 0.4, Nn[2]);
      mul(col, [1.02, 1.0, 0.92], face * 0.5);
      for (let k = 0; k < 3; k++) c[k] = col[k] * d;
      const cf = ss(0.15, 1.0, texelAttr(r, tris, cav.fine, i)) * (1 - onSac(P));
      const cb = ss(0.1, 1.0, texelAttr(r, tris, cav.broad, i));
      mul(c, lin([168, 136, 128]), cf * 0.5);
      kmul(c, 1 - cf * 0.14 - cb * 0.08);
      over(c, C.waxy.map((q) => q * (lumOf(c) / 0.3)), ss(0.15, 0.8, -texelAttr(r, tris, cav.broad, i)) * 0.12);
    } else {
      for (let k = 0; k < 3; k++) c[k] = C.skin[k] * d;
    }
    out.data[di] = toByte(c[0]); out.data[di + 1] = toByte(c[1]); out.data[di + 2] = toByte(c[2]);
  }
  out.mask = mask;
  out.covered = r.covered;
  return out;
}

/** Albedo means per skin region (face, sac, upper arms, forearms, legs), printed for the in-game value check. */
function regionMeans(h, img, { eyeY, eyeZ, sacK, armL, armR, foreL, foreR }) {
  const bp = h.basePart({ name: 'meas' }), tr = bp.tris(), nr = bp.normals();
  const R = 512, r = rasterUV(tr, h.baseObj.uvs, R, 0), W = img.width, d = img.data;
  const acc = {};
  const addA = (k, j) => { const a = acc[k] || (acc[k] = [0, 0]); a[0] += (d[j * 4] + d[j * 4 + 1] + d[j * 4 + 2]) / 3; a[1]++; };
  const P = [0, 0, 0], Nn = [0, 0, 0];
  for (let i = 0; i < R * R; i++) {
    if (!texelSurface(r, tr, h.pos, nr, i, P, Nn)) continue;
    const x = i % R, y = (i / R) | 0;
    const j = Math.min(W - 1, Math.floor((y + 0.5) * W / R)) * W + Math.min(W - 1, Math.floor((x + 0.5) * W / R));
    addA('all', j);
    if (P[1] > eyeY - 0.09 && P[1] < eyeY + 0.05 && P[2] > eyeZ - 0.02 && Nn[2] > 0.3) addA('face', j);
    else if (sacK(P) > 0.5) addA('sac', j);
    else if ([armL(P), armR(P)].some((q) => q.t > 0.4 && q.t < 1 && q.d < 0.07)) addA('upper arms', j);
    else if ([foreL(P), foreR(P)].some((q) => q.t > 0.05 && q.t < 0.8 && q.d < 0.06)) addA('forearms', j);
    else if (P[1] < 0.5 && P[1] > 0.1) addA('legs', j);
  }
  console.log(`${TAG} albedo skin ` + Object.entries(acc).map(([k, [s, n]]) => `${k} ${(s / n).toFixed(1)}`).join(', '));
}

/**
 * Jaundiced eyes on the MakeHuman eye texture (two eyeballs; centres measured on brown_eye.png): a yellow, bloodshot
 * sclera darkening towards the lids, a clouded acid-green iris with a dull pinpoint pupil, a faint green glow in the
 * iris (emissive) so the eyes still catch in shade.
 */
function acidEyes(src, N) {
  const W = src.width, H = src.height;
  const alb = createImage(W, H), em = createImage(W, H, [0, 0, 0, 255]);
  const centres = [[0.705, 0.295], [0.29, 0.71]];
  const c = [0, 0, 0];
  const IR = 0.112;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, u = (x + 0.5) / W, v = (y + 0.5) / H;
    let d = 9, cu = 0, cv = 0;
    for (const [a, b] of centres) { const q = Math.hypot(u - a, v - b); if (q < d) { d = q; cu = u - a; cv = v - b; } }
    const ang = Math.atan2(cv, cu);
    let e = 0;
    if (d > 0.3) { c[0] = 0.04; c[1] = 0.035; c[2] = 0.02; }
    else if (d > IR + 0.01) {
      const nn = N.fbm(u * 26, v * 26, 1.5, 3);
      for (let k = 0; k < 3; k++) c[k] = lin([170, 158, 92])[k] * (0.9 + 0.14 * nn);
      const far = ss(0.13, 0.26, d);
      const vein = N.ridged(u * 36, v * 36, 1.7, 3);
      over(c, lin([120, 30, 18]), ss(0.55 - far * 0.15, 0.8, vein) * (0.5 + far * 0.4));
      kmul(c, 1 - 0.5 * ss(0.15, 0.28, d));
    } else {
      // clouded green iris: radial fibres under a milky film, a dull grey-green pinpoint pupil
      const r = d / IR;
      const fib = N.noise(ang * 14, r * 4, 2.5) * 0.5 + 0.5;
      const col = mix3(lin([170, 196, 96]), lin([84, 120, 50]), ss(0.3, 0.95, r));
      for (let k = 0; k < 3; k++) c[k] = col[k] * (0.8 + 0.3 * fib);
      over(c, lin([176, 184, 160]), 0.5 * (1 - ss(0.75, 1, r)));
      const pupil = 1 - ss(0.1, 0.17, r);
      over(c, lin([60, 72, 50]), pupil * 0.85);
      e = (1 - pupil * 0.8) * (0.55 + 0.45 * fib) * mix(1, 0.35, ss(0.6, 1, r));
    }
    alb.data[i] = toByte(c[0]); alb.data[i + 1] = toByte(c[1]); alb.data[i + 2] = toByte(c[2]); alb.data[i + 3] = 255;
    em.data[i] = toByte(GLOW[0] * e * 0.28); em.data[i + 1] = toByte(GLOW[1] * e * 0.28); em.data[i + 2] = toByte(GLOW[2] * e * 0.28);
  }
  return { albedo: alb, emissive: em };
}

/**
 * Hair (ponytail01: a scalp shell pulled back to a tie at the back of the head + a lank, cut-short tail): the strand
 * detail of the source texture only (luminance over an alpha-normalised blur), recoloured a dull, greasy ash-brown,
 * clumped along the strands. Thinning instead of holes: the alpha is lowered in strand-shaped gaps (noise constant
 * along each strand: a function of the direction from the tie point on the shell, of x/z on the tail), more of them
 * over the acid-burnt temple and the crown, so the painted scalp (hair-root grey, the burn) shows between strands.
 * Opaque specks / pin holes under ~30 texels are removed after the alpha test threshold.
 */
function paintHair(hair, tex, { N, tie, bald, ponyFace }) {
  const W = tex.width, n = W * W, src = tex.data;
  const L = new Float32Array(n), A0 = new Float32Array(n);
  for (let i = 0; i < n; i++) { A0[i] = src[i * 4 + 3] / 255; L[i] = lumOf([S2L[src[i * 4]], S2L[src[i * 4 + 1]], S2L[src[i * 4 + 2]]]) * A0[i]; }
  const R = Math.round(W / 40);
  const bl = blurField(L, W, W, R, 2), ba = blurField(A0, W, W, R, 2);
  const tr = hair.tris(), nr = hair.normals(), faceOf = hair._faceOf.slice();
  const r = rasterUV(tr, hair.obj.uvs, W, 4);
  const hairBase = lin([84, 74, 62]);
  const out = createImage(W, W, [toByte(hairBase[0]), toByte(hairBase[1]), toByte(hairBase[2]), 0]);
  const hgt = new Float32Array(n);
  const P = [0, 0, 0], Nn = [0, 0, 0], c = [0, 0, 0];
  const covered = new Uint8Array(n);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, o = i * 4;
    if (!texelSurface(r, tr, hair.pos, nr, i, P, Nn)) continue;
    covered[i] = 1;
    const det = ba[i] > 0.05 && A0[i] > 0.02 && bl[i] > 1e-5 ? Math.max(0.45, Math.min(1.7, (L[i] / A0[i]) / (bl[i] / ba[i]))) : 1;
    // strand coordinates: across (2-3 dims, high frequency) and along (low frequency)
    const pony = ponyFace[faceOf[r.tri[i]]];
    const d = sub(P, tie), dl = Math.hypot(...d) || 1;
    const ac = pony ? [P[0] * 70, P[2] * 70, 0] : [d[0] / dl * 38, d[1] / dl * 38, d[2] / dl * 38];
    const al = pony ? P[1] * 5 : dl * 5;
    const clump = N.fbm(ac[0] * 0.25 + 2, ac[1] * 0.25, ac[2] * 0.25 + al * 0.5, 3);
    const streak = N.noise(ac[0], ac[1], ac[2] + al * 0.4 + 3.3), fine = N.noise(ac[0] * 3, ac[1] * 3, ac[2] * 3 + al + 1.9);
    const k = (0.9 + 0.24 * clump + 0.2 * streak + 0.08 * fine) * det ** 0.85;
    hgt[i] = (det - 1) * 0.8 + streak * 0.5 + fine * 0.35;
    for (let q = 0; q < 3; q++) c[q] = hairBase[q] * k;
    // greasy, darker roots; grey, dry, brittle strands mixed in; bile crust near the burnt patch
    over(c, lin([52, 46, 40]), ss(-0.2, 0.5, N.fbm(P[0] * 30, P[1] * 30, P[2] * 30, 2)) * 0.4);
    over(c, lin([128, 124, 116]), ss(0.55, 0.8, N.noise(ac[0] * 0.6 + 8.8, ac[1] * 0.6, ac[2] * 0.6)) * 0.4);
    const bp = bald(P);
    over(c, lin([66, 58, 38]), ss(0.15, 0.4, bp) * 0.45);
    // thinning: gaps between strand clumps (wider over the burn and on the crown), the tail thinning to its end
    const gap = N.noise(ac[0] * 0.55 + 7.3, ac[1] * 0.55, ac[2] * 0.55 + al * 0.15) * 0.5 + 0.5;
    const crown = pony ? 0 : ss(0.02, 0.07, P[1] - tie[1]) * 0.12;
    // (more gaps in the source's feathered hairline too: it breaks up into strands instead of a hard helmet edge)
    const thinAmt = 0.16 + crown + 0.55 * ss(0.1, 0.6, bp) + 0.35 * (1 - ss(0.55, 0.95, A0[i]));
    let a = A0[i] * (1 - ss(1 - thinAmt - 0.06, 1 - thinAmt + 0.06, gap));
    if (pony) a *= 1 - ss(0.7, 1, (tie[1] - P[1]) / 0.11) * ss(0.35, 0.7, gap);
    out.data[o] = toByte(c[0]); out.data[o + 1] = toByte(c[1]); out.data[o + 2] = toByte(c[2]);
    out.data[o + 3] = a >= 0.5 ? 255 : 0;
  }
  // alpha-test cleanup: flood-fill islands of equal alpha inside the covered texels; tiny ones flip
  {
    const seen = new Uint8Array(n), stack = [], comp = [];
    let specks = 0, pins = 0;
    for (let s = 0; s < n; s++) {
      if (seen[s] || !covered[s]) continue;
      const on = out.data[s * 4 + 3] > 0;
      stack.push(s); seen[s] = 1; comp.length = 0;
      while (stack.length) {
        const i = stack.pop(); comp.push(i);
        const x = i % W, y = (i / W) | 0;
        for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < W - 1 ? i + W : -1]) {
          if (j < 0 || seen[j] || !covered[j] || (out.data[j * 4 + 3] > 0) !== on) continue;
          seen[j] = 1; stack.push(j);
        }
      }
      if (comp.length < 30) { for (const i of comp) out.data[i * 4 + 3] = on ? 0 : 255; if (on) specks++; else pins++; }
    }
    let sum = 0, cnt = 0, op = 0, cov = 0;
    for (let i = 0; i < n; i++) if (covered[i]) { cov++; if (out.data[i * 4 + 3]) { op++; sum += (out.data[i * 4] + out.data[i * 4 + 1] + out.data[i * 4 + 2]) / 3; cnt++; } }
    console.log(`${TAG} hair: ${specks} specks / ${pins} pin holes removed, ${(op / cov * 100).toFixed(0)} % opaque; albedo ${(sum / Math.max(1, cnt)).toFixed(1)}`);
  }
  const normal = resize2(normalFromHeight(hgt, W, W, 2.5 * W / 1024), Math.round(W / 2));
  return { albedo: out, normal, srcAlpha: A0 };
}

/** Bilinear alpha (0..1) of an RGBA image at UV (u, v glTF-flipped like the rasteriser: row = (1 - v) * H). */
function alphaAtUV(img, u, v) {
  const W = img.width, H = img.height;
  const fx = Math.max(0, Math.min(W - 1.001, u * W - 0.5)), fy = Math.max(0, Math.min(H - 1.001, (1 - v) * H - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, d = img.data;
  const a = (x, y) => d[(y * W + x) * 4 + 3] / 255;
  return (a(x0, y0) * (1 - tx) + a(x0 + 1, y0) * tx) * (1 - ty) + (a(x0, y0 + 1) * (1 - tx) + a(x0 + 1, y0 + 1) * tx) * ty;
}
function resize2(img, s) {
  // box downscale by an integer factor (hair normal map)
  const k = Math.max(1, Math.round(img.width / s)), W = Math.floor(img.width / k), out = createImage(W, W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const acc = [0, 0, 0, 0];
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) { const o = ((y * k + j) * img.width + x * k + i) * 4; for (let q = 0; q < 4; q++) acc[q] += img.data[o + q]; }
    for (let q = 0; q < 4; q++) out.data[(y * W + x) * 4 + q] = Math.round(acc[q] / (k * k));
  }
  return out;
}

/**
 * Gore atlas (256 x 64): u 0..0.40 the mouth cavity (u = depth: wet dark red-brown flesh just inside the lips, going
 * near-black, then a hot acid-green core only deep in the throat), u 0.40..0.46 the tongue (v across it: livid grey-red,
 * a curdled yellow acid coating down the middle), 0.46..0.5 the eye caps (dark), u 0.5..1 the drool (translucent
 * yellow-green slime, glowing, a brighter drop at the end). Emissive map alongside.
 */
function goreTextures() {
  const W = 256, H = 64, alb = createImage(W, H, [0, 0, 0, 255]), em = createImage(W, H, [0, 0, 0, 255]);
  const c = [0, 0, 0];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = (x + 0.5) / W, v = (y + 0.5) / H, o = (y * W + x) * 4;
    let e = 0;
    if (u < 0.4) {
      // wet lip lining -> dark red-black -> black-green -> glowing throat
      const lip = lin([108, 40, 32]), deep = lin([46, 15, 12]), black = lin([14, 12, 9]), bg = lin([20, 30, 11]);
      for (let i = 0; i < 3; i++) c[i] = mix(mix(lip[i], deep[i], ss(0.035, 0.065, u)), mix(black[i], bg[i], ss(0.16, 0.26, u)), ss(0.06, 0.11, u));
      const g = ss(0.14, 0.37, u) ** 1.3;
      over(c, lin([120, 190, 48]), g * 0.85);
      e = g * (0.85 + 0.15 * Math.sin(v * 40 + u * 25));
    } else if (u < 0.46) {
      const a = Math.abs(v - 0.5) * 2; // 0 middle of the tongue .. 1 its edge / underside
      const t = lin([118, 66, 70]); for (let i = 0; i < 3; i++) c[i] = t[i];
      over(c, lin([70, 30, 34]), ss(0.55, 1, a) * 0.7);
      over(c, lin([132, 120, 70]), (1 - ss(0.1, 0.4, a)) * (0.25 + 0.15 * Math.sin(u * 300)) * ss(0.405, 0.42, u));
      kmul(c, 0.8);
      e = (1 - ss(0.1, 0.4, a)) * ss(0.43, 0.46, u) * 0.25;
    } else if (u < 0.5) {
      const d = lin([40, 18, 14]); for (let i = 0; i < 3; i++) c[i] = d[i];
    } else {
      const t = (u - 0.55) / 0.44;
      const s = lin([186, 198, 110]); for (let i = 0; i < 3; i++) c[i] = s[i] * (0.85 + 0.15 * Math.sin(v * Math.PI * 2));
      e = 0.18 + 0.2 * ss(0.85, 1, t);
    }
    alb.data[o] = toByte(c[0]); alb.data[o + 1] = toByte(c[1]); alb.data[o + 2] = toByte(c[2]);
    em.data[o] = toByte(GLOW[0] * e); em.data[o + 1] = toByte(GLOW[1] * e); em.data[o + 2] = toByte(GLOW[2] * e);
  }
  return { albedo: alb, emissive: em };
}

// ============================================================================================ build
export async function build(lib) {
  const N = lib.makeNoise(97);
  const TR = albedoTracer('spitter');
  // ---- body: a thin, wasted woman (~1.70 m), long neck, the jaw unhinged and hanging open
  const opts = lib.merge('gaunt', {
    macro: { gender: 0, age: 0.62, height: 0.56, proportions: 0.45, muscle: 0.22, weight: 0.02, race: { caucasian: 0.85, asian: 0.15 } },
    modifiers: {
      'stomach-pregnant-decr-incr': -0.6, 'measure-waist-circ-decr-incr': -0.5, 'buttocks-volume-decr-incr': -0.6,
      'upperarm-fat-decr-incr': -0.5, 'lowerarm-fat-decr-incr': -0.5, 'upperleg-fat-decr-incr': -0.5, 'lowerleg-fat-decr-incr': -0.6,
      'measure-upperarm-circ-decr-incr': -0.5, 'measure-thigh-circ-decr-incr': -0.4, 'measure-calf-circ-decr-incr': -0.4,
      'hand-fingers-length-decr-incr': 0.8, 'hand-fingers-diameter-decr-incr': -0.4,
      'measure-neck-height-decr-incr': 0.7, 'measure-neck-circ-decr-incr': -0.3,
      'chin-jaw-drop-decr-incr': 1, 'chin-height-decr-incr': 0.4, 'chin-prognathism-decr-incr': 0.3,
      'cheek-volume-decr-incr': -0.9, 'cheek-bones-decr-incr': 0.6, 'forehead-temple-decr-incr': -0.7, 'head-fat-decr-incr': -0.6,
      'eye-bag-decr-incr': 0.7, 'nose-volume-decr-incr': -0.2,
    },
    expression: {
      'mouth-open': 0.6, 'mouth-depression': 0.4, 'mouth-retraction': 0.3, 'neck-platysma': 0.5,
      'eye-left-opened-up': 0.4, 'eye-right-opened-up': 0.5, 'eyebrows-left-inner-up': 0.4, 'eyebrows-right-inner-up': 0.3,
    },
  });
  const h = await lib.Human.create(opts);
  const B = h.skeleton.byName;
  const A = lib.anchors(h);
  const eyeY = (A.eyeL[1] + A.eyeR[1]) / 2, eyeZ = (A.eyeL[2] + A.eyeR[2]) / 2;
  const neckY = B.neck_01.head.y, headY = B.head.head.y;
  console.log(`${TAG} height ${h.height.toFixed(3)}  neck ${neckY.toFixed(3)}/${B.neck_01.head.z.toFixed(3)}  head ${headY.toFixed(3)}/${B.head.head.z.toFixed(3)}  eyeY ${eyeY.toFixed(3)} eyeZ ${eyeZ.toFixed(3)}  mouth ${A.mouth.map((v) => v.toFixed(3))}`);

  // front profile of the neck / jaw (centre line): max z per 1 cm height bin
  const prof = () => {
    const bins = new Map();
    for (const v of h.baseObj.groupVerts('body')) {
      const x = h.pos[v * 3], y = h.pos[v * 3 + 1], z = h.pos[v * 3 + 2];
      if (Math.abs(x) > 0.012 || y < neckY - 0.12 || y > eyeY) continue;
      const b = Math.round(y * 100);
      if (!bins.has(b) || z > bins.get(b)) bins.set(b, z);
    }
    return [...bins.entries()].sort((a, b) => a[0] - b[0]);
  };
  // ---- sculpt 1: the unhinged jaw. Every base vertex (lower teeth / tongue helpers included) is rotated about the
  // jaw hinge by the CC0 MPFB2 default rig's 'jaw' weight (its own vertex group: lower lip, chin, jaw line, the floor
  // of the mouth), on top of the 'mouth-open' expression: the mandible hangs ~45 deg open and dislocated down/forward
  const jw = new Float32Array(h.pos.length / 3);
  {
    const wj = JSON.parse(fs.readFileSync(await lib.mpfb2('rigs/standard/weights.default.json'), 'utf8')).weights;
    const nV = h.pos.length / 3;
    // the mandible chain of that rig: jaw -> special04 -> oris02 -> oris01 (lower lip) / oris06 -> oris07 (lower lip
    // sides), the tongue; the mouth corners (levator05, a head child) go half way
    for (const [k, list] of Object.entries(wj)) {
      const f = /^(jaw|special04|oris01|oris07\.[LR]|tongue.*)$/.test(k) ? 1 : /^levator05\./.test(k) ? 0.5 : 0;
      if (f) for (const [v, w] of list) jw[v] += w * f;
    }
    for (let v = 0; v < nV; v++) jw[v] = Math.min(1, jw[v]);
    // hinge: the temporomandibular joint in front of the ears, ~3 cm under eye level (MPFB2's joint-jaw sits at the chin)
    const H = [0, eyeY - 0.03, B.head.head.z + 0.004];
    const ang = JAW_DEG * Math.PI / 180;
    let n = 0;
    for (let v = 0; v < nV; v++) {
      const w = jw[v];
      if (!(w > 0.002)) continue;
      const y = h.pos[v * 3 + 1] - H[1], z = h.pos[v * 3 + 2] - H[2];
      const a = ang * w, c = Math.cos(a), s = Math.sin(a);
      const ny = y * c - z * s, nz = y * s + z * c;
      const p = [h.pos[v * 3], H[1] + ny - JAW_DROP * w, H[2] + nz + JAW_FWD * w];
      for (let k = 0; k < 3; k++) { h.pos[v * 3 + k] = p[k]; h.dm[v * 3 + k] = p[k] * 10 + h.origin[k]; }
      n++;
    }
    console.log(`${TAG} jaw: hinge ${H.map((q) => q.toFixed(3))}, ${n} vertices rotated ${JAW_DEG} deg`);
  }
  // the mouth anchor follows the open jaw (teeth helpers moved)
  Object.assign(A, lib.anchors(h));
  console.log(`${TAG} centre-line front z per cm: ${prof().map(([b, z]) => `${b}:${(z * 100).toFixed(1)}`).join(' ')}`);
  // chin tip: the front-most centre-line point below the mouth
  const chin = (() => {
    let best = null;
    for (const v of h.baseObj.groupVerts('body')) {
      const x = h.pos[v * 3], y = h.pos[v * 3 + 1], z = h.pos[v * 3 + 2];
      if (Math.abs(x) > 0.01 || y > A.mouth[1] - 0.015 || y < A.mouth[1] - 0.12) continue;
      if (!best || z > best[2]) best = [x, y, z];
    }
    return best;
  })();
  console.log(`${TAG} chin tip ${chin.map((v) => v.toFixed(3))}, mouth ${A.mouth.map((v) => v.toFixed(3))}`);

  // ---- sculpt 2: the distended throat sac. A pendulous, bilobed swelling hanging under the unhinged jaw, from the
  // underside of the jaw down over the collarbones: bulging forward, sagging at the bottom (the lower half overhangs
  // the sternum), a groove down the middle between the two lobes
  const neckAxisZ = B.neck_01.head.z;
  // the sac hangs straight from the underside of the unhinged jaw (its top at the chin line) down to just above the
  // jugular notch; the chin itself (forward-facing mandible skin) stays put
  const sacTop = chin[1] + SAC.top, sacBot = neckY - SAC.bot;
  const sacC = [0, mix(sacBot, sacTop, 0.42), 0];
  const sacRy = (sacTop - sacBot) / 2, sacRx = SAC.rx;
  const sacW = (P, v = -1, Nn = null) => {
    if (P[2] < neckAxisZ - 0.015) return 0;
    const e = Math.hypot(P[0] / sacRx, (P[1] - sacC[1]) / sacRy);
    const front = ss(-0.015, 0.035, P[2] - neckAxisZ);
    const chinSkin = Nn ? ss(chin[1] - 0.022, chin[1] - 0.006, P[1]) * ss(0.0, 0.5, Nn[2]) : 0;
    return (1 - ss(0.3, 1.05, e)) * front * (1 - chinSkin);
  };
  {
    const r = sculptBase(h, (P, Nn, v) => {
      const w = sacW(P, v, Nn);
      if (w <= 0) return null;
      const lobe = 1 - 0.3 * Math.exp(-((P[0] / 0.012) ** 2));
      const sag = mix(0.7, 1.25, ss(sacTop, sacBot, P[1]));
      const a = SAC.amp * w ** 1.2 * lobe * sag;
      const dir = norm([Nn[0] * 0.7, Nn[1] * 0.4 - 0.45 * ss(sacC[1] + 0.02, sacBot, P[1]), Math.max(0.25, Nn[2]) + 0.5]);
      return scl(dir, a);
    });
    console.log(`${TAG} throat sac: ${r.moved} base vertices, max ${(r.maxD * 100).toFixed(1)} cm (y ${sacBot.toFixed(3)}..${sacTop.toFixed(3)})`);
  }
  // sac surface frame for painting: centre on the swollen surface, the sac's own mask on the sculpted mesh
  const sacFront = (() => {
    let best = null;
    for (const v of h.baseObj.groupVerts('body')) {
      const x = h.pos[v * 3], y = h.pos[v * 3 + 1], z = h.pos[v * 3 + 2];
      if (Math.abs(x) > 0.03 || y > sacTop || y < sacBot) continue;
      if (!best || z > best[2]) best = [x, y, z];
    }
    return best;
  })();
  const onSac = (P) => {
    const e = Math.hypot(P[0] / (sacRx * 1.05), (P[1] - sacC[1] + 0.006) / (sacRy * 1.1));
    return (1 - ss(0.55, 1.0, e)) * ss(neckAxisZ + 0.02, neckAxisZ + 0.06, P[2]);
  };
  console.log(`${TAG} sac front ${sacFront.map((v) => v.toFixed(3))}`);

  // ---- geometry
  // refine: the sac and the stretched lower face round the open mouth
  const neckZone = (p, m = 0) => (p[1] > sacBot - 0.03 - m && p[1] < chin[1] + 0.01 + m && p[2] > neckAxisZ - 0.01 - m && Math.abs(p[0]) < sacRx + 0.012 + m)
    || (Math.hypot(p[0] / 1.3, p[1] - A.mouth[1] + 0.01, (p[2] - A.mouth[2]) * 0.8) < 0.045 + m && p[2] > A.mouth[2] - 0.05);
  // a second pass over the sac itself (it stretches the proxy's triangles by up to ~8 cm)
  const sacZone = (p, m = 0) => p[1] > sacBot - 0.008 - m && p[1] < chin[1] - 0.012 + m && p[2] > neckAxisZ + 0.04 - m && Math.abs(p[0]) < sacRx - 0.008 + m;
  const body0 = await h.proxyBody('female1605');
  const body = refineSurface(lib, h, refineSurface(lib, h, body0, neckZone), sacZone);
  const gown = await h.fit('clothes/female_elegantsuit01', { name: 'clothes', role: 'cloth' });
  const eyes = await h.fit('eyes/low-poly', { name: 'eyes', role: 'eye', hide: false });
  const teeth = await h.fit('teeth/teeth_base', { name: 'teeth', role: 'teeth', hide: false });
  const hair = await h.fit('hair/ponytail01', { name: 'hair', role: 'hair', hide: false });
  // a decapitation must not carry the gown's neckline away
  for (let v = 0; v < gown.nVerts; v++) if (gown.seg[v] === 1) gown.seg[v] = 0;

  const SHL = B.upperarm_l.head.toArray(), SHR = B.upperarm_r.head.toArray();
  const armL = boneSeg(B.upperarm_l), armR = boneSeg(B.upperarm_r), foreL = boneSeg(B.lowerarm_l), foreR = boneSeg(B.lowerarm_r);
  const thighL = boneSeg(B.thigh_l), thighR = boneSeg(B.thigh_r), calfL = boneSeg(B.calf_l), calfR = boneSeg(B.calf_r);
  const kneeL = B.calf_l.head.toArray(), kneeR = B.calf_r.head.toArray();
  const handC = [B.hand_l.head.toArray(), B.hand_r.head.toArray()];
  const yChest = B.spine_03.head.y, yWaist = B.spine_01.head.y, yPelvis = B.pelvis.head.y;

  // torso cross-section per height (2 cm bins): centre z, front z, half depth (arms excluded)
  const torso = (() => {
    const y0 = 0.7, NB = 45, BS = 0.02;
    const zf = new Float32Array(NB).fill(-9), zb = new Float32Array(NB).fill(9);
    const fill = (arr, bad) => {
      for (let pass = 0; pass < NB; pass++) for (let b = 0; b < NB; b++) if (bad(arr[b])) {
        const n = b > 0 && !bad(arr[b - 1]) ? arr[b - 1] : b < NB - 1 && !bad(arr[b + 1]) ? arr[b + 1] : null;
        if (n !== null) arr[b] = n;
      }
    };
    for (const v of h.baseObj.groupVerts('body')) {
      const x = h.pos[v * 3], y = h.pos[v * 3 + 1], z = h.pos[v * 3 + 2];
      const b = Math.round((y - y0) / BS);
      if (b < 0 || b >= NB || Math.abs(x) > 0.03) continue;
      if (y > sacBot - 0.02 && z > neckAxisZ) continue; // the sac is not the chest
      zf[b] = Math.max(zf[b], z); zb[b] = Math.min(zb[b], z);
    }
    fill(zf, (q) => q < -1); fill(zb, (q) => q > 1);
    const at = (arr, y) => { const f = Math.max(0, Math.min(NB - 1.001, (y - y0) / BS)); const i = Math.floor(f); return mix(arr[i], arr[i + 1], f - i); };
    return { cz: (y) => (at(zf, y) + at(zb, y)) / 2, zf: (y) => at(zf, y), zb: (y) => at(zb, y) };
  })();

  // ---- the gown (female_elegantsuit01 -> hospital gown). Garment piece of every face by UV island: the collar goes,
  // the sleeves and the skirt get their own cuts; the blouse body panels + skirt are repainted as one cotton gown
  const KIND = { panel: 0, sleeveL: 1, sleeveR: 2, skirt: 3, collar: 4 };
  const faceKind = (() => {
    const isl = uvIslands(gown), info = new Map();
    gown.obj.faces.forEach((f, fi) => {
      let s = info.get(isl[fi]);
      if (!s) info.set(isl[fi], s = { n: 0, x: 0, y: 0, ymin: 9 });
      s.n++;
      for (const v of f.v) { s.x += gown.pos[v * 3] / f.v.length; s.y += gown.pos[v * 3 + 1] / f.v.length; s.ymin = Math.min(s.ymin, gown.pos[v * 3 + 1]); }
    });
    for (const s of info.values()) {
      const x = s.x / s.n, y = s.y / s.n;
      s.kind = s.ymin < yPelvis - 0.12 ? KIND.skirt : y > neckY - 0.1 && s.n < 120 ? KIND.collar : Math.abs(x) > 0.2 ? (x > 0 ? KIND.sleeveL : KIND.sleeveR) : KIND.panel;
    }
    return isl.map((id) => info.get(id).kind);
  })();
  {
    let n = 0;
    gown.obj.faces.forEach((f, fi) => { if (faceKind[fi] === KIND.collar) { gown.keep[fi] = 0; n++; } });
    const cnt = [0, 0, 0, 0, 0];
    faceKind.forEach((k) => cnt[k]++);
    console.log(`${TAG} gown faces: panels ${cnt[0]}, sleeves ${cnt[1]}/${cnt[2]}, skirt ${cnt[3]}, collar ${cnt[4]} (deleted ${n})`);
  }
  // loose hospital cotton instead of a pencil skirt: the skirt flares out to the hem (~4.5 cm at the hem, a little
  // more at the back and sides), so it hangs off the bony hips and the legs stay inside it in a stride
  const skirtV = new Uint8Array(gown.nVerts);
  gown.obj.faces.forEach((f, fi) => { if (faceKind[fi] === KIND.skirt) for (const v of f.v) skirtV[v] = 1; });
  let hemY = 9;
  for (let v = 0; v < gown.nVerts; v++) if (skirtV[v]) hemY = Math.min(hemY, gown.pos[v * 3 + 1]);
  {
    const yTop = yPelvis - 0.02;
    for (let v = 0; v < gown.nVerts; v++) {
      if (!skirtV[v]) continue;
      const y = gown.pos[v * 3 + 1];
      const f = ss(yTop, hemY, y);
      if (f <= 0) continue;
      const cz = torso.cz(Math.max(0.72, y)), x = gown.pos[v * 3], z = gown.pos[v * 3 + 2];
      const d = norm([x, 0, (z - cz) * 1.25]);
      const amt = (0.045 + 0.01 * ss(0, -1, d[2])) * f ** 1.4;
      gown.pos[v * 3] += d[0] * amt;
      gown.pos[v * 3 + 2] += d[2] * amt * 0.8;
      gown.pos[v * 3 + 1] -= 0.015 * f * f; // hangs a little lower
    }
    hemY -= 0.015;
    console.log(`${TAG} skirt flared, hem at ${hemY.toFixed(3)} (knee ${kneeL[1].toFixed(3)})`);
  }

  // bust apexes (no random rips over them: a hole there read as a bare breast at range)
  const busts = [1, -1].map((sg) => {
    let best = null;
    for (const v of h.baseObj.groupVerts('body')) {
      const x = h.pos[v * 3] * sg, y = h.pos[v * 3 + 1], z = h.pos[v * 3 + 2];
      if (x < 0.03 || x > 0.13 || y < yChest || y > sacBot - 0.03) continue;
      if (!best || z > best[2]) best = [h.pos[v * 3], y, z];
    }
    return best || [sg * 0.08, yChest + 0.08, 0.1];
  });

  // ---- one straight shift instead of a fitted blouse + pencil skirt: from the bust / shoulder blades down, the radius
  // of the cotton about a fixed vertical axis never shrinks going down (a cumulative max per 1 cm band and 10 deg
  // sector, -1 cm per 10 cm of drape), so the nipped waist, the darted under-bust and the small of the back are
  // bridged and it hangs straight to the hem; the blouse's hem is then tucked 6 mm under the skirt's waistband so
  // no peplum edge stands proud
  const sleeveV = new Uint8Array(gown.nVerts), torsoV = new Uint8Array(gown.nVerts);
  gown.obj.faces.forEach((f, fi) => {
    if (!gown.keep[fi]) return;
    for (const v of f.v) (faceKind[fi] === KIND.sleeveL || faceKind[fi] === KIND.sleeveR ? sleeveV : torsoV)[v] = 1;
  });
  let skirtTopY = -9, blouseLowY = 9;
  for (let v = 0; v < gown.nVerts; v++) {
    if (skirtV[v]) skirtTopY = Math.max(skirtTopY, gown.pos[v * 3 + 1]);
    else if (torsoV[v]) blouseLowY = Math.min(blouseLowY, gown.pos[v * 3 + 1]);
  }
  {
    const czA = torso.cz(yWaist), yHang = Math.min(busts[0][1], busts[1][1]);
    const BS = 0.01, NB = Math.ceil((yHang - hemY + 0.06) / BS) + 2, NSc = 36;
    const E = new Float32Array(NB * NSc);
    const binF = (y) => (yHang - y) / BS, secF = (x, z) => ((Math.atan2(x, z - czA) / (2 * Math.PI)) * NSc + NSc) % NSc;
    for (let v = 0; v < gown.nVerts; v++) {
      if (!torsoV[v] || sleeveV[v]) continue;
      const x = gown.pos[v * 3], y = gown.pos[v * 3 + 1], z = gown.pos[v * 3 + 2];
      const b = Math.round(binF(y)); if (b < 0 || b >= NB) continue;
      const s = Math.round(secF(x, z)) % NSc, i = b * NSc + s;
      E[i] = Math.max(E[i], Math.hypot(x, z - czA));
    }
    // neighbouring sectors share their maxima (no notches where a sector had no vertex), then the downward drape
    for (let b = 0; b < NB; b++) {
      const row = E.slice(b * NSc, b * NSc + NSc);
      for (let s = 0; s < NSc; s++) E[b * NSc + s] = Math.max(row[s], 0.985 * Math.max(row[(s + 1) % NSc], row[(s + NSc - 1) % NSc]));
    }
    // the drape per sector: the upper concave hull of the radius profile from the bust down to the hem (cloth stretched
    // straight from the bust / blades over the hips to the flared hem: no waist, no step anywhere)
    for (let s = 0; s < NSc; s++) {
      const pts = [];
      for (let b = 0; b < NB; b++) if (E[b * NSc + s] > 0) pts.push([b, E[b * NSc + s]]);
      if (pts.length < 2) continue;
      const hull = [];
      for (const p of pts) {
        while (hull.length >= 2) {
          const [a, c] = [hull[hull.length - 2], hull[hull.length - 1]];
          if ((c[0] - a[0]) * (p[1] - a[1]) - (c[1] - a[1]) * (p[0] - a[0]) >= 0) hull.pop(); else break;
        }
        hull.push(p);
      }
      for (let b = 0; b < NB; b++) {
        let k = 0;
        while (k < hull.length - 2 && hull[k + 1][0] < b) k++;
        const [a, c] = b <= hull[0][0] ? [hull[0], hull[0]] : b >= hull[hull.length - 1][0] ? [hull[hull.length - 1], hull[hull.length - 1]] : [hull[k], hull[k + 1]];
        const t = c[0] === a[0] ? 0 : (b - a[0]) / (c[0] - a[0]);
        E[b * NSc + s] = Math.max(E[b * NSc + s], mix(a[1], c[1], t));
      }
    }
    const envAt = (x, y, z) => {
      const fb = Math.max(0, Math.min(NB - 1.001, binF(y))), fs = secF(x, z);
      const b0 = Math.floor(fb), s0 = Math.floor(fs) % NSc, s1 = (s0 + 1) % NSc, tb = fb - b0, ts = fs - Math.floor(fs);
      const e = (b) => E[b * NSc + s0] * (1 - ts) + E[b * NSc + s1] * ts;
      return e(b0) * (1 - tb) + e(b0 + 1) * tb;
    };
    let moved = 0, maxD = 0;
    for (let v = 0; v < gown.nVerts; v++) {
      if (!torsoV[v] || sleeveV[v]) continue;
      const x = gown.pos[v * 3], y = gown.pos[v * 3 + 1], z = gown.pos[v * 3 + 2];
      if (y > yHang) continue;
      const r = Math.hypot(x, z - czA) || 1e-6;
      // the hang starts gently under the apex / blades
      let target = mix(r, Math.max(r, envAt(x, y, z)), ss(yHang, yHang - 0.04, y));
      // one layer seen from outside: the skirt's top tucks 4 mm under the (now straight) blouse, whose hem rests on it
      if (skirtV[v]) target -= 0.004 * ss(blouseLowY + 0.004, blouseLowY + 0.016, y);
      else target -= 0.0025 * ss(blouseLowY + 0.03, blouseLowY, y);
      if (Math.abs(target - r) < 1e-5) continue;
      gown.pos[v * 3] = x * target / r; gown.pos[v * 3 + 2] = czA + (z - czA) * target / r;
      moved++; maxD = Math.max(maxD, target - r);
    }
    // the skirt's waistband roll is hidden under the blouse: it goes (it caught the light as a lip at the waist)
    let wb = 0;
    gown.obj.faces.forEach((f, fi) => {
      if (gown.keep[fi] && faceKind[fi] === KIND.skirt && f.v.every((v) => gown.pos[v * 3 + 1] > Math.max(blouseLowY + 0.03, skirtTopY - 0.03))) { gown.keep[fi] = 0; wb++; }
    });
    console.log(`${TAG} gown -> shift: ${moved} verts hung straight below y ${yHang.toFixed(3)} (max ${(maxD * 100).toFixed(1)} cm out); skirt top ${skirtTopY.toFixed(3)} (${wb} waistband faces under the blouse removed), blouse hem ${blouseLowY.toFixed(3)}`);
  }

  // ---- cut fields (metres; > 0 = fabric gone, the frayed fringe is the band just below 0)
  // acid holes: centred on the (now straight-hanging) gown's front surface
  const gownFrontZ = (() => {
    const bvh = occluders([{ pos: gown.pos, tris: gown.tris() }]);
    const ray = new THREE.Ray();
    return (x, y) => {
      ray.origin.set(x, y, 0.6); ray.direction.set(0, 0, -1);
      const hit = bvh.raycastFirst(ray, THREE.DoubleSide, 0, 1.2);
      return hit ? hit.point.z : torso.zf(Math.max(0.72, Math.min(1.45, y))) + 0.01;
    };
  })();
  const acidHoles = [
    { c: [0.012, sacBot - 0.085, 0], r: 0.022 },     // under the sac, where the acid dripped first
    { c: [-0.018, yChest - 0.12, 0], r: 0.016 },
    { c: [0.045, yWaist + 0.02, 0], r: 0.03 },        // a big one eaten through over the belly
    { c: [0.01, yWaist - 0.07, 0], r: 0.013 },
    { c: [-0.07, yPelvis - 0.16, 0], r: 0.026 },      // skirt, right thigh
    { c: [0.03, yPelvis - 0.27, 0], r: 0.014 },
  ].map((o) => ({ ...o, c: [o.c[0], o.c[1], gownFrontZ(o.c[0], o.c[1])] }));
  // the open back of a hospital gown, neck to hem: a gap between the shoulder blades narrowing down the back, the two
  // flaps overlapping over the seat (painted overlap edge, `flapLine`), split open again over the last ~14 cm
  const backSlitHW = (y) => y > neckY - 0.06 ? 0.07 : y > yChest ? mix(0.05, 0.07, ss(yChest, neckY - 0.06, y)) : y > yWaist ? mix(0.026, 0.05, ss(yWaist, yChest, y)) : mix(-0.004, 0.026, ss(yPelvis - 0.02, yWaist, y));
  const ties = [neckY - 0.07, yChest - 0.04, yWaist + 0.03];
  const slitX = (y) => 0.006 - N.fbm(y * 6, 2.2, 0.3, 2) * 0.008;
  const gownCut = (P, kind) => {
    const rag = N.fbm(P[0] * 13, P[1] * 13, P[2] * 13, 3) * 0.011 + N.noise(P[0] * 70, P[1] * 70, P[2] * 70) * 0.003;
    let f = -1;
    if (kind === KIND.collar) return 1;
    // wide round neckline (the sac hangs over it); lower at the front
    {
      const front = ss(-0.03, 0.03, P[2] - torso.cz(Math.min(P[1], neckY)));
      const ax = Math.abs(P[0]) / 0.105;
      const bottom = mix(neckY - 0.035, sacBot - 0.03, front);
      f = Math.max(f, P[1] - (bottom + (neckY + 0.02 - bottom) * ax * ax));
    }
    // the open back of a hospital gown: a slit down the spine (wide between the shoulder blades), three ties across it
    if (kind !== KIND.sleeveL && kind !== KIND.sleeveR && P[2] < torso.cz(Math.max(0.75, P[1])) - 0.01) {
      let hw = backSlitHW(P[1]);
      if (kind === KIND.skirt) hw = Math.max(hw, mix(0.0, 0.032, ss(hemY + 0.16, hemY, P[1])));
      let sl = hw - Math.abs(P[0] - slitX(P[1]));
      for (const ty of ties) if (Math.abs(P[1] - ty) < 0.007 && Math.abs(P[0]) < hw + 0.01) sl = Math.min(sl, -0.004);
      f = Math.max(f, sl);
    }
    // sleeves: the right one hemmed short above the elbow, the left one torn off high and ragged
    if (kind === KIND.sleeveR) { const a = armR(P); f = Math.max(f, (a.t - 0.5) * a.L + rag * 0.3); }
    if (kind === KIND.sleeveL) { const a = armL(P); f = Math.max(f, (a.t - 0.3) * a.L + N.fbm(P[0] * 25, P[1] * 25, P[2] * 25, 3) * 0.022); }
    // ragged hem: a tongue torn up the right thigh, the back hanging lower
    if (kind === KIND.skirt) {
      const back = P[2] < torso.cz(0.75) ? 1 : 0;
      let hem = hemY + 0.035 - back * 0.02 + N.fbm(P[0] * 9 + 4, 1.3, P[2] * 9, 3) * 0.035;
      const tx = P[0] + 0.085, tear = Math.max(0, 1 - Math.abs(tx) / 0.035) * (P[2] > 0 ? 1 : 0);
      hem += tear * 0.16;
      f = Math.max(f, hem - P[1]);
    }
    // acid holes eaten through the cotton
    for (const o of acidHoles) {
      const d = dist(P, o.c);
      if (d < o.r * 2) f = Math.max(f, o.r - d - N.fbm(P[0] * 60, P[1] * 60, P[2] * 60, 2) * o.r * 0.45);
    }
    // general shredding, more towards the hem
    const n = N.fbm(P[0] * 7, P[1] * 3.5, P[2] * 7, 4) * 0.5 + 0.5;
    const bust = 1 - ss(0.04, 0.08, Math.min(dist(P, busts[0]), dist(P, busts[1])));
    f = Math.max(f, (n + 0.07 * ss(hemY + 0.25, hemY, P[1]) - 0.775 - 0.3 * bust) * 0.3);
    return f + rag;
  };
  const acidRim = (P) => {
    let r = 0;
    for (const o of acidHoles) r = Math.max(r, 1 - ss(o.r, o.r * 2.2, dist(P, o.c) + N.fbm(P[0] * 40, P[1] * 40, P[2] * 40, 2) * 0.006));
    return r;
  };

  // ---- hair: ponytail01 (CC0) -- the greasy hair of a ward patient scraped back off the face into a lank tail at the
  // back of the head: a scalp shell (strands converging on the tie) + the tail cards, cut ~13 cm below the tie. The
  // shell is rigid on the head; the tail blends onto the neck / upper back so a thrown-back head does not drive it
  // into the shoulders. Thinned (not holed) over an acid-burnt patch on the right temple and on the crown.
  const skull = [0, eyeY + 0.02, B.head.head.z - 0.02];
  const bald = (P) => {
    // thinning field: one big burnt patch over the right temple, a few thin areas on the crown, ragged edges
    const q = norm(sub(P, skull));
    let b = ss(0.3, 0.5, N.fbm(q[0] * 3.1 + 7, q[1] * 3.1, q[2] * 3.1, 3)) * 0.7;
    b = Math.max(b, 1 - ss(0.35, 0.62, dist(q, norm([-0.75, 0.5, 0.35])) + N.fbm(q[0] * 9, q[1] * 9, q[2] * 9, 2) * 0.12));
    return b;
  };
  const ponyFace = new Uint8Array(hair.obj.faces.length);
  let tie;
  {
    const F = hair.obj.faces;
    const par = new Int32Array(hair.nVerts).map((_, i) => i);
    const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    for (const f of F) for (let k = 1; k < f.v.length; k++) { const a = find(f.v[0]), b = find(f.v[k]); if (a !== b) par[a] = b; }
    // tail pieces: the components hanging well below the lowest point of every piece that reaches the face (the scalp
    // shell and the strands lying on it all reach forward over the forehead; the tail cards hang down the back)
    const box = new Map();
    for (const f of F) {
      const r = find(f.v[0]);
      let b = box.get(r); if (!b) box.set(r, b = { zmax: -9, ymin: 9 });
      for (const v of f.v) { b.zmax = Math.max(b.zmax, hair.pos[v * 3 + 2]); b.ymin = Math.min(b.ymin, hair.pos[v * 3 + 1]); }
    }
    const headZ = B.head.head.z;
    const frontMin = Math.min(...[...box.values()].filter((b) => b.zmax > headZ + 0.05).map((b) => b.ymin));
    F.forEach((f, fi) => { const b = box.get(find(f.v[0])); ponyFace[fi] = b.zmax < headZ + 0.05 && b.ymin < frontMin - 0.04 ? 1 : 0; });
    // tie point: the top of the tail
    let ty = -9;
    F.forEach((f, fi) => { if (ponyFace[fi]) for (const v of f.v) ty = Math.max(ty, hair.pos[v * 3 + 1]); });
    const acc = [0, 0, 0]; let na = 0;
    F.forEach((f, fi) => {
      if (ponyFace[fi]) for (const v of f.v) if (hair.pos[v * 3 + 1] > ty - 0.012) { for (let k = 0; k < 3; k++) acc[k] += hair.pos[v * 3 + k]; na++; }
    });
    tie = scl(acc, 1 / Math.max(1, na));
    let cut = 0;
    F.forEach((f, fi) => {
      if (!ponyFace[fi]) return;
      if (f.v.every((v) => hair.pos[v * 3 + 1] < tie[1] - 0.115)) { hair.keep[fi] = 0; cut++; }
    });
    // gathered: the tail narrows below the tie (a lank tail, not a fan)
    const tailV = new Uint8Array(hair.nVerts);
    F.forEach((f, fi) => { if (ponyFace[fi]) for (const v of f.v) tailV[v] = 1; });
    for (let v = 0; v < hair.nVerts; v++) if (tailV[v]) hair.pos[v * 3] = tie[0] + (hair.pos[v * 3] - tie[0]) * mix(1, 0.62, ss(0.0, 0.06, tie[1] - hair.pos[v * 3 + 1]));
    for (let v = 0; v < hair.nVerts; v++) { hair.weights[v] = [[B.head.index, 1]]; hair.seg[v] = 1; }
    F.forEach((f, fi) => {
      if (!ponyFace[fi]) return;
      for (const v of f.v) {
        const w = ss(0.015, 0.13, tie[1] - hair.pos[v * 3 + 1]);
        const l = [[B.head.index, 1 - 0.55 * w], [B.neck_01.index, 0.4 * w], [B.spine_03.index, 0.15 * w]].filter(([, x]) => x > 1e-3);
        const sw = l.reduce((a, [, x]) => a + x, 0);
        hair.weights[v] = l.map(([b, x]) => [b, x / sw]);
      }
    });
    console.log(`${TAG} hair: shell + tail ${hair.triCount()} tris (${cut} tail faces cut), tie ${tie.map((q) => q.toFixed(3))}`);
  }

  // ---- the body proxy carries a loose flap of inner-mouth faces (bound to the tongue / teeth helpers, swung into the
  // gape by the jaw rotation): every body face lying inside the lip loop (seen from the front) and behind the lips goes
  {
    const loops = boundaryLoops(body);
    const Pv = (v) => [body.pos[v * 3], body.pos[v * 3 + 1], body.pos[v * 3 + 2]];
    let lip = null, bd = 1e9;
    for (const l of loops) {
      if (l.length < 16) continue;
      const c = l.reduce((a, v) => add(a, scl(Pv(v), 1 / l.length)), [0, 0, 0]);
      if (dist(c, A.mouth) < bd) { bd = dist(c, A.mouth); lip = l; }
    }
    if (lip) {
      const poly = lip.map(Pv), c = poly.reduce((a, p) => add(a, scl(p, 1 / poly.length)), [0, 0, 0]);
      const shr = poly.map((p) => [c[0] + (p[0] - c[0]) * 0.96, c[1] + (p[1] - c[1]) * 0.96]);
      const zLip = Math.max(...poly.map((p) => p[2]));
      const inPoly = (x, y) => {
        let ins = false;
        for (let i = 0, j = shr.length - 1; i < shr.length; j = i++) {
          const [xi, yi] = shr[i], [xj, yj] = shr[j];
          if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins;
        }
        return ins;
      };
      let n = 0;
      body.obj.faces.forEach((f, fi) => {
        if (!body.keep[fi]) return;
        if (f.v.every((v) => inPoly(body.pos[v * 3], body.pos[v * 3 + 1]) && body.pos[v * 3 + 2] < zLip + 0.004 && body.pos[v * 3 + 2] > zLip - 0.1)) { body.keep[fi] = 0; n++; }
      });
      console.log(`${TAG} ${n} body faces removed from inside the gape`);
    }
  }

  // ---- mouth cavity (glowing throat) + acid drool + hospital wristband (custom skinned geometry)
  const cavity = mouthCavity(h, body, A);
  const droolGeo = droolStrands(h, cavity.lip, A);
  const bandGeo = wristband(h, 'l');

  // ---- clothes paint: the gown repainted (pale hospital teal cotton, a faded diamond print), stained, then cut
  const gownDiff = await lib.texture(gown.asset.textures.diffuse, 2048);
  let gownBase = hospitalCotton(gownDiff, N);
  let gownAo = await lib.texture(gown.asset.textures.ao, 1024);
  let gownNrm = await lib.texture(gown.asset.textures.normal, 1024);
  TR.snap('gown: source', gownDiff, gown);
  TR.snap('gown: hospital cotton', gownBase, gown);
  {
    let pre = 0;
    gown.obj.faces.forEach((f, fi) => {
      if (!gown.keep[fi]) return;
      const pts = f.v.map((v) => [gown.pos[v * 3], gown.pos[v * 3 + 1], gown.pos[v * 3 + 2]]);
      const cen = [0, 1, 2].map((k) => pts.reduce((a, p) => a + p[k], 0) / pts.length);
      if ([...pts, cen].every((p) => gownCut(p, faceKind[fi]) > 0.012)) { gown.keep[fi] = 0; pre++; }
    });
    const pack = repackUV(gown);
    gownBase = pack.remap(gownBase);
    gownAo = pack.remap(gownAo, [255, 255, 255, 255]);
    gownNrm = pack.remap(gownNrm, [128, 128, 255, 255]);
    console.log(`${TAG} gown: ${pre} faces inside cuts deleted, islands repacked at x${pack.s.toFixed(2)}`);
  }
  // soften the source AO (the blouse was tucked into the skirt: black band at the waist); on the torso panels and the
  // skirt the source's tailoring (bust darts, waistband, princess seams) also goes from the normal map and the AO:
  // a shift has none of it (fold detail kept at ~40 %, fully flattened round the old waist seam)
  {
    const W = gownNrm.width, tr = gown.tris(), faceOf = gown._faceOf, nr = gown.normals();
    const r = rasterUV(tr, gown.obj.uvs, W, 4);
    const P = [0, 0, 0], Nn = [0, 0, 0];
    const aoW = gownAo.width;
    for (let i = 0; i < W * W; i++) {
      const t = r.tri[i];
      if (t < 0) continue;
      const kind = faceKind[faceOf[t]];
      if (kind !== KIND.panel && kind !== KIND.skirt) continue;
      texelSurface(r, tr, gown.pos, nr, i, P, Nn);
      const k = 0.4 * (1 - ss(0.045, 0.015, Math.min(Math.abs(P[1] - skirtTopY), Math.abs(P[1] - blouseLowY))) * 0.85);
      const o = i * 4;
      for (let c = 0; c < 3; c++) gownNrm.data[o + c] = Math.round(mix(c === 2 ? 255 : 128, gownNrm.data[o + c], k));
      if (aoW === W) for (let c = 0; c < 3; c++) gownAo.data[o + c] = Math.round(mix(255, gownAo.data[o + c], k + 0.2));
    }
  }
  for (let i = 0; i < gownAo.data.length; i += 4) for (let k = 0; k < 3; k++) gownAo.data[i + k] = Math.round(255 * 0.65 + gownAo.data[i + k] * 0.35);
  // the sewn hem (before it was torn): a slightly darker band, a double-folded edge
  const hemLine = (P) => hemY + 0.035 - (P[2] < torso.cz(0.75) ? 0.02 : 0);
  const vomit = (P) => {
    // bile and acid vomited down the front from the sac / mouth, soaked into the cotton (tide lines at the edge)
    const dy = sacBot - P[1];
    if (dy < -0.04 || P[2] < torso.cz(Math.max(0.72, Math.min(1.45, P[1])))) return 0;
    const w = 0.07 * (1 - ss(0.0, 0.5, dy)) + 0.03 + N.fbm(P[1] * 6, 1.3, 2.2, 2) * 0.02;
    const cx = N.fbm(dy * 5, 3.3, 0.7, 2) * 0.035 + 0.01;
    const core = 1 - ss(w * 0.55, w, Math.abs(P[0] - cx) + N.fbm(P[0] * 18, P[1] * 18, P[2] * 18, 2) * 0.015);
    const runs = ss(0.4, 0.62, N.noise(P[0] * 60, P[1] * 3, 2.7)) * (1 - ss(w * 0.3, w * 2.2, Math.abs(P[0] - cx))) * (1 - ss(0.35, 0.7, dy));
    return Math.max(core * (1 - ss(0.32, 0.6, dy)), runs * 0.85);
  };
  const cloth = lib.paintCloth(gown, {
    seed: 61, human: h, base: gownBase, normal: gownNrm, ao: gownAo,
    size: 2048, normalSize: 1024, ormSize: 1024,
    fade: 0.12, grime: 0.25, grimeNoise: 0.5, weave: 0.7, yellow: 0, innerDarken: 0,
    blood: { edges: 0 },
    extra: (P, Nn, c) => {
      const front = ss(-0.3, 0.3, Nn[2]);
      // sewn hem band (gone where the hem is torn away) and the overlapping back flaps' edge down the seat
      {
        const dh = P[1] - hemLine(P);
        if (dh > -0.01 && dh < 0.05 && P[1] < yPelvis - 0.1) {
          mul(c, [0.8, 0.84, 0.86], (1 - ss(0.03, 0.036, dh)) * 0.9);
          mul(c, [0.86, 0.88, 0.9], (1 - ss(0.0, 0.003, Math.abs(dh - 0.033))) * 0.8);
        }
        if (P[2] < torso.cz(Math.max(0.75, P[1])) - 0.01 && P[1] < yWaist + 0.01 && P[1] > hemY + 0.12) {
          const dx = P[0] - slitX(P[1]) - 0.003;
          over(c, lin([54, 70, 80]), (1 - ss(0.0012, 0.0045, Math.abs(dx))) * 0.6);
          over(c, lin([150, 170, 172]), (1 - ss(0.0, 0.0018, Math.abs(dx + 0.003))) * 0.35);
        }
      }
      // overall: washed-out and greyed hospital cotton, sweat-yellowed armpits and collar, grimy hem and seat
      let sweat = 0;
      for (const S of [SHL, SHR]) sweat = Math.max(sweat, 1 - ss(0.03, 0.1, dist(P, [S[0] * 0.82, S[1] - 0.1, S[2] - 0.01])));
      mul(c, [0.98, 0.9, 0.66], sweat * 0.75);
      over(c, lin([118, 120, 108]), ss(0.15, 0.6, N.fbm(P[0] * 6 + 2, P[1] * 6, P[2] * 6, 3)) * 0.45);
      over(c, lin([96, 92, 80]), (1 - ss(hemY + 0.02, hemY + 0.2, P[1])) * ss(-0.3, 0.4, N.fbm(P[0] * 12, P[1] * 12, P[2] * 12, 3)) * 0.6);
      over(c, lin([104, 98, 86]), (P[2] < torso.cz(0.8) ? 1 : 0) * ss(yPelvis + 0.02, yPelvis - 0.15, P[1]) * ss(-0.2, 0.5, N.fbm(P[0] * 8, P[1] * 8, P[2] * 8, 3)) * 0.5);
      // bile / acid vomit soaked down the front: sickly yellow-green, darker brown tide lines at the edges
      const vm = vomit(P) * front;
      if (vm > 0) {
        // soaked in (a multiply, so the print still shows through), patchy strength, crusty clots, a darker tide
        // line where the soak dried at its edge, greener near the neckline
        const deep = ss(-0.3, 0.5, N.fbm(P[0] * 16, P[1] * 12, P[2] * 16, 3));
        const k = ss(0.0, 0.45, vm) * (0.65 + 0.35 * ss(-0.4, 0.3, N.fbm(P[0] * 30 + 5, P[1] * 22, P[2] * 30, 3)));
        mul(c, mix3([1.0, 0.97, 0.62], [0.9, 0.86, 0.42], deep), k);
        mul(c, [0.86, 1.0, 0.7], k * ss(yChest - 0.05, sacBot, P[1]) * 0.6);
        over(c, C.bileDeep, ss(0.55, 0.85, N.noise(P[0] * 70, P[1] * 70, P[2] * 70)) * k * 0.45);
        const tide = 1 - Math.abs(vm - 0.16) / 0.1;
        over(c, C.tide, clamp01(tide) * 0.42);
      }
      // acid drip trails down the skirt front (from the holes), yellow-brown
      const drip = ss(0.62, 0.74, N.noise(P[0] * 90, P[1] * 3, 1.7)) * front * (P[1] < yWaist ? 1 : 0) * ss(0.0, 0.4, N.fbm(P[0] * 4 + 2, P[1] * 2, P[2] * 4, 2) + 0.15);
      over(c, C.tide, drip * 0.55);
      // scorched, acid-bleached rims round the holes (the holes are cut later)
      const rim = acidRim(P);
      if (rim > 0) { over(c, C.scorchHalo, rim * 0.6); over(c, C.scorch, ss(0.55, 0.95, rim) * 0.75); }
      // dried blood: smears on the sleeves and the skirt where she wiped her hands, a few drops
      const smear = ss(0.38, 0.5, N.fbm(P[0] * 7 - 4, P[1] * 4, P[2] * 7, 4)) * (P[1] < yWaist + 0.05 ? 1 : 0.4);
      over(c, mix3(C.dried, C.crust, ss(-0.3, 0.4, N.noise(P[0] * 40, P[1] * 40, P[2] * 40))), smear * 0.6);
      const sp = (1 - ss(0.05, 0.11, N.worley(P[0] * 30 + 3, P[1] * 30, P[2] * 30) + N.noise(P[0] * 160, P[1] * 160, P[2] * 160) * 0.035)) * ss(0.3, 0.6, N.fbm(P[0] * 3 + 9, P[1] * 3, P[2] * 3, 2) + 0.1);
      over(c, mix3(C.dried, C.crust, 0.4), sp * 0.7);
    },
  });
  TR.snap('gown: paintCloth', cloth.albedo, gown);
  // cut (alpha) with frayed cotton edges; faces with nothing left are deleted
  {
    const img = cloth.albedo, W = img.width;
    const tris = gown.tris(), faceOf = gown._faceOf, nrm = gown.normals();
    const r = rasterUV(tris, gown.obj.uvs, W, 6);
    const P = [0, 0, 0], Nn = [0, 0, 0], c = [0, 0, 0];
    for (let i = 0; i < W * W; i++) {
      const t = r.tri[i];
      if (t < 0) continue;
      texelSurface(r, tris, gown.pos, nrm, i, P, Nn);
      const kind = faceKind[faceOf[t]];
      const f = gownCut(P, kind);
      if (f < -0.03) continue;
      const fw = 0.005;
      let cut = f > 0;
      if (!cut && f > -fw) { const k = -f / fw; cut = Math.abs(N.noise(P[0] * 900, P[1] * 300, P[2] * 900)) > 0.12 + 0.8 * k * k; }
      const di = i * 4;
      if (cut) { img.data[di + 3] = 0; continue; }
      for (let k = 0; k < 3; k++) c[k] = S2L[img.data[di + k]];
      // torn cotton: pale frayed fibres, a hairline of grime; a sewn hem on the right sleeve
      const edge = 1 - ss(0.0, 0.0035, -f), band = 1 - ss(0.0, 0.012, -f);
      if (kind === KIND.sleeveR) { mul(c, [0.86, 0.88, 0.9], (1 - ss(0.008, 0.012, -f)) * 0.8); }
      else {
        over(c, C.fray, (1 - ss(0.0, fw * 1.6, -f)) * 0.5 * ss(-0.5, 0.3, N.noise(P[0] * 500, P[1] * 180, P[2] * 500)));
        kmul(c, 1 - band * 0.08);
        over(c, lin([90, 84, 70]), edge * 0.3);
      }
      img.data[di] = toByte(c[0]); img.data[di + 1] = toByte(c[1]); img.data[di + 2] = toByte(c[2]);
    }
    const r0 = rasterUV(tris, gown.obj.uvs, W, 0);
    const opaque = new Uint8Array(gown.obj.faces.length);
    for (let i = 0; i < W * W; i++) { const t = r0.tri[i]; if (t >= 0 && img.data[i * 4 + 3] >= 128) opaque[faceOf[t]] = 1; }
    let removed = 0;
    gown.obj.faces.forEach((f, fi) => {
      if (!gown.keep[fi] || opaque[fi]) return;
      const pts = f.v.map((v) => [gown.pos[v * 3], gown.pos[v * 3 + 1], gown.pos[v * 3 + 2]]);
      const cen = [0, 1, 2].map((k) => pts.reduce((a, p) => a + p[k], 0) / pts.length);
      if ([...pts, cen].every((p) => gownCut(p, faceKind[fi]) > -0.002)) { gown.keep[fi] = 0; removed++; }
    });
    const keepM = new Uint8Array(W * W);
    for (let i = 0; i < W * W; i++) keepM[i] = r0.tri[i] >= 0 && img.data[i * 4 + 3] >= 128 ? 1 : 0;
    const reach = dilate(img, keepM, 10);
    const d = img.data;
    let sum = 0, cnt = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (!reach[i >> 2]) { d[i] = 130; d[i + 1] = 150; d[i + 2] = 150; }
      for (let k = 0; k < 3; k++) d[i + k] = Math.min(252, Math.round(d[i + k] / 4) * 4);
      d[i + 3] = d[i + 3] >= 128 ? 255 : 0;
      if (keepM[i >> 2]) { sum += (d[i] + d[i + 1] + d[i + 2]) / 3; cnt++; }
    }
    console.log(`${TAG} gown: ${removed} transparent faces deleted, ${gown.triCount()} tris left; albedo ${(sum / Math.max(1, cnt)).toFixed(1)}`);
  }
  TR.snap('gown: + cuts', cloth.albedo, gown);

  // ---- what the cut gown still covers (rays from the skin: the normal + 4 tilted 35 deg + 4 tilted 60 deg; stopped
  // by intact fabric only). The straight-hanging shift stands off the body by several cm, so steep rays matter: skin
  // seen obliquely through a hole, down the neckline or up the hem must stay
  const coverage = (() => {
    const s = { tris: gown.tris(), pos: gown.pos };
    const faceOf = gown._faceOf.slice();
    const bvh = occluders([s]);
    const idx = bvh.geometry.index;
    const ray = new THREE.Ray();
    return (P, Nn) => {
      const ax = Math.abs(Nn[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      const t = norm(cross(ax, Nn)), b = cross(Nn, t);
      const tilt = [t, scl(t, -1), b, scl(b, -1)];
      const dirs = [Nn, ...tilt.map((d) => norm(add(Nn, scl(d, 0.7)))), ...tilt.map((d) => norm(add(Nn, scl(d, 1.73))))];
      let blocked = 0;
      for (const d of dirs) {
        ray.origin.set(P[0] + Nn[0] * 0.001, P[1] + Nn[1] * 0.001, P[2] + Nn[2] * 0.001);
        ray.direction.set(d[0], d[1], d[2]);
        for (let k = 0; k < 3; k++) {
          const hit = bvh.raycastFirst(ray, THREE.DoubleSide, 0, 0.12);
          if (!hit) break;
          const tri = Math.floor((idx ? idx.getX(hit.faceIndex * 3) : hit.faceIndex * 3) / 3);
          const p = [hit.point.x, hit.point.y, hit.point.z];
          if (gownCut(p, faceKind[faceOf[tri]]) <= -0.006) { blocked++; break; }
          ray.origin.copy(hit.point).addScaledVector(ray.direction, 0.002);
        }
      }
      return blocked / dirs.length;
    };
  })();
  {
    const nb = h.basePart({ name: 'cover' }).normals();
    h.hidden.clear();
    for (const v of h.baseObj.groupVerts('body')) {
      const P = [h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]];
      if (coverage(P, [nb[v * 3], nb[v * 3 + 1], nb[v * 3 + 2]]) >= 0.6) h.hidden.add(v);
    }
    console.log(`${TAG} skin under the gown: ${h.hidden.size} base vertices`);
  }

  // ---- hair paint (before the skin: the scalp under it is painted from its alpha): dull ash-brown, greasy, thinned
  const hairTex = await lib.texture(hair.asset.textures.diffuse, 1024);
  const hairOut = paintHair(hair, hairTex, { N, tie, bald, ponyFace });
  hair.material = lib.material('hair', { albedo: hairOut.albedo, normal: hairOut.normal, alpha: true, roughness: 0.62, doubleSided: true });

  // ---- skin
  const S = texSize(2048);
  const base = await skinBase(lib, h, S, { N, onSac, eyeY, eyeZ });
  TR.snap('skin: composite base', base, body);
  const tips = [];
  for (const s of ['l', 'r']) for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky']) if (B[`${f}_03_${s}`]) tips.push(B[`${f}_03_${s}`].tail.toArray());
  const lipLow = cavity.lipLow, lipCorners = cavity.corners;
  // acid burns: drool channels burnt from the lower lip down the chin, over the sac and down the chest; splash burns
  const drips = [
    { x: 0.006, len: 0.2, w: 0.007 }, { x: -0.017, len: 0.07, w: 0.006 }, { x: 0.024, len: 0.09, w: 0.005 },
  ];
  const splashes = [
    { c: lib.surfacePoint(h, 'lowerarm_r', 0.35, [0.2, 0.3, 1]).p, r: 0.035, k: 1 },
    { c: lib.surfacePoint(h, 'lowerarm_l', 0.6, [-0.3, 0, 1]).p, r: 0.025, k: 0.8 },
    { c: [A.eyeL[0] + 0.028, eyeY - 0.05, eyeZ - 0.008], r: 0.014, k: 0.6 },
    { c: lib.surfacePoint(h, 'clavicle_r', 0.7, [0, 0.4, 1]).p, r: 0.03, k: 0.75 },
    { c: lib.surfacePoint(h, 'thigh_r', 0.75, [0, 0, 1]).p, r: 0.03, k: 0.8 },
    { c: lib.surfacePoint(h, 'calf_l', 0.25, [0.3, 0, 1]).p, r: 0.022, k: 0.7 },
  ];
  // drool channels: the acid ran from the lower lip down the chin and the sac (0..1, 1 = the middle of the track)
  const chanAt = (P, Nn) => {
    let b = 0;
    const dy = lipLow[1] - P[1];
    if (dy > -0.005 && P[2] > neckAxisZ - 0.02 && Nn[2] > -0.3) {
      for (const d of drips) {
        if (dy > d.len + 0.02) continue;
        const cx = lipLow[0] + d.x + N.fbm(dy * 9, d.x * 50, 0.7, 2) * 0.012;
        const w = d.w * (1 - 0.55 * ss(0, d.len, dy)) * (1 + 0.6 * Math.exp(-(((dy - d.len) / 0.008) ** 2)));
        const k = (1 - ss(w * 0.5, w, Math.abs(P[0] - cx) + N.fbm(P[0] * 80, P[1] * 80, P[2] * 80, 2) * 0.003)) * (1 - ss(d.len - 0.01, d.len + 0.01, dy));
        b = Math.max(b, k);
      }
    }
    return b;
  };
  const burnAt = (P) => {
    // splash burns: 0..1 burn strength (1 = raw centre)
    let b = 0;
    for (const s of splashes) {
      const d = dist(P, s.c);
      if (d > s.r * 1.8) continue;
      const q = d / s.r + N.fbm(P[0] * 70, P[1] * 70, P[2] * 70, 3) * 0.45;
      b = Math.max(b, (1 - ss(0.45, 1.0, q)) * s.k);
      // satellite droplets
      b = Math.max(b, (1 - ss(0.05, 0.1, N.worley(P[0] * 140, P[1] * 140, P[2] * 140))) * (1 - ss(1.0, 1.7, q)) * 0.7 * s.k);
    }
    // fingers and palms: burnt from wiping the acid off her mouth
    for (const hc of handC) b = Math.max(b, (1 - ss(0.04, 0.09, dist(P, hc))) * ss(0.1, 0.5, N.fbm(P[0] * 30, P[1] * 30, P[2] * 30, 3) + 0.15) * 0.85);
    return b;
  };
  // hospital details: ECG electrode pads on the upper chest (one at the edge of the neckline), an IV cannula taped on
  // the back of the right hand with its cut line running up the wrist
  ecg = [
    lib.surfacePoint(h, 'spine_03', 0.75, [-0.55, 0.35, 1]).p,
    lib.surfacePoint(h, 'spine_02', 0.6, [0.85, 0, 0.55]).p,
  ];
  {
    const hb = B.hand_r, a0 = hb.head.toArray(), a1 = B.middle_01_r.head.toArray(), ax = norm(sub(a1, a0));
    const sp = lib.surfacePoint(h, 'hand_r', 0.4, [-1, 0.45, 0.25]);
    const n0 = norm(sp.n), t0 = norm(sub(ax, scl(n0, dot(ax, n0)))), b0 = cross(n0, t0);
    handIV = (P) => {
      const q = sub(P, sp.p);
      if (dot(q, q) > 0.0064) return { tape: 0, tube: 0, bruise: 0 };
      const al = dot(q, t0), ac = dot(q, b0), up = dot(q, n0);
      if (Math.abs(up) > 0.02) return { tape: 0, tube: 0, bruise: 0 };
      const tape = (1 - ss(0.0105, 0.0125, Math.abs(al))) * (1 - ss(0.0075, 0.0092, Math.abs(ac)));
      const tube = (1 - ss(0.0012, 0.0018, Math.abs(ac - 0.001 + al * 0.05))) * ss(0.0, 0.004, -al) * (1 - ss(0.05, 0.055, -al));
      const bruise = (1 - ss(0.008, 0.03, Math.hypot(al * 0.8, ac))) * ss(-0.3, 0.4, N.fbm(P[0] * 60, P[1] * 60, P[2] * 60, 2) + 0.2);
      return { tape: tape * 0.95, tube: tube * (1 - tape) * 0.9, bruise };
    };
  }
  // scalp under the hair shell (a ray along the skin normal meets it within 5 cm: the scraped-back shell stands off the crown): `under` = there is shell above,
  // `root` = how much hair grows there (the painted hair alpha at the hit, blurred ~5 mm), so the hairline has no
  // pale band and the scalp between thinned strands is hair-root grey, not bare forehead skin
  const scalpAt = (() => {
    const htr = hair.tris(), hFace = hair._faceOf.slice(), huv = hair.obj.uvs;
    const hb = occluders([{ pos: hair.pos, tris: htr }]);
    const idx = hb.geometry.index, gp = hb.geometry.attributes.position;
    // (the source alpha, before thinning: the scalp between thinned strands is root-grey too)
    const HW = hairOut.albedo.width, af = hairOut.srcAlpha;
    const ab = blurField(af, HW, HW, Math.max(2, Math.round(HW / 200)), 2);
    const ray = new THREE.Ray();
    return (P, Nn) => {
      if (P[1] < A.mouth[1] || (P[2] > eyeZ - 0.035 && P[1] < eyeY + 0.04)) return { under: 0, root: 0 };
      ray.origin.set(P[0], P[1], P[2]); ray.direction.set(Nn[0], Nn[1], Nn[2]);
      const hit = hb.raycastFirst(ray, THREE.DoubleSide, 0, 0.05);
      if (!hit) return { under: 0, root: 0 };
      const j0 = idx ? idx.getX(hit.faceIndex * 3) : hit.faceIndex * 3;
      const t = Math.floor(j0 / 3);
      if (ponyFace[hFace[t]]) return { under: 0, root: 0 };
      // barycentric of the hit in the BVH triangle (its corners are the tris' corners in order)
      const q = [0, 1, 2].map((k) => { const j = idx ? idx.getX(hit.faceIndex * 3 + k) : hit.faceIndex * 3 + k; return [gp.getX(j), gp.getY(j), gp.getZ(j)]; });
      const order = [0, 1, 2].map((k) => (idx ? idx.getX(hit.faceIndex * 3 + k) : hit.faceIndex * 3 + k) - t * 3);
      const p = [hit.point.x, hit.point.y, hit.point.z];
      const area = (a, b, c) => Math.hypot(...cross(sub(b, a), sub(c, a)));
      const A0 = area(q[0], q[1], q[2]) || 1e-12;
      const w = [area(p, q[1], q[2]) / A0, area(q[0], p, q[2]) / A0, area(q[0], q[1], p) / A0];
      let u = 0, v = 0;
      for (let k = 0; k < 3; k++) { const ti = htr[t * 6 + order[k] * 2 + 1]; u += huv[ti * 2] * w[k]; v += huv[ti * 2 + 1] * w[k]; }
      const fx = Math.max(0, Math.min(HW - 1.001, u * HW - 0.5)), fy = Math.max(0, Math.min(HW - 1.001, (1 - v) * HW - 0.5));
      const root = fieldAt(ab, HW, HW, fx, fy);
      return { under: ss(0.05, 0.03, hit.distance), root: Math.min(1, root * 1.6) };
    };
  })();
  // the mouth corners split back along the cheeks towards the ears (the jaw ripped them open): a raw gash ~3.4 cm long,
  // ~1.2 cm wide at the corner, tapering; a swollen, inflamed rim round it (`tearRim`), so the unhinged read survives
  // at a few metres. Returns { core, rim } (0..1).
  // (measured on the cheek in cylindrical coordinates about the head's vertical axis, so it follows the surface)
  const tearAxisZ = B.head.head.z - 0.01;
  const tearField = (P) => {
    let core = 0, rim = 0;
    if (Math.abs(P[1] - A.mouth[1]) > 0.035 || P[2] < tearAxisZ) return { core, rim };
    const R = Math.hypot(P[0], P[2] - tearAxisZ), phi = Math.atan2(P[0], P[2] - tearAxisZ);
    for (const cn of lipCorners) {
      const side = Math.sign(cn[0]);
      const R0 = Math.hypot(cn[0], cn[2] - tearAxisZ), phi0 = Math.atan2(cn[0], cn[2] - tearAxisZ);
      if (Math.abs(R - R0) > 0.03) continue;
      const al = (phi - phi0) * side * (R + R0) / 2;              // along the cheek, towards the ear
      const ac = P[1] - (cn[1] + 0.16 * Math.max(0, al));           // rising a little towards the ear
      if (al < -0.006 || al > 0.045) continue;
      const w = 0.0085 * (1 - ss(0.0, 0.04, al)) + 0.0015;
      const jag = N.noise(al * 300, side, 1.1) * 0.0014 + N.noise(al * 90, side, 4.2) * 0.0015;
      const a = Math.abs(ac + jag);
      const end = 1 - ss(0.03, 0.04, al);
      core = Math.max(core, (1 - ss(w * 0.5, w, a)) * end * ss(-0.006, 0.0, al));
      rim = Math.max(rim, (1 - ss(w * 1.1, w * 2.4, a)) * (1 - ss(0.034, 0.045, al)) * ss(-0.006, 0.002, al));
    }
    return { core, rim };
  };
  const tearAt = (P) => tearField(P).core;
  const skin = lib.paintSkin(h, {
    seed: 41, base, size: 2048, normalSize: 1024, ormSize: 1024,
    pallor: 0, mottle: 0.35, veins: 0, bruises: 0.25, socket: 0.85, lips: 0, grime: 0.25,
    coveredDarken: 0.6, coveredShade: 0.15, normalStrength: 2.6, roughness: 0.55,
    blood: {},
    extra: (P, Nn, c, st) => {
      const sacK = onSac(P);
      // ---- vein network: dark green-black, densest on the neck, the sac, the temples, the chest, the forearms
      {
        let dens = 0.25;
        dens += 1.1 * (1 - ss(0.0, 0.1, Math.abs(P[1] - (sacC[1])))) * (Math.abs(P[0]) < 0.11 ? 1 : 0);
        dens += 0.8 * (1 - ss(0.025, 0.07, Math.min(dist(P, [0.065, eyeY + 0.02, eyeZ - 0.025]), dist(P, [-0.065, eyeY + 0.02, eyeZ - 0.025]))));
        dens += 0.5 * (1 - ss(0.0, 0.12, Math.abs(P[1] - (yChest + 0.08))));
        const fa = Math.min(foreL(P).d, foreR(P).d);
        dens += 0.5 * (1 - ss(0.04, 0.07, fa));
        if (P[1] > eyeY - 0.07 && P[2] > eyeZ - 0.02) dens *= 0.5;
        dens *= ss(-0.5, 0.15, N.fbm(P[0] * 3 + 9, P[1] * 3, P[2] * 3, 2) + 0.15);
        // limbs / neck: veins run along the body; on the sac they branch every way (domain-warped, isotropic)
        const wq = N.fbm(P[0] * 9 + 3, P[1] * 9, P[2] * 9, 2) * 0.03;
        const vA = N.ridged(P[0] * 26, P[1] * 15, P[2] * 26, 3), vB = N.ridged((P[0] + wq) * 34, (P[1] - wq) * 34, (P[2] + wq) * 34, 3);
        const v = mix(vA, vB, ss(0.05, 0.4, sacK)), v2 = N.ridged(P[0] * 70 + 7, P[1] * 50, P[2] * 70, 2);
        const main = ss(0.42, 0.72, v) * dens, fine = ss(0.7, 0.9, v2) * dens * 0.5;
        mul(c, [0.84, 0.92, 0.74], ss(0.2, 0.42, v) * (1 - ss(0.42, 0.72, v)) * dens * 0.6);
        over(c, sacK > 0.1 ? C.veinSac : C.vein, Math.min(1, main * 0.85 + fine * 0.45));
        st.h += main * 0.9 + fine * 0.25;
      }
      // ---- the throat sac: stretched thin, glossy, paler and greener in the middle, stretch marks round it, pustules
      if (sacK > 0) {
        const l = lumOf(c);
        over(c, mix3(C.sacSkin, C.sacPale, ss(0.5, 1, sacK)), sacK * 0.7);
        // striae: thin pale-pink lines across the swelling (horizontal, wavy)
        const stri = ss(0.85, 0.97, Math.abs(Math.sin((P[1] * 260 + N.fbm(P[0] * 20, P[1] * 8, 1.1, 2) * 4))) ) * ss(0.2, 0.6, N.fbm(P[0] * 14, P[1] * 4, 3.3, 2) + 0.2);
        over(c, C.striae, stri * sacK * 0.55);
        st.h -= stri * sacK * 0.3;
        const pus = 1 - ss(0.07, 0.12, N.worley(P[0] * 60, P[1] * 60, P[2] * 60));
        over(c, C.pustule, pus * ss(0.3, 0.9, sacK) * 0.8);
        st.h += pus * sacK * 1.4;
        st.ro = mix(st.ro, 0.4, sacK);
      }
      // ---- head: torn mouth corners, burnt lips, sockets, scalp (bald patches burnt raw), sparse brows
      if (P[1] > neckY) {
        const tf = tearField(P), tr = tf.core;
        if (tf.rim > 0) { over(c, C.tearRim, tf.rim * 0.55); st.h += tf.rim * (1 - tr) * 0.5; }
        if (tr > 0) { over(c, mix3(C.raw, C.rawDeep, ss(0.35, 1, tr)), Math.min(1, tr * 1.4)); st.h -= tr * 2.2; st.ro = mix(st.ro, 0.25, tr); }
        // lips: blackened, cracked, acid-burnt
        const dl = Math.min(dist(P, lipLow), dist(P, cavity.lipUp));
        over(c, C.lipBurn, (1 - ss(0.008, 0.02, dl)) * 0.7);
        // scalp under the hair shell (a ray along the normal meets it within 3 cm): hair-root grey where hair grows,
        // raw, acid-burnt scalp in the bald patches (the hair alpha is cut away over them)
        const sc = scalpAt(P, Nn);
        if (sc.under > 0) {
          const bp = ss(0.4, 0.85, bald(P));
          over(c, C.hairRoot, sc.under * Math.max(0.15, sc.root) * (1 - bp * 0.5) * 0.92);
          if (bp > 0) {
            const n2 = N.fbm(P[0] * 40, P[1] * 40, P[2] * 40, 3);
            over(c, mix3(C.scalpBurn, C.burnDeep, ss(0.1, 0.6, n2 + 0.2)), sc.under * bp * 0.75);
            over(c, C.necro, sc.under * bp * ss(0.2, 0.5, N.noise(P[0] * 120, P[1] * 120, P[2] * 120)) * 0.5);
            st.h += sc.under * bp * N.ridged(P[0] * 90, P[1] * 90, P[2] * 90, 2) * 0.6;
          }
        }
        // sparse, half-gone brows
        const ax = Math.abs(P[0]);
        if (P[2] > eyeZ - 0.02 && Math.abs(P[1] - eyeY - 0.022) < 0.012 && ax > 0.012 && ax < 0.058) {
          const u = (ax - 0.035) / 0.023;
          const y0 = eyeY + 0.019 + 0.005 * (1 - u * u);
          const k = (1 - ss(0.0012, 0.0028, Math.abs(P[1] - y0))) * (1 - ss(0.85, 1.0, Math.abs(u))) * ss(0.1, 0.5, N.noise(P[0] * 900, P[1] * 300, 1.7) + 0.2);
          over(c, C.hairRoot, k * 0.6);
        }
      }
      // ---- acid burns: raw red centre, yellow-white blistered necrosis, dark scorched crust at the edge, inflamed halo
      // drool tracks: wet, yellow-green chemical burn, curdled crust along the middle, orange-brown inflamed edges
      const ch = chanAt(P, Nn);
      if (ch > 0) {
        const n1 = N.fbm(P[0] * 110, P[1] * 60, P[2] * 110, 3);
        over(c, C.chanEdge, ss(0.0, 0.4, ch) * 0.55);
        over(c, mix3(C.chanWet, C.necro, ss(-0.1, 0.5, n1)), ss(0.35, 0.8, ch) * 0.85);
        over(c, C.scorch, ss(0.25, 0.4, ch) * (1 - ss(0.4, 0.55, ch)) * 0.45);
        st.h += ss(0.35, 0.8, ch) * ss(-0.1, 0.4, n1) * 0.5 - ss(0.2, 0.5, ch) * 0.4;
        st.ro = mix(st.ro, 0.25, ss(0.35, 0.8, ch));
      }
      const bn = burnAt(P);
      if (bn > 0) {
        over(c, C.burnHalo, ss(0.0, 0.35, bn) * 0.45);
        const n1 = N.fbm(P[0] * 90, P[1] * 90, P[2] * 90, 3);
        over(c, C.necro, ss(0.25, 0.55, bn) * ss(-0.1, 0.4, n1) * 0.85);
        over(c, mix3(C.burnRaw, C.burnDeep, ss(-0.2, 0.5, n1)), ss(0.6, 0.9, bn) * 0.8);
        over(c, C.scorch, ss(0.3, 0.45, bn) * (1 - ss(0.45, 0.6, bn)) * 0.5);
        st.h += ss(0.25, 0.55, bn) * ss(-0.1, 0.4, n1) * 0.8 - ss(0.55, 0.9, bn) * 0.9;
        st.ro = mix(st.ro, 0.32, ss(0.55, 0.85, bn));
      }
      // ---- hospital details: IV cannula taped on the back of the right hand (bruised round it), ECG pads on the chest
      {
        const iv = handIV(P);
        if (iv.bruise > 0) over(c, C.bruiseIV, iv.bruise * 0.6);
        if (iv.tape > 0) { over(c, C.tape, iv.tape); st.h += iv.tape * 0.4; st.ro = mix(st.ro, 0.75, iv.tape); }
        if (iv.tube > 0) { over(c, C.tube, iv.tube); st.ro = mix(st.ro, 0.3, iv.tube); }
        for (const e of ecg) {
          const d = dist(P, e);
          if (d > 0.02) continue;
          over(c, C.tape, (1 - ss(0.0105, 0.012, d)) * 0.95);
          over(c, C.ecgGel, (1 - ss(0.0035, 0.0045, d)) * 0.9);
          st.h += (1 - ss(0.0105, 0.012, d)) * 0.3;
        }
      }
      // ---- nails: long, yellow-black, broken; fingertips raw from the acid
      let dt = 1;
      for (const t of tips) dt = Math.min(dt, dist(P, t));
      mul(c, [0.72, 0.74, 0.6], (1 - ss(0.02, 0.07, dt)) * 0.5);
      over(c, C.nail, (1 - ss(0.005, 0.012, dt)) * 0.75);
      // ---- bare feet: filthy soles, grime up the shins
      if (P[1] < 0.2) {
        const sole = ss(0.3, -0.4, Nn[1]) * (1 - ss(0.02, 0.05, P[1]));
        const dirt = ss(-0.45, 0.35, N.fbm(P[0] * 26, P[1] * 26, P[2] * 26, 4) + (0.11 - P[1]) * 9);
        over(c, C.mud, dirt * 0.6);
        over(c, C.soleDirt, Math.max(sole, ss(0.55, 0.9, dirt) * 0.4));
        st.ro = mix(st.ro, 0.85, dirt);
      }
      // ---- dried bile crust smeared round the mouth / chin
      {
        const dm = Math.hypot((P[0] - A.mouth[0]) * 0.8, (P[1] - (A.mouth[1] - 0.012)) * 0.7, (P[2] - A.mouth[2]) * 1.2);
        const k = (1 - ss(0.025, 0.05, dm + N.fbm(P[0] * 50, P[1] * 50, P[2] * 50, 3) * 0.012)) * (Nn[2] > -0.2 ? 1 : 0) * (1 - tearField(P).rim);
        over(c, mix3(C.bileDeep, C.tide, ss(-0.2, 0.5, N.noise(P[0] * 70, P[1] * 70, P[2] * 70))), k * 0.55);
      }
      st.bl = 0;
    },
  });
  if (skin.albedo.width === base.width) pullPush(skin.albedo, base.mask);
  TR.snap('skin: paintSkin', skin.albedo, body);

  // emissive (skin): the acid glowing through the thin skin of the sac (pustules, vein web), the torn mouth corners
  const skinGlow = (() => {
    const R = texSize(1024);
    const bp = h.basePart({ name: 'glow' });
    const surf = { tris: bp.tris(), pos: h.pos, nrm: bp.normals() };
    const f = bakeField(surf, h.baseObj.uvs, R, (P, Nn) => {
      let g = 0;
      const sk = onSac(P);
      if (sk > 0) {
        // the acid shining through the thin, stretched skin like a lantern: brighter low on the sac where it is
        // thinnest, blotchy, the vein web dark against it; the pustules hot spots
        const wq = N.fbm(P[0] * 9 + 3, P[1] * 9, P[2] * 9, 2) * 0.03;
        const vein = ss(0.42, 0.72, N.ridged((P[0] + wq) * 34, (P[1] - wq) * 34, (P[2] + wq) * 34, 3));
        const thin = ss(0.3, 0.95, sk) * mix(0.5, 1, ss(sacC[1] + 0.025, sacBot + 0.012, P[1]));
        const blot = 0.7 + 0.3 * N.fbm(P[0] * 20, P[1] * 20, P[2] * 20, 2);
        // (x1.35 over the first version: the green throat is the read that tells her apart at 15-25 m)
        g = Math.min(1, thin * 0.62 * blot * (1 - vein * 0.85));
        const pus = 1 - ss(0.06, 0.11, N.worley(P[0] * 60, P[1] * 60, P[2] * 60));
        g = Math.max(g, pus * ss(0.35, 0.9, sk) * 0.95);
      }
      g = Math.max(g, chanAt(P, Nn) * 0.15);
      return g;
    }, { fill: 0, blur: 1 });
    const img = createImage(R, R, [0, 0, 0, 255]);
    for (let i = 0; i < R * R; i++) {
      const g = f[i];
      img.data[i * 4] = toByte(GLOW[0] * g); img.data[i * 4 + 1] = toByte(GLOW[1] * g); img.data[i * 4 + 2] = toByte(GLOW[2] * g);
    }
    return img;
  })();

  // ---- hide body faces under intact cloth (keep a band above the hem visible from below)
  {
    const bn = body.normals();
    const cov = new Uint8Array(body.nVerts);
    for (let v = 0; v < body.nVerts; v++) {
      const P = [body.pos[v * 3], body.pos[v * 3 + 1], body.pos[v * 3 + 2]];
      if (P[1] < hemY + 0.16 && P[1] < yPelvis - 0.1) continue;
      cov[v] = coverage(P, [bn[v * 3], bn[v * 3 + 1], bn[v * 3 + 2]]) >= 0.999 ? 1 : 0;
    }
    let hidden = 0;
    body.obj.faces.forEach((f, fi) => { if (body.keep[fi] && f.v.every((v) => cov[v])) { body.keep[fi] = 0; hidden++; } });
    console.log(`${TAG} ${hidden} body faces hidden under the gown, body ${body.triCount()} tris`);
  }

  // ---- AO + cloth contact shadow -> ORM occlusion only; hair roots on the scalp -> albedo pigment
  const surfOf = (part) => ({ tris: part.tris(), pos: part.pos, nrm: part.normals() });
  const baseSkin = surfOf(h.basePart({ name: 'ao' }));
  const gownS = surfOf(gown), hairS = surfOf(hair);
  const gownFaceOf = gown._faceOf.slice();
  const RA = texSize(512);
  {
    // (the thin, stringy hair is left out: its shell blacked out the scalp seen through the strand gaps / bald patches)
    const bodyBvh = occluders([baseSkin]);
    const clothBvh = occluders([gownS]);
    const idx = clothBvh.geometry.index;
    const opaque = (hit) => {
      const tri = Math.floor((idx ? idx.getX(hit.faceIndex * 3) : hit.faceIndex * 3) / 3);
      return gownCut([hit.point.x, hit.point.y, hit.point.z], faceKind[gownFaceOf[tri]]) <= 0;
    };
    const ao = bakeField(baseSkin, h.baseObj.uvs, RA, occTracer(bodyBvh, { rays: 16, maxDist: 0.09 }));
    const sh = bakeField(baseSkin, h.baseObj.uvs, RA, occTracer(clothBvh, { rays: 12, maxDist: 0.06, opaque, seed: 7 }), { blur: 1 });
    applyOcclusion(skin.orm, [ao, sh], RA, (a, s) => mix(1, a, 0.85) * mix(1, s * s, 0.9));
  }
  {
    const bvh = occluders([gownS, baseSkin]);
    const idx = bvh.geometry.index, nG = gownS.tris.length / 6;
    const opaque = (hit) => {
      const tri = Math.floor((idx ? idx.getX(hit.faceIndex * 3) : hit.faceIndex * 3) / 3);
      if (tri >= nG) return true;
      return gownCut([hit.point.x, hit.point.y, hit.point.z], faceKind[gownFaceOf[tri]]) <= 0;
    };
    const ao = bakeField(gownS, gown.obj.uvs, RA, occTracer(bvh, { rays: 16, maxDist: 0.12, opaque, seed: 3 }));
    applyOcclusion(cloth.orm, [ao], RA, (a) => mix(1, a, 0.6));
  }
  body.material = lib.material('skin', { ...skin, emissiveMap: skinGlow, emissive: [1, 1, 1] });
  gown.material = lib.material('cloth', { ...cloth, alpha: true, doubleSided: true, pngBits: 8 });
  TR.snap('skin: final', skin.albedo, body);
  TR.snap('gown: final', cloth.albedo, gown);
  regionMeans(h, skin.albedo, { eyeY, eyeZ, sacK: onSac, armL, armR, foreL, foreR });
  if (process.env.SPITTER_DUMP) {
    const d = process.env.SPITTER_DUMP.replace(/\/?$/, '/');
    lib.savePNG(lib.resize(skin.albedo, 1024, 1024), d + 'skin_albedo.png');
    lib.savePNG(lib.resize(skin.normal, 1024, 1024), d + 'skin_normal.png');
    lib.savePNG(lib.resize(cloth.albedo, 1024, 1024), d + 'gown_albedo.png');
    lib.savePNG(skinGlow, d + 'skin_glow.png');
  }

  // ---- eyes: jaundiced, bloodshot, a clouded yellow-green iris with a faint glow
  const eyeTex = await lib.texture('system', 'eyes/materials/brown_eye.png', 512);
  const ae = acidEyes(eyeTex, N);
  eyes.material = lib.material('eye', { albedo: ae.albedo, emissiveMap: ae.emissive, emissive: [1, 1, 1], roughness: 0.15 });
  eyes.extras.noSimplify = true;

  // ---- teeth: stained yellow-green, rotten, three gone. The gums of teeth_base go: they are bound to both the upper
  // and the lower teeth helpers, so the unhinged jaw stretched them into a red wedge across the mouth (the cavity is
  // the gum colour at its rim anyway)
  const teethTex = await lib.texture(teeth.asset.textures.diffuse, 512);
  {
    const W = teethTex.width, uv = teeth.obj.uvs;
    let gums = 0;
    teeth.obj.faces.forEach((f, fi) => {
      if (!teeth.keep[fi]) return;
      let u = 0, v = 0;
      for (const t of f.t) { u += uv[t * 2] / f.t.length; v += uv[t * 2 + 1] / f.t.length; }
      const i = (Math.min(W - 1, Math.floor((1 - v) * W)) * W + Math.min(W - 1, Math.floor(u * W))) * 4;
      const r = teethTex.data[i], g = teethTex.data[i + 1], b = teethTex.data[i + 2];
      if (r > g * 1.35 && r > b * 1.3) { teeth.keep[fi] = 0; gums++; }
    });
    const pulled = pullTeeth(teeth, [[0.008, 'up'], [-0.016, 'up']]);
    console.log(`${TAG} teeth: ${gums} gum faces removed, ${pulled} tooth faces pulled, ${DROP_LOWER_TEETH ? `lower row dropped (${dropLowerTeeth(teeth)} faces), ` : ''}${teeth.triCount()} tris left`);
  }
  teeth.material = lib.material('teeth', {
    albedo: lib.grungeTexture(teethTex, { seed: 23, tint: [0.66, 0.66, 0.38], darken: 0.3, dirt: 0.8, blood: 0.2, freq: 12 }),
    orm: createImage(64, 64, [150, 80, 0, 255]),
  });


  // ---- gore parts: the mouth cavity (dark flesh going to a hot green glow down the throat), the drool strands
  const goreTex = goreTextures();
  // (the cavity matte: its walls are seen almost edge-on; the drool wet)
  const goreMat = lib.material('gore', { albedo: goreTex.albedo, emissiveMap: goreTex.emissive, emissive: [1, 1, 1], roughness: 0.62, doubleSided: true });
  const droolMat = lib.material('gore', { albedo: goreTex.albedo, emissiveMap: goreTex.emissive, emissive: [1, 1, 1], roughness: 0.3, doubleSided: true });
  const mouth = toPart(lib, h, cavity.g, 'mouth', 'gore', () => [['head', 1]]);
  mouth.material = goreMat;
  {
    // LOD1 (beyond 22 m) gets a 16-tri glowing cone in the mouth instead of the full cavity + tongue: the build
    // exports LOD1 with its own (downscaled) material objects, so the part renders the cap whenever it does not
    // carry the LOD0 material
    const cap = toPart(lib, h, mouthCap(cavity), 'mouth', 'gore', () => [['head', 1]]);
    const full = mouth.toRender.bind(mouth), small = cap.toRender.bind(cap);
    mouth.toRender = function () { return this.material === goreMat ? full() : small(); };
  }
  const drool = toPart(lib, h, droolGeo, 'drool', 'gore', () => [['head', 1]]);
  drool.material = droolMat;
  const gearMat = lib.material('gear', { albedo: wristbandTexture(), roughness: 0.5, doubleSided: true });
  const band = toPart(lib, h, bandGeo, 'wristband', 'gear', () => [['lowerarm_l', 0.4], ['hand_l', 0.6]]);
  band.material = gearMat;
  const tiesPart = toPart(lib, h, tieStrings(h, gown, ties, slitX), 'ties', 'gear', () => [['spine_03', 1]]);
  tiesPart.material = gearMat;

  // ---- gown skinning: the skirt is one loose tube, not two trouser legs. Pelvis-dominant at the waistband, blending
  // towards an even share of both thighs at the hem (no single thigh above 0.4, a mild bias to the near side across
  // the centre lines), so a raised knee lifts the cloth only part way and the front never becomes a shelf. Every
  // torso / skirt vertex is _seg 0: a severed leg (or head) never carries fabric away.
  {
    const iTL = B.thigh_l.index, iTR = B.thigh_r.index, iP = B.pelvis.index;
    const legBone = new Set(['thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r', 'ball_l', 'ball_r'].map((n) => B[n].index));
    let n = 0;
    for (let v = 0; v < gown.nVerts; v++) {
      if (!torsoV[v] || sleeveV[v]) continue;
      gown.seg[v] = 0;
      const x = gown.pos[v * 3], y = gown.pos[v * 3 + 1];
      if (y > yPelvis + 0.03) continue;
      const t = ss(yPelvis + 0.02, hemY + 0.02, y);
      const tot = 0.78 * Math.pow(t, 0.9), side = Math.max(-1, Math.min(1, x / 0.09));
      let nearW = tot * (0.5 + 0.12 * Math.abs(side)), farW = tot - nearW;
      nearW = Math.min(0.4, nearW); farW = Math.min(0.4, farW);
      const wl = side >= 0 ? nearW : farW, wr = side >= 0 ? farW : nearW;
      const rest = (gown.weights[v] || []).filter(([b]) => !legBone.has(b));
      const rs = rest.reduce((a, [, w]) => a + w, 0);
      const remain = 1 - wl - wr;
      let list = rs > 0.05 ? rest.map(([b, w]) => [b, w / rs * remain]) : [[iP, remain]];
      list.push([iTL, wl], [iTR, wr]);
      list = list.filter(([, w]) => w > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
      const sum = list.reduce((a, [, w]) => a + w, 0);
      gown.weights[v] = list.map(([b, w]) => [b, w / sum]);
      n++;
    }
    // the neckline rides on the chest (spine_03), not the craning neck, so it does not gape round the sac
    for (let v = 0; v < gown.nVerts; v++) {
      if (!torsoV[v] || gown.pos[v * 3 + 1] < yChest + 0.12) continue;
      const list = gown.weights[v] || [];
      const nk = list.filter(([b]) => b === B.neck_01.index || b === B.head.index).reduce((a, [, w]) => a + w, 0);
      if (nk <= 0) continue;
      const out = list.filter(([b]) => b !== B.neck_01.index && b !== B.head.index);
      const s3 = out.find(([b]) => b === B.spine_03.index);
      if (s3) s3[1] += nk * 0.8; else out.push([B.spine_03.index, nk * 0.8]);
      out.push([B.neck_01.index, nk * 0.2]);
      gown.weights[v] = out.sort((a, b) => b[1] - a[1]).slice(0, 4);
    }
    console.log(`${TAG} gown: ${n} skirt / lower-panel verts reweighted (pelvis -> both thighs, max 0.4 each)`);
  }

  // ---- posture (local euler degrees, on top of every clip, after the mixer): the shoulders rolled forward and hiked
  // (clavicles protracted), the neck craned forward with the head pitched back so it juts ahead of the chest, the sac
  // hanging under it and the jaw gaping at the target; the right forearm clutched against the chest / sac (asymmetric
  // silhouette: told apart from walker_c at range by it and the green throat), long fingers hooked.
  // `poseOffsets` is what the game applies today, in EVERY state. Measured on the skinned mesh in the face-down / crawl /
  // knockdown clips, every degree of spine flexion drives the head and forearms into the floor (12 deg of spine alone:
  // -16 cm at the end of death_front), so this set keeps the spine nearly straight and the neck jut moderate (death_front
  // end: head bone +1.6 cm, face >= -5 cm, only the sac ~-10 cm under the chest; crawl / knockdown / get_up / eat /
  // crawl_attack >= -5 cm). `poseOffsetsUpright` is the full hunch for a game that honours `poseOffsetsUprightOnly` +
  // `poseOffsetWeights` (blend towards identity by state): it should apply poseOffsetsUpright x weight instead.
  const fingers = {};
  for (const s of ['l', 'r']) for (const f of ['index', 'middle', 'ring', 'pinky']) Object.assign(fingers, { [`${f}_01_${s}`]: [0, 0, 14], [`${f}_02_${s}`]: [0, 0, 22], [`${f}_03_${s}`]: [0, 0, 18] });
  const poseOffsets = {
    spine_03: [3, 0, 0], neck_01: [POSE.neck, 0, 0], head: [POSE.head, 4, 7],
    clavicle_l: [POSE.protract, 0, 4], clavicle_r: [POSE.protract, 0, -4], ...POSE.arm, ...fingers,
  };
  const poseOffsetsUpright = {
    spine_01: [2, 0, 0], spine_02: [5, 0, 0], spine_03: [5, 0, 0], neck_01: [22, 0, 0], head: [-30, 4, 7],
    clavicle_l: [18, 0, 4], clavicle_r: [18, 0, -4], upperarm_r: [20, 0, 22], lowerarm_r: [70, 0, 0], ...fingers,
  };

  // ---- hitboxes: thin limbs from the naked base mesh; the neck capsule fattened for the sac
  const parts = [body, gown, eyes, teeth, hair, mouth, drool, band, tiesPart];
  const allHb = computeHitboxes(h, [body, gown].map((p) => p.toRender()));
  const bodyHb = computeHitboxes(h, [h.basePart({ name: 'hb' }).toRender()]);
  const hitboxes = { ...allHb.hitboxes }, capsules = { ...allHb.capsules };
  const setHb = (key, bone, r, to) => {
    r = +r.toFixed(3);
    hitboxes[key] = to ? [bone, r, to] : [bone, r];
    const b = B[bone], e = to ? B[to].head : b.tail;
    capsules[key] = { bone, radius: r, length: +b.head.distanceTo(e).toFixed(3), ...(to ? { to } : {}) };
  };
  for (const k of ['upperarm_l', 'upperarm_r']) setHb(k, k, Math.min(0.05, Math.max(0.042, bodyHb.hitboxes[k][1] + 0.004)));
  for (const k of ['lowerarm_l', 'lowerarm_r']) setHb(k, k, Math.min(0.04, Math.max(0.032, bodyHb.hitboxes[k][1])));
  setHb('hand_l', 'hand_l', 0.04, 'middle_01_l');
  setHb('hand_r', 'hand_r', 0.04, 'middle_01_r');
  setHb('chest', 'spine_03', Math.min(0.13, Math.max(0.115, bodyHb.hitboxes.chest[1])));
  // the loose shift is pelvis-weighted down to the knee: the trunk / thigh capsules come from the body (+ a little for
  // the cloth), not from the skirt's hem
  setHb('spine', 'spine_01', Math.min(0.15, bodyHb.hitboxes.spine[1] + 0.02));
  setHb('pelvis', 'pelvis', Math.min(0.15, Math.max(0.12, bodyHb.hitboxes.pelvis[1] + 0.02)));
  for (const k of ['thigh_l', 'thigh_r']) setHb(k, k, Math.min(0.1, bodyHb.hitboxes[k][1] + 0.025));
  setHb('neck', 'neck_01', Math.max(0.075, allHb.hitboxes.neck[1]));
  setHb('head', 'head', 0.1);
  console.log(`${TAG} hitboxes ${JSON.stringify(hitboxes)}`);
  TR.report();

  return {
    human: h,
    parts,
    budget: 9000,
    partBudget: { body: 3800, clothes: 2500, teeth: 420, hair: 1250 },
    extras: {
      archetype: 'spitter', gender: 'female', variant: 'gaunt woman in a torn hospital gown; unhinged jaw, glowing acid throat sac',
      hitboxes, capsules, poseOffsets, poseOffsetsUpright,
      // for the game: blend poseOffsetsUpright towards identity (~0.2 s) by state -- 0 when lying / crawling / feeding,
      // 0.3 during the two-arm swipes (the clip already bows deeply), 1 upright (any state not listed)
      poseOffsetsUprightOnly: true,
      poseOffsetWeights: { dead: 0, crawl: 0, crawl_attack: 0, knockdown: 0, get_up: 0, eat: 0, death_front: 0, death_back: 0, attack_a: 0.3, attack_b: 0.3, stagger: 0.6 },
    },
    // LOD1: the eyes, the drool, the wristband and the ties go (the eye caps in the mouth part close the sockets); the
    // mouth becomes a small glowing cone
    lod1: { budget: 2500, drop: ['teeth', 'wristband', 'eyes', 'drool', 'ties'], texScale: 0.5, partBudget: { clothes: 840, body: 1300, hair: 300 } },
  };
}

// ============================================================================================ palette (linear)
const C = {
  skin: lin([150, 152, 108]), jaundice: lin([166, 156, 92]), bileTone: lin([128, 148, 100]), livor: lin([132, 120, 126]),
  extrem: lin([112, 118, 98]), waxy: lin([196, 196, 160]),
  vein: lin([44, 60, 36]), veinSac: lin([34, 70, 26]),
  sacSkin: lin([172, 182, 110]), sacPale: lin([196, 204, 132]), striae: lin([196, 168, 150]), pustule: lin([214, 222, 120]),
  raw: lin([136, 32, 28]), rawDeep: lin([56, 10, 10]), lipBurn: lin([62, 48, 40]), tearRim: lin([168, 92, 78]),
  burnHalo: lin([172, 128, 100]), chanEdge: lin([150, 104, 62]), chanWet: lin([170, 176, 84]), burnRaw: lin([116, 50, 34]), burnDeep: lin([66, 30, 20]), necro: lin([204, 194, 134]), scorch: lin([62, 46, 28]),
  hairRoot: lin([74, 66, 56]), scalpBurn: lin([132, 92, 70]), nail: lin([92, 80, 44]), mud: lin([70, 62, 50]), soleDirt: lin([40, 34, 28]),
  tape: lin([214, 210, 196]), tube: lin([150, 170, 190]), ecgGel: lin([110, 116, 120]), bruiseIV: lin([110, 80, 104]),
  bile: lin([164, 160, 70]), bileDeep: lin([126, 122, 44]), tide: lin([104, 92, 44]),
  scorchHalo: lin([150, 140, 96]), scorch: lin([70, 52, 30]), fray: lin([206, 214, 210]),
  dried: lin([92, 36, 28]), crust: lin([56, 26, 20]),
};
const GLOW = [0.32, 1.0, 0.1];
const SAC = { top: 0.006, bot: 0.03, rx: 0.062, amp: 0.082 };
// posture offsets (deg, see poseOffsets in build): neck flexion, head extension, clavicle protraction, the clutching arm
const DROP_LOWER_TEETH = false;
const POSE = { neck: 10, head: -18, protract: 16, arm: { upperarm_r: [12, 0, 18], lowerarm_r: [40, 0, 0] } };

// ECG electrode positions / IV cannula: set by setDetails() from the build (module-level for the painters)
let ecg = [];
let handIV = () => ({ tape: 0, tube: 0, bruise: 0 });
