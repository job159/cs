// 春霆神戟．驚蟄 Thunderclap Halberd — E01 異能 (Qiming Works), docs/PREMIUM_WEAPONS.md §2 E01.
// An industrial high-voltage telescoping hot-stick turned halberd (a lineman's insulated pole with a stun head), not a
// mythic spear. From the butt forward:
//   - butt: a rubber recoil pad with a moulded honeycomb back on a steel cap; a QD sling cup on the left rear; a tinned
//     copper earthing braid bolted to the cap, held to the lower left flank by a P-clip, ending on a bolted lug;
//   - receiver: a 60 x 60 mm square tube (3 mm chamfers, seam welds on the lower chamfers) in gunmetal: machined side
//     pockets, inset access panels (hex screws; the left one carries the 雷能 LED bar, fx_led1-6, and its yellow 雷能
//     legend, the right one a stamped serial strip), the voltage selector (a numbered 0-40 kV dial plate, knurled knob),
//     the yellow 高壓危險 / DANGER 40 kV plate, the QIMING WORKS maker plate, a charge port with a tethered rubber cap and
//     a cable gland on the right, a slotted vent grille underneath, rivet rows, a bolted round front flange; the pistol
//     grip (polymer, recessed rubber overmould panels with a moulded diamond field and a parting line, a ribbed
//     backstrap, a yellow band, a steel cap with a lanyard pin), a trigger guard and a serrated trigger; the capacitor
//     cell magazine (電容匣 label band with polarity marks, three charge pips, copper contacts);
//   - the hero focus on top: the capacitor glass tube (Ø22 x 180) — a clear wall over a rolled-foil element in five
//     wound sections (fx_cap: the pv_core lightning lights it) between bright spacer discs, two copper bus rods, a
//     getter flash; copper electrodes with glowing tips; turned copper end caps (centre boss, HV / 40kV on the rear
//     face) with HV terminal posts: ring lugs under the nuts, crimp barrels and rubber boots into the two HV cables;
//     three steel saddle straps, low side guards, cable clamps and ties;
//   - coil pack: two bolted flanges, four tie rods with acorn nuts, a former and three coils (fx_coil1-3, 40 mm apart):
//     24 turns of round copper wire over a glow core, laced with cord ties; their leads run back to a porcelain terminal
//     block on the rear flange (screws, ring lugs); verdigris on the lugs;
//   - the shaft telescopes in three (fx_seg1 > fx_seg2 > fx_seg3, Ø34 / 30 / 26; 1,380 mm drawn -> 930 collapsed): a
//     black rubber insulation sleeve banded every 60 mm with 45° yellow hazard rings, moulded rings, a white TESTED
//     40 kV · 啟明 band per section, three porcelain insulator groups on the first section (three skirts each, drip
//     lips, a 40kV stamp in black glaze, copper joints; the left hand between groups 1 and 2), knurled twist-lock
//     collars with a bright ferrule rim and a rubber wiper lip on each telescoping joint;
//   - the head (on fx_seg3, scaled HS): a polished corona ring on three standoffs, an octagonal socket with cross bolts,
//     a forged ricasso (驚蟄 cartouche) and collar line, the 216 mm spear (a raised stepped midrib, two fullers a face
//     with riveted copper electrode rails and an arc filament, a four-facet convex primary grind and a micro-bevel), the
//     discharge electrode above (S_arc: a copper arcing horn with a ball tip), and the crescent side blade (fx_blade:
//     160 mm chord, 45 mm sagitta; a thick spine stepping down to a hollow-ground face, a channel inlay with an arc
//     strip, a two-facet ground edge, countersunk lightening holes with bright liners, a riveted reinforcing plate) on
//     a knuckle hinge along s under the socket: at rest it hangs under the head in the spear's plane (the halberd reads
//     at rest), v 1 flips it out 90° to the left (the throw, the inspect).
// Side view, mm: s forward (towards the spear tip), t up, w right. Right palm (grip_r) near the origin.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer';
import { Gun, lathe, cyl, tube, profile, section, plan, box, sphere, ring, sweep, screw, cut, merge, xform, cutters } from '../lib/gunkit.mjs';
import { bakeMeshes } from '../lib/bake.mjs';
import { postBake } from './m4.mjs';
import { TAU, D2R, lerp, smooth, lax, along, loft, ttube, domeAt, dome, curveFn, tessellateFat, insetPoly } from '../lib/sculpt.mjs';

await MeshoptSimplifier.ready;

const STEEL = 'steel', DARK = 'steel_dark', BRIGHT = 'steel_bright', BLUED = 'steel_blued', RUB = 'rubber', YEL = 'paint_yellow', WHITE = 'paint_white',
  PORC = 'porcelain', CU = 'copper', GLASS = 'glass_clear', CORE = 'obsidian', ARC = 'glow_arc', COILGLOW = 'glow_white', CHROME = 'chrome',
  PATINA = 'patina_bronze', GRIP = 'polymer_grip', POLY = 'polymer', GLAZE = 'glaze_black';

// ------------------------------------------------------------------------------------------ layout (drawn / rest)
export const HB = {
  butt: -168, rx0: -150, rx1: 110,          // receiver square tube
  cap: [-105, 75], capT: 46, capR: 11,      // capacitor tube (axis t)
  pack: [124, 236], coils: [140, 180, 220], // coil pack flanges, coil centres
  seg1: [236, 560], seg2: [560, 770], seg3: [770, 940], head: 940, root: 1010, tip: 1226,
  R1: 17, R2: 15, R3: 13,
  C: [80, 200, 170],                        // collapse travel of seg1 / seg2 / seg3
  ins: [316, 438, 494],                     // insulator groups on seg1 (start s, 52 long)
  gripL: 403,
  hinge: [977, -23, 0],                     // crescent knuckle hinge axis (along s), authored at the card's size
  HS: 1.7,                                  // the whole head (socket, spear, electrode, crescent) scaled up about its base:
};                                          // the card's 220 mm spear read as a pin in first person: exaggerated (374 mm
                                            // spear, 272 mm crescent chord) so the halberd reads at rest
const H = HB;
/** head pieces: authored at the card's dimensions, scaled HS about the head's base on the shaft axis */
const HX = (geo) => xform(geo, { scale: H.HS, pivot: [H.head, 0, 0] });
const HP = ([s, t, w]) => [H.head + (s - H.head) * H.HS, t * H.HS, w * H.HS];

// ------------------------------------------------------------------------------------------ helpers
/** chamfered box: octagonal section along s */
const cb = ([s, t, w], [ls, lt, lw], b = 0.6) => {
  const hw = lw / 2, ht = lt / 2, c = Math.min(b, hw - 0.05, ht - 0.05);
  return section([[w - hw + c, t - ht], [w + hw - c, t - ht], [w + hw, t - ht + c], [w + hw, t + ht - c], [w + hw - c, t + ht], [w - hw + c, t + ht],
    [w - hw, t + ht - c], [w - hw, t - ht + c]], s - ls / 2, s + ls / 2, { bevel: Math.min(b, ls / 2 - 0.05), bevelSeg: 1, curveSeg: 2 });
};
/** lathe along s at the shaft axis from [[s, r], ...] */
const LX = (pts, seg = 28, crease) => lathe(pts, { seg, crease });
/** hex bolt head facing direction n ([s,t,w]) at p */
const hexBolt = (p, n, r = 3, h = 2.2) => along([[0, 0], [0, r], [h * 0.8, r], [h, r * 0.82], [h, 0]], p, n, 6, 50);
/** acorn (cap) nut on direction n at p */
const acorn = (p, n, r = 3.6) => along([[0, 0], [0, r], [r * 0.6, r], [r * 0.7, r * 0.82], [r * 1.0, r * 0.74], [r * 1.25, r * 0.5], [r * 1.36, 0]], p, n, 12, 40);
/** long smooth sleeve: lathe rings every `step` mm, so the bake's tessellation (18 mm edges) leaves it alone */
function sleeve(s0, s1, R, { seg = 24, step = 14, ch = 0.6 } = {}) {
  const P = [[s0, 0], [s0, R - ch], [s0 + ch, R]], n = Math.max(1, Math.ceil((s1 - s0 - 2 * ch) / step));
  for (let k = 1; k < n; k++) P.push([s0 + ch + (s1 - s0 - 2 * ch) * k / n, R]);
  P.push([s1 - ch, R], [s1, R - ch], [s1, 0]);
  return LX(P, seg);
}
/** knurled ring: a lathe band with n shallow raised ribs (diamond-ish knurl read) */
function knurl(s0, s1, r, n = 36, { seg = 36 } = {}) {
  const parts = [LX([[s0, r - 1.2], [s0, r - 0.4], [s0 + 0.6, r], [s1 - 0.6, r], [s1, r - 0.4], [s1, r - 1.2]], seg)];
  for (let k = 0; k < n; k++) {
    const a = k / n * TAU;
    parts.push(obox([(s0 + s1) / 2, Math.sin(a) * (r + 0.25), Math.cos(a) * (r + 0.25)], [1, 0, 0], [0, Math.sin(a), Math.cos(a)], [s1 - s0 - 1.4, 0.7, 1.1]));
  }
  return merge(parts);
}
/** 45° hazard ring on a sleeve of radius R centred at s0 (width wd, raised h): the band leans along s by R cos(a) */
function hazardRing(s0, R, wd = 12, h = 0.35, seg = 44) {
  const rings = [];
  for (let i = 0; i < seg; i++) {
    const a = i / seg * TAU, sc = s0 + R * Math.sin(a), cy = Math.sin(a), cz = Math.cos(a);   // leans with t: diagonal from the side
    const P = (s, r) => [s, r * cy, r * cz];
    rings.push([P(sc - wd / 2, R - 0.25), P(sc - wd / 2 + 0.35, R + h), P(sc + wd / 2 - 0.35, R + h), P(sc + wd / 2, R - 0.25)]);
  }
  return loft(rings, { wrap: true, crease: 50 });
}
/** [s,t,w] -> three */
const T3 = (p) => new THREE.Vector3(p[2], p[1], -p[0]);
/** box with its edges along X, Y (Z = X x Y), [s,t,w] directions, centred at c */
function obox(c, X, Y, [lx, ly, lz], r = 0) {
  const x = T3(X).normalize(), y = T3(Y).normalize(), z = new THREE.Vector3().crossVectors(x, y).normalize();
  const geo = r > 0 ? box([0, 0, 0], [lz, ly, lx], { r, seg: 1 }) : new THREE.BoxGeometry(lx, ly, lz);   // (kit box: [s, t, w] sizes -> three z, y, x)
  geo.applyMatrix4(new THREE.Matrix4().makeBasis(x, y, z));
  const C = T3(c);
  geo.translate(C.x, C.y, C.z);
  return geo;
}
/** polygon [[s, t, r?], ...] with its fillets sampled (seg points per fillet) -> [[s, t], ...] */
function rpoly(pts, seg = 4) {
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
const inPoly = (P, x, y) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
/** flat-shaded triangles ([s,t,w] corner triples) -> geometry, each wound away from its `inside` point */
function tris(T) {
  const pos = [], v = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (const [a, b, c, ins] of T) {
    const A = T3(a), B = T3(b), C = T3(c), I = T3(ins);
    e1.subVectors(B, A); e2.subVectors(C, A); v.crossVectors(e1, e2);
    const ctr = A.clone().add(B).add(C).multiplyScalar(1 / 3).sub(I);
    if (v.dot(ctr) < 0) pos.push(A.x, A.y, A.z, C.x, C.y, C.z, B.x, B.y, B.z); else pos.push(A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------------------------------ lettering (our own stroke fonts)
// Latin caps on a 4 x 6 cell, CJK on a 10 x 10 cell (simplified 黑體-like construction lines), polylines in cell units;
// a one-point line is a dot. Raised strokes (proud) sunk into the face a little, so no edge floats.
const LAT = {
  A: [[[0, 0], [0, 4.2], [1.8, 6], [2.2, 6], [4, 4.2], [4, 0]], [[0, 2.8], [4, 2.8]]],
  B: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]], [[3, 3], [4, 2], [4, 1], [3, 0], [0, 0]]],
  C: [[[4, 6], [0.8, 6], [0, 5.2], [0, 0.8], [0.8, 0], [4, 0]]],
  D: [[[0, 0], [0, 6], [2.8, 6], [4, 4.8], [4, 1.2], [2.8, 0], [0, 0]]],
  E: [[[4, 6], [0, 6], [0, 0], [4, 0]], [[0, 3], [3, 3]]],
  G: [[[4, 5.2], [3.2, 6], [0.8, 6], [0, 5.2], [0, 0.8], [0.8, 0], [3.2, 0], [4, 0.8], [4, 2.8], [2.2, 2.8]]],
  H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  I: [[[1, 6], [3, 6]], [[2, 6], [2, 0]], [[1, 0], [3, 0]]],
  J: [[[4, 6], [4, 1], [3, 0], [1, 0], [0, 1]]],
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
  V: [[[0, 6], [2, 0], [4, 6]]],
  W: [[[0, 6], [0.8, 0], [2, 3.6], [3.2, 0], [4, 6]]],
  X: [[[0, 0], [4, 6]], [[0, 6], [4, 0]]],
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
  k: [[[0, 0], [0, 6]], [[3.4, 4], [0.3, 1.6]], [[1.3, 2.4], [3.6, 0]]],
  o: [[[0.8, 0], [0, 0.8], [0, 3.2], [0.8, 4], [3.2, 4], [4, 3.2], [4, 0.8], [3.2, 0], [0.8, 0]]],
  '.': [[[0.5, 0.2]]], '·': [[[0.5, 3]]], '-': [[[0.6, 3], [3.4, 3]]], '+': [[[0.4, 3], [3.6, 3]], [[2, 1.4], [2, 4.6]]], '/': [[[0, 0], [4, 6]]],
};
const NARROW = { '.': 1.6, '·': 1.6 };
const CJK = {
  高: [[[5, 10], [5, 9]], [[0.8, 8.8], [9.2, 8.8]], [[2.8, 7.6], [7.2, 7.6], [7.2, 5.6], [2.8, 5.6], [2.8, 7.6]],
    [[1.2, 0], [1.2, 4.4], [8.8, 4.4], [8.8, 0.6], [8, 0]], [[3.4, 3.2], [6.6, 3.2], [6.6, 1.2], [3.4, 1.2], [3.4, 3.2]]],
  壓: [[[1, 9.6], [9.6, 9.6]], [[1.6, 9.6], [1.6, 4.6], [0.4, 0.4]], [[2.8, 8.6], [4.8, 8.6], [4.8, 6.8], [2.8, 6.8], [2.8, 8.6]],
    [[2.8, 4.4], [2.8, 5.9], [4.8, 5.9], [4.8, 4.4]], [[5.8, 7.6], [9.6, 7.6]], [[7.6, 8.8], [7.6, 7.6], [5.9, 4.8]], [[7.8, 7.0], [9.8, 4.6]],
    [[3.6, 2.6], [9.0, 2.6]], [[6.3, 3.8], [6.3, 0.4]], [[2.6, 0.4], [9.8, 0.4]]],
  危: [[[3.0, 10], [1.4, 7.8]], [[2.6, 9.0], [6.8, 9.0], [5.8, 7.8]], [[1.6, 7.2], [9.4, 7.2]], [[2.2, 7.2], [2.2, 3.4], [0.6, 0.2]],
    [[3.8, 5.6], [8.4, 5.6], [8.4, 2.8]], [[4.6, 5.6], [4.6, 0.8], [5.4, 0.2], [9.4, 0.2], [9.4, 1.4]]],
  險: [[[0.8, 0], [0.8, 10], [2.8, 10], [1.8, 7.2], [3.0, 4.8], [2.0, 3.4]], [[6.6, 10], [3.8, 7.2]], [[6.6, 10], [9.8, 7.2]], [[5.0, 7.6], [8.2, 7.6]],
    [[4.0, 6.4], [5.8, 6.4], [5.8, 4.8], [4.0, 4.8], [4.0, 6.4]], [[7.2, 6.4], [9.0, 6.4], [9.0, 4.8], [7.2, 4.8], [7.2, 6.4]],
    [[5.0, 4.0], [3.6, 0.2]], [[5.0, 3.2], [6.4, 1.2]], [[8.4, 4.0], [7.0, 0.2]], [[8.4, 3.2], [9.8, 0.6]]],
  雷: [[[1.4, 10], [8.6, 10]], [[0.8, 6.2], [0.8, 8.8], [9.2, 8.8], [9.2, 6.4]], [[5, 10], [5, 5.8]],
    [[2.4, 7.9], [3.4, 7.4]], [[2.4, 6.8], [3.4, 6.3]], [[6.6, 7.9], [7.6, 7.4]], [[6.6, 6.8], [7.6, 6.3]],
    [[1.8, 5.0], [8.2, 5.0], [8.2, 0.2], [1.8, 0.2], [1.8, 5.0]], [[5, 5.0], [5, 0.2]], [[1.8, 2.6], [8.2, 2.6]]],
  能: [[[2.6, 10], [0.8, 7.6], [4.0, 7.8]], [[3.2, 8.8], [4.2, 7.3]], [[1.0, 6.6], [1.0, 0]], [[1.0, 6.6], [4.2, 6.6], [4.2, 0.4], [3.4, 0]],
    [[1.0, 4.6], [4.2, 4.6]], [[1.0, 2.6], [4.2, 2.6]], [[6.0, 10], [6.0, 6.4], [6.6, 5.8], [9.6, 5.8], [9.6, 6.8]], [[8.8, 9.4], [6.0, 8.0]],
    [[6.0, 5.0], [6.0, 0.8], [6.6, 0.2], [9.6, 0.2], [9.6, 1.2]], [[8.8, 4.4], [6.0, 3.0]]],
  電: [[[1.4, 10], [8.6, 10]], [[0.8, 6.6], [0.8, 8.9], [9.2, 8.9], [9.2, 6.8]], [[5, 10], [5, 6.2]],
    [[2.4, 8.1], [3.4, 7.7]], [[2.4, 7.1], [3.4, 6.7]], [[6.6, 8.1], [7.6, 7.7]], [[6.6, 7.1], [7.6, 6.7]],
    [[1.8, 5.4], [8.0, 5.4], [8.0, 1.8], [1.8, 1.8], [1.8, 5.4]], [[1.8, 3.6], [8.0, 3.6]], [[5, 6.0], [5, 0.6], [5.6, 0], [9.6, 0], [9.6, 1.0]]],
  容: [[[5, 10], [5, 9.0]], [[0.8, 7.6], [0.8, 8.8], [9.2, 8.8], [9.2, 7.6]], [[3.6, 7.8], [2.2, 6.4]], [[6.4, 7.8], [7.8, 6.4]],
    [[5, 7.0], [0.6, 3.8]], [[5, 7.0], [9.4, 3.8]], [[2.6, 3.4], [7.4, 3.4], [7.4, 0], [2.6, 0], [2.6, 3.4]]],
  匣: [[[9.4, 9.6], [0.8, 9.6], [0.8, 0.2], [9.6, 0.2]], [[2.6, 8.0], [7.6, 8.0], [7.6, 3.8], [2.6, 3.8], [2.6, 8.0]], [[2.6, 5.9], [7.6, 5.9]], [[5.1, 8.0], [5.1, 1.4]]],
  啟: [[[2.6, 10], [3.2, 9.2]], [[1.0, 8.6], [4.6, 8.6], [4.6, 6.6], [1.0, 6.6]], [[1.0, 8.6], [1.0, 6.0], [0.2, 4.6]], [[1.6, 3.8], [4.8, 3.8], [4.8, 0.2], [1.6, 0.2], [1.6, 3.8]],
    [[6.8, 10], [5.6, 7.2]], [[6.2, 8.2], [9.6, 8.2], [8.8, 6.0], [5.4, 0.4]], [[6.6, 5.0], [9.8, 0.4]]],
  明: [[[0.6, 8.0], [3.6, 8.0], [3.6, 2.0], [0.6, 2.0], [0.6, 8.0]], [[0.6, 5.0], [3.6, 5.0]], [[5.4, 10], [5.4, 3], [4.6, 0.4]],
    [[5.4, 10], [9.2, 10], [9.2, 0.6], [8.4, 0]], [[5.4, 7.0], [9.2, 7.0]], [[5.4, 4.4], [9.2, 4.4]]],
  驚: [[[0.6, 9.3], [5.2, 9.3]], [[1.8, 10], [1.8, 8.6]], [[4.0, 10], [4.0, 8.6]], [[1.6, 8.0], [0.6, 6.6]], [[1.4, 7.7], [5.0, 7.7], [5.0, 5.8], [4.4, 5.5]],
    [[2.2, 6.9], [3.9, 6.9], [3.9, 5.9], [2.2, 5.9], [2.2, 6.9]], [[7.0, 10], [6.0, 8.4]], [[6.4, 8.9], [9.6, 8.9], [8.6, 7.3], [5.8, 5.6]], [[7.0, 7.6], [9.8, 5.6]],
    [[1.2, 5.0], [8.0, 5.0]], [[1.2, 5.0], [1.2, 1.6], [9.0, 1.6], [9.0, 0.5], [8.3, 0]], [[1.2, 3.9], [7.6, 3.9]], [[1.2, 2.8], [7.6, 2.8]], [[4.4, 5.0], [4.4, 1.6]],
    [[2.4, 0.9], [2.0, 0]], [[4.0, 0.9], [3.7, 0]], [[5.6, 0.9], [5.4, 0]], [[7.2, 0.9], [7.0, 0]]],
  蟄: [[[1.0, 9.2], [4.6, 9.2]], [[2.8, 10], [2.8, 5.4]], [[0.6, 7.8], [5.0, 7.8]], [[1.0, 6.6], [4.6, 6.6]], [[0.6, 5.4], [5.0, 5.4]],
    [[5.8, 8.8], [8.4, 8.8], [8.4, 6.2], [9.0, 5.6], [9.8, 5.8]], [[7.2, 10], [7.2, 8.8], [5.6, 5.4]], [[6.8, 7.4], [7.6, 6.6]],
    [[2.6, 4.2], [7.4, 4.2], [7.4, 2.0], [2.6, 2.0], [2.6, 4.2]], [[5, 4.8], [5, 0.6]], [[1.4, 0.2], [8.6, 0.8]], [[7.8, 1.6], [8.8, 0.4]]],
};
const isCJK = (ch) => /[㐀-鿿]/.test(ch);
/**
 * Raised stroke lettering laid out in a plane: `at` the centre of the line, u the reading direction, v up, n out of the
 * face ([s,t,w]); h = Latin cap height, hz = CJK glyph height, sw / swz stroke widths; align -1 / 0 / 1 = left / centre /
 * right; segLen subdivides the strokes (for bending onto curved faces).
 */
function label(str, { at, u, v, n, h = 3, hz = h * 1.45, sw = h * 0.16, swz = hz * 0.065, proud = 0.12, sink = 0.2, align = 0, segLen = 0 }) {
  const U = T3(u).normalize(), Vv = T3(v).normalize(), N = T3(n).normalize(), A = T3(at);
  if (new THREE.Vector3().crossVectors(U, Vv).dot(N) < 0.5) console.warn('[chunting] mirrored label', str);
  const kL = h / 6, kC = hz / 10, items = [];
  let x = 0, gap = 0;
  for (const ch of str) {
    if (ch === ' ') { x += 3.2 * kL; gap = 0; continue; }
    if (isCJK(ch)) { items.push({ g: CJK[ch], k: kC, x, y: -hz / 2, w: swz }); x += 11 * kC; gap = 1 * kC; }
    else { items.push({ g: LAT[ch] || [], k: kL, x, y: -h / 2, w: sw }); const adv = NARROW[ch] ?? 5.6; x += adv * kL; gap = (adv - (NARROW[ch] ? 1 : 4)) * kL; }
  }
  const width = x - gap, x0 = align < 0 ? 0 : align > 0 ? -width : -width / 2, out = [];
  const P = (it, p) => A.clone().addScaledVector(U, x0 + it.x + p[0] * it.k).addScaledVector(Vv, it.y + p[1] * it.k);
  const stroke = (a, b, w) => {
    const d = b.clone().sub(a), L = d.length();
    if (L < 1e-6) d.copy(U); else d.normalize();
    const p = new THREE.Vector3().crossVectors(N, d), len = L + w;
    const geo = new THREE.BoxGeometry(len, w, proud + sink, segLen ? Math.max(1, Math.ceil(len / segLen)) : 1, 1, 1);
    geo.applyMatrix4(new THREE.Matrix4().makeBasis(d, p, N));
    const c = a.clone().add(b).multiplyScalar(0.5).addScaledVector(N, (proud - sink) / 2);
    geo.translate(c.x, c.y, c.z);
    out.push(geo);
  };
  for (const it of items) for (const line of it.g) {
    if (line.length === 1) { const q = P(it, line[0]); stroke(q, q, it.w * 1.35); continue; }
    for (let i = 0; i + 1 < line.length; i++) stroke(P(it, line[i]), P(it, line[i + 1]), it.w);
  }
  return merge(out);
}
/** label wrapped round a shaft-parallel cylinder (radius R at axis t/w = tc/wc), centred at s0 and angle a0 (deg from +w towards +t):
 *  glyph up = +s, reading round the shaft (so it reads from behind the stick, the way the player sees it) */
function wrapLabel(str, { s0, R, a0, tc = 0, wc = 0, ...o }) {
  const geo = label(str, { ...o, at: [0, 0, 0], u: [0, 0, 1], v: [1, 0, 0], n: [0, 1, 0], segLen: 2 });
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = a0 * D2R - x / R, r = R + y;
    p.setXYZ(i, wc + r * Math.cos(a), tc + r * Math.sin(a), z - s0);
  }
  geo.computeVertexNormals();
  return geo;
}

/** porcelain insulator group from s0 (52 mm): copper joint, three skirts (Ø64, 6 thick, 14 apart, drip lips), copper joint */
function insulator(s0, Rs) {
  const porc = [], cu = [];
  // copper joints: crimped ferrules
  for (const [a, b] of [[s0, s0 + 7], [s0 + 45, s0 + 52]]) {
    cu.push(LX([[a, Rs - 0.5], [a, Rs + 1.6], [a + 0.8, Rs + 3], [b - 0.8, Rs + 3], [b, Rs + 1.6], [b, Rs - 0.5]], 28));
    for (let k = 0; k < 6; k++) { const ang = (k / 6 * 360 + 15) * D2R, n = [0, Math.sin(ang), Math.cos(ang)]; cu.push(obox([(a + b) / 2, n[1] * (Rs + 3.1), n[2] * (Rs + 3.1)], [1, 0, 0], n, [3.2, 0.9, 2.2])); }
  }
  // the porcelain body: a hub with three skirts, sloped faces towards the head, a rolled rim, a drip lip behind
  const P = [[s0 + 7, Rs + 2.4]];
  for (const sc of [s0 + 14, s0 + 26, s0 + 38]) {
    P.push([sc - 4.2, Rs + 2.4], [sc - 3.6, Rs + 5.5], [sc - 3.4, 23.5], [sc - 3.3, 27.6], [sc - 2.8, 28.2], [sc - 2.6, 27.6], [sc - 2.4, 30.4], [sc - 1.6, 31.8], [sc - 0.4, 32],
      [sc + 0.8, 31.4], [sc + 1.6, 29.5], [sc + 2.8, 24.5], [sc + 3.6, Rs + 5.8], [sc + 4.4, Rs + 2.4]);
  }
  P.push([s0 + 45, Rs + 2.4]);
  porc.push(LX([[s0 + 7, Rs - 0.5], ...P, [s0 + 45, Rs - 0.5]], 28, 30));
  // the 40kV rating stamped in black glaze on the hub between skirts 1 and 2 (facing the shooter, upper left)
  const glaze = wrapLabel('40kV', { s0: s0 + 20.1, R: Rs + 2.4, a0: 150, h: 1.9, sw: 0.32, proud: 0.08, sink: 0.25 });
  return { porc: merge(porc), cu: merge(cu), glaze };
}

// ------------------------------------------------------------------------------------------ spear (lofts, card size)
// a forged ricasso (985 .. 1007.5) and collar line, then the blade from s0 to the tip: a raised stepped midrib, a fuller
// each side of it (an inlaid copper electrode rail with an arc filament), flats, a convex primary grind in four facets
// (the grind lines read in the facet creases) and a 0.7 mm micro-bevel to the edge
const SPR = { r0: 985, r1: 1007.5, s0: 1010.5, tip: H.tip };
const SPL = SPR.tip - SPR.s0;
const spH = curveFn([[0, 9.8], [0.035, 13.8], [0.09, 17.6], [0.17, 19.1], [0.27, 18.6], [0.44, 15.6], [0.62, 11.6], [0.78, 7.4], [0.9, 3.9], [0.97, 1.4], [1, 0.25]]);
const spTm = (u) => lerp(5.3, 0.7, Math.pow(u, 0.85));                    // midrib top (half thickness)
const spPr = (u) => lerp(1.5, 0.3, u);                                    // the midrib stands proud of the flats
const spRw = (u) => lerp(2.5, 0.45, u);                                   // midrib flat (half width)
const spEnv = (u) => smooth(0, 0.035, u) * (1 - smooth(0.46, 0.64, u));   // the fullers run out before the taper
const spS = (u) => SPR.s0 + u * SPL;
/** the blade's half section (t >= 0, w >= 0) from the edge in to the midrib, [[t, w], ...] (13 points; bevel = the first 6) */
function spHalf(u) {
  const h = Math.max(0.25, spH(u)), Tm = spTm(u), pr = spPr(u), Tf = Tm - pr, rw = spRw(u), st = pr * 0.9;
  const eb = Math.min(6.4, h * 0.42), mb = Math.min(0.7, h * 0.18), Wm = Math.min(0.45, Tf * 0.5), We = 0.08;
  const env = spEnv(u), fw = 4.2 * env, fd = 0.95 * env;
  const f0 = rw + st + 1.1, f1 = f0 + fw, e0 = h - eb, lim = e0 - 0.4, k = f1 > lim ? Math.max(0.05, lim / f1) : 1;
  const Tb = Math.max(Wm + 0.15, Tf * 0.8);
  const P = [[h, We], [h - mb, Wm]];
  for (let r = 3; r >= 1; r--) { const x = r / 4; P.push([e0 + (h - mb - e0) * x, Wm + (Tb - Wm) * Math.pow(1 - x, 0.72)]); }
  P.push([e0, Tb], [f1 * k, Tf], [(f1 - 0.3) * k, Tf - fd], [(f0 + 0.3) * k, Tf - fd], [f0 * k, Tf], [(rw + st) * k, Tf], [rw * k, Tm], [0, Tm]);
  return { P, Tf, f0: f0 * k, f1: f1 * k, fd, env };
}
function spearGeo() {
  const N = 66, body = [], bevT = [], bevB = [];
  for (let i = 0; i <= N; i++) {
    const l = i / N, u = Math.min(0.997, 0.45 * l + 0.55 * (1 - Math.cos(Math.PI * l)) / 2), s = spS(u), { P } = spHalf(u);
    // body: +w face from the top bevel line round the midrib to the bottom one, the -w face back (closing across the bevels)
    const inner = P.slice(5);
    const face = [...inner, ...inner.slice(0, -1).reverse().map(([t, w]) => [-t, w])];
    body.push([...face, ...face.slice().reverse().map(([t, w]) => [t, -w])].map(([t, w]) => [s, t, w]));
    const bev = P.slice(0, 6).reverse();                               // [e0 .. edge] on +w, back on -w
    const ring = [...bev, ...bev.slice().reverse().map(([t, w]) => [t, -w])];
    bevT.push(ring.map(([t, w]) => [s, t, w]));
    bevB.push(ring.map(([t, w]) => [s, -t, w]));
  }
  // electrode rails: copper strips in the four fullers, a slit with an arc filament along their crowns, three rivets each
  const rails = [], fil = [], rivets = [];
  for (const sd of [-1, 1]) for (const ts of [-1, 1]) {
    const R = [], F = [];
    for (let i = 0; i <= 30; i++) {
      const u = lerp(0.045, 0.45, i / 30), s = spS(u), { Tf, f0, f1, fd } = spHalf(u);
      const x0 = f0 + 0.42, x1 = f1 - 0.42, cx = (x0 + x1) / 2, wb = Tf - fd - 0.05, wt = Tf - 0.3;
      const sec = [[x0, wb], [x0, wt - 0.22], [x0 + 0.22, wt], [cx - 0.5, wt], [cx - 0.36, wt - 0.4], [cx + 0.36, wt - 0.4], [cx + 0.5, wt], [x1 - 0.22, wt], [x1, wt - 0.22], [x1, wb]];
      R.push(sec.map(([t, w]) => [s, ts * t, sd * w]));
      F.push([[cx - 0.3, wt - 0.44], [cx + 0.3, wt - 0.44], [cx + 0.3, wt - 0.14], [cx - 0.3, wt - 0.14]].map(([t, w]) => [s, ts * t, sd * w]));
    }
    rails.push(loft(R, { crease: 35 })); fil.push(loft(F));
    for (const u of [0.1, 0.25, 0.4]) {
      const { Tf, f0, f1 } = spHalf(u);
      rivets.push(domeAt([spS(u), ts * (f0 + f1) / 2, sd * (Tf - 0.36)], [0, 0, sd], 0.95, 0.55, 10));
    }
  }
  return { body: loft(body, { crease: 7 }), bevel: merge([loft(bevT, { crease: 7 }), loft(bevB, { crease: 7 })]), rails: merge(rails), fil: merge(fil), rivets: merge(rivets) };
}

// ------------------------------------------------------------------------------------------ crescent (side view, hanging)
// horns at the chord line t -26 (s 925 / 1075), the concave spine dips to -43.8, the convex edge to -71; an arm rises to
// the hinge eye. Vertical sections from the spine (d 0) down to the edge (d L): a thick spine band, a step, a hollow
// grind with the arc channel inlaid near its foot, a two-facet ground edge and a micro-bevel.
const CR = { s0: 925, s1: 1075, tc: -26, inner: 17, sag: 45 };
const CRG = (() => {
  const half = (CR.s1 - CR.s0) / 2, sm = (CR.s0 + CR.s1) / 2;
  const Ro = (half * half + CR.sag * CR.sag) / (2 * CR.sag), co = CR.tc - CR.sag + Ro;
  const Ri = (half * half + CR.inner * CR.inner) / (2 * CR.inner), ci = CR.tc - CR.inner + Ri, hx = half - 1.6;
  return { sm, hx, tin: (x) => ci - Math.sqrt(Ri * Ri - x * x) - 0.8 * (1 - Math.abs(x) / hx), tout: (x) => co - Math.sqrt(Ro * Ro - x * x) };
})();
/** crescent section at x: { body: [[d, w]...] (+w half, spine -> bevel line), bev: [[d, w]...] (bevel line -> edge), glow, L } */
function crSection(x) {
  const L = CRG.tin(x) - CRG.tout(x), Ts = 3.4, Tg = 2.4, Te = 1.15, Wm = 0.42, We = 0.1;
  const c = Math.min(0.7, 0.05 * L), sb = Math.min(5.5, 0.24 * L), eb = Math.min(4.6, 0.26 * L), mb = Math.min(0.6, 0.06 * L);
  const d0 = sb + c, d1 = L - eb, hol = (d) => Te + (Tg - Te) * Math.pow(1 - Math.min(1, Math.max(0, (d - d0) / Math.max(0.01, d1 - d0))), 1.6);
  const ge = smooth(9, 13, L), gw = 0.8 * ge, gd = 0.55 * ge, gc = Math.max(d0 + 1, d1 - 2.6), gA = gc - gw - 0.15, gB = gc + gw + 0.15;
  const body = [[0, Ts - c], [c, Ts], [sb, Ts], [d0, Tg], [(d0 + gA) / 2, hol((d0 + gA) / 2)], [gA, hol(gA)], [gc - gw, hol(gc - gw) - gd], [gc + gw, hol(gc + gw) - gd], [gB, hol(gB)], [d1, Te]];
  for (let i = 1; i < body.length; i++) body[i][0] = Math.max(body[i][0], body[i - 1][0] + 0.004 * L);   // monotone towards the horns
  const bev = [[d1, Te], [d1 + (L - mb - d1) * 0.5, Wm + (Te - Wm) * 0.62], [L - mb, Wm], [L, We]];
  const glow = ge > 0.02 ? [[gc - gw * 0.8, hol(gc) - gd + 0.02], [gc + gw * 0.8, hol(gc) - gd + 0.02], [gc + gw * 0.8, hol(gc) - gd + 0.3], [gc - gw * 0.8, hol(gc) - gd + 0.3]] : null;
  return { body, bev, glow, L, hol };
}
function crescentGeo() {
  const N = 48, body = [], bev = [], gL = [], gR = [];
  for (let i = 0; i <= N; i++) {
    const l = i / N, x = -CRG.hx + 2 * CRG.hx * (0.4 * l + 0.6 * (1 - Math.cos(Math.PI * l)) / 2), s = CRG.sm + x, tin = CRG.tin(x);
    const S = crSection(x), P = (d, w) => [s, tin - d, w];
    body.push([...S.body.map(([d, w]) => P(d, w)), ...S.body.slice().reverse().map(([d, w]) => P(d, -w))]);
    bev.push([...S.bev.map(([d, w]) => P(d, w)), ...S.bev.slice().reverse().map(([d, w]) => P(d, -w))]);
    if (Math.abs(x) < 0.82 * CRG.hx && S.glow) { gR.push(S.glow.map(([d, w]) => P(d, w))); gL.push(S.glow.map(([d, w]) => P(d, -w))); }
  }
  // lightening holes in the hollow grind: countersunk both faces, bright liners
  let moon = loft(body, { crease: 8 });
  const holes = [], liners = [];
  for (const f of [-0.42, 0, 0.42]) {
    const x = f * CRG.hx, S = crSection(x), d = (Math.min(5.5, 0.24 * S.L) + S.L - Math.min(4.6, 0.26 * S.L) - 2.6) / 2, r = f ? 3.3 : 4.3;
    const s = CRG.sm + x, t = CRG.tin(x) - d - (f ? 0 : 0.6), wl = S.hol(d) + 0.12, Wc = wl + 0.5;
    holes.push(along([[0, 0], [0, r + 1.2], [1.2, r], [2 * Wc - 1.2, r], [2 * Wc, r + 1.2], [2 * Wc, 0]], [s, t, -Wc], [0, 0, 1], 28, 30));
    liners.push(along([[0, r - 0.55], [0, r + 0.15], [0.35, r + 0.45], [2 * wl - 0.35, r + 0.45], [2 * wl, r + 0.15], [2 * wl, r - 0.55], [0, r - 0.55]], [s, t, -wl], [0, 0, 1], 28, 40));
  }
  moon = cut(moon, holes);
  return { moon, bev: loft(bev, { crease: 8 }), glow: merge([loft(gR), loft(gL)]), liners: merge(liners) };
}

/** moulded diamond field (truncated pyramids, pitch p, height ph) on the grip face |w| = wb inside poly (s, t) */
function diamondField(poly, sd, wb, ph, p, rk, avoid = []) {
  const DU = [-Math.sin(rk), -Math.cos(rk)], DV = [Math.cos(rk), -Math.sin(rk)], T = [];
  const c0 = [0, 0]; for (const q of poly) { c0[0] += q[0] / poly.length; c0[1] += q[1] / poly.length; }
  const at = (u, v) => [c0[0] + u * DU[0] + v * DV[0], c0[1] + u * DU[1] + v * DV[1]];
  for (let i = -40; i <= 40; i++) for (let j = -20; j <= 20; j++) for (const o of [0, 0.5]) {
    const u = (i + o) * p, v = (j + o) * p, cn = [[u + p / 2, v], [u, v + p / 2], [u - p / 2, v], [u, v - p / 2]].map(([a, b]) => at(a, b));
    if (!cn.every(([s, t]) => inPoly(poly, s, t))) continue;
    const ctr = at(u, v);
    if (avoid.some(([s, t, r]) => Math.hypot(ctr[0] - s, ctr[1] - t) < r)) continue;
    const top = cn.map(([s, t]) => [ctr[0] + (s - ctr[0]) * 0.28, ctr[1] + (t - ctr[1]) * 0.28]);
    const B = cn.map(([s, t]) => [s, t, sd * (wb - 0.05)]), Tp = top.map(([s, t]) => [s, t, sd * (wb + ph)]), ins = [ctr[0], ctr[1], sd * (wb - 1)];
    for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; T.push([B[k], B[k2], Tp[k2], ins], [B[k], Tp[k2], Tp[k], ins]); }
    T.push([Tp[0], Tp[1], Tp[2], ins], [Tp[0], Tp[2], Tp[3], ins]);
  }
  return tris(T);
}

export default function build() {
  const g = new Gun('chunting');

  // ======================================================================== butt
  {
    const s0 = H.butt, s1 = H.rx0;
    const oct = [[-29, -27, 3], [29, -27, 3], [31, -25, 3], [31, 25, 3], [29, 27, 3], [-29, 27, 3], [-31, 25, 3], [-31, -25, 3]].map(([w, t, r]) => [w * 1.02, t * 1.13, r]);
    // rubber recoil pad: a 7.6 mm pad, a moulded honeycomb standing 2.8 mm proud of its back inside a rim wall
    g.add(section(oct, s0 + 2.6, s0 + 11, { bevel: 2, bevelSeg: 2, curveSeg: 3 }), RUB);
    const rimIn = rpoly(oct.map(([w, t, r]) => [w * 0.93, t * 0.93, r]), 3);
    g.add(section(oct, s0, s0 + 2.9, { bevel: 0.7, bevelSeg: 1, curveSeg: 3, holes: [rimIn.slice().reverse()] }), RUB);
    {
      const F = 7.6, a = F / Math.sqrt(3), edges = new Map(), walls = [];
      const clip = (p, q) => {   // Cyrus-Beck against the (convex) inner rim
        let t0 = 0, t1 = 1;
        for (let i = 0; i < rimIn.length; i++) {
          const A = rimIn[i], Bp = rimIn[(i + 1) % rimIn.length], nx = -(Bp[1] - A[1]), ny = Bp[0] - A[0];   // inward for CCW
          const den = nx * (q[0] - p[0]) + ny * (q[1] - p[1]), num = nx * (p[0] - A[0]) + ny * (p[1] - A[1]);
          if (Math.abs(den) < 1e-9) { if (num < 0) return null; continue; }
          const tt = -num / den;
          if (den > 0) t0 = Math.max(t0, tt); else t1 = Math.min(t1, tt);
          if (t0 > t1) return null;
        }
        return [[p[0] + (q[0] - p[0]) * t0, p[1] + (q[1] - p[1]) * t0], [p[0] + (q[0] - p[0]) * t1, p[1] + (q[1] - p[1]) * t1]];
      };
      let ccw = 0; for (let i = 0; i < rimIn.length; i++) { const A = rimIn[i], Bp = rimIn[(i + 1) % rimIn.length]; ccw += A[0] * Bp[1] - Bp[0] * A[1]; }
      if (ccw < 0) rimIn.reverse();
      for (let j = -6; j <= 6; j++) for (let i = -6; i <= 6; i++) {
        const cw = i * F + (j & 1 ? F / 2 : 0), ct = j * 1.5 * a;
        const V = [0, 1, 2, 3, 4, 5].map((k) => [cw + a * Math.cos((90 + 60 * k) * D2R), ct + a * Math.sin((90 + 60 * k) * D2R)]);
        for (let k = 0; k < 6; k++) {
          const p = V[k], q = V[(k + 1) % 6], key = [Math.round((p[0] + q[0]) * 5), Math.round((p[1] + q[1]) * 5)].join();
          if (edges.has(key)) continue;
          edges.set(key, 1);
          const c = clip(p, q);
          if (!c) continue;
          const [A, Bq] = c, L = Math.hypot(Bq[0] - A[0], Bq[1] - A[1]);
          if (L < 0.4) continue;
          walls.push(obox([s0 + 1.45, (A[1] + Bq[1]) / 2, (A[0] + Bq[0]) / 2], [0, Bq[1] - A[1], Bq[0] - A[0]], [1, 0, 0], [L + 1.0, 2.9, 1.1]));
        }
      }
      g.add(merge(walls), RUB);
    }
    // the steel cap, four hex bolts into the pad
    g.add(section([[-28, -28], [28, -28], [31, -25], [31, 25], [28, 28], [-28, 28], [-31, 25], [-31, -25]], s0 + 10, s1 + 1, { bevel: 0.8 }), STEEL);
    for (const w of [-23, 23]) for (const t of [-23, 23]) g.add(hexBolt([s0 + 10, t, w], [-1, 0, 0], 2.4, 1.6), DARK);
    // earthing braid: a ring lug bolted to the cap's left face, the tinned-copper braid along the lower left flank under
    // a P-clip, a ring lug on an earthing stud; plaited chevrons on a flat strap
    {
      const W = -30.6, tc = -24.3, sA = -152, sB = -101;
      g.add(cb([sA, -21.5, -31.4], [8, 8.4, 0.9], 0.3), CU);
      g.add(hexBolt([sA, -21.5, -31.85], [0, 0, -1], 2.3, 1.6), DARK);
      g.add(cb([(sA + 4 + sB - 4) / 2, tc, W], [sB - sA - 8, 4.8, 1.2], 0.35), CU);
      const plait = [];
      for (let s = sA + 5; s < sB - 5; s += 1.7) for (const sg of [-1, 1]) { const a = sg * 32 * D2R; plait.push(obox([s, tc + sg * 1.15, W - 0.62], [Math.cos(a), Math.sin(a), 0], [-Math.sin(a), Math.cos(a), 0], [2.3, 1.9, 0.5])); }
      g.add(merge(plait), CU);
      for (const [s, sg] of [[sA + 2, 1], [sB - 2, -1]]) g.add(cb([s + sg * 1.5, tc, W - 0.1], [4, 5.6, 1.6], 0.4), CU);   // crimp ferrules
      g.add(cb([sB + 1, -22.6, -30.4], [8, 7.6, 0.9], 0.3), CU);
      g.add(along([[0, 0], [0, 4.2], [0.5, 4.2], [0.5, 0]], [sB + 1, -22.6, -30.8], [0, 0, -1], 14), BRIGHT);   // washer
      g.add(hexBolt([sB + 1, -22.6, -31.25], [0, 0, -1], 2.4, 1.8), DARK);
      // P-clip: a steel band over the braid, screwed above it
      g.add(cut(cb([-140, -22.2, -31.2], [5, 9.8, 2.6], 0.5), [cb([-140, tc, -30.2], [6, 5.2, 2.2], 0.1)]), STEEL);
      g.add(screw([-140, -18.9, -32.5], 1.6, { face: '-w', depth: 0.8 }), DARK);
    }
  }

  // ======================================================================== receiver
  {
    const s0 = H.rx0, s1 = H.rx1;
    const sq = [[-27, -30, 0.8], [27, -30, 0.8], [30, -27, 0.8], [30, 27, 0.8], [27, 30, 0.8], [-27, 30, 0.8], [-30, 27, 0.8], [-30, -27, 0.8]];
    let shell = section(sq, s0, s1, { bevel: 1.4, bevelSeg: 2, curveSeg: 2 });
    const C = [];
    // side pockets (both sides, 2 mm deep): rear access bay, front vent bay
    for (const sd of [-1, 1]) {
      C.push(cutters.pocketW([[-136, -19, 4], [-52, -19, 4], [-52, 19, 4], [-136, 19, 4]], sd * 28, 40));
      C.push(cutters.pocketW([[-36, -20, 4], [96, -20, 4], [96, 16, 4], [-36, 16, 4]], sd * 28, 40));
    }
    // magwell opening and the trigger slot; vent slots under the grille
    C.push(cutters.box([80, -31, 0], [56, 10, 37]));
    C.push(cutters.box([20, -30, 0], [16, 8, 7]));
    for (let k = 0; k < 9; k++) C.push(cutters.box([-120 + k * 8.4, -30, 0], [3, 2.4, 21]));
    shell = cut(shell, C);
    g.add(shell, STEEL);
    // seam welds along both lower chamfers: a rippled bead (lofted, the ripple every 3 mm)
    for (const sd of [-1, 1]) {
      // the chamfer from (t -27, w ±30) to (t -30, w ±27): along (-1, -sd)/√2 in (t, w), outward normal (-1, sd)/√2
      const cw = sd * 28.6, ct = -28.6, rr = [];
      for (let s = -146; s <= 106; s += 1.5) {
        const rip = 0.5 + 0.5 * Math.cos(s / 4.5 * TAU), ww = 1.05 + 0.12 * rip, hh = 0.62 + 0.2 * rip;
        rr.push([[-1, -0.3], [-0.75, 0.55], [0, 1], [0.75, 0.55], [1, -0.3]].map(([a, b]) => [s, ct + (-a * ww - b * hh) / Math.SQRT2, cw + (-sd * a * ww + sd * b * hh) / Math.SQRT2]));
      }
      g.add(loft(rr, { crease: 40 }), STEEL);
    }
    // vent grille under the rear: a dark plate with nine slots over the shell's slots, four screws
    {
      const holes = []; for (let k = 0; k < 9; k++) { const sc = -120 + k * 8.4; holes.push([[sc - 1.5, -10.5, 1.4], [sc + 1.5, -10.5, 1.4], [sc + 1.5, 10.5, 1.4], [sc - 1.5, 10.5, 1.4]]); }
      g.add(plan([[-131, -15, 2], [-46, -15, 2], [-46, 15, 2], [-131, 15, 2]], { h: 1.3, ct: -30.55, bevel: 0.4, bevelSeg: 1, curveSeg: 2, holes }), DARK);
      for (const s of [-127.5, -49.5]) for (const w of [-12.5, 12.5]) g.add(domeAt([s, -31.1, w], [0, -1, 0], 1.3, 0.6, 10), STEEL);
    }
    // capacitor heat sinks in the front bays: a machined block of seven fins standing 4.5 mm proud, a clamp bar across
    for (const sd of [-1, 1]) {
      const base = sd * 28.4;
      g.add(cb([79, -2, base], [36, 34, 1.4], 0.4), DARK);
      for (let k = 0; k < 7; k++) g.add(cb([79, -15.6 + k * 4.55, sd * 30.6], [34, 1.7, 4.6], 0.45), DARK);
      g.add(cb([79, -2, sd * 32.6], [5, 34, 1.4], 0.5), STEEL);
      for (const t of [-14.5, 10.5]) g.add(hexBolt([79, t, sd * 33.3], [0, 0, sd], 1.8, 1.2), BRIGHT);
    }
    const LEFT = { u: [-1, 0, 0], v: [0, 1, 0], n: [0, 0, -1] }, RIGHT = { u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] };
    // voltage selector (left, between the bays): a dial plate numbered 0-40 kV with major / minor ticks, a knurled knob
    {
      const c = [-40, 4], W = -30;
      g.add(along([[0, 0], [0, 15.2], [0.6, 15.6], [1.3, 15.2], [1.3, 0]], [c[0], c[1], W + 0.1], [0, 0, -1], 40), DARK);
      const face = W - 1.2;
      for (let k = 0; k <= 8; k++) {
        const a = (60 - 15 * k) * D2R, major = k % 2 === 0, r0 = 9.1, r1 = major ? 11.1 : 10.2;
        g.add(obox([c[0] + Math.sin(a) * (r0 + r1) / 2, c[1] + Math.cos(a) * (r0 + r1) / 2, face - 0.1], [0, 0, -1], [Math.sin(a), Math.cos(a), 0], [0.5, r1 - r0, major ? 0.7 : 0.45]), k === 8 ? YEL : WHITE);
        if (major) g.add(label(String(k * 5), { at: [c[0] + Math.sin(a) * 13.2, c[1] + Math.cos(a) * 13.2, face], ...LEFT, h: 2.0, sw: 0.36, proud: 0.1, sink: 0.15 }), k === 8 ? YEL : WHITE);
      }
      g.add(label('kV', { at: [c[0], c[1] - 11.6, face], ...LEFT, h: 2.2, sw: 0.38, proud: 0.1, sink: 0.15 }), WHITE);
      // the knob: a skirt, a knurled grip, a yellow pointer line across the cap
      g.add(along([[0, 0], [0, 7.2], [1, 7.6], [5.6, 7.6], [6.4, 6.6], [6.8, 0]], [c[0], c[1], face + 0.2], [0, 0, -1], 24), DARK);
      { const kn = []; for (let k = 0; k < 18; k++) { const a = k / 18 * TAU; kn.push(obox([c[0] + Math.cos(a) * 7.75, c[1] + Math.sin(a) * 7.75, face - 3.4], [Math.cos(a), Math.sin(a), 0], [0, 0, -1], [1, 4.6, 1.1])); } g.add(merge(kn), DARK); }
      g.add(xform(cb([0, 3.2, 0], [1.4, 6.4, 0.8], 0.3), { rot: [-30, 0, 0], move: [c[0], c[1], face - 6.9] }), YEL);
    }
    // rear access panels (inset plates, hex screws) both sides
    for (const sd of [-1, 1]) {
      g.add(cb([-94, 0, sd * 28.6], [80, 34, 1.4], 0.5), DARK);
      for (const [s, t] of [[-131, -13], [-131, 13], [-63, -13], [-63, 13]]) g.add(hexBolt([s, t, sd * 29.2], [0, 0, sd], 2.1, 1.3), STEEL);
    }
    // 雷能 LED bar on the left (the shooter's side): bezel, six cells (fx_led1-6), a smoked lens strip over a dark well;
    // the yellow 雷能 legend and a 0 - 120 scale printed on the panel under it
    {
      const bz = [];
      const cx = (k) => -97 + (k - 2.5) * 8.4;
      bz.push(cut(cb([-97, 10.5, -29.4], [58, 14, 3], 0.8), [cutters.box([-97, 10.5, -31], [51, 7.6, 3])]));
      for (let k = 0; k < 5; k++) bz.push(cb([cx(k) + 4.2, 10.5, -29.6], [1.1, 7.6, 1.6], 0.2));
      g.add(merge(bz), DARK);
      for (let k = 0; k < 6; k++) {
        const led = g.part(`fx_led${k + 1}`, { pivot: [cx(k), 10.5, -29.2], extras: { note: '雷能 LED cell (shown by the meter)' } });
        led.add(cb([cx(k), 10.5, -29.15], [6.6, 6, 0.8], 0.25), ARC);
      }
      const P = -29.3;
      g.add(label('雷能', { at: [-104, -6.5, P], ...LEFT, h: 4.6, hz: 7.4, swz: 0.6, proud: 0.12, sink: 0.2 }), YEL);
      g.add(label('ARC CELL', { at: [-83, -4.2, P], ...LEFT, h: 2.3, sw: 0.38, proud: 0.1, sink: 0.2 }), WHITE);
      g.add(label('120 MAX', { at: [-83, -8.8, P], ...LEFT, h: 2.0, sw: 0.34, proud: 0.1, sink: 0.2 }), WHITE);
      for (const [s, txt] of [[-122.4, '0'], [-71.4, '120']]) g.add(label(txt, { at: [s, 1.6, P], ...LEFT, h: 1.8, sw: 0.32, proud: 0.1, sink: 0.2 }), WHITE);
      g.add(obox([-97, -0.4, P - 0.05], [1, 0, 0], [0, 1, 0], [42, 0.35, 0.3]), WHITE);   // the scale line
    }
    // 高壓危險 warning plate (left, front bay): seated on the pocket floor, a black border, 高壓危險 / DANGER 40 kV / a
    // triangle pictogram with a bolt and KEEP CLEAR, four rivets
    {
      const W = -28.62, F = W - 0.66;
      g.add(cb([30, -2, W], [46, 32, 1.32], 0.4), YEL);
      g.add(profile([[7.8, -17.2], [52.2, -17.2], [52.2, 13.2], [7.8, 13.2]], { w: 0.3, cw: F - 0.04, bevel: 0.06, holes: [[[9, -16], [51, -16], [51, 12], [9, 12]]] }), DARK);
      g.add(label('高壓危險', { at: [30, 6.1, F], ...LEFT, hz: 7.6, swz: 0.62, proud: 0.12, sink: 0.12 }), DARK);
      g.add(label('DANGER 40 kV', { at: [30, -2.6, F], ...LEFT, h: 3.3, sw: 0.5, proud: 0.12, sink: 0.12 }), DARK);
      g.add(obox([30, -5.6, F], [1, 0, 0], [0, 1, 0], [40, 0.4, 0.24]), DARK);
      // pictogram (reads on the left: +s is to the viewer's left, so it sits at the high-s end) and KEEP CLEAR
      const pc = [44.2, -11.4];
      g.add(profile([[pc[0] - 5.2, pc[1] - 4.2], [pc[0] + 5.2, pc[1] - 4.2], [pc[0], pc[1] + 4.6]], { w: 0.24, cw: F - 0.04, bevel: 0.05, holes: [[[pc[0] - 3.4, pc[1] - 3.1], [pc[0] + 3.4, pc[1] - 3.1], [pc[0], pc[1] + 2.6]]] }), DARK);
      g.add(profile([[pc[0] - 0.4, pc[1] - 2.6], [pc[0] + 1.2, pc[1] - 0.2], [pc[0] + 0.1, pc[1] - 0.2], [pc[0] + 0.9, pc[1] + 1.9], [pc[0] - 1.2, pc[1] - 0.9], [pc[0] - 0.1, pc[1] - 0.9]], { w: 0.24, cw: F - 0.04, bevel: 0.04, curveSeg: 1 }), DARK);
      g.add(label('KEEP CLEAR', { at: [22.4, -11.4, F], ...LEFT, h: 2.6, sw: 0.42, proud: 0.12, sink: 0.12 }), DARK);
      for (const [s, t] of [[9.6, -15.6], [50.4, -15.6], [9.6, 11.6], [50.4, 11.6]]) g.add(domeAt([s, t, F + 0.1], [0, 0, -1], 0.85, 0.55, 8), BRIGHT);
    }
    // right side: the maker plate (bright, dark-inlaid lettering), a charge port with a tethered rubber cap, a cable
    // gland with a lead down into the grip, the serial strip on the access panel
    {
      const W = 28.6, F = W + 0.6;
      g.add(cb([12, -2, W], [58, 22, 1.2], 0.4), BRIGHT);
      g.add(label('QIMING WORKS', { at: [12, 4.6, F], ...RIGHT, h: 3.2, sw: 0.5, proud: 0.1, sink: 0.2 }), DARK);
      g.add(label('E01  驚蟄', { at: [12, -1.5, F], ...RIGHT, h: 3.2, hz: 4.8, sw: 0.5, swz: 0.42, proud: 0.1, sink: 0.2 }), DARK);
      g.add(label('No.0317 · 40 kV', { at: [12, -7.6, F], ...RIGHT, h: 2.4, sw: 0.38, proud: 0.1, sink: 0.2 }), DARK);
      g.add(obox([12, 1.5, F], [1, 0, 0], [0, 1, 0], [52, 0.3, 0.24]), DARK);
      for (const [s, t] of [[-15, -11], [39, -11], [-15, 7], [39, 7]]) g.add(domeAt([s, t, F - 0.1], [0, 0, 1], 0.9, 0.55, 8), STEEL);
      // charge port (s -27, t 5): a turned boss, the rubber cap pressed on, its tether to a screw below
      const pc = [-27, 5];
      g.add(along([[0, 0], [0, 6.2], [1.6, 6.2], [2.2, 5.4], [2.2, 0]], [pc[0], pc[1], 27.9], [0, 0, 1], 28), STEEL);
      g.add(along([[0, 0], [0, 5.9], [0.8, 6.0], [2.4, 5.4], [3.2, 4.2], [3.5, 0]], [pc[0], pc[1], 30], [0, 0, 1], 28, 40), RUB);
      g.add(cb([pc[0], pc[1] + 5.6, 31.6], [3.4, 1.6, 2.4], 0.4), RUB);   // the pull tab
      g.add(sweep([[pc[0] - 3.6, pc[1] - 4.6, 31.4], [pc[0] - 5.2, pc[1] - 7.8, 30.4], [pc[0] - 5.4, pc[1] - 11, 29.6]], 0.7, { seg: 10, radial: 6 }), RUB);
      g.add(screw([pc[0] - 5.4, pc[1] - 12.2, 28.0], 1.5, { face: 'w', depth: 0.7 }), DARK);
      // cable gland (s -27, t -13): hex body, domed compression nut, a lead out and down into the grip's top right
      const gl = [-27, -13];
      g.add(along([[0, 0], [0, 5.2], [3.4, 5.2], [3.6, 4.6], [3.6, 0]], [gl[0], gl[1], 27.9], [0, 0, 1], 6, 50), BRIGHT);
      g.add(along([[0, 0], [0, 4.4], [1.4, 4.4], [3.2, 3.2], [3.8, 2.4], [3.8, 0]], [gl[0], gl[1], 31.4], [0, 0, 1], 16, 40), STEEL);
      g.add(sweep([[gl[0], gl[1], 34.6], [gl[0], gl[1] - 0.6, 37], [gl[0] + 1.6, gl[1] - 7, 36.4], [gl[0] + 7, gl[1] - 19, 25], [gl[0] + 10.2, gl[1] - 27.2, 16.6]], 1.8, { seg: 28, radial: 8 }), RUB);
      g.add(along([[0, 0], [0, 3], [1.2, 3], [1.6, 2.4], [1.6, 0]], [gl[0] + 10.2, gl[1] - 27.2, 14.4], [0, 0, 1], 14), RUB);   // grommet into the grip
      // serial strip on the right access panel
      g.add(cb([-94, -9.5, 29.5], [50, 6, 0.5], 0.15), BRIGHT);
      g.add(label('SN QW-E01-0317', { at: [-94, -9.5, 29.75], ...RIGHT, h: 2.5, sw: 0.4, proud: 0.08, sink: 0.12 }), DARK);
      g.add(label('MAX 40 kV', { at: [-110, -1, 29.3], ...RIGHT, h: 2.4, sw: 0.4, proud: 0.1, sink: 0.2 }), WHITE);
    }
    // QD sling cup on the left rear
    g.add(along([[0, 0], [0, 6.2], [0.9, 6.2], [1.7, 5.4], [1.7, 4.4], [0.5, 4.0], [0.5, 0]], [-143, -9, -29.8], [0, 0, -1], 28, 40), STEEL);
    g.add(along([[0, 0], [0, 1.6], [0.6, 1.4], [0.9, 0]], [-143, -9, -30.2], [0, 0, -1], 12), DARK);
    // rivet rows along the upper edges, both sides; top edge rails for the saddles
    for (const sd of [-1, 1]) for (let k = 0; k < 11; k++) g.add(domeAt([-140 + k * 24.5, 24.5, sd * 30], [0, 0, sd], 1.25, 0.8, 8), DARK);
    for (const sd of [-1, 1]) g.add(cb([-15, 31.2, sd * 20.5], [250, 2.6, 5], 0.6), DARK);
    // front flange: square-to-round transition and a bolted round flange
    g.add(LX([[s1 - 0.5, 0], [s1 - 0.5, 31], [s1 + 2, 33], [s1 + 12, 33], [s1 + 14, 31.5], [s1 + 14, 0]], 40), STEEL);
    for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * TAU; g.add(hexBolt([s1 + 14, Math.sin(a) * 27.5, Math.cos(a) * 27.5], [1, 0, 0], 2.4, 1.8), DARK); }
  }

  // ======================================================================== pistol grip, guard, trigger
  {
    // raked 15°: top under the receiver, finger grooves on the front strap
    const rk = 15 * D2R, tk = Math.tan(rk);
    const gp = (s, t, r) => [s + (t + 30) * tk, t, r];
    const outline = [gp(-26, -29), gp(16, -29), gp(15, -40, 4), gp(18, -50, 5), gp(13, -60, 5), gp(17, -70, 5), gp(12, -80, 5), gp(16, -92, 5), gp(13, -112, 8), gp(6, -120, 6),
      gp(-30, -120, 6), gp(-34, -110, 8), gp(-32, -70, 22), gp(-34, -40, 14)];
    let body = profile(outline, { w: 29, bevel: 3.6, bevelSeg: 3, curveSeg: 9 });
    // insulating overmould panels: a 0.7 mm pocket a 0.45 mm parting gap wider than the rubber panel in it; the panel
    // carries a moulded diamond field inside a smooth 1.6 mm border
    const pan = rpoly([gp(-24, -44, 3), gp(6, -44, 3), gp(8, -62, 4), gp(6, -104, 5), gp(-24, -104, 5), gp(-27, -74, 10)], 4);
    body = cut(body, [-1, 1].map((sd) => cutters.pocketW(insetPoly(pan, -0.45), sd * 13.8, 6)));
    g.add(body, GRIP);
    const scr = gp(-10, -96);
    for (const sd of [-1, 1]) {
      g.add(profile(pan, { w: 1.1, cw: sd * 14.25, bevel: 0.35, bevelSeg: 1, curveSeg: 1 }), RUB);
      g.add(diamondField(insetPoly(pan, 1.6), sd, 14.8, 0.72, 2.9, rk, [[scr[0], scr[1], 3.6]]), RUB);
      g.add(screw([scr[0], scr[1], sd * 14.75], 1.9, { face: sd > 0 ? 'w' : '-w', depth: 0.9 }), DARK);
    }
    // ribbed backstrap: ribs across the rear strap every 3.4 mm, following its curve
    {
      const back = rpoly(outline, 9).filter(([s, t]) => t < -44 && t > -106 && s < gp(-20, t)[0]).sort((a, b) => b[1] - a[1]);
      const ribs = [];
      for (let t = -47; t > -104; t -= 3.4) {
        let k = back.findIndex((p) => p[1] <= t); if (k < 1) continue;
        const A = back[k - 1], B = back[k], f = (A[1] - t) / (A[1] - B[1]), s = lerp(A[0], B[0], f), ds = B[0] - A[0], dt = B[1] - A[1], L = Math.hypot(ds, dt);
        const nrm = [-dt / L, ds / L];   // outward (rearwards) for a downward run on the back
        const out = nrm[0] < 0 ? nrm : [-nrm[0], -nrm[1]];
        ribs.push(obox([s + out[0] * 0.2, t + out[1] * 0.2, 0], [ds / L, dt / L, 0], [out[0], out[1], 0], [1.3, 1.6, 19], 0.35));
      }
      g.add(merge(ribs), GRIP);
    }
    // yellow insulation band at the top, steel grip cap with a lanyard slot and a cross pin
    g.add(profile([gp(-26.5, -31), gp(16.5, -31), gp(16, -37), gp(-27.5, -37)], { w: 30.4, bevel: 1, curveSeg: 2 }), YEL);
    g.add(cut(profile([gp(-31, -116), gp(14, -116), gp(13, -124, 3), gp(-30, -124, 3)], { w: 30, bevel: 1.2 }), [cutters.slotW(...[gp(-24, -120)[0], gp(-14, -120)[0]], -120, 4, 40, 0)]), STEEL);
    {
      const [ps] = gp(-19, -120);
      g.add(along([[0, 0], [0, 1.05], [31.2, 1.05], [31.2, 0]], [ps, -120, -15.6], [0, 0, 1], 10), BRIGHT);
      for (const sd of [-1, 1]) g.add(domeAt([ps, -120, sd * 15.3], [0, 0, sd], 1.6, 0.8, 10), BRIGHT);
    }
    // trigger guard (steel loop) and trigger with a serrated face
    g.add(profile([[-2, -29], [50, -29], [52, -33, 2], [52, -36], [44, -56, 8], [6, -56, 6], [-3, -48, 4], [-2, -42]],
      { w: 9, bevel: 1.4, curveSeg: 3, holes: [[[3, -35, 3], [44, -35, 3], [38, -50, 6], [8, -50, 5]]] }), STEEL);
    g.add(screw([48, -33.5, 4.6], 1.6, { face: 'w', depth: 0.8 }), DARK);
    const tr = g.part('trigger', { pivot: [22, -31, 0] });
    tr.add(profile([[19, -29], [26, -29], [27, -34, 2], [25, -40, 4], [27.5, -46, 4], [24, -50, 2], [21, -46, 3], [21.5, -38, 4]], { w: 6, bevel: 1.2, curveSeg: 4 }), BRIGHT);
    for (const [s, t] of [[26.45, -36], [25.75, -38.6], [25.85, -41.4], [26.55, -44.1]]) tr.add(cb([s, t, 0], [1.2, 0.75, 4.6], 0.18), BRIGHT);
    // magwell flare
    g.add(cut(profile([[50, -29], [111, -29], [112, -36, 2], [50, -36, 2]], { w: 42, bevel: 1.5 }), [cutters.box([80, -32, 0], [57, 12, 37.4])]), STEEL);
    // mag release (left side of the well)
    g.add(cb([60, -33, -21.8], [9, 6, 3], 1), DARK);
    g.add(cb([60, -33, -23.4], [7, 4.4, 0.8], 0.3), BRIGHT);
  }

  // ======================================================================== capacitor cell magazine (電容匣)
  {
    const mag = g.part('mag', { pivot: [80, -30, 0], extras: { drop: true, note: '電容匣: capacitor cell (battery reload)' } });
    mag.add(profile([[53, -26], [107, -26], [108, -32, 1], [106, -112, 7], [98, -120, 6], [62, -120, 6], [54, -112, 7], [52, -32, 1]], { w: 35, bevel: 2.6, bevelSeg: 2, curveSeg: 3 }), POLY);
    // ribs on both flats, a yellow label band (電容匣, polarity marks, rating), a charge window with three pips
    for (const sd of [-1, 1]) {
      const F = sd * 17.95, side = sd > 0 ? { u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] } : { u: [-1, 0, 0], v: [0, 1, 0], n: [0, 0, -1] };
      for (let k = 0; k < 4; k++) mag.add(cb([80, -90 - k * 6.5, sd * 17.6], [46, 2.4, 1.6], 0.5), POLY);
      mag.add(cb([80, -58, sd * 17.65], [50, 16, 0.6], 0.2), YEL);
      mag.add(label('電容匣', { at: [80, -56.2, F], ...side, hz: 6.0, swz: 0.5, proud: 0.1, sink: 0.15 }), RUB);
      mag.add(label('40kV  2.2kJ', { at: [80, -63.4, F], ...side, h: 1.9, sw: 0.32, proud: 0.1, sink: 0.15 }), RUB);
      for (const [s, ch] of [[62.5, '-'], [97.5, '+']]) {
        mag.add(label(ch, { at: [s, -56.2, F], ...side, h: 3.6, sw: 0.55, proud: 0.1, sink: 0.15 }), RUB);
        { const L = []; for (let k = 0; k < 24; k++) { const a = k / 24 * TAU; L.push([s + 3.3 * Math.cos(a), -56.2 + 3.3 * Math.sin(a), F - sd * 0.05]); } mag.add(sweep(L, 0.28, { seg: 24, radial: 5, closed: true }), RUB); }
      }
      mag.add(obox([80, -50.9, F], [1, 0, 0], [0, 1, 0], [48, 0.5, 0.2]), RUB);
    }
    mag.add(cb([80, -76, -17.4], [26, 7, 1.2], 0.3), DARK);
    for (let k = 0; k < 3; k++) mag.add(cb([72 + k * 8, -76, -17.85], [5.6, 3.6, 0.5], 0.2), ARC);
    // copper contact pads on the top, a base plate with a pull loop
    mag.add(cb([70, -24.6, 0], [12, 1.6, 20], 0.3), CU);
    mag.add(cb([92, -24.6, 0], [12, 1.6, 20], 0.3), CU);
    mag.add(cb([80, -120.5, 0], [44, 2.4, 31], 0.8), DARK);
    mag.add(ring(80, 6, 1.6, { t: -125, w: 0, axis: 'w', seg: 18 }), DARK);
  }

  // ======================================================================== capacitor tube (hero focus)
  {
    const [a, b] = H.cap, T = H.capT, R = H.capR, s0 = a + 17, s1 = b - 17;
    g.add(tube(s0 - 1, s1 + 1, R, R - 1.2, { t: T, seg: 40 }), GLASS);
    // the element: rolled foil in five wound sections (pillowed ends) on a mandrel; pv_core's lightning plays over it
    const core = g.part('fx_cap', { pivot: [(s0 + s1) / 2, T, 0], extras: { pv: { preset: 'pv_core', coreMode: 4, coreTint: '#c9b8ff', coreScale: 2.2 }, note: 'capacitor interior: pv_core lightning (hero)' } });
    {
      const L0 = a + 43, L1 = b - 43, n = 5, len = (L1 - L0) / n, P = [[L0, 0]];
      for (let k = 0; k < n; k++) { const x0 = L0 + k * len, x1 = x0 + len; P.push([x0 + 0.2, 5.4], [x0 + 1.2, 7.2], [x0 + 2.4, 7.7], [(x0 + x1) / 2, 7.85], [x1 - 2.4, 7.7], [x1 - 1.2, 7.2], [x1 - 0.2, 5.4]); }
      P.push([L1, 0]);
      core.add(lathe(P, { t: T, seg: 28, crease: 45 }), CORE);
      // bright spacer discs between the sections and at the ends, two copper bus rods along the sides, a getter flash
      for (let k = 0; k <= n; k++) g.add(tube(L0 + k * len - 0.6, L0 + k * len + 0.6, 9.5, 5.3, { t: T, seg: 28, b: 0.25 }), BRIGHT);
      for (const sd of [-1, 1]) g.add(cyl(a + 37, b - 37, 0.65, { t: T, w: sd * 8.6, seg: 8, b: 0.2 }), CU);
      g.add(along([[0, 0], [0, 3.4], [0.12, 3.2], [0.12, 0]], [a + 24, T + 9.66, 0], [0, -1, 0], 16), CHROME);
    }
    // end caps: turned copper (a centre boss and a fine ring on the face, a groove pair), two screws each, an HV terminal
    // post with a ring lug under its nut, a crimp barrel and a rubber boot into the cable
    for (const [c0, dir] of [[a, 1], [b, -1]]) {
      const q = (x) => c0 + dir * x;
      const prof = [[q(-0.7), 0], [q(-0.7), 2.8], [q(-0.45), 3.4], [q(0), 3.6], [q(0), 8.4], [q(-0.3), 8.75], [q(0), 9.1], [q(0), 9.5], [q(0.8), 12.4], [q(2), 13], [q(6), 13], [q(6.6), 12.2], [q(7.6), 12.2],
        [q(8.2), 13], [q(12), 13], [q(12.6), 12.2], [q(13.6), 12.2], [q(14.2), 13], [q(16.4), 13], [q(17), 11.6], [q(18), 11.6], [q(18), 0]];
      g.add(lathe(dir > 0 ? prof : prof.reverse(), { t: T, seg: 32, crease: 30 }), CU);
      for (const sd of [-1, 1]) g.add(screw([q(9.8), T, sd * 13], 1.7, { face: sd > 0 ? 'w' : '-w', depth: 0.9 }), DARK);
      const sp = q(9.8), out = -dir;   // the cable leaves outwards along s
      g.add(lax([[0, 0], [0, 3.4], [7, 3.4], [7.5, 2.4], [11, 2.4], [11, 0]], [sp, T + 12.4, 0], 't', 16), CU);
      g.add(lax([[0, 2.45], [0, 4.7], [0.8, 4.7], [0.8, 2.45]], [sp, T + 16.6, 0], 't', 18), CU);                                   // ring lug
      g.add(cb([sp + out * 6.4, T + 17, 0], [7.4, 0.8, 4.6], 0.25), CU);                                                             // its tongue
      g.add(along([[0, 0], [0, 4.6], [3.4, 4.6], [3.4, 0]], [sp, T + 17.4, 0], [0, 1, 0], 6, 50), DARK);                            // nut
      g.add(along([[0, 0], [0, 2.4], [6, 2.4], [6, 0]], [sp + out * 9.6, T + 17, 0], [out, 0, 0], 14), CU);                         // crimp barrel
      g.add(along([[0, 0], [0, 3.7], [1.2, 3.8], [6.4, 3.3], [8, 3.15], [8, 0]], [sp + out * 14.6, T + 17, 0], [out, 0, 0], 16), RUB); // boot
      // porcelain feed-through collar and the electrode: a copper rod into the tube, a glowing ball at its end
      g.add(cyl(dir > 0 ? q(17) : q(36), dir > 0 ? q(36) : q(17), 1.3, { t: T, seg: 12 }), CU);
      g.add(sphere([q(37.5), T, 0], 2.6, { seg: 14 }), ARC);
      const fp = [[q(16.5), 0], [q(16.5), 5.2], [q(18.5), 5.6], [q(21), 3.2], [q(22), 1.8], [q(22), 0]];
      g.add(lathe(dir > 0 ? fp : fp.reverse(), { t: T, seg: 20 }), PORC);
    }
    // the rating on the rear cap face (seen from behind): HV over the boss, 40kV under it
    const back = { u: [0, 0, 1], v: [0, 1, 0], n: [-1, 0, 0] };
    g.add(label('HV', { at: [a, T + 6.2, 0], ...back, h: 2.6, sw: 0.42, proud: 0.12, sink: 0.2 }), DARK);
    g.add(label('40kV', { at: [a, T - 6.2, 0], ...back, h: 2.0, sw: 0.36, proud: 0.12, sink: 0.2 }), DARK);
    // saddle straps: a band round the tube, a foot block screwed to the edge rails
    for (const s of [-70, -15, 40]) {
      g.add(tube(s - 4, s + 4, R + 1.6, R + 0.2, { t: T, seg: 36, b: 0.4 }), DARK);
      g.add(cut(cb([s, 33.4, 0], [8, 7.4, 31], 0.8), [cyl(s - 6, s + 6, R + 0.6, { t: T, seg: 24 })]), DARK);
      for (const sd of [-1, 1]) g.add(hexBolt([s, 37.2, sd * 12], [0, 1, 0], 1.6, 1.1), STEEL);
    }
    // low side guards: steel rods on posts, below the tube's centre (the top stays open to the eye)
    for (const sd of [-1, 1]) {
      g.add(sweep([[a + 4, 33, sd * 17], [a + 12, 40, sd * 17.5], [-60, 41, sd * 17.6], [30, 41, sd * 17.6], [b - 12, 40, sd * 17.5], [b - 4, 33, sd * 17]], 1.6, { seg: 40, radial: 8 }), STEEL);
      for (const s of [-40, 10]) g.add(lax([[0, 0], [0, 2.2], [9, 2.2], [9, 0]], [s, 32, sd * 17.5], 't', 10), DARK);
    }
    // HV cables from the boots: the front one forwards and down the left into the coil pack, the rear one back, over the
    // top right edge and forward along it (clamps, ties at the saddles) into the pack's right side
    const cable = (pts, r = 3.1) => { g.add(sweep(pts, r, { seg: 52, radial: 10 }), RUB); };
    cable([[b - 9.8 + 22, T + 17, 0], [96, T + 15, -3], [104, 50, -15], [110, 38, -25], [115, 28, -28.6], [119, 22.5, -27.4], [126, 18.5, -27]]);
    cable([[a + 9.8 - 22, T + 17, 0], [-124.5, T + 14.6, 3], [-130, 50, 12], [-130, 40, 21], [-124, 33, 28], [-110, 31.4, 31], [-60, 31.2, 31.1], [10, 30, 31.2], [96, 23, 30.4], [116, 20, 28], [126, 18.5, 27]], 2.6);
    for (const [s, t, w] of [[H.pack[0] - 2, 19, -26.5], [H.pack[0] - 2, 18.5, 26.6]]) g.add(along([[0, 3.6], [8, 3.6], [8.6, 2.6], [8.6, 0]], [s - 8, t, w], [1, -0.15, 0], 14), CU);
    // cable clamps on the right top edge, nylon ties round the cable at the saddles
    for (const s of [-90, -20]) { g.add(cut(cb([s, 29.6, 31.6], [7, 9.6, 4.8], 0.8), [cyl(s - 6, s + 6, 2.75, { t: 31.2, w: 31.1 })]), DARK); g.add(screw([s, 25.8, 34], 1.2, { face: 'w', depth: 0.6 }), STEEL); }
    for (const s of [-70, -15]) { g.add(ring(s, 2.95, 0.42, { t: 31.2, w: 31.1, seg: 18 }), RUB); g.add(cb([s, 31.2, 34.4], [2.4, 2.6, 1.6], 0.3), RUB); }
  }

  // ======================================================================== coil pack (body) + coils fx_coil1-3
  {
    const [p0, p1] = H.pack;
    for (const [a, b, rear] of [[p0, p0 + 8, true], [p1 - 8, p1, false]]) {
      g.add(LX([[a, 18.5], [a, 32], [a + 1, 34], [b - 1, 34], [b, 32], [b, 18.5]], 44), STEEL);
      for (let k = 0; k < 6; k++) { const ang = (k + 0.5) / 6 * TAU; g.add(hexBolt([rear ? a : b, Math.sin(ang) * 29.5, Math.cos(ang) * 29.5], [rear ? -1 : 1, 0, 0], 2.2, 1.6), DARK); }
    }
    // former; four tie rods with acorn nuts in front (the rear ends run into the receiver flange)
    g.add(tube(p0 + 7, p1 - 7, 20.2, 17.6, { seg: 36 }), DARK);
    for (let k = 0; k < 4; k++) {
      const ang = (k + 0.5) / 4 * TAU, t = Math.sin(ang) * 30.8, w = Math.cos(ang) * 30.8;
      g.add(cyl(p0 - 3, p1 + 2.4, 2.1, { t, w, seg: 10 }), BRIGHT);
      g.add(acorn([p1 + 0.2, t, w], [1, 0, 0], 3.3), DARK);
    }
    // porcelain terminal block on the rear flange's top: three screw terminals (ring lugs) for the coil leads
    g.add(cb([128.5, 35.4, 0], [11, 10.8, 25], 1.2), PORC);
    for (const w of [-7.5, 0, 7.5]) {
      g.add(lax([[0, 2.4], [0, 4.2], [0.6, 4.2], [0.6, 2.4]], [128.5, 40.7, w], 't', 14), CU);
      g.add(screw([128.5, 41.2, w], 2.1, { face: 't', depth: 1.1 }), BRIGHT);
    }
    for (const w of [-11.4, -3.75, 3.75, 11.4]) g.add(cb([128.5, 42, w], [10.6, 2.8, 1.1], 0.25), PORC);   // barrier ribs between the terminals
    H.coils.forEach((sc, i) => {
      const c = g.part(`fx_coil${i + 1}`, { pivot: [sc, 0, 0], extras: { pv: { veinAxis: 1, veinFreq: 16, veinSpeed: 0.9 }, order: i, note: 'HV coil: copper windings over a glow core (lit by the charge)' } });
      // glowing core (shows between the turns) and the windings: one round wire wound 24 times round the ring
      c.add(ring(sc, 24, 3.3, { seg: 48 }), COILGLOW);
      const n = 24, per = 7, P = [];
      for (let k = 0; k < n * per; k++) {
        const th = k / (n * per) * TAU, ph = th * n, rr = 24 + Math.cos(ph) * 4.5;
        P.push([sc + Math.sin(ph) * 4.5, Math.sin(th) * rr, Math.cos(th) * rr]);
      }
      c.add(sweep(P, 1.25, { seg: n * per, radial: 7, closed: true, tension: 0 }), CU);
      // cord lacing ties round the winding bundle
      for (const th of [-35, 145, 250].map((d) => d * D2R)) {
        const L = [];
        for (let k = 0; k < 14; k++) { const ph = k / 14 * TAU, rr = 24 + Math.cos(ph) * 6.05; L.push([sc + Math.sin(ph) * 6.05, Math.sin(th) * rr, Math.cos(th) * rr]); }
        c.add(sweep(L, 0.5, { seg: 14, radial: 5, closed: true }), RUB);
      }
      // terminal lugs (top), oxidised where they bite the windings; the lead back to the terminal block
      for (const ds of [-3, 3]) {
        c.add(cb([sc + ds, 31.5, 0], [1.6, 6, 4.2], 0.3), CU);
        c.add(dome([sc + ds, 29, 0], [0, 1, 0], 1.6, 1.1, 8), PATINA);
      }
      const wl = [-7.5, 0, 7.5][i];
      c.add(sweep([[sc - 3, 34, 0], [sc - 3.6, 37.6, wl * 0.5], ...(sc > 150 ? [[sc - 10, 39.6, wl], [140, 39.8, wl]] : []), [134.5, 41.2, wl], [132.3, 41.3, wl]], 0.8, { seg: 28, radial: 8 }), CU);
    });
  }

  // ======================================================================== the shaft: fx_seg1 > fx_seg2 > fx_seg3
  const segPart = (name, parent, s0, C, R) => g.part(name, { parent, pivot: [s0, 0, 0], extras: { open: [-C / 1000, 0, 0], note: `telescoping section Ø${2 * R} (v 1 = collapsed by ${C} mm)` } });
  /** white TESTED 40 kV · 啟明 band (printed black) round a sleeve */
  const testedBand = (part, s0, s1, R, h = 3.1) => {
    part.add(LX([[s0, R - 0.3], [s0, R + 0.45], [s0 + 0.5, R + 0.7], [s1 - 0.5, R + 0.7], [s1, R + 0.45], [s1, R - 0.3]], 32), WHITE);
    part.add(wrapLabel('TESTED 40 kV · 啟明', { s0: (s0 + s1) / 2, R: R + 0.7, a0: 160, h, hz: h * 1.45, sw: h * 0.15, swz: h * 0.085, proud: 0.08, sink: 0.12 }), RUB);
  };
  /** shallow moulded ring on a sleeve */
  const mould = (part, s, R) => part.add(LX([[s - 1.6, R - 0.2], [s - 1.2, R + 0.3], [s + 1.2, R + 0.3], [s + 1.6, R - 0.2]], 24, 50), RUB);
  /** the telescoping joint at the front of a section: a bright ferrule rim and a rubber wiper lip on the next one (Ri) */
  const joint = (part, b, Ro, Ri) => {
    part.add(LX([[b - 0.2, Ri + 0.6], [b - 0.2, Ro + 2.2], [b + 0.5, Ro + 1.8], [b + 1.0, Ro + 1.0], [b + 1.0, Ri + 0.6]], 32), BRIGHT);
    part.add(LX([[b + 0.8, Ri + 0.04], [b + 0.8, Ri + 2.3], [b + 1.7, Ri + 1.7], [b + 3.0, Ri + 0.45], [b + 3.0, Ri + 0.04]], 32, 40), RUB);
  };
  // ---- seg1: sleeve, hazard ring, TESTED band, three insulator groups, the grip zone, a knurled twist-lock collar
  {
    const [a, b] = H.seg1, R = H.R1, s1 = segPart('fx_seg1', null, a, H.C[0], R);
    s1.add(sleeve(a - 20, b - 12, R), RUB);
    s1.add(hazardRing(272, R), YEL);
    mould(s1, 243, R);
    testedBand(s1, 299, 313, R);
    for (const s0 of H.ins) { const I = insulator(s0, R); s1.add(I.porc, PORC); s1.add(I.cu, CU); s1.add(I.glaze, GLAZE); }
    // fx_ding: three comets of light hugging the rims of group 1's skirts (the group nearest the eye; hidden at rest: the
    // inspect's knuckle tap shows them and sweeps them once round the skirts about s)
    const ding = g.part('fx_ding', { parent: 'fx_seg1', pivot: [H.ins[0] + 26, 0, 0], extras: { note: 'inspect: light running round insulator group 1 (code: hidden at rest, clip fx_ding.vis / .rot)' } });
    [14, 26, 38].forEach((o, k) => {
      const sc = H.ins[0] + o - 0.4, r = 33.2, a0 = k * 2.1, pts = [];
      for (let i = 0; i <= 20; i++) { const a = a0 + i / 20 * 2.6; pts.push([sc, r * Math.sin(a), r * Math.cos(a)]); }
      ding.add(ttube(pts, 0.4, 2.1, { radial: 8, seg: 30 }), ARC);
    });
    // the grip zone: a moulded grip sleeve with finger ridges (slightly proud)
    const gz = [[370, R - 0.5], [370, R + 0.9], [372, R + 1.7]];
    for (let k = 0; k < 11; k++) { const s = 376 + k * 5.6; gz.push([s - 1.2, R + 1.7], [s - 0.5, R + 2.3], [s + 0.5, R + 2.3], [s + 1.2, R + 1.7]); }
    gz.push([434, R + 1.7], [436, R + 0.9], [436, R - 0.5]);
    s1.add(LX(gz, 26, 50), RUB);
    s1.add(knurl(b - 12, b, R + 2.6, 32), STEEL);
    s1.add(LX([[b - 12.5, R], [b - 12.5, R + 1.2], [b - 11.5, R + 1.8], [b - 10, R + 1.8], [b - 10, R]], 32), DARK);
    joint(s1, b, R + 0.6, H.R2);
    // twist-lock lever on the collar (left)
    s1.add(cb([b - 6, 4, -(R + 4.2)], [6, 12, 3], 0.8), DARK);
    s1.add(domeAt([b - 6, 9.5, -(R + 5.6)], [0, 0, -1], 1.6, 1.1, 8), BRIGHT);
  }
  // ---- seg2 (its hidden tail only as long as the slide needs)
  {
    const [a, b] = H.seg2, R = H.R2, s2 = segPart('fx_seg2', 'fx_seg1', a, H.C[1], R);
    s2.add(sleeve(a - 40, b - 12, R), RUB);
    for (const s of [590, 650, 710]) s2.add(hazardRing(s, R), YEL);
    for (const s of [620, 740]) mould(s2, s, R);
    testedBand(s2, 672, 688, R);
    s2.add(knurl(b - 12, b, R + 2.4, 28), STEEL);
    s2.add(LX([[b - 12.5, R], [b - 12.5, R + 1.1], [b - 11.5, R + 1.6], [b - 10, R + 1.6], [b - 10, R]], 30), DARK);
    joint(s2, b, R + 0.4, H.R3);
    s2.add(cb([b - 6, 4, -(R + 3.9)], [6, 11, 3], 0.8), DARK);
    // corona (grading) ring at the hot end of the insulated length, on three standoffs from a clamp band
    const cs = b - 20;
    s2.add(ring(cs, 30, 4.4, { seg: 64 }), CHROME);
    s2.add(LX([[cs - 5, R - 0.5], [cs - 5, R + 1.4], [cs - 4, R + 2.2], [cs + 4, R + 2.2], [cs + 5, R + 1.4], [cs + 5, R - 0.5]], 28), DARK);
    for (let k = 0; k < 3; k++) {
      const ang = (90 + k * 120) * Math.PI / 180, dir = [0, Math.sin(ang), Math.cos(ang)];
      s2.add(along([[0, 2.2], [9.6, 2.2], [10.2, 1.6], [10.2, 0]], [cs, dir[1] * (R + 2), dir[2] * (R + 2)], dir, 10), BRIGHT);
      s2.add(along([[0, 0], [0, 3.6], [2.4, 3.6], [3, 2.6], [3, 0]], [cs, dir[1] * (R + 1.6), dir[2] * (R + 1.6)], dir, 6, 50), DARK);
    }
  }
  // ---- seg3 + head
  {
    const [a, b] = H.seg3, R = H.R3, s3 = segPart('fx_seg3', 'fx_seg2', a, H.C[2], R);
    s3.add(sleeve(a - 40, b + 2, R), RUB);
    for (const s of [800, 860, 920]) s3.add(hazardRing(s, R), YEL);
    mould(s3, 890, R);
    testedBand(s3, 823, 837, R, 2.6);
    const s3h = { add: (geo, mat) => s3.add(HX(geo), mat) };   // head pieces (scaled)
    // a flared shoulder from the sleeve up to the (scaled) socket collar
    const Rc = (R + 1.5) * H.HS;
    s3.add(LX([[b - 22, 0], [b - 22, R - 0.2], [b - 18, R + 0.6], [b - 10, R + (Rc - R) * 0.4], [b - 3, Rc - 1.4], [b + 0.5, Rc - 0.4], [b + 0.5, 0]], 32), DARK);
    // socket: a collar, an octagonal ferrule with two cross bolts, a neck into the ricasso
    s3h.add(LX([[b, 0], [b, R + 1.5], [b + 1.4, 16.8], [b + 6, 17.2], [b + 7.2, 18.6], [b + 13, 18.6], [b + 14.2, 16.4], [b + 16, 16], [b + 16, 0]], 36), STEEL);
    s3h.add(lathe([[b + 15.5, 0], [b + 15.5, 16.2], [b + 44, 16.2], [b + 44, 0]], { seg: 8, phase: Math.PI / 8, crease: 30 }), STEEL);
    s3h.add(LX([[b + 43.5, 0], [b + 43.5, 15.2], [b + 45.5, 14.2], [b + 47.5, 12.2], [b + 48, 0]], 24), STEEL);
    for (const sd of [-1, 1]) s3h.add(hexBolt([b + 30, 0, sd * 15.4], [0, 0, sd], 3, 2.2), DARK);
    // ferrule bands: two raised rings with a row of punched dots between (the forger's mark)
    for (const s of [b + 19, b + 41]) s3h.add(LX([[s - 1.4, 15.8], [s - 1.4, 16.6], [s - 0.6, 17.2], [s + 0.6, 17.2], [s + 1.4, 16.6], [s + 1.4, 15.8]], 32), BRIGHT);
    for (let k = 0; k < 8; k++) { const ang = (k + 0.5) / 8 * Math.PI * 2; s3h.add(domeAt([b + 23.5, Math.sin(ang) * 15.4, Math.cos(ang) * 15.4], [0, Math.sin(ang), Math.cos(ang)], 1.1, 0.7, 8), BRIGHT); }
    // the forged ricasso: a chamfered block with its own bevel, a groove and a collar line where the blade leaves it;
    // a 驚蟄 cartouche (raised frame and lettering) on both faces, two pins through it
    s3h.add(cb([(SPR.r0 + SPR.r1) / 2, 0, 0], [SPR.r1 - SPR.r0, 22.8, 12.4], 1.4), STEEL);
    s3h.add(cb([SPR.r1 + 0.45, 0, 0], [0.9, 21.6, 11.4], 0.5), DARK);
    s3h.add(cb([1009.65, 0, 0], [2.6, 22.0, 11.9], 0.6), STEEL);
    for (const sd of [-1, 1]) {
      const F = sd * 6.2, side = sd > 0 ? { u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] } : { u: [-1, 0, 0], v: [0, 1, 0], n: [0, 0, -1] }, cs = 996.6;
      s3h.add(profile([[cs - 5.6, -9.0, 1.2], [cs + 5.6, -9.0, 1.2], [cs + 5.6, 9.0, 1.2], [cs - 5.6, 9.0, 1.2]], { w: 0.5, cw: F, bevel: 0.12, curveSeg: 2, holes: [[[cs - 4.9, -8.3, 0.7], [cs + 4.9, -8.3, 0.7], [cs + 4.9, 8.3, 0.7], [cs - 4.9, 8.3, 0.7]]] }), BRIGHT);
      s3h.add(label('驚', { at: [cs, 3.7, F], ...side, hz: 6.4, swz: 0.4, proud: 0.2, sink: 0.2 }), BRIGHT);
      s3h.add(label('蟄', { at: [cs, -3.7, F], ...side, hz: 6.4, swz: 0.4, proud: 0.2, sink: 0.2 }), BRIGHT);
      for (const s of [988.4, 1004.9]) s3h.add(domeAt([s, 0, F], [0, 0, sd], 1.25, 0.6, 10), BRIGHT);
    }
    // the serial on the ricasso's top face (what the shooter looks down on)
    s3h.add(label('E01·0317', { at: [996.6, 11.4, 0], u: [1, 0, 0], v: [0, 0, -1], n: [0, 1, 0], h: 2.0, sw: 0.32, proud: 0.12, sink: 0.2 }), BRIGHT);
    // the spear: satin gunmetal body (midrib, fullers, flats), bright ground facets, copper rails, arc filaments
    const sp = spearGeo();
    s3h.add(sp.body, BLUED); s3h.add(sp.bevel, BRIGHT); s3h.add(sp.rails, CU); s3h.add(sp.fil, ARC); s3h.add(sp.rivets, BRIGHT);
    // the discharge electrode (S_arc): a copper arcing horn rising off the socket, a chrome ball on a porcelain bush
    s3h.add(along([[0, 0], [0, 5.5], [2, 6.2], [5, 5.2], [7, 3.2], [7, 0]], [966, 15.5, 0], [0, 1, 0], 18), PORC);
    s3h.add(ttube([[966, 20, 0], [967, 28, 0], [971, 34, 0], [977, 37.5, 0]], 2.2, 1.6, { radial: 10, seg: 14 }), CU);
    s3h.add(sphere([979.5, 38.5, 0], 4.4, { seg: 18 }), CHROME);
    // knuckle hinge under the socket for the crescent: two knuckles along s (the eye rides between them), a pin with a
    // domed head behind, a washer and a peened end in front
    const [hs, ht] = H.hinge;
    const knuckle = (k0, k1, top) => {
      const P = [[-7.2, top], [7.2, top], [7.2, ht]];
      for (let i = 1; i < 12; i++) { const th = -i / 12 * Math.PI; P.push([7.2 * Math.cos(th), ht + 7.2 * Math.sin(th)]); }
      P.push([-7.2, ht]);
      const hole = []; for (let i = 0; i < 20; i++) { const th = i / 20 * TAU; hole.push([3.3 * Math.cos(th), ht + 3.3 * Math.sin(th)]); }
      return section(P, k0, k1, { bevel: 0.8, bevelSeg: 2, curveSeg: 2, holes: [hole] });
    };
    s3h.add(knuckle(hs - 18.5, hs - 9.3, -13.5), STEEL);
    s3h.add(knuckle(hs + 9.3, hs + 18.5, -10.5), STEEL);
    s3h.add(cyl(hs - 20.2, hs + 20.6, 3.2, { t: ht, seg: 16 }), BRIGHT);
    s3h.add(along([[0, 0], [0, 4.8], [0.8, 4.6], [1.6, 3.2], [1.8, 0]], [hs - 18.5, ht, 0], [-1, 0, 0], 16), DARK);
    s3h.add(tube(hs + 18.5, hs + 19.3, 5.4, 3.2, { t: ht, seg: 20, b: 0.2 }), STEEL);
    s3h.add(along([[0, 0], [0, 4.0], [0.6, 3.8], [1.2, 2.8], [1.4, 0]], [hs + 19.3, ht, 0], [1, 0, 0], 16), DARK);
  }
  // ---- fx_blade: the crescent, hanging under the root at rest; v 1 flips it out 90° to the left about the hinge (s)
  {
    const hp = H.hinge, hpS = HP(hp), [hs, ht] = hp;
    const bl = g.part('fx_blade', { parent: 'fx_seg3', pivot: hpS, extras: { open: 90, hinge: 's', note: 'crescent side blade: rest = hanging under the head in the spear plane; v 1 = flipped out 90° to the left' } });
    const cr = crescentGeo();
    // the arm: a forged web from the eye down into the spine, the pin bore through it
    const arm = cut(profile([[hs - 7.6, ht], [hs + 7.6, ht], [hs + 9.4, ht - 8, 5], [1014, -40.6, 10], [1018, -47], [986, -47], [hs + 0.5, ht - 14, 6], [hs - 7.2, ht - 6, 4]], { w: 7.2, bevel: 1.1, bevelSeg: 2, curveSeg: 4 }),
      [cutters.holeS(ht, 0, 3.3, hs - 30, hs + 30)]);
    const eye = tube(hs - 8.7, hs + 8.7, 7.2, 3.3, { t: ht, seg: 24, b: 0.8 });
    // reinforcing plates riveted over the arm root on both faces (three rivets each)
    const plates = [], rv = [];
    for (const sd of [-1, 1]) {
      plates.push(profile([[984, -36.5, 3], [1005, -40, 4], [1018.5, -45.6, 2.5], [1018.5, -47.6, 1.5], [983, -47.6, 1.5], [982.6, -43, 2]], { w: 1.25, cw: sd * 4.0, bevel: 0.4, bevelSeg: 1, curveSeg: 3 }));
      for (const [s, t] of [[986, -45], [999, -44.6], [1012, -46.4]]) rv.push(domeAt([s, t, sd * 4.62], [0, 0, sd], 1.35, 0.8, 10));
    }
    bl.add(HX(merge([cr.moon, arm])), STEEL);
    bl.add(HX(cr.bev), BRIGHT);
    bl.add(HX(cr.glow), ARC);
    bl.add(HX(merge([cr.liners, ...rv])), BRIGHT);
    bl.add(HX(merge(plates)), DARK);
    bl.add(HX(eye), DARK);
    g.socket('moon', HP([CRG.sm, CR.tc - CR.sag, 0]), { ride: 'fx_blade' });   // the crescent's belly (rest: under the head)
  }

  // ======================================================================== sockets & meta
  g.socket('grip_r', [-6, -64, 0], { rot: [0, 0, -15] });
  g.socket('grip_l', [H.gripL, -H.R1 - 1, -2], { ride: 'fx_seg1' });
  g.socket('magwell', [80, -50, 0]);
  g.socket('muzzle', HP([H.tip, 0, 0]), { ride: 'fx_seg3' });
  g.socket('tip', HP([H.tip - 10, 0, 0]), { ride: 'fx_seg3' });
  g.socket('base', HP([H.root + 4, 0, 0]), { ride: 'fx_seg3' });
  g.socket('arc', HP([979.5, 38.5, 0]), { ride: 'fx_seg3' });
  g.socket('head', HP([H.root, 0, 0]), { ride: 'fx_seg3' });
  g.socket('cap', [(H.cap[0] + H.cap[1]) / 2, H.capT, 0]);
  g.socket('coil', [H.coils[1], 0, 0]);
  g.socket('flick', [H.coils[0], 4, -33]);                   // inspect: the thumb on coil 1
  g.socket('knock', [H.ins[0] + 26, 24, -20]);              // inspect: a knuckle on insulator group 1
  g.meta({
    // carried one-handed on the pistol grip (the left hand off the screen between actions: the forearm across the
    // lower centre hid close zombies); grip_l stays for the clips that take the shaft
    grip: 'heavy', support: 'none', reload: 'battery', series: 'qiming',
    notes: 'E01 春霆神戟．驚蟄. fx_seg1 > fx_seg2 > fx_seg3: telescoping shaft (open = collapse back by 80 / 200 / 170 mm). fx_blade: crescent on a knuckle hinge along s '
      + '(rest: hanging under the head in the spear plane; open +90: flipped out flat to the left). fx_coil1-3: HV coils (glow_white core, veinAxis 1). fx_cap: capacitor element (pv_core 4, hero). '
      + 'fx_led1-6: 雷能 LED bar. mag: capacitor cell. Sockets: arc = discharge electrode (S_arc), muzzle / tip / base / head on the spear, moon = crescent bottom.',
  });

  // bake: pre-tessellated, short AO reach, m4's post-bake (buried AO refill, per-material wear from curvature).
  // First a QEM pass over the dense lathes / sweeps / labels (welded by position + normal, crease splits stay split):
  // at most 0.15 mm off the authored surface (well under a pixel at hip, ~0.4 px in the 20 cm inspect close-up; pulao's
  // budget), which keeps the GLB under 5 MB (WEAPON_MODELING §6). g.lod 1 (chunting_tp, teammates' hands, seen from 3 m
  // and more: a pixel is ~3 mm there): down to 15 % within 8 mm, small pieces pruned, an 8x coarser bake grid (~25k).
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
        if (tp || n > 400) m.geometry = tp ? decimate(m.geometry, 8, 0.1, true, 0.15) : decimate(m.geometry, 0.15);
        after += m.geometry.attributes.position.count / 3;
      });
      if (o.log !== false) console.log(`chunting decimate: ${Math.round(before)} -> ${Math.round(after)} triangles`);
    }
    if (o.bake !== false) {
      const meshes = [];
      root.traverse((m) => { if (m.isMesh) meshes.push(m); });
      const tess = (o.tessellate ?? TESS) * 0.001 * (tp ? 8 : 1);
      for (const m of meshes) {
        let geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
        for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
        // (the painted / rubber / porcelain skins carry the finest AO grid; the metal is mostly bevelled small parts)
        m.geometry = /^(glow_|glass)/.test(m.userData.mat) ? geo : tessellateFat(geo, /^(porcelain|rubber|paint_|glaze_)/.test(m.userData.mat) ? tess : tess * 1.7, 0.0012);
      }
      if (o.tessOnly) return root;
      const glassy = (m) => /^(glass|glow_|obsidian)/.test(m.userData.mat);
      bakeMeshes(meshes, { tessellate: 0, aoDist: 0.024, rays: 32, log: true, minHeight: (m) => (glassy(m) ? 0.004 : 0) });
      postBake(root, {}, WEAR);
      root.traverse((m) => {
        const B = m.isMesh && m.geometry.attributes._bake?.array;
        if (!B) return;
        if (glassy(m)) for (let i = 0; i < B.length; i += 4) { B[i] = Math.max(B[i], 225); B[i + 1] = 0; B[i + 2] = 0; }
        // copper: oxide (verdigris tint via cavity) only in the deep recesses (the coil turns, the cap grooves)
        else if (m.userData.mat === CU) for (let i = 0; i < B.length; i += 4) { const ao = B[i] / 255; B[i + 2] = Math.max(B[i + 2], Math.round(255 * Math.min(0.7, 2.2 * Math.max(0, 0.86 - ao)))); }
      });
    }
    return root;
  };
  return g;
}

const TESS = 18;
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
/** per-material wear [curvature (1/m) mapped to full wear, cap]; the hazard paint only scuffs (worn towards the rubber: def mat) */
const WEAR = {
  '*:steel': [1 / 500, 0.8], '*:steel_blued': [1 / 450, 0.55], '*:steel_dark': [1 / 500, 0.6], '*:steel_bright': [1 / 600, 0.3], '*:rubber': [1 / 700, 0.3], '*:paint_yellow': [1 / 600, 0.3],
  '*:paint_white': [1 / 600, 0.25], '*:porcelain': [1 / 900, 0.25], '*:copper': [1 / 500, 0.6], '*:polymer_grip': [1 / 600, 0.45], '*:polymer': [1 / 600, 0.5], '*:chrome': [0, 0],
  '*:patina_bronze': [1 / 600, 0.3], '*:glaze_black': [0, 0],
};
