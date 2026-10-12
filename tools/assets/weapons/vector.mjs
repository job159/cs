// 毒刺 Stinger-45: angled "Super V" .45 SMG (KRISS Vector Gen II pattern). Side view, mm:
//   s forward from the rear face of the receiver, t up from the bore axis, w right (ejection side).
// Real reference: OAL 620 mm (stock extended), 406 mm folded, barrel 140 mm, ~178 mm tall (13-rd mag),
// 25-round Glock-21-pattern magazine. Proportions measured from Gen II side photos:
//   - bore sits low (in line with the top of the grip), rail top 47 mm above it, stock tube above the bore (t 26)
//   - grip at the very rear (~20° rake), thin trigger-guard bar, enclosed frame closed by a bottom bar
//   - "V" slab whose rear edge (~20°) and ribbed magwell front (~31°) both rake back; magazine raked ~17.5°
// Layout (s): buttpad -214 | hinge -12..0 | grip 28-101 | trigger 108 | slab 106-284 | port 221-266 |
//             breech 262 | receiver front 365 | thread cap 386-406.
import {
  Gun, profile, plan, section, lathe, cyl, tube, box, screw, sweep, cut, intersect, cutters, merge, xform, mirrorW,
} from '../lib/gunkit.mjs';

// ------------------------------------------------------------------------------------------ local helpers

/** Lathe whose axis runs along t (vertical), centred at [s, w]; pts = [[t, r], ...] with t increasing. */
function vlathe(pts, s, w = 0, opts = {}) {
  return xform(lathe(pts, opts), { rot: [90, 0, 0], move: [s, 0, w] });
}
/** Lathe whose axis runs along w, centred at [s, t]; pts = [[w, r], ...] with w increasing (faces +w). */
function wlathe(pts, s, t, opts = {}) {
  return xform(lathe(pts, opts), { rot: [0, -90, 0], move: [s, t, 0] });
}
/** Right-side geometry or its mirror for the left (sg = +1 / -1). */
const side = (geo, sg) => (sg > 0 ? geo : mirrorW(geo));
/** Push-pin / cross-pin head on the side face at |w| = wf. */
function pinHead(s, t, wf, sg, r = 3, h = 1.1) {
  return side(wlathe([[wf - 0.6, 0], [wf - 0.6, r], [wf + h * 0.55, r], [wf + h, r * 0.72], [wf + h, 0]], s, t, { seg: 14 }), sg);
}
/** Flush pin with a hex socket look: ring + recessed centre (both sides). */
function hexPin(s, t, wf, sg, r = 3.6) {
  return side(merge([
    wlathe([[wf - 0.6, 0], [wf - 0.6, r], [wf + 0.5, r], [wf + 0.8, r - 0.4], [wf + 0.8, r * 0.55], [wf + 0.2, r * 0.5], [wf + 0.2, 0]], s, t, { seg: 14 }),
  ]), sg);
}
/** Low-poly pocket cutter: side-view outline, from |w| = |w0| outward (sign of w0 picks the side). */
function pocketW(pts, w0, depth = 10, curveSeg = 4) {
  return profile(pts, { w: depth, cw: w0 + Math.sign(w0 || 1) * depth / 2, bevel: 0, curveSeg });
}
/** Low-poly rounded slot cutter through w (centre cw, thickness depth). */
function slotW(s0, s1, t, h, depth = 200, cw = 0, curveSeg = 4) {
  return profile([[s0, t - h / 2, h / 2], [s1, t - h / 2, h / 2], [s1, t + h / 2, h / 2], [s0, t + h / 2, h / 2]], { w: depth, cw, bevel: 0, curveSeg });
}
/** Gear / knurl outline (n teeth) as [x, y] pairs around a centre. */
function gear(cx, cy, r0, r1, n, rot = 0) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n, r = i % 2 ? r0 : r1;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}
/** Knurled knob facing +w (sg=1) or -w: a gear outline in (s, t) extruded across w from w0 to w0+h. */
function knob(s, t, w0, h, r, sg, n = 14) {
  return side(profile(gear(s, t, r * 0.88, r, n), { w: h, cw: w0 + h / 2, bevel: 0.35, bevelSeg: 1 }), sg);
}
/** Light Picatinny rail (dovetail section + cross-slotted teeth on a 10 mm pitch). dir: 'up' | 'down'. */
function picRail(s0, s1, { t = 0, w = 0, dir = 'up' } = {}) {
  const parts = [section([[-7.6, 0], [7.6, 0], [7.6, 0.8], [10.6, 3.3], [10.6, 3.6], [-10.6, 3.6], [-10.6, 3.3], [-7.6, 0.8]], s0, s1, { bevel: 0.35, bevelSeg: 1 })];
  const n = Math.floor((s1 - s0 - 2) / 10);
  const off = s0 + (s1 - s0 - n * 10) / 2 + 2.6;
  for (let i = 0; i < n; i++) {
    const a = off + i * 10;
    parts.push(section([[-10.6, 3.2], [10.6, 3.2], [10.6, 5.2], [9.6, 6.2], [-9.6, 6.2], [-10.6, 5.2]], a, a + 4.8, { bevel: 0.3, bevelSeg: 1 }));
  }
  const geo = merge(parts);
  if (dir === 'down') geo.rotateZ(Math.PI);
  geo.translate(w, t, 0);
  return geo;
}
/**
 * 45° chamfer cutters (both sides) for the edges where the side faces (|w| = W) meet the face running a -> b
 * in side view. leg = chamfer width on each face; the cutter overshoots by `leg` so neighbours mitre.
 */
function edgeCut(a, b, W, leg) {
  const ds = b[0] - a[0], dt = b[1] - a[1], L = Math.hypot(ds, dt);
  const ang = (Math.atan2(dt, ds) * 180) / Math.PI;
  const c = leg * Math.SQRT2;
  return [W, -W].map((w) => box([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, w], [L + 2 * leg, c, c], { r: 0, rot: [ang, 0, 45] }));
}
/** Rounded slot outline (stadium) from [s0,t0] to [s1,t1] with half-width h, as profile points. */
function stadium([s0, t0], [s1, t1], h) {
  const ds = s1 - s0, dt = t1 - t0, L = Math.hypot(ds, dt), nx = -dt / L * h, ny = ds / L * h;
  return [[s0 + nx, t0 + ny, h * 0.98], [s1 + nx, t1 + ny, h * 0.98], [s1 - nx, t1 - ny, h * 0.98], [s0 - nx, t0 - ny, h * 0.98]];
}

// Tiny stroke font for raised markings (grid 4 x 6).
const GLYPHS = {
  S: [[4, 6, 1, 6], [1, 6, 0, 5], [0, 5, 0, 4], [0, 4, 1, 3], [1, 3, 3, 3], [3, 3, 4, 2], [4, 2, 4, 1], [4, 1, 3, 0], [3, 0, 0, 0]],
  T: [[0, 6, 4, 6], [2, 6, 2, 0]],
  I: [[2, 6, 2, 0], [1, 6, 3, 6], [1, 0, 3, 0]],
  N: [[0, 0, 0, 6], [0, 6, 4, 0], [4, 0, 4, 6]],
  G: [[4, 6, 0, 6], [0, 6, 0, 0], [0, 0, 4, 0], [4, 0, 4, 3], [4, 3, 2, 3]],
  E: [[4, 6, 0, 6], [0, 6, 0, 0], [0, 0, 4, 0], [0, 3, 3, 3]],
  R: [[0, 0, 0, 6], [0, 6, 4, 6], [4, 6, 4, 3], [4, 3, 0, 3], [1.5, 3, 4, 0]],
  C: [[4, 6, 0, 6], [0, 6, 0, 0], [0, 0, 4, 0]],
  A: [[0, 0, 0, 4], [0, 4, 2, 6], [2, 6, 4, 4], [4, 4, 4, 0], [0, 2.6, 4, 2.6]],
  L: [[0, 6, 0, 0], [0, 0, 4, 0]],
  U: [[0, 6, 0, 0], [0, 0, 4, 0], [4, 0, 4, 6]],
  O: [[0, 0, 0, 6], [0, 6, 4, 6], [4, 6, 4, 0], [4, 0, 0, 0]],
  F: [[0, 0, 0, 6], [0, 6, 4, 6], [0, 3, 3, 3]],
  M: [[0, 0, 0, 6], [0, 6, 2, 3], [2, 3, 4, 6], [4, 6, 4, 0]],
  '-': [[1, 3, 3, 3]],
  '.': [[1.7, 0, 2.3, 0]],
  '0': [[0, 0, 0, 6], [0, 6, 4, 6], [4, 6, 4, 0], [4, 0, 0, 0], [0, 0, 4, 6]],
  '2': [[0, 6, 4, 6], [4, 6, 4, 3], [4, 3, 0, 3], [0, 3, 0, 0], [0, 0, 4, 0]],
  '4': [[0, 6, 0, 3], [0, 3, 4, 3], [3, 6, 3, 0]],
  '5': [[4, 6, 0, 6], [0, 6, 0, 3], [0, 3, 4, 3], [4, 3, 4, 0], [4, 0, 0, 0]],
  '7': [[0, 6, 4, 6], [4, 6, 1.5, 0]],
};
/**
 * Raised lettering on a side face. s,t = start of the baseline; face = +1 (right side, reads towards +s) or
 * -1 (left side, reads towards -s); w0 = |w| of the surface; h = cap height; raise = relief above the surface.
 */
function stamp(str, { s, t, w0, face = 1, h = 4, raise = 0.3 }) {
  const u = h / 6, sw = Math.max(0.35, u * 0.85);
  const parts = [];
  let x = 0;
  for (const ch of str) {
    const strokes = GLYPHS[ch];
    if (strokes) for (const [x0, y0, x1, y1] of strokes) {
      const a = [s + face * (x + x0) * u, t + y0 * u], b = [s + face * (x + x1) * u, t + y1 * u];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
      parts.push(box([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, face * (w0 + raise / 2 - 0.1)], [len + sw, sw, raise + 0.2], { r: 0, rot: [ang, 0, 0] }));
    }
    x += ch === '.' ? 3.2 : ch === ' ' ? 3.4 : 5.4;
  }
  return merge(parts);
}

// ------------------------------------------------------------------------------------------ model

export default function build() {
  const g = new Gun('vector');

  const UW = 18.5;     // upper receiver half width (aluminium)
  const LW = 19.5;     // lower frame half width (polymer), 1 mm proud of the upper -> visible seam step
  const TOP = 41;      // top of the receiver / rail base
  const SIGHT_T = 77;  // iron-sight line (aperture centre / post tip)
  const MAG_RAKE = 17.5;
  const rk = (MAG_RAKE * Math.PI) / 180;
  /** point on the magazine axis, d mm below the top of the magazine */
  const magAx = (d) => [239 - d * Math.sin(rk), -8 - d * Math.cos(rk)];

  // =========================================================================== upper receiver (black anodised aluminium)
  // A rail-topped strip over the whole length that drops into a full-height bolt housing in front of the
  // diagonal seam (ejection port right, charging-handle slot left).
  {
    const sideP = profile([[0, 32, 1], [168, 32, 8], [214, 1, 8], [365, 1, 1], [365, 37.5, 1.5], [361.5, TOP, 1], [3, TOP, 1], [0, 38, 1]], { w: UW * 2, bevel: 1.1 });
    const xs = section([[-UW, -2, 0], [UW, -2, 0], [UW, 37, 1.2], [13.4, TOP, 1], [-13.4, TOP, 1], [-UW, 37, 1.2]], -5, 370, { bevel: 0 });
    let upper = intersect(sideP, xs);
    upper = cut(upper, [
      // ejection port (right) with a stepped lip
      pocketW([[221, 6, 2], [266, 6, 2], [266, 36, 2], [221, 36, 2]], 3, 30),
      pocketW([[219.6, 4.6, 2.6], [267.4, 4.6, 2.6], [267.4, 37.4, 2.6], [219.6, 37.4, 2.6]], UW - 0.8, 10),
      // charging-handle slot (left) with a stepped lip
      pocketW([[246, 11, 4.5], [353, 11, 4.5], [353, 20, 4.5], [246, 20, 4.5]], -8, 30),
      pocketW([[244.6, 9.6, 5], [354.4, 9.6, 5], [354.4, 21.4, 5], [244.6, 21.4, 5]], -UW + 0.7, 10),
      // marking panel on the right of the bolt housing
      pocketW([[276, 21, 2], [352, 21, 2], [352, 33, 2], [276, 33, 2]], UW - 0.6, 10),
      // seam of the front end cap (sides) and the accent groove along the rail strip
      cutters.box([357, 18, UW], [0.9, 40, 1.6]),
      cutters.box([357, 18, -UW], [0.9, 40, 1.6]),
      slotW(8, 160, 36.2, 1.3, 4, UW + 1.3),
      slotW(8, 160, 36.2, 1.3, 4, -UW - 1.3),
      slotW(272, 352, 36.2, 1.3, 4, -UW - 1.3),
    ]);
    g.add(upper, 'alu');
    g.add(picRail(3, 362, { t: TOP }), 'alu');
    g.add(stamp('STINGER-45', { s: 280, t: 24.6, w0: UW - 0.6, face: 1, h: 5 }), 'alu');
    // screws on the bolt housing and the front end cap
    for (const sg of [1, -1]) {
      for (const [s, t] of [[361, 28], [361, 8], [297, 15]]) {
        if (sg < 0 && t === 15) continue; // left side: charging-handle slot runs there
        g.add(side(screw([s, t, UW - 0.25], 2.3, { face: 'w', depth: 0.9 }), sg), 'steel_dark');
      }
    }
    g.add(side(screw([300, 27.5, UW - 0.25], 2.6, { face: 'w', depth: 1 }), -1), 'steel_dark');
  }

  // =========================================================================== barrel stub, nut, threaded muzzle cap
  {
    const hex = [];
    for (let i = 0; i < 6; i++) { const a = ((i * 60 + 30) * Math.PI) / 180; hex.push([Math.cos(a) * 13.5, Math.sin(a) * 13.5, 1.1]); }
    g.add(section(hex, 364, 373, { bevel: 0.7, curveSeg: 3 }), 'steel');
    g.add(lathe([[372, 0], [372, 10.2], [374, 9.8], [376, 9], [376, 0]], { seg: 28 }), 'steel');
    g.add(tube(262, 398, 9.2, 5.75, { seg: 28 }), 'steel_dark');                          // barrel, real .45 bore
    g.add(cyl(380, 386.5, 7.8, { seg: 24 }), 'steel_dark');                               // thread shoulder
    let cap = section(gear(0, 0, 10.6, 11.5, 18), 386, 406, { bevel: 0 });
    cap = intersect(cap, lathe([[385, 0], [385, 9.8], [387, 11.9], [404.6, 11.9], [406.6, 9.6], [406.6, 0]], { seg: 36 }));
    cap = cut(cap, [cutters.holeS(0, 0, 6.5, 370, 420), cyl(370, 397.6, 8, { b: 0, seg: 24 })]);
    g.add(cap, 'steel_blued');
    g.add(tube(386, 390, 11.6, 8, { seg: 40, b: 0.5 }), 'steel_blued');                  // plain band
  }

  // =========================================================================== lower frame (polymer): the "Super V" chassis
  {
    const F = {
      rearTop: [1, 32.5], seamA: [168, 32.5], seamB: [214, 1.5], noseTop: [364, 1.5], noseBot: [364, -23], mwTop: [284, -23],
      mwBot: [231, -113], slabRear: [106, -111], slabTop: [146, 10], trigTop: [101, 10], gripFront: [100, 3], gripBack: [46, 3],
      beaver: [18, 10], rearBot: [1, 12],
    };
    let frame = profile([
      [...F.rearTop, 1], [...F.seamA, 8], [...F.seamB, 8], [...F.noseTop, 1], [...F.noseBot, 1.5], [...F.mwTop, 5], [...F.mwBot, 4],
      [...F.slabRear, 5], [...F.slabTop, 5], [...F.trigTop, 2], [...F.gripFront, 1], [...F.gripBack, 4], [...F.beaver, 6], [...F.rearBot, 1],
    ], { w: LW * 2, bevel: 1.4, bevelSeg: 2, curveSeg: 6 });

    // magwell front serrations (grooves across the raked face)
    const mwDir = [F.mwBot[0] - F.mwTop[0], F.mwBot[1] - F.mwTop[1]];
    const mwLen = Math.hypot(...mwDir);
    const mwAng = (Math.atan2(-mwDir[1], -mwDir[0]) * 180) / Math.PI - 90; // box t-axis along the edge
    const ribs = [];
    for (let k = 0; k < 12; k++) {
      const f = (14 + k * 6.2) / mwLen;
      ribs.push(box([F.mwTop[0] + mwDir[0] * f, F.mwTop[1] + mwDir[1] * f, 0], [3.2, 2.4, LW * 2 - 7], { r: 0, rot: [mwAng, 0, 0] }));
    }
    const oblongA = stadium([150, -22], [138, -54], 4.2);
    const oblongB = stadium([238, -34], [214, -84], 5);
    frame = cut(frame, [
      // 45° chamfers along the slab, magwell and nose edges (the angular moulded look)
      ...edgeCut(F.mwTop, F.mwBot, LW, 4.5),
      ...edgeCut(F.mwBot, F.slabRear, LW, 3),
      ...edgeCut(F.slabRear, F.slabTop, LW, 2.6),
      ...edgeCut(F.noseBot, F.mwTop, LW, 2.6),
      ...ribs,
      // magazine well: raked pocket + stepped mouth
      box([...magAx(80), 0], [37.5, 110, 28], { r: 0, rot: [-MAG_RAKE, 0, 0] }),
      box([...magAx(112), 0], [41.5, 8, 32], { r: 0, rot: [-MAG_RAKE, 0, 0] }),
      // raked oblong recesses + emblem recess, both sides
      ...[1, -1].flatMap((sg) => [
        pocketW(oblongA, sg * (LW - 1.2), 10),
        pocketW(oblongB, sg * (LW - 1.2), 10),
      ]),
      // trigger slot
      cutters.box([109, 10, 0], [10, 8, 8]),
      // selector detent recess (both sides)
      ...[1, -1].map((sg) => pocketW([[73, 15, 6], [104, 15, 6], [104, 31.5, 5], [73, 31.5, 5]], sg * (LW - 0.5), 10)),
      // rear sling slot through the beavertail
      slotW(10, 24, 18, 5.5, 60),
    ]);
    g.add(frame, 'polymer');

    // grip: ~20° rake, stippled panels, finger ribs on the front strap
    const gripPts = [[44, 5, 0], [101, 5, 0], [100, 2, 2], [67, -84, 5], [61, -89, 4], [31, -84, 5], [28, -76, 6], [35, -38, 40], [46, -6, 8]];
    g.add(profile(gripPts, { w: 31, bevel: 3.2, bevelSeg: 3, curveSeg: 8 }), 'polymer');
    g.add(profile([[48, -10, 4], [90, -10, 3], [71, -72, 4], [38, -74, 5], [37, -40, 18]], { w: 32.2, bevel: 0.7, bevelSeg: 1 }), 'polymer_grip');
    for (let i = 0; i < 8; i++) {
      const tt = -22 - i * 7;
      const sf = 100 + ((tt - 2) * 33) / 86;
      g.add(box([sf - 0.6, tt, 0], [3.6, 2.4, 24], { r: 0.5, seg: 1, rot: [-21, 0, 0] }), 'polymer');
    }
    g.add(profile([[33, -82, 2], [63, -87, 2], [62, -92, 2], [35, -88, 2]], { w: 27, bevel: 1, curveSeg: 3 }), 'polymer'); // base cap

    // trigger-guard bar (thin) and the bottom bar that closes the frame
    g.add(profile([[92, -13, 1], [142, -17, 1], [141, -23, 2], [90, -19.5, 2]], { w: 13, bevel: 1.6, curveSeg: 3 }), 'polymer');
    g.add(profile([[56, -78, 3], [116, -100, 2], [118, -110, 3], [100, -111.5, 4], [63, -97, 6], [52, -88, 3]], { w: 23, bevel: 2, curveSeg: 4 }), 'polymer');

    // stippled grip panel on the slab (support hand / mag change area)
    g.add(profile(stadium([238, -34], [214, -84], 3.6), { w: (LW - 0.7) * 2, bevel: 0.5, bevelSeg: 1, curveSeg: 6 }), 'polymer_grip');

    // bottom accessory rail under the nose
    g.add(picRail(292, 362, { t: -23, dir: 'down' }), 'polymer');

    // pins: takedown pins on the nose + slab, hex pins near the guard
    for (const sg of [1, -1]) {
      for (const [s, t] of [[297, -7], [348, -7], [171, -104], [218, -30]]) g.add(pinHead(s, t, LW, sg, 3.4, 1.0), 'steel');
      for (const [s, t] of [[112, -103], [189, -91], [277, -13]]) g.add(hexPin(s, t, LW, sg, 3.2), 'steel_dark');
      // selector markings (white = safe, red = fire)
      g.add(side(wlathe([[LW - 0.8, 0], [LW - 0.8, 1.2], [LW - 0.2, 1.2], [LW - 0.2, 0]], 78, 28, { seg: 10 }), sg), 'paint_white');
      g.add(side(wlathe([[LW - 0.8, 0], [LW - 0.8, 1.2], [LW - 0.2, 1.2], [LW - 0.2, 0]], 100, 18, { seg: 10 }), sg), 'paint_red');
      // ambidextrous magazine release paddle (behind the well, under the slab)
    }
    g.add(profile([[172, -110, 1], [186, -110, 1], [188, -116, 1.5], [171, -116, 1.5]], { w: 24, bevel: 0.8, curveSeg: 3 }), 'steel_dark');
    // bolt release lever (left side, above the magwell)
    g.add(profile([[196, -2, 1.5], [236, -4, 2], [238, -10, 2], [200, -9, 2]], { w: 2.2, cw: -LW - 0.8, bevel: 0.5, curveSeg: 3 }), 'steel_dark');
    for (let i = 0; i < 4; i++) g.add(box([226 + i * 2.6, -6.6, -LW - 2.05], [1, 4.6, 0.7], { r: 0 }), 'steel_dark');
    // markings (original, no brand logos): stinger emblem + calibre on the slab, maker block above the grip
    g.add(stamp('.45 AUTO', { s: 158, t: -82, w0: LW, face: 1, h: 3.4 }), 'polymer');
    g.add(stamp('CF ARMS', { s: 108, t: 24, w0: LW, face: 1, h: 2.6 }), 'polymer');
    g.add(stamp('SN CF-04572', { s: 108, t: 19, w0: LW, face: 1, h: 2.2 }), 'polymer');
    g.add(stamp('CF ARMS', { s: 200, t: -72, w0: LW, face: -1, h: 3.2 }), 'polymer');
    for (const sg of [1, -1]) {
      // badge: raised diamond frame with a curled stinger
      const ring = profile([[184, -36, 1], [200, -52, 1], [184, -68, 1], [168, -52, 1]], { w: (LW + 0.35) * 2, bevel: 0.3, bevelSeg: 1, curveSeg: 2, holes: [[[184, -39.5], [196.5, -52], [184, -64.5], [171.5, -52]]] });
      g.add(ring, 'polymer');
      g.add(side(sweep([[177, -44, LW], [175, -51, LW], [179, -59, LW], [187, -61, LW], [192, -55, LW], [189, -49, LW]], 0.9, { seg: 24, radial: 6 }), sg), 'polymer');
      g.add(side(profile([[188, -47.5], [193.5, -46], [190.6, -50.6]], { w: 1.4, cw: LW, bevel: 0.2, bevelSeg: 1 }), sg), 'polymer');
    }
    // sling points: QD cup on the left of the nose
    g.add(mirrorW(wlathe([[LW - 1, 0], [LW - 1, 6], [LW + 2.4, 6], [LW + 3, 5.2], [LW + 3, 3.2], [LW + 0.6, 3.2], [LW + 0.6, 0]], 322, -12, { seg: 22 })), 'steel');
  }

  // =========================================================================== stock: static hinge block + folding stock part
  const TUBE_T = 26;
  {
    g.add(profile([[-12, 10, 1.5], [1, 10, 0], [1, TOP, 0], [-9, TOP, 2], [-12, 37, 1.5]], { w: 34, bevel: 1.2 }), 'alu');
    for (const [t0, t1] of [[11, 18], [27, 34]]) g.add(vlathe([[t0, 0], [t0, 4.2], [t0 + 0.6, 4.8], [t1 - 0.6, 4.8], [t1, 4.2], [t1, 0]], -12, 17.2, { seg: 16 }), 'alu');
    g.add(vlathe([[34, 0], [34, 2.6], [35.6, 2.2], [36, 0]], -12, 17.2, { seg: 12 }), 'steel');
    g.add(mirrorW(wlathe([[16, 0], [16, 5.5], [18.6, 5.5], [19, 4.8], [19, 3], [17.5, 3], [17.5, 0]], -5, TUBE_T, { seg: 20 })), 'steel'); // QD cup
  }
  const stock = g.part('stock', { pivot: [-12, TUBE_T, 17.2], extras: { fold: 'right', axis: 't', foldDeg: 180, note: 'folds about the right-side hinge; static is fine' } });
  {
    stock.add(profile([[-22, 10, 1.5], [-12.6, 10, 0], [-12.6, TOP, 0], [-20, TOP, 2], [-22, 37, 1.5]], { w: 34, bevel: 1.2 }), 'alu');
    stock.add(vlathe([[18.6, 0], [18.6, 4.2], [19.2, 4.8], [25.8, 4.8], [26.4, 4.2], [26.4, 0]], -12, 17.2, { seg: 16 }), 'alu');
    stock.add(mirrorW(wlathe([[16.5, 0], [16.5, 4.4], [18.8, 4.4], [19.5, 3.6], [19.5, 0]], -17, 20, { seg: 16 })), 'steel_dark'); // fold latch
    let nut = lathe([[-29, 0], [-29, 15.8], [-28.4, 16.6], [-22.6, 16.6], [-22, 15.8], [-22, 0]], { t: TUBE_T, seg: 28 });
    nut = cut(nut, [0, 90, 180, 270].map((a) => xform(cutters.box([-28, TUBE_T + 16.6, 0], [5, 5, 4.2]), { rot: [0, 0, a + 45], pivot: [0, TUBE_T, 0] })));
    stock.add(nut, 'steel');
    stock.add(cyl(-200, -29, 14.6, { t: TUBE_T, seg: 28, b: 0.8 }), 'alu');
    stock.add(box([-110, TUBE_T - 15.3, 0], [150, 5, 7.5], { r: 1, seg: 1 }), 'alu');
    // stock body (angular collapsible type), skeletonised butt
    let sbody = profile([[-60, 44, 2], [-205, 44, 4], [-212, 40, 3], [-212, -76, 3], [-205, -80, 4], [-168, -80, 4], [-164, -34, 8], [-140, -14, 14], [-72, 6, 8], [-60, 8, 2]],
      { w: 36, bevel: 2.6, bevelSeg: 2, curveSeg: 6 });
    sbody = cut(sbody, [
      ...[1, -1].map((sg) => pocketW([[-201, 32, 4], [-176, 32, 4], [-174, -68, 4], [-201, -68, 4]], sg * 14.5, 10)),
      ...[1, -1].map((sg) => pocketW([[-160, 30, 4], [-74, 30, 4], [-80, 16, 4], [-150, 2, 6]], sg * 16.5, 10)),
      slotW(-196, -182, -70, 6, 60), // sling slot through the toe
    ]);
    stock.add(sbody, 'polymer');
    stock.add(side(wlathe([[14, 0], [14, 5.6], [16.6, 5.6], [17, 4.8], [17, 3], [15.4, 3], [15.4, 0]], -188, 18, { seg: 18 }), 1), 'steel');
    stock.add(profile([[-128, -8, 1.5], [-100, 0, 1.5], [-100, -5, 2], [-126, -14, 2]], { w: 14, bevel: 0.8, curveSeg: 3 }), 'polymer'); // adjust lever
    // rubber buttpad with ribs
    stock.add(profile([[-214, 45, 4], [-209, 45, 3], [-209, -81, 3], [-214, -81, 4]], { w: 38, bevel: 1.8, bevelSeg: 2, curveSeg: 4 }), 'rubber');
    for (let i = 0; i < 9; i++) stock.add(box([-214.2, 36 - i * 13.5, 0], [1.6, 3, 30], { r: 0.6, seg: 1 }), 'rubber');
  }

  // =========================================================================== flip-up iron sights (deployed), polymer bodies
  {
    const RT = TOP + 6.2; // rail top
    const clamp = (s0, s1) => section([[-12.5, TOP + 1.4, 0.6], [-10.2, TOP + 1.4, 0.4], [-10.2, TOP + 6.6, 0], [10.2, TOP + 6.6, 0], [10.2, TOP + 1.4, 0.4], [12.5, TOP + 1.4, 0.6], [12.5, RT + 5, 1.5], [-12.5, RT + 5, 1.5]], s0, s1, { bevel: 0.8, curveSeg: 3 });
    const leaf = (s0, s1, inner) => section([[-9, RT + 3, 0], [9, RT + 3, 0], [9, SIGHT_T + 3, 2], [6.8, SIGHT_T + 8, 1], [5.4, SIGHT_T + 8, 0.6], [5.4, inner, 2.5], [-5.4, inner, 2.5], [-5.4, SIGHT_T + 8, 0.6], [-6.8, SIGHT_T + 8, 1], [-9, SIGHT_T + 3, 2]], s0, s1, { bevel: 0.6, curveSeg: 4 });
    // rear sight (s 38-66), aperture at s 52
    g.add(clamp(38, 66), 'polymer');
    g.add(profile([[43, RT + 4, 1], [62, RT + 4, 1], [60, RT + 9, 2], [45, RT + 9, 2]], { w: 22, bevel: 0.8, curveSeg: 3 }), 'polymer');
    let rleaf = leaf(49, 55.4, SIGHT_T - 8);
    rleaf = cut(rleaf, [cutters.holeS(SIGHT_T - 17, 0, 3.2, 0, 100)]);
    g.add(rleaf, 'polymer');
    g.add(tube(49.6, 54.8, 5.2, 1.2, { t: SIGHT_T, seg: 24 }), 'steel_dark');               // aperture (real peep hole)
    g.add(cyl(-9.6, 9.6, 1.4, { seg: 10 }).rotateY(Math.PI / 2).translate(0, SIGHT_T - 5.6, -52.2), 'steel'); // aperture axle
    g.add(knob(52.2, SIGHT_T - 17, 9, 3.6, 4.2, 1, 12), 'steel');                          // windage drum (right)
    g.add(knob(48, RT + 1, 12.4, 3.2, 3.8, 1, 10), 'steel');                               // clamp knob
    g.add(cyl(-13.2, 13.2, 1.6, { seg: 12 }).rotateY(Math.PI / 2).translate(0, RT + 7, -52.2), 'steel'); // hinge pin
    // front sight (s 324-352), post at s 338
    g.add(clamp(324, 352), 'polymer');
    g.add(profile([[329, RT + 4, 1], [348, RT + 4, 1], [346, RT + 9, 2], [331, RT + 9, 2]], { w: 22, bevel: 0.8, curveSeg: 3 }), 'polymer');
    let fleaf = leaf(334, 342, RT + 13);
    fleaf = cut(fleaf, [cutters.holeW(338, RT + 9, 2.2)]);
    g.add(fleaf, 'polymer');
    g.add(plan(gear(338, 0, 3.7, 4.2, 10), { h: 5.6, ct: RT + 16, bevel: 0.35 }), 'steel');           // elevation drum
    g.add(profile([[336.8, RT + 18, 0.2], [339.2, RT + 18, 0.2], [338.9, SIGHT_T, 0.3], [337.1, SIGHT_T, 0.3]], { w: 2.3, bevel: 0.3 }), 'steel_dark'); // post
    g.add(knob(334, RT + 1, 12.4, 3.2, 3.8, 1, 10), 'steel');
    g.add(cyl(-13.2, 13.2, 1.6, { seg: 12 }).rotateY(Math.PI / 2).translate(0, RT + 7, -338), 'steel');
  }

  // =========================================================================== short vertical fore grip on the bottom rail
  {
    g.add(profile([[312, -22, 1], [350, -22, 1], [348, -38, 3], [314, -38, 3]], { w: 26, bevel: 1.5, curveSeg: 3 }), 'polymer');
    g.add(side(knob(331, -30, 13, 3, 4.4, 1, 12), -1), 'steel_dark');
    g.add(vlathe([[-100, 0], [-100, 14.2], [-98, 15.2], [-92, 15.2], [-86, 13.9], [-79, 15.1], [-72, 13.9], [-65, 15.1], [-58, 13.9], [-51, 15.0], [-44, 14.2], [-37, 0]], 331, 0, { seg: 24 }), 'polymer_grip');
    g.add(vlathe([[-107, 0], [-107, 12.8], [-106, 14.8], [-100.6, 15.6], [-99.5, 15], [-99.5, 0]], 331, 0, { seg: 24 }), 'rubber');
  }

  // =========================================================================== moving parts
  const trig = g.part('trigger', { pivot: [108, 13, 0] });
  trig.add(profile('M 104 14 L 112 14 Q 114.5 -1 112 -13 Q 107.5 -15.5 107 -12 Q 109 -1 104.5 8 Z', { w: 6.5, bevel: 0.8, curveSeg: 8 }), 'steel_dark');

  const sel = g.part('selector', { pivot: [88, 26, 0] });
  for (const sg of [1, -1]) {
    sel.add(side(wlathe([[LW - 0.8, 0], [LW - 0.8, 4.4], [LW + 1.8, 4.4], [LW + 2.4, 3.6], [LW + 2.4, 0]], 88, 26, { seg: 16 }), sg), 'steel_dark');
    sel.add(profile([[87, 23, 2], [104, 21, 2.5], [104, 26, 2.5], [87, 29, 2]], { w: 2.2, cw: sg * (LW + 2.2), bevel: 0.6, curveSeg: 3 }), 'steel_dark');
  }

  // bolt group: bolt seen in the port + charging handle (left, folding, deployed). Slides back by `travel`.
  const bolt = g.part('bolt', { pivot: [0, 0, 0], extras: { travel: 0.08 } });
  {
    let bf = box([241, 14, 3], [40, 17, 18], { r: 1.4, seg: 1 });
    bf = cut(bf, [cutters.box([238, 18, 12.4], [28, 2.6, 2]), cutters.box([238, 10, 12.4], [28, 2.6, 2])]);
    bolt.add(bf, 'steel_bright');
    bolt.add(box([257, 21.5, 12], [9, 2.4, 1.4], { r: 0.4, seg: 1 }), 'steel_dark');   // extractor
    bolt.add(cyl(259, 261.6, 5.4, { t: 2, w: 0, seg: 16 }), 'steel_bright');           // bolt face ring
    bolt.add(box([339, 15.5, -12.6], [24, 8.2, 8.6], { r: 1, seg: 1 }), 'steel_dark'); // handle carrier in the slot
    bolt.add(plan([[330, -16, 1], [350, -16, 1], [348, -29, 3], [333, -30, 4]], { h: 7.4, ct: 15.5, bevel: 1, curveSeg: 3 }), 'alu');
    bolt.add(box([340.5, 15.5, -30.2], [18, 9.8, 4.4], { r: 1.6, seg: 2 }), 'polymer_grip');
  }

  // magazine: 25-round double stack .45 (Glock-21 pattern + extension), raked 17.5° like the well.
  const MP = magAx(0);
  const mag = g.part('mag', { pivot: MP.concat(0), extras: { drop: true, dir: [-Math.sin(rk), -Math.cos(rk), 0], note: 'raked magazine: drop/insert along dir' } });
  {
    const parts = [];
    const S0 = 222, S1 = 256; // vertical authoring frame: mag axis at s 239, top at t -8
    let mbody = plan([[S0, -12.4, 3], [S1 + 0.5, -11.4, 6], [S1 + 0.5, 11.4, 6], [S0, 12.4, 3]], { h: 180, ct: -8 - 90, bevel: 1.2, curveSeg: 4 });
    mbody = cut(mbody, [-128, -140, -152, -164].map((t) => cutters.holeS(t, 0, 1.7, 200, S0 + 8))); // witness holes
    parts.push([mbody, 'polymer']);
    parts.push([plan([[S0 - 1.5, -13.6, 3], [S1 + 2, -12.6, 6.5], [S1 + 2, 12.6, 6.5], [S0 - 1.5, 13.6, 3]], { h: 40, ct: -190, bevel: 1.5, curveSeg: 4 }), 'polymer']);
    for (let i = 0; i < 4; i++) parts.push([box([239, -177 - i * 8, 0], [33, 3, 28.6], { r: 1.2, seg: 1 }), 'polymer']);
    parts.push([plan([[S0 - 3.5, -14.6, 3], [S1 + 5, -13.6, 7], [S1 + 5, 13.6, 7], [S0 - 3.5, 14.6, 3]], { h: 7, ct: -210, bevel: 2, curveSeg: 4 }), 'polymer']);
    for (const sg of [1, -1]) parts.push([profile([[S0 + 1, -10, 1], [S1 - 3, -10, 1], [S1 - 3, -4, 1.5], [S0 + 1, -4, 1.5]], { w: 3, cw: sg * 9.6, bevel: 0.6, curveSeg: 3 }), 'steel_dark']);
    parts.push([cyl(S0 + 1.5, S0 + 24, 5.9, { t: -3, w: 2.5, seg: 16, b: 0.5 }), 'brass']);
    parts.push([lathe([[S0 + 23.5, 0], [S0 + 23.5, 5.7], [S0 + 27, 5.6], [S0 + 30, 4.6], [S0 + 32.3, 2.6], [S0 + 33, 0]], { t: -3, w: 2.5, seg: 16 }), 'copper']);
    parts.push([cyl(S0 + 1.5, S0 + 20, 5.9, { t: -12, w: -3.5, seg: 12, b: 0.5 }), 'brass']);
    // rake the whole magazine about its seat
    for (const [geo, mat] of parts) mag.add(xform(geo, { rot: [-MAG_RAKE, 0, 0], pivot: [239, -8, 0] }), mat);
  }

  // =========================================================================== sockets & meta
  g.socket('muzzle', [406, 0, 0]);
  g.socket('eject', [244, 21, UW], { dir: [0.1, 0.4, 1] });
  g.socket('grip_r', [62, -40, 0], { rot: [0, 0, -20] });
  g.socket('grip_l', [331, -68, 0]);
  g.socket('magwell', [...magAx(128), 0]);
  g.socket('charge', [340.5, 15.5, -31]);
  g.socket('sight_rear', [52.2, SIGHT_T, 0]);
  g.socket('sight_front', [338, SIGHT_T, 0]);
  g.meta({
    grip: 'rifle', support: 'vertical', reload: 'mag', chargeSide: 'left',
    name: '毒刺 Stinger-45',
    notes: 'Bore sits low (top of the grip) with a tall 47 mm rail stack: sight line is 77 mm over the bore. Left folding charging handle and the bolt in the right port share `bolt` (travel 0.08 m). Magazine is raked 17.5° back: drop/insert along mag.extras.dir. `stock` pivots on the right hinge (folds 180° about t), static by default.',
  });
  return g;
}
