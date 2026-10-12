// walker_c — 慢跑屍 "Jogger", female walker. A young woman (~1.66 m, slim, mid-twenties) turned on her morning run:
// faded dusty-rose cropped sports top and black running leggings (female_sportsuit01), one filthy white trainer
// (shoes05) — the right one is gone, that foot is bare, black-soled and torn up — and a phone in a sports armband on
// the left upper arm (cracked, blood-smeared screen). Long, dark, greasy hair (long01) hanging in matted clumps,
// blood-caked at the ends round her face. The CC0 female zombie skin (sohh_female_zombie_skin, skins03, 4096²
// diffuse + bump) graded to a cold ash-grey corpse tone with violet lividity and dark marbled veins.
// Gore: three claw scratches raked diagonally across her left cheek (raw, swollen-edged, beaded and dripping), two
// short ones on the right of the forehead; a torn bite on the right shoulder where the sleeve was ripped away; a bite
// in the left flank of the bare midriff bleeding into the waistband; fresh, wet blood on both hands to mid-forearm
// (she has been feeding), smeared round the mouth and chin and run down the throat into the top; bloody wipe marks
// on the leggings' thighs; a grazed, gravel-scraped left knee inside the ripped-open leggings.
// Silhouette: long hair curtain, cropped top + bare midriff, left legging leg ripped open thigh to shin, one bare foot,
// the armband; head lolled to her right, left shoulder dropped (poseOffsets, applied on top of every clip).
//
// Everything specific to this character is implemented in this file on top of the shared lib, which is only imported
// read-only (UV rasteriser, blur, normal-from-height, hitbox measure, skin-segment table).
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { rasterUV, texelSurface, texelAttr } from '../lib/raster.mjs';
import { blurField, createImage, normalFromHeight } from '../lib/image.mjs';
import { boneSegment } from '../lib/rig.mjs';
import { computeHitboxes } from '../lib/export.mjs';

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
  const sclera = lin([118, 106, 88]), haze = lin([150, 156, 158]), vein = lin([104, 30, 26]);
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
    macro: { gender: 0, age: 0.5, height: 0.74, proportions: 0.65, muscle: 0.45, weight: 0.3, race: { caucasian: 1 } },
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
  // head lolled to her right and pitched up a little (stays readable in the hunched clips), left shoulder dropped,
  // right one hiked (local euler degrees, applied after the mixer)
  const poseOffsets = {
    spine_03: [0, 0, 2], neck_01: [-12, 0, -5], head: [-6, -6, -15], clavicle_l: [0, 0, 8], clavicle_r: [0, 0, -4],
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
  // garment vertices never belong to the head segment (decapitation must not carry the collar away); the hair goes
  // with the head
  for (let v = 0; v < suit.nVerts; v++) if (suit.seg[v] === 1) suit.seg[v] = 0;
  hair.seg.fill(1);
  const cavityGeo = mouthCavity(h, body, A);

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
    w += 0.3 * Math.max(0, 1 - Math.abs(P[1] - 1.06) * 18) * ss(0.0, 0.08, P[2]);                     // top: ragged hem
    w += 0.45 * Math.max(0, 1 - dist(P, flank.p) * 9);                                                 // over the flank bite
    w += 0.3 * (P[2] < -0.04 ? Math.max(0, 1 - Math.hypot(P[0] - 0.06, (P[1] - 1.17) * 1.3) * 9) : 0); // back of the top
    w += 0.25 * (P[2] < -0.02 ? Math.max(0, 1 - dist(P, [-0.1, 0.62, -0.06]) * 10) : 0);              // back of right thigh
    return w;
  };
  for (const v of [...h.hidden]) if (bigTear([h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]]) > 1.0) h.hidden.delete(v);

  // ---- skin: CC0 female zombie skin, graded to a cold ash-grey corpse tone
  const skinSrc = 'skins/sohh_female_zombie_skin/';
  const skinBase = grade(lib.cloneImage(await lib.texture('skins03', skinSrc + 'sohh_Zombie_Female_diffuse.png', 2048)), (c) => {
    const l = lum(c[0], c[1], c[2]);
    const k = 0.5 * Math.max(0.02, l) ** 0.22;
    const g = [l * 0.97, l * 1.0, l * 1.04];
    for (let i = 0; i < 3; i++) c[i] = mix(c[i], g[i], 0.62) * k;
  });
  const skinBump = lib.cloneImage(await lib.texture('skins03', skinSrc + 'sohh_Zombie_Female_bump.png', 2048));
  const baseMask = (() => {
    const W = skinBase.width, bp = h.basePart({ name: 'mask' });
    const r = rasterUV(bp.tris(), h.baseObj.uvs, W, 0);
    return r.covered;
  })();

  const C = {
    muscle: lin([110, 18, 18]), muscleDark: lin([44, 5, 6]), clot: lin([24, 4, 4]), fat: lin([176, 150, 96]),
    rim: lin([150, 104, 104]), vein: lin([46, 40, 64]), puncture: lin([18, 4, 4]),
  };
  const paintShoulderBite = makeBite(N, C, biteSh, biteShN, 0.04, 0.03, { run: 0.26, runW: 1.3, drift: -0.05 });
  const paintFlankBite = makeBite(N, C, flank.p, [0.85, 0, 0.5], 0.032, 0.026, { halo: 2.0, fat: 0.5, clot: 0.15, run: 0.12, runW: 1.2, drift: 0.02, tooth: 0.0038 });

  // claw scratches: three parallel rakes diagonally down her left cheek (from the cheekbone under the eye towards
  // the mouth corner), two short ones on the right side of the forehead (2D on the face front, metres)
  const rakes = [
    { s: [0.074, eyeY + 0.004], e: [0.006, eyeY - 0.07], o: -0.0105, a0: 0.12, a1: 0.86, w: 0.0016 },
    { s: [0.074, eyeY + 0.004], e: [0.006, eyeY - 0.07], o: 0.0, a0: 0.02, a1: 1.0, w: 0.0021 },
    { s: [0.074, eyeY + 0.004], e: [0.006, eyeY - 0.07], o: 0.0105, a0: 0.08, a1: 0.9, w: 0.0018 },
    { s: [-0.012, eyeY + 0.07], e: [-0.05, eyeY + 0.02], o: 0.0, a0: 0.0, a1: 1.0, w: 0.0013 },
    { s: [-0.012, eyeY + 0.07], e: [-0.05, eyeY + 0.02], o: 0.009, a0: 0.15, a1: 0.8, w: 0.0011 },
  ].map((r) => {
    const d = [r.e[0] - r.s[0], r.e[1] - r.s[1]], L = Math.hypot(d[0], d[1]);
    const u = [d[0] / L, d[1] / L], n = [-u[1], u[0]];
    const s = [r.s[0] + n[0] * r.o, r.s[1] + n[1] * r.o];
    // drips: beads of blood that ran straight down from the scratch
    const drips = [];
    for (let k = 0; k < 5; k++) {
      const a = mix(r.a0, r.a1, 0.1 + 0.8 * hash(k * 31 + Math.round(r.o * 1e4) + 7));
      drips.push({ x: s[0] + u[0] * a * L, y: s[1] + u[1] * a * L, len: 0.006 + 0.03 * hash(k * 17 + 3 + Math.round(r.o * 1e4)) ** 1.5, w: r.w * (0.55 + 0.4 * hash(k * 5 + 1)) });
    }
    return { ...r, s, u, n, L, drips };
  });
  const paintScratches = (P, Nn, c, st) => {
    if (P[1] < eyeY - 0.12 || P[1] > eyeY + 0.1 || P[2] < eyeZ - 0.07 || Nn[2] < -0.1) return;
    for (const r of rakes) {
      const qx = P[0] - r.s[0], qy = P[1] - r.s[1];
      const al = (qx * r.u[0] + qy * r.u[1]) / r.L;
      const ac = qx * r.n[0] + qy * r.n[1] + N.noise(al * 18, r.o * 50, 2.2) * 0.0012 + N.noise(al * 60, r.o * 50, 5.1) * 0.0004;
      if (al > r.a0 - 0.08 && al < r.a1 + 0.08) {
        const taper = ss(r.a0 - 0.06, r.a0 + 0.12, al) * (1 - ss(r.a1 - 0.18, r.a1 + 0.05, al));
        const w = r.w * (0.35 + 0.65 * taper) * (0.8 + 0.4 * N.noise(al * 25, r.o * 70, 0.9));
        const a = Math.abs(ac);
        if (a < w * 6) {
          // swollen, inflamed welt round the cut, raw red-black core, dried crust flakes along it
          over(c, lin([118, 62, 66]), (1 - ss(w * 1.2, w * 6, a)) * 0.45 * taper);
          mul(c, [0.72, 0.6, 0.62], (1 - ss(w * 0.8, w * 2.2, a)) * 0.5 * taper);
          const core = (1 - ss(w * 0.35, w, a)) * ss(0.0, 0.3, taper);
          over(c, mix3(lin([96, 12, 12]), lin([30, 6, 5]), ss(-0.3, 0.4, N.noise(al * 40, r.o * 30, 3.3))), core);
          st.h += (1 - ss(w, w * 4, a)) * 0.6 * taper - core * 1.6;
          st.wet = Math.max(st.wet || 0, core * 0.7);
        }
      }
      for (const d of r.drips) {
        const dy = d.y - P[1];
        if (dy < -0.001 || dy > d.len + 0.004) continue;
        const ww = d.w * (1 - 0.4 * dy / d.len) * (1 + 0.8 * Math.exp(-(((dy - d.len) / 0.0025) ** 2)));
        const k = (1 - ss(ww * 0.6, ww, Math.abs(P[0] - d.x - Math.sin(dy * 300) * 0.0004))) * (1 - ss(d.len, d.len + 0.003, dy));
        if (k > 0) { over(c, lin([70, 10, 10]), k * 0.9); st.h += k * 0.2; st.wet = Math.max(st.wet || 0, k * 0.5); }
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
      const edge = 0.58 + N.fbm(P[0] * 14 + side, P[1] * 14, P[2] * 14, 3) * 0.22 + N.noise(P[0] * 60, P[1] * 60, P[2] * 60) * 0.04;
      let k = ss(edge - 0.06, edge + 0.02, f.t);
      // smeared streaks further up the forearm (wiped / run along it)
      const streak = ss(0.55, 0.75, N.noise(P[0] * 30, P[1] * 150, P[2] * 30)) * ss(0.25, edge, f.t) * 0.8;
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
  const hairCol = lin([22, 17, 14]);
  const crustA = lin([70, 20, 16]), crustB = lin([34, 12, 10]);
  const fresh = lin([84, 8, 9]), freshDeep = lin([40, 4, 5]);
  const skin = lib.paintSkin(h, {
    seed: 17,
    base: skinBase,
    bump: skinBump,
    bumpStrength: 5, normalStrength: 2.4,
    pallor: 0.45, tint: lin([150, 156, 160]), mottle: 0.8, veins: 1, bruises: 0.55, socket: 1, lips: 1, grime: 0.55,
    coveredDarken: 0.8,
    blood: { mouth: 1, hands: 0, splatter: 0.15 },
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
        over(c, lin([126, 58, 56]), g * 0.6);
        over(c, lin([60, 10, 10]), g * scr * 0.8);
        over(c, crustB, g * ss(0.2, 0.6, N.fbm(P[0] * 70, P[1] * 70, P[2] * 70, 2)) * 0.7);
        mul(c, [0.4, 0.38, 0.36], g * (1 - ss(0.06, 0.12, N.worley(P[0] * 160, P[1] * 160, P[2] * 160))) * 0.7);
        st.h -= g * scr * 0.6;
      }
      // bare right foot: black sole, filth rising up the foot, cut and bleeding
      if (P[0] < 0 && P[1] < 0.13) {
        const sole = ss(0.25, -0.5, Nn[1]) * (1 - ss(0.015, 0.04, P[1]));
        const dirt = ss(-0.3, 0.5, N.fbm(P[0] * 30, P[1] * 30, P[2] * 30, 3) + (0.09 - P[1]) * 10);
        over(c, lin([34, 28, 23]), Math.max(sole, dirt * 0.75));
        over(c, lin([60, 12, 10]), ss(0.55, 0.8, N.fbm(P[0] * 40 + 3, P[1] * 40, P[2] * 40, 3)) * 0.6);
      }
      paintShoulderBite(P, Nn, c, st);
      paintFlankBite(P, Nn, c, st);
      // fresh blood: hands (wet, glossy), mouth/chin (lib st.bl) -> our own colours
      const hb = handBlood(P);
      const wet = Math.max(hb, st.bl, st.run * 0.8);
      if (wet > 0) {
        const n = N.fbm(P[0] * 50, P[1] * 50, P[2] * 50, 3);
        over(c, mix3(fresh, freshDeep, ss(-0.3, 0.5, n) * 0.8), ss(0.0, 0.45, wet) * 0.93);
        st.ro = mix(st.ro, 0.3, ss(0.2, 0.7, wet));
        st.h += wet * 0.15;
      }
      st.bl = 0;
      if (st.crust > 0) { over(c, mix3(crustA, crustB, ss(-0.4, 0.4, N.noise(P[0] * 80, P[1] * 80, P[2] * 80))), st.crust); st.ro = mix(st.ro, 0.6, st.crust); }
      if (st.wet > 0) st.ro = mix(st.ro, 0.25, st.wet);
    },
  });
  dilate(skin.albedo, baseMask, 16);

  // ---- clothes: recolour (dusty-rose top, charcoal leggings, grey trims), then shred and stain
  const suitDiff = await lib.texture(suit.asset.textures.diffuse, 2048);
  const SM = suitDiff.width;
  const topMask = new Float32Array(SM * SM);
  const suitBase = grade(lib.cloneImage(suitDiff), (c, u, v, a, x, y) => {
    const l = lum(c[0], c[1], c[2]);
    const mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]);
    const sat = mx > 0 ? (mx - mn) / mx : 0;
    const blue = ss(0.25, 0.5, sat) * (c[2] > c[0] ? 1 : 0);
    const orange = ss(0.3, 0.6, sat) * (c[0] > c[2] ? 1 : 0);
    const white = ss(0.3, 0.6, l) * (1 - ss(0.15, 0.3, sat));
    topMask[y * SM + x] = Math.max(blue, orange);
    const k = l / 0.06;
    const rose = [0.32 * k * 0.6, 0.15 * k * 0.6, 0.17 * k * 0.6];
    const out = [c[0], c[1], c[2]];
    // leggings: neutral charcoal
    for (let i = 0; i < 3; i++) out[i] = l * [1.0, 1.0, 1.05][i] * 1.05;
    over(out, rose, blue);
    over(out, lin([46, 44, 46]), orange);
    over(out, lin([110, 108, 104]), white * (1 - blue));
    c[0] = out[0]; c[1] = out[1]; c[2] = out[2];
  });
  const topAt = (u, v) => topMask[Math.min(SM - 1, Math.floor(v * SM)) * SM + Math.min(SM - 1, Math.floor(u * SM))];
  const cloth = lib.paintCloth(suit, {
    seed: 29, human: h,
    base: suitBase,
    normal: await lib.texture(suit.asset.textures.normal, 1024),
    ao: await lib.texture(suit.asset.textures.ao, 1024),
    size: 2048, normalSize: 1024, ormSize: 1024,
    fade: 0.3, grime: 0.9, grimeNoise: 0.9, weave: 0.7, yellow: 0, innerDarken: 0.6,
    blood: { collar: 0, hands: 0, splatter: 0, edges: 0 },
    tear: { amount: 0.36, scale: 6, fray: 0.7, where: tear, threadColor: [0.09, 0.085, 0.085] },
    extra: (P, Nn, c, u, v) => {
      const top = topAt(u, v);
      // blood from the mouth run down the throat and soaked into the neckline / front of the top
      const front = ss(-0.3, 0.3, Nn[2]);
      if (top > 0 && front > 0) {
        const dx = P[0] - A.mouth[0] - 0.008;
        const dy = A.neck[1] - P[1];
        const w = 0.05 * (1 - ss(0.0, 0.18, dy)) + 0.018;
        const wob = N.fbm(P[0] * 12, P[1] * 9, P[2] * 12, 3) * 0.025 + N.fbm(P[0] * 40, P[1] * 40, P[2] * 40, 2) * 0.006;
        const soak = (1 - ss(w - 0.01, w + 0.005, Math.abs(dx + wob))) * (1 - ss(0.15, 0.22, dy + wob * 2)) * ss(-0.05, 0.02, dy);
        const drip = ss(0.5, 0.66, N.noise(P[0] * 140, P[1] * 5, P[2] * 140)) * (1 - ss(0.01, 0.05, Math.abs(dx))) * ss(0.1, 0.18, dy) * (1 - ss(0.2, 0.3, dy));
        const b = Math.max(soak, drip) * front * top;
        over(c, mix3(lin([62, 12, 14]), lin([34, 8, 9]), ss(-0.3, 0.4, N.fbm(P[0] * 20, P[1] * 20, P[2] * 20, 2))), b * 0.9);
        over(c, lin([28, 8, 8]), (1 - ss(0.0, 0.012, Math.abs(Math.abs(dx + wob) - w))) * soak * 0.5 * front);
      }
      // bloody hand wipes on the leggings' thighs (four-finger smears, dragged downwards)
      if (top <= 0 && P[1] > 0.5 && P[1] < 0.85) {
        for (const [cx, cz, side] of [[0.12, 0.08, 1], [-0.11, 0.08, -1], [0.16, -0.02, 1]]) {
          const dxs = (P[0] - cx) * side, dy = 0.8 - P[1];
          if (Math.abs(P[2] - cz) > 0.12 || dy < 0 || dy > 0.22) continue;
          const fingers = Math.abs(Math.sin((dxs + 0.004 * Math.sin(dy * 30)) / 0.0125 * Math.PI));
          const band = 1 - ss(0.025, 0.04, Math.abs(dxs));
          const fade = (1 - ss(0.06, 0.22, dy + N.noise(P[0] * 60, P[1] * 10, 3.1) * 0.03)) * ss(0.0, 0.02, dy);
          const k = band * fade * ss(0.25, 0.6, fingers) * ss(-0.2, 0.3, Nn[2] * (cz > 0 ? 1 : -1) + 0.2);
          over(c, lin([58, 14, 13]), k * 0.75);
        }
      }
      // spatter on the leggings and top (dark drops)
      const sp = 1 - ss(0.06, 0.1, N.worley(P[0] * 40 + 3, P[1] * 40, P[2] * 40));
      over(c, top > 0 ? lin([60, 14, 14]) : lin([40, 10, 10]), sp * ss(0.1, 0.5, N.fbm(P[0] * 3 + 9, P[1] * 3, P[2] * 3, 2) + 0.1) * 0.8);
      // grime: dusty knees (she fell), filthy hems, dirt on the backside / back
      const knee = Math.min(dist(P, [kneeL[0], kneeL[1], kneeL[2] + 0.06]), dist(P, [kneeR[0], kneeR[1], kneeR[2] + 0.06]));
      over(c, lin([74, 66, 56]), (1 - ss(0.03, 0.12, knee)) * ss(-0.3, 0.3, N.fbm(P[0] * 20, P[1] * 20, P[2] * 20, 3)) * 0.6);
      over(c, lin([62, 54, 44]), (1 - ss(0.05, 0.3, P[1])) * ss(-0.3, 0.4, N.fbm(P[0] * 15, P[1] * 15, P[2] * 15, 3)) * 0.6);
    },
  });
  // body faces under intact cloth go away; under holes (and the ripped regions) they stay visible
  h.hideCovered(body, (p) => cloth.holeAt(p, 0.1));
  suit.material = lib.material('cloth', { ...cloth, alpha: cloth.alpha, doubleSided: true, pngBits: 6 });

  // ---- shoe: filthy white trainer, blood spattered; sock grey-brown
  const shoeTex = await lib.texture(shoes.asset.textures.diffuse, 1024);
  const shoeImg = lib.grungeTexture(shoeTex, { seed: 5, darken: 0.45, dirt: 1, blood: 0.45, tint: [0.62, 0.6, 0.56],
    match: (c) => { const l = lum(c[0], c[1], c[2]); for (let i = 0; i < 3; i++) c[i] = mix(c[i], l * [1.04, 1.0, 0.92][i], 0.75); } });
  shoes.material = lib.material('cloth', { albedo: shoeImg, roughness: 0.85 });

  // ---- AO + scalp shadow + cloth shadow baked into the albedos
  const surf = (part) => ({ tris: part.tris(), pos: part.pos, nrm: part.normals() });
  const suitS = surf(suit), hairS = surf(hair), shoeS = surf(shoes);
  const baseSkin = surf(h.basePart({ name: 'ao' }));
  const RA = texSize(512);
  {
    const bvh = occluders([baseSkin, hairS, shoeS]);
    const hairBvh = occluders([hairS]);
    const suitBvh = occluders([suitS]);
    const ao = bakeField(baseSkin, h.baseObj.uvs, RA, aoTracer(bvh, { rays: 16, maxDist: 0.09 }));
    const ray = new THREE.Ray();
    const scalp = bakeField(baseSkin, h.baseObj.uvs, RA, (P, Nn) => {
      if (P[1] < A.neck[1] - 0.02) return 0;
      ray.origin.set(P[0], P[1], P[2]); ray.direction.set(Nn[0], Nn[1], Nn[2]);
      return hairBvh.raycastFirst(ray, THREE.DoubleSide, 0, 0.03) ? 1 : 0;
    }, { fill: 0, blur: 3 });
    const opaque = (q) => cloth.tearField([q.x, q.y, q.z], [0, 0, 1]) <= 0;
    const shadow = bakeField(baseSkin, h.baseObj.uvs, RA, clothShadowTracer(suitBvh, opaque, { rays: 10, maxDist: 0.06 }), { blur: 1 });
    applyFields(skin.albedo, [ao, scalp, shadow], RA, (c, a, s, sh) => {
      over(c, hairCol, s * 0.85);
      const k = mix(1, a, 0.7) * mix(1, sh * sh, 0.8);
      c[0] *= k; c[1] *= k; c[2] *= k;
    });
  }
  {
    const bvh = occluders([suitS, baseSkin, shoeS, hairS]);
    const ao = bakeField(suitS, suit.obj.uvs, RA, aoTracer(bvh, { rays: 16, maxDist: 0.1 }));
    applyFields(cloth.albedo, [ao], RA, (c, a) => { const k = mix(1, a, 0.8); c[0] *= k; c[1] *= k; c[2] *= k; });
  }
  body.material = lib.material('skin', { ...skin });

  // ---- eyes / teeth / hair
  const eyeTex = await lib.texture('system', 'eyes/materials/brown_eye.png', 512);
  const flatOrm = (ao, rough) => createImage(64, 64, [Math.round(ao * 255), Math.round(rough * 255), 0, 255]);
  eyes.material = lib.material('eye', { albedo: deadEyes(eyeTex, N), orm: flatOrm(0.55, 0.4) });
  eyes.extras.noSimplify = true;
  const teethTex = await lib.texture(teeth.asset.textures.diffuse, 512);
  teeth.material = lib.material('teeth', { albedo: lib.grungeTexture(teethTex, { seed: 9, tint: [0.84, 0.7, 0.5], darken: 0.25, dirt: 0.5, blood: 0.8, freq: 14 }), orm: flatOrm(0.55, 0.4) });
  const hairTex = await lib.texture(hair.asset.textures.diffuse, 1024);
  const hairImg = lib.thinHair(hair, lib.grungeTexture(hairTex, { seed: 4, darken: 0.55, dirt: 0.5, blood: 0.2, tint: [0.62, 0.55, 0.5] }), { amount: 0.18, scale: 22, seed: 3 });
  {
    const dark = [20, 16, 14];
    for (let i = 0; i < hairImg.width * hairImg.height; i++) {
      const o = i * 4, a = hairImg.data[o + 3] / 255;
      if (a >= 0.999) continue;
      const k = Math.min(1, (1 - a) * 1.6);
      for (let ch = 0; ch < 3; ch++) hairImg.data[o + ch] = Math.round(mix(hairImg.data[o + ch] * 0.75, dark[ch], k));
    }
  }
  hair.material = lib.material('hair', { albedo: hairImg, alpha: true, roughness: 0.6, doubleSided: true });

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

  return {
    human: h,
    parts: [body, suit, shoes, eyes, teeth, hair, mouth],
    budget: 9000,
    partBudget: { clothes: 2900, shoes: 650, teeth: 400, hair: 1700 },
    extras: { poseOffsets, archetype: 'shambler', gender: 'female', hitboxes, capsules },
    lod1: { budget: 2500, drop: ['teeth', 'eyebrows', 'eyes'], texScale: 0.5, partBudget: { clothes: 800, body: 760, shoes: 120, hair: 480 } },
  };
}
