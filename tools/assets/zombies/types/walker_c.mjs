// walker_c — 慢跑屍 "Jogger", female walker. A young woman (~1.66 m, slim, mid-twenties) turned on her morning run:
// a snug coral-pink cropped sports top and slate-teal running leggings with a broad pale side stripe
// (female_sportsuit01), one filthy white trainer (shoes05) — the right one is gone, that foot is bare, black-soled and
// torn up — and a phone in a sports armband on the left upper arm (cracked, blood-smeared screen). Messy, greasy,
// dark-brown hair (long01 shell) to the shoulder blades, ending in uneven clumps with dry, dusty ends, a few matted
// strands over her face. The CC0 female zombie skin (sohh_female_zombie_skin, skins03, 4096² diffuse + bump) graded
// to a cold ash-grey corpse tone with violet lividity and dark marbled veins (its bump at ~45-60 %).
// Gore: three claw gouges raked down her left cheek from the cheekbone (~60°, raw red centres, crusted edges, swollen
// halo, beaded drips), two short tears on the right of the forehead; a torn bite on the right shoulder where the sleeve
// was ripped away; a bite in the left flank of the bare midriff bleeding into the waistband; fresh, wet blood on both
// hands to mid-forearm (she has been feeding), smeared round the mouth and chin and soaked into the neckline; bloody
// wipe marks on the leggings' thighs; a grazed, gravel-scraped left knee inside the ripped-open leggings.
// Silhouette: hair to the shoulder blades, cropped top + bare midriff, left legging leg ripped open thigh to shin, one
// bare foot, the armband; head lolled to her right, left shoulder dropped (poseOffsets, applied on top of every clip).
//
// Everything specific to this character is implemented in this file on top of the shared lib (UV rasteriser, blur,
// normal-from-height, hitbox measure, skin-segment table).
//
// Albedo values (in-game read): keep the painted base colour at real-world values (sRGB mean over painted texels,
// tools/assets/zombies/albedo.mjs; the build logs the per-region means: skin ~100-115, top ~125, leggings ~90-100,
// hair ~50) and put every shadow-like term (ray-traced AO, cloth contact shadow, covered skin, garment inner layers)
// into the ORM occlusion channel, never on top of it into the albedo: that double darkening (and charcoal leggings +
// near-black hair) made her a black silhouette in the game's backlit / shaded lighting.
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { rasterUV, texelSurface, texelAttr } from '../lib/raster.mjs';
import { blurField, createImage, normalFromHeight } from '../lib/image.mjs';
import { boneSegment } from '../lib/rig.mjs';
import { computeHitboxes } from '../lib/export.mjs';
import { albedoTracer } from '../lib/albedoTrace.mjs';

// ---------- small colour / vector helpers (linear-light work, sRGB 8-bit storage)
const S2L = new Float32Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const toByte = (x) => { x = Math.max(0, x); const s = x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(s * 255))); };
const lin = (rgb) => rgb.map((v) => S2L[v]);
const lum = (r, g, b) => r * 0.2126 + g * 0.7152 + b * 0.0722;
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
const hash = (i) => { let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
const texSize = (s) => Math.max(64, Math.round(s * +(process.env.ZOMBIE_TEX_SCALE || 1)));
const V = (v) => [v.x, v.y, v.z];

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

/** Closest point on a bone's head->tail segment: {t (0 head .. 1 tail, unclamped), d (distance), a (axis point)}. */
function boneSeg(bone) {
  const a = V(bone.head), b = V(bone.tail);
  const d = sub(b, a), dd = dot(d, d);
  return (P) => {
    const t = ((P[0] - a[0]) * d[0] + (P[1] - a[1]) * d[1] + (P[2] - a[2]) * d[2]) / dd;
    const tc = clamp01(t);
    const ax = [a[0] + d[0] * tc, a[1] + d[1] * tc, a[2] + d[2] * tc];
    return { t, d: Math.hypot(P[0] - ax[0], P[1] - ax[1], P[2] - ax[2]), a: ax };
  };
}

// ---------- geometry helpers

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

/** Nearest vertex of the morphed base body to a 3D point. */
function nearestBody(h, T) {
  let best = 1e9, p = T;
  for (const v of h.baseObj.groupVerts('body')) {
    const d = Math.hypot(h.pos[v * 3] - T[0], h.pos[v * 3 + 1] - T[1], h.pos[v * 3 + 2] - T[2]);
    if (d < best) { best = d; p = [h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]]; }
  }
  return p;
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

/**
 * Evaluates fn(P, N, i) for every texel of a UV raster at resolution R (rest-pose surface position + normal),
 * blurs the result by `blur` texels. Texels outside the islands (beyond the gutter) stay `fill`.
 */
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

/** Ray-traced ambient occlusion (cosine-weighted, distance-attenuated) against a BVH -> fn for bakeField. */
function aoTracer(bvh, { rays = 16, maxDist = 0.1, near = 0.003 } = {}) {
  const dirs = hemiDirs(rays);
  const ray = new THREE.Ray();
  return (P, Nn, i) => {
    const ax = Math.abs(Nn[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const t = norm(cross(ax, Nn)), b = cross(Nn, t);
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

/**
 * Shadow of an alpha-cut garment on the skin under it: rays through torn holes (opaque(point) false) pass, so skin
 * seen through a hole is dark at the hole's rim and only a little lighter in its middle (reads as an opening).
 */
function clothShadowTracer(bvh, opaque, { rays = 10, maxDist = 0.06 } = {}) {
  const dirs = hemiDirs(rays);
  const ray = new THREE.Ray();
  return (P, Nn, i) => {
    const ax = Math.abs(Nn[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const t = norm(cross(ax, Nn)), b = cross(Nn, t);
    const a = hash(i + 7) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    let occ = 0;
    for (const d of dirs) {
      const x = d[0] * ca - d[1] * sa, y = d[0] * sa + d[1] * ca, z = d[2];
      ray.origin.set(P[0] + Nn[0] * 0.001, P[1] + Nn[1] * 0.001, P[2] + Nn[2] * 0.001);
      ray.direction.set(t[0] * x + b[0] * y + Nn[0] * z, t[1] * x + b[1] * y + Nn[1] * z, t[2] * x + b[2] * y + Nn[2] * z);
      let travelled = 0;
      for (let k = 0; k < 3; k++) {
        const hit = bvh.raycastFirst(ray, THREE.DoubleSide, 0, maxDist - travelled);
        if (!hit) break;
        travelled += hit.distance;
        if (opaque(hit.point)) { occ += 1 - 0.45 * (travelled / maxDist); break; }
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

/**
 * Multiplies the occlusion (R) channel of an ORM image by fn(...values) of fields baked at R x R (AO / contact
 * shadows go here, not into the albedo: three.js applies the aoMap to the ambient + environment light only).
 */
function applyOcclusion(orm, fields, R, fn) {
  const W = orm.width, vals = new Array(fields.length);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    for (let k = 0; k < fields.length; k++) vals[k] = fieldAt(fields[k], R, W, x, y);
    const i = (y * W + x) * 4;
    orm.data[i] = Math.round(orm.data[i] * clamp01(fn(...vals)));
  }
  return orm;
}

/** Applies fn(c linear rgb, ...values) to every texel of img with the baked fields sampled at that texel. */
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

/**
 * Normalised (island-aware) blur of an RGBA image blended in where mask > 0 (cover = Uint8 1 inside the UV islands,
 * so the black outside never bleeds in).
 */
function blendBlur(img, mask, cover, radius, amount) {
  const W = img.width, H = img.height, n = W * H;
  const cv = new Float32Array(n);
  for (let i = 0; i < n; i++) cv[i] = cover[i] * (1 - mask[i] * 0.95);
  const cb = blurField(cv, W, H, radius, 2);
  const ch = new Float32Array(n);
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < n; i++) ch[i] = img.data[i * 4 + c] * cv[i];
    const b = blurField(ch, W, H, radius, 2);
    for (let i = 0; i < n; i++) {
      const m = mask[i] * amount;
      if (m > 0 && cb[i] > 0.02) img.data[i * 4 + c] = Math.round(img.data[i * 4 + c] + (b[i] / cb[i] - img.data[i * 4 + c]) * m);
    }
  }
  return img;
}

/**
 * Pushes painted colours out of the UV islands (proxy UVs stray a little past the base mesh islands at finger and
 * toe tips): `passes` rings of 4-neighbour averaging into texels where mask == 0.
 */
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
}

// ---------- custom geometry -> skinned Part (mouth cavity, armband + phone)
class Geo {
  constructor() { this.P = []; this.UV = []; this.F = []; this.W = []; }
  v(p, uv, w = null) { this.P.push(p[0], p[1], p[2]); this.UV.push(uv[0], uv[1]); this.W.push(w); return this.P.length / 3 - 1; }
  tri(a, b, c) { this.F.push({ v: [a, b, c], t: [a, b, c], g: 0 }); }
  quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }
  get n() { return this.P.length / 3; }
}

/**
 * Base body vertices whose outward normal ray hits the garment within maxD: the tight leggings / top hardly list any
 * delete_verts (MakeHuman draws them on top by z-depth), so without this the whole body would stay under them and
 * poke through in motion. Uniform grid over the garment triangles, Möller-Trumbore per candidate.
 */
function rayCovered(h, part, maxD) {
  const P = part.pos, tris = part.tris();
  const cell = maxD, grid = new Map();
  const key = (x, y, z) => x + ',' + y + ',' + z;
  for (let i = 0; i < tris.length; i += 6) {
    const a = tris[i] * 3, b = tris[i + 2] * 3, c = tris[i + 4] * 3;
    const lo = [0, 1, 2].map((k) => Math.floor(Math.min(P[a + k], P[b + k], P[c + k]) / cell));
    const hi = [0, 1, 2].map((k) => Math.floor(Math.max(P[a + k], P[b + k], P[c + k]) / cell));
    for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
      const k = key(x, y, z);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(i);
    }
  }
  const nrm = h.basePart({ name: 'raycover' }).normals();
  const hp = h.pos, out = [];
  for (const v of h.baseObj.groupVerts('body')) {
    const o = [hp[v * 3] + nrm[v * 3] * 0.001, hp[v * 3 + 1] + nrm[v * 3 + 1] * 0.001, hp[v * 3 + 2] + nrm[v * 3 + 2] * 0.001];
    const d = [nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]];
    const cx = Math.floor(o[0] / cell), cy = Math.floor(o[1] / cell), cz = Math.floor(o[2] / cell);
    const seen = new Set();
    let hit = false;
    for (let x = cx - 1; x <= cx + 1 && !hit; x++) for (let y = cy - 1; y <= cy + 1 && !hit; y++) for (let z = cz - 1; z <= cz + 1 && !hit; z++) {
      for (const i of grid.get(key(x, y, z)) || []) {
        if (seen.has(i)) continue;
        seen.add(i);
        const a = tris[i] * 3, b = tris[i + 2] * 3, c = tris[i + 4] * 3;
        const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
        const p = cross(d, e2);
        const det = dot(e1, p);
        if (Math.abs(det) < 1e-12) continue;
        const inv = 1 / det;
        const t0 = [o[0] - P[a], o[1] - P[a + 1], o[2] - P[a + 2]];
        const u = dot(t0, p) * inv;
        if (u < 0 || u > 1) continue;
        const q = cross(t0, e1);
        const w = dot(d, q) * inv;
        if (w < 0 || u + w > 1) continue;
        const t = dot(e2, q) * inv;
        if (t > 0 && t < maxD) { hit = true; break; }
      }
    }
    if (hit) out.push(v);
  }
  return out;
}

/** Box: centre, frame axes X/Y/Z (unit), half sizes [hx,hy,hz]; flat faces, outward winding; uv rect per face. */
function box(g, c, ax, hs, uvr, uvFront = null) {
  const [X, Y, Z] = ax.map((a, i) => scl(a, hs[i]));
  const faces = [[X, Y, Z], [scl(X, -1), Z, Y], [Y, Z, X], [scl(Y, -1), X, Z], [Z, X, Y], [scl(Z, -1), Y, X]];
  faces.forEach(([n, u, v], fi) => {
    const o = add(c, n);
    const q = [sub(sub(o, u), v), sub(add(o, u), v), add(add(o, u), v), add(sub(o, u), v)];
    const r = fi === 0 && uvFront ? uvFront : uvr;
    const ids = q.map((p, k) => g.v(p, [k === 1 || k === 2 ? r[2] : r[0], k >= 2 ? r[3] : r[1]]));
    g.quad(ids[0], ids[1], ids[2], ids[3]);
  });
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

/**
 * Dark oral cavity: a skinned "mouth bag" sealed to the lip boundary loop of the body proxy (rim tucked 1.5 mm behind
 * the lip edge, ballooning back round the teeth, closing at the throat), plus caps behind the eyelid openings (hidden
 * inside the eyeballs at LOD0; they close the sockets when LOD1 drops the eyes). u < 0.5 cavity, u > 0.5 eye cap.
 */
function mouthCavity(h, body, A) {
  const loops = boundaryLoops(body);
  const P = (v) => [body.pos[v * 3], body.pos[v * 3 + 1], body.pos[v * 3 + 2]];
  const cen = (loop) => loop.reduce((a, v) => add(a, scl(P(v), 1 / loop.length)), [0, 0, 0]);
  const near = (c, r) => loops.map((l) => [l, dist(cen(l), c)]).filter(([, d]) => d < r).sort((a, b) => a[1] - b[1])[0]?.[0];
  const mouth = near(A.mouth, 0.035), eyes = [near(A.eyeL, 0.03), near(A.eyeR, 0.03)];
  if (!mouth) throw new Error('walker_c: mouth boundary loop not found');
  const headBvh = occluders([{ pos: body.pos, tris: body.tris() }]);
  const g = new Geo();
  const wOf = (v) => body.weights[v];
  const inside = (p, axis, minD = 0.0025) => {
    for (let k = 0; k < 12 && signedDist(headBvh, p) > -minD; k++) p = add(axis, scl(sub(p, axis), 0.85));
    return p;
  };
  const C = cen(mouth);
  const ringDef = [[0.0015, 1, 1, 0.06], [0.011, 1.12, 1.8, 0.22], [0.028, 0.88, 1.4, 0.38]]; // depth, sx, sy, u
  const rings = ringDef.map(([depth, sx, sy, u], ri) => mouth.map((v) => {
    const p = P(v), d = sub(p, C);
    let q;
    if (ri === 0) { const r = norm([d[0], d[1], 0]); q = [p[0] + r[0] * 0.0015, p[1] + r[1] * 0.0015, p[2] - depth]; }
    else q = inside([C[0] + d[0] * sx, C[1] + d[1] * sy, C[2] - depth], [C[0], C[1], C[2] - depth]);
    return g.v(q, [u, 0.5], wOf(v));
  }));
  const apex = g.v(inside([C[0], C[1] - 0.004, C[2] - 0.045], [C[0], C[1], C[2] - 0.04]), [0.46, 0.5], [['head', 1]]);
  const L = mouth.length;
  for (let r = 0; r + 1 < rings.length; r++) for (let k = 0; k < L; k++) g.quad(rings[r][k], rings[r][(k + 1) % L], rings[r + 1][(k + 1) % L], rings[r + 1][k]);
  for (let k = 0; k < L; k++) g.tri(rings[rings.length - 1][k], rings[rings.length - 1][(k + 1) % L], apex);
  for (const loop of eyes) {
    if (!loop) continue;
    const c = cen(loop);
    const rim = loop.map((v) => g.v(sub(P(v), [0, 0, 0.0025]), [0.78, 0.5], wOf(v)));
    const ci = g.v(sub(c, [0, 0, 0.004]), [0.78, 0.5], [['head', 1]]);
    for (let k = 0; k < rim.length; k++) g.tri(ci, rim[k], rim[(k + 1) % rim.length]);
  }
  return g;
}

/** Centripetal-ish Catmull-Rom resample of a 2D/3D polyline to n points. */
function smoothLine(pts, n) {
  const out = [];
  const m = pts.length - 1;
  for (let i = 0; i < n; i++) {
    const f = (i / (n - 1)) * m, k = Math.min(m - 1, Math.floor(f)), t = f - k;
    const p0 = pts[Math.max(0, k - 1)], p1 = pts[k], p2 = pts[k + 1], p3 = pts[Math.min(m, k + 2)];
    out.push(p1.map((_, j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t * t + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t * t * t)));
  }
  return out;
}

/**
 * Matted strands hanging from the hairline down over the face (a long clump over her right eye down to the jaw, a
 * thin one over the bridge of the nose, a short wisp over the left brow): ribbons draped in front of the face — each
 * vertex sits `clear` in front of the highest surface (hair cap / skin / eyeball) within a 1 cm disk behind it, so
 * they skim over the sockets instead of sinking into them, and hang further off the face towards the tips. Rigid on
 * the head. defs: [{pts: [[x, dy]...] (dy relative to eye height), w: [root, mid, tip] width, u: strand column}]
 */
function faceStrands(h, surfaces, A, defs) {
  const bvh = occluders(surfaces);
  const ray = new THREE.Ray(), eyeY = (A.eyeL[1] + A.eyeR[1]) / 2, eyeZ = (A.eyeL[2] + A.eyeR[2]) / 2;
  const front = (x, y) => {
    let best = -1;
    for (const [ox, oy] of [[0, 0], [0.01, 0], [-0.01, 0], [0, 0.01], [0, -0.01], [0.007, 0.007], [-0.007, 0.007], [0.007, -0.007], [-0.007, -0.007]]) {
      ray.origin.set(x + ox, y + oy, eyeZ + 0.4); ray.direction.set(0, 0, -1);
      const hit = bvh.raycastFirst(ray, THREE.DoubleSide, 0, 0.6);
      if (hit && hit.point.z > eyeZ - 0.08) best = Math.max(best, hit.point.z);
    }
    return best < 0 ? eyeZ - 0.02 : best;
  };
  const g = new Geo();
  for (const d of defs) {
    const pts = smoothLine(d.pts.map(([x, dy]) => [x, eyeY + dy]), 10);
    const n = pts.length;
    // each vertex of the ribbon (both edges and the middle, not one depth per row) lies a small, nearly constant
    // clearance in front of the face under it, so the strand curves round the brow / cheek instead of standing off it
    // as a flat blade in 3/4 view; it may follow the face back in by at most 6 mm per row (no kinks into the socket)
    const geo = [];
    let zPrev = null;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const tg = norm([pts[Math.min(n - 1, i + 1)][0] - pts[Math.max(0, i - 1)][0], pts[Math.min(n - 1, i + 1)][1] - pts[Math.max(0, i - 1)][1], 0]);
      const pr = [-tg[1], tg[0]];
      const w = (t < 0.45 ? mix(d.w[0], d.w[1], t / 0.45) : mix(d.w[1], d.w[2], (t - 0.45) / 0.55)) / 2;
      const xy = [-1, 0, 1].map((s) => [pts[i][0] + pr[0] * w * s, pts[i][1] + pr[1] * w * s]);
      const clear = mix(0.0025, d.tipClear ?? 0.005, t ** 1.2);
      const zs = xy.map(([x, y]) => front(x, y) + clear);
      if (zPrev) for (let k = 0; k < 3; k++) zs[k] = Math.max(zs[k], zPrev[k] - 0.006);
      zs[1] = Math.max(zs[1], (zs[0] + zs[2]) / 2); // the middle never dips behind its edges (no folded ribbon)
      zPrev = zs;
      geo.push({ xy, zs, t });
    }
    const rows = geo.map(({ xy, zs, t }) => xy.map(([x, y], k) => g.v([x, y, zs[k]], [d.u0 + (k / 2) * (d.u1 - d.u0), 1 - t], [['head', 1]])));
    for (let i = 0; i + 1 < n; i++) for (let k = 0; k < 2; k++) g.quad(rows[i][k], rows[i + 1][k], rows[i + 1][k + 1], rows[i][k + 1]);
  }
  return g;
}

/**
 * Sports armband with a phone pouch on the left upper arm, below the sleeve: a neoprene band (4 rings hugging the
 * measured arm cross-section + 3 mm) and a curved pouch (±36° round the outer-front side of the arm, raised 4..13 mm
 * off the skin with rounded edges). Rigid on upperarm_l. uv u < 0.5 band, u > 0.5 pouch (screen = upper half).
 */
function armbandGeo(h, suit, side = 'l') {
  const B = h.skeleton.byName['upperarm_' + side];
  const a0 = V(B.head), a1 = V(B.tail), L = dist(a0, a1), ax = norm(sub(a1, a0));
  const sx = side === 'l' ? 1 : -1;
  const o0 = [sx, 0, 0.45];
  const out = norm(sub(o0, scl(ax, dot(o0, ax)))), up2 = cross(ax, out);
  const local = (P) => { const q = sub(P, a0), t = dot(q, ax) / L, r = sub(q, scl(ax, t * L)); return { t, d: Math.hypot(...r), ang: Math.atan2(dot(r, up2), dot(r, out)) }; };
  // sleeve end
  let tS = 0;
  for (let v = 0; v < suit.nVerts; v++) {
    const p = [suit.pos[v * 3], suit.pos[v * 3 + 1], suit.pos[v * 3 + 2]];
    if (p[0] * sx < Math.abs(a0[0]) - 0.01) continue;
    const l = local(p);
    if (l.d < 0.1 && l.t < 0.95) tS = Math.max(tS, l.t);
  }
  const half = 0.05 / L, bandH = 0.021 / L;
  const tc = Math.min(0.62, Math.max(0.5, tS + half + 0.06));
  // arm cross-section radius per (t, angle) bin from the base mesh + garment vertices
  const K = 24, TB = 7, tA = tc - half - 0.04, tB = tc + half + 0.04;
  const R = new Float32Array(TB * K);
  const pts = [];
  for (const v of h.baseObj.groupVerts('body')) pts.push([h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]]);
  for (let v = 0; v < suit.nVerts; v++) pts.push([suit.pos[v * 3], suit.pos[v * 3 + 1], suit.pos[v * 3 + 2]]);
  for (const p of pts) {
    if (p[0] * sx < Math.abs(a0[0]) * 0.8) continue;
    const l = local(p);
    if (l.d > 0.085 || l.t < tA || l.t > tB) continue;
    const ti = Math.min(TB - 1, Math.max(0, Math.round((l.t - tA) / (tB - tA) * (TB - 1))));
    const ki = ((Math.round(l.ang / (2 * Math.PI) * K) % K) + K) % K;
    for (const dk of [-1, 0, 1]) { const j = ti * K + ((ki + dk + K) % K); R[j] = Math.max(R[j], l.d); }
  }
  const rAt = (t, ang) => {
    const ft = Math.max(0, Math.min(TB - 1.001, (t - tA) / (tB - tA) * (TB - 1))), ti = Math.floor(ft), wt = ft - ti;
    let fa = ang / (2 * Math.PI) * K; fa = ((fa % K) + K) % K;
    const k0 = Math.floor(fa), wa = fa - k0, k1 = (k0 + 1) % K;
    const r0 = R[ti * K + k0] * (1 - wa) + R[ti * K + k1] * wa, r1 = R[(ti + 1) * K + k0] * (1 - wa) + R[(ti + 1) * K + k1] * wa;
    let r = r0 * (1 - wt) + r1 * wt;
    if (!(r > 0.02)) r = 0.04;
    return r;
  };
  const P = (t, ang, r) => add(add(a0, scl(ax, t * L)), add(scl(out, Math.cos(ang) * r), scl(up2, Math.sin(ang) * r)));
  const g = new Geo();
  const W = [['upperarm_' + side, 1]];
  // band
  const KB = 16;
  const ringsDef = [[tc - bandH, 0.0015, 0.02], [tc - bandH * 0.8, 0.0035, 0.1], [tc + bandH * 0.8, 0.0035, 0.4], [tc + bandH, 0.0015, 0.48]];
  const rings = ringsDef.map(([t, dr, u]) => {
    const ids = [];
    for (let k = 0; k <= KB; k++) { const ang = (k / KB) * Math.PI * 2; ids.push(g.v(P(t, ang, rAt(t, ang) + dr), [u, k / KB], W)); }
    return ids;
  });
  for (let r = 0; r + 1 < rings.length; r++) for (let k = 0; k < KB; k++) g.quad(rings[r][k], rings[r][k + 1], rings[r + 1][k + 1], rings[r + 1][k]);
  // pouch: raised curved shell over the band
  const NA = 6, NT = 5, A0 = -0.63, A1 = 0.63;
  const top = [];
  for (let i = 0; i <= NT; i++) {
    const t = tc - half + (2 * half) * (i / NT);
    const row = [];
    for (let j = 0; j <= NA; j++) {
      const ang = A0 + (A1 - A0) * (j / NA);
      const edge = Math.min(i, NT - i, j, NA - j) === 0 ? 0.55 : 1;
      row.push(g.v(P(t, ang, rAt(t, ang) + 0.004 + 0.009 * edge), [0.52 + 0.46 * (j / NA), 0.04 + 0.92 * (i / NT)], W));
    }
    top.push(row);
  }
  for (let i = 0; i < NT; i++) for (let j = 0; j < NA; j++) g.quad(top[i][j], top[i][j + 1], top[i + 1][j + 1], top[i + 1][j]);
  // side walls down to the band surface
  const per = [];
  for (let j = 0; j <= NA; j++) per.push([0, j]);
  for (let i = 1; i <= NT; i++) per.push([i, NA]);
  for (let j = NA - 1; j >= 0; j--) per.push([NT, j]);
  for (let i = NT - 1; i >= 1; i--) per.push([i, 0]);
  const base = per.map(([i, j]) => {
    const t = tc - half + (2 * half) * (i / NT), ang = A0 + (A1 - A0) * (j / NA);
    return g.v(P(t, ang, rAt(t, ang) + 0.0025), [0.51, 0.02], W);
  });
  for (let k = 0; k < per.length; k++) {
    const k1 = (k + 1) % per.length;
    const a = top[per[k][0]][per[k][1]], b = top[per[k1][0]][per[k1][1]];
    g.quad(base[k], base[k1], b, a);
  }
  return { g, tc, out };
}

/** Bite wound painter (oval torn-out chunk, tooth-puncture arcs, lifted rim, necrotic halo, run-off below). */
function makeBite(N, C, centre, nrm, BX, BY, o = {}) {
  const bN = norm(nrm), bU = norm(cross(bN, norm(cross([0, 1, 0], bN)))), bR = norm(cross(bU, bN));
  const haloR = o.halo ?? 2.4, fatK = o.fat ?? 0.7, clotK = o.clot ?? 0, runLen = o.run ?? 0.3, runW = o.runW ?? 1.4, drift = o.drift ?? 0.08;
  return (P, Nn, c, st) => {
    const d = sub(P, centre);
    if (Math.abs(dot(d, bN)) > 0.06) return 0;
    const ex = dot(d, bR) / BX, ey = dot(d, bU) / BY;
    const warp = N.fbm(P[0] * 38, P[1] * 38, P[2] * 38, 3) * 0.28;
    const q = Math.hypot(ex, ey) + warp;
    const below = centre[1] - P[1];
    if (below > 0 && below < runLen && dot(Nn, bN) > 0.15) {
      const s = N.noise(P[0] * 130, P[1] * 6, P[2] * 130);
      const band = 1 - ss(BX * 0.6, BX * runW, Math.abs(dot(d, bR) + below * drift));
      st.run = Math.max(st.run || 0, ss(0.15, 0.45, s) * band * (1 - below / runLen) * 0.95);
    }
    if (q > haloR) return 0;
    const halo = 1 - ss(0.9, haloR, q);
    mul(c, [0.7, 0.66, 0.72], halo * 0.7);
    const v = N.ridged(P[0] * 70, P[1] * 70, P[2] * 70, 3);
    over(c, C.vein, ss(0.62, 0.9, v) * halo * 0.9);
    st.h += ss(0.62, 0.9, v) * halo * 0.5;
    if (q < 1) {
      const inner = 1 - ss(0.0, 0.85, q);
      const fib = N.ridged((ex + ey * 0.5) * 3, (ey - ex * 0.5) * 22, P[2] * 30, 2);
      over(c, C.muscle, 1);
      over(c, C.muscleDark, clamp01(inner * 0.4 + ss(0.45, 0.85, fib) * 0.7 + clotK * 0.3));
      over(c, lin([150, 40, 36]), ss(0.15, 0.0, fib) * (1 - inner) * 0.6 * (1 - clotK));
      over(c, C.clot, ss(0.1, 0.45, N.fbm(P[0] * 90, P[1] * 90, P[2] * 90, 2) + inner * 0.6 - 0.25 + clotK) * 0.95);
      const w = N.worley(P[0] * 260, P[1] * 260, P[2] * 260);
      over(c, C.fat, ss(0.6, 0.95, q) * (1 - ss(0.12, 0.3, w)) * fatK);
      st.h -= 2.4 * (1 - q * q) + fib * 0.4;
      st.ro = 0.28;
      st.wet = Math.max(st.wet || 0, inner);
    } else if (q < 1.3) {
      const e = (q - 1) / 0.3;
      over(c, C.rim, (1 - e) * 0.75 * (o.rim ?? 1));
      mul(c, [0.4, 0.3, 0.3], ss(0.0, 0.25, 1 - e) * (1 - ss(0.25, 0.5, 1 - e)) * 0.6);
      st.h += 0.7 * (1 - Math.abs(e - 0.35) / 0.65);
    }
    for (const side of [1, -1]) {
      for (let k = 0; k < 6; k++) {
        const th = (0.2 + k * 0.12) * Math.PI;
        const tx = Math.cos(th) * 1.18, ty = Math.sin(th) * 1.25 * side;
        const dd = Math.hypot((ex - tx) * BX, (ey - ty) * BY);
        const r = (o.tooth ?? 0.0042) + 0.0014 * Math.sin(k * 2.3);
        if (dd < r * 1.8) {
          over(c, C.puncture, (1 - ss(r * 0.5, r, dd)) * 0.95);
          mul(c, [0.55, 0.4, 0.42], (1 - ss(r, r * 1.8, dd)) * 0.6);
          st.h -= (1 - ss(0, r, dd)) * 1.6;
        }
      }
    }
    st.crust = Math.max(st.crust || 0, ss(0.85, 1.05, q) * (1 - ss(1.1, 1.7, q + N.noise(P[0] * 90, P[1] * 90, P[2] * 90) * 0.3)) * 0.9);
    return halo;
  };
}

/**
 * Dead eyes on the MakeHuman eye texture (two eyeballs; centres measured on brown_eye.png): a dull, grey-yellow
 * sclera shot with dark veins, the cornea filmed over by a pale blue-grey cataract (a ghost of the iris ring, a soft
 * pupil smudge), darker towards the lids.
 */
function deadEyes(src, N) {
  const W = src.width, out = createImage(W, src.height);
  const centres = [[0.705, 0.295], [0.29, 0.71]];
  const sclera = lin([96, 84, 70]), haze = lin([106, 111, 115]), vein = lin([96, 26, 22]);
  const c = [0, 0, 0];
  for (let y = 0; y < src.height; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, u = (x + 0.5) / W, v = (y + 0.5) / src.height;
    const s = [S2L[src.data[i]], S2L[src.data[i + 1]], S2L[src.data[i + 2]]];
    let d = 9, cu = 0, cv = 0;
    for (const [a, b] of centres) { const e = Math.hypot(u - a, v - b); if (e < d) { d = e; cu = u - a; cv = v - b; } }
    if (d > 0.3) { c[0] = s[0] * 0.5; c[1] = s[1] * 0.48; c[2] = s[2] * 0.42; }
    else {
      const n = N.fbm(u * 30, v * 30, 2.5, 3);
      c[0] = sclera[0] * (0.92 + 0.12 * n); c[1] = sclera[1] * (0.92 + 0.12 * n); c[2] = sclera[2] * (0.92 + 0.1 * n);
      const red = s[0] > 0.02 ? clamp01((s[0] - Math.max(s[1], s[2])) / s[0]) : 0;
      // burst capillaries: the source's veins, thicker and darker, plus a blotchy haemorrhage in the outer corner
      over(c, vein, ss(0.08, 0.3, red) * (1 - ss(0.1, 0.13, 0.25 - d)) * 0.7);
      const hem = ss(0.15, 0.6, N.fbm(cu * 14 + 3, cv * 14, 7.1, 3)) * ss(0.13, 0.2, d);
      over(c, lin([88, 22, 20]), hem * 0.55);
      const cor = 1 - ss(0.106, 0.128, d);
      const hn = 0.94 + 0.1 * N.noise(cu * 60, cv * 60, 1.1);
      over(c, [haze[0] * hn, haze[1] * hn, haze[2] * (hn + 0.03)], cor);
      mul(c, [0.72, 0.74, 0.78], ss(0.08, 0.098, d) * (1 - ss(0.108, 0.126, d)) * 0.55);
      mul(c, [0.62, 0.63, 0.66], (1 - ss(0.012, 0.05, d)) * 0.7);
      mul(c, [0.44, 0.42, 0.4], ss(0.13, 0.27, d));
    }
    out.data[i] = toByte(c[0]); out.data[i + 1] = toByte(c[1]); out.data[i + 2] = toByte(c[2]); out.data[i + 3] = 255;
  }
  return out;
}

export async function build(lib) {
  // ---- body: a young (25), slim, athletic woman, ~1.66 m, gone corpse-thin in the face
  const opts = lib.merge({
    macro: { gender: 0, age: 0.5, height: 0.53, proportions: 0.65, muscle: 0.45, weight: 0.3, race: { caucasian: 1 } },
    modifiers: {
      'cheek-volume-decr-incr': -0.7, 'cheek-bones-decr-incr': 0.45, 'forehead-temple-decr-incr': -0.45,
      'eye-bag-decr-incr': 0.55, 'head-fat-decr-incr': -0.35, 'neck-scale-horiz-decr-incr': -0.15,
      'stomach-pregnant-decr-incr': -0.35, 'measure-waist-circ-decr-incr': -0.15,
      'l-upperarm-fat-decr-incr': -0.35, 'r-upperarm-fat-decr-incr': -0.35, 'l-lowerarm-fat-decr-incr': -0.3, 'r-lowerarm-fat-decr-incr': -0.3,
    },
    // jaw hanging, upper lip pulled back off the teeth, wide staring lids, strained neck
    expression: {
      'mouth-open': 0.5, 'mouth-upward-retraction': 0.35, 'mouth-depression': 0.25, 'neck-platysma': 0.4,
      'eye-left-opened-up': 0.35, 'eye-right-opened-up': 0.25, 'eyebrows-left-inner-up': 0.25, 'eyebrows-right-down': 0.3,
    },
  });
  // head lolled to her right (roll / yaw) and pitched up only a little, left shoulder dropped, right one hiked (local
  // euler degrees, applied after the mixer). The pitch was -16 / -10 (26° of extension on top of every clip): face to
  // the sky in crawl / attack_a / idle.
  const poseOffsets = {
    spine_03: [0, 0, 2], neck_01: [-5, 0, -5], head: [-3, -6, -15], clavicle_l: [0, 0, 8], clavicle_r: [0, 0, -4],
  };
  const h = await lib.Human.create(opts);
  const N = lib.makeNoise(53);
  const A = lib.anchors(h);
  const sk = h.skeleton.byName;
  const eyeY = (A.eyeL[1] + A.eyeR[1]) / 2, eyeZ = (A.eyeL[2] + A.eyeR[2]) / 2;
  console.log(`  walker_c: height ${h.height.toFixed(3)} m`);

  // ---- geometry (bound to the morphed base mesh)
  const body = await h.proxyBody('female1605');
  const suit = await h.fit('clothes/female_sportsuit01', { name: 'clothes', role: 'cloth' });
  const shoes = await h.fit('clothes/shoes05', { name: 'shoes', role: 'cloth' });
  const eyes = await h.fit('eyes/low-poly', { name: 'eyes', role: 'eye', hide: false });
  const teeth = await h.fit('teeth/teeth_base', { name: 'teeth', role: 'teeth', hide: false });
  const hair = await h.fit('hair/long01', { name: 'hair', role: 'hair', hide: false });

  // the right trainer is gone: drop its faces, the bare foot under it is no longer hidden
  {
    let n = 0;
    shoes.obj.faces.forEach((f, fi) => { if (f.v.reduce((a, v) => a + shoes.pos[v * 3], 0) < 0) { shoes.keep[fi] = 0; n++; } });
    const legs = new Set(suit.deleteVerts);
    for (const v of shoes.deleteVerts) if (!legs.has(v) && h.pos[v * 3] < 0) h.hidden.delete(v);
    console.log(`  walker_c: right shoe removed (${n} faces)`);
  }
  // garment vertices never belong to the head segment (decapitation must not carry the collar away)
  for (let v = 0; v < suit.nVerts; v++) if (suit.seg[v] === 1) suit.seg[v] = 0;
  // the fitted trainer sank 1.1 cm into the ground: its sole is lifted to y >= 1 mm (only the bottom 3.5 cm is
  // squashed, the upper keeps its shape)
  {
    let lo = 1e9, foot = 1e9;
    shoes.obj.faces.forEach((f, fi) => { if (shoes.keep[fi]) for (const v of f.v) lo = Math.min(lo, shoes.pos[v * 3 + 1]); });
    if (lo < 0.001) for (let v = 0; v < shoes.nVerts; v++) { const y = shoes.pos[v * 3 + 1]; shoes.pos[v * 3 + 1] = y + (0.001 - lo) * (1 - ss(lo, lo + 0.035, y)); }
    for (let v = 0; v < body.nVerts; v++) if (body.pos[v * 3] < 0) foot = Math.min(foot, body.pos[v * 3 + 1]);
    console.log(`  walker_c: shoe sole ${(lo * 100).toFixed(1)} cm -> 0.1 cm, bare right foot min y ${(foot * 100).toFixed(1)} cm`);
  }

  // ---- hair (long01). Only its main shell is kept: the 17 arch cards laid over it ear to ear (2 mm .. 3 cm wide,
  // 2.2k tris) crossed the crown as stepped horizontal shine bands (a lacquered helmet from above) and stacked into a
  // solid slab on the back. The shell is welded across its card seams (one smooth normal over the crown), cut to the
  // shoulder blades (the waist-long sheet stood ~10 cm off the hunched back like a cape) and re-skinned below the nape
  // from the back skin under it.
  const zc = sk.spine_03.head.z;
  const hairAng = (P) => Math.atan2(P[0], -(P[2] - zc)); // 0 straight back, ±pi/2 at the sides
  // end of the hair (alpha): an irregular V, lowest over the spine at the shoulder blades and rising ~7 cm towards the
  // sides, broken into clumps of different length; hairEndMin = the lowest it ever gets
  const hairEnd = (P) => {
    const a = hairAng(P);
    return A.neck[1] - 0.2 + 0.1 * Math.min(1, Math.abs(a) / 1.3) ** 1.2 + N.fbm(a * 3.2, 0.5, 6.1, 3) * 0.05 + N.noise(a * 11, 0.5, 2.7) * 0.012;
  };
  const hairEndMin = A.neck[1] - 0.2 - 0.065;
  {
    const F = hair.obj.faces;
    const par = new Int32Array(hair.nVerts).map((_, i) => i);
    const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    for (const f of F) for (let k = 1; k < f.v.length; k++) { const a = find(f.v[0]), b = find(f.v[k]); if (a !== b) par[a] = b; }
    const size = new Map();
    for (const f of F) { const r = find(f.v[0]); size.set(r, (size.get(r) || 0) + 1); }
    const shell = [...size.entries()].sort((a, b) => b[1] - a[1])[0][0];
    let cards = 0, cut = 0;
    F.forEach((f, fi) => { if (find(f.v[0]) !== shell) { hair.keep[fi] = 0; cards++; } });
    // weld duplicated positions (the shell's card seams): faces share one vertex -> one smooth normal; the UV
    // corners stay separate, so toRender still splits the seam for the texture
    const first = new Map(), remap = new Int32Array(hair.nVerts);
    let welded = 0;
    for (let v = 0; v < hair.nVerts; v++) {
      const k = `${Math.round(hair.pos[v * 3] * 4000)},${Math.round(hair.pos[v * 3 + 1] * 4000)},${Math.round(hair.pos[v * 3 + 2] * 4000)}`;
      if (first.has(k)) { remap[v] = first.get(k); welded++; } else { first.set(k, v); remap[v] = v; }
    }
    for (const f of F) f.v = f.v.map((v) => remap[v]);
    // faces wholly below the (alpha-cut) end of the hair go
    F.forEach((f, fi) => {
      if (!hair.keep[fi]) return;
      const pts = f.v.map((v) => [hair.pos[v * 3], hair.pos[v * 3 + 1], hair.pos[v * 3 + 2]]);
      if (pts.every((p) => p[1] < hairEndMin - 0.01 || p[1] < hairEnd(p) - 0.03)) { hair.keep[fi] = 0; cut++; }
    });
    console.log(`  walker_c: hair shell ${hair.triCount()} tris (${cards} arch-card faces dropped, ${welded} seam vertices welded, ${cut} faces below the shoulder blades cut)`);
  }
  const hairUsed = new Uint8Array(hair.nVerts);
  hair.obj.faces.forEach((f, fi) => { if (hair.keep[fi]) for (const v of f.v) hairUsed[v] = 1; });

  // unkempt hair: below the nape the straight sheet is pushed out from the back in clumps (outward only, so it never
  // sinks into the back / shoulders; at most ~2 cm, it lay 4-5 cm off the back before), with a little sideways drift
  {
    const y0 = A.neck[1] - 0.01;
    for (let v = 0; v < hair.nVerts; v++) {
      if (!hairUsed[v]) continue;
      const x = hair.pos[v * 3], y = hair.pos[v * 3 + 1], z = hair.pos[v * 3 + 2];
      const fall = ss(y0, y0 - 0.12, y);
      if (fall <= 0) continue;
      const o = norm([x, 0, z - zc]);
      const ang = Math.atan2(x, -(z - zc));
      const s = N.fbm(ang * 2.6, y * 5, 1.3, 3), s2 = N.noise(ang * 7 + 4, y * 9, 2.2);
      const out = (0.002 + 0.01 * ss(-0.25, 0.55, s) + 0.006 * ss(0.3, 0.9, s2)) * fall;
      const side = 0.008 * N.noise(ang * 4, y * 4, 7.7) * fall;
      hair.pos[v * 3] += o[0] * out + o[2] * side;
      hair.pos[v * 3 + 2] += o[2] * out - o[0] * side;
    }
  }

  // hair skinning: the head / neck / spine chain only (raising an arm must not drag the hair), and from the nape down
  // the weights of the back skin under each hair vertex (4 nearest spine-chain skin vertices, inverse distance),
  // blended in over 14 cm: the sheet bends with the upper back like the skin under it instead of swinging off it
  // rigidly with spine_03. _seg = segment of the dominant bone (contract): the cap and the hair over the neck go with
  // the head, the sheet lying on the back stays with the torso.
  {
    const chain = new Set(['head', 'neck_01', 'spine_03', 'spine_02', 'spine_01', 'pelvis'].map((n) => sk[n].index));
    const onChain = (w) => {
      const k = w.filter(([b]) => chain.has(b)), s = k.reduce((a, [, x]) => a + x, 0);
      return s > 1e-4 ? k.map(([b, x]) => [b, x / s]) : null;
    };
    const cand = [];
    for (const v of h.baseObj.groupVerts('body')) {
      const y = h.pos[v * 3 + 1];
      if (y < hairEndMin - 0.08 || y > A.neck[1] + 0.12) continue;
      if (h.weights[v].reduce((a, [b, x]) => a + (chain.has(b) ? x : 0), 0) < 0.75) continue; // arm / clavicle skin
      cand.push(v);
    }
    const yA = A.neck[1] + 0.05, yB = A.neck[1] - 0.09;
    const bones = h.skeleton.bones;
    let moved = 0;
    const segCount = new Int32Array(10);
    for (let v = 0; v < hair.nVerts; v++) {
      if (!hairUsed[v]) continue;
      let w = onChain(hair.weights[v]) || [[sk.head.index, 1]];
      const px = hair.pos[v * 3], py = hair.pos[v * 3 + 1], pz = hair.pos[v * 3 + 2];
      const f = ss(yA, yB, py);
      if (f > 0) {
        const best = [];
        for (const c of cand) {
          const d = (h.pos[c * 3] - px) ** 2 + (h.pos[c * 3 + 1] - py) ** 2 + (h.pos[c * 3 + 2] - pz) ** 2;
          if (best.length < 4 || d < best[best.length - 1][0]) {
            best.push([d, c]); best.sort((a, b) => a[0] - b[0]);
            if (best.length > 4) best.pop();
          }
        }
        const iw = best.map(([d]) => 1 / (Math.sqrt(d) + 0.005)), tw = iw.reduce((a, x) => a + x, 0);
        const acc = new Map();
        for (const [b, x] of w) acc.set(b, (1 - f) * x);
        best.forEach(([, c], i) => { for (const [b, x] of onChain(h.weights[c]) || []) acc.set(b, (acc.get(b) || 0) + f * x * iw[i] / tw); });
        w = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
        const s = w.reduce((a, [, x]) => a + x, 0);
        w = w.map(([b, x]) => [b, x / s]);
        moved++;
      }
      hair.weights[v] = w;
      const segAcc = new Float32Array(10);
      for (const [b, x] of w) segAcc[boneSegment(bones[b].name)] += x;
      let best = 0;
      for (let s = 1; s < 10; s++) if (segAcc[s] > segAcc[best]) best = s;
      hair.seg[v] = best;
      segCount[best]++;
    }
    console.log(`  walker_c: ${moved} hair vertices re-skinned from the back skin; _seg head ${segCount[1]} / torso ${segCount[0]}`);
  }
  const cavityGeo = mouthCavity(h, body, A);

  // ---- matted strands hanging over the face (rigid on the head) + the armband phone (rigid on upperarm_l)
  // hairline height above the eyes on the centre line (lowest front vertex of the hair cap)
  const hl = (() => {
    let y = 1e9;
    for (let v = 0; v < hair.nVerts; v++) {
      if (!hairUsed[v]) continue;
      const p = [hair.pos[v * 3], hair.pos[v * 3 + 1], hair.pos[v * 3 + 2]];
      if (Math.abs(p[0]) < 0.025 && p[2] > eyeZ - 0.03 && p[1] > eyeY + 0.02) y = Math.min(y, p[1]);
    }
    return (y < 1e8 ? y : eyeY + 0.07) - eyeY;
  })();
  console.log(`  walker_c: hairline ${(hl * 100).toFixed(1)} cm above the eyes`);
  const strandGeo = faceStrands(h, [{ pos: body.pos, tris: body.tris() }, { pos: eyes.pos, tris: eyes.tris() }, { pos: hair.pos, tris: hair.tris() }], A, [
    { pts: [[-0.014, hl + 0.012], [-0.022, hl - 0.012], [-0.029, 0.03], [-0.033, 0.004], [-0.037, -0.026], [-0.042, -0.058], [-0.046, -0.086], [-0.05, -0.108]], w: [0.014, 0.026, 0.008], u0: 0, u1: 0.5, tipClear: 0.0055 },
    { pts: [[-0.03, hl + 0.01], [-0.04, hl - 0.016], [-0.047, 0.02], [-0.052, -0.012], [-0.055, -0.046], [-0.057, -0.078]], w: [0.012, 0.02, 0.006], u0: 0.5, u1: 1, tipClear: 0.005 },
  ]);

  // bare midriff: the biggest vertical gap between garment vertices down the front centre line (leggings
  // waistband .. hem of the cropped top)
  const gap = (() => {
    const ys = [];
    for (let v = 0; v < suit.nVerts; v++) {
      const x = suit.pos[v * 3], y = suit.pos[v * 3 + 1], z = suit.pos[v * 3 + 2];
      if (Math.abs(x) < 0.04 && z > 0 && y > sk.pelvis.head.y - 0.1 && y < sk.spine_03.tail.y) ys.push(y);
    }
    ys.sort((a, b) => a - b);
    let best = null;
    for (let i = 1; i < ys.length; i++) { const d = ys[i] - ys[i - 1]; if (!best || d > best.d) best = { lo: ys[i - 1], hi: ys[i], d }; }
    if (!best) best = { lo: sk.pelvis.head.y + 0.08, hi: sk.spine_03.head.y };
    console.log(`  walker_c: midriff ${best.lo.toFixed(3)}..${best.hi.toFixed(3)} m`);
    return best;
  })();

  // ---- the cropped top hugs the body: it hung straight down off the bust, so its lower half stood 5-8 cm off the
  // belly as a stiff bib. Every top vertex below the bust line is pulled to <= ~6 mm off the base skin (soft clamp
  // along the closest-point direction, fading out towards the bust apex), and its skinning blends to the weights of
  // the 3 nearest skin vertices, so the hem follows the abdomen (spine_02 / spine_01) when she bends.
  {
    const yTop = (gap.lo + gap.hi) / 2;
    const bvh = occluders([{ pos: h.pos, tris: h.basePart({ name: 'wrap' }).tris() }]);
    let bustY = sk.spine_03.head.y + 0.12, bz = -1;
    for (const v of h.baseObj.groupVerts('body')) {
      const x = h.pos[v * 3], y = h.pos[v * 3 + 1], z = h.pos[v * 3 + 2];
      if (Math.abs(x) > 0.03 && Math.abs(x) < 0.13 && y > sk.spine_03.head.y && y < A.neck[1] - 0.08 && z > bz) { bz = z; bustY = y; }
    }
    const skinV = [...h.baseObj.groupVerts('body')].filter((v) => h.pos[v * 3 + 1] > gap.lo && h.pos[v * 3 + 1] < bustY + 0.05);
    const bones = h.skeleton.bones, tmp = new THREE.Vector3();
    let n = 0, d0 = 0, d1 = 0;
    for (let v = 0; v < suit.nVerts; v++) {
      const P = [suit.pos[v * 3], suit.pos[v * 3 + 1], suit.pos[v * 3 + 2]];
      if (P[1] < yTop) continue;
      const s = 1 - ss(bustY - 0.06, bustY - 0.005, P[1]);
      if (s <= 0) continue;
      const hit = bvh.closestPointToPoint(tmp.set(P[0], P[1], P[2]));
      if (!hit) continue;
      const cp = [hit.point.x, hit.point.y, hit.point.z];
      const d = signedDist(bvh, P);
      if (d > 0.003) {
        const dn = mix(d, 0.003 + 0.003 * (1 - Math.exp(-(d - 0.003) / 0.003)), s);
        const dir = norm(sub(P, cp));
        for (let k = 0; k < 3; k++) suit.pos[v * 3 + k] = cp[k] + dir[k] * dn;
        d0 = Math.max(d0, d); d1 = Math.max(d1, dn);
      }
      // skinning of the nearest skin (3 nearest, inverse distance) blended in by s
      const best = [];
      for (const c of skinV) {
        const e = (h.pos[c * 3] - P[0]) ** 2 + (h.pos[c * 3 + 1] - P[1]) ** 2 + (h.pos[c * 3 + 2] - P[2]) ** 2;
        if (best.length < 3 || e < best[best.length - 1][0]) { best.push([e, c]); best.sort((a, b) => a[0] - b[0]); if (best.length > 3) best.pop(); }
      }
      const iw = best.map(([e]) => 1 / (Math.sqrt(e) + 0.004)), tw = iw.reduce((a, x) => a + x, 0);
      const acc = new Map();
      for (const [b, x] of suit.weights[v]) acc.set(b, (1 - s) * x);
      best.forEach(([, c], i) => { for (const [b, x] of h.weights[c]) acc.set(b, (acc.get(b) || 0) + s * x * iw[i] / tw); });
      let w = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
      const sum = w.reduce((a, [, x]) => a + x, 0);
      w = w.map(([b, x]) => [b, x / sum]);
      suit.weights[v] = w;
      const segAcc = new Float32Array(10);
      for (const [b, x] of w) segAcc[boneSegment(bones[b].name)] += x;
      let sg = 0;
      for (let q = 1; q < 10; q++) if (segAcc[q] > segAcc[sg]) sg = q;
      suit.seg[v] = sg === 1 ? 0 : sg;
      n++;
    }
    console.log(`  walker_c: crop top shrink-wrapped below the bust (y ${bustY.toFixed(3)}): ${n} verts, max gap ${(d0 * 100).toFixed(1)} -> ${(d1 * 100).toFixed(1)} cm`);
  }
  const band = armbandGeo(h, suit, 'l');

  // ---- wound / gore anchors
  const biteSh = nearestBody(h, [V(sk.clavicle_r.tail)[0] + 0.01, V(sk.clavicle_r.tail)[1] + 0.045, V(sk.clavicle_r.tail)[2] - 0.005]);
  const biteShN = [-0.35, 0.85, 0.35];
  const flank = lib.surfacePoint(h, 'spine_01', 0.6, [0.85, 0, 0.5]);
  const thighL = boneSeg(sk.thigh_l), calfL = boneSeg(sk.calf_l), thighR = boneSeg(sk.thigh_r), calfR = boneSeg(sk.calf_r);
  const armR = boneSeg(sk.upperarm_r), armL = boneSeg(sk.upperarm_l);
  const foreL = boneSeg(sk.lowerarm_l), foreR = boneSeg(sk.lowerarm_r);
  const kneeL = V(sk.calf_l.head), kneeR = V(sk.calf_r.head);
  const tips = [];
  for (const s of ['l', 'r']) for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky']) if (sk[`${f}_03_${s}`]) tips.push(V(sk[`${f}_03_${s}`].tail));
  const wrists = [V(sk.hand_l.head), V(sk.hand_r.head)];

  // ---- tear regions (3D, metres). bigTear = whole garment regions ripped away (silhouette); those areas are
  // un-hidden before painting so the bare skin there is painted as exposed skin.
  const bigTear = (P) => {
    let w = 0;
    // right sleeve ripped off at the shoulder seam (ragged armhole), collar torn open round the shoulder bite
    const a = armR(P);
    if (a.d < 0.1 && P[0] < sk.upperarm_r.head.x + 0.025) w = Math.max(w, ss(-0.06, 0.04, a.t + N.fbm(P[0] * 16, P[1] * 16, P[2] * 16, 3) * 0.07) * (1 - ss(0.07, 0.09, a.d)));
    w = Math.max(w, 1 - ss(0.04, 0.075, dist(P, biteSh) + N.fbm(P[0] * 30, P[1] * 30, P[2] * 30, 3) * 0.02));
    // left legging leg ripped open on the front from mid-thigh to the top of the shin
    const t = thighL(P), c = calfL(P);
    if ((t.d < 0.13 || c.d < 0.11) && P[2] > kneeL[2] - 0.035) {
      const along = P[1];
      const lo = kneeL[1] - 0.12, hi = kneeL[1] + 0.2;
      const band = ss(lo - 0.02, lo + 0.04, along + N.fbm(P[0] * 14, P[1] * 14, P[2] * 14, 3) * 0.06) * (1 - ss(hi - 0.06, hi, along + N.fbm(P[0] * 11 + 4, P[1] * 11, P[2] * 11, 3) * 0.07));
      const front = ss(-0.1, 0.35, (P[2] - (t.d < c.d ? t.a[2] : c.a[2])) / 0.06 + N.fbm(P[0] * 20 + 2, P[1] * 9, P[2] * 20, 3) * 0.6);
      w = Math.max(w, band * front);
    }
    // right legging hem shredded over the bare foot
    if (P[0] < 0 && P[1] < 0.2) w = Math.max(w, ss(0.13, 0.08, P[1] + N.fbm(P[0] * 30, P[1] * 10, P[2] * 30, 3) * 0.05));
    return w * 1.3;
  };
  const tear = (P) => {
    let w = bigTear(P);
    w += 0.5 * Math.max(0, 1 - dist(P, [kneeR[0], kneeR[1] - 0.01, kneeR[2] + 0.055]) * 13); // right knee worn through
    w += 0.35 * Math.max(0, 1 - dist(P, [kneeR[0] + 0.01, kneeR[1] - 0.17, kneeR[2] + 0.04]) * 18); // right shin
    w += 0.3 * Math.max(0, 1 - Math.abs(P[1] - gap.hi - 0.012) * 18) * ss(0.0, 0.08, P[2]);           // top: ragged hem
    w += 0.45 * Math.max(0, 1 - dist(P, flank.p) * 9);                                                 // over the flank bite
    w += 0.3 * (P[2] < -0.04 ? Math.max(0, 1 - Math.hypot(P[0] - 0.06, (P[1] - 1.17) * 1.3) * 9) : 0); // back of the top
    w += 0.25 * (P[2] < -0.02 ? Math.max(0, 1 - dist(P, [-0.1, 0.62, -0.06]) * 10) : 0);              // back of right thigh
    return w;
  };
  {
    const n0 = h.hidden.size;
    for (const v of rayCovered(h, suit, 0.03)) h.hidden.add(v);
    console.log(`  walker_c: ${h.hidden.size - n0} extra base vertices under the tight garment`);
  }
  for (const v of [...h.hidden]) if (bigTear([h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]]) > 1.0) h.hidden.delete(v);

  // ---- skin: CC0 female zombie skin, graded to a cold ash-grey corpse tone
  const skinSrc = 'skins/sohh_female_zombie_skin/';
  const skinSrcImg = lib.cloneImage(await lib.texture('skins03', skinSrc + 'sohh_Zombie_Female_diffuse.png', 2048));
  const TR = albedoTracer('walker_c');
  TR.snap('skin: sohh source', skinSrcImg, body);
  const baseMask = (() => {
    const W = skinSrcImg.width, bp = h.basePart({ name: 'mask' });
    const r = rasterUV(bp.tris(), h.baseObj.uvs, W, 0);
    return r.covered;
  })();
  {
    // the sohh face carries painted blood splashes round the mouth and nose: they turned our claw scratches into a
    // red mess -> inpainted from the surrounding skin (island-aware blur of the non-red texels), head island only
    const W = skinSrcImg.width, d = skinSrcImg.data;
    let mask = new Float32Array(W * W);
    for (let y = Math.floor(0.1 * W); y < Math.floor(0.9 * W); y++) for (let x = Math.floor(0.62 * W); x < W; x++) {
      const i = y * W + x, r = S2L[d[i * 4]], g = S2L[d[i * 4 + 1]], b = S2L[d[i * 4 + 2]];
      const red = r > 0.01 ? (r - Math.max(g, b)) / r : 0;
      mask[i] = ss(0.35, 0.6, red) * (baseMask[i] ? 1 : 0);
    }
    for (let p = 0; p < 2; p++) {
      const m2 = mask.slice();
      for (let y = 1; y < W - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; m2[i] = Math.max(mask[i], mask[i - 1], mask[i + 1], mask[i - W], mask[i + W]); }
      mask = m2;
    }
    blendBlur(skinSrcImg, mask, baseMask, Math.max(3, Math.round(W / 160)), 1);
    blendBlur(skinSrcImg, mask, baseMask, Math.max(3, Math.round(W / 100)), 0.7);
  }
  const skinBase = grade(skinSrcImg, (c) => {
    // the sohh skin is near-white pink: a cold pale ash grey (a little blue-green), keep its blotches. (Was a 0.36x
    // gain: with the decay tints and the AO bake on top the skin ended at sRGB ~40, a black silhouette in game.)
    const l = lum(c[0], c[1], c[2]);
    const k = 1.3 * Math.max(0.02, l) ** 0.1;
    const g = [l * 0.96, l * 1.0, l * 1.03];
    for (let i = 0; i < 3; i++) c[i] = mix(c[i], g[i], 0.7) * k;
  });
  TR.snap('skin: graded', skinBase, body);
  const skinBump = lib.cloneImage(await lib.texture('skins03', skinSrc + 'sohh_Zombie_Female_bump.png', 2048));
  // the sohh bump at full strength read as plaster / cottage cheese on the torso and arms and aged the face: its
  // mid-scale relief (the band paintSkin's 6-texel high-pass keeps) is scaled to 45 % on the body / limbs and 60 % on
  // the head, the finest (pore) band less (70 / 80 %)
  {
    const W = skinBump.width, n = W * W, d = skinBump.data;
    const L = new Float32Array(n);
    for (let i = 0; i < n; i++) L[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
    const low = blurField(L, W, W, 6, 2), mid = blurField(L, W, W, 1.5, 1);
    const bp = h.basePart({ name: 'bumpk' });
    const RK = 256;
    const face = bakeField({ tris: bp.tris(), pos: h.pos, nrm: bp.normals() }, h.baseObj.uvs, RK, (P) => ss(A.neck[1] + 0.03, A.neck[1] + 0.09, P[1]), { fill: 0, blur: 2 });
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, f = fieldAt(face, RK, W, x, y);
      const k = mix(0.45, 0.6, f), kf = mix(0.7, 0.8, f);
      const v = Math.max(0, Math.min(255, Math.round(low[i] + (mid[i] - low[i]) * k + (L[i] - mid[i]) * kf)));
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
    }
  }

  const C = {
    muscle: lin([110, 18, 18]), muscleDark: lin([44, 5, 6]), clot: lin([24, 4, 4]), fat: lin([176, 150, 96]),
    rim: lin([150, 104, 104]), vein: lin([46, 40, 64]), puncture: lin([18, 4, 4]),
  };
  const paintShoulderBite = makeBite(N, C, biteSh, biteShN, 0.04, 0.03, { run: 0.26, runW: 1.3, drift: -0.05 });
  const paintFlankBite = makeBite(N, C, flank.p, [0.85, 0, 0.5], 0.032, 0.026, { halo: 2.0, fat: 0.5, clot: 0.15, run: 0.12, runW: 1.2, drift: 0.02, tooth: 0.0038 });

  // claw gouges: three parallel rakes down her left cheek (+x), ~60° from horizontal, starting on the cheekbone
  // (not at the lip corner) and running down and out towards the jaw, 1.5 cm apart, 6-7.5 cm long, 4-6 mm wide; two
  // short diagonal tears high on the right of the forehead (2D on the face front, metres; s = start, ang = direction
  // in degrees from +x, len, hw = half width)
  const rakeDir = (deg) => [Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180)];
  const gouge = rakeDir(-63), gougeN = [-gouge[1], gouge[0]];
  const rakes = [
    // cheek: middle one longest and widest; starts offset along the perpendicular by -1.5 / 0 / +1.5 cm
    { s: [0.036 - gougeN[0] * 0.015, eyeY - 0.026 - gougeN[1] * 0.015], u: gouge, L: 0.058, hw: 0.0022, a0: 0.06, a1: 0.95, beads: 0 },
    { s: [0.036, eyeY - 0.026], u: gouge, L: 0.072, hw: 0.0028, a0: 0.0, a1: 1.0, beads: 0 },
    { s: [0.036 + gougeN[0] * 0.015, eyeY - 0.026 + gougeN[1] * 0.015], u: gouge, L: 0.062, hw: 0.0024, a0: 0.04, a1: 0.92, beads: 0 },
    // forehead: short tears with beaded blood
    { s: [-0.016, eyeY + 0.064], u: rakeDir(-140), L: 0.028, hw: 0.0016, a0: 0.0, a1: 1.0, beads: 4 },
    { s: [-0.03, eyeY + 0.07], u: rakeDir(-135), L: 0.02, hw: 0.0013, a0: 0.05, a1: 0.95, beads: 3 },
  ].map((r, ri) => {
    const n = [-r.u[1], r.u[0]];
    // drips: blood that ran straight down from the gouge; beads: round drops welled up along a forehead tear
    const drips = [];
    for (let k = 0; k < (r.beads ? 2 : 4); k++) {
      const a = mix(r.a0, r.a1, 0.12 + 0.76 * hash(k * 31 + ri * 101 + 7));
      drips.push({ x: r.s[0] + r.u[0] * a * r.L, y: r.s[1] + r.u[1] * a * r.L - r.hw * 0.8, len: 0.008 + 0.028 * hash(k * 17 + 3 + ri * 13) ** 1.4, w: r.hw * (0.5 + 0.3 * hash(k * 5 + ri)) });
    }
    const beads = [];
    for (let k = 0; k < r.beads; k++) {
      const a = mix(r.a0, r.a1, (k + 0.3 + 0.4 * hash(k * 7 + ri * 3)) / r.beads);
      const side = (hash(k * 11 + ri) - 0.5) * r.hw * 1.4;
      beads.push({ x: r.s[0] + r.u[0] * a * r.L + n[0] * side, y: r.s[1] + r.u[1] * a * r.L + n[1] * side, r: 0.0011 + 0.0011 * hash(k * 3 + ri * 5) });
    }
    return { ...r, n, drips, beads, seed: ri * 1.7 };
  });
  const raw = lin([132, 22, 24]), rawDeep = lin([78, 9, 11]), crustEdge = lin([44, 12, 10]), swell = lin([156, 96, 100]);
  const paintScratches = (P, Nn, c, st) => {
    if (P[1] < eyeY - 0.13 || P[1] > eyeY + 0.1 || P[2] < eyeZ - 0.07 || Nn[2] < -0.1) return;
    for (const r of rakes) {
      const qx = P[0] - r.s[0], qy = P[1] - r.s[1];
      const al = (qx * r.u[0] + qy * r.u[1]) / r.L;
      // ragged, slightly wavering line
      const ac = qx * r.n[0] + qy * r.n[1] + N.noise(al * 9, r.seed, 2.2) * r.hw * 0.7 + N.noise(al * 40, r.seed, 5.1) * r.hw * 0.25;
      if (al > r.a0 - 0.1 && al < r.a1 + 0.1) {
        // gouge profile: deep and wide in the middle, shallow scratch at both ends (the claw entering / leaving)
        const taper = ss(r.a0 - 0.08, r.a0 + 0.18, al) * (1 - ss(r.a1 - 0.25, r.a1 + 0.06, al));
        const w = r.hw * (0.3 + 0.7 * taper) * (0.85 + 0.3 * N.noise(al * 20, r.seed + 3, 0.9));
        const a = Math.abs(ac);
        if (a < w * 3.4) {
          // slight swelling halo (pink-red, raised), crusted dark edges, raw wet red centre
          const halo = (1 - ss(w * 1.05, w * 3.4, a)) * ss(0.0, 0.4, taper);
          over(c, swell, halo * 0.38);
          const edge = (1 - ss(w * 0.95, w * 1.25, a)) * ss(w * 0.35, w * 0.65, a);
          const flake = ss(-0.2, 0.4, N.noise(al * 90, r.seed, 6.1));
          over(c, crustEdge, edge * (0.55 + 0.4 * flake) * ss(0.0, 0.25, taper));
          const core = (1 - ss(w * 0.5, w * 0.8, a)) * ss(0.0, 0.3, taper);
          over(c, mix3(raw, rawDeep, ss(-0.3, 0.5, N.noise(al * 35, r.seed, 3.3)) * 0.7 + (1 - ss(0, w * 0.4, a)) * 0.3), core * 0.97);
          st.h += halo * 0.45 - core * 1.6 - edge * 0.3;
          st.wet = Math.max(st.wet || 0, core * 0.75);
          st.ro = mix(st.ro, 0.62, edge * 0.6);
        }
      }
      for (const b of r.beads) {
        const e = Math.hypot(P[0] - b.x, P[1] - b.y);
        if (e < b.r * 1.6) {
          const k = 1 - ss(b.r * 0.7, b.r, e);
          over(c, mix3(lin([96, 10, 12]), lin([40, 5, 6]), ss(0.2, 1, e / b.r)), k * 0.95);
          st.h += k * 0.6; st.wet = Math.max(st.wet || 0, k);
        }
      }
      for (const d of r.drips) {
        const dy = d.y - P[1];
        if (dy < -0.001 || dy > d.len + 0.004) continue;
        const ww = d.w * (1 - 0.4 * dy / d.len) * (1 + 0.8 * Math.exp(-(((dy - d.len) / 0.0025) ** 2)));
        const k = (1 - ss(ww * 0.6, ww, Math.abs(P[0] - d.x - Math.sin(dy * 300) * 0.0004))) * (1 - ss(d.len, d.len + 0.003, dy));
        if (k > 0) { over(c, lin([78, 10, 10]), k * 0.9); st.h += k * 0.2; st.wet = Math.max(st.wet || 0, k * 0.5); }
      }
    }
  };
  // fresh, wet blood on both hands (feeding): soaked fingers and palms, ragged edge round mid-forearm, smears above
  const handBlood = (P) => {
    let best = 0;
    for (const [fore, wr, side] of [[foreL, wrists[0], 1], [foreR, wrists[1], -1]]) {
      const f = fore(P);
      if (f.d > 0.09 || f.t < 0.15) continue;
      if (Math.abs(P[0]) < Math.abs(wr[0]) * 0.55) continue;
      // ragged, lobed edge between the wrist and mid-forearm (higher on the inside of the arm), thinning film
      // with gaps above the wrist, solid on the hand
      const edge = 0.66 + N.fbm(P[0] * 12 + side, P[1] * 12, P[2] * 12, 3) * 0.26 + N.noise(P[0] * 70, P[1] * 70, P[2] * 70) * 0.05;
      const film = ss(-0.35, 0.25, N.fbm(P[0] * 34 + 3, P[1] * 34, P[2] * 34, 3)) * 0.55 + ss(0.9, 1.0, f.t);
      let k = ss(edge - 0.08, edge + 0.03, f.t) * Math.min(1, 0.45 + film);
      // a few drag streaks further up the forearm (wiped / run along it)
      const streak = ss(0.6, 0.78, N.noise(P[0] * 26, P[1] * 140, P[2] * 26)) * ss(0.3, edge, f.t) * 0.85;
      k = Math.max(k, streak);
      best = Math.max(best, k);
    }
    return best;
  };
  // brows: thin, arched, sparse (painted, no cards)
  const browAt = (P) => {
    if (P[2] < eyeZ - 0.02 || Math.abs(P[1] - eyeY - 0.02) > 0.02) return 0;
    const ax = Math.abs(P[0]);
    const u = (ax - 0.033) / 0.023;
    if (u < -1.05 || u > 1.05) return 0;
    const y0 = eyeY + 0.0165 + 0.0055 * (1 - u * u) - 0.003 * u + (P[0] < 0 ? -0.0025 : 0.001);
    const th = mix(0.0034, 0.0016, (u + 1) / 2);
    const k = (1 - ss(th * 0.5, th, Math.abs(P[1] - y0))) * (1 - ss(0.85, 1.05, Math.abs(u)));
    return k * (0.55 + 0.45 * ss(-0.2, 0.4, N.noise(P[0] * 900, P[1] * 300, 1.7)));
  };
  // scalp under the hair / brows: a shade darker than the (now dark-brown, ~sRGB 50) hair cards
  const hairCol = lin([44, 34, 27]);
  const crustA = lin([70, 20, 16]), crustB = lin([34, 12, 10]);
  const fresh = lin([84, 8, 9]), freshDeep = lin([40, 4, 5]);
  const skin = lib.paintSkin(h, {
    seed: 17,
    base: skinBase,
    bump: skinBump,
    bumpStrength: 5, normalStrength: 2.4,
    pallor: 0.45, tint: lin([150, 156, 160]), mottle: 0.7, veins: 0.6, bruises: 0.5, socket: 1, lips: 1, grime: 0.55,
    coveredDarken: 0.8, coveredShade: 0.22, // skin seen through tears: pigment here, its shadow in the ORM
    blood: { mouth: 0.8, hands: 0, splatter: 0.15 },
    extra: (P, Nn, c, st) => {
      st.run = 0; st.crust = 0; st.wet = 0;
      // violet lividity and dark marbling on the shoulders / chest / upper arms (bare: crop top, ripped sleeve)
      const marb = N.ridged(P[0] * 30, P[1] * 20, P[2] * 30, 3);
      const zone = ss(1.0, 1.15, P[1]) * (1 - ss(1.45, 1.55, P[1]));
      over(c, lin([60, 54, 74]), ss(0.7, 0.92, marb) * zone * ss(-0.2, 0.4, N.fbm(P[0] * 3, P[1] * 3 + 4, P[2] * 3, 2)) * 0.55);
      mul(c, [0.86, 0.8, 0.94], ss(0.1, 0.6, N.fbm(P[0] * 4 + 2, P[1] * 4, P[2] * 4, 3)) * 0.5);
      // face: hollow cheeks, dark sunken temples, grey-violet lips
      if (P[1] > A.neck[1] + 0.05) {
        for (const e of [A.eyeL, A.eyeR]) {
          const side = Math.sign(e[0]);
          const cheek = Math.hypot((P[0] - e[0] * 1.35) / 0.02, (P[1] - (eyeY - 0.05)) / 0.024, (P[2] - (e[2] - 0.03)) / 0.03);
          mul(c, [0.76, 0.72, 0.74], (1 - ss(0.3, 1.3, cheek)) * 0.45);
          const temple = Math.hypot((P[0] - side * 0.064) / 0.02, (P[1] - (eyeY + 0.01)) / 0.03, (P[2] - (e[2] - 0.035)) / 0.03);
          mul(c, [0.78, 0.76, 0.8], (1 - ss(0.4, 1.4, temple)) * 0.45);
        }
        over(c, hairCol, browAt(P) * 0.75);
        paintScratches(P, Nn, c, st);
      }
      // livid fingers, dark broken nails
      let dt = 1;
      for (const t of tips) dt = Math.min(dt, dist(P, t));
      mul(c, [0.66, 0.58, 0.72], (1 - ss(0.02, 0.08, dt)) * 0.6);
      // grazed left knee (fell on the road): abraded skin, gravel pits, scabbed blood
      const dk = dist(P, [kneeL[0], kneeL[1] - 0.01, kneeL[2] + 0.05]);
      if (dk < 0.09 && P[2] > kneeL[2]) {
        const g = (1 - ss(0.025, 0.075, dk + N.fbm(P[0] * 25, P[1] * 25, P[2] * 25, 3) * 0.02));
        const scr = ss(0.5, 0.85, N.ridged(P[0] * 50, P[1] * 260, P[2] * 50, 2));
        over(c, lin([104, 70, 68]), g * 0.55);                        // abraded, weeping skin
        over(c, lin([64, 16, 14]), g * scr * 0.75);                   // parallel road-rash scores
        over(c, crustB, g * ss(0.15, 0.55, N.fbm(P[0] * 70, P[1] * 70, P[2] * 70, 2)) * 0.8); // scabs
        mul(c, [0.4, 0.38, 0.36], g * (1 - ss(0.06, 0.12, N.worley(P[0] * 160, P[1] * 160, P[2] * 160))) * 0.7); // grit
        over(c, lin([70, 62, 54]), (1 - ss(0.04, 0.1, dk)) * ss(0.0, 0.5, N.fbm(P[0] * 30 + 1, P[1] * 30, P[2] * 30, 3)) * 0.5);
        st.h -= g * scr * 0.6;
      }
      // bare right foot: black sole, filth caked up over the instep and between the toes, cut and bleeding
      if (P[0] < 0 && P[1] < 0.16) {
        const sole = ss(0.3, -0.4, Nn[1]) * (1 - ss(0.02, 0.05, P[1]));
        const dirt = ss(-0.45, 0.35, N.fbm(P[0] * 26, P[1] * 26, P[2] * 26, 4) + (0.11 - P[1]) * 9);
        over(c, lin([58, 50, 42]), dirt * 0.65);
        over(c, lin([26, 21, 17]), Math.max(sole, ss(0.55, 0.9, dirt) * 0.45));
        mul(c, [0.7, 0.62, 0.7], (1 - ss(0.0, 0.1, P[1])) * 0.4);                   // livid, bruised toes
        const cut = ss(0.62, 0.85, N.ridged(P[0] * 60 + 3, P[1] * 60, P[2] * 60, 2)) * ss(-0.1, 0.4, N.fbm(P[0] * 12, P[1] * 12, P[2] * 12, 2));
        over(c, lin([58, 12, 10]), cut * 0.75);
        st.ro = mix(st.ro, 0.85, dirt);
      }
      // bare midriff: the same corpse grading as the arms and face, so it no longer reads as a separate white
      // undershirt band: violet-grey lividity blotches, marbled veins, greenish putrefaction spreading from the flank
      // bite, sweat-and-dirt smears (pigment only: the hem / waistband contact shadow is in the ORM occlusion)
      const mid = ss(gap.lo - 0.03, gap.lo + 0.02, P[1]) * (1 - ss(gap.hi - 0.005, gap.hi + 0.03, P[1]));
      if (mid > 0) {
        mul(c, [0.8, 0.74, 0.88], ss(-0.15, 0.45, N.fbm(P[0] * 7 + 3, P[1] * 7, P[2] * 7, 3)) * mid * 0.75);
        mul(c, [0.86, 0.84, 0.9], mid * 0.5);
        const marb = N.ridged(P[0] * 30 + 5, P[1] * 22, P[2] * 30, 3);
        over(c, lin([62, 56, 76]), ss(0.7, 0.92, marb) * mid * 0.5);
        const l = lum(c[0], c[1], c[2]);
        const putre = Math.max(ss(-0.2, 0.5, N.fbm(P[0] * 6 + 8, P[1] * 6, P[2] * 6, 3)) * 0.5, 1 - ss(0.04, 0.15, dist(P, flank.p)));
        over(c, [l * 0.88, l * 1.04, l * 0.8], putre * mid * 0.6);
        const vn = N.ridged(P[0] * 26, P[1] * 18, P[2] * 26, 3);
        over(c, lin([52, 56, 70]), ss(0.66, 0.9, vn) * mid * 0.55);
        over(c, lin([82, 72, 60]), ss(0.2, 0.65, N.fbm(P[0] * 9 - 3, P[1] * 4, P[2] * 9, 3)) * mid * 0.5);
      }
      // arms, shoulders, back: lighter violet-grey lividity blotches (the bare upper arms were the brightest skin)
      if (P[1] < A.neck[1] - 0.03) {
        mul(c, [0.84, 0.8, 0.9], ss(-0.15, 0.45, N.fbm(P[0] * 7 + 3, P[1] * 7, P[2] * 7, 3)) * 0.6 * (1 - mid));
        // soft ceiling on the body's value (~sRGB 132): the near-white sohh body read as a white garment / glowing arm
        // next to the face; darker blotches below the ceiling are untouched, so the mottling keeps its structure
        const l = lum(c[0], c[1], c[2]), T = 0.23 * ss(A.neck[1] - 0.03, A.neck[1] - 0.09, P[1]) + 0.5 * (1 - ss(A.neck[1] - 0.03, A.neck[1] - 0.09, P[1]));
        if (l > T) { const k = (T / l) ** 0.7; c[0] *= k; c[1] *= k; c[2] *= k; }
      }
      paintShoulderBite(P, Nn, c, st);
      paintFlankBite(P, Nn, c, st);
      // blood: hands, mouth / chin (lib st.bl), wound run-off -> our own colours. Fresh wet red where it is thick,
      // drying to a dark maroon-brown film at the thin edges and in patches (she has been feeding for a while)
      const hb = handBlood(P);
      const wet = Math.max(hb, st.bl, st.run * 0.8);
      if (wet > 0) {
        const n = N.fbm(P[0] * 50, P[1] * 50, P[2] * 50, 3);
        const dry = clamp01(ss(-0.1, 0.45, N.fbm(P[0] * 18 + 40, P[1] * 18, P[2] * 18, 3)) * 0.8 + (1 - ss(0.3, 0.8, wet)) * 0.6);
        const col = mix3(mix3(fresh, freshDeep, ss(-0.3, 0.5, n) * 0.8), mix3(crustA, crustB, ss(-0.2, 0.5, n)), dry);
        over(c, col, ss(0.0, 0.45, wet) * 0.94);
        st.ro = mix(st.ro, mix(0.28, 0.58, dry), ss(0.2, 0.7, wet));
        st.h += wet * 0.15 + dry * ss(0.55, 0.8, N.noise(P[0] * 150, P[1] * 150, P[2] * 150)) * 0.3;
      }
      // fingertips: blood packed round dark, broken nails
      over(c, lin([30, 9, 8]), (1 - ss(0.006, 0.016, dt)) * 0.8);
      st.bl = 0;
      if (st.crust > 0) { over(c, mix3(crustA, crustB, ss(-0.4, 0.4, N.noise(P[0] * 80, P[1] * 80, P[2] * 80))), st.crust); st.ro = mix(st.ro, 0.6, st.crust); }
      if (st.wet > 0) st.ro = mix(st.ro, 0.25, st.wet);
    },
  });
  dilate(skin.albedo, baseMask, 16);
  TR.snap('skin: paintSkin', skin.albedo, body);

  // ---- clothes: recolour (coral-pink top, slate-teal leggings with a broad pale side stripe, dark teal trims), then
  // shred and stain. Real fabric albedos (shipped texture ~125 top / ~95 leggings sRGB): the charcoal leggings (64,
  // her largest visible area) and the dusty rose top (89, maroon-black in shade) made her the darkest walker in game.
  const suitDiff = await lib.texture(suit.asset.textures.diffuse, 2048);
  const SM = suitDiff.width;
  const topMask = new Float32Array(SM * SM);
  // mean luminance of the blue top fabric / the black legging fabric: the new colours keep each fabric's relative
  // shading (knit, folds) around them
  let lBlue = 0, lBlack = 0;
  {
    let n = 0, m = 0;
    for (let i = 0; i < SM * SM; i += 3) {
      const r = S2L[suitDiff.data[i * 4]], g = S2L[suitDiff.data[i * 4 + 1]], b = S2L[suitDiff.data[i * 4 + 2]];
      const l = lum(r, g, b), mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (b > r * 2 && b > 0.05) { lBlue += l; n++; } else if (l > 0.002 && l < 0.08 && mx - mn < 0.3 * mx + 0.004) { lBlack += l; m++; }
    }
    lBlue /= Math.max(1, n); lBlack /= Math.max(1, m);
  }
  const coral = lin([206, 112, 116]), teal = lin([78, 106, 118]), trim = lin([52, 70, 78]), stripeCol = lin([198, 200, 196]);
  const tealL = lum(teal[0], teal[1], teal[2]);
  const suitBase = grade(lib.cloneImage(suitDiff), (c, u, v, a, x, y) => {
    const l = lum(c[0], c[1], c[2]);
    const mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]);
    const sat = mx > 0 ? (mx - mn) / mx : 0;
    const blue = ss(0.25, 0.5, sat) * (c[2] > c[0] ? 1 : 0);
    const orange = ss(0.3, 0.6, sat) * (c[0] > c[2] ? 1 : 0);
    topMask[y * SM + x] = Math.max(blue, orange);
    // leggings (the source's thin white stripe included: it is repainted, wider, in 3D below)
    const kl = l > 0.25 ? 1 : Math.min(1.5, l / lBlack) ** 0.7;
    const out = [teal[0] * kl, teal[1] * kl, teal[2] * kl];
    const k = Math.min(1.5, l / lBlue) ** 0.8;
    over(out, [coral[0] * k, coral[1] * k, coral[2] * k], blue);
    over(out, trim, orange);
    c[0] = out[0]; c[1] = out[1]; c[2] = out[2];
  });
  TR.snap('suit: source', suitDiff, suit);
  TR.snap('suit: graded base', suitBase, suit);
  const topAt = (u, v) => topMask[Math.min(SM - 1, Math.floor(v * SM)) * SM + Math.min(SM - 1, Math.floor(u * SM))];
  const legAxes = [[thighL, 1], [calfL, 1], [thighR, -1], [calfR, -1]];
  const cloth = lib.paintCloth(suit, {
    seed: 29, human: h,
    base: suitBase,
    normal: await lib.texture(suit.asset.textures.normal, 1024),
    ao: await lib.texture(suit.asset.textures.ao, 1024),
    size: 2048, normalSize: 1024, ormSize: 1024,
    // innerDarken 0: the lib's inner-layer pass darkened by 60 % every vertex whose normal ray meets the garment within
    // 4 cm (inner thighs, under the arms): that is ambient occlusion, baked into the ORM below instead
    fade: 0.25, grime: 0.35, grimeNoise: 0.7, weave: 0, yellow: 0, innerDarken: 0,
    blood: { collar: 0, hands: 0, splatter: 0, edges: 0 },
    tear: { amount: 0.36, scale: 6, fray: 0.7, where: tear, threadColor: [0.08, 0.11, 0.12] },
    extra: (P, Nn, c, u, v) => {
      const top = topAt(u, v);
      if (top <= 0) {
        // the lib's warm grime / mud browned the teal: hue pulled half way back (luminance kept)
        const l = lum(c[0], c[1], c[2]);
        over(c, [teal[0] * l / tealL, teal[1] * l / tealL, teal[2] * l / tealL], 0.45);
        // broad pale stripe down the outer seam of each leg (~2.4 cm wide): keeps an edge on the legs against a dark
        // road in shade
        let st = 0;
        for (const [seg, side] of legAxes) {
          const q = seg(P);
          if (q.t < -0.05 || q.t > 1.05 || q.d > 0.12) continue;
          const arc = Math.abs(Math.atan2(P[2] - q.a[2], (P[0] - q.a[0]) * side)) * q.d;
          st = Math.max(st, 1 - ss(0.0105, 0.0135, arc + N.noise(P[1] * 40, side, 4.4) * 0.0008));
        }
        if (st > 0) { const g = clamp01(lum(c[0], c[1], c[2]) / tealL) ** 0.5; over(c, [stripeCol[0] * g, stripeCol[1] * g, stripeCol[2] * g], st * 0.92); }
      }
      // blood from the mouth run down the throat: a small soaked patch at the neckline and two thin drips (it soaked
      // the whole front of the top before and turned it maroon)
      const front = ss(-0.3, 0.3, Nn[2]);
      if (top > 0 && front > 0) {
        const dx = P[0] - A.mouth[0] - 0.008;
        const dy = A.neck[1] - P[1];
        const w = 0.032 * (1 - ss(0.0, 0.13, dy)) + 0.012;
        const wob = N.fbm(P[0] * 12, P[1] * 9, P[2] * 12, 3) * 0.018 + N.fbm(P[0] * 40, P[1] * 40, P[2] * 40, 2) * 0.005;
        const soak = (1 - ss(w - 0.008, w + 0.004, Math.abs(dx + wob))) * (1 - ss(0.11, 0.15, dy + wob * 2)) * ss(-0.05, 0.02, dy);
        const drip = ss(0.52, 0.66, N.noise(P[0] * 140, P[1] * 5, P[2] * 140)) * (1 - ss(0.01, 0.05, Math.abs(dx))) * ss(0.1, 0.14, dy) * (1 - ss(0.2, 0.27, dy));
        const b = Math.max(soak, drip) * front * top;
        over(c, mix3(lin([84, 14, 16]), lin([44, 9, 10]), ss(-0.3, 0.4, N.fbm(P[0] * 20, P[1] * 20, P[2] * 20, 2))), b * 0.9);
        over(c, lin([34, 9, 9]), (1 - ss(0.0, 0.01, Math.abs(Math.abs(dx + wob) - w))) * soak * 0.45 * front);
      }
      // bloody hand wipes on the leggings' thighs (four-finger smears, dragged downwards)
      if (top <= 0 && P[1] > 0.5 && P[1] < 0.92) {
        // [x, top y, z side (+1 front / -1 back), slant]: her bloody right hand dragged down the front of her left
        // thigh, and a smaller left-hand smear on the back of the right hip
        for (const [cx, y0, zs, sl, sc] of [[0.1, 0.84, 1, 0.12, 1], [-0.13, 0.9, -1, -0.2, 0.8]]) {
          const dy = y0 - P[1];
          if (dy < -0.03 || dy > 0.24 * sc || P[2] * zs < -0.02) continue;
          const dx = P[0] - cx - dy * sl;
          if (Math.abs(dx) > 0.06) continue;
          const face = ss(-0.1, 0.4, Nn[2] * zs);
          // palm print: a blotchy oval at the top
          const palm = 1 - ss(0.7, 1.0, Math.hypot(dx / (0.034 * sc), (dy - 0.005) / (0.026 * sc)) + N.fbm(P[0] * 50, P[1] * 50, P[2] * 50, 2) * 0.35);
          // four finger drags of different length / width, wavering, thinning out as the blood runs out
          let fing = 0;
          [[-0.024, 0.13, 0.0065], [-0.008, 0.19, 0.0075], [0.008, 0.17, 0.007], [0.022, 0.1, 0.006]].forEach(([fx, len, w], k) => {
            const L = len * sc, t = dy / L;
            if (t < 0 || t > 1.05) return;
            const xx = dx - fx * sc - Math.sin(dy * 25 + k) * 0.002 - N.noise(dy * 30, k * 3.1, 0.5) * 0.003;
            const ww = w * sc * (1 - 0.45 * t);
            const broken = ss(0.2, 0.6, N.noise(dy * 90, k * 7.3, 1.9) + 0.75 - t * 0.6);
            fing = Math.max(fing, (1 - ss(ww * 0.5, ww, Math.abs(xx))) * (1 - ss(0.85, 1.05, t)) * broken);
          });
          const k = Math.max(palm * 0.85, fing) * face;
          over(c, mix3(lin([66, 13, 12]), lin([38, 10, 9]), ss(-0.3, 0.5, N.noise(P[0] * 40, P[1] * 40, 2.7))), k * 0.85);
        }
      }
      // spatter on the leggings and top (dark drops)
      const sp = 1 - ss(0.06, 0.1, N.worley(P[0] * 40 + 3, P[1] * 40, P[2] * 40));
      over(c, top > 0 ? lin([70, 14, 15]) : lin([44, 10, 10]), sp * ss(0.1, 0.5, N.fbm(P[0] * 3 + 9, P[1] * 3, P[2] * 3, 2) + 0.1) * 0.65);
      // grime: dusty knees (she fell), filthy hems
      const knee = Math.min(dist(P, [kneeL[0], kneeL[1], kneeL[2] + 0.06]), dist(P, [kneeR[0], kneeR[1], kneeR[2] + 0.06]));
      over(c, lin([96, 92, 86]), (1 - ss(0.03, 0.12, knee)) * ss(-0.3, 0.3, N.fbm(P[0] * 20, P[1] * 20, P[2] * 20, 3)) * 0.5);
      over(c, lin([70, 66, 60]), (1 - ss(0.05, 0.3, P[1])) * ss(-0.3, 0.4, N.fbm(P[0] * 15, P[1] * 15, P[2] * 15, 3)) * 0.5);
      if (top > 0) {
        // the top: sweat-darkened under the bust and down the spine, light road dust on the shoulders, grimy blotches
        // (kept light: the stacked x0.72 / x0.66 multipliers turned it maroon-black in shade)
        mul(c, [0.86, 0.84, 0.84], (ss(0.3, -0.6, Nn[1]) * 0.5 + (P[2] < -0.05 ? (1 - ss(0.02, 0.06, Math.abs(P[0]))) * 0.5 : 0)) * top);
        over(c, lin([156, 138, 128]), ss(0.4, 0.9, Nn[1]) * ss(-0.2, 0.5, N.fbm(P[0] * 9, P[1] * 9, P[2] * 9, 3)) * 0.3 * top);
        mul(c, [0.8, 0.75, 0.73], ss(0.1, 0.6, N.fbm(P[0] * 6 + 5, P[1] * 6, P[2] * 6, 3)) * 0.6 * top);
        over(c, lin([104, 88, 76]), ss(0.25, 0.7, N.fbm(P[0] * 11 - 7, P[1] * 11, P[2] * 11, 3)) * 0.3 * top);
      }
    },
  });
  {
    // value check (same measure as albedo.mjs, split by fabric)
    const W = cloth.albedo.width, cov = rasterUV(suit.tris(), suit.obj.uvs, W, 0).covered, d = cloth.albedo.data;
    const acc = [[0, 0, 0, 0], [0, 0, 0, 0]];
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!cov[i] || d[i * 4 + 3] < 128) continue;
      const a = acc[topAt((x + 0.5) / W, (y + 0.5) / W) > 0.5 ? 0 : 1];
      for (let k = 0; k < 3; k++) a[k] += d[i * 4 + k];
      a[3]++;
    }
    const fmt = (a) => `${((a[0] + a[1] + a[2]) / 3 / Math.max(1, a[3])).toFixed(1)} (${a.slice(0, 3).map((x) => (x / Math.max(1, a[3])).toFixed(0)).join('/')})`;
    console.log(`  walker_c: albedo top ${fmt(acc[0])}, leggings ${fmt(acc[1])}`);
  }
  // body faces under intact cloth go away; under holes (and the ripped regions) they stay visible
  const hid = h.hideCovered(body, (p) => cloth.holeAt(p, 0.05));
  console.log(`  walker_c: ${hid} body faces hidden under the clothes, ${cloth.removedFaces} torn-away garment faces`);
  suit.material = lib.material('cloth', { ...cloth, alpha: cloth.alpha, doubleSided: true, pngBits: 6 });
  TR.snap('suit: paintCloth', cloth.albedo, suit);

  // ---- shoe: filthy white trainer, blood spattered; sock grey-brown
  const shoeTex = await lib.texture(shoes.asset.textures.diffuse, 1024);
  const shoeImg = lib.grungeTexture(shoeTex, { seed: 5, darken: 0.15, dirt: 1, blood: 0.45, tint: [0.78, 0.75, 0.7],
    match: (c) => { const l = lum(c[0], c[1], c[2]); for (let i = 0; i < 3; i++) c[i] = mix(c[i], l * [1.04, 1.0, 0.92][i], 0.75); } });
  shoes.material = lib.material('cloth', { albedo: shoeImg, roughness: 0.85 });
  TR.snap('shoes: source', shoeTex, shoes);
  TR.snap('shoes: final', shoeImg, shoes);

  const strands = toPart(lib, h, strandGeo, 'hairfront', 'hair', () => [['head', 1]]);
  const armband = toPart(lib, h, band.g, 'armband', 'gear', () => [['upperarm_l', 1]]);

  // ---- ray-traced AO + cloth contact shadow -> the ORM occlusion channel; the dark scalp (hair roots) under the hair
  // cards is pigment and stays in the albedo
  const surf = (part) => ({ tris: part.tris(), pos: part.pos, nrm: part.normals() });
  const suitS = surf(suit), hairS = surf(hair), shoeS = surf(shoes), strandS = surf(strands), bandS = surf(armband);
  const baseSkin = surf(h.basePart({ name: 'ao' }));
  const RA = texSize(512);
  {
    const bvh = occluders([baseSkin, hairS, shoeS, strandS, bandS]);
    const hairBvh = occluders([hairS]);
    const suitBvh = occluders([suitS]);
    const ao = bakeField(baseSkin, h.baseObj.uvs, RA, aoTracer(bvh, { rays: 16, maxDist: 0.09 }));
    const ray = new THREE.Ray();
    const scalp = bakeField(baseSkin, h.baseObj.uvs, RA, (P, Nn) => {
      if (P[1] < A.neck[1] - 0.02) return 0;
      ray.origin.set(P[0], P[1], P[2]); ray.direction.set(Nn[0], Nn[1], Nn[2]);
      // the sides of the face / jaw look sideways into the hanging curtain a few cm away: without the longer reach they
      // flash pale through the strand gaps
      if (hairBvh.raycastFirst(ray, THREE.DoubleSide, 0, Math.abs(Nn[0]) > 0.45 ? 0.06 : 0.03)) return 1;
      // behind the face (ears, sides of the head inside the curtain): hair close by in any direction counts too
      if (P[2] > eyeZ - 0.04) return 0;
      const hit = hairBvh.closestPointToPoint(new THREE.Vector3(P[0], P[1], P[2]));
      return hit ? 1 - ss(0.02, 0.045, hit.distance) : 0;
    }, { fill: 0, blur: 3 });
    const opaque = (q) => cloth.tearField([q.x, q.y, q.z], [0, 0, 1]) <= 0;
    const shadow = bakeField(baseSkin, h.baseObj.uvs, RA, clothShadowTracer(suitBvh, opaque, { rays: 10, maxDist: 0.06 }), { blur: 1 });
    applyFields(skin.albedo, [scalp], RA, (c, s) => over(c, hairCol, s * 0.8));
    applyOcclusion(skin.orm, [ao, shadow], RA, (a, sh) => mix(1, a, 0.85) * mix(1, sh * sh, 0.9));
  }
  {
    const bvh = occluders([suitS, baseSkin, shoeS, hairS]);
    const ao = bakeField(suitS, suit.obj.uvs, RA, aoTracer(bvh, { rays: 16, maxDist: 0.1 }));
    applyOcclusion(cloth.orm, [ao], RA, (a) => mix(1, a, 0.6)); // on top of the sportsuit's own AO map
  }
  body.material = lib.material('skin', { ...skin });
  TR.snap('skin: + scalp (final)', skin.albedo, body);
  {
    // value check per region of the final skin albedo (sRGB mean): the bare midriff should sit with the arms / face
    const bp = h.basePart({ name: 'meas' }), tr = bp.tris(), nr = bp.normals();
    const R = 512, r = rasterUV(tr, h.baseObj.uvs, R, 0), W = skin.albedo.width, d = skin.albedo.data;
    const acc = {};
    const add = (k, j) => { const a = acc[k] || (acc[k] = [0, 0]); a[0] += (d[j * 4] + d[j * 4 + 1] + d[j * 4 + 2]) / 3; a[1]++; };
    const P = [0, 0, 0], Nn = [0, 0, 0];
    for (let i = 0; i < R * R; i++) {
      if (!texelSurface(r, tr, h.pos, nr, i, P, Nn)) continue;
      const x = i % R, y = (i / R) | 0;
      const j = Math.min(W - 1, Math.floor((y + 0.5) * W / R)) * W + Math.min(W - 1, Math.floor((x + 0.5) * W / R));
      if (P[1] > eyeY - 0.09 && P[1] < eyeY + 0.05 && P[2] > eyeZ - 0.02 && Nn[2] > 0.3) add('face', j);
      else if (P[1] > gap.lo + 0.02 && P[1] < gap.hi - 0.02 && Math.abs(P[0]) < 0.14 && Nn[2] > 0.2) add('midriff', j);
      else {
        const ua = [armL(P), armR(P)].find((q) => q.t > 0.4 && q.t < 1 && q.d < 0.07);
        const fa = [foreL(P), foreR(P)].find((q) => q.t > 0.05 && q.t < 0.5 && q.d < 0.06);
        if (ua) add('upper arms', j); else if (fa) add('forearms', j);
      }
    }
    console.log('  walker_c: albedo skin ' + Object.entries(acc).map(([k, [s, n]]) => `${k} ${(s / n).toFixed(1)}`).join(', '));
  }

  // ---- eyes / teeth / hair
  const eyeTex = await lib.texture('system', 'eyes/materials/brown_eye.png', 512);
  const flatOrm = (ao, rough) => createImage(64, 64, [Math.round(ao * 255), Math.round(rough * 255), 0, 255]);
  eyes.material = lib.material('eye', { albedo: deadEyes(eyeTex, N), orm: flatOrm(0.38, 0.42) });
  eyes.extras.noSimplify = true;
  const teethTex = await lib.texture(teeth.asset.textures.diffuse, 512);
  teeth.material = lib.material('teeth', { albedo: lib.grungeTexture(teethTex, { seed: 9, tint: [0.84, 0.7, 0.5], darken: 0.25, dirt: 0.5, blood: 0.8, freq: 14 }), orm: flatOrm(0.55, 0.4) });
  // hair: only the strand detail of the long01 texture is kept (its luminance over a wide, alpha-normalised blur: the
  // bright root "shine" band and the panel gradients that stepped across the crown are gone), recoloured to a dark
  // ash brown (sRGB ~55) with value variation from the 3D surface: clumps, streaks along the strands, greasy roots on
  // the crown, lighter dry and dusty ends, blood-caked ends round the face. Alpha: the end of the hair at the shoulder
  // blades thins out over 5 cm into clumps of strands of different length (hairEnd: irregular V), and long strand
  // gaps open up in the sheet on the back so it never reads as one flat board. Transparent texels carry the hair
  // colour (no dark / white fringe from filtering). (Was grungeTexture darken 0.25 x tint [.72,.62,.54] x 0.75 on
  // the alpha edges x 0.5 crown grade = sRGB 28: a black slab on her back in game.)
  const hairTex = await lib.texture(hair.asset.textures.diffuse, 1024);
  const hairBase = lin([76, 58, 46]);
  let hairNrm = null;
  const hairImg = (() => {
    const W = hairTex.width, n = W * W, src = hairTex.data;
    const L = new Float32Array(n), A0 = new Float32Array(n);
    for (let i = 0; i < n; i++) { A0[i] = src[i * 4 + 3] / 255; L[i] = lum(S2L[src[i * 4]], S2L[src[i * 4 + 1]], S2L[src[i * 4 + 2]]) * A0[i]; }
    const R = Math.round(W / 40);
    const bl = blurField(L, W, W, R, 2), ba = blurField(A0, W, W, R, 2);
    const tr = hair.tris(), nr = hair.normals();
    const r = rasterUV(tr, hair.obj.uvs, W, 4);
    const out = createImage(W, W, [toByte(hairBase[0]), toByte(hairBase[1]), toByte(hairBase[2]), 0]);
    const hgt = new Float32Array(n);
    const dry = lin([118, 100, 84]), root = lin([44, 34, 27]), dust = lin([112, 104, 94]);
    const P = [0, 0, 0], Nn = [0, 0, 0], c = [0, 0, 0];
    let sum = 0, cnt = 0;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, o = i * 4;
      if (!texelSurface(r, tr, hair.pos, nr, i, P, Nn)) continue;
      const u = (x + 0.5) / W, v = (y + 0.5) / W;
      const det = ba[i] > 0.05 && A0[i] > 0.02 && bl[i] > 1e-5 ? Math.max(0.45, Math.min(1.7, (L[i] / A0[i]) / (bl[i] / ba[i]))) : 1;
      const ang = hairAng(P);
      const clump = N.fbm(ang * 5 + 2, P[1] * 3, 4.4, 3), streak = N.noise(u * 140, v * 3, 3.3);
      const fine = N.noise(u * 420, v * 6, 1.9);
      const k = (0.92 + 0.24 * clump + 0.2 * streak + 0.08 * fine) * det ** 0.85;
      hgt[i] = (det - 1) * 0.8 + streak * 0.5 + fine * 0.35;
      for (let q = 0; q < 3; q++) c[q] = hairBase[q] * k;
      const end = hairEnd(P);
      // greasy, darker roots on the crown (patchy, not a uniform band)
      over(c, root.map((x) => x * k), ss(A.head[1] + 0.06, A.head[1] + 0.12, P[1]) * ss(-0.2, 0.5, N.fbm(P[0] * 30, P[1] * 30, P[2] * 30, 2)) * 0.45);
      // dry, lighter, dusty ends
      over(c, dry.map((x) => x * k), (1 - ss(end, end + 0.12, P[1])) * (0.18 + 0.22 * ss(-0.3, 0.5, clump)));
      over(c, dust, ss(0.3, 0.75, N.fbm(P[0] * 8 + 3, P[1] * 8, P[2] * 8, 3)) * 0.22);
      // blood-caked ends round her face / jaw
      if (P[2] > eyeZ - 0.07 && P[1] < eyeY) {
        over(c, mix3(crustA, crustB, ss(-0.2, 0.5, N.noise(P[0] * 90, P[1] * 90, P[2] * 90))), ss(0.05, 0.45, N.fbm(P[0] * 14 + 1, P[1] * 14, P[2] * 14, 3)) * (1 - ss(eyeY - 0.06, eyeY, P[1])) * 0.75);
      }
      let a = A0[i];
      // end of the hair: below `end` nothing; above it strands of different length thin out over 5 cm
      const sLen = 0.6 * (N.noise(u * 160, 0.5, 9.1) * 0.5 + 0.5) + 0.4 * (N.noise(u * 28, 0.5, 2.3) * 0.5 + 0.5);
      const thin = 1 - ss(end, end + 0.05, P[1]);
      if (P[1] < end || sLen < thin * 1.05) a = 0;
      // long strand gaps in the sheet below the nape, more of them towards the ends
      if (P[1] < A.neck[1] - 0.02) {
        const g = N.noise(u * 70, v * 2.2, 7.3) * 0.5 + 0.5;
        if (g > 0.84 - 0.12 * (1 - ss(end, A.neck[1] - 0.02, P[1]))) a = 0;
      }
      out.data[o] = toByte(c[0]); out.data[o + 1] = toByte(c[1]); out.data[o + 2] = toByte(c[2]);
      out.data[o + 3] = Math.round(a * 255);
      if (a >= 0.5) { sum += (out.data[o] + out.data[o + 1] + out.data[o + 2]) / 3; cnt++; }
    }
    console.log(`  walker_c: albedo hair ${(sum / Math.max(1, cnt)).toFixed(1)}`);
    // strand relief (tangent-space normal from the strand streaks): breaks the smooth helmet-like sheen of the shell
    hairNrm = lib.resize(normalFromHeight(hgt, W, W, 2.5 * W / 1024), Math.round(W / 2), Math.round(W / 2));
    return out;
  })();
  hair.material = lib.material('hair', { albedo: hairImg, normal: hairNrm, alpha: true, roughness: 0.8, doubleSided: true });

  // face strands: the hair colour (wet, a little darker) with our own strand alpha — thinning out towards the ribbon
  // edges, splitting into separate wet strands towards the tips, blood-clotted ends
  {
    const W = texSize(128), H = texSize(512);
    const img = createImage(W, H, [toByte(hairBase[0]), toByte(hairBase[1]), toByte(hairBase[2]), 0]);
    const cols = [[0, 0.5], [0.5, 1]];
    const c = [0, 0, 0];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W, t = (y + 0.5) / H, o = (y * W + x) * 4;
      const [u0, u1] = cols.find(([a, b]) => u >= a && u < b) || cols[0];
      const s = (u - u0) / (u1 - u0), e = 1 - Math.abs(2 * s - 1);
      const fine = N.noise(u * 95, t * 2.5, 3.3) * 0.5 + 0.5, bundle = N.noise(u * 13, t * 1.1, 8.1) * 0.5 + 0.5;
      // wet, greasy strands: the hair base colour a little darker, per-strand value variation
      const kv = 0.72 + 0.3 * fine + 0.12 * bundle;
      for (let k = 0; k < 3; k++) c[k] = hairBase[k] * kv;
      const val = 0.55 * fine + 0.45 * bundle;
      const thr = 0.25 + 0.42 * (1 - e) ** 1.5 + 0.3 * ss(0.5, 1, t) + 0.6 * (1 - ss(0.0, 0.1, t));
      over(c, mix3(crustB, lin([66, 14, 12]), ss(-0.2, 0.5, N.noise(u * 30, t * 8, 4.4))), ss(0.55, 0.9, t) * ss(-0.1, 0.4, N.fbm(u * 6, t * 4, 2.2, 2)) * 0.85);
      img.data[o] = toByte(c[0]); img.data[o + 1] = toByte(c[1]); img.data[o + 2] = toByte(c[2]);
      img.data[o + 3] = val > thr ? 255 : 0;
    }
    strands.material = lib.material('hair', { albedo: img, alpha: true, roughness: 0.62, doubleSided: true });
  }

  // armband: black neoprene with a dirty reflective strip, blood smears; pouch: rubber rim, phone screen shattered
  // from an impact in its upper corner, bloody finger swipes across the glass
  {
    const W = texSize(256);
    const alb = createImage(W, W, [0, 0, 0, 255]), orm = createImage(W, W, [255, 220, 0, 255]);
    const c = [0, 0, 0];
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W, v = 1 - (y + 0.5) / W, o = (y * W + x) * 4;
      let ro = 0.85;
      if (u < 0.5) {
        const n = N.noise(u * 200, v * 200, 1.7) * 0.5 + 0.5;
        const b = lin([22, 22, 24]); for (let k = 0; k < 3; k++) c[k] = b[k] * (0.85 + 0.3 * n);
        over(c, lin([118, 118, 114]), (1 - ss(0.02, 0.035, Math.abs(u - 0.25))) * 0.85);       // reflective strip
        over(c, lin([70, 64, 56]), ss(0.1, 0.6, N.fbm(u * 8, v * 8, 3.3, 3)) * 0.5);           // grime
        const bl = ss(0.15, 0.5, N.fbm(u * 6 + 3, v * 5, 5.1, 3));
        over(c, mix3(lin([60, 10, 10]), crustB, ss(-0.2, 0.4, N.noise(u * 30, v * 30, 2.2))), bl * 0.9);
        ro = mix(0.85, 0.45, bl);
      } else {
        const uu = (u - 0.51) / 0.47, vv = (v - 0.04) / 0.92;
        const edge = Math.min(uu, 1 - uu, vv, 1 - vv);
        if (edge < 0.1) {
          const b = lin([38, 38, 40]); for (let k = 0; k < 3; k++) c[k] = b[k] * (0.9 + 0.2 * N.noise(u * 90, v * 90, 4.4));
          ro = 0.7;
        } else {
          // glass: near black, a faint grey reflection band, spider-web cracks round the impact point
          const g0 = lin([7, 8, 10]); for (let k = 0; k < 3; k++) c[k] = g0[k];
          const dx = uu - 0.3, dy = vv - 0.78, r = Math.hypot(dx * 0.6, dy);
          const ang = Math.atan2(dy, dx * 0.6);
          const rad = 1 - ss(0.0, 0.08, Math.abs(Math.sin(ang * 5 + N.noise(r * 9, ang, 1.1) * 1.4 + r * 3)) * r * 9);
          const ring = (1 - ss(0.0, 0.012, Math.abs(((r * 9 + N.noise(ang * 3, r, 2.2) * 0.6) % 1) - 0.5) * r)) * (1 - ss(0.1, 0.5, r));
          over(c, lin([96, 100, 106]), Math.max(rad * (1 - ss(0.25, 0.9, r)), ring) * 0.85);
          over(c, lin([60, 62, 66]), (1 - ss(0.0, 0.05, r)) * 0.9);
          const swipe = ss(0.55, 0.75, Math.abs(Math.sin((uu + vv * 0.35) * 18 + N.noise(uu * 4, vv * 4, 7.7)))) * ss(0.2, 0.6, N.fbm(uu * 3, vv * 3, 6.6, 2) + 0.2);
          over(c, mix3(lin([66, 10, 10]), crustB, 0.4), swipe * 0.85);
          ro = mix(0.12, 0.5, swipe);
        }
      }
      alb.data[o] = toByte(c[0]); alb.data[o + 1] = toByte(c[1]); alb.data[o + 2] = toByte(c[2]);
      orm.data[o + 1] = Math.round(clamp01(ro) * 255);
    }
    armband.material = lib.material('gear', { albedo: alb, orm, doubleSided: true });
  }

  // ---- mouth cavity (+ LOD1 eye-socket caps)
  const cavTex = createImage(64, 64, [0, 0, 0, 255]);
  grade(cavTex, (c, u) => {
    if (u < 0.5) { const k = ss(0.06, 0.42, u); const a = lin([60, 16, 15]), b = lin([9, 4, 4]); for (let i = 0; i < 3; i++) c[i] = mix(a[i], b[i], k); }
    else { const e = lin([110, 100, 86]); for (let i = 0; i < 3; i++) c[i] = e[i]; }
  });
  const mouth = toPart(lib, h, cavityGeo, 'mouth', 'gore', () => [['head', 1]]);
  mouth.material = lib.material('gore', { albedo: cavTex, roughness: 0.8, doubleSided: true });

  // ---- hitboxes: arms / hands measured on the naked base mesh (loose cloth pollutes the percentile)
  const allHb = computeHitboxes(h, [body, suit, shoes, eyes, teeth].map((p) => p.toRender()));
  const bodyHb = computeHitboxes(h, [h.basePart({ name: 'hb' }).toRender()]);
  const hitboxes = { ...allHb.hitboxes }, capsules = { ...allHb.capsules };
  const setHb = (key, bone, r, to) => {
    r = +r.toFixed(3);
    hitboxes[key] = to ? [bone, r, to] : [bone, r];
    const b = sk[bone], e = to ? sk[to].head : b.tail;
    capsules[key] = { bone, radius: r, length: +b.head.distanceTo(e).toFixed(3), ...(to ? { to } : {}) };
  };
  for (const s of ['l', 'r']) {
    setHb(`upperarm_${s}`, `upperarm_${s}`, Math.min(0.055, Math.max(0.045, bodyHb.hitboxes[`upperarm_${s}`][1] + 0.005)));
    setHb(`lowerarm_${s}`, `lowerarm_${s}`, Math.min(0.045, Math.max(0.033, bodyHb.hitboxes[`lowerarm_${s}`][1])));
    setHb(`hand_${s}`, `hand_${s}`, 0.04, `middle_01_${s}`);
  }
  // chest: the 80th percentile of spine_03's vertices (bust, shoulder blades, shoulders) made it a 16 cm capsule round a
  // bone that runs up her back half -> measured on the naked base mesh and held to a slim female chest (12-13.5 cm).
  // (Hair never enters these measurements: the hair / strands are not in either list.)
  console.log(`  walker_c: chest hitbox ${allHb.hitboxes.chest[1]} (dressed) / ${bodyHb.hitboxes.chest[1]} (naked)`);
  setHb('chest', 'spine_03', Math.min(0.135, Math.max(0.12, bodyHb.hitboxes.chest[1])));

  TR.report();
  return {
    human: h,
    parts: [body, suit, shoes, eyes, teeth, hair, strands, mouth, armband],
    // the hair shell is ~1.4k tris now (was 3.3k of arch cards + waist-long sheet): the saving goes to the body and the
    // clothes silhouette. Teeth: the MakeHuman teeth are many small closed pieces; meshoptimizer stops at ~500 within
    // its error bound, accepted (they are only seen up close, in the open mouth).
    budget: 9000,
    partBudget: { body: 2700, clothes: 2900, shoes: 420, teeth: 500, hair: 1700 },
    extras: { poseOffsets, archetype: 'shambler', gender: 'female', hitboxes, capsules },
    // LOD1: the armband (200 tris, 8 % of the budget at LOD0 detail) is reduced to ~40, the saving goes to the hair
    lod1: { budget: 2500, drop: ['teeth', 'eyebrows', 'eyes'], texScale: 0.5, partBudget: { clothes: 820, body: 780, shoes: 120, hair: 560, armband: 40 } },
  };
}
