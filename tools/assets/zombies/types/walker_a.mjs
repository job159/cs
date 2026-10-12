// walker_a — 行屍 / "工裝屍" Shambler, male variant A. Adult man (~1.78 m), gaunt, in shredded, filthy denim work
// overalls (male_worksuit01) over a grimy grey-khaki T-shirt. Main CC0 zombie skin
// (sohh_female_zombie_skin, skins03) graded to a sallow grey-green rotting tone, with the stubble / brow /
// beard-shadow structure of a CC0 male skin transferred onto the head so the face reads as a man. Dead cataract
// eyes under drooping lids, a deep torn bite in the left side of the neck (teeth marks, raw muscle, clotted centre,
// necrotic halo) whose blood has wicked into the collar, shirt and bib as a dried brown crust with gravity runs, a
// split in the scalp line of the forehead bleeding down over the right brow, a gash on the right forearm, a gnawed
// left calf. Greasy, matted dark hair (short04 strand cards) over a dark scalp, loose strands over the forehead.
// Silhouette: right T-shirt sleeve ripped off at the seam (bare, bony arm, ragged armhole), the right overall strap
// snapped (its frayed stub hangs from the bib buckle), left trouser leg shredded away below the knee, a claw hammer
// hanging in the hammer loop on the left thigh, head lolled to one side and the right shoulder dropped (poseOffsets,
// applied on top of every clip).
//
// Everything specific to this character (texture grading, the masculine head transfer, tear regions, the snapped
// strap, the bite / scalp-split painting, the neck-bite blood sheet on the cloth, decay tints, the ray-traced
// ambient-occlusion + scalp-shadow + cloth-shadow bakes, the mouth cavity, the hammer) is implemented here on top of
// the shared lib, which is only imported read-only (UV rasteriser, blur, normal-from-height, hitbox measure).
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { rasterUV, texelSurface, texelAttr } from '../lib/raster.mjs';
import { blurField, createImage, normalFromHeight } from '../lib/image.mjs';
import { boneSegment } from '../lib/rig.mjs';
import { computeHitboxes } from '../lib/export.mjs';

// ---------- small colour helpers (linear-light work, sRGB 8-bit storage)
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
const hash3 = (a, b, s) => hash(Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(s + 1, 83492791));
const texSize = (s) => Math.max(64, Math.round(s * +(process.env.ZOMBIE_TEX_SCALE || 1)));

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

/** Ages painted blood in place: saturated reds -> darker, browner dried blood (keeps a few wet cores). */
function ageBlood(img, amount = 0.6) {
  return grade(img, (c) => {
    const r = c[0], m = Math.max(c[1], c[2]);
    const red = r > 0.004 ? (r - m) / r : 0;
    const k = ss(0.55, 0.92, red) * amount;
    if (k <= 0) return;
    c[0] *= 1 - 0.5 * k; c[1] = mix(c[1], c[0] * 0.22, k * 0.5); c[2] = mix(c[2], c[0] * 0.13, k * 0.5);
  });
}

/**
 * Transfers the hair-shadow structure of a male skin (stubble, beard shadow, eyebrows, sideburns) onto the head island
 * of the (female-made) zombie skin: multiply by maleLum / referenceSkinLum, darkening only. Both skins share the
 * MakeHuman UV layout, so the features line up. Rect = the head island (u 0.62..1, v 0.12..0.86).
 */
function transferMaleHead(base, male, amount = 0.85) {
  const W = base.width;
  const u0 = Math.floor(0.62 * W), u1 = W, v0 = Math.floor(0.12 * W), v1 = Math.floor(0.86 * W);
  const hist = new Float64Array(1024);
  let n = 0;
  for (let y = v0; y < v1; y += 2) for (let x = u0; x < u1; x += 2) {
    const i = (y * W + x) * 4;
    const l = lum(S2L[male.data[i]], S2L[male.data[i + 1]], S2L[male.data[i + 2]]);
    hist[Math.min(1023, Math.floor(l * 1023))]++; n++;
  }
  // reference = 70th percentile (clean skin and the flat background; hair / brows / lips are darker)
  let acc = 0, ref = 0.5;
  for (let k = 0; k < 1024; k++) { acc += hist[k]; if (acc >= n * 0.7) { ref = k / 1023; break; } }
  for (let y = v0; y < v1; y++) for (let x = u0; x < u1; x++) {
    const i = (y * W + x) * 4;
    const l = lum(S2L[male.data[i]], S2L[male.data[i + 1]], S2L[male.data[i + 2]]);
    const r = Math.max(0.22, Math.min(1, l / ref));
    const feather = Math.min(1, (x - u0) / 24, (y - v0) / 24, (v1 - 1 - y) / 24);
    const k = 1 - (1 - r ** 1.25) * amount * feather;
    for (let c = 0; c < 3; c++) base.data[i + c] = toByte(S2L[base.data[i + c]] * k);
  }
  return base;
}

/** Closest point on a bone's head->tail segment: {t (0 head .. 1 tail, unclamped), d (distance), a (axis point)}. */
function boneSeg(bone) {
  const a = [bone.head.x, bone.head.y, bone.head.z], b = [bone.tail.x, bone.tail.y, bone.tail.z];
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  return (P) => {
    const t = ((P[0] - a[0]) * d[0] + (P[1] - a[1]) * d[1] + (P[2] - a[2]) * d[2]) / dd;
    const tc = clamp01(t);
    const ax = [a[0] + d[0] * tc, a[1] + d[1] * tc, a[2] + d[2] * tc];
    return { t, d: Math.hypot(P[0] - ax[0], P[1] - ax[1], P[2] - ax[2]), a: ax };
  };
}

/**
 * Normalised (island-aware) blur of an RGBA image blended in where mask > 0: flattens the stretched streaks of a
 * texture region without bleeding the black outside the UV islands in. cover = Uint8 (1 inside islands).
 */
function blendBlur(img, mask, cover, radius, amount) {
  const W = img.width, H = img.height, n = W * H;
  const cv = new Float32Array(n);
  for (let i = 0; i < n; i++) cv[i] = cover[i];
  const cb = blurField(cv, W, H, radius, 2);
  const ch = new Float32Array(n);
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < n; i++) ch[i] = img.data[i * 4 + c] * cv[i];
    const b = blurField(ch, W, H, radius, 2);
    for (let i = 0; i < n; i++) {
      const m = mask[i] * amount;
      if (m > 0 && cb[i] > 0.05) img.data[i * 4 + c] = Math.round(img.data[i * 4 + c] + (b[i] / cb[i] - img.data[i * 4 + c]) * m);
    }
  }
  return img;
}

// ---------- geometry helpers

/** UV islands of a part: island id per face (union-find over shared UV corners). */
function uvIslands(part) {
  const F = part.obj.faces;
  const par = new Int32Array(part.obj.uvs.length / 2).map((_, i) => i);
  const find = (a) => { while (par[a] !== a) a = par[a] = par[par[a]]; return a; };
  for (const f of F) for (let k = 1; k < f.t.length; k++) { const a = find(f.t[0]), b = find(f.t[k]); if (a !== b) par[a] = b; }
  return F.map((f) => find(f.t[0]));
}

/** Island id per face + 3D bounding box / face count per island. */
function islandInfo(part) {
  const isl = uvIslands(part), P = part.pos;
  const box = new Map();
  part.obj.faces.forEach((f, fi) => {
    let b = box.get(isl[fi]);
    if (!b) box.set(isl[fi], b = { n: 0, min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] });
    b.n++;
    for (const v of f.v) for (let k = 0; k < 3; k++) { b.min[k] = Math.min(b.min[k], P[v * 3 + k]); b.max[k] = Math.max(b.max[k], P[v * 3 + k]); }
  });
  return { isl, box };
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

/** Nearest vertex of the morphed base body to a 3D point -> {p}. */
function nearestSurface(h, T) {
  let best = 1e9, p = T;
  for (const v of h.baseObj.groupVerts('body')) {
    const d = Math.hypot(h.pos[v * 3] - T[0], h.pos[v * 3 + 1] - T[1], h.pos[v * 3 + 2] - T[2]);
    if (d < best) { best = d; p = [h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]]; }
  }
  return { p };
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

/** BVH over explicit triangles [[p0, p1, p2], ...]. */
function bvhOfTriangles(list) {
  const arr = new Float32Array(list.length * 9);
  list.forEach((t, i) => { for (let k = 0; k < 3; k++) for (let a = 0; a < 3; a++) arr[i * 9 + k * 3 + a] = t[k][a]; });
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

/** Cosine-weighted hemisphere directions (z up), `rays` of them. */
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

/** UDN blend of a detail normal map into a base normal map of the same size, weighted per texel by w(i) (0..1). */
function blendNormals(base, detail, w) {
  const d = base.data, e = detail.data;
  for (let i = 0; i < d.length / 4; i++) {
    const k = w(i);
    if (!(k > 0)) continue;
    const o = i * 4;
    const nx = (d[o] / 255) * 2 - 1 + ((e[o] / 255) * 2 - 1) * k, ny = (d[o + 1] / 255) * 2 - 1 + ((e[o + 1] / 255) * 2 - 1) * k, nz = (d[o + 2] / 255) * 2 - 1;
    const l = Math.hypot(nx, ny, nz) || 1;
    d[o] = Math.round((nx / l * 0.5 + 0.5) * 255); d[o + 1] = Math.round((ny / l * 0.5 + 0.5) * 255); d[o + 2] = Math.round((nz / l * 0.5 + 0.5) * 255);
  }
  return base;
}

// ---------- custom geometry -> skinned Part (mouth cavity, hammer)
class Geo {
  constructor() { this.P = []; this.UV = []; this.F = []; this.W = []; }
  v(p, uv, w = null) { this.P.push(p[0], p[1], p[2]); this.UV.push(uv[0], uv[1]); this.W.push(w); return this.P.length / 3 - 1; }
  tri(a, b, c) { this.F.push({ v: [a, b, c], t: [a, b, c], g: 0 }); }
  quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }
  get n() { return this.P.length / 3; }
}

/** Tube through points (outward winding), radius per point, `sides` around; uv rect [u0,v0,u1,v1]; optional end caps. */
function tube(g, pts, radius, sides, uvr, { capStart = false, capEnd = false, flat = 1 } = {}) {
  const n = pts.length, rings = [];
  for (let i = 0; i < n; i++) {
    const T = norm(sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]));
    const ref = Math.abs(T[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
    const B1 = norm(cross(T, ref)), B2 = cross(T, B1);
    const r = Array.isArray(radius) ? radius[i] : radius;
    const ring = [];
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      ring.push(add(pts[i], add(scl(B1, Math.cos(a) * r * flat), scl(B2, Math.sin(a) * r))));
    }
    rings.push(ring);
  }
  const start = g.n;
  rings.forEach((ring, i) => ring.forEach((p, k) => g.v(p, [mix(uvr[0], uvr[2], i / (n - 1)), mix(uvr[1], uvr[3], k / sides)])));
  for (let i = 0; i + 1 < n; i++) for (let k = 0; k < sides; k++) {
    const a = start + i * (sides + 1) + k, b = a + sides + 1;
    g.quad(a, a + 1, b + 1, b);
  }
  const cap = (ring, c, flip) => {
    const ci = g.v(c, [uvr[2], (uvr[1] + uvr[3]) / 2]);
    const vs = ring.slice(0, sides).map((p) => g.v(p, [uvr[2], uvr[1]]));
    for (let k = 0; k < sides; k++) flip ? g.tri(ci, vs[(k + 1) % sides], vs[k]) : g.tri(ci, vs[k], vs[(k + 1) % sides]);
  };
  if (capEnd) cap(rings[n - 1], pts[n - 1], false);
  if (capStart) cap(rings[0], pts[0], true);
}

/** Axis-aligned-frame box: centre, frame axes X/Y/Z (unit), half sizes [hx,hy,hz]; flat faces, outward winding. */
function box(g, c, ax, hs, uvr) {
  const [X, Y, Z] = ax.map((a, i) => scl(a, hs[i]));
  for (const [n, u, v] of [[X, Y, Z], [scl(X, -1), Z, Y], [Y, Z, X], [scl(Y, -1), X, Z], [Z, X, Y], [scl(Z, -1), Y, X]]) {
    const o = add(c, n);
    const q = [sub(sub(o, u), v), sub(add(o, u), v), add(add(o, u), v), add(sub(o, u), v)];
    const ids = q.map((p, k) => g.v(p, [k === 1 || k === 2 ? uvr[2] : uvr[0], k >= 2 ? uvr[3] : uvr[1]]));
    g.quad(ids[0], ids[1], ids[2], ids[3]);
  }
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
 * Dark oral cavity: a skinned "mouth bag" sealed to the lip boundary loop of the body proxy (rim tucked 1.5 mm
 * behind / outside the lip edge, then ballooning back around the teeth and closing at the throat), plus small caps
 * behind the eyelid openings (hidden inside the eyeballs at LOD0, they close the sockets when LOD1 drops the eyes).
 * Every ring vertex is kept >= 2.5 mm inside the head surface. u < 0.5 = cavity, u > 0.5 = eye cap in the texture.
 */
function mouthCavity(h, body, A) {
  const loops = boundaryLoops(body);
  const P = (v) => [body.pos[v * 3], body.pos[v * 3 + 1], body.pos[v * 3 + 2]];
  const cen = (loop) => loop.reduce((a, v) => add(a, scl(P(v), 1 / loop.length)), [0, 0, 0]);
  const near = (c, r) => loops.map((l) => [l, dist(cen(l), c)]).filter(([, d]) => d < r).sort((a, b) => a[1] - b[1])[0]?.[0];
  const mouth = near(A.mouth, 0.035), eyes = [near(A.eyeL, 0.03), near(A.eyeR, 0.03)];
  if (!mouth) throw new Error('walker_a: mouth boundary loop not found');
  const headBvh = occluders([{ pos: body.pos, tris: body.tris() }]);
  const g = new Geo();
  const wOf = (v) => body.weights[v];
  const inside = (p, axis, minD = 0.0025) => {
    // pull towards the cavity axis until safely inside the head
    for (let k = 0; k < 12 && signedDist(headBvh, p) > -minD; k++) p = add(axis, scl(sub(p, axis), 0.85));
    return p;
  };
  const C = cen(mouth);
  const ringDef = [[0.0015, 1, 1, 0.06], [0.012, 1.15, 2.0, 0.22], [0.032, 0.9, 1.5, 0.38]]; // depth, sx, sy, u
  const rings = ringDef.map(([depth, sx, sy, u], ri) => mouth.map((v) => {
    const p = P(v), d = sub(p, C);
    let q;
    if (ri === 0) { const r = norm([d[0], d[1], 0]); q = [p[0] + r[0] * 0.0015, p[1] + r[1] * 0.0015, p[2] - depth]; }
    else q = inside([C[0] + d[0] * sx, C[1] + d[1] * sy, C[2] - depth], [C[0], C[1], C[2] - depth]);
    return g.v(q, [u, 0.5], wOf(v));
  }));
  const apex = g.v(inside([C[0], C[1] - 0.004, C[2] - 0.05], [C[0], C[1], C[2] - 0.045]), [0.46, 0.5], [['head', 1]]);
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
    // run-off: dried streaks below the wound (on surfaces facing roughly like the wound)
    const below = centre[1] - P[1];
    if (below > 0 && below < runLen && dot(Nn, bN) > 0.15) {
      const s = N.noise(P[0] * 130, P[1] * 6, P[2] * 130);
      const band = 1 - ss(BX * 0.6, BX * runW, Math.abs(dot(d, bR) + below * drift));
      st.bl = Math.max(st.bl, ss(0.15, 0.45, s) * band * (1 - below / runLen) * 0.95);
    }
    if (q > haloR) return 0;
    // necrotic halo: the infection spreads from the wound as dark grey-green skin with black-violet veins
    const halo = 1 - ss(0.9, haloR, q);
    mul(c, [0.66, 0.7, 0.54], halo * 0.75);
    const v = N.ridged(P[0] * 70, P[1] * 70, P[2] * 70, 3);
    over(c, C.vein, ss(0.62, 0.9, v) * halo * 0.9);
    st.h += ss(0.62, 0.9, v) * halo * 0.5;
    if (q < 1) {
      // raw crater: muscle fibres running diagonally, clotted black centre, fat flecks at the torn edge
      const inner = 1 - ss(0.0, 0.85, q);
      const fib = N.ridged((ex + ey * 0.5) * 3, (ey - ex * 0.5) * 22, P[2] * 30, 2);
      over(c, C.muscle, 1);
      over(c, C.muscleDark, clamp01(inner * 0.4 + ss(0.45, 0.85, fib) * 0.7 + clotK * 0.3));
      over(c, lin([150, 52, 46]), ss(0.15, 0.0, fib) * (1 - inner) * 0.6 * (1 - clotK));
      over(c, C.clot, ss(0.1, 0.45, N.fbm(P[0] * 90, P[1] * 90, P[2] * 90, 2) + inner * 0.6 - 0.25 + clotK) * 0.95);
      const w = N.worley(P[0] * 260, P[1] * 260, P[2] * 260);
      over(c, C.fat, ss(0.6, 0.95, q) * (1 - ss(0.12, 0.3, w)) * fatK);
      st.h -= 2.4 * (1 - q * q) + fib * 0.4;
      st.ro = 0.3;
    } else if (q < 1.3) {
      // lifted, ragged skin edge (pale, a dark gap under it towards the crater)
      const e = (q - 1) / 0.3;
      over(c, C.rim, (1 - e) * 0.75 * (o.rim ?? 1));
      mul(c, [0.4, 0.3, 0.3], ss(0.0, 0.25, 1 - e) * (1 - ss(0.25, 0.5, 1 - e)) * 0.6);
      st.h += 0.7 * (1 - Math.abs(e - 0.35) / 0.65);
    }
    // tooth punctures: upper and lower arcs just outside the crater
    for (const side of [1, -1]) {
      for (let k = 0; k < 6; k++) {
        const th = (0.2 + k * 0.12) * Math.PI;
        const tx = Math.cos(th) * 1.18, ty = Math.sin(th) * 1.25 * side;
        const dd = Math.hypot((ex - tx) * BX, (ey - ty) * BY);
        const r = (o.tooth ?? 0.0045) + 0.0015 * Math.sin(k * 2.3);
        if (dd < r * 1.8) {
          over(c, C.puncture, (1 - ss(r * 0.5, r, dd)) * 0.95);
          mul(c, [0.55, 0.4, 0.42], (1 - ss(r, r * 1.8, dd)) * 0.6);
          st.h -= (1 - ss(0, r, dd)) * 1.6;
        }
      }
    }
    // crusted edges (not the crater: its muscle / clot stays readable)
    st.bl = Math.max(st.bl, ss(0.85, 1.05, q) * (1 - ss(1.1, 1.8, q + N.noise(P[0] * 90, P[1] * 90, P[2] * 90) * 0.3)) * 0.9);
    return halo;
  };
}

/**
 * Dead cataract eyes on the MakeHuman eye texture (two eyeballs; centres and iris radius measured on brown_eye.png):
 * yellow-grey sclera darkening towards the lids, the cornea filmed over by a grey-white haze that hides the iris (only
 * a faint limbal ring and a soft pupil ghost survive), faint dull veins.
 */
function deadEyes(src, N) {
  const W = src.width, out = createImage(W, src.height);
  const centres = [[0.705, 0.295], [0.29, 0.71]];
  const sclera = lin([108, 98, 76]), haze = lin([118, 119, 113]), vein = lin([92, 40, 32]);
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
      over(c, vein, ss(0.12, 0.35, red) * (1 - ss(0.1, 0.13, 0.25 - d)) * 0.45);
      // cornea: haze over the iris, faint grey limbal ring, soft pupil ghost, a little cloudy swirl
      const cor = 1 - ss(0.108, 0.13, d);
      const hz = [haze[0] * (0.94 + 0.1 * N.noise(cu * 60, cv * 60, 1.1)), haze[1] * (0.94 + 0.1 * N.noise(cu * 60, cv * 60, 1.1)), haze[2] * (0.95 + 0.08 * N.noise(cu * 60, cv * 60, 1.1))];
      over(c, hz, cor);
      mul(c, [0.7, 0.71, 0.74], ss(0.082, 0.1, d) * (1 - ss(0.11, 0.128, d)) * 0.6);
      mul(c, [0.5, 0.51, 0.54], (1 - ss(0.012, 0.066, d)) * 0.8);
      // darker towards the lids and the corners (the eye sits in the socket shadow)
      mul(c, [0.42, 0.4, 0.38], ss(0.13, 0.27, d));
    }
    out.data[i] = toByte(c[0]); out.data[i + 1] = toByte(c[1]); out.data[i + 2] = toByte(c[2]); out.data[i + 3] = 255;
  }
  return out;
}

export async function build(lib) {
  const opts = lib.merge('gaunt', {
    macro: { gender: 1, age: 0.6, height: 0.53, proportions: 0.4, race: { caucasian: 1 } },
    modifiers: {
      // a man's bony head: square jaw, prominent chin, heavy brow ridge over deep-set eyes, hollow temples
      'chin-width-decr-incr': 0.35, 'chin-prominent-decr-incr': 0.25, 'chin-bones-decr-incr': 0.4, 'head/head-square': 0.35,
      'eyebrows-trans-backward-forward': 0.45, 'forehead-temple-decr-incr': -0.5, 'head-age-decr-incr': 0.5,
      'eye-bag-decr-incr': 0.6, 'nose-hump-decr-incr': 0.3, 'mouth-scale-horiz-decr-incr': 0.15,
      'measure-shoulder-dist-decr-incr': 0.2,
    },
    // slack jaw, sneer, heavy brows and half-closed, drooping lids (a dead stare, not a startled one)
    expression: {
      'mouth-open': 0.55, 'mouth-upward-retraction': 0.25, 'eyebrows-left-down': 0.4, 'eyebrows-right-down': 0.4,
      'eye-left-closure': 0.5, 'eye-right-closure': 0.42,
    },
  });
  // The clips (walk_a, attack_a...) already carry a strong zombie hunch, so no extra spine pitch; neck and head pitch
  // the face up (negative X) so it stays readable from a player's eye height in the hunched clips. The silhouette comes
  // from the asymmetry: head lolled to the side, right shoulder dropped, left shoulder hiked (local euler degrees,
  // applied after the mixer).
  const poseOffsets = {
    spine_02: [0, 0, -2], neck_01: [-14, 0, 0],
    head: [-8, 0, 14], clavicle_r: [0, 0, 9], clavicle_l: [0, 0, -4],
  };
  const h = await lib.Human.create(opts);
  const N = lib.makeNoise(77);
  const A = lib.anchors(h);
  const sk = h.skeleton.byName;

  // ---- geometry (bound to the morphed base mesh)
  const body = await h.proxyBody('male1591');
  const suit = await h.fit('clothes/male_worksuit01', { name: 'worksuit', role: 'cloth' });
  const shoes = await h.fit('clothes/shoes01', { name: 'shoes', role: 'cloth' });
  const eyes = await h.fit('eyes/low-poly', { name: 'eyes', role: 'eye', hide: false });
  const teeth = await h.fit('teeth/teeth_base', { name: 'teeth', role: 'teeth', hide: false });
  const hair = await h.fit('hair/short04', { name: 'hair', role: 'hair', hide: false });
  // drooping upper lids (half-lidded dead stare): the eye-closure expression barely moves the proxy's lid edge, so the
  // upper half of each eyelid opening (and the lid skin just above it, with falloff) is lowered by ~1.4 mm directly
  for (const e of [A.eyeL, A.eyeR]) {
    const loop = boundaryLoops(body).map((l) => [l, l.reduce((a, v) => a + Math.hypot(body.pos[v * 3] - e[0], body.pos[v * 3 + 1] - e[1]), 0) / l.length]).sort((a, b) => a[1] - b[1])[0]?.[0];
    if (!loop) continue;
    const xs = loop.map((v) => body.pos[v * 3]), ys = loop.map((v) => body.pos[v * 3 + 1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, hw = (Math.max(...xs) - Math.min(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const top = Math.max(...ys);
    for (let v = 0; v < body.nVerts; v++) {
      const x = body.pos[v * 3], y = body.pos[v * 3 + 1], z = body.pos[v * 3 + 2];
      if (Math.abs(x - cx) > hw + 0.004 || y <= cy + 0.0005 || y > top + 0.012 || z < e[2] - 0.004) continue;
      const f = clamp01(1 - ((x - cx) / (hw + 0.002)) ** 2) * (1 - ss(top, top + 0.011, y));
      body.pos[v * 3 + 1] -= 0.0014 * f;
      body.pos[v * 3 + 2] += 0.0003 * f;
    }
  }
  // the open mouth (and, at LOD1, the eye sockets) would otherwise be see-through: seal them with a dark cavity
  const cavityGeo = mouthCavity(h, body, A);

  // ---- snapped right shoulder strap. The strap island (60 faces running from the bib buckle over the right shoulder
  // to the back) goes, except a ~9 cm stub that flops down and hangs in front of the bib buckle (frayed end painted
  // below). Its original footprint is kept to clean the strap's baked shadow out of the shirt AO.
  const { isl: suitIsl, box: suitBox } = islandInfo(suit);
  const isls = [...suitBox.entries()];
  const strapId = isls.find(([, b]) => b.n < 120 && b.min[1] > 1.28 && b.max[0] < 0 && b.max[1] > 1.5)?.[0];
  const buckleId = isls.find(([, b]) => b.n >= 120 && b.n < 400 && b.min[1] > 1.28 && b.max[0] < 0)?.[0];
  const shirtId = isls.find(([, b]) => b.n > 800 && b.min[1] > 1.0)?.[0];
  if (strapId === undefined || buckleId === undefined || shirtId === undefined) throw new Error('walker_a: worksuit islands not found');
  const yb = suitBox.get(buckleId).max[1], zbk = suitBox.get(buckleId).max[2];
  const strapTris = [];
  const origY = Float32Array.from({ length: suit.nVerts }, (_, v) => suit.pos[v * 3 + 1]);
  const stubV = new Set();
  suit.obj.faces.forEach((f, fi) => {
    if (suitIsl[fi] !== strapId) return;
    const pts = f.v.map((v) => [suit.pos[v * 3], suit.pos[v * 3 + 1], suit.pos[v * 3 + 2]]);
    for (let k = 1; k + 1 < pts.length; k++) strapTris.push([pts[0], pts[k], pts[k + 1]]);
    if (pts.every((p) => p[2] > 0.03 && p[1] < yb + 0.095)) f.v.forEach((v) => stubV.add(v));
    else suit.keep[fi] = 0;
  });
  {
    const shared = new Set();
    suit.obj.faces.forEach((f, fi) => { if (suitIsl[fi] !== strapId && suit.keep[fi]) for (const v of f.v) if (stubV.has(v)) shared.add(v); });
    let ref = -1, best = 1e9;
    for (const v of stubV) { const e = Math.abs(suit.pos[v * 3 + 1] - yb); if (suit.pos[v * 3 + 1] <= yb && e < best) { best = e; ref = v; } }
    const flopped = new Set();
    for (const v of stubV) {
      const e = suit.pos[v * 3 + 1] - yb;
      if (shared.has(v) || e <= 0) continue;
      flopped.add(v);
      suit.pos[v * 3 + 1] = yb - e * 0.93;
      suit.pos[v * 3] += e * 0.08;
      suit.pos[v * 3 + 2] = Math.max(suit.pos[v * 3 + 2], zbk) + 0.006 + e * 0.16;
      if (ref >= 0) { suit.weights[v] = suit.weights[ref]; suit.seg[v] = suit.seg[ref]; }
    }
    // mirroring the stub turned its faces inside out: restore the winding so its normals face away from the bib
    suit.obj.faces.forEach((f, fi) => {
      if (suitIsl[fi] !== strapId || !suit.keep[fi]) return;
      if (f.v.filter((v) => flopped.has(v)).length * 2 >= f.v.length) { f.v.reverse(); f.t.reverse(); }
    });
  }

  // neck bite: on top of the left shoulder where it meets the neck (lit from above, reads from the front); the T-shirt
  // collar is ripped open around it
  const bite = nearestSurface(h, [0.072, 1.525, 0.035]);
  const biteN = [0.5, 0.75, 0.45];
  const BX = 0.046, BY = 0.034; // half axes of the torn-out chunk (m)

  // ---- tear regions (3D, metres). bigTear = whole garment regions ripped away (silhouette); it is also used to
  // un-hide the skin there before painting, so the bare arm / shin are painted as exposed skin, not as the dark
  // "under the cloth" skin that only peeks through small holes.
  const armR = boneSeg(sk.upperarm_r), armL = boneSeg(sk.upperarm_l), calfL = boneSeg(sk.calf_l), thighL = boneSeg(sk.thigh_l);
  const bigTear = (P) => {
    let w = 0;
    // right sleeve: ripped off at the shoulder seam, a ragged armhole; the torso side under the arm stays
    const a = armR(P);
    if (a.d < 0.1 && P[0] < sk.upperarm_r.head.x + 0.03) w = Math.max(w, ss(-0.05, 0.05, a.t + N.fbm(P[0] * 16, P[1] * 16, P[2] * 16, 3) * 0.06) * (1 - ss(0.068, 0.088, a.d)));
    const c = calfL(P); // left trouser leg: shredded off below the knee, the back hangs a little lower than the front
    if (c.d < 0.14) w = Math.max(w, ss(0.08, 0.26, c.t + N.fbm(P[0] * 11 + 5, P[1] * 11, P[2] * 11, 3) * 0.14 + (P[2] - sk.calf_l.head.z) * 0.8));
    // collar ripped open around the neck bite
    const db = dist(P, bite.p) + N.fbm(P[0] * 30, P[1] * 30, P[2] * 30, 3) * 0.02;
    w = Math.max(w, 1 - ss(0.035, 0.07, db));
    return w * 1.3;
  };
  const tear = (P) => {
    const t = thighL(P);
    const kneeR = Math.max(0, 1 - Math.hypot((P[1] - 0.5) * 6, (P[0] + 0.1) * 5)) * 0.32; // right knee worn through
    const thigh = t.d < 0.14 ? ss(0.55, 0.95, t.t) * 0.18 : 0;                          // left thigh frays towards the rip
    const hem = Math.max(0, 1 - P[1] * 5) * 0.3;
    const chest = Math.max(0, 1 - Math.abs(P[1] - 1.3) * 6) * 0.1;
    const belly = Math.max(0, 1 - Math.hypot(P[0] - 0.13, (P[1] - 1.08) * 0.8, P[2] - 0.12) * 9) * 0.5; // over the flank bite
    const back = P[2] < -0.05 ? Math.max(0, 1 - Math.hypot(P[0] + 0.08, (P[1] - 1.25) * 1.4) * 7) * 0.35 : 0; // claw rip
    return bigTear(P) + kneeR + thigh + hem + chest + belly + back;
  };
  for (const v of [...h.hidden]) if (bigTear([h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]]) > 1.1) h.hidden.delete(v);

  // ---- skin: CC0 zombie skin, graded to a sallow, dead grey-olive, male head structure, corpse treatment
  const skinSrc = 'skins/sohh_female_zombie_skin/';
  const male = await lib.texture('system', 'skins/middleage_caucasian_male/middleage_lightskinned_male_diffuse.png', 2048);
  const skinBase = transferMaleHead(grade(lib.cloneImage(await lib.texture('skins03', skinSrc + 'sohh_Zombie_Female_diffuse.png', 2048)), (c) => {
    // the sohh skin is near-white: pull it down to a dead mid-grey with a sick olive-yellow cast, keep its blotches
    const l = lum(c[0], c[1], c[2]);
    const k = 0.43 * Math.max(0.02, l) ** 0.2; // gain + contrast
    const g = [l * 1.0, l * 1.02, l * 0.78];
    for (let i = 0; i < 3; i++) c[i] = mix(c[i], g[i], 0.5) * k;
  }), male, 0.62);
  const skinBump = lib.cloneImage(await lib.texture('skins03', skinSrc + 'sohh_Zombie_Female_bump.png', 2048));
  {
    // lower legs: the sohh legs are stretched into long streaks (read as fur / moss on the bare shin) -> flatten them
    // in both the albedo and the bump with an island-aware blur
    const W = skinBase.width;
    const bp = h.basePart({ name: 'legs' });
    const tr = bp.tris(), nr = bp.normals();
    const r = rasterUV(tr, h.baseObj.uvs, W, 4);
    const mask = new Float32Array(W * W);
    const P = [0, 0, 0], Nn = [0, 0, 0];
    for (let i = 0; i < W * W; i++) if (texelSurface(r, tr, h.pos, nr, i, P, Nn)) mask[i] = 1 - ss(0.5, 0.64, P[1]);
    blendBlur(skinBase, mask, r.covered, Math.max(2, Math.round(W / 400)), 0.55);
    if (skinBump.width === W) blendBlur(skinBump, mask, r.covered, Math.max(2, Math.round(W / 300)), 0.85);
  }

  const handTipL = sk.middle_01_l ? sk.middle_01_l.head : sk.hand_l.tail, handTipR = sk.middle_01_r ? sk.middle_01_r.head : sk.hand_r.tail;
  const knuckles = [[handTipL.x, handTipL.y, handTipL.z], [handTipR.x, handTipR.y, handTipR.z]];
  const C = {
    muscle: lin([104, 20, 18]), muscleDark: lin([46, 6, 7]), clot: lin([22, 5, 4]), fat: lin([176, 150, 96]),
    rim: lin([132, 104, 92]), vein: lin([40, 40, 52]), puncture: lin([18, 4, 4]),
  };
  const paintNeckBite = makeBite(N, C, bite.p, biteN, BX, BY, { run: 0.3, runW: 1.4, drift: 0.08 });
  // gnawed left calf: a compact, dark, clotted bite on the back of the calf (exposed by the shredded trouser leg)
  const calfBite = lib.surfacePoint(h, 'calf_l', 0.5, [0.35, 0, -1]);
  const paintCalfBite = makeBite(N, C, calfBite.p, [0.35, 0, -1], 0.03, 0.023, { halo: 1.9, fat: 0.25, clot: 0.35, run: 0.24, runW: 1.2, drift: 0, tooth: 0.0038, rim: 0.6 });

  // scalp split on the right side of the forehead, ~2.5 cm under the hairline, bleeding down over the right brow
  const gash = lib.surfacePoint(h, 'head', 0.5, [-0.32, 0.08, 1]);
  const runs = [
    { x0: -0.01, len: 0.115, w: 0.0029, ph: 0.0, br: { at: 0.05, slope: 0.3, len: 0.03, w: 0.0012 } },
    { x0: -0.002, len: 0.048, w: 0.0017, ph: 1.7 },
    { x0: 0.008, len: 0.074, w: 0.0022, ph: 3.1, br: { at: 0.028, slope: -0.38, len: 0.022, w: 0.001 } },
    { x0: 0.0145, len: 0.026, w: 0.0013, ph: 4.6 },
  ];
  const runX = (r, run) => r.x0 + Math.sin(run * 40 + r.ph) * 0.0022 + N.noise(run * 30, r.ph, 0.5) * 0.0035 - run * 0.05;
  /** Scalp split: ragged laceration with a clotted centre line and lifted edges; dried runs of uneven width, branching. */
  const paintGash = (P, Nn, c, st) => {
    const dx = P[0] - gash.p[0], dy = P[1] - gash.p[1];
    if (Math.abs(dx) > 0.06 || dy > 0.035 || dy < -0.14 || P[2] < gash.p[2] - 0.09) return;
    const along = dx * 0.8 + dy * 0.6;
    const across = -dx * 0.6 + dy * 0.8 + N.noise(along * 160, 2.1, 0.4) * 0.0012;
    const half = 0.021;
    if (Math.abs(along) < half + 0.004 && Math.abs(across) < 0.014) {
      const taper = 1 - ss(half * 0.55, half, Math.abs(along));
      const w = 0.0034 * taper + 0.0004;
      const a = Math.abs(across);
      const open = 1 - ss(w * 0.6, w, a), core = 1 - ss(w * 0.3, w * 0.6, a);
      over(c, C.muscle, open * 0.9);
      over(c, C.clot, core * 0.95);
      const lip = ss(w * 0.8, w * 1.2, a) * (1 - ss(w * 1.7, w * 3, a)) * taper;
      over(c, C.rim, lip * 0.45);
      st.h += lip * 1.2 - open * 1.9;
      st.ro = mix(st.ro, 0.35, open);
      st.bl = Math.max(st.bl, (1 - ss(w, w * 3.5, a)) * 0.6 * (1 - open));
    }
    if (Nn[2] < 0.05) return;
    for (const r of runs) {
      const run = r.x0 * 0.75 - 0.002 - dy;
      if (run < 0 || run > r.len + 0.04) continue;
      if (run <= r.len + 0.006) {
        const ww = r.w * (0.6 + 0.7 * ss(-0.5, 0.5, N.noise(run * 60, r.ph * 5, 1.9))) * (1 - 0.45 * run / r.len) * (1 + 0.8 * Math.exp(-(((run - r.len) / 0.005) ** 2)));
        const k = (1 - ss(ww * 0.7, ww * 1.3, Math.abs(dx - runX(r, run)))) * (1 - ss(r.len, r.len + 0.005, run));
        if (k > 0) { st.bl = Math.max(st.bl, k * 0.95); st.h += k * 0.3; }
      }
      if (r.br && run > r.br.at) {
        const bl = run - r.br.at;
        if (bl > r.br.len + 0.005) continue;
        const bx = runX(r, r.br.at) + bl * r.br.slope + Math.sin(bl * 90 + r.ph) * 0.001;
        const ww = r.br.w * (1 - 0.5 * bl / r.br.len) * (1 + 0.7 * Math.exp(-(((bl - r.br.len) / 0.004) ** 2)));
        const k = (1 - ss(ww * 0.7, ww * 1.3, Math.abs(dx - bx))) * (1 - ss(r.br.len, r.br.len + 0.004, bl));
        if (k > 0) { st.bl = Math.max(st.bl, k * 0.9); st.h += k * 0.25; }
      }
    }
  };
  // matted loose strands hanging from the hairline onto the forehead, and an irregular fuzz along the hairline, so the
  // straight lower edge of the hair cards is broken up
  const HL0 = 1.742;
  const hairY = (x) => HL0 - 3.2 * x * x;
  // [x at the hairline, length, sideways drift at the tip, root width]: short, soft, tapering matted clumps
  const strands = [[-0.036, 0.026, 0.007, 0.0028], [-0.013, 0.017, -0.004, 0.0024], [0.016, 0.03, 0.008, 0.0026], [0.036, 0.018, -0.005, 0.0022]];
  const hairCol = lin([30, 25, 21]);
  const paintHairline = (P, Nn, c) => {
    if (P[2] < 0.07 || Nn[2] < 0.15 || P[1] < 1.66 || P[1] > 1.765 || Math.abs(P[0]) > 0.068) return;
    const below = hairY(P[0]) - P[1];
    const fz = 0.003 + 0.008 * ss(-0.3, 0.6, N.fbm(P[0] * 90, P[1] * 25, 3.3, 2));
    if (below > -0.01) over(c, hairCol, (1 - ss(fz * 0.35, fz, below)) * 0.65);
    for (const [x0, len, bend, w] of strands) {
      const t = hairY(x0) - P[1];
      if (t < -0.004 || t > len) continue;
      const u = Math.max(0, t) / len;
      const cx = x0 + bend * u * u;
      const ww = w * (1 - 0.72 * u);
      const dx = P[0] - cx;
      const hairs = 0.7 + 0.3 * Math.abs(Math.sin(dx / ww * 7)); // a few hairs inside the clump
      const k = (1 - ss(ww * 0.25, ww, Math.abs(dx))) * (1 - 0.5 * ss(0.6, 1, u));
      over(c, hairCol, k * 0.62 * hairs);
      mul(c, [0.76, 0.74, 0.72], (1 - ss(ww * 0.6, ww * 2.2, Math.abs(dx - 0.0016))) * 0.35 * (1 - k)); // strand shadow
    }
  };
  const eyeY = (A.eyeL[1] + A.eyeR[1]) / 2;
  // dried crust: dark maroon-brown (thin film) to brown-black (thick, flaking); the same on every wound and run
  const crustA = lin([74, 27, 19]), crustB = lin([36, 15, 11]);
  const legTone = (() => { const t = lin([96, 97, 90]); const l = lum(...t); return [t[0] / l, t[1] / l, t[2] / l, l]; })();
  const skin = lib.paintSkin(h, {
    seed: 11,
    base: skinBase,
    bump: skinBump,
    bumpStrength: 5.5, normalStrength: 2.6,
    pallor: 0.5, tint: lin([142, 150, 112]), mottle: 0.85, veins: 0.9, bruises: 0.5, socket: 1, lips: 1, grime: 0.7,
    coveredDarken: 0.85,
    blood: { mouth: 0.8, hands: 0.6, splatter: 0.3 },
    wounds: [
      { bone: 'lowerarm_r', t: 0.45, dir: [0.1, 0.4, 1], r: 0.032, kind: 'gash', depth: 1.8 },
      { bone: 'upperarm_r', t: 0.6, dir: [-0.6, 0, 0.8], r: 0.022, kind: 'bite', depth: 1.5 },
      { bone: 'spine_02', t: 0.4, dir: [0.75, 0, 0.6], r: 0.05, kind: 'bite', depth: 2 },
    ],
    extra: (P, Nn, c, st) => {
      // lower legs: same grey-olive as the forearms (no yellow grime cast), low-contrast mottling instead of streaks
      const leg = 1 - ss(0.5, 0.62, P[1]);
      if (leg > 0) {
        const l = lum(c[0], c[1], c[2]);
        const lc = mix(l, legTone[3] * (0.85 + 0.3 * N.fbm(P[0] * 14, P[1] * 9, P[2] * 14, 3)), 0.35);
        over(c, [legTone[0] * lc, legTone[1] * lc, legTone[2] * lc], leg * 0.8);
        // grey-violet venous marbling and dirt towards the ankle, so the bare shin is not a flat green tube
        over(c, lin([66, 64, 70]), ss(0.6, 0.88, N.ridged(P[0] * 30, P[1] * 12, P[2] * 30, 3)) * leg * 0.45);
        over(c, lin([62, 54, 44]), (1 - ss(0.12, 0.32, P[1])) * ss(-0.3, 0.5, N.fbm(P[0] * 20, P[1] * 20, P[2] * 20, 3)) * leg * 0.6);
      }
      // putrefaction: olive-green blotches + venous marbling on the trunk and upper arms
      const g = N.fbm(P[0] * 5 + 3, P[1] * 5, P[2] * 5, 3);
      const nearBite = 1 - ss(0.03, 0.14, dist(P, bite.p));
      mul(c, [0.78, 0.94, 0.56], clamp01(ss(0.2, 0.65, g) * 0.55 + nearBite * 0.6) * 0.6);
      const trunk = ss(0.95, 1.15, P[1]) * (1 - ss(1.5, 1.6, P[1]));
      const marb = N.ridged(P[0] * 34, P[1] * 22, P[2] * 34, 3);
      over(c, lin([58, 62, 54]), ss(0.7, 0.92, marb) * trunk * ss(-0.2, 0.4, N.fbm(P[0] * 3, P[1] * 3 + 4, P[2] * 3, 2)) * 0.55);
      // face: hollow cheeks under the cheekbones and sunken temples (the AO bake adds sockets, nostrils, mouth)
      if (P[1] > A.neck[1] + 0.05) {
        for (const e of [A.eyeL, A.eyeR]) {
          const side = Math.sign(e[0]);
          const cheek = Math.hypot((P[0] - e[0] * 1.35) / 0.02, (P[1] - (eyeY - 0.055)) / 0.026, (P[2] - (e[2] - 0.03)) / 0.03);
          mul(c, [0.72, 0.7, 0.68], (1 - ss(0.3, 1.3, cheek)) * 0.45);
          const temple = Math.hypot((P[0] - side * 0.068) / 0.02, (P[1] - (eyeY + 0.01)) / 0.03, (P[2] - (e[2] - 0.035)) / 0.03);
          mul(c, [0.76, 0.76, 0.7], (1 - ss(0.4, 1.4, temple)) * 0.45);
        }
        paintHairline(P, Nn, c);
      }
      // dark necrotic fingers (livor pools in the hanging hands) and filthy, cracked nails
      const dk = Math.min(dist(P, knuckles[0]), dist(P, knuckles[1]));
      mul(c, [0.5, 0.46, 0.5], (1 - ss(0.02, 0.09, dk)) * 0.8);
      // dependent lividity: lower legs mottled purple-grey (subtle; grey-olive stays the read)
      mul(c, [0.76, 0.68, 0.8], (1 - ss(0.1, 0.55, P[1])) * ss(0.0, 0.6, N.fbm(P[0] * 9, P[1] * 9, P[2] * 9, 3)) * 0.35);
      paintNeckBite(P, Nn, c, st);
      paintCalfBite(P, Nn, c, st);
      paintGash(P, Nn, c, st);
      // wet, slightly glossy skin around the bite
      st.ro = mix(st.ro, 0.4, nearBite * 0.5);
      // all painted blood (mouth, hands, wounds, runs) becomes our own dried crust: dark brown-maroon with black
      // flakes where it is thick, thin reddish-brown film at the edges, matte; only a hint of the lib's fresh red stays
      if (st.bl > 0) {
        const b = Math.min(1, st.bl);
        const age = ss(-0.45, 0.35, N.noise(P[0] * 22 + 70, P[1] * 22, P[2] * 22));
        const thick = ss(0.45, 0.95, b);
        const col = mix3(crustA, crustB, age);
        const flake = ss(0.55, 0.8, N.noise(P[0] * 160, P[1] * 160, P[2] * 160)) * thick;
        over(c, col, ss(0.0, 0.5, b) * 0.92);
        mul(c, [0.45, 0.4, 0.4], flake * 0.7);
        st.ro = mix(st.ro, mix(0.38, 0.62, age), b);
        st.h += thick * 0.25;
        st.bl = b * 0.1;
      }
    },
  });

  // ---- clothes: grimy dark-washed denim overalls + a grimy grey-khaki T-shirt, shredded, blood-wicked from the bite
  const SC = texSize(2048);
  const suitDiff = await lib.texture(suit.asset.textures.diffuse, 2048);
  const SM = suitDiff.width;
  const shirtMask = new Float32Array(SM * SM);
  const suitBase = grade(lib.cloneImage(suitDiff), (c, u, v, a, x, y) => {
    const l = lum(c[0], c[1], c[2]);
    const mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]);
    const sat = mx > 0 ? (mx - mn) / mx : 0;
    const shirt = ss(0.25, 0.55, l) * (1 - ss(0.12, 0.3, sat)); // the flat white T-shirt island
    shirtMask[y * SM + x] = shirt;
    // denim: wash out the saturated toy blue -> dark, grimy slate denim
    const dn = [l * 0.88, l * 0.98, l * 1.12];
    for (let i = 0; i < 3; i++) c[i] = mix(c[i], dn[i], 0.62) * 0.2;
    // shirt: a dirty grey-khaki cotton (was white); deliberately darker than the face so the head stays the read
    over(c, lin([94, 93, 85]), shirt);
  });
  const shirtAt = (u, v) => shirtMask[Math.min(SM - 1, Math.floor((v + 0.5 / SC) * SM)) * SM + Math.min(SM - 1, Math.floor((u + 0.5 / SC) * SM))];

  // the worksuit AO map was baked with both straps on: lift the right strap's shadow band off the shirt (front + back)
  const suitAO = lib.cloneImage(await lib.texture(suit.asset.textures.ao, 1024));
  {
    const R = suitAO.width;
    const fp = bvhOfTriangles(strapTris);
    const tr = suit.tris(), faceOf = suit._faceOf, nr = suit.normals();
    const r = rasterUV(tr, suit.obj.uvs, R, 4);
    const P = [0, 0, 0], Nn = [0, 0, 0], q = new THREE.Vector3();
    for (let i = 0; i < R * R; i++) {
      if (r.tri[i] < 0 || suitIsl[faceOf[r.tri[i]]] !== shirtId) continue;
      texelSurface(r, tr, suit.pos, nr, i, P, Nn);
      const hit = fp.closestPointToPoint(q.set(P[0], P[1], P[2]), {}, 0, 0.06);
      if (!hit) continue;
      const k = 1 - ss(0.016, 0.045, hit.distance);
      const o = i * 4;
      for (let ch = 0; ch < 3; ch++) suitAO.data[o + ch] = Math.round(mix(suitAO.data[o + ch], 250, k));
    }
  }

  // T-shirt folds (height, -1 valley .. 1 ridge): compression rings on the sleeves, diagonal drag folds from the
  // armpits towards the collar, fine creases
  const foldH = (P) => {
    let h0 = 0, sleeve = 0;
    for (const [seg, sx] of [[armL, 1], [armR, -1]]) {
      const a = seg(P);
      const sw = ss(-0.03, 0.06, a.t) * (1 - ss(0.07, 0.1, a.d)) * (P[0] * sx > 0.13 ? 1 : 0);
      if (sw <= 0) continue;
      sleeve = Math.max(sleeve, sw);
      // irregular, partly diagonal compression folds (not a ribbed cuff): phase warped by low + mid noise, the
      // amplitude comes and goes around the arm
      const ph = a.t * 0.27 / 0.03 * Math.PI * 2 + N.fbm(P[0] * 14, P[1] * 14, P[2] * 14, 3) * 4.5 + (P[2] - a.a[2]) * 40;
      const ring = Math.sin(ph);
      h0 += sw * 0.75 * Math.sign(ring) * Math.abs(ring) ** 0.7 * ss(-0.4, 0.5, N.fbm(P[0] * 16 + 3, P[1] * 16, P[2] * 16, 2));
    }
    const side = P[0] >= 0 ? 1 : -1;
    const ax = -0.62 * side, ay = 0.78;
    const perp = P[0] * ay - P[1] * ax;
    const env = 0.35 + 0.65 * (1 - ss(0.03, 0.17, dist(P, [side * 0.15, 1.33, 0.0])));
    const ph2 = perp / 0.045 * Math.PI * 2 + N.fbm(P[0] * 9, P[1] * 9, P[2] * 9, 3) * 3;
    h0 += Math.sin(ph2) * (0.5 + 0.5 * N.noise(P[0] * 8 + 7, P[1] * 8, P[2] * 8)) * env * (1 - sleeve);
    return h0 + N.fbm(P[0] * 60, P[1] * 25, P[2] * 60, 2) * 0.25;
  };

  /** Neck-bite blood wicked into the shirt / bib: signed soak field (>0 inside) + gravity runs below it. */
  const soakX = (dy) => bite.p[0] - 0.022 - dy * 0.08;
  const soakW = (dy) => 0.06 * (1 - ss(0.0, 0.2, dy)) + 0.03;
  const SOAK = 0.2; // length of the soak below the bite (m): collar, upper chest, over the bib top
  const dripRuns = [[-0.026, 0.075, 0.0046, 0.4], [0.004, 0.14, 0.0058, 1.9], [0.028, 0.05, 0.0036, 3.3], [0.015, 0.095, 0.0042, 5.1]];
  const neckSoak = (P) => {
    const dy = bite.p[1] - P[1];
    if (dy < -0.04 || dy > SOAK + 0.25) return { s: -1, run: 0 };
    // ragged, lobed outline: low-frequency lobes + mid-frequency fringe where the blood wicked along the weave
    const wob = N.fbm(P[0] * 6, P[1] * 4, P[2] * 6, 3) * 0.045 + N.fbm(P[0] * 14 + 3, P[1] * 14, P[2] * 14, 3) * 0.024 + N.fbm(P[0] * 40 + 1, P[1] * 40, P[2] * 40, 2) * 0.008;
    const w = soakW(dy) * (1 + 0.35 * N.fbm(P[1] * 9 + 3, P[0] * 2, 1.7, 2));
    const cxy = soakX(dy) + N.fbm(dy * 8, 1.3, 2.2, 2) * 0.03; // the soak meanders as it runs down
    const sh = (w - Math.abs(P[0] + wob - cxy)) / w;
    const sv = (SOAK - dy - wob * 2.5) / 0.06;
    const s = Math.min(sh, sv);
    // gravity runs from the lower edge of the soak (wicked into the weave: fuzzy, uneven, ending in a blot)
    let run = 0;
    for (const [ox, len, rw, ph] of dripRuns) {
      const t = dy - (SOAK - 0.03);
      if (t < 0 || t > len + 0.012) continue;
      const cx = soakX(SOAK) + N.fbm(SOAK * 8, 1.3, 2.2, 2) * 0.03 + ox + Math.sin(t * 30 + ph) * 0.003 + N.noise(t * 20, ph, 0.3) * 0.004;
      const ww = rw * (0.75 + 0.5 * ss(-0.5, 0.5, N.noise(t * 40, ph * 3, 2.2))) * (1 - 0.35 * t / len) * (1 + 0.7 * Math.exp(-(((t - len) / 0.008) ** 2)));
      const e = Math.abs(P[0] - cx) + N.noise(P[0] * 300, P[1] * 300, ph) * 0.0015;
      run = Math.max(run, (1 - ss(ww * 0.6, ww, e)) * (1 - ss(len, len + 0.01, t)));
    }
    return { s, run };
  };

  // trouser spatter: teardrop drops (round head, tapering tail mostly downwards, satellites), size varies a lot;
  // coordinates = arc length around the nearest leg bone x height
  const legSegs = [thighL, calfL, boneSeg(sk.thigh_r), boneSeg(sk.calf_r)];
  const spatter = (P, Nn) => {
    if (P[1] > 1.18) return 0;
    const dens = clamp01((1 - ss(0.3, 1.0, P[1])) * 0.5 + ss(0.0, 0.6, Nn[2]) * 0.25 + N.fbm(P[0] * 3 + 11, P[1] * 3, P[2] * 3, 2) * 0.35);
    if (dens < 0.05) return 0;
    let s;
    if (P[1] < 0.98) {
      let best = null, bi = 0;
      legSegs.forEach((f, i) => { const r = f(P); if (!best || r.d < best.d) { best = r; bi = i; } });
      s = Math.atan2(P[0] - best.a[0], P[2] - best.a[2]) * 0.075 + bi * 0.37;
    } else s = Math.atan2(P[0], P[2]) * 0.16 + 2.1;
    const t = P[1], cell = 0.04;
    const i0 = Math.floor(s / cell), j0 = Math.floor(t / cell);
    let v = 0;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const ci = i0 + di, cj = j0 + dj;
      if (hash3(ci, cj, 1) > dens * 0.6) continue;
      const cx = (ci + hash3(ci, cj, 2)) * cell, cy = (cj + hash3(ci, cj, 3)) * cell;
      const rad = 0.0016 + 0.0062 * hash3(ci, cj, 4) ** 2.2;
      // flight direction: mostly sideways / downwards, some upwards (cast-off), never all the same
      const ang = -Math.PI / 2 + (hash3(ci, cj, 5) - 0.5) * 3.4;
      const el = 1.8 + hash3(ci, cj, 6) * 3.2;
      const dx = s - cx, dy = t - cy, ca = Math.cos(ang), sa = Math.sin(ang);
      const a = dx * ca + dy * sa, b = -dx * sa + dy * ca;
      let q;
      if (a <= 0) q = Math.hypot(a * 1.1, b) / rad;
      else { const L = rad * el * 1.6; q = a > L ? 9 : Math.abs(b) / (rad * (1 - a / L) ** 2.2 + 1e-5); }
      const qs = Math.hypot(a - rad * el * 2.1, b) / (rad * 0.35);
      const qs2 = Math.hypot(a + rad * 1.9, b - rad * 1.2 * (hash3(ci, cj, 7) - 0.5) * 2) / (rad * 0.28);
      v = Math.max(v, 1 - ss(0.7, 1.0, Math.min(q, qs, qs2) + N.noise(P[0] * 400, P[1] * 400, P[2] * 400) * 0.15));
    }
    return v;
  };

  // (this viewer / the game's lighting render cloth albedo ~1.8x brighter: these read as ~60/25/20 dried crust)
  const soakIn = lin([52, 28, 21]), soakDeep = lin([35, 20, 15]), soakRim = lin([21, 13, 10]), runCol = lin([27, 16, 12]);
  const spatA = lin([42, 21, 15]), spatB = lin([26, 14, 10]);
  const sweat = [0.93, 0.86, 0.66], tide = [0.64, 0.57, 0.46], dust = lin([84, 81, 74]);
  const cloth = lib.paintCloth(suit, {
    seed: 21, human: h,
    base: suitBase,
    normal: await lib.texture(suit.asset.textures.normal, 1024),
    ao: suitAO,
    size: 2048, normalSize: 1024, ormSize: 1024,
    fade: 0.35, grime: 1, grimeNoise: 1.1, weave: 1, yellow: 0, innerDarken: 0.55,
    // all blood on the cloth is painted below (dried, brown; no lib fresh-red collar / dots / tear-edge rims)
    blood: { collar: 0, hands: 0, splatter: 0, edges: 0 },
    tear: { amount: 0.42, scale: 5.5, fray: 0.6, where: tear, threadColor: [0.075, 0.068, 0.058] },
    extra: (P, Nn, c, u, v) => {
      const shirt = shirtAt(u, v);
      if (shirt > 0) {
        // folds: valleys darker, ridges catch a little light
        const fh = foldH(P);
        mul(c, [0.68, 0.68, 0.68], ss(0.1, 0.85, -fh) * shirt);
        mul(c, [1.07, 1.07, 1.07], ss(0.2, 0.8, fh) * shirt);
        // yellowed sweat: collar ring and armpit rings (yellow interior, brown tide line)
        const col = Math.hypot(P[0], (P[1] - 1.525) * 1.6, P[2] - 0.01) + N.fbm(P[0] * 20, P[1] * 20, P[2] * 20, 2) * 0.012;
        mul(c, sweat, (1 - ss(0.075, 0.12, col)) * 0.75 * shirt);
        mul(c, tide, ss(0.095, 0.11, col) * (1 - ss(0.115, 0.13, col)) * 0.5 * shirt);
        for (const sx of [1, -1]) {
          const r = dist(P, [sx * 0.155, 1.33, -0.005]) + N.fbm(P[0] * 18 + sx, P[1] * 18, P[2] * 18, 2) * 0.016;
          mul(c, sweat, (1 - ss(0.045, 0.085, r)) * 0.85 * shirt);
          mul(c, tide, ss(0.07, 0.085, r) * (1 - ss(0.09, 0.105, r)) * 0.65 * shirt);
        }
        // grime: dust settled on the shoulders, darker grime gradient towards the hem
        over(c, dust, ss(0.35, 0.85, Nn[1]) * ss(-0.3, 0.5, N.fbm(P[0] * 8, P[1] * 8, P[2] * 8, 3)) * 0.55 * shirt);
        mul(c, [0.66, 0.62, 0.55], (1 - ss(1.12, 1.36, P[1])) * 0.8 * shirt);
      }
      // dried blood from the neck bite, wicked into the cloth: rust interior with darker clotted patches, a dark
      // brown-black crusted outer rim, a faint pale-brown water halo outside it, gravity runs below
      const { s, run } = neckSoak(P);
      const front = ss(-0.45, 0.2, Nn[2]);
      if (front > 0 && (s > -0.25 || run > 0)) {
        const l = lum(c[0], c[1], c[2]);
        const tex = 0.8 + Math.min(0.4, l * 2.2); // keep a trace of the weave / folds
        if (s > 0) {
          const deep = ss(-0.2, 0.4, N.fbm(P[0] * 16 + 2, P[1] * 12, P[2] * 16, 3) + (1 - (bite.p[1] - P[1]) / SOAK) * 0.25);
          const inner = mix3(soakIn, soakDeep, deep);
          const rim = 1 - ss(0.0, 0.2, s + N.noise(P[0] * 120, P[1] * 120, P[2] * 120) * 0.06);
          const colr = mix3(inner, soakRim, rim * 0.9);
          // patchy: thick crusted islands, thinner stain between them (the cloth shows through a little)
          const cover = mix(0.62, 0.97, ss(-0.3, 0.25, N.fbm(P[0] * 14 + 2, P[1] * 9, P[2] * 14, 3) + (1 - (bite.p[1] - P[1]) / SOAK) * 0.4));
          over(c, [colr[0] * tex, colr[1] * tex, colr[2] * tex], ss(-0.01, 0.07, s) * Math.max(cover, rim) * front);
        } else if (s > -0.25) {
          mul(c, [0.8, 0.68, 0.58], ss(-0.25, -0.02, s) * 0.45 * front);
        }
        if (run > 0) over(c, [runCol[0] * tex, runCol[1] * tex, runCol[2] * tex], run * 0.92 * front);
      }
      // spatter (trousers, low bib): dark brown teardrops
      const sp = spatter(P, Nn);
      if (sp > 0) over(c, mix3(spatA, spatB, ss(-0.3, 0.4, N.noise(P[0] * 50, P[1] * 50, P[2] * 50))), sp * 0.9 * (1 - shirt));
      // ground-in dirt: knees and shins (he has been down on the ground), mud splashes low on the legs
      const knee = Math.min(dist(P, [sk.calf_l.head.x, sk.calf_l.head.y, sk.calf_l.head.z + 0.06]), dist(P, [sk.calf_r.head.x, sk.calf_r.head.y, sk.calf_r.head.z + 0.06]));
      over(c, lin([46, 40, 32]), (1 - ss(0.03, 0.11, knee)) * ss(-0.3, 0.3, N.fbm(P[0] * 20, P[1] * 20, P[2] * 20, 3)) * 0.7);
      const spl = N.worley(P[0] * 45, P[1] * 45, P[2] * 45);
      over(c, lin([40, 34, 27]), (1 - ss(0.1, 0.2, spl)) * (1 - ss(0.15, 0.5, P[1])) * 0.8);
      // greasy, darker oil smears on the thighs (wiped hands), a couple of old soaked stains
      const thighs = (1 - ss(0.0, 0.2, Math.abs(P[1] - 0.82))) * ss(0.0, 0.5, Nn[2]);
      mul(c, [0.6, 0.58, 0.55], thighs * ss(0.1, 0.5, N.fbm(P[0] * 12 + 7, P[1] * 5, P[2] * 12, 3)) * 0.8);
      if (P[1] < 1.0) {
        const stn = N.fbm(P[0] * 4 - 5, P[1] * 4, P[2] * 4, 4);
        over(c, lin([48, 30, 24]), ss(0.46, 0.52, stn) * 0.45);
        mul(c, [0.6, 0.55, 0.52], ss(0.43, 0.46, stn) * (1 - ss(0.47, 0.5, stn)) * 0.5);
      }
    },
  });
  // body faces under intact cloth go away; under holes (and the ripped-off sleeve / trouser leg) they stay visible
  h.hideCovered(body, (p) => cloth.holeAt(p, 0.1));

  const surf = (part) => ({ tris: part.tris(), pos: part.pos, nrm: part.normals() });
  const suitS = surf(suit);
  {
    // torn edges of the denim: a dark brown-grey grimy rim (no orange / red outline), from the tear field itself
    const RT = texSize(1024);
    const tf = bakeField(suitS, suit.obj.uvs, RT, (P, Nn) => cloth.tearField(P, Nn), { fill: -1, blur: 0 });
    const rimCol = lin([44, 39, 34]);
    applyFields(cloth.albedo, [tf], RT, (c, f) => {
      if (f >= 0 || f < -0.06) return;
      const k = 1 - ss(0.0, 0.045, -f);
      over(c, rimCol, k * 0.55);
      mul(c, [0.8, 0.78, 0.76], k * 0.4);
    });
    // frayed end of the strap stub (alpha), threads running along the strap
    const W = cloth.albedo.width;
    const st = [];
    suit.obj.faces.forEach((f, fi) => { if (suitIsl[fi] === strapId && suit.keep[fi]) for (let k = 1; k + 1 < f.v.length; k++) st.push(f.v[0], f.t[0], f.v[k], f.t[k], f.v[k + 1], f.t[k + 1]); });
    const tr = Int32Array.from(st);
    const r = rasterUV(tr, suit.obj.uvs, W, 0);
    for (let i = 0; i < W * W; i++) {
      if (r.tri[i] < 0) continue;
      const oy = texelAttr(r, tr, origY, i) - yb;
      const x = i % W;
      const cut = 0.074 + N.noise(x * 0.31, 3.3, 0.7) * 0.012;
      const thread = hash(x * 7) < 0.35 ? 0.012 * hash(x * 13 + 5) : 0;
      if (oy > cut + thread) cloth.albedo.data[i * 4 + 3] = 0;
      else if (oy > cut - 0.012) { const o = i * 4, k = 0.6 + 0.4 * ss(cut - 0.012, cut, oy); for (let ch = 0; ch < 3; ch++) cloth.albedo.data[o + ch] = Math.round(cloth.albedo.data[o + ch] * (1 - 0.35 * k)); }
    }
    // T-shirt folds in the normal map (UDN-blended into the worksuit's own normal map)
    if (cloth.normal) {
      const NS = cloth.normal.width;
      const nr = rasterUV(suitS.tris, suit.obj.uvs, NS, 3);
      const hf = new Float32Array(NS * NS), wf = new Float32Array(NS * NS);
      const P = [0, 0, 0], Nn = [0, 0, 0];
      for (let i = 0; i < NS * NS; i++) {
        if (!texelSurface(nr, suitS.tris, suitS.pos, suitS.nrm, i, P, Nn)) continue;
        const s = shirtAt((i % NS) / NS, Math.floor(i / NS) / NS);
        if (s <= 0) continue;
        hf[i] = foldH(P) * s; wf[i] = s;
      }
      const fn = normalFromHeight(blurField(hf, NS, NS, 1, 1), NS, NS, 2.2 * NS / 1024);
      blendNormals(cloth.normal, fn, (i) => wf[i]);
    }
  }

  // ---- ray-traced ambient occlusion + scalp shadow + cloth shadow, multiplied into the albedos (the GLB has no AO
  // slot in use for the skin, and a baked contact shadow is what makes folds, collar, sleeves, eye sockets, the
  // hairline and the holes torn into the clothes read).
  const baseSkin = surf(h.basePart({ name: 'ao' }));
  const hairS = surf(hair), shoeS = surf(shoes);
  const RA = texSize(512);
  {
    // (the clothes are left out of the AO: their shadow on the skin is the alpha-aware cloth-shadow bake below)
    const bvh = occluders([baseSkin, hairS, shoeS]);
    const hairBvh = occluders([hairS]);
    const suitBvh = occluders([suitS]);
    const ao = bakeField(baseSkin, h.baseObj.uvs, RA, aoTracer(bvh, { rays: 16, maxDist: 0.09 }));
    const ray = new THREE.Ray();
    const scalp = bakeField(baseSkin, h.baseObj.uvs, RA, (P, Nn) => {
      if (P[1] < A.neck[1]) return 0;
      ray.origin.set(P[0], P[1], P[2]); ray.direction.set(Nn[0], Nn[1], Nn[2]);
      return hairBvh.raycastFirst(ray, THREE.DoubleSide, 0, 0.03) ? 1 : 0;
    }, { fill: 0, blur: 3 });
    const opaque = (q) => cloth.tearField([q.x, q.y, q.z], [0, 0, 1]) <= 0;
    const shadow = bakeField(baseSkin, h.baseObj.uvs, RA, clothShadowTracer(suitBvh, opaque, { rays: 10, maxDist: 0.06 }), { blur: 1 });
    applyFields(skin.albedo, [ao, scalp, shadow], RA, (c, a, s, sh) => {
      over(c, hairCol, s * 0.85);                    // dark scalp (hair roots / shadow) under the hair cards
      const k = mix(1, a, 0.7) * mix(1, sh * sh, 0.85);
      c[0] *= k; c[1] *= k; c[2] *= k;
    });
  }
  {
    const bvh = occluders([suitS, baseSkin, shoeS]);
    const trace = aoTracer(bvh, { rays: 16, maxDist: 0.12 });
    const bb = suitBox.get(buckleId);
    // the hanging strap stub hangs a few mm in front of the bib: only a light contact shadow, not a black strip
    const onStub = (P) => P[2] > bb.max[2] + 0.002 && P[1] < yb + 0.005 && P[0] > bb.min[0] - 0.02 && P[0] < bb.max[0] + 0.02;
    const ao = bakeField(suitS, suit.obj.uvs, RA, (P, Nn, i) => { const a = trace(P, Nn, i); return onStub(P) ? 1 - (1 - a) * 0.35 : a; });
    applyFields(cloth.albedo, [ao], RA, (c, a) => { const k = mix(1, a, 0.85); c[0] *= k; c[1] *= k; c[2] *= k; });
  }
  // dried blood everywhere; no lip-gloss: painted blood on the skin is never shinier than roughness 0.42
  const skinOrm = skin.orm;
  for (let i = 0; i < skinOrm.data.length; i += 4) skinOrm.data[i + 1] = Math.max(skinOrm.data[i + 1], 107);
  body.material = lib.material('skin', { ...skin, albedo: ageBlood(skin.albedo, 0.85) });
  suit.material = lib.material('cloth', { ...cloth, albedo: cloth.albedo, alpha: cloth.alpha, doubleSided: true, pngBits: 6 });

  // ---- shoes: scuffed dark work shoes; the pale sock band becomes a filthy grey-brown sock, darker at the top,
  // the left one soaked from the calf bite
  const shoeTex = await lib.texture(shoes.asset.textures.diffuse, 1024);
  const shoeImg = lib.grungeTexture(shoeTex, { seed: 3, darken: 0.6, dirt: 1, blood: 0.25, tint: [0.42, 0.4, 0.38],
    match: (c) => { const l = lum(c[0], c[1], c[2]); for (let i = 0; i < 3; i++) c[i] = mix(c[i], l * [1.1, 0.98, 0.85][i], 0.7); } });
  {
    const W = shoeImg.width;
    const tr = shoes.tris(), nr = shoes.normals();
    const r = rasterUV(tr, shoes.obj.uvs, W, 3);
    const P = [0, 0, 0], Nn = [0, 0, 0];
    const isSock = (i) => {
      const o = i * 4, s = [S2L[shoeTex.data[o]], S2L[shoeTex.data[o + 1]], S2L[shoeTex.data[o + 2]]];
      const mx = Math.max(...s), mn = Math.min(...s);
      return mx > 0.25 && (mx - mn) / mx < 0.22;
    };
    const top = [0, 0];
    for (let i = 0; i < W * W; i++) if (texelSurface(r, tr, shoes.pos, nr, i, P, Nn) && isSock(i)) { const f = P[0] > 0 ? 0 : 1; top[f] = Math.max(top[f], P[1]); }
    const sock = lin([70, 64, 55]);
    const c = [0, 0, 0];
    for (let i = 0; i < W * W; i++) {
      if (!texelSurface(r, tr, shoes.pos, nr, i, P, Nn) || !isSock(i)) continue;
      const o = i * 4;
      const l = lum(S2L[shoeTex.data[o]], S2L[shoeTex.data[o + 1]], S2L[shoeTex.data[o + 2]]);
      const rib = Math.min(1.25, l / 0.55);
      const n = N.fbm(P[0] * 40, P[1] * 40, P[2] * 40, 3);
      for (let k = 0; k < 3; k++) c[k] = sock[k] * rib * (0.85 + 0.25 * n);
      const tp = top[P[0] > 0 ? 0 : 1];
      mul(c, [0.5, 0.46, 0.42], ss(tp - 0.05, tp - 0.005, P[1]) * 0.8);          // grimy top band
      over(c, lin([46, 38, 30]), ss(0.0, 0.5, N.fbm(P[0] * 18 + 4, P[1] * 18, P[2] * 18, 3)) * 0.45); // mud
      if (P[0] > 0) over(c, mix3(crustA, crustB, 0.5), ss(0.0, 0.4, -Nn[2] + N.noise(P[0] * 60, P[1] * 15, P[2] * 60) * 0.5) * ss(tp - 0.08, tp, P[1]) * 0.85); // calf-bite blood
      shoeImg.data[o] = toByte(c[0]); shoeImg.data[o + 1] = toByte(c[1]); shoeImg.data[o + 2] = toByte(c[2]);
    }
  }
  shoes.material = lib.material('cloth', {
    albedo: shoeImg,
    normal: shoes.asset.textures.normal ? await lib.texture(shoes.asset.textures.normal, 512) : null,
    roughness: 0.88,
  });

  // ---- eyes / teeth / hair
  const eyeTex = await lib.texture('system', 'eyes/materials/brown_eye.png', 512);
  // eyes and teeth sit in the socket / mouth shadow: an occlusion term in their ORM keeps the environment light from
  // lighting them up like the open skin (without it the dull cataract renders as a bright white disc); dull film
  const flatOrm = (ao, rough) => createImage(64, 64, [Math.round(ao * 255), Math.round(rough * 255), 0, 255]);
  eyes.material = lib.material('eye', { albedo: deadEyes(eyeTex, N), orm: flatOrm(0.5, 0.45) });
  const teethTex = await lib.texture(teeth.asset.textures.diffuse, 512);
  teeth.material = lib.material('teeth', { albedo: lib.grungeTexture(teethTex, { seed: 9, tint: [0.8, 0.62, 0.38], darken: 0.3, dirt: 0.6, blood: 0.5, freq: 14 }), orm: flatOrm(0.55, 0.45) });
  // greasy, matted, dark hair with a few mangy gaps; combed-out strand gaps at the sides / temples (scalp shows);
  // the transparent texels get the hair colour so filtering never pulls the white card background into the edges
  const hairTex = await lib.texture(hair.asset.textures.diffuse, 1024);
  const hairImg = lib.thinHair(hair, lib.grungeTexture(hairTex, { seed: 4, darken: 0.2, dirt: 0.45, blood: 0.15, tint: [0.92, 0.84, 0.74] }), { amount: 0.1, scale: 26, seed: 2 });
  {
    const W = hairImg.width;
    const tr = hair.tris(), nr = hair.normals();
    const r = rasterUV(tr, hair.obj.uvs, W, 2);
    const P = [0, 0, 0], Nn = [0, 0, 0];
    for (let i = 0; i < W * W; i++) {
      if (!texelSurface(r, tr, hair.pos, nr, i, P, Nn)) continue;
      const sideW = ss(0.045, 0.07, Math.abs(P[0])) * (1 - ss(1.74, 1.79, P[1]));
      const temple = (1 - ss(0.012, 0.035, Math.abs(P[1] - 1.71))) * ss(0.04, 0.058, Math.abs(P[0])) * ss(0.0, 0.05, P[2]);
      const w = Math.min(1, sideW * 0.8 + temple);
      if (w <= 0) continue;
      const comb = N.noise(Math.atan2(P[2], P[0]) * 75, P[1] * 7, 1.3) + N.noise(Math.atan2(P[2], P[0]) * 190, P[1] * 15, 4.1) * 0.4;
      if (comb > 0.5 - 0.45 * w) hairImg.data[i * 4 + 3] = 0;
    }
    const dark = [26, 22, 19];
    for (let i = 0; i < W * hairImg.height; i++) {
      const o = i * 4, a = hairImg.data[o + 3] / 255;
      if (a >= 0.999) continue;
      const k = Math.min(1, (1 - a) * 1.6);
      for (let ch = 0; ch < 3; ch++) hairImg.data[o + ch] = Math.round(mix(hairImg.data[o + ch] * 0.75, dark[ch], k));
    }
  }
  hair.material = lib.material('hair', { albedo: hairImg, alpha: true, roughness: 0.72, doubleSided: true });
  eyes.extras.noSimplify = true;

  // ---- mouth cavity (+ LOD1 eye-socket caps): near-black flesh, darkest down the throat; dull grey-yellow eye caps
  const cavTex = createImage(64, 64, [0, 0, 0, 255]);
  grade(cavTex, (c, u) => {
    if (u < 0.5) { const k = ss(0.06, 0.42, u); const a = lin([52, 18, 15]), b = lin([9, 4, 4]); for (let i = 0; i < 3; i++) c[i] = mix(a[i], b[i], k); }
    else { const e = lin([104, 98, 80]); for (let i = 0; i < 3; i++) c[i] = e[i]; }
  });
  const mouth = toPart(lib, h, cavityGeo, 'mouth', 'gore', () => [['head', 1]]);
  mouth.material = lib.material('gore', { albedo: cavTex, roughness: 0.85, doubleSided: true });

  // ---- claw hammer in the hammer loop on the outer left thigh (unique read at 15-20 m; rigid on thigh_l)
  const hammer = (() => {
    let S = null;
    for (let v = 0; v < suit.nVerts; v++) {
      const p = [suit.pos[v * 3], suit.pos[v * 3 + 1], suit.pos[v * 3 + 2]];
      if (Math.abs(p[1] - 0.86) < 0.025 && Math.abs(p[2] + 0.015) < 0.03 && p[0] > 0 && (!S || p[0] > S[0])) S = p;
    }
    if (!S) S = [0.2, 0.86, -0.015];
    const ax = norm(sub([sk.thigh_l.tail.x, sk.thigh_l.tail.y, sk.thigh_l.tail.z], [sk.thigh_l.head.x, sk.thigh_l.head.y, sk.thigh_l.head.z])); // down the thigh
    const L = [S[0] + 0.017, S[1], S[2]];       // loop centre (handle passes through it)
    const E = add(L, scl(ax, -0.034));          // hammer eye / head centre, resting on the loop
    const g = new Geo();
    const fwd = norm(sub([0, 0, 1], scl(ax, ax[2]))), side = norm(cross(scl(ax, -1), fwd)); // head axis (front-back), lateral
    // handle: hickory, slight flare at the grip
    const hp = [-0.012, 0.05, 0.15, 0.25, 0.29].map((s) => add(E, scl(ax, s)));
    tube(g, hp, [0.0115, 0.012, 0.013, 0.0142, 0.0152], 5, [0.02, 0.0, 0.44, 1], { capEnd: true });
    // head: eye block, round striking face (back), curved claw (front)
    box(g, E, [side, scl(ax, -1), fwd], [0.0125, 0.017, 0.015], [0.52, 0.0, 0.74, 0.5]);
    tube(g, [add(E, scl(fwd, -0.012)), add(E, scl(fwd, -0.032)), add(E, scl(fwd, -0.046))], [0.012, 0.0135, 0.0142], 6, [0.52, 0.5, 0.74, 1], { capEnd: true });
    const up = scl(ax, -1);
    tube(g, [add(E, add(scl(fwd, 0.012), scl(up, 0.004))), add(E, add(scl(fwd, 0.04), scl(up, 0.002))), add(E, add(scl(fwd, 0.066), scl(up, -0.012))), add(E, add(scl(fwd, 0.08), scl(up, -0.032)))],
      [0.0105, 0.0085, 0.0058, 0.0022], 4, [0.76, 0.0, 0.98, 0.5], { flat: 0.55 });
    // the loop: a short flattened band around the handle
    tube(g, [add(L, scl(ax, -0.012)), add(L, scl(ax, 0.012))], 0.0185, 6, [0.76, 0.55, 0.98, 1], { flat: 0.8 });
    return toPart(lib, h, g, 'hammer', 'gear', () => [['thigh_l', 1]]);
  })();
  {
    const W = texSize(256);
    const alb = createImage(W, W, [0, 0, 0, 255]), orm = createImage(W, W, [255, 200, 0, 255]);
    const wood = lin([46, 40, 34]), steel = lin([58, 58, 60]), rust = lin([74, 46, 32]), leather = lin([44, 36, 30]);
    const c = [0, 0, 0];
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W, v = 1 - (y + 0.5) / W, o = (y * W + x) * 4;
      let ro = 0.8, me = 0;
      if (u < 0.48) {
        // wood: grain along the handle, greasy dark grip, dried blood that ran down from the head
        const grain = N.noise(u * 6, v * 60, 0.5) * 0.5 + N.noise(u * 20, v * 140, 1.5) * 0.25;
        for (let k = 0; k < 3; k++) c[k] = wood[k] * (0.85 + 0.3 * grain);
        mul(c, [0.55, 0.52, 0.5], ss(0.28, 0.42, u) * 0.8);
        over(c, crustB, ss(0.1, 0.45, N.fbm(u * 8, v * 3, 2.2, 3) - u * 2.2 + 0.25) * 0.9);
        ro = 0.7;
      } else if (u < 0.75 || v < 0.5) {
        // forged steel: dark, scratched, rust blooms, blood crust on the striking face / claw
        const n = N.fbm(u * 18, v * 18, 4.4, 3);
        for (let k = 0; k < 3; k++) c[k] = steel[k] * (0.8 + 0.35 * N.noise(u * 90, v * 20, 0.2));
        const rs = ss(0.15, 0.55, n);
        over(c, rust, rs * 0.85);
        const bl = ss(0.2, 0.6, N.fbm(u * 10 + 3, v * 10, 7.7, 3));
        over(c, crustB, bl * 0.8);
        me = 0.9 * (1 - rs) * (1 - bl); ro = mix(0.42, 0.9, Math.max(rs, bl));
      } else {
        for (let k = 0; k < 3; k++) c[k] = leather[k] * (0.85 + 0.3 * N.noise(u * 40, v * 40, 9.1));
        ro = 0.9;
      }
      alb.data[o] = toByte(c[0]); alb.data[o + 1] = toByte(c[1]); alb.data[o + 2] = toByte(c[2]);
      orm.data[o + 1] = Math.round(clamp01(ro) * 255); orm.data[o + 2] = Math.round(clamp01(me) * 255);
    }
    hammer.material = lib.material('gear', { albedo: alb, orm });
  }

  // ---- hitboxes: the exporter's percentile radii are polluted by the loose sleeve / shirt verts on the arms; arms
  // and hands are measured on the naked base mesh instead (clamped), hands become wrist->knuckle capsules
  const allHb = computeHitboxes(h, [body, suit, shoes, hair, eyes, teeth].map((p) => p.toRender()));
  const bodyHb = computeHitboxes(h, [h.basePart({ name: 'hb' }).toRender()]);
  const hitboxes = { ...allHb.hitboxes }, capsules = { ...allHb.capsules };
  const setHb = (key, bone, r, to) => {
    r = +r.toFixed(3);
    hitboxes[key] = to ? [bone, r, to] : [bone, r];
    const b = sk[bone], e = to ? sk[to].head : b.tail;
    capsules[key] = { bone, radius: r, length: +b.head.distanceTo(e).toFixed(3), ...(to ? { to } : {}) };
  };
  setHb('upperarm_l', 'upperarm_l', Math.min(0.062, Math.max(0.058, bodyHb.hitboxes.upperarm_l[1] + 0.008)));
  setHb('upperarm_r', 'upperarm_r', Math.min(0.058, Math.max(0.055, bodyHb.hitboxes.upperarm_r[1])));
  setHb('lowerarm_l', 'lowerarm_l', Math.min(0.048, Math.max(0.036, bodyHb.hitboxes.lowerarm_l[1])));
  setHb('lowerarm_r', 'lowerarm_r', Math.min(0.048, Math.max(0.036, bodyHb.hitboxes.lowerarm_r[1])));
  setHb('hand_l', 'hand_l', 0.045, 'middle_01_l');
  setHb('hand_r', 'hand_r', 0.045, 'middle_01_r');

  return {
    human: h,
    parts: [body, suit, shoes, eyes, teeth, hair, mouth, hammer], // eyebrows / stubble: painted into the skin (male head transfer)
    budget: 9000,
    partBudget: { worksuit: 3700, shoes: 600, teeth: 400, hair: 1000 },
    extras: { poseOffsets, archetype: 'shambler', gender: 'male', hitboxes, capsules },
    // LOD1 drops the teeth and eyeballs: the mouth cavity + eye-socket caps (part 'mouth') stay and keep it sealed
    lod1: { budget: 2500, drop: ['teeth', 'eyebrows', 'eyes'], texScale: 0.5, partBudget: { worksuit: 960, body: 820, shoes: 140, hair: 270 } },
  };
}
