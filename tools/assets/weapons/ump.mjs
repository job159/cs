// 獵犬 Hound-45 — UMP-pattern .45 polymer SMG. Side view, mm: s forward from the rear face of the upper
// receiver (stock hinge), t up from the bore axis, w right (ejection-port side).
// Real reference: 690 mm stock extended / 450 mm folded, 200 mm barrel, 25-round straight .45 magazine.
//   receiver rear s = 0, chamber s = 250, muzzle s = 448 (200 mm barrel), butt pad s = -240 -> 688 mm overall.
import { Gun, profile, plan, section, lathe, cyl, tube, box, ring, cut, intersect, cutters, merge, xform, DEG } from '../lib/gunkit.mjs';

// ------------------------------------------------------------------------------------------ local helpers
/** profile with a lighter default curve resolution (small fillets don't need 10 segments) */
const P = (spec, o = {}) => profile(spec, { curveSeg: 5, ...o });
/** rounded box with a single rounding segment (~108 tris instead of ~300) */
const B = (c, s, o = {}) => box(c, s, { seg: 1, ...o });
/** cylinder along t (vertical) at [s, w] */
const cylT = (s, w, t0, t1, r, o = {}) => xform(cyl(t0, t1, r, o), { rot: [90, 0, 0], move: [s, 0, w] });
/** cylinder along w (across the gun) at [s, t] */
const cylW = (s, t, w0, w1, r, o = {}) => xform(cyl(w0, w1, r, o), { rot: [0, -90, 0], move: [s, t, 0] });
/** lathe whose axis runs along w (profile pts are [w, r], increasing w) */
const latheW = (pts, s, t, o = {}) => xform(lathe(pts, o), { rot: [0, -90, 0], move: [s, t, 0] });
/** domed pin / rivet head facing +w (dir 1) or -w (dir -1) */
const head = (s, t, w, r = 2.2, dir = 1, depth = 0.9, seg = 12) => {
  const h = lathe([[0, 0], [0, r], [depth * 0.55, r * 0.92], [depth, r * 0.55], [depth, 0]], { seg });
  h.rotateY(dir > 0 ? -Math.PI / 2 : Math.PI / 2);
  return h.translate(w, t, -s);
};
/** pin through the gun: heads on both faces at |w| = half */
const pinHeads = (s, t, half, r = 2.4) => merge([head(s, t, half - 0.25, r, 1), head(s, t, -half + 0.25, r, -1)]);
/** socket-head cap screw facing ±w (recessed hex drive) */
const capScrew = (s, t, w, r = 2.2, dir = 1) => {
  const h = lathe([[0, 0], [0, r], [0.35, r], [1.3, r * 0.88], [1.3, r * 0.5], [0.55, r * 0.5], [0.55, 0]], { seg: 12 });
  h.rotateY(dir > 0 ? -Math.PI / 2 : Math.PI / 2);
  return h.translate(w, t, -s);
};
/** screw head facing +t */
const headT = (s, t, w, r = 2, depth = 0.8) => {
  const h = lathe([[0, 0], [0, r], [depth * 0.55, r * 0.92], [depth, r * 0.55], [depth, 0]], { seg: 12 });
  h.rotateX(Math.PI / 2);
  return h.translate(w, t, -s);
};

/**
 * Light Picatinny rail: dovetail base (section) + one comb profile for all the cross teeth
 * (the kit's rail() builds every tooth as a filleted extrusion: ~300 tris per tooth).
 */
function lrail(s0, s1, { t = 0, w = 0, side = 'top', width = 21.2, height = 6, slot = 10, tooth = 5.3 } = {}) {
  const hw = width / 2;
  const base = section([[-hw + 1.6, 0], [hw - 1.6, 0], [hw, 1.8], [hw - 1.1, 3.3], [-hw + 1.1, 3.3], [-hw, 1.8]], s0, s1, { bevel: 0.35, bevelSeg: 1 });
  const len = s1 - s0, n = Math.floor(len / slot), off = (len - n * slot) / 2 + (slot - tooth) / 2;
  const pts = [[s0 + 0.6, 2.4]];
  for (let i = 0; i < n; i++) {
    const a = s0 + off + i * slot;
    pts.push([a, 3.1], [a, height], [a + tooth, height], [a + tooth, 3.1]);
  }
  pts.push([s1 - 0.6, 2.4]);
  const comb = profile(pts, { w: width - 2.6, bevel: 0.35, bevelSeg: 1 });
  // tooth flanks chamfered like the real dovetail: trim with a trapezoid section
  const geo = merge([base, comb]);
  if (side !== 'top') geo.rotateZ(-(side === 'left' ? -90 : side === 'right' ? 90 : 180) * DEG);
  geo.translate(w, t, 0);
  return geo;
}

// Tiny stroke font for raised markings (original names only). Glyph cell 2 x 4 units.
const FONT = {
  A: [[0, 0, 0, 3], [0, 3, 1, 4], [1, 4, 2, 3], [2, 3, 2, 0], [0, 1.8, 2, 1.8]],
  C: [[2, 4, 0, 4], [0, 4, 0, 0], [0, 0, 2, 0]],
  D: [[0, 0, 0, 4], [0, 4, 1.3, 4], [1.3, 4, 2, 3.2], [2, 3.2, 2, 0.8], [2, 0.8, 1.3, 0], [1.3, 0, 0, 0]],
  E: [[2, 4, 0, 4], [0, 4, 0, 0], [0, 0, 2, 0], [0, 2, 1.5, 2]],
  F: [[2, 4, 0, 4], [0, 4, 0, 0], [0, 2, 1.5, 2]],
  H: [[0, 0, 0, 4], [2, 0, 2, 4], [0, 2, 2, 2]],
  I: [[1, 0, 1, 4]],
  K: [[0, 0, 0, 4], [0, 1.6, 2, 4], [0.7, 2.4, 2, 0]],
  L: [[0, 4, 0, 0], [0, 0, 2, 0]],
  M: [[0, 0, 0, 4], [0, 4, 1, 2], [1, 2, 2, 4], [2, 4, 2, 0]],
  N: [[0, 0, 0, 4], [0, 4, 2, 0], [2, 0, 2, 4]],
  O: [[0, 0, 2, 0], [2, 0, 2, 4], [2, 4, 0, 4], [0, 4, 0, 0]],
  P: [[0, 0, 0, 4], [0, 4, 2, 4], [2, 4, 2, 2], [2, 2, 0, 2]],
  R: [[0, 0, 0, 4], [0, 4, 2, 4], [2, 4, 2, 2], [2, 2, 0, 2], [0.8, 2, 2, 0]],
  S: [[2, 4, 0, 4], [0, 4, 0, 2], [0, 2, 2, 2], [2, 2, 2, 0], [2, 0, 0, 0]],
  T: [[0, 4, 2, 4], [1, 4, 1, 0]],
  U: [[0, 4, 0, 0], [0, 0, 2, 0], [2, 0, 2, 4]],
  0: [[0, 0, 2, 0], [2, 0, 2, 4], [2, 4, 0, 4], [0, 4, 0, 0], [0, 0.5, 2, 3.5]],
  1: [[1, 0, 1, 4], [1, 4, 0.3, 3.3]],
  2: [[0, 4, 2, 4], [2, 4, 2, 2], [2, 2, 0, 2], [0, 2, 0, 0], [0, 0, 2, 0]],
  3: [[0, 4, 2, 4], [2, 4, 2, 0], [2, 0, 0, 0], [0.6, 2, 2, 2]],
  4: [[0, 4, 0, 1.6], [0, 1.6, 2, 1.6], [1.5, 3, 1.5, 0]],
  5: [[2, 4, 0, 4], [0, 4, 0, 2], [0, 2, 2, 2], [2, 2, 2, 0], [2, 0, 0, 0]],
  7: [[0, 4, 2, 4], [2, 4, 0.8, 0]],
  '-': [[0.3, 2, 1.7, 2]],
  '.': [[0.75, 0, 1.25, 0]],
};
/**
 * Raised lettering on a side face. side = +1 (right face, reads towards +s) or -1 (left face, reads towards -s).
 * s0/t0 = start of the baseline, h = cap height, w0 = face position, depth = relief height.
 */
function text(str, { s0, t0, h = 4, side = 1, w0, depth = 0.45, stroke = 0.6 }) {
  const k = h / 4, out = [];
  let x = 0;
  for (const ch of str.toUpperCase()) {
    const glyph = FONT[ch];
    if (glyph) for (const [x0, y0, x1, y1] of glyph) {
      const a = [s0 + side * (x + x0) * k, t0 + y0 * k], b = [s0 + side * (x + x1) * k, t0 + y1 * k];
      const ds = b[0] - a[0], dt = b[1] - a[1], L = Math.hypot(ds, dt);
      out.push(box([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, w0 + side * (depth / 2 - 0.25)], [L + stroke, stroke, depth + 0.5], { r: 0, rot: [Math.atan2(dt, ds) / DEG, 0, 0] }));
    }
    x += ch === ' ' ? 2.4 : ch === '.' ? 1.8 : 3.3;
  }
  return merge(out);
}

export default function build() {
  const g = new Gun('ump');
  const RW = 21;     // receiver half-width (42 mm polymer upper)
  const LW = 36;     // trigger-housing width
  const LOS = 36;    // iron-sight line above the bore

  // ============================================================================ upper receiver (polymer)
  // Side silhouette: boxy upper with a chamfered rear top, deeper fore-end with a hand-stop lip.
  let recv = profile([
    [0, 13, 3], [7, 21, 3], [409, 21, 2], [412, 18, 2], [412, -12, 2], [410, -27, 5], [402, -47, 3], [391, -47, 3],
    [384, -38, 4], [270, -38, 7], [258, -26, 1], [0, -26, 3],
  ], { w: RW * 2, bevel: 2.6, bevelSeg: 3, curveSeg: 6 });
  // cross-section: chamfered top edges along the whole receiver
  const xsec = section([[-22, -60], [22, -60], [22, 10.5, 3], [16.4, 23, 3], [-16.4, 23, 3], [-22, 10.5, 3]], -5, 420, { bevel: 0, curveSeg: 4 });
  recv = intersect(recv, xsec);
  const magHole = cutters.box([229, -40, 0], [43, 62, 27.2]);
  recv = cut(recv, [
    cutters.pocketW([[190, -8, 3.5], [252, -8, 3.5], [252, 10, 3.5], [190, 10, 3.5]], 5, 40),        // ejection port (right)
    cutters.pocketW([[256, 5.2, 3], [356, 5.2, 3], [356, 11.4, 3], [256, 11.4, 3]], -14.5, 40),        // charging-handle slot (left)
    magHole,
    cutters.pocketW([[66, -22, 2], [182, -22, 2], [182, -6, 2], [66, -6, 2]], -(RW - 0.8), 12),       // marking panel left
    cutters.pocketW([[62, -22, 2], [168, -22, 2], [168, -10, 2], [62, -10, 2]], RW - 0.8, 12),        // marking panel right
    cutters.pocketW([[284, -34, 3], [372, -34, 3], [372, -22, 3], [284, -22, 3]], RW - 0.7, 12),      // fore-end grip recess R
    cutters.pocketW([[284, -34, 3], [372, -34, 3], [372, -22, 3], [284, -22, 3]], -(RW - 0.7), 12),   // fore-end grip recess L
    cutters.slotW(8, 184, 1, 1.8, 1.8, RW), cutters.slotW(8, 184, 1, 1.8, 1.8, -RW),                     // moulded side grooves
    cutters.slotW(256, 278, 1, 1.8, 1.8, RW),
  ]);
  g.add(recv, 'polymer');
  // raised moulded surround on the ejection port
  g.add(P([[186.5, -11, 4.5], [255.5, -11, 4.5], [255.5, 11.6, 3], [186.5, 11.6, 3]], { w: 1.4, cw: RW + 0.05, bevel: 0.5, bevelSeg: 1, holes: [[[190, -8, 3.5], [252, -8, 3.5], [252, 10, 3.5], [190, 10, 3.5]]] }), 'polymer');

  // magazine well (part of the moulding, slightly narrower) with a flared mouth
  let well = merge([
    P([[199.5, -22], [260, -22], [260, -56, 2], [199.5, -56, 2]], { w: 37, bevel: 2 }),
    P([[196.8, -64, 2], [262.6, -64, 2], [262.6, -54, 2.5], [196.8, -54, 2.5]], { w: 39.5, bevel: 2 }),
  ]);
  well = cut(well, [magHole, cutters.box([229, -64, 0], [47, 4, 31.5])]);
  g.add(well, 'polymer');
  // stippled fore-end grip panels sitting in their recesses
  for (const sd of [1, -1]) g.add(P([[286, -32.6, 2.5], [370, -32.6, 2.5], [370, -23.4, 2.5], [286, -23.4, 2.5]], { w: 1.2, cw: sd * (RW - 0.5), bevel: 0.35, bevelSeg: 1 }), 'polymer_grip');
  // moulded ribs on the magwell front
  for (const sd of [1, -1]) for (let i = 0; i < 3; i++) g.add(B([264.5 + i * 5.5, -31, sd * 20.9], [2.2, 7, 1.4], { r: 0.5 }), 'polymer');

  // ---- top rail (full length between the sights) + clamp screws in the slots
  g.add(lrail(58, 386, { t: 21 }), 'alu');
  for (const s of [82, 222, 362]) g.add(headT(s, 24.3, 0, 2.1), 'steel_dark');
  // ---- side rails on the fore-end + bottom rail
  // (polymer accessory rails, screwed to the moulding)
  g.add(lrail(282, 384, { t: -8, w: RW, side: 'right' }), 'polymer');
  g.add(lrail(282, 384, { t: -8, w: -RW, side: 'left' }), 'polymer');
  g.add(lrail(294, 382, { t: -38, side: 'bottom' }), 'polymer');
  for (const s of [293, 373]) {
    g.add(capScrew(s, -8, RW + 3.3, 2.1, 1), 'steel_dark');
    g.add(capScrew(s, -8, -RW - 3.3, 2.1, -1), 'steel_dark');
  }

  // ---- receiver pins (trigger housing, barrel trunnion, stock block)
  g.add(pinHeads(274, -30, RW, 2.4), 'steel_dark');      // fore-end / trunnion cross pin
  g.add(pinHeads(398, -14, RW, 2.2), 'steel_dark');      // barrel retaining pin
  g.add(pinHeads(16, -14, RW, 2.6), 'steel_dark');       // rear housing pin
  g.add(pinHeads(184, -16, RW, 2.0), 'steel_dark');      // ejector pin (behind the port)
  // rear sling loop (left), front sling loop (left, at the hand stop)
  g.add(ring(22, 6.5, 1.5, { t: 4, w: -RW - 1, axis: 's', seg: 20 }), 'steel_dark');
  g.add(B([22, 4, -RW - 0.6], [14, 14, 2], { r: 1 }), 'steel_dark');
  g.add(ring(396, 6, 1.4, { t: -40, w: -RW - 1, axis: 's', seg: 20 }), 'steel_dark');
  g.add(B([396, -40, -RW - 0.5], [10, 10, 2], { r: 1 }), 'steel_dark');

  // ---- markings (original name only)
  g.add(text('HOUND-45', { s0: 170, t0: -14, h: 5.6, side: -1, w0: -(RW - 0.8) }), 'polymer');
  g.add(text('CAL.45 HD 04172', { s0: 170, t0: -20, h: 3, side: -1, w0: -(RW - 0.8), stroke: 0.45 }), 'polymer');
  g.add(text('CAL.45', { s0: 68, t0: -18.5, h: 4.2, side: 1, w0: RW - 0.8 }), 'polymer');
  g.add(text('CF ARMS', { s0: 106, t0: -18.5, h: 4.2, side: 1, w0: RW - 0.8 }), 'polymer');
  // riveted steel serial plate moulded into the right rear of the receiver
  g.add(P([[24, -21, 1.5], [56, -21, 1.5], [56, -7, 1.5], [24, -7, 1.5]], { w: 1.2, cw: RW + 0.2, bevel: 0.4, bevelSeg: 1 }), 'steel_dark');
  g.add(head(27, -14, RW + 0.75, 1.1, 1, 0.5, 10), 'steel');
  g.add(head(53, -14, RW + 0.75, 1.1, 1, 0.5, 10), 'steel');
  g.add(text('HD04172', { s0: 30.5, t0: -16, h: 3.4, side: 1, w0: RW + 0.8, stroke: 0.45, depth: 0.3 }), 'steel_dark');

  // ============================================================================ sights
  // rear: rotary diopter drum between protective ears
  g.add(P([[8, 21, 0], [56, 21, 0], [56, 24.5, 2], [51, 27.5, 2], [12, 27.5, 2], [8, 24.5, 2]], { w: 26, bevel: 1.2 }), 'steel_dark');
  for (const sd of [1, -1]) {
    g.add(P([[15, 26, 1], [47, 26, 1], [47, 33, 3], [41, LOS + 3.5, 4], [21, LOS + 3.5, 4], [15, 33, 3]], { w: 3.4, cw: sd * 10.4, bevel: 0.8 }), 'steel_dark');
    g.add(head(20.5, 30, sd * 12.05, 1.5, sd, 0.6), 'steel');
    g.add(head(41.5, 30, sd * 12.05, 1.5, sd, 0.6), 'steel');
  }
  let drum = cylW(31, LOS, -7.6, 7.6, 9, { seg: 28, b: 0.6 });
  drum = cut(drum, [
    cyl(0, 60, 1.3, { t: LOS, w: 0, b: 0, seg: 12 }),                                              // in-use aperture
    xform(cyl(0, 60, 1.9, { t: LOS, w: 0, b: 0, seg: 14 }), { rot: [90, 0, 0], pivot: [31, LOS, 0] }), // large aperture (90°)
    xform(cyl(0, 60, 1.0, { t: LOS, w: 0, b: 0, seg: 12 }), { rot: [45, 0, 0], pivot: [31, LOS, 0] }), // fine aperture (45°)
    xform(cutters.box([31, LOS, 0], [28, 2.2, 3]), { rot: [-45, 0, 0], pivot: [31, LOS, 0] }),        // V-notch slot (135°)
  ]);
  g.add(drum, 'steel');
  // knurled rims on the drum
  for (const sd of [1, -1]) {
    g.add(cylW(31, LOS, sd > 0 ? 5.4 : -7.8, sd > 0 ? 7.8 : -5.4, 9.5, { seg: 28, b: 0.4 }), 'steel');
    for (let i = 0; i < 28; i++) g.add(xform(box([31, LOS + 9.5, sd * 6.6], [0.9, 0.7, 2.0], { r: 0 }), { rot: [(i / 28) * 360, 0, 0], pivot: [31, LOS, 0] }), 'steel');
  }
  g.add(cylW(31, LOS, -8.7, 8.7, 2.2, { seg: 12 }), 'steel_dark'); // drum axle
  g.add(head(31, LOS, 12.05, 2.4, 1, 1), 'steel_bright');          // windage / axle head
  // front: hooded post on a pedestal
  g.add(P([[388, 21, 0], [411, 21, 0], [411, 24, 2], [406, 29, 2], [393, 29, 2], [388, 24, 2]], { w: 15, bevel: 1 }), 'steel_dark');
  g.add(tube(393, 407, 10.2, 8.6, { t: LOS, seg: 28, b: 0.5 }), 'steel_dark');
  g.add(P([[396.5, 28, 0], [403.5, 28, 0], [401.6, 31, 0.6], [398.4, 31, 0.6]], { w: 4, bevel: 0.4 }), 'steel_dark');
  g.add(P([[399, 30, 0], [401, 30, 0], [400.8, LOS, 0.3], [399.2, LOS, 0.3]], { w: 1.8, bevel: 0.25 }), 'steel_dark');
  g.add(box([400, LOS - 0.5, 0], [1.2, 0.8, 1], { r: 0 }), 'tritium');

  // ============================================================================ barrel / muzzle
  g.add(lathe([[408, 0], [408, 13], [410, 14.2], [417, 14.2], [418.5, 12.6], [418.5, 0]], { seg: 28 }), 'steel_dark'); // front cap / nut
  for (let i = 0; i < 6; i++) g.add(xform(box([413.5, 14.2, 0], [5, 1.4, 3], { r: 0 }), { rot: [0, 0, i * 60] }), 'steel_dark'); // spanner flats
  g.add(tube(416, 437.5, 9.4, 5.75, { seg: 24 }), 'steel_dark');
  const prot = [[436, 5.75], [436, 10.2], [437, 11.1]];
  for (const s of [439.5, 442.5]) prot.push([s, 11.1], [s + 0.5, 10.4], [s + 1.3, 10.4], [s + 1.8, 11.1], [s + 2.4, 11.1]);
  prot.push([447, 11.1], [448, 10.2], [448, 6.8], [447.2, 5.75], [436, 5.75]);
  g.add(lathe(prot, { seg: 28 }), 'steel_dark');                      // knurled thread protector, crowned bore
  g.add(cyl(424, 425.5, 5.8, { seg: 16 }), 'steel_dark');             // bore floor (blocks see-through)
  g.add(tube(250, 262, 11.5, 6.2, { seg: 20 }), 'steel');             // chamber end, seen through the port with the bolt back

  // ============================================================================ trigger housing (lower)
  const housing = profile([
    [28, -26.6, 2], [196, -26.6, 1], [196, -37, 2], [110, -37, 5], [104, -62, 10],
    [80, -140, 6], [78, -147, 4], [34, -150, 6], [30, -141, 6], [41, -95, 40], [57, -50, 10], [38, -38, 6], [28, -33, 3],
  ], { w: LW, bevel: 3, bevelSeg: 3, curveSeg: 8 });
  g.add(housing, 'polymer');
  // big glove-friendly trigger guard, narrower than the grip
  g.add(P([[104, -34, 0], [195.6, -34, 0], [195.6, -61, 3], [190, -71, 6], [114, -71, 7], [98, -66, 5], [100, -46, 0]], {
    w: 15, bevel: 2, bevelSeg: 2, holes: [[[112, -36.5, 2], [189, -36.5, 2], [189, -63.5, 5], [117, -63.5, 8], [107, -52, 5]]],
  }), 'polymer');
  // grip stipple panels and front-strap ribs
  g.add(P([[60, -58, 6], [95, -70, 8], [82, -128, 6], [44, -134, 8], [48, -92, 30]], { w: LW + 0.9, bevel: 0.45, bevelSeg: 1, curveSeg: 6 }), 'polymer_grip');
  for (let i = 0; i < 6; i++) {
    const tt = -78 - i * 9.5, ss = 104 + (tt + 62) * 0.306;
    g.add(B([ss - 0.6, tt, 0], [2.8, 2.6, LW - 7], { r: 0.7, rot: [-17, 0, 0] }), 'polymer_grip');
  }
  g.add(P([[39, -138, 3], [76, -138, 3], [77, -147, 3], [40, -150, 4]], { w: LW + 1, bevel: 1 }), 'polymer'); // grip base cap
  g.add(B([58, -150.2, 0], [20, 1.6, 12], { r: 0.6 }), 'steel_dark');                                        // lanyard slot plate
  // housing pins
  g.add(pinHeads(38, -32, LW / 2, 2.3), 'steel_dark');
  g.add(pinHeads(170, -31.5, LW / 2, 2.3), 'steel_dark');
  // ambidextrous mag release paddle at the rear of the magwell (inside the guard)
  g.add(P([[183, -36, 1], [190, -36, 1], [190, -58, 2], [185.5, -59, 2.5], [181.5, -48, 3]], { w: 12, bevel: 0.8 }), 'polymer');
  for (let i = 0; i < 4; i++) g.add(box([182 + i * 0.35, -42 - i * 4.2, 0], [1, 1.6, 10], { r: 0 }), 'polymer');

  // selector levers (both sides) + pictograms
  const sel = g.part('selector', { pivot: [60, -33, 0], extras: { axis: 'w', positions: [0, 45, 90] } });
  for (const sd of [1, -1]) {
    const face = sd * (LW / 2);
    const hubPts = sd > 0 ? [[0, 0], [0, 6], [1.6, 5.6], [2.2, 4.4], [2.2, 0]] : [[-2.2, 0], [-2.2, 4.4], [-1.6, 5.6], [0, 6], [0, 0]];
    sel.add(latheW(hubPts, 60, -33, { seg: 20 }).translate(face, 0, 0), 'steel_dark');
    sel.add(P([[60, -36, 3], [84, -39, 3], [86, -33.5, 3], [60, -30, 3]], { w: 2.4, cw: face + sd * 2.2, bevel: 0.6 }), 'steel_dark');
    sel.add(B([84.5, -36.3, face + sd * 3.1], [3, 6, 1.2], { r: 0.4, rot: [-8, 0, 0] }), 'steel_dark');
    // pictograms at the lever positions: safe (white), semi (one red), auto (two red)
    g.add(cylW(91, -29, face - sd * 0.4, face + sd * 0.35, 1.3, { seg: 10, b: 0.2 }), 'paint_white');
    g.add(cylW(92.5, -35.5, face - sd * 0.4, face + sd * 0.35, 1.3, { seg: 10, b: 0.2 }), 'paint_red');
    g.add(cylW(90, -42, face - sd * 0.4, face + sd * 0.35, 1.1, { seg: 10, b: 0.2 }), 'paint_red');
    g.add(cylW(93.4, -43, face - sd * 0.4, face + sd * 0.35, 1.1, { seg: 10, b: 0.2 }), 'paint_red');
  }

  // ============================================================================ trigger
  const trig = g.part('trigger', { pivot: [128, -33, 0] });
  trig.add(profile('M 123 -35 L 131 -35 Q 129 -46 134.5 -57 Q 132.5 -60.5 129 -58.5 Q 122 -48 123 -35 Z', { w: 7, bevel: 1, curveSeg: 10 }), 'steel_dark');
  for (let i = 0; i < 4; i++) trig.add(box([130.8 + i * 0.75, -44 - i * 3.6, 0], [0.7, 1.2, 6.2], { r: 0, rot: [-24, 0, 0] }), 'steel_dark');

  // ============================================================================ bolt + charging handle
  const bolt = g.part('bolt', { pivot: [200, 2, 0], extras: { travel: 0.08 } });
  bolt.add(B([194.5, 1.5, 0], [110, 21, 31], { r: 2 }), 'steel');
  bolt.add(B([240, 5, 15.6], [16, 3.6, 1.4], { r: 0.5 }), 'steel_dark');                // extractor
  bolt.add(head(233, 5, 16.1, 1.1, 1, 0.5, 10), 'steel_bright');
  bolt.add(B([214, -4.5, 15.6], [44, 2.2, 0.8], { r: 0.3 }), 'steel_dark');             // machined flats
  bolt.add(B([208, 8.5, 15.6], [32, 1.4, 0.6], { r: 0.2 }), 'steel_dark');
  bolt.add(B([200, 2, 15.6], [10, 4.5, 0.6], { r: 0.2 }), 'steel_dark');
  // cocking handle: stem in the slot, forward-swept arm, vertical knurled knob
  bolt.add(B([346, 8.3, -19.5], [12, 5.6, 12], { r: 1 }), 'steel_dark');
  bolt.add(plan([[339.5, -24, 2], [352.5, -24, 2], [360, -34, 2.5], [356, -39, 2], [347, -36, 2]], { h: 6.5, ct: 8.3, bevel: 1, curveSeg: 4 }), 'steel_dark');
  const kp = [[0, 0], [0, 5.2], [1.4, 6.2]];
  for (let i = 0; i < 5; i++) { const a = 3.4 + i * 2.6; kp.push([a - 0.7, 6.2], [a, 5.5], [a + 0.7, 6.2]); }
  kp.push([15.6, 6.2], [17, 5.2], [17, 0]);
  bolt.add(xform(lathe(kp, { seg: 20 }), { rot: [90, 0, 0], move: [356, 0, -39] }), 'polymer_grip');
  bolt.add(headT(356, 17, -39, 3.2, 0.8), 'steel_dark');

  // ============================================================================ magazine (25 rd straight .45)
  const mag = g.part('mag', { pivot: [229, -16, 0], extras: { drop: true } });
  mag.add(P([[209.8, -16, 1.5], [248.8, -16, 1.5], [248.8, -207, 2], [209.8, -207, 2]], { w: 26, bevel: 2.2, bevelSeg: 3 }), 'polymer');
  // side ribs + rear spine with the catch notch
  for (const sd of [1, -1]) for (const s of [219, 239]) mag.add(B([s, -138, sd * 13.1], [3.2, 128, 1.4], { r: 0.6 }), 'polymer');
  for (const sd of [1, -1]) for (let i = 0; i < 4; i++) mag.add(B([229, -186 - i * 4.5, sd * 13.1], [34, 2, 1.2], { r: 0.5 }), 'polymer');
  mag.add(B([208.7, -110, 0], [2.4, 180, 14], { r: 0.8 }), 'polymer');
  mag.add(box([207.2, -40, 0], [1.8, 6, 10], { r: 0 }), 'steel_dark'); // catch plate
  // floor plate
  mag.add(P([[205, -206, 2], [253, -206, 2], [254.5, -213, 3], [203.5, -213, 3]], { w: 30, bevel: 1.6 }), 'polymer');
  mag.add(cylT(229, 0, -214, -211, 3.2, { seg: 12 }), 'steel_dark');
  // feed lips + top cartridge (round-nose .45)
  for (const sd of [1, -1]) mag.add(P([[212, -17, 1], [242, -17, 1], [242, -11, 2], [212, -11, 2]], { w: 2.4, cw: sd * 9.8, bevel: 0.6 }), 'steel_dark');
  mag.add(cyl(213.5, 236.5, 5.9, { t: -12.5, w: 2.6, seg: 16 }), 'brass');
  mag.add(lathe([[236, 0], [236, 5.7], [239.5, 5.7], [243, 4.6], [245.5, 2.6], [246.4, 0]], { t: -12.5, w: 2.6, seg: 16 }), 'copper');
  mag.add(cyl(214, 233, 5.9, { t: -20.5, w: -2.6, seg: 14 }), 'brass');
  // witness numbers on the right of the body
  for (const [n, t] of [['5', -172], ['15', -140], ['25', -108]]) mag.add(text(n, { s0: 211.5, t0: t, h: 3.4, side: 1, w0: 13, stroke: 0.5, depth: 0.4 }), 'polymer');

  // ============================================================================ side-folding skeleton stock
  let stock = profile([
    [-2, 17, 2], [-206, 14.5, 6], [-212, 18.5, 3], [-226, 18.5, 3], [-226, -104, 4], [-206, -104, 6], [-194, -94, 8], [-24, -30, 6], [-2, -30, 2],
  ], { w: 26, bevel: 3.2, bevelSeg: 3, curveSeg: 6, holes: [[[-34, 3.5, 5], [-202, 2.5, 8], [-202, -80, 9], [-46, -24.5, 7]]] });
  // I-beam fluting along both struts (both faces)
  const flutes = [];
  for (const sd of [1, -1]) {
    flutes.push(cutters.pocketW([[-44, 7, 2], [-190, 6, 2], [-190, 11, 2], [-44, 12, 2]], sd * 12, 6));
    flutes.push(cutters.pocketW([[-62, -39.4, 2], [-178, -82.2, 2], [-180, -77.4, 2], [-62, -34.4, 2]], sd * 12, 6));
  }
  stock = cut(stock, flutes);
  g.add(stock, 'polymer');
  g.add(P([[-205, 18.8, 3], [-226, 18.8, 3], [-226, -104.3, 3], [-205, -104.3, 3]], { w: 34, bevel: 3.4, bevelSeg: 3 }), 'polymer'); // butt block
  // rubber butt pad: serrated rear face built into the side outline (ribs run across the full width)
  const pad = [[-227, 19.5, 2], [-227, -105.5, 2], [-239, -103, 5]];
  for (let t = -94; t <= 8; t += 6.8) pad.push([-240.6, t, 0.8], [-240.6, t + 3.4, 0.8], [-238.8, t + 3.9, 0.5], [-238.8, t + 6.3, 0.5]);
  pad.push([-240.2, 13, 2], [-239, 17.5, 4]);
  g.add(profile(pad, { w: 36, bevel: 3, bevelSeg: 2, curveSeg: 1 }), 'rubber');
  // stock head / hinge block and the cheek strut cap
  g.add(P([[-24, 18, 3], [-1, 18, 2], [-1, -31, 2], [-24, -31, 4]], { w: 32, bevel: 2.2 }), 'polymer');
  g.add(P([[-30, 17.5, 3], [-190, 15.2, 3], [-190, 12, 2], [-30, 14, 2]], { w: 27.4, bevel: 1 }), 'polymer_grip'); // cheek pad
  // hinge (right side): receiver knuckles top/bottom, stock knuckle in the middle
  g.add(cylT(-0.5, 17.5, 7.5, 16, 5.6, { seg: 18 }), 'steel_dark');
  g.add(cylT(-0.5, 17.5, -26, -15.5, 5.6, { seg: 18 }), 'steel_dark');
  g.add(cylT(-0.5, 17.5, -14.8, 6.8, 5.6, { seg: 18 }), 'polymer');
  g.add(cylT(-0.5, 17.5, -27, 17.4, 2, { seg: 10 }), 'steel');
  g.add(headT(-0.5, 16, 17.5, 3.6, 1.6), 'steel');
  // fold latch button (left side of the stock head)
  g.add(cylW(-12, -6, -17.6, -15, 5, { seg: 18, b: 0.6 }), 'steel_dark');
  g.add(cylW(-12, -6, -18.6, -16.5, 3.6, { seg: 16, b: 0.5 }), 'polymer_grip');
  // stock sling slot
  g.add(B([-216, -96, 0], [6, 4, 36], { r: 1 }), 'steel_dark');

  // ============================================================================ sockets / meta
  g.socket('muzzle', [448, 0, 0]);
  g.socket('eject', [222, 1, RW], { dir: [0.1, 0.45, 1] });
  g.socket('grip_r', [71, -88, 0], { rot: [0, 0, -17] });
  g.socket('grip_l', [336, -42, 0]);
  g.socket('magwell', [229, -84, 0]);
  g.socket('charge', [356, 8.5, -39]);
  g.socket('sight_rear', [31, LOS, 0]);
  g.socket('sight_front', [400, LOS, 0]);
  g.meta({ grip: 'rifle', support: 'handguard', reload: 'mag', chargeSide: 'left',
    notes: 'Cocking handle on the left, front (HK style); bolt part = handle + visible bolt (travel 80 mm). Stock folds to the right on a vertical hinge at s=-0.5 mm, w=+17.5 mm (kept static in body). Selector part rotates about w.' });
  return g;
}
