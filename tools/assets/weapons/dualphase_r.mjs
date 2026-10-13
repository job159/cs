// 雙相-R Dual-Phase R — 反災 DUALPHASE series rifle (docs/PREMIUM_WEAPONS.md §2.0.4, §4.2 row 0.9; 03 §5.5).
// The pipeline-validation premium weapon: the Sentry-4 (m4.mjs) M4 / HK416-pattern carbine re-worked by the
// anti-calamity armoury. Rear half of the handguard replaced by a reactor module:
//   - reactor housing with an amber core (fx_core: finned sleeve round the barrel) behind two side shells
//     (fx_shell_l / fx_shell_r) that slide 8 mm apart when 過相 Overphase starts (guide rods stay visible);
//   - a dual-ring gimbal in front of it (the series' signature, 機匣雙環陀螺儀): outer gimbal fx_gimbal_a (amber)
//     on a fixed yoke at ±w, inner gimbal fx_gimbal_b (cold cyan) pinned inside it at ±t. Modelled MISALIGNED
//     (outer tilted 24° about w, inner 18° about its own t); `open` 1 locks both coaxial (ready). Each race
//     carries a glowing rotor band (fx_rotor_a / fx_rotor_b) that spins about the ring normal.
//   - cold-cyan light veins inlaid in the upper receiver flanks and the handguard top chamfers, a 6-cell LED phase
//     meter on the left of the upper (fx_led1..6 cyan + fx_ledr amber "phase" cell), a hexagonal compensator
//     with a bright crown (the series' hexagonal muzzle crown).
// Materials 60 / 30 / 10: matte black (alu, steel_dark, polymer) / bright silver (chrome races, steel_bright
// bands, bezels) / glow (glow_ice cyan, glow_gold amber).
// Side view, mm: s forward from the rear face of the upper receiver, t up from the bore axis, w right.
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
const capScrew = (at, r, axis = 'w', d = 1.4, seg = 12) =>
  lax([[0, 0], [0, r], [d * 0.62, r], [d, r - 0.35], [d, r * 0.52], [d - 0.7, r * 0.5], [d - 0.7, 0]], at, axis, seg);
const hexHead = (at, r, axis = 'w', d = 1.6) => lax([[0, 0], [0, r], [d - 0.35, r], [d, r - 0.35], [d, 0]], at, axis, 6);
const pinEnd = (at, r, axis = 'w', d = 0.6) => lax([[0, 0], [0, r], [d, r - 0.2], [d, 0]], at, axis, 14);
const rollPin = (at, r, axis = 'w', d = 0.5) => lax([[0, 0], [0, r], [d, r - 0.15], [d, r * 0.55], [d - 0.4, r * 0.5], [d - 0.4, 0]], at, axis, 14);
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
/** washer (flat ring) round the bore axis: s0..s1, radii r0..r1, chamfer b */
const washer = (s0, s1, r0, r1, b = 0.5, seg = 36) => lathe([[s0, r0 + b], [s0, r1 - b], [s0 + b, r1], [s1 - b, r1], [s1, r1 - b], [s1, r0 + b], [s1 - b, r0], [s0 + b, r0], [s0, r0 + b]], { seg });
/** arc band in the (w, t) plane about the +w axis (sd = 1) or -w (sd = -1): radii r0..r1, half angle a deg */
const arcBand = (r0, r1, a, sd = 1, n = 12) => {
  const pts = [];
  for (let i = 0; i <= n; i++) { const q = (-a + (2 * a * i) / n) * Math.PI / 180; pts.push([sd * r1 * Math.cos(q), r1 * Math.sin(q)]); }
  for (let i = n; i >= 0; i--) { const q = (-a + (2 * a * i) / n) * Math.PI / 180; pts.push([sd * r0 * Math.cos(q), r0 * Math.sin(q)]); }
  return sd > 0 ? pts : pts.reverse();
};

// 3x5 pixel font for raised roll-marks (+ H, V, W, K for the series markings)
const FONT = {
  A: ['010', '101', '111', '101', '101'], C: ['111', '100', '100', '100', '111'], D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'], F: ['111', '100', '110', '100', '100'], H: ['101', '101', '111', '101', '101'], I: ['111', '010', '010', '010', '111'],
  K: ['101', '101', '110', '101', '101'], L: ['100', '100', '100', '100', '111'], M: ['101', '111', '111', '101', '101'], N: ['110', '101', '101', '101', '101'],
  O: ['111', '101', '101', '101', '111'], P: ['111', '101', '111', '100', '100'], R: ['110', '101', '110', '101', '101'],
  S: ['111', '100', '111', '001', '111'], T: ['111', '010', '010', '010', '010'], U: ['101', '101', '101', '101', '111'], V: ['101', '101', '101', '101', '010'],
  W: ['101', '101', '111', '111', '101'], Y: ['101', '101', '010', '010', '010'], '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'], '3': ['111', '001', '011', '001', '111'], '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '110'], '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '001', '010', '010'],
  '8': ['111', '101', '111', '101', '111'], '9': ['111', '101', '111', '001', '111'], '-': ['000', '000', '111', '000', '000'],
  '.': ['000', '000', '000', '000', '010'], ' ': ['000', '000', '000', '000', '000'],
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
// series emblem: two offset half-rings, the "dual phase" (original)
const PHASE = ['0110000', '1000000', '1000110', '1000001', '0110001', '0000001', '0000110'];

// gimbal geometry (s = 268 plane, misaligned rest pose; see the header)
const GY = 268;                      // gimbal centre on the bore axis
const TILT_A = 24, TILT_B = 18;      // outer tilt about w, inner tilt about its own t (deg)
const RA = [39.4, 45.2], RB = [32.4, 37.6];
const tiltA = (geo) => xform(geo, { rot: [TILT_A, 0, 0], pivot: [GY, 0, 0] });
const tiltB = (geo) => xform(geo, { rot: [TILT_A, TILT_B, 0], pivot: [GY, 0, 0] });
// rest-frame axes (s, t, w) of the tilted rings: the inner gimbal's hinge (outer-frame t) and both ring normals
const DEG = Math.PI / 180;
const T_A = [-Math.sin(TILT_A * DEG), Math.cos(TILT_A * DEG), 0];
const N_A = [Math.cos(TILT_A * DEG), Math.sin(TILT_A * DEG), 0];
const N_B = [Math.cos(TILT_A * DEG) * Math.cos(TILT_B * DEG), Math.sin(TILT_A * DEG) * Math.cos(TILT_B * DEG), -Math.sin(TILT_B * DEG)];
const r4 = (a) => a.map((v) => +v.toFixed(4));

// ------------------------------------------------------------------------------------------ model

export default function build() {
  const g = new Gun('dualphase_r');
  const RAIL_T = 23;
  const AIM = 65;
  const MUZZLE = 565;

  // ======================================================================== upper receiver (with light-vein grooves)
  const upperSec = [[-14.5, -13, 1], [14.5, -13, 1], [14.5, 11, 2.5], [12.2, 17, 1.5], [10.6, 18.8, 0.5], [10.6, 23.6, 0],
    [-10.6, 23.6, 0], [-10.6, 18.8, 0.5], [-12.2, 17, 1.5], [-14.5, 11, 2.5]];
  let upper = SC(upperSec, 0, 178, { bevel: 1.2 });
  upper = cut(upper, [
    PF([[88, -8, 2.5], [150, -8, 2.5], [150, 8.5, 2.5], [88, 8.5, 2.5]], { w: 40, cw: 9, bevel: 0 }), // ejection port + raceway
    cutters.box([145, -12.5, 0], [64.6, 17, 23.4]),                                                          // magazine / feed opening
    cutters.box([22, 20.7, 0], [54, 6.4, 10.8]),                                                             // charging-handle channel
    PF([[8, 6, 1], [98, 6, 1], [98, 8.2, 1], [8, 8.2, 1]], { w: 2, cw: -14.5, bevel: 0 }),                   // vein groove, left
    PF([[8, 6, 1], [84, 6, 1], [84, 8.2, 1], [8, 8.2, 1]], { w: 2, cw: 14.5, bevel: 0 }),                    // vein groove, right
  ]);
  g.add(upper, 'alu');
  g.add(lightRail(0, 178, RAIL_T), 'alu');
  // cold-cyan light veins sunk 0.3 mm in the grooves (framed by the groove walls)
  g.add(box([53, 7.1, -14.05], [89, 1.5, 0.7], { r: 0.25, seg: 1 }), 'glow_ice');
  g.add(box([46, 7.1, 14.05], [75, 1.5, 0.7], { r: 0.25, seg: 1 }), 'glow_ice');
  // vein terminals: small bright-silver studs at both ends of each vein
  for (const [s, sd] of [[8.6, -1], [97.4, -1], [8.6, 1], [83.4, 1]]) g.add(lax([[0, 0], [0, 1.6], [0.5, 1.5], [0.7, 0]], [s, 7.1, 14.4 * sd], sd > 0 ? 'w' : '-w', 12), 'steel_bright');

  // forward assist, deflector, dust-cover hinge (as the Sentry-4)
  const fa = (geo) => xform(geo, { rot: [0, 7, 0], move: [1.5, 7.5, 16.4] });
  g.add(fa(lathe([[0, 0], [0, 7.6], [0.8, 8.6], [36, 8.6], [50, 7], [58, 3.5], [58.5, 0]], { seg: 24 })), 'alu');
  g.add(fa(lathe([[-5.4, 0], [-5.4, 1.6], [-4.9, 2.1], [-5.4, 2.7], [-5.4, 3.9], [-4.9, 4.4], [-5.4, 5], [-5.3, 6.2], [-4.7, 7.3],
    [-3.6, 8], [-1.5, 8.1], [0.6, 8.1], [0.6, 0]], { seg: 20 })), 'steel_bright');
  g.add(PL([[64, 13.8], [90, 13.8], [90, 17, 0.8], [86.5, 21.6, 2], [75, 21, 4], [66, 17.2, 3]], { h: 12, ct: 8.5, bevel: 1 }), 'alu');
  for (const s of [82, 156]) g.add(box([s, -10.6, 15], [6, 5.2, 4], { seg: 1, r: 1 }), 'alu');
  g.add(cyl(78, 160, 1.0, { t: -10.6, w: 15.4, seg: 10 }), 'steel');
  {
    const pts = [];
    for (let i = 0; i <= 72; i++) { const a = (i / 72) * Math.PI * 2 * 6; pts.push([112 + (14 * i) / 72, -10.6 + 1.6 * Math.cos(a), 15.4 + 1.6 * Math.sin(a)]); }
    g.add(sweep(pts, 0.32, { seg: 60, radial: 4 }), 'steel_dark');
  }
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

  // ======================================================================== LED phase meter (left of the upper)
  // bright bezel with 6 cells (cyan, fill with the phase charge) + an amber "phase" cell that lights when ready;
  // dark lenses always, the lit LEDs are separate fx_ parts the weapon logic shows / hides
  {
    const cellS = (k) => 32 + k * 7.4;           // cell k left edge (s)
    const holes = [];
    for (let k = 0; k < 7; k++) holes.push([[cellS(k), -6.4, 0.8], [cellS(k) + 5.6, -6.4, 0.8], [cellS(k) + 5.6, 0.4, 0.8], [cellS(k), 0.4, 0.8]]);
    g.add(PF([[29, -8.6, 1.4], [86.4, -8.6, 1.4], [86.4, 2.6, 1.4], [29, 2.6, 1.4]], { w: 1.2, cw: -15.05, bevel: 0.35, holes }), 'steel_bright');
    for (let k = 0; k < 7; k++) g.add(box([cellS(k) + 2.8, -3, -14.62], [5.8, 7, 0.3], { r: 0 }), 'lens');
    for (let k = 0; k < 7; k++) {
      const led = g.part(k < 6 ? `fx_led${k + 1}` : 'fx_ledr', { pivot: [cellS(k) + 2.8, -3, -14.8], extras: { order: k, note: 'LED cell: shown / hidden by the overphase logic' } });
      led.add(box([cellS(k) + 2.8, -3, -14.82], [5.0, 6.2, 0.3], { r: 0.2, seg: 1 }), k < 6 ? 'glow_ice' : 'glow_gold');
    }
    for (const s of [30.6, 84.8]) g.add(capScrew([s, -3, -15.65], 0.9, '-w', 0.5, 10), 'steel_dark');
  }

  // ======================================================================== bolt group (charging handle + carrier)
  const bolt = g.part('bolt', { pivot: [-8, 21, 0], extras: { travel: 0.07 } });
  bolt.add(PL([[-0.6, -8.9, 0.3], [-0.6, 8.9, 0.3], [-3.6, 10.4, 1.4], [-3.6, 22.4, 2], [-6.2, 25.6, 2.6], [-11.6, 24.6, 4],
    [-14.4, 16, 6], [-14.4, -8.9, 0.4]], { h: 6.4, ct: 21, bevel: 0.7 }), 'steel_bright');
  bolt.add(PL([[-1.4, -9.5, 0.3], [-14.4, -9.5, 0.4], [-14.4, -16, 6], [-11.6, -24.6, 4], [-6.2, -25.6, 2.6], [-3.6, -22.4, 2],
    [-3.6, -10.6, 1]], { h: 6.4, ct: 21, bevel: 0.7 }), 'steel_bright');
  for (let k = 0; k < 5; k++) bolt.add(box([-9.5, 24.4, -13 - k * 2.3], [7, 0.7, 1], { seg: 1, r: 0.2 }), 'steel_bright');
  bolt.add(pinEnd([-5, 24.2, -10.2], 1.1, 't', 0.35), 'steel');
  bolt.add(box([40, 20.4, 0], [82, 4.6, 9.4], { seg: 1, r: 0.6 }), 'alu');
  let carrier = lathe([[14, 0], [14, 11.4], [15, 12.3], [117, 12.3], [118, 11.5], [118, 0]], { seg: 24 });
  const notch = [];
  for (let i = 0; i < 6; i++) notch.push(cutters.box([90.5 + i * 2.6, 1, 13], [1.3, 12, 4]));
  notch.push(cutters.box([112, 0, 14.5], [14, 14, 6]));
  carrier = cut(carrier, merge(notch));
  bolt.add(carrier, 'steel_bright');
  bolt.add(lathe([[117.6, 0], [117.6, 8.1], [118.2, 8.6], [121, 8.6], [121, 8.1], [121.8, 8.1], [121.8, 8.6], [123, 8.6], [123, 8.1],
    [123.8, 8.1], [123.8, 8.6], [150.6, 8.6], [151.6, 7.6], [151.6, 0]], { seg: 20 }), 'steel');
  bolt.add(box([141, 5.2, 8.3], [18, 3, 4.2], { seg: 1, r: 0.5, rot: [0, 0, -58] }), 'steel');
  bolt.add(pinEnd([135, 5.4, 10], 0.9, 'w', 0.4), 'steel');

  // ======================================================================== lower receiver
  const lowerMain = PF([[-12, -13.6, 1.5], [178.5, -13.6, 1], [178.5, -22, 0.5], [109, -22, 0], [108, -40, 2], [-2, -40, 3],
    [-10, -34.5, 5], [-14.6, -21, 3]], { w: 27, bevel: 1.2 });
  const magwell = PF([[108.5, -21.2, 1], [178.6, -21.2, 1], [179.6, -60, 1.5], [184.6, -64.5, 2], [184.6, -69.5, 1.5],
    [110, -69.5, 2], [107.5, -60, 2]], { w: 30.5, bevel: 1.4 });
  let lower = union(lowerMain, magwell);
  lower = cut(lower, [cutters.box([144.9, -45, 0], [64.6, 70, 23.4]), cutters.box([79, -40, 0], [23, 12, 7.4])]);
  g.add(lower, 'alu');
  g.add(lathe([[-16.5, 0], [-16.5, 15.6], [-15.3, 16.8], [-0.6, 16.8], [-0.6, 0]], { seg: 28 }), 'alu');
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
  for (const [s, t] of [[74, -27], [52, -25]]) {
    g.add(hexHead([s, t, 13.5], 3.3, 'w', 1.0), 'steel_bright');
    g.add(pinEnd([s, t, 14.5], 1.5, 'w', 0.5), 'steel');
    g.add(pinEnd([s, t, -13.5], 2.6, '-w', 0.7), 'steel_bright');
  }
  for (const [s, t, r] of [[6, -20.6, 4.2], [171, -18.2, 3.8]]) {
    g.add(lax([[0, 0], [0, r], [1.1, r], [1.5, r - 0.6], [1.5, 0]], [s, t, -13.5], '-w', 18), 'steel');
    g.add(pinEnd([s, t, 13.5], r * 0.72, 'w', 0.5), 'steel');
  }
  g.add(box([116.5, -18.3, -14.5], [14, 6, 2.2], { seg: 1, r: 0.8 }), 'alu');
  g.add(PF([[111.5, -15.6, 2], [121.5, -15.6, 2], [123.5, -25, 1], [127.5, -29, 2], [127.5, -34, 2.5], [109.5, -34, 2.5],
    [109.5, -29, 2], [113, -25, 1]], { w: 2, cw: -16.6, bevel: 0.5 }), 'steel');
  for (let k = 0; k < 5; k++) g.add(box([112 + k * 3.2, -31.5, -17.7], [0.9, 4, 0.5], { seg: 1, r: 0.15 }), 'steel');
  g.add(pinEnd([117, -19.5, -17.6], 1.4, '-w', 0.4), 'steel_dark');
  g.add(lax([[0, 0], [0, 4.7], [2.3, 4.7], [3, 4.1], [3, 0]], [104, -30, 13.4], 'w', 22), 'steel');
  g.add(PF([...arcPts(104, -30, 8.6, 165, 375, 14), ...arcPts(104, -30, 6.6, 375, 165, 14)], { w: 2.4, cw: 14.6, bevel: 0.7 }), 'alu');
  // series roll-marks (original): model, calibre, the dual-phase emblem
  g.add(stamp('DUAL-PHASE R', [176, -26, -15.25], { px: 0.62, side: -1 }), 'alu');
  g.add(stamp('ANTI-CAL 5.56', [176, -32.2, -15.25], { px: 0.5, side: -1 }), 'alu');
  g.add(stamp(PHASE, [140, -38, -15.25], { px: 0.8, side: -1 }), 'alu');

  // ======================================================================== trigger, selector
  const trig = g.part('trigger', { pivot: [74, -27, 0], extras: { axis: 'x', pullDeg: -12 } });
  trig.add(PF([[69.5, -30, 2], [79, -30, 2], [79.5, -41, 0], [77.2, -47, 6], [78.8, -53.6, 1.5], [76.4, -55, 1.2], [72.4, -48, 6],
    [72, -41, 0], [69.5, -36, 2]], { w: 6, bevel: 0.9 }), 'steel_bright');
  const sel = g.part('selector', { pivot: [30, -24, 0], extras: { axis: 'x', safeDeg: -90, autoDeg: 90, note: 'modelled on FIRE (lever up)' } });
  sel.add(PF([...arcPts(30, -24, 6.4, 150, 390, 10), [34.2, -17.5, 1.5], [36.6, -14.4, 2], [23.4, -14.4, 2], [25.8, -17.5, 1.5]],
    { w: 2.2, cw: -15.3, bevel: 0.6 }), 'steel');
  for (let k = 0; k < 4; k++) sel.add(box([26 + k * 2.6, -16.6, -16.5], [0.8, 3, 0.5], { seg: 1, r: 0.15 }), 'steel');
  sel.add(lax([[0, 0], [0, 3.2], [1.2, 3], [1.4, 0]], [30, -24, -16.4], '-w', 16), 'steel');
  sel.add(PF([...arcPts(30, -24, 5.4, 150, 390, 8), [33.6, -18.6, 1.2], [35.2, -15.6, 1.6], [24.8, -15.6, 1.6], [26.4, -18.6, 1.2]],
    { w: 2, cw: 14.6, bevel: 0.55 }), 'steel');
  sel.add(capScrew([30, -24, 15.6], 2.4, 'w', 1.1), 'steel_dark');

  // ======================================================================== pistol grip
  g.add(PF([[38.5, -40.8, 1], [36, -50, 6], [29.5, -74, 24], [20, -101, 20], [10.6, -122.5, 3], [-31.7, -107.1, 3],
    [-26.3, -83.5, 26], [-11.9, -52.6, 8], [-14, -44, 4], [-19.5, -38.5, 3], [-12, -36.2, 3], [-4, -40.8, 1]],
  { w: 29.5, bevel: 3.5, bevelSeg: 3, curveSeg: 5 }), 'polymer');
  g.add(PF([[31, -50, 4], [24.5, -76, 16], [16, -100, 10], [6.5, -115, 4], [-23.5, -104.5, 4], [-21.5, -83, 14], [-9.5, -58, 4],
    [-6.5, -50, 3]], { w: 30.3, bevel: 1, curveSeg: 6 }), 'polymer_grip');
  g.add(PF([[11, -123.2, 0.8], [8.4, -128.8, 3], [-33.9, -113.4, 3], [-32.3, -107.9, 0.8]], { w: 27.5, bevel: 1.8 }), 'polymer');

  // ======================================================================== buffer tube, end plate, castle nut
  g.add(lathe([[-182, 0], [-182, 12.6], [-181, 14.1], [-179.6, 14.6], [-16, 14.6], [-16, 0]], { seg: 36 }), 'alu');
  {
    const rib = SC([[-4.3, -18, 0.8], [4.3, -18, 0.8], [4.3, -12, 0], [-4.3, -12, 0]], -179, -29, { bevel: 0.6 });
    const holes = [];
    for (let k = 0; k < 6; k++) holes.push(lax([[0, 0], [0, 2.2], [16, 2.2], [16, 0]], [-36 - k * 16, -26, 0], 't', 10));
    g.add(cut(rib, merge(holes)), 'alu');
  }
  g.add(lathe([[-19.8, 0], [-19.8, 16.8], [-19.2, 17.4], [-17.2, 17.4], [-16.8, 16.8], [-16.8, 0]], { seg: 24 }), 'steel_bright');
  g.add(box([-18.3, -21.5, 0], [3, 9, 11], { seg: 1, r: 0.8 }), 'steel');
  g.add(box([-18.3, -1, -19], [3, 12, 8], { seg: 1, r: 0.8 }), 'steel');
  g.add(box([-21.5, -1, -21.5], [6.5, 11, 6], { seg: 1, r: 1.5 }), 'steel');
  g.add(lax([[0, 0], [0, 4.4], [0.8, 4.2], [0.8, 2.8], [0.2, 2.7], [0.2, 0]], [-21.5, -1, -24.5], '-w', 18), 'steel_dark');
  {
    const nut = lathe([[-28.2, 14.65], [-28.2, 16.2], [-27.6, 16.8], [-20.4, 16.8], [-19.8, 16.2], [-19.8, 14.65], [-28.2, 14.65]], { seg: 24 });
    const nn = [];
    for (let k = 0; k < 8; k++) nn.push(xform(cutters.box([-26.6, 15.8, 0], [3.6, 3, 3.4]), { rot: [0, 0, k * 45 + 22.5] }));
    g.add(cut(nut, merge(nn)), 'steel_bright');
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
  g.add(PF([[-256.5, 30.5, 3], [-266, 31.5, 6], [-276, 29, 6], [-276, -93, 6], [-266, -97, 6], [-256.5, -93.5, 3]], { w: 38, bevel: 4, bevelSeg: 3 }), 'rubber');
  g.add(PF([[-99, -17, 1], [-146, -19.8, 2], [-146, -24.6, 2], [-108, -25.4, 2], [-99.5, -23.5, 2]], { w: 10, bevel: 1 }), 'polymer');
  for (let k = 0; k < 4; k++) g.add(box([-102 - k * 2.6, -25.6, 0], [1, 1.2, 8.6], { seg: 1, r: 0.3 }), 'polymer');
  for (const sd of [1, -1]) {
    g.add(pinEnd([-140, -22.4, 5 * sd], 1.3, sd > 0 ? 'w' : '-w', 0.4), 'steel');
    g.add(lax([[0, 0], [0, 6.2], [1.6, 6.2], [2.2, 5.6], [2.2, 3.9], [1.2, 3.7], [1.2, 0]], [-238, 1, 18.4 * sd], sd > 0 ? 'w' : '-w', 14), 'steel_bright');
  }

  // ======================================================================== reactor module (s 182-292)
  // barrel nut, rear band, housing with side windows, front band, gimbal stem, junction collar
  g.add(lathe([[176, 9.8], [176, 15.4], [176.6, 16], [196, 16], [196.6, 15.4], [196.6, 9.8], [176, 9.8]], { seg: 20 }), 'steel_dark');
  for (const sd of [1, -1]) g.add(box([178.6, 21, 11.6 * sd], [6, 4, 2], { seg: 1, r: 0.5 }), 'alu');   // anti-rotation tabs
  g.add(lathe([[182, 17], [182, 23.2], [182.8, 24], [191.2, 24], [192, 23.2], [192, 17], [182, 17]], { seg: 32 }), 'steel_bright');
  for (let k = 0; k < 8; k++) {   // band screws (rear face of the module, every 45°)
    const a = (k + 0.5) * Math.PI / 4;
    g.add(hexHead([182, Math.cos(a) * 20.2, Math.sin(a) * 20.2], 1.6, '-s', 0.9), 'steel_dark');
  }
  {
    let housing = lathe([[191.5, 19], [191.5, 21.5], [250.5, 21.5], [250.5, 19], [191.5, 19]], { seg: 32 });
    housing = cut(housing, [cutters.box([221, 0, 20], [38, 24, 8]), cutters.box([221, 0, -20], [38, 24, 8])]);   // core windows
    g.add(housing, 'alu');
  }
  g.add(lathe([[250, 17], [250, 23.2], [250.8, 24], [255.2, 24], [256, 23.2], [256, 17], [250, 17]], { seg: 32 }), 'steel_bright');
  {
    // gimbal stem with machined rings
    g.add(lathe([[255.5, 18], [255.5, 20.5], [262, 20.5], [262.6, 19.6], [263.4, 19.6], [264, 20.5], [272, 20.5], [272.6, 19.6], [273.4, 19.6],
      [274, 20.5], [284.5, 20.5], [284.5, 18], [255.5, 18]], { seg: 32 }), 'alu');
    g.add(lathe([[284, 17], [284, 22.4], [284.8, 23.2], [291.2, 23.2], [292, 22.4], [292, 17], [284, 17]], { seg: 32 }), 'steel_bright');
  }
  // fixed yoke: two side brackets from the front band out past the outer ring, pins into its ±w bosses
  for (const sd of [1, -1]) {
    g.add(box([252.2, 0, 37.6 * sd], [4.4, 9, 30], { seg: 1, r: 1.2 }), 'alu');
    g.add(box([261.8, 0, 50.6 * sd], [24, 9, 5.2], { seg: 1, r: 1.4 }), 'alu');
    g.add(box([252.4, 0, 50.6 * sd], [5.6, 9, 5.2], { seg: 1, r: 1.4 }), 'alu');   // corner block
    g.add(lax([[0, 0], [0, 2.1], [3.4, 2.1], [3.4, 0]], [GY, 0, 48.1 * sd], sd > 0 ? '-w' : 'w', 14), 'steel_bright');
    g.add(capScrew([GY, 0, 53.1 * sd], 2.8, sd > 0 ? 'w' : '-w', 1.2, 14), 'steel_bright');
    g.add(capScrew([254, 0, 52.9 * sd], 1.6, sd > 0 ? 'w' : '-w', 0.8, 10), 'steel_dark');
    for (const t of [-2.8, 2.8]) g.add(hexHead([252.2, t, 23.4 * sd], 1.7, sd > 0 ? 'w' : '-w', 0.9), 'steel_dark');
  }

  // amber core round the barrel: glowing sleeve between steel fins, bright end caps, 3 tie rods (shows its spin)
  {
    const core = g.part('fx_core', { pivot: [221, 0, 0], extras: { spin: 's', rate: 90, note: 'reactor core: spinMul ~0.2 idle, ~6 in overphase' } });
    core.add(lathe([[200, 10.2], [200, 12.6], [242, 12.6], [242, 10.2], [200, 10.2]], { seg: 32 }), 'glow_gold');
    for (let k = 0; k < 5; k++) core.add(washer(205 + k * 8 - 0.9, 205 + k * 8 + 0.9, 10.2, 16.6, 0.3, 24), 'steel_dark');
    core.add(washer(198.6, 201, 10.2, 18.2, 0.4, 24), 'steel_bright');
    core.add(washer(241, 243.4, 10.2, 18.2, 0.4, 24), 'steel_bright');
    for (let k = 0; k < 3; k++) { const a = k * 2.0944 + 0.5; core.add(cyl(200.5, 241.5, 1.1, { t: Math.cos(a) * 14.6, w: Math.sin(a) * 14.6, seg: 8 }), 'steel_bright'); }
  }
  // side shells over the windows: slide 8 mm out on overphase (extras.open, metres), vented so the core glows through
  for (const sd of [1, -1]) {
    const sh = g.part(sd > 0 ? 'fx_shell_r' : 'fx_shell_l', { pivot: [221, 0, 22 * sd], extras: { open: [0, 0, 0.008 * sd], note: 'slides 8 mm out (w) when the reactor opens' } });
    let shell = SC(arcBand(21.7, 24.4, 46, sd, 12), 197, 245, { bevel: 0.6, bevelSeg: 1 });
    const vents = [];
    for (const t of [-10.4, -3.5, 3.5, 10.4]) vents.push(slotCut(204, 238, t, 2.4, 12, 23 * sd));
    shell = cut(shell, vents);
    sh.add(shell, 'alu');
    sh.add(SC(arcBand(24.2, 25.1, 47, sd, 8), 197, 199.6, { bevel: 0.3, bevelSeg: 1 }), 'steel_bright');
    sh.add(SC(arcBand(24.2, 25.1, 47, sd, 8), 242.4, 245, { bevel: 0.3, bevelSeg: 1 }), 'steel_bright');
    // end lugs with guide rods into the housing (they stay engaged when the shell is 8 mm out)
    for (const s of [195.6, 246.4]) for (const t of [-12, 12]) {
      sh.add(box([s, t, 20.6 * sd], [2.8, 5, 5.2], { r: 0 }), 'alu');
      sh.add(lax([[0, 0], [0, 1.2], [13, 1.2], [13, 0]], [s, t, 19.6 * sd], sd > 0 ? '-w' : 'w', 10), 'steel_bright');
    }
    for (const s of [208, 221, 234]) sh.add(capScrew([s, 16.6, 17.4 * sd], 1.0, sd > 0 ? 'w' : '-w', 0.5, 8), 'steel_bright');
  }

  // ======================================================================== dual-ring gimbal (the series' focus)
  {
    // outer gimbal A: bright race (inner + outer lips), ±w bosses on the yoke pins, ±t pins carrying the inner gimbal
    const ga = g.part('fx_gimbal_a', { pivot: [GY, 0, 0], extras: { open: -TILT_A, hinge: 'w', note: 'outer gimbal, modelled tilted 24° about w; open 1 = locked coaxial' } });
    ga.add(tiltA(merge([washer(GY - 2.5, GY + 2.5, RA[0], 41.5, 0.5), washer(GY - 2.5, GY + 2.5, 43.1, RA[1], 0.5)])), 'chrome');
    ga.add(tiltA(merge([
      lax([[0, 0], [0, 3.8], [3.2, 3.8], [3.2, 0]], [GY, 0, 44.6], 'w', 16), lax([[0, 0], [0, 3.8], [3.2, 3.8], [3.2, 0]], [GY, 0, -44.6], '-w', 16),
      lax([[0, 0], [0, 2.8], [1.6, 2.8], [1.6, 0]], [GY, 38.0, 0], 't', 14), lax([[0, 0], [0, 2.8], [1.6, 2.8], [1.6, 0]], [GY, -38.0, 0], '-t', 14),
    ])), 'steel_bright');
    ga.add(tiltA(merge([lax([[0, 0], [0, 1.3], [3.4, 1.3], [3.4, 0]], [GY, 36.4, 0], 't', 10), lax([[0, 0], [0, 1.3], [3.4, 1.3], [3.4, 0]], [GY, -36.4, 0], '-t', 10)])), 'steel_bright');
    // its rotor band: amber glow in the channel between the lips + 16 bright ribs that show the spin
    const ra = g.part('fx_rotor_a', { pivot: [GY, 0, 0], parent: 'fx_gimbal_a', extras: { spin: r4(N_A), rate: -30, pv: { veinAxis: 1, veinFreq: 6 }, note: 'amber rotor band, spins about the outer ring normal' } });
    ra.add(tiltA(washer(GY - 1.9, GY + 1.9, 41.3, 43.3, 0.35)), 'glow_gold');
    const ribsA = [];
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; ribsA.push(box([GY, Math.cos(a) * 42.3, Math.sin(a) * 42.3], [4.3, 2.4, 1.4], { r: 0, rot: [0, 0, -(a * 180 / Math.PI)] })); }
    ra.add(tiltA(merge(ribsA)), 'chrome');

    // inner gimbal B (child of A): race + ±t bosses round A's pins
    const gb = g.part('fx_gimbal_b', { pivot: [GY, 0, 0], parent: 'fx_gimbal_a', extras: { open: -TILT_B, hinge: r4(T_A), note: 'inner gimbal, tilted 18° about the outer frame t; open 1 = coaxial' } });
    gb.add(tiltB(merge([washer(GY - 2.2, GY + 2.2, RB[0], 34.3, 0.45), washer(GY - 2.2, GY + 2.2, 35.7, RB[1], 0.45)])), 'chrome');
    gb.add(tiltB(merge([lax([[0, 0], [0, 2.6], [1.4, 2.6], [1.4, 0]], [GY, 36.6, 0], 't', 14), lax([[0, 0], [0, 2.6], [1.4, 2.6], [1.4, 0]], [GY, -36.6, 0], '-t', 14)])), 'steel_bright');
    const rb = g.part('fx_rotor_b', { pivot: [GY, 0, 0], parent: 'fx_gimbal_b', extras: { spin: r4(N_B), rate: 40, pv: { veinAxis: 1, veinFreq: 7 }, note: 'cyan rotor band, spins about the inner ring normal (counter to A)' } });
    rb.add(tiltB(washer(GY - 1.6, GY + 1.6, 34.2, 35.8, 0.3)), 'glow_ice');
    const ribsB = [];
    for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2 + 0.11; ribsB.push(box([GY, Math.cos(a) * 35, Math.sin(a) * 35], [3.7, 2.0, 1.3], { r: 0, rot: [0, 0, -(a * 180 / Math.PI)] })); }
    rb.add(tiltB(merge(ribsB)), 'chrome');
  }

  // ======================================================================== M-LOK handguard (s 292-470) with vein channels
  const HG0 = 292, HG1 = 470;
  const hgO = [[-12, -22, 2.5], [12, -22, 2.5], [20, -14, 2.5], [20, 12, 2.5], [13.6, 20.9, 1.5], [10.6, 23.6, 0], [-10.6, 23.6, 0],
    [-13.6, 20.9, 1.5], [-20, 12, 2.5], [-20, -14, 2.5]];
  const hgI = [[-10.6, -19.6, 1.5], [10.6, -19.6, 1.5], [17.6, -12.8, 1.5], [17.6, 11, 1.5], [12.6, 18.3, 1], [-12.6, 18.3, 1],
    [-17.6, 11, 1.5], [-17.6, -12.8, 1.5]];
  // the 54° top chamfers: a long vein channel each, cold cyan glow strip sunk in it
  const onChamfer = (geo, sd, depth = 0) => xform(geo, { rot: [0, 0, -54.3 * sd], move: [0, 16.45 - 0.584 * depth, (16.8 - 0.812 * depth) * sd] });
  {
    let hg = SC(hgO, HG0, HG1, { bevel: 1.2, holes: [hgI] });
    const hc = [];
    for (const a of [300, 341, 382, 423]) {
      const b = a + 32;
      hc.push(slotCut(a, b, -1, 7.2, 8, 19), slotCut(a, b, -1, 7.2, 8, -19));
      hc.push(PL([[a, -3.6, 3.6], [b, -3.6, 3.6], [b, 3.6, 3.6], [a, 3.6, 3.6]], { h: 8, ct: -21, bevel: 0 }));
    }
    for (const sd of [1, -1]) hc.push(onChamfer(PL([[298, -1.4, 1.2], [462, -1.4, 1.2], [462, 1.4, 1.2], [298, 1.4, 1.2]], { h: 2.4, ct: 0, bevel: 0 }), sd));
    hc.push(cutters.box([298, -21, 0], [12, 4, 1.2]));   // clamp split
    g.add(cut(hg, merge(hc)), 'alu');
    for (const sd of [1, -1]) g.add(onChamfer(PL([[299, -1.0, 0.9], [461, -1.0, 0.9], [461, 1.0, 0.9], [299, 1.0, 0.9]], { h: 1.0, ct: 0, bevel: 0.25 }), sd, 0.75), 'glow_ice');
  }
  g.add(lightRail(HG0 + 4, HG1, RAIL_T), 'alu');
  for (const sd of [1, -1]) {
    for (const s of [296, 306]) g.add(xform(capScrew([0, 0, 0], 2.3, sd > 0 ? 'w' : '-w', 1.3), { rot: [0, 0, -45 * sd], move: [s, -18, 16.1 * sd] }), 'steel_dark');
    g.add(lax([[0, 0], [0, 6.4], [1.6, 6.4], [2.3, 5.7], [2.3, 3.8], [1.0, 3.6], [1.0, 0]], [455, -1, 19.8 * sd], sd > 0 ? 'w' : '-w', 14), 'steel_bright');
  }
  g.add(PF([[416, -21.6, 0], [446, -21.6, 0], [446, -25.5, 2], [437, -37, 4], [430.5, -37.5, 3], [420, -27, 5]], { w: 15, bevel: 1.8 }), 'polymer');
  // front phase collar (bright) closing the handguard
  g.add(lathe([[470, 9.4], [470, 13.6], [470.6, 14.2], [474.4, 14.2], [475, 13.6], [475, 9.4], [470, 9.4]], { seg: 32 }), 'steel_bright');

  // ======================================================================== barrel, gas block, hexagonal compensator
  g.add(lathe([[178, 2.85], [178, 9.2], [178.6, 9.8], [330, 9.8], [332, 8.9], [338, 8.1], [503.4, 8.1], [503.6, 7.7], [519.6, 7.7],
    [520, 7.3], [520, 3.6], [519.4, 2.85], [178, 2.85]], { seg: 24 }), 'steel_dark');
  g.add(lathe([[322, 8.0], [322, 13.6], [322.8, 14.4], [340, 14.4], [340.8, 13.6], [340.8, 8.0], [322, 8.0]], { seg: 20 }), 'steel_dark');
  g.add(box([331, 15.5, 0], [17, 6, 10], { seg: 1, r: 1.5 }), 'steel_dark');
  for (const s of [326, 336]) g.add(capScrew([s, -14.2, 0], 2, '-t', 1), 'steel');
  g.add(cyl(292, 326, 2.4, { t: 15.4, seg: 10 }), 'steel');
  g.add(lathe([[503.6, 7.8], [503.6, 9.4], [504, 9.8], [505.4, 9.8], [505.8, 9.4], [505.8, 7.8], [503.6, 7.8]], { seg: 24 }), 'steel_bright');
  {
    const hex = [];
    for (let k = 0; k < 6; k++) { const a = (30 + 60 * k) * Math.PI / 180; hex.push([Math.cos(a) * 12.8, Math.sin(a) * 12.8, 1.4]); }
    let comp = SC(hex, 506, 557.4, { bevel: 1, bevelSeg: 2, holes: [circle(0, 0, 4.9)] });
    const pc = [];
    for (const [a, b] of [[514, 522], [527.5, 535.5], [541, 549]]) pc.push(slotCut(a, b, 0, 6.4, 40, 0));
    for (const s of [520, 534]) pc.push(cutters.holeT(s, 0, 2.1, 0, 20));
    comp = cut(comp, pc);
    g.add(comp, 'steel_dark');
    // bright crown with a recessed crown face
    g.add(lathe([[557, 5.2], [557, 11.6], [557.6, 12.2], [563.2, 12.2], [564.6, 10.8], [565, 8.4], [565, 6], [564.2, 5.2], [557, 5.2]], { seg: 36 }), 'chrome');
    g.add(lathe([[505.6, 9.4], [505.6, 12.4], [506.2, 13], [507.4, 13], [507.4, 9.4], [505.6, 9.4]], { seg: 30 }), 'steel_bright');
  }

  // ======================================================================== folding BUIS (rear and front)
  const buisBase = [[-11.8, 23.8, 0.6], [11.8, 23.8, 0.6], [11.8, 31, 1.2], [9.2, 33.4, 1.4], [-9.2, 33.4, 1.4], [-11.8, 31, 1.2]];
  const buisCommon = (s0, s1, hingeS, knobS) => {
    g.add(SC(buisBase, s0, s1, { bevel: 0.8 }), 'alu');
    for (const sd of [1, -1]) g.add(box([hingeS, 35.5, 8.6 * sd], [8, 6, 2.6], { seg: 1, r: 1 }), 'alu');
    g.add(lax([[0, 0], [0, 1.3], [20.4, 1.3], [20.4, 0]], [hingeS, 35.5, -10.2], 'w', 12), 'steel');
    g.add(PF(gearPts(knobS, 26.8, 5.4, 4.7, 12), { w: 4.4, cw: 14.2, bevel: 0.5 }), 'alu');
    g.add(capScrew([knobS, 26.8, 16.4], 1.6, 'w', 0.6), 'steel');
    g.add(hexHead([knobS, 26.8, -11.8], 3.6, '-w', 1.8), 'steel_dark');
  };
  buisCommon(4, 32, 8, 19);
  const leaf = g.part('leaf', { pivot: [8, 35.5, 0], extras: { flip: { axis: 'x', deg: 90 }, note: 'rear BUIS folded forward' } });
  leaf.add(PL([[5.4, -6.2, 1], [33.5, -6.2, 1], [33.5, -8.6, 1.5], [42.2, -8.6, 2.5], [42.2, 8.6, 2.5], [33.5, 8.6, 1.5], [33.5, 6.2, 1],
    [5.4, 6.2, 1]], { h: 3.4, ct: 35.5, bevel: 0.6, holes: [circle(37.6, 0, 1.6)] }), 'alu');
  leaf.add(lax([[0, 1.6], [0, 4], [0.6, 4.4], [5.4, 4.4], [6, 4], [6, 1.6], [0, 1.6]], [37.6, 33, 0], 't', 20), 'alu');
  leaf.add(PF(gearPts(37.6, 35.5, 3.9, 3.4, 11), { w: 3.6, cw: 10.4, bevel: 0.4 }), 'alu');
  buisCommon(440, 466, 462, 449);
  g.add(lax([[0, 0], [0, 2.2], [1.4, 2.2], [1.8, 1.8], [1.8, 0]], [457, 29.5, 11.8], 'w', 14), 'steel');
  const leafF = g.part('leaf_front', { pivot: [462, 35.5, 0], extras: { flip: { axis: 'x', deg: -90 }, note: 'front BUIS folded back' } });
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
  // bright objective ring (the series' trim)
  g.add(lathe([[163.4, 12.9], [163.4, 15.6], [164, 16.2], [165, 16.2], [165.6, 15.6], [165.6, 12.9], [163.4, 12.9]], { t: AIM, seg: 32 }), 'steel_bright');
  g.add(box([131, AIM + 13.2, 0], [24, 8, 17], { seg: 1, r: 3 }), 'alu');
  g.add(lax([[0, 0], [0, 7.2], [1.6, 7.2], [1.6, 0]], [131, AIM + 17, 0], 't', 28), 'alu');
  g.add(PL(gearPts(131, 0, 7.6, 7.0, 15), { h: 6.4, ct: AIM + 21.6, bevel: 0.35 }), 'steel_bright');
  g.add(box([131, AIM, 13.2], [24, 17, 8], { seg: 1, r: 3 }), 'alu');
  g.add(lax([[0, 0], [0, 7.2], [1.6, 7.2], [1.6, 0]], [131, AIM, 17], 'w', 28), 'alu');
  g.add(PF(gearPts(131, AIM, 7.6, 7.0, 15), { w: 6.4, cw: 21.8, bevel: 0.35 }), 'steel_bright');
  g.add(box([146, AIM, -12.8], [18, 16, 8], { seg: 1, r: 3 }), 'alu');
  g.add(PF(gearPts(146, AIM, 8.6, 7.8, 16), { w: 5.6, cw: -19.4, bevel: 0.5 }), 'alu');
  g.add(lax([[0, 0], [0, 4.5], [0.8, 4.2], [0.8, 0]], [146, AIM, -22.2], '-w', 20), 'steel_dark');
  g.add(SC([[-11, 46.4, 1], [11, 46.4, 1], [11, 52, 1.5], [8.4, 56, 2], [-8.4, 56, 2], [-11, 52, 1.5]], 108, 160, { bevel: 1 }), 'alu');
  for (const s of [114, 154]) for (const sd of [1, -1]) g.add(capScrew([s, 49.4, 11 * sd], 1.9, sd > 0 ? 'w' : '-w', 1), 'steel_dark');
  g.add(stamp('DPR-1', [133, 51.3, -11], { px: 0.45, side: -1 }), 'alu');
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
    const R = 260, SC0 = 145.3, HD = 31.2;
    const P = (d, side) => {
      let s = SC0, t = -13 - d, ph = 0;
      if (d > 69) { ph = (d - 69) / R; s = SC0 + R * (1 - Math.cos(ph)); t = -82 - R * Math.sin(ph); }
      return [s + side * HD * Math.cos(ph), t + side * HD * Math.sin(ph), ph];
    };
    const ds = [6, 69, 82, 96, 110, 124, 138, 152, 169];
    const front = ds.map((d) => { const [s, t] = P(d, 1); return [s, t, d === 169 ? 2 : 0]; });
    const rear = ds.slice().reverse().filter((d) => d > 6).map((d) => { const [s, t] = P(d, -1); return [s, t, d === 169 ? 2 : 0]; });
    let body = PF([[114.1, -15.5, 1.5], [117.5, -13, 1], [150, -13, 1], [155.5, -19, 1], ...front, ...rear], { w: 22.6, bevel: 2.2 });
    body = cut(body, [cutters.box([136, -11.5, 0], [34, 5, 9.2])]);
    mag.add(body, 'polymer');
    const [cs, ct, ph] = P(169, 0);
    const n = [Math.cos(ph), Math.sin(ph)], d = [Math.sin(ph), -Math.cos(ph)];
    const fp = (a, b) => [cs + n[0] * a + d[0] * b, ct + n[1] * a + d[1] * b];
    mag.add(PF([[...fp(33.4, -1), 1], [...fp(34, 6), 3], [...fp(30, 9), 2.5], [...fp(-32.6, 9), 3], [...fp(-32.6, -1), 1]], { w: 25.6, bevel: 2.2 }), 'polymer');
    const gp = [95, 110, 125, 140, 158].map((dd) => P(dd, 0.82)).concat([158, 140, 125, 110, 95].map((dd) => P(dd, -0.82)));
    mag.add(PF(gp.map(([s, t]) => [s, t, 3]), { w: 23.4, bevel: 0.8 }), 'polymer_grip');
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
  g.socket('gyro', [GY, 0, 0]);                 // gimbal centre (ring flashes, kill-mark FX anchor)
  g.socket('core', [221, 0, 0]);                // reactor core
  g.socket('vent_r', [221, 0, 30]);             // steam out of the opened shells
  g.socket('vent_l', [221, 0, -30]);
  g.socket('meter', [58, -3, -15.4]);           // LED phase meter (left)
  g.meta({
    grip: 'rifle', support: 'handguard', reload: 'mag', chargeSide: 'rear', series: 'dualphase',
    notes: 'Sentry-4 base. Reactor module s 182-292: fx_shell_l/r slide 8 mm out (extras.open), fx_core spins (extras.spin). '
      + 'Gimbal: fx_gimbal_a (hinge w, open -24) > fx_rotor_a (spin about its normal) and fx_gimbal_b (hinge = outer-frame t, open -18) '
      + '> fx_rotor_b; parts are modelled misaligned, open 1 locks them coaxial. LED meter cells fx_led1..6 + fx_ledr (shown / hidden by the logic).',
  });
  return g;
}
