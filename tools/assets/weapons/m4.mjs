// 哨兵 Sentry-4 — M4A1 / HK416-pattern 5.56 mm carbine: free-float M-LOK rail, tube red dot on a riser,
// folding BUIS, CTR-style collapsible stock (shown fully extended).
// Side view, mm: s forward from the rear face of the upper receiver, t up from the bore axis, w right
// (ejection-port side). Real dimensions: 840 mm overall (stock extended), 368 mm (14.5 in) barrel from the
// breech face (s = 152) to the crown (s = 520), A2 birdcage to s = 564, butt pad at s = -276.
import { Gun, V, profile, plan, section, lathe, cyl, tube, box, sphere, sweep, cut, union, cutters, merge, xform, circle } from '../lib/gunkit.mjs';

// ------------------------------------------------------------------------------------------ local helpers

// Low-segment wrappers: the kit defaults to 10 segments per fillet, far too many for a 45k budget.
const PF = (pts, o = {}) => profile(pts, { curveSeg: 3, ...o });
const PL = (pts, o = {}) => plan(pts, { curveSeg: 3, ...o });
const SC = (pts, a, b, o = {}) => section(pts, a, b, { curveSeg: 3, ...o });
/** small hard box (1 rounding segment) */
const bx = (c, sz, r = 0.4, rot) => box(c, sz, { r, seg: 1, rot });
/** through-slot cutter along w (rounded ends), cheap version of cutters.slotW */
const slotCut = (s0, s1, t, h, depth, cw) => profile([[s0, t - h / 2, h / 2], [s1, t - h / 2, h / 2], [s1, t + h / 2, h / 2], [s0, t + h / 2, h / 2]], { w: depth, cw, bevel: 0, curveSeg: 2 });
/** Picatinny rail, light version of kit.rail (the kit rail costs ~300 tris per tooth): base + chamfered teeth */
function lightRail(s0, s1, t) {
  const parts = [section([[-8.6, 0], [8.6, 0], [10.6, 2], [9.4, 3.3], [-9.4, 3.3], [-10.6, 2]], s0, s1, { bevel: 0.4, bevelSeg: 1 })];
  const n = Math.floor((s1 - s0) / 10), off = (s1 - s0 - n * 10) / 2 + 2.35;
  for (let i = 0; i < n; i++) {
    const a = s0 + off + i * 10;
    parts.push(section([[-9.8, 3], [9.8, 3], [9.2, 6], [-9.2, 6]], a, a + 5.3, { bevel: 0.35, bevelSeg: 1 }));
  }
  return xform(merge(parts), { move: [0, t, 0] });
}

// Lathe along a principal axis: pts [[a, r]] with a measured from `at` along +axis.
const ROT = { s: null, t: [90, 0, 0], '-t': [-90, 0, 0], w: [0, -90, 0], '-w': [0, 90, 0] };
function lax(pts, at, axis = 's', seg = 20) {
  const g = lathe(pts, { seg });
  if (ROT[axis]) xform(g, { rot: ROT[axis] });
  const c = V(...at);
  g.translate(c.x, c.y, c.z);
  return g;
}
/** socket-head cap screw (round recess) */
const capScrew = (at, r, axis = "w", d = 1.4, seg = 12) =>
  lax([[0, 0], [0, r], [d * 0.62, r], [d, r - 0.35], [d, r * 0.52], [d - 0.7, r * 0.5], [d - 0.7, 0]], at, axis, seg);
/** hex head / nut */
const hexHead = (at, r, axis = 'w', d = 1.6) => lax([[0, 0], [0, r], [d - 0.35, r], [d, r - 0.35], [d, 0]], at, axis, 6);
/** flush pin end */
const pinEnd = (at, r, axis = 'w', d = 0.6) => lax([[0, 0], [0, r], [d, r - 0.2], [d, 0]], at, axis, 14);
/** roll pin end (hollow look) */
const rollPin = (at, r, axis = 'w', d = 0.5) => lax([[0, 0], [0, r], [d, r - 0.15], [d, r * 0.55], [d - 0.4, r * 0.5], [d - 0.4, 0]], at, axis, 14);

const arcPts = (cs, ct, r, a0, a1, n) => {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = (a0 + ((a1 - a0) * i) / n) * Math.PI / 180; out.push([cs + r * Math.cos(a), ct + r * Math.sin(a)]); }
  return out;
};
/** star / gear outline for fluted knobs (extrude with profile -> axis w, plan -> axis t) */
const gearPts = (cx, cy, ro, ri, n) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, h = Math.PI / n;
    out.push([cx + ro * Math.cos(a - h * 0.35), cy + ro * Math.sin(a - h * 0.35)]);
    out.push([cx + ro * Math.cos(a + h * 0.35), cy + ro * Math.sin(a + h * 0.35)]);
    out.push([cx + ri * Math.cos(a + h), cy + ri * Math.sin(a + h)]);
  }
  return out;
};

// 3x5 pixel font for raised roll-marks
const FONT = {
  A: ['010', '101', '111', '101', '101'], C: ['111', '100', '100', '100', '111'], D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'], F: ['111', '100', '110', '100', '100'], I: ['111', '010', '010', '010', '111'],
  L: ['100', '100', '100', '100', '111'], M: ['101', '111', '111', '101', '101'], N: ['110', '101', '101', '101', '101'],
  O: ['111', '101', '101', '101', '111'], P: ['111', '101', '111', '100', '100'], R: ['110', '101', '110', '101', '101'],
  S: ['111', '100', '111', '001', '111'], T: ['111', '010', '010', '010', '010'], U: ['101', '101', '101', '101', '111'],
  Y: ['101', '101', '010', '010', '010'], '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'], '3': ['111', '001', '011', '001', '111'], '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '110'], '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '001', '010', '010'],
  '8': ['111', '101', '111', '101', '111'], '9': ['111', '101', '111', '001', '111'], '-': ['000', '000', '111', '000', '000'],
  '.': ['000', '000', '000', '000', '010'], ' ': ['000', '000', '000', '000', '000'],
};
/** raised lettering on a face looking towards +w (side 1) or -w (side -1); reads left-to-right from that side */
function stamp(str, at, { px = 0.6, side = 1, h = 0.32 } = {}) {
  const [s0, t0, w0] = at;
  const parts = [];
  const glyphs = typeof str === 'string' ? [...str].map((c) => FONT[c] || FONT[' ']) : [str];
  let col = 0;
  for (const gl of glyphs) {
    gl.forEach((row, r) => {
      let c = 0;
      while (c < row.length) {
        if (row[c] !== '1') { c++; continue; }
        let e = c;
        while (e < row.length && row[e] === '1') e++;
        const sc = s0 + side * (col + (c + e) / 2) * px;
        parts.push(box([sc, t0 - (r + 0.5) * px, w0 + side * (h / 2 - 0.08)], [(e - c) * px, px, h], { r: 0 }));
        c = e;
      }
    });
    col += gl[0].length + 1;
  }
  return merge(parts);
}
// original maker's mark: a stylised "sentry eye"
const EYE = ['0001000', '0011100', '0110110', '1101011', '0110110', '0011100', '0001000'];

// ------------------------------------------------------------------------------------------ model

export default function build() {
  const g = new Gun('m4');
  const RAIL_T = 23;          // Picatinny base on the receiver and the handguard (teeth top = 29)
  const AIM = 65;             // optical axis / iron-sight line (absolute co-witness, 36 mm over the rail)
  const MUZZLE = 564;

  // ======================================================================== upper receiver (7075 forging)
  const upperSec = [[-14.5, -13, 1], [14.5, -13, 1], [14.5, 11, 2.5], [12.2, 17, 1.5], [10.6, 18.8, 0.5], [10.6, 23.6, 0],
    [-10.6, 23.6, 0], [-10.6, 18.8, 0.5], [-12.2, 17, 1.5], [-14.5, 11, 2.5]];
  let upper = SC(upperSec, 0, 178, { bevel: 1.2 });
  upper = cut(upper, [
    PF([[88, -8, 2.5], [150, -8, 2.5], [150, 8.5, 2.5], [88, 8.5, 2.5]], { w: 40, cw: 9, bevel: 0 }), // ejection port + raceway
    cutters.box([145, -12.5, 0], [64.6, 17, 23.4]),                                                          // magazine / feed opening
    cutters.box([22, 20.7, 0], [54, 6.4, 10.8]),                                                             // charging-handle channel
  ]);
  g.add(upper, 'alu');
  g.add(lightRail(0, 178, RAIL_T), 'alu');

  // forward assist: housing yawed out at the rear, plunger button with a ribbed face
  const fa = (geo) => xform(geo, { rot: [0, 7, 0], move: [1.5, 7.5, 16.4] });
  g.add(fa(lathe([[0, 0], [0, 7.6], [0.8, 8.6], [36, 8.6], [50, 7], [58, 3.5], [58.5, 0]], { seg: 24 })), 'alu');
  g.add(fa(lathe([[-5.4, 0], [-5.4, 1.6], [-4.9, 2.1], [-5.4, 2.7], [-5.4, 3.9], [-4.9, 4.4], [-5.4, 5], [-5.3, 6.2], [-4.7, 7.3],
    [-3.6, 8], [-1.5, 8.1], [0.6, 8.1], [0.6, 0]], { seg: 20 })), 'steel_dark');
  // brass deflector behind the port
  g.add(PL([[64, 13.8], [90, 13.8], [90, 17, 0.8], [86.5, 21.6, 2], [75, 21, 4], [66, 17.2, 3]], { h: 12, ct: 8.5, bevel: 1 }), 'alu');
  // dust-cover hinge lugs, rod and spring
  for (const s of [82, 156]) g.add(box([s, -10.6, 15], [6, 5.2, 4], { seg: 1, r: 1 }), 'alu');
  g.add(cyl(78, 160, 1.0, { t: -10.6, w: 15.4, seg: 10 }), 'steel');
  {
    const pts = [];
    for (let i = 0; i <= 72; i++) { const a = (i / 72) * Math.PI * 2 * 6; pts.push([112 + (14 * i) / 72, -10.6 + 1.6 * Math.cos(a), 15.4 + 1.6 * Math.sin(a)]); }
    g.add(sweep(pts, 0.32, { seg: 60, radial: 4 }), 'steel_dark');
  }
  // barrel extension (seen through the port when the bolt is back)
  g.add(tube(152.2, 178, 12.4, 4.6, { seg: 24 }), 'steel');

  // ======================================================================== dust cover (modelled OPEN)
  const DC = [119, -10.6, 15.4];
  const dc = g.part('dustcover', { pivot: DC, extras: { axis: 'z', closeDeg: 140, note: 'modelled open; rotate +140 deg about local Z to close' } });
  dc.add(xform(merge([
    PF([[86.4, -9.4, 2.2], [151.6, -9.4, 2.2], [151.6, 9.6, 2.2], [86.4, 9.6, 2.2]], { w: 1.3, cw: 15.55, bevel: 0.45 }),
    PF([[96, 0.5, 1.2], [142, 0.5, 1.2], [142, 4, 1.2], [96, 4, 1.2]], { w: 1.2, cw: 16.6, bevel: 0.45 }),
    box([140, 6, 14.4], [5, 3, 1.6], { seg: 1, r: 0.5 }),
    cyl(86.6, 92.5, 2.1, { t: -10.6, w: 15.4, seg: 12 }),
    cyl(145.5, 151.4, 2.1, { t: -10.6, w: 15.4, seg: 12 }),
  ]), { rot: [0, 0, -140], pivot: DC }), 'steel_dark');

  // ======================================================================== bolt group (charging handle + carrier)
  const bolt = g.part('bolt', { pivot: [-8, 21, 0], extras: { travel: 0.07 } });
  // T-handle body (right wing) and the latch (left wing) as separate pieces
  bolt.add(PL([[-0.6, -8.9, 0.3], [-0.6, 8.9, 0.3], [-3.6, 10.4, 1.4], [-3.6, 22.4, 2], [-6.2, 25.6, 2.6], [-11.6, 24.6, 4],
    [-14.4, 16, 6], [-14.4, -8.9, 0.4]], { h: 6.4, ct: 21, bevel: 0.7 }), 'alu');
  bolt.add(PL([[-1.4, -9.5, 0.3], [-14.4, -9.5, 0.4], [-14.4, -16, 6], [-11.6, -24.6, 4], [-6.2, -25.6, 2.6], [-3.6, -22.4, 2],
    [-3.6, -10.6, 1]], { h: 6.4, ct: 21, bevel: 0.7 }), 'alu');
  for (let k = 0; k < 5; k++) bolt.add(box([-9.5, 24.4, -13 - k * 2.3], [7, 0.7, 1], { seg: 1, r: 0.2 }), 'alu');
  bolt.add(pinEnd([-5, 24.2, -10.2], 1.1, 't', 0.35), 'steel');
  bolt.add(box([40, 20.4, 0], [82, 4.6, 9.4], { seg: 1, r: 0.6 }), 'alu'); // shaft
  // carrier with forward-assist notches and a milled flat, bolt with extractor
  let carrier = lathe([[14, 0], [14, 11.4], [15, 12.3], [117, 12.3], [118, 11.5], [118, 0]], { seg: 24 });
  const notch = [];
  for (let i = 0; i < 6; i++) notch.push(cutters.box([90.5 + i * 2.6, 1, 13], [1.3, 12, 4]));
  notch.push(cutters.box([112, 0, 14.5], [14, 14, 6]));
  carrier = cut(carrier, merge(notch));
  bolt.add(carrier, 'steel_bright');
  bolt.add(lathe([[117.6, 0], [117.6, 8.1], [118.2, 8.6], [121, 8.6], [121, 8.1], [121.8, 8.1], [121.8, 8.6], [123, 8.6], [123, 8.1],
    [123.8, 8.1], [123.8, 8.6], [150.6, 8.6], [151.6, 7.6], [151.6, 0]], { seg: 20 }), 'steel');
  bolt.add(box([141, 5.2, 8.3], [18, 3, 4.2], { seg: 1, r: 0.5, rot: [0, 0, -58] }), 'steel_dark');
  bolt.add(pinEnd([135, 5.4, 10], 0.9, 'w', 0.4), 'steel');

  // ======================================================================== lower receiver
  const lowerMain = PF([[-12, -13.6, 1.5], [178.5, -13.6, 1], [178.5, -22, 0.5], [109, -22, 0], [108, -40, 2], [-2, -40, 3],
    [-10, -34.5, 5], [-14.6, -21, 3]], { w: 27, bevel: 1.2 });
  const magwell = PF([[108.5, -21.2, 1], [178.6, -21.2, 1], [179.6, -60, 1.5], [184.6, -64.5, 2], [184.6, -69.5, 1.5],
    [110, -69.5, 2], [107.5, -60, 2]], { w: 30.5, bevel: 1.4 });
  let lower = union(lowerMain, magwell);
  lower = cut(lower, [
    cutters.box([144.9, -45, 0], [64.6, 70, 23.4]), // magazine well
    cutters.box([79, -40, 0], [23, 12, 7.4]),        // trigger slot
  ]);
  g.add(lower, 'alu');
  // receiver-extension tower
  g.add(lathe([[-16.5, 0], [-16.5, 15.6], [-15.3, 16.8], [-0.6, 16.8], [-0.6, 0]], { seg: 28 }), 'alu');
  // trigger guard + ears
  g.add(PF([[109, -40.4, 0.5], [109, -48, 3], [101, -62.5, 9], [48, -63.5, 9], [37, -60, 4], [33.5, -54, 1.5], [34.5, -46, 1.5],
    [40, -40.4, 0.5], [44.5, -40.4, 0.5], [44.5, -52, 3], [50, -57.6, 5], [95, -56.6, 5], [101, -49, 3], [101, -40.4, 0.5]],
  { w: 9.6, bevel: 1.6 }), 'alu');
  g.add(PF([[99.5, -39, 0.5], [110, -39, 0.5], [110, -45, 2], [105, -50, 3], [99.5, -48, 2]], { w: 14, bevel: 0.9 }), 'alu');
  g.add(PF([[37.5, -39, 0.5], [48, -39, 0.5], [48, -44, 2], [43, -47.5, 3], [37.5, -45.5, 2]], { w: 14, bevel: 0.9 }), 'alu');
  for (const sd of [1, -1]) {
    const ax = sd > 0 ? 'w' : '-w';
    g.add(rollPin([105, -44.5, 7 * sd], 1.5, ax), 'steel');
    g.add(rollPin([42.5, -43, 7 * sd], 1.5, ax), 'steel');
  }
  // fire-control pins (anti-walk hex heads on the right), takedown / pivot pins
  for (const [s, t] of [[74, -27], [52, -25]]) {
    g.add(hexHead([s, t, 13.5], 3.3, 'w', 1.0), 'steel_dark');
    g.add(pinEnd([s, t, 14.5], 1.5, 'w', 0.5), 'steel');
    g.add(pinEnd([s, t, -13.5], 2.6, '-w', 0.7), 'steel_dark');
  }
  for (const [s, t, r] of [[6, -20.6, 4.2], [171, -18.2, 3.8]]) {
    g.add(lax([[0, 0], [0, r], [1.1, r], [1.5, r - 0.6], [1.5, 0]], [s, t, -13.5], '-w', 18), 'steel');
    g.add(pinEnd([s, t, 13.5], r * 0.72, 'w', 0.5), 'steel');
  }
  // bolt catch (left) on its boss
  g.add(box([116.5, -18.3, -14.5], [14, 6, 2.2], { seg: 1, r: 0.8 }), 'alu');
  g.add(PF([[111.5, -15.6, 2], [121.5, -15.6, 2], [123.5, -25, 1], [127.5, -29, 2], [127.5, -34, 2.5], [109.5, -34, 2.5],
    [109.5, -29, 2], [113, -25, 1]], { w: 2, cw: -16.6, bevel: 0.5 }), 'steel');
  for (let k = 0; k < 5; k++) g.add(box([112 + k * 3.2, -31.5, -17.7], [0.9, 4, 0.5], { seg: 1, r: 0.15 }), 'steel');
  g.add(pinEnd([117, -19.5, -17.6], 1.4, '-w', 0.4), 'steel_dark');
  // magazine release (right) with its fence
  g.add(lax([[0, 0], [0, 4.7], [2.3, 4.7], [3, 4.1], [3, 0]], [104, -30, 13.4], 'w', 22), 'steel');
  g.add(PF([...arcPts(104, -30, 8.6, 165, 375, 14), ...arcPts(104, -30, 6.6, 375, 165, 14)], { w: 2.4, cw: 14.6, bevel: 0.7 }), 'alu');
  // roll-marks on the left of the magwell (original maker/model, calibre, serial)
  g.add(stamp('SENTRY-4', [171, -26, -15.25], { px: 0.75, side: -1 }), 'alu');
  g.add(stamp('CAL 5.56', [171, -32.5, -15.25], { px: 0.6, side: -1 }), 'alu');

  g.add(stamp(EYE, [143, -26, -15.25], { px: 0.8, side: -1 }), 'alu');

  // ======================================================================== trigger, selector
  const trig = g.part('trigger', { pivot: [74, -27, 0], extras: { axis: 'x', pullDeg: -12 } });
  trig.add(PF([[69.5, -30, 2], [79, -30, 2], [79.5, -41, 0], [77.2, -47, 6], [78.8, -53.6, 1.5], [76.4, -55, 1.2], [72.4, -48, 6],
    [72, -41, 0], [69.5, -36, 2]], { w: 6, bevel: 0.9 }), 'steel');

  const sel = g.part('selector', { pivot: [30, -24, 0], extras: { axis: 'x', safeDeg: -90, autoDeg: 90, note: 'modelled on FIRE (lever up)' } });
  sel.add(PF([...arcPts(30, -24, 6.4, 150, 390, 10), [34.2, -17.5, 1.5], [36.6, -14.4, 2], [23.4, -14.4, 2], [25.8, -17.5, 1.5]],
    { w: 2.2, cw: -15.3, bevel: 0.6 }), 'steel');
  for (let k = 0; k < 4; k++) sel.add(box([26 + k * 2.6, -16.6, -16.5], [0.8, 3, 0.5], { seg: 1, r: 0.15 }), 'steel');
  sel.add(lax([[0, 0], [0, 3.2], [1.2, 3], [1.4, 0]], [30, -24, -16.4], '-w', 16), 'steel');
  sel.add(PF([...arcPts(30, -24, 5.4, 150, 390, 8), [33.6, -18.6, 1.2], [35.2, -15.6, 1.6], [24.8, -15.6, 1.6], [26.4, -18.6, 1.2]],
    { w: 2, cw: 14.6, bevel: 0.55 }), 'steel');
  sel.add(capScrew([30, -24, 15.6], 2.4, 'w', 1.1), 'steel_dark');

  // ======================================================================== pistol grip (20 deg rake)
  g.add(PF([[38.5, -40.8, 1], [36, -50, 6], [29.5, -74, 24], [20, -101, 20], [10.6, -122.5, 3], [-31.7, -107.1, 3],
    [-26.3, -83.5, 26], [-11.9, -52.6, 8], [-14, -44, 4], [-19.5, -38.5, 3], [-12, -36.2, 3], [-4, -40.8, 1]],
  { w: 29.5, bevel: 3.5, bevelSeg: 3, curveSeg: 5 }), 'polymer');
  g.add(PF([[31, -50, 4], [24.5, -76, 16], [16, -100, 10], [6.5, -115, 4], [-23.5, -104.5, 4], [-21.5, -83, 14], [-9.5, -58, 4],
    [-6.5, -50, 3]], { w: 30.3, bevel: 1, curveSeg: 6 }), 'polymer_grip');
  g.add(PF([[11, -123.2, 0.8], [8.4, -128.8, 3], [-33.9, -113.4, 3], [-32.3, -107.9, 0.8]], { w: 27.5, bevel: 1.8 }), 'polymer');

  // ======================================================================== buffer tube, end plate, castle nut
  g.add(lathe([[-182, 0], [-182, 12.6], [-181, 14.1], [-179.6, 14.6], [-16, 14.6], [-16, 0]], { seg: 36 }), 'alu');
  {
    let rib = SC([[-4.3, -18, 0.8], [4.3, -18, 0.8], [4.3, -12, 0], [-4.3, -12, 0]], -179, -29, { bevel: 0.6 });
    const holes = [];
    for (let k = 0; k < 6; k++) holes.push(lax([[0, 0], [0, 2.2], [16, 2.2], [16, 0]], [-36 - k * 16, -26, 0], "t", 10));
    g.add(cut(rib, merge(holes)), 'alu');
  }
  g.add(lathe([[-19.8, 0], [-19.8, 16.8], [-19.2, 17.4], [-17.2, 17.4], [-16.8, 16.8], [-16.8, 0]], { seg: 24 }), 'steel');
  g.add(box([-18.3, -21.5, 0], [3, 9, 11], { seg: 1, r: 0.8 }), 'steel');
  g.add(box([-18.3, -1, -19], [3, 12, 8], { seg: 1, r: 0.8 }), 'steel');
  g.add(box([-21.5, -1, -21.5], [6.5, 11, 6], { seg: 1, r: 1.5 }), 'steel');
  g.add(lax([[0, 0], [0, 4.4], [0.8, 4.2], [0.8, 2.8], [0.2, 2.7], [0.2, 0]], [-21.5, -1, -24.5], '-w', 18), 'steel_dark');
  {
    let nut = lathe([[-28.2, 14.65], [-28.2, 16.2], [-27.6, 16.8], [-20.4, 16.8], [-19.8, 16.2], [-19.8, 14.65], [-28.2, 14.65]], { seg: 24 });
    const nn = [];
    for (let k = 0; k < 8; k++) nn.push(xform(cutters.box([-26.6, 15.8, 0], [3.6, 3, 3.4]), { rot: [0, 0, k * 45 + 22.5] }));
    g.add(cut(nut, merge(nn)), 'steel_dark');
  }

  // ======================================================================== CTR-style stock (extended)
  g.add(SC([[-13, -17.6, 3], [13, -17.6, 3], [18.6, -8.5, 4], [18.6, 10, 5], [12.5, 20.6, 5], [-12.5, 20.6, 5], [-18.6, 10, 5],
    [-18.6, -8.5, 4]], -256, -92, { bevel: 2.5, bevelSeg: 3 }), 'polymer');
  {
    let body = PF([[-96, -8, 2], [-96, -17, 2], [-150, -21.5, 10], [-244, -84, 12], [-257, -91.5, 3], [-258.4, 24, 3], [-247, 27.5, 6],
      [-200, 21.5, 30], [-130, 16, 6]], { w: 27, bevel: 3.5, bevelSeg: 3 });
    const pk = [[-172, -24, 3], [-236, -70, 4], [-246, -70, 4], [-246, -24, 4]];
    body = cut(body, [cutters.pocketW(pk, 11, 20), cutters.pocketW(pk, -11, 20), slotCut(-244, -232, -60, 5.6, 200, 0)]);
    g.add(body, 'polymer');
  }
  {
    g.add(PF([[-256.5, 30.5, 3], [-266, 31.5, 6], [-276, 29, 6], [-276, -93, 6], [-266, -97, 6], [-256.5, -93.5, 3]], { w: 38, bevel: 4, bevelSeg: 3 }), "rubber");
  }
  g.add(PF([[-99, -17, 1], [-146, -19.8, 2], [-146, -24.6, 2], [-108, -25.4, 2], [-99.5, -23.5, 2]], { w: 10, bevel: 1 }), 'polymer');
  for (let k = 0; k < 4; k++) g.add(box([-102 - k * 2.6, -25.6, 0], [1, 1.2, 8.6], { seg: 1, r: 0.3 }), 'polymer');
  for (const sd of [1, -1]) {
    g.add(pinEnd([-140, -22.4, 5 * sd], 1.3, sd > 0 ? 'w' : '-w', 0.4), 'steel');
    g.add(lax([[0, 0], [0, 6.2], [1.6, 6.2], [2.2, 5.6], [2.2, 3.9], [1.2, 3.7], [1.2, 0]], [-238, 1, 18.4 * sd], sd > 0 ? "w" : "-w", 14), 'steel');
  }

  // ======================================================================== free-float M-LOK handguard
  const HG0 = 180.5, HG1 = 470;
  const hgO = [[-12, -22, 2.5], [12, -22, 2.5], [20, -14, 2.5], [20, 12, 2.5], [13.6, 20.9, 1.5], [10.6, 23.6, 0], [-10.6, 23.6, 0],
    [-13.6, 20.9, 1.5], [-20, 12, 2.5], [-20, -14, 2.5]];
  const hgI = [[-10.6, -19.6, 1.5], [10.6, -19.6, 1.5], [17.6, -12.8, 1.5], [17.6, 11, 1.5], [12.6, 18.3, 1], [-12.6, 18.3, 1],
    [-17.6, 11, 1.5], [-17.6, -12.8, 1.5]];
  {
    let hg = SC(hgO, HG0, HG1, { bevel: 1.2, holes: [hgI] });
    const hc = [];
    for (const a of [205, 246, 287, 328, 369, 410]) {
      const b = a + 32, m = (a + b) / 2;
      hc.push(slotCut(a, b, -1, 7.2, 8, 19), slotCut(a, b, -1, 7.2, 8, -19));
      hc.push(PL([[a, -3.6, 3.6], [b, -3.6, 3.6], [b, 3.6, 3.6], [a, 3.6, 3.6]], { h: 8, ct: -21, bevel: 0 }));
      for (const sd of [1, -1]) {
        const v = PL([[m - 9, -2.3, 2.3], [m + 9, -2.3, 2.3], [m + 9, 2.3, 2.3], [m - 9, 2.3, 2.3]], { h: 8, ct: 0, bevel: 0 });
        hc.push(xform(v, { rot: [0, 0, -54.3 * sd], move: [0, 16.45, 16.8 * sd] }));
      }
    }
    hc.push(cutters.box([190, -21, 0], [20, 4, 1.2])); // clamp split
    g.add(cut(hg, merge(hc)), 'alu');
  }
  g.add(lightRail(HG0, HG1, RAIL_T), 'alu');
  for (const sd of [1, -1]) {
    g.add(box([178.6, 21, 11.6 * sd], [6, 4, 2], { seg: 1, r: 0.5 }), 'alu'); // anti-rotation tabs
    for (const s of [188, 200]) g.add(xform(capScrew([0, 0, 0], 2.3, sd > 0 ? 'w' : '-w', 1.3), { rot: [0, 0, -45 * sd], move: [s, -18, 16.1 * sd] }), 'steel_dark');
    g.add(lax([[0, 0], [0, 6.4], [1.6, 6.4], [2.3, 5.7], [2.3, 3.8], [1.0, 3.6], [1.0, 0]], [455, -1, 19.8 * sd], sd > 0 ? "w" : "-w", 14), 'steel');
  }
  // hand stop on the front bottom slot
  g.add(PF([[416, -21.6, 0], [446, -21.6, 0], [446, -25.5, 2], [437, -37, 4], [430.5, -37.5, 3], [420, -27, 5]], { w: 15, bevel: 1.8 }), 'polymer');
  // barrel nut
  g.add(lathe([[176, 9.8], [176, 15.4], [176.6, 16], [196, 16], [196.6, 15.4], [196.6, 9.8], [176, 9.8]], { seg: 20 }), 'steel_dark');

  // ======================================================================== barrel, gas system, A2 birdcage
  g.add(lathe([[178, 2.85], [178, 9.2], [178.6, 9.8], [330, 9.8], [332, 8.9], [338, 8.1], [503.4, 8.1], [503.6, 7.7], [519.6, 7.7],
    [520, 7.3], [520, 3.6], [519.4, 2.85], [178, 2.85]], { seg: 24 }), 'steel_dark');
  g.add(lathe([[322, 8.0], [322, 13.6], [322.8, 14.4], [340, 14.4], [340.8, 13.6], [340.8, 8.0], [322, 8.0]], { seg: 20 }), 'steel_dark');
  g.add(box([331, 15.5, 0], [17, 6, 10], { seg: 1, r: 1.5 }), 'steel_dark');
  for (const s of [326, 336]) g.add(capScrew([s, -14.2, 0], 2, '-t', 1), 'steel');
  g.add(cyl(176, 326, 2.4, { t: 15.4, seg: 10 }), 'steel');
  g.add(lathe([[503.6, 7.8], [503.6, 9.4], [504, 9.8], [505.4, 9.8], [505.8, 9.4], [505.8, 7.8], [503.6, 7.8]], { seg: 24 }), 'steel');
  {
    let fh = lathe([[506, 7.8], [506, 9.4], [506.6, 10.2], [515.6, 10.2], [517.4, 11.1], [561.6, 11.1], [563, 10.5], [564, 9.6], [564, 5.2],
      [563.4, 4.6], [521, 4.6], [521, 7.8], [506, 7.8]], { seg: 24 });
    const fc = [];
    for (const a of [0, 60, 120, -60, -120]) {
      fc.push(xform(PL([[527, -1.65, 1.65], [554, -1.65, 1.65], [554, 1.65, 1.65], [527, 1.65, 1.65]], { h: 10, ct: 9, bevel: 0 }), { rot: [0, 0, -a] }));
    }
    fc.push(cutters.box([511, 0, 12.4], [8.6, 30, 6.4]), cutters.box([511, 0, -12.4], [8.6, 30, 6.4]));
    g.add(cut(fh, merge(fc)), 'steel_dark');
  }

  // ======================================================================== folding BUIS
  const buisBase = [[-11.8, 23.8, 0.6], [11.8, 23.8, 0.6], [11.8, 31, 1.2], [9.2, 33.4, 1.4], [-9.2, 33.4, 1.4], [-11.8, 31, 1.2]];
  const buisCommon = (s0, s1, hingeS, knobS) => {
    g.add(SC(buisBase, s0, s1, { bevel: 0.8 }), 'alu');
    for (const sd of [1, -1]) g.add(box([hingeS, 35.5, 8.6 * sd], [8, 6, 2.6], { seg: 1, r: 1 }), 'alu');
    g.add(lax([[0, 0], [0, 1.3], [20.4, 1.3], [20.4, 0]], [hingeS, 35.5, -10.2], 'w', 12), 'steel');
    g.add(PF(gearPts(knobS, 26.8, 5.4, 4.7, 12), { w: 4.4, cw: 14.2, bevel: 0.5 }), 'alu');
    g.add(capScrew([knobS, 26.8, 16.4], 1.6, 'w', 0.6), 'steel');
    g.add(hexHead([knobS, 26.8, -11.8], 3.6, '-w', 1.8), 'steel_dark');
  };
  // rear
  buisCommon(4, 32, 8, 19);
  const leaf = g.part('leaf', { pivot: [8, 35.5, 0], extras: { flip: { axis: 'x', deg: 90 }, note: 'rear BUIS folded forward; +90 deg about local X stands it up' } });
  leaf.add(PL([[5.4, -6.2, 1], [33.5, -6.2, 1], [33.5, -8.6, 1.5], [42.2, -8.6, 2.5], [42.2, 8.6, 2.5], [33.5, 8.6, 1.5], [33.5, 6.2, 1],
    [5.4, 6.2, 1]], { h: 3.4, ct: 35.5, bevel: 0.6, holes: [circle(37.6, 0, 1.6)] }), 'alu');
  leaf.add(lax([[0, 1.6], [0, 4], [0.6, 4.4], [5.4, 4.4], [6, 4], [6, 1.6], [0, 1.6]], [37.6, 33, 0], 't', 20), 'alu');
  leaf.add(PF(gearPts(37.6, 35.5, 3.9, 3.4, 11), { w: 3.6, cw: 10.4, bevel: 0.4 }), 'alu');
  // front
  buisCommon(440, 466, 462, 449);
  g.add(lax([[0, 0], [0, 2.2], [1.4, 2.2], [1.8, 1.8], [1.8, 0]], [457, 29.5, 11.8], 'w', 14), 'steel');
  const leafF = g.part('leaf_front', { pivot: [462, 35.5, 0], extras: { flip: { axis: 'x', deg: -90 }, note: 'front BUIS folded back; -90 deg about local X stands it up' } });
  leafF.add(PL([[464.6, -6.2, 1], [464.6, 6.2, 1], [440.5, 6.2, 1], [438, 8.6, 1.5], [429.6, 8.6, 2.5], [429.6, -8.6, 2.5], [438, -8.6, 1.5],
    [440.5, -6.2, 1]], { h: 3.4, ct: 35.5, bevel: 0.6, holes: [[[431.4, -5.6, 1.2], [437.6, -5.6, 1.2], [437.6, 5.6, 1.2], [431.4, 5.6, 1.2]]] }), 'alu');
  leafF.add(box([435.2, 35.5, 0], [6.4, 1.6, 1.8], { seg: 1, r: 0.3 }), 'steel');

  // ======================================================================== tube red dot on a QD riser
  g.add(lathe([[103, 11.2], [103, 13.1], [103.8, 13.9], [105.6, 13.9], [105.6, 13.3], [106.8, 13.3],
    [106.8, 13.9], [109.8, 13.9], [110.6, 14.7], [111.2, 15], [150, 15], [150.8, 15.8], [163.4, 15.8], [164.6, 15.2],
    [165, 14.4], [165, 13.2], [163.6, 12.7], [158.2, 12.7], [158.2, 11.2], [103, 11.2]], { t: AIM, seg: 32 }), 'alu');
  g.add(cyl(105, 106, 11.3, { t: AIM, seg: 24 }), 'lens');
  g.add(cyl(160.4, 161.4, 12.75, { t: AIM, seg: 24 }), 'lens');
  g.add(sphere([160.25, AIM, 0], 0.42, { seg: 8 }), 'reticle_red');
  // turrets (elevation top, windage right) and brightness dial (left)
  g.add(box([131, AIM + 13.2, 0], [24, 8, 17], { seg: 1, r: 3 }), 'alu');
  g.add(lax([[0, 0], [0, 7.2], [1.6, 7.2], [1.6, 0]], [131, AIM + 17, 0], 't', 28), 'alu');
  g.add(PL(gearPts(131, 0, 7.6, 7.0, 15), { h: 6.4, ct: AIM + 21.6, bevel: 0.35 }), 'alu');
  g.add(box([131, AIM, 13.2], [24, 17, 8], { seg: 1, r: 3 }), 'alu');
  g.add(lax([[0, 0], [0, 7.2], [1.6, 7.2], [1.6, 0]], [131, AIM, 17], 'w', 28), 'alu');
  g.add(PF(gearPts(131, AIM, 7.6, 7.0, 15), { w: 6.4, cw: 21.8, bevel: 0.35 }), 'alu');
  g.add(box([146, AIM, -12.8], [18, 16, 8], { seg: 1, r: 3 }), 'alu');
  g.add(PF(gearPts(146, AIM, 8.6, 7.8, 16), { w: 5.6, cw: -19.4, bevel: 0.5 }), 'alu');
  g.add(lax([[0, 0], [0, 4.5], [0.8, 4.2], [0.8, 0]], [146, AIM, -22.2], '-w', 20), 'steel_dark');
  // mount saddle, riser with lightening windows, QD clamp
  g.add(SC([[-11, 46.4, 1], [11, 46.4, 1], [11, 52, 1.5], [8.4, 56, 2], [-8.4, 56, 2], [-11, 52, 1.5]], 108, 160, { bevel: 1 }), 'alu');
  for (const s of [114, 154]) for (const sd of [1, -1]) g.add(capScrew([s, 49.4, 11 * sd], 1.9, sd > 0 ? 'w' : '-w', 1), 'steel_dark');
  g.add(stamp('SRD-1', [133, 51.3, -11], { px: 0.45, side: -1 }), 'alu');
  g.add(PF([[104, 23.8, 1], [164, 23.8, 1], [164, 31, 1], [158, 46.6, 2.5], [110, 46.6, 2.5], [104, 31, 1]], {
    w: 24, bevel: 1.1, holes: [[[115, 33.6, 2.5], [132, 33.6, 2.5], [132, 42.6, 2.5], [115, 42.6, 2.5]], [[136, 33.6, 2.5], [153, 33.6, 2.5], [153, 42.6, 2.5], [136, 42.6, 2.5]]],
  }), 'alu');
  g.add(box([134, 27.6, 13.4], [30, 7.4, 2.8], { seg: 1, r: 0.8 }), 'alu');
  g.add(PF([[146.5, 24.2, 3.2], [150, 27.6, 3.2], [146.5, 31, 3.2], [118, 31.4, 2], [114, 29.6, 2], [118, 27, 2.5]], { w: 2.4, cw: 16, bevel: 0.6 }), 'steel_dark');
  for (let k = 0; k < 3; k++) g.add(box([116.5 + k * 2.2, 29.2, 17.3], [0.8, 3, 0.5], { seg: 1, r: 0.15 }), 'steel_dark');
  g.add(capScrew([146.5, 27.6, 17.2], 2.6, 'w', 1.2), 'steel');
  for (const s of [126, 142]) g.add(hexHead([s, 27.6, -12], 3.4, '-w', 1.8), 'steel_dark');

  // ======================================================================== 30-round polymer magazine
  const mag = g.part('mag', { pivot: [145, -13, 0], extras: { drop: true } });
  {
    const R = 260, SC = 145.3, HD = 31.2;
    const P = (d, side) => {
      let s = SC, t = -13 - d, ph = 0;
      if (d > 69) { ph = (d - 69) / R; s = SC + R * (1 - Math.cos(ph)); t = -82 - R * Math.sin(ph); }
      return [s + side * HD * Math.cos(ph), t + side * HD * Math.sin(ph), ph];
    };
    const ds = [6, 69, 82, 96, 110, 124, 138, 152, 169];
    const front = ds.map((d) => { const [s, t] = P(d, 1); return [s, t, d === 169 ? 2 : 0]; });
    const rear = ds.slice().reverse().filter((d) => d > 6).map((d) => { const [s, t] = P(d, -1); return [s, t, d === 169 ? 2 : 0]; });
    let body = PF([[114.1, -15.5, 1.5], [117.5, -13, 1], [150, -13, 1], [155.5, -19, 1], ...front, ...rear], { w: 22.6, bevel: 2.2 });
    body = cut(body, [cutters.box([136, -11.5, 0], [34, 5, 9.2])]);
    mag.add(body, 'polymer');
    // floor plate
    const [cs, ct, ph] = P(169, 0);
    const n = [Math.cos(ph), Math.sin(ph)], d = [Math.sin(ph), -Math.cos(ph)];
    const fp = (a, b) => [cs + n[0] * a + d[0] * b, ct + n[1] * a + d[1] * b];
    mag.add(PF([[...fp(33.4, -1), 1], [...fp(34, 6), 3], [...fp(30, 9), 2.5], [...fp(-32.6, 9), 3], [...fp(-32.6, -1), 1]], { w: 25.6, bevel: 2.2 }), 'polymer');
    // ribbed grip panels on the lower sides
    const gp = [95, 110, 125, 140, 158].map((dd) => P(dd, 0.82)).concat([158, 140, 125, 110, 95].map((dd) => P(dd, -0.82)));
    mag.add(PF(gp.map(([s, t]) => [s, t, 3]), { w: 23.4, bevel: 0.8 }), 'polymer_grip');
    // cartridges in the feed lips
    for (const [t, w] of [[-14.6, 1.6], [-18.4, -2.8]]) {
      mag.add(lathe([[118.5, 0], [118.5, 4.5], [119.2, 4.7], [119.8, 4.7], [120.3, 4], [121.5, 4], [122.1, 4.75], [155, 4.55], [157.6, 3.1],
        [163.5, 3.1], [163.5, 0]], { t, w, seg: 18 }), 'brass');
      mag.add(lathe([[163.4, 0], [163.4, 2.86], [168, 2.86], [171.5, 2.3], [174.2, 1.2], [175.4, 0.3], [175.6, 0]], { t, w, seg: 18 }), 'copper');
    }
  }

  // ======================================================================== sockets & meta
  g.socket('muzzle', [MUZZLE, 0, 0]);
  g.socket('eject', [119, 2, 15], { dir: [0.35, 0.25, 1] });
  g.socket('grip_r', [1, -80, 0], { rot: [0, 0, -20] });
  g.socket('grip_l', [345, -20, 0]);
  g.socket('magwell', [150, -78, 0]);
  g.socket('charge', [-8, 21, 0]);
  g.socket('sight_rear', [8, AIM, 0]);
  g.socket('sight_front', [462, AIM + 0.5, 0]);
  g.socket('optic', [105.5, AIM, 0], { type: 'reddot', zoom: 1.3 });
  g.meta({
    grip: 'rifle', support: 'handguard', reload: 'mag', chargeSide: 'rear',
    notes: 'Rear T-handle pulls straight back with the carrier (bolt.travel). Dust cover is modelled OPEN (node dustcover: rotate +140 deg about local Z to close). '
      + 'BUIS are folded (leaf / leaf_front: extras.flip). Selector modelled on FIRE. Lens meshes (mat lens) should be hidden or see-through while aiming; '
      + 'the reticle dot sits on the optical axis just behind the objective lens.',
  });
  return g;
}
