// runner — 狂奔者 Runner: a young man (~1.75 m) starved down to sinew: emaciated, wiry, every rib, the collarbones,
// the hip bones and the knuckles showing through tight skin; very thin arms and legs; a shaved, skull-like head.
// Darker, dusky-ashen infected skin with a dense raised black-violet vein network (thickest on the neck, temples,
// chest, forearms and hands) and feverish, inflamed eye sockets that bleed black tears; glowing amber-red eyes with
// pinpoint pupils (emissive). A stretched rage grimace: brows crushed down, lips pulled back off yellow, bloody teeth,
// fresh blood smeared round the mouth and chin and running down the throat; bloody hands with broken black nails.
// Clothes: a filthy, shredded tank top (cut from the CC0 male_casualsuit06 white T-shirt: sleeves ripped off at the
// seam, deep ragged armholes over the bare rib cage, scooped neck, hem torn up over the sunken belly, three claw rips
// across the chest, a hole over the left shoulder blade) and frayed denim cut-offs (the jeans of the same garment torn
// off mid-thigh, the left leg shorter); bare, filthy feet; road rash on both knees and the right elbow, a bite on the
// left forearm, claw wounds under the shirt rips, a torn-off patch of scalp over the right temple.
// Silhouette: long bare limbs, narrow shoulders hiked up, head jutting forward (poseOffsets).
//
// Everything specific to this character lives in this file; the shared lib is only imported read-only (UV raster,
// blur / normal-from-height, rig segments, hitbox measure). Implemented here: skin composite on the young male
// skin's detail, rib cage / collarbone / spine / hip-bone relief, vein network, inflamed eyes + black tears, buzz-cut
// scalp (soft hairline, ear margin from a ray-cast pinna mask), painted brows, fresh vs dried blood, wounds and road rash, bare-foot dirt and toenails, the tank top /
// cut-off conversion (per-garment cut fields with frayed thread fringes, face deletion), the cloth recolour (logo
// removal), ray-traced AO + alpha-aware cloth-shadow bakes (into the ORM occlusion, never the albedo), glowing eyes,
// the sealed mouth cavity, cranium refinement, hitbox tightening.
// Albedo targets (in-game readability): skin ~95-110 (warm dusky), tank top ~140-155 (cool light grey: it must not
// share the skin's value / hue, and must keep its value backlit at 15 m), denim ~80-90 and visibly blue (sRGB mean
// over painted texels; check with tools/assets/zombies/albedo.mjs --uv, shirt = v < 0.44, or ZOMBIE_ALBEDO_TRACE=1).
// The dusky look is hue + local detail.
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { rasterUV, texelSurface, texelAttr } from '../lib/raster.mjs';
import { blurField, createImage } from '../lib/image.mjs';
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
const TAG = '  runner:';

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

// ---------- palette (linear)
// Albedo levels (game readability, docs/ZOMBIE_PIPELINE.md 2.3): the painted skin must average sRGB ~95-110 and the
// clothes 60-120. "Dusky" is a hue (grey-brown, violet and olive drifts), not a low value: the darkness of this
// character comes from local detail (veins, sockets, blood) and the ORM occlusion, never from a dim base.
const C = {
  // dusky, ashen infected skin: grey-brown with a bruised violet drift and a sick olive drift
  skin: lin([138, 128, 112]), skinAsh: lin([134, 132, 126]), skinOlive: lin([136, 134, 100]), skinBruise: lin([132, 110, 116]),
  livid: lin([110, 98, 116]), waxy: lin([186, 178, 158]),
  vein: lin([38, 26, 44]), veinHalo: lin([70, 30, 38]),
  socket: lin([46, 22, 26]), inflamed: lin([118, 44, 40]),
  stubble: lin([62, 58, 56]), scalp: lin([118, 108, 100]),
  brow: lin([34, 27, 24]),
  lip: lin([96, 52, 54]), gum: lin([92, 34, 36]),
  // fresh blood is a deep but readable red (under the chin, in shadow, the old 72/10/10 went black)
  fresh: lin([90, 14, 12]), freshDeep: lin([52, 9, 8]), dried: lin([66, 22, 16]), crust: lin([44, 18, 13]),
  meat: lin([96, 22, 19]), meatDeep: lin([36, 8, 8]), fat: lin([170, 140, 84]), bone: lin([186, 174, 148]),
  rash: lin([104, 60, 50]), rashRaw: lin([124, 70, 58]),
  mud: lin([66, 56, 44]), sole: lin([60, 50, 42]), nail: lin([52, 44, 44]), grime: lin([96, 84, 68]),
  bruise: lin([96, 62, 92]),
  // clothes: cool light heather-grey cotton (tank top) and a faded mid-blue denim (scale on the source jeans)
  cotton: lin([179, 185, 195]), denimK: 0.77, fray: lin([196, 192, 182]),
};
/** Image-v below which the casualsuit06 atlas holds the T-shirt (above: the jeans). */
const SHIRT_V = 0.44;

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

/**
 * Limb coordinates along a bone chain: P -> {s, r, ang}. s = segment index + t (0 = chain start, 1 = first joint
 * ...), r = distance to the axis (m), ang = angle around the axis (rad; 0 = the side facing +Z, parallel-transported
 * down the chain).
 */
function limbCoords(h, names) {
  const B = h.skeleton.byName;
  const pts = [B[names[0]].head.toArray(), ...names.map((n) => B[n].tail.toArray())];
  const segs = [];
  let f = [0, 0, 1];
  for (let i = 0; i < names.length; i++) {
    const a = pts[i], b = pts[i + 1];
    const d = sub(b, a);
    const L = Math.hypot(...d);
    const ax = scl(d, 1 / L);
    const k = dot(f, ax);
    const ff = norm(sub(f, scl(ax, k)));
    segs.push({ a, ax, L, f: ff, side: cross(ax, ff) });
    f = ff;
  }
  return (P) => {
    const out = { s: 0, r: 1e9, ang: 0, L: 0 };
    for (let i = 0; i < segs.length; i++) {
      const g = segs[i];
      const v = sub(P, g.a);
      const t = dot(v, g.ax) / g.L;
      const q = sub(v, scl(g.ax, clamp01(t) * g.L));
      const r = Math.hypot(...q);
      if (r < out.r - 1e-9) { out.s = i + t; out.r = r; out.ang = Math.atan2(dot(q, g.side), dot(q, g.f)); out.L = g.L; }
    }
    return out;
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
 * Repacks the UV islands of a Part's kept faces into the unit square (one uniform scale, shelf packing, no rotation,
 * `pad` UV units of gutter round each island) so the texture is not spent on deleted faces. Rewrites the UVs in
 * place. Returns { s, boxes, islandAt(u, vImg) -> box | null (image coordinates, v down), remap(img) } where remap
 * resamples an image painted in the old layout into the new one (bilinear; texels outside every island = fill).
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
 * Ray-traced occlusion (cosine-weighted, distance-attenuated) against a BVH. `opaque(hit)` (optional) lets rays
 * pass through cut-away cloth (up to 3 layers), so skin seen through a torn hole is dark at the rim of the hole and
 * only a little lighter in its middle.
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

/**
 * Multiplies the occlusion (R) channel of an ORM image by fn(...values) of fields baked at R x R. AO and contact
 * shadows go here and NOT into the albedo: the ORM is exported as the glTF occlusionTexture, and baking the same
 * shadow into baseColor as well is what turned the first runner into a black silhouette in the game's lighting.
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

/**
 * Pull-push fill: every texel outside `mask` takes a smooth, multi-scale average of the surrounding island colours
 * (no flat background, no dilation streaks). The low-poly proxy's UVs do not follow the base mesh's island borders
 * exactly: under the ears its triangles span a notch in the head island, and the flat light fill sampled there read
 * as a pale polygon "fin" at the jaw angle.
 */
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
      // bilinear sample of the (already filled) coarser level
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

/** Pushes colours `passes` texels out of the islands (mask == 1) into the empty texels (4-neighbour average); returns the grown mask. */
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

// ---------- custom geometry -> skinned Part (mouth cavity)
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

/**
 * Dark oral cavity sealed to the lip boundary loop of the body proxy (rim tucked just behind the lip edge, then
 * ballooning back around the teeth and closing at the throat), plus small caps behind the eyelid openings. Every
 * ring vertex is kept >= 2.5 mm inside the head surface. u < 0.5 = cavity, u > 0.5 = eye cap in the texture.
 */
function mouthCavity(h, body, A) {
  const loops = boundaryLoops(body);
  const P = (v) => [body.pos[v * 3], body.pos[v * 3 + 1], body.pos[v * 3 + 2]];
  const cen = (loop) => loop.reduce((a, v) => add(a, scl(P(v), 1 / loop.length)), [0, 0, 0]);
  const near = (c, r) => loops.map((l) => [l, dist(cen(l), c)]).filter(([, d]) => d < r).sort((a, b) => a[1] - b[1])[0]?.[0];
  const mouth = near(A.mouth, 0.04), eyes = [near(A.eyeL, 0.03), near(A.eyeR, 0.03)];
  if (!mouth) throw new Error('runner: mouth boundary loop not found');
  const headBvh = occluders([{ pos: body.pos, tris: body.tris() }]);
  const g = new Geo();
  const wOf = (v) => body.weights[v];
  const inside = (p, axis, minD = 0.0025) => {
    for (let k = 0; k < 14 && signedDist(headBvh, p) > -minD; k++) p = add(axis, scl(sub(p, axis), 0.85));
    return p;
  };
  const Cm = cen(mouth);
  const ringDef = [[0.0015, 1, 1, 0.06], [0.012, 1.1, 1.7, 0.22], [0.032, 0.9, 1.4, 0.38]]; // depth, sx, sy, u
  const rings = ringDef.map(([depth, sx, sy, u], ri) => mouth.map((v) => {
    const p = P(v), d = sub(p, Cm);
    let q;
    if (ri === 0) { const r = norm([d[0], d[1], 0]); q = [p[0] + r[0] * 0.0015, p[1] + r[1] * 0.0015, p[2] - depth]; }
    else q = inside([Cm[0] + d[0] * sx, Cm[1] + d[1] * sy, Cm[2] - depth], [Cm[0], Cm[1], Cm[2] - depth]);
    return g.v(q, [u, 0.5], wOf(v));
  }));
  const apex = g.v(inside([Cm[0], Cm[1] - 0.004, Cm[2] - 0.05], [Cm[0], Cm[1], Cm[2] - 0.045]), [0.46, 0.5], [['head', 1]]);
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

/**
 * Laplacian relax of a proxy Part's vertices weighted by zone(P) (0..1; boundary-loop vertices stay fixed): smooths
 * the crumpled, sharply creased triangles the open-jaw expression leaves at the jaw angle under the ears. Mutates
 * part.pos; returns the largest crease angle (deg) between adjacent faces inside the zone before / after.
 */
function relaxFolds(part, zone, { iters = 6, k = 0.55 } = {}) {
  const pos = part.pos, n = pos.length / 3;
  const F = [];
  part.obj.faces.forEach((f, fi) => { if (part.keep[fi]) for (let j = 1; j + 1 < f.v.length; j++) F.push([f.v[0], f.v[j], f.v[j + 1]]); });
  const nb = Array.from({ length: n }, () => new Set());
  const ek = (a, b) => (a < b ? a * 4194304 + b : b * 4194304 + a);
  const edges = new Map();
  F.forEach((t, ti) => {
    for (let j = 0; j < 3; j++) {
      const a = t[j], b = t[(j + 1) % 3];
      nb[a].add(b); nb[b].add(a);
      const key = ek(a, b);
      if (!edges.has(key)) edges.set(key, []);
      edges.get(key).push(ti);
    }
  });
  const fixed = new Uint8Array(n);
  for (const [key, fs] of edges) if (fs.length === 1) { const a = Math.floor(key / 4194304); fixed[a] = 1; fixed[key - a * 4194304] = 1; }
  const P = (v) => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
  const w = new Float32Array(n);
  for (let v = 0; v < n; v++) w[v] = fixed[v] || !nb[v].size ? 0 : clamp01(zone(P(v)));
  const fn = (t) => norm(cross(sub(P(t[1]), P(t[0])), sub(P(t[2]), P(t[0]))));
  const worst = () => {
    let m = 0;
    for (const [key, fs] of edges) {
      if (fs.length !== 2) continue;
      const a = Math.floor(key / 4194304);
      if (!(w[a] > 0.3 || w[key - a * 4194304] > 0.3)) continue;
      m = Math.max(m, Math.acos(Math.max(-1, Math.min(1, dot(fn(F[fs[0]]), fn(F[fs[1]]))))) * 180 / Math.PI);
    }
    return m;
  };
  const before = worst();
  // Taubin lambda / mu passes: smooths the creases without shrinking the neck
  for (let it = 0; it < iters * 2; it++) {
    const s = it % 2 ? -(k + 0.03) : k;
    const next = pos.slice();
    for (let v = 0; v < n; v++) {
      if (!(w[v] > 0)) continue;
      const c = [0, 0, 0];
      for (const u of nb[v]) for (let j = 0; j < 3; j++) c[j] += pos[u * 3 + j] / nb[v].size;
      for (let j = 0; j < 3; j++) next[v * 3 + j] = pos[v * 3 + j] + (c[j] - pos[v * 3 + j]) * s * w[v];
    }
    pos.set(next);
  }
  return [before, worst()];
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
 * Red-green refinement of a proxy Part inside `zone` (position predicate): every triangle fully inside is split
 * into 4, its neighbours into 2-3 (no T-junctions). New vertices are projected onto the high-resolution base mesh
 * (keeping the proxy's local offset from it) and bound to the base triangle they land on, so they morph, skin and
 * get `_seg` like every other vertex. Returns a new Part. (The shaved low-poly proxy skull is visibly faceted.)
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

/** Brow guide from fitted eyebrow cards: per side (0 = left / +x, 1 = right), |x| range and centre height / half height. */
function browField(part) {
  const sides = [[], []];
  for (let v = 0; v < part.nVerts; v++) {
    const p = [part.pos[v * 3], part.pos[v * 3 + 1], part.pos[v * 3 + 2]];
    sides[p[0] > 0 ? 0 : 1].push(p);
  }
  return sides.map((pts) => {
    const ax = pts.map((p) => Math.abs(p[0]));
    const x0 = Math.min(...ax), x1 = Math.max(...ax);
    const NB = 10, ys = new Array(NB).fill(null), hs = new Array(NB).fill(null);
    for (let b = 0; b < NB; b++) {
      const lo = x0 + (x1 - x0) * b / NB - 1e-6, hi = x0 + (x1 - x0) * (b + 1) / NB + 1e-6;
      const yv = pts.filter((p) => Math.abs(p[0]) >= lo && Math.abs(p[0]) <= hi).map((p) => p[1]);
      if (!yv.length) continue;
      ys[b] = (Math.min(...yv) + Math.max(...yv)) / 2; hs[b] = (Math.max(...yv) - Math.min(...yv)) / 2;
    }
    for (let pass = 0; pass < NB; pass++) for (let b = 0; b < NB; b++) if (ys[b] === null) {
      const n = ys[b - 1] ?? ys[b + 1] ?? null;
      if (n !== null) { ys[b] = n; hs[b] = hs[b - 1] ?? hs[b + 1]; }
    }
    return {
      x0, x1,
      at: (a) => {
        const f = Math.min(NB - 1, Math.max(0, (a - x0) / (x1 - x0) * NB - 0.5));
        const i = Math.floor(f), j = Math.min(NB - 1, i + 1);
        return { y: mix(ys[i], ys[j], f - i), hw: Math.max(0.003, mix(hs[i], hs[j], f - i)) };
      },
    };
  });
}

/**
 * Toe tips on the morphed base mesh (the low-poly proxy foot samples the same UVs): per foot, 5 toes spread over the
 * front edge. Returns [{p, r (half nail width), side, xIn, xOut}].
 */
function toeTips(h) {
  const B = h.skeleton.byName, out = [];
  for (const [s, sgn] of [['l', 1], ['r', -1]]) {
    const ball = B[`ball_${s}`].head;
    const bins = new Map();
    for (const v of h.baseObj.groupVerts('body')) {
      const x = h.pos[v * 3], y = h.pos[v * 3 + 1], z = h.pos[v * 3 + 2];
      if (y > 0.06 || x * sgn < 0.01 || z < ball.z) continue;
      const k = Math.round(x / 0.002);
      const b = bins.get(k);
      if (!b || z > b[2]) bins.set(k, [x, y, z]);
    }
    const keys = [...bins.keys()].sort((a, b) => a - b);
    if (!keys.length) continue;
    const zmax = Math.max(...keys.map((k) => bins.get(k)[2]));
    const front = keys.map((k) => bins.get(k)).filter((p) => p[2] > zmax - 0.035).map((p) => Math.abs(p[0]));
    const xIn = Math.min(...front), xOut = Math.max(...front);
    [0.15, 0.41, 0.6, 0.77, 0.91].forEach((f, i) => {
      const ax = mix(xIn, xOut, f);
      let tip = null;
      for (const k of keys) { const p = bins.get(k); if (Math.abs(Math.abs(p[0]) - ax) < 0.004 && (!tip || p[2] > tip[2])) tip = p; }
      if (tip) out.push({ p: [sgn * ax, tip[1], tip[2]], r: i === 0 ? 0.0085 : 0.0052, side: s, xIn, xOut });
    });
  }
  return out;
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
 * Glowing infected eyes on the MakeHuman eye texture (two eyeballs; centres / iris radius measured on brown_eye.png):
 * a yellow-orange, densely bloodshot sclera darkening towards the lids, a molten amber iris going red at the rim,
 * radial fibres, a pinpoint dark-red pupil. Returns {albedo, emissive}: the emissive map lights the iris (and,
 * faintly, the capillaries), so it blooms in the dark.
 */
function glowEyes(src, N) {
  const W = src.width, H = src.height;
  const alb = createImage(W, H), em = createImage(W, H, [0, 0, 0, 255]);
  const centres = [[0.705, 0.295], [0.29, 0.71]];
  const c = [0, 0, 0], e = [0, 0, 0];
  const IR = 0.112;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, u = (x + 0.5) / W, v = (y + 0.5) / H;
    let d = 9, cu = 0, cv = 0;
    for (const [a, b] of centres) { const q = Math.hypot(u - a, v - b); if (q < d) { d = q; cu = u - a; cv = v - b; } }
    const ang = Math.atan2(cv, cu);
    e[0] = e[1] = e[2] = 0;
    if (d > 0.3) { c[0] = 0.03; c[1] = 0.012; c[2] = 0.01; }
    else if (d > IR + 0.012) {
      // sclera: dirty yellow-orange, dense red capillaries thickening towards the corners, dark towards the lids
      const n = N.fbm(u * 26, v * 26, 1.5, 3);
      for (let k = 0; k < 3; k++) c[k] = lin([150, 104, 52])[k] * (0.9 + 0.15 * n);
      const far = ss(0.13, 0.26, d);
      const vein = N.ridged(u * 36, v * 36, 1.7, 3), vein2 = N.ridged(u * 90 + 3, v * 90, 4.2, 2);
      const vv = ss(0.5 - far * 0.18, 0.78, vein) * (0.6 + far * 0.4);
      over(c, lin([128, 16, 12]), vv);
      over(c, lin([110, 20, 14]), ss(0.68, 0.9, vein2) * (0.3 + far * 0.6));
      mul(c, lin([150, 70, 60]), far * 0.7);
      kmul(c, 1 - 0.55 * ss(0.16, 0.28, d));
      // the hot iris bleeds a little light into the wet sclera next to it
      const halo = 1 - ss(IR, IR + 0.05, d);
      e[0] = 0.22 * halo + 0.05 * vv; e[1] = 0.05 * halo; e[2] = 0.005 * halo;
    } else if (d > IR) {
      // dark-red limbal ring
      c[0] = 0.09; c[1] = 0.012; c[2] = 0.006;
      e[0] = 0.35; e[1] = 0.04; e[2] = 0.0;
    } else {
      // iris: molten amber in the middle -> orange -> deep red rim, radial fibres and crypts
      const r = d / IR;
      const fib = N.noise(ang * 14, r * 4, 2.5) * 0.5 + 0.5, fib2 = N.noise(ang * 40, r * 9, 7.1) * 0.5 + 0.5;
      const col = mix3(lin([250, 140, 30]), lin([215, 58, 12]), ss(0.3, 0.75, r));
      const rim = mix3(col, lin([96, 10, 5]), ss(0.7, 1.0, r));
      const k = 0.72 + 0.32 * fib + 0.14 * fib2;
      for (let j = 0; j < 3; j++) c[j] = rim[j] * k;
      // pinpoint pupil (a dark red pinhole), a slightly hotter ring round it
      const pr = 0.13;
      const pupil = 1 - ss(pr * 0.65, pr, r);
      const hot = (1 - ss(0.0, 0.12, Math.abs(r - pr - 0.07))) * 0.25;
      over(c, lin([255, 176, 60]), hot);
      over(c, lin([30, 3, 2]), pupil);
      const glow = (1 - pupil * 0.93) * (0.62 + 0.38 * fib) * mix(0.95, 0.25, ss(0.55, 1.0, r));
      e[0] = Math.min(1, rim[0] * glow + hot * 0.2); e[1] = Math.min(1, rim[1] * glow + hot * 0.08); e[2] = Math.min(1, rim[2] * glow * 0.6);
    }
    alb.data[i] = toByte(c[0]); alb.data[i + 1] = toByte(c[1]); alb.data[i + 2] = toByte(c[2]); alb.data[i + 3] = 255;
    em.data[i] = toByte(e[0]); em.data[i + 1] = toByte(e[1]); em.data[i + 2] = toByte(e[2]);
  }
  return { albedo: alb, emissive: em };
}

/**
 * The casualsuit06 texture: white T-shirt (top of the atlas, orange MakeHuman logo on the chest) and stone-washed
 * jeans (bottom). The shirt becomes a grubby off-white cotton (logo painted out by an island-aware inpaint of the
 * surrounding fabric shading), the jeans a darker, greyer, dirtier denim. Returns {img, shirtMask Float32 (texel)}.
 */
function recolourSuit(img) {
  const W = img.width, H = img.height, n = W * H;
  const out = { width: W, height: H, data: new Uint8Array(img.data) };
  const isShirt = new Uint8Array(n), logo = new Uint8Array(n);
  const L = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = img.data[i * 4], g = img.data[i * 4 + 1], b = img.data[i * 4 + 2];
    L[i] = (S2L[r] * 0.2126 + S2L[g] * 0.7152 + S2L[b] * 0.0722);
    // the T-shirt pieces fill the top of the atlas, the jeans the bottom (by region, not by colour: the blue-grey
    // print ring and letters on the shirt used to be classed as denim and survived as dark-blue outlines)
    isShirt[i] = Math.floor(i / W) < H * SHIRT_V ? 1 : 0;
  }
  // the logos (front: small 'MAKE HUMAN' + figure; back: big one with a ring): the whole box (feathered) is replaced
  // by the heavily blurred fabric shading around it; the letters / ring themselves (saturated or darker than their
  // neighbourhood) are kept out of that blur so they do not leave a smudge
  const Lloc = blurField(L, W, H, Math.round(W / 80), 2);
  const boxes = [[0.15, 0.08, 0.36, 0.26], [0.4, 0.06, 0.68, 0.3]];
  const lg = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!isShirt[i]) continue;
    const u = (i % W) / W, v = Math.floor(i / W) / H;
    let w = 0;
    for (const [u0, v0, u1, v1] of boxes) w = Math.max(w, ss(0.0, 0.015, Math.min(u - u0, u1 - u, v - v0, v1 - v)));
    if (w <= 0) continue;
    lg[i] = w;
    const r = img.data[i * 4], g = img.data[i * 4 + 1], b = img.data[i * 4 + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx - mn > 10 || L[i] < Lloc[i] * 0.97) logo[i] = 1;
  }
  {
    const grow = blurField(Float32Array.from(logo), W, H, 3, 1);
    for (let i = 0; i < n; i++) logo[i] = grow[i] > 0.02 ? 1 : 0;
  }
  // normalised blur of the clean shirt luminance (inpaint source)
  const wsrc = new Float32Array(n), vsrc = new Float32Array(n);
  for (let i = 0; i < n; i++) { const ok = isShirt[i] && !logo[i] ? 1 : 0; wsrc[i] = ok; vsrc[i] = L[i] * ok; }
  const wb = blurField(wsrc, W, H, Math.round(W / 64), 2), vb = blurField(vsrc, W, H, Math.round(W / 64), 2);
  const c = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const di = i * 4;
    for (let k = 0; k < 3; k++) c[k] = S2L[img.data[di + k]];
    if (isShirt[i]) {
      let l = L[i];
      if (lg[i] > 0 && wb[i] > 0.05) l = mix(l, vb[i] / wb[i], lg[i]);
      // fold shading of the source kept as a ratio around its mean (~0.82), on a cool, light heather-grey white:
      // clearly lighter and bluer than the warm dusky skin, so the shirt still reads as a shirt (and keeps its
      // value) at 15 m in backlight; the filth is local (patches, hem, blood), not a dim base
      const k = Math.max(0.6, Math.min(1.12, l / 0.82));
      for (let j = 0; j < 3; j++) c[j] = C.cotton[j] * k;
    } else {
      const l = lumOf(c);
      const g = [l * 0.86, l * 1.0, l * 1.22];
      // faded mid-blue denim, a touch more saturated than the source's stone-wash so it stays blue at 15 m
      for (let j = 0; j < 3; j++) c[j] = mix(c[j], g[j], 0.32) * C.denimK;
    }
    out.data[di] = toByte(c[0]); out.data[di + 1] = toByte(c[1]); out.data[di + 2] = toByte(c[2]);
  }
  return out;
}

export async function build(lib) {
  const N = lib.makeNoise(211);
  const TR = albedoTracer('runner');
  const opts = lib.merge('gaunt', {
    macro: { gender: 1, age: 0.5, height: 0.5, proportions: 0.7, muscle: 0.5, weight: 0.0, race: { caucasian: 0.8, african: 0.1, asian: 0.1 } },
    modifiers: {
      // starved to sinew: sunken belly and waist, flat narrow chest, no fat anywhere, stringy limbs
      'stomach-pregnant-decr-incr': -0.75, 'measure-waist-circ-decr-incr': -0.7, 'torso-scale-depth-decr-incr': -0.1,
      'torso-vshape-decr-incr': 0.3, 'buttocks-volume-decr-incr': -0.8, 'hip-scale-horiz-decr-incr': -0.25,
      'upperarm-fat-decr-incr': -0.4, 'lowerarm-fat-decr-incr': -0.5, 'upperleg-fat-decr-incr': -0.5, 'lowerleg-fat-decr-incr': -0.8,
      // stick-thin limbs: upper arms and thighs measured down hard (the knees and elbows stay knobby)
      'measure-upperarm-circ-decr-incr': -0.6, 'measure-thigh-circ-decr-incr': -0.6, 'upperarm-scale-horiz-decr-incr': -0.2,
      'upperleg-scale-horiz-decr-incr': -0.15, 'measure-calf-circ-decr-incr': -0.5, 'measure-neck-circ-decr-incr': -0.45,
      'measure-wrist-circ-decr-incr': -0.3, 'measure-ankle-circ-decr-incr': -0.3,
      // long, bony fingers (hooked by poseOffsets)
      'hand-fingers-length-decr-incr': 0.7, 'hand-fingers-diameter-decr-incr': -0.45,
      // skull-like head: hollow cheeks under high cheekbones, sunken temples, hard jaw line, thin nose
      'cheek-volume-decr-incr': -0.2, 'cheek-bones-decr-incr': 0.35, 'head-fat-decr-incr': -0.4, 'forehead-temple-decr-incr': -0.8,
      'chin-bones-decr-incr': 0.45, 'chin-prominent-decr-incr': 0.15, 'nose-volume-decr-incr': -0.25, 'nose-point-width-decr-incr': -0.3,
      'eyebrows-trans-backward-forward': 0.35, 'head-age-decr-incr': 0.25, 'asym-mouth-1-l-r': 0.25,
    },
    // stretched rage grimace: lips pulled back and up off the teeth, lower lip dragged down, jaw open, nose wrinkled
    // in a snarl, brows crushed down, eyes wide, neck cords standing out (platysma kept moderate: stacked on the open
    // jaw it folds the low-poly proxy into a fin at the jaw angle; relaxFolds() cleans up what is left)
    expression: {
      'mouth-open': 0.55, 'mouth-retraction': 0.6, 'mouth-upward-retraction': 0.75, 'mouth-depression': 0.4,
      'nose-left-elevation': 0.45, 'nose-right-elevation': 0.45, 'neck-platysma': 0.4,
      'eyebrows-left-down': 0.65, 'eyebrows-right-down': 0.65, 'eye-left-opened-up': 0.3, 'eye-right-opened-up': 0.3,
    },
  });
  const h = await lib.Human.create(opts);
  const B = h.skeleton.byName;
  const A = lib.anchors(h);
  const eyeY = (A.eyeL[1] + A.eyeR[1]) / 2, eyeZ = (A.eyeL[2] + A.eyeR[2]) / 2;
  const skull = [0, eyeY + 0.015, eyeZ - 0.085];
  // jaw angle under each ear: the open-jaw expression squeezes the skin there and the proxy samples a compressed
  // patch of the texture, so painted creases / veins in it crumpled into a dark polygon "fin" -> kept plain
  const jawZone = (P) => 1 - ss(0.6, 1.25, Math.hypot((Math.abs(P[0]) - 0.05) / 0.032, (P[1] - (A.mouth[1] + 0.008)) / 0.038, (P[2] - (B.head.head.z - 0.03)) / 0.038));
  const neckY = B.neck_01.head.y;
  const SHL = B.upperarm_l.head.toArray(), SHR = B.upperarm_r.head.toArray();
  const armL = limbCoords(h, ['upperarm_l', 'lowerarm_l']), armR = limbCoords(h, ['upperarm_r', 'lowerarm_r']);
  const thighL = boneSeg(B.thigh_l), thighR = boneSeg(B.thigh_r), calfL = boneSeg(B.calf_l), calfR = boneSeg(B.calf_r);
  const kneeL = B.calf_l.head.toArray(), kneeR = B.calf_r.head.toArray();
  const elbowR = B.lowerarm_r.head.toArray(), elbowL = B.lowerarm_l.head.toArray();
  console.log(`${TAG} height ${h.height.toFixed(3)}  neck ${neckY.toFixed(3)}  shoulders ${SHL.map((v) => v.toFixed(3))}  pelvis ${B.pelvis.head.y.toFixed(3)}  spine ${['spine_01', 'spine_02', 'spine_03'].map((b) => B[b].head.y.toFixed(3) + '/' + B[b].head.z.toFixed(3))}  eyeY ${eyeY.toFixed(3)}`);

  // torso cross-section per height (2 cm bins): centre z, front / back z, half width (arms excluded); for the
  // armholes and the rib / spine relief
  const torso = (() => {
    const y0 = 0.8, NB = 45, BS = 0.02;
    const zf = new Float32Array(NB).fill(-9), zb = new Float32Array(NB).fill(9), hw = new Float32Array(NB);
    const fill = (arr, bad) => {
      for (let pass = 0; pass < NB; pass++) for (let b = 0; b < NB; b++) if (bad(arr[b])) {
        const n = b > 0 && !bad(arr[b - 1]) ? arr[b - 1] : b < NB - 1 && !bad(arr[b + 1]) ? arr[b + 1] : null;
        if (n !== null) arr[b] = n;
      }
    };
    for (const v of h.baseObj.groupVerts('body')) {
      const x = h.pos[v * 3], y = h.pos[v * 3 + 1], z = h.pos[v * 3 + 2];
      const b = Math.round((y - y0) / BS);
      if (b < 0 || b >= NB) continue;
      if (Math.abs(x) < 0.03) { zf[b] = Math.max(zf[b], z); zb[b] = Math.min(zb[b], z); }
    }
    fill(zf, (q) => q < -1); fill(zb, (q) => q > 1);
    for (const v of h.baseObj.groupVerts('body')) {
      const x = h.pos[v * 3], y = h.pos[v * 3 + 1], z = h.pos[v * 3 + 2];
      const b = Math.round((y - y0) / BS);
      if (b < 0 || b >= NB) continue;
      const cz = (zf[b] + zb[b]) / 2;
      // the arms hang free of the torso in the A pose: only count vertices close to the torso's own outline
      if (Math.abs(z - cz) > 0.035 || Math.abs(x) > 0.19) continue;
      const pv = [x, y, z], al = armL(pv), ar = armR(pv);
      if ((al.r < 0.075 && al.s > -0.05) || (ar.r < 0.075 && ar.s > -0.05)) continue;
      hw[b] = Math.max(hw[b], Math.abs(x));
    }
    fill(hw, (q) => q <= 0);
    const at = (arr, y) => { const f = Math.max(0, Math.min(NB - 1.001, (y - y0) / BS)); const i = Math.floor(f); return mix(arr[i], arr[i + 1], f - i); };
    return { cz: (y) => (at(zf, y) + at(zb, y)) / 2, dz: (y) => Math.max(0.05, (at(zf, y) - at(zb, y)) / 2), hw: (y) => Math.max(0.06, at(hw, y)), zf: (y) => at(zf, y) };
  })();
  const yChest = B.spine_03.head.y;
  console.log(`${TAG} torso @chest: cz ${torso.cz(yChest).toFixed(3)} dz ${torso.dz(yChest).toFixed(3)} hw ${torso.hw(yChest).toFixed(3)}; @waist(${B.spine_01.head.y.toFixed(2)}): hw ${torso.hw(B.spine_01.head.y).toFixed(3)} dz ${torso.dz(B.spine_01.head.y).toFixed(3)}`);

  // ---- geometry (bound to the morphed base mesh)
  // the shaved low-poly proxy skull is faceted: subdivide the cranium, project onto the base mesh (+~400 tris)
  const headZone = (p, m = 0) => p[1] > eyeY + 0.025 - m && dist(p, skull) < 0.16 + m && !(Math.abs(p[0]) > 0.066 && p[1] < eyeY + 0.06);
  const body = refineSurface(lib, h, await h.proxyBody('male1591'), headZone);
  {
    // the open jaw crumples the proxy at the jaw angle / under the ear lobes: relax that patch (the ear stays)
    const jy = A.mouth[1] - 0.01, jz = B.head.head.z - 0.005;
    const crease = relaxFolds(body, (P) => {
      if (Math.abs(P[0]) > 0.068 && P[1] > eyeY - 0.05) return 0;
      const q = Math.hypot((Math.abs(P[0]) - 0.06) / 0.032, (P[1] - jy) / 0.05, (P[2] - jz) / 0.05);
      return 1 - ss(0.55, 1.0, q);
    }, { iters: 8 });
    console.log(`${TAG} jaw-angle relax: worst crease ${crease.map((d) => d.toFixed(0) + ' deg').join(' -> ')}`);
  }
  const suit = await h.fit('clothes/male_casualsuit06', { name: 'clothes', role: 'cloth' });
  const eyes = await h.fit('eyes/low-poly', { name: 'eyes', role: 'eye', hide: false });
  const teeth = await h.fit('teeth/teeth_base', { name: 'teeth', role: 'teeth', hide: false });
  const browGuide = browField(await h.fit('eyebrows/eyebrow009', { name: 'eyebrows', role: 'hair', hide: false }));
  // a decapitation must not carry the collar away
  for (let v = 0; v < suit.nVerts; v++) if (suit.seg[v] === 1) suit.seg[v] = 0;

  // garment of each suit face: T-shirt (top of the atlas) or jeans (bottom), by the texture under the face's UVs
  const suitDiff = await lib.texture(suit.asset.textures.diffuse, 2048);
  const SD = suitDiff.width;
  const denimAt = (u, vImg) => {
    const i = (Math.min(SD - 1, Math.floor(vImg * SD)) * SD + Math.min(SD - 1, Math.floor(u * SD))) * 4;
    return suitDiff.data[i + 2] > suitDiff.data[i] + 12;
  };
  const uvs = suit.obj.uvs;
  const faceDenim = suit.obj.faces.map((f) => {
    let u = 0, v = 0;
    f.t.forEach((t) => { u += uvs[t * 2] / f.t.length; v += uvs[t * 2 + 1] / f.t.length; });
    return (1 - v) > 0.44 || denimAt(u, 1 - v) ? 1 : 0;
  });
  // islands: majority vote so a whole island is one garment (the white stitching on the jeans is not "shirt")
  {
    const isl = uvIslands(suit), votes = new Map();
    isl.forEach((id, fi) => { const v = votes.get(id) || [0, 0]; v[faceDenim[fi]]++; votes.set(id, v); });
    isl.forEach((id, fi) => { const v = votes.get(id); faceDenim[fi] = v[1] > v[0] ? 1 : 0; });
  }
  // jeans waistband: highest denim vertex per 2 cm x-bin on the front
  const jeansTopAt = (() => {
    const NB = 31, top = new Float32Array(NB).fill(-1);
    suit.obj.faces.forEach((f, fi) => {
      if (!faceDenim[fi]) return;
      for (const v of f.v) {
        const px = suit.pos[v * 3], py = suit.pos[v * 3 + 1], pz = suit.pos[v * 3 + 2];
        if (Math.abs(px) > 0.3 || py < 0.7) continue;
        const b = Math.round((px + 0.3) / 0.02);
        top[b] = Math.max(top[b], py);
      }
    });
    for (let pass = 0; pass < NB; pass++) for (let b = 0; b < NB; b++) if (top[b] < 0) top[b] = Math.max(b > 0 ? top[b - 1] : -1, b < NB - 1 ? top[b + 1] : -1);
    return (x) => { const f = Math.min(NB - 1.001, Math.max(0, (x + 0.3) / 0.02)); const i = Math.floor(f); return mix(top[i], top[i + 1], f - i); };
  })();
  const jeansTop = jeansTopAt(0);
  let shirtLow = 9;
  suit.obj.faces.forEach((f, fi) => { if (!faceDenim[fi]) for (const v of f.v) shirtLow = Math.min(shirtLow, suit.pos[v * 3 + 1]); });
  console.log(`${TAG} suit faces: shirt ${faceDenim.filter((d) => !d).length}, jeans ${faceDenim.filter((d) => d).length}; jeans top ${jeansTop.toFixed(3)}, shirt hem ${shirtLow.toFixed(3)}`);

  // ---- cut fields (metres, > 0 = fabric removed, the frayed fringe is the band just below 0), one per garment
  const claws = (() => {
    // three parallel slashes across the front: from the right pectoral down to the left of the belly
    const d = norm([0.6, -0.8, 0]), nrm = [-d[1], d[0], 0];
    const c0 = [-0.02, SHL[1] - 0.175];
    return [-1, 0, 1].map((k, i) => ({ c: [c0[0] + nrm[0] * k * 0.04 + d[0] * (i - 1) * 0.012, c0[1] + nrm[1] * k * 0.04 + d[1] * (i - 1) * 0.012], d, nrm, half: 0.12 + 0.025 * (1 - Math.abs(k)), w: 0.022 - 0.004 * Math.abs(k) }));
  })();
  const clawSD = (P, widen = 0, wScale = 1) => {
    // signed distance (< 0 inside) to the nearest lens-shaped slash on the front of the torso
    if (P[2] < torso.cz(P[1]) || P[1] < jeansTop - 0.05) return 1;
    let best = 1;
    for (const s of claws) {
      const dx = P[0] - s.c[0], dy = P[1] - s.c[1];
      const al = dx * s.d[0] + dy * s.d[1], ac = dx * s.nrm[0] + dy * s.nrm[1];
      const t = Math.min(1, Math.abs(al) / s.half);
      const hw = s.w * wScale * Math.sqrt(Math.max(0, 1 - t * t)) + widen;
      best = Math.min(best, Math.max(Math.abs(ac) - hw, Math.abs(al) - s.half - widen));
    }
    return best;
  };
  const backHole = [0.075, SHL[1] - 0.13];
  const shirtCut = (P) => {
    const rag = N.fbm(P[0] * 13, P[1] * 13, P[2] * 13, 3) * 0.013 + N.noise(P[0] * 70, P[1] * 70, P[2] * 70) * 0.003;
    let f = -1;
    // sleeves ripped off at the seam, deep ragged armholes down the sides of the rib cage (A-shirt)
    for (const [S, sg] of [[SHL, 1], [SHR, -1]]) {
      const sx = P[0] * sg, s0 = S[0] * sg;
      // armhole edge |x| vs height: the strap's outer edge over the shoulder, curving in round the armpit and down
      // the side of the rib cage (~13 cm below the shoulder joint), closing at the side seam
      const dy = S[1] - P[1];
      const hwy = torso.hw(P[1]);
      const edge = dy < -0.01 ? s0 - 0.07 : dy < 0.06 ? mix(s0 - 0.07, s0 - 0.085, ss(-0.01, 0.06, dy))
        : dy < 0.13 ? mix(s0 - 0.085, hwy - 0.035, ss(0.06, 0.13, dy)) : mix(hwy - 0.035, hwy + 0.03, ss(0.13, 0.2, dy));
      f = Math.max(f, sx - edge);
      f = Math.max(f, sx - s0 + 0.006);
    }
    // scooped neckline (deep at the front, shallow at the back)
    {
      const ax = Math.abs(P[0]) / 0.094;
      const front = ss(-0.03, 0.03, P[2] - torso.cz(Math.min(P[1], neckY)));
      const bottom = mix(neckY - 0.05, neckY - 0.115, front);
      f = Math.max(f, P[1] - (bottom + (neckY + 0.005 - bottom) * ax * ax));
    }
    // torn hem: ragged, ridden up high over the sunken belly on the front left, hanging lower at the back
    {
      const front = ss(-0.02, 0.05, P[2] - torso.cz(P[1]));
      const hem = jeansTopAt(P[0]) - 0.035 + front * (0.035 + 0.08 * ss(-0.1, 0.12, P[0])) + N.fbm(P[0] * 9 + 4, 1.3, P[2] * 9, 3) * 0.025;
      f = Math.max(f, hem - P[1]);
    }
    // three claw rips across the chest
    f = Math.max(f, -clawSD(P) - 0.002);
    // a hole torn over the left shoulder blade (the scapula and spine show)
    if (P[2] < torso.cz(P[1])) {
      const q = Math.hypot((P[0] - backHole[0]) / 0.06, (P[1] - backHole[1]) / 0.085) + N.fbm(P[0] * 8, P[1] * 8, P[2] * 8, 2) * 0.35;
      f = Math.max(f, (1 - q) * 0.06);
    }
    // shredding: smaller rips and holes everywhere, more towards the hem and the sides
    const n = N.fbm(P[0] * 7, P[1] * 3.5, P[2] * 7, 4) * 0.5 + 0.5;
    const more = 0.08 * ss(jeansTop + 0.2, jeansTop + 0.02, P[1]) + 0.05 * ss(0.08, 0.14, Math.abs(P[0]));
    f = Math.max(f, (n + more - 0.745) * 0.3);
    return f + rag;
  };
  const shortsCut = (P) => {
    const rag = N.fbm(P[0] * 15 + 7, P[1] * 15, P[2] * 15, 3) * 0.016 + N.noise(P[0] * 80, P[1] * 80, P[2] * 80) * 0.003;
    let f = -1;
    // legs torn off mid-thigh: left leg shorter, the back hangs a little lower than the front
    for (const [seg, tCut, calf] of [[thighL, 0.4, calfL], [thighR, 0.52, calfR]]) {
      const r = seg(P);
      // everything below the knee goes (closer to the shin bone than to the thigh bone)
      const k = calf(P);
      if (k.d < 0.16 && k.d < r.d && k.t > 0) { f = Math.max(f, 0.2); continue; }
      if (r.d > 0.16) continue;
      const back = P[2] < r.a[2] ? 0.05 : 0;
      f = Math.max(f, (r.t - tCut - back) * r.L);
    }
    // worn-through holes on the right thigh front and the left seat, a few small ones (steep fields: narrow fray)
    f = Math.max(f, (1 - dist(P, [-0.1, B.pelvis.head.y - 0.13, 0.08]) / 0.03) * 0.06);
    f = Math.max(f, (1 - dist(P, [0.09, B.pelvis.head.y - 0.06, -0.1]) / 0.035) * 0.06);
    const n = N.fbm(P[0] * 9 + 3, P[1] * 9, P[2] * 9, 3) * 0.5 + 0.5;
    f = Math.max(f, (n - 0.8) * 0.3);
    return f + rag;
  };

  // ---- mouth cavity (the jaw is open)
  const cavityGeo = mouthCavity(h, body, A);

  // ---- clothes paint (recoloured base, grime, sweat, blood); the cuts come after
  let suitBase = recolourSuit(suitDiff);
  let suitAoSrc = await lib.texture(suit.asset.textures.ao, 1024);
  let suitNrmSrc = await lib.texture(suit.asset.textures.normal, 1024);
  TR.snap('suit: source', suitDiff, suit);
  TR.snap('suit: recoloured', suitBase, suit);
  // faces lying deep inside a cut go before painting (the jeans' lower legs, the sleeves, the big rips), then the
  // UV islands of what is left are repacked to fill the atlas (about half of it used to be cut-away fabric)
  let preCut = 0;
  suit.obj.faces.forEach((f, fi) => {
    if (!suit.keep[fi]) return;
    const pts = f.v.map((v) => [suit.pos[v * 3], suit.pos[v * 3 + 1], suit.pos[v * 3 + 2]]);
    const cen = [0, 1, 2].map((k) => pts.reduce((a, p) => a + p[k], 0) / pts.length);
    const fn = faceDenim[fi] ? shortsCut : shirtCut;
    if ([...pts, cen].every((p) => fn(p) > 0.012)) { suit.keep[fi] = 0; preCut++; }
  });
  const pack = repackUV(suit);
  for (const b of pack.boxes) b.denim = faceDenim[b.faces[0]];
  suitBase = pack.remap(suitBase);
  suitAoSrc = pack.remap(suitAoSrc, [255, 255, 255, 255]);
  suitNrmSrc = pack.remap(suitNrmSrc, [128, 128, 255, 255]);
  console.log(`${TAG} cloth: ${preCut} faces inside cuts deleted, ${pack.boxes.length} islands repacked at x${pack.s.toFixed(2)} texel density`);
  TR.snap('suit: repacked', suitBase, suit);
  const shirtAtUV = (u, v) => { const b = pack.islandAt(u, v); return b ? !b.denim : false; };
  const mouthRun = (P) => {
    // fresh blood that poured off the chin down the front of the neck onto the chest (wicked into the cotton)
    const dx = P[0] - A.mouth[0] - 0.008, dy = A.mouth[1] - P[1];
    if (dy < 0.08 || dy > 0.62 || P[2] < torso.cz(Math.max(0.9, P[1]))) return 0;
    const w = 0.045 * (1 - ss(0.1, 0.55, dy)) + 0.018 + N.fbm(P[1] * 7, 1.3, 2.2, 2) * 0.012;
    const cx = N.fbm(dy * 6, 3.3, 0.7, 2) * 0.03;
    const core = 1 - ss(w * 0.6, w, Math.abs(dx - cx) + N.fbm(P[0] * 30, P[1] * 30, P[2] * 30, 2) * 0.008);
    const runs = ss(0.38, 0.62, N.noise(P[0] * 80, P[1] * 3.5, 2.7)) * (1 - ss(w * 0.3, w * 2.4, Math.abs(dx - cx))) * (1 - ss(0.35, 0.62, dy));
    return Math.max(core * (1 - ss(0.3, 0.55, dy)), runs);
  };
  const cloth = lib.paintCloth(suit, {
    seed: 61, human: h, base: suitBase,
    normal: suitNrmSrc,
    // the garment's own AO keeps its fold detail at 30 %: at full strength it blacks out the jeans waistband and the
    // shirt hem (tucked in on the original outfit, bare on the cut-offs); the real occlusion is the ray bake below
    ao: (() => {
      const img = lib.cloneImage(suitAoSrc);
      for (let i = 0; i < img.data.length; i += 4) for (let k = 0; k < 3; k++) img.data[i + k] = Math.round(255 * 0.7 + img.data[i + k] * 0.3);
      return img;
    })(),
    size: 2048, normalSize: 1024, ormSize: 1024,
    // light global wear only: the filth on the shirt is local (patches, sweat rings, hem, blood) so the cotton keeps
    // its value; the denim gets its own dirt below
    fade: 0.15, grime: 0.3, grimeNoise: 0.5, weave: 0.6, yellow: 0, innerDarken: 0,
    blood: { edges: 0 },
    extra: (P, Nn, c, u, v) => {
      const shirt = shirtAtUV(u, v);
      const front = ss(-0.3, 0.3, Nn[2]);
      if (shirt) {
        // local filth: sweat rings under the arms and round the neck, grey-brown grime patches, a dirtier hem
        let sweat = 0;
        for (const S of [SHL, SHR]) sweat = Math.max(sweat, 1 - ss(0.04, 0.11, dist(P, [S[0] * 0.8, S[1] - 0.1, S[2] - 0.01])));
        sweat = Math.max(sweat, (1 - ss(0.0, 0.05, Math.abs(P[1] - (neckY - 0.06)))) * (Math.abs(P[0]) < 0.12 ? 0.6 : 0));
        mul(c, [0.9, 0.85, 0.72], sweat * ss(-0.3, 0.3, N.fbm(P[0] * 18, P[1] * 18, P[2] * 18, 2)) * 0.7);
        over(c, lin([116, 108, 96]), ss(0.15, 0.55, N.fbm(P[0] * 6 + 2, P[1] * 6, P[2] * 6, 3)) * 0.5);
        // smudges and dust rubbed into the weave (finer, so the cotton does not read as clean paper close up)
        over(c, lin([126, 120, 110]), ss(0.05, 0.6, N.fbm(P[0] * 22 + 5, P[1] * 16, P[2] * 22, 3)) * 0.3);
        mul(c, [0.88, 0.86, 0.84], ss(0.2, 0.7, N.ridged(P[0] * 9, P[1] * 14, P[2] * 9, 3)) * 0.35);
        mul(c, [0.8, 0.76, 0.7], (1 - ss(jeansTop + 0.02, jeansTop + 0.14, P[1])) * 0.4);
        // fine dust worked into the knit (high frequency, along the wales) and dirty drip streaks: the cotton keeps
        // its value at range but stops reading as clean paper close up
        mul(c, [0.9, 0.89, 0.87], ss(0.0, 0.6, N.noise(P[0] * 260, P[1] * 90, P[2] * 260) * 0.5 + 0.2) * 0.6);
        // sharper-edged soil stains (~20 % of the cotton); the clean cotton between them stays light
        const soil = ss(0.28, 0.36, N.fbm(P[0] * 11 + 8, P[1] * 9, P[2] * 11, 4) + N.noise(P[0] * 60, P[1] * 60, P[2] * 60) * 0.04);
        over(c, lin([108, 100, 88]), soil * 0.42);
        over(c, lin([112, 104, 92]), ss(0.55, 0.8, N.noise(P[0] * 70, P[1] * 4, P[2] * 70)) * ss(0.0, 0.4, N.fbm(P[0] * 5 + 1, P[1] * 3, P[2] * 5, 2) + 0.1) * 0.35);
        // blood: soaked down the front from the mouth (fresh, dark), smeared hand wipes on the flanks, spatter
        const run = mouthRun(P);
        if (run > 0) {
          const deep = ss(-0.3, 0.5, N.fbm(P[0] * 16, P[1] * 12, P[2] * 16, 3));
          over(c, mix3(lin([64, 16, 13]), lin([32, 10, 8]), deep), run * 0.9 * front * ss(-0.45, 0.15, N.fbm(P[0] * 11 + 4, P[1] * 7, P[2] * 11, 3)));
        }
        for (const sx of [1, -1]) {
          // a bloody hand dragged down and back along each flank: four finger streaks with a dry-brush break-up,
          // heavy where the hand landed, thinning out along the stroke (a soft horizontal band read as a blurry bar)
          const cy = jeansTop + 0.13 + sx * 0.03, zc = torso.cz(P[1]);
          const a = (P[2] - zc) * 0.55 + (P[1] - cy), along = (P[2] - zc) - (P[1] - cy) * 0.55;
          const band = (1 - ss(0.026, 0.04, Math.abs(a))) * (1 - ss(0.05, 0.085, Math.abs(along + 0.01))) * ss(0.075, 0.105, P[0] * sx);
          if (band > 0) {
            const fing = ss(-0.45, 0.35, Math.cos((a / 0.0165) * Math.PI * 2 + sx));
            const dry = ss(-0.35, 0.35, N.fbm(P[0] * 30 + sx, P[1] * 70, P[2] * 30, 2)) * mix(1, 0.45, ss(-0.06, 0.07, -along));
            over(c, mix3(lin([78, 22, 16]), lin([54, 17, 13]), ss(-0.3, 0.4, N.noise(P[0] * 90, P[1] * 90, P[2] * 90))), band * fing * dry * 0.85);
          }
        }
        // spatter: a few irregular red-brown drops in clusters (round black dots read as holes / polka dots)
        const sp = (1 - ss(0.05, 0.11, N.worley(P[0] * 30 + 3, P[1] * 30, P[2] * 30) + N.noise(P[0] * 160, P[1] * 160, P[2] * 160) * 0.035)) * ss(0.25, 0.55, N.fbm(P[0] * 3 + 9, P[1] * 3, P[2] * 3, 2) + 0.1);
        over(c, mix3(lin([96, 28, 20]), lin([60, 20, 14]), ss(-0.3, 0.4, N.noise(P[0] * 50, P[1] * 50, P[2] * 50))), sp * 0.75);
        // blood wicked into the cotton along the claw rips: a thin, broken red-brown rim on the torn edge (the gash
        // shows through the opening; a wide painted band made the rips read as stripes printed on the shirt)
        const cl = clawSD(P, 0.0);
        if (cl < 0.05) {
          const k = (1 - ss(0.0, 0.004 + N.fbm(P[0] * 30, P[1] * 30, P[2] * 30, 2) * 0.004, cl)) * front * ss(-0.4, 0.2, N.fbm(P[0] * 60, P[1] * 60, P[2] * 60, 2));
          over(c, mix3(lin([84, 22, 16]), lin([46, 14, 10]), ss(0.0, 0.006, cl)), k * 0.75);
          // a few drips running down from the rips
          const dr = ss(0.62, 0.74, N.noise(P[0] * 110, P[1] * 4, 1.7)) * (1 - ss(0.0, 0.1, cl)) * (P[1] < claws[1].c[1] + 0.05 ? 1 : 0);
          over(c, lin([72, 16, 12]), dr * 0.7 * front);
        }
      } else {
        // denim: blood drips down the thighs, muddy seat and hems, dirt rubbed in at the front
        const sp = (1 - ss(0.07, 0.13, N.worley(P[0] * 40, P[1] * 22, P[2] * 40))) * ss(0.0, 0.5, N.fbm(P[0] * 4 + 2, P[1] * 4, P[2] * 4, 2) + 0.1);
        over(c, lin([48, 16, 14]), sp * 0.75 * front);
        const smear = ss(0.34, 0.47, N.fbm(P[0] * 6 - 4, P[1] * 3, P[2] * 6, 4));
        over(c, lin([62, 24, 20]), smear * 0.45);
        over(c, C.mud.map((x) => x * 1.3), (1 - ss(-0.1, 0.25, Nn[2])) * ss(-0.2, 0.5, N.fbm(P[0] * 12, P[1] * 12, P[2] * 12, 3)) * 0.4);
        over(c, C.grime, ss(0.1, 0.6, N.fbm(P[0] * 9 + 6, P[1] * 9, P[2] * 9, 3)) * 0.25);
      }
    },
  });

  TR.snap('suit: paintCloth', cloth.albedo, suit);
  // ---- cut the garments (alpha) with the per-garment fields: a frayed fringe on the denim, a ragged rolled edge on
  // the cotton, a darkened grimy rim; faces lying deep inside a cut are deleted
  {
    const img = cloth.albedo, W = img.width;
    const tris = suit.tris(), faceOf = suit._faceOf, nrm = suit.normals();
    const r = rasterUV(tris, suit.obj.uvs, W, 6);
    const P = [0, 0, 0], Nn = [0, 0, 0], c = [0, 0, 0];
    let cutTexels = 0;
    for (let i = 0; i < W * W; i++) {
      const t = r.tri[i];
      if (t < 0) continue;
      texelSurface(r, tris, suit.pos, nrm, i, P, Nn);
      const denim = faceDenim[faceOf[t]];
      const f = denim ? shortsCut(P) : shirtCut(P);
      if (f < -0.05) continue;
      const x = i % W, y = (i / W) | 0;
      // denim frays into a fringe of pale threads (along the UV axes = warp / weft); the cotton jersey of the shirt
      // tears with a ragged, slightly rolled edge and a few loose strands
      const fw = denim ? 0.011 : 0.004;
      let cut = f > 0;
      if (!cut && f > -fw) {
        const k = -f / fw;
        if (denim) {
          const tu = Math.abs(N.noise(x / 5, y * 6 / W, 1.3)), tv = Math.abs(N.noise(x * 6 / W, y / 5, 2.1));
          cut = Math.min(tu, tv) > 0.06 + 0.9 * k * k * k;
        } else {
          cut = Math.abs(N.noise(P[0] * 900, P[1] * 300, P[2] * 900)) > 0.12 + 0.8 * k * k;
        }
      }
      const di = i * 4;
      if (cut) { img.data[di + 3] = 0; cutTexels++; continue; }
      for (let k = 0; k < 3; k++) c[k] = S2L[img.data[di + k]];
      if (denim) {
        // pale weft threads at the fray, a little grime worked into the torn edge
        const e = 1 - ss(0.0, 0.02, -f);
        over(c, lin([150, 146, 134]), (1 - ss(0, fw, -f)) * 0.45);
        kmul(c, 1 - e * 0.18);
        over(c, lin([70, 60, 50]), e * 0.25 * ss(-0.2, 0.4, N.fbm(P[0] * 25, P[1] * 25, P[2] * 25, 2)));
      } else {
        // torn jersey: the rolled edge shows pale, frayed fibres (no ink outline round the holes), a hairline of
        // grime right at the edge and a faint grey band behind it
        const edge = 1 - ss(0.0, 0.0035, -f), band = 1 - ss(0.0, 0.01, -f);
        over(c, C.fray, (1 - ss(0.0, fw * 1.6, -f)) * 0.55 * ss(-0.5, 0.3, N.noise(P[0] * 500, P[1] * 180, P[2] * 500)));
        kmul(c, 1 - band * 0.1);
        over(c, lin([92, 84, 74]), edge * 0.3 * ss(-0.2, 0.4, N.fbm(P[0] * 25, P[1] * 25, P[2] * 25, 2)));
      }
      img.data[di] = toByte(c[0]); img.data[di + 1] = toByte(c[1]); img.data[di + 2] = toByte(c[2]);
    }
    // delete the faces nothing is left of: no opaque texel inside them (exact raster, no gutter) and every corner +
    // the centroid inside a cut (tiny faces that cover no texel centre are kept unless their samples are all cut)
    const r0 = rasterUV(tris, suit.obj.uvs, W, 0);
    const opaque = new Uint8Array(suit.obj.faces.length);
    for (let i = 0; i < W * W; i++) { const t = r0.tri[i]; if (t >= 0 && img.data[i * 4 + 3] >= 128) opaque[faceOf[t]] = 1; }
    let removed = 0;
    suit.obj.faces.forEach((f, fi) => {
      if (!suit.keep[fi] || opaque[fi]) return;
      const pts = f.v.map((v) => [suit.pos[v * 3], suit.pos[v * 3 + 1], suit.pos[v * 3 + 2]]);
      const cen = [0, 1, 2].map((k) => pts.reduce((a, p) => a + p[k], 0) / pts.length);
      const fn = faceDenim[fi] ? shortsCut : shirtCut;
      if ([...pts, cen].every((p) => fn(p) > -0.002)) { suit.keep[fi] = 0; removed++; }
    });
    // texels with no fabric take the colour of the nearest fabric texel (mip filtering then has nothing dark to pull
    // into the cut edges) and are pre-quantised here, so the PNG goes out at 8 bits without the writer's quantiser
    // (which zeroes the RGB of every transparent texel)
    {
      const keepM = new Uint8Array(W * W);
      for (let i = 0; i < W * W; i++) keepM[i] = r0.tri[i] >= 0 && img.data[i * 4 + 3] >= 128 ? 1 : 0;
      const reach = dilate(img, keepM, 10);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        // beyond the dilated band: one flat colour (compresses to nothing; nothing samples it)
        if (!reach[i >> 2]) { d[i] = 120; d[i + 1] = 124; d[i + 2] = 128; }
        for (let k = 0; k < 3; k++) d[i + k] = Math.min(252, Math.round(d[i + k] / 4) * 4);
        d[i + 3] = d[i + 3] >= 128 ? 255 : 0;
      }
    }
    // albedo per garment (sRGB mean of R, G, B over the opaque fabric texels; targets: shirt 140-155, denim 80-90)
    const acc = [[0, 0, 0, 0], [0, 0, 0, 0]];
    for (let i = 0; i < W * W; i++) {
      const t = r0.tri[i];
      if (t < 0 || img.data[i * 4 + 3] < 128) continue;
      const a = acc[faceDenim[faceOf[t]]];
      a[0] += img.data[i * 4]; a[1] += img.data[i * 4 + 1]; a[2] += img.data[i * 4 + 2]; a[3]++;
    }
    const fmt = ([r, g, b, n]) => `${((r + g + b) / 3 / n).toFixed(1)} (rgb ${[r, g, b].map((x) => Math.round(x / n)).join('/')}, ${(n / (W * W) * 100).toFixed(0)} % of the atlas)`;
    console.log(`${TAG} cloth albedo: shirt ${fmt(acc[0])}, denim ${fmt(acc[1])}`);
    console.log(`${TAG} cloth: ${cutTexels} texels cut, ${removed} transparent faces deleted, ${suit.triCount()} tris left`);
  }

  TR.snap('suit: + cut rims', cloth.albedo, suit);
  // ---- what the cut garments still cover, by ray casting from the skin (the normal + 4 rays tilted ~35 deg; a ray
  // is stopped by the first layer whose fabric is intact at the hit point, it passes through cuts and the frayed
  // fringe). Base vertices under fabric get the contact-shadow / scrape treatment in the skin paint; proxy body faces
  // whose corners are all fully covered are deleted later (no skin poking through, no see-through holes).
  const coverage = (() => {
    const s = { tris: suit.tris(), pos: suit.pos };
    const faceOf = suit._faceOf.slice();
    const bvh = occluders([s]);
    const idx = bvh.geometry.index;
    const ray = new THREE.Ray();
    return (P, Nn) => {
      const ax = Math.abs(Nn[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      const t = norm(cross(ax, Nn)), b = cross(Nn, t);
      const dirs = [Nn, ...[t, scl(t, -1), b, scl(b, -1)].map((d) => norm(add(Nn, scl(d, 0.7))))];
      let blocked = 0;
      for (const d of dirs) {
        ray.origin.set(P[0] + Nn[0] * 0.001, P[1] + Nn[1] * 0.001, P[2] + Nn[2] * 0.001);
        ray.direction.set(d[0], d[1], d[2]);
        let travelled = 0;
        for (let k = 0; k < 3; k++) {
          const hit = bvh.raycastFirst(ray, THREE.DoubleSide, 0, 0.09 - travelled);
          if (!hit) break;
          const tri = Math.floor((idx ? idx.getX(hit.faceIndex * 3) : hit.faceIndex * 3) / 3);
          const p = [hit.point.x, hit.point.y, hit.point.z];
          if ((faceDenim[faceOf[tri]] ? shortsCut(p) : shirtCut(p)) <= -0.006) { blocked++; break; }
          travelled += hit.distance + 0.002;
          ray.origin.copy(hit.point).addScaledVector(ray.direction, 0.002);
        }
      }
      return blocked / dirs.length;
    };
  })();
  {
    const nb = h.basePart({ name: 'cover' }).normals();
    const before = new Set(h.hidden);
    h.hidden.clear();
    const hist = new Array(6).fill(0);
    for (const v of h.baseObj.groupVerts('body')) {
      const P = [h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]];
      const cv = coverage(P, [nb[v * 3], nb[v * 3 + 1], nb[v * 3 + 2]]);
      if (before.has(v)) hist[Math.round(cv * 5)]++;
      if (cv >= 0.6) h.hidden.add(v);
    }
    console.log(`${TAG} skin under fabric: ${before.size} base vertices by delete_verts -> ${h.hidden.size} by ray casting (coverage of the former: ${hist.join('/')})`);
  }

  // ---- skin
  const S = texSize(2048);
  const base = await skinBase(lib, h, S, { eyeY, eyeZ, skull, N, jawZone });
  TR.snap('skin: composite base', base, body);
  const tips = [];
  for (const s of ['l', 'r']) for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky']) if (B[`${f}_03_${s}`]) tips.push(B[`${f}_03_${s}`].tail.toArray());
  const knuckles = [];
  for (const s of ['l', 'r']) for (const f of ['index', 'middle', 'ring', 'pinky']) if (B[`${f}_01_${s}`]) knuckles.push(B[`${f}_01_${s}`].head.toArray());
  const handC = [B.hand_l.head.toArray(), B.hand_r.head.toArray()];
  const toes = toeTips(h);
  const forearmBite = lib.surfacePoint(h, 'lowerarm_l', 0.45, [0.3, -0.2, 1]).p;
  const scalpTear = lib.surfacePoint(h, 'head', 0.6, [-0.85, 0.5, 0.1]);
  // local frame of the scalp wound: n out of the skull, t front-back along the scalp, b across it
  const tearN = norm(sub(scalpTear.p, skull));
  const tearT = norm(sub([0, 0, 1], scl(tearN, tearN[2]))), tearB = cross(tearN, tearT);
  const clavs = ['l', 'r'].map((s) => [B[`clavicle_${s}`].head.toArray(), B[`clavicle_${s}`].tail.toArray()]);
  // ear centres: the most lateral head vertices around eye height
  const ears = [1, -1].map((sg) => {
    let best = null;
    for (const v of h.baseObj.groupVerts('body')) {
      const x = h.pos[v * 3] * sg, y = h.pos[v * 3 + 1];
      if (y < eyeY - 0.045 || y > eyeY + 0.02 || dist([h.pos[v * 3], y, h.pos[v * 3 + 2]], skull) > 0.16) continue;
      if (!best || x > best[0] * sg) best = [h.pos[v * 3], y, h.pos[v * 3 + 2]];
    }
    return best ? [best[0] - sg * 0.008, best[1], best[2]] : [sg * 0.07, eyeY - 0.01, skull[2]];
  });
  // the ears themselves: base vertices near the ear centres where a ray cast inwards (against the normal) leaves the
  // mesh again within 2 cm (the thin pinna; the scalp behind it is the whole head thick). The buzz cut stops ~1 cm
  // short of these points; a sphere round the ear centre (the old test) shaved a big pale halo behind each ear.
  const earPts = [];
  {
    const ep = h.basePart({ name: 'ears' }), et = ep.tris(), en = ep.normals();
    const bvh = occluders([{ pos: h.pos, tris: et }]);
    const ray = new THREE.Ray();
    for (const v of h.baseObj.groupVerts('body')) {
      const p = [h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]];
      if (Math.min(dist(p, ears[0]), dist(p, ears[1])) > 0.05) continue;
      const n = [en[v * 3], en[v * 3 + 1], en[v * 3 + 2]];
      ray.origin.set(p[0] - n[0] * 0.0008, p[1] - n[1] * 0.0008, p[2] - n[2] * 0.0008);
      ray.direction.set(-n[0], -n[1], -n[2]);
      const hit = bvh.raycastFirst(ray, THREE.DoubleSide, 0.0003, 0.05);
      if (hit && hit.distance < 0.02) earPts.push(p);
    }
    console.log(`${TAG} ear vertices (thin pinna): ${earPts.length}`);
  }
  /** 0 on / right next to an ear, 1 from ~1.3 cm away (hair-free margin round the ear). */
  const earFreeAt = (P) => {
    if (!earPts.length) return ss(0.026, 0.032, Math.min(dist(P, ears[0]), dist(P, ears[1])));
    if (Math.min(dist(P, ears[0]), dist(P, ears[1])) > 0.07) return 1;
    let m = 1;
    for (const q of earPts) { const d = (P[0] - q[0]) ** 2 + (P[1] - q[1]) ** 2 + (P[2] - q[2]) ** 2; if (d < m) m = d; }
    return ss(0.006, 0.013, Math.sqrt(m));
  };
  // hairline height above the eyes vs |azimuth| (0 = front, pi = back of the head)
  const HL = [[0, 0.07], [0.35, 0.068], [0.55, 0.076], [0.85, 0.05], [1.35, 0.03], [1.75, 0.012], [2.2, -0.03], [2.7, -0.07], [Math.PI, -0.085]];
  const hairlineAt = (az) => {
    for (let k = 0; k + 1 < HL.length; k++) if (az <= HL[k + 1][0]) return mix(HL[k][1], HL[k + 1][1], (az - HL[k][0]) / (HL[k + 1][0] - HL[k][0]));
    return HL[HL.length - 1][1];
  };
  const mouthY = A.mouth[1];
  // vein network: warped ridged noise stretched along the local body axis (the veins run along the arms / legs and
  // up the neck, branching), blended between a vertical frame and each arm's frame; a finer isotropic capillary web
  const frame = (ax) => { const u = norm(cross(ax, Math.abs(ax[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])); return [ax, u, cross(ax, u)]; };
  const FV = frame([0, 1, 0]);
  const FA = [frame(norm(sub(B.hand_l.head.toArray(), B.upperarm_l.head.toArray()))), frame(norm(sub(B.hand_r.head.toArray(), B.upperarm_r.head.toArray())))];
  const vridge = (P, F, seed) => {
    const w = N.fbm(P[0] * 6 + seed, P[1] * 6, P[2] * 6, 2) * 0.035;
    const q = [P[0] + w, P[1] - w, P[2] + w];
    return N.ridged(dot(q, F[0]) * 7 + seed, dot(q, F[1]) * 24, dot(q, F[2]) * 24, 3);
  };
  const veinAt = (P) => {
    const al = armL(P), ar = armR(P);
    const wl = al.r < 0.1 ? ss(0.0, 0.25, al.s) : 0, wr = ar.r < 0.1 ? ss(0.0, 0.25, ar.s) : 0;
    let a = vridge(P, FV, 0);
    if (wl > 0) a = mix(a, vridge(P, FA[0], 13), wl);
    if (wr > 0) a = mix(a, vridge(P, FA[1], 29), wr);
    const b = N.ridged(P[0] * 60 + 7, P[1] * 45, P[2] * 60, 2);
    return [a, b];
  };
  /** Vein density per region: neck / temples / chest / shoulders / forearms / hands / thighs. */
  const veinRegion = (P) => {
    let d = 0.22;
    // neck (sides, the jugulars), temples, upper chest / shoulders (spreading from the neck), forearms, hands,
    // inner thighs, calves; the face itself mostly clear
    d += 1.25 * (1 - ss(0.0, 0.08, Math.abs(P[1] - (neckY + 0.03)))) * (Math.hypot(P[0], P[2] - B.neck_01.head.z) < 0.1 ? 1 : 0);
    d += 0.9 * (1 - ss(0.025, 0.07, Math.min(dist(P, [0.065, eyeY + 0.02, eyeZ - 0.025]), dist(P, [-0.065, eyeY + 0.02, eyeZ - 0.025]))));
    d += 0.7 * (1 - ss(0.0, 0.12, Math.abs(P[1] - (yChest + 0.1))));
    const al = armL(P), ar = armR(P);
    d += 0.75 * Math.max(al.r < 0.08 ? ss(0.7, 1.3, al.s) : 0, ar.r < 0.08 ? ss(0.7, 1.3, ar.s) : 0);
    d += 0.4 * Math.max(al.r < 0.08 ? 1 - ss(0.0, 0.5, al.s) : 0, ar.r < 0.08 ? 1 - ss(0.0, 0.5, ar.s) : 0);
    d += 0.9 * (1 - ss(0.04, 0.11, Math.min(dist(P, handC[0]), dist(P, handC[1]))));
    d += 0.5 * (1 - ss(0.0, 0.25, Math.abs(P[1] - 0.45))) * (P[1] < 0.75 ? 1 : 0);
    if (P[1] > eyeY - 0.08 && P[2] > eyeZ - 0.02) d *= 0.6;
    d *= 1 - 0.9 * jawZone(P);
    return Math.min(1.6, d) * ss(-0.5, 0.15, N.fbm(P[0] * 3 + 9, P[1] * 3, P[2] * 3, 2) + 0.15);
  };
  const skin = lib.paintSkin(h, {
    seed: 29, base, size: 2048, normalSize: 1024, ormSize: 1024,
    pallor: 0, mottle: 0.4, veins: 0, bruises: 0.3, socket: 0.65, lips: 0, grime: 0.3,
    // skin seen through the rips keeps its grime / bruise pigment; its shadow goes to the ORM only
    coveredDarken: 0.7, coveredShade: 0.15, normalStrength: 2.7, roughness: 0.58,
    blood: {},
    extra: (P, Nn, c, st) => {
      const front = P[2] > torso.cz(Math.max(0.85, Math.min(1.6, P[1])));
      let blF = 0, blD = 0; // fresh (wet, red) / dried (brown crust) blood coverage
      // ---- bony relief: rib cage, costal arch, sunken belly, hip bones, collarbones, sternum, spine, scapulae
      if (P[1] > jeansTop - 0.1 && P[1] < neckY + 0.02 && Math.abs(P[0]) < 0.24) relief(P, Nn, c, st);
      // ---- vein network: raised black-violet veins with a dark red halo, finer capillary web around them
      {
        const dens = veinRegion(P);
        if (dens > 0.02) {
          const [a, b] = veinAt(P);
          const main = ss(0.39, 0.69, a) * dens, fine = ss(0.68, 0.9, b) * dens * 0.55;
          const halo = ss(0.2, 0.42, a) * (1 - ss(0.39, 0.69, a)) * dens;
          mul(c, [0.76, 0.52, 0.58], halo * 0.6);
          over(c, C.vein, Math.min(1, main * 0.85 + fine * 0.45));
          st.h += main * 0.9 + fine * 0.25;
          st.ro = mix(st.ro, 0.45, main * 0.5); // veins sit under taut, slightly sweaty skin
        }
      }
      // ---- head: buzz cut, torn scalp, inflamed sockets + black tears, brows, lips / gums, snarl creases
      if (P[1] > neckY - 0.02) head(P, Nn, c, st);
      // ---- fresh blood round the mouth, chin, down the throat
      {
        const dx = P[0] - A.mouth[0], dy = A.mouth[1] - P[1], dz = P[2] - A.mouth[2];
        if (dy > -0.04 && dy < 0.42 && P[2] > B.neck_01.head.z - 0.04 && Math.abs(dx) < 0.1) {
          const smear = (1 - ss(0.012, 0.034, Math.hypot(dx * 0.85, (dy - 0.016) * 1.05, dz * 1.4) + N.fbm(P[0] * 50, P[1] * 50, P[2] * 50, 3) * 0.012)) * (Nn[2] > -0.2 ? 1 : 0)
            * ss(-0.35, 0.1, N.fbm(P[0] * 70 + 2, P[1] * 70, P[2] * 70, 2));
          // chin: drool + blood running off it in sheets / runs down the throat
          const runs = ss(0.42, 0.64, N.noise(dx * 120, P[1] * 4, 3.7)) * (1 - ss(0.02, 0.055, Math.abs(dx - 0.006))) * ss(0.02, 0.05, dy) * (1 - ss(0.2, 0.4, dy));
          const chin = (1 - ss(0.02, 0.05, Math.abs(dx))) * ss(0.015, 0.03, dy) * (1 - ss(0.06, 0.09, dy)) * ss(-0.3, 0.3, N.fbm(P[0] * 40, P[1] * 40, P[2] * 40, 2) + 0.2);
          blF = Math.max(blF, smear * 0.9, runs * 0.85, chin * 0.6);
        }
      }
      // ---- hands: soaked to the wrist (fresh), dried up the forearms; black broken nails, raw fingertips
      {
        let dt = 1;
        for (const t of tips) dt = Math.min(dt, dist(P, t));
        const dh = Math.min(dist(P, handC[0]), dist(P, handC[1]));
        if (dh < 0.3) {
          const n = N.fbm(P[0] * 30 + 5, P[1] * 30, P[2] * 30, 4);
          const soak = (1 - ss(0.04, 0.12, dh)) * ss(-0.15, 0.35, n);
          blF = Math.max(blF, soak * 0.85);
          blD = Math.max(blD, (1 - ss(0.08, 0.2, dh)) * ss(0.25, 0.6, N.fbm(P[0] * 14, P[1] * 14, P[2] * 14, 3)) * 0.55);
          mul(c, C.livid.map((x) => x * 1.3), (1 - ss(0.02, 0.07, dt)) * 0.6);
          const nail = 1 - ss(0.005, 0.012, dt);
          over(c, C.nail, nail * 0.92);
          st.ro = mix(st.ro, 0.5, nail);
          // knuckles: tight, pale, split skin
          let dk = 1;
          for (const k of knuckles) dk = Math.min(dk, dist(P, k));
          const kn = (1 - ss(0.004, 0.014, dk)) * ss(0.0, 0.5, Nn[1] * 0.5 + 0.5);
          over(c, C.waxy.map((x) => x * 0.75), kn * 0.35);
          over(c, C.rash, kn * ss(0.1, 0.5, N.noise(P[0] * 300, P[1] * 300, P[2] * 300)) * 0.6);
        }
      }
      // ---- road rash: both knees, the right elbow, the left hip (he goes down at full speed)
      {
        const pads = [
          [[kneeL[0], kneeL[1] + 0.01, kneeL[2] + 0.04], 0.05, 1], [[kneeR[0], kneeR[1] - 0.01, kneeR[2] + 0.04], 0.045, 0.9],
          [[elbowR[0], elbowR[1], elbowR[2] - 0.035], 0.035, 0.9], [[elbowL[0], elbowL[1], elbowL[2] - 0.035], 0.025, 0.6],
        ];
        for (const [p, r, k] of pads) {
          const d = dist(P, p);
          if (d > r * 2.2) continue;
          const q = d / r + N.fbm(P[0] * 40, P[1] * 40, P[2] * 40, 3) * 0.65;
          if (q > 1.6) continue;
          const core = (1 - ss(0.5, 1.0, q)) * k;
          // abraded skin: raw pink-red, fine parallel scratches (vertical: dragged), dirt ground in, scabbing crust
          const scr = ss(0.25, 0.7, Math.abs(N.noise(P[0] * 420, P[1] * 22, P[2] * 420)));
          const raw = mix3(C.rash, C.rashRaw, scr);
          over(c, raw, core * ss(-0.35, 0.25, N.fbm(P[0] * 55 + 9, P[1] * 55, P[2] * 55, 2)) * 0.8);
          over(c, C.crust, core * ss(0.15, 0.55, N.fbm(P[0] * 70, P[1] * 70, P[2] * 70, 3)) * 0.85);
          over(c, C.mud, core * ss(0.3, 0.7, N.fbm(P[0] * 120 + 3, P[1] * 120, P[2] * 120, 2)) * 0.6);
          mul(c, [0.8, 0.6, 0.65], (1 - ss(1.0, 1.6, q)) * 0.5 * k); // bruised halo
          st.h += core * (scr * 0.35 - 0.3);
          st.ro = mix(st.ro, 0.62, core);
          blD = Math.max(blD, core * 0.25);
        }
      }
      // ---- bite on the left forearm: a torn-out chunk, dark meat, yellow fat in the torn wall, crust, run-off
      {
        const d = dist(P, forearmBite);
        if (d < 0.09) {
          const q = d / 0.026 + N.fbm(P[0] * 45, P[1] * 45, P[2] * 45, 3) * 0.35;
          if (q < 1) {
            const inner = 1 - ss(0.0, 0.85, q);
            const col = mix3(C.meat, C.meatDeep, inner * 0.75);
            mul(col, [0.6, 0.5, 0.5], N.ridged(P[0] * 160, P[1] * 160, P[2] * 160, 2) * 0.5);
            over(col, C.crust, ss(0.45, 0.62, N.fbm(P[0] * 70 + 5, P[1] * 70, P[2] * 70, 3) + q * 0.25) * 0.75);
            over(col, C.fat, ss(0.62, 0.88, q) * (1 - ss(0.1, 0.25, N.worley(P[0] * 110, P[1] * 110, P[2] * 110))) * 0.55);
            over(c, col, 0.97);
            st.h -= 1.6 * (1 - q * q);
            st.ro = 0.5;
          } else if (q < 1.35) {
            const e = (q - 1) / 0.35;
            over(c, C.crust, (1 - ss(0.1, 0.8, e)) * 0.8);
            st.h += 0.5 * (1 - Math.abs(e - 0.3) / 0.7);
          }
          // tooth punctures round it
          for (let k = 0; k < 10; k++) {
            const th = (k / 10) * Math.PI * 2 + 0.3;
            const ax = norm(cross(norm(sub(B.lowerarm_l.tail.toArray(), B.lowerarm_l.head.toArray())), [0, 0, 1]));
            const along = norm(sub(B.lowerarm_l.tail.toArray(), B.lowerarm_l.head.toArray()));
            const tp = add(forearmBite, add(scl(along, Math.cos(th) * 0.034), scl(ax, Math.sin(th) * 0.026)));
            const dd = dist(P, tp);
            if (dd < 0.006) { over(c, C.crust, (1 - ss(0.002, 0.005, dd)) * 0.9); st.h -= (1 - ss(0, 0.004, dd)) * 1.2; }
          }
          mul(c, [0.66, 0.6, 0.7], (1 - ss(0.03, 0.08, d)) * 0.5);
          const below = forearmBite[1] - P[1];
          if (below > 0 && below < 0.12 && Math.abs(P[2] - forearmBite[2]) < 0.04) blD = Math.max(blD, ss(0.3, 0.55, N.noise(P[0] * 150, P[1] * 8, P[2] * 150)) * (1 - below / 0.12));
        }
      }
      // ---- claw wounds under the shirt rips: three open gashes, crusted lips, runs
      if (front && P[1] > jeansTop - 0.05 && P[1] < yChest + 0.22) {
        const cl = clawSD(P, 0.0008, 0.26) + N.noise(P[0] * 260, P[1] * 260, P[2] * 260) * 0.0008;
        if (cl < 0.04) {
          // thin open gashes: dark meat, near-black in the depth, swollen crusted lips, an inflamed halo
          const g = 1 - ss(-0.0015, 0.0005, cl);
          over(c, mix3(C.meat, C.meatDeep, ss(0.0, 0.003, -cl)), g * 0.95);
          st.h -= g * 1.4;
          const lip = (1 - g) * (1 - ss(0.0, 0.006, cl));
          over(c, C.crust, lip * 0.75);
          mul(c, [1.1, 0.7, 0.7], (1 - ss(0.002, 0.01, cl)) * (1 - g) * 0.45);
          st.h += lip * 0.6;
          // a light bruise round them only: the skin between the gash and the torn cotton must read as skin
          mul(c, [0.86, 0.7, 0.74], (1 - ss(0.0, 0.025, cl)) * 0.25);
          blD = Math.max(blD, (1 - ss(0.0, 0.006, cl)) * 0.4 * (1 - g));
          st.ro = mix(st.ro, 0.4, g);
        }
        // runs down from the gashes
        if (cl < 0.12 && cl > -0.01) {
          const below = claws[2].c[1] + 0.05 - P[1];
          blD = Math.max(blD, ss(0.6, 0.75, N.noise(P[0] * 130, P[1] * 4, 5.3)) * (1 - ss(0.0, 0.12, cl)) * (below > 0 ? 1 : 0) * 0.85);
        }
      }
      // ---- dirt and old blood smeared over the whole body; filthy lower legs
      over(c, C.grime, ss(0.42, 0.8, N.fbm(P[0] * 5 + 11, P[1] * 2.2, P[2] * 5, 4)) * 0.3);
      over(c, C.mud, (1 - ss(0.1, 0.5, P[1])) * ss(-0.2, 0.5, N.fbm(P[0] * 14, P[1] * 14, P[2] * 14, 3)) * 0.4);
      blD = Math.max(blD, ss(0.68, 0.76, N.fbm(P[0] * 6 - 7, P[1] * 6, P[2] * 6, 4)) * 0.55);
      // ---- bare filthy feet
      if (P[1] < 0.2) foot(P, Nn, c, st);
      // ---- blood: our own colours (fresh = wet dark red, glossy; dried = brown-maroon crust, matte), lib's off
      if (blD > 0) {
        const thick = ss(0.45, 0.95, blD);
        over(c, mix3(C.dried, C.crust, ss(-0.3, 0.4, N.noise(P[0] * 25 + 70, P[1] * 25, P[2] * 25)) * 0.7 + thick * 0.3), ss(0.0, 0.5, blD) * 0.9);
        st.ro = mix(st.ro, 0.6, blD);
        st.h += thick * 0.2;
      }
      if (blF > 0) {
        const deep = ss(-0.3, 0.5, N.fbm(P[0] * 30, P[1] * 30, P[2] * 30, 2));
        over(c, mix3(C.fresh, C.freshDeep, deep), ss(0.0, 0.45, blF) * 0.95);
        // wet only where it is thick (a few glossy cores), tacky elsewhere
        st.ro = mix(st.ro, mix(0.56, 0.36, ss(0.6, 0.95, blF) * ss(0.0, 0.5, N.noise(P[0] * 90, P[1] * 90, P[2] * 90))), ss(0.2, 0.7, blF));
        st.h += blF * 0.15;
      }
      st.bl = 0;
    },
  });
  // outside the painted islands: a smooth pull-push fill (the proxy samples a little beyond the base islands)
  if (skin.albedo.width === base.width) pullPush(skin.albedo, base.mask);
  {
    // normal map at the jaw angle and along the island borders. The height field steps to zero outside the islands,
    // which embosses a ridge along every border, and the proxy's faces under the ears are stretched 3-5x in UV
    // (open jaw) right on the head / neck seam: ridge + painted creases blew up into a lit, crumpled "fin". Inside
    // the islands (eroded 2 texels) the normals are kept, flattened towards the jaw angle; the rest is pulled in
    // smoothly from that interior.
    const NM = skin.normal, NS = NM.width, k = base.width / NS;
    let m = new Uint8Array(NS * NS);
    for (let y = 0; y < NS; y++) for (let x = 0; x < NS; x++) {
      let all = 1;
      for (let j = 0; j < k && all; j++) for (let i = 0; i < k; i++) if (!base.covered[(y * k + j) * base.width + x * k + i]) { all = 0; break; }
      m[y * NS + x] = all;
    }
    for (let e = 0; e < 2; e++) {
      const nx = m.slice();
      for (let y = 1; y < NS - 1; y++) for (let x = 1; x < NS - 1; x++) { const i = y * NS + x; if (m[i] && (!m[i - 1] || !m[i + 1] || !m[i - NS] || !m[i + NS])) nx[i] = 0; }
      m = nx;
    }
    const bp = h.basePart({ name: 'nfix' }), bt = bp.tris(), bn = bp.normals(), r = rasterUV(bt, h.baseObj.uvs, NS, 3);
    const P = [0, 0, 0], Nn = [0, 0, 0];
    let flat = 0;
    for (let i = 0; i < NS * NS; i++) {
      if (r.tri[i] < 0 || !texelSurface(r, bt, h.pos, bn, i, P, Nn)) continue;
      const w = jawZone(P) * 0.9;
      if (!(w > 0.01)) continue;
      const d = NM.data, o = i * 4;
      d[o] = Math.round(d[o] + (128 - d[o]) * w); d[o + 1] = Math.round(d[o + 1] + (128 - d[o + 1]) * w); d[o + 2] = Math.round(d[o + 2] + (255 - d[o + 2]) * w);
      flat++;
    }
    pullPush(NM, m, { raw: true });
    console.log(`${TAG} skin normal: ${flat} texels flattened at the jaw angle, border band + gutter refilled from the island interiors`);
  }
  TR.snap('skin: paintSkin', skin.albedo, body);

  function relief(P, Nn, c, st) {
    const y = P[1];
    const cz = torso.cz(y), dz = torso.dz(y), hw = torso.hw(y);
    const ax = Math.abs(P[0]);
    const a = Math.atan2(ax / hw, (P[2] - cz) / dz); // 0 front .. pi/2 side .. pi back
    const yLow = SHL[1] - 0.31;                     // lowest ribs at the side / back
    const yXi = SHL[1] - 0.21;                      // xiphoid (bottom of the sternum)
    // costal arch: inverted V from the xiphoid down to the sides
    const arch = yXi - 0.5 * (ax / hw) * (yXi - yLow) * 1.3;
    const yMarg = a < 1.2 ? Math.max(yLow, arch) : yLow;
    const armpit = SHL[1] - 0.1;
    // rib lines slope down from the spine to the side and on round the front, the cartilages rise to the sternum
    const D = a > Math.PI / 2 ? 0.11 * (Math.PI - a) / (Math.PI / 2) : 0.11 + 0.045 * ss(Math.PI / 2, 0.55, a) - 0.05 * ss(0.5, 0.0, a);
    const ph = (y + D) / 0.027 + N.noise(P[0] * 9, y * 9, P[2] * 9) * 0.18;
    const g = Math.cos(ph * Math.PI * 2);
    // visibility: strongest on the flanks, under the pectorals at the front, faint on the back (lats)
    const pec = a < 1.0 && y > SHL[1] - 0.165 ? 1 - ss(0.65, 1.05, a) : 0;
    let vis = ss(yMarg - 0.005, yMarg + 0.02, y) * (1 - ss(armpit - 0.03, armpit + 0.01, y)) * (1 - pec);
    vis *= a > 2.3 ? 0.35 : a < 0.35 ? 0.4 : 1;
    if (vis > 0) {
      const rib = ss(-0.35, 0.75, g), groove = 1 - ss(-0.95, -0.25, g);
      st.h += (rib * 0.75 - groove * 1.2) * vis;
      mul(c, [0.7, 0.6, 0.68], groove * vis * 0.45);
      over(c, C.waxy.map((x) => x * Math.min(1.15, lumOf(c) / 0.21)), rib * vis * 0.16);
    }
    // torn-open right flank (in the armhole): the skin is gone over two lower ribs, bone bars between dark
    // intercostal meat, a ragged crusted rim, bruised and bloody round it
    if (P[0] < 0 && Nn[0] < 0) {
      const yW = SHL[1] - 0.245;
      const q = Math.hypot((P[2] - cz + 0.005) / 0.034, (y - yW) / 0.04) + N.fbm(P[0] * 40, y * 40, P[2] * 40, 3) * 0.32;
      if (q < 1) {
        const inner = 1 - ss(0.55, 1.0, q);
        // narrow, blood-stained bone bars (not clean stripes)
        const bone = ss(0.4, 0.8, g) * inner * ss(-0.2, 0.3, N.fbm(P[0] * 60 + 2, y * 60, P[2] * 60, 2) + 0.15);
        const meat = mix3(C.meat, C.meatDeep, ss(-0.2, -0.8, g));
        over(c, meat, 0.96);
        over(c, mix3(lin([150, 132, 106]), lin([120, 70, 56]), ss(-0.3, 0.5, N.fbm(P[0] * 120, y * 120, P[2] * 120, 2))), bone * 0.8);
        over(c, C.crust, ss(0.45, 0.65, N.fbm(P[0] * 80 + 3, y * 80, P[2] * 80, 3) + (1 - inner) * 0.35) * 0.7);
        st.h = st.h * 0.2 - 1.2 + bone * 1.1 - (1 - ss(-0.6, 0.0, g)) * 0.6;
        st.ro = mix(0.42, 0.6, 1 - inner);
        st.bl = 0;
      } else if (q < 1.35) {
        const e = (q - 1) / 0.35;
        over(c, C.crust, (1 - ss(0.0, 0.6, e)) * 0.85);
        st.h += 0.8 * (1 - Math.abs(e - 0.3) / 0.7);
      }
      if (q < 2.4) mul(c, [0.72, 0.52, 0.58], (1 - ss(1.0, 2.4, q)) * 0.55);
    }
    // sternum ridge and the hollow either side of it below the pecs
    if (a < 0.5 && y > yXi && y < neckY - 0.06) {
      const sx = ax / 0.012;
      st.h += (1 - ss(0.3, 1.2, sx)) * 0.6;
    }
    // costal arch ridge (light) and the sunken belly below it (dark hollow, vertical midline groove)
    if (a < 1.4) {
      const dm = y - yMarg;
      const ridge = (1 - ss(0.0, 0.012, Math.abs(dm))) * ss(0.12, 0.4, a + 0.2);
      st.h += ridge * 0.5;
      over(c, C.waxy.map((x) => x * Math.min(1.1, lumOf(c) / 0.21)), ridge * 0.1);
      if (dm < 0 && y > jeansTop - 0.03) {
        const hollow = ss(0.0, -0.05, dm) * (1 - ss(0.75, 1.3, a));
        kmul(c, 1 - hollow * 0.1);
        mul(c, [0.88, 0.82, 0.9], hollow * 0.35);
        st.h -= hollow * 0.5;
        const linea = (1 - ss(0.002, 0.008, ax)) * hollow;
        st.h -= linea * 0.4;
        kmul(c, 1 - linea * 0.15);
      }
    }
    // hip bones (iliac crests) jutting above the waistband
    for (const sx of [1, -1]) {
      const hy = jeansTopAt(sx * 0.1) + 0.035;
      const hp = [sx * (torso.hw(hy) * 0.82), hy, 0];
      if (P[0] * sx < 0 || !front3(P)) continue;
      const d = Math.hypot((P[0] - hp[0]) * 1.4, P[1] - hp[1]);
      const k = 1 - ss(0.006, 0.03, d);
      st.h += k * 0.7;
      over(c, C.waxy.map((x) => x * Math.min(1.1, lumOf(c) / 0.21)), k * 0.12);
      // the groove running down inwards from it
      const gx = (P[0] - hp[0]) * sx, gy = hp[1] - P[1];
      if (gy > 0 && gy < 0.08) {
        const lineD = Math.abs(gx + gy * 0.7 + 0.01);
        const gr = (1 - ss(0.003, 0.014, lineD)) * (1 - ss(0.04, 0.08, gy));
        st.h -= gr * 0.6; kmul(c, 1 - gr * 0.18);
      }
    }
    // collarbones: a hard ridge, the hollow above it, tight skin over the shoulder end
    if (P[2] > cz && y > neckY - 0.12) {
      for (const [h0, t0] of clavs) {
        const sgn = Math.sign(t0[0]);
        if (P[0] * sgn < 0) continue;
        const a0 = [h0[0], h0[1]], b0 = [t0[0], t0[1] + 0.012];
        const d = [b0[0] - a0[0], b0[1] - a0[1]], L2 = d[0] * d[0] + d[1] * d[1];
        const t = clamp01(((P[0] - a0[0]) * d[0] + (y - a0[1]) * d[1]) / L2);
        const qx = a0[0] + d[0] * t, qy = a0[1] + d[1] * t + 0.012 * Math.sin(t * Math.PI);
        const dy = y - qy, dd = Math.hypot(P[0] - qx, dy);
        const ridge = (1 - ss(0.003, 0.011, dd)) * ss(0.05, 0.2, t);
        st.h += ridge * 1.2;
        over(c, C.waxy.map((x) => x * Math.min(1.15, lumOf(c) / 0.2)), ridge * 0.2);
        const fossa = dy > 0.006 && dy < 0.04 ? (1 - ss(0.01, 0.035, dy)) * ss(0.15, 0.35, t) * (1 - ss(0.75, 0.95, t)) : 0;
        st.h -= fossa * 0.8;
        kmul(c, 1 - fossa * 0.3);
      }
      // jugular notch
      const jn = 1 - ss(0.006, 0.02, Math.hypot(P[0], y - (neckY - 0.03)));
      st.h -= jn * 0.6; kmul(c, 1 - jn * 0.3);
    }
    // back: spinous processes, the gutter either side, protruding shoulder-blade edges
    if (P[2] < cz - dz * 0.4 && y > jeansTop && y < neckY + 0.02) {
      const sp = (1 - ss(0.003, 0.012, ax)) * ss(-0.2, 0.9, Math.cos(y / 0.026 * Math.PI * 2));
      const gutter = (1 - ss(0.01, 0.03, Math.abs(ax - 0.025)));
      st.h += sp * 0.7 - gutter * 0.25;
      kmul(c, 1 - gutter * 0.08);
      // scapula: medial border (near-vertical) + the spine of the scapula (a ridge running out to the shoulder)
      for (const S of [SHL, SHR]) {
        const sgn = Math.sign(S[0]);
        if (P[0] * sgn < 0) continue;
        const bx = 0.075 + (S[1] - 0.06 - y) * 0.12;
        const med = (1 - ss(0.004, 0.014, Math.abs(ax - bx))) * ss(S[1] - 0.24, S[1] - 0.18, y) * (1 - ss(S[1] - 0.06, S[1] - 0.03, y));
        const spineY = S[1] - 0.065 + (ax - 0.08) * 0.15;
        const ss2 = (1 - ss(0.004, 0.013, Math.abs(y - spineY))) * ss(0.07, 0.1, ax) * (1 - ss(0.17, 0.2, ax));
        st.h += (med + ss2) * 0.6;
        // shadow under the medial border (the blade stands off the ribs)
        const sh = (1 - ss(0.0, 0.02, ax - bx + 0.004)) * ss(0.0, 0.004, bx - ax + 0.012) * ss(S[1] - 0.24, S[1] - 0.18, y) * (1 - ss(S[1] - 0.06, S[1] - 0.03, y));
        kmul(c, 1 - sh * 0.2);
      }
    }
  }
  function front3(P) { return P[2] > torso.cz(Math.max(0.85, P[1])); }

  function head(P, Nn, c, st) {
    // buzz-cut scalp: hairline height as a function of the azimuth round the skull (front ~7 cm above the eyes,
    // receding temples, just above the ears, low on the nape); the ears are left bare
    const l = dist(P, skull);
    const earFree = l < 0.17 && P[1] > neckY + 0.03 ? earFreeAt(P) : 0;
    if (earFree > 0) {
      const az = Math.abs(Math.atan2(P[0], P[2] - skull[2]));
      const yHL = eyeY + hairlineAt(az) + N.fbm(P[0] * 30, P[1] * 30, P[2] * 30, 3) * 0.008;
      // soft edge: the stubble thins out over the last ~1.5 cm (no hard cap line)
      const edge = ss(-0.01, 0.01, P[1] - yHL);
      const hair = edge * earFree;
      if (hair > 0) {
        // dense dark stubble dots over a darker scalp; a few bald patches (mange) and scabs
        const sparse = 1 - hair;
        const dots = ss(0.15 + 0.4 * sparse, 0.6 + 0.3 * sparse, N.noise(P[0] * 1100, P[1] * 1100, P[2] * 1100) * 0.5 + 0.5);
        const patch = ss(0.45, 0.62, N.fbm(P[0] * 14 + 5, P[1] * 14, P[2] * 14, 3));
        // (kept at a mid grey, ~sRGB 65-75: a near-black scalp merged with the shorts in back views)
        over(c, C.scalp.map((x) => x * Math.min(1.2, lumOf(c) / 0.2)), hair * 0.4);
        over(c, C.stubble, hair * (0.36 + 0.3 * dots) * (1 - patch * 0.75));
        st.ro = mix(st.ro, 0.7, hair * (1 - patch));
        st.h += hair * dots * 0.12;
        const scab = (1 - ss(0.08, 0.16, N.worley(P[0] * 55, P[1] * 55, P[2] * 55))) * patch;
        over(c, C.crust, scab * 0.7);
      }
    }
    // torn-off patch of scalp over the right temple: skull bone, raw edges, blood down the side of the face
    {
      const d = dist(P, scalpTear.p);
      if (d < 0.085) {
        // an elongated, jagged avulsion running front-back, slightly bent (a concentric disc of bone / meat / crust
        // read as a red sticker): torn tissue walls, the skull showing in an off-centre irregular patch, clots
        const dP = sub(P, scalpTear.p);
        const x = dot(dP, tearT), y = dot(dP, tearB);
        const yc = y - 0.005 * Math.sin(x * 45) - x * 0.12;
        const jag = N.fbm(P[0] * 24, P[1] * 24, P[2] * 24, 3) * 0.45 + N.noise(P[0] * 130, P[1] * 130, P[2] * 130) * 0.1;
        const q = Math.hypot(x / 0.034, yc / 0.02) + jag;
        if (q < 1) {
          const wall = ss(0.55, 1.0, q);
          // the bone: ragged, off-centre fragments of skull between the clots, cut out of a noise field (an even
          // oval with a crack along it read as a closed eye)
          const bf = N.fbm(P[0] * 40 + 3, P[1] * 40, P[2] * 40, 3) - 0.6 * Math.hypot((x + 0.009) / 0.02, (yc - 0.003) / 0.012) + 0.3;
          const bone = ss(0.0, 0.1, bf) * (1 - wall);
          const tissue = mix3(mix3(C.meat, C.meatDeep, 0.3 + 0.4 * ss(-0.2, 0.5, N.fbm(P[0] * 80, P[1] * 80, P[2] * 80, 2))), C.meat, wall * 0.5);
          over(c, tissue, 0.97);
          // exposed skull: dull, blood-stained ivory (sRGB ~150-160, never a clean white), pitted, matte
          const stain = ss(-0.3, 0.5, N.fbm(P[0] * 90, P[1] * 90, P[2] * 90, 2));
          const bc = mix3(lin([160, 146, 124]), lin([128, 82, 64]), stain * 0.7);
          mul(bc, [0.86, 0.82, 0.8], ss(0.55, 0.8, N.noise(P[0] * 400, P[1] * 400, P[2] * 400)));
          over(c, bc, bone * 0.92);
          // fine, broken fracture lines in the bone (a sparse ridged network, not one clean stroke)
          const crack = ss(0.84, 0.94, N.ridged(P[0] * 110 + 4, P[1] * 110, P[2] * 110, 2)) * bone * ss(-0.2, 0.25, N.noise(P[0] * 150, P[1] * 150, P[2] * 150));
          over(c, lin([46, 14, 10]), crack * 0.85);
          // clots: dark crusted lumps on the torn tissue, some lying over the bone
          const clot = ss(0.12, 0.42, N.fbm(P[0] * 70 + 5, P[1] * 70, P[2] * 70, 3) + wall * 0.25 - bone * 0.1);
          over(c, C.crust, clot * 0.8);
          st.h = st.h * 0.3 - 1.1 + wall * 0.9 + bone * 0.25 - crack * 0.3 + clot * 0.2;
          st.ro = mix(mix(0.42, 0.68, bone), 0.62, clot);
        } else if (q < 1.45) {
          // the torn scalp lip: swollen, purple-red, a crusted edge, rolled up proud of the wound
          const e = (q - 1) / 0.45, lumpy = ss(-0.4, 0.4, N.fbm(P[0] * 55 + 1, P[1] * 55, P[2] * 55, 2));
          over(c, C.crust, (1 - ss(0.0, 0.25, e)) * 0.9);
          over(c, lin([104, 40, 42]), (1 - ss(0.1, 0.8, e)) * 0.55 * (0.35 + 0.65 * lumpy));
          st.h += (0.55 + 0.6 * lumpy) * (1 - ss(0.0, 1.0, Math.abs(e - 0.22) / 0.78));
          st.ro = mix(st.ro, 0.6, 1 - e);
        }
        // bruising and blood matted into the stubble round it (irregular, not a ring)
        mul(c, [0.72, 0.56, 0.6], (1 - ss(1.0, 2.2, q)) * 0.4);
        if (q >= 1) over(c, mix3(C.dried, C.crust, 0.5), (1 - ss(1.15, 2.0, q)) * ss(0.0, 0.45, N.fbm(P[0] * 45 + 2, P[1] * 45, P[2] * 45, 3)) * 0.75);
      }
      // dried runs from it down the right temple and cheek
      const below = scalpTear.p[1] - P[1];
      if (below > 0 && below < 0.16 && P[0] < -0.02 && P[2] > eyeZ - 0.09) {
        const along = P[0] - scalpTear.p[0] - below * 0.15;
        const streak = ss(0.35, 0.6, N.noise(along * 90, P[1] * 5, 7.7)) * (1 - ss(0.01, 0.03, Math.abs(along) - 0.01)) * (1 - ss(0.08, 0.16, below));
        over(c, mix3(C.dried, C.crust, 0.4), streak * 0.85);
        st.ro = mix(st.ro, 0.6, streak);
      }
    }
    if (P[2] < eyeZ - 0.06 || Nn[2] < -0.3) return;
    // inflamed, sunken eye sockets: near-black-red around the lids, a feverish red rim
    for (const e of [A.eyeL, A.eyeR]) {
      const dx = P[0] - e[0], dy = P[1] - e[1];
      const d = Math.hypot(dx, dy * 1.2);
      if (d > 0.06) continue;
      const sock = 1 - ss(0.012, 0.035, d);
      over(c, C.socket, sock * 0.6);
      const rim = (1 - ss(0.008, 0.02, Math.abs(d - 0.022))) * (1 - ss(0.03, 0.05, d));
      mul(c, [1.25, 0.62, 0.6], rim * 0.55);
      st.h -= sock * 0.3;
      st.ro = mix(st.ro, 0.4, 1 - ss(0.008, 0.016, d)); // wet lid margin
      // black tears: dark blood leaking from the lower lids, running down the cheeks
      if (dy < -0.008) {
        const below = -dy - 0.008;
        for (const [ox, len, ph] of (e[0] > 0 ? [[-0.002, 0.045, 0.3]] : [[0.003, 0.022, 1.2]])) {
          const cx = ox + Math.sin(below * 60 + ph) * 0.0018 + N.noise(below * 40, ph, 0.3) * 0.002;
          const w = 0.0011 * (1 - 0.6 * below / len) + 0.0004;
          const k = (1 - ss(w * 0.6, w * 1.4, Math.abs(dx - cx))) * (1 - ss(len * 0.85, len, below));
          if (k > 0) { over(c, mix3(lin([52, 9, 9]), lin([36, 12, 10]), ss(0, len, below)), k * 0.8 * (1 - 0.5 * ss(0.4, 1, below / len))); st.ro = mix(st.ro, 0.35, k); st.h += k * 0.15; }
        }
      }
    }
    // brows: dark, thick, crushed down into a scowl (painted, no floating cards)
    brows(P, Nn, c, st);
    // a swollen vein up the left side of the forehead: dark violet-grey (darker than the skin), low relief, tapering
    // out into two thin branches before the hairline; it stays on the front of the brow (on the curved top of the
    // skull a constant-x line used to run back over the scalp as a long pale embossed worm)
    {
      const fy = P[1] - eyeY;
      if (P[0] > 0 && P[0] < 0.06 && fy > 0.026 && fy < 0.068 && P[2] > eyeZ - 0.012 && Nn[2] > 0.45) {
        const vx = 0.019 + 0.005 * Math.sin(fy * 90) + (fy - 0.03) * 0.12;
        const bx1 = vx + Math.max(0, fy - 0.048) * 0.85, bx2 = vx - Math.max(0, fy - 0.052) * 0.6;
        const taper = 1 - ss(0.03, 0.066, fy);
        const w = 0.0006 + 0.0012 * taper;
        const main = (1 - ss(w * 0.35, w, Math.abs(P[0] - vx))) * (fy < 0.056 ? 1 : 0);
        const br = fy > 0.048 ? Math.max(1 - ss(w * 0.3, w * 0.8, Math.abs(P[0] - bx1)), (fy > 0.052 ? 1 - ss(w * 0.3, w * 0.7, Math.abs(P[0] - bx2)) : 0)) : 0;
        const k = Math.max(main, br * 0.8) * (0.4 + 0.6 * taper);
        if (k > 0) { over(c, lin([58, 42, 64]), k * 0.7); st.h += k * 0.18; }
      }
    }
    // nose: snarl creases on the bridge, dark nostrils, a trickle of blood from the left nostril
    {
      const nb = Math.hypot(P[0] * 1.3, P[1] - (eyeY + 0.004));
      if (nb < 0.016 && P[2] > eyeZ) {
        const cr = ss(0.7, 0.92, Math.abs(Math.sin((P[1] - eyeY) * 700 + N.noise(P[0] * 200, P[1] * 50, 1) * 1.5))) * (1 - ss(0.005, 0.016, nb));
        kmul(c, 1 - cr * 0.2); st.h -= cr * 0.3;
      }
    }
    // lips pulled back: dry, cracked, dark; gums; snarl creases (nasolabial) deep
    {
      const dx = P[0] - A.mouth[0], dy = P[1] - A.mouth[1];
      const dm = Math.hypot(dx * 0.8, dy * 1.25);
      if (dm < 0.045 && P[2] > A.mouth[2] - 0.04) {
        const lip = 1 - ss(0.016, 0.026, dm);
        over(c, C.lip, lip * 0.75);
        const crack = ss(0.75, 0.95, Math.abs(Math.sin(dx * 700 + N.noise(P[0] * 300, P[1] * 300, 2) * 2))) * lip;
        over(c, C.crust, crack * 0.6);
        st.h -= crack * 0.4;
        mul(c, [1.15, 0.75, 0.75], (1 - ss(0.0, 0.012, dm)) * 0.4);
      }
      for (const sx of [1, -1]) {
        // nasolabial fold: from the nose wing down past the mouth corner
        const ox = P[0] * sx;
        const t = (eyeY - 0.035 - P[1]) / 0.06;
        if (t < 0 || t > 1.1 || P[2] < A.mouth[2] - 0.03) continue;
        const lx = 0.018 + t * 0.016;
        const fd = Math.abs(ox - lx);
        const fold = (1 - ss(0.001, 0.005, fd)) * ss(0.0, 0.15, t) * (1 - ss(0.85, 1.1, t));
        st.h -= fold * 0.9; kmul(c, 1 - fold * 0.3);
      }
    }
    // hollow cheeks under the cheekbones, sunken temples: shading, the cheekbone itself catches light
    for (const e of [A.eyeL, A.eyeR]) {
      const cheek = Math.hypot((P[0] - e[0] * 1.35) / 0.02, (P[1] - (eyeY - 0.055)) / 0.026, (P[2] - (e[2] - 0.03)) / 0.03);
      mul(c, [0.72, 0.66, 0.7], (1 - ss(0.3, 1.3, cheek)) * 0.4);
      const cb = Math.hypot((P[0] - e[0] * 1.45) / 0.02, (P[1] - (eyeY - 0.025)) / 0.01);
      over(c, C.waxy.map((x) => x * Math.min(1.1, lumOf(c) / 0.19)), (1 - ss(0.4, 1.2, cb)) * 0.12);
      st.h += (1 - ss(0.4, 1.2, cb)) * 0.3;
    }
  }

  function brows(P, Nn, c, st) {
    if (Nn[2] < -0.1 || P[2] < eyeZ - 0.03 || Math.abs(P[1] - eyeY - 0.022) > 0.03) return;
    const g = browGuide[P[0] > 0 ? 0 : 1];
    const ax = Math.abs(P[0]);
    if (ax < g.x0 - 0.006 || ax > g.x1 + 0.006) return;
    const at = g.at(ax);
    const along = (ax - g.x0) / (g.x1 - g.x0);
    // scowl: inner ends pulled down and together
    const yC = at.y - 0.004 * (1 - ss(0.0, 0.5, along));
    const dy = P[1] - yC;
    const hw = at.hw * mix(1.15, 0.65, ss(0.5, 1.05, along));
    const edge = Math.abs(dy) / hw + N.fbm(P[0] * 140, P[1] * 140, P[2] * 140, 2) * 0.4;
    const dens = (1 - ss(0.45, 1.05, edge)) * ss(-0.12, 0.1, along) * (1 - ss(0.88, 1.08, along));
    if (dens <= 0) return;
    const ang = mix(0.9, 0.15, ss(0.0, 0.7, along));
    const t1 = ax * Math.cos(ang) + dy * Math.sin(ang), t2 = -ax * Math.sin(ang) + dy * Math.cos(ang);
    const str = ss(0.1, 0.4, Math.abs(N.noise(t1 * 220, t2 * 1300, 4.2)));
    const hairA = dens * (0.55 + 0.45 * str);
    over(c, C.brow, hairA * 0.88);
    st.h += hairA * 0.25;
    st.ro = mix(st.ro, 0.68, hairA);
    // the furrow between the brows
    const gl = (1 - ss(0.002, 0.007, Math.abs(P[0]))) * (1 - ss(0.0, 0.012, Math.abs(P[1] - eyeY - 0.02)));
    st.h -= gl * 0.6;
  }

  function foot(P, Nn, c, st) {
    const hgt = P[1] + N.fbm(P[0] * 14, P[1] * 14, P[2] * 14, 3) * 0.025;
    const caked = 1 - ss(0.012, 0.06, hgt);
    const film = 1 - ss(0.03, 0.18, hgt);
    const n = N.fbm(P[0] * 24 + 4, P[1] * 24, P[2] * 24, 4);
    const l = lumOf(c);
    over(c, C.mud.map((x) => x * Math.min(1.1, l / 0.19)), film * (0.25 + 0.2 * ss(-0.2, 0.4, n)));
    over(c, C.mud, caked * (0.6 + 0.25 * n));
    over(c, C.sole, ss(-0.2, -0.6, Nn[1]) * 0.92);
    st.ro = mix(st.ro, 0.9, Math.max(caked, film * 0.5));
    st.h += caked * n * 0.4;
    // cuts on the soles / sides (running barefoot on debris): crusted blood
    over(c, C.crust, (1 - ss(0.07, 0.12, N.worley(P[0] * 60, P[1] * 60, P[2] * 60))) * caked * 0.5);
    let dT = 1, tt = null;
    for (const t of toes) { const d = dist(P, t.p); if (d < dT) { dT = d; tt = t; } }
    if (!tt || dT > 0.06) return;
    const ax = Math.abs(P[0]);
    const row = toes.filter((t) => t.side === tt.side).map((t) => Math.abs(t.p[0])).sort((a, b) => a - b);
    let dGap = 1;
    for (let k = 0; k + 1 < row.length; k++) dGap = Math.min(dGap, Math.abs(ax - (row[k] + row[k + 1]) / 2));
    const fwd = ss(tt.p[2] - 0.04, tt.p[2] - 0.028, P[2]);
    const gap = (1 - ss(0.0012, 0.0035, dGap)) * 0.8 * fwd;
    over(c, lin([28, 23, 20]), gap * 0.8);
    st.h -= gap * 0.6;
    const back = tt.p[2] - P[2];
    const sideD = Math.abs(P[0] - tt.p[0]);
    const nail = (1 - ss(tt.r * 0.75, tt.r * 1.05, sideD)) * ss(-0.002, 0.003, back) * (1 - ss(tt.r * 1.6, tt.r * 2.1, back)) * ss(0.1, 0.45, Nn[1] + Nn[2] * 0.5);
    if (nail > 0) {
      over(c, lin([92, 84, 70]).map((x) => x * (0.75 + 0.35 * N.noise(P[0] * 400, P[1] * 400, P[2] * 400))), nail * 0.8);
      over(c, lin([24, 18, 14]), nail * (1 - ss(0.0, 0.004, back)) * 0.85);
      st.h += nail * 0.6;
      st.ro = mix(st.ro, 0.55, nail);
    }
  }

  // ---- hide body faces under intact cloth (keep them under every cut, with a margin)
  let hiddenFaces = 0;
  {
    const bn = body.normals();
    const cov = new Uint8Array(body.nVerts);
    for (let v = 0; v < body.nVerts; v++) cov[v] = coverage([body.pos[v * 3], body.pos[v * 3 + 1], body.pos[v * 3 + 2]], [bn[v * 3], bn[v * 3 + 1], bn[v * 3 + 2]]) >= 0.8 ? 1 : 0;
    body.obj.faces.forEach((f, fi) => { if (body.keep[fi] && f.v.every((v) => cov[v])) { body.keep[fi] = 0; hiddenFaces++; } });
  }
  console.log(`${TAG} ${hiddenFaces} body faces hidden under the clothes, body ${body.triCount()} tris`);

  // ---- ray-traced AO + alpha-aware cloth shadow on the skin, AO on the cloth: written to the ORM occlusion only
  const surf = (part) => ({ tris: part.tris(), pos: part.pos, nrm: part.normals() });
  const baseSkin = surf(h.basePart({ name: 'ao' }));
  const suitS = surf(suit);
  const suitFaceOf = suit._faceOf.slice();
  const RA = texSize(512);
  {
    const bodyBvh = occluders([baseSkin]);
    const clothBvh = occluders([suitS]);
    const idx = clothBvh.geometry.index;
    const opaque = (hit) => {
      const tri = Math.floor((idx ? idx.getX(hit.faceIndex * 3) : hit.faceIndex * 3) / 3);
      const p = [hit.point.x, hit.point.y, hit.point.z];
      return (faceDenim[suitFaceOf[tri]] ? shortsCut(p) : shirtCut(p)) <= 0;
    };
    const ao = bakeField(baseSkin, h.baseObj.uvs, RA, occTracer(bodyBvh, { rays: 16, maxDist: 0.09 }));
    const sh = bakeField(baseSkin, h.baseObj.uvs, RA, occTracer(clothBvh, { rays: 12, maxDist: 0.06, opaque, seed: 7 }), { blur: 1 });
    applyOcclusion(skin.orm, [ao, sh], RA, (a, s) => mix(1, a, 0.85) * mix(1, s * s, 0.9));
  }
  {
    const bvh = occluders([suitS, baseSkin]);
    const idx = bvh.geometry.index;
    const nSuit = suitS.tris.length / 6;
    const opaque = (hit) => {
      const tri = Math.floor((idx ? idx.getX(hit.faceIndex * 3) : hit.faceIndex * 3) / 3);
      if (tri >= nSuit) return true;
      const p = [hit.point.x, hit.point.y, hit.point.z];
      return (faceDenim[suitFaceOf[tri]] ? shortsCut(p) : shirtCut(p)) <= 0;
    };
    const ao = bakeField(suitS, suit.obj.uvs, RA, occTracer(bvh, { rays: 16, maxDist: 0.12, opaque, seed: 3 }));
    // on top of the garment's (softened) own AO map; kept soft: the hunched clips already self-shadow the chest
    applyOcclusion(cloth.orm, [ao], RA, (a) => mix(1, a, 0.6));
  }
  TR.snap('skin: final (after hide + AO)', skin.albedo, body);
  TR.snap('suit: final (after cuts + AO)', cloth.albedo, suit);
  body.material = lib.material('skin', { ...skin });
  // 8-bit PNG: the RGB under the cut-outs is dilated + pre-quantised above (the 6-bit writer path would zero it)
  suit.material = lib.material('cloth', { ...cloth, alpha: true, doubleSided: true, pngBits: 8 });
  if (process.env.RUNNER_DUMP) {
    // look-dev: dump the painted maps (RUNNER_DUMP=<dir>)
    const d = process.env.RUNNER_DUMP.replace(/\/?$/, '/');
    lib.savePNG(lib.resize(skin.albedo, 1024, 1024), d + 'skin_albedo.png');
    lib.savePNG(lib.resize(skin.normal, 1024, 1024), d + 'skin_normal.png');
    lib.savePNG(lib.resize(cloth.albedo, 1024, 1024), d + 'cloth_albedo.png');
  }

  // ---- eyes: glowing amber-red, pinpoint pupils (emissive)
  const eyeTex = await lib.texture('system', 'eyes/materials/brown_eye.png', 512);
  const ge = glowEyes(eyeTex, N);
  eyes.material = lib.material('eye', { albedo: ge.albedo, emissiveMap: ge.emissive, emissive: [1, 1, 1], roughness: 0.12 });
  eyes.extras.noSimplify = true;

  // ---- teeth: yellow-brown, bloody gums, two knocked out
  pullTeeth(teeth, [[0.012, 'up'], [-0.004, 'low']]);
  const teethTex = await lib.texture(teeth.asset.textures.diffuse, 512);
  teeth.material = lib.material('teeth', {
    albedo: lib.grungeTexture(teethTex, { seed: 17, tint: [0.84, 0.66, 0.42], darken: 0.22, dirt: 0.5, blood: 0.7, freq: 12 }),
    orm: createImage(64, 64, [150, 90, 0, 255]),
  });

  // ---- mouth cavity: dark wet flesh, near-black down the throat; eye caps (hidden behind the eyeballs)
  const cavTex = createImage(64, 64, [0, 0, 0, 255]);
  grade(cavTex, (c, u) => {
    if (u < 0.5) { const k = ss(0.03, 0.3, u); const a = lin([52, 13, 12]), b = lin([8, 3, 3]); for (let i = 0; i < 3; i++) c[i] = mix(a[i], b[i], k); }
    else { const e = lin([40, 10, 6]); for (let i = 0; i < 3; i++) c[i] = e[i]; }
  });
  const mouth = toPart(lib, h, cavityGeo, 'mouth', 'gore', () => [['head', 1]]);
  mouth.material = lib.material('gore', { albedo: cavTex, roughness: 0.62, doubleSided: true });

  // ---- posture: shoulders hiked up and forward, head thrust forward with the face up (predator), applied on top
  // of every clip
  // (the silhouette cue of a special: neck jutting forward out of hiked-up shoulders, chin up, hooked claw fingers)
  const poseOffsets = {
    spine_03: [3, 0, 0], neck_01: [7, 0, 0], head: [-20, 0, 4],
    clavicle_l: [0, 0, -12], clavicle_r: [0, 0, 12],
  };
  for (const s of ['l', 'r']) {
    for (const f of ['index', 'middle', 'ring', 'pinky']) {
      poseOffsets[`${f}_01_${s}`] = [0, 0, 18]; poseOffsets[`${f}_02_${s}`] = [0, 0, 30]; poseOffsets[`${f}_03_${s}`] = [0, 0, 26];
    }
  }

  // ---- hitboxes: thin limbs measured on the naked base mesh (clamped), hands as wrist->knuckle capsules
  const parts = [body, suit, eyes, teeth, mouth];
  const allHb = computeHitboxes(h, [body, suit].map((p) => p.toRender()));
  const bodyHb = computeHitboxes(h, [h.basePart({ name: 'hb' }).toRender()]);
  const hitboxes = { ...allHb.hitboxes }, capsules = { ...allHb.capsules };
  const setHb = (key, bone, r, to) => {
    r = +r.toFixed(3);
    hitboxes[key] = to ? [bone, r, to] : [bone, r];
    const b = B[bone], e = to ? B[to].head : b.tail;
    capsules[key] = { bone, radius: r, length: +b.head.distanceTo(e).toFixed(3), ...(to ? { to } : {}) };
  };
  for (const k of ['upperarm_l', 'upperarm_r']) setHb(k, k, Math.min(0.055, Math.max(0.045, bodyHb.hitboxes[k][1] + 0.005)));
  for (const k of ['lowerarm_l', 'lowerarm_r']) setHb(k, k, Math.min(0.045, Math.max(0.035, bodyHb.hitboxes[k][1])));
  for (const k of ['thigh_l', 'thigh_r']) setHb(k, k, Math.min(0.075, Math.max(0.06, bodyHb.hitboxes[k][1] + 0.005)));
  for (const k of ['calf_l', 'calf_r']) setHb(k, k, Math.min(0.055, Math.max(0.045, bodyHb.hitboxes[k][1])));
  setHb('hand_l', 'hand_l', 0.042, 'middle_01_l');
  setHb('hand_r', 'hand_r', 0.042, 'middle_01_r');
  setHb('head', 'head', 0.095);
  capsules.head.length = +Math.max(0.03, h.height - B.head.head.y - 0.095).toFixed(3);
  setHb('chest', 'spine_03', Math.min(0.15, allHb.hitboxes.chest[1]));
  console.log(`${TAG} hitboxes ${JSON.stringify(hitboxes)}`);
  TR.report();

  return {
    human: h,
    parts,
    budget: 9000,
    partBudget: { clothes: 3200, teeth: 400 },
    extras: {
      archetype: 'runner', gender: 'male', variant: 'emaciated young man, shredded tank top + denim cut-offs, glowing eyes',
      hitboxes, capsules, poseOffsets,
    },
    // LOD1 keeps the glowing eyes (they are the read at distance); the mouth cavity seals the open jaw
    lod1: { budget: 2500, drop: ['teeth'], texScale: 0.5, partBudget: { clothes: 900, body: 1150 } },
  };
}

/**
 * Skin albedo composite on the MakeHuman UV layout: the young caucasian male skin's luminance detail (pores, the
 * shaved scalp's stubble, lips, nipples, knuckle creases) as a ratio over a dusky, ashen infected palette (grey-brown
 * with a violet bruise drift and a sickly olive drift, purple-grey extremities, a feverish reddish face), plus
 * creases / folds from the morphed base mesh (cavity) and waxy highlights on convex, bony areas.
 */
async function skinBase(lib, h, S, { eyeY, eyeZ, skull, N, jawZone }) {
  const ym = await lib.texture('system', 'skins/young_caucasian_male/young_lightskinned_male_diffuse.png', S);
  const bp = h.basePart({ name: 'composite' });
  const tris = bp.tris(), nrm = bp.normals();
  const r = rasterUV(tris, h.baseObj.uvs, S, 8);
  const B = h.skeleton.byName;
  // detail = source luminance / its island-aware local mean (~1.5 cm): pores, fine wrinkles, stubble grain, lip and
  // nail edges survive; the source's large-scale tone (light face, dark scalp, pink extremities) does not
  const n = S * S, Ls = new Float32Array(n), m = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    m[i] = r.covered[i];
    Ls[i] = (S2L[ym.data[i * 4]] * 0.2126 + S2L[ym.data[i * 4 + 1]] * 0.7152 + S2L[ym.data[i * 4 + 2]] * 0.0722) * m[i];
  }
  const rad = Math.max(3, Math.round(S / 96));
  const Lb = blurField(Ls, S, S, rad, 2), mb = blurField(m, S, S, rad, 2);
  const cav = cavityFields(tris, h.pos, nrm);
  const hands = [B.hand_l.head.toArray(), B.hand_r.head.toArray()];
  const P = [0, 0, 0], Nn = [0, 0, 0], c = [0, 0, 0], col = [0, 0, 0];
  const out = lib.cloneImage(ym);
  const mask = new Uint8Array(S * S);
  for (let i = 0; i < S * S; i++) {
    const di = i * 4;
    for (let k = 0; k < 3; k++) c[k] = S2L[ym.data[di + k]];
    const d = mb[i] > 0.05 && Lb[i] > 1e-4 ? Math.min(1.5, Math.max(0.55, lumOf(c) / (Lb[i] / mb[i]))) ** 1.25 : 1;
    if (r.tri[i] >= 0 && texelSurface(r, tris, h.pos, nrm, i, P, Nn)) {
      mask[i] = 1;
      // palette drift: ashen <-> bruised violet <-> sick olive (low frequency), darker and more livid at the
      // extremities (hands, feet, shins), feverish reddish-brown over the face and neck
      const n1 = N.fbm(P[0] * 3 + 7, P[1] * 3, P[2] * 3, 3), n2 = N.fbm(P[0] * 4 - 3, P[1] * 4 + 5, P[2] * 4, 3);
      for (let k = 0; k < 3; k++) col[k] = C.skin[k];
      over(col, C.skinAsh, ss(-0.1, 0.5, n1) * 0.6);
      over(col, C.skinBruise, ss(0.0, 0.5, n2) * 0.4);
      over(col, C.skinOlive, ss(0.0, 0.5, -n2) * 0.5);
      const dh = Math.min(dist(P, hands[0]), dist(P, hands[1]));
      const extr = Math.max(1 - ss(0.06, 0.25, dh), 1 - ss(0.12, 0.5, P[1]));
      over(col, C.livid, extr * 0.55);
      const face = ss(B.neck_01.head.y - 0.02, B.neck_01.head.y + 0.08, P[1]) * ss(-0.2, 0.4, Nn[2]);
      mul(col, [1.1, 0.94, 0.9], face * 0.45);
      for (let k = 0; k < 3; k++) c[k] = col[k] * d;
      // creases and folds of the morphed mesh: a purple pigment shift and only a light darkening (their shadow is
      // the ray-traced occlusion, which goes to the ORM); convex bony areas: tighter, waxier, a touch lighter
      const jz = 1 - 0.85 * jawZone(P);
      const cf = ss(0.15, 1.0, texelAttr(r, tris, cav.fine, i)) * jz;
      const cb = ss(0.1, 1.0, texelAttr(r, tris, cav.broad, i)) * jz;
      mul(c, lin([170, 128, 156]), cf * 0.55);
      kmul(c, 1 - cf * 0.16 - cb * 0.1);
      over(c, C.waxy.map((q) => q * (lumOf(c) / 0.26)), ss(0.15, 0.8, -texelAttr(r, tris, cav.broad, i)) * 0.1);
    } else {
      for (let k = 0; k < 3; k++) c[k] = C.skin[k] * d;
    }
    out.data[di] = toByte(c[0]); out.data[di + 1] = toByte(c[1]); out.data[di + 2] = toByte(c[2]);
  }
  out.mask = mask;
  out.covered = r.covered;
  return out;
}
