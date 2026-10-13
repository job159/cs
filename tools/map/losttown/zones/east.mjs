// 失落之城 LOST TOWN — zone 'east': 東街、東橫街與倉儲 (East Street + East Cross Street + warehouse), x 26..84, z -40..40.
// Recreates the east arm of CSO's "Lost City" (zs_lostcity): an 18 m street canyon running from the central
// intersection to a T, where a north-south cross street is sealed at both ends (police cars at the north, a burnt-out
// city bus at the south) and the end of the view is a four-storey red-brick moving-and-storage warehouse.
//   north side  E_N1 dark-brick flats (LIQUORS, fire escape, 2F spawn window SP_E_WIN)
//               E_N2 pale-green painted-brick LAUNDROMAT 自助洗衣 corner (washers behind the glass, ghost sign)
//   south side  E_S1 red-brick barber flats (barber pole, fire escape SP_E_ROOF), service alley AL_SE (torn fence)
//               E_S2 beige stone office corner (coach-line ticket office)
//   the T       X_E1 NORTHERN MOVING & STORAGE 北方搬家倉儲 (burst drive-in door SP_E_DOCK, loading dock E_DOCK),
//               X_E2 dark-brick machine shop flats, X_E3 red-brick tavern / auto parts
//   street      HERO olive 6x6 army cargo truck (torn canvas, amber beacon L_BEACON_E), burning sedan (L_FIRE_E),
//               police-car barricade + quarantine fence (north), bus barricade (south), pockets with end walls at z ±34
// All geometry, lettering (own stroke font, incl. the CJK glyphs), names and markings are original
// (docs/MAP_LOSTTOWN.md §0). Footprints, props, lamps, spawners, supplies and lights come from layout.mjs.
//
// Seams (same rules as the center / north zones): street y 0, sidewalks y 0.15 (concrete_floor, 0.3 m granite curb),
// East Street carriageway z = ±5.5, centre-line dashes at world x in [9k, 9k + 3], yellow edge lines at z = ±5.1,
// buildings stand at y 0.13. The repaved strip of the center zone (x 15.5..26, north lane) runs on to x 31.
// Zombie gaps are 0.62-0.66 m wide around a nav cell centre: nav cells (0.5 m, agent r 0.3) pass, players
// (capsule r 0.34) do not (the runtime has no player-only clip). Barricades are backed by 3.6 m quarantine fences so
// nothing at the pocket mouths can be climbed over.
import { MATERIALS } from '../../lib/materials.mjs';
import { ensureCCW } from '../../lib/kit/core.mjs';

const PI = Math.PI;
const SW = 0.15;   // sidewalk top
const BY = 0.13;   // building base (2 cm below the sidewalk top: no crack at the wall foot)
const F = (ground, n, upper = 3.4) => [ground, ...Array(n - 1).fill(upper)];

// Zone-local palette additions. Same visual keys as the other zones' entries (ct_/nz_fabric, nz_wood, nz_ink*), so
// the compiler folds them into the same GPU materials and moves the colour into the vertex tint.
const ZONE_MATS = {
  ez_fabric: { set: 'canvas', surf: 'wood', tile: 1.2, color: '#ffffff', lm: 1, side: 'double' },
  ez_wood: { set: 'wood_siding', surf: 'wood', tile: 1.3, color: '#ffffff', lm: 1 },
  ez_ink: { set: null, surf: 'metal', color: '#1f1c19', rough: 0.7, lm: 0, cast: false },
  ez_ink_white: { set: null, surf: 'metal', color: '#e8e3d6', rough: 0.7, lm: 0, cast: false },
  ez_ink_red: { set: null, surf: 'metal', color: '#9c2a21', rough: 0.7, lm: 0, cast: false },
  ez_ink_yellow: { set: null, surf: 'metal', color: '#d9b048', rough: 0.7, lm: 0, cast: false },
  // thin black ironwork (fire escapes, scissor gates, chains): not lightmapped (hundreds of tiny, partly buried
  // boxes would cost thousands of lightmap charts for no visible gain), still casts shadows in the bake
  ez_iron: { set: 'metal_rusty', surf: 'metal', tile: 1.2, color: '#4f4c48', rough: 0.9, lm: 0 },
};
for (const [k, v] of Object.entries(ZONE_MATS)) if (!MATERIALS[k]) MATERIALS[k] = v;

// ---------------------------------------------------------------------------------------------------- small helpers
const circle = (r, seg) => { const out = []; for (let i = 0; i < seg; i++) { const a = (i / seg) * PI * 2; out.push([Math.cos(a) * r, Math.sin(a) * r]); } return out; };
const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const rect2 = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const lerp = (a, b, t) => a + (b - a) * t;
function arcPts(c, r, a0, a1, n = 6) {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]); }
  return out;
}
function wpick(kit, weights) {
  const tot = Object.values(weights).reduce((s, v) => s + v, 0);
  let r = kit.rnd(0, tot);
  for (const [k, w] of Object.entries(weights)) { r -= w; if (r <= 0) return k; }
  return Object.keys(weights)[0];
}
function shadeHex(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}
/** Wall-local frame of a footprint edge a -> b (x along the edge, +z outward for CCW footprints, y = world y). */
const edgeFrame = (a, b) => ({ x: a[0], y: 0, z: a[1], rot: Math.atan2(-(b[1] - a[1]), b[0] - a[0]) });
/** Flat polygon (2D [x, y]) on plane z of the current frame, facing +z. */
function flat(kit, pts, z, mat, fo = {}) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
  const P = a >= 0 ? pts : pts.slice().reverse();
  kit.face(P.map(([x, y]) => [x, y, z]), mat, fo);
}
/** Thin strip from 2D a to b (stroke t) on plane z, facing +z. */
function strip(kit, a, b, t, z, mat, fo = {}) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1e-6;
  const nx = (-dy / l) * (t / 2), ny = (dx / l) * (t / 2);
  kit.face([[a[0] - nx, a[1] - ny, z], [b[0] - nx, b[1] - ny, z], [b[0] + nx, b[1] + ny, z], [a[0] + nx, a[1] + ny, z]], mat, fo);
}

// ---------------------------------------------------------------------------------------------------- lettering
// Our own monoline lettering. Latin / digits: polylines on a 4 x 6 grid (cap height = 6 units). CJK: hand-drawn
// stroke skeletons on a 10 x 10 box (hei-style straight strokes) for the few characters this zone paints. Each stroke
// is one quad a few mm in front of the sign face (extended by half the stroke width so joints close).
const GL = {
  A: [[[0, 0], [2, 6], [4, 0]], [[0.8, 2.3], [3.2, 2.3]]],
  B: [[[0, 0], [0, 6], [2.9, 6], [3.8, 5.2], [3.8, 3.9], [2.9, 3.1], [0, 3.1]], [[2.9, 3.1], [4, 2.2], [4, 0.9], [3.1, 0], [0, 0]]],
  C: [[[4, 4.9], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1.1]]],
  D: [[[0, 0], [0, 6], [2.4, 6], [4, 4.4], [4, 1.6], [2.4, 0], [0, 0]]],
  E: [[[4, 6], [0, 6], [0, 0], [4, 0]], [[0, 3.1], [3, 3.1]]],
  F: [[[4, 6], [0, 6], [0, 0]], [[0, 3.1], [3, 3.1]]],
  G: [[[4, 4.9], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2.8], [2.3, 2.8]]],
  H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3.1], [4, 3.1]]],
  I: [[[2, 0], [2, 6]], [[0.9, 6], [3.1, 6]], [[0.9, 0], [3.1, 0]]],
  J: [[[4, 6], [4, 1], [3, 0], [1, 0], [0, 1.2]]],
  K: [[[0, 0], [0, 6]], [[4, 6], [0, 2.4]], [[1.3, 3.5], [4, 0]]],
  L: [[[0, 6], [0, 0], [4, 0]]],
  M: [[[0, 0], [0, 6], [2, 2.6], [4, 6], [4, 0]]],
  N: [[[0, 0], [0, 6], [4, 0], [4, 6]]],
  O: [[[1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 1], [3, 0], [1, 0]]],
  P: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 3.9], [3, 2.9], [0, 2.9]]],
  Q: [[[1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 1], [3, 0], [1, 0]], [[2.4, 1.6], [4.2, -0.4]]],
  R: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]], [[2.2, 3], [4, 0]]],
  S: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 4], [1, 3.1], [3, 3.1], [4, 2.1], [4, 1], [3, 0], [1, 0], [0, 1]]],
  T: [[[0, 6], [4, 6]], [[2, 6], [2, 0]]],
  U: [[[0, 6], [0, 1], [1, 0], [3, 0], [4, 1], [4, 6]]],
  V: [[[0, 6], [2, 0], [4, 6]]],
  W: [[[0, 6], [0.9, 0], [2, 4], [3.1, 0], [4, 6]]],
  X: [[[0, 0], [4, 6]], [[0, 6], [4, 0]]],
  Y: [[[0, 6], [2, 3], [4, 6]], [[2, 3], [2, 0]]],
  Z: [[[0, 6], [4, 6], [0, 0], [4, 0]]],
  0: [[[1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 1], [3, 0], [1, 0]], [[0.6, 1], [3.4, 5]]],
  1: [[[0.9, 4.8], [2, 6], [2, 0]], [[0.9, 0], [3.1, 0]]],
  2: [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 3.8], [0, 0], [4, 0]]],
  3: [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3.1], [1.4, 3.1]], [[3, 3.1], [4, 2.1], [4, 1], [3, 0], [1, 0], [0, 1]]],
  4: [[[3, 0], [3, 6], [0, 1.8], [4, 1.8]]],
  5: [[[4, 6], [0, 6], [0, 3.4], [3, 3.4], [4, 2.4], [4, 1], [3, 0], [1, 0], [0, 1]]],
  6: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2.1], [3, 3.1], [0, 3.1]]],
  7: [[[0, 6], [4, 6], [1.4, 0]]],
  8: [[[1, 3.1], [0, 4], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3.1], [1, 3.1], [0, 2.1], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2.1], [3, 3.1]]],
  9: [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 4], [1, 2.9], [4, 2.9]]],
  "'": [[[2, 6], [1.6, 4.4]]],
  '!': [[[2, 6], [2, 1.9]], [[2, 0.6], [2, 0]]],
  '.': [[[2, 0], [2, 0.6]]],
  ',': [[[2, 0.6], [1.5, -0.6]]],
  '-': [[[0.8, 3], [3.2, 3]]],
  '·': [[[2, 2.7], [2, 3.4]]],
  ':': [[[2, 4.2], [2, 4.8]], [[2, 0.6], [2, 1.2]]],
  '%': [[[0, 0], [4, 6]], [[0, 6], [1.2, 6], [1.2, 4.8], [0, 4.8], [0, 6]], [[2.8, 1.2], [4, 1.2], [4, 0], [2.8, 0], [2.8, 1.2]]],
  '&': [[[4, 0], [0.9, 4.5], [0.9, 5.4], [1.7, 6], [2.6, 5.4], [2.6, 4.5], [0, 2.1], [0, 0.9], [1, 0], [2.4, 0], [4, 2.2]]],
  '+': [[[2, 1.2], [2, 4.8]], [[0.2, 3], [3.8, 3]]],
  '/': [[[0.4, 0], [3.6, 6]]],
  '#': [[[1.3, 0], [1.7, 6]], [[2.5, 0], [2.9, 6]], [[0.2, 2], [4, 2]], [[0.2, 4], [4, 4]]],
  '$': [[[4, 4.6], [3, 5.4], [1, 5.4], [0, 4.6], [0, 3.8], [1, 3.1], [3, 3.1], [4, 2.3], [4, 1.4], [3, 0.6], [1, 0.6], [0, 1.4]], [[2, 6], [2, 0]]],
  '>': [[[0.5, 5.5], [3.5, 3], [0.5, 0.5]]],
};
const NARROW = new Set(['I', '1', "'", '!', '.', ',', '·', ':']);
const CJK = {
  北: [[[3.4, 9.8], [3.4, 0.2]], [[0.8, 6.2], [3.4, 6.2]], [[0.4, 1.6], [3.4, 3.2]], [[6.6, 9.8], [6.6, 1.4], [7.2, 0.6], [9.4, 0.6], [9.6, 2.0]], [[6.6, 5.4], [9.4, 7.0]]],
  方: [[[5.0, 10], [5.0, 8.4]], [[0.4, 8.2], [9.6, 8.2]], [[3.6, 8.2], [3.5, 5.0], [2.9, 2.6], [0.6, 0.2]], [[3.5, 5.8], [8.6, 5.8], [8.4, 1.4], [7.6, 0.4], [6.0, 0.6]]],
  搬: [[[0.2, 7.0], [2.6, 7.0]], [[1.5, 9.8], [1.5, 0.9], [0.8, 0.4]], [[0.2, 2.8], [2.6, 4.4]], [[4.3, 9.9], [3.8, 8.7]], [[3.3, 8.6], [3.3, 4.0], [3.0, 1.6], [2.8, 0.3]],
    [[3.3, 8.6], [5.8, 8.6], [5.8, 0.9], [5.2, 0.4]], [[4.3, 7.6], [4.6, 6.8]], [[4.3, 4.0], [4.6, 3.2]], [[2.9, 5.4], [6.2, 5.4]],
    [[7.3, 9.4], [7.2, 7.6], [6.6, 6.8]], [[7.3, 9.4], [8.7, 9.4], [8.7, 7.4], [9.8, 7.4]], [[6.6, 5.6], [9.2, 5.6], [8.4, 3.4], [6.6, 0.4]], [[7.3, 4.6], [9.8, 0.4]]],
  家: [[[5.0, 10], [5.0, 9.0]], [[0.6, 7.4], [0.6, 8.8], [9.4, 8.8], [9.4, 7.4]], [[2.2, 7.0], [7.8, 7.0]], [[5.2, 7.0], [5.6, 5.2], [5.6, 1.0], [4.8, 0.3]],
    [[4.8, 6.2], [1.0, 3.8]], [[5.4, 4.6], [1.4, 1.6]], [[5.6, 3.0], [2.4, 0.4]], [[5.8, 5.0], [9.6, 0.6]], [[6.2, 6.4], [8.6, 4.8]]],
  倉: [[[5.0, 10], [0.4, 6.6]], [[5.0, 10], [9.6, 6.6]], [[3.4, 7.8], [6.6, 7.8]], [[2.4, 6.6], [7.6, 6.6], [7.6, 4.8], [2.4, 4.8]], [[2.4, 6.6], [2.4, 3.8], [1.4, 2.2]],
    [[3.4, 3.4], [7.2, 3.4], [7.2, 0.3], [3.4, 0.3], [3.4, 3.4]]],
  儲: [[[1.8, 9.8], [0.2, 6.4]], [[1.1, 7.8], [1.1, 0.2]], [[3.3, 9.9], [3.6, 9.3]], [[2.1, 8.6], [4.7, 8.6]], [[2.5, 7.4], [4.3, 7.4]], [[2.5, 6.2], [4.3, 6.2]],
    [[2.5, 4.8], [4.3, 4.8], [4.3, 0.6], [2.5, 0.6], [2.5, 4.8]], [[5.6, 8.4], [8.4, 8.4]], [[7.0, 9.8], [7.0, 6.6]], [[5.0, 6.6], [9.8, 6.6]], [[9.2, 8.8], [5.6, 4.6]],
    [[6.2, 4.6], [9.2, 4.6], [9.2, 0.3], [6.2, 0.3], [6.2, 4.6]], [[6.2, 2.4], [9.2, 2.4]]],
  自: [[[5.0, 10], [4.4, 8.8]], [[1.8, 8.8], [8.2, 8.8], [8.2, 0.2], [1.8, 0.2], [1.8, 8.8]], [[1.8, 6.0], [8.2, 6.0]], [[1.8, 3.1], [8.2, 3.1]]],
  助: [[[1.2, 9.4], [1.2, 1.2]], [[1.2, 9.4], [3.8, 9.4], [3.8, 1.2]], [[1.2, 6.7], [3.8, 6.7]], [[1.2, 4.0], [3.8, 4.0]], [[0.2, 0.8], [4.6, 1.6]],
    [[5.2, 7.0], [9.4, 7.0], [9.2, 1.0], [8.4, 0.3], [7.2, 0.6]], [[7.4, 9.8], [7.3, 5.2], [6.4, 2.2], [4.8, 0.2]]],
  洗: [[[0.6, 9.4], [1.6, 8.4]], [[0.2, 6.6], [1.2, 5.6]], [[0.2, 0.8], [2.0, 4.2]], [[4.6, 9.4], [3.4, 7.2]], [[6.0, 10], [6.0, 6.2]], [[3.8, 8.2], [8.8, 8.2]],
    [[2.6, 6.2], [9.8, 6.2]], [[4.8, 6.2], [4.6, 3.4], [2.6, 0.3]], [[7.2, 6.2], [7.2, 1.0], [7.8, 0.4], [9.8, 0.4], [9.8, 1.8]]],
  衣: [[[5.0, 10], [5.0, 8.8]], [[0.4, 8.4], [9.6, 8.4]], [[4.6, 8.4], [2.8, 5.2], [0.4, 3.0]], [[3.4, 5.8], [3.4, 0.2], [5.0, 1.6]], [[5.2, 6.6], [9.6, 0.4]], [[8.6, 5.8], [6.2, 3.6]]],
  止: [[[5.2, 9.6], [5.2, 0.6]], [[5.2, 6.0], [8.6, 6.0]], [[2.2, 6.4], [2.2, 0.6]], [[0.4, 0.6], [9.6, 0.6]]],
  步: [[[5.0, 9.9], [5.0, 5.6]], [[5.0, 8.2], [8.0, 8.2]], [[2.4, 8.4], [2.4, 5.6]], [[0.6, 5.6], [9.4, 5.6]], [[5.0, 4.8], [5.0, 2.6]], [[2.8, 4.4], [1.4, 2.8]],
    [[7.0, 4.4], [8.2, 3.2]], [[8.8, 3.0], [5.6, 1.0], [1.0, 0.0]]],
  酒: [[[0.6, 9.4], [1.6, 8.4]], [[0.2, 6.6], [1.2, 5.6]], [[0.2, 0.8], [2.0, 4.2]], [[2.8, 9.0], [9.8, 9.0]], [[3.4, 7.0], [9.2, 7.0], [9.2, 0.2], [3.4, 0.2], [3.4, 7.0]],
    [[5.4, 9.0], [5.4, 4.6], [3.6, 3.8]], [[7.2, 9.0], [7.2, 4.6], [9.2, 4.4]], [[3.4, 2.2], [9.2, 2.2]]],
  理: [[[0.4, 8.6], [3.0, 8.6]], [[0.6, 5.2], [2.8, 5.2]], [[1.7, 8.6], [1.7, 1.8]], [[0.2, 1.0], [3.2, 2.4]], [[4.4, 9.6], [9.4, 9.6], [9.4, 4.6], [4.4, 4.6], [4.4, 9.6]],
    [[4.4, 7.1], [9.4, 7.1]], [[6.9, 9.6], [6.9, 0.4]], [[4.8, 2.6], [9.0, 2.6]], [[3.8, 0.4], [9.8, 0.4]]],
};
export const EAST_GLYPHS = { latin: GL, cjk: CJK };
const isCJK = (ch) => ch.charCodeAt(0) >= 0x2e80;
const advOf = (ch, s, sc) => (ch === ' ' ? 3.2 * s : isCJK(ch) ? 10.6 * sc : NARROW.has(ch) ? 2.4 * s : 4 * s);
/** Width of a text line (m) at cap height h; CJK glyph boxes are 1.12 h tall. */
function textWidth(str, h, track = 1.5) {
  const s = h / 6, sc = (h * 1.12) / 10;
  let w = 0;
  for (const ch of str) w += advOf(ch, s, sc) + track * s;
  return Math.max(0, w - track * s);
}
/**
 * Lettering in the current frame on plane z (default 0.004), baseline-left at (x, y) (align: left | center | right),
 * cap height h, stroke t, mat, tint, shade, serif, italic (shear), track (grid units), maxW (squeeze).
 */
function text(kit, str, o) {
  const h = o.h, track = o.track ?? 1.5, z = o.z ?? 0.004;
  let W = textWidth(str, h, track);
  const sx = o.maxW && W > o.maxW ? o.maxW / W : 1;
  W *= sx;
  const s = h / 6, sc = (h * 1.12) / 10, t = o.t ?? h * 0.15;
  let x = o.x - (o.align === 'center' ? W / 2 : o.align === 'right' ? W : 0);
  const fo = { tint: o.tint, shade: o.shade };
  const sh = o.italic || 0;
  const seg = (ax, ay, bx, by, tt) => {
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-6;
    const ux = (dx / len) * (tt / 2), uy = (dy / len) * (tt / 2), nx = -uy, ny = ux;
    const P = [[ax - ux - nx, ay - uy - ny], [bx + ux - nx, by + uy - ny], [bx + ux + nx, by + uy + ny], [ax - ux + nx, ay - uy + ny]];
    kit.face(P.map(([px, py]) => [px + (py - o.y) * sh, py, z]), o.mat, fo);
  };
  for (const ch of str.toUpperCase()) {
    if (isCJK(ch)) {
      const g = CJK[ch], y0 = o.y - h * 0.06;
      if (g) for (const pl of g) for (let i = 0; i < pl.length - 1; i++) seg(x + pl[i][0] * sc * sx, y0 + pl[i][1] * sc, x + pl[i + 1][0] * sc * sx, y0 + pl[i + 1][1] * sc, t * 0.85);
      x += (advOf(ch, s, sc) + track * s) * sx;
      continue;
    }
    const g = GL[ch];
    const ox = NARROW.has(ch) ? -0.8 : 0;
    if (g) for (const pl of g) {
      for (let i = 0; i < pl.length - 1; i++) seg(x + (pl[i][0] + ox) * s * sx, o.y + pl[i][1] * s, x + (pl[i + 1][0] + ox) * s * sx, o.y + pl[i + 1][1] * s, t);
      const closed = pl.length > 2 && pl[0][0] === pl[pl.length - 1][0] && pl[0][1] === pl[pl.length - 1][1];
      if (o.serif && !closed) for (const [end, nb] of [[pl[0], pl[1]], [pl[pl.length - 1], pl[pl.length - 2]]]) {
        if (Math.abs(end[0] - nb[0]) > 0.35 * Math.abs(end[1] - nb[1])) continue;
        const ex = x + (end[0] + ox) * s * sx, ey = o.y + end[1] * s;
        seg(ex - t * 1.1, ey, ex + t * 1.1, ey, t * 0.8);
      }
    }
    x += (advOf(ch, s, sc) + track * s) * sx;
  }
  return W;
}
/** Letters stacked vertically, centred on x, first cap top at yTop. */
function vtext(kit, str, o) {
  let y = o.yTop;
  for (const ch of str) {
    if (ch !== ' ') text(kit, ch, { ...o, x: o.x, y: y - o.h, align: 'center' });
    y -= o.h * (o.lead ?? 1.32);
  }
}
/** Five-pointed star (painted vehicle marking) centred at (cx, cy) on plane z, radius r; ring = circle outline. */
function star(kit, cx, cy, r, z, mat, tint, ring) {
  const pts = [];
  for (let i = 0; i < 10; i++) { const a = PI / 2 + (i * PI) / 5, rr = i % 2 ? r * 0.4 : r; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
  const c = [cx, cy];
  for (let i = 0; i < 10; i += 2) flat(kit, [c, pts[(i + 9) % 10], pts[i], pts[i + 1]], z, mat, { tint });
  if (ring) { const n = 20; for (let i = 0; i < n; i++) { const a0 = (i / n) * PI * 2, a1 = ((i + 1) / n) * PI * 2; strip(kit, [cx + Math.cos(a0) * r * 1.15, cy + Math.sin(a0) * r * 1.15], [cx + Math.cos(a1) * r * 1.15, cy + Math.sin(a1) * r * 1.15], r * 0.09, z, mat, { tint }); } }
}

// ---------------------------------------------------------------------------------------------------- facade parts
const WIN_STATES = { glass: 0.36, dark: 0.3, broken: 0.24, boarded: 0.1 };
const WIN_POOR = { glass: 0.24, dark: 0.28, broken: 0.3, boarded: 0.18 };
const WIN_HIGH = { glass: 0.42, dark: 0.36, broken: 0.18, boarded: 0.04 };

/** Weathered sign board (wall-local): bevelled panel + optional border strips. Returns the face plane z. */
function board(kit, x0, x1, y, h, o = {}) {
  const d = o.d ?? 0.12, z0 = o.z ?? 0;
  kit.bbox({ x: (x0 + x1) / 2, y, z: z0 + d / 2, w: x1 - x0, h, d, bevel: 0.02, mat: o.mat || 'sign_white', tint: o.tint });
  const zf = z0 + d + 0.002;
  if (o.border) {
    const b = o.border, bw = b.w ?? 0.04, ins = b.inset ?? 0.07;
    flat(kit, rect2(x0 + ins, y + ins, x1 - ins, y + ins + bw), zf, b.mat, { tint: b.tint });
    flat(kit, rect2(x0 + ins, y + h - ins - bw, x1 - ins, y + h - ins), zf, b.mat, { tint: b.tint });
    flat(kit, rect2(x0 + ins, y + ins + bw, x0 + ins + bw, y + h - ins - bw), zf, b.mat, { tint: b.tint });
    flat(kit, rect2(x1 - ins - bw, y + ins + bw, x1 - ins, y + h - ins - bw), zf, b.mat, { tint: b.tint });
  }
  return zf;
}
/** Rain / rust streaks running down a wall plane z (wall-local); up = soot rising from a fire instead. */
function streaks(kit, x0, x1, yTop, n, z, len = [0.8, 2.2], o = {}) {
  for (let i = 0; i < n; i++) {
    const sx = kit.rnd(x0, x1), sw = kit.rnd(0.18, 0.5), l = kit.rnd(len[0], len[1]), u0 = kit.pick([0, 0.5]);
    const uv = o.up ? [[u0, 1], [u0 + 0.5, 1], [u0 + 0.5, 0], [u0, 0]] : [[u0, 0], [u0 + 0.5, 0], [u0 + 0.5, 1], [u0, 1]];
    const y0 = o.up ? yTop : yTop - l, y1 = o.up ? yTop + l : yTop;
    kit.face([[sx, y0, z], [sx + sw, y0, z], [sx + sw, y1, z], [sx, y1, z]], 'decal_streak', { uvs: uv, tint: o.tint });
  }
}
/** Bill poster (wall-local, plane z) with header band + text rows; peel curls a corner off. */
function poster(kit, x, y, w, h, z, o = {}) {
  const tint = o.tint || kit.pick(['#e6dfcc', '#d9c27a', '#c96a4a', '#7fa3b8', '#e2d6b8', '#b8c99a', '#d48a5a', '#9fb0a0']);
  kit.at({ x: x + w / 2, y: y + h / 2, z, rz: o.rz ?? kit.rnd(-0.04, 0.04) }, () => {
    const X0 = -w / 2, X1 = w / 2, Y0 = -h / 2, Y1 = h / 2;
    kit.face([[X0, Y0, 0], [X1, Y0, 0], [X1, Y1, 0], [X0, Y1, 0]], 'sign_white', { tint, shade: kit.rnd(0.78, 1) });
    if (o.head) text(kit, o.head, { x: 0, y: Y0 + h * 0.64, h: Math.min(h * 0.15, (w * 0.8) / Math.max(1, o.head.length * 0.92)), align: 'center', z: 0.002, mat: o.headMat || 'ez_ink', tint: o.headTint, maxW: w * 0.86 });
    else kit.face([[X0 + w * 0.1, Y0 + h * 0.7, 0.002], [X1 - w * 0.1, Y0 + h * 0.7, 0.002], [X1 - w * 0.1, Y0 + h * 0.86, 0.002], [X0 + w * 0.1, Y0 + h * 0.86, 0.002]], kit.pick(['ez_ink_red', 'ez_ink']), {});
    for (let i = 0; i < 3; i++) kit.face([[X0 + w * 0.12, Y0 + h * (0.16 + i * 0.13), 0.002], [X0 + w * (0.58 + kit.rnd(0, 0.28)), Y0 + h * (0.16 + i * 0.13), 0.002], [X0 + w * (0.58 + kit.rnd(0, 0.28)), Y0 + h * (0.21 + i * 0.13), 0.002], [X0 + w * 0.12, Y0 + h * (0.21 + i * 0.13), 0.002]], 'ez_ink', { tint: '#5a5248' });
    if (o.peel) kit.face([[X1 - 0.22, Y1, 0], [X1, Y1 - 0.28, 0], [X1 - 0.05, Y1 - 0.05, 0.1]], 'sign_white', { tint: shadeHex(tint, 0.8) });
  });
}
/** Layered bill posters over x0..x1 / y0..y1 of a wall plane z. */
function posterWall(kit, x0, x1, y0, y1, z, n, heads = ['MISSING', 'LOST', 'CURFEW', 'EVACUATE', null, null]) {
  for (let i = 0; i < n; i++) {
    const w = kit.rnd(0.45, 0.8), h = w * kit.rnd(1.2, 1.5);
    const x = kit.rnd(x0, Math.max(x0, x1 - w)), y = kit.rnd(y0, Math.max(y0, y1 - h));
    poster(kit, x, y, w, h, z + i * 0.0015, { head: kit.pick(heads), peel: kit.chance(0.3) });
  }
}
/** Cornice along a wall (wall-local, top at y): 'metal' pressed-metal with brackets | 'stone' | 'simple'. */
function cornice(kit, L, y, o) {
  const prof = o.kind === 'metal'
    ? [[0, -0.85], [0.07, -0.85], [0.09, -0.72], [0.2, -0.66], [0.28, -0.42], [0.42, -0.32], [0.56, -0.18], [0.6, -0.12], [0.6, 0], [0, 0]]
    : o.kind === 'stone'
      ? [[0, -0.7], [0.06, -0.7], [0.12, -0.55], [0.26, -0.48], [0.3, -0.3], [0.48, -0.22], [0.52, -0.08], [0.52, 0], [0, 0]]
      : [[0, -0.32], [0.08, -0.32], [0.14, -0.18], [0.22, -0.1], [0.22, 0], [0, 0]];
  kit.sweep(prof, [[-0.04, y, 0], [L + 0.04, y, 0]], o.mat, { closed: true, tint: o.tint, caps: true });
  if (o.kind === 'metal') for (let x = 0.4; x < L - 0.2; x += o.bracket ?? 1.15) kit.box({ x, y: y - 0.85 - 0.32, z: 0.11, w: 0.14, h: 0.34, d: 0.22, mat: o.mat, tint: o.tint, faces: { nz: false } });
  if (o.kind === 'stone') for (let x = 0.12; x < L - 0.1; x += 0.3) kit.box({ x, y: y - 0.86, z: 0.07, w: 0.13, h: 0.14, d: 0.1, mat: o.mat, tint: o.tint, faces: { nz: false } });
}
/** Spray-painted search mark (X with a date above) on a door / wall plane (wall-local, centre cx, cy). */
function searchMark(kit, cx, cy, size, mat, date) {
  const t = size * 0.09;
  for (const sg of [-1, 1]) kit.at({ x: cx, y: cy, z: 0.03, rz: sg * PI / 4 }, () => kit.face([[-size * 0.7, -t / 2, 0], [size * 0.7, -t / 2, 0], [size * 0.7, t / 2, 0], [-size * 0.7, t / 2, 0]], mat));
  text(kit, date, { h: size * 0.18, x: cx, y: cy + size * 0.55, z: 0.031, align: 'center', mat, italic: 0.1 });
  text(kit, '2', { h: size * 0.16, x: cx + size * 0.42, y: cy - size * 0.08, z: 0.031, align: 'center', mat });
}
/** Peeling paint: brick patches showing through a painted wall (wall-local area). */
function peel(kit, x0, x1, y0, y1, z, n, tint = '#ad9488') {
  for (let i = 0; i < n; i++) {
    const w = kit.rnd(0.4, 1.4), h = kit.rnd(0.3, 1.1), x = kit.rnd(x0, Math.max(x0, x1 - w)), y = kit.rnd(y0, Math.max(y0, y1 - h));
    flat(kit, [[x, y], [x + w * 0.7, y + h * 0.05], [x + w, y + h * 0.4], [x + w * 0.85, y + h], [x + w * 0.25, y + h * 0.9], [x - w * 0.05, y + h * 0.45]], z, 'brick_red', { tint });
  }
}
/** Striped fabric awning (wall-local, top edge at y on the wall, sloping out to depth) with valance + frame. */
function stripedAwning(kit, o) {
  const { x0, x1, y, depth } = o;
  const drop = o.drop ?? 0.35, val = o.valance ?? 0.25, sw = o.stripe ?? 0.34;
  const n = Math.max(1, Math.round((x1 - x0) / sw)), s = (x1 - x0) / n;
  const torn = new Set(o.torn || []), hang = new Set(o.hang || []);
  const nz = Math.hypot(drop, depth), oy = (-depth / nz) * 0.015, oz = (-drop / nz) * 0.015;
  for (let i = 0; i < n; i++) {
    const a = x0 + i * s, b = a + s, tint = o.colors[i % o.colors.length];
    if (torn.has(i)) {
      kit.face([[a, y - drop * 0.25, depth * 0.25], [b, y - drop * 0.2, depth * 0.2], [b, y, 0.02], [a, y, 0.02]], 'ez_fabric', { tint });
      if (hang.has(i)) kit.face([[a + 0.03, y - drop - 1.0, depth - 0.08], [b - 0.05, y - drop - 0.75, depth - 0.04], [b, y - drop, depth], [a, y - drop, depth]], 'ez_fabric', { tint: shadeHex(tint, 0.9) });
      continue;
    }
    kit.face([[a, y - drop, depth], [b, y - drop, depth], [b, y, 0.02], [a, y, 0.02]], 'ez_fabric', { tint });
    kit.face([[a, y + oy, 0.02 + oz], [b, y + oy, 0.02 + oz], [b, y - drop + oy, depth + oz], [a, y - drop + oy, depth + oz]], 'ez_fabric', { tint, shade: 0.62 });
    kit.face([[a + 0.015, y - drop - val, depth], [b - 0.015, y - drop - val, depth], [b, y - drop, depth], [a, y - drop, depth]], 'ez_fabric', { tint });
  }
  for (const xx of [x0, x1]) {
    const tri = [[xx, y, 0.02], [xx, y - drop, depth], [xx, y - drop - val, depth]];
    kit.face(xx === x0 ? tri : tri.slice().reverse(), 'ez_fabric', { tint: o.colors[0] });
  }
  kit.sweep(circle(0.02, 6), [[x0, y - drop, depth - 0.02], [x1, y - drop, depth - 0.02]], 'steel_dark', { smooth: true });
  for (const xx of [x0 + 0.05, x1 - 0.05]) kit.sweep(circle(0.016, 6), [[xx, y - drop - 0.55, 0.02], [xx, y - drop, depth - 0.03]], 'steel_dark', { smooth: true, up: [1, 0, 0] });
  kit.box({ x: (x0 + x1) / 2, y: y - 0.02, z: 0.04, w: x1 - x0 + 0.1, h: 0.1, d: 0.08, mat: 'steel_dark', tint: '#3a3632' });
}
/** Scissor security gate across x0..x1 (wall-local, plane z): verticals + X lattice. */
function scissorGate(kit, x0, x1, y0, y1, z) {
  const n = Math.max(2, Math.round((x1 - x0) / 0.55));
  const s = (x1 - x0) / n, mat = 'ez_iron', tint = '#5a5c5c';
  for (let i = 0; i <= n; i++) kit.box({ x: x0 + i * s, y: y0, z, w: 0.025, h: y1 - y0, d: 0.025, mat, tint });
  const rows = Math.max(2, Math.round((y1 - y0) / 0.8)), rh = (y1 - y0) / rows;
  for (let i = 0; i < n; i++) for (let r = 0; r < rows; r++) {
    const cx = x0 + (i + 0.5) * s, cy = y0 + (r + 0.5) * rh, ang = Math.atan2(rh, s), len = Math.hypot(rh, s);
    for (const sg of [-1, 1]) kit.at({ x: cx, y: cy, z: z + 0.015 * sg, rz: sg * ang }, () => kit.box({ x: 0, y: -0.01, z: 0, w: len, h: 0.02, d: 0.012, mat, tint }));
  }
  kit.box({ x: (x0 + x1) / 2, y: y1 - 0.06, z, w: x1 - x0 + 0.1, h: 0.06, d: 0.06, mat, tint });
  kit.box({ x: (x0 + x1) / 2, y: y0, z, w: x1 - x0 + 0.1, h: 0.04, d: 0.06, mat, tint });
}
/** Steel-sash industrial window panes: per-pane dirty glass / clear glass / missing on plane z (wall-local). */
function sashPanes(kit, op, z, nx, ny, broken = 0.35) {
  const fw = 0.06, x0 = op.x ?? op.cx - op.w / 2, x1 = x0 + op.w, y0 = op.y + fw, y1 = op.y + op.h - fw;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    if (kit.chance(broken)) continue;
    const a = x0 + fw + ((x1 - x0 - 2 * fw) * i) / nx + 0.02, b = x0 + fw + ((x1 - x0 - 2 * fw) * (i + 1)) / nx - 0.02;
    const c = y0 + ((y1 - y0) * j) / ny + 0.02, d = y0 + ((y1 - y0) * (j + 1)) / ny - 0.02;
    kit.face([[a, c, z], [b, c, z], [b, d, z], [a, d, z]], kit.chance(0.6) ? 'glass_dirty' : 'glass', {});
  }
}

// ---------------------------------------------------------------------------------------------------- buildings
/**
 * Rectangular block (same scheme as the north zone). Footprint x0..x1 / z0..z1, storeys fl[], parapet. faces:
 * [{ side: 'E'|'W'|'N'|'S', span: [s0, s1] (world axis range), from: world y (party walls: only the part above the
 * neighbour), ground(e, ctx) -> openings (world y), cols, win, floors [f0, f1], mod(f, k, op), lit: [[f, k]], room,
 * pipes, belts, pilasters, plinth, decor(e, ops, ctx) }]. e.lx(v) = wall-local x of a world axis value.
 */
function block(kit, B) {
  const fl = B.floors, base = BY;
  const bases = fl.map((_, i) => base + fl.slice(0, i).reduce((s, v) => s + v, 0));
  const top = base + fl.reduce((s, v) => s + v, 0);
  const ctx = { bases, fl, top, base, n: fl.length };
  const poly = ensureCCW(rect(B.x0, B.z0, B.x1, B.z1));   // _flatRoof pairs poly[i] with its inset: must be CCW
  for (const f of B.faces) {
    const [s0, s1] = f.span || (f.side === 'E' || f.side === 'W' ? [B.z0, B.z1] : [B.x0, B.x1]);
    const e = f.side === 'E' ? { a: [B.x1, s1], b: [B.x1, s0] } : f.side === 'W' ? { a: [B.x0, s0], b: [B.x0, s1] } : f.side === 'N' ? { a: [s1, B.z0], b: [s0, B.z0] } : { a: [s0, B.z1], b: [s1, B.z1] };
    e.L = Math.abs(s1 - s0); e.side = f.side;
    e.lx = (v) => (f.side === 'E' || f.side === 'N' ? s1 - v : v - s0);
    const from = f.from ?? base;
    const ops = [];
    if (from <= base + 0.01 && f.ground) ops.push(...f.ground(e, ctx));
    const win = { w: 1.2, h: 1.8, sill: 0.9, states: WIN_STATES, ...(B.win || {}), ...(f.win || {}) };
    const [fa, fb] = f.floors || [1, fl.length - 1];
    for (let fi = Math.max(1, fa); fi <= fb; fi++) {
      const sillY = bases[fi] + win.sill;
      if (sillY < from + 0.25) continue;
      (f.cols || []).forEach((cx, k) => {
        let op = {
          cx, w: win.w, y: sillY, h: Math.min(win.h, fl[fi] - win.sill - 0.32), type: 'window', state: wpick(kit, win.states),
          lintel: win.lintel ?? false, trimTint: B.trimTint, sillMat: win.sillMat || 'trim_stone', frame: win.frame || 'frame_dark', mullions: win.mullions,
          ac: kit.chance(win.ac ?? 0.08), streak: kit.chance(win.streak ?? 0.45),
        };
        if (op.state === 'broken' || op.state === 'boarded') op.ac = false;
        op.fi = fi; op.k = k;
        if (f.lit?.some(([lf, lk]) => lf === fi && lk === k)) { op.state = 'glass'; op.ac = false; op.lit = true; }
        if (f.mod) op = f.mod(fi, k, op);
        if (op) ops.push(op);
      });
    }
    const g1 = bases[1] ?? top;
    const wallOf = (y0, y1, mat, tint, grime) => {
      const mine = ops.filter((op) => op.y >= y0 - 0.01 && op.y < y1 - 0.01).map((op) => ({ ...op, y: op.y - y0 }));
      kit.wall({ a: e.a, b: e.b, y0, h: y1 - y0, t: 0.35, mat, tint, openings: mine, bands: bases.filter((y) => y > y0 + 0.01 && y < y1 - 0.01).map((y) => y - y0), room: f.room ?? 1.1, collide: false, grime });
    };
    if (!f.skipGround && from <= base + 0.01) wallOf(base, g1, B.groundMat || B.mat, B.groundTint || B.tint, { y: base, h: 1.6, k: 0.4 });
    if (!f.skipUpper) wallOf(Math.max(from, g1), top, B.mat, B.tint, null);
    kit.at(edgeFrame(e.a, e.b), () => {
      const L = e.L;
      if (B.belts !== false && f.belts !== false) for (const by of bases.slice(1)) if (by > from + 0.3) kit.box({ x: L / 2, y: by - 0.12, z: 0.035, w: L + 0.06, h: 0.2, d: 0.07, mat: B.trim || 'trim_stone', tint: B.trimTint, faces: { nz: false } });
      if (f.pilasters) for (const px of f.pilasters) { const y0 = Math.max(from, g1); kit.box({ x: px, y: y0, z: 0.05, w: f.pilW ?? 0.5, h: top - y0 - 0.5, d: 0.1, mat: B.trim || 'trim_stone', tint: B.trimTint, faces: { nz: false, bottom: false } }); }
      if (B.cornice && f.cornice !== false) cornice(kit, L, top, B.cornice);
      if (f.plinth !== false && from <= base + 0.01) {
        const cuts = ops.filter((op) => op.y < base + 0.6).map((op) => { const x0 = op.x ?? op.cx - op.w / 2; return [x0, x0 + op.w]; }).sort((p, q) => p[0] - q[0]);
        let x = -0.03;
        for (const [c0, c1] of [...cuts, [L + 0.03, L + 0.03]]) { if (c0 - x > 0.05) kit.box({ x: (x + c0) / 2, y: base, z: 0.03, w: c0 - x, h: B.plinthH ?? 0.5, d: 0.06, mat: B.plinthMat || 'trim_concrete', tint: B.plinthTint, faces: { bottom: false, nz: false }, grime: { y: 0, h: 0.6, k: 0.35 } }); x = Math.max(x, c1); }
      }
      if (f.pipes) for (const px of f.pipes) kit.sweep(circle(0.055, 8), [[px, top + 0.1, 0.12], [px, base + 0.35, 0.12], [px, base + 0.1, 0.3]], 'steel', { smooth: true, tint: '#7b7a74', up: [0, 0, 1] });
      for (const op of ops.filter((o) => o.lit)) kit.light({ pos: [op.cx, op.y + 0.9, -0.75], color: '#ffb468', intensity: 2.4, decay: 1.5, range: 3.6, radius: 0.15, name: 'window' });
      f.decor?.(e, ops, ctx);
    });
  }
  kit._flatRoof(poly, top, { type: 'flat', parapet: B.parapet, mat: 'roof_tar', coping: B.coping || 'trim_concrete', clutter: B.clutter !== false }, { mat: B.mat, tint: B.tint });
  if (B.collide !== false) kit.colPrism(poly, B.colFrom ?? base, top + B.parapet, kit.material(B.mat).surf);
  kit.solid(poly, base, top);
  B.extra?.(ctx);
  return ctx;
}
/**
 * Black iron fire escape on a facade (wall-local frame, x = centre along the wall): landings at every upper floor,
 * railings, stairs between landings, drop ladder. Same look as kit.fireEscape but WITHOUT collision: the landings
 * stack 2 nav layers each (top + bottom face), which pushed the sidewalk below out of the 4-layer nav column and let
 * a roof spawner seed an unreachable landing island (NAV_RULES: fire escapes are never baked).
 */
function fireEscape(kit, f) {
  const { x, floors, groundH, floorH } = f;
  const W = f.width ?? 3.8, D = 1.25, mat = 'ez_iron', tint = '#5d5853';
  const B = f.bases || Array.from({ length: floors }, (_, k) => (k === 0 ? 0 : groundH + (k - 1) * floorH));
  for (let k = 1; k < floors; k++) {
    const y = B[k] - 0.05;
    kit.box({ x, y, z: D / 2 + 0.02, w: W, h: 0.06, d: D, mat: 'ez_iron', tint: '#4a4642' });
    const rh = 1.0, posts = Math.max(2, Math.round(W / 1.2) + 1);
    for (let i = 0; i < posts; i++) kit.box({ x: x - W / 2 + (W * i) / (posts - 1), y: y + 0.06, z: D - 0.02, w: 0.04, h: rh, d: 0.04, mat, tint });
    for (const ry of [rh, rh * 0.5]) {
      kit.box({ x, y: y + 0.06 + ry - 0.03, z: D - 0.02, w: W, h: 0.035, d: 0.035, mat, tint });
      for (const s of [-1, 1]) kit.box({ x: x + (s * W) / 2, y: y + 0.06 + ry - 0.03, z: D / 2, w: 0.035, h: 0.035, d: D, mat, tint });
    }
    for (const s of [-1, 1]) kit.at({ x: x + s * (W / 2 - 0.1), y: y - 0.02, z: 0.02 }, () => kit.sweep([[-0.02, -0.02], [0.02, -0.02], [0.02, 0.02], [-0.02, 0.02]], [[0, 0, 0], [0, 0, D - 0.05], [0, -0.7, 0.02]], mat, { tint }));
    if (k < floors - 1) {
      const y2 = B[k + 1] - 0.05, run = W - 0.9, steps = Math.round(floorH / 0.2);
      const sx0 = x - W / 2 + 0.3, sw = 0.6, zc = D * 0.5;
      for (let s = 0; s < steps; s++) {
        const yy = y + 0.06 + ((s + 1) * (y2 - y)) / (steps + 1), xx = sx0 + 0.1 + (s * run) / steps;
        kit.box({ x: xx, y: yy - 0.03, z: zc, w: run / steps + 0.05, h: 0.03, d: sw, mat, tint: '#4a4642' });
      }
      for (const dz of [-sw / 2, sw / 2]) kit.sweep([[-0.015, -0.08], [0.015, -0.08], [0.015, 0.02], [-0.015, 0.02]], [[sx0, y + 0.06, zc + dz], [sx0 + run + 0.2, y2 + 0.06, zc + dz]], mat, { tint });
    }
  }
  const y1 = B[1] - 0.05, lx = x + W / 2 - 0.45, low = f.lowered ? SW : y1 - 2.4;
  for (const s of [-0.22, 0.22]) kit.box({ x: lx + s, y: low, z: D - 0.15, w: 0.04, h: y1 - low, d: 0.04, mat, tint });
  for (let r = 0; r * 0.32 < y1 - low - 0.15; r++) kit.box({ x: lx, y: low + 0.25 + r * 0.32, z: D - 0.15, w: 0.44, h: 0.025, d: 0.025, mat, tint });
}
/** Opening spanning world axis values va..vb on face e (any order), extra fields o. */
const sp = (e, va, vb, o) => ({ x: Math.min(e.lx(va), e.lx(vb)), w: Math.abs(vb - va), ...o });

// ---------------------------------------------------------------------------------------------------- zone entry
export function build(kit, L) {
  street(kit, L);
  northSide(kit, L);
  southSide(kit, L);
  alley(kit, L);
  warehouse(kit, L);
  eastRow(kit, L);
  fills(kit);
  crossStreet(kit, L);
  armyTruck(kit, L);
  props(kit, L);
  canyonFill(kit);
  // Spawners, supplies, L_FIRE_E / L_BEACON_E and the gameplay zones come from layout.toMapJson() / LIGHTS.
  return {};
}

/**
 * Baked bounce fill (never realtime): the one-bounce bake misses the light thrown back and forth between the facades
 * of a 15-25 m canyon; soft warm-grey linear-falloff lights at mid height stand in for it (as in the north zone).
 */
function canyonFill(kit) {
  for (const x of [30.5, 38.5, 46.5]) kit.light({ pos: [x, 8.0, 0], color: '#d6ccbb', intensity: 12, decay: 1, range: 22, radius: 2.0, name: 'fill' });
  for (const x of [32, 44]) kit.light({ pos: [x, 2.6, 0], color: '#cfc8bb', intensity: 5, decay: 1, range: 14, radius: 1.5, name: 'fill' });
  // bounce off the sunlit north facades onto the army truck's flank (the hero prop sits in the south blocks' shadow)
  kit.light({ pos: [40.2, 2.4, 1.9], color: '#d8cdb8', intensity: 6, decay: 1, range: 8, radius: 1.0, name: 'fill' });
  kit.light({ pos: [36.6, 2.0, -5.0], color: '#d8cdb8', intensity: 3.5, decay: 1, range: 6, radius: 0.8, name: 'fill' });
  kit.light({ pos: [58.5, 8.0, 0], color: '#d6ccbb', intensity: 14, decay: 1, range: 22, radius: 2.0, name: 'fill' });
  for (const z of [-21, -13, 13, 21]) kit.light({ pos: [59, 6.5, z], color: '#d3cbbd', intensity: 15, decay: 1, range: 20, radius: 1.8, name: 'fill' });
  for (const z of [-23.5, -17, 17, 23.5]) kit.light({ pos: [59, 2.4, z], color: '#ccc6ba', intensity: 7, decay: 1, range: 13, radius: 1.4, name: 'fill' });
  for (const z of [-31, 31.6]) kit.light({ pos: [59, 4.5, z], color: '#c9c8c0', intensity: 6, decay: 1, range: 12, radius: 1.2, name: 'fill' });
  for (const z of [10.5, 14.5, 19.0, 22.5]) kit.light({ pos: [41.5, 3.2, z], color: '#cfc6b6', intensity: 9, decay: 1, range: 9, radius: 0.8, name: 'fill' });
  kit.light({ pos: [41.5, 10.0, 16.0], color: '#cfc6b6', intensity: 6, decay: 1, range: 12, radius: 1.0, name: 'fill' });
}

// ==================================================================================================== street
// East Street carriageway z ±5.5 from the zone seam (x 26) to the T, curb returns (r 2.5) into the East Cross Street
// carriageway x 55..63 (z -34..34, pockets behind the barricades). Sidewalks: north/south of East Street 3.5 m,
// cross street 3 m; the east sidewalk dips into a driveway apron in front of the warehouse drive-in door.
const RET_R = 2.5;
const RET_NW = arcPts([55 - RET_R, -5.5 - RET_R], RET_R, PI / 2, 0, 6);   // (52.5, -5.5) -> (55, -8)
const RET_SW = arcPts([55 - RET_R, 5.5 + RET_R], RET_R, -PI / 2, 0, 6);   // (52.5, 5.5) -> (55, 8)
const DRIVE = [-5.9, -0.1];                                                // driveway apron (z) at the south roller door

function street(kit, L) {
  const road = [[26, -5.5], ...RET_NW, [55, -34], [63, -34], [63, 34], [55, 34], ...RET_SW.slice().reverse(), [26, 5.5]];
  kit.ground(road, { mat: 'asphalt_cracked' });
  // repaved strips (smoother asphalt laid 6 mm proud): the center zone's north-lane strip runs on to x 31; a utility
  // trench down the cross street; a patched lane in front of the T
  const over = (poly) => kit.ground(poly, { mat: 'asphalt', y: 0.006, collide: false, tint: '#d2d2d2' });
  over([[26, -5.5], [30.6, -5.5], [31.4, -2.9], [30.9, -0.4], [26, -0.3]]);
  over([[58.3, -25.6], [59.4, -25.6], [59.6, 25.0], [58.5, 25.0]]);
  over([[44.0, 0.6], [51.8, 0.4], [52.4, 5.5], [43.4, 5.5]]);
  // dark asphalt repairs and pothole fills
  kit.patch([[33.2, -5.5], [34.0, -5.5], [34.4, 5.5], [33.6, 5.5]]);
  kit.patch([[37.8, 1.4], [40.1, 1.1], [40.4, 3.2], [38.1, 3.6]]);
  kit.patch([[47.2, -4.6], [49.5, -4.9], [49.7, -2.9], [47.4, -2.6]]);
  kit.patch([[55.3, -14.2], [63, -14.6], [63, -13.8], [55.3, -13.4]]);
  kit.patch([[60.4, 13.0], [62.4, 12.7], [62.7, 15.0], [60.6, 15.3]]);
  kit.patch([[56.1, 19.2], [57.7, 19.0], [57.9, 20.6], [56.3, 20.8]]);
  kit.patch([[28.6, 2.0], [29.8, 1.8], [30.0, 3.0], [28.8, 3.2]]);

  // ---- sidewalks
  sidewalk(kit, [[26, -5.5], ...RET_NW, [55, -34]], [[52, -34], [52, -9], [26, -9]]);
  sidewalk(kit, [[26, 5.5], ...RET_SW, [55, 34]], [[52, 34], [52, 9], [26, 9]]);
  sidewalk(kit, [[63, -34], [63, DRIVE[0]], [66, DRIVE[0]]], [[66, -34]]);
  sidewalk(kit, [[66, DRIVE[1]], [63, DRIVE[1]], [63, 34]], [[66, 34]]);
  // driveway apron: concrete ramp from the gutter (y 0.02) up to the door threshold (y 0.15)
  kit.ground(rect(63, DRIVE[0], 66, DRIVE[1]), { mat: 'concrete_cracked', heightAt: (x) => 0.02 + Math.min(1, Math.max(0, (x - 63) / 3)) * (SW - 0.02) });
  // service alley floor (flush with the sidewalk)
  kit.ground(rect(40, 9, 43, 24), { y: SW, mat: 'concrete_cracked' });

  // ---- markings
  // East Street: centre dashes at world x [9k, 9k + 3] up to the crosswalk at the T, yellow edge lines z ±5.1
  for (let k = 3; k <= 5; k++) kit.markLine([[9 * k, 0], [9 * k + 3, 0]], { width: 0.12 });
  for (const z of [-5.1, 5.1]) kit.markLine([[26, z], [48.9, z]], { width: 0.12, mat: 'paint_yellow' });
  kit.crosswalk({ at: [50.6, 0], dir: 0, across: 11, length: 3.0, stripe: 0.5, gap: 0.5 });
  kit.markLine([[48.7, 0.15], [48.7, 5.1]], { width: 0.45 });
  // East Cross Street: crosswalks either side of the T, centre dashes at world z [9k, 9k + 3], yellow edge lines
  kit.crosswalk({ at: [59, -8.2], dir: PI / 2, across: 8, length: 3.0, stripe: 0.5, gap: 0.5 });
  kit.crosswalk({ at: [59, 8.2], dir: PI / 2, across: 8, length: 3.0, stripe: 0.5, gap: 0.5 });
  for (const [c0, c1] of [[-25.8, -24], [-18, -15], [9.9, 12], [18, 21]]) kit.markLine([[59, c0], [59, c1]], { width: 0.12 });
  for (const x of [55.4, 62.6]) { kit.markLine([[x, -25.9], [x, -9.9]], { width: 0.12, mat: 'paint_yellow' }); kit.markLine([[x, 9.9], [x, 25.4]], { width: 0.12, mat: 'paint_yellow' }); }
  kit.markLine([[55.4, -10.1], [58.85, -10.1]], { width: 0.45 });
  kit.markLine([[59.15, 10.1], [62.6, 10.1]], { width: 0.45 });
  // faded LOADING box in front of the warehouse doors (painted on the road, reads from the T)
  for (const [a, b] of [[[60.2, -6.4], [62.8, -6.4]], [[60.2, 6.2], [62.8, 6.2]], [[60.2, -6.4], [60.2, 6.2]]]) kit.markLine([a, b], { width: 0.15, mat: 'paint_yellow' });
  kit.at({ x: 61.6, y: 0.009, z: 0, rot: -PI / 2 }, () => kit.at({ rx: -PI / 2 }, () => text(kit, 'LOADING', { x: 0, y: -0.3, h: 0.6, t: 0.09, mat: 'paint_yellow', align: 'center', z: 0 })));

  // ---- hardware: manhole MH_E, utility covers, storm drains at the curbs
  for (const m of L.MANHOLES.filter((mm) => mm.x > 26 && mm.x < 84 && Math.abs(mm.z) < 40)) manholeCover(kit, [m.x, m.z], 0.34);
  manholeCover(kit, [44.6, 2.6], 0.3);
  manholeCover(kit, [59.1, -13.2], 0.34);
  manholeCover(kit, [58.9, 17.6], 0.3);
  for (const [x, z] of [[33.5, -5.27], [44.5, -5.27], [30.5, 5.27], [40.6, 5.27], [49.6, 5.27]]) kit.drain([x, z], 0);
  for (const [x, z] of [[55.27, -19.5], [55.27, 15.5], [62.73, -13.0], [62.73, 19.5]]) kit.drain([x, z], PI / 2);
  for (const [x, z] of [[29.4, -7.6], [37.6, 7.4], [53.4, -21.0], [64.4, 22.6]]) kit.box({ x, y: SW, z, w: 0.6, h: 0.008, d: 0.9, mat: 'steel_dark', tint: '#6a655e' });

  // ---- grime: stains, cracks, oil, puddles in the gutters; skid marks of the army truck
  const truck = [[41.5, -2.6, 5.2]];
  kit.scatterDecals(rect(26.3, -5.3, 49, 5.3), { count: 18, avoid: truck });
  kit.scatterDecals(rect(55.3, -25.5, 62.7, 25.5), { count: 16, avoid: [[58.5, -18, 3.0]] });
  kit.scatterDecals(rect(55.3, -33.7, 62.7, -28.7), { count: 5, mats: { decal_dirt: 3, decal_stain: 2 } });
  kit.scatterDecals(rect(55.3, 29.7, 62.7, 33.7), { count: 5, mats: { decal_dirt: 3, decal_stain: 2 } });
  kit.scatterDecals(rect(28, -4.5, 48, 4.5), { count: 7, mats: { decal_stain: 3, decal_dirt: 1 }, size: [0.8, 1.8], avoid: truck });
  for (const [x, z, r, s] of [[31.2, -4.8, 0.2, [2.8, 1.0]], [45.2, 4.7, 1.4, [2.2, 0.9]], [50.4, -4.6, 0.1, [3.0, 1.1]], [55.9, -21.6, 1.6, [2.4, 1.0]],
    [62.0, 17.8, 1.5, [2.2, 0.9]], [36.8, 0.8, 0.9, [1.6, 1.1]], [59.6, 4.2, 2.6, [2.0, 1.3]], [56.2, 12.8, 1.5, [1.6, 0.9]]]) kit.decal({ at: [x, z], size: s, rot: r, mat: 'decal_puddle' });
  const swDecals = { decal_stain: 2, decal_dirt: 3, decal_cracks: 1 };
  kit.scatterDecals(rect(26.3, -8.9, 51.7, -5.8), { count: 10, y: SW, mats: swDecals, size: [0.6, 1.6] });
  kit.scatterDecals(rect(26.3, 5.8, 51.7, 8.9), { count: 10, y: SW, mats: swDecals, size: [0.6, 1.6] });
  kit.scatterDecals(rect(52.2, -33.7, 54.7, -9.5), { count: 7, y: SW, mats: swDecals, size: [0.6, 1.4] });
  kit.scatterDecals(rect(52.2, 9.5, 54.7, 33.7), { count: 7, y: SW, mats: swDecals, size: [0.6, 1.4] });
  kit.scatterDecals(rect(63.3, -33.7, 65.8, -6.3), { count: 6, y: SW, mats: swDecals, size: [0.6, 1.4] });
  kit.scatterDecals(rect(63.3, 7.2, 65.8, 33.7), { count: 6, y: SW, mats: swDecals, size: [0.6, 1.4] });
  // tyre skid marks: the truck braked hard and slewed (dark rubber arcs behind its wheels)
  for (const s of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([lerp(27.5, 37.4, t), s * 0.98 + lerp(-0.6, -4.0, t * t)]); }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      kit.decal({ at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], size: [l + 0.25, 0.26], rot: Math.atan2(-(b[1] - a[1]), b[0] - a[0]), mat: 'decal_stain', tint: '#3a332c', lift: 0.013 + i * 0.0002 });
    }
  }
}

/** Sidewalk slab: curbChain = road-side polyline (0.3 m granite curb), back = the rest of the outline. */
function sidewalk(kit, curbChain, back) {
  const poly = [...curbChain, ...back].filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 1e-4);
  const ccw = ensureCCW(poly);
  const key = (a, b) => `${a[0].toFixed(3)},${a[1].toFixed(3)}|${b[0].toFixed(3)},${b[1].toFixed(3)}`;
  const curbSeg = new Set();
  for (let i = 0; i < curbChain.length - 1; i++) { curbSeg.add(key(curbChain[i], curbChain[i + 1])); curbSeg.add(key(curbChain[i + 1], curbChain[i])); }
  const edges = [];
  for (let i = 0; i < ccw.length; i++) if (curbSeg.has(key(ccw[i], ccw[(i + 1) % ccw.length]))) edges.push(i);
  kit.slab(ccw, { y1: SW, mat: 'concrete_floor', curb: 0.3, curbMat: 'curb', edge: 'curb', edges, grime: { y: 0, h: 0.15, k: 0.25 }, collide: false });
  // collision: walkable top + the curb faces only (a closed prism's bottom face would become the lowest nav layer)
  kit.colPoly(ccw.map((p) => [p[0], SW, p[1]]), 'concrete');
  for (const i of edges) { const a = ccw[i], b = ccw[(i + 1) % ccw.length]; kit.colQuad([a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], SW, b[1]], [a[0], SW, a[1]], 'concrete'); }
}
/** Cast-iron manhole cover: rim + disc + cast cross (decal-thin, flush with the road). */
function manholeCover(kit, at, r, lift = 0) {
  kit.manhole(at, { r: r + 0.07, tint: '#55524e', y: 0.001 + lift });
  kit.manhole(at, { r, tint: '#7a7470', y: 0.004 + lift });
  kit.at({ x: at[0], y: 0.0085 + lift, z: at[1], rot: 0.6 }, () => {
    for (const a of [0, PI / 2]) kit.at({ rot: a }, () => kit.upFace([[-r * 0.85, 0, -0.025], [r * 0.85, 0, -0.025], [r * 0.85, 0, 0.025], [-r * 0.85, 0, 0.025]], 'steel_dark', null, { tint: '#4a4744' }));
  });
}

// ==================================================================================================== north side
function northSide(kit, L) {
  void L;
  // ---------------- E_N1 East Street flats (brick_dark, 7F): LIQUORS + CHECKS CASHED, fire escape, spawn window
  block(kit, {
    id: 'E_N1', x0: 26, x1: 40, z0: -24, z1: -9, floors: F(4.5, 7), parapet: 0.9,
    mat: 'brick_dark', tint: '#d4c6bb', groundMat: 'concrete_wall', groundTint: '#bab2a3', trim: 'trim_stone', trimTint: '#b9b1a3',
    cornice: { kind: 'simple', mat: 'trim_concrete', tint: '#9c968a' }, plinthMat: 'concrete_dirty', plinthTint: '#625e58',
    win: { w: 1.1, h: 1.7, sill: 0.9, lintel: 'trim_stone', states: WIN_POOR, ac: 0.16 },
    faces: [
      {
        side: 'S', cols: [1.4, 4.2, 7.0, 9.8, 12.6], pipes: [0.22], lit: [[4, 0], [2, 4], [5, 3]],
        mod: (f, k, op) => {
          if (f === 1 && k === 2) return { ...op, state: 'broken', ac: false, streak: false, spawn: true };   // SP_E_WIN
          if (f === 3 && k === 1) return { ...op, state: 'broken', ac: false, streak: false, burnt: true, roomTint: '#151311' };
          return op;
        },
        ground: () => [
          { x: 0.45, w: 2.9, y: BY + 0.02, h: 3.05, type: 'shop', state: 'shutter', frame: 'frame_dark', kick: 'trim_metal', shutterTint: '#8f918a' },
          { x: 3.55, w: 2.3, y: BY + 0.02, h: 3.05, type: 'shop', state: 'broken', frame: 'frame_dark', kick: 'trim_metal', room: 1.6 },
          { x: 6.4, w: 1.2, y: BY + 0.02, h: 2.55, type: 'door', state: 'closed', door: 'ez_wood', doorTint: '#5e4330', window: true, step: false },
          { x: 6.4, w: 1.2, y: BY + 2.75, h: 0.5, type: 'window', state: 'dark', frame: 'frame_dark', sill: false, mullions: [3, 1] },
          { x: 8.1, w: 2.6, y: BY + 0.02, h: 3.05, type: 'shop', state: 'glass', frame: 'frame_dark', kick: 'trim_metal', room: 1.4 },
          { x: 10.9, w: 2.65, y: BY + 0.02, h: 3.05, type: 'shop', state: 'boarded', frame: 'frame_dark', kick: 'trim_metal' },
        ],
        decor: (e, ops, ctx) => {
          // LIQUORS fascia over both bays of shop A, CHECKS CASHED over shop B
          let zf = board(kit, 0.3, 6.0, 3.3, 0.86, { mat: 'sign_red', tint: '#9a3a2e', border: { mat: 'sign_white', tint: '#e8dcc0', w: 0.03 } });
          text(kit, 'LIQUORS', { x: 2.55, y: 3.52, h: 0.4, t: 0.07, z: zf, align: 'center', mat: 'ez_ink_white', serif: true });
          text(kit, '酒', { x: 5.15, y: 3.48, h: 0.44, t: 0.07, z: zf, align: 'center', mat: 'ez_ink_yellow' });
          text(kit, 'BEER · WINE · SPIRITS', { x: 3.15, y: 3.38, h: 0.09, t: 0.016, z: zf, align: 'center', mat: 'ez_ink_white' });
          zf = board(kit, 7.95, 13.75, 3.3, 0.86, { mat: 'sign_yellow', tint: '#e2bf52', border: { mat: 'sign_red', tint: '#9a3a2e', w: 0.03 } });
          text(kit, 'CHECKS CASHED', { x: 10.85, y: 3.6, h: 0.32, t: 0.06, z: zf, align: 'center', mat: 'ez_ink_red', maxW: 5.3 });
          text(kit, 'MONEY ORDERS · BILLS PAID', { x: 10.85, y: 3.4, h: 0.1, t: 0.018, z: zf, align: 'center', mat: 'ez_ink' });
          // spray tag on the liquor-store shutter, posters on the piers and the boarded window
          text(kit, 'NO WAY OUT', { x: 1.9, y: 1.25, h: 0.36, t: 0.06, z: -0.04, align: 'center', mat: 'ez_ink_red', italic: 0.2, track: 1.1 });
          posterWall(kit, 10.95, 13.5, 0.7, 2.8, 0.03, 5, ['MISSING', 'CURFEW 6 PM', 'QUARANTINE', null]);
          for (let i = 0; i < 3; i++) poster(kit, 8.3 + i * 0.82, 1.0 + (i % 2) * 0.35, 0.68, 0.95, -0.2, { head: ['WE CASH', 'OPEN', 'LOANS'][i], tint: '#f0d65a', headMat: 'ez_ink_red' });
          // apartment door: house number on the transom, canopy, wall lamp, search mark
          text(kit, '415', { x: 7.0, y: BY + 2.88, h: 0.18, t: 0.03, z: -0.12, align: 'center', mat: 'ez_ink_yellow', serif: true });
          kit.box({ x: 7.0, y: BY + 3.36, z: 0.42, w: 1.8, h: 0.1, d: 0.84, mat: 'steel', tint: '#5f625c' });
          for (const s of [-1, 1]) kit.sweep(circle(0.012, 4), [[7.0 + s * 0.85, BY + 3.44, 0.8], [7.0 + s * 0.85, BY + 4.3, 0.02]], 'steel_dark', { smooth: true, up: [1, 0, 0] });
          kit.wallLamp({ x: 7.95, y: BY + 2.45, on: true, intensity: 3.0, range: 6, color: '#ffc58a' });
          kit.at({ z: -0.19 }, () => searchMark(kit, 7.0, BY + 1.45, 0.6, 'ez_ink_red', '10-04'));
          // LIQUOR blade sign at the west corner (dead neon tubes)
          kit.at({ x: 0.55, y: 0, z: 0 }, () => {
            for (const yy of [5.25, 8.35]) kit.box({ x: 0, y: yy, z: 0.55, w: 0.06, h: 0.07, d: 1.1, mat: 'steel_dark' });
            kit.bbox({ x: 0, y: 5.0, z: 0.72, w: 0.2, h: 3.6, d: 0.82, bevel: 0.03, mat: 'sign_red', tint: '#8f3a30' });
            for (const s of [-1, 1]) kit.at({ x: s * 0.102, z: 0.72, rot: s * PI / 2 }, () => {
              vtext(kit, 'LIQUOR', { x: 0, yTop: 8.35, h: 0.4, t: 0.075, mat: 'ez_ink_white', z: 0.002, lead: 1.32 });
              kit.face([[-0.36, 5.08, 0.001], [0.36, 5.08, 0.001], [0.36, 5.16, 0.001], [-0.36, 5.16, 0.001]], 'lamp_off', {});
            });
          });
          // black iron fire escape over the two east bays (2F-7F), the spawn window with a curtain blown out
          fireEscape(kit, { x: 11.2, floors: 7, groundH: 4.5, floorH: 3.4, bases: ctx.bases, width: 4.6 });
          const sp = ops.find((op) => op.spawn);
          if (sp) {
            kit.face([[sp.cx - 0.45, sp.y + 1.55, -0.05], [sp.cx + 0.05, sp.y + 1.55, -0.05], [sp.cx + 0.2, sp.y + 0.3, 0.55], [sp.cx - 0.38, sp.y + 0.12, 0.42]], 'ez_fabric', { tint: '#9a8f7a' });
            kit.at({ x: sp.cx + 0.3, y: sp.y + 0.15, z: 0.08, rz: 0.55 }, () => kit.box({ x: 0, y: 0, z: 0, w: 0.05, h: 1.25, d: 0.05, mat: 'frame_dark' }));
            for (let i = 0; i < 16; i++) { const x = sp.cx + kit.rnd(-1.3, 1.3), z = kit.rnd(0.4, 2.8), s = kit.rnd(0.05, 0.16); kit.upFace([[x, SW + 0.004, z], [x + s, SW + 0.004, z + kit.rnd(-0.05, 0.05)], [x + s * 0.3, SW + 0.004, z + s]], 'glass_dirty', null, {}); }
          }
          // a burnt-out flat on the 4F: soot climbing the wall above the gaping window
          const bw = ops.find((op) => op.burnt);
          if (bw) {
            streaks(kit, bw.cx - 0.75, bw.cx + 0.45, bw.y + bw.h - 0.15, 5, 0.006, [1.4, 3.2], { up: true, tint: '#100e0c' });
            flat(kit, [[bw.cx - 0.75, bw.y + bw.h], [bw.cx + 0.75, bw.y + bw.h], [bw.cx + 0.5, bw.y + bw.h + 0.9], [bw.cx - 0.1, bw.y + bw.h + 1.3], [bw.cx - 0.6, bw.y + bw.h + 0.7]], 0.005, 'ez_ink', { tint: '#16130f' });
          }
          streaks(kit, 0.2, 13.8, ctx.top - 0.3, 10, 0.004, [1.5, 3.5]);
          // glass shards from the smashed liquor window
          for (let i = 0; i < 14; i++) { const x = kit.rnd(3.6, 5.8), z = kit.rnd(0.2, 1.5), s = kit.rnd(0.05, 0.14); kit.upFace([[x, SW + 0.004, z], [x + s, SW + 0.004, z + kit.rnd(-0.05, 0.05)], [x + s * 0.3, SW + 0.004, z + s]], 'glass_dirty', null, {}); }
          void e;
        },
      },
      { side: 'W', from: BY + 21.5, cols: [3.0, 7.5, 12.0], floors: [6, 6], win: { w: 1.0, h: 1.5, states: WIN_POOR, ac: 0 }, belts: false, plinth: false, room: 0.8 },
      { side: 'E', from: BY + 18.1, cols: [3.5, 7.5, 11.5], floors: [5, 6], win: { w: 1.0, h: 1.5, ac: 0.1 }, plinth: false, room: 0.8 },
    ],
    extra: (ctx) => {
      for (const [x, z, h] of [[29.0, -21.5, 4.2], [37.2, -13.5, 3.0]]) {
        kit.cyl({ x, y: ctx.top, z, r: 0.03, h, seg: 5, mat: 'steel', tint: '#7e7f7c' });
        for (let i = 1; i < 4; i++) kit.box({ x, y: ctx.top + h * (0.55 + i * 0.12), z, w: 1.2 - i * 0.25, h: 0.02, d: 0.02, mat: 'steel_dark' });
      }
    },
  });

  // ---------------- E_N2 LAUNDROMAT 自助洗衣 corner (painted brick, pale green, 5F): faces S and E
  const PAINT = '#a5b39b';
  block(kit, {
    id: 'E_N2', x0: 40, x1: 52, z0: -34, z1: -9, floors: F(4.5, 5), parapet: 0.8,
    mat: 'brick_painted', tint: PAINT, trim: 'trim_concrete', trimTint: '#d3cdb9', cornice: { kind: 'simple', mat: 'trim_concrete', tint: '#c3bca6' },
    plinthMat: 'concrete_dirty', plinthTint: '#6f6c62',
    win: { w: 1.2, h: 1.7, sill: 0.9, lintel: 'trim_concrete', ac: 0.08, states: WIN_STATES },
    faces: [
      {
        side: 'S', cols: [1.5, 4.5, 7.5, 10.5], pipes: [11.8], lit: [[2, 2]],
        ground: () => [
          { x: 0.45, w: 4.1, y: BY + 0.5, h: 2.75, type: 'shop', state: 'broken', frame: 'frame_white', kick: 'trim_metal', mullions: [2, 1], room: 0, depth: 0.33 },
          { x: 4.85, w: 1.1, y: BY + 0.02, h: 2.6, type: 'door', state: 'closed', door: 'glass_dirty', frame: 'frame_white', step: false, room: 0, depth: 0.33 },
          { x: 6.25, w: 5.3, y: BY + 0.5, h: 2.75, type: 'shop', state: 'glass', frame: 'frame_white', kick: 'trim_metal', mullions: [3, 1], room: 0, depth: 0.33 },
        ],
        decor: (e, ops, ctx) => {
          const zf = board(kit, 0.3, 11.7, 3.38, 0.92, { mat: 'sign_white', tint: '#e9e5da', border: { mat: 'sign_blue', tint: '#5d7fae', w: 0.035 } });
          text(kit, 'LAUNDROMAT', { x: 4.1, y: 3.68, h: 0.44, t: 0.075, z: zf, align: 'center', mat: 'ez_ink', tint: '#2c4f86', track: 1.3 });
          text(kit, '自助洗衣', { x: 9.0, y: 3.66, h: 0.42, t: 0.075, z: zf, align: 'center', mat: 'ez_ink_red' });
          text(kit, 'COIN-OP · WASH · DRY · FOLD · OPEN 24 HRS', { x: 6.0, y: 3.46, h: 0.1, t: 0.017, z: zf, align: 'center', mat: 'ez_ink', tint: '#2c4f86' });
          // window lettering, a cracked pane taped over, an OUT OF ORDER card in the door
          text(kit, 'WASH 25', { x: 8.9, y: 2.5, h: 0.22, t: 0.035, z: -0.355, align: 'center', mat: 'ez_ink_white' });
          for (const [x, y] of [[7.4, 1.8], [10.3, 1.4]]) { strip(kit, [x - 0.4, y - 0.35], [x + 0.4, y + 0.35], 0.06, -0.355, 'ez_ink_white', { tint: '#c9b98a' }); strip(kit, [x - 0.4, y + 0.35], [x + 0.4, y - 0.35], 0.06, -0.356, 'ez_ink_white', { tint: '#c9b98a' }); }
          kit.at({ x: 5.4, y: 1.55, z: -0.31, rz: 0.08 }, () => { kit.box({ x: 0, y: 0, z: 0, w: 0.44, h: 0.2, d: 0.01, mat: 'sign_white', tint: '#f0e8d8' }); text(kit, 'CLOSED', { x: 0, y: 0.05, h: 0.09, t: 0.016, mat: 'ez_ink_red', align: 'center', z: 0.006 }); });
          for (let i = 0; i < 20; i++) { const x = kit.rnd(0.6, 4.4), z = kit.rnd(0.15, 1.6), s = kit.rnd(0.05, 0.15); kit.upFace([[x, SW + 0.004, z], [x + s, SW + 0.004, z + kit.rnd(-0.05, 0.05)], [x + s * 0.3, SW + 0.004, z + s]], 'glass_dirty', null, {}); }
          peel(kit, 0.2, 11.8, 4.8, 17.5, 0.006, 7);
          streaks(kit, 0.2, 11.8, ctx.top - 0.2, 8, 0.004, [1.2, 3.0]);
          kit.wallLamp({ x: 5.4, y: BY + 3.2, on: false });
          void e; void ops;
        },
      },
      {
        side: 'E', cols: [1.5, 4.5, 7.5, 10.5, 13.5, 16.5, 19.5, 22.5], pipes: [8.6, 24.8],
        mod: (f, k, op) => (f >= 2 && k >= 3 && k <= 5 ? null : op),
        ground: () => [
          { x: 0.45, w: 3.6, y: BY + 0.5, h: 2.75, type: 'shop', state: 'glass', frame: 'frame_white', kick: 'trim_metal', mullions: [2, 1], room: 0, depth: 0.33 },
          { x: 6.0, w: 1.0, y: BY + 0.02, h: 2.2, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#6c7468', step: false },
          { x: 9.0, w: 3.4, y: BY + 0.02, h: 3.1, type: 'garage', shutter: 1, shutterTint: '#8b958c' },
          { x: 14.0, w: 1.6, y: BY + 1.0, h: 1.5, type: 'window', state: 'boarded', frame: 'frame_dark' },
          { x: 19.0, w: 1.0, y: BY + 0.02, h: 2.2, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#5b6058', step: false },
          { x: 21.5, w: 2.0, y: BY + 1.0, h: 1.5, type: 'window', state: 'boarded', frame: 'frame_dark' },
        ],
        decor: (e, ops, ctx) => {
          // LAUNDRY blade sign at the corner + side fascia
          kit.at({ x: 0.55, y: 0, z: 0 }, () => {
            for (const yy of [5.15, 8.45]) kit.box({ x: 0, y: yy, z: 0.5, w: 0.06, h: 0.07, d: 1.0, mat: 'steel_dark' });
            kit.bbox({ x: 0, y: 4.95, z: 0.66, w: 0.2, h: 3.6, d: 0.74, bevel: 0.03, mat: 'sign_blue', tint: '#557aa8' });
            for (const s of [-1, 1]) kit.at({ x: s * 0.102, z: 0.66, rot: s * PI / 2 }, () => vtext(kit, 'LAUNDRY', { x: 0, yTop: 8.35, h: 0.36, t: 0.07, mat: 'ez_ink_white', z: 0.002, lead: 1.28 }));
          });
          const zf = board(kit, 0.3, 4.25, 3.38, 0.6, { mat: 'sign_white', tint: '#e9e5da', d: 0.08 });
          text(kit, 'SELF SERVICE', { x: 2.27, y: 3.55, h: 0.24, t: 0.04, z: zf, align: 'center', mat: 'ez_ink', tint: '#2c4f86' });
          text(kit, 'NO ENTRY', { x: 6.5, y: BY + 1.55, h: 0.12, t: 0.02, z: 0.05, align: 'center', mat: 'ez_ink_red' });
          text(kit, 'DELIVERIES', { x: 10.7, y: BY + 3.35, h: 0.2, t: 0.035, z: 0.02, align: 'center', mat: 'ez_ink_white', tint: '#d8d2bc' });
          posterWall(kit, 15.8, 18.6, 0.7, 2.6, 0.02, 4, ['MISSING', 'QUARANTINE', null]);
          kit.at({ z: 0.0 }, () => searchMark(kit, 19.5, BY + 1.5, 0.55, 'ez_ink_red', '10-06'));
          kit.prop('security_light', { at: [6.5, 0.3], y: BY + 2.6, rot: 0 });
          // ghost sign: a faded painted soap advert across floors 3-5 (local x 9.2..18.8)
          ghostSign(kit, 9.2, 18.8, 8.5, 17.5);
          peel(kit, 0.2, 24.8, 4.8, 17.5, 0.006, 9);
          streaks(kit, 0.2, 24.8, ctx.top - 0.2, 12, 0.004, [1.2, 3.5]);
          void e; void ops;
        },
      },
    ],
    extra: () => laundromat(kit),
  });
}
/** Faded painted wall advert (wall-local x0..x1, world y0..y1) on painted brick. */
function ghostSign(kit, x0, x1, y0, y1) {
  const z = 0.007, mid = (x0 + x1) / 2;
  flat(kit, rect2(x0, y0, x1, y1), z, 'brick_painted', { tint: '#5d6f86' });
  for (const yy of [y0 + 0.25, y1 - 0.4]) flat(kit, rect2(x0 + 0.25, yy, x1 - 0.25, yy + 0.15), z + 0.002, 'brick_painted', { tint: '#d9d2be' });
  text(kit, 'BRIGHTWASH', { x: mid, y: y1 - 2.6, h: 1.7, t: 0.32, z: z + 0.003, align: 'center', mat: 'brick_painted', tint: '#e2dbc6', maxW: x1 - x0 - 0.8 });
  text(kit, 'SOAP', { x: mid, y: y1 - 5.6, h: 2.3, t: 0.42, z: z + 0.003, align: 'center', mat: 'brick_painted', tint: '#e7c873', maxW: x1 - x0 - 0.8 });
  text(kit, 'WASHES WHITER · 5 CENTS', { x: mid, y: y0 + 0.75, h: 0.48, t: 0.09, z: z + 0.003, align: 'center', mat: 'brick_painted', tint: '#d9d2be', maxW: x1 - x0 - 0.9 });
  // a sun-burst motif left and right of SOAP
  for (const cx of [x0 + 1.0, x1 - 1.0]) for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2; strip(kit, [cx + Math.cos(a) * 0.25, y1 - 4.45 + Math.sin(a) * 0.25], [cx + Math.cos(a) * 0.6, y1 - 4.45 + Math.sin(a) * 0.6], 0.09, z + 0.003, 'brick_painted', { tint: '#e7c873' }); }
  peel(kit, x0, x1, y0, y1, z + 0.005, 6, '#9a8a80');
}
/** The laundromat behind E_N2's corner windows (never entered: purely visual, inside the block's collision). */
function laundromat(kit) {
  const x0 = 40.35, x1 = 51.65, z0 = -13.6, z1 = -9.35, y0 = BY + 0.02, y1 = BY + 3.55;
  kit.ground(rect(x0, z0, x1, z1), { y: y0, mat: 'interior_tiles', keep: true, collide: false, tint: '#c9d0c4' });
  kit.face([[x0, y1, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1]], 'interior_ceiling', {});
  kit.face([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], 'interior_wall', { tint: '#cbd6cc' });
  kit.face([[x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1]], 'interior_wall', { tint: '#c4cfc6' });
  kit.face([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], 'interior_wall', { tint: '#c4cfc6' });
  // wall tiles band
  kit.box({ x: (x0 + x1) / 2, y: y0, z: z0 + 0.01, w: x1 - x0, h: 1.2, d: 0.02, mat: 'interior_tiles', tint: '#e6ebe2' });
  // washers along the back wall
  for (let i = 0; i < 10; i++) {
    const x = x0 + 0.65 + i * 1.04;
    kit.at({ x, y: y0, z: z0 + 0.45 }, () => {
      kit.bbox({ x: 0, y: 0, z: 0, w: 0.82, h: 0.95, d: 0.72, bevel: 0.03, mat: 'sign_white', tint: i === 6 ? '#c9c4b4' : '#ebe8de' });
      kit.box({ x: 0, y: 0.95, z: -0.24, w: 0.8, h: 0.22, d: 0.2, mat: 'sign_white', tint: '#d5d0c0' });
      kit.at({ y: 0.5, z: 0.36, rx: PI / 2 }, () => kit.cyl({ x: 0, y: 0, z: 0, r: 0.25, h: 0.04, seg: 14, mat: 'car_chrome', tint: '#9a9890' }));
      kit.face(circle(0.19, 12).map(([a, b]) => [a, 0.5 + b, 0.405]), i % 4 === 2 ? 'glass' : 'glass_dirty', {});
      kit.box({ x: 0.25, y: 1.0, z: -0.13, w: 0.08, h: 0.12, d: 0.02, mat: 'steel_dark' });
      if (i === 3 || i === 8) kit.at({ x: 0, y: 0.82, z: 0.37, rz: kit.rnd(-0.1, 0.1) }, () => { kit.box({ x: 0, y: 0, z: 0, w: 0.4, h: 0.14, d: 0.01, mat: 'sign_white', tint: '#f2eedd' }); text(kit, 'OUT OF ORDER', { x: 0, y: 0.04, h: 0.045, t: 0.009, z: 0.006, align: 'center', mat: 'ez_ink_red' }); });
    });
  }
  // stacked dryers along the west wall (doors facing east)
  for (let j = 0; j < 3; j++) for (let r = 0; r < 2; r++) kit.at({ x: x0 + 0.42, y: y0 + r * 0.95, z: z0 + 1.55 + j * 0.95, rot: -PI / 2 }, () => {
    kit.bbox({ x: 0, y: 0, z: 0, w: 0.88, h: 0.92, d: 0.7, bevel: 0.025, mat: 'sign_white', tint: '#dedbd0' });
    kit.at({ y: 0.48, z: 0.35, rx: PI / 2 }, () => kit.cyl({ x: 0, y: 0, z: 0, r: 0.3, h: 0.03, seg: 14, mat: 'car_chrome', tint: '#8f8d86' }));
    kit.face(circle(0.24, 12).map(([a, b]) => [a, 0.48 + b, 0.385]), 'glass_dirty', {});
  });
  // folding table, baskets, plastic chairs (two knocked over), clothes on the floor, a soap vending machine
  kit.box({ x: 46.2, y: y0 + 0.78, z: -11.3, w: 2.6, h: 0.05, d: 0.8, mat: 'trim_wood', tint: '#b9b2a2' });
  for (const [dx, dz] of [[-1.2, -0.35], [1.2, -0.35], [-1.2, 0.35], [1.2, 0.35]]) kit.box({ x: 46.2 + dx, y: y0, z: -11.3 + dz, w: 0.04, h: 0.78, d: 0.04, mat: 'steel' });
  for (const [x, c] of [[45.4, '#3d6fa8'], [47.0, '#c8c2b4']]) kit.bbox({ x, y: y0 + 0.83, z: -11.3, w: 0.55, h: 0.3, d: 0.4, bevel: 0.03, mat: 'car_plastic', tint: c });
  for (const [x, z, r, down] of [[43.6, -10.4, 0.3, false], [48.6, -10.2, 2.0, true], [49.6, -11.6, 1.2, false], [44.2, -12.1, 0.9, true]]) kit.at({ x, y: y0, z, rot: r, rz: down ? PI / 2 : 0 }, () => {
    kit.box({ x: 0, y: down ? -0.22 : 0.42, z: 0, w: 0.42, h: 0.04, d: 0.42, mat: 'car_plastic', tint: '#c45a32' });
    kit.box({ x: 0, y: down ? -0.22 : 0.44, z: -0.2, w: 0.42, h: 0.42, d: 0.04, mat: 'car_plastic', tint: '#c45a32' });
    if (!down) for (const [lx, lz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) kit.box({ x: lx, y: 0, z: lz, w: 0.03, h: 0.42, d: 0.03, mat: 'steel' });
  });
  for (let i = 0; i < 9; i++) { const x = kit.rnd(41.5, 50.8), z = kit.rnd(-12.6, -10.0), s = kit.rnd(0.3, 0.6); kit.upFace([[x, y0 + 0.012, z], [x + s, y0 + 0.012, z + kit.rnd(-0.1, 0.1)], [x + s * 0.8, y0 + 0.012, z + s * 0.7], [x + s * 0.1, y0 + 0.012, z + s * 0.6]], 'ez_fabric', null, { tint: kit.pick(['#d8d2c4', '#7a8fb0', '#a8544a', '#4d5a48', '#e0c890']) }); }
  kit.at({ x: x1 - 0.42, y: y0, z: z0 + 0.45, rot: PI / 2 }, () => {
    kit.bbox({ x: 0, y: 0, z: 0, w: 0.8, h: 1.75, d: 0.7, bevel: 0.03, mat: 'sign_red', tint: '#c23a2c' });
    kit.face([[-0.3, 0.9, 0.351], [0.15, 0.9, 0.351], [0.15, 1.6, 0.351], [-0.3, 1.6, 0.351]], 'glass_dirty', {});
    text(kit, 'SOAP', { x: 0.0, y: 0.45, h: 0.16, t: 0.03, z: 0.352, align: 'center', mat: 'ez_ink_white' });
  });
  // fluorescent fittings: one tube still burning (cold baked light), the rest dead
  for (const [x, on] of [[43.0, false], [46.0, true], [49.0, false]]) {
    kit.box({ x, y: y1 - 0.08, z: -11.4, w: 1.25, h: 0.07, d: 0.22, mat: 'steel', tint: '#c9c8c2' });
    kit.box({ x, y: y1 - 0.1, z: -11.4, w: 1.15, h: 0.025, d: 0.12, mat: on ? 'lamp_cold' : 'lamp_off' });
  }
  kit.light({ pos: [46.0, y1 - 0.35, -11.4], color: '#d8ecff', intensity: 12, range: 10, radius: 0.4, decay: 1.5, name: 'laundromat' });
  kit.light({ pos: [46.0, 1.6, -11.6], color: '#cfe0ea', intensity: 7, decay: 1, range: 9, radius: 1.2, name: 'fill' });
  // notices above the washers
  kit.at({ z: z0 + 0.025 }, () => { for (let i = 0; i < 4; i++) poster(kit, x0 + 1.0 + i * 2.6, y0 + 1.55, 0.5, 0.65, 0, { head: ['NO DYEING', 'RULES', 'LOST CAT', null][i], tint: '#f1ede0' }); });
}

// ==================================================================================================== south side
function southSide(kit, L) {
  void L;
  // ---------------- E_S1 barber flats (brick_commercial red, 4F): barber shop + pole, jeweller, fire escape (SP_E_ROOF)
  const STONE = '#d8cebd', GREEN = '#46705a';
  block(kit, {
    id: 'E_S1', x0: 26, x1: 40, z0: 9, z1: 24, floors: F(4.5, 4), parapet: 0.8,
    mat: 'brick_red', tint: '#e4cec2', trim: 'trim_stone', trimTint: STONE, cornice: { kind: 'metal', mat: 'trim_metal', tint: '#4b5048', bracket: 1.1 },
    win: { w: 1.2, h: 1.9, sill: 0.9, lintel: 'trim_stone', ac: 0.12, states: WIN_STATES },
    faces: [
      {
        side: 'N', cols: [12.4, 9.6, 6.8, 4.0, 1.4], pipes: [13.8], lit: [[2, 3]],
        ground: (e) => [
          sp(e, 27.2, 30.4, { y: BY + 0.45, h: 2.6, type: 'shop', state: 'dark', frame: 'sign_green', kick: 'sign_green', mullions: [2, 1], room: 1.8 }),
          sp(e, 30.7, 31.8, { y: BY + 0.02, h: 2.6, type: 'door', state: 'closed', door: 'glass_dirty', frame: 'sign_green', step: false }),
          sp(e, 30.7, 31.8, { y: BY + 2.78, h: 0.45, type: 'window', state: 'dark', frame: 'sign_green', sill: false }),
          sp(e, 32.7, 33.7, { y: BY + 0.02, h: 2.5, type: 'door', state: 'closed', door: 'ez_wood', doorTint: '#6a4a34', window: true, step: false }),
          sp(e, 34.1, 39.4, { y: BY + 0.3, h: 2.8, type: 'shop', state: 'broken', frame: 'frame_dark', kick: 'trim_metal', room: 1.5 }),
        ],
        decor: (e, ops, ctx) => {
          // TONY'S BARBER SHOP fascia (red / white / blue border), striped awning, pole by the door
          const fx0 = e.lx(31.95), fx1 = e.lx(26.9);
          const zf = board(kit, fx0, fx1, 3.3, 0.82, { mat: 'sign_white', tint: '#ece6d8', border: { mat: 'sign_red', tint: '#b03a30', w: 0.035 } });
          text(kit, "TONY'S BARBER SHOP", { x: (fx0 + fx1) / 2, y: 3.6, h: 0.26, t: 0.045, z: zf, align: 'center', mat: 'ez_ink', tint: '#2c4f86', serif: true, maxW: fx1 - fx0 - 0.5 });
          text(kit, '理髮 · HAIRCUT · SHAVE', { x: (fx0 + fx1) / 2, y: 3.4, h: 0.11, t: 0.02, z: zf, align: 'center', mat: 'ez_ink_red' });
          stripedAwning(kit, { x0: fx0 + 0.1, x1: fx1 - 0.1, y: 3.22, depth: 1.25, drop: 0.32, colors: ['#a83a30', '#ece6d8', '#2f4f86', '#ece6d8'], torn: [6], hang: [6] });
          barberPole(kit, e.lx(32.25), 1.55);
          text(kit, 'HOT TOWEL 50', { x: e.lx(28.8), y: 2.4, h: 0.13, t: 0.022, z: -0.2, align: 'center', mat: 'ez_ink_white' });
          kit.at({ x: e.lx(31.25), y: 1.6, z: -0.13, rz: -0.06 }, () => { kit.box({ x: 0, y: 0, z: 0, w: 0.42, h: 0.2, d: 0.01, mat: 'sign_white', tint: '#f0e8d8' }); text(kit, 'CLOSED', { x: 0, y: 0.05, h: 0.09, t: 0.016, mat: 'ez_ink_red', align: 'center', z: 0.006 }); });
          // jeweller: scissor gate across the smashed window, GOLD & SILVER fascia, street clock on a bracket
          const jx0 = e.lx(39.4), jx1 = e.lx(34.1);
          scissorGate(kit, jx0 + 0.05, jx1 - 0.05, BY + 0.05, BY + 3.0, 0.08);
          const zj = board(kit, jx0 - 0.1, jx1 + 0.1, 3.3, 0.82, { mat: 'sign_green', tint: GREEN, border: { mat: 'sign_yellow', tint: '#d8c48a', w: 0.03 } });
          text(kit, 'GOLD & SILVER', { x: (jx0 + jx1) / 2, y: 3.58, h: 0.28, t: 0.05, z: zj, align: 'center', mat: 'ez_ink_yellow', serif: true });
          text(kit, 'WATCH REPAIR · WE BUY GOLD', { x: (jx0 + jx1) / 2, y: 3.4, h: 0.1, t: 0.018, z: zj, align: 'center', mat: 'ez_ink_white' });
          streetClock(kit, e.lx(39.05), 4.3);
          for (let i = 0; i < 18; i++) { const x = kit.rnd(jx0 + 0.2, jx1 - 0.2), z = kit.rnd(0.2, 1.4), s = kit.rnd(0.05, 0.14); kit.upFace([[x, SW + 0.004, z], [x + s, SW + 0.004, z + kit.rnd(-0.05, 0.05)], [x + s * 0.3, SW + 0.004, z + s]], 'glass_dirty', null, {}); }
          // black iron fire escape over the barber (world x 28..34); its drop ladder lowered to the sidewalk (SP_E_ROOF)
          fireEscape(kit, { x: e.lx(31.0), floors: 4, groundH: 4.5, floorH: 3.4, bases: ctx.bases, width: 6.0, lowered: true });
          posterWall(kit, e.lx(32.6), e.lx(31.95), 0.9, 2.6, 0.03, 2, ['MISSING', null]);
          kit.wallLamp({ x: e.lx(33.2), y: BY + 2.85, on: false });
          streaks(kit, 0.2, 13.8, ctx.top - 0.4, 8, 0.004, [1.2, 3.0]);
          for (const op of ops.filter((o) => o.type === 'window' && o.y > 4)) hood(kit, op, STONE);
        },
      },
      {
        side: 'E', cols: [2.5, 6.5, 10.5, 13.5], win: { w: 0.9, h: 1.35, states: WIN_POOR, ac: 0.2, lintel: 'trim_stone' }, pipes: [0.4, 9.2], belts: false,
        ground: (e) => [
          sp(e, 19.4, 20.4, { y: BY + 0.02, h: 2.2, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#5f645c', step: false }),
          sp(e, 15.2, 16.1, { y: BY + 2.4, h: 0.5, type: 'vent' }),
          sp(e, 11.0, 12.4, { y: BY + 1.1, h: 1.3, type: 'window', state: 'boarded', frame: 'frame_dark' }),
        ],
        decor: (e, ops, ctx) => {
          kit.wallLamp({ x: e.lx(19.9), y: BY + 2.6, on: true, intensity: 2.4, range: 5, color: '#ffbf7a' });
          kit.box({ x: e.lx(17.4), y: BY + 1.2, z: 0.12, w: 0.5, h: 0.7, d: 0.24, mat: 'paint_metal', tint: '#7d8478' });   // meter box
          for (const [z, y] of [[13.5, 6.2], [21.0, 9.6]]) kit.windowAC(e.lx(z), y);
          streaks(kit, 0.2, 14.8, ctx.top - 0.3, 6, 0.004, [1.2, 3.0]);
          posterWall(kit, e.lx(22.8), e.lx(21.0), 0.8, 2.4, 0.02, 3, ['NO', 'KEEP OUT', null]);
          void ops;
        },
      },
    ],
  });

  // ---------------- E_S2 east corner offices (stone_office beige, 6F): faces N and E (coach-line ticket office)
  const BEIGE = '#d6c8ab', TRIM = '#e6dcc8';
  const chi = { w: 2.4, h: 1.85, sill: 0.8, mullions: [3, 1], lintel: false, frame: 'frame_dark', states: WIN_HIGH, ac: 0.08 };
  block(kit, {
    id: 'E_S2', x0: 43, x1: 52, z0: 9, z1: 34, floors: F(4.5, 6), parapet: 1.0,
    mat: 'concrete_wall', tint: BEIGE, groundMat: 'concrete_dirty', groundTint: '#a49b92', trim: 'trim_stone', trimTint: TRIM,
    cornice: { kind: 'stone', mat: 'trim_stone', tint: TRIM }, plinthMat: 'concrete_dirty', plinthTint: '#6c665f', plinthH: 0.7,
    win: chi,
    faces: [
      {
        side: 'N', cols: [2.25, 6.75], pilasters: [0.25, 4.5, 8.75], pipes: [8.85],
        ground: (e) => [
          sp(e, 43.6, 48.3, { y: BY + 0.6, h: 2.6, type: 'shop', state: 'glass', frame: 'trim_metal', kick: 'trim_metal', mullions: [2, 1], room: 1.6 }),
          sp(e, 48.7, 50.3, { y: BY + 0.02, h: 2.7, type: 'door', state: 'closed', door: 'glass_dirty', frame: 'trim_metal', step: false }),
          sp(e, 48.7, 50.3, { y: BY + 2.9, h: 0.55, type: 'window', state: 'dark', frame: 'trim_metal', sill: false }),
          sp(e, 50.7, 51.55, { y: BY + 1.0, h: 2.2, type: 'window', state: 'glass', frame: 'trim_metal' }),
        ],
        decor: (e, ops, ctx) => {
          const zf = board(kit, 0.25, 8.75, 3.55, 0.7, { mat: 'sign_blue', tint: '#3d5d8c', border: { mat: 'sign_white', tint: '#e2dccc', w: 0.025 } });
          text(kit, 'MIDSTATE COACH LINES', { x: 4.5, y: 3.8, h: 0.27, t: 0.045, z: zf, align: 'center', mat: 'ez_ink_white', maxW: 8.0 });
          text(kit, 'TICKETS · PARCELS · CHARTERS', { x: 4.5, y: 3.62, h: 0.1, t: 0.018, z: zf, align: 'center', mat: 'ez_ink_yellow' });
          // timetable boards + a LAST BUS notice in the window, the office's gilt lettering on the transom
          const w0 = e.lx(48.3);
          for (let i = 0; i < 3; i++) poster(kit, w0 + 0.3 + i * 1.5, 1.4, 1.1, 1.3, -0.2, { head: ['SCHEDULE', 'LAST BUS 5:40', 'NO SERVICE'][i], tint: ['#e8e2cc', '#f0d65a', '#e8e2cc'][i], headMat: i === 1 ? 'ez_ink_red' : 'ez_ink' });
          text(kit, 'OFFICE', { x: e.lx(49.5), y: BY + 3.04, h: 0.16, t: 0.025, z: -0.17, align: 'center', mat: 'ez_ink_yellow' });
          hBand(kit, 9, ops, BY + 4.3, 0.2, { mat: 'trim_stone', tint: TRIM, d: 0.08 });
          streaks(kit, 0.2, 8.8, ctx.top - 0.4, 6, 0.004, [1.5, 3.5]);
        },
      },
      {
        side: 'E', cols: [1.8, 5.4, 9.0, 12.6, 16.2, 19.8, 23.4], pilasters: [0.2, 7.2, 14.4, 21.6, 24.8], pipes: [10.8],
        mod: (f, k, op) => (f === 2 && k === 5 ? { ...op, banner: true } : op),
        ground: (e) => [
          sp(e, 9.6, 13.4, { y: BY + 0.6, h: 2.6, type: 'shop', state: 'broken', frame: 'trim_metal', kick: 'trim_metal', mullions: [2, 1], room: 1.6 }),
          sp(e, 16.0, 17.8, { y: BY + 0.02, h: 2.9, type: 'door', state: 'closed', door: 'ez_wood', doorTint: '#5a3e2a', window: true, step: false }),
          sp(e, 16.0, 17.8, { y: BY + 3.1, h: 0.75, type: 'window', state: 'dark', frame: 'trim_metal', sill: false, mullions: [3, 1] }),
          sp(e, 20.0, 21.6, { y: BY + 2.2, h: 1.3, type: 'window', state: 'dark', frame: 'frame_dark' }),
          sp(e, 23.0, 24.6, { y: BY + 2.2, h: 1.3, type: 'window', state: 'broken', frame: 'frame_dark' }),
          sp(e, 29.6, 30.6, { y: BY + 0.02, h: 2.2, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#6c6a62', step: false }),
          sp(e, 31.4, 33.0, { y: BY + 1.0, h: 1.5, type: 'window', state: 'boarded', frame: 'frame_dark' }),
        ],
        decor: (e, ops, ctx) => {
          // lobby entrance: granite surround, date stone, bronze name letters, lamps either side
          const dx0 = e.lx(17.8), dx1 = e.lx(16.0);
          for (const x of [dx0 - 0.25, dx1 + 0.25]) kit.box({ x, y: BY, z: 0.08, w: 0.5, h: 4.1, d: 0.16, mat: 'concrete_dirty', tint: '#7d7770' });
          kit.box({ x: (dx0 + dx1) / 2, y: BY + 3.95, z: 0.1, w: dx1 - dx0 + 1.2, h: 0.5, d: 0.2, mat: 'concrete_dirty', tint: '#7d7770' });
          text(kit, 'MIDSTATE BUILDING', { x: (dx0 + dx1) / 2, y: BY + 4.06, h: 0.2, t: 0.035, z: 0.204, align: 'center', mat: 'ez_ink_yellow', serif: true, maxW: dx1 - dx0 + 1.0 });
          text(kit, '1928', { x: (dx0 + dx1) / 2, y: BY + 4.62, h: 0.16, t: 0.03, z: 0.08, align: 'center', mat: 'trim_stone', tint: '#cfc4ae', serif: true });
          for (const x of [dx0 - 0.25, dx1 + 0.25]) kit.wallLamp({ x, y: BY + 3.1, on: x < dx0, intensity: 2.6, range: 5, color: '#ffc58a' });
          kit.at({ z: -0.2 }, () => searchMark(kit, (dx0 + dx1) / 2, BY + 1.5, 0.6, 'ez_ink_red', '10-05'));
          posterWall(kit, e.lx(15.6), e.lx(13.9), 0.7, 2.7, 0.03, 4, ['EVACUATE', 'MISSING', null]);
          posterWall(kit, e.lx(28.8), e.lx(26.6), 0.7, 2.7, 0.03, 4, ['QUARANTINE', null]);
          hBand(kit, 25, ops, BY + 4.3, 0.2, { mat: 'trim_stone', tint: TRIM, d: 0.08 });
          // a bedsheet banner hung from a 4F window: HELP 3 INSIDE
          const bn = ops.find((o) => o.banner);
          if (bn) kit.at({ x: bn.cx, y: bn.y - 0.1, z: 0.06 }, () => {
            kit.face([[-1.1, -2.6, 0.02], [1.15, -2.65, 0.05], [1.2, 0.0, 0.0], [-1.15, 0.02, 0.0]], 'ez_fabric', { tint: '#e2ddd0' });
            text(kit, 'HELP', { x: 0.0, y: -1.1, h: 0.62, t: 0.13, z: 0.04, align: 'center', mat: 'ez_ink_red', italic: 0.08, track: 1.0 });
            text(kit, '3 INSIDE', { x: 0.0, y: -2.05, h: 0.4, t: 0.08, z: 0.045, align: 'center', mat: 'ez_ink_red', italic: 0.08, track: 1.0 });
          });
          streaks(kit, 0.2, 24.8, ctx.top - 0.4, 12, 0.004, [1.5, 3.5]);
        },
      },
      { side: 'W', span: [9, 24], cols: [2.5, 6.5, 10.5, 13.5], win: { w: 1.0, h: 1.4, mullions: [1, 2], states: WIN_POOR, ac: 0.15, sill: 0.9 }, pipes: [2.0], belts: false,
        ground: (e) => [sp(e, 12.6, 13.6, { y: BY + 0.02, h: 2.2, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#666b62', step: false }), sp(e, 18.6, 19.8, { y: BY + 2.3, h: 0.6, type: 'vent' })],
        decor: (e) => { kit.wallLamp({ x: e.lx(13.1), y: BY + 2.6, on: false }); streaks(kit, 0.2, 14.8, 21.2, 6, 0.004, [1.2, 3.0]); } },
      { side: 'W', span: [24, 34], from: BY + 16.8, cols: [3.0, 7.0], win: { w: 1.0, h: 1.4, mullions: [1, 2], ac: 0 }, belts: false, plinth: false, room: 0.8 },
      { side: 'S', from: BY + 16.8, cols: [2.5, 6.5], win: { w: 1.0, h: 1.4, mullions: [1, 2], ac: 0 }, belts: false, plinth: false, room: 0.8 },
    ],
    extra: (ctx) => {
      // rooftop: elevator penthouse + a wooden water tank on steel legs (silhouette over the T)
      kit.at({ x: 46.5, y: ctx.top, z: 28.5 }, () => {
        kit.box({ x: 0, y: 0, z: 0, w: 3.2, h: 2.8, d: 3.0, mat: 'concrete_wall', tint: '#b9ae98', faces: { bottom: false } });
        kit.box({ x: 0, y: 2.8, z: 0, w: 3.4, h: 0.18, d: 3.2, mat: 'trim_concrete' });
        kit.box({ x: 0.5, y: 0, z: -1.51, w: 0.95, h: 2.1, d: 0.04, mat: 'metal_painted', tint: '#6b6f66' });
      });
      kit.colBox({ x: 46.5, y: ctx.top, z: 28.5, w: 3.2, h: 2.8, d: 3.0 }, 'concrete');
      waterTank(kit, [48.2, 18.5], ctx.top + 0.02, 1.5, 3.0);
    },
  });
}
/** Stone lintel + keystone over a window (wall-local). */
function hood(kit, op, tint) {
  const x = op.cx ?? op.x + op.w / 2, top = op.y + op.h, w = op.w;
  kit.box({ x, y: top + 0.04, z: 0.05, w: w + 0.36, h: 0.16, d: 0.1, mat: 'trim_stone', tint, faces: { nz: false } });
  kit.at({ x, y: top + 0.02, z: 0.07 }, () => kit.hull([[-0.11, 0.24, -0.06], [0.11, 0.24, -0.06], [-0.07, -0.02, -0.06], [0.07, -0.02, -0.06], [-0.11, 0.24, 0.05], [0.11, 0.24, 0.05], [-0.07, -0.02, 0.05], [0.07, -0.02, 0.05]], 'trim_stone', { tint }));
}
/** Horizontal strip pieces at height y avoiding openings (string course between the shop bays). */
function hBand(kit, L, ops, y, h, o) {
  const cuts = ops.filter((op) => op.y - 0.02 < y + h && op.y + op.h + 0.02 > y).map((op) => { const x0 = op.x ?? op.cx - op.w / 2; return [x0 - 0.03, x0 + op.w + 0.03]; }).sort((p, q) => p[0] - q[0]);
  let x = 0;
  for (const [c0, c1] of [...cuts, [L, L]]) {
    if (c0 - x > 0.06) kit.box({ x: (x + c0) / 2, y, z: (o.d ?? 0.02) / 2, w: c0 - x, h, d: o.d ?? 0.02, mat: o.mat, tint: o.tint, faces: { nz: false } });
    x = Math.max(x, c1);
  }
}
/** Barber pole (wall-local x, y bottom): white tube with red / blue helix on a bracket, chrome caps. */
function barberPole(kit, x, y) {
  kit.box({ x, y: y + 0.4, z: 0.08, w: 0.08, h: 0.1, d: 0.16, mat: 'steel' });
  kit.cyl({ x, y, z: 0.22, r: 0.09, h: 0.9, seg: 12, mat: 'sign_white', tint: '#efece4' });
  for (const [k, tint] of [[0, '#b8302a'], [1, '#2f4f8a']]) {
    const pts = [];
    for (let i = 0; i <= 18; i++) { const t = i / 18, a = t * PI * 4 + k * PI; pts.push([x + Math.cos(a) * 0.092, y + 0.05 + t * 0.8, 0.22 - Math.sin(a) * 0.092]); }
    kit.sweep(circle(0.022, 4), pts, 'sign_red', { smooth: true, tint, up: [1, 0, 0] });
  }
  for (const yy of [y - 0.08, y + 0.9]) kit.cyl({ x, y: yy, z: 0.22, r: 0.11, h: 0.08, seg: 12, mat: 'car_chrome', tint: '#b8b4a8' });
}
/** Double-faced street clock on a wall bracket (wall-local x, y = clock centre). */
function streetClock(kit, x, y) {
  kit.sweep(circle(0.025, 6), [[x, y + 0.5, 0.02], [x, y + 0.5, 0.75], [x, y + 0.38, 0.75]], 'steel_dark', { smooth: true, tint: '#3d3c38' });
  kit.box({ x, y: y + 0.45, z: 0.06, w: 0.18, h: 0.18, d: 0.08, mat: 'steel_dark', tint: '#3d3c38' });
  kit.at({ x, y, z: 0.75, rot: PI / 2 }, () => {
    kit.cyl({ x: 0, y: 0, z: 0, r: 0.36, h: 0.16, seg: 18, mat: 'steel_dark', tint: '#2e3a30', rx: PI / 2 });
    for (const s of [-1, 1]) kit.at({ z: s * 0.082, rot: s > 0 ? 0 : PI }, () => {
      kit.face(circle(0.3, 18).map(([a, b]) => [a, b, 0]), 'sign_white', { tint: '#e8e2cc' });
      for (let i = 0; i < 12; i++) { const a = (i / 12) * PI * 2; strip(kit, [Math.cos(a) * 0.24, Math.sin(a) * 0.24], [Math.cos(a) * 0.28, Math.sin(a) * 0.28], 0.025, 0.002, 'ez_ink'); }
      strip(kit, [0, 0], [0.12, 0.1], 0.025, 0.003, 'ez_ink');   // 10:10, stopped
      strip(kit, [0, 0], [-0.17, 0.12], 0.018, 0.003, 'ez_ink');
    });
  });
}
/** Wooden rooftop water tank on a steel stand (silhouette). */
function waterTank(kit, at, y, r = 1.4, h = 2.6) {
  kit.waterTower({ at, y, h: 2.2, r, tankH: h, mat: 'wood_planks', tint: '#a08a72' });
  for (let i = 0; i < 3; i++) {
    const yy = y + 2.2 + 0.4 + i * (h / 3), ring = circle(r + 0.02, 18).map(([x, z]) => [at[0] + x, yy, at[1] - z]);
    kit.sweep([[-0.015, -0.025], [0.015, -0.025], [0.015, 0.025], [-0.015, 0.025]], [...ring, ring[0]], 'steel_dark', { tint: '#4b4540' });
  }
}

// ==================================================================================================== alley AL_SE
// x 40..43, z 9..24 between E_S1 and E_S2: chain-link fence across at z 17 (E_FENCE_AL_1/2) torn open at x 40.9..42.1;
// the bent flap + a pallet narrow the opening to 0.64 m around the nav cell centre x 41.75 (players cannot pass);
// pocket z 17..24 closed by the back wall of the block-interior building (SP_E_AL spawns here).
function alley(kit, L) {
  const fz = 17.0, g0 = 41.44, g1 = 42.06;
  kit.fence([[40.0, fz], [40.9, fz]], { kind: 'chainlink', h: 2.4, barbed: true, y: SW });
  kit.fence([[42.1, fz], [43.0, fz]], { kind: 'chainlink', h: 2.4, barbed: true, y: SW });
  // torn flap peeled back from the post at x 40.9 towards the pocket (still blocks x 40.9..41.43)
  kit.at({ x: 40.9, y: SW, z: fz, rot: -0.55 }, () => kit.face([[0, 0.06, 0], [0.62, 0.2, 0], [0.66, 1.75, 0], [0, 2.3, 0]], 'chainlink', { uvs: [[0, 0.06], [0.62, 0.2], [0.66, 1.75], [0, 2.3]] }));
  kit.colBox({ x: (40.0 + g0) / 2, y: SW, z: fz, w: g0 - 40.0, h: 2.4, d: 0.6 }, 'metal');   // flap + fence: 0.6 m deep throat
  kit.at({ x: g1 + 0.02, y: SW, z: fz - 0.08, rot: PI / 2 + 0.05, rz: -0.12 }, () => pallet(kit));
  kit.colBox({ x: (g1 + 43.0) / 2, y: SW, z: fz, w: 43.0 - g1, h: 2.4, d: 0.6 }, 'wood');
  // the mesh above the tear (rolled up at 1.95 m) + top rail over the gap
  kit.face([[40.9, SW + 1.95, fz], [42.1, SW + 1.95, fz], [42.1, SW + 2.35, fz], [40.9, SW + 2.35, fz]], 'chainlink', { uvs: [[0, 1.95], [1.2, 1.95], [1.2, 2.35], [0, 2.35]] });
  kit.sweep(circle(0.03, 6), [[40.9, SW + 1.93, fz], [41.5, SW + 1.88, fz + 0.05], [42.1, SW + 1.95, fz]], 'chainlink', { smooth: true });
  kit.colBox({ x: 41.5, y: SW + 1.95, z: fz, w: 1.2, h: 0.45, d: 0.06 }, 'metal');
  for (const x of [40.9, 42.1]) kit.cyl({ x, y: SW, z: fz, r: 0.032, h: 2.45, seg: 6, mat: 'steel', tint: '#9a9da0' });
  void L;
  // dumpster against the east wall near the mouth, trash, pallets, crates; a mattress leaning on the wall
  dumpster(kit, [42.45, 11.3], PI / 2, SW);
  trashPile(kit, [40.6, 13.8], SW, 4);
  trashPile(kit, [42.3, 15.6], SW, 3);
  trashPile(kit, [41.0, 22.8], SW, 4);
  trashPile(kit, [42.4, 19.4], SW, 2);
  kit.at({ x: 40.12, y: SW, z: 20.2, rot: -PI / 2, rx: -0.18 }, () => kit.bbox({ x: 0, y: 0, z: 0.1, w: 1.4, h: 1.9, d: 0.2, bevel: 0.06, mat: 'ez_fabric', tint: '#b8ab92' }));
  kit.prop('barrel_03', { at: [42.5, 23.3], y: SW, rot: 0.3 });
  kit.prop('cardboard_box_01', { at: [40.5, 18.3], y: SW, rot: 0.6, collide: false });
  kit.prop('wooden_crate_02', { at: [42.55, 21.6], y: SW, rot: 0.1 });
  // laundry lines strung across the alley between the fire-escape storeys (clothes catch the light from the street)
  for (const [z, y] of [[12.8, 8.9], [20.5, 12.2]]) {
    kit.wire([40.0, y, z], [43.0, y + 0.1, z], { sag: 0.35, r: 0.006 });
    for (let i = 0; i < 5; i++) {
      const t = 0.18 + i * 0.16, x = lerp(40.0, 43.0, t), yy = y - 0.35 * 4 * t * (1 - t) + t * 0.1;
      const w = kit.rnd(0.3, 0.55), h = kit.rnd(0.4, 0.75);
      kit.face([[x - w / 2, yy - h, z + 0.03], [x + w / 2, yy - h + 0.03, z - 0.02], [x + w / 2, yy, z], [x - w / 2, yy, z]], 'ez_fabric', { tint: kit.pick(['#d8d2c4', '#7a8fb0', '#a8544a', '#e0c890', '#8a9a7c']) });
    }
  }
}

// ==================================================================================================== X_E1 warehouse
// NORTHERN MOVING & STORAGE 北方搬家倉儲: industrial red brick, 4 storeys (19 m + 1.4 m parapet), the end view of
// East Street. W face (x 66, local x = z + 12): south drive-in door z -5.5..-0.5 burst open (SP_E_DOCK: zombies
// come out of a dark loading bay through a torn scissor gate, gap 0.64 m at z -3.25), north door z 0.5..5.5 closed
// above the 1.1 m dock apron E_DOCK. Steel-sash windows, painted name band across the parapet, hoist beam, water tank.
const BAY = { x0: 66.35, x1: 73.0, z0: -5.9, z1: -0.1, y1: 5.4 };
function warehouse(kit, L) {
  const BRICK = '#dcbcaa', CONC = '#c4bcae';
  const dockP = L.PROPS.find((p) => p.id === 'E_DOCK');
  const ctx = block(kit, {
    id: 'X_E1', x0: 66, x1: 84, z0: -12, z1: 12, floors: [5.5, 4.5, 4.5, 4.5], parapet: 1.4, collide: false,
    mat: 'brick_red', tint: BRICK, trim: 'trim_concrete', trimTint: CONC, cornice: false, plinthMat: 'concrete_dirty', plinthTint: '#6f6b64', plinthH: 0.6,
    win: { w: 3.0, h: 2.4, sill: 1.0, lintel: 'trim_concrete', mullions: [5, 4], frame: 'frame_dark', states: { broken: 1 }, ac: 0, streak: 0.6 },
    faces: [
      {
        side: 'W', cols: [3, 9, 15, 21], pipes: [0.3, 23.7],
        mod: (f, k, op) => ({ ...op, state: 'broken', h: f === 3 ? 2.0 : op.h, sash: true, roomTint: '#2e2c29' }),
        ground: (e) => [
          sp(e, -10.0, -8.9, { y: BY + 0.02, h: 2.3, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#5b6a5e', window: true, step: false }),
          sp(e, -11.5, -10.4, { y: BY + 2.2, h: 1.2, type: 'window', state: 'dark', frame: 'frame_dark', mullions: [2, 2] }),
          sp(e, -8.2, -6.4, { y: BY + 2.2, h: 1.4, type: 'window', state: 'boarded', frame: 'frame_dark' }),
          sp(e, -5.5, -0.5, { y: BY + 0.02, h: 4.42, type: 'hole', room: 0, depth: 0.33 }),
          sp(e, 0.5, 5.5, { y: dockP.h, h: 3.9, type: 'garage', shutter: 1, shutterTint: '#7f8a84' }),
          sp(e, 7.4, 8.5, { y: BY + 0.02, h: 2.3, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#6a6d64', step: false }),
          sp(e, 9.2, 11.4, { y: BY + 2.2, h: 1.4, type: 'window', state: 'dark', frame: 'frame_dark', mullions: [3, 2] }),
        ],
        decor: (e, ops, cx) => warehouseFront(kit, e, ops, cx, dockP),
      },
      { side: 'S', from: BY + 18.1, cols: [], belts: false, plinth: false },
    ],
    extra: (c) => {
      waterTank(kit, [79.5, -5.5], c.top + 0.02, 1.7, 3.0);
      // rooftop stair house + a lattice radio mast
      kit.at({ x: 80.0, y: c.top, z: 6.0 }, () => {
        kit.box({ x: 0, y: 0, z: 0, w: 3.0, h: 2.8, d: 2.6, mat: 'brick_red', tint: '#b89a8a', faces: { bottom: false } });
        kit.box({ x: 0, y: 2.8, z: 0, w: 3.2, h: 0.16, d: 2.8, mat: 'trim_concrete' });
        kit.box({ x: -1.51, y: 0, z: 0.3, w: 0.04, h: 2.1, d: 0.95, mat: 'metal_painted', tint: '#5b6a5e' });
      });
      kit.colBox({ x: 80.0, y: c.top, z: 6.0, w: 3.0, h: 2.8, d: 2.6 }, 'concrete');
    },
  });
  // ---- collision: body with the loading bay cut out, lintel over the door, bay ceiling; burst shutter
  const top = ctx.top + 1.4;
  kit.colPrism([[66, -12], [84, -12], [84, 12], [66, 12], [66, -0.5], [66.35, -0.5], [66.35, BAY.z1], [BAY.x1, BAY.z1], [BAY.x1, BAY.z0], [66.35, BAY.z0], [66.35, -5.5], [66, -5.5]], BY, top, 'concrete');
  kit.colBox({ x: 66.175, y: BY + 4.44, z: -3.0, w: 0.35, h: top - (BY + 4.44), d: 5.0 }, 'concrete');
  kit.colBox({ x: (66.35 + BAY.x1) / 2, y: BAY.y1, z: (BAY.z0 + BAY.z1) / 2, w: BAY.x1 - 66.35, h: top - BAY.y1, d: BAY.z1 - BAY.z0 }, 'concrete');
  loadingBay(kit);
  dock(kit, dockP);
}
/** Facade decoration of the warehouse W face (wall-local frame: x = z + 12, +z = west, y world). */
function warehouseFront(kit, e, ops, ctx, dockP) {
  const zW = 0.0;
  // steel-sash panes (dirty / clear / missing) in every upper window
  for (const op of ops.filter((o) => o.sash)) sashPanes(kit, op, -0.205, 5, 4, op.fi === 1 ? 0.45 : 0.3);
  // painted name band across the top: NORTHERN MOVING & STORAGE / 北方搬家倉儲 · FIREPROOF STORAGE
  const b0 = 17.85, b1 = 20.4, z = zW + 0.008;
  flat(kit, rect2(0.35, b0, 23.65, b1), z, 'brick_painted', { tint: '#3e4a3f' });
  for (const yy of [b0 + 0.12, b1 - 0.22]) flat(kit, rect2(0.55, yy, 23.45, yy + 0.08), z + 0.002, 'brick_painted', { tint: '#d8cfb4' });
  text(kit, 'NORTHERN MOVING & STORAGE', { x: 12.0, y: 19.12, h: 0.9, t: 0.17, z: z + 0.003, align: 'center', mat: 'brick_painted', tint: '#e8dfc4', maxW: 22.4, track: 1.3 });
  text(kit, '北方搬家倉儲', { x: 7.6, y: 18.27, h: 0.58, t: 0.11, z: z + 0.003, align: 'center', mat: 'brick_painted', tint: '#e2b75a' });
  text(kit, 'FIREPROOF STORAGE · EST. 1921', { x: 16.2, y: 18.33, h: 0.34, t: 0.065, z: z + 0.003, align: 'center', mat: 'brick_painted', tint: '#d8cfb4' });
  peel(kit, 0.5, 4.0, b0 + 0.1, b1 - 0.1, z + 0.005, 2, '#b28f80');
  peel(kit, 20.5, 23.5, b0 + 0.1, b1 - 0.1, z + 0.005, 2, '#b28f80');
  // DOCK numbers, KEEP CLEAR, office sign, bollards with hazard bands, security lights, hoist beam with a chain block
  const dS = [e.lx(-5.5), e.lx(-0.5)], dN = [e.lx(0.5), e.lx(5.5)];
  text(kit, 'DOCK 1', { x: (dS[0] + dS[1]) / 2, y: 5.0, h: 0.42, t: 0.08, z: 0.012, align: 'center', mat: 'brick_painted', tint: '#ece6d6' });
  text(kit, 'DOCK 2', { x: (dN[0] + dN[1]) / 2, y: 5.2, h: 0.42, t: 0.08, z: 0.012, align: 'center', mat: 'brick_painted', tint: '#ece6d6' });
  text(kit, 'KEEP CLEAR · TRUCKS', { x: (dS[0] + dS[1]) / 2, y: 4.72, h: 0.13, t: 0.024, z: 0.012, align: 'center', mat: 'ez_ink_white' });
  const zo = board(kit, e.lx(-10.2), e.lx(-8.7), BY + 2.5, 0.32, { mat: 'sign_white', tint: '#dcd6c6', d: 0.03 });
  text(kit, 'OFFICE', { x: e.lx(-9.45), y: BY + 2.58, h: 0.16, t: 0.028, z: zo, align: 'center', mat: 'ez_ink' });
  for (const x of [dS[0] - 0.3, dS[1] + 0.3]) {
    kit.cyl({ x, y: 0.03, z: 0.38, r: 0.11, h: 1.05, seg: 10, mat: 'sign_yellow', tint: '#e0b83a', collide: 'metal' });
    for (const yy of [0.35, 0.7]) kit.cyl({ x, y: yy, z: 0.38, r: 0.112, h: 0.1, seg: 10, mat: 'frame_dark', caps: false });
    kit.cyl({ x, y: 1.08, z: 0.38, r: 0.12, r2: 0.04, h: 0.06, seg: 10, mat: 'sign_yellow', tint: '#e0b83a' });
  }
  for (const x of [(dS[0] + dS[1]) / 2, (dN[0] + dN[1]) / 2]) {
    kit.prop('security_light', { at: [x, 0.25], y: 5.75, rot: 0 });
    kit.light({ pos: [x, 5.6, 0.9], color: '#ffd8a8', intensity: 16, range: 12, radius: 0.15, decay: 1.6, name: 'dock_lamp' });
  }
  kit.wallLamp({ x: e.lx(-9.45), y: BY + 3.1, on: true, intensity: 2.6, range: 6, color: '#ffc27a' });
  const hx = (dN[0] + dN[1]) / 2;
  kit.beam([hx, 6.3, -0.1], [hx, 6.3, 1.6], { kind: 'I', h: 0.3, w: 0.16, t: 0.02, tint: '#3e3d39', up: [0, 1, 0] });
  kit.sweep(circle(0.016, 4), [[hx, 6.08, 1.4], [hx + 0.01, 5.0, 1.41]], 'ez_iron', { smooth: true, tint: '#6e6a62' });
  kit.bbox({ x: hx, y: 6.0, z: 1.4, w: 0.28, h: 0.24, d: 0.2, bevel: 0.03, mat: 'sign_yellow', tint: '#b89a3a' });
  kit.sweep(circle(0.02, 5), [[hx, 4.95, 1.4], [hx + 0.08, 4.85, 1.4], [hx + 0.05, 4.75, 1.4], [hx - 0.04, 4.8, 1.4]], 'steel', { smooth: true, tint: '#6e6a62' });
  // the burst drive-in door: shutter torn up and buckled, slats on the apron, the dark bay behind
  burstShutter(kit, dS[0], dS[1]);
  posterWall(kit, e.lx(-8.1), e.lx(-6.5), 0.8, 2.0, 0.02, 3, ['QUARANTINE', 'MISSING', null]);
  posterWall(kit, e.lx(5.9), e.lx(7.2), 0.8, 2.6, 0.02, 3, ['EVACUATE', null]);
  kit.at({ z: -0.15 }, () => searchMark(kit, e.lx(-9.45), BY + 1.25, 0.55, 'ez_ink_red', '10-07'));
  streaks(kit, 0.2, 23.8, ctx.top + 1.3, 14, 0.004, [1.5, 4.5]);
  streaks(kit, 0.2, 23.8, 5.6, 8, 0.004, [1.0, 2.5]);
  void dockP;
}
/** Burst roller shutter of DOCK 1 (wall-local x0..x1): curtain torn up to 2.45 m, the north end buckled outwards. */
function burstShutter(kit, x0, x1) {
  const y1 = BY + 4.44, zc = -0.15;
  kit.box({ x: (x0 + x1) / 2, y: y1 - 0.02, z: zc + 0.08, w: x1 - x0 + 0.12, h: 0.36, d: 0.3, mat: 'paint_metal', tint: '#6d746c' });
  const xb = x0 + (x1 - x0) * 0.68;
  kit.face([[x0 + 0.03, 2.45, zc], [xb, 2.45, zc], [xb, y1, zc], [x0 + 0.03, y1, zc]], 'metal_shutter', { tint: '#8a948c' });
  kit.face([[xb, 2.45, zc - 0.01], [x0 + 0.03, 2.45, zc - 0.01], [x0 + 0.03, y1, zc - 0.01], [xb, y1, zc - 0.01]], 'metal_shutter', { tint: '#5d635d' });
  kit.box({ x: (x0 + xb) / 2 + 0.05, y: 2.38, z: zc + 0.02, w: xb - x0 - 0.2, h: 0.07, d: 0.05, mat: 'steel_dark', rz: 0.04 });
  // buckled part: folded outwards in two creases, hanging down to 1.2 m
  kit.at({ x: (xb + x1) / 2, y: 3.35, z: zc }, () => {
    kit.face([[-(x1 - xb) / 2, 0, 0], [(x1 - xb) / 2 - 0.03, 0, 0], [(x1 - xb) / 2 - 0.03, y1 - 3.35, 0], [-(x1 - xb) / 2, y1 - 3.35, 0]], 'metal_shutter', { tint: '#8a948c' });
    kit.face([[-(x1 - xb) / 2, -1.05, 0.62], [(x1 - xb) / 2 - 0.05, -0.95, 0.55], [(x1 - xb) / 2 - 0.03, 0, 0], [-(x1 - xb) / 2, 0, 0]], 'metal_shutter', { tint: '#7f8981' });
    kit.face([[-(x1 - xb) / 2, 0, -0.01], [(x1 - xb) / 2 - 0.03, 0, -0.01], [(x1 - xb) / 2 - 0.05, -0.95, 0.54], [-(x1 - xb) / 2, -1.05, 0.61]], 'metal_shutter', { tint: '#555b55' });
    kit.face([[-(x1 - xb) / 2 + 0.1, -2.1, 0.32], [(x1 - xb) / 2 - 0.1, -1.95, 0.3], [(x1 - xb) / 2 - 0.05, -0.95, 0.55], [-(x1 - xb) / 2, -1.05, 0.62]], 'metal_shutter', { tint: '#7a847c' });
    kit.face([[-(x1 - xb) / 2, -1.05, 0.61], [(x1 - xb) / 2 - 0.05, -0.95, 0.54], [(x1 - xb) / 2 - 0.1, -1.95, 0.29], [-(x1 - xb) / 2 + 0.1, -2.1, 0.31]], 'metal_shutter', { tint: '#4e544e' });
  });
  kit.colBox({ x: (x0 + x1) / 2, y: 2.45, z: zc, w: x1 - x0, h: y1 - 2.45, d: 0.1 }, 'metal');
  kit.colBox({ x: (xb + x1) / 2, y: 1.25, z: zc + 0.3, w: x1 - xb, h: 1.2, d: 0.6 }, 'metal');
  // torn-off slats and a padlock lying on the apron
  for (let i = 0; i < 6; i++) kit.at({ x: kit.rnd(x0 + 0.4, x1 - 0.6), y: SW + 0.01, z: kit.rnd(0.5, 2.6), rot: kit.rnd(-0.5, 0.5), rz: kit.rnd(-0.05, 0.05) }, () => kit.box({ x: 0, y: 0, z: 0, w: kit.rnd(0.7, 1.9), h: 0.012, d: 0.09, mat: 'metal_shutter', tint: '#7e887f' }));
}
/** The dark loading bay behind DOCK 1 (world coords): floor, walls, ceiling beams, stacked moving boxes, a torn gate. */
function loadingBay(kit) {
  const { x0, x1, z0, z1, y1 } = BAY, y0 = SW;
  kit.ground(rect(66.0, -5.5, x0, -0.5), { y: y0 + 0.004, mat: 'interior_floor', keep: true });
  kit.ground(rect(x0, z0, x1, z1), { y: y0, mat: 'interior_floor', keep: true, tint: '#b8b2a8' });
  const wall = { tint: '#8c7468' };
  kit.face([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], 'brick_red', wall);                 // south wall, faces +z
  kit.face([[x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1]], 'brick_red', wall);                 // north wall, faces -z
  kit.face([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], 'brick_red', wall);                 // back wall, faces -x
  kit.face([[x0, y1, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1]], 'concrete_dirty', { tint: '#8d8780' });
  // inside of the facade around the opening (faces +x)
  for (const [za, zb, ya, yb] of [[z0, -5.5, y0, y1], [-0.5, z1, y0, y1], [-5.5, -0.5, BY + 4.44, y1]]) kit.face([[x0, ya, zb], [x0, ya, za], [x0, yb, za], [x0, yb, zb]], 'brick_red', wall);
  for (const x of [68.0, 70.2, 72.3]) kit.box({ x, y: y1 - 0.32, z: (z0 + z1) / 2, w: 0.16, h: 0.32, d: z1 - z0, mat: 'steel_dark', tint: '#3e3c38' });
  // stacked moving boxes + crates along both side walls, a wrapped piano on a dolly and a dead hoist at the back
  const box = (x, y, z, w, h, d, r, t) => kit.box({ x, y, z, w, h, d, rot: r, mat: 'sign_white', tint: t, collide: 'wood' });
  for (const [x, z, n] of [[67.5, -5.3, 3], [68.6, -5.25, 2], [70.0, -5.35, 4], [71.4, -5.2, 2], [67.8, -0.75, 2], [69.4, -0.7, 3], [71.2, -0.8, 1]]) {
    for (let k = 0; k < n; k++) box(x + kit.rnd(-0.08, 0.08), y0 + k * 0.52, z, 0.9, 0.5, 0.7, kit.rnd(-0.12, 0.12), kit.pick(['#a88452', '#b8925e', '#9c7a4a']));
    kit.box({ x, y: y0 + n * 0.52 - 0.02, z, w: 0.92, h: 0.022, d: 0.12, mat: 'sign_white', tint: '#d8cfa8' });
  }
  kit.at({ x: 72.1, y: y0, z: -2.0, rot: 0.15 }, () => {
    kit.bbox({ x: 0, y: 0.18, z: 0, w: 1.6, h: 1.35, d: 0.75, bevel: 0.08, mat: 'ez_fabric', tint: '#3e4c66' });
    kit.box({ x: 0, y: 0.02, z: 0, w: 1.4, h: 0.16, d: 0.6, mat: 'steel_dark' });
  });
  kit.colBox({ x: 72.1, y: y0, z: -2.0, w: 1.6, h: 1.55, d: 0.8, rot: 0.15 }, 'wood');
  kit.sweep(circle(0.016, 4), [[70.6, y1, -3.6], [70.62, y1 - 1.75, -3.58]], 'ez_iron', { smooth: true, tint: '#5e5a54' });
  kit.bbox({ x: 70.62, y: y1 - 1.95, z: -3.58, w: 0.22, h: 0.2, d: 0.16, bevel: 0.02, mat: 'ez_iron', tint: '#8a6a2a' });
  // back door with a dim red EXIT sign (the only light in the bay), a fluorescent fixture hanging off one chain
  kit.box({ x: x1 - 0.03, y: y0, z: -3.0, w: 0.05, h: 2.15, d: 1.0, mat: 'paint_metal', tint: '#4f5650' });
  kit.box({ x: x1 - 0.06, y: y0 + 2.35, z: -3.0, w: 0.06, h: 0.2, d: 0.42, mat: 'lamp_red' });
  kit.light({ pos: [x1 - 0.4, y0 + 2.3, -3.0], color: '#ff4a32', intensity: 1.4, range: 5, radius: 0.1, decay: 1.5, name: 'exit' });
  kit.light({ pos: [69.5, 3.4, -3.0], color: '#c2c0b8', intensity: 3.0, range: 8, radius: 0.6, decay: 1, name: 'fill' });
  kit.at({ x: 69.0, y: y1 - 0.6, z: -3.0, rz: 0.55 }, () => kit.box({ x: 0, y: -0.04, z: 0, w: 1.25, h: 0.07, d: 0.22, mat: 'steel', tint: '#a8a6a0' }));
  // the torn scissor gate inside the doorway: zombie gap z -3.57..-2.93 (nav cell centre z -3.25)
  kit.at({ x: 66.75, y: y0, z: -5.5, rot: -PI / 2 }, () => {
    scissorGate(kit, 0.02, 1.93, 0, 2.6, 0);
    scissorGate(kit, 2.57, 4.98, 0, 2.6, 0);
    kit.box({ x: 2.25, y: 2.45, z: 0, w: 0.7, h: 0.08, d: 0.06, mat: 'steel_dark', tint: '#5a5c5c' });
    kit.at({ x: 2.6, y: 0.0, z: 0.02, rot: 0.9 }, () => kit.box({ x: 0.35, y: 0.1, z: 0, w: 0.7, h: 1.6, d: 0.03, mat: 'steel_dark', tint: '#4d4f4f' }));
    kit.colBox({ x: 0.965, y: 0, z: 0, w: 1.93, h: 2.6, d: 0.1 }, 'metal');
    kit.colBox({ x: 3.785, y: 0, z: 0, w: 2.43, h: 2.6, d: 0.1 }, 'metal');
    // (no collision on the top rail over the gap: with the bay ceiling and roof above it, its two faces would push the
    // floor out of the nav baker's 4-layer column; nobody can jump 2.5 m anyway)
  });
}
/** Loading dock apron E_DOCK in front of DOCK 2: concrete platform with steel edge, rubber bumpers, steps, cargo. */
function dock(kit, p) {
  const x0 = p.x - p.w / 2, x1 = p.x + p.w / 2, z0 = p.z - p.d / 2, z1 = p.z + p.d / 2, top = p.h;
  kit.box({ x: p.x, y: SW, z: p.z, w: p.w, h: top - SW, d: p.d, mat: 'concrete_dirty', tint: '#a39b90', faces: { bottom: false, px: false }, grime: { y: 0, h: 1.0, k: 0.35 }, collide: 'concrete' });
  kit.solid(rect(x0, z0, x1, z1), SW, top);   // no sidewalk texels under the apron
  kit.box({ x: x0 + 0.03, y: top - 0.1, z: p.z, w: 0.06, h: 0.1, d: p.d, mat: 'steel_dark', tint: '#4a4844' });
  for (let i = 0; i < 10; i++) { const z = z0 + 0.3 + i * 0.6; kit.at({ x: x0 - 0.002, y: top - 0.3, z, rot: -PI / 2 }, () => kit.face([[-0.12, -0.18, 0], [0.12, -0.18, 0], [0.12, 0.18, 0], [-0.12, 0.18, 0]], i % 2 ? 'ez_ink' : 'ez_ink_yellow', { tint: i % 2 ? '#1a1a18' : undefined })); }
  for (const z of [z0 + 0.9, z1 - 0.9]) kit.box({ x: x0 - 0.09, y: top - 0.55, z, w: 0.18, h: 0.4, d: 0.32, mat: 'rubber', collide: 'dirt' });
  kit.stairs({ at: [p.x, SW, z1 + 1.2], rot: 0, rise: top - SW, run: 1.2, width: 1.25, mat: 'trim_concrete', rail: true });
  // moving cargo left on the dock: a blanket-wrapped sofa, wardrobe boxes, a hand truck
  kit.at({ x: 65.45, y: top, z: 2.0, rot: 0.08 }, () => kit.bbox({ x: 0, y: 0, z: 0, w: 0.85, h: 0.85, d: 2.1, bevel: 0.1, mat: 'ez_fabric', tint: '#4b5f86' }));
  for (const [z, h] of [[3.6, 1.25], [4.35, 1.25]]) kit.box({ x: 65.45, y: top, z, w: 0.6, h, d: 0.6, rot: 0.05, mat: 'sign_white', tint: '#b08c58' });
  kit.at({ x: 65.4, y: top, z: 3.6 }, () => text(kit, 'NM&S', { x: 0, y: 0.6, h: 0.12, t: 0.022, z: 0, align: 'center', mat: 'ez_ink', tint: '#2a3a2c' }));
  kit.at({ x: 65.3, y: top, z: 5.6, rot: 0.4, rz: 0.25 }, () => {
    for (const s of [-0.2, 0.2]) kit.box({ x: 0, y: 0, z: s, w: 0.04, h: 1.3, d: 0.04, mat: 'steel', tint: '#c03a2c' });
    kit.box({ x: 0.15, y: 0, z: 0, w: 0.3, h: 0.02, d: 0.42, mat: 'steel_dark' });
  });
  kit.colBox({ x: 65.45, y: top, z: 3.0, w: 0.9, h: 1.25, d: 4.2 }, 'wood');
}

// ==================================================================================================== east row
function eastRow(kit, L) {
  void L;
  // ---------------- X_E2 machine-shop flats (brick_dark, 6F): W face on the cross street (z -34..-12)
  block(kit, {
    id: 'X_E2', x0: 66, x1: 84, z0: -34, z1: -12, floors: F(4.5, 6), parapet: 0.9,
    mat: 'brick_dark', tint: '#c9bbb0', groundMat: 'concrete_wall', groundTint: '#b2aa9c', trim: 'trim_stone', trimTint: '#b0a898',
    cornice: { kind: 'simple', mat: 'trim_concrete', tint: '#958f84' }, plinthMat: 'concrete_dirty', plinthTint: '#5e5a54',
    win: { w: 1.1, h: 1.7, sill: 0.9, lintel: 'trim_stone', states: WIN_POOR, ac: 0.14 },
    faces: [
      {
        side: 'W', cols: [1.6, 4.4, 7.2, 10.0, 12.8, 15.6, 18.4, 21.0], pipes: [0.25, 21.8], lit: [[3, 5], [4, 2]],
        ground: (e) => [
          sp(e, -32.6, -31.6, { y: BY + 0.02, h: 2.2, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#555a54', step: false }),
          sp(e, -30.4, -28.9, { y: BY + 1.0, h: 1.5, type: 'window', state: 'boarded', frame: 'frame_dark' }),
          sp(e, -25.0, -21.4, { y: BY + 0.02, h: 3.2, type: 'garage', shutter: 1, shutterTint: '#7c847e' }),
          sp(e, -20.6, -19.5, { y: BY + 0.02, h: 2.5, type: 'door', state: 'closed', door: 'ez_wood', doorTint: '#5e4330', window: true, step: false }),
          sp(e, -18.8, -13.4, { y: BY + 0.02, h: 3.05, type: 'shop', state: 'broken', frame: 'frame_dark', kick: 'trim_metal', room: 1.6 }),
        ],
        decor: (e, ops, ctx) => {
          const g = [e.lx(-25.0), e.lx(-21.4)];
          const zf = board(kit, g[0] - 0.2, e.lx(-13.2), 3.45, 0.8, { mat: 'sign_white', tint: '#cfc8b4', border: { mat: 'sign_red', tint: '#8f3a2c', w: 0.03 } });
          text(kit, 'WELDING · MACHINE SHOP', { x: (g[0] + e.lx(-13.2)) / 2, y: 3.68, h: 0.3, t: 0.055, z: zf, align: 'center', mat: 'ez_ink', maxW: 10.0 });
          text(kit, 'J. KOWALSKI & SONS · ESTIMATES FREE', { x: (g[0] + e.lx(-13.2)) / 2, y: 3.5, h: 0.1, t: 0.018, z: zf, align: 'center', mat: 'ez_ink_red' });
          text(kit, 'NO PARKING', { x: (g[0] + g[1]) / 2, y: 1.5, h: 0.22, t: 0.04, z: -0.12, align: 'center', mat: 'ez_ink_white', tint: '#e6e0d0' });
          posterWall(kit, e.lx(-18.6), e.lx(-13.6), 0.6, 2.8, -0.15, 3, ['MISSING', null]);
          kit.wallLamp({ x: e.lx(-20.05), y: BY + 2.75, on: true, intensity: 2.8, range: 6, color: '#ffbf7a' });
          kit.at({ z: -0.19 }, () => searchMark(kit, e.lx(-20.05), BY + 1.4, 0.55, 'ez_ink_red', '10-04'));
          posterWall(kit, e.lx(-30.6), e.lx(-28.6), 0.8, 2.6, 0.06, 3, ['QUARANTINE', 'KEEP OUT', null]);
          fireEscape(kit, { x: e.lx(-17.6), floors: 6, groundH: 4.5, floorH: 3.4, bases: ctx.bases, width: 4.4 });
          // soot above the burning car (the facade behind it has been scorched)
          streaks(kit, e.lx(-19.4), e.lx(-16.2), 3.0, 6, 0.006, [1.5, 3.5], { up: true, tint: '#14110e' });
          streaks(kit, 0.2, 21.8, ctx.top - 0.3, 12, 0.004, [1.5, 3.5]);
        },
      },
      { side: 'S', from: BY + 19.0, cols: [4, 9, 14], floors: [5, 5], win: { w: 1.0, h: 1.5, ac: 0 }, belts: false, plinth: false, room: 0.8 },
    ],
    extra: (ctx) => waterTank(kit, [76.0, -24.0], ctx.top + 0.02, 1.5, 2.8),
  });

  // ---------------- X_E3 tavern / auto parts (brick_commercial, 5F): W face on the cross street (z 12..34)
  const STONE = '#d4cab8';
  block(kit, {
    id: 'X_E3', x0: 66, x1: 84, z0: 12, z1: 34, floors: F(4.5, 5), parapet: 0.9,
    mat: 'brick_red', tint: '#d9c0b0', trim: 'trim_stone', trimTint: STONE, cornice: { kind: 'metal', mat: 'trim_metal', tint: '#4d4a44', bracket: 1.2 },
    win: { w: 1.2, h: 1.9, sill: 0.9, lintel: 'trim_stone', ac: 0.1, states: WIN_STATES },
    faces: [
      {
        side: 'W', cols: [1.5, 4.5, 7.5, 10.5, 13.5, 16.5, 19.5], pipes: [21.7], lit: [[1, 1], [3, 4]],
        ground: (e) => [
          sp(e, 12.6, 15.8, { y: BY + 0.5, h: 2.6, type: 'shop', state: 'glass', frame: 'trim_wood', kick: 'trim_wood', mullions: [2, 1], room: 1.8 }),
          sp(e, 16.2, 17.2, { y: BY + 0.02, h: 2.5, type: 'door', state: 'closed', door: 'ez_wood', doorTint: '#4f3424', window: true, frame: 'trim_wood', step: false }),
          sp(e, 17.6, 19.2, { y: BY + 1.0, h: 2.0, type: 'window', state: 'dark', frame: 'trim_wood', mullions: [2, 2] }),
          sp(e, 20.2, 25.6, { y: BY + 0.02, h: 3.1, type: 'shop', state: 'shutter', frame: 'frame_dark', shutterTint: '#9a958a' }),
          sp(e, 28.0, 29.0, { y: BY + 0.02, h: 2.2, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#5a5852', step: false }),
          sp(e, 31.0, 33.0, { y: BY + 1.0, h: 1.5, type: 'window', state: 'boarded', frame: 'frame_dark' }),
        ],
        decor: (e, ops, ctx) => {
          // RAILWAY TAVERN: dark-green fascia with gilt letters, BAR neon blade still glowing red, beer sign in the window
          const t0 = e.lx(12.4), t1 = e.lx(19.4);
          const zf = board(kit, t0, t1, 3.3, 0.85, { mat: 'sign_green', tint: '#2f5640', border: { mat: 'sign_yellow', tint: '#cbb26a', w: 0.03 } });
          text(kit, 'RAILWAY TAVERN', { x: (t0 + t1) / 2, y: 3.56, h: 0.32, t: 0.055, z: zf, align: 'center', mat: 'ez_ink_yellow', serif: true, maxW: t1 - t0 - 0.4 });
          text(kit, 'COLD BEER · FREE LUNCH', { x: (t0 + t1) / 2, y: 3.38, h: 0.1, t: 0.018, z: zf, align: 'center', mat: 'ez_ink_white' });
          kit.at({ x: t0 + 0.55, y: 0, z: 0 }, () => {
            for (const yy of [4.75, 7.95]) kit.box({ x: 0, y: yy, z: 0.5, w: 0.06, h: 0.07, d: 1.0, mat: 'steel_dark' });
            kit.bbox({ x: 0, y: 4.55, z: 0.68, w: 0.22, h: 3.6, d: 0.78, bevel: 0.03, mat: 'sign_red', tint: '#3a2a26' });
            for (const s of [-1, 1]) kit.at({ x: s * 0.112, z: 0.68, rot: s * PI / 2 }, () => {
              vtext(kit, 'BAR', { x: 0, yTop: 7.85, h: 0.8, t: 0.09, mat: 'lamp_red', z: 0.03, lead: 1.25 });
              for (const [yy] of [[4.75], [7.95]]) kit.face([[-0.3, yy - 0.02, 0.002], [0.3, yy - 0.02, 0.002], [0.3, yy + 0.02, 0.002], [-0.3, yy + 0.02, 0.002]], 'lamp_off', {});
            });
          });
          kit.light({ pos: [t0 + 0.55, 6.2, 1.4], color: '#ff4030', intensity: 3.2, range: 6, radius: 0.3, decay: 1.5, name: 'neon' });
          text(kit, 'ALE', { x: e.lx(14.2), y: 2.2, h: 0.32, t: 0.045, z: -0.2, align: 'center', mat: 'lamp_amber', serif: true });
          // AUTO PARTS · TIRES over the shutter, tyre stack outside
          const a0 = e.lx(20.0), a1 = e.lx(25.8);
          const za = board(kit, a0, a1, 3.3, 0.85, { mat: 'sign_yellow', tint: '#d8a62e', border: { mat: 'frame_dark', w: 0.03 } });
          text(kit, 'AUTO PARTS · TIRES', { x: (a0 + a1) / 2, y: 3.58, h: 0.3, t: 0.055, z: za, align: 'center', mat: 'ez_ink', maxW: a1 - a0 - 0.4 });
          text(kit, 'BATTERIES · BRAKES · MUFFLERS', { x: (a0 + a1) / 2, y: 3.4, h: 0.1, t: 0.018, z: za, align: 'center', mat: 'ez_ink_red' });
          text(kit, 'CLOSED', { x: (a0 + a1) / 2, y: 1.4, h: 0.38, t: 0.07, z: -0.04, align: 'center', mat: 'ez_ink_red', italic: 0.2 });
          kit.wallLamp({ x: e.lx(16.7), y: BY + 2.8, on: false });
          posterWall(kit, e.lx(27.6), e.lx(25.9), 0.7, 2.6, 0.03, 3, ['MISSING', 'CURFEW 6 PM', null]);
          for (const op of ops.filter((o) => o.type === 'window' && o.y > 4)) hood(kit, op, STONE);
          streaks(kit, 0.2, 21.8, ctx.top - 0.4, 10, 0.004, [1.5, 3.5]);
        },
      },
    ],
  });
}

// ==================================================================================================== block-interior fills
// Plain masses that close the block interiors inside the zone at about the neighbours' heights: only the faces that
// show above a lower neighbour (or close a spawn pocket) are built. Pocket end walls: F_N2 (z -34) and F_S3 (z 34).
function fills(kit) {
  const party = (o) => ({ cols: [], belts: false, plinth: false, room: 0.8, win: { w: 1.0, h: 1.45, ac: 0.06, states: WIN_POOR }, ...o });
  // F_N1 behind E_N1 (x 26..40, z -40..-24): same height as N_E1 next door (28.3 m), hides its east wall
  block(kit, {
    id: 'F_N1', x0: 26, x1: 40, z0: -40, z1: -24, floors: F(4.5, 8), parapet: 0.9, mat: 'brick_dark', tint: '#b6a89d', trim: 'trim_concrete', trimTint: '#99938a',
    cornice: { kind: 'simple', mat: 'trim_concrete', tint: '#8f897f' }, win: { w: 1.0, h: 1.45, sill: 0.9, ac: 0.06, states: WIN_POOR },
    faces: [
      party({ side: 'S', from: BY + 24.9, cols: [2.5, 6.0, 9.5, 12.5], floors: [7, 7] }),
      party({ side: 'E', from: BY + 18.1, cols: [2.0, 5.0, 8.5, 11.5, 14.5], floors: [5, 7] }),
      party({ side: 'N', from: BY + 18.0, cols: [3.0, 7.0, 11.0], floors: [5, 7] }),
    ],
    extra: (c) => waterTank(kit, [30.5, -33.5], c.top + 0.02, 1.6, 3.0),
  });
  // F_N3 behind E_N2 (x 40..52, z -40..-34), 20 m
  block(kit, {
    id: 'F_N3', x0: 40, x1: 52, z0: -40, z1: -34, floors: [4.6, 3.85, 3.85, 3.85, 3.85], parapet: 0.8, mat: 'brick_red', tint: '#bfa293', trim: 'trim_concrete', trimTint: '#a59e92', cornice: false,
    win: { w: 1.0, h: 1.45, sill: 0.9, ac: 0.05, states: WIN_POOR },
    faces: [party({ side: 'S', from: BY + 18.1, cols: [2.5, 6.0, 9.5], floors: [4, 4] }), party({ side: 'E', from: BY + 14.7, cols: [3.0], floors: [4, 4] }), party({ side: 'N', from: BY + 16.0, cols: [3.0, 9.0], floors: [4, 4] })],
  });
  // F_N2: north pocket end wall (x 52..66, z -40..-34): an old garage block, 4 storeys
  block(kit, {
    id: 'F_N2', x0: 52, x1: 66, z0: -40, z1: -34, floors: F(4.5, 4), parapet: 0.8, mat: 'brick_red', tint: '#b99a8c', groundMat: 'concrete_wall', groundTint: '#9e968a',
    trim: 'trim_concrete', trimTint: '#a39c90', cornice: { kind: 'simple', mat: 'trim_concrete', tint: '#8f897f' },
    win: { w: 1.1, h: 1.6, sill: 0.9, lintel: 'trim_concrete', ac: 0.05, states: WIN_POOR },
    faces: [{
      side: 'S', cols: [1.5, 4.3, 7.1, 9.9, 12.5], pipes: [13.8],
      ground: (e) => [
        sp(e, 52.8, 57.6, { y: BY + 0.02, h: 3.3, type: 'garage', shutter: 1, shutterTint: '#7a7f78' }),
        sp(e, 58.4, 59.4, { y: BY + 0.02, h: 2.2, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#575c56', step: false }),
        sp(e, 60.4, 65.2, { y: BY + 0.02, h: 3.1, type: 'shop', state: 'boarded', frame: 'frame_dark' }),
      ],
      decor: (e, ops, ctx) => {
        const zf = board(kit, e.lx(52.6), e.lx(65.4), 3.55, 0.7, { mat: 'sign_white', tint: '#b9b2a0', d: 0.08 });
        text(kit, 'FOUNDRY ST. GARAGE · REPAIRS', { x: (e.lx(52.6) + e.lx(65.4)) / 2, y: 3.78, h: 0.28, t: 0.05, z: zf, align: 'center', mat: 'ez_ink', maxW: 12.2, shade: 0.75 });
        posterWall(kit, e.lx(60.6), e.lx(65.0), 0.6, 2.8, 0.06, 6, ['QUARANTINE', 'MISSING', 'EVACUATE', null]);
        text(kit, 'DEAD END', { x: (e.lx(52.8) + e.lx(57.6)) / 2, y: 1.3, h: 0.5, t: 0.09, z: -0.155, align: 'center', mat: 'ez_ink_red', italic: 0.18, track: 1.0 });
        // caged work lamp over the garage door: the pocket's only light, zombies come out of it in silhouette
        kit.wallLamp({ x: (e.lx(52.8) + e.lx(57.6)) / 2, y: 4.25, on: true, intensity: 14, range: 14, color: '#ffc27a' });
        fireEscape(kit, { x: e.lx(55.0), floors: 4, groundH: 4.5, floorH: 3.4, bases: ctx.bases, width: 3.8 });
        streaks(kit, 0.2, 13.8, ctx.top - 0.3, 8, 0.004, [1.2, 3.0]);
        void ops;
      },
    }],
  });
  // F_N4 behind X_E2 (x 66..84, z -40..-34), 24.9 m
  block(kit, {
    id: 'F_N4', x0: 66, x1: 84, z0: -40, z1: -34, floors: F(4.5, 7), parapet: 0.9, mat: 'concrete_wall', tint: '#a8a194', trim: 'trim_concrete', trimTint: '#99938a', cornice: false,
    win: { w: 1.2, h: 1.5, sill: 0.9, ac: 0.05, states: WIN_POOR },
    faces: [party({ side: 'S', from: BY + 21.5, cols: [3, 7, 11, 15], floors: [6, 6] }), party({ side: 'W', from: BY + 14.7, cols: [1.5, 4.5], floors: [4, 6] })],
  });
  // F_S1 behind E_S1 (x 26..43, z 24..40), 16.8 m; its N face closes the alley pocket (x 40..43) at full height
  block(kit, {
    id: 'F_S1', x0: 26, x1: 43, z0: 24, z1: 40, floors: [4.5, 3.1, 3.1, 3.1, 3.0], parapet: 0.8, mat: 'brick_dark', tint: '#b9aca2', groundMat: 'concrete_wall', groundTint: '#a39b8e',
    trim: 'trim_concrete', trimTint: '#99938a', cornice: false, win: { w: 1.0, h: 1.4, sill: 0.9, ac: 0.1, states: WIN_POOR },
    faces: [
      party({ side: 'N', span: [26, 40], from: BY + 14.7, cols: [2.5, 6.5, 10.5], floors: [4, 4], win: { w: 1.0, h: 1.4, sill: 1.0, ac: 0.05, states: WIN_POOR } }),
      {
        side: 'N', span: [40, 43], cols: [1.5], pipes: [0.25], win: { w: 0.9, h: 1.2, states: WIN_POOR, ac: 0.3 }, belts: false,
        ground: (e) => [sp(e, 41.0, 42.0, { y: BY + 0.02, h: 2.2, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#4f544e', step: false })],
        decor: (e) => {
          kit.bulb([e.lx(41.5), 2.75, 0.45], { cord: 0.25, on: true, intensity: 1.6, range: 4, color: '#ffb468' });
          posterWall(kit, 0.1, 0.8, 0.9, 2.0, 0.02, 1, ['NO']);
          text(kit, 'STAFF ONLY', { x: e.lx(41.5), y: BY + 1.6, h: 0.1, t: 0.018, z: 0.06, align: 'center', mat: 'ez_ink_white' });
          streaks(kit, 0.1, 2.9, 16.5, 3, 0.004);
        },
      },
      party({ side: 'W', from: BY + 14.0, cols: [5, 11], floors: [4, 4] }),
    ],
  });
  // F_S2 behind E_S2 (x 43..52, z 34..40)
  block(kit, {
    id: 'F_S2', x0: 43, x1: 52, z0: 34, z1: 40, floors: [4.5, 3.1, 3.1, 3.1, 3.0], parapet: 0.8, mat: 'brick_red', tint: '#b8988a', trim: 'trim_concrete', trimTint: '#a39c90', cornice: false,
    win: { w: 1.0, h: 1.4, sill: 0.9, ac: 0.05, states: WIN_POOR },
    faces: [party({ side: 'E', from: BY + 14.7, cols: [3.0], floors: [4, 4] })],
  });
  // F_S3: south pocket end wall (x 52..66, z 34..40): COLD STORAGE depot, 4 storeys
  block(kit, {
    id: 'F_S3', x0: 52, x1: 66, z0: 34, z1: 40, floors: F(4.5, 4), parapet: 0.8, mat: 'brick_painted', tint: '#c7bca4', groundMat: 'concrete_wall', groundTint: '#a39b8e',
    trim: 'trim_concrete', trimTint: '#a39c90', cornice: { kind: 'simple', mat: 'trim_concrete', tint: '#8f897f' },
    win: { w: 1.1, h: 1.6, sill: 0.9, lintel: 'trim_concrete', ac: 0.04, states: WIN_POOR },
    faces: [{
      side: 'N', cols: [1.5, 4.3, 7.1, 9.9, 12.5], pipes: [0.25],
      mod: (f, k, op) => (f >= 2 && (k === 1 || k === 2 || k === 3) ? null : op),
      ground: (e) => [
        sp(e, 53.2, 57.8, { y: BY + 0.02, h: 3.4, type: 'garage', shutter: 1, shutterTint: '#8a8f86' }),
        sp(e, 59.0, 60.0, { y: BY + 0.02, h: 2.2, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#5c615a', step: false }),
        sp(e, 61.2, 64.8, { y: BY + 0.9, h: 1.6, type: 'window', state: 'boarded', frame: 'frame_dark' }),
      ],
      decor: (e, ops, ctx) => {
        // painted COLD STORAGE ghost sign between the upper windows, ICE stencilled over the door
        const gx0 = e.lx(63.5), gx1 = e.lx(54.5);
        flat(kit, rect2(gx0, 8.2, gx1, 13.6), 0.007, 'brick_painted', { tint: '#4f6a7c' });
        text(kit, 'COLD STORAGE', { x: (gx0 + gx1) / 2, y: 11.2, h: 1.1, t: 0.2, z: 0.009, align: 'center', mat: 'brick_painted', tint: '#e2dccb', maxW: gx1 - gx0 - 0.6 });
        text(kit, 'ICE · MEATS · PRODUCE', { x: (gx0 + gx1) / 2, y: 9.2, h: 0.55, t: 0.1, z: 0.009, align: 'center', mat: 'brick_painted', tint: '#d9d0b8', maxW: gx1 - gx0 - 0.8 });
        peel(kit, gx0, gx1, 8.2, 13.6, 0.011, 5, '#9c8070');
        posterWall(kit, e.lx(64.6), e.lx(61.4), 0.7, 2.8, 0.06, 5, ['QUARANTINE', 'MISSING', null]);
        kit.wallLamp({ x: (e.lx(53.2) + e.lx(57.8)) / 2, y: 4.3, on: true, intensity: 12, range: 13, color: '#dfe6ee' });
        streaks(kit, 0.2, 13.8, ctx.top - 0.3, 7, 0.004, [1.2, 3.0]);
        void ops;
      },
    }],
  });
  // F_S4 behind X_E3 (x 66..84, z 34..40), 20 m
  block(kit, {
    id: 'F_S4', x0: 66, x1: 84, z0: 34, z1: 40, floors: [4.6, 3.85, 3.85, 3.85, 3.85], parapet: 0.9, mat: 'brick_dark', tint: '#b3a69c', trim: 'trim_concrete', trimTint: '#99938a', cornice: false,
    win: { w: 1.0, h: 1.45, sill: 0.9, ac: 0.05, states: WIN_POOR },
    faces: [party({ side: 'N', from: BY + 18.1, cols: [3, 7.5, 12, 16], floors: [4, 4] }), party({ side: 'W', from: BY + 14.7, cols: [2.0, 4.5], floors: [4, 4] })],
  });
}

// ==================================================================================================== East Cross Street
// North barricade (z -26.4): police cars E_BARR_XN_1/2 with a zombie gap between them (x 58.9..60.2) and sawhorses on
// both sidewalks, backed by a 3.6 m quarantine fence at z -28.4 torn open at x 59.43..60.07 (nav cell x 59.75).
// South barricade (z 27.4): burnt city bus E_BARR_XS, gap behind its rear (x 63.75..65.2) + sawhorse, fence at z 29.4
// torn at x 63.93..64.57 (nav cell x 64.25). Pockets z -34..-28.4 / 29.4..34 (SP_E_XN / SP_E_XS). Burning car E_CAR_X.
function crossStreet(kit, L) {
  const P = Object.fromEntries(L.PROPS.filter((p) => p.zone === 'east').map((p) => [p.id, p]));
  // ---- north: police cars (box collision to the roof line so nobody climbs them), sawhorses, fence
  for (const [id, wreck] of [['E_BARR_XN_1', 0.02], ['E_BARR_XN_2', -0.015]]) {
    const c = P[id];
    kit.vehicle({ type: 'police', at: [c.x, c.z], rot: c.rot, state: 'wrecked', tilt: wreck, collide: false, color: '#2c3446' });
    kit.colBox({ x: c.x, y: 0.1, z: c.z, w: 4.7, h: 1.32, d: 1.8, rot: c.rot }, 'metal');
    kit.at({ x: c.x, y: 0, z: c.z, rot: c.rot }, () => {
      for (const s of [1, -1]) kit.at({ rot: s > 0 ? 0 : PI }, () => {
        text(kit, 'POLICE', { x: s * 0.2, y: 0.72, h: 0.13, t: 0.024, z: 0.912, align: 'center', mat: 'ez_ink', tint: '#1c2230' });
      });
    });
    for (let i = 0; i < 10; i++) { const x = c.x + kit.rnd(-2.6, 2.6), z = c.z + kit.rnd(-1.6, 1.6), s = kit.rnd(0.04, 0.12); kit.upFace([[x, 0.006, z], [x + s, 0.006, z + kit.rnd(-0.04, 0.04)], [x + s * 0.3, 0.006, z + s]], 'glass_dirty', null, {}); }
  }
  kit.plankBarricade({ at: [P.E_BARR_XN_3.x, P.E_BARR_XN_3.z], y: SW, rot: 0.04, w: P.E_BARR_XN_3.w, h: 1.1 });
  kit.plankBarricade({ at: [P.E_BARR_XN_4.x, P.E_BARR_XN_4.z], y: SW, rot: -0.05, w: P.E_BARR_XN_4.w, h: 1.1 });
  quarantineFence(kit, 52, 66, -28.4, [59.43, 60.07], -1);
  for (const [x, z, f] of [[57.4, -24.6, false], [58.2, -24.3, true], [61.0, -24.5, false], [55.6, -24.9, false], [63.9, -24.4, true]]) kit.cone([x, z], { fallen: f, y: x > 63 || x < 55 ? SW : 0 });
  kit.tape([[52.2, 1.0, -26.05], [54.3, 0.95, -26.1], [55.6, 1.05, -25.6]]);
  kit.tape([[61.0, 1.05, -25.4], [63.4, 1.0, -25.6], [65.8, 1.0, -26.0]]);
  coil(kit, [52.3, -27.9], [56.0, -27.7], SW);
  // north pocket: burnt-out car pushed against the end wall, rubble, trash, a toppled dumpster
  kit.vehicle({ type: 'sedan', at: [63.6, -31.4], rot: PI / 2 - 0.18, state: 'burnt', collide: true });
  kit.rubblePile([54.2, -33.0], { r: 1.2, h: 0.6, y: SW });
  trashPile(kit, [56.6, -33.2], 0, 4);
  trashPile(kit, [64.6, -29.6], SW, 3);
  dumpster(kit, [54.0, -30.6], 1.45, SW, true);
  kit.debris([59.0, -30.5], { r: 3.0, count: 16, kinds: ['paper', 'paper', 'plank', 'chunk', 'brick'] });

  // ---- south: burnt city bus (rear to the east), sawhorse, fence
  const bus = P.E_BARR_XS;
  kit.vehicle({ type: 'bus', at: [bus.x, bus.z], rot: PI, state: 'wrecked', color: '#9a9278', collide: false });
  // fire damage: soot-black rear third (scorched panels over the engine bay), melted rear lights, ash on the road
  kit.at({ x: bus.x, y: 0, z: bus.z, rot: PI }, () => {
    for (const s of [-1, 1]) kit.face(s > 0 ? [[-5.7, 0.45, 1.281], [-2.2, 0.45, 1.281], [-2.6, 1.12, 1.233], [-5.7, 1.12, 1.233]] : [[-2.2, 0.45, -1.281], [-5.7, 0.45, -1.281], [-5.7, 1.12, -1.233], [-2.6, 1.12, -1.233]], 'car_burnt', { tint: '#3a3430' });
    kit.face([[-5.775, 0.45, -1.15], [-5.775, 0.45, 1.15], [-5.775, 1.1, 1.1], [-5.775, 1.1, -1.1]].reverse(), 'car_burnt', { tint: '#2e2925' });
  });
  kit.decal({ at: [bus.x - 3.6, bus.z], size: [5.5, 4.2], rot: 0.1, mat: 'decal_stain', tint: '#2a2420' });
  kit.light({ pos: [58.0, 1.6, 24.0], color: '#cfc8bc', intensity: 6, decay: 1, range: 9, radius: 1.0, name: 'fill' });
  kit.colBox({ x: bus.x, y: 0.1, z: bus.z, w: 11.5, h: 2.95, d: 2.55 }, 'metal');
  kit.at({ x: bus.x, y: 0, z: bus.z, rot: PI }, () => {
    // route board box over the windscreen (burnt), soot over every window, a fallen roof hatch
    kit.box({ x: 5.55, y: 2.72, z: 0, w: 0.12, h: 0.3, d: 1.6, mat: 'car_burnt', tint: '#2a2622' });
    text(kit, '12', { x: 5.66, y: 2.78, h: 0.16, t: 0.03, z: 0, align: 'center', mat: 'ez_ink', tint: '#4a423a' });
  });
  kit.at({ x: bus.x - 2.0, y: 0.02, z: bus.z + 1.9, rot: 0.4 }, () => kit.box({ x: 0, y: 0, z: 0, w: 0.9, h: 0.04, d: 0.7, mat: 'car_burnt', tint: '#3a3632' }));
  kit.debris([bus.x, bus.z - 1.8], { r: 3.0, count: 14, kinds: ['chunk', 'paper', 'plank'] });
  kit.plankBarricade({ at: [P.E_BARR_XS_2.x, P.E_BARR_XS_2.z], y: SW, rot: 0.06, w: P.E_BARR_XS_2.w + 0.05, h: 1.1 });
  quarantineFence(kit, 52, 66, 29.4, [63.93, 64.57], 1);
  for (const [x, z, f] of [[62.3, 25.4, false], [61.4, 25.1, true], [54.0, 25.2, false]]) kit.cone([x, z], { fallen: f, y: x < 55 ? SW : 0 });
  kit.tape([[63.6, 1.0, 26.2], [64.6, 0.95, 26.0], [65.9, 1.0, 26.9]]);
  // south pocket: crates, a toppled newspaper box, rubble against the end wall
  kit.rubblePile([64.4, 33.0], { r: 1.0, h: 0.5, y: SW });
  trashPile(kit, [53.6, 32.6], SW, 4);
  trashPile(kit, [60.8, 33.0], 0, 3);
  kit.prop('wooden_crate_02', { at: [57.0, 32.8], rot: 0.2 });
  kit.prop('wooden_crate_02', { at: [57.6, 32.9], rot: 1.4 });
  kit.debris([59.0, 31.5], { r: 2.8, count: 14, kinds: ['paper', 'paper', 'plank', 'chunk'] });

  // ---- burning car E_CAR_X (L_FIRE_E comes from the layout): charred shell, glowing embers inside, scorch + ash
  const car = P.E_CAR_X;
  kit.vehicle({ type: 'sedan', at: [car.x, car.z], rot: car.rot, state: 'burnt', tilt: -0.02, collide: false });
  kit.colBox({ x: car.x, y: 0.1, z: car.z, w: 4.7, h: 1.32, d: 1.8, rot: car.rot }, 'metal');
  kit.decal({ at: [car.x, car.z], size: [6.4, 4.0], rot: car.rot, mat: 'decal_stain', tint: '#2a2420' });
  kit.decal({ at: [car.x + 0.6, car.z - 0.4], size: [4.4, 2.6], rot: car.rot + 0.3, mat: 'decal_stain', tint: '#1c1814' });
  kit.at({ x: car.x, y: 0, z: car.z, rot: car.rot }, () => {
    for (const [x, y, s] of [[0.3, 0.62, 0.55], [-0.6, 0.64, 0.45], [1.5, 0.7, 0.4], [-1.5, 0.62, 0.35]]) {
      const pts = [];
      for (let i = 0; i < 7; i++) { const a = (i / 7) * PI * 2; pts.push([x + Math.cos(a) * s * kit.rnd(0.6, 1.0), y, Math.sin(a) * s * kit.rnd(0.5, 0.9)]); }
      kit.upFace(pts, 'lamp_amber', null, {});
    }
    // low flame tongues licking out of the cabin (opaque emissive, kept small)
    for (const [x, z, h, r] of [[0.2, 0.15, 0.55, 0.3], [-0.5, -0.2, 0.45, -0.4], [0.7, -0.1, 0.35, 0.9], [-1.2, 0.1, 0.3, 1.6]]) kit.at({ x, y: 0.72, z, rot: r }, () => {
      for (const k of [0, PI / 2]) kit.at({ rot: k }, () => { const f = [[-0.14, 0, 0], [0.14, 0, 0], [0.03, h * 0.7, 0], [-0.02, h, 0], [-0.08, h * 0.6, 0]]; kit.face(f, 'lamp_amber', {}); kit.face(f.slice().reverse(), 'lamp_amber', {}); });
    });
  });
  kit.debris([car.x - 1.6, car.z + 1.4], { r: 1.6, count: 10, kinds: ['chunk', 'paper', 'plank'] });
  smokeColumn(kit, [car.x, 1.0, car.z], 22, L.ENV?.wind?.dirDeg ?? 60);
  kit.prop('old_tyre', { at: [car.x + 2.6, car.z - 1.9], rx: PI / 2 - 0.1, rot: 0.6, y: 0.01 });

  // ---- the T: street-name post, a dead signal mast over the cross street, a ONE WAY sign
  kit.at({ x: 53.9, y: SW, z: -6.9 }, () => {
    kit.cyl({ x: 0, y: 0, z: 0, r: 0.045, h: 3.3, seg: 8, mat: 'steel', tint: '#7c7f7a', collide: true });
    for (const [rot, name, y] of [[0, 'EAST ST', 3.05], [PI / 2, 'FOUNDRY ST', 2.8]]) kit.at({ y, rot }, () => {
      kit.box({ x: 0, y: 0, z: 0, w: 1.4, h: 0.22, d: 0.02, mat: 'sign_green', tint: '#3d7a52' });
      for (const s of [1, -1]) kit.at({ rot: s > 0 ? 0 : PI }, () => text(kit, name, { x: 0, y: 0.06, h: 0.1, t: 0.018, z: 0.012, align: 'center', mat: 'ez_ink_white' }));
    });
  });
  kit.trafficLight({ at: [54.0, 7.0], y: SW, rot: 0, arm: 5.4, h: 5.8, state: 'off' });
  kit.roadSign({ at: [63.5, -7.6], y: SW, rot: -PI / 2, shape: 'rect', size: 0.36, aspect: 1.8, mat: 'sign_white', tint: '#e8e6e0', h: 2.4 });
  kit.at({ x: 63.5, y: SW + 2.4, z: -7.6, rot: -PI / 2 }, () => { strip(kit, [-0.36, 0.03], [0.24, 0.03], 0.09, 0.012, 'ez_ink'); flat(kit, [[0.22, -0.08], [0.38, 0.03], [0.22, 0.14]], 0.012, 'ez_ink'); text(kit, 'ONE WAY', { x: 0, y: -0.17, h: 0.07, t: 0.013, z: 0.012, align: 'center', mat: 'ez_ink' }); });
}
/**
 * Temporary quarantine fence across the cross street at z (x0..x1): 3.6 m chain-link panels on concrete feet with
 * barbed wire, signs facing the street (side = -1: street to the south (+z) of a north fence; +1: street to the north).
 * gap [g0, g1]: torn opening 0.64 m wide x 2.0 m high (mesh above intact) — nav passes, players do not.
 */
function quarantineFence(kit, x0, x1, z, gap, side) {
  const H = 3.6, yb = 0.04;
  const runs = gap ? [[x0, gap[0]], [gap[1], x1]] : [[x0, x1]];
  for (const [a, b] of runs) {
    const n = Math.max(1, Math.ceil((b - a) / 3.5));
    for (let i = 0; i < n; i++) {
      const pa = a + ((b - a) * i) / n, pb = a + ((b - a) * (i + 1)) / n;
      kit.face([[pa, yb, z], [pb, yb, z], [pb, H, z], [pa, H, z]], 'chainlink', { uvs: [[pa, yb], [pb, yb], [pb, H], [pa, H]] });
      if ((i + (a > x0 ? 1 : 0)) % 2 === 0 && pb - pa > 2) {
        const t0 = pa + 0.08, t1 = pb - 0.08, ty0 = (pa > 55.2 && pb < 62.8 ? 0 : SW) + 0.25, ty1 = 2.15, zt = z - side * 0.03;
        const sag = [[t0, ty1], [(t0 + t1) / 2, ty1 - 0.08], [t1, ty1], [t1, ty0], [t0, ty0]];
        kit.face(sag.map(([x, y]) => [x, y, zt]), 'ez_fabric', { tint: '#4f5a44' });
        kit.at({ x: (t0 + t1) / 2, z: zt - side * 0.006, rot: side > 0 ? PI : 0 }, () => text(kit, 'QUARANTINE', { x: 0, y: 1.05, h: 0.2, t: 0.035, z: 0, align: 'center', mat: 'ez_ink_white', tint: '#d8d6c8' }));
      }
      for (const x of [pa, pb]) {
        kit.cyl({ x, y: 0, z, r: 0.04, h: H + 0.05, seg: 8, mat: 'steel', tint: '#a2a5a8' });
        kit.box({ x, y: x > 55.2 && x < 62.8 ? 0 : SW, z, w: 0.62, h: 0.14, d: 0.24, mat: 'concrete_dirty', tint: '#9a948a' });
      }
      for (const yy of [yb + 0.05, 2.2, H - 0.03]) kit.sweep(circle(0.024, 6), [[pa, yy, z], [pb, yy, z]], 'steel', { smooth: true, tint: '#a2a5a8' });
      kit.colBox({ x: (pa + pb) / 2, y: 0, z, w: pb - pa, h: H, d: 0.06 }, 'metal');
    }
  }
  if (gap) {
    const [g0, g1] = gap;
    // mesh above the tear, rolled bottom edge, the peeled flap bent into the street
    kit.face([[g0, 2.0, z], [g1, 2.0, z], [g1, H, z], [g0, H, z]], 'chainlink', { uvs: [[g0, 2.0], [g1, 2.0], [g1, H], [g0, H]] });
    kit.sweep(circle(0.035, 6), [[g0 - 0.05, 2.0, z], [(g0 + g1) / 2, 1.95, z - 0.04 * side], [g1 + 0.05, 2.0, z]], 'chainlink', { smooth: true });
    kit.sweep(circle(0.02, 5), [[g0, H - 0.03, z], [g1, H - 0.03, z]], 'steel', { smooth: true, tint: '#a2a5a8' });
    kit.colBox({ x: (g0 + g1) / 2, y: 2.0, z, w: g1 - g0, h: H - 2.0, d: 0.06 }, 'metal');
    kit.at({ x: g0, y: 0, z, rot: -side * 0.75 }, () => kit.face([[0, 0.08, 0], [-0.62, 0.25, 0], [-0.66, 1.6, 0], [0, 1.98, 0]], 'chainlink', { uvs: [[0, 0.08], [0.62, 0.25], [0.66, 1.6], [0, 1.98]] }));
  }
  // barbed wire on angled arms
  for (let x = x0; x <= x1 + 1e-3; x += 3.5) kit.at({ x: Math.min(x, x1), y: H, z, rx: side * 0.7 }, () => kit.box({ x: 0, y: 0, z: 0, w: 0.03, h: 0.45, d: 0.03, mat: 'steel_dark' }));
  for (let s = 0; s < 3; s++) { const yy = H + 0.12 + s * 0.1, zz = z + side * (0.08 + s * 0.08); kit.wire([x0, yy, zz], [x1, yy, zz], { sag: 0.06, r: 0.005 }); }
  // signs facing the street
  const zf = z - side * 0.03, rot = side > 0 ? PI : 0;
  for (const [x, big] of [[54.6, true], [62.2, false]]) kit.at({ x, y: 1.25, z: zf, rot }, () => {
    kit.box({ x: 0, y: 0, z: -0.012, w: big ? 1.9 : 1.2, h: big ? 1.15 : 0.8, d: 0.02, mat: 'sign_white', tint: '#e8e4da' });
    if (big) {
      text(kit, 'QUARANTINE ZONE', { x: 0, y: 0.82, h: 0.16, t: 0.03, z: 0.002, align: 'center', mat: 'ez_ink_red', maxW: 1.7 });
      text(kit, 'NO ENTRY · 止步', { x: 0, y: 0.48, h: 0.18, t: 0.032, z: 0.002, align: 'center', mat: 'ez_ink', maxW: 1.7 });
      text(kit, 'BY ORDER OF THE STATE HEALTH DEPT.', { x: 0, y: 0.16, h: 0.055, t: 0.01, z: 0.002, align: 'center', mat: 'ez_ink', maxW: 1.7 });
    } else {
      text(kit, 'DANGER', { x: 0, y: 0.48, h: 0.17, t: 0.032, z: 0.002, align: 'center', mat: 'ez_ink_red' });
      text(kit, 'INFECTED AREA', { x: 0, y: 0.2, h: 0.1, t: 0.018, z: 0.002, align: 'center', mat: 'ez_ink' });
    }
  });
}
/** Concertina razor wire coil along a ground line a -> b (helix of thin wire). */
function coil(kit, a, b, y) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, nx = -uz, nz = ux;
  const pts = [], turns = Math.round(L / 0.22), r = 0.38;
  for (let i = 0; i <= turns * 14; i++) {
    const t = i / (turns * 14), a2 = t * turns * PI * 2, s = t * L;
    pts.push([a[0] + ux * s + nx * Math.cos(a2) * r, y + r + Math.sin(a2) * r, a[1] + uz * s + nz * Math.cos(a2) * r]);
  }
  kit.sweep(circle(0.006, 3), pts, 'wire', { smooth: true });
}

// ==================================================================================================== E_TRUCK (hero)
// Olive 6x6 army cargo truck (M35-like proportions, our own model) slewed across East Street. Local frame: front +x,
// right side +z. Canvas cover torn over the rear half, tailgate hanging open (crates spilled towards SUP_E), driver's
// door open, amber rotating beacon on the canvas roof right where L_BEACON_E sits (local 0.11, 3.5, 0.62).
// Collision: three boxes with sheer sides (front 1.8 m, cab 2.55 m, bed + canvas 3.2 m) so the truck cannot be climbed.
function armyTruck(kit, L) {
  const P = L.PROPS.find((p) => p.id === 'E_TRUCK');
  const OD = '#78805a', ODD = '#5f6646', CAN = '#8e8a66', PAINT = 'car_paint_worn';
  const g = { y: 0, h: 1.4, k: 0.45 };
  kit.at({ x: P.x, y: 0, z: P.z, rot: P.rot }, () => {
    // ---- wheels (6), axles, frame
    for (const wx of [2.85, -1.35, -2.75]) for (const s of [-1, 1]) kit.at({ x: wx, y: 0.55, z: s * 1.03 }, () => {
      kit.at({ rx: PI / 2 }, () => kit.lathe([[0.3, -0.18], [0.5, -0.18], [0.54, -0.15], [0.555, -0.08], [0.555, 0.08], [0.54, 0.15], [0.5, 0.18], [0.3, 0.18]], { x: 0, y: 0, z: 0, seg: 18, mat: 'rubber' }));
      kit.at({ rx: PI / 2 }, () => {
        kit.cyl({ x: 0, y: s > 0 ? 0.16 : -0.2, z: 0, r: 0.33, h: 0.04, seg: 14, mat: PAINT, tint: ODD });
        kit.cyl({ x: 0, y: s > 0 ? 0.19 : -0.27, z: 0, r: 0.13, h: 0.08, seg: 10, mat: 'steel_dark', tint: '#3a3a30' });
      });
    });
    for (const z of [-0.46, 0.46]) kit.box({ x: 0.0, y: 0.66, z, w: 8.3, h: 0.24, d: 0.1, mat: 'steel_dark', tint: '#35372c' });
    for (const ax of [2.85, -1.35, -2.75]) {
      kit.box({ x: ax, y: 0.47, z: 0, w: 0.16, h: 0.16, d: 2.0, mat: 'steel_dark', tint: '#35372c' });
      kit.at({ x: ax, y: 0.55, z: 0, rz: PI / 2 }, () => kit.cyl({ x: 0, y: -0.16, z: 0, r: 0.21, h: 0.32, seg: 10, mat: 'steel_dark', tint: '#35372c' }));
      for (const z of [-0.46, 0.46]) kit.box({ x: ax, y: 0.6, z, w: 1.2, h: 0.08, d: 0.09, mat: 'steel_dark', tint: '#2f3127' });
    }
    // ---- front: bumper with shackles + unit codes, brush guard, grille, hood with a white star, flat fenders, lamps
    kit.bbox({ x: 4.13, y: 0.6, z: 0, w: 0.2, h: 0.36, d: 2.45, bevel: 0.02, mat: PAINT, tint: OD, grime: g });
    for (const s of [-1, 1]) kit.sweep(circle(0.025, 5), [[4.23, 0.86, s * 0.62 - 0.07], [4.38, 0.8, s * 0.62 - 0.05], [4.38, 0.68, s * 0.62 + 0.05], [4.23, 0.64, s * 0.62 + 0.07]], 'sign_red', { smooth: true, tint: '#7d2a22' });
    kit.at({ x: 4.233, y: 0, z: 0, rot: PI / 2 }, () => {
      text(kit, 'QRF 3', { x: -0.72, y: 0.72, h: 0.1, t: 0.02, z: 0, align: 'center', mat: 'ez_ink_white' });
      text(kit, 'HQ-12', { x: 0.72, y: 0.72, h: 0.1, t: 0.02, z: 0, align: 'center', mat: 'ez_ink_white' });
    });
    kit.box({ x: 3.96, y: 0.95, z: 0, w: 0.05, h: 0.78, d: 0.95, mat: 'frame_dark', tint: '#25261f' });
    for (let i = 0; i < 7; i++) kit.sweep(circle(0.02, 5), [[4.08, 0.92, -0.42 + i * 0.14], [4.08, 1.7, -0.42 + i * 0.14]], PAINT, { smooth: true, tint: ODD, up: [1, 0, 0] });
    kit.sweep(circle(0.025, 5), [[4.08, 1.7, -0.5], [4.08, 1.72, 0.5]], PAINT, { smooth: true, tint: ODD });
    kit.bbox({ x: 3.05, y: 1.02, z: 0, w: 1.82, h: 0.76, d: 1.1, bevel: 0.05, mat: PAINT, tint: OD, taper: { top: [0.98, 0.94] }, grime: g });
    kit.at({ x: 3.05, y: 1.786, z: 0, rx: -PI / 2, rot: -PI / 2 }, () => star(kit, 0, 0, 0.36, 0.0, 'ez_ink_white', '#d8d6c8', true));
    for (const s of [-1, 1]) {
      kit.box({ x: 3.0, y: 1.18, z: s * 0.88, w: 1.75, h: 0.05, d: 0.66, mat: PAINT, tint: OD });
      kit.at({ x: 3.86, y: 1.2, z: s * 0.88, rz: -0.75 }, () => kit.box({ x: 0.2, y: -0.025, z: 0, w: 0.42, h: 0.05, d: 0.66, mat: PAINT, tint: OD }));
      kit.box({ x: 3.0, y: 0.74, z: s * 0.57, w: 1.75, h: 0.45, d: 0.04, mat: PAINT, tint: ODD });
      kit.at({ x: 3.86, y: 1.38, z: s * 0.8, rz: -PI / 2 }, () => {
        kit.cyl({ x: 0, y: 0, z: 0, r: 0.12, h: 0.12, seg: 12, mat: PAINT, tint: ODD });
        kit.cyl({ x: 0, y: 0.12, z: 0, r: 0.1, h: 0.012, seg: 12, mat: 'car_light' });
      });
      kit.sweep(circle(0.012, 4), [[3.85, 1.25, s * 0.66], [4.05, 1.3, s * 0.66], [4.05, 1.5, s * 0.8], [4.05, 1.3, s * 0.94], [3.85, 1.25, s * 0.94]], 'steel_dark', { smooth: true });
    }
    // ---- cab: cowl, half doors (driver's open), window frames, split windscreen (one pane smashed), hard top
    kit.box({ x: 2.05, y: 1.18, z: 0, w: 0.2, h: 0.64, d: 2.04, mat: PAINT, tint: OD });
    kit.box({ x: 1.4, y: 1.12, z: 1.04, w: 1.3, h: 0.75, d: 0.05, mat: PAINT, tint: OD, grime: g });
    kit.sweep([[-0.02, -0.02], [0.02, -0.02], [0.02, 0.02], [-0.02, 0.02]], [[0.8, 1.87, 1.04], [0.8, 2.42, 1.04], [2.0, 2.42, 1.04], [2.0, 1.87, 1.04], [0.8, 1.87, 1.04]], PAINT, { tint: ODD });
    kit.face([[0.84, 1.9, 1.035], [1.96, 1.9, 1.035], [1.96, 2.38, 1.035], [0.84, 2.38, 1.035]], 'car_glass', {});
    kit.at({ x: 1.4, y: 0, z: 1.067 }, () => { star(kit, 0, 1.5, 0.15, 0, 'ez_ink_white', '#d8d6c8', true); text(kit, 'QRF', { x: 0, y: 1.2, h: 0.09, t: 0.017, z: 0, align: 'center', mat: 'ez_ink_white' }); });
    kit.at({ x: 2.05, y: 0, z: -1.04, rot: -0.95 }, () => {
      kit.box({ x: -0.65, y: 1.12, z: 0, w: 1.3, h: 0.75, d: 0.05, mat: PAINT, tint: OD });
      kit.sweep([[-0.02, -0.02], [0.02, -0.02], [0.02, 0.02], [-0.02, 0.02]], [[-1.25, 1.87, 0], [-1.25, 2.42, 0], [-0.05, 2.42, 0], [-0.05, 1.87, 0], [-1.25, 1.87, 0]], PAINT, { tint: ODD });
      kit.at({ x: -0.65, y: 0, z: -0.027, rot: PI }, () => star(kit, 0, 1.5, 0.15, 0, 'ez_ink_white', '#d8d6c8', true));
      kit.colBox({ x: -0.65, y: 1.12, z: 0, w: 1.3, h: 0.75, d: 0.06 }, 'metal');
    });
    kit.box({ x: 0.72, y: 1.12, z: 0, w: 0.06, h: 1.34, d: 2.06, mat: PAINT, tint: OD });
    kit.face([[0.688, 1.95, 0.4], [0.688, 1.95, -0.4], [0.688, 2.3, -0.4], [0.688, 2.3, 0.4]].reverse(), 'glass_dirty', {});
    kit.bbox({ x: 1.4, y: 2.44, z: 0, w: 1.55, h: 0.1, d: 2.12, bevel: 0.03, mat: PAINT, tint: OD });
    for (const [y, h] of [[1.82, 0.06], [2.38, 0.06]]) kit.box({ x: 2.08, y, z: 0, w: 0.06, h, d: 2.04, mat: PAINT, tint: ODD });
    for (const z of [-1.0, 0, 1.0]) kit.box({ x: 2.08, y: 1.84, z, w: 0.06, h: 0.6, d: 0.06, mat: PAINT, tint: ODD });
    kit.face([[2.07, 1.88, 0.04], [2.07, 1.88, 0.96], [2.07, 2.38, 0.96], [2.07, 2.38, 0.04]].reverse(), 'car_glass', {});
    kit.face([[2.07, 1.88, -0.96], [2.07, 1.88, -0.6], [2.07, 2.12, -0.96]].reverse(), 'glass_dirty', {});
    kit.face([[2.07, 2.38, -0.04], [2.07, 2.38, -0.35], [2.07, 2.18, -0.04]].reverse(), 'glass_dirty', {});
    // cab interior: bench, dash, steering wheel; mirrors, steps, fuel tank, battery box
    kit.bbox({ x: 1.15, y: 1.2, z: 0, w: 0.55, h: 0.42, d: 1.9, bevel: 0.04, mat: 'ez_fabric', tint: '#3e4230' });
    kit.bbox({ x: 0.86, y: 1.55, z: 0, w: 0.12, h: 0.62, d: 1.9, bevel: 0.03, mat: 'ez_fabric', tint: '#3e4230' });
    kit.box({ x: 1.92, y: 1.6, z: 0, w: 0.22, h: 0.22, d: 1.95, mat: 'car_plastic', tint: '#2a2c22' });
    kit.at({ x: 1.7, y: 1.8, z: -0.5, rz: 0.95 }, () => { const ring = circle(0.21, 12).map(([a, b]) => [a, 0, b]); kit.sweep(circle(0.018, 4), [...ring, ring[0]], 'car_plastic', { smooth: true }); });
    kit.sweep(circle(0.025, 5), [[1.72, 1.79, -0.5], [1.95, 1.6, -0.5]], 'steel_dark', { smooth: true });
    for (const s of [-1, 1]) {
      kit.sweep(circle(0.015, 4), [[2.05, 2.2, s * 1.05], [2.2, 2.15, s * 1.3], [2.22, 1.95, s * 1.38]], 'steel_dark', { smooth: true });
      kit.box({ x: 2.22, y: 1.82, z: s * 1.42, w: 0.04, h: 0.42, d: 0.24, mat: 'frame_dark', tint: '#2a2b25' });
      kit.box({ x: 1.45, y: 0.74, z: s * 1.1, w: 0.45, h: 0.04, d: 0.22, mat: 'grate' });
    }
    kit.at({ x: 1.95, y: 0.84, z: 0.98, rz: PI / 2 }, () => kit.cyl({ x: 0, y: 0, z: 0, r: 0.24, h: 1.05, seg: 12, mat: PAINT, tint: OD }));
    kit.box({ x: 1.4, y: 0.42, z: -0.98, w: 0.6, h: 0.36, d: 0.36, mat: PAINT, tint: ODD });
    // ---- cargo bed: platform, wooden floor, steel sides with stake ribs, troop benches, headboard, tailgate down
    kit.box({ x: -1.93, y: 0.98, z: 0, w: 4.74, h: 0.3, d: 2.45, mat: PAINT, tint: OD, grime: g });
    kit.upFace([[-4.28, 1.284, -1.17], [0.42, 1.284, -1.17], [0.42, 1.284, 1.17], [-4.28, 1.284, 1.17]], 'ez_wood', null, { tint: '#7a6a52' });
    for (const s of [-1, 1]) {
      kit.box({ x: -1.93, y: 1.28, z: s * 1.2, w: 4.74, h: 0.6, d: 0.05, mat: PAINT, tint: OD, grime: g });
      kit.box({ x: -1.93, y: 1.86, z: s * 1.2, w: 4.74, h: 0.05, d: 0.08, mat: PAINT, tint: ODD });
      for (let i = 0; i < 7; i++) kit.box({ x: -4.1 + i * 0.75, y: 1.0, z: s * 1.235, w: 0.06, h: 0.88, d: 0.04, mat: PAINT, tint: ODD });
      kit.box({ x: -1.93, y: 1.62, z: s * 1.03, w: 4.4, h: 0.04, d: 0.3, mat: 'ez_wood', tint: '#8a7858' });
      kit.box({ x: -1.93, y: 1.68, z: s * 1.165, w: 4.4, h: 0.16, d: 0.03, mat: 'ez_wood', tint: '#7d6c4f' });
      kit.face((s > 0 ? [[-3.42, 0.28, 1.2], [-3.42, 0.28, 0.8], [-3.42, 0.95, 0.8], [-3.42, 0.95, 1.2]] : [[-3.42, 0.28, -0.8], [-3.42, 0.28, -1.2], [-3.42, 0.95, -1.2], [-3.42, 0.95, -0.8]]).reverse(), 'rubber', {});
      kit.box({ x: -4.36, y: 0.9, z: s * 1.0, w: 0.03, h: 0.1, d: 0.14, mat: 'car_taillight' });
      kit.sweep(circle(0.008, 4), [[-4.28, 1.86, s * 1.17], [-4.36, 1.55, s * 1.14], [-4.4, 1.26, s * 1.12]], 'steel', { smooth: true, tint: '#5e5c54' });
    }
    kit.box({ x: 0.42, y: 1.28, z: 0, w: 0.06, h: 1.0, d: 2.45, mat: PAINT, tint: OD });
    kit.box({ x: -4.3, y: 0.86, z: 0, w: 0.1, h: 0.12, d: 2.4, mat: 'steel_dark', tint: '#35372c' });
    kit.box({ x: -4.37, y: 0.64, z: 0, w: 0.05, h: 0.62, d: 2.3, mat: PAINT, tint: OD, grime: g });
    kit.at({ x: -4.4, y: 0, z: 0, rot: -PI / 2 }, () => text(kit, 'KEEP BACK 50 M', { x: 0, y: 0.85, h: 0.11, t: 0.02, z: 0, align: 'center', mat: 'ez_ink_white' }));
    // ---- bows + torn olive canvas
    const BOWS = [0.32, -0.85, -2.0, -3.15, -4.22];
    for (const x of BOWS) kit.sweep(circle(0.022, 5), [[x, 1.86, -1.215], [x, 2.85, -1.215], [x, 3.08, -1.0], [x, 3.14, 0], [x, 3.08, 1.0], [x, 2.85, 1.215], [x, 1.86, 1.215]], 'steel_dark', { smooth: true, tint: '#3b3e2c' });
    kit.sweep(circle(0.02, 5), [[0.32, 3.14, 0], [-4.22, 3.14, 0]], 'steel_dark', { smooth: true, tint: '#3b3e2c' });
    const CP = [[-1.245, 1.88], [-1.245, 2.86], [-1.02, 3.12], [0, 3.19], [1.02, 3.12], [1.245, 2.86], [1.245, 1.88]];
    const at = (k, x, sag) => { const [z, y] = CP[k]; const roof = k >= 1 && k <= 5 && y > 2.9; return [x, y - (roof ? sag : sag * 0.2), z * (1 - (roof ? 0 : sag * 0.25))]; };
    // panels kept per bow segment: indices of profile strips (0 = left side, 1..4 = roof, 5 = right side)
    const keep = [[0, 1, 2, 3, 4, 5], [0, 1, 2, 3, 4, 5], [0, 1, 2, 5.5], [0.5]];
    for (let sgm = 0; sgm < 4; sgm++) {
      const xa = BOWS[sgm], xb = BOWS[sgm + 1], xm = (xa + xb) / 2;
      for (const kk of keep[sgm]) {
        const k = Math.floor(kk), half = kk % 1 > 0;
        const strips = [[xa, xm, 0, 0.06], [xm, xb, 0.06, 0]];
        for (const [x0, x1, s0, s1] of strips) {
          let A = at(k, x0, s0), B = at(k + 1, x0, s0), C = at(k + 1, x1, s1), D = at(k, x1, s1);
          if (half) { B = [B[0], (A[1] + B[1]) / 2 + 0.2, B[2]]; C = [C[0], (D[1] + C[1]) / 2 - 0.1, C[2]]; }
          kit.face([A, B, C, D], 'ez_fabric', { tint: shadeHex(CAN, 0.92 + 0.08 * ((k + sgm) % 2)) });
        }
      }
    }
    // canvas front panel over the headboard, hanging torn strips and a rolled flap at the back, rope ties
    kit.face([[0.345, 2.28, -1.245], [0.345, 2.28, 1.245], ...CP.slice(1, 6).reverse().map(([z, y]) => [0.345, y, z])], 'ez_fabric', { tint: CAN });
    for (const [x, z, len, sw] of [[-2.0, 0.62, 1.1, 0.35], [-2.0, 1.05, 0.8, 0.3], [-3.15, -0.6, 1.4, 0.4], [-3.15, 0.2, 0.9, 0.3], [-3.15, 1.1, 1.6, 0.25]]) {
      const yTop = 3.12 - Math.abs(z) * 0.1;
      kit.face([[x, yTop, z - sw / 2], [x, yTop, z + sw / 2], [x - 0.15, yTop - len, z + sw / 2 + 0.05], [x - 0.08, yTop - len - 0.15, z - sw / 2 + 0.05]], 'ez_fabric', { tint: shadeHex(CAN, 0.85) });
    }
    kit.at({ x: -4.22, y: 3.02, z: 0, rx: PI / 2 }, () => kit.cyl({ x: 0, y: -0.9, z: 0, r: 0.11, h: 1.6, seg: 8, mat: 'ez_fabric', tint: shadeHex(CAN, 0.8) }));
    for (let i = 0; i < 6; i++) for (const s of [-1, 1]) kit.box({ x: 0.1 - i * 0.62, y: 1.84, z: s * 1.25, w: 0.03, h: 0.1, d: 0.02, mat: 'car_plastic', tint: '#2e2a22' });
    // stencils on the right canvas side (faces the fort): white star + QRF-3
    kit.at({ x: -1.42, y: 0, z: 1.252 }, () => { star(kit, 0, 2.42, 0.28, 0, 'ez_ink_white', '#d4d0c0', true); text(kit, 'QRF-3', { x: 0, y: 1.98, h: 0.14, t: 0.026, z: 0, align: 'center', mat: 'ez_ink_white', tint: '#d4d0c0' }); });
    // ---- cargo inside the bed: ammo crates, jerrycans, ration cases, a rolled stretcher, sandbags
    const crateAt = (x, y, z, r, t) => armyCrate(kit, x, y, z, r, t);
    crateAt(-0.2, 1.29, -0.6, 0.05, 0); crateAt(-0.2, 1.29, 0.2, -0.04, 1); crateAt(-0.25, 1.65, -0.2, 0.2, 2); crateAt(-1.1, 1.29, -0.7, 0.1, 3);
    crateAt(-3.6, 1.29, 0.5, 0.7, 4); crateAt(-2.8, 1.29, -0.4, 1.4, 5);
    for (let i = 0; i < 4; i++) jerrycan(kit, -1.9 + i * 0.24, 1.29, 0.85, 0.02 * i);
    for (let i = 0; i < 3; i++) kit.box({ x: -2.3 + i * 0.5, y: 1.29, z: -0.95, w: 0.42, h: 0.3, d: 0.32, rot: kit.rnd(-0.2, 0.2), mat: 'sign_white', tint: '#9c8a62' });
    kit.at({ x: -1.6, y: 1.32, z: 0.1, rot: 0.08 }, () => { for (const s of [-0.25, 0.25]) kit.cyl({ x: 0, y: 0, z: s, r: 0.025, h: 2.1, seg: 5, mat: 'trim_wood', tint: '#7a6a4c', rz: PI / 2 }); kit.box({ x: -1.05, y: 0.0, z: 0, w: 1.9, h: 0.06, d: 0.46, mat: 'ez_fabric', tint: '#4e5638' }); });
    kit.sandbags([[-3.9, -0.9], [-3.9, 0.2]], { rows: 2, y: 1.29, collide: false });
    // ---- amber rotating beacon on the canvas roof (L_BEACON_E), its cable run down to the cab
    kit.at({ x: 0.11, y: 3.14, z: 0.62 }, () => {
      kit.box({ x: 0, y: 0, z: 0, w: 0.28, h: 0.04, d: 0.28, mat: 'car_plastic', tint: '#1d1d1a' });
      kit.cyl({ x: 0, y: 0.04, z: 0, r: 0.1, h: 0.05, seg: 12, mat: 'car_plastic', tint: '#1d1d1a' });
      kit.cyl({ x: 0, y: 0.09, z: 0, r: 0.095, r2: 0.08, h: 0.17, seg: 12, mat: 'lamp_amber' });
      kit.cyl({ x: 0, y: 0.26, z: 0, r: 0.08, r2: 0.03, h: 0.04, seg: 12, mat: 'lamp_amber' });
    });
    kit.sweep(circle(0.008, 4), [[0.11, 3.16, 0.48], [0.36, 3.1, 0.4], [0.37, 2.4, 0.5], [0.6, 2.5, 0.55], [0.75, 2.5, 0.6]], 'wire', { smooth: true });
    // ---- collision (sheer sides: not climbable)
    kit.colBox({ x: 3.1, y: 0.35, z: 0, w: 2.4, h: 1.45, d: 2.45 }, 'metal');
    kit.colBox({ x: 1.33, y: 0.35, z: 0, w: 1.36, h: 2.2, d: 2.2 }, 'metal');
    kit.colBox({ x: -1.93, y: 0.35, z: 0, w: 4.74, h: 2.86, d: 2.5 }, 'metal');
  });
  // ---- cargo spilled from the tailgate towards SUP_E (world), a dropped helmet, an abandoned rifle crate, papers
  for (const [x, z, r, t] of [[36.7, -4.4, 0.6, 2], [36.0, -3.3, 1.9, 0], [36.9, -2.7, 0.2, 4]]) { armyCrate(kit, x, 0, z, r, t); kit.colBox({ x, y: 0, z, w: 0.72, h: 0.36, d: 0.42, rot: r }, 'wood'); }
  jerrycan(kit, 37.6, 0, -3.3, 1.2, true);
  kit.at({ x: 35.4, y: 0, z: -2.0, rot: 0.6 }, () => kit.lathe([[0.0, 0.17], [0.11, 0.165], [0.16, 0.12], [0.18, 0.05], [0.185, 0.0], [0.0, 0.0]].reverse(), { x: 0, y: 0, z: 0, seg: 12, mat: PAINT, tint: '#4b5136' }));
  kit.debris([36.2, -3.6], { r: 1.6, count: 8, kinds: ['paper', 'paper'] });
  kit.decal({ at: [38.6, -3.6], size: [2.6, 1.8], rot: 0.5, mat: 'decal_stain' });
}
/**
 * Static smoke plume (until the runtime ambient-FX layer adds a particle column): soft alpha-blended puffs (the
 * procedural blob decal), three crossed planes each, rising from base to height h and leaning downwind (windDeg =
 * compass bearing the smoke drifts towards). Dark and dense at the base, wider and paler at the top.
 */
function smokeColumn(kit, base, h, windDeg) {
  const w = (windDeg * PI) / 180, dx = Math.sin(w), dz = -Math.cos(w);
  const n = 7;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), y = base[1] + 0.8 + t * h, drift = t * t * h * 0.45;
    const cx = base[0] + dx * drift, cz = base[2] + dz * drift, size = 1.8 + t * 7.5;
    const tint = shadeHex('#2c2a27', 1 + t * 1.2);
    for (let k = 0; k < 3; k++) kit.at({ x: cx + kit.rnd(-0.3, 0.3), y: y - size / 2, z: cz + kit.rnd(-0.3, 0.3), rot: (k * PI) / 3 + i * 0.4, rz: kit.rnd(-0.15, 0.15) }, () => {
      const q = [[-size / 2, 0, 0], [size / 2, 0, 0], [size / 2, size, 0], [-size / 2, size, 0]];
      const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
      kit.face(q, 'decal_stain', { uvs: uv, tint });
      kit.face(q.slice().reverse(), 'decal_stain', { uvs: uv.slice().reverse(), tint });
    });
  }
}
/** Olive ammo crate with rope handles and yellow stencil (x, y = base, z, rot). */
function armyCrate(kit, x, y, z, rot, seed) {
  kit.at({ x, y, z, rot }, () => {
    kit.bbox({ x: 0, y: 0, z: 0, w: 0.72, h: 0.34, d: 0.42, bevel: 0.015, mat: 'ez_wood', tint: ['#6a6d4a', '#5e6342', '#73704e'][seed % 3] });
    kit.box({ x: 0, y: 0.34, z: 0, w: 0.74, h: 0.03, d: 0.44, mat: 'ez_wood', tint: '#575b3d' });
    for (const s of [-1, 1]) kit.box({ x: s * 0.37, y: 0.14, z: 0, w: 0.02, h: 0.04, d: 0.16, mat: 'car_plastic', tint: '#3a3426' });
    text(kit, seed % 2 ? 'CTG 7.62 MM' : 'RATIONS · 12', { x: 0, y: 0.13, h: 0.05, t: 0.009, z: 0.212, align: 'center', mat: 'ez_ink_yellow' });
  });
}
/** Olive 20 l jerrycan (x, y = base, z, rot); lying: on its side. */
function jerrycan(kit, x, y, z, rot, lying) {
  kit.at({ x, y: y + (lying ? 0.175 : 0), z, rot, rx: lying ? PI / 2 : 0 }, () => {
    kit.bbox({ x: 0, y: lying ? -0.24 : 0, z: 0, w: 0.17, h: 0.47, d: 0.35, bevel: 0.02, mat: 'car_paint_worn', tint: '#566042' });
    kit.box({ x: 0, y: (lying ? -0.24 : 0) + 0.47, z: 0.05, w: 0.06, h: 0.05, d: 0.2, mat: 'steel_dark' });
  });
}

// ==================================================================================================== props
function props(kit, L) {
  const P = Object.fromEntries(L.PROPS.filter((p) => p.zone === 'east').map((p) => [p.id, p]));
  // street lamps LAMP_6, 7, 13, 14 (cobra heads, arms over the carriageway; LAMP_14 is dead)
  for (const l of L.STREET_LAMPS.filter((s) => s.x > 26 && s.x < 84 && Math.abs(s.z) < 40)) {
    const rot = Math.abs(l.z) < 10 ? (l.z > 0 ? PI / 2 : -PI / 2) : l.x > 59 ? PI : 0;
    kit.streetLight({ at: [l.x, l.z], y: SW, h: l.h, rot, on: l.state !== 'dead', flicker: l.state === 'flicker' ? 'sodium' : undefined, intensity: 45, range: 18 });
  }
  // E_PALLETS: stack of pallets on the east sidewalk by the dock (nudged 0.75 m off the curb onto the slab)
  palletStack(kit, P.E_PALLETS.x + 0.75, SW, P.E_PALLETS.z, 0.08, 8);
  kit.at({ x: 64.6, y: SW, z: 9.6, rot: 0.3 }, () => pallet(kit, true));
  // E_TRASH + bags; a second can knocked over by the barber
  kit.prop('metal_trash_can', { at: [P.E_TRASH.x, P.E_TRASH.z], y: SW, rot: 1.7 });
  trashPile(kit, [P.E_TRASH.x + 0.9, P.E_TRASH.z - 0.2], SW, 3);
  kit.prop('metal_trash_can', { at: [38.4, 8.2], y: SW + 0.37, rot: 0.4, rz: PI / 2 - 0.05, collide: false });
  kit.debris([38.9, 7.6], { r: 1.0, count: 8, kinds: ['paper', 'paper', 'chunk'], y: SW });
  // hydrants, parking meters, newspaper boxes, mailbox
  for (const [x, z, r] of [[36.6, -6.05, 0.4], [47.2, 6.05, 2.1], [63.55, -9.8, 1.0]]) kit.prop('fire_hydrant', { at: [x, z], y: SW, rot: r });
  for (const [x, z, bent] of [[28.6, -5.95, false], [31.2, -5.95, true], [39.0, -5.95, false], [31.8, 5.95, false], [35.0, 5.95, false], [43.6, 5.95, true]]) parkingMeter(kit, [x, z], z < 0 ? 0 : PI, bent);
  newsBox(kit, [33.85, -8.55], 0, '#a8302a', 'DAILY');
  newsBox(kit, [34.45, -8.55], 0.06, '#2f4f86', 'HERALD');
  kit.at({ x: 49.6, y: SW, z: -8.45, rot: 0.1 }, () => {
    for (const [x, z] of [[-0.22, -0.2], [0.22, -0.2], [0.22, 0.2], [-0.22, 0.2]]) kit.box({ x, y: 0, z, w: 0.05, h: 0.3, d: 0.05, mat: 'steel_dark' });
    const pts = [];
    for (const z of [-0.25, 0.25]) { pts.push([-0.26, 0.28, z], [0.26, 0.28, z]); for (let i = 0; i <= 8; i++) { const a = (i / 8) * PI; pts.push([Math.cos(a) * 0.26, 1.04 + Math.sin(a) * 0.26, z]); } }
    kit.hull(pts, 'sign_blue', { tint: '#6f88b8' });
    kit.colBox({ x: 0, y: 0, z: 0, w: 0.55, h: 1.3, d: 0.55 }, 'metal');
    text(kit, 'MAIL', { x: 0, y: 0.72, h: 0.1, t: 0.02, z: 0.255, align: 'center', mat: 'ez_ink_white' });
  });
  // bus stop on the south sidewalk: sign pole + bench
  kit.at({ x: 46.6, y: SW, z: 6.0 }, () => {
    kit.cyl({ x: 0, y: 0, z: 0, r: 0.035, h: 2.9, seg: 6, mat: 'steel', tint: '#8a8d8f', collide: true });
    kit.box({ x: 0, y: 2.25, z: 0.02, w: 0.5, h: 0.62, d: 0.02, mat: 'sign_white', tint: '#e6e2d6' });
    for (const s of [1, -1]) kit.at({ rot: s > 0 ? 0 : PI }, () => { text(kit, 'BUS', { x: 0, y: 2.62, h: 0.12, t: 0.022, z: 0.034, align: 'center', mat: 'ez_ink', tint: '#284f86' }); text(kit, '12', { x: 0, y: 2.33, h: 0.18, t: 0.03, z: 0.034, align: 'center', mat: 'ez_ink_red' }); });
  });
  kit.prop('painted_wooden_bench', { at: [45.2, 8.45], y: SW, rot: PI });
  // ---- army checkpoint around the truck: sandbag L on the north sidewalk, jersey barriers at the T, CHECKPOINT
  //      sign on a sawhorse, a burning oil drum (baked glow), razor wire along the south kerb
  kit.sandbags([[43.3, -6.0], [47.3, -6.0], [47.3, -8.7]], { rows: 4, y: SW });
  armyCrate(kit, 44.2, SW, -7.6, 0.2, 1); armyCrate(kit, 44.3, SW + 0.37, -7.55, 0.1, 3); jerrycan(kit, 45.2, SW, -8.3, 0.4);
  kit.colBox({ x: 44.2, y: SW, z: -7.6, w: 0.75, h: 0.72, d: 0.45, rot: 0.2 }, 'wood');
  kit.jersey({ at: [51.0, -3.4], rot: 0.35, stripes: true });
  kit.jersey({ at: [51.4, 3.6], rot: -0.3, stripes: true });
  kit.plankBarricade({ at: [49.3, 4.6], rot: -0.2, w: 2.0 });
  kit.at({ x: 49.3, y: 0.62, z: 4.62, rot: -0.2 }, () => {
    kit.box({ x: 0, y: 0, z: 0.06, w: 1.6, h: 0.42, d: 0.02, mat: 'sign_white', tint: '#e8e6dc' });
    text(kit, 'CHECKPOINT 3', { x: 0, y: 0.22, h: 0.13, t: 0.024, z: 0.072, align: 'center', mat: 'ez_ink_red' });
    text(kit, 'STOP · SHOW PASS', { x: 0, y: 0.05, h: 0.09, t: 0.016, z: 0.072, align: 'center', mat: 'ez_ink' });
  });
  kit.prop('Barrel_01', { at: [48.7, -7.9], y: SW, rot: 0.4, tint: '#6e5a4c' });
  kit.at({ x: 48.7, y: SW + 0.82, z: -7.9 }, () => {
    kit.cyl({ x: 0, y: 0, z: 0, r: 0.25, h: 0.02, seg: 10, mat: 'lamp_amber' });
    for (let i = 0; i < 5; i++) kit.box({ x: kit.rnd(-0.12, 0.12), y: 0.02, z: kit.rnd(-0.12, 0.12), w: 0.35, h: 0.04, d: 0.05, rot: kit.rnd(0, 3), rz: kit.rnd(-0.3, 0.3), mat: 'car_burnt', tint: '#2a2622' });
  });
  kit.light({ pos: [48.7, SW + 1.4, -7.9], color: '#ff9442', intensity: 7, range: 7, radius: 0.25, name: 'barrel_glow' });
  coil(kit, [30.0, 6.0], [34.4, 6.0], SW);
  // ---- litter, bricks and glass along both sidewalks, paper drifting down the street
  kit.debris([30.4, -7.6], { r: 1.2, count: 10, kinds: ['brick', 'brick', 'chunk'], y: SW });
  for (const [x, z, y] of [[28.5, -7.0, SW], [41.5, -7.4, SW], [50.6, -7.8, SW], [29.6, 7.4, SW], [44.0, 7.2, SW], [53.5, -14.0, SW], [53.6, 12.0, SW], [64.6, -14.0, SW], [64.6, 17.0, SW]]) kit.debris([x, z], { r: 1.0, count: 6, kinds: ['paper', 'paper', 'plank'], y });
  for (const [x, z] of [[32.0, 1.5], [39.5, 3.8], [45.5, -1.4], [57.4, -6.0], [60.4, 13.6], [57.0, 21.5], [61.6, -21.5]]) kit.debris([x, z], { r: 1.5, count: 7, kinds: ['paper', 'chunk', 'paper'] });
  for (const [x, z] of [[27.2, 8.4], [51.2, 8.5], [53.2, 21.8], [65.3, -22.2], [52.6, -14.5]]) trashPile(kit, [x, z], SW, 3);
  kit.prop('cardboard_box_01', { at: [27.4, -8.6], y: SW, rot: 0.3 });
  kit.prop('cardboard_box_01', { at: [27.6, -8.1], y: SW, rot: 1.3 });
  kit.prop('plastic_crate_02', { at: [52.5, 9.6], y: SW, rot: 0.6 });
  kit.prop('propane_tank', { at: [65.6, -7.0], y: SW, rot: 0.8 });
  kit.prop('utility_box_02', { at: [52.25, -12.5], y: SW, rot: -PI / 2 });
}
/** Steel dumpster with sloped lid (one half open), side pockets and casters. */
function dumpster(kit, at, rot, y, open = true) {
  kit.at({ x: at[0], y, z: at[1], rot }, () => {
    const tint = '#55705a';
    kit.bbox({ x: 0, y: 0.12, z: 0, w: 1.9, h: 1.05, d: 1.2, bevel: 0.04, mat: 'paint_metal', tint, taper: { top: [1.0, 1.06] } });
    kit.box({ x: 0, y: 1.0, z: -0.05, w: 1.98, h: 0.1, d: 1.36, mat: 'paint_metal', tint: shadeHex(tint, 0.85) });
    kit.at({ x: -0.48, y: 1.13, z: -0.62, rx: -0.12 }, () => kit.box({ x: 0, y: 0, z: 0.64, w: 0.92, h: 0.04, d: 1.28, mat: 'car_plastic', tint: '#222322' }));
    kit.at({ x: 0.48, y: 1.13, z: -0.62, rx: open ? -1.9 : -0.12 }, () => kit.box({ x: 0, y: 0, z: 0.64, w: 0.92, h: 0.04, d: 1.28, mat: 'car_plastic', tint: '#222322' }));
    for (const sx of [-0.8, 0.8]) for (const sz of [-0.45, 0.45]) kit.cyl({ x: sx, y: 0, z: sz, r: 0.06, h: 0.12, seg: 8, mat: 'rubber' });
    for (const s of [-1, 1]) kit.box({ x: s * 0.99, y: 0.6, z: 0, w: 0.1, h: 0.18, d: 0.9, mat: 'paint_metal', tint: shadeHex(tint, 0.8) });
    kit.colBox({ x: 0, y: 0, z: 0, w: 1.95, h: 1.3, d: 1.3 }, 'metal');
    text(kit, 'CITY WASTE 4', { x: 0, y: 0.75, h: 0.09, t: 0.016, z: 0.635, align: 'center', mat: 'ez_ink_white', shade: 0.7 });
  });
}
/** Trash heap: one Poly Haven bag, low-poly bags and cardboard, loose paper. */
function trashPile(kit, at, y, n) {
  for (let i = 0; i < n; i++) {
    const p = [at[0] + kit.rnd(-0.8, 0.8), at[1] + kit.rnd(-0.6, 0.6)], r = kit.rnd(0, 6.28);
    if (i === 0 && kit.hasProp('trashbag')) kit.prop('trashbag', { at: p, rot: r, y, scale: kit.rnd(0.9, 1.15), collide: false });
    else if (kit.chance(0.72)) {
      const s = kit.rnd(0.8, 1.15);
      kit.bbox({ x: p[0], y, z: p[1], rot: r, w: 0.55 * s, h: 0.48 * s, d: 0.45 * s, bevel: 0.13 * s, mat: 'car_plastic', tint: kit.pick(['#1c1d1b', '#222a22', '#2b2a24', '#3a3a34']), taper: { top: [0.55, 0.62] } });
      kit.cyl({ x: p[0], y: y + 0.46 * s, z: p[1], r: 0.05, r2: 0.015, h: 0.1, seg: 5, mat: 'car_plastic', tint: '#1c1d1b' });
    } else kit.box({ x: p[0], y, z: p[1], rot: r, w: kit.rnd(0.3, 0.55), h: kit.rnd(0.18, 0.38), d: kit.rnd(0.25, 0.45), mat: 'sign_white', tint: kit.pick(['#b8925e', '#a88452', '#c4a272']) });
  }
  kit.debris(at, { r: 1.2, count: 5, kinds: ['paper', 'paper', 'plank'], y });
}
/** Wooden pallet standing on its long edge (local: x along, the caller leans it), or lying flat. */
function pallet(kit, flatPallet) {
  const t = '#c9b08a';
  if (flatPallet) {
    for (let i = 0; i < 7; i++) kit.box({ x: -0.5 + i * 0.165, y: 0.12, z: 0, w: 0.1, h: 0.02, d: 1.2, mat: 'ez_wood', tint: t });
    for (const z of [-0.55, 0, 0.55]) kit.box({ x: 0, y: 0, z, w: 1.0, h: 0.12, d: 0.09, mat: 'ez_wood', tint: shadeHex(t, 0.8) });
    return;
  }
  for (let i = 0; i < 6; i++) kit.box({ x: 0, y: 0.05 + i * 0.36, z: 0.0, w: 1.0, h: 0.1, d: 0.02, mat: 'ez_wood', tint: t });
  for (const x of [-0.45, 0, 0.45]) kit.box({ x, y: 0, z: -0.06, w: 0.09, h: 1.95, d: 0.1, mat: 'ez_wood', tint: shadeHex(t, 0.8) });
}
/** Stack of n flat pallets (1.2 x 1.0 m). */
function palletStack(kit, x, y, z, rot, n) {
  kit.at({ x, y, z, rot }, () => {
    for (let i = 0; i < n; i++) kit.at({ y: i * 0.145, rot: (i % 3) * 0.04 }, () => {
      for (const zz of [-0.45, 0, 0.45]) kit.box({ x: 0, y: 0, z: zz, w: 1.2, h: 0.1, d: 0.1, mat: 'ez_wood', tint: '#8f7a62' });
      for (let k = 0; k < 7; k++) kit.box({ x: -0.54 + k * 0.18, y: 0.1, z: 0, w: 0.12, h: 0.022, d: 1.0, mat: 'ez_wood', tint: ['#a89074', '#9a8468', '#b39a7c'][k % 3] });
    });
    kit.colBox({ x: 0, y: 0, z: 0, w: 1.2, h: n * 0.145, d: 1.0 }, 'wood');
  });
}
/** Coin-op newspaper box at [x, z] facing rot (front = local +z). */
function newsBox(kit, at, rot, color, word) {
  kit.at({ x: at[0], y: SW, z: at[1], rot }, () => {
    kit.box({ x: 0, y: 0, z: 0, w: 0.08, h: 0.35, d: 0.08, mat: 'steel_dark' });
    kit.box({ x: 0, y: 0.03, z: 0, w: 0.42, h: 0.03, d: 0.38, mat: 'steel_dark' });
    kit.bbox({ x: 0, y: 0.35, z: 0, w: 0.5, h: 0.62, d: 0.45, bevel: 0.02, mat: 'paint_metal', tint: color, collide: 'metal' });
    kit.bbox({ x: 0, y: 0.97, z: -0.02, w: 0.52, h: 0.12, d: 0.49, bevel: 0.02, mat: 'paint_metal', tint: shadeHex(color, 0.85), rx: -0.18 });
    kit.face([[-0.19, 0.55, 0.228], [0.19, 0.55, 0.228], [0.19, 0.88, 0.228], [-0.19, 0.88, 0.228]], 'glass_dirty', {});
    kit.face([[-0.17, 0.57, 0.205], [0.17, 0.57, 0.205], [0.17, 0.85, 0.205], [-0.17, 0.85, 0.205]], 'sign_white', { tint: '#d8d2c0' });
    text(kit, word, { x: 0, y: 0.42, h: 0.07, t: 0.014, z: 0.229, align: 'center', mat: 'ez_ink_white' });
  });
}
/** Parking meter on a post (head facing rot), optionally bent. */
function parkingMeter(kit, at, rot, bent) {
  kit.at({ x: at[0], y: SW, z: at[1], rot, rz: bent ? 0.35 : 0 }, () => {
    kit.cyl({ x: 0, y: 0, z: 0, r: 0.03, h: 1.1, seg: 6, mat: 'steel', tint: '#6d706c' });
    kit.bbox({ x: 0, y: 1.1, z: 0, w: 0.2, h: 0.32, d: 0.16, bevel: 0.03, mat: 'paint_metal', tint: '#5d6a64' });
    kit.cyl({ x: 0, y: 1.42, z: 0, r: 0.1, r2: 0.04, h: 0.08, seg: 8, mat: 'paint_metal', tint: '#5d6a64' });
    kit.face([[-0.07, 1.25, 0.081], [0.07, 1.25, 0.081], [0.07, 1.36, 0.081], [-0.07, 1.36, 0.081]], 'glass_dirty', {});
  });
  kit.colBox({ x: at[0], y: SW, z: at[1], w: 0.12, h: 1.3, d: 0.12 }, 'metal');
}
