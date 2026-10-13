// 失落之城 LOST TOWN — zone 'skyline': 街廓背面、外圍與天際線 (block backs, outer ring, skyline, sky).
// Everything OUTSIDE the five playable build zones (tools/map/losttown/layout.mjs BUILD_ZONES); never walkable ground.
// Recreates the backdrop of CSO's "Lost City" (zs_lostcity): dark 1900-1930s brick and limestone walk-ups with wooden
// water tanks and rooftop billboards right behind the street walls, and further out 1920s setback skyscrapers and
// 1960s concrete grid towers dissolving in the green-grey storm haze - a gothic tower with a gilded spire NNW above
// the rail bridge, a burning grid tower ENE whose smoke column leans north-east with the wind.
//   BD_NW / BD_NE   x ±26..±84, z -80..-40: south row (z -62..-40) behind the west / east cross-street pockets and
//                   the north avenue; north row + outer north ring (z -128..-74) seen over the bridge (NN3 / NN4 frame
//                   the gap above the underpass, NN7 closes the alley between them). Two upper windows of NE2 burn
//                   (LB_FIRES_FAR), seen from the East Cross Street junction.
//   BD_SW / BD_SE   x ±38..±84, z 40..84: faces over the pocket end walls of WX / EX (z 40) and SX (x ±38).
//   BD_RAIL         the viaduct beyond the bridge (x ±26..±84, z -74..-62): same green-grey plate girders on stone
//                   piers as LM_BRIDGE, deck 6.6 m, two tracks, catenary masts carrying on the bridge's wires.
//   outer ring      the "slots" the streets open towards the horizon: over the LED gantry (WR1: blank party wall
//                   with a faded FIZZ COLA ad, WR1b: 1960s grid tower), over the moving & storage depot (ER1: painted
//                   KESSLER BROS. sign, ER4 grid tower), over the bridge (NN*), over the south lane end (SS*).
//   mid ring        14 plain hazy blocks 110-150 m out (MID) that close the gaps between the ring and the towers.
//   BD_SKYLINE      12 low-poly towers 100-260 m out (layout BACKDROP), fog-tinted silhouettes: setbacks, crowns,
//                   masts, the gothic spire (-70, -190), the burning tower (200, -60) + smoke column; a few lit
//                   windows (strong emissive so they survive the 94-99 % fog at that range).
// All geometry, wording, brands (FIZZ COLA, KESSLER BROS., BLUE STAR TIRES, NIGHT EXPRESS) and art are original
// (docs/MAP_LOSTTOWN.md §0); lettering is our own 5x7 block font (FONT, end of file).
//
// Visibility. Players stand on the street (eye 1.6 m) or the fort deck (4.2 m), always below every roof here, so only
// the faces that look into the town are built (and only above the neighbouring zone's roof line that hides their
// lower part: `faces` spans [s0, s1, from]); roofs are never seen and are omitted, roof clutter (tanks, AC units,
// masts, billboards) is what draws the broken skyline above the parapets. Ground floors are always hidden.
// Seams: masses abut the zone borders exactly (x ±26 / ±38 / ±84, z -80 / -40 / 40 / 84) back to back with the
// neighbours' party walls; heights step past the neighbours so no back wall of another zone is ever exposed.
// Draw calls: everything is routed into one bucket per material and region (N, S, W, E, far), so the compiler emits
// one mesh per (material, region) and merges the light ones further: 16 meshes, ~33k triangles, 720 collision tris.
// Nav: the viaduct deck is BLOCK (see build()); nothing else here changes the nav grid.
// Lighting: masses / rail / clutter are lightmapped at low density (lm 0.25-0.35); far towers, glass and emissives are
// not (lm 0, env + sun). The far set does not cast (no baked shadows of 140 m towers sweeping the streets, which the
// runtime sun on zombies could not match). Fire windows of NE2 bake a small orange glow onto their wall.
// Sky (layout ENV, not this file): overcast_soil_puresky 1k, background tint #9fae94, FogExp2 #5b6459 / 0.0105, sun
// [-0.765, 0.5, 0.407]. The HDRI's bright patch sits at u ~ 0.485 (azimuth about +x, 35-45 deg up); runtime
// (backgroundRotation / environmentRotation, sampling dir' = Ry(-rot) dir) and baker (image dir -> Ry(+rot)) agree, so
// ENV.sky.rotationDeg = -157 puts it on the sun bearing 242 deg (checked in game: captures/map/skyline_rotpano.png).
import { MATERIALS } from '../../lib/materials.mjs';

const PI = Math.PI;

// Zone-local palette. Distinct lightmap densities keep them from folding into the other zones' materials, so the
// region buckets below stay separate meshes (instead of spreading one more mesh into every 40 m chunk).
const ZONE_MATS = {
  sk_brick: { set: 'brick_red', surf: 'concrete', lm: 0.35 },
  sk_stone: { set: 'plaster', surf: 'concrete', lm: 0.35 },
  sk_roof: { set: 'roof_tar', surf: 'concrete', lm: 0.25 },
  sk_metal: { set: 'paint_metal', surf: 'metal', tile: 1.5, lm: 0.3 },
  sk_wood: { set: 'wood_siding', surf: 'wood', tile: 1.6, lm: 0.3 },
  sk_win: { set: null, surf: 'glass', color: '#ffffff', rough: 0.2, metal: 0, lm: 0, env: 0.8, cast: false },
  sk_lit: { set: null, surf: 'glass', color: '#ffffff', rough: 0.6, emissive: '#ffb066', emissiveIntensity: 2.4, lm: 0, cast: false },
  sk_fire: { set: null, surf: 'glass', color: '#ffffff', rough: 0.9, emissive: '#ff6a1e', emissiveIntensity: 18, lm: 0, cast: false },
  sk_glow: { set: null, surf: 'glass', color: '#ffffff', rough: 0.9, emissive: '#ffd08c', emissiveIntensity: 24, lm: 0, cast: false },
  sk_far: { set: 'concrete_wall', surf: 'concrete', tile: 7, lm: 0, cast: false },
  sk_gold: { set: null, surf: 'metal', color: '#d9ad55', rough: 0.3, metal: 1, emissive: '#ffc062', emissiveIntensity: 70, lm: 0, cast: false, env: 1.4 },
  sk_smoke: { set: null, surf: 'dirt', color: '#ffffff', rough: 1, metal: 0, opacity: 0.55, lm: 0, cast: false },
};
for (const [k, v] of Object.entries(ZONE_MATS)) if (!MATERIALS[k]) MATERIALS[k] = v;

// ---------------------------------------------------------------------------------------------------- helpers
const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
/** sRGB hex -> linear rgb (vertex colours are linear). */
const lin = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => s2l(v / 255)); };
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0')).join('');
}
function wpick(kit, weights) {
  const tot = Object.values(weights).reduce((s, v) => s + v, 0);
  let r = kit.rnd(0, tot);
  for (const [k, w] of Object.entries(weights)) { r -= w; if (r <= 0) return k; }
  return Object.keys(weights)[0];
}

// Region buckets: every primitive emitted inside region() lands in one bucket per material (chunk of the region
// centre) instead of the 40 m chunk of its own centroid.
const REGION = { N: [0, -90], S: [0, 100], W: [-110, 0], E: [110, 0], F: [0, -300] };
function region(kit, id, fn) {
  const base = Object.getPrototypeOf(kit)._bucket;
  const own = Object.prototype.hasOwnProperty.call(kit, '_bucket') ? kit._bucket : null;
  const [cx, cz] = REGION[id];
  kit._bucket = function (m) { return base.call(this, m, cx, cz); };
  try { fn(); } finally { if (own) kit._bucket = own; else delete kit._bucket; }
}

/**
 * Face frame of an axis-aligned footprint r = [x0, z0, x1, z1]: side 'S' (z1, +z) | 'N' (z0, -z) | 'E' (x1, +x) |
 * 'W' (x0, -x). u runs left -> right seen from outside, y = world height, off = distance out of the wall.
 * U(w) maps the world coordinate along the face (x for S/N, z for E/W) to u.
 */
function F(side, r) {
  const [x0, z0, x1, z1] = r;
  if (side === 'S') return { side, L: x1 - x0, n: [0, 0, 1], P: (u, y, o = 0) => [x0 + u, y, z1 + o], U: (w) => w - x0, ua: x0 };
  if (side === 'N') return { side, L: x1 - x0, n: [0, 0, -1], P: (u, y, o = 0) => [x1 - u, y, z0 - o], U: (w) => x1 - w, ua: -x1 };
  if (side === 'E') return { side, L: z1 - z0, n: [1, 0, 0], P: (u, y, o = 0) => [x1 + o, y, z1 - u], U: (w) => z1 - w, ua: -z1 };
  return { side, L: z1 - z0, n: [-1, 0, 0], P: (u, y, o = 0) => [x0 - o, y, z0 + u], U: (w) => w - z0, ua: z0 };
}
const BACK = { S: 'nz', N: 'pz', E: 'nx', W: 'px' };
const ENDS = { S: ['px', 'nx'], N: ['px', 'nx'], E: ['pz', 'nz'], W: ['pz', 'nz'] };
/** Quad on a face (CCW from the front). */
function fq(kit, f, u0, u1, y0, y1, off, mat, o = {}) {
  if (u1 - u0 < 1e-3 || y1 - y0 < 1e-3) return;
  kit.face([f.P(u0, y0, off), f.P(u1, y0, off), f.P(u1, y1, off), f.P(u0, y1, off)], mat, o);
}
/** Box standing out of a face: u0..u1, y0..y1, off o0..o1. Back face never built; top / bottom / ends optional. */
function fbox(kit, f, u0, u1, y0, y1, o0, o1, mat, o = {}) {
  const a = f.P(u0, y0, o0), b = f.P(u1, y1, o1);
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), z0 = Math.min(a[2], b[2]), z1 = Math.max(a[2], b[2]);
  const faces = { [BACK[f.side]]: false };
  if (o.top === false) faces.top = false;
  if (o.bottom === false) faces.bottom = false;
  if (o.ends === false) for (const k of ENDS[f.side]) faces[k] = false;
  kit.box({ x: (x0 + x1) / 2, y: y0, z: (z0 + z1) / 2, w: x1 - x0, h: y1 - y0, d: z1 - z0, mat, faces, tint: o.tint, shade: o.shade, grime: o.grime });
}
/** Window pane: flat quad just off the wall, darker at the top (reveal shadow). Emitted directly (world space). */
function pane(kit, f, u0, u1, y0, y1, off, mat, tint, topK = 0.6) {
  const M = kit.material(mat);
  const c = lin(tint), t = c.map((v) => v * topK);
  const pts = [f.P(u0, y0, off), f.P(u1, y0, off), f.P(u1, y1, off), f.P(u0, y1, off)];
  const tu = M.metric ? M.tileU : 1, tv = M.metric ? M.tileV : 1;
  const UV = [];
  [[u0, y0], [u1, y0], [u1, y1], [u0, y1]].forEach(([u, y]) => UV.push((f.ua + u) / tu, y / tv));
  kit.emit(mat, pts.flat(), [...f.n, ...f.n, ...f.n, ...f.n], UV, [...c, ...c, ...t, ...t], [0, 1, 2, 0, 2, 3]);
}
/** Block-font text centred at u = uc, baseline y, letter height h, on a face. */
function text(kit, f, str, uc, y, h, off, mat, tint) {
  const s = h / 7, chars = [...str.toUpperCase()], adv = 6 * s;
  let u = uc - (chars.length * adv - s) / 2;
  for (const ch of chars) {
    const g = FONT[ch];
    if (g) for (let r = 0; r < 7; r++) {
      const row = g[r];
      for (let c = 0; c < 5; c++) {
        if (row[c] !== '#' || (c > 0 && row[c - 1] === '#')) continue;
        let e = c; while (e + 1 < 5 && row[e + 1] === '#') e++;
        fq(kit, f, u + c * s, u + (e + 1) * s, y + (6 - r) * s, y + (7 - r) * s, off, mat, { tint });
      }
    }
    u += adv;
  }
}
const textW = (str, h) => (h / 7) * ([...str].length * 6 - 1);

// ---------------------------------------------------------------------------------------------------- styles
// wall material + tint, trims, window size / rhythm. Storeys: ground 4.5 m, upper 3.4 m (1900-1930 downtown).
const ST = {
  brick: { wall: 'sk_brick', tint: '#c4ab9b', trim: '#d2c8b5', win: [1.15, 1.75, 0.9], bay: 2.9, lintel: true, belts: 'ground', cornice: [0.75, 0.5], frieze: true },
  brickBr: { wall: 'sk_brick', tint: '#a98f80', trim: '#c8bfae', win: [1.2, 1.8, 0.9], bay: 3.0, lintel: true, belts: 'floor', cornice: [0.95, 0.6], frieze: true },
  brickDk: { wall: 'sk_brick', tint: '#86726a', trim: '#b7ae9e', win: [1.1, 1.7, 0.9], bay: 2.8, lintel: true, belts: false, cornice: [0.5, 0.32] },
  stone: { wall: 'sk_stone', tint: '#aea796', trim: '#c4bdac', win: [1.3, 2.0, 0.85], bay: 3.2, belts: 'floor', cornice: [1.15, 0.75], frieze: true },
  office: { wall: 'sk_stone', tint: '#9a8f79', trim: '#b3a990', win: [2.4, 1.8, 0.8], bay: 3.6, mull: 2, belts: 'ground', pilasters: true, cornice: [0.8, 0.45] },
  stucco: { wall: 'sk_stone', tint: '#929b88', trim: '#b2af9e', win: [1.2, 1.7, 0.9], bay: 3.0, belts: false, cornice: [0.45, 0.28] },
  cream: { wall: 'sk_stone', tint: '#b3a785', trim: '#c9c0a9', win: [1.2, 1.75, 0.9], bay: 3.0, lintel: false, belts: 'ground', cornice: [0.6, 0.38] },
  grid60: { wall: 'sk_stone', tint: '#8e8c85', trim: '#a5a39a', ribbon: [1.6, 0.95], fin: 1.55, fh: 3.6, cornice: null },
};
const WIN_STATES = { glass: 38, curtain: 26, open: 10, broken: 15, board: 11 };
const GLASS = ['#1f2529', '#283035', '#1a1f23', '#2e353a', '#232a2e'];
const CURTAIN = ['#6c6152', '#7b705f', '#5e5b51', '#86796a', '#69594b', '#8a8476'];

/** Window opening content (pane only; sills / lintels are built by the caller). */
function winFill(kit, f, u0, u1, y0, y1, st) {
  if (st === 'glass') pane(kit, f, u0, u1, y0, y1, 0.02, 'sk_win', kit.pick(GLASS), 0.55);
  else if (st === 'curtain') pane(kit, f, u0, u1, y0, y1, 0.02, 'sk_win', kit.pick(CURTAIN), 0.62);
  else if (st === 'open') pane(kit, f, u0, u1, y0, y1, 0.02, 'sk_roof', '#5a5a5a', 0.7);
  else if (st === 'broken') {
    pane(kit, f, u0, u1, y0, y1, 0.02, 'sk_roof', '#3c3c3c', 0.8);
    // a shard of glass left in the lower corner
    const s = (u1 - u0) * kit.rnd(0.3, 0.6);
    kit.face([f.P(u0, y0, 0.025), f.P(u0 + s, y0, 0.025), f.P(u0, y0 + (y1 - y0) * kit.rnd(0.3, 0.7), 0.025)], 'sk_win', { tint: kit.pick(GLASS) });
  } else if (st === 'board') {
    pane(kit, f, u0, u1, y0, y1, 0.03, 'sk_wood', kit.pick(['#a58d6d', '#8f7a5e', '#b39c7a', '#7d6a54']), 0.85);
  } else if (st === 'lit') pane(kit, f, u0, u1, y0, y1, 0.02, 'sk_lit', kit.pick(['#5a4630', '#664c32']), 1);
  else if (st === 'fire') pane(kit, f, u0, u1, y0, y1, 0.02, 'sk_fire', '#3c1a0a', 1);
}

// ---------------------------------------------------------------------------------------------------- buildings
/**
 * Backdrop building (axis-aligned box + optional setback tiers):
 *   id, r [x0, z0, x1, z1], st (style), n (storeys incl. ground), par (parapet), base (y),
 *   faces: { S|N|E|W: { spans: [[s0, s1, from]...] (world coords along the face; from = lowest visible y),
 *            fire: [[floor, bay]], lit: [[floor, bay]], fe: s (fire escape at world coord), ghost: {...},
 *            win: false (blank party wall) } },
 *   tiers: [{ n, inset: { S, E, N, W } }], roof: [[kind, ...args]] (on the top tier), lit (chance)
 */
function bld(kit, B) {
  const st = ST[B.st];
  const gh = B.gh ?? 4.5, fh = B.fh ?? st.fh ?? 3.4, base = B.base ?? 0, par = B.par ?? 0.9;
  const roofY = base + gh + (B.n - 1) * fh;
  const levels = [];
  for (let i = 1; i < B.n; i++) levels.push(base + gh + (i - 1) * fh);
  for (const [side, spec] of Object.entries(B.faces || {})) facade(kit, F(side, B.r), spec, { B, st, base, gh, fh, levels, roofY, top: roofY + par, tier: 0 });
  let r = B.r, y = roofY, topR = B.r, topY = roofY;
  (B.tiers || []).forEach((T, ti) => {
    const ins = T.inset || {};
    r = [r[0] + (ins.W || 0), r[1] + (ins.N || 0), r[2] - (ins.E || 0), r[3] - (ins.S || 0)];
    const lv = [];
    for (let i = 0; i < T.n; i++) lv.push(y + i * fh);
    const ry = y + T.n * fh, tp = ry + (T.par ?? par);
    for (const side of Object.keys(B.faces || {})) {
      const f = F(side, r);
      facade(kit, f, { spans: [[null, null, y]], win: B.faces[side].win !== false && !B.faces[side].tierBlank }, { B, st, base: y, gh: 0, fh, levels: lv, roofY: ry, top: tp, tier: ti + 1 });
    }
    kit.colBox({ x: (r[0] + r[2]) / 2, y, z: (r[1] + r[3]) / 2, w: r[2] - r[0], h: tp - y, d: r[3] - r[1] }, 'concrete');
    y = ry; topR = r; topY = ry;
  });
  kit.colBox({ x: (B.r[0] + B.r[2]) / 2, y: base, z: (B.r[1] + B.r[3]) / 2, w: B.r[2] - B.r[0], h: roofY + par - base, d: B.r[3] - B.r[1] }, 'concrete');
  for (const item of B.roof || []) roofItem(kit, item, topY, topR, B);
  return { roofY, topY, topR };
}

/** One facade of a building tier: wall strips above the hide line, windows, trims, cornice, coping. */
function facade(kit, f, spec, c) {
  const { B, st } = c;
  const spans = (spec.spans || [[null, null, spec.from ?? c.base]]).map(([s0, s1, from]) => {
    const u0 = s0 === null ? 0 : f.U(s0), u1 = s1 === null ? f.L : f.U(s1);
    return [Math.min(u0, u1), Math.max(u0, u1), Math.max(from ?? c.base, c.base)];
  });
  const tint = B.tint || st.tint, trim = B.trim || st.trim;
  const fromAt = (u) => { let y = Infinity; for (const [a, b, fr] of spans) if (u >= a - 1e-6 && u <= b + 1e-6) y = Math.min(y, fr); return y; };
  // walls (soot towards the top, damp towards the bottom of the visible strip)
  for (const [u0, u1, from] of spans) {
    if (from >= c.top) continue;
    fq(kit, f, u0, u1, from, c.top, 0, st.wall, { tint, grime: { y: from, h: 6, k: 0.18 } });
  }
  const minFrom = Math.min(...spans.map((s) => s[2]));
  const ghost = spec.ghost;
  const inGhost = (u0, u1, y0, y1) => ghost && u1 > f.U(Math.min(ghost.s0, ghost.s1)) - 0.4 && u0 < f.U(Math.max(ghost.s0, ghost.s1)) + 0.4
    && y1 > ghost.y0 - 0.3 && y0 < ghost.y1 + 0.3;
  // ---- windows
  if (spec.win !== false && !st.ribbon) {
    const [ww, wh0, sill] = st.win;
    const m = 1.1, nb = Math.max(1, Math.floor((f.L - 2 * m) / st.bay)), sp = (f.L - 2 * m) / nb;
    const fireSet = new Set((spec.fire || []).map(([fl, b]) => fl + ':' + b));
    const litSet = new Set((spec.lit || []).map(([fl, b]) => fl + ':' + b));
    c.levels.forEach((ly, li) => {
      const fl = li + (c.tier ? 100 * c.tier : 1);
      const y0 = ly + sill, wh = Math.min(wh0, c.fh - sill - 0.35), y1 = y0 + wh;
      for (let b = 0; b < nb; b++) {
        const uc = m + sp * (b + 0.5), u0 = uc - ww / 2, u1 = uc + ww / 2;
        if (y0 < fromAt(u0) + 0.15 || y0 < fromAt(u1) + 0.15 || y1 > c.roofY - 0.2) continue;
        if (inGhost(u0, u1, y0, y1)) continue;
        if (spec.skip?.(fl, b)) continue;
        let state = wpick(kit, WIN_STATES);
        if (kit.chance(B.lit ?? 0.012)) state = 'lit';
        if (litSet.has(fl + ':' + b)) state = 'lit';
        const fire = fireSet.has(fl + ':' + b);
        if (fire) state = 'fire';
        if (st.mull) {
          // Chicago window: wide fixed centre + two sashes, stone mullions
          const parts = st.mull + 1, pw = ww / parts;
          for (let k = 0; k < parts; k++) winFill(kit, f, u0 + k * pw, u0 + (k + 1) * pw, y0, y1, fire ? 'fire' : (k === 1 || kit.chance(0.5) ? state : wpick(kit, WIN_STATES)));
          for (let k = 1; k < parts; k++) fq(kit, f, u0 + k * pw - 0.06, u0 + k * pw + 0.06, y0, y1, 0.035, 'sk_stone', { tint: trim });
        } else {
          winFill(kit, f, u0, u1, y0, y1, state);
          // 1-over-1 sash: meeting rail across the middle of glazed / curtained windows
          if (state === 'glass' || state === 'curtain' || state === 'lit') fq(kit, f, u0, u1, (y0 + y1) / 2 - 0.035, (y0 + y1) / 2 + 0.035, 0.03, 'sk_stone', { tint: shade(trim, 0.7) });
        }
        // sill (front + underside) and lintel
        fbox(kit, f, u0 - 0.1, u1 + 0.1, y0 - 0.12, y0, 0, 0.1, 'sk_stone', { tint: trim, top: false });
        if (st.lintel) fq(kit, f, u0 - 0.12, u1 + 0.12, y1, y1 + 0.24, 0.012, 'sk_stone', { tint: shade(trim, 0.92) });
        if (!st.mull && (state === 'glass' || state === 'curtain') && kit.chance(B.ac ?? 0.07)) {
          fbox(kit, f, (u0 + u1) / 2 - 0.34, (u0 + u1) / 2 + 0.34, y0 + 0.04, y0 + 0.5, -0.02, 0.42, 'sk_metal', { tint: kit.pick(['#aaa89f', '#9c9a92', '#b5b0a2']) });
        }
        if (!fire && kit.chance(0.4)) streak(kit, f, (u0 + u1) / 2 + kit.rnd(-0.3, 0.3), y0 - 0.12, kit.rnd(0.8, 2.4), kit.rnd(0.3, 0.7), 0.013);
        if (fire) fireWindow(kit, f, u0, u1, y0, y1);
        else if (state === 'broken' && kit.chance(0.5)) soot(kit, f, u0, u1, y1 + (st.lintel ? 0.24 : 0), kit.rnd(0.8, 2.0), '#5a5650', 0.006);
      }
    });
  }
  // ---- 1960s ribbon windows + fins
  if (spec.win !== false && st.ribbon) {
    const [rh, rs] = st.ribbon;
    for (const [u0, u1, from] of spans) {
      for (const ly of c.levels) {
        const y0 = ly + rs, y1 = y0 + rh;
        if (y0 < from + 0.1 || y1 > c.roofY - 0.2) continue;
        // a few dark / broken panels break the band
        let u = u0 + 0.4;
        while (u < u1 - 0.5) {
          const w = Math.min(u1 - 0.4 - u, st.fin * kit.irnd(2, 5));
          const s = kit.chance(B.lit ?? 0.02) ? 'lit' : kit.chance(0.16) ? 'broken' : kit.chance(0.25) ? 'curtain' : 'glass';
          winFill(kit, f, u, u + w, y0, y1, s);
          u += w;
        }
      }
      // vertical fins (mullions) over the full visible height
      for (let u = u0 + 0.4; u <= u1 - 0.3; u += st.fin) fbox(kit, f, u - 0.07, u + 0.07, from, c.roofY, 0, 0.28, 'sk_stone', { tint: trim, top: false, bottom: false });
      // spandrel lips under each band
      for (const ly of c.levels) { const y0 = ly + rs; if (y0 > from + 0.1 && y0 + rh < c.roofY) fbox(kit, f, u0, u1, y0 - 0.14, y0, 0, 0.12, 'sk_stone', { tint: trim, top: false, ends: false }); }
    }
  }
  // ---- belts / string courses
  const beltYs = st.belts === 'floor' ? c.levels.slice(1) : st.belts === 'ground' && !c.tier ? [c.base + c.gh] : [];
  for (const by of beltYs) for (const [u0, u1, from] of spans) if (by > from + 0.2 && by < c.roofY - 0.5) fbox(kit, f, u0, u1, by - 0.2, by, 0, 0.07, 'sk_stone', { tint: trim, top: false, ends: false });
  // ---- pilasters (office)
  if (st.pilasters && spec.win !== false && !c.tier) {
    const m = 1.1, nb = Math.max(1, Math.floor((f.L - 2 * m) / st.bay)), sp = (f.L - 2 * m) / nb;
    for (let b = 0; b <= nb; b += 1) {
      const u = m + sp * b, from = fromAt(u);
      if (from < c.roofY - 1) fbox(kit, f, u - 0.28, u + 0.28, from, c.roofY - 0.9, 0, 0.12, 'sk_stone', { tint: trim, top: false, bottom: false });
    }
  }
  // ---- grime: streaks running down from the cornice / parapet
  for (const [u0, u1, from] of spans) {
    for (let i = 0, n = Math.round((u1 - u0) / 3.2); i < n; i++) {
      const len = kit.rnd(2, 7), y = c.roofY - (st.cornice ? st.cornice[0] : 0.2);
      if (y - len < from) continue;
      streak(kit, f, kit.rnd(u0 + 0.4, u1 - 0.4), y, len, kit.rnd(0.4, 1.2), 0.016);
    }
  }
  // ---- projecting blade sign [world coord along the face, y0, height, word]
  if (spec.blade && !c.tier) bladeSign(kit, f, f.U(spec.blade[0]), spec.blade[1], spec.blade[2], spec.blade[3]);
  // ---- ghost sign / painted wall ad
  if (ghost && !c.tier) ghostSign(kit, f, ghost);
  // ---- cornice + frieze + coping (visible underside, no top: never seen from below)
  if (minFrom < c.roofY) {
    const ext = st.cornice ? st.cornice[1] : 0.06;
    if (st.cornice) {
      const [ch, cd] = st.cornice;
      fbox(kit, f, -cd, f.L + cd, c.roofY - ch, c.roofY - ch * 0.35, 0, cd * 0.55, 'sk_stone', { tint: shade(trim, 0.95), top: false });
      fbox(kit, f, -cd, f.L + cd, c.roofY - ch * 0.35, c.roofY, 0, cd, 'sk_stone', { tint: trim, top: false });
      if (st.frieze) fbox(kit, f, 0, f.L, c.roofY - ch - 0.55, c.roofY - ch, 0, 0.05, 'sk_stone', { tint: shade(trim, 0.88), top: false, ends: false });
    }
    fbox(kit, f, -Math.min(ext, 0.08), f.L + Math.min(ext, 0.08), c.top, c.top + 0.14, -0.05, 0.08, 'sk_stone', { tint: shade(trim, 0.85) });
  }
  // ---- fire escape (black iron landings, rails, stairs) on the visible floors
  if (spec.fe !== undefined) fireEscape(kit, f, f.U(spec.fe), c.levels.filter((ly) => ly > minFrom - 1.0 && ly < c.roofY - 1), c.fh);
}

/** Burning window: emissive opening, scorched surround, soot plume up the wall, baked orange spill on the wall. */
function fireWindow(kit, f, u0, u1, y0, y1) {
  const uc = (u0 + u1) / 2;
  soot(kit, f, u0 - 0.35, u1 + 0.35, y1 - 0.2, 3.2, '#1e1c1a', 0.008);
  kit.face([f.P(u0 - 0.3, y0 - 0.15, 0.007), f.P(u1 + 0.3, y0 - 0.15, 0.007), f.P(u1 + 0.2, y1 + 0.2, 0.007), f.P(u0 - 0.2, y1 + 0.2, 0.007)], 'sk_roof', { tint: '#4a4440' });
  winFill(kit, f, u0, u1, y0, y1, 'fire');
  // charred sash cross in front of the glow, the top rail burnt through
  fq(kit, f, uc - 0.05, uc + 0.05, y0, y1 - 0.25, 0.04, 'sk_roof', { tint: '#2a2622' });
  fq(kit, f, u0, u1 - 0.3, (y0 + y1) / 2 - 0.04, (y0 + y1) / 2 + 0.04, 0.04, 'sk_roof', { tint: '#2a2622' });
  const p = f.P(uc, (y0 + y1) / 2 + 0.3, 1.0);
  kit.light({ pos: p, color: '#ff7a30', intensity: 9, range: 7, radius: 0.5, decay: 1.5, name: 'fire_far' });
}
/** Soot / rain streak above an opening (tapered). */
function soot(kit, f, u0, u1, y, h, tint, off) {
  const w = u1 - u0, uc = (u0 + u1) / 2;
  kit.face([f.P(u0, y, off), f.P(u1, y, off), f.P(uc + w * 0.32, y + h, off), f.P(uc - w * 0.32, y + h, off)], 'sk_roof', { tint });
}

/** Vertical projecting blade sign at u on a face: steel box, letters stacked on both sides, dead bulbs. */
function bladeSign(kit, f, u, y0, h, word, o = {}) {
  const t = 0.24, d0 = 0.35, d1 = 1.55;
  fbox(kit, f, u - t / 2, u + t / 2, y0, y0 + h, d0, d1, 'sk_metal', { tint: o.box || '#3d4f6a' });
  for (const yy of [y0 + 0.5, y0 + h - 0.5]) fbox(kit, f, u - 0.04, u + 0.04, yy, yy + 0.08, 0, d0, 'sk_metal', { tint: '#2e2d2b' });
  const a = f.P(u - t / 2, 0, d0), b = f.P(u + t / 2, 0, d1);
  const r = [Math.min(a[0], b[0]), Math.min(a[2], b[2]), Math.max(a[0], b[0]), Math.max(a[2], b[2])];
  const sides = f.side === 'S' || f.side === 'N' ? ['E', 'W'] : ['S', 'N'];
  const chars = [...word], lh = Math.min(0.85, (h - 0.8) / chars.length / 1.25);
  for (const sd of sides) {
    const g = F(sd, r);
    fq(kit, g, 0.1, g.L - 0.1, y0 + 0.12, y0 + h - 0.12, 0.004, 'sk_stone', { tint: o.panel || '#d9cfb4' });
    chars.forEach((ch, i) => text(kit, g, ch, g.L / 2, y0 + h - 0.45 - (i + 1) * lh * 1.25, lh, 0.008, 'sk_stone', o.ink || '#9c2b22'));
  }
}
/** Rain / soot streak decal hanging down from (u, y) on a face. */
function streak(kit, f, u, y, len, w, off) {
  const v = kit.pick([0, 0.5]);
  kit.face([f.P(u - w / 2, y - len, off), f.P(u + w / 2, y - len, off), f.P(u + w / 2, y, off), f.P(u - w / 2, y, off)], 'decal_streak', { uvs: [[v, 0], [v + 0.5, 0], [v + 0.5, 1], [v, 1]] });
}
/** Black iron fire escape centred at u on the given floor levels. */
function fireEscape(kit, f, uc, levels, fh) {
  const w = 3.4, d = 1.15, iron = '#2e2d2b';
  levels.forEach((ly, i) => {
    fbox(kit, f, uc - w / 2, uc + w / 2, ly - 0.08, ly, 0.05, d, 'sk_metal', { tint: iron, top: false });
    fbox(kit, f, uc - w / 2, uc + w / 2, ly + 0.95, ly + 1.0, d - 0.04, d, 'sk_metal', { tint: iron, top: false });
    fbox(kit, f, uc - w / 2, uc + w / 2, ly + 0.5, ly + 0.53, d - 0.03, d, 'sk_metal', { tint: iron, top: false, bottom: false });
    for (const s of [-w / 2, 0, w / 2]) fbox(kit, f, uc + s - 0.025, uc + s + 0.025, ly, ly + 0.95, d - 0.05, d, 'sk_metal', { tint: iron, top: false, bottom: false });
    for (const s of [-1, 1]) fbox(kit, f, uc + s * (w / 2 - 0.05) - 0.03, uc + s * (w / 2 - 0.05) + 0.03, ly, ly + 0.95, 0.05, d, 'sk_metal', { tint: iron, top: false, bottom: false, ends: true });
    // stair to the next landing (alternating direction)
    if (i < levels.length - 1) {
      const dir = i % 2 ? 1 : -1, a = f.P(uc - dir * (w / 2 - 0.35), ly, d * 0.55), b = f.P(uc + dir * (w / 2 - 0.35), ly + fh, d * 0.55);
      kit.beam(a, b, { kind: 'box', w: 0.6, h: 0.06, mat: 'sk_metal', tint: iron });
    }
  });
}

/**
 * Faded painted wall advert on a blank brick wall. The paint is a plaster-textured layer (the brick albedo is too dark
 * to carry a legible light paint after the bake); the brick shows through where the paint has flaked off.
 */
function ghostSign(kit, f, g) {
  const u0 = Math.min(f.U(g.s0), f.U(g.s1)), u1 = Math.max(f.U(g.s0), f.U(g.s1)), uc = (u0 + u1) / 2;
  const { y0, y1 } = g, mat = 'sk_stone', z = 0.01;
  const D = GHOSTS[g.design];
  fq(kit, f, u0, u1, y0, y1, z, mat, { tint: D.field, grime: { y: y0, h: (y1 - y0) * 0.6, k: 0.25 } });
  const bw = 0.22;
  for (const [a, b, c2, d] of [[u0 + 0.3, u1 - 0.3, y0 + 0.3, y0 + 0.3 + bw], [u0 + 0.3, u1 - 0.3, y1 - 0.3 - bw, y1 - 0.3], [u0 + 0.3, u0 + 0.3 + bw, y0 + 0.3, y1 - 0.3], [u1 - 0.3 - bw, u1 - 0.3, y0 + 0.3, y1 - 0.3]]) fq(kit, f, a, b, c2, d, z + 0.002, 'sk_stone', { tint: D.ink });
  for (const ln of D.lines) {
    const maxW = (u1 - u0) - 1.6;
    let h = ln.h * (y1 - y0);
    if (textW(ln.t, h) > maxW) h = (maxW * 7) / ([...ln.t].length * 6 - 1);
    text(kit, f, ln.t, uc, y0 + ln.y * (y1 - y0), h, z + 0.004, 'sk_stone', ln.ink || D.ink);
  }
  // weathering: blotches where the paint has gone, rain streaks through it
  for (let i = 0; i < 9; i++) {
    const a = kit.rnd(u0, u1 - 1.2), b = a + kit.rnd(0.6, 2.4), c0 = kit.rnd(y0, y1 - 0.8), c1 = c0 + kit.rnd(0.4, 1.6);
    fq(kit, f, a, Math.min(b, u1), c0, Math.min(c1, y1), z + 0.006, 'sk_brick', { tint: kit.pick(['#c4ab9b', '#b39888', '#cdb5a4']) });
  }
  for (let i = 0; i < 7; i++) { const a = kit.rnd(u0, u1 - 0.3); soot(kit, f, a, a + kit.rnd(0.15, 0.4), y1 - kit.rnd(2.5, 5), kit.rnd(2, 5), '#3a3532', z + 0.008); }
}
const GHOSTS = {
  cola: { field: '#a8463a', ink: '#f2e8d0', lines: [{ t: 'DRINK', y: 0.79, h: 0.09 }, { t: 'FIZZ', y: 0.47, h: 0.28 }, { t: 'COLA', y: 0.15, h: 0.28 }] },
  kessler: { field: '#55654f', ink: '#ece3cb', lines: [{ t: 'KESSLER BROS.', y: 0.55, h: 0.3 }, { t: 'FURNITURE STORAGE', y: 0.16, h: 0.2 }] },
};

// ---------------------------------------------------------------------------------------------------- roof clutter
function roofItem(kit, item, y, r, B) {
  const [kind, x, z, ...a] = item;
  if (kind === 'tank') waterTank(kit, x, z, y, a[0] ?? 1.9, a[1] ?? 3.4);
  else if (kind === 'ac') acUnit(kit, x, z, y, a[0] ?? 0);
  else if (kind === 'pent') kit.box({ x, y, z, w: a[0] ?? 4, h: a[2] ?? 3, d: a[1] ?? 3.5, mat: ST[B.st].wall, tint: shade(B.tint || ST[B.st].tint, 0.9), faces: { bottom: false } });
  else if (kind === 'ant') antenna(kit, x, z, y, a[0] ?? 8);
  else if (kind === 'chim') kit.box({ x, y, z, w: a[0] ?? 0.9, h: a[1] ?? 2.2, d: a[0] ?? 0.9, mat: 'sk_brick', tint: '#8a7468', faces: { bottom: false } });
  else if (kind === 'board') billboard(kit, x, z, y, a[0], a[1], a[2], a[3], a[4] ?? 2.4);
  void r;
}
/** Downtown wooden water tank on a steel stand: legs, platform, staved tank, conical roof, hoops. */
function waterTank(kit, x, z, y, r, h) {
  const legH = 2.6, steel = '#4a4641';
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) kit.box({ x: x + sx * r * 0.62, y, z: z + sz * r * 0.62, w: 0.22, h: legH, d: 0.22, mat: 'sk_metal', tint: steel, faces: { bottom: false, top: false } });
  kit.beam([x - r * 0.62, y + 1.2, z - r * 0.62], [x + r * 0.62, y + 1.9, z + r * 0.62], { kind: 'box', w: 0.06, h: 0.06, mat: 'sk_metal', tint: steel });
  kit.beam([x + r * 0.62, y + 1.2, z - r * 0.62], [x - r * 0.62, y + 1.9, z + r * 0.62], { kind: 'box', w: 0.06, h: 0.06, mat: 'sk_metal', tint: steel });
  kit.box({ x, y: y + legH, z, w: r * 1.7, h: 0.14, d: r * 1.7, mat: 'sk_metal', tint: '#57524c', faces: { top: false } });
  const wood = kit.pick(['#8c765f', '#7d6a56', '#96806a']);
  kit.cyl({ x, y: y + legH + 0.14, z, r, h, seg: 12, mat: 'sk_wood', tint: wood, top: false });
  kit.cyl({ x, y: y + legH + 0.14 + h, z, r: r + 0.1, r2: 0.12, h: r * 0.62, seg: 12, mat: 'sk_wood', tint: shade(wood, 0.75), top: false });
  for (let i = 0; i < 3; i++) kit.cyl({ x, y: y + legH + 0.5 + i * (h - 0.6) / 2, z, r: r + 0.025, h: 0.07, seg: 12, mat: 'sk_metal', tint: '#3a3632', top: false });
  kit.colBox({ x, y, z, w: r * 1.8, h: legH + h + r * 0.62, d: r * 1.8 }, 'wood');
}
function acUnit(kit, x, z, y, rot) {
  kit.at({ x, y, z, rot }, () => {
    kit.box({ x: 0, y: 0, z: 0, w: 2.0, h: 1.15, d: 1.4, mat: 'sk_metal', tint: kit.pick(['#9a9b96', '#8a8a84', '#a7a49a']), faces: { bottom: false } });
    kit.cyl({ x: 0.45, y: 1.15, z: 0, r: 0.42, h: 0.06, seg: 8, mat: 'sk_metal', tint: '#3c3c3a' });
    kit.box({ x: -0.6, y: 1.15, z: 0, w: 0.5, h: 0.5, d: 0.5, mat: 'sk_metal', tint: '#6e6e6a', faces: { bottom: false } });
  });
}
function antenna(kit, x, z, y, h) {
  kit.box({ x, y, z, w: 0.12, h, d: 0.12, mat: 'sk_metal', tint: '#4a4a48', faces: { bottom: false } });
  for (const [yy, w] of [[h * 0.55, 2.2], [h * 0.75, 1.6], [h * 0.92, 1.0]]) kit.box({ x, y: y + yy, z, w, h: 0.06, d: 0.06, mat: 'sk_metal', tint: '#4a4a48' });
  kit.box({ x, y, z, w: 0.7, h: 0.3, d: 0.7, mat: 'sk_metal', tint: '#5a5a56', faces: { bottom: false } });
}
/**
 * Rooftop billboard on a steel frame: centre (x, z) on the roof at y, facing 'S'|'N'|'E'|'W', w x h panel
 * raised `elev` above the roof; design key of BOARDS. Catwalk, posts, raking braces, torn paper.
 */
function billboard(kit, x, z, y, facing, w, h, design, elev) {
  const r = facing === 'S' || facing === 'N' ? [x - w / 2, z - 0.12, x + w / 2, z + 0.12] : [x - 0.12, z - w / 2, x + 0.12, z + w / 2];
  const f = F(facing, r), y0 = y + elev, steel = '#3d3b38';
  // panel back plate + edge frame
  fbox(kit, f, 0, w, y0, y0 + h, -0.24, 0, 'sk_metal', { tint: steel });
  // posts and raking braces behind
  for (const u of [w * 0.12, w * 0.5, w * 0.88]) {
    fbox(kit, f, u - 0.11, u + 0.11, y, y0 + h - 0.2, -0.55, -0.33, 'sk_metal', { tint: steel, bottom: false });
    kit.beam(f.P(u, y, -2.6), f.P(u, y0 + h * 0.75, -0.45), { kind: 'box', w: 0.12, h: 0.12, mat: 'sk_metal', tint: steel });
  }
  for (const yy of [y0 + 0.4, y0 + h - 0.5]) fbox(kit, f, 0.2, w - 0.2, yy, yy + 0.12, -0.45, -0.25, 'sk_metal', { tint: steel, top: false });
  // catwalk + lamp arms
  fbox(kit, f, 0, w, y0 - 0.12, y0 - 0.05, 0, 0.75, 'sk_metal', { tint: steel });
  fbox(kit, f, 0, w, y0 + 0.9, y0 + 0.95, 0.72, 0.76, 'sk_metal', { tint: steel, top: false });
  for (const u of [w * 0.2, w * 0.5, w * 0.8]) kit.beam(f.P(u, y0 - 0.05, 0.7), f.P(u, y0 - 0.45, 1.3), { kind: 'box', w: 0.05, h: 0.05, mat: 'sk_metal', tint: steel });
  // printed face
  const D = BOARDS[design], zf = 0.012, mat = 'sk_stone';
  fq(kit, f, 0.08, w - 0.08, y0 + 0.08, y0 + h - 0.08, zf, mat, { tint: D.field });
  D.draw?.(kit, f, w, y0, h, zf + 0.003);
  for (const ln of D.lines) {
    let lh = ln.h * h; const maxW = w * 0.86;
    if (textW(ln.t, lh) > maxW) lh = (maxW * 7) / ([...ln.t].length * 6 - 1);
    text(kit, f, ln.t, w * (ln.x ?? 0.5), y0 + ln.y * h, lh, zf + 0.006, mat, ln.ink || D.ink);
  }
  // torn / peeled paper: bare board and older layers showing through
  for (let i = 0; i < 4; i++) {
    const a = kit.rnd(0.2, w - 2.0), b = a + kit.rnd(0.6, 2.2), c0 = y0 + kit.rnd(0.15, h - 1.2), c1 = c0 + kit.rnd(0.4, 1.3);
    fq(kit, f, a, Math.min(b, w - 0.1), c0, Math.min(c1, y0 + h - 0.1), zf + 0.009, mat, { tint: kit.pick(['#b8b0a0', '#8f8a7e', '#6f6a62', '#c9bfa6']) });
  }
  for (let i = 0; i < 4; i++) { const a = kit.rnd(0.2, w - 0.6); soot(kit, f, a, a + kit.rnd(0.12, 0.3), y0 + h - 0.1 - kit.rnd(1.2, 2.5), kit.rnd(1.0, 2.4), '#47423c', zf + 0.011); }
}
const BOARDS = {
  cola: {
    field: '#9b2d24', ink: '#efe6cf',
    lines: [{ t: 'FIZZ COLA', y: 0.42, h: 0.34 }, { t: 'ICE COLD', y: 0.1, h: 0.15, ink: '#9b2d24' }],
    draw: (kit, f, w, y0, h, z) => {
      // cream swash band across the lower third
      kit.face([f.P(0.1, y0 + h * 0.05, z), f.P(w - 0.1, y0 + h * 0.13, z), f.P(w - 0.1, y0 + h * 0.36, z), f.P(0.1, y0 + h * 0.3, z)], 'sk_stone', { tint: '#e9dfc6' });
    },
  },
  movie: {
    field: '#7b6a4c', ink: '#ece2c8',
    lines: [{ t: 'NIGHT EXPRESS', y: 0.66, h: 0.2 }, { t: 'NOW SHOWING', y: 0.08, h: 0.11 }],
    draw: (kit, f, w, y0, h, z) => {
      kit.face([f.P(w * 0.1, y0 + h * 0.22, z), f.P(w * 0.22, y0 + h * 0.22, z), f.P(w * 0.2, y0 + h * 0.6, z), f.P(w * 0.13, y0 + h * 0.6, z)], 'sk_stone', { tint: '#2e2822' });
      kit.face([f.P(w * 0.78, y0 + h * 0.22, z), f.P(w * 0.9, y0 + h * 0.22, z), f.P(w * 0.88, y0 + h * 0.58, z), f.P(w * 0.8, y0 + h * 0.58, z)], 'sk_stone', { tint: '#3a2e26' });
      kit.face([f.P(w * 0.3, y0 + h * 0.24, z), f.P(w * 0.7, y0 + h * 0.24, z), f.P(w * 0.7, y0 + h * 0.56, z), f.P(w * 0.3, y0 + h * 0.56, z)], 'sk_stone', { tint: '#a3462e' });
    },
  },
  evac: {
    field: '#d8d3c6', ink: '#a52a20',
    lines: [{ t: 'EVACUATE', y: 0.45, h: 0.38 }, { t: 'BY ORDER CIVIL DEFENSE', y: 0.12, h: 0.13, ink: '#2a2826' }],
  },
  tires: {
    field: '#2b3b56', ink: '#eae2cb',
    lines: [{ t: 'BLUE STAR', y: 0.52, h: 0.3, x: 0.58 }, { t: 'TIRES', y: 0.14, h: 0.26, x: 0.58 }],
    draw: (kit, f, w, y0, h, z) => {
      const cx = w * 0.14, cy = y0 + h * 0.5, R = h * 0.36, pts = [];
      for (let i = 0; i < 10; i++) { const a = PI / 2 + (i * PI) / 5, rr = i % 2 ? R * 0.42 : R; pts.push(f.P(cx - Math.cos(a) * rr, cy + Math.sin(a) * rr, z)); }
      kit.face(pts, 'sk_stone', { tint: '#e2b43c' });
    },
  },
};

// ---------------------------------------------------------------------------------------------------- the blocks
// Neighbour roof lines (y incl. parapet) that hide the lower part of the faces, from the other zones' builders:
const H = {
  W_MASS6: 22.43, W_MASS5: 19.03, W_MASS7: 25.83, W_MASS8: 29.23, WX_END: 19.03, END_W: 13.23,
  N_W3: 30.13, N_W2: 19.03, N_E3: 22.53, AL_END: 11.13, N_E2: 15.63, BEYOND_W: 26.43, BEYOND_E: 31.43,
  F_N1: 29.33, F_N3: 20.93, F_N2: 19.03, F_N4: 25.93, F_S1: 17.73, F_S3: 19.03, F_S4: 21.03,
  X_E1: 20.53, X_E2: 22.53, X_E3: 19.13,
  // south zone: S_W3 / S_E3 / X_S1 / X_S2 street blocks, END_W / END_E thin pocket end walls (x -+37.6..37.97, 18.2 m),
  // F_SW / F_SE back blocks (z 72..84, 22.5 m), F_END the HOTEL BELMONT closing the lane (z 76..84, 26.1 m)
  S_W3: 15.63, S_E3: 19.03, X_S1: 22.53, X_S2: 19.13, S_END: 18.0, S_FILL: 22.53, F_END: 26.13,
  OVER_BRIDGE: 7.0,
};

function northBlocks(kit) {
  // ---- BD_NW south row (z -62..-40): behind the west zone's north masses and the north avenue's west blocks
  bld(kit, {
    id: 'NW1', r: [-40, -62, -26, -40], st: 'office', n: 9, par: 1.0,
    faces: { S: { spans: [[-40, -26, H.W_MASS6]] }, E: { spans: [[-62, -50, H.N_W3], [-50, -40, H.N_W2]] } },
    tiers: [{ n: 1, inset: { S: 3, E: 3 } }],
    roof: [['ac', -36, -56, 0], ['ant', -37.5, -48, 9], ['pent', -35, -52, 3.6, 3.2, 2.6]],
  });
  bld(kit, {
    id: 'NW2', r: [-62, -62, -40, -40], st: 'brick', n: 7,
    faces: { S: { spans: [[-62, -40, H.WX_END]], fe: -58.4 } },
    roof: [['tank', -45, -55, 2.0, 3.6], ['board', -51, -45.5, 'S', 11, 4.2, 'cola'], ['ac', -58, -52, PI / 2], ['chim', -61, -60]],
  });
  bld(kit, {
    id: 'NW3', r: [-84, -62, -62, -40], st: 'stucco', n: 7,
    faces: { S: { spans: [[-84, -66, H.W_MASS6], [-66, -62, H.WX_END]] } },
    roof: [['tank', -70, -50, 1.7, 3.0], ['pent', -78, -55, 4.0, 3.2, 2.8], ['ac', -66, -46, 0]],
  });
  // ---- north row + north ring (z -128..-74): framed by the bridge from the avenue
  bld(kit, { id: 'NN1', r: [-84, -100, -56, -74], st: 'brickDk', n: 7, faces: { S: { spans: [[-84, -56, 20]] } }, roof: [['tank', -70, -88, 1.8, 3.2]] });
  bld(kit, { id: 'NN2', r: [-56, -100, -26, -74], st: 'brickBr', n: 8, faces: { S: { spans: [[-56, -26, 24]] } }, roof: [['pent', -40, -90, 4.5, 3.5, 3.0], ['ac', -32, -84, 0]] });
  bld(kit, {
    id: 'NN3', r: [-26, -104, -5, -80], st: 'office', n: 9, par: 1.0,
    faces: { S: { spans: [[-26, -9, H.BEYOND_W], [-9, -5, H.OVER_BRIDGE]] }, E: { spans: [[-104, -80, H.OVER_BRIDGE]] } },
    tiers: [{ n: 1, inset: { S: 2.5, E: 2.5 } }],
    roof: [['board', -16.5, -86.5, 'S', 12, 4.8, 'movie', 2.2], ['ac', -12, -96, 0], ['ant', -22, -98, 7]],
  });
  bld(kit, {
    id: 'NN4', r: [5, -104, 26, -80], st: 'stone', n: 10, par: 1.2,
    faces: { S: { spans: [[5, 9, H.OVER_BRIDGE], [9, 26, H.BEYOND_E]], blade: [7.0, 9.5, 13.5, 'HOTEL'] }, W: { spans: [[-104, -80, H.OVER_BRIDGE]] } },
    tiers: [{ n: 2, inset: { S: 2.2, W: 2.2 } }],
    roof: [['tank', 18, -96, 2.1, 3.8], ['ant', 12, -90, 10]],
  });
  bld(kit, {
    id: 'NN7', r: [-12, -128, 12, -104], st: 'brickDk', n: 12,
    faces: { S: { spans: [[-12, 12, 9]], fe: 0 } },
    roof: [['tank', -6, -116, 2.2, 4.0], ['tank', 5, -120, 1.8, 3.2], ['ant', 8, -110, 12]],
  });
  bld(kit, { id: 'NN5', r: [26, -100, 56, -74], st: 'cream', n: 7, faces: { S: { spans: [[26, 56, 22]] } }, roof: [['ac', 40, -86, 0], ['pent', 50, -92, 4, 3, 2.8]] });
  bld(kit, { id: 'NN6', r: [56, -100, 84, -74], st: 'brickBr', n: 8, faces: { S: { spans: [[56, 84, 24]] } }, roof: [['tank', 70, -88, 1.9, 3.4]] });
  // ---- BD_NE south row (z -62..-40)
  bld(kit, {
    id: 'NE1', r: [26, -62, 44, -40], st: 'brickBr', n: 8,
    faces: { W: { spans: [[-62, -53, H.N_E3], [-53, -50, H.AL_END], [-50, -40, H.N_E2]] }, S: { spans: [[26, 40, H.F_N1], [40, 44, H.F_N3]] } },
    roof: [['tank', 34, -52, 1.9, 3.4], ['ac', 40, -58, 0]],
  });
  bld(kit, {
    id: 'NE2', r: [44, -62, 64, -40], st: 'brickDk', n: 9,
    // LB_FIRES_FAR: two upper windows burning (floors 6 / 7 over x 55-59), seen from the EX junction and the fort
    faces: { S: { spans: [[44, 52, H.F_N3], [52, 64, H.F_N2]], fire: [[6, 3], [7, 4]], fe: 47.6 } },
    roof: [['board', 54.5, -45.5, 'S', 12, 4.6, 'evac'], ['tank', 60, -57, 2.0, 3.6], ['chim', 46, -60]],
  });
  bld(kit, {
    id: 'NE3', r: [64, -62, 84, -40], st: 'office', n: 8,
    faces: { S: { spans: [[64, 66, H.F_N2], [66, 84, H.F_N4]] } },
    tiers: [{ n: 2, inset: { S: 3, W: 3 } }],
    roof: [['ac', 76, -54, 0], ['ant', 80, -58, 8]],
  });
}

function southBlocks(kit) {
  // ---- BD_SW (x -84..-38, z 40..84)
  bld(kit, {
    id: 'SW1', r: [-56, 40, -38, 64], st: 'brick', n: 8,
    faces: {
      N: { spans: [[-56, -54, H.WX_END], [-54, -40, H.W_MASS7], [-40, -38, H.W_MASS6]] },
      E: { spans: [[40, 48, H.S_W3], [48, 58, H.S_END], [58, 64, H.X_S1]], fe: 53 },
    },
    roof: [['tank', -46, 52, 1.9, 3.4], ['ac', -50, 58, 0]],
  });
  bld(kit, {
    id: 'SW2', r: [-84, 40, -56, 62], st: 'cream', n: 7,
    faces: { N: { spans: [[-84, -66, H.W_MASS8], [-66, -56, H.WX_END]] } },
    roof: [['board', -62, 45.5, 'N', 10, 4.0, 'tires'], ['tank', -74, 52, 1.8, 3.2]],
  });
  bld(kit, { id: 'SW3', r: [-60, 64, -38, 84], st: 'stucco', n: 8, faces: { E: { spans: [[64, 72, H.X_S1], [72, 84, H.S_FILL]] } }, roof: [['ac', -48, 72, 0], ['pent', -54, 78, 4, 3, 2.6], ['tank', -44, 79, 1.7, 3.0]] });
  // ---- BD_SE (x 38..84, z 40..84)
  bld(kit, {
    id: 'SE1', r: [38, 40, 58, 64], st: 'brickBr', n: 8,
    faces: {
      W: { spans: [[40, 48, H.S_E3], [48, 58, H.S_END], [58, 64, H.X_S2]], fe: 53 },
      N: { spans: [[38, 52, H.F_S1], [52, 58, H.F_S3]] },
    },
    roof: [['tank', 48, 54, 2.0, 3.6], ['ac', 42, 60, 0]],
  });
  bld(kit, {
    id: 'SE2', r: [58, 40, 84, 62], st: 'office', n: 8,
    faces: { N: { spans: [[58, 66, H.F_S3], [66, 84, H.F_S4]] } },
    tiers: [{ n: 1, inset: { N: 3, W: 3 } }],
    roof: [['board', 72, 46.5, 'N', 12, 4.6, 'cola'], ['ac', 66, 56, 0]],
  });
  bld(kit, { id: 'SE3', r: [38, 64, 60, 84], st: 'cream', n: 8, faces: { W: { spans: [[64, 72, H.X_S2], [72, 84, H.S_FILL]] } }, roof: [['ac', 48, 74, 0], ['tank', 54, 78, 1.7, 3.0]] });
  // ---- south ring (z 84..130): framed by the south lane
  bld(kit, {
    id: 'SS1', r: [-30, 84, -4, 108], st: 'brick', n: 9,
    faces: { N: { spans: [[-30, -8, H.S_FILL], [-8, -4, H.F_END]] }, E: { spans: [[84, 108, H.F_END]] } },
    roof: [['tank', -20, 96, 2.0, 3.6], ['ac', -12, 102, 0]],
  });
  bld(kit, {
    id: 'SS2', r: [4, 84, 30, 108], st: 'stone', n: 10, par: 1.2,
    faces: { N: { spans: [[4, 8, H.F_END], [8, 30, H.S_FILL]] }, W: { spans: [[84, 108, H.F_END]] } },
    roof: [['board', 17, 90.5, 'N', 12, 4.6, 'movie'], ['ac', 24, 100, 0]],
  });
  bld(kit, { id: 'SS3', r: [-14, 108, 14, 130], st: 'grid60', n: 12, par: 1.2, faces: { N: { spans: [[-14, 14, 24]] } }, roof: [['pent', 0, 118, 9, 6, 4], ['ant', 6, 116, 10]] });
}

function westRing(kit) {
  // WR1: the backdrop straight down West Street, over the LED gantry: a blank party wall with a faded FIZZ COLA ad
  bld(kit, {
    id: 'WR1', r: [-102, -14, -84, 12], st: 'brick', n: 9, par: 1.2, tint: '#b99f8f',
    faces: { E: { spans: [[-14, -9, H.W_MASS6], [-9, 9, H.END_W], [9, 12, H.W_MASS8]], win: false, ghost: { s0: -8.6, s1: 8.6, y0: 19.6, y1: 29.6, design: 'cola' } } },
    roof: [['tank', -93, 5, 2.1, 3.8], ['chim', -88, -10], ['ac', -96, -6, 0]],
  });
  // WR1b: 1960s grid office tower right behind it (reference: the tall grid block over the LED sign)
  bld(kit, {
    id: 'WR1b', r: [-124, -22, -104, 0], st: 'grid60', n: 13, par: 1.2,
    faces: { E: { spans: [[-22, 0, 22]] }, S: { spans: [[-124, -104, 22]] } },
    roof: [['pent', -114, -12, 10, 8, 4.2], ['ant', -110, -6, 14]],
  });
  bld(kit, {
    id: 'WR3', r: [-102, -50, -84, -16], st: 'stone', n: 8, par: 1.1,
    faces: { E: { spans: [[-50, -40, 25.9], [-40, -16, H.W_MASS6]] } },
    roof: [['ac', -92, -30, 0], ['tank', -95, -42, 1.8, 3.2]],
  });
}

function eastRing(kit) {
  // ER1: over the NORTHERN MOVING & STORAGE depot (X_E1): brick loft with a painted KESSLER BROS. sign and a big tank
  bld(kit, {
    id: 'ER1', r: [84, -14, 104, 14], st: 'brickBr', n: 9, par: 1.2,
    faces: { W: { spans: [[-14, -12, H.X_E2], [-12, 12, H.X_E1], [12, 14, H.X_E3]], ghost: { s0: 10.5, s1: -10.5, y0: 24.9, y1: 29.9, design: 'kessler' } } },
    roof: [['tank', 96, -6, 2.4, 4.2], ['ac', 92, 8, 0], ['chim', 101, 10]],
  });
  bld(kit, {
    id: 'ER4', r: [106, -10, 126, 10], st: 'grid60', n: 12, par: 1.2,
    faces: { W: { spans: [[-10, 10, 24]] } },
    roof: [['pent', 116, 0, 8, 10, 4], ['ant', 114, 4, 12]],
  });
  bld(kit, {
    id: 'ER2', r: [84, -46, 104, -16], st: 'office', n: 10,
    faces: { W: { spans: [[-46, -40, 26], [-40, -34, H.F_N4], [-34, -16, H.X_E2]] }, S: { spans: [[84, 104, 24]] } },
    tiers: [{ n: 2, inset: { W: 3, S: 3 } }],
    roof: [['ac', 94, -30, 0], ['ant', 98, -36, 9]],
  });
  bld(kit, {
    id: 'ER3', r: [84, 16, 104, 46], st: 'brick', n: 8,
    faces: { W: { spans: [[16, 34, H.X_E3], [34, 40, H.F_S4], [40, 46, 22]] }, N: { spans: [[84, 104, 24]] } },
    roof: [['board', 90, 31, 'W', 11, 4.2, 'tires'], ['tank', 96, 40, 1.9, 3.4]],
  });
}

// ---------------------------------------------------------------------------------------------------- BD_RAIL
// The viaduct carries on from LM_BRIDGE (north zone, x -26..26): green-grey riveted plate girders on stone piers,
// ballast deck at 6.6 m, two tracks (rails at z -66.2 / -69.8 +-0.72), catenary masts with the contact wires.
function rail(kit, x0, x1) {
  const zS = -62, zN = -74, yU = 5.2, yD = 6.6, yP = 7.8, GIRDER = '#7f8e80', STONE = '#cfc8ba';
  const r = [x0, zN, x1, zS];
  const fS = F('S', r), fN = F('N', r), L = x1 - x0;
  const out = x0 < 0 ? -1 : 1; // direction away from the bridge
  for (const f of [fS, fN]) {
    // stone piers every 13 m with spans of plate girder between; the space under the deck is closed (block backs)
    fq(kit, f, 0, L, 0, yU + 0.15, -0.6, 'sk_stone', { tint: shade(STONE, 0.8), grime: { y: 0, h: 2.5, k: 0.4 } });
    fq(kit, f, 0, L, yU + 0.15, yP - 0.18, -0.12, 'sk_metal', { tint: GIRDER });
    fbox(kit, f, 0, L, yP - 0.18, yP, -0.24, 0.02, 'sk_metal', { tint: shade(GIRDER, 0.92) });
    fbox(kit, f, 0, L, yU, yU + 0.15, -0.27, 0.02, 'sk_metal', { tint: shade(GIRDER, 0.88), top: false });
    for (let u = 0.6; u < L - 0.3; u += 2.9) fbox(kit, f, u - 0.08, u + 0.08, yU + 0.15, yP - 0.18, -0.12, -0.02, 'sk_metal', { tint: shade(GIRDER, 1.05), top: false, bottom: false });
    for (let u = 6.5; u < L - 1; u += 13) fbox(kit, f, u - 1.0, u + 1.0, 0, yU, -0.6, -0.1, 'sk_stone', { tint: STONE, top: false, grime: { y: 0, h: 2.2, k: 0.45 } });
    // rust streaks on the web
    for (let i = 0; i < Math.round(L / 4); i++) { const u = kit.rnd(0.5, L - 0.8); soot(kit, f, u, u + kit.rnd(0.15, 0.4), yP - 0.2 - kit.rnd(0.8, 1.8), kit.rnd(0.6, 1.4), '#7a5a40', -0.115); }
  }
  // deck (ballast), rails
  kit.face([[x0, yD, zS + 0.5], [x1, yD, zS + 0.5], [x1, yD, zN + 0.5], [x0, yD, zN + 0.5]].map((p) => p), 'sk_stone', { tint: '#8f8a80' });
  for (const zc of [-66.2, -69.8]) for (const dz of [-0.72, 0.72]) kit.box({ x: (x0 + x1) / 2, y: yD, z: zc + dz, w: L, h: 0.16, d: 0.07, mat: 'sk_metal', tint: '#4d4741', faces: { bottom: false, px: false, nx: false } });
  // catenary masts (box section) every 18 m from the bridge end, cross beams, contact + messenger wires
  for (let k = 1; k * 18 - 16 < L; k++) {
    const x = (out < 0 ? x1 : x0) + out * (k * 18 - 16);
    for (const z of [-62.9, -73.1]) kit.beam([x, yD, z], [x, 13.6, z], { kind: 'box', h: 0.26, w: 0.2, mat: 'sk_metal', tint: '#4b514c', up: [0, 0, 1] });
    kit.beam([x, 13.2, -62.7], [x, 13.2, -73.3], { kind: 'box', h: 0.3, w: 0.18, mat: 'sk_metal', tint: '#4b514c' });
  }
  const xa = out < 0 ? x1 : x0, xb = out < 0 ? x0 : x1;
  for (const [y, z] of [[12.3, -69.8], [12.95, -69.8], [12.3, -66.2]]) kit.beam([xa, y, z], [xb, y - 0.15, z], { kind: 'box', w: 0.025, h: 0.025, mat: 'sk_metal', tint: '#1c1c1c' });
  // collision: solid embankment + parapets (the deck never joins the nav grid: see build())
  kit.colBox({ x: (x0 + x1) / 2, y: 0, z: (zS + zN) / 2, w: L, h: yD, d: zS - zN }, 'concrete');
  kit.colBox({ x: (x0 + x1) / 2, y: yD, z: zS - 0.25, w: L, h: yP - yD, d: 0.5 }, 'metal');
  kit.colBox({ x: (x0 + x1) / 2, y: yD, z: zN + 0.25, w: L, h: yP - yD, d: 0.5 }, 'metal');
}

// ---------------------------------------------------------------------------------------------------- BD_SKYLINE
// Town extent used to keep only the tower faces that look into the town (bounds of the playable area).
const TOWN = [-76, -76, 68, 76];
function towerBox(kit, cx, cz, w, d, y0, y1, mat, tint, o = {}) {
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  const faces = { bottom: false, top: o.top ? undefined : false };
  if (!(x1 < TOWN[2])) faces.px = false;
  if (!(x0 > TOWN[0])) faces.nx = false;
  if (!(z1 < TOWN[3])) faces.pz = false;
  if (!(z0 > TOWN[1])) faces.nz = false;
  kit.box({ x: cx, y: y0, z: cz, w, h: y1 - y0, d, mat, tint, faces, grime: o.grime });
}
/** Visible faces of a tower box as frames (for windows / fire / signs). */
function towerFaces(cx, cz, w, d) {
  const r = [cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2], out = [];
  if (r[2] < TOWN[2]) out.push(F('E', r));
  if (r[0] > TOWN[0]) out.push(F('W', r));
  if (r[3] < TOWN[3]) out.push(F('S', r));
  if (r[1] > TOWN[1]) out.push(F('N', r));
  return out;
}
function litSpecks(kit, cx, cz, w, d, y0, y1, n, fl = 3.6) {
  const faces = towerFaces(cx, cz, w, d);
  for (let i = 0; i < n; i++) {
    const f = kit.pick(faces), u = kit.rnd(1.5, f.L - 3.5), y = y0 + 4 + Math.floor(kit.rnd(0, (y1 - y0 - 8) / fl)) * fl;
    pane(kit, f, u, u + kit.rnd(1.4, 3.2), y, y + 1.5, 0.05, 'sk_glow', '#4a3a28', 1);
  }
}
// Mid ring (110-150 m): plain hazy blocks that close the gaps between the outer ring and the far towers.
const MID = [[-45, -138, 30, 20, 48], [35, -130, 26, 22, 54], [78, -122, 24, 24, 40], [136, -70, 22, 30, 46], [128, -36, 22, 26, 52],
  [136, 46, 24, 30, 42], [80, 112, 30, 24, 44], [36, 142, 28, 22, 50], [-52, 132, 30, 26, 46], [-116, 78, 26, 30, 48],
  [-142, 22, 24, 30, 44], [-128, -62, 26, 26, 54], [-88, -118, 26, 24, 46], [-158, -92, 30, 24, 38]];
function midRing(kit) {
  MID.forEach(([x, z, w, d, h], i) => {
    const tint = ['#5d5850', '#55534e', '#625b52', '#4e4f50'][i % 4];
    towerBox(kit, x, z, w, d, 0, h, 'sk_far', tint);
    for (const f of towerFaces(x, z, w, d)) {
      for (let y = 7.4; y < h - 1.5; y += 3.4) fbox(kit, f, 0.6, f.L - 0.6, y, y + 1.6, -0.02, 0.04, 'sk_far', { tint: shade(tint, 0.62), top: false, ends: false });
      fbox(kit, f, -0.4, f.L + 0.4, h - 1.0, h, 0, 0.5, 'sk_far', { tint: shade(tint, 1.25), top: false });
    }
    if (i % 3 === 0) waterTankFar(kit, x + w * 0.2, z - d * 0.15, h, 2.4);
    if (i % 3 === 1) towerBox(kit, x - w * 0.15, z, w * 0.35, d * 0.35, h, h + 4.5, 'sk_far', shade(tint, 0.85));
    if (i % 4 === 2) kit.box({ x: x + w * 0.25, y: h, z, w: 0.3, h: 9, d: 0.3, mat: 'sk_far', tint: '#3a3a3a', faces: { bottom: false } });
    if (i % 2) litSpecks(kit, x, z, w, d, 0, h, 3, 3.4);
  });
}
/** Far water tank silhouette (legs + tank + cone), fog material. */
function waterTankFar(kit, x, z, y, r) {
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) kit.box({ x: x + sx * r * 0.6, y, z: z + sz * r * 0.6, w: 0.3, h: 3, d: 0.3, mat: 'sk_far', tint: '#3c3a37', faces: { bottom: false, top: false } });
  kit.cyl({ x, y: y + 3, z, r, h: 4, seg: 8, mat: 'sk_far', tint: '#4a4540', top: false });
  kit.cyl({ x, y: y + 7, z, r: r + 0.1, r2: 0.1, h: 1.4, seg: 8, mat: 'sk_far', tint: '#3e3a36', top: false });
}
function skyline(kit, L) {
  midRing(kit);
  const towers = L.BACKDROP.find((b) => b.id === 'BD_SKYLINE').towers;
  const FAR = ['#59544c', '#4d4c48', '#5f5a50', '#47484a', '#555149'];
  towers.forEach(([x, z, h, type], i) => {
    const tint = FAR[i % FAR.length];
    if (type === 'gothic_spire') return gothicTower(kit, x, z, h);
    if (type === 'grid_burning') return burningTower(kit, x, z, h);
    if (type === 'grid') {
      // 1960s slab: broad side to the town, mechanical penthouse, mast; a few lit office floors
      const along = Math.abs(z) > Math.abs(x);
      const w = along ? 42 : 18, d = along ? 18 : 42;
      towerBox(kit, x, z, w, d, 0, h, 'sk_far', tint);
      // floor bands (spandrels) catch a little light even through the haze
      for (const f of towerFaces(x, z, w, d)) for (let y = 8; y < h - 2; y += 3.6) fbox(kit, f, 0, f.L, y, y + 0.9, 0, 0.25, 'sk_far', { tint: shade(tint, 1.35), top: false, ends: false });
      towerBox(kit, x, z, w * 0.4, d * 0.4, h, h + 5, 'sk_far', shade(tint, 0.85));
      kit.box({ x: x + w * 0.1, y: h + 5, z, w: 0.6, h: 14, d: 0.6, mat: 'sk_far', tint: '#3c3c3c', faces: { bottom: false } });
      litSpecks(kit, x, z, w, d, 0, h, 7);
      return;
    }
    // 1920s setback tower: four tiers stepping in, a crown and a flag mast
    const W0 = 28 + (i % 3) * 4, D0 = 26 + (i % 2) * 6;
    const tiers = [[0, 0.56, 1], [0.56, 0.74, 0.8], [0.74, 0.88, 0.62], [0.88, 1.0, 0.44]];
    for (const [a, b, s] of tiers) {
      towerBox(kit, x, z, W0 * s, D0 * s, h * a, h * b, 'sk_far', shade(tint, 1 + a * 0.15));
      // a lighter cornice band at each setback
      for (const f of towerFaces(x, z, W0 * s, D0 * s)) fbox(kit, f, -0.5, f.L + 0.5, h * b - 1.4, h * b, 0, 0.6, 'sk_far', { tint: shade(tint, 1.3), top: false });
      // vertical piers on the lowest tier (1920s verticality)
      if (a === 0) for (const f of towerFaces(x, z, W0 * s, D0 * s)) for (let u = 2; u < f.L - 1; u += 4) fbox(kit, f, u - 0.4, u + 0.4, 6, h * b - 1.4, 0, 0.35, 'sk_far', { tint: shade(tint, 1.18), top: false, bottom: false });
    }
    towerBox(kit, x, z, W0 * 0.24, D0 * 0.24, h, h + 6, 'sk_far', shade(tint, 0.9));
    kit.cyl({ x, y: h + 6, z, r: W0 * 0.12, r2: 0.3, h: 7, seg: 4, rot: PI / 4, mat: 'sk_far', tint: shade(tint, 0.95), top: false });
    kit.box({ x, y: h + 12, z, w: 0.4, h: 9, d: 0.4, mat: 'sk_far', tint: '#3a3a3a', faces: { bottom: false } });
    litSpecks(kit, x, z, W0, D0, 0, h * 0.56, 5);
  });
}
/** Signature tower NNW (-70, -190, 140 m): limestone gothic shaft, buttressed crown, pinnacles, gilded spire. */
function gothicTower(kit, x, z, h) {
  const t = '#6a655b';
  const shaft = h * 0.63, crown1 = h * 0.74, crown2 = h * 0.82, lantern = h * 0.86;
  towerBox(kit, x, z, 30, 30, 0, shaft, 'sk_far', t);
  for (const f of towerFaces(x, z, 30, 30)) {
    for (let u = 1.5; u < f.L - 0.5; u += 3.4) fbox(kit, f, u - 0.45, u + 0.45, 8, shaft + 2.5, 0, 0.5, 'sk_far', { tint: shade(t, 1.2), top: false, bottom: false });
    fbox(kit, f, -0.6, f.L + 0.6, shaft - 1.5, shaft, 0, 0.8, 'sk_far', { tint: shade(t, 1.3), top: false });
  }
  towerBox(kit, x, z, 24, 24, shaft, crown1, 'sk_far', shade(t, 1.08));
  towerBox(kit, x, z, 18, 18, crown1, crown2, 'sk_far', shade(t, 1.14));
  // corner buttresses rising into pinnacles at both setbacks
  for (const [s, y0, y1] of [[12, shaft, crown1 + 2], [9, crown1, crown2 + 2]]) {
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const px = x + sx * s, pz = z + sz * s;
      kit.box({ x: px, y: y0, z: pz, w: 1.8, h: y1 - y0, d: 1.8, mat: 'sk_far', tint: shade(t, 1.2), faces: { bottom: false, top: false } });
      kit.cyl({ x: px, y: y1, z: pz, r: 1.2, r2: 0.05, h: 6, seg: 4, rot: PI / 4, mat: 'sk_far', tint: shade(t, 1.25), top: false });
    }
  }
  // octagonal lantern + the gilded spire
  kit.cyl({ x, y: crown2, z, r: 6.5, h: lantern - crown2, seg: 8, mat: 'sk_far', tint: shade(t, 1.1), top: false });
  kit.cyl({ x, y: lantern, z, r: 6.0, r2: 0.15, h: h - lantern, seg: 8, mat: 'sk_gold', tint: '#ffffff', top: false });
  kit.cyl({ x, y: lantern - 0.6, z, r: 6.9, h: 0.6, seg: 8, mat: 'sk_gold', tint: '#c9a050', top: false });
  litSpecks(kit, x, z, 30, 30, 0, shaft, 6);
}
/** Burning 1960s slab ENE (200, -60, 100 m): fire on its upper floors, scorch, flames on the roof, smoke column. */
function burningTower(kit, x, z, h) {
  const w = 18, d = 42, t = '#4f4e4b';
  towerBox(kit, x, z, w, d, 0, h, 'sk_far', t);
  for (const f of towerFaces(x, z, w, d)) {
    for (let y = 8; y < h - 2; y += 3.6) fbox(kit, f, 0, f.L, y, y + 0.9, 0, 0.25, 'sk_far', { tint: shade(t, 1.3), top: false, ends: false });
    // burning floors: clusters of fire windows, black scorch above them
    for (const [fy, n] of [[h - 7, 7], [h - 10.6, 5], [h - 14.2, 3], [h - 25, 2]]) {
      let u = kit.rnd(1, f.L * 0.4);
      for (let k = 0; k < n && u < f.L - 3; k++) {
        const ww = kit.rnd(2.2, 4.5);
        fq(kit, f, u - 0.6, u + ww + 0.6, fy + 1.4, fy + 4.6, 0.3, 'sk_far', { tint: '#1a1918' });
        pane(kit, f, u, u + ww, fy, fy + 1.9, 0.32, 'sk_fire', '#3c1a0a', 1);
        u += ww + kit.rnd(0.5, 3);
      }
    }
  }
  towerBox(kit, x, z, w * 0.5, d * 0.3, h, h + 4.5, 'sk_far', '#2c2b29');
  // flames on the roof (jagged, leaning NE with the wind)
  for (let i = 0; i < 9; i++) {
    const px = x + kit.rnd(-w * 0.4, w * 0.4), pz = z + kit.rnd(-d * 0.4, d * 0.4), r = kit.rnd(1.5, 3.5), fh = kit.rnd(4, 10);
    kit.hull([[px - r, h, pz - r], [px + r, h, pz - r * 0.6], [px + r * 0.5, h, pz + r], [px - r * 0.7, h, pz + r * 0.6], [px + fh * 0.25, h + fh, pz - fh * 0.15]], 'sk_fire', { tint: '#5a2a10' });
  }
  // smoke column: drawn at runtime as an animated soft plume (layout ENV.fx.smoke -> map.json fx ->
  // game/src/world/mapAmbient.js); static lumpy puffs read as a solid dark capsule against the sky
}

// ---------------------------------------------------------------------------------------------------- zone entry
export function build(kit, L) {
  region(kit, 'N', () => { northBlocks(kit); rail(kit, -84, -26); rail(kit, 26, 84); });
  region(kit, 'S', () => southBlocks(kit));
  region(kit, 'W', () => westRing(kit));
  region(kit, 'E', () => eastRing(kit));
  region(kit, 'F', () => skyline(kit, L));
  // the viaduct deck never joins the nav grid: the flood from SP_N_BRIDGE (on the bridge deck) would otherwise walk
  // out along it; blocked like the bridge deck in the north zone (cells keep height 6.6 with flag BLOCK)
  kit.nav('block', [[-84, -74.2], [-26, -74.2], [-26, -61.8], [-84, -61.8]], { y0: 5.0, y1: 9.0 });
  kit.nav('block', [[26, -74.2], [84, -74.2], [84, -61.8], [26, -61.8]], { y0: 5.0, y1: 9.0 });
  return {};
}

// ---------------------------------------------------------------------------------------------------- 5x7 block font
// Our own blocky sign-painter letters (ghost signs and billboards are read from 40-120 m away).
const FONT = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  '-': ['.....', '.....', '.....', '.###.', '.....', '.....', '.....'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  "'": ['..#..', '..#..', '.#...', '.....', '.....', '.....', '.....'],
};
