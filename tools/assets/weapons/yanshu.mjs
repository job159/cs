// 焰樞．破限 Pyrecore Unbound — M04 神兵, 啟明工坊 flagship (docs/PREMIUM_WEAPONS.md M04, §1.15.1: not a lance — a forge-core
// cannon). A heavy bullpup anti-materiel skeleton (the energy cell behind the grip), 1,250 mm, white ceramic composite armour,
// safety orange, gunmetal, a molten core seen through the furnace window. From the butt forward:
//   - stock: a slender skeleton stock (top bar with a rubber cheek riser, a lower strut, an open frame between), a ribbed
//     rubber butt pad on a steel plate, a QD sling cup; the rear receiver in gunmetal with ceramic cheek panels (seams,
//     screws), the right-side charging handle (bolt) in its slot;
//   - the furnace (爐膛, 160 x 90 x 80): a gunmetal chassis clad in ceramic plates; on the right the 90 x 40 furnace window
//     (fx_core, on the LEFT face — the flank first person sees: a steel bezel on six screws, a clear pane, behind it a fire-blackened chamber with the molten core
//     cylinder — obsidian / pv_core lava — on two cradles over an ember grate); on top the two sliding doors
//     (fx_doorL / fx_doorR, 0 -> 22 mm apart on rails, finger grooves, a pull lug each) over the core's grille; three
//     vent slits along each upper edge (the 爐環 fire jets) with glowing liners; the 樞能 pressure gauge (fx_needle) on
//     the right front; the left side a heat-shield vent grille and the 焰樞 / QIMING WORKS plate; the pistol grip, a
//     big trigger guard and the trigger under it; the triangular energy cell (mag, 38 mm sides x 120) behind the grip;
//   - the barrel shroud (50 -> 455): ceramic upper armour in three panels (the rear one carries the spine seal fx_seal:
//     a riveted steel strap with 禁止解封 in raised red, two lead-sealed clamps), a gunmetal lower chassis with
//     lightening slots onto the fluted barrel, two braided hydraulic lines, the angled foregrip on a short rail, three
//     45° safety-orange bands; on top the fin bay with six heat-sink fins (fx_fin1-6, 110 x 45 x 4, lying back as a
//     stepped stack, the rear fin on top; each on its own hinge pin; glowing slots and tail strips that heat up in
//     overload; open -70 = raised 70° into the heat tower);
//   - the 樞錘 ram (fx_ram, slides 0 -> 60 mm on four Ø12 guide rods out of bronze bushings): a guide yoke, a 70 x 70
//     hammer block (6 mm chamfers, fullers, a raised 樞 cartouche, two safety bands), a bolted collar, a slightly convex
//     black striking face milled into a waffle of pyramids round the bore; the real barrel (Ø20 / Ø14 bore) runs through
//     the ram's centre and stands 15 mm out of the face; the front sight on the ram.
// Side view, mm: s forward (towards the muzzle), t up, w right. Bore axis t = 0. Right palm (grip_r) near s = 8.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer';
import { Gun, lathe, cyl, tube, profile, section, plan, box, sphere, ring, sweep, cut, intersect, merge, xform, mirrorW, cutters } from '../lib/gunkit.mjs';
import { MeshBVH } from 'three-mesh-bvh';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';
import { bakeMeshes } from '../lib/bake.mjs';
import { postBake } from './m4.mjs';
import { TAU, D2R, along, domeAt, vadd, vsub, vmul, vlen, vnorm, vlerp } from '../lib/sculpt.mjs';

await MeshoptSimplifier.ready;

const ARMOR = 'ceramic_armor', SAFE = 'paint_safety', STEEL = 'steel', DARK = 'steel_dark', BRIGHT = 'steel_bright', BLACK = 'black_chrome',
  GRIP = 'polymer_grip', POLY = 'polymer', RUB = 'rubber', BRASS = 'brass', GLASS = 'glass_clear', CORE = 'obsidian', GLOW = 'glow_orange',
  HEAT = 'glow_vermilion', RED = 'paint_red', WHITE = 'paint_white', DIAL = 'ceramic', FAB = 'fabric_black';

// ------------------------------------------------------------------------------------------ layout
export const YS = {
  butt: -455,
  F0: -110, F1: 50, FB: -40, FT: 50, FW: 40,     // furnace box (160 x 90 x 80)
  win: [-96, -6, -11, 29],                        // furnace window on the right face: s0, s1, t0, t1 (90 x 40)
  door: [-86, -6],                                // top doors: s range (80), two plates 44 wide
  sh0: 50, sh1: 455, shW: 30, shT: 28, shB: -30,  // barrel shroud
  bay: 26.5, bayF: 11,                            // fin bay half width, floor height
  fin0: 312, finP: 26, finL: 110, finW: 45, finTh: 4, finDT: 4.4, finB: 13.2,   // fins: first hinge s, pitch, plate, step, lowest bottom
  ram0: 486, ram1: 780, ramH: 35,                 // 樞錘: yoke rear .. face, half size (70 x 70)
  muzzle: 795, gripS: 8,
  cell: [-66, -40],                               // energy cell centroid s, seat t
  seal: [8, 214],                                 // spine seal s range
};
const Y = YS;
/** fin i (0 = rear, on top of the stack): hinge s, bottom t */
const finH = (i) => [Y.fin0 + Y.finP * i, Y.finB + Y.finDT * (5 - i)];

// ------------------------------------------------------------------------------------------ helpers
const T3 = (p) => new THREE.Vector3(p[2], p[1], -p[0]);
/** chamfered box: octagonal section along s */
const cb = ([s, t, w], [ls, lt, lw], b = 0.6) => {
  const hw = lw / 2, ht = lt / 2, c = Math.min(b, hw - 0.05, ht - 0.05);
  return section([[w - hw + c, t - ht], [w + hw - c, t - ht], [w + hw, t - ht + c], [w + hw, t + ht - c], [w + hw - c, t + ht], [w - hw + c, t + ht],
    [w - hw, t + ht - c], [w - hw, t - ht + c]], s - ls / 2, s + ls / 2, { bevel: Math.min(b, ls / 2 - 0.05), bevelSeg: 1, curveSeg: 2 });
};
/** box with its edges along X, Y (Z = X x Y) in [s,t,w] directions, centred at c */
function obox(c, X, Y2, [lx, ly, lz]) {
  const x = T3(X).normalize(), y = T3(Y2).normalize(), z = new THREE.Vector3().crossVectors(x, y).normalize();
  const geo = new THREE.BoxGeometry(lx, ly, lz);
  geo.applyMatrix4(new THREE.Matrix4().makeBasis(x, y, z));
  const C = T3(c);
  geo.translate(C.x, C.y, C.z);
  for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
  return geo.toNonIndexed();
}
const PF = (pts, o = {}) => profile(pts, { curveSeg: 4, ...o });
const PL = (pts, o = {}) => plan(pts, { curveSeg: 4, ...o });
const SC = (pts, a, b, o = {}) => section(pts, a, b, { curveSeg: 4, ...o });
/** hex bolt head along direction n ([s,t,w]) at p */
const hexBolt = (p, n, r = 3, h = 2.2) => along([[0, 0], [0, r], [h * 0.8, r], [h, r * 0.82], [h, 0]], p, n, 6, 50);
/** socket-head cap screw (counterbored look: a ring with a hex hole read) */
const capScrew = (p, n, r = 2.2, h = 1.6) => along([[0, 0], [0, r], [h * 0.85, r], [h, r * 0.85], [h, r * 0.48], [h * 0.5, r * 0.42], [h * 0.5, 0]], p, n, 12, 50);
const rivet = (p, n, r = 1.6) => domeAt(p, n, r, r * 0.62, 10);
/** counterbore cutter on a face (outward normal n at p) for a head of radius r: d deep, a 0.3 mm lead-in chamfer */
const cbore = (p, n, r, d = 1.3) => along([[-d, 0], [-d, r + 0.45], [-0.3, r + 0.45], [0, r + 0.75], [0.8, r + 0.75], [0.8, 0]], p, n, 16);
/** a cap screw sunk in its counterbore (head top 0.3 mm under the face) */
const sunk = (p, n, r, d = 1.3) => capScrew(vadd(p, vmul(vnorm(n), -d)), n, r, d - 0.3);
/** k domed rivets from a to b */
const rivetRow = (a, b, n, k, r = 1.2) => merge(Array.from({ length: k }, (_, i) => rivet(vlerp(a, b, k > 1 ? i / (k - 1) : 0.5), n, r)));
/** seam groove cutter from a to b along a face with outward normal n (wd wide, d deep) */
const groove = (a, b, n, wd = 0.8, d = 0.9) => obox(vlerp(a, b, 0.5), vsub(b, a), n, [vlen(vsub(b, a)), 2 * d, wd]);
/** torque-seal dab (QC paint) on a screw head */
const qc = (p, n, r = 1) => domeAt(vadd(p, vmul(vnorm(n), 0.2)), n, r, r * 0.55, 8);
/** rounded polygon [[s,t,r?]] -> sampled points */
function rpoly(pts, seg = 3) {
  const n = pts.length, out = [];
  for (let k = 0; k < n; k++) {
    const [x, y, r = 0] = pts[k], [px, py] = pts[(k + n - 1) % n], [nx, ny] = pts[(k + 1) % n];
    if (!r) { out.push([x, y]); continue; }
    const li = Math.hypot(x - px, y - py), lo = Math.hypot(nx - x, ny - y), ri = Math.min(r, li * 0.5), ro = Math.min(r, lo * 0.5);
    const a = [x + (px - x) / li * ri, y + (py - y) / li * ri], b = [x + (nx - x) / lo * ro, y + (ny - y) / lo * ro];
    for (let i = 0; i <= seg; i++) { const u = i / seg, m = 1 - u; out.push([m * m * a[0] + 2 * m * u * x + u * u * b[0], m * m * a[1] + 2 * m * u * y + u * u * b[1]]); }
  }
  return out;
}
/** rounded rectangle outline in (s, t) */
const rrect = (s0, s1, t0, t1, r) => [[s0, t0, r], [s1, t0, r], [s1, t1, r], [s0, t1, r]];
/** a slanted band (45° by default, leaning forward from the bottom) of width wd centred at (s, t): a CSG cutter / mask */
const slab = (s, t, wd = 12, ang = 45, L = 400) => {
  const g = new THREE.BoxGeometry(L, L, wd);                     // thin along three z (= s)
  g.applyMatrix4(new THREE.Matrix4().makeRotationX(-ang * D2R));
  const C = T3([s, t, 0]);
  g.translate(C.x, C.y, C.z);
  return g;
};

// ------------------------------------------------------------------------------------------ lettering (own stroke fonts)
// Latin caps on a 4 x 6 cell, CJK on a 10 x 10 cell (polylines in cell units; a one-point line is a dot). Raised strokes.
const LAT = {
  A: [[[0, 0], [0, 4.2], [1.8, 6], [2.2, 6], [4, 4.2], [4, 0]], [[0, 2.8], [4, 2.8]]],
  B: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]], [[3, 3], [4, 2], [4, 1], [3, 0], [0, 0]]],
  C: [[[4, 6], [0.8, 6], [0, 5.2], [0, 0.8], [0.8, 0], [4, 0]]],
  D: [[[0, 0], [0, 6], [2.8, 6], [4, 4.8], [4, 1.2], [2.8, 0], [0, 0]]],
  E: [[[4, 6], [0, 6], [0, 0], [4, 0]], [[0, 3], [3, 3]]],
  F: [[[4, 6], [0, 6], [0, 0]], [[0, 3], [3, 3]]],
  G: [[[4, 5.2], [3.2, 6], [0.8, 6], [0, 5.2], [0, 0.8], [0.8, 0], [3.2, 0], [4, 0.8], [4, 2.8], [2.2, 2.8]]],
  H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  I: [[[1, 6], [3, 6]], [[2, 6], [2, 0]], [[1, 0], [3, 0]]],
  K: [[[0, 0], [0, 6]], [[4, 6], [0.4, 2.8]], [[1.4, 3.6], [4, 0]]],
  L: [[[0, 6], [0, 0], [4, 0]]],
  M: [[[0, 0], [0, 6], [2, 3], [4, 6], [4, 0]]],
  N: [[[0, 0], [0, 6], [4, 0], [4, 6]]],
  O: [[[0.8, 0], [0, 0.8], [0, 5.2], [0.8, 6], [3.2, 6], [4, 5.2], [4, 0.8], [3.2, 0], [0.8, 0]]],
  P: [[[0, 0], [0, 6], [3.2, 6], [4, 5.2], [4, 3.8], [3.2, 3], [0, 3]]],
  Q: [[[0.8, 0], [0, 0.8], [0, 5.2], [0.8, 6], [3.2, 6], [4, 5.2], [4, 0.8], [3.2, 0], [0.8, 0]], [[2.6, 1.4], [4.2, -0.4]]],
  R: [[[0, 0], [0, 6], [3.2, 6], [4, 5.2], [4, 3.8], [3.2, 3], [0, 3]], [[1.8, 3], [4, 0]]],
  S: [[[4, 6], [0.8, 6], [0, 5.2], [0, 3.8], [0.8, 3], [3.2, 3], [4, 2.2], [4, 0.8], [3.2, 0], [0, 0]]],
  T: [[[0, 6], [4, 6]], [[2, 6], [2, 0]]],
  U: [[[0, 6], [0, 0.8], [0.8, 0], [3.2, 0], [4, 0.8], [4, 6]]],
  W: [[[0, 6], [0.8, 0], [2, 3.6], [3.2, 0], [4, 6]]],
  Y: [[[0, 6], [2, 3], [4, 6]], [[2, 3], [2, 0]]],
  0: [[[0.8, 0], [0, 0.8], [0, 5.2], [0.8, 6], [3.2, 6], [4, 5.2], [4, 0.8], [3.2, 0], [0.8, 0]]],
  1: [[[0.8, 4.8], [2, 6], [2, 0]], [[0.8, 0], [3.2, 0]]],
  2: [[[0, 5.2], [0.8, 6], [3.2, 6], [4, 5.2], [4, 3.8], [0, 0], [4, 0]]],
  3: [[[0, 6], [4, 6], [1.8, 3.4], [3.2, 3.4], [4, 2.6], [4, 0.8], [3.2, 0], [0.8, 0], [0, 0.8]]],
  4: [[[3, 0], [3, 6], [0, 1.8], [4, 1.8]]],
  5: [[[4, 6], [0, 6], [0, 3.4], [3, 3.4], [4, 2.6], [4, 0.8], [3.2, 0], [0, 0]]],
  6: [[[3.4, 6], [1.4, 6], [0, 4.2], [0, 0.8], [0.8, 0], [3.2, 0], [4, 0.8], [4, 2.4], [3.2, 3.2], [0, 3.2]]],
  7: [[[0, 6], [4, 6], [1.4, 0]]],
  8: [[[0.8, 3], [0, 3.8], [0, 5.2], [0.8, 6], [3.2, 6], [4, 5.2], [4, 3.8], [3.2, 3], [0.8, 3], [0, 2.2], [0, 0.8], [0.8, 0], [3.2, 0], [4, 0.8], [4, 2.2], [3.2, 3]]],
  9: [[[0.6, 0], [2.6, 0], [4, 1.8], [4, 5.2], [3.2, 6], [0.8, 6], [0, 5.2], [0, 3.6], [0.8, 2.8], [4, 2.8]]],
  '.': [[[0.5, 0.2]]], '·': [[[0.5, 3]]], '-': [[[0.6, 3], [3.4, 3]]], '/': [[[0, 0], [4, 6]]], '%': [[[0, 0], [4, 6]], [[0.6, 5.4]], [[3.4, 0.6]]],
  V: [[[0, 6], [2, 0], [4, 6]]], X: [[[0, 0], [4, 6]], [[0, 6], [4, 0]]], Z: [[[0, 6], [4, 6], [0, 0], [4, 0]]], J: [[[4, 6], [4, 0.8], [3.2, 0], [0.8, 0], [0, 0.8]]],
  '°': [[[0.4, 5.2], [1.1, 6], [1.8, 5.2], [1.1, 4.4], [0.4, 5.2]]], '→': [[[0, 3], [4, 3]], [[2.2, 5], [4, 3], [2.2, 1]]], '↑': [[[2, 0], [2, 6]], [[0.2, 4], [2, 6], [3.8, 4]]],
  '←': [[[0, 3], [4, 3]], [[1.8, 5], [0, 3], [1.8, 1]]],
};
const NARROW = { '.': 1.6, '·': 1.6, '°': 2.6 };
const CJK = {
  // 焰: 火 + 臽
  焰: [[[0.6, 7.6], [1.2, 6.0]], [[3.4, 7.8], [2.8, 6.2]], [[2.0, 10], [2.0, 5.0], [0.2, 0.6]], [[2.0, 5.0], [3.8, 1.4]],
    [[6.6, 10], [4.6, 7.4]], [[5.8, 9.0], [9.0, 9.0], [8.0, 7.2]], [[4.8, 6.0], [4.8, 0.2], [9.6, 0.2], [9.6, 6.0]], [[4.8, 6.0], [6.4, 6.0]], [[8.0, 6.0], [9.6, 6.0]],
    [[4.8, 3.2], [6.6, 3.2]], [[7.8, 3.2], [9.6, 3.2]], [[7.2, 5.4], [7.2, 0.2]]],
  // 樞: 木 + 區
  樞: [[[0.2, 7.4], [3.4, 7.4]], [[1.8, 10], [1.8, 0.2]], [[1.8, 7.0], [0.2, 3.6]], [[1.8, 6.4], [3.2, 5.0]],
    [[9.8, 9.6], [4.2, 9.6], [4.2, 0.4], [9.8, 0.4]], [[5.6, 8.2], [8.6, 8.2], [8.6, 6.2], [5.6, 6.2], [5.6, 8.2]],
    [[5.0, 4.8], [6.8, 4.8], [6.8, 2.0], [5.0, 2.0], [5.0, 4.8]], [[7.4, 4.8], [9.2, 4.8], [9.2, 2.0], [7.4, 2.0], [7.4, 4.8]]],
  // 封: 圭 + 寸
  封: [[[0.6, 8.2], [4.0, 8.2]], [[2.3, 10], [2.3, 6.6]], [[0.2, 6.6], [4.4, 6.6]], [[0.6, 4.2], [4.0, 4.2]], [[2.3, 5.8], [2.3, 0.8]], [[0.2, 0.6], [4.6, 1.4]],
    [[5.2, 7.2], [9.8, 7.2]], [[8.4, 10], [8.4, 0.4], [7.4, 0.8]], [[6.4, 4.8], [7.2, 3.6]]],
  // 禁: 林 over 示
  禁: [[[0.4, 8.6], [4.4, 8.6]], [[2.4, 10], [2.4, 5.2]], [[2.4, 8.4], [0.4, 6.2]], [[2.4, 8.2], [4.0, 6.8]],
    [[5.4, 8.6], [9.8, 8.6]], [[7.6, 10], [7.6, 5.2]], [[7.6, 8.4], [5.4, 5.8]], [[7.6, 8.2], [9.8, 6.0]],
    [[2.0, 4.6], [8.0, 4.6]], [[0.6, 3.0], [9.4, 3.0]], [[5, 3.0], [5, 0.2], [4.2, 0.6]], [[3.2, 2.0], [1.6, 0.6]], [[6.8, 2.0], [8.4, 0.6]]],
  止: [[[5, 10], [5, 0.4]], [[5, 6.4], [8.6, 6.4]], [[2.2, 6.0], [2.2, 0.4]], [[0.4, 0.4], [9.6, 0.4]]],
  // 解: 角 + 刀 over 牛
  解: [[[1.8, 10], [0.6, 8.4]], [[1.6, 9.2], [3.8, 9.2], [3.0, 8.2]], [[1.0, 7.6], [4.2, 7.6], [4.2, 0.6], [3.6, 0.2]], [[1.0, 7.6], [1.0, 2.0], [0.2, 0.4]],
    [[1.0, 5.4], [4.2, 5.4]], [[1.0, 3.2], [4.2, 3.2]], [[2.6, 7.6], [2.6, 1.2]],
    [[5.6, 9.4], [9.2, 9.4], [9.2, 7.4], [8.6, 7.0]], [[7.4, 9.4], [6.6, 7.6], [5.4, 6.8]],
    [[6.6, 6.0], [5.6, 4.4]], [[6.2, 5.0], [9.6, 5.0]], [[5.2, 2.8], [9.8, 2.8]], [[7.6, 6.4], [7.6, 0.0]]],
  // 高 / 溫 for the furnace heat plate
  高: [[[5, 10], [5, 9]], [[0.8, 8.8], [9.2, 8.8]], [[2.8, 7.6], [7.2, 7.6], [7.2, 5.6], [2.8, 5.6], [2.8, 7.6]],
    [[1.2, 0], [1.2, 4.4], [8.8, 4.4], [8.8, 0.6], [8, 0]], [[3.4, 3.2], [6.6, 3.2], [6.6, 1.2], [3.4, 1.2], [3.4, 3.2]]],
  溫: [[[0.8, 9.2], [1.8, 8.4]], [[0.6, 6.8], [1.6, 6.0]], [[0.4, 1.0], [1.8, 4.4]],
    [[3.4, 9.6], [8.8, 9.6], [8.8, 5.4], [3.4, 5.4], [3.4, 9.6]], [[3.4, 7.5], [8.8, 7.5]], [[5.6, 9.0], [4.6, 6.2]], [[6.6, 8.6], [7.6, 6.2]],
    [[3.0, 4.0], [9.4, 4.0], [9.4, 0.4]], [[3.0, 4.0], [3.0, 0.4]], [[5.1, 4.0], [5.1, 0.4]], [[7.2, 4.0], [7.2, 0.4]], [[2.2, 0.4], [10, 0.4]]],
};
const isCJK = (ch) => /[㐀-鿿]/.test(ch);
/** raised stroke lettering: `at` centre of the line, u reading direction, v up, n out of the face ([s,t,w]) */
function label(str, { at, u, v, n, h = 3, hz = h * 1.45, sw = h * 0.16, swz = hz * 0.07, proud = 0.12, sink = 0.2, align = 0 }) {
  const U = T3(u).normalize(), Vv = T3(v).normalize(), N = T3(n).normalize(), A = T3(at);
  if (new THREE.Vector3().crossVectors(U, Vv).dot(N) < 0.5) console.warn('[yanshu] mirrored label', str);
  const kL = h / 6, kC = hz / 10, items = [];
  let x = 0, gap = 0;
  for (const ch of str) {
    if (ch === ' ') { x += 3.2 * kL; gap = 0; continue; }
    if (isCJK(ch)) { items.push({ g: CJK[ch] || [], k: kC, x, y: -hz / 2, w: swz }); x += 11 * kC; gap = 1 * kC; }
    else { items.push({ g: LAT[ch] || [], k: kL, x, y: -h / 2, w: sw }); const adv = NARROW[ch] ?? 5.6; x += adv * kL; gap = (adv - (NARROW[ch] ? 1 : 4)) * kL; }
  }
  const width = x - gap, x0 = align < 0 ? 0 : align > 0 ? -width : -width / 2, out = [];
  const P = (it, p) => A.clone().addScaledVector(U, x0 + it.x + p[0] * it.k).addScaledVector(Vv, it.y + p[1] * it.k);
  const stroke = (a, b, w) => {
    const d = b.clone().sub(a), L = d.length();
    if (L < 1e-6) d.copy(U); else d.normalize();
    const p = new THREE.Vector3().crossVectors(N, d);
    const geo = new THREE.BoxGeometry(L + w, w, proud + sink);
    geo.applyMatrix4(new THREE.Matrix4().makeBasis(d, p, N));
    const c = a.clone().add(b).multiplyScalar(0.5).addScaledVector(N, (proud - sink) / 2);
    geo.translate(c.x, c.y, c.z);
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
    out.push(geo.toNonIndexed());
  };
  for (const it of items) for (const line of it.g) {
    if (line.length === 1) { const q = P(it, line[0]); stroke(q, q, it.w * 1.35); continue; }
    for (let i = 0; i + 1 < line.length; i++) stroke(P(it, line[i]), P(it, line[i + 1]), it.w);
  }
  return merge(out);
}
// label frames: right face (+w) reads forward, left face (-w) reads backward, top (+t) reads forward (up = left)
const RIGHT = { u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] };
const LEFT = { u: [-1, 0, 0], v: [0, 1, 0], n: [0, 0, -1] };
const TOP = { u: [1, 0, 0], v: [0, 0, -1], n: [0, 1, 0] };
const TOPR = { u: [0, 0, 1], v: [1, 0, 0], n: [0, 1, 0] };   // top face, upright for the shooter (glyph up = forward)

// ------------------------------------------------------------------------------------------ model
export default function build() {
  const g = new Gun('yanshu');
  const { F0, F1, FB, FT, FW } = Y;
  const [w0, w1, wt0, wt1] = Y.win;

  // ======================================================================== furnace (爐膛)
  {
    // the window is on the LEFT face (in first person the eye sees the gun's left flank and top); the radiator right
    const WS = -1, WF = WS * FW, SIDE = WS > 0 ? RIGHT : LEFT, OSIDE = WS > 0 ? LEFT : RIGHT, EN = [0, 0, WS], FN = [0, 0, -WS];
    // gunmetal chassis inside the armour (shows at the seams, round the window, under the doors and in the slits)
    let chassis = cb([(F0 + F1) / 2, (FB + FT) / 2 - 1, 0], [F1 - F0 - 4, FT - FB - 6, 2 * FW - 12], 5);
    chassis = cut(chassis, [
      cutters.box([(w0 + w1) / 2, (wt0 + wt1) / 2, WF], [w1 - w0 - 2, wt1 - wt0 - 2, 40]),                           // window chamber
      cutters.box([(Y.door[0] + Y.door[1]) / 2, FT, 0], [Y.door[1] - Y.door[0] - 6, 30, 2 * FW - 22]),                 // roof opening
      cutters.box([-56, 8, -WF], [72, 26, 24]),                                                                        // radiator bay
    ]);
    g.add(chassis, STEEL);
    // fire chamber behind the window: a fire-blackened liner, open towards the window and the roof
    const ch0 = w0 + 3, ch1 = w1 - 3, cm = (ch0 + ch1) / 2;
    g.add(cut(cb([cm, 9, WS * 4], [ch1 - ch0, 44, 54], 3), [cb([cm, 12, WS * 7], [ch1 - ch0 - 6, 44, 52], 3)]), DARK);
    for (let i = 0; i < 9; i++) g.add(cb([ch0 + 6 + i * ((ch1 - ch0 - 12) / 8), -6.5, WS * 6], [2.6, 3, 44], 0.6), DARK);   // ember grate
    g.add(cb([cm, -9.4, WS * 6], [ch1 - ch0 - 6, 1.2, 46], 0.3), GLOW);                                                    // embers between the bars

    // armour plates, each split into sub-panels by 0.8 mm seams; screws sunk in counterbores (brass on the eye side)
    const outline = [[F0 + 2, FB + 7, 5], [F0 + 10, FB + 1, 4], [F1 - 6, FB + 1, 4], [F1 - 1, FB + 7, 3], [F1 - 1, FT - 16, 3], [F1 - 7, FT - 10.4, 4], [F0 + 7, FT - 10.4, 4], [F0 + 2, FT - 16, 3]];
    const sinkAll = (geo, list, mat) => { for (const [s, t, w, n, r] of list) g.add(sunk([s, t, w], n, r), mat); return cut(geo, list.map(([s, t, w, n, r]) => cbore([s, t, w], n, r))); };
    {
      // eye side: the window panel (with a skirt under the window) and the gauge panel ahead of the vertical seam; a
      // recessed service hatch under the gauge
      const fw = WS * FW, SV = [10, 42, -27, 5];
      let pl = PF(outline, { w: 6.4, cw: WS * (FW - 3.2), bevel: 1.5, holes: [rrect(w0 - 1, w1 + 1, wt0 - 1, wt1 + 1, 5)] });
      pl = cut(pl, [groove([4, FB + 1.5, fw], [4, FT - 10.9, fw], EN), groove([F0 + 2.5, -21, fw], [4, -21, fw], EN),
        cutters.pocketW(rrect(SV[0], SV[1], SV[2], SV[3], 3), WS * (FW - 1.2))]);
      const scr = [[F0 + 8, FB + 8], [-60, FB + 5], [-20, FB + 5], [F1 - 6, FB + 8], [8, FT - 18], [16, FB + 5]].map(([s, t]) => [s, t, fw, EN, 1.6]);
      pl = sinkAll(pl, scr, BRASS);
      g.add(pl, ARMOR);
      for (const [s, t] of [[-60, FB + 5], [F1 - 6, FB + 8]]) g.add(qc([s, t, fw + WS * 0.1], EN, 0.9), SAFE);
      // the hatch: an inset plate 0.3 under the face, four screws, a pull tab, a stencil
      g.add(PF(rrect(SV[0] + 0.9, SV[1] - 0.9, SV[2] + 0.9, SV[3] - 0.9, 2.2), { w: 0.9, cw: WS * (FW - 0.75), bevel: 0.3 }), ARMOR);
      for (const [s, t] of [[SV[0] + 3.4, SV[2] + 3.4], [SV[0] + 3.4, SV[3] - 3.4], [SV[1] - 3.4, SV[2] + 3.4], [SV[1] - 3.4, SV[3] - 3.4]]) g.add(capScrew([s, t, WS * (FW - 0.3)], EN, 1.1, 0.7), BRIGHT);
      g.add(cb([(SV[0] + SV[1]) / 2, SV[3] - 2.6, WS * (FW + 0.2)], [9, 2.6, 1.4], 0.5), BRASS);
      g.add(label('SERVICE', { at: [(SV[0] + SV[1]) / 2, -8, WS * (FW - 0.3)], ...SIDE, h: 2.6, sw: 0.42, proud: 0.12, sink: 0.12 }), DARK);
      g.add(label('P/N 04-117', { at: [(SV[0] + SV[1]) / 2, -13.5, WS * (FW - 0.3)], ...SIDE, h: 1.8, sw: 0.3, proud: 0.1, sink: 0.12 }), DARK);
      g.add(label('↑ 35 N·M', { at: [(SV[0] + SV[1]) / 2, -21.5, WS * (FW - 0.3)], ...SIDE, h: 1.8, sw: 0.3, proud: 0.1, sink: 0.12 }), DARK);
      // the skirt under the window: a rivet row along its seam, the HOT tag, a temperature stencil
      g.add(rivetRow([-92, -24.2, fw], [-8, -24.2, fw], EN, 9, 1.05), BRIGHT);
      g.add(PF(rrect(-97, -79, -35.5, -29, 1.5), { w: 1, cw: WS * (FW + 0.3), bevel: 0.3 }), SAFE);
      g.add(label('高溫', { at: [-88, -32.2, WS * (FW + 0.8)], ...SIDE, hz: 4.4, swz: 0.5, proud: 0.1, sink: 0.12 }), DARK);
      g.add(label('MAX 1400°C', { at: [-41, -30.4, fw], ...SIDE, h: 2.4, sw: 0.4, proud: 0.12, sink: 0.2 }), DARK);
      // a brass trim line along the plate's top edge
      g.add(cb([(F0 + F1) / 2 - 1, FT - 11.2, WS * (FW + 0.15)], [F1 - F0 - 22, 1.0, 0.7], 0.25), BRASS);
    }
    {
      // radiator side: an upper band (rivet row) over the vent panel, a seam ahead of the radiator, the maker plate
      const fw = -WS * FW;
      let pl = PF(outline, { w: 6.4, cw: -WS * (FW - 3.2), bevel: 1.5, holes: [rrect(-92, -20, -6, 22, 4)] });
      pl = cut(pl, [groove([F0 + 2.5, 28.5, fw], [F1 - 1.5, 28.5, fw], FN), groove([-15, FB + 1.5, fw], [-15, 28.5, fw], FN)]);
      const scr = [[F0 + 8, FB + 8], [F0 + 8, FT - 18], [F1 - 6, FB + 8], [F1 - 6, FT - 18], [-30, FB + 5], [16, FB + 5]].map(([s, t]) => [s, t, fw, FN, 1.6]);
      pl = sinkAll(pl, scr, BRIGHT);
      g.add(pl, ARMOR);
      g.add(rivetRow([-92, 34, fw], [36, 34, fw], FN, 12, 1.05), BRIGHT);
      g.add(label('HOT EXHAUST', { at: [-56, -15, fw], ...OSIDE, h: 2.6, sw: 0.42, proud: 0.12, sink: 0.2 }), DARK);
      g.add(label('KEEP CLEAR →', { at: [-56, -21, fw], ...OSIDE, h: 2, sw: 0.34, proud: 0.12, sink: 0.2 }), DARK);
      g.add(qc([F1 - 6, FB + 8, fw - WS * 0.1], FN, 0.9), SAFE);
      // radiator: a framing bezel on four brass screws, 15 radiator fins and a cross bar in front of the glowing core
      // vent (the glow is seen between the fins, not as a flat plane)
      g.add(PF(rrect(-95.5, -16.5, -9.5, 25.5, 5.5), { w: 1.6, cw: -WS * (FW + 0.6), bevel: 0.5, holes: [rrect(-92, -20, -6, 22, 4)] }), STEEL);
      for (const [s, t] of [[-93.5, -7.5], [-93.5, 23.5], [-18.5, -7.5], [-18.5, 23.5]]) g.add(capScrew([s, t, -WS * (FW + 1.4)], FN, 1.05, 0.7), BRASS);
      for (let i = 0; i < 15; i++) g.add(cb([-89.6 + i * 4.8, 8, -WS * (FW - 6)], [0.8, 27.4, 9], 0.2), STEEL);
      g.add(cb([-56, 8, -WS * (FW - 1.2)], [71, 2.2, 2], 0.4), BRIGHT);
      g.add(cb([-56, 8, -WS * (FW - 10.6)], [70, 26, 1], 0.2), GLOW);
      // maker plate: dark plate, white raised lettering, brass rivets
      g.add(PF(rrect(-8, 44, -27, -5, 2), { w: 1.2, cw: -WS * (FW + 0.4), bevel: 0.4 }), DARK);
      g.add(label('焰樞', { at: [18, -12, -WS * (FW + 1)], ...OSIDE, hz: 9.6, swz: 0.9, proud: 0.2, sink: 0.2 }), WHITE);
      g.add(label('QIMING WORKS M04', { at: [18, -22.5, -WS * (FW + 1)], ...OSIDE, h: 2.5, sw: 0.44, proud: 0.16, sink: 0.2 }), WHITE);
      for (const [s, t] of [[-5, -24], [-5, -8], [41, -24], [41, -8]]) g.add(rivet([s, t, -WS * (FW + 1)], FN, 1.25), BRASS);
    }
    // chamfer strips with the three vent slits each (爐環: fire jets out of them): two louvre slats over a glowing liner
    for (const sg of [1, -1]) {
      const P = [[FW, FT - 10], [FW - 10, FT], [FW - 10, FT - 3.5], [FW - 3.5, FT - 10]].map(([w, t]) => [sg * w, t]);
      const strip = SC(P, F0 + 4, F1 - 4, { bevel: 0.6 });
      const sl = [];
      for (let i = 0; i < 3; i++) sl.push(obox([-74 + i * 26, FT - 5, sg * (FW - 5)], [1, 0, 0], [0, 1, -sg], [19, 3.2, 12]));
      g.add(cut(strip, sl), STEEL);
      const IN = [0, -0.7071, -sg * 0.7071], UP = [0, 0.7071, -sg * 0.7071];
      for (let i = 0; i < 3; i++) {
        const c = [-74 + i * 26, FT - 5, sg * (FW - 5)];
        g.add(obox(vadd(c, vmul(IN, 2.3)), [1, 0, 0], [0, 1, -sg], [18, 3, 1.2]), GLOW);
        for (const k of [-0.75, 0.75]) g.add(obox(vadd(vadd(c, vmul(IN, 1.2)), vmul(UP, k)), [1, 0, 0], UP, [18.4, 0.55, 2]), BRIGHT);
      }
      for (const s of [F0 + 8, F1 - 8]) g.add(rivet([s, FT - 5, sg * (FW - 5)], [0, 0.7071, sg * 0.7071], 1.1), BRIGHT);
    }
    // roof frame round the door opening; door rails
    g.add(PL([[F0 + 3, -FW + 10.5, 4], [F1 - 3, -FW + 10.5, 4], [F1 - 3, FW - 10.5, 4], [F0 + 3, FW - 10.5, 4]],
      { h: 5, ct: FT - 2.5, bevel: 1.2, holes: [[[Y.door[0], -26, 3], [Y.door[1], -26, 3], [Y.door[1], 26, 3], [Y.door[0], 26, 3]]] }), ARMOR);
    for (const sg of [1, -1]) {
      g.add(cb([(Y.door[0] + Y.door[1]) / 2, FT + 1.2, sg * 27.5], [Y.door[1] - Y.door[0] + 14, 2.4, 3], 0.5), BRIGHT);
      for (const s of [Y.door[0] - 4, Y.door[1] + 4]) g.add(capScrew([s, FT + 2.4, sg * 27.5], [0, 1, 0], 1.3, 1), BRASS);
    }
    // the grille over the core (seen when the doors slide apart): bright bevelled bars over five red-hot heating rods
    // on two ceramic rails, so the opened roof shows the forge, not a void
    for (let i = 0; i < 6; i++) g.add(cb([-80 + i * 13.6, FT - 7, 0], [3, 3, 44], 0.8), BRIGHT);
    for (const sg of [1, -1]) g.add(cb([(Y.door[0] + Y.door[1]) / 2, FT - 7, sg * 22], [Y.door[1] - Y.door[0] - 4, 3, 3], 0.6), DARK);
    for (let i = 0; i < 5; i++) g.add(cyl(-21, 21, 1.6, { seg: 10, b: 0.3 }).rotateY(Math.PI / 2).translate(0, FT - 10.5, 80 - i * 13.6 - 6.8), GLOW);
    for (const sg of [1, -1]) g.add(cb([-46, FT - 10.5, sg * 21.5], [72, 4, 2.4], 0.5), DIAL);
    g.add(cb([-46, FT - 14.5, 0], [72, 1.2, 40], 0.3), DARK);

    // vent crown (爐冠) on the roof ahead of the doors: a ceramic cowl 16 mm tall round the sight channel, a louvred top
    // over hot liners (glow_vermilion: dark at rest, red-hot in overload); it makes the furnace the gun's mass
    {
      const K0 = 6, K1 = 46, KT = FT + 16, km = (K0 + K1) / 2;
      let crown = SC(rpoly([[-31, FT - 0.5, 0], [31, FT - 0.5, 0], [31, FT + 6, 3], [25, KT, 4], [-25, KT, 4], [-31, FT + 6, 3]]), K0, K1, { bevel: 1.5 });
      const cuts = [cutters.box([km, KT, 0], [K1 - K0 + 10, 2 * (KT - FT - 8), 12.4])];
      const ksc = [1, -1].map((sg) => [[km, FT + 11.4, sg * 27.76], [0, 0.514, sg * 0.857]]);
      for (const sg of [1, -1]) for (let i = 0; i < 6; i++) cuts.push(cb([K0 + 7 + i * 5.4, KT, sg * 15.5], [2.6, 9, 13], 0.3));
      for (const [p, n] of ksc) { cuts.push(cbore(p, n, 1.4)); g.add(sunk(p, n, 1.4), BRASS); }
      crown = cut(crown, cuts);
      g.add(crown, ARMOR);
      for (const sg of [1, -1]) {
        g.add(cb([km, KT - 4.3, sg * 15.5], [32, 0.6, 13.4], 0.2), HEAT);
        g.add(rivetRow([K0 + 5, FT + 2.6, sg * 31], [K1 - 5, FT + 2.6, sg * 31], [0, 0, sg], 4, 1), BRIGHT);
      }
      g.add(cb([km, FT + 8.2, 0], [K1 - K0 - 2, 0.6, 12], 0.2), BRIGHT);                                   // sight channel floor
      // the shooter-facing rear face: a safety-orange HOT tag each side of the channel
      for (const sg of [1, -1]) {
        g.add(cb([K0 - 0.3, FT + 7.6, sg * 17.5], [0.8, 6.4, 13], 0.25), SAFE);
        g.add(label('HOT', { at: [K0 - 0.8, FT + 7.6, sg * 17.5], u: [0, 0, 1], v: [0, 1, 0], n: [-1, 0, 0], h: 3.4, sw: 0.55, proud: 0.12, sink: 0.12 }), DARK);
      }
    }

    // furnace window (fx_core: the pane + the molten core): steel bezel on six brass screws in front
    const core = g.part('fx_core', { pivot: [(w0 + w1) / 2, (wt0 + wt1) / 2, WF], extras: { hero: true } });
    g.add(PF(rrect(w0 - 5, w1 + 5, wt0 - 5, wt1 + 5, 7), { w: 3, cw: WS * (FW + 1.2), bevel: 0.8, holes: [rrect(w0 + 1, w1 - 1, wt0 + 1, wt1 - 1, 4)] }), DARK);
    for (const [s, t] of [[w0 - 1.5, wt0 - 1.5], [w0 - 1.5, wt1 + 1.5], [w1 + 1.5, wt0 - 1.5], [w1 + 1.5, wt1 + 1.5], [(w0 + w1) / 2, wt0 - 2.4], [(w0 + w1) / 2, wt1 + 2.4]])
      g.add(capScrew([s, t, WS * (FW + 2.7)], [0, 0, WS], 1.5, 0.9), BRASS);
    core.add(PF(rrect(w0 + 0.5, w1 - 0.5, wt0 + 0.5, wt1 - 0.5, 4.5), { w: 1.6, cw: WS * (FW - 0.4), bevel: 0.5 }), GLASS);
    // the molten core: a horizontal cylinder (pv_core lava) in five banded cooling rings between bolted end rings on
    // cradles, four tie rods
    const cy0 = w0 + 10, cy1 = w1 - 10, ct = 9, cw = WS * 6;
    core.add(lathe([[cy0, 0], [cy0, 13], [cy0 + 3, 15.5], [cy1 - 3, 15.5], [cy1, 13], [cy1, 0]], { t: ct, w: cw, seg: 28 }), CORE);
    for (let k = 0; k < 5; k++) { const s = cy0 + 11 + k * 12; core.add(lathe([[s - 1.3, 15.2], [s - 1.3, 16.2], [s - 0.7, 16.8], [s + 0.7, 16.8], [s + 1.3, 16.2], [s + 1.3, 15.2]], { t: ct, w: cw, seg: 28 }), DARK); }
    for (const [s, dir] of [[cy0 - 3, -1], [cy1 + 3, 1]]) {
      g.add(lathe([[s - 3, 0], [s - 3, 15], [s - 2, 17.5], [s + 2, 17.5], [s + 3, 15], [s + 3, 0]], { t: ct, w: cw, seg: 24 }), DARK);
      g.add(cb([s, -3, cw], [7, 10, 30], 1), DARK);
      for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; g.add(hexBolt([s + dir * 3, ct + Math.sin(a) * 12, cw + Math.cos(a) * 12], [dir, 0, 0], 1.3, 1), BRIGHT); }
    }
    for (let k = 0; k < 4; k++) g.add(cyl(cy0 + 2, cy1 - 2, 1.1, { t: ct + Math.sin(k / 4 * TAU + 0.4) * 16.9, w: cw + Math.cos(k / 4 * TAU + 0.4) * 16.9, seg: 8 }), BRIGHT);

    // 樞能 gauge on the window side: a brass bezel ring (open: the dial shows through it), a white dial, ticks, a glowing
    // red-zone arc, numerals, the needle (fx_needle about w) on a brass hub. Seen from the left the dial reads clockwise
    // from the lower left: in (s, t) the needle angle runs -45° -> 225° (open +270)
    const GC = [32, 24, WS * (FW + 0.5)], GR = 11, GN = [0, 0, WS], gz = (d) => GC[2] + WS * d;
    g.add(along([[0, GR - 0.2], [0, GR + 2.6], [1.6, GR + 2.6], [3.2, GR + 1.8], [3.2, GR], [2.6, GR - 0.2]], GC, GN, 32, 40), BRASS);
    g.add(along([[0, 0], [0, GR], [1.2, GR], [1.2, 0]], GC, GN, 32), WHITE);
    for (let k = 0; k <= 10; k++) {
      const a = (-45 + k * 27) * D2R, r0 = k % 5 ? GR - 2.4 : GR - 3.8;
      g.add(obox([GC[0] + Math.cos(a) * (r0 + GR - 1) / 2, GC[1] + Math.sin(a) * (r0 + GR - 1) / 2, gz(1.3)], [Math.cos(a), Math.sin(a), 0], [0, 0, 1], [GR - 1 - r0, k % 5 ? 0.55 : 0.8, 0.4]), k >= 8 ? RED : DARK);
    }
    for (let k = 0; k < 20; k++) {   // minor ticks
      const a = (-45 + k * 13.5 + 6.75) * D2R;
      if (k % 2 === 0) g.add(obox([GC[0] + Math.cos(a) * (GR - 1.75), GC[1] + Math.sin(a) * (GR - 1.75), gz(1.3)], [Math.cos(a), Math.sin(a), 0], [0, 0, 1], [1.3, 0.35, 0.36]), DARK);
    }
    for (let k = 0; k < 9; k++) { const a = (171 + k * 6.75) * D2R; g.add(obox([GC[0] + Math.cos(a) * (GR - 0.85), GC[1] + Math.sin(a) * (GR - 0.85), gz(1.35)], [-Math.sin(a), Math.cos(a), 0], [0, 0, 1], [1.4, 1.1, 0.35]), GLOW); }
    for (const [txt, a] of [['0', -45], ['50', 90], ['100', 225]]) {
      const r = GR - 5.6, aa = a * D2R;
      g.add(label(txt, { at: [GC[0] + Math.cos(aa) * r, GC[1] + Math.sin(aa) * r, gz(1.2)], ...SIDE, h: 1.7, sw: 0.3, proud: 0.12, sink: 0.08 }), DARK);
    }
    g.add(label('樞', { at: [GC[0], GC[1] - 4.2, gz(1.2)], ...SIDE, hz: 2.8, swz: 0.26, proud: 0.1, sink: 0.08 }), RED);
    const nd = g.part('fx_needle', { pivot: GC, extras: { open: -WS * 270, hinge: 'w' } });
    const na = -45 * D2R;
    nd.add(obox([GC[0] + Math.cos(na) * 4, GC[1] + Math.sin(na) * 4, gz(1.9)], [Math.cos(na), Math.sin(na), 0], [0, 0, 1], [11, 0.9, 0.5]), SAFE);
    nd.add(along([[0, 0], [0, 1.8], [0.9, 1.8], [1.3, 1.0], [1.3, 0]], [GC[0], GC[1], gz(1.4)], GN, 14), BRASS);
    // the vent side screws, furnace front face: a bolted flange where the shroud joins
    for (const [t, w] of [[-30, 32], [-30, -32], [36, 32], [36, -32]]) g.add(hexBolt([F1, t, w], [1, 0, 0], 2.4, 1.8), BRIGHT);
    // rear sight: a flip aperture on the roof's rear edge
    g.add(cb([F0 + 12, FT + 3, 0], [12, 6, 30], 1), DARK);
    for (const sg of [1, -1]) g.add(cb([F0 + 12, FT + 10, sg * 9], [6, 10, 3], 0.8), DARK);
    g.add(cut(cb([F0 + 12, FT + 11, 0], [3, 10, 14], 0.5), [cutters.box([F0 + 12, FT + 12.5, 0], [10, 3.2, 3.2])]), DARK);
    for (const sg of [1, -1]) g.add(sunk([F0 + 12, FT + 6, sg * 15], [0, 0, sg], 1, 0.8), BRIGHT);
  }

  // doors (fx_doorL / fx_doorR): slide apart 22 mm on the rails; finger grooves, a pull lug, rivets
  for (const [nm, sg] of [['fx_doorL', -1], ['fx_doorR', 1]]) {
    const d = g.part(nm, { pivot: [(Y.door[0] + Y.door[1]) / 2, FT, sg * 13], extras: { open: [0, 0, sg * 0.022], order: sg > 0 ? 1 : 0 } });
    const s0 = Y.door[0] + 1, s1 = Y.door[1] - 1, a = sg * 0.4, b = sg * 27;
    d.add(PL([[s0, Math.min(a, b), 2], [s1, Math.min(a, b), 2], [s1, Math.max(a, b), 2], [s0, Math.max(a, b), 2]], { h: 6, ct: FT + 1, bevel: 1.2 }), ARMOR);
    for (let i = 0; i < 4; i++) d.add(cb([s0 + 14 + i * 4.2, FT + 4.1, sg * 14], [1.6, 0.6, 18], 0.2), DARK);
    d.add(cb([s1 - 12, FT + 5.6, sg * 18], [9, 3.2, 6], 1), BRIGHT);
    for (const s of [s0 + 4, s1 - 4]) d.add(rivet([s, FT + 4, sg * 22], [0, 1, 0], 1.1), BRIGHT);
    d.add(cb([(s0 + s1) / 2, FT - 1, sg * 26.5], [s1 - s0 - 4, 3, 2.4], 0.4), STEEL);
    d.add(cb([(s0 + s1) / 2, FT + 1, sg * 0.9], [s1 - s0 - 3, 5, 0.8], 0.2), DARK);   // the meeting lip (the 6 mm crack shows the glow under it)
  }

  // ======================================================================== rear receiver, stock
  {
    g.add(PF([[F0 + 2, -44, 4], [F0 + 2, 38, 4], [-150, 32, 10], [-300, 30, 8], [-312, 20, 6], [-312, -48, 6], [-210, -52, 10], [-130, -48, 6]], { w: 40, bevel: 2.5 }), STEEL);
    const panel = [[-122, -40, 5], [-122, 30, 6], [-160, 26, 8], [-292, 24, 6], [-300, 16, 4], [-300, -42, 5], [-212, -46, 8], [-136, -42, 5]];
    for (const sg of [1, -1]) {
      let pn = PF(panel, { w: 4.4, cw: sg * 21.6, bevel: 1.2 });
      if (sg > 0) pn = cut(pn, [cutters.slotW(-238, -162, 18, 6.4, 30, 22)]);   // charging-handle slot
      g.add(pn, ARMOR);
      g.add(cb([-216, 4, sg * 24.2], [140, 1.6, 1.2], 0.3), STEEL);
      for (const [s, t] of [[-130, -36], [-130, 22], [-290, -34], [-288, 16], [-210, -42]]) g.add(capScrew([s, t, sg * 23.8], [0, 0, sg], 1.5, 1), DARK);
    }
    // a raised armour plate on each cheek (four screws, a recessed grip field of ribs), two safety bands, stencils
    for (const sg of [1, -1]) {
      g.add(PF(rrect(-286, -186, -32, -6, 4), { w: 2, cw: sg * 24.4, bevel: 0.7 }), ARMOR);
      for (const [s2, t2] of [[-281, -27], [-281, -11], [-191, -27], [-191, -11]]) g.add(capScrew([s2, t2, sg * 25.5], [0, 0, sg], 1.3, 0.9), DARK);
      for (let i = 0; i < 7; i++) g.add(cb([-268 + i * 8, -19, sg * 25.6], [3, 18, 0.9], 0.3), POLY);
      const sk = PF([[-176, -40, 4], [-176, 26, 6], [-150, 30, 6], [-150, -42, 4]], { w: 5.3, cw: sg * 21.6, bevel: 1.4 });
      for (const s2 of [-170, -156]) g.add(intersect(sk, slab(s2, -6, 6)), SAFE);
    }
    g.add(label('焰樞', { at: [-236, 12, -23.9], ...LEFT, hz: 9, swz: 0.8, proud: 0.16, sink: 0.2 }), DARK);
    g.add(label('M04  UNBOUND', { at: [-236, 1.5, -23.9], ...LEFT, h: 2.6, sw: 0.42, proud: 0.12, sink: 0.2 }), DARK);
    g.add(label('PYRECORE', { at: [-236, 12, 23.9], ...RIGHT, h: 4, sw: 0.62, proud: 0.14, sink: 0.2 }), DARK);
    g.add(label('QW-M04-0721', { at: [-236, 4, 23.9], ...RIGHT, h: 2.4, sw: 0.4, proud: 0.12, sink: 0.2 }), DARK);
    // the receiver top: a ceramic spine cover with grip grooves (it is under the eye in first person)
    g.add(PF([[-118, 33, 3], [-118, 39, 3], [-150, 34.5, 6], [-296, 32.5, 4], [-296, 28, 3], [-150, 30, 6]], { w: 22, bevel: 1.5 }), ARMOR);
    for (let i = 0; i < 12; i++) g.add(cb([-160 - i * 10.5, 33.6 - i * 0.12, 0], [3.2, 1.6, 18], 0.4), DARK);
    // charging handle (bolt): carrier in the slot, a stem, a T-knob
    const bolt = g.part('bolt', { pivot: [-172, 18, 24], extras: { travel: 0.062 } });
    bolt.add(cb([-172, 18, 22.5], [14, 4.4, 6], 1), BRIGHT);
    bolt.add(along([[0, 2.4], [12, 2.4], [12.5, 0]], [-172, 18, 24], [0, 0, 1], 12), BRIGHT);
    bolt.add(along([[0, 0], [0, 4.2], [8, 4.2], [9, 3], [9, 0]], [-176, 18, 36.5], [1, 0, 0], 12), POLY);
    // skeleton stock: top bar + rubber cheek riser, lower strut, butt plate, ribbed pad
    g.add(PF([[-312, 14, 3], [-312, 30, 3], [-440, 32, 4], [-440, 14, 3]], { w: 34, bevel: 2 }), ARMOR);
    g.add(PF([[-318, 31.5, 6], [-318, 41, 6], [-420, 43, 6], [-420, 31.5, 4]], { w: 30, bevel: 3 }), RUB);
    for (let i = 0; i < 9; i++) g.add(cb([-330 - i * 10.6, 42.4, 0], [3, 1.2, 24], 0.4), RUB);
    g.add(PF([[-306, -48, 4], [-300, -36, 4], [-440, -46, 4], [-440, -62, 4]], { w: 30, bevel: 2 }), STEEL);
    g.add(PF([[-440, -70, 6], [-440, 36, 6], [-446, 36, 2], [-446, -70, 2]], { w: 40, bevel: 1.5 }), STEEL);
    g.add(PF([[-446, -72, 8], [-446, 38, 8], [-455, 38, 6], [-455, -72, 6]], { w: 42, bevel: 3 }), RUB);
    for (let i = 0; i < 10; i++) g.add(cb([-455.3, -62 + i * 10.4, 0], [1.2, 3.2, 36], 0.5), RUB);
    for (const t of [-6, 20]) for (const sg of [1, -1]) g.add(capScrew([-443, t, sg * 20.2], [0, 0, sg], 1.5, 1), DARK);
    g.add(along([[0, 0], [0, 6], [3, 6], [3.6, 4.6], [3.6, 2.6], [1.2, 2.6], [1.2, 0]], [-430, 22, -17], [0, 0, -1], 18), BRIGHT);   // QD cup
    g.add(ring(-425, 6, 1.4, { t: -66, axis: 'w', seg: 16 }), BRIGHT);
  }

  // ======================================================================== pistol grip, trigger housing, guard, cell well
  {
    const G = [[-6, -40, 2], [36, -40, 2], [32, -54, 6], [24, -60, 4], [26, -70, 6], [18, -82, 6], [20, -94, 6], [12, -108, 6], [6, -122, 8], [-18, -124, 8], [-16, -104, 8], [-10, -70, 10]];
    g.add(PF(G, { w: 30, bevel: 3.5, curveSeg: 5 }), GRIP);
    for (const sg of [1, -1]) g.add(PF([[-6, -60, 5], [16, -58, 5], [8, -112, 6], [-12, -112, 6]], { w: 1.2, cw: sg * 15.2, bevel: 0.4 }), POLY);
    g.add(PF([[-12, -58, 4], [-8, -58, 4], [-12, -118, 4], [-17, -118, 4]], { w: 22, bevel: 1.5 }), RUB);
    g.add(PF([[-20, -124, 3], [8, -122, 3], [7, -128, 3], [-19, -130, 3]], { w: 28, bevel: 1.2 }), STEEL);
    g.add(cyl(-15, -12, 1.6, { t: -126, w: 0, seg: 10 }), BRIGHT);
    // trigger housing under the furnace front / shroud, the U-guard below it, the trigger
    g.add(cb([68, -37, 0], [64, 14, 22], 2), STEEL);
    for (const sg of [1, -1]) for (const s of [44, 92]) g.add(along([[0, 0], [0, 1.6], [0.8, 1.6], [1, 0]], [s, -38, sg * 11], [0, 0, sg], 8), BRIGHT);
    g.add(PF([[38, -44, 1], [46, -44, 1], [48, -58, 5], [90, -58, 5], [92, -44, 1], [100, -44, 1], [98, -62, 7], [88, -68, 6], [46, -69, 6], [40, -62, 6]], { w: 12, bevel: 1.5 }), STEEL);
    const tr = g.part('trigger', { pivot: [58, -44, 0] });
    tr.add(PF([[54, -44, 1], [60, -44, 1], [61, -50, 3], [59, -56, 3], [56, -58.5, 2], [54, -57, 2], [56, -50, 3]], { w: 6, bevel: 1 }), BRIGHT);
    // the cell well collar behind the grip (a triangle opening), release paddle
    const [cs, ct] = Y.cell, e = 38, hT = e * Math.sqrt(3) / 2;
    const tri = (k, r) => rpoly([[cs + (hT * 2 / 3) * k, 0, r], [cs - (hT / 3) * k, -e / 2 * k, r], [cs - (hT / 3) * k, e / 2 * k, r]]);
    g.add(PL(tri(1.22, 6), { h: 9, ct: ct - 4.5, bevel: 1, holes: [tri(1.03, 4)] }), STEEL);
    g.add(PF([[-40, -46, 2], [-30, -46, 2], [-28, -52, 2], [-40, -54, 2]], { w: 14, bevel: 1 }), BRIGHT);
  }

  // ======================================================================== barrel, shroud, chassis
  {
    // barrel (Ø20, bore Ø14): ribbed inside the shroud, plain through the ram, a bright crown
    g.add(tube(F1 - 4, Y.muzzle, 10, 7, { seg: 28 }), DARK);
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + 0.26; g.add(cb([260, Math.sin(a) * 10.1, Math.cos(a) * 10.1], [300, 2, 2], 0.5), BLACK); }
    g.add(tube(Y.muzzle - 4, Y.muzzle, 10.4, 7, { seg: 28 }), BRIGHT);
    // lower chassis: gunmetal with lightening slots onto the barrel
    const slots = [];
    for (let i = 0; i < 5; i++) slots.push(cutters.slotW(118 + i * 58, 150 + i * 58, -10, 9, 80, 0));
    g.add(cut(SC([[-27, -30], [27, -30], [29, -24], [29, 2], [-29, 2], [-29, -24]], Y.sh0 - 2, Y.sh1, { bevel: 1.5 }), slots), STEEL);
    // upper armour: rear panel (the seal deck, full top), mid / front panels (the fin bay)
    const full = [[-30, 1], [30, 1], [30, 23], [25, Y.shT], [-25, Y.shT], [-30, 23]];
    const bay = [[-30, 1], [30, 1], [30, 23], [28, Y.shT], [Y.bay, Y.shT], [Y.bay, Y.bayF], [-Y.bay, Y.bayF], [-Y.bay, Y.shT], [-28, Y.shT], [-30, 23]];
    const seamA = Y.seal[1] + 4, seamB = 336;
    // rear panel: a louvred vent pocket each side (three slats shedding down and out)
    g.add(cut(SC(full, Y.sh0 + 0.8, seamA - 0.4, { bevel: 1.4 }), [cutters.box([112, 14.5, 30], [66, 13, 4.4]), cutters.box([112, 14.5, -30], [66, 13, 4.4])]), ARMOR);
    for (const sg of [1, -1]) {
      g.add(cb([112, 14.5, sg * 28.3], [66, 13, 0.8], 0.2), DARK);
      for (const t of [10.5, 14.5, 18.5]) g.add(obox([112, t, sg * 29.1], [1, 0, 0], [0, 0.82, sg * 0.57], [64, 3.8, 0.9]), STEEL);
      for (const s of [76, 148]) g.add(capScrew([s, 14.5, sg * 30.2], [0, 0, sg], 1.3, 0.9), DARK);
    }
    g.add(SC(bay, seamA + 0.4, seamB - 0.4, { bevel: 1.4 }), ARMOR);
    g.add(SC(bay, seamB + 0.4, Y.sh1 - 6, { bevel: 1.4 }), ARMOR);
    g.add(SC(bay.map(([w, t]) => [w * 1.04, t + (t > 5 ? 0.6 : 0)]), Y.sh1 - 6, Y.sh1, { bevel: 1 }), DARK);   // front collar
    // fin bay floor (a bright heat-spreader plate) and the stepped hinge ears on the walls
    g.add(cb([(seamA + Y.sh1) / 2, Y.bayF + 0.6, 0], [Y.sh1 - seamA - 8, 1.6, 2 * Y.bay - 1], 0.4), BRIGHT);
    for (let i = 0; i < 6; i++) {
      const [hs, hb] = finH(i), pt = hb + Y.finTh / 2, top = Math.max(pt + 4.5, Y.shT + 2);
      for (const sg of [1, -1]) {
        g.add(PF([[hs - 7, 20, 2], [hs + 7, 20, 2], [hs + 6, top, 4], [hs - 6, top, 4]], { w: 3.5, cw: sg * (Y.bay + 1.75), bevel: 0.6 }), DARK);
        g.add(along([[0, 0], [0, 2.8], [1.2, 2.8], [1.6, 2.2], [1.6, 0]], [hs, pt, sg * (Y.bay + 3.5)], [0, 0, sg], 6, 50), BRIGHT);   // pin heads (hex)
      }
      g.add(xform(cyl(-Y.bay - 3.6, Y.bay + 3.6, 1.8, { seg: 10 }), { rot: [0, 90, 0], move: [hs, pt, 0] }), BRIGHT);              // hinge pin (along w)
    }
    // panel screws, louvres on the rear panel
    for (const sg of [1, -1]) {
      for (const s of [Y.sh0 + 10, seamA - 10, seamA + 10, seamB - 10, seamB + 10, Y.sh1 - 14]) g.add(capScrew([s, 12, sg * 30.2], [0, 0, sg], 1.5, 1), DARK);
    }
    // mid panel: a bolted service hatch each side, a stencil on the right
    for (const sg of [1, -1]) {
      g.add(PF(rrect(236, 322, 4, 20, 3), { w: 1.4, cw: sg * 30.3, bevel: 0.5 }), ARMOR);
      for (const [s, t] of [[240, 8], [240, 16], [318, 8], [318, 16]]) g.add(capScrew([s, t, sg * 31], [0, 0, sg], 1.2, 0.8), DARK);
    }
    g.add(label('HEAT SINK', { at: [279, 12, 31], ...RIGHT, h: 2.8, sw: 0.45, proud: 0.12, sink: 0.2 }), DARK);
    g.add(label('6 FIN · 70°', { at: [279, 7.4, 31], ...RIGHT, h: 2, sw: 0.34, proud: 0.12, sink: 0.2 }), DARK);
    // three 45° safety bands across the front panel (they wrap its sides and wall tops, not the bay)
    const skin = SC(full.map(([w, t]) => [w + Math.sign(w) * 0.45, t > 5 ? t + 0.45 : t - 0.3]), seamB + 0.4, Y.sh1 - 6, { bevel: 1.6 });
    for (let i = 0; i < 3; i++) g.add(cut(intersect(skin, slab(366 + i * 26, 12, 12)), [cutters.box([366 + i * 26, 22, 0], [120, 30, 2 * Y.bay - 0.9])]), SAFE);
    // rod bushings (bronze) in outrigger housings for the ram's four guide rods
    for (const [t, w] of [[22, 41], [22, -41], [-22, 41], [-22, -41]]) {
      g.add(cb([Y.sh1 - 22, t, w * 0.92], [44, 16, 14], 3), DARK);
      g.add(tube(Y.sh1 - 6, Y.sh1 + 2, 9, 6.4, { t, w, seg: 18 }), BRASS);
      g.add(hexBolt([Y.sh1 - 30, t + Math.sign(t) * 8, w * 0.92], [0, Math.sign(t), 0], 2, 1.6), BRIGHT);
    }
    // braided hydraulic lines from the furnace front face along the lower right of the shroud, in under it at the front
    for (const k of [0, 1]) {
      const P = [[F1 + 1, -10 + k * 6.5, -32.5], [76, -6 + k * 5.5, -33.5], [200, -5 + k * 5.5, -33], [326, -6 + k * 5.5, -33], [398, -33 + k * 3, -22 - k * 5]];   // the left side (seen in first person)
      // braided steel hose with orange heat sleeves (black hoses vanished against the black chassis)
      g.add(sweep(P, 2.2, { seg: 72, radial: 8 }), BRIGHT);
      for (const [a, b] of [[0.12, 0.2], [0.45, 0.53], [0.78, 0.86]]) { const n = 8, pts = []; for (let j = 0; j <= n; j++) { const u = a + (b - a) * j / n, f = u * (P.length - 1), i0 = Math.min(P.length - 2, Math.floor(f)), r = f - i0; pts.push([0, 1, 2].map((c) => P[i0][c] + (P[i0 + 1][c] - P[i0][c]) * r)); } g.add(sweep(pts, 2.7, { seg: 10, radial: 8 }), SAFE); }
      g.add(along([[0, 0], [0, 3.8], [5, 3.8], [5.5, 3.2], [8, 3.2], [8, 0]], P[0], [1, 0, 0], 6, 50), BRASS);
      g.add(along([[0, 0], [0, 3.6], [6, 3.6], [6.5, 3], [8, 3], [8, 0]], [P[4][0], P[4][1] + 6, P[4][2]], [0, -1, 0], 6, 50), BRASS);
    }
    for (const s of [118, 268]) { g.add(cb([s, -2, -34], [6, 16, 4.4], 1), DARK); g.add(capScrew([s, -2, -36.3], [0, 0, -1], 1.2, 0.8), BRIGHT); }   // line clamps
    // angled foregrip on a short rail
    g.add(cb([250, -33, 0], [120, 6, 22], 1.2), DARK);
    for (let i = 0; i < 10; i++) g.add(cb([196 + i * 11.6, -37, 0], [5.6, 2.6, 20], 0.5), DARK);
    g.add(PF([[210, -38, 2], [290, -38, 2], [288, -50, 6], [278, -61, 6], [262, -63, 4], [214, -42, 3]], { w: 26, bevel: 3.5, curveSeg: 5 }), GRIP);
    for (let i = 0; i < 4; i++) g.add(obox([224 + i * 9.5, -46.6 - i * 4.3, 0], [0.91, -0.41, 0], [0.41, 0.91, 0], [3, 1.6, 27]), RUB);
    // seal clamp blocks either end of the seal
    for (const s of [Y.seal[0] - 4, Y.seal[1] + 3]) { g.add(cb([s, Y.shT + 1.6, 0], [6, 3.2, 26], 1), DARK); for (const sg of [1, -1]) g.add(capScrew([s, Y.shT + 3.2, sg * 9.5], [0, 1, 0], 1.2, 0.8), BRIGHT); }
  }

  // ======================================================================== fins (fx_fin1-6)
  for (let i = 0; i < 6; i++) {
    const [hs, hb] = finH(i), pt = hb + Y.finTh / 2, L = Y.finL, W = Y.finW;
    // raised, the rear fins lean back further (54° .. 74° rear to front) so from behind the stack the tower reads as six
    // stepped plates instead of the rear one hiding the rest
    const f = g.part('fx_fin' + (i + 1), { pivot: [hs, pt, 0], extras: { open: -(54 + 4 * i), hinge: 'w', order: i } });
    const tail = hs - L, w2 = W / 2 - 0.4;
    const holes = [0, 1, 2].map((k) => [[tail + 16 + k * 26, -9, 3], [tail + 34 + k * 26, -9, 3], [tail + 34 + k * 26, 9, 3], [tail + 16 + k * 26, 9, 3]]);
    f.add(PL([[tail, -w2 + 6, 6], [tail + 6, -w2, 3], [hs - 6, -w2, 2], [hs - 6, w2, 2], [tail + 6, w2, 3], [tail, w2 - 6, 6]], { h: Y.finTh, ct: pt, bevel: 1, holes }), ARMOR);
    f.add(xform(tube(-w2 + 2, w2 - 2, 3.4, 2.0, { seg: 14 }), { rot: [0, 90, 0], move: [hs - 2.5, pt, 0] }), STEEL);   // rolled knuckle round the pin
    f.add(cb([tail + 48, pt + Y.finTh / 2 + 0.5, 0], [L - 50, 1.2, 3], 0.4), STEEL);                                 // spine rib
    // heat inserts inside the lightening slots and a tail lip: dim at rest, hot in overload (premium.mat glow_vermilion)
    for (let k = 0; k < 3; k++) f.add(cb([tail + 25 + k * 26, pt, 0], [16, Y.finTh - 1.2, 16], 0.6), HEAT);
    f.add(cb([tail - 0.4, pt, 0], [1.6, Y.finTh - 1, W - 18], 0.3), HEAT);
    // the exposed step of each fin (the rear fin lies on top): a gunmetal spreader band, a stencilled number, two rivets
    f.add(cb([hs - 17, pt + Y.finTh / 2 + 0.3, 0], [18, 0.8, W - 8], 0.3), STEEL);
    f.add(label(String(i + 1), { at: [hs - 17, pt + Y.finTh / 2 + 0.7, 13], ...TOPR, h: 4.2, sw: 0.75, proud: 0.12, sink: 0.12 }), SAFE);
    for (const sw of [-1, 1]) f.add(rivet([hs - 17, pt + Y.finTh / 2 + 0.7, sw * 4], [0, 1, 0], 1.0), BRIGHT);
  }

  // ======================================================================== the spine seal (fx_seal)
  {
    const [s0, s1] = Y.seal, t0 = Y.shT, top = t0 + 3;
    const sl = g.part('fx_seal', { pivot: [(s0 + s1) / 2, t0 + 1.5, 0] });
    sl.add(PL([[s0, -7, 3], [s1, -7, 3], [s1, 7, 3], [s0, 7, 3]], { h: 3, ct: t0 + 1.5, bevel: 0.7 }), BRIGHT);
    for (let i = 0; i < 6; i++) sl.add(rivet([s0 + 7 + i * ((s1 - s0 - 14) / 5), top, (i % 2 ? 1 : -1) * 4.6], [0, 1, 0], 1.3), BRASS);
    // 禁止解封 written down the strap (upright for the shooter, read from the far end), a big 封 at the near end
    const chars = ['禁', '止', '解', '封'], sc = (s0 + s1) / 2 + 52;
    chars.forEach((c, k) => sl.add(label(c, { at: [sc - k * 12, top, 0], ...TOPR, hz: 9.4, swz: 0.9, proud: 0.18, sink: 0.12 }), RED));
    sl.add(label('封', { at: [s0 + 24, top, 0], ...TOPR, hz: 11, swz: 1.2, proud: 0.2, sink: 0.12 }), RED);
    sl.add(label('M04-0721', { at: [(s0 + s1) / 2 - 22, top, 4.4], ...TOP, h: 2.2, sw: 0.36, proud: 0.12, sink: 0.12 }), DARK);
    // lead seals: a wire loop and a stamped disc hanging off the right edge at each end
    for (const s of [s0 + 3, s1 - 3]) {
      sl.add(sweep([[s, top - 0.2, 4], [s, top + 1.6, 6.5], [s, top - 1.2, 8.4]], 0.35, { seg: 10, radial: 5 }), BRIGHT);
      sl.add(along([[0, 0], [0, 3.2], [1.4, 3.2], [1.6, 2.6], [1.6, 0]], [s, top - 3, 8.6], [0, 0, 1], 12), DARK);
    }
  }

  // ======================================================================== 樞錘 ram (fx_ram)
  {
    const ram = g.part('fx_ram', { pivot: [Y.ram0, 0, 0], extras: { open: [0.06, 0, 0] } });
    const H = Y.ramH, r0 = Y.ram0, y1 = r0 + 30, f1 = Y.ram1;
    for (const [t, w] of [[22, 41], [22, -41], [-22, 41], [-22, -41]]) {
      ram.add(cyl(Y.sh1 - 80, r0 + 8, 6, { t, w, seg: 16 }), BRIGHT);                                        // guide rods
      ram.add(lathe([[r0 - 2, 0], [r0 - 2, 8], [r0 + 6, 8], [r0 + 6, 0]], { t, w, seg: 16 }), DARK);          // rod collars
    }
    ram.add(cut(cb([(r0 + y1) / 2, 0, 0], [y1 - r0, 2 * H + 6, 98], 5), [cyl(r0 - 5, y1 + 5, 12, { b: 0 })]), STEEL);   // guide yoke
    for (const sg of [1, -1]) for (const t of [-14, 14]) ram.add(hexBolt([(r0 + y1) / 2, t, sg * 49], [0, 0, sg], 2.4, 1.8), BRIGHT);
    // hammer block 70 x 70, 6 mm chamfers, two fullers a side
    const b1 = f1 - 18, fullers = [];
    for (const sg of [1, -1]) for (const t of [-15, 15]) fullers.push(cb([638, t, sg * (H + 0.5)], [130, 6, 5], 2));
    ram.add(cut(cb([(y1 + b1) / 2, 0, 0], [b1 - y1, 2 * H, 2 * H], 6), [...fullers, cyl(y1 - 5, f1 + 5, 11.2, { b: 0 })]), BLACK);
    for (const sg of [1, -1]) {
      ram.add(PF(rrect(f1 - 92, f1 - 44, -10.5, 10.5, 3), { w: 1.6, cw: sg * (H + 0.6), bevel: 0.5 }), BRIGHT);
      ram.add(label('樞', { at: [f1 - 68, 0, sg * (H + 1.4)], ...(sg > 0 ? RIGHT : LEFT), hz: 16, swz: 1.5, proud: 0.4, sink: 0.2 }), BLACK);
      for (const [s, t] of [[f1 - 89, -7.5], [f1 - 89, 7.5], [f1 - 47, -7.5], [f1 - 47, 7.5]]) ram.add(rivet([s, t, sg * (H + 1.4)], [0, 0, sg], 0.9), BLACK);
    }
    const skinR = cb([(y1 + b1) / 2, 0, 0], [b1 - y1, 2 * H + 0.9, 2 * H + 0.9], 6.2);
    for (const s of [y1 + 16, y1 + 40]) ram.add(intersect(skinR, slab(s, 0, 12)), SAFE);
    // collar with a ring of hex bolts, the steel striking ring, the black waffle face round the bore
    ram.add(cb([f1 - 13, 0, 0], [10, 2 * H + 5, 2 * H + 5], 6.5), DARK);
    for (const sg of [1, -1]) for (const k of [-1, 0, 1]) {
      ram.add(hexBolt([f1 - 13, k * 20, sg * (H + 2.5)], [0, 0, sg], 2.2, 1.6), BRIGHT);
      ram.add(hexBolt([f1 - 13, sg * (H + 2.5), k * 20], [0, sg, 0], 2.2, 1.6), BRIGHT);
    }
    ram.add(cut(cb([f1 - 4, 0, 0], [8, 2 * H + 2, 2 * H + 2], 6.5), [cyl(f1 - 9, f1 + 1, 11, { b: 0 })]), BRIGHT);
    ram.add(cut(cb([f1 + 1.5, 0, 0], [3, 2 * H - 6, 2 * H - 6], 4), [cyl(f1 - 5, f1 + 8, 11, { b: 0 })]), BLACK);
    const n = 6, step = (2 * H - 12) / n;
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      const t = -H + 6 + step * (a + 0.5), w = -H + 6 + step * (b + 0.5);
      if (Math.hypot(t, w) < 14) continue;
      const bulge = 1.2 * (1 - (t * t + w * w) / (2 * H * H));
      ram.add(along([[0, step * 0.5], [1.4 + bulge, step * 0.2], [1.6 + bulge, 0]], [f1 + 2.8, t, w], [1, 0, 0], 4, 60), BLACK);
    }
    ram.add(tube(f1 - 2, f1 + 3.4, 13.6, 10.6, { seg: 28 }), BRIGHT);
    // front sight on the ram top between protective ears, a lifting lug underneath
    ram.add(cb([f1 - 34, H + 3, 0], [16, 6, 22], 2), DARK);
    for (const sg of [1, -1]) ram.add(cb([f1 - 34, H + 10, sg * 8], [8, 10, 3], 1), DARK);
    ram.add(cb([f1 - 34, H + 11, 0], [3, 12, 2.4], 0.5), BRIGHT);
    ram.add(cb([f1 - 34, H + 16.4, 0], [3, 1.4, 2.4], 0.3), SAFE);
    ram.add(PF([[f1 - 120, -H, 3], [f1 - 96, -H, 3], [f1 - 100, -H - 9, 4], [f1 - 116, -H - 9, 4]], { w: 16, bevel: 1.5, holes: [[[f1 - 112, -H - 2.5, 2], [f1 - 104, -H - 2.5, 2], [f1 - 104, -H - 6, 2], [f1 - 112, -H - 6, 2]]] }), DARK);
  }

  // ======================================================================== energy cell (mag)
  {
    const [cs, ct] = Y.cell, e = 38, hT = e * Math.sqrt(3) / 2;
    const mag = g.part('mag', { pivot: [cs, ct, 0], extras: { drop: true } });
    const tri = (k, r) => rpoly([[cs + (hT * 2 / 3) * k, 0, r], [cs - (hT / 3) * k, -e / 2 * k, r], [cs - (hT / 3) * k, e / 2 * k, r]]);
    const L0 = ct + 12, L1 = ct - 108;
    const prism = (k, r, t0, t1, b = 1) => PL(tri(k, r), { h: t0 - t1, ct: (t0 + t1) / 2, bevel: b });
    mag.add(prism(1, 5, L0, L0 - 30), STEEL);
    mag.add(prism(0.98, 4.6, L0 - 30, L1 + 14, 0.8), ARMOR);
    mag.add(prism(1.03, 5.2, L1 + 14, L1), STEEL);
    for (const t of [L0 - 46, L0 - 54, L0 - 62]) mag.add(prism(1.015, 5, t, t - 3, 0.6), DARK);
    mag.add(prism(1.012, 4.8, L0 - 34, L0 - 42, 0.4), SAFE);
    // charge windows on the two front faces: four glowing cells behind a dark lens strip
    for (const sg of [1, -1]) {
      const nrm = [0.5, 0, sg * 0.866], tan = [-0.866, 0, sg * 0.5], c = [cs + hT / 6, 0, sg * e / 4];
      for (let k = 0; k < 4; k++) mag.add(obox([c[0] + nrm[0] * 0.35, L0 - 72 - k * 7, c[2] + nrm[2] * 0.35], tan, [0, 1, 0], [10, 4.6, 1.2]), GLOW);
      mag.add(obox([c[0] + nrm[0] * 0.2, L0 - 82.5, c[2] + nrm[2] * 0.2], tan, [0, 1, 0], [13, 31, 0.8]), DARK);
    }
    for (const w of [-6, 0, 6]) mag.add(along([[0, 1.4], [5, 1.4], [5.5, 0]], [cs, L0, w], [0, 1, 0], 8), BRASS);
    mag.add(sweep([[cs - 8, L1 - 0.5, -8], [cs - 12, L1 - 9, -4], [cs - 12, L1 - 9, 4], [cs - 8, L1 - 0.5, 8]], 1.8, { seg: 16, radial: 8 }), FAB);
  }

  // ======================================================================== sockets & meta
  g.socket('grip_r', [Y.gripS, -78, 0], { rot: [0, 0, -15] });
  g.socket('grip_l', [240, -56, 0]);
  g.socket('magwell', [Y.cell[0], -70, 0]);
  g.socket('charge', [-172, 18, 40]);
  g.socket('muzzle', [Y.muzzle, 0, 0]);
  g.socket('ram', [Y.ram1 + 3, 0, 0], { ride: 'fx_ram' });
  g.socket('droneL', [Y.ram1 - 70, 6, -Y.ramH - 34], { ride: 'fx_ram' });
  g.socket('droneR', [Y.ram1 - 70, 6, Y.ramH + 34], { ride: 'fx_ram' });
  g.socket('core', [(w0 + w1) / 2, (wt0 + wt1) / 2, -FW - 1]);
  g.socket('door', [(Y.door[0] + Y.door[1]) / 2, FT + 2, 0]);
  g.socket('slitR', [-48, FT - 5, FW - 4]);
  g.socket('slitL', [-48, FT - 5, -FW + 4]);
  g.socket('gauge', [32, 24, -FW - 3]);
  g.socket('seal', [(Y.seal[0] + Y.seal[1]) / 2, Y.shT + 3, 0]);
  g.socket('tower', [Y.fin0 + 40, 70, 0]);
  for (let i = 0; i < 6; i++) { const [hs, hb] = finH(i); g.socket('fin' + (i + 1), [hs - 4, hb + Y.finTh + 1, 0]); }
  g.socket('cell', [Y.cell[0], FB - 6, 0]);
  g.socket('sight_rear', [F0 + 12, FT + 12.5, 0]);
  g.socket('sight_front', [Y.ram1 - 34, Y.ramH + 17, 0], { ride: 'fx_ram' });
  g.meta({
    grip: 'heavy', support: 'angled', reload: 'mag', chargeSide: 'right', series: 'qiming',
    notes: 'M04 焰樞．破限. fx_fin1-6: heat-sink fins on hinge pins along w (open -70 = raised 70°; v 90/70 = the unbound 90°; order 0 = rear, '
      + 'rising rear to front, the rear fin on top of the stack). fx_doorL / fx_doorR: furnace doors, slide apart 22 mm (setPart("fx_door*")). '
      + 'fx_ram: the 樞錘, slides forward 60 mm (fire recoil -8 mm is procedural). fx_seal: spine seal (flies off on 破限). fx_core: window pane + '
      + 'molten core (obsidian = pv_core lava, hero). fx_needle: 樞能 gauge needle (open -270 about w). mag: triangular energy cell. Sockets: ram '
      + '(face), droneL / droneR (ram docks), core, door, slitL / slitR (爐環 jets), gauge, seal, tower, fin1-6, cell.',
  });

  // bake: QEM pass over the dense pieces, pre-tessellated skins, short AO reach, m4's post-bake (curvature wear)
  const build0 = g.build.bind(g);
  g.build = (o = {}) => {
    const root = build0({ ...o, bake: false });
    const tp = g.lod === 1;
    if (o.decimate !== false) {
      let before = 0, after = 0;
      root.traverse((m) => {
        if (!m.isMesh || /^(glow_|glass)/.test(m.userData.mat)) return;
        const n = m.geometry.attributes.position.count / 3;
        before += n;
        if (tp || n > 400) m.geometry = tp ? decimate(m.geometry, 8, 0.1, true, 0.15) : decimate(m.geometry, 0.12);
        after += m.geometry.attributes.position.count / 3;
      });
      if (o.log !== false) console.log(`yanshu decimate: ${Math.round(before)} -> ${Math.round(after)} triangles`);
    }
    if (o.bake !== false) {
      const meshes = [];
      root.traverse((m) => { if (m.isMesh) meshes.push(m); });
      const tess = (o.tessellate ?? TESS) * 0.001 * (tp ? 8 : 1);
      for (const m of meshes) {
        let geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
        for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
        m.geometry = /^(glow_|glass)/.test(m.userData.mat) ? geo : tessellateFat(geo, /^(ceramic|rubber|paint_)/.test(m.userData.mat) ? tess : tess * 1.7, 0.0012);
      }
      const glassy = (m) => /^(glass|glow_|obsidian)/.test(m.userData.mat);
      bakeMeshes(meshes, { tessellate: 0, aoDist: 0.026, rays: 32, log: true, minHeight: (m) => (glassy(m) ? 0.004 : 0) });
      postBake(root, {}, WEAR);
      root.traverse((m) => {
        const B = m.isMesh && m.geometry.attributes._bake?.array;
        if (B && glassy(m)) for (let i = 0; i < B.length; i += 4) { B[i] = Math.max(B[i], 225); B[i + 1] = 0; B[i + 2] = 0; }
      });
    }
    return root;
  };
  return g;
}

const TESS = 16;
/** QEM simplification of a built (metre) mesh to err mm, position + normal weighted (nw) */
function decimate(geo, err, nw = 0.3, prune = false, ratio = 0) {
  for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
  const w = mergeVertices(geo.index ? geo.toNonIndexed() : geo, 1e-7);
  const P = w.attributes.position.array, N = w.attributes.normal.array;
  const Pmm = new Float32Array(P.length);
  for (let i = 0; i < P.length; i++) Pmm[i] = P[i] * 1000;
  const target = ratio ? Math.max(3, Math.floor(w.index.count * ratio / 3) * 3) : 0;
  const [I] = MeshoptSimplifier.simplifyWithAttributes(Uint32Array.from(w.index.array), Pmm, 3, N, 3, [nw, nw, nw], null, target, err, prune ? ['ErrorAbsolute', 'Prune'] : ['ErrorAbsolute']);
  const pos = new Float32Array(I.length * 3), nrm = new Float32Array(I.length * 3);
  for (let k = 0; k < I.length; k++) for (let c = 0; c < 3; c++) { pos[k * 3 + c] = P[I[k] * 3 + c]; nrm[k * 3 + c] = N[I[k] * 3 + c]; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return out;
}
/** per-material wear [curvature (1/m) mapped to full wear, cap]: the ceramic chips a little, the safety paint scuffs to steel */
const WEAR = {
  '*:steel': [1 / 500, 0.8], '*:steel_dark': [1 / 500, 0.6], '*:steel_bright': [1 / 600, 0.3], '*:black_chrome': [1 / 500, 0.5], '*:ceramic_armor': [1 / 800, 0.3],
  '*:paint_safety': [1 / 500, 0.7], '*:paint_red': [1 / 600, 0.3], '*:rubber': [1 / 700, 0.3], '*:polymer_grip': [1 / 600, 0.45], '*:polymer': [1 / 600, 0.5],
  '*:brass': [1 / 500, 0.6], '*:ceramic': [0, 0], '*:fabric_black': [0, 0], '*:obsidian': [0, 0],
};
