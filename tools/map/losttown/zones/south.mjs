// 失落之城 LOST TOWN — zone 'south': 南大道、南橫街與南巷 (South Avenue, South Cross Street, South Lane),
// build-zone polygon (-26,26) (26,26) (26,40) (38,40) (38,84) (-38,84) (-38,40) (-26,40) (layout BUILD_ZONES).
// Recreates the south arm of CSO's "Lost City" (zs_lostcity): a 16 m avenue lined with red/white awnings running
// from the central intersection to a narrow cross street (spawn pockets behind quarantine fences at both ends), then a
// short lane sealed by a jack-knifed white box truck - the mid-boss (butcher) smashes through it in round 5 and charges
// up the avenue (nothing hangs over the carriageway below 9 m).
//   west  S_W1 pawn shop (PAWN · LOANS 當舖, blue shopfront, layered bill posters, awning)
//         S_W2 7F flats (black fire escape on the avenue face, 2F spawn window SP_S_WIN)   S_W3 4F painted brick (cross st)
//   east  S_E1 grocery (GROCERY 雜貨, red/white awning, produce stand S_PRODUCE with hidden propane = mid-boss mechanic)
//         S_E2 SILVER STAR DINER 銀星餐館 (2F moderne diner: rounded corner, ribbon windows, booths, dead rooftop DINER
//         neon frame, HVAC, roof spawner SP_S_ROOF)   S_E3 5F brick (cross st)
//   lane  X_S1 / X_S2, LM_TRUCK_BARRICADE (truck, crate stacks, zombie slot) and the pocket closed by the HOTEL BELMONT
//   fills the strips x ±24..26 (z 26..40), the block interiors behind X_S1 / X_S2 up to z 84, the pocket end walls (x ±38)
// All geometry, wording, brands and art are original (docs/MAP_LOSTTOWN.md §0). Lettering = outlines traced from text we
// rendered ourselves with installed system faces (GLYPHS, end of file; same method and faces as the west / north zones,
// plus Segoe Script Bold for the dead diner neon). Every number other zones or the runtime depend on (footprints,
// spawners, supplies, lights, blockers, props) comes from tools/map/losttown/layout.mjs.
//
// Seams: z = 26 with the centre zone (road x -5..5 asphalt_cracked + the centre's repaved strip continued, sidewalks
// y 0.15 x ±5..8 with 0.3 m granite curbs, yellow edge lines at x ±4.6, centre dashes at world [9k, 9k + 3]); the
// x = ±26 strips meet the west / east zones' block fills at their heights (21.6 m west, 16.9 m east).
// Pocket end walls x = ±38 / ±37.62: drawn here as facade slabs 0.35 m deep inside the zone (skyline masses beyond must
// not put a face on x = ±37.62..38 below 18.2 m).
// Barricade gaps follow the west zone's rule: zombies move on the nav grid (0.5 m cells, r 0.3), players collide with
// the mesh (r 0.34), so each gap is narrowed to a 0.64 m slot centred on a nav-cell centre (z 51.25 west fence,
// z 54.75 east fence, x -3.75 truck); the player clips over the barricades start at their tops.
// Boss break (R5) and the propane mechanic are exported as map.json objectives (S_TRUCK_BREAK: intact / shoved truck
// poses + the pre-fractured crate pieces with their scatter targets; S_PROPANE: tank positions). The static package
// draws the intact barricade; a runtime breakable has to take those pieces over.
// Spawners, L_LAMP_S (realtime, LAMP_9), supplies SUP_S / SUP_SX and the zones come from layout.toMapJson() / LIGHTS.
import { MATERIALS } from '../../lib/materials.mjs';
import { ensureCCW } from '../../lib/kit/core.mjs';

const PI = Math.PI;
const SW = 0.15;   // sidewalk top
const BY = 0.13;   // building base (2 cm below the sidewalk top: no crack at the wall foot)
const F = (ground, n, upper = 3.4) => [ground, ...Array(n - 1).fill(upper)];

// Zone-local palette additions (identical definitions to the west / east zones' wz_* / ez_* entries, so the compiler
// folds them into the same GPU materials; colours move into the vertex tint).
const ZONE_MATS = {
  sz_fabric: { set: 'canvas', surf: 'wood', tile: 1.2, color: '#ffffff', lm: 1, side: 'double' },
  sz_wood: { set: 'wood_siding', surf: 'wood', tile: 1.3, color: '#ffffff', lm: 1 },
  sz_paint: { set: null, surf: 'metal', color: '#24211e', rough: 0.8, lm: 1 },
  sz_paint_white: { set: null, surf: 'metal', color: '#e8e3d6', rough: 0.8, lm: 1 },
  sz_paint_red: { set: null, surf: 'metal', color: '#a42a20', rough: 0.8, lm: 1 },
  sz_paint_yellow: { set: null, surf: 'metal', color: '#e0b434', rough: 0.8, lm: 1 },
  sz_paint_green: { set: null, surf: 'metal', color: '#2c5236', rough: 0.8, lm: 1 },
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
      kit.face([[a, y - drop * 0.25, depth * 0.25], [b, y - drop * 0.2, depth * 0.2], [b, y, 0.02], [a, y, 0.02]], 'sz_fabric', { tint });
      if (hang.has(i)) kit.face([[a + 0.03, y - drop - 1.0, depth - 0.08], [b - 0.05, y - drop - 0.75, depth - 0.04], [b, y - drop, depth], [a, y - drop, depth]], 'sz_fabric', { tint: shadeHex(tint, 0.9) });
      continue;
    }
    kit.face([[a, y - drop, depth], [b, y - drop, depth], [b, y, 0.02], [a, y, 0.02]], 'sz_fabric', { tint });
    kit.face([[a, y + oy, 0.02 + oz], [b, y + oy, 0.02 + oz], [b, y - drop + oy, depth + oz], [a, y - drop + oy, depth + oz]], 'sz_fabric', { tint, shade: 0.62 });
    kit.face([[a + 0.015, y - drop - val, depth], [b - 0.015, y - drop - val, depth], [b, y - drop, depth], [a, y - drop, depth]], 'sz_fabric', { tint });
    kit.face([[b - 0.015, y - drop - val, depth - 0.012], [a + 0.015, y - drop - val, depth - 0.012], [a, y - drop, depth - 0.012], [b, y - drop, depth - 0.012]], 'sz_fabric', { tint, shade: 0.6 });
  }
  for (const xx of [x0, x1]) {
    const tri = [[xx, y, 0.02], [xx, y - drop, depth], [xx, y - drop - val, depth]];
    kit.face(xx === x0 ? tri : tri.slice().reverse(), 'sz_fabric', { tint: o.colors[0] });
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
    if (o.head) textLine(kit, o.head, { font: 'sans', x: 0, y: Y0 + h * 0.66, h: Math.min(h * 0.16, (w * 0.8) / Math.max(1, o.head.length * 0.75)), maxW: w * 0.84, align: 'center', z: 0.002, mat: o.headMat || 'sz_paint', tint: o.headTint });
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
    { bg: '#e9c433', big: 'SALE', bigMat: 'sz_paint_red', small: 'UP TO 70% OFF', smallMat: 'sz_paint' },
    { bg: '#c3352a', big: 'SALE', bigMat: 'sz_paint_white', small: 'EVERYTHING MUST GO', smallMat: 'sz_paint_white' },
    { bg: '#efe9d8', big: '50%', bigMat: 'sz_paint_red', small: 'OFF ALL STOCK', smallMat: 'sz_paint' },
    { bg: '#e9c433', big: '70%', bigMat: 'sz_paint_red', small: 'CLEARANCE', smallMat: 'sz_paint' },
    { bg: '#efe9d8', big: 'SALE', bigMat: 'sz_paint_red', cjk: '大特賣', smallMat: 'sz_paint' },
    { bg: '#c3352a', big: 'BIG', bigMat: 'sz_paint_yellow', small: 'SALE', smallMat: 'sz_paint_white', smallH: 0.22 },
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
  if (B.roof !== false) kit._flatRoof(poly, top, { type: 'flat', parapet: B.parapet, mat: 'roof_tar', coping: B.coping || 'trim_concrete', clutter: B.clutter !== false }, { mat: B.mat, tint: B.tint });
  // roof: false = facade slab (pocket end walls): a plain coping instead of roof + parapet
  else kit.box({ x: (B.x0 + B.x1) / 2, y: top, z: (B.z0 + B.z1) / 2, w: B.x1 - B.x0 + 0.08, h: 0.14, d: B.z1 - B.z0 + 0.08, mat: B.coping || 'trim_concrete', faces: { bottom: false } });
  kit.colPrism(poly, B.colFrom ?? base, top + (B.roof === false ? 0.14 : B.parapet), kit.material(B.mat).surf);
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
    kit.cyl({ x: 0, y: 2.52, z: 0, r, h, seg: 16, mat: 'sz_wood', tint: '#a08a72', top: false });
    kit.cyl({ x: 0, y: 2.52 + h, z: 0, r: r + 0.08, r2: 0.12, h: 0.9, seg: 16, mat: 'sz_wood', tint: '#8a7764' });
    for (let i = 0; i < 3; i++) { const ring = circle(r + 0.02, 18).map(([x, z]) => [x, 2.8 + i * 0.95, z]); kit.sweep(rectProf(0.025, 0.05), [...ring, ring[0]], 'steel_dark', { tint: '#3c3834' }); }
    kit.colBox({ x: 0, y: 0, z: 0, w: r * 1.6, h: 2.52 + h + 0.9, d: r * 1.6 }, 'wood');
  });
}

// ---------------------------------------------------------------------------------------------------- set dressing
/** Wooden pallet standing on its long edge (local frame: x along), or lying flat. */
function pallet(kit, flatPallet) {
  const t = '#c9b08a';
  if (flatPallet) {
    for (let i = 0; i < 7; i++) kit.box({ x: -0.5 + i * 0.165, y: 0.12, z: 0, w: 0.1, h: 0.02, d: 1.2, mat: 'sz_wood', tint: t });
    for (const z of [-0.55, 0, 0.55]) kit.box({ x: 0, y: 0, z, w: 1.0, h: 0.12, d: 0.09, mat: 'sz_wood', tint: shadeHex(t, 0.8) });
    return;
  }
  for (let i = 0; i < 6; i++) kit.box({ x: 0, y: 0.05 + i * 0.36, z: 0.0, w: 1.0, h: 0.1, d: 0.02, mat: 'sz_wood', tint: t });
  for (const x of [-0.45, 0, 0.45]) kit.box({ x, y: 0, z: -0.06, w: 0.09, h: 1.95, d: 0.1, mat: 'sz_wood', tint: shadeHex(t, 0.8) });
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
    for (const s of [-1, 1]) kit.at({ x: 0, y: 0, z: s * 0.635, rot: s > 0 ? 0 : PI }, () => textLine(kit, 'CITY WASTE 7', { font: 'sans', h: 0.09, x: 0, y: 0.75, z: 0, align: 'center', mat: 'sz_paint_white', shade: 0.7 }));
  });
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
  for (const s of [-w / 2 + 0.15, w / 2 - 0.15]) for (const zz of [-0.18, 0.18]) kit.at({ x: s, y: 0, z: zz, rx: zz < 0 ? 0.3 : -0.3 }, () => kit.box({ x: 0, y: 0, z: 0, w: 0.06, h: 1.12, d: 0.05, mat: 'sz_wood', tint: '#b8a68a' }));
  kit.box({ x: 0, y: 0.95, z: 0, w, h: 0.2, d: 0.04, mat: 'reflective_white', tint: '#e2ddd2' });
  for (let i = 0; i < 4; i++) kit.at({ x: -w / 2 + 0.25 + i * (w - 0.5) / 3, y: 1.05, z: 0.025, rz: 0.7 }, () => kit.box({ x: 0, y: -0.1, z: 0, w: 0.09, h: 0.24, d: 0.004, mat: 'sign_white', tint: '#c03a2a' }));
}
/** QUARANTINE ZONE 檢疫區 / NO ENTRY 禁止進入 board (local frame, faces +z, bottom-centre at origin). */
function quarantineSign(kit, w, h) {
  const zf = board(kit, -w / 2, w / 2, 0, h, { mat: 'sign_white', tint: '#e6e1d4', d: 0.03, border: { mat: 'sign_white', tint: '#b8382a', w: 0.04, inset: 0.04 } });
  flat(kit, rect2(-w / 2 + 0.08, h * 0.56, w / 2 - 0.08, h - 0.08), zf, 'sign_white', { tint: '#b8382a' });
  textLine(kit, 'QUARANTINE ZONE', { font: 'sans', h: h * 0.13, x: 0, y: h * 0.7, z: zf + 0.002, align: 'center', mat: 'sz_paint_white', maxW: w - 0.25 });
  textLine(kit, '檢疫區', { font: 'cjk', h: h * 0.1, x: 0, y: h * 0.6, z: zf + 0.002, align: 'center', mat: 'sz_paint_white', maxW: w - 0.25 });
  textLine(kit, 'NO ENTRY', { font: 'sans', h: h * 0.15, x: 0, y: h * 0.3, z: zf, align: 'center', mat: 'sz_paint_red', maxW: w - 0.25 });
  textLine(kit, '禁止進入', { font: 'cjk', h: h * 0.11, x: 0, y: h * 0.12, z: zf, align: 'center', mat: 'sz_paint', maxW: w - 0.25 });
  for (const s of [-1, 1]) kit.sweep(circle(0.006, 4), [[s * (w / 2 - 0.1), h - 0.05, zf], [s * (w / 2 - 0.05), h + 0.1, -0.02]], 'wire', { smooth: true });
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
/** Red coin-op newspaper box on a pedestal (front = local +z). */
function newsBox(kit, at, rot, tilt) {
  kit.at({ x: at[0], y: SW, z: at[1], rot, rz: tilt }, () => {
    kit.box({ x: 0, y: 0, z: 0, w: 0.3, h: 0.04, d: 0.3, mat: 'steel_dark' });
    kit.box({ x: 0, y: 0.04, z: 0, w: 0.07, h: 0.32, d: 0.07, mat: 'steel_dark' });
    kit.bbox({ x: 0, y: 0.36, z: 0, w: 0.5, h: 0.72, d: 0.44, bevel: 0.02, mat: 'paint_metal', tint: '#a8251d' });
    kit.face([[-0.19, 0.58, 0.222], [0.19, 0.58, 0.222], [0.19, 0.9, 0.222], [-0.19, 0.9, 0.222]], 'glass_dirty');
    kit.face([[-0.17, 0.6, 0.218], [0.17, 0.6, 0.218], [0.17, 0.86, 0.218], [-0.17, 0.86, 0.218]], 'sign_white', { tint: '#d6d0c0' });
    textLine(kit, 'DAILY', { font: 'serif', h: 0.035, x: 0, y: 0.8, z: 0.219, align: 'center', mat: 'sz_paint' });
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
    textLine(kit, 'MAIL', { font: 'sans', h: 0.08, x: 0, y: 0.6, z: 0.252, align: 'center', mat: 'sz_paint_white' });
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

// ---------------------------------------------------------------------------------------------------- south helpers
/** Sphere (lathe) centred at (x, y, z) of the current frame. */
function sphere(kit, x, y, z, r, mat, tint, seg = 10) {
  const prof = [];
  for (let i = 0; i <= 6; i++) { const t = (i / 6) * PI; prof.push([Math.max(0.002, Math.sin(t) * r), r - Math.cos(t) * r]); }
  kit.lathe(prof, { x, y: y - r, z, seg, mat, tint });
}
/** Flat five-point star on plane z (frame-local, centre cx, cy, outer radius r). */
function starShape(kit, cx, cy, r, z, mat, tint) {
  const pts = [];
  for (let i = 0; i < 10; i++) { const a = PI / 2 + (i * PI) / 5, rr = i % 2 ? r * 0.42 : r; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
  flat(kit, pts, z, mat, { tint });
  return pts;
}
/** Dead neon: a thin glass tube swept round the outer loop of every glyph of a text run (plane z, baseline y). */
function neonText(kit, str, o) {
  const font = o.font || 'sans', Fn = GLYPHS[font], s = o.h / Fn.c, tr = (o.track ?? 0.06) * o.h;
  const W0 = measure(str, { ...o, font }), sx = o.maxW && W0 > o.maxW ? o.maxW / W0 : 1;
  let x = (o.x ?? 0) - (o.align === 'center' ? (W0 * sx) / 2 : 0);
  const ring = circle(o.r ?? 0.022, 5);
  for (const ch of str) {
    const g = glyph(font, ch, 2);
    if (ch !== ' ') for (const sh of g.shapes) for (const lp of (o.holes ? sh : [sh[0]])) {
      const P = lp.map(([gx, gy]) => [x + gx * s * sx + gy * s * (o.italic || 0), (o.y ?? 0) + gy * s, o.z ?? 0.06]);
      kit.sweep(ring, [...P, P[0]], o.mat || 'lamp_off', { smooth: true, up: [0, 0, 1], tint: o.tint });
    }
    x += ((ch === ' ' ? (o.space ?? 0.42) * o.h : g.adv * s) + tr) * sx;
  }
}
/** Scissor security gate across x0..x1 (wall-local, plane z). */
function scissorGate(kit, x0, x1, y0, y1, z) {
  const n = Math.max(2, Math.round((x1 - x0) / 0.55)), s = (x1 - x0) / n, mat = 'steel_dark', tint = '#5a5c5c';
  for (let i = 0; i <= n; i++) kit.box({ x: x0 + i * s, y: y0, z, w: 0.025, h: y1 - y0, d: 0.025, mat, tint });
  const rows = Math.max(2, Math.round((y1 - y0) / 0.8)), rh = (y1 - y0) / rows;
  for (let i = 0; i < n; i++) for (let r = 0; r < rows; r++) {
    const cx = x0 + (i + 0.5) * s, cy = y0 + (r + 0.5) * rh, ang = Math.atan2(rh, s), len = Math.hypot(rh, s);
    for (const sg of [-1, 1]) kit.at({ x: cx, y: cy, z: z + 0.015 * sg, rz: sg * ang }, () => kit.box({ x: 0, y: -0.01, z: 0, w: len, h: 0.02, d: 0.012, mat, tint }));
  }
  kit.box({ x: (x0 + x1) / 2, y: y1 - 0.06, z, w: x1 - x0 + 0.1, h: 0.06, d: 0.06, mat, tint });
  kit.box({ x: (x0 + x1) / 2, y: y0, z, w: x1 - x0 + 0.1, h: 0.04, d: 0.06, mat, tint });
}
/** Burning oil drum (Poly Haven barrel + embers + scrap wood) with a baked warm glow; lit = false: cold, charred. */
function fireBarrel(kit, at, y, lit = true) {
  kit.prop('Barrel_01', { at, y, rot: kit.rnd(0, 6), collide: true, tint: '#7a6656' });
  kit.at({ x: at[0], y: y + 0.82, z: at[1] }, () => {
    if (lit) kit.cyl({ x: 0, y: 0, z: 0, r: 0.25, h: 0.02, seg: 10, mat: 'lamp_amber' });
    for (let i = 0; i < 5; i++) kit.box({ x: kit.rnd(-0.12, 0.12), y: 0.02, z: kit.rnd(-0.12, 0.12), w: 0.38, h: 0.04, d: 0.05, rot: kit.rnd(0, 3), rz: kit.rnd(-0.35, 0.35), mat: 'car_burnt', tint: '#2a2622' });
  });
  if (lit) kit.light({ pos: [at[0], y + 1.45, at[1]], color: '#ff9442', intensity: 7, range: 7.5, radius: 0.25, name: 'barrel_glow' });
  kit.decal({ at, size: 1.6, rot: kit.rnd(0, 3), mat: 'decal_stain', y, tint: '#4a3a32' });
  for (let i = 0; i < 3; i++) kit.at({ x: at[0] + kit.rnd(-1.0, 1.0), y: y + 0.02, z: at[1] + kit.rnd(-1.0, 1.0), rot: kit.rnd(0, 3) }, () => kit.box({ x: 0, y: 0, z: 0, w: kit.rnd(0.4, 0.9), h: 0.04, d: 0.1, mat: 'sz_wood', tint: '#5a4636' }));
}
/** Pedestal traffic signal (dead) at a corner: post + one head facing rot (local +z), a push-button box. */
function pedestalSignal(kit, at, rot) {
  kit.at({ x: at[0], y: SW, z: at[1], rot }, () => {
    kit.cyl({ x: 0, y: 0, z: 0, r: 0.07, r2: 0.06, h: 3.3, seg: 8, mat: 'steel', tint: '#6e706c', collide: true });
    kit.bbox({ x: 0, y: 2.25, z: 0.12, w: 0.34, h: 1.0, d: 0.26, bevel: 0.03, mat: 'paint_metal', tint: '#b89a2c' });
    for (let i = 0; i < 3; i++) {
      kit.cyl({ x: 0, y: 3.05 - i * 0.31, z: 0.26, r: 0.1, h: 0.02, seg: 10, mat: 'lamp_off', rx: PI / 2, tint: ['#5a2420', '#5a4a20', '#20452a'][i] });
      kit.box({ x: 0, y: 3.13 - i * 0.31, z: 0.32, w: 0.24, h: 0.02, d: 0.13, mat: 'paint_metal', tint: '#a88c26' });
    }
    kit.box({ x: 0, y: 1.05, z: 0.08, w: 0.12, h: 0.18, d: 0.08, mat: 'paint_metal', tint: '#c9a630' });
  });
}
/** Corner pole with two green street-name blades and a bus-stop / one-way plate. */
function streetNames(kit, at, a, b) {
  kit.at({ x: at[0], y: SW, z: at[1] }, () => {
    kit.cyl({ x: 0, y: 0, z: 0, r: 0.04, h: 3.5, seg: 8, mat: 'steel', tint: '#8a8c8a', collide: true });
    for (const [rot, y, [en, zh]] of [[0, 3.08, a], [PI / 2, 3.36, b]]) kit.at({ y, rot }, () => {
      kit.box({ x: 0, y: 0, z: 0, w: 1.3, h: 0.24, d: 0.02, mat: 'sign_white', tint: '#2f6a42' });
      for (const sd of [1, -1]) kit.at({ rot: sd > 0 ? 0 : PI }, () => textMixed(kit, [[en, { font: 'hwy', h: 0.1 }], [zh, { font: 'cjk', h: 0.12 }]], { x: 0, y: 0.065, z: 0.012, mat: 'sz_paint_white', gap: 0.08, maxW: 1.18 }));
    });
  });
}
/** Cobra-head street light (pole at the building line, arm over the curb). head: 'off' | 'lit' (emissive, no light). */
function cobraLamp(kit, at, rot, head, o = {}) {
  kit.streetLight({ at, rot, y: SW, h: 7.5, arm: o.arm ?? 2.2, on: false, tint: '#7d807f' });
  kit.at({ x: at[0], y: SW, z: at[1], rot }, () => {
    const h = 7.5, arm = o.arm ?? 2.2;
    if (head === 'lit') kit.face([[arm - 0.05, h - 0.124, 0.13], [arm + 0.55, h - 0.124, 0.13], [arm + 0.55, h - 0.124, -0.13], [arm - 0.05, h - 0.124, -0.13]].reverse(), 'lamp_warm');
    kit.box({ x: 0, y: 2.4, z: 0.11, w: 0.22, h: 0.32, d: 0.02, mat: 'sign_white', tint: '#d8d4ca' });
    textLine(kit, o.tag || 'S', { font: 'hwy', h: 0.08, x: 0, y: 2.5, z: 0.121, align: 'center', mat: 'sz_paint' });
    kit.at({ y: 3.2, rot: PI / 2 }, () => { kit.box({ x: 0, y: 0, z: 0.1, w: 0.36, h: 0.52, d: 0.015, mat: 'sign_white', tint: '#e2ded2' }); textLine(kit, 'NO', { font: 'hwy', h: 0.08, x: 0, y: 0.36, z: 0.11, align: 'center', mat: 'sz_paint_red' }); textLine(kit, 'PARKING', { font: 'hwy', h: 0.06, x: 0, y: 0.24, z: 0.11, align: 'center', mat: 'sz_paint_red' }); textLine(kit, 'ANY TIME', { font: 'hwy', h: 0.045, x: 0, y: 0.12, z: 0.11, align: 'center', mat: 'sz_paint' }); });
  });
}
/** Hand-lettered plywood sheet nailed over an opening (wall-local), optional spray mark. */
function plywood(kit, x0, x1, y0, y1, z, o = {}) {
  kit.at({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, z, rz: o.rz ?? kit.rnd(-0.02, 0.02) }, () => {
    kit.box({ x: 0, y: -(y1 - y0) / 2, z: 0.01, w: x1 - x0, h: y1 - y0, d: 0.018, mat: 'sz_wood', tint: o.tint || '#c4b292', uvOffset: [kit.rnd(0, 3), kit.rnd(0, 3)], faces: { nz: false } });
    if (o.mark) textLine(kit, o.mark, { font: 'sans', h: Math.min(0.36, (x1 - x0) / (o.mark.length * 0.85)), x: 0, y: -0.15, z: 0.021, align: 'center', mat: o.markMat || 'sz_paint_red', italic: 0.14, maxW: x1 - x0 - 0.1 });
  });
}

// ---------------------------------------------------------------------------------------------------- zone entry
export function build(kit, L) {
  street(kit, L);
  pawnShop(kit, L);
  avenueFlats(kit, L);
  grocery(kit, L);
  diner(kit, L);
  crossBlocks(kit, L);
  laneBlocks(kit, L);
  fills(kit);
  endWalls(kit);
  crossBarricades(kit, L);
  truckBarricade(kit, L);
  props(kit, L);
  canyonFill(kit);
  // NAV_RULES: barricade fences / crates are CLIMB (climbers scale them); the diner roof is never a nav island (SP_S_ROOF
  // zombies are placed on the nearest walkable cell = the sidewalk below the parapet)
  kit.nav('climb', rect(-31.0, 48, -29.4, 58), { y0: -0.5, y1: 2.8 });
  kit.nav('climb', rect(29.4, 48, 31.0, 58), { y0: -0.5, y1: 2.8 });
  kit.nav('climb', rect(-8, 67.5, 8, 71.1), { y0: -0.5, y1: 3.6 });
  kit.nav('block', DINER_POLY, { y0: 6, y1: 12 });
  kit.nav('block', [[-26, 26], [26, 26], [26, 40], [38, 40], [38, 84], [-38, 84], [-38, 40], [-26, 40]], { y0: 0.4, y1: 7.5 });
  return {};
}

/**
 * Baked bounce fill (never realtime, name 'fill'): the one-bounce bake misses the light thrown back and forth between
 * the facades of the street canyons (same idea as the other zones and the kit's interior fills).
 */
function canyonFill(kit) {
  // avenue (16 m wide, sun from the WSW reaches the diner side only)
  for (const z of [31, 39, 46]) kit.light({ pos: [0, 8.5, z], color: '#d6ccbb', intensity: 11, decay: 1, range: 22, radius: 2.0, name: 'fill' });
  for (const [x, z] of [[-5.6, 30.5], [5.6, 34.5], [-5.6, 42.5], [5.6, 46.0]]) kit.light({ pos: [x, 2.6, z], color: '#cfc8bb', intensity: 5.5, decay: 1, range: 13, radius: 1.2, name: 'fill' });
  // cross street (10 m between 15-25 m walls) + the pockets
  for (const x of [-24, -14, 14, 24]) kit.light({ pos: [x, 6.5, 53], color: '#d3cbbd', intensity: 14, decay: 1, range: 20, radius: 1.8, name: 'fill' });
  for (const [x, z] of [[-19, 51.0], [-9, 55.0], [9, 51.0], [19, 55.0]]) kit.light({ pos: [x, 2.4, z], color: '#ccc6ba', intensity: 6.5, decay: 1, range: 12, radius: 1.4, name: 'fill' });
  kit.light({ pos: [0, 7.5, 53], color: '#d6ccbb', intensity: 12, decay: 1, range: 22, radius: 2.0, name: 'fill' });
  for (const x of [-34, 34]) kit.light({ pos: [x, 4.5, 53], color: '#c9c8c0', intensity: 7, decay: 1, range: 12, radius: 1.2, name: 'fill' });
  // lane, the truck barricade and the HOTEL BELMONT vista
  for (const z of [61.5, 66.0]) kit.light({ pos: [0, 6.5, z], color: '#d3cbbd', intensity: 13, decay: 1, range: 18, radius: 1.8, name: 'fill' });
  for (const [x, z] of [[-4.5, 64.5], [4.5, 66.5]]) kit.light({ pos: [x, 2.4, z], color: '#ccc6ba', intensity: 6, decay: 1, range: 11, radius: 1.2, name: 'fill' });
  kit.light({ pos: [0, 5.0, 73.4], color: '#c9c8c0', intensity: 7, decay: 1, range: 11, radius: 1.2, name: 'fill' });
  kit.light({ pos: [0, 11.0, 70.0], color: '#d0cabe', intensity: 10, decay: 1, range: 16, radius: 2.0, name: 'fill' });
  kit.light({ pos: [14, 11.5, 43], color: '#d6d0c4', intensity: 8, decay: 1, range: 14, radius: 1.6, name: 'fill' });   // the diner's roof well
  kit.light({ pos: [6.4, 1.7, 29.6], color: '#cfc8bb', intensity: 3.0, decay: 1, range: 6, radius: 0.6, name: 'fill' });   // under the grocery awning
}

// ==================================================================================================== street
// Curb returns (radius 2) at the four inside corners of the avenue / cross street / lane crossing; the diner's rounded
// corner (radius 3, centre 11, 45) is followed by the north-east sidewalk.
const RR = 2.0;
const RET = {
  NW: arcPts([-5 - RR, 48], RR, 0, PI / 2),        // (-5, 48) -> (-7, 50)
  NE: arcPts([5 + RR, 48], RR, PI, PI / 2),         // (5, 48) -> (7, 50)
  SW: arcPts([-5 - RR, 58], RR, -PI / 2, 0),        // (-7, 56) -> (-5, 58)
  SE: arcPts([5 + RR, 58], RR, 1.5 * PI, PI),       // (7, 56) -> (5, 58)
};
const DR = 3.0;
const DINER_ARC = arcPts([8 + DR, 48 - DR], DR, PI / 2, PI, 6);   // (11, 48) -> (8, 45)
const DINER_POLY = [[8, 38], [24, 38], [24, 48], ...DINER_ARC];
const SLOT_W = [50.93, 51.57], SLOT_E = [54.43, 55.07], SLOT_T = [-4.07, -3.43];   // 0.64 m zombie slots (nav-cell centres 51.25 / 54.75 / -3.75)

function street(kit, L) {
  const road = [[-5, 26], ...RET.NW, [-38, 50], [-38, 56], ...RET.SW, [-5, 76], [5, 76], ...RET.SE.slice().reverse(), [38, 56], [38, 50], ...RET.NE.slice().reverse(), [5, 26]];
  kit.ground(road, { mat: 'asphalt_cracked' });
  // repaved strips in the smoother asphalt (6 mm proud): the first one ends the centre zone's strip (x -5..-0.2 at z 26)
  const over = (poly) => kit.ground(poly, { mat: 'asphalt', y: 0.006, collide: false, tint: '#d2d2d2' });
  over([[-5, 26], [-0.2, 26], [-0.35, 27.7], [-1.7, 28.5], [-3.5, 28.0], [-5, 28.6]]);
  over([[-26.5, 50], [-14.2, 50], [-14.6, 53.1], [-26.0, 53.4]]);
  over([[0.8, 62.4], [5, 62.4], [5, 66.9], [1.1, 66.6]]);
  over([[16.5, 53.0], [27.8, 52.8], [28.0, 56], [16.2, 56]]);
  // utility trenches and pothole repairs (dark asphalt)
  kit.patch([[-5, 41.3], [5, 40.9], [5, 41.8], [-5, 42.2]]);
  kit.patch([[19.6, 50], [20.4, 50], [20.7, 52.9], [19.9, 52.9]]);
  kit.patch([[-16.8, 54.1], [-14.9, 53.9], [-14.7, 55.6], [-16.6, 55.8]]);
  kit.patch([[-3.2, 71.4], [-1.0, 71.2], [-0.8, 73.3], [-3.0, 73.5]]);
  kit.patch([[1.6, 37.4], [3.1, 37.2], [3.3, 38.6], [1.8, 38.9]]);
  kit.patch([[-33.6, 51.0], [-31.4, 50.8], [-31.2, 52.6], [-33.4, 52.8]]);

  // ---- sidewalks: four L-shaped slabs round the crossing (0.3 m granite curb on the road side only)
  sidewalk(kit, [[-5, 26], ...RET.NW, [-38, 50]], [[-38, 48], [-8, 48], [-8, 26]]);
  sidewalk(kit, [[5, 26], ...RET.NE, [38, 50]], [[38, 48], ...DINER_ARC, [8, 26]]);
  sidewalk(kit, [[-38, 56], ...RET.SW, [-5, 76]], [[-8, 76], [-8, 58], [-38, 58]]);
  sidewalk(kit, [[38, 56], ...RET.SE, [5, 76]], [[8, 76], [8, 58], [38, 58]]);

  // ---- markings: centre dashes at world [9k, 9k + 3]; yellow edge lines 0.4 m off the curbs; crosswalks + stop lines
  for (const [a, b] of [[27, 30], [36, 39], [63, 66], [72, 75]]) kit.markLine([[0, a], [0, b]], { width: 0.12 });
  for (const [a, b] of [[-36, -33], [-27, -24], [-18, -15], [18, 21], [27, 30], [36, 38]]) kit.markLine([[a, 53], [b, 53]], { width: 0.12 });
  const yl = (a, b) => kit.markLine([a, b], { width: 0.12, mat: 'paint_yellow' });
  yl([-4.6, 26], [-4.6, 43.7]); yl([4.6, 26], [4.6, 43.7]);
  yl([-4.6, 62.5], [-4.6, 76]); yl([4.6, 62.5], [4.6, 76]);
  yl([-38, 50.4], [-12.0, 50.4]); yl([-38, 55.6], [-12.0, 55.6]);
  yl([12.0, 50.4], [38, 50.4]); yl([12.0, 55.6], [38, 55.6]);
  kit.crosswalk({ at: [0, 46.0], dir: PI / 2, across: 10, length: 3.5, stripe: 0.5, gap: 0.5 });
  kit.crosswalk({ at: [0, 60.2], dir: PI / 2, across: 10, length: 3.5, stripe: 0.5, gap: 0.5 });
  kit.crosswalk({ at: [-10.0, 53], dir: 0, across: 6, length: 3.0, stripe: 0.5, gap: 0.5 });
  kit.crosswalk({ at: [10.0, 53], dir: 0, across: 6, length: 3.0, stripe: 0.5, gap: 0.5 });
  kit.markLine([[-4.6, 43.9], [-0.15, 43.9]], { width: 0.45 });     // southbound avenue
  kit.markLine([[0.15, 62.3], [4.6, 62.3]], { width: 0.45 });       // northbound lane
  kit.markLine([[-11.85, 53.15], [-11.85, 55.6]], { width: 0.45 }); // eastbound cross street
  kit.markLine([[11.85, 50.4], [11.85, 52.85]], { width: 0.45 });   // westbound cross street
  // worn STOP + arrow painted in the northbound lane before the lane's stop line, BUS stop box by the shelter
  kit.at({ x: 2.4, y: 0.0085, z: 64.6, rx: -PI / 2, scale: [1, 2.4, 1] }, () => textLine(kit, 'STOP', { font: 'hwy', h: 0.62, x: 0, y: 0, z: 0, align: 'center', mat: 'paint_white', track: 0.12 }));
  kit.at({ x: -2.4, y: 0.0085, z: 39.2, rot: PI }, () => {
    kit.upFace([[-0.12, 0, 0], [0.12, 0, 0], [0.12, 0, -2.2], [-0.12, 0, -2.2]], 'paint_white', null, {});
    kit.upFace([[-0.45, 0, -2.2], [0.45, 0, -2.2], [0, 0, -3.1]], 'paint_white', null, {});
  });
  kit.at({ x: 2.6, y: 0.0085, z: 33.6, rx: -PI / 2, scale: [1, 2.0, 1] }, () => textLine(kit, 'BUS', { font: 'hwy', h: 0.5, x: 0, y: 0, z: 0, align: 'center', mat: 'paint_yellow', track: 0.12 }));

  // ---- hardware: MH_S opens for SP_S_MH (cover shoved aside, police tape + cones round it), plain covers, drains
  const ms = L.MANHOLES.find((m) => m.id === 'MH_S'), mx = L.MANHOLES.find((m) => m.id === 'MH_SX');
  kit.manhole([ms.x, ms.z], { r: 0.43, tint: '#4c4945', y: 0.001 });
  kit.manhole([ms.x, ms.z], { r: 0.34, tint: '#0d0c0b', y: 0.003 });
  manholeCover(kit, [ms.x + 0.48, ms.z - 0.28], 0.34, 0.035);
  kit.decal({ at: [ms.x, ms.z], size: [1.8, 1.4], rot: 0.4, mat: 'decal_stain' });
  manholeCover(kit, [mx.x, mx.z], 0.34);
  manholeCover(kit, [2.4, 40.4], 0.3);
  manholeCover(kit, [-22.5, 52.3], 0.32);
  manholeCover(kit, [-1.6, 64.6], 0.3);
  for (const z of [33.5, 45.2]) kit.drain([-4.77, z], PI / 2);
  for (const z of [29.5, 41.0]) kit.drain([4.77, z], PI / 2);
  for (const z of [64.5, 73.5]) { kit.drain([-4.77, z], PI / 2); kit.drain([4.77, z - 3], PI / 2); }
  for (const x of [-20.5, 15.5]) kit.drain([x, 50.23], 0);
  for (const x of [-24.5, 22.5]) kit.drain([x, 55.77], 0);

  // ---- grime: stains, cracks, oil, puddles in the gutters (SUP_S / SUP_SX crossings kept clean)
  const avoid = [[5.2, 31, 1.2], [0, 53, 1.4], [ms.x, ms.z, 0.8]];
  kit.scatterDecals(rect(-4.8, 26.5, 4.8, 43.5), { count: 12, avoid });
  kit.scatterDecals(rect(-37.5, 50.3, 37.5, 55.7), { count: 22, avoid });
  kit.scatterDecals(rect(-4.8, 62.5, 4.8, 75.5), { count: 9, avoid });
  for (const [x, z, r, s] of [[-4.4, 37.6, PI / 2, [2.6, 1.0]], [4.35, 27.4, PI / 2 + 0.1, [2.2, 0.9]], [4.4, 42.2, PI / 2, [3.0, 1.1]], [-20.4, 55.35, 0.05, [2.8, 1.0]],
    [12.8, 50.6, -0.06, [2.4, 0.9]], [27.0, 55.3, 0.1, [2.0, 0.9]], [-4.3, 66.0, PI / 2, [2.4, 1.0]], [1.4, 51.8, 0.8, [1.6, 1.1]], [-0.6, 33.8, 2.1, [1.4, 1.0]]]) kit.decal({ at: [x, z], size: s, rot: r, mat: 'decal_puddle' });
  const swDecals = { decal_stain: 2, decal_dirt: 3, decal_cracks: 1 };
  kit.scatterDecals(rect(-7.9, 26.2, -5.4, 47.8), { count: 7, y: SW, mats: swDecals, size: [0.6, 1.5] });
  kit.scatterDecals(rect(5.4, 26.2, 7.9, 47.8), { count: 7, y: SW, mats: swDecals, size: [0.6, 1.5], avoid: [[6.6, 29.2, 1.6], [6.4, 33, 2.0]] });
  kit.scatterDecals(rect(-37.5, 48.1, -7.5, 49.8), { count: 7, y: SW, mats: swDecals, size: [0.5, 1.3] });
  kit.scatterDecals(rect(7.5, 48.1, 37.5, 49.8), { count: 6, y: SW, mats: swDecals, size: [0.5, 1.3] });
  kit.scatterDecals(rect(-37.5, 56.2, -7.5, 57.9), { count: 7, y: SW, mats: swDecals, size: [0.5, 1.3] });
  kit.scatterDecals(rect(7.5, 56.2, 37.5, 57.9), { count: 7, y: SW, mats: swDecals, size: [0.5, 1.3] });
  // litter along the gutters
  kit.debris([-4.5, 31.5], { r: 1.0, count: 6, kinds: ['paper', 'paper', 'brick'] });
  kit.debris([4.4, 44.6], { r: 1.0, count: 6, kinds: ['paper', 'paper', 'plank'] });
  kit.debris([-13.5, 50.6], { r: 1.1, count: 6, kinds: ['paper', 'paper', 'brick'] });
  kit.debris([22.0, 55.4], { r: 1.1, count: 6, kinds: ['paper', 'paper', 'plank'] });
  kit.debris([1.5, 56.4], { r: 2.0, count: 9, kinds: ['paper', 'paper', 'paper', 'plank'] });
  kit.debris([-2.2, 63.0], { r: 1.4, count: 7, kinds: ['paper', 'brick', 'paper'] });
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

// ==================================================================================================== avenue, west side
function pawnShop(kit, L) {
  // ---------------- S_W1 pawn shop (brick_commercial, 5F): blue cast-iron front, PAWN · LOANS 當舖 on a navy board,
  // red/white awning, three gilt balls on a bracket, scissor gate over the display window, bill posters over the
  // shuttered half (reference: blue shopfront with layered posters next to a red/white awning)
  const BRICK = '#d6b4a2', STONE = '#d9cdb8', BLUE = '#4a6c9a', GOLD = '#d9b35c';
  block(kit, {
    id: 'S_W1', x0: -24, x1: -8, z0: 26, z1: 38, floors: F(4.5, 5), parapet: 0.8,
    mat: 'brick_red', tint: BRICK, trim: 'trim_stone', trimTint: STONE, cornice: { kind: 'metal', mat: 'trim_metal', tint: '#4a463f', bracket: 1.0 },
    win: { w: 1.2, h: 1.9, sill: 0.9, lintel: 'trim_stone', ac: 0.12 },
    faces: [{
      side: 'E', cols: [1.5, 4.5, 7.5, 10.5], pipes: [11.8], lit: [[3, 2]],
      mod: (f, k, op) => {
        if (f === 1 && (k === 1 || k === 2)) { op.state = 'glass'; op.ac = false; op.letter = k === 1 ? 'LOANS' : 'GOLD'; }
        if (f === 1 && k === 0) op.state = 'boarded';
        return op;
      },
      ground: () => [
        { x: 0.3, w: 1.1, y: BY + 0.02, h: 2.6, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#3a3f46', window: true, frame: 'sign_blue', step: false },
        { x: 1.9, w: 3.3, y: BY + 0.02, h: 3.0, type: 'shop', state: 'glass', frame: 'sign_blue', kick: 'sign_blue', mullions: [2, 1], room: 1.6, roomTint: '#5a4e44' },
        { x: 5.45, w: 1.25, y: BY + 0.02, h: 2.75, type: 'door', state: 'closed', door: 'frame_dark', doorTint: '#2c3440', window: true, frame: 'sign_blue', step: false },
        { x: 6.95, w: 3.5, y: BY + 0.02, h: 3.0, type: 'shop', state: 'shutter', frame: 'sign_blue', kick: 'sign_blue', shutterTint: '#7d8288' },
        { x: 10.75, w: 0.95, y: BY + 1.0, h: 1.9, type: 'window', state: 'boarded', frame: 'frame_dark' },
      ],
      decor: (e, ops) => {
        // cast-iron piers + entablature, painted blue
        for (const x of [0.15, 1.65, 5.33, 6.83, 10.6, 11.85]) kit.box({ x, y: BY, z: 0.05, w: 0.22, h: 3.25, d: 0.1, mat: 'sign_blue', tint: BLUE, faces: { nz: false, bottom: false } });
        for (const x of [1.65, 5.33, 6.83, 10.6]) kit.box({ x, y: BY + 2.6, z: 0.11, w: 0.3, h: 0.22, d: 0.06, mat: 'sign_blue', tint: shadeHex(BLUE, 0.85), faces: { nz: false } });
        kit.box({ x: 6.0, y: BY + 3.05, z: 0.06, w: 12.0, h: 0.25, d: 0.12, mat: 'sign_blue', tint: shadeHex(BLUE, 0.9), faces: { nz: false } });
        // fascia: navy board, gilt PAWN · LOANS + white 當舖, strap line
        const zf = board(kit, 0.2, 11.8, BY + 3.3, 0.95, { mat: 'sign_white', tint: '#22324f', border: { mat: 'sign_white', tint: GOLD, w: 0.035 } });
        textMixed(kit, [['PAWN · LOANS', { font: 'serif', h: 0.44, mat: 'sz_paint_yellow', tint: '#f0d8a0' }], ['當舖', { font: 'cjk', h: 0.52, mat: 'sz_paint_white' }]], { x: 6.0, y: BY + 3.6, z: zf, gap: 0.5, maxW: 10.8 });
        textLine(kit, 'DIAMONDS · GOLD · GUITARS · CASH LOANS', { font: 'sans', h: 0.085, x: 6.0, y: BY + 3.43, z: zf, align: 'center', mat: 'sz_paint_white', maxW: 9 });
        stripedAwning(kit, { x0: 2.4, x1: 10.0, y: BY + 3.28, depth: 1.3, drop: 0.6, valance: 0.28, colors: ['#ad2a20', '#efebe2'], torn: [14], hang: [14] });
        // display window: scissor gate in front, guitars / a radio / a trumpet / a TV behind the glass, WE BUY GOLD card
        scissorGate(kit, 1.95, 5.15, BY + 0.04, BY + 3.0, 0.07);
        kit.box({ x: 3.55, y: BY + 0.38, z: -0.75, w: 3.2, h: 0.04, d: 0.9, mat: 'sz_wood', tint: '#5d4636' });
        for (const [x, rz, t] of [[2.5, 0.08, '#8a4a22'], [3.1, -0.05, '#c9a060'], [4.7, 0.1, '#2a2a2a']]) kit.at({ x, y: BY + 0.42, z: -0.95, rz }, () => {
          kit.bbox({ x: 0, y: 0, z: 0, w: 0.38, h: 0.5, d: 0.1, bevel: 0.05, mat: 'sz_wood', tint: t });
          kit.box({ x: 0, y: 0.5, z: 0, w: 0.05, h: 0.62, d: 0.04, mat: 'sz_wood', tint: '#3a2a20' });
          kit.box({ x: 0, y: 1.1, z: 0, w: 0.08, h: 0.16, d: 0.05, mat: 'sz_wood', tint: '#2a1c14' });
        });
        kit.bbox({ x: 3.8, y: BY + 0.42, z: -0.7, w: 0.55, h: 0.42, d: 0.4, bevel: 0.03, mat: 'car_plastic', tint: '#4a3e34' });
        kit.cyl({ x: 4.6, y: BY + 0.42, z: -1.0, r: 0.012, h: 0.38, seg: 5, mat: 'steel_dark' }); kit.cyl({ x: 4.6, y: BY + 0.78, z: -1.0, r: 0.13, r2: 0.05, h: 0.12, seg: 8, mat: 'sz_paint_green' }); kit.cyl({ x: 4.6, y: BY + 0.77, z: -1.0, r: 0.05, h: 0.01, seg: 8, mat: 'lamp_warm' });
        kit.light({ pos: [4.4, BY + 0.7, -0.9], color: '#ffb468', intensity: 2.6, decay: 1.5, range: 3.6, radius: 0.08, name: 'shop' });
        kit.face([[3.58, BY + 0.5, -0.495], [4.02, BY + 0.5, -0.495], [4.02, BY + 0.78, -0.495], [3.58, BY + 0.78, -0.495]], 'glass_dirty');
        kit.at({ x: 3.2, y: BY + 1.5, z: -0.6, rz: 0.4 }, () => kit.cyl({ x: 0, y: 0, z: 0, r: 0.05, r2: 0.13, h: 0.5, seg: 8, mat: 'car_chrome', tint: '#c9a24a' }));
        for (let i = 0; i < 4; i++) kit.box({ x: 2.2 + i * 0.75, y: BY + 1.95 + (i % 2) * 0.12, z: -0.65, w: 0.22, h: 0.12, d: 0.03, mat: 'car_chrome', tint: '#d8b868' });
        const gp = ops.find((o) => o.type === 'shop' && o.state === 'glass');
        poster(kit, gp.x + 0.35, BY + 2.1, 0.9, 0.62, -0.185, { tint: '#f0d65a', head: 'WE BUY GOLD', headMat: 'sz_paint_red', rz: -0.03 });
        poster(kit, gp.x + 2.0, BY + 2.25, 0.7, 0.5, -0.185, { tint: '#e6e2d8', head: 'CASH', headMat: 'sz_paint', rz: 0.04 });
        // shuttered half: layered bill posters, POST NO BILLS stencil, a tag
        posterWall(kit, 7.05, 10.35, BY + 0.45, BY + 2.95, -0.045, 14, ['MISSING', 'LOST', 'JAZZ', 'RALLY', 'EVACUATE', 'SHOW', null, null]);
        textLine(kit, 'POST NO BILLS', { font: 'sans', h: 0.1, x: 8.7, y: BY + 3.12, z: 0.125, align: 'center', mat: 'sz_paint_white' });
        textLine(kit, 'NO', { font: 'sans', h: 0.34, x: 10.2, y: BY + 0.6, z: 0.03, align: 'center', mat: 'sz_paint_red', italic: 0.2 });
        // three gilt balls hanging from a wrought-iron bracket over the apartment door
        kit.sweep(circle(0.022, 6), [[11.3, BY + 5.0, 0.02], [11.3, BY + 5.0, 0.95], [11.3, BY + 5.25, 0.95]], 'steel_dark', { smooth: false, up: [1, 0, 0] });
        kit.sweep(circle(0.014, 5), [[11.3, BY + 5.4, 0.02], [11.3, BY + 5.05, 0.7]], 'steel_dark', { smooth: true, up: [1, 0, 0] });
        for (const [dx, dz, dy] of [[-0.22, 0.95, 0], [0.22, 0.95, 0], [0, 0.95, -0.36]]) {
          kit.cyl({ x: 11.3 + dx * 0.6, y: BY + 4.62 + dy, z: dz, r: 0.008, h: 0.38 - dy, seg: 4, mat: 'steel_dark' });
          sphere(kit, 11.3 + dx, BY + 4.5 + dy, dz, 0.15, 'car_chrome', '#d6b05a');
        }
        // the apartment door: number, buzzer plate, dead lamp; graffiti + a search mark on the pier
        kit.wallLamp({ x: 0.85, y: BY + 3.0, on: false });
        textLine(kit, '1216', { font: 'serif', h: 0.13, x: 0.85, y: BY + 2.68, z: 0.02, align: 'center', mat: 'sz_paint_white' });
        kit.box({ x: 1.53, y: BY + 1.25, z: 0.11, w: 0.1, h: 0.22, d: 0.02, mat: 'steel', tint: '#a8a49a' });
        searchMark(kit, 0.85, BY + 1.5, 0.55, 'sz_paint_red', '10-01');
        // painted gilt lettering on the 2F office windows
        for (const op of ops.filter((o) => o.letter)) textLine(kit, op.letter, { font: 'serif', h: 0.3, x: op.cx, y: op.y + 0.8, z: -0.18, align: 'center', mat: 'sz_paint_yellow', tint: '#f0d8a0', maxW: op.w - 0.18 });
        for (const op of ops.filter((o) => o.type === 'window' && o.y > 4)) hood(kit, op, 'key', 'trim_stone', STONE);
        streaks(kit, 0.2, 11.8, BY + 18.0, 8, 0.004, [1.2, 3.0]);
      },
    }],
    extra: (ctx) => {
      for (const [x, z, h] of [[-12.5, 30.5, 3.8], [-20.5, 35.2, 2.6]]) {
        kit.cyl({ x, y: ctx.top, z, r: 0.03, h, seg: 5, mat: 'steel', tint: '#7e7f7c' });
        for (let i = 1; i < 4; i++) kit.box({ x, y: ctx.top + h * (0.55 + i * 0.12), z, w: 1.0 - i * 0.2, h: 0.02, d: 0.02, mat: 'steel_dark' });
      }
    },
  });
}

function avenueFlats(kit, L) {
  // ---------------- S_W2 South Avenue flats (brick_dark, 7F): CHECKS CASHED + a shuttered shop under a black fire
  // escape (avenue face, z 39..45), the 2F spawn window SP_S_WIN (z 42); TAVERN + garage on the cross-street face
  const DARK = '#c7b6aa';
  block(kit, {
    id: 'S_W2', x0: -24, x1: -8, z0: 38, z1: 48, floors: F(4.5, 7), parapet: 0.9,
    mat: 'brick_dark', tint: DARK, groundMat: 'concrete_wall', groundTint: '#b9b0a2', trim: 'trim_stone', trimTint: '#b6ad9e',
    cornice: { kind: 'simple', mat: 'trim_concrete', tint: '#9c968a' }, plinthMat: 'concrete_dirty', plinthTint: '#625e58',
    win: { w: 1.1, h: 1.7, sill: 0.9, lintel: 'trim_stone', states: WIN_STATES_POOR, ac: 0.16 },
    faces: [
      {
        side: 'E', cols: [1.5, 3.8, 6.0, 8.2], pipes: [9.8], lit: [[5, 0]],
        mod: (f, k, op) => {
          if (k >= 1) { op.ac = false; op.streak = false; }   // behind the fire escape
          if (f === 1 && k === 2) { op.state = 'broken'; op.spawn = true; op.room = 1.6; }   // SP_S_WIN (z 42)
          return op;
        },
        ground: () => [
          { x: 0.35, w: 3.3, y: BY + 0.02, h: 3.0, type: 'shop', state: 'dark', frame: 'sign_yellow', kick: 'sign_yellow', mullions: [2, 1], room: 1.6 },
          { x: 4.25, w: 1.15, y: BY + 0.02, h: 2.6, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#3b4a3e', window: true, step: false },
          { x: 5.9, w: 3.7, y: BY + 0.02, h: 3.0, type: 'shop', state: 'shutter', frame: 'frame_dark', shutterTint: '#8f948c' },
        ],
        decor: (e, ops, ctx) => {
          const zf = board(kit, 0.25, 3.75, BY + 3.25, 0.82, { mat: 'sign_white', tint: '#e2b93b', border: { mat: 'sign_white', tint: '#1d1d1b', w: 0.03 } });
          textLine(kit, 'CHECKS CASHED', { font: 'hwy', h: 0.3, x: 2.0, y: BY + 3.62, z: zf, align: 'center', mat: 'sz_paint', maxW: 3.2 });
          textLine(kit, 'MONEY ORDERS · LOANS', { font: 'hwy', h: 0.11, x: 2.0, y: BY + 3.38, z: zf, align: 'center', mat: 'sz_paint_red', maxW: 3.2 });
          posterWall(kit, 0.5, 3.5, BY + 0.6, BY + 2.6, -0.17, 5, ['$$ FAST', 'NO ID', null]);
          posterWall(kit, 6.0, 9.5, BY + 0.5, BY + 2.9, -0.045, 10, ['EVACUATE', 'MISSING', 'CURFEW', null, null]);
          searchMark(kit, 7.7, BY + 1.9, 0.8, 'sz_paint_red', '10-02');
          kit.wallLamp({ x: 4.85, y: BY + 2.95, on: true, intensity: 3.0, range: 6, color: '#ffc58a' });
          textLine(kit, '1220', { font: 'serif', h: 0.14, x: 4.85, y: BY + 2.68, z: 0.02, align: 'center', mat: 'sz_paint_white' });
          // black iron fire escape 2F-7F (layout z 39..45) over the spawn window; curtain blowing out, shards below
          fireEscape(kit, { x: 6.0, floors: 7, bases: ctx.bases, width: 5.6 });
          const sp = ops.find((op) => op.spawn);
          kit.at({ x: sp.cx + 0.45, y: sp.y + 0.1, z: 0.1, rz: 0.5 }, () => kit.box({ x: 0, y: 0, z: 0, w: 0.05, h: 1.2, d: 0.05, mat: 'frame_dark' }));
          kit.face([[sp.cx - 0.5, sp.y + 1.55, -0.05], [sp.cx + 0.05, sp.y + 1.55, -0.05], [sp.cx + 0.2, sp.y + 0.3, 0.55], [sp.cx - 0.4, sp.y + 0.1, 0.42]], 'sz_fabric', { tint: '#a39780' });
          for (let i = 0; i < 14; i++) { const x = kit.rnd(4.5, 7.5), z = kit.rnd(0.2, 1.6), s = kit.rnd(0.05, 0.14); kit.upFace([[x, SW + 0.004, z], [x + s, SW + 0.004, z + kit.rnd(-0.05, 0.05)], [x + s * 0.4, SW + 0.004, z + s]], 'glass_dirty', null, {}); }
          streaks(kit, 0.2, 9.8, BY + 24.8, 8, 0.004, [1.5, 3.5]);
        },
      },
      {
        side: 'S', cols: [2.0, 5.0, 8.0, 11.0, 14.0], pipes: [0.25], lit: [[3, 3]],
        ground: () => [
          { x: 0.6, w: 3.6, y: BY + 0.02, h: 3.2, type: 'garage', shutter: 1, shutterTint: '#7f8a84' },
          { x: 4.8, w: 1.1, y: BY + 0.02, h: 2.3, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#59605a', step: false },
          { x: 6.6, w: 3.6, y: BY + 0.02, h: 3.0, type: 'shop', state: 'boarded', frame: 'frame_dark' },
          { x: 11.0, w: 4.4, y: BY + 0.02, h: 3.0, type: 'shop', state: 'dark', frame: 'sign_red', kick: 'sign_red', mullions: [3, 1], room: 1.6, roomTint: '#3a3430' },
        ],
        decor: () => {
          posterWall(kit, 0.7, 4.1, BY + 0.6, BY + 2.9, 0.02, 6, ['QUARANTINE', 'MISSING', null]);
          textLine(kit, 'NO PARKING', { font: 'sans', h: 0.2, x: 2.4, y: BY + 1.3, z: 0.03, align: 'center', mat: 'sz_paint_white' });
          posterWall(kit, 6.7, 10.1, BY + 0.6, BY + 2.8, 0.06, 6, ['LOST', 'EVACUATE', 'CURFEW', null]);
          // TAVERN: dark red board, dead BEER neon behind the glass
          const zf = board(kit, 10.85, 15.55, BY + 3.25, 0.82, { mat: 'sign_white', tint: '#5a1f1a', border: { mat: 'sign_white', tint: '#d6b45a', w: 0.03 } });
          textLine(kit, "MURPHY'S TAVERN", { font: 'serif', h: 0.36, x: 13.2, y: BY + 3.48, z: zf, align: 'center', mat: 'sz_paint_white', maxW: 4.4 });
          neonText(kit, 'BEER', { font: 'hwy', h: 0.3, x: 12.0, y: BY + 2.05, z: -0.3, align: 'center', r: 0.014, mat: 'lamp_red' });   // the one tube still lit
          kit.light({ pos: [12.0, BY + 2.2, -0.15], color: '#ff5a40', intensity: 2.2, decay: 1.5, range: 4.5, radius: 0.2, name: 'neon' });
          neonText(kit, 'OPEN', { font: 'hwy', h: 0.22, x: 14.3, y: BY + 2.15, z: -0.3, align: 'center', r: 0.012 });
          kit.wallLamp({ x: 5.35, y: BY + 2.75, on: false });
          searchMark(kit, 8.4, BY + 1.7, 0.75, 'sz_paint_red', '10-02');
          streaks(kit, 0.2, 15.8, BY + 24.8, 10, 0.004, [1.5, 3.5]);
        },
      },
      { side: 'N', from: BY + 18.1, cols: [2.5, 6.0, 9.5, 13.5], belts: false, plinth: false },
      { side: 'W', span: [40, 48], from: BY + 14.7, cols: [2.0, 6.0], belts: false, plinth: false },
      { side: 'W', span: [38, 40], from: BY + 21.5, cols: [], belts: false, plinth: false },
    ],
    extra: (ctx) => waterTank(kit, [-17.5, 43.2], ctx.top + 0.02, 1.5, 3.0),
  });
}

// ==================================================================================================== avenue, east side
function grocery(kit, L) {
  // ---------------- S_E1 grocery (stone_office, 6F): Chicago windows between pilasters, granite ground floor, green
  // shopfront with a red/white awning, GROCERY 雜貨, produce stand S_PRODUCE on the sidewalk (hidden propane, see props)
  const STONE = '#c8bca4', TRIM_T = '#ddd3bd';
  block(kit, {
    id: 'S_E1', x0: 8, x1: 24, z0: 26, z1: 38, floors: F(4.5, 6), parapet: 0.9,
    mat: 'concrete_wall', tint: STONE, groundMat: 'concrete_wall', groundTint: '#7b736a', trim: 'trim_stone', trimTint: TRIM_T,
    cornice: { kind: 'stone', mat: 'trim_stone', tint: '#d5cab2' }, plinthMat: 'concrete_dirty', plinthTint: '#4c4844', plinthH: 0.55,
    win: { w: 2.6, h: 1.8, sill: 0.8, mullions: [3, 1], frame: 'frame_dark', ac: 0.08 },
    faces: [
      {
        side: 'W', cols: [2.2, 6.0, 9.8], pilasters: [0.25, 4.1, 7.9, 11.75], pilW: 0.5, lit: [[3, 1]],
        ground: () => [
          { x: 0.55, w: 4.1, y: BY + 0.02, h: 3.1, type: 'shop', state: 'glass', frame: 'sign_green', kick: 'sign_green', mullions: [2, 1], room: 2.2, roomTint: '#6a6458' },
          { x: 4.95, w: 1.5, y: BY + 0.02, h: 2.8, type: 'door', state: 'closed', door: 'frame_dark', doorTint: '#2e3a30', window: true, frame: 'sign_green', step: false },
          { x: 6.75, w: 4.1, y: BY + 0.02, h: 3.1, type: 'shop', state: 'broken', frame: 'sign_green', kick: 'sign_green', room: 2.2, roomTint: '#6a6458' },
          { x: 11.1, w: 0.75, y: BY + 0.02, h: 2.5, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#4a4f48', step: false },
        ],
        decor: (e, ops) => {
          const zf = board(kit, 0.4, 11.6, BY + 3.32, 0.95, { mat: 'sign_white', tint: '#ebe3cb', border: { mat: 'sign_white', tint: '#3d6e46', w: 0.04 } });
          textMixed(kit, [['GROCERY', { font: 'slab', h: 0.48, mat: 'sz_paint_green' }], ['雜貨', { font: 'cjk', h: 0.55, mat: 'sz_paint_red' }]], { x: 6.0, y: BY + 3.62, z: zf, gap: 0.5, maxW: 10.6 });
          textLine(kit, 'FRUIT · VEGETABLES · MEATS · DAIRY', { font: 'sans', h: 0.09, x: 6.0, y: BY + 3.43, z: zf, align: 'center', mat: 'sz_paint_green', maxW: 9 });
          stripedAwning(kit, { x0: 0.9, x1: 11.1, y: BY + 3.3, depth: 1.6, drop: 0.62, valance: 0.28, colors: ['#ad2a20', '#efebe2'], torn: [9, 10, 22], hang: [10] });
          // hand-lettered specials on the glass, CLOSED card + chain on the door
          const gp = ops.find((o) => o.type === 'shop' && o.state === 'glass');
          for (const [i, head, tint] of [[0, 'APPLES', '#e8d6a6'], [1, 'FRESH MILK', '#d6e2e8'], [2, 'EGGS', '#efe7d0']]) poster(kit, gp.x + 0.3 + i * 1.25, BY + 1.75 + (i % 2) * 0.2, 0.95, 0.75, -0.17, { tint, head, headMat: 'sz_paint_red', rz: kit.rnd(-0.05, 0.05) });
          kit.face([[gp.x + 0.4, BY + 2.95, -0.9], [gp.x + gp.w - 0.4, BY + 2.95, -0.9], [gp.x + gp.w - 0.4, BY + 2.95, -0.7], [gp.x + 0.4, BY + 2.95, -0.7]], 'lamp_cold');
          kit.light({ pos: [gp.x + gp.w / 2, BY + 2.6, -0.9], color: '#d8ecff', intensity: 3.0, decay: 1.5, range: 4.5, radius: 0.3, name: 'shop' });
          kit.at({ x: 5.7, y: BY + 1.7, z: 0.04, rz: -0.1 }, () => { kit.box({ x: 0, y: 0, z: 0, w: 0.4, h: 0.16, d: 0.01, mat: 'sign_white', tint: '#f0e8d8' }); textLine(kit, 'CLOSED', { font: 'sans', h: 0.08, x: 0, y: 0.04, z: 0.006, align: 'center', mat: 'sz_paint_red' }); });
          for (let i = 0; i <= 8; i++) kit.at({ x: 5.35 + i * 0.09, y: BY + 1.12 - Math.sin((i / 8) * PI) * 0.1, z: 0.05, rz: i % 2 ? PI / 2 : 0 }, () => kit.box({ x: 0, y: -0.018, z: 0, w: 0.05, h: 0.036, d: 0.012, mat: 'steel', tint: '#7d7a72' }));
          // inside the smashed window: empty produce shelves, spilled crates, the cold glow of a dairy case
          const bp = ops.find((o) => o.type === 'shop' && o.state === 'broken');
          for (const [x, h] of [[bp.x + 0.9, 1.5], [bp.x + 2.6, 1.3]]) kit.box({ x, y: BY + 0.02, z: -1.45, w: 1.4, h, d: 0.5, mat: 'sz_wood', tint: '#6d5a48' });
          for (let i = 0; i < 8; i++) kit.box({ x: kit.rnd(bp.x + 0.3, bp.x + 3.8), y: BY + 0.02 + kit.pick([0, 0, 0.5]), z: kit.rnd(-1.3, -0.4), rot: kit.rnd(0, 3), w: 0.5, h: 0.28, d: 0.36, mat: 'sz_wood', tint: kit.pick(['#a68a62', '#8f7454']) });
          kit.box({ x: bp.x + 2.0, y: BY + 0.6, z: -2.12, w: 3.4, h: 1.5, d: 0.12, mat: 'car_plastic', tint: '#2c3234' });
          kit.face([[bp.x + 0.45, BY + 0.75, -2.05], [bp.x + 3.55, BY + 0.75, -2.05], [bp.x + 3.55, BY + 1.95, -2.05], [bp.x + 0.45, BY + 1.95, -2.05]], 'interior_hidden', { tint: '#6a7a80', shade: 0.6 });
          kit.face([[bp.x + 0.45, BY + 0.75, -2.0], [bp.x + 3.55, BY + 0.75, -2.0], [bp.x + 3.55, BY + 1.95, -2.0], [bp.x + 0.45, BY + 1.95, -2.0]], 'glass_dirty');
          kit.face([[bp.x + 0.5, BY + 1.98, -2.0], [bp.x + 3.5, BY + 1.98, -2.0], [bp.x + 3.5, BY + 2.02, -2.0], [bp.x + 0.5, BY + 2.02, -2.0]], 'lamp_cold');
          kit.light({ pos: [bp.x + 2.0, BY + 1.6, -1.5], color: '#cfe4ff', intensity: 1.8, decay: 1.5, range: 4.0, radius: 0.3, name: 'shop' });
          for (let i = 0; i < 18; i++) { const x = kit.rnd(bp.x, bp.x + 4.1), z = kit.rnd(0.2, 1.5), s = kit.rnd(0.05, 0.15); kit.upFace([[x, SW + 0.004, z], [x + s, SW + 0.004, z + kit.rnd(-0.05, 0.05)], [x + s * 0.4, SW + 0.004, z + s]], 'glass_dirty', null, {}); }
          kit.wallLamp({ x: 11.48, y: BY + 2.85, on: false });
          streaks(kit, 0.2, 11.8, BY + 21.4, 7, 0.004, [1.5, 3.5]);
        },
      },
      {
        // light-well wall over the diner (seen from the cross street and the lane)
        side: 'S', from: BY + 7.9, cols: [2.0, 5.5, 9.0, 12.5], win: { w: 1.2, h: 1.6, sill: 0.9, mullions: [1, 2], states: WIN_STATES_POOR, ac: 0.1 }, belts: false, plinth: false,
        decor: () => streaks(kit, 0.2, 15.8, BY + 21.3, 9, 0.004, [1.5, 4.0]),
      },
      { side: 'E', from: BY + 16.8, cols: [], belts: false, plinth: false },
    ],
  });
}

// ==================================================================================================== S_E2 SILVER STAR DINER
// Moderne diner, 2 storeys (roof 7.9 m): cream stucco over teal enamel skirt panels, a ribbon of steel-framed windows
// wrapping the rounded corner (radius 3), fluted stainless bands, the corner double door, sign bands (script "Silver
// Star" with dead neon on the avenue, SILVER STAR DINER 銀星餐館 on the cross street), offices above. Behind the glass:
// a 3 m strip of the room (checker floor, counter + stools along the avenue, red vinyl booths along the cross street).
// Roof: the dead DINER channel-letter frame facing the avenue (layout y 8.8..10.6), HVAC, kitchen exhaust, hatch.
function diner(kit, L) {
  const g1 = BY + 4.5, top = BY + 7.9, WALLC = '#d8cebb', ENAMEL = '#3d6b74', STEEL = '#c9cccd', RED = '#b03a30';
  const run = [[8, 38], ...DINER_ARC.slice().reverse(), [24, 48]];
  const segs = [];
  for (let i = 0; i < run.length - 1; i++) segs.push({ a: run[i], b: run[i + 1], L: Math.hypot(run[i + 1][0] - run[i][0], run[i + 1][1] - run[i][1]), k: i });
  const DOOR = new Set([3, 4]);
  const paneState = () => wpick(kit, { broken: 0.42, glass: 0.24, boarded: 0.14, dark: 0.2 });
  for (const s of segs) {
    const opsG = [], opsU = [];
    if (DOOR.has(s.k)) opsG.push({ x: 0.05, w: s.L - 0.1, y: 0.02, h: 2.7, type: 'door', state: 'closed', door: 'glass_dirty', frame: 'frame_white', step: false });
    else {
      const n = Math.max(1, Math.round((s.L - 0.3) / 1.25)), pw = (s.L - 0.3) / n;
      for (let i = 0; i < n; i++) opsG.push({ x: 0.15 + i * pw + 0.04, w: pw - 0.08, y: 1.0, h: 1.95, type: 'window', state: paneState(), frame: 'frame_white', sill: false, mullions: [1, 1], streak: false });
    }
    const upper = s.k === 0 ? [1.5, 3.6, 5.6] : s.k === segs.length - 1 ? [1.6, 4.1, 6.6, 9.1, 11.6] : [];
    for (const cx of upper) opsU.push({ cx, w: 1.3, y: 0.95, h: 1.25, type: 'window', state: wpick(kit, WIN_STATES_POOR), frame: 'frame_white', sillMat: 'steel', roomTint: '#4a4540', streak: kit.chance(0.5), mullions: [2, 1] });
    kit.wall({ a: s.a, b: s.b, y0: BY, h: 4.5, t: 0.3, mat: 'plaster', tint: WALLC, openings: opsG, inner: 'interior_wall', innerTint: '#d9cdb5', interior: true, room: 0, collide: false, grime: { y: BY, h: 1.4, k: 0.35 } });
    kit.wall({ a: s.a, b: s.b, y0: g1, h: 3.4, t: 0.3, mat: 'plaster', tint: WALLC, openings: opsU, room: 0.9, collide: false, grime: null });
    kit.at(edgeFrame(s.a, s.b), () => {
      const Ls = s.L, door = DOOR.has(s.k);
      const band = (y, h, d, mat, tint) => kit.box({ x: Ls / 2, y, z: d / 2, w: Ls + 0.012, h, d, mat, tint, faces: { nz: false } });
      if (!door) { band(BY, 0.95, 0.04, 'paint_metal', ENAMEL); band(BY + 0.93, 0.09, 0.09, 'steel', STEEL); }
      band(BY + 2.95, 0.14, 0.08, 'steel', STEEL);
      band(BY + 3.12, 1.0, 0.07, 'paint_metal', '#e9e4d6');
      for (const y of [BY + 3.15, BY + 3.22, BY + 4.0, BY + 4.07]) band(y, 0.035, 0.085, 'steel', STEEL);
      band(BY + 4.18, 0.14, 0.1, 'steel', STEEL);
      band(g1 + 2.32, 0.08, 0.06, 'steel', STEEL);
      // plywood half-sheets nailed over some smashed panes ("boarded at sill height"), shards on the sidewalk
      for (const op of opsG.filter((o) => o.state === 'broken')) {
        if (kit.chance(0.45)) plywood(kit, op.x - 0.02, op.x + op.w + 0.02, BY + 0.98, BY + 1.85 + kit.rnd(0, 0.35), 0.03, { tint: kit.pick(['#c9b48e', '#b8a47e', '#d2c09c']), mark: kit.chance(0.3) ? kit.pick(['KEEP OUT', 'CLOSED']) : null });
        for (let i = 0; i < 4; i++) { const x = kit.rnd(op.x, op.x + op.w), z = kit.rnd(0.2, 1.1), sz = kit.rnd(0.04, 0.12); kit.upFace([[x, SW + 0.004, z], [x + sz, SW + 0.004, z + kit.rnd(-0.04, 0.04)], [x + sz * 0.4, SW + 0.004, z + sz]], 'glass_dirty', null, {}); }
      }
      if (s.k === 0) {
        textLine(kit, 'Silver Star', { font: 'script', h: 0.6, x: Ls / 2, y: BY + 3.42, z: 0.072, align: 'center', mat: 'sz_paint_red', tint: RED, maxW: Ls - 0.6 });
        neonText(kit, 'Silver Star', { font: 'script', h: 0.6, x: Ls / 2, y: BY + 3.42, z: 0.11, align: 'center', maxW: Ls - 0.6, r: 0.014 });
        for (const x of [0.35, Ls - 0.35]) starShape(kit, x, BY + 3.62, 0.18, 0.075, 'steel', '#dfe2e4');
      } else if (s.k === segs.length - 1) {
        textMixed(kit, [['SILVER STAR DINER', { font: 'slab', h: 0.42 }], ['銀星餐館', { font: 'cjk', h: 0.5 }]], { x: Ls / 2, y: BY + 3.6, z: 0.072, mat: 'sz_paint_red', tint: RED, gap: 0.45, maxW: Ls - 0.8 });
        textLine(kit, 'BREAKFAST ALL DAY · PIE · COFFEE · OPEN 24 HRS', { font: 'sans', h: 0.09, x: Ls / 2, y: BY + 3.3, z: 0.072, align: 'center', mat: 'sz_paint', maxW: Ls - 1.2 });
      } else if (door) textLine(kit, s.k === 3 ? 'OPEN' : '24 HRS', { font: 'hwy', h: 0.2, x: Ls / 2, y: BY + 3.5, z: 0.072, align: 'center', mat: 'sz_paint_red', tint: RED, maxW: Ls - 0.1 });
      else starShape(kit, Ls / 2, BY + 3.62, 0.3, 0.075, 'steel', '#dfe2e4');
      if (door) {   // chained push bars + a CLOSED card
        kit.box({ x: Ls / 2, y: BY + 1.05, z: 0.02, w: Ls - 0.2, h: 0.05, d: 0.05, mat: 'steel', tint: STEEL });
        for (let i = 0; i <= 6; i++) kit.at({ x: Ls * 0.3 + i * (Ls * 0.4 / 6), y: BY + 1.0 - Math.sin((i / 6) * PI) * 0.07, z: 0.06, rz: i % 2 ? PI / 2 : 0 }, () => kit.box({ x: 0, y: -0.016, z: 0, w: 0.045, h: 0.032, d: 0.012, mat: 'steel', tint: '#7d7a72' }));
      }
    });
  }
  // ---- roof (parapet with a steel coping), collision, solid footprint
  kit._flatRoof(ensureCCW(DINER_POLY), top, { type: 'flat', parapet: 0.9, mat: 'roof_tar', coping: 'steel', clutter: false }, { mat: 'plaster', tint: WALLC });
  kit.colPrism(DINER_POLY, BY, top + 0.9, 'concrete');
  kit.solid(DINER_POLY, BY, top);
  dinerInterior(kit, { RED, STEEL });
  dinerRoof(kit, top, STEEL);
}
/** Strip of the diner room seen through the ribbon windows (3 m deep): floor, ceiling, back walls, counter, booths. */
function dinerInterior(kit, C) {
  const y0 = BY + 0.015, yc = BY + 3.5;
  const IN = [[8, 38], ...DINER_ARC.slice().reverse(), [24, 48], [24, 45], [11, 45], [11, 38]];
  kit.upFace(IN.map(([x, z]) => [x, y0, z]), 'interior_tiles', null, { tint: '#e6dfd0' });
  // dark squares of the checker floor, only where a whole square lies inside the visible strip
  const ins = (x, z) => (x >= 8.25 && x <= 11 && z >= 38.25 && z <= 45) || (z >= 45 && z <= 47.75 && x >= 11 && x <= 23.75) || (x <= 11 && z >= 45 && Math.hypot(x - 11, z - 45) <= 2.72);
  for (let i = 0; i < 32; i++) for (let j = 0; j < 20; j++) {
    const x = 8.25 + i * 0.5, z = 38.25 + j * 0.5;
    if ((i + j) % 2 || ![[x, z], [x + 0.5, z], [x, z + 0.5], [x + 0.5, z + 0.5]].every(([px, pz]) => ins(px, pz))) continue;
    kit.upFace([[x, y0 + 0.003, z], [x + 0.5, y0 + 0.003, z], [x + 0.5, y0 + 0.003, z + 0.5], [x, y0 + 0.003, z + 0.5]], 'interior_tiles', null, { tint: '#3c3a38' });
  }
  kit.face(IN.slice().reverse().map(([x, z]) => [x, yc, z]), 'interior_ceiling', { tint: '#e2dccf' });   // CW from above: faces down
  // back + end walls of the strip (facing the windows): red wainscot, menu board, clock
  for (const [a, b] of [[[11, 38], [11, 45]], [[11, 45], [24, 45]], [[8, 38], [11, 38]], [[24, 45], [24, 48]]]) {
    kit.wall({ a, b, y0: BY, h: 3.5, t: 0.12, mat: 'interior_wall', tint: '#d9cdb5', collide: false, room: 0, grime: { y: BY, h: 1.0, k: 0.3 } });
    kit.at(edgeFrame(a, b), () => { const Lw = Math.hypot(b[0] - a[0], b[1] - a[1]); kit.box({ x: Lw / 2, y: BY, z: 0.01, w: Lw, h: 1.05, d: 0.02, mat: 'sign_red', tint: '#9a3a32', faces: { nz: false } }); kit.box({ x: Lw / 2, y: BY + 1.05, z: 0.02, w: Lw, h: 0.05, d: 0.04, mat: 'steel', tint: C.STEEL }); });
  }
  kit.at(edgeFrame([11, 45], [24, 45]), () => {
    const zf = board(kit, 4.2, 8.8, BY + 2.1, 0.9, { mat: 'sign_white', tint: '#26241f', d: 0.04, border: { mat: 'sign_white', tint: '#bfb6a2', w: 0.02 } });
    textLine(kit, 'MENU', { font: 'sans', h: 0.16, x: 6.5, y: BY + 2.75, z: zf, align: 'center', mat: 'sz_paint_white' });
    for (let r = 0; r < 3; r++) for (const x of [4.5, 6.7]) kit.face([[x, BY + 2.25 + r * 0.14, zf], [x + kit.rnd(1.2, 1.9), BY + 2.25 + r * 0.14, zf], [x + kit.rnd(1.2, 1.9), BY + 2.3 + r * 0.14, zf], [x, BY + 2.3 + r * 0.14, zf]], 'sz_paint_white', { shade: 0.7 });
    kit.cyl({ x: 10.5, y: BY + 2.6, z: 0.03, r: 0.22, h: 0.04, seg: 14, mat: 'sign_white', tint: '#e8e2d2', rx: PI / 2 });
  });
  // counter + stools along the avenue strip, pie case, coffee urns
  kit.box({ x: 10.35, y: BY, z: 41.4, w: 0.6, h: 1.0, d: 5.8, mat: 'paint_metal', tint: '#aeb2b2' });
  kit.box({ x: 10.3, y: BY + 1.0, z: 41.4, w: 0.75, h: 0.05, d: 5.9, mat: 'steel', tint: C.STEEL });
  kit.box({ x: 10.32, y: BY + 1.05, z: 39.6, w: 0.5, h: 0.45, d: 0.9, mat: 'glass_dirty', faces: { bottom: false } });
  for (const z of [42.4, 43.1]) kit.cyl({ x: 10.45, y: BY + 1.05, z, r: 0.14, h: 0.5, seg: 10, mat: 'car_chrome', tint: '#b8bcbf' });
  for (let i = 0; i < 6; i++) {
    const z = 39.0 + i * 0.95, down = i === 2 || i === 5;
    // upright: base at the floor; toppled: lying on its side (post horizontal at the seat radius)
    kit.at(down ? { x: 9.3, y: BY + 0.2, z: z + 0.2, rot: 0.6, rz: PI / 2 } : { x: 9.65, y: BY, z }, () => {
      const o = down ? -0.37 : 0;
      kit.cyl({ x: 0, y: o, z: 0, r: 0.16, h: 0.03, seg: 10, mat: 'steel', tint: C.STEEL });
      kit.cyl({ x: 0, y: o + 0.03, z: 0, r: 0.035, h: 0.62, seg: 6, mat: 'steel', tint: C.STEEL });
      kit.cyl({ x: 0, y: o + 0.65, z: 0, r: 0.2, h: 0.09, seg: 12, mat: 'sz_paint_red', tint: '#e8d0cc' });
    });
  }
  // booths along the cross-street windows (benches across the strip), one table flipped
  for (let i = 0; i < 6; i++) {
    const cx = 12.4 + i * 1.95, zw = 47.7;
    for (const s of [-1, 1]) {
      const bx = cx + s * 0.72;
      kit.box({ x: bx, y: BY, z: zw - 0.6, w: 0.5, h: 0.46, d: 1.2, mat: 'sz_paint_red', tint: '#e8d0cc' });
      kit.box({ x: bx + s * 0.2, y: BY + 0.46, z: zw - 0.6, w: 0.12, h: 0.62, d: 1.2, mat: 'sz_paint_red', tint: '#c8aca8' });
    }
    if (i === 3) kit.at({ x: cx, y: BY + 0.38, z: zw - 1.5, rx: 1.35 }, () => kit.box({ x: 0, y: 0, z: 0, w: 0.75, h: 0.04, d: 0.95, mat: 'sign_white', tint: '#e0d8c4' }));
    else {
      kit.cyl({ x: cx, y: BY, z: zw - 0.6, r: 0.04, h: 0.72, seg: 6, mat: 'steel', tint: C.STEEL });
      kit.box({ x: cx, y: BY + 0.72, z: zw - 0.6, w: 0.75, h: 0.04, d: 1.0, mat: 'sign_white', tint: '#e0d8c4' });
      kit.box({ x: cx, y: BY + 0.73, z: zw - 0.6, w: 0.79, h: 0.025, d: 1.04, mat: 'steel', tint: C.STEEL });
      kit.box({ x: cx - 0.2, y: BY + 0.76, z: zw - 0.3, w: 0.08, h: 0.12, d: 0.06, mat: 'steel', tint: C.STEEL });
      if (i % 2) kit.cyl({ x: cx + 0.15, y: BY + 0.76, z: zw - 0.35, r: 0.03, h: 0.18, seg: 6, mat: 'sign_red', tint: '#c03a2a' });
    }
  }
  // pendant globes (dead), litter, a fallen chair
  for (const [x, z] of [[9.6, 39.5], [9.6, 42.5], [9.9, 45.6], [13.4, 46.6], [17.3, 46.6], [21.2, 46.6]]) {
    kit.cyl({ x, y: yc - 0.55, z, r: 0.006, h: 0.55, seg: 4, mat: 'wire' });
    sphere(kit, x, yc - 0.68, z, 0.14, 'lamp_off', '#d8d4c8', 8);
  }
  kit.debris([9.4, 41.0], { r: 1.0, count: 6, kinds: ['paper', 'paper'], y: y0 });
  kit.debris([16.5, 46.3], { r: 1.6, count: 8, kinds: ['paper', 'paper', 'plank'], y: y0 });
  // soft cool fills (the one-bounce bake leaves rooms behind glass too dark)
  for (const p of [[9.5, 2.5, 39.6], [9.6, 2.5, 43.0], [10.2, 2.5, 46.0], [13.6, 2.5, 46.5], [17.4, 2.5, 46.5], [21.4, 2.5, 46.5]]) kit.light({ pos: [p[0], BY + p[1], p[2]], color: '#d6cfd2', intensity: 6.5, decay: 1, range: 8, radius: 0.9, name: 'fill' });
}
/** Diner roof: dead DINER channel letters on a steel frame (facing the avenue), HVAC units, kitchen exhaust, hatch. */
function dinerRoof(kit, top, STEEL) {
  const ry = top + 0.02;
  kit.at({ x: 9.25, y: 0, z: 43.1, rot: FACE.W }, () => {
    const font = 'sans', h = 1.45, Fn = GLYPHS[font], s = h / Fn.c, word = 'DINER', tr = 0.12 * h, yb = 9.15;
    const W = measure(word, { font, h, track: 0.12 });
    let x = -W / 2;
    for (const ch of word) {
      const g = glyph(font, ch, 2), adv = g.adv * s, slip = ch === 'E';
      kit.at({ x: x + adv / 2, y: yb + (slip ? -0.18 : 0), rz: slip ? -0.2 : 0 }, () => {
        glyphAt(kit, font, ch, -adv / 2, 0, s, s, { z: 0, depth: 0.2, mat: 'sign_red', tint: '#c4483a', sideMat: 'steel_dark', sideTint: '#55504a' });
        for (const sh of g.shapes) { const P = sh[0].map(([gx, gy]) => [-adv / 2 + gx * s, gy * s, 0.26]); kit.sweep(circle(0.025, 5), [...P, P[0]], 'lamp_off', { smooth: true, up: [0, 0, 1] }); }
      });
      x += adv + tr;
    }
    // frame: two rails behind the letters, legs to the roof, raked braces, a star on a post
    const xs = [-W / 2 - 0.3, -W / 4, W / 4, W / 2 + 0.3];
    for (const y of [yb + 0.25, yb + h - 0.2]) kit.beam([-W / 2 - 0.4, y, -0.12], [W / 2 + 0.4, y, -0.12], { kind: 'box', h: 0.1, w: 0.08, tint: '#4a4642' });
    for (const lx of xs) {
      kit.beam([lx, ry, -0.12], [lx, yb + h + 0.05, -0.12], { kind: 'I', h: 0.14, w: 0.1, tint: '#4a4642', up: [0, 0, 1] });
      kit.beam([lx, ry, -1.7], [lx, yb + h - 0.25, -0.16], { kind: 'L', h: 0.07, w: 0.07, tint: '#4a4642' });
      kit.box({ x: lx, y: ry, z: -0.9, w: 0.25, h: 0.12, d: 1.9, mat: 'steel_dark', tint: '#4a4642' });
    }
    kit.beam([0, yb + h - 0.2, -0.12], [0, yb + h + 0.75, -0.12], { kind: 'box', h: 0.08, w: 0.08, tint: '#4a4642' });
    kit.at({ y: 0, z: -0.05 }, () => { const P = starShape(kit, 0, yb + h + 1.05, 0.4, 0.0, 'sign_white', '#d8d4c8'); kit.sweep(circle(0.02, 5), [...P.map(([px, py]) => [px, py, 0.05]), [P[0][0], P[0][1], 0.05]], 'lamp_off', { smooth: false, up: [0, 0, 1] }); });
    for (let i = 0; i < 3; i++) kit.sweep(circle(0.012, 4), [[-W / 2 + i * 1.8, yb + 0.25, -0.15], [-W / 2 + i * 1.8 + 0.4, ry + 0.4, -0.6], [-W / 2 + i * 1.8 + 0.2, ry + 0.02, -1.0]], 'rubber', { smooth: true });
  });
  // HVAC packaged units + ducts, kitchen exhaust fan, roof hatch, a vent stack against the grocery wall
  for (const [x, z, w, d, rot] of [[18.2, 41.6, 2.2, 1.4, 0], [21.6, 45.1, 1.6, 1.2, PI / 2]]) {
    kit.bbox({ x, y: ry, z, rot, w, h: 1.25, d, bevel: 0.03, mat: 'steel', tint: '#b9bab5', collide: 'metal' });
    kit.cyl({ x: x + (rot ? 0 : 0.45), y: ry + 1.25, z: z + (rot ? 0.3 : 0), r: 0.36, h: 0.06, seg: 14, mat: 'steel_dark' });
    for (let i = 0; i < 5; i++) kit.box({ x: x + (rot ? (i - 2) * 0.22 : -w / 2 - 0.005), y: ry + 0.25, z: z + (rot ? -w / 2 - 0.005 : (i - 2) * 0.22), w: rot ? 0.12 : 0.01, h: 0.7, d: rot ? 0.01 : 0.12, mat: 'steel_dark', tint: '#6a6b68' });
  }
  kit.box({ x: 18.2, y: ry + 0.3, z: 43.4, w: 0.6, h: 0.5, d: 2.2, mat: 'metal_worn', tint: '#b8b6ae' });
  kit.cyl({ x: 15.0, y: ry, z: 46.0, r: 0.55, r2: 0.5, h: 0.5, seg: 12, mat: 'steel', tint: '#9c9e9a' });
  kit.cyl({ x: 15.0, y: ry + 0.5, z: 46.0, r: 0.7, r2: 0.25, h: 0.35, seg: 12, mat: 'steel', tint: '#8e908c' });
  kit.decal({ at: [15.0, 46.0], size: 2.0, rot: 0.6, mat: 'decal_stain', y: ry - 0.01 });
  kit.box({ x: 13.8, y: ry, z: 43.8, w: 1.0, h: 0.5, d: 1.0, mat: 'trim_concrete', collide: 'concrete' });
  kit.box({ x: 13.8, y: ry + 0.5, z: 43.8, w: 1.05, h: 0.05, d: 1.05, mat: 'metal_painted', tint: '#6d6a62' });
  kit.cyl({ x: 22.9, y: ry, z: 38.55, r: 0.16, h: 4.6, seg: 10, mat: 'steel', tint: '#7e7f7a' });
  kit.cyl({ x: 22.9, y: ry + 4.6, z: 38.55, r: 0.28, r2: 0.05, h: 0.25, seg: 10, mat: 'steel', tint: '#7e7f7a' });
  void STEEL;
}

// ==================================================================================================== cross street blocks
function crossBlocks(kit, L) {
  // ---------------- S_W3 (painted_brick pale green, 4F) on the cross street: RADIO · TV REPAIR, the half-open loading
  // door of the west pocket, a faded BRANDT & SONS ghost sign on the upper wall
  const PALE = '#a9b8a2';
  block(kit, {
    id: 'S_W3', x0: -38, x1: -24, z0: 40, z1: 48, floors: F(4.5, 4), parapet: 0.8,
    mat: 'brick_painted', tint: PALE, trim: 'trim_concrete', trimTint: '#c7c5b4', cornice: { kind: 'simple', mat: 'trim_concrete', tint: '#b2b09f' },
    win: { w: 1.2, h: 1.7, sill: 0.9, lintel: 'trim_concrete', ac: 0.08, states: WIN_STATES_POOR }, belts: false, plinthMat: 'concrete_dirty', plinthTint: '#6a6a60',
    faces: [{
      side: 'S', cols: [1.8, 5.2, 8.8, 12.2], pipes: [0.25, 13.75], lit: [[2, 3]],
      mod: (f, k, op) => (f === 2 && (k === 1 || k === 2) ? null : op),   // the ghost sign covers the 3F middle
      ground: () => [
        { x: 0.7, w: 4.4, y: BY + 0.02, h: 3.3, type: 'garage', shutter: 0.62, shutterTint: '#7f857c' },
        { x: 5.7, w: 1.1, y: BY + 0.02, h: 2.3, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#5f645c', step: false },
        { x: 8.5, w: 4.8, y: BY + 0.02, h: 3.0, type: 'shop', state: 'broken', frame: 'sign_blue', kick: 'sign_blue', mullions: [3, 1], room: 1.6, roomTint: '#4a4640' },
      ],
      decor: (e, ops) => {
        const zf = board(kit, 8.3, 13.5, BY + 3.25, 0.8, { mat: 'sign_white', tint: '#2f4b7a', border: { mat: 'sign_white', tint: '#e2dccb', w: 0.03 } });
        textLine(kit, 'RADIO · TV REPAIR', { font: 'hwy', h: 0.3, x: 10.9, y: BY + 3.52, z: zf, align: 'center', mat: 'sz_paint_white', maxW: 4.8 });
        textLine(kit, 'SALES · SERVICE · PARTS', { font: 'hwy', h: 0.1, x: 10.9, y: BY + 3.34, z: zf, align: 'center', mat: 'sz_paint_yellow', maxW: 4.6 });
        for (let i = 0; i < 6; i++) { const x = 8.9 + (i % 3) * 1.45, y = BY + 0.4 + Math.floor(i / 3) * 0.75; kit.bbox({ x, y, z: -0.8, w: 0.62, h: 0.5, d: 0.5, bevel: 0.03, mat: 'sz_wood', tint: kit.pick(['#6a4a32', '#4a3a2e', '#7a5a3e']) }); kit.face([[x - 0.24, y + 0.08, -0.548], [x + 0.18, y + 0.08, -0.548], [x + 0.18, y + 0.42, -0.548], [x - 0.24, y + 0.42, -0.548]], 'glass_dirty'); }
        posterWall(kit, 0.8, 5.0, BY + 1.9, BY + 3.3, 0.02, 5, ['QUARANTINE', 'MISSING', null]);
        textLine(kit, 'DEAD END', { font: 'sans', h: 0.3, x: 2.9, y: BY + 2.6, z: -0.14, align: 'center', mat: 'sz_paint_red', italic: 0.15 });
        posterWall(kit, 5.7, 6.8, BY + 2.4, BY + 3.2, 0.02, 2, ['LOST', null]);
        workLight(kit, [6.95, BY + 4.0, 0.02], 0, true);
        ghostSign(kit, 'BRANDT & SONS', 'FURNITURE · STOVES · RUGS', 3.2, 11.0, BY + 8.3, BY + 11.2, { tint: '#6f4a3c', ink: '#e0d4b4' });
        peel(kit, 0.4, 13.6, BY + 4.8, BY + 14.5, 0.006, 6);
        streaks(kit, 0.2, 13.8, BY + 14.6, 7, 0.004, [1.2, 2.8]);
      },
    }],
  });

  // ---------------- S_E3 (brick_commercial, 5F) on the cross street: DRY CLEANERS, the closed garage of the east pocket;
  // its side wall over the diner carries the big faded FIZZ COLA wall advert (seen from the avenue and the fort)
  block(kit, {
    id: 'S_E3', x0: 24, x1: 38, z0: 40, z1: 48, floors: F(4.5, 5), parapet: 0.8,
    mat: 'brick_red', tint: '#c9a493', trim: 'trim_stone', trimTint: '#d4c8b2', cornice: { kind: 'metal', mat: 'trim_metal', tint: '#3e4a40', bracket: 1.1 },
    win: { w: 1.2, h: 1.9, sill: 0.9, lintel: 'trim_stone', ac: 0.12 },
    faces: [
      {
        side: 'S', cols: [1.6, 4.5, 7.4, 10.3, 12.9], pipes: [13.8], lit: [[2, 1]],
        ground: () => [
          { x: 0.4, w: 4.4, y: BY + 0.02, h: 3.0, type: 'shop', state: 'broken', frame: 'sign_green', kick: 'sign_green', mullions: [3, 1], room: 1.8, roomTint: '#4e4a44' },
          { x: 5.0, w: 1.0, y: BY + 0.02, h: 2.5, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#45524a', window: true, step: false },
          { x: 7.0, w: 3.6, y: BY + 0.02, h: 3.2, type: 'garage', shutter: 1, shutterTint: '#8c9296' },
          { x: 11.2, w: 1.0, y: BY + 0.02, h: 2.3, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#6a5a4a', step: false },
          { x: 12.6, w: 1.0, y: BY + 1.0, h: 1.6, type: 'window', state: 'boarded', frame: 'frame_dark' },
        ],
        decor: (e, ops) => {
          const zf = board(kit, 0.2, 5.0, BY + 3.25, 0.8, { mat: 'sign_white', tint: '#e8e2d2', border: { mat: 'sign_white', tint: '#3d6e46', w: 0.03 } });
          textLine(kit, 'DRY CLEANERS', { font: 'serif', h: 0.32, x: 2.6, y: BY + 3.52, z: zf, align: 'center', mat: 'sz_paint_green', maxW: 4.4 });
          textLine(kit, 'ONE HOUR · TAILORING', { font: 'sans', h: 0.09, x: 2.6, y: BY + 3.34, z: zf, align: 'center', mat: 'sz_paint', maxW: 4.2 });
          // a rail of bagged clothes behind the smashed window, a mannequin knocked over
          kit.box({ x: 2.6, y: BY + 2.1, z: -1.1, w: 4.0, h: 0.04, d: 0.04, mat: 'steel', tint: '#9a9c9a' });
          for (let i = 0; i < 9; i++) kit.at({ x: 0.9 + i * 0.42 + kit.rnd(-0.05, 0.05), y: BY + 0.9, z: -1.1, rot: kit.rnd(-0.3, 0.3) }, () => kit.bbox({ x: 0, y: 0, z: 0, w: 0.08, h: 1.15, d: 0.5, bevel: 0.03, mat: 'glass_dirty', taper: { top: [1, 0.6] } }));
          kit.at({ x: 1.5, y: SW + 0.12, z: 0.9, rot: 0.4, rz: PI / 2 - 0.05 }, () => { kit.cyl({ x: 0, y: 0, z: 0, r: 0.15, r2: 0.12, h: 0.75, seg: 8, mat: 'sign_white', tint: '#d8d0c0' }); sphere(kit, 0, 0.9, 0, 0.1, 'sign_white', '#d8d0c0', 8); });
          for (let i = 0; i < 12; i++) { const x = kit.rnd(0.5, 4.8), z = kit.rnd(0.2, 1.4), s = kit.rnd(0.05, 0.13); kit.upFace([[x, SW + 0.004, z], [x + s, SW + 0.004, z + kit.rnd(-0.05, 0.05)], [x + s * 0.4, SW + 0.004, z + s]], 'glass_dirty', null, {}); }
          posterWall(kit, 7.1, 10.5, BY + 0.8, BY + 2.9, 0.02, 6, ['QUARANTINE', 'NO ENTRY', 'MISSING', null]);
          textLine(kit, 'NO PARKING', { font: 'sans', h: 0.2, x: 8.8, y: BY + 0.5, z: 0.03, align: 'center', mat: 'sz_paint_white' });
          searchMark(kit, 9.0, BY + 2.4, 0.7, 'sz_paint_red', '10-03');
          workLight(kit, [6.3, BY + 4.0, 0.02], 0, true);
          streaks(kit, 0.2, 13.8, BY + 18.0, 8, 0.004, [1.2, 3.0]);
          for (const op of ops.filter((o) => o.type === 'window' && o.y > 4)) hood(kit, op, 'key', 'trim_stone', '#d4c8b2');
        },
      },
      {
        side: 'W', from: BY + 7.9, cols: [], belts: false, plinth: false,
        decor: () => {
          fizzGhost(kit, 0.45, 7.55, BY + 9.3, BY + 17.3);
          streaks(kit, 0.2, 7.8, BY + 18.0, 5, 0.012, [1.5, 4.0]);
          kit.sweep(circle(0.055, 8), [[7.75, BY + 18.2, 0.12], [7.75, BY + 8.3, 0.12], [7.75, BY + 8.05, 0.3]], 'steel', { smooth: true, tint: '#7b7a74', up: [0, 0, 1] });
        },
      },
      { side: 'N', from: BY + 16.8, cols: [], belts: false, plinth: false },
    ],
  });
}
/** Faded painted wall advert (wall-local x0..x1, y0..y1): two lines of lettering over a brick-painted panel, peeling. */
function ghostSign(kit, l1, l2, x0, x1, y0, y1, o = {}) {
  const z = 0.007, mid = (x0 + x1) / 2, h = y1 - y0;
  flat(kit, rect2(x0, y0, x1, y1), z, 'brick_painted', { tint: o.tint || '#6f4a3c' });
  for (const yy of [y0 + 0.18, y1 - 0.3]) flat(kit, rect2(x0 + 0.2, yy, x1 - 0.2, yy + 0.12), z + 0.002, 'brick_painted', { tint: '#d8cbb0' });
  textLine(kit, l1, { font: 'slab', h: h * 0.3, x: mid, y: y0 + h * 0.5, z: z + 0.003, align: 'center', mat: 'brick_painted', tint: o.ink || '#e0d4b4', maxW: x1 - x0 - 0.6 });
  textLine(kit, l2, { font: 'serif', h: h * 0.13, x: mid, y: y0 + h * 0.2, z: z + 0.003, align: 'center', mat: 'brick_painted', tint: '#d8cbb0', maxW: x1 - x0 - 0.8 });
  peel(kit, x0, x1, y0, y1, z + 0.005, 5);
}
/** The big faded FIZZ COLA wall advert (our own brand, shared with the centre zone's billboards). */
function fizzGhost(kit, x0, x1, y0, y1) {
  const z = 0.008, mid = (x0 + x1) / 2, h = y1 - y0;
  flat(kit, rect2(x0, y0, x1, y1), z, 'brick_painted', { tint: '#8a4038' });
  flat(kit, rect2(x0 + 0.25, y0 + 0.25, x1 - 0.25, y1 - 0.25), z + 0.001, 'brick_painted', { tint: '#9a463c' });
  textLine(kit, 'DRINK', { font: 'serif', h: h * 0.1, x: mid, y: y1 - h * 0.2, z: z + 0.003, align: 'center', mat: 'brick_painted', tint: '#e8dcc0', maxW: x1 - x0 - 1 });
  textLine(kit, 'FIZZ', { font: 'serif', h: h * 0.2, x: mid, y: y0 + h * 0.5, z: z + 0.003, align: 'center', mat: 'brick_painted', tint: '#f0e6cc', italic: 0.15, maxW: x1 - x0 - 0.8 });
  textLine(kit, 'COLA', { font: 'serif', h: h * 0.16, x: mid, y: y0 + h * 0.29, z: z + 0.003, align: 'center', mat: 'brick_painted', tint: '#f0e6cc', italic: 0.15, maxW: x1 - x0 - 1.2 });
  flat(kit, rect2(x0 + 0.6, y0 + h * 0.2, x1 - 0.6, y0 + h * 0.22), z + 0.002, 'brick_painted', { tint: '#e8dcc0' });
  textLine(kit, 'DELICIOUS · REFRESHING', { font: 'sans', h: h * 0.05, x: mid, y: y0 + h * 0.09, z: z + 0.003, align: 'center', mat: 'brick_painted', tint: '#e2d6ba', maxW: x1 - x0 - 1.0 });
  peel(kit, x0, x1, y0, y1, z + 0.006, 9);
}

// ==================================================================================================== lane blocks
function laneBlocks(kit, L) {
  const cols11 = [1.4, 4.16, 6.92, 9.68, 12.44, 15.2, 17.96, 20.72, 23.48, 26.24, 29.0];
  // ---------------- X_S1 (brick_dark, 6F): ARMY & NAVY surplus on the lane corner, LAKESIDE CLINIC turned triage post,
  // garages, a fire escape; the pocket end boarded
  const DARK = '#c1b0a4';
  block(kit, {
    id: 'X_S1', x0: -38, x1: -8, z0: 58, z1: 72, floors: F(4.5, 6), parapet: 0.9,
    mat: 'brick_dark', tint: DARK, groundMat: 'concrete_wall', groundTint: '#b0a798', trim: 'trim_stone', trimTint: '#b4ab9c',
    cornice: { kind: 'simple', mat: 'trim_concrete', tint: '#9c968a' }, plinthMat: 'concrete_dirty', plinthTint: '#625e58',
    win: { w: 1.1, h: 1.7, sill: 0.9, lintel: 'trim_stone', states: WIN_STATES_POOR, ac: 0.15 },
    faces: [
      {
        side: 'N', cols: cols11, pipes: [0.25, 21.6], lit: [[3, 4], [5, 8]],
        mod: (f, k, op) => { if (k === 4 || k === 5) { op.ac = false; op.streak = false; } return op; },
        ground: () => [
          { x: 0.4, w: 3.9, y: BY + 0.02, h: 3.0, type: 'shop', state: 'broken', frame: 'sign_green', kick: 'sign_green', room: 1.8, roomTint: '#46463c' },
          { x: 4.8, w: 1.15, y: BY + 0.02, h: 2.6, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#3d4438', window: true, step: false },
          { x: 6.6, w: 2.8, y: BY + 0.02, h: 3.0, type: 'shop', state: 'dark', frame: 'frame_white', kick: 'frame_white', room: 1.6 },
          { x: 9.65, w: 1.6, y: BY + 0.02, h: 2.7, type: 'door', state: 'closed', door: 'frame_white', doorTint: '#cfcfc8', window: true, frame: 'frame_white', step: false },
          { x: 11.5, w: 2.8, y: BY + 0.02, h: 3.0, type: 'shop', state: 'boarded', frame: 'frame_white' },
          { x: 15.0, w: 3.0, y: BY + 0.02, h: 3.2, type: 'garage', shutter: 1, shutterTint: '#7f8a84' },
          { x: 18.4, w: 3.0, y: BY + 0.02, h: 3.2, type: 'garage', shutter: 0.86, shutterTint: '#8a8f86' },
          { x: 22.8, w: 3.4, y: BY + 0.02, h: 3.0, type: 'shop', state: 'boarded', frame: 'frame_dark' },
          { x: 26.8, w: 1.1, y: BY + 0.02, h: 2.3, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#59605a', step: false },
          { x: 28.3, w: 1.2, y: BY + 1.0, h: 1.8, type: 'window', state: 'boarded', frame: 'frame_dark' },
        ],
        decor: (e, ops, ctx) => {
          armyNavy(kit, 0.2, 4.5);
          // LAKESIDE CLINIC: white board + red cross, TRIAGE sprayed on the boards, sandbags, stretcher, medical crates
          const zf = board(kit, 6.4, 14.5, BY + 3.25, 0.82, { mat: 'sign_white', tint: '#ecebe4', border: { mat: 'sign_white', tint: '#b8382a', w: 0.03 } });
          textLine(kit, 'LAKESIDE CLINIC', { font: 'sans', h: 0.34, x: 10.9, y: BY + 3.5, z: zf, align: 'center', mat: 'sz_paint', maxW: 6.6 });
          for (const [x, w, h] of [[7.0, 0.5, 0.14], [7.0, 0.14, 0.5]]) flat(kit, rect2(x - w / 2, BY + 3.66 - h / 2, x + w / 2, BY + 3.66 + h / 2), zf + 0.002, 'sz_paint_red');
          textLine(kit, 'TRIAGE', { font: 'sans', h: 0.42, x: 12.9, y: BY + 1.3, z: 0.05, align: 'center', mat: 'sz_paint_red', italic: 0.12 });
          textLine(kit, '檢疫', { font: 'cjk', h: 0.36, x: 12.9, y: BY + 0.7, z: 0.05, align: 'center', mat: 'sz_paint_red' });
          kit.sandbags([[6.5, 0.9], [9.4, 0.9]], { rows: 3, y: SW });
          kit.at({ x: 11.2, y: SW, z: 1.3, rot: 0.15 }, () => {
            for (const s of [-0.28, 0.28]) kit.box({ x: 0, y: 0.25, z: s, w: 2.0, h: 0.04, d: 0.04, mat: 'steel', tint: '#a0a29e' });
            kit.box({ x: 0, y: 0.28, z: 0, w: 1.9, h: 0.02, d: 0.55, mat: 'sz_fabric', tint: '#5e6a58' });
            for (const x of [-0.85, 0.85]) for (const s of [-0.28, 0.28]) kit.box({ x, y: 0, z: s, w: 0.04, h: 0.27, d: 0.04, mat: 'steel', tint: '#8a8c88' });
          });
          for (const [x, z, r] of [[14.0, 0.7, 0.1], [14.3, 1.45, -0.3]]) kit.at({ x, y: SW, z, rot: r }, () => { kit.box({ x: 0, y: 0, z: 0, w: 0.8, h: 0.42, d: 0.5, mat: 'paint_metal', tint: '#5d6a52' }); flat(kit, rect2(-0.12, 0.12, 0.12, 0.36), 0.251, 'sz_paint_white'); for (const [w2, h2] of [[0.14, 0.04], [0.04, 0.14]]) flat(kit, rect2(-w2 / 2, 0.24 - h2 / 2, w2 / 2, 0.24 + h2 / 2), 0.253, 'sz_paint_red'); });
          posterWall(kit, 15.1, 17.9, BY + 0.6, BY + 2.9, 0.02, 5, ['QUARANTINE', 'EVACUATE', null]);
          posterWall(kit, 18.5, 21.3, BY + 1.0, BY + 3.0, 0.02, 4, ['MISSING', 'LOST', null]);
          searchMark(kit, 16.5, BY + 1.9, 0.8, 'sz_paint_red', '10-03');
          posterWall(kit, 22.9, 26.1, BY + 0.5, BY + 2.9, 0.06, 6, ['QUARANTINE', 'NO ENTRY', null]);
          workLight(kit, [22.6, BY + 4.0, 0.02], 0, true);
          fireEscape(kit, { x: 13.8, floors: 6, bases: ctx.bases, width: 4.4 });
          streaks(kit, 0.2, 29.8, BY + 21.4, 14, 0.004, [1.5, 4.0]);
        },
      },
      {
        side: 'E', cols: [1.4, 4.2, 7.0, 9.8, 12.6], pipes: [0.25], lit: [[2, 3]],
        ground: () => [
          { x: 0.5, w: 3.6, y: BY + 0.02, h: 3.0, type: 'shop', state: 'boarded', frame: 'frame_dark' },
          { x: 4.6, w: 1.1, y: BY + 0.02, h: 2.6, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#4e544c', window: true, step: false },
          { x: 6.4, w: 3.0, y: BY + 0.02, h: 3.0, type: 'shop', state: 'shutter', frame: 'frame_dark', shutterTint: '#8a8f86' },
          { x: 9.9, w: 3.7, y: BY + 0.02, h: 3.0, type: 'shop', state: 'broken', frame: 'sign_green', kick: 'sign_green', room: 1.8, roomTint: '#46463c' },
        ],
        decor: () => {
          armyNavy(kit, 9.6, 13.85);
          textLine(kit, 'LOOTERS WILL BE SHOT', { font: 'sans', h: 0.2, x: 7.9, y: BY + 1.6, z: -0.03, align: 'center', mat: 'sz_paint_red', italic: 0.12, maxW: 2.8 });
          posterWall(kit, 0.6, 4.0, BY + 1.6, BY + 2.9, 0.04, 4, ['MISSING', null]);
          kit.wallLamp({ x: 5.15, y: BY + 2.95, on: false });
          streaks(kit, 0.2, 13.8, BY + 21.4, 7, 0.004, [1.5, 4.0]);
        },
      },
    ],
    extra: (ctx) => waterTank(kit, [-27.0, 66.0], ctx.top + 0.02, 1.6, 3.2),
  });

  // ---------------- X_S2 (painted_brick cream, 5F): FLORIST on the lane corner, RECORDS, MODERN FURNITURE, the closed
  // garage of the east pocket; a faded PRESTON'S BAKERY ghost sign on the lane wall
  const CREAM = '#cbbfa2';
  block(kit, {
    id: 'X_S2', x0: 8, x1: 38, z0: 58, z1: 72, floors: F(4.5, 5), parapet: 0.9,
    mat: 'brick_painted', tint: CREAM, trim: 'trim_concrete', trimTint: '#d8d0bc', cornice: { kind: 'simple', mat: 'trim_concrete', tint: '#b8b09c' },
    win: { w: 1.2, h: 1.7, sill: 0.9, lintel: 'trim_concrete', ac: 0.1 }, belts: false, plinthMat: 'concrete_dirty', plinthTint: '#6a665c',
    faces: [
      {
        side: 'N', cols: cols11, pipes: [0.25, 29.75], lit: [[2, 6], [4, 2]],
        ground: () => [
          { x: 0.7, w: 4.6, y: BY + 0.02, h: 3.3, type: 'garage', shutter: 1, shutterTint: '#7d847e' },
          { x: 5.9, w: 1.1, y: BY + 0.02, h: 2.3, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#5c615a', step: false },
          { x: 8.6, w: 5.6, y: BY + 0.02, h: 3.1, type: 'shop', state: 'dark', frame: 'frame_dark', kick: 'trim_metal', mullions: [3, 1], room: 2.0, roomTint: '#5a5248' },
          { x: 14.6, w: 1.1, y: BY + 0.02, h: 2.6, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#6b3a2e', window: true, step: false },
          { x: 16.2, w: 3.2, y: BY + 0.02, h: 3.0, type: 'shop', state: 'broken', frame: 'sign_red', kick: 'sign_red', room: 1.6, roomTint: '#3e3a36' },
          { x: 19.6, w: 3.2, y: BY + 0.02, h: 3.0, type: 'shop', state: 'shutter', frame: 'sign_red', kick: 'sign_red', shutterTint: '#a09a8e' },
          { x: 23.6, w: 1.1, y: BY + 0.02, h: 2.6, type: 'door', state: 'closed', door: 'frame_dark', doorTint: '#2e3a30', window: true, frame: 'sign_green', step: false },
          { x: 25.1, w: 4.5, y: BY + 0.02, h: 3.0, type: 'shop', state: 'glass', frame: 'sign_green', kick: 'sign_green', mullions: [3, 1], room: 1.6, roomTint: '#56584a' },
        ],
        decor: () => {
          posterWall(kit, 0.8, 5.2, BY + 0.8, BY + 3.0, 0.02, 6, ['QUARANTINE', 'MISSING', 'NO ENTRY', null]);
          textLine(kit, 'NO PARKING', { font: 'sans', h: 0.22, x: 3.0, y: BY + 0.5, z: 0.03, align: 'center', mat: 'sz_paint_white' });
          workLight(kit, [7.4, BY + 4.0, 0.02], 0, true);
          // MODERN FURNITURE: dusty sofa + standard lamp behind the glass
          const zf1 = board(kit, 8.4, 14.4, BY + 3.25, 0.8, { mat: 'sign_white', tint: '#2a2a28', border: { mat: 'sign_white', tint: '#c9b48e', w: 0.025 } });
          textLine(kit, 'MODERN FURNITURE', { font: 'serif', h: 0.32, x: 11.4, y: BY + 3.5, z: zf1, align: 'center', mat: 'sz_paint_yellow', tint: '#e8d8a8', maxW: 5.6 });
          kit.bbox({ x: 10.4, y: BY + 0.02, z: -1.3, w: 2.0, h: 0.8, d: 0.85, bevel: 0.08, mat: 'sz_fabric', tint: '#6a5a48' });
          kit.cyl({ x: 12.6, y: BY + 0.02, z: -1.2, r: 0.025, h: 1.6, seg: 6, mat: 'steel', tint: '#8a8070' });
          kit.cyl({ x: 12.6, y: BY + 1.55, z: -1.2, r: 0.12, r2: 0.25, h: 0.3, seg: 10, mat: 'sz_fabric', tint: '#c8b896' });
          salePoster(kit, 9.0, BY + 1.9, 1.2, 0.9, -0.14, 1, 0.03);
          // RECORDS: red board, sleeves on the floor
          const zf2 = board(kit, 16.0, 23.0, BY + 3.25, 0.8, { mat: 'sign_white', tint: '#a8322a', border: { mat: 'sign_white', tint: '#e8e2d4', w: 0.025 } });
          textLine(kit, 'RECORDS · MUSIC', { font: 'sans', h: 0.3, x: 19.5, y: BY + 3.52, z: zf2, align: 'center', mat: 'sz_paint_white', maxW: 6.4 });
          for (let i = 0; i < 10; i++) kit.box({ x: kit.rnd(16.3, 19.3), y: SW + 0.003, z: kit.rnd(0.2, 1.5), rot: kit.rnd(0, 3), w: 0.31, h: 0.006, d: 0.31, mat: 'sign_white', tint: kit.pick(['#2a2a2a', '#b8442a', '#3a5a8a', '#e0c050', '#d8d0c0']) });
          posterWall(kit, 19.7, 22.7, BY + 0.6, BY + 2.9, -0.045, 8, ['JAZZ', 'SHOW', 'LIVE', 'RALLY', null]);
          // FLORIST: green board, buckets of dead flowers on the sidewalk
          const zf3 = board(kit, 23.4, 29.8, BY + 3.25, 0.8, { mat: 'sign_white', tint: '#3f6f4d', border: { mat: 'sign_white', tint: '#e6e2d4', w: 0.025 } });
          textLine(kit, 'ROSE & FERN FLORIST', { font: 'serif', h: 0.28, x: 26.6, y: BY + 3.52, z: zf3, align: 'center', mat: 'sz_paint_white', maxW: 6.0 });
          flowerBuckets(kit, 25.4, 29.4, SW, 0.55);
          streaks(kit, 0.2, 29.8, BY + 18.0, 12, 0.004, [1.2, 3.0]);
          peel(kit, 0.4, 29.6, BY + 4.8, BY + 17.5, 0.006, 10);
        },
      },
      {
        side: 'W', cols: [1.4, 4.2, 7.0, 9.8, 12.6], pipes: [13.75], lit: [[4, 0]],
        mod: (f, k, op) => (f >= 2 && f <= 3 && k >= 1 && k <= 3 ? null : op),
        ground: () => [
          { x: 0.4, w: 3.4, y: BY + 0.02, h: 3.0, type: 'shop', state: 'glass', frame: 'sign_green', kick: 'sign_green', mullions: [2, 1], room: 1.6, roomTint: '#56584a' },
          { x: 4.2, w: 1.1, y: BY + 0.02, h: 2.6, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#4f544e', window: true, step: false },
          { x: 6.0, w: 3.4, y: BY + 0.02, h: 3.2, type: 'garage', shutter: 1, shutterTint: '#8a8f86' },
          { x: 10.2, w: 3.4, y: BY + 0.02, h: 3.0, type: 'shop', state: 'boarded', frame: 'frame_dark' },
        ],
        decor: () => {
          flowerBuckets(kit, 0.6, 3.6, SW, 0.55);
          posterWall(kit, 6.1, 9.3, BY + 0.6, BY + 2.9, 0.02, 6, ['EVACUATE', 'MISSING', null]);
          searchMark(kit, 7.7, BY + 2.0, 0.8, 'sz_paint_red', '10-03');
          ghostSign(kit, "PRESTON'S", 'BREAD · CAKES · PIES', 2.9, 11.1, BY + 8.4, BY + 13.9, { tint: '#5f6e78', ink: '#e8e0c8' });
          streaks(kit, 0.2, 13.8, BY + 18.0, 6, 0.004, [1.2, 3.0]);
        },
      },
    ],
  });
}
/** ARMY & NAVY SURPLUS fascia + looted window display (wall-local x0..x1). */
function armyNavy(kit, x0, x1) {
  const zf = board(kit, x0, x1, BY + 3.25, 0.82, { mat: 'sign_white', tint: '#4a5236', border: { mat: 'sign_white', tint: '#d9cfa8', w: 0.03 } });
  textLine(kit, 'ARMY & NAVY', { font: 'slab', h: 0.32, x: (x0 + x1) / 2, y: BY + 3.55, z: zf, align: 'center', mat: 'sz_paint_white', tint: '#efe6c8', maxW: x1 - x0 - 0.3 });
  textLine(kit, 'SURPLUS · CAMPING · BOOTS', { font: 'sans', h: 0.08, x: (x0 + x1) / 2, y: BY + 3.36, z: zf, align: 'center', mat: 'sz_paint_white', tint: '#d9cfa8', maxW: x1 - x0 - 0.4 });
  for (let i = 0; i < 4; i++) kit.box({ x: kit.rnd(x0 + 0.4, x1 - 0.4), y: BY + 0.02, z: kit.rnd(-1.4, -0.5), rot: kit.rnd(0, 3), w: 0.55, h: 0.32, d: 0.4, mat: 'paint_metal', tint: '#5d6a52' });
  for (let i = 0; i < 10; i++) { const x = kit.rnd(x0 + 0.2, x1 - 0.2), z = kit.rnd(0.2, 1.4), s = kit.rnd(0.05, 0.13); kit.upFace([[x, SW + 0.004, z], [x + s, SW + 0.004, z + kit.rnd(-0.05, 0.05)], [x + s * 0.4, SW + 0.004, z + s]], 'glass_dirty', null, {}); }
}
/** Zinc buckets of dead flowers along a shopfront (wall-local x0..x1, depth z). */
function flowerBuckets(kit, x0, x1, y, z) {
  for (let x = x0 + 0.25; x < x1 - 0.2; x += kit.rnd(0.42, 0.6)) {
    const zz = z + kit.rnd(-0.1, 0.15);
    if (kit.chance(0.2)) { kit.at({ x, y: y + 0.12, z: zz + 0.4, rot: kit.rnd(0, 6), rz: PI / 2 }, () => kit.cyl({ x: 0, y: -0.15, z: 0, r: 0.13, r2: 0.15, h: 0.3, seg: 8, mat: 'steel', tint: '#9a9c96' })); continue; }
    kit.cyl({ x, y, z: zz, r: 0.13, r2: 0.15, h: 0.3, seg: 8, mat: 'steel', tint: '#9a9c96' });
    for (let i = 0; i < 4; i++) kit.at({ x: x + kit.rnd(-0.05, 0.05), y: y + 0.28, z: zz + kit.rnd(-0.05, 0.05), rx: kit.rnd(-0.5, 0.5), rz: kit.rnd(-0.6, 0.6) }, () => {
      kit.box({ x: 0, y: 0, z: 0, w: 0.012, h: 0.35, d: 0.012, mat: 'sz_paint_green', tint: '#5a5a38' });
      sphere(kit, 0, 0.37, 0, 0.045, 'sz_fabric', kit.pick(['#6a3a2e', '#7a5a3a', '#5e4a40', '#8a6a4a']), 5);
    });
  }
}

// ==================================================================================================== block fills
// Plain masses that close the block interiors inside the zone (heights match the neighbours: only the faces that show
// above a lower neighbour or close a spawn pocket are built).
function fills(kit) {
  // strips x ±24..26 (z 26..40): the west one reads as one building with the west zone's fill (concrete, 21.6 m), the
  // east one with the east zone's F_S1 (dark brick, 16.9 m)
  mass(kit, rect(-26, 26, -24, 40), BY + 21.5, { mat: 'concrete_wall', tint: '#b5ab94', show: [{ side: 'E', at: -24, span: [26, 38], from: BY + 18.1 }, { side: 'S', at: 40, span: [-26, -24], from: BY + 14.7 }] });
  mass(kit, rect(24, 26, 26, 40), BY + 16.8, { mat: 'brick_dark', tint: '#b9aca2', show: [{ side: 'W', at: 24, span: [38, 40], from: BY + 7.9 }] });
  const party = (o) => ({ cols: [], belts: false, plinth: false, room: 0.8, win: { w: 1.0, h: 1.45, ac: 0.06, states: WIN_STATES_POOR }, ...o });
  // F_SW behind X_S1 (x -38..-8, z 72..84), 6F; its east wall closes the lane pocket (z 72..76)
  block(kit, {
    id: 'F_SW', x0: -38, x1: -8, z0: 72, z1: 84, floors: F(4.5, 6), parapet: 0.9, mat: 'brick_dark', tint: '#b6a89d', trim: 'trim_concrete', trimTint: '#99938a',
    cornice: { kind: 'simple', mat: 'trim_concrete', tint: '#8f897f' }, win: { w: 1.0, h: 1.45, sill: 0.9, ac: 0.08, states: WIN_STATES_POOR },
    faces: [{
      side: 'E', span: [72, 76], cols: [2.0], pipes: [0.25],
      ground: () => [
        { x: 0.6, w: 1.1, y: BY + 0.02, h: 2.3, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#4f544e', step: false },
        { x: 2.3, w: 1.3, y: BY + 1.0, h: 1.6, type: 'window', state: 'boarded', frame: 'frame_dark' },
      ],
      decor: () => { posterWall(kit, 0.5, 1.8, BY + 2.5, BY + 3.4, 0.02, 2, ['NO', null]); streaks(kit, 0.1, 3.9, BY + 21.4, 3, 0.004); },
    }],
    extra: (c) => waterTank(kit, [-16.5, 78.5], c.top + 0.02, 1.5, 3.0),
  });
  // F_SE behind X_S2 (x 8..38, z 72..84), 6F: shows one storey over X_S2, its west wall closes the lane pocket
  block(kit, {
    id: 'F_SE', x0: 8, x1: 38, z0: 72, z1: 84, floors: F(4.5, 6), parapet: 0.9, mat: 'brick_red', tint: '#bfa293', trim: 'trim_concrete', trimTint: '#a59e92',
    cornice: { kind: 'simple', mat: 'trim_concrete', tint: '#8f897f' }, win: { w: 1.0, h: 1.45, sill: 0.9, ac: 0.08, states: WIN_STATES_POOR },
    faces: [
      party({ side: 'N', from: BY + 18.1, cols: [2.5, 6.5, 10.5, 14.5, 18.5, 22.5, 26.5], floors: [5, 5] }),
      {
        side: 'W', span: [72, 76], cols: [2.0], pipes: [3.75],
        ground: () => [
          { x: 0.4, w: 1.3, y: BY + 1.0, h: 1.6, type: 'window', state: 'boarded', frame: 'frame_dark' },
          { x: 2.3, w: 1.1, y: BY + 0.02, h: 2.3, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#575c56', step: false },
        ],
        decor: () => { textLine(kit, 'KEEP OUT', { font: 'sans', h: 0.18, x: 2.85, y: BY + 1.5, z: -0.12, align: 'center', mat: 'sz_paint_red', italic: 0.12, maxW: 1.0 }); streaks(kit, 0.1, 3.9, BY + 21.4, 3, 0.004); },
      },
    ],
  });
  // F_END: HOTEL BELMONT (x -8..8, z 76..84), 7F - closes the South Lane pocket and the whole avenue vista
  block(kit, {
    id: 'F_END', x0: -8, x1: 8, z0: 76, z1: 84, floors: F(4.5, 7), parapet: 1.1, mat: 'brick_red', tint: '#bf9584', groundMat: 'concrete_wall', groundTint: '#b9b2a2',
    trim: 'trim_stone', trimTint: '#d8ceba', cornice: { kind: 'stone', mat: 'trim_stone', tint: '#d0c6b2' }, plinthMat: 'concrete_dirty', plinthTint: '#5c5852',
    win: { w: 1.2, h: 1.9, sill: 0.9, lintel: 'trim_stone', ac: 0.12 },
    faces: [
      {
        side: 'N', cols: [2.0, 5.0, 8.0, 11.0, 14.0], pipes: [0.25], lit: [[3, 1], [6, 3], [4, 4], [2, 2]],
        mod: (f, k, op) => { if (k === 4) { op.ac = false; } return op; },
        ground: () => [
          { x: 0.5, w: 4.2, y: BY + 0.02, h: 3.6, type: 'garage', shutter: 0.42, shutterTint: '#6f7570' },
          { x: 5.6, w: 4.6, y: BY + 0.02, h: 3.4, type: 'shop', state: 'boarded', frame: 'frame_dark' },
          { x: 11.2, w: 4.2, y: BY + 0.02, h: 3.0, type: 'shop', state: 'dark', frame: 'frame_dark', kick: 'trim_metal', mullions: [3, 1], room: 1.8 },
        ],
        decor: (e, ops, ctx) => hotelFront(kit, ops, ctx),
      },
      { side: 'W', from: BY + 21.5, cols: [], belts: false, plinth: false },
      { side: 'E', from: BY + 21.5, cols: [], belts: false, plinth: false },
    ],
    extra: (c) => {
      waterTank(kit, [3.0, 80.5], c.top + 0.02, 1.4, 2.8);
      for (const x of [-5.0, -2.0]) kit.cyl({ x, y: c.top, z: 79.0, r: 0.025, h: 3.2, seg: 5, mat: 'steel', tint: '#7e7f7c' });
    },
  });
}
/** HOTEL BELMONT street front (wall-local, x 0..16 from the lane's east side): service door half open with a lit cage
 *  lamp (zombies come out of it in silhouette), the boarded entrance under a marquee, a tall dead HOTEL blade sign. */
function hotelFront(kit, ops, ctx) {
  const zf = board(kit, 5.3, 10.5, BY + 3.55, 0.75, { mat: 'sign_white', tint: '#e2d8c2', d: 0.1, border: { mat: 'sign_white', tint: '#7a2a24', w: 0.03 } });
  textLine(kit, 'HOTEL BELMONT', { font: 'serif', h: 0.36, x: 7.9, y: BY + 3.73, z: zf, align: 'center', mat: 'sz_paint_red', tint: '#8a2a22', maxW: 4.8 });
  // marquee canopy over the entrance (thin steel deck on rods), dead bulbs along its edge
  kit.box({ x: 7.9, y: BY + 3.35, z: 0.8, w: 5.6, h: 0.18, d: 1.6, mat: 'paint_metal', tint: '#5a3a30' });
  for (let x = 5.4; x < 10.5; x += 0.35) kit.cyl({ x, y: BY + 3.3, z: 1.58, r: 0.03, h: 0.05, seg: 6, mat: 'lamp_off' });
  for (const x of [5.6, 10.2]) kit.sweep(circle(0.015, 5), [[x, BY + 3.53, 1.5], [x, BY + 5.0, 0.02]], 'steel_dark', { smooth: false });
  plywood(kit, 5.65, 10.15, BY + 0.05, BY + 3.35, 0.05, { tint: '#bfae92', mark: 'NO ENTRY' });
  kit.sandbags([[5.8, 0.75], [10.0, 0.75]], { rows: 3, y: SW });
  // service door: the cage lamp is lit (baked) - the pocket's only light
  workLight(kit, [2.6, BY + 4.2, 0.02], 0, true);
  textLine(kit, 'SERVICE', { font: 'hwy', h: 0.16, x: 2.6, y: BY + 3.72, z: 0.02, align: 'center', mat: 'sz_paint_white' });
  posterWall(kit, 11.3, 15.3, BY + 1.9, BY + 2.9, -0.14, 5, ['EVACUATE', 'MISSING', null]);
  // HOTEL blade: vertical cream box sign, dead bulb border, red letters, on brackets at the east end
  kit.at({ x: 15.25, y: 0, z: 0 }, () => {
    const y0 = BY + 6.3, hh = 9.0;
    for (const yy of [y0 + 0.4, y0 + hh / 2, y0 + hh - 0.4]) kit.box({ x: 0, y: yy, z: 0.65, w: 0.06, h: 0.07, d: 1.3, mat: 'steel_dark' });
    kit.bbox({ x: 0, y: y0, z: 0.9, w: 0.26, h: hh, d: 1.1, bevel: 0.03, mat: 'sign_white', tint: '#e6dcc4' });
    for (const s of [-1, 1]) kit.at({ x: s * 0.132, rot: s * PI / 2 }, () => {
      const cz = -s * 0.9;
      textVertical(kit, 'HOTEL', { font: 'slab', h: 1.05, pitch: 1.65, x: cz, yTop: y0 + hh - 0.55, z: 0.004, mat: 'sz_paint_red', tint: '#b8322a' });
      for (let y = y0 + 0.2; y < y0 + hh - 0.1; y += 0.45) for (const dx of [-0.45, 0.45]) kit.cyl({ x: cz + dx, y, z: 0.004, r: 0.03, h: 0.04, seg: 6, mat: 'lamp_off', rx: PI / 2 });
    });
  });
  for (const op of ops.filter((o) => o.type === 'window' && o.fi === 2)) balconette(kit, op, 'trim_stone', '#d8ceba');
  for (const op of ops.filter((o) => o.type === 'window' && o.y > 4)) hood(kit, op, 'key', 'trim_stone', '#d8ceba');
  streaks(kit, 0.2, 15.8, ctx.top - 0.3, 10, 0.004, [1.5, 4.0]);
}

// ==================================================================================================== pocket end walls
// Facade slabs (0.35 m) closing the cross-street pockets at x = ±38 (the skyline blocks behind are someone else's).
function endWalls(kit) {
  const common = { floors: F(4.5, 5), parapet: 0, roof: false, mat: 'brick_red', trim: 'trim_concrete', trimTint: '#a39c90', cornice: { kind: 'simple', mat: 'trim_concrete', tint: '#8f897f' },
    win: { w: 1.1, h: 1.6, sill: 0.9, lintel: 'trim_concrete', ac: 0.05, states: WIN_STATES_POOR }, plinthMat: 'concrete_dirty', plinthTint: '#5c5852', coping: 'trim_concrete' };
  const front = (side, mark) => ({
    side, cols: [1.6, 5.0, 8.4], pipes: [9.75],
    ground: () => [
      { x: 0.3, w: 1.1, y: BY + 1.0, h: 1.6, type: 'window', state: 'boarded', frame: 'frame_dark' },
      { x: 2.2, w: 4.4, y: BY + 0.02, h: 3.6, type: 'garage', shutter: 0.5, shutterTint: '#6e746e' },
      { x: 8.2, w: 1.1, y: BY + 0.02, h: 2.3, type: 'door', state: 'closed', door: 'paint_metal', doorTint: '#575c56', step: false },
    ],
    decor: (e, ops, ctx) => {
      textLine(kit, mark, { font: 'sans', h: 0.42, x: 4.4, y: BY + 2.9, z: -0.12, align: 'center', mat: 'sz_paint_red', italic: 0.15, maxW: 4.2 });
      posterWall(kit, 6.8, 8.0, BY + 1.0, BY + 3.0, 0.02, 3, ['QUARANTINE', null]);
      workLight(kit, [4.4, BY + 4.5, 0.02], 0, true);
      streaks(kit, 0.2, 9.8, ctx.top - 0.2, 6, 0.004, [1.5, 3.5]);
    },
  });
  block(kit, { id: 'END_W', x0: -37.97, x1: -37.62, z0: 48, z1: 58, tint: '#b39184', ...common, faces: [front('E', 'NO EXIT')] });
  block(kit, { id: 'END_E', x0: 37.62, x1: 37.97, z0: 48, z1: 58, tint: '#a98a7e', ...common, faces: [front('W', 'DEAD END')] });
}

// ==================================================================================================== cross street barricades
// Quarantine fences at x = ±30.2 (S_BARR_X*): chain-link construction panels on concrete feet, barbed wire, a panel
// pushed over in the pocket; the layout's gap (1.4 m) is narrowed to the 0.64 m zombie slot by a torn mesh flap and a
// post. Player clips BLK_SX_W / E start at the fence top. The pockets behind: dumpsters + trash (west), the burnt car
// S_CAR_XE + a dumpster (east), closed by the end-wall facades.
function crossBarricades(kit, L) {
  crossFence(kit, -30.2, [[48.06, 50.6], [52.0, 55.0], [55.0, 57.94]], SLOT_W, [50.6, 52.0], 1, 53.6);
  crossFence(kit, 30.2, [[48.06, 51.0], [51.0, 54.0], [55.4, 57.94]], SLOT_E, [54.0, 55.4], -1, 52.4);
  // playable side: low sandbag walls (crouch cover) beside the slots, ROAD CLOSED sawhorses, cones, a fire barrel
  kit.sandbags([[-28.5, 52.7], [-28.5, 55.5]], { rows: 3 });
  kit.sandbags([[28.5, 50.5], [28.5, 53.3]], { rows: 3 });
  for (const [x, z, r, f] of [[-27.4, 54.6, 0.2, false], [-26.9, 52.4, -0.4, true], [27.2, 50.9, 0.3, false], [26.8, 54.8, 0.9, true], [-28.9, 56.6, 0, false], [29.0, 49.4, 0, false]]) kit.cone([x, z], { fallen: f, y: Math.abs(z - 53) > 3 ? SW : 0 });
  kit.at({ x: -26.6, y: 0, z: 55.1, rot: PI / 2 - 0.15 }, () => roadClosed(kit, 1.7));
  kit.at({ x: 26.7, y: 0, z: 52.0, rot: PI / 2 + 0.2 }, () => roadClosed(kit, 1.7));
  fireBarrel(kit, [-27.3, 49.0], SW);
  kit.tape([[-29.9, 1.0, 48.4], [-28.0, 0.95, 50.3], [-28.4, 0.95, 52.6]]);
  kit.tape([[29.9, 1.0, 57.6], [28.1, 0.95, 55.9], [28.5, 0.95, 53.4]]);
  // west pocket: two dumpsters (one tipped), trash, newspapers
  dumpster(kit, [-35.9, 49.35], 0, SW);
  kit.at({ x: -33.4, y: SW + 0.6, z: 56.9, rx: -PI / 2 + 0.05 }, () => dumpster(kit, [0, 0], 0, -0.62));
  trashPile(kit, [-37.0, 55.4], 0, 4, true);
  trashPile(kit, [-31.5, 49.3], SW, 3);
  kit.debris([-34.0, 53.5], { r: 2.6, count: 14, kinds: ['paper', 'paper', 'brick', 'plank'] });
  kit.prop('metal_trash_can', { at: [-31.6, 56.7], y: SW, rot: 1.2, rz: PI / 2, collide: false });
  // east pocket: S_CAR_XE (burnt), a dumpster, trash
  const car = L.PROPS.find((p) => p.id === 'S_CAR_XE');
  kit.vehicle({ type: 'sedan', at: [car.x, car.z], rot: car.rot, state: 'burnt', tilt: 0.03, y: -0.08 });
  kit.decal({ at: [car.x, car.z], size: [6.0, 3.2], rot: -car.rot, mat: 'decal_stain', tint: '#3a3430' });
  dumpster(kit, [35.9, 56.65], 0, SW);
  trashPile(kit, [33.4, 57.1], SW, 3, true);
  kit.debris([34.0, 54.8], { r: 2.2, count: 12, kinds: ['paper', 'brick', 'brick', 'plank'] });
  kit.prop('old_tyre', { at: [31.4, 49.2], y: SW, rot: 0.4 });
}
/** One cross-street fence at x: panels [[z0, z1]...], slot [s0, s1] inside gap [g0, g1]; side = +1 when the playable
 *  street lies at +x of the fence. signZ = where the QUARANTINE board hangs (on a panel). */
function crossFence(kit, x, panels, slot, gap, side, signZ) {
  panels.forEach(([a, b], i) => fencePanel(kit, [x, a], [x, b], 2.3, { y: 0, lean: [0.02, -0.03, 0.03][i % 3], tint: '#a3a7a8', feet: [0.3, b - a - 0.3] }));
  // fillers each side of the slot: a bent post + torn mesh flap folded into the pocket (collision = exact boxes)
  for (const [z0, z1, post] of [[gap[0], slot[0], gap[0] + 0.03], [slot[1], gap[1], gap[1] - 0.03]]) {
    kit.colBox({ x, y: 0, z: (z0 + z1) / 2, w: 0.3, h: 2.45, d: z1 - z0 }, 'metal');
    kit.at({ x, y: 0, z: post, rz: 0, rx: (post < (z0 + z1) / 2 ? 1 : -1) * 0.05 }, () => kit.cyl({ x: 0, y: 0, z: 0, r: 0.032, h: 2.35, seg: 6, mat: 'steel', tint: '#9a9da0' }));
    const zEdge = post < (z0 + z1) / 2 ? z1 : z0;
    kit.face([[x, 0.25, post], [x - side * 0.45, 0.2, zEdge], [x - side * 0.5, 2.1, zEdge], [x, 2.3, post]], 'chainlink', { uvs: [[0, 0.25], [0.6, 0.2], [0.6, 2.1], [0, 2.3]] });
  }
  for (const y of [1.5, 2.0]) kit.sweep(circle(0.006, 4), [[x, y, gap[0] + 0.03], [x - side * 0.35, y - 0.25, (slot[0] + slot[1]) / 2], [x - side * 0.2, y - 0.6, slot[1] - 0.1]], 'wire', { smooth: true });
  // the panel that used to close the gap, pushed over flat in the pocket
  kit.at({ x: x - side * 2.0, y: 0.07, z: (gap[0] + gap[1]) / 2 + 0.6, rot: side * 0.7 }, () => {
    kit.sweep(circle(0.022, 6), [[-1.3, 0, -1.05], [1.3, 0, -1.05], [1.3, 0, 1.05], [-1.3, 0, 1.05], [-1.3, 0, -1.05]], 'steel', { smooth: false, tint: '#9a9ea0' });
    kit.upFace([[-1.28, 0.005, -1.03], [1.28, 0.005, -1.03], [1.28, 0.005, 1.03], [-1.28, 0.005, 1.03]], 'chainlink', [[0, 0], [2.56, 0], [2.56, 2.06], [0, 2.06]], {});
  });
  // barbed wire along the top, BLK_SX_* clip from the fence top, QUARANTINE board facing the street, a STOP plate
  for (const k of [0, 1]) kit.sweep(circle(0.005, 4), [[x, 2.42 + k * 0.12, 48.1], [x, 2.36 + k * 0.12, 53], [x, 2.44 + k * 0.12, 57.9]], 'wire', { smooth: true });
  kit.colBox({ x, y: 2.45, z: 53, w: 0.6, h: 5.55, d: 10 }, 'metal');
  kit.at({ x: x + side * 0.06, y: 1.05, z: signZ, rot: side > 0 ? FACE.E : FACE.W }, () => quarantineSign(kit, 1.8, 1.05));
  kit.at({ x: x + side * 0.06, y: 1.35, z: signZ + 1.55 * side, rot: side > 0 ? FACE.E : FACE.W, rz: 0.06 }, () => { const z2 = board(kit, -0.4, 0.4, 0, 0.55, { mat: 'sign_white', tint: '#b8382a', d: 0.02 }); textLine(kit, 'STOP', { font: 'sans', h: 0.22, x: 0, y: 0.17, z: z2, align: 'center', mat: 'sz_paint_white' }); });
}
/** Striped ROAD CLOSED sawhorse board (local frame, faces +z). */
function roadClosed(kit, w) {
  sawhorse(kit, w);
  const zf = board(kit, -w / 2 + 0.1, w / 2 - 0.1, 0.62, 0.3, { mat: 'sign_white', tint: '#e6e2d8', d: 0.02, z: 0.04 });
  textLine(kit, 'ROAD CLOSED', { font: 'sans', h: 0.14, x: 0, y: 0.7, z: zf, align: 'center', mat: 'sz_paint_red', maxW: w - 0.4 });
}

// ==================================================================================================== LM_TRUCK_BARRICADE
// White moving truck jack-knifed across the South Lane (cab east, rear swing doors open), crate walls each side, the
// zombie slot x -4.07..-3.43 (centre -3.75) between the west crates and the truck's rear, BLK_S_TRUCK above.
// The butcher breaks it in round 5: the intact state is static geometry, the break is exported as data (objective
// S_TRUCK_BREAK): the truck's shoved pose and every pre-fractured crate with its scatter target.
function truckBarricade(kit, L) {
  const LM = L.LANDMARKS.truckBarricade, T = LM.parts.find((p) => p.kind === 'box_truck');
  movingTruck(kit, T);
  const pieces = [];
  const [cw, ce] = LM.parts.filter((p) => p.kind === 'crates');
  crateStack(kit, cw, 3, { px: true, nx: false }, pieces);
  crateStack(kit, ce, 2, { px: false, nx: false }, pieces);
  // slot fillers: a pallet + plank leaning on the west crates, a toppled dresser + rolled mattress against the truck
  const [s0, s1] = SLOT_T;
  kit.colBox({ x: (-4.4 + s0) / 2, y: 0, z: 69.3, w: s0 + 4.4, h: 2.6, d: 2.6 }, 'wood');
  kit.colBox({ x: (s1 + -3.0) / 2, y: 0, z: 69.25, w: -3.0 - s1, h: 2.4, d: 3.3 }, 'wood');
  kit.at({ x: -4.27, y: 0, z: 68.6, rot: PI / 2, rx: 0.12 }, () => pallet(kit));
  kit.at({ x: -4.2, y: 0.02, z: 70.15, rot: PI / 2 + 0.08, rz: 0.95 }, () => kit.box({ x: 0, y: 0, z: 0, w: 2.4, h: 0.16, d: 0.05, mat: 'sz_wood', tint: '#9a8064' }));
  kit.at({ x: -3.22, y: 0, z: 68.7, rot: 0.12, rz: 0.08 }, () => {
    kit.box({ x: 0, y: 0, z: 0, w: 0.4, h: 1.3, d: 1.05, mat: 'sz_wood', tint: '#6a4a34' });
    for (let i = 0; i < 3; i++) kit.box({ x: -0.205, y: 0.15 + i * 0.38, z: 0, w: 0.012, h: 0.32, d: 0.95, mat: 'sz_wood', tint: '#5a3e2c' });
  });
  kit.at({ x: -3.2, y: 0, z: 70.05, rot: 0.2 }, () => kit.cyl({ x: 0, y: 0, z: 0, r: 0.2, h: 1.9, seg: 9, mat: 'sz_fabric', tint: '#b8b0a0' }));
  // BLK_S_TRUCK: player clip over the whole barricade (from the crate tops, never touching the nav grid)
  kit.colBox({ x: 0, y: 2.6, z: 69.3, w: 16, h: 5.4, d: 2.6 }, 'wood');
  // dressing on the player side: sandbags against the west crates, a fire barrel, a quarantine board on the crates
  kit.sandbags([[-7.9, 67.55], [-5.6, 67.55]], { rows: 4, y: SW });
  fireBarrel(kit, [-6.7, 66.5], SW);
  kit.at({ x: -6.2, y: 1.3, z: 68.06, rot: FACE.N }, () => quarantineSign(kit, 1.6, 0.94));
  for (const [x, z, f] of [[-2.2, 66.6, false], [3.6, 66.9, true], [-0.4, 67.0, false]]) kit.cone([x, z], { fallen: f });
  kit.debris([1.0, 66.4], { r: 2.4, count: 12, kinds: ['paper', 'paper', 'plank', 'brick'] });
  // the pocket behind (z 70.6..76): trash, a dumpster, loose cargo
  trashPile(kit, [6.6, 74.6], SW, 3, true);
  dumpster(kit, [-6.3, 74.9], PI / 2 + 0.05, SW);
  kit.debris([1.5, 73.8], { r: 2.4, count: 12, kinds: ['paper', 'paper', 'brick'] });
  for (const [x, z, r] of [[-1.9, 71.6, 0.4], [2.8, 72.6, 1.1], [4.4, 71.4, 2.0]]) kit.box({ x, y: 0, z, rot: r, w: 0.55, h: 0.42, d: 0.45, mat: 'sign_white', tint: kit.pick(['#b8925e', '#a88452', '#c4a272']) });

  // break data for the runtime (round 5): shoved pose + crate scatter targets (north, away from the butcher)
  // shoved ~3 m north-east and swung towards the lane axis (cab end over the east curb): the west half of the lane opens
  const shoved = { pos: [+(T.x + 2.2).toFixed(2), 0, +(T.z - 2.2).toFixed(2)], rot: 1.0, roll: 0.04 };
  kit.objective({
    id: 'S_TRUCK_BREAK', type: 'bossBreak', zone: 'south', round: 5, boss: 'butcher', landmark: LM.id,
    trigger: { pos: [0, 0, 72], note: 'the butcher walks z 72 -> 30 (BOSS_ARENAS.mid.intro) and hits the barricade at ~z 70.6' },
    truck: { size: [T.w, T.h, T.d], intact: { pos: [T.x, 0, T.z], rot: T.rot }, shoved },
    pieces: pieces.map((p, i) => ({ ...p, to: { pos: [+(p.pos[0] + kit.rnd(-1.2, 1.2)).toFixed(2), 0, +(p.pos[2] - kit.rnd(2.0, 5.5)).toFixed(2)], rot: +kit.rnd(-PI, PI).toFixed(3), rx: +(i % 3 ? PI / 2 : 0).toFixed(3), delay: +(0.05 * i).toFixed(2) } })),
    clear: { colliders: [{ box: [0, 0, 69.3, 16, 8, 2.6], note: 'barricade + BLK_S_TRUCK' }], nav: { rect: [-8, 67.5, 8, 71.1], note: 'whole lane walkable after the break' } },
    after: { colliders: [{ box: [shoved.pos[0], 0, shoved.pos[2], T.w, 3.4, T.d], rot: shoved.rot, note: 'shoved truck' }] },
    note: 'static package draws the intact barricade; the runtime breakable takes these pieces over',
  });
}
/** Crate wall over a layout box b {x, z, w, d, h}: n columns x 2 rows x 2 layers of pre-fractured 1.3 m crates. Only the
 *  faces that can be seen are built (north = lane side, south = pocket side, top, ends per `ends`). */
function crateStack(kit, b, n, ends, pieces) {
  const cw = b.w / n, cd = b.d / 2, ch = b.h / 2, x0 = b.x - b.w / 2, z0 = b.z - b.d / 2;
  for (let i = 0; i < n; i++) for (let r = 0; r < 2; r++) for (let l = 0; l < 2; l++) {
    const cx = x0 + (i + 0.5) * cw + kit.rnd(-0.03, 0.03), cz = z0 + (r + 0.5) * cd + kit.rnd(-0.02, 0.02), y = l * ch, rot = kit.rnd(-0.03, 0.03) + (l ? kit.rnd(-0.04, 0.04) : 0);
    const t = kit.pick(['#bfa47a', '#b49a70', '#c8ae84', '#a99064']);
    const faces = { bottom: false, top: l === 1 ? undefined : false, nz: r === 0 ? undefined : false, pz: r === 1 ? undefined : false, px: i === n - 1 && ends.px ? undefined : false, nx: i === 0 && ends.nx ? undefined : false };
    kit.at({ x: cx, y, z: cz, rot }, () => {
      kit.box({ x: 0, y: 0, z: 0, w: cw - 0.04, h: ch - 0.02, d: cd - 0.04, mat: 'sz_wood', tint: t, uvOffset: [kit.rnd(0, 3), kit.rnd(0, 3)], faces });
      const deco = (key, rotF, W, D) => kit.at({ rot: rotF }, () => {
        const z = D / 2 + 0.012, bt = shadeHex(t, 0.72);
        for (const yy of [0.02, ch - 0.13]) kit.box({ x: 0, y: yy, z, w: W, h: 0.1, d: 0.025, mat: 'sz_wood', tint: bt });
        for (const xx of [-W / 2 + 0.05, W / 2 - 0.05]) kit.box({ x: xx, y: 0.02, z, w: 0.1, h: ch - 0.05, d: 0.025, mat: 'sz_wood', tint: bt });
        const len = Math.hypot(W - 0.2, ch - 0.25), ang = Math.atan2(ch - 0.25, W - 0.2) * (kit.chance(0.5) ? 1 : -1);
        kit.at({ x: 0, y: ch / 2, z: z + 0.01, rz: ang }, () => kit.box({ x: 0, y: -0.05, z: 0, w: len, h: 0.1, d: 0.02, mat: 'sz_wood', tint: shadeHex(t, 0.8) }));
        if (key === 'nz' && kit.chance(0.7)) textLine(kit, kit.pick(['FRAGILE', 'THIS SIDE UP', 'LT-07', 'NMS 1146', 'KEEP DRY', 'NO HOOKS']), { font: 'sans', h: 0.075, x: kit.rnd(-0.2, 0.2), y: ch * kit.rnd(0.62, 0.78), z: z + 0.015, align: 'center', mat: 'sz_paint', shade: 0.6, maxW: W - 0.3 });
      });
      if (faces.nz !== false) deco('nz', PI, cw - 0.04, cd - 0.04);
      if (faces.pz !== false) deco('pz', 0, cw - 0.04, cd - 0.04);
      if (faces.px !== false) deco('px', PI / 2, cd - 0.04, cw - 0.04);
    });
    pieces.push({ kind: 'crate', size: [+(cw - 0.04).toFixed(2), +(ch - 0.02).toFixed(2), +(cd - 0.04).toFixed(2)], pos: [+cx.toFixed(2), +y.toFixed(2), +cz.toFixed(2)], rot: +rot.toFixed(3), tint: t, fragments: ['lid', 'side', 'side', 'side', 'side', 'base'] });
  }
  kit.colBox({ x: b.x, y: 0, z: b.z, w: b.w, h: b.h, d: b.d }, 'wood');
}
/** NORTHERN MOVING & STORAGE box truck (local +x = front): conventional cab, box body x -4.1..1.4, rear swing doors
 *  thrown open (north leaf folded back, south leaf hanging into the pocket), cargo spilling, spray paint. */
function movingTruck(kit, T) {
  const WHITE = '#dcdad2', BOXW = '#e6e4dc', GREEN = '#3e6a4c';
  kit.decal({ at: [T.x - 0.3, T.z], size: [6.4, 3.0], rot: -T.rot, mat: 'decal_stain' });
  kit.at({ x: T.x, y: 0, z: T.z, rot: T.rot }, () => {
    const grime = { y: 0, h: 1.4, k: 0.45 };
    // ---- chassis rails, cross members, fuel tank, battery box, exhaust
    for (const z of [-0.45, 0.45]) kit.box({ x: 0, y: 0.7, z, w: 7.9, h: 0.24, d: 0.09, mat: 'steel_dark', tint: '#2e2c2a' });
    for (const x of [-3.7, -1.4, 0.9, 3.4]) kit.box({ x, y: 0.73, z: 0, w: 0.1, h: 0.16, d: 0.9, mat: 'steel_dark', tint: '#2e2c2a' });
    kit.at({ x: 0.4, y: 0.76, z: -0.95, rz: PI / 2 }, () => kit.cyl({ x: 0, y: -0.55, z: 0, r: 0.26, h: 1.1, seg: 12, mat: 'steel', tint: '#a8aaa6' }));
    kit.box({ x: 0.45, y: 0.48, z: 0.95, w: 0.7, h: 0.5, d: 0.45, mat: 'car_plastic', tint: '#262626' });
    kit.cyl({ x: 1.45, y: 0.6, z: -1.08, r: 0.07, h: 2.6, seg: 8, mat: 'steel', tint: '#6d6a64' });
    // ---- wheels: front single (the right one flat), rear duals
    const tyre = (x, z, r, w, flatK = 1) => kit.at({ x, y: r * flatK, z, rx: PI / 2 }, () => {
      kit.cyl({ x: 0, y: -w / 2, z: 0, r, h: w, seg: 18, mat: 'rubber', bottom: true });
      const s = z > 0 ? 1 : -1;
      kit.cyl({ x: 0, y: s > 0 ? w / 2 - 0.01 : -w / 2 - 0.012, z: 0, r: r * 0.6, h: 0.022, seg: 12, mat: 'steel', tint: '#9a9790' });
      kit.cyl({ x: 0, y: s > 0 ? w / 2 + 0.005 : -w / 2 - 0.05, z: 0, r: r * 0.2, h: 0.045, seg: 8, mat: 'steel_dark', tint: '#4a4844' });
    });
    tyre(2.95, 0.98, 0.5, 0.3, 0.84); tyre(2.95, -0.98, 0.5, 0.3);
    for (const z of [-0.98, -0.66, 0.66, 0.98]) tyre(-2.5, z, 0.5, 0.29);
    // ---- hood + fenders + grille (conventional nose x 3.0..4.1)
    const hood = [];
    for (const s of [-1, 1]) hood.push([3.0, 0.82, s * 1.0], [4.08, 0.82, s * 0.98], [4.02, 1.6, s * 0.9], [3.0, 1.74, s * 0.98]);
    kit.hull(hood, 'car_paint', { tint: WHITE, grime });
    for (const s of [-1, 1]) kit.bbox({ x: 3.25, y: 0.82, z: s * 1.06, w: 1.45, h: 0.5, d: 0.32, bevel: 0.08, mat: 'car_paint', tint: shadeHex(WHITE, 0.95), taper: { top: [0.85, 0.8] } });
    kit.face([[4.085, 0.88, 0.72], [4.085, 0.88, -0.72], [4.04, 1.5, -0.66], [4.04, 1.5, 0.66]], 'car_plastic', { tint: '#1a1a1a' });
    for (let i = 0; i < 6; i++) { const y = 0.95 + i * 0.09; kit.box({ x: 4.08, y, z: 0, w: 0.03, h: 0.025, d: 1.36, mat: 'car_chrome', tint: '#9a9c9a' }); }
    for (const s of [-1, 1]) {
      kit.at({ x: 4.06, y: 1.2, z: s * 0.82, rz: -PI / 2 }, () => { kit.cyl({ x: 0, y: 0, z: 0, r: 0.13, h: 0.05, seg: 12, mat: 'car_chrome', tint: '#8a8c8a' }); kit.cyl({ x: 0, y: 0.05, z: 0, r: 0.1, h: 0.01, seg: 12, mat: s > 0 ? 'glass_dirty' : 'car_light' }); });
      kit.box({ x: 4.0, y: 0.92, z: s * 1.02, w: 0.06, h: 0.07, d: 0.16, mat: 'lamp_off', tint: '#a86a2a' });
    }
    kit.at({ x: 4.18, y: 0.45, z: 0, rot: 0.06, rz: 0.02 }, () => kit.bbox({ x: 0, y: 0, z: 0, w: 0.16, h: 0.3, d: 2.42, bevel: 0.03, mat: 'steel', tint: '#9a9c9a' }));
    kit.at({ x: 4.0, y: 1.64, z: 0 }, () => textLine(kit, 'NM', { font: 'slab', h: 0.07, x: 0, y: 0, z: 0, align: 'center', mat: 'car_chrome' }));
    // ---- cab x 1.5..3.0 (roof 2.85): windshield over the hood (smashed right pane), side windows, doors, mirrors
    const xb = 1.5, xf = 3.0, y0 = 0.82, y1 = 2.85, hw = 1.12;
    kit.face([[xf, 1.74, hw], [xf, 1.74, -hw], [xf - 0.12, y1, -hw * 0.96], [xf - 0.12, y1, hw * 0.96]], 'car_paint', { tint: WHITE, holes: [[[xf - 0.015, 1.84, 1.0], [xf - 0.015, 1.84, -1.0], [xf - 0.1, 2.72, -0.96], [xf - 0.1, 2.72, 0.96]]] });
    kit.face([[xf - 0.03, 1.84, 0.03], [xf - 0.03, 1.84, -1.0], [xf - 0.11, 2.72, -0.96], [xf - 0.11, 2.72, 0.03]], 'car_glass');
    kit.face([[xf - 0.03, 1.84, 1.0], [xf - 0.03, 1.84, 0.03], [xf - 0.11, 2.72, 0.03], [xf - 0.11, 2.72, 0.96]], 'car_interior', { tint: '#0e0e0e' });
    for (let i = 0; i < 5; i++) { const zA = kit.rnd(0.15, 0.9), yA = kit.rnd(1.9, 2.6); kit.face([[xf - 0.06, yA, zA], [xf - 0.06, yA, zA + kit.rnd(0.08, 0.2)], [xf - 0.08, yA + kit.rnd(0.08, 0.18), zA + 0.05]], 'glass_dirty'); }
    for (const s of [1, -1]) {
      const side = [[xb, y0, s * hw], [xf, y0, s * hw], [xf, 1.74, s * hw], [xf - 0.12, y1, s * hw * 0.96], [xb, y1, s * hw * 0.96]];
      kit.face(s > 0 ? side : side.slice().reverse(), 'car_paint', { tint: WHITE, grime });
      const win = [[xb + 0.15, 1.75, s * (hw + 0.004)], [xf - 0.12, 1.75, s * (hw + 0.004)], [xf - 0.2, 2.68, s * (hw * 0.96 + 0.004)], [xb + 0.15, 2.68, s * (hw * 0.96 + 0.004)]];
      kit.face(s > 0 ? win : win.slice().reverse(), s > 0 ? 'car_interior' : 'car_glass', { tint: s > 0 ? '#101010' : undefined });
      for (const [xa, xb2] of [[xb + 0.08, xb + 0.11], [xf - 0.08, xf - 0.05]]) { const q = [[xa, 0.9, s * (hw + 0.005)], [xb2, 0.9, s * (hw + 0.005)], [xb2, 2.68, s * (hw + 0.005)], [xa, 2.68, s * (hw + 0.005)]]; kit.face(s > 0 ? q : q.slice().reverse(), 'car_plastic', { tint: '#1a1a1a' }); }
      kit.box({ x: xf - 0.35, y: 1.45, z: s * (hw + 0.02), w: 0.2, h: 0.04, d: 0.03, mat: 'car_chrome' });
      kit.sweep(circle(0.02, 6), [[xf - 0.1, 2.4, s * hw], [xf + 0.15, 2.45, s * (hw + 0.35)], [xf + 0.15, 1.85, s * (hw + 0.4)]], 'steel', { smooth: true, tint: '#8a8a86' });
      kit.bbox({ x: xf + 0.16, y: 1.85, z: s * (hw + 0.42), w: 0.08, h: 0.5, d: 0.24, bevel: 0.02, mat: 'car_plastic', tint: '#1e1e1e' });
      kit.box({ x: xb + 0.6, y: 0.5, z: s * (hw + 0.04), w: 0.5, h: 0.04, d: 0.18, mat: 'steel', tint: '#7a7a76' });
    }
    kit.face([[xb, y1, hw * 0.96], [xf - 0.12, y1, hw * 0.96], [xf - 0.12, y1, -hw * 0.96], [xb, y1, -hw * 0.96]], 'car_paint', { tint: '#c4c2ba' });
    kit.at({ x: 2.4, y: 0, z: hw + 0.006, rot: 0 }, () => textLine(kit, 'NMS 7', { font: 'hwy', h: 0.12, x: 0, y: 1.2, z: 0, align: 'center', mat: 'sz_paint_green', tint: GREEN }));
    // ---- box body x -4.1..1.4, floor y 1.0, roof 3.4: ribbed sides, rails, corner posts, livery, spray paint
    const bx0 = -4.1, bx1 = 1.4, by0 = 1.0, by1 = 3.4, bw = 1.25;
    for (const s of [1, -1]) {
      const side = [[bx0, by0 + 0.12, s * bw], [bx1, by0 + 0.12, s * bw], [bx1, by1 - 0.1, s * bw], [bx0, by1 - 0.1, s * bw]];
      kit.face(s > 0 ? side : side.slice().reverse(), 'plaster', { tint: BOXW, grime: { y: 0.9, h: 1.4, k: 0.42 }, uvLocal: true });
      for (let x = bx0 + 0.6; x < bx1 - 0.3; x += 0.62) kit.box({ x, y: by0 + 0.12, z: s * (bw + 0.012), w: 0.05, h: by1 - by0 - 0.22, d: 0.025, mat: 'plaster', tint: shadeHex(BOXW, 0.9), grime: { y: 0.9, h: 1.4, k: 0.42 } });
      for (const [y, h] of [[by0, 0.14], [by1 - 0.12, 0.12]]) kit.box({ x: (bx0 + bx1) / 2, y, z: s * (bw + 0.02), w: bx1 - bx0 + 0.04, h, d: 0.05, mat: 'steel', tint: '#a4a6a2' });
      kit.at({ x: (bx0 + bx1) / 2, y: 0, z: s * (bw + 0.016), rot: s > 0 ? 0 : PI }, () => {
        flat(kit, rect2(-2.65, 1.36, 2.65, 1.48), 0, 'sign_white', { tint: GREEN });
        starShape(kit, -1.95, 2.45, 0.5, 0.001, 'sign_white', GREEN);
        textLine(kit, 'NORTHERN', { font: 'serif', h: 0.44, x: 0.45, y: 2.42, z: 0.002, align: 'center', mat: 'sz_paint_green', tint: GREEN, maxW: 3.5 });
        textLine(kit, 'MOVING & STORAGE', { font: 'sans', h: 0.15, x: 0.45, y: 2.1, z: 0.002, align: 'center', mat: 'sz_paint_green', tint: GREEN, maxW: 3.4 });
        textLine(kit, '北方搬家倉儲', { font: 'cjk', h: 0.16, x: 0.45, y: 1.84, z: 0.002, align: 'center', mat: 'sz_paint_green', tint: GREEN, maxW: 3.0 });
        textLine(kit, 'LOCAL · LONG DISTANCE · LT 4-2210', { font: 'sans', h: 0.08, x: 0.45, y: 1.6, z: 0.002, align: 'center', mat: 'sz_paint', maxW: 3.6, shade: 0.8 });
        if (s < 0) {   // the north side faces the lane: quarantine spray paint over the livery
          textLine(kit, '封城中', { font: 'cjk', h: 0.5, x: -1.1, y: 2.65, z: 0.005, align: 'center', mat: 'sz_paint_red', italic: 0.1 });
          textLine(kit, 'DO NOT ENTER', { font: 'sans', h: 0.28, x: 0.7, y: 1.72, z: 0.005, align: 'center', mat: 'sz_paint_red', italic: 0.18, maxW: 3.6 });
          searchMark(kit, 2.05, 2.55, 0.62, 'sz_paint_red', '10-04');
        } else textLine(kit, 'GO BACK', { font: 'sans', h: 0.3, x: 0.2, y: 1.75, z: 0.005, align: 'center', mat: 'sz_paint_red', italic: 0.18 });
        streaks(kit, -2.7, 2.6, 3.25, 10, 0.003, [0.5, 1.8]);
      });
    }
    kit.face([[bx0, by1, bw], [bx1, by1, bw], [bx1, by1, -bw], [bx0, by1, -bw]], 'metal_worn', { tint: '#d6d2c6', uvLocal: true });
    kit.face([[bx1, by0 + 0.1, bw], [bx1, by0 + 0.1, -bw], [bx1, by1, -bw], [bx1, by1, bw]], 'plaster', { tint: shadeHex(BOXW, 0.88), uvLocal: true });
    for (const x of [bx0, bx1]) for (const s of [-1, 1]) kit.box({ x: x + (x === bx0 ? 0.04 : -0.04), y: by0, z: s * (bw - 0.03), w: 0.1, h: by1 - by0, d: 0.1, mat: 'steel', tint: '#9c9e9a' });
    kit.box({ x: (bx0 + bx1) / 2, y: by0 - 0.12, z: 0, w: bx1 - bx0, h: 0.14, d: 2.4, mat: 'steel_dark', tint: '#3a3836' });
    kit.box({ x: bx0 + 0.04, y: by1 - 0.2, z: 0, w: 0.1, h: 0.2, d: 2.4, mat: 'steel', tint: '#9c9e9a' });
    // the open rear: dark interior, wooden floor, cargo (boxes, a chair, a rolled rug)
    const ix0 = bx0 + 0.06, ix1 = bx1 - 0.04;
    kit.face([[ix1, by0 + 0.12, -bw + 0.06], [ix1, by0 + 0.12, bw - 0.06], [ix1, by1 - 0.1, bw - 0.06], [ix1, by1 - 0.1, -bw + 0.06]].reverse(), 'interior_hidden', { shade: 0.3 });
    for (const s of [1, -1]) { const inn = [[ix0, by0 + 0.12, s * (bw - 0.06)], [ix1, by0 + 0.12, s * (bw - 0.06)], [ix1, by1 - 0.1, s * (bw - 0.06)], [ix0, by1 - 0.1, s * (bw - 0.06)]]; kit.face(s > 0 ? inn.slice().reverse() : inn, 'interior_hidden', { shade: 0.38 }); }
    kit.face([[ix0, by0 + 0.12, -bw + 0.06], [ix1, by0 + 0.12, -bw + 0.06], [ix1, by0 + 0.12, bw - 0.06], [ix0, by0 + 0.12, bw - 0.06]].reverse(), 'sz_wood', { tint: '#5a4a3a' });
    kit.face([[ix0, by1 - 0.1, bw - 0.06], [ix1, by1 - 0.1, bw - 0.06], [ix1, by1 - 0.1, -bw + 0.06], [ix0, by1 - 0.1, -bw + 0.06]].reverse(), 'interior_hidden', { shade: 0.28 });
    for (let i = 0; i < 10; i++) { const s = kit.rnd(0.4, 0.62); kit.box({ x: kit.rnd(-3.2, 0.9), y: by0 + 0.12 + (i > 6 ? 0.55 : 0), z: kit.rnd(-0.85, 0.85), rot: kit.rnd(-0.25, 0.25), w: s, h: s * 0.85, d: s, mat: 'sign_white', tint: kit.pick(['#b8925e', '#a88452', '#c4a272']) }); }
    kit.at({ x: -3.6, y: by0 + 0.12, z: -0.5, rot: 0.6 }, () => { kit.box({ x: 0, y: 0.42, z: 0, w: 0.45, h: 0.05, d: 0.45, mat: 'sz_wood', tint: '#6a4a34' }); kit.box({ x: -0.2, y: 0.47, z: 0, w: 0.04, h: 0.5, d: 0.45, mat: 'sz_wood', tint: '#6a4a34' }); for (const [a, b] of [[-0.2, -0.2], [0.2, -0.2], [0.2, 0.2], [-0.2, 0.2]]) kit.box({ x: a, y: 0, z: b, w: 0.04, h: 0.42, d: 0.04, mat: 'sz_wood', tint: '#5a3e2c' }); });
    kit.at({ x: -2.2, y: by0 + 0.32, z: 0.75, rz: PI / 2 }, () => kit.cyl({ x: 0, y: -1.0, z: 0, r: 0.2, h: 2.0, seg: 8, mat: 'sz_fabric', tint: '#8a3a2e' }));
    // rear swing doors: north leaf folded back towards the cab, south leaf hanging open into the pocket
    for (const [s, ang] of [[-1, -4.36], [1, 3.49]]) kit.at({ x: bx0, y: by0 + 0.1, z: s * bw, rot: ang }, () => {
      kit.box({ x: -0.03, y: 0, z: -s * 0.61, w: 0.05, h: by1 - by0 - 0.22, d: 1.18, mat: 'plaster', tint: BOXW, grime: { y: 0.9, h: 1.2, k: 0.35 } });
      for (const dz of [0.3, 0.85]) kit.cyl({ x: -0.07, y: 0.08, z: -s * dz, r: 0.018, h: by1 - by0 - 0.4, seg: 6, mat: 'steel', tint: '#a8a49a' });
      kit.box({ x: -0.07, y: 1.0, z: -s * 0.95, w: 0.04, h: 0.05, d: 0.25, mat: 'steel_dark' });
    });
    for (const s of [-1, 1]) { kit.box({ x: bx0 - 0.02, y: 0.78, z: s * 1.05, w: 0.04, h: 0.16, d: 0.22, mat: 'car_taillight' }); kit.box({ x: -3.2, y: 0.25, z: s * 0.95, w: 0.02, h: 0.55, d: 0.5, mat: 'rubber' }); }
    kit.box({ x: bx0 + 0.05, y: 0.42, z: 0, w: 0.1, h: 0.14, d: 2.2, mat: 'steel', tint: '#7d7f7c' });
    // collision: body + cab down to the street (nothing under it for the nav), the box above the cab
    kit.colBox({ x: 0.0, y: 0.0, z: 0, w: 8.2, h: 2.85, d: 2.5 }, 'metal');
    kit.colBox({ x: (bx0 + bx1) / 2, y: 2.85, z: 0, w: bx1 - bx0, h: by1 - 2.85, d: 2.5 }, 'metal');
  });
}

// ==================================================================================================== props
function props(kit, L) {
  const P = (id) => L.PROPS.find((p) => p.id === id);
  // ---- S_CAR: burnt sedan slewed across the southbound lane (the mid-boss lane's only hulk)
  const car = P('S_CAR');
  kit.vehicle({ type: 'sedan', at: [car.x, car.z], rot: car.rot, state: 'burnt', tilt: 0.02, y: -0.08 });
  kit.decal({ at: [car.x, car.z], size: [6.0, 3.2], rot: -car.rot, mat: 'decal_stain', tint: '#3a3430' });
  kit.debris([car.x + 1.4, car.z - 1.6], { r: 1.4, count: 10, kinds: ['brick', 'paper', 'paper', 'plank'] });
  kit.prop('old_tyre', { at: [car.x - 1.5, car.z + 2.6], rx: PI / 2 - 0.05, rot: 0.9, y: 0.01 });
  // ---- S_SHELTER bus shelter (open to the street, FIZZ COLA light box), SUP_S kept clear beside it
  busShelter(kit, P('S_SHELTER'));
  // ---- S_PRODUCE grocery produce stand + the propane (mid-boss mechanic)
  const tanks = produceStand(kit, P('S_PRODUCE'));
  tanks.push(...propaneCage(kit, [7.5, 26.95]));
  kit.objective({
    id: 'S_PROPANE', type: 'explosive', zone: 'south', boss: 'butcher', round: 5, effect: 'stagger', radius: 4.5,
    tanks: tanks.map((t) => t.map((v) => +v.toFixed(2))),
    note: 'propane bottles hidden under the grocery produce stand S_PRODUCE (+ the exchange cage by the door): shooting one stuns the butcher if it stands within radius',
  });
  // ---- S_HYD, S_DUMP_X, lamps LAMP_8 (dead) and LAMP_9 (failing sodium: realtime L_LAMP_S from the layout)
  const hy = P('S_HYD');
  kit.prop('fire_hydrant', { at: [hy.x, hy.z], y: SW, rot: 0.5, tint: '#c8a8a0' });
  kit.prop('fire_hydrant', { at: [13.6, 49.35], y: SW, rot: 2.0, tint: '#c8a8a0' });
  const dp = P('S_DUMP_X');
  dumpster(kit, [dp.x, dp.z], 0, SW);
  trashPile(kit, [dp.x + 2.0, dp.z + 0.1], SW, 3, true);
  cobraLamp(kit, [-7.6, 36], 0, 'off', { tag: 'S-8' });
  cobraLamp(kit, [7.6, 44], PI, 'lit', { tag: 'S-9', arm: 1.0 });
  // ---- curbside furniture: parking meters, newspaper boxes, mailbox, trash cans, corner signals, street names
  for (const z of [29.0, 31.6, 38.6, 43.2]) parkingMeter(kit, [-5.45, z], PI / 2, kit.chance(0.25));
  for (const z of [37.4, 40.1]) parkingMeter(kit, [5.45, z], -PI / 2, kit.chance(0.25));
  for (const x of [-14.2, -19.6, -25.4, 14.6, 20.6, 26.0]) parkingMeter(kit, [x, 49.55], 0, kit.chance(0.25));
  for (const x of [-14.6, -22.4, 15.2, 24.2]) parkingMeter(kit, [x, 56.45], PI, kit.chance(0.25));
  newsBox(kit, [-7.45, 30.35], FACE.E, 0);
  newsBox(kit, [-7.45, 31.0], FACE.E, 0.05);
  newsBox(kit, [10.6, 49.3], FACE.S, -0.04);
  mailbox(kit, [7.3, 36.6], FACE.W);
  for (const [x, z, r] of [[-7.3, 46.7, 1.1], [7.25, 46.9, 2.3], [-13.4, 49.4, 0.4], [16.6, 56.6, 1.7], [-7.25, 59.6, 0.2]]) kit.prop('metal_trash_can', { at: [x, z], y: SW, rot: r });
  kit.prop('metal_trash_can', { at: [6.6, 63.6], y: SW, rot: 0.6, rz: PI / 2 - 0.05, collide: false });
  for (const [x, z, r] of [[-5.9, 48.65, PI / 2], [5.9, 48.65, -PI / 2], [-5.9, 57.35, 0], [5.9, 57.35, PI]]) pedestalSignal(kit, [x, z], r);
  streetNames(kit, [7.35, 49.4], ['S AVE', '南大道'], ['S CROSS ST', '南橫街']);
  streetNames(kit, [-7.35, 56.6], ['S LANE', '南巷'], ['S CROSS ST', '南橫街']);
  kit.roadSign({ at: [-6.9, 62.5], rot: 0.1, y: SW, shape: 'rect', size: 0.5, mat: 'sign_white', lean: 0.04 });
  kit.roadSign({ at: [6.8, 27.4], rot: PI - 0.05, y: SW, shape: 'round', size: 0.6, mat: 'sign_red', lean: -0.03 });
  // ---- the open manhole MH_S: cones + police tape round it
  const ms = L.MANHOLES.find((m) => m.id === 'MH_S');
  for (const [dx, dz, f] of [[-0.9, -0.8, false], [0.9, -0.85, false], [1.0, 0.9, true], [-0.95, 0.8, false]]) kit.cone([ms.x + dx, ms.z + dz], { fallen: f });
  kit.tape([[ms.x - 0.9, 0.62, ms.z - 0.8], [ms.x + 0.9, 0.6, ms.z - 0.85], [ms.x + 1.0, 0.3, ms.z + 0.6]]);
  // ---- cross street hulks (cover), trash heaps, pallets, papers
  kit.vehicle({ type: 'taxi', at: [-18.8, 54.6], rot: 0.04, state: 'wrecked', tilt: -0.02 });
  kit.decal({ at: [-18.8, 54.6], size: [5.6, 2.8], rot: -0.04, mat: 'decal_stain' });
  kit.vehicle({ type: 'pickup', at: [19.4, 51.35], rot: PI + 0.06, state: 'wrecked', color: '#4b5a46' });
  kit.decal({ at: [19.4, 51.35], size: [6.0, 2.8], rot: 0.06, mat: 'decal_stain' });
  for (const [x, z, n, hero] of [[-7.3, 34.6, 3, true], [-12.0, 57.4, 3, true], [12.5, 57.3, 3, false], [-7.1, 61.8, 2, false], [7.2, 65.4, 3, true], [-20.0, 57.3, 2, false]]) trashPile(kit, [x, z], SW, n, hero);
  for (const [x, z, r] of [[-11.2, 48.75, 0.08], [22.6, 48.8, 1.5]]) kit.at({ x, y: SW, z, rot: r }, () => { pallet(kit, true); kit.at({ y: 0.145, rot: 0.1 }, () => pallet(kit, true)); });
  kit.prop('cardboard_box_01', { at: [-7.0, 47.3], y: SW, rot: 0.6 });
  kit.prop('cardboard_box_01', { at: [-6.9, 47.1], y: SW + 0.34, rot: 1.3 });
  kit.prop('wooden_crate_02', { at: [9.6, 49.3], y: SW, rot: 0.1 });
  kit.prop('plastic_crate_02', { at: [-15.6, 57.4], y: SW, rot: 0.3 });
  kit.debris([-6.4, 38.6], { r: 1.3, count: 7, kinds: ['paper', 'paper', 'brick'], y: SW });
  kit.debris([6.5, 42.0], { r: 1.2, count: 7, kinds: ['paper', 'paper', 'plank'], y: SW });
  kit.debris([-24.0, 49.0], { r: 1.2, count: 6, kinds: ['paper', 'brick'], y: SW });
  kit.debris([-1.5, 47.0], { r: 2.4, count: 10, kinds: ['paper', 'paper', 'paper', 'plank'] });
  fireBarrel(kit, [13.4, 57.3], SW, false);
  // ---- fallen cornice / brick rubble at the foot of X_S2, a loose facade slab
  kit.rubblePile([24.6, 57.2], { y: SW, r: 0.75, h: 0.35, count: 7 });
  kit.at({ x: 23.4, y: SW, z: 57.0, rot: 0.3, rz: 0.12 }, () => { kit.box({ x: 0, y: 0, z: 0, w: 1.1, h: 0.28, d: 0.42, mat: 'trim_concrete', tint: '#c8c0b0' }); kit.box({ x: 0, y: 0.28, z: 0.08, w: 1.1, h: 0.1, d: 0.5, mat: 'trim_concrete', tint: '#bdb6a6' }); });
  kit.debris([22.8, 56.4], { r: 1.3, count: 8, kinds: ['brick', 'brick', 'chunk'], y: SW });
  wires(kit);
  graffiti(kit);
}
/** Telephone / power drops between wall brackets: across the cross street (outside the boss lane) and high over the
 *  lane (lowest point > 10 m, the mid-boss lane stays clear below 9 m). */
function wires(kit) {
  const bracket = (x, y, z, alongX) => kit.box({ x, y: y - 0.1, z, w: alongX ? 0.16 : 0.06, h: 0.12, d: alongX ? 0.06 : 0.16, mat: 'steel_dark' });
  const span = (a, b, sag, n = 2) => { for (let i = 0; i < n; i++) kit.wire([a[0], a[1] + i * 0.22, a[2]], [b[0], b[1] + i * 0.25, b[2]], { sag: sag + i * 0.1, r: 0.011 }); };
  for (const [x, ya, yb, dx] of [[-19.6, 8.8, 9.5, 0.5], [-33.6, 9.2, 8.9, -0.3], [18.6, 9.6, 9.0, -0.4], [33.0, 8.7, 9.3, 0.2]]) {
    bracket(x, ya, 48.06, true); bracket(x + dx, yb, 57.94, true);
    span([x, ya, 48.12], [x + dx, yb, 57.88], 0.55);
  }
  bracket(-8.06, 12.4, 63.0, false); bracket(8.06, 12.0, 64.2, false);
  span([-7.98, 12.4, 63.0], [7.98, 12.0, 64.2], 0.9);
}
/** Spray-painted survivor messages and tags (wall-local frames on the building faces). */
function graffiti(kit) {
  const msg = (frame, str, o) => kit.at(frame, () => textLine(kit, str, { font: 'sans', h: o.h ?? 0.32, x: 0, y: o.y ?? 1.5, z: 0.04, align: 'center', mat: o.mat || 'sz_paint_red', italic: 0.16, track: 0.04, maxW: o.maxW ?? 4 }));
  msg({ x: -32.3, y: 0, z: 58.0, rot: FACE.N }, 'GOD HELP US', { y: 3.35, h: 0.28, maxW: 3.0 });
  msg({ x: -8.0, y: 0, z: 70.2, rot: FACE.E }, 'TURN BACK', { y: 3.4, h: 0.3, maxW: 3.2, mat: 'sz_paint_white' });
  msg({ x: 8.0, y: 0, z: 69.7, rot: FACE.W }, 'ALIVE INSIDE', { y: 3.45, h: 0.24, maxW: 3.0, mat: 'sz_paint_white' });
  kit.at({ x: 8.0, y: 0, z: 69.7, rot: FACE.W }, () => kit.at({ x: 0, y: 3.57, z: 0.045, rz: 0.08 }, () => kit.box({ x: 0, y: -0.04, z: 0, w: 2.6, h: 0.08, d: 0.005, mat: 'sz_paint_red' })));
  msg({ x: -30.8, y: 0, z: 48.0, rot: FACE.S }, 'NO WAY OUT', { y: 3.45, h: 0.24, maxW: 2.4 });
  msg({ x: 26.0, y: 0, z: 48.0, rot: FACE.S }, 'DEAD INSIDE', { y: 4.35, h: 0.2, maxW: 2.6, mat: 'sz_paint' });
}
/** Bus shelter S_SHELTER on the east sidewalk (layout box w 1.4 x d 3.6): open to the street (west), glass back + ends,
 *  a dead FIZZ COLA light box at the north end, a bench; solid collision. */
function busShelter(kit, S) {
  kit.at({ x: S.x, y: SW, z: S.z, rot: FACE.W }, () => {   // local +z = west (street), local +x = south
    const w = S.d, d = S.w, h = S.h, t = '#5a5f5c';
    for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2 - 0.2], [w / 2, d / 2 - 0.2]]) kit.box({ x, y: 0, z, w: 0.07, h, d: 0.07, mat: 'steel', tint: t });
    kit.box({ x: 0, y: h, z: 0, w: w + 0.25, h: 0.1, d: d + 0.35, mat: 'steel', tint: '#6a6f6c' });
    const back = [[w / 2, 0.15, -d / 2 + 0.02], [-w / 2, 0.15, -d / 2 + 0.02], [-w / 2, h - 0.1, -d / 2 + 0.02], [w / 2, h - 0.1, -d / 2 + 0.02]];
    kit.face(back.slice().reverse(), 'glass_dirty');
    kit.face(back, 'glass_dirty');
    // north end: dead ad light box; south end: glass pane cracked through
    kit.box({ x: -w / 2, y: 0.2, z: 0, w: 0.16, h: 2.0, d: d - 0.25, mat: 'steel', tint: t });
    kit.at({ x: -w / 2 - 0.081, y: 0, z: 0, rot: -PI / 2 }, () => {
      flat(kit, rect2(-(d - 0.4) / 2, 0.32, (d - 0.4) / 2, 2.08), 0, 'sign_white', { tint: '#b8382a' });
      textLine(kit, 'FIZZ', { font: 'serif', h: 0.2, x: 0, y: 1.55, z: 0.002, align: 'center', mat: 'sz_paint_white', italic: 0.15 });
      textLine(kit, 'COLA', { font: 'serif', h: 0.2, x: 0, y: 1.25, z: 0.002, align: 'center', mat: 'sz_paint_white', italic: 0.15 });
      textLine(kit, 'ICE COLD', { font: 'sans', h: 0.06, x: 0, y: 0.9, z: 0.002, align: 'center', mat: 'sz_paint_white' });
    });
    kit.face([[w / 2 - 0.02, 0.15, -d / 2], [w / 2 - 0.02, 0.15, d / 2 - 0.25], [w / 2 - 0.02, 1.2, d / 2 - 0.25]], 'glass_dirty');
    kit.box({ x: 0.3, y: 0.45, z: -d / 2 + 0.3, w: 2.0, h: 0.05, d: 0.35, mat: 'sz_wood', tint: '#8a6a4a' });
    for (const x of [-0.6, 1.2]) kit.box({ x, y: 0, z: -d / 2 + 0.3, w: 0.05, h: 0.45, d: 0.3, mat: 'steel_dark' });
    kit.box({ x: 0.9, y: h - 0.42, z: d / 2 - 0.18, w: 1.6, h: 0.3, d: 0.03, mat: 'sign_white', tint: '#3a5a8a' });
    textMixed(kit, [['BUS 7 · SOUTH AVE', { font: 'hwy', h: 0.1 }], ['南大道', { font: 'cjk', h: 0.12 }]], { x: 0.9, y: h - 0.32, z: d / 2 - 0.16, mat: 'sz_paint_white', gap: 0.08, maxW: 1.5 });
    posterWall(kit, -1.2, 1.4, 0.9, 2.0, -d / 2 + 0.045, 3, ['MISSING', 'EVACUATE', null]);
    for (let i = 0; i < 10; i++) { const x = kit.rnd(-1.5, 1.6), z = kit.rnd(-0.4, 0.8), s = kit.rnd(0.05, 0.14); kit.upFace([[x, 0.004, z], [x + s, 0.004, z + kit.rnd(-0.05, 0.05)], [x + s * 0.4, 0.004, z + s]], 'glass_dirty', null, {}); }
    kit.colBox({ x: 0, y: -SW, z: -0.1, w: w + 0.1, h: h + SW + 0.1, d: d - 0.2 }, 'glass');
  });
  kit.roadSign({ at: [S.x - 0.85, S.z + 2.3], rot: -PI / 2, y: SW, shape: 'rect', size: 0.45, mat: 'sign_blue', h: 2.5 });
}
/** Grocery produce stand (layout box): trestle with two tiers of tilted crates of rotting produce facing the street, a
 *  torn tarp skirt; three propane bottles under the upper tier. Returns the tank positions. */
function produceStand(kit, P) {
  const x0 = P.x - P.w / 2, x1 = P.x + P.w / 2, z0 = P.z - P.d / 2, z1 = P.z + P.d / 2, y = SW;
  for (const z of [z0 + 0.08, z1 - 0.08]) for (const x of [x0 + 0.08, x1 - 0.08]) kit.box({ x, y, z, w: 0.06, h: 0.95, d: 0.06, mat: 'sz_wood', tint: '#6a5038' });
  for (const yy of [0.4, 0.73]) kit.box({ x: (x0 + x1) / 2, y: y + yy, z: P.z, w: P.w - 0.1, h: 0.03, d: P.d - 0.1, mat: 'sz_wood', tint: '#7a5e44', faces: { bottom: false } });
  const PRODUCE = { orange: ['#d8862a', '#c97a24', '#6a6a30'], apple: ['#9a2a20', '#b8402a', '#5a3a22'], cabbage: ['#7a9a5a', '#6a8a4a', '#5a5a3a'], potato: ['#9a7a52', '#8a6a46', '#6a5236'] };
  for (const [xc, yb, tilt] of [[x0 + 0.33, y + 0.43, 0.3], [x1 - 0.33, y + 0.76, 0.26]]) for (let i = 0; i < 4; i++) {
    const zc = z0 + 0.33 + i * 0.645;
    kit.at({ x: xc, y: yb, z: zc, rz: tilt, rot: kit.rnd(-0.04, 0.04) }, () => {
      kit.box({ x: 0, y: 0, z: 0, w: 0.55, h: 0.2, d: 0.6, mat: 'sz_wood', tint: kit.pick(['#b49a70', '#a68a62', '#c8ae84']), faces: { bottom: false, top: false } });
      kit.box({ x: 0, y: 0.02, z: 0, w: 0.5, h: 0.02, d: 0.55, mat: 'sz_wood', tint: '#8f7454' });
      const kind = kit.pick(Object.keys(PRODUCE)), r = kind === 'cabbage' ? 0.09 : 0.045, n = kind === 'cabbage' ? 4 : 9;
      for (let k = 0; k < n; k++) kit.bbox({ x: kit.rnd(-0.2, 0.2), y: 0.03 + (k > 5 ? 0.06 : 0), z: kit.rnd(-0.24, 0.24), w: r * 2, h: r * 1.7, d: r * 2, bevel: r * 0.7, mat: 'sz_fabric', tint: kit.pick(PRODUCE[kind]), rot: kit.rnd(0, 3) });
      const tag = kit.pick(['3 FOR $1', '$0.49 LB', 'FRESH', '新鮮']);
      kit.at({ x: -0.28, rot: -PI / 2 }, () => textLine(kit, tag, { font: /[一-鿿]/.test(tag) ? 'cjk' : 'hwy', h: 0.05, x: 0, y: 0.06, z: 0.004, align: 'center', mat: 'sz_paint', maxW: 0.45 }));
    });
  }
  // torn green tarp skirt on the street side (bottles visible through the tear)
  kit.face([[x0 - 0.01, y + 0.02, z0 + 0.1], [x0 - 0.01, y + 0.02, P.z - 0.35], [x0 - 0.01, y + 0.4, P.z - 0.15], [x0 - 0.01, y + 0.4, z0 + 0.1]], 'sz_fabric', { tint: '#3e5a40' });
  kit.face([[x0 - 0.01, y + 0.1, P.z + 0.55], [x0 - 0.01, y + 0.02, z1 - 0.1], [x0 - 0.01, y + 0.4, z1 - 0.1], [x0 - 0.01, y + 0.4, P.z + 0.35]], 'sz_fabric', { tint: '#3e5a40' });
  const tanks = [[x0 + 0.62, y, P.z - 0.55], [x0 + 0.85, y, P.z + 0.12], [x0 + 0.6, y, P.z + 0.72]];
  for (const [x, yy, z] of tanks) kit.prop('propane_tank', { at: [x, z], y: yy, rot: kit.rnd(0, 6), tint: '#d8a090', collide: false });
  kit.colBox({ x: P.x, y, z: P.z, w: P.w, h: P.h, d: P.d }, 'wood');
  for (let i = 0; i < 6; i++) kit.bbox({ x: kit.rnd(x0 - 0.8, x0 - 0.1), y, z: kit.rnd(z0, z1), w: 0.08, h: 0.06, d: 0.08, bevel: 0.03, mat: 'sz_fabric', tint: kit.pick(['#6a4a2a', '#5a5030', '#7a3a22']), rot: kit.rnd(0, 3) });
  return tanks.map(([x, yy, z]) => [x, yy + 0.28, z]);
}
/** PROPANE EXCHANGE cage by the grocery door: steel frame + chain-link, four bottles, warning plate. Returns tank positions. */
function propaneCage(kit, at) {
  const w = 0.85, d = 1.2, h = 1.25, x = at[0], z = at[1];
  kit.at({ x, y: SW, z }, () => {
    for (const [px, pz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]) kit.box({ x: px, y: 0, z: pz, w: 0.04, h, d: 0.04, mat: 'paint_metal', tint: '#c9c4b6' });
    kit.box({ x: 0, y: h, z: 0, w: w + 0.04, h: 0.04, d: d + 0.04, mat: 'paint_metal', tint: '#c9c4b6' });
    kit.box({ x: 0, y: h + 0.04, z: 0, w: w + 0.1, h: 0.03, d: d + 0.1, mat: 'paint_metal', tint: '#d8d2c4' });
    for (const [a, b] of [[[-w / 2, -d / 2], [-w / 2, d / 2]], [[-w / 2, d / 2], [w / 2, d / 2]], [[w / 2, -d / 2], [-w / 2, -d / 2]]]) kit.face([[a[0], 0.05, a[1]], [b[0], 0.05, b[1]], [b[0], h - 0.03, b[1]], [a[0], h - 0.03, a[1]]], 'chainlink', { uvs: [[0, 0.05], [Math.hypot(b[0] - a[0], b[1] - a[1]), 0.05], [Math.hypot(b[0] - a[0], b[1] - a[1]), h], [0, h]] });
    kit.at({ x: -w / 2 - 0.02, y: 0.62, z: 0, rot: FACE.W }, () => {
      const zf = board(kit, -0.48, 0.48, 0, 0.5, { mat: 'sign_white', tint: '#e8e2d2', d: 0.015, border: { mat: 'sign_white', tint: '#b8382a', w: 0.025, inset: 0.03 } });
      textLine(kit, 'PROPANE EXCHANGE', { font: 'sans', h: 0.06, x: 0, y: 0.36, z: zf, align: 'center', mat: 'sz_paint_red', maxW: 0.85 });
      textMixed(kit, [['丙烷', { font: 'cjk', h: 0.1 }], ['危險', { font: 'cjk', h: 0.1, mat: 'sz_paint_red' }]], { x: 0, y: 0.2, z: zf, mat: 'sz_paint', gap: 0.08, maxW: 0.8 });
      textLine(kit, 'NO SMOKING', { font: 'sans', h: 0.05, x: 0, y: 0.08, z: zf, align: 'center', mat: 'sz_paint', maxW: 0.8 });
    });
  });
  kit.colBox({ x, y: SW, z, w: w + 0.05, h: h + 0.07, d: d + 0.05 }, 'metal');
  const tanks = [[x - 0.2, SW, z - 0.3], [x + 0.18, SW, z - 0.28], [x - 0.18, SW, z + 0.28], [x + 0.2, SW, z + 0.3]];
  for (const [tx, ty, tz] of tanks) kit.prop('propane_tank', { at: [tx, tz], y: ty, rot: kit.rnd(0, 6), tint: '#d8a090', collide: false });
  return tanks.map(([tx, ty, tz]) => [tx, ty + 0.28, tz]);
}

// ==================================================================================================== glyph data
// Outlines traced from text rendered in headless Edge with the Windows system faces Rockwell Bold (slab), Georgia Bold
// (serif), Arial Black (sans), Bahnschrift Bold (hwy), Segoe Script Bold (script, diner neon only) and Microsoft JhengHei
// Bold (cjk) at 120 px (CJK 84 px), simplified to ~0.8 px (same method and faces as the west / north zones). Swap this table
// for an original / CC0 face if the font licences are a concern. Format: see glyph().
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
    "$": '67.6|I4KlI3KiIrKgIfKaISKNIOKDIOJxIUJjIhJWI4JJI4IXI1IWIsIdInIuINIuIMIhIQIXIbIKIrICI4H_I5HsJHHsJJIAJbICJtIMJ0ITJ8IlJ8I1J2JFJtJQJIJlJIKLJLKMJUKFJZJ4JzJ4J0KDJwKNJjKaJXKgJJKiJHKoI5Ko/I4KLI4JtI1JsIuJzIqKBIxKK/JMJBJcI1JgInJZIaJJIUJIJB',
    "%": '111.2|IpKkIdKgISKPIQKFISJlIdJUIrJOI7JOJFJSJSJjJUKLJOKZJFKiI7Km/I1KYI8KLI8JpI4JfIxJcIqJlIoKDIsKTIxKY;KfKiIrIAJAIBK0KjKhKk;KhJUKZJSKOJHKKI7KKIbKOIPKZIEKjIAK1IALBIGLKIRLOIfLOI3LGJLLBJQKzJW/KtJIK0I_K2IjKyITKtIOKpIOKiIbKiI7KmJF',
    "/": '60.9|JXKkIKIRICIBIDH-IkH_J4KjJ3KmJZKm',
    ":": '42.5|IYJvIZJMI-JNI9JyIZJy;IYIjIZIAI-IBI9ImIZIm',
    ",": '42.5|IYIjIYIBIqH_IoHxIhHqIYHnIYHXIhHWIxHcI8HrI-IlIZIm',
    "+": '80.2|JCKRJCJhIPJgIOJFJBJEJCIRJdIQJeJDKRJEKSJfJfJgJeKTJDKU',
    "#": '80.2|I1KkIrJ6IIJ5IJJiImJhIgJDIKJBIKIrIaIpISH_IsH_I1IqJZIqJaIjJSH_JrH-J1IqKYIrKXJCJ6JDKAJhKYJjKYJ5KGJ7KOKlJ3KmJ0KjJwKHJrJ6JHJ6JGKBJOKlI3Km/JFJiJmJhJiJHJfJCI6JDJAJh',
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
    "$": '76.9|JIKxJIKbIxKWIjKOIaKFISJ1ISJbIWJTIjJGIvJAJII7JIIHI5IIIuIPIyIXI0InIrI0IlI2IVI0IOIrIMIdIUIPIjIEIzH-JHH8JIHdJTHcJUH7JlH-J5IIKKIbKOI1KKJDJ7JUJpJcJUJfJVKQJlKOJoKLJkJ_JkJxJpJqJxJmJ9JmKGJtKKJ1KIKDKBKMJvKWJVKaJUKzJJK0/JIKPJIJhJDJgI3JkIuJtIsJ7IzKII9KO/JZI6JnI2JwItJyIbJwIVJlIKJVIGJUI5',
    "%": '105.5|ItKoIfKkIQKVIKKBIMJvIQJnIfJYInJUIvJSJJJUJXJcJiJpJmJ1JmKHJeKZJRKkJBKq/I5KiI_KgJEKZJIJ7JGJpJCJfI7JaI1JaIuJhIqJtIqKPIuKbI1Ki;KjKkIgIHIdIAItIAI2IJK4KlKlKm;KPJSJ_JMJwI7JuIbJ0IPKFIAKRH8KlH8K3IELCIPLIIdLIIzLCJBK3JMKlJUKRJU/KbJMKhJKKoI_KqIdKkIJKdIEKXIEKOIPKMI3KQJFKXJM',
    "/": '56.6|JTKwIEHTIFHOIXHOIaHRJoKtJnKy',
    ":": '44.1|IlJyIhJyIYJpIWJVIhJIInJGI3JIJCJVJEJbJCJlI3JyIxJ0;IlIoIhIoIYIfIWILIhH-InH8I3H-JCILJEIRJCIbI3IoIxIq',
    ",": '39.4|IdIkIXIiIQIXISIJIhIAItIAIuH3IoHrIbHeISHZIXHQIlHYI0HnI8HzJAIDI-ITIxIkIrIm',
    "+": '84.4|JKKBJKJNIVJMIUI5JJI4JKIDJdICJeI3KTI4KWI7KWJLJfJMJeKDJLKE',
    "#": '84.4|JMKPI_JqIaJpIbJWI6JVIxI6ISI5ITImIqIlIgIFIhIAIyIBI9ImJYIlJMIBJdIAJpImKNImKQIpKPI6JwI7J0JNJ5JWKWJXKVJqJ-JrKKKRJ4KRJuJtJrJqJSJrJeKRJNKS/JRJYJmJXJgI_JdI6JDI6JKJV',
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
    "$": '80|JIK3JHKuI1KsIfKiIWKZIOKJIOJvIUJhIhJUJIJFJIIfJBIgI6InI1I2ILIyIGIvIMIdIdIKItICJHH-JIHpJXHoJZH-JzICKBIKKOIXKWInKYI7KQJRKFJcJ3JkJbJsJYJvJZKOJiKJJnJ-JtJ-KRKEKSKJKOKTJ7KmJrKsJZKuJXK6JJK6/JIKPJIJzJFJyI6J7I6KHJBKO/JcJBJqI3JsItJqInJhIeJZIcJYJB',
    "%": '120|ItKsIfKoISKbIMKLIOJvISJnIjJYIvJUJNJWJVJaJiJnJmJvJoJ1JmKTJiKbJVKoJNKsJFKuIvKu/I5KaI_KaJIKLJGJxI_JoIzJqIsJ5IuKRI1Ka;KcKrJEILI8H7I9H4JUH5K2KtKdKu;KpJQKbJMKOI_KIIxKKITKOILKfH8KrH4LBH4LNH8LeILLiITLkIZLiI3LeI_LNJOLBJSKrJS/K1I-K7I-LAI5LEItLCIVK7IMKxIMKsIRKoIdKqI1KxI-',
    "/": '33.3|IqKrIBH-IXH-IaIDJEKtIrKu',
    ":": '40|IOJ5IPJMJCJNJBJ8IPJ8;IOItIPIAJCIBJBIwIPIw',
    ",": '40|IOItIOIBImH_IiHxIQHlIWHVIbHQIvHcI-HvJCIBJCIvIPIw',
    "+": '79.2|I8KTI8JpIRJoIQJDI7JCI8IXJhIWJiJBKNJCKOJnJiJpJhKWI9KW',
    "#": '79.2|IyKrIpKEIIKDIIJlIkJjIeJJIIJHIIIpIYInIQH_IvH-I4InJRIoJSIhJKH_JrH-J0InKWIpKWJHJ6JJKAJjKWJlKWKDKGKFKOKtJvKuJsKrJlKEJMKFJTKuIzKu/JJJkJeJjJZJIJAJJJEJj',
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
    "B": '77.5|ISKnISIBJnIAJ5IGKGIRKOIhKOI7KKJFJ9JSJuJXJ7JcKKJtKMKHKGKXJ7KiJnKqITKq/I5KMJjKKJsJ_JqJvJlJqJZJmI1JmIyJpIyKJ/I3JIJlJGJuI7JuItJqIlJjIgJZIeI1IeIyIhIyJH',
    "C": '74.2|I9KqIpKkIYKTIUKLIQJ9IQItIWIbInIII5IAJVH-JpIEJ8IVKGInKKI5JrI6JkIrJTIeJHIeI9IiI0IrIwI3IyJ7I_KKJTKMJZKKJkJ_JpJyKJJyKKJ1J-KTJtKkJZKsI_Ks',
    "D": '78.8|ISKnISIBJZIAJ1IKKGIbKOIxKOJ7KIKNJ5KeJlKoITKq/I5KMJbKKJjKGJsJ5JuI5JqItJfIiJZIgI1IeIyIhIyKJ',
    "E": '71.7|ISKnISIBKDIAKDIeI1IeIyIhIyJDI1JGJ4JHJ3JkIzJkIyKJI1KMKDKMKEKpITKq',
    "F": '67.1|ISKnISIBIxIAIyJBI1JEJ2JFJ1JiI1JiIyJlIyKJI1KMKBKMKCKpITKq',
    "G": '77.6|I_KqIzKoIjKeIUKJIQJ9IQIrIaIVIrIGJDH-JXH-JvIGKEIbKMIzKMJfJTJgJSJBJpJAJqIzJdIiJDIgI0IrIwI1IwJzIyJ5I2KBJDKKJXKKJfKGJpJ6KJJ6KKJ_KAKTJxKiJZKsJBKs',
    "H": '81.4|ISKnISIBIyIBIyJDI1JGJvJGJwIBKPIAKQKpJwKpJvJkIzJkIyKpITKq',
    "I": '33|IQKnIQIBIxIAIyKpIRKq',
    "J": '60.6|JGKnJGIxJEIpI5IeIpIeIbIoICIVINIIIdIAI7H-JRIGJeITJmInJmKpJHKq',
    "K": '77|ISKnISIBIyIBIyIjJLJGJ1IAKZIAJgJjKSKpJrKqIzJYIyKpITKq',
    "L": '68.8|ISKnISIBKDIAKDIeI1IeIyIhIyKpITKq',
    "M": '93.5|ISKnISIBIwIBIxJyJOIVJRISJpISJuIZKEJlKLJ0KMIBKnIAKoKpJ-KpJgI9JdI6I-KpITKq',
    "N": '84|ISKnISIBIyIBIzJ4JsIDJvIAKVIAKWKpJ2KpJ1IwI8KnI5KqITKq',
    "O": '77.5|I_KqIzKoIlKgIcKXISKFIQJ9IQItIeIRIvIEJDH-JXH-JnICJ1IKKAIVKIIjKMI1KMJ3KCKTJzKiJbKsJBKs/JJKMJVKMJfKIJmKBJqJ3JqIzJjImJTIeJHIeI9IiI0IrIwI3IwJ1I0J_I9KI',
    "P": '74.7|ISKnISIBIxIAIyJBJhJCJ3JKKIJdKMJpKMKDKGKTJ3KiJrKoJjKqITKq/I5KMJhKKJqKBJsJ7JsJxJoJpJhJiIzJiIyKJ',
    "Q": '78.9|I_KqIzKoIlKgIcKXISKFIQJ9IQItIUIhIjIMI7IAJXH-JnICJ3IMKLH-KaITKIIhKMI1KMJ3KIKHKCKTJzKiJjKqJbKsJBKs/JJKMJVKMJfKIJmKBJqJ3JqI7JnI6JZJEJOI3JKIvJaIhJTIeJHIeI9IiI0IrIwI3IwJ1I0J_I9KI',
    "R": '78.2|ISKnISIBIyIBIyJDJHJEJtIAKTIAJsJDJvJIJ5JMKEJXKMJrKMKFKAKdJpKqITKq/I5KMJfKMJjKKJsJ9JqJtJhJkIzJkIyKJ',
    "S": '73.9|I9KqIrKmIWKTIQKBISJlIWJdInJOJhJAJqI1JoIpJZIeJFIcIvIgIXIsIIITIdIGIxIAI9H-JhIAJ3IKKEIZKKIvKIJDKAJRJ1JaJnJgJPJkI3JsIwJ1IwJ_I5KKJHKOJfKMJ5KAKGKZKBKeJlKqJbKsI_Ks',
    "T": '57.8|H8KnH9KMIqKLIqIBJJIAJKKLJ3KMJ4KpH9Kq',
    "U": '78.6|IQKnIQI1IWIdIjIMI5IAJZH-J1IIKGIbKMItKMKpJsKpJsIxJhIiJXIeJBIgIyIvIwI3IwKpIRKq',
    "V": '70.4|ICKnI4IDI7IAJTIAKMKpJqKpJHI6IkKnIhKqIDKq',
    "W": '101.6|ICKnIoIBJFIAJIIDJgJjJnJ0KEIBKhIAKoITLKKpKoKpKTI6J2KhJxKqJYKpI5I8I2I_IiKpIDKq',
    "X": '68.1|IDKoIwJdIyJVIAIBIhIAJAI1JFI4JnIAKHIAJUJXKEKpJjKqJDJ0IjKqIDKq',
    "Y": '60.4|H7KoIsJDIsIBJLIAJMJDJ-KpJcKpI9JiIeKnIbKqH7Kq',
    "Z": '65.3|IOKnIPKMJSKLIQIlIMIdIMIBJ5IAJ5IeIyIfJ2KJJ4KpIPKq',
    "&": '78.2|JBKqI7KqIvKkIkKZIgKRIeJvImJbIUJLIOI9IOIfISIVIhIGI3H-JXIAJtIKJ3IAKZIAKSILKAIdKMI5KOJXJxJYJuJBJsI5JpI4JMJXI8JzI8KHJAKPJHKUJTKUJaKPJfJ6J9J6J8KPJ2KbJtKkJhKqJXKsJDKs/I3JEJYIhJXIeJBIaI1IeIsInIqIvIsI7I1JG',
    ".": '27.2|IMIdINIAIsIBIrIgINIg',
    "·": '25.4|IIJLIJIuIqIvIpJOIJJO',
    "-": '57.5|IQJJIRIuJkIvJjJMIRJM',
    "!": '32.5|IQKnIQI1ITIyIvIyIwKpIRKq;IQIdIRIAIwIBIvIgIRIg',
    "'": '21.3|IGKnIGJvIjJuImJxImKpIHKq',
    "$": '69.2|I4K9I4KrIjKiIYKXIUKPIQKBISJlIaJXIjJQIvJKJJJGJZJAJgI3JgIrJZIiJRIeJBIcItIgIXIsIIITIbIGI1IAI4H9I5HsJVHsJWH_JpIGJ2IRJ8IbKAIpJ-JFJ6JNJtJaJhJgI5JqIwJ1IwJ_I5KKJFKOJZKMJvKAJ8KbJlKoJZKqJWKtJVLAI5LA',
    "%": '82.4|IdKqITKmIKKZIKJ1IOJtIdJiIzJiJEJvJGKZJCKhI3KqIxKs/IrKUIuKPIuJ_IrJ6IlJ6IiJ_IiKPInKU;JwKnIqIjIaIDIbIAI1IAI4IDKOKpJxKq;JvJGJiI9JeIzJgIPJvIAJ1H-KLIAKaIPKcIXKaI3KWI_KJJIJxJI/J9IwKCItKCIZJ_IWJ4IZJ4Iv',
    "/": '45.4|JIK7H9HgIcHhJmK5JlK-JJK-',
    ":": '27.2|IMJ1INJYIsJZIrJ4INJ4;IMIdINIAIsIBIrIgINIg',
    ",": '27.2|IMIdINHaIsH3IsIfINIg',
    "+": '63.4|IwJ7IwJfIPJeIOJBIvJAIwIhIzIeJNIeJQIhJRJAJyJBJyJdJRJeJPJ-IxJ-',
    "#": '74.9|IxKoIqKDIQKBIQJpImJnIgJFILJEIIJBIIIrIaIpIUIBIuIBI1IqJRIqJSIfJMIBJjIAJmIDJsIpKIIrKIJDJxJEJwJHJ2JnKQJpKQKBJ6KDKBKqJoKpJhKCJFKCJEKLJKKpIzKq/JFJoJbJoJeJlJXJEI4JFI-Jl',
    "↑": '60|I4KZIuKJISJtISJlIjJsI2J5I2HPJBHOJCJ5JjJkJmJlJmJtJIKLI_KcI5Kc',
    "→": '120|KvJkLDJCILJCIKI3LBI2LCIzK6IrKuIVKvISK1ISLPIsLjI4LmI_LRJMK3JmKvJm',
    "←": '120|I3JkIfJMINJCIKI7IhIsI7ISJBISJCIVIuIzIvI2LmI3LlJCItJCJCJlI5Jm',
  } },
  script: { c: 95, g: {
    "S": '73.4|JRKoJHKoIzKiIVKQIKKBIKJtISJdIhJQI7JEJbI8JnI2JqIzJqItJjIkJXIcI9ISIdIQITIUILIUIEINICIDITH4IvH2JVIAJxIQKCIhKGIpKGI7J5JKJlJUJTJYIzJkIoJvIkJ3IoJ_IzKIJRKSJvKQJ2KHJ3J8KFJ-KKKDKOKTKMKZKDKiJrKqJTKq',
    "i": '45.9|I3KwIxKuIqKlIuKRIxKOI5KOJBKSJGKXJMKnJHKuI_Ky;IfJsIYJhIYJVIQItIQIhIUIRIfIEIrH-I9H-JLICJdIMJqIZJuIfJuInJrIqJlIqJLIYI_IUIzIUIsIdIqI1I2JlIzJqIrJuIhJu',
    "l": '48|IzK0IsKrIgKFIaJlIaJZIYJXIWIrIYIpIaIVIiIHI1H8JFH8JbIGJyIdJ6IrJ6IxJzI0JhIiJLIWI_IWI2IdIyInIwJDIyJFI0JnJCKfJCKvI5K2',
    "v": '71.4|J7JmJuJbJDIUJAIVIwJDIwJTIyJVIwJhIpJmIjJmIYJdIUJVIWI9IcIrIsILIuH3IzHwJBHuJQH9JWILJuIxJ-JFKJJQKSJVKSJhKLJoJ9Jo',
    "e": '62.5|JFKAI7J-I1J6IiJnIYJVISI7IUIjIYIZIhIOIzIGJPIIJlISKAIpKII3KGI9J_JAJnIqJXIiJLIeI7IeIyIjIuItJLJAJgJVJmJhJmJzJdJ-JVKCJHKC/JJJsJOJpJOJfI_JOIvJCIuJJI6JjJBJq',
    "r": '65.3|JhJ2JTJwJGJjIzJCI0JTI6JjI6JxIzJ2IrJ2IeJrIaJbIaJJIYJHIYInIaIlIaIPIhICItIAI0IHI2IXJEI5JSJNJhJcJpJeJ1JWJ9JWKEJdKEJnJ7J0JzJ4JjJ4',
    "t": '54.4|I7KgI0KbIsKBIjJwIHJwICJrICJjIHJeIcJbIcJNIUIxISIZIYIFIfH-IpH6I5H6JLICJkIbJkIjJhImJbImJBISI1IQIwIVIuIpI6JbJFJeJTJeJVJgJzJiJ8JpJ6JzJzJ2JdJ2JbJ0JBJyJAJ1JMKVJMKdJHKiI9Ki',
    "a": '73.7|JBJ2I1JwIeJZIWJNIIIpIIIVIKIRIRIIIZIEIlIEI_ISJRImJYITJlIGJ1IEKBIIKWIdKYIjKWIpKPIqKHIgJ9IaJvIcJqIjJmIzJmJJJsJfJmJvJbJ4JTJ2JDJ4/JNJkJQJjJSJVJII9JAIxIvIgIlIcIiIfIiItIsJDI8JbJFJi',
    "D": '104.2|ItKkIkKdIiKXIkKPIsKJIsKDImJvIiJLIcIzIcIlIaIjIeINIlIGIpIEI9IGJVISJ1IcKfIyKxJALAJRLGJdLIJvK-KHKtKYKXKiKBKkJ_KmJnKmJlKkIvKm/JdKMJ7KMJ9KKKTKIKfKCKoJ5KsJpKiJVKRJEJhIwI7ImI8JNJIKJ',
    "n": '87.5|InJwIgJrIcJbIaI3IUIdIUILIZIGIdIEIrIGJEIpJZI-JeIhJkIVJxIKJ9IGKZIIKlIOKyIbK0IfKzIsKrIqKlIkKVIcKFIcJ4InJyI5J0JdJvJiJjJiJVJaJIJNIvIsIwI9I4JZI4JtIzJyIpJy',
    "E": '90|KjKuJ3KkJXKkJVKmI3KoImKdIkKZIkKFIiKDIgJXISIbISIJIZH-IpH8I5ICKVIMKfIOKsIXKuIbKsIjKlIqKbIqKPIkJ3IiJpIeJDIcJBIaIwIbI2IxI4JFI7JII_JKJdJKJfJMKJJOKVJSKaJXKaJlKTJsKJJsJ_JmJ1JmJzJkI_JiI-J_JAKBJAKLJ3KMJ5KOKXKQKxKWK6KjK4KpKvKwKlKw',
    "C": '88.5|J7KuJrKqJXKgJBKQIsJ7IYJZIOIzIQIZIcIDIpH6I3H2JPH2JvIAKfIcKzIsLCI7LKJHLKJRLDJWKxJEKLIoJpIWJXIQI9IOIwIVIqIjIsI9I2JZJEJvJhKKJ_KYKJKYKKKVJ8KFJ8J7KFJ0KPJ0KYJ7KmKTKmKZKiKhKZKsKPKwJ9Kw',
    "o": '62.5|JHJ0I3JwInJmIcJbIQJHIIIxIIIbIOIPIbIGIxIEJNIQJbIaJuItJ0I3J4JDJ4JXJwJnJnJwJZJ2JJJ2/JLJiJRJiJZJeJeJXJgJHJcI9JBIiIxIaIlIcIgInIqJFI_Je',
    "f": '46.5|JRKyJFKuI4KhIsKFImJdIaJPIaJJIiJBIiI9IgI7IgIpIeInIcIJIWHrISHhILHaH7HaH2HTH4HLIFHCIVHEIgHNIoHZI0IDI8JFJbJKJqJTJqJXJlJcI-JdJAJ1JGKLJMKXJVKgJbKgJeKdJgKXJfJ8JnJ-JsKDJ0KTJ0KjJnKyJhK0JTK0',
    "O": '96.4|JlKqJZKoJJKgIsKFIcJtIOJJIMIpIWIRIhIEI3H4JbH6J3IGKFIQKkIxKsI9K4JZK6JhK4KFK0KNKhKgKRKoJ_KsJnKs/JtKUKDKSKPKMKYKDKcJ7KcJjKWJPKGI1JtIeJXIUI_ISIwIdIqIpIqJDIuJRI2JjJCJ1JZKMJjKS',
    "p": '74.9|IrJ6IkJzIgJlIiJbIgI7ISH1ISHrIKHLIKHDIXG4IfG6IoHHIwIFI7IAJHIAJjIMJtIUJ-IlKIIzKQJDKUJXKUJjKQJtKDJ4JzJ6JdJuJEJVI5JEI8JxI3J6IzJ8/J1JkJ6JdJ6JPJuI1JVIcJJIWI_IWI6IbI6IhJMI_JjJaJtJi',
    "H": '98.8|KnK8KeKzKeKbKcKZKcKJKaKHKWJnKLJgJlJeJjJcI_JcI8JhJEKJJEKpI_KuIxKwIoKnIeJJISINIUIBIdH4IpH6IwIFIyIZI0IbI0IxI4JBI7JEJPJEJRJGKRJIKSI5KQI3KQIpKOInKKIFKVH6KfH6KqIDKsIJKuJVKwJXKwJlK8KhK8K3KxK-',
    "T": '84.1|KPKmKFKmJdKcJRKcIzKWINKUIHKSICKLICKDINJ8IlJ8InJ-JMKBJIJXJGJVJGJDJEJBJEIPJGIHJTH8JZH8JiIHJgJBJiJDJiJVJkJXJoKFJxKKKFKMKHKOK1KOK6KTK6KdKzKmKrKoKRKo',
  } },
  cjk: { c: 64, g: {
    "當": '84|IrKIIgKDIvJ2I8J7IxKIItKK;JOKHJNJ0IRJ0IQJRIeJRIfJmKJJmKKJRKaJRKZJ0JdJ0JcKJJPKK;J5KIJsJ9J5J2KIKDKBKIJ7KK;IoJbIpI-KAI_J_JeIpJe/I7JSJxJSJyJLI3JKI2JR;IYIzIZH4IlH4InH-KBH-KDH4KQH5KPI2IZI2/IrIqJNIqJOIhInIgImIp/JhIqKBIqKCIhJdIgJcIp/IrIUJNIUJOINJLIKIpIKImINImIT/JhIUKBIUKCILJdIKJcIT',
    "舖": '84|IlKKIcJ3IKJjIRJYIVJaIXJWIhJWIkJTIjJKIMJJINI8IkI7IjIwISIvITH4IfH4IhIAIzIAI1H6JCH7JCIvIwIxIxI8JGI9JFJKIwJLIwJTIzJWI-JXI-JhIfJiIeJlIrJ2I7JmJAJpJEJxIyKBIzKIInKM/IlIiI0IhI0IRIxIOIgIPIgIh;JqKHJpJ4JGJ3JHJsJqJrJpJeJMJdJMH5JaH5JbIaJqIZJrH4J4H5J4IZKJIaKKIHKHIEKBIGKAH9KDH4KRH4KWH9KYIDKYJdJ5JeJ4JpJ7JsKdJsKeJ3J5J4J4KJJrKK/JfJSJqJRJpJEJaJFJaJR/J9JSKKJRKJJEJ4JFJ4JR/JfI2JqI1JpImJaInJaI1/J9I2KKI1KKIpKHImJ7ImJ4IpJ4I1;KEKHKAKDKDJ-KTJ6KYKBKXKEKJKKKFKK',
    "雜": '84|ItKIIoKHIpJ-IRJ-IOJ7IOJxJWJxJWJ7JTJ-I9J-I1KK;JkKHJeJxJSJXJSJTJYJJJeJLJeH5JrH4JtH-KdH-KdIMKIINKIIfKaIhKZIuKIIvKII_KLJCKaJDKZJOKLJOKIJRKIJhKbJiKcJvKKJxKIKBKDKKKBKIJ5KIJ2KFJ8J3J8JxJtJwJsJ1JyKHJvKKJlKK/JxJiJ8JhJ8JRJ5JOJsJPJsJh/JxJCJ5JCJ8I_J7IuJsIvJsJB/JxIgJ8IfJ7IMJsINJsIf;IcJpIaJhIOJNIOJJIVJCIfJMIiJLIlJEIuJLIuJPImJbIqJpIhJsIdJs;I7JqI6JhIyJNI7JEJBJOJJJCJSJLJGJbJIJpJDJs;IqI_IpI6IMI5INIsIoIrIMIPIMIJITICIpIYIqH5I3H4I5IYI9IYJPIIJWITJPIcI7IoI6IrJVIsJWI5I5I6I3JCIrJC',
    "貨": '84|I1KKInJ-IKJvITJkIhJsIjJaIyJbIyJ1JEKFI3KM;JKKHJKJlJTJcKTJcKcJjKeJtKVJwKRJwKLJoJbJoJYJrJZJ0KNJ0KNKCJZKCJXKKJLKK;IfJUIeITI0IRIlIKINIEIMIBITH4IhH6I9IGJGINJDISKKITKJJWIhJW/IzJKJ5JKJ8JHJ8JDIvJCIuJJ/IzI4J7I4J8IxIvIwIuI3/IzImJ7ImJ8IfIvIeIuIl;JrIMJnICKHH8KVH2KeIBKbIEJ_IMJ3IMJ1IOJtIO',
    "銀": '84|ImKHIaJ1IKJlIRJaIXJcIZJWIkJVIjJIIOJHIPI8IkI7IkINIfIKILIIIMH9IPH6IzIAJKIHJJIUI7IQIyIRIyI7JKI9JJJIIzJIIyJVJBJWJCJfJOJpI0KDI2KFI1KIInKK/IwJ1I-JnI9JkIeJlItJ2;JQKDJQIFJOIBJSH5JXH4JzICJ2IFJzISJgILJgI_KUJBKUKFJRKG/JlJ4KFJ4KGJrJhJqJgJ3/JlJcKFJcKGJPJhJOJgJb;JzI6JvI6JsI1J6IVKCIJKTH4KXH4KeH_KeIDKOIRKGIdKcI1KRI8KFIuJ_IsJ6I7J1I8;IPIyISIVIXIQIgIVIcIzIRI0;I8IxI4IZJBIWJGIfJIIxJDI0I9I0',
    "星": '84|IYKFIZJMKPJMKSJPKRKIIZKI/ItJ8KBJ8KCJxInJwImJ5IpJ8/IrJkKBJkKCJbInJaImJj;IlJGIeI7IKIpIVIgIlIuJNIuJNIiIbIiIaIXIdIUJNIUJOIJINIIINH6KeH7KeIFKbIIJcIJJdIUKOIVKNIiJdIiJdIuKVIuKVI6JdI6JbJGJPJGJOI9JLI6IxI6IwI9I2JFIvJIInJI',
    "餐": '84|IwKHIvJ0IoJ1IqJ3IpJ8IfJ-IWJvIMJlIMJhIRJaIZJgIiJZIfJWIMJRIOJLITJGIfJII1JSJBJaJQJpJPJ0I_J0I-J5JTJ6JTKGI_KGI9KKIxKK/InJqI7JqI8JnIvJeIiJp;JaKDJaJ9JgJ7JaJ1JuJpJtJmJgJhJnJWJvJYJ7JgKNJQKRJQKYJXKXJaKGJnKWJ7KVKGJbKG/JtJ8KFJ8KGJ5J9JwJ5JwJoJ7;JRJcJBJQItJGIMI7IOI1ITIwIdI0IgIzIgIJIcIDIeH5I3H6JUIBJTIMIvIGIvISJ_ISJ5IKJtIOJhIOJcIFJjICJtICKHH8KXH2KeIBKKIHKSIPKIIXKIIzKLI0KRIwKZIwKeI7J7JGJrJOJfJaJXJe/JWJNJeJHJKJHJTJO/JAI_JBI8JnI8JtJAJ6I5IsI5I_JC/IzIuJ5IuJ6IrIuIrIvIu/IzIgJ5IgJ6IdIuIdIvIg',
    "館": '84|IpKKITJyIKJtIPJeIdJoIfJiI7JiI9JsJFJmJKJrJMJxI2KFI4KHI1KKIvKM/IxJ4I5JuIkJvItJ4;JxKKJrKKJmKHJsJ9JrJ6JQJ5JQJdJWJbJXH4JjH4JlH-KYH_KXIqJnIqJkItJlI2KRI2KSJZKVJcKcJdKcJ5J9J6J2KLJzKM/JjJsKNJsKOJhJfJgJeJr/JpJSKDJSKEJFJlJEJkJR/JrIeKJIeKKINJlIMJkIbJnIe;IUJZIUIJIQIFIUH5IXH4IvIAI5IGI8IFI_H8JJIAJMIDJKIJI9IgIzIeIwIbI0IVIxIQInIMIiINIjIkJGIlJGJbIVJc/InJOI3JOI4JHIjJGIiJN/InI8I3I8I4IxIjIwIiI7',
    "南": '84|JOKHJNJ8IMJ7INJuJOJtJNJgIUJfIUH5IiH5IjJSI-JRI0JLI8I_ItI-IsIxJNIwJOIlIpIkIoIXJNIWJPH8JcH9JdIWKCIXKBIkJdIkJcIvJ9IwJ-I9JvI-J0JLJqJRKFJSKIJPKIIJKFIGJyIFJ5H4KNH4KWIBKWJfJdJgJcJtKdJuKeJ7JdJ8JbKKJPKK/JHJSJlJSJmJNJdI-JNI-JCJR',
    "大": '84|JOKHJLJmIOJlIPJWJHJWJIJPI0IpIZIOIPIIIMIFIMIBIVH4IjICJCIjJOI3JVJKJcI1JsIbKHIAKVH2KeIDKPIMJ2IlJkJFJgJVKbJWKcJlJbJmJcKJJPKK',
    "道": '84|IXKKIQKBIZJ8InJuIrJuI0J3IbKM;JNKKJEKDJRJ6JVJ4JgJ_JdKEJRKM;J_KIJ0J_J_J4KFJ6KQKDKPKGKHKK;I4JzI5JqJeJpJZJgJAJfJAIPKVIOKWJfJqJhJxJqKdJqKeJ1I5J2/JTJUKFJUKIJRKIJLKFJIJRJIJOJLJOJT/JTI8KHI8KII1KFIyJPIyJOI7/JTImKFImKIIjKIIdJPIcJOIl;IMJlINJaIiJZIOI9IOIvImItIaITIKIBITH4IlIKI5H-JJH6JnH6JpH4KaH5KeIDKdIGJdIGJbIIJFIII1IOIsIZI2IvI2I7IzI-IiI_I0JZI0JnINJo',
    "橫": '84|IgKHIgJtIMJrINJeIdJeIeJbIKIxIRIiIWInIcI3IgI5IgH5ItH4IuJBIwJBI1I0I-I9I-JBIuJdI9JeI-JrIuJtItKKIhKK;JOKHJNKAI-J_I-J1JOJzJPJgKJJgKKJzKcJ1KcJ_KLKAKJKKJ9KKJ7KAJdKAJbKKJPKK/JhJ0J7J0J8JrJdJqJcJz;I8JVI9JMKeJNKdJYI9JY;JCJDJDISKYITKYJDKVJGJDJG/JVI6JlI6JmIzJRIyJQI5/J5I6KJI6KKIzJ1IyJ0I5/JVImJlImJmIfJRIeJQIl/J5ImKJImKKIfJ1IeJ0Il;JVIOJDIGI3IEI0IBI6H3I_H2JVH-JkIHJZIQ;J7IOJ2IJJ1IEKNH8KXH2KaH3KgIBKFIOJ9IQ',
    "街": '84|ImKHIMJrIRJeIZJiImJvI0KDIzKGIrKKInKK;JMKHJLJ4I2J3I3JsJJJsJMJpJMJXI1JWI0JJJxJIJxJWJaJXJaJrJvJsJwJ3JbJ4JZKKJNKK;J4KBJ4J5J7J2KcJ3KbKEJ5KE;IoJjIaJLIKI7IRIsIXIyIaIxIbH2IoH3IoJHI2JfIpJm;J3JaJ2JPKDJOKGJLKGIJKDIGJ1IGJ0H_J3H4KLH4KSH9KUIDKUJNKeJPKeJbJ5Jc;JMI_JLIyI2IxI3ImJMIlJMINJHIKI1IIIyIFI1H6JHH8J2IJJ1IWJfIQJaIRJaIlJvImJwIxJbIyJZJCJNJC',
    "巷": '84|I1KIIzJ6IWJ5IXJsIzJsI0JdIOJbIPJOIvJOIwJLIjI-IXI2ILIyIMIrITIkInIwIqIvIqIDIzH6JpH4JrH6KJH6KNH8KWIHKWIRKYITKXIWKNIaKIIXKGILKDIIJ7IIJ5IGJJIGJHIII7III4ILI4IXJ5IYJ7I0KVIkKcIpKeIxKLI6J4JNKbJOKcJbJ0JdJ1JsKTJsKUJ5J1J6JzKKJmKJJlJ6JFJ6JEKHJBKKI3KK/JJJsJlJsJmJdJFJcJEJr/JHJOJnJOJwJBI7JAJAJLJDJO/I9IyJrIyJsIlI5IkI4Ix',
    "檢": '84|JnKKJRJ0I6JlJDJaJRJkJTJaKDJaKFJkKXJaKcJfKeJjKdJoKLJwJ9J6J0KDJ1KIJrKM/JtJ4J-JpJYJpJpJ4;IeKHIeJtIMJrINJeIdJeIeJbIaJPIKIzIKItIRIiIcI3IeI3IeH5ItH4IuJDIwJDI1I4I-I_I-JDIuJbIvJeI4JfI4JrIuJtIuKJIfKK;JAJPJAIpJlIoJmJRJBJS/JTJGJXJGJaJDJZI2JOI3JOJF;JwJPJwIpKVIoKWJRJxJS/KDJGKKJFKJI2J-I3J-JF;J9IkJ2ITJmH9JxH2KBIKKXH4KgIBKIIXKKIhJ_Im;JNIiJEIRIyH_I9H2JRIMJfIAJoIJJYIZJcIfJbIiJXIkJPIk',
    "疫": '84|JVKIJQKHJTJ-IkJ9IkJJIZI-IKI1IRIoIdIyIkIzIeIXIWIJIMH_IXH2IqINIwIfIwIpIyIrIzJwKeJxKeJ7KbJ-JlJ-JdKK;IRJyIMJxIMJpIQJfIQJVITJSIXJSIeJXIeJfIYJzITJ0;JIJlJIJTJGJPI2JDI9I4JFI6JQJDJWJPJXJaJzJaJ0JBJ7I6KcI7KbJIKFJIKCJLKBJoJJJo;I4IvI4InI7IkJBIkJWINJBIGItIEIsH_IzH2JTH8JlIEKDH6KXH4KZH2KcH5KgIDKdIGKRIGJ4INKOIfKSIlKRIyI5Iy/JbIkJ8IjJzIaJnIUJWIhJXIk',
    "區": '84|IMKDIMJ7IUJ3IUIFIZH-IdH8KeH9KdIIIlIIIiILIiJ5KbJ6KbKGINKG;I6JtI7JKKEJLKDJwI7Jw/JNJkJ1JkJ2JXJJJWJIJj;IsI_ItISJaITJZJCItJC/I_I0JMIzJLIgI6IhI6Iz;JkI_JlISKUITKUI_KRJCJlJC/J3I0KGIzKFIgJyIhJyIz',
    "禁": '84|IqKHIpJ-IMJ9IMJzIPJwIoJvIdJkIKJXIRJMIXJOIpJeIqJNI3JMI5JgJFJYJMJfJMJjJJJmI4JvJNJwJOJ9I5J-I3KKIrKK;JwKHJvJ-JWJ9JXJwJuJvJfJiJMJXJVJMJvJeJwJNJ9JMJ-JdKBJeKXJMKeJZKAJvKZJwKaJ9J_J-J9KKJxKK;IWJDIXI6KSI7KRJGIXJG;IMItINIiJLIiJOIfJPH4JcH5JdIiKeIjKeItKbIwINIw;IvIaIhIQIKIFITH6IjIAI-ITIzIc;JzIaJsITKBIIKTH6KeIDKbIIKJIUJ5Ic',
    "止": '84|JQKHJQILIuILIuJxIhJyIeJvIeILINIKIMH7KdH6KeIHKbIKJgILJgJLKVJMKWJZJjJaJgJdJgKJJRKK',
    "進": '84|IXKIIQKBIpJsIyJ3IdKK;JQKHJCJnI2JVI4JNI9JIJGJPJGIVKbIUKbIiJ6IjJ7IwKYIxKYI7KVI-J6I_J7JMKYJNKXJYJ7JYJ6JlKZJmKaJzJ9J0JzKKJmKHJtJ0JZJ0JYJ3JcJ9JeKHJbKKJRKK/JZJmJrJmJsJZJVJYJUJl/JZJMJrJMJsI_JVI-JUJL/JZIwJrIwJsIjJVIiJUIv;IMJlINJaIiJZIaJLIOI9IOIxImIvIaIRIMIBITH4IXH2InIKI7H-JLH6KcH7KeH_KdIIJJIIIvIUIsIXI0IrI0I7IjI8IiI_IyJXIyJnINJo',
    "入": '84|I6KDI7J4JQJ3JQJvJIJTI8I5IwInIdISIKIDIVH4I0ITJKIzJVJQJYJNJgI1J6IPKRH4KZH8KeIDKCIdJ2ItJqJDJgJlJeKFI7KG',
    "封": '84|IsKHIrJ0IQJzIRJmIsJlIsJVINJUIMJHJXJGJXJUI6JVI6JlJTJmJUJzI9J0I6J3I6KJItKK;KEKHKEJtKBJqJaJpJbJcKEJbKEIJKBIGJmIFJoH7JzH2KJH4KSIBKSJbKeJdKeJpKSJrKSKJKFKK;JlJMJfJKJeJHJoIzJsIhJvIgJ5ImJ6IrJsJNJnJO;ItJAIrIyIQIxIRIkIsIjIsININIGIMIDIRH4IxH-JYIJJXIYI_IQI6IRI6IjJTIkJUIxI9IyI6I1I5JCIvJC',
    "城": '84|IcKHIcJjIZJgIMJfIMJVIPJSIcJRIcIjIKIXIPIKIjIUI0IhI0ItIxIuIqIrIqJRI2JTI2JfIqJhIqKJIdKK;JsKHJrJ0I8JzI8IzI6IxI6IjIyILIqH_I1H2I8H_JEITJGIjJIIlJJJEJYJDJWIfJTIcJKIdJMIPJbIQJgITJkIbJmJRJJJSJIJlJLJoJrJoJsJbJuJZJuI7JwI5JyIfJWH_JdH4JhH4J3IOJ-IBKHH4KTH4KcIHKgIXKdIaKVIeKSIdKSIVKNIIKIILKCIZKCIfKSI_KYJXKNJcKKJZKKJTKCI7J9I0J8JLJ6JNJ7JoKeJpKeJzKSJ1KaJ_KJKKKAJ_KQJ1J7J0J6KJJtKK',
    "中": '84|JMKHJLJwIUJvIUIpJLIoJMH5JbH4JdIoKWIpKWJvJdJwJcKJJNKK/InJgJMJfJLI2IlI2IiI5IiJf/JhJgKGJfKFI2JcI3JcJf',
    "立": '84|JPKKJEKHJMJ3JNJwISJvITJgIqJfIiJZIiJVIsI7I2ILINIKIMH9KdH8KdIKJ0ILKGJNKGJZJ-JfKXJgKYJvJhJwJUKLJRKM/I1JgJ4JfJ4JVJ2JTJwIxJmIRJhIKJHIKJEINJEIXI6JBI2JJI0JVIwJbIwJf',
    "即": '84|IQKFIQINIOIFITH-IXH-JDIQJIIBJPIAJWIFJWIJJDIyI2ItI-IdI7IaIlISIgITIgI5JQI7JQKHIRKI/IlJ6JBJ6JCJpIhJoIgJ5/IlJaJBJaJCJJIhJIIgJZ;JgKFJgH5JtH4JuJ3KMJ3KMIbKJIWJyIVJ5IGKRIIKaITKaKHJhKI',
    "撤": '84|J6KJJ0JpJuJXJoJNJzJCJ6JPJ-JfKBJiKKJhKKJNKIJLKII9KFIyJ_JEJ0I_J4IpJ-IbJ4IPJqH_J1H2KCIFKFIMKOH_KXH4KgIBKMIbKUI1KYJhKeJjKeJvKFJwKEJ3KGJ5KIKJJ9KM;IaKHIaJvIMJtIMJhIaJfIaI_IKI3IPIsIaIvIaIJIXIGIMIFIOH7IRH4IhH4ImH9IoIBIoI3I0I9IxJKIoJHIoJfIvJgIyJjIyJtIoJvIoKJIbKK;JMKHJHJ8I0J7I1JwJCJvJAJpI0JdI3JQJJJSJVJWJbJWJhJQJqJVJoJdJfJsJXJqJUJnJWJjJTJgJGJfJTJwJuJxJtJ8JZJ8JZKIJNKK;I4JHI4IXIuH_IzH6I5H4JCIHJFIUJJIMJZIUJaIHJVIEJMIDJRH4JhH4JmH9JmJJI5JK/JLI-JXI-JaI7JaIjJTIeJHIaJGInJPIoJTImJYIxJHI2JGI9',
    "離": '84|IxKKIrKKIoKHIpKAINKAIMJzJaJzJZKAI7KAI2KLIzKM;JmKJJeJrJVJaJUJrJIJrJHJMIhJMIgJpIdJsIUJrIUJBItJAIuI5IrI2IfI2IdI6ITI6IRI2IMI1IMIrISInITH4IeH5IeInIhIqIqIpIoIbIiIRIlIIIrIII7IOI_IIJDIKJGINJGITJCIhI_IkI4IfI6IZI1IWIyIXI2InI5IqJHIqJKInJKIHJHIEI9IEI-H7JBH4JNH4JWH_JWI1I6I3I7JAJTJAJVJSJbJIJgJNJgH5JtH4JvIAKeIBKdIOKKIPKKIfKXIgKaIjKZIuKKIvKKJBKaJDKZJOKKJPKKJhKbJiKcJvKNJwKIKBKDKIJ4KFJ-JxJvJwJuJ1JyJ9J0KJJrKMJnKM/JzJiJ8JhJ7JOJuJPJuJh/JzJCJ8JBJ7IuJuIvJuJB/JzIgJ8IfJ7IOJuIPJuIf;I7JsI1JmIpJsIiJlIsJdIiJVIpJOIzJWI3JWI_JOJGJXI-JdI-JhJGJpI_Ju',
    "蔬": '84|IuKHItJ-INJ-IMJzItJyIvJoI7JoI8JvI_JyJSJzJRJ-I_J-I8KBI7KKIvKK;JsKHJrJ-JYJ9JZJyJrJyJtJqJ5JqJ9JyKeJzKdJ-J9J-J6KBJ5KKJtKK;JoJlJjJeJMJdJNJQJcJPJKI9JPIyKHI2KLI4KTIwKcI1KcI5KLJOJ_JKJ_JCJhJAJtJQKaJRKZJeJ1JeJ3JmJpJo;IOJfIPJUI2JTIqJDIqIRInIOIiIPIiJHIUJHIUILIRIIIKIHIOH7InIAJFIKJFIYI7IUI4IVI4IpJFIqJGI1I5I2I4I_JGJTJGJfJDJiIPJi;JQIrJOIRJKIJJAH_JLH2JQH5JaIJJcIbJeIdJeIrJbIuJRIu;JoIrJoH9J1H8J2IrJzIuJpIu;KBIsKAIBKCH9KJH4KdH4KeIFKOIHKOItKDIu',
    "果": '84|IaKFIaJJJLJIJOJFJOI9JLI6IKI5ILIuJCItItIaINIKIKIHIQH9ITH8IrIIJNIiJOH5JbH4JdIkJtIUKBIGKPH-KZH8KeIHJ5IcJoItKdIuKeI5JcI7JdJIKQJJKQKHIbKI/ItJ6JNJ6JOJvIpJuIoJ5/JhJ6KBJ6KCJvJdJuJcJ5/ItJiJLJiJOJfJOJXJLJUIpJUIoJh/JhJiKBJiKCJVJdJUJcJh',
    "新": '84|IvKKIpKKIkKHIoKBInJ-IOJ9IPJwIeJvIYJrIeJZIPJYIOJLIpJKIqI_INI-IMIxIqIvIqH5I5H4I6IvJYIxJXI-I6I_I7JKJWJLJVJYJGJZJOJpJNJsJGJvJVJwJWJ9I7J-I0KLIxKM/IrJwJAJvI3JYIvJYIsJbImJtInJw;KJKIJ3KCJjKAJgJ9JgIxJYIPJQIDJbH4JgH9JoIPJsIfJsIrJuItJuJHJxJKKAJJKAH5KOH5KOJJKdJKKeJXJuJZJvJyKDJ2KaJ_KPKK;JHIqJBIoJAIlJLIOJVIUJWIXJOIpJLIs;IZIoISIXIKINIVIEIcILImIhIlImIdIq',
    "鮮": '84|IoKHIeJ3IKJjIOJZIRJWIUJXIUIhJPIgJQJlJCJnJMJzJMJ9IzJ-I2KFI1KIIpKK/IvJyI3JyI4JvIvJmIiJnIrJy/IlJYIsJXIrJKIgJLIgJX/I9JYJCJXJBJKI4JLI4JX/IlI8IsI7IrIuIgIvIgI7/I9I8JCI7JBIuI4IvI4I7;JdKIJYKDJgJ5JmJrJpJqJxJuJ0JxJoKHJlKK;KNKIKIJ9KAJzKAJvKJJqKQJvKcKFKTKK;JYJlJZJaJyJZJxJIJaJHJbI6JyI5JyIpJXIoJWIbJxIaJyH5J_H4KAIXKDIaKeIbKdIoKAIpKBI6KXI6KaI9KZJIKBJIKAJXKDJaKbJaKcJnJZJo;ITIaIMH7IXH2IcIDIgIZIZIc;JJIaJFIaJEIXJKILJMIBJVICJYIFJSIVJNIc;IjIYIkH5IpH4IwH7IuIZIlIa;IzIYI4H9JDH8JEIHJAIXI9IaI1Ia',
    "現": '84|JIKDJIIpJYInJUIXJHIKIyIDI2H5I5H2JBH4JVICJcIJJkIXJnIoJ0InJ0IBJ2H9KDH4KVH6KcIBKeIVKRIaKOIJKDIIKCInKWIpKWKFJJKG/JbJ4KHJ4KIJtJXJsJWJ3/JbJeKHJeKIJTJXJSJWJd/JbJEKHJEKII3JXI2JWJD;IMJ_INJyIeJxIeJTIOJRIPJEIeJDIeIbIMIRIOIFITIEJAIdI_IsIxIkIuIlIuJDI-JFI9JSIuJTIuJxI9JyJAJ1JAJ_I9KCINKC',
    "金": '84|JPKII9J2IdJiIMJbIMJXITJOIXJOInJYIqJXIrJQJOJPJNJAIWI_IXIyJLIyJOIvJOILITIKISH9KXH8KXIKJcILJdIyKUIzKTJAJdJAJcJPJ9JQJ-JXKDJYKVJOKZJOKeJZJvJ0JeKDJgKFJfKIJZKKJRKK/JXJ2JnJoJ2JfI0JfJVJ4;IpIqIjIoIiIlIwIRIzIOI_IQJAIVI0InIvIs;J6IpJqIVJrISJ5IOKKInJ_IsJ7Is',
    "收": '84|I2KHI2IxIjImIeInIeJ_IQJ_IQIhIOIfIOIXIQIRIVIQI1IgI2H5JFH4JGKJI3KK;JgKHJcJzJUJbJKJJJKJDJTI6JWI9JnJkKCJjKAJJJ8I5JzIoJuItJnJEJaI_JcIzJqIbJfIQJIIDJRH4JVH4JlICJvIMJ1IOKFIAKTH4KZH4KgIDKLIOJ-IZJ-IdKMI7KSJjKeJlKeJxJtJyJsJ7JwKJJhKK',
    "購": '84|JUKHJTKAJCJ_JDJ0JUJzJTJsJGJrJGJjJTJiJUJbI_JaI-JPJlJOJmJFJIJDJIIfI-IdI-ITJIIRJIH5JWH5JXISKFISKGIJKDIGJ1IGJ0H_J3H4KNH4KSH9KUIDKUIRKeITKeIdKUIfKUJDJ3JEJ2JNKeJPKdJaKIJbKJJiKWJjKWJrKJJsKIJzKbJ0KcJ_KJKAKHKKJ7KKJ5KAJjKAJhKKJVKK/JnJ0J5J0J6JtJjJsJiJz/JnJiJ5JiJ6JbJjJaJiJh/JbI4JlI4JmIxJXIwJWI3/J7I4KFI4KGIzKDIwJ3IwJ2I3/JbImJlImJmIfJXIeJWIl/J7ImKDImKGIjKGIfJ3IeJ2Il;IQKDIQIhIYIfIKH_IVH4IaH9IkIVIkIZIcIfI6IhI6KFIRKG/IjJ4IsJ3IrJoIeJpIeJ3/IjJcIsJbIrJMIeJNIeJb/IjI-IsI9IrIuIeIvIeI9;ItIaIoIVIwIHIyH9I1H8I_IAI-IJI2IZIzIc',
    "丙": '84|IMKFINJ4JOJ3JOJrJLJmISJlISH5IiH5IjJYJKJXJKJPJAI3ImIfIvIUJGInJVI-JsInJ4IVJ7IUKEIfJ6ItJYJRJbJYKFJYKIJVKIINKBIGJrIGJqIDJvH4KJH4KNH6KWIDKWJlJdJmJcJ3KbJ4KeJ7KeKHINKI',
    "烷": '84|JvKKJnKKJkKHJoKBJpJ6JGJ5JGJZJUJZJVJsKNJsKOJZKbJYKcJ5J7J6J4J9J0KLJxKM;IiKHIiJDIgJBIgIvIaIZIMIFIMH_ITH4IaH9IiIJIrIeI5IKJEITIuIxIwJLI-JdJEJpI5JyIxJkIwKJIjKK;IRJqIMJnIMJhISJNISJBIXJAIeJFIeJRIYJpIVJs;JYJbJZJQKIJRKHJeJZJe;JCI_JDI0JXI0JaIxJaItJUIXJLIMI6IBJBH2JRH-JgIPJmIdJpI0J4IzJ4IBJ6H9KDH4KRH4KXH6KcH_KgIXKXIcKSIbKQIJKNIGKJIGKGIJKGIzKdI0KdJCJDJC',
    "危": '84|I7KIIpJ0IMJfIVJUIeJXIeIxIcIvIcIlIUINIMIBINH-IXH4IgIDIqIdItJSKbJSKeJVKeJfKbJiJuJjJ-JxJ9J-JJJ-JIKBJMKFJLKIJFKKI9KK/I_JwJmJvJXJiIsJjI1Js;I8JDI8IBJDH6KRH6KaIBKeINKeIVKRIcKOIZKOIPKJIIJNIIJKILJLI4J9I4J-IpJ5IkJkIjJmIZJpIWJ9IWKHIaKMIjKMItKOIvKNJGI9JG',
    "險": '84|JnKKJTJ2I4JnI_JaJPJkJSJjJTJaKFJaKHJiKLJiKXJaKcJfKgJlKdJoKBJ4J2KDJ1KIJpKM/JuJ3J-JpJYJpJnJ2;IOKFIOH5IbH4IcJ3IfJ6IqJ5IoJtIgJZIgJTIkJPIqJBIsIvIpIqIlIoIgIpIgIhIjIaIrIaIzIeI4IlI4I_IuJVI4J1I4KHIPKI;JCJPJCIpJnIoJoJRJDJS/JVJGJaJFJZI0JQI1JQJF;JwJPJxIoKYIpKXJSJxJS/KDJGKHJGKKJDKKI3KHI0J-I1J-JF;JNIiJCIPIyH_I7H4I_H4JRIMJfIAJoIHJoILJYIXJcIhJTIk;J-IhJyINJmH_JxH2J8IFJ_IIKDIIKTH4KXH4KeIBKGIVKMIfKDIkJ_Ik',
    "早": '84|IcKDIcI9JNI8JOItJLIqINIqINIcJNIcJOH5JbH4JdIcKeIdKdIqJfIqJcItJdI8KOI9KNKGIdKG/IvJ4J_J4KAJrJ9JoItJoIqJrIqJ3/IvJaJ_JaKAJNJ9JKItJKIqJNIqJZ',
    "午": '84|I0KJIgJtIKJZIXJOIvJoJNJoJOJHJLJEINJEIMI3JNI2JOH5JbH4JdI2KeI3KdJEJdJEJcJnKVJoKWJ1I7J2I6J5JCKFI1KM',
    "營": '84|IsKHIsJ5IoJxIhJqITJmIQJjIUJbIXJYIfJaIzJmJJJaJOJfJQJlI5JwI4JzJPJ8JOKDJLKGJHKGI7KAI5KKItKK;JyKHJyJ9JuJxJnJqJfJmJXJmJUJjJYJbJbJYJlJaJ1JkJ7JkKTJYKaJfKaJjJ8JxKTJ6KYJ_KUKFKRKIKDKAJ_KAJ_KKJzKK;IVKEIQKBIbJwImJ1IiJ_IbKG;JdKEJWKBJeJzJhJwJpJyJsJ1JqJ7JhKG;IOJTIPI8IbI8IdJKKLJKKNI8KaI9KZJWIPJW;IkI_IlImJKIlJFIeIXIeIXH4IjH4IlH8KDH8KFH4KSH5KRIeJYIfJbImKBImKBJCIlJC/I3I4JzI4J2IzJzIwIzIwIyI3/IpIUKDIUKEIJIlIIIkIT',
    "業": '84|I-KHI9JwIMJvINJkI6JjIwJdI0JZIzJWIRJWIQJLJLJKJOJHJNJCIVJCIUI1JNI0JOIvJLIsINIsIMIhJLIgJOIdJOH5JbH4JdIgKeIhKdIsJdIsJdI0KVI0KWJBJdJCJcJJKZJKKZJWJ1JWJ4JfJwJjKdJkKeJvJtJwJqJzJpKKJdKKJcJxJPJwJMJzJMKJI_KK/JDJkJqJjJhJWJHJWJEJdI-Jj;IfKGIaJ_InJyIyJ5IlKI;KBKGJ2J7J_J0KDJ0KQKBKPKEKHKI;JxIaJsIVJrIOJ5IKKXH6KgIDKZIKKBIWJ9IWJzIc;IxIYIMIDIVH4IjH-JAIRI3Ia',
    "小": '84|JQKHJQINJLIGI7IGI3III2IBI7H4JVH4JeIBJeKJJRKK;IoJpIeJFIWIxIKIdIXIUImIvI2JhI1JoIpJs;J_JqJ3JoJ2JhKGI7KOIZKTIUKbIYKeIbKeIfKIJhKEJpKBJs',
    "心": '84|JHKIJCKBJYJnJiJVJtJaJwJdJgJ1JNKK;I2JjI2IDI4H_I_H6JLH6JNH4JvH6J6IFJ8IjJ-InJ3IsJwIrJuInJuIRJpIIJHIIJEINJEJlI3Jm;IcJTIWIxIKITINIOIVIKIaINIiIjIqJFIqJPIsJRInJWIdJW;J_JUJ2JPKEI1KRIOKeIVKcIhKGJTKDJW',
    "典": '84|I8KHI7J4IYJ3IYItINIsIMIhKdIgKeIrKTIsKQIvKQJ3JvJ4JtKKJgKJJgJ7JdJ4JLJ4JJKKI9KK/IrJsI8JrI7JUImJVImJr/JPJsJdJsJgJpJfJUJKJVJKJr/JzJsKCJrKBJUJuJVJuJr/IrJGI8JFI7IsImItImJF/JPJGJgJFJgIvJdIsJKItJKJF/JzJGKCJFKBIsJuItJuJF;I5IYIfIKIKIDITH4IjH8JIIRI7Ia;JrIYJkIRJlIOJtIMKTH4KeIBKZIGKDISJvIa',
    "押": '84|IgKHIgJxIMJvINJiIgJhIgJBIKI5IMIvIPIsIbIwIgIvIgILIZIGIOIFIQH7ITH4IjH4IsH_IuIDIuI1I-I9I-JHI7JMIxJGIuJHIuJhI9JiI-JvIuJxItKKIhKK;JEKFJEInJnImJoH5J1H4J2IlKXImKaIpKaKHJFKI/JXJ6JoJ5JnJgJSJhJSJ5/J7J6KKJ5KJJgJ2JhJ2J5/JXJSJlJSJoJPJnI2JSI3JSJR/J7JSKKJRKJI2J2I3J2JR',
    "黃": '84|IwKHIwKDItKAIRKAIQJ1IvJ0IxJgJ5JgJ7J0KaJ1KZKAJ7KAJ5KKJtKKJrKAI_KAI9KKIxKK/JDJ0JrJ0JsJtI_JsI-Jz;IMJXINJOKeJPKdJaINJa;IaJBIbIQKQIRKPJEIbJE/ItI6JLI6JOI3JOIxIpIwIoI5/JhI6J_I6KCI3KCIxJdIwJcI5/ItImJNImJOIdIpIcIoIl/JhImKBImKCIdJdIcJcIl;I7IMIlIGIKIDIRH4IdH4I3H-JGIFI9IO;JnIKJkIFJnIAJzIAJ1H-KHH8KPH4KVH4KcIBKbIEKDIKJ5IKJ3IMJpIM',
    "特": '84|IoKHInJqIgJrIiJ7IZJ-IUJ9ISJhIMJPIMJJIXJEIaJHIeJbInJcIoI7IlI4IPI0IKIxINIkIjIqIoIpIoH5I1H4I2ItJCIzJCJBI2I_I2JZI5JcJEJdJEJpI2JrI2KJIpKK;JsKHJrJ6JLJ6JIJ3JJJsJsJrJrJaJNJaJMJNKXJMKaJPKaJZJ7JaJ6JrKdJsKeJ3KbJ6J7J6J5KKJtKK;KAJFJ_I8JII7JJIuKAItKAIJJ9IGJpIGJoIBJrH4KFH4KOH_KOItKeIvKeI7KPI8KNJIKBJI;JZIoJTImJQIhJjIMJwITJdIq',
    "賣": '84|JOKHJNKEIPKEIPJ6JLJ6JOJ3JLJyITJyISJrIVJoKVJoKVJyJdJyJcJ5KcJ7KbKEJdKEJbKKJPKK;IUJfIVJGKWJHKVJiIVJi/InJYI5JYI6JRIjJQIiJX/JNJYJfJYJgJRJJJQJIJX/JzJYKFJYKGJRJvJQJuJX;IeI9IeINI0ILIdIEIPIEIMH_IRH2IhH4JDICJGIFJDIMKKINKJJAIfJA/IzI2J7I2J8IxIvIwIuI1/IzIqJ7IqJ8IlIvIkIuIp/IzIcJ7IcJ8IXIvIWIuIb;JpIGJmH_JpH8J7H8KTH2KZH2KeH_KdICKBIGJ_IIJrII',
    "北": '84|I2KHI2JdIOJbIPJMI2JLI2ITInIMILIGIKIDIPH4IXH4IzICI5ICJYIPJXIcJRIcJLIYJGIZJGKJI3KK;JgKHJgIDJlH8JvH4KJH4KRH6KWH9KcIJKeIjKXImKOIlKOIRKJIIJxIIJwJLKZJMKaJbJxJcJwKJJhKK',
    "方": '84|JJKIJFKIJCKFJKJ7JNJyIMJxINJkI2JjI2JRI0JPI0I_IyI9IwItImIbIXIMIKIDITH4IjICI0IVI-InJDI8J8I7J6IXJ2IJJzIGJTIGJUH9JXH4J3H4J9H6KGIFKIIdKKIfKMJJJFJKJEJZJGJbJGJjKdJkKeJxJfJyJWKFJRKK',
    "搬": '84|JMKJJFJ6I4J5I4JBIwI9IwIxI2IxI2IhIwILIqIBIzH4I2H5I-ILJAIbJCIdJCIvJFI0JNI0JPI2JWI1JWIHJKIFJMH7JPH4JbH4JiH_JiI3JmI7JmJFJiJJJiJ5JVJ6JUJ9JYKHJNKM/JJJsJWJrJWJFJFJAJEJr;IaKHIaJxIMJvIMJjIaJhIaJDIKI3IPIsIXIyIaIxIaIJIXIGIMIFIRH4IhH4IoIBIoI_IyJHIyJRIvJUIrJQIoJRIoJhIyJjIyJvIoJxIoKJIbKK;JwKDJuJfJoJVJoJRJvJKJ2JPJ8JlJ8J3KFJ4KGJVKIJRKTJMKdJMKeJbKUJdKUKFJxKG;JJJkJGJhJIJfJLJIJSJLJSJbJQJdJQJlJLJm;JqJBJqI3JwIzJ0IhJ8ITJxIIJoIDJqH9JxH4J_IEKFIGKXH2KeIBKMITKYIpKcI3KcJDJrJE/KBI2KMI1KFIgKAIlJ8IzJ9I2;JLIuJGIrJIIpJLISJSIVJQIvJNIw',
    "家": '84|JJKIJGKHJLJ-IRJ-IQJhIdJgIfJwKLJwKMJhKaJhKZJ-JdJ-JVKKJLKK;ImJlInJaJMJZIvJMIRJGIQJDIVI6IlI8I9JEJHJKJNJKJQJFJFI8ItIwINIoIQIfITIcIZIcItIiI_IqJXI6JaIxJLIkI7IaIlIQINIKIMIFITH8IrIEJHISJdIiJeIPJcILJXIGJAIFJHH4JdH4JhH6JqIFJtIeJ7IQKPICKXIAKcIFKdIMKFIaJwIvJxIyKDI8KSJJKHJSJ3JEJrI8JnI8JYJRJhJaKDJaKDJoInJo',
    "倉": '84|JPKKI9J8IpJyITJqINJqIMJlIOJhIVJcIrJkI5JsI9JkJtJkJxJsJ7JmKTJeKZJeKgJpJzJ4JfKEJgKHJbKKJVKM/JWJ7JmJxJEJxJTJ8;IhJcIeIjIUILIOIFIXH6IgIBIoIRIsIdIsInIvIqKMIrKLJeIjJe/I1JSJ9JSJ-JLIxJKIwJR/I1I-J9I-J-I3IvI2IwI9;IwIdIxH4I9H4I_H-KBH-KDH4KQH5KPIgIxIg/JFIWKBIWKCILI_IKI-ITJBIW',
    "儲": '84|JDKKI9KKI6KHI9J8IuJ7IuJvJZJuJaJ7JNJ8JIKJJFKM;IgKHIWJhIKJJITI6IYJFIaJFIaH5InH4IoJxIuKHIrKKIhKK;JwKHJvJ6JgJ5JhJuJwJtJwJhJfJgJeJVJ4JTJjI-JYI3JdIsJkItJkH5JxH4J1IAKJIAKNH4KXH4KYJDJ8JFKJJUKeJVKdJgKQJhKeKBKXKGKRKGKOJ7KJJ0KHJ6KBJ6J-J9J9KKJxKK/KDJuKIJtKCJhJ_JgJ-Jt/J3I2KLI2KMIpJzIoJyI1/J5IcKJIcKMIZKMIPKJIMJ1IMJyIPJyIZJ1Ic;IwJfIxJWJYJXJXJiIxJi;IwJHIxI8JYI9JXJKIxJK;IwItIwH5I9H4I_ICJJICJLH6JXH6JYIvIxIw/JFIkJKIhJKIRI_IQI-IhJBIk',
  } },
};
