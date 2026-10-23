// crawler — 爬牆者 Crawler / wall-climber (game/src/zombies/defs.js `crawler`: crawls on all fours, leaps, climbs). A
// starved, contorted man (~1.70 m standing) who has spent too long on his hands and knees: every bone stands out
// under tight, pale, bluish-grey skin — the rib cage (painted relief all round), a serrated ridge of spinous processes
// down the back and winged shoulder blades (real geometry: the back is what the player sees of a crawler), the
// collarbones, hip bones, knuckles, knees and elbows. Long arms, oversized hands with very long, thin fingers ending
// in curved black claws (real geometry: hooked keratin talons growing out of raw nail beds), long stick legs.
// The face: a bald, skull-tight head with sunken temples and no brows, milky blind-looking eyes with pinpoint pupils
// and a cold eyeshine (emissive), a shrunken nose, and a WIDE, unhinged jaw — the mandible hangs open ~19 deg and is
// spread ~14 % wider than the skull, the lips are pulled back off long, sharpened, yellow-brown teeth and both mouth
// corners are split back along the cheeks towards the ears (raw gashes with crusted, swollen rims); dark infection
// veins branch out from the eyes and the split corners; the forehead is scraped raw (it climbs head-first). Blood and
// drool round the mouth, and a feeding bib of old blood soaked down the throat onto the chest (the read at 5-15 m).
// Exposed ribs: the skin is torn off the left flank over four ribs (stained bone bars between dark intercostal meat,
// a ragged crusted rim, bruising; the surface caved in ~6 mm) and over two lower ribs on the right side of the back;
// three old claw rakes across the left shoulder blade.
// What is left of his clothes: the CC0 male_casualsuit01 jeans, recoloured to filthy olive-khaki work trousers, torn
// down to shreds — the belt and waistband, a ragged seat, the left leg ripped off at the crotch with two strips hanging
// down the thigh, the right leg torn up the front but hanging on at the back to the knee with a long tatter down the
// calf, holes worn through; the shirt and shoes of that outfit are gone (bare, filthy feet).
// Crawler wear: hands and forearms grimed dark to mid-forearm and feet and shins to mid-calf (a strong read of the
// limbs against the pale trunk), black callused palms, abraded knees, elbows and forearm backs, the chest and belly
// scraped raw in long parallel scratches (dragged along the ground), filthy soles and toe tops.
// Silhouette (in the crawl clip especially): splayed bony limbs, elbows up, the spine ridge, a bald head craned up with
// the jaw hanging open; poseOffsets add hooked claw fingers and a cocked, tilted head.
//
// Everything specific to this character lives in this file; the shared lib is only imported read-only (UV raster,
// blur, rig segments, hitbox measure, albedo tracer). Implemented here (helpers carried over from types/runner.mjs and
// types/spitter.mjs, adapted): the jaw sculpt driven by the CC0 MPFB2 default rig's mandible vertex groups, the inner
// mouth flap removal, the mouth cavity + tongue, proxy refinement (cranium, mouth, back strip), the spine / scapula
// displacement of the refined back, the claws, the sharpened teeth, the trousers (UV-island garment pick, recolour,
// cut field with strips + frayed denim fringe, face deletion, UV repack), ray-cast skin coverage, the skin composite
// (CC0 middle-aged male skin's detail over our own palette), rib / spine / scapula relief, the rib wounds, veins, wear,
// blood, the milky eyes, ray-traced AO (ORM occlusion only, never the albedo), hitbox tightening.
// Skinning / topology for the crawl poses: the wrist blend (no cuff step where the big hands meet the thin forearm) with
// refined forearms and the lowerarm / hand weights spread across the wrist; the back strip, trapezius and shoulder tops
// refined, the shoulder-blade plate on spine_03 60 % / clavicle 40 % and the shoulder girdle weights diffused (no fins
// or spikes when the arms reach forward / go high); the skin maps re-registered onto the proxy's own UVs (the male1591
// UVs drift up to 6 cm from the base layout over the back and cut the painted relief along a hard line).
// extras.height is the prone (in-game) head-top height 0.78 m; the standing one is extras.standingHeight.
// Albedo (in-game read, tools/assets/zombies/albedo.mjs; sRGB mean over painted texels): skin ~120 (pale bluish-grey;
// the trunk ~130-140, the grimed limbs darker), trousers ~90 (olive-khaki, visibly coloured next to the pale skin), belt
// dark brown. LOD1 swaps the mouth cavity + claws for a 16-tri cone (see the gore part).
import fs from 'node:fs';
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
const TAG = '  crawler:';

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

/**
 * Re-registers textures painted in the base mesh's UV layout onto a proxy part's own UVs. Every texel of the proxy's
 * UV raster is located on the proxy surface, projected onto the base mesh (closest point) and resampled there; only
 * where the proxy's UV lands > lo .. hi metres away from that point (or outside the base islands), weighted by
 * region(P) (0..1). The male1591 proxy's UVs drift 3-6 cm from the base layout over the shoulders / upper back: the painted
 * relief and the colour stepped along the proxy's island border there (a hard 'cape' line across the back that read
 * as a crease, in the rest pose and in every clip). Images are modified in place.
 */
function reprojectToProxy(h, part, imgs, region, { lo = 0.002, hi = 0.006 } = {}) {
  const bp = h.basePart({ name: 'reproj' }), bt = bp.tris(), bn = bp.normals(), buv = h.baseObj.uvs;
  const bvh = occluders([{ pos: h.pos, tris: bt }]), idx = bvh.geometry.index;
  const S = Math.max(...imgs.map((e) => e.img.width));
  const pt = part.tris(), pn = part.normals(), puv = part.obj.uvs;
  const rp = rasterUV(pt, puv, S, 2), rb = rasterUV(bt, buv, S, 0), rm = rasterUV(pt, puv, S, 1);
  const map = new Float32Array(S * S * 3), tri = new Int32Array(S * S * 2).fill(-1);
  const P = [0, 0, 0], Nn = [0, 0, 0], Pb = [0, 0, 0], Nb = [0, 0, 0], q = new THREE.Vector3(), tgt = {};
  let n = 0, sumM = 0;
  for (let i = 0; i < S * S; i++) {
    if (rp.tri[i] < 0 || !texelSurface(rp, pt, part.pos, pn, i, P, Nn)) continue;
    const rw = region(P);
    if (!(rw > 0)) continue;
    const hit = bvh.closestPointToPoint(q.set(P[0], P[1], P[2]), tgt);
    if (!hit) continue;
    const f = Math.floor((idx ? idx.getX(hit.faceIndex * 3) : hit.faceIndex * 3) / 3);
    const Q = [hit.point.x, hit.point.y, hit.point.z];
    const m = rb.tri[i] >= 0 && texelSurface(rb, bt, h.pos, bn, i, Pb, Nb) ? dist(Q, Pb) : 1;
    const w = ss(lo, hi, m) * rw;
    if (!(w > 0)) continue;
    const a = bt[f * 6], b = bt[f * 6 + 2], c = bt[f * 6 + 4];
    const bw = closestBary(Q, h.pos, a * 3, b * 3, c * 3);
    const ta = bt[f * 6 + 1], tb = bt[f * 6 + 3], tc = bt[f * 6 + 5];
    map[i * 3] = buv[ta * 2] * bw[0] + buv[tb * 2] * bw[1] + buv[tc * 2] * bw[2];
    map[i * 3 + 1] = buv[ta * 2 + 1] * bw[0] + buv[tb * 2 + 1] * bw[1] + buv[tc * 2 + 1] * bw[2];
    map[i * 3 + 2] = w;
    tri[i * 2] = rp.tri[i]; tri[i * 2 + 1] = f;
    n++; sumM += Math.min(m, 0.2);
  }
  // per-triangle UV frames: dP/du, dP/dv of a proxy triangle; the in-plane gradients of u and v of a base triangle
  const frame = (tris, pos, uvs, t) => {
    const p = [0, 2, 4].map((k) => [pos[tris[t * 6 + k] * 3], pos[tris[t * 6 + k] * 3 + 1], pos[tris[t * 6 + k] * 3 + 2]]);
    const u = [1, 3, 5].map((k) => [uvs[tris[t * 6 + k] * 2], uvs[tris[t * 6 + k] * 2 + 1]]);
    const e1 = sub(p[1], p[0]), e2 = sub(p[2], p[0]);
    const du1 = u[1][0] - u[0][0], dv1 = u[1][1] - u[0][1], du2 = u[2][0] - u[0][0], dv2 = u[2][1] - u[0][1];
    const det = du1 * dv2 - du2 * dv1;
    const Pu = det ? scl(sub(scl(e1, dv2), scl(e2, dv1)), 1 / det) : [0, 0, 0];
    const Pv = det ? scl(sub(scl(e2, du1), scl(e1, du2)), 1 / det) : [0, 0, 0];
    const g11 = dot(e1, e1), g12 = dot(e1, e2), g22 = dot(e2, e2), gd = g11 * g22 - g12 * g12 || 1e-12;
    const grad = (d1, d2) => { const a1 = (g22 * d1 - g12 * d2) / gd, a2 = (g11 * d2 - g12 * d1) / gd; return add(scl(e1, a1), scl(e2, a2)); };
    return { Pu, Pv, gu: grad(du1, du2), gv: grad(dv1, dv2) };
  };
  const pf = new Map(), bf = new Map();
  const pF = (t) => { let r = pf.get(t); if (!r) pf.set(t, r = frame(pt, part.pos, puv, t)); return r; };
  const bF = (t) => { let r = bf.get(t); if (!r) bf.set(t, r = frame(bt, h.pos, buv, t)); return r; };
  for (const { img, normal, raw } of imgs) {
    const W = img.width, k = S / W, src = img.data.slice(), d = img.data;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const si = Math.min(S - 1, Math.floor((y + 0.5) * k)) * S + Math.min(S - 1, Math.floor((x + 0.5) * k)), j = si * 3;
      const w = map[j + 2];
      if (!(w > 0)) continue;
      const fx = Math.max(0, Math.min(W - 1.001, map[j] * W - 0.5)), fy = Math.max(0, Math.min(W - 1.001, (1 - map[j + 1]) * W - 0.5));
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const i00 = (y0 * W + x0) * 4, i10 = i00 + 4, i01 = i00 + W * 4, i11 = i01 + 4, o = (y * W + x) * 4;
      const sm = [0, 1, 2].map((ch) => (src[i00 + ch] * (1 - tx) + src[i10 + ch] * tx) * (1 - ty) + (src[i01 + ch] * (1 - tx) + src[i11 + ch] * tx) * ty);
      if (normal) {
        // tangent-space slopes follow the height gradient in UV space: slope_proxy = J^T slope_base with
        // J = d(u_b, v_b) / d(u_p, v_p) (the image-space sign flips of normalFromHeight cancel out). Without this the
        // copied relief lit the wrong way wherever the proxy island maps onto a mirrored / rotated base island.
        const A = pF(tri[si * 2]), Bf = bF(tri[si * 2 + 1]);
        const J11 = dot(Bf.gu, A.Pu), J12 = dot(Bf.gu, A.Pv), J21 = dot(Bf.gv, A.Pu), J22 = dot(Bf.gv, A.Pv);
        const nx = sm[0] / 127.5 - 1, ny = sm[1] / 127.5 - 1, nz = Math.max(0.2, sm[2] / 127.5 - 1);
        const sx = nx / nz, sy = ny / nz;
        let px = J11 * sx + J21 * sy, py = J12 * sx + J22 * sy;
        const L = Math.hypot(px, py);
        if (L > 4) { px *= 4 / L; py *= 4 / L; }
        const l = Math.hypot(px, py, 1);
        sm[0] = (px / l * 0.5 + 0.5) * 255; sm[1] = (py / l * 0.5 + 0.5) * 255; sm[2] = (1 / l * 0.5 + 0.5) * 255;
      }
      for (let ch = 0; ch < 3; ch++) d[o + ch] = Math.round(src[o + ch] + (sm[ch] - src[o + ch]) * w);
    }
    // the gutters round the proxy's own islands (mip / bilinear bleed) refilled from inside them
    const mask = new Uint8Array(W * W);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      let any = 0;
      for (let jy = 0; jy < k && !any; jy++) for (let jx = 0; jx < k; jx++) if (rm.tri[(y * k + jy) * S + x * k + jx] >= 0) { any = 1; break; }
      mask[y * W + x] = any;
    }
    pullPush(img, mask, { raw: !!(normal || raw) });
  }
  return { texels: n, meanMis: n ? sumM / n : 0 };
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
 * shadow into baseColor as well is what turned the first runner (types/runner.mjs) into a black silhouette in the game's lighting.
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
  if (!mouth) throw new Error('crawler: mouth boundary loop not found');
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


// ============================================================================================ crawler specifics

// ---------- palette (linear). Pale is a value AND a hue here: bluish-grey corpse skin ~sRGB 140-150 before the local
// detail (veins, grime, scrapes, blood) brings the painted average to ~120-135; the darkness of the character is
// detail + the ORM occlusion, never a dim base (docs/ZOMBIE_PIPELINE.md 2.3)
const C = {
  skin: lin([146, 146, 139]), skinCool: lin([134, 142, 150]), skinSallow: lin([154, 148, 123]), livid: lin([124, 112, 128]),
  waxy: lin([212, 208, 194]),
  vein: lin([64, 82, 106]), veinDeep: lin([46, 52, 80]), veinHalo: lin([110, 118, 140]),
  socket: lin([70, 46, 60]), inflamed: lin([132, 58, 56]),
  lip: lin([88, 50, 58]), gum: lin([96, 36, 40]),
  fresh: lin([94, 14, 12]), freshDeep: lin([54, 9, 8]), dried: lin([72, 26, 20]), crust: lin([46, 20, 15]),
  meat: lin([108, 28, 24]), meatDeep: lin([42, 9, 9]), fat: lin([176, 150, 96]),
  bone: lin([196, 186, 160]), boneStain: lin([150, 104, 82]),
  rash: lin([128, 76, 66]), rashRaw: lin([156, 86, 74]), callus: lin([92, 82, 70]),
  mud: lin([70, 60, 48]), grime: lin([104, 96, 84]), soot: lin([52, 48, 44]),
  nail: lin([44, 36, 30]), scalp: lin([126, 120, 112]), wisp: lin([46, 42, 40]),
  bruise: lin([106, 76, 104]),
  khaki: lin([100, 97, 76]), belt: lin([60, 44, 34]), buckle: lin([120, 116, 104]), fray: lin([172, 164, 138]),
};
const JAW_DEG = 19, JAW_DROP = 0.006, JAW_FWD = 0.004, JAW_WIDEN = 0.14;

/**
 * Curved claws growing out of the nail beds of every finger: a 4-sided talon per finger (base ring sunk into the nail
 * bed, a mid ring, the tip), hooked towards the palm. Rigid on the finger's last bone. The nail side of a finger is its
 * bone's local +X (positive Z rotations curl the fingers, i.e. move the tips towards -X); the dorsal radius and the
 * fingertip are measured on the morphed base mesh. Gore atlas u 0.56 (root) .. 0.99 (tip).
 */
function clawGeo(h, g) {
  const B = h.skeleton.byName;
  const body = [...h.baseObj.groupVerts('body')];
  const out = [];
  for (const s of ['l', 'r']) for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
    const b = B[`${f}_03_${s}`];
    if (!b) continue;
    const a = b.head.toArray(), tl = b.tail.toArray();
    const dir = norm(sub(tl, a)), Lb = dist(a, tl);
    const X = new THREE.Vector3(1, 0, 0).applyQuaternion(b.world).toArray();
    const nail = norm(sub(X, scl(dir, dot(X, dir))));
    const side = cross(dir, nail);
    // dorsal radius at 70 % of the bone and the fingertip's reach beyond the tail, from the base mesh
    let rN = 0.004, tip = 0;
    for (const v of body) {
      const p = [h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]];
      const q = sub(p, a), t = dot(q, dir);
      if (t < -0.005 || t > Lb + 0.02) continue;
      const lat = sub(q, scl(dir, t));
      if (Math.hypot(...lat) > 0.014) continue;
      if (Math.abs(t - Lb * 0.7) < 0.004) rN = Math.max(rN, dot(lat, nail));
      tip = Math.max(tip, t - Lb);
    }
    const thumb = f === 'thumb', small = f === 'pinky';
    const L = thumb ? 0.03 : small ? 0.03 : 0.04;
    const w0 = (thumb ? 0.0062 : small ? 0.0046 : 0.0056), h0 = w0 * 0.95;
    // root on the nail bed, ~9 mm back from the fingertip, just under the dorsal surface
    const root = add(a, add(scl(dir, Lb + tip - 0.009), scl(nail, rN * 0.72)));
    const hook = (t) => scl(nail, -0.016 * t * t);          // curls towards the palm along its length
    const rings = [[0, 1], [0.42, 0.7], [0.76, 0.34]];
    const ids = rings.map(([t, k]) => {
      const c = add(add(root, scl(dir, L * t)), hook(t));
      // flattened rhombus: wide across the finger, low over the nail
      return [[1, 0], [0, 1], [-1, 0], [0, -1]].map(([x, y], j) => g.v(add(c, add(scl(side, x * w0 * k), scl(nail, y * h0 * k))), [0.56 + 0.4 * t, 0.2 + j * 0.2], [[b.name, 1]]));
    });
    const tipV = g.v(add(add(root, scl(dir, L)), hook(1)), [0.99, 0.5], [[b.name, 1]]);
    for (let r = 0; r + 1 < ids.length; r++) for (let j = 0; j < 4; j++) g.quad(ids[r][j], ids[r][(j + 1) % 4], ids[r + 1][(j + 1) % 4], ids[r + 1][j]);
    for (let j = 0; j < 4; j++) g.tri(ids[ids.length - 1][j], ids[ids.length - 1][(j + 1) % 4], tipV);
    out.push({ name: b.name, root, tip: add(add(root, scl(dir, L)), hook(1)), dir, nail });
  }
  return out;
}

/**
 * Long, sharpened teeth: every tooth (connected component) of teeth_base is stretched along its crown direction
 * (upper row down, lower row up, tilted with the open jaw) and tapered to a point. Returns the number of teeth.
 */
function sharpenTeeth(teeth, jawRad) {
  const n = teeth.nVerts;
  const par = new Int32Array(n).map((_, i) => i);
  const find = (x) => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
  teeth.obj.faces.forEach((f, fi) => { if (teeth.keep[fi]) for (let k = 1; k < f.v.length; k++) par[find(f.v[k])] = find(f.v[0]); });
  const used = new Uint8Array(n);
  teeth.obj.faces.forEach((f, fi) => { if (teeth.keep[fi]) for (const v of f.v) used[v] = 1; });
  const comps = new Map();
  for (let i = 0; i < n; i++) { if (!used[i]) continue; const r = find(i); if (!comps.has(r)) comps.set(r, []); comps.get(r).push(i); }
  const list = [...comps.values()].filter((vs) => vs.length < 400).map((vs) => {
    const c = [0, 0, 0];
    for (const v of vs) for (let k = 0; k < 3; k++) c[k] += teeth.pos[v * 3 + k] / vs.length;
    return { vs, c };
  });
  if (!list.length) return 0;
  const midY = list.reduce((a, t) => a + t.c[1], 0) / list.length;
  const maxZ = Math.max(...list.map((t) => t.c[2]));
  for (const t of list) {
    const up = t.c[1] > midY;
    const d = up ? [0, -1, 0] : [0, Math.cos(jawRad), Math.sin(jawRad)];
    // front teeth (incisors, canines) much longer than the hidden molars
    const front = ss(maxZ - 0.03, maxZ - 0.008, t.c[2]);
    const K = mix(1.25, 1.85, front), taper = mix(0.35, 0.7, front);
    let tmax = 1e-6;
    for (const v of t.vs) tmax = Math.max(tmax, dot(sub([teeth.pos[v * 3], teeth.pos[v * 3 + 1], teeth.pos[v * 3 + 2]], t.c), d));
    for (const v of t.vs) {
      const p = [teeth.pos[v * 3], teeth.pos[v * 3 + 1], teeth.pos[v * 3 + 2]];
      const q = sub(p, t.c), s = dot(q, d);
      if (s <= 0) continue;
      const lat = sub(q, scl(d, s));
      const np = add(t.c, add(scl(d, s * K), scl(lat, 1 - taper * Math.min(1, s / tmax))));
      teeth.pos.set(np, v * 3);
    }
  }
  return list.length;
}

/**
 * Milky, blind-looking eyes on the MakeHuman eye texture (centres / iris radius measured on brown_eye.png): a dirty
 * yellow-grey, bloodshot sclera darkening towards the lids, a clouded pale blue-grey iris (cataract haze, faint ring
 * structure), a tiny grey pinpoint pupil. The emissive map gives the iris a faint cold eyeshine.
 */
function milkyEyes(src, N) {
  const W = src.width, H = src.height;
  const alb = createImage(W, H), em = createImage(W, H, [0, 0, 0, 255]);
  const centres = [[0.705, 0.295], [0.29, 0.71]];
  const c = [0, 0, 0], e = [0, 0, 0];
  const IR = 0.118;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, u = (x + 0.5) / W, v = (y + 0.5) / H;
    let d = 9, cu = 0, cv = 0;
    for (const [a, b] of centres) { const q = Math.hypot(u - a, v - b); if (q < d) { d = q; cu = u - a; cv = v - b; } }
    const ang = Math.atan2(cv, cu);
    e[0] = e[1] = e[2] = 0;
    // the whole globe clouded: a desaturated blue-grey sclera (a tan sclera round a white disc read as a costume
    // contact lens), the iris only a little lighter and bluer with a faint ring, no real pupil
    if (d > 0.3) { c[0] = 0.04; c[1] = 0.02; c[2] = 0.02; }
    else if (d > IR + 0.012) {
      const n = N.fbm(u * 26, v * 26, 1.5, 3);
      for (let k = 0; k < 3; k++) c[k] = lin([146, 150, 152])[k] * (0.9 + 0.12 * n);
      const far = ss(0.14, 0.27, d);
      const vein = N.ridged(u * 34, v * 34, 1.7, 3), vein2 = N.ridged(u * 85 + 3, v * 85, 4.2, 2);
      over(c, lin([128, 66, 66]), ss(0.6 - far * 0.15, 0.82, vein) * (0.2 + far * 0.4));
      over(c, lin([120, 62, 60]), ss(0.72, 0.9, vein2) * (0.1 + far * 0.35));
      mul(c, lin([170, 150, 146]), far * 0.45);
      kmul(c, 1 - 0.45 * ss(0.17, 0.28, d));
      // the haze over the cornea spills a little onto the sclera round the iris
      over(c, lin([158, 166, 174]), (1 - ss(IR + 0.01, IR + 0.05, d)) * 0.35);
    } else if (d > IR - 0.014) {
      // faint grey-blue limbal ring, hazed into both sides
      const k = 1 - Math.abs(d - (IR - 0.001)) / 0.013;
      for (let j = 0; j < 3; j++) c[j] = mix(lin([152, 160, 168])[j], lin([118, 128, 138])[j], clamp01(k) * 0.8);
      e[0] = 0.05; e[1] = 0.065; e[2] = 0.07;
    } else {
      const r = d / IR;
      const fib = N.noise(ang * 16, r * 4, 2.5) * 0.5 + 0.5, haze = N.fbm(u * 60, v * 60, 3.3, 2) * 0.5 + 0.5;
      const col = mix3(lin([168, 178, 186]), lin([148, 160, 172]), ss(0.25, 0.85, r));
      for (let k = 0; k < 3; k++) c[k] = col[k] * (0.88 + 0.12 * fib) * (0.95 + 0.07 * haze);
      // a faint ghost of the old iris ring under the haze
      mul(c, lin([146, 160, 172]), (1 - ss(0.0, 0.08, Math.abs(r - 0.62))) * 0.45);
      const pupil = 1 - ss(0.07, 0.13, r);
      over(c, lin([112, 120, 126]), pupil * 0.6);
      const glow = (1 - pupil * 0.8) * (0.7 + 0.3 * fib) * mix(1, 0.55, ss(0.5, 1, r));
      e[0] = 0.2 * glow; e[1] = 0.25 * glow; e[2] = 0.27 * glow;
    }
    alb.data[i] = toByte(c[0]); alb.data[i + 1] = toByte(c[1]); alb.data[i + 2] = toByte(c[2]); alb.data[i + 3] = 255;
    em.data[i] = toByte(e[0]); em.data[i + 1] = toByte(e[1]); em.data[i + 2] = toByte(e[2]);
  }
  return { albedo: alb, emissive: em };
}

/**
 * Gore atlas (256 x 64) for the mouth cavity, tongue, eye caps and the claws: u 0.03..0.39 lip lining -> near-black
 * throat, 0.40..0.46 tongue, 0.48 eye caps, 0.56..0.99 claw root (raw nail bed) -> dark horn -> worn yellowish tip.
 * ORM: roughness wet (cavity) / glossy horn (claws).
 */
function goreTextures(N) {
  const W = 256, H = 64;
  const alb = createImage(W, H, [0, 0, 0, 255]), orm = createImage(W, H, [255, 120, 0, 255]);
  const c = [0, 0, 0];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = (x + 0.5) / W, v = (y + 0.5) / H, i = (y * W + x) * 4;
    let ro = 0.45;
    if (u < 0.395) {
      // lip lining -> dark red-brown throat (not black: the tongue and back teeth have to read in the gape), wet
      const k = ss(0.03, 0.36, u);
      const a = mix3(lin([112, 42, 40]), lin([76, 24, 22]), ss(0.03, 0.16, u));
      for (let j = 0; j < 3; j++) c[j] = mix(a[j], lin([44, 15, 14])[j], ss(0.16, 0.36, u));
      kmul(c, 0.9 + 0.2 * N.fbm(u * 40, v * 9, 1.1, 2));
      ro = mix(0.26, 0.36, k);
    } else if (u < 0.47) {
      for (let j = 0; j < 3; j++) c[j] = lin([112, 56, 60])[j] * (0.85 + 0.25 * N.fbm(u * 80, v * 20, 2.2, 2));
      over(c, lin([70, 24, 24]), ss(0.3, 0.6, N.noise(u * 120, v * 30, 5.1)) * 0.45);
      ro = 0.3;
    } else if (u < 0.52) {
      for (let j = 0; j < 3; j++) c[j] = lin([34, 12, 10])[j];
      ro = 0.6;
    } else {
      const t = clamp01((u - 0.56) / 0.43);
      const streak = N.noise(v * 40, u * 3, 7.7) * 0.5 + 0.5;
      const horn = mix3(lin([46, 34, 26]), lin([74, 60, 44]), ss(0.15, 0.75, t));
      for (let j = 0; j < 3; j++) c[j] = horn[j] * (0.8 + 0.35 * streak);
      over(c, lin([150, 136, 106]), ss(0.8, 0.98, t) * 0.75);
      over(c, lin([102, 26, 22]), (1 - ss(0.0, 0.12, t)) * 0.9);
      over(c, lin([40, 14, 10]), ss(0.1, 0.25, t) * (1 - ss(0.25, 0.45, t)) * 0.5 * streak);
      ro = mix(0.3, 0.45, ss(0.7, 1, t));
    }
    alb.data[i] = toByte(c[0]); alb.data[i + 1] = toByte(c[1]); alb.data[i + 2] = toByte(c[2]);
    orm.data[i + 1] = Math.round(ro * 255);
  }
  return { albedo: alb, orm };
}

/**
 * The casualsuit01 jeans (image u ~0.36..0.72) -> filthy olive-khaki work trousers: the source's fold / twill shading
 * kept as a ratio around its mean on a khaki base (+ a slight warm drift), the belt (dark, not blue) a dark brown
 * leather with its own shading, the buckle a dull grey. Texels outside the jeans islands are left as they are.
 */
function recolourPants(img, isJeansUV) {
  const W = img.width, H = img.height, n = W * H;
  const out = { width: W, height: H, data: new Uint8Array(img.data) };
  const L = new Float32Array(n);
  let sum = 0, cnt = 0;
  for (let i = 0; i < n; i++) {
    const r = img.data[i * 4], g = img.data[i * 4 + 1], b = img.data[i * 4 + 2];
    L[i] = S2L[r] * 0.2126 + S2L[g] * 0.7152 + S2L[b] * 0.0722;
    if (isJeansUV((i % W + 0.5) / W, (Math.floor(i / W) + 0.5) / H) && b > r + 10) { sum += L[i]; cnt++; }
  }
  const mean = cnt ? sum / cnt : 0.1;
  const c = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const u = (i % W + 0.5) / W, v = (Math.floor(i / W) + 0.5) / H;
    if (!isJeansUV(u, v)) continue;
    const di = i * 4, r = img.data[di], g = img.data[di + 1], b = img.data[di + 2];
    const k = Math.max(0.55, Math.min(1.35, L[i] / mean));
    if (b <= r + 6 && L[i] < mean * 0.85) {
      // belt leather / dark stitching: dark brown, the buckle (light, grey) dull steel
      const lb = Math.max(0.5, Math.min(1.6, L[i] / 0.02));
      for (let j = 0; j < 3; j++) c[j] = C.belt[j] * lb;
      if (L[i] > mean * 0.6 && Math.max(r, g, b) - Math.min(r, g, b) < 12) for (let j = 0; j < 3; j++) c[j] = C.buckle[j] * Math.min(1.2, L[i] / mean);
    } else {
      for (let j = 0; j < 3; j++) c[j] = C.khaki[j] * k;
    }
    out.data[di] = toByte(c[0]); out.data[di + 1] = toByte(c[1]); out.data[di + 2] = toByte(c[2]);
  }
  return out;
}

export async function build(lib) {
  const N = lib.makeNoise(313);
  const TR = albedoTracer('crawler');
  const opts = lib.merge('gaunt', {
    macro: { gender: 1, age: 0.55, height: 0.42, proportions: 0.62, muscle: 0.45, weight: 0.0, race: { caucasian: 0.9, asian: 0.1 } },
    modifiers: {
      // starved: sunken belly and waist, no fat, flat buttocks, stick limbs with knobby joints
      'stomach-pregnant-decr-incr': -1, 'measure-waist-circ-decr-incr': -0.9, 'torso-scale-depth-decr-incr': -0.1,
      'torso-vshape-decr-incr': 0.15, 'buttocks-volume-decr-incr': -1, 'hip-scale-horiz-decr-incr': -0.3,
      'upperarm-fat-decr-incr': -0.4, 'lowerarm-fat-decr-incr': -0.5, 'upperleg-fat-decr-incr': -0.5, 'lowerleg-fat-decr-incr': -0.8,
      'measure-upperarm-circ-decr-incr': -0.75, 'measure-thigh-circ-decr-incr': -0.75, 'upperarm-scale-horiz-decr-incr': -0.25,
      'upperleg-scale-horiz-decr-incr': -0.2, 'measure-calf-circ-decr-incr': -0.6, 'measure-neck-circ-decr-incr': -0.6,
      'measure-wrist-circ-decr-incr': -0.4, 'measure-ankle-circ-decr-incr': -0.4,
      // long arms and big hands with very long, thin fingers (the claws grow out of them)
      'measure-upperarm-length-decr-incr': 0.2, 'measure-lowerarm-length-decr-incr': 0.3,
      'hand-fingers-length-decr-incr': 1, 'hand-fingers-diameter-decr-incr': -0.6, 'hand-scale-decr-incr': 0.35,
      'measure-neck-height-decr-incr': 0.45,
      // skull-tight head: sunken temples and cheeks, a shrunken nose, a broad, heavy, dropped jaw and a wide mouth
      'cheek-volume-decr-incr': -0.4, 'cheek-bones-decr-incr': 0.3, 'head-fat-decr-incr': -0.3, 'forehead-temple-decr-incr': -0.9,
      'head-age-decr-incr': 0.4, 'chin-width-decr-incr': 0.8, 'chin-bones-decr-incr': 0.7, 'chin-jaw-drop-decr-incr': 0.6,
      'chin-prognathism-decr-incr': 0.25, 'chin-height-decr-incr': 0.3, 'mouth-scale-horiz-decr-incr': 1,
      'mouth-lowerlip-volume-decr-incr': -0.6, 'mouth-upperlip-volume-decr-incr': -0.6,
      'nose-volume-decr-incr': -0.5, 'nose-scale-vert-decr-incr': -0.3, 'nose-point-width-decr-incr': -0.4,
    },
    // the gape: lips pulled back hard off the teeth and up into a snarl, jaw open, neck cords out, eyes wide and staring
    expression: {
      'mouth-open': 0.6, 'mouth-retraction': 0.7, 'mouth-upward-retraction': 0.45, 'mouth-depression': 0.35,
      'nose-left-elevation': 0.35, 'nose-right-elevation': 0.35, 'neck-platysma': 0.45,
      'eye-left-opened-up': 0.6, 'eye-right-opened-up': 0.6, 'eyebrows-left-down': 0.3, 'eyebrows-right-down': 0.3,
    },
  });
  const h = await lib.Human.create(opts);
  const B = h.skeleton.byName;
  const A = lib.anchors(h);
  const eyeY0 = (A.eyeL[1] + A.eyeR[1]) / 2;

  // ---- sculpt: the unhinged, widened jaw. Every base vertex (lower teeth / tongue helpers included) is rotated about
  // the jaw hinge by the CC0 MPFB2 default rig's mandible weights, on top of the open-mouth expression, and spread
  // sideways (the mandible ~14 % wider than the skull at the jaw angles)
  const jawRad = JAW_DEG * Math.PI / 180;
  {
    const wj = JSON.parse(fs.readFileSync(await lib.mpfb2('rigs/standard/weights.default.json'), 'utf8')).weights;
    const nV = h.pos.length / 3, jw = new Float32Array(nV);
    for (const [k, list] of Object.entries(wj)) {
      const f = /^(jaw|special04|oris01|oris07\.[LR]|tongue.*)$/.test(k) ? 1 : /^levator05\./.test(k) ? 0.5 : 0;
      if (f) for (const [v, w] of list) jw[v] += w * f;
    }
    const H = [0, eyeY0 - 0.03, B.head.head.z + 0.004];
    let n = 0;
    for (let v = 0; v < nV; v++) {
      const w = Math.min(1, jw[v]);
      if (!(w > 0.002)) continue;
      const y = h.pos[v * 3 + 1] - H[1], z = h.pos[v * 3 + 2] - H[2];
      const a = jawRad * w, c = Math.cos(a), s = Math.sin(a);
      const ny = y * c - z * s, nz = y * s + z * c;
      const p = [h.pos[v * 3] * (1 + JAW_WIDEN * w), H[1] + ny - JAW_DROP * w, H[2] + nz + JAW_FWD * w];
      for (let k = 0; k < 3; k++) { h.pos[v * 3 + k] = p[k]; h.dm[v * 3 + k] = p[k] * 10 + h.origin[k]; }
      n++;
    }
    console.log(`${TAG} jaw: hinge ${H.map((q) => q.toFixed(3))}, ${n} vertices rotated ${JAW_DEG} deg, widened ${JAW_WIDEN * 100} %`);
  }
  // ---- sculpt: no wrist step. The oversized hands ('hand-scale' + the long fingers) met the thin wrist with a hard,
  // cuff-like rim (a forearm going into a glove). The cross-section from mid-forearm to just past the wrist crease is
  // re-blended, per angle round the forearm axis, from the mid-forearm profile to the heel-of-the-hand profile, so the
  // hand's up-scale fades in along the forearm (a flat, bony distal forearm, as on very thin people). The proxy forearm
  // is refined further down so the taper is not lost between its two rings.
  const fore = ['l', 'r'].map((s) => {
    const E = B[`lowerarm_${s}`].head.toArray(), Wr = B[`hand_${s}`].head.toArray();
    const L = dist(E, Wr), ax = norm(sub(Wr, E));
    const ref = norm(sub([0, 1, 0], scl(ax, ax[1]))), side = cross(ax, ref);
    return { s, E, L, ax, ref, side, t0: 0.42, t1: 1 + 0.03 / L };
  });
  const foreAt = (F, P) => {
    const q0 = sub(P, F.E), t = dot(q0, F.ax) / F.L;
    const q = sub(q0, scl(F.ax, t * F.L));
    return { t, q, r: Math.hypot(q[0], q[1], q[2]), ang: Math.atan2(dot(q, F.side), dot(q, F.ref)) };
  };
  {
    const NA = 24, DT = 0.025, TA = 0.3;
    const prof = fore.map((F) => {
      const NT = Math.ceil((F.t1 + 0.08 - TA) / DT) + 1;
      const R = new Float32Array(NT * NA);
      for (const v of h.baseObj.groupVerts('body')) {
        const c = foreAt(F, [h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]]);
        if (c.t < TA - DT || c.t > F.t1 + 0.08 || c.r > 0.09) continue;
        const ti = Math.max(0, Math.min(NT - 1, Math.round((c.t - TA) / DT)));
        const ai = ((Math.round((c.ang + Math.PI) / (2 * Math.PI) * NA) % NA) + NA) % NA;
        R[ti * NA + ai] = Math.max(R[ti * NA + ai], c.r);
      }
      // fill empty bins round the ring, then smooth (3 taps in angle, 3 in t)
      for (let ti = 0; ti < NT; ti++) for (let pass = 0; pass < NA; pass++) for (let ai = 0; ai < NA; ai++) {
        const i = ti * NA + ai;
        if (R[i] > 0) continue;
        const a = R[ti * NA + (ai + NA - 1) % NA], b = R[ti * NA + (ai + 1) % NA];
        if (a > 0 || b > 0) R[i] = a > 0 && b > 0 ? (a + b) / 2 : Math.max(a, b);
      }
      const S1 = R.slice();
      for (let ti = 0; ti < NT; ti++) for (let ai = 0; ai < NA; ai++) S1[ti * NA + ai] = (R[ti * NA + (ai + NA - 1) % NA] + 2 * R[ti * NA + ai] + R[ti * NA + (ai + 1) % NA]) / 4;
      const S2 = S1.slice();
      for (let ti = 1; ti < NT - 1; ti++) for (let ai = 0; ai < NA; ai++) S2[ti * NA + ai] = (S1[(ti - 1) * NA + ai] + 2 * S1[ti * NA + ai] + S1[(ti + 1) * NA + ai]) / 4;
      const at = (t, ang) => {
        const ft = Math.max(0, Math.min(NT - 1.001, (t - TA) / DT)), ti = Math.floor(ft), wt = ft - ti;
        const fa = ((ang + Math.PI) / (2 * Math.PI) * NA + NA) % NA, ai = Math.floor(fa) % NA, wa = fa - Math.floor(fa), aj = (ai + 1) % NA;
        const g = (k) => S2[k] || 0.02;
        return mix(mix(g(ti * NA + ai), g(ti * NA + aj), wa), mix(g((ti + 1) * NA + ai), g((ti + 1) * NA + aj), wa), wt);
      };
      return at;
    });
    let maxD = 0;
    const res = sculptBase(h, (P) => {
      for (let k = 0; k < 2; k++) {
        const F = fore[k], c = foreAt(F, P);
        if (c.t <= F.t0 || c.t >= F.t1 || c.r > 0.09 || c.r < 1e-4) continue;
        const R = prof[k];
        const u = (c.t - F.t0) / (F.t1 - F.t0), w = u * u * u * (u * (u * 6 - 15) + 10);
        const want = mix(R(F.t0, c.ang), R(F.t1, c.ang), w), have = R(c.t, c.ang);
        // keep a trace of the bony wrist (25 % of the old deviation)
        const kk = Math.max(0.82, Math.min(1.7, want / have)) ** 0.75;
        const d = scl(c.q, kk - 1);
        maxD = Math.max(maxD, Math.hypot(d[0], d[1], d[2]));
        return d;
      }
      return null;
    });
    console.log(`${TAG} wrist blend: ${res.moved} base verts, max ${(maxD * 1000).toFixed(1)} mm (forearm ${fore[0].L.toFixed(3)} m)`);
  }
  Object.assign(A, lib.anchors(h));
  const eyeY = (A.eyeL[1] + A.eyeR[1]) / 2, eyeZ = (A.eyeL[2] + A.eyeR[2]) / 2;
  const skull = [0, eyeY + 0.015, eyeZ - 0.085];
  const neckY = B.neck_01.head.y;
  const SHL = B.upperarm_l.head.toArray(), SHR = B.upperarm_r.head.toArray();
  const armL = limbCoords(h, ['upperarm_l', 'lowerarm_l']), armR = limbCoords(h, ['upperarm_r', 'lowerarm_r']);
  const legL = limbCoords(h, ['thigh_l', 'calf_l']), legR = limbCoords(h, ['thigh_r', 'calf_r']);
  const kneeL = B.calf_l.head.toArray(), kneeR = B.calf_r.head.toArray();
  const elbowR = B.lowerarm_r.head.toArray(), elbowL = B.lowerarm_l.head.toArray();
  const jawZone = (P) => 1 - ss(0.6, 1.25, Math.hypot((Math.abs(P[0]) - 0.055) / 0.034, (P[1] - (A.mouth[1] + 0.006)) / 0.04, (P[2] - (B.head.head.z - 0.03)) / 0.04));
  console.log(`${TAG} height ${h.height.toFixed(3)}  neck ${neckY.toFixed(3)}  shoulders ${SHL.map((v) => v.toFixed(3))}  pelvis ${B.pelvis.head.y.toFixed(3)}  eyeY ${eyeY.toFixed(3)}  mouth ${A.mouth.map((v) => v.toFixed(3))}`);
  console.log(`${TAG} bone lengths: upperarm ${B.upperarm_l.head.distanceTo(B.upperarm_l.tail).toFixed(3)} lowerarm ${B.lowerarm_l.head.distanceTo(B.lowerarm_l.tail).toFixed(3)} hand ${B.hand_l.head.distanceTo(B.middle_01_l.head).toFixed(3)} middle ${['01', '02', '03'].map((k) => B[`middle_${k}_l`].head.distanceTo(B[`middle_${k}_l`].tail).toFixed(3)).join('/')} thigh ${B.thigh_l.head.distanceTo(B.thigh_l.tail).toFixed(3)} calf ${B.calf_l.head.distanceTo(B.calf_l.tail).toFixed(3)}`);

  // torso cross-section per height (2 cm bins): centre z, front / back z, half width (arms excluded)
  const torso = (() => {
    const y0 = 0.75, NB = 48, BS = 0.02;
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
      if (Math.abs(x) < 0.03 && !(y > neckY - 0.02 && z > B.neck_01.head.z + 0.02)) { zf[b] = Math.max(zf[b], z); zb[b] = Math.min(zb[b], z); }
    }
    fill(zf, (q) => q < -1); fill(zb, (q) => q > 1);
    for (const v of h.baseObj.groupVerts('body')) {
      const x = h.pos[v * 3], y = h.pos[v * 3 + 1], z = h.pos[v * 3 + 2];
      const b = Math.round((y - y0) / BS);
      if (b < 0 || b >= NB) continue;
      const cz = (zf[b] + zb[b]) / 2;
      if (Math.abs(z - cz) > 0.035 || Math.abs(x) > 0.19) continue;
      const pv = [x, y, z], al = armL(pv), ar = armR(pv);
      if ((al.r < 0.07 && al.s > -0.05) || (ar.r < 0.07 && ar.s > -0.05)) continue;
      hw[b] = Math.max(hw[b], Math.abs(x));
    }
    fill(hw, (q) => q <= 0);
    // smoothed over +-3 bins: per-bin jitter (arm exclusion, armpits) made the rib lines zigzag on the flanks
    const smooth = (arr) => { const o = arr.slice(); for (let b = 0; b < NB; b++) { let s = 0, n = 0; for (let k = -3; k <= 3; k++) { const j = b + k; if (j >= 0 && j < NB) { s += arr[j]; n++; } } o[b] = s / n; } return o; };
    { const a = smooth(hw); hw.set(a); }
    { const f2 = smooth(zf), b2 = smooth(zb); zf.set(f2); zb.set(b2); }
    const at = (arr, y) => { const f = Math.max(0, Math.min(NB - 1.001, (y - y0) / BS)); const i = Math.floor(f); return mix(arr[i], arr[i + 1], f - i); };
    return { cz: (y) => (at(zf, y) + at(zb, y)) / 2, dz: (y) => Math.max(0.05, (at(zf, y) - at(zb, y)) / 2), hw: (y) => Math.max(0.06, at(hw, y)), zf: (y) => at(zf, y), zb: (y) => at(zb, y) };
  })();
  const yChest = B.spine_03.head.y, yPelvis = B.pelvis.head.y;
  console.log(`${TAG} torso by y: ${[0.95, 1.05, 1.15, 1.25, 1.35].map((y) => `${y}: zf ${torso.zf(y).toFixed(3)} zb ${torso.zb(y).toFixed(3)} hw ${torso.hw(y).toFixed(3)}`).join(" | ")}  yChest ${yChest.toFixed(3)}`);
  console.log(`${TAG} torso @chest: cz ${torso.cz(yChest).toFixed(3)} dz ${torso.dz(yChest).toFixed(3)} hw ${torso.hw(yChest).toFixed(3)}; @waist(${B.spine_01.head.y.toFixed(2)}): hw ${torso.hw(B.spine_01.head.y).toFixed(3)} dz ${torso.dz(B.spine_01.head.y).toFixed(3)}`);

  // ---- geometry (bound to the morphed base mesh)
  // refine: the bald cranium (faceted on the low-poly proxy), the stretched lower face round the gape, and the back
  // (twice down the spine for the spinous processes, once over the shoulder blades)
  const backOf = (p) => p[2] < torso.cz(Math.max(0.8, Math.min(1.6, p[1])));
  const headZone = (p, m = 0) => (p[1] > eyeY + 0.025 - m && dist(p, skull) < 0.16 + m && !(Math.abs(p[0]) > 0.066 && p[1] < eyeY + 0.06))
    || (Math.hypot(p[0] / 1.5, p[1] - A.mouth[1] + 0.012, (p[2] - A.mouth[2]) * 0.8) < 0.05 + m && p[2] > A.mouth[2] - 0.06);
  // (a proxy triangle is split only when all three corners pass: the strip has to be wider than the proxy's ~4 cm faces)
  const spineZone = (p, m = 0) => Math.abs(p[0]) < 0.06 + m && p[1] > yPelvis - 0.01 - m && p[1] < neckY + 0.03 + m && backOf(p);
  const bladeZone = (p, m = 0) => Math.abs(p[0]) > 0.03 - m && Math.abs(p[0]) < 0.16 + m && p[1] > SHL[1] - 0.25 - m && p[1] < SHL[1] + 0.01 + m && backOf(p);
  // the forearms (mid-forearm .. heel of the hand): the proxy has one ring at the elbow and one at the wrist, the
  // wrist blend above needs the ones in between
  const foreZone = (p, m = 0) => fore.some((F) => { const c = foreAt(F, p); return c.t > 0.2 - m * 3 && c.t < F.t1 + 0.05 + m * 3 && c.r < 0.075 + m; });
  let body = await h.proxyBody('male1591');
  body = refineSurface(lib, h, body, headZone);
  body = refineSurface(lib, h, body, foreZone);
  // (+ the trapezius slope up to the shoulder line: its few big proxy triangles ran from the clavicle / upper-arm
  // weighted shoulder top straight down to the spine_03 weighted blade, so they creased at the refined strip's border
  // in the rest pose and sheared into flat fins over the back whenever the arms reached forward)
  const trapZone = (p, m = 0) => Math.abs(p[0]) < 0.21 + m && p[1] > SHL[1] - 0.06 - m && p[1] < neckY + 0.045 + m && backOf(p);
  // (and the shoulder tops front and back, neck base to acromion: one coarse facet there peaked into a spike whenever
  // the arms went high - leap, attack swipes)
  const shoulderTop = (p, m = 0) => p[1] > SHL[1] - 0.05 - m && p[1] < neckY + 0.04 + m && Math.abs(p[0]) > 0.035 - m && Math.abs(p[0]) < 0.24 + m && Math.abs(p[2] - torso.cz(Math.min(1.6, p[1]))) < 0.12 + m;
  body = refineSurface(lib, h, body, (p, m) => spineZone(p, m) || bladeZone(p, m) || trapZone(p, m) || shoulderTop(p, m));
  body = refineSurface(lib, h, body, (p, m) => spineZone(p, m) && Math.abs(p[0]) < 0.035 + (m || 0));
  {
    // the open jaw crumples the proxy at the jaw angle / under the ear lobes: relax that patch (the ear stays)
    const jy = A.mouth[1] - 0.01, jz = B.head.head.z - 0.005;
    const crease = relaxFolds(body, (P) => {
      if (Math.abs(P[0]) > 0.072 && P[1] > eyeY - 0.05) return 0;
      const q = Math.hypot((Math.abs(P[0]) - 0.064) / 0.034, (P[1] - jy) / 0.05, (P[2] - jz) / 0.05);
      return 1 - ss(0.55, 1.0, q);
    }, { iters: 8 });
    console.log(`${TAG} jaw-angle relax: worst crease ${crease.map((d) => d.toFixed(0) + ' deg').join(' -> ')}`);
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
      // (a face counts as inside when all its corners are, or its centroid is and it lies clearly behind the lips:
      // with the jaw rotated, a few flap faces straddle the loop and showed as pale slivers in the gape)
      const lipSet = new Set(lip);
      let n = 0;
      body.obj.faces.forEach((f, fi) => {
        if (!body.keep[fi]) return;
        const zs = f.v.map((v) => body.pos[v * 3 + 2]);
        if (zs.some((z) => z > zLip + 0.004 || z < zLip - 0.1)) return;
        const all = f.v.every((v) => inPoly(body.pos[v * 3], body.pos[v * 3 + 1]));
        const cx = f.v.reduce((a, v) => a + body.pos[v * 3], 0) / f.v.length, cy = f.v.reduce((a, v) => a + body.pos[v * 3 + 1], 0) / f.v.length;
        const cz = zs.reduce((a, z) => a + z, 0) / zs.length;
        const behind = cz < zLip - 0.006 && !f.v.every((v) => lipSet.has(v));
        if (all || (behind && inPoly(cx, cy))) { body.keep[fi] = 0; n++; }
      });
      console.log(`${TAG} ${n} body faces removed from inside the gape (lip loop ${lip.length} verts)`);
    }
  }
  // ---- the back: spinous processes (a serrated ridge from C7 to L5) and winged shoulder blades, displaced on the
  // refined proxy itself (the base mesh is too coarse for 2.6 cm vertebrae); skinning / UVs are untouched
  const vert = (() => {
    const yTop = neckY - 0.004, yBot = yPelvis + 0.035, n = 18;
    return Array.from({ length: n }, (_, k) => ({ y: mix(yTop, yBot, k / (n - 1)), amp: k === 0 ? 0.012 : k < 12 ? 0.009 : 0.007 }));
  })();
  const vSpace = (vert[0].y - vert[vert.length - 1].y) / (vert.length - 1);
  // the two torn-open rib wounds (relief paint + a shallow cave-in of the proxy surface): position by the angle round
  // the torso cross-section (0 front .. pi/2 side .. pi back) and the height
  const WOUNDS = [
    { side: 1, aC: 1.62, yC: SHL[1] - 0.225, ra: 0.62, ry: 0.082, k: 1 },
    { side: -1, aC: 2.38, yC: SHL[1] - 0.28, ra: 0.4, ry: 0.05, k: 0.85 },
  ];
  const torsoAng = (P) => { const y = P[1]; return Math.atan2(Math.abs(P[0]) / torso.hw(y), (P[2] - torso.cz(y)) / torso.dz(y)); };
  /**
   * Rib phase at height yd (= y + the rib line's drop D at that angle): ~2.7 cm pitch, warped so the spacing varies
   * +-20 % over the cage; amp / wv vary depth and width smoothly from rib to rib (a regular stripe read as a washboard).
   * calm: less wobble (inside the wounds the ribs are real bars).
   */
  const ribPhase = (yd, P, calm = false) => {
    const ph0 = yd / 0.027;
    const ph = ph0 + 0.1 * Math.sin(ph0 * 2.1 + 0.7) + (calm ? N.noise(P[0] * 5, P[1] * 5, P[2] * 5) * 0.05 : N.noise(P[0] * 9, P[1] * 9, P[2] * 9) * 0.13);
    return { ph, g: Math.cos(ph * Math.PI * 2), amp: 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(ph0 * 1.37 + 2.1)), wv: 0.22 * Math.sin(ph0 * 0.83 + 1.3) };
  };
  // gravity runs off the feeding bib (x off the mouth centre, start / length below the mouth, width, lean; metres)
  const BIB_RUNS = Array.from({ length: 8 }, (_, i) => {
    const r = (k) => hash(i * 7 + k + 101);
    return { x: (r(1) - 0.5) * 0.1, y0: 0.07 + r(2) * 0.06, len: 0.05 + r(3) * 0.15, w: 0.0026 + r(4) * 0.003, lean: (r(5) - 0.5) * 0.08, gap: r(6) };
  });
  const woundQ = (P, W) => Math.hypot((torsoAng(P) - W.aC) / W.ra, (P[1] - W.yC) / W.ry) + N.fbm(P[0] * 30, P[1] * 30, P[2] * 30, 3) * 0.3 + N.noise(P[0] * 120, P[1] * 120, P[2] * 120) * 0.05;
  const bladeBorder = (y, S) => 0.072 + (S[1] - 0.05 - y) * 0.13;
  const backDisp = (P) => {
    if (!backOf(P)) return 0;
    const ax = Math.abs(P[0]);
    let d = 0;
    if (ax < 0.03 && P[1] < neckY + 0.02 && P[1] > yPelvis) {
      let bump = 0, amp = 0;
      for (const v of vert) {
        const k = Math.exp(-(((P[1] - v.y) / (vSpace * 0.3)) ** 2));
        if (k > bump) { bump = k; amp = v.amp; }
      }
      d += amp * bump * Math.exp(-((ax / 0.0075) ** 2)) + 0.0025 * Math.exp(-((ax / 0.012) ** 2));
    }
    for (const S of [SHL, SHR]) {
      if (P[0] * Math.sign(S[0]) < 0) continue;
      const top = S[1] - 0.02, bot = S[1] - 0.235;
      if (P[1] > top + 0.01 || P[1] < bot - 0.04) continue;
      const bx = bladeBorder(P[1], S);
      // the blade: lifted most along its medial border, tapering to the inferior angle (narrower towards the bottom).
      // A low plate (9 mm) with long ramps: the top edge feathers out over 6 cm and is flat again 3 cm below the
      // shoulder line, well inside the refined strip (a 2 cm lift with 5 cm ramps ended at the strip's coarse border
      // and left a hard horizontal crease there, and sheared into fins when the arms swung forward)
      const vy = ss(bot - 0.02, bot + 0.05, P[1]) * (1 - ss(top - 0.075, top - 0.012, P[1]));
      const width = mix(0.04, 0.1, ss(bot, bot + 0.12, P[1]));
      const plate = ss(bx - 0.022, bx + 0.008, ax) * (1 - ss(bx + 0.012, bx + width + 0.012, ax)) ** 0.8;
      d += 0.009 * plate * vy;
      // the hollow between the blade and the spine
      d -= 0.002 * ss(0.022, 0.04, ax) * (1 - ss(bx - 0.026, bx - 0.004, ax)) * vy;
    }
    return d;
  };
  // the shoulder-blade zone's skin weights (0..1, feathered >= 4 cm all round): the plate rolls with the shoulder
  // girdle (spine_03 60 % / clavicle 40 %) instead of staying rigid on spine_03 while the shoulder above it moves
  const bladeW = (P, S) => {
    const ax = Math.abs(P[0]), y = P[1];
    const top = S[1] - 0.02, bot = S[1] - 0.235, bx = bladeBorder(y, S);
    return ss(bot - 0.06, bot + 0.02, y) * (1 - ss(top - 0.02, top + 0.05, y)) * ss(0.012, 0.05, ax) * (1 - ss(bx + 0.06, bx + 0.12, ax));
  };
  {
    const bn = body.normals();
    let moved = 0, maxD = 0;
    let caved = 0;
    for (let v = 0; v < body.nVerts; v++) {
      const P = [body.pos[v * 3], body.pos[v * 3 + 1], body.pos[v * 3 + 2]];
      // the rib wounds cave in a little (the torn skin's thickness + the meat between the ribs)
      for (const W of WOUNDS) {
        if (P[0] * W.side <= 0 || Math.abs(P[1] - W.yC) > W.ry * 1.6) continue;
        const q = woundQ(P, W);
        if (q >= 1.05) continue;
        const k = 0.006 * W.k * (1 - ss(0.6, 1.05, q));
        for (let j = 0; j < 3; j++) body.pos[v * 3 + j] -= bn[v * 3 + j] * k;
        caved++;
      }
      const d = backDisp(P);
      if (!d) continue;
      const nz = norm([bn[v * 3] * 0.6, bn[v * 3 + 1] * 0.3, Math.min(-0.4, bn[v * 3 + 2])]);
      for (let k = 0; k < 3; k++) body.pos[v * 3 + k] += nz[k] * d;
      moved++; maxD = Math.max(maxD, Math.abs(d));
    }
    console.log(`${TAG} rib wounds: ${caved} body verts caved in`);
    console.log(`${TAG} back relief: ${moved} body verts displaced, max ${(maxD * 1000).toFixed(1)} mm`);
  }
  {
    // blade weights: blend towards spine_03 0.6 / clavicle 0.4 by the feathered zone mask
    const sp3 = B.spine_03.index;
    let nW = 0;
    for (let v = 0; v < body.nVerts; v++) {
      const P = [body.pos[v * 3], body.pos[v * 3 + 1], body.pos[v * 3 + 2]];
      if (!backOf(P)) continue;
      const S = P[0] >= 0 ? SHL : SHR;
      const k = 0.95 * bladeW(P, S);
      if (!(k > 0.005)) continue;
      const tgt = new Map([[sp3, 0.6], [B[S === SHL ? 'clavicle_l' : 'clavicle_r'].index, 0.4]]);
      const cur = new Map(body.weights[v]);
      let list = [...new Set([...cur.keys(), ...tgt.keys()])].map((b) => [b, (cur.get(b) || 0) * (1 - k) + (tgt.get(b) || 0) * k]);
      list = list.filter(([, w]) => w > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
      const sum = list.reduce((a, [, w]) => a + w, 0);
      body.weights[v] = list.map(([b, w]) => [b, w / sum]);
      const segAcc = new Float32Array(10);
      for (const [b, w] of body.weights[v]) segAcc[boneSegment(h.skeleton.bones[b].name)] += w;
      let best = 0;
      for (let sI = 1; sI < 10; sI++) if (segAcc[sI] > segAcc[best]) best = sI;
      body.seg[v] = best;
      nW++;
    }
    // smooth shading across the refined back strip's border: where small refined triangles meet the coarse proxy
    // faces the area-weighted vertex normals step; those vertices (and their ring) get neighbour-averaged normals
    const raw = body.normals.bind(body);
    body.normals = (pos = body.pos) => {
      const nrm = raw(pos);
      const t = body.tris(), nv = pos.length / 3;
      const amin = new Float32Array(nv).fill(1e9), amax = new Float32Array(nv), nb = Array.from({ length: nv }, () => []);
      for (let i = 0; i < t.length; i += 6) {
        const a = t[i], b = t[i + 2], c = t[i + 4];
        const A3 = 0.5 * Math.hypot(...cross(sub([pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]], [pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]]), sub([pos[c * 3], pos[c * 3 + 1], pos[c * 3 + 2]], [pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]])));
        for (const [x, y, z] of [[a, b, c], [b, c, a], [c, a, b]]) { amin[x] = Math.min(amin[x], A3); amax[x] = Math.max(amax[x], A3); nb[x].push(y, z); }
      }
      const w = new Float32Array(nv);
      for (let v = 0; v < nv; v++) {
        const P = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
        if (!backOf(P) || P[1] < yPelvis - 0.02 || P[1] > neckY + 0.08 || !nb[v].length) continue;
        if (amax[v] > amin[v] * 2.5) { w[v] = 1; for (const u of nb[v]) w[u] = Math.max(w[u], 0.5); }
      }
      for (let it = 0; it < 2; it++) {
        const nx = nrm.slice();
        for (let v = 0; v < nv; v++) {
          if (!w[v]) continue;
          const acc = [0, 0, 0];
          for (const u of nb[v]) for (let j = 0; j < 3; j++) acc[j] += nrm[u * 3 + j];
          const m = norm(acc), o = norm([0, 1, 2].map((j) => mix(nrm[v * 3 + j], m[j], 0.6 * w[v])));
          nx.set(o, v * 3);
        }
        nrm.set(nx);
      }
      return nrm;
    };
    console.log(`${TAG} blade weights blended on ${nW} body verts`);
    // the wrist: the crawl plants the palm with the wrist bent back hard; with the proxy's single wrist ring taking
    // the whole bend the back of the hand folded over the forearm in a cuff-like rim. The lowerarm / hand split is
    // spread over ~5 cm before to ~3.5 cm past the joint (the refined forearm has the vertices for it)
    let nWr = 0;
    for (let v = 0; v < body.nVerts; v++) {
      const P = [body.pos[v * 3], body.pos[v * 3 + 1], body.pos[v * 3 + 2]];
      for (const F of fore) {
        const c = foreAt(F, P);
        if (c.r > 0.08 || c.t < 1 - 0.07 / F.L || c.t > 1 + 0.05 / F.L) continue;
        const iL = B[`lowerarm_${F.s}`].index, iH = B[`hand_${F.s}`].index;
        const cur = new Map(body.weights[v]);
        const wl = cur.get(iL) || 0, wh = cur.get(iH) || 0, tot = wl + wh;
        if (tot < 0.3) continue;
        const nh = tot * mix(wh / tot, ss(1 - 0.05 / F.L, 1 + 0.035 / F.L, c.t), 0.75);
        cur.set(iH, nh); cur.set(iL, tot - nh);
        const list = [...cur.entries()].filter(([, w]) => w > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
        const sum = list.reduce((a, [, w]) => a + w, 0);
        body.weights[v] = list.map(([b, w]) => [b, w / sum]);
        nWr++;
      }
    }
    console.log(`${TAG} wrist weights spread on ${nWr} body verts`);
    // the shoulder girdle: weight diffusion over the mesh (neck base -> acromion, upper half of the shoulder) so the
    // clavicle / upper-arm / spine transforms blend over several rings instead of one coarse facet
    {
      const t = body.tris(), nv = body.nVerts, nb = Array.from({ length: nv }, () => new Set());
      for (let i = 0; i < t.length; i += 6) { const a = t[i], b = t[i + 2], c = t[i + 4]; nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b); }
      const zw = new Float32Array(nv);
      for (let v = 0; v < nv; v++) {
        const P = [body.pos[v * 3], body.pos[v * 3 + 1], body.pos[v * 3 + 2]];
        for (const S of [SHL, SHR]) {
          if (P[0] * Math.sign(S[0]) <= 0) continue;
          const a0 = [Math.sign(S[0]) * 0.03, neckY - 0.01, S[2]], d = sub(S, a0), L2 = dot(d, d);
          const tt = clamp01(dot(sub(P, a0), d) / L2), q = dist(P, add(a0, scl(d, tt)));
          zw[v] = Math.max(zw[v], (1 - ss(0.07, 0.13, q)) * ss(S[1] - 0.06, S[1] - 0.01, P[1]));
        }
      }
      let nS = 0;
      for (let it = 0; it < 4; it++) {
        const next = body.weights.slice();
        for (let v = 0; v < nv; v++) {
          if (!(zw[v] > 0.01) || !nb[v].size) continue;
          const acc = new Map();
          for (const u of nb[v]) for (const [b, w] of body.weights[u]) acc.set(b, (acc.get(b) || 0) + w / nb[v].size);
          const k = 0.5 * zw[v], cur = new Map(body.weights[v]);
          const keys = new Set([...cur.keys(), ...acc.keys()]);
          const list = [...keys].map((b) => [b, (cur.get(b) || 0) * (1 - k) + (acc.get(b) || 0) * k]).filter(([, w]) => w > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
          const sum = list.reduce((a, [, w]) => a + w, 0);
          next[v] = list.map(([b, w]) => [b, w / sum]);
          if (it === 0) nS++;
        }
        body.weights = next;
      }
      for (let v = 0; v < nv; v++) {
        if (!(zw[v] > 0.01)) continue;
        const segAcc = new Float32Array(10);
        for (const [b, w] of body.weights[v]) segAcc[boneSegment(h.skeleton.bones[b].name)] += w;
        let best = 0;
        for (let sI = 1; sI < 10; sI++) if (segAcc[sI] > segAcc[best]) best = sI;
        body.seg[v] = best;
      }
      console.log(`${TAG} shoulder weights diffused on ${nS} body verts`);
    }
  }

  const pants = await h.fit('clothes/male_casualsuit01', { name: 'pants', role: 'cloth' });
  const eyes = await h.fit('eyes/low-poly', { name: 'eyes', role: 'eye', hide: false });
  const teeth = await h.fit('teeth/teeth_base', { name: 'teeth', role: 'teeth', hide: false });

  // ---- trousers: keep the jeans islands of casualsuit01 (image u ~0.36..0.72), the shirt and the shoes go
  const isJeansUV = (u) => u > 0.345 && u < 0.73;
  {
    const isl = uvIslands(pants), info = new Map(), uv = pants.obj.uvs;
    pants.obj.faces.forEach((f, fi) => {
      let s = info.get(isl[fi]);
      if (!s) info.set(isl[fi], s = { u0: 9, u1: -9 });
      for (const t of f.t) { s.u0 = Math.min(s.u0, uv[t * 2]); s.u1 = Math.max(s.u1, uv[t * 2]); }
    });
    let gone = 0;
    pants.obj.faces.forEach((f, fi) => { const s = info.get(isl[fi]); if (!isJeansUV((s.u0 + s.u1) / 2)) { pants.keep[fi] = 0; gone++; } });
    console.log(`${TAG} casualsuit01: ${gone} shirt / shoe faces removed, ${pants.triCount()} jeans tris`);
  }
  // waistband: highest trouser vertex per 2 cm x-bin on the front
  const pantsTopAt = (() => {
    const NB = 31, top = new Float32Array(NB).fill(-1);
    pants.obj.faces.forEach((f, fi) => {
      if (!pants.keep[fi]) return;
      for (const v of f.v) {
        const px = pants.pos[v * 3], py = pants.pos[v * 3 + 1];
        if (Math.abs(px) > 0.3 || py < 0.7) continue;
        const b = Math.round((px + 0.3) / 0.02);
        top[b] = Math.max(top[b], py);
      }
    });
    for (let pass = 0; pass < NB; pass++) for (let b = 0; b < NB; b++) if (top[b] < 0) top[b] = Math.max(b > 0 ? top[b - 1] : -1, b < NB - 1 ? top[b + 1] : -1);
    return (x) => { const f = Math.min(NB - 1.001, Math.max(0, (x + 0.3) / 0.02)); const i = Math.floor(f); return mix(top[i], top[i + 1], f - i); };
  })();
  const pantsTop = pantsTopAt(0);
  console.log(`${TAG} waistband ${pantsTop.toFixed(3)}`);

  // ---- cut field of the trousers (metres, > 0 = fabric gone, the frayed fringe is the band just below 0): the left
  // leg ripped off at the crotch with a long strip down the outside of the thigh, the right leg torn off high with a
  // long strip down the back to the knee; a rip up the right front, holes worn through the seat and the left hip
  const thighLen = B.thigh_l.head.distanceTo(B.thigh_l.tail);
  const angD = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  // per leg: the torn edge (in thigh lengths below the hip joint; 1 = knee, 2 = ankle) as a function of the angle round
  // the leg (0 = front, +-pi = back, -pi/2 = outside of the left leg, +pi/2 outside of the right leg) + hanging strips
  // (angle, half width rad, end). The left leg is gone at the crotch except two strips; the right leg is torn up the
  // front to high on the thigh but hangs on at the back to just above the knee, with a long tatter down the calf.
  const legs = [
    { c: legL, edge: (a) => 0.1 + 0.035 * Math.cos(a * 2 + 1), strips: [{ ang: -1.75, w: 0.34, end: 0.98 }, { ang: 0.6, w: 0.2, end: 0.6 }] },
    { c: legR, edge: (a) => mix(0.3, 0.88, ss(0.9, 2.6, Math.abs(a))) + 0.05 * Math.sin(a * 3), strips: [{ ang: 2.15, w: 0.26, end: 1.5 }, { ang: 1.25, w: 0.17, end: 1.1 }] },
  ];
  const pantsCut = (P) => {
    const rag = N.fbm(P[0] * 14 + 7, P[1] * 14, P[2] * 14, 3) * 0.016 + N.noise(P[0] * 80, P[1] * 80, P[2] * 80) * 0.003;
    let f = -1;
    for (const L of legs) {
      const q = L.c(P);
      if (q.r > 0.17 || q.s < 0) continue;
      const r = Math.max(0.03, q.r);
      // fabric = above the torn edge, or inside a strip (it narrows towards its ragged end): f = min over the pieces
      let fl = (q.s - L.edge(q.ang)) * thighLen;
      for (const s of L.strips) {
        const t = clamp01((q.s - L.edge(s.ang)) / (s.end - L.edge(s.ang)));
        const w = s.w * mix(1, 0.45, t) + N.fbm(q.s * 7, s.ang * 3, 1.7, 2) * 0.06;
        const da = Math.abs(angD(q.ang, s.ang));
        fl = Math.min(fl, Math.max((q.s - s.end) * thighLen, (da - w) * r));
      }
      f = Math.max(f, fl);
    }
    // a slit up the right front from the torn edge towards the pocket
    {
      const q = legR(P);
      if (q.r < 0.15 && q.s > 0.04 && q.s < 0.4) f = Math.max(f, Math.min(0.006 - Math.abs(angD(q.ang, 0.3)) * Math.max(0.03, q.r), (q.s - 0.08) * thighLen));
    }
    // worn-through holes: the left buttock, the left hip, the right back pocket, two on the back of the right thigh
    f = Math.max(f, (1 - Math.hypot((P[0] - 0.075) / 0.05, (P[1] - (yPelvis - 0.07)) / 0.045) - (P[2] > torso.cz(0.9) ? 9 : 0)) * 0.05);
    f = Math.max(f, (1 - dist(P, [0.135, yPelvis + 0.02, 0.0]) / 0.025) * 0.05);
    f = Math.max(f, (1 - dist(P, [-0.08, yPelvis - 0.02, -0.11]) / 0.02) * 0.05);
    for (const [s, ang, rr] of [[0.5, 2.9, 0.022], [0.68, -2.7, 0.016]]) {
      const q = legR(P);
      if (q.r < 0.15) f = Math.max(f, (1 - Math.hypot((q.s - s) * thighLen, angD(q.ang, ang) * Math.max(0.03, q.r)) / rr) * 0.04);
    }
    // general shredding
    const n = N.fbm(P[0] * 9 + 3, P[1] * 9, P[2] * 9, 3) * 0.5 + 0.5;
    f = Math.max(f, (n - 0.76) * 0.3);
    return f + rag;
  };

  // ---- trousers paint: recolour, wear, mud, blood; the cuts come after
  const pDiff = await lib.texture(pants.asset.textures.diffuse, 2048);
  const imgJeans = (u) => isJeansUV(u);
  let pantsBase = recolourPants(pDiff, imgJeans);
  let pantsAoSrc = await lib.texture(pants.asset.textures.ao, 1024);
  let pantsNrmSrc = await lib.texture(pants.asset.textures.normal, 1024);
  TR.snap('pants: source', pDiff, pants);
  TR.snap('pants: recoloured', pantsBase, pants);
  let preCut = 0;
  pants.obj.faces.forEach((f, fi) => {
    if (!pants.keep[fi]) return;
    const pts = f.v.map((v) => [pants.pos[v * 3], pants.pos[v * 3 + 1], pants.pos[v * 3 + 2]]);
    const cen = [0, 1, 2].map((k) => pts.reduce((a, p) => a + p[k], 0) / pts.length);
    if ([...pts, cen].every((p) => pantsCut(p) > 0.012)) { pants.keep[fi] = 0; preCut++; }
  });
  const pack = repackUV(pants);
  pantsBase = pack.remap(pantsBase);
  pantsAoSrc = pack.remap(pantsAoSrc, [255, 255, 255, 255]);
  pantsNrmSrc = pack.remap(pantsNrmSrc, [128, 128, 255, 255]);
  console.log(`${TAG} trousers: ${preCut} faces inside cuts deleted, ${pack.boxes.length} islands repacked at x${pack.s.toFixed(2)} texel density`);
  TR.snap('pants: repacked', pantsBase, pants);
  const cloth = lib.paintCloth(pants, {
    seed: 71, human: h, base: pantsBase, normal: pantsNrmSrc,
    ao: (() => {
      const img = lib.cloneImage(pantsAoSrc);
      for (let i = 0; i < img.data.length; i += 4) for (let k = 0; k < 3; k++) img.data[i + k] = Math.round(255 * 0.7 + img.data[i + k] * 0.3);
      return img;
    })(),
    // 1024: the 2 repacked islands sit at x1.87 the source density in a 2048 atlas (35 % coverage), i.e. ~x0.94 at
    // 1024 - the same detail as the source jeans for a third of the PNG
    size: texSize(1024), normalSize: 1024, ormSize: 1024,
    fade: 0.2, grime: 0.3, grimeNoise: 0.5, weave: 0.5, yellow: 0, innerDarken: 0,
    blood: { edges: 0 },
    extra: (P, Nn, c) => {
      const front = ss(-0.3, 0.3, Nn[2]);
      // dragged on the ground: the front of the thighs and the crotch ground with mud and dust, darker low down
      over(c, C.mud.map((x) => x * 1.25), front * ss(-0.25, 0.45, N.fbm(P[0] * 10, P[1] * 10, P[2] * 10, 3)) * 0.5);
      over(c, lin([138, 128, 108]), ss(0.1, 0.55, N.fbm(P[0] * 18 + 3, P[1] * 9, P[2] * 18, 3)) * 0.35);
      over(c, C.grime, ss(0.1, 0.6, N.fbm(P[0] * 9 + 6, P[1] * 9, P[2] * 9, 3)) * 0.3);
      // old blood: drips and smears down the front from the waist, a dried hand wipe on the left hip
      const sp = (1 - ss(0.07, 0.13, N.worley(P[0] * 36, P[1] * 22, P[2] * 36))) * ss(0.0, 0.5, N.fbm(P[0] * 4 + 2, P[1] * 4, P[2] * 4, 2) + 0.1);
      over(c, lin([56, 20, 16]), sp * 0.7 * front);
      over(c, lin([66, 26, 20]), ss(0.36, 0.5, N.fbm(P[0] * 6 - 4, P[1] * 3, P[2] * 6, 4)) * 0.5);
      // urine / sweat tide marks at the crotch, darker seat
      mul(c, [0.86, 0.82, 0.7], (1 - ss(0.02, 0.09, Math.hypot(P[0], P[1] - (yPelvis - 0.08)))) * 0.6);
    },
  });
  TR.snap('pants: paintCloth', cloth.albedo, pants);
  {
    const img = cloth.albedo, W = img.width;
    const tris = pants.tris(), faceOf = pants._faceOf, nrm = pants.normals();
    const r = rasterUV(tris, pants.obj.uvs, W, 6);
    const P = [0, 0, 0], Nn = [0, 0, 0], c = [0, 0, 0];
    let cutTexels = 0;
    const fw = 0.012;
    for (let i = 0; i < W * W; i++) {
      const t = r.tri[i];
      if (t < 0) continue;
      texelSurface(r, tris, pants.pos, nrm, i, P, Nn);
      const f = pantsCut(P);
      if (f < -0.05) continue;
      const x = i % W, y = (i / W) | 0;
      // denim / twill frays into a fringe of pale threads along the weave
      let cut = f > 0;
      if (!cut && f > -fw) {
        const k = -f / fw;
        const tp = Math.max(3, 5 * W / 2048), tu = Math.abs(N.noise(x / tp, y * 6 / W, 1.3)), tv = Math.abs(N.noise(x * 6 / W, y / tp, 2.1));
        cut = Math.min(tu, tv) > 0.06 + 0.9 * k * k * k;
      }
      const di = i * 4;
      if (cut) { img.data[di + 3] = 0; cutTexels++; continue; }
      for (let k = 0; k < 3; k++) c[k] = S2L[img.data[di + k]];
      const e = 1 - ss(0.0, 0.02, -f);
      over(c, C.fray, (1 - ss(0, fw, -f)) * 0.45);
      kmul(c, 1 - e * 0.15);
      over(c, lin([72, 60, 48]), e * 0.3 * ss(-0.2, 0.4, N.fbm(P[0] * 25, P[1] * 25, P[2] * 25, 2)));
      img.data[di] = toByte(c[0]); img.data[di + 1] = toByte(c[1]); img.data[di + 2] = toByte(c[2]);
    }
    const r0 = rasterUV(tris, pants.obj.uvs, W, 0);
    const opaque = new Uint8Array(pants.obj.faces.length);
    for (let i = 0; i < W * W; i++) { const t = r0.tri[i]; if (t >= 0 && img.data[i * 4 + 3] >= 128) opaque[faceOf[t]] = 1; }
    let removed = 0;
    pants.obj.faces.forEach((f, fi) => {
      if (!pants.keep[fi] || opaque[fi]) return;
      const pts = f.v.map((v) => [pants.pos[v * 3], pants.pos[v * 3 + 1], pants.pos[v * 3 + 2]]);
      const cen = [0, 1, 2].map((k) => pts.reduce((a, p) => a + p[k], 0) / pts.length);
      if ([...pts, cen].every((p) => pantsCut(p) > -0.002)) { pants.keep[fi] = 0; removed++; }
    });
    {
      const keepM = new Uint8Array(W * W);
      for (let i = 0; i < W * W; i++) keepM[i] = r0.tri[i] >= 0 && img.data[i * 4 + 3] >= 128 ? 1 : 0;
      const reach = dilate(img, keepM, 10);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        if (!reach[i >> 2]) { d[i] = 110; d[i + 1] = 104; d[i + 2] = 86; }
        for (let k = 0; k < 3; k++) d[i + k] = Math.min(252, Math.round(d[i + k] / 4) * 4);
        d[i + 3] = d[i + 3] >= 128 ? 255 : 0;
      }
    }
    const acc = [0, 0, 0, 0];
    for (let i = 0; i < W * W; i++) {
      if (r0.tri[i] < 0 || img.data[i * 4 + 3] < 128) continue;
      acc[0] += img.data[i * 4]; acc[1] += img.data[i * 4 + 1]; acc[2] += img.data[i * 4 + 2]; acc[3]++;
    }
    console.log(`${TAG} trousers albedo ${((acc[0] + acc[1] + acc[2]) / 3 / acc[3]).toFixed(1)} (rgb ${acc.slice(0, 3).map((x) => Math.round(x / acc[3])).join('/')}); ${cutTexels} texels cut, ${removed} transparent faces deleted, ${pants.triCount()} tris left`);
  }
  TR.snap('pants: + cut rims', cloth.albedo, pants);

  // ---- what the shredded trousers still cover, by ray casting from the skin (runner's method): base vertices under
  // fabric get the covered-skin treatment, proxy faces fully covered are deleted later
  const coverage = (() => {
    const s = { tris: pants.tris(), pos: pants.pos };
    const bvh = occluders([s]);
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
          const p = [hit.point.x, hit.point.y, hit.point.z];
          if (pantsCut(p) <= -0.006) { blocked++; break; }
          travelled += hit.distance + 0.002;
          ray.origin.copy(hit.point).addScaledVector(ray.direction, 0.002);
        }
      }
      return blocked / dirs.length;
    };
  })();
  {
    const nb = h.basePart({ name: 'cover' }).normals();
    const before = h.hidden.size;
    h.hidden.clear();
    for (const v of h.baseObj.groupVerts('body')) {
      const P = [h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]];
      if (P[1] > pantsTop + 0.05 || P[1] < 0.3) continue;
      if (coverage(P, [nb[v * 3], nb[v * 3 + 1], nb[v * 3 + 2]]) >= 0.6) h.hidden.add(v);
    }
    console.log(`${TAG} skin under fabric: ${before} base vertices by delete_verts -> ${h.hidden.size} by ray casting`);
  }

  // ---- mouth cavity + claws (custom skinned geometry, one gore part)
  const cavity = mouthCavity(h, body, A);
  const clawList = clawGeo(h, cavity.g);
  console.log(`${TAG} claws: ${clawList.length}, e.g. ${clawList[2]?.name} root ${clawList[2]?.root.map((v) => v.toFixed(3))}`);

  // ---- skin
  const S = texSize(2048);
  const base = await skinBase(lib, h, S, { N, jawZone });
  TR.snap('skin: composite base', base, body);
  const tips = [];
  for (const s of ['l', 'r']) for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky']) if (B[`${f}_03_${s}`]) tips.push(B[`${f}_03_${s}`].tail.toArray());
  const knuckles = [];
  for (const s of ['l', 'r']) for (const f of ['index', 'middle', 'ring', 'pinky']) if (B[`${f}_01_${s}`]) knuckles.push(B[`${f}_01_${s}`].head.toArray());
  const handC = [B.hand_l.head.toArray(), B.hand_r.head.toArray()];
  const palmN = ['l', 'r'].map((s) => new THREE.Vector3(-1, 0, 0).applyQuaternion(B[`hand_${s}`].world).toArray());
  const toes = toeTips(h);
  const clavs = ['l', 'r'].map((s) => [B[`clavicle_${s}`].head.toArray(), B[`clavicle_${s}`].tail.toArray()]);
  console.log(`${TAG} clavicle_l ${clavs[0].map((p) => p.map((v) => v.toFixed(3)).join(',')).join(' -> ')}  neckY ${neckY.toFixed(3)}  SHL ${SHL.map((v) => v.toFixed(3))}`);
  const [cornerL, cornerR] = cavity.corners;
  const scalpScar = lib.surfacePoint(h, 'head', 0.7, [0.6, 0.6, -0.4]).p;
  const SCAR = (() => {
    const n = norm(sub(scalpScar, skull)), v = [0.3, 0.15, -1];
    const dir = norm(sub(v, scl(n, dot(v, n))));
    return { dir, side: cross(n, dir) };
  })();
  // ear centres (the most lateral head vertices around eye height) and the thin-pinna points round them
  const ears = [1, -1].map((sg) => {
    let best = null;
    for (const v of h.baseObj.groupVerts('body')) {
      const x = h.pos[v * 3] * sg, y = h.pos[v * 3 + 1];
      if (y < eyeY - 0.045 || y > eyeY + 0.02 || dist([h.pos[v * 3], y, h.pos[v * 3 + 2]], skull) > 0.16) continue;
      if (!best || x > best[0] * sg) best = [h.pos[v * 3], y, h.pos[v * 3 + 2]];
    }
    return best ? [best[0] - sg * 0.008, best[1], best[2]] : [sg * 0.07, eyeY - 0.01, skull[2]];
  });
  const earDist = (P) => Math.min(dist(P, ears[0]), dist(P, ears[1]));
  const frame = (ax) => { const u = norm(cross(ax, Math.abs(ax[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])); return [ax, u, cross(ax, u)]; };
  const FV = frame([0, 1, 0]);
  const FA = [frame(norm(sub(B.hand_l.head.toArray(), B.upperarm_l.head.toArray()))), frame(norm(sub(B.hand_r.head.toArray(), B.upperarm_r.head.toArray())))];
  const FL = [frame(norm(sub(B.foot_l.head.toArray(), B.thigh_l.head.toArray()))), frame(norm(sub(B.foot_r.head.toArray(), B.thigh_r.head.toArray())))];
  const vridge = (P, F, seed) => {
    const w = N.fbm(P[0] * 6 + seed, P[1] * 6, P[2] * 6, 2) * 0.035;
    const q = [P[0] + w, P[1] - w, P[2] + w];
    return N.ridged(dot(q, F[0]) * 6 + seed, dot(q, F[1]) * 22, dot(q, F[2]) * 22, 3);
  };
  const veinAt = (P) => {
    const al = armL(P), ar = armR(P), ll = legL(P), lr = legR(P);
    let a = vridge(P, FV, 0);
    const wl = al.r < 0.1 ? ss(0.0, 0.25, al.s) : 0, wr = ar.r < 0.1 ? ss(0.0, 0.25, ar.s) : 0;
    const gl = ll.r < 0.12 && P[1] < yPelvis ? 1 : 0, gr = lr.r < 0.12 && P[1] < yPelvis ? 1 : 0;
    if (wl > 0) a = mix(a, vridge(P, FA[0], 13), wl);
    if (wr > 0) a = mix(a, vridge(P, FA[1], 29), wr);
    if (gl) a = vridge(P, FL[0], 41);
    if (gr) a = vridge(P, FL[1], 53);
    return a;
  };
  /** Vein density: temples, neck, upper chest, inner arms, backs of the hands, inner thighs; little on the face. */
  const veinRegion = (P) => {
    let d = 0.18;
    d += 1.1 * (1 - ss(0.0, 0.08, Math.abs(P[1] - (neckY + 0.03)))) * (Math.hypot(P[0], P[2] - B.neck_01.head.z) < 0.1 ? 1 : 0);
    d += 1.0 * (1 - ss(0.025, 0.07, Math.min(dist(P, [0.066, eyeY + 0.025, eyeZ - 0.03]), dist(P, [-0.066, eyeY + 0.025, eyeZ - 0.03]))));
    d += 0.5 * (1 - ss(0.0, 0.1, Math.abs(P[1] - (yChest + 0.12))));
    const al = armL(P), ar = armR(P);
    d += 0.7 * Math.max(al.r < 0.08 ? ss(0.5, 1.3, al.s) : 0, ar.r < 0.08 ? ss(0.5, 1.3, ar.s) : 0);
    d += 0.9 * (1 - ss(0.04, 0.12, Math.min(dist(P, handC[0]), dist(P, handC[1]))));
    d += 0.45 * (1 - ss(0.0, 0.25, Math.abs(P[1] - 0.5))) * (P[1] < 0.8 ? 1 : 0);
    // the bald scalp: a few big veins over the crown
    if (dist(P, skull) < 0.17 && P[1] > eyeY + 0.04) d += 0.45;
    if (P[1] > eyeY - 0.08 && P[1] < eyeY + 0.03 && P[2] > eyeZ - 0.02 && Math.abs(P[0]) < 0.045) d *= 0.4;
    d *= 1 - 0.9 * jawZone(P);
    return Math.min(1.5, d) * ss(-0.5, 0.15, N.fbm(P[0] * 3 + 9, P[1] * 3, P[2] * 3, 2) + 0.15);
  };
  const front3 = (P) => P[2] > torso.cz(Math.max(0.85, Math.min(1.6, P[1])));
  // hand (palm, back, fingers): past the wrist along the forearm direction, within reach of the fingertips
  const foreDir = ['l', 'r'].map((s) => norm(sub(B['hand_' + s].head.toArray(), B['lowerarm_' + s].head.toArray())));
  const onHand = (P) => Math.max(...[0, 1].map((k) => (dist(P, handC[k]) < 0.32 ? ss(-0.075, 0.03, dot(sub(P, handC[k]), foreDir[k])) : 0)));
  // joint creases for the decay pigment: inside of the elbows, backs of the knees, armpits, the sides of the neck
  const joints = [
    add(elbowL, [0, 0, 0.03]), add(elbowR, [0, 0, 0.03]), add(kneeL, [0, 0, -0.035]), add(kneeR, [0, 0, -0.035]),
    add(SHL, [-0.03, -0.06, 0]), add(SHR, [0.03, -0.06, 0]), [0.04, neckY + 0.02, B.neck_01.head.z], [-0.04, neckY + 0.02, B.neck_01.head.z],
  ];

  const skin = lib.paintSkin(h, {
    seed: 37, base, size: 2048, normalSize: 1024, ormSize: 1024,
    pallor: 0, mottle: 0.45, veins: 0, bruises: 0.25, socket: 0.3, lips: 0, grime: 0.25,
    coveredDarken: 0.7, coveredShade: 0.15, normalStrength: 2.8, roughness: 0.55,
    blood: {},
    extra: (P, Nn, c, st) => {
      // QA: CRAWLER_DBG=1 paints 2 cm world-space stripes instead (texture registration check on the proxy)
      if (process.env.CRAWLER_DBG) { const sy = Math.floor(P[1] / 0.02) % 2, sx = Math.floor((P[0] + 1) / 0.03) % 2; c[0] = sy ? 0.8 : 0.05; c[1] = sx ? 0.6 : 0.1; c[2] = 0.2; st.h = 0; st.bl = 0; return; }
      let blF = 0, blD = 0;
      // ---- bony relief: rib cage, costal arch, sunken belly, hip bones, collarbones, sternum, spine, scapulae; the
      // two torn-open rib wounds
      if (P[1] > pantsTop - 0.1 && P[1] < neckY + 0.03 && Math.abs(P[0]) < 0.25) relief(P, Nn, c, st);
      // ---- veins: blue-grey under thin, translucent skin, a pale halo, a finer capillary web
      {
        const dens = veinRegion(P);
        if (dens > 0.02) {
          const a = veinAt(P), b = N.ridged(P[0] * 60 + 7, P[1] * 45, P[2] * 60, 2);
          const main = ss(0.42, 0.7, a) * dens, fine = ss(0.7, 0.9, b) * dens * 0.45;
          mul(c, [0.9, 0.92, 1.02], ss(0.2, 0.45, a) * (1 - ss(0.42, 0.7, a)) * dens * 0.6);
          over(c, mix3(C.vein, C.veinDeep, ss(0.6, 0.9, a)), Math.min(1, main * 0.75 + fine * 0.4));
          st.h += main * 0.8 + fine * 0.2;
        }
      }
      // ---- decay: grey-green and sallow blotches, violet-grey pigment pooled round the joints and in the folds
      {
        const m1 = N.fbm(P[0] * 7 + 2, P[1] * 7, P[2] * 7, 3), m2 = N.fbm(P[0] * 13 - 5, P[1] * 13, P[2] * 13, 3);
        mul(c, [0.9, 0.97, 0.86], ss(0.15, 0.55, m1) * 0.5);
        mul(c, [0.98, 0.9, 0.78], ss(0.25, 0.6, -m1) * 0.35);
        mul(c, [0.86, 0.82, 0.92], ss(0.3, 0.65, m2) * 0.35);
        let dj = 1;
        for (const j of joints) dj = Math.min(dj, dist(P, j));
        mul(c, [0.82, 0.76, 0.88], (1 - ss(0.02, 0.075, dj)) * 0.45);
      }
      if (P[1] > neckY - 0.03) head(P, Nn, c, st);
      // ---- blood and drool from the gape: chin, throat, down the chest
      {
        const dx = P[0] - A.mouth[0], dy = A.mouth[1] - P[1], dz = P[2] - A.mouth[2];
        if (dy > -0.04 && dy < 0.55 && P[2] > B.neck_01.head.z - 0.05 && Math.abs(dx) < 0.14) {
          const smear = (1 - ss(0.016, 0.042, Math.hypot(dx * 0.7, (dy - 0.02) * 1.0, dz * 1.4) + N.fbm(P[0] * 50, P[1] * 50, P[2] * 50, 3) * 0.012)) * (Nn[2] > -0.2 ? 1 : 0)
            * ss(-0.35, 0.1, N.fbm(P[0] * 70 + 2, P[1] * 70, P[2] * 70, 2));
          // runs: thin streaks off the chin down the throat onto the chest (fresh near the chin, dried further down)
          const lenK = 0.3 + 0.25 * (N.noise(dx * 60, 1.3, 0.2) * 0.5 + 0.5);
          const runs = ss(0.45, 0.66, N.noise(dx * 110, P[1] * 3, 3.7)) * (1 - ss(0.03, 0.065, Math.abs(dx + 0.004))) * ss(0.03, 0.06, dy) * (1 - ss(lenK * 0.7, lenK, dy));
          blF = Math.max(blF, smear * 0.9, runs * 0.85 * (1 - ss(0.12, 0.25, dy)));
          blD = Math.max(blD, runs * 0.8 * ss(0.1, 0.22, dy));
          // the feeding bib: old blood soaked down the throat onto the upper chest (it eats off the floor). A soaked,
          // darker core under the chin with a wide feathered edge (hard-edged blotches read as a cow print), and gravity
          // runs pouring off it, each a narrow streak of its own length ending in a drip bead
          {
            const front = P[2] > B.neck_01.head.z - 0.02 ? 1 : 0;
            const wob = N.fbm(dy * 5, 7.3, 1.1, 2) * 0.012;
            const w = mix(0.034, 0.068, ss(0.03, 0.16, dy));
            const qc = Math.hypot((dx + 0.004 + wob) / w, (dy - 0.075) / 0.085) + N.fbm(P[0] * 18, P[1] * 18, P[2] * 18, 3) * 0.22;
            const soak = (1 - ss(0.3, 1.25, qc)) * ss(0.012, 0.05, dy) * front;
            const dens = 0.8 + 0.2 * N.fbm(P[0] * 45 + 5, P[1] * 45, P[2] * 45, 2);
            let run = 0;
            for (const R of BIB_RUNS) {
              const t = (dy - R.y0) / R.len;
              if (t < 0 || t > 1.15) continue;
              const xw = dx - R.x - N.noise(dy * 18, R.x * 50, 4.4) * 0.005 - R.lean * (dy - R.y0);
              const wid = R.w * mix(1, 0.6, t);
              const dry = R.gap > 0.5 ? ss(0.04, 0.0, Math.abs(t - R.gap * 0.9)) * 0.7 : 0;
              const streak = (1 - ss(wid * 0.45, wid, Math.abs(xw))) * (1 - ss(0.94, 1.0, t)) * ss(0.0, 0.06, t) * (1 - dry);
              const bead = 1 - ss(R.w * 0.7, R.w * 1.25, Math.hypot(xw, (t - 1.0) * R.len * 0.8));
              run = Math.max(run, streak * mix(0.85, 0.62, t), bead * 0.9);
            }
            blD = Math.max(blD, soak * dens, run * front * 0.85);
            blF = Math.max(blF, soak * (1 - ss(0.03, 0.1, dy)) * 0.7);
          }
          // drool: a wet, darker trail down the chin and the front of the neck
          const drool = (1 - ss(0.008, 0.02, Math.abs(dx - 0.006 + Math.sin(dy * 30) * 0.004))) * ss(0.02, 0.04, dy) * (1 - ss(0.1, 0.16, dy));
          mul(c, [0.86, 0.82, 0.8], drool * 0.5);
          st.ro = mix(st.ro, 0.25, drool);
        }
      }
      // ---- hands: black callused palms and fingertips, raw nail beds round the claws, abraded knuckles, old blood
      {
        let dt = 1;
        for (const t of tips) dt = Math.min(dt, dist(P, t));
        const dh = Math.min(dist(P, handC[0]), dist(P, handC[1]));
        if (dh < 0.32) {
          const side = dist(P, handC[0]) < dist(P, handC[1]) ? 0 : 1;
          const palm = ss(0.05, 0.45, dot(Nn, palmN[side]));
          const n = N.fbm(P[0] * 30 + 5, P[1] * 30, P[2] * 30, 4);
          const reach = 1 - ss(0.05, 0.2, dh);
          over(c, C.soot, palm * reach * (0.65 + 0.25 * n));
          over(c, C.callus, palm * reach * ss(0.2, 0.6, N.noise(P[0] * 200, P[1] * 200, P[2] * 200)) * 0.4);
          st.ro = mix(st.ro, 0.8, palm * reach);
          over(c, C.soot, (1 - ss(0.01, 0.035, dt)) * 0.7);
          mul(c, C.livid.map((x) => x * 1.25), (1 - ss(0.02, 0.07, dt)) * 0.5);
          // the nail beds the claws tear out of: raw, bloody
          const nb = 1 - ss(0.003, 0.009, dt);
          over(c, C.meat, nb * 0.85);
          blD = Math.max(blD, (1 - ss(0.008, 0.02, dt)) * 0.6);
          let dk = 1;
          for (const k of knuckles) dk = Math.min(dk, dist(P, k));
          const kn = (1 - ss(0.004, 0.014, dk)) * (1 - palm);
          over(c, C.waxy.map((x) => x * 0.8), kn * 0.3);
          over(c, C.rash, kn * ss(0.1, 0.5, N.noise(P[0] * 300, P[1] * 300, P[2] * 300)) * 0.6);
          blD = Math.max(blD, (1 - ss(0.06, 0.18, dh)) * ss(0.25, 0.6, N.fbm(P[0] * 14, P[1] * 14, P[2] * 14, 3)) * 0.6);
        }
      }
      // ---- crawler wear: abraded knees, elbows and forearm backs, scraped chest / belly (long dragged scratches),
      // grazed thigh fronts
      {
        const pads = [
          [[kneeL[0], kneeL[1] + 0.005, kneeL[2] + 0.04], 0.05, 1], [[kneeR[0], kneeR[1] - 0.005, kneeR[2] + 0.04], 0.052, 1],
          [[elbowR[0], elbowR[1], elbowR[2] - 0.03], 0.04, 1], [[elbowL[0], elbowL[1], elbowL[2] - 0.03], 0.038, 0.9],
        ];
        for (const [p, r, k] of pads) {
          const d = dist(P, p);
          if (d > r * 2.4) continue;
          const q = d / r + N.fbm(P[0] * 40, P[1] * 40, P[2] * 40, 3) * 0.6;
          if (q > 1.7) continue;
          const core = (1 - ss(0.5, 1.0, q)) * k;
          const scr = ss(0.25, 0.7, Math.abs(N.noise(P[0] * 420, P[1] * 22, P[2] * 420)));
          over(c, mix3(C.rash, C.rashRaw, scr), core * ss(-0.35, 0.25, N.fbm(P[0] * 55 + 9, P[1] * 55, P[2] * 55, 2)) * 0.8);
          over(c, C.crust, core * ss(0.15, 0.55, N.fbm(P[0] * 70, P[1] * 70, P[2] * 70, 3)) * 0.8);
          over(c, C.callus, core * ss(0.3, 0.7, N.fbm(P[0] * 120 + 3, P[1] * 120, P[2] * 120, 2)) * 0.55);
          mul(c, [0.82, 0.66, 0.72], (1 - ss(1.0, 1.7, q)) * 0.45 * k);
          st.h += core * (scr * 0.35 - 0.3);
          st.ro = mix(st.ro, 0.65, core);
        }
        // forearm backs (the crawl drags on them): grime and grazes along the ulna
        for (const [arm, sg] of [[armL, 1], [armR, -1]]) {
          const q = arm(P);
          if (q.r > 0.07 || q.s < 1.05 || q.s > 1.85) continue;
          const back = ss(0.2, 0.9, -Math.cos(q.ang - sg * 0.6));
          over(c, C.mud, back * ss(-0.3, 0.4, N.fbm(P[0] * 25, P[1] * 25, P[2] * 25, 3)) * 0.55);
          const graze = back * ss(0.55, 0.75, Math.abs(N.noise(q.s * 80, q.ang * 3, 4.4))) * ss(-0.2, 0.3, N.fbm(P[0] * 30, P[1] * 30, P[2] * 30, 2));
          over(c, C.rashRaw, graze * 0.6);
          st.h -= graze * 0.2;
        }
        // chest and belly scraped raw along the body (vertical in the rest pose: the crawl drags them forward)
        if (front3(P) && P[1] > pantsTop - 0.02 && P[1] < yChest + 0.08) {
          const zone = ss(0.2, 0.6, N.fbm(P[0] * 5 + 1, P[1] * 3, P[2] * 5, 2) + 0.25) * (1 - ss(0.07, 0.13, Math.abs(P[0])));
          const scr = ss(0.6, 0.85, Math.abs(N.noise(P[0] * 260, P[1] * 9, P[2] * 30))) * zone;
          over(c, C.rashRaw, scr * 0.75);
          over(c, C.crust, scr * ss(0.3, 0.7, N.noise(P[0] * 90, P[1] * 90, P[2] * 90)) * 0.6);
          over(c, C.mud, zone * 0.25 * ss(-0.2, 0.4, N.fbm(P[0] * 20, P[1] * 20, P[2] * 20, 2)));
          st.h -= scr * 0.35;
        }
        // thigh fronts / shins: grazed and dirty
        for (const lg of [legL, legR]) {
          const q = lg(P);
          if (q.r > 0.11 || q.s < 0.25 || q.s > 1.9) continue;
          const fr = ss(0.0, 0.7, Math.cos(q.ang));
          over(c, C.mud, fr * ss(-0.2, 0.5, N.fbm(P[0] * 16, P[1] * 16, P[2] * 16, 3)) * 0.45);
          const gz = fr * ss(0.62, 0.8, Math.abs(N.noise(P[0] * 200, P[1] * 12, P[2] * 200))) * ss(0.0, 0.4, N.fbm(P[0] * 9, P[1] * 9, P[2] * 9, 2) + 0.15);
          over(c, C.rash, gz * 0.55);
        }
        // the bare legs get as much skin breakup as the trunk: dead, blotchy skin, bruises (violet core, yellow-green
        // rim), knobby kneecaps and shin bones catching light, a stipple of pores / gooseflesh
        for (const [lg, sd, kn] of [[legL, 0, kneeL], [legR, 1, kneeR]]) {
          const q = lg(P);
          if (q.r > 0.12 || q.s < 0.15 || q.s > 1.95 || P[1] > yPelvis) continue;
          const m = N.fbm(P[0] * 22 + 3 + sd * 5, P[1] * 22, P[2] * 22, 3);
          mul(c, [0.9, 0.88, 0.94], ss(0.1, 0.6, m) * 0.35);
          mul(c, [0.97, 0.95, 0.86], ss(0.15, 0.6, -m) * 0.3);
          const b = N.fbm(P[0] * 6 + 41 + sd * 9, P[1] * 6, P[2] * 6, 3);
          const core = ss(0.42, 0.62, b), rim = ss(0.26, 0.42, b) * (1 - core);
          mul(c, [1.0, 1.03, 0.8], rim * 0.35);
          over(c, C.bruise, core * 0.42);
          const fr = ss(0.2, 0.9, Math.cos(q.ang));
          const cap = 1 - ss(0.012, 0.035, Math.hypot(P[0] - kn[0], (P[1] - kn[1]) * 0.8, Math.max(0, kn[2] - P[2]) * 2));
          const shin = fr * ss(1.15, 1.3, q.s) * (1 - ss(1.75, 1.9, q.s)) * (1 - ss(0.2, 0.5, Math.abs(Math.sin(q.ang))));
          st.h += cap * 0.4 + shin * 0.3;
          over(c, C.waxy.map((x) => x * Math.min(1.05, lumOf(c) / 0.26)), (cap + shin) * 0.05);
          st.h += ss(0.35, 0.85, N.noise(P[0] * 900, P[1] * 900, P[2] * 900)) * 0.07;
        }
      }
      // ---- dirt and old blood over the whole body; filth increases towards the ground in the crawl pose (the front)
      over(c, C.grime, ss(0.42, 0.8, N.fbm(P[0] * 5 + 11, P[1] * 2.2, P[2] * 5, 4)) * 0.3);
      over(c, C.mud, (1 - ss(0.1, 0.5, P[1])) * ss(-0.2, 0.5, N.fbm(P[0] * 14, P[1] * 14, P[2] * 14, 3)) * 0.4);
      over(c, C.grime, ss(0.0, 0.6, Nn[2]) * ss(0.2, 0.7, N.fbm(P[0] * 8 + 2, P[1] * 8, P[2] * 8, 3)) * 0.35);
      // old blood: clustered spatter and a few dragged, streaky smears (no round blobs)
      {
        const sp = (1 - ss(0.05, 0.1, N.worley(P[0] * 26 + 3, P[1] * 26, P[2] * 26) + N.noise(P[0] * 150, P[1] * 150, P[2] * 150) * 0.03)) * ss(0.3, 0.6, N.fbm(P[0] * 2.5 + 9, P[1] * 2.5, P[2] * 2.5, 2) + 0.1);
        blD = Math.max(blD, sp * 0.7);
        const smear = ss(0.6, 0.76, N.noise(P[0] * 40, P[1] * 3, P[2] * 40)) * ss(0.38, 0.56, N.fbm(P[0] * 4 - 7, P[1] * 4, P[2] * 4, 3));
        blD = Math.max(blD, smear * 0.55);
      }
      // ---- filth: it lives on all fours - the hands and forearms grimed dark to mid-forearm, the feet and shins to
      // mid-calf, with a ragged, streaky tide line (a strong read of the limbs against the pale trunk)
      {
        const al = armL(P), ar = armR(P), ll = legL(P), lr = legR(P);
        const fa = Math.max(al.r < 0.1 ? ss(1.22, 2.05, al.s) : 0, ar.r < 0.1 ? ss(1.22, 2.05, ar.s) : 0, onHand(P));
        const fl = Math.max(ll.r < 0.12 ? ss(1.4, 1.9, ll.s) : 0, lr.r < 0.12 ? ss(1.4, 1.9, lr.s) : 0, 1 - ss(0.08, 0.14, P[1]));
        const f0 = Math.max(fa, fl * 0.9);
        if (f0 > 0) {
          const n = N.fbm(P[0] * 18 + 4, P[1] * 9, P[2] * 18, 4);
          const k = clamp01(f0 * 1.25 + n * 0.45 - 0.2);
          const streak = ss(0.45, 0.7, N.noise(P[0] * 60, P[1] * 7, P[2] * 60));
          over(c, mix3(C.soot, C.mud, ss(-0.3, 0.4, n)), clamp01(k * 0.72 + streak * k * 0.2));
          st.ro = mix(st.ro, 0.78, k);
          st.h += k * 0.15 * ss(0.2, 0.6, N.noise(P[0] * 200, P[1] * 200, P[2] * 200));
        }
      }
      if (P[1] < 0.2) foot(P, Nn, c, st);
      if (blD > 0) {
        const thick = ss(0.45, 0.95, blD);
        over(c, mix3(C.dried, C.crust, ss(-0.3, 0.4, N.noise(P[0] * 25 + 70, P[1] * 25, P[2] * 25)) * 0.7 + thick * 0.3), ss(0.0, 0.5, blD) * 0.9);
        st.ro = mix(st.ro, 0.6, blD);
        st.h += thick * 0.2;
      }
      if (blF > 0) {
        const deep = ss(-0.3, 0.5, N.fbm(P[0] * 30, P[1] * 30, P[2] * 30, 2));
        over(c, mix3(C.fresh, C.freshDeep, deep), ss(0.0, 0.45, blF) * 0.95);
        st.ro = mix(st.ro, mix(0.52, 0.32, ss(0.6, 0.95, blF) * ss(0.0, 0.5, N.noise(P[0] * 90, P[1] * 90, P[2] * 90))), ss(0.2, 0.7, blF));
        st.h += blF * 0.15;
      }
      st.bl = 0;
    },
  });
  if (skin.albedo.width === base.width) pullPush(skin.albedo, base.mask);
  {
    // normal map: flatten the jaw angle (stretched proxy faces there) and refill the island border band (the height
    // field steps to zero outside the islands and embosses a ridge along every border)
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
    for (let i = 0; i < NS * NS; i++) {
      if (r.tri[i] < 0 || !texelSurface(r, bt, h.pos, bn, i, P, Nn)) continue;
      const w = jawZone(P) * 0.85;
      if (!(w > 0.01)) continue;
      const d = NM.data, o = i * 4;
      d[o] = Math.round(d[o] + (128 - d[o]) * w); d[o + 1] = Math.round(d[o + 1] + (128 - d[o + 1]) * w); d[o + 2] = Math.round(d[o + 2] + (255 - d[o + 2]) * w);
    }
    pullPush(NM, m, { raw: true });
  }
  TR.snap('skin: paintSkin', skin.albedo, body);

  function relief(P, Nn, c, st) {
    const y = P[1];
    const cz = torso.cz(y), dz = torso.dz(y), hw = torso.hw(y);
    const ax = Math.abs(P[0]);
    const a = Math.atan2(ax / hw, (P[2] - cz) / dz); // 0 front .. pi/2 side .. pi back
    const yXi = SHL[1] - 0.2, yLow = SHL[1] - 0.33;
    // the costal margin: an inverted V from the xiphoid (~95 deg infrasternal angle), flattening out along the flanks;
    // on the back the lowest ribs run on round at yLow
    const vline = yXi - 0.004 - ax * 1.05;
    const yMarg = mix((yLow + vline + Math.hypot(yLow - vline, 0.03)) / 2, yLow, ss(1.1, 1.5, a));
    const armpit = SHL[1] - 0.09;
    // rib lines: from the spine they run down and round the flank (D 0 -> 11 cm, back -> side); on the front the costal
    // cartilages climb back up towards the sternum (the lines are highest at the sternal edge, ~9 cm above the flank)
    const D = a > Math.PI / 2 ? 0.11 * (Math.PI - a) / (Math.PI / 2) : 0.11 - 0.09 * ss(1.45, 0.15, a);
    const { ph, g, amp, wv } = ribPhase(y + D, P);
    const pec = a < 1.0 && y > SHL[1] - 0.16 ? 1 - ss(0.65, 1.05, a) : 0;
    let vis = ss(yMarg - 0.005, yMarg + 0.02, y) * (1 - ss(armpit - 0.03, armpit + 0.01, y)) * (1 - pec * 0.7);
    // the flat sternum band (~3 cm): no rib crosses it; the smooth costal cartilages on the front only faintly, the
    // bony ribs on the flanks and back full
    vis *= a > 2.3 ? 0.18 + 0.12 * ss(2.9, 2.4, a) : a < Math.PI / 2 ? ss(0.011, 0.024, ax) * mix(0.3, 1, ss(0.3, 1.1, a)) : 1;
    if (vis > 0) {
      // every rib: a ridge and a groove, uneven widths / depths per rib; carried by the normal map (only a faint
      // pigment in the albedo: the light-and-shadow stripes painted into it read as a washboard)
      const rib = ss(-0.35 + wv, 0.75, g), groove = 1 - ss(-0.95, -0.25 - wv * 0.5, g);
      st.h += (rib * 0.85 - groove * 1.3) * vis * amp;
      mul(c, [0.84, 0.81, 0.88], groove * vis * amp * 0.16);
      over(c, C.waxy.map((x) => x * Math.min(1.1, lumOf(c) / 0.26)), rib * vis * 0.06);
    }
    void ph;
    // ---- exposed ribs. Left flank: the skin torn off over four ribs; right side of the back: two lower ribs
    for (const W of WOUNDS) {
      if (P[0] * W.side <= 0) continue;
      // torn skin flaps hanging in over the edge (the wound outline is not a clean cut-out)
      const q0 = woundQ(P, W);
      const flap = ss(0.55, 0.8, N.noise(P[0] * 48 + W.side * 7, y * 30, P[2] * 48)) * ss(0.5, 0.85, q0);
      const q = q0 + flap * 0.35 + N.noise(P[0] * 260, y * 260, P[2] * 260) * 0.04;
      // the ribs inside the wound follow a calmer phase (the global wobble made them read as worms) with the same
      // uneven pitch as the relief round it; bar widths vary per rib, a few bars are hidden under clots
      const { ph, g, wv } = ribPhase(y + D, P, true);
      if (q < 1) {
        const inner = 1 - ss(0.5, 1.0, q);
        // ribs: narrow bone bars (stained ivory, bloodier towards the torn edge), the dark meat of the intercostal
        // muscles sunk between them, near-black and wet in the deep gaps at the bottom edge of each rib
        const brk = ss(0.6, 0.8, N.noise(Math.floor(ph) * 3.7 + 0.5, P[0] * 22, P[2] * 22));
        const boneK = ss(0.33 + wv * 1.3, 0.78 + wv * 0.5, g) * ss(-0.25, 0.25, N.fbm(P[0] * 60 + 2, y * 60, P[2] * 60, 2) + 0.25 + inner * 0.25) * (1 - brk * 0.85);
        const gap = 1 - ss(-0.95, -0.3 - wv * 0.6, g);
        const meat = mix3(C.meat, C.meatDeep, gap * 0.85 + (1 - inner) * 0.15);
        mul(meat, [0.7, 0.6, 0.6], N.ridged(P[0] * 140, y * 40, P[2] * 140, 2) * 0.5);
        over(c, meat, 0.98);
        over(c, lin([24, 5, 5]), gap * gap * inner * 0.75);
        const bc = mix3(C.bone, C.boneStain, ss(-0.3, 0.5, N.fbm(P[0] * 90, y * 90, P[2] * 90, 2)) * 0.55 + (1 - inner) * 0.4);
        mul(bc, [0.86, 0.8, 0.78], ss(0.55, 0.8, N.noise(P[0] * 400, y * 400, P[2] * 400)));
        // the lower edge of each rib in shadow (a dark line under every bar)
        mul(bc, [0.62, 0.5, 0.48], ss(0.0, -0.5, Math.sin(ph * Math.PI * 2)) * 0.6);
        over(c, bc, boneK * 0.94);
        // membrane / fat strands and clots
        over(c, C.fat, ss(0.74, 0.92, N.noise(P[0] * 160, y * 40, P[2] * 160)) * (1 - boneK) * 0.3);
        over(c, C.crust, ss(0.48, 0.7, N.fbm(P[0] * 80 + 3, y * 80, P[2] * 80, 3) + (1 - inner) * 0.3 + brk * 0.3) * 0.6 * (1 - boneK * 0.7));
        st.h = st.h * 0.1 - 1.6 * W.k + boneK * 1.5 - gap * 1.1;
        // wet: glistening meat and deep gaps, the bone a little drier, the old edge matte
        st.ro = mix(mix(0.3, 0.2, gap), 0.55, 1 - inner) + boneK * 0.1;
        st.bl = 0;
      } else if (q < 1.4) {
        // torn skin lip: rolled, swollen, crusted
        const e = (q - 1) / 0.4, lumpy = ss(-0.4, 0.4, N.fbm(P[0] * 55 + 1, y * 55, P[2] * 55, 2));
        over(c, C.crust, (1 - ss(0.0, 0.3, e)) * 0.9);
        over(c, lin([118, 52, 54]), (1 - ss(0.1, 0.8, e)) * 0.5 * (0.35 + 0.65 * lumpy));
        st.h += (0.55 + 0.6 * lumpy) * (1 - ss(0.0, 1.0, Math.abs(e - 0.22) / 0.78));
        st.ro = mix(st.ro, 0.58, 1 - e);
      }
      if (q < 2.4) mul(c, [0.76, 0.56, 0.62], (1 - ss(1.0, 2.4, q)) * 0.5);
      // runs of dried blood down from it
      if (q > 0.9 && q < 3.5 && y < W.yC) {
        const run = ss(0.6, 0.76, N.noise(P[0] * 130, y * 4, P[2] * 130 + W.side * 3)) * (1 - ss(1.2, 3.5, q));
        over(c, mix3(C.dried, C.crust, 0.5), run * 0.8);
      }
    }
    // the sternum: a flat bony plate ~3 cm wide with soft edges, the sternal angle a low cross-ridge 5 cm under the
    // notch, the xiphoid a small knob at its foot
    if (a < 0.6 && y > yXi - 0.015 && y < neckY - 0.035) {
      const plate = (1 - ss(0.011, 0.02, ax)) * ss(yXi - 0.015, yXi + 0.01, y);
      st.h += plate * 0.32 + (1 - ss(0.002, 0.008, Math.abs(y - (neckY - 0.085)))) * plate * 0.3;
      st.h += (1 - ss(0.004, 0.012, Math.hypot(ax, y - yXi))) * 0.35;
    }
    // the costal margin: a strong inverted-V cartilage rim, the epigastric hollow sunk right under it and the starved
    // belly below
    if (a < 1.5) {
      const dm = y - yMarg;
      const fa = ss(0.05, 0.3, a) * (1 - ss(1.2, 1.5, a));
      const ridge = (1 - ss(0.0, 0.013, Math.abs(dm - 0.003))) * fa;
      st.h += ridge * 1.3;
      over(c, C.waxy.map((x) => x * Math.min(1.08, lumOf(c) / 0.26)), ridge * 0.04);
      if (dm < 0 && y > pantsTop - 0.03) {
        const hollow = ss(-0.004, -0.04, dm) * (1 - ss(0.75, 1.3, a));
        const epi = hollow * (1 - ss(0.0, 0.07, ax)) * (1 - ss(0.0, 0.1, -dm));
        mul(c, [0.9, 0.87, 0.93], hollow * 0.25);
        st.h -= hollow * 0.85 + epi * 0.5;
        const linea = (1 - ss(0.002, 0.008, ax)) * hollow;
        st.h -= linea * 0.4;
        kmul(c, 1 - linea * 0.08);
      }
    }
    // hip bones jutting above the waistband
    for (const sx of [1, -1]) {
      const hy = pantsTopAt(sx * 0.1) + 0.03;
      const hp = [sx * (torso.hw(hy) * 0.82), hy, 0];
      if (P[0] * sx < 0 || !front3(P)) continue;
      const d = Math.hypot((P[0] - hp[0]) * 1.4, P[1] - hp[1]);
      const k = 1 - ss(0.006, 0.03, d);
      st.h += k * 0.7;
      over(c, C.waxy.map((x) => x * Math.min(1.1, lumOf(c) / 0.26)), k * 0.12);
    }
    // collarbones, the hollow above them, the jugular notch
    if (P[2] > cz && y > neckY - 0.12) {
      for (const [h0, t0] of clavs) {
        const sgn = Math.sign(t0[0]);
        if (P[0] * sgn < 0) continue;
        // sternal end beside the jugular notch -> acromion, a soft S (rising medially, a slight dip laterally), the
        // relief ending before the deltoid; normal map only (a pale stroke in the albedo is baked light and read as
        // one straight bar across the chest)
        const a0 = [sgn * Math.max(0.02, Math.abs(h0[0])), h0[1]], b0 = [t0[0], t0[1] + 0.012];
        const d = [b0[0] - a0[0], b0[1] - a0[1]], L2 = d[0] * d[0] + d[1] * d[1];
        const t = clamp01(((P[0] - a0[0]) * d[0] + (y - a0[1]) * d[1]) / L2);
        const qx = a0[0] + d[0] * t, qy = a0[1] + d[1] * t + 0.009 * Math.sin(t * Math.PI) - 0.004 * Math.sin(t * Math.PI * 2);
        const dy = y - qy, dd = Math.hypot(P[0] - qx, dy);
        const w = mix(0.014, 0.009, t);
        const ridge = (1 - ss(0.0, w, dd)) ** 1.6 * ss(0.0, 0.14, t) * (1 - ss(0.7, 0.88, t));
        st.h += ridge * 0.65 + (1 - ss(0.004, 0.014, Math.hypot(P[0] - a0[0], y - a0[1] - 0.003))) * 0.3;
        const fossa = dy > 0.008 && dy < 0.045 ? (1 - ss(0.012, 0.04, dy)) * ss(0.15, 0.35, t) * (1 - ss(0.7, 0.9, t)) : 0;
        st.h -= fossa * 0.75;
        kmul(c, 1 - fossa * 0.06);
      }
      const jn = 1 - ss(0.006, 0.02, Math.hypot(P[0], y - (neckY - 0.03)));
      st.h -= jn * 0.6; kmul(c, 1 - jn * 0.08);
    }
    // back: spinous processes (also real geometry) catch light, the gutters either side, the shoulder blades' edges
    if (P[2] < cz - dz * 0.4 && y > pantsTop - 0.04 && y < neckY + 0.02) {
      let bump = 0;
      for (const v of vert) bump = Math.max(bump, Math.exp(-(((y - v.y) / (vSpace * 0.3)) ** 2)));
      const sp = (1 - ss(0.003, 0.011, ax)) * bump;
      const gutter = 1 - ss(0.01, 0.03, Math.abs(ax - 0.026));
      st.h += sp * 0.7 - gutter * 0.25;
      over(c, C.waxy.map((x) => x * Math.min(1.12, lumOf(c) / 0.26)), sp * 0.14);
      // scuffed, grey-bruised knobs (rubbed raw against walls / pipes)
      over(c, C.rash, sp * ss(0.4, 0.8, N.fbm(P[0] * 60, y * 60, P[2] * 60, 2)) * 0.22);
      kmul(c, 1 - gutter * 0.06);
      for (const Sh of [SHL, SHR]) {
        const sgn = Math.sign(Sh[0]);
        if (P[0] * sgn < 0) continue;
        const bx = bladeBorder(y, Sh);
        const vy = ss(Sh[1] - 0.245, Sh[1] - 0.2, y) * (1 - ss(Sh[1] - 0.05, Sh[1] - 0.01, y));
        const med = (1 - ss(0.003, 0.012, Math.abs(ax - bx - 0.004))) * vy;
        // the spine of the scapula: a soft, slightly bowed ridge fading out at both ends, in the normal map only (a
        // pale stroke in the albedo read as a straight bar across each blade)
        const spineY = Sh[1] - 0.06 + (ax - 0.08) * 0.15 + 0.008 * Math.sin(clamp01((ax - 0.07) / 0.13) * Math.PI);
        const ss2 = (1 - ss(0.003, 0.015, Math.abs(y - spineY))) ** 1.5 * ss(0.07, 0.11, ax) * (1 - ss(0.15, 0.2, ax));
        st.h += med * 0.8 + ss2 * 0.55;
        over(c, C.waxy.map((x) => x * Math.min(1.1, lumOf(c) / 0.26)), med * 0.06 + ss2 * 0.03);
        // violet-grey pigment in the hollow between the blade and the spine (where it lifts off the ribs)
        const sh = ss(0.022, 0.034, ax) * (1 - ss(bx - 0.02, bx - 0.004, ax)) * vy;
        mul(c, [0.84, 0.8, 0.9], sh * 0.4);
        st.h -= sh * 0.5;
      }
      // three old claw rakes across the left shoulder blade (another one's): dark scabbed lines, pale scar halo
      if (P[0] > 0) {
        const o = [0.085, SHL[1] - 0.13], dd = norm([0.55, -0.83]), nn = [-dd[1], dd[0]];
        for (let k = -1; k <= 1; k++) {
          const dx = P[0] - (o[0] + nn[0] * k * 0.018), dy = y - (o[1] + nn[1] * k * 0.018);
          const al = dx * dd[0] + dy * dd[1], ac = dx * nn[0] + dy * nn[1] + 0.002 * Math.sin(al * 70 + k);
          const half = 0.07 - Math.abs(k) * 0.012;
          if (Math.abs(al) > half) continue;
          const w = 0.0022 * Math.sqrt(1 - (al / half) ** 2) + 0.0004;
          const line = 1 - ss(w * 0.6, w, Math.abs(ac));
          over(c, mix3(C.crust, C.meat, ss(-0.3, 0.3, N.noise(P[0] * 200, y * 200, 1.3))), line * 0.85);
          over(c, C.waxy.map((x) => x * Math.min(1.05, lumOf(c) / 0.25)), (1 - ss(w, w * 3, Math.abs(ac))) * (1 - line) * 0.15);
          st.h -= line * 0.6;
        }
      }
    }
  }

  function head(P, Nn, c, st) {
    const l = dist(P, skull);
    // bald, mangy scalp: a few dark wisps and stubble tufts left at the back and sides, scabs, a healed scar
    if (l < 0.17 && P[1] > eyeY + 0.0 && earDist(P) > 0.022) {
      const az = Math.abs(Math.atan2(P[0], P[2] - skull[2]));
      const hairline = eyeY + mix(0.085, -0.06, ss(0.5, Math.PI, az));
      const zone = ss(-0.01, 0.015, P[1] - hairline) * ss(0.6, 1.4, az);
      const tuft = ss(0.2, 0.55, N.fbm(P[0] * 16 + 5, P[1] * 16, P[2] * 16, 3)) * zone;
      if (tuft > 0) {
        const dots = ss(0.25, 0.75, N.noise(P[0] * 1100, P[1] * 1100, P[2] * 1100) * 0.5 + 0.5);
        over(c, C.scalp.map((x) => x * Math.min(1.1, lumOf(c) / 0.25)), tuft * 0.3);
        over(c, C.wisp, tuft * (0.25 + 0.4 * dots));
        st.h += tuft * dots * 0.1;
        st.ro = mix(st.ro, 0.7, tuft);
      }
      const scab = (1 - ss(0.07, 0.14, N.worley(P[0] * 45, P[1] * 45, P[2] * 45))) * ss(0.4, 0.6, N.fbm(P[0] * 9 + 3, P[1] * 9, P[2] * 9, 2));
      over(c, C.crust, scab * 0.7);
      st.h += scab * 0.3;
      // an old, puckered scar over the crown (in the scalp's tangent plane: irregular width, a broken pale core, a
      // pink-brown pulled-in rim, crosswise suture marks; a uniform pale strip read as tape / a UV seam)
      const ds = dist(P, scalpScar);
      if (ds < 0.075) {
        const t = sub(P, scalpScar);
        const along = dot(t, SCAR.dir);
        const across = dot(t, SCAR.side) + 0.003 * Math.sin(along * 70 + 0.6) + N.noise(along * 120, 2.2, 0.7) * 0.0012;
        const half = 0.045;
        const endF = 1 - ss(half * 0.7, half, Math.abs(along));
        const wv = 0.0024 * (0.55 + 0.9 * (N.noise(along * 55, 3.3, 1.7) * 0.5 + 0.5)) * mix(1, 0.5, ss(0.5, 1, Math.abs(along) / half));
        const brk = ss(0.25, 0.55, N.noise(along * 75, 7.1, 0.3) * 0.5 + 0.5);
        const core = (1 - ss(wv * 0.35, wv, Math.abs(across))) * endF;
        const rim = (1 - ss(wv, wv * 2.8, Math.abs(across))) * (1 - core) * endF;
        over(c, lin([140, 96, 98]), rim * 0.35);
        mul(c, [0.86, 0.8, 0.84], rim * 0.3);
        over(c, mix3(C.waxy.map((x) => x * 0.8), lin([170, 130, 130]), 0.35), core * (0.25 + 0.3 * brk));
        st.h += core * (0.15 + 0.2 * brk) - rim * 0.25 * (0.5 + 0.5 * Math.sin(along * 400));
        st.ro = mix(st.ro, 0.42, core * brk);
        const fr = ((along / 0.009) % 1 + 1) % 1 - 0.5;
        const dash = (1 - ss(0.0006, 0.0013, Math.abs(fr * 0.009 + N.noise(along * 30, 1.1, 5.5) * 0.0008))) * (1 - ss(0.0035, 0.006, Math.abs(across))) * (Math.abs(along) < half * 0.85 ? endF : 0);
        over(c, lin([118, 70, 74]), dash * 0.45);
        st.h -= dash * 0.2;
      }
    }
    // the forehead and the right side of the crown scraped raw (it climbs head-first): grazed, crusted, dirt ground in
    {
      const fp = [-0.02, eyeY + 0.07, eyeZ - 0.005];
      const dd = dist(P, fp);
      if (dd < 0.08 && Nn[2] > -0.2) {
        const q = dd / 0.045 + N.fbm(P[0] * 35, P[1] * 35, P[2] * 35, 3) * 0.55;
        const core = 1 - ss(0.45, 1.0, q);
        if (core > 0) {
          const scr = ss(0.3, 0.75, Math.abs(N.noise(P[0] * 30, P[1] * 380, P[2] * 30)));
          over(c, mix3(C.rash, C.rashRaw, scr), core * ss(-0.3, 0.3, N.fbm(P[0] * 60 + 9, P[1] * 60, P[2] * 60, 2)) * 0.75);
          over(c, C.crust, core * ss(0.2, 0.6, N.fbm(P[0] * 80, P[1] * 80, P[2] * 80, 3)) * 0.7);
          over(c, C.mud, core * ss(0.35, 0.7, N.fbm(P[0] * 110 + 3, P[1] * 110, P[2] * 110, 2)) * 0.5);
          st.h += core * (scr * 0.3 - 0.25);
          st.ro = mix(st.ro, 0.6, core);
        }
        mul(c, [0.86, 0.72, 0.78], (1 - ss(0.9, 1.6, q)) * 0.35);
      }
    }
    if (P[2] < eyeZ - 0.07 || Nn[2] < -0.35) return;
    // sunken, red-rimmed sockets round the wide-open eyes
    for (const e of [A.eyeL, A.eyeR]) {
      const dx = P[0] - e[0], dy = P[1] - e[1];
      const d = Math.hypot(dx, dy * 1.15);
      if (d > 0.065) continue;
      // (violet-grey hollows; only the lid margins are raw red: a broad red band read as make-up)
      const sock = 1 - ss(0.012, 0.036, d);
      over(c, C.socket, sock * 0.5);
      const rim = (1 - ss(0.003, 0.008, Math.abs(d - 0.016))) * (1 - ss(0.02, 0.03, d));
      mul(c, [1.2, 0.72, 0.72], rim * 0.45);
      st.h -= sock * 0.35;
      st.ro = mix(st.ro, 0.38, 1 - ss(0.008, 0.016, d));
    }
    // infection: dark veins branching out from the eyes and the split mouth corners over the cheeks and temples
    for (const [src, r0, r1] of [[A.eyeL, 0.022, 0.065], [A.eyeR, 0.022, 0.06], [cornerL, 0.006, 0.055], [cornerR, 0.006, 0.05]]) {
      const dd = dist(P, src);
      if (dd > r1 || dd < r0 * 0.7) continue;
      const v = sub(P, src);
      const ang = Math.atan2(v[1], v[0] * Math.sign(src[0] || 1)) + N.noise(dd * 60, src[1] * 30, 2.2) * 0.35;
      const fade = ss(r1, mix(r0, r1, 0.3), dd) * ss(r0 * 0.7, r0, dd);
      const vv = ss(0.68, 0.9, N.ridged(ang * 4 + src[0] * 40, dd * 9, 1.7, 3)) * fade;
      over(c, mix3(C.veinDeep, lin([40, 26, 44]), 0.5), vv * 0.7);
      st.h += vv * 0.35;
    }
    // no brows: a bare, bony brow ridge
    for (const e of [A.eyeL, A.eyeR]) {
      const br = Math.hypot((P[0] - e[0] * 1.05) / 0.028, (P[1] - (eyeY + 0.024)) / 0.008);
      const k = 1 - ss(0.4, 1.2, br);
      st.h += k * 0.45;
      over(c, C.waxy.map((x) => x * Math.min(1.1, lumOf(c) / 0.26)), k * 0.12);
    }
    // shrunken nose: dark nostrils, creased bridge
    {
      const nb = Math.hypot(P[0] * 1.3, P[1] - (eyeY + 0.004));
      if (nb < 0.016 && P[2] > eyeZ) {
        const cr = ss(0.7, 0.92, Math.abs(Math.sin((P[1] - eyeY) * 700 + N.noise(P[0] * 200, P[1] * 50, 1) * 1.5))) * (1 - ss(0.005, 0.016, nb));
        kmul(c, 1 - cr * 0.18); st.h -= cr * 0.3;
      }
    }
    // thin, retracted, cracked lips
    {
      const dx = P[0] - A.mouth[0], dy = P[1] - A.mouth[1];
      const hw = Math.max(0.03, (cornerL[0] - cornerR[0]) / 2);
      const dm = Math.hypot(dx / hw * 0.03, dy * 1.2);
      if (dm < 0.05 && P[2] > A.mouth[2] - 0.05) {
        const lip = 1 - ss(0.022, 0.032, dm);
        over(c, C.lip, lip * 0.7);
        const crack = ss(0.75, 0.95, Math.abs(Math.sin(dx * 700 + N.noise(P[0] * 300, P[1] * 300, 2) * 2))) * lip;
        over(c, C.crust, crack * 0.6);
        st.h -= crack * 0.4;
      }
    }
    // the split mouth corners: raw gashes running back from each corner along the cheek towards the ear
    for (const [corner, sg] of [[cornerL, 1], [cornerR, -1]]) {
      const ex = ears[sg > 0 ? 0 : 1];
      const dir = norm([ex[0] - corner[0], (ex[1] - corner[1]) * 0.35 + 0.004, ex[2] - corner[2]]);
      const q = sub(P, corner);
      const along = dot(q, dir);
      if (along < -0.008 || along > 0.05) continue;
      const lat = sub(q, scl(dir, along));
      const off = Math.hypot(...lat) - Math.abs(dot(lat, Nn)) * 0.9;
      const len = 0.046;
      const w = 0.0062 * (1 - ss(0.0, len, along)) + 0.0014;
      const wob = N.noise(along * 160, sg * 3, 1.1) * 0.0012;
      const g = (1 - ss(w * 0.5, w, Math.abs(off + wob))) * (1 - ss(len * 0.8, len, along)) * ss(-0.008, 0.0, along);
      if (g > 0) {
        over(c, mix3(C.meat, C.meatDeep, ss(0.3, 0.9, g)), g * 0.95);
        st.h -= g * 1.3;
        st.ro = mix(st.ro, 0.35, g);
      }
      const rim = (1 - ss(w, w * 2.6, Math.abs(off))) * (1 - g) * (1 - ss(len * 0.9, len * 1.15, along)) * ss(-0.01, 0.0, along);
      over(c, C.crust, rim * 0.6);
      mul(c, [1.15, 0.72, 0.74], rim * 0.45);
      st.h += rim * 0.5;
    }
    // hollow cheeks under the cheekbones; the cheekbones catch light
    for (const e of [A.eyeL, A.eyeR]) {
      const cheek = Math.hypot((P[0] - e[0] * 1.35) / 0.022, (P[1] - (eyeY - 0.055)) / 0.026, (P[2] - (e[2] - 0.03)) / 0.03);
      mul(c, [0.8, 0.76, 0.82], (1 - ss(0.3, 1.3, cheek)) * 0.35);
      const cb = Math.hypot((P[0] - e[0] * 1.45) / 0.02, (P[1] - (eyeY - 0.025)) / 0.01);
      over(c, C.waxy.map((x) => x * Math.min(1.1, lumOf(c) / 0.26)), (1 - ss(0.4, 1.2, cb)) * 0.12);
      st.h += (1 - ss(0.4, 1.2, cb)) * 0.3;
    }
  }
  function foot(P, Nn, c, st) {
    const hgt = P[1] + N.fbm(P[0] * 14, P[1] * 14, P[2] * 14, 3) * 0.025;
    const caked = 1 - ss(0.012, 0.06, hgt);
    const film = 1 - ss(0.03, 0.18, hgt);
    const n = N.fbm(P[0] * 24 + 4, P[1] * 24, P[2] * 24, 4);
    const l = lumOf(c);
    over(c, C.mud.map((x) => x * Math.min(1.1, l / 0.22)), film * (0.25 + 0.2 * ss(-0.2, 0.4, n)));
    over(c, C.mud, caked * (0.55 + 0.25 * n));
    over(c, C.soot, ss(-0.2, -0.6, Nn[1]) * 0.9);
    // toe tops scraped (dragged behind in the crawl)
    over(c, C.rash, ss(0.4, 0.9, Nn[1]) * (1 - ss(0.03, 0.08, P[1])) * ss(0.0, 0.5, N.fbm(P[0] * 40, P[1] * 40, P[2] * 40, 2)) * 0.6);
    st.ro = mix(st.ro, 0.88, Math.max(caked, film * 0.5));
    st.h += caked * n * 0.4;
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
    // long, thick, dark yellow-brown toenails
    const nail = (1 - ss(tt.r * 0.8, tt.r * 1.1, sideD)) * ss(-0.004, 0.002, back) * (1 - ss(tt.r * 1.9, tt.r * 2.4, back)) * ss(0.1, 0.45, Nn[1] + Nn[2] * 0.5);
    if (nail > 0) {
      over(c, lin([96, 84, 58]).map((x) => x * (0.7 + 0.35 * N.noise(P[0] * 400, P[1] * 400, P[2] * 400))), nail * 0.85);
      over(c, lin([24, 18, 14]), nail * (1 - ss(0.0, 0.005, back)) * 0.85);
      st.h += nail * 0.7;
      st.ro = mix(st.ro, 0.45, nail);
    }
  }

  // ---- hide body faces under intact fabric
  let hiddenFaces = 0;
  {
    const bn = body.normals();
    const cov = new Uint8Array(body.nVerts);
    for (let v = 0; v < body.nVerts; v++) {
      const P = [body.pos[v * 3], body.pos[v * 3 + 1], body.pos[v * 3 + 2]];
      if (P[1] > pantsTop + 0.05 || P[1] < 0.3) continue;
      cov[v] = coverage(P, [bn[v * 3], bn[v * 3 + 1], bn[v * 3 + 2]]) >= 0.8 ? 1 : 0;
    }
    body.obj.faces.forEach((f, fi) => { if (body.keep[fi] && f.v.every((v) => cov[v])) { body.keep[fi] = 0; hiddenFaces++; } });
  }
  console.log(`${TAG} ${hiddenFaces} body faces hidden under the trousers, body ${body.triCount()} tris`);

  // ---- ray-traced AO + alpha-aware cloth shadow on the skin, AO on the cloth: ORM occlusion only
  const surf = (part) => ({ tris: part.tris(), pos: part.pos, nrm: part.normals() });
  const baseSkin = surf(h.basePart({ name: 'ao' }));
  const pantsS = surf(pants);
  const RA = texSize(512);
  {
    const bodyBvh = occluders([baseSkin]);
    const clothBvh = occluders([pantsS]);
    const opaque = (hit) => pantsCut([hit.point.x, hit.point.y, hit.point.z]) <= 0;
    const ao = bakeField(baseSkin, h.baseObj.uvs, RA, occTracer(bodyBvh, { rays: 16, maxDist: 0.09 }));
    const sh = bakeField(baseSkin, h.baseObj.uvs, RA, occTracer(clothBvh, { rays: 12, maxDist: 0.06, opaque, seed: 7 }), { blur: 1 });
    applyOcclusion(skin.orm, [ao, sh], RA, (a, s) => mix(1, a, 0.85) * mix(1, s * s, 0.9));
  }
  {
    const bvh = occluders([pantsS, baseSkin]);
    const nP = pantsS.tris.length / 6;
    const idx = bvh.geometry.index;
    const opaque = (hit) => {
      const tri = Math.floor((idx ? idx.getX(hit.faceIndex * 3) : hit.faceIndex * 3) / 3);
      if (tri >= nP) return true;
      return pantsCut([hit.point.x, hit.point.y, hit.point.z]) <= 0;
    };
    const ao = bakeField(pantsS, pants.obj.uvs, RA, occTracer(bvh, { rays: 16, maxDist: 0.12, opaque, seed: 3 }));
    applyOcclusion(cloth.orm, [ao], RA, (a) => mix(1, a, 0.6));
  }
  TR.snap('skin: final (after hide + AO)', skin.albedo, body);
  TR.snap('pants: final (after cuts + AO)', cloth.albedo, pants);
  {
    // the proxy's UVs vs the base layout the skin was painted in: re-register the torso / shoulders / upper arms
    // (QA: CRAWLER_NOREPROJ=1 skips it; with CRAWLER_DBG=1 the stripes show the drift)
    const rr = process.env.CRAWLER_NOREPROJ ? { texels: 0, meanMis: 0 } : reprojectToProxy(h, body, [{ img: skin.albedo }, { img: skin.normal, normal: true }, { img: skin.orm, raw: true }], (P) => ss(0.76, 0.84, P[1]) * (1 - ss(neckY, neckY + 0.06, P[1])) * (1 - ss(0.3, 0.36, Math.abs(P[0]))));
    console.log(`${TAG} skin maps re-registered to the proxy UVs on ${rr.texels} texels (mean drift ${(rr.meanMis * 100).toFixed(1)} cm)`);
  }
  body.material = lib.material('skin', { ...skin });
  pants.material = lib.material('cloth', { ...cloth, alpha: true, doubleSided: true, pngBits: 8 });
  if (process.env.CRAWLER_DUMP) {
    const d = process.env.CRAWLER_DUMP.replace(/\/?$/, '/');
    lib.savePNG(lib.resize(skin.albedo, 1024, 1024), d + 'skin_albedo.png');
    lib.savePNG(lib.resize(skin.normal, 1024, 1024), d + 'skin_normal.png');
    lib.savePNG(lib.resize(cloth.albedo, 1024, 1024), d + 'cloth_albedo.png');
  }

  // ---- eyes: milky, pinpoint pupils, faint cold eyeshine
  const eyeTex = await lib.texture('system', 'eyes/materials/brown_eye.png', 512);
  const me = milkyEyes(eyeTex, N);
  eyes.material = lib.material('eye', { albedo: me.albedo, emissiveMap: me.emissive, emissive: [1, 1, 1], roughness: 0.1 });
  eyes.extras.noSimplify = true;

  // ---- teeth: gums off (stretched across the gape by the jaw rotation), long and sharpened, yellow-brown, two gone
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
    const nT = sharpenTeeth(teeth, jawRad);
    const pulled = pullTeeth(teeth, [[0.013, 'up'], [-0.006, 'low']]);
    console.log(`${TAG} teeth: ${gums} gum faces removed, ${nT} teeth sharpened, ${pulled} faces pulled, ${teeth.triCount()} tris`);
  }
  teeth.material = lib.material('teeth', {
    albedo: lib.grungeTexture(teethTex, { seed: 19, tint: [0.82, 0.68, 0.46], darken: 0.25, dirt: 0.6, blood: 0.6, freq: 12 }),
    orm: createImage(64, 64, [150, 90, 0, 255]),
  });

  // ---- gore part: mouth cavity (lip lining -> black throat), tongue, eye caps, claws
  const goreTex = goreTextures(N);
  const gore = toPart(lib, h, cavity.g, 'gore', 'gore', () => [['head', 1]]);
  const goreMat = lib.material('gore', { albedo: goreTex.albedo, orm: goreTex.orm, doubleSided: true });
  gore.material = goreMat;
  {
    // LOD1: the cavity + tongue + claws (~720 tris) become a dark cone sealing the lip ring (every other vertex) + the
    // eye caps (~50 tris; the claws are invisible at that range). The build exports LOD1 with its own (downscaled)
    // material objects, so the part renders the small version whenever it does not carry the LOD0 material.
    const g = new Geo();
    const ring = cavity.rings[1].filter((_, i) => i % 2 === 0);
    const cc = ring.reduce((a, p) => add(a, scl(p, 1 / ring.length)), [0, 0, 0]);
    const rim = ring.map((p) => g.v(p, [0.1, 0.5], [['head', 1]]));
    const tip = g.v(add(cc, [0, -0.012, -0.04]), [0.36, 0.5], [['head', 1]]);
    for (let k = 0; k < rim.length; k++) g.tri(rim[k], rim[(k + 1) % rim.length], tip);
    for (const cap of cavity.eyeCaps) cavity.addEyeCap(g, cap);
    const small = toPart(lib, h, g, 'gore', 'gore', () => [['head', 1]]);
    const full = gore.toRender.bind(gore), lite = small.toRender.bind(small);
    gore.toRender = function () { return this.material === goreMat ? full() : lite(); };
  }

  // ---- posture (local euler degrees, applied after the mixer in every state). The crawler lives in the crawl /
  // crawl_attack / leap clips: no spine flexion (it drives the face into the floor when prone); the head cocked to one
  // side, the long fingers hooked into claws.
  const poseOffsets = { head: [0, 6, 12], neck_01: [0, 0, 4] };
  for (const s of ['l', 'r']) for (const f of ['index', 'middle', 'ring', 'pinky']) {
    poseOffsets[`${f}_01_${s}`] = [0, 0, 10]; poseOffsets[`${f}_02_${s}`] = [0, 0, 24]; poseOffsets[`${f}_03_${s}`] = [0, 0, 22];
  }

  // ---- hitboxes: thin limbs from the naked base mesh; a smaller chest (prone, the chest capsule must not swallow the
  // face hanging in front of the neck)
  const parts = [body, pants, eyes, teeth, gore];
  const allHb = computeHitboxes(h, [body, pants].map((p) => p.toRender()));
  const bodyHb = computeHitboxes(h, [h.basePart({ name: 'hb' }).toRender()]);
  const hitboxes = { ...allHb.hitboxes }, capsules = { ...allHb.capsules };
  const setHb = (key, bone, r, to) => {
    r = +r.toFixed(3);
    hitboxes[key] = to ? [bone, r, to] : [bone, r];
    const b = B[bone], e = to ? B[to].head : b.tail;
    capsules[key] = { bone, radius: r, length: +b.head.distanceTo(e).toFixed(3), ...(to ? { to } : {}) };
  };
  for (const k of ['upperarm_l', 'upperarm_r']) setHb(k, k, Math.min(0.05, Math.max(0.042, bodyHb.hitboxes[k][1] + 0.004)));
  for (const k of ['lowerarm_l', 'lowerarm_r']) setHb(k, k, Math.min(0.042, Math.max(0.033, bodyHb.hitboxes[k][1])));
  for (const k of ['thigh_l', 'thigh_r']) setHb(k, k, Math.min(0.075, Math.max(0.058, bodyHb.hitboxes[k][1] + 0.006)));
  for (const k of ['calf_l', 'calf_r']) setHb(k, k, Math.min(0.052, Math.max(0.042, bodyHb.hitboxes[k][1])));
  setHb('hand_l', 'hand_l', 0.045, 'middle_01_l');
  setHb('hand_r', 'hand_r', 0.045, 'middle_01_r');
  setHb('head', 'head', 0.1);
  capsules.head.length = +Math.max(0.03, h.height - B.head.head.y - 0.1).toFixed(3);
  setHb('chest', 'spine_03', Math.min(0.12, Math.max(0.105, bodyHb.hitboxes.chest[1] - 0.01)));
  setHb('neck', 'neck_01', Math.min(0.06, allHb.hitboxes.neck[1]));
  // starved waist: the trunk capsule from the naked body (+ the waistband), not the 80th percentile of the shreds
  setHb('spine', 'spine_01', Math.min(0.13, Math.max(0.105, bodyHb.hitboxes.spine[1] + 0.01)));
  console.log(`${TAG} hitboxes ${JSON.stringify(hitboxes)}`);
  TR.report();

  return {
    human: h,
    parts,
    budget: 9000,
    partBudget: { pants: 1900, teeth: 450 },
    extras: {
      archetype: 'crawler', gender: 'male', variant: 'starved, contorted man on all fours: bald, unhinged wide jaw, claws, exposed ribs, shredded khaki trousers',
      // measured in the game on the retargeted clips: the head bone rides 0.57-0.62 m above the ground in crawl
      // (0.58-0.79 in crawl_attack), the top of the skull ~0.78 m. The game sizes everything by `height` (z.center(),
      // bot aim, aim assist, network blood, status marks / nameplates, the culling sphere; fx/zfx.js already scales it
      // by 0.9 for crawlers) and this type lives on all fours, so - like the prone crawler stand-in before it
      // (zombies/standins.js `height`) - `height` is the in-game head-top height; the rest-pose (standing) head-top
      // height is `standingHeight`. (With the standing 1.69 m the bots shot over every crawler.)
      height: 0.78, proneHeight: 0.78, standingHeight: +h.height.toFixed(3),
      hitboxes, capsules, poseOffsets,
    },
    lod1: { budget: 2500, drop: ['teeth'], texScale: 0.5, partBudget: { pants: 650, body: 1580 } },
  };
}

/**
 * Skin albedo composite on the MakeHuman UV layout: the CC0 middle-aged caucasian male skin's luminance detail (pores,
 * wrinkles, lips, nipples, knuckle creases) as a ratio over a pale bluish-grey corpse palette (cool grey <-> sallow
 * drift, violet-grey extremities), plus creases / folds of the morphed base mesh (cavity) and waxy highlights on
 * convex, bony areas.
 */
async function skinBase(lib, h, S, { N, jawZone }) {
  const src = await lib.texture('system', 'skins/middleage_caucasian_male/middleage_lightskinned_male_diffuse.png', S);
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
    const d = mb[i] > 0.05 && Lb[i] > 1e-4 ? Math.min(1.5, Math.max(0.55, lumOf(c) / (Lb[i] / mb[i]))) ** 1.55 : 1;
    if (r.tri[i] >= 0 && texelSurface(r, tris, h.pos, nrm, i, P, Nn)) {
      mask[i] = 1;
      const n1 = N.fbm(P[0] * 3 + 7, P[1] * 3, P[2] * 3, 3), n2 = N.fbm(P[0] * 4 - 3, P[1] * 4 + 5, P[2] * 4, 3);
      for (let k = 0; k < 3; k++) col[k] = C.skin[k];
      over(col, C.skinCool, ss(-0.15, 0.45, n1) * 0.65);
      over(col, C.skinSallow, ss(0.0, 0.5, n2) * 0.45);
      over(col, C.livid, ss(0.1, 0.6, -n2) * 0.3);
      const dh = Math.min(dist(P, hands[0]), dist(P, hands[1]));
      const extr = Math.max(1 - ss(0.06, 0.25, dh), 1 - ss(0.12, 0.5, P[1]));
      over(col, C.livid, extr * 0.5);
      // translucent-looking thin skin over the joints and the face: a faint cool blue-violet
      const face = ss(B.neck_01.head.y - 0.02, B.neck_01.head.y + 0.08, P[1]) * ss(-0.2, 0.4, Nn[2]);
      mul(col, [0.98, 0.97, 1.04], face * 0.6);
      // fine blotching (dead, uneven skin: no clean plaster areas), a little stronger on the face and scalp
      const fb = N.fbm(P[0] * 34 + 1, P[1] * 34, P[2] * 34, 3), fb2 = N.fbm(P[0] * 70 - 4, P[1] * 70, P[2] * 70, 2);
      const fk = 0.5 + 0.5 * ss(B.neck_01.head.y, B.neck_01.head.y + 0.1, P[1]);
      mul(col, [0.88, 0.86, 0.9], ss(0.05, 0.5, fb) * 0.55 * fk);
      mul(col, [0.96, 0.95, 0.88], ss(0.1, 0.5, -fb) * 0.4 * fk);
      mul(col, [0.92, 0.9, 0.92], ss(0.2, 0.6, fb2) * 0.4 * fk);
      // (the stretched jaw-angle faces smear the source's pores / wrinkles into vertical streaks: mostly flat there)
      const dj = mix(d, 1, 0.8 * jawZone(P));
      for (let k = 0; k < 3; k++) c[k] = col[k] * dj;
      const jz = 1 - 0.85 * jawZone(P);
      const cf = ss(0.15, 1.0, texelAttr(r, tris, cav.fine, i)) * jz;
      const cb = ss(0.1, 1.0, texelAttr(r, tris, cav.broad, i)) * jz;
      mul(c, lin([176, 150, 176]), cf * 0.38);
      kmul(c, 1 - cf * 0.1 - cb * 0.05);
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
