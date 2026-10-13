// 失落之城 LOST TOWN — zone 'center': 中央路口與貨櫃堡壘 (Central Intersection + Container Fort).
// Recreates the heart of CSO's "Lost City" (zs_lostcity): an octagonal downtown intersection with a pinwheel fort
// of four 20 ft containers and perforated ramps in the middle, ringed by four chamfered corner blocks:
//   C_NW Hotel Ashford (limestone, 9F) with the tilted LOST / TOWN letter boards and a wooden water tower,
//   C_NE the billboard building (stone office, 6F) with three rooftop boards on a steel catwalk frame,
//   C_SE Maple Sweets (red brick, 7F) with an enterable candy shop,
//   C_SW Marino's (dark brick, 8F) with a black iron fire escape,
// four yellow bike-signal masts, the arm stubs out to the zone border (|x| or |z| = 26) and the central props.
// All geometry, lettering, brands and art are original (see docs/MAP_LOSTTOWN.md §0). Every number that other
// zones or the runtime depend on comes from tools/map/losttown/layout.mjs.
//
// Seams with the neighbouring zones (all cut across open street): street y 0, sidewalks y 0.15 with 0.3 m granite
// curbs, carriageway edges at x|z = ±5.5 (N/E/W arms) and x = ±5 (S arm), centre-line dashes at world
// [9k, 9k + 3], yellow edge lines 0.4 m off the curbs, asphalt_cracked road + concrete_floor sidewalks.
import { MATERIALS } from '../../lib/materials.mjs';
import { ensureCCW } from '../../lib/kit/core.mjs';

const PI = Math.PI;
const TRIM = 'plaster';   // light stone trims of the two stone blocks (the palette's trim_stone reads ochre)
const SW = 0.15;     // sidewalk top
const BY = 0.13;     // corner buildings stand 2 cm below the sidewalk top (no crack at the wall foot)
const ZB = 26;       // zone half size

// Zone-local palette additions (folded with the shared palette by the compiler: same texture sets, only the colour
// differs, so they cost no extra GPU material). ct_fabric = white canvas that takes any vertex tint (striped
// awnings, tarps); ct_tread = checker plate (fort joint plates, hatches).
const ZONE_MATS = {
  ct_fabric: { set: 'canvas', surf: 'wood', tile: 1.2, color: '#ffffff', lm: 1, side: 'double' },
  ct_tread: { set: 'tread_plate', surf: 'metal', tile: 0.6, color: '#c3c6c8', rough: 0.85, metal: 0.7, lm: 0.8 },
};
for (const [k, v] of Object.entries(ZONE_MATS)) if (!MATERIALS[k]) MATERIALS[k] = v;

// ---------------------------------------------------------------------------------------------------- small math
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
function arcPts(c, r, a0, a1, n = 8) {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]); }
  return out;
}
const circle = (r, seg) => { const out = []; for (let i = 0; i < seg; i++) { const a = (i / seg) * PI * 2; out.push([Math.cos(a) * r, Math.sin(a) * r]); } return out; };
const rectProf = (w, h, oy = 0) => [[-w / 2, oy - h / 2], [w / 2, oy - h / 2], [w / 2, oy + h / 2], [-w / 2, oy + h / 2]];
/** Frame of a footprint edge a -> b (wall-local: x along the edge, +z outward for CCW footprints, y up). */
const edgeFrame = (a, b) => ({ x: a[0], z: a[1], rot: Math.atan2(-(b[1] - a[1]), b[0] - a[0]) });
/** Weighted pick with the kit's seeded RNG. */
function wpick(kit, weights) {
  const tot = Object.values(weights).reduce((s, v) => s + v, 0);
  let r = kit.rnd(0, tot);
  for (const [k, w] of Object.entries(weights)) { r -= w; if (r <= 0) return k; }
  return Object.keys(weights)[0];
}

// ---------------------------------------------------------------------------------------------------- stroke font
// Our own block lettering for every sign, board and stencil: glyphs are polylines on a 4 x 6 grid (y up), drawn as
// flat strips (one quad per stroke) a few mm in front of the sign face. `serif` adds bars at vertical stroke ends.
const G = {
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
  '%': [[[0, 0], [4, 6]], [[0, 6], [1.2, 6], [1.2, 4.8], [0, 4.8], [0, 6]], [[2.8, 1.2], [4, 1.2], [4, 0], [2.8, 0], [2.8, 1.2]]],
  '&': [[[4, 0], [0.9, 4.5], [0.9, 5.4], [1.7, 6], [2.6, 5.4], [2.6, 4.5], [0, 2.1], [0, 0.9], [1, 0], [2.4, 0], [4, 2.2]]],
  '+': [[[2, 1.2], [2, 4.8]], [[0.2, 3], [3.8, 3]]],
  '/': [[[0.4, 0], [3.6, 6]]],
};
const NARROW = new Set(['I', '1', "'", '!', '.', ',']);
/** Width of a text line in metres (cap height h, tracking in grid units). */
function textWidth(str, h, track = 1.5) {
  const s = h / 6;
  let w = 0;
  for (const ch of str) w += (ch === ' ' ? 3.2 : NARROW.has(ch) ? 2.4 : 4) * s + track * s;
  return Math.max(0, w - track * s);
}
/**
 * Lettering in the current frame: plane z (default 0.004), baseline-left at (x, y) (align: 'left'|'center'|'right'),
 * cap height h, stroke t, mat, tint, serif, italic (shear), shade. Returns the line width.
 */
function text(kit, str, o) {
  const h = o.h, s = h / 6, t = o.t ?? h * 0.15, z = o.z ?? 0.004, track = o.track ?? 1.5;
  const W = textWidth(str, h, track);
  let x = o.x - (o.align === 'center' ? W / 2 : o.align === 'right' ? W : 0);
  const fo = { tint: o.tint, shade: o.shade };
  const sh = o.italic || 0;
  // one quad per stroke, extended by half the stroke width at both ends so joints close (CCW seen from +z)
  const seg = (ax, ay, bx, by, tt = t) => {
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-6;
    const ux = (dx / len) * (tt / 2), uy = (dy / len) * (tt / 2), nx = -uy, ny = ux;
    const P = [[ax - ux - nx, ay - uy - ny], [bx + ux - nx, by + uy - ny], [bx + ux + nx, by + uy + ny], [ax - ux + nx, ay - uy + ny]];
    kit.face(P.map(([px, py]) => [px + (py - o.y) * sh, py, z]), o.mat, fo);
  };
  for (const ch of str.toUpperCase()) {
    const adv = ch === ' ' ? 3.2 : NARROW.has(ch) ? 2.4 : 4;
    const g = G[ch];
    const ox = NARROW.has(ch) ? -0.8 : 0;
    if (g) for (const pl of g) {
      for (let i = 0; i < pl.length - 1; i++) seg(x + (pl[i][0] + ox) * s, o.y + pl[i][1] * s, x + (pl[i + 1][0] + ox) * s, o.y + pl[i + 1][1] * s);
      // serifs: horizontal bars on the free ends of (near-)vertical strokes of open polylines
      const closed = pl.length > 2 && pl[0][0] === pl[pl.length - 1][0] && pl[0][1] === pl[pl.length - 1][1];
      if (o.serif && !closed) for (const [end, nb] of [[pl[0], pl[1]], [pl[pl.length - 1], pl[pl.length - 2]]]) {
        if (Math.abs(end[0] - nb[0]) > 0.35 * Math.abs(end[1] - nb[1])) continue;
        const ex = x + (end[0] + ox) * s, ey = o.y + end[1] * s;
        seg(ex - t * 1.1, ey, ex + t * 1.1, ey, t * 0.8);
      }
    }
    x += adv * s + track * s;
  }
  return W;
}
/** Vertical stack of letters centred on x, first letter top at yTop. */
function vtext(kit, str, o) {
  let y = o.yTop;
  for (const ch of str) {
    if (ch !== ' ') text(kit, ch, { ...o, x: o.x, y: y - o.h, align: 'center' });
    y -= o.h * (o.lead ?? 1.32);
  }
}
/** Neon tube lettering (dead tubes = lamp_off glass): each stroke is a thin tube standing off the sign face. */
function neon(kit, str, o) {
  const h = o.h, s = h / 6, z = o.z ?? 0.07, r = o.r ?? 0.022;
  let x = o.x - (o.align === 'center' ? textWidth(str, h) / 2 : 0);
  const ring = circle(r, 5);
  for (const ch of str) {
    const g = G[ch];
    if (g) for (const pl of g) kit.sweep(ring, pl.map(([gx, gy]) => [x + gx * s, o.y + gy * s, z]), o.mat || 'lamp_off', { smooth: true, up: [0, 0, 1] });
    x += (ch === ' ' ? 3.2 : 4) * s + 1.5 * s;
  }
}
/** Flat polygon on plane z of the current frame from 2D points [x, y] (any winding; drawn facing +z). */
function flat(kit, pts, z, mat, fo = {}) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
  const P = a >= 0 ? pts : pts.slice().reverse();
  kit.face(P.map(([x, y]) => [x, y, z]), mat, fo);
}
const rect2 = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

// ---------------------------------------------------------------------------------------------------- zone entry
export function build(kit, L) {
  ground(kit, L);
  fort(kit, L);
  buildingNW(kit, L);
  buildingNE(kit, L);
  buildingSE(kit, L);
  buildingSW(kit, L);
  signalMasts(kit, L);
  props(kit, L);
  plazaFill(kit);
  // Player spawns, BUY, SUP_FORT_1/2, SUP_C_SHOP, the SP_C_* spawners, L_FIRE_C and the zones come from
  // layout.toMapJson() / LIGHTS (the compiler merges them), so nothing is duplicated here.
  return {};
}

/** Soft baked bounce fills in front of the four chamfers: stand in for the light the open plaza throws back onto
 *  the shadow-side corner facades (the bake keeps one bounce; at the map's exposure those faces sink into the
 *  tone curve's toe). Named 'fill' like the kit's interior fills: never pulled into the realtime pool. */
function plazaFill(kit) {
  // ~5 m out from each chamfer centre (over the curb corner), clear of facades, canopies and masts
  for (const [x, z, k] of [[-8.3, -8.3, 1.25], [8.3, -8.3, 0.9], [7.8, 8.8, 0.8], [-7.8, 8.8, 1.1]]) {
    kit.light({ pos: [x, 3.0, z], color: '#d9d4c8', intensity: 3.6 * k, decay: 1, range: 16, radius: 0.8, name: 'fill' });
    kit.light({ pos: [x, 10.0, z], color: '#d4d6d0', intensity: 2.6 * k, decay: 1, range: 14, radius: 0.8, name: 'fill' });
  }
  // low fills off the four fort faces (street bounce onto the container walls and crates)
  for (let k = 0; k < 4; k++) {
    const a = 0.349 - (k * PI) / 2, u = -0.5, v = -8.6;
    kit.light({ pos: [u * Math.cos(a) + v * Math.sin(a), 1.4, -u * Math.sin(a) + v * Math.cos(a)], color: '#d6d2c8', intensity: 1.6, decay: 1, range: 9, radius: 0.6, name: 'fill' });
  }
}

// ==================================================================================================== ground
// Curb returns (layout CURBS.returns: centres + radius 3), regenerated with 8 segments for a smooth curve.
const RET = {
  NW: arcPts([-8.5, -8.5], 3, 0, PI / 2), NE: arcPts([8.5, -8.5], 3, PI / 2, PI),
  SE: arcPts([8, 8.5], 3, PI, 1.5 * PI), SW: arcPts([-8, 8.5], 3, 1.5 * PI, 2 * PI),
};
const dedupe = (pts) => pts.filter((p, i) => i === 0 || dist2(p, pts[i - 1]) > 1e-4);

/** Sidewalk slab: curbChain = road-side polyline (gets the 0.3 m granite curb), back = the rest of the outline. */
function sidewalk(kit, curbChain, back) {
  const poly = dedupe([...curbChain, ...back]);
  const ccw = ensureCCW(poly);
  const key = (a, b) => `${a[0].toFixed(3)},${a[1].toFixed(3)}|${b[0].toFixed(3)},${b[1].toFixed(3)}`;
  const curbSeg = new Set();
  for (let i = 0; i < curbChain.length - 1; i++) { curbSeg.add(key(curbChain[i], curbChain[i + 1])); curbSeg.add(key(curbChain[i + 1], curbChain[i])); }
  const edges = [];
  for (let i = 0; i < ccw.length; i++) if (curbSeg.has(key(ccw[i], ccw[(i + 1) % ccw.length]))) edges.push(i);
  kit.slab(ccw, { y1: SW, mat: 'concrete_floor', curb: 0.3, curbMat: 'curb', edge: 'curb', edges, grime: { y: 0, h: 0.15, k: 0.25 }, collide: false });
  // collision: walking surface + curb faces only. (A closed prism's downward bottom face is picked up by the nav
  // baker as the lowest walkable layer and would put the sidewalk nav 0.2 m under the slab.)
  kit.colPoly(ccw.map((p) => [p[0], SW, p[1]]), 'concrete');
  for (const i of edges) { const a = ccw[i], b = ccw[(i + 1) % ccw.length]; kit.colQuad([a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], SW, b[1]], [a[0], SW, a[1]], 'concrete'); }
  return ccw;
}

function ground(kit, L) {
  // ---- carriageway: all four arm stubs + the core, one polygon around the curb returns
  const road = dedupe([
    [-5.5, -ZB], [-5.5, -8.5], ...RET.NW, [-8.5, -5.5], [-ZB, -5.5], [-ZB, 5.5], [-8, 5.5], ...RET.SW, [-5, 8.5], [-5, ZB],
    [5, ZB], [5, 8.5], ...RET.SE, [8, 5.5], [ZB, 5.5], [ZB, -5.5], [8.5, -5.5], ...RET.NE, [5.5, -8.5], [5.5, -ZB],
  ]);
  kit.ground(road, { mat: 'asphalt_cracked' });
  // repaved strips in the smoother asphalt (laid 6 mm proud: the cracked layer underneath is cut away)
  const over = (poly) => kit.ground(poly, { mat: 'asphalt', y: 0.006, collide: false, tint: '#d2d2d2' });
  over([[0.3, -ZB], [5.5, -ZB], [5.5, -17.2], [0.6, -16.4]]);
  over([[-ZB, 0.2], [-18.5, 0.4], [-17.6, 5.5], [-ZB, 5.5]]);
  over([[15.5, -5.5], [ZB, -5.5], [ZB, -0.3], [16.2, -0.6]]);
  over([[-5, 16.2], [-0.4, 16.6], [-0.2, ZB], [-5, ZB]]);
  over([[-3.2, -8.3], [3.6, -8.6], [7.6, -2.8], [7.2, 4.1], [2.4, 7.6], [-3.8, 7.9], [-7.4, 2.6], [-7.0, -3.4]]);
  // utility trench and pothole repairs (dark asphalt patches)
  kit.patch([[-5, 20.6], [5, 20.2], [5, 21.1], [-5, 21.5]]);
  kit.patch([[19.5, -5.5], [20.4, -5.5], [20.9, 5.5], [20.0, 5.5]]);
  kit.patch([[-21.8, -4.6], [-19.4, -4.9], [-19.1, -2.6], [-21.6, -2.4]]);
  kit.patch([[2.4, -22.8], [4.3, -23.1], [4.6, -20.3], [2.6, -20.1]]);
  kit.patch([[-4.6, -19.8], [-2.9, -20.1], [-2.7, -18.6], [-4.4, -18.4]]);
  kit.patch([[9.5, 1.8], [12.2, 1.4], [12.6, 3.9], [9.9, 4.3]]);

  // ---- sidewalks (corner plazas widen at the chamfers)
  sidewalk(kit, [[-5.5, -ZB], [-5.5, -8.5], ...RET.NW, [-8.5, -5.5], [-ZB, -5.5]], [[-ZB, -9], [-15, -9], [-9, -15], [-9, -ZB]]);
  sidewalk(kit, [[ZB, -5.5], [8.5, -5.5], ...RET.NE, [5.5, -8.5], [5.5, -ZB]], [[9, -ZB], [9, -15], [15, -9], [ZB, -9]]);
  sidewalk(kit, [[5, ZB], [5, 8.5], ...RET.SE, [8, 5.5], [ZB, 5.5]], [[ZB, 9], [15, 9], [8, 16], [8, ZB]]);
  sidewalk(kit, [[-ZB, 5.5], [-8, 5.5], ...RET.SW, [-5, 8.5], [-5, ZB]], [[-8, ZB], [-8, 16], [-15, 9], [-ZB, 9]]);

  // ---- markings
  // zebra crosswalks (layout SURFACES.CROSSWALKS): bars 0.5 m / gaps 0.5 m
  kit.crosswalk({ at: [0, -12.75], dir: PI / 2, across: 11, length: 3.5, stripe: 0.5, gap: 0.5 });
  kit.crosswalk({ at: [0, 12.75], dir: PI / 2, across: 10, length: 3.5, stripe: 0.5, gap: 0.5 });
  kit.crosswalk({ at: [-12.75, 0], dir: 0, across: 11, length: 3.5, stripe: 0.5, gap: 0.5 });
  kit.crosswalk({ at: [12.75, 0], dir: 0, across: 11, length: 3.5, stripe: 0.5, gap: 0.5 });
  // stop lines on the approach halves (right-hand traffic)
  kit.markLine([[-5.1, -15.1], [-0.15, -15.1]], { width: 0.45 });
  kit.markLine([[0.15, 15.1], [4.6, 15.1]], { width: 0.45 });
  kit.markLine([[-15.1, 0.15], [-15.1, 5.1]], { width: 0.45 });
  kit.markLine([[15.1, -5.1], [15.1, -0.15]], { width: 0.45 });
  // centre-line dashes at world [9k, 9k + 3], none inside rect(-14.5, -14.5, 14.5, 14.5)
  for (let k = -4; k <= 3; k++) {
    const c0 = Math.max(9 * k, -ZB), c1 = Math.min(9 * k + 3, ZB);
    if (c1 - c0 < 0.05) continue;
    if (!(c1 <= -14.5 || c0 >= 14.5)) continue;
    kit.markLine([[0, c0], [0, c1]], { width: 0.12 });   // N / S arms (axis z)
    kit.markLine([[c0, 0], [c1, 0]], { width: 0.12 });   // W / E arms (axis x)
  }
  // solid yellow edge lines 0.4 m off each curb, zone border -> crosswalk
  const yl = (a, b) => kit.markLine([a, b], { width: 0.12, mat: 'paint_yellow' });
  yl([-5.1, -ZB], [-5.1, -15.0]); yl([5.1, -ZB], [5.1, -15.0]);
  yl([-4.6, 15.0], [-4.6, ZB]); yl([4.6, 15.0], [4.6, ZB]);
  yl([-ZB, -5.1], [-15.0, -5.1]); yl([-ZB, 5.1], [-15.0, 5.1]);
  yl([15.0, -5.1], [ZB, -5.1]); yl([15.0, 5.1], [ZB, 5.1]);

  // ---- street hardware: manhole MH_C (opens for SP_C_MH), utility covers, storm drains at the curbs
  for (const m of L.MANHOLES.filter((mm) => Math.abs(mm.x) < ZB && Math.abs(mm.z) < ZB)) manholeCover(kit, [m.x, m.z], m.spawner ? 0.36 : 0.32);
  manholeCover(kit, [-2.6, 21.4], 0.3);
  manholeCover(kit, [21.6, 2.4], 0.3);
  kit.drain([-5.27, -21.5], PI / 2); kit.drain([5.27, -18.5], PI / 2);
  kit.drain([-4.77, 19.5], PI / 2); kit.drain([4.77, 23.5], PI / 2);
  kit.drain([-19.5, 5.27], 0); kit.drain([-22.5, -5.27], 0);
  kit.drain([20.5, -5.27], 0); kit.drain([23.5, 5.27], 0);

  // ---- grime: stains, cracks, dirt, a few puddles (reflect the sky) in the gutters and low spots
  const fortAvoid = [[0, 0, 7.8]];
  kit.scatterDecals([[-5.5, -ZB], [5.5, -ZB], [5.5, -9], [-5.5, -9]], { count: 9, avoid: fortAvoid });
  kit.scatterDecals([[-5, 9], [5, 9], [5, ZB], [-5, ZB]], { count: 8, avoid: fortAvoid });
  kit.scatterDecals([[-ZB, -5.5], [-9, -5.5], [-9, 5.5], [-ZB, 5.5]], { count: 8, avoid: fortAvoid });
  kit.scatterDecals([[9, -5.5], [ZB, -5.5], [ZB, 5.5], [9, 5.5]], { count: 8, avoid: fortAvoid });
  kit.scatterDecals([[-5.5, -9], [5.5, -9], [9, -5.5], [9, 5.5], [5, 9], [-5, 9], [-9, 5.5], [-9, -5.5]], { count: 6, mats: { decal_stain: 3, decal_dirt: 3, decal_cracks: 2 }, avoid: [[0, 0, 7.6]] });
  for (const [x, z, r, s] of [[-4.6, -23.5, 0.3, [2.6, 1.3]], [4.3, 18.8, 1.2, [2.2, 1.1]], [-22.6, 4.7, 0.1, [3.1, 1.2]], [22.5, -4.5, 2.9, [2.4, 1.0]], [-6.6, 6.2, 0.7, [1.8, 1.3]], [3.1, -7.4, 0.4, [1.6, 1.0]]]) {
    kit.decal({ at: [x, z], size: s, rot: r, mat: 'decal_puddle' });
  }
  const swDecals = { decal_stain: 2, decal_dirt: 3, decal_cracks: 1 };
  kit.scatterDecals([[-9, -ZB], [-5.8, -ZB], [-5.8, -9], [-15, -9], [-9, -15]], { count: 5, y: SW, mats: swDecals, size: [0.7, 1.8] });
  kit.scatterDecals([[5.8, -ZB], [9, -ZB], [9, -15], [15, -9], [ZB, -9], [ZB, -5.8], [5.8, -5.8]], { count: 6, y: SW, mats: swDecals, size: [0.7, 1.8] });
  kit.scatterDecals([[5.3, 5.8], [ZB, 5.8], [ZB, 9], [15, 9], [8, 16], [8, ZB], [5.3, ZB]], { count: 6, y: SW, mats: swDecals, size: [0.7, 1.8] });
  kit.scatterDecals([[-ZB, 5.8], [-5.3, 5.8], [-5.3, ZB], [-8, ZB], [-8, 16], [-15, 9], [-ZB, 9]], { count: 6, y: SW, mats: swDecals, size: [0.7, 1.8] });
}

// ==================================================================================================== LM_FORT
// Built in the fort frame (rot 0.349; local u = x, v = z). Four-fold pinwheel: the NORTH side is defined once and
// turned by -k * 90 deg (local (u, v) -> (-v, u), the layout's q90) for east, south and west.
//   north container FORT_A  u -5.25..0.81, v -5.25..-2.81 (doors at the outer corner end, -u)
//   notch FORT_NOTCH_N     u  0.81..2.81, v -5.25..-2.81 (2 x 2 crates under a flush checker plate)
//   ramp RAMP_N            u -1.40..0.80, v -11.25 (foot, y 0) .. -5.25 (top, deck y 2.59)
//   sandbags FORT_SB_N     u -4.90..-1.90, v -5.20..-4.70 (0.55 m)
const CNUM = ['LTX 204511 4', 'LTX 318072 1', 'LTX 552190 7', 'LTX 640335 2'];

function fort(kit, L) {
  const F = L.LANDMARKS.fort;
  const H = F.half, CH = F.deckY, IN = F.coreHalf;
  kit.at({ rot: F.rot }, () => {
    kit.solid([[-H, -H], [H, -H], [H, H], [-H, H]], 0, CH);        // no road under the fort
    kit.colBox({ x: 0, y: 0, z: 0, w: 2 * H, h: CH, d: 2 * H }, 'metal'); // the deck is one solid block
    for (let k = 0; k < 4; k++) kit.at({ rot: -k * PI / 2 }, () => fortSide(kit, k, F));
    fortCore(kit, F, IN, CH);
    // CLIMB annotation: a 1 m band around the outer walls (street cells + deck edge cells) - climbers scale them
    for (let k = 0; k < 4; k++) kit.at({ rot: -k * PI / 2 }, () => kit.nav('climb', [[-H - 0.8, -H - 0.9], [H + 0.8, -H - 0.9], [H + 0.8, -H + 0.45], [-H - 0.8, -H + 0.45]], { y0: -0.5, y1: CH + 0.5 }));
  });
}

/** One pinwheel side in the north-side frame (container, joint notch, ramp, sandbags, edge dressing). */
function fortSide(kit, k, F) {
  const H = F.half, CH = F.deckY, c = F.containers[k];
  // ---- container: long side faces north (local -v); doors at the outer corner end (-u)
  kit.at({ x: -H + c.len / 2, z: -H + c.wid / 2, rot: PI }, () => container20(kit, { color: lightenHex(c.color, 0.68), num: CNUM[k], outer: 'pz', back: false, k, graffiti: ['HOLD THE LINE', null, 'NO EXIT', null][k], graffitiTint: k ? '#ffffff' : '#e8e0d0' }));
  // ---- joint notch: 2 x 2 crates (outer face on v = -H) under a 4 mm checker plate flush with the roofs
  const u0 = -H + c.len, u1 = u0 + 2.0, v0 = -H, v1 = -H + c.wid;
  for (let col = 0; col < 2; col++) for (let row = 0; row < 2; row++) {
    const cw = (u1 - u0) / 2;
    crateFace(kit, { x0: u0 + col * cw + 0.01, x1: u0 + (col + 1) * cw - 0.01, y0: row * (CH / 2) + 0.005, y1: (row + 1) * (CH / 2) - 0.01, z: v0, tint: ['#b89c7c', '#a88e70', '#c2a888', '#9c8468'][(k + col * 2 + row) % 4], seed: k * 4 + col * 2 + row });
  }
  kit.box({ x: (u0 + u1) / 2, y: CH - 0.004, z: (v0 + v1) / 2, w: u1 - u0 + 0.06, h: 0.008, d: v1 - v0, mat: 'ct_tread', faces: { bottom: false } });
  kit.box({ x: (u0 + u1) / 2, y: CH - 0.06, z: v0 - 0.002, w: u1 - u0 + 0.06, h: 0.064, d: 0.006, mat: 'ct_tread', faces: { bottom: false, top: false } }); // bent lip
  kit.colBox({ x: (u0 + u1) / 2, y: 0, z: v0 + 0.02, w: u1 - u0, h: CH - 0.02, d: 0.06 }, 'wood');   // bullets hit wood here
  // ---- ramp
  fortRamp(kit, F);
  // ---- sandbag row on the free outer edge left of the ramp top (crouch cover, 0.55 m)
  kit.at({ y: CH }, () => kit.sandbags([[-H + 0.35, -H + 0.3], [-H + 3.35, -H + 0.3]], { rows: 4 }));
  // ---- edge dressing: tarp draped over the edge, rope, plank boards across the roof seams
  if (k === 1 || k === 3) tarpOverEdge(kit, { x0: 1.0, x1: 2.6, z: -H, top: CH, drop: k === 1 ? 1.6 : 2.1, tint: k === 1 ? '#4f6a86' : '#6c6a4a' });
  if (k === 0 || k === 2) {
    const ry = CH - 0.04;
    kit.sweep(circle(0.012, 5), [[1.5, ry + 0.04, -H + 0.25], [1.6, ry, -H - 0.02], [1.55, ry - 0.9, -H - 0.06], [1.9, ry - 1.7, -H - 0.05]], 'wire', { smooth: true, tint: '#8a7a5a' });
  }
}

/** ISO 20 ft container in its own frame (long axis local x, doors at +x). outer: 'pz' = draw the +z long side. */
function container20(kit, o) {
  const L = 6.06, W = 2.44, H = 2.59;
  const tint = o.color, frameTint = o.frameTint || shadeHex(o.color, 0.82);
  const grime = { y: 0, h: 1.0, k: 0.3 };
  const side = (z, flip) => {
    const pts = [[-L / 2 + 0.11, 0.15, z], [L / 2 - 0.11, 0.15, z], [L / 2 - 0.11, H - 0.15, z], [-L / 2 + 0.11, H - 0.15, z]];
    kit.face(flip ? pts.slice().reverse() : pts, 'metal_container', { tint, grime });
  };
  if (o.outer === 'pz' || o.outer === 'both') side(W / 2 - 0.035, false);
  if (o.outer === 'nz' || o.outer === 'both') side(-W / 2 + 0.035, true);
  // roof (walkable on the fort): ribs across the width, rust specks, very slightly below the top rails
  kit.face([[-L / 2 + 0.06, H - 0.006, W / 2 - 0.06], [L / 2 - 0.06, H - 0.006, W / 2 - 0.06], [L / 2 - 0.06, H - 0.006, -W / 2 + 0.06], [-L / 2 + 0.06, H - 0.006, -W / 2 + 0.06]], 'metal_container', { tint: shadeHex(o.color, 0.93), uvLocal: true });
  // frame: corner posts, top / bottom side rails, end headers, corner castings
  const fr = 'frame_white';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    kit.box({ x: (sx * (L - 0.15)) / 2, y: 0, z: (sz * (W - 0.15)) / 2, w: 0.15, h: H, d: 0.15, mat: fr, tint: frameTint, faces: { bottom: false } });
    for (const yy of [0, H - 0.12]) kit.box({ x: (sx * (L - 0.17)) / 2, y: yy, z: (sz * (W - 0.17)) / 2, w: 0.19, h: 0.12, d: 0.19, mat: 'steel_dark', tint: '#5b5650', faces: { bottom: false } });
  }
  for (const sz of [-1, 1]) {
    kit.box({ x: 0, y: H - 0.15, z: (sz * (W - 0.1)) / 2, w: L - 0.3, h: 0.15, d: 0.1, mat: fr, tint: frameTint });
    kit.box({ x: 0, y: 0, z: (sz * (W - 0.1)) / 2, w: L - 0.3, h: 0.16, d: 0.12, mat: fr, tint: shadeHex(o.color, 0.6), faces: { bottom: false } });
  }
  for (const sx of [-1, 1]) {
    kit.box({ x: (sx * (L - 0.1)) / 2, y: H - 0.2, z: 0, w: 0.1, h: 0.2, d: W - 0.3, mat: fr, tint: frameTint });
    kit.box({ x: (sx * (L - 0.1)) / 2, y: 0, z: 0, w: 0.12, h: 0.16, d: W - 0.3, mat: fr, tint: shadeHex(o.color, 0.6), faces: { bottom: false } });
  }
  if (o.back) kit.face([[-L / 2 + 0.05, 0.16, -W / 2 + 0.15], [-L / 2 + 0.05, 0.16, W / 2 - 0.15], [-L / 2 + 0.05, H - 0.2, W / 2 - 0.15], [-L / 2 + 0.05, H - 0.2, -W / 2 + 0.15]], 'metal_container', { tint, grime });
  // doors (+x end): two leaves, four locking bars with cam keepers + handles, chained and padlocked
  const xd = L / 2 - 0.035;
  for (const sz of [-1, 1]) {
    const z0 = sz * 0.004, z1 = sz * (W / 2 - 0.15);
    const pts = [[xd, 0.16, z0], [xd, 0.16, z1], [xd, H - 0.2, z1], [xd, H - 0.2, z0]];
    kit.face(sz > 0 ? pts : pts.slice().reverse(), 'metal_container', { tint, grime });
    for (const bz of [0.32, 0.8]) {
      const zz = sz * bz * (W / 2 - 0.15);
      kit.cyl({ x: xd + 0.045, y: 0.2, z: zz, r: 0.021, h: H - 0.44, seg: 6, mat: 'steel', tint: '#a8a49a' });
      for (const yy of [0.22, H - 0.34]) kit.box({ x: xd + 0.03, y: yy, z: zz, w: 0.05, h: 0.09, d: 0.1, mat: 'steel_dark', tint: '#6e6a63' });
      kit.at({ x: xd + 0.07, y: 1.15, z: zz }, () => kit.box({ x: 0, y: 0, z: sz * 0.12, w: 0.03, h: 0.05, d: 0.26, mat: 'steel_dark', tint: '#6e6a63' }));
    }
    // hinges on the outer edges
    for (const yy of [0.45, 1.25, 2.05]) kit.box({ x: xd + 0.02, y: yy, z: sz * (W / 2 - 0.17), w: 0.05, h: 0.12, d: 0.08, mat: 'steel_dark', tint: '#5d5953' });
  }
  // chain looped across the two middle bars + padlock
  const cz = 0.32 * (W / 2 - 0.15);
  for (let i = 0; i <= 9; i++) {
    const t = i / 9, zz = -cz + 2 * cz * t, yy = 1.32 - Math.sin(t * PI) * 0.14;
    kit.at({ x: xd + 0.085, y: yy, z: zz, rx: i % 2 ? PI / 2 : 0 }, () => kit.box({ x: 0, y: -0.018, z: 0, w: 0.012, h: 0.036, d: 0.05, mat: 'steel', tint: '#7d7a72' }));
  }
  kit.box({ x: xd + 0.1, y: 1.1, z: 0.0, w: 0.035, h: 0.09, d: 0.07, mat: 'car_chrome', tint: '#8a7a50' });
  // stencils (our own reporting marks): number on the right door + side, max gross plate
  kit.at({ x: xd + 0.002, y: 0, z: 0, rot: PI / 2 }, () => {
    text(kit, o.num, { x: -0.12, y: 2.02, h: 0.11, t: 0.022, mat: 'frame_dark', tint: '#3a3a38', align: 'right' });
    text(kit, 'MAX GROSS 30,480 KG', { x: -0.12, y: 1.86, h: 0.06, t: 0.013, mat: 'frame_dark', tint: '#3a3a38', align: 'right' });
    text(kit, 'TARE 2,230 KG', { x: -0.12, y: 1.76, h: 0.06, t: 0.013, mat: 'frame_dark', tint: '#3a3a38', align: 'right' });
    flat(kit, rect2(0.12, 1.9, 0.62, 2.13), 0.002, 'sign_white', { tint: shadeHex(o.color, 1.05) });
  });
  if (o.graffiti) kit.at({ x: 0, y: 0, z: W / 2 - 0.028 }, () => {
    text(kit, o.graffiti, { x: -0.6, y: 0.75, h: 0.42, t: 0.075, mat: 'sign_red', tint: o.graffitiTint || '#ffffff', align: 'center', italic: 0.18, track: 1.1 });
    for (let i = 0; i < 9; i++) kit.at({ x: 1.6 + i * 0.09 + (i === 4 ? 0.1 : 0), y: 1.45, rz: i % 5 === 4 ? 1.1 : 0.05 }, () => kit.face([[-0.012, -0.22, 0.003], [0.012, -0.22, 0.003], [0.012, 0.22, 0.003], [-0.012, 0.22, 0.003]], 'frame_dark', { tint: '#202020' }));
  });
  if (o.outer === 'pz' || o.outer === 'both') kit.at({ x: 0, y: 0, z: W / 2 - 0.03 }, () => {
    text(kit, o.num.slice(0, 10), { x: L / 2 - 0.45, y: H - 0.62, h: 0.28, t: 0.05, mat: 'frame_dark', tint: '#45433e', align: 'right' });
    flat(kit, rect2(-L / 2 + 0.4, H - 0.75, -L / 2 + 1.4, H - 0.4), 0.003, 'sign_red', { tint: '#c9b5a5' });
    text(kit, 'LTX', { x: -L / 2 + 0.9, y: H - 0.68, h: 0.2, t: 0.045, mat: 'sign_white', tint: '#e8e2d4', align: 'center', z: 0.006 });
  });
}

/** Front face of a wooden crate (plank face + frame battens + diagonal brace) on plane z (outward -z). */
function crateFace(kit, o) {
  const { x0, x1, y0, y1, z } = o;
  const tint = o.tint || '#b89c78';
  kit.face([[x1, y0, z], [x0, y0, z], [x0, y1, z], [x1, y1, z]], 'wood_siding', { tint, uvOffset: [o.seed * 0.37, o.seed * 0.71] });
  const b = 0.075, d = 0.025, bt = shadeHex(tint, 0.85);
  const bat = (cx, cy, w, h, rz = 0) => kit.at({ x: cx, y: cy, z: z - d / 2, rz }, () => kit.box({ x: 0, y: -h / 2, z: 0, w, h, d, mat: 'wood_planks', tint: bt, faces: { pz: false }, uvOffset: [o.seed, 0] }));
  bat((x0 + x1) / 2, y0 + b / 2, x1 - x0, b); bat((x0 + x1) / 2, y1 - b / 2, x1 - x0, b);
  bat(x0 + b / 2, (y0 + y1) / 2, b, y1 - y0 - 2 * b); bat(x1 - b / 2, (y0 + y1) / 2, b, y1 - y0 - 2 * b);
  const dl = Math.hypot(x1 - x0 - 2 * b, y1 - y0 - 2 * b);
  bat((x0 + x1) / 2, (y0 + y1) / 2, b, dl, Math.atan2(x1 - x0 - 2 * b, y1 - y0 - 2 * b) * (o.seed % 2 ? 1 : -1));
  if (o.seed % 3 === 0) kit.at({ rot: PI }, () => text(kit, 'FRAGILE', { x: -(x0 + x1) / 2, y: (y0 + y1) / 2 + 0.12, h: 0.07, t: 0.014, mat: 'sign_red', tint: '#ffffff', align: 'center', z: -z + 0.03 }));
}

/** Perforated steel ramp (north side frame): grate plate on a dark backing, C-channel stringers, toe + top hook. */
function fortRamp(kit, F) {
  const H = F.half, CH = F.deckY, R = F.rampSpec;
  const u0 = -1.4, u1 = u0 + R.width, vf = -H - R.length, vt = -H;
  const yAt = (v) => ((v - vf) / (vt - vf)) * CH;
  const A = [u0, 0.03, vf], B = [u1, 0.03, vf], C = [u1, CH + 0.01, vt], D = [u0, CH + 0.01, vt];
  kit.face([A, D, C, B], 'perf_plate', { tint: '#d0d0cc' });
  const off = 0.035;
  kit.face([[u0 + 0.02, 0.03 - off, vf + 0.05], [u0 + 0.02, CH + 0.01 - off, vt], [u1 - 0.02, CH + 0.01 - off, vt], [u1 - 0.02, 0.03 - off, vf + 0.05]], 'steel', { tint: '#6c6b66' });
  // stringers with an upturned kick lip on both edges
  for (const [u, s] of [[u0, -1], [u1, 1]]) {
    kit.sweep([[-0.012, -0.2], [0.012, -0.2], [0.012, 0.06], [-0.012, 0.06]], [[u + s * 0.012, 0.03, vf], [u + s * 0.012, CH + 0.01, vt]], 'steel_dark', { caps: true, tint: '#4a4844' });
    kit.sweep([[-0.04, -0.2], [0.04, -0.2], [0.04, -0.185], [-0.04, -0.185]], [[u + s * 0.03, 0.03, vf + 0.3], [u + s * 0.03, CH + 0.01, vt]], 'steel_dark', { caps: true, tint: '#3e3c39' });
  }
  // cross bearers under the plate + a mid-span trestle
  for (const t of [0.25, 0.5, 0.75]) {
    const v = lerp(vf, vt, t), y = yAt(v) - 0.06;
    kit.box({ x: (u0 + u1) / 2, y: y - 0.08, z: v, w: R.width, h: 0.08, d: 0.06, mat: 'steel_dark', tint: '#3b3936' });
  }
  const vm = lerp(vf, vt, 0.55), ym = yAt(vm) - 0.14;
  for (const u of [u0 + 0.15, u1 - 0.15]) kit.box({ x: u, y: 0, z: vm, w: 0.08, h: ym, d: 0.08, mat: 'steel_dark', tint: '#45433f' });
  kit.box({ x: (u0 + u1) / 2, y: ym * 0.35, z: vm, w: R.width - 0.3, h: 0.06, d: 0.05, mat: 'steel_dark', tint: '#45433f' });
  // toe plate + top hook lying on the container roof (welded lugs)
  kit.at({ x: (u0 + u1) / 2, y: 0.0, z: vf, rx: -0.4 }, () => kit.box({ x: 0, y: 0, z: -0.06, w: R.width, h: 0.012, d: 0.16, mat: 'steel_dark', tint: '#4a4844' }));
  kit.box({ x: (u0 + u1) / 2, y: CH - 0.002, z: vt + 0.15, w: R.width, h: 0.014, d: 0.3, mat: 'ct_tread', tint: '#9a9a96' });
  for (const u of [u0 + 0.25, (u0 + u1) / 2, u1 - 0.25]) kit.box({ x: u, y: CH + 0.012, z: vt + 0.15, w: 0.08, h: 0.02, d: 0.08, mat: 'steel_dark' });
  // solid wedge collision (nothing can go under the ramp), grate impact surface
  const Pw = (p) => kit.W(p);
  const a = Pw([u0, 0, vf]), b = Pw([u1, 0, vf]), c = Pw([u1, CH, vt]), d = Pw([u0, CH, vt]), e = Pw([u0, 0, vt]), f = Pw([u1, 0, vt]);
  kit.colTris([...a, ...d, ...c, ...a, ...c, ...b, ...a, ...e, ...d, ...b, ...c, ...f], 'grate');
}

/** Fort core: I-beams on the container tops carrying corrugated sheets, loose rusty sheets, planks, hatches, kit. */
function fortCore(kit, F, IN, CH) {
  // corrugated sheets between the beams (ribs along v)
  const sheets = [[-IN, -IN, -1.95, -0.04, '#a9b2b0'], [-IN, -0.04, -1.95, IN, '#b3b8ae'], [-1.95, -IN, 1.95, -0.04, '#9fa9a8'], [-1.95, -0.04, 1.95, IN, '#aeb3a8'], [1.95, -IN, IN, -0.04, '#a5ada9'], [1.95, -0.04, IN, IN, '#b6b9ae']];
  for (const [x0, z0, x1, z1, t] of sheets) kit.face([[x0, CH + 0.005, z1], [x1, CH + 0.005, z1], [x1, CH + 0.005, z0], [x0, CH + 0.005, z0]], 'metal_container', { tint: t, uvLocal: true, uvOffset: [x0 * 0.3, z0 * 0.2] });
  // I-beam top flanges showing between the sheets (u = -1.95, 1.95) + a cross beam at v = 0
  for (const x of [-1.95, 1.95]) kit.box({ x, y: CH - 0.02, z: 0, w: 0.2, h: 0.036, d: 2 * IN + 0.3, mat: 'steel_dark', tint: '#5f5953' });
  kit.box({ x: 0, y: CH - 0.02, z: -0.04, w: 2 * IN + 0.3, h: 0.034, d: 0.16, mat: 'steel_dark', tint: '#5f5953' });
  // loose rusty sheets lying across seams (3 cm proud) - pinwheel order
  const loose = [[-3.6, -2.2, 2.4, 1.1, 0.12], [2.1, -3.6, 1.1, 2.6, 0.08], [3.3, 2.4, 2.3, 1.1, -0.15], [-2.4, 3.1, 1.1, 2.5, 0.2], [0.6, 0.9, 2.2, 1.0, 0.5]];
  loose.forEach(([x, z, w, d, r], i) => kit.box({ x, y: CH + 0.012, z, w, h: 0.02, d, rot: r, mat: ['metal_worn', 'metal_painted', 'metal_worn', 'corrugated', 'metal_painted'][i], tint: ['#c98a5a', '#e8c8b8', '#b4a89a', '#c8c0b0', '#ffffff'][i], uvLocal: true, uvOffset: [x, z], faces: { bottom: false } }));
  // plank boards (paired) bridging the joints between containers and the core; grain along each board
  const planks = [[-2.81, -1.2, 0.3, 3.1, 0.06], [1.2, -2.81, 3.0, 0.3, -0.05], [2.81, 1.4, 0.3, 2.9, 0.1], [-1.0, 2.81, 2.8, 0.3, 0.04], [-4.0, 0.2, 0.28, 2.6, -0.12], [4.1, -0.5, 0.28, 2.5, 0.07]];
  planks.forEach(([x, z, w, d, r], i) => kit.at({ x, y: CH + 0.004, z, rot: r + (w < d ? 0 : PI / 2) }, () => {
    const bw = Math.min(w, d), len = Math.max(w, d);
    for (const off of [-0.17, 0.17]) kit.box({ x: off, y: 0, z: 0, w: bw, h: 0.035, d: len + (off > 0 ? -0.2 : 0), mat: 'wood_siding', tint: ['#a48c72', '#97806a', '#ae9478'][i % 3], uvLocal: true, uvRot: -PI / 2, uvOffset: [i * 0.37, 0], faces: { bottom: false } });
  }));
  for (const [x, z, w, d, r] of planks) kit.colBox({ x, y: CH, z, w: w + (w < d ? 0.34 : 0), h: 0.04, d: d + (w < d ? 0 : 0.34), rot: r }, 'wood');
  // supply hatches (FORT_HATCH_1/2): raised steel frame, checker lid, handle, amber strobe lens (dark until ready)
  for (const h of F.hatches) {
    const [lu, lv] = [h.local.u, h.local.v];
    kit.at({ x: lu, y: CH, z: lv }, () => {
      kit.box({ x: 0, y: 0, z: 0, w: h.size[0] + 0.16, h: h.h - 0.02, d: h.size[1] + 0.16, mat: 'steel_dark', tint: '#55524d', faces: { bottom: false } });
      kit.box({ x: 0, y: h.h - 0.02, z: 0, w: h.size[0], h: 0.02, d: h.size[1], mat: 'ct_tread', tint: '#a8aaa6', faces: { bottom: false } });
      kit.box({ x: 0.1, y: h.h, z: 0, w: 0.34, h: 0.03, d: 0.04, mat: 'steel', tint: '#c9c3b2' });
      kit.cyl({ x: -h.size[0] / 2 + 0.12, y: h.h, z: -h.size[1] / 2 + 0.12, r: 0.05, h: 0.05, seg: 10, mat: 'lamp_off', tint: '#e09a3a' });
    });
    kit.colBox({ x: lu, y: CH, z: lv, w: h.size[0] + 0.16, h: h.h, d: h.size[1] + 0.16 }, 'metal');
  }
  // field radio crate, ammo cans, spent brass, a dropped jerrycan
  kit.at({ x: 3.6, y: CH + 0.02, z: -3.9, rot: 0.3 }, () => {
    kit.bbox({ x: 0, y: 0, z: 0, w: 0.62, h: 0.42, d: 0.42, bevel: 0.025, mat: 'steel', tint: '#58603f' });
    kit.box({ x: 0, y: 0.42, z: 0, w: 0.5, h: 0.05, d: 0.32, mat: 'car_plastic', tint: '#2a2b26' });
    for (const x of [-0.15, 0, 0.15]) kit.cyl({ x, y: 0.47, z: 0.05, r: 0.025, h: 0.03, seg: 8, mat: 'car_plastic' });
    kit.cyl({ x: 0.22, y: 0.47, z: -0.1, r: 0.008, h: 1.3, seg: 4, mat: 'steel_dark' });
    kit.box({ x: -0.1, y: 0.47, z: -0.08, w: 0.16, h: 0.01, d: 0.1, mat: 'lamp_green' });
  });
  kit.colBox({ x: 3.6, y: CH, z: -3.9, w: 0.62, h: 0.47, d: 0.42, rot: 0.3 }, 'metal');
  for (const [x, z, r] of [[-3.9, 3.7, 0.4], [-3.3, 3.9, 1.9]]) kit.at({ x, y: CH + 0.004, z, rot: r }, () => {
    kit.bbox({ x: 0, y: 0, z: 0, w: 0.28, h: 0.18, d: 0.15, bevel: 0.012, mat: 'steel', tint: '#4f5638' });
    kit.box({ x: 0, y: 0.18, z: 0, w: 0.12, h: 0.02, d: 0.03, mat: 'steel_dark' });
  });
  kit.at({ x: -1.8, y: CH + 0.004, z: -3.7, rot: 1.2, rz: PI / 2 }, () => kit.bbox({ x: 0, y: -0.09, z: 0, w: 0.34, h: 0.18, d: 0.46, bevel: 0.02, mat: 'steel', tint: '#7a5b2c' }));
  for (let i = 0; i < 26; i++) {
    const a = kit.rnd(0, PI * 2), rr = kit.rnd(0.2, 1.6), cx = (i % 2 ? -2.6 : 2.9) + Math.cos(a) * rr, cz = (i % 3 ? 2.9 : -2.7) + Math.sin(a) * rr * 0.7;
    kit.at({ x: cx, y: CH + 0.012, z: cz, rot: kit.rnd(0, PI), rz: PI / 2 }, () => kit.cyl({ x: 0, y: -0.025, z: 0, r: 0.0055, h: 0.05, seg: 5, mat: 'car_chrome', tint: '#c49a4c', caps: false }));
  }
  // grime on the deck
  for (const [x, z, s, r, m] of [[-3.8, -4.0, 1.6, 0.3, 'decal_stain'], [4.1, -1.5, 1.4, 1.1, 'decal_dirt'], [1.2, 4.2, 1.8, 2.0, 'decal_stain'], [-4.2, 1.8, 1.2, 0.7, 'decal_dirt'], [0.2, -0.6, 2.2, 0.4, 'decal_dirt']]) kit.decal({ at: [x, z], size: s, rot: r, mat: m, y: CH - 0.003 });
}

/** Tarp draped over the deck edge (north-side frame): lies on the roof, folds over the edge, hangs down the side. */
function tarpOverEdge(kit, o) {
  const { x0, x1, z, top, drop } = o;
  const P = [[0.8, 0.0], [0.05, 0.0], [-0.06, -0.18], [-0.1, -drop * 0.55], [-0.04, -drop]];
  for (let i = 0; i < P.length - 1; i++) {
    const [za, ya] = P[i], [zb, yb] = P[i + 1];
    const wob = (s) => Math.sin(s * 5.1 + i) * 0.05;
    kit.face([[x0 + wob(0), top + ya + 0.02, z + za], [x1 + wob(1), top + ya + 0.02, z + za], [x1 + wob(2) - (i > 2 ? 0.15 : 0), top + yb + 0.02, z + zb], [x0 + wob(3) + (i > 2 ? 0.1 : 0), top + yb + 0.02, z + zb]].reverse(), 'ct_fabric', { tint: o.tint });
  }
}

// ==================================================================================================== buildings
// Every corner block is a kit.building() shell whose openings are all given explicitly (ground: 'blank' +
// blankFloors), so facade decoration (hoods, balconettes, pilasters, signs) can be placed against known windows.
// Faces are named by their outward normal: N S E W, C = the 45 deg chamfer. Hidden party walls only get their
// upper part (above the neighbouring block) as a plain wall with a few windows.
const WIN_STATES = { glass: 0.36, dark: 0.3, broken: 0.24, boarded: 0.1 };
const range = (a, b) => Array.from({ length: Math.max(0, b - a) }, (_, i) => a + i);
function faceOf(n) { if (n[1] < -0.9) return 'N'; if (n[1] > 0.9) return 'S'; if (n[0] > 0.9) return 'E'; if (n[0] < -0.9) return 'W'; return 'C'; }
/** Local x on edge e of a world point [x, z]. */
const lx = (e, p) => ((p[0] - e.a[0]) * (e.b[0] - e.a[0]) + (p[1] - e.a[1]) * (e.b[1] - e.a[1])) / e.L;
/** Local x of a world coordinate along the face axis (z for E/W faces, x for N/S faces, 0..1 fraction for C). */
const ax = (e, v) => (e.face === 'C' ? v * e.L : lx(e, e.face === 'E' || e.face === 'W' ? [e.a[0], v] : [v, e.a[1]]));
/** Opening spanning world axis values v0..v1 on edge e. */
const span = (e, v0, v1, o) => { const x0 = ax(e, v0), x1 = ax(e, v1); return { x: Math.min(x0, x1), w: Math.abs(x1 - x0), ...o }; };

/** Upper-floor window openings on one face. */
function windowOps(kit, ctx, o) {
  const out = [];
  for (let f = o.from ?? 1; f <= (o.to ?? ctx.n - 1); f++) for (let k = 0; k < o.cols.length; k++) {
    if (o.skip?.(f, k)) continue;
    const fh = ctx.fl[f], sill = o.sill ?? 0.9;
    let op = {
      cx: o.cols[k], w: o.w, y: ctx.bases[f] + sill, h: Math.min(o.h, fh - sill - 0.3), type: 'window', state: wpick(kit, o.states || WIN_STATES),
      lintel: o.lintel, trimTint: o.trimTint, sillMat: o.sillMat, frame: o.frame, mullions: o.mullions, roomTint: kit.pick(['#3c3a36', '#46423c', '#353432', '#4a4540']),
      ac: kit.chance(o.ac ?? 0.08), streak: kit.chance(o.streak ?? 0.45),
    };
    if (o.mod) op = o.mod(f, k, op) || op;
    if (op) out.push(op);
  }
  return out;
}

/** Corner block: shell + per-face decoration + upper party walls. b: { poly, floors, opts, faces: { F: { openings(e, ctx), decor(e, ctx) } }, back: { F: { from, cols, w, h, floors } }, extra(ctx) } */
function cornerBlock(kit, b) {
  const P = ensureCCW(b.poly);
  const fl = b.floors, n = fl.length;
  const bases = fl.map((_, i) => fl.slice(0, i).reduce((s, v) => s + v, 0));
  const height = bases[n - 1] + fl[n - 1];
  const edges = P.map((a, i) => {
    const bb = P[(i + 1) % P.length], L = dist2(a, bb);
    const nn = [-(bb[1] - a[1]) / L, (bb[0] - a[0]) / L];
    return { i, a, b: bb, L, n: nn, face: faceOf(nn) };
  });
  const ctx = { bases, fl, height, edges, n, face: {} };
  for (const e of edges) ctx.face[e.face] = e;
  const sides = edges.map((e) => {
    const f = b.faces[e.face];
    if (!f) return { type: 'hidden' };
    return { type: 'facade', ground: 'blank', blankFloors: range(1, n), openings: f.openings ? f.openings(e, ctx) : [], pipes: f.pipes ?? false, room: f.room };
  });
  let info = null;
  kit.at({ y: BY }, () => {
    info = kit.building({ ...b.opts, poly: P, floors: fl, sides });
    for (const e of edges) {
      const f = b.faces[e.face];
      if (f?.decor) kit.at(edgeFrame(e.a, e.b), () => f.decor(e, ctx));
      const bk = b.back?.[e.face];
      if (!f && bk) {
        const from = bk.from, ops = [];
        for (const fi of bk.floors || []) for (const cx of bk.cols || []) ops.push({ cx, w: bk.w ?? 1.1, y: bases[fi] + 0.9 - from, h: Math.min(bk.h ?? 1.6, fl[fi] - 1.2), type: 'window', state: wpick(kit, WIN_STATES), roomTint: '#3c3a36', lintel: b.opts.trim, trimTint: b.opts.trimTint, streak: kit.chance(0.5) });
        kit.wall({ a: e.a, b: e.b, y0: from, h: height - from, t: 0.35, mat: b.opts.mat, tint: shadeHex(b.opts.tint || '#ffffff', bk.shade ?? 0.88), grime: null, collide: false, openings: ops, room: 0.8, bands: [] });
      }
    }
    b.extra?.(ctx);
  });
  return { info, ctx };
}

// ---------------------------------------------------------------- C_NW Hotel Ashford (limestone_grand, 9F)
function buildingNW(kit, L) {
  const B = L.BUILDINGS.find((b) => b.id === 'C_NW');
  const STONE = '#eef0f2', WALL = '#d3d7dc';
  const win = { w: 1.3, h: 2.0, sill: 0.85, lintel: false, frame: 'frame_dark', sillMat: TRIM, trimTint: STONE, ac: 0.06, streak: 0.55 };
  const states = (f) => (f === 1 ? { glass: 0.2, dark: 0.25, broken: 0.3, boarded: 0.25 } : WIN_STATES);
  const colsE = [1.8, 4.95, 8.1], colsS = [2.9, 6.05, 9.2], colsC = [1.6, 4.245, 6.89];
  const upper = (cols, w = win.w, skip) => (e, ctx) => windowOps(kit, ctx, { ...win, w, cols, skip, mod: (f, k, op) => { op.state = wpick(kit, states(f)); if (f === 8) op.h = 1.55; return op; } });
  const decorUpper = (balcony) => (e, ctx, ops) => {
    for (const op of ops) {
      const fi = ctx.bases.findIndex((b) => Math.abs(b + win.sill - op.y) < 0.01);
      if (fi === 8) hood(kit, op, 'arch', { tint: STONE, mat: TRIM });
      else if (fi === 3 || fi === 5) hood(kit, op, 'pediment', { tint: STONE, mat: TRIM });
      else if (fi >= 1) hood(kit, op, 'key', { tint: STONE, mat: TRIM });
      if ((fi === 2 || fi === 7) && balcony(op)) balconette(kit, op, { tint: STONE, mat: TRIM });
    }
  };
  const groundE = (e) => [
    span(e, -15.5, -16.5, { y: 0, h: 2.7, type: 'door', state: 'closed', door: 'wood_planks', doorTint: '#6b4a32', window: true }),
    span(e, -17.3, -20.5, { y: 0, h: 3.7, type: 'shop', state: 'shutter', frame: 'frame_dark', shutterTint: '#9a9a92' }),
    span(e, -20.9, -24.1, { y: 0, h: 3.7, type: 'shop', state: 'shutter', frame: 'frame_dark', shutterTint: '#8c8f88' }),
    span(e, -24.7, -25.6, { y: 0, h: 2.6, type: 'door', state: 'closed', door: 'metal_painted', doorTint: '#59605a' }),
  ];
  const groundS = (e) => [
    span(e, -24.2, -20.8, { y: 0, h: 3.7, type: 'shop', state: 'broken', frame: 'sign_blue', kick: 'sign_blue' }),
    span(e, -20.4, -17.0, { y: 0, h: 3.7, type: 'shop', state: 'broken', frame: 'sign_blue', kick: 'sign_blue' }),
    span(e, -16.5, -15.6, { y: 0, h: 2.7, type: 'door', state: 'closed', door: 'metal_painted', doorTint: '#3c4d6b', window: true }),
  ];
  const groundC = () => [
    { x: 1.0, w: 1.3, y: 0, h: 2.9, type: 'door', state: 'closed', door: 'trim_wood', doorTint: '#a88a62', step: false },
    { x: 3.0, w: 2.49, y: 0, h: 3.4, type: 'door', state: 'closed', door: 'trim_wood', doorTint: '#b0916a', step: false },
    { x: 6.19, w: 1.3, y: 0, h: 2.9, type: 'door', state: 'closed', door: 'trim_wood', doorTint: '#a88a62', step: false },
    { x: 3.0, w: 2.49, y: 3.6, h: 0.75, type: 'window', state: 'dark', frame: 'frame_dark', sill: false, mullions: [3, 1] },
  ];
  const opsOf = {};
  const face = (name, ground, cols, w, balcony) => ({
    openings: (e, ctx) => { opsOf[name] = [...ground(e), ...upper(cols, w)(e, ctx)]; return opsOf[name]; },
    decor: (e, ctx) => {
      const ops = opsOf[name];
      decorUpper(balcony)(e, ctx, ops.filter((op) => op.type === 'window' && op.y > 4));
      // rusticated base: dark joints every 0.55 m up to the 3F belt, around the openings
      for (let y = 1.42; y < 8.1; y += 0.55) hBand(kit, e.L, ops, y, 0.035, { mat: 'trim_concrete', tint: '#77746c', d: 0.012 });
      // frieze + dentil course under the cornice
      kit.box({ x: e.L / 2, y: ctx.height - 1.25, z: 0.03, w: e.L + 0.08, h: 0.42, d: 0.06, mat: TRIM, tint: STONE, faces: { nz: false } });
      for (let x = 0.15; x < e.L - 0.1; x += 0.32) kit.box({ x, y: ctx.height - 0.72, z: 0.1, w: 0.14, h: 0.16, d: 0.12, mat: TRIM, tint: STONE, faces: { nz: false } });
      // 2F sill course
      kit.box({ x: e.L / 2, y: 8.3 + 0.62, z: 0.05, w: e.L + 0.06, h: 0.12, d: 0.1, mat: TRIM, tint: STONE, faces: { nz: false } });
      if (name === 'E') nwEast(kit, e, ctx, ops);
      if (name === 'S') nwSouth(kit, e, ctx, ops);
      if (name === 'C') nwChamfer(kit, e, ctx, ops);
    },
  });
  cornerBlock(kit, {
    poly: B.footprint, floors: B.floors,
    opts: {
      mat: 'plaster', tint: WALL, trim: TRIM, trimTint: STONE, plinth: { h: 0.9, mat: 'trim_concrete' },
      cornice: { h: 0.9, depth: 0.72, mat: TRIM }, quoins: true, belt: true, wallT: 0.4, streaks: 0.5,
      roof: { type: 'flat', parapet: B.parapet, mat: 'roof_tar', coping: TRIM, clutter: true }, grime: { y: 0, h: 2.6, k: 0.42 },
    },
    faces: {
      E: face('E', groundE, colsE, win.w, (op) => Math.abs(op.cx - 4.95) < 0.1),
      S: face('S', groundS, colsS, win.w, (op) => Math.abs(op.cx - 6.05) < 0.1),
      C: face('C', groundC, colsC, 1.15, () => true),
    },
    back: {
      N: { from: 23.2, floors: [7, 8], cols: [2.2, 6.4, 10.6, 14.8], w: 1.1 },
      W: { from: 19.4, floors: [7, 8], cols: [3.0, 8.5, 14.0], w: 1.1 },
    },
    extra: (ctx) => nwRoof(kit, ctx),
  });
}

function nwEast(kit, e, ctx, ops) {
  // tailor shop: fascia over both shutters, posters pasted on the shutters
  fascia(kit, { x0: ax(e, -17.2), x1: ax(e, -24.2), y: 3.85, h: 0.75, mat: 'sign_green', tint: '#7a9a80', text: 'A. KOVAC TAILOR', lh: [0.38], textMat: 'sign_white', textTint: '#efe6cc', serif: true, border: { mat: 'sign_yellow', tint: '#d8c48a' } });
  for (const [v, w, h, y, head] of [[-18.0, 0.7, 1.0, 1.1, 'LOST'], [-19.1, 0.6, 0.85, 1.5, null], [-22.0, 0.75, 1.05, 0.9, 'MISSING'], [-23.0, 0.6, 0.8, 1.7, null]]) poster(kit, ax(e, v) - w / 2, y, w, h, 0.04, { head, peel: kit.chance(0.5) });
  // HOTEL ASHFORD blade sign (layout along z -24.5..-23.5, y 7..19) with dead bulbs
  const bx = ax(e, -24.0), y0 = 7 - BY, hh = 12;
  for (const yy of [y0 + 0.4, y0 + hh / 2, y0 + hh - 0.4]) kit.box({ x: bx, y: yy, z: 0.65, w: 0.06, h: 0.08, d: 1.3, mat: 'steel_dark' });
  kit.at({ x: bx, y: 0, z: 0.25 + 0.55 }, () => {
    kit.bbox({ x: 0, y: y0, z: 0, w: 0.22, h: hh, d: 1.1, bevel: 0.03, mat: 'sign_red', tint: '#9a3a30' });
    for (const s of [-1, 1]) kit.at({ x: s * 0.112, rot: s * PI / 2 }, () => {
      kit.face([[-0.48, y0 + 0.12, 0], [0.48, y0 + 0.12, 0], [0.48, y0 + hh - 0.12, 0], [-0.48, y0 + hh - 0.12, 0]], 'sign_white', { tint: '#d9ccb0' });
      vtext(kit, 'HOTEL', { x: 0, yTop: y0 + hh - 0.45, h: 0.72, t: 0.13, mat: 'sign_red', tint: '#ffffff', z: 0.004, lead: 1.25 });
      vtext(kit, 'ASHFORD', { x: 0, yTop: y0 + hh - 5.2, h: 0.72, t: 0.13, mat: 'frame_dark', tint: '#5a2a22', z: 0.004, lead: 1.25 });
      for (let yy = y0 + 0.35; yy < y0 + hh - 0.3; yy += 0.55) for (const xx of [-0.4, 0.4]) kit.cyl({ x: xx, y: yy, z: 0.0, r: 0.035, h: 0.05, seg: 6, mat: 'lamp_off', rx: PI / 2 });
    });
  });
  void ops;
}

function nwSouth(kit, e, ctx, ops) {
  // blue shopfront behind a scissor gate, smashed glass on the sidewalk
  for (const op of ops.filter((o) => o.type === 'shop')) scissorGate(kit, op.x + 0.05, op.x + op.w - 0.05, 0.05, 3.3, 0.18);
  fascia(kit, { x0: ax(e, -24.4), x1: ax(e, -16.8), y: 3.85, h: 0.72, mat: 'sign_blue', tint: '#6c86b0', text: 'RADIO · REPAIRS', lh: [0.36], textMat: 'sign_white', textTint: '#f0ead8' });
  kit.at({ x: 0, y: 0, z: 0 }, () => {
    for (let i = 0; i < 22; i++) {
      const x = kit.rnd(ax(e, -24), ax(e, -17)), z = kit.rnd(0.25, 1.6), s = kit.rnd(0.05, 0.16);
      kit.upFace([[x, SW - BY + 0.004, z], [x + s, SW - BY + 0.004, z + kit.rnd(-0.05, 0.05)], [x + s * 0.4, SW - BY + 0.004, z + s]], 'glass_dirty', null, {});
    }
  });
  kit.wallLamp({ x: ax(e, -16.05), y: 3.2, on: false });
}

function nwChamfer(kit, e, ctx, ops) {
  const STONE = '#d9d4c9';
  // boarded lobby: plywood over the doors, graffiti, sandbag wall in front
  plywood(kit, 1.65, 0.0, 1.45, 2.95, 0.05, { mark: 'NO', markTint: '#ffffff' });
  plywood(kit, 4.25, 0.0, 2.6, 3.45, 0.06, { mark: 'KEEP OUT', markMat: 'sign_red' });
  plywood(kit, 6.84, 0.0, 1.45, 2.95, 0.05, { rz: 0.03 });
  for (const [x, y] of [[3.6, 0.5], [4.9, 0.5], [3.6, 2.6], [4.9, 2.6]]) kit.box({ x, y, z: 0.08, w: 0.08, h: 0.08, d: 0.02, mat: 'steel_dark' });
  kit.at({ x: 4.25, y: 1.7, z: 0.085, rz: 0.9 }, () => kit.box({ x: 0, y: -0.07, z: 0, w: 3.0, h: 0.14, d: 0.03, mat: 'wood_planks', tint: '#a08260' }));
  kit.at({ x: 4.25, y: 1.7, z: 0.1, rz: -0.9 }, () => kit.box({ x: 0, y: -0.07, z: 0, w: 3.0, h: 0.14, d: 0.03, mat: 'wood_planks', tint: '#9a7c5a' }));
  kit.at({ y: SW - BY }, () => {
    kit.sandbags([[0.9, 1.9], [3.6, 2.2]], { rows: 3 });
    kit.sandbags([[4.9, 2.25], [7.7, 1.85]], { rows: 3 });
  });
  // marquee canopy: dark steel slab with HOTEL ASHFORD letters and a row of dead bulbs underneath, chains to the wall
  const cy = 4.45, cd = 1.9;
  kit.box({ x: 4.245, y: cy, z: cd / 2 + 0.03, w: 7.2, h: 0.36, d: cd - 0.06, mat: 'metal_worn', tint: '#8f9488', faces: { nz: false } });
  kit.box({ x: 4.245, y: cy + 0.36, z: cd / 2, w: 7.25, h: 0.05, d: cd + 0.05, mat: 'steel', tint: '#a8a28f' });
  text(kit, 'HOTEL ASHFORD', { x: 4.245, y: cy + 0.08, h: 0.22, t: 0.04, mat: 'sign_white', tint: '#e9dfc2', align: 'center', z: cd + 0.004, serif: true });
  for (let x = 0.9; x < 7.7; x += 0.42) kit.cyl({ x, y: cy - 0.05, z: cd - 0.12, r: 0.04, h: 0.05, seg: 6, mat: 'lamp_off' });
  for (const x of [1.0, 7.5]) kit.sweep(circle(0.012, 4), [[x, cy + 0.38, cd - 0.1], [x, cy + 2.1, 0.05]], 'steel_dark', { smooth: true, up: [1, 0, 0] });
  // flag pole stubs over the entrance (one with a rotten flag)
  for (const [x, flag] of [[1.0, false], [7.5, true]]) kit.at({ x, y: 8.6, z: 0.1, rx: 0.65 }, () => {
    kit.cyl({ x: 0, y: 0, z: 0, r: 0.035, h: 2.6, seg: 6, mat: 'steel', tint: '#9c9686' });
    kit.cyl({ x: 0, y: 2.6, z: 0, r: 0.06, h: 0.08, seg: 8, mat: 'car_chrome', tint: '#c9a75a' });
    if (flag) kit.face([[0.03, 2.5, 0.03], [0.03, 1.2, 0.03], [0.35, 1.0, 0.2], [0.35, 2.3, 0.18]], 'ct_fabric', { tint: '#6e2a24' });
  });
  // LOST / TOWN letter boards (hero sign, y 10.5..16.8 world): 8 weathered cream boards on steel rails
  const bw = 1.6, bh = 2.1, gap = 0.3, x0 = (e.L - (4 * bw + 3 * gap)) / 2, zb = 0.55;
  const rows = [{ word: 'LOST', cy: 15.45 - BY, tilt: [0.03, -0.02, 0.07, -0.03], dy: [0, 0.05, -0.12, 0.02] }, { word: 'TOWN', cy: 12.15 - BY, tilt: [-0.02, 0.04, 0, 0.03], dy: [0.03, -0.04, 0, -0.06] }];
  for (const r of rows) {
    for (const yy of [r.cy + bh / 2 - 0.25, r.cy - bh / 2 + 0.25]) {
      kit.beam([x0 - 0.15, yy, zb - 0.1], [e.L - x0 + 0.15, yy, zb - 0.1], { kind: 'L', h: 0.1, w: 0.08, t: 0.01, tint: '#4e4a44' });
      for (const x of [x0 + 0.2, e.L / 2, e.L - x0 - 0.2]) kit.beam([x, yy + 0.04, 0.02], [x, yy + 0.04, zb - 0.08], { kind: 'box', h: 0.08, w: 0.08, tint: '#4e4a44' });
    }
    [...r.word].forEach((ch, i) => {
      const cx = x0 + bw / 2 + i * (bw + gap);
      const hanging = r.word === 'TOWN' && i === 2;
      if (hanging) {
        // one board slipped off its top-right hook: hangs from its top-left corner by a chain
        const px = cx - bw / 2 + 0.05, py = r.cy + bh / 2 - 0.25;
        kit.at({ x: px, y: py - 0.35, z: zb + 0.02, rz: -0.42 }, () => letterBoard(kit, ch, bw, bh, bw / 2 - 0.05, -bh / 2 + 0.05));
        kit.sweep(circle(0.014, 4), [[px, py, zb - 0.05], [px + 0.02, py - 0.18, zb + 0.02], [px, py - 0.35, zb + 0.03]], 'steel', { smooth: true, tint: '#6d6a64', up: [1, 0, 0] });
      } else {
        kit.at({ x: cx, y: r.cy + r.dy[i], z: zb, rz: r.tilt[i], rot: (i - 1.5) * 0.015 }, () => letterBoard(kit, ch, bw, bh, 0, 0));
      }
    });
  }
  // corner pilaster strips framing the chamfer
  for (const x of [0.12, e.L - 0.12]) kit.box({ x, y: 0.9, z: 0.05, w: 0.24, h: ctx.height - 2.2, d: 0.1, mat: TRIM, tint: STONE, faces: { nz: false } });
  void ops;
}

/** A weathered cream letter board (board-local, centred at (ox, oy) relative to the pivot). */
function letterBoard(kit, ch, bw, bh, ox, oy) {
  kit.box({ x: ox, y: oy - bh / 2, z: 0, w: bw, h: bh, d: 0.05, mat: 'sign_white', tint: '#e4d7b6', uvOffset: [kit.rnd(0, 4), kit.rnd(0, 4)] });
  kit.box({ x: ox, y: oy - bh / 2 + 0.02, z: -0.05, w: bw - 0.1, h: bh - 0.04, d: 0.05, mat: 'steel_dark', tint: '#4a4640', faces: { pz: false } });
  kit.at({ x: ox, y: oy, z: 0.026 }, () => {
    for (const [a, b] of [[[-bw / 2 + 0.1, -bh / 2 + 0.1], [bw / 2 - 0.1, -bh / 2 + 0.1]], [[bw / 2 - 0.1, -bh / 2 + 0.1], [bw / 2 - 0.1, bh / 2 - 0.1]], [[bw / 2 - 0.1, bh / 2 - 0.1], [-bw / 2 + 0.1, bh / 2 - 0.1]], [[-bw / 2 + 0.1, bh / 2 - 0.1], [-bw / 2 + 0.1, -bh / 2 + 0.1]]]) {
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy), nx = (-dy / l) * 0.02, ny = (dx / l) * 0.02;
      kit.face([[a[0] - nx, a[1] - ny, 0], [b[0] - nx, b[1] - ny, 0], [b[0] + nx, b[1] + ny, 0], [a[0] + nx, a[1] + ny, 0]], 'frame_dark', { tint: '#5c4634' });
    }
    text(kit, ch, { x: 0, y: -0.68, h: 1.36, t: 0.2, mat: 'frame_dark', tint: '#2d221a', align: 'center', z: 0.002, serif: true });
    // rain streaks running down from the top edge
    for (let i = 0; i < 2; i++) {
      const sx = kit.rnd(-0.6, 0.5), sw = kit.rnd(0.18, 0.4), len = kit.rnd(0.6, 1.5);
      kit.face([[sx, bh / 2 - 0.05 - len, 0.004], [sx + sw, bh / 2 - 0.05 - len, 0.004], [sx + sw, bh / 2 - 0.05, 0.004], [sx, bh / 2 - 0.05, 0.004]], 'decal_streak', { uvs: [[0, 0], [0.5, 0], [0.5, 1], [0, 1]] });
    }
  });
  // two hooks on the top edge
  for (const s of [-1, 1]) kit.box({ x: ox + s * (bw / 2 - 0.2), y: oy + bh / 2 - 0.05, z: -0.04, w: 0.05, h: 0.16, d: 0.08, mat: 'steel_dark' });
}

function nwRoof(kit, ctx) {
  const R = ctx.height;
  // wooden water tower on steel legs, iron hoops round the staves
  kit.waterTower({ at: [-21.4, -21.2], y: R + 0.02, h: 3.3, r: 1.75, tankH: 3.3, mat: 'wood_planks', tint: '#a99178' });
  for (let i = 0; i < 4; i++) {
    const yy = R + 3.35 + 0.3 + i * 0.85, ring = circle(1.77, 20).map(([x, z]) => [-21.4 + x, yy, -21.2 - z]);
    kit.sweep(rectProf(0.03, 0.05), [...ring, ring[0]], 'steel_dark', { tint: '#4b4540' });
  }
  // elevator penthouse with a door, roof slab and a lattice antenna mast
  kit.at({ x: -13.9, y: R, z: -22.0 }, () => {
    kit.box({ x: 0, y: 0, z: 0, w: 3.4, h: 3.1, d: 3.0, mat: 'brick_painted', tint: '#b8b2a2', collide: true, faces: { bottom: false } });
    kit.box({ x: 0, y: 3.1, z: 0, w: 3.6, h: 0.2, d: 3.2, mat: 'trim_concrete' });
    kit.box({ x: 0.6, y: 0, z: 1.51, w: 0.95, h: 2.1, d: 0.04, mat: 'metal_painted', tint: '#6b6f66' });
    kit.cyl({ x: -1.1, y: 3.3, z: -0.9, r: 0.06, h: 6.5, seg: 6, mat: 'steel', tint: '#8a8a84' });
    for (let i = 1; i < 4; i++) kit.box({ x: -1.1, y: 3.3 + i * 1.6, z: -0.9, w: 0.9 - i * 0.18, h: 0.03, d: 0.03, mat: 'steel_dark' });
    for (const [dx, dz] of [[1.4, 0.4], [-0.6, 1.3]]) kit.sweep(circle(0.006, 4), [[-1.1, 8.0, -0.9], [-1.1 + dx * 1.8, 0.05, -0.9 + dz * 1.8]], 'wire', { smooth: true });
  });
}

// ---------------------------------------------------------------- C_NE billboard building (stone_office, 6F)
function buildingNE(kit, L) {
  const B = L.BUILDINGS.find((b) => b.id === 'C_NE');
  const STONE = '#f4efe6', WALL = '#e8dcc6';
  const win = { w: 1.6, h: 1.85, sill: 0.8, frame: 'frame_dark', sillMat: TRIM, trimTint: STONE, mullions: [3, 2], ac: 0.1, streak: 0.5 };
  const colsW = [1.9, 5.5, 9.1], colsS = [1.9, 5.5, 9.1], colsC = [1.45, 4.245, 7.04];
  const opsOf = {};
  const upper = (cols, w, mod) => (ctx) => windowOps(kit, ctx, { ...win, w, cols, mod });
  const face = (name, ground, cols, w, decor, mod) => ({
    openings: (e, ctx) => { opsOf[name] = [...ground(e), ...upper(cols, w, mod)(ctx)]; return opsOf[name]; },
    decor: (e, ctx) => {
      const ops = opsOf[name];
      // pilasters between the bays (granite base course -> cornice), sill + lintel bands per floor
      const piers = [0.15, ...cols.slice(0, -1).map((c, i) => (c + cols[i + 1]) / 2), e.L - 0.15];
      for (const x of piers) kit.box({ x, y: 4.5, z: 0.04, w: x < 0.2 || x > e.L - 0.2 ? 0.3 : 0.42, h: ctx.height - 5.1, d: 0.08, mat: TRIM, tint: STONE, faces: { nz: false } });
      for (const op of ops.filter((o) => o.type === 'window' && o.y > 4)) kit.box({ x: op.cx, y: op.y + op.h + 0.05, z: 0.03, w: op.w + 0.3, h: 0.22, d: 0.06, mat: TRIM, tint: STONE, faces: { nz: false } });
      // granite ground storey cladding on the piers
      hBand(kit, e.L, ops, 1.0, 3.25, { mat: 'concrete_dirty', tint: '#9a8f86', d: 0.05 });
      decor?.(e, ctx, ops);
    },
  });
  const groundW = (e) => [
    span(e, -16.8, -20.2, { y: 0, h: 3.5, type: 'shop', state: 'glass', frame: 'sign_red', kick: 'trim_metal' }),
    span(e, -20.6, -24.0, { y: 0, h: 3.5, type: 'shop', state: 'dark', frame: 'sign_red', kick: 'trim_metal' }),
    span(e, -24.6, -25.6, { y: 0, h: 2.8, type: 'door', state: 'closed', door: 'metal_painted', doorTint: '#3a3d38', window: true }),
  ];
  const groundS = (e) => [
    span(e, 16.6, 23.4, { y: 0, h: 3.6, type: 'shop', state: 'glass', frame: 'sign_blue', kick: 'sign_blue', mullions: [3, 1] }),
    span(e, 24.0, 25.2, { y: 0, h: 2.8, type: 'door', state: 'closed', door: 'metal_painted', doorTint: '#3c4d6b' }),
  ];
  const groundC = () => [
    { x: 0.7, w: 2.6, y: 0, h: 3.0, type: 'shop', state: 'broken', frame: 'sign_green', kick: 'sign_green' },
    { x: 3.62, w: 1.25, y: 0, h: 2.6, type: 'door', state: 'closed', door: 'glass_dirty', frame: 'sign_green', step: false },
    { x: 5.19, w: 2.6, y: 0, h: 3.0, type: 'shop', state: 'glass', frame: 'sign_green', kick: 'sign_green' },
  ];
  cornerBlock(kit, {
    poly: B.footprint, floors: B.floors,
    opts: {
      mat: 'plaster', tint: WALL, trim: TRIM, trimTint: STONE, plinth: { h: 0.55, mat: 'concrete_dirty' },
      cornice: { h: 0.55, depth: 0.5, mat: TRIM }, quoins: false, belt: true, wallT: 0.38, streaks: 0.5,
      roof: { type: 'flat', parapet: B.parapet, mat: 'roof_tar', coping: TRIM, clutter: true }, grime: { y: 0, h: 2.2, k: 0.4 },
    },
    faces: {
      W: face('W', groundW, colsW, win.w, (e, ctx, ops) => {
        fascia(kit, { x0: ax(e, -16.6), x1: ax(e, -24.2), y: 3.7, h: 0.62, mat: 'sign_red', tint: '#d8d0c8', text: 'SHOE REPAIR · KEYS', lh: [0.3], textMat: 'sign_white', textTint: '#f3ead6' });
        for (const op of ops.filter((o) => o.type === 'shop')) for (let i = 0; i < 4; i++) poster(kit, op.x + 0.15 + i * (op.w - 0.3) / 4, kit.rnd(0.6, 1.4), (op.w - 0.4) / 4, kit.rnd(0.8, 1.2), -0.2, { head: kit.pick(['SALE', 'WANTED', 'CLOSED', null]) });
      }),
      S: face('S', groundS, colsS, win.w, (e, ctx, ops) => {
        const op = ops[0];
        shutterFace(kit, op.x + 0.05, op.x + op.w - 0.05, 0.92, op.h - 0.05, 0.03, '#a9a296');   // half-down roller shutter (collision closed)
        kit.colBox({ x: op.x + op.w / 2, y: 0, z: -0.15, w: op.w, h: op.h, d: 0.3 }, 'metal');
        fascia(kit, { x0: op.x - 0.2, x1: op.x + op.w + 0.2, y: 3.75, h: 0.62, mat: 'sign_blue', tint: '#8aa0c4', text: 'RADIO · TV · PARTS', lh: [0.3], textMat: 'sign_white', textTint: '#f0ead8' });
        for (let i = 0; i < 3; i++) poster(kit, op.x + 0.6 + i * 2.1, 1.3 + kit.rnd(0, 0.6), 0.6, 0.85, 0.06, { head: kit.pick(['LOST', 'MISSING', null]), peel: true });
      }),
      C: face('C', groundC, colsC, 1.4, (e, ctx, ops) => neChamfer(kit, e, ctx, ops), (f, k, op) => { if (f === 1 && k === 1) { op.state = 'broken'; op.ac = false; } return op; }),
    },
    extra: (ctx) => neBillboards(kit, ctx),
  });
}

function neChamfer(kit, e, ctx, ops) {
  // corner cafe: torn red/white awning, green fascia, chairs stacked behind the glass
  fascia(kit, { x0: 0.5, x1: e.L - 0.5, y: 3.75, h: 0.68, mat: 'sign_green', tint: '#5f8466', text: 'CORNER CAFE', lh: [0.36], textMat: 'sign_white', textTint: '#efe4c8', serif: true, border: { mat: 'sign_white', tint: '#e0d6bc' } });
  stripedAwning(kit, { x0: 0.45, x1: e.L - 0.45, y: 3.55, depth: 1.7, drop: 0.62, colors: ['#9e2a22', '#e8e2d4'], torn: [3, 4, 5, 12, 13], hang: [4, 13] });
  for (const op of ops.filter((o) => o.type === 'shop')) for (let i = 0; i < 2; i++) {
    const cx = op.x + 0.7 + i * 1.2, z = -0.6;
    for (let s = 0; s < 3; s++) kit.at({ x: cx, y: 0.45 + s * 0.42, z, rot: s * 0.1 }, () => {
      kit.box({ x: 0, y: 0, z: 0, w: 0.42, h: 0.03, d: 0.42, mat: 'trim_wood', tint: '#7a5a3c' });
      kit.box({ x: 0, y: 0.03, z: -0.19, w: 0.42, h: 0.42, d: 0.03, mat: 'trim_wood', tint: '#6a4a30' });
    });
  }
  // the smashed 2F window SP_C_WIN_NE: frame torn out, shards on the plaza below
  const sp = ops.find((o) => o.type === 'window' && Math.abs(o.cx - 4.245) < 0.1 && o.y < 6);
  if (sp) {
    kit.at({ x: sp.cx - 0.3, y: sp.y + 0.1, z: 0.12, rz: 0.6 }, () => kit.box({ x: 0, y: 0, z: 0, w: 0.05, h: 1.2, d: 0.05, mat: 'frame_dark' }));
    kit.at({ y: SW - BY + 0.004 }, () => { for (let i = 0; i < 16; i++) { const x = sp.cx + kit.rnd(-1.4, 1.4), z = kit.rnd(0.3, 2.6), s = kit.rnd(0.06, 0.18); kit.upFace([[x, 0, z], [x + s, 0, z + kit.rnd(-0.05, 0.05)], [x + s * 0.3, 0, z + s]], 'glass_dirty', null, {}); } });
  }
  kit.wallLamp({ x: 0.35, y: 3.1, on: false });
}

/** Three rooftop billboards on a steel catwalk frame wrapping the chamfer (y 22.5..27 world). */
function neBillboards(kit, ctx) {
  const R = ctx.height;                         // 21.5 (+ parapet 1.0)
  const yb = 23.25 - BY, hb = 3.9, zf = 0.32;   // board bottom, height, front plane offset from the facade
  const boards = [
    { face: 'W', x0: 2.0, x1: 10.85, art: 'cola1' },
    { face: 'C', x0: 0.45, x1: 8.04, art: 'poster' },
    { face: 'S', x0: 0.15, x1: 9.0, art: 'cola2' },
  ];
  for (const bd of boards) {
    const e = ctx.face[bd.face];
    kit.at(edgeFrame(e.a, e.b), () => {
      const w = bd.x1 - bd.x0, cx = (bd.x0 + bd.x1) / 2;
      // backing panel + steel frame behind, kicker struts down to the roof
      kit.box({ x: cx, y: yb, z: zf - 0.08, w: w + 0.16, h: hb + 0.12, d: 0.1, mat: 'steel_dark', tint: '#4b4945', collide: true });
      const posts = Math.max(3, Math.round(w / 2.2) + 1);
      for (let i = 0; i < posts; i++) {
        const x = bd.x0 + 0.1 + ((w - 0.2) * i) / (posts - 1);
        kit.beam([x, R, zf - 0.25], [x, yb + hb + 0.05, zf - 0.25], { kind: 'I', h: 0.16, w: 0.1, tint: '#55524d', up: [0, 0, 1] });
        kit.beam([x, yb + hb * 0.7, zf - 0.28], [x, R + 0.05, zf - 2.4], { kind: 'L', h: 0.08, w: 0.08, t: 0.008, tint: '#55524d' });
      }
      // lattice band between the parapet and the board (reference: zig-zag truss under the boards)
      const ty0 = R + 1.1, ty1 = yb - 0.02;
      for (const y of [ty0, ty1]) kit.beam([bd.x0, y, zf + 0.02], [bd.x1, y, zf + 0.02], { kind: 'box', h: 0.08, w: 0.06, tint: '#5a5650' });
      const nz = Math.max(2, Math.round(w / 0.8));
      for (let i = 0; i < nz; i++) {
        const xa = bd.x0 + (w * i) / nz, xb = bd.x0 + (w * (i + 1)) / nz;
        kit.beam([xa, i % 2 ? ty1 : ty0, zf + 0.02], [xb, i % 2 ? ty0 : ty1, zf + 0.02], { kind: 'box', h: 0.05, w: 0.04, tint: '#5a5650' });
      }
      // catwalk grating in front of the board + rail + three dead gooseneck lamps
      kit.box({ x: cx, y: yb - 0.08, z: zf + 0.45, w: w + 0.2, h: 0.04, d: 0.8, mat: 'grate' });
      for (const x of [bd.x0 + 0.2, cx, bd.x1 - 0.2]) {
        kit.beam([x, yb - 0.1, zf], [x, yb - 0.1, zf + 0.85], { kind: 'L', h: 0.07, w: 0.07, t: 0.008, tint: '#4b4945' });
        kit.sweep(circle(0.018, 5), [[x, yb - 0.06, zf + 0.82], [x, yb + 0.45, zf + 1.05], [x, yb + 0.6, zf + 0.9]], 'steel_dark', { smooth: true, up: [1, 0, 0] });
        kit.bbox({ x, y: yb + 0.52, z: zf + 0.86, w: 0.32, h: 0.12, d: 0.2, bevel: 0.02, mat: 'steel_dark', rx: -0.5 });
      }
      for (const y of [yb + 0.95, yb + 0.5]) kit.sweep(circle(0.015, 5), [[bd.x0 - 0.05, y - 0.08, zf + 0.84], [bd.x1 + 0.05, y - 0.08, zf + 0.84]], 'steel_dark', { smooth: true });
      // the artwork (own designs) on plane zf
      kit.at({ x: bd.x0, y: yb, z: zf }, () => billboardArt(kit, bd.art, w, hb));
    });
  }
}

/** Billboard artwork in board-local coordinates (x 0..w, y 0..h, facing +z). */
function billboardArt(kit, art, w, h) {
  const L1 = 0.004, L2 = 0.008, L3 = 0.012;
  if (art === 'cola1' || art === 'cola2') {
    flat(kit, rect2(0, 0, w, h), L1 - 0.002, 'sign_red', { tint: '#c23a2e' });
    // white swoosh ribbon through the lower third
    const wave = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; wave.push([t * w, h * 0.3 + Math.sin(t * PI * 1.6 + 0.4) * h * 0.08]); }
    for (let i = 0; i < 12; i++) flat(kit, [[wave[i][0], wave[i][1]], [wave[i + 1][0], wave[i + 1][1]], [wave[i + 1][0], wave[i + 1][1] + h * 0.07], [wave[i][0], wave[i][1] + h * 0.07]], L1, 'sign_white', { tint: '#f2ece0' });
    // FIZZ COLA lettering (white, slanted) + tagline
    const tw = textWidth('FIZZ COLA', h * 0.3, 1.2);
    const sc = Math.min(1, (w * 0.62) / tw);
    text(kit, 'FIZZ COLA', { x: w * 0.07, y: h * 0.47, h: h * 0.3 * sc, t: h * 0.3 * sc * 0.2, mat: 'sign_white', tint: '#fbf6ea', z: L2, italic: 0.22, track: 1.2 });
    text(kit, art === 'cola1' ? 'ICE COLD' : 'DELICIOUS AND REFRESHING', { x: w * 0.07, y: h * 0.12, h: h * 0.085, t: h * 0.085 * 0.17, mat: 'sign_white', tint: '#fff6e2', z: L2 });
    // the bottle: dark glass silhouette with a white label, at the right end
    const bx = w * 0.84, by = h * 0.1, bh = h * 0.78, bw = bh * 0.22;
    flat(kit, [[bx - bw / 2, by], [bx + bw / 2, by], [bx + bw / 2, by + bh * 0.55], [bx + bw * 0.18, by + bh * 0.8], [bx + bw * 0.16, by + bh], [bx - bw * 0.16, by + bh], [bx - bw * 0.18, by + bh * 0.8], [bx - bw / 2, by + bh * 0.55]], L2, 'frame_dark', { tint: '#5a2a1c' });
    flat(kit, rect2(bx - bw / 2, by + bh * 0.25, bx + bw / 2, by + bh * 0.42), L3, 'sign_white', { tint: '#efe7d6' });
    flat(kit, rect2(bx - bw * 0.06, by + bh * 0.62, bx + bw * 0.12, by + bh * 0.76), L3, 'sign_white', { tint: '#a8a49c' });
    // white border
    for (const r of [rect2(0, 0, w, 0.08), rect2(0, h - 0.08, w, h), rect2(0, 0, 0.08, h), rect2(w - 0.08, 0, w, h)]) flat(kit, r, L2, 'sign_white', { tint: '#ece6d8' });
  } else {
    // faded sepia movie poster: a figure in a hat, title, credits
    flat(kit, rect2(0, 0, w, h), L1 - 0.002, 'billboard', { tint: '#d8c49c' });
    const fx = w * 0.3;
    flat(kit, [[fx - 1.0, 0.15], [fx + 1.1, 0.15], [fx + 0.9, h * 0.42], [fx + 0.45, h * 0.55], [fx - 0.4, h * 0.55], [fx - 0.85, h * 0.42]], L1, 'frame_dark', { tint: '#6e5638' });
    flat(kit, circle(0.42, 10).map(([x, y]) => [fx + x, h * 0.68 + y * 1.15]), L1, 'billboard', { tint: '#a88a62' });
    flat(kit, [[fx - 0.75, h * 0.8], [fx + 0.75, h * 0.8], [fx + 0.5, h * 0.84], [fx + 0.42, h * 0.97], [fx - 0.42, h * 0.97], [fx - 0.5, h * 0.84]], L2, 'frame_dark', { tint: '#4e3a26' });
    text(kit, 'THE LAST', { x: w * 0.74, y: h * 0.62, h: h * 0.13, t: h * 0.13 * 0.18, mat: 'frame_dark', tint: '#5a3e24', align: 'center', z: L2, serif: true });
    text(kit, 'TRAIN', { x: w * 0.74, y: h * 0.4, h: h * 0.17, t: h * 0.17 * 0.18, mat: 'frame_dark', tint: '#5a3e24', align: 'center', z: L2, serif: true });
    for (let i = 0; i < 3; i++) flat(kit, rect2(w * 0.56, h * (0.12 + i * 0.07), w * 0.92, h * (0.145 + i * 0.07)), L2, 'frame_dark', { tint: '#8a6e4c' });
  }
  // peeling: bare grey board where the paper came off + torn strips curling away
  const tears = art === 'poster' ? [[w * 0.05, h * 0.55, 1.6, 1.4], [w * 0.6, 0.0, 2.2, 1.1], [w * 0.82, h * 0.7, 1.2, 1.2]] : [[w * 0.62, h * 0.62, 1.1, 0.9], [w * 0.02, 0.0, 1.4, 0.7]];
  for (const [x, y, tw, th] of tears) {
    const pts = [[x, y], [x + tw, y + kit.rnd(-0.1, 0.1)], [x + tw * 0.85, y + th * 0.6], [x + tw * 0.95, y + th], [x + tw * 0.2, y + th * 0.9], [x - 0.05, y + th * 0.4]].map(([px, py]) => [Math.max(0, Math.min(w, px)), Math.max(0, Math.min(h, py))]);
    flat(kit, pts, L3 + 0.002, 'billboard', { tint: '#8d877c' });
    kit.face([[x + tw * 0.2, y + th * 0.9, L3 + 0.004], [x + tw * 0.95, y + th, L3 + 0.004], [x + tw * 0.75, y + th + 0.05, 0.25]], 'sign_white', { tint: art === 'poster' ? '#cbb68e' : '#c74a3c' });
  }
}

// ---------------------------------------------------------------- C_SE Maple Sweets (brick_commercial, 7F, enterable shop)
function buildingSE(kit, L) {
  const B = L.BUILDINGS.find((b) => b.id === 'C_SE');
  const STONE = '#d6cdbd';
  const win = { w: 1.2, h: 1.9, sill: 0.9, frame: 'frame_white', lintel: 'trim_stone', trimTint: STONE, sillMat: 'trim_stone', ac: 0.12, streak: 0.5 };
  const colsN = [1.83, 5.5, 9.17], colsW = [1.5, 4.5, 7.5], colsC = [1.65, 4.95, 8.25];
  const opsOf = {};
  const face = (name, ground, cols, decor) => ({
    openings: (e, ctx) => { opsOf[name] = [...ground(e), ...windowOps(kit, ctx, { ...win, cols })]; return opsOf[name]; },
    decor: (e, ctx) => {
      const ops = opsOf[name];
      // segmental brick arches over the windows (stone keystone), cast-iron storefront piers at street level
      for (const op of ops.filter((o) => o.type === 'window' && o.y > 4)) hood(kit, op, 'key', { tint: STONE });
      decor?.(e, ctx, ops);
    },
  });
  const groundN = (e) => [
    span(e, 20.4, 15.6, { y: 2.85, h: 0.95, type: 'window', state: 'dark', frame: 'frame_white', mullions: [4, 1], sill: false }),
    span(e, 25.4, 21.6, { y: 0, h: 3.4, type: 'shop', state: 'shutter', frame: 'sign_blue', shutterTint: '#b3aea2' }),
  ];
  const groundW = (e) => [
    span(e, 16.8, 20.6, { y: 0.3, h: 3.1, type: 'shop', state: 'glass', frame: 'sign_green', kick: 'sign_green' }),
    span(e, 21.4, 25.4, { y: 0, h: 3.4, type: 'shop', state: 'shutter', frame: 'sign_green', shutterTint: '#a7a397' }),
  ];
  const groundC = () => [
    { x: 0.55, w: 3.15, y: 0.55, h: 2.85, type: 'window', state: 'broken', walk: true, frame: 'sign_green', mullions: [2, 1], sillMat: 'trim_stone', trimTint: STONE },
    { x: 4.2, w: 1.5, y: 0, h: 2.65, type: 'door', state: 'open', walk: true, frame: 'sign_green' },
    { x: 4.2, w: 1.5, y: 2.85, h: 0.55, type: 'window', state: 'dark', frame: 'sign_green', sill: false },
    { x: 6.2, w: 3.15, y: 0.55, h: 2.85, type: 'window', state: 'broken', walk: true, frame: 'sign_green', mullions: [2, 1], sillMat: 'trim_stone', trimTint: STONE },
  ];
  cornerBlock(kit, {
    poly: B.footprint, floors: B.floors,
    opts: {
      mat: 'brick_red', tint: '#e8d8d0', trim: 'trim_stone', trimTint: STONE, plinth: { h: 0.5, mat: 'trim_concrete' },
      cornice: { h: 0.75, depth: 0.6, mat: 'trim_metal' }, quoins: false, belt: true, wallT: 0.35, streaks: 0.5,
      roof: { type: 'flat', parapet: B.parapet, mat: 'roof_tar', coping: 'trim_concrete', clutter: true }, grime: { y: 0, h: 2.0, k: 0.4 },
      enter: { ground: true }, interiorFloor: 'interior_tiles', interiorLights: false, interiorFill: 0, interiorWall: 'plaster',
    },
    faces: {
      N: face('N', groundN, colsN, (e, ctx, ops) => {
        const sh = ops.find((o) => o.type === 'shop');
        fascia(kit, { x0: sh.x - 0.1, x1: sh.x + sh.w + 0.1, y: 3.6, h: 0.62, mat: 'sign_blue', tint: '#7d93b6', text: 'BARBER', lh: [0.34], textMat: 'sign_white', textTint: '#f3ecd8', serif: true });
        barberPole(kit, sh.x + sh.w + 0.45, 2.0);
        // inner face for the shutter (seen from the back room / through gaps)
        kit.face([[sh.x + sh.w, 0, -0.36], [sh.x, 0, -0.36], [sh.x, sh.h, -0.36], [sh.x + sh.w, sh.h, -0.36]], 'metal_shutter', { tint: '#7d796f' });
        for (let i = 0; i < 2; i++) poster(kit, sh.x + 0.5 + i * 1.6, 1.0 + i * 0.3, 0.62, 0.86, 0.06, { head: i ? 'CURFEW' : 'MISSING', peel: true });
      }),
      W: face('W', groundW, colsW, (e, ctx, ops) => {
        const [win1, sh] = ops;
        fascia(kit, { x0: win1.x - 0.15, x1: sh.x + sh.w + 0.15, y: 3.65, h: 0.62, mat: 'sign_yellow', tint: '#e8c25a', text: 'SALE  50% - 75% OFF', lh: [0.3], textMat: 'sign_red', textTint: '#ffffff' });
        // SALE posters taped inside the glass (visible from both sides)
        for (let i = 0; i < 3; i++) {
          const x = win1.x + 0.2 + i * 1.22, y = 1.0 + (i % 2) * 0.25;
          poster(kit, x, y, 0.95, 1.25, -0.2, { tint: '#f0d65a', head: i === 1 ? '75%' : 'SALE', headMat: 'sign_red', headTint: '#ffffff' });
          kit.face([[x + 0.95, y, -0.205], [x, y, -0.205], [x, y + 1.25, -0.205], [x + 0.95, y + 1.25, -0.205]], 'sign_white', { tint: '#cfc8b4' });
        }
        kit.face([[sh.x + sh.w, 0, -0.36], [sh.x, 0, -0.36], [sh.x, sh.h, -0.36], [sh.x + sh.w, sh.h, -0.36]], 'metal_shutter', { tint: '#7d796f' });
        // SWEETS blade sign with dead neon tubes (layout: along z 24.5..25.5, y 6..15 world)
        const bx = ax(e, 25.0), y0 = 6 - BY, hh = 9;
        for (const yy of [y0 + 0.3, y0 + hh - 0.3]) kit.box({ x: bx, y: yy, z: 0.6, w: 0.06, h: 0.08, d: 1.2, mat: 'steel_dark' });
        kit.at({ x: bx, z: 0.75 }, () => {
          kit.bbox({ x: 0, y: y0, z: 0, w: 0.24, h: hh, d: 0.95, bevel: 0.03, mat: 'sign_white', tint: '#e9dcc0' });
          for (const s of [-1, 1]) kit.at({ x: s * 0.122, rot: s * PI / 2 }, () => {
            kit.face([[-0.42, y0 + 0.1, 0], [0.42, y0 + 0.1, 0], [0.42, y0 + hh - 0.1, 0], [-0.42, y0 + hh - 0.1, 0]], 'sign_red', { tint: '#e8b0a8' });
            vtext(kit, 'SWEETS', { x: 0, yTop: y0 + hh - 0.4, h: 1.05, t: 0.15, mat: 'sign_red', tint: '#ffffff', z: 0.004, lead: 1.35 });
            let y = y0 + hh - 0.4;
            for (const ch of 'SWEETS') { neon(kit, ch, { x: 0, y: y - 1.05, h: 1.05, align: 'center', z: 0.06 }); y -= 1.05 * 1.35; }
          });
        });
      }),
      C: face('C', groundC, colsC, (e, ctx, ops) => seChamfer(kit, e, ctx, ops)),
    },
    back: {
      E: { from: 13.6, floors: [5, 6], cols: [2.6, 6.4, 10.2, 14.0], w: 1.2 },
      S: { from: 20.6, floors: [6], cols: [2.0, 5.6, 9.2, 12.8, 16.4], w: 1.2 },
    },
    extra: (ctx) => candyShop(kit, ctx),
  });
}

function seChamfer(kit, e, ctx, ops) {
  // MAPLE SWEETS fascia (y 3.4..4.3 world), green/white striped awning (y 2.7..3.4, depth 1.6)
  fascia(kit, { x0: 0.35, x1: e.L - 0.35, y: 3.55, h: 0.82, mat: 'sign_white', tint: '#efe4cc', text: ['MAPLE SWEETS', 'CANDY · FUDGE · TOFFEE'], lh: [0.36, 0.13], textMat: 'sign_red', textTint: '#d0d0d0', serif: true, border: { mat: 'sign_green', tint: '#6f9a72' } });
  stripedAwning(kit, { x0: 0.4, x1: e.L - 0.4, y: 3.45, depth: 1.6, drop: 0.62, colors: ['#3d6e46', '#e6e2d6'], torn: [17], hang: [17] });
  // candy-stripe piers each side of the door and at the corners
  for (const x of [0.25, 3.95, 5.95, e.L - 0.25]) {
    kit.box({ x, y: 0, z: 0.04, w: 0.36, h: 3.4, d: 0.08, mat: 'sign_white', tint: '#eee6d6', faces: { nz: false } });
    for (let y = 0.1; y < 3.3; y += 0.36) kit.at({ x, y, z: 0.082, rz: 0.6 }, () => kit.face([[-0.05, -0.2, 0], [0.05, -0.2, 0], [0.05, 0.2, 0], [-0.05, 0.2, 0]], 'sign_red', { tint: '#e8c0b8' }));
  }
  // vault sills of the smashed display windows are 0.55 m high (solid below the opening)
  for (const op of ops.filter((o) => o.walk && o.type === 'window')) kit.colBox({ x: op.x + op.w / 2, y: 0, z: -0.175, w: op.w, h: op.y, d: 0.35 }, 'concrete');
  // 'CLOSED' card hanging crooked in the door, the door leaf itself lies inside (see candyShop)
  kit.at({ x: 3.95, y: 1.75, z: 0.1, rz: 0.12 }, () => { kit.box({ x: 0, y: 0, z: 0, w: 0.42, h: 0.18, d: 0.01, mat: 'sign_white', tint: '#f0e8d8' }); text(kit, 'CLOSED', { x: 0, y: 0.04, h: 0.09, t: 0.016, mat: 'sign_red', align: 'center', z: 0.006 }); });
  // the shop's shards on the sidewalk
  kit.at({ y: SW - BY + 0.004 }, () => { for (let i = 0; i < 24; i++) { const x = kit.rnd(0.5, e.L - 0.5), z = kit.rnd(0.15, 1.4), s = kit.rnd(0.05, 0.16); kit.upFace([[x, 0, z], [x + s, 0, z + kit.rnd(-0.05, 0.05)], [x + s * 0.3, 0, z + s]], 'glass_dirty', null, {}); } });
  kit.wallLamp({ x: 0.3, y: 4.6, on: true, intensity: 5, range: 6, color: '#ffc27a' });
  void ctx;
}

/** Barber pole (wall-local x, y bottom): glass tube with red / white / blue helix on a bracket. */
function barberPole(kit, x, y) {
  kit.box({ x, y: y + 0.4, z: 0.08, w: 0.08, h: 0.1, d: 0.16, mat: 'steel' });
  kit.cyl({ x, y, z: 0.2, r: 0.09, h: 0.9, seg: 12, mat: 'sign_white', tint: '#efece4' });
  for (const [k, tint] of [[0, '#b8302a'], [1, '#2f4f8a']]) {
    const pts = [];
    for (let i = 0; i <= 18; i++) { const t = i / 18, a = t * PI * 4 + k * PI; pts.push([x + Math.cos(a) * 0.092, y + 0.05 + t * 0.8, 0.2 - Math.sin(a) * 0.092]); }
    kit.sweep(circle(0.022, 4), pts, 'sign_red', { smooth: true, tint, up: [1, 0, 0] });
  }
  for (const yy of [y - 0.08, y + 0.9]) kit.cyl({ x, y: yy, z: 0.2, r: 0.11, h: 0.08, seg: 12, mat: 'car_chrome', tint: '#b8b4a8' });
}

/** Maple Sweets interior (layout BUILDINGS C_SE.interior poly): partitions sealing the back rooms, shelves, glass
 *  counter, ceiling fan, spilled stock, a dim bulb + soft fill. SUP_C_SHOP (14.0, 15.2) stays clear. */
function candyShop(kit, ctx) {
  const gH = ctx.fl[0] - 0.02, PAPER = '#f6e6dc';
  const part = [[21, 9.35], [21, 15], [14.5, 21], [8.35, 21]];
  for (let i = 0; i < part.length - 1; i++) kit.wall({ a: part[i], b: part[i + 1], y0: 0, h: gH, t: 0.16, mat: 'plaster', tint: PAPER, inner: 'interior_wall', grime: { y: 0, h: 1.0, k: 0.25 }, collide: true, room: 0, interior: true });
  // dado rail + skirting on the shop side
  for (let i = 0; i < part.length - 1; i++) kit.at(edgeFrame(part[i], part[i + 1]), () => {
    const Lp = dist2(part[i], part[i + 1]);
    kit.box({ x: Lp / 2, y: 0.02, z: 0.01, w: Lp, h: 0.14, d: 0.02, mat: 'trim_wood', tint: '#6a4a36', faces: { nz: false } });
    kit.box({ x: Lp / 2, y: 0.95, z: 0.012, w: Lp, h: 0.06, d: 0.025, mat: 'trim_wood', tint: '#7a5a42', faces: { nz: false } });
  });
  // shelving units (1.65 m) along the east partition, the south partition and the north wall
  const shelves = [[[21, 9.6], [21, 14.7]], [[14.2, 21], [8.6, 21]], [[15.6, 9.35], [20.8, 9.35]]];
  shelves.forEach(([a, b], si) => kit.at(edgeFrame(a, b), () => shelfUnit(kit, dist2(a, b), si)));
  // glass counter across the back (in front of the diagonal partition), cash register on top
  kit.at(edgeFrame([21, 15], [14.5, 21]), () => {
    const Lc = dist2([21, 15], [14.5, 21]);
    shelfUnit(kit, Lc, 7, { h: 1.9 });
    const x0 = 0.9, x1 = Lc - 0.9, z0 = 1.25, z1 = 1.85;
    kit.box({ x: (x0 + x1) / 2, y: 0.02, z: (z0 + z1) / 2, w: x1 - x0, h: 0.55, d: z1 - z0, mat: 'wood_siding', tint: '#9a7656', collide: true });
    kit.box({ x: (x0 + x1) / 2, y: 0.57, z: (z0 + z1) / 2, w: x1 - x0, h: 0.04, d: z1 - z0, mat: 'wood_siding', tint: '#7a5a40' });
    kit.box({ x: (x0 + x1) / 2, y: 0.61, z: (z0 + z1) / 2, w: x1 - x0 - 0.06, h: 0.4, d: z1 - z0 - 0.06, mat: 'glass_dirty', faces: { bottom: false } });
    kit.box({ x: (x0 + x1) / 2, y: 1.01, z: (z0 + z1) / 2, w: x1 - x0 + 0.04, h: 0.03, d: z1 - z0 + 0.04, mat: 'wood_siding', tint: '#6a4a32' });
    kit.colBox({ x: (x0 + x1) / 2, y: 0, z: (z0 + z1) / 2, w: x1 - x0, h: 1.04, d: z1 - z0 }, 'glass');
    for (let i = 0; i < 9; i++) candyJar(kit, x0 + 0.4 + i * ((x1 - x0 - 0.8) / 8), 0.62, (z0 + z1) / 2, i);
    kit.at({ x: x1 - 0.7, y: 1.04, z: (z0 + z1) / 2, rot: 0.2 }, () => {
      kit.bbox({ x: 0, y: 0, z: 0, w: 0.42, h: 0.22, d: 0.36, bevel: 0.02, mat: 'car_chrome', tint: '#8a8070' });
      kit.bbox({ x: 0, y: 0.22, z: -0.06, w: 0.36, h: 0.14, d: 0.16, bevel: 0.015, mat: 'car_chrome', tint: '#8a8070', rx: -0.3 });
    });
  });
  // low display table under the SALE window, a toppled shelf, spilled jars / boxes / candy
  kit.box({ x: 9.1, y: 0.02, z: 18.6, w: 0.9, h: 0.75, d: 3.2, mat: 'wood_siding', tint: '#d6c8b0', collide: true });
  kit.at({ x: 18.6, y: 0.02, z: 13.4, rot: 0.75, rx: -1.35 }, () => kit.box({ x: 0, y: 0, z: 0, w: 1.6, h: 0.42, d: 1.5, mat: 'wood_siding', tint: '#cbbda4' }));
  kit.colBox({ x: 18.4, y: 0, z: 13.2, w: 1.7, h: 0.5, d: 1.2, rot: 0.75 }, 'wood');
  for (let i = 0; i < 26; i++) {
    const x = kit.rnd(10.5, 19.5), z = kit.rnd(11, 19.5);
    if (Math.hypot(x - 14.0, z - 15.2) < 1.2 || x + z < 26.2 || 6 * x + 6.5 * z > 212) continue;
    if (i % 3 === 0) candyJar(kit, x, 0.02, z, i, true);
    else kit.bbox({ x, y: 0.02, z, rot: kit.rnd(0, PI), w: kit.rnd(0.14, 0.3), h: kit.rnd(0.06, 0.16), d: kit.rnd(0.1, 0.22), bevel: 0.01, mat: kit.pick(['sign_red', 'sign_yellow', 'sign_blue', 'sign_green', 'sign_white']), tint: kit.pick(['#ffffff', '#f2c8d0', '#f8e0a0']) });
  }
  for (let i = 0; i < 60; i++) { const x = kit.rnd(11, 19), z = kit.rnd(11.5, 19); if (x + z < 26.4 || 6 * x + 6.5 * z > 212) continue; kit.box({ x, y: 0.02, z, rot: kit.rnd(0, 3), w: 0.03, h: 0.02, d: 0.05, mat: kit.pick(['lamp_off', 'sign_red', 'sign_yellow', 'sign_green']), tint: kit.pick(['#ffffff', '#ff9ab0', '#a0e0ff']) }); }
  // the smashed-in door leaf lying on the floor
  kit.at({ x: 12.7, y: 0.03, z: 14.2, rot: 2.2 }, () => { kit.box({ x: 0, y: 0, z: 0, w: 0.95, h: 0.05, d: 2.1, mat: 'sign_green', tint: '#8fb093' }); kit.box({ x: 0, y: 0.05, z: -0.3, w: 0.6, h: 0.005, d: 1.0, mat: 'glass_dirty' }); });
  // ceiling fan + one surviving bulb, soft cool fill (stands in for the missing bounces)
  kit.at({ x: 15.6, y: gH, z: 14.6 }, () => {
    kit.cyl({ x: 0, y: -0.25, z: 0, r: 0.02, h: 0.25, seg: 6, mat: 'steel_dark' });
    kit.cyl({ x: 0, y: -0.38, z: 0, r: 0.12, r2: 0.09, h: 0.14, seg: 10, mat: 'car_chrome', tint: '#8c7a5a' });
    for (let i = 0; i < 4; i++) kit.at({ rot: i * PI / 2 + 0.3, y: -0.32 }, () => kit.box({ x: 0.5, y: 0, z: 0, w: 0.75, h: 0.015, d: 0.16, mat: 'trim_wood', tint: '#5a3e2c', rx: 0.12 }));
  });
  kit.bulb([17.6, gH - 0.9, 12.4], { cord: 0.88, on: true, intensity: 9, range: 9, color: '#ffbf80' });
  kit.bulb([12.2, gH - 0.8, 18.0], { cord: 0.78, on: true, intensity: 7, range: 8, color: '#ffb46a' });
  kit.bulb([14.6, gH - 0.85, 15.6], { cord: 0.83, on: false });
  for (const p of [[17.2, 2.4, 12.6], [12.6, 2.4, 17.6]]) kit.light({ pos: p, color: '#d6cfd2', intensity: 4.5, decay: 1, range: 11, radius: 1.2, name: 'fill' });
  // back rooms: sealed (E / S party walls of the ground floor are solid)
  for (const e of ctx.edges.filter((ee) => ee.face === 'E' || ee.face === 'S')) kit.at(edgeFrame(e.a, e.b), () => kit.colBox({ x: e.L / 2, y: 0, z: -0.2, w: e.L, h: ctx.fl[0], d: 0.4 }, 'concrete'));
}

/** Candy shelving along a wall-local run 0..L (depth into +z): uprights, 4 shelves, jars and boxes. */
function shelfUnit(kit, L, seed, o = {}) {
  const h = o.h ?? 1.65, d = 0.42, x0 = 0.15, x1 = L - 0.15;
  kit.box({ x: (x0 + x1) / 2, y: 0.02, z: 0.02, w: x1 - x0, h, d: 0.02, mat: 'wood_siding', tint: '#d9cdb6' });
  const nU = Math.max(2, Math.round((x1 - x0) / 1.1) + 1);
  for (let i = 0; i < nU; i++) kit.box({ x: x0 + ((x1 - x0) * i) / (nU - 1), y: 0.02, z: d / 2, w: 0.04, h, d, mat: 'wood_siding', tint: '#c9b99c' });
  for (const yy of [0.12, 0.55, 0.98, 1.4]) {
    if (yy > h - 0.15) continue;
    kit.box({ x: (x0 + x1) / 2, y: yy, z: d / 2, w: x1 - x0, h: 0.03, d, mat: 'wood_siding', tint: '#e2d6c0' });
    for (let x = x0 + 0.18; x < x1 - 0.15; x += kit.rnd(0.16, 0.34)) {
      if (kit.chance(0.3)) continue;
      if (kit.chance(0.55)) candyJar(kit, x, yy + 0.03, d * 0.5, seed * 31 + Math.round(x * 10));
      else kit.box({ x, y: yy + 0.03, z: d * 0.5, w: 0.14, h: kit.rnd(0.12, 0.26), d: 0.2, mat: kit.pick(['sign_red', 'sign_yellow', 'sign_blue', 'sign_green', 'sign_white']), tint: kit.pick(['#ffffff', '#f4cad4', '#fde6a8', '#cfe8ff']) });
    }
  }
  kit.colBox({ x: (x0 + x1) / 2, y: 0, z: d / 2, w: x1 - x0, h, d }, 'wood');
}
function candyJar(kit, x, y, z, i, fallen = false) {
  const tint = ['#f4a0b4', '#f7d36a', '#9fd8f0', '#b5e0a0', '#f0b080'][Math.abs(i) % 5];
  kit.at({ x, y, z, rz: fallen ? PI / 2 : 0, rot: i }, () => {
    kit.cyl({ x: 0, y: fallen ? -0.09 : 0, z: 0, r: 0.085, h: 0.2, seg: 8, mat: 'sign_white', tint });
    kit.cyl({ x: 0, y: fallen ? 0.11 : 0.2, z: 0, r: 0.06, h: 0.04, seg: 8, mat: 'sign_red', tint: '#d8d0c0' });
  });
}

// ---------------------------------------------------------------- C_SW Marino's (brick_dark, 8F)
function buildingSW(kit, L) {
  const B = L.BUILDINGS.find((b) => b.id === 'C_SW');
  const STONE = '#bdb6aa';
  const win = { w: 1.1, h: 1.7, sill: 0.9, frame: 'frame_dark', lintel: 'trim_concrete', trimTint: STONE, sillMat: 'trim_concrete', ac: 0.14, streak: 0.55, states: { glass: 0.3, dark: 0.28, broken: 0.24, boarded: 0.18 } };
  const colsE = [1.8, 4.2, 6.6, 9.0], colsN = [1.83, 5.5, 9.17], colsC = [1.65, 4.95, 8.25];
  const opsOf = {};
  const face = (name, ground, cols, decor, mod) => ({
    openings: (e, ctx) => { opsOf[name] = [...ground(e), ...windowOps(kit, ctx, { ...win, cols, mod })]; return opsOf[name]; },
    decor: (e, ctx) => decor?.(e, ctx, opsOf[name]),
  });
  const groundN = (e) => [
    span(e, -16.0, -17.0, { y: 0, h: 2.6, type: 'door', state: 'closed', door: 'metal_painted', doorTint: '#4a4f4a', window: true }),
    span(e, -17.4, -21.0, { y: 0, h: 3.3, type: 'shop', state: 'glass', frame: 'frame_dark' }),
    span(e, -21.4, -25.0, { y: 0, h: 3.3, type: 'shop', state: 'broken', frame: 'frame_dark' }),
  ];
  const groundE = (e) => [span(e, 16.4, 17.4, { y: 0, h: 2.6, type: 'door', state: 'closed', door: 'metal_painted', doorTint: '#3d3a36' })];
  const groundC = () => [
    { x: 0.55, w: 3.1, y: 0.5, h: 2.6, type: 'shop', state: 'boarded', frame: 'sign_red' },
    { x: 4.2, w: 1.5, y: 0, h: 2.6, type: 'door', state: 'closed', door: 'trim_wood', doorTint: '#8a6a4a', step: false },
    { x: 6.25, w: 3.1, y: 0.5, h: 2.6, type: 'shop', state: 'boarded', frame: 'sign_red' },
  ];
  cornerBlock(kit, {
    poly: B.footprint, floors: B.floors,
    opts: {
      mat: 'brick_dark', tint: '#ffffff', trim: 'trim_concrete', trimTint: STONE, plinth: { h: 0.6, mat: 'concrete_dirty' },
      cornice: { h: 0.45, depth: 0.35, mat: 'trim_concrete' }, quoins: false, belt: true, wallT: 0.35, streaks: 0.6,
      roof: { type: 'flat', parapet: B.parapet, mat: 'roof_tar', coping: 'trim_concrete', clutter: true }, grime: { y: 0, h: 2.4, k: 0.45 },
    },
    faces: {
      N: face('N', groundN, colsN, (e, ctx, ops) => {
        fascia(kit, { x0: ax(e, -17.2), x1: ax(e, -25.2), y: 3.55, h: 0.72, mat: 'sign_yellow', tint: '#f0c84a', text: ['SALE', 'CLEARANCE  EVERYTHING MUST GO'], lh: [0.32, 0.12], textMat: 'sign_red', textTint: '#ffffff' });
        for (const op of ops.filter((o) => o.type === 'shop')) for (let i = 0; i < 2; i++) poster(kit, op.x + 0.3 + i * 1.7, 1.0, 1.1, 1.4, -0.2, { tint: '#f2dc5a', head: i ? '50%' : 'SALE', headMat: 'sign_red', headTint: '#ffffff' });
        // RESTAURANT blade sign (layout along x -15.8..-15.2, y 5..12 world)
        const bx = ax(e, -15.5), y0 = 5 - BY, hh = 7;
        for (const yy of [y0 + 0.3, y0 + hh - 0.3]) kit.box({ x: bx, y: yy, z: 0.55, w: 0.06, h: 0.08, d: 1.1, mat: 'steel_dark' });
        kit.at({ x: bx, z: 0.7 }, () => {
          kit.bbox({ x: 0, y: y0, z: 0, w: 0.2, h: hh, d: 0.85, bevel: 0.03, mat: 'sign_red', tint: '#b8423a' });
          for (const s of [-1, 1]) kit.at({ x: s * 0.102, rot: s * PI / 2 }, () => vtext(kit, 'RESTAURANT', { x: 0, yTop: y0 + hh - 0.25, h: 0.5, t: 0.09, mat: 'sign_white', tint: '#f0e6cc', z: 0.004, lead: 1.3 }));
        });
      }),
      E: face('E', groundE, colsE, (e, ctx) => swEast(kit, e, ctx)),
      C: face('C', groundC, colsC, (e, ctx, ops) => swChamfer(kit, e, ctx, ops), (f, k, op) => { if (f === 1 && k === 1) { op.state = 'broken'; op.ac = false; } return op; }),
    },
    back: {
      W: { from: 21.0, floors: [7], cols: [2.5, 6.5, 10.5, 14.5], w: 1.1 },
      S: { from: 16.8, floors: [5, 6, 7], cols: [1.4, 4.4], w: 1.1 },
    },
  });
}

function swChamfer(kit, e, ctx, ops) {
  // MARINO'S red fascia with cream italic lettering (y 3.3..4.3 world)
  fascia(kit, { x0: 0.3, x1: e.L - 0.3, y: 3.25, h: 0.95, mat: 'sign_red', tint: '#b3382e', text: ["MARINO'S", 'RISTORANTE · PIZZA'], lh: [0.42, 0.13], textMat: 'sign_white', textTint: '#f1e2bf', italic: 0.2, serif: true, border: { mat: 'sign_white', tint: '#e9dcc0' } });
  // planks over the door, chairs + tables piled behind the boarded windows (seen through the gaps)
  plywood(kit, 4.95, 0.0, 1.6, 2.65, 0.05, { mark: 'CLOSED', markTint: '#ffffff' });
  for (const op of ops.filter((o) => o.type === 'shop')) for (let i = 0; i < 2; i++) kit.at({ x: op.x + 0.8 + i * 1.5, y: 0.5, z: -0.55, rot: i * 0.6 }, () => {
    kit.box({ x: 0, y: 0.7, z: 0, w: 0.8, h: 0.04, d: 0.8, mat: 'trim_wood', tint: '#6a4a32', rz: 0.3 });
    kit.box({ x: 0.1, y: 0, z: 0.1, w: 0.06, h: 0.72, d: 0.06, mat: 'steel_dark' });
  });
  for (const x of [0.15, e.L - 0.15]) kit.wallLamp({ x: x < 1 ? 0.2 : e.L - 0.2, y: 3.0, on: x < 1, intensity: 4, range: 5 });
  // trash bags + broken chair by the door, a bin
  kit.at({ y: SW - BY }, () => { bags(kit, [7.9, 0.9], 0, 4); kit.prop('metal_trash_can', { at: [1.1, 0.8], rot: 0.4 }); });
  void ctx;
}

function swEast(kit, e, ctx) {
  // black iron fire escape (layout: E face, z 18..24, floors 1..7) over a poster-plastered blue shopfront frame
  kit.fireEscape({ x: ax(e, 20.6), floors: ctx.n, groundH: ctx.fl[0], floorH: ctx.fl[1], bases: ctx.bases, width: 4.8 });
  const x0 = ax(e, 25), x1 = ax(e, 17.8);
  for (const [x, w] of [[x0, 0.22], [x1 - 0.22, 0.22]]) kit.box({ x: x + w / 2, y: 0, z: 0.05, w, h: 3.6, d: 0.1, mat: 'sign_blue', tint: '#5d78a6', faces: { nz: false } });
  kit.box({ x: (x0 + x1) / 2, y: 3.35, z: 0.06, w: x1 - x0, h: 0.5, d: 0.12, mat: 'sign_blue', tint: '#5d78a6' });
  // layered bill posters (2-3 layers, some torn)
  for (let layer = 0; layer < 3; layer++) for (let x = x0 + 0.3; x < x1 - 0.7; x += kit.rnd(0.55, 0.95)) {
    if (layer && kit.chance(0.35)) continue;
    const w = kit.rnd(0.5, 0.85), h = kit.rnd(0.7, 1.1), y = kit.rnd(0.35, 2.2);
    poster(kit, x, y, w, Math.min(h, 3.25 - y), 0.012 + layer * 0.004, { head: kit.pick([null, null, 'LOST', 'SHOW', 'JAZZ', 'RALLY', 'EVACUATE']), peel: kit.chance(0.3) });
  }
  text(kit, 'POST NO BILLS', { x: (x0 + x1) / 2, y: 3.45, h: 0.18, t: 0.03, mat: 'sign_white', tint: '#e8e2d0', align: 'center', z: 0.125 });
}

// ==================================================================================================== LM_SIGNALS
// Four masts at the chamfer corners: 0.3 m pole, 7 m arm at y 6.2 over the carriageway, two oversized yellow
// bike-signal heads per arm facing the intersection (green bicycle lens, one amber blinker). Arms carry no
// collision and stay out of the nav (bossBreakable in the design: runtime props can replace them later).
function signalMasts(kit, L) {
  const M = L.LANDMARKS.signalMasts;
  M.poles.forEach((p, idx) => {
    const [bx, bz] = p.base, [tx, tz] = p.armTo;
    const ang = Math.atan2(-(tz - bz), tx - bx), len = Math.hypot(tx - bx, tz - bz);
    // heads face the side of the arm the intersection centre is on
    const nx = -(tz - bz) / len, nz = (tx - bx) / len;
    const mid = [(bx + tx) / 2, (bz + tz) / 2];
    const faceSign = nx * (0 - mid[0]) + nz * (0 - mid[1]) > 0 ? 1 : -1;
    kit.at({ x: bx, y: SW, z: bz, rot: ang }, () => {
      const T = '#5c5e55';
      kit.box({ x: 0, y: 0, z: 0, w: 0.55, h: 0.06, d: 0.55, mat: 'steel_dark', tint: '#4d4c47' });
      for (const [dx, dz] of [[-0.2, -0.2], [0.2, -0.2], [0.2, 0.2], [-0.2, 0.2]]) kit.cyl({ x: dx, y: 0.06, z: dz, r: 0.025, h: 0.06, seg: 6, mat: 'steel' });
      kit.cyl({ x: 0, y: 0.06, z: 0, r: 0.2, r2: 0.16, h: 0.5, seg: 12, mat: 'steel', tint: T });
      kit.cyl({ x: 0, y: 0.56, z: 0, r: 0.15, r2: 0.125, h: 7.0, seg: 12, mat: 'steel', tint: T, collide: true });
      kit.cyl({ x: 0, y: 7.56, z: 0, r: 0.14, r2: 0.04, h: 0.18, seg: 12, mat: 'steel', tint: T });
      // arm (slightly rising), clamp collar, tie rod from the pole top
      const ay = 6.2 - SW;
      kit.sweep(circle(0.1, 10), [[0.1, ay, 0], [len * 0.5, ay + 0.12, 0], [len, ay + 0.2, 0]], 'steel', { smooth: true, tint: T, caps: true });
      kit.cyl({ x: 0, y: ay - 0.25, z: 0, r: 0.18, h: 0.5, seg: 12, mat: 'steel', tint: '#4d4f48' });
      kit.sweep(circle(0.025, 6), [[0, 7.3, 0], [len * 0.62, ay + 0.15, 0]], 'steel', { smooth: true, tint: T });
      // heads hang under the arm
      for (const [t, amber] of [[0.55, idx % 2 === 0], [0.93, false]]) {
        const hx = len * t, hy = ay + 0.12 * t * 2 - 0.12;
        kit.sweep(circle(0.04, 6), [[hx, hy + 0.1, 0], [hx, hy - 0.3, 0]], 'steel', { smooth: true, tint: T, up: [1, 0, 0] });
        kit.at({ x: hx, y: hy - 0.32 - 1.75, z: 0, rot: faceSign > 0 ? 0 : PI }, () => bikeHead(kit, amber));
      }
      // control cabinet strapped to the pole + push-button box
      kit.bbox({ x: 0, y: 1.0, z: -0.32, w: 0.5, h: 0.8, d: 0.3, bevel: 0.02, mat: 'steel', tint: '#6f735f' });
      kit.box({ x: 0.18, y: 1.15, z: 0.16, w: 0.12, h: 0.18, d: 0.08, mat: 'sign_yellow', tint: '#c8a030' });
    });
  });
}

/** Oversized yellow signal head (head-local: x across, y up from the bottom, lenses facing +z). */
function bikeHead(kit, amber) {
  const W = 0.62, H = 1.75, D = 0.46, Y = '#fff6d8';
  kit.bbox({ x: 0, y: 0, z: 0, w: W, h: H, d: D, bevel: 0.035, mat: 'sign_yellow', tint: Y });
  kit.box({ x: 0, y: -0.02, z: -D / 2 - 0.04, w: W + 0.1, h: H + 0.04, d: 0.03, mat: 'steel_dark', tint: '#2f2e2b' });
  const lenses = [[1.43, amber ? 'lamp_amber' : 'lamp_off'], [0.87, 'lamp_off'], [0.31, 'lamp_off']];
  for (const [ly, m] of lenses) {
    kit.cyl({ x: 0, y: ly, z: D / 2 - 0.02, r: 0.22, h: 0.03, seg: 16, mat: m, rx: PI / 2, tint: m === 'lamp_off' ? '#3a3a30' : undefined });
    // visor: half tube over the lens
    const arc = [];
    for (let i = 0; i <= 8; i++) { const a = (i / 8) * PI; arc.push([Math.cos(a) * 0.25, Math.sin(a) * 0.25]); }
    for (let i = 8; i >= 0; i--) { const a = (i / 8) * PI; arc.push([Math.cos(a) * 0.235, Math.sin(a) * 0.235]); }
    kit.sweep(arc.map(([x, y]) => [-x, y]), [[0, ly, D / 2], [0, ly, D / 2 + 0.3]], 'sign_yellow', { tint: shadeHex(Y, 0.9), up: [0, 1, 0] });
  }
  // green bicycle on the bottom lens (emissive strokes)
  kit.at({ x: 0, y: 0.31, z: D / 2 + 0.012 }, () => {
    const m = 'lamp_green', t = 0.022, z = 0.002;
    const seg = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy), nx = (-dy / l) * t / 2, ny = (dx / l) * t / 2; kit.face([[a[0] - nx, a[1] - ny, z], [b[0] - nx, b[1] - ny, z], [b[0] + nx, b[1] + ny, z], [a[0] + nx, a[1] + ny, z]], m, {}); };
    for (const cx of [-0.085, 0.085]) { const c = circle(0.055, 10).map(([x, y]) => [cx + x, -0.05 + y]); for (let i = 0; i < c.length; i++) seg(c[i], c[(i + 1) % c.length]); }
    for (const [a, b] of [[[-0.085, -0.05], [-0.02, 0.05]], [[-0.02, 0.05], [0.065, 0.05]], [[0.065, 0.05], [0.085, -0.05]], [[-0.02, 0.05], [0.0, -0.05]], [[0.0, -0.05], [-0.085, -0.05]], [[0.06, 0.05], [0.075, 0.1]], [[0.055, 0.1], [0.1, 0.1]], [[-0.045, 0.08], [-0.0, 0.08]]]) seg(a, b);
  });
}

// ==================================================================================================== props
function props(kit, L) {
  const P = Object.fromEntries(L.PROPS.filter((p) => p.zone === 'center').map((p) => [p.id, p]));
  // C_CAR_NE: burnt-out sedan at the East Street mouth, scorch + shards around it
  const car = P.C_CAR_NE;
  kit.vehicle({ type: 'sedan', at: [car.x, car.z], rot: car.rot, state: 'burnt', tilt: 0.02 });
  kit.decal({ at: [car.x + 0.3, car.z], size: [6.2, 3.4], rot: car.rot, mat: 'decal_stain', tint: '#6a5a50' });
  kit.debris([car.x - 1.2, car.z + 1.6], { r: 1.4, count: 8, kinds: ['chunk', 'paper', 'plank'] });
  kit.prop('old_tyre', { at: [car.x + 2.9, car.z + 1.9], rx: PI / 2 - 0.08, rot: 0.6, y: 0.01 });
  // C_BOX_SE: green 20 ft container on the East Street south sidewalk + a crate at its end (C_CRATES_SE)
  const bx = P.C_BOX_SE;
  kit.at({ x: bx.x, y: SW, z: bx.z, rot: bx.rot }, () => container20(kit, { color: lightenHex(bx.color, 0.3), num: 'GRN 771204 3', outer: 'both', back: true, frameTint: '#5e6b58' }));
  kit.colBox({ x: bx.x, y: SW, z: bx.z, w: bx.w, h: bx.h, d: bx.d, rot: bx.rot }, 'metal');
  const cr = P.C_CRATES_SE;
  crate(kit, { x: cr.x, y: SW, z: cr.z, w: cr.w, h: cr.h, d: cr.d, rot: 0.12, tint: '#a89070', seed: 3 });
  // C_CRATES_W: two crates side by side in the West Street mouth (chest cover)
  const cw = P.C_CRATES_W;
  kit.at({ x: cw.x, z: cw.z, rot: cw.rot }, () => {
    crate(kit, { x: -0.66, y: 0, z: 0, w: 1.3, h: 1.3, d: 1.3, rot: 0.05, tint: '#b09878', seed: 5 });
    crate(kit, { x: 0.68, y: 0, z: 0.04, w: 1.3, h: 1.3, d: 1.3, rot: -0.08, tint: '#9c8668', seed: 6 });
  });
  // newspaper boxes, hydrants, mailbox, trash can
  newsBox(kit, P.C_NEWS_1, '#a8302a', 'DAILY');
  newsBox(kit, P.C_NEWS_2, '#2f4f86', 'NEWS');
  for (const id of ['C_HYD_NE', 'C_HYD_SW']) kit.prop('fire_hydrant', { at: [P[id].x, P[id].z], y: SW, rot: id === 'C_HYD_NE' ? 0.4 : 2.1 });
  mailbox(kit, P.C_MAIL);
  kit.prop('metal_trash_can', { at: [P.C_TRASH_SE.x, P.C_TRASH_SE.z], y: SW, rot: 1.9 });
  bags(kit, [P.C_TRASH_SE.x + 0.6, P.C_TRASH_SE.z + 0.9], SW, 4);
  // C_FIRE_SW: burning barrel (realtime light L_FIRE_C comes from layout.LIGHTS): charred drum, embers, scrap wood
  const fb = P.C_FIRE_SW;
  kit.prop('Barrel_01', { at: [fb.x, fb.z], y: SW, rot: 0.7, tint: '#6e5a4c' });
  kit.cyl({ x: fb.x, y: SW + 0.8, z: fb.z, r: 0.25, h: 0.02, seg: 12, mat: 'lamp_amber' });
  for (let i = 0; i < 4; i++) kit.at({ x: fb.x + Math.cos(i * 1.7) * 0.1, y: SW + 0.82, z: fb.z + Math.sin(i * 1.7) * 0.1, rx: 0.5 * Math.cos(i * 2.3), rz: 0.5 * Math.sin(i * 2.3) }, () => kit.box({ x: 0, y: 0, z: 0, w: 0.06, h: 0.42, d: 0.05, mat: 'wood_planks', tint: '#2a201a' }));
  kit.decal({ at: [fb.x, fb.z], size: 1.6, rot: 0.4, mat: 'decal_stain', y: SW, tint: '#4a3a32' });
  for (let i = 0; i < 5; i++) kit.at({ x: fb.x + kit.rnd(-1.2, 1.2), y: SW + 0.02, z: fb.z + kit.rnd(-1.2, 1.2), rot: kit.rnd(0, 3) }, () => kit.box({ x: 0, y: 0, z: 0, w: kit.rnd(0.4, 0.9), h: 0.04, d: 0.1, mat: 'wood_planks', tint: '#5a4636' }));
  // C_PHONE: phone booth on the West Street south sidewalk
  phoneBooth(kit, P.C_PHONE);
  // C_RUBBLE_NW: fallen cornice pieces from the hotel around the NW signal mast
  const rb = P.C_RUBBLE_NW;
  kit.rubblePile([rb.x - 0.55, rb.z + 0.35], { y: SW, r: 0.75, h: 0.4, count: 6 });
  kit.rubblePile([rb.x + 0.45, rb.z - 0.6], { y: SW, r: 0.6, h: 0.32, count: 5 });
  for (const [dx, dz, r, s] of [[-0.9, -0.5, 0.4, 1.0], [0.6, 0.6, 1.9, 0.8], [-0.2, 1.2, 2.6, 0.7]]) kit.at({ x: rb.x + dx, y: SW, z: rb.z + dz, rot: r, rz: 0.15 }, () => {
    kit.box({ x: 0, y: 0, z: 0, w: s, h: 0.3, d: 0.45, mat: 'trim_stone', tint: '#d9d4c9' });
    kit.box({ x: 0, y: 0.3, z: 0.1, w: s, h: 0.12, d: 0.55, mat: 'trim_stone', tint: '#cfc9bd' });
  });
  kit.colBox({ x: rb.x, y: SW, z: rb.z, w: rb.w, h: 0.45, d: rb.d, rot: rb.rot }, 'concrete');
  // LAMP_10 (cobra head, on) on the South Avenue east sidewalk
  for (const l of L.STREET_LAMPS.filter((s) => Math.abs(s.x) < ZB && Math.abs(s.z) < ZB)) {
    const toRoad = l.x > 0 ? PI : 0;
    kit.streetLight({ at: [l.x, l.z], y: SW, h: l.h, rot: toRoad, on: l.state !== 'dead', flicker: l.state === 'flicker' ? 'sodium' : undefined, intensity: 45, range: 18 });
  }
  // street dressing: loose paper / litter, cones and police tape round the fort feet, a few cardboard boxes
  for (const [x, z] of [[-7.4, -20.5], [7.1, -21.6], [-20.5, 7.2], [21.2, -7.3], [-6.4, 22.4], [6.9, 15.5], [-12.5, -7.1], [12.8, 7.2]]) kit.debris([x, z], { r: 0.9, count: 5, kinds: ['paper', 'paper', 'plank'], y: SW });
  for (const [x, z] of [[-3.1, -16.2], [2.2, 17.6], [-17.4, 2.6], [16.7, -1.8], [-1.0, 9.6]]) kit.debris([x, z], { r: 1.3, count: 6, kinds: ['paper', 'chunk', 'paper'] });
  for (const [x, z, f] of [[-6.2, -10.2, false], [-5.6, -11.0, true], [9.8, -6.6, false], [6.4, 10.0, true], [-10.6, 6.0, false]]) kit.cone([x, z], { fallen: f });
  kit.prop('cardboard_box_01', { at: [-8.4, -19.6], y: SW, rot: 0.3 });
  kit.prop('cardboard_box_01', { at: [-8.2, -20.3], y: SW, rot: 1.4 });
  kit.prop('trashbag', { at: [8.5, -20.8], y: SW, rot: 0.2 });
  kit.prop('trashbag', { at: [8.3, -21.5], y: SW, rot: 2.0 });
  kit.prop('wooden_crate_02', { at: [-21.8, 7.9], y: SW, rot: 1.62 });
  kit.prop('plastic_crate_02', { at: [-21.0, 8.2], y: SW, rot: 0.3 });
  kit.prop('propane_tank', { at: [22.6, 8.4], y: SW, rot: 0.8 });
  kit.prop('utility_box_02', { at: [-24.2, -8.62], y: SW, rot: 0 });
  for (const [x, z, r, n] of [[-23.7, 7.5, 0.1, 3], [23.6, -7.6, 1.4, 2], [-7.2, 24.4, 1.62, 1]]) pallets(kit, x, SW, z, r, n);
  for (const [x, z] of [[-24.6, 8.2], [7.2, 24.8], [24.9, 8.4], [-7.0, -24.6]]) bags(kit, [x, z], SW, 3);
  // police tape strung between the signal poles and the ramp feet (sagging, partly torn)
  kit.tape([[-11.2, 1.05, -11.2], [-7.6, 0.95, -9.2], [-4.6, 0.6, -10.5]]);
  kit.tape([[10.7, 1.05, 11.2], [7.4, 0.9, 9.1]]);
}

/** Low-poly pile of bin bags + a flattened box and loose paper around [x, z]. */
function bags(kit, at, y, n) {
  for (let i = 0; i < n; i++) {
    const p = [at[0] + kit.rnd(-0.6, 0.6), at[1] + kit.rnd(-0.45, 0.45)], s = kit.rnd(0.85, 1.2);
    kit.bbox({ x: p[0], y, z: p[1], rot: kit.rnd(0, PI), w: 0.55 * s, h: 0.42 * s, d: 0.45 * s, bevel: 0.14 * s, mat: 'car_plastic', tint: kit.pick(['#ffffff', '#3a4a3a', '#2a2e3a']), taper: { top: [0.7, 0.75], shift: [kit.rnd(-0.05, 0.05), 0] } });
  }
  kit.box({ x: at[0] + 0.5, y: y + 0.005, z: at[1] - 0.4, rot: kit.rnd(0, 3), w: 0.55, h: 0.012, d: 0.4, mat: 'sign_white', tint: '#a8957a' });
  kit.debris(at, { r: 1.1, count: 5, kinds: ['paper', 'paper', 'plank'], y });
}

/** Stack of n wooden pallets (1.2 x 1.0 m). */
function pallets(kit, x, y, z, rot, n) {
  kit.at({ x, y, z, rot }, () => {
    for (let i = 0; i < n; i++) kit.at({ y: i * 0.145, rot: (i % 2) * 0.06 }, () => {
      for (const zz of [-0.45, 0, 0.45]) kit.box({ x: 0, y: 0, z: zz, w: 1.2, h: 0.1, d: 0.1, mat: 'wood_siding', tint: '#8f7a62' });
      for (let k = 0; k < 7; k++) kit.box({ x: -0.54 + k * 0.18, y: 0.1, z: 0, w: 0.12, h: 0.022, d: 1.0, mat: 'wood_siding', tint: ['#a89074', '#9a8468', '#b39a7c'][k % 3], uvLocal: true, uvRot: -PI / 2 });
    });
    kit.colBox({ x: 0, y: 0, z: 0, w: 1.2, h: n * 0.145, d: 1.0 }, 'wood');
  });
}

/** Wooden crate with framed faces (box at y, centred at x/z, rot). */
function crate(kit, o) {
  kit.at({ x: o.x, y: o.y || 0, z: o.z, rot: o.rot || 0 }, () => {
    kit.box({ x: 0, y: 0, z: 0, w: o.w - 0.06, h: o.h - 0.02, d: o.d - 0.06, mat: 'wood_siding', tint: o.tint, uvOffset: [o.seed * 0.4, 0], collide: 'wood', faces: { bottom: false } });
    for (let k = 0; k < 4; k++) kit.at({ rot: (k * PI) / 2 }, () => {
      const hw = (k % 2 ? o.d : o.w) / 2, hd = (k % 2 ? o.w : o.d) / 2;
      kit.at({ x: 0, y: 0, z: hd - 0.03 + 0.001, rot: PI }, () => crateFace(kit, { x0: -hw + 0.02, x1: hw - 0.02, y0: 0.01, y1: o.h - 0.01, z: 0, tint: o.tint, seed: o.seed + k }));
    });
    kit.box({ x: 0, y: o.h - 0.02, z: 0, w: o.w - 0.04, h: 0.02, d: o.d - 0.04, mat: 'wood_siding', tint: shadeHex(o.tint, 0.9), faces: { bottom: false } });
  });
}

/** Coin-op newspaper box (layout prop: x, z, y = sidewalk). */
function newsBox(kit, p, color, word) {
  kit.at({ x: p.x, y: SW, z: p.z, rot: PI / 2 }, () => {
    kit.box({ x: 0, y: 0, z: 0, w: 0.08, h: 0.35, d: 0.08, mat: 'steel_dark' });
    kit.box({ x: 0, y: 0.03, z: 0, w: 0.42, h: 0.03, d: 0.38, mat: 'steel_dark' });
    kit.bbox({ x: 0, y: 0.35, z: 0, w: p.w, h: 0.62, d: p.d, bevel: 0.02, mat: 'sign_red', tint: color === '#a8302a' ? '#ffffff' : '#7088b0', collide: 'metal' });
    kit.bbox({ x: 0, y: 0.97, z: -0.02, w: p.w + 0.02, h: 0.12, d: p.d + 0.04, bevel: 0.02, mat: 'sign_red', tint: color === '#a8302a' ? '#d8d0c8' : '#6a80a8', rx: -0.18 });
    kit.face([[-0.19, 0.55, p.d / 2 + 0.003], [0.19, 0.55, p.d / 2 + 0.003], [0.19, 0.88, p.d / 2 + 0.003], [-0.19, 0.88, p.d / 2 + 0.003]], 'glass_dirty', {});
    kit.face([[-0.17, 0.57, p.d / 2 - 0.02], [0.17, 0.57, p.d / 2 - 0.02], [0.17, 0.85, p.d / 2 - 0.02], [-0.17, 0.85, p.d / 2 - 0.02]], 'sign_white', { tint: '#d8d2c0' });
    text(kit, word, { x: 0, y: 0.42, h: 0.07, t: 0.014, mat: 'sign_white', tint: '#ffffff', align: 'center', z: p.d / 2 + 0.004 });
  });
}

/** Street mailbox (layout C_MAIL): blue box with a rounded top on four legs, pull-down door. */
function mailbox(kit, p) {
  kit.at({ x: p.x, y: SW, z: p.z, rot: 0.15 }, () => {
    for (const [x, z] of [[-0.22, -0.2], [0.22, -0.2], [0.22, 0.2], [-0.22, 0.2]]) kit.box({ x, y: 0, z, w: 0.05, h: 0.3, d: 0.05, mat: 'steel_dark' });
    const pts = [];
    for (const z of [-0.25, 0.25]) {
      pts.push([-0.26, 0.28, z], [0.26, 0.28, z]);
      for (let i = 0; i <= 8; i++) { const a = (i / 8) * PI; pts.push([Math.cos(a) * 0.26, 1.04 + Math.sin(a) * 0.26, z]); }
    }
    kit.hull(pts, 'sign_blue', { tint: '#6f88b8' });
    kit.colBox({ x: 0, y: 0, z: 0, w: 0.55, h: 1.3, d: 0.55 }, 'metal');
    kit.box({ x: 0, y: 1.02, z: 0.25, w: 0.34, h: 0.12, d: 0.02, mat: 'steel', tint: '#9aa0a8', rx: -0.2 });
    text(kit, 'MAIL', { x: 0, y: 0.72, h: 0.1, t: 0.02, mat: 'sign_white', tint: '#ffffff', align: 'center', z: 0.255 });
  });
}

/** Phone booth: steel frame, three glazed sides (one smashed), door, roof sign, phone unit inside. */
function phoneBooth(kit, p) {
  kit.at({ x: p.x, y: SW, z: p.z, rot: -PI / 2 }, () => {
    const w = 0.92, h = 2.25, T = '#7d8a8a';
    kit.box({ x: 0, y: 0, z: 0, w: w + 0.04, h: 0.08, d: w + 0.04, mat: 'steel_dark', tint: '#4a4c4c' });
    for (const [x, z] of [[-w / 2, -w / 2], [w / 2, -w / 2], [w / 2, w / 2], [-w / 2, w / 2]]) kit.box({ x, y: 0.08, z, w: 0.06, h: h - 0.08, d: 0.06, mat: 'steel', tint: T });
    kit.box({ x: 0, y: h, z: 0, w: w + 0.1, h: 0.08, d: w + 0.1, mat: 'steel', tint: T });
    kit.box({ x: 0, y: h + 0.08, z: 0, w: w - 0.1, h: 0.28, d: w - 0.1, mat: 'sign_white', tint: '#dfe3e2' });
    for (let k = 0; k < 4; k++) kit.at({ rot: (k * PI) / 2 }, () => text(kit, 'PHONE', { x: 0, y: h + 0.14, h: 0.12, t: 0.022, mat: 'sign_blue', tint: '#ffffff', align: 'center', z: (w - 0.1) / 2 + 0.003 }));
    const pane = (k, smashed) => kit.at({ rot: (k * PI) / 2 }, () => {
      if (!smashed) kit.face([[-w / 2 + 0.03, 0.9, w / 2 - 0.01], [w / 2 - 0.03, 0.9, w / 2 - 0.01], [w / 2 - 0.03, h - 0.06, w / 2 - 0.01], [-w / 2 + 0.03, h - 0.06, w / 2 - 0.01]], 'glass_dirty', {});
      else kit.face([[-w / 2 + 0.03, 0.9, w / 2 - 0.01], [-0.1, 0.9, w / 2 - 0.01], [-w / 2 + 0.03, 1.5, w / 2 - 0.01]], 'glass_dirty', {});
      kit.face([[-w / 2 + 0.03, 0.1, w / 2 - 0.01], [w / 2 - 0.03, 0.1, w / 2 - 0.01], [w / 2 - 0.03, 0.88, w / 2 - 0.01], [-w / 2 + 0.03, 0.88, w / 2 - 0.01]], 'steel', { tint: T });
      kit.box({ x: 0, y: 0.88, z: w / 2 - 0.01, w: w - 0.06, h: 0.04, d: 0.04, mat: 'steel', tint: T });
    });
    pane(1, false); pane(2, true); pane(3, false);
    kit.at({ x: 0.0, y: 0, z: -w / 2 + 0.05 }, () => {
      kit.bbox({ x: 0, y: 1.1, z: 0.12, w: 0.28, h: 0.5, d: 0.16, bevel: 0.02, mat: 'steel', tint: '#3e4242' });
      kit.box({ x: 0.0, y: 1.42, z: 0.22, w: 0.22, h: 0.06, d: 0.05, mat: 'car_plastic' });
      kit.sweep(circle(0.008, 4), [[0.08, 1.4, 0.22], [0.14, 0.95, 0.35], [0.0, 0.7, 0.32]], 'wire', { smooth: true });
    });
    kit.at({ x: 0, y: 0.08, z: w / 2, rot: 0.9 }, () => kit.box({ x: w / 2 - 0.05, y: 0, z: 0, w: w - 0.1, h: h - 0.2, d: 0.03, mat: 'steel', tint: T, faces: {} }));
    kit.colBox({ x: 0, y: 0, z: 0, w: w + 0.1, h: h + 0.36, d: w + 0.1 }, 'metal');
  });
}

// ---------------------------------------------------------------- facade details (wall-local frame, +z outward)
/** Horizontal strip pieces at height y avoiding openings (rustication grooves, string courses between windows). */
function hBand(kit, L, ops, y, h, o) {
  const cuts = ops.filter((op) => op.y - 0.02 < y + h && op.y + op.h + 0.02 > y).map((op) => { const x0 = op.x ?? op.cx - op.w / 2; return [x0 - 0.03, x0 + op.w + 0.03]; }).sort((p, q) => p[0] - q[0]);
  let x = o.x0 ?? 0;
  for (const [c0, c1] of [...cuts, [o.x1 ?? L, o.x1 ?? L]]) {
    if (c0 - x > 0.06) kit.box({ x: (x + c0) / 2, y, z: (o.d ?? 0.02) / 2, w: c0 - x, h, d: o.d ?? 0.02, mat: o.mat, tint: o.tint, faces: { nz: false } });
    x = Math.max(x, c1);
  }
}
/** Stone hood moulding above a window (cornice slab + optional pediment / keystone / arch). */
function hood(kit, op, kind, o = {}) {
  const x = op.cx ?? op.x + op.w / 2, top = op.y + op.h, w = op.w;
  const mat = o.mat || 'trim_stone', tint = o.tint;
  if (kind === 'arch') {
    const r = w / 2 + 0.1, seg = 9, ring = [];
    for (let i = 0; i <= seg; i++) { const a = (i / seg) * PI; ring.push([x + Math.cos(a) * r, top + Math.sin(a) * r * 0.9, 0.06]); }
    kit.sweep(rectProf(0.16, 0.12), ring, mat, { tint, up: [0, 0, 1] });
    const fan = [[x - w / 2, top], [x + w / 2, top]];
    for (let i = 1; i < seg; i++) { const a = (i / seg) * PI; fan.splice(fan.length - 1, 0, [x + Math.cos(PI - a) * (w / 2), top + Math.sin(PI - a) * (w / 2) * 0.85]); }
    flat(kit, fan, 0.004, 'lamp_off', { tint: '#5a5e60' });
    kit.box({ x, y: top + r * 0.9 - 0.08, z: 0.08, w: 0.2, h: 0.24, d: 0.12, mat, tint });
    return;
  }
  kit.box({ x, y: top + 0.07, z: 0.08, w: w + 0.4, h: 0.14, d: 0.16, mat, tint, faces: { nz: false } });
  kit.box({ x, y: top + 0.21, z: 0.1, w: w + 0.5, h: 0.05, d: 0.2, mat, tint, faces: { nz: false } });
  for (const s of [-1, 1]) kit.box({ x: x + s * (w / 2 + 0.12), y: top - 0.22, z: 0.06, w: 0.12, h: 0.3, d: 0.12, mat, tint, faces: { nz: false } }); // console brackets
  if (kind === 'pediment') {
    const pw = w + 0.5, ph = 0.42, ang = Math.atan2(ph, pw / 2), len = Math.hypot(ph, pw / 2);
    for (const s of [-1, 1]) kit.at({ x: x + s * pw / 4, y: top + 0.26 + ph / 2, z: 0.1, rz: -s * ang }, () => kit.box({ x: 0, y: -0.06, z: 0, w: len + 0.08, h: 0.12, d: 0.18, mat, tint }));
    flat(kit, [[x - pw / 2 + 0.12, top + 0.28], [x + pw / 2 - 0.12, top + 0.28], [x, top + 0.26 + ph - 0.08]], 0.02, mat, { tint: shadeHex(tint || '#d6d0c4', 0.93) });
  } else if (kind === 'key') {
    kit.at({ x, y: top - 0.02, z: 0.07 }, () => kit.hull([[-0.11, 0.26, -0.06], [0.11, 0.26, -0.06], [-0.07, -0.02, -0.06], [0.07, -0.02, -0.06], [-0.11, 0.26, 0.05], [0.11, 0.26, 0.05], [-0.07, -0.02, 0.05], [0.07, -0.02, 0.05]], mat, { tint }));
  }
}
/** Balustraded balconette under a window (slab on consoles + balusters + rail). */
function balconette(kit, op, o = {}) {
  const x = op.cx ?? op.x + op.w / 2, w = (o.w ?? op.w + 0.7), d = o.d ?? 0.55, y = op.y - 0.2;
  const mat = o.mat || 'trim_stone', tint = o.tint;
  kit.box({ x, y, z: d / 2, w, h: 0.16, d, mat, tint });
  for (const s of [-1, 1]) kit.at({ x: x + s * (w / 2 - 0.18), y: y - 0.32, z: 0 }, () => kit.hull([[-0.07, 0.32, 0], [0.07, 0.32, 0], [-0.07, 0.32, d * 0.75], [0.07, 0.32, d * 0.75], [-0.07, 0, 0], [0.07, 0, 0], [-0.07, 0.24, 0.12], [0.07, 0.24, 0.12]], mat, { tint }));
  const rh = 0.78, nb = Math.max(3, Math.round(w / 0.19));
  for (let i = 0; i < nb; i++) kit.lathe([[0.035, 0], [0.05, 0.1], [0.03, 0.3], [0.05, 0.5], [0.03, 0.62], [0.035, rh - 0.1]], { x: x - w / 2 + 0.12 + ((w - 0.24) * i) / (nb - 1), y: y + 0.16, z: d - 0.09, seg: 6, mat, tint });
  for (const s of [-1, 1]) for (let i = 1; i < 3; i++) kit.lathe([[0.035, 0], [0.05, 0.1], [0.03, 0.3], [0.05, 0.5], [0.03, 0.62], [0.035, rh - 0.1]], { x: x + s * (w / 2 - 0.09), y: y + 0.16, z: d - 0.09 - i * 0.16, seg: 6, mat, tint });
  kit.box({ x, y: y + 0.16 + rh - 0.1, z: d - 0.09, w: w - 0.04, h: 0.1, d: 0.14, mat, tint });
  for (const s of [-1, 1]) kit.box({ x: x + s * (w / 2 - 0.09), y: y + 0.16 + rh - 0.1, z: (d - 0.09) / 2, w: 0.14, h: 0.1, d: d - 0.09, mat, tint });
  kit.colBox({ x, y, z: d / 2, w, h: 0.16 + rh, d }, 'concrete');
}
/** Weathered fascia sign board with lettering (wall-local; x0..x1, y bottom, h). */
function fascia(kit, o) {
  const x0 = Math.min(o.x0, o.x1), x1 = Math.max(o.x0, o.x1), { y, h } = o;
  kit.bbox({ x: (x0 + x1) / 2, y, z: 0.06, w: x1 - x0, h, d: 0.12, bevel: 0.02, mat: o.mat || 'sign_white', tint: o.tint });
  if (o.border) for (const yy of [y + 0.06, y + h - 0.09]) kit.box({ x: (x0 + x1) / 2, y: yy, z: 0.122, w: x1 - x0 - 0.12, h: 0.03, d: 0.006, mat: o.border.mat, tint: o.border.tint });
  // lines centred vertically: cap heights lh[i], 0.45 * lh gaps between lines; long lines shrink to fit
  const lines = Array.isArray(o.text) ? o.text : [o.text];
  const hs = lines.map((s, i) => { const hh = o.lh?.[i] ?? o.lh?.[0] ?? h * 0.5; return Math.min(hh, ((x1 - x0) * 0.9 * hh) / Math.max(1e-3, textWidth(s, hh))); });
  const total = hs.reduce((s, v, i) => s + v + (i ? 0.45 * v : 0), 0);
  let yy = y + (h + total) / 2;
  lines.forEach((t, i) => {
    yy -= hs[i] + (i ? 0.45 * hs[i] : 0);
    text(kit, t, { x: (x0 + x1) / 2, y: yy, h: hs[i], t: hs[i] * (o.weight ?? 0.16), mat: o.textMat || 'frame_dark', tint: o.textTint, align: 'center', z: 0.125, serif: o.serif, italic: o.italic });
  });
  if (o.lamps) for (let x = x0 + 0.5; x < x1 - 0.3; x += (x1 - x0 - 0.8) / Math.max(1, o.lamps - 1)) {
    kit.sweep(circle(0.012, 5), [[x, y + h - 0.02, 0.1], [x, y + h + 0.12, 0.35], [x, y + h + 0.08, 0.45]], 'steel_dark', { smooth: true, up: [1, 0, 0] });
    kit.cyl({ x, y: y + h + 0.0, z: 0.45, r: 0.09, r2: 0.03, h: 0.08, seg: 8, mat: 'steel_dark', tint: '#3b4a3f' });
  }
}
/** Striped fabric awning (wall-local) with valance and side cheeks; torn: stripes missing / hanging. */
function stripedAwning(kit, o) {
  const { x0, x1, y, depth } = o;
  const drop = o.drop ?? 0.6, val = o.valance ?? 0.28, sw = o.stripe ?? 0.36;
  const n = Math.max(1, Math.round((x1 - x0) / sw)), s = (x1 - x0) / n;
  const torn = new Set(o.torn || []), hang = new Set(o.hang || []);
  for (let i = 0; i < n; i++) {
    const a = x0 + i * s, b = a + s, tint = o.colors[i % o.colors.length];
    if (torn.has(i)) {
      // torn: a ragged stub near the wall and a strip hanging from the frame
      kit.face([[a, y - drop * 0.18, depth * 0.18], [b, y - drop * 0.22, depth * 0.2], [b, y, 0.02], [a, y, 0.02]], 'ct_fabric', { tint });
      if (hang.has(i)) kit.face([[a + 0.03, y - drop - 1.1, depth - 0.05], [b - 0.05, y - drop - 0.85, depth - 0.02], [b, y - drop, depth], [a, y - drop, depth]], 'ct_fabric', { tint: shadeHex(tint, 0.92) });
      continue;
    }
    kit.face([[a, y - drop, depth], [b, y - drop, depth], [b, y, 0.02], [a, y, 0.02]], 'ct_fabric', { tint });
    // scalloped valance: a trapezoid tongue per stripe
    kit.face([[a + 0.02, y - drop - val, depth], [b - 0.02, y - drop - val, depth], [b, y - drop, depth], [a, y - drop, depth]], 'ct_fabric', { tint });
  }
  for (const xx of [x0, x1]) {
    const tri = [[xx, y, 0.02], [xx, y - drop, depth], [xx, y - drop - val, depth]];
    kit.face(xx === x0 ? tri : tri.slice().reverse(), 'ct_fabric', { tint: o.colors[0] });
  }
  // steel frame: front bar + two arms to the wall
  kit.sweep(circle(0.02, 6), [[x0, y - drop, depth], [x1, y - drop, depth]], 'steel_dark', { smooth: true });
  for (const xx of [x0 + 0.05, x1 - 0.05]) kit.sweep(circle(0.016, 6), [[xx, y - drop - 0.6, 0.02], [xx, y - drop, depth - 0.02]], 'steel_dark', { smooth: true, up: [1, 0, 0] });
}
/** Paper poster (with header band + text block) on the wall plane (z) — layered bill posters. */
function poster(kit, x, y, w, h, z, o = {}) {
  const tint = o.tint || kit.pick(['#e6dfcc', '#d9c27a', '#c96a4a', '#7fa3b8', '#e2d6b8', '#b8c99a']);
  kit.face([[x, y, z], [x + w, y, z], [x + w, y + h, z], [x, y + h, z]], 'sign_white', { tint, shade: kit.rnd(0.8, 1) });
  if (o.head) text(kit, o.head, { x: x + w / 2, y: y + h * 0.68, h: Math.min(h * 0.18, w / (o.head.length * 0.95)), t: undefined, mat: o.headMat || 'frame_dark', tint: o.headTint, align: 'center', z: z + 0.002 });
  else kit.face([[x + w * 0.1, y + h * 0.7, z + 0.002], [x + w * 0.9, y + h * 0.7, z + 0.002], [x + w * 0.9, y + h * 0.86, z + 0.002], [x + w * 0.1, y + h * 0.86, z + 0.002]], kit.pick(['sign_red', 'frame_dark', 'sign_blue']), {});
  for (let i = 0; i < 3; i++) kit.face([[x + w * 0.12, y + h * (0.18 + i * 0.13), z + 0.002], [x + w * (0.6 + kit.rnd(0, 0.28)), y + h * (0.18 + i * 0.13), z + 0.002], [x + w * (0.6 + kit.rnd(0, 0.28)), y + h * (0.23 + i * 0.13), z + 0.002], [x + w * 0.12, y + h * (0.23 + i * 0.13), z + 0.002]], 'frame_dark', { tint: '#6a6258' });
  if (o.peel) { // a corner curling off the wall
    const px = x + w, py = y + h;
    kit.face([[px - 0.25, py, z], [px, py - 0.3, z], [px - 0.05, py - 0.05, z + 0.12]], 'sign_white', { tint: shadeHex(tint, 0.85) });
  }
}
/** Roller shutter face covering x0..x1 from y0 to y1 at plane z (wall-local), with bottom bar + housing. */
function shutterFace(kit, x0, x1, y0, y1, z, tint) {
  kit.face([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], 'metal_shutter', { tint });
  kit.box({ x: (x0 + x1) / 2, y: y0 - 0.04, z: z + 0.02, w: x1 - x0, h: 0.06, d: 0.05, mat: 'steel_dark', tint: '#5d5a54' });
  kit.box({ x: x0 + 0.25, y: y0 - 0.1, z: z + 0.05, w: 0.08, h: 0.06, d: 0.04, mat: 'steel' });
}
/** Scissor security gate across x0..x1 (wall-local, plane z): verticals + X lattice. */
function scissorGate(kit, x0, x1, y0, y1, z) {
  const n = Math.max(2, Math.round((x1 - x0) / 0.55));
  const s = (x1 - x0) / n, mat = 'steel_dark', tint = '#5a5c5c';
  for (let i = 0; i <= n; i++) kit.box({ x: x0 + i * s, y: y0, z, w: 0.025, h: y1 - y0, d: 0.025, mat, tint });
  const rows = Math.max(2, Math.round((y1 - y0) / 0.8)), rh = (y1 - y0) / rows;
  for (let i = 0; i < n; i++) for (let r = 0; r < rows; r++) {
    const cx = x0 + (i + 0.5) * s, cy = y0 + (r + 0.5) * rh, ang = Math.atan2(rh, s), len = Math.hypot(rh, s);
    for (const sg of [-1, 1]) kit.at({ x: cx, y: cy, z: z + 0.015 * sg, rz: sg * ang }, () => kit.box({ x: 0, y: -0.01, z: 0, w: len, h: 0.02, d: 0.012, mat, tint }));
  }
  kit.box({ x: (x0 + x1) / 2, y: y1 - 0.06, z, w: x1 - x0 + 0.1, h: 0.06, d: 0.06, mat, tint });
  kit.box({ x: (x0 + x1) / 2, y: y0, z, w: x1 - x0 + 0.1, h: 0.04, d: 0.06, mat, tint });
}
/** Plywood sheet nailed over an opening (wall-local; slightly tilted; spray-painted marks). */
function plywood(kit, cx, y, w, h, z, o = {}) {
  kit.at({ x: cx, y: y + h / 2, z, rz: o.rz ?? kit.rnd(-0.015, 0.015) }, () => {
    kit.box({ x: 0, y: -h / 2, z: 0.009, w, h, d: 0.018, mat: 'wood_siding', tint: o.tint || '#bfae92', uvOffset: [kit.rnd(0, 3), kit.rnd(0, 3)], faces: { nz: false } });
    if (o.mark) text(kit, o.mark, { x: 0, y: -0.25, h: Math.min(0.45, w / (o.mark.length * 0.95)), t: 0.05, mat: o.markMat || 'sign_red', tint: o.markTint, align: 'center', z: 0.02, italic: 0.12 });
  });
}

/** Mixes an sRGB hex colour towards white by k. */
function lightenHex(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * k).toString(16).padStart(2, '0')).join('');
}
/** Darkens/brightens an sRGB hex colour by k (clamped). */
function shadeHex(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Cast-iron manhole cover: rim ring + cover disc with a cast cross pattern (decal-thin, flush with the road). */
function manholeCover(kit, at, r) {
  kit.manhole(at, { r: r + 0.07, tint: '#55524e', y: 0.001 });
  kit.manhole(at, { r, tint: '#7a7470', y: 0.004 });
  kit.at({ x: at[0], y: 0.0085, z: at[1], rot: 0.6 }, () => {
    for (const a of [0, PI / 2]) kit.at({ rot: a }, () => kit.upFace([[-r * 0.85, 0, -0.025], [r * 0.85, 0, -0.025], [r * 0.85, 0, 0.025], [-r * 0.85, 0, 0.025]], 'steel_dark', null, { tint: '#4a4744' }));
  });
}
