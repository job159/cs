// 失落之城 LOST TOWN — zone 'north': 北大道與鐵路橋 (North Avenue + Rail Bridge), x -26..26, z -80..-26.
// Recreates the long north arm of CSO's "Lost City" (zs_lostcity): an 18 m street canyon of 1900-1930s walk-ups
// running 36 m from the central intersection to a riveted railway bridge whose parapet carries the tilted cream
// LOST TOWN letter boards; under the bridge a dark underpass sealed by a white container and crate stacks.
//   west  N_W1 deli block (enterable DELI, hero DELICATESSEN blade, red/white awning, 2F spawn window)
//         N_W2 FRESH FISH flats (blue fascia, awning, fire escape)   N_W3 First National Bank (stone, bronze letters)
//   east  N_E1 fire-escape flats (NEWS · TOBACCO, spawn window)       N_E2 bakery (awning)
//         N_E3 warehouse offices (faded ROYAL OATS wall ad over the NE service alley AL_NE)
//   LM_BRIDGE (x -26..26, z -74..-62): plate girders on stone-faced abutments, catenary masts, LOST TOWN boards,
//         hanging '↑ N QUARRY ST · 採石場街' sign, caged sodium lamps; underpass x -7..7 to the pocket wall at z -76.
// All geometry, signage wording, brands and art are original (docs/MAP_LOSTTOWN.md §0). Lettering = outlines traced
// from text we rendered ourselves with installed system faces (GLYPHS, end of file). Every number the runtime or other zones depend
// on (footprints, spawners, lights, blockers, props) comes from tools/map/losttown/layout.mjs.
//
// Seams (same rules as the center zone): street y 0, sidewalks y 0.15 (concrete_floor, 0.3 m granite curb) on the
// carriageway edges x = ±5.5, centre-line dashes at world z in [9k, 9k + 3], yellow edge lines at x = ±5.1, buildings
// stand at y 0.13. Nothing hangs over the carriageway z -62..-26 (final boss runway; it lands at (0, 0, -40)).
// Spawners, L_DELI / LB_BRIDGE_1 / LB_TUNNEL_END and the zones come from layout.toMapJson() / LIGHTS.
import { MATERIALS } from '../../lib/materials.mjs';
import { ensureCCW } from '../../lib/kit/core.mjs';

const PI = Math.PI;
const SW = 0.15;   // sidewalk top
const BY = 0.13;   // building base (2 cm below the sidewalk top: no crack at the wall foot)

// Zone-local palette additions. nz_ink* share every visual key with 'wire' (untextured, not lightmapped), so the
// compiler folds them into one GPU material and moves the colour into the vertex tint; nz_fabric = white canvas.
const ZONE_MATS = {
  nz_fabric: { set: 'canvas', surf: 'wood', tile: 1.2, color: '#ffffff', lm: 1, side: 'double' },
  nz_wood: { set: 'wood_siding', surf: 'wood', tile: 1.3, color: '#ffffff', lm: 1 },
  nz_ink: { set: null, surf: 'metal', color: '#1f1c19', rough: 0.7, lm: 0, cast: false },
  nz_ink_white: { set: null, surf: 'metal', color: '#e8e3d6', rough: 0.7, lm: 0, cast: false },
  nz_ink_red: { set: null, surf: 'metal', color: '#9c2a21', rough: 0.7, lm: 0, cast: false },
  nz_ink_gold: { set: null, surf: 'metal', color: '#c39a4a', rough: 0.7, lm: 0, cast: false },
  nz_ink_rivet: { set: null, surf: 'metal', color: '#56645a', rough: 0.7, lm: 0, cast: false },
  nz_bronze: { set: null, surf: 'metal', color: '#7d5b34', rough: 0.42, metal: 1, lm: 0, cast: false, env: 1.2 },
};
for (const [k, v] of Object.entries(ZONE_MATS)) if (!MATERIALS[k]) MATERIALS[k] = v;

// ---------------------------------------------------------------------------------------------------- small helpers
const circle = (r, seg) => { const out = []; for (let i = 0; i < seg; i++) { const a = (i / seg) * PI * 2; out.push([Math.cos(a) * r, Math.sin(a) * r]); } return out; };
const rectProf = (w, h, oy = 0) => [[-w / 2, oy - h / 2], [w / 2, oy - h / 2], [w / 2, oy + h / 2], [-w / 2, oy + h / 2]];
const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
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
/** Axis-aligned vertical quad: plane 'x' or 'z' at pos, facing sign (+1/-1), u range along the other axis, y range. */
function vq(kit, mat, plane, pos, sign, u0, u1, y0, y1, o = {}) {
  let P;
  if (plane === 'x') P = sign > 0 ? [[pos, y0, u1], [pos, y0, u0], [pos, y1, u0], [pos, y1, u1]] : [[pos, y0, u0], [pos, y0, u1], [pos, y1, u1], [pos, y1, u0]];
  else P = sign > 0 ? [[u0, y0, pos], [u1, y0, pos], [u1, y1, pos], [u0, y1, pos]] : [[u1, y0, pos], [u0, y0, pos], [u0, y1, pos], [u1, y1, pos]];
  kit.face(P, mat, o);
}
/** Horizontal quad at y, facing up (up = true) or down. */
function hq(kit, mat, y, x0, z0, x1, z1, up, o = {}) {
  const P = [[x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]];
  kit.face(up ? P : P.slice().reverse(), mat, o);
}
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
function glyph(font, ch) {
  const key = font + '\u0000' + ch;
  if (glyphCache.has(key)) return glyphCache.get(key);
  const F = GLYPHS[font];
  const s = F.g[ch] ?? F.g[ch.toUpperCase()];
  let out;
  if (s === undefined) out = { adv: F.c * 0.62, shapes: [] };
  else {
    const [adv, body] = s.split('|');
    const dec = (t, i) => (((B64I[t[i]] << 6) | B64I[t[i + 1]]) - 512) / 2;
    const shapes = body ? body.split(';').map((sh) => sh.split('/').map((lp) => { const pts = []; for (let i = 0; i < lp.length; i += 4) pts.push([dec(lp, i), dec(lp, i + 2)]); return pts; })) : [];
    out = { adv: +adv, shapes };
  }
  glyphCache.set(key, out);
  return out;
}
/** Emits one glyph with its pen origin at (x, y) (baseline), scale sx/sy (m per px). */
function glyphAt(kit, font, ch, x, y, sx, sy, o) {
  const g = glyph(font, ch);
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

/** Weathered sign board (wall-local): bbox panel + optional border strips. */
function board(kit, x0, x1, y, h, o = {}) {
  kit.bbox({ x: (x0 + x1) / 2, y, z: (o.z ?? 0) + (o.d ?? 0.12) / 2, w: x1 - x0, h, d: o.d ?? 0.12, bevel: 0.02, mat: o.mat || 'sign_white', tint: o.tint });
  const zf = (o.z ?? 0) + (o.d ?? 0.12) + 0.002;
  if (o.border) {
    const b = o.border, bw = b.w ?? 0.04, ins = b.inset ?? 0.07;
    kit.face([[x0 + ins, y + ins, zf], [x1 - ins, y + ins, zf], [x1 - ins, y + ins + bw, zf], [x0 + ins, y + ins + bw, zf]], b.mat, { tint: b.tint });
    kit.face([[x0 + ins, y + h - ins - bw, zf], [x1 - ins, y + h - ins - bw, zf], [x1 - ins, y + h - ins, zf], [x0 + ins, y + h - ins, zf]], b.mat, { tint: b.tint });
    kit.face([[x0 + ins, y + ins + bw, zf], [x0 + ins + bw, y + ins + bw, zf], [x0 + ins + bw, y + h - ins - bw, zf], [x0 + ins, y + h - ins - bw, zf]], b.mat, { tint: b.tint });
    kit.face([[x1 - ins - bw, y + ins + bw, zf], [x1 - ins, y + ins + bw, zf], [x1 - ins, y + h - ins - bw, zf], [x1 - ins - bw, y + h - ins - bw, zf]], b.mat, { tint: b.tint });
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
  const nz = Math.hypot(drop, depth), oy = (-depth / nz) * 0.015, oz = (-drop / nz) * 0.015; // underside offset (no z-fight)
  for (let i = 0; i < n; i++) {
    const a = x0 + i * s, b = a + s, tint = o.colors[i % o.colors.length];
    if (torn.has(i)) {
      kit.face([[a, y - drop * 0.25, depth * 0.25], [b, y - drop * 0.2, depth * 0.2], [b, y, 0.02], [a, y, 0.02]], 'nz_fabric', { tint });
      if (hang.has(i)) kit.face([[a + 0.03, y - drop - 1.0, depth - 0.08], [b - 0.05, y - drop - 0.75, depth - 0.04], [b, y - drop, depth], [a, y - drop, depth]], 'nz_fabric', { tint: shadeHex(tint, 0.9) });
      continue;
    }
    kit.face([[a, y - drop, depth], [b, y - drop, depth], [b, y, 0.02], [a, y, 0.02]], 'nz_fabric', { tint });
    kit.face([[a, y + oy, 0.02 + oz], [b, y + oy, 0.02 + oz], [b, y - drop + oy, depth + oz], [a, y - drop + oy, depth + oz]], 'nz_fabric', { tint, shade: 0.62 });
    kit.face([[a + 0.015, y - drop - val, depth], [b - 0.015, y - drop - val, depth], [b, y - drop, depth], [a, y - drop, depth]], 'nz_fabric', { tint });
    kit.face([[b - 0.015, y - drop - val, depth - 0.012], [a + 0.015, y - drop - val, depth - 0.012], [a, y - drop, depth - 0.012], [b, y - drop, depth - 0.012]], 'nz_fabric', { tint, shade: 0.6 });
  }
  for (const xx of [x0, x1]) {
    const tri = [[xx, y, 0.02], [xx, y - drop, depth], [xx, y - drop - val, depth]];
    kit.face(xx === x0 ? tri : tri.slice().reverse(), 'nz_fabric', { tint: o.colors[0] });
  }
  kit.sweep(circle(0.02, 6), [[x0, y - drop, depth - 0.02], [x1, y - drop, depth - 0.02]], 'steel_dark', { smooth: true });
  for (const xx of [x0 + 0.05, x1 - 0.05]) kit.sweep(circle(0.016, 6), [[xx, y - drop - 0.55, 0.02], [xx, y - drop, depth - 0.03]], 'steel_dark', { smooth: true, up: [1, 0, 0] });
  kit.box({ x: (x0 + x1) / 2, y: y - 0.02, z: 0.04, w: x1 - x0 + 0.1, h: 0.1, d: 0.08, mat: 'steel_dark', tint: '#3a3632' });
}
/** Bill poster on a wall plane z (wall-local) with a header band and text rows; peel curls a corner off. */
function poster(kit, x, y, w, h, z, o = {}) {
  const tint = o.tint || kit.pick(['#e6dfcc', '#d9c27a', '#c96a4a', '#7fa3b8', '#e2d6b8', '#b8c99a', '#d48a5a', '#9fb0a0']);
  const rz = o.rz ?? kit.rnd(-0.04, 0.04);
  kit.at({ x: x + w / 2, y: y + h / 2, z, rz }, () => {
    const X0 = -w / 2, X1 = w / 2, Y0 = -h / 2, Y1 = h / 2;
    kit.face([[X0, Y0, 0], [X1, Y0, 0], [X1, Y1, 0], [X0, Y1, 0]], 'sign_white', { tint, shade: kit.rnd(0.78, 1) });
    if (o.head) textLine(kit, o.head, { font: 'sans', x: 0, y: Y0 + h * 0.66, h: Math.min(h * 0.16, (w * 0.8) / Math.max(1, o.head.length * 0.75)), maxW: w * 0.84, align: 'center', z: 0.002, mat: o.headMat || 'nz_ink', tint: o.headTint });
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
      kit.box({ x: kit.rnd(-0.05, 0.05), y: -0.09, z: 0, w: x1 - x0 + kit.rnd(0.15, 0.35), h: 0.18 + kit.rnd(-0.02, 0.03), d: 0.025, mat: 'nz_wood', tint: kit.pick([tint, shadeHex(tint, 0.85), shadeHex(tint, 1.1)]), uvOffset: [kit.rnd(0, 3), kit.rnd(0, 3)] }));
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
  if (o.kind === 'metal') for (let x = 0.4; x < L - 0.2; x += o.bracket ?? 1.15) {
    kit.box({ x, y: y - 0.85 - 0.32, z: 0.11, w: 0.14, h: 0.34, d: 0.22, mat: o.mat, tint: o.tint, faces: { nz: false } });
  }
  if (o.kind === 'stone') for (let x = 0.12; x < L - 0.1; x += 0.3) kit.box({ x, y: y - 0.86, z: 0.07, w: 0.13, h: 0.14, d: 0.1, mat: o.mat, tint: o.tint, faces: { nz: false } });
}

// ---------------------------------------------------------------------------------------------------- buildings
/**
 * Block of the north arm. Footprint rect x0..x1 / z0..z1 (block-interior strips x ±24..26 are folded in), storeys
 * fl[], parapet. faces: [{ side: 'E'|'W'|'N'|'S', span: [s0, s1] (world axis range), from: world y (party walls:
 * only the part above the neighbour), ground(e) -> openings (world y), cols, win, mod(f, k, op), floors [f0, f1],
 * pipes, belts, pilasters, decor(e, ops) }]. Openings use world y (converted per wall).
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
    // local x of a world axis value along this face
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
    // walls: ground storey (own material) + upper storeys
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
  // roof (parapet + coping + tar + clutter), collision, ground cut-out
  kit._flatRoof(poly, top, { type: 'flat', parapet: B.parapet, mat: 'roof_tar', coping: B.coping || 'trim_concrete', clutter: B.clutter !== false }, { mat: B.mat, tint: B.tint });
  kit.colPrism(poly, B.colFrom ?? base, top + B.parapet, kit.material(B.mat).surf);
  kit.solid(poly, base, top);
  B.extra?.(ctx);
  return ctx;
}

// ---------------------------------------------------------------------------------------------------- zone entry
export function build(kit, L) {
  street(kit, L);
  westBlocks(kit, L);
  eastBlocks(kit, L);
  alley(kit, L);
  bridge(kit, L);
  beyond(kit);
  props(kit, L);
  // the bridge deck (SP_N_BRIDGE stands on it) never becomes walkable nav: zombies drop from it into the avenue
  kit.nav('block', rect(-26, -74.2, 26, -61.8), { y0: 5.0, y1: 9.0 });
  canyonFill(kit);
  return {};
}

/**
 * Baked bounce fill. The one-bounce bake misses the light reflected back and forth between the facades of an 18 m
 * canyon with 15-29 m walls, so street level ends up near-black (no auto exposure in game). Soft, warm-grey,
 * linear-falloff baked lights at mid height stand in for it (same idea as building() interior fills). Never realtime.
 */
function canyonFill(kit) {
  for (const z of [-29.5, -37.5, -45.5, -53.5]) kit.light({ pos: [0, 8.5, z], color: '#d6ccbb', intensity: 9, decay: 1, range: 22, radius: 2.0, name: 'fill' });
  kit.light({ pos: [0, 4.7, -60.4], color: '#c9ccc8', intensity: 4.5, decay: 1, range: 11, radius: 1.0, name: 'fill' });
  kit.light({ pos: [-5.0, 2.3, -60.2], color: '#c9ccc8', intensity: 1.6, decay: 1, range: 5.5, radius: 0.3, name: 'fill' });  // bridge portal + barricade
  kit.light({ pos: [12.0, 4.5, -51.5], color: '#cfc6b6', intensity: 4.5, decay: 1, range: 10, radius: 0.8, name: 'fill' });  // alley mouth
  kit.light({ pos: [19.5, 4.5, -51.5], color: '#cfc6b6', intensity: 3.0, decay: 1, range: 9, radius: 0.8, name: 'fill' });  // alley pocket
}

// ==================================================================================================== street
function street(kit, L) {
  // ---- carriageway: avenue z -62..-26 + underpass to the pocket wall (z -76); pothole N_POTHOLE cut out
  const pot = [[0.25, -40.45], [0.7, -40.62], [1.45, -40.55], [1.82, -40.1], [1.72, -39.62], [1.2, -39.42], [0.5, -39.5], [0.18, -39.9]];
  kit.ground(rect(-5.5, -76, 5.5, -26), { mat: 'asphalt_cracked', holes: [pot] });
  // pothole: 6 cm deep bowl with ragged walls, rain water, loose chunks
  kit.ground(pot, { y: -0.06, mat: 'asphalt_dark', keep: true });
  for (let i = 0; i < pot.length; i++) {
    const a = pot[i], b = pot[(i + 1) % pot.length];
    kit.face([[a[0], -0.06, a[1]], [b[0], -0.06, b[1]], [b[0], 0, b[1]], [a[0], 0, a[1]]], 'asphalt_dark', { shade: 0.7 });
  }
  kit.decal({ at: [1.0, -40.0], size: [1.4, 0.95], rot: 0.2, mat: 'decal_puddle', y: -0.06 });
  kit.decal({ at: [1.0, -40.0], size: [3.2, 2.6], rot: 0.6, mat: 'decal_cracks' });
  kit.debris([1.0, -40.0], { r: 1.6, count: 8, kinds: ['chunk', 'chunk', 'paper'] });
  // dark asphalt repairs: a trench across the avenue, pothole fills, a cut along the west lane
  kit.patch([[-5.5, -61.6], [5.5, -61.9], [5.5, -60.9], [-5.5, -60.7]]);
  kit.patch([[-4.9, -36.2], [-1.2, -36.4], [-1.0, -34.9], [-4.7, -34.6]]);
  kit.patch([[1.2, -57.8], [3.9, -58.1], [4.1, -55.9], [1.5, -55.4]]);
  kit.patch([[-5.5, -44.1], [5.5, -44.4], [5.5, -43.6], [-5.5, -43.3]]);
  kit.patch([[2.6, -34.0], [4.4, -34.3], [4.6, -31.8], [2.8, -31.5]]);
  kit.patch([[-3.8, -53.6], [-1.6, -53.9], [-1.4, -51.6], [-3.5, -51.3]]);
  kit.patch([[-0.9, -28.6], [0.9, -28.8], [1.1, -27.2], [-0.8, -27.0]]);

  // ---- sidewalks + underpass walkways (0.3 m granite curb on the road side only)
  sidewalk(kit, [[-5.5, -26], [-5.5, -76]], [[-7, -76], [-7, -62], [-9, -62], [-9, -26]]);
  sidewalk(kit, [[5.5, -76], [5.5, -26]], [[9, -26], [9, -62], [7, -62], [7, -76]]);
  // NE service alley floor (flush with the sidewalk)
  kit.ground(rect(9, -53, 24, -50), { y: SW, mat: 'concrete_cracked' });

  // ---- markings: centre dashes at world z in [9k, 9k + 3] (to the barricade), yellow edge lines x = ±5.1
  for (let k = -8; k <= -3; k++) {
    const c0 = Math.max(9 * k, -62.0), c1 = Math.min(9 * k + 3, -26);
    if (c1 - c0 > 0.05) kit.markLine([[0, c0], [0, c1]], { width: 0.12 });
  }
  for (const x of [-5.1, 5.1]) kit.markLine([[x, -64.7], [x, -26]], { width: 0.12, mat: 'paint_yellow' });
  // faded "BUS" style lane word and a stop line before the bridge (worn)
  kit.markLine([[0.15, -60.4], [5.1, -60.4]], { width: 0.45 });
  kit.markLine([[-5.1, -60.4], [-0.15, -60.4]], { width: 0.45 });

  // ---- hardware: manholes (MH_N opens for SP_N_MH: cover shoved aside), storm drains at the curbs
  for (const m of L.MANHOLES.filter((mm) => mm.z < -26 && mm.z > -80 && Math.abs(mm.x) < 26)) {
    if (m.spawner) {
      kit.manhole([m.x, m.z], { r: 0.43, tint: '#4c4945', y: 0.001 });
      kit.manhole([m.x, m.z], { r: 0.34, tint: '#0d0c0b', y: 0.003 });
      manholeCover(kit, [m.x + 0.38, m.z - 0.22], 0.34, 0.035);
    } else manholeCover(kit, [m.x, m.z], 0.34);
  }
  manholeCover(kit, [-3.2, -66.8], 0.3);
  for (const [x, z] of [[-5.27, -31.5], [5.27, -36.5], [-5.27, -47.5], [5.27, -49.0], [-5.27, -58.5], [5.27, -61.0]]) kit.drain([x, z], PI / 2);
  // utility covers in the sidewalks
  for (const [x, z] of [[-7.4, -44.6], [7.3, -30.2], [7.6, -57.1]]) kit.box({ x, y: SW, z, w: 0.6, h: 0.008, d: 0.9, mat: 'steel_dark', tint: '#6a655e' });

  // ---- grime: stains, cracks, oil, puddles in the gutters; the underpass is wet
  kit.scatterDecals(rect(-5.3, -61.5, 5.3, -27), { count: 22, avoid: [[1, -40, 1.6], [2.5, -38, 0.8], [-1.5, -56, 0.8]] });
  kit.scatterDecals(rect(-4.5, -61.5, 4.5, -27), { count: 8, mats: { decal_stain: 3, decal_dirt: 1 }, size: [0.8, 1.8] });
  for (const [x, z, r, s] of [[-4.7, -33.0, 0.2, [2.8, 1.0]], [4.8, -45.6, 1.4, [2.2, 0.9]], [-4.6, -51.2, 0.1, [3.0, 1.1]], [4.5, -57.5, 0.3, [2.4, 1.0]], [-1.9, -42.6, 0.9, [1.6, 1.1]], [3.0, -29.0, 2.6, [1.4, 0.9]]]) kit.decal({ at: [x, z], size: s, rot: r, mat: 'decal_puddle' });
  // underpass: puddles under the drips, dirt washed against the walls
  for (const [x, z, s] of [[-3.6, -63.2, [2.6, 1.6]], [2.4, -62.7, [3.2, 1.3]], [-0.6, -61.6, [2.0, 1.0]], [-3.9, -61.0, [1.2, 0.8]], [1.0, -67.5, [3.6, 2.2]], [-2.6, -71.0, [2.6, 1.8]], [3.0, -73.4, [2.4, 1.6]]]) kit.decal({ at: [x, z], size: s, rot: kit.rnd(0, 3), mat: 'decal_puddle' });
  kit.scatterDecals(rect(-5.3, -75.5, 5.3, -64.8), { count: 8, mats: { decal_dirt: 3, decal_stain: 2 } });
  const swDecals = { decal_stain: 2, decal_dirt: 3, decal_cracks: 1 };
  kit.scatterDecals(rect(-8.9, -61.8, -5.8, -26.2), { count: 12, y: SW, mats: swDecals, size: [0.6, 1.6] });
  kit.scatterDecals(rect(5.8, -61.8, 8.9, -26.2), { count: 12, y: SW, mats: swDecals, size: [0.6, 1.6] });
  kit.scatterDecals(rect(9.3, -52.8, 23.7, -50.2), { count: 7, y: SW, mats: { decal_stain: 3, decal_dirt: 3, decal_puddle: 1 }, size: [0.7, 1.6] });
  // litter along the gutters
  kit.debris([-4.9, -38.5], { r: 1.1, count: 7, kinds: ['paper', 'paper', 'chunk'] });
  kit.debris([4.9, -52.5], { r: 1.0, count: 6, kinds: ['paper', 'paper', 'plank'] });
  kit.debris([-4.8, -58.0], { r: 1.2, count: 7, kinds: ['paper', 'chunk', 'brick'] });
}

/** Sidewalk slab: curbChain = road-side polyline (0.3 m granite curb), back = the rest of the outline. */
function sidewalk(kit, curbChain, back) {
  const poly = [...curbChain, ...back];
  const ccw = ensureCCW(poly);
  const key = (a, b) => `${a[0].toFixed(3)},${a[1].toFixed(3)}|${b[0].toFixed(3)},${b[1].toFixed(3)}`;
  const curbSeg = new Set();
  for (let i = 0; i < curbChain.length - 1; i++) { curbSeg.add(key(curbChain[i], curbChain[i + 1])); curbSeg.add(key(curbChain[i + 1], curbChain[i])); }
  const edges = [];
  for (let i = 0; i < ccw.length; i++) if (curbSeg.has(key(ccw[i], ccw[(i + 1) % ccw.length]))) edges.push(i);
  kit.slab(ccw, { y1: SW, mat: 'concrete_floor', curb: 0.3, curbMat: 'curb', edge: 'curb', edges, grime: { y: 0, h: 0.15, k: 0.25 }, collide: false });
  // collision: walkable top + the curb faces only (a closed prism would put its bottom face at y -0.05 into the
  // nav grid as the lowest reachable layer: zombies would walk sunk into the sidewalk)
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

// ==================================================================================================== west blocks
function westBlocks(kit, L) {
  // ---------------- N_W1 deli block (brick_commercial, 7F); ground storey = enterable DELI built by deli()
  const BRICK = '#e6d6c8', STONE = '#d8cfbf', IRON = '#2e3c33';
  block(kit, {
    id: 'N_W1', x0: -26, x1: -9, z0: -40, z1: -26, floors: [4.5, 3.4, 3.4, 3.4, 3.4, 3.4, 3.4], parapet: 0.9,
    mat: 'brick_red', tint: BRICK, trim: 'trim_stone', trimTint: STONE, cornice: { kind: 'metal', mat: 'trim_metal', tint: '#4b5048' },
    colFrom: BY + 4.5, win: { w: 1.2, h: 1.9, sill: 0.9, lintel: 'trim_stone', ac: 0.1 },
    faces: [
      {
        side: 'E', skipGround: true, plinth: false, cols: [1.6, 4.3, 7.0, 9.7, 12.4], pipes: [13.75], lit: [[4, 4]],
        mod: (f, k, op) => {
          if (f === 1 && k === 2) return { ...op, state: 'broken', ac: false, streak: false, spawn: true };   // SP_N_WIN_W
          if (f === 1) op.state = wpick(kit, WIN_STATES_POOR);
          return op;
        },
        decor: (e, ops) => {
          const sp = ops.find((op) => op.spawn);
          // the spawn window: sash torn out, curtain blowing out, glass on the awning
          kit.at({ x: sp.cx + 0.42, y: sp.y + 0.15, z: 0.1, rz: 0.5 }, () => kit.box({ x: 0, y: 0, z: 0, w: 0.05, h: 1.25, d: 0.05, mat: 'frame_dark' }));
          kit.face([[sp.cx - 0.5, sp.y + 1.75, -0.05], [sp.cx - 0.1, sp.y + 1.75, -0.05], [sp.cx + 0.05, sp.y + 0.45, 0.45], [sp.cx - 0.45, sp.y + 0.2, 0.32]], 'nz_fabric', { tint: '#b9b09a' });
        },
      },
      { side: 'N', from: BY + 18.1, cols: [3.0, 7.6, 12.2], win: { w: 1.1, h: 1.7, states: WIN_STATES_POOR, lintel: 'trim_stone' } },
    ],
    extra: () => deli(kit, { BRICK, STONE, IRON }),
  });

  // ---------------- N_W2 FRESH FISH flats (brick_dark, 5F): blue fishmonger front, awning, fire escape
  block(kit, {
    id: 'N_W2', x0: -26, x1: -9, z0: -50, z1: -40, floors: [4.5, 3.4, 3.4, 3.4, 3.4], parapet: 0.8,
    mat: 'brick_dark', tint: '#d9cbc2', groundMat: 'concrete_wall', groundTint: '#cfc8bb', trim: 'trim_stone', trimTint: '#bdb5a6',
    cornice: { kind: 'simple', mat: 'trim_concrete', tint: '#a39c8f' }, plinthMat: 'concrete_dirty', plinthTint: '#6e6a63',
    win: { w: 1.1, h: 1.7, sill: 0.9, lintel: 'trim_stone', states: WIN_STATES_POOR, ac: 0.14 },
    faces: [{
      side: 'E', cols: [1.5, 3.8, 6.2, 8.5], pipes: [0.25], lit: [[3, 0]],
      ground: (e) => [
        { x: 0.9, w: 3.3, y: BY + 0.02, h: 3.0, type: 'shop', state: 'dark', frame: 'sign_blue', kick: 'sign_blue', mullions: [2, 1], room: 2.2 },
        { x: 4.4, w: 1.15, y: BY + 0.02, h: 2.55, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#3a5f8c', window: true, frame: 'sign_blue', step: false },
        { x: 5.75, w: 3.35, y: BY + 0.02, h: 3.0, type: 'shop', state: 'shutter', frame: 'sign_blue', kick: 'sign_blue', shutterTint: '#8c9296' },
      ],
      decor: (e, ops) => {
        // posters on the glass and the shutter, blue fascia FRESH FISH 鮮魚, red/white awning, fire escape
        posterWall(kit, 1.05, 4.1, 0.9, 2.9, 0.03, 9, ['FRESH', 'SALE', 'MISSING', null, null]);
        posterWall(kit, 5.9, 9.0, 0.9, 2.7, 0.02, 6, ['LOST', 'EVACUATE', null]);
        const zf = board(kit, 0.6, 9.4, 3.42, 0.86, { mat: 'sign_blue', tint: '#c4d4ee', border: { mat: 'sign_white', tint: '#e4e0d4', w: 0.035 } });
        textMixed(kit, [['FRESH FISH', { font: 'sans', h: 0.42 }], ['鮮魚', { font: 'cjk', h: 0.5 }]], { x: 5.0, y: 3.62, z: zf, mat: 'nz_ink_white', gap: 0.35, maxW: 8.0 });
        stripedAwning(kit, { x0: 1.0, x1: 9.0, y: 3.4, depth: 1.4, colors: ['#a32a21', '#e8e2d4'], torn: [6, 7, 15], hang: [7] });
        kit.fireEscape({ x: 5.0, floors: 5, groundH: 4.5, floorH: 3.4, bases: [0, 4.5, 7.9, 11.3, 14.7].map((v) => v + BY), width: 4.2 });
        streaks(kit, 0.2, 9.8, 4.4, 6, 0.004, [1.0, 2.4]);
        kit.wallLamp({ x: 4.98, y: BY + 2.95, on: false });
      },
    }],
    extra: (ctx) => {
      // wooden water tank on the roof: the classic downtown silhouette between the deli block and the bank
      waterTank(kit, [-18.5, -45.2], ctx.top + 0.02);
    },
  });

  // ---------------- N_W3 First National Bank (stone_office, 8F, granite ground storey, bronze letters)
  const BANK = '#c2b7a0', GRANITE = '#5c5854';
  block(kit, {
    id: 'N_W3', x0: -26, x1: -9, z0: -62, z1: -50, floors: [5.0, 3.4, 3.4, 3.4, 3.4, 3.4, 3.4, 3.4], parapet: 1.2,
    mat: 'concrete_wall', tint: BANK, groundMat: 'concrete_wall', groundTint: GRANITE, trim: 'trim_stone', trimTint: '#d9d0bd',
    cornice: { kind: 'stone', mat: 'trim_stone', tint: '#d4cab4' }, plinthMat: 'concrete_dirty', plinthTint: '#3f3c39', plinthH: 0.7,
    win: { w: 2.6, h: 1.8, sill: 0.8, mullions: [3, 1], frame: 'frame_dark', ac: 0.06 },
    faces: [
      {
        side: 'E', cols: [2.0, 6.0, 10.0], pilasters: [0.25, 4.0, 8.0, 11.75], pilW: 0.5,
        ground: () => [
          { x: 0.9, w: 2.2, y: BY + 1.0, h: 2.8, type: 'window', state: 'dark', frame: 'frame_dark', mullions: [2, 3], sill: false },
          { x: 4.0, w: 4.0, y: BY + 0.32, h: 3.25, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#5a4630', step: false },
          { x: 8.9, w: 2.2, y: BY + 1.0, h: 2.8, type: 'window', state: 'dark', frame: 'frame_dark', mullions: [2, 3], sill: false },
        ],
        decor: (e, ops) => bankFront(kit, e, ops),
      },
      { side: 'S', from: BY + 18.1, cols: [5.5, 10.0, 14.5], win: { w: 1.3, h: 1.7, mullions: [2, 1] } },
    ],
  });
}

/** Enterable deli on N_W1's ground storey: storefront wall, interior x -17..-9.3, z -39.4..-26.6. */
function deli(kit, c) {
  const y0 = BY, gh = 4.5, FL = 0.17, CEIL = 4.35;
  const a = [-9, -26], b = [-9, -40];   // E face, local x = -26 - z
  kit.wall({
    a, b, y0, h: gh, t: 0.3, mat: 'brick_red', tint: c.BRICK, inner: 'plaster', innerTint: '#e3dac6', interior: true, collide: true,
    grime: { y: y0, h: 1.6, k: 0.4 },
    openings: [
      { x: 1.4, w: 1.2, y: 0.02, h: 2.45, type: 'door', state: 'closed', door: 'nz_wood', doorTint: '#56664f', window: true, step: false },
      { x: 3.82, w: 1.3, y: 0.02, h: 2.55, type: 'door', state: 'open', walk: true, step: false },
      { x: 3.82, w: 1.3, y: 2.72, h: 0.5, type: 'window', state: 'broken', sill: false, frame: 'frame_dark' },
      { x: 5.32, w: 7.28, y: 0.62, h: 2.6, type: 'hole', walk: true },
    ],
  });
  kit.at(edgeFrame(a, b), () => {
    // cast-iron storefront: pilasters with capitals, smashed display window (sill 0.6 = vaultable)
    for (const [x, w] of [[3.21, 0.36], [5.22, 0.2], [12.92, 0.4]]) {
      kit.box({ x, y: y0, z: 0.06, w, h: 3.3, d: 0.12, mat: 'trim_metal', tint: c.IRON, faces: { nz: false } });
      kit.box({ x, y: y0 + 3.3, z: 0.08, w: w + 0.12, h: 0.12, d: 0.16, mat: 'trim_metal', tint: c.IRON });
      kit.box({ x, y: y0, z: 0.07, w: w + 0.08, h: 0.3, d: 0.14, mat: 'trim_metal', tint: shadeHex(c.IRON, 0.8) });
    }
    const wx0 = 5.32, wx1 = 12.6, sy = y0 + 0.62, ty = y0 + 3.22;
    kit.box({ x: (wx0 + wx1) / 2, y: y0, z: 0.03, w: wx1 - wx0, h: 0.62, d: 0.06, mat: 'trim_wood', tint: '#33463a', faces: { nz: false } }); // stallriser
    kit.box({ x: (wx0 + wx1) / 2, y: sy - 0.04, z: -0.12, w: wx1 - wx0, h: 0.06, d: 0.42, mat: 'trim_wood', tint: '#5b4a38' });       // sill board
    kit.box({ x: (wx0 + wx1) / 2, y: ty - 0.08, z: -0.1, w: wx1 - wx0, h: 0.08, d: 0.08, mat: 'frame_dark', tint: c.IRON });
    kit.box({ x: (wx0 + wx1) / 2, y: y0 + 2.62, z: -0.1, w: wx1 - wx0, h: 0.07, d: 0.07, mat: 'frame_dark', tint: c.IRON }); // transom bar
    for (const mx of [7.75, 10.18]) {
      kit.box({ x: mx, y: sy, z: -0.1, w: 0.08, h: ty - sy, d: 0.08, mat: 'frame_dark', tint: c.IRON });
      kit.colBox({ x: mx, y: sy, z: -0.15, w: 0.1, h: ty - sy, d: 0.3 }, 'metal');
    }
    kit.colBox({ x: (wx0 + wx1) / 2, y: 0, z: -0.15, w: wx1 - wx0, h: sy, d: 0.3 }, 'wood');
    // glass shards stuck in the frame + transom lights still glazed
    const shard = (x, y, sx, sy2) => kit.face([[x, y, -0.1], [x + sx, y, -0.1], [x, y + sy2, -0.1]].map((p, k, arr) => (sx * sy2 < 0 ? arr[(3 - k) % 3] : p)), 'glass_dirty');
    for (const [p0, p1] of [[wx0, 7.71], [7.79, 10.14], [10.22, wx1]]) {
      shard(p0 + 0.02, sy + 0.02, kit.rnd(0.25, 0.6), kit.rnd(0.3, 0.8));
      shard(p1 - 0.02, y0 + 2.6, -kit.rnd(0.2, 0.5), -kit.rnd(0.3, 0.7));
      kit.face([[p0 + 0.02, y0 + 2.69, -0.12], [p1 - 0.02, y0 + 2.69, -0.12], [p1 - 0.02, ty - 0.08, -0.12], [p0 + 0.02, ty - 0.08, -0.12]], 'glass_dirty');
    }
    // fascia DELI · 熟食 + small MEATS · CHEESE line, red/white awning
    const zf = board(kit, 3.0, 12.95, y0 + 3.36, 0.9, { mat: 'sign_white', tint: '#ddd1b3', border: { mat: 'sign_green', tint: '#4d6b55', w: 0.04 } });
    textMixed(kit, [['DELI ·', { font: 'serif', h: 0.5, mat: 'nz_ink' }], ['熟食', { font: 'cjk', h: 0.54, mat: 'nz_ink_red' }]], { x: 6.0, y: y0 + 3.55, z: zf, gap: 0.3 });
    textLine(kit, 'MEATS · CHEESE · SANDWICHES', { font: 'sans', h: 0.16, x: 10.9, y: y0 + 3.86, z: zf, align: 'center', mat: 'nz_ink_red', maxW: 3.4 });
    textLine(kit, 'EST. 1921', { font: 'serif', h: 0.14, x: 10.9, y: y0 + 3.6, z: zf, align: 'center', mat: 'nz_ink' });
    stripedAwning(kit, { x0: 3.8, x1: 12.7, y: 3.4, depth: 1.5, colors: ['#a32a21', '#ebe5d8'], torn: [21], hang: [21] });
    // apartment entrance: number plate, wall lamp, door back panel seen from inside the deli
    textLine(kit, '1127', { font: 'serif', h: 0.16, x: 2.0, y: y0 + 2.62, z: 0.02, align: 'center', mat: 'nz_ink_gold' });
    searchMark(kit, 2.0, y0 + 1.35, 0.6, 'nz_ink_red', '10-02');
    kit.wallLamp({ x: 2.0, y: y0 + 3.05, on: false });
    kit.face([[1.4, y0 + 0.02, -0.31], [1.4, y0 + 2.47, -0.31], [2.6, y0 + 2.47, -0.31], [2.6, y0 + 0.02, -0.31]], 'nz_wood', { tint: '#6a5a46' });
    // threshold (the street slab stops at the building line, the shop floor at the inner wall face)
    kit.box({ x: 4.47, y: y0, z: -0.15, w: 1.3, h: SW + 0.02 - y0, d: 0.32, mat: 'trim_stone', tint: '#8f8a80', collide: 'concrete' });
    // open deli door swung inward
    kit.at({ x: 3.88, y: y0 + 0.04, z: -0.3, rot: 1.75 }, () => {
      kit.box({ x: 0.62, y: 0, z: 0, w: 1.22, h: 2.48, d: 0.05, mat: 'trim_wood', tint: '#3c5244' });
      kit.face([[0.2, 1.1, 0.026], [1.12, 1.1, 0.026], [1.12, 2.25, 0.026], [0.2, 2.25, 0.026]], 'glass_dirty');
      textLine(kit, 'CLOSED', { font: 'sans', h: 0.08, x: 0.66, y: 1.6, z: 0.03, align: 'center', mat: 'nz_ink_red' });
    });
    // DELICATESSEN hero blade sign (y 6.5..19), cream board, black serif letters, between the first two window bays
    const bx = 3.0, yb0 = 6.5, yb1 = 19.0, out0 = 0.32, wOut = 1.42;   // z -29.0: the layout's z -26.5 lines up with HOTEL ASHFORD's blade (C_NW, z -24) from the fort
    for (const yy of [yb0 + 0.5, (yb0 + yb1) / 2, yb1 - 0.5]) {
      kit.box({ x: bx, y: yy, z: (out0 + 0.05) / 2, w: 0.08, h: 0.08, d: out0 + 0.05, mat: 'steel_dark', tint: '#3d3a36' });
      kit.sweep(circle(0.012, 4), [[bx, yy + 0.05, out0 + wOut - 0.1], [bx, yy + 1.2, 0.03]], 'steel_dark', { smooth: true, up: [1, 0, 0] });
    }
    kit.bbox({ x: bx, y: yb0, z: out0 + wOut / 2, w: 0.22, h: yb1 - yb0, d: wOut, bevel: 0.03, mat: 'sign_red', tint: '#a84436' });
    for (const s of [-1, 1]) kit.at({ x: bx + s * 0.112, y: 0, z: out0 + wOut / 2, rot: s * PI / 2 }, () => {
      kit.face([[-wOut / 2 + 0.1, yb0 + 0.12, 0], [wOut / 2 - 0.1, yb0 + 0.12, 0], [wOut / 2 - 0.1, yb1 - 0.12, 0], [-wOut / 2 + 0.1, yb1 - 0.12, 0]], 'sign_white', { tint: '#e2d6b8', uvOffset: [kit.rnd(0, 3), kit.rnd(0, 3)] });
      textVertical(kit, 'DELICATESSEN', { font: 'serif', x: 0, yTop: yb1 - 0.42, h: 0.74, pitch: 0.995, mat: 'nz_ink', z: 0.003 });
      for (let yy = yb0 + 0.3; yy < yb1 - 0.2; yy += 0.62) for (const xx of [-wOut / 2 + 0.06, wOut / 2 - 0.06]) kit.cyl({ x: xx, y: yy, z: 0.0, r: 0.03, h: 0.04, seg: 6, mat: kit.chance(0.12) ? 'lamp_warm' : 'lamp_off', rx: PI / 2 });
      streaks(kit, -wOut / 2 + 0.15, wOut / 2 - 0.35, yb1 - 0.15, 3, 0.004, [1.2, 3.5]);
    });
    kit.box({ x: bx, y: yb1, z: out0 + wOut / 2, w: 0.3, h: 0.12, d: wOut + 0.1, mat: 'trim_metal', tint: '#3d3a36' });
  });
  // produce crates in front of the window (N_CRATES_DELI) + glass on the sidewalk
  produceCrates(kit, [-7.5, -37.6], 0.15);
  kit.at({ y: SW + 0.004 }, () => {
    for (let i = 0; i < 26; i++) { const x = kit.rnd(-8.95, -7.2), z = kit.rnd(-38.5, -31.3), s = kit.rnd(0.05, 0.16); kit.upFace([[x, 0, z], [x + s, 0, z + kit.rnd(-0.05, 0.05)], [x + s * 0.35, 0, z + s]], 'glass_dirty', null, {}); }
  });

  // ---- interior shell
  const X0 = -17, X1 = -9.3, Z0 = -39.4, Z1 = -26.6;
  kit.ground(rect(X0, Z0, X1, Z1), { y: FL, mat: 'interior_tiles', keep: true });
  hq(kit, 'plaster', CEIL, X0, Z0, X1, Z1, false, { tint: '#d8d3c8' });
  const wain = 1.25;
  // west (back) wall facing +x, north wall facing +z, south wall facing -z: tiled wainscot + plaster
  vq(kit, 'interior_tiles', 'x', X0, 1, Z0, Z1, FL, FL + wain, { tint: '#e6efe4' });
  vq(kit, 'plaster', 'x', X0, 1, Z0, Z1, FL + wain, CEIL, { tint: '#e3dac6' });
  vq(kit, 'interior_tiles', 'z', Z0, 1, X0, X1, FL, FL + wain, { tint: '#e6efe4' });
  vq(kit, 'plaster', 'z', Z0, 1, X0, X1, FL + wain, CEIL, { tint: '#e3dac6' });
  vq(kit, 'interior_tiles', 'z', Z1, -1, X0, X1, FL, FL + wain, { tint: '#e6efe4' });
  vq(kit, 'plaster', 'z', Z1, -1, X0, X1, FL + wain, CEIL, { tint: '#e3dac6' });
  for (const [plane, pos, sg, u0, u1] of [['x', X0 + 0.01, 1, Z0, Z1], ['z', Z0 + 0.01, 1, X0, X1], ['z', Z1 - 0.01, -1, X0, X1]]) vq(kit, 'trim_wood', plane, pos, sg, u0, u1, FL + wain, FL + wain + 0.06, { tint: '#3e5040' });
  // solid ground storey around the room (back kitchen x -26..-17 sealed), ceiling slab
  kit.colBox({ x: (-26 + X0) / 2, y: 0, z: -33, w: X0 + 26, h: BY + 4.5, d: 14 }, 'concrete');
  kit.colBox({ x: (-26 + X1) / 2, y: 0, z: (Z1 - 26) / 2, w: X1 + 26, h: BY + 4.5, d: -26 - Z1 }, 'concrete');
  kit.colBox({ x: (-26 + X1) / 2, y: 0, z: (Z0 - 40) / 2, w: X1 + 26, h: BY + 4.5, d: Z0 + 40 }, 'concrete');
  kit.colBox({ x: (X0 + X1) / 2, y: CEIL, z: (Z0 + Z1) / 2, w: X1 - X0, h: BY + 4.5 - CEIL, d: Z1 - Z0 }, 'concrete');
  // back door to the kitchen (blocked), menu board over the fridges
  kit.at({ x: X0, y: 0, z: -28.1, rot: PI / 2 }, () => {
    kit.box({ x: 0, y: FL, z: 0.03, w: 1.0, h: 2.15, d: 0.05, mat: 'paint_metal', tint: '#8c968c' });
    kit.box({ x: 0.36, y: FL + 1.0, z: 0.07, w: 0.05, h: 0.14, d: 0.04, mat: 'steel' });
    kit.box({ x: 0, y: FL + 2.15, z: 0.04, w: 1.12, h: 0.06, d: 0.07, mat: 'frame_dark' });
  });
  kit.at({ x: X0 + 0.01, y: 0, z: -35.3, rot: PI / 2 }, () => {
    const zf = board(kit, -3.2, 3.2, 2.62, 1.12, { mat: 'frame_dark', tint: '#2c2e2a', d: 0.04, border: { mat: 'trim_wood', tint: '#7a6248', w: 0.035, inset: 0.03 } });
    textLine(kit, 'SANDWICHES', { font: 'serif', h: 0.18, x: -1.6, y: 3.42, z: zf, align: 'center', mat: 'nz_ink_white' });
    textLine(kit, 'COLD CUTS', { font: 'serif', h: 0.18, x: 1.6, y: 3.42, z: zf, align: 'center', mat: 'nz_ink_white' });
    for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) {
      kit.face([[sx * 1.6 - 1.2, 3.18 - i * 0.15, zf], [sx * 1.6 + kit.rnd(0.2, 0.7), 3.18 - i * 0.15, zf], [sx * 1.6 + kit.rnd(0.2, 0.7), 3.23 - i * 0.15, zf], [sx * 1.6 - 1.2, 3.23 - i * 0.15, zf]], 'nz_ink_white', { shade: 0.85 });
      kit.face([[sx * 1.6 + 0.95, 3.18 - i * 0.15, zf], [sx * 1.6 + 1.2, 3.18 - i * 0.15, zf], [sx * 1.6 + 1.2, 3.23 - i * 0.15, zf], [sx * 1.6 + 0.95, 3.23 - i * 0.15, zf]], 'nz_ink_gold', {});
    }
  });
  // ---- fridge wall along the back (glass doors, cold light strips, some doors open)
  const fz0 = -39.2, fz1 = -30.6, fx = X0 + 0.65, fh = 2.2, nd = 6, dw = (fz1 - fz0) / nd;
  kit.box({ x: X0 + 0.33, y: FL, z: (fz0 + fz1) / 2, w: 0.66, h: fh, d: fz1 - fz0, mat: 'paint_metal', tint: '#d8d6cf', faces: { px: false } });
  kit.colBox({ x: X0 + 0.33, y: FL, z: (fz0 + fz1) / 2, w: 0.66, h: fh, d: fz1 - fz0 }, 'metal');
  for (let i = 0; i < nd; i++) {
    const z0 = fz0 + i * dw, z1 = z0 + dw, open = i === 1 || i === 4;
    vq(kit, 'interior_hidden', 'x', fx - 0.62, 1, z0 + 0.05, z1 - 0.05, FL + 0.2, FL + fh - 0.2, { tint: '#c9d2d6', shade: 0.9 });
    for (let s = 0; s < 4; s++) {
      const yy = FL + 0.3 + s * 0.45;
      kit.box({ x: fx - 0.32, y: yy, z: (z0 + z1) / 2, w: 0.58, h: 0.025, d: dw - 0.1, mat: 'steel', tint: '#b9bcbd' });
      for (let k = 0; k < 4; k++) if (kit.chance(0.55)) kit.box({ x: fx - kit.rnd(0.2, 0.45), y: yy + 0.025, z: z0 + 0.15 + k * (dw - 0.3) / 3, w: 0.12, h: kit.rnd(0.12, 0.28), d: 0.1, mat: 'car_plastic', tint: kit.pick(['#b02a20', '#2a5ea0', '#e0c040', '#3a8a4a', '#d8d4c8']) });
    }
    kit.box({ x: fx - 0.05, y: FL + fh - 0.16, z: (z0 + z1) / 2, w: 0.05, h: 0.04, d: dw - 0.2, mat: i === 3 ? 'lamp_off' : 'lamp_cold' });
    kit.at({ x: fx + 0.01, y: FL, z: open ? z1 : (z0 + z1) / 2, rot: open ? 1.2 : 0 }, () => {
      const zc = open ? -dw / 2 : 0;
      for (const [yy, hh] of [[0.05, 0.08], [fh - 0.13, 0.08]]) kit.box({ x: 0.02, y: yy, z: zc, w: 0.05, h: hh, d: dw - 0.04, mat: 'steel', tint: '#9aa0a2' });
      for (const zz of [zc - dw / 2 + 0.04, zc + dw / 2 - 0.04]) kit.box({ x: 0.02, y: 0.05, z: zz, w: 0.05, h: fh - 0.1, d: 0.06, mat: 'steel', tint: '#9aa0a2' });
      vq(kit, 'glass', 'x', 0.045, 1, zc - dw / 2 + 0.07, zc + dw / 2 - 0.07, 0.13, fh - 0.13);
    });
  }
  kit.light({ pos: [X0 + 1.3, FL + 1.6, (fz0 + fz1) / 2], color: '#cfe3ff', intensity: 2.2, range: 4.5, radius: 0.5, decay: 1.5, name: 'fridge' });
  // ---- deli counter with glass case (customer side +x), slicer, scale, register
  const cx = -14.6, cz0 = -38.6, cz1 = -30.6;
  kit.bbox({ x: cx, y: FL, z: (cz0 + cz1) / 2, w: 0.8, h: 0.86, d: cz1 - cz0, bevel: 0.03, mat: 'paint_metal', tint: '#e2ded2' });
  kit.box({ x: cx + 0.41, y: FL + 0.1, z: (cz0 + cz1) / 2, w: 0.02, h: 0.25, d: cz1 - cz0 - 0.1, mat: 'trim_metal', tint: '#57605a' });
  kit.box({ x: cx - 0.05, y: FL + 0.86, z: (cz0 + cz1) / 2, w: 0.7, h: 0.04, d: cz1 - cz0, mat: 'steel', tint: '#c3c6c6' });
  for (let i = 0; i < 6; i++) kit.box({ x: cx - 0.05 + kit.rnd(-0.12, 0.12), y: FL + 0.9, z: cz0 + 0.6 + i * 1.3, w: 0.3, h: 0.05, d: 0.9, mat: 'car_plastic', tint: kit.pick(['#6e2c24', '#8a4a3a', '#c9a27a', '#5b4a3a']) });
  // sloped glass front + top glass (customer side), end panels
  kit.face([[cx + 0.4, FL + 0.86, cz1], [cx + 0.4, FL + 0.86, cz0], [cx + 0.1, FL + 1.18, cz0], [cx + 0.1, FL + 1.18, cz1]], 'glass');
  kit.face([[cx + 0.1, FL + 1.18, cz1], [cx + 0.1, FL + 1.18, cz0], [cx - 0.35, FL + 1.18, cz0], [cx - 0.35, FL + 1.18, cz1]], 'glass');
  for (const z of [cz0, cz1]) kit.box({ x: cx, y: FL + 0.86, z, w: 0.82, h: 0.33, d: 0.04, mat: 'steel', tint: '#a9adad' });
  kit.colBox({ x: cx, y: FL, z: (cz0 + cz1) / 2, w: 0.82, h: 1.18, d: cz1 - cz0 }, 'glass');
  slicer(kit, [cx - 0.1, FL + 0.9, cz0 + 0.55]);
  kit.at({ x: cx - 0.1, y: FL + 0.9, z: cz1 - 0.45 }, () => {
    kit.bbox({ x: 0, y: 0, z: 0, w: 0.42, h: 0.22, d: 0.4, bevel: 0.03, mat: 'paint_metal', tint: '#4d5852' });          // register
    kit.box({ x: -0.05, y: 0.22, z: 0, w: 0.22, h: 0.18, d: 0.32, mat: 'paint_metal', tint: '#3a433e', rz: 0.3 });
    kit.box({ x: 0, y: 0.03, z: 0.26, w: 0.3, h: 0.08, d: 0.14, mat: 'steel', tint: '#a8aaa6' });
  });
  // ---- two gondola shelf rows (1.5 m), one leaning, cans and boxes spilled on the floor
  shelfRow(kit, -12.4, -38.4, -35.2, FL, 0);
  shelfRow(kit, -12.4, -33.6, -30.6, FL, 0.12);
  for (let i = 0; i < 22; i++) {
    const x = kit.rnd(-14, -9.8), z = kit.rnd(-39, -27.2);
    if (x > -12.9 && x < -11.9) continue;
    if (kit.chance(0.5)) kit.at({ x, y: FL + 0.04, z, rot: kit.rnd(0, 6), rz: PI / 2 }, () => kit.cyl({ x: 0, y: -0.06, z: 0, r: 0.04, h: 0.12, seg: 8, mat: 'car_plastic', tint: kit.pick(['#b02a20', '#d8c040', '#2a5ea0', '#b8b8b0']) }));
    else kit.box({ x, y: FL, z, w: kit.rnd(0.15, 0.3), h: kit.rnd(0.06, 0.2), d: kit.rnd(0.12, 0.25), rot: kit.rnd(0, 3), mat: 'sign_white', tint: kit.pick(['#c9a46a', '#d8d0bc', '#b25a3a']) });
  }
  for (let i = 0; i < 18; i++) { const x = kit.rnd(-10.8, -9.45), z = kit.rnd(-38.5, -31.3), s = kit.rnd(0.05, 0.14); kit.upFace([[x, FL + 0.004, z], [x + s, FL + 0.004, z + kit.rnd(-0.05, 0.05)], [x + s * 0.3, FL + 0.004, z + s]], 'glass_dirty', null, {}); }
  kit.decal({ at: [-11.0, -29.2], size: [1.6, 1.0], rot: 0.4, mat: 'decal_stain', y: FL, tint: '#7a2a20' });
  kit.decal({ at: [-13.4, -34.0], size: [2.2, 1.8], rot: 1.3, mat: 'decal_dirt', y: FL });
  kit.decal({ at: [-10.2, -36.0], size: [1.8, 1.4], rot: 2.1, mat: 'decal_stain', y: FL });
  // toppled bentwood chair + a crate near the door
  kit.at({ x: -10.4, y: FL, z: -28.4, rot: 0.7 }, () => {
    kit.at({ rz: PI / 2 - 0.15 }, () => {
      kit.box({ x: 0.0, y: -0.02, z: 0, w: 0.42, h: 0.04, d: 0.42, mat: 'trim_wood', tint: '#5a3d28' });
      kit.box({ x: 0.2, y: 0, z: 0, w: 0.04, h: 0.48, d: 0.4, mat: 'trim_wood', tint: '#4e3422' });
    });
  });
  kit.box({ x: -10.1, y: FL, z: -27.3, w: 0.6, h: 0.45, d: 0.45, rot: 0.3, mat: 'nz_wood', tint: '#c2a77e', collide: true });
  // ---- failing fluorescent fixtures (L_DELI, realtime, flickers at (-12.5, 3.9, -33)); one hangs from one chain
  for (const [x, z, on, hang] of [[-12.4, -37.0, true, 0], [-12.5, -33.0, true, 0.32], [-12.4, -29.0, false, 0], [-15.7, -36.5, true, 0], [-15.7, -31.0, false, 0]]) {
    kit.at({ x, y: hang ? 3.95 : CEIL - 0.1, z, rx: hang }, () => {
      kit.box({ x: 0, y: 0, z: 0, w: 0.26, h: 0.08, d: 1.3, mat: 'steel', tint: '#d9d8d2' });
      kit.face([[-0.1, -0.002, 0.6], [0.1, -0.002, 0.6], [0.1, -0.002, -0.6], [-0.1, -0.002, -0.6]].reverse(), on ? 'lamp_cold' : 'lamp_off');
    });
    if (hang) kit.sweep(circle(0.006, 4), [[x, CEIL, z + 0.6], [x, 4.05, z + 0.55]], 'wire', { smooth: true, up: [1, 0, 0] });
    if (on && !hang) kit.light({ pos: [x, CEIL - 0.35, z], color: '#e4efff', intensity: 7, decay: 1.2, range: 9, radius: 0.35, name: 'tube' });
    else for (const dz of [-0.5, 0.5]) kit.sweep(circle(0.005, 4), [[x, CEIL, z + dz], [x, CEIL - 0.05, z + dz]], 'wire', { smooth: true, up: [1, 0, 0] });
  }
  // soft baked daylight fill (stands in for the missing multi-bounce light; L_DELI adds the flicker at runtime)
  for (const [x, z] of [[-11.0, -37.0], [-11.0, -29.4], [-15.9, -34.6]]) kit.light({ pos: [x, 3.0, z], color: '#c9d2dc', intensity: 4.0, decay: 1, range: 11, radius: 0.6, name: 'fill' });
}

/** Meat slicer on a counter (local point at the counter top). */
function slicer(kit, at) {
  kit.at({ x: at[0], y: at[1], z: at[2], rot: 0.4 }, () => {
    kit.bbox({ x: 0, y: 0, z: 0, w: 0.45, h: 0.12, d: 0.55, bevel: 0.03, mat: 'steel', tint: '#c9cccc' });
    kit.at({ x: 0.05, y: 0.32, z: 0, rz: PI / 2 + 0.25 }, () => kit.cyl({ x: 0, y: -0.02, z: 0, r: 0.16, h: 0.03, seg: 16, mat: 'car_chrome' }));
    kit.box({ x: -0.12, y: 0.12, z: 0, w: 0.12, h: 0.3, d: 0.2, mat: 'steel', tint: '#bfc2c2' });
    kit.box({ x: 0.08, y: 0.12, z: 0.12, w: 0.22, h: 0.14, d: 0.12, mat: 'metal_painted', tint: '#b33a2a' });
  });
}
/** Gondola shelf row along z at x (0.7 deep, 1.5 high) with stock; lean tips it against its neighbour. */
function shelfRow(kit, x, z0, z1, y, lean) {
  kit.at({ x, y, z: (z0 + z1) / 2, rz: lean }, () => {
    const d = z1 - z0;
    kit.box({ x: 0, y: 0, z: 0, w: 0.7, h: 0.12, d, mat: 'paint_metal', tint: '#8f9a92' });
    kit.box({ x: 0, y: 0.12, z: 0, w: 0.05, h: 1.38, d, mat: 'paint_metal', tint: '#c9ccc4' });
    for (const zz of [-d / 2 + 0.03, d / 2 - 0.03]) kit.box({ x: 0, y: 0, z: zz, w: 0.7, h: 1.5, d: 0.05, mat: 'paint_metal', tint: '#8f9a92' });
    for (let s = 0; s < 4; s++) {
      const yy = 0.12 + s * 0.42;
      kit.box({ x: 0, y: yy, z: 0, w: 0.68, h: 0.025, d: d - 0.1, mat: 'steel', tint: '#bcbfbb' });
      for (const side of [-1, 1]) for (let k = 0; k < Math.floor(d / 0.24); k++) {
        if (kit.chance(0.42)) continue;
        const zz = -d / 2 + 0.15 + k * 0.24;
        if (kit.chance(0.5)) kit.cyl({ x: side * kit.rnd(0.12, 0.25), y: yy + 0.025, z: zz, r: 0.04, h: kit.rnd(0.11, 0.16), seg: 8, mat: 'car_plastic', tint: kit.pick(['#b02a20', '#d8c040', '#2a5ea0', '#b8b8b0', '#3a7a3a']) });
        else kit.box({ x: side * 0.2, y: yy + 0.025, z: zz, w: 0.16, h: kit.rnd(0.14, 0.3), d: 0.18, mat: 'sign_white', tint: kit.pick(['#c9a46a', '#d84a32', '#e8d8a0', '#4a6aa0', '#e8e4dc']) });
      }
    }
    kit.colBox({ x: 0, y: 0, z: 0, w: 0.72, h: 1.5, d }, 'metal');
  });
}
/** Stack of slatted produce crates with rotten fruit (N_CRATES_DELI). */
function produceCrates(kit, at, y) {
  const put = (x, yy, z, r) => kit.at({ x, y: yy, z, rot: r }, () => {
    for (const s of [-1, 1]) kit.box({ x: 0, y: 0, z: s * 0.2, w: 0.6, h: 0.3, d: 0.03, mat: 'nz_wood', tint: '#d0b78e' });
    for (const s of [-1, 1]) kit.box({ x: s * 0.285, y: 0, z: 0, w: 0.03, h: 0.3, d: 0.38, mat: 'nz_wood', tint: '#c0a67d' });
    kit.box({ x: 0, y: 0.02, z: 0, w: 0.56, h: 0.02, d: 0.38, mat: 'nz_wood', tint: '#ad9470' });
    for (let i = 0; i < 9; i++) kit.bbox({ x: kit.rnd(-0.2, 0.2), y: 0.15 + kit.rnd(0, 0.08), z: kit.rnd(-0.12, 0.12), w: 0.11, h: 0.09, d: 0.11, bevel: 0.035, mat: 'car_plastic', tint: kit.pick(['#5a6a2a', '#7a3a1a', '#4a3a20', '#8a7a2a', '#6a2a1a']) });
  });
  put(at[0], y, at[1], 0.1); put(at[0] + 0.05, y, at[1] + 0.48, -0.05); put(at[0] - 0.02, y + 0.3, at[1] + 0.22, 0.2);
  put(at[0] + 0.55, y, at[1] - 0.15, 1.4);
  kit.colBox({ x: at[0] + 0.15, y, z: at[1] + 0.2, w: 1.2, h: 0.62, d: 1.0 }, 'wood');
  kit.debris([at[0] + 0.3, at[1] + 0.2], { r: 0.9, count: 6, kinds: ['paper', 'plank'], y });
}

/** Bank front: granite base, bronze doors chained, steps, bronze letters FIRST NATIONAL BANK, lanterns, grilles. */
function bankFront(kit, e, ops) {
  const y0 = BY;
  // window grilles (vertical bars + rails) over both ground windows
  for (const op of ops.filter((o) => o.type === 'window' && o.y < 4)) {
    for (let x = op.x + 0.12; x < op.x + op.w - 0.05; x += 0.16) kit.box({ x, y: op.y - 0.05, z: 0.06, w: 0.025, h: op.h + 0.1, d: 0.025, mat: 'steel_dark', tint: '#2f2d2b' });
    for (const yy of [op.y + 0.25, op.y + op.h - 0.25]) kit.box({ x: op.x + op.w / 2, y: yy, z: 0.07, w: op.w + 0.1, h: 0.04, d: 0.02, mat: 'steel_dark', tint: '#2f2d2b' });
    kit.box({ x: op.x + op.w / 2, y: op.y - 0.16, z: 0.06, w: op.w + 0.3, h: 0.12, d: 0.14, mat: 'trim_stone', tint: '#9a948a' });
  }
  // doors: bronze frame, transom grille, chain + padlock across the handles
  const d = ops.find((o) => o.type === 'door');
  const dx0 = d.x, dx1 = d.x + d.w, dy0 = d.y, dy1 = d.y + d.h;
  for (const xx of [dx0 + 0.06, (dx0 + dx1) / 2, dx1 - 0.06]) kit.box({ x: xx, y: dy0, z: -0.02, w: 0.12, h: dy1 - dy0, d: 0.06, mat: 'nz_bronze' });
  for (const xx of [(dx0 + dx1) / 2 - 0.12, (dx0 + dx1) / 2 + 0.12]) kit.box({ x: xx, y: dy0 + 1.15, z: 0.02, w: 0.05, h: 0.5, d: 0.06, mat: 'nz_bronze' });
  kit.sweep(circle(0.012, 4), [[(dx0 + dx1) / 2 - 0.14, dy0 + 1.45, 0.07], [(dx0 + dx1) / 2 - 0.05, dy0 + 1.25, 0.1], [(dx0 + dx1) / 2 + 0.05, dy0 + 1.22, 0.1], [(dx0 + dx1) / 2 + 0.14, dy0 + 1.42, 0.07]], 'steel', { smooth: true, tint: '#7e7a72' });
  kit.box({ x: (dx0 + dx1) / 2, y: dy0 + 1.1, z: 0.1, w: 0.08, h: 0.1, d: 0.04, mat: 'steel', tint: '#a08c50' });
  kit.box({ x: (dx0 + dx1) / 2, y: dy1, z: 0.04, w: dx1 - dx0 + 0.5, h: 0.22, d: 0.12, mat: 'trim_stone', tint: '#8a857c' });
  // granite steps (on the sidewalk, collide)
  kit.box({ x: (dx0 + dx1) / 2, y: y0, z: 0.55, w: dx1 - dx0 + 1.0, h: SW - y0 + 0.16, d: 0.5, mat: 'trim_concrete', tint: '#77736c', collide: 'concrete' });
  kit.box({ x: (dx0 + dx1) / 2, y: y0, z: 0.2, w: dx1 - dx0 + 0.7, h: SW - y0 + 0.32, d: 0.4, mat: 'trim_concrete', tint: '#6f6b64', collide: 'concrete' });
  // bronze letters across the granite storey + an engraved year
  textLine(kit, 'FIRST NATIONAL BANK', { font: 'serif', h: 0.44, x: e.L / 2, y: 4.08, z: 0.02, align: 'center', mat: 'nz_bronze', depth: 0.03, maxW: e.L - 1.2, track: 0.12 });
  textLine(kit, '1907', { font: 'serif', h: 0.2, x: (dx0 + dx1) / 2, y: dy1 + 0.32, z: 0.165, align: 'center', mat: 'nz_ink', shade: 0.6 });
  // bronze lanterns flanking the doors (one still glows), rusticated joints on the granite
  for (const [x, on] of [[dx0 - 0.45, true], [dx1 + 0.45, false]]) kit.at({ x, y: y0 + 2.75, z: 0 }, () => {
    kit.box({ x: 0, y: 0, z: 0.12, w: 0.08, h: 0.08, d: 0.24, mat: 'nz_bronze' });
    kit.cyl({ x: 0, y: -0.38, z: 0.3, r: 0.13, r2: 0.15, h: 0.42, seg: 6, mat: on ? 'lamp_warm' : 'lamp_off' });
    kit.cyl({ x: 0, y: 0.04, z: 0.3, r: 0.18, r2: 0.05, h: 0.16, seg: 6, mat: 'nz_bronze' });
    if (on) kit.light({ pos: [x, y0 + 2.4, 0.6], color: '#ffc27a', intensity: 3.5, range: 6, radius: 0.1 });
  });
  for (let y = y0 + 1.1; y < y0 + 4.9; y += 0.55) {
    for (const [x0, x1] of [[0, 0.88], [3.12, dx0 - 0.03], [dx1 + 0.03, 8.88], [11.12, e.L]]) if (x1 - x0 > 0.1) kit.box({ x: (x0 + x1) / 2, y, z: 0.006, w: x1 - x0, h: 0.03, d: 0.012, mat: 'trim_concrete', tint: '#38352f', faces: { nz: false } });
  }
  posterWall(kit, 9.2, 10.9, 0.5, 1.0, 0.07, 2, ['EVACUATE', 'NOTICE']);
  streaks(kit, 0.3, e.L - 0.3, 28.6, 9, 0.004, [1.5, 4.0]);
}

/** NYC-style wooden water tank on a steel stand (roof at y). */
function waterTank(kit, at, y) {
  kit.waterTower({ at, y, h: 3.0, r: 1.6, tankH: 3.2, mat: 'nz_wood', tint: '#a8906e' });
  for (let i = 0; i < 4; i++) {
    const yy = y + 3.0 + 0.35 + i * 0.8, ring = circle(1.62, 20).map(([x, z]) => [at[0] + x, yy, at[1] - z]);
    kit.sweep(rectProf(0.03, 0.05), [...ring, ring[0]], 'steel_dark', { tint: '#4b4540' });
  }
}

// ==================================================================================================== east blocks
function eastBlocks(kit, L) {
  // ---------------- N_E1 fire-escape flats (brick_dark, 8F): NEWS · TOBACCO, FIZZ COLA tin sign, spawn window
  block(kit, {
    id: 'N_E1', x0: 9, x1: 26, z0: -40, z1: -26, floors: [4.5, 3.4, 3.4, 3.4, 3.4, 3.4, 3.4, 3.4], parapet: 0.9,
    mat: 'brick_dark', tint: '#d3c4ba', groundMat: 'concrete_wall', groundTint: '#c9c2b5', trim: 'trim_stone', trimTint: '#b8b0a2',
    cornice: { kind: 'simple', mat: 'trim_concrete', tint: '#9c968a' }, plinthMat: 'concrete_dirty', plinthTint: '#625e58',
    win: { w: 1.1, h: 1.7, sill: 0.9, lintel: 'trim_stone', states: WIN_STATES_POOR, ac: 0.16 },
    faces: [
      {
        side: 'W', cols: [1.4, 4.0, 6.6, 9.2, 11.8], pipes: [13.8], lit: [[3, 3], [5, 0]],
        mod: (f, k, op) => (f === 1 && k === 1 ? { ...op, state: 'broken', ac: false, streak: false, spawn: true } : op),   // SP_N_WIN_E
        ground: () => [
          { x: 1.0, w: 2.9, y: BY + 0.02, h: 3.0, type: 'shop', state: 'shutter', frame: 'frame_dark', kick: 'trim_metal', shutterTint: '#9c9a90' },
          { x: 4.1, w: 2.9, y: BY + 0.02, h: 3.0, type: 'shop', state: 'broken', frame: 'frame_dark', kick: 'trim_metal', room: 2.0 },
          { x: 8.2, w: 1.2, y: BY + 0.02, h: 2.5, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#5d6459', window: true, step: false },
          { x: 10.2, w: 3.0, y: BY + 0.95, h: 2.1, type: 'window', state: 'boarded', frame: 'frame_dark' },
        ],
        decor: (e, ops) => {
          posterWall(kit, 1.1, 3.8, 0.8, 2.8, 0.03, 7, ['MISSING', 'NEWS', 'QUARANTINE', null]);
          // dark green fascia NEWS · TOBACCO + red FIZZ COLA tin sign on the pier
          const zf = board(kit, 0.8, 7.2, 3.36, 0.82, { mat: 'sign_green', tint: '#55715c', border: { mat: 'sign_yellow', tint: '#cbb26a', w: 0.03 } });
          textLine(kit, 'NEWS · TOBACCO', { font: 'serif', h: 0.4, x: 4.0, y: 3.58, z: zf, align: 'center', mat: 'nz_ink_gold', maxW: 5.9 });
          kit.at({ x: 7.65, y: 0, z: 0 }, () => {
            const z2 = board(kit, -0.36, 0.36, 1.3, 1.25, { mat: 'sign_red', tint: '#c03a2c', d: 0.03, border: { mat: 'sign_white', tint: '#f1ece0', w: 0.025, inset: 0.04 } });
            textLine(kit, 'FIZZ', { font: 'serif', h: 0.2, x: 0, y: 2.0, z: z2, align: 'center', mat: 'nz_ink_white', italic: 0.18 });
            textLine(kit, 'COLA', { font: 'serif', h: 0.2, x: 0, y: 1.7, z: z2, align: 'center', mat: 'nz_ink_white', italic: 0.18 });
            textLine(kit, 'ICE COLD', { font: 'sans', h: 0.06, x: 0, y: 1.45, z: z2, align: 'center', mat: 'nz_ink_white' });
          });
          // door canopy + house number, boarded window posters
          kit.box({ x: 8.8, y: BY + 2.72, z: 0.4, w: 1.7, h: 0.1, d: 0.8, mat: 'steel', tint: '#6d6f68' });
          textLine(kit, '1130', { font: 'serif', h: 0.15, x: 8.8, y: BY + 2.88, z: 0.02, align: 'center', mat: 'nz_ink_white' });
          posterWall(kit, 10.3, 13.1, 1.1, 2.9, 0.06, 4, ['KEEP OUT', 'LOST', null]);
          kit.wallLamp({ x: 9.65, y: BY + 2.4, on: true, intensity: 3.5, range: 6, color: '#ffc58a' });
          kit.bulb([5.6, BY + 2.7, -1.2], { cord: 0.35, on: true, intensity: 2.6, range: 4.5, color: '#ffb468' });
          searchMark(kit, 8.8, BY + 1.45, 0.62, 'nz_ink_red', '10-03');
          // the spawn window: a curtain blown out over the fire escape, shards on the landing
          const sp = ops.find((op) => op.spawn);
          kit.face([[sp.cx - 0.45, sp.y + 1.6, -0.05], [sp.cx + 0.05, sp.y + 1.6, -0.05], [sp.cx + 0.15, sp.y + 0.35, 0.55], [sp.cx - 0.4, sp.y + 0.15, 0.42]], 'nz_fabric', { tint: '#9a8f7a' });
          // black iron fire escape 2F-8F along z -37..-31 (local x 3..9)
          kit.fireEscape({ x: 6.0, floors: 8, groundH: 4.5, floorH: 3.4, bases: [0, 4.5, 7.9, 11.3, 14.7, 18.1, 21.5, 24.9].map((v) => v + BY), width: 5.6 });
          streaks(kit, 0.2, 13.8, 28.2, 10, 0.004, [1.5, 3.5]);
        },
      },
      { side: 'N', from: BY + 14.7, cols: [5.0, 9.0, 13.0], win: { w: 1.0, h: 1.6, states: WIN_STATES_POOR } },
      { side: 'S', from: BY + 21.5, cols: [3.5, 8.0, 12.5], win: { w: 1.0, h: 1.6 } },
    ],
    extra: (ctx) => {
      waterTank(kit, [19.5, -33.5], ctx.top + 0.02);
      // roof aerials (silhouette against the storm sky)
      for (const [x, z, h] of [[12.0, -28.5, 4.5], [14.5, -37.0, 3.2]]) {
        kit.cyl({ x, y: ctx.top, z, r: 0.03, h, seg: 5, mat: 'steel', tint: '#7e7f7c' });
        for (let i = 1; i < 4; i++) kit.box({ x, y: ctx.top + h * (0.55 + i * 0.12), z, w: 1.2 - i * 0.25, h: 0.02, d: 0.02, mat: 'steel_dark' });
      }
    },
  });

  // ---------------- N_E2 bakery (brick_commercial red, 4F): boarded front, awning, alley face with a fire escape
  block(kit, {
    id: 'N_E2', x0: 9, x1: 26, z0: -50, z1: -40, floors: [4.5, 3.4, 3.4, 3.4], parapet: 0.8,
    mat: 'brick_red', tint: '#e2cfc2', trim: 'trim_stone', trimTint: '#d6cdbd', cornice: { kind: 'metal', mat: 'trim_metal', tint: '#5a4a3c', bracket: 1.0 },
    win: { w: 1.2, h: 1.9, sill: 0.9, lintel: 'trim_stone', ac: 0.08 },
    faces: [
      {
        side: 'W', cols: [1.7, 5.0, 8.3], pipes: [0.25],
        ground: () => [
          { x: 0.9, w: 3.3, y: BY + 0.02, h: 3.0, type: 'shop', state: 'boarded', frame: 'frame_white', kick: 'trim_wood' },
          { x: 4.45, w: 1.15, y: BY + 0.02, h: 2.55, type: 'door', state: 'closed', door: 'nz_wood', doorTint: '#8a6a4a', window: true, frame: 'frame_white', step: false },
          { x: 5.85, w: 3.3, y: BY + 0.02, h: 3.0, type: 'shop', state: 'boarded', frame: 'frame_white', kick: 'trim_wood' },
        ],
        decor: () => {
          planks(kit, 4.4, 5.65, BY + 0.5, BY + 2.3, 0.02, '#c9b28c');
          posterWall(kit, 1.0, 4.1, 1.0, 2.6, 0.06, 4, ['CLOSED', 'BREAD', null]);
          posterWall(kit, 6.0, 9.0, 0.9, 2.7, 0.06, 5, ['MISSING', 'EVACUATE', null]);
          const zf = board(kit, 0.7, 9.3, 3.4, 0.84, { mat: 'sign_white', tint: '#e0d4b4', border: { mat: 'sign_red', tint: '#8f3a2c', w: 0.035 } });
          textMixed(kit, [['BAKERY', { font: 'serif', h: 0.44, mat: 'nz_ink' }], ['麵包坊', { font: 'cjk', h: 0.46, mat: 'nz_ink_red' }]], { x: 5.0, y: 3.6, z: zf, gap: 0.4, maxW: 8.0 });
          stripedAwning(kit, { x0: 0.9, x1: 9.1, y: 3.38, depth: 1.4, colors: ['#9c2a22', '#e9e3d6'], torn: [3, 4], hang: [3] });
          kit.wallLamp({ x: 5.0, y: BY + 2.85, on: false });
        },
      },
      {
        side: 'N', span: [9, 26], cols: [4.5, 8.0, 11.5, 15.0], floors: [1, 3], room: 0.9,
        ground: (e) => [
          { x: e.lx(12.1), w: 1.0, y: BY + 0.02, h: 2.2, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#6a7068', step: false },
          { x: e.lx(16.8), w: 0.9, y: BY + 2.4, h: 0.6, type: 'vent' },
          { x: e.lx(20.4), w: 1.1, y: BY + 1.0, h: 1.4, type: 'window', state: 'boarded', frame: 'frame_dark' },
        ],
        decor: (e) => {
          kit.wallLamp({ x: e.lx(11.6), y: BY + 2.75, on: true, intensity: 4, range: 7, color: '#ffbf7a' });
          kit.fireEscape({ x: e.lx(17.5), floors: 4, groundH: 4.5, floorH: 3.4, bases: [0, 4.5, 7.9, 11.3].map((v) => v + BY), width: 3.4 });
          for (const [x, y] of [[e.lx(14.2), 6.0], [e.lx(21.0), 9.4]]) kit.windowAC(x, y);
          streaks(kit, 1.0, 16.0, 14.6, 8, 0.004, [1.2, 3.0]);
          posterWall(kit, e.lx(14.0), e.lx(13.0), 1.0, 2.0, 0.02, 2, ['NO', null]);
        },
        pipes: [0.4, 9.5],
      },
    ],
  });

  // ---------------- N_E3 warehouse offices (painted_brick, 6F): roller shutters, ghost sign on the alley wall
  const PAINT = '#cdc1a2';
  block(kit, {
    id: 'N_E3', x0: 9, x1: 26, z0: -62, z1: -53, floors: [4.5, 3.4, 3.4, 3.4, 3.4, 3.4], parapet: 0.9,
    mat: 'brick_painted', tint: PAINT, trim: 'trim_concrete', trimTint: '#b3aa96', cornice: { kind: 'simple', mat: 'trim_concrete', tint: '#a69e8c' },
    win: { w: 1.2, h: 1.7, sill: 0.9, lintel: 'trim_concrete', ac: 0.05 }, belts: false,
    faces: [
      {
        side: 'W', cols: [1.5, 4.5, 7.5], pipes: [8.75],
        ground: () => [
          { x: 0.7, w: 3.4, y: BY + 0.02, h: 3.3, type: 'garage', shutter: 1, shutterTint: '#8e9188' },
          { x: 4.6, w: 3.4, y: BY + 0.02, h: 3.3, type: 'garage', shutter: 1, shutterTint: '#7f8a84' },
        ],
        decor: () => {
          posterWall(kit, 0.8, 4.0, 0.6, 2.6, 0.02, 5, ['QUARANTINE', 'MISSING', null]);
          posterWall(kit, 4.7, 7.9, 0.8, 2.4, 0.02, 3, ['KEEP OUT', null]);
          kit.at({ x: 4.3, y: 1.1, z: 0.02 }, () => textLine(kit, 'NO PARKING', { font: 'sans', h: 0.13, x: 0, y: 0, z: 0.01, align: 'center', mat: 'nz_ink_red' }));
          const zf = board(kit, 0.6, 8.4, 3.62, 0.62, { mat: 'sign_white', tint: '#bdb5a2', d: 0.06 });
          textLine(kit, 'QUARRY ST. STORAGE CO.', { font: 'serif', h: 0.26, x: 4.5, y: 3.8, z: zf, align: 'center', mat: 'nz_ink', maxW: 7.4, shade: 0.7 });
          peel(kit, 0.2, 8.8, 4.8, 21.0, 0.006, 4);
          streaks(kit, 0.2, 8.8, 21.4, 7, 0.004, [1.5, 4.0]);
        },
      },
      {
        side: 'S', span: [9, 26], cols: [14.0], floors: [1, 5], win: { w: 1.0, h: 1.5 },
        ground: (e) => [
          { x: e.lx(10.6), w: 1.0, y: BY + 0.02, h: 2.2, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#7e7a6e', step: false },
          { x: e.lx(16.2), w: 1.6, y: BY + 2.6, h: 0.5, type: 'vent' },
          { x: e.lx(21.0), w: 1.4, y: BY + 1.0, h: 1.3, type: 'window', state: 'boarded', frame: 'frame_dark' },
        ],
        decor: (e) => {
          ghostSign(kit, 1.4, 12.6, 9.6, 20.3);
          peel(kit, 0.3, 16.5, 4.8, 9.0, 0.006, 6);
          streaks(kit, 0.3, 16.5, 21.4, 8, 0.008, [1.5, 4.0]);
          kit.prop('security_light', { at: [e.lx(10.6), 0.3], y: BY + 2.55, rot: 0 });
        },
        pipes: [16.2],
      },
    ],
  });
}
/** Spray-painted search mark (X with a date above) on a door or wall plane (wall-local, centre cx, cy). */
function searchMark(kit, cx, cy, size, mat, date) {
  const t = size * 0.09;
  for (const sg of [-1, 1]) kit.at({ x: cx, y: cy, z: 0.03, rz: sg * PI / 4 }, () => kit.face([[-size * 0.7, -t / 2, 0], [size * 0.7, -t / 2, 0], [size * 0.7, t / 2, 0], [-size * 0.7, t / 2, 0]], mat));
  textLine(kit, date, { font: 'sans', h: size * 0.18, x: cx, y: cy + size * 0.55, z: 0.031, align: 'center', mat, italic: 0.1 });
  textLine(kit, '0', { font: 'sans', h: size * 0.16, x: cx + size * 0.42, y: cy - size * 0.08, z: 0.031, align: 'center', mat });
}
/** Peeling paint: red brick patches showing through the painted wall (wall-local area). */
function peel(kit, x0, x1, y0, y1, z, n) {
  for (let i = 0; i < n; i++) {
    const w = kit.rnd(0.4, 1.4), h = kit.rnd(0.3, 1.1), x = kit.rnd(x0, x1 - w), y = kit.rnd(y0, y1 - h);
    const pts = [[x, y], [x + w * 0.7, y + h * 0.05], [x + w, y + h * 0.4], [x + w * 0.85, y + h], [x + w * 0.25, y + h * 0.9], [x - w * 0.05, y + h * 0.45]];
    flat(kit, pts, z, 'brick_red', { tint: '#ad9488' });
  }
}
/** Faded painted wall advert ROYAL OATS on the alley wall of N_E3 (wall-local x, world y). */
function ghostSign(kit, x0, x1, y0, y1) {
  const z = 0.006, mid = (x0 + x1) / 2;
  flat(kit, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], z, 'brick_painted', { tint: '#9c6a52' });
  flat(kit, [[x0 + 0.25, y0 + 0.25], [x1 - 0.25, y0 + 0.25], [x1 - 0.25, y0 + 0.4], [x0 + 0.25, y0 + 0.4]], z + 0.002, 'brick_painted', { tint: '#d8cbb0' });
  flat(kit, [[x0 + 0.25, y1 - 0.4], [x1 - 0.25, y1 - 0.4], [x1 - 0.25, y1 - 0.25], [x0 + 0.25, y1 - 0.25]], z + 0.002, 'brick_painted', { tint: '#d8cbb0' });
  textLine(kit, 'ROYAL', { font: 'slab', h: 2.3, x: mid, y: y1 - 3.3, z: z + 0.003, align: 'center', mat: 'brick_painted', tint: '#e2d6b8', maxW: x1 - x0 - 1.0 });
  textLine(kit, 'OATS', { font: 'slab', h: 2.3, x: mid, y: y1 - 6.2, z: z + 0.003, align: 'center', mat: 'brick_painted', tint: '#e2d6b8', maxW: x1 - x0 - 1.0 });
  textLine(kit, 'HOT BREAKFAST · SINCE 1908', { font: 'serif', h: 0.55, x: mid, y: y0 + 1.0, z: z + 0.003, align: 'center', mat: 'brick_painted', tint: '#cfc2a4', maxW: x1 - x0 - 1.2 });
  // a bowl motif: half ellipse + steam lines
  const bowl = [];
  for (let i = 0; i <= 10; i++) { const a = PI + (i / 10) * PI; bowl.push([mid + Math.cos(a) * 1.3, y0 + 2.7 + Math.sin(a) * 0.8]); }
  flat(kit, bowl, z + 0.003, 'brick_painted', { tint: '#d9ccae' });
  peel(kit, x0, x1, y0, y1, z + 0.005, 5);
}

// ==================================================================================================== alley AL_NE
function alley(kit, L) {
  // pocket end wall at x = 24: a 3-storey brick back building closing the alley
  block(kit, {
    id: 'AL_END', x0: 24, x1: 26, z0: -53, z1: -50, floors: [4.0, 3.2, 3.2], parapet: 0.6,
    mat: 'brick_dark', tint: '#bfb0a6', trim: 'trim_concrete', trimTint: '#8e887e', cornice: false, belts: false, clutter: false,
    win: { w: 1.0, h: 1.4, sill: 0.9, states: { boarded: 0.6, broken: 0.4 } },
    faces: [{
      side: 'W', cols: [1.5], plinth: false,
      ground: () => [{ x: 0.9, w: 1.1, y: BY + 0.02, h: 2.2, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#5f645c', step: false }],
      decor: () => { posterWall(kit, 0.1, 0.8, 1.0, 2.0, 0.02, 1, ['NO']); streaks(kit, 0.1, 2.9, 10.4, 3, 0.004); },
    }],
  });
  // chain-link fence with the torn gap (N_FENCE_AL_1 / _2), barbed wire; the gap is narrowed to 0.62 m by a bent
  // flap and a leaning pallet: players (r 0.34) cannot squeeze through, the nav cells at z -51.25 stay walkable
  kit.fence([[13.5, -53.0], [13.5, -51.9]], { kind: 'chainlink', h: 2.4, barbed: true, y: SW });
  kit.fence([[13.5, -50.7], [13.5, -50.0]], { kind: 'chainlink', h: 2.4, barbed: true, y: SW });
  kit.at({ x: 13.5, y: SW, z: -51.9, rot: -PI / 2 + 0.9 }, () => {
    kit.face([[0, 0.05, 0], [0.55, 0.15, 0], [0.62, 1.9, 0], [0, 2.35, 0]], 'chainlink', { uvs: [[0, 0.05], [0.55, 0.15], [0.62, 1.9], [0, 2.35]] });
  });
  kit.colBox({ x: 13.5, y: SW, z: (-51.9 + -51.56) / 2, w: 0.4, h: 2.4, d: 0.34 }, 'metal');
  kit.at({ x: 13.75, y: SW, z: -50.86, rot: 0, rx: -0.12 }, () => pallet(kit));
  kit.colBox({ x: 13.5, y: SW, z: (-50.94 + -50.7) / 2, w: 0.4, h: 2.0, d: 0.24 }, 'wood');
  // dumpster N_DUMP_AL against the south wall of the alley mouth
  dumpster(kit, [11.2, -52.4], 0, SW);
  // trash, pallets, tyres, crates in the alley and the pocket; a burnt-out barrel
  trashPile(kit, [10.4, -50.6], SW, 4);
  trashPile(kit, [16.5, -52.5], SW, 3);
  trashPile(kit, [21.8, -50.7], SW, 3);
  for (const [x, z, r] of [[22.8, -52.4, 0.2], [23.0, -52.2, 0.1]]) kit.at({ x, y: SW + (r === 0.1 ? 0.14 : 0), z, rot: r }, () => pallet(kit, true));
  kit.prop('old_tyre', { at: [18.6, -52.6], y: SW, rx: PI / 2, rot: 0.4 });
  kit.prop('old_tyre', { at: [18.9, -52.5], y: SW + 0.17, rx: PI / 2, rot: 1.1 });
  kit.prop('barrel_03', { at: [20.2, -50.5], y: SW, rot: 0.3 });
  kit.prop('cardboard_box_01', { at: [15.2, -50.4], y: SW, rot: 0.6 });
  kit.prop('cardboard_box_01', { at: [15.0, -50.5], y: SW + 0.34, rot: 1.2 });
  kit.prop('wooden_crate_02', { at: [12.6, -50.45], y: SW, rot: PI / 2 + 0.1 });
}
/** Trash heap: one Poly Haven bag, low-poly bags and cardboard, loose paper (the bag prop alone is 1.2 k tris). */
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
/** Wooden pallet standing on its long edge (local frame: x along, leaning by the caller), or lying flat. */
function pallet(kit, flatPallet) {
  const t = '#c9b08a';
  if (flatPallet) {
    for (let i = 0; i < 7; i++) kit.box({ x: -0.5 + i * 0.165, y: 0.12, z: 0, w: 0.1, h: 0.02, d: 1.2, mat: 'nz_wood', tint: t });
    for (const z of [-0.55, 0, 0.55]) kit.box({ x: 0, y: 0, z, w: 1.0, h: 0.12, d: 0.09, mat: 'nz_wood', tint: shadeHex(t, 0.8) });
    return;
  }
  for (let i = 0; i < 6; i++) kit.box({ x: 0, y: 0.05 + i * 0.36, z: 0.0, w: 1.0, h: 0.1, d: 0.02, mat: 'nz_wood', tint: t });
  for (const x of [-0.45, 0, 0.45]) kit.box({ x, y: 0, z: -0.06, w: 0.09, h: 1.95, d: 0.1, mat: 'nz_wood', tint: shadeHex(t, 0.8) });
}
/** Steel dumpster with sloped lid (one half open), side pockets and casters. */
function dumpster(kit, at, rot, y) {
  kit.at({ x: at[0], y, z: at[1], rot }, () => {
    const tint = '#55705a';
    kit.bbox({ x: 0, y: 0.12, z: 0, w: 1.9, h: 1.05, d: 1.2, bevel: 0.04, mat: 'paint_metal', tint, taper: { top: [1.0, 1.06] } });
    kit.box({ x: 0, y: 1.0, z: -0.05, w: 1.98, h: 0.1, d: 1.36, mat: 'paint_metal', tint: shadeHex(tint, 0.85) });
    kit.at({ x: -0.48, y: 1.13, z: -0.62, rx: -0.12 }, () => kit.box({ x: 0, y: 0, z: 0.64, w: 0.92, h: 0.04, d: 1.28, mat: 'car_plastic', tint: '#222322' }));
    kit.at({ x: 0.48, y: 1.13, z: -0.62, rx: -1.9 }, () => kit.box({ x: 0, y: 0, z: 0.64, w: 0.92, h: 0.04, d: 1.28, mat: 'car_plastic', tint: '#222322' }));
    for (const sx of [-0.8, 0.8]) for (const sz of [-0.45, 0.45]) kit.cyl({ x: sx, y: 0, z: sz, r: 0.06, h: 0.12, seg: 8, mat: 'rubber' });
    for (const s of [-1, 1]) kit.box({ x: s * 0.99, y: 0.6, z: 0, w: 0.1, h: 0.18, d: 0.9, mat: 'paint_metal', tint: shadeHex(tint, 0.8) });
    kit.colBox({ x: 0, y: 0, z: 0, w: 1.95, h: 1.3, d: 1.3 }, 'metal');
    textLine(kit, 'CITY WASTE 2', { font: 'sans', h: 0.09, x: 0, y: 0.75, z: 0.635, align: 'center', mat: 'nz_ink_white', shade: 0.7 });
  });
}

// ==================================================================================================== LM_BRIDGE
function bridge(kit, L) {
  const BR = L.LANDMARKS.bridge;
  const zS = BR.z[1], zN = BR.z[0];                // -62, -74
  const yU = BR.deckUnderY, yD = BR.deckTopY, yP = BR.parapetTopY;   // 5.2, 6.6, 7.8
  const GIRDER = '#7f8e80', STONE = '#d8d2c6';
  // ---- abutments (x ±7..±9): stone-faced, pocket side walls continue to the end wall (z -76)
  for (const s of [-1, 1]) {
    const xi = 7 * s, xo = 9 * s, xa = Math.min(xi, xo), xb = Math.max(xi, xo);
    // south face (portal) with ashlar courses and a projecting stone band at the top
    vq(kit, 'concrete_wall', 'z', zS, 1, xa, xb, SW, yU, { tint: STONE, grime: { y: SW, h: 1.8, k: 0.45 } });
    for (let y = SW + 0.6; y < yU - 0.1; y += 0.6) kit.box({ x: (xa + xb) / 2, y, z: zS + 0.005, w: 2.0, h: 0.025, d: 0.012, mat: 'trim_concrete', tint: '#5c5850', faces: { nz: false } });
    for (let y = SW + 0.6, k = 0; y < yU - 0.6; y += 0.6, k++) kit.box({ x: (k % 2 ? xa + 0.85 : xa + 1.3), y: y + 0.02, z: zS + 0.005, w: 0.025, h: 0.56, d: 0.012, mat: 'trim_concrete', tint: '#5c5850', faces: { nz: false } });
    kit.box({ x: (xa + xb) / 2, y: yU - 0.32, z: zS + 0.08, w: 2.1, h: 0.32, d: 0.16, mat: 'trim_stone', tint: '#b9b2a2', faces: { nz: false } });
    kit.box({ x: (xa + xb) / 2, y: SW, z: zS + 0.06, w: 2.04, h: 0.45, d: 0.12, mat: 'trim_concrete', tint: '#7d786d', faces: { nz: false, bottom: false } });
    // inner wall (tunnel side), concrete, wet and sooty
    vq(kit, 'concrete_dirty', 'x', xi, -s, -76, zS, SW, yU + 0.45, { tint: '#8f8a80', grime: { y: SW, h: 2.2, k: 0.5 } });
    kit.at({ x: xi, y: 0, z: -69, rot: s > 0 ? PI / 2 : -PI / 2 }, () => streaks(kit, -7, 7, yU + 0.4, 12, 0.006, [1.2, 3.5]));
    kit.colBox({ x: (xa + xb) / 2, y: 0, z: (zS - 76) / 2, w: 2, h: yU + 0.45, d: 76 + zS }, 'concrete');
    // posters + graffiti tags on the portal faces (reference: poster-covered walls by the barricade)
    kit.at({ x: (xa + xb) / 2, y: 0, z: zS }, () => posterWall(kit, -0.9, 0.9, 0.8, 2.6, 0.01, 6, ['MISSING', 'EVACUATE', 'LOST', 'QUARANTINE', null]));
  }
  // ---- south plate girder (green-grey, riveted): web, flanges, stiffeners, rust (visible span x -9.4..9.4)
  const gx0 = -9.4, gx1 = 9.4, zw = zS - 0.12;
  vq(kit, 'paint_metal', 'z', zw, 1, gx0, gx1, yU + 0.15, yP - 0.18, { tint: GIRDER });
  kit.box({ x: 0, y: yP - 0.18, z: zS - 0.24, w: gx1 - gx0, h: 0.18, d: 0.5, mat: 'paint_metal', tint: shadeHex(GIRDER, 0.92) });
  kit.box({ x: 0, y: yU, z: zS - 0.27, w: gx1 - gx0, h: 0.15, d: 0.56, mat: 'paint_metal', tint: shadeHex(GIRDER, 0.88), faces: { nz: false } });
  for (let x = gx0 + 0.35; x < gx1 - 0.2; x += 1.45) {
    kit.box({ x, y: yU + 0.15, z: zw + 0.05, w: 0.16, h: yP - yU - 0.33, d: 0.1, mat: 'paint_metal', tint: shadeHex(GIRDER, 1.05), faces: { nz: false } });
    for (let y = yU + 0.35; y < yP - 0.3; y += 0.24) kit.face([[x - 0.018, y, zw + 0.101], [x + 0.018, y, zw + 0.101], [x + 0.018, y + 0.036, zw + 0.101], [x - 0.018, y + 0.036, zw + 0.101]], 'nz_ink_rivet');
  }
  for (const yy of [yU + 0.06, yP - 0.1]) for (let x = gx0 + 0.1; x < gx1; x += 0.2) kit.face([[x - 0.018, yy - 0.018, zS + 0.012], [x + 0.018, yy - 0.018, zS + 0.012], [x + 0.018, yy + 0.018, zS + 0.012], [x - 0.018, yy + 0.018, zS + 0.012]], 'nz_ink_rivet');
  kit.at({ x: 0, y: 0, z: zw + 0.004 }, () => {
    for (let i = 0; i < 14; i++) { const sx = kit.rnd(gx0, gx1 - 0.5), sw = kit.rnd(0.12, 0.35), l = kit.rnd(0.6, 2.0), u0 = kit.pick([0, 0.5]); kit.face([[sx, yP - 0.2 - l, 0], [sx + sw, yP - 0.2 - l, 0], [sx + sw, yP - 0.2, 0], [sx, yP - 0.2, 0]], 'decal_streak', { uvs: [[u0, 0], [u0 + 0.5, 0], [u0 + 0.5, 1], [u0, 1]], tint: '#8a5a3a' }); }
    for (const [x, y, w, h] of [[-6.2, 6.1, 1.1, 0.6], [2.4, 5.6, 0.8, 0.5], [7.1, 6.9, 0.7, 0.45]]) kit.face([[x, y, 0.002], [x + w, y, 0.002], [x + w, y + h, 0.002], [x, y + h, 0.002]], 'metal_rusty', { tint: '#9a7a62' });
    // stencilled bridge number + clearance plate
    textLine(kit, 'BR. 14-B', { font: 'sans', h: 0.22, x: -4.6, y: 6.75, z: 0.004, align: 'center', mat: 'nz_ink_white', shade: 0.7 });
    const zf = board(kit, 3.1, 5.5, 5.55, 0.42, { mat: 'sign_yellow', tint: '#d9b13a', d: 0.02 });
    textLine(kit, 'CLEARANCE 5.2 M', { font: 'sans', h: 0.16, x: 4.3, y: 5.68, z: zf, align: 'center', mat: 'nz_ink', maxW: 2.1 });
  });
  // ---- deck, ballast, rails, north girder (mostly hidden; the deck is collision for SP_N_BRIDGE)
  hq(kit, 'gravel', yD, -26, zN + 0.4, 26, zS - 0.5, true, { tint: '#8f8a80' });
  for (const zc of [-66.2, -69.8]) for (const dz of [-0.72, 0.72]) kit.box({ x: 0, y: yD, z: zc + dz, w: 52, h: 0.16, d: 0.07, mat: 'steel_dark', tint: '#4d4741', faces: { bottom: false } });
  kit.colBox({ x: 0, y: yU, z: (zS + zN) / 2, w: 52, h: yD - yU, d: zS - zN }, 'concrete');
  kit.colBox({ x: 0, y: yD, z: zS - 0.25, w: 52, h: yP - yD, d: 0.5 }, 'metal');
  kit.colBox({ x: 0, y: yD, z: zN + 0.25, w: 52, h: yP - yD, d: 0.5 }, 'metal');
  vq(kit, 'paint_metal', 'z', zN + 0.5, 1, -9, 9, yD, yP, { tint: shadeHex(GIRDER, 0.75) });
  // ---- underpass ceiling: cross girders (bottom flange at 5.2), soffit at 5.65, pipes, cable tray, drips
  hq(kit, 'concrete_dirty', yU + 0.45, -7, -76, 7, zS - 0.55, false, { tint: '#5d5a54' });
  for (let z = zS - 0.9; z > -75.8; z -= 1.55) kit.beam([-7, yU + 0.225, z], [7, yU + 0.225, z], { kind: 'I', h: 0.45, w: 0.28, t: 0.03, mat: 'steel_dark', tint: '#4e5650' });
  kit.beam([-7, yU + 0.225, zN - 0.2], [7, yU + 0.225, zN - 0.2], { kind: 'I', h: 0.45, w: 0.5, t: 0.04, mat: 'steel_dark', tint: '#4e5650' });
  for (const s of [-1, 1]) {
    kit.sweep(circle(0.11, 10), [[s * 6.62, 4.85, zS - 0.3], [s * 6.62, 4.85, -75.9]], 'steel', { smooth: true, tint: '#6a5a4a', up: [1, 0, 0] });
    for (let z = zS - 1.5; z > -75.5; z -= 3) kit.box({ x: s * 6.8, y: 4.68, z, w: 0.36, h: 0.05, d: 0.06, mat: 'steel_dark' });
  }
  kit.box({ x: -6.75, y: 4.2, z: -69, w: 0.4, h: 0.06, d: 14.0, mat: 'steel_dark', tint: '#55524c' });
  for (let i = 0; i < 6; i++) kit.cyl({ x: -6.75 + kit.rnd(-0.12, 0.12), y: 4.26, z: -62.8 - i * 2.3, r: 0.03, h: 0.02, seg: 6, mat: 'car_plastic', rx: PI / 2 });
  // ---- end of the underpass: the pocket wall (z -76) with a steel door, LB_TUNNEL_END lamp on a bracket
  vq(kit, 'concrete_dirty', 'z', -76, 1, -7, 7, 0, yU + 0.45, { tint: '#7a766c', grime: { y: SW, h: 2.4, k: 0.55 } });
  kit.colBox({ x: 0, y: 0, z: -76.3, w: 14, h: yU + 0.5, d: 0.6 }, 'concrete');
  kit.at({ x: 0, y: 0, z: -76 }, () => {
    kit.box({ x: 3.4, y: SW, z: 0.03, w: 1.1, h: 2.2, d: 0.05, mat: 'paint_metal', tint: '#6a7066' });
    kit.box({ x: 3.4, y: SW + 2.2, z: 0.04, w: 1.25, h: 0.08, d: 0.07, mat: 'frame_dark' });
    const zf = board(kit, 2.95, 3.85, SW + 1.55, 0.4, { mat: 'sign_yellow', tint: '#d8b23a', d: 0.01, z: 0.06 });
    textLine(kit, 'DANGER', { font: 'sans', h: 0.11, x: 3.4, y: SW + 1.7, z: zf, align: 'center', mat: 'nz_ink' });
    textLine(kit, '危險', { font: 'cjk', h: 0.1, x: 3.4, y: SW + 1.58, z: zf, align: 'center', mat: 'nz_ink' });
    streaks(kit, -6.8, 6.6, yU + 0.4, 10, 0.004, [1.5, 4.5]);
    kit.box({ x: 0, y: 4.62, z: 0.5, w: 0.06, h: 0.06, d: 1.0, mat: 'steel_dark' });
    cagedLamp(kit, [0, 4.55, 1.0], true);
  });
  // ---- caged sodium lamps under the girder: LB_BRIDGE_1 (west, lit) and a dead one (east)
  for (const [x, on] of [[-3.5, true], [3.5, false]]) {
    kit.sweep(circle(0.02, 6), [[x, yU + 0.02, -63.0], [x, 5.02, -63.0]], 'steel_dark', { smooth: true, up: [1, 0, 0] });
    cagedLamp(kit, [x, 4.92, -63.0], on);
  }
  // ---- hanging green sign ↑ N QUARRY ST · 採石場街 (y 4.0..4.9), west hanger broken: the sign swings down
  const sz = zS - 0.18;
  kit.sweep(circle(0.015, 5), [[1.3, yU, sz], [1.3, 4.9, sz]], 'steel_dark', { smooth: true, up: [1, 0, 0] });
  kit.sweep(circle(0.015, 5), [[-1.3, yU, sz], [-1.3, 5.05, sz + 0.02], [-1.22, 4.98, sz + 0.05]], 'steel_dark', { smooth: true, up: [1, 0, 0] });
  kit.at({ x: 1.3, y: 4.9, z: sz, rz: 0.13 }, () => {
    const W = 3.2, H = 0.9;
    kit.bbox({ x: -W / 2 + 0.1, y: -H, z: 0, w: W, h: H, d: 0.05, bevel: 0.01, mat: 'sign_green', tint: '#3f7a52' });
    kit.at({ x: -W / 2 + 0.1, y: -H, z: 0.028 }, () => {
      const bw = 0.03, ins = 0.06;
      for (const [x0, y0, x1, y1] of [[-W / 2 + ins, ins, W / 2 - ins, ins + bw], [-W / 2 + ins, H - ins - bw, W / 2 - ins, H - ins], [-W / 2 + ins, ins, -W / 2 + ins + bw, H - ins], [W / 2 - ins - bw, ins, W / 2 - ins, H - ins]]) kit.face([[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]], 'nz_ink_white');
      // arrow (our own shape) + street name + Chinese name
      flat(kit, [[-1.38, 0.22], [-1.26, 0.22], [-1.26, 0.52], [-1.17, 0.52], [-1.32, 0.72], [-1.47, 0.52], [-1.38, 0.52]], 0.001, 'nz_ink_white');
      textLine(kit, 'N QUARRY ST', { font: 'hwy', h: 0.27, x: -1.05, y: 0.46, z: 0.001, mat: 'nz_ink_white', maxW: 1.95, track: 0.04 });
      textLine(kit, '採石場街', { font: 'cjk', h: 0.2, x: -1.05, y: 0.15, z: 0.001, mat: 'nz_ink_white', track: 0.12 });
    });
    kit.box({ x: -W / 2 + 0.1, y: -H, z: -0.03, w: W - 0.1, h: H - 0.1, d: 0.02, mat: 'steel_dark', faces: { pz: false } });
    for (const x of [0, -W + 0.2]) kit.box({ x, y: -0.04, z: 0, w: 0.06, h: 0.08, d: 0.08, mat: 'steel_dark' });
  });
  // ---- LOST TOWN boards on the girder (y 7.8..10, x -12..12): 8 tilted cream boards on a steel frame, one askew
  // 1.9 m boards, 0.2 m gaps, 0.9 m word gap: the row stays inside the canyon opening (buildings at |x| >= 9)
  const bw = 1.9, bh = 2.2;
  const xs = [-7.7, -5.6, -3.5, -1.4, 1.4, 3.5, 5.6, 7.7];
  const zb = zS + 0.14;
  for (const yy of [yP + 0.35, yP + bh - 0.35]) kit.beam([-8.95, yy, zb - 0.22], [8.95, yy, zb - 0.22], { kind: 'L', h: 0.1, w: 0.08, t: 0.01, tint: '#45443f' });
  [...'LOSTTOWN'].forEach((ch, i) => {
    const x = xs[i];
    for (const px of [x - 0.65, x + 0.65]) {
      kit.beam([px, yP - 0.05, zb - 0.22], [px, yP + bh - 0.1, zb - 0.22], { kind: 'box', h: 0.07, w: 0.07, tint: '#45443f', up: [1, 0, 0] });
      kit.beam([px, yP + bh - 0.2, zb - 0.26], [px, yD + 0.05, zS - 1.6], { kind: 'box', h: 0.06, w: 0.06, tint: '#45443f', up: [1, 0, 0] });
    }
    const askew = i === 5; // the second O of TOWN slipped off a hook
    const tilt = [0.05, -0.04, 0.03, -0.06, 0.02, 0.0, -0.03, 0.06][i], lean = [0.06, 0.1, 0.04, 0.08, 0.05, 0.12, 0.07, 0.03][i];
    if (askew) kit.at({ x: x - bw / 2 + 0.12, y: yP + bh - 0.25, z: zb + 0.04, rz: -0.3, rx: -0.08 }, () => letterBoard(kit, ch, bw, bh, bw / 2 - 0.12, -bh / 2 + 0.25));
    else kit.at({ x, y: yP + bh / 2 + 0.02, z: zb, rz: tilt, rx: -lean }, () => letterBoard(kit, ch, bw, bh, 0, 0));
  });
  // ---- catenary masts on the deck at x ±8.4 (silhouette over the parapet), one contact wire snapped
  for (const s of [-1, 1]) {
    const x = 8.4 * s;
    for (const z of [-62.9, -73.1]) kit.beam([x, yD, z], [x, 13.6, z], { kind: 'I', h: 0.26, w: 0.2, t: 0.02, mat: 'steel_dark', tint: '#4b514c', up: [0, 0, 1] });
    kit.beam([x, 13.2, -62.7], [x, 13.2, -73.3], { kind: 'I', h: 0.3, w: 0.18, t: 0.02, mat: 'steel_dark', tint: '#4b514c' });
    for (const zc of [-66.2, -69.8]) {
      kit.sweep(circle(0.02, 5), [[x, 13.05, zc], [x, 12.35, zc]], 'steel_dark', { smooth: true, up: [1, 0, 0] });
      kit.cyl({ x, y: 12.15, z: zc, r: 0.05, h: 0.2, seg: 8, mat: 'car_light', tint: '#6d6a5a' });
    }
  }
  kit.wire([-26, 12.3, -69.8], [26, 12.3, -69.8], { sag: 0.25, r: 0.012 });
  kit.wire([-26, 12.95, -69.8], [26, 12.95, -69.8], { sag: 0.6, r: 0.01 });
  kit.wire([-26, 12.3, -66.2], [-8.4, 12.3, -66.2], { sag: 0.15, r: 0.012 });
  kit.wire([26, 12.3, -66.2], [8.4, 12.3, -66.2], { sag: 0.15, r: 0.012 });
  kit.sweep(circle(0.012, 4), [[-8.4, 12.3, -66.2], [-6.5, 11.4, -65.4], [-4.8, 9.9, -63.9], [-4.4, 8.6, -62.6], [-4.2, 7.2, -61.85]], 'wire', { smooth: true });
  kit.sweep(circle(0.012, 4), [[8.4, 12.3, -66.2], [6.0, 11.0, -65.2], [5.1, 9.3, -63.6], [5.3, 8.4, -62.4]], 'wire', { smooth: true });

  // ---- barricade under the bridge (z -64.6..-62.1): white container across the lanes, crate stacks, zombie gap
  const BAR = BR.barricade, cont = BAR.parts[0];
  kit.container({ at: [cont.x, cont.z], rot: 0, size: 20, tint: cont.color, doors: 'closed' });
  kit.at({ x: 0, y: 0, z: cont.z + cont.d / 2 + 0.006 }, () => {
    textLine(kit, 'KEEP OUT', { font: 'sans', h: 0.55, x: -0.9, y: 1.05, z: 0.004, align: 'center', mat: 'nz_ink_red', italic: 0.12, track: 0.1 });
    textLine(kit, '封鎖', { font: 'cjk', h: 0.5, x: 2.25, y: 1.0, z: 0.004, align: 'center', mat: 'nz_ink_red' });
    textLine(kit, 'LTX 771034 6', { font: 'sans', h: 0.12, x: -2.2, y: 2.15, z: 0.003, align: 'center', mat: 'nz_ink', shade: 0.6 });
    streaks(kit, -2.9, 2.9, 2.4, 8, 0.002, [0.6, 1.8]);
  });
  // crate stacks: west x -7..-4.4 (2 wide x 2 deep x 2 high), east x 3.0..7.0 (3 wide); front row detailed
  for (const [cx, nx] of [[-5.7, 2], [5.0, 3]]) {
    const w = (nx * 1.3), x0 = cx - w / 2;
    for (let i = 0; i < nx; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) {
      const x = x0 + 0.65 + i * 1.3, z = -63.98 + k * 1.25, y = j * 1.3 + (Math.abs(x) > 5.5 ? SW : 0);
      if (k === 1) crate(kit, [x + kit.rnd(-0.04, 0.04), y, z + kit.rnd(-0.04, 0.04)], kit.rnd(-0.04, 0.04), false);   // back row: collision only (never seen)
    }
    kit.colBox({ x: cx, y: 0, z: -63.35, w, h: 2.6 + SW, d: 2.5 }, 'wood');
  }
  // the zombie gap x -4.4..-3.03: a pallet leaning on the crates and planks nailed to the container corner narrow it
  // to 0.62 m (players r 0.34 cannot pass; nav cells at x -3.75 stay clear), torn tarp hanging over it
  kit.at({ x: -4.27, y: 0, z: -63.35, rot: PI / 2, rz: -0.1 }, () => pallet(kit));
  kit.colBox({ x: (-4.4 + -4.06) / 2, y: 0, z: -63.35, w: 0.34, h: 2.6, d: 2.5 }, 'wood');
  for (const [z, rz] of [[-62.4, 0.04], [-62.9, -0.03], [-63.5, 0.02], [-64.2, -0.05]]) kit.at({ x: -3.2, y: 0.05, z, rz }, () => kit.box({ x: 0, y: 0, z: 0, w: 0.14, h: 2.45, d: 0.03, mat: 'nz_wood', tint: '#c7ae86' }));
  kit.colBox({ x: (-3.44 + -3.03) / 2, y: 0, z: -63.35, w: 0.41, h: 2.6, d: 2.5 }, 'wood');
  kit.face([[-4.35, 2.6, -62.2], [-3.1, 2.62, -62.2], [-3.3, 1.55, -62.05], [-3.75, 0.9, -61.98], [-4.3, 1.35, -62.05]], 'nz_fabric', { tint: '#5d6650' });
  kit.face([[-4.3, 1.35, -62.07], [-3.75, 0.9, -62.0], [-3.3, 1.55, -62.07], [-3.1, 2.62, -62.22], [-4.35, 2.6, -62.22]], 'nz_fabric', { tint: '#4c5442', shade: 0.7 });
  // player clip over the barricade up to the bridge underside (BLK_N_TOP)
  const top = L.BLOCKERS.find((b) => b.id === 'BLK_N_TOP').box;
  kit.colBox({ x: top.x, y: top.y, z: top.z, w: top.w, h: yU - top.y, d: top.d }, 'concrete');
  // sawhorses, cones, tape and a ROAD CLOSED sign in front of the barricade; a burning barrel by the east crates
  kit.plankBarricade({ at: [-0.6, -60.9], rot: 0.06, w: 2.6 });
  kit.at({ x: -0.6, y: 0.62, z: -60.86, rot: 0.06 }, () => {
    const zf = board(kit, -0.9, 0.9, 0.0, 0.36, { mat: 'sign_white', tint: '#e6e2d8', d: 0.02, z: 0.04 });
    textLine(kit, 'ROAD CLOSED', { font: 'sans', h: 0.16, x: 0, y: 0.1, z: zf, align: 'center', mat: 'nz_ink_red', maxW: 1.6 });
  });
  kit.plankBarricade({ at: [3.4, -61.3], rot: -0.25, w: 2.2 });
  for (const [x, z, f] of [[1.6, -60.6, false], [2.1, -60.2, true], [-2.8, -60.7, false], [-4.4, -61.1, false], [5.2, -60.4, true]]) kit.cone([x, z], { fallen: f });
  kit.tape([[-4.9, 1.0, -61.0], [-2.0, 0.95, -60.8], [0.8, 1.0, -60.9], [3.6, 1.0, -61.2], [6.4, 1.05, -61.4]]);
  kit.prop('Barrel_01', { at: [6.35, -60.55], y: SW, rot: 0.4, collide: true });
  kit.at({ x: 6.35, y: SW + 0.82, z: -60.55 }, () => {
    kit.cyl({ x: 0, y: 0, z: 0, r: 0.25, h: 0.02, seg: 10, mat: 'lamp_amber' });
    for (let i = 0; i < 5; i++) kit.box({ x: kit.rnd(-0.12, 0.12), y: 0.02, z: kit.rnd(-0.12, 0.12), w: 0.35, h: 0.04, d: 0.05, rot: kit.rnd(0, 3), rz: kit.rnd(-0.3, 0.3), mat: 'car_burnt', tint: '#2a2622' });
  });
  kit.light({ pos: [6.35, SW + 1.4, -60.55], color: '#ff9442', intensity: 7, range: 7, radius: 0.25, name: 'barrel_glow' });
  // litter in the underpass pocket
  trashPile(kit, [-4.6, -66.8], 0, 3);
  trashPile(kit, [4.0, -72.5], 0, 2);
  kit.debris([0.5, -70.5], { r: 3.0, count: 18, kinds: ['paper', 'plank', 'chunk', 'brick'] });
  kit.rubblePile([-2.8, -75.0], { r: 1.1, h: 0.5 });
}
/** Weathered cream letter board (board-local, centred at (ox, oy)): slab letters, border, hooks, streaks. */
function letterBoard(kit, ch, bw, bh, ox, oy) {
  kit.box({ x: ox, y: oy - bh / 2, z: 0, w: bw, h: bh, d: 0.06, mat: 'sign_white', tint: '#e4d7b6', uvOffset: [kit.rnd(0, 4), kit.rnd(0, 4)] });
  kit.box({ x: ox, y: oy - bh / 2 + 0.03, z: -0.06, w: bw - 0.12, h: bh - 0.06, d: 0.06, mat: 'steel_dark', tint: '#4a4640', faces: { pz: false } });
  kit.at({ x: ox, y: oy, z: 0.062 }, () => {
    const e = 0.09, t = 0.035;
    for (const [x0, y0, x1, y1] of [[-bw / 2 + e, -bh / 2 + e, bw / 2 - e, -bh / 2 + e + t], [-bw / 2 + e, bh / 2 - e - t, bw / 2 - e, bh / 2 - e], [-bw / 2 + e, -bh / 2 + e, -bw / 2 + e + t, bh / 2 - e], [bw / 2 - e - t, -bh / 2 + e, bw / 2 - e, bh / 2 - e]]) kit.face([[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]], 'nz_ink', { tint: '#5a4636' });
    const g = glyph('slab', ch), s = Math.min(1.5 / GLYPHS.slab.c, (bw - 0.42) / g.adv);
    glyphAt(kit, 'slab', ch, -(g.adv * s) / 2, -(GLYPHS.slab.c * s) / 2 - 0.02, s, s, { mat: 'nz_ink', z: 0.001 });
    for (let i = 0; i < 3; i++) {
      const sx = kit.rnd(-0.8, 0.5), sw = kit.rnd(0.15, 0.4), len = kit.rnd(0.5, 1.6), u0 = kit.pick([0, 0.5]);
      kit.face([[sx, bh / 2 - 0.06 - len, 0.003], [sx + sw, bh / 2 - 0.06 - len, 0.003], [sx + sw, bh / 2 - 0.06, 0.003], [sx, bh / 2 - 0.06, 0.003]], 'decal_streak', { uvs: [[u0, 0], [u0 + 0.5, 0], [u0 + 0.5, 1], [u0, 1]] });
    }
  });
  for (const sx of [-1, 1]) kit.box({ x: ox + sx * (bw / 2 - 0.25), y: oy + bh / 2 - 0.06, z: -0.05, w: 0.05, h: 0.18, d: 0.09, mat: 'steel_dark' });
}
/** 1.3 m wooden crate (planked sides + dark battens + stencil). back = plain (hidden row). */
function crate(kit, at, rot, back) {
  kit.at({ x: at[0], y: at[1], z: at[2], rot }, () => {
    const s = 1.28, t = '#cbb187';
    kit.box({ x: 0, y: 0, z: 0, w: s, h: s, d: 1.22, mat: 'nz_wood', tint: kit.pick([t, '#c2a77e', '#d4bd95']), uvOffset: [kit.rnd(0, 3), kit.rnd(0, 3)] });
    if (back) return;
    for (const [x, y, w, h] of [[0, 0.02, s + 0.02, 0.1], [0, s - 0.12, s + 0.02, 0.1], [-s / 2 + 0.05, 0.02, 0.1, s - 0.04], [s / 2 - 0.05, 0.02, 0.1, s - 0.04]]) kit.box({ x, y, z: 0.62, w, h, d: 0.04, mat: 'nz_wood', tint: '#8f7553', faces: { nz: false } });
    kit.at({ x: 0, y: 0.15, z: 0.645, rz: 0.78 }, () => kit.box({ x: 0, y: 0, z: 0, w: 1.45, h: 0.1, d: 0.03, mat: 'nz_wood', tint: '#9a805c', faces: { nz: false } }));
    if (kit.chance(0.6)) textLine(kit, kit.pick(['FRAGILE', 'THIS SIDE UP', 'NO HOOKS', 'LT-04']), { font: 'sans', h: 0.07, x: 0, y: 0.95, z: 0.665, align: 'center', mat: 'nz_ink', shade: 0.6, maxW: 0.9 });
  });
}
/** Caged lamp (housing, wire cage, lens) hanging at a point; lit = sodium glow (light comes from layout / LB_*). */
function cagedLamp(kit, at, lit) {
  kit.at({ x: at[0], y: at[1], z: at[2] }, () => {
    kit.cyl({ x: 0, y: 0, z: 0, r: 0.14, r2: 0.1, h: 0.12, seg: 10, mat: 'steel_dark', tint: '#3f3d39' });
    kit.cyl({ x: 0, y: -0.24, z: 0, r: 0.08, r2: 0.09, h: 0.24, seg: 10, mat: lit ? 'lamp_amber' : 'lamp_off' });
    for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2; kit.box({ x: Math.cos(a) * 0.12, y: -0.3, z: Math.sin(a) * 0.12, w: 0.012, h: 0.3, d: 0.012, mat: 'steel_dark' }); }
    const ring = circle(0.125, 10).map(([x, z]) => [x, -0.31, z]);
    kit.sweep(circle(0.01, 4), [...ring, ring[0]], 'steel_dark', { smooth: true });   // open ring: a solid disc would shadow the floor under the lamp
  });
}

// ==================================================================================================== beyond the bridge
// Blocks north of the viaduct (x ±9..±26, z -80..-74) continue the canyon above the parapet; seen only over the
// bridge, so they are plain shells with simple windows (no shop fronts).
function beyond(kit) {
  block(kit, {
    id: 'BEYOND_W', x0: -26, x1: -9, z0: -80, z1: -74, floors: [5.0, 3.4, 3.4, 3.4, 3.4, 3.4, 3.4], parapet: 0.9,
    mat: 'brick_dark', tint: '#b9aca2', trim: 'trim_stone', trimTint: '#9e968a', cornice: { kind: 'simple', mat: 'trim_concrete', tint: '#8c867c' },
    win: { w: 1.1, h: 1.6, states: WIN_STATES_POOR, ac: 0.12 },
    faces: [
      { side: 'E', from: 7.9, cols: [1.5, 4.5], room: 0.6 },
      { side: 'S', from: 7.9, cols: [2.0, 5.5, 9.0, 12.5, 15.5], room: 0.6, pipes: [16.6] },
    ],
  });
  block(kit, {
    id: 'BEYOND_E', x0: 9, x1: 26, z0: -80, z1: -74, floors: [5.0, 3.6, 3.6, 3.6, 3.6, 3.6, 3.6, 3.6], parapet: 1.1,
    mat: 'concrete_wall', tint: '#a59d8a', trim: 'trim_stone', trimTint: '#bdb4a0', cornice: { kind: 'stone', mat: 'trim_stone', tint: '#b2a994' },
    win: { w: 2.2, h: 1.8, sill: 0.8, mullions: [3, 1], ac: 0.05 },
    faces: [
      { side: 'W', from: 7.9, cols: [1.6, 4.4], room: 0.6 },
      { side: 'S', from: 7.9, cols: [2.4, 6.4, 10.4, 14.4], room: 0.6, pilasters: [0.3, 4.4, 8.4, 12.4, 16.6] },
    ],
  });
}

// ==================================================================================================== props
function props(kit, L) {
  // ---- street lamps LAMP_0..3 (cobra heads over the parking edge, never over the carriageway)
  for (const l of L.STREET_LAMPS.filter((s) => s.z < -26 && s.z > -80)) {
    kit.streetLight({ at: [l.x, l.z], rot: l.x < 0 ? 0 : PI, y: SW, h: l.h, arm: 2.0, on: l.state !== 'dead', intensity: 28, range: 15, color: '#ffb36b' });
  }
  // ---- vehicles: N_TAXI (wrecked cab, doors open) and N_CAR (burnt sedan)
  const P = (id) => L.PROPS.find((p) => p.id === id);
  const taxi = P('N_TAXI');
  kit.vehicle({ type: 'taxi', at: [taxi.x, taxi.z], rot: taxi.rot, state: 'wrecked', color: '#d9a82a' });
  kit.at({ x: taxi.x, y: 0, z: taxi.z, rot: taxi.rot }, () => {
    for (const [hx, hz, r] of [[1.0, -0.9, -1.0], [1.0, 0.9, 0.85]]) kit.at({ x: hx, y: 0.36, z: hz, rot: r }, () => {
      kit.bbox({ x: -0.53, y: 0, z: 0, w: 1.0, h: 0.6, d: 0.045, bevel: 0.012, mat: 'car_paint_worn', tint: '#d9a82a' });
      kit.box({ x: -0.5, y: 0.62, z: 0, w: 0.9, h: 0.04, d: 0.05, mat: 'car_plastic' });
      for (const xx of [-0.08, -0.95]) kit.box({ x: xx, y: 0.62, z: 0, w: 0.05, h: 0.38, d: 0.05, mat: 'car_plastic' });
    });
    textLine(kit, 'TAXI', { font: 'sans', h: 0.12, x: -0.5, y: 1.47, z: 0.36, align: 'center', mat: 'nz_ink' });
  });
  kit.debris([taxi.x - 1.4, taxi.z + 0.6], { r: 1.2, count: 6, kinds: ['paper', 'paper', 'chunk'] });
  const car = P('N_CAR');
  kit.vehicle({ type: 'sedan', at: [car.x, car.z], rot: car.rot, state: 'burnt', tilt: 0.02 });
  kit.decal({ at: [car.x, car.z], size: [6.2, 3.4], rot: -car.rot, mat: 'decal_stain', tint: '#3a3430' });
  kit.debris([car.x + 1.6, car.z - 1.0], { r: 1.4, count: 10, kinds: ['chunk', 'chunk', 'paper'] });
  // ---- red newspaper boxes (N_NEWS_1..3), phone booth, hydrant, trash cans, parking meters, bench
  for (const id of ['N_NEWS_1', 'N_NEWS_2', 'N_NEWS_3']) { const p = P(id); newsBox(kit, [p.x, p.z], p.x < 0 ? PI / 2 : -PI / 2, id === 'N_NEWS_2' ? 0.08 : 0); }
  const ph = P('N_PHONE');
  phoneBooth(kit, [ph.x, ph.z], -PI / 2);
  const hy = P('N_HYD');
  kit.prop('fire_hydrant', { at: [hy.x, hy.z], y: SW, rot: 0.6, tint: '#c8a8a0' });
  for (const [x, z, r] of [[-8.4, -29.4, 0.3], [8.45, -41.5, 1.2], [-8.4, -53.2, 2.0], [8.4, -59.3, 0.7]]) kit.prop('metal_trash_can', { at: [x, z], y: SW, rot: r });
  for (const [x, z] of [[-5.95, -42.0], [-5.95, -48.0], [-5.95, -56.5], [5.95, -32.5], [5.95, -38.5], [5.95, -47.0], [5.95, -52.0]]) parkingMeter(kit, [x, z], x < 0 ? PI / 2 : -PI / 2, kit.chance(0.25));
  kit.prop('painted_wooden_bench', { at: [8.35, -46.6], y: SW, rot: PI / 2 });
  kit.prop('utility_box_02', { at: [-8.55, -57.4], y: SW, rot: PI / 2 });
  // ---- trash heaps against the buildings, a lost suitcase, newspapers
  trashPile(kit, [-8.3, -40.8], SW, 4);
  trashPile(kit, [8.3, -50.9], SW, 3);
  trashPile(kit, [-8.4, -60.6], SW, 3);
  trashPile(kit, [8.3, -27.5], SW, 2);
  kit.at({ x: -3.6, y: 0, z: -35.4, rot: 0.8 }, () => {
    kit.bbox({ x: 0, y: 0, z: 0, w: 0.7, h: 0.22, d: 0.48, bevel: 0.04, mat: 'car_plastic', tint: '#4a3a2c' });
    kit.box({ x: 0, y: 0.22, z: 0, w: 0.2, h: 0.04, d: 0.04, mat: 'car_plastic' });
  });
  kit.debris([-1.8, -50.0], { r: 2.0, count: 10, kinds: ['paper', 'paper', 'paper', 'plank'] });
  kit.debris([3.2, -56.8], { r: 1.6, count: 7, kinds: ['paper', 'chunk'] });
  // ---- a few signs on poles (no stopping / one way), all on the sidewalks
  kit.roadSign({ at: [-6.0, -45.0], rot: 0.15, y: SW, shape: 'rect', size: 0.55, mat: 'sign_white', lean: 0.04 });
  kit.roadSign({ at: [6.0, -55.6], rot: -0.1, y: SW, shape: 'round', size: 0.6, mat: 'sign_red' });
  kit.roadSign({ at: [-6.05, -59.5], rot: 0.3, y: SW, shape: 'diamond', size: 0.75, lean: -0.08 });
}
/** Red coin-op newspaper box on a pedestal (front = local +z). */
function newsBox(kit, at, rot, tilt) {
  kit.at({ x: at[0], y: SW, z: at[1], rot, rz: tilt }, () => {
    kit.box({ x: 0, y: 0, z: 0, w: 0.3, h: 0.04, d: 0.3, mat: 'steel_dark' });
    kit.box({ x: 0, y: 0.04, z: 0, w: 0.07, h: 0.32, d: 0.07, mat: 'steel_dark' });
    kit.bbox({ x: 0, y: 0.36, z: 0, w: 0.5, h: 0.72, d: 0.44, bevel: 0.02, mat: 'paint_metal', tint: '#a8251d' });
    kit.face([[-0.19, 0.58, 0.222], [0.19, 0.58, 0.222], [0.19, 0.9, 0.222], [-0.19, 0.9, 0.222]], 'glass_dirty');
    kit.face([[-0.17, 0.6, 0.218], [0.17, 0.6, 0.218], [0.17, 0.86, 0.218], [-0.17, 0.86, 0.218]], 'sign_white', { tint: '#d6d0c0' });
    textLine(kit, 'DAILY', { font: 'serif', h: 0.035, x: 0, y: 0.8, z: 0.219, align: 'center', mat: 'nz_ink' });
    kit.box({ x: 0, y: 0.5, z: 0.23, w: 0.26, h: 0.04, d: 0.03, mat: 'steel', tint: '#a0a29e' });
    kit.box({ x: 0.16, y: 0.96, z: 0.18, w: 0.1, h: 0.08, d: 0.08, mat: 'steel', tint: '#8f918d' });
    kit.colBox({ x: 0, y: 0, z: 0, w: 0.5, h: 1.08, d: 0.44 }, 'metal');
  });
}
/** Phone booth (N_PHONE): steel frame, glass on three sides, PHONE header, handset unit (open side = local +z). */
function phoneBooth(kit, at, rot) {
  kit.at({ x: at[0], y: SW, z: at[1], rot }, () => {
    const w = 0.9, h = 2.3, t = '#9b9d98';
    for (const [x, z] of [[-w / 2, -w / 2], [w / 2, -w / 2], [-w / 2, w / 2], [w / 2, w / 2]]) kit.box({ x: x * 0.96, y: 0, z: z * 0.96, w: 0.06, h, d: 0.06, mat: 'steel', tint: t });
    kit.box({ x: 0, y: h, z: 0, w: w + 0.04, h: 0.08, d: w + 0.04, mat: 'steel', tint: '#7d7f7a' });
    kit.box({ x: 0, y: 0, z: 0, w, h: 0.05, d: w, mat: 'steel_dark' });
    for (const s of [-1, 1]) {
      kit.at({ x: s * (w / 2 - 0.02), y: 0, z: 0, rot: s * PI / 2 }, () => kit.face([[-w / 2 + 0.05, 0.25, 0], [w / 2 - 0.05, 0.25, 0], [w / 2 - 0.05, h - 0.35, 0], [-w / 2 + 0.05, h - 0.35, 0]], 'glass_dirty'));
    }
    kit.box({ x: 0, y: 0.1, z: -w / 2 + 0.03, w: w - 0.1, h: h - 0.2, d: 0.03, mat: 'paint_metal', tint: '#7d837a' });
    kit.bbox({ x: 0, y: 1.05, z: -w / 2 + 0.13, w: 0.24, h: 0.42, d: 0.16, bevel: 0.02, mat: 'steel', tint: '#a6a8a3' });
    kit.box({ x: 0.06, y: 1.32, z: -w / 2 + 0.24, w: 0.06, h: 0.2, d: 0.05, mat: 'car_plastic', rz: 0.6 });
    for (const s of [-1, 1]) kit.at({ x: 0, y: 0, z: 0, rot: s > 0 ? 0 : PI }, () => {
      const zf = board(kit, -w / 2, w / 2, h - 0.3, 0.24, { mat: 'sign_blue', tint: '#4e6a96', d: 0.02, z: w / 2 - 0.01 });
      textLine(kit, 'PHONE', { font: 'sans', h: 0.1, x: 0, y: h - 0.23, z: zf, align: 'center', mat: 'nz_ink_white' });
    });
    kit.colBox({ x: 0, y: 0, z: 0, w: w, h, d: w }, 'glass');
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

// ==================================================================================================== glyph data
// Outlines traced from text rendered in headless Edge with the Windows system faces Rockwell Bold (slab), Georgia Bold
// (serif), Arial Black (sans), Bahnschrift Bold (hwy), Microsoft JhengHei Bold (cjk) at 120 px (CJK 84 px), simplified to
// ~1 px. Swap this table for an original / CC0 face if the font licences are a concern. Format: see glyph().
const GLYPHS = {
  slab: { c: 82, g: {
    "0": '66.2|I3KkIrKiIlKeIYKRISKFIKJhIMIzIWIXIlIGI5H-JNH-JfIGJyIdJ6I9J6JnJwKLJdKgJNKmI5Km/JDKMJHKMJQKBJWJfJSIpJOIfJHIYI_IYI2IfIwI1IyJ5I2KFI7KK',
    "1": '66.2|IaKhIaKLIyKJIyIbIcIZIcIBJpIAJqIZJWIbJWKjIbKk',
    "2": '66.2|I1KkIlKgIYKVIQKFIOJtIXJqIrJqIuJ_I5KMJFKMJOKDJQJ9JOJxJKJpIcI7IUIvIMIXIMIBJzIAJ1IwJdIwJbIaIsIbI2IxJjJUJuJhJ0JvJyKJJuKRJhKeJNKmI3Km',
    "3": '66.2|IzKkItKkIhKeIUKRIQKJIOJ5IrJ2IwKHI3KMJDKMJMKFJQJ7JOJxJHJoI0JjI0JLJDJKJOJDJUI1JSInJLIcJDIYI3IYIsIhInI0IJIyIIIvIMIdIZIKIrIAJNH-JlIIJyIVJ2IdJ4IlJ2I_JpJQJaJXJhJaJuJnJyJxJyKHJuKRJhKeJVKkJLKmI1Km',
    "4": '66.2|JKKjIKJLIGJFIGI_IPIuJKItJKIbI4IZI5IAJ3IAJ4IZJqIbJqItJ6IvJ6JDJqJFJqKlJLKm/JKJ5JKJFIjJEIiJHJGJ5',
    "5": '66.2|IUKhIQJRIpJEI1JQJFJSJOJLJSJDJUIvJOIfJDIYIzIaIsIhInIwIJIsIMIdIWINIlICIzH-JVIAJnIKJ0IdJ4IrJ2JJJuJZJdJoJRJsI9JsIrJiIsKJJVKKJYKHJZJ-JvJ-JwKjIVKk',
    "6": '66.2|I9KkIxKiInKcIcKRIUKDIOJtIOI1ISIjIaITInIGI9H-JRH-JfICJyITJ6IrJ4JJJyJVJlJiJdJmJFJoIxJeIyJzI4KDJDKMJRKKJYKDJdJ4J3J6J4J9JyKRJhKiJVKmI_Km/JBJOJJJOJRJKJYI_JYInJUIfJLIYJBIYI4IfIwI3IwJHI3JM',
    "7": '66.2|IQKhIRJ0IpJ0IrKKJUKJJKJ7I6JZIuIzIsIbIWIZIWIBJlIAJmIZJRIaJQIlJcJbJmJ1J2KPJ2KjIRKk',
    "8": '66.2|I1KkIhKeIUKRIQKJIOKBIQJtIUJlImJVIbJQIOJDIKI5IKIhISIRIhIEI1H-JPH-JfICJtIKJ6IdJ8InJ6I9JtJOJgJVJwJjJ2JvJ2KHJyKRJlKeJdKiJPKmI3Km/JBKMJNKKJWJ9JWJvJSJnJJJgI5JiIwJtIyKDI5KK/JBJKJNJIJWI_JaIzJUIfJJIYI9IYI1IcIsIrIsI3IwJBI1JG',
    "9": '66.2|IzKkIjKgIQKLIKJ1IMJdIUJNInI-I_I8JTJEJSItJMIhJBIYIzIaIuIfIpIsIPIqIOIhIUIRIlICIxH-JHH-JfIIJoIRJyIjJ4JBJ4JlJyKDJjKaJXKiJJKmI1Km/I9KMJDKMJMKFJUJzJWJfJHJWI7JWIzJaIsJnIuKBI1KK',
    "A": '83.8|IeKhIeKJI0KHIWIhITIcIAIbIAIBJHIAJIIbIyIdI6I3JlI4JsIdJYIbJZIAKnIAKoIbKUIdJyKHKIKJKIKjIfKk/JSJ9JeJRJDJQJMJ1JRKA',
    "B": '83.8|IIKhIIKJIcKHIcIdIIIbIIIBJnIAJ9IEKLIMKWIZKcItKYJDKNJQKAJXKQJlKUJtKUKFKQKPKBKeJrKkIJKk/JLKIJdKIJqJ_JqJvJjJmJGJlJGKH/JLJIJlJGJuI9JwIrJpIgJfIcJGIdJGJH',
    "C": '93.7|JTKkJDKiI1KcIpKUIYKBIQJxIMJfIOI5IaIfIlISI3IGJVH-JzH-KFICKbIOKmIZKyItK0I3KVJGKMIvJ_IiJxIcJXIeJNIkI-I3I6JDI8JnJGJ5JNKAJfKIJzKIKBKCKOJ1KTJqKtJqKuKjKTKkKSKZKPKYJ_KiJvKmJVKm',
    "D": '96.2|IGKhIGKJIeKHIeIdIGIbIHIAJxIAKTIMKiIZKuItK0JBK0JjKoKBKXKUKBKgJrKkIHKk/JNKIJhKIJzKCKAJ1KGJnKIJDKEI1J3IkJrIeJIIdJIKH',
    "E": '80|IIKhIIKJIcKHIcIdIIIbIIIBKXIAKXIyJ5IyJ3IcJGIdJGJFJuJHJtJiJGJjJGKHJ3KIJ5JyKXJyKYKjIJKk',
    "F": '77.5|IGKhIGKJIeKHIeIdIGIbIGIBJhIAJiIbJIIdJIJFJrJGJsJhJIJjJIKHJ5KIJ7JyKXJyKYKjIHKk',
    "G": '101.3|JTKkI_KgIvKYIaKDIQJvIMJbIMJJIQI1IWInIiIXIvIMI_IEJXH-J3H-KJICKhIOK0IhK8IxLAJRJ1JSJ0I3KQI1KKIpJ_IgJzIcJhIcJRIiJCIxI6JHI6JhJEJ3JNKAJfKIJxKIKFKAKQJ1KXJoKxJoKyKjKXKkKWKZKTKYKHKgJxKmJVKm',
    "H": '91.2|IIKhIIKJIcKHIcIdIIIbIJIAJWIBJWIbJEIdJFJIJyJHJyIdJiIbJjIAKuIBKuIbKaIdKaKHKuKJKtKkJiKjJiKJJyKHJxJkJEJlJEKHJWKJJVKkIJKk',
    "I": '51.2|IGKhIGKJIeKHIeIdIGIbIGIBJhIAJiIbJIIdJIKHJiKJJiKjIHKk',
    "J": '48.7|IEKhIEKJIcKHIcH3IRHsH-HtH-HRILHOIhHOI1HWJCHlJGHxJIH_JIKHJeKJJeKjIFKk',
    "K": '93.7|IGKhIGKJIaKHIaIdIGIbIHIAJYIBJYIbJGIdJHJWJ4IdJmIbJnIAK8IBK8IbKrIcJ2JbKjKIK4KJK3KkJpKkJoKJJ6KHJHJYJGKHJaKJJaKjIHKk',
    "L": '77.5|IGKhIGKJIeKHIeIdIGIbIGIBKXIAKXJOJ4JNJ3IcJIIdJIKHJgKJJgKjIHKk',
    "M": '125|IGKhIGKJIcKHIcIdIGIbIHIAJMIBJMIbI2IdI3KII8KFJtIAKAIBKxKIK2KHK2IdKiIbKiIBL0IBL0IbLeIdLeKHL0KJLzKkKhKkJ9JGJ6JHJeKXJXKkIHKk',
    "N": '95|IGKhIGKJIcKHIcIdIGIbIGIBJOIBJOIbI6IdI7J2J8IDKBH-KjH-KkKHK6KJK6KjJyKjJyKJKIKHKHJAKEJBJ4JVJLKkIHKk',
    "O": '102.5|JVKkJFKiIzKaIcKFIUJ5IMJfIOI7IcIfIzIKJLIAJXH-KBIAKdIMK0IjLAJBK-JrK0KBKdKYKBKkJ1KmJXKm/JhKIJvKIKBKAKMJzKUJbKUJJKMIxKDImJvIcJdIcJPIiJCIvI6JDI6JhJCJ1JPKC',
    "P": '80|IIKhIIKJIcKHIcIdIIIbIIIBJbIAJcIbJGIdJGI7J1I-KFJEKOJLKaJfKcJpKcJ5KUKNKHKaJrKkIJKk/JLKIJdKIJqKBJwJvJsJjJlJcJbJYJGJZJGKH',
    "Q": '102.5|JVKkJLKkIvKYIcKFISJ1IMJfIOI9IaIjItIQJKIDI5H8IyH1I7HkJHHsJZHuKBHcKVHYKcHhKiHzKNH0JyH_KDICKXIKKwIfK8IzLAJBLAJlK0KBKjKUKXKcKJKiJ1KmJXKm/JhKIJvKIKBKAKKJ3KUJbKSJBKKIvJ7IiJvIeJdIeJPIkJCIxI6JFI6JhJCJ1JPKC',
    "R": '87.5|IGKhIGKJIcKHIcIdIGIbIHIAJaIBJaIbJGIdJHJGJaJFJ_IAKwIBKwIbKbIcKAJLKWJdKcJrKcJ_KYKLKJKcJ1KkIHKk/JLKIJnKGJwJ7JuJrJfJiJHJiJGKH',
    "S": '63.7|IrKkIbKeIOKPIKKDIKJvIQJhIdJUJJI8JSIxJSInJJIcI7IaI1IcIqInIoI1IlI4INI4IMIBIlIAImILIpIMIxIEI_H-JZIAJlIGJwIRJ2IdJ4IzJ0JDJwJLJjJYIzJwIsJ5IsJ_I3KKJDKKJQJ_JVJyJvJyJwKjJVKkJTKYJLKgI9Km',
    "T": '81.2|IIKhIJJiIjJiIkKHI8KHI8IdIkIbIkIBJ9IAJ-IbJmIdJmKHJ_KIKAJjKbJiKcKjIJKk',
    "U": '81.2|IEKhIEKJIYKHIYInIaIdIiIPI1ICJFH-JpIAJ9IKKGIVKKIfKKKHKeKJKeKjJeKjJeKJJuKHJuIvJsInJfIcJRIcJJIgJCItJCKHJSKJJSKjIFKk',
    "V": '83.8|IAKhIAKJIUKHJCIDJFIAJlIAKSKDKVKIKoKJKoKjJgKjJgKJJzKIJ0KDJZI4I-KFI_KIJSKJJSKjIBKk',
    "W": '118.8|IAKhIAKJISKHI0IfJBIAJgIBJgIHJ3JIKQIBKvIALaKDLdKILuKJLtKkKsKjKsKJK7KIK8KDKjI8KIKHKYKJKYKjJfKkJeKJJsKHJTI8I4KHJKKJJKKjIBKk',
    "X": '88.8|ICKhICKJIXKII-JXI-JRIXIcIAIbIBIAJLIAJMIbI9IcI8IfJTI8JqIdJcIbJdIAKyIBKyIbKbIcJwJTKXKIKuKJKtKkJlKkJkKJJyKHJfJsJaJvJIKHJWKJJVKkIDKk',
    "Y": '83.8|IAKhIAKJITKIIWKFJAJHJAIdIoIbIoIBJ_IAKAIbJqIdJqJJKQKDKVKIKoKJKoKjJhKkJgKJJvKIJwKFJZJgJCKFJDKIJQKJJPKkIBKk',
    "Z": '77.5|IQKhIRJqIsJrItKIJXKIJYKFIMIdIMIBKPIAKPI8J0I7JzIcJAIdKMKHKOKjIRKk',
    "&": '96.2|JJKkJDKkI3KeIqKNIqJ3I2JlIdJWIOJFIKI9IKIjIOIZIhIGI3H-JXIAJrIIJ3ISKHIAK1IAK2IZKdIaKQIpKQItKeI_KjJKK2JLK2JjKRJkKGJPJ7JCJmJfJzJoKAJ5J-KTJzKeJnKkJfKmJLKm/JXKQJfKOJkKJJkKBJdJ4JVJ0JOJ7JKKJJPKO/JIJPJmIpJbIgJRIcJDIcI5IgIuIvIwI_I9JM',
    ".": '42.5|IYIjIZIAI-IBI9ImIZIm',
    "·": '40|IhJkIYJZIYJRIjJEItJEI2JNI4JZItJm',
    "-": '41.3|IIJFIJIoJKIpJJJIIJJI',
    "!": '42.5|IYKhIYJxIgJLIgI_IjI4IxI4I0I7I8JxI8KjIZKk;IYIjIZIAI-IBI9ImIZIm',
    "'": '33.7|IbKkISKdIQKPIeJZIjJYImJbIyKJIyKbInKm',
    "↑": '60|I4KZIuKJISJtISJlIjJsI2J5I2HPJBHOJCJ5JjJkJmJlJmJtJIKLI_KcI5Kc',
  } },
  serif: { c: 83, g: {
    "0": '84.1|JFKAI3J-InJ2IUJhIMJJIMI1IQIlIYIXInIII3IAJHH8JhH8J3ICKBIIKSIZKYIlKcIzKcJLKYJZKSJlKBJ2JxJ-JhKCJHKC/JTJ4JfJ2JoJtJwJTJuIhJoIRJZIGJPIGJCIPI6IhI4ItI4JRI-JpJHJ0',
    "1": '58.8|I-J_ItJyIOJtIPJkIsJjIsIVIlIMIRIKIOIHIPIAJuIBJuIHJrIKJhIKJXIOJSIZJUKBI_KC',
    "2": '75.2|I5KAIrJ-IZJ0ISJtIOJjIOJbISJTIbJMItJOI2JXI2JpIyJ1I5J4JFJ4JPJ0JYJnJaJdJYJPJNJAIpIsIOIXIOIBKLIAKLIgIqIhI5IqJbIyJ3I-KCJJKGJXKEJnKAJvJzJ6JXKCI7KC',
    "3": '74.9|I5KAIxKAIdJ4IOJnIMJfIOJVITJOIbJKIrJMI0JVIxJ2JFJ4JLJ2JUJtJYJhJYJRJUJDJJI4IzI2IyInJLImJYIdJeIJJcH3JWHrJPHkI_HeIxHeIqHhIuHtIuH_IhIKITIKIIIBIGHxIKHpIdHaIxHUJPHUJvHeKEHxKIH5KKINKCIfJvIsJaIxJtI4J-JHKCJRKCJjJ8JvJ1J2JhKAJXKCI7KC',
    "4": '77.9|JZKAIIIbIGIDJTICJUHXJ5HWJ6IBKTICKUIZJ9IaJ6IdJ6KBJbKC/JUJjJUIdJRIaIZIaIaIfJQJj',
    "5": '71.9|IeJ7ISInIbIkIjIsIvIyJJIwJSIpJYIfJaH_JQHpI9HeIxHeIqHhIwH5IsIDIhIKIVIKIKIDIGH5IIHtIZHcIxHUJNHUJdHYJtHgJ-HxKGIHKEIfJ-IrJzI2JfJAI9JCIjI4IkJXInJeJ_JeKAJ9IfJ-',
    "6": '77.8|JvKoJXKkIxKQIgJ_ISJnIMJPIOIrIcIRIvICJDH8JbH8JrIAJ_IMKGITKQIlKSIvKQJHKIJXJ9JiJrJqJXJqJNJoI4JdI8JvJGKDJXKUJnKcJ6KhJ3Kq/JJJaJZJYJgJRJmJBJkIbJgIRJTIGJLIGJAIPI6IdI2IzI2JNI9JW',
    "7": '66.5|IKJ7ILJEIUJFIaJZIjJeJuJdIgHXIhHUIxHUKCJnKGJvKGJ9ILJ-',
    "8": '81.2|JFKoI9KoIpKgIaKTIUKJISJ7IYJnIjJaIxJSIyJPIbJGISI9IMIvIMIhIUIRIpICI_H8JpH-KDIKKOIVKWIlKWI3KQJFKDJSJsJdJ7JiKMJxKQKHKIKXJxKmJhKqJHKq/JRKgJfKcJoKNJoJvJjJiJFJwI6J_I8KTJHKe/I_JKJfI8JqIzJuIrJuIZJjIKJNIGJFIII6IRI0IfI0I5I8JL',
    "9": '77.8|I_KAI3KAIlJ4IQJjIKJTIKI9IOIvIfIaIxISJHISJVIWJjIgJkIdJeIJJSH1JFHqI1HiIlHgIiHdIlHUJJHcJtHwKEILKOIlKQI1KOJRKIJhJ-JvJzJ4JhKAJZKCJBKC/JNJ4JVJ2JaJxJkJXJkJDJmJBJkItJXIiJDIkI8IrI2I5I4JlI_Jy',
    "A": '91|JQKnIWIZIJIMH7IKH6IBI9IAI-IHI7IKIrIMIkITIwI3JpI4JuIxJ6IPJtIKJjIKJjIAK7IAK8IJKrIOKgIdJqKnJnKqJRKq/JOJ9JkJFI3JEI4JNJNKA',
    "B": '90.9|IIKjIJKcIXKaIgKTIgIRIVIKIJIKIJIAJ1IAKVIIKiIRKsIlKsI1KoI_KXJQJ4JZJ5JcKJJgKXJoKiJ3KgKRKTKeJ1KmIJKm/JVKcJpKYJ0KLJ2J7JyJtJnJiJbJeJLJeJKKZ/JPJSJpJQJxJMJ8I9J-I1J8IfJ4IXJpIMJbIKJPIOJKITJKJR',
    "C": '85.8|JTKoJDKmI1KgIaKJIMJvIIJbIIJHIKI7IUIjIpIMJHH-JtH8J9IAKNIIKYIRKoIpKfIwKYIlKHIUJzIMJhIMJLIWI-IpI4I9I2JZI8J_JEKPJPKaJZKeJvKeJ5KaKEKRKUJ1KWJrKhJqKgKlKXKmKNKgKBKmJvKqJVKq',
    "D": '100.1|IIKjIJKcIZKaIgKTIgIRIXIKIJIKIJIAJ5ICKdIQKwIhK-I9LAJdK4J5KjKSKJKgJvKmIJKm/JXKcJvKYJ3KUKEKHKOJxKSJXKOIvKGIdJ5IQJlIKJVIMJKIXJKKZ',
    "E": '86.5|IIKjIJKcIXKaIgKTIgIRIVIKIJIKIIIBKjIAKnI0KeIzKQIZKJIQKBIMJxIKJTIMJMIRJKIXJLJSJfJSJtJOJ2JBJ4I3J7I0KCI1KCJ5J6J5JyJlJtJgJjJcJLJcJKKbJ5KaKOKHKTJ8KbJ8KcKlIJKm',
    "F": '80.6|IIKjIJKcIXKaIgKTIgIRIVIKIJIKIIIBJhIAJiIHJfIKJRIMJKITJKJPJfJQJrJMJ0JDJ4IzKBIyKCJ3J4J3J2JrJtJeJjJaJLJaJKKbJ7KaKMKLKVJ6KdJ6KeKlIJKm',
    "G": '96.9|JTKoJDKmIxKeIUKBIMJvIIJbIIJHIQIpIeIVIrIKI7ICJRH8J7H-KTIEKrIOKsI5KxJAK_JCLCJFLBJMJtJMJtJCJ7JAKEI3KEITJ3IKJvIIJXIKJPIOJCIdI4I7I4JtJAKHJRKaJbKeJzKeJ_KYKOKHKYJzKaJpKmJpKjKmKZKmKTKgKPKgJzKqJVKq',
    "H": '109.6|IIKjIJKcIXKaIgKTIgIRIXIKIJIKIJIAJiIBJhIKJRIMJKITJLJQKSJPKSIVKHIKJ7IKJ7IALSIBLRIKLBIMK6IVK6KRLBKaLRKcLRKmJ6KlJ7KcKLKYKSKPKRJcJKJdJKKTJRKaJhKcJhKmIJKm',
    "I": '53.5|IIKjIJKcIXKaIgKTIgIRIXIKIJIKIIIBJjIAJkIHJhIKJRIMJKIVJKKTJRKaJhKcJkKfJkKlIJKm',
    "J": '71.4|IwKjIxKcI_KaJIKTJIIjJGIbI5IKIjIIIeINIuIfIwIpIuIxIlI6IfI8ITI8IGIzICIpICIbIKILIVICInH8I_H8JTICJdIIJuIdJyIrJyKVJ3KaKHKcKIKlIxKm',
    "K": '98|IIKjIJKcIXKaIgKTIgIRIXIKIJIKIJIAJgIBJfIKJRIMJKITJLJMJRJMJUJJKLIALMIBLMIHLJIKLBIKK5IOKqIbJwJjKhKUKtKaK_KcK_KmJ5KmJ4KfJ7KcKFKcKKKZKIKRJ4J9JPJWJKJXJKKTJRKaJhKcJiKlIJKm',
    "L": '82.3|IIKjIJKcIXKaIgKTIgIRIVIKIJIKIIIBKhIAKjI2KdI2KaIzKQIdKDIOJfIKJTIMJMIRJKIXJKKTJRKaJhKcJkKfJkKlIJKm',
    "M": '122.8|IGKjIHKcIVKaIgKNIgIbIeIVIVIMIFIKIFIAJMIBJLIKI9IMIyIVIuIjIvKUJlICJzICJ2IHKrKSKsITKlIMKVIKKSIHKSIBLsIBLsIJLZIOLUIZLUKNLWKVLbKaLsKdLrKmKjKmKcKLJ7I6JRKmIHKm',
    "N": '100.7|IEKjIFKcIPKaIZKUIgKJIgIbIeIVIVIMIFIKIFIAJMIBJLIKI5IOIwIZIuIjIvJ-KOIJKXIAKqIBKqKBKwKVK9KcLFKcLFKmKAKlKAKdKVKWKcKJKeJ5KdI4KYI7JBKmIFKm',
    "O": '98.4|JTKoJDKmIrKaISJ9IMJvIIJbIIJHIMI1IeIXIrIMI9ICJVH8JxH8KDIAKdIOKwIjK8JFK6JtKwKDKXKcKHKkJxKqJVKq/JbKeJtKeJ-KTKIKBKOJjKOJDKIIlJ-ITJtIIJXIIJPIMJEIXI4I5I4JtI-KDJEKPJPKa',
    "P": '84.1|IIKjIJKcIXKaIgKTIgIRIVIKIJIKIIIBJhIAJhIKJRIMJKITJKJHJ5JKKVJYKeJjKkJzKkKFKeKTKNKgJ1KmIJKm/JPKcJjKaJrKWJwKRJ2KDJ2JrJyJhJpJYJbJSJKJTJKKb',
    "Q": '98.4|JTKoJDKmI1KgIpKYISJ9IMJvIIJbIIJHIOIvIcIZItIKJBIAJXH8JeHlJtHWJ9HQKVHQKxHWK2HZK1HiKbHgKTHkKIHxKEIBKdIOKqIbK2IvK8JDK8JjK4JzKqKLKXKcJ7KoJvKqJVKq/JbKeJtKeJ-KTKIKBKOJjKOJDKIIlKAIVJ3IMJlIGJRIKJEIXI8InI4I5I4JtI-KDJEKPJPKa',
    "R": '95.7|IIKjIJKcIXKaIgKTIgIRIVIKIJIKIJIAJgIBJfIKJRIMJKITJLJMJPJMJoIvKHIALGIBLGIJK3IMKkIfJ-JPJ_JUKJJWKZJgKkJxKkKLKZKaKPKgJ3KmIJKm/JPKcJjKaJrKWJ0KNJ4KBJ4J1JyJjJrJcJdJWJKJXJKKb',
    "S": '77.9|I9KoIvKmIdKcIWKVIMKBIOJnIYJXIjJOI1JGJTI-JlI0JsIpJsIdJmIRJbIKJBIIIrIUIaIpISI7IJI8IIIJILIAITIAIdIII_H8JnH-J_IKKKIVKSIlKQJDKMJLJ_JYJvJgI_JwIyJ_IyKNI_KcJZKeJjKaJyKLJ-JxKBJuKJJuKIKlJ_KmJ5KgJ1KgJXKqI_Kq',
    "T": '82.1|ICKjIDJ2IJJ2IMJ5IUKLIfKYIzKcI7KcI-KZI-IVIzIKIlIKIkIBJ_IAJ_IKJrIOJmIXJmKZJpKcJzKcKFKYKQKLKYJ5KbJ2KhJ2KiKlIDKm',
    "U": '100|IGKjIJKcIVKaIeKPIeIpImIXI1IIJFIAJXH8J1H8KRIGKiIXKqIpKsKNKwKVK3KaLHKcLIKlKAKlKAKdKVKWKcKJKeI3KWIdKLISJ7IMJnIMJXISJOIbJIIpJGKPJNKaJdKcJeKlIHKm',
    "V": '91.5|H4KjH7KcIJKYIUKNJMH_JPH8JlH8KkKRKvKaK5KcK8KfK8KlJ4KlJ4KfJ7KcKFKcKPKYKSKVKSKPJ4JHJpImI8KVJFKcJPKcJSKfJSKlH5Km',
    "W": '135.2|H8KjH8KdILKYIYKHJHH8JeH9KFJ4KwH9LJH8L4KJMDKYMSKdMRKmLQKlLRKcLdKcLnKYLqKVLqKLLQIzLLIqKfKmKGKlJhIuI-KVJDKaJRKcJUKfJUKlH9Km',
    "X": '97|ICKjIDKcINKcIZKWIkKLJOJPJIJFIXIQILIKICIJIDIAJBIAJCIHI_IKIxIMIwIVJTJCJaI9J0ITJ0IPJtIKJfIKJfIALCIBLBIKKxIMKgIbJyJdKlKWKxKcK5KcK8KfK7KmJ7KmJ6KfJ9KcKLKaKOKVKAJ_JrJoJQKTJQKXJXKcJlKcJlKmIDKm',
    "Y": '87.8|H6KjH7KcIDKcILKYIYKLJEI_JEIVI5IKIrIKIqIBKFIAKFIKJ1IMJuITJsIZJuJFKcKNKnKYK1KcK4KfK4KlJ6KlJ6KdKLKaKOKXKOKRJpJUJgJdJCKVJCKZJHKcJXKcJXKmH7Km',
    "Z": '82.7|IQKjIMKHINJ0ITJ0ImKRIzKaJrKcJsKZIEILICIBKdIAKgILKjI4KaI3KGITJ7IMI3IKI2INKgKdKgKlIRKm',
    "&": '95.9|JDKoI9KoIxKiIiKTIgJ3IkJtIyJbIfJQIMI7IIIvIIIfIMITIVIIIhIAIvH8JNH-JfIGJrIQJvIQJ9IAK_IAK_IKKzIKKjIQKIIrKgJTKrJcK7JeK8JnJ9JoJ9JeKJJcKQJXKMJFKEI3J_I0JaJhJjJmJyJ1J4KDJ2KXJvKgJhKoJZKqJFKq/JRKeJfKcJmKRJkJ7JXJqJQJvJEKFJGKZ/I5JQJmIbJhIUJVIQJDISI9IUIwIhIsIrIsI9I0JPI3JS',
    ".": '39.4|IfIoISIdIQIPIWIDIdH-ItH8I1IAI-ILI-IZI6IhItIq',
    "·": '40.5|IhJWIbJUISJJISI5IbIuIjIqIvIqI-I3JAJFI-JLIzJWIvJY',
    "-": '45.5|IKJJILIyJQIzJPJMILJM',
    "!": '45.2|IlKoIaKhIWKZIWKPIgJpIoI3IxI2JEKNJEKZJAKhIzKq;IlImIYIbIWIPIcIDIjH-IzH8JAIFJEINJEIXJAIfIzIo',
    "'": '32.3|IZKyITKwIOKpIOKXIYJ5IcJjIjJiIwKNI0KlIyKrInK0',
    "↑": '60|I4KZIuKJISJtISJlIjJsI2J5I2HPJBHOJCJ5JjJkJmJlJmJtJIKLI_KcI5Kc',
  } },
  sans: { c: 86, g: {
    "0": '80|JBKsI5KsIpKmIYKXISKNIKJrIMI1ISIhIYIXItIEJBH-JpIAJ7IIKOIfKWJBKUJ3KKKTJ3KmJfKuJDKu/JPKOJZKMJkJ9JoJZJkIvJgInJVIeJHIgJAInI6I5I6J1JCKJ',
    "1": '80|JOKrI3KQIUJ_IUJbInJgJFJyJGIBJ1IAJ2KtJPKu',
    "2": '80|I9KsIzKsIhKkIQKRIKJ5IVJ2I5J0I8KBJFKMJXKOJkKBJkJzJXJiI3JKIeIzIKITIGIBKVIAKVImJMInJXIyJ3JIKQJlKUJxKUKHKOKVKFKgJtKsJhKuI_Ku',
    "3": '80|I9KsIpKoIdKgISKTIMKHIMKBI3J6I8KHJHKOJTKOJbKKJeKFJeJ5JVJwJCJtJAJNJXJOJfJKJmI_JmItJXIeJJIeJBIiI3I0INIwIKIpIWITIdIMIvICJBH-JrIAJ9IIKIIRKWItKWJDKSJNKJJYJ2JhJ_JmKMJ3KOJ_KMKRJ_KiJxKqJfKuI_Ku',
    "4": '80|JbKsIGJHIGIfJbIeJdIAKFIAKGIdKcIfKcJDKGJFKGKtJdKu/JcJ3JcJFIvJEIyJLJWJ1JbJ6',
    "5": '80|IdKqIOJPInJKI3JKJHJUJbJSJmJFJmIvJkIpJbIgJJIeI-IlI3I0IJIwIIItIQIbIfIKI1IAJfH-J7IIKOIbKWIvKWJLKOJdKBJqJxJyJTJ0I_JsI-JzJDKGKNKGKOKrIfKs',
    "6": '80|JFKsI3KqIlKgIaKVISKHIKJlIMI3IWIdIpIII1ICJHH-JtIAKFIMKUIhKYIvKYJBKUJPKQJXJ_JoJrJwJXJwJFJoI7JgI-J7JEKHJPKOJdKMJlJ8KNKAKTKCKUKFKIKbJzKqJjKuJHKu/JRJQJfJOJqJBJqItJmIlJbIeJJIgJCIlI8IxI8I_JAJHJFJM',
    "7": '80|IKKpILKGJeKFJKJpI4JHIoIJIpIAJVIAJYIDJcIpJoJNKAJ3KWKNKWKrILKs',
    "8": '80|I9KsI1KsIjKkISKRIQKLISJvIfJgImJdIdJYIQJLIMJDIKI9IMIhISIVIdIKIrICI_H-JhH-J5IEKMITKWIpKWI9KQJLKDJYJ8JbKOJxKQJ3KOKRJ9KkJ1KoJdKuI_Ku/JNKOJbKMJkJ9JiJzJXJqJJJqI8J3I-KFJFKM/JNJOJVJOJdJKJmI9JmIvJiInJVIeJLIeJDIiI6ItI8JDJFJM',
    "9": '80|I7KsInKoIbKgIQKTIIJ7IKJjIQJVIhJEI1I8JPI-JbJEJlJOJmJHJgIrJTIeJDIgI7IwIVIsINIqIMInIYIRItICI9H-JjIAJ7IMKGIXKOIlKWJHKUJ1KKKPJ3KkJrKqJZKuI9Ku/JJKOJTKOJdKIJkJ7JkJtJgJlJTJcJBJeI4JnI2JtI4KDJBKM',
    "A": '93.3|JAKpIAIBI1IAI4IDI_IcJ7IcKCIDKFIAK5IAK4ILJ8KrJBKs/JeJ7JwJDJLJCJdJ-',
    "B": '93.3|ISKpISIBJ5IAKRIEKdIKKoIVKwIlKuJFKfJWKOJdKbJkKiJrKoJ3KoKNKiKZKXKkKBKsITKs/JNKKJtKIJ0KBJ0JzJnJqJJJqJIKJ/JNJKJzJIJ8I9J6IxJtIoJJIoJIJJ',
    "C": '93.3|JRKsJHKsIvKiIcKRIUKFIMJpIOI5IaIfIvIKJHIAJTH-J_IAKVIKKmIbKuIpKyI5KFJIJ-I1JxIoJrImJTIoJIIxJCI_JAJJJCJtJIJ5JRKCJbKGJrKGJ1KCJ-J5KDJuKpJ2KvJ4KwJ9KkKTKXKgKJKoJxKuJTKu',
    "D": '93.3|ISKpISIBJtIAKHIGKXIQKkIfKsIvKwJBKuJzKqKBKeKVKPKiKDKoJxKsITKs/JNKEJnKCJvJ-J4JxJ8JhJ6I9J0IxJrIqJIIpJIKD',
    "E": '86.7|ISKpISIBKhIAKhIoJGIpJHJIKaJJKZJsJHJsJGKDKfKEKgKrITKs',
    "F": '80|ISKpISIBJFIAJGJDKKJFKJJmJHJmJGKDKTKEKUKrITKs',
    "G": '100|JTKsJJKsIxKiIWKHIMJrIMJBISItInIQJBICJVH-J3H-KXIGK6IbK6JhJpJiJoI_KLI-KMIxKBIqJzImJfImJNIuJEI7JAJJJCJtJNJ-JdKGJ1KEJ_J-KFJ0KJJ0K3J8K0KJKlKeKRKqJ9KuJVKu',
    "H": '100|ISKpISIBJGIBJHJGKBJGKCIBK1IAK2KrKCKrKBJwJHJwJGKrITKs',
    "I": '46.7|IUKpIUIBJHIAJIKrIVKs',
    "J": '80|JaKpJaI9JWItJNImI_IoI4IxI1JCIEI7IIIjIQIVIdIIIvIAJZH-JpICJ3IKKEIXKKIjKOI3KOKrJbKs',
    "K": '100|ISKpITIAJFIAJGIpJhJGJkJFKHIALIIBKGJrLDKsJ_KsJHJsJGKrITKs',
    "L": '80|ISKpISIBKZIAKZIqJGIrJGKrITKs',
    "M": '113.3|ISKpITIAI8IBI9J-JfIAKGIBKlJ8KmIBLSIBLRKsKMKrJ0JJJxJGJYKpJVKsITKs',
    "N": '100|ISKpISIBJEIBJFJcKFIAK1IAK2KrKEKrKDJOJDKsITKs',
    "O": '100|JTKsJJKsIzKkIlKaIYKLIQJ7IMJrIOI3IeIZIvIKI7IEJVH-KBIAKfIOKsIbK2IrK8JBK6J1KsKRKZKiKHKqJzKuJVKu/JfKGJtKGJ3KCKCJ3KIJlKIJJKEI5J3IqJtImJbImJRIqJGI1JAJHJAJlJEJzJRKC',
    "P": '86.7|ISKpISIBJFIAJGJBJzJCKPJMKaJXKiJnKkJ1KiKJKcKXKPKkKBKqJ3KsITKs/JLKKJfKKJsKDJwJ7JwJzJpJoJfJkJGJlJGKJ',
    "Q": '100|JTKsJBKqItKgIeKTIQJ7IMJrIMI_IYIhIlISJBICJTH-J1H-KPIGK1HuLEILK1ISKqIbKwIhK4IxK8JBK8JrK0KFKhKcKRKmJzKuJVKu/JfKGJtKGJ3KCKCJ3KIJlKIJHKEI5J_I2JvJCJjJGJaI3JbIyJpIsJtImJbImJRIqJGI1JAJJJAJlJGJ3JRKC',
    "R": '93.3|ISKpISIBJIIBJIJFJTJGJgI7J_IAK5IAK6IDKcI7KPJIKGJLKZJUKqJnKuKBKqKRKkKbKRKoJ_KsITKs/JNKKJpKKJzKGJ4J_J2JvJxJqJlJmJJJmJIKJ',
    "S": '86.7|JDKsIpKmIWKVIOJ_IQJvIWJjIrJSJnJAJwI3JwIrJnIiJPIgJAIrI5I8IrI8IpI6ILI6III1IMIlISIZIjIIIxICJFH-JpH-KBIEKRIOKgIhKkItKkJDKeJRKVJcKBJoJFJ4JAJ9JAKFJLKOJbKOJqKDJtJ4KdJ6KeKDKaKPKNKgJ7KqJpKuJFKu',
    "T": '86.7|IGKpIHKEI8KDI8IBJvIAJwKDKlKEKmKrIHKs',
    "U": '100|ISKpISI7IWIpIgIXIrIMI5IEJVH-J5H-KLICKdIMKsIdK2I3K2KrKCKrKCI_J-IzJzIoJtImJbImJTIqJII3JGI_JGKrITKs',
    "V": '93.3|ICKpJAIDJDIAJ7IAK6KrKEKrJfIyI4KrIDKs',
    "W": '120|IAKpInIAJaIBJ2JnJ5JqKWIBLKIBLwKnLvKsK-KrKuJTKrJOKRKsJeKrJFJOIyKrIBKs',
    "X": '93.3|IHKqI8JZICIDIDIAI7IAJdI2JgI1J4ILKBIAK6IBKAJZK1KsJ9KsJfJ4I_KsIHKs',
    "Y": '93.3|ICKpJEJHJEIBJ3IAJ4JJK6KrKBKsJfJ0JaJ3I7KsIDKs',
    "Z": '86.7|IOKpIPKEJgKDIEInIEIBKlIAKlIoJGIpKkKHKkKrIPKs',
    "&": '106.7|JTKsJHKqI7KkIyKbIsKPIuJ1I8JhIlJUIYJFISI3ISInIWIbIrIGJFH-JzIAKBIEKVIQKxH-LKIbLHIgKyItK-JLKZJUKUJHKRJGJ6JbJ7JeKJJmKWJzKaJ7KcKPKYKZKLKmJ9KsJzKuJVKu/JlKUJvKSJ2KLJ2KFJrJ2JhJyJWKBJWKLJdKS/JTJIJ4InJjIeJTIeJLIiJEIpJAIzJCI7JPJI',
    ".": '40|IOItIPIAJCIBJBIwIPIw',
    "·": '40|IOJrIPI-JCI_JBJuIPJu',
    "-": '40|IGJPIHIsJKItJJJSIHJS',
    "!": '40|IOKpIOKDIYI3I3I2JCKBJCKrIPKs;IQInIRIAJAIBI_IqIRIq',
    "'": '33.3|IKKpIKKNISJtIxJsI6KNI6KrILKs',
    "↑": '60|I4KpIsKVISJ7ISJzIfJ4I2KHI2HPJBHOJCKHJlJyJmJ7JKKXJAKpI9KsI5Ks',
  } },
  hwy: { c: 86, g: {
    "0": '66.2|IxKqIhKkIWKZIQKLIQIhIYIPIlIEI3H-JNH-JjIGJuIRJ0IfJ2ItJ0KLJuKZJhKmJZKqJRKsIzKs/JBKOJPKKJWJ5JWIzJSIlJLIeI7IeI0IjIwIrIwJ_I5KM',
    "1": '39.9|IdKoIIKfIIJ_INJ-IZKEIeKDIeIBI7IAI8KpIfKq',
    "2": '62|IxKqIjKmIWKbIOKNIKJ7IrJ6IwKHI9KOJLKKJQKDJQJ7JGJnIMIdIMIBJxIAJxIeI4IfJkJXJsJlJwJzJuKTJZKoJLKsIzKs',
    "3": '63.5|IzKqItKqIhKkIUKXIMKFIMJ7IrJ6IuKDI3KMJFKMJKKHJMKBJKJvJDJoIwJnIwJLJBJKJMJDJOIpJDIeIxIgIsIlIpIuIJIuIIIpIOIXIbIII1H-JJH-JfIGJqIRJwIfJuJFJjJUJYJZJhJeJsJtJuKJJoKZJbKmJLKsI1Ks',
    "4": '68.3|JAKnIOI7IOIbJRIaJTIAJxIAJyIZJ-IbJ-I5JyI7JxJkJSJjJRI6I0I7JmKpJBKq',
    "5": '65.3|IUKnIUJJIxJIIyJNI5JUJHJWJSJNJUItJSInJJIeI7IeI0IjItIyIRIyISIfIYITIlIGIxIAJLH-JZICJoINJyIhJ0ItJyJVJsJjJfJwJXJ0I_J0IzJuIyKJI1KMJtKMJuKpIVKq',
    "6": '61.6|I5KoIUJbIMI_IMIlIUIRIfIGI1H-JHH-JZIEJkINJuIhJwI5JoJTJbJgI-JnJeKpI7Kq/I7JGJFJGJOI9JQIrJMIjJFIeI1IeIsIpIsI5IwJB',
    "7": '60.4|IKKnILJyIpJyIrKMJIKLIkIHIlIAJFIAJsKTJsKpILKq',
    "8": '67.5|I1KqIvKqIjKkIYKZISKNISJxIaJjImJZIUJJIQJBIOIjIWIRIjIGI5H-JNH-JdICJnIIJyITJ4IfJ6I1J2JDJuJPJgJZJwJnJ0JvJ2KJJsKdJdKoJPKsI3Ks/JFKOJNKMJUKFJWJzJNJoI_JmI0JtIwJ7I3KK/JFJIJRJEJYI9JaIvJRIgI7IeIuIrIuI7I1JE',
    "9": '61.6|IvKqIlKoIUKZIMKFIMJrIWJVIjJKIvJGJCJHIkIBJFIAJmJNJuJnJwJ9JqKVJdKkJJKsIxKs/I5KMJJKKJQJ9JOJtJDJkIzJmIsJxIsKBI1KM',
    "A": '77.7|JCKnICIBIlIAIvIcJrIcJwIVJ3IAKXIAKYIFJaKnJXKqJDKq/JPJwJiI7I7I6I6I_JIJnJMJx',
    "N": '84|ISKnISIBIyIBIzJ4JsIDJvIAKVIAKWKpJ2KpJ1IwI8KnI5KqITKq',
    "Q": '78.9|I_KqIzKoIlKgIcKXISKFIQJ9IQItIUIhIjIMI7IAJXH-JnICJ3IMKLH-KaITKIIhKMI1KMJ3KIKHKCKTJzKiJjKqJbKsJBKs/JJKMJVKMJfKIJmKBJqJ3JqI7JnI6JZJEJOI3JKIvJaIhJTIeJHIeI9IiI0IrIwI3IwJ1I0J_I9KI',
    "R": '78.2|ISKnISIBIyIBIyJDJHJEJtIAKTIAJsJDJvJIJ5JMKEJXKMJrKMKFKAKdJpKqITKq/I5KMJfKMJjKKJsJ9JqJtJhJkIzJkIyKJ',
    "S": '73.9|I9KqIrKmIWKTIQKBISJlIWJdInJOJhJAJqI1JoIpJZIeJFIcIvIgIXIsIIITIdIGIxIAI9H-JhIAJ3IKKEIZKKIvKIJDKAJRJ1JaJnJgJPJkI3JsIwJ1IwJ_I5KKJHKOJfKMJ5KAKGKZKBKeJlKqJbKsI_Ks',
    "T": '57.8|H8KnH9KMIqKLIqIBJJIAJKKLJ3KMJ4KpH9Kq',
    "U": '78.6|IQKnIQI1IWIdIjIMI5IAJZH-J1IIKGIbKMItKMKpJsKpJsIxJhIiJXIeJBIgIyIvIwI3IwKpIRKq',
    "Y": '60.4|H7KoIsJDIsIBJLIAJMJDJ-KpJcKpI9JiIeKnIbKqH7Kq',
    "·": '25.4|IIJLIJIuIqIvIpJOIJJO',
    "-": '57.5|IQJJIRIuJkIvJjJMIRJM',
    "↑": '60|I4KZIuKJISJtISJlIjJsI2J5I2HPJBHOJCJ5JjJkJmJlJmJtJIKLI_KcI5Kc',
  } },
  cjk: { c: 64, g: {
    "採": '84|IeKHIeJxIPJwIMJtINJiIeJhIeJDIMI7IMIzIPIsIeIzIeIHIOIFIQH7ITH4IlH4IsH9IuIBIuI7I8JFI5JSIuJNIuJhI7JiI8JvIuJxItKKIfKK;KJKIJ1KGJzKEJlKEJjKCJBKAJAJ9JFJyJPJyJRJ0JjJ0JlJ2KLJ6KYJ_KRKK;KOJxKKJjKAJPKBJMKLJIKOJJKcJpKbJwKRJ0;JpJwJjJwJgJtJkJnJqJTJvJSJ1JUJ4JZJwJxJrJy;JHJqJAJnJIJZJMJLJTJKJZJMJaJTJQJpJNJs;JmJJJlJCI-JBI_I0JeIzJYIpJBISI0IJI2IFI_H-JYIVJlImJnH4J0H5J1IkKIILKXH8KgIJKMIbJ-ItJ8IzKdI0KeJBJ1JCJzJMJnJM',
    "石": '84|IMKDINJ4JAJ3JAJxIqJLIKIrIQIhITIgIuI3IuH5I9H4I_ICJ_ICKCH_KDH4KPH4KQJNI-JPJCJTJTJ4KdJ4KeKFINKG/JDJAJ_JAKCI9KCITJ_IQI_IQI-I_',
    "場": '84|IeKHIeJlIOJjIPJYIbJYIeJVIeIrIKIfIPIUIhIcI4ItI4I3I1I6IxI2IsI1IsJXI5JYI6JjIsJlIsKJIfKK;JAKFJBJSKWJTKVKIJBKI/JTJ6KHJ6KIJzJPJyJOJ5/JTJmKHJmKIJfJPJeJOJl;I4JFI5I8JQI7JBIsI0IlI9IaJPIoJcInJZIiJLIYIyILI5ICI9ICJZISJvIoJ3IoJ4IlJ0IfJhIMJOIBJVH4JZH4JxIIJ-IXKGInKLIoKMIbKKIZKKILKIIHKDIEJyIDJ3H4KNH4KWH_KYIFKYIbKaIdKZI0JcI1JhI8KdI8KdJII5JI',
    "街": '84|ImKHIMJrIRJeIZJiImJvI0KDIzKGIrKKInKK;JMKHJLJ4I2J3I3JsJJJsJMJpJMJXI1JWI0JJJxJIJxJWJaJXJaJrJvJsJwJ3JbJ4JZKKJNKK;J4KBJ4J5J7J2KcJ3KbKEJ5KE;IoJjIaJLIKI7IRIsIXIyIaIxIbH2IoH3IoJHI2JfIpJm;J3JaJ2JPKDJOKGJLKGIJKDIGJ1IGJ0H_J3H4KLH4KSH9KUIDKUJNKeJPKeJbJ5Jc;JMI_JLIyI2IxI3ImJMIlJMINJHIKI1IIIyIFI1H6JHH8J2IJJ1IWJfIQJaIRJaIlJvImJwIxJbIyJZJCJNJC',
    "熟": '84|IvKKImKJInKAINKAIMJ1JUJ1JTKAI5KAI0KLIxKM;JoKHJoJzJbJyJYJvJZJkJoJjJmJTJfJaJZJYJUJTJiI_JaIxJIIhJVIYJiIlJrIyJzIoJ8IvJ6I3JyJBJyJNJ0JPJ2JjJ9JkJ-JBKAI_KCIpKLIcKVIcKcIlKgI5KXJAKRIuKOIzKOI7KMI9KMJxJ3JyJ2KJJpKK;IRJuIRJSJQJTJQJtJNJwITJw/IjJkJBJkJCJfIfJeIeJj;IQJJIRJAIwI_IsI9IrI2IXI2IMIzINIoIRIqInIqIpIsIsIpIrImIcIlIfIaIxIaI4IfI6IrI9IuJLIuJUIxJTI8I-I5JMJDJLJMIRJM;IbIWIMH_INH8IXH2IeH9IqIRIpIUIdIY;JDIWI7IWI4IRI-IDI-H7JBH4JHH4JOH7JOIBJIIVJFIY;JnIWJhIWJcITJiIJJmH7JpH4J1H6J0IFJsIVJpIY;KHIWJ-ITKOH5KVH4KbH6KeH9KUIPKNIY',
    "食": '84|JPKKI7J6IjJuILJmIQJbIXJaI9JsI_JiJrJiJtJsKTJaKZJaKgJlJ1J2JlKAJdKKJVKM/JXJ6JkJxJGJxJPJ4;IgJXIgIHIeH_IhH4ItH4JQIDJPIQIzIIIwIJIxIkKIIlKHJaIhJa/I1JOJ3JOJ4JFIxJEIwJN/I1I4J3I4J4IxIxIwIwI3;KLIkJzIWJZIgJQIVJpIMKNH6KRH2KaIBKEIPKaIdKPIm',
    "鮮": '84|IoKHIeJ3IKJjIOJZIRJWIUJXIUIhJPIgJQJlJCJnJMJzJMJ9IzJ-I2KFI1KIIpKK/IvJyI3JyI4JvIvJmIiJnIrJy/IlJYIsJXIrJKIgJLIgJX/I9JYJCJXJBJKI4JLI4JX/IlI8IsI7IrIuIgIvIgI7/I9I8JCI7JBIuI4IvI4I7;JdKIJYKDJgJ5JmJrJpJqJxJuJ0JxJoKHJlKK;KNKIKIJ9KAJzKAJvKJJqKQJvKcKFKTKK;JYJlJZJaJyJZJxJIJaJHJbI6JyI5JyIpJXIoJWIbJxIaJyH5J_H4KAIXKDIaKeIbKdIoKAIpKBI6KXI6KaI9KZJIKBJIKAJXKDJaKbJaKcJnJZJo;ITIaIMH7IXH2IcIDIgIZIZIc;JJIaJFIaJEIXJKILJMIBJVICJYIFJSIVJNIc;IjIYIkH5IpH4IwH7IuIZIlIa;IzIYI4H9JDH8JEIHJAIXI9IaI1Ia',
    "魚": '84|I4KJIlJ0IKJjITJWIaJZIaIhIdIeKNIeKQIhKQJlJqJnJ4JzJ3KAJFKAJEKDJHKII7KM/I7JyJiJxJTJmIsJnI3Jy/IvJYJNJYJOJLIrJKIqJX/JhJYJ_JYKAJLJdJKJcJX/IvI8JNI8JOItIrIsIqI7/JhI8J_I8KAItJdIsJcI7;KDIaJ8IXKMIBKOH7KRH4KbH6KeH_KQIVKJIc;IeIXIWILIKH_IVH2IkIFIuIVIlIaIfIa;JjIYJbIYJaITJmH9JmH5JvH4J1H6J0IBJqIXJnIa;I5IWJAH5JJH4JPH6JIIXI7IY',
    "麵": '84|IoKHInKAIPKAIMJ9INJyIoJxIoJTIdJKINJCIKI9IOI1ITI0IrJGIxJIJLI2JQI7JSJDI2JTI2JxJLJyJMJ_I3KAI1KKIpKK;JQKDJRJ6JwJ5JtJuJXJuJUJrJUIRKZIQKaJrKXJuJ8JvKBJ6KdJ6KeKFJRKG/JnJgJoIdJjIcJiJf/J5JgJ6JTJ1JSJ0Jf/KLJgKMIdKHIcKGJf/J5JGJ6I5J1I4J0JF/J5IqJ6IdJ1IcJ0Ip;I-JtI4JXJBJSJFJWJLJMJQJRJSJXJIJlJKJrJBJw;IUJrIKJTITJMIZJWIdJQImJZIeJjIeJtIVJu;InI-IhI0IfI2IUIvIWIlIMIdIVISIdIYIkIRIfIKINIEIKIBITH2IvIGI9H-JNH6KcH5KgIDKfIGJXIGI9IMI6IRJGIjJKI1IzI2IzI-ItJA/ItIoI4InIvIYImIjIpIo',
    "包": '84|IxKIIiJxIMJbIXJSIxJsKHJsKIJFKGJDKGIvKDIqJyIpJ3IcKJIcKNIeKUIlKUI1KWI3KWJ5I7J6JCKHI7KKIzKK;IiJXIiIDInH8IzH4KLH4KVH8KaIBKeITKRIaKOIZKOINKLIIJ5IIJ3IGIxIIIxIoJuIpJuJZIjJa/I1JMJdJMJeI3IxI2IwJL',
    "坊": '84|IgKHIgJfIMJdINJQIgJPIgIdIZIYIKITINIGITIGJCIbJBIqIwIjIwJPI_JQJAJdIwJfIwKJIhKK;JjKIJcKHJkJ1JjJyI-JxI_JkJYJjJYJNJWJLJWI1JSInJIIVIyIBI9H2JYIRJgIhJlI-KEI9KEIjKCIhKAIJJ9IGJlIGJkIDJoH3J7H2KDH4KMH_KOIFKQIfKSIhKUJLJnJMJmJjKbJkKcJxJ3JyJsKJJlKK',
    "封": '84|IsKHIrJ0IQJzIRJmIsJlIsJVINJUIMJHJXJGJXJUI6JVI6JlJTJmJUJzI9J0I6J3I6KJItKK;KEKHKEJtKBJqJaJpJbJcKEJbKEIJKBIGJmIFJoH7JzH2KJH4KSIBKSJbKeJdKeJpKSJrKSKJKFKK;JlJMJfJKJeJHJoIzJsIhJvIgJ5ImJ6IrJsJNJnJO;ItJAIrIyIQIxIRIkIsIjIsININIGIMIDIRH4IxH-JYIJJXIYI_IQI6IRI6IjJTIkJUIxI9IyI6I1I5JCIvJC',
    "鎖": '84|IoKJIeJ5IKJlIRJaIXJcIZJWImJVIlJKIOJJIPI8ImI7ImIPIdIKINIIIMIBIPH6I3ICJJIIJMILJMIRJJIWI0IRI0I7JII9JHJKI0JLI0JVJAJXJAJjIgJlItJ2IzJ0JDJkJIJnJMJvI0KDI2KFI1KIIpKM;JsKHJsJjJSJhJSIXJiIVJEIBJNH4JVH6JwIPJpIWKWIXKWJhJ7JiJ6KJJtKK/JlJUKHJUKIJNJhJMJgJT/JlJAKHJAKII5JhI4JgI_/JlIsKHIsKIIjJhIiJgIr;JTKEJKJ_JZJmJhJqJkJvJaKBJVKG;KOKDKCJvKJJoKPJoKSJrKcJ_KZKEKTKGKPKG;IXI0IOIxISIhISIRIVIOIgITIcIxIZI2;I-IzI4IdJBIYJGIfJIIvJKIxJBI2;KBIQJ6IJKVH4KgIBKVIKKFIS',
    "危": '84|I7KIIpJ0IMJfIVJUIeJXIeIxIcIvIcIlIUINIMIBINH-IXH4IgIDIqIdItJSKbJSKeJVKeJfKbJiJuJjJ-JxJ9J-JJJ-JIKBJMKFJLKIJFKKI9KK/I_JwJmJvJXJiIsJjI1Js;I8JDI8IBJDH6KRH6KaIBKeINKeIVKRIcKOIZKOIPKJIIJNIIJKILJLI4J9I4J-IpJ5IkJkIjJmIZJpIWJ9IWKHIaKMIjKMItKOIvKNJGI9JG',
    "險": '84|JnKKJTJ2I4JnI_JaJPJkJSJjJTJaKFJaKHJiKLJiKXJaKcJfKgJlKdJoKBJ4J2KDJ1KIJpKM/JuJ3J-JpJYJpJnJ2;IOKFIOH5IbH4IcJ3IfJ6IqJ5IoJtIgJZIgJTIkJPIqJBIsIvIpIqIlIoIgIpIgIhIjIaIrIaIzIeI4IlI4I_IuJVI4J1I4KHIPKI;JCJPJCIpJnIoJoJRJDJS/JVJGJaJFJZI0JQI1JQJF;JwJPJxIoKYIpKXJSJxJS/KDJGKHJGKKJDKKI3KHI0J-I1J-JF;JNIiJCIPIyH_I7H4I_H4JRIMJfIAJoIHJoILJYIXJcIhJTIk;J-IhJyINJmH_JxH2J8IFJ_IIKDIIKTH4KXH4KeIBKGIVKMIfKDIkJ_Ik',
  } },
};
