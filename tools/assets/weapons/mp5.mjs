// 黃蜂 Hornet-9 — roller-delayed 9 mm submachine gun, MP5A2 pattern with the fixed polymer stock.
// Side view in mm: s forward from the rear face of the receiver (butt pad at s ≈ -215, muzzle at 465 ->
// 680 mm overall), t up from the bore axis, w to the right (ejection-port side).
// Reference: 680 mm overall, 225 mm barrel (chamber at s = 240), ~260 mm tall with the 30-round curved mag.
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { Gun, V, DEG, profile, plan, section, lathe, cyl, tube, box, sphere, ring, screw, cut, cutters, merge, xform, mirrorW } from '../lib/gunkit.mjs';

// ------------------------------------------------------------------------------------------ local helpers

/** geometry + its mirror across w = 0 */
const both = (geo) => merge([geo, mirrorW(geo)]);

/** lathe around an axis parallel to w through [s,t,w]; axial coordinate maps to +w */
function latheW(pts, [s, t, w], seg = 20) {
  const geo = lathe(pts, { seg });
  geo.rotateY(-Math.PI / 2);
  const c = V(s, t, w);
  return geo.translate(c.x, c.y, c.z);
}
/** lathe around a vertical axis through [s,t,w]; axial coordinate maps to +t */
function latheT(pts, [s, t, w], seg = 20) {
  const geo = lathe(pts, { seg });
  geo.rotateX(Math.PI / 2);
  const c = V(s, t, w);
  return geo.translate(c.x, c.y, c.z);
}
/** domed pin / rivet head sitting on the +w face at w = W, mirrored onto the -w face */
function pinPair(s, t, W, r = 2.4, h = 0.9, seg = 16) {
  return both(latheW([[0, 0], [0, r], [h * 0.45, r * 0.93], [h, r * 0.55], [h, 0]], [s, t, W - 0.05], seg));
}
/** scales w by f(s) (side-view furniture that widens towards the butt) and re-creases normals */
function taperW(geo, f, crease = 38) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * f(-p.getZ(i)));
  geo.deleteAttribute('normal');
  return toCreasedNormals(geo, crease * DEG);
}
/** side-view pocket cutter starting at wIn and running outward; its bevel gives the opening a soft chamfer */
function pocketCut(pts, wIn, depth = 12, bevel = 1.2) {
  const dir = Math.sign(wIn) || 1;
  return profile(pts, { w: depth, cw: wIn + dir * depth / 2, bevel, bevelSeg: 2, curveSeg: 6 });
}

/** superellipse ring [u (-1..1 across w), v (0 bottom .. 1 top)], counter-clockwise seen from behind */
function seRing(n = 32, ex = 3) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = -Math.PI / 2 + (2 * Math.PI * k) / n, c = Math.cos(a), s = Math.sin(a);
    out.push([Math.sign(c) * Math.abs(c) ** (2 / ex), 0.5 + 0.5 * Math.sign(s) * Math.abs(s) ** (2 / ex)]);
  }
  return out;
}
/**
 * Lofted solid along s through cross-section stations { s, top, bot, hw, k? (inflate mm) } (sorted rear -> front).
 * `wf(v)` narrows the section towards the top (egg-shaped furniture). Closed with flat caps. The kit has no
 * loft, so this builds the BufferGeometry directly (non-indexed, creased normals like the kit's own primitives).
 */
function loft(stations, ring, { wf = () => 1, crease = 40 } = {}) {
  const P = (st, [u, v]) => {
    const k = st.k || 0;
    return [u * (st.hw * wf(v) + k), st.bot - k + v * (st.top - st.bot + 2 * k), -st.s];
  };
  const pos = [];
  const tri = (a, b, c) => pos.push(...a, ...b, ...c);
  const n = ring.length;
  for (let i = 0; i < stations.length - 1; i++) {
    const A = stations[i], B = stations[i + 1];
    for (let j = 0; j < n; j++) {
      const a0 = P(A, ring[j]), a1 = P(A, ring[(j + 1) % n]), b0 = P(B, ring[j]), b1 = P(B, ring[(j + 1) % n]);
      tri(a0, b0, b1); tri(a0, b1, a1);
    }
  }
  const capC = (st) => P(st, [0, 0.5]);
  const S0 = stations[0], S1 = stations[stations.length - 1];
  for (let j = 0; j < n; j++) {
    tri(capC(S0), P(S0, ring[j]), P(S0, ring[(j + 1) % n]));
    tri(capC(S1), P(S1, ring[(j + 1) % n]), P(S1, ring[j]));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return toCreasedNormals(geo, crease * DEG);
}
/** w of a loft's surface at height t for a station (used to seat pins / loops on curved furniture) */
function loftSurfaceW(st, t, ex, wf = () => 1) {
  const v = Math.min(1, Math.max(0, (t - st.bot) / (st.top - st.bot)));
  const sn = Math.abs(2 * v - 1) ** (ex / 2), cs = Math.sqrt(Math.max(0, 1 - sn * sn));
  return st.hw * wf(v) * cs ** (2 / ex);
}

// Tiny stroke font (3 x 5 grid, y up) for raised stamped markings.
const GLYPHS = {
  H: [[0, 0, 0, 4], [2, 0, 2, 4], [0, 2, 2, 2]],
  O: [[0, 0, 2, 0], [2, 0, 2, 4], [2, 4, 0, 4], [0, 4, 0, 0]],
  R: [[0, 0, 0, 4], [0, 4, 2, 4], [2, 4, 2, 2], [2, 2, 0, 2], [0.9, 2, 2, 0]],
  N: [[0, 0, 0, 4], [2, 0, 2, 4], [0, 4, 2, 0]],
  E: [[0, 0, 0, 4], [0, 4, 2, 4], [0, 2, 1.5, 2], [0, 0, 2, 0]],
  T: [[1, 0, 1, 4], [0, 4, 2, 4]],
  K: [[0, 0, 0, 4], [0, 1.8, 2, 4], [0.7, 2.6, 2, 0]],
  A: [[0, 0, 1, 4], [1, 4, 2, 0], [0.5, 1.6, 1.5, 1.6]],
  L: [[0, 0, 0, 4], [0, 0, 2, 0]],
  '-': [[0.3, 2, 1.7, 2]],
  '.': [[0.9, 0, 1.1, 0]],
  x: [[0.2, 0, 1.8, 2.6], [0.2, 2.6, 1.8, 0]],
  0: [[0, 0, 2, 0], [2, 0, 2, 4], [2, 4, 0, 4], [0, 4, 0, 0], [0.2, 0.4, 1.8, 3.6]],
  1: [[1, 0, 1, 4], [0.2, 3.2, 1, 4]],
  2: [[0, 4, 2, 4], [2, 4, 2, 2], [2, 2, 0, 2], [0, 2, 0, 0], [0, 0, 2, 0]],
  3: [[0, 4, 2, 4], [2, 4, 2, 0], [2, 0, 0, 0], [0.6, 2, 2, 2]],
  4: [[0, 4, 0, 2], [0, 2, 2, 2], [1.6, 0, 1.6, 4]],
  7: [[0, 4, 2, 4], [2, 4, 0.8, 0]],
  9: [[2, 0, 2, 4], [2, 4, 0, 4], [0, 4, 0, 2], [0, 2, 2, 2], [2, 0, 0, 0]],
};
/** raised stamped text on a side face at |w| = W (side +1 right / -1 left), baseline-left at (s0, t0) */
function stamp(str, { s0, t0, h = 4, side = 1, W, raise = 0.3, stroke }) {
  const u = h / 4, sw = stroke ?? Math.max(0.42, h * 0.15), adv = u * 3;
  const parts = [];
  [...str].forEach((ch, i) => {
    for (const [x1, y1, x2, y2] of GLYPHS[ch] || []) {
      const a1 = s0 + side * (i * adv + x1 * u), a2 = s0 + side * (i * adv + x2 * u);
      const b1 = t0 + y1 * u, b2 = t0 + y2 * u;
      const len = Math.hypot(a2 - a1, b2 - b1) + sw;
      const ang = Math.atan2(b2 - b1, a2 - a1) / DEG;
      parts.push(box([(a1 + a2) / 2, (b1 + b2) / 2, side * (W + raise / 2 - 0.1)], [len, sw, raise + 0.2], { r: 0, rot: [ang, 0, 0] }));
    }
  });
  return merge(parts);
}

// ------------------------------------------------------------------------------------------ dimensions
const RW = 17;               // receiver half width (outer skin)
const TT = 22, TR = 11;      // cocking-tube axis height and radius (receiver top = 33)
const SIGHT_T = 44;          // aim line (drum aperture centre / front post tip)

/** receiver cross-section (w, t): wide lower box for the bolt, cocking tube on top, shallow weld groove between */
const ARC0 = -22; // where the tube arc leaves the shoulder (deg)
function recvSection(inset = 0) {
  const hw = RW - inset, bot = -19 + inset, R = TR - inset;
  const neck = [13.4 - inset * 0.95, 13.6 - inset * 0.5, 2];
  const pts = [[-hw, bot, 3 - inset], [hw, bot, 3 - inset], [hw, 7.5 - inset * 0.4, 4.5], neck];
  for (let a = ARC0; a <= 180 - ARC0 + 0.01; a += (180 - 2 * ARC0) / 28) pts.push([R * Math.cos(a * DEG), TT + R * Math.sin(a * DEG)]);
  pts.push([-neck[0], neck[1], 2], [-hw, 7.5 - inset * 0.4, 4.5]);
  return pts;
}
/** centre of the weld bead sitting in the groove between shoulder and tube (right side) */
function weldSeam() {
  const c = [TR * Math.cos(ARC0 * DEG), TT + TR * Math.sin(ARC0 * DEG)];
  const a = [13.4 - c[0], 13.6 - c[1]], la = Math.hypot(...a);
  const b = [-Math.sin(ARC0 * DEG), Math.cos(ARC0 * DEG)];
  const m = [a[0] / la + b[0], a[1] / la + b[1]], lm = Math.hypot(...m);
  return [c[0] + 0.45 * m[0] / lm, c[1] + 0.45 * m[1] / lm];
}

export default function build() {
  const g = new Gun('mp5');

  // ======================================================================================== RECEIVER
  let recv = section(recvSection(0), 0, 238, { bevel: 0.5, curveSeg: 5, holes: [recvSection(1.5)] });
  const claw = [];
  for (const s of [52, 164]) {
    for (const a of [52, 128]) {
      const rr = TR + 1.5 - 0.8;
      claw.push(box([s, TT + rr * Math.sin(a * DEG), rr * Math.cos(a * DEG)], [9, 4.2, 3], { r: 0, rot: [0, 0, a] }));
    }
  }
  recv = cut(recv, [
    pocketCut([[186, -4, 2.5], [228, -4, 2.5], [228, 8.5, 2.5], [186, 8.5, 2.5]], 14.6, 12, 1.2), // ejection port
    cutters.box([184.5, -18, 0], [41.5, 6, 25.4]),                                                 // magwell opening
    ...claw,
    // pressed bolt-guide grooves along both sides (the guide rails inside are spot welded through them)
    pocketCut([[6, 1.4, 1.6], [180, 1.4, 1.6], [180, 4.6, 1.6], [6, 4.6, 1.6]], RW - 0.7, 12, 0.5),
    pocketCut([[6, 1.4, 1.6], [236, 1.4, 1.6], [236, 4.6, 1.6], [6, 4.6, 1.6]], -(RW - 0.7), 12, 0.5),
  ]);
  g.add(recv, 'steel');
  // front trunnion plug (closes the receiver nose behind the handguard)
  g.add(section(recvSection(1.6), 231, 237.6, { bevel: 0.4, curveSeg: 4 }), "steel_dark");
  // seam welds where the cocking tube is joined to the bolt housing, both sides
  { const [ww, wt] = weldSeam(); g.add(both(cyl(2, 236, 0.7, { t: wt, w: ww, seg: 6, b: 0.3 })), 'steel'); }
  // spot welds of the internal bolt guide rails, both sides
  for (let s = 22; s <= 172; s += 25) g.add(pinPair(s, 3, RW - 0.7, 1.15, 0.5, 10), 'steel');
  for (const t of [-8, 2]) g.add(pinPair(234.5, t, RW, 1.3, 0.45, 10), 'steel');
  // pressed brass deflector behind the ejection port
  g.add(profile([[176, 2, 1], [185, 2, 0.6], [185, 10, 1], [180, 10, 1]], { w: 3.6, cw: RW + 0.9, bevel: 0.8 }), 'steel');
  // handguard retaining pin + stock pin + housing pin
  g.add(pinPair(232.5, -9, RW, 2.3), 'steel_dark');
  g.add(box([232.5, -9, 0], [4.6, 4.6, 2 * RW + 2.8], { r: 1.4, seg: 1 }), 'steel_dark');
  // stamped markings (left side above the magwell + right side serial)
  g.add(stamp('HORNET-9', { s0: 158, t0: -12, h: 4.6, side: -1, W: RW }), 'steel');
  g.add(stamp('9x19', { s0: 158, t0: -4.5, h: 3.2, side: -1, W: RW }), 'steel');
  g.add(stamp('HN-04172', { s0: 92, t0: -12.5, h: 3.4, side: 1, W: RW }), 'steel');

  // ---- forward cocking tube (part of the receiver stamping) with the cocking slot on the left
  let ctube = tube(237.6, 396, TR, TR - 1.6, { t: TT, seg: 30 });
  ctube = cut(ctube, [
    cutters.slotW(296, 395, TT, 5.6, 10, -9),     // cocking slot
    cutters.slotW(296, 303.5, TT + 3, 7.2, 10, -9), // rear "slap" notch
  ]);
  g.add(ctube, 'steel');
  g.add(ring(238, TR + 0.15, 0.7, { t: TT, seg: 30 }), 'steel'); // tube-to-receiver weld ring

  // ---- rear sight: base block, two cheek plates, rotary aperture drum
  g.add(profile([[8, 27, 1], [33, 27, 1], [33, 35.5, 1.5], [30, 37.6, 1.5], [11, 37.6, 1.5], [8, 35, 1.5]], { w: 19, bevel: 1 }), 'steel');
  const cheek = profile('M 12 33 L 28 33 L 26.6 44 Q 26.6 50.6 20 50.6 Q 13.4 50.6 13.4 44 Z', { w: 1.8, cw: 9.9, bevel: 0.5 });
  g.add(both(cheek), 'steel');
  let drum = latheW([[-8, 0], [-8, 7.4], [-7.5, 8.4], [-6.3, 8.5], [-5.8, 7.9], [-5.2, 8.5], [5.2, 8.5], [5.8, 7.9], [6.3, 8.5], [7.5, 8.4], [8, 7.4], [8, 0]], [20, SIGHT_T, 0], 20);
  const ap = (r, a) => xform(cyl(-10, 50, r, { t: SIGHT_T, b: 0, seg: 10 }), { rot: [a, 0, 0], pivot: [20, SIGHT_T, 0] });
  drum = cut(drum, [ap(1.3, 0), ap(1.0, 90), ap(1.8, 45), ap(2.4, -45)]);
  g.add(drum, 'steel_dark');
  g.add(pinPair(20, SIGHT_T, 10.8, 2.6, 0.9), 'steel_bright');               // drum axle screws
  g.add(screw([14, 31.5, 9.5], 1.5, { face: 'w', depth: 0.6 }), 'steel_bright'); // windage screw
  g.add(screw([27, 31.5, 9.5], 1.5, { face: 'w', depth: 0.6 }), 'steel_bright');
  for (const s of [10.5, 30.5]) g.add(pinPair(s, 31.5, 9.5, 1.1, 0.45, 10), 'steel'); // spot welds

  // ======================================================================================== FRONT END
  // barrel (bore 9 mm), chamber end inside the trunnion
  g.add(lathe([[228, 4.45], [228, 11.5], [240, 11.5], [242, 9.4], [420, 8.6], [420, 4.45], [228, 4.45]], { seg: 28 }), 'steel_dark');
  // tri-lug section and threaded muzzle
  g.add(lathe([[418, 4.45], [418, 8.6], [433, 8.6], [434, 8.0], [446, 8.0], [446.6, 7.3], [447.4, 6.7], [448.2, 7.3], [449, 6.7], [449.8, 7.3], [450.6, 6.7], [451.4, 7.3], [452.2, 6.7], [453, 7.3], [453.8, 6.7], [454.6, 7.3], [455.4, 6.7], [456.2, 7.3], [457, 6.7], [457.8, 7.3], [458.6, 6.7], [459.4, 7.3], [460.2, 6.7], [461, 7.3], [462, 7.3], [463.6, 6.6], [465, 6.0], [465, 5.2], [464.4, 4.45], [418, 4.45]], { seg: 22 }), 'steel_dark');
  for (const a of [90, 210, 330]) {
    g.add(xform(box([426.5, 8.6 + 1.5, 0], [13, 3.6, 7], { r: 0.9, seg: 1 }), { rot: [0, 0, a - 90], pivot: [426.5, 0, 0] }), 'steel_dark');
  }
  // front sight base: barrel collar + cocking-tube end cap + flat web, hooded ring with post
  g.add(lathe([[396, 0], [396, 11.4], [397.2, 12.5], [414.6, 12.5], [416, 11.2], [416, 0]], { seg: 28 }), 'steel');
  g.add(lathe([[394, 0], [394, 11.6], [395, 12.2], [412, 12.2], [414.6, 11.2], [416.4, 8.4], [416.4, 6.2], [415.8, 5.6], [415.8, 0]], { t: TT, seg: 28 }), 'steel');
  g.add(profile([[397, -2, 1], [414.5, -2, 1], [414.5, 24, 1], [397, 24, 1]], { w: 20, bevel: 1.4 }), 'steel');
  g.add(profile([[399.5, 30, 1], [413, 30, 1], [412, 37.2, 1.5], [400.5, 37.2, 1.5]], { w: 11, bevel: 1 }), 'steel');
  g.add(tube(400, 412.5, 10, 8.3, { t: SIGHT_T, seg: 30, b: 0.6 }), 'steel');
  g.add(box([406.5, 37.6, 0], [4.2, 3.2, 4.2], { r: 0.6, seg: 1 }), 'steel');
  g.add(box([406.5, 40, 0], [2.4, 8, 2.0], { r: 0.3, seg: 1 }), 'steel_dark');      // front post (tip at t = 44)
  g.add(ring(405.5, 5.4, 1.2, { t: 14, w: -14.5, axis: 't', seg: 20 }), 'steel');  // front sling loop (left)
  g.add(pinPair(405.5, 6, 10, 1.8, 0.6, 12), 'steel_dark');                          // barrel cross pin

  // slim polymer handguard: U section around the barrel under the cocking tube, front hand-stop lip
  const hg = [[10.6, 16.2, 0.8], [16.2, 16.2, 2.5], [21.2, 7, 6], [21.6, -8, 0], [17.5, -21, 8], [9, -26.5, 10],
    [-9, -26.5, 10], [-17.5, -21, 8], [-21.6, -8, 0], [-21.2, 7, 6], [-16.2, 16.2, 2.5], [-10.6, 16.2, 0.8],
    [-14, 9, 3], [-14.2, -6, 6], [-8, -15.5, 6], [8, -15.5, 6], [14.2, -6, 6], [14, 9, 3]];
  let hguard = section(hg, 239.2, 383, { bevel: 2.4, bevelSeg: 3, curveSeg: 5 });
  const flutes = [];
  for (const side of [1, -1]) {
    for (const t of [-9, 0]) flutes.push(pocketCut([[262, t - 2.2, 2.2], [364, t - 2.2, 2.2], [364, t + 2.2, 2.2], [262, t + 2.2, 2.2]], side * 20.3, 10, 0.9));
  }
  hguard = cut(hguard, flutes);
  g.add(hguard, 'polymer');
  const lip = hg.map(([w, t, r]) => [w * (Math.abs(w) > 9 ? 1.09 : 1), t < 0 ? t * 1.13 : t, r]);
  g.add(section(lip, 381, 394.8, { bevel: 2.4, bevelSeg: 2, curveSeg: 5 }), 'polymer');

  // ======================================================================================== LOWER
  // magwell (stamped, welded under the receiver), flared mouth
  let mw = profile([[160.4, -16, 1], [207.5, -16, 1], [208.6, -50, 2.5], [210.2, -55, 1.2], [158.6, -55, 1.2], [160.2, -50, 2.5]], { w: 30, bevel: 1.2 });
  mw = cut(mw, [plan([[164, -12.7, 2], [205.6, -12.7, 2], [205.6, 12.7, 2], [164, 12.7, 2]], { h: 60, ct: -27, bevel: 1.6 })]);
  g.add(mw, 'steel');
  for (let s = 164; s <= 205; s += 8) g.add(pinPair(s, -17.6, 15, 1.1, 0.45, 10), 'steel');
  // mag release button (right side) with a guard rib
  g.add(latheW([[0, 0], [0, 4.2], [1.6, 4.0], [2.4, 3.3], [2.6, 0]], [168, -37, 15], 20), 'steel_dark');
  g.add(profile([[161, -44, 1], [176, -44, 1], [176, -42, 1], [161, -42, 1]], { w: 2.4, cw: 15.6, bevel: 0.6 }), 'steel');

  // polymer trigger housing with integral grip and guard (ambi lower)
  const HW = 30.6;
  const HP = HW / 2 - 0.6; // recessed side panel surface
  {
    let housing = profile([[10.5, -17, 1], [159.4, -17, 1], [159.4, -47, 2.5], [148, -50, 2], [92, -50, 2], [44, -52, 4], [10.5, -48, 3]], { w: HW, bevel: 1.6, bevelSeg: 2, curveSeg: 6 });
    const panel = [[17, -21, 2.5], [152, -21, 2.5], [152, -44.5, 2.5], [96, -46.6, 3], [46, -48.4, 4], [17, -45, 3]];
    housing = cut(housing, [pocketCut(panel, HP, 10, 0.5), pocketCut(panel, -HP, 10, 0.5)]);
    g.add(housing, 'polymer');
  }
  // Lofted pistol grip, 15 deg rake: oval section narrowing to the front strap, palm swell at the back,
  // small pinky lip at the bottom front. Built along a local axis (d = distance down the grip, t' towards the
  // front strap) then swung into place; the lower part carries a stippled wrap (polymer_grip).
  const GR = 15 * DEG, GT = [69, -46];
  const gEx = 2.6, gRing = seRing(28, gEx), gWf = (v) => 1 - 0.2 * v;
  const gSt = (d, k = 0) => {
    const x = Math.min(1, Math.max(0, d / 96));
    const front = 21 + 2.6 * Math.max(0, (d - 76) / 16) ** 2;
    const back = -21 - 3.2 * Math.sin(Math.PI * Math.min(1, x * 1.12));
    return { s: d, top: Math.min(front, 23.6), bot: back, hw: 15 - 1.4 * x, k };
  };
  const placeGrip = (geo) => {
    const p = geo.attributes.position, sn = Math.sin(GR), cs = Math.cos(GR);
    for (let i = 0; i < p.count; i++) {
      const tp = p.getY(i), d = -p.getZ(i);
      p.setY(i, GT[1] - d * cs - tp * sn);
      p.setZ(i, -(GT[0] - d * sn + tp * cs));
    }
    geo.deleteAttribute('normal');
    return toCreasedNormals(geo, 40 * DEG);
  };
  g.add(placeGrip(loft([gSt(-8), gSt(4), gSt(16), gSt(30), gSt(50), gSt(70), gSt(84), gSt(91), { ...gSt(94.2), k: -1.3 }, { ...gSt(96), k: -4.5 }], gRing, { wf: gWf })), 'polymer');
  g.add(placeGrip(loft([gSt(18, 0.0), gSt(19, 0.4), gSt(30, 0.4), gSt(50, 0.4), gSt(70, 0.4), gSt(84, 0.4), gSt(88.5, 0.4), gSt(89.5, 0)], gRing, { wf: gWf })), 'polymer_grip');
  // trigger guard
  let guard = profile([[86, -47, 1], [150, -47, 1], [150, -53, 2], [146, -66, 8], [132, -74, 8], [100, -74, 8], [87, -62, 4]], { w: 11, bevel: 1.5, curveSeg: 6 });
  guard = cut(guard, [cutters.slotW(97, 141, -60.5, 14, 30), cutters.slotW(104, 135, -64, 10, 30)]);
  g.add(guard, 'polymer');
  // housing pins (trigger, hammer, sear) and the selector bushing
  for (const [s, t] of [[106, -42], [40, -31], [132, -33]]) g.add(pinPair(s, t, HP, 2.0, 0.6, 14), 'steel_dark');
  g.add(pinPair(64, -34, HP, 4.6, 0.9, 20), 'polymer');
  // fire-control pictograms around the selector, both sides (white = safe, red = fire)
  for (const side of [1, -1]) {
    const pic = (a, n, mat) => {
      for (let k = 0; k < n; k++) {
        const r = 13.6, da = (k - (n - 1) / 2) * 7.5;
        const ang = a + da;
        const s = 64 + r * Math.cos(ang * DEG), t = -34 + r * Math.sin(ang * DEG);
        g.add(box([s, t, side * (HP + 0.1)], [1.3, 3.4, 0.5], { r: 0, rot: [ang - 90, 0, 0] }), mat);
      }
    };
    pic(100, 1, 'paint_white');
    pic(50, 1, 'paint_red');
    pic(2, 3, 'paint_red');
  }

  // ---- selector (ambidextrous), pivot on its axle
  const sel = g.part('selector', { pivot: [64, -34, 0] });
  const arm = (side, len, wid) => {
    const a = 100 * DEG, c = Math.cos(a), s_ = Math.sin(a), px = -s_, py = c;
    const p = (r, o) => [64 + c * r + px * o, -34 + s_ * r + py * o];
    return profile([[...p(-5, -wid / 2), 1], [...p(len, -1.2), 1], [...p(len + 1.5, 0), 0.6], [...p(len, 1.2), 1], [...p(-5, wid / 2), 1]], { w: 2.2, cw: side * (HW / 2 + 1.5), bevel: 0.6 });
  };
  sel.add(arm(-1, 9.5, 9), 'steel');
  sel.add(arm(1, 7, 7), 'steel');
  sel.add(latheW([[0, 0], [0, 5.2], [0.9, 5.0], [1.3, 4.0], [1.3, 0]], [64, -34, HW / 2 + 2.5], 20), 'steel');
  sel.add(mirrorW(latheW([[0, 0], [0, 5.2], [0.9, 5.0], [1.3, 4.0], [1.3, 0]], [64, -34, HW / 2 + 2.5], 20)), 'steel');
  // thumb tab on the left lever
  sel.add(box([64 - 2.5, -34 + 6.5, -(HW / 2 + 3.2)], [3.2, 6, 2.2], { r: 0.6, seg: 1, rot: [10, 0, 0] }), 'steel');

  // ---- trigger (pivot on the trigger pin)
  const trig = g.part('trigger', { pivot: [106, -42, 0] });
  trig.add(profile('M 103 -46 L 110 -46 Q 106 -58 113.5 -68 Q 112 -71 108.5 -69.5 Q 100.5 -60 103 -46 Z', { w: 6.4, bevel: 0.9, curveSeg: 12 }), 'steel');
  trig.add(cyl(-3.4, 3.4, 2.4, { seg: 12 }).rotateY(-Math.PI / 2).translate(0, -42, -106), 'steel_dark');

  // ---- paddle magazine release behind the magwell
  const latch = g.part('latch', { pivot: [155.5, -47.5, 0], extras: { rot: 'w', angle: 14 } });
  latch.add(profile('M 151.5 -48 L 159 -48 L 158.2 -55 Q 157.5 -66 151.5 -70.5 L 147.6 -69.6 Q 152 -62 151.8 -55 Z', { w: 13, bevel: 1, curveSeg: 10 }), 'steel');
  for (let i = 0; i < 4; i++) latch.add(box([153.4 - i * 0.9, -56 - i * 3.6, 0], [1.2, 1.4, 13.6], { r: 0.4, seg: 1, rot: [-20 - i * 6, 0, 0] }), 'steel');

  // ======================================================================================== STOCK
  // Lofted polymer stock: rounded-square section that grows from the receiver (34 mm wide) to the butt
  // (40 mm), straight comb in line with the bore, concave lower line from the grip frame to the toe.
  const SX = 3.2, sRing = seRing(36, SX), sWf = (v) => 1 - 0.1 * v;
  const sTop = (s) => 33 - 4 * (-s / 201);
  const sBot = (s) => { const x = -s / 201; return -46.5 - 55 * x + 13 * x * (1 - x); };
  const sHw = (s) => 17 + 3 * (-s / 201);
  const st = (s, k = 0) => ({ s, top: sTop(s), bot: sBot(s), hw: sHw(s), k });
  const stockSt = [-201, -199.5, -192, -175, -150, -120, -90, -60, -35, -15, -4].map((s) => st(s));
  stockSt.push({ ...st(-1.2), k: -0.5 }, { ...st(0), k: -1.8 });
  g.add(loft(stockSt, sRing, { wf: sWf }), 'polymer');
  // yellow identification band near the butt (slightly proud of the moulding, chamfered edges)
  g.add(loft([st(-194, 0.05), st(-193.5, 0.45), st(-186.5, 0.45), st(-186, 0.05)], sRing, { wf: sWf }), 'paint_yellow');
  // rubber butt pad: same section, inflated, rounded rear with horizontal grip grooves
  let pad = loft([{ ...st(-201.4), s: -215, k: -2.4 }, { ...st(-201.4), s: -213.6, k: 0 }, { ...st(-201.4), s: -211, k: 0.9 }, { ...st(-201.4), k: 0.4 }], seRing(28, SX), { wf: sWf });
  const grooves = [];
  for (let t = 17; t > -96; t -= 9.4) grooves.push(cutters.box([-216, t, 0], [5, 2.2, 60]));
  pad = cut(pad, grooves);
  g.add(pad, 'rubber');
  g.add(loft([{ ...st(-202), k: 0.15 }, { ...st(-200.2), k: 0.15 }], sRing, { wf: sWf }), 'polymer'); // butt cap rim
  // stock lug wrapping the rear of the trigger housing
  g.add(profile([[-8, -18.6, 1], [10.2, -18.6, 1], [10.2, -48, 2.5], [-8, -50, 2.5]], { w: HW + 0.6, bevel: 1.4 }), 'polymer');
  // moulding parting line along the comb
  g.add(box([-100, sTop(-100) + 0.15, 0], [192, 1.0, 1.4], { r: 0, rot: [Math.atan2(4, 201) / DEG, 0, 0] }), 'polymer');
  // stock push pin (heads both sides) + housing pin through the lug
  g.add(pinPair(-9, 15, loftSurfaceW(st(-9), 15, SX, sWf) + 0.1, 2.6, 0.9), 'steel_dark');
  g.add(pinPair(1, -33, (HW + 0.6) / 2, 2.4, 0.8), 'steel_dark');
  // rear sling loop on the left of the stock nose
  {
    const wl = loftSurfaceW(st(-18), 6, SX, sWf);
    g.add(ring(-18, 5.6, 1.4, { t: 6, w: -wl - 3.6, axis: 't', seg: 20 }), 'steel');
    g.add(box([-18, 6, -wl - 0.6], [11, 7, 3], { r: 1.2, seg: 1 }), 'steel');
  }

  // ======================================================================================== BOLT / COCKING LEVER
  const bolt = g.part('bolt', { pivot: [398, TT, -29], extras: { travel: 0.09 } });
  // folding cocking lever in the slot on the left of the cocking tube, knurled vertical knob
  bolt.add(plan([[383.5, -6.5, 1], [391.5, -6.5, 1], [400.5, -24.5, 2], [393.5, -27.5, 2]], { h: 4.6, ct: TT, bevel: 0.9 }), 'steel');
  bolt.add(latheT([[-9, 0], [-9, 4.6], [-8, 5.6], [-3.2, 5.6], [-2.6, 5.1], [-2, 5.6], [2, 5.6], [2.6, 5.1], [3.2, 5.6], [8, 5.6], [9, 4.6], [9, 0]], [398, TT, -29], 20), 'steel');
  bolt.add(box([388.5, TT, -8], [10, 4.8, 4], { r: 0.6, seg: 1 }), 'steel_bright');     // cocking piece in the slot
  // bolt group seen through the ejection port (pulled back together with the lever when charging)
  bolt.add(lathe([[196, 0], [196, 9.6], [229.5, 9.6], [231, 8.4], [231, 0]], { seg: 24 }), 'steel_bright');
  bolt.add(section([[-12.5, -10, 2], [12.5, -10, 2], [12.5, 12, 3], [-12.5, 12, 3]], 110, 197, { bevel: 0.6 }), 'steel_bright');
  bolt.add(box([220, 6.8, 8.6], [17, 3, 3.4], { r: 0.6, seg: 1 }), 'steel');           // extractor
  for (const w of [10.2, -10.2]) bolt.add(latheT([[-4, 0], [-4, 2.6], [-3.4, 3], [3.4, 3], [4, 2.6], [4, 0]], [224, 0, w], 14), 'steel_dark'); // locking rollers

  // ======================================================================================== MAGAZINE
  const mag = g.part('mag', { pivot: [184, -19, 0], extras: { drop: true } });
  mag.add(profile('M 166 -21 L 202 -21 L 202.4 -50 C 203.5 -100 212 -150 234 -189 L 201 -204 C 182 -166 168.5 -110 166.6 -50 Z', { w: 24, bevel: 1.6, bevelSeg: 2, curveSeg: 18 }), 'steel_dark');
  // pressed stiffening ribs following the curve
  mag.add(profile('M 181.5 -58 L 187.5 -58 C 188.5 -105 195 -155 213 -192 L 208 -194.5 C 190.5 -157 183 -105 181.5 -58 Z', { w: 25.2, bevel: 0.5, curveSeg: 14 }), 'steel_dark');
  mag.add(profile('M 196.5 -62 L 199.5 -62 C 200.5 -105 207 -145 221.5 -177 L 218.5 -178.5 C 204 -146 197.5 -105 196.5 -62 Z', { w: 24.9, bevel: 0.4, curveSeg: 12 }), 'steel_dark');
  // floor plate (perpendicular to the curved body) with a lock dimple
  {
    const d = [0.447, -0.894], e = [0.91, 0.41];
    const P = (b, ke, kd) => [b[0] + e[0] * ke + d[0] * kd, b[1] + e[1] * ke + d[1] * kd];
    const R0 = [201, -204], F0 = [234, -189];
    mag.add(profile([[...P(R0, -1.6, -2.5), 1], [...P(F0, 1.6, -2.5), 1], [...P(F0, 2.2, 3.2), 1.6], [...P(R0, -1.6, 4.2), 1.6]], { w: 26.4, bevel: 1.2 }), 'steel');
    const c = P([217.5, -196.5], 0, 4.2);
    mag.add(xform(latheT([[0, 0], [0, 3.4], [0.7, 3.0], [1.0, 0]], [0, 0, 0], 16), { rot: [26.6, 0, 0] }).translate(0, c[1], -c[0]), 'steel');
  }
  // feed lips and the top cartridge (9x19)
  const lipR = [[9.6, -22.5], [12, -22.5], [12, -17.5, 1.6], [8.4, -14.2, 1.1], [6.4, -14.6], [7.2, -16.1], [9.6, -17.2]];
  mag.add(section(lipR, 166.5, 194, { bevel: 0.5 }), 'steel_dark');
  mag.add(mirrorW(section(lipR, 166.5, 194, { bevel: 0.5 })), 'steel_dark');
  mag.add(lathe([[168, 0], [168, 4.6], [168.6, 4.95], [169.6, 4.95], [169.8, 4.4], [170.6, 4.4], [170.9, 4.85], [187, 4.75], [187.2, 4.5], [187.2, 0]], { t: -19, w: 2.6, seg: 18 }), 'brass');
  mag.add(lathe([[187.1, 0], [187.1, 4.5], [190.5, 4.45], [194.5, 3.6], [197, 2.2], [197.7, 0]], { t: -19, w: 2.6, seg: 18 }), 'copper');

  // ======================================================================================== SOCKETS / META
  g.socket('muzzle', [465, 0, 0]);
  g.socket('eject', [207, 3, RW], { dir: [0.25, 0.35, 1] });
  g.socket('grip_r', [57.3, -89.5, 0], { rot: [0, 0, -15] });
  g.socket('grip_l', [318, -14, 0]);
  g.socket('magwell', [190, -72, 0]);
  g.socket('charge', [398, TT, -29]);
  g.socket('sight_rear', [20, SIGHT_T, 0]);
  g.socket('sight_front', [406.5, SIGHT_T, 0]);
  g.meta({
    grip: 'rifle', support: 'handguard', reload: 'mag_curved', chargeSide: 'left',
    notes: 'Non-reciprocating cocking lever on the left front of the cocking tube: bolt part slides back 90 mm '
      + '(lever + bolt group seen through the port) and can be "slapped" forward. Paddle mag release = latch part '
      + '(rotates about w, front edge down). Selector rotates about w from safe (up) to auto (forward).',
  });
  return g;
}
