// screamer — 尖嘯者 Screamer / shaman (game/src/zombies/defs.js `screamer`: keeps its distance, screams to slow the
// players and heals / hastes the zombies round it). A tall (~1.8 m), bone-thin elder woman: long neck, long forearms,
// long thin fingers ending in black horn claws, a hooked nose, sunken cheeks, the jaw hanging open in a scream and
// the neck strained (platysma); she stoops, shoulders up, head craned forward out of a deep hood.
// Clothes: a hooded shoulder mantle of faded plum wool (procedural: two hood panels sewn up the back over a short
// peak, a rolled rim framing the face, the mantle marched down over the shoulders and torn into tatters), over a
// long ash-brown wool coat: the CC0 male_casualsuit05 field jacket (jeans dropped, collar band removed, sleeves torn
// off ragged above the wrists, patched, holed, its inner shirt repainted as a sallow linen shift) lengthened into a
// coat by a procedural skirt tucked under its hem down to mid-calf (hung from the hips, flared, folded, a front slit
// below the knee and a back vent, the hem torn into strips), cinched at the hips by a rust-red cloth sash knotted on
// the left with two hanging ends; the lower bellows pockets flattened and painted out (a stitched glyph charm on the
// right, a wrapped rag on the left), her weeping-eye glyph daubed on the back. A dark wool under-shift over the hips
// and thighs (frayed above the knees), bare, filthy feet. The skirt panels follow the thigh behind them (eased in from
// the hip joint, calves below the knee); the hidden hips / upper thighs inside the skirt are dropped.
// Skin: corpse-pale grey (CC0 old caucasian female skin, graded; the CC0 sohh zombie bump for the decayed surface)
// with dark violet-black ritual markings drawn along the veins: branching tear-veins from the lower lids down the
// cheeks, a forehead sigil (ring + vertical stroke) rising from the inner brows, chin lines, a ringed throat sigil
// with radiating veins (faint violet glow at the throat and eyes, emissive), lines down the backs of the fingers
// converging on the back of the hand, double wrist rings and veins up the forearms. Violet glowing eyes. Long lank
// grey hair hangs out of the hood in strand cards over the cheeks and the mantle (centre-parted under the brim).
// Fetishes: a cord necklace with finger bones and a carved bone disc whose sigil glows violet; three bones and a
// leather pouch hang off the sash.
//
// Everything specific to this character lives in this file; the shared lib is only imported (UV raster, blur,
// normal-from-height, rig segments, hitbox measure). Implemented here: the coat conversion (UV-island classification,
// island removal), the procedural skirt / hood / mantle / sash / hair cards / nails / fetishes with their own UVs
// and skinning (closest-skin barycentric weights, skirt pelvis->thigh blend, hood head->neck blend), the painters
// (coat, drape, hair, gear) and the ray-traced AO (ORM occlusion only — never multiplied into the base colour).
// The drape atlas is exported as two meshes: 'mantle' (hood + mantle, never simplified) and 'skirt' (skirt + sash).
// Alpha-masked albedos go through finishAlbedo (island background filled, torn texels keep their colour, pngBits 8):
// black there averaged the tatters to black in the mips / LOD1.
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { rasterUV, texelSurface } from '../lib/raster.mjs';
import { blurField, createImage, normalFromHeight, resize } from '../lib/image.mjs';
import { boneSegment } from '../lib/rig.mjs';
import { computeHitboxes } from '../lib/export.mjs';

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
const madd = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const over = (c, col, a) => { if (!(a > 0)) return; a = Math.min(1, a); for (let k = 0; k < 3; k++) c[k] += (col[k] - c[k]) * a; };
const mul = (c, col, a) => { if (!(a > 0)) return; a = Math.min(1, a); for (let k = 0; k < 3; k++) c[k] *= 1 + (col[k] - 1) * a; };
const hash = (i) => { let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
const texSize = (s) => Math.max(64, Math.round(s * +(process.env.ZOMBIE_TEX_SCALE || 1)));
const V = (v) => [v.x, v.y, v.z];
const dirYP = (yaw, pitch) => { const y = yaw * Math.PI / 180, p = pitch * Math.PI / 180; return [Math.cos(p) * Math.sin(y), Math.sin(p), Math.cos(p) * Math.cos(y)]; };
const TAG = '  screamer:';

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

/** Closest point on a bone's head->tail segment: {t (0 head .. 1 tail, unclamped), d, a (axis point), L}. */
function boneSeg(bone) {
  const a = V(bone.head), b = V(bone.tail);
  const d = sub(b, a), dd = dot(d, d), L = Math.sqrt(dd);
  return (P) => {
    const t = ((P[0] - a[0]) * d[0] + (P[1] - a[1]) * d[1] + (P[2] - a[2]) * d[2]) / dd;
    const tc = clamp01(t);
    const ax = [a[0] + d[0] * tc, a[1] + d[1] * tc, a[2] + d[2] * tc];
    return { t, d: Math.hypot(P[0] - ax[0], P[1] - ax[1], P[2] - ax[2]), a: ax, L };
  };
}

/** Distance from p to segment ab (any dimension 2/3) and the parameter along it. */
function segDist(p, a, b) {
  let dd = 0, t = 0;
  for (let k = 0; k < a.length; k++) { dd += (b[k] - a[k]) ** 2; t += (p[k] - a[k]) * (b[k] - a[k]); }
  t = dd ? clamp01(t / dd) : 0;
  let e = 0;
  for (let k = 0; k < a.length; k++) e += (p[k] - a[k] - (b[k] - a[k]) * t) ** 2;
  return [Math.sqrt(e), t];
}
/** Distance to a polyline -> [d, s (0..1 along it)]. */
function polyDist(p, pts) {
  let best = 1e9, bs = 0, acc = 0;
  const L = [];
  let tot = 0;
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(...pts[i].map((x, k) => x - pts[i - 1][k])); L.push(l); tot += l; }
  for (let i = 1; i < pts.length; i++) {
    const [d, t] = segDist(p, pts[i - 1], pts[i]);
    if (d < best) { best = d; bs = (acc + t * L[i - 1]) / (tot || 1); }
    acc += L[i - 1];
  }
  return [best, bs];
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

// ---------- BVH over triangle soups [{pos, tris}] (tris = Part.tris() layout)
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
  const tmp = new THREE.Vector3();
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
      const r = bvh.closestPointToPoint(tmp.set(p[0], p[1], p[2]), {});
      return r ? { p: V(r.point), n: faceN(r.faceIndex), d: r.distance, fi: srcTri(r.faceIndex) } : null;
    },
  };
}

// ---------- texture-space fields
/** Evaluates fn(P, N, i) for every texel of a UV raster at R x R; texels outside the islands stay `fill`. */
function bakeField(surf, uvs, R, fn, { fill = 1, blur = 1 } = {}) {
  const r = rasterUV(surf.tris, uvs, R, 4);
  const out = new Float32Array(R * R).fill(fill);
  const P = [0, 0, 0], Nn = [0, 0, 0];
  for (let i = 0; i < R * R; i++) if (texelSurface(r, surf.tris, surf.pos, surf.nrm, i, P, Nn)) out[i] = fn(P, Nn, i);
  return blur ? blurField(out, R, R, blur, 1) : out;
}
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
/** Ray-traced ambient occlusion (cosine-weighted, distance-attenuated) -> fn(P, N, i) for bakeField. */
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
function fieldAt(f, R, W, x, y) {
  const fx = Math.max(0, Math.min(R - 1.001, (x + 0.5) * R / W - 0.5)), fy = Math.max(0, Math.min(R - 1.001, (y + 0.5) * R / W - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, i = y0 * R + x0;
  return (f[i] * (1 - tx) + f[i + 1] * tx) * (1 - ty) + (f[i + R] * (1 - tx) + f[i + R + 1] * tx) * ty;
}
/** Multiplies the ORM occlusion (R) channel by fn(...field values). AO lives ONLY here, never in the albedo. */
function applyOcclusion(orm, fields, R, fn) {
  const W = orm.width, vals = new Array(fields.length);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    for (let k = 0; k < fields.length; k++) vals[k] = fieldAt(fields[k], R, W, x, y);
    const i = (y * W + x) * 4;
    orm.data[i] = Math.round(orm.data[i] * clamp01(fn(...vals)));
  }
  return orm;
}
/** Applies fn(c linear rgb, ...values) to every texel of img with the baked fields sampled there. */
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
/** Box-downsample of a float field S x S -> D x D (ch channels). */
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
/** UDN blend of a detail normal map into a base normal map (both RGB tangent space, same size). */
function blendNormals(base, detail, w = 1) {
  const out = createImage(base.width, base.height, [128, 128, 255, 255]);
  for (let i = 0; i < base.width * base.height; i++) {
    const bx = base.data[i * 4] / 127.5 - 1, by = base.data[i * 4 + 1] / 127.5 - 1, bz = base.data[i * 4 + 2] / 127.5 - 1;
    const dx = (detail.data[i * 4] / 127.5 - 1) * w, dy = (detail.data[i * 4 + 1] / 127.5 - 1) * w;
    const n = norm([bx + dx, by + dy, Math.max(0.05, bz)]);
    out.data[i * 4] = Math.round((n[0] * 0.5 + 0.5) * 255); out.data[i * 4 + 1] = Math.round((n[1] * 0.5 + 0.5) * 255); out.data[i * 4 + 2] = Math.round((n[2] * 0.5 + 0.5) * 255);
  }
  return out;
}

/**
 * Paints a part through its own UV raster. fn(P, N, st, u, v, i) sets st.c (linear rgb), st.h (height), st.ro
 * (roughness), st.a (alpha, < 0.5 = cut), st.e (emissive rgb). -> { albedo, normal, orm, emissiveMap, alpha, S }
 */
function paintPart(part, o, fn) {
  const S = texSize(o.size);
  const tris = part.tris(), nrm = part.normals();
  const r = rasterUV(tris, part.obj.uvs, S, o.pad ?? 6);
  const albedo = createImage(S, S, [0, 0, 0, 255]);
  const H = new Float32Array(S * S), RO = new Float32Array(S * S).fill(o.rough ?? 0.85), AO = new Float32Array(S * S).fill(1);
  const EM = o.emissive ? new Float32Array(S * S * 3) : null;
  const P = [0, 0, 0], Nn = [0, 0, 0];
  const st = { c: [0, 0, 0], h: 0, ro: 0, a: 1, e: [0, 0, 0], ao: 1 };
  const painted = new Uint8Array(S * S);
  let anyCut = false;
  for (let i = 0; i < S * S; i++) {
    if (!texelSurface(r, tris, part.pos, nrm, i, P, Nn)) continue;
    painted[i] = 1;
    st.c[0] = st.c[1] = st.c[2] = 0.2; st.h = 0; st.ro = o.rough ?? 0.85; st.a = 1; st.ao = 1; st.e[0] = st.e[1] = st.e[2] = 0;
    fn(P, Nn, st, ((i % S) + 0.5) / S, 1 - (((i / S) | 0) + 0.5) / S, i, r.tri[i]);
    const d = i * 4;
    albedo.data[d] = toByte(st.c[0]); albedo.data[d + 1] = toByte(st.c[1]); albedo.data[d + 2] = toByte(st.c[2]);
    if (st.a < 0.5) { albedo.data[d + 3] = 0; anyCut = true; }
    H[i] = st.h; RO[i] = st.ro; AO[i] = st.ao;
    if (EM) { EM[i * 3] = st.e[0]; EM[i * 3 + 1] = st.e[1]; EM[i * 3 + 2] = st.e[2]; }
  }
  const NS = texSize(o.normalSize ?? o.size);
  const hS = NS === S ? H : downField(H, S, NS);
  const normal = normalFromHeight(o.hBlur ? blurField(hS, NS, NS, o.hBlur, 1) : hS, NS, NS, (o.normalStrength ?? 2) * NS / 1024);
  const OS = texSize(o.ormSize ?? 512);
  const orm = createImage(OS, OS, [255, 200, 0, 255]);
  const rS = downField(RO, S, OS);
  const aS = downField(AO, S, OS);
  for (let i = 0; i < OS * OS; i++) { orm.data[i * 4] = Math.round(clamp01(aS[i]) * 255); orm.data[i * 4 + 1] = Math.round(clamp01(rS[i]) * 255); }
  let emissiveMap = null;
  if (EM) {
    const ES = texSize(o.emissiveSize ?? 256);
    const e = downField(EM, S, ES, 3);
    emissiveMap = createImage(ES, ES, [0, 0, 0, 255]);
    for (let i = 0; i < ES * ES; i++) for (let c = 0; c < 3; c++) emissiveMap.data[i * 4 + c] = toByte(e[i * 3 + c]);
  }
  return { albedo, normal, orm, emissiveMap, alpha: anyCut, S, raster: r, painted };
}

/**
 * Makes an alpha-MASK albedo safe for mipmapping / the LOD1 downscale: texels outside the UV islands get the colour
 * of the nearest islands (push-pull fill) instead of black, and the torn-away texels keep their painted colour.
 * (The shared GLB writer zeroes the RGB of alpha < 128 texels when it quantises (pngBits < 8): the tatter gaps then
 * averaged to black in the mips - the skirt hem came out a black 'barcode' at 5-15 m and her whole lower half went
 * near-black in shadow. So the albedo is quantised here to 6 bits, RGB kept everywhere, and written with pngBits 8.)
 */
function finishAlbedo(img, painted) {
  const W = img.width, H = img.height, d = img.data, C = 5;   // r, g, b, a, count
  const levels = [], dims = [];
  let L = new Float32Array(W * H * C);
  for (let i = 0; i < W * H; i++) if (painted[i]) { for (let k = 0; k < 4; k++) L[i * C + k] = d[i * 4 + k]; L[i * C + 4] = 1; }
  levels.push(L); dims.push([W, H]);
  for (let w = W, h = H; w > 1 && h > 1;) {
    const nw = w >> 1, nh = h >> 1, prev = levels[levels.length - 1], nx = new Float32Array(nw * nh * C);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      const o = (y * nw + x) * C;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const s = ((y * 2 + dy) * w + x * 2 + dx) * C; for (let k = 0; k < C; k++) nx[o + k] += prev[s + k]; }
    }
    levels.push(nx); dims.push([nw, nh]); w = nw; h = nh;
  }
  // sums -> averages, then top-down: every empty texel takes its parent's average (colour and coverage)
  for (let l = 1; l < levels.length; l++) { const lv = levels[l]; for (let i = 0; i < lv.length; i += C) if (lv[i + 4] > 0) { const c = lv[i + 4]; for (let k = 0; k < 4; k++) lv[i + k] /= c; lv[i + 4] = 1; } }
  for (let l = levels.length - 2; l >= 0; l--) {
    const [w, h] = dims[l], pw = dims[l + 1][0], ph = dims[l + 1][1], lv = levels[l], pv = levels[l + 1];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * C;
      if (lv[i + 4] > 0) continue;
      const pi = (Math.min(ph - 1, y >> 1) * pw + Math.min(pw - 1, x >> 1)) * C;
      for (let k = 0; k < 4; k++) lv[i + k] = pv[pi + k];
      lv[i + 4] = 1;
    }
    if (l) levels[l + 1] = null;
  }
  L = levels[0];
  for (let i = 0; i < W * H; i++) {
    if (!painted[i]) { for (let k = 0; k < 3; k++) d[i * 4 + k] = L[i * C + k]; d[i * 4 + 3] = L[i * C + 3] >= 128 ? 255 : 0; }
    for (let k = 0; k < 3; k++) d[i * 4 + k] = Math.min(252, Math.round(d[i * 4 + k] / 4) * 4);
  }
  return img;
}

// ---------- custom geometry: positions and UVs indexed separately (welded seams keep one smooth normal)
class Geo {
  constructor() { this.P = []; this.UV = []; this.F = []; this.W = []; this.Z = []; }
  v(p, w = null, zone = 0) { this.P.push(p[0], p[1], p[2]); this.W.push(w); this.Z.push(zone); return this.P.length / 3 - 1; }
  t(u, v) { this.UV.push(u, v); return this.UV.length / 2 - 1; }
  /** a vertex with its own uv: returns the corner [v, t] */
  vt(p, uv, w = null, zone = 0) { return [this.v(p, w, zone), this.t(uv[0], uv[1])]; }
  tri(a, b, c) { this.F.push({ v: [a[0], b[0], c[0]], t: [a[1], b[1], c[1]], g: 0 }); }
  quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }
  pos(i) { return [this.P[i * 3], this.P[i * 3 + 1], this.P[i * 3 + 2]]; }
  get n() { return this.P.length / 3; }
}
/** Tube along a polyline (parallel transport frames); radius(t) or number; uv rect [u0,v0,u1,v1] (u around, v along). */
function tube(g, pts, radius, sides, uvr, w, zone, { ref = [0, 1, 0], capEnd = false } = {}) {
  const n = pts.length;
  const T = pts.map((p, i) => norm(sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)])));
  let N0 = norm(cross(T[0], Math.abs(dot(T[0], ref)) > 0.9 ? [1, 0, 0] : ref));
  const rows = [];
  for (let i = 0; i < n; i++) {
    if (i) { const b = cross(T[i - 1], T[i]); if (len(b) > 1e-6) N0 = rot(N0, norm(b), Math.acos(Math.max(-1, Math.min(1, dot(T[i - 1], T[i]))))); }
    N0 = norm(sub(N0, scl(T[i], dot(N0, T[i]))));
    const B = cross(T[i], N0);
    const r = typeof radius === 'function' ? radius(i / (n - 1), i) : radius;
    const ww = typeof w === 'function' ? w(i / (n - 1), pts[i], i) : w;
    const row = [];
    const vs = [];
    for (let k = 0; k < sides; k++) { const a = (k / sides) * Math.PI * 2; vs.push(g.v(madd(madd(pts[i], N0, Math.cos(a) * r), B, Math.sin(a) * r), ww, zone)); }
    for (let k = 0; k <= sides; k++) row.push([vs[k % sides], g.t(mix(uvr[0], uvr[2], k / sides), mix(uvr[1], uvr[3], i / (n - 1)))]);
    rows.push(row);
  }
  for (let i = 0; i + 1 < n; i++) for (let k = 0; k < sides; k++) g.quad(rows[i][k], rows[i][k + 1], rows[i + 1][k + 1], rows[i + 1][k]);
  if (capEnd) {
    const last = rows[n - 1], c = g.vt(madd(pts[n - 1], T[n - 1], 0.3 * (typeof radius === 'function' ? radius(1, n - 1) : radius)), [mix(uvr[0], uvr[2], 0.5), uvr[3]], typeof w === 'function' ? w(1, pts[n - 1], n - 1) : w, zone);
    for (let k = 0; k < sides; k++) g.tri(last[k], last[k + 1], c);
  }
  return rows;
}
function rot(v, ax, ang) {
  const c = Math.cos(ang), s = Math.sin(ang), d = dot(ax, v), cr = cross(ax, v);
  return [v[0] * c + cr[0] * s + ax[0] * d * (1 - c), v[1] * c + cr[1] * s + ax[1] * d * (1 - c), v[2] * c + cr[2] * s + ax[2] * d * (1 - c)];
}
/** Catmull-Rom through points (any dimension), n samples total (open curve). */
function smoothLine(pts, n) {
  const out = [], m = pts.length - 1;
  for (let i = 0; i < n; i++) {
    const f = (i / (n - 1)) * m, k = Math.min(m - 1, Math.floor(f)), t = f - k;
    const p0 = pts[Math.max(0, k - 1)], p1 = pts[k], p2 = pts[k + 1], p3 = pts[Math.min(m, k + 2)];
    out.push(p1.map((_, j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t * t + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t * t * t)));
  }
  return out;
}

/** Turns a Geo into a lib Part with explicit skin weights (g.W[i] or skinFn(p, i, zone)); _seg from the weights. */
function toPart(lib, h, g, name, role, skinFn) {
  const n = g.n;
  const obj = { positions: Float32Array.from(g.P), uvs: Float32Array.from(g.UV), faces: g.F, groups: ['default'], groupIndex: new Map([['default', 0]]), groupVerts: () => new Set() };
  const part = new lib.Part({ name, role, obj, pos: Float32Array.from(g.P), refIdx: new Int32Array(n * 3), refW: new Float32Array(n * 3) });
  const bones = h.skeleton.bones;
  part.weights = new Array(n);
  part.seg = new Uint8Array(n);
  part.zone = Uint8Array.from(g.Z);
  for (let i = 0; i < n; i++) {
    let list = g.W[i] || skinFn(g.pos(i), i, g.Z[i]);
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

/**
 * Closest-skin weights: the bone weights of the base-mesh surface point nearest to p (barycentric blend of its
 * triangle's three vertices), filtered to `allow`, each bone scaled by `scale[name]`. Cloth bound this way moves
 * exactly with the skin under it.
 */
function closestSkinner(h, bodyTris) {
  const B = makeBVH([{ pos: h.pos, tris: bodyTris }]);
  const bones = h.skeleton.bones, pos = h.pos;
  return (p, { allow = null, scale = null } = {}) => {
    const c = B.closest(p);
    const ia = bodyTris[c.fi * 6], ib = bodyTris[c.fi * 6 + 2], ic = bodyTris[c.fi * 6 + 4];
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
      if (allow && !allow.includes(name)) continue;
      acc.set(b, (acc.get(b) || 0) + w * k * (scale?.[name] ?? 1));
    }
    const list = [...acc.entries()].filter(([, w]) => w > 1e-3);
    return list.length ? list : [[h.skeleton.byName.spine_03.index, 1]];
  };
}
/** Weighted blend of two weight lists. */
function blendW(a, b, t) {
  const m = new Map();
  const sa = a.reduce((s, [, w]) => s + w, 0) || 1, sb = b.reduce((s, [, w]) => s + w, 0) || 1;
  for (const [k, w] of a) m.set(k, (m.get(k) || 0) + (1 - t) * w / sa);
  for (const [k, w] of b) m.set(k, (m.get(k) || 0) + t * w / sb);
  return [...m.entries()];
}

/**
 * Dark oral cavity sealed to the lip boundary loop of the body proxy (a mouth bag closing at the throat) + caps behind
 * the eyelid openings (they close the sockets when LOD1 drops the eyes). u < 0.5 cavity, u > 0.5 eye cap.
 */
function mouthCavity(h, body, A) {
  const loops = boundaryLoops(body);
  const P = (v) => [body.pos[v * 3], body.pos[v * 3 + 1], body.pos[v * 3 + 2]];
  const cen = (loop) => loop.reduce((a, v) => add(a, scl(P(v), 1 / loop.length)), [0, 0, 0]);
  const near = (c, r) => loops.map((l) => [l, dist(cen(l), c)]).filter(([, d]) => d < r).sort((a, b) => a[1] - b[1])[0]?.[0];
  const mouth = near(A.mouth, 0.04), eyes = [near(A.eyeL, 0.03), near(A.eyeR, 0.03)];
  if (!mouth) throw new Error('screamer: mouth boundary loop not found');
  const headB = makeBVH([{ pos: body.pos, tris: body.tris() }]);
  const inside = (p, axis, minD = 0.0025) => {
    for (let k = 0; k < 14; k++) {
      const c = headB.closest(p);
      const sd = dot(sub(p, c.p), c.n) >= 0 ? c.d : -c.d;   // proxy winding: outward normals
      if (sd < -minD) break;
      p = add(axis, scl(sub(p, axis), 0.85));
    }
    return p;
  };
  const g = new Geo();
  const wOf = (v) => body.weights[v];
  const C = cen(mouth);
  const ringDef = [[0.0015, 1, 1, 0.06], [0.012, 1.1, 1.6, 0.22], [0.03, 0.85, 1.25, 0.38]];
  const rings = ringDef.map(([depth, sx, sy, u], ri) => mouth.map((v) => {
    const p = P(v), d = sub(p, C);
    let q;
    if (ri === 0) { const r = norm([d[0], d[1], 0]); q = [p[0] + r[0] * 0.0015, p[1] + r[1] * 0.0015, p[2] - depth]; }
    else q = inside([C[0] + d[0] * sx, C[1] + d[1] * sy, C[2] - depth], [C[0], C[1], C[2] - depth]);
    return g.vt(q, [u, 0.5], wOf(v));
  }));
  const apex = g.vt(inside([C[0], C[1] - 0.004, C[2] - 0.05], [C[0], C[1], C[2] - 0.045]), [0.46, 0.5], [['head', 1]]);
  const L = mouth.length;
  for (let r = 0; r + 1 < rings.length; r++) for (let k = 0; k < L; k++) g.quad(rings[r][k], rings[r][(k + 1) % L], rings[r + 1][(k + 1) % L], rings[r + 1][k]);
  for (let k = 0; k < L; k++) g.tri(rings[rings.length - 1][k], rings[rings.length - 1][(k + 1) % L], apex);
  for (const loop of eyes) {
    if (!loop) continue;
    const c = cen(loop);
    const rim = loop.map((v) => g.vt(sub(P(v), [0, 0, 0.0025]), [0.78, 0.5], wOf(v)));
    const ci = g.vt(sub(c, [0, 0, 0.004]), [0.78, 0.5], [['head', 1]]);
    for (let k = 0; k < rim.length; k++) g.tri(ci, rim[k], rim[(k + 1) % rim.length]);
  }
  return g;
}

// ====================================================================================================== build
export async function build(lib) {
  // ---- body: a very old (≈85), tall, bone-thin woman; long neck, long forearms, long thin fingers, hooked nose,
  // hollow cheeks; the jaw hangs open in a scream, the platysma strained, eyes stretched wide under lowered brows
  const opts = lib.merge('gaunt', {
    macro: { gender: 0, age: 0.96, height: 0.635, proportions: 0.62, muscle: 0.18, weight: 0.05, race: { caucasian: 1 } },
    modifiers: {
      'hand-fingers-length-decr-incr': 1, 'hand-fingers-diameter-decr-incr': -0.7, 'hand-scale-decr-incr': 0.2,
      'measure-lowerarm-length-decr-incr': 0.45, 'measure-upperarm-length-decr-incr': 0.2,
      'neck-scale-vert-decr-incr': 0.55, 'neck-scale-horiz-decr-incr': -0.25,
      'cheek-bones-decr-incr': 0.4, 'forehead-temple-decr-incr': -0.6, 'eye-bag-decr-incr': 0.7,
      'nose-hump-decr-incr': 0.7, 'nose-point-down-up': -0.5, 'nose-scale-vert-decr-incr': 0.35, 'nose-volume-decr-incr': -0.2,
      'chin-prominent-decr-incr': 0.4, 'head-age-decr-incr': 0.6, 'breast-volume-vert-down-up': -0.6,
    },
    expression: {
      'mouth-open': 0.58, 'mouth-upward-retraction': 0.3, 'mouth-depression': 0.4, 'neck-platysma': 0.75,
      'eye-left-opened-up': 0.55, 'eye-right-opened-up': 0.55, 'eyebrows-left-down': 0.35, 'eyebrows-right-down': 0.35,
      'nose-left-dilatation': 0.4, 'nose-right-dilatation': 0.4,
    },
  });
  // stooped elder: lower back rounded, shoulders hiked and rolled forward, the long neck craned forward and the head
  // tipped up to look out from under the hood; long fingers half-curled into claws (local euler degrees, after the mixer)
  // (a light stoop only: she must keep her tall, thin silhouette; the head is lifted so the glowing eyes look out)
  const poseOffsets = {
    spine_02: [3, 0, 0], spine_03: [5, 0, 0], neck_01: [8, 0, 0], head: [-18, 0, 0],
    clavicle_l: [0, 0, -5], clavicle_r: [0, 0, 5],
  };
  // per-clip overrides (game: extras.poseOffsetsByClip, blended with the action weights). Her clips (defs.js):
  // walk_c (CMU 120_22, folded far over with a lolling head) and idle_b are straightened into a tall, stalking gait
  // with the neck craned forward and the face up; the lying / falling clips drop the head lift (no chin into the floor)
  const flat = { spine_02: [0, 0, 0], spine_03: [0, 0, 0], neck_01: [0, 0, 0], head: [0, 0, 0] };
  const poseOffsetsByClip = {
    walk_c: { spine_01: [-9, 0, 0], spine_02: [-9, 0, 0], spine_03: [-3, 0, 0], neck_01: [9, 0, 0], head: [-24, 0, 0] },
    idle_b: { spine_01: [-5, 0, 0], spine_02: [-4, 0, 0], spine_03: [2, 0, 0], neck_01: [9, 0, 0], head: [-24, 0, 0] },
    attack_a: { head: [-28, 0, 0] },
    death_front: flat, death_back: flat, knockdown: flat, get_up: flat,
  };
  if (process.env.SCREAMER_POSE_CLIPS) Object.assign(poseOffsetsByClip, JSON.parse(process.env.SCREAMER_POSE_CLIPS));
  const h = await lib.Human.create(opts);
  const N = lib.makeNoise(97);
  const A = lib.anchors(h);
  const sk = h.skeleton.byName;
  const eyeY = (A.eyeL[1] + A.eyeR[1]) / 2, eyeZ = (A.eyeL[2] + A.eyeR[2]) / 2;
  const kneeY = (sk.calf_l.head.y + sk.calf_r.head.y) / 2, ankleY = (sk.foot_l.head.y + sk.foot_r.head.y) / 2;
  const hipY = sk.pelvis.head.y, crotchY = (sk.thigh_l.head.y + sk.thigh_r.head.y) / 2 - 0.08;
  console.log(`${TAG} height ${h.height.toFixed(3)} m, eyes ${eyeY.toFixed(3)}, knee ${kneeY.toFixed(3)}, hip ${hipY.toFixed(3)}, neck ${A.neck[1].toFixed(3)}`);

  // ---- fitted parts
  const body = await h.proxyBody('female1605');
  const coat = await h.fit('clothes/male_casualsuit05', { name: 'coat', role: 'cloth' });
  const eyes = await h.fit('eyes/low-poly', { name: 'eyes', role: 'eye', hide: false });
  const teeth = await h.fit('teeth/teeth_base', { name: 'teeth', role: 'teeth', hide: false });
  const fullBody = h.basePart({ name: 'full' });
  const fullTris = fullBody.tris();
  const fullNrm = fullBody.normals();
  const skinAt = closestSkinner(h, fullTris);
  const armW = (v) => h.weights[v].reduce((a, [b, w]) => a + (/arm|hand|thumb|index|middle|ring|pinky/.test(h.skeleton.bones[b].name) ? w : 0), 0);

  // ---- the coat: field jacket islands classified (jeans dropped; standing collar band dropped: the hood sits there)
  const islands = uvIslands(coat);
  const isl = new Map();
  {
    const src = await lib.texture(coat.asset.textures.diffuse, 256);
    coat.obj.faces.forEach((f, fi) => {
      const id = islands[fi];
      let s = isl.get(id);
      if (!s) isl.set(id, s = { faces: 0, ymin: 9, ymax: -9, c: [0, 0, 0], zc: 0, xc: 0, n: 0, col: [0, 0, 0], nc: 0 });
      s.faces++;
      for (const v of f.v) { const y = coat.pos[v * 3 + 1]; s.ymin = Math.min(s.ymin, y); s.ymax = Math.max(s.ymax, y); s.c[0] += coat.pos[v * 3]; s.c[1] += y; s.c[2] += coat.pos[v * 3 + 2]; s.n++; }
      for (const t of f.t) {
        const x = Math.min(255, Math.floor(coat.obj.uvs[t * 2] * 256)), y = Math.min(255, Math.floor((1 - coat.obj.uvs[t * 2 + 1]) * 256));
        const i = (y * 256 + x) * 4;
        s.col[0] += S2L[src.data[i]]; s.col[1] += S2L[src.data[i + 1]]; s.col[2] += S2L[src.data[i + 2]]; s.nc++;
      }
    });
    for (const s of isl.values()) { s.c = scl(s.c, 1 / s.n); s.col = scl(s.col, 1 / s.nc); }
  }
  const shoulderY = sk.clavicle_l.tail.y;
  const kind = new Map();   // island id -> 'jeans' | 'collar' | 'shirt' | 'coat'
  for (const [id, s] of isl) {
    let k = 'coat';
    if (s.ymax < hipY + 0.12 && s.ymin < kneeY) k = 'jeans';
    else if (s.c[1] > shoulderY - 0.02 && s.c[2] < 0.06 && s.ymin > shoulderY - 0.08) k = 'collar';
    else if (s.col[0] > s.col[1] * 1.25) k = s.c[1] > shoulderY - 0.02 ? 'collar' : 'shirt';
    // the two lower bellows pockets (bag + flap islands): flattened and painted out (a field jacket, not a shaman's coat)
    if (k === 'coat' && s.faces < 60 && s.c[2] > 0.1 && Math.abs(s.c[0]) > 0.07 && Math.abs(s.c[0]) < 0.22 && s.c[1] < 1.15 / 1.81 * h.height) k = 'pocket';
    kind.set(id, k);
  }
  {
    const tally = {};
    for (const [id, s] of isl) { const k = kind.get(id); tally[k] = (tally[k] || 0) + s.faces; }
    console.log(`${TAG} coat islands (faces):`, JSON.stringify(tally), [...isl].map(([id, s]) => `${kind.get(id)}:${s.faces}@${s.c.map((x) => x.toFixed(2)).join(',')}`).join(' '));
  }
  coat.obj.faces.forEach((f, fi) => { const k = kind.get(islands[fi]); if (k === 'jeans' || k === 'collar') coat.keep[fi] = 0; });
  const faceKind = coat.obj.faces.map((f, fi) => kind.get(islands[fi]));
  {
    // flatten the pocket islands onto the front panel: each vertex sits at the panel's own clearance over the body
    // (median of the panel vertices round the pocket), the flap 3 mm over the bag (they overlap)
    const flatB = makeBVH([{ pos: h.pos, tris: fullTris }]);
    const P = (v) => [coat.pos[v * 3], coat.pos[v * 3 + 1], coat.pos[v * 3 + 2]];
    const byIsl = new Map();
    coat.obj.faces.forEach((f, fi) => { if (faceKind[fi] === 'pocket') { const id = islands[fi]; if (!byIsl.has(id)) byIsl.set(id, new Set()); for (const v of f.v) byIsl.get(id).add(v); } });
    const panelV = new Set();
    coat.obj.faces.forEach((f, fi) => { if (faceKind[fi] === 'coat' && coat.keep[fi]) for (const v of f.v) panelV.add(v); });
    const off = (p) => { const c = flatB.closest(p); return { c, d: c.d, dir: c.d > 0.002 ? norm(sub(p, c.p)) : c.n }; };
    for (const [id, vs] of byIsl) {
      const s = isl.get(id);
      // (the flap has to stay: it closes a hole in the panel over the bag's mouth)
      const ds = [...panelV].filter((v) => dist(P(v), s.c) < 0.09 && !vs.has(v)).map((v) => off(P(v)).d).sort((a, b) => a - b);
      const m = ds.length ? ds[ds.length >> 1] : 0.012;
      const lift = s.faces < 30 ? 0.0032 : 0.0012;     // flap just over the bag
      for (const v of vs) { const o = off(P(v)); const q = madd(o.c.p, o.dir, m + lift); coat.pos[v * 3] = q[0]; coat.pos[v * 3 + 1] = q[1]; coat.pos[v * 3 + 2] = q[2]; }
      console.log(`${TAG} pocket island ${s.faces} faces @${s.c.map((x) => x.toFixed(2))} flattened to ${(m * 1000).toFixed(0)} mm (+${lift * 1000})`);
    }
  }
  // garment vertices never belong to the head segment (decapitation must not carry the collar away)
  for (let v = 0; v < coat.nVerts; v++) if (coat.seg[v] === 1) coat.seg[v] = 0;
  // jacket hem: lowest kept coat vertex; per-angle hem height around the hips
  let hemY = 9;
  coat.obj.faces.forEach((f, fi) => { if (coat.keep[fi] && faceKind[fi] === 'coat') for (const v of f.v) hemY = Math.min(hemY, coat.pos[v * 3 + 1]); });
  console.log(`${TAG} jacket hem at ${hemY.toFixed(3)} m (crotch ${crotchY.toFixed(3)})`);

  // body vertices the jeans hid come back (legs under the long skirt stay: they show through the slits / vent)
  for (const v of [...h.hidden]) if (h.pos[v * 3 + 1] < hemY + 0.03) h.hidden.delete(v);

  // ---- surfaces
  const coatTris = coat.tris();
  const coatB = makeBVH([{ pos: coat.pos, tris: coatTris }]);
  const torsoTris = (() => { const out = []; for (let i = 0; i < fullTris.length; i += 6) { if ([fullTris[i], fullTris[i + 2], fullTris[i + 4]].every((v) => armW(v) < 0.4)) out.push(...fullTris.slice(i, i + 6)); } return Int32Array.from(out); })();
  const torsoB = makeBVH([{ pos: h.pos, tris: torsoTris }]);
  const bodyB = makeBVH([{ pos: h.pos, tris: fullTris }]);

  // =========================================================================================== DRAPE (skirt / hood / mantle / sash)
  // atlas (OBJ uv, v up): skirt L u .005-.405 / R .41-.81, v .005-.555; sash u .82-.995 v .005-.555;
  // hood+mantle L u .005-.395 / R .405-.795, v .565-.995 (mantle v .565-.70, hood .70-.995); rim roll u .805-.995
  const drape = new Geo();
  const ZONE = { skirt: 0, hood: 1, mantle: 2, rim: 3, sash: 4 };
  const zcAxis = sk.pelvis.head.z - 0.005;

  // ---------------------------------------------------------------- SKIRT
  const K = 44;                                   // columns round (θ = 0 front, +π/2 her left / +x)
  const thetaOf = (k) => (k / K) * Math.PI * 2;    // k = 0 front, K/2 back
  // (the top row rides up under the jacket to the linen shift: between the open jacket fronts there was a dark slit
  // between the jacket hem and the sash)
  const yTop = hemY + 0.1;
  const yHem = mix(kneeY, ankleY, 0.4);            // mid-calf
  const yEnd = mix(kneeY, ankleY, 0.62);           // geometry runs on to here: the torn strips (alpha) hang this low
  const slitY = kneeY + 0.07, ventY = kneeY + 0.17;
  const hipJY = (sk.thigh_l.head.y + sk.thigh_r.head.y) / 2;   // hip joints (the thighs swing about these)
  const rowsY = [];
  rowsY.push(yTop, hemY + 0.05, hemY + 0.02, hemY - 0.012);
  { const n = Math.max(6, Math.round((hemY - 0.012 - yEnd) / 0.042)); for (let i = 1; i <= n; i++) rowsY.push(mix(hemY - 0.012, yEnd, i / n)); }
  const RN = rowsY.length;
  // body support (convex hull of the hips / legs per height, arms excluded) round the skirt axis
  const legV = [];
  for (const v of h.baseObj.groupVerts('body')) if (armW(v) < 0.15 && h.pos[v * 3 + 1] < hemY + 0.12) legV.push(v);
  const support = (y) => {
    const out = new Float32Array(K).fill(0.05);
    for (const v of legV) {
      const vy = h.pos[v * 3 + 1];
      if (Math.abs(vy - y) > 0.03) continue;
      const x = h.pos[v * 3], z = h.pos[v * 3 + 2] - zcAxis;
      for (let k = 0; k < K; k++) { const th = thetaOf(k); const d = x * Math.sin(th) + z * Math.cos(th); if (d > out[k]) out[k] = d; }
    }
    return out;
  };
  const rayR = (B, y, th, from = 0.7) => { const d = [Math.sin(th), 0, Math.cos(th)]; const hit = B.first([d[0] * from, y, zcAxis + d[2] * from], scl(d, -1), from); return hit ? from - hit.d : null; };
  const skirtR = [];
  {
    let prev = null;
    for (let r = 0; r < RN; r++) {
      const y = rowsY[r], row = new Float32Array(K);
      const sup = support(y);
      for (let k = 0; k < K; k++) {
        const th = thetaOf(k);
        const bR = rayR(torsoB, y, th) ?? sup[k];
        const jR = y > hemY - 0.004 ? rayR(coatB, y, th) : null;
        if (jR !== null && jR > bR + 0.012) row[k] = Math.max(bR + 0.008, jR - 0.01);
        else if (!prev || y > hemY + 0.03) row[k] = Math.max(bR + 0.007, prev ? prev[k] - 0.003 : 0);
        else {
          const depth = clamp01((hemY - y) / (hemY - yHem));
          const step = (rowsY[r - 1] - y) / 0.042;
          const flare = mix(0.045, 0.08, Math.abs(Math.cos(th))) * (depth ** 1.25 - clamp01((hemY - rowsY[r - 1]) / (hemY - yHem)) ** 1.25);
          // 2.5 cm more room over the thighs at the front and the sides (the swinging thigh ran through the cloth)
          const room = 0.025 * ss(-0.55, 0.2, Math.cos(th)) * ss(hemY - 0.01, hemY - 0.1, y);
          row[k] = Math.max(prev[k] - 0.0015 * step + flare, sup[k] + 0.012 + 0.018 * depth + room);
        }
      }
      // smooth round (twice) so the rings stay convex-looking
      for (let it = 0; it < 2; it++) { const c = row.slice(); for (let k = 0; k < K; k++) row[k] = Math.max(c[k], 0.25 * c[(k + K - 1) % K] + 0.5 * c[k] + 0.25 * c[(k + 1) % K]); }
      skirtR.push(row);
      prev = row;
    }
  }
  // folds: vertical pleats growing towards the hem, irregular
  const foldAt = (k, y) => {
    const th = thetaOf(k), depth = clamp01((hemY - y) / (hemY - yEnd));
    const amp = 0.003 + 0.016 * depth ** 1.1;
    return amp * (0.65 * Math.sin(th * 9 + 1.3 + N.noise(th * 1.7, y * 2.5, 3.3) * 1.8) + 0.35 * N.noise(th * 4.5, y * 4, 7.1));
  };
  const slitGap = (y, top, w) => w * ss(top, top - 0.18, y) * clamp01((top - y) / (top - yEnd));
  // positions: column k at row r; front centre (k = 0) and back centre (k = K/2) split below the slit / vent
  const skirtPos = (r, k, side = 0) => {
    const y = rowsY[r];
    let th = thetaOf(k);
    if (k === 0 && side) th += side * slitGap(y, slitY, 0.07);
    if (k === K / 2 && side) th -= side * slitGap(y, ventY, 0.022);
    const kk = ((Math.round(th / (Math.PI * 2) * K) % K) + K) % K;
    const rr = skirtR[r][kk] + foldAt(k, y) + (k === K / 2 && side ? 0.004 * (side > 0 ? 1 : 0) : 0);
    // the slit edges curl outwards a little
    return [Math.sin(th) * rr, y, zcAxis + Math.cos(th) * rr];
  };
  // skirt skinning: the top rows follow the skin under the jacket hem (like the jacket); below, each panel follows the
  // thigh behind it: the front-left / back-left quadrants thigh_l, the right ones thigh_r, front / back centre 50:50.
  // The thigh share eases in fast from the hip joint (a point s below it swings 2 s sin(a/2) off when the thigh lifts
  // by a: at 35 deg the cloth may lag by < ~4 cm, its room over the thigh) - about .55 a hand below the hip joint, .8 at
  // mid-thigh, .9 at the knee; the back panels a little less. Below the knee the shins take a share (the trailing
  // shin kicks back through the back panels, more of it there). The slit / vent flaps go to their own side.
  const thighBlend = (P, flap) => {
    const y = P[1], th = Math.atan2(P[0], P[2] - zcAxis);
    let fl = ss(-0.3, 0.3, Math.sin(th));
    if (flap) fl = mix(fl, flap > 0 ? 1 : 0, ss(flap === 2 || flap === -2 ? ventY : slitY, (flap === 2 || flap === -2 ? ventY : slitY) - 0.2, y));
    const front = ss(-0.5, 0.2, Math.cos(th));
    const sDown = clamp01((hipJY - y) / (hipJY - kneeY));
    const T = mix(0.3, mix(0.82, 0.92, front), 1 - (1 - sDown) ** 2);
    const C = ss(kneeY + 0.01, yEnd + 0.02, y) * mix(0.45, 0.2, front);
    return [['pelvis', 1 - T], ['thigh_l', (T - C) * fl], ['thigh_r', (T - C) * (1 - fl)], ['calf_l', C * fl], ['calf_r', C * (1 - fl)]];
  };
  const skirtSkin = (P, flap) => {
    const top = skinAt(P, { allow: ['pelvis', 'spine_01', 'spine_02', 'thigh_l', 'thigh_r'] });
    const f = ss(hemY + 0.005, hemY - 0.06, P[1]);
    return f <= 0 ? top : f >= 1 ? thighBlend(P, flap) : blendW(top, thighBlend(P, flap), f);
  };
  if (process.env.SCREAMER_DEBUG) for (const y of [hemY + 0.02, hemY - 0.03, 0.75, 0.65, kneeY, 0.35]) console.log(`${TAG} skirt w @${y.toFixed(2)} front-left:`, skirtSkin([0.07, y, 0.16], 0).map(([b, w]) => `${typeof b === 'string' ? b : h.skeleton.bones[b].name}:${w.toFixed(2)}`).join(' '));
  {
    // per-row arc length for v (down the cloth), uv halves: L k = 0..K/2 (front -> left -> back), R k = K/2..K
    const vOf = [];
    let acc = 0;
    for (let r = 0; r < RN; r++) { if (r) acc += Math.hypot(rowsY[r - 1] - rowsY[r], skirtR[r][K / 4] - skirtR[r - 1][K / 4]); vOf.push(acc); }
    const VL = acc;
    const vmap = (r) => 0.555 - (vOf[r] / VL) * 0.55;
    // shared position vertices: id[r][k] (k 0..K-1); split copies at k = 0 / K/2 below the slit tops
    const ids = [];
    for (let r = 0; r < RN; r++) {
      const row = [];
      for (let k = 0; k < K; k++) {
        const y = rowsY[r];
        const splitF = k === 0 && y < slitY - 0.001, splitB = k === K / 2 && y < ventY - 0.001;
        if (splitF || splitB) {
          const flapL = splitF ? 1 : 2, flapR = splitF ? -1 : -2;
          const pl = skirtPos(r, k, splitF ? 1 : -1), pr = skirtPos(r, k, splitF ? -1 : 1);
          // left copy belongs to the left half (k = 0 start / K/2 end), right copy to the right half
          row.push({ l: drape.v(pl, skirtSkin(pl, flapL), ZONE.skirt), r: drape.v(pr, skirtSkin(pr, flapR), ZONE.skirt) });
        } else {
          const p = skirtPos(r, k);
          const id = drape.v(p, skirtSkin(p, 0), ZONE.skirt);
          row.push({ l: id, r: id });
        }
      }
      ids.push(row);
    }
    // left half: k 0..K/2 (left copies), u .005 -> .405 ; right half: k K/2..K (k = K is column 0, right copies)
    const half = (k0, pick, u0, u1) => {
      const rowsC = [];
      for (let r = 0; r < RN; r++) {
        const rc = [];
        for (let j = 0; j <= K / 2; j++) {
          const k = (k0 + j) % K;
          const isStart = j === 0, isEnd = j === K / 2;
          const node = ids[r][k];
          const vid = pick(node, isStart, isEnd);
          rc.push([vid, drape.t(mix(u0, u1, j / (K / 2)), vmap(r))]);
        }
        rowsC.push(rc);
      }
      for (let r = 0; r + 1 < RN; r++) for (let j = 0; j < K / 2; j++) drape.quad(rowsC[r][j], rowsC[r + 1][j], rowsC[r + 1][j + 1], rowsC[r][j + 1]);
    };
    // left half runs front (k=0, left copy) -> back (k=K/2, left copy); right half back (K/2, right copy) -> front (0, right copy)
    half(0, (n) => n.l, 0.005, 0.405);
    half(K / 2, (n) => n.r, 0.41, 0.81);
  }
  console.log(`${TAG} skirt ${RN} rows (${yTop.toFixed(3)} .. ${yEnd.toFixed(3)} m, hem ${yHem.toFixed(3)}), slit ${slitY.toFixed(3)}, vent ${ventY.toFixed(3)}, ${drape.F.length} tris`);

  // ---------------------------------------------------------------- SASH (cloth band round the hips, knot front-left)
  const sashY = hemY + 0.028, sashH = 0.044, KS = 40;
  const sashKnotTh = 0.42;
  {
    const outerB = makeBVH([{ pos: coat.pos, tris: coatTris }, { pos: Float32Array.from(drape.P), tris: (() => { const t = []; for (const f of drape.F) t.push(f.v[0], f.t[0], f.v[1], f.t[1], f.v[2], f.t[2]); return Int32Array.from(t); })() }]);
    const ringAt = (y, k, out) => {
      const th = (k / KS) * Math.PI * 2;
      const d = [Math.sin(th), 0, Math.cos(th)];
      const hit = outerB.first([d[0] * 0.7, y, zcAxis + d[2] * 0.7], scl(d, -1), 0.7);
      const r = (hit ? 0.7 - hit.d : 0.2) + out;
      return [d[0] * r, y, zcAxis + d[2] * r];
    };
    const rows = [[sashY + sashH / 2, 0.003], [sashY + sashH * 0.18, 0.0065], [sashY - sashH * 0.2, 0.0065], [sashY - sashH / 2, 0.003]];
    const prof = rows.map(([y, o]) => { const row = []; for (let k = 0; k < KS; k++) row.push(ringAt(y + 0.004 * N.noise(k * 0.7, y * 20, 1.1), k, o)); return row; });
    // keep the band convex in plan: radius per column = max over its rows (no dips into folds of the skirt)
    for (let k = 0; k < KS; k++) {
      const rr = Math.max(...prof.map((row) => Math.hypot(row[k][0], row[k][2] - zcAxis)));
      prof.forEach((row, ri) => { const th = (k / KS) * Math.PI * 2; const o = rows[ri][1] - 0.003; row[k] = [Math.sin(th) * (rr + o), row[k][1], zcAxis + Math.cos(th) * (rr + o)]; });
    }
    const vid = prof.map((row) => row.map((p) => drape.v(p, skinAt(p, { allow: ['pelvis', 'spine_01', 'thigh_l', 'thigh_r'], scale: { thigh_l: 0.5, thigh_r: 0.5 } }), ZONE.sash)));
    const rowsC = vid.map((row, ri) => { const rc = []; for (let k = 0; k <= KS; k++) rc.push([row[k % KS], drape.t(mix(0.825, 0.99, ri / 3), mix(0.01, 0.4, k / KS))]); return rc; });
    for (let r = 0; r + 1 < rowsC.length; r++) for (let k = 0; k < KS; k++) drape.quad(rowsC[r][k], rowsC[r + 1][k], rowsC[r + 1][k + 1], rowsC[r][k + 1]);
    // knot: a squashed lump at θ = sashKnotTh, and two hanging ends (twisted strips) below it
    const kp = ringAt(sashY, Math.round(sashKnotTh / (Math.PI * 2) * KS), 0.016);
    const kd = norm([kp[0], 0, kp[2] - zcAxis]);
    const knotW = skinAt(kp, { allow: ['pelvis', 'spine_01', 'thigh_l'], scale: { thigh_l: 0.4 } });
    tube(drape, [madd(kp, kd, -0.012), madd(kp, kd, 0.006)], (t) => 0.022 * Math.sin(Math.PI * (0.2 + 0.6 * t)) + 0.006, 7, [0.825, 0.42, 0.99, 0.47], knotW, ZONE.sash, { capEnd: true });
    // hanging ends: flat strips draped down over the skirt front-left
    const tang = norm(cross([0, 1, 0], kd));
    for (const [off, L, wd, u0, u1] of [[-0.012, 0.3, 0.045, 0.825, 0.9], [0.014, 0.23, 0.04, 0.91, 0.99]]) {
      const pts = [];
      const nS = 8;
      for (let i = 0; i <= nS; i++) {
        const t = i / nS;
        let p = add(madd(kp, tang, off + 0.01 * t * (off > 0 ? 1 : -1) + 0.012 * Math.sin(t * 5 + off * 200) * t), [0, -L * t, 0]);
        // lie on the skirt surface (+6 mm)
        const pd = norm([p[0], 0, p[2] - zcAxis]);
        const hit = outerB.first([pd[0] * 0.7, p[1], zcAxis + pd[2] * 0.7], scl(pd, -1), 0.7);
        if (hit) p = madd(hit.p, pd, 0.007 + 0.004 * t);
        pts.push(p);
      }
      const rowsE = pts.map((p, i) => {
        const pd = norm([p[0], 0, p[2] - zcAxis]), tt = norm(cross([0, 1, 0], pd));
        const ww = wd * (1 - 0.25 * (i / nS)) / 2;
        const w = skirtSkin(p, 0);
        return [-1, 1].map((s) => drape.vt(madd(madd(p, tt, s * ww), pd, 0.0015 * (1 - Math.abs(s))), [s < 0 ? u0 : u1, mix(0.53, 0.43, i / nS)], w, ZONE.sash));
      });
      for (let i = 0; i < nS; i++) drape.quad(rowsE[i][0], rowsE[i + 1][0], rowsE[i + 1][1], rowsE[i][1]);
    }
  }

  // ---------------------------------------------------------------- HOOD (two panels, rolled rim) + MANTLE
  const headW = new Float32Array(h.pos.length / 3), neckW = new Float32Array(h.pos.length / 3);
  h.weights.forEach((l, v) => { for (const [b, w] of l) { if (b === sk.head.index) headW[v] += w; else if (b === sk.neck_01.index) neckW[v] += w; } });
  const hmin = [9, 9, 9], hmax = [-9, -9, -9];
  for (const v of h.baseObj.groupVerts('body')) if (headW[v] > 0.6) for (let k = 0; k < 3; k++) { hmin[k] = Math.min(hmin[k], h.pos[v * 3 + k]); hmax[k] = Math.max(hmax[k], h.pos[v * 3 + k]); }
  const HC = [0, (hmin[1] + hmax[1]) / 2 + 0.01, (hmin[2] + hmax[2]) / 2 - 0.005];
  const headTris = (() => { const out = []; for (let i = 0; i < fullTris.length; i += 6) { const vs = [fullTris[i], fullTris[i + 2], fullTris[i + 4]]; if (vs.every((v) => headW[v] + neckW[v] > 0.5)) out.push(...fullTris.slice(i, i + 6)); } return Int32Array.from(out); })();
  const headB = makeBVH([{ pos: h.pos, tris: headTris }]);
  const envR = (d) => { const hs = headB.hits(HC, d, 0.3); return hs.length ? hs[hs.length - 1].d : 0.1; };
  const neckTopY = sk.head.head.y;
  console.log(`${TAG} hood: head centre ${HC.map((x) => x.toFixed(3)).join(',')}, head box y ${hmin[1].toFixed(3)}..${hmax[1].toFixed(3)} z ${hmin[2].toFixed(3)}..${hmax[2].toFixed(3)}`);
  // rim (left panel, s 0 under the jaw -> 1 top centre) and back seam (s 0 nape -> 1 top centre), as yaw / pitch
  // (deep hood: the brim comes down to the brows and stands proud of the forehead, so the face sits in its shadow)
  // (the face opening rises to a soft point at the top centre: a pointed arch, not a straight beanie band)
  const rimYP = JSON.parse(process.env.SCREAMER_RIM || '[[50, -56], [58, -36], [60, -15], [57, 2], [47, 14], [26, 21], [0, 24]]');
  const seamYP = [[180, -36], [180, -8], [180, 30], [180, 62], [0, 90 - 1e-3], [0, 55], [0, rimYP[rimYP.length - 1][1]]];
  const curveDir = (yp, s) => {
    const pts = yp.map(([y, p]) => dirYP(y, p));
    const f = s * (pts.length - 1), k = Math.min(pts.length - 2, Math.floor(f)), t = f - k;
    const p0 = pts[Math.max(0, k - 1)], p1 = pts[k], p2 = pts[k + 1], p3 = pts[Math.min(pts.length - 1, k + 2)];
    return norm([0, 1, 2].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t * t + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t * t * t)));
  };
  const HOOD = { brim: 0.066, jaw: 0.032, peak: 0.046, sag: 0.016, fold: 0.011, crown: 0.027, pinch: 0.013, droop: 0.018, ...JSON.parse(process.env.SCREAMER_HOOD || '{}') };
  const HS = 17, HT = 13;            // hood rows (s) and columns (t: rim -> seam)
  // soft folds of heavy wool: creases radiating from the back-top corner of the two-panel hood (where the seam turns
  // down the back), more crowded towards the nape where the hood bunches on the mantle. -> 0..1 (1 = ridge)
  const foldQ = norm([0, 0.72, -0.69]), foldE1 = [1, 0, 0], foldE2 = norm(cross(foldQ, foldE1));
  const hoodFold = (d, freq = 6, sharp = 2) => {
    const th = Math.acos(Math.max(-1, Math.min(1, dot(d, foldQ))));
    const ph = Math.atan2(dot(d, foldE2), dot(d, foldE1));
    const w = 0.5 + 0.5 * Math.sin(ph * freq + 1.8 * N.noise(th * 2.5, ph * 0.8, 4.4) + th * 1.3);
    return { k: w ** sharp, f: ss(0.25, 0.85, th) * (1 - ss(1.7, 2.3, th)) };
  };
  const hoodPt = (s, t, side) => {
    let dR = curveDir(rimYP, s), dQ = curveDir(seamYP, s);
    if (side < 0) { dR = [-dR[0], dR[1], dR[2]]; dQ = [-dQ[0], dQ[1], dQ[2]]; }
    // quadratic bezier on the sphere through a side control (bulges the panel round the ear)
    const mid = norm(add(dR, dQ));
    const ctrl = norm(add(mid, [side * 0.26 * (1 - s) ** 0.7, 0, 0]));
    const d = norm(add(add(scl(dR, (1 - t) ** 2), scl(ctrl, 2 * t * (1 - t))), scl(dQ, t * t)));
    const rimGap = mix(HOOD.jaw, HOOD.brim, ss(0.3, 1.0, s));
    const bodyGap = HOOD.crown + 0.012 * ss(0.25, 0.7, s) - 0.01 * ss(0.25, 0, s);
    // a soft point on the crown just forward of the top (s .667 = top of the seam), drooping forward over the brim:
    // seen from the front the hood becomes a pointed arch instead of a flat-topped bucket
    const tipK = Math.exp(-(((s - 0.72) / 0.15) ** 2)) * ss(0.3, 1, t) ** 1.5;
    const peak = HOOD.peak * tipK;
    // upper corners pinched in (the arch's shoulders), never at ear height
    const pinch = HOOD.pinch * ss(0.3, 0.75, Math.abs(d[0])) * ss(0.2, 0.7, d[1]) * ss(0.15, 0.6, t);
    let r = envR(d) + mix(rimGap, bodyGap, ss(0, 0.45, t)) + peak - pinch;
    r += 0.004 * N.noise(d[0] * 9 + side, d[1] * 9, d[2] * 9) * ss(0, 0.3, t);
    { const fo = hoodFold(d); r += HOOD.fold * (fo.k - 0.35) * fo.f * ss(0.1, 0.5, t) * (1 - 0.6 * tipK); }
    let p = madd(HC, d, r);
    p = madd(p, norm([0, -0.55, 1]), HOOD.droop * tipK * tipK);   // the point flops forward and down (heavy wool)
    // the brim droops: its front edge sags a little lower than the crown line it hangs from, most at the top centre
    p[1] -= HOOD.sag * ss(0.55, 1, s) * (1 - ss(0, 0.35, t)) * (0.6 + 0.4 * ss(0.8, 1, s));
    return p;
  };
  const hoodW = (P) => {
    // the hood rides on the head, blending to the neck below the jaw / nape line, a touch of spine at the bottom
    const yRel = P[1] - neckTopY;
    const wh = ss(-0.035, 0.05, yRel + 0.02 * ss(0, 0.08, P[2] - HC[2]));
    return [['head', wh], ['neck_01', (1 - wh) * 0.8], ['spine_03', (1 - wh) * 0.2]];
  };
  const hoodRows = { L: [], R: [] };   // [s][t] vertex ids (position)
  const tipP = hoodPt(1, 0, 1);
  const tip = drape.v(tipP, hoodW(tipP), ZONE.hood);
  for (const side of [1, -1]) {
    const rows = [];
    for (let i = 0; i < HS; i++) {
      const s = i / HS, row = [];
      for (let j = 0; j <= HT; j++) {
        const t = j / HT;
        // the seam column (t = 1) is shared by both panels
        if (side < 0 && j === HT) { row.push(hoodRows.L[i][HT]); continue; }
        const p = hoodPt(s, t, side);
        row.push(drape.v(p, hoodW(p), ZONE.hood));
      }
      rows.push(row);
    }
    hoodRows[side > 0 ? 'L' : 'R'] = rows;
  }
  // ---- mantle: from the hood's bottom row, marched down over the neck / shoulders (8-30 mm clear of body + coat)
  const MR = 7;
  const collide = makeBVH([{ pos: h.pos, tris: fullTris }, { pos: coat.pos, tris: coatTris }]);
  const axisXZ = [0, sk.spine_03.tail.z];
  const mantleRows = { L: [], R: [] };
  const mantleLen = (t, side) => mix(0.19, 0.33, ss(0.0, 0.45, t)) - 0.02 * ss(0.7, 1, t) + 0.03 * N.noise(t * 6 + side * 3, 0.5, 2.2);
  for (const side of [1, -1]) {
    const rows = [];
    const bottom = hoodRows[side > 0 ? 'L' : 'R'][0];
    let cur = bottom.map((id) => drape.pos(id));
    let dir = cur.map((p) => norm(add(scl(norm([p[0], 0, p[2] - axisXZ[1]]), 0.45), [0, -1, 0])));
    for (let r = 1; r <= MR; r++) {
      const row = [];
      const next = [];
      for (let j = 0; j <= HT; j++) {
        if (side < 0 && j === HT) { row.push(mantleRows.L[r - 1][HT]); next.push(drape.pos(mantleRows.L[r - 1][HT])); continue; }
        const t = j / HT;
        const step = mantleLen(t, side) / MR;
        const clear = 0.012 + 0.0035 * r + 0.004 * ss(0.5, 1, t);
        let q = madd(cur[j], dir[j], step);
        for (let it = 0; it < 3; it++) {
          const c = collide.closest(q);
          if (!c) break;
          let n = c.n;
          const out = norm([q[0], 0, q[2] - axisXZ[1]]);
          if (dot(n, sub(q, c.p)) < 0 && c.d < 0.05) n = scl(n, -1);
          if (dot(n, out) < -0.2) n = scl(n, -1);
          const sd = dot(sub(q, c.p), n);
          if (sd < clear) q = madd(q, n, clear - sd); else break;
        }
        // pleats: alternate columns out / in a little more towards the hem
        q = madd(q, norm([q[0], 0, q[2] - axisXZ[1]]), 0.009 * (r / MR) * Math.sin(j * 1.7 + side) * ss(0.1, 0.4, t));
        const dd = norm(sub(q, cur[j]));
        q = madd(cur[j], dd, step);
        dir[j] = norm(add(add(scl(dir[j], 0.3), scl(dd, 0.7)), [0, -0.25, 0]));
        next.push(q);
        // weights: hood blend at the top, closest skin (shoulders follow the arms only partly) below
        const ws = skinAt(q, { allow: ['spine_03', 'spine_02', 'neck_01', 'clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r'], scale: { upperarm_l: 0.45, upperarm_r: 0.45 } });
        row.push(drape.v(q, blendW(hoodW(q), ws, ss(0, 3, r)), ZONE.mantle));
      }
      rows.push(row);
      cur = next;
    }
    mantleRows[side > 0 ? 'L' : 'R'] = rows;
  }
  // faces + uvs: hood panel s 0..1 -> v .70 .. .995, mantle rows -> v .70 .. .565; u by t (rim at the outside edge)
  const hoodVOf = (s) => mix(0.7, 0.99, s);
  for (const side of [1, -1]) {
    const key = side > 0 ? 'L' : 'R';
    const [u0, u1] = side > 0 ? [0.005, 0.395] : [0.795, 0.405];   // R mirrored so the seam meets in the middle
    const uOf = (t) => mix(u0, u1, t);
    const all = [...mantleRows[key].slice().reverse(), ...hoodRows[key]];   // bottom (mantle hem) -> top (hood)
    const vAt = (ri) => ri < MR ? mix(0.565, 0.7, (MR - (MR - ri)) / MR) : hoodVOf((ri - MR) / HS);
    const corner = [];
    for (let ri = 0; ri < all.length; ri++) corner.push(all[ri].map((id, j) => [id, drape.t(uOf(j / HT), vAt(ri))]));
    for (let ri = 0; ri + 1 < all.length; ri++) for (let j = 0; j < HT; j++) {
      if (side > 0) drape.quad(corner[ri][j], corner[ri][j + 1], corner[ri + 1][j + 1], corner[ri + 1][j]);
      else drape.quad(corner[ri][j], corner[ri + 1][j], corner[ri + 1][j + 1], corner[ri][j + 1]);
    }
    const tc = [tip, drape.t(mix(u0, u1, 0.5), 0.995)];
    const top = corner[all.length - 1];
    for (let j = 0; j < HT; j++) { if (side > 0) drape.tri(top[j], top[j + 1], tc); else drape.tri(top[j], tc, top[j + 1]); }
  }
  // rolled rim: tube along the left rim (jaw -> top) and on down the right rim
  {
    const rimIds = [...hoodRows.L.map((r) => r[0]), tip, ...hoodRows.R.map((r) => r[0]).reverse()];
    const pts = smoothLine(rimIds.map((id) => drape.pos(id)), 36);
    // the rolled hem sits on the panel edge, a few mm outward-forward
    const rp = pts.map((p) => madd(p, norm(sub(p, HC)), 0.003));
    tube(drape, rp, (t) => 0.0062 + 0.0012 * N.noise(t * 12, 0.3, 5.5), 5, [0.805, 0.57, 0.995, 0.99], (t, p) => hoodW(p), ZONE.rim);
  }
  // hood / mantle winding: outward (checked on the crown)
  const drapeVerts = drape.n;
  console.log(`${TAG} drape ${drapeVerts} verts, ${drape.F.length} tris`);

  // ---------------------------------------------------------------- HAIR: lank grey strand cards out of the hood
  const hairG = new Geo();
  {
    const surf = makeBVH([{ pos: h.pos, tris: fullTris }, { pos: coat.pos, tris: coatTris }, { pos: Float32Array.from(drape.P), tris: (() => { const t = []; for (const f of drape.F) { if (drape.Z[f.v[0]] === ZONE.mantle || drape.Z[f.v[0]] === ZONE.skirt) t.push(f.v[0], f.t[0], f.v[1], f.t[1], f.v[2], f.t[2]); } return Int32Array.from(t); })() }]);
    const front = (x, y) => {
      let best = -9;
      for (const [ox, oy] of [[0, 0], [0.008, 0], [-0.008, 0], [0, 0.008], [0, -0.008]]) {
        const hit = surf.first([x + ox, y + oy, eyeZ + 0.5], [0, 0, -1], 0.75);
        if (hit) best = Math.max(best, hit.p[2]);
      }
      return best > -9 ? best : eyeZ - 0.05;
    };
    // cards in the face plane: [x, dy (from eye height)] control points, widths root/mid/tip, uv column
    const defs = [];
    for (const s of [1, -1]) {
      defs.push(
        { pts: [[0.012, 0.075], [0.03, 0.06], [0.05, 0.03], [0.062, -0.01], [0.066, -0.06], [0.07, -0.12], [0.075, -0.2], [0.078, -0.28]], w: [0.022, 0.03, 0.012], u: [0.0, 0.25] },
        { pts: [[0.03, 0.07], [0.052, 0.045], [0.068, 0.0], [0.076, -0.05], [0.084, -0.11], [0.09, -0.18], [0.094, -0.24]], w: [0.02, 0.028, 0.01], u: [0.25, 0.5] },
        { pts: [[0.05, 0.06], [0.07, 0.025], [0.082, -0.02], [0.092, -0.08], [0.1, -0.15], [0.104, -0.21]], w: [0.018, 0.026, 0.008], u: [0.5, 0.75] },
        // (front card: ends at the cheekbone - running on down it crossed the jaw / throat in the scream)
        { pts: [[0.004, 0.08], [0.02, 0.066], [0.037, 0.038], [0.05, 0.004], [0.056, -0.03]], w: [0.012, 0.015, 0.005], u: [0.75, 1.0] },
      );
      for (const d of defs.slice(-4)) d.side = s;
    }
    const ids = [];
    for (const d of defs) {
      const pts2 = smoothLine(d.pts.map(([x, dy]) => [x * d.side + 0.004 * d.side, eyeY + dy]), 11);
      const n = pts2.length;
      let zPrev = null;
      const rows = [];
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const tg = norm([pts2[Math.min(n - 1, i + 1)][0] - pts2[Math.max(0, i - 1)][0], pts2[Math.min(n - 1, i + 1)][1] - pts2[Math.max(0, i - 1)][1], 0]);
        const pr = [-tg[1], tg[0]];
        const w = (t < 0.4 ? mix(d.w[0], d.w[1], t / 0.4) : mix(d.w[1], d.w[2], (t - 0.4) / 0.6)) / 2;
        const xy = [-1, 1].map((sg) => [pts2[i][0] + pr[0] * w * sg, pts2[i][1] + pr[1] * w * sg]);
        const clear = mix(0.003, 0.009, t ** 1.1);
        let zs = xy.map(([x, y]) => front(x, y) + clear);
        if (zPrev) zs = zs.map((z, k) => Math.max(z, zPrev[k] - 0.012));
        zPrev = zs;
        rows.push(xy.map(([x, y], k) => {
          const p = [x, y, zs[k]];
          // head and neck only, the neck share capped (bound to the chest the tips stayed behind when the head
          // turned / tipped back in the scream and the cards stretched into white streaks across the jaw)
          const yRel = y - A.neck[1];
          const wNeck = 0.42 * (1 - ss(-0.02, 0.09, yRel));
          return hairG.vt(p, [d.u[k], 1 - t], [['head', 1 - wNeck], ['neck_01', wNeck]]);
        }));
      }
      for (let i = 0; i + 1 < n; i++) { if (d.side > 0) hairG.quad(rows[i][0], rows[i + 1][0], rows[i + 1][1], rows[i][1]); else hairG.quad(rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]); }
      ids.push(rows);
    }
  }

  // ---------------------------------------------------------------- GEAR: claws, necklace + disc, sash fetishes
  const gear = new Geo();
  // atlas (512): claws u 0-.25; cord u .25-.4; bones u .4-.7; disc u .7-1 (v .5-1 front face, sigil glows); pouch v < .5
  const fingers = ['thumb', 'index', 'middle', 'ring', 'pinky'];
  for (const s of ['l', 'r']) {
    for (const f of fingers) {
      const b = sk[`${f}_03_${s}`];
      if (!b) continue;
      const a = V(b.head), e = V(b.tail), d = norm(sub(e, a));
      // nail plate on the dorsal side of the last segment, running past the tip into a hooked point
      const handB = sk[`hand_${s}`];
      const pl = norm(sub(V(sk[`index_01_${s}`].head), V(sk[`pinky_01_${s}`].head)));
      let dors = norm(cross(d, pl));
      if ((s === 'l' && dors[0] < 0) || (s === 'r' && dors[0] > 0)) dors = scl(dors, -1);
      const segL = dist(a, e);
      const ln = f === 'thumb' ? 0.018 : 0.024;
      const pts = [];
      for (let i = 0; i <= 3; i++) { const t = i / 3; pts.push(madd(madd(e, d, -segL * 0.55 + (segL * 0.55 + ln) * t), dors, 0.0042 - 0.0075 * t * t)); }
      // (3-sided: a keeled horn claw; the fetish budget went to the hood crown)
      tube(gear, pts, (t) => (f === 'thumb' ? 0.0045 : 0.0039) * (1 - t * 0.85), 3, [0.02, 0.05, 0.23, 0.95], [[b.name, 1]], 0, { ref: dors });
      void handB;
    }
  }
  // necklace cord: a loop round the neck UNDER the mantle (on the coat / skin), dipping to the chest at the front where
  // the mantle opens (laid over the torn mantle it floated across the gaps between the tatters and off the shoulders)
  const underAll = makeBVH([{ pos: h.pos, tris: fullTris }, { pos: coat.pos, tris: coatTris }]);
  const neckBase = sk.neck_01.head.y;
  const cordPts = [];
  const NC = 18;
  for (let k = 0; k < NC; k++) {
    const ph = (k / NC) * Math.PI * 2;                       // 0 = front
    const fr = ((1 + Math.cos(ph)) / 2) ** 2.2;
    const y = neckBase - 0.035 - 0.12 * fr;
    const d = [Math.sin(ph), 0, Math.cos(ph)];
    const c = [0, y, sk.spine_03.tail.z + 0.015 * fr];
    const hs = underAll.hits(madd(c, d, 0.4), scl(d, -1), 0.4);
    const p = hs.length ? madd(hs[0].p, d, 0.004) : madd(c, d, 0.1);
    cordPts.push(p);
  }
  cordPts.push(cordPts[0]);
  const cordW = (t, p) => skinAt(p, { allow: ['spine_03', 'neck_01', 'clavicle_l', 'clavicle_r'] });
  tube(gear, cordPts, 0.0028, 3, [0.26, 0.02, 0.39, 0.98], cordW, 0);
  // pendants: finger bones (2 each side) and the carved disc in the middle
  const frontP = cordPts[0];
  const chestN = (() => { const c = underAll.closest(frontP); return c && c.n[2] > 0 ? c.n : [0, 0, 1]; })();
  const pend = (p, L, r, k) => {
    const top = p, bot = add(madd(p, chestN, 0.006), [0, -L, 0]);
    const pts = [top, add(mix3(top, bot, 0.18), scl(chestN, 0.002)), mix3(top, bot, 0.82), bot];
    tube(gear, pts, (t) => r * (1 + 0.45 * Math.exp(-(((t - 0.1) / 0.14) ** 2)) + 0.4 * Math.exp(-(((t - 0.9) / 0.14) ** 2))), 4, [0.42 + 0.07 * k, 0.05, 0.47 + 0.07 * k, 0.95], [['spine_03', 1]], 0, { capEnd: true });
  };
  for (const [ci, L, r, k] of [[1, 0.04, 0.0035, 0], [NC - 1, 0.045, 0.0037, 1], [2, 0.032, 0.0032, 2], [NC - 2, 0.034, 0.0032, 3]]) pend(cordPts[ci], L, r, k);
  // disc: 12-gon, 4 mm thick, hanging 1.5 cm under the cord
  const discC = add(madd(frontP, chestN, 0.007), [0, -0.034, 0]);
  {
    const R = 0.02, nS = 10, up = [0, 1, 0];
    const ax = norm(cross(up, chestN)), ay = norm(cross(chestN, ax));
    const ring = (o, rr, v0, v1, uvScale) => { const out = []; for (let k = 0; k <= nS; k++) { const a = (k / nS) * Math.PI * 2; const p = madd(madd(madd(discC, chestN, o), ax, Math.cos(a) * rr), ay, Math.sin(a) * rr); out.push(gear.vt(p, uvScale ? [0.85 + Math.cos(a) * 0.14, 0.75 + Math.sin(a) * 0.235] : [mix(0.7, 1, k / nS), mix(v0, v1, 0.5)], [['spine_03', 1]])); } return out; };
    const fr = ring(0.002, R, 0, 0, true), bk = ring(-0.002, R, 0, 0, false), cF = gear.vt(madd(discC, chestN, 0.0025), [0.85, 0.75], [['spine_03', 1]]), cB = gear.vt(madd(discC, chestN, -0.0025), [0.85, 0.25], [['spine_03', 1]]);
    const fr2 = ring(0.002, R, 0.45, 0.5, false), bk2 = ring(-0.002, R, 0.45, 0.5, false);
    for (let k = 0; k < nS; k++) { gear.tri(cF, fr[k], fr[k + 1]); gear.tri(cB, bk[k + 1], bk[k]); gear.quad(fr2[k], bk2[k], bk2[k + 1], fr2[k + 1]); }
    // bail: short cord loop from the necklace to the disc
    tube(gear, [madd(frontP, chestN, 0.003), madd(discC, ay, R + 0.002)], 0.0022, 4, [0.26, 0.02, 0.39, 0.2], [['spine_03', 1]], 0);
  }
  // sash fetishes (right hip): three bones on thongs and a small leather pouch
  {
    const th0 = -0.95;
    const outerS = makeBVH([{ pos: Float32Array.from(drape.P), tris: (() => { const t = []; for (const f of drape.F) if (drape.Z[f.v[0]] === ZONE.skirt || drape.Z[f.v[0]] === ZONE.sash) t.push(f.v[0], f.t[0], f.v[1], f.t[1], f.v[2], f.t[2]); return Int32Array.from(t); })() }]);
    const onSkirt = (th, y, o) => { const d = [Math.sin(th), 0, Math.cos(th)]; const hit = outerS.first([d[0] * 0.7, y, zcAxis + d[2] * 0.7], scl(d, -1), 0.7); return hit ? madd(hit.p, d, o) : [d[0] * 0.25, y, zcAxis + d[2] * 0.25]; };
    let k = 0;
    for (const [dth, L, thong] of [[-0.12, 0.05, 0.06], [0.02, 0.045, 0.1], [0.16, 0.055, 0.075]]) {
      const top = onSkirt(th0 + dth, sashY - sashH / 2, 0.006);
      const knot = onSkirt(th0 + dth, sashY - sashH / 2 - thong, 0.008);
      const w = skirtSkin(knot, 0);
      tube(gear, [top, knot], 0.0016, 3, [0.26, 0.02, 0.39, 0.3], w, 0);
      const bot = onSkirt(th0 + dth, sashY - sashH / 2 - thong - L, 0.01);
      tube(gear, [knot, mix3(knot, bot, 0.5), bot], (t) => 0.004 * (1 + 0.5 * Math.exp(-(((t) / 0.15) ** 2)) + 0.5 * Math.exp(-(((t - 1) / 0.15) ** 2))), 4, [0.42 + 0.07 * (k % 4), 0.05, 0.47 + 0.07 * (k % 4), 0.95], w, 0, { capEnd: true });
      k++;
    }
    // pouch: a squashed sack hanging from the sash
    const pc = onSkirt(th0 - 0.32, sashY - sashH / 2 - 0.05, 0.022);
    const pd = norm([pc[0], 0, pc[2] - zcAxis]);
    const pw = skirtSkin(pc, 0);
    const pts = [add(pc, [0, 0.05, 0]), add(pc, [0, 0.03, 0]), pc, add(pc, [0, -0.03, 0]), add(pc, [0, -0.045, 0])];
    tube(gear, pts.map((p) => madd(p, pd, 0)), (t) => [0.008, 0.02, 0.028, 0.024, 0.006][Math.min(4, Math.round(t * 4))], 6, [0.7, 0.02, 1.0, 0.42], pw, 0, { capEnd: true });
  }
  const gearPart = toPart(lib, h, gear, 'fetish', 'gear', () => [['spine_03', 1]]);
  // claws stay with their hands (3 / 5); necklace and sash fetishes are torso (no leg / head segment carries them off)
  for (let v = 0; v < gearPart.nVerts; v++) if (gearPart.seg[v] !== 3 && gearPart.seg[v] !== 5) gearPart.seg[v] = 0;

  // ---------------------------------------------------------------- parts from geometry
  const drapePart = toPart(lib, h, drape, 'mantle', 'cloth', () => [['spine_03', 1]]);
  for (let v = 0; v < drapePart.nVerts; v++) { const z = drapePart.zone[v]; if (z === ZONE.skirt || z === ZONE.sash || z === ZONE.mantle) drapePart.seg[v] = 0; }
  const hairPart = toPart(lib, h, hairG, 'hair', 'hair', () => [['head', 1]]);
  const cavity = toPart(lib, h, mouthCavity(h, body, A), 'mouth', 'gore', () => [['head', 1]]);

  // =========================================================================================== tear fields (3D)
  const foreL = boneSeg(sk.lowerarm_l), foreR = boneSeg(sk.lowerarm_r), upL = boneSeg(sk.upperarm_l), upR = boneSeg(sk.upperarm_r);
  // coat: sleeves torn off ragged above the wrists, holes (back, left front, right elbow), ragged jacket hem
  const coatTear = (P) => {
    let w = 0;
    for (const [fore, sd] of [[foreL, 1], [foreR, -1]]) {
      const f = fore(P);
      if (f.d < 0.09) w = Math.max(w, ss(0.64, 0.74, f.t + N.fbm(P[0] * 26 + sd, P[1] * 26, P[2] * 26, 3) * 0.09 + N.noise(P[0] * 90, P[1] * 90, P[2] * 90) * 0.02) * 1.4);
    }
    const holes = [[[-0.07, 1.22, -0.12], 0.035], [[0.09, 1.02, -0.11], 0.028], [[0.1, 1.18, 0.12], 0.022]];
    for (const [c, r] of holes) {
      const cc = [c[0], c[1] / 1.81 * h.height, c[2]];
      w = Math.max(w, 1.3 * (1 - ss(r * 0.4, r, dist(P, cc) + N.fbm(P[0] * 40, P[1] * 40, P[2] * 40, 3) * r * 0.6)));
    }
    const elbow = upR(P);
    if (elbow.d < 0.08 && elbow.t > 0.85) w = Math.max(w, 1.3 * (1 - ss(0.008, 0.022, dist(P, madd(V(sk.lowerarm_r.head), [0, 0, -1], 0.035)) + N.fbm(P[0] * 50, P[1] * 50, P[2] * 50, 2) * 0.01)));
    // ragged jacket hem (it hangs over the skirt: tears there only show more skirt)
    w = Math.max(w, ss(hemY + 0.03, hemY + 0.004, P[1] + N.fbm(P[0] * 20, P[1] * 4, P[2] * 20, 3) * 0.03) * 1.2);
    return w;
  };
  const coatCut = (P) => coatTear(P) > 1;
  // skin kept under coat holes / torn sleeves
  h.hideCovered(body, (p) => coatTear(p) > 0.75 || (foreL(p).t > 0.55 && foreL(p).d < 0.08) || (foreR(p).t > 0.55 && foreR(p).d < 0.08));
  // hips and upper thighs inside the skirt (above the slit / vent tops) are never seen - except where a swinging
  // thigh would push them through the cloth: dropped (the thighs below are painted as a dark wool under-shift)
  const SHIFT_LOW = 0.7 / 1.81 * h.height;
  {
    const legW = (v) => body.weights[v].reduce((a, [b, w]) => a + (/^(pelvis|thigh_|spine_01)/.test(h.skeleton.bones[b].name) ? w : 0), 0);
    let n = 0;
    body.obj.faces.forEach((f, fi) => {
      if (!body.keep[fi]) return;
      if (f.v.every((v) => body.pos[v * 3 + 1] > SHIFT_LOW + 0.01 && body.pos[v * 3 + 1] < hemY + 0.03 && legW(v) > 0.9)) { body.keep[fi] = 0; n++; }
    });
    console.log(`${TAG} ${n} hip / upper-thigh faces dropped under the skirt`);
  }
  // rounder heels: the proxy's heel is a hard right-angled corner. The back-bottom edge is pulled onto a 3 cm
  // radius arc (side profile), then the heel vertices are relaxed (Laplacian, 3 passes, the sole kept on the ground)
  {
    const nb = Array.from({ length: body.nVerts }, () => new Set());
    body.obj.faces.forEach((f) => { for (let k = 0; k < f.v.length; k++) { const a = f.v[k], b = f.v[(k + 1) % f.v.length]; nb[a].add(b); nb[b].add(a); } });
    const heel = [];
    for (const s of ['l', 'r']) {
      const ank = V(sk[`foot_${s}`].head);
      const mine = [];
      for (let v = 0; v < body.nVerts; v++) {
        const p = [body.pos[v * 3], body.pos[v * 3 + 1], body.pos[v * 3 + 2]];
        if (Math.sign(p[0]) === (s === 'l' ? 1 : -1) && p[1] < ank[1] * 0.75 && p[2] < ank[2] + 0.005 && Math.abs(p[0] - ank[0]) < 0.06) { heel.push([v, ss(ank[1] * 0.75, ank[1] * 0.35, p[1])]); mine.push(v); }
      }
      const zMin = Math.min(...mine.map((v) => body.pos[v * 3 + 2]));
      const R = 0.03, Cy = R, Cz = zMin + R;
      for (const v of mine) {
        const y = body.pos[v * 3 + 1], z = body.pos[v * 3 + 2];
        if (y >= Cy || z >= Cz) continue;
        const l = Math.hypot(y - Cy, z - Cz);
        if (l <= R) continue;
        body.pos[v * 3 + 1] = Math.max(0.002, Cy + (y - Cy) * R / l);
        body.pos[v * 3 + 2] = Cz + (z - Cz) * R / l;
      }
    }
    for (let it = 0; it < 3; it++) {
      const next = heel.map(([v, w]) => {
        const c = [0, 0, 0];
        for (const u of nb[v]) for (let k = 0; k < 3; k++) c[k] += body.pos[u * 3 + k] / nb[v].size;
        return [v, [0, 1, 2].map((k) => mix(body.pos[v * 3 + k], c[k], (k === 1 && body.pos[v * 3 + 1] < 0.012 ? 0 : 0.45) * w))];
      });
      for (const [v, p] of next) { body.pos[v * 3] = p[0]; body.pos[v * 3 + 1] = p[1]; body.pos[v * 3 + 2] = p[2]; }
    }
    console.log(`${TAG} ${heel.length} heel vertices smoothed`);
  }

  // =========================================================================================== PAINT: skin
  const baseSkinSrc = 'skins/old_caucasian_female/old_lightskinned_female_diffuse.png';
  const skinBase = lib.cloneImage(await lib.texture('system', baseSkinSrc, 2048));
  {
    // mean luminance over the painted body (skin islands) -> a cold pale grey at ~sRGB 150 before decay tints
    const bp = h.basePart({ name: 'mask' });
    const r = rasterUV(bp.tris(), h.baseObj.uvs, skinBase.width, 0);
    let s = 0, n = 0;
    for (let i = 0; i < r.covered.length; i += 7) if (r.covered[i]) { const d = i * 4; s += lumOf([S2L[skinBase.data[d]], S2L[skinBase.data[d + 1]], S2L[skinBase.data[d + 2]]]); n++; }
    const mean = s / n, target = S2L[150];
    grade(skinBase, (c) => {
      const l = lumOf(c);
      const g = [l * 0.97, l * 0.985, l * 1.03];
      for (let i = 0; i < 3; i++) c[i] = mix(c[i], g[i], 0.82) * (target / mean);
    });
  }
  const skinBump = lib.cloneImage(await lib.texture('skins03', 'skins/sohh_female_zombie_skin/sohh_Zombie_Female_bump.png', 2048));
  // legs: the sohh decay bump at a third of its strength, plus a finer pore / wrinkle grain (full strength it read as
  // white fleece on the long bare legs). Done on the bump itself so the painted relief (veins, knee creases) stays.
  const legMask = (P) => (Math.abs(P[0]) < 0.31 ? ss(hipY - 0.02, hipY - 0.1, P[1]) : 0);
  {
    const S = skinBump.width, d = skinBump.data;
    const r = rasterUV(fullTris, h.baseObj.uvs, S, 8);
    const lum = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) lum[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
    const low = blurField(lum, S, S, 6, 2);
    const P = [0, 0, 0], Nn = [0, 0, 0];
    let s2 = 0, n = 0;
    const m = new Float32Array(S * S), fine = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) {
      if (!texelSurface(r, fullTris, h.pos, fullNrm, i, P, Nn)) continue;
      m[i] = legMask(P);
      if (!m[i]) continue;
      s2 += (lum[i] - low[i]) ** 2; n++;
      fine[i] = 0.6 * N.fbm(P[0] * 170, P[1] * 120, P[2] * 170, 2) + 0.4 * (N.ridged(P[0] * 70, P[1] * 260, P[2] * 70, 2) - 0.5);
    }
    const sd = Math.sqrt(s2 / (n || 1));
    for (let i = 0; i < S * S; i++) {
      if (!m[i]) continue;
      const v = Math.max(0, Math.min(255, low[i] + (lum[i] - low[i]) * mix(1, 0.33, m[i]) + m[i] * fine[i] * sd * 0.55));
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = Math.round(v);
    }
    console.log(`${TAG} leg bump: high-pass sd ${sd.toFixed(1)} -> x0.33 + fine grain`);
  }
  // markings ------------------------------------------------------------------------------------------------
  // face lines in the face plane: [|x|, y - eyeY] (metres), mirrored; widths taper along each line
  const tearVein = [[0.029, -0.013], [0.032, -0.03], [0.037, -0.05], [0.043, -0.073], [0.048, -0.098], [0.05, -0.112]];
  const tearBranchA = [[0.034, -0.04], [0.045, -0.05], [0.057, -0.058], [0.066, -0.07]];
  const tearBranchB = [[0.044, -0.077], [0.038, -0.089], [0.031, -0.097]];
  const templeVein = [[0.047, 0.003], [0.056, 0.016], [0.062, 0.03], [0.064, 0.045]];
  // forehead "seer" sigil: almond eye, pupil dot, three rays up (1 cm lower than first drawn: the hood rim hid it)
  const SIG = { y: 0.036, w: 0.0165, h: 0.0068 };
  const sigRays = [70, 90, 110].map((deg) => { const a = deg * Math.PI / 180; return [[Math.cos(a) * 0.012, SIG.y + 0.006 + Math.sin(a) * 0.004], [Math.cos(a) * 0.026, SIG.y + 0.006 + Math.sin(a) * 0.02]]; });
  const throatY = A.neck[1] + 0.035;
  const handFrames = ['l', 'r'].map((s) => {
    const wr = V(sk[`hand_${s}`].head);
    const fingerDir = norm(sub(V(sk[`middle_01_${s}`].head), wr));
    const pl = norm(sub(V(sk[`index_01_${s}`].head), V(sk[`pinky_01_${s}`].head)));
    let dors = norm(cross(fingerDir, pl));
    if ((s === 'l' && dors[0] < 0) || (s === 'r' && dors[0] > 0)) dors = scl(dors, -1);
    const chains = fingers.map((f) => [1, 2, 3].map((i) => V(sk[`${f}_0${i}_${s}`].head)).concat([V(sk[`${f}_03_${s}`].tail)]));
    return { s, wr, dors, chains, fore: s === 'l' ? foreL : foreR };
  });
  /** -> { ink 0..1 (dark core), halo 0..1 (bruise-violet under the skin round it), glow 0..1 } */
  const markings = (P, Nn) => {
    let ink = 0, halo = 0, glow = 0;
    const line = (d, w) => 1 - ss(w * 0.5, w, d);
    const hal = (d, w) => 1 - ss(w, w + 0.0045, d);
    if (P[1] > A.neck[1] + 0.03 && P[2] > HC[2] + 0.01) {
      // ---- face (2D in the face plane, mirrored)
      const ax = Math.abs(P[0]), fy = P[1] - eyeY, sd = Math.sign(P[0]) || 1;
      const wob = N.noise(fy * 70, sd * 3.1, P[2] * 30) * 0.0016;
      const q = [ax + wob, fy];
      const wv = (s, w0, w1) => mix(w0, w1, s) * (0.75 + 0.5 * (0.5 + 0.5 * N.noise(s * 9, sd, 4.4)));
      for (const [pts, w0, w1, gl] of [[tearVein, 0.003, 0.0013, 1], [tearBranchA, 0.0017, 0.0009, 0.5], [tearBranchB, 0.0015, 0.0009, 0.3], [templeVein, 0.0017, 0.0009, 0.6]]) {
        const [d, sP] = polyDist(q, pts);
        const w = wv(sP, w0, w1);
        const k = line(d, w);
        ink = Math.max(ink, k); halo = Math.max(halo, hal(d, w));
        glow = Math.max(glow, k * gl);
      }
      // seer sigil on the forehead
      const qx = P[0] + N.noise(fy * 90, 0.7, 0.2) * 0.0005, qy = fy - SIG.y;
      let kS = 0, dS = 1;
      if (Math.abs(qx) < SIG.w * 1.1) { const arc = SIG.h * (1 - (qx / SIG.w) ** 2); dS = Math.abs(Math.abs(qy) - Math.max(0, arc)); kS = line(dS, 0.0012); }
      const dot0 = Math.hypot(qx, qy);
      kS = Math.max(kS, line(dot0, 0.0032));
      for (const [r0, r1] of sigRays) { const [d, sP] = polyDist([qx, fy], [r0, r1]); kS = Math.max(kS, line(d, mix(0.0012, 0.0006, sP))); dS = Math.min(dS, d); }
      // (finger-daubed: uneven density along the strokes)
      ink = Math.max(ink, kS * (0.62 + 0.38 * ss(-0.45, 0.35, N.noise(P[0] * 420, P[1] * 380, 2.7)))); halo = Math.max(halo, hal(Math.min(dS, dot0), 0.0012));
      const eyeD0 = Math.min(dist(P, A.eyeL), dist(P, A.eyeR));
      glow *= 1 - ss(0.008, 0.026, eyeD0);
      glow = Math.max(glow, line(dot0, 0.0032) * 0.8);
      // the lids round the eyes catch their light: a thin violet rim makes the glowing eyes read from 10+ m
      glow = Math.max(glow, (1 - ss(0.011, 0.02, eyeD0)) * 0.75);
      // three short chin lines under the lower lip
      const mouthLo = A.mouth[1] - eyeY - 0.024;
      for (const [x0, y1] of [[0, mouthLo - 0.036], [0.01, mouthLo - 0.028]]) {
        if (fy < mouthLo - 0.008 && fy > y1) {
          const d = Math.abs(ax - x0 - (mouthLo - fy) * 0.12 * Math.sign(x0) + N.noise(fy * 120, x0 * 50, 1.1) * 0.0005);
          const k = line(d, 0.0011) * ss(y1, y1 + 0.006, fy) * ss(mouthLo - 0.008, mouthLo - 0.013, fy);
          ink = Math.max(ink, k); halo = Math.max(halo, hal(d, 0.001) * ss(y1, y1 + 0.006, fy));
        }
      }
      // branching veinlets round the main lines
      const vl = N.ridged(P[0] * 210, P[1] * 160, P[2] * 210, 2);
      ink = Math.max(ink, halo * ss(0.8, 0.95, vl) * 0.7);
    } else if (P[1] > A.neck[1] - 0.07 && P[1] < A.neck[1] + 0.07 && Nn[2] > -0.1) {
      // ---- throat sigil: a ring on the larynx, veins radiating from it
      const x = P[0], y = P[1] - throatY;
      const r = Math.hypot(x, y * 1.1);
      const ring = line(Math.abs(r - 0.016), 0.0021), ring2 = line(Math.abs(r - 0.0095), 0.0013);
      const ang = Math.atan2(y, x);
      const ray = r > 0.017 && r < 0.055 ? line(Math.abs(Math.sin(ang * 3.5 + N.noise(r * 60, ang, 2.1) * 0.5)) * r, 0.0018) * (1 - ss(0.033, 0.055, r)) : 0;
      const vl = N.ridged(P[0] * 180, P[1] * 140, P[2] * 180, 2);
      ink = Math.max(ring, ring2, ray, ss(0.8, 0.95, vl) * (1 - ss(0.02, 0.06, r)) * 0.7);
      halo = Math.max(hal(Math.abs(r - 0.016), 0.0016), (1 - ss(0.0, 0.02, r)) * 0.4);
      glow = Math.max(ring2, ring * 0.5) * (Nn[2] > 0.3 ? 0.8 : 0.3);
    }
    // ---- hands / forearms
    for (const hf of handFrames) {
      const f = hf.fore(P);
      const dw = dist(P, hf.wr);
      if (dw > 0.2 && f.d > 0.07) continue;
      const back = dot(Nn, hf.dors);
      if (dw < 0.16 && back > 0.15) {
        // lines along the back of each finger, converging over the back of the hand on the wrist
        const W = madd(hf.wr, hf.dors, 0.012);
        for (const ch of hf.chains) {
          const ridge = ch.map((p) => madd(p, hf.dors, 0.0065));
          const [d] = polyDist(P, ridge);
          ink = Math.max(ink, line(d, 0.0011) * ss(0.15, 0.4, back)); halo = Math.max(halo, hal(d, 0.0011) * ss(0.15, 0.4, back));
          const [d2] = polyDist(P, [madd(ch[0], hf.dors, 0.009), W]);
          ink = Math.max(ink, line(d2 + N.noise(P[0] * 300, P[1] * 300, P[2] * 300) * 0.0004, 0.0012) * ss(0.15, 0.4, back));
        }
      }
      if (f.d < 0.07) {
        // double wrist rings, two veins running up the back of the forearm
        const fromWrist = (1 - f.t) * f.L;
        ink = Math.max(ink, line(Math.abs(fromWrist - 0.018), 0.0013), line(Math.abs(fromWrist - 0.03), 0.001));
        halo = Math.max(halo, hal(Math.abs(fromWrist - 0.018), 0.0013), hal(Math.abs(fromWrist - 0.03), 0.001));
        if (fromWrist > 0.03 && fromWrist < 0.17 && back > -0.2) {
          const side = dot(sub(P, f.a), norm(cross(hf.dors, sub(V(sk[`hand_${hf.s}`].head), V(sk[`lowerarm_${hf.s}`].head)))));
          const wv = N.noise(fromWrist * 40, hf.s === 'l' ? 1 : 2, 0.5) * 0.004;
          ink = Math.max(ink, line(Math.abs(side - 0.008 + wv), 0.0012) * ss(0.17, 0.12, fromWrist), line(Math.abs(side + 0.009 - wv), 0.0011) * ss(0.15, 0.1, fromWrist));
        }
      }
    }
    return { ink, halo, glow };
  };
  const inkCol = lin([34, 22, 42]), lipCol = lin([86, 62, 82]), hairRoot = lin([150, 146, 138]);
  const tips = [];
  for (const s of ['l', 'r']) for (const f of fingers) tips.push(V(sk[`${f}_03_${s}`].tail));
  const knees = ['l', 'r'].map((s) => V(sk[`calf_${s}`].head));
  const feet = ['l', 'r'].map((s) => {
    const ball = V(sk[`ball_${s}`].head), tip = V(sk[`ball_${s}`].tail), sg = s === 'l' ? 1 : -1;
    const f = norm([tip[0] - ball[0], 0, tip[2] - ball[2]]);
    return { sg, ball, f, lat: scl([f[2], 0, -f[0]], sg), L: dist(ball, tip) };
  });
  console.log(`${TAG} feet: ball ${feet[0].ball.map((x) => x.toFixed(3))} toe length ${feet[0].L.toFixed(3)}, hand ${A.handL.map((x) => x.toFixed(2))}`);
  const skin = lib.paintSkin(h, {
    seed: 23,
    base: skinBase,
    bump: skinBump, bumpStrength: 4.2, normalStrength: 2.4,
    pallor: 0.35, tint: lin([150, 150, 156]), mottle: 0.55, veins: 0.7, bruises: 0.25, socket: 1, lips: 0.6, grime: 0.4,
    coveredDarken: 0.6, coveredShade: 0.15,
    blood: { mouth: 0.35, hands: 0, splatter: 0.05 },
    extra: (P, Nn, c, st) => {
      // cold violet livor in the hollows, grey-violet lips
      mul(c, [0.9, 0.86, 0.98], ss(0.1, 0.6, N.fbm(P[0] * 5 + 2, P[1] * 5, P[2] * 5, 3)) * 0.45);
      over(c, lipCol, (1 - ss(0.012, 0.026, dist(P, A.mouth))) * 0.45);
      // scalp under the hood: grey hair roots painted where the strand cards leave off (centre parting)
      if (P[1] > eyeY + 0.045 && P[2] < eyeZ + 0.03) over(c, hairRoot, ss(eyeY + 0.045, eyeY + 0.065, P[1]) * (1 - ss(0.0, 0.004, Math.abs(P[0]) - 0.002) * 0.4) * 0.85);
      // sparse grey brows
      const ax = Math.abs(P[0]);
      if (P[2] > eyeZ - 0.02 && ax > 0.012 && ax < 0.058) { const yb = eyeY + 0.018 + 0.004 * (1 - ((ax - 0.035) / 0.023) ** 2); over(c, lin([118, 112, 106]), (1 - ss(0.0016, 0.0034, Math.abs(P[1] - yb))) * ss(-0.2, 0.5, N.noise(P[0] * 900, P[1] * 250, 1.3)) * 0.6); }
      // dark, livid fingertips round the claws
      let dt = 1;
      for (const t of tips) dt = Math.min(dt, dist(P, t));
      mul(c, [0.6, 0.52, 0.66], (1 - ss(0.012, 0.05, dt)) * 0.55);
      // ---- legs: corpse skin with tonal life (they read as flat white fleece): livid mottling, darker shins and
      // ankles, faint violet-black veins in her marking language, knee definition, toes
      const lk = legMask(P);
      if (lk > 0) {
        const m1 = N.fbm(P[0] * 9 + 4, P[1] * 6, P[2] * 9, 3), m2 = N.fbm(P[0] * 26 - 2, P[1] * 18, P[2] * 26, 2);
        mul(c, [0.84, 0.8, 0.94], ss(0.0, 0.55, m1) * 0.55 * lk);
        mul(c, [0.94, 0.96, 0.88], ss(0.05, 0.6, m2) * 0.35 * lk);
        mul(c, [0.84, 0.8, 0.85], ss(kneeY - 0.04, ankleY + 0.02, P[1]) * 0.55 * lk);
        const vk = ss(0.8, 0.93, N.ridged(P[0] * 30, P[1] * 17, P[2] * 30, 3)) * ss(-0.05, 0.4, N.fbm(P[0] * 5 + 11, P[1] * 4, P[2] * 5, 2)) * lk;
        over(c, mix3(inkCol, c, 0.45), vk * 0.38); st.h += vk * 0.05;
        for (const kn of knees) {
          const dy = P[1] - kn[1], dx = P[0] - kn[0];
          if (Math.sign(P[0]) !== Math.sign(kn[0]) || Math.abs(dy) > 0.085 || Math.abs(dx) > 0.08) continue;
          if (Nn[2] > 0.15) {
            // kneecap: a bony, lighter cap with a darker rim, two wrinkle creases above it
            const rr = Math.hypot(dx * 1.15, dy - 0.004);
            const rim = (1 - ss(0.002, 0.007, Math.abs(rr - 0.034 + N.noise(dx * 90, dy * 90, 2.2) * 0.003))) * (dy > -0.015 ? 1 : 0.45);
            over(c, lin([90, 82, 90]), rim * 0.35); st.h -= rim * 0.5;
            const cap = 1 - ss(0.01, 0.03, rr);
            mul(c, [1.07, 1.06, 1.05], cap * 0.6); st.h += cap * 0.4;
            for (const yy of [0.044, 0.056]) { const w = 1 - ss(0.0012, 0.003, Math.abs(dy - yy - dx * dx * 6)); over(c, lin([94, 86, 94]), w * 0.3 * ss(0.032, 0.012, Math.abs(dx))); st.h -= w * 0.35; }
          } else if (Nn[2] < -0.15) {
            const w = 1 - ss(0.002, 0.006, Math.abs(dy + 0.004 + N.noise(dx * 60, 1.7, 0.3) * 0.003));
            over(c, lin([82, 72, 86]), w * 0.5 * ss(0.05, 0.02, Math.abs(dx))); st.h -= w * 0.6;
          }
        }
        for (const ft of feet) {
          if (Math.sign(P[0]) !== ft.sg || P[1] > 0.06) continue;
          const rel = sub(P, ft.ball), along = dot(rel, ft.f), q = dot(rel, ft.lat);
          if (along < -0.01 || along > ft.L + 0.02 || Math.abs(q) > 0.06) continue;
          const fwd = ss(-0.004, 0.012, along);
          for (const g of [-0.016, -0.0015, 0.011, 0.022]) {
            const w = (1 - ss(0.0008, 0.0024, Math.abs(q - g - along * 0.08 * Math.sign(g + 0.004)))) * fwd;
            over(c, lin([58, 48, 44]), w * 0.6); st.h -= w * 0.9;
          }
          // nails (thick, yellow-grey horn), one per toe near its tip
          for (const [nq, na, nr] of [[-0.03, ft.L - 0.012, 0.009], [-0.0085, ft.L - 0.02, 0.0055], [0.005, ft.L - 0.024, 0.005], [0.0165, ft.L - 0.03, 0.0045], [0.027, ft.L - 0.037, 0.004]]) {
            if (Nn[1] < 0.1 && dot(Nn, ft.f) < 0.3) continue;
            const e = Math.hypot((q - nq) / nr, (along - na) / (nr * 1.15));
            const k = 1 - ss(0.8, 1.05, e);
            over(c, lin([132, 120, 96]), k * 0.75); st.h += k * 0.3; st.ro = mix(st.ro, 0.5, k);
            over(c, lin([60, 50, 42]), (1 - ss(0.0, 0.18, Math.abs(e - 1))) * 0.5);
          }
        }
      }
      // ---- the dark wool under-shift over the hips and thighs, frayed off just above the knees (whatever the
      // swinging thigh still pushes through the skirt reads as a cloth layer, not bare white skin)
      if (P[1] > kneeY + 0.03 && P[1] < hipY + 0.06 && Math.abs(P[0]) < 0.24) {
        const edge = kneeY + 0.07 + N.fbm(P[0] * 40, P[1] * 10, P[2] * 40, 3) * 0.012 + N.noise(P[0] * 260, 0.5, P[2] * 260) * 0.004;
        const k = ss(edge - 0.002, edge + 0.004, P[1]);
        if (k > 0) {
          const kx = P[0] - Math.sign(P[0]) * 0.09;
          const rib = 0.5 + 0.5 * Math.sin(Math.atan2(kx, P[2]) * 60 + N.noise(P[1] * 40, P[0] * 20, 1.1) * 1.5);
          const wool = mix3(lin([86, 76, 74]), lin([66, 58, 58]), 0.5 + 0.5 * N.fbm(P[0] * 18, P[1] * 18, P[2] * 18, 3));
          over(c, mix3(wool, scl(wool, 0.84), rib), k);
          mul(c, [0.85, 0.84, 0.84], (1 - ss(edge + 0.003, edge + 0.02, P[1])) * k * 0.6);
          st.h = mix(st.h, (rib - 0.5) * 0.4 + N.fbm(P[0] * 120, P[1] * 120, P[2] * 120, 2) * 0.2, k); st.ro = mix(st.ro, 0.96, k);
        }
      }
      // filthy bare feet: black soles, dirt up over the toes and ankles
      if (P[1] < 0.14) { const g = ss(0.13, 0.02, P[1] + N.fbm(P[0] * 20, P[1] * 20, P[2] * 20, 3) * 0.04); over(c, lin([66, 56, 48]), g * 0.6); st.ro = mix(st.ro, 0.9, g); }
      // ritual markings, drawn along the veins (slightly raised, waxy)
      const m = markings(P, Nn);
      if (m.halo > 0) mul(c, [0.8, 0.74, 0.9], m.halo * 0.55);
      if (m.ink > 0) { over(c, inkCol, m.ink * 0.88); st.h += m.ink * 0.3; st.ro = mix(st.ro, 0.5, m.ink * 0.6); }
    },
  });
  // emissive: violet glow in the marking cores at the eyes / forehead sigil / throat ring (faint; the eyes carry it)
  {
    const ES = texSize(512);
    const surfB = { tris: fullTris, pos: h.pos, nrm: fullNrm };
    const gF = bakeField(surfB, h.baseObj.uvs, ES, (P, Nn) => markings(P, Nn).glow, { fill: 0, blur: 0 });
    const em = createImage(ES, ES, [0, 0, 0, 255]);
    const GL = [0.42, 0.12, 0.85];
    for (let i = 0; i < ES * ES; i++) for (let k = 0; k < 3; k++) em.data[i * 4 + k] = toByte(GL[k] * gF[i] * 0.5);
    skin.emissiveMap = em;
  }

  // =========================================================================================== PAINT: coat (jacket + shift)
  const coatSrc = await lib.texture(coat.asset.textures.diffuse, texSize(2048));
  const COAT = lin([104, 97, 87]), COAT_FADE = lin([130, 122, 110]), MUD = lin([62, 54, 44]), BLOOD_OLD = lin([68, 32, 28]);
  const SHIFT = lin([132, 124, 106]);
  const PATCHES = [
    { c: [0.12, 1.32, 0.11], r: [0.05, 0.04], col: lin([120, 110, 96]) },   // (was a saturated mustard: pulled the eye)
    { c: [-0.1, 1.06, -0.13], r: [0.06, 0.05], col: lin([104, 70, 60]) },
    { c: [-0.36, 1.42, 0.0], r: [0.035, 0.05], col: lin([122, 120, 112]) },
  ].map((p) => ({ ...p, c: [p.c[0], p.c[1] / 1.81 * h.height, p.c[2]] }));
  let srcMean = 0;
  { let n = 0; for (let i = 0; i < coatSrc.data.length; i += 4 * 13) { srcMean += lumOf([S2L[coatSrc.data[i]], S2L[coatSrc.data[i + 1]], S2L[coatSrc.data[i + 2]]]); n++; } srcMean /= n; }
  // per-texel kind (shirt vs coat) from the face under the texel
  const coatFaceKind = (() => { const out = []; coat.obj.faces.forEach((f, fi) => { if (!coat.keep[fi]) return; for (let k = 1; k + 1 < f.v.length; k++) out.push(faceKind[fi]); }); return out; })();
  const pocketMask = new Uint8Array(texSize(2048) ** 2);
  // her ritual glyph in the facial vein language: an almond "seer" eye with its pupil, three rays up, veins branching
  // down from it (2D, metres, in a local plane) -> { k: 0..1 ink, d: distance to the nearest stroke }
  const glyphStrokes = (sc) => {
    const S = (pts) => pts.map(([x, y]) => [x * sc, y * sc]);
    // (weeping veins: a long one straight down, two curving out, uneven twigs off them - asymmetric on purpose)
    return [
      S([[0, -0.024], [0.002, -0.06], [-0.003, -0.1], [0.001, -0.142]]),
      S([[-0.018, -0.02], [-0.028, -0.05], [-0.042, -0.086], [-0.05, -0.118]]),
      S([[0.02, -0.02], [0.03, -0.054], [0.037, -0.08], [0.056, -0.104]]),
      S([[-0.034, -0.066], [-0.053, -0.071]]), S([[0.033, -0.064], [0.05, -0.06]]), S([[0.0, -0.088], [0.015, -0.112]]),
      S([[-0.046, -0.098], [-0.036, -0.122]]), S([[-0.001, -0.118], [-0.014, -0.132]]),
      ...[70, 90, 110].map((deg) => { const a = deg * Math.PI / 180; return S([[Math.cos(a) * 0.02, 0.026 + Math.sin(a) * 0.004], [Math.cos(a) * 0.05, 0.03 + Math.sin(a) * 0.045]]); }),
    ];
  };
  const glyph = (x, y, sc, strokes) => {
    const ew = 0.055 * sc, eh = 0.021 * sc;
    let d = 1;
    if (Math.abs(x) < ew * 1.05) d = Math.abs(Math.abs(y) - Math.max(0, eh * (1 - (x / ew) ** 2)));
    d = Math.min(d, Math.max(0, Math.hypot(x, y) - 0.009 * sc));
    let dl = 1, sAt = 0;
    for (const pts of strokes) { const [dd, s] = polyDist([x, y], pts); if (dd < dl) { dl = dd; sAt = s; } }
    const k = Math.max(1 - ss(0.0025 * sc, 0.0045 * sc, d), 1 - ss(mix(0.0035, 0.0015, sAt) * sc, mix(0.006, 0.0028, sAt) * sc, dl));
    return { k, d: Math.min(d, dl) };
  };
  const backStrokes = glyphStrokes(1.25);
  const charmStrokes = glyphStrokes(0.42);
  const charmC = [-0.13, 1.03 / 1.81 * h.height, 0.14];
  const coatPaint = paintPart(coat, { size: 2048, normalSize: 1024, ormSize: 1024, rough: 0.92 }, (P, Nn, st, u, v, i, tri) => {
    const kd = tri >= 0 ? coatFaceKind[tri] : 'coat';
    const d = i * 4;
    const sl = lumOf([S2L[coatSrc.data[d]], S2L[coatSrc.data[d + 1]], S2L[coatSrc.data[d + 2]]]);
    // (the flattened pocket islands carry no source seams / stitching: plain wool like the panel round them)
    if (kd === 'pocket') pocketMask[i] = 1;
    const detail = kd === 'pocket' ? 0.97 : Math.max(0.35, Math.min(1.8, (sl / (srcMean || 0.05)) ** 0.55));
    const c = st.c;
    if (kd === 'shirt') {
      for (let k = 0; k < 3; k++) c[k] = SHIFT[k] * (0.8 + 0.2 * Math.min(1.4, detail));
      over(c, lin([120, 104, 74]), ss(-0.1, 0.6, N.fbm(P[0] * 9, P[1] * 9, P[2] * 9, 3)) * 0.5);     // yellowed, sweat-stained
      over(c, BLOOD_OLD, ss(0.35, 0.7, N.fbm(P[0] * 14 + 4, P[1] * 10, P[2] * 14, 3)) * 0.6);         // old blood down the front
      st.ro = 0.9;
    } else {
      const n1 = N.fbm(P[0] * 6, P[1] * 6, P[2] * 6, 3), n2 = N.fbm(P[0] * 30 + 7, P[1] * 30, P[2] * 30, 2);
      for (let k = 0; k < 3; k++) c[k] = COAT[k] * detail;
      // wool weave / pilling and uneven fading: lighter on the shoulders and the sleeve tops (sun), darker in folds
      mul(c, [1.06, 1.06, 1.06], ss(-0.3, 0.6, n2) * 0.6);
      over(c, COAT_FADE, ss(1.2 / 1.81 * h.height, 1.55 / 1.81 * h.height, P[1]) * ss(-0.1, 0.8, Nn[1] + 0.3) * 0.45);
      over(c, MUD, ss(hemY + 0.12, hemY, P[1]) * ss(-0.3, 0.5, n1) * 0.55);
      // patches sewn on (different cloth, cross-stitched borders)
      for (const pt of PATCHES) {
        const q = [(P[0] - pt.c[0]) / pt.r[0], (P[1] - pt.c[1]) / pt.r[1]];
        if (Math.abs(P[2] - pt.c[2]) > 0.12) continue;
        const e = Math.max(Math.abs(q[0]), Math.abs(q[1])) + N.fbm(P[0] * 60, P[1] * 60, P[2] * 60, 3) * 0.08 + N.noise(P[0] * 260, P[1] * 260, 1.1) * 0.02;
        if (e < 1.05) {
          over(c, mix3(pt.col, scl(pt.col, 0.85), ss(-0.4, 0.6, N.noise(P[0] * 120, P[1] * 120, 3.3))), 1 - ss(0.98, 1.02, e));
          const stitch = (1 - ss(0.0, 0.04, Math.abs(e - 0.93))) * ss(0.3, 0.6, Math.abs(Math.sin((q[0] + q[1]) * 30)));
          over(c, lin([46, 40, 34]), stitch * 0.8);
          st.h += (1 - ss(0.95, 1.02, e)) * 0.4;
        }
      }
      // old blood: cuffs, the right front, splashes
      const cuff = Math.max(foreL(P).t, foreR(P).t);
      over(c, BLOOD_OLD, ss(0.45, 0.65, cuff) * ss(-0.1, 0.5, n1 + 0.2) * 0.55);
      over(c, BLOOD_OLD, (1 - ss(0.15, 0.22, N.worley(P[0] * 30, P[1] * 30, P[2] * 30))) * ss(0.2, 0.6, N.fbm(P[0] * 3, P[1] * 3, P[2] * 3, 2)) * 0.7);
      // her glyph daubed between the shoulder blades in dark blood and soot, finger-smeared: the seer eye with veins
      // branching down from it and rays up (it was a ring with a cross - read as a crosshair / UI marker)
      if (P[2] < -0.05 && Nn[2] < -0.3) {
        const bx = P[0] + N.noise(P[1] * 30, 0.3, 1.7) * 0.004, by = P[1] - 1.31 / 1.81 * h.height + N.noise(P[0] * 30, 2.2, 0.6) * 0.004;
        const gk = glyph(bx, by, 1.25, backStrokes);
        const smear = ss(-0.55, 0.25, N.fbm(bx * 24, by * 60, 5.5, 3));      // dragged-finger density, streaky downward
        over(c, lin([56, 28, 38]), gk.k * smear * 0.82);
        over(c, lin([74, 46, 50]), (1 - ss(0.0, 0.01, gk.d)) * (1 - gk.k) * 0.25);   // the stain bled into the wool
        st.h -= gk.k * 0.3;
      }
      // over the flattened right pocket a stitched charm: a ragged, tilted scrap of plum wool carrying the small
      // glyph (not pocket-shaped); over the left one a strip of rag wrapped round the coat, its ends tucked
      if (P[2] > 0.06 && Nn[2] > 0.2) {
        const rx = P[0] - charmC[0], ry = P[1] - charmC[1], ca = Math.cos(0.21), sa = Math.sin(0.21);
        const q = [(rx * ca - ry * sa) / 0.043, (rx * sa + ry * ca) / 0.052];
        if (Math.abs(q[0]) < 1.4 && Math.abs(q[1]) < 1.4) {
          const e = Math.max(Math.abs(q[0]) ** 3 + Math.abs(q[1]) ** 3, 0) ** (1 / 3) + N.fbm(P[0] * 50, P[1] * 50, P[2] * 50, 3) * 0.16 + N.noise(P[0] * 300, P[1] * 300, 2.1) * 0.03;
          if (e < 1.04) {
            over(c, mix3(lin([84, 64, 86]), lin([70, 54, 72]), ss(-0.4, 0.6, N.noise(P[0] * 120, P[1] * 120, 3.3))), 1 - ss(0.98, 1.02, e));
            const stitch = (1 - ss(0.0, 0.035, Math.abs(e - 0.88))) * ss(0.35, 0.6, Math.abs(Math.sin(Math.atan2(q[1], q[0]) * 22)));
            over(c, lin([150, 136, 110]), stitch * 0.7);
            const gk = glyph(rx * ca - ry * sa, rx * sa + ry * ca - 0.006, 0.42, charmStrokes);
            over(c, lin([34, 22, 42]), gk.k * 0.85 * (1 - ss(0.8, 0.92, e)));
            st.h += (1 - ss(0.95, 1.02, e)) * 0.35 - gk.k * 0.2;
          }
        }
        const lx = P[0] + charmC[0], ly = P[1] - charmC[1] + 0.01;
        if (lx > -0.11 && lx < 0.13 && Math.abs(ly) < 0.08) {
          const band = ly + lx * 0.42 + N.fbm(P[0] * 30, P[1] * 30, 3.7, 2) * 0.006;
          const wdt = 0.021 + N.noise(lx * 40, 1.3, 0.2) * 0.003;
          const k = 1 - ss(wdt - 0.002, wdt + 0.0015 + N.noise(P[0] * 400, P[1] * 400, 0.7) * 0.0015, Math.abs(band));
          if (k > 0) {
            const weave = 0.5 + 0.5 * Math.sin((lx - band * 0.42) * 900) * Math.sin(band * 900);
            over(c, mix3(lin([104, 92, 76]), lin([86, 74, 60]), weave * 0.5 + 0.5 * ss(-0.3, 0.6, N.fbm(P[0] * 20, P[1] * 20, 1.9, 2))), k);
            over(c, lin([66, 50, 40]), (1 - ss(0.004, 0.01, wdt - Math.abs(band))) * k * 0.45);      // frayed, grimy edges
            st.h += k * (0.35 + 0.15 * weave);
          }
        }
      }
    }
    // grime everywhere, more low
    over(c, MUD, ss(0.0, 0.8, N.fbm(P[0] * 11 - 3, P[1] * 11, P[2] * 11, 3)) * 0.25);
    // tears: cut where coatTear > 1 (alpha), frayed / darkened edge round them
    const tw = coatTear(P);
    if (tw > 1) st.a = 0;
    else {
      const edge = ss(0.6, 1.0, tw);
      over(c, lin([60, 54, 46]), edge * 0.5);
      st.h -= edge * 0.6;
      // loose threads
      if (edge > 0.2) st.h += 0.4 * ss(0.6, 0.9, N.ridged(P[0] * 300, P[1] * 300, P[2] * 300, 2)) * edge;
    }
  });

  // =========================================================================================== PAINT: drape
  // skirt + sash share the coat's wool / a rust sash; hood + mantle are a heavier plum wool (her colour signature)
  const PLUM = lin([94, 73, 97]), PLUM_FADE = lin([126, 111, 121]), SASH = lin([104, 54, 44]), SKIRT = lin([122, 113, 101]);
  const stripCut = (key, f, gap, lenMax) => {
    // torn strips: f = coordinate across (strip units) -> strip length L torn up from the edge, tears between strips
    const fj = f + N.noise(key * 3.1, f * 0.7, 1.9) * 0.3;
    const i = Math.floor(fj), fr = fj - i;
    const L = lenMax * (0.15 + 0.85 * hash(i * 7 + key) ** 0.8);
    const gapL = lenMax * (0.6 + 1.6 * hash(i * 13 + key + 5));
    const inGap = fr < gap || fr > 1 - gap * 0.6;
    return { L, gapL, inGap, fr };
  };
  const drapePaint = paintPart(drapePart, { size: 2048, normalSize: 1024, ormSize: 512, rough: 0.93, normalStrength: 2.2 }, (P, Nn, st, u, v) => {
    const c = st.c;
    const n1 = N.fbm(P[0] * 6, P[1] * 6, P[2] * 6, 3), n2 = N.fbm(P[0] * 34 + 7, P[1] * 34, P[2] * 34, 2);
    // twill weave + pilling: height (normal map) only - a per-texel weave in the albedo tripled the PNG (3.5 MB) for
    // detail the normal map already carries
    const tw = Math.sin((u + v) * 2048 * 1.4) * 0.5 + 0.5;
    st.h += (tw - 0.5) * 0.18 + n2 * 0.12;
    if (v < 0.56 && u < 0.815) {
      // ---- skirt (coat wool). In the game's shadow side the lower skirt measured sRGB 5-17 (black tatter texels
      // in the mips + a hem darkened to ~45): the base is a touch lighter than the jacket, the hem only ~0.8x darker
      // (mud as local splashes, never a dark band), so the strip tips stay >= ~70
      const n3 = N.fbm(P[0] * 70 + 2, P[1] * 50, P[2] * 70, 2);
      for (let k = 0; k < 3; k++) c[k] = SKIRT[k] * (0.95 + 0.1 * n2) * (0.96 + 0.08 * n3);
      over(c, COAT_FADE, ss(-0.2, 0.6, n1) * 0.22);
      const low = ss(yHem + 0.22, yHem - 0.03, P[1]);
      mul(c, [0.8, 0.78, 0.76], low * (0.55 + 0.45 * ss(-0.3, 0.5, n1)));
      over(c, MUD, low * ss(0.15, 0.55, N.fbm(P[0] * 14 + 5, P[1] * 9, P[2] * 14, 3)) * 0.4);
      over(c, BLOOD_OLD, (1 - ss(0.13, 0.2, N.worley(P[0] * 24, P[1] * 24, P[2] * 24))) * ss(0.25, 0.6, N.fbm(P[0] * 3 + 9, P[1] * 3, P[2] * 3, 2)) * 0.5);
      // torn hem: strips of different length, tears running up between some of them
      const th = Math.atan2(P[0], P[2] - zcAxis);
      const sc = stripCut(1, th / 0.13, 0.07, 0.085);
      const yCut = yHem - sc.L + N.noise(th * 60, P[1] * 40, 2.2) * 0.006;
      let cut = P[1] < yCut;
      if (sc.inGap && P[1] < yHem + sc.gapL * 0.6) cut = true;
      if (cut) st.a = 0;
      const edge = Math.max(1 - ss(0.0, 0.018, P[1] - yCut), sc.inGap ? 1 - ss(0.0, 0.015, P[1] - yHem - sc.gapL * 0.6) : 0);
      mul(c, [0.84, 0.82, 0.8], edge * 0.8);
      st.h -= edge * 0.4;
      st.ro = 0.93;
    } else if (v < 0.56) {
      // ---- sash: rust-red cloth, darker in the creases, grimy
      for (let k = 0; k < 3; k++) c[k] = SASH[k] * (0.92 + 0.16 * n2);
      over(c, lin([80, 52, 40]), ss(-0.2, 0.7, n1) * 0.45);
      over(c, BLOOD_OLD, ss(0.3, 0.7, N.fbm(P[0] * 12 + 1, P[1] * 12, P[2] * 12, 3)) * 0.5);
      // frayed ends of the hanging tails
      if (v > 0.425 && v < 0.44 && u < 0.99) { if (N.noise(u * 400, 1.3, 0.2) > 0.2) st.a = 0; }
      st.ro = 0.88;
    } else {
      // ---- hood / mantle / rolled rim: plum wool, sun-faded on the crown and shoulders, dusty, stained. Worn wool,
      // not camouflage: the large soft blotches are gone; the variation is fine (fibre / pilling / wear) and the
      // dark stains follow the folds (colour, no AO in here)
      const nf = N.fbm(P[0] * 90 + 1, P[1] * 90, P[2] * 90, 2), np = N.fbm(P[0] * 210, P[1] * 210, P[2] * 210, 2);
      for (let k = 0; k < 3; k++) c[k] = PLUM[k] * (0.95 + 0.08 * n2) * (0.93 + 0.1 * nf) * (0.96 + 0.07 * np);
      over(c, PLUM_FADE, ss(-0.1, 0.8, Nn[1]) * (0.32 + 0.12 * n1));
      st.h += nf * 0.15 + np * 0.12;
      if (u < 0.8 && v >= 0.7) {
        // hood folds: fine creases in the normal map (+ cavity in the ORM occlusion only), worn / faded on the ridges,
        // grime settled along the crease lines
        const d = norm(sub(P, HC));
        const big = hoodFold(d), fine = hoodFold(d, 13, 3);
        const ridge = big.k * big.f, crease = (1 - fine.k) * fine.f, valley = (1 - big.k) * big.f;
        st.h += 2.4 * (big.k - 0.5) * big.f + 0.9 * (fine.k - 0.5) * fine.f;
        st.ao *= 1 - 0.32 * valley - 0.15 * crease;
        over(c, PLUM_FADE, ridge * 0.26 * (0.7 + 0.3 * nf));
        over(c, lin([66, 50, 66]), (ss(0.45, 0.9, valley) * 0.3 + ss(0.5, 0.9, crease) * 0.18) * (0.75 + 0.25 * np));
      }
      over(c, lin([108, 98, 88]), ss(0.25, 0.85, N.fbm(P[0] * 30 + 3, P[1] * 30, P[2] * 30, 2)) * 0.16);   // dust
      over(c, BLOOD_OLD, (1 - ss(0.12, 0.2, N.worley(P[0] * 28, P[1] * 28, P[2] * 28))) * ss(0.35, 0.7, N.fbm(P[0] * 4, P[1] * 4 + 3, P[2] * 4, 2)) * 0.45);
      if (u < 0.8) {
        // the back seam of the hood (centre line)
        const seam = 1 - ss(0.0, 0.0035, Math.abs(P[0]));
        if (P[2] < HC[2] && P[1] > A.neck[1]) { over(c, lin([60, 44, 62]), seam * 0.6); st.h -= seam * 0.5; }
        // mantle hem torn into tatters (v .565 = hem)
        if (v < 0.7) {
          const uu = u < 0.4 ? u : 0.8 - u;
          const sc = stripCut(2, uu / 0.024, 0.08, 0.06);
          const dv = (v - 0.565) * 1.85;                 // metres up from the hem (approx.)
          let cut = dv < sc.L * 0.9 + N.noise(uu * 300, v * 90, 3.3) * 0.004;
          if (sc.inGap && dv < sc.gapL * 0.7) cut = true;
          if (cut) st.a = 0;
          const edge = 1 - ss(0.0, 0.02, dv - sc.L * 0.9);
          over(c, lin([62, 48, 62]), edge * 0.5);
          st.h -= edge * 0.4;
        }
      } else {
        // rolled rim: a darker, worn twist
        const tw2 = Math.sin((u - 0.805) / 0.19 * Math.PI * 2 + v * 260) * 0.5 + 0.5;
        mul(c, [0.86, 0.84, 0.86], 0.5 + 0.5 * tw2);
        st.h += tw2 * 0.4;
      }
      st.ro = 0.95;
    }
  });
  finishAlbedo(drapePaint.albedo, drapePaint.painted);
  // exported as two meshes over the one painted atlas: the hood / mantle keeps every triangle (the simplifier had
  // faceted the crown), the skirt + sash take the decimation
  const subPart = (name, zones, noSimplify) => {
    const p = new lib.Part({ name, role: 'cloth', obj: drapePart.obj, pos: drapePart.pos, refIdx: drapePart.refIdx, refW: drapePart.refW });
    p.weights = drapePart.weights; p.seg = drapePart.seg; p.zone = drapePart.zone;
    drapePart.obj.faces.forEach((f, fi) => { p.keep[fi] = zones.includes(drapePart.zone[f.v[0]]) ? 1 : 0; });
    p.extras.noSimplify = noSimplify;
    return p;
  };
  const hoodPart = subPart('mantle', [ZONE.hood, ZONE.mantle, ZONE.rim], true);
  const skirtPart = subPart('skirt', [ZONE.skirt, ZONE.sash], false);

  // =========================================================================================== PAINT: hair strands
  const hairTex = (() => {
    const W = texSize(512), H = texSize(1024);
    const img = createImage(W, H, [112, 108, 102, 0]);
    const strands = [];
    for (let col = 0; col < 4; col++) for (let k = 0; k < 64; k++) {
      const r = (q) => hash(col * 1000 + k * 17 + q);
      strands.push({ col, x: 0.05 + 0.9 * r(1), w: 0.008 + 0.022 * r(2) ** 2, end: 0.02 + 0.45 * r(3) ** 1.8, amp: 0.01 + 0.035 * r(4), fq: 3 + 6 * r(5), ph: 6.28 * r(6), tone: r(7) });
    }
    const c = [0, 0, 0];
    for (let y = 0; y < H; y++) {
      const v = 1 - (y + 0.5) / H;     // 1 root .. 0 tip
      for (let x = 0; x < W; x++) {
        const u = (x + 0.5) / W, col = Math.min(3, Math.floor(u * 4)), lx = u * 4 - col;
        let cov = 0, tone = 0.5;
        for (const s of strands) {
          if (s.col !== col || v < s.end) continue;
          const sx = s.x + s.amp * Math.sin(v * s.fq + s.ph) * (1 - v);
          const w = s.w * (0.12 + 0.88 * Math.min(1, (v - s.end) / 0.3 + 0.2) ** 0.8);   // clumps taper to fine tips
          const k = 1 - ss(w * 0.35, w, Math.abs(lx - sx));
          if (k > cov) { cov = k; tone = s.tone; }
        }
        const i = (y * W + x) * 4;
        // ash grey, darker than before (it was the brightest thing on her, avg sRGB 153): roots dark and greasy
        const base = mix3(lin([156, 152, 144]), lin([104, 100, 94]), tone * 0.85);
        for (let k = 0; k < 3; k++) c[k] = base[k];
        over(c, lin([92, 84, 70]), ss(0.72, 1, v) * 0.55);             // greasy, nicotine-dark roots
        over(c, lin([84, 74, 62]), ss(0.35, 0.0, v) * 0.35);           // filthy ends
        mul(c, [0.85, 0.85, 0.85], ss(-0.2, 0.6, N.noise(lx * 40, v * 6, col)) * 0.6);
        img.data[i] = toByte(c[0]); img.data[i + 1] = toByte(c[1]); img.data[i + 2] = toByte(c[2]);
        img.data[i + 3] = cov > 0.32 + 0.22 * ss(0.4, 0.0, v) ? 255 : 0;
      }
    }
    return img;
  })();

  // =========================================================================================== PAINT: gear
  const gearTex = (() => {
    const W = texSize(512);
    const alb = createImage(W, W, [0, 0, 0, 255]), orm = createImage(W, W, [255, 200, 0, 255]);
    const em = createImage(texSize(128), texSize(128), [0, 0, 0, 255]);
    const hgt = new Float32Array(W * W);
    const c = [0, 0, 0];
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W, v = 1 - (y + 0.5) / W, i = y * W + x;
      let ro = 0.7, hh = 0;
      if (u < 0.25) {            // claw horn: black-brown, yellowing to a broken tip, ridged lengthwise
        const base = mix3(lin([38, 30, 26]), lin([96, 84, 64]), ss(0.55, 1, v));
        for (let k = 0; k < 3; k++) c[k] = base[k];
        const r = Math.sin(u * 160) * 0.5 + 0.5;
        mul(c, [0.85, 0.85, 0.85], r * 0.5); hh = r * 0.4; ro = 0.45;
      } else if (u < 0.4) {      // sinew cord, twisted
        const tw = Math.sin((u * 60 + v * 140)) * 0.5 + 0.5;
        const base = lin([82, 60, 44]);
        for (let k = 0; k < 3; k++) c[k] = base[k] * (0.75 + 0.4 * tw);
        hh = tw; ro = 0.8;
      } else if (u < 0.7) {      // finger bones: yellowed ivory, dirt in the cracks, darker knuckle ends
        const base = lin([184, 170, 138]);
        for (let k = 0; k < 3; k++) c[k] = base[k];
        over(c, lin([120, 100, 72]), ss(0.1, 0.0, Math.min(v, 1 - v)) * 0.6 + ss(-0.2, 0.6, N.fbm(u * 30, v * 10, 1.1, 3)) * 0.35);
        const crack = ss(0.85, 0.97, N.ridged(u * 60, v * 30, 2.2, 2));
        over(c, lin([60, 48, 36]), crack * 0.8); hh = -crack; ro = 0.65;
      } else if (v > 0.5) {      // carved bone disc: the seer sigil cut into it, glowing violet in the groove
        const base = lin([176, 162, 130]);
        for (let k = 0; k < 3; k++) c[k] = base[k];
        over(c, lin([126, 108, 80]), ss(-0.2, 0.6, N.fbm(u * 20, v * 20, 4.4, 3)) * 0.4);
        const qx = (u - 0.85) / 0.14, qy = (v - 0.75) / 0.235;
        const rr = Math.hypot(qx, qy);
        const arc = 0.42 * (1 - (qx / 0.62) ** 2);
        const almond = Math.abs(qx) < 0.62 ? 1 - ss(0.03, 0.06, Math.abs(Math.abs(qy) - Math.max(0, arc))) : 0;
        const pupil = 1 - ss(0.1, 0.14, rr);
        const ring = 1 - ss(0.03, 0.06, Math.abs(rr - 0.86));
        const groove = Math.max(almond, pupil, ring);
        over(c, lin([40, 22, 46]), groove * 0.85); hh = -groove * 1.2 + (1 - ss(0.86, 0.98, rr)) * 0.2;
        const eu = Math.min(em.width - 1, Math.floor(u * em.width)), ev = Math.min(em.height - 1, Math.floor((1 - v) * em.height));
        const gl = Math.max(almond, pupil);
        const GL = [0.5, 0.15, 1.0];
        const ei = (ev * em.width + eu) * 4;
        for (let k = 0; k < 3; k++) em.data[ei + k] = Math.max(em.data[ei + k], toByte(GL[k] * gl));
        ro = 0.6;
      } else {                   // leather: pouch, disc edge
        const base = lin([92, 66, 46]);
        for (let k = 0; k < 3; k++) c[k] = base[k] * (0.85 + 0.3 * (N.fbm(u * 40, v * 40, 6.6, 3) * 0.5 + 0.5));
        over(c, lin([50, 36, 26]), ss(0.2, 0.7, N.fbm(u * 8, v * 8, 2.6, 2)) * 0.5);
        hh = N.ridged(u * 50, v * 50, 1.4, 2) * 0.4; ro = 0.75;
      }
      alb.data[i * 4] = toByte(c[0]); alb.data[i * 4 + 1] = toByte(c[1]); alb.data[i * 4 + 2] = toByte(c[2]);
      orm.data[i * 4 + 1] = Math.round(clamp01(ro) * 255);
      hgt[i] = hh;
    }
    return { albedo: alb, orm, normal: normalFromHeight(blurField(hgt, W, W, 1, 1), W, W, 2 * W / 1024), emissiveMap: em };
  })();

  // =========================================================================================== eyes / teeth / cavity
  const eyeSrc = lib.cloneImage(await lib.texture('system', 'eyes/materials/brown_eye.png', texSize(256)));
  const eyeTex = (() => {
    // brown_eye.png layout: two eyeballs, iris centres at (0.705, 0.295) / (0.29, 0.71) (image space), iris r 0.113
    const src = eyeSrc;
    const W = src.width, H = src.height;
    const em = createImage(W, H, [0, 0, 0, 255]);
    const c = [0, 0, 0];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const u = (x + 0.5) / W, v = (y + 0.5) / H;
      const d1 = Math.hypot(u - 0.705, v - 0.295), d2 = Math.hypot(u - 0.29, v - 0.71);
      const r = Math.min(d1, d2), ang = d1 < d2 ? Math.atan2(v - 0.295, u - 0.705) : Math.atan2(v - 0.71, u - 0.29);
      c[0] = S2L[src.data[i]]; c[1] = S2L[src.data[i + 1]]; c[2] = S2L[src.data[i + 2]];
      // sclera: bruised, blood-dark grey-violet (the glowing iris has to burn out of it), dark veins, darker to the lids
      const scl = ss(0.11, 0.125, r);
      const sc = mix3(lin([92, 74, 84]), lin([46, 34, 44]), ss(0.15, 0.3, r));
      over(c, sc, scl);
      over(c, lin([84, 18, 30]), scl * ss(0.55, 0.85, N.ridged(u * 46, v * 46, 1.7, 3)) * 0.9);
      // iris: violet with radial fibres, a dark limbal ring; pupil a dark violet pit
      const fib = 0.5 + 0.5 * Math.sin(ang * 48 + N.noise(ang * 6, r * 40, 2.2) * 3);
      const iris = 1 - ss(0.102, 0.113, r);
      const pupil = 1 - ss(0.03, 0.038, r);
      over(c, mix3(lin([96, 44, 160]), lin([170, 120, 240]), ss(0.1, 0.04, r) * 0.7 + fib * 0.3), iris);
      over(c, lin([30, 12, 44]), (1 - ss(0.0, 0.01, Math.abs(r - 0.108))) * 0.8);
      over(c, lin([22, 8, 30]), pupil);
      // (+ a faint violet bleed into the sclera round the limbus)
      const gl = iris * (1 - pupil) * (0.6 + 0.5 * ss(0.11, 0.045, r)) * (0.8 + 0.2 * fib) + pupil * 0.12 + (1 - iris) * 0.22 * (1 - ss(0.113, 0.15, r));
      em.data[i] = toByte(0.55 * gl); em.data[i + 1] = toByte(0.16 * gl); em.data[i + 2] = toByte(1.0 * gl);
      src.data[i] = toByte(c[0]); src.data[i + 1] = toByte(c[1]); src.data[i + 2] = toByte(c[2]);
    }
    return { albedo: src, emissiveMap: em };
  })();
  const teethTex = lib.grungeTexture(lib.cloneImage(await lib.texture(teeth.asset.textures.diffuse, texSize(512))), { tint: [0.95, 0.84, 0.6], dirt: 0.6, blood: 0.2, seed: 5 });
  const cavTex = createImage(64, 64, [0, 0, 0, 255]);
  grade(cavTex, (c, u) => {
    if (u < 0.5) { const k = ss(0.06, 0.42, u); const a = lin([66, 30, 40]), b = lin([10, 4, 8]); for (let i = 0; i < 3; i++) c[i] = mix(a[i], b[i], k); }
    else { const e = lin([60, 40, 70]); for (let i = 0; i < 3; i++) c[i] = e[i]; }
  });

  // =========================================================================================== AO (ORM occlusion only)
  {
    const surf = (part) => ({ pos: part.pos, tris: part.tris(), nrm: part.normals() });
    const sBody = surf(body), sCoat = surf(coat), sDrape = surf(drapePart);
    const occ = makeBVH([{ pos: body.pos, tris: sBody.tris }, { pos: coat.pos, tris: sCoat.tris }, { pos: drapePart.pos, tris: sDrape.tris }]).bvh;
    const R = texSize(512);
    const tr = aoTracer(occ, { rays: 16, maxDist: 0.12 });
    const aoSkin = bakeField(sBody, body.obj.uvs, R, tr, { fill: 1, blur: 1 });
    applyOcclusion(skin.orm, [aoSkin], R, (a) => mix(1, a, 0.75));
    const aoCoat = bakeField(sCoat, coat.obj.uvs, R, tr, { fill: 1, blur: 1 });
    applyOcclusion(coatPaint.orm, [aoCoat], R, (a) => mix(1, a, 0.75));
    {
      // (no occlusion line round the flattened pockets: it drew their outline back in)
      const OW = coatPaint.orm.width, PW = Math.round(Math.sqrt(pocketMask.length)), k = PW / OW;
      for (let y = 0; y < OW; y++) for (let x = 0; x < OW; x++) {
        let m = 0;
        for (let j = -2; j < k + 2 && !m; j++) for (let i = -2; i < k + 2 && !m; i++) { const yy = y * k + j, xx = x * k + i; if (yy >= 0 && xx >= 0 && yy < PW && xx < PW) m = pocketMask[yy * PW + xx]; }
        if (m) { const o = (y * OW + x) * 4; coatPaint.orm.data[o] = Math.max(coatPaint.orm.data[o], 225); }
      }
    }
    // drape: the hood / mantle see the body (head, neck, shoulders); the skirt only the cloth over it (jacket hem,
    // sash, hanging ends) - the hips 8 mm under its top rows baked their crease lines into it (a grey chevron under
    // the sash), and the inside of the skirt seen through the tatter gaps must not go black: skirt AO >= .6
    const occCloth = makeBVH([{ pos: coat.pos, tris: sCoat.tris }, { pos: drapePart.pos, tris: sDrape.tris }]).bvh;
    const trHood = aoTracer(occ, { rays: 16, maxDist: 0.15 }), trSkirt = aoTracer(occCloth, { rays: 16, maxDist: 0.15, near: 0.006 });
    const aoDrape = bakeField(sDrape, drapePart.obj.uvs, R, (P, Nn, i) => (P[1] < hemY + 0.12 ? trSkirt : trHood)(P, Nn, i), { fill: 1, blur: 1 });
    applyOcclusion(drapePaint.orm, [aoDrape], R, (a) => mix(1, a, 0.75));
    const OW = drapePaint.orm.width;
    for (let y = 0; y < OW; y++) for (let x = 0; x < OW; x++) {
      if (1 - (y + 0.5) / OW < 0.56) { const i = (y * OW + x) * 4; drapePaint.orm.data[i] = Math.max(drapePaint.orm.data[i], 153); }
    }
  }

  // =========================================================================================== materials
  body.material = lib.material('skin', { albedo: skin.albedo, normal: skin.normal, orm: skin.orm, emissiveMap: skin.emissiveMap, emissive: [1, 1, 1] });
  const coatNrmSrc = await lib.texture(coat.asset.textures.normal, texSize(1024));
  // the source normal map's seams / stitching flattened over the painted-out pockets
  const coatNrm = lib.cloneImage(coatNrmSrc.width === coatPaint.normal.width ? coatNrmSrc : resize(coatNrmSrc, coatPaint.normal.width, coatPaint.normal.height));
  {
    const NW = coatNrm.width, PW = Math.round(Math.sqrt(pocketMask.length)), k = PW / NW;
    for (let y = 0; y < NW; y++) for (let x = 0; x < NW; x++) {
      let m = 0;
      for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) m = Math.max(m, pocketMask[(y * k + j) * PW + x * k + i]);
      if (m) { const o = (y * NW + x) * 4; coatNrm.data[o] = 128; coatNrm.data[o + 1] = 128; coatNrm.data[o + 2] = 255; }
    }
  }
  finishAlbedo(coatPaint.albedo, coatPaint.painted);
  // (pngBits 8: finishAlbedo already quantised the colour and kept it in the cut texels)
  coat.material = lib.material('cloth', { albedo: coatPaint.albedo, normal: blendNormals(coatNrm, coatPaint.normal, 1), orm: coatPaint.orm, alpha: coatPaint.alpha, doubleSided: true, pngBits: 8 });
  const drapeMat = lib.material('cloth', { albedo: drapePaint.albedo, normal: drapePaint.normal, orm: drapePaint.orm, alpha: drapePaint.alpha, doubleSided: true, pngBits: 8 });
  hoodPart.material = drapeMat; skirtPart.material = drapeMat;
  hairPart.material = lib.material('hair', { albedo: hairTex, alpha: true, roughness: 0.6, doubleSided: true });
  gearPart.material = lib.material('gear', { albedo: gearTex.albedo, normal: gearTex.normal, orm: gearTex.orm, emissiveMap: gearTex.emissiveMap, emissive: [1, 1, 1] });
  cavity.material = lib.material('gore', { albedo: cavTex, roughness: 0.8, doubleSided: true });
  eyes.material = lib.material('eye', { albedo: eyeTex.albedo, emissiveMap: eyeTex.emissiveMap, emissive: [1, 1, 1], roughness: 0.25 });
  teeth.material = lib.material('teeth', { albedo: teethTex, roughness: 0.5 });

  // =========================================================================================== hitboxes
  // measured on the naked base mesh (the hood / mantle / skirt would balloon head, arm and thigh capsules), torso on
  // the body + coat; small allowances for the cloth on top
  const bodyHb = computeHitboxes(h, [h.basePart({ name: 'hb' }).toRender()]);
  const dressHb = computeHitboxes(h, [body.toRender(), coat.toRender()]);
  const hitboxes = {}, capsules = {};
  const setHb = (key, bone, r) => { r = +r.toFixed(3); hitboxes[key] = [bone, r]; capsules[key] = { bone, radius: r, length: +sk[bone].head.distanceTo(sk[bone].tail).toFixed(3) }; };
  for (const [key, [bone, r]] of Object.entries(bodyHb.hitboxes)) {
    let rr = r;
    if (key === 'head') rr = r + 0.012;
    // (the coat sleeves measure 6.5-7 cm round the upper arm, ~6 cm round the forearm: shots through a sleeve hit)
    else if (/upperarm/.test(key)) rr = Math.max(r + 0.01, 0.065);
    else if (/lowerarm/.test(key)) rr = Math.max(r + 0.01, 0.058);
    else if (/thigh/.test(key)) rr = r + 0.02;
    else if (/calf/.test(key)) rr = r + 0.008;
    else if (/chest|spine|pelvis/.test(key)) rr = Math.min(dressHb.hitboxes[key][1], r + 0.025);
    setHb(key, bone, rr);
  }
  console.log(`${TAG} hitboxes`, Object.entries(hitboxes).map(([k, [, r]]) => `${k}:${r}`).join(' '));

  return {
    human: h,
    parts: [body, coat, hoodPart, skirtPart, hairPart, eyes, teeth, cavity, gearPart],
    budget: 9000,
    partBudget: { body: 2150, coat: 2300, skirt: 1650, teeth: 420 },
    extras: { poseOffsets, poseOffsetsByClip, archetype: 'shaman', gender: 'female', hitboxes, capsules,
      variant: 'tall gaunt elder woman: deep plum wool hood and tattered mantle, long ash-brown coat with a torn skirt and a rust sash, corpse-pale skin with violet-black ritual vein markings, glowing violet eyes, long clawed fingers, bone fetishes' },
    lod1: { budget: 2500, drop: ['teeth', 'fetish'], texScale: 0.5, partBudget: { body: 690, coat: 600, mantle: 400, skirt: 400, hair: 120 } },
  };
}
