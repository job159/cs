// 失落之城 LOST TOWN — zone 'west': 西街、西橫街與 LED 門架 (West Street, West Cross Street, LED gantry),
// build-zone rect x -84..-26, z -40..40 (tools/map/losttown/layout.mjs BUILD_ZONES).
// Recreates the west arm of CSO's "Lost City" (zs_lostcity): an 18 m street canyon running from the central
// intersection to a T with a narrow cross street, the white box truck parked mid-street facing the fort, and at the
// far end the evacuation gantry: two rust-red lattice towers carrying an amber dot-matrix panel over a barricade of
// crate walls and an olive container set end-on (doors to the fort) that seals the street.
//   north  W_N1 pharmacy flats (dead green-cross blade, fire escape = SP_W_ROOF)   W_N2 corner hardware (HARDWARE 五金)
//   south  W_S1 sale store (yellow BIG SALE 大特賣 band, SALE posters, SP_W_WIN)    W_S2 corner flats (fire escape, W face)
//   T      West Cross Street x -66..-54: fence barricade (z -26.2) and rubble barricade (z 30.6), spawn pockets to the
//          end walls at z -34 / 38; X_W1 west-row flats, X_W2 old Harbor Hotel; LM_LED over the stub (x -76..-66)
// All geometry, wording, brands and art are original (docs/MAP_LOSTTOWN.md §0). Lettering = outlines traced from text
// we rendered ourselves with installed system faces (GLYPHS, end of file); the LED panel uses our own 5x7 dot font and a
// 16 px CJK raster rendered the same way. Every number other zones or the runtime depend on (footprints, spawners,
// lights, blockers, props) comes from tools/map/losttown/layout.mjs.
//
// Seams (same rules as center / north): street y 0, sidewalks y 0.15 (concrete_floor, 0.3 m granite curb) on the
// carriageway edges z = ±5.5 (West Street + stub) and x = -63.5 / -56.5 (cross street), centre-line dashes at world
// [9k, 9k + 3], yellow edge lines 0.4 m off the curbs, buildings stand at y 0.13.
// Barricade gaps: zombies move on the nav grid (cells 0.5 m, clearance r 0.3), players collide with the mesh (r 0.34),
// so every zombie gap is narrowed to a 0.62 m slot centred on a nav-cell line; the player clips above the barricades
// start at their top (BLK_* in the layout) and never touch the nav grid.
// LED panel: the static package shows LEAVE TOWN / NOW!! (amber) over a red 封城中 立即撤離 ticker; QUARANTINE ZONE /
// NO ENTRY are on the barricade boards. Cycling the four messages needs a runtime hook (not part of the package format).
// Fake rooms behind openings are drawn by fakeRoom() (the kit's room box is wound inside-out), fire escapes by
// fireEscape() (only the first landing collides, so the sidewalk under them stays in the nav grid).
// Spawners, L_LED_W / LB_LED_PANEL, supplies and the zones come from layout.toMapJson() / LIGHTS.
import { MATERIALS } from '../../lib/materials.mjs';
import { ensureCCW } from '../../lib/kit/core.mjs';

const PI = Math.PI;
const SW = 0.15;   // sidewalk top
const BY = 0.13;   // building base (2 cm below the sidewalk top: no crack at the wall foot)

// Zone-local palette additions. wz_paint* (lettering, spray paint, stencils) are untextured but lightmapped: they share
// every visual key with car_plastic / rubber, so the compiler folds them into that GPU material and moves the colour
// into the vertex tint (no extra draw call), while the bake shades them like the wall they are painted on (an unlit
// ink would glow in the shaded street canyons, where the IBL is not occluded). wz_fabric = white canvas, wz_wood =
// plain planks (crates, boards) - both fold with the other zones' equivalents.
const ZONE_MATS = {
  wz_fabric: { set: 'canvas', surf: 'wood', tile: 1.2, color: '#ffffff', lm: 1, side: 'double' },
  wz_wood: { set: 'wood_siding', surf: 'wood', tile: 1.3, color: '#ffffff', lm: 1 },
  wz_paint: { set: null, surf: 'metal', color: '#24211e', rough: 0.8, lm: 1 },
  wz_paint_white: { set: null, surf: 'metal', color: '#e8e3d6', rough: 0.8, lm: 1 },
  wz_paint_red: { set: null, surf: 'metal', color: '#a42a20', rough: 0.8, lm: 1 },
  wz_paint_yellow: { set: null, surf: 'metal', color: '#e0b434', rough: 0.8, lm: 1 },
  wz_paint_green: { set: null, surf: 'metal', color: '#2c5236', rough: 0.8, lm: 1 },
};
for (const [k, v] of Object.entries(ZONE_MATS)) if (!MATERIALS[k]) MATERIALS[k] = v;

// ---------------------------------------------------------------------------------------------------- small helpers
const circle = (r, seg) => { const out = []; for (let i = 0; i < seg; i++) { const a = (i / seg) * PI * 2; out.push([Math.cos(a) * r, Math.sin(a) * r]); } return out; };
const rectProf = (w, h, oy = 0) => [[-w / 2, oy - h / 2], [w / 2, oy - h / 2], [w / 2, oy + h / 2], [-w / 2, oy + h / 2]];
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
/** Wall-local frame of a footprint edge a -> b (x along the edge, +z outward, y = world y). */
const edgeFrame = (a, b) => ({ x: a[0], y: 0, z: a[1], rot: Math.atan2(-(b[1] - a[1]), b[0] - a[0]) });
/** Frames whose +z faces the given world direction (signs, boards); local +x reads left -> right for a viewer. */
const FACE = { E: PI / 2, W: -PI / 2, S: 0, N: PI };
/** Flat polygon (2D [x, y]) on plane z of the current frame, facing +z. */
function flat(kit, pts, z, mat, fo = {}) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
  const P = a >= 0 ? pts : pts.slice().reverse();
  kit.face(P.map(([x, y]) => [x, y, z]), mat, fo);
}

// ---------------------------------------------------------------------------------------------------- lettering
// Traced outline glyphs (GLYPHS, bottom of file): per font { c: cap height px, g: { ch: 'advance|shape;shape' } },
// shape = outer/hole/hole..., each loop = 4-char tokens (2 x 2 base64 digits = 2 * px + 512). Faces are emitted on
// plane z of the current frame facing +z (optionally extruded by `depth` with side walls).
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64I = Object.fromEntries([...B64].map((c, i) => [c, i]));
const glyphCache = new Map();
/** Douglas-Peucker on a closed loop (keeps >= 4 points). */
function simplifyLoop(pts, eps) {
  if (pts.length < 8 || eps <= 0.5) return pts;
  let i1 = 0, best = -1;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > best) { best = d; i1 = i; } }
  const keep = new Uint8Array(pts.length); keep[0] = keep[i1] = 1;
  const rec = (a, b) => {
    const A = pts[a % pts.length], Bp = pts[b % pts.length], L = Math.hypot(Bp[0] - A[0], Bp[1] - A[1]) || 1e-9;
    let md = -1, mi = -1;
    for (let i = a + 1; i < b; i++) { const P = pts[i % pts.length]; const d = Math.abs((Bp[0] - A[0]) * (A[1] - P[1]) - (A[0] - P[0]) * (Bp[1] - A[1])) / L; if (d > md) { md = d; mi = i; } }
    if (md > eps) { keep[mi % pts.length] = 1; rec(a, mi); rec(mi, b); }
  };
  rec(0, i1); rec(i1, pts.length);
  const out = pts.filter((_, i) => keep[i]);
  return out.length >= 4 ? out : pts;
}
function glyph(font, ch, eps = 0.5) {
  const key = font + '\u0000' + ch + '\u0000' + eps;
  if (glyphCache.has(key)) return glyphCache.get(key);
  const F = GLYPHS[font];
  const s = F.g[ch] ?? F.g[ch.toUpperCase()];
  let out;
  if (s === undefined) out = { adv: F.c * 0.62, shapes: [] };
  else {
    const [adv, body] = s.split('|');
    const dec = (t, i) => (((B64I[t[i]] << 6) | B64I[t[i + 1]]) - 512) / 2;
    const shapes = body ? body.split(';').map((sh) => sh.split('/').map((lp) => { const pts = []; for (let i = 0; i < lp.length; i += 4) pts.push([dec(lp, i), dec(lp, i + 2)]); return pts; })) : [];
    out = { adv: +adv, shapes: eps > 0.5 ? shapes.map((sh) => sh.map((lp) => simplifyLoop(lp, eps))) : shapes };
  }
  glyphCache.set(key, out);
  return out;
}
/** Emits one glyph with its pen origin at (x, y) (baseline), scale sx/sy (m per px). */
function glyphAt(kit, font, ch, x, y, sx, sy, o) {
  // outline tolerance ~3 mm in the world, between 0.5 and 3 px of the traced glyph
  const e = 0.003 / Math.max(sx, sy), eps = e >= 3 ? 3 : e >= 2 ? 2 : e >= 1 ? 1 : 0.5;
  const g = glyph(font, ch, eps);
  const z = o.z ?? 0, d = o.depth || 0, it = o.italic || 0;
  for (const sh of g.shapes) {
    const P = (lp, zz) => lp.map(([gx, gy]) => [x + gx * sx + gy * sy * it, y + gy * sy, zz]);
    const outer = P(sh[0], z + d), holes = sh.slice(1).map((h) => P(h, z + d));
    kit.face(outer, o.mat, { holes, tint: o.tint, shade: o.shade });
    if (d > 0) for (const lp of sh) {
      const q = P(lp, z), r = P(lp, z + d);
      for (let i = 0; i < q.length; i++) { const j = (i + 1) % q.length; kit.face([q[i], q[j], r[j], r[i]], o.sideMat || o.mat, { tint: o.sideTint ?? o.tint, shade: 0.8 }); }
    }
  }
}
/** Width of a run of text (m) at cap height h. */
function measure(str, o) {
  const F = GLYPHS[o.font || 'sans'], s = o.h / F.c, tr = (o.track ?? 0.06) * o.h;
  const chars = [...str];
  return chars.reduce((w, ch) => w + (ch === ' ' ? (o.space ?? 0.42) * o.h : glyph(o.font || 'sans', ch).adv * s), 0) + tr * Math.max(0, chars.length - 1);
}
/**
 * One line of lettering in the current frame: baseline at (x, y), plane z, facing +z, cap height h. Options: font
 * ('slab' | 'serif' | 'sans' | 'hwy' | 'cjk'), align ('left' | 'center' | 'right'), track (em of h), maxW (squeeze),
 * mat, tint, depth, italic. Returns the width.
 */
function textLine(kit, str, o) {
  const font = o.font || 'sans', F = GLYPHS[font], s = o.h / F.c, tr = (o.track ?? 0.06) * o.h;
  let W = measure(str, { ...o, font });
  const sx = o.maxW && W > o.maxW ? o.maxW / W : 1;
  W *= sx;
  let x = (o.x ?? 0) - (o.align === 'center' ? W / 2 : o.align === 'right' ? W : 0);
  for (const ch of str) {
    if (ch !== ' ') glyphAt(kit, font, ch, x, o.y ?? 0, s * sx, s, { ...o });
    x += ((ch === ' ' ? (o.space ?? 0.42) * o.h : glyph(font, ch).adv * s) + tr) * sx;
  }
  return W;
}
/** Mixed-font line: segs [[str, { font, h, mat, tint, ... }], ...] laid out one after the other, centred on x. */
function textMixed(kit, segs, o) {
  const gap = o.gap ?? 0.25;
  const ws = segs.map(([str, so]) => measure(str, { ...o, ...so }));
  const W = ws.reduce((a, b) => a + b, 0) + gap * (segs.length - 1);
  const sx = o.maxW && W > o.maxW ? o.maxW / W : 1;
  let x = (o.x ?? 0) - (W * sx) / 2;
  segs.forEach(([str, so], i) => { textLine(kit, str, { ...o, ...so, x, align: 'left', maxW: ws[i] * sx }); x += (ws[i] + gap) * sx; });
  return W * sx;
}
/** Letters stacked vertically, centred on x, first letter's cap top at yTop, pitch between baselines. */
function textVertical(kit, str, o) {
  const font = o.font || 'serif', F = GLYPHS[font], s = o.h / F.c;
  let y = o.yTop - o.h;
  for (const ch of str) {
    if (ch !== ' ') { const g = glyph(font, ch); glyphAt(kit, font, ch, (o.x ?? 0) - (g.adv * s) / 2, y, s, s, o); }
    y -= o.pitch;
  }
}

// ---------------------------------------------------------------------------------------------------- facade parts
const WIN_STATES = { glass: 0.36, dark: 0.3, broken: 0.24, boarded: 0.1 };
const WIN_STATES_POOR = { glass: 0.24, dark: 0.28, broken: 0.3, boarded: 0.18 };

/** Weathered sign board (wall-local): bbox panel + optional border strips. Returns the front plane z. */
function board(kit, x0, x1, y, h, o = {}) {
  kit.bbox({ x: (x0 + x1) / 2, y, z: (o.z ?? 0) + (o.d ?? 0.12) / 2, w: x1 - x0, h, d: o.d ?? 0.12, bevel: 0.02, mat: o.mat || 'sign_white', tint: o.tint });
  const zf = (o.z ?? 0) + (o.d ?? 0.12) + 0.002;
  if (o.border) {
    const b = o.border, bw = b.w ?? 0.04, ins = b.inset ?? 0.07;
    flat(kit, rect2(x0 + ins, y + ins, x1 - ins, y + ins + bw), zf, b.mat, { tint: b.tint });
    flat(kit, rect2(x0 + ins, y + h - ins - bw, x1 - ins, y + h - ins), zf, b.mat, { tint: b.tint });
    flat(kit, rect2(x0 + ins, y + ins + bw, x0 + ins + bw, y + h - ins - bw), zf, b.mat, { tint: b.tint });
    flat(kit, rect2(x1 - ins - bw, y + ins + bw, x1 - ins, y + h - ins - bw), zf, b.mat, { tint: b.tint });
  }
  return zf;
}
/** Rain / rust streaks running down a wall plane z (wall-local). */
function streaks(kit, x0, x1, yTop, n, z, len = [0.8, 2.2]) {
  for (let i = 0; i < n; i++) {
    const sx = kit.rnd(x0, x1), sw = kit.rnd(0.18, 0.5), l = kit.rnd(len[0], len[1]), u0 = kit.pick([0, 0.5]);
    kit.face([[sx, yTop - l, z], [sx + sw, yTop - l, z], [sx + sw, yTop, z], [sx, yTop, z]], 'decal_streak', { uvs: [[u0, 0], [u0 + 0.5, 0], [u0 + 0.5, 1], [u0, 1]] });
  }
}
/** Striped fabric awning (wall-local, top edge at y on the wall, sloping out to depth), with valance + frame. */
function stripedAwning(kit, o) {
  const { x0, x1, y, depth } = o;
  const drop = o.drop ?? 0.35, val = o.valance ?? 0.25, sw = o.stripe ?? 0.34;
  const n = Math.max(1, Math.round((x1 - x0) / sw)), s = (x1 - x0) / n;
  const torn = new Set(o.torn || []), hang = new Set(o.hang || []);
  const nz = Math.hypot(drop, depth), oy = (-depth / nz) * 0.015, oz = (-drop / nz) * 0.015;
  for (let i = 0; i < n; i++) {
    const a = x0 + i * s, b = a + s, tint = o.colors[i % o.colors.length];
    if (torn.has(i)) {
      kit.face([[a, y - drop * 0.25, depth * 0.25], [b, y - drop * 0.2, depth * 0.2], [b, y, 0.02], [a, y, 0.02]], 'wz_fabric', { tint });
      if (hang.has(i)) kit.face([[a + 0.03, y - drop - 1.0, depth - 0.08], [b - 0.05, y - drop - 0.75, depth - 0.04], [b, y - drop, depth], [a, y - drop, depth]], 'wz_fabric', { tint: shadeHex(tint, 0.9) });
      continue;
    }
    kit.face([[a, y - drop, depth], [b, y - drop, depth], [b, y, 0.02], [a, y, 0.02]], 'wz_fabric', { tint });
    kit.face([[a, y + oy, 0.02 + oz], [b, y + oy, 0.02 + oz], [b, y - drop + oy, depth + oz], [a, y - drop + oy, depth + oz]], 'wz_fabric', { tint, shade: 0.62 });
    kit.face([[a + 0.015, y - drop - val, depth], [b - 0.015, y - drop - val, depth], [b, y - drop, depth], [a, y - drop, depth]], 'wz_fabric', { tint });
    kit.face([[b - 0.015, y - drop - val, depth - 0.012], [a + 0.015, y - drop - val, depth - 0.012], [a, y - drop, depth - 0.012], [b, y - drop, depth - 0.012]], 'wz_fabric', { tint, shade: 0.6 });
  }
  for (const xx of [x0, x1]) {
    const tri = [[xx, y, 0.02], [xx, y - drop, depth], [xx, y - drop - val, depth]];
    kit.face(xx === x0 ? tri : tri.slice().reverse(), 'wz_fabric', { tint: o.colors[0] });
  }
  kit.sweep(circle(0.02, 6), [[x0, y - drop, depth - 0.02], [x1, y - drop, depth - 0.02]], 'steel_dark', { smooth: true });
  for (const xx of [x0 + 0.05, x1 - 0.05]) kit.sweep(circle(0.016, 6), [[xx, y - drop - 0.55, 0.02], [xx, y - drop, depth - 0.03]], 'steel_dark', { smooth: true, up: [1, 0, 0] });
  kit.box({ x: (x0 + x1) / 2, y: y - 0.02, z: 0.04, w: x1 - x0 + 0.1, h: 0.1, d: 0.08, mat: 'steel_dark', tint: '#3a3632' });
}
/** Bill poster on a wall plane z (wall-local) with a header and text rows; peel curls a corner off. */
function poster(kit, x, y, w, h, z, o = {}) {
  const tint = o.tint || kit.pick(['#e6dfcc', '#d9c27a', '#c96a4a', '#7fa3b8', '#e2d6b8', '#b8c99a', '#d48a5a', '#9fb0a0']);
  const rz = o.rz ?? kit.rnd(-0.04, 0.04);
  kit.at({ x: x + w / 2, y: y + h / 2, z, rz }, () => {
    const X0 = -w / 2, X1 = w / 2, Y0 = -h / 2, Y1 = h / 2;
    kit.face([[X0, Y0, 0], [X1, Y0, 0], [X1, Y1, 0], [X0, Y1, 0]], 'sign_white', { tint, shade: kit.rnd(0.78, 1) });
    if (o.head) textLine(kit, o.head, { font: 'sans', x: 0, y: Y0 + h * 0.66, h: Math.min(h * 0.16, (w * 0.8) / Math.max(1, o.head.length * 0.75)), maxW: w * 0.84, align: 'center', z: 0.002, mat: o.headMat || 'wz_paint', tint: o.headTint });
    else kit.face([[X0 + w * 0.1, Y0 + h * 0.7, 0.002], [X1 - w * 0.1, Y0 + h * 0.7, 0.002], [X1 - w * 0.1, Y0 + h * 0.86, 0.002], [X0 + w * 0.1, Y0 + h * 0.86, 0.002]], kit.pick(['sign_red', 'frame_dark', 'sign_blue']), {});
    for (let i = 0; i < 3; i++) kit.face([[X0 + w * 0.12, Y0 + h * (0.16 + i * 0.13), 0.002], [X0 + w * (0.58 + kit.rnd(0, 0.28)), Y0 + h * (0.16 + i * 0.13), 0.002], [X0 + w * (0.58 + kit.rnd(0, 0.28)), Y0 + h * (0.21 + i * 0.13), 0.002], [X0 + w * 0.12, Y0 + h * (0.21 + i * 0.13), 0.002]], 'frame_dark', { tint: '#6a6258' });
    if (o.peel) kit.face([[X1 - 0.22, Y1, 0], [X1, Y1 - 0.28, 0], [X1 - 0.05, Y1 - 0.05, 0.1]], 'sign_white', { tint: shadeHex(tint, 0.8) });
  });
}
/** Layered bill posters covering x0..x1 / y0..y1 of a wall plane z. */
function posterWall(kit, x0, x1, y0, y1, z, n, heads = ['MISSING', 'LOST', 'SALE', 'EVACUATE', null, null]) {
  for (let i = 0; i < n; i++) {
    const w = kit.rnd(0.45, 0.8), h = w * kit.rnd(1.2, 1.5);
    const x = kit.rnd(x0, Math.max(x0, x1 - w)), y = kit.rnd(y0, Math.max(y0, y1 - h));
    poster(kit, x, y, w, h, z + i * 0.0015, { head: kit.pick(heads), peel: kit.chance(0.3) });
  }
}
/** Big shop-window SALE poster (wall-local plane z): coloured sheet, SALE / % in big letters, a strap line. */
function salePoster(kit, x, y, w, h, z, k, rz = 0) {
  const K = [
    { bg: '#e9c433', big: 'SALE', bigMat: 'wz_paint_red', small: 'UP TO 70% OFF', smallMat: 'wz_paint' },
    { bg: '#c3352a', big: 'SALE', bigMat: 'wz_paint_white', small: 'EVERYTHING MUST GO', smallMat: 'wz_paint_white' },
    { bg: '#efe9d8', big: '50%', bigMat: 'wz_paint_red', small: 'OFF ALL STOCK', smallMat: 'wz_paint' },
    { bg: '#e9c433', big: '70%', bigMat: 'wz_paint_red', small: 'CLEARANCE', smallMat: 'wz_paint' },
    { bg: '#efe9d8', big: 'SALE', bigMat: 'wz_paint_red', cjk: '大特賣', smallMat: 'wz_paint' },
    { bg: '#c3352a', big: 'BIG', bigMat: 'wz_paint_yellow', small: 'SALE', smallMat: 'wz_paint_white', smallH: 0.22 },
  ][k % 6];
  kit.at({ x: x + w / 2, y: y + h / 2, z, rz }, () => {
    kit.face([[-w / 2, -h / 2, 0], [w / 2, -h / 2, 0], [w / 2, h / 2, 0], [-w / 2, h / 2, 0]], 'sign_white', { tint: K.bg, shade: kit.rnd(0.82, 1) });
    textLine(kit, K.big, { font: 'sans', h: Math.min(h * 0.3, w * 0.24), x: 0, y: h * 0.02, z: 0.002, align: 'center', mat: K.bigMat, maxW: w * 0.86, italic: k % 2 ? 0.12 : 0 });
    if (K.cjk) textLine(kit, K.cjk, { font: 'cjk', h: Math.min(h * 0.16, w * 0.2), x: 0, y: -h * 0.34, z: 0.002, align: 'center', mat: K.smallMat, maxW: w * 0.8 });
    else textLine(kit, K.small, { font: 'sans', h: Math.min(h * (K.smallH ?? 0.075), w * 0.12), x: 0, y: -h * 0.3, z: 0.002, align: 'center', mat: K.smallMat, maxW: w * 0.84 });
    flat(kit, rect2(-w / 2 + 0.04, h / 2 - 0.09, w / 2 - 0.04, h / 2 - 0.06), 0.002, 'frame_dark', { tint: shadeHex(K.bg, 0.55) });
  });
}
/** Roller shutter over x0..x1 / y0..y1 on plane z (wall-local) with bottom bar, housing and a padlock. */
function shutter(kit, x0, x1, y0, y1, z, tint) {
  kit.face([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], 'metal_shutter', { tint, uvOffset: [kit.rnd(0, 2), 0] });
  kit.box({ x: (x0 + x1) / 2, y: y0, z: z + 0.015, w: x1 - x0, h: 0.07, d: 0.05, mat: 'steel_dark', tint: '#55524c' });
  kit.box({ x: (x0 + x1) / 2, y: y1, z: z + 0.1, w: x1 - x0 + 0.12, h: 0.32, d: 0.22, mat: 'paint_metal', tint: shadeHex(tint, 0.75) });
  kit.box({ x: x0 + 0.3, y: y0 + 0.04, z: z + 0.04, w: 0.07, h: 0.09, d: 0.04, mat: 'steel', tint: '#b0a68a' });
}
/** Planks nailed across an opening (wall-local x0..x1, y0..y1) on plane z. */
function planks(kit, x0, x1, y0, y1, z, tint = '#d2bf9c') {
  const n = Math.max(2, Math.round((y1 - y0) / 0.42));
  for (let i = 0; i < n; i++) {
    const yy = y0 + ((y1 - y0) * (i + 0.5)) / n + kit.rnd(-0.06, 0.06);
    kit.at({ x: (x0 + x1) / 2, y: yy, z: z + 0.012 + i * 0.002, rz: kit.rnd(-0.1, 0.1) }, () =>
      kit.box({ x: kit.rnd(-0.05, 0.05), y: -0.09, z: 0, w: x1 - x0 + kit.rnd(0.15, 0.35), h: 0.18 + kit.rnd(-0.02, 0.03), d: 0.025, mat: 'wz_wood', tint: kit.pick([tint, shadeHex(tint, 0.85), shadeHex(tint, 1.1)]), uvOffset: [kit.rnd(0, 3), kit.rnd(0, 3)] }));
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
/** Horizontal band (string course, rustication joint) along a wall, interrupted by openings that cross it. */
function hBand(kit, L, ops, y, h, o) {
  const cuts = ops.filter((op) => op.y < y + h && op.y + op.h > y).map((op) => { const x0 = op.x ?? op.cx - op.w / 2; return [x0 - 0.06, x0 + op.w + 0.06]; }).sort((p, q) => p[0] - q[0]);
  let x = -0.02;
  for (const [c0, c1] of [...cuts, [L + 0.02, L + 0.02]]) {
    if (c0 - x > 0.05) kit.box({ x: (x + c0) / 2, y, z: (o.d ?? 0.04) / 2, w: c0 - x, h, d: o.d ?? 0.04, mat: o.mat, tint: o.tint, faces: { nz: false } });
    x = Math.max(x, c1);
  }
}
/** Window hood (wall-local) over opening op: 'key' (lintel + keystone) | 'pediment' | 'arch' (round head + tympanum). */
function hood(kit, op, kind, mat, tint) {
  const yT = op.y + op.h, x0 = op.cx - op.w / 2, x1 = op.cx + op.w / 2;
  if (kind === 'arch') {
    const r = op.w / 2 + 0.12, n = 9, ring = [];
    for (let i = 0; i <= n; i++) { const a = (i / n) * PI; ring.push([op.cx + Math.cos(a) * r, yT + Math.sin(a) * r * 0.8]); }
    flat(kit, [[x1, yT], ...ring.slice(1, -1).map(([x, y]) => [lerp(op.cx, x, op.w / 2 / r), lerp(yT, y, (op.w / 2) / r)]), [x0, yT]], 0.004, 'plaster', { tint: shadeHex(tint, 0.62) });
    kit.sweep(rectProf(0.14, 0.08, 0.04), ring.map(([x, y]) => [x, y, 0.0]), mat, { tint, closed: true, up: [0, 0, 1] });
    kit.box({ x: op.cx, y: yT + r * 0.8 - 0.2, z: 0.07, w: 0.2, h: 0.32, d: 0.1, mat, tint });
    return;
  }
  kit.box({ x: op.cx, y: yT, z: 0.035, w: op.w + 0.32, h: 0.16, d: 0.07, mat, tint, faces: { nz: false } });
  if (kind === 'key') kit.box({ x: op.cx, y: yT - 0.06, z: 0.06, w: 0.22, h: 0.34, d: 0.1, mat, tint, faces: { nz: false } });
  if (kind === 'pediment') {
    kit.box({ x: op.cx, y: yT + 0.16, z: 0.06, w: op.w + 0.46, h: 0.08, d: 0.12, mat, tint, faces: { nz: false } });
    flat(kit, [[x0 - 0.2, yT + 0.24], [x1 + 0.2, yT + 0.24], [op.cx, yT + 0.62]], 0.06, mat, { tint });
    kit.sweep(rectProf(0.07, 0.06, 0.03), [[x0 - 0.24, yT + 0.24, 0.06], [op.cx, yT + 0.66, 0.06], [x1 + 0.24, yT + 0.24, 0.06]], mat, { tint, up: [0, 0, 1] });
  }
}
/** Balustraded balconette under a window (wall-local). */
function balconette(kit, op, mat, tint) {
  const w = op.w + 0.5, y = op.y - 0.12;
  kit.box({ x: op.cx, y: y - 0.1, z: 0.24, w, h: 0.12, d: 0.48, mat, tint });
  for (const s of [-1, 1]) kit.box({ x: op.cx + s * (w / 2 - 0.12), y: y - 0.32, z: 0.12, w: 0.14, h: 0.22, d: 0.22, mat, tint });
  const n = Math.max(3, Math.round(w / 0.19));
  for (let i = 0; i < n; i++) kit.cyl({ x: op.cx - w / 2 + 0.1 + ((w - 0.2) * i) / (n - 1), y: y + 0.02, z: 0.42, r: 0.035, r2: 0.028, h: 0.5, seg: 6, mat, tint });
  kit.box({ x: op.cx, y: y + 0.52, z: 0.42, w, h: 0.08, d: 0.12, mat, tint });
}
/** Spray-painted search mark (X with a date above) on a wall plane (wall-local, centre cx, cy). */
function searchMark(kit, cx, cy, size, mat, date) {
  const t = size * 0.09;
  for (const sg of [-1, 1]) kit.at({ x: cx, y: cy, z: 0.03, rz: sg * PI / 4 }, () => kit.face([[-size * 0.7, -t / 2, 0], [size * 0.7, -t / 2, 0], [size * 0.7, t / 2, 0], [-size * 0.7, t / 2, 0]], mat));
  textLine(kit, date, { font: 'sans', h: size * 0.18, x: cx, y: cy + size * 0.55, z: 0.031, align: 'center', mat, italic: 0.1 });
  textLine(kit, '2', { font: 'sans', h: size * 0.16, x: cx + size * 0.42, y: cy - size * 0.08, z: 0.031, align: 'center', mat });
}
/** Peeling paint: red brick patches showing through the painted wall (wall-local area). */
function peel(kit, x0, x1, y0, y1, z, n) {
  for (let i = 0; i < n; i++) {
    const w = kit.rnd(0.4, 1.4), h = kit.rnd(0.3, 1.1), x = kit.rnd(x0, x1 - w), y = kit.rnd(y0, y1 - h);
    flat(kit, [[x, y], [x + w * 0.7, y + h * 0.05], [x + w, y + h * 0.4], [x + w * 0.85, y + h], [x + w * 0.25, y + h * 0.9], [x - w * 0.05, y + h * 0.45]], z, 'brick_red', { tint: '#ad9488' });
  }
}

// ---------------------------------------------------------------------------------------------------- buildings
/**
 * Block of the west zone. Footprint rect x0..x1 / z0..z1, storeys fl[], parapet. faces: [{ side: 'E'|'W'|'N'|'S',
 * span: [s0, s1] (world axis range), from: world y (party walls: only the part above the neighbour), ground(e) ->
 * openings, cols (local x), win, mod(f, k, op), floors [f0, f1], pipes, belts, pilasters, decor(e, ops, ctx) }].
 * Openings use world y (converted per wall). Local x along a face: E / N faces run from s1 to s0, W / S from s0 to s1
 * (e.lx(v) maps a world axis value).
 */
function block(kit, B) {
  const fl = B.floors, base = BY;
  const bases = fl.map((_, i) => base + fl.slice(0, i).reduce((s, v) => s + v, 0));
  const top = base + fl.reduce((s, v) => s + v, 0);
  const ctx = { bases, fl, top, base, n: fl.length };
  const poly = rect(B.x0, B.z0, B.x1, B.z1);
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
          ac: kit.chance(win.ac ?? 0.08), streak: kit.chance(win.streak ?? 0.45), roomTint: kit.pick(['#4a4540', '#3c3a36', '#56504a', '#46423c', '#5a544c']),
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
      // room: 0 -> the kit draws no fake room (its room box is wound inside-out: side / ceiling / floor faces point
      // away from the room, so one looks through them into the empty shell); fakeRoom() below draws them instead
      const mine = ops.filter((op) => op.y >= y0 - 0.01 && op.y < y1 - 0.01).map((op) => ({ ...op, y: op.y - y0, room: 0 }));
      kit.wall({ a: e.a, b: e.b, y0, h: y1 - y0, t: 0.35, mat, tint, openings: mine, bands: bases.filter((y) => y > y0 + 0.01 && y < y1 - 0.01).map((y) => y - y0), room: 0, collide: false, grime });
    };
    if (!f.skipGround && from <= base + 0.01) wallOf(base, g1, B.groundMat || B.mat, B.groundTint || B.tint, { y: base, h: 1.6, k: 0.4 });
    if (!f.skipUpper) wallOf(Math.max(from, g1), top, B.mat, B.tint, null);
    kit.at(edgeFrame(e.a, e.b), () => {
      const L = e.L;
      for (const op of ops) fakeRoom(kit, op, op.room ?? f.room ?? 1.1);
      if (B.belts !== false && f.belts !== false) for (const by of bases.slice(1)) if (by > from + 0.3) kit.box({ x: L / 2, y: by - 0.12, z: 0.035, w: L + 0.06, h: 0.2, d: 0.07, mat: B.trim || 'trim_stone', tint: B.trimTint, faces: { nz: false } });
      if (f.pilasters) for (const px of f.pilasters) { const y0 = Math.max(from, g1); kit.box({ x: px, y: y0, z: 0.05, w: f.pilW ?? 0.5, h: top - y0 - 0.5, d: 0.1, mat: B.trim || 'trim_stone', tint: B.trimTint, faces: { nz: false, bottom: false } }); }
      if (B.cornice) cornice(kit, L, top, B.cornice);
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
  kit.colPrism(poly, B.colFrom ?? base, top + B.parapet, kit.material(B.mat).surf);
  kit.solid(poly, base, top);
  B.extra?.(ctx);
  return ctx;
}
/**
 * Fake room behind a wall opening (wall-local frame, world y): back wall, two sides, ceiling, floor, all facing into
 * the room (same rules as the kit: windows / shop fronts unless shuttered, open doors, partly raised roller doors).
 */
function fakeRoom(kit, op, room) {
  const type = op.type || 'window', st = op.state || 'glass';
  let shade;
  if (type === 'window' || type === 'shop') { if (st === 'shutter') return; shade = st === 'dark' ? 0.6 : 0.85; }
  else if (type === 'door') { if (!(st === 'open' || op.walk)) return; shade = 0.7; }
  else if (type === 'garage') { if ((op.shutter ?? 1) >= 0.98) return; shade = 0.5; }
  else if (type === 'hole') shade = 0.7;
  else return;
  if (!(room > 0)) return;
  const x0 = op.x ?? op.cx - op.w / 2, x1 = x0 + op.w, y0 = op.y, y1 = op.y + op.h;
  const z0 = -Math.min(op.depth ?? (type === 'shop' ? 0.12 : 0.16), 0.33), zb = z0 - room;
  const ro = { shade, tint: op.roomTint || '#8a847a' };
  kit.face([[x0, y0, zb], [x1, y0, zb], [x1, y1, zb], [x0, y1, zb]], 'interior_hidden', ro);
  kit.face([[x0, y0, z0], [x0, y0, zb], [x0, y1, zb], [x0, y1, z0]], 'interior_hidden', ro);
  kit.face([[x1, y0, zb], [x1, y0, z0], [x1, y1, z0], [x1, y1, zb]], 'interior_hidden', ro);
  kit.face([[x0, y1, z0], [x0, y1, zb], [x1, y1, zb], [x1, y1, z0]], 'interior_ceiling', ro);
  kit.face([[x0, y0, zb], [x0, y0, z0], [x1, y0, z0], [x1, y0, zb]], 'interior_floor', ro);
  if (st === 'dark' && (type === 'window' || type === 'shop')) {   // blinds / curtain behind the glass
    const fw = type === 'shop' ? 0.08 : 0.06, gy0 = type === 'shop' ? y0 + 0.35 : y0 + fw, gy1 = y1 - fw, cov = kit.rnd(0.3, 1), zc = z0 - 0.11;
    kit.face([[x0 + fw, gy1 - (gy1 - gy0) * cov, zc], [x1 - fw, gy1 - (gy1 - gy0) * cov, zc], [x1 - fw, gy1, zc], [x0 + fw, gy1, zc]], 'interior_ceiling', { tint: kit.pick(['#6c6253', '#8c8574', '#4d5258', '#7a5b45', '#9a9384']) });
  }
}
/**
 * Black iron fire escape (wall-local frame, x = centre along the wall): landings at every upper floor, railings,
 * stairs between landings, a raised drop ladder. Only the first landing collides: the nav baker keeps <= 4 walkable
 * layers per cell, so a stack of solid landings would delete the sidewalk under them from the zombie nav grid (the
 * layout's NAV_RULES: fire escapes are never baked); bullets still hit the landing players can see up close.
 */
function fireEscape(kit, f) {
  const { x, floors, bases } = f;
  const W = f.width ?? 3.8, D = 1.25, mat = 'steel_dark', tint = '#4f4a46';
  for (let k = 1; k < floors; k++) {
    const y = bases[k] - 0.05;
    kit.box({ x, y, z: D / 2 + 0.02, w: W, h: 0.06, d: D, mat: 'grate', tint: '#6a6560', faces: { bottom: false } });
    kit.box({ x, y: y - 0.04, z: D / 2 + 0.02, w: W, h: 0.04, d: 0.05, mat, tint });
    kit.box({ x, y: y - 0.04, z: D, w: W, h: 0.06, d: 0.05, mat, tint });
    if (k === 1) kit.colBox({ x, y, z: D / 2 + 0.02, w: W, h: 0.06, d: D }, 'grate');
    const rh = 1.0, posts = Math.max(2, Math.round(W / 1.2) + 1);
    for (let i = 0; i < posts; i++) kit.box({ x: x - W / 2 + (W * i) / (posts - 1), y: y + 0.06, z: D - 0.02, w: 0.04, h: rh, d: 0.04, mat, tint });
    for (const ry of [rh, rh * 0.5]) {
      kit.box({ x, y: y + 0.06 + ry - 0.03, z: D - 0.02, w: W, h: 0.035, d: 0.035, mat, tint });
      for (const s of [-1, 1]) kit.box({ x: x + (s * W) / 2, y: y + 0.06 + ry - 0.03, z: D / 2, w: 0.035, h: 0.035, d: D, mat, tint });
    }
    for (let i = 0; i < Math.round(W / 0.24); i++) kit.box({ x: x - W / 2 + 0.12 + i * 0.24, y: y + 0.08, z: D - 0.02, w: 0.014, h: rh * 0.47, d: 0.014, mat, tint });
    for (const s of [-1, 1]) kit.at({ x: x + s * (W / 2 - 0.1), y: y - 0.02, z: 0.02 }, () => kit.sweep([[-0.02, -0.02], [0.02, -0.02], [0.02, 0.02], [-0.02, 0.02]], [[0, 0, 0], [0, 0, D - 0.05], [0, -0.7, 0.02]], mat, { tint }));
    if (k < floors - 1) {
      const y2 = bases[k + 1] - 0.05, run = W - 0.9, fh = y2 - y;
      const steps = Math.round(fh / 0.2), sx0 = x - W / 2 + 0.3, sw = 0.6, zc = D * 0.5;
      for (let st = 0; st < steps; st++) kit.box({ x: sx0 + 0.1 + (st * run) / steps, y: y + 0.06 + ((st + 1) * (y2 - y)) / (steps + 1) - 0.03, z: zc, w: run / steps + 0.05, h: 0.03, d: sw, mat: 'grate', tint: '#5d5853' });
      for (const dz of [-sw / 2, sw / 2]) kit.sweep([[-0.015, -0.08], [0.015, -0.08], [0.015, 0.02], [-0.015, 0.02]], [[sx0, y + 0.06, zc + dz], [sx0 + run + 0.2, y2 + 0.06, zc + dz]], mat, { tint });
      kit.sweep(circle(0.016, 5), [[sx0, y + 1.0, zc + sw / 2 + 0.05], [sx0 + run + 0.2, y2 + 1.0, zc + sw / 2 + 0.05]], mat, { tint, smooth: true });
    }
  }
  const y1 = bases[1] - 0.05, lx = x + W / 2 - 0.45;
  for (const s of [-0.22, 0.22]) kit.box({ x: lx + s, y: y1 - 2.4, z: D - 0.15, w: 0.04, h: 2.4, d: 0.04, mat, tint });
  for (let r = 0; r < 7; r++) kit.box({ x: lx, y: y1 - 2.3 + r * 0.32, z: D - 0.15, w: 0.44, h: 0.025, d: 0.025, mat, tint });
}
/**
 * Plain block-interior mass: tar roof with a parapet, collision, and only the wall strips that are exposed
 * (o.show: [{ side: 'N'|'S'|'E'|'W', at, span: [s0, s1], from }]); faces flush with a neighbour are never emitted.
 */
function mass(kit, poly, top, o = {}) {
  const P = ensureCCW(poly), mat = o.mat || 'brick_dark', par = o.parapet ?? 0.8;
  for (const w of o.show || []) {
    const [s0, s1] = w.span, y0 = w.from ?? BY, y1 = top, a = w.at;
    const Q = w.side === 'N' ? [[s1, y0, a], [s0, y0, a], [s0, y1, a], [s1, y1, a]]
      : w.side === 'S' ? [[s0, y0, a], [s1, y0, a], [s1, y1, a], [s0, y1, a]]
        : w.side === 'E' ? [[a, y0, s1], [a, y0, s0], [a, y1, s0], [a, y1, s1]]
          : [[a, y0, s0], [a, y0, s1], [a, y1, s1], [a, y1, s0]];
    kit.face(Q, mat, { tint: o.tint });
  }
  kit._flatRoof(P, top, { type: 'flat', parapet: par, mat: 'roof_tar', coping: 'trim_concrete', clutter: o.clutter ?? true }, { mat, tint: o.tint });
  kit.colPrism(P, BY, top + par, kit.material(mat).surf);
  kit.solid(P, BY, top);
}
/** Wooden roof water tank on a steel stand (the downtown silhouette). */
function waterTank(kit, at, y, r = 1.5, h = 3.0) {
  kit.at({ x: at[0], y, z: at[1] }, () => {
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) kit.beam([sx * r * 0.7, 0, sz * r * 0.7], [sx * r * 0.62, 2.4, sz * r * 0.62], { kind: 'I', h: 0.16, w: 0.12, tint: '#4a4540', up: [1, 0, 0] });
    for (const yy of [0.9, 1.8]) kit.sweep(rectProf(0.04, 0.06), [...[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([sx, sz]) => [sx * r * 0.66, yy, sz * r * 0.66])], 'steel_dark', { tint: '#4a4540' });
    kit.box({ x: 0, y: 2.4, z: 0, w: r * 1.6, h: 0.12, d: r * 1.6, mat: 'steel_dark', tint: '#55504a' });
    kit.cyl({ x: 0, y: 2.52, z: 0, r, h, seg: 16, mat: 'wz_wood', tint: '#a08a72', top: false });
    kit.cyl({ x: 0, y: 2.52 + h, z: 0, r: r + 0.08, r2: 0.12, h: 0.9, seg: 16, mat: 'wz_wood', tint: '#8a7764' });
    for (let i = 0; i < 3; i++) { const ring = circle(r + 0.02, 18).map(([x, z]) => [x, 2.8 + i * 0.95, z]); kit.sweep(rectProf(0.025, 0.05), [...ring, ring[0]], 'steel_dark', { tint: '#3c3834' }); }
    kit.colBox({ x: 0, y: 0, z: 0, w: r * 1.6, h: 2.52 + h + 0.9, d: r * 1.6 }, 'wood');
  });
}

// ---------------------------------------------------------------------------------------------------- zone entry
export function build(kit, L) {
  street(kit, L);
  northBlocks(kit, L);
  southBlocks(kit, L);
  rowBlocks(kit, L);
  fills(kit);
  crossBarricades(kit, L);
  // NAV_RULES: barricade crates / rubble / fences are CLIMB (climbers scale them; the street cells either side carry the bit)
  kit.nav('climb', rect(-71.7, -9, -68.0, 9), { y0: -0.5, y1: 3.2 });
  kit.nav('climb', rect(-66, -27.0, -54, -25.4), { y0: -0.5, y1: 2.8 });
  kit.nav('climb', rect(-66, 29.2, -54, 31.8), { y0: -0.5, y1: 2.8 });
  ledGantry(kit, L);
  heroTruck(kit, L);
  props(kit, L);
  wires(kit);
  canyonFill(kit);
  return {};
}

/**
 * Baked bounce fill (never realtime): the one-bounce bake misses the light thrown back and forth between the facades
 * of the street canyons, so the shaded faces and street level sink into the tone curve's toe. Soft, warm-grey, linear
 * falloff lights at mid height stand in for it (same idea as the other zones and the kit's interior fills).
 */
function canyonFill(kit) {
  for (const x of [-31, -40, -49]) kit.light({ pos: [x, 8.0, 0], color: '#d8cfbe', intensity: 6.5, decay: 1, range: 20, radius: 2.0, name: 'fill' });
  for (const [x, z] of [[-28.5, 3.6], [-36.5, -3.6], [-44.5, 3.6], [-52.0, -3.6]]) kit.light({ pos: [x, 3.6, z], color: '#d6cec0', intensity: 4.0, decay: 1, range: 13, radius: 1.0, name: 'fill' });
  for (const z of [-21, -11, 13, 23]) kit.light({ pos: [-60, 6.5, z], color: '#d2ccc0', intensity: 10, decay: 1, range: 17, radius: 1.6, name: 'fill' });
  for (const z of [-17, 18]) kit.light({ pos: [z < 0 ? -61.8 : -58.2, 3.2, z], color: '#d2ccc0', intensity: 3.5, decay: 1, range: 11, radius: 0.8, name: 'fill' });
  kit.light({ pos: [-60, 6.5, 0], color: '#d6cfc2', intensity: 5.0, decay: 1, range: 15, radius: 1.6, name: 'fill' });
  kit.light({ pos: [-60.5, 3.2, 26.4], color: '#d2ccc0', intensity: 6.0, decay: 1, range: 10, radius: 0.8, name: 'fill' });
  kit.light({ pos: [-59.5, 3.4, -22.8], color: '#d2ccc0', intensity: 5.0, decay: 1, range: 10, radius: 0.8, name: 'fill' });
  kit.light({ pos: [-63.0, 4.2, 0], color: '#d4ccbe', intensity: 8.0, decay: 1, range: 14, radius: 1.2, name: 'fill' });
  kit.light({ pos: [-60, 4.5, -29.5], color: '#c9c8c2', intensity: 5.0, decay: 1, range: 11, radius: 1.0, name: 'fill' });
  kit.light({ pos: [-60, 4.5, 33.5], color: '#c9c8c2', intensity: 5.0, decay: 1, range: 11, radius: 1.0, name: 'fill' });
}

// ==================================================================================================== street
// Curb returns at the T (radius 2): NE / SE inside corners on the cross street's east curb x -56.5, NW / SW on x -63.5.
const RR = 2.0;
const RET = {
  NE: arcPts([-56.5 + RR, -5.5 - RR], RR, PI / 2, PI),        // (-54.5, -5.5) -> (-56.5, -7.5)
  SE: arcPts([-56.5 + RR, 5.5 + RR], RR, 1.5 * PI, PI),       // (-54.5, 5.5) -> (-56.5, 7.5)
  NW: arcPts([-63.5 - RR, -5.5 - RR], RR, 0, PI / 2),         // (-63.5, -7.5) -> (-65.5, -5.5)
  SW: arcPts([-63.5 - RR, 5.5 + RR], RR, 2 * PI, 1.5 * PI),   // (-63.5, 7.5) -> (-65.5, 5.5)
};
function street(kit, L) {
  // ---- carriageway: West Street (x -54..-26) + the T + the stub to the pocket wall (x -76) + the cross street
  const road = [[-26, -5.5], ...RET.NE, [-56.5, -34], [-63.5, -34], ...RET.NW, [-76, -5.5], [-76, 5.5], ...RET.SW.slice().reverse(), [-63.5, 38], [-56.5, 38], ...RET.SE.slice().reverse(), [-26, 5.5]];
  kit.ground(road, { mat: 'asphalt_cracked' });
  // repaved strips in the smoother asphalt (6 mm proud): the south lane strip continues the centre zone's repair
  const over = (poly) => kit.ground(poly, { mat: 'asphalt', y: 0.006, collide: false, tint: '#d2d2d2' });
  over([[-26, 0.2], [-26, 5.5], [-33.4, 5.5], [-32.6, 0.35]]);
  over([[-63.2, -24.5], [-56.8, -24.8], [-56.8, -17.6], [-63.2, -17.2]]);
  over([[-52.2, -5.5], [-46.6, -5.5], [-46.1, -0.4], [-51.8, -0.1]]);
  // utility trenches and pothole repairs (dark asphalt)
  kit.patch([[-37.8, -5.5], [-37.0, -5.5], [-36.6, 5.5], [-37.4, 5.5]]);
  kit.patch([[-63.5, 15.6], [-56.5, 15.2], [-56.5, 16.1], [-63.5, 16.5]]);
  kit.patch([[-44.8, 1.4], [-42.6, 1.1], [-42.3, 3.3], [-44.5, 3.6]]);
  kit.patch([[-61.9, -12.6], [-59.7, -12.9], [-59.5, -10.8], [-61.6, -10.5]]);
  kit.patch([[-29.9, -3.9], [-27.6, -4.2], [-27.4, -2.1], [-29.6, -1.9]]);
  kit.patch([[-58.3, 25.2], [-57.0, 25.0], [-56.9, 27.4], [-58.1, 27.6]]);

  // ---- sidewalks: four L-shaped slabs around the T (0.3 m granite curb on the road side only)
  sidewalk(kit, [[-26, -5.5], ...RET.NE, [-56.5, -34]], [[-54, -34], [-54, -9], [-26, -9]]);
  sidewalk(kit, [[-26, 5.5], ...RET.SE, [-56.5, 38]], [[-54, 38], [-54, 9], [-26, 9]]);
  sidewalk(kit, [[-63.5, -34], ...RET.NW, [-76, -5.5]], [[-76, -9], [-66, -9], [-66, -34]]);
  sidewalk(kit, [[-63.5, 38], ...RET.SW, [-76, 5.5]], [[-76, 9], [-66, 9], [-66, 38]]);

  // ---- markings: centre dashes at world [9k, 9k + 3]; yellow edge lines 0.4 m off the curbs; crosswalks at the T
  for (const [c0, c1] of [[-45, -42], [-36, -33], [-27, -26]]) kit.markLine([[c0, 0], [c1, 0]], { width: 0.12 });
  for (const [c0, c1] of [[-34, -33], [-27, -24], [-18, -15], [9, 12], [18, 21], [27, 30], [36, 38]]) kit.markLine([[-60, c0], [-60, c1]], { width: 0.12 });
  const yl = (a, b) => kit.markLine([a, b], { width: 0.12, mat: 'paint_yellow' });
  yl([-26, -5.1], [-49.8, -5.1]); yl([-26, 5.1], [-53.4, 5.1]);
  yl([-56.9, -34], [-56.9, -11.8]); yl([-63.1, -34], [-63.1, -11.8]);
  yl([-56.9, 7.6], [-56.9, 38]); yl([-63.1, 7.6], [-63.1, 38]);
  yl([-65.6, -5.1], [-68.4, -5.1]); yl([-65.6, 5.1], [-68.4, 5.1]);
  kit.crosswalk({ at: [-51.75, 0], dir: 0, across: 11, length: 3.5, stripe: 0.5, gap: 0.5 });
  kit.crosswalk({ at: [-60, -9.75], dir: PI / 2, across: 7, length: 3.5, stripe: 0.5, gap: 0.5 });
  kit.markLine([[-49.6, -5.1], [-49.6, -0.15]], { width: 0.45 });               // stop line, westbound lane
  kit.markLine([[-63.1, -12.0], [-60.15, -12.0]], { width: 0.45 });             // stop line, southbound lane
  kit.markLine([[-59.85, 7.4], [-56.9, 7.4]], { width: 0.45 });                 // stop line, northbound lane
  // a faded ONLY / arrow painted in the westbound lane before the T
  kit.at({ x: -46.2, y: 0.004, z: -2.6, rot: PI / 2 }, () => {
    kit.upFace([[-0.12, 0, 0], [0.12, 0, 0], [0.12, 0, -2.2], [-0.12, 0, -2.2]], 'paint_white', null, {});
    kit.upFace([[-0.45, 0, -2.2], [0.45, 0, -2.2], [0, 0, -3.1]], 'paint_white', null, {});
  });

  // ---- hardware: MH_W opens for SP_W_MH (cover shoved aside), plain covers, storm drains at the curbs
  for (const m of L.MANHOLES.filter((mm) => mm.x < -26 && mm.x > -84 && Math.abs(mm.z) < 40)) {
    if (m.spawner) {
      kit.manhole([m.x, m.z], { r: 0.43, tint: '#4c4945', y: 0.001 });
      kit.manhole([m.x, m.z], { r: 0.34, tint: '#0d0c0b', y: 0.003 });
      manholeCover(kit, [m.x - 0.42, m.z + 0.25], 0.34, 0.035);
      kit.decal({ at: [m.x, m.z], size: [1.8, 1.4], rot: 0.4, mat: 'decal_stain' });
    } else manholeCover(kit, [m.x, m.z], 0.34);
  }
  manholeCover(kit, [-61.3, -20.4], 0.32);
  manholeCover(kit, [-58.8, 22.6], 0.32);
  manholeCover(kit, [-31.5, -2.3], 0.3);
  for (const x of [-30.5, -41.5, -52.8]) kit.drain([x, -5.27], 0);
  for (const x of [-34.5, -45.5]) kit.drain([x, 5.27], 0);
  for (const z of [-30.5, -18.5]) { kit.drain([-56.77, z], PI / 2); kit.drain([-63.23, z + 4], PI / 2); }
  for (const z of [17.5, 29.0]) { kit.drain([-56.77, z], PI / 2); kit.drain([-63.23, z - 4], PI / 2); }
  for (const [x, z] of [[-38.6, -7.6], [-61.0 - 4.6, 21.6], [-55.3, -16.8], [-44.2, 7.4]]) kit.box({ x, y: SW, z, w: 0.6, h: 0.008, d: 0.9, mat: 'steel_dark', tint: '#6a655e' });

  // ---- grime: stains, cracks, oil, puddles in the gutters
  const avoidSup = [[-36, 1.4, 1.3], [-60, 4.0, 1.3], [-40, 2, 1.0]];
  kit.scatterDecals(rect(-54, -5.3, -27.6, 5.3), { count: 22, avoid: avoidSup });
  kit.scatterDecals(rect(-63.3, -33.5, -56.7, 37.5), { count: 26, avoid: avoidSup });
  kit.scatterDecals(rect(-76, -5.3, -63.5, 5.3), { count: 8, avoid: avoidSup });
  for (const [x, z, r, s] of [[-29.4, -4.7, 0.1, [2.6, 1.0]], [-39.2, 4.75, 0.05, [3.2, 1.1]], [-47.8, -4.8, -0.08, [2.4, 0.9]], [-57.2, -21.0, PI / 2, [2.6, 1.0]], [-62.8, 12.5, PI / 2, [3.0, 1.1]], [-57.3, 26.4, PI / 2 + 0.1, [2.2, 0.9]], [-67.2, -3.6, 0.6, [1.8, 1.2]], [-42.5, -1.2, 0.9, [1.4, 0.9]], [-61.4, -2.0, 2.2, [1.6, 1.0]]]) kit.decal({ at: [x, z], size: s, rot: r, mat: 'decal_puddle' });
  const swDecals = { decal_stain: 2, decal_dirt: 3, decal_cracks: 1 };
  kit.scatterDecals(rect(-54, -8.9, -27.0, -5.8), { count: 10, y: SW, mats: swDecals, size: [0.6, 1.6] });
  kit.scatterDecals(rect(-54, 5.8, -27.0, 8.9), { count: 10, y: SW, mats: swDecals, size: [0.6, 1.6] });
  kit.scatterDecals(rect(-56.2, -33.8, -54.1, -9), { count: 8, y: SW, mats: swDecals, size: [0.6, 1.4] });
  kit.scatterDecals(rect(-56.2, 9, -54.1, 37.8), { count: 8, y: SW, mats: swDecals, size: [0.6, 1.4] });
  kit.scatterDecals(rect(-65.9, -33.8, -63.8, -9), { count: 8, y: SW, mats: swDecals, size: [0.6, 1.4] });
  kit.scatterDecals(rect(-65.9, 9, -63.8, 37.8), { count: 8, y: SW, mats: swDecals, size: [0.6, 1.4] });
  // litter along the gutters
  kit.debris([-50.6, -5.0], { r: 1.0, count: 6, kinds: ['paper', 'paper', 'brick'] });
  kit.debris([-33.0, 5.0], { r: 1.0, count: 6, kinds: ['paper', 'paper', 'plank'] });
  kit.debris([-56.9, -14.0], { r: 1.0, count: 6, kinds: ['paper', 'brick', 'brick'] });
  kit.debris([-63.0, 20.4], { r: 1.1, count: 7, kinds: ['paper', 'paper', 'brick'] });
  kit.debris([-41.6, 0.4], { r: 2.2, count: 9, kinds: ['paper', 'paper', 'paper', 'plank'] });
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
  // collision: walkable top + the curb faces only (a closed prism's bottom face would become the nav layer)
  kit.colPoly(ccw.map((p) => [p[0], SW, p[1]]), 'concrete');
  for (const i of edges) { const a = ccw[i], b = ccw[(i + 1) % ccw.length]; kit.colQuad([a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], SW, b[1]], [a[0], SW, a[1]], 'concrete'); }
}
/** Cast-iron manhole cover: rim + disc + cast cross (decal-thin). */
function manholeCover(kit, at, r, lift = 0) {
  kit.manhole(at, { r: r + 0.07, tint: '#55524e', y: 0.001 + lift });
  kit.manhole(at, { r, tint: '#7a7470', y: 0.004 + lift });
  kit.at({ x: at[0], y: 0.0085 + lift, z: at[1], rot: 0.6 }, () => {
    for (const a of [0, PI / 2]) kit.at({ rot: a }, () => kit.upFace([[-r * 0.85, 0, -0.025], [r * 0.85, 0, -0.025], [r * 0.85, 0, 0.025], [-r * 0.85, 0, 0.025]], 'steel_dark', null, { tint: '#4a4744' }));
  });
}

// ==================================================================================================== north side
function northBlocks(kit, L) {
  // ---------------- W_N1 pharmacy flats (brick_commercial, 6F): green shopfront, fire escape (SP_W_ROOF), cross blade
  const BRICK = '#dcc3b2', STONE = '#d6cbb8', GREEN = '#3d5f47';
  const FE = { x: 7.0, w: 4.6 };   // fire escape centre (local x = world x + 40 -> world -33) and width
  block(kit, {
    id: 'W_N1', x0: -40, x1: -26, z0: -24, z1: -9, floors: [4.5, 3.4, 3.4, 3.4, 3.4, 3.4], parapet: 0.9,
    mat: 'brick_red', tint: BRICK, trim: 'trim_stone', trimTint: STONE, cornice: { kind: 'metal', mat: 'trim_metal', tint: '#3e4a40', bracket: 1.1 },
    win: { w: 1.2, h: 1.9, sill: 0.9, lintel: 'trim_stone', ac: 0.12 },
    faces: [
      {
        side: 'S', cols: [1.6, 5.4, 8.6, 12.4], pipes: [13.8], lit: [[4, 0]],
        mod: (f, k, op) => {
          if (k === 1 || k === 2) { op.ac = false; op.streak = false; }        // behind the fire escape
          if (f === 2 && k === 2) { op.state = 'broken'; op.open = true; }     // the window the zombies climb out of
          if (f === 1) op.state = wpick(kit, WIN_STATES_POOR);
          return op;
        },
        ground: () => [
          { x: 0.9, w: 3.3, y: BY + 0.02, h: 3.0, type: 'shop', state: 'shutter', frame: 'sign_green', kick: 'sign_green', shutterTint: '#9aa09a' },
          { x: 4.45, w: 1.15, y: BY + 0.02, h: 2.6, type: 'door', state: 'closed', door: 'paint_metal', doorTint: GREEN, window: true, frame: 'sign_green', step: false },
          { x: 5.85, w: 3.3, y: BY + 0.02, h: 3.0, type: 'shop', state: 'broken', frame: 'sign_green', kick: 'sign_green', room: 2.2 },
          { x: 10.25, w: 1.1, y: BY + 0.02, h: 2.5, type: 'door', state: 'closed', door: 'wz_wood', doorTint: '#6e5038', window: true, step: false },
          { x: 11.9, w: 1.5, y: BY + 1.0, h: 1.9, type: 'window', state: 'boarded', frame: 'frame_dark' },
        ],
        decor: (e, ops) => {
          // shutter: posters + a spray tag; the broken window shows emptied shelves
          posterWall(kit, 1.0, 4.1, 0.7, 2.7, 0.02, 6, ['MISSING', 'NO MEDS', 'EVACUATE', null, null]);
          textLine(kit, 'NO DRUGS HERE', { font: 'sans', h: 0.2, x: 2.55, y: 1.35, z: 0.035, align: 'center', mat: 'wz_paint_red', italic: 0.15, maxW: 2.8 });
          for (const [x, h] of [[6.4, 1.9], [8.3, 1.9]]) kit.box({ x, y: BY + 0.02, z: -1.85, w: 1.6, h, d: 0.45, mat: 'wz_wood', tint: '#6d5a48' });
          for (let i = 0; i < 9; i++) kit.box({ x: kit.rnd(5.8, 9.0), y: BY + 0.02 + kit.pick([0.0, 0.62, 1.24]), z: kit.rnd(-1.75, -1.55), w: kit.rnd(0.12, 0.3), h: kit.rnd(0.1, 0.25), d: 0.15, mat: 'sign_white', tint: kit.pick(['#d8d2c4', '#7fa3b8', '#c96a4a', '#e2d6b8']) });
          for (let i = 0; i < 16; i++) { const x = kit.rnd(6.0, 9.0), z = kit.rnd(0.2, 1.6), s = kit.rnd(0.05, 0.16); kit.upFace([[x, SW + 0.004, z], [x + s, SW + 0.004, z + kit.rnd(-0.05, 0.05)], [x + s * 0.4, SW + 0.004, z + s]], 'glass_dirty', null, {}); }
          // fascia PHARMACY · 藥局 (green board, cream letters)
          const zf = board(kit, 0.7, 9.4, 3.38, 0.86, { mat: 'sign_white', tint: '#3f6f4d', border: { mat: 'sign_white', tint: '#e6e2d4', w: 0.035 } });
          textMixed(kit, [['PHARMACY', { font: 'serif', h: 0.42 }], ['藥局', { font: 'cjk', h: 0.5 }]], { x: 5.05, y: 3.58, z: zf, mat: 'wz_paint_white', gap: 0.38, maxW: 8.0 });
          // black iron fire escape 2F-6F, drop ladder let down to the sidewalk (SP_W_ROOF climbs down here)
          fireEscape(kit, { x: FE.x, floors: 6, groundH: 4.5, floorH: 3.4, bases: [0, 4.5, 7.9, 11.3, 14.7, 18.1].map((v) => v + BY), width: FE.w });
          const lx = FE.x + FE.w / 2 - 0.45;
          for (const s of [-0.22, 0.22]) kit.box({ x: lx + s, y: SW, z: 1.1, w: 0.04, h: 2.05, d: 0.04, mat: 'steel_dark', tint: '#5d5853' });
          for (let r = 0; r < 6; r++) kit.box({ x: lx, y: SW + 0.3 + r * 0.32, z: 1.1, w: 0.44, h: 0.025, d: 0.025, mat: 'steel_dark', tint: '#5d5853' });
          // the open window on the 3F landing: sash pushed up, curtain hanging out over the landing
          const sp = ops.find((op) => op.open);
          if (sp) kit.face([[sp.cx - 0.45, sp.y + 1.7, -0.05], [sp.cx + 0.1, sp.y + 1.7, -0.05], [sp.cx + 0.2, sp.y + 0.3, 0.6], [sp.cx - 0.35, sp.y + 0.1, 0.5]], 'wz_fabric', { tint: '#a39780' });
          // dead green-cross blade over the apartment door (projects 1.2 m, dead neon tubes)
          pharmacyBlade(kit, 9.95);
          kit.wallLamp({ x: 10.8, y: BY + 2.9, on: false });
          textLine(kit, '412', { font: 'serif', h: 0.14, x: 10.8, y: BY + 2.58, z: 0.02, align: 'center', mat: 'wz_paint_white' });
          posterWall(kit, 11.9, 13.4, 1.1, 2.9, 0.06, 3, ['LOST', 'KEEP OUT', null]);
          streaks(kit, 0.2, 13.8, 21.5, 9, 0.004, [1.2, 3.0]);
        },
      },
      { side: 'W', from: BY + 18.1, cols: [3.0, 7.5, 12.0], win: { w: 1.1, h: 1.7, states: WIN_STATES_POOR }, belts: false, plinth: false },
    ],
    extra: (ctx) => {
      waterTank(kit, [-36.2, -18.8], ctx.top + 0.02, 1.4, 2.8);
      for (const [x, z, h] of [[-29.0, -21.5, 4.2], [-31.5, -12.5, 2.8]]) {
        kit.cyl({ x, y: ctx.top, z, r: 0.03, h, seg: 5, mat: 'steel', tint: '#7e7f7c' });
        for (let i = 1; i < 4; i++) kit.box({ x, y: ctx.top + h * (0.55 + i * 0.12), z, w: 1.1 - i * 0.22, h: 0.02, d: 0.02, mat: 'steel_dark' });
      }
    },
  });

  // ---------------- W_N2 corner hardware (painted_brick pale green, 5F): HARDWARE 五金, striped awning, ghost sign (W)
  const PAINT = '#86a3c2';
  block(kit, {
    id: 'W_N2', x0: -54, x1: -40, z0: -34, z1: -9, floors: [4.5, 3.4, 3.4, 3.4, 3.4], parapet: 0.8,
    mat: 'brick_painted', tint: PAINT, trim: 'trim_concrete', trimTint: '#c7c5b4', cornice: { kind: 'simple', mat: 'trim_concrete', tint: '#b2b09f' },
    win: { w: 1.2, h: 1.7, sill: 0.9, lintel: 'trim_concrete', ac: 0.08 }, belts: false, plinthMat: 'concrete_dirty', plinthTint: '#6a6a60',
    faces: [
      {
        side: 'S', cols: [2.0, 5.5, 8.5, 12.0], pipes: [0.25], lit: [[2, 3]],
        ground: () => [
          { x: 0.8, w: 3.5, y: BY + 0.02, h: 3.2, type: 'garage', shutter: 1, shutterTint: '#8f948c' },
          { x: 4.8, w: 3.6, y: BY + 0.02, h: 3.0, type: 'shop', state: 'dark', frame: 'sign_red', kick: 'sign_red', mullions: [3, 1], room: 1.6 },
          { x: 8.8, w: 1.15, y: BY + 0.02, h: 2.6, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#7a2a22', window: true, frame: 'sign_red', step: false },
          { x: 10.4, w: 3.0, y: BY + 0.02, h: 3.2, type: 'garage', shutter: 0.86, shutterTint: '#9a9a90' },
        ],
        decor: (e, ops) => {
          posterWall(kit, 0.9, 4.2, 0.5, 2.8, 0.02, 7, ['CLOSED', 'MISSING', 'QUARANTINE', null, null]);
          posterWall(kit, 10.5, 13.3, 1.0, 2.9, 0.02, 4, ['LOST', 'EVACUATE', null]);
          searchMark(kit, 2.6, 1.9, 0.75, 'wz_paint_red', '9-28');
          // window display: hanging tools, paint tins and a hand-painted price card behind the glass
          const sh = ops.find((o) => o.type === 'shop');
          for (let i = 0; i < 6; i++) kit.cyl({ x: sh.cx - 1.4 + i * 0.56, y: BY + 0.42, z: -0.55, r: 0.11, h: 0.22, seg: 8, mat: 'paint_metal', tint: kit.pick(['#b03a2a', '#d8c25a', '#3a6a9a', '#e6e2d8']) });
          kit.box({ x: sh.cx, y: BY + 0.4, z: -0.55, w: 3.3, h: 0.02, d: 0.5, mat: 'wz_wood', tint: '#6a5038' });
          for (let i = 0; i < 7; i++) kit.box({ x: sh.cx - 1.5 + i * 0.5, y: BY + 1.6 + kit.rnd(-0.1, 0.2), z: -0.6, w: 0.05, h: kit.rnd(0.35, 0.6), d: 0.05, mat: 'steel', tint: '#8a8a86' });
          // fascia HARDWARE 五金 (red board, cream letters) + strap line, red/white striped awning over the shop
          const zf = board(kit, 0.5, 13.5, 3.42, 0.9, { mat: 'sign_white', tint: '#b8473a', border: { mat: 'sign_white', tint: '#e8e2d2', w: 0.035 } });
          textMixed(kit, [['HARDWARE', { font: 'slab', h: 0.44 }], ['五金', { font: 'cjk', h: 0.52 }]], { x: 7.0, y: 3.66, z: zf, mat: 'wz_paint_white', gap: 0.45, maxW: 8.0 });
          textLine(kit, 'PAINT · TOOLS · KEYS CUT', { font: 'sans', h: 0.1, x: 7.0, y: 3.5, z: zf, align: 'center', mat: 'wz_paint_white', maxW: 6 });
          stripedAwning(kit, { x0: 4.6, x1: 10.15, y: 3.4, depth: 1.5, colors: ['#a32a21', '#e8e2d4'], torn: [5, 6], hang: [6] });
          kit.wallLamp({ x: 9.4, y: BY + 2.95, on: false });
          streaks(kit, 0.2, 13.8, 18.2, 7, 0.004, [1.2, 2.8]);
          peel(kit, 0.4, 13.6, 4.8, 17.6, 0.006, 6);
        },
      },
      {
        side: 'W', cols: [2.5, 6.0, 19.0, 22.5], pipes: [24.75],
        ground: () => [
          { x: 1.5, w: 1.1, y: BY + 0.02, h: 2.2, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#5f645c', step: false },
          { x: 4.0, w: 1.5, y: BY + 1.0, h: 1.6, type: 'window', state: 'boarded', frame: 'frame_dark' },
          { x: 10.2, w: 5.6, y: BY + 0.02, h: 3.4, type: 'garage', shutter: 1, shutterTint: '#8a8f86' },
          { x: 16.2, w: 5.6, y: BY + 0.02, h: 3.4, type: 'garage', shutter: 1, shutterTint: '#949890' },
          { x: 23.0, w: 1.1, y: BY + 0.02, h: 2.3, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#6a5a4a', step: false },
        ],
        decor: (e) => {
          posterWall(kit, 10.4, 15.6, 0.6, 3.0, 0.02, 7, ['QUARANTINE', 'MISSING', 'NO ENTRY', null]);
          posterWall(kit, 16.4, 21.6, 0.8, 2.8, 0.02, 5, ['LOST', 'SALE', null]);
          searchMark(kit, 13.0, 2.0, 0.9, 'wz_paint_red', '9-30');
          const zf = board(kit, 10.6, 21.4, 3.62, 0.62, { mat: 'sign_white', tint: '#d5cdb6', d: 0.06 });
          textLine(kit, 'DELIVERIES · REAR OF STORE', { font: 'serif', h: 0.24, x: 16.0, y: 3.8, z: zf, align: 'center', mat: 'wz_paint', maxW: 10, shade: 0.75 });
          ghostSign(kit, 8.0, 17.5, 8.4, 17.4);
          streaks(kit, 0.2, 24.8, 18.2, 9, 0.008, [1.5, 4.0]);
          peel(kit, 0.4, 24.6, 4.8, 8.2, 0.006, 5);
          kit.prop('security_light', { at: [e.lx(-12.2), 0.3], y: BY + 3.7, rot: 0 });
        },
      },
    ],
  });
}
/** Dead green-cross pharmacy blade (wall-local x): a vertical DRUGS blade under a green cross lightbox. */
function pharmacyBlade(kit, x) {
  kit.at({ x, y: 0, z: 0 }, () => {
    for (const yy of [5.05, 7.0, 8.15]) kit.box({ x: 0, y: yy, z: 0.62, w: 0.05, h: 0.06, d: 1.24, mat: 'steel_dark' });
    kit.sweep(circle(0.012, 4), [[0, 8.6, 0.02], [0, 8.12, 1.15]], 'steel_dark', { smooth: true, up: [1, 0, 0] });
    kit.bbox({ x: 0, y: 4.9, z: 0.78, w: 0.22, h: 2.05, d: 0.86, bevel: 0.02, mat: 'sign_white', tint: '#e2ddd0' });
    const G = '#4f8e5c';
    kit.bbox({ x: 0, y: 7.05, z: 0.78, w: 0.26, h: 1.1, d: 0.36, bevel: 0.03, mat: 'sign_white', tint: G });
    kit.bbox({ x: 0, y: 7.42, z: 0.78, w: 0.26, h: 0.36, d: 1.1, bevel: 0.03, mat: 'sign_white', tint: G });
    for (const s of [-1, 1]) kit.at({ x: s * 0.112, rot: s * PI / 2 }, () => {
      const cz = -s * 0.78;   // blade centre in this frame (local x = -s * wall z)
      textVertical(kit, 'DRUGS', { font: 'sans', h: 0.27, pitch: 0.38, x: cz, yTop: 6.78, z: 0.004, mat: 'wz_paint_green' });
      // dead neon tube outlining the cross
      const c = [[-0.12, 7.14], [0.12, 7.14], [0.12, 7.47], [0.47, 7.47], [0.47, 7.71], [0.12, 7.71], [0.12, 8.06], [-0.12, 8.06], [-0.12, 7.71], [-0.47, 7.71], [-0.47, 7.47], [-0.12, 7.47], [-0.12, 7.14]];
      kit.sweep(circle(0.016, 4), c.map(([a, y]) => [cz + a, y, 0.04]), 'lamp_off', { smooth: true, up: [0, 0, 1] });
    });
  });
}
/** Faded painted wall advert for the hardware store on W_N2's cross-street wall (wall-local x, world y). */
function ghostSign(kit, x0, x1, y0, y1) {
  const z = 0.006, mid = (x0 + x1) / 2;
  flat(kit, rect2(x0, y0, x1, y1), z, 'brick_painted', { tint: '#6f4a3c' });
  flat(kit, rect2(x0 + 0.25, y0 + 0.25, x1 - 0.25, y0 + 0.38), z + 0.002, 'brick_painted', { tint: '#d8cbb0' });
  flat(kit, rect2(x0 + 0.25, y1 - 0.38, x1 - 0.25, y1 - 0.25), z + 0.002, 'brick_painted', { tint: '#d8cbb0' });
  textLine(kit, 'BAXTER', { font: 'slab', h: 1.7, x: mid, y: y1 - 2.5, z: z + 0.003, align: 'center', mat: 'brick_painted', tint: '#e0d4b4', maxW: x1 - x0 - 1.0 });
  textLine(kit, 'HARDWARE', { font: 'slab', h: 1.35, x: mid, y: y1 - 4.5, z: z + 0.003, align: 'center', mat: 'brick_painted', tint: '#d6b25c', maxW: x1 - x0 - 1.0 });
  textLine(kit, 'PAINT · GLASS · TOOLS', { font: 'serif', h: 0.6, x: mid, y: y0 + 2.1, z: z + 0.003, align: 'center', mat: 'brick_painted', tint: '#d8cbb0', maxW: x1 - x0 - 1.2 });
  textLine(kit, 'EST. 1911', { font: 'serif', h: 0.42, x: mid, y: y0 + 0.9, z: z + 0.003, align: 'center', mat: 'brick_painted', tint: '#cfc2a4' });
  peel(kit, x0, x1, y0, y1, z + 0.005, 7);
}

// ==================================================================================================== south side
function southBlocks(kit, L) {
  // ---------------- W_S1 sale store (stone_office beige, 6F): yellow BIG SALE 大特賣 band, SALE posters in every pane
  const STONE = '#c7bba1', TRIM_T = '#ddd3bd';
  block(kit, {
    id: 'W_S1', x0: -40, x1: -26, z0: 9, z1: 24, floors: [4.5, 3.4, 3.4, 3.4, 3.4, 3.4], parapet: 0.9,
    mat: 'concrete_wall', tint: STONE, groundMat: 'concrete_wall', groundTint: '#7a7166', trim: 'trim_stone', trimTint: TRIM_T,
    cornice: { kind: 'stone', mat: 'trim_stone', tint: '#d5cab2' }, plinthMat: 'concrete_dirty', plinthTint: '#4c4844', plinthH: 0.55,
    win: { w: 2.6, h: 1.8, sill: 0.8, mullions: [3, 1], frame: 'frame_dark', ac: 0.08 },
    faces: [{
      side: 'N', cols: [2.4, 7.0, 11.6], pilasters: [0.25, 4.7, 9.3, 13.75], pilW: 0.5, lit: [[3, 2]],
      mod: (f, k, op) => (f === 1 && k === 1 ? { ...op, state: 'broken', ac: false, streak: false, spawn: true } : op),   // SP_W_WIN
      ground: () => [
        { x: 0.55, w: 3.7, y: BY + 0.02, h: 3.0, type: 'shop', state: 'glass', frame: 'frame_dark', kick: 'trim_metal', room: 1.4 },
        { x: 5.15, w: 1.2, y: BY + 0.02, h: 3.0, type: 'shop', state: 'glass', frame: 'frame_dark', kick: 'trim_metal', room: 1.4 },
        { x: 6.45, w: 1.1, y: BY + 0.02, h: 2.7, type: 'door', state: 'closed', door: 'glass_dirty', frame: 'frame_dark', step: false },
        { x: 7.65, w: 1.2, y: BY + 0.02, h: 3.0, type: 'shop', state: 'broken', frame: 'frame_dark', kick: 'trim_metal', room: 1.4 },
        { x: 9.75, w: 3.7, y: BY + 0.02, h: 3.0, type: 'shop', state: 'glass', frame: 'frame_dark', kick: 'trim_metal', room: 1.4 },
      ],
      decor: (e, ops) => {
        // SALE posters in every pane (stuck on the glass)
        let k = 0;
        for (const op of ops.filter((o) => o.type === 'shop')) {
          const panes = Math.max(1, Math.round(op.w / 1.6));
          for (let pI = 0; pI < panes; pI++) {
            const px0 = op.x + (op.w * pI) / panes + 0.08, px1 = op.x + (op.w * (pI + 1)) / panes - 0.08;
            const n = px1 - px0 > 1.35 ? 2 : 1, pw = (px1 - px0) / n;
            for (let i = 0; i < n; i++) {
              const y0 = BY + kit.rnd(0.55, 0.85), ph = Math.min(BY + 2.32 - y0, pw * kit.rnd(1.2, 1.5));
              salePoster(kit, px0 + i * pw + 0.03, y0, pw - 0.06, ph, -0.132, k++, kit.rnd(-0.05, 0.05));
            }
          }
          if (op.w > 3) salePoster(kit, op.x + op.w * 0.25, BY + 2.5, op.w * 0.5, 0.4, -0.132, 5, 0.0);
        }
        // the yellow sign band across the whole front, red BIG SALE + 大特賣, dead bulbs along the top
        const zf = board(kit, 0.3, 13.7, 3.32, 1.02, { mat: 'sign_white', tint: '#e8c23a', d: 0.16, border: { mat: 'sign_white', tint: '#b8382a', w: 0.05, inset: 0.06 } });
        textMixed(kit, [['BIG SALE', { font: 'sans', h: 0.52, mat: 'wz_paint_red' }], ['大特賣', { font: 'cjk', h: 0.6, mat: 'wz_paint' }]], { x: 7.0, y: 3.55, z: zf, gap: 0.55, maxW: 11.5 });
        for (let x = 0.6; x < 13.5; x += 0.6) kit.cyl({ x, y: 4.36, z: 0.12, r: 0.035, h: 0.06, seg: 6, mat: 'lamp_off' });
        // a banner hung across the 2F pilasters: CLOSING DOWN
        kit.at({ x: 0, y: 0, z: 0.11 }, () => {
          kit.face([[4.95, 5.1, 0], [9.05, 5.15, 0], [9.0, 5.85, 0.02], [5.0, 5.82, 0.02]], 'wz_fabric', { tint: '#e8e2d0' });
          textLine(kit, 'CLOSING DOWN', { font: 'sans', h: 0.3, x: 7.0, y: 5.3, z: 0.03, align: 'center', mat: 'wz_paint_red', maxW: 3.6 });
        });
        // the spawn window SP_W_WIN: sash torn out, curtain blowing out, shards on the band below
        const sp = ops.find((op) => op.spawn);
        kit.at({ x: sp.cx + 0.9, y: sp.y + 0.15, z: 0.1, rz: 0.55 }, () => kit.box({ x: 0, y: 0, z: 0, w: 0.05, h: 1.25, d: 0.05, mat: 'frame_dark' }));
        kit.face([[sp.cx - 1.0, sp.y + 1.65, -0.05], [sp.cx - 0.3, sp.y + 1.65, -0.05], [sp.cx - 0.1, sp.y + 0.35, 0.5], [sp.cx - 0.9, sp.y + 0.1, 0.35]], 'wz_fabric', { tint: '#b9b09a' });
        for (let i = 0; i < 14; i++) { const x = kit.rnd(5.5, 8.5), z = kit.rnd(0.3, 1.7), s = kit.rnd(0.05, 0.15); kit.upFace([[x, SW + 0.004, z], [x + s, SW + 0.004, z + kit.rnd(-0.05, 0.05)], [x + s * 0.4, SW + 0.004, z + s]], 'glass_dirty', null, {}); }
        streaks(kit, 0.2, 13.8, 21.5, 8, 0.004, [1.5, 3.5]);
      },
    }],
  });

  // ---------------- W_S2 corner flats (brick_dark, 7F): liquor store, apartment door; fire escape on the W face
  const DARK = '#cdbdb2';
  block(kit, {
    id: 'W_S2', x0: -54, x1: -40, z0: 9, z1: 38, floors: [4.5, 3.4, 3.4, 3.4, 3.4, 3.4, 3.4], parapet: 0.9,
    mat: 'brick_dark', tint: DARK, groundMat: 'concrete_wall', groundTint: '#c4bcae', trim: 'trim_stone', trimTint: '#b4ab9c',
    cornice: { kind: 'simple', mat: 'trim_concrete', tint: '#9c968a' }, plinthMat: 'concrete_dirty', plinthTint: '#625e58',
    win: { w: 1.1, h: 1.7, sill: 0.9, lintel: 'trim_stone', states: WIN_STATES_POOR, ac: 0.16 },
    faces: [
      {
        side: 'N', cols: [1.5, 4.3, 7.1, 9.9, 12.7], pipes: [13.8], lit: [[2, 1], [5, 4]],
        ground: () => [
          { x: 0.8, w: 3.6, y: BY + 0.02, h: 3.0, type: 'shop', state: 'dark', frame: 'sign_blue', kick: 'sign_blue', mullions: [2, 1], room: 1.8 },
          { x: 4.6, w: 1.15, y: BY + 0.02, h: 2.6, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#2f4e7a', window: true, frame: 'sign_blue', step: false },
          { x: 5.95, w: 3.6, y: BY + 0.02, h: 3.0, type: 'shop', state: 'broken', frame: 'sign_blue', kick: 'sign_blue', room: 1.8 },
          { x: 11.1, w: 1.2, y: BY + 0.02, h: 2.6, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#4e544c', window: true, step: false },
          { x: 12.6, w: 1.0, y: BY + 1.1, h: 1.5, type: 'window', state: 'boarded', frame: 'frame_dark' },
        ],
        decor: (e, ops) => {
          posterWall(kit, 0.9, 4.3, 0.5, 2.8, -0.05, 8, ['MISSING', 'LIQUOR', 'SALE', 'EVACUATE', null]);
          // smashed liquor window: empty shelving, broken bottles on the sidewalk
          kit.box({ x: 7.75, y: BY + 0.02, z: -1.6, w: 3.4, h: 2.2, d: 0.35, mat: 'wz_wood', tint: '#5a4636' });
          for (let i = 0; i < 12; i++) kit.cyl({ x: kit.rnd(6.2, 9.4), y: BY + 0.02 + kit.pick([0.0, 0.72, 1.44]), z: -1.5, r: 0.035, h: 0.28, seg: 6, mat: 'glass_dirty' });
          for (let i = 0; i < 18; i++) { const x = kit.rnd(5.8, 9.8), z = kit.rnd(0.2, 1.9), s = kit.rnd(0.04, 0.13); kit.upFace([[x, SW + 0.004, z], [x + s, SW + 0.004, z + kit.rnd(-0.05, 0.05)], [x + s * 0.4, SW + 0.004, z + s]], 'glass_dirty', null, {}); }
          const zf = board(kit, 0.6, 9.8, 3.38, 0.84, { mat: 'sign_white', tint: '#7a2a24', border: { mat: 'sign_white', tint: '#d6b45a', w: 0.03 } });
          textLine(kit, 'DISCOUNT LIQUORS', { font: 'serif', h: 0.4, x: 5.2, y: 3.6, z: zf, align: 'center', mat: 'wz_paint_white', maxW: 8.4 });
          // dead OPEN sign behind the glass + a solid green canvas awning, torn
          kit.at({ x: 2.6, y: BY + 2.1, z: -0.3 }, () => { kit.box({ x: 0, y: 0, z: 0, w: 0.9, h: 0.36, d: 0.04, mat: 'frame_dark', tint: '#222' }); textLine(kit, 'OPEN', { font: 'sans', h: 0.16, x: 0, y: 0.1, z: 0.025, align: 'center', mat: 'lamp_off' }); });
          stripedAwning(kit, { x0: 0.7, x1: 9.7, y: 3.36, depth: 1.3, colors: ['#3d5a46', '#3d5a46', '#36513f'], torn: [9, 10, 18], hang: [10] });
          kit.wallLamp({ x: 11.7, y: BY + 2.9, on: true, intensity: 3.2, range: 6, color: '#ffc58a' });
          textLine(kit, '1208', { font: 'serif', h: 0.15, x: 11.7, y: BY + 2.66, z: 0.02, align: 'center', mat: 'wz_paint_white' });
          streaks(kit, 0.2, 13.8, 24.8, 9, 0.004, [1.5, 3.5]);
        },
      },
      {
        side: 'W', cols: [1.6, 4.0, 6.4, 9.6, 12.4, 15.2, 18.0, 20.8, 23.6, 26.4], pipes: [0.25, 28.75], lit: [[3, 7]],
        mod: (f, k, op) => { if (k === 2 || k === 3) { op.ac = false; op.streak = false; } return op; },
        ground: () => [
          { x: 0.9, w: 1.1, y: BY + 0.02, h: 2.3, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#59605a', step: false },
          { x: 2.8, w: 3.6, y: BY + 0.02, h: 3.2, type: 'garage', shutter: 1, shutterTint: '#8c9296' },
          { x: 7.0, w: 3.6, y: BY + 0.02, h: 3.2, type: 'garage', shutter: 1, shutterTint: '#7f8a84' },
          { x: 11.4, w: 3.0, y: BY + 1.0, h: 1.9, type: 'window', state: 'boarded', frame: 'frame_dark' },
          { x: 15.2, w: 3.6, y: BY + 0.02, h: 3.2, type: 'garage', shutter: 0.7, shutterTint: '#9c9a90' },
          { x: 19.6, w: 1.1, y: BY + 0.02, h: 2.3, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#6a5a4a', step: false },
          { x: 23.0, w: 2.0, y: BY + 1.0, h: 1.6, type: 'window', state: 'boarded', frame: 'frame_dark' },
          { x: 26.5, w: 1.1, y: BY + 0.02, h: 2.3, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#4e544c', step: false },
        ],
        decor: () => {
          posterWall(kit, 2.9, 6.3, 0.6, 2.9, 0.02, 6, ['QUARANTINE', 'MISSING', null]);
          posterWall(kit, 7.1, 10.5, 0.7, 2.8, 0.02, 5, ['NO ENTRY', 'LOST', null]);
          posterWall(kit, 15.3, 18.7, 1.2, 2.9, 0.02, 4, ['EVACUATE', null]);
          searchMark(kit, 4.6, 2.1, 0.8, 'wz_paint_red', '9-29');
          textLine(kit, 'NO PARKING', { font: 'sans', h: 0.18, x: 9.0, y: 1.2, z: 0.03, align: 'center', mat: 'wz_paint_white' });
          fireEscape(kit, { x: 8.0, floors: 7, groundH: 4.5, floorH: 3.4, bases: [0, 4.5, 7.9, 11.3, 14.7, 18.1, 21.5].map((v) => v + BY), width: 5.6 });
          streaks(kit, 0.2, 28.8, 24.8, 12, 0.004, [1.5, 4.0]);
          kit.prop('security_light', { at: [1.45, 0.3], y: BY + 2.65, rot: 0 });
        },
      },
      { side: 'E', from: BY + 21.5, cols: [3.0, 9.0, 15.0, 21.0, 27.0], win: { w: 1.0, h: 1.6 }, belts: false, plinth: false },
    ],
    extra: (ctx) => waterTank(kit, [-48.5, 31.0], ctx.top + 0.02, 1.6, 3.2),
  });
}

// ==================================================================================================== west row + ends
function rowBlocks(kit, L) {
  // ---------------- X_W1 west row flats (brick_commercial, 6F): cleaners, bicycles, AUTO PARTS on the stub
  block(kit, {
    id: 'X_W1', x0: -82, x1: -66, z0: -34, z1: -9, floors: [4.5, 3.4, 3.4, 3.4, 3.4, 3.4], parapet: 0.9,
    mat: 'brick_red', tint: '#cdb0a0', trim: 'trim_stone', trimTint: '#d2c8b6', cornice: { kind: 'metal', mat: 'trim_metal', tint: '#4b4038', bracket: 1.2 },
    win: { w: 1.2, h: 1.9, sill: 0.9, lintel: 'trim_stone', ac: 0.1 },
    faces: [
      {
        side: 'E', cols: [1.6, 4.6, 7.6, 10.6, 13.6, 16.6, 19.6, 22.6], pipes: [0.25, 24.75], lit: [[2, 3], [5, 6]],
        ground: () => [
          { x: 1.0, w: 4.4, y: BY + 0.02, h: 3.0, type: 'shop', state: 'dark', frame: 'frame_white', kick: 'trim_metal', mullions: [3, 1], room: 1.6 },
          { x: 5.7, w: 1.15, y: BY + 0.02, h: 2.6, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#3c5a6a', window: true, frame: 'frame_white', step: false },
          { x: 7.15, w: 3.3, y: BY + 0.02, h: 3.0, type: 'shop', state: 'broken', frame: 'frame_white', kick: 'trim_metal', room: 1.6 },
          { x: 11.2, w: 3.8, y: BY + 0.02, h: 3.1, type: 'garage', shutter: 0.62, shutterTint: '#7d8a80' },
          { x: 15.4, w: 1.1, y: BY + 0.02, h: 2.5, type: 'door', state: 'closed', door: 'wz_wood', doorTint: '#6e5038', step: false },
          { x: 18.2, w: 3.6, y: BY + 0.02, h: 3.0, type: 'shop', state: 'boarded', frame: 'frame_dark', kick: 'trim_metal' },
          { x: 22.6, w: 1.1, y: BY + 0.02, h: 2.4, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#555a52', step: false },
        ],
        decor: (e, ops) => {
          posterWall(kit, 1.1, 5.3, 0.5, 2.8, -0.05, 6, ['MISSING', 'CLOSED', null]);
          for (let i = 0; i < 6; i++) kit.at({ x: 1.6 + i * 0.65, y: BY + 2.55, z: -0.5 }, () => { kit.box({ x: 0, y: -1.05, z: 0, w: 0.5, h: 1.05, d: 0.04, mat: 'wz_fabric', tint: kit.pick(['#7a8aa0', '#d8d2c4', '#6a5a4a', '#a8b0a0']) }); kit.box({ x: 0, y: 0, z: 0, w: 0.5, h: 0.03, d: 0.03, mat: 'steel' }); });
          const zf = board(kit, 0.8, 10.6, 3.38, 0.84, { mat: 'sign_white', tint: '#3d5f8e', border: { mat: 'sign_white', tint: '#eae6da', w: 0.035 } });
          textLine(kit, 'WESTSIDE CLEANERS', { font: 'serif', h: 0.38, x: 5.7, y: 3.6, z: zf, align: 'center', mat: 'wz_paint_white', maxW: 9.2 });
          // bicycle shop: roller door jammed 40 % open, dark inside, a bicycle wheel leaning out
          const zb = board(kit, 11.0, 15.2, 3.42, 0.66, { mat: 'sign_white', tint: '#d9b44a', d: 0.08 });
          textLine(kit, 'BICYCLES', { font: 'slab', h: 0.34, x: 13.1, y: 3.58, z: zb, align: 'center', mat: 'wz_paint', maxW: 3.8 });
          kit.at({ x: 12.4, y: BY + 0.02, z: 0.3, rot: 0.2, rz: 0.25 }, () => { const ring = circle(0.33, 16).map(([a, b]) => [a, b + 0.34, 0]); kit.sweep(circle(0.018, 4), [...ring, ring[0]], 'rubber', { smooth: true, up: [0, 0, 1] }); });
          posterWall(kit, 18.3, 21.7, 0.8, 2.9, 0.06, 5, ['NO ENTRY', 'QUARANTINE', null]);
          searchMark(kit, 20.0, 1.9, 0.8, 'wz_paint_red', '10-02');
          streaks(kit, 0.2, 24.8, 21.6, 11, 0.004, [1.5, 3.5]);
        },
      },
      {
        side: 'S', span: [-76, -66], cols: [1.5, 4.5, 7.5], pipes: [9.75], lit: [[4, 0]],
        ground: () => [
          { x: 2.4, w: 1.1, y: BY + 0.02, h: 2.4, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#4a5a52', step: false },
          { x: 6.5, w: 3.0, y: BY + 0.02, h: 3.0, type: 'shop', state: 'dark', frame: 'sign_green', kick: 'sign_green', mullions: [2, 1], room: 1.5 },
        ],
        decor: () => {
          const zf = board(kit, 5.8, 9.9, 3.36, 0.8, { mat: 'sign_white', tint: '#4e7a5c', border: { mat: 'sign_white', tint: '#e6e2d4', w: 0.03 } });
          textLine(kit, 'AUTO PARTS', { font: 'slab', h: 0.36, x: 7.85, y: 3.58, z: zf, align: 'center', mat: 'wz_paint_white', maxW: 3.7 });
          posterWall(kit, 6.6, 9.4, 0.5, 2.7, -0.05, 4, ['NO ENTRY', 'MISSING', null]);
          posterWall(kit, 0.2, 2.2, 0.6, 2.8, 0.02, 4, ['LOST', null]);
          streaks(kit, 0.2, 9.8, 21.6, 6, 0.004, [1.5, 3.5]);
        },
      },
      {
        side: 'S', span: [-82, -76], from: 12.7, cols: [], belts: false, plinth: false,
        decor: (e, ops, ctx) => colaGhostSign(kit, 0.25, e.L - 0.25, 13.4, ctx.top - 0.9),
      },
    ],
  });

  // ---------------- X_W2 old Harbor Hotel (limestone_grand, 8F): rusticated base, arched top floor, HOTEL blade (N)
  const WALL = '#cfd1d0', STONE = '#e6e6e2';
  const hotelDecor = (e, ops, ctx) => {
    const ups = ops.filter((o) => o.type === 'window' && o.y > 4.6);
    for (const op of ups) {
      if (op.fi === 7) hood(kit, op, 'arch', 'plaster', STONE);
      else if (op.fi === 2 || op.fi === 5) hood(kit, op, 'pediment', 'plaster', STONE);
      else hood(kit, op, 'key', 'plaster', STONE);
      if ((op.fi === 2 || op.fi === 6) && op.k % 2 === 1) balconette(kit, op, 'plaster', STONE);
    }
    // rusticated base: dark joints every 0.55 m up to the 3F sill course
    for (let y = 1.0; y < 8.0; y += 0.55) hBand(kit, e.L, ops, y, 0.035, { mat: 'trim_concrete', tint: '#77746c', d: 0.012 });
    kit.box({ x: e.L / 2, y: 8.03 + 0.62, z: 0.05, w: e.L + 0.06, h: 0.14, d: 0.1, mat: 'plaster', tint: STONE, faces: { nz: false } });
    kit.box({ x: e.L / 2, y: ctx.top - 1.3, z: 0.03, w: e.L + 0.08, h: 0.42, d: 0.06, mat: 'plaster', tint: STONE, faces: { nz: false } });
    for (let x = 0.15; x < e.L - 0.1; x += 0.32) kit.box({ x, y: ctx.top - 0.78, z: 0.1, w: 0.14, h: 0.16, d: 0.12, mat: 'plaster', tint: STONE, faces: { nz: false } });
  };
  block(kit, {
    id: 'X_W2', x0: -82, x1: -66, z0: 9, z1: 38, floors: [4.5, 3.4, 3.4, 3.4, 3.4, 3.4, 3.4, 3.4], parapet: 1.2,
    mat: 'plaster', tint: WALL, trim: 'plaster', trimTint: STONE, cornice: { kind: 'stone', mat: 'plaster', tint: STONE }, belts: false,
    plinthMat: 'trim_concrete', plinthTint: '#8c8a84', plinthH: 0.8, coping: 'plaster',
    win: { w: 1.3, h: 2.0, sill: 0.85, frame: 'frame_dark', sillMat: 'plaster', ac: 0.06, streak: 0.55 },
    faces: [
      {
        side: 'E', cols: [1.8, 5.0, 8.2, 11.4, 14.6, 17.8, 21.0, 24.2, 27.2], pipes: [28.8], lit: [[3, 4], [6, 1]],
        mod: (f, k, op) => { if (f === 7) op.h = 1.6; if (f === 1) op.state = wpick(kit, WIN_STATES_POOR); return op; },
        ground: () => [
          { x: 0.9, w: 3.4, y: BY + 0.02, h: 3.0, type: 'shop', state: 'boarded', frame: 'frame_dark', kick: 'trim_metal' },
          { x: 5.0, w: 1.1, y: BY + 0.02, h: 2.5, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#4a4f48', step: false },
          { x: 8.6, w: 3.4, y: BY + 0.02, h: 3.2, type: 'shop', state: 'broken', frame: 'sign_red', kick: 'sign_red', room: 1.6 },
          { x: 13.0, w: 3.2, y: BY + 0.02, h: 3.4, type: 'door', state: 'closed', door: 'trim_wood', doorTint: '#9a7a52', step: false },
          { x: 13.0, w: 3.2, y: BY + 3.5, h: 0.75, type: 'window', state: 'dark', frame: 'frame_dark', sill: false, mullions: [4, 1] },
          { x: 17.2, w: 3.3, y: BY + 0.02, h: 3.2, type: 'shop', state: 'shutter', frame: 'frame_dark', kick: 'trim_metal', shutterTint: '#9a9a92' },
          { x: 20.9, w: 3.3, y: BY + 0.02, h: 3.2, type: 'shop', state: 'dark', frame: 'frame_dark', kick: 'trim_metal', room: 1.4 },
          { x: 25.2, w: 1.1, y: BY + 0.02, h: 2.6, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#59605a', step: false },
          { x: 26.9, w: 1.6, y: BY + 1.0, h: 2.0, type: 'window', state: 'boarded', frame: 'frame_dark' },
        ],
        decor: (e, ops, ctx) => {
          hotelDecor(e, ops, ctx);
          // hotel entrance: marquee canopy with HARBOR HOTEL letters + dead bulbs, chains to the wall, boarded doors
          const cy = 4.0, cd = 1.8, cx = 14.6;
          kit.box({ x: cx, y: cy, z: cd / 2 + 0.03, w: 4.6, h: 0.36, d: cd - 0.06, mat: 'metal_worn', tint: '#8f9488', faces: { nz: false } });
          kit.box({ x: cx, y: cy + 0.36, z: cd / 2, w: 4.65, h: 0.05, d: cd + 0.05, mat: 'steel', tint: '#a8a28f' });
          textLine(kit, 'HARBOR HOTEL', { font: 'serif', h: 0.22, x: cx, y: cy + 0.08, z: cd + 0.004, align: 'center', mat: 'wz_paint_white', maxW: 4.2 });
          for (let x = cx - 2.1; x < cx + 2.2; x += 0.42) kit.cyl({ x, y: cy - 0.05, z: cd - 0.12, r: 0.04, h: 0.05, seg: 6, mat: 'lamp_off' });
          for (const x of [cx - 2.2, cx + 2.2]) kit.sweep(circle(0.012, 4), [[x, cy + 0.38, cd - 0.1], [x, cy + 2.1, 0.05]], 'steel_dark', { smooth: true, up: [1, 0, 0] });
          for (const [x0, w, mark] of [[13.05, 1.55, 'NO'], [14.6, 1.55, 'KEEP OUT']]) {
            kit.box({ x: x0 + w / 2, y: BY + 0.02, z: 0.04, w, h: 3.3, d: 0.03, mat: 'wz_wood', tint: '#c9b28c', uvOffset: [x0, 0] });
            textLine(kit, mark, { font: 'sans', h: 0.26, x: x0 + w / 2, y: 1.6, z: 0.058, align: 'center', mat: 'wz_paint_red', italic: 0.12, maxW: w - 0.2 });
          }
          kit.at({ y: SW - BY }, () => { kit.sandbags([[12.6, 0.55], [16.6, 0.55]], { rows: 3 }); });
          posterWall(kit, 17.3, 20.4, 0.5, 2.9, 0.02, 6, ['MISSING', 'QUARANTINE', 'LOST', null]);
          posterWall(kit, 0.9, 4.3, 0.8, 2.9, 0.06, 4, ['NO ENTRY', null]);
          const zf = board(kit, 20.8, 24.4, 3.42, 0.66, { mat: 'sign_white', tint: '#9c3a2e', d: 0.08 });
          textLine(kit, 'TOBACCO · CIGARS', { font: 'serif', h: 0.28, x: 22.6, y: 3.6, z: zf, align: 'center', mat: 'wz_paint_white', maxW: 3.3 });
          streaks(kit, 0.2, 28.8, 28.4, 12, 0.004, [1.5, 4.0]);
        },
      },
      {
        side: 'N', span: [-76, -66], cols: [1.7, 5.0, 8.3], lit: [[5, 1]],
        mod: (f, k, op) => { if (f === 7) op.h = 1.6; return op; },
        ground: () => [
          { x: 0.45, w: 2.2, y: BY + 0.02, h: 3.0, type: 'shop', state: 'dark', frame: 'sign_blue', kick: 'sign_blue', mullions: [2, 1], room: 1.2 },
          { x: 6.0, w: 1.1, y: BY + 0.02, h: 2.4, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#4c5246', step: false },
          { x: 8.0, w: 1.5, y: BY + 1.0, h: 1.7, type: 'window', state: 'boarded', frame: 'frame_dark' },
        ],
        decor: (e, ops, ctx) => {
          hotelDecor(e, ops, ctx);
          posterWall(kit, 0.5, 2.6, 0.5, 2.9, -0.05, 6, ['MISSING', 'LOST', 'EVACUATE', null]);
          posterWall(kit, 2.8, 5.8, 0.6, 3.1, 0.02, 9, ['MISSING', 'NO ENTRY', 'QUARANTINE', 'SALE', null, null]);
          hotelBlade(kit, 0.95);
        },
      },
      { side: 'N', span: [-82, -76], from: 12.7, cols: [1.5, 4.5], win: { w: 1.2, h: 1.8 }, plinth: false },
    ],
    extra: (ctx) => {
      // roof: elevator penthouse + lattice aerial
      kit.at({ x: -77.5, y: ctx.top, z: 30.0 }, () => {
        kit.box({ x: 0, y: 0, z: 0, w: 3.6, h: 3.0, d: 3.2, mat: 'brick_painted', tint: '#b8b2a2', collide: true, faces: { bottom: false } });
        kit.box({ x: 0, y: 3.0, z: 0, w: 3.8, h: 0.2, d: 3.4, mat: 'trim_concrete' });
        kit.cyl({ x: 1.2, y: 3.2, z: -1.0, r: 0.06, h: 6.0, seg: 6, mat: 'steel', tint: '#8a8a84' });
        for (let i = 1; i < 4; i++) kit.box({ x: 1.2, y: 3.2 + i * 1.5, z: -1.0, w: 0.9 - i * 0.18, h: 0.03, d: 0.03, mat: 'steel_dark' });
      });
    },
  });
  // HARBOR HOTEL rooftop sign frame over the stub (letters on a lattice, one missing): silhouette above the gantry
  kit.at({ x: -67.6, y: BY + 28.3 + 1.2, z: 14.2, rot: FACE.E }, () => {
    const W = 8.6, H = 1.5;
    for (const x of [-W / 2 + 0.3, 0, W / 2 - 0.3]) { kit.beam([x, 0, 0.3], [x, H + 0.4, 0.3], { kind: 'L', h: 0.08, w: 0.08, t: 0.008, tint: '#4b4945' }); kit.beam([x, H * 0.7, 0.28], [x, 0.02, 1.5], { kind: 'L', h: 0.06, w: 0.06, t: 0.008, tint: '#4b4945' }); }
    for (const y of [0.15, H + 0.3]) kit.beam([-W / 2, y, 0.2], [W / 2, y, 0.2], { kind: 'box', h: 0.07, w: 0.06, tint: '#4b4945' });
    const word = 'HOTEL', bw = 1.4, gap = 0.3, x0 = -((word.length * bw + (word.length - 1) * gap) / 2) + bw / 2;
    [...word].forEach((ch, i) => {
      if (i === 3) return;   // the E fell off long ago (bent bracket only)
      const x = x0 + i * (bw + gap);
      textLine(kit, ch, { font: 'slab', h: H, x, y: 0.15, z: 0.12, align: 'center', mat: 'sign_white', tint: '#d9d2c0', depth: 0.08, sideMat: 'steel_dark', sideTint: '#55524c' });
      for (let k = 0; k < 6; k++) kit.cyl({ x: x + kit.rnd(-0.45, 0.45), y: 0.3 + k * 0.22, z: 0.21, r: 0.035, h: 0.04, seg: 6, mat: 'lamp_off', rx: PI / 2 });
    });
    kit.at({ x: x0 + 3 * (bw + gap), y: 0.8, z: 0.15, rz: 0.7 }, () => kit.box({ x: 0, y: 0, z: 0, w: 0.06, h: 0.9, d: 0.06, mat: 'steel_dark' }));
  });

  // ---------------- END_W: low cold-storage block closing the LED pocket (facade x = -76, faces the fort)
  block(kit, {
    id: 'END_W', x0: -84, x1: -76, z0: -9, z1: 9, floors: [4.6, 3.6, 3.6], parapet: 1.3,
    mat: 'brick_red', tint: '#b6988a', trim: 'trim_concrete', trimTint: '#a49c90', cornice: { kind: 'simple', mat: 'trim_concrete', tint: '#9a9286' }, belts: false,
    win: { w: 2.6, h: 2.1, sill: 0.9, mullions: [4, 3], frame: 'frame_dark', lintel: 'trim_concrete', states: { broken: 0.5, dark: 0.3, boarded: 0.2 }, ac: 0 },
    faces: [{
      side: 'E', cols: [2.6, 6.6, 11.4, 15.4],
      ground: () => [
        { x: 2.6, w: 1.1, y: BY + 0.02, h: 2.4, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#5a5f58', step: false },
        { x: 6.5, w: 5.0, y: BY + 0.02, h: 4.0, type: 'garage', shutter: 1, shutterTint: '#7c817a' },
        { x: 14.2, w: 1.1, y: BY + 0.02, h: 2.4, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#6a5a4a', step: false },
      ],
      decor: (e, ops, ctx) => {
        // painted name across the parapet band, faded
        flat(kit, rect2(0.6, ctx.top + 0.12, 17.4, ctx.top + 1.15), 0.006, 'brick_painted', { tint: '#5d4034' });
        textLine(kit, 'HARBOR COLD STORAGE', { font: 'slab', h: 0.66, x: 9.0, y: ctx.top + 0.3, z: 0.009, align: 'center', mat: 'brick_painted', tint: '#e2d7bd', maxW: 16.2 });
        posterWall(kit, 6.6, 11.4, 0.8, 3.6, 0.02, 6, ['QUARANTINE', 'NO ENTRY', null]);
        streaks(kit, 0.2, 17.8, ctx.top, 8, 0.004, [1.5, 3.5]);
      },
    }],
    extra: (ctx) => waterTank(kit, [-81.6, 6.4], ctx.top + 0.02, 1.4, 2.8),
  });

  // ---------------- cross-street pocket end walls (z -34 / 38): back buildings closing the spawn pockets
  const endBlock = (id, z0, z1, side) => block(kit, {
    id, x0: -66, x1: -54, z0, z1, floors: [4.5, 3.4, 3.4, 3.4, 3.4], parapet: 0.8,
    mat: 'brick_red', tint: '#b09a8e', groundMat: 'concrete_wall', groundTint: '#c4bcae', trim: 'trim_concrete', trimTint: '#a8a296', cornice: { kind: 'simple', mat: 'trim_concrete', tint: '#a09a8e' }, belts: false,
    win: { w: 1.1, h: 1.6, sill: 0.9, states: WIN_STATES_POOR, ac: 0.1 },
    faces: [{
      side, cols: [1.6, 4.5, 7.5, 10.4], room: 0.8,
      ground: () => [
        { x: 1.4, w: 4.4, y: BY + 0.02, h: 3.4, type: 'garage', shutter: side === 'S' ? 0.72 : 1, shutterTint: '#7a7f78' },
        { x: 7.2, w: 1.1, y: BY + 0.02, h: 2.3, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#5f645c', step: false },
        { x: 9.3, w: 1.7, y: BY + 1.0, h: 1.6, type: 'window', state: 'boarded', frame: 'frame_dark' },
      ],
      decor: () => {
        posterWall(kit, 1.5, 5.7, 0.6, 3.2, 0.02, 6, ['QUARANTINE', 'NO ENTRY', 'MISSING', null]);
        textLine(kit, 'DANGER', { font: 'sans', h: 0.4, x: 3.6, y: 2.2, z: 0.03, align: 'center', mat: 'wz_paint_red', italic: 0.12 });
        streaks(kit, 0.2, 11.8, 18.2, 6, 0.004, [1.5, 3.5]);
      },
    }],
  });
  endBlock('WX_N_END', -40, -34, 'S');
  endBlock('WX_S_END', 38, 40, 'N');
}

/** Faded painted FIZZ COLA wall advert (our own brand) on a brick side wall (wall-local x, world y). */
function colaGhostSign(kit, x0, x1, y0, y1) {
  const z = 0.006, mid = (x0 + x1) / 2, w = x1 - x0;
  flat(kit, rect2(x0, y0, x1, y1), z, 'brick_painted', { tint: '#8a3a30' });
  flat(kit, rect2(x0 + 0.2, y0 + 0.2, x1 - 0.2, y0 + 0.32), z + 0.002, 'brick_painted', { tint: '#d8cbb0' });
  flat(kit, rect2(x0 + 0.2, y1 - 0.32, x1 - 0.2, y1 - 0.2), z + 0.002, 'brick_painted', { tint: '#d8cbb0' });
  textLine(kit, 'DRINK', { font: 'serif', h: 0.5, x: mid, y: y1 - 1.25, z: z + 0.003, align: 'center', mat: 'brick_painted', tint: '#e0d4b4', maxW: w - 0.8 });
  textLine(kit, 'FIZZ', { font: 'serif', h: 1.5, x: mid, y: y1 - 3.3, z: z + 0.003, align: 'center', mat: 'brick_painted', tint: '#efe4c8', italic: 0.18, maxW: w - 0.8 });
  textLine(kit, 'COLA', { font: 'serif', h: 1.5, x: mid, y: y1 - 5.2, z: z + 0.003, align: 'center', mat: 'brick_painted', tint: '#efe4c8', italic: 0.18, maxW: w - 0.8 });
  textLine(kit, 'ICE COLD · 5 CENTS', { font: 'sans', h: 0.36, x: mid, y: y0 + 0.9, z: z + 0.003, align: 'center', mat: 'brick_painted', tint: '#d8cbb0', maxW: w - 0.8 });
  // the bottle: a dark silhouette with a light label band
  const bx = x1 - 0.85, by = y0 + 1.6, bh = (y1 - y0) * 0.5, bw = bh * 0.24;
  flat(kit, [[bx - bw / 2, by], [bx + bw / 2, by], [bx + bw / 2, by + bh * 0.55], [bx + bw * 0.18, by + bh * 0.8], [bx + bw * 0.16, by + bh], [bx - bw * 0.16, by + bh], [bx - bw * 0.18, by + bh * 0.8], [bx - bw / 2, by + bh * 0.55]], z + 0.003, 'brick_painted', { tint: '#4a2a22' });
  flat(kit, rect2(bx - bw / 2, by + bh * 0.25, bx + bw / 2, by + bh * 0.4), z + 0.004, 'brick_painted', { tint: '#d8cbb0' });
  peel(kit, x0, x1, y0, y1, z + 0.005, 9);
}
/** HARBOR HOTEL vertical blade on X_W2's north face (wall-local x), faces east / west, dead bulbs. */
function hotelBlade(kit, x) {
  const y0 = 7.6, hh = 11.0;
  for (const yy of [y0 + 0.4, y0 + hh / 2, y0 + hh - 0.4]) kit.box({ x, y: yy, z: 0.65, w: 0.06, h: 0.08, d: 1.3, mat: 'steel_dark' });
  kit.at({ x, y: 0, z: 0.8 }, () => {
    kit.bbox({ x: 0, y: y0, z: 0, w: 0.22, h: hh, d: 1.1, bevel: 0.03, mat: 'sign_white', tint: '#3e5778' });
    for (const s of [-1, 1]) kit.at({ x: s * 0.112, rot: s * PI / 2 }, () => {
      kit.face([[-0.48, y0 + 0.12, 0], [0.48, y0 + 0.12, 0], [0.48, y0 + hh - 0.12, 0], [-0.48, y0 + hh - 0.12, 0]], 'sign_white', { tint: '#ddd3b8' });
      textVertical(kit, 'HOTEL', { font: 'slab', h: 0.78, pitch: 1.02, x: 0, yTop: y0 + hh - 0.5, z: 0.004, mat: 'wz_paint_red' });
      textVertical(kit, 'HARBOR', { font: 'serif', h: 0.5, pitch: 0.7, x: 0, yTop: y0 + hh - 5.9, z: 0.004, mat: 'wz_paint' });
      for (let yy = y0 + 0.35; yy < y0 + hh - 0.3; yy += 0.55) for (const xx of [-0.4, 0.4]) kit.cyl({ x: xx, y: yy, z: 0.0, r: 0.035, h: 0.05, seg: 6, mat: 'lamp_off', rx: PI / 2 });
    });
  });
}

// ==================================================================================================== block interiors
// Plain masses that close the gaps inside the zone's blocks (heights match the street buildings in front of them, so
// their roofs never show above the facades seen from the street or the fort).
function fills(kit) {
  const H5 = BY + 18.1, H6 = BY + 21.5, H7 = BY + 24.9, H8 = BY + 28.3, HE = BY + 11.8 + 1.3;
  mass(kit, rect(-40, -40, -26, -24), H6, { mat: 'brick_red', tint: '#b9a294', show: [{ side: 'N', at: -40, span: [-40, -26] }, { side: 'W', at: -40, span: [-40, -24], from: H5 }] });
  mass(kit, rect(-54, -40, -40, -34), H5, { mat: 'brick_painted', tint: '#9aa8a2', show: [{ side: 'N', at: -40, span: [-54, -40] }] });
  mass(kit, [[-84, -40], [-66, -40], [-66, -34], [-82, -34], [-82, -9], [-84, -9]], H6, { mat: 'brick_red', tint: '#b9a294',
    show: [{ side: 'N', at: -40, span: [-84, -66] }, { side: 'E', at: -66, span: [-40, -34], from: H5 }, { side: 'S', at: -9, span: [-84, -82], from: HE }] });
  mass(kit, [[-84, 9], [-82, 9], [-82, 38], [-66, 38], [-66, 40], [-84, 40]], H8, { mat: 'plaster', tint: '#b9bab6',
    show: [{ side: 'N', at: 9, span: [-84, -82], from: HE }, { side: 'E', at: -66, span: [38, 40], from: H5 }, { side: 'S', at: 40, span: [-84, -66] }] });
  mass(kit, rect(-54, 38, -40, 40), H7, { mat: 'brick_dark', tint: '#b8aaa0', show: [{ side: 'E', at: -40, span: [38, 40], from: H6 }, { side: 'W', at: -54, span: [38, 40], from: H5 }, { side: 'S', at: 40, span: [-54, -40] }] });
  mass(kit, rect(-40, 24, -26, 40), H6, { mat: 'concrete_wall', tint: '#b5ab94', show: [{ side: 'E', at: -26, span: [24, 40] }, { side: 'S', at: 40, span: [-40, -26] }] });
}

// ==================================================================================================== cross street barricades
function crossBarricades(kit, L) {
  // ---------------- north (z -26.2): construction fence panels on concrete feet across the street; zombie slot at
  // x -55.56..-54.94 (centre -55.25 = a nav-cell line) between a sawhorse-blocked panel end and W_BARR_XN_2
  const zf = -26.2;
  const yAt = (x) => (x < -63.5 || x > -56.5 ? SW : 0);
  const panels = [[-66.0, -62.75], [-62.75, -59.5], [-59.5, -56.2]];
  panels.forEach(([a, b], i) => fencePanel(kit, [a, zf + (i === 1 ? 0.06 : 0)], [b, zf + (i === 2 ? -0.05 : 0)], 2.3, { y: Math.max(yAt(a + 0.1), yAt(b - 0.1)), lean: [0.02, -0.03, 0.04][i], tint: '#a3a7a8' }));
  fencePanel(kit, [-54.94, zf], [-54.0, zf], 2.3, { y: SW, tint: '#9fa3a4', feet: [0.42] });
  kit.colBox({ x: (-56.2 + -55.56) / 2, y: 0, z: zf, w: 0.64, h: 2.45, d: 0.16 }, 'metal');   // slot side (sawhorse + wire)
  kit.colBox({ x: -60, y: 2.45, z: zf, w: 12, h: 4.0, d: 0.6 }, 'metal');                    // BLK_WX_N: player clip above the fence
  fencePanel(kit, [-56.2, zf], [-55.66, zf - 0.78], 2.2, { y: SW, tint: '#9a9ea0', collide: false, feet: [0.12], lean: -0.05 });
  kit.at({ x: -64.3, y: SW, z: zf + 0.75, rot: 0.12 }, () => sawhorse(kit, 1.6));
  for (const y of [1.6, 2.05]) kit.sweep(circle(0.006, 4), [[-56.2, y + SW, zf], [-55.9, y + SW - 0.08, zf - 0.04], [-55.56, y + SW, zf]], 'wire', { smooth: true });
  // barbed wire along the top, quarantine sign, tape, cones, trash against the fence
  for (const k of [0, 1]) kit.sweep(circle(0.005, 4), [[-66, 2.42 + SW + k * 0.12, zf], [-61, 2.36 + k * 0.12, zf], [-56.2, 2.44 + SW + k * 0.12, zf]], 'wire', { smooth: true });
  kit.at({ x: -61.2, y: 1.05, z: zf + 0.05, rot: FACE.S }, () => quarantineSign(kit, 1.8, 1.05));
  kit.at({ x: -64.9, y: 1.25 + SW, z: zf + 0.05, rot: FACE.S, rz: 0.06 }, () => { const z2 = board(kit, -0.45, 0.45, 0, 0.6, { mat: 'sign_white', tint: '#b8382a', d: 0.02 }); textLine(kit, 'STOP', { font: 'sans', h: 0.24, x: 0, y: 0.18, z: z2, align: 'center', mat: 'wz_paint_white' }); });
  kit.tape([[-66, 1.0 + SW, zf + 0.6], [-62, 0.95, zf + 0.9], [-58.4, 1.0, zf + 0.7], [-56.6, 1.0, zf + 0.3]]);
  for (const [x, z, f] of [[-61.8, -25.0, false], [-59.6, -24.6, true], [-57.5, -25.2, false]]) kit.cone([x, z], { fallen: f });
  trashPile(kit, [-64.9, -25.4], SW, 3, true);
  kit.at({ x: -63.0, y: 0, z: zf + 0.45, rot: 0.1, rx: -0.2 }, () => pallet(kit));
  // the pocket: burnt car W_BARR_XN_CAR seen through the mesh, debris, a toppled trash can
  const car = L.PROPS.find((p) => p.id === 'W_BARR_XN_CAR');
  kit.vehicle({ type: 'sedan', at: [car.x - 0.7, car.z + 0.3], rot: car.rot - 0.05, state: 'burnt', tilt: 0.03, y: -0.08 });   // nudged 0.7 m off SP_W_XN
  kit.debris([-59.5, -30.5], { r: 2.5, count: 14, kinds: ['paper', 'brick', 'brick', 'plank'] });
  kit.prop('metal_trash_can', { at: [-55.4, -31.8], y: SW, rot: 1.2, rz: PI / 2, collide: false });
  trashPile(kit, [-64.8, -32.6], SW, 3);

  // ---------------- south (z 30.6): collapsed facade rubble across the street + a fence line on top; zombie slot at
  // x -64.56..-63.94 (centre -64.25) on the west sidewalk
  const zs = 30.6;
  rubbleRidge(kit, -66.0, -64.56, zs, 1.7, 0.9);
  rubbleRidge(kit, -63.94, -54.0, zs, 2.15, 1.0);
  kit.colBox({ x: (-66 + -64.56) / 2, y: 0, z: zs - 0.15, w: 1.44, h: 2.4, d: 1.3 }, 'concrete');
  kit.colBox({ x: (-63.94 + -54.0) / 2, y: 0, z: zs - 0.15, w: 9.94, h: 2.4, d: 1.3 }, 'concrete');
  kit.colBox({ x: -60, y: 2.4, z: zs, w: 12, h: 4.0, d: 1.2 }, 'concrete');   // BLK_WX_S: player clip above the rubble
  // fallen facade slabs, a bent fire-escape section, timbers and a fence line along the crest
  for (const [x, z, w, h, rot, rx, rz] of [[-61.2, 30.0, 2.4, 1.6, 0.15, -0.95, 0.1], [-57.0, 30.25, 1.9, 1.3, -0.2, -0.7, -0.15], [-65.3, 30.5, 1.2, 1.0, 0.4, -0.6, 0.0]]) {
    kit.at({ x, y: 0.2, z, rot, rx, rz }, () => {
      kit.box({ x: 0, y: 0, z: 0, w, h, d: 0.25, mat: 'brick_red', tint: '#b89a8a' });
      kit.box({ x: 0.2, y: h - 0.3, z: 0.13, w: w * 0.6, h: 0.18, d: 0.06, mat: 'trim_stone', tint: '#c8bfae' });
    });
  }
  kit.at({ x: -59.0, y: 1.4, z: 30.9, rot: 0.25, rz: 0.35 }, () => kit.beam([-1.6, 0, 0], [1.6, 0, 0], { kind: 'I', h: 0.3, w: 0.15, tint: '#5a4a40' }));
  for (const [x, z, r, rz] of [[-62.4, 31.1, 0.6, 0.4], [-55.6, 30.4, -0.5, -0.3], [-58.0, 29.8, 1.2, 0.2]]) kit.at({ x, y: 0.9, z, rot: r, rz }, () => kit.box({ x: 0, y: 0, z: 0, w: 2.6, h: 0.2, d: 0.2, mat: 'wz_wood', tint: '#7a6248' }));
  kit.at({ x: -55.2, y: 0.3, z: 31.2, rot: 0.3, rx: -0.5 }, () => {
    kit.box({ x: 0, y: 0, z: 0, w: 2.2, h: 0.05, d: 1.1, mat: 'steel_dark', tint: '#4a4642' });
    for (let i = 0; i < 4; i++) kit.box({ x: -1.0 + i * 0.66, y: 0.05, z: 0.52, w: 0.04, h: 0.9, d: 0.04, mat: 'steel_dark', tint: '#4a4642' });
    kit.box({ x: 0, y: 0.92, z: 0.52, w: 2.2, h: 0.04, d: 0.04, mat: 'steel_dark', tint: '#4a4642' });
  });
  [[-63.94, -60.6], [-60.6, -57.3], [-57.3, -54.0]].forEach(([a, b], i) => fencePanel(kit, [a, 31.15], [b, 31.15], 2.2, { y: 1.15 + i * 0.1, lean: [0.08, -0.05, 0.1][i], tint: '#9a9ea0', collide: false }));
  fencePanel(kit, [-66.0, 31.15], [-64.56, 31.15], 2.2, { y: 0.95, lean: 0.06, tint: '#9a9ea0', collide: false });
  kit.at({ x: -59.0, y: 2.0, z: 31.0, rot: FACE.N + PI, rz: -0.04 }, () => quarantineSign(kit, 1.8, 1.05));
  kit.at({ x: -60.2, y: 1.6, z: 30.2, rot: FACE.S, rx: -0.2 }, () => quarantineSign(kit, 1.4, 0.82));
  kit.debris([-60.0, 29.3], { r: 2.6, count: 22, kinds: ['brick', 'brick', 'brick', 'chunk', 'plank'] });
  kit.debris([-64.25, 30.6], { r: 0.9, count: 6, kinds: ['brick', 'paper'], y: SW });
  for (const [x, z, f] of [[-62.0, 28.6, true], [-57.6, 28.9, false]]) kit.cone([x, z], { fallen: f });
  kit.prop('concrete_road_barrier_02', { at: [-62.3, 28.9], rot: 0.12 });
  kit.prop('concrete_road_barrier_02', { at: [-57.3, 29.0], rot: -0.2 });
  // the pocket behind: dumpster on its side, trash
  trashPile(kit, [-58.0, 35.6], 0, 3);
  kit.debris([-61.0, 34.0], { r: 2.4, count: 12, kinds: ['paper', 'brick', 'brick'] });
}
/** Construction fence panel between two ground points [x, z]: tube frame, chain-link mesh, concrete feet. */
function fencePanel(kit, a, b, h, o = {}) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), rot = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
  const y = o.y ?? 0, tint = o.tint || '#a3a7a8';
  kit.at({ x: a[0], y, z: a[1], rot }, () => {
    for (const s of o.feet || [0.12, L - 0.12]) {
      kit.box({ x: s, y: 0, z: 0, w: 0.62, h: 0.14, d: 0.22, mat: 'trim_concrete', tint: '#a8a49a' });
      kit.box({ x: s, y: 0.14, z: 0, w: 0.2, h: 0.02, d: 0.12, mat: 'steel_dark' });
    }
    kit.at({ rz: o.lean || 0 }, () => {
      kit.at({ rx: o.lean ? o.lean * 0.6 : 0 }, () => {
        const f = [[0.08, 0.16, 0], [L - 0.08, 0.16, 0], [L - 0.08, h, 0], [0.08, h, 0], [0.08, 0.16, 0]];
        kit.sweep(circle(0.022, 6), f, 'steel', { smooth: true, tint });
        kit.sweep(circle(0.016, 6), [[0.08, h * 0.55, 0], [L - 0.08, h * 0.55, 0]], 'steel', { smooth: true, tint });
        kit.face([[0.1, 0.18, 0], [L - 0.1, 0.18, 0], [L - 0.1, h - 0.02, 0], [0.1, h - 0.02, 0]], 'chainlink', { uvs: [[0, 0.18], [L, 0.18], [L, h], [0, h]] });
        for (const s of [0.08, L - 0.08]) kit.box({ x: s, y: h - 0.08, z: 0.04, w: 0.08, h: 0.12, d: 0.06, mat: 'steel_dark' });
      });
    });
    if (o.collide !== false) kit.colBox({ x: L / 2, y: -y, z: 0, w: L, h: h + y + 0.05, d: 0.16 }, 'metal');
  });
}
/** Wooden sawhorse (local frame: x along, centred), stripes. */
function sawhorse(kit, w) {
  for (const s of [-w / 2 + 0.15, w / 2 - 0.15]) for (const zz of [-0.18, 0.18]) kit.at({ x: s, y: 0, z: zz, rx: zz < 0 ? 0.3 : -0.3 }, () => kit.box({ x: 0, y: 0, z: 0, w: 0.06, h: 1.12, d: 0.05, mat: 'wz_wood', tint: '#b8a68a' }));
  kit.box({ x: 0, y: 0.95, z: 0, w, h: 0.2, d: 0.04, mat: 'reflective_white', tint: '#e2ddd2' });
  for (let i = 0; i < 4; i++) kit.at({ x: -w / 2 + 0.25 + i * (w - 0.5) / 3, y: 1.05, z: 0.025, rz: 0.7 }, () => kit.box({ x: 0, y: -0.1, z: 0, w: 0.09, h: 0.24, d: 0.004, mat: 'sign_white', tint: '#c03a2a' }));
}
/** QUARANTINE ZONE 檢疫區 / NO ENTRY 禁止進入 board (local frame, faces +z, bottom-centre at origin). */
function quarantineSign(kit, w, h) {
  const zf = board(kit, -w / 2, w / 2, 0, h, { mat: 'sign_white', tint: '#e6e1d4', d: 0.03, border: { mat: 'sign_white', tint: '#b8382a', w: 0.04, inset: 0.04 } });
  flat(kit, rect2(-w / 2 + 0.08, h * 0.56, w / 2 - 0.08, h - 0.08), zf, 'sign_white', { tint: '#b8382a' });
  textLine(kit, 'QUARANTINE ZONE', { font: 'sans', h: h * 0.13, x: 0, y: h * 0.7, z: zf + 0.002, align: 'center', mat: 'wz_paint_white', maxW: w - 0.25 });
  textLine(kit, '檢疫區', { font: 'cjk', h: h * 0.1, x: 0, y: h * 0.6, z: zf + 0.002, align: 'center', mat: 'wz_paint_white', maxW: w - 0.25 });
  textLine(kit, 'NO ENTRY', { font: 'sans', h: h * 0.15, x: 0, y: h * 0.3, z: zf, align: 'center', mat: 'wz_paint_red', maxW: w - 0.25 });
  textLine(kit, '禁止進入', { font: 'cjk', h: h * 0.11, x: 0, y: h * 0.12, z: zf, align: 'center', mat: 'wz_paint', maxW: w - 0.25 });
  for (const s of [-1, 1]) kit.sweep(circle(0.006, 4), [[s * (w / 2 - 0.1), h - 0.05, zf], [s * (w / 2 - 0.05), h + 0.1, -0.02]], 'wire', { smooth: true });
}
/** Rubble ridge across x0..x1 centred on z (pocket side +z): irregular mound faces + chunks; visual only. */
function rubbleRidge(kit, x0, x1, zc, h, depth) {
  const n = Math.max(2, Math.round((x1 - x0) / 0.7));
  const prof = [];
  for (let i = 0; i <= n; i++) {
    const x = lerp(x0, x1, i / n), end = i === 0 || i === n;
    const hh = end ? h * 0.55 : h * kit.rnd(0.72, 1.05);
    prof.push({ x, y: x < -63.5 ? SW : 0, top: hh, f: depth * kit.rnd(0.9, 1.25), b: depth * kit.rnd(0.9, 1.3), zt: zc + kit.rnd(-0.15, 0.15) });
  }
  for (let i = 0; i < n; i++) {
    const p = prof[i], q = prof[i + 1];
    const rows = (s) => [[s.x, s.y, zc - s.f - 0.25], [s.x, s.y + s.top * 0.45, zc - s.f * 0.55], [s.x, s.y + s.top, s.zt], [s.x, s.y + s.top * 0.5, zc + s.b * 0.55], [s.x, s.y, zc + s.b + 0.2]];
    const A = rows(p), B = rows(q);
    for (let r = 0; r < 4; r++) kit.face([A[r], A[r + 1], B[r + 1], B[r]], 'rubble', { tint: kit.pick(['#ffffff', '#e8e0d6', '#d6ccc0']) });
  }
  for (const s of [prof[0], prof[n]]) {
    const R = [[s.x, s.y, zc - s.f - 0.25], [s.x, s.y + s.top * 0.45, zc - s.f * 0.55], [s.x, s.y + s.top, s.zt], [s.x, s.y + s.top * 0.5, zc + s.b * 0.55], [s.x, s.y, zc + s.b + 0.2]];
    kit.face(s === prof[0] ? R.slice().reverse() : R, 'rubble', {});
  }
  for (let i = 0; i < Math.round((x1 - x0) * 1.6); i++) {
    const x = kit.rnd(x0 + 0.2, x1 - 0.2), u = kit.rnd(-1, 1);
    const z = zc + (u < 0 ? u * (depth + 0.25) : u * (depth + 0.2)), y = (x < -63.5 ? SW : 0) + h * 0.85 * Math.pow(1 - Math.abs(u), 0.9) - 0.1;
    kit.bbox({ x, y, z, rot: kit.rnd(0, 6), rx: kit.rnd(-0.4, 0.4), w: kit.rnd(0.25, 0.7), h: kit.rnd(0.12, 0.3), d: kit.rnd(0.2, 0.5), bevel: 0.04, mat: kit.pick(['concrete_wall', 'brick_red', 'brick_red']), tint: kit.pick(['#9c968c', '#b49888', '#98847a']) });
  }
}

// ==================================================================================================== LM_LED gantry
// 5x7 LED font (our own) and the 16 px CJK raster (LED, end of file). Panel frame: kit.at({ x: -69.0, rot: FACE.E })
// -> local x = world -z (reads left -> right from the fort), local y = world y, local +z = towards the fort.
const LED5 = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
  '!': ['#', '#', '#', '#', '#', '.', '#'],
  ' ': ['...', '...', '...', '...', '...', '...', '...'],
};
function ledWidth(str, font) { let n = 0; for (const ch of str) n += font[ch][0].length + 1; return n - 1; }
/** Emits lit dots for a bitmap string; x0/yTop in panel-local metres, p = pitch, d = dot size. */
function ledDots(kit, str, font, x0, yTop, p, d, mat, round) {
  let col = 0;
  const oct = circle(d / 2, 8);
  for (const ch of str) {
    const rows = font[ch];
    for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) {
      if (rows[r][c] !== '#') continue;
      const cx = x0 + (col + c) * p, cy = yTop - r * p;
      if (round) flat(kit, oct.map(([a, b]) => [cx + a, cy + b]), 0.006, mat);
      else flat(kit, rect2(cx - d / 2, cy - d / 2, cx + d / 2, cy + d / 2), 0.006, mat);
    }
    col += rows[0].length + 1;
  }
}
function ledGantry(kit, L) {
  const G = L.LANDMARKS.ledGantry;
  const X = G.x, PS = G.postSize, PH = G.postH, [by0, by1] = G.beamY;
  const P = G.panel;
  const RUST = '#7a4a38';
  // ---- lattice towers on concrete footings (sidewalks), maintenance ladder + junction box on the south tower
  for (const [px, pz] of G.posts) {
    kit.box({ x: px, y: SW, z: pz, w: PS + 0.4, h: 0.55, d: PS + 0.4, mat: 'trim_concrete', tint: '#9a968c', grime: { y: 0, h: 0.6, k: 0.3 } });
    latticeTower(kit, px, pz, PS, SW + 0.55, PH, RUST);
    kit.colBox({ x: px, y: 0, z: pz, w: PS + 0.4, h: PH, d: PS + 0.4 }, 'metal');
  }
  kit.at({ x: X + PS / 2 + 0.18, y: 0, z: 8.0 }, () => {
    for (const s of [-0.2, 0.2]) kit.box({ x: 0, y: 3.2, z: s, w: 0.04, h: PH - 3.4, d: 0.04, mat: 'steel_dark', tint: '#5a4a42' });
    for (let y = 3.4; y < PH - 0.3; y += 0.3) kit.box({ x: 0, y, z: 0, w: 0.025, h: 0.025, d: 0.4, mat: 'steel_dark', tint: '#5a4a42' });
    kit.box({ x: 0.05, y: 3.3, z: -0.65, w: 0.25, h: 0.6, d: 0.45, mat: 'paint_metal', tint: '#7d8478' });
    kit.sweep(circle(0.03, 6), [[0.05, 3.9, -0.65], [0.05, by0 - 0.2, -0.65], [-0.2, by0, -1.4]], 'rubber', { smooth: true, up: [1, 0, 0] });
  });
  // ---- truss beam between the towers (y 11.6..12.4, 0.8 deep): chords, verticals, zig-zag diagonals
  const zA = G.posts[0][1] - PS / 2, zB = G.posts[1][1] + PS / 2, xF = X + 0.4, xB = X - 0.4;
  for (const x of [xF, xB]) for (const y of [by0, by1]) kit.beam([x, y, zA], [x, y, zB], { kind: 'box', h: 0.12, w: 0.12, tint: RUST });
  const nb = 14;
  for (let i = 0; i <= nb; i++) {
    const z = lerp(zA, zB, i / nb);
    for (const x of [xF, xB]) kit.beam([x, by0, z], [x, by1, z], { kind: 'box', h: 0.06, w: 0.06, tint: RUST, up: [1, 0, 0] });
    kit.beam([xF, by1, z], [xB, by1, z], { kind: 'box', h: 0.05, w: 0.05, tint: RUST });
    kit.beam([xF, by0, z], [xB, by0, z], { kind: 'box', h: 0.05, w: 0.05, tint: RUST });
    if (i < nb) { const z2 = lerp(zA, zB, (i + 1) / nb); for (const x of [xF, xB]) kit.beam([x, i % 2 ? by0 : by1, z], [x, i % 2 ? by1 : by0, z2], { kind: 'box', h: 0.045, w: 0.045, tint: RUST, up: [1, 0, 0] }); }
  }
  // ---- the panel: cabinet, border, dark display face with module seams, lit dots, hangers, a service walkway
  const [pz0, pz1] = P.z, [py0, py1] = P.y, W = pz1 - pz0, fx = P.faceX;
  kit.at({ x: fx, y: 0, z: 0, rot: FACE.E }, () => {
    const hw = W / 2;
    kit.box({ x: 0, y: py0, z: -0.28, w: W, h: py1 - py0, d: 0.5, mat: 'paint_metal', tint: '#3b3c39', faces: { pz: false }, collide: 'metal' });
    // border frame + face
    for (const [x0, y0, x1, y1] of [[-hw, py0, hw, py0 + 0.1], [-hw, py1 - 0.1, hw, py1], [-hw, py0 + 0.1, -hw + 0.12, py1 - 0.1], [hw - 0.12, py0 + 0.1, hw, py1 - 0.1]]) kit.box({ x: (x0 + x1) / 2, y: y0, z: -0.03 + 0.03, w: x1 - x0, h: y1 - y0, d: 0.06, mat: 'paint_metal', tint: '#4a4b47' });
    flat(kit, rect2(-hw + 0.12, py0 + 0.1, hw - 0.12, py1 - 0.1), 0.0, 'frame_dark', { tint: '#151514' });
    for (let x = -hw + 0.12 + 0.72; x < hw - 0.2; x += 0.72) flat(kit, rect2(x - 0.008, py0 + 0.1, x + 0.008, py1 - 0.1), 0.002, 'steel_dark', { tint: '#2c2b29' });
    for (let y = py0 + 0.1 + 0.48; y < py1 - 0.15; y += 0.48) flat(kit, rect2(-hw + 0.12, y - 0.008, hw - 0.12, y + 0.008), 0.002, 'steel_dark', { tint: '#2c2b29' });
    // LEAVE TOWN / NOW!! in amber (pitch 0.14), the 封城中 立即撤離 ticker in red underneath (pitch 0.036)
    const p = 0.14, d = 0.1;
    const l1 = 'LEAVE TOWN', l2 = 'NOW!!';
    const top1 = py1 - 0.32;
    ledDots(kit, l1, LED5, -((ledWidth(l1, LED5) - 1) * p) / 2, top1, p, d, 'lamp_amber', true);
    ledDots(kit, l2, LED5, -((ledWidth(l2, LED5) - 1) * p) / 2, top1 - 10 * p, p, d, 'lamp_amber', true);
    const pt = 0.036, tick = '封城中 立即撤離';
    const font16 = { ...LED, ' ': Array(16).fill('.'.repeat(8)) };
    ledDots(kit, tick, font16, -((ledWidth(tick, font16) - 1) * pt) / 2, py0 + 0.2 + 15 * pt, pt, pt * 0.78, 'lamp_red', false);
    // side marker chevrons (amber) flanking the main lines
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const cx = s * (hw - 0.75 - i * 0.36), cy = top1 - 13 * p;
      for (let k = -3; k <= 3; k++) flat(kit, circle(d / 2, 8).map(([a, b]) => [cx - s * Math.abs(k) * p * 0.6 + a, cy + k * p + b]), 0.006, 'lamp_amber');
    }
    // hangers to the truss, cable, a service walkway with a rail along the bottom
    for (const x of [-hw + 0.6, -1.5, 1.5, hw - 0.6]) kit.beam([x, py1, -0.28], [x, by0, -0.28], { kind: 'box', h: 0.06, w: 0.06, tint: '#4a4b47', up: [1, 0, 0] });
    kit.box({ x: 0, y: py0 - 0.06, z: 0.25, w: W + 0.2, h: 0.04, d: 0.6, mat: 'grate', tint: '#8a8a86' });
    for (const x of [-hw, -hw / 2, 0, hw / 2, hw]) kit.beam([x, py0 - 0.06, -0.3], [x, py0 - 0.06, 0.55], { kind: 'L', h: 0.07, w: 0.07, t: 0.008, tint: '#4a4b47' });
    for (const x of [-hw - 0.05, hw + 0.05]) kit.box({ x, y: py0 - 0.04, z: 0.53, w: 0.04, h: 0.95, d: 0.04, mat: 'steel_dark', tint: '#4a4b47' });
    kit.box({ x: 0, y: py0 + 0.86, z: 0.53, w: W + 0.12, h: 0.04, d: 0.04, mat: 'steel_dark', tint: '#4a4b47' });
    kit.box({ x: 0, y: py0 + 0.44, z: 0.53, w: W + 0.12, h: 0.03, d: 0.03, mat: 'steel_dark', tint: '#4a4b47' });
    // green road sign under the panel: HARBOR RD → / 港口路
    const [sy0, sy1] = G.roadSign.y, [sz0, sz1] = G.roadSign.z, sw = sz1 - sz0;
    for (const x of [-sw / 2 + 0.3, sw / 2 - 0.3]) kit.box({ x, y: sy1 - 0.02, z: 0.05, w: 0.035, h: py0 - 0.06 - sy1 + 0.04, d: 0.035, mat: 'steel_dark' });
    kit.at({ y: 0, z: 0.1, rz: 0.015 }, () => {
      const zs = board(kit, -sw / 2, sw / 2, sy0, sy1 - sy0, { mat: 'sign_white', tint: '#3f7d52', d: 0.04, border: { mat: 'sign_white', tint: '#e8e8e0', w: 0.03, inset: 0.05 } });
      textLine(kit, 'HARBOR RD →', { font: 'hwy', h: 0.3, x: 0, y: sy0 + 0.52, z: zs, align: 'center', mat: 'wz_paint_white', maxW: sw - 0.3 });
      textLine(kit, '港口路', { font: 'cjk', h: 0.27, x: 0, y: sy0 + 0.13, z: zs, align: 'center', mat: 'wz_paint_white', maxW: sw - 0.3 });
    });
  });
  ledBarricade(kit, L);
}
/** Square lattice tower (angle legs, girts, zig-zag lacing on every face) from y0 to y1 centred at (x, z). */
function latticeTower(kit, x, z, s, y0, y1, tint) {
  const h = s / 2 - 0.05;
  const C = [[-h, -h], [h, -h], [h, h], [-h, h]];
  for (const [cx, cz] of C) kit.beam([x + cx, y0, z + cz], [x + cx, y1, z + cz], { kind: 'box', h: 0.1, w: 0.1, tint, up: [1, 0, 0] });
  const n = Math.round((y1 - y0) / 1.15);
  for (let i = 0; i <= n; i++) {
    const y = lerp(y0, y1, i / n);
    for (let k = 0; k < 4; k++) { const a = C[k], b = C[(k + 1) % 4]; kit.beam([x + a[0], y, z + a[1]], [x + b[0], y, z + b[1]], { kind: 'box', h: 0.06, w: 0.06, tint }); }
    if (i < n) {
      const y2 = lerp(y0, y1, (i + 1) / n);
      for (let k = 0; k < 4; k++) { const a = C[k], b = C[(k + 1) % 4]; const [p, q] = i % 2 ? [a, b] : [b, a]; kit.beam([x + p[0], y, z + p[1]], [x + q[0], y2, z + q[1]], { kind: 'box', h: 0.04, w: 0.04, tint, up: [0, 1, 0] }); }
    }
  }
  kit.box({ x, y: y1, z, w: s + 0.1, h: 0.12, d: s + 0.1, mat: 'steel_dark', tint: shadeHex(tint, 0.8) });
}
/** LED barricade: crate walls (2 high), the olive container end-on with its doors to the fort, the zombie slot. */
function ledBarricade(kit, L) {
  const B = L.LANDMARKS.ledGantry.barricade, [bx0, bx1] = B.x;
  const cont = B.parts.find((p) => p.kind === 'container20');
  const yAt = (z) => (Math.abs(z) > 5.5 ? SW : 0);
  // crate walls: north z -9..-3.2 (tower footing at z -8), south z 1.22..9 (tower at z 8); front row detailed
  const xF = bx1 - 0.64, xBk = bx0 + 0.64;
  const slotsN = [-6.45, -5.15, -3.85], slotsS = [1.87, 3.17, 4.47, 5.77];
  for (const slots of [slotsN, slotsS]) slots.forEach((zc, i) => {
    for (let j = 0; j < 2; j++) {
      const y = yAt(zc) + j * 1.3, end = i === 0 || i === slots.length - 1;
      crate(kit, [xF + kit.rnd(-0.05, 0.05) + (j ? kit.rnd(-0.1, 0.06) : 0), y, zc + kit.rnd(-0.03, 0.03)], kit.rnd(-0.05, 0.05), false, j, end);
    }
  });
  for (const [z0, z1] of [[-9.0, -3.21], [1.22, 9.0]]) kit.box({ x: xBk - 0.02, y: 0, z: (z0 + z1) / 2, w: 1.24, h: 2.6 + SW, d: z1 - z0, mat: 'wz_wood', tint: '#a48c66', faces: { bottom: false, px: false, pz: false, nz: false } });
  // around the towers: sandbag walls and a pallet stack
  kit.sandbags([[bx1 - 0.2, -8.95], [bx1 - 0.2, -7.1]], { rows: 6, y: SW });
  kit.sandbags([[bx1 - 0.2, 6.5], [bx1 - 0.2, 8.95]], { rows: 6, y: SW });
  for (let i = 0; i < 9; i++) kit.at({ x: bx1 - 0.7, y: SW + i * 0.145, z: 6.75 + kit.rnd(-0.03, 0.03), rot: PI / 2 + kit.rnd(-0.04, 0.04) }, () => pallet(kit, true));
  kit.colBox({ x: (bx0 + bx1) / 2, y: 0, z: (-9 + -3.2) / 2, w: bx1 - bx0, h: 2.6 + SW, d: 5.8 }, 'wood');
  kit.colBox({ x: (bx0 + bx1) / 2, y: 0, z: (1.22 + 9) / 2, w: bx1 - bx0, h: 2.6 + SW, d: 9 - 1.22 }, 'wood');
  // the container, olive-grey, doors to the fort, chained; spray paint 封城中 / NO ENTRY
  kit.container({ at: [cont.x, cont.z], rot: 0, size: 20, tint: '#a3aa84', doors: 'closed' });
  kit.at({ x: cont.x + cont.w / 2 - 0.0, y: 0, z: 0, rot: FACE.E }, () => {
    textLine(kit, '封城中', { font: 'cjk', h: 0.42, x: 0, y: 1.5, z: 0.012, align: 'center', mat: 'wz_paint_red', maxW: 2.1 });
    textLine(kit, 'NO ENTRY', { font: 'sans', h: 0.3, x: 0, y: 0.72, z: 0.012, align: 'center', mat: 'wz_paint_white', italic: 0.12, maxW: 2.0 });
    for (let i = 0; i <= 8; i++) {
      const t = i / 8, xx = -0.42 + 0.84 * t, yy = 1.28 - Math.sin(t * PI) * 0.12;
      kit.at({ x: xx, y: yy, z: 0.07, rz: i % 2 ? PI / 2 : 0 }, () => kit.box({ x: 0, y: -0.018, z: 0, w: 0.05, h: 0.036, d: 0.012, mat: 'steel', tint: '#7d7a72' }));
    }
    kit.box({ x: 0, y: 1.1, z: 0.09, w: 0.07, h: 0.09, d: 0.035, mat: 'car_chrome', tint: '#8a7a50' });
    textLine(kit, 'LTX 509127 3', { font: 'sans', h: 0.1, x: -0.7, y: 2.1, z: 0.012, align: 'center', mat: 'wz_paint', shade: 0.7 });
    streaks(kit, -1.1, 1.0, 2.45, 5, 0.008, [0.6, 1.6]);
  });
  // the zombie slot z -2.56..-1.94 (centre -2.25): a crate fallen against the north wall + planks nailed to the
  // container corner narrow the 2 m gap; torn tarp over it
  kit.at({ x: bx1 - 0.7, y: 0, z: -3.22, rot: 0.08, rx: -0.42 }, () => crate(kit, [0, 0, 0], 0, false, 1));
  kit.colBox({ x: (bx0 + bx1) / 2, y: 0, z: (-3.2 + -2.56) / 2, w: bx1 - bx0, h: 2.6, d: 0.64 }, 'wood');
  for (const [x, z] of [[bx1 - 0.55, -1.7], [bx1 - 1.75, -1.62]]) kit.at({ x, y: 0, z, rot: 0, rx: 0.03 }, () => pallet(kit));
  kit.box({ x: bx1 - 1.2, y: 1.95, z: -1.62, w: 2.3, h: 0.66, d: 0.02, mat: 'wz_wood', tint: '#b89c74' });
  for (const x of [bx1 - 0.3, bx1 - 1.2, bx1 - 2.0]) kit.box({ x, y: 0.05, z: -1.58, w: 0.12, h: 2.5, d: 0.04, mat: 'wz_wood', tint: '#a88c64' });
  kit.colBox({ x: (bx0 + bx1) / 2, y: 0, z: (-1.94 + -1.22) / 2, w: bx1 - bx0, h: 2.6, d: 0.72 }, 'wood');
  kit.face([[bx1 + 0.02, 2.62, -2.6], [bx1 + 0.02, 2.62, -1.9], [bx1 + 0.06, 1.6, -2.0], [bx1 + 0.08, 1.0, -2.3], [bx1 + 0.05, 1.5, -2.55]], 'wz_fabric', { tint: '#5d6650' });
  kit.face([[bx1 + 0.05, 1.5, -2.55], [bx1 + 0.08, 1.0, -2.3], [bx1 + 0.06, 1.6, -2.0], [bx1 + 0.02, 2.62, -1.9], [bx1 + 0.02, 2.62, -2.6]], 'wz_fabric', { tint: '#4c5442', shade: 0.7 });
  // BLK_W_TOP: player clip over the whole barricade (from its top, never touching the nav grid)
  const top = L.BLOCKERS.find((b) => b.id === 'BLK_W_TOP').box;
  kit.colBox({ x: top.x, y: top.y + SW, z: top.z, w: top.w, h: top.h, d: top.d }, 'wood');
  // in front: ROAD CLOSED sawhorses, cones, sandbags, a burning barrel; QUARANTINE board on the crates
  kit.at({ x: -67.2, y: 0, z: 3.6, rot: PI / 2 - 0.1 }, () => {
    sawhorse(kit, 1.8);
    const zf = board(kit, -0.8, 0.8, 0.62, 0.32, { mat: 'sign_white', tint: '#e6e2d8', d: 0.02, z: 0.04 });
    textLine(kit, 'ROAD CLOSED', { font: 'sans', h: 0.15, x: 0, y: 0.7, z: zf, align: 'center', mat: 'wz_paint_red', maxW: 1.4 });
  });
  kit.at({ x: -66.9, y: 0, z: -4.6, rot: PI / 2 + 0.25 }, () => sawhorse(kit, 1.6));
  for (const [x, z, f] of [[-66.6, -1.9, false], [-66.0, 1.6, true], [-66.5, 5.1, false], [-65.2, -3.8, false]]) kit.cone([x, z], { fallen: f });
  kit.sandbags([[bx1 + 0.3, -5.4], [bx1 + 0.3, -3.4]], { rows: 3 });
  kit.sandbags([[bx1 + 0.3, 1.6], [bx1 + 0.3, 5.2]], { rows: 3 });
  kit.at({ x: bx1 + 0.02, y: 1.05, z: 4.2, rot: FACE.E }, () => quarantineSign(kit, 1.6, 0.94));
  kit.prop('Barrel_01', { at: [-67.7, 7.0], y: SW, rot: 0.4, collide: true });
  kit.at({ x: -67.7, y: SW + 0.82, z: 7.0 }, () => {
    kit.cyl({ x: 0, y: 0, z: 0, r: 0.25, h: 0.02, seg: 10, mat: 'lamp_amber' });
    for (let i = 0; i < 5; i++) kit.box({ x: kit.rnd(-0.12, 0.12), y: 0.02, z: kit.rnd(-0.12, 0.12), w: 0.35, h: 0.04, d: 0.05, rot: kit.rnd(0, 3), rz: kit.rnd(-0.3, 0.3), mat: 'car_burnt', tint: '#2a2622' });
  });
  kit.light({ pos: [-67.7, SW + 1.4, 7.0], color: '#ff9442', intensity: 7, range: 7, radius: 0.25, name: 'barrel_glow' });
  kit.decal({ at: [-67.7, 7.0], size: 1.6, rot: 0.3, mat: 'decal_stain', y: SW });
  // pocket behind (x -76..-71.1): trash, a toppled dumpster, newspapers (seen through the slot only)
  trashPile(kit, [-74.5, -6.5], SW, 3);
  trashPile(kit, [-73.5, 4.5], 0, 3);
  kit.debris([-73.8, 0.5], { r: 2.2, count: 12, kinds: ['paper', 'plank', 'brick'] });
}
/** 1.3 m wooden crate (planked sides + dark battens + stencil). back = plain (hidden row). */
function crate(kit, at, rot, back, layer = 0, end = true) {
  kit.at({ x: at[0], y: at[1], z: at[2], rot }, () => {
    const s = 1.28, t = kit.pick(['#bfa47a', '#b49a70', '#c8ae84', '#a99064']);
    kit.box({ x: 0, y: 0, z: 0, w: s, h: s, d: s, mat: 'wz_wood', tint: t, uvOffset: [kit.rnd(0, 3), kit.rnd(0, 3)], faces: { bottom: false, nx: false, top: layer === 1 ? undefined : false, pz: end ? undefined : false, nz: end ? undefined : false } });
    if (back) return;
    // battens on the face towards the fort (+x) and on top
    const bt = shadeHex(t, 0.72);
    for (const [z, y, w, h] of [[0, 0.02, s + 0.02, 0.1], [0, s - 0.12, s + 0.02, 0.1]]) kit.box({ x: s / 2 + 0.02, y, z, w: 0.04, h, d: w, mat: 'wz_wood', tint: bt });
    for (const z of [-s / 2 + 0.05, s / 2 - 0.05]) kit.box({ x: s / 2 + 0.02, y: 0.02, z, w: 0.04, h: s - 0.04, d: 0.1, mat: 'wz_wood', tint: bt });
    kit.at({ x: s / 2 + 0.045, y: s / 2, z: 0, rx: kit.chance(0.5) ? 0.78 : -0.78 }, () => kit.box({ x: 0, y: -0.05, z: 0, w: 0.03, h: 0.1, d: 1.45, mat: 'wz_wood', tint: shadeHex(t, 0.8) }));
    kit.at({ x: s / 2 + 0.004, y: 0, z: 0, rot: FACE.E }, () => {
      if (kit.chance(0.65)) textLine(kit, kit.pick(['FRAGILE', 'THIS SIDE UP', 'LT-07', 'NO HOOKS', 'KEEP DRY', 'HARBOR RD']), { font: 'sans', h: 0.075, x: kit.rnd(-0.2, 0.2), y: kit.rnd(0.85, 1.05), z: 0, align: 'center', mat: 'wz_paint', shade: 0.6, maxW: 0.9 });
      if (kit.chance(0.35)) textLine(kit, kit.pick(['UN 1203', '20-A', 'CF-2']), { font: 'hwy', h: 0.11, x: kit.rnd(-0.25, 0.25), y: 0.3, z: 0, align: 'center', mat: 'wz_paint_red', shade: 0.7 });
    });
  });
}
/** Wooden pallet standing on its long edge (local frame: x along), or lying flat. */
function pallet(kit, flatPallet) {
  const t = '#c9b08a';
  if (flatPallet) {
    for (let i = 0; i < 7; i++) kit.box({ x: -0.5 + i * 0.165, y: 0.12, z: 0, w: 0.1, h: 0.02, d: 1.2, mat: 'wz_wood', tint: t });
    for (const z of [-0.55, 0, 0.55]) kit.box({ x: 0, y: 0, z, w: 1.0, h: 0.12, d: 0.09, mat: 'wz_wood', tint: shadeHex(t, 0.8) });
    return;
  }
  for (let i = 0; i < 6; i++) kit.box({ x: 0, y: 0.05 + i * 0.36, z: 0.0, w: 1.0, h: 0.1, d: 0.02, mat: 'wz_wood', tint: t });
  for (const x of [-0.45, 0, 0.45]) kit.box({ x, y: 0, z: -0.06, w: 0.09, h: 1.95, d: 0.1, mat: 'wz_wood', tint: shadeHex(t, 0.8) });
}
/** Trash heap: one Poly Haven bag, low-poly bags and cardboard, loose paper. */
function trashPile(kit, at, y, n, hero = false) {
  for (let i = 0; i < n; i++) {
    const p = [at[0] + kit.rnd(-0.8, 0.8), at[1] + kit.rnd(-0.6, 0.6)], r = kit.rnd(0, 6.28);
    if (i === 0 && hero && kit.hasProp('trashbag')) kit.prop('trashbag', { at: p, rot: r, y, scale: kit.rnd(0.9, 1.15), collide: false });
    else if (kit.chance(0.72)) {
      const s = kit.rnd(0.8, 1.15);
      kit.bbox({ x: p[0], y, z: p[1], rot: r, w: 0.55 * s, h: 0.48 * s, d: 0.45 * s, bevel: 0.13 * s, mat: 'car_plastic', tint: kit.pick(['#1c1d1b', '#222a22', '#2b2a24', '#3a3a34']), taper: { top: [0.55, 0.62] } });
      kit.cyl({ x: p[0], y: y + 0.46 * s, z: p[1], r: 0.05, r2: 0.015, h: 0.1, seg: 5, mat: 'car_plastic', tint: '#1c1d1b' });
    } else kit.box({ x: p[0], y, z: p[1], rot: r, w: kit.rnd(0.3, 0.55), h: kit.rnd(0.18, 0.38), d: kit.rnd(0.25, 0.45), mat: 'sign_white', tint: kit.pick(['#b8925e', '#a88452', '#c4a272']) });
  }
  kit.debris(at, { r: 1.2, count: 5, kinds: ['paper', 'paper', 'plank'], y });
}
/** Steel dumpster with sloped lid (one half open), side pockets and casters (long side = local x). */
function dumpster(kit, at, rot, y) {
  kit.at({ x: at[0], y, z: at[1], rot }, () => {
    const tint = '#3f5f7a';
    kit.bbox({ x: 0, y: 0.12, z: 0, w: 1.9, h: 1.05, d: 1.2, bevel: 0.04, mat: 'paint_metal', tint, taper: { top: [1.0, 1.06] } });
    kit.box({ x: 0, y: 1.0, z: -0.05, w: 1.98, h: 0.1, d: 1.36, mat: 'paint_metal', tint: shadeHex(tint, 0.85) });
    kit.at({ x: -0.48, y: 1.13, z: -0.62, rx: -0.12 }, () => kit.box({ x: 0, y: 0, z: 0.64, w: 0.92, h: 0.04, d: 1.28, mat: 'car_plastic', tint: '#222322' }));
    kit.at({ x: 0.48, y: 1.13, z: -0.62, rx: -1.9 }, () => kit.box({ x: 0, y: 0, z: 0.64, w: 0.92, h: 0.04, d: 1.28, mat: 'car_plastic', tint: '#222322' }));
    for (const sx of [-0.8, 0.8]) for (const sz of [-0.45, 0.45]) kit.cyl({ x: sx, y: 0, z: sz, r: 0.06, h: 0.12, seg: 8, mat: 'rubber' });
    for (const s of [-1, 1]) kit.box({ x: s * 0.99, y: 0.6, z: 0, w: 0.1, h: 0.18, d: 0.9, mat: 'paint_metal', tint: shadeHex(tint, 0.8) });
    kit.colBox({ x: 0, y: 0, z: 0, w: 1.95, h: 1.3, d: 1.3 }, 'metal');
    for (const s of [-1, 1]) kit.at({ x: 0, y: 0, z: s * 0.635, rot: s > 0 ? 0 : PI }, () => textLine(kit, 'CITY WASTE 7', { font: 'sans', h: 0.09, x: 0, y: 0.75, z: 0, align: 'center', mat: 'wz_paint_white', shade: 0.7 }));
  });
}

// ==================================================================================================== hero truck
/** W_TRUCK: white cab-over box truck mid-street, cab to the fort (local +x = front), roll-up door half open. */
function heroTruck(kit, L) {
  const T = L.PROPS.find((p) => p.id === 'W_TRUCK');
  const WHITE = '#d9d7cf', BOXW = '#e6e4dc';
  kit.decal({ at: [T.x - 0.5, T.z], size: [6.0, 2.8], rot: -T.rot, mat: 'decal_stain' });
  kit.at({ x: T.x, y: 0, z: T.z, rot: T.rot }, () => {
    const grime = { y: 0, h: 1.4, k: 0.45 };
    // ---- chassis rails, cross members, fuel tank, battery box, exhaust
    for (const z of [-0.45, 0.45]) kit.box({ x: -0.15, y: 0.72, z, w: 7.7, h: 0.24, d: 0.09, mat: 'steel_dark', tint: '#2e2c2a' });
    for (const x of [-3.6, -1.2, 1.0, 3.3]) kit.box({ x, y: 0.75, z: 0, w: 0.1, h: 0.16, d: 0.9, mat: 'steel_dark', tint: '#2e2c2a' });
    kit.at({ x: 0.6, y: 0.78, z: -0.95, rz: PI / 2 }, () => kit.cyl({ x: 0, y: -0.6, z: 0, r: 0.27, h: 1.2, seg: 12, mat: 'steel', tint: '#a8aaa6' }));
    kit.box({ x: 0.55, y: 0.5, z: 0.95, w: 0.7, h: 0.5, d: 0.45, mat: 'car_plastic', tint: '#262626' });
    kit.cyl({ x: 1.95, y: 0.6, z: -1.08, r: 0.07, h: 2.5, seg: 8, mat: 'steel', tint: '#6d6a64' });
    // ---- wheels: front single, rear dual; the front left tyre is flat
    const tyre = (x, z, r, w, flatK = 1) => kit.at({ x, y: r * flatK, z, rx: PI / 2 }, () => {
      kit.cyl({ x: 0, y: -w / 2, z: 0, r, h: w, seg: 18, mat: 'rubber', bottom: true });
      const s = z > 0 ? 1 : -1;
      kit.cyl({ x: 0, y: s > 0 ? w / 2 - 0.01 : -w / 2 - 0.012, z: 0, r: r * 0.6, h: 0.022, seg: 12, mat: 'steel', tint: '#9a9790' });
      kit.cyl({ x: 0, y: s > 0 ? w / 2 + 0.005 : -w / 2 - 0.05, z: 0, r: r * 0.2, h: 0.045, seg: 8, mat: 'steel_dark', tint: '#4a4844' });
    });
    tyre(2.95, -0.98, 0.5, 0.3, 0.86); tyre(2.95, 0.98, 0.5, 0.3);
    for (const z of [-0.98, -0.66, 0.66, 0.98]) tyre(-2.25, z, 0.5, 0.29);
    // ---- cab (cab-over): faces built from a slightly raked, tapered box
    const xb = 2.12, y0 = 0.82, y1 = 2.82, hw0 = 1.17, hw1 = 1.09, xf0 = 4.0, xf1 = 3.8;
    const A = [[xf0, y0, hw0], [xf0, y0, -hw0], [xf1, y1, -hw1], [xf1, y1, hw1]];    // front
    kit.face(A, 'car_paint', { tint: WHITE, grime });
    for (const s of [1, -1]) {
      const side = [[xb, y0, s * hw0], [xf0, y0, s * hw0], [xf1, y1, s * hw1], [xb, y1, s * hw1]];
      kit.face(s > 0 ? side : side.slice().reverse(), 'car_paint', { tint: WHITE, grime });
    }
    kit.face([[xb, y1, hw1], [xf1, y1, hw1], [xf1, y1, -hw1], [xb, y1, -hw1]], 'car_paint', { tint: '#c4c2ba' });
    kit.face([[xb, y0, -hw0], [xb, y0, hw0], [xb, y1, hw1], [xb, y1, -hw1]], 'car_paint', { tint: '#a8a69e' });
    const fx = (y) => xf0 + ((xf1 - xf0) * (y - y0)) / (y1 - y0) + 0.006;   // front plane x at height y
    // windshield (two panes; the left one smashed through), centre post, wipers
    const ws = (z0, z1, yA, yB, mat, tint) => kit.face([[fx(yA), yA, z1], [fx(yA), yA, z0], [fx(yB), yB, z0], [fx(yB), yB, z1]], mat, { tint });
    ws(-1.02, 1.02, 1.68, 2.66, 'car_plastic', '#151515');
    ws(0.04, 0.98, 1.74, 2.6, 'car_glass');
    ws(-0.98, -0.04, 1.74, 2.6, 'car_interior', '#0d0d0d');
    for (let i = 0; i < 5; i++) { const zA = kit.rnd(-0.95, -0.15), yA = kit.rnd(1.76, 2.55); kit.face([[fx(yA) + 0.002, yA, zA], [fx(yA) + 0.002, yA, zA - kit.rnd(0.08, 0.2)], [fx(yA + 0.15) + 0.002, yA + kit.rnd(0.08, 0.18), zA - 0.05]], 'glass_dirty'); }
    kit.face([[fx(1.7) + 0.003, 1.7, 0.04], [fx(1.7) + 0.003, 1.7, -0.04], [fx(2.64) + 0.003, 2.64, -0.04], [fx(2.64) + 0.003, 2.64, 0.04]], 'car_paint', { tint: WHITE });
    for (const [z, r] of [[0.5, 0.35], [-0.45, 0.62]]) kit.at({ x: fx(1.74) + 0.02, y: 1.74, z, rot: 0, rx: r }, () => kit.box({ x: 0, y: 0, z: 0, w: 0.02, h: 0.02, d: 0.7, mat: 'car_plastic' }));
    // grille band, badge, headlights in black bezels, amber indicators, bumper (dented), step plates
    kit.face([[fx(0.98), 0.98, 0.82], [fx(0.98), 0.98, -0.82], [fx(1.5), 1.5, -0.82], [fx(1.5), 1.5, 0.82]], 'car_plastic', { tint: '#1b1b1b' });
    for (let i = 0; i < 5; i++) { const y = 1.04 + i * 0.1; kit.face([[fx(y) + 0.004, y, 0.78], [fx(y) + 0.004, y, -0.78], [fx(y + 0.035) + 0.004, y + 0.035, -0.78], [fx(y + 0.035) + 0.004, y + 0.035, 0.78]], 'car_chrome', { tint: '#8c8e8c' }); }
    kit.at({ x: fx(1.6) + 0.012, y: 0, z: 0, rot: FACE.E }, () => textLine(kit, 'TRANSCO', { font: 'slab', h: 0.09, x: 0, y: 1.56, z: 0, align: 'center', mat: 'car_chrome' }));
    for (const s of [-1, 1]) {
      kit.box({ x: fx(1.0) - 0.04, y: 0.9, z: s * 1.0, w: 0.08, h: 0.32, d: 0.34, mat: 'car_plastic', tint: '#141414' });
      kit.at({ x: fx(1.06) + 0.03, y: 1.06, z: s * 1.0, rz: -PI / 2 }, () => kit.cyl({ x: 0, y: 0, z: 0, r: 0.12, h: 0.02, seg: 12, mat: s > 0 ? 'car_light' : 'glass_dirty', tint: s > 0 ? undefined : '#8a8a80' }));
      kit.box({ x: fx(1.3) + 0.01, y: 1.26, z: s * 1.0, w: 0.03, h: 0.08, d: 0.22, mat: 'lamp_off', tint: '#a86a2a' });
    }
    kit.at({ x: 4.08, y: 0.5, z: 0, rot: 0.03, rz: 0.01 }, () => {
      kit.bbox({ x: 0, y: 0, z: 0, w: 0.16, h: 0.3, d: 2.42, bevel: 0.03, mat: 'steel', tint: '#9a9c9a' });
      kit.box({ x: 0.08, y: 0.08, z: 0.6, w: 0.01, h: 0.12, d: 0.42, mat: 'sign_white', tint: '#e2dfd5' });
    });
    for (const s of [-1, 1]) {
      for (const [y, d] of [[0.35, 0.36], [0.62, 0.3]]) kit.box({ x: 2.75, y, z: s * (hw0 + 0.05), w: 0.5, h: 0.04, d: d * 0.5, mat: 'steel', tint: '#7a7a76' });
      // door outline, handle, side window (dark), mirror on a tube arm
      {
        const hwAt = (y) => hw0 + ((hw1 - hw0) * (y - y0)) / (y1 - y0) + 0.005;
        const flatS = (pts, mat, o) => { const Q = pts.map(([x, y]) => [x, y, s * hwAt(y)]); kit.face(s > 0 ? Q : Q.reverse(), mat, o); };
        flatS([[2.32, 1.72], [3.62, 1.72], [3.66, 2.62], [2.32, 2.62]], 'car_plastic', { tint: '#121212' });
        flatS([[2.36, 1.76], [3.58, 1.76], [3.62, 2.58], [2.36, 2.58]], s > 0 ? 'car_glass' : 'car_interior', { tint: s > 0 ? undefined : '#101010' });
        for (const [xa, ya, xb2, yb] of [[2.27, 0.92, 2.3, 2.68], [3.7, 0.92, 3.73, 2.68], [2.27, 0.9, 3.73, 0.93]]) flatS([[xa, ya], [xb2, ya], [xb2, yb], [xa, yb]], 'car_plastic', { tint: '#1a1a1a' });
        flatS([[3.35, 1.52], [3.6, 1.52], [3.6, 1.57], [3.35, 1.57]], 'car_chrome', {});
      }
      kit.sweep(circle(0.02, 6), [[3.7, 2.4, s * hw1], [3.95, 2.45, s * (hw1 + 0.35)], [3.95, 1.85, s * (hw1 + 0.4)]], 'steel', { smooth: true, tint: '#8a8a86' });
      kit.bbox({ x: 3.96, y: 1.85, z: s * (hw1 + 0.42), w: 0.08, h: 0.5, d: 0.24, bevel: 0.02, mat: 'car_plastic', tint: '#1e1e1e' });
      kit.face(s > 0 ? [[3.92, 1.9, hw1 + 0.32], [3.92, 1.9, hw1 + 0.52], [3.92, 2.3, hw1 + 0.52], [3.92, 2.3, hw1 + 0.32]].reverse() : [[3.92, 1.9, -hw1 - 0.52], [3.92, 1.9, -hw1 - 0.32], [3.92, 2.3, -hw1 - 0.32], [3.92, 2.3, -hw1 - 0.52]].reverse(), 'car_chrome', {});
    }
    kit.box({ x: 3.6, y: y1, z: 0, w: 0.12, h: 0.07, d: 1.2, mat: 'car_plastic', tint: '#222' });
    for (const z of [-0.45, -0.15, 0.15, 0.45]) kit.box({ x: 3.67, y: y1 + 0.01, z, w: 0.04, h: 0.05, d: 0.12, mat: 'lamp_off', tint: '#b07a3a' });
    // ---- box body (x -4.0..1.95, floor y 1.0, roof 3.4): ribbed sides, rails, corner posts, roof
    const bx0 = -4.0, bx1 = 1.95, by0 = 1.0, by1 = 3.4, bw = 1.25;
    for (const s of [1, -1]) {
      const side = [[bx0, by0 + 0.12, s * bw], [bx1, by0 + 0.12, s * bw], [bx1, by1 - 0.1, s * bw], [bx0, by1 - 0.1, s * bw]];
      kit.face(s > 0 ? side : side.slice().reverse(), 'plaster', { tint: BOXW, grime: { y: 0.9, h: 1.4, k: 0.42 }, uvLocal: true });
      for (let x = bx0 + 0.6; x < bx1 - 0.3; x += 0.62) kit.box({ x, y: by0 + 0.12, z: s * (bw + 0.012), w: 0.05, h: by1 - by0 - 0.22, d: 0.025, mat: 'plaster', tint: shadeHex(BOXW, 0.9), grime: { y: 0.9, h: 1.4, k: 0.42 } });
      for (const [y, h] of [[by0, 0.14], [by1 - 0.12, 0.12]]) kit.box({ x: (bx0 + bx1) / 2, y, z: s * (bw + 0.02), w: bx1 - bx0 + 0.04, h, d: 0.05, mat: 'steel', tint: '#a4a6a2' });
      // faded livery: green double stripe + LANE BROS. FREIGHT, rust streaks, a spray tag on the left side
      kit.at({ x: (bx0 + bx1) / 2, y: 0, z: s * (bw + 0.016), rot: s > 0 ? 0 : PI }, () => {
        flat(kit, rect2(-2.9, 1.42, 2.9, 1.5), 0, 'sign_white', { tint: '#4f7a5a' });
        flat(kit, rect2(-2.9, 1.56, 2.9, 1.6), 0, 'sign_white', { tint: '#4f7a5a' });
        textLine(kit, 'LANE BROS.', { font: 'serif', h: 0.42, x: -0.3, y: 2.35, z: 0.002, align: 'center', mat: 'wz_paint_green', shade: 0.85 });
        textLine(kit, 'FREIGHT · MOVING · STORAGE', { font: 'sans', h: 0.13, x: -0.3, y: 2.05, z: 0.002, align: 'center', mat: 'wz_paint_green', shade: 0.85, maxW: 4.0 });
        if (s < 0) textLine(kit, 'RUN', { font: 'sans', h: 0.5, x: 1.7, y: 1.65, z: 0.004, align: 'center', mat: 'wz_paint_red', italic: 0.25 });
        streaks(kit, -2.9, 2.8, 3.25, 11, 0.003, [0.5, 1.8]);
        for (let i = 0; i < 4; i++) { const x = kit.rnd(-2.6, 2.4); kit.face([[x, 1.0, 0.0025], [x + kit.rnd(0.6, 1.4), 1.0, 0.0025], [x + kit.rnd(0.5, 1.2), 1.0 + kit.rnd(0.3, 0.7), 0.0025], [x + 0.1, 1.0 + kit.rnd(0.2, 0.5), 0.0025]], 'decal_dirt', { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]] }); }
      });
    }
    kit.face([[bx0, by1, bw], [bx1, by1, bw], [bx1, by1, -bw], [bx0, by1, -bw]], 'metal_worn', { tint: '#d6d2c6', uvLocal: true });
    for (const x of [bx0, bx1]) for (const s of [-1, 1]) kit.box({ x: x + (x === bx0 ? 0.04 : -0.04), y: by0, z: s * (bw - 0.03), w: 0.1, h: by1 - by0, d: 0.1, mat: 'steel', tint: '#9c9e9a' });
    kit.face([[bx1, by0 + 0.1, bw], [bx1, by0 + 0.1, -bw], [bx1, by1, -bw], [bx1, by1, bw]], 'plaster', { tint: shadeHex(BOXW, 0.88), uvLocal: true });
    kit.box({ x: (bx0 + bx1) / 2, y: by0 - 0.12, z: 0, w: bx1 - bx0, h: 0.14, d: 2.4, mat: 'steel_dark', tint: '#3a3836' });
    // rear: roll-up door jammed half open, dark interior with cartons, rear lights, underride bar, mud flaps
    const rx = bx0 - 0.005, open = 1.15;
    kit.face([[rx, by0 + open, -bw + 0.1], [rx, by0 + open, bw - 0.1], [rx, by1 - 0.12, bw - 0.1], [rx, by1 - 0.12, -bw + 0.1]], 'metal_container', { tint: '#e8e6de', uvLocal: true });
    kit.box({ x: rx - 0.02, y: by0 + open - 0.06, z: 0, w: 0.05, h: 0.06, d: 2.3, mat: 'steel_dark' });
    kit.face([[bx0 + 0.02, by0 + 0.12, bw - 0.08], [bx0 + 0.02, by0 + 0.12, -bw + 0.08], [bx0 + 0.02, by0 + open, -bw + 0.08], [bx0 + 0.02, by0 + open, bw - 0.08]].map(([x, y, z]) => [x + 3.0, y, z]).reverse(), 'interior_hidden', { shade: 0.35 });
    for (const s of [1, -1]) { const inn = [[bx0 + 0.02, by0 + 0.12, s * (bw - 0.06)], [bx0 + 3.02, by0 + 0.12, s * (bw - 0.06)], [bx0 + 3.02, by0 + open, s * (bw - 0.06)], [bx0 + 0.02, by0 + open, s * (bw - 0.06)]]; kit.face(s > 0 ? inn.slice().reverse() : inn, 'interior_hidden', { shade: 0.4 }); }
    kit.face([[bx0 + 0.02, by0 + 0.12, -bw + 0.06], [bx0 + 3.02, by0 + 0.12, -bw + 0.06], [bx0 + 3.02, by0 + 0.12, bw - 0.06], [bx0 + 0.02, by0 + 0.12, bw - 0.06]].reverse(), 'wz_wood', { tint: '#5a4a3a' });
    kit.face([[bx0 + 0.02, by0 + open - 0.005, bw - 0.06], [bx0 + 3.02, by0 + open - 0.005, bw - 0.06], [bx0 + 3.02, by0 + open - 0.005, -bw + 0.06], [bx0 + 0.02, by0 + open - 0.005, -bw + 0.06]].reverse(), 'interior_hidden', { shade: 0.3 });
    for (const [x, z, s] of [[-3.3, -0.6, 0.55], [-3.25, 0.1, 0.5], [-2.7, 0.7, 0.6], [-3.4, 0.75, 0.4]]) kit.box({ x, y: by0 + 0.12, z, rot: kit.rnd(-0.2, 0.2), w: s, h: s * 0.8, d: s, mat: 'sign_white', tint: kit.pick(['#b8925e', '#a88452', '#c4a272']) });
    for (const s of [-1, 1]) { kit.box({ x: bx0 - 0.02, y: 0.78, z: s * 1.05, w: 0.04, h: 0.16, d: 0.22, mat: 'car_taillight' }); kit.box({ x: -2.85, y: 0.25, z: s * 0.95, w: 0.02, h: 0.55, d: 0.5, mat: 'rubber' }); }
    kit.box({ x: bx0 + 0.05, y: 0.42, z: 0, w: 0.1, h: 0.14, d: 2.2, mat: 'steel', tint: '#7d7f7c' });
    for (const s of [-0.9, 0.9]) kit.box({ x: bx0 + 0.25, y: 0.5, z: s, w: 0.06, h: 0.5, d: 0.06, mat: 'steel_dark' });
    // collision: body + cab to the street (nothing under it for the nav), the box above the cab
    kit.colBox({ x: 0.075, y: 0.0, z: 0, w: 8.25, h: 2.82, d: 2.5 }, 'metal');
    kit.colBox({ x: (bx0 + bx1) / 2, y: 2.82, z: 0, w: bx1 - bx0, h: by1 - 2.82, d: 2.5 }, 'metal');
  });
}

// ==================================================================================================== props
function props(kit, L) {
  const P = (id) => L.PROPS.find((p) => p.id === id);
  // ---- street lamps LAMP_4, 5, 11, 12 (cobra heads at the curb, arms over the parking lane)
  const lampAt = { LAMP_4: [-34, -6.05, -PI / 2], LAMP_5: [-49.2, 6.05, PI / 2], LAMP_11: [-63.95, -12, 0], LAMP_12: [-56.05, 22, PI] };
  for (const l of L.STREET_LAMPS.filter((s) => lampAt[s.id])) {
    const [x, z, rot] = lampAt[l.id];
    kit.streetLight({ at: [x, z], rot, y: SW, h: l.h, arm: 1.9, on: l.state !== 'dead', intensity: 28, range: 15, color: '#ffb36b' });
    kit.at({ x, y: SW, z, rot }, () => { kit.box({ x: 0, y: 2.4, z: 0.11, w: 0.22, h: 0.32, d: 0.02, mat: 'sign_white', tint: '#d8d4ca' }); textLine(kit, l.id.replace('LAMP_', 'W-'), { font: 'hwy', h: 0.08, x: 0, y: 2.5, z: 0.121, align: 'center', mat: 'wz_paint' }); });
  }
  // ---- vehicles: W_CAR (burnt sedan), W_VAN_X (burnt van in the cross street)
  const car = P('W_CAR');
  kit.vehicle({ type: 'sedan', at: [car.x, car.z], rot: car.rot, state: 'burnt', tilt: 0.02, y: -0.08 });
  kit.decal({ at: [car.x, car.z], size: [6.0, 3.2], rot: -car.rot, mat: 'decal_stain', tint: '#3a3430' });
  kit.debris([car.x - 1.6, car.z + 1.2], { r: 1.4, count: 10, kinds: ['brick', 'paper', 'paper', 'plank'] });
  const van = P('W_VAN_X');
  kit.vehicle({ type: 'van', at: [van.x, van.z], rot: van.rot, state: 'burnt', y: -0.09, tilt: -0.02 });
  kit.decal({ at: [van.x, van.z], size: [6.6, 3.4], rot: -van.rot, mat: 'decal_stain', tint: '#3a3430' });
  kit.debris([van.x + 1.0, van.z + 2.4], { r: 1.6, count: 10, kinds: ['brick', 'paper', 'plank'] });
  // ---- W_SHELTER bus shelter (open side to the street), W_HYD, W_DUMP_X
  busShelter(kit, P('W_SHELTER'));
  kit.prop('fire_hydrant', { at: [-36.0, 6.15], y: SW, rot: 0.6, tint: '#c8a8a0' });
  const dp = P('W_DUMP_X');
  dumpster(kit, [dp.x, dp.z], PI / 2, SW);
  trashPile(kit, [dp.x + 0.2, dp.z + 1.9], SW, 3, true);
  // ---- curbside furniture: parking meters, trash cans, a mailbox, newspaper boxes, bench, utility box, signs
  for (const [x, z] of [[-29.5, -5.95], [-37.8, -5.95], [-42.4, -5.95], [-51.5, -5.95], [-31.8, 5.95], [-40.2, 5.95], [-52.6, 5.95]]) parkingMeter(kit, [x, z], z < 0 ? 0 : PI, kit.chance(0.25));
  for (const [x, z, r] of [[-44.6, -8.45, 1.2], [-55.4, -11.5, 2.0], [-27.6, 8.4, 2.4]]) kit.prop('metal_trash_can', { at: [x, z], y: SW, rot: r });
  kit.prop('metal_trash_can', { at: [-47.6, -6.6], y: SW, rot: 0.4, rz: PI / 2 - 0.05, collide: false });
  mailbox(kit, [-52.8, -8.4], 0);
  newsBox(kit, [-38.9, 8.45], PI, 0);
  newsBox(kit, [-39.5, 8.45], PI, 0.06);
  kit.prop('utility_box_02', { at: [-53.0, 8.55], y: SW, rot: PI });
  kit.prop('utility_box_02', { at: [-65.6, -20.0], y: SW, rot: PI / 2 });
  kit.roadSign({ at: [-55.2, -6.2], rot: -0.1, y: SW, shape: 'octagon', size: 0.7 });
  kit.roadSign({ at: [-64.6, 6.3], rot: PI / 2 + 0.2, y: SW, shape: 'rect', size: 0.55, mat: 'sign_white', lean: 0.05 });
  kit.roadSign({ at: [-36.6, -6.1], rot: 0.1, y: SW, shape: 'round', size: 0.6, mat: 'sign_red', lean: -0.04 });
  detourSign(kit, [-55.6, 6.4]);
  // ---- trash heaps against the buildings, cardboard, tyres, a mattress, newspapers
  trashPile(kit, [-27.2, -8.3], SW, 3, true);
  trashPile(kit, [-41.0, -8.3], SW, 3);
  trashPile(kit, [-53.4, 8.3], SW, 4, true);
  trashPile(kit, [-39.2, 8.35], SW, 2);
  trashPile(kit, [-65.3, -14.6], SW, 3);
  trashPile(kit, [-55.0, 15.6], SW, 3);
  trashPile(kit, [-65.3, 26.4], SW, 3);
  kit.prop('cardboard_box_01', { at: [-55.3, -17.8], y: SW, rot: 0.6 });
  kit.prop('cardboard_box_01', { at: [-55.1, -17.6], y: SW + 0.34, rot: 1.2 });
  kit.prop('old_tyre', { at: [-65.4, 2.0 + 18.0], y: SW, rx: PI / 2, rot: 0.4 });
  kit.prop('old_tyre', { at: [-55.3, 33.2], y: SW, rot: 0.2 });
  kit.prop('wooden_crate_02', { at: [-28.7, 8.35], y: SW, rot: PI / 2 + 0.1 });
  kit.prop('plastic_crate_02', { at: [-48.0, -8.4], y: SW, rot: 0.3 });
  kit.prop('plastic_crate_02', { at: [-48.1, -8.35], y: SW + 0.255, rot: 0.1 });
  kit.at({ x: -54.42, y: SW, z: 21.0, rot: PI / 2, rx: -0.15 }, () => { kit.bbox({ x: 0, y: 0, z: 0.1, w: 1.9, h: 1.4, d: 0.2, bevel: 0.06, mat: 'wz_fabric', tint: '#c9c0a6' }); });
  kit.debris([-46.0, -7.2], { r: 1.6, count: 8, kinds: ['paper', 'paper', 'plank'], y: SW });
  kit.debris([-33.5, 7.4], { r: 1.4, count: 8, kinds: ['paper', 'paper', 'brick'], y: SW });
  kit.debris([-60.0, 2.0], { r: 2.4, count: 10, kinds: ['paper', 'paper', 'paper', 'brick'] });
  kit.debris([-37.5, -1.5], { r: 1.8, count: 7, kinds: ['paper', 'brick'] });
  // ---- a burning barrel against the hardware store (baked glow + embers)
  kit.prop('Barrel_01', { at: [-46.6, -7.9], y: SW, rot: 1.1, collide: true });
  kit.at({ x: -46.6, y: SW + 0.82, z: -7.9 }, () => {
    kit.cyl({ x: 0, y: 0, z: 0, r: 0.25, h: 0.02, seg: 10, mat: 'lamp_amber' });
    for (let i = 0; i < 5; i++) kit.box({ x: kit.rnd(-0.12, 0.12), y: 0.02, z: kit.rnd(-0.12, 0.12), w: 0.35, h: 0.04, d: 0.05, rot: kit.rnd(0, 3), rz: kit.rnd(-0.3, 0.3), mat: 'car_burnt', tint: '#2a2622' });
  });
  kit.light({ pos: [-46.6, SW + 1.45, -7.75], color: '#ff9442', intensity: 6, range: 7, radius: 0.25, name: 'barrel_glow' });
  kit.decal({ at: [-46.6, -7.9], size: 1.5, rot: 1.0, mat: 'decal_stain', y: SW });
  streetNames(kit, [-54.75, 8.45]);
  spanSignal(kit);
  // ---- caged work lights wired up at the cross-street barricades (baked warm pools of light)
  for (const [x, y, z, rot, lit] of [[-65.92, 4.2, -24.2, FACE.E, true], [-54.08, 4.0, 27.6, FACE.W, true], [-61.5, 4.3, -33.92, FACE.S, true], [-58.5, 4.3, 37.92, FACE.N, true]]) workLight(kit, [x, y, z], rot, lit);
  // ---- a second fire barrel at the T (dead, smouldering) and the SUP_WX crossing cleared of debris
  kit.prop('barrel_03', { at: [-55.4, 9.8], y: SW, rot: 0.2 });
  kit.at({ x: -55.4, y: SW + 0.88, z: 9.8 }, () => { for (let i = 0; i < 4; i++) kit.box({ x: kit.rnd(-0.12, 0.12), y: 0.0, z: kit.rnd(-0.12, 0.12), w: 0.3, h: 0.04, d: 0.05, rot: kit.rnd(0, 3), rz: kit.rnd(-0.3, 0.3), mat: 'car_burnt', tint: '#2a2622' }); });
}
/** Corner pole with two green street-name blades (WEST ST / W CROSS ST) and a one-way arrow. */
function streetNames(kit, at) {
  kit.at({ x: at[0], y: SW, z: at[1] }, () => {
    kit.cyl({ x: 0, y: 0, z: 0, r: 0.04, h: 3.4, seg: 8, mat: 'steel', tint: '#8a8c8a', collide: true });
    for (const [rot, y, name] of [[0, 3.05, 'WEST ST'], [PI / 2, 3.32, 'W CROSS ST']]) kit.at({ y, rot }, () => {
      kit.box({ x: 0, y: 0, z: 0, w: 1.15, h: 0.22, d: 0.02, mat: 'sign_white', tint: '#2f6a42' });
      for (const sd of [1, -1]) kit.at({ rot: sd > 0 ? 0 : PI }, () => textLine(kit, name, { font: 'hwy', h: 0.11, x: 0, y: 0.055, z: 0.012, align: 'center', mat: 'wz_paint_white', maxW: 1.0 }));
    });
    kit.at({ y: 2.45, rot: FACE.S }, () => { const zf = board(kit, -0.45, 0.45, 0, 0.28, { mat: 'sign_white', tint: '#1e1e1c', d: 0.02 }); textLine(kit, 'ONE WAY →', { font: 'hwy', h: 0.11, x: 0, y: 0.09, z: zf, align: 'center', mat: 'wz_paint_white', maxW: 0.8 }); });
  });
}
/** Dead traffic signals hanging from a span wire across the T (corner poles NE and SW). */
function spanSignal(kit) {
  const A = [-55.3, -7.1], B = [-64.7, 7.2], H = 7.0;
  for (const p of [A, B]) {
    kit.cyl({ x: p[0], y: SW, z: p[1], r: 0.11, r2: 0.08, h: H + 0.4, seg: 10, mat: 'steel', tint: '#6e7072', collide: true });
    kit.cyl({ x: p[0], y: SW + H + 0.4, z: p[1], r: 0.1, h: 0.06, seg: 10, mat: 'steel_dark' });
  }
  kit.wire([A[0], SW + H, A[1]], [B[0], SW + H, B[1]], { sag: 0.5, r: 0.014 });
  kit.wire([A[0], SW + H - 0.5, A[1]], [B[0], SW + H - 0.5, B[1]], { sag: 0.45, r: 0.01 });
  for (const t of [0.28, 0.72]) {   // heads off the fort's sightline to the LED panel and the HARBOR RD sign
    const x = lerp(A[0], B[0], t), z = lerp(A[1], B[1], t), y = SW + H - 0.5 * 4 * t * (1 - t) - 0.05;
    kit.at({ x, y, z, rot: t < 0.5 ? FACE.E : FACE.W }, () => {
      kit.box({ x: 0, y: -0.25, z: 0, w: 0.04, h: 0.25, d: 0.04, mat: 'steel_dark' });
      kit.bbox({ x: 0, y: -1.3, z: 0, w: 0.36, h: 1.05, d: 0.3, bevel: 0.03, mat: 'paint_metal', tint: '#c9a630' });
      for (let i = 0; i < 3; i++) {
        kit.cyl({ x: 0, y: -0.48 - i * 0.32, z: 0.15, r: 0.1, h: 0.02, seg: 10, mat: 'lamp_off', rx: PI / 2, tint: ['#5a2420', '#5a4a20', '#20452a'][i] });
        kit.box({ x: 0, y: -0.39 - i * 0.32, z: 0.21, w: 0.25, h: 0.02, d: 0.14, mat: 'paint_metal', tint: '#b8962a' });
      }
    });
  }
}
/** Caged work lamp on a wall bracket (frame faces rot), cable dropping to the street; lit = baked warm light. */
function workLight(kit, at, rot, lit) {
  kit.at({ x: at[0], y: at[1], z: at[2], rot }, () => {
    kit.box({ x: 0, y: -0.1, z: 0.02, w: 0.16, h: 0.2, d: 0.04, mat: 'steel_dark' });
    kit.beam([0, 0, 0.02], [0, 0, 0.55], { kind: 'box', h: 0.04, w: 0.04, tint: '#3c3a36' });
    kit.at({ x: 0, y: -0.02, z: 0.6, rx: 0.5 }, () => {
      kit.bbox({ x: 0, y: -0.14, z: 0, w: 0.3, h: 0.22, d: 0.18, bevel: 0.02, mat: 'paint_metal', tint: '#c9a630' });
      kit.face([[-0.12, -0.12, 0.092], [0.12, -0.12, 0.092], [0.12, 0.06, 0.092], [-0.12, 0.06, 0.092]], lit ? 'lamp_warm' : 'lamp_off');
      for (const x of [-0.08, 0, 0.08]) kit.box({ x, y: -0.13, z: 0.1, w: 0.012, h: 0.2, d: 0.012, mat: 'steel_dark' });
    });
    kit.sweep(circle(0.01, 4), [[0.1, -0.05, 0.03], [0.4, -1.5, 0.06], [0.45, -at[1] + 0.05, 0.1]], 'rubber', { smooth: true });
    if (lit) kit.light({ pos: [0, -0.4, 1.1], color: '#ffc27a', intensity: 9, range: 11, radius: 0.12, name: 'worklight' });
  });
}
/** Bus shelter W_SHELTER (3.6 x 1.4 x 2.5): back + side glass, dead ad light box, bench, flat roof; solid collision. */
function busShelter(kit, S) {
  kit.at({ x: S.x, y: SW, z: S.z, rot: FACE.N }, () => {   // local +z = north = the street side
    const w = S.w, d = S.d, h = S.h, t = '#5a5f5c';
    for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2 - 0.2], [w / 2, d / 2 - 0.2]]) kit.box({ x, y: 0, z, w: 0.07, h, d: 0.07, mat: 'steel', tint: t });
    kit.box({ x: 0, y: h, z: 0, w: w + 0.25, h: 0.1, d: d + 0.35, mat: 'steel', tint: '#6a6f6c' });
    kit.face([[w / 2, 0.15, -d / 2 + 0.02], [-w / 2, 0.15, -d / 2 + 0.02], [-w / 2, h - 0.1, -d / 2 + 0.02], [w / 2, h - 0.1, -d / 2 + 0.02]].reverse(), 'glass_dirty');
    kit.face([[w / 2, 0.15, -d / 2 + 0.02], [-w / 2, 0.15, -d / 2 + 0.02], [-w / 2, h - 0.1, -d / 2 + 0.02], [w / 2, h - 0.1, -d / 2 + 0.02]], 'glass_dirty');
    for (const s of [-1, 1]) {
      // ad light box on the west end (dead), glass side on the east end (cracked)
      if (s < 0) {
        kit.box({ x: -w / 2, y: 0.2, z: 0, w: 0.16, h: 2.0, d: d - 0.25, mat: 'steel', tint: t });
        kit.at({ x: -w / 2 + 0.081, y: 0, z: 0, rot: PI / 2 }, () => {
          flat(kit, rect2(-(d - 0.4) / 2, 0.32, (d - 0.4) / 2, 2.08), 0, 'sign_white', { tint: '#cfc6b0' });
          textLine(kit, 'FIZZ', { font: 'serif', h: 0.22, x: 0, y: 1.6, z: 0.002, align: 'center', mat: 'wz_paint_red', italic: 0.15 });
          textLine(kit, 'COLA', { font: 'serif', h: 0.22, x: 0, y: 1.3, z: 0.002, align: 'center', mat: 'wz_paint_red', italic: 0.15 });
        });
      } else kit.face([[w / 2 - 0.02, 0.15, d / 2 - 0.25], [w / 2 - 0.02, 0.15, -d / 2], [w / 2 - 0.02, h - 0.1, -d / 2], [w / 2 - 0.02, h - 0.1, d / 2 - 0.25]], 'glass_dirty');
    }
    kit.box({ x: 0.3, y: 0.45, z: -d / 2 + 0.3, w: 2.0, h: 0.05, d: 0.35, mat: 'wz_wood', tint: '#8a6a4a' });
    for (const x of [-0.6, 1.2]) kit.box({ x, y: 0, z: -d / 2 + 0.3, w: 0.05, h: 0.45, d: 0.3, mat: 'steel_dark' });
    kit.box({ x: 0.9, y: h - 0.42, z: d / 2 - 0.18, w: 1.4, h: 0.3, d: 0.03, mat: 'sign_white', tint: '#3a5a8a' });
    textLine(kit, 'BUS 14 · HARBOR RD', { font: 'hwy', h: 0.11, x: 0.9, y: h - 0.32, z: d / 2 - 0.16, align: 'center', mat: 'wz_paint_white', maxW: 1.3 });
    for (let i = 0; i < 10; i++) { const x = kit.rnd(-1.5, 1.6), z = kit.rnd(-0.4, 0.8), s = kit.rnd(0.05, 0.14); kit.upFace([[x, 0.004, z], [x + s, 0.004, z + kit.rnd(-0.05, 0.05)], [x + s * 0.4, 0.004, z + s]], 'glass_dirty', null, {}); }
    kit.colBox({ x: 0, y: -SW, z: -0.1, w: w + 0.1, h: h + SW + 0.1, d: d - 0.2 }, 'glass');
  });
  kit.roadSign({ at: [S.x + 2.4, 6.1], rot: PI, y: SW, shape: 'rect', size: 0.45, mat: 'sign_blue', h: 2.5 });
}
/** Red coin-op newspaper box on a pedestal (front = local +z). */
function newsBox(kit, at, rot, tilt) {
  kit.at({ x: at[0], y: SW, z: at[1], rot, rz: tilt }, () => {
    kit.box({ x: 0, y: 0, z: 0, w: 0.3, h: 0.04, d: 0.3, mat: 'steel_dark' });
    kit.box({ x: 0, y: 0.04, z: 0, w: 0.07, h: 0.32, d: 0.07, mat: 'steel_dark' });
    kit.bbox({ x: 0, y: 0.36, z: 0, w: 0.5, h: 0.72, d: 0.44, bevel: 0.02, mat: 'paint_metal', tint: '#a8251d' });
    kit.face([[-0.19, 0.58, 0.222], [0.19, 0.58, 0.222], [0.19, 0.9, 0.222], [-0.19, 0.9, 0.222]], 'glass_dirty');
    kit.face([[-0.17, 0.6, 0.218], [0.17, 0.6, 0.218], [0.17, 0.86, 0.218], [-0.17, 0.86, 0.218]], 'sign_white', { tint: '#d6d0c0' });
    textLine(kit, 'DAILY', { font: 'serif', h: 0.035, x: 0, y: 0.8, z: 0.219, align: 'center', mat: 'wz_paint' });
    kit.box({ x: 0, y: 0.5, z: 0.23, w: 0.26, h: 0.04, d: 0.03, mat: 'steel', tint: '#a0a29e' });
    kit.colBox({ x: 0, y: 0, z: 0, w: 0.5, h: 1.08, d: 0.44 }, 'metal');
  });
}
/** Blue street mailbox (front = local +z). */
function mailbox(kit, at, rot) {
  kit.at({ x: at[0], y: SW, z: at[1], rot }, () => {
    for (const [x, z] of [[-0.22, -0.2], [0.22, -0.2], [-0.22, 0.2], [0.22, 0.2]]) kit.box({ x, y: 0, z, w: 0.05, h: 0.25, d: 0.05, mat: 'steel_dark', tint: '#2e3a52' });
    kit.bbox({ x: 0, y: 0.25, z: 0, w: 0.52, h: 0.85, d: 0.5, bevel: 0.03, mat: 'paint_metal', tint: '#2f4b7a' });
    kit.at({ x: 0, y: 1.1, z: 0, rx: PI / 2 }, () => kit.cyl({ x: 0, y: -0.25, z: 0, r: 0.26, h: 0.5, seg: 12, mat: 'paint_metal', tint: '#2f4b7a', bottom: true }));
    kit.box({ x: 0, y: 0.92, z: 0.25, w: 0.34, h: 0.06, d: 0.03, mat: 'steel', tint: '#9a9c9e' });
    textLine(kit, 'MAIL', { font: 'sans', h: 0.08, x: 0, y: 0.6, z: 0.252, align: 'center', mat: 'wz_paint_white' });
    kit.colBox({ x: 0, y: 0, z: 0, w: 0.55, h: 1.36, d: 0.55 }, 'metal');
  });
}
/** Parking meter post at the curb (head faces the road = local +z). */
function parkingMeter(kit, at, rot, bent) {
  kit.at({ x: at[0], y: SW, z: at[1], rot, rz: bent ? 0.35 : 0 }, () => {
    kit.cyl({ x: 0, y: 0, z: 0, r: 0.035, h: 1.12, seg: 6, mat: 'steel', tint: '#6f716d' });
    kit.bbox({ x: 0, y: 1.1, z: 0, w: 0.18, h: 0.32, d: 0.14, bevel: 0.03, mat: 'paint_metal', tint: '#6c746d' });
    kit.face([[-0.06, 1.28, 0.071], [0.06, 1.28, 0.071], [0.06, 1.38, 0.071], [-0.06, 1.38, 0.071]], 'glass_dirty');
    kit.colBox({ x: 0, y: 0, z: 0, w: 0.12, h: 1.2, d: 0.12 }, 'metal');
  });
}
/** Orange DETOUR board on two legs at the T, arrow towards the cross street. */
function detourSign(kit, at) {
  kit.at({ x: at[0], y: SW, z: at[1], rot: FACE.E - 0.3 }, () => {
    for (const x of [-0.5, 0.5]) kit.at({ x, y: 0, z: 0, rx: 0.12 }, () => kit.box({ x: 0, y: 0, z: 0, w: 0.05, h: 1.5, d: 0.05, mat: 'steel', tint: '#8a8c8a' }));
    const zf = board(kit, -0.75, 0.75, 1.0, 0.55, { mat: 'sign_white', tint: '#e07a22', d: 0.03, border: { mat: 'frame_dark', tint: '#1d1d1b', w: 0.03, inset: 0.04 } });
    textLine(kit, 'DETOUR →', { font: 'hwy', h: 0.2, x: 0, y: 1.17, z: zf, align: 'center', mat: 'wz_paint', maxW: 1.3 });
    kit.colBox({ x: 0, y: 0, z: 0, w: 1.5, h: 1.55, d: 0.2 }, 'metal');
  });
}

// ==================================================================================================== overhead wires
// Telephone / power drops strung across the streets between wall brackets (never over the pockets' clips).
function wires(kit) {
  const span = (a, b, sag, n = 2) => { for (let i = 0; i < n; i++) kit.wire([a[0], a[1] + i * 0.22, a[2]], [b[0], b[1] + i * 0.25, b[2]], { sag: sag + i * 0.1, r: 0.011 }); };
  for (const [x, y] of [[-29.0, 9.6], [-37.2, 10.1], [-47.5, 9.0]]) {
    for (const z of [-8.95, 8.95]) kit.box({ x, y: y - 0.1, z: z + (z < 0 ? 0.08 : -0.08), w: 0.06, h: 0.12, d: 0.16, mat: 'steel_dark' });
    span([x, y, -8.85], [x + 0.6, y + 0.4, 8.85], 0.6);
  }
  for (const [z, y] of [[-15.5, 8.6], [17.4, 9.4]]) {
    for (const x of [-65.95, -54.05]) kit.box({ x: x + (x < -60 ? 0.08 : -0.08), y: y - 0.1, z, w: 0.16, h: 0.12, d: 0.06, mat: 'steel_dark' });
    span([-65.85, y, z], [-54.15, y + 0.3, z + 0.4], 0.45);
  }
  kit.wire([-53.95, 12.2, -9.2], [-53.95, 12.6, 9.2], { sag: 0.7, r: 0.012 });
}

// ==================================================================================================== glyph data
// Outlines traced from text rendered in headless Edge with the Windows system faces Rockwell Bold (slab), Georgia Bold
// (serif), Arial Black (sans), Bahnschrift Bold (hwy), Microsoft JhengHei Bold (cjk) at 120 px (CJK 84 px), simplified to
// ~0.55 px (same method and faces as the north zone). Swap this table for an original / CC0 face if the font licences are a
// concern. Format: see glyph().
const GLYPHS = {
  slab: { c: 82, g: {
    "0": '66.2|IrKiIhKbIZKSITKHIOJ7ILJnILI9IOIpITIdIfILIrICI3H-JNH-JZICJjIJJtIVJzIhJ3ItJ6JBJ7JXJ5JrJ3J3JxKJJrKTJjKcJZKiJNKmI1Kl/JDKMJJKJJOKDJSJ1JUJfJUJDJQInJMIdJDIYI7IbI1IlIyIxIwJJIxJnI0J7I5KHI_KL',
    "1": '66.2|IZKLIxKJIxIbIbIZIbIBJrIAJsIZJWIbJWKjIZKj',
    "2": '66.2|IhKdIXKTIRKHINJtIPJrIrJqIvJ9IyKFI3KKI_KMJHKKJMKFJOJ9JNJzJFJlIjJDIVIxINIbILIBJzIAJ1IBJ1IJJ1IwJbIvJbIbJZIaIsIbIyIpI5IzJhJSJrJcJxJnJ1J1J0KBJxKLJrKVJlKcJbKiJPKmI0Kl',
    "3": '66.2|IjKgIXKVIRKLINJ5IrJ2ItJ3IwKFI1KKI_KMJJKHJOJ9JNJzJKJtJFJoI0JjI0JLJBJKJHJIJNJDJSI3JSIpJOIhJKIdJFIaI9IYI1IaIuIfIqIpIpIzInI0IJIyIJIpIPIXIVIOIdIHIlICIzH-JPH_JbICJpILJxITJ3IhJ5IxJ1JCJtJNJcJXJnJfJvJpJzJ5JyKFJvKPJpKXJbKiJLKmIyKl',
    "4": '66.2|IEJDINIuJJItJJIbI3IZI3IBJ3IAJ5IBJ5IZJsIbJsItJ8IvJ8JDJsJFJsKlJKKl/JJJ1JJJFIjJEJHJ4',
    "5": '66.2|IQJRIpJEI3JQI_JSJHJQJNJLJQJFJSI9JSIvJQIlJLIdJHIaI9IYI1IaIvIeInIwILItIIIrINIbIYILIhIEIpIBIzH-JJH-JbICJlIIJsIPJ2IhJ5I3J1JNJpJfJZJqJPJsI_JsIrJlItKJJVKKJZJ-JvJ-JxJ_JxKjIUKj',
    "6": '66.2|IxKiImKbIdKSIVKFIPJxINJhIMJHIPIxIWIZIjIJItIDI7H-JTH-JfICJnIHJzIVJ6IpJ6I7J4JHJ1JRJvJZJpJfJdJmJVJoJFJoI9JmIzJgIxJhI0J3I4KBI9KHJHKMJLKMJTKIJYKBJbJ5JdJ4J3J6J4J_JxKTJlKfJVKmI8Kl/JHJOJPJKJUJFJYI7JYIxJVIjJPIbJJIYJDIZI7IdI2IjIyIxIxJHI_JN',
    "7": '66.2|IQJ1IRJ0IrJ1IrKJItKKJTKJJFJxI2JPIvI1IrIbIWIZIWIBJlIAJmIZJRIbJSIpJXJDJgJjJsJ_J2KPJ3KjIQKj',
    "8": '66.2|InKhIdKbIXKVIRKLIOJ5IRJrIZJfIlJVIXJNIPJEIKI3IJInILIfIRITIYILIhIEIzH-JRH-JhIDJrIIJ1ITJ7IhJ8IvJ4JBJuJNJhJVJtJfJ0JpJ3J3J3KDJzKPJvKVJpKbJfKhJPKmIzKl/JHKLJPKHJTKBJVJ5JUJvJSJpJLJiJFJgI_JgI3JkIyJrIwJxIyKBI3KII_KL/JHJJJPJGJWI9JYI1JYIpJUIhJNIbJFIYI_IYI3IcIxIhIuIpItI1IwI_I3JGI_JK',
    "9": '66.2|InKiIdKcIVKTIPKJIKJ3IKJnINJbIRJRIXJJIfJCInI-IvI8JBI8JTJEJUJBJQIrJJIeJFIbI9IYI1IaIxIdIpIsIPIqINInITITIXINIhIEIxH-JJH-JVICJgIJJqITJvIdJ1IvJ4I9J3JrJzJ_JwKJJqKTJhKcJXKiJLKmIxKl/JBKLJJKHJQJ7JTJvJTJdJDJWI9JWI0JbIvJjItJrItJ3IuJ_IzKHI5KL',
    "A": '83.8|IdKJIyKHITIdH_IbH_IBJHIAJIIBJIIbIzIdI7I3JjI4JsIdJXIbJXIBKpIBKpIbKVIdJzKHKJKJKJKjIdKj/JdJRJFJQJDJRJRJ9',
    "B": '83.8|IHKJIbKHIbIdIHIbIHIBJpIAJ9IEKMINKXIbKbInKcIxKaI_KWJHKLJSKBJXKQJlKVJzKWJ9KUKHKLKVKFKbJ9KgJrKkIHKj/JZKHJhKGJmKDJpJ9JqJ1JoJtJlJpJXJkJHJlJHKHJJKI/JhJGJrJAJuI5JvIvJtInJpIhJjIeJXIcJHIdJHJHJJJI',
    "C": '93.7|I9KgItKXIeKJIVJ7IPJtILJZIMJHIRIxIZIhIhIWIvILI7IEJJIAJZH-JzH-KFICKTIJKkIXKvInK1I3KVJGKMIxKFIpJ9IiJ1IeJrIcJZIeJRIiJJIpI-I5I6JNI8JjJCJxJLJ9JVKEJnKIJ3KGKDKAKKJ5KTJqKtJqKvJrKvKjKTKkKRKYJ_KiJxKlJQKl',
    "D": '96.2|IFKJIeKHIeIdIFIbIFIBJzIBJ9ICKNIJKXIPKiIZKrInKxI1K1JJK1JVKzJlKvJzKnKDKdKPKHKeJvKjIFKj/JnKGJ1KAKAJzKFJlKHJLKDI1J9IrJ2IlJnIeJZIcJKIdJKKHJLKI',
    "E": '80|IHKJIbKHIbIdIHIbIHIBKYIBKYIxKXIyJ5IyJ4IxJ3IcJHIdJHJFJvJHJvJhJHJjJHKHJ3KIJ4JzJ5JyKXJyKYJzKYKjIHKj',
    "F": '77.5|IGKJIdKHIdIdIGIbIGIBJhIAJiIBJiIbJJIdJJJFJsJHJsJhJJJjJJKHJ3KIJ5KHJ5JzKZJzKZKjIGKj',
    "G": '101.3|JDKhIvKYIhKMIXJ-IRJxINJfINJFIRIzIZIjIiIXIxILI9IFJLIAJhH-J3H-KPIEKlIRK1IjK9I3LAJRJzJRJzI3KPI1KKIrKBIiJ3IeJnIcJbIeJTIiJIIrJCIzI8JFI7JXI8JjJCJzJLJ9JVKDJnKIJ3KGKDKAKNJ3KVJpKxJoKyKjKXKkKVKjKVKZKTKZKDKiJzKlJSKl',
    "H": '91.2|IHKJIbKHIbIdIHIbIHIBJXIBJXIbJGIdJGJHJHJIJxJHJxIdJgIbJhIAKwIBKwIbKbIdKbKHKwKJKvKkJhKkJgKJJxKHJxJlJvJkJGJlJGKHJXKJJXKjJVKkIHKj',
    "I": '51.2|IFKJIdKHIdIdIFIbIFIBJhIAJiIBJiIbJJIdJJKHJiKJJiKjIFKj',
    "J": '48.7|IEKJIcKHIcIBIaH1IVHvINHsH-HtH-HRILHOIjHOIvHTI4HZJAHhJFHtJIIBJIKHJeKJJeKjIEKj',
    "K": '93.7|IEKJIaKHIaIdIEIbIFIAJZIBJZIbJGIdJGJTJHJWJ3IdJkIbJlIAK9IBK9IbKrIdJ3JbKkKHK4KJK4KjJpKkJoKjJoKJJ6KHJHJYJGJbJGKHJbKJJbKjIEKj',
    "L": '77.5|IGKJIdKHIdIdIGIbIGIBKZIBKZJNKXJOJ4JNJ4IdJ3IcJJIdJJKHJhKJJhKjIGKj',
    "M": '125|IGKJIbKHIbIdIGIbIGIBIHIAJMIBJMIbI3IdI3KHI5KIJtIAKAIBKzKIK0KHK0IdKhIbKhIBL0IBL0IbLfIdLfKHL0KJL0KjLzKkKfKjJ9JIJ7JJJZKjIGKj',
    "N": '95|IGKJIcKHIcIdIGIbIGIBJPIBJPIbI6IdI6JxI7J0J-H_KlH_KlKHK8KJK8KjJxKjJxKJKGKHKGJFKFJBJMKjIGKj',
    "O": '102.5|JDKhI1KbIlKPIZKBIRJxIMJhILJLIPI5IXInIfIbIpIRI5IHJDIDJXH-J1H-KJICKXIIKmITKxIfK6ItK_I9LCJNLBJbK9JvK4J7KvKHKjKUKXKcKJKiJ3KmJTKl/JpKIJ1KFKDJ9KOJtKSJbKRJDKOI3KKIvKBImJ5IgJpIcJZIeJRIiJIIpI-I5I6JLI8JjJCJzJIJ7JRKCJhKH',
    "P": '80|IGKJIbKHIbIdIGIbIGIBJdIAJeIbJHIdJHI7JpI8J3I-KFJEKOJLKXJYKbJlKbJ7KXKIKPKTKFKbJ3KhJtKjIGKj/JhKGJqJ_JuJ1JuJtJsJlJlJcJXJZJHJZJHKHJJKI',
    "Q": '102.5|JDKiIxKZIiKNIXJ-IRJxIMJdIMJJIPI5IZIlIlIWI1ILJIIDI7H9IxH1I7HkJJHsJVHuJjHqKFHbKXHYKaHbKiHzKRH0JzH_KLIFKbIMKmIVKzIjK9I3LBJHLBJbK9JvK1J_KtKKKhKWKVKdKJKiJ3KmJSKl/JpKIJzKGKAJ_KMJxKSJdKSJFKOI5KKIxJ9IlJzIgJpIeJZIgJNInJHIsI-I7I6JNI8JjJCJzJIJ7JRKCJhKH',
    "R": '87.5|IFKJIbKHIbIdIFIbIFIBJbIBJbIbJHIdJHJFJJJGJZJFJ9IBKwIBKwIbKaIdKBJLKTJZKZJjKcJtKcJ7KaKHKVKPKNKZKDKgJzKkIFKj/JbKIJpKDJuJ9JvJ1JuJtJrJpJjJkJdJjJHJjJHKHJJKI',
    "S": '63.7|IbKeIPKRIKJ_ILJrIRJfIZJXJLI5JQIzJRIrJQIlJLIeJDIaI9IaI3IcIuIjIqIrInI4ILI3ILIBInIAIpILIzIDI9H_JTH-JlIGJxITJ1IbJ4InJ3I3J2I_JxJJJpJTJdJcI1JwIuJ3ItJ_IvKDIzKHI_KKJHKHJOKBJTJzJvJyJwKjJVKkJTKjJTKbJRKaJJKhI_KmIqKl',
    "T": '81.2|IHJjIjJiIkKHI7KHI7IdIjIbIjIBJ_IAKAIbJnIdJnKHJ_KHJ_JjKbJiKcKjIHKj',
    "U": '81.2|IEKJIXKHIYIpIbIbIiIPIvIFJFH-JhH-JvICJ7IIKHIXKLIlKMKHKgKJKgKjJdKjJdKJJtKHJtI3JrIpJoIjJhIeJXIcJNIfJIIjJEIrJDI1JDKHJTKJJTKjIEKj',
    "V": '83.8|H_KJITKHJDIBJlIAJnIDKUKHKpKJKpKjJfKjJfKJJ0KHJZI6I_KHJUKJJUKjH_Kj',
    "W": '118.8|H_KJIRKHI_IBJBIAJgIBJ3JHKQIBKvIALcKHLvKJLvKjLtKkKsKjKsKJK8KHKjI9KJKHKYKJKYKjJdKkJcKJJrKHJTI9I5KHJKKJJKKjH_Kj',
    "X": '88.8|IBKJIYKHI-JVIYIdH_IbH_IBJLIAJMIbI8IdJQI5JTI6JpIdJaIbJbIAKzIBKzIbKbIdJxJTKXKHKuKJKtKkJjKjJkKJJxKHJdJtJIKHJXKJJXKjIBKj',
    "Y": '83.8|H_KJITKHI_JHI_IdIoIbIoIBKBIBKBIbJrIdJrJHKUKHKpKJKpKjJgKjJgKJJwKHJZJiJCKHJSKJJRKkH_Kj',
    "Z": '77.5|IQJrIRJqItJrItKHJYKHIMIdILIBKRIBKRI7KPI8J0I7JzIcJAIdKPKLKPKjIQKj',
    "&": '96.2|I9KhI2KdIvKXIrKPIpJ9IsJxI0JlIzJjIaJTIRJKILI_IJI1IJIpILIgIRIVIaILIjIFI3H-JNH-JZIAJrIIJ3IRKHIAK3IBK3IZKdIaKQIrKZI3KjJJK3JLK3JjKPJjKEJPJ-JFJ7JEJmJfJ0JpJ-J1KCKBJ_KRJ3KbJpKjJdKmJIKl/JXKQJdKOJiKJJjKFJhJ9JVJ1JKKFJMKLJTKP/JHJOJkIpJdIjJVIeJLIcI_IeI3IjIwItIvI1IzJBI5JIJDJO',
    ".": '42.5|IXIAI_IBI_IlIWIl',
    "·": '40|IcJhIZJbIZJPIcJJIjJEItJEI0JJI3JPI3JbI0JhItJmIiJl',
    "-": '41.3|IJIoJLIpJLJHJJJIIIJH',
    "!": '42.5|IYJ1IhI5IzI4I8J1I9KjIXKj;IXIAI_IBI_IlIWIl',
    "'": '33.7|IVKhIRKbIQKRIeJZIjJYImJZInJfIyKHI0KXIxKeIrKkIlKmIaKl',
    "+": '80.2|JBJhIPJgIOJfIOJFJBJDJBIRJfIQJgJDKTJFKTJfJhJgJgJhJgKTJBKT',
    "%": '111.2|IfKhIaKdITKRIPJ7IRJpIXJbIfJTIpJOI9JPJDJRJLJXJTJlJWJ1JTKNJNKbJFKiI7KmInKl/I1KXI4KTI8J9I6JnI3JfIzJcIvJeIsJjIqJxIrKLItKTIxKY;ItIFIqIBIrIAJAIBKzKhK1KjKzKkKeKj;KbJTKTJNKLI_KIItKKIZKRILKbIDKjIAK1IALCIHLLIULPInLNI7LHJJK_JRKzJWKgJV/KwJFKzI_K0I3K0IjKyIVKvIQKrIOKmITKkIZKjIzKmJDKrJI',
    "/": '60.9|IBH_IjH-IxIZJ5KlJXKl',
    "→": '120|KuJlK1JXLCJFLBJDILJDIJJBIJI3LBI2LCI1K3ImKtITK3ITLRIsLnI7LnI_LSJNK3JmKuJn',
    "↑": '60|IsKJISJtIRJlIVJlInJuIzJ3I1J3I1HPI3HOI_HNJDHPJDJ3JFJ3JRJuJjJkJnJlJnJrJNKHI_KcI5Kd',
    ",": '42.5|IWIBIpH_IoH1IlHvIfHqIWHnIWHXIjHWIyHdI7HpI_H7I_IlIWIl',
    ":": '42.5|IXJMI_JNI_JxIWJx;IXIAI_IBI_IlIWIl',
    "#": '80.2|IsJ7IIJ5IJJiImJhIgJDIIJBIIIrIaIpIRH_IsH_I1IpJXIqJaIpJRH_JrH-J1IpKYIrKYJBJ6JDKBJhKYJjKYJ5KGJ7KPKlJ1KlJrJ6JJJ6JGJ7JPKlI1Kl/JmJhJgJDI6JDJBJh',
    "(": '41.3|I9KfIvKVIjKJIYJ5IRJnINJXIKIzIPITIVIDIbH3IlHpIvHfI9HUJLHOJMHPJNHjI-HxI2IDIyIbIxI1IyJZI3JzI-KDJNKRJMKlJIKl',
    ")": '41.3|IGKRITKFIcJzIgJfIiJDIhIjIeIJIWHzIQHrIGHjIGHPIJHOIZHWIkHfIxHtI7H9JBILJGIbJIJBJDJjI9JzI1KBIsKNIfKZIPKjIJKmIGKl',
  } },
  serif: { c: 83, g: {
    "0": '84.1|I1J9IpJ3IdJtIVJjIPJWIMJHIMI3IPIpITIfIbITImIJI1IBJFH8JPH8JjH8JzIBJ_IHKKIPKTIbKZInKdJAKbJPKXJbKMJtKFJzJ3J8JhKCJDKB/JdJ2JjJxJoJrJuJZJvJHJuIpJqIXJhILJVIHJLIIJBITI8IfI5I1I6JTI-JlJCJtJHJzJTJ3',
    "1": '58.8|I1J4IrJyINJtINJlIPJjIpJjIrJhIqITIoIPIjIMIPIJIOIBJvIAJvIJJbINJWIRJUIVJVKBI-KB',
    "2": '75.2|IhJ6ITJuIPJnIOJhIPJZIRJUIXJOIdJMIpJMIxJQI1JVI3JbI3JlIzJ1JBJ3JNJ0JUJtJYJhJXJPJSJHJJI-IlIpIOIXIMIVIMIBKNIBKNIfKLIgIrIhI7IqJjI1JxI7J_JFKDJLKFJTKGJfKDJpJ-JxJ3J3JpJ-JZKCI3KB',
    "3": '74.9|IjJ7IVJyINJlINJZIQJRIVJNIbJKInJKIwJPI1JZI1JhIxJ1JBJ3JJJ2JRJvJVJnJXJfJWJPJUJFJPI-JHI4IxI2IwIpIxInIzImJJImJVIfJaIXJcINJcH_JaH1JUHrJLHjI9HfItHgIrHhIvH1ItIBIpIGIhIKIXIKIPIIIJICIGH9IGHzIIHrIPHjIhHYIxHUJRHVJhHYJzHhKAHrKHH3KKH_KKILKHIXKDIeJ1IpJaIxJvI5J7JDKBJPKDJfKBJnJ8JvJzJ4JnJ-JXKCI2KB',
    "4": '77.9|IGIZIFIXIFIDJRICJTIBJTHXJ5HWJ7HXJ7IBKUIDKUIZKTIbJ9IbJ7IdJ7KBJYKB/JTJfJTIdJRIbIbIcIaIdJRJi',
    "5": '71.9|ISInIbIkInIuIxIyJBIyJHIwJQIpJWIhJZIVJZIFJWH3JRHtJJHkJBHgI1HfIrHhIvHxIvH9IqIFIhIKITIJIKIDIGH5IHHxIJHrIQHjIZHcIvHVJNHUJjHbJ1HnKBH3KGILKGIZKCIlJ5IxJxI4JlI-JXJCI7JCIjI5ImJbImJdIpJeJ_JeKBJfKBJ9IdJ9',
    "6": '77.8|JRKiJDKbIzKSIlKFIdJ7IUJtIPJeIMJRILI_INIxIRIjIZIVIiILIrIEI5H-JFH8JbH8JxIDJ7IJKFISKPIjKSIzKPJJKHJZJ7JjJrJqJXJqJHJlI7JeI5JfJAJ3JGKBJOKLJZKUJjKZJ5KfJ7KhJ4KpJuKp/JTJaJbJVJiJLJlI7JlIpJiIXJaILJRIHJJIIJDINI8IZI5IpI4JNI-JVJFJZ',
    "7": '66.5|IKJFILJEITJEIaJXIfJcIlJdJtJdIfHVIxHUKFJtKHJ9IKJ9',
    "8": '81.2|I1KmIlKdIbKUIVKLISKBISJ3IXJpIiJbIxJRIxJPIdJHITI_IMIxINIfIRIVIYINIhIGItIBJDH8JbH8JpH-J7IFKHINKRIZKVIjKWI1KQJFKBJTJuJdJ_JlKJJtKPJ5KPKJKLKTKFKaJzKlJhKqJDKp/JZKeJdKcJiKXJmKPJoJ7JmJtJjJjJHJwJBJ1I8J9I7KJI_KVJFKcJPKf/JdI8JnI1JrIvJuIlJtIbJpISJhIKJVIHJHIII9IPI4IXI1IjI0IxI4JBI9JK',
    "9": '77.8|IvJ9IhJ2IXJtIRJlIMJbIJJNIKI_INIzIRIpIZIfIlIWIvITJHISJVIWJhIeJiIbJcIHJQH1JHHtI9HnItHhIiHfIhHdIjHVIlHUI9HYJPHeJfHmJuHxJ7H-KFINKLIbKPItKQJDKNJTKHJjJ-JvJxJ5JjKAJVKCI8KB/JTJ2JbJtJgJhJkJJJjItJdImJTIiJHIiI_IpI5I1I2JFI3JZI6JnJBJyJLJ3',
    "A": '91|IWIbILIOH5IJH5IBI9IAI-IBI-IJItIMIoIPImITIoIfIwI3IzI4JnI4JqI3J5IRJ4IPJzIMJiIJJhIBK9IBK9IJKvINKpIRKkIXJpKpJQKp/JkJFJjJEI2JFJNJ-',
    "B": '90.9|IIKdIbKXIfKRIgIXIeIRIZIMIIIJIHIBJ1IAKRIGKdINKjISKpIbKsIpKrI3KnJBKgJJKXJQKJJWJ5JZJ5JbKPJjKYJpKfJxKjJ7KjKFKgKRKZKZKLKhJ1KmIHKl/JhKaJrKVJyKNJ0KFJ0J1JuJpJlJiJVJeJLJfJLKa/JfJSJnJQJwJLJ4JDJ8I3J8IlJ2IXJtIPJnIMJXIMJRIOJMITJLJR',
    "C": '85.8|JDKmIxKeIjKTIXKFIOJ1IJJiIIJVIJJBINIxIVIhIeIVIrIKI1IFJHH-JVH8JvH8KDIDKTINKdIXKpIpKhIvKdIvKNIaKFIUJ5IOJnIMJbIOJPIUJCIjI6I7I4JLI4JhI8J7JEKNJRKaJdKeJtKeJ7KYKGKNKNKBKXJqKhJqKhKlKVKmKPKgJxKqJRKp',
    "D": '100.1|IIKdIbKYIgKPIgIVIbINIIIJIHIBJnIAJ5ICKJIHKXINKmIXKyIjK7IzK_JBLBJRK_JhK7JxK2J9KtKJKhKTKLKfJvKmIHKl/JnKaJ1KUJ-KNKEKFKKJ5KOJrKQJdKQJFKMItKCIZJ3IQJtIMJXIMJPIRJLIXJLKa',
    "E": '86.5|IIKdIZKYIeKVIfKRIgIVIdIPIZIMIIIJIHIBKlIBKnI0KeIzKUIhKKITKFIPJ9IMJVIMJQIPJMITJLIfJLJQJfJQJrJOJyJHJ5I0KBIzKDI1KDJ5J5J5JyJnJpJfJdJcJLJdJLKaJ3KaJ_KWKFKQKSJ9KbJ8KcJ9KcKlIHKl',
    "F": '80.6|IIKdIZKYIeKVIfKRIgIXIdIPIZIMIIIJIHIBJhIAJiIBJiIJJTIMJOIPJMITJLJNJNJPJdJPJlJOJrJLJyJDJ5IxKCIxKDJ3J4J3JyJlJpJdJdJaJLJbJLKZJNKbJ5KaKBKVKHKPKUJ7KdJ6KeJ7KeKlIHKl',
    "G": '96.9|I9KkItKbIbKLIRJ7IJJjIIJNILI3ITIkIeIVItIJI_IAJRH8JvH8J9H-KVIFKpINKtIPKtIRKtI1KuI7KzJALBJCLBJMJrJMJrJDJ9I-KBI7KDI1KDITJ_IPJ1IKJnIIJZIKJLITJCIfI8IvI5JDI5JnJAKDJHKPJPKXJXKcJfKeJvKeJ7KZKFKRKOKFKaJpKmJpKlKlKZKmKTKgJzKqJSKp',
    "H": '109.6|IIKdIZKYIdKVIfKRIgIVIbINIIIJIHIBJhIAJjIBJiIJJTIMJOIPJMITJLJPKPJQKQJPKQITKLIMJ5IJJ5IBLUIBLTIJLDIMK9IRK7IXK8KRK9KVLBKZLTKdLTKmJ5KlJ5KdKLKXKQKRKQJdKPJcJLJdJLKTJRKZJiKdJjKlJhKmIHKl',
    "I": '53.5|IHKdIbKXIgKPIgIXIeIPIbINIHIJIHIBJjIAJkIBJkIJJTIMJOIPJLIVJLKPJMKVJRKZJkKdJkKlIHKl',
    "J": '71.4|IvKdJDKXJFKVJHKPJHIrJFIdI_IRI3IKIxIIIpIIIhIKIfINIgIPIsIbIvIhIvItIrI1ImI5IhI8IZI8INI6IGIzICIrICIdIHIPIOIHIVICInH8I_H8JPIAJbIHJlIPJtIbJyIvJzKRJ1KXJ5KaKJKdKJKlIvKl',
    "K": '98|IIKdIZKYIeKVIfKRIgIVIeIPIbINIIIJIHIBJhIBJhIJJTIMJOIPJMITJLJLJNJMJRJLJnIvKJIALMIBLLIKK7IOKtIZJwJlKfKRKrKYLBKdLBKlJ5KmJ4KlJ4KdKDKcKIKZKGKRJzJ5JNJWJLJXJLKPJMKVJRKaJjKdJkKlIHKl',
    "L": '82.3|IIKdIZKYIeKVIfKRIgIXIdIPIZIMIIIJIHIBKhIAKlIxKlI1KjI2KbI1KOIdKHITKBIOJ5IMJVIMJPIPJMITJLIfJLKPJMKVJRKaJjKcJkKlIHKl',
    "M": '122.8|IFKdIXKYIcKTIfKJIgInIeIZIcITITIMIEIJIDIBJMIBJMIJI3IRIyIXIwIfIwKNIxKNI0KFJjIDJxICJzICJ1IFKrKPKrIVKqIRKlINKSIJKSIBLtIBLtIJLbIOLWITLWIZLWKRLYKXLdKaLtKdLtKlKiKlKeKTJ7I7JTKlIFKl',
    "N": '100.7|IDKdIRKYIaKRIeKLIgKBIgInIeIZIcITIXIOIEIJIDIBJMIBJMIJI3IRIyIXIwIdIvIrIvJ5IvJ7IxJ7KUIBKrIBKsKFKuKPKxKVK5KaLHKdLHKmJ_KlJ_KdKTKWKYKRKaKLKcJ5KcI9KbI5JDKlIDKl',
    "O": '98.4|I9KkItKbIhKRIXKFINJxIJJhIIJNILI5IRIpIbIbInIPI3IFJTH8JxH8J9H-KNIEKeIPKsIdKzIpK5I5K9JPK9JbK5JvKtKHKgKVKRKfKDKlJxKqJRKp/JrKeJ1KZJ8KTKGKDKMJnKMI_KGIjKAIXJ6IRJxIKJpIIJZIIJKIRJEIZI-IlI5JBI4JdI6JvI-KBJEKNJKKVJZKd',
    "P": '84.1|IIKdIbKXIfKRIgIVIdIPIZIMIIIJIHIBJjIBJjIJJTIMJOIPJMITJLJFJNJHJfJHJ7JLKJJQKVJYKfJlKkJxKkKDKfKRKYKZKRKeKJKiJ3KmIHKl/JfKaJnKXJvKRJ0KFJ2JzJyJjJrJaJfJUJTJSJLJTJLKa',
    "Q": '98.4|I9KkItKbIdKNITJ_ILJrIIJXIJJBIPItIZIdIpINI7ICJXH7JaHtJfHjJmHbJvHVJ9HQKTHQKzHXK2HZK1HiKfHgKXHiKRHnKJHzKGIBKVIJKlIVKvIiK3IxK7JBK9JZK7JoK1J5KtKHKlKRKbKZKNKhJxKqJRKp/JrKeJ1KZJ8KTKGKDKMJnKMI_KGIjJ7IRJ1IMJrIIJZIIJPINJKIRJEIZI-IlI5I_I4JdI6JvI-KBJEKNJKKVJZKd',
    "R": '95.7|IIKdIbKXIfKRIgIVIdIPIZIMIIIJIHIBJhIBJhIJJTIMJMIRJLIVJLJJJPJLJmIvKHIALIIBLHIJK5IMKyIRJ-JRKXJeKfJnKjJvKmJ7KlKHKhKRKaKZKLKhJ3KmIHKl/JfKaJnKXJwKRJ1KHJ2J1J0JpJtJfJhJYJVJWJLJXJLKa',
    "S": '77.9|IlKiIcKbITKRIMJ_INJrIVJbIfJRIvJIJVI8JjI0JoIvJrIpJqIbJkIRJZIKJJIII9IKIxIRImIbIdInITI7IJI8IHI7IIIBITIAIbIIItIBI_H8JZH8JnH-JzIDJ9IIKLIWKRIiKTIrKTI1KRJBKHJRJ5JcJJJtI7J0I0J9IzKLI2KTJBKcJHKeJRKeJdKcJnKWJvKNJ-JvKJJuKKJvKJKlJ_KmJ3KgJZKqI7Kp',
    "T": '82.1|IBJ3IDJ2IMJ3IWKLIhKYIlKaIzKbI7KbI9KZI8IVI7IRI3INIjIJIjIBKBIBKBIJJtIOJoIVJoKZJpKbJxKbJ_KaKDKYKMKPKZJ3KhJ2KjJ3KjKlIBKl',
    "U": '100|IHKcIXKYIcKRIdIxIhIgIqIRI0IJI_IDJLH_JbH8J1H8J_H-KLIDKZIMKlIbKqInKrIxKsJ9KuKPK1KYLIKdLIKlJ_KlJ_KdKTKWKYKRKaKLKcJ7KcI1KYIjKPIXKBIOJvIMJhIOJTIXJMIhJIIxJIKRJKKXJNKZJeKdJfKlIGKl',
    "V": '91.5|H4KdH_KcILKWITKLJNH9JnH9KiKLKlKRKtKYK8KdK8KlJ4KlJ4KdKLKZKQKVKRKRKMJ_JpIoI-KTI-KXJBKaJSKdJTKlH4Kl',
    "W": '135.2|H7KdIHKaIRKSIUKNJFH9JHH8JeH9KFJ2KwH9LJH8L6KLMBKVMJKaMTKdMTKfMTKlMRKmLPKlLQKdLhKaLnKXLpKTLgJtLLIrKhKjKfKmKGKlJhIvJAKTJAKXJDKZJUKdJVKlH7Kl',
    "X": '97|IBKdIVKXIjKLJNJNIbIVIPINIBIJIBIAJCIBJCIJIzIMIwIPIwITI_IpJVJCJuIdJzIRJxINJvIMJdIJJdIALDIBLDIJKvIOKjIZJ0JdKjKTKvKaK8KdK7KmJ6KlJ6KdKJKaKMKXKMKTKAKBJtJqJrJqJWKJJRKVJRKXJVKaJnKdJnKmIBKl',
    "Y": '87.8|H5KdIHKaIUKPJCJBJCITI9INIqIJIpIBKHIBKHIJJ3IMJyIPJvITJuI3JwJFKcKLKpKYK4KdK4KlJ5KlJ6KdKJKaKNKXKOKTKAJ5JpJVJnJUJMKDJDKXJFKaJJKbJYKdJZKlH4Kl',
    "Z": '82.7|IKJ3IKJ1INJ0IWJ1ImKPIxKYJBKbJpKbJrKZIDIJIBIBKfIBKkI3KjI4KaI3KMIdJ_IOJ3IMJpILI5ILI3INKdKZKhKfKhKlIPKl',
    "&": '95.9|I3KmItKgIlKXIgKPIfJ_IhJ1ImJpIwJbIvJYIZJLITJFILI5IIItIIIhIKIZIPIPIdICIvH8JFH8JPH-JdIFJtIQJ7IALBIALBIJKvIMKlIQKXIbKJIrKjJVKtJcK9JfK-JnJ7JnJ7JfKLJaKPJVKMJHKBI1JcJhJtJvJ1J7J5KLJ1KZJtKiJhKoJXKqJCKp/JXKeJdKcJiKXJlKLJiJ5JdJxJVJqJJJ9JEKLJGKXJNKd/JmIZJjIWJZISJFISI7IXIzIfIuIpItI3IwJHI3JQ',
    ".": '39.4|IZImISIdIQIVIRILIVIEIdH-IjH8IvH9I5IDI9IJI_ITI-IbI3IkIvIpIfIp',
    "·": '40.5|IXJRITJLIRJBISI7IVI0IdItIjIqIvIqI3IuI9I1JAI_I_JJI6JRIzJWItJYIgJX',
    "-": '45.5|IJIzILIyJSIzJRJMIJJL',
    "!": '45.2|IeKlIZKfIWKVIWKNIoI3IxI2IyI3JDKJJFKVJCKfI5KnIzKqIlKp;IfIkIZIdIXIXIXILIbIEIjH-IpH8I1H9I8IBJBIHJEIPJDIZI-IhI1InIlIn',
    "'": '32.3|IPKrIMKfIbJjIjJiIlJjIzKZI0KjIyKrIrKyIlK0IYKz',
    "+": '84.4|JKJNITJLITI7IVI4JJI4JKI3JKIDJdICJfIDJfI3JhI4KVI4KWJLJfJNJfKDJKKD',
    "%": '105.5|IbKhIPKTIKKFIKJ3INJtIWJfInJUIvJSI9JSJLJVJaJfJkJtJnJ_JkKPJcKbJPKlJBKqIsKp/I9KgJCKbJGKHJGJ1JDJlI_JdI5JbIyJdIuJjIqJ7ItKVIwKdI3Kh;IbIBIvIBK1KhK4KlK3KmKkKl;J9JLJ3JFJxI9JsIrJvIZJ3ILKBICKJH-KRH8KfH8KtH_K7IHLFIVLIIfLJIrLFI7K7JJKtJRKjJUKOJT/KhJJKkJFKnI7KpItKoIbKmIPKhIHKbIFKVIGKQINKOIXKNIpKQJDKUJJKZJL',
    "/": '56.6|IDHPIZHPJjKfJqKxJTKx',
    "→": '120|KuJlK1JXLCJFLBJDILJDIJJBIJI3LBI2LCI1K3ImKtITK3ITLRIsLnI7LnI_LSJNK3JmKuJn',
    "↑": '60|IsKJISJtIRJlIVJlInJuIzJ3I1J3I1HPI3HOI_HNJDHPJDJ3JFJ3JRJuJjJkJnJlJnJrJNKHI_KcI5Kd',
    ",": '39.4|IWIhIRIaIPITIRILIZIDIhIAItIAIuH9IrHzIlHpIfHiIRHZIXHQIjHWIxHjI7HxJAH_I_IPI8IZI3IfItIlIcIl',
    ":": '44.1|IdJvIXJnIUJfIVJXIZJPIhJIInJGIzJGI7JLJBJSJEJZJDJjI_JrI3JyIxJ0IkJz;IdIlIXIdIUIVIVINIZIFIhH-InH8IzH8I7IBJBIIJEIPJDIZI_IhI3IoIxIqIkIp',
    "#": '84.4|I_JrIZJpIZJXI3JWI5JVIxI7IRI5ISInIqIlIfIBIhIAIyIBI9IlI_ImJVImJWIlJMIBJbIAJeIBJpIlJrImKQInKQI5KPI6JwI7J5JWKXJXKXJpJ-JrKKKRJ3KRJrJqJVJqJSJrJeKRJLKR/JlJWJdI7JDI7JNJX',
    "(": '53.6|JPKwI9KnIrKZIhKNIZJ_IRJrIOJZINJFIPItITIdIbILIjH-IvHxI9HnJPHeJhHaJkHbJkHjJXHpJOHvJGH5JAIFI6IbI2I7I4JnI9J_JEKRJLKbJVKkJkKrJjK0JbKz',
    ")": '53.6|IHKrIaKhIiKZIqKNIyJzI1JTI0ItIuILIoH9IfHxIXHqIHHjIHHbILHaIdHfIvHnI-HzJJH_JTIPJZIfJeI1JfJJJdJbJZJvJRKDJIKRI6KfIrKpIXKxINK0IHKz',
  } },
  sans: { c: 86, g: {
    "0": '80|IxKqIlKjIZKZIRKKILJzIJJhIKJHINIxITIfIZIVIpIGIxICJBH-JbH-JpIAJ1IFKBINKLIaKRIoKVI7KXJTKTJ7KPKJKJKVKBKeJ5KlJrKrJhKuI_Kt/JRKOJXKMJgKDJkJ3JmJjJmJHJjIxJdIkJZIhJRIeJHIhJAIpI8I3I6JLI7JtI-J_JEKJJLKN',
    "1": '80|JBKbI1KQITJ_ITJbIXJaIjJeIxJlJDJwJFJvJFIBJ1IAJ3IBJ3KtJOKt',
    "2": '80|InKoIYKdIPKOIJJ5IRJ3I5J0JBKHJHKMJRKOJZKMJgKHJkJ9JjJ1JeJrJZJlIvJDIZItINIZIGIBKVIAKWIBKWIlKVImJNInJ6JLKNJgKSJrKVJ5KTKJKPKTKDKiJ5KoJvKrJdKuI6Kt',
    "3": '80|IpKoIcKfIRKRILKBI3J6I5J7I-KHJDKMJPKOJaKJJeJ_JaJ1JTJwJCJtJAJNJBJLJTJOJfJIJkJBJlI7JmIzJkIrJdIjJZIgJPIeJCIjI8IrI5IzI3I0IJIvIJIrIPIdIYIRIhIJItIDJDH-JhH-JtIBJ7IHKHIQKPIbKWIrKXI7KTJLKOJTKHJaJ3JhKDJqKLJ1KOKBKNKNKJKXKDKfJxKqJfKuI7Kt',
    "4": '80|IFJGIEIfJZIeJbIdJbIBKFIAKGIBKGIdKcIfKcJDKGJFKGKtJaKt/JbJFIvJFJbJ4',
    "5": '80|IOJPIVJNI1JIJFJSJPJUJZJSJgJNJkJHJmI3JkItJgIlJZIgJRIeJHIgJBIkI8IpI5IzI3I0IJIwIIIrIOIdIVITIfIKIpIEI1IAJDH-JfH-JrIBJ5IHKCINKLIXKVItKXJDKVJNKRJYKJJjKCJpJxJyJnJ0JVJ0JBJuI_JvJDKGKPKHKPKrIcKr',
    "6": '80|I1KpInKiIbKWITKJINJ3IKJhIKJJINIzIRInIXIbIgIPIrIHI7IAJHH-JhH-JvIAJ9IGKEILKNIVKTIfKYIzKXJDKVJNKPJYKFJkJ5JrJtJvJVJvJHJpI9JhI8JnJAJ9JHKJJLKMJTKOJbKMJfKJJlJ8KPKBKUKDKLKXKCKhJ5KnJlKuJDKt/JXJQJhJLJoJDJpI9JqIxJmInJfIhJXIeJPIfJGIjJAIpI9IzI-I_JAJFJHJMJPJP',
    "7": '80|ILKGJeKFJJJnI7JNIvIpInIBJXIAJeItJqJPJ8JvKKKBKWKNKXKrIKKr',
    "8": '80|IlKlIZKbIRKPIOKBIRJzIXJnIkJdISJPIMJFIKI7IJIvINIfISIVIbILIlIFIxIBI_H-JdH-J1IDKBIJKJIPKRIbKWInKXI1KTJFKNJPJ9JdKJJoKPJzKRJ_KPKNKLKWKFKdJ9KkJxKqJdKuI8Kt/JRKOJZKMJhKDJiJ9JhJ1JZJsJRJqJHJsJBJwI-J1I9J9I_KFJFKLJLKN/JTJOJdJJJjJBJmI3JkItJhInJZIgJRIeJHIgJBIlI8IrI6IzI6I7I_JFJDJJJLJN',
    "9": '80|IjKmIZKeIRKUILKIIJJ_IIJxILJhITJRIbJJInJBIzI9JLI9JZJDJjJLJkJFJgItJXIiJNIeJFIgJBIjI7IwIRIrIMIpIRIcIXISIhIIIrIDI_H-JZH-JlIBJzIHJ_IPKHIZKPInKTI1KWJNKWJjKTJ5KPKFKHKUJ9KfJxKnJZKuI4Kt/JPKOJZKKJgKDJjJ5JiJtJfJlJXJeJPJcJJJcI_JhI4JpI3JxI3J7I6KFI_KKJHKN',
    "A": '93.3|IAIBI1IAI3IBI-IZJBIcJ5IcJ7IbKDIBK7IAJ8KrJAKr/JvJDJNJCJLJDJMJFJdJ8',
    "B": '93.3|IRIBJ5IAKTIFKbIIKjIPKrIZKvIjKxIvKwI_KrJKKlJSKdJYKPJdKgJpKnJ1KpJ_KoKLKlKUKfKdKRKnKBKsIRKr/JhKKJtKHJyKDJ0J9JyJxJrJsJjJqJJJqJIJrJIKJJJKK/JlJKJxJIJ2JFJ6I_J6IzJ1ItJrIpJJIoJIIpJIJJJJJK',
    "C": '93.3|I_KpIrKgIdKTIVKGIPJ3ILJhILJNIPI3IVInIdIbIrINI1IGJFIBJTH-JxH-KBIBKTIJKhIVKtInKzI5KvI7KFJIKDJHJ7IzJzIqJjImJRIqJLIvJGI3JCJHJBJfJFJxJPJ_JXKEJhKGJpKFJzKCJ7J7KBJvKDJuKxJ5KlKSKbKdKPKlKFKqJzKuJOKt',
    "D": '93.3|ISIBJvIAKDIFKVIOKhIbKpIoKvI7KxJLKxJfKtJ3KnKHKhKRKWKdKNKjKDKoJzKsISKr/JZKEJrJ_JzJ5J4JvJ7JbJ5JBJ0IzJpIrJZIoJIIpJJKE',
    "E": '86.7|IRIBKjIBKjInKhIoJHIpJHJHJJJIKZJIKaJrJJJsJHJtJHKDKfKEKgKFKgKrIRKr',
    "F": '80|IRIBJHIAJIJDKKJFKKJlJJJmJIJnJIKDKVKEKWKrIRKr',
    "G": '100|I7KoItKgIfKTIVKFINJvIKJbILJJIRIxIYIhIhIWIvIKI7IEJTH-JtH-KFIAKTIEKnIOK6IbK7JhJnJhJnI_KJI-KLI9KLIxJ5IpJlImJZIoJRIsJKIzJGI5JCJHJBJVJDJpJKJ5JRKAJZKEJlKGJzKEJ7KAKDJ1KHJ0K3J8K4J9K1KFKwKRKoKbKXKnKLKrJ9KuJRKt',
    "H": '100|IRIBJHIAJIJFJ_JGKAJFKAIBK3IBK3KrKBKsKAJxJJJwJIJxJIKrIRKr',
    "I": '46.7|ITIBJJIAJKKrITKr',
    "J": '80|JYI5JTIrJJImI_IpI6IxI3JCIEI7IHInIRITIfIHIvIAI7H-JVH-JpICJ1IJJ_IRKFIZKLInKPJFKPKrJYKr',
    "K": '100|IRIBJHIAJIIpJhJEJjJEKGIBLIIBKIJrLFKrJ9KrJJJuJIJxJIKrIRKr',
    "L": '80|IRIBKaIBKaIpKZIqJIIrJIKrIRKr',
    "M": '113.3|IRIAI9IBI9JxI_J3JdIBKGIBKlJ5KmJ1KmIBLTIBLTKrKMKrJ0JPJxJJJYKrIQKr',
    "N": '100|IRIBJFIBJFJbKDIBK3IBK3KrKEKrKDJQJFKrIRKr',
    "O": '100|JBKqIvKhIeKTIVKGIPJ3ILJhILJJIPI1IVImIgIXIrINI7IEJHIBJZH-J1H-KJIDKXIJKlITKvIfK3IvK7I9K-JRK9JlK5J3KzKHKpKVKdKfKTKlKHKqJ1KuJQKt/JpKFJxKEJ5J_KCJ1KGJnKHJLKCI3J5IsJxIoJnImJXIoJNIuJFI7JBJJJCJnJGJ1JPJ_JdKF',
    "P": '86.7|IRIBJFIAJHIBJHJBJ1JDKFJHKTJPKbJYKhJlKkJ3KhKLKdKVKVKfKNKlKBKqJvKsIRKr/JdKJJpKFJsKBJvJ5JuJxJqJrJjJmJbJlJHJlJHKJJJKK',
    "Q": '100|I7KoIpKdIcKRITKBILJlIKJNIOI5IVInIbIdIlISIvILI7IEJTH-JpH-J3H_KPIFKnH1K1HuLEILKzIVKsIbK3IvK9JLK9JhK7JvKzKHKuKPKiKbKNKoJzKuJQKt/JpKFJxKEJ5J_KCJ1KGJnKHJNKFJBKCI3JlJGJhJGJfJCJZIzJrIpJrInJnImJXIoJKIxJEI9JBJNJCJnJGJ1JPJ_JXKEJdKF',
    "R": '93.3|ISIBJIIBJIJFJNJGJVJEJdI9J_IAK7IAKfI3KTJFKIJLKdJXKlJfKrJrKuJ1KtKHKpKTKiKdKTKoJ_KsISKr/JjKKJvKHJ0KDJ3J_J4J3J2JxJxJrJrJoJfJmJJJmJJKK',
    "S": '86.7|ItKoIfKfIZKZISKPIPKFIOJ3IRJtIZJfInJUI5JMJbJEJpI-JwI1JvItJsInJlIiJVIgJJIkJDIpI-IxI7I8ILI6III5III3INIjIVIVIfILIrIEI3IBJJH-JpH-KBIEKNILKWITKhIlKlI5KjJFKfJPKWJbKLJjJ3JrJLJ2JDJ7JBJ_JBKDJCKHJHKLJVKOJfKMJlKHJtJ4KdJ6KfJ7KfJ9KcKLKVKXKPKeKFKmJ7KqJpKuJCKt',
    "T": '86.7|IFKFI7KDI7IBJxIAJyKDKnKEKoKrIFKr',
    "U": '100|IRI_IXInIdIbIjIUItIKI3IFJFIAJbH-J5H-KFIAKVIHKjIRKuIfK1I1K3JBK3KrKBKrKAI7J8IxJ3IsJxIoJjImJZIoJRIsJKI1JII7JHKrIRKr',
    "V": '93.3|JAIBJ7IAK7KrKEKrJfI0I5KrIAKr',
    "W": '120|IlIBJbIBJ2JjJ5JnKVIBLLIBLxKrK9KrKtJXKrJRKSKrJfKsJFJRIzKrIAKr',
    "X": '93.3|I7JZIBIAI9IBJdI1JgIzJ_IAK7IBKCJZK2KrJ7KrJfJ5JBKrIGKr',
    "Y": '93.3|JCJJJCIBJ5IBJ6JJK7KrKBKsJfJ1JdJ1I7KsIAKr',
    "Z": '86.7|INKFJgKDIEInIDIBKnIAKnIoJHIpKjKFKkKHKkKrINKr',
    "&": '106.7|JFKqI6KjIxKZItKRIrKHItJ5IxJvI7JhIkJTIdJNIXJDITI5IRItITIjIXIZIdIRInIIIzICJDH_JjH-JzIAKHIHKVIPKvH_KzH_LMIdK3IqKyIvK6I9K_JLK7JNKbJUKYJTKTJHJ6JbKRJtKZJ5KdKJKZKXKPKjJ_KrJvKuJSKt/JnKUJvKSJ0KNJ1KHJxJ9JjJyJcJ5JWKFJYKNJhKT/J2IpJ2InJpIhJdIeJRIgJJIlJDItJCI3JGI_JRJI',
    ".": '40|IOIBJCIBJCIvIOIv',
    "·": '40|IOI_JCI_JCJtIOJt',
    "-": '40|IFItJLItJLJRIFJR',
    "!": '40|IOKFIXI3I3I2I5I3I5I9JCKFJCKrIOKr;IQIBJBIBJBIpIQIp',
    "'": '33.3|IJKPIRJtIzJtI6KPI6KrIJKr',
    "+": '79.2|I7JpIPJoIOJDI7JBI7IXJhIWJiIXJiJBKPJDKPJnJjJoJiKVI7KV',
    "%": '120|IbKlIRKZILKFILJ9IPJtIZJfInJWI3JUJFJUJNJWJbJeJmJtJpKDJmKVJbKkJNKsJDKuItKt/I7KaJBKXJFKPJHKFJGJ3JEJvJBJrI7JoIzJrIuJ3IuKNIxKVI3KZ;I7H4JUH5KzKnK2KtK1KuKcKt;KXJJKRJDKLI5KHIlKLIRKUIDKjH6KrH4K5H4LJH6LXIDLhIRLkIdLlIpLhI5LXJHLJJQK_JSKpJR/K3I-K9I7LCIvLDIhLBIVK9IPK3IMKzINKtIRKpIfKrIzKvI7KzI9',
    "/": '33.3|IBIDIAH_IBH-IZH_JDKrJEKtJBKuIqKt',
    "→": '120|KvJiLBJFLBJDILJDIJJBIJI3LBI2LCI1K5IpKtITK3ITLRIsLnI7LnI_LTJMK3JmKuJn',
    "↑": '60|IsKXISJ7IRJ1ISJzIVJzI1KHI1HPI3HOI_HNJDHPJDKFJDKGJFKFJRJ9JjJzJnJzJnJ5JMKXI_KrI4Kr',
    ",": '40|IOIBImH_IkH3IgHxIOHlIYHRIbHQIwHdI3HjI9HtJCH_JCIvIOIv',
    ":": '40|IOJNJCJNJCJ7IOJ7;IOIBJCIBJCIvIOIv',
    "#": '79.2|IqKFIGKDIGJlIjJjIdJJIGJHIGIpIXInIOH_IxH_I5InJPIoJSInJKH_JrH-J0InKXIpKXJHJ7JJKAJjKXJlKXKDKHKFKPKtJtKtJlKFJPKEJMKFJUKtIyKt/JeJjJXJIJAJJJFJjJHJk',
    "(": '46.7|IfKLITJtINJJIOIlITIRIbH7InHlI1HPJTHOJUHPJGHvI-INI6IlI5I_I6JVJAJ1JIKPJUKtI1Kt',
    ")": '46.7|IWKPIeJzIiJfIlJBIkIrIeIHIWHtIJHPInHOIvHZI-HxJLITJPInJRI7JPJXJJJxJBKFI3KXIpKtIJKt',
  } },
  hwy: { c: 86, g: {
    "0": '66.2|InKoIdKhIVKXIRKNIPKBIQIjIXIRIhIGItIBI3H-JPH_JdIDJnIJJvITJzIdJ2IvJ1KHJyKTJtKbJnKiJfKnJTKrJJKsIxKr/JJKMJOKJJSKDJUJ5JUIvJPIjJJIeJFIeI9IeI3IhIyIpIwIzIxJ9I2KJJBKN',
    "1": '39.9|IJKgIIKdIJJ9IbKEIcKBIcIBI9IAI-KpI7KrIjKrIeKp',
    "2": '62|IfKkIUKZINKJILJ5IrJ5IvKDIzKJI3KMI_KNJHKMJNKHJPKBJOJ5JGJpIMIdIMIBJxIAJxIfI7IfI5IhJjJVJrJjJvJvJxJ7JxKFJuKTJjKiJVKpJJKsIwKr',
    "3": '63.5|IjKlIXKbIPKNIKJ7IrJ6ItJ7IyKHI3KLJBKMJHKJJLKBJKJxJGJrJBJoIwJnIwJLIxJJJFJIJJJFJOI5JNIpJJIjJFIgJBIeI3IeIvIjIpIuIJIuIIIrILIdIPIVIdIHIlICIzH_JJH-JZIDJjIJJrITJvIdJyIxJvJDJnJRJhJWJZJZJkJhJrJrJvJ3JuKHJrKTJnKbJgKjJZKnJLKsIxKr',
    "4": '68.3|INI5IMIbJPIaJRIZJRIBJxIAJyIBJyIZKAIbJ_I5JyI7JyJjJRJjJRI7JPI6I3I6I0I7JmKpJjKrJDKrJAKp',
    "5": '65.3|ISJJIxJII1JPI7JUJFJVJLJUJQJPJTJDJSIrJQIlJLIgJFIeI9IeI5IgIzInIvIyIRIyIPIvITIdIdINIrICI7H-JLH-JVIBJhIHJoINJxIdJ0ItJ0JLJxJXJpJnJdJxJPJ1JHJ1I9J0I1JwI0JxI0KJI1KLJvKMJvKpJtKrIVKrISKp',
    "6": '61.6|ITJXINJDILIvIPIbISITIbIJIlICIxH_JHH-JZIEJnIRJsIZJvIlJvI9JpJRJfJdJTJkI-JnJeKpJbKrI9KrI5Kp/JBJGJHJEJLI_JOI5JPIvJNInJJIhJDIeI3IeIwIjItIpItI1IuI7IyJBI5JG',
    "7": '60.4|ILJyIpJxIrJzIsKLJHKLIjIBJFIAJHIDJsKRJtKpJpKrINKrIKKp',
    "8": '67.5|IpKnIdKfIXKXITKPIQKBITJvIZJkIlJZIZJPIRJDINI1IOIlIRIZIWIRIlIFI5H-JPH-JdICJrILJ1IXJ5IjJ6IxJ3JBJtJQJhJZJtJjJ1JxJ3J5J1KLJtKcJdKoJPKsI0Kr/JBKNJLKMJPKJJUKDJVJ5JUJxJQJrJLJoJDJnI7JoI0JvIyJ1IyJ_I0KFI7KL/JLJGJTJCJXI9JZI3JYItJVImJPIgJJIeI9IeI1IiIwIpIuIvIvI7IzJBI7JG',
    "9": '61.6|IlKoIdKjISKXIMKDIMJtIPJhITJZIfJMItJGJBJFIjIBJFIAJrJdJwJvJvKDJpKWJjKeJbKlJJKsIvKr/JFKMJLKHJOKBJPJ3JNJvJJJoJBJkI1JmIuJvItJ7IuKDIyKJI3KM',
    "A": '77.7|ICIBIlIAIuIZIxIbJrIbJtIZJ3IAKZIBJZKpJXKrJFKrJCKp/JQJtJgI7I7I7JNJw',
    "B": '77.5|ISIBJnIAJxIDJ9IIKFIQKLIZKPInKPI1KLJDKFJLJ7JTJvJXKBJgKHJnKLJvKNKBKLKLKHKVKBKdJ5KjJnKqIVKrISKp/JXKLJhKKJnKGJqKBJrJ3JqJxJlJrJfJoI1JnI0JpI0KJI1KL/JZJIJjJGJpJBJtI7JuIxJrIpJlIiJfIgI1IfI0IhI0JHI1JI',
    "C": '74.2|IxKoIjKgIZKUISKHIPJzIPI3IQIrIVIdIbITIpIHIxICI_H_JXH-JpIEJ5IRKFIlKKI5JpI6JhIpJdIkJVIgJJIfJBIhI7IkI0ItIxI5IxJxI0J9I9KIJHKLJPKMJXKKJeKFJkJ9JpJxKJJxKKJzKHJ_KCKNJ7KXJxKhJnKnJZKsI8Kr',
    "D": '78.8|ISIBJZIAJlIDJzIJJ-IRKFIZKLIlKOIvKPI7KPJxKNJ_KHKPJ_KZJ3KgJrKmJdKqIVKrISKp/JNKLJZKKJjKEJqJ7JsJxJsI3JoIrJdIiJNIfI1IfI0IhI0KJI1KL',
    "E": '71.7|ISIBKFIAKFIfI1IfI0IhI0JDI1JFJ3JFJ5JHJ5JjI1JkI0JlI0KJI1KLKFKMKFKqIVKrISKp',
    "F": '67.1|ISIBIzIAI0JDJzJDJ2JFJ2JhJ1JiI0JjI0KLKBKLKDKNKDKpKBKrIVKrISKp',
    "G": '77.6|IxKnIkKfIbKVITKHIPJzIPIxISIjIXIaIdIRInIJIzICJBH_JZH-JpIDJzIIJ9IRKFIdKMIxKMJfJRJfJQJBJpJAJqI7JoIxJkIpJbIiJRIgJBIiI3IpIyIzIxJxI0J7I5KDI_KHJFKKJPKKJVKKJdKGJpJ5KJJ5KLJ7KHKHKBKSJ5KbJvKjJnKoJZKsI-Kr',
    "H": '81.4|ISIBI0IBI0JDI1JFJtJFJvJDJvIBKRIBKRKpKPKqJzKrJvKpJvJlI1JkI0JlI0KpIxKrIVKrISKp',
    "I": '33|IQIBIxIAIyIBIyKpIvKrITKrIQKp',
    "J": '60.6|JFI1JCInI9IhI3IeItIeIjIiIbIoIBIVIPIHIXICIlH-I7H-JFIBJRIGJeITJlIlJnI1JnKpJlKrJHKrJFKp',
    "K": '77|ISIBI0IBI0IlJLJFJzIBKZIAKZIDJhJjKSKpKPKrJtKrJpKpI1JaI0JdI0KpIxKrIVKrISKp',
    "L": '68.8|ISIBKFIAKFIfI1IfI0IhI0KpIxKrIVKrISKp',
    "M": '93.5|ISIBIxIBIxJwJPITJpISJtIVKJJwKKJrKKIBKpIBKpKpKnKrKBKrJ9KpJgJDJdI8I-KpI7KrIVKrISKp',
    "N": '84|ISIBIyIBIyJzIzJ3JtIBKVIAKVKqJ5KrJ2KpJ2I1J1IyI7KpIVKrISKp',
    "O": '77.5|ItKlIkKfIZKTITKHIPJzIQIvITIjIZIYIhIOIrIGIzICJBH_JZH-JnICJzIIJ_ITKHIhKMI5KLJ7KDKRJ7KbJxKjJbKsI-Kr/JRKMJZKKJfKGJmJ_JqJxJqI5JoIxJkIpJfIkJZIhJRIfJDIgI7IlI0ItIyI1IyJ3I0J9I6KFJHKL',
    "P": '74.7|ISIBIzIAI0JBJjJCJxJHJ7JNKGJZKLJlKNJzKMKFKHKRKAKbJ5KhJtKnJbKrIVKrISKp/JZKLJjKIJnKDJqJ7JqJxJnJpJjJlJdJiI1JiI0JjI0KJI1KL',
    "Q": '78.9|ItKlIiKdIZKTIRKBIPJzIPI3IVIfIbIVIlIKI5IAJDH-JZH-JnICJ3ILKJH-KLH-KcITKIIjKMI5KMJxKLJ7KHKJJ7KbJxKjJpKoJbKsI-Kr/JRKMJZKKJfKGJmJ_JqJxJqI7JnI7JbJEJXJDJIIvJZIhJRIfJDIgI7IlI0ItIyI1IyJ3I0J9I6KFJHKL',
    "R": '78.2|ISIBI0IBI0JDJFJEJsIBKTIAJsJFJ3JLKBJTKHJdKLJnKNJxKMKDKJKPKDKZJ1KlJpKqIVKrISKp/JbKLJjKJJoKDJqJ9JqJxJoJrJfJkI1JkI0JlI0KJI1KL',
    "S": '73.9|InKkIeKdIWKTITKLIQJ9IQJtITJjIdJVIrJMI5JIJVJDJjI-JoI3JoIrJjIlJbIgJHIdIxIhIjImIXIuIIITIZIIIvIAJBH-JVH-JhIAJ1IJKDIXKHIhKKIrKKI5KHJFJ_JSJzJbJpJfJDJoI5JsIyJzIxJ7IyKBI7KKJPKNJjKKJ5KAKGKbJzKlJfKrI8Kr',
    "T": '57.8|H7KMIoKLIpIBJJIAJLIBJLKLJ3KLJ5KNJ5KpJ1KrH9KrH7Kp',
    "U": '78.6|IQI7ITInIZIYInIJIzICJBH_JbH-JlIBJzIHJ_IRKFIZKKIjKNIzKOKpKLKrJvKrJsKpJsI1JoIrJgIjJbIgJNIeJDIgI7IkI0ItIyI1IxKpIvKrITKrIQKp',
    "V": '70.4|I5IBJTIAKMKpKJKrJtKrJqKpJHI9JEJBIjKpIhKrIFKrIBKp',
    "W": '101.6|IoIBJIIBJjJnJnJyKEIBKjIALJKjLKKpLJKqKrKrKoKpKTI9JzKqJbKrJYKpI5I-I2JHIjKpIhKrIFKrIBKp',
    "X": '68.1|IyJXIAIBIjIBJDI3JFI3JlIBKIIBJWJXKFKqJjKqJGJ5JDJ2IjKqIFKrICKp',
    "Y": '60.4|IsJBIsIBJNIBJNJBJ-KpJ9KqJfKrJcKpI9JkI6JnIdKpIbKrH9KrH6Kp',
    "Z": '65.3|INKNIPKMJQKLILIdILIBJ7IBJ7IdJ5IfI1IfI0IhJ4KNJ5KpJ1KrIRKrINKp',
    "&": '78.2|I1KoIrKhIjKXIfKNIdJ3IgJnImJbIZJRIPJBINI3IMIpIPIdISIVIZIMIjIEI3H-JNH-JZIAJtIKJ3IAKbIBKCIdKJIvKNI_KPJRKOJZJwJZJsI_JpI4JKJbJBJrI9J3I8KBI_KLJEKRJLKUJTKTJaKNJcKFJdJ7J9J6J-KHJ5KWJuKjJhKqJVKsJAKr/JXIhJXIfJPIcI9IcI1IfIwIjIsIrIsI1IuI9I1JF',
    ".": '27.2|ILIAIsIBIrIgIKIf',
    "·": '25.4|IJItIqItIrJNIpJOILJPIIJN',
    "-": '57.5|IQIvIRIuJhItJlIvJlJLJjJMITJNIQJL',
    "!": '32.5|IQIzIvIyIxI1IxKpIvKrITKrIQKp;IQIBIxIBIxIfIQIf',
    "'": '21.3|IFJvIlJuImKpIjKrIHKrIFKp',
    "+": '63.4|IwJfIOJdINJBIPJAIvI_IwIfJPIeJQI_JxJAJzJBJyJdJQJfJPJ-IwJ9',
    "%": '82.4|ISKlILKbIJKPIJJ9ILJzIRJpIbJjInJhI1JjI_JpJGJzJHJ7JHKRJFKbI_KkI3KqIvKsIdKr/IrKSItKPIsJ9IpJ6IlJ7IjKBIkKRInKT;IZIAI3IBKNKmKPKpKNKrJzKrJwKp;JrJFJhI7JdItJeITJjIJJtIBJ1H-KFH-KQIDKZINKcIdKbIzKXI9KPJFKBJJJ3JJ/J_IwKBIrKBIbJ9IXJ4IbJ4ItJ7Iw',
    "/": '45.4|H9HjH9HgIZHfIcHhJnK9JlK_JLK_JIK9',
    "→": '120|KuJlK1JXLCJFLBJDILJDIJJBIJI3LBI2LCI1K3ImKtITK3ITLRIsLnI7LnI_LSJNK3JmKuJn',
    "↑": '60|IsKJISJtIRJlIVJlInJuIzJ3I1J3I1HPI3HOI_HNJDHPJDJ3JFJ3JRJuJjJkJnJlJnJrJNKHI_KcI5Kd',
    ",": '27.2|ILHYINHYIsH3IsIfIKIf',
    ":": '27.2|ILJYIsJZIrJ4INJ5IKJ3;ILIAIsIBIrIgIKIf',
    "#": '74.9|IqKDIPKBIPJnIjJnIlJlIfJFIJJEIIJBIJIpIZIpIaInIUIBItIAI1IoJPIpJSInJLIBJlIBJtIpKHIpKKIrKJJDJxJFJ3JmKQJnKQKBJ8KDKBKlKBKqJpKqJhKDJfKCJEKDJLKpJJKqIzKrIwKp/JbJnJcJlJYJJJVJEI7JEI6JFI_JjJBJn',
    "(": '40.7|IrKlIdKJIVJrISJHIXIjIfIJItHwI5HhI_HcJRHzJCIJI5IfI0I1IzJXI2JvI8KDJEKTJSKlJBK7I_K8I8K7',
    ")": '40.7|IAKlIOKRIaJ1IfJZIeI5IaIjIUITIMIDIAHzITHcIlHxI1IQI9IvI_JTI7JzIxKRIfKvIVK7ITK8IRK7',
  } },
  cjk: { c: 65, g: {
    "五": '84|IRJ5ITJ3JBJ3JDJ1I8JXIbJXIYJVIZJHI3JHI5JFItILILIKILH8KdH8KeH9KeIJKdIKKHILKHJVKFJXJPJXJOJZJVJ3KXJ4KXKGITKHIRKF/J1JHJ2JFJ2ILJ1IKI_ILJLJG',
    "金": '84|I5J1IfJkILJbIKJZITJOIpJXIpJRIrJQJMJPJMJBJLJAIXJAIVI_IVIzIXIxJLIxJMIvJMILIRIKIQH9ITH7KZH8KZIKJdILJdIvJfIxKTIxKWIzKWI9KWI_KTJAJfJAJdJBJdJPJ9JQJ_JRKAJXKBJYKXJNKaJPKfJaJzJyJgKDJhKHJRKL/JVJ3JjJrJ0JfI1JfJTJ2;IgInIzINJBIRJBITI_IXIxIrIvItIpIr;JpITJ3INJ9ITKKInJ9IsJ6Ir',
    "大": '84|JLJvJLJnJJJmINJlINJZIPJWJFJWJIJVJAI_I2ItIlIaILIFILIDISH5IVH4ItILJDIlJVJHJfIvJrIcKBIFKRH5KVH2KXH3KeIDKJISJ2InJoI_JhJVJjJWKbJWKdJZKdJlJdJmJbJnJdKJJMKJ',
    "特": '84|InJrIiJrIjJ7IZJ-IUJ9IQJfILJJIXJDIZJFIfJZIlJbInJZInI7IjI4ILIzIKIxINIkInIpInH5IpH3I1H3I3H5I3ItI5IwJDIzJEI1JDJBI5JAI3JBI3JZI5JbJEJbJFJpI3JrI3KJInKJ;JrJ6JIJ5JIJtJJJsJpJrJrJrJrJpJrJbJNJbJLJZJLJNKaJNKbJZKZJaJ8JbJ7JpJ9JrKdJsKeJtKeJ5J9J6J7J7J7KJJrKJ;J_I_J9I9JJI9JHI7JHIvJJIuJ_ItJ_IJJ9IHJ3IGJpIHJnIGJrH4KFH4KLH7KOH_KPIFKPItKfIvKfI7KdI9KQI9KPJHKNJIJ_JH;JOIjJPIhJjILJxITJdIqJYIp',
    "賣": '84|JNKFJLKEINKEIMJ7IPJ5JLJ5JNJ3JLJzITJzISJrITJoKVJoKXJpKXJxKVJzJfJzJdJ0JdJ3JfJ5KbJ5KdJ7KdKDKbKEJfKEJdKFJbKLJOKL;IUJJIVJGKWJHKVJiIXJjIUJh/I5JXI5JRIlJQIjJRIjJXIlJY/JfJYJgJRJLJQJJJRJJJXJLJY/KFJYKGJRJxJQJwJRJwJXJxJY;IeINIfILIrIKItIJILIDIKIBIRH2IrH7JDICJIIFJEIJJFIKKJILKLIMKLI_KJJBIhJBIeI_/J7I2J8IzJ7IxIvIxIuI1IvI2/J7IpJ8IlJ7IkIvIkIuInIvIp/J7IbJ8IXIvIWIuIZIvIb;JmH_JnH8KDH6KXH1KaH3KfIBJ_IIJtIJJpIH',
    "港": '84|INKBIOJ_IlJpItJxIvJ1IdKHIZKKIVKJ;JHJ6IzJ5IxJ3IxJtIzJsJHJrJIJdIxJcIwJbIvJRIxJOJJJNI9JAIqIzIzInI9ItI_IDJHH6JPH5KFH5KPH7KVH_KZIIKaIPKXISKNIUKIIJKFIIJRIIJOILJNIVJPIWKDIWKFIzKRIrKZInKgIzKPI-KCJNKcJPKbJcKEJdKFJrKZJsKbJtKbJ3KZJ5KFJ6KDKKJ0KJJzJ5JZJ5JXKKJIKJ/JzJrJ0JdJZJcJYJpJZJr/JvJOJ4JBJ1JAJVJAJTJBJdJO/JzIyJ0IxJ0IlJPIkJNIlJNIxJPIy;IKJVIlJCIuJNItJPIdJcISJh;IWIZIKIBIXH4IZH5IhIJItInIhIwIeIv',
    "口": '84|IZH9IpH8IqIHIrIIJ_IIKBH8KRH9KRJ_KNKBIbKBIZJ_/KAJxKAIXIqIXIqJvIrJx',
    "路": '84|JZJ7JFJoJEJrJDKGIQKFIQJVImJTImIPIhIMIgINIgJHIdJJITJJIRJHIRIJIKIFINH5IRH4InH-JIILJHIXJFIZI5IUI2IVI2IvJFIwJHI_JLI5JPI4JxJKKHI-KXI4KfJDKfJGKAJTKAJVKMJhKWJvKVJ-JxJ_JzKHJlKL/IzJ3IzJjIfJjIfJ1IhJ3/KDJvJ2JhJxJeJpJnJkJvJlJw/JNJcJZJjJkJVJZJOJEJFJHI_I3I_I2JTJEJVJEJlJFJn;JPH4JdH3JhH9KDH9KHH3KVH4KVI2JPI1/KDInKFIlKFINKDIMJhIMJfINJfIlJhIn',
    "藥": '84|ItKBINKBILJ_ILJ1ItJ0IuJzIuJtIxJsI9JsI_J0JRJ0JRKAI_KBI9KKIuKJ;JrKBJZKAJYJ1JrJzJrJtJtJsJ7JtJ7JzJ9J0KeJ1KdKAJ9KBJ7KJJrKJ;JIJlI-JjI-IxI_IwJpIvJrIxJrI3JtI5JvIwJxIuKPIzKTIsKeIxKXJFKNJDKLI-KDI9KOJJKaJbKPJhKIJXKAJXKNJrKBJwJ3JfJvJVJxJKJ-JJJtI5JrI7JrJjJZJlJbJuJRJwJMJv/JbJYJcJRJPJQJNJRJNJXJPJY/JbJEJcI9JPI8JNI9JNJDJPJE;IYJfINJTIPJJIfJJINI4IOIvIZIuItIxIxIsI7IuI8IxI2JDIzJEIrJCIqJDI7JZIxJfIpJXIhJXIsJnIrJqIhJt/IrI9IlI8IkI9IpJC;JNInJLImINImIMIlIMIbIPIZJLIZJNIXJNH5JPH3JbH3JdH5JdIXJfIZKbIZKfIbKfIlKdImJfImJbIsJNIr;IhIMILIFIRH6ITH5IfH9I9ILI_INI5ITI1IWIyIV;JrINJsILKDIBKTH4KXH5KeIDJ9IUJ1IWJyIV',
    "局": '84|IaJFIYIrISITIJH_IVH2IbH_IlIbIrJBKHJBKJJBKJI7KGIJKBIFJtIGJtIDJxH2KHH2KRH7KVIDKXITKZJPItJQIrJRIrJbKVJcKWKFIaKF/KDJ4KFJ3KFJrItJqIrJrIrJ3;I1INJ3INJ4I1J3I3I1I3/JnIpJoInJoIbJFIbJFIp',
    "封": '84|IrJ1IRJ0IPJzIPJpIRJmIrJmIsJVINJUILJTIMJHJZJHJZJTI8JVI8JlI9JmJVJnJVJ0I9J1I8J3I8KJIsKJ;KCJrJbJqJZJpJZJdJbJcKCJbKCIJJ_IHJnIHJlIFJrH3KDH3KJH4KQH9KSIDKTJbKfJdKfJpKdJrKTJrKSKJKCKJ;JeJJJeJHJsIhJvIgJ6InJ6IpJwJHJsJPJoJP;IrIzIRIyIPIxIQIlIRIkIsIjIsININIGIMIFIRH4I7IBJZIJJZIYI9IQI8ITI8IjJVIlJVIyI9IzI7JBIsJB',
    "城": '84|IaJjIZJhINJhIMJfIMJTIaJRIaIhIJIXIPIKInIXI1IhIzIvIrIrIqItIqJRI2JTI3JfI1JhIrJhIqJjIqKJIaKJ;JrJ2I7J1I6IrI0ITIqH_I1H2I9IBJFIXJJItJJJDJXJDJVIfJIIdJMIPJTIOJdIRJkIZJmJRJjJTJKJTJJJlJLJnJrJnJsJlJtJHJyIfJUIBJWH_JfH2J3INKCH7KLH3KPH3KWH7KbIFKfITKfIZKTIeKOILKLIJKGIRKCIdKQI5KZJXKNJcKLJbJ_I4J9I_J7JbJ7JlJ9JnKdJnKdJ1KVJ2KUJ3KaJ_KJKKKAJ_KNJ3KLJ1J9J1J7J3J6KJJsKJ',
    "中": '84|JMJxJLJwITJvITIpJLIoJMInJMH5JPH3JbH3JdH5JdInKXIpKXJtKVJwJfJwJdJxJdKJJMKJ/JMJfJMI5JLI3IlI3IkI5IkJfIlJg/KGJfKFI4JfI3JdI5JdJfJfJg',
    "立": '84|JDKHJMJzJNJxJLJwIQJvIRJgIqJfIhJZIhJXIsI1I1INIzILINILILIJILH9KdH8KdILJ3ILJ1INKBI3KIJXKHJZJ-JfKZJgKaJvJhJwJUKLJTKMJOKL/J4JfJsIpJkIPJhILJHILJGINI_ItIxJg',
    "即": '84|IQIRINIJIRH-ITH8IZH-JBIOJEINJJH_JVICJXIFJRIVJDIyI_IyI1ItI9IdIpIUIjISIgITIhI4JNI5JQI7JQKHIQKH/I_J6JAJ5JAJpIhJoIhJ6/I_JaJAJZJAJJI_JIIhJIIhJa;JeH5JhH3JtH4JvH5JvJ3JxJ4KJJ4KKJ3KKIZKHIWJyIVJ3IHKFIGKRIIKYINKbIXKaKHJeKH',
    "撤": '84|JHJ8I0J7I1JvI_JvJBJtI0JdI2JRI9JQJbJWJfJPJpJUJrJTJpJLJxJCJzJBKBJhKJJhKIJJKFI2KBJDJ9JDJzI_J9IbJ2IPJqH_J0H3J3H3KFIKKXH2KgIBKOIbKVI9KYJfKZJhKeJjKeJvKFJwKIKJJ7KMJxJlJrJVJfJsJTJnJVJjJTJhJJJfJIJhJTJvJtJvJvJxJvJ7JZJ8JbKIJNKL;IZJxIXJvINJvILJtILJhIZJfIZI_IKI3IOIrIXIuIZItIZIJIXIHINIHILIFIPH5IRH3IhH4InH-IoIDIoI1I0I9IyJLIrJIIoJJIoJfIyJhIyJtIxJvIoJxIoKJIZKJ;I4IlI2IVIyIHItH_I5H2JAIBJFISJJIMJXISJZIRJYIHJMIFJPH6JTH3JhH4JlH7JnIBJoJJI4JJ/JXI9JYI7JYIzJHI3JHI8/JYIjJRIeJGIbJHIoJTImJXIu',
    "離": '84|InKHIqKBIpKAILJ_ILJyJXJxJbJzJbJ_I9KAI2KLIxKL;JeJvJXJfJVJhJVJrJIJrJHJNIgJNIhJlIpJgIrJdIhJVInJPIrJOI1JWI9JPJAJPJHJXI-JfJHJpJBJtI9JvI1JnIpJtIhJlIfJsITJrISJBIVI_ItI_IrI2IhI2IgI5IdI6ITI6IQI5IPI2ILI1ILIrIQInIRH4IfH4IhIQIlIII7INI9IJI_IIJHIMJJIJJHIFI9IFI7IDI-H5JBH3JPH4JVH9JXIDJXI1I6I3I7I-I9I_JVJAJXJNJZJIJbJHJfJMJgJLJgH5JhH4JtH3JvH5JvH9JxH_KbH_KeIBKdIOKLIPKLIfKaIhKaItKZIuKMIvKLI_KNJBKZJCKaJNKZJPKNJPKLJRKLJfKNJhKbJiKcJvKNJxKHKDKFKHKDKIJ2KFJ-JxJvJwJ0KJJtKLJmKL/J8JhJ8JRJ7JPJxJPJvJRJvJfJxJh/J8JBJ8IxJ7IvJwIvJvI_JxJB/IpInIlIVIhISIgIVIgInIhIp/JHIpJIInJHIQJBIjI4IhI4IfI5IZI1IXI0IZI5Ip/J8IfJ8IPJ7IOJvIPJvIfJxIg',
    "旅": '84|IdKHIjJ3ILJ1ILJnIYJlIXJDIUIlIQITIJIDIVH3IbIDIfIPIjIhInJDIpJEI0JDIyILIvIHIhIGIgIFIjH5IlH3I3H4I_H_JBIFJDIpJEJTIpJUIoJVIpJmJHJmJIJlJBJdJLJUJPJXJfJqKdJrKdJ3KcJ5JpJ6JoJ7JtKHJfKMJUJ1JJJnJIJpJIJ1IzJ3IsKLInKL;JtJaJTJVJRJTJRILJNIDJRH4JhH7J5IDJ6IFJ3IRJhILJhJHJlJKJ7JOKVJYKXJZKPJjKNJkKIJj;JxJFJvJDJ2IhJ9ITKFIFKRH4KVH3KfIBKOITKGIjKTIzKcJBKPJIKBI2J9JHJ5JH',
    "館": '84|IbJ6IKJtINJfIPJeIbJmIfJiI7JiI9JjI9JpI_JqJFJkJNJvJOJtJPJbJWJZJWH5JZH3JlH4JnH-KZH_KZIrJnIrJmItJmI1KUI3KUJZKVJbKcJbKdJdKdJ5J_J6J3KLJzKMJpKJJmKHJsJ7JrJ6JPJ5JNJxI4KDI4KFI5KHI3KJItKMIpKL/IvJ4IzJ1I4JxI3JwInJxItJ4/KLJsKNJrKNJhJhJgJfJhJfJr/KDJSKEJFKBJEJnJEJmJFJmJRJnJS/KJIcKKINJnIMJmINJmIbJnId;ISIJIQIFITH5IXH4IfH6I5IEI7IEI_H7JLIBJMIDJHIPI9IiIwIbIzISIlIMIiINIiIjIjIkJHIlJHJbITJb/I3JOI4JHIjJGIiJNIjJO/I3I7I4IzI3IxIjIxIiI5IjI7',
    "檢": '84|JQJ1I6JnI5JlJBJbJDJaJPJiJRJhJRJbJTJaKDJaKFJbKFJhKHJiKXJaKaJbKgJlKfJnKBJ4J1KDJ1KIJrKMJmKL/J9JpJZJpJrJ4;IeJtILJrILJfIdJdIWJJIIIxIPIiIRIgIdI2IeIzIeH5IfH3IrH3IuH5IvJCI1I3I3I3I_I_JBIoJlInJnIpJnJRJlJTJBJSI_JBIuJbIvJeI5JfI5JlI5JrIuJtIuKJIeKJ/JYJFJYI3JXI2JPI3JPJF;JxIoKXIoKXJSJzJTJwJR/KIJFKJI3KHI2J-I3J_JF;JEITIyH_I7H2I9H2JDH6JRIKJfH_JhIAJpILJZIZJdIhJPImJOIl;JyIPJlH_JtH3JxH2KBIJKXH3KgIBKfIDKIIXKLIhJ_ImJ8Il',
    "疫": '84|JOKHJSJ_JRJ-IjJ9IiJHIKI1IPIpIRIoIhI0IiIxIeIZIWILIMH_IXH2IbH5IlIFIrIQIwIdIzI1IzJvKbJvKeJxKdJ-JnJ-JkJ_JfKKJcKL;ILJxIKJvIQJTITJRIdJUIfJXIZJzIXJ1IRJz;JGJRJBJKI2JDI9I3JJI9JQJDJWJNJZJaJzJZJ0JBJ2I9J7I6KdI7KdJHKEJJKDJoJHJn;I4IlJBIkJLIYJVIPJVINJFIIIrIEIxH2I5H2JNH7JnIDKDH6KZH2KbH3KgIDKfIFKLIIJ6INKIIZKTIlKTIxKRIzI7IzI4Ix/J5IkJ8IjJxIaJnIVJbIeJWIjJXIk',
    "區": '84|ILJ7IMJ5ITJ3ITILIVIDIYH_IdH8IjH7KbH7KfH9KfIHKdIIIpIJIlIKIjINIjJ4KbJ5KdJ7KdKFKbKGIPKHILKF;I5JLKFJLKFJvI5Jv/JzJjJ1JhJ1JZJzJXJLJXJJJZJJJhJLJj;IrITJbITJbJBIrJB/JMIzJLIgI7IgI7Iz;JkITKUITKTJCJkJB/KFIzKFIhJzIhJzIz',
    "禁": '84|IpJ_IMJ9INJwIlJwInJvIZJiIJJXIRJLIdJSIpJdIpJNI3JMI5JNI5JdI7JeJHJXJOJhJNJkI6JvJPJxJPJ9I7J-I5J_I5KJIpKJ;JvJ_JtJ-JVJ9JVJxJsJvJhJlJMJXJTJNJVJMJdJQJtJdJvJbJvJNJ9JMJ_JNJ_JdKBJdKWJNKYJNKfJXKeJZKAJvKbJxKbJ9KBJ-J_J_J_KJJvKJ;IWI7IXI6KSI7KSJFKPJHIXJH;IKIjINIhJMIhJMH5JPH3JbH3JdH5JeIhKbIhKeIjKeIvKbIwILIv;IjISIKIFIRH7ITH6IXH6InICI-ITI9IVIzIcIvIb;JsITJtIRJ_IIKTH6KVH6KeIDKfIFKJIUJ3IdJzIb',
    "止": '84|JQILJNIKIxIKIvILIvJvItJyIfJyIeILILIJILH7KdH6KeIHKdIKJjIKJhILJhJLKVJMKXJNKXJZKVJbJjJbJhJdJhKJJQKJ',
    "進": '84|IQKBIpJsIzJ3IhKHIbKLIZKL;JEJtI0JTI9JGJDJNJFJNJFIVKdIVKcIhKbIiJ7IjJ7IvKXIwKYI7KXI-J9I-J7I_J8JLKXJMKYJXJ9JYJ7JZJ7JlKZJmKbJnKaJzJ9J1J1KIJzKLJxKMJlKHJsJ1JrJ0JZJ0JgKHJdKJJQKL/JrJlJrJZJVJZJVJl/JrJLJrI_JpI-JVI-JVJL/JrIvJrIjJVIjJVIv;ILJaIgJZINI7IOIvIjIvIlItIgIfIaITIKH_IVH2IYH3InIKI1IBJJH6KZH5KcH7KfIIJPIII_IMIzISIuIXI1IvI1I7IzI9IlI9IiI_IzJZIzJnILJn',
    "入": '84|I7J4JNJ3JPJ1JMJlJGJRI8I7IwIpIgIXIKIFIKIDIVH4IuINI5IZJFIrJVJOJhIzJwIbKMH9KRH4KVH4KeIDKPIRKAIhJuI9JoJLJiJhJeKFJbKHI9KHI6KF',
    "西": '84|ILJ5INJ3I5J3I7J1I7JjI5JhIXJhIUJfIUH5IlH5IlIBInICKDICKFH4KVH5KVJfKTJhJvJhJtJjJtJ1JvJ3KdJ4KeKFILKF/JcJ3JdJjJbJhJNJhJLJjJLJ1JNJ3/I5JSI7JRI7JNI2I5InIlIlInIlJRInJS/JdJRJdItJhInJrIjJ9IjKAIlJ_IyJxIzJuI1JtJRKEJRKEITKDIRInIRIlITIlIjInIlIvIdIzIcJBIrJHI5JLJRJNJS',
    "街": '84|IaJ5IKJrIRJeIXJgIiJrI1KEI1KGIpKLImKJ;JKJ5I3J4I2J3I3JrJJJrJLJpJLJXI1JWI0JVI0JJJxJIJyJVJxJWJbJXJbJqJvJrJxJtJxJ3JvJ4JbJ5JaKJJLKJ;J4J5J5J2KdJ3KdKDKbKFJ5KF;IaJNIKI7IRIsIZIxIZH5IbH2IpH3IqJHI2JfI1JiIrJmIoJl;J2JPJ3JOKDJNKEJLKEIJKBIGJzIFJzIDJ3H4J_H3KLH4KQH7KUIBKUJLKVJNKdJNKfJPKfJZKdJcJ2Jb;JLI1JJIzI3IzI1IxI1InI3ImJLIlJLINIyIHI1H6JRH-J3IJJ1IWJdIQJbIRJbIlJxInJwIzJdIzJbI1JbJBJLJB',
  } },
};
// LED panel raster for the CJK ticker: 16 x 16 dots per character, rendered from SimSun 16 px in headless Edge.
const LED = {
  "封": ['....#.......#...', '....#.......#...', '....#.......#...', '.#######....#...', '....#....######.', '....#.......#...', '########....#...', '.........#..#...', '....#.....#.#...', '....#.....#.#...', '.#######....#...', '....#.......#...', '....#.......#...', '....####....#...', '####......#.#...', '.#.........#....'],
  "城": ['..#.......#.#...', '..#.......#..#..', '..#.......#.....', '..#..##########.', '..#..#....#.....', '######....#.....', '..#..#....#..#..', '..#..####.#..#..', '..#..#..#.#..#..', '..#..#..#.#.#...', '..#..#..#.#.#...', '..####..#..#....', '###..##.#..#..#.', '.#..#..#..#.#.#.', '....#....#...##.', '...#....#.....#.'],
  "中": ['.......#........', '.......#........', '.......#........', '.......#........', '..###########...', '..#....#....#...', '..#....#....#...', '..#....#....#...', '..#....#....#...', '..#....#....#...', '..###########...', '..#....#....#...', '.......#........', '.......#........', '.......#........', '.......#........'],
  "立": ['......#.........', '.......#........', '.......#........', '................', '.#############..', '................', '...........#....', '...#.......#....', '....#.....#.....', '....#.....#.....', '.....#...#......', '.....#...#......', '.....#..#.......', '................', '###############.', '................'],
  "即": ['................', '.######..#####..', '.#....#..#...#..', '.#....#..#...#..', '.######..#...#..', '.#....#..#...#..', '.#....#..#...#..', '.######..#...#..', '.#.......#...#..', '.#..#....#...#..', '.#...#...#.#.#..', '.#..#.#..#..#...', '.#.#..#..#......', '.##......#......', '.........#......', '.........#......'],
  "撤": ['..#...#.....#...', '..#....#....#...', '..#..#####..#...', '..#...#....#....', '####.#..#..####.', '..#.######.#.#..', '..#......##..#..', '..#..####..#.#..', '..##.#..#..#.#..', '###..####..#.#..', '..#..#..#..#.#..', '..#..####...#...', '..#..#..#...#...', '..#..#..#..#.#..', '#.#..#..#.#..#..', '.#...#.###....#.'],
  "離": ['...#......#.#...', '....#.....#..#..', '.#######.#......', '...#.#...######.', '.#..#..###..#...', '.#.#.#.#.#..#...', '.#.....#.######.', '.#######.#..#...', '....#....#..#...', '.#######.######.', '.#.#...#.#..#...', '.#.#.#.#.#..#...', '.#.###.#.#..#...', '.#.....#.######.', '.#...#.#.#......', '.#....#..#......'],
};
