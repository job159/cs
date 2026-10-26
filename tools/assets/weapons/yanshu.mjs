// 焰樞．破限 Pyrecore Unbound — M04 神兵, 啟明工坊 flagship (docs/PREMIUM_WEAPONS.md M04, §1.15.1: not a lance — a forge-core
// cannon). A heavy bullpup anti-materiel skeleton (the energy cell behind the grip), 1,250 mm, glazed white ceramic armour,
// safety orange, gunmetal, brass fasteners, a molten core seen through the furnace window. From the butt forward:
//   - stock: a skeleton stock (a ceramic top bar with lightening pockets under a height-adjustable ceramic cheek piece, a
//     truss strut), a length-of-pull spacer (guide rods, threaded spindle, knurled thumbwheel, lock lever), a grey
//     honeycomb recoil pad; the rear receiver in gunmetal with ceramic cheek panels (seams, counterbored screws, rivet
//     rows, a raised plate with a rubber grip field, stencils), the right-side charging handle (bolt) in its slot;
//   - the furnace (爐膛, 160 x 90 x 80 under a 16 mm vent crown): a gunmetal chassis clad in ceramic plates split into
//     sub-panels; on the LEFT face (the flank first person sees) the 90 x 40 furnace window (fx_core: a steel bezel on
//     six brass screws, a clear pane, the banded molten core cylinder — obsidian / pv_core lava — over an ember grate),
//     the 樞能 gauge (fx_needle, open brass bezel, white dial, glowing red zone), a recessed service hatch, a riveted
//     skirt with the HOT tag; on top two sliding doors (fx_doorL / fx_doorR, 0 -> 22 mm apart) over a bright grille and
//     five red-hot heating rods, louvred vent slits along each upper edge (the 爐環 fire jets); on the right a raked
//     radiator over the glowing vent and the 焰樞 / QIMING WORKS plate; the pistol grip (rubber hex pads, ceramic
//     backstrap), a pinned guard and a machined trigger; the triangular energy cell (mag, 38 x 120, framed charge window
//     with a level scale) behind the grip;
//   - the barrel shroud (50 -> 455): ceramic upper armour in three panels (the rear one carries the spine seal fx_seal:
//     a riveted steel strap with 禁止解封 in raised red, two lead seals; the mid one a recessed service hatch each side),
//     a gunmetal lower chassis with lightening slots, machined pockets and a rib field, two braided hydraulic lines
//     (bulkhead nuts, banjo ends), the angled foregrip (ceramic end cap) on a short rail, three 45° safety-orange bands;
//     on top the fin bay with six heat-sink fins (fx_fin1-6, 110 x 45 x 4, lying back as a stepped stack, the rear fin on
//     top; ceramic hinge ears, brass pins; guarded glowing slots that heat up in overload; open -70 = raised into the
//     heat tower); the ram's two hydraulic cylinders between the rod housings;
//   - the 樞錘 ram (fx_ram, slides 0 -> 60 mm on four Ø12 guide rods out of bronze bushings, pushed by two piston rods): a
//     guide yoke, a 70 x 70 gunmetal hammer block (6 mm chamfers, a top fuller, two safety bands, big bolted ceramic side
//     plates with grooves and the black / brass 樞 cartouche), a black-chrome collar on brass bolts, the slightly convex
//     striking face milled into bright pyramids on a black field round the bore; the real barrel (Ø20 / Ø14 bore) runs
//     through the ram's centre and stands 15 mm out of the face; the front sight on the ram.
// Side view, mm: s forward (towards the muzzle), t up, w right. Bore axis t = 0. Right palm (grip_r) near s = 8.
import * as THREE from 'three';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer';
import { Gun, lathe, cyl, tube, profile, section, plan, box, sphere, ring, sweep, cut, intersect, merge, xform, mirrorW, cutters } from '../lib/gunkit.mjs';
import { MeshBVH } from 'three-mesh-bvh';
import { bakeMeshes } from '../lib/bake.mjs';
import { postBake } from './m4.mjs';
import { TAU, D2R, along, domeAt, vadd, vsub, vmul, vlen, vnorm, vlerp, insetPoly } from '../lib/sculpt.mjs';

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
const hexBolt = (p, n, r = 3, h = 2.2) => along([[0, r], [h * 0.8, r], [h, r * 0.82], [h, 0]], p, n, 6, 50);
/** socket-head cap screw (counterbored look: a ring with a hex hole read) */
const capScrew = (p, n, r = 2.2, h = 1.6) => along([[0, r], [h * 0.85, r], [h, r * 0.85], [h, r * 0.48], [h * 0.5, r * 0.42], [h * 0.5, 0]], p, n, 10, 50);
const rivet = (p, n, r = 1.6) => along([[-0.3, r], [r * 0.31, r * 0.82], [r * 0.62, 0]], p, n, 8, 70);
/** counterbore cutter on a face (outward normal n at p) for a head of radius r: d deep, a 0.3 mm lead-in chamfer */
const cbore = (p, n, r, d = 1.3) => along([[-d, 0], [-d, r + 0.45], [-0.3, r + 0.45], [0, r + 0.75], [0.8, r + 0.75], [0.8, 0]], p, n, 12);
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
      for (let i = 0; i < 15; i++) g.add(obox([-89.6 + i * 4.8, 8, -WS * (FW - 5.6)], [0, 1, 0], [0.906, 0, 0.423], [27.4, 0.8, 8.4]), STEEL);   // slats raked 25°
      g.add(cb([-56, 8, -WS * (FW - 1.2)], [71, 2.2, 2], 0.4), BRIGHT);
      g.add(cb([-56, 8, -WS * (FW - 10.6)], [70, 26, 1], 0.2), GLOW);
      // maker plate: dark plate, white raised lettering, brass rivets
      g.add(PF(rrect(-8, 44, -27, -5, 2), { w: 1.2, cw: -WS * (FW + 0.4), bevel: 0.4 }), DARK);
      g.add(label('焰樞', { at: [18, -12, -WS * (FW + 1)], ...OSIDE, hz: 9.6, swz: 1.05, proud: 0.25, sink: 0.2 }), WHITE);
      g.add(label('QIMING WORKS M04', { at: [18, -22.5, -WS * (FW + 1)], ...OSIDE, h: 2.7, sw: 0.52, proud: 0.22, sink: 0.2 }), WHITE);
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

    // vent crown (爐冠) on the roof ahead of the doors: a raked ceramic cowl 16 mm tall round the sight channel, louvres
    // on its top and flanks over hot liners (glow_vermilion: dark at rest, red-hot in overload); it makes the furnace
    // the gun's mass
    {
      const K0 = 6, K1 = 46, KT = FT + 16, km = (K0 + K1) / 2;
      let crown = PF([[K0, FT - 0.5, 0], [K1 + 3, FT - 0.5, 0], [K1 - 1, KT - 2.5, 3], [K1 - 5, KT, 3], [K0 + 5, KT, 3], [K0, KT - 5, 3]], { w: 62, bevel: 1.5 });
      const cuts = [cutters.box([km, KT, 0], [K1 - K0 + 14, 2 * (KT - FT - 8), 12.4])];
      for (const sg of [1, -1]) {
        for (let i = 0; i < 6; i++) cuts.push(cb([K0 + 8 + i * 5.4, KT, sg * 15.5], [2.6, 9, 13], 0.3));
        for (let i = 0; i < 3; i++) cuts.push(cb([K0 + 9.3 + i * 6.3, FT + 7.6, sg * 31], [2.6, 9, 8], 0.3));
      }
      const ksc = [1, -1].flatMap((sg) => [[[K0 + 3.2, FT + 10.4, sg * 31], [0, 0, sg]], [[K1 - 7, FT + 10.4, sg * 31], [0, 0, sg]]]);
      for (const [p, n] of ksc) { cuts.push(cbore(p, n, 1.3)); g.add(sunk(p, n, 1.3), BRASS); }
      crown = cut(crown, cuts);
      g.add(crown, ARMOR);
      for (const sg of [1, -1]) {
        g.add(cb([km + 1.5, KT - 4.3, sg * 15.5], [32, 0.6, 13.4], 0.2), HEAT);
        g.add(cb([K0 + 15.6, FT + 7.6, sg * 27.3], [16, 9.4, 0.6], 0.2), HEAT);
      }
      g.add(cb([km, FT + 8.2, 0], [K1 - K0 - 2, 0.6, 12], 0.2), BRIGHT);                                   // sight channel floor
      // the shooter-facing rear face: a safety-orange HOT tag each side of the channel
      for (const sg of [1, -1]) {
        g.add(cb([K0 - 0.3, FT + 5.4, sg * 18.5], [0.8, 6.4, 12], 0.25), SAFE);
        g.add(label('HOT', { at: [K0 - 0.8, FT + 5.4, sg * 18.5], u: [0, 0, 1], v: [0, 1, 0], n: [-1, 0, 0], h: 3.4, sw: 0.55, proud: 0.12, sink: 0.12 }), DARK);
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
    for (let k = 0; k < 4; k++) { const s = cy0 + 14 + k * 14; core.add(lathe([[s - 1, 15.2], [s - 1, 16.1], [s - 0.5, 16.6], [s + 0.5, 16.6], [s + 1, 16.1], [s + 1, 15.2]], { t: ct, w: cw, seg: 28 }), DARK); }
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
      const r = GR - 5.2, aa = a * D2R;
      g.add(label(txt, { at: [GC[0] + Math.cos(aa) * r, GC[1] + Math.sin(aa) * r, gz(1.2)], ...SIDE, h: 1.7, sw: 0.3, proud: 0.12, sink: 0.08 }), DARK);
    }
    g.add(label('樞', { at: [GC[0], GC[1] - 6.6, gz(1.2)], ...SIDE, hz: 2.6, swz: 0.26, proud: 0.1, sink: 0.08 }), RED);
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

  // doors (fx_doorL / fx_doorR): slide apart 22 mm on the rails; machined finger grooves, a brass pull lug, rivets, a
  // safety-orange slide arrow and a HOT stencil
  for (const [nm, sg] of [['fx_doorL', -1], ['fx_doorR', 1]]) {
    const d = g.part(nm, { pivot: [(Y.door[0] + Y.door[1]) / 2, FT, sg * 13], extras: { open: [0, 0, sg * 0.022], order: sg > 0 ? 1 : 0 } });
    const s0 = Y.door[0] + 1, s1 = Y.door[1] - 1, a = sg * 0.4, b = sg * 27;
    let plate = PL([[s0, Math.min(a, b), 2], [s1, Math.min(a, b), 2], [s1, Math.max(a, b), 2], [s0, Math.max(a, b), 2]], { h: 6, ct: FT + 1, bevel: 1.2 });
    plate = cut(plate, [0, 1, 2, 3].map((i) => cb([s0 + 14 + i * 4.2, FT + 4, sg * 14], [1.8, 1.8, 18], 0.4)));
    d.add(plate, ARMOR);
    d.add(cb([s1 - 12, FT + 4.3, sg * 18], [13, 0.8, 9], 0.3), STEEL);
    d.add(cb([s1 - 12, FT + 6, sg * 18], [9, 3.2, 6], 1), BRASS);
    for (const s of [s1 - 17, s1 - 7]) d.add(capScrew([s, FT + 4.7, sg * 18], [0, 1, 0], 0.9, 0.6), BRIGHT);
    for (const s of [s0 + 4, s1 - 4]) for (const w of [22, 5]) d.add(rivet([s, FT + 4, sg * w], [0, 1, 0], 1.1), BRIGHT);
    d.add(label(sg < 0 ? '←' : '→', { at: [s0 + 37, FT + 4, sg * 14], ...TOPR, h: 7, sw: 1.2, proud: 0.14, sink: 0.12 }), SAFE);
    d.add(label('HOT', { at: [s0 + 48.5, FT + 4, sg * 14], ...TOPR, h: 3.4, sw: 0.6, proud: 0.14, sink: 0.12 }), DARK);
    d.add(cb([(s0 + s1) / 2, FT - 1, sg * 26.5], [s1 - s0 - 4, 3, 2.4], 0.4), STEEL);
    d.add(cb([(s0 + s1) / 2, FT + 1, sg * 0.9], [s1 - s0 - 3, 5, 0.8], 0.2), DARK);   // the meeting lip (the 6 mm crack shows the glow under it)
  }

  // ======================================================================== rear receiver, stock
  {
    g.add(PF([[F0 + 2, -44, 4], [F0 + 2, 38, 4], [-150, 32, 10], [-300, 30, 8], [-312, 20, 6], [-312, -48, 6], [-210, -52, 10], [-130, -48, 6]], { w: 40, bevel: 2.5 }), STEEL);
    const panel = [[-122, -40, 5], [-122, 30, 6], [-160, 26, 8], [-292, 24, 6], [-300, 16, 4], [-300, -42, 5], [-212, -46, 8], [-136, -42, 5]];
    for (const sg of [1, -1]) {
      // cheek panel: a seam ahead of the armour plate, screws in counterbores (brass on the eye side), a rivet row
      // along the bottom; the eye side carries a bright trim inlaid in a groove under its top edge, ending in rivets
      const fw = sg * 23.8, N = [0, 0, sg], scr = [[-130, -36], [-130, 22], [-292, -36], [-290, 15], [-160, -38]].map(([s, t]) => [s, t, fw, N, 1.5]);
      let pn = PF(panel, { w: 4.4, cw: sg * 21.6, bevel: 1.2 });
      const cuts = [groove([-180, -43, fw], [-180, 25, fw], N), ...scr.map(([s, t, w, n, r]) => cbore([s, t, w], n, r))];
      if (sg > 0) cuts.push(cutters.slotW(-238, -162, 18, 6.4, 30, 22));   // charging-handle slot
      else cuts.push(groove([-284, 19.5, fw], [-190, 19.5, fw], N, 2, 0.7));
      pn = cut(pn, cuts);
      g.add(pn, ARMOR);
      for (const [s, t, w, n, r] of scr) g.add(sunk([s, t, w], n, r), sg < 0 ? BRASS : BRIGHT);
      g.add(qc([-130, 22, fw + sg * 0.1], N), SAFE);
      g.add(rivetRow([-284, -40.4, fw], [-194, -40.4, fw], N, 8, 1), BRIGHT);
      if (sg < 0) {
        g.add(cb([-237, 19.5, sg * 23.45], [94, 1.3, 0.6], 0.2), BRIGHT);
        for (const s of [-287.5, -186.5]) g.add(rivet([s, 19.5, fw], N, 1.2), BRASS);
      } else g.add(cut(cb([-200, 18, 23.2], [80, 8.4, 1.4], 0.3), [cutters.slotW(-238, -162, 18, 6.4, 30, 22)]), BRIGHT);   // slot liner
      // stencils ahead of the seam
      g.add(label('TORQUE', { at: [-139, -12, sg * 23.9], ...(sg > 0 ? RIGHT : LEFT), h: 2, sw: 0.34, proud: 0.12, sink: 0.2 }), DARK);
      g.add(label('12 N·M', { at: [-139, -16.5, sg * 23.9], ...(sg > 0 ? RIGHT : LEFT), h: 2, sw: 0.34, proud: 0.12, sink: 0.2 }), DARK);
    }
    // a raised armour plate on each cheek (four sunk screws, a recessed grip field of ribs), two safety bands, stencils
    for (const sg of [1, -1]) {
      const fw = sg * 25.4, N = [0, 0, sg], scr = [[-281, -27], [-281, -11], [-191, -27], [-191, -11]].map(([s, t]) => [s, t, fw, N, 1.3]);
      let ap = PF(rrect(-286, -186, -32, -6, 4), { w: 2, cw: sg * 24.4, bevel: 0.7 });
      ap = cut(ap, [cutters.pocketW(rrect(-273, -213, -29, -9, 2.5), sg * 24.6), ...scr.map(([s, t, w, n, r]) => cbore([s, t, w], n, r, 1.1))]);
      g.add(ap, ARMOR);
      for (const [s, t, w, n, r] of scr) g.add(sunk([s, t, w], n, r, 1.1), sg < 0 ? BRASS : BRIGHT);
      for (let i = 0; i < 8; i++) g.add(cb([-268 + i * 7.1, -19, sg * 24.9], [3, 17, 1.2], 0.4), RUB);
      const sk = PF([[-176, -40, 4], [-176, 26, 6], [-150, 30, 6], [-150, -42, 4]], { w: 5.3, cw: sg * 21.6, bevel: 1.4 });
      for (const s2 of [-170, -156]) g.add(intersect(sk, slab(s2, -6, 6)), SAFE);
    }
    g.add(label('焰樞', { at: [-236, 10, -23.9], ...LEFT, hz: 9, swz: 0.8, proud: 0.16, sink: 0.2 }), DARK);
    g.add(label('M04  UNBOUND', { at: [-236, 0, -23.9], ...LEFT, h: 2.6, sw: 0.42, proud: 0.12, sink: 0.2 }), DARK);
    g.add(label('PYRECORE', { at: [-236, 10, 23.9], ...RIGHT, h: 4, sw: 0.62, proud: 0.14, sink: 0.2 }), DARK);
    g.add(label('QW-M04-0721', { at: [-236, 2.5, 23.9], ...RIGHT, h: 2.4, sw: 0.4, proud: 0.12, sink: 0.2 }), DARK);
    // the receiver top: a ceramic spine cover with grip grooves (it is under the eye in first person)
    g.add(PF([[-118, 33, 3], [-118, 39, 3], [-150, 34.5, 6], [-296, 32.5, 4], [-296, 28, 3], [-150, 30, 6]], { w: 22, bevel: 1.5 }), ARMOR);
    for (let i = 0; i < 12; i++) g.add(cb([-160 - i * 10.5, 33.6 - i * 0.12, 0], [3.2, 1.6, 18], 0.4), DARK);
    for (const sg of [1, -1]) g.add(rivetRow([-152, 34.7, sg * 8.6], [-290, 33.1, sg * 8.6], [0, 1, 0], 2, 1.1), BRASS);
    // charging handle (bolt): carrier in the slot, a stem, a T-knob
    const bolt = g.part('bolt', { pivot: [-172, 18, 24], extras: { travel: 0.062 } });
    bolt.add(cb([-172, 18, 22.5], [14, 4.4, 6], 1), BRIGHT);
    bolt.add(along([[0, 2.4], [12, 2.4], [12.5, 0]], [-172, 18, 24], [0, 0, 1], 12), BRIGHT);
    bolt.add(along([[0, 0], [0, 4.2], [1, 4.2], [1.4, 3.7], [1.8, 4.2], [3, 4.2], [3.4, 3.7], [3.8, 4.2], [5, 4.2], [5.4, 3.7], [5.8, 4.2], [8, 4.2], [9, 3], [9, 0]], [-176, 18, 36.5], [1, 0, 0], 12), POLY);
    // skeleton stock: a ceramic top bar with lightening pockets under an adjustable ceramic cheek piece (two posts, a
    // knurled height knob), a truss lower strut, the stock end plate; the length-of-pull spacer (two guide rods, a
    // threaded spindle, a knurled thumbwheel, a locking lever); the butt plate and a grey recoil pad (side ribs, a
    // honeycomb of pads on the butt)
    const SE = -428;
    let bar = PF([[-312, 14, 3], [-312, 30, 3], [SE, 32, 4], [SE, 14, 3]], { w: 34, bevel: 2 });
    bar = cut(bar, [1, -1].flatMap((sg) => [[-330, -352], [-357, -379], [-384, -406]].map(([a2, b2]) => cutters.pocketW(rrect(b2, a2, 18.5, 27.5, 3), sg * 15.6))));
    g.add(bar, ARMOR);
    for (const s of [-334, -398]) g.add(along([[0, 0], [0, 3], [6, 3], [6, 0]], [s, 29.5, 0], [0, 1, 0], 14), BRIGHT);
    const cheek = PF([[-318, 35, 6], [-318, 44, 6], [-414, 46, 6], [-414, 35, 4]], { w: 30, bevel: 3 });
    g.add(cheek, ARMOR);
    g.add(PF([[-326, 44.6, 3], [-326, 46.6, 3], [-406, 47.6, 3], [-406, 45.4, 3]], { w: 20, bevel: 0.8 }), RUB);
    g.add(label('ADJ ↑', { at: [-366, 40, -15.1], ...LEFT, h: 2.6, sw: 0.42, proud: 0.12, sink: 0.2 }), DARK);
    g.add(along([[0, 0], [0, 5.4], [5, 5.4], [5.6, 4.6], [5.6, 0]], [-352, 33.6, -15], [0, 0, -1], 24), BRIGHT);
    for (let k = 0; k < 18; k++) { const a = k / 18 * TAU; g.add(obox([-352 + Math.cos(a) * 5.45, 33.6 + Math.sin(a) * 5.45, -17.6], [Math.cos(a), Math.sin(a), 0], [0, 0, 1], [0.7, 0.9, 4.4]), BRIGHT); }
    // truss strut: alternating triangles between the edges
    const tTop = (s) => -36 - (s + 300) / -128 * 9, tBot = (s) => -48 - (s + 306) / -122 * 14;
    const node = (k) => { const s = -316 - k * 21; return [s, k % 2 ? tBot(s) : tTop(s)]; };
    const tris = [0, 1, 2, 3].map((k) => rpoly(insetPoly([node(k), node(k + 1), node(k + 2)], 2.6).map(([s, t]) => [s, t, 1.2]), 2));
    g.add(PF([[-306, -48, 4], [-300, -36, 4], [SE, -45, 4], [SE, -62, 4]], { w: 30, bevel: 2, holes: tris }), STEEL);
    g.add(PF([[SE, -66, 4], [SE, 35, 4], [SE - 5, 35, 2], [SE - 5, -66, 2]], { w: 38, bevel: 1.2 }), STEEL);
    for (const t of [20, -54]) g.add(cyl(SE - 13, SE - 4, 2.6, { t, seg: 14 }), BRIGHT);
    {
      const pts = [[SE - 13, 0]];
      for (let s = SE - 12.5; s < SE - 4; s += 1) pts.push([s, 3.3], [s + 0.5, 2.7]);
      pts.push([SE - 4, 2.7], [SE - 4, 0]);
      g.add(lathe(pts.sort((p, q) => p[0] - q[0] || 0).map(([s, r]) => [s, r]), { t: -16, seg: 14 }), STEEL);
    }
    g.add(cyl(SE - 10.5, SE - 6.5, 9, { t: -16, seg: 30, b: 0.8 }), BRIGHT);
    for (let k = 0; k < 28; k++) { const a = k / 28 * TAU; g.add(obox([SE - 8.5, -16 + Math.sin(a) * 9.05, Math.cos(a) * 9.05], [1, 0, 0], [0, Math.sin(a), Math.cos(a)], [3.4, 0.9, 0.8]), BRIGHT); }
    g.add(PF([[SE - 2, 15, 1.5], [SE + 3, 15, 1.5], [SE + 3, 21, 1.5], [SE - 9, 30, 1.5], [SE - 11, 27.5, 1.5]], { w: 3, cw: 20.5, bevel: 0.6 }), BRIGHT);   // LOP lock lever
    g.add(capScrew([SE, 18, 22], [0, 0, 1], 1.4, 1), BRASS);
    g.add(PF([[-440, -70, 6], [-440, 36, 6], [-446, 36, 2], [-446, -70, 2]], { w: 40, bevel: 1.5 }), STEEL);
    g.add(PF([[-446, -72, 8], [-446, 38, 8], [-455, 38, 6], [-455, -72, 6]], { w: 42, bevel: 3 }), RUB);
    for (const sg of [1, -1]) for (let i = 0; i < 12; i++) g.add(cb([-450.6, -62 + i * 8.4, sg * 21], [5.4, 1.8, 1.4], 0.5), RUB);
    for (let r2 = 0; r2 < 17; r2++) for (let c2 = 0; c2 < 5; c2++) {
      const t = -64 + r2 * 5.8, w = (c2 - 2) * 6.6 + (r2 % 2 ? 3.3 : 0);
      if (Math.abs(w) > 15) continue;
      g.add(along([[0, 2.7], [0.8, 2.5], [1.1, 0]], [-455, t, w], [-1, 0, 0], 6, 50), RUB);
    }
    for (const t of [-6, 20]) for (const sg of [1, -1]) g.add(capScrew([-443, t, sg * 20.2], [0, 0, sg], 1.5, 1), BRIGHT);
    g.add(along([[0, 0], [0, 6], [3, 6], [3.6, 4.6], [3.6, 2.6], [1.2, 2.6], [1.2, 0]], [-418, 22, -17], [0, 0, -1], 18), BRIGHT);   // QD cup
    g.add(cb([-420, -60, 0], [8, 6, 12], 1.2), DARK);
    g.add(ring(-420, 5, 1.3, { t: -67.5, axis: 'w', seg: 16 }), BRIGHT);
  }

  // ======================================================================== pistol grip, trigger housing, guard, cell well
  {
    const G = [[-6, -40, 2], [36, -40, 2], [32, -54, 6], [24, -60, 4], [26, -70, 6], [18, -82, 6], [20, -94, 6], [12, -108, 6], [6, -122, 8], [-18, -124, 8], [-16, -104, 8], [-10, -70, 10]];
    g.add(PF(G, { w: 30, bevel: 3.5, curveSeg: 5 }), GRIP);
    // side panels: a field of raised grey rubber hex pads (modelled stipple), a ceramic backstrap with grooves
    const SP = [[-6, -60], [16, -58], [8, -112], [-12, -112]];
    const inside = (s, t, m) => SP.every(([a1, b1], i) => { const [a2, b2] = SP[(i + 1) % 4], ex = a2 - a1, et = b2 - b1, L = Math.hypot(ex, et); return ((s - a1) * et - (t - b1) * ex) / L > m; });
    for (const sg of [1, -1]) {
      g.add(PF(SP.map(([s, t]) => [s, t, 5]), { w: 1.2, cw: sg * 15.2, bevel: 0.4 }), POLY);
      for (let r2 = 0; r2 < 15; r2++) for (let c2 = 0; c2 < 8; c2++) {
        const t = -62.5 + r2 * -3.35, s = -12 + c2 * 3.9 + (r2 % 2 ? 1.95 : 0);
        if (!inside(s, t, 2.2)) continue;
        g.add(along([[0, 1.6], [0.45, 1.5], [0.7, 0]], [s, t, sg * 15.75], [0, 0, sg], 6, 50), RUB);
      }
    }
    let bs = PF([[-12, -58, 4], [-8, -58, 4], [-12, -118, 4], [-17, -118, 4]], { w: 22, bevel: 1.5 });
    bs = cut(bs, [-72, -84, -96, -108].map((t) => cb([-16, t, 0], [3, 1.4, 30], 0.3)));
    g.add(bs, ARMOR);
    g.add(PF([[-20, -124, 3], [8, -122, 3], [7, -128, 3], [-19, -130, 3]], { w: 28, bevel: 1.2 }), STEEL);
    g.add(cyl(-15, -12, 1.6, { t: -126, w: 0, seg: 10 }), BRIGHT);
    // trigger housing under the furnace front / shroud, the beefy U-guard below it (two brass pins), the machined trigger
    g.add(cb([68, -37, 0], [64, 14, 22], 2), STEEL);
    for (const sg of [1, -1]) for (const s of [44, 92]) g.add(along([[0, 0], [0, 1.6], [0.8, 1.6], [1, 0]], [s, -38, sg * 11], [0, 0, sg], 10), BRASS);
    g.add(PF([[37, -44, 1], [47, -44, 1], [49, -57, 5], [89, -57, 5], [91, -44, 1], [101, -44, 1], [99, -63, 8], [88, -69.5, 7], [46, -70.5, 7], [39, -63, 7]], { w: 14, bevel: 2.4 }), STEEL);
    for (const [s, t] of [[42, -49], [96, -49]]) g.add(cyl(-7.6, 7.6, 1.3, { seg: 10 }).rotateY(Math.PI / 2).translate(0, t, -s), BRASS);
    const tr = g.part('trigger', { pivot: [58, -44, 0] });
    let trg = PF([[54, -44, 1], [60, -44, 1], [61.4, -50, 3], [59.4, -56, 3], [56, -58.8, 2], [53.6, -57, 2], [56, -50, 3]], { w: 6.4, bevel: 1 });
    const face = (t) => (t >= -50 ? 60 + (-44 - t) * 1.4 / 6 : 61.4 + (t + 50) / 3);
    trg = cut(trg, [-49, -51.5, -54].map((t) => obox([face(t), t, 0], [0.32, 0.95, 0], [0.95, -0.32, 0], [0.7, 1.2, 8])));
    tr.add(trg, BRIGHT);
    // the cell well collar behind the grip (a triangle opening), release paddle
    const [cs, ct] = Y.cell, e = 38, hT = e * Math.sqrt(3) / 2;
    const tri = (k, r) => rpoly([[cs + (hT * 2 / 3) * k, 0, r], [cs - (hT / 3) * k, -e / 2 * k, r], [cs - (hT / 3) * k, e / 2 * k, r]]);
    g.add(PL(tri(1.22, 6), { h: 9, ct: ct - 4.5, bevel: 1, holes: [tri(1.03, 4)] }), STEEL);
    g.add(PF([[-40, -46, 2], [-30, -46, 2], [-28, -52, 2], [-40, -54, 2]], { w: 14, bevel: 1 }), BRIGHT);
  }

  // ======================================================================== barrel, shroud, chassis
  {
    // barrel (Ø20, bore Ø14): ribbed inside the shroud, plain through the ram, a bright crown
    for (const [a, b] of [[F1 - 4, 570], [Y.ram1 - 20, Y.muzzle]]) g.add(tube(a, b, 10, 7, { seg: 24 }), DARK);
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + 0.26; g.add(cb([260, Math.sin(a) * 10.1, Math.cos(a) * 10.1], [300, 2, 2], 0.5), BLACK); }
    g.add(tube(Y.muzzle - 4, Y.muzzle, 10.4, 7, { seg: 28 }), BRIGHT);
    // lower chassis: gunmetal with lightening slots onto the barrel, a machined pocket under each slot, a rib field
    // behind them (the furnace end), stencils
    const cuts = [];
    for (let i = 0; i < 5; i++) cuts.push(cutters.slotW(118 + i * 58, 150 + i * 58, -10, 9, 80, 0));
    for (const sg of [1, -1]) for (let i = 0; i < 5; i++) cuts.push(cutters.pocketW(rrect(120 + i * 58, 148 + i * 58, -22.8, -16.4, 2.2), sg * 28));
    g.add(cut(SC([[-27, -30], [27, -30], [29, -24], [29, 2], [-29, 2], [-29, -24]], Y.sh0 - 2, Y.sh1, { bevel: 1.5 }), cuts), STEEL);
    for (const sg of [1, -1]) {
      for (let i = 0; i < 10; i++) g.add(cb([62 + i * 5, -19.6, sg * 29.1], [1.6, 7, 1], 0.3), DARK);
      g.add(rivetRow([120, -27.6, sg * 27.9], [380, -27.6, sg * 27.9], [0, -0.32, sg * 0.95], 14, 0.9), BRIGHT);
    }
    g.add(label('QW · 0721 · LOWER', { at: [410, -19.6, 29.05], ...RIGHT, h: 2.2, sw: 0.36, proud: 0.12, sink: 0.2 }), DARK);
    g.add(label('LIFT ↑', { at: [410, -19.6, -29.05], ...LEFT, h: 2.6, sw: 0.42, proud: 0.12, sink: 0.2 }), DARK);
    // upper armour: rear panel (the seal deck, full top), mid / front panels (the fin bay); screws in counterbores
    // (brass on the eye side), rivet rows along the bottom edges
    const full = [[-30, 1], [30, 1], [30, 23], [25, Y.shT], [-25, Y.shT], [-30, 23]];
    const bay = [[-30, 1], [30, 1], [30, 23], [28, Y.shT], [Y.bay, Y.shT], [Y.bay, Y.bayF], [-Y.bay, Y.bayF], [-Y.bay, Y.shT], [-28, Y.shT], [-30, 23]];
    const seamA = Y.seal[1] + 4, seamB = 336;
    const scr = (list) => list.flatMap((s) => [1, -1].map((sg) => [s, 12, sg * 30, [0, 0, sg], 1.5]));
    const panelOf = (geo, list, extra = []) => {
      for (const [s, t, w, n, r] of list) g.add(sunk([s, t, w], n, r), w < 0 ? BRASS : BRIGHT);
      return cut(geo, [...extra, ...list.map(([s, t, w, n, r]) => cbore([s, t, w], n, r))]);
    };
    // rear panel: a louvred vent pocket each side (three slats shedding down and out)
    g.add(panelOf(SC(full, Y.sh0 + 0.8, seamA - 0.4, { bevel: 1.4 }), scr([Y.sh0 + 10, seamA - 10]), [cutters.box([112, 14.5, 30], [66, 13, 4.4]), cutters.box([112, 14.5, -30], [66, 13, 4.4])]), ARMOR);
    for (const sg of [1, -1]) {
      g.add(cb([112, 14.5, sg * 28.3], [66, 13, 0.8], 0.2), DARK);
      for (const t of [10.5, 14.5, 18.5]) g.add(obox([112, t, sg * 29.1], [1, 0, 0], [0, 0.82, sg * 0.57], [64, 3.8, 0.9]), STEEL);
      for (const s of [76, 148]) g.add(capScrew([s, 14.5, sg * 30.2], [0, 0, sg], 1.3, 0.9), BRIGHT);
      g.add(rivetRow([Y.sh0 + 8, 4.2, sg * 30], [seamA - 8, 4.2, sg * 30], [0, 0, sg], 13, 1), BRIGHT);
      g.add(rivetRow([seamA + 8, 4.2, sg * 30], [seamB - 8, 4.2, sg * 30], [0, 0, sg], 8, 1), BRIGHT);
      g.add(rivetRow([seamB + 8, 4.2, sg * 30], [Y.sh1 - 12, 4.2, sg * 30], [0, 0, sg], 8, 1), BRIGHT);
    }
    // mid panel: a recessed service hatch each side (inset plate, piano hinge, two brass latches, four screws), stencils
    const hatch = [1, -1].map((sg) => cutters.pocketW(rrect(236, 322, 4, 20, 3), sg * 29));
    g.add(panelOf(SC(bay, seamA + 0.4, seamB - 0.4, { bevel: 1.4 }), scr([seamA + 10, seamB - 10]), hatch), ARMOR);
    for (const sg of [1, -1]) {
      g.add(PF(rrect(237, 321, 5, 19, 2.4), { w: 0.7, cw: sg * 29.35, bevel: 0.25 }), ARMOR);
      g.add(cyl(240, 318, 0.9, { t: 18.4, w: sg * 29.9, seg: 10 }), BRIGHT);
      for (const s of [240, 279, 318]) g.add(cyl(s - 1.6, s + 1.6, 1.15, { t: 18.4, w: sg * 29.9, seg: 10 }), STEEL);
      for (const s of [258, 300]) { g.add(cb([s, 6.4, sg * 30.05], [7, 2.4, 1.1], 0.4), BRASS); g.add(capScrew([s, 6.4, sg * 30.6], [0, 0, sg], 0.7, 0.4), BRIGHT); }
      for (const [s, t] of [[241, 8.5], [317, 8.5], [241, 14.6], [317, 14.6]]) g.add(capScrew([s, t, sg * 29.7], [0, 0, sg], 1.05, 0.7), BRIGHT);
      g.add(qc([241, 14.6, sg * 30.3], [0, 0, sg], 0.8), SAFE);
    }
    g.add(label('HEAT SINK', { at: [279, 12.4, 29.75], ...RIGHT, h: 2.8, sw: 0.45, proud: 0.12, sink: 0.2 }), DARK);
    g.add(label('6 FIN · 70°', { at: [279, 8.4, 29.75], ...RIGHT, h: 2, sw: 0.34, proud: 0.12, sink: 0.2 }), DARK);
    g.add(label('FIN BAY', { at: [279, 12.4, -29.75], ...LEFT, h: 2.8, sw: 0.45, proud: 0.12, sink: 0.2 }), DARK);
    g.add(label('HANDS CLEAR', { at: [279, 8.4, -29.75], ...LEFT, h: 2, sw: 0.34, proud: 0.12, sink: 0.2 }), DARK);
    g.add(panelOf(SC(bay, seamB + 0.4, Y.sh1 - 6, { bevel: 1.4 }), scr([seamB + 10, Y.sh1 - 14])), ARMOR);
    g.add(SC(bay.map(([w, t]) => [w * 1.04, t + (t > 5 ? 0.6 : 0)]), Y.sh1 - 6, Y.sh1, { bevel: 1 }), DARK);   // front collar
    // fin bay floor (a bright heat-spreader plate) and the stepped ceramic hinge ears on the walls, brass pins
    g.add(cb([(seamA + Y.sh1) / 2, Y.bayF + 0.6, 0], [Y.sh1 - seamA - 8, 1.6, 2 * Y.bay - 1], 0.4), BRIGHT);
    for (let i = 0; i < 6; i++) {
      const [hs, hb] = finH(i), pt = hb + Y.finTh / 2, top = Math.max(pt + 4.5, Y.shT + 2);
      for (const sg of [1, -1]) {
        g.add(PF([[hs - 7, 20, 2], [hs + 7, 20, 2], [hs + 6.4, top - 2.4, 0.8], [hs + 3.6, top, 1.2], [hs - 3.6, top, 1.2], [hs - 6.4, top - 2.4, 0.8]], { w: 3.5, cw: sg * (Y.bay + 1.75), bevel: 0.8 }), ARMOR);
        g.add(along([[0, 0], [0, 2.8], [1.2, 2.8], [1.6, 2.2], [1.6, 0]], [hs, pt, sg * (Y.bay + 3.5)], [0, 0, sg], 6, 50), BRASS);   // pin heads (hex)
      }
      g.add(xform(cyl(-Y.bay - 3.6, Y.bay + 3.6, 1.8, { seg: 12 }), { rot: [0, 90, 0], move: [hs, pt, 0] }), BRASS);              // hinge pin (along w)
    }
    // three 45° safety bands across the front panel (they wrap its sides and wall tops, not the bay)
    const skin = SC(full.map(([w, t]) => [w + Math.sign(w) * 0.45, t > 5 ? t + 0.45 : t - 0.3]), seamB + 0.4, Y.sh1 - 6, { bevel: 1.6 });
    for (let i = 0; i < 3; i++) g.add(cut(intersect(skin, slab(366 + i * 26, 12, 12)), [cutters.box([366 + i * 26, 22, 0], [120, 30, 2 * Y.bay - 0.9])]), SAFE);
    // rod bushings (bronze) in outrigger housings for the ram's four guide rods
    for (const [t, w] of [[22, 41], [22, -41], [-22, 41], [-22, -41]]) {
      g.add(cb([Y.sh1 - 22, t, w * 0.92], [44, 16, 14], 3), DARK);
      g.add(tube(Y.sh1 - 6, Y.sh1 + 2, 9, 6.4, { t, w, seg: 18 }), BRASS);
      g.add(hexBolt([Y.sh1 - 30, t + Math.sign(t) * 8, w * 0.92], [0, Math.sign(t), 0], 2, 1.6), BRIGHT);
      g.add(hexBolt([Y.sh1 - 14, t + Math.sign(t) * 8, w * 0.92], [0, Math.sign(t), 0], 2, 1.6), BRIGHT);
    }
    // the ram's two hydraulic cylinders between the housings (the piston rods ride on fx_ram): brass end caps, a gland
    // nut, a pressure port, two brackets to the shroud
    for (const sg of [1, -1]) {
      const w = sg * 40;
      g.add(lathe([[372, 0], [372, 5.6], [373, 6.4], [451, 6.4], [452, 5.6], [452, 0]], { w, seg: 20 }), DARK);
      g.add(lathe([[369.5, 0], [369.5, 6.2], [370.5, 7.1], [376, 7.1], [377, 6.2], [377, 0]], { w, seg: 20 }), BRASS);
      g.add(lathe([[445, 0], [445, 6.6], [446, 7.3], [451.5, 7.3], [452.5, 6.6], [452.5, 0]], { w, seg: 20 }), BRASS);
      g.add(hexBolt([452.5, 0, w], [1, 0, 0], 5.2, 3), BRIGHT);
      for (let k = 0; k < 4; k++) g.add(ring(392 + k * 14, 6.45, 0.45, { w, seg: 20 }), STEEL);
      g.add(hexBolt([384, 6.2, w], [0, 1, 0], 2.4, 2.2), BRASS);
      for (const s of [384, 436]) g.add(cb([s, 0, sg * 32.6], [8, 9, 5.4], 1), DARK);
    }
    // braided hydraulic lines from the furnace front face along the lower left of the shroud, in under it at the front
    for (const k of [0, 1]) {
      const P = [[F1 + 1, -10 + k * 6.5, -32.5], [76, -6 + k * 5.5, -33.5], [200, -5 + k * 5.5, -33], [326, -6 + k * 5.5, -33], [398, -33 + k * 3, -22 - k * 5]];   // the left side (seen in first person)
      // braided steel hose with orange heat sleeves (black hoses vanished against the black chassis)
      g.add(sweep(P, 2.2, { seg: 72, radial: 8 }), BRIGHT);
      for (const [a, b] of [[0.12, 0.2], [0.45, 0.53], [0.78, 0.86]]) { const n = 8, pts = []; for (let j = 0; j <= n; j++) { const u = a + (b - a) * j / n, f = u * (P.length - 1), i0 = Math.min(P.length - 2, Math.floor(f)), r = f - i0; pts.push([0, 1, 2].map((c) => P[i0][c] + (P[i0 + 1][c] - P[i0][c]) * r)); } g.add(sweep(pts, 2.7, { seg: 10, radial: 8 }), SAFE); }
      g.add(along([[0, 0], [0, 3.8], [5, 3.8], [5.5, 3.2], [8, 3.2], [8, 0]], P[0], [1, 0, 0], 6, 50), BRASS);
      g.add(hexBolt([F1, P[0][1], P[0][2]], [1, 0, 0], 4.4, 2), BRIGHT);                                   // bulkhead nut
      // the far end: a banjo eye round a hollow bolt into the chassis floor
      g.add(along([[0, 0], [0, 3.6], [6, 3.6], [6.5, 3], [8, 3], [8, 0]], [P[4][0], P[4][1] + 6, P[4][2]], [0, -1, 0], 6, 50), BRASS);
      g.add(ring(P[4][0], 3.9, 1.5, { t: P[4][1] - 3, w: P[4][2], axis: 't', seg: 16 }), BRASS);
      g.add(hexBolt([P[4][0], P[4][1] - 4.2, P[4][2]], [0, -1, 0], 3, 2.2), BRIGHT);
    }
    g.add(cb([F1 + 1.2, -6.7, -32.8], [2.4, 18, 10], 0.6), DARK);   // bulkhead plate
    for (const t of [-14.5, 1.2]) g.add(capScrew([F1 + 2.4, t, -32.8], [1, 0, 0], 1.1, 0.7), BRIGHT);
    for (const s of [118, 268]) { g.add(cb([s, -2, -34], [6, 16, 4.4], 1), DARK); g.add(capScrew([s, -2, -36.3], [0, 0, -1], 1.2, 0.8), BRIGHT); }   // line clamps
    // angled foregrip on a short rail (two screws), grey rubber ribs, a ceramic end cap
    g.add(cb([250, -33, 0], [120, 6, 22], 1.2), DARK);
    for (let i = 0; i < 10; i++) g.add(cb([196 + i * 11.6, -37, 0], [5.6, 2.6, 20], 0.5), DARK);
    for (const s of [198, 302]) for (const sg of [1, -1]) g.add(capScrew([s, -33, sg * 11], [0, 0, sg], 1.2, 0.8), BRIGHT);
    g.add(PF([[210, -38, 2], [290, -38, 2], [288, -50, 6], [278, -61, 6], [262, -63, 4], [214, -42, 3]], { w: 26, bevel: 3.5, curveSeg: 5 }), GRIP);
    for (let i = 0; i < 4; i++) g.add(obox([224 + i * 9.5, -46.6 - i * 4.3, 0], [0.91, -0.41, 0], [0.41, 0.91, 0], [3, 1.6, 27]), RUB);
    g.add(PF([[256, -55, 2], [287.6, -52.4, 2], [281, -61.6, 6], [262, -64.2, 4]], { w: 27.2, bevel: 1.6 }), ARMOR);
    for (const sg of [1, -1]) g.add(label('QW', { at: [272, -57.5, sg * 13.65], ...(sg > 0 ? RIGHT : LEFT), h: 2.6, sw: 0.42, proud: 0.12, sink: 0.2 }), DARK);
    // seal clamp blocks either end of the seal
    for (const s of [Y.seal[0] - 4, Y.seal[1] + 3]) { g.add(cb([s, Y.shT + 1.6, 0], [6, 3.2, 26], 1), DARK); for (const sg of [1, -1]) g.add(capScrew([s, Y.shT + 3.2, sg * 9.5], [0, 1, 0], 1.2, 0.8), BRASS); }
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
    // heat inserts inside the lightening slots, each under a two-bar guard, and a tail lip: dim at rest, hot in overload
    // (premium.mat glow_vermilion)
    for (let k = 0; k < 3; k++) {
      f.add(cb([tail + 25 + k * 26, pt, 0], [16, Y.finTh - 1.2, 16], 0.6), HEAT);
      for (const d of [-4.2, 4.2]) f.add(cb([tail + 25 + k * 26 + d, pt + Y.finTh / 2 - 0.35, 0], [1.3, 1.1, 18.6], 0.35), STEEL);
    }
    f.add(cb([tail - 0.4, pt, 0], [1.6, Y.finTh - 1, W - 18], 0.3), HEAT);
    // the exposed step of each fin (the rear fin lies on top): a gunmetal spreader band, a white stencilled number, rivets
    f.add(cb([hs - 17, pt + Y.finTh / 2 + 0.3, 0], [18, 0.8, W - 8], 0.3), STEEL);
    f.add(label(String(i + 1), { at: [hs - 17, pt + Y.finTh / 2 + 0.7, 12.5], ...TOPR, h: 6.2, sw: 1, proud: 0.14, sink: 0.12 }), WHITE);
    for (const sw of [-1, 1]) f.add(rivet([hs - 17, pt + Y.finTh / 2 + 0.7, sw * 4], [0, 1, 0], 1.1), BRASS);
    f.add(rivet([hs - 17, pt + Y.finTh / 2 + 0.7, -12.5], [0, 1, 0], 1.1), BRASS);
  }

  // ======================================================================== the spine seal (fx_seal)
  {
    const [s0, s1] = Y.seal, t0 = Y.shT, top = t0 + 3;
    const sl = g.part('fx_seal', { pivot: [(s0 + s1) / 2, t0 + 1.5, 0] });
    sl.add(PL([[s0, -7, 3], [s1, -7, 3], [s1, 7, 3], [s0, 7, 3]], { h: 3, ct: t0 + 1.5, bevel: 0.7 }), BRIGHT);
    // big brass rivets (placed clear of the lettering)
    for (const [s, w] of [[13, -4.6], [48, 4.6], [70, -4.6], [105, 4.6], [178, -4.6], [205, 4.6]]) sl.add(rivet([s, top, w], [0, 1, 0], 1.9), BRASS);
    // 禁止解封 written down the strap (upright for the shooter, read from the far end), a big 封 at the near end
    const chars = ['禁', '止', '解', '封'], sc = (s0 + s1) / 2 + 52;
    chars.forEach((c, k) => sl.add(label(c, { at: [sc - k * 12, top, 0], ...TOPR, hz: 9.4, swz: 0.9, proud: 0.18, sink: 0.12 }), RED));
    sl.add(label('封', { at: [s0 + 24, top, 0], ...TOPR, hz: 11, swz: 1.2, proud: 0.2, sink: 0.12 }), RED);
    sl.add(label('M04-0721', { at: [(s0 + s1) / 2 - 22, top, 3.8], ...TOP, h: 3, sw: 0.5, proud: 0.16, sink: 0.12 }), POLY);   // matte black: dark steel vanished in the strap's sheen
    // lead seals: a wire loop and a stamped disc hanging off the right edge at each end
    for (const s of [s0 + 3, s1 - 3]) {
      sl.add(sweep([[s, top - 0.2, 4], [s, top + 1.6, 6.5], [s, top - 1.2, 8.4]], 0.4, { seg: 10, radial: 8 }), BRIGHT);
      sl.add(along([[0, 0], [0, 2.7], [1.5, 2.7], [1.8, 2.2], [1.8, 0]], [s, top - 3.4, 8.4], [0, 0, 1], 16), DARK);
      sl.add(label('封', { at: [s, top - 3.4, 10.2], ...RIGHT, hz: 3.4, swz: 0.4, proud: 0.12, sink: 0.12 }), BRIGHT);
    }
  }

  // ======================================================================== 樞錘 ram (fx_ram)
  {
    const ram = g.part('fx_ram', { pivot: [Y.ram0, 0, 0], extras: { open: [0.06, 0, 0] } });
    const H = Y.ramH, r0 = Y.ram0, y1 = r0 + 30, f1 = Y.ram1;
    for (const [t, w] of [[22, 41], [22, -41], [-22, 41], [-22, -41]]) {
      ram.add(cyl(Y.sh1 - 80, r0 + 8, 6, { t, w, seg: 16 }), BRIGHT);                                        // guide rods
      ram.add(lathe([[r0 - 2, 0], [r0 - 2, 8], [r0 + 6, 8], [r0 + 6, 0]], { t, w, seg: 16 }), BRASS);         // rod collars
    }
    ram.add(cut(cb([(r0 + y1) / 2, 0, 0], [y1 - r0, 2 * H + 6, 98], 5), [cyl(r0 - 5, y1 + 5, 12, { b: 0 })]), STEEL);   // guide yoke
    for (const sg of [1, -1]) for (const t of [-14, 14]) ram.add(hexBolt([(r0 + y1) / 2, t, sg * 49], [0, 0, sg], 2.4, 1.8), BRASS);
    // the hydraulic rams' piston rods and clevises (the cylinders sit on the shroud; they sell the 60 mm stroke)
    for (const sg of [1, -1]) {
      ram.add(cyl(384, r0 - 6, 3.2, { w: sg * 40, seg: 16 }), BRIGHT);
      ram.add(cb([r0 - 4.5, 0, sg * 40], [9, 11, 10], 1.5), DARK);
      ram.add(xform(cyl(-6.6, 6.6, 1.5, { seg: 12 }), { rot: [90, 0, 0], move: [r0 - 4.5, 0, sg * 40] }), BRASS);
    }
    // hammer block 70 x 70 (gunmetal, 6 mm chamfers): a 4 mm fuller with a bright floor on the top, two safety bands,
    // big bolted ceramic side plates carrying the 樞 cartouche
    const b1 = f1 - 18, FT0 = 600, FU1 = 672, ftm = (FT0 + FU1) / 2;
    ram.add(cut(cb([(y1 + b1) / 2, 0, 0], [b1 - y1, 2 * H, 2 * H], 6), [cb([ftm, H + 0.5, 0], [FU1 - FT0, 9, 12], 0.8), cyl(y1 - 5, f1 + 5, 11.2, { b: 0 })]), STEEL);
    ram.add(cb([ftm, H - 3.65, 0], [FU1 - FT0 - 3, 0.6, 10.2], 0.2), BRIGHT);
    const skinR = cb([(y1 + b1) / 2, 0, 0], [b1 - y1, 2 * H + 0.9, 2 * H + 0.9], 6.2);
    for (const s of [y1 + 16, y1 + 40]) ram.add(intersect(skinR, slab(s, 0, 12)), SAFE);
    const CP0 = 592, CP1 = 756, cpm = CP1 - 34;
    for (const sg of [1, -1]) {
      // big bolted ceramic side plates: two grooves through to the steel (bright strips in them), the cartouche ahead
      const fw = sg * (H + 2.6), N = [0, 0, sg], side = sg > 0 ? RIGHT : LEFT, gm = (CP0 + CP1 - 60) / 2;
      const scr = [[CP0 + 5, -19], [CP0 + 5, 19], [CP1 - 5, -19], [CP1 - 5, 19], [CP0 + 5, 0], [CP1 - 5, 0], [CP1 - 62, -19], [CP1 - 62, 19]].map(([s, t]) => [s, t, fw, N, 1.6]);
      let sp = PF(rrect(CP0, CP1, -24, 24, 5), { w: 2.6, cw: sg * (H + 1.3), bevel: 0.8 });
      sp = cut(sp, [...scr.map(([s, t, w, n, r]) => cbore([s, t, w], n, r, 1.2)), ...[-11.5, 11.5].map((t) => cutters.pocketW(rrect(CP0 + 14, CP1 - 74, t - 1.7, t + 1.7, 1.6), sg * (H - 0.5)))]);
      ram.add(sp, ARMOR);
      for (const [s, t, w, n, r] of scr) ram.add(sunk([s, t, w], n, r, 1.2), BRASS);
      for (const t of [-11.5, 11.5]) ram.add(cb([gm, t, sg * (H + 0.2)], [CP1 - CP0 - 90, 1.2, 0.5], 0.2), BRIGHT);
      // the cartouche: a black-chrome plate, the 樞 raised in brass, four bright rivets
      ram.add(PF(rrect(cpm - 22, cpm + 22, -11.5, 11.5, 3), { w: 1.2, cw: sg * (H + 3.2), bevel: 0.4 }), BLACK);
      ram.add(PF(rrect(cpm - 20.6, cpm + 20.6, -10.1, 10.1, 2.2), { w: 0.3, cw: sg * (H + 3.85), bevel: 0.1, holes: [rrect(cpm - 19.8, cpm + 19.8, -9.3, 9.3, 1.8)] }), BRASS);
      ram.add(label('樞', { at: [cpm, 0, sg * (H + 3.8)], ...side, hz: 16, swz: 1.7, proud: 0.5, sink: 0.2 }), BRASS);
      for (const [s, t] of [[cpm - 17.6, -7.4], [cpm - 17.6, 7.4], [cpm + 17.6, -7.4], [cpm + 17.6, 7.4]]) ram.add(rivet([s, t, sg * (H + 3.8)], N, 1.05), BRIGHT);
      ram.add(label('M04 RAM · 60 MM', { at: [gm, -19, fw], ...side, h: 2.6, sw: 0.44, proud: 0.12, sink: 0.2 }), DARK);
      ram.add(label('QW', { at: [gm, 19, fw], ...side, h: 2.6, sw: 0.44, proud: 0.12, sink: 0.2 }), DARK);
    }
    ram.add(label('60 MM →', { at: [706, H + 0.05, 0], ...TOP, h: 3.2, sw: 0.55, proud: 0.12, sink: 0.2 }), WHITE);
    // collar (the one black-chrome band) with a ring of brass bolts, the steel striking ring, the waffle face: bright
    // pyramids on a black field round the bore
    ram.add(cb([f1 - 13, 0, 0], [10, 2 * H + 5, 2 * H + 5], 6.5), BLACK);
    for (const sg of [1, -1]) for (const k of [-1, 0, 1]) {
      ram.add(hexBolt([f1 - 13, k * 20, sg * (H + 2.5)], [0, 0, sg], 2.2, 1.6), BRASS);
      ram.add(hexBolt([f1 - 13, sg * (H + 2.5), k * 20], [0, sg, 0], 2.2, 1.6), BRASS);
    }
    ram.add(cut(cb([f1 - 4, 0, 0], [8, 2 * H + 2, 2 * H + 2], 6.5), [cyl(f1 - 9, f1 + 1, 11, { b: 0 })]), BRIGHT);
    ram.add(cut(cb([f1 + 1.5, 0, 0], [3, 2 * H - 6, 2 * H - 6], 4), [cyl(f1 - 5, f1 + 8, 11, { b: 0 })]), BLACK);
    const n = 6, step = (2 * H - 12) / n;
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      const t = -H + 6 + step * (a + 0.5), w = -H + 6 + step * (b + 0.5);
      if (Math.hypot(t, w) < 14) continue;
      const bulge = 1.2 * (1 - (t * t + w * w) / (2 * H * H));
      ram.add(along([[0, step * 0.5], [1.4 + bulge, step * 0.2], [1.6 + bulge, 0]], [f1 + 2.8, t, w], [1, 0, 0], 4, 60), BRIGHT);
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
    // charge windows on the two front faces: four glowing cells behind a dark lens strip, a steel frame with dividers
    // and a level scale (F / E)
    for (const sg of [1, -1]) {
      const nrm = [0.5, 0, sg * 0.866], tan = [-0.866, 0, sg * 0.5], c = [cs + hT / 6, 0, sg * e / 4], at = (d, t, u = 0) => [c[0] + nrm[0] * d + tan[0] * u, t, c[2] + nrm[2] * d + tan[2] * u];
      for (let k = 0; k < 4; k++) mag.add(obox(at(0.35, L0 - 72 - k * 7), tan, [0, 1, 0], [10, 4.6, 1.2]), GLOW);
      mag.add(obox(at(0.2, L0 - 82.5), tan, [0, 1, 0], [13, 31, 0.8]), DARK);
      for (const u of [-7.1, 7.1]) mag.add(obox(at(0.75, L0 - 82.5, u), tan, [0, 1, 0], [1.4, 33.6, 1.2]), STEEL);
      for (const t of [L0 - 66.1, L0 - 98.9]) mag.add(obox(at(0.75, t), tan, [0, 1, 0], [15.6, 1.4, 1.2]), STEEL);
      for (let k = 0; k < 3; k++) mag.add(obox(at(0.8, L0 - 75.5 - k * 7), tan, [0, 1, 0], [11.6, 0.8, 1]), STEEL);
      for (let k = 0; k < 7; k++) mag.add(obox(at(0.9, L0 - 72 - k * 3.5, -9.2 * sg), tan, [0, 1, 0], [k % 2 ? 1 : 1.8, 0.45, 0.4]), BRIGHT);
      const lf = { u: vmul(tan, -sg), v: [0, 1, 0], n: nrm };
      mag.add(label('F', { at: at(0.4, L0 - 72, -12.2 * sg), ...lf, h: 2.2, sw: 0.38, proud: 0.12, sink: 0.12 }), DARK);
      mag.add(label('E', { at: at(0.4, L0 - 93, -12.2 * sg), ...lf, h: 2.2, sw: 0.38, proud: 0.12, sink: 0.12 }), DARK);
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

  // bake: face-weighted normals; a QEM pass over the dense curved pieces only (never the flat plates: collapsing cap
  // vertices onto the bevel seams streaked them); an even pre-tessellation (12 mm on the plates, 24 on the metal) so the
  // per-vertex AO has no long slivers to smear along; AO in the rest pose blended with the open pose for the parts that
  // move (fins raised, doors apart, the ram out); m4's post-bake (curvature wear)
  const build0 = g.build.bind(g);
  g.build = (o = {}) => {
    const root = build0({ ...o, bake: false });
    const tp = g.lod === 1;
    root.traverse((m) => { if (m.isMesh && !/^(glow_|glass)/.test(m.userData.mat)) m.geometry = faceWeighted(m.geometry); });
    if (tp) {
      // teammates' LOD: each fin's heat inserts and tail lip become one box inside the plate (it shows in the slots)
      root.traverse((m) => {
        if (!m.isMesh || m.userData.mat !== HEAT) return;
        m.geometry.computeBoundingBox();
        const bb = m.geometry.boundingBox, c = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3());
        const bx = new THREE.BoxGeometry(sz.x, sz.y, sz.z).translate(c.x, c.y, c.z);
        bx.deleteAttribute('uv');
        m.geometry = bx.toNonIndexed();
      });
    }
    if (o.decimate !== false) {
      let before = 0, after = 0;
      const tris = (geo) => (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
      root.traverse((m) => {
        if (!m.isMesh) return;
        const mat = m.userData.mat, n = tris(m.geometry);
        before += n;
        if (tp) { if (!/^(glass|obsidian)/.test(mat) && mat !== HEAT) m.geometry = /^glow_/.test(mat) ? decimate(m.geometry, 1.5, 0.5) : decimate(m.geometry, 5, 0.1, true, 0.1); }
        else if (!FLAT.test(mat) && !/^(glow_|glass)/.test(mat) && n > 400) m.geometry = decimate(m.geometry, 0.1, 0.6);
        after += tris(m.geometry);
      });
      if (o.log !== false) console.log(`yanshu decimate: ${Math.round(before)} -> ${Math.round(after)} triangles`);
    }
    if (o.bake !== false) {
      const meshes = [];
      root.traverse((m) => { if (m.isMesh) meshes.push(m); });
      const tess = (o.tessellate ?? TESS) * 0.001 * (tp ? 10 : 1);
      for (const m of meshes) {
        let geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
        for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
        if (!/^(glow_|glass)/.test(m.userData.mat)) {
          geo = ladderTess(geo, FLAT.test(m.userData.mat) ? tess : tess * 2);
        }
        m.geometry = geo;
      }
      const glassy = (m) => /^(glass|glow_|obsidian)/.test(m.userData.mat);
      // low relief (screw heads, rivets, stencils) does not darken the plate round it into blotches
      const minH = (m) => (glassy(m) ? 0.004 : 0.0011);
      bakeMeshes(meshes, { tessellate: 0, aoDist: 0.026, rays: 32, log: true, minHeight: minH });
      if (!tp) openPoseAO(root, meshes, { minHeight: minH });
      postBake(root, {}, WEAR);
      root.traverse((m) => {
        const B = m.isMesh && m.geometry.attributes._bake?.array;
        if (!B) return;
        if (glassy(m)) for (let i = 0; i < B.length; i += 4) { B[i] = Math.max(B[i], 225); B[i + 1] = 0; B[i + 2] = 0; }
        // moving parts never bake darker than ~0.55: their undersides are what the eye sees when they are raised / out
        else if (MOVING.test(m.parent?.name)) for (let i = 0; i < B.length; i += 4) B[i] = Math.max(B[i], 140);
      });
    }
    return root;
  };
  return g;
}

const TESS = 12;
const FLAT = /^(ceramic|paint_|rubber)/, MOVING = /^fx_(fin|door|ram)/;
/**
 * Bake tessellation: a triangle with an edge over maxE becomes a ladder of rungs parallel to its shortest edge, maxE
 * apart along the other two (recursing while a rung is still long). A sliver (under 1.2 mm tall: bevel strips, earcut
 * and CSG fans) is cut at 2 maxE and costs L / maxE triangles, where the kit's longest-edge bisection cut a 745 mm
 * barrel facet into ~80 pieces. Normals interpolate.
 */
function ladderTess(geo, maxE) {
  const P = geo.attributes.position.array, N = geo.attributes.normal.array, oP = [], oN = [];
  let m2 = 0, mE = maxE;
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const lerp = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
  const nz = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const emit = (p, n, depth) => {
    const e = [d2(p[1], p[2]), d2(p[2], p[0]), d2(p[0], p[1])];
    if (Math.max(e[0], e[1], e[2]) <= m2 || depth > 6) { for (let k = 0; k < 3; k++) { oP.push(p[k][0], p[k][1], p[k][2]); oN.push(n[k][0], n[k][1], n[k][2]); } return; }
    const c = e.indexOf(Math.min(e[0], e[1], e[2])), a = (c + 1) % 3, b = (c + 2) % 3, k = Math.ceil(Math.sqrt(Math.max(e[a], e[b])) / mE);
    const Q = [], R = [], QN = [], RN = [];
    for (let i = 0; i <= k; i++) { const u = i / k; Q.push(lerp(p[a], p[c], u)); R.push(lerp(p[b], p[c], u)); QN.push(nz(lerp(n[a], n[c], u))); RN.push(nz(lerp(n[b], n[c], u))); }
    for (let i = 0; i < k; i++) {
      emit([Q[i], R[i], R[i + 1]], [QN[i], RN[i], RN[i + 1]], depth + 1);
      if (i < k - 1) emit([Q[i], R[i + 1], Q[i + 1]], [QN[i], RN[i + 1], QN[i + 1]], depth + 1);
    }
  };
  for (let t = 0; t < P.length; t += 9) {
    const p = [0, 1, 2].map((k) => [P[t + k * 3], P[t + k * 3 + 1], P[t + k * 3 + 2]]);
    const u = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], v = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    const area2 = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]), L = Math.sqrt(Math.max(d2(p[0], p[1]), d2(p[1], p[2]), d2(p[2], p[0])));
    mE = area2 / Math.max(L, 1e-9) < 0.0012 ? maxE * 2 : maxE;
    m2 = mE * mE * 1.0201;
    emit(p, [0, 1, 2].map((k) => [N[t + k * 3], N[t + k * 3 + 1], N[t + k * 3 + 2]]), 0);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(new Float32Array(oP), 3));
  out.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(oN), 3));
  return out;
}
/** QEM simplification of a built (metre) mesh to err mm, position + normal weighted (nw) */
function decimate(geo, err, nw = 0.3, prune = false, ratio = 0) {
  if (prune) return decimateLOD(geo, err, ratio);
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
/** third-person LOD: welded on position only (normal seams would pin every crease), pruned, normals rebuilt */
function decimateLOD(geo, err, ratio) {
  const g0 = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g0.attributes)) if (k !== 'position') g0.deleteAttribute(k);
  const w = mergeVertices(g0, 1e-6), P = w.attributes.position.array, Pmm = new Float32Array(P.length);
  for (let i = 0; i < P.length; i++) Pmm[i] = P[i] * 1000;
  const target = ratio ? Math.max(3, Math.floor(w.index.count * ratio / 3) * 3) : 0;
  const [I] = MeshoptSimplifier.simplify(Uint32Array.from(w.index.array), Pmm, 3, target, err, ['ErrorAbsolute', 'Prune']);
  const pos = new Float32Array(I.length * 3);
  for (let k = 0; k < I.length; k++) for (let c = 0; c < 3; c++) pos[k * 3 + c] = P[I[k] * 3 + c];
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return faceWeighted(out, 40);
}
/**
 * Face-weighted normals (the hard-surface "weighted normal" look): each corner takes the mean of the face normals round
 * its vertex within `crease` of its own face, each weighted by the area of the planar patch (coplanar, vertex-connected
 * triangles) it belongs to. Big flat faces stay exactly flat up to their bevels and the bevels roll smoothly. The kit's
 * plain average tilted every earcut cap triangle that touches an outline by the 22° first bevel facet (QA: diagonal
 * creases and dents across the ceramic plates).
 */
function faceWeighted(geo, crease = 50) {
  const g = geo.index ? geo.toNonIndexed() : geo, P = g.attributes.position.array, nt = P.length / 9;
  const fn = new Float64Array(nt * 3), ar = new Float64Array(nt);
  for (let t = 0; t < nt; t++) {
    const a = t * 9, ux = P[a + 3] - P[a], uy = P[a + 4] - P[a + 1], uz = P[a + 5] - P[a + 2], vx = P[a + 6] - P[a], vy = P[a + 7] - P[a + 1], vz = P[a + 8] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz);
    ar[t] = l / 2;
    if (l > 0) { fn[t * 3] = nx / l; fn[t * 3 + 1] = ny / l; fn[t * 3 + 2] = nz / l; }
  }
  const ids = new Int32Array(nt * 3), map = new Map();
  let W = 0;
  for (let i = 0; i < nt * 3; i++) {
    const k = Math.round(P[i * 3] * 2e5) + ',' + Math.round(P[i * 3 + 1] * 2e5) + ',' + Math.round(P[i * 3 + 2] * 2e5);
    let id = map.get(k);
    if (id === undefined) map.set(k, (id = W++));
    ids[i] = id;
  }
  const byV = Array.from({ length: W }, () => []);
  for (let i = 0; i < nt * 3; i++) byV[ids[i]].push((i / 3) | 0);
  const dot = (s, t) => fn[s * 3] * fn[t * 3] + fn[s * 3 + 1] * fn[t * 3 + 1] + fn[s * 3 + 2] * fn[t * 3 + 2];
  const par = Int32Array.from({ length: nt }, (_, i) => i), find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  for (const L of byV) for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) if (dot(L[i], L[j]) > 0.99995) { const a = find(L[i]), b = find(L[j]); if (a !== b) par[a] = b; }
  const pa = new Float64Array(nt);
  for (let t = 0; t < nt; t++) pa[find(t)] += ar[t];
  const cc = Math.cos(crease * D2R), N = new Float32Array(nt * 9);
  for (let i = 0; i < nt * 3; i++) {
    const t = (i / 3) | 0;
    let x = 0, y = 0, z = 0;
    for (const s of byV[ids[i]]) if (s === t || dot(s, t) > cc) { const w = pa[find(s)] + 1e-12; x += fn[s * 3] * w; y += fn[s * 3 + 1] * w; z += fn[s * 3 + 2] * w; }
    const l = Math.hypot(x, y, z);
    if (l > 0) { N[i * 3] = x / l; N[i * 3 + 1] = y / l; N[i * 3 + 2] = z / l; } else { N[i * 3] = fn[t * 3]; N[i * 3 + 1] = fn[t * 3 + 1]; N[i * 3 + 2] = fn[t * 3 + 2]; }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  return out;
}
/**
 * AO of the open pose (fins raised into the tower, doors apart, the ram out 60 mm), blended into the baked rest AO:
 * the moving parts keep the brighter of the two (their undersides, the rods and the fin faces are only seen open), the
 * body takes half the gain (the fin bay floor and the grille under the doors are only seen open; the contact shadows
 * the closed parts cast stay half). Same estimator as tools/assets/lib/bake.mjs, on the already baked geometry.
 */
function openPoseAO(root, meshes, { aoDist = 0.026, rays = 24, minHeight = () => 0 } = {}) {
  const saved = [];
  root.traverse((o) => {
    if (!MOVING.test(o.name)) return;
    const ex = o.userData;
    saved.push([o, o.position.clone(), o.quaternion.clone()]);
    if (Array.isArray(ex.open)) o.position.add(new THREE.Vector3(ex.open[2], ex.open[1], -ex.open[0]));
    else if (typeof ex.open === 'number') o.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), ex.open * D2R));
  });
  root.updateMatrixWorld(true);
  const world = meshes.map((m) => { const w = m.geometry.clone(); for (const k of Object.keys(w.attributes)) if (k !== 'position') w.deleteAttribute(k); return w.applyMatrix4(m.matrixWorld); });
  const bvh = new MeshBVH(mergeGeometries(world.map((w) => (w.index ? w.toNonIndexed() : w)), false));
  const dirs = [];
  for (let i = 0; i < rays; i++) {   // Hammersley cosine hemisphere
    let b = i;
    b = ((b << 16) | (b >>> 16)) >>> 0; b = (((b & 0x55555555) << 1) | ((b & 0xaaaaaaaa) >>> 1)) >>> 0; b = (((b & 0x33333333) << 2) | ((b & 0xcccccccc) >>> 2)) >>> 0;
    b = (((b & 0x0f0f0f0f) << 4) | ((b & 0xf0f0f0f0) >>> 4)) >>> 0; b = (((b & 0x00ff00ff) << 8) | ((b & 0xff00ff00) >>> 8)) >>> 0;
    const u = (i + 0.5) / rays, v = b / 4294967296, r = Math.sqrt(u), ph = 2 * Math.PI * v;
    dirs.push([r * Math.cos(ph), r * Math.sin(ph), Math.sqrt(1 - u)]);
  }
  const ray = new THREE.Ray(), p = new THREE.Vector3(), n = new THREE.Vector3(), t = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), nm = new THREE.Matrix3();
  let rnd = 7;
  const random = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
  for (const m of meshes) {
    const mov = MOVING.test(m.parent?.name), body = m.parent?.name === 'body';
    if ((!mov && !body) || /^(glass|glow_)/.test(m.userData.mat)) continue;
    const pos = m.geometry.attributes.position, nor = m.geometry.attributes.normal, B = m.geometry.attributes._bake.array, mh = minHeight(m);
    nm.getNormalMatrix(m.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      if (Math.abs(n.y) < 0.9) t.set(0, 1, 0).cross(n).normalize(); else t.set(1, 0, 0).cross(n).normalize();
      b.crossVectors(n, t);
      const rot = random() * Math.PI * 2, cr = Math.cos(rot), sr = Math.sin(rot);
      let open = 0;
      for (const [dx0, dy0, dz] of dirs) {
        const dx = dx0 * cr - dy0 * sr, dy = dx0 * sr + dy0 * cr;
        d.set(0, 0, 0).addScaledVector(t, dx).addScaledVector(b, dy).addScaledVector(n, dz);
        ray.origin.copy(p).addScaledVector(n, 0.0003);
        ray.direction.copy(d);
        let hit = bvh.raycastFirst(ray, THREE.DoubleSide, 0, aoDist);
        if (mh > 0 && hit && hit.distance * dz < mh && dz > 1e-3) {
          const skip = Math.min(aoDist, mh / dz);
          ray.origin.addScaledVector(d, skip);
          hit = bvh.raycastFirst(ray, THREE.DoubleSide, 0, aoDist - skip);
          if (hit) hit = { distance: hit.distance + skip };
        }
        open += hit ? Math.sqrt(Math.min(1, hit.distance / aoDist)) * 0.7 : 1;
      }
      const o2 = Math.round(Math.max(0, Math.min(1, open / dirs.length)) * 255), r0 = B[i * 4];
      B[i * 4] = mov ? Math.max(r0, o2) : Math.max(r0, Math.round((r0 + o2) / 2));
    }
  }
  bvh.geometry.dispose();
  for (const [o, p0, q0] of saved) { o.position.copy(p0); o.quaternion.copy(q0); }
  root.updateMatrixWorld(true);
}
/** per-material wear [curvature (1/m) mapped to full wear, cap]: the ceramic chips a little, the safety paint scuffs to steel */
const WEAR = {
  '*:steel': [1 / 500, 0.8], '*:steel_dark': [1 / 500, 0.6], '*:steel_bright': [1 / 600, 0.3], '*:black_chrome': [1 / 500, 0.5], '*:ceramic_armor': [1 / 800, 0.3],
  '*:paint_safety': [1 / 500, 0.7], '*:paint_red': [1 / 600, 0.3], '*:rubber': [1 / 700, 0.3], '*:polymer_grip': [1 / 600, 0.45], '*:polymer': [1 / 600, 0.5],
  '*:brass': [1 / 500, 0.6], '*:ceramic': [0, 0], '*:fabric_black': [0, 0], '*:obsidian': [0, 0],
};
