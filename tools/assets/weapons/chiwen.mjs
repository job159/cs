// 螭吻．吞潮 Chiwen Tidewarden — 神兵 rifle M07 (docs/PREMIUM_WEAPONS.md M07 card, §1.5, §1.15.1 v1.2).
// A 7.62 battle rifle (SCAR-H / FAL class: 1,050 mm overall, 450 mm barrel) dressed as the roof-ridge 螭吻
// (dragon head, fish tail, swallowing the ridge):
//   - muzzle shroud = the 螭吻 head biting the barrel: porcelain skull, gold lips / brows / horns, crystal eyes,
//     red-lacquer mouth; the lower jaw fx_jaw hinges open (3° a shot, 25° for the beam / ultimate)
//   - receiver top = a roof ridge: 12 jade 筒瓦 tiles on a gilt base running into the back of the head, a 瓦當
//     end cap facing the shooter; the rear keeps a Picatinny section for the low-power holographic sight
//   - handguard flanks = 開片 crackle-glazed fish scales, cobalt and white in a checker (青花): 6 groups
//     fx_scale1..6 (2 columns x 4 rows a side, both sides in one part) that flick 4° rear -> front; ice-cyan
//     light shows through the seams (glow_ice bed in a gilt frame)
//   - hero focus: a Ø16 glass water tube along the lower right of the handguard (fx_tube: pv_core water, fx_flow:
//     a bubble helix whose spin reads as the water circulating), brass end fittings with 2 screws each
//   - the stock ends in an upturned fish tail fx_tail (cobalt fins, gold edges and rays) that sways
//   - transparent 40-round water-tank magazine in a steel frame, the top rounds visible
// Materials 60 / 30 / 10: ice-white / cobalt / jade glaze (crackle via premium.pvKey) / dark steel, black chrome,
// gold, chrome / glow (glow_ice seams, water, eyes).
// Side view, mm: s forward from the rear face of the receiver, t up from the bore axis, w right.
import { Gun, V, profile, plan, section, lathe, cyl, tube, box, sphere, sweep, cut, union, cutters, merge, xform, circle } from '../lib/gunkit.mjs';

// ------------------------------------------------------------------------------------------ local helpers

const PF = (pts, o = {}) => profile(pts, { curveSeg: 3, ...o });
const PL = (pts, o = {}) => plan(pts, { curveSeg: 3, ...o });
const SC = (pts, a, b, o = {}) => section(pts, a, b, { curveSeg: 3, ...o });
const slotCut = (s0, s1, t, h, depth, cw) => profile([[s0, t - h / 2, h / 2], [s1, t - h / 2, h / 2], [s1, t + h / 2, h / 2], [s0, t + h / 2, h / 2]], { w: depth, cw, bevel: 0, curveSeg: 2 });
function lightRail(s0, s1, t) {
  const parts = [section([[-8.6, 0], [8.6, 0], [10.6, 2], [9.4, 3.3], [-9.4, 3.3], [-10.6, 2]], s0, s1, { bevel: 0.4, bevelSeg: 1 })];
  const n = Math.floor((s1 - s0) / 10), off = (s1 - s0 - n * 10) / 2 + 2.35;
  for (let i = 0; i < n; i++) {
    const a = s0 + off + i * 10;
    parts.push(section([[-9.8, 3], [9.8, 3], [9.2, 6], [-9.2, 6]], a, a + 5.3, { bevel: 0.35, bevelSeg: 1 }));
  }
  return xform(merge(parts), { move: [0, t, 0] });
}
const ROT = { s: null, '-s': [0, 180, 0], t: [90, 0, 0], '-t': [-90, 0, 0], w: [0, -90, 0], '-w': [0, 90, 0] };
function lax(pts, at, axis = 's', seg = 20) {
  const g = lathe(pts, { seg });
  if (ROT[axis]) xform(g, { rot: ROT[axis] });
  const c = V(...at);
  g.translate(c.x, c.y, c.z);
  return g;
}
const capScrew = (at, r, axis = 'w', d = 1.4, seg = 8) =>
  lax([[0, 0], [0, r], [d * 0.62, r], [d, r - 0.35], [d, r * 0.52], [d - 0.7, r * 0.5], [d - 0.7, 0]], at, axis, seg);
const hexHead = (at, r, axis = 'w', d = 1.6) => lax([[0, 0], [0, r], [d - 0.35, r], [d, r - 0.35], [d, 0]], at, axis, 6);
const pinEnd = (at, r, axis = 'w', d = 0.6) => lax([[0, 0], [0, r], [d, r - 0.2], [d, 0]], at, axis, 10);
const rollPin = (at, r, axis = 'w', d = 0.5) => lax([[0, 0], [0, r], [d, r - 0.15], [d, r * 0.55], [d - 0.4, r * 0.5], [d - 0.4, 0]], at, axis, 10);
const arcPts = (cs, ct, r, a0, a1, n) => {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = (a0 + ((a1 - a0) * i) / n) * Math.PI / 180; out.push([cs + r * Math.cos(a), ct + r * Math.sin(a)]); }
  return out;
};
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
/** ring band round the bore axis (or a parallel axis at t, w): s0..s1, radii r0..r1, chamfer b */
const washer = (s0, s1, r0, r1, b = 0.5, seg = 24, t = 0, w = 0) => lathe([[s0, r0 + b], [s0, r1 - b], [s0 + b, r1], [s1 - b, r1], [s1, r1 - b], [s1, r0 + b], [s1 - b, r0], [s0 + b, r0], [s0, r0 + b]], { seg, t, w });

// 3x5 pixel font for raised roll-marks
const FONT = {
  A: ['010', '101', '111', '101', '101'], C: ['111', '100', '100', '100', '111'], D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'], H: ['101', '101', '111', '101', '101'], I: ['111', '010', '010', '010', '111'],
  M: ['101', '111', '111', '101', '101'], N: ['110', '101', '101', '101', '101'], O: ['111', '101', '101', '101', '111'],
  R: ['110', '101', '110', '101', '101'], S: ['111', '100', '111', '001', '111'], T: ['111', '010', '010', '010', '010'],
  W: ['101', '101', '111', '111', '101'], X: ['101', '101', '010', '101', '101'], '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'], '2': ['111', '001', '111', '100', '111'], '5': ['111', '100', '111', '001', '110'],
  '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '001', '010', '010'], '.': ['000', '000', '000', '000', '010'],
  '-': ['000', '000', '111', '000', '000'], ' ': ['000', '000', '000', '000', '000'],
};
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
// house emblem: a curling wave under a dragon's eye (original)
const WAVE = ['0011100', '0100010', '1001010', '1000100', '0100001', '1011110', '0100001'];

// fish scale: a U facing the rear (the free edge), 14 x 10 mm, its centre at (s0, t0), thick across w
function scaleGeo(s0, t0, cw, side) {
  const pts = [[s0 + 7, t0 - 5, 0], [s0 + 7, t0 + 5, 0], ...arcPts(s0 - 2, t0, 5, 90, 270, 4).map(([a, b]) => [a, b, 0])];
  const g = PF(pts, { w: 2.2, cw, bevel: 0.85, bevelSeg: 1 });
  // the free (rear) edge stands proud of the flank, the covered front edge tucks in
  return xform(g, { rot: [0, 6 * side, 0], pivot: [s0 + 7, t0, cw] });
}

// ------------------------------------------------------------------------------------------ model

export default function build() {
  const g = new Gun('chiwen');
  const RAIL_T = 24;
  const AIM = 62;                  // holo window centre
  const MUZZLE = 696;              // the mouth
  const HG0 = 240, HG1 = 542;      // handguard
  const TT = -24.5, TW = 18.6;     // water tube axis (lower right of the handguard)
  const TS0 = 250, TS1 = 534;      // water tube ends (fittings outside)

  // ======================================================================== upper receiver
  const upperSec = [[-15, -12, 1], [15, -12, 1], [15, 14, 2.5], [12.6, 20, 1.5], [11, 24, 0], [-11, 24, 0], [-12.6, 20, 1.5], [-15, 14, 2.5]];
  let upper = SC(upperSec, 0, HG0, { bevel: 1.2 });
  upper = cut(upper, [
    PF([[120, -7, 2.5], [186, -7, 2.5], [186, 9, 2.5], [120, 9, 2.5]], { w: 40, cw: 9, bevel: 0 }),   // ejection port
    cutters.box([160, -12.5, 0], [78, 17, 25]),                                                          // magazine / feed opening
    PF([[172, 2.4, 2.6], [236, 2.4, 2.6], [236, 9.6, 2.6], [172, 9.6, 2.6]], { w: 12, cw: -15, bevel: 0 }),   // charging slot, left
    // lightening flutes on both flanks (rear half)
    PF([[10, 15, 1.4], [108, 15, 1.4], [108, 17.4, 1.4], [10, 17.4, 1.4]], { w: 2, cw: 15.2, bevel: 0 }),
    PF([[10, 15, 1.4], [160, 15, 1.4], [160, 17.4, 1.4], [10, 17.4, 1.4]], { w: 2, cw: -15.2, bevel: 0 }),
  ]);
  g.add(upper, 'steel_dark');
  g.add(lightRail(4, 140, RAIL_T), 'steel_dark');
  // gilt inlay lines in the flutes (the 30 % trim)
  g.add(box([59, 16.2, 14.85], [96, 1.2, 0.6], { r: 0.2, seg: 1 }), 'gold');
  g.add(box([85, 16.2, -14.85], [148, 1.2, 0.6], { r: 0.2, seg: 1 }), 'gold');
  // ejection-port brass deflector and the bolt carrier seen through the port
  g.add(PL([[188, 13.6], [204, 13.6], [204, 17, 0.8], [200, 21.6, 2], [192, 21, 3], [188, 17.2, 2]], { h: 14, ct: 2, bevel: 1 }), 'steel_dark');
  // receiver pins / screws
  for (const [s, t] of [[18, -6], [222, -6], [222, 6]]) for (const sd of [1, -1]) g.add(pinEnd([s, t, 15 * sd], 1.6, sd > 0 ? 'w' : '-w', 0.5), 'steel');
  for (const s of [30, 196]) for (const sd of [1, -1]) g.add(hexHead([s, 4, 15.2 * sd], 2.4, sd > 0 ? 'w' : '-w', 0.9), 'steel_bright');

  // roll-marks (left, original) and the house emblem
  g.add(stamp('CHIWEN TIDEWARDEN', [214, 10.8, -15.25], { px: 0.6, side: -1 }), 'steel_dark');
  g.add(stamp('M07 7.62X51', [214, 4.6, -15.25], { px: 0.5, side: -1 }), 'steel_dark');
  g.add(stamp(WAVE, [118, 8, -15.25], { px: 0.9, side: -1 }), 'gold');

  // ======================================================================== bolt (left charging handle + carrier in the port)
  const bolt = g.part('bolt', { pivot: [214, 6, -15], extras: { travel: 0.09 } });
  bolt.add(box([214, 6, -22.5], [10, 6.4, 15], { r: 2, seg: 2 }), 'steel_dark');
  bolt.add(lax([[0, 0], [0, 5.4], [1.2, 6], [10, 6], [11, 5.2], [12, 0]], [214, 6, -29], '-w', 16), 'polymer_grip');
  bolt.add(lathe([[96, 0], [96, 11.2], [97, 12], [202, 12], [203, 11.2], [203, 0]], { seg: 24 }), 'steel_bright');
  bolt.add(cut(box([158, 6, 10], [44, 5, 6], { r: 1 }), [cutters.box([158, 6, 10], [40, 1.2, 8])]), 'steel_bright');

  // ======================================================================== lower receiver (porcelain glaze), magwell
  const lowerMain = PF([[-12, -11.6, 1.5], [206, -11.6, 1], [206, -22, 0.5], [118, -22, 0], [116, -44, 2], [-2, -44, 3],
    [-10, -36, 5], [-14, -20, 3]], { w: 28, bevel: 1.4 });
  const magwell = PF([[116, -21, 1], [206, -21, 1], [208, -58, 1.5], [213, -63, 2], [213, -68, 1.5], [116, -68, 2], [113, -58, 2]], { w: 34, bevel: 1.6 });
  let lower = union(lowerMain, magwell);
  lower = cut(lower, [cutters.box([160, -45, 0], [79, 72, 25.5]), cutters.box([95, -44, 0], [24, 12, 8])]);
  g.add(lower, 'porcelain');
  // gilt rim round the magwell mouth
  g.add(PF([[114, -66.6, 1.5], [214, -66.6, 1.5], [214, -69.2, 1.5], [114, -69.2, 1.5]], { w: 35, bevel: 0.6 }), 'gold');
  // trigger guard
  g.add(PF([[116, -44.4, 0.5], [116, -50, 3], [108, -64, 9], [66, -65, 9], [58, -60, 4], [55, -54, 1.5], [56, -46, 1.5],
    [60, -44.4, 0.5], [64, -44.4, 0.5], [64, -53, 3], [69, -58.6, 5], [104, -57.6, 5], [109, -51, 3], [109, -44.4, 0.5]], { w: 10, bevel: 1.6 }), 'steel_dark');
  // mag release (left), bolt catch, takedown pins
  g.add(box([206, -30, -18], [8, 11, 3], { r: 1 }), 'steel_dark');
  for (let k = 0; k < 4; k++) g.add(box([206, -26.5 - k * 2.4, -19.6], [7, 0.7, 0.5], { r: 0.15, seg: 1 }), 'steel_dark');
  g.add(box([112, -26, 14.6], [10, 5, 2.4], { r: 0.8 }), 'steel_dark');
  for (const [s, t] of [[8, -24], [180, -18]]) {
    g.add(lax([[0, 0], [0, 3.6], [1.1, 3.6], [1.5, 3], [1.5, 0]], [s, t, -14], '-w', 18), 'steel');
    g.add(pinEnd([s, t, 14], 2.6, 'w', 0.5), 'steel');
  }
  for (const sd of [1, -1]) { g.add(rollPin([95, -30, 14 * sd], 1.5, sd > 0 ? 'w' : '-w'), 'steel'); g.add(rollPin([80, -33, 14 * sd], 1.5, sd > 0 ? 'w' : '-w'), 'steel'); }

  // ======================================================================== trigger, selector
  const trig = g.part('trigger', { pivot: [95, -30, 0], extras: { axis: 'x', pullDeg: -12 } });
  trig.add(PF([[90.5, -33, 2], [100, -33, 2], [100.5, -44, 0], [98.2, -50, 6], [99.8, -56.6, 1.5], [97.4, -58, 1.2], [93.4, -51, 6],
    [93, -44, 0], [90.5, -39, 2]], { w: 6, bevel: 0.9 }), 'gold');
  const sel = g.part('selector', { pivot: [36, -26, 0], extras: { axis: 'x', safeDeg: -90, autoDeg: 90, note: 'modelled on FIRE' } });
  for (const sd of [1, -1]) {
    sel.add(PF([...arcPts(36, -26, 6.2, 150, 390, 10), [40, -19.6, 1.5], [42.4, -16.6, 2], [29.6, -16.6, 2], [32, -19.6, 1.5]],
      { w: 2.2, cw: 15.3 * sd, bevel: 0.6 }), 'steel_dark');
    sel.add(capScrew([36, -26, 16.4 * sd], 2.2, sd > 0 ? 'w' : '-w', 1), 'steel');
  }

  // ======================================================================== pistol grip
  const GS = 22, GT = -3.6;   // the Sentry-4 grip, moved to this lower
  const gp = (pts) => pts.map(([s, t, r]) => [s + GS, t + GT, r]);
  g.add(PF(gp([[38.5, -40.8, 1], [36, -50, 6], [29.5, -74, 24], [20, -101, 20], [10.6, -122.5, 3], [-31.7, -107.1, 3],
    [-26.3, -83.5, 26], [-11.9, -52.6, 8], [-14, -44, 4], [-19.5, -38.5, 3], [-12, -36.2, 3], [-4, -40.8, 1]]),
  { w: 29.5, bevel: 3.5, bevelSeg: 3, curveSeg: 5 }), 'polymer_grip');
  g.add(PF(gp([[11, -123.2, 0.8], [8.4, -128.8, 3], [-33.9, -113.4, 3], [-32.3, -107.9, 0.8]]), { w: 27.5, bevel: 1.8 }), 'steel_dark');
  // porcelain side scales of the grip with a gilt edge
  for (const sd of [1, -1]) {
    g.add(PF(gp([[28, -56, 4], [22.5, -78, 14], [15, -100, 8], [7, -113, 4], [-20, -103, 4], [-18.5, -84, 12], [-8, -60, 4], [-6, -55, 3]]),
      { w: 2.4, cw: 15.6 * sd, bevel: 0.9, curveSeg: 2 }), 'porcelain');
    g.add(capScrew(gp([[4, -86, 0]])[0].slice(0, 2).concat([17 * sd]), 1.8, sd > 0 ? 'w' : '-w', 0.7), 'gold');
  }

  // ======================================================================== stock (porcelain, skeleton) + buttpad
  g.add(box([-7, 3, 0], [14, 32, 27], { r: 2.5 }), 'steel_dark');   // hinge block
  g.add(lax([[0, 0], [0, 4.4], [1.4, 4.4], [2, 3.6], [2, 0]], [-7, 12, 13.6], 'w', 18), 'steel_bright');
  g.add(lax([[0, 0], [0, 4.4], [1.4, 4.4], [2, 3.6], [2, 0]], [-7, 12, -13.6], '-w', 18), 'steel_bright');
  {
    let stock = PF([[-13, 17, 3], [-13, -34, 3], [-60, -46, 10], [-180, -66, 40], [-292, -91, 5], [-300, -92, 2], [-300, 20.5, 2],
      [-262, 22, 12], [-200, 21, 40], [-90, 18.5, 12]], { w: 30, bevel: 4, bevelSeg: 3, curveSeg: 4,
      holes: [[[-70, -12, 7], [-226, -12, 9], [-232, -44, 14], [-168, -46, 18], [-84, -32, 8]]] });
    g.add(stock, 'porcelain');
    // cobalt cheek riser band and a gilt rim round the skeleton window
    g.add(PF([[-84, 18.8, 2], [-250, 21.9, 4], [-252, 26.2, 3], [-88, 23, 2]], { w: 24, bevel: 1.6 }), 'glaze_cobalt');
    for (const sd of [1, -1]) {
      g.add(PF([[-68, -10.4, 7], [-228, -10.4, 9], [-234, -45.6, 14], [-167, -47.6, 18], [-82, -33.6, 8]], { w: 0.9, cw: 15.2 * sd, bevel: 0.3, bevelSeg: 1,
        holes: [[[-72, -13.4, 6], [-224, -13.4, 8], [-229.6, -42.6, 12], [-169, -44.4, 16], [-86, -30.6, 7]]] }), 'gold');
      g.add(lax([[0, 0], [0, 6.2], [1.6, 6.2], [2.2, 5.6], [2.2, 3.9], [1.2, 3.7], [1.2, 0]], [-282, -40, 15.2 * sd], sd > 0 ? 'w' : '-w', 14), 'steel_bright');
    }
  }
  g.add(PF([[-299, 22.5, 3], [-307, 24, 5], [-315, 20.5, 5], [-315, -93, 5], [-307, -98, 5], [-299, -95, 3]], { w: 36, bevel: 4, bevelSeg: 3 }), 'rubber');
  for (let k = 0; k < 9; k++) g.add(box([-315.4, -82 + k * 12, 0], [0.8, 1.2, 30], { r: 0 }), 'rubber');

  // ======================================================================== fish tail fx_tail (sways about t at the butt)
  {
    const tail = g.part('fx_tail', { pivot: [-296, -32, 0], extras: { open: 7, hinge: 't', note: 'upturned fish tail; v -1..1 sway (driven by the weapon logic)' } });
    const upperLobe = [[-244, 20.5, 0], [-262, 29.5, 22], [-302, 55.5, 22], [-354, 77.5, 2], [-338, 55.5, 14], [-320, 36.5, 10], [-305, 25.5, 3], [-280, 20.5, 0]];
    const lowerLobe = [[-250, -79, 0], [-282, -95, 10], [-326, -124, 2], [-314, -106, 8], [-302, -96, 0]];
    tail.add(PF(upperLobe, { w: 4.2, bevel: 1.4, curveSeg: 5 }), 'glaze_cobalt');
    tail.add(PF(lowerLobe, { w: 3.6, bevel: 1.2, curveSeg: 5 }), 'glaze_cobalt');
    // gilt edge on the leading edges + fin rays fanning from the root (both faces)
    const rays = [];
    for (const sd of [1, -1]) {
      for (const [a, b] of [[[-266, 25.5], [-322, 59.5]], [[-276, 24.5], [-340, 67.5]], [[-286, 23.5], [-333, 49.5]], [[-294, 23.5], [-320, 37.5]]]) {
        rays.push(sweep([[a[0], a[1], 2.1 * sd], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 2, 2.2 * sd], [b[0], b[1], 2.0 * sd]], 0.55, { seg: 6, radial: 4 }));
      }
      for (const [a, b] of [[[-262, -84], [-312, -110]], [[-276, -90], [-318, -114]]]) {
        rays.push(sweep([[a[0], a[1], 1.85 * sd], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 1.5, 1.95 * sd], [b[0], b[1], 1.8 * sd]], 0.5, { seg: 6, radial: 4 }));
      }
    }
    tail.add(merge(rays), 'gold');
    tail.add(sweep([[-244, 21, 0], [-262, 30.5, 0], [-292, 49.5, 0], [-330, 69, 0], [-354, 77.5, 0]], 1.3, { seg: 24, radial: 6 }), 'gold');
    tail.add(sweep([[-250, -79.5, 0], [-282, -95.5, 0], [-326, -124, 0]], 1.1, { seg: 14, radial: 6 }), 'gold');
    // root collar (the fins hinge in a gilt socket on the stock)
    tail.add(box([-288, 22.1, 0], [26, 3, 9], { r: 1.2 }), 'gold');
    tail.add(box([-284, -87, 0], [22, 3, 8], { r: 1.2, rot: [0, 0, 18] }), 'gold');
  }

  // ======================================================================== handguard (steel core) with the scale panels
  const hgO = [[-12, -24, 2.5], [12, -24, 2.5], [19, -16, 2.5], [19, 14, 2.5], [14, 21, 1.5], [11, 23, 0], [-11, 23, 0],
    [-14, 21, 1.5], [-19, 14, 2.5], [-19, -16, 2.5]];
  const hgI = [[-10.6, -21.6, 1.5], [10.6, -21.6, 1.5], [16.6, -14.8, 1.5], [16.6, 12, 1.5], [12, 19, 1], [-12, 19, 1],
    [-16.6, 12, 1.5], [-16.6, -14.8, 1.5]];
  {
    let hg = SC(hgO, HG0, HG1, { bevel: 1.2, holes: [hgI] });
    const hc = [cyl(HG0 - 2, HG1 + 2, 9.4, { t: TT, w: TW, b: 0, seg: 24 })];   // seat for the water tube
    for (const a of [300, 352, 404, 456]) hc.push(PL([[a, -3.6, 3.6], [a + 34, -3.6, 3.6], [a + 34, 3.6, 3.6], [a, 3.6, 3.6]], { h: 8, ct: -21, bevel: 0 }));   // M-LOK, bottom
    for (const a of [430, 478]) hc.push(slotCut(a, a + 30, -6, 6.4, 8, -19));   // M-LOK, left front
    g.add(cut(hg, merge(hc)), 'steel_dark');
  }
  // gilt + chrome end rings
  g.add(washer(HG0 - 1, HG0 + 3, 16, 25, 0.5, 28), 'chrome');
  g.add(washer(HG1 - 2, HG1 + 2, 16, 25.4, 0.5, 28), 'chrome');

  // scale panels s 251..415 on both upper flanks: glow bed in a gilt frame, 6 groups x (2 columns x 4 rows)
  const SC0 = 258, SP = 13, ROWS = [10, 3.5, -3, -9.5];
  for (const sd of [1, -1]) {
    g.add(box([333, 0.25, 19.2 * sd], [168, 30, 0.6], { r: 0.2, seg: 1 }), 'glow_ice');
    // frame: top and bottom gilt rails, front and rear posts
    g.add(box([333, 15.8, 19.5 * sd], [172, 1.6, 1.4], { r: 0.4, seg: 1 }), 'gold');
    g.add(box([333, -15.3, 19.5 * sd], [172, 1.6, 1.4], { r: 0.4, seg: 1 }), 'gold');
    g.add(box([248, 0.25, 19.6 * sd], [2.4, 32.6, 1.6], { r: 0.5, seg: 1 }), 'gold');
    g.add(box([418, 0.25, 19.6 * sd], [2.4, 32.6, 1.6], { r: 0.5, seg: 1 }), 'gold');
    for (const s of [248, 418]) for (const t of [12.5, -12]) g.add(capScrew([s, t, 20.3 * sd], 0.9, sd > 0 ? 'w' : '-w', 0.5, 6), 'steel_bright');
  }
  for (let k = 0; k < 6; k++) {
    const front = SC0 + (2 * k + 1) * SP + 7;
    const grp = g.part(`fx_scale${k + 1}`, { pivot: [front, 0.25, 0], extras: { open: -4, hinge: 'w', order: k, note: 'scale group k (rear -> front): rear edges flick 4° up' } });
    const geo = { glaze_cobalt: [], porcelain: [] };
    for (let c = 2 * k; c < 2 * k + 2; c++) {
      ROWS.forEach((t0, r) => {
        const s0 = SC0 + c * SP + (r % 2) * (SP / 2);
        if (s0 + 7 > 420) return;
        const mat = (c + r) % 2 ? 'porcelain' : 'glaze_cobalt';
        for (const sd of [1, -1]) geo[mat].push(scaleGeo(s0, t0, (20.6 + r * 0.12) * sd, sd));
      });
    }
    for (const [m, list] of Object.entries(geo)) if (list.length) grp.add(merge(list), m);
  }

  // front flank panels s 422..538: porcelain plates with a gilt wave relief
  for (const sd of [1, -1]) {
    g.add(PF([[422, -13.6, 2], [538, -13.6, 2], [538, 15.4, 2], [422, 15.4, 2]], { w: 1.8, cw: 19.7 * sd, bevel: 0.6 }), 'porcelain');
    const wave = [];
    for (let i = 0; i <= 40; i++) {
      const s = 426 + i * 2.75, u = i / 40;
      wave.push([s, 1 + Math.sin(u * Math.PI * 4) * 5 - u * 2, 20.75 * sd]);
    }
    g.add(sweep(wave, 0.55, { seg: 40, radial: 5 }), 'gold');
    // curling crests at the wave tops
    for (const c of [438, 466, 494, 522]) {
      const pts = arcPts(c, 6.4, 3.2, 200, -60, 8).map(([a, b]) => [a, b, 20.75 * sd]);
      g.add(sweep(pts, 0.45, { seg: 8, radial: 4 }), 'gold');
    }
  }

  // ======================================================================== roof ridge (正脊) on top, s 142..546
  g.add(SC([[-9.6, 21.6, 0.5], [9.6, 21.6, 0.5], [10.4, 25, 1], [8.4, 28.6, 1.2], [-8.4, 28.6, 1.2], [-10.4, 25, 1]], 142, 548, { bevel: 0.8 }), 'porcelain');
  for (const sd of [1, -1]) g.add(box([345, 25.2, 10.35 * sd], [406, 1.2, 0.7], { r: 0.25, seg: 1 }), 'gold');
  // 12 筒瓦 (half-round tiles), each lapping onto the next with a bead at its rear end
  for (let i = 0; i < 12; i++) {
    const s0 = 150 + i * 32.6;
    g.add(lathe([[s0, 0], [s0, 8.4], [s0 + 0.8, 9.3], [s0 + 3.6, 9.3], [s0 + 4.4, 8.6], [s0 + 30.8, 8.6], [s0 + 31.4, 8.0], [s0 + 31.4, 0]],
      { t: 28.4, seg: 10, phase: -Math.PI / 2, arc: Math.PI }), 'glaze_jade');
  }
  // 瓦當 end cap facing the shooter: gilt disc, ring and boss
  g.add(lathe([[141, 0], [141, 8.8], [141.8, 9.6], [146, 9.6], [146, 0]], { t: 28.4, seg: 24, phase: -Math.PI / 2, arc: Math.PI }), 'gold');
  g.add(lax([[0, 0], [0, 6.6], [0.8, 6.6], [0.8, 5.2], [0.3, 5.2], [0.3, 2.2], [1.4, 2], [1.8, 0]], [141, 28.6, 0], '-s', 16), 'gold');

  // ======================================================================== barrel + muzzle device (inside the mouth)
  g.add(lathe([[196, 3.9], [196, 9.8], [196.6, 10.4], [262, 10.4], [264, 9.4], [330, 9.0], [610, 8.4], [650, 8.4], [650, 3.9], [196, 3.9]], { seg: 20 }), 'black_chrome');
  {
    // a short 'pearl' compensator held in the jaws: gilt band, ports, bright crown
    let comp = lathe([[650, 3.9], [650, 8.2], [650.6, 8.8], [682, 8.8], [682.6, 8.2], [682.6, 3.9], [650, 3.9]], { seg: 28 });
    const pc = [];
    for (const [a, b] of [[656, 662], [666, 672]]) pc.push(slotCut(a, b, 0, 4.2, 40, 0));
    comp = cut(comp, pc);
    g.add(comp, 'black_chrome');
    g.add(washer(682.2, 686, 4, 8.6, 0.5, 28), 'chrome');
    g.add(washer(651, 654, 8.4, 9.1, 0.4, 28), 'gold');
  }

  // ======================================================================== neck collar (head mount on the handguard end)
  g.add(lathe([[542, 9], [542, 24], [543, 25], [552, 25], [553, 24], [553, 9], [542, 9]], { seg: 28 }), 'porcelain');
  g.add(washer(543.4, 545, 24.6, 25.8, 0.4, 28), 'gold');
  g.add(washer(550, 551.6, 24.6, 25.8, 0.4, 28), 'gold');

  // ======================================================================== 螭吻 head (upper skull, eyes, brows, horns, crest, gill fins)
  // the skull is a lathe about t = HEAD_T, 1.1x wider than tall, cut flat at the mouth roof (t 9.1); features are
  // placed on its surface with hwS(s, t) (half width), the jaw's with hwJ(s, t)
  const HEAD_T = 22, ROOF = 9.1, FLOOR = -9.5;
  const SKULL = [[548, 0], [548, 12], [556, 17.6], [570, 21.2], [592, 23], [612, 23.4], [628, 22], [640, 19], [652, 17.4], [666, 16.8], [680, 16.4], [690, 15.2], [696, 12.8], [699.4, 8.4], [700.6, 0]];   // broad blunt dragon snout
  const JAWP = [[600, 0], [602, 9.4], [612, 12.6], [640, 13.6], [668, 13], [688, 11.6], [697, 8.6], [701, 4], [702, 0]];
  const rAt = (prof, s) => { for (let i = 1; i < prof.length; i++) { const [s0, r0] = prof[i - 1], [s1, r1] = prof[i]; if (s1 > s0 && s <= s1) return r0 + (r1 - r0) * Math.max(0, (s - s0) / (s1 - s0)); } return 0; };
  const SKW = 1.16, SKH = 0.95;   // skull scale: broad, a little flat
  const hwS = (s, t) => { const r = rAt(SKULL, s), d = (t - HEAD_T) / SKH; return r > Math.abs(d) ? Math.sqrt(r * r - d * d) * SKW : 0; };
  const hwJ = (s, t) => { const r = rAt(JAWP, s), d = (t + 13) / 0.92; return r > Math.abs(d) ? Math.sqrt(r * r - d * d) * 1.18 : 0; };
  {
    let skull = lathe(SKULL, { t: HEAD_T, seg: 24 });
    skull = xform(skull, { scale: [1, SKH, SKW], pivot: [600, HEAD_T, 0] });
    const ew = hwS(626, 32);
    skull = cut(skull, [
      cutters.box([630, ROOF - 10.5, 0], [190, 21, 70]),                                       // flat mouth roof
      sphere([626, 32, ew - 2], 6.4, { seg: 16 }), sphere([626, 32, -(ew - 2)], 6.4, { seg: 16 }),   // eye sockets
    ]);
    g.add(skull, 'porcelain');
    // red-lacquer palate under the roof (follows the mouth outline)
    const pal = [];
    for (let s = 606; s <= 690; s += 8) pal.push([s, Math.max(1, hwS(s, ROOF) - 1.4)]);
    g.add(PL([...pal.map(([s, w]) => [s, w, 0]), ...pal.slice().reverse().map(([s, w]) => [s, -w, 0])], { h: 1.2, ct: ROOF - 0.7, bevel: 0.3 }), 'lacquer_red');
    // bulbous nose pad on the snout with two flared nostrils (tilted up), gilt rims
    g.add(sphere([683, 35.6, 0], 6.5, { scale: [1.3, 0.62, 1.75], seg: 16 }), 'porcelain');
    for (const sd of [1, -1]) {
      g.add(xform(lathe([[0, 1.3], [0, 3.1], [1.8, 2.9], [2.4, 2.1], [2.4, 1.3], [0, 1.3]], { seg: 12 }), { rot: [25, 0, 0], move: [689.5, 35.8, 5.6 * sd] }), 'porcelain');
      g.add(xform(lathe([[0, 2.7], [0, 3.5], [0.7, 3.3], [0.9, 2.7], [0, 2.7]], { seg: 12 }), { rot: [25, 0, 0], move: [691.6, 36.8, 5.6 * sd] }), 'gold');
    }
    for (const sd of [1, -1]) {
      // eye: crystal in a gilt socket ring, a flame-like gilt brow over it
      g.add(sphere([626, 32, (ew - 3) * sd], 5.6, { seg: 14 }), 'crystal');
      g.add(xform(lathe([[0, 5.8], [0, 7.4], [0.8, 7.6], [1.8, 6.9], [1.8, 5.8], [0, 5.8]], { seg: 20 }), { rot: [0, sd > 0 ? -90 : 90, 0], move: [626, 32, (ew - 0.6) * sd] }), 'gold');
      // flame brow: three gilt tongues over the eye, leaning out
      const bw = hwS(626, 38.5) - 0.4;
      g.add(xform(PF([[648, 34.6, 1], [642, 38.4, 2], [638, 43.4, 0], [632, 39.8, 2], [625, 47, 0], [619, 41.8, 2], [610, 50.4, 0], [604, 43.4, 2], [608, 38.6, 2], [628, 36.2, 2]],
        { w: 2.2, cw: bw * sd, bevel: 0.7, curveSeg: 2 }), { rot: [0, 0, -16 * sd], pivot: [626, 37, bw * sd] }), 'gold');
      // whisker curls from the lip corners (short; the 焚海 twin grows the long sensing whiskers)
      const ww = hwS(676, 13);
      g.add(sweep([[678, 13.4, (ww - 0.6) * sd], [669, 10.4, (ww + 3.4) * sd], [659, 12, (ww + 6.2) * sd], [653, 16.6, (ww + 6.6) * sd], [656, 20, (ww + 5.4) * sd]], 0.95, { seg: 14, radial: 5 }), 'gold');
      // horns: back and up off the crown, curling at the tips
      g.add(sweep([[604, 43, 8 * sd], [590, 48.5, 10.5 * sd], [574, 51.2, 13 * sd], [561, 49.8, 15.6 * sd], [553, 45.6, 16.8 * sd]], 2.4, { seg: 18, radial: 7 }), 'gold');
      g.add(sphere([552.6, 45, 17 * sd], 2.6, { seg: 10 }), 'gold');
      // gill fins flaring behind the cheeks (the fish half of the 螭吻), cobalt with gilt rays
      const gw = hwS(592, 20) - 0.6;
      g.add(PF([[600, 27, 2], [588, 35, 8], [566, 38, 10], [544, 33, 4], [534, 25.5, 0], [548, 21, 4], [537, 13, 0], [552, 8, 4], [574, 5.5, 8], [597, 12, 3]], { w: 2.6, cw: gw * sd, bevel: 0.9, curveSeg: 2 }), 'glaze_cobalt');
      for (const [a, b] of [[[594, 25], [546, 31]], [[594, 20], [540, 24]], [[594, 15], [542, 13]], [[592, 10.5], [554, 8.5]]]) g.add(sweep([[a[0], a[1], (gw + 1.45) * sd], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.8, (gw + 1.55) * sd], [b[0], b[1], (gw + 1.45) * sd]], 0.55, { seg: 5, radial: 4 }), 'gold');
      // cheek plate below the roof, jaw-hinge boss with a gilt rim and a rivet
      g.add(PF([[586, 12, 2], [616, 11, 3], [612, -6, 5], [598, -10, 5], [588, -2, 3]], { w: 3, cw: 16.2 * sd, bevel: 1 }), 'porcelain');
      g.add(lax([[0, 0], [0, 7.4], [1.2, 7.4], [2.4, 6.6], [2.6, 0]], [604, -4, 17.6 * sd], sd > 0 ? 'w' : '-w', 24), 'porcelain');
      g.add(xform(lathe([[0, 6.4], [0, 7.8], [0.8, 8], [1.4, 7.4], [1.4, 6.4], [0, 6.4]], { seg: 24 }), { rot: [0, sd > 0 ? -90 : 90, 0], move: [604, -4, 18.4 * sd] }), 'gold');
      g.add(lax([[0, 0], [0, 2], [0.9, 1.6], [1.2, 0]], [604, -4, 20.2 * sd], sd > 0 ? 'w' : '-w', 12), 'gold');
    }
    // gilt upper lip all round the mouth (one sweep, right corner -> snout -> left corner)
    const lipS = [606, 616, 626, 636, 646, 656, 666, 676, 684, 690, 694];
    const lipR = lipS.map((s) => [s, ROOF + 0.2, hwS(s, ROOF) + 0.15]);
    g.add(sweep([...lipR, [696.2, ROOF + 0.3, 0], ...lipR.slice().reverse().map(([s, t, w]) => [s, t, -w])], 1.1, { seg: 48, radial: 6 }), 'gold');
    // teeth hang from the lip where they clear the compensator (w > ~9.5); a fang each side
    const teeth = [];
    for (const sd of [1, -1]) for (const [s, L] of [[624, 2.6], [632, 2.8], [640, 3], [648, 2.8], [656, 2.8], [664, 3], [672, 3], [683, 5.2]]) {
      teeth.push(xform(lathe([[0, 0], [0, 1.15], [L, 0]], { seg: 6 }), { rot: [-90, 0, 0], move: [s, ROOF + 0.1, (hwS(s, ROOF) - 1.5) * sd] }));
    }
    g.add(merge(teeth), 'porcelain');
    // dorsal crest along the head top (cobalt) with a gilt edge
    g.add(PF([[642, 40.4, 2], [632, 46.6, 3], [624, 43.4, 1], [612, 50, 3], [602, 45.8, 1], [590, 51.4, 3], [578, 46, 1], [566, 50.4, 3], [558, 40, 2], [570, 38.6, 0], [640, 37.4, 0]],
      { w: 3.2, bevel: 1, curveSeg: 4 }), 'glaze_cobalt');
    g.add(sweep([[642, 40.6, 0], [632, 46.8, 0], [624, 43.6, 0], [612, 50.2, 0], [602, 46, 0], [590, 51.6, 0], [578, 46.2, 0], [566, 50.6, 0], [558, 40.2, 0]], 0.75, { seg: 36, radial: 5, tension: 0.2 }), 'gold');
  }
  // lower jaw fx_jaw (hinge at the cheek bosses): 3° a shot, 25° for the beam / ultimate (extras.open = -25)
  {
    const jaw = g.part('fx_jaw', { pivot: [604, -4, 0], extras: { open: -25, hinge: 'w', note: 'lower jaw: v 0.12 per shot (3°), 1 = 25° open' } });
    let lj = lathe(JAWP, { t: -13, seg: 20 });
    lj = xform(lj, { scale: [1, 0.92, 1.18], pivot: [650, -13, 0] });
    lj = cut(lj, [cutters.box([650, FLOOR + 10, 0], [140, 20, 60])]);   // mouth floor
    jaw.add(lj, 'porcelain');
    // arms up to the hinge (inside the cheek plates)
    for (const sd of [1, -1]) jaw.add(PF([[597, 0, 2], [610, 0, 2], [628, -10, 3], [616, -15, 4], [598, -9, 3]], { w: 2.6, cw: 13 * sd, bevel: 0.8 }), 'porcelain');
    // tongue (red lacquer), gilt lower lip, teeth, chin barbels
    const tg = [];
    for (let s = 618; s <= 690; s += 8) tg.push([s, Math.max(1.5, Math.min(7.5, hwJ(s, FLOOR) - 2.4))]);
    jaw.add(PL([...tg.map(([s, w]) => [s, w, 0]), ...tg.slice().reverse().map(([s, w]) => [s, -w, 0])], { h: 1, ct: FLOOR + 0.35, bevel: 0.3 }), 'lacquer_red');
    const llS = [608, 618, 630, 642, 654, 666, 676, 684, 690, 695, 698];
    const llR = llS.map((s) => [s, FLOOR - 0.1, hwJ(s, FLOOR) + 0.1]);
    jaw.add(sweep([...llR, [699.6, FLOOR, 0], ...llR.slice().reverse().map(([s, t, w]) => [s, t, -w])], 1.0, { seg: 48, radial: 6 }), 'gold');
    const teeth = [];
    for (const sd of [1, -1]) {
      for (const [s, L] of [[652, 2.4], [662, 2.6], [672, 2.6], [680, 4.4], [688, 2.4]]) teeth.push(xform(lathe([[0, 0], [0, 1.1], [L, 0]], { seg: 6 }), { rot: [90, 0, 0], move: [s, FLOOR - 0.1, (hwJ(s, FLOOR) - 1.3) * sd] }));
      jaw.add(sweep([[682, -22, 5 * sd], [678, -27, 6.5 * sd], [672, -30, 6 * sd], [668, -28, 5 * sd]], 0.9, { seg: 8, radial: 5 }), 'gold');
    }
    jaw.add(merge(teeth), 'porcelain');
  }

  // ======================================================================== water tube (hero focus) on the lower right of the handguard
  g.add(tube(TS0 + 6, TS1 - 6, 8, 7.3, { t: TT, w: TW, seg: 24 }), 'glass_clear');
  {
    const water = g.part('fx_tube', { pivot: [392, TT, TW], extras: { pv: { preset: 'pv_core', coreMode: 2, coreScale: 3 }, note: 'water column (pv_core mode 2)' } });
    water.add(cyl(TS0 + 7, TS1 - 7, 6.2, { t: TT, w: TW, seg: 20 }), 'glass');
    // bubbles riding a 3-start helix between the water core and the glass: spinning it = the water flowing
    const flow = g.part('fx_flow', { pivot: [392, TT, TW], extras: { spin: 's', rate: 1380, note: 'bubble helix (pitch 130 mm): spinMul 1 = water flowing 0.5 m/s' } });
    const bub = [];
    for (let k = 0; k < 3; k++) for (let i = 0; i < 11; i++) {
      const u = i / 10, s = TS0 + 12 + u * (TS1 - TS0 - 24), a = k * 2.094 + u * Math.PI * 4;
      const r = 0.6 + ((i * 7 + k * 3) % 5) * 0.09;   // faceted beads: few triangles, they glint as they turn
      bub.push(lax([[-r, 0], [0, r], [r, 0]], [s, TT + Math.cos(a) * 6.75, TW + Math.sin(a) * 6.75], 's', 5));
    }
    flow.add(merge(bub), 'crystal');
  }
  // brass end fittings (union nuts) with clamp tabs, 2 screws each; elbows feeding the water into the handguard
  for (const [s0, dir] of [[TS0, 1], [TS1, -1]]) {
    const a = dir > 0 ? s0 : s0 - 12, b = dir > 0 ? s0 + 12 : s0;
    g.add(lathe([[a, 6], [a, 9.6], [a + 0.8, 10.4], [b - 0.8, 10.4], [b, 9.6], [b, 6], [a, 6]], { t: TT, w: TW, seg: 6 }), 'brass');
    g.add(washer(dir > 0 ? b - 0.2 : a - 1.6, dir > 0 ? b + 1.6 : a + 0.2, 7.6, 9.2, 0.3, 16, TT, TW), 'brass');
    g.add(sweep([[s0 + dir * 4, TT + 7, TW - 3], [s0 + dir * 4, TT + 11, TW - 6], [s0 + dir * 4, TT + 13, TW - 12]], 2.6, { seg: 8, radial: 8 }), 'brass');
    g.add(PF([[s0 + dir * 1, -26, 1], [s0 + dir * 11, -26, 1], [s0 + dir * 11, -15, 1], [s0 + dir * 1, -15, 1]].map(([x, y, r]) => [x, y, r]), { w: 2, cw: 19.6, bevel: 0.6 }), 'brass');
    for (const t of [-23, -18]) g.add(capScrew([s0 + dir * 6, t, 20.6], 1.4, 'w', 0.7, 6), 'steel_bright');
  }
  // two mid clamps (chrome bands round the glass) screwed to the handguard
  for (const s of [340, 444]) {
    g.add(washer(s - 3, s + 3, 8, 9.2, 0.4, 16, TT, TW), 'chrome');
    g.add(box([s, -17, 18.4], [6, 4, 3], { r: 0.6, seg: 1 }), 'chrome');
    g.add(capScrew([s, -17, 19.9], 1.2, 'w', 0.6, 6), 'steel_bright');
  }

  // ======================================================================== holographic sight on the rear rail
  {
    const B = 30;   // rail top
    g.add(PF([[26, B, 1], [128, B, 1], [128, B + 7, 2], [26, B + 7, 2]], { w: 26, bevel: 1.2 }), 'steel_dark');   // base
    g.add(PF([[28, B + 6, 2], [66, B + 6, 2], [66, B + 26, 3], [32, B + 26, 5], [28, B + 20, 3]], { w: 30, bevel: 2 }), 'steel_dark');   // battery / control body
    // hood: two side walls + bridge, window frames
    for (const sd of [1, -1]) {
      g.add(PF([[66, B + 6, 1.5], [128, B + 6, 1.5], [128, B + 50, 3], [104, B + 53, 5], [70, B + 51, 5], [66, B + 26, 1.5]], { w: 4, cw: 16.4 * sd, bevel: 1.2,
        holes: [[[74, B + 19, 4], [120, B + 19, 4], [120, B + 43, 6], [74, B + 43, 6]]] }), 'steel_dark');
      g.add(capScrew([118, B + 10, 18.6 * sd], 1.4, sd > 0 ? 'w' : '-w', 0.6, 6), 'steel_bright');
      g.add(capScrew([72, B + 10, 18.6 * sd], 1.4, sd > 0 ? 'w' : '-w', 0.6, 6), 'steel_bright');
    }
    g.add(PF([[68, B + 48.4, 3], [128, B + 48.4, 3], [128, B + 53, 3], [70, B + 53, 3]], { w: 36.8, bevel: 1.4 }), 'steel_dark');
    g.add(PF([[68, B + 52.4, 2], [128, B + 52.4, 2], [128, B + 53.4, 1], [70, B + 53.4, 1]], { w: 37.2, bevel: 0.3 }), 'gold');
    g.add(box([97, B + 10.5, 0], [62, 9, 28.8], { r: 1.2, seg: 1 }), 'steel_dark');   // lower housing under the window (laser diode, electronics)
    // window frames (front + rear) and glass
    for (const s of [76, 124]) {
      g.add(SC([[-14.4, B + 14], [14.4, B + 14], [14.4, B + 49], [-14.4, B + 49]], s - 2, s + 2, { bevel: 0.6, bevelSeg: 1,
        holes: [[[-12.2, B + 18, 2.5], [12.2, B + 18, 2.5], [12.2, B + 46, 3], [-12.2, B + 46, 3]]] }), 'steel_dark');
      g.add(box([s, B + 32, 0], [0.8, 28, 24.4], { r: 0.2, seg: 1 }), 'lens');
    }
    // reticle on the front window: cold-cyan ring + dot (the house colour)
    g.add(xform(lathe([[0, 2.6], [0, 3.1], [0.3, 3.1], [0.3, 2.6], [0, 2.6]], { seg: 32 }), { move: [123.2, AIM, 0] }), 'glow_ice');
    g.add(sphere([123.4, AIM, 0], 0.32, { seg: 8 }), 'glow_ice');
    // control buttons (rear) and the QD lever (left)
    for (const t of [B + 12, B + 19]) g.add(box([27, t, 0], [2.4, 4.6, 9], { r: 1, seg: 1 }), 'rubber');
    g.add(lax([[0, 0], [0, 7], [8, 7], [8.6, 6.4], [8.6, 0]], [46, B + 15, -15], '-w', 24), 'steel_dark');
    g.add(PF(gearPts(46, B + 15, 7.4, 6.8, 18), { w: 2, cw: -24.4, bevel: 0.3 }), 'steel_bright');
    g.add(PF([[90, B + 1, 2], [112, B + 1, 2], [114, B + 5, 2], [92, B + 6, 2]], { w: 3, cw: -15, bevel: 0.8 }), 'steel_bright');
    g.add(stamp('TW-1', [62, B + 17, -15], { px: 0.5, side: -1 }), 'steel_dark');
  }

  // ======================================================================== transparent water-tank magazine (40 rds)
  const mag = g.part('mag', { pivot: [160, -13, 0], extras: { drop: true } });
  {
    mag.add(PF([[121.6, -13, 1.5], [198.4, -13, 1.5], [200, -168, 4], [120, -168, 4]], { w: 29, bevel: 2.4, bevelSeg: 2 }), 'glass_clear');
    // steel frame: front and rear spines, base plate (2 screws), feed lips
    mag.add(PF([[196.6, -16, 1], [201.4, -16, 1], [203.2, -170, 2], [198.4, -170, 2]], { w: 23, bevel: 0.8 }), 'steel_dark');
    mag.add(PF([[118.6, -16, 1], [123.4, -16, 1], [121.6, -170, 2], [116.8, -170, 2]], { w: 23, bevel: 0.8 }), 'steel_dark');
    mag.add(PF([[114, -167, 2], [206, -167, 2], [206, -176, 3], [114, -176, 3]], { w: 32, bevel: 1.6 }), 'steel_dark');
    for (const s of [134, 186]) mag.add(capScrew([s, -176.2, 0], 1.6, '-t', 0.6), 'steel_bright');
    for (const sd of [1, -1]) mag.add(box([150, -14.6, 11.2 * sd], [52, 3.2, 2.6], { r: 0.8 }), 'steel_dark');
    for (let k = 0; k < 6; k++) mag.add(box([202.2, -50 - k * 20, 0], [1.2, 0.8, 10], { r: 0 }), 'steel_bright');   // level ticks
    // the top rounds (staggered), above the water line
    for (const [t, w] of [[-19.8, 2.6], [-27.4, -2.8], [-34.8, 2.6]]) {
      mag.add(lathe([[125, 0], [125, 5.6], [125.8, 5.9], [126.6, 5.9], [127.2, 5.3], [128.6, 5.3], [129.2, 6], [168, 5.7], [171.5, 4.4], [177, 4.3], [177, 0]], { t, w, seg: 12 }), 'brass');
      mag.add(lathe([[176.8, 0], [176.8, 3.95], [183, 3.95], [188, 3.1], [192, 1.5], [194, 0.3], [194.2, 0]], { t, w, seg: 12 }), 'copper');
    }
    const mw = g.part('fx_magwater', { parent: 'mag', pivot: [160, -100, 0], extras: { pv: { preset: 'pv_core', coreMode: 2, coreScale: 1.6 }, note: 'water in the tank magazine' } });
    mw.add(PF([[124, -41, 2], [196, -41, 2], [197.4, -165, 3], [122.6, -165, 3]], { w: 24.4, bevel: 1.6 }), 'glass');
  }

  // ======================================================================== sockets & meta
  g.socket('muzzle', [MUZZLE, 0, 0]);
  g.socket('eject', [154, 2, 15.5], { dir: [0.2, 0.45, 1] });
  g.socket('grip_r', [1 + GS, -80 + GT, 0], { rot: [0, 0, -20] });
  g.socket('grip_l', [338, -24, 0]);
  g.socket('magwell', [164, -82, 0]);
  g.socket('charge', [214, 6, -26]);
  g.socket('optic', [123, AIM, 0], { type: 'holo', zoom: 1.25 });
  g.socket('whiskerL', [676, 13, -12.6]);     // S_whiskerL / R: twin 焚海 whisker roots (cheeks)
  g.socket('whiskerR', [676, 13, 12.6]);
  g.socket('mouth', [676, 0, 0]);             // bubbles, water mist, beam origin
  g.socket('eye_r', [618, 30.5, 22]);
  g.socket('eye_l', [618, 30.5, -22]);
  g.socket('tube', [392, TT, TW + 8]);        // middle of the water tube (outside face)
  g.socket('tube_a', [TS0 + 10, TT, TW]);
  g.socket('tube_b', [TS1 - 10, TT, TW]);
  g.socket('ridge', [300, 37, 0]);
  g.socket('scales_r', [333, 0, 22]);
  g.socket('scales_l', [333, 0, -22]);
  g.socket('tail', [-330, 60, 0]);
  g.meta({
    grip: 'rifle', support: 'handguard', reload: 'mag', chargeSide: 'left', series: 'jiuzi',
    notes: 'M07 螭吻. fx_jaw hinge w (open -25: v 0.12 = 3° per shot, 1 = beam / ult). fx_scale1..6: groups rear -> front, '
      + 'open -4 about w (rear edges flick up), order = k. fx_tail: open 7 about t, driven -1..1 (sway). fx_tube: pv_core water; '
      + 'fx_flow: bubble helix, spin s (spinMul = flow speed). mag: clear tank + fx_magwater (pv_core).',
  });
  return g;
}
