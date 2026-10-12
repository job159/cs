// 守夜人 Nightwatch-9: Glock 17/18-pattern 9x19 polymer-frame striker pistol with a select-fire (burst)
// switch on the left rear of the slide.
// Side view, mm: s forward from the slide's rear face, t up from the bore axis, w right (ejection side).
// Reference: 202 mm long (frame tang -16 .. muzzle 186), 139 mm tall incl. sights and magazine
// (rear sight top +18.5 .. baseplate -120.5), 32 mm wide over the controls, 114 mm barrel, 186 mm slide,
// 25.5 mm slide width, 22° grip angle, 165 mm sight radius, 17-round double-stack magazine.
import { Gun, DEG, profile, plan, section, lathe, cyl, box, cut, union, intersect, cutters, merge } from '../lib/gunkit.mjs';

// ------------------------------------------------------------------------------------------ dimensions
const TAN = Math.tan(22 * DEG);
const SL = 186, SB = -17, ST = 12, SW = 12.75; // slide length / bottom / top / half width
const SIN = 9.4;                                 // slide inner channel half width
const TOPW = SW - 3.3;                           // half width of the slide's top flat
const FW = 11.7, GW = 14.8, FT = -17.6;          // upper frame half width, grip half width, frame top
const sF = (t) => 63.5 + (t + 52) * TAN;         // front strap reference line (22° rake)
const sB = (t) => -16.2 + (t + 113) * TAN;       // backstrap reference line
const magF = (t) => 74.5 + (t + 14) * TAN;       // magazine front face
const magR = (t) => 40.0 + (t + 14) * TAN;       // magazine rear face

const gauss = (t, c, sg) => Math.exp(-(((t - c) / sg) ** 2));
const sstep = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
// front strap with two finger ridges (Gen3/4 pattern), backstrap with a gentle palm swell
const frontS = (t) => sF(t) + 2.6 * gauss(t, -73.5, 3.3) + 2.6 * gauss(t, -93, 3.3) - 0.7 * sstep((-58 - t) / 6) * sstep((t + 110) / 6);
const backS = (t) => sB(t) - 2.3 * Math.sin(Math.PI * Math.max(0, Math.min(1, (t + 113) / 75)));

/** Samples a curve s = fn(t) from t0 to t1 (n steps), optionally offset along its normal by d (dir +1 = towards +s). */
function curve(fn, t0, t1, n, d = 0, dir = 1) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n, e = 0.05;
    const ds = (fn(t + e) - fn(t - e)) / (2 * e);
    const L = Math.hypot(1, ds);
    out.push([fn(t) + (dir * d) / L, t - (dir * d * ds) / L]);
  }
  return out;
}
/** Quadratic bezier samples (excluding the start point). */
function qbez(p0, p1, p2, n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const u = i / n, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
    out.push([a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1]]);
  }
  return out;
}
/** Cylinder whose axis runs along w (pins, hubs, buttons) from w0 to w1 at (s, t). */
function cylW(s, t, w0, w1, r, { seg = 20, b = 0.25 } = {}) {
  const len = Math.abs(w1 - w0);
  const g = cyl(0, len, r, { seg, b: Math.min(b, r * 0.4, len * 0.45) });
  g.rotateY(-Math.PI / 2); // +s -> +w
  g.translate(Math.min(w0, w1), t, -s);
  return g;
}
/** V-groove cutter (serrations) on the slide side `side` (+1 right / -1 left). */
function vgroove(s, side, depth = 0.95, t0 = SB - 2, t1 = 7.6) {
  const a = 3, off = a / Math.SQRT2 - depth;
  return box([s, (t0 + t1) / 2, side * (SW + off)], [a, t1 - t0, a], { r: 0, rot: [0, 45, 0] });
}

// ------------------------------------------------------------------------------------------ stroke font
// Glyphs on a 4 x 6 grid as polylines; used for laser-engraved (cut) and moulded (raised) markings.
const GLYPHS = {
  A: [[[0, 0], [2, 6], [4, 0]], [[0.8, 2.2], [3.2, 2.2]]],
  C: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1]]],
  F: [[[4, 6], [0, 6], [0, 0]], [[0, 3.2], [3, 3.2]]],
  G: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1], [4, 3], [2.2, 3]]],
  H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  I: [[[2, 0], [2, 6]]],
  N: [[[0, 0], [0, 6], [4, 0], [4, 6]]],
  O: [[[1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 1], [3, 0], [1, 0]]],
  R: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]], [[2, 3], [4, 0]]],
  T: [[[0, 6], [4, 6]], [[2, 6], [2, 0]]],
  W: [[[0, 6], [1, 0], [2, 4], [3, 0], [4, 6]]],
  x: [[[0.6, 0], [3.4, 3.6]], [[0.6, 3.6], [3.4, 0]]],
  '0': [[[1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 1], [3, 0], [1, 0]]],
  '1': [[[1, 5], [2, 6], [2, 0]]],
  '2': [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [0, 0], [4, 0]]],
  '3': [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [4, 2], [4, 1], [3, 0], [1, 0], [0, 1]], [[1.5, 3], [3, 3]]],
  '4': [[[3, 0], [3, 6], [0, 2], [4, 2]]],
  '7': [[[0, 6], [4, 6], [1.2, 0]]],
  '9': [[[4, 3], [1, 3], [0, 4], [0, 5], [1, 6], [3, 6], [4, 5], [4, 1], [3, 0], [1, 0]]],
  '-': [[[0.8, 3], [3.2, 3]]],
  ' ': [],
};
/**
 * Outline of a polyline stroked with half width hw (square caps, mitred joins, bevelled when sharp).
 * Closed polylines return { outer, hole }.
 */
function thick(pts, hw) {
  const closed = Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-6;
  const P = closed ? pts.slice(0, -1) : pts.slice();
  const n = P.length, L = [], R = [];
  const dir = (i, j) => { const dx = P[j][0] - P[i][0], dy = P[j][1] - P[i][1], l = Math.hypot(dx, dy); return [dx / l, dy / l, l]; };
  for (let i = 0; i < n; i++) {
    const p = P[i];
    if (!closed && (i === 0 || i === n - 1)) {
      const [dx, dy] = i === 0 ? dir(0, 1) : dir(n - 2, n - 1);
      const e = i === 0 ? -hw : hw, q = [p[0] + dx * e, p[1] + dy * e];
      L.push([q[0] - dy * hw, q[1] + dx * hw]); R.push([q[0] + dy * hw, q[1] - dx * hw]);
      continue;
    }
    const [ax, ay, la] = dir((i - 1 + n) % n, i), [bx, by, lb] = dir(i, (i + 1) % n);
    let mx = -ay - by, my = ax + bx; const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
    const cosh = mx * -ay + my * ax; // cos of half the turn, against the incoming left normal
    let len = hw / Math.max(0.2, cosh);
    const cross = ax * by - ay * bx;
    const inner = Math.min(len, 0.45 * Math.min(la, lb) / Math.max(0.2, Math.sqrt(Math.max(0, 1 - cosh * cosh))) + hw);
    const sharp = len > 1.8 * hw;
    // left side
    if (cross > 0) L.push([p[0] + mx * inner, p[1] + my * inner]);
    else if (sharp) L.push([p[0] - ay * hw, p[1] + ax * hw], [p[0] - by * hw, p[1] + bx * hw]);
    else L.push([p[0] + mx * len, p[1] + my * len]);
    // right side
    if (cross < 0) R.push([p[0] - mx * inner, p[1] - my * inner]);
    else if (sharp) R.push([p[0] + ay * hw, p[1] - ax * hw], [p[0] + by * hw, p[1] - bx * hw]);
    else R.push([p[0] - mx * len, p[1] - my * len]);
  }
  if (!closed) return { outer: [...L, ...R.reverse()], hole: null };
  const area = (q) => q.reduce((acc, v, i) => { const w = q[(i + 1) % q.length]; return acc + v[0] * w[1] - w[0] * v[1]; }, 0) / 2;
  return Math.abs(area(L)) > Math.abs(area(R)) ? { outer: L, hole: R } : { outer: R, hole: L };
}
/**
 * Markings for `str` on a flat side face at w = face. Text reads towards +s on the right side (dir +1)
 * and towards -s on the left side (dir -1), like real roll marks. Each glyph polyline becomes one prism
 * (depth mm deep, centred on the face). Returns [{ key, cell, geo }]; key = polyline index (for batching).
 */
function strokes(str, { s, t, h, face, dir, sw = 0.42, depth = 0.6, adv = 5.6, raised = false }) {
  const k = h / 6, out = [];
  let x = 0;
  const sgn = Math.sign(face) || 1;
  for (const ch of str) {
    const sa = s + dir * x * k, sb = s + dir * (x + 4) * k;
    const cell = { s0: Math.min(sa, sb) - sw * 1.3, s1: Math.max(sa, sb) + sw * 1.3, t0: t - sw * 1.3, t1: t + h + sw * 1.3, face };
    (GLYPHS[ch] || []).forEach((line, li) => {
      const pts = line.map(([gx, gy]) => [s + dir * (x + gx) * k, t + gy * k]);
      const { outer, hole } = thick(pts, sw / 2);
      const cw = raised ? face + (sgn * depth) / 2 - sgn * 0.1 : face;
      out.push({ key: li, cell, geo: profile(outer.map(([a, b]) => [a, b, 0]), { w: depth, cw, bevel: 0, holes: hole ? [hole.map(([a, b]) => [a, b, 0])] : [] }) });
    });
    x += adv;
  }
  return out;
}
/** Engraves stroke lists into geo; polylines with the same index never overlap, so each batch is one cut. */
function engrave(geo, list) {
  const groups = new Map();
  for (const { key, geo: g } of list) { if (!groups.has(key)) groups.set(key, []); groups.get(key).push(g); }
  for (const gs of groups.values()) geo = cut(geo, merge(gs));
  return geo;
}
/**
 * Laser-engraved text on a flat side face: each glyph is engraved into its own small flush inlay block
 * (so CSG slivers stay inside the glyph cell) and the host gets matching windows. Returns { host, inlays }.
 */
function engraveInlay(host, list, depth = 1.0) {
  const cells = new Map();
  for (const st of list) { if (!cells.has(st.cell)) cells.set(st.cell, []); cells.get(st.cell).push(st); }
  const windows = [], inlays = [];
  for (const [c, sts] of cells) {
    const sgn = Math.sign(c.face), cs = (c.s0 + c.s1) / 2, ct = (c.t0 + c.t1) / 2, ls = c.s1 - c.s0, lt = c.t1 - c.t0;
    windows.push(cutters.box([cs, ct, c.face], [ls, lt, 2 * depth]));
    inlays.push(engrave(box([cs, ct, c.face - (sgn * depth) / 2], [ls, lt, depth], { r: 0 }), sts));
  }
  return { host: cut(host, merge(windows)), inlays: merge(inlays) };
}

const DBG = typeof process !== 'undefined' && process.env.GLOCK_DBG;
const dbg = (label, geo) => { if (DBG) console.log('  [tris]', label, (geo.index ? geo.index.count : geo.attributes.position.count) / 3); return geo; };

export default function build() {
  const g = new Gun('glock');

  // ======================================================================================== SLIDE
  const slide = g.part('slide', { pivot: [0, 0, 0], extras: { travel: 0.028 } });
  // cross-section: flat top with broad 45°-ish top chamfers, flat sides
  const slideSec = [[-SW, SB, 0.7], [SW, SB, 0.7], [SW, 8.2, 1.1], [TOPW, ST, 1.1], [-TOPW, ST, 1.1], [-SW, 8.2, 1.1]];
  // side profile used only to cut the nose chamfer (extended past the section on every other side)
  const noseLine = (t) => SL - ((t - 5.5) * 6) / (ST - 5.5);
  const nose = profile([[-5, SB - 4], [SL + 4, SB - 4], [SL + 4, 5.5 - 4 * (6.5 / 6)], [noseLine(ST + 4), ST + 4], [-5, ST + 4]], { w: 2 * SW + 8, bevel: 0 });
  let sl = dbg('slide body', intersect(section(slideSec, 0, SL, { bevel: 0.8, curveSeg: 3 }), nose));
  // rear (9) and front (8) cocking serrations, both sides: one shallow pocket per zone, then V-ridges
  // added back (cheap and clean compared with cutting 34 grooves through long faces)
  const serr = [[19.5, 9], [143, 8]];
  const pockets = [], ridges = [];
  for (const side of [1, -1]) for (const [c0, n] of serr) {
    const r0 = c0 - 1.6, r1 = c0 + (n - 1) * 3.2 + 1.6;
    pockets.push(cutters.box([(r0 + r1) / 2, (SB - 3 + 7.6) / 2, side * SW], [r1 - r0 + 1.3, 7.6 - (SB - 3), 1.9]));
    for (let j = 0; j <= n; j++) {
      const r = r0 + j * 3.2;
      const pts = [[r - 1.6, side * (SW - 0.95)], [r + 1.6, side * (SW - 0.95)], [r + 0.65, side * SW], [r - 0.65, side * SW]];
      ridges.push(plan(side > 0 ? pts : pts.reverse(), { h: 7.6 - SB, ct: (7.6 + SB) / 2, bevel: 0 }));
    }
  }
  sl = dbg('serration pockets', cut(sl, merge(pockets)));
  // interior: breech-block underside + barrel / recoil-spring channel, open at the bottom
  const chan = profile([[6, SB - 6, 0], [SL - 9.5, SB - 6, 0], [SL - 9.5, 8, 1.2], [72, 8, 0.5], [72, -3.5, 0.5], [6, -3.5, 1.5]], { w: 2 * SIN, bevel: 0 });
  // ejection port: top + right side, rear edge = breech face
  const port = profile([[72, -3.5, 1.4], [110.5, -3.5, 1.4], [110.5, 22, 0], [72, 22, 0]], { w: 30, cw: -7.6 + 15, bevel: 0 });
  sl = dbg('channel+port', cut(sl, [
    chan, port,
    cutters.holeS(0, 0, 7.2, SL - 12, SL + 5),        // barrel bushing
    cutters.holeS(-10.4, 0, 4.3, SL - 12, SL + 5),    // recoil spring guide hole
    cutters.holeS(0, 0, 0.95, 62, 76),                // striker hole in the breech face
  ]));
  sl = dbg('pockets', cut(sl, [
    cutters.box([61, SB + 0.3, -SW], [9, 4.6, 7.2]),                                                  // slide-stop notch (left)
    cutters.pocketW([[47, -3.6, 1.8], [73, -3.6, 0.4], [73, 4.2, 0.4], [47, 4.2, 1.8]], SW - 1.35, 10), // extractor pocket (right)
    section([[-6.4, -9, 1.5], [6.4, -9, 1.5], [6.4, 6.8, 1.5], [-6.4, 6.8, 1.5]], -2, 1.0, { bevel: 0 }), // slide cover plate recess
    cutters.box([14.8, 12.3, 0], [11.6, 3.4, 17.8]),   // rear sight dovetail
    cutters.box([175.2, 12, 0], [8.2, 2, 4.0]),        // front sight seat
  ]));
  // roll marks (laser engraved): model name on the left, serial number on the right below the port
  {
    const { host, inlays } = engraveInlay(sl, [
      ...strokes('NIGHTWATCH-9', { s: 136, t: -6.2, h: 3.0, face: -SW, dir: -1 }),
      ...strokes('9x19', { s: 136, t: -11.6, h: 2.4, face: -SW, dir: -1, sw: 0.36 }),
      ...strokes('CF20917', { s: 80, t: -12.4, h: 2.4, face: SW, dir: 1, sw: 0.36 }),
    ]);
    sl = host;
    slide.add(dbg('roll-mark inlays', inlays), 'steel_blued');
  }
  dbg('slide final', sl);
  slide.add(sl, 'steel_blued');
  slide.add(merge(ridges), 'steel_blued');

  // slide cover plate (polymer), proud of the rear face
  slide.add(section([[-6.05, -8.65, 1.2], [6.05, -8.65, 1.2], [6.05, 6.45, 1.2], [-6.05, 6.45, 1.2]], -0.4, 0.9, { bevel: 0.35 }), 'polymer');
  // extractor (right side, flush) with its claw reaching into the port
  slide.add(profile([[47.4, -3.25, 1.5], [72.6, -3.25, 0.4], [72.6, 3.85, 0.4], [47.4, 3.85, 1.5]], { w: 1.3, cw: SW - 0.75, bevel: 0.3 }), 'steel_dark');
  slide.add(box([73.0, 0.4, 9.8], [1.4, 5.0, 3.6], { r: 0.4 }), 'steel_dark');
  slide.add(cylW(50.2, 0.3, SW - 0.2, SW + 0.05, 1.1), 'steel_dark'); // extractor plunger pin

  // rear sight: steel night-sight body in the dovetail, square notch, two tritium vials facing the shooter
  let rs = profile([[9.4, 11.4, 0.3], [20.2, 11.4, 0.3], [20.2, 12.7, 0.5], [14.2, 18.5, 0.8], [9.4, 18.5, 0.6]], { w: 17.2, bevel: 0.6 });
  rs = union(rs, profile([[9.25, 10.75, 0.4], [20.35, 10.75, 0.4], [20.35, 12.2, 0.2], [9.25, 12.2, 0.2]], { w: 17.6, bevel: 0.3 }));
  rs = cut(rs, [
    profile([[8, 15.6, 0.4], [24, 15.6, 0.4], [24, 22, 0], [8, 22, 0]], { w: 3.6, bevel: 0 }), // notch
    cutters.holeS(15.3, 5.2, 1.6, 8, 12.4), cutters.holeS(15.3, -5.2, 1.6, 8, 12.4),          // vial bores
  ]);
  slide.add(rs, 'steel_dark');
  for (const w of [5.2, -5.2]) {
    slide.add(lathe([[9.45, 0.95], [9.45, 1.5], [9.7, 1.55], [12.2, 1.55], [12.2, 0.95], [9.45, 0.95]], { t: 15.3, w, seg: 20 }), 'paint_white');
    slide.add(cyl(9.75, 12.2, 0.95, { t: 15.3, w, seg: 16, b: 0.1 }), 'tritium');
  }
  // front sight: post seated in the slide, one vial
  let fs = profile([[171.4, 11.2, 0.3], [179.0, 11.2, 0.3], [179.0, 12.6, 0.6], [176.6, 16.0, 0.7], [171.4, 16.0, 0.6]], { w: 3.6, bevel: 0.5 });
  fs = cut(fs, cutters.holeS(13.9, 0, 1.2, 170, 175));
  slide.add(fs, 'steel_dark');
  slide.add(lathe([[171.45, 0.75], [171.45, 1.15], [171.7, 1.2], [174.4, 1.2], [174.4, 0.75], [171.45, 0.75]], { t: 13.9, seg: 18 }), 'paint_white');
  slide.add(cyl(171.75, 174.4, 0.75, { t: 13.9, seg: 14, b: 0.1 }), 'tritium');

  // select-fire switch (burst) on the left rear of the slide: rotates about w through its hub
  const sel = g.part('selector', { parent: 'slide', pivot: [11, 2.4, -SW], extras: { axis: 'w', positions: { semi: 0, burst: -32 } } });
  sel.add(cylW(11, 2.4, -SW - 1.3, -SW + 0.15, 3.1, { seg: 24 }), 'steel_dark');
  sel.add(profile([[9.5, 2.4, 1.4], [12.5, 2.4, 1.4], [12.6, -6.4, 1.4], [9.4, -6.4, 1.4]], { w: 1.1, cw: -SW - 0.5, bevel: 0.3 }), 'steel_dark');
  sel.add(box([11, -6.8, -SW - 0.9], [4.4, 3.2, 1.9], { r: 0.6 }), 'steel_dark');
  for (let i = 0; i < 3; i++) sel.add(box([11, -5.8 - i * 1.0, -SW - 1.9], [4.0, 0.45, 0.4], { r: 0 }), 'steel_dark');
  sel.add(cylW(11, 2.4, -SW - 1.75, -SW - 1.2, 1.5, { seg: 16 }), 'steel');

  // ======================================================================================== BARREL (static)
  let bar = lathe([[72.7, 0], [72.7, 6.6], [73.2, 7.1], [112, 7.1], [115.5, 6.95], [SL - 1.5, 6.95], [SL - 1, 6.5], [SL - 1, 0]], { seg: 36 });
  const hood = profile([[72.4, -1, 0.3], [110, -1, 0.3], [110, 11.8, 0.6], [72.4, 11.8, 0.6]], { w: 14.4, bevel: 0.5 });
  bar = union(bar, hood);
  bar = cut(bar, [
    lathe([[60, 0], [60, 4.95], [90, 4.95], [92, 4.6], [92, 0]], { seg: 28 }),          // chamber
    lathe([[88, 0], [88, 4.62], [SL + 3, 4.62], [SL + 3, 0]], { seg: 6, phase: Math.PI / 6 }), // hexagonal (polygonal) bore
    lathe([[SL - 2.6, 0], [SL - 2.6, 4.4], [SL - 0.9, 5.7], [SL + 1, 5.7], [SL + 1, 0]], { seg: 36 }), // recessed crown
    cutters.box([75.5, -8.8, 0], [9, 6, 7.2]),                                             // feed ramp relief
  ]);
  bar = engrave(bar, strokes('9x19', { s: 86, t: 4.8, h: 3.0, face: 7.2, dir: 1, sw: 0.4 }));
  g.add(bar, 'steel_dark');
  // recoil spring guide rod (captive; its tip shows in the slide's front hole)
  g.add(cyl(80, SL - 3.8, 2.1, { t: -10.4, seg: 16 }), 'steel_dark');
  g.add(lathe([[SL - 4, 0], [SL - 4, 3.6], [SL - 1.3, 3.6], [SL - 0.7, 3.0], [SL - 0.7, 0]], { t: -10.4, seg: 24 }), 'steel');

  // ======================================================================================== FRAME (polymer)
  // upper frame / dust cover / tang
  const frameA = profile([
    [-16.2, -21.6, 2.2], [-8.5, -18.6, 4], [-1, FT, 1], [175.2, FT, 1.2], [175.2, -24.4, 2], [172.6, -27.2, 1.2],
    [73.6, -27.2, 1.0], [65.4, -45, 0], [14.6, -45, 0], [13.4, -40, 4], [9.6, -33.5, 6], [3, -28.2, 6], [-5.5, -25.6, 5], [-12.6, -24.3, 3],
  ], { w: 2 * FW, bevel: 1.6, bevelSeg: 3, curveSeg: 5 });
  // grip (wider), finger grooves on the front strap, palm swell on the backstrap
  const gripPts = [[sF(-27), -27]];
  for (const p of curve(frontS, -28.5, -111, 44)) gripPts.push(p);
  gripPts.push([frontS(-112.4) - 0.5, -112.6], [frontS(-113) - 1.6, -113], [backS(-113) + 1.6, -113], [backS(-112.4) + 0.5, -112.6]);
  for (const p of curve(backS, -111, -40, 30)) gripPts.push(p);
  for (const p of qbez([backS(-40), -40], [14.8, -28.2], [22, -27], 6)) gripPts.push(p);
  const frameB = profile(gripPts, { w: 2 * GW, bevel: 4.5, bevelSeg: 3 });
  // trigger guard: squared front with a hooked toe, flowing into the front strap
  const frameC = profile([
    [59.5, -40, 0], [63.5, -25.8, 0], [124.6, -25.8, 0], [125.8, -54.4, 1.6], [124.6, -57.6, 2.4], [100, -57.9, 10], [70, -57.0, 7], [60.5, -53.5, 0],
  ], { w: 12.4, bevel: 1.3, bevelSeg: 3, curveSeg: 5, holes: [[[66, -26.6, 0.5], [119.8, -26.6, 0.5], [120.3, -50.4, 3], [118, -52.7, 2.5], [72, -52.6, 5], [63, -50.5, 0], [64.6, -30, 0]]] });
  // accessory rail under the dust cover (single-piece moulded dovetail rail)
  const rail = section([[-9.4, -26.5, 0], [9.4, -26.5, 0], [9.4, -28.9, 0.3], [10.6, -29.4, 0.3], [10.6, -32.2, 0.6], [9.8, -33.0, 0.6], [-9.8, -33.0, 0.6], [-10.6, -32.2, 0.6], [-10.6, -29.4, 0.3], [-9.4, -28.9, 0.3]], 125.8, 173.6, { bevel: 0.6, curveSeg: 2 });
  dbg("A", frameA); dbg("B", frameB); dbg("C", frameC); dbg("rail", rail);
  let frame = dbg("union", union(frameA, [frameB, frameC, rail]));

  // magazine well (tapered at the top like the magazine), open grip-plug cavity behind it
  const mwPar = profile([[magR(-126) - 0.5, -126, 0], [magF(-126) + 0.5, -126, 0], [magF(-15) + 0.5, -15, 0], [magR(-15) - 0.5, -15, 0]], { w: 30, bevel: 0 });
  const mwSec = section([[-11.75, -130], [11.75, -130], [11.75, -38.5], [9.2, -28.5], [9.2, -10], [-9.2, -10], [-9.2, -28.5], [-11.75, -38.5]], -20, 110, { bevel: 0 });
  const magwell = intersect(mwPar, mwSec);
  const plug = profile([[backS(-120) + 3.4 + 0.5, -120, 0], [magR(-120) - 2.3, -120, 0], [magR(-82) - 2.3, -82, 3], [sB(-82) + 3.4, -82, 3]], { w: 20, bevel: 0 });
  frame = dbg("magwell", cut(frame, [magwell, plug]));
  frame = cut(frame, [
    cutters.holeW(frontS(-113) + 0.6, -113, 5.2, 17),                                   // magazine stripping relief (front strap)
    cutters.box([81.2, -30, 0], [13.6, 20, 7.8]),                                        // trigger slot
    cutters.pocketW([[90, -25.6, 1], [101.4, -25.6, 1], [101.4, -19.4, 1], [90, -19.4, 1]], FW - 1.6, 10),   // takedown recess R
    cutters.pocketW([[90, -25.6, 1], [101.4, -25.6, 1], [101.4, -19.4, 1], [90, -19.4, 1]], -(FW - 1.6), 10), // takedown recess L
    cutters.box([143, -31.5, 0], [4, 6, 26]), cutters.box([159, -31.5, 0], [4, 6, 26]), // rail cross slots
  ]);
  // magazine catch recess (left side, behind the trigger guard)
  const catchPts = (d) => {
    const c = [57.4, -46.6], hw = 3.3 - d, hh = 4.8 - d;
    return [[c[0] - hw + hh * TAN, c[1] + hh, 1], [c[0] + hw + hh * TAN, c[1] + hh, 1], [c[0] + hw - hh * TAN, c[1] - hh, 1], [c[0] - hw - hh * TAN, c[1] - hh, 1]];
  };
  frame = cut(frame, cutters.pocketW(catchPts(-0.35), -(GW - 0.9), 10));
  // moulded markings (raised) on the left of the dust cover
  for (const { geo } of strokes('NIGHTWATCH', { s: 166, t: -24.4, h: 2.6, face: -FW, dir: -1, sw: 0.5, depth: 0.5 })) g.add(geo, 'polymer');
  g.add(dbg('frame final', frame), 'polymer');

  // texture panels (stippled polymer_grip): grip sides, front strap, backstrap
  const sidePanel = [];
  for (const p of curve((t) => sF(t) - 7.6, -55, -108.2, 12)) sidePanel.push([p[0], p[1], 0]);
  sidePanel[0][2] = 3; sidePanel[sidePanel.length - 1][2] = 3;
  const backEdge = curve((t) => sB(t) + 6.0, -108.2, -46, 10).map((p) => [p[0], p[1], 0]);
  backEdge[0][2] = 3; backEdge[backEdge.length - 1][2] = 4;
  sidePanel.push(...backEdge);
  sidePanel.push([sB(-46) + 22, -49.5, 8]);
  for (const sgn of [1, -1]) g.add(profile(sidePanel, { w: 1.2, cw: sgn * (GW - 0.3), bevel: 0.35, bevelSeg: 2 }), 'polymer_grip');
  const strapBand = (fn, t0, t1, dir) => {
    const outer = curve(fn, t0, t1, 40, 0.35, dir), inner = curve(fn, t0, t1, 40, -1.6, dir).reverse();
    return profile([...outer, ...inner], { w: 19.6, bevel: 0.35 });
  };
  g.add(strapBand(frontS, -57.5, -109.6, 1), 'polymer_grip');
  g.add(strapBand(backS, -47, -109.6, -1), 'polymer_grip');

  // ---- steel parts on the frame
  for (const side of [1, -1]) {
    const f = side * FW;
    g.add(cylW(80.5, -23.6, f - side * 0.6, f + side * 0.25, 1.45), 'steel_dark'); // trigger pin
    g.add(cylW(106, -22.4, f - side * 0.6, f + side * 0.25, 1.45), 'steel_dark');  // locking block pin
    g.add(cylW(6.5, -23.4, f - side * 0.6, f + side * 0.25, 1.45), 'steel_dark');  // trigger housing pin
    // takedown (slide lock) lever with grip ridges
    g.add(profile([[90.5, -25.1, 0.8], [100.9, -25.1, 0.8], [100.9, -19.9, 0.8], [90.5, -19.9, 0.8]], { w: 1.5, cw: side * (FW - 0.55), bevel: 0.3 }), 'steel_dark');
    for (let i = 0; i < 3; i++) g.add(box([93 + i * 2.7, -22.5, side * (FW + 0.25)], [0.8, 4.2, 0.6], { r: 0.2 }), 'steel_dark');
    // front & rear frame rails (show when the slide cycles)
    g.add(box([159, -16.6, side * 8.6], [18, 2, 1.4], { r: 0.3 }), 'steel_dark');
    g.add(box([11, -16.6, side * 8.6], [8, 2, 1.4], { r: 0.3 }), 'steel_dark');
  }
  // slide stop lever (left): thin stamped lever under the slide's notch, serrated thumb pad
  g.add(profile([[57.2, -24.6, 1.4], [84, -22.6, 2], [84, -19.4, 1], [65.6, -19.4, 0.5], [65.2, -17.8, 0.4], [57.6, -17.8, 0.4], [57.2, -19.4, 0.5]], { w: 1.0, cw: -FW - 0.35, bevel: 0.3 }), 'steel_dark');
  g.add(box([60.6, -21.6, -FW - 1.0], [6.4, 3.4, 1.4], { r: 0.5 }), 'steel_dark');
  for (let i = 0; i < 4; i++) g.add(box([58.4 + i * 1.5, -21.6, -FW - 1.75], [0.45, 3.0, 0.3], { r: 0 }), 'steel_dark');
  // magazine catch: checkered button on the left, flush end on the right
  let btn = profile(catchPts(0), { w: 2.6, cw: -GW - 0.2, bevel: 0.6 });
  btn = cut(btn, merge([0, 1, 2, 3, 4].map((i) => box([57.4 - (i - 2) * 1.7 * TAN, -46.6 + (i - 2) * 1.7, -GW - 1.5], [8, 0.55, 0.9], { r: 0 }))));
  g.add(btn, 'polymer');
  g.add(profile(catchPts(1.2), { w: 1.2, cw: GW - 0.25, bevel: 0.4 }), 'polymer');
  // serial plate on the rail underside
  g.add(box([133, -33.2, 0], [12, 0.8, 9], { r: 0.3 }), 'steel');

  // ======================================================================================== TRIGGER
  const trig = g.part('trigger', { pivot: [80.5, -23.6, 0], extras: { pullDeg: 14 } });
  let blade = profile('M 80.6 -26 Q 76.6 -37 80.3 -46.6 Q 81.8 -48.4 83.5 -46.2 Q 81.4 -37 86.6 -26 Z', { w: 6.6, bevel: 1.0, curveSeg: 14 });
  blade = cut(blade, profile([[70, -45.8], [79.6, -45.8], [79.6, -28.6], [70, -28.6]], { w: 2.9, bevel: 0 })); // safety blade slot
  trig.add(blade, 'polymer');
  trig.add(box([83.6, -23.4, 0], [6.6, 6.4, 6.0], { r: 1 }), 'polymer'); // upper trigger body (inside the frame)
  // trigger safety blade: hinged lever proud of the trigger face
  trig.add(profile('M 80.4 -28.6 Q 76.1 -37 79.3 -45.6 L 80.6 -45.2 Q 78.0 -37 81.6 -28.6 Z', { w: 2.5, bevel: 0.5, curveSeg: 12 }), 'polymer');
  trig.add(cylW(80.6, -28.8, -1.6, 1.6, 0.6, { seg: 10 }), 'steel_dark');

  // ======================================================================================== MAGAZINE
  const mag = g.part('mag', { pivot: [56, -18, 0], extras: { drop: true } });
  const magSide = profile([[magR(-113.8), -113.8, 1.5], [magF(-113.8), -113.8, 1.5], [magF(-15.5), -15.5, 1.2], [67.5, -11.2, 2], [58, -7.6, 2], [magR(-7.6), -7.6, 1.2]], { w: 22.5, bevel: 1.6, bevelSeg: 2 });
  const magTaper = section([[-14, -125], [14, -125], [14, -40], [8.7, -28.5], [8.7, 0], [-8.7, 0], [-8.7, -28.5], [-14, -40]], -10, 100, { bevel: 0 });
  let mg = intersect(magSide, magTaper);
  mg = cut(mg, [
    profile([[magR(-30) + 1.3, -30, 0], [magF(-30) - 1.3, -30, 0], [magF(0) - 1.3, 0, 0], [magR(0) + 1.3, 0, 0]], { w: 14.8, bevel: 0 }), // hollow top
    profile([[magF(-50) - 2, -50, 0.4], [magF(-50) + 3, -50, 0.4], [magF(-44.5) + 3, -44.5, 0.4], [magF(-44.5) - 2, -44.5, 0.4]], { w: 8, bevel: 0 }), // catch notch
    ...[-42, -56, -70, -84, -98].map((t) => cutters.holeS(t, 0, 1.15, magR(t) - 4, magR(t) + 2.6)), // witness holes
  ]);
  mag.add(mg, 'polymer');
  // feed lips
  for (const w of [6.6, -6.6]) mag.add(cyl(44.5, 64.5, 1.0, { t: -7.0, w, seg: 10, b: 0.4 }), 'polymer');
  // top two cartridges (staggered): brass case + copper FMJ bullet
  const round = (s0, t, w) => {
    mag.add(lathe([[s0, 0], [s0, 4.3], [s0 + 0.6, 4.96], [s0 + 1.3, 4.96], [s0 + 1.3, 4.3], [s0 + 1.9, 4.3], [s0 + 2.4, 4.96], [s0 + 19.1, 4.8], [s0 + 19.1, 0]], { t, w, seg: 20 }), 'brass');
    mag.add(lathe([[s0 + 19.0, 0], [s0 + 19.0, 4.5], [s0 + 22, 4.45], [s0 + 26.4, 3.2], [s0 + 28.9, 1.4], [s0 + 29.6, 0]], { t, w, seg: 20 }), 'copper');
  };
  round(42.6, -11, 2.2);
  round(magR(-19.6) + 1.5, -19.6, -2.6);
  // baseplate with a small front lip
  mag.add(profile([[magR(-113.9) - 0.9, -113.9, 0.8], [magF(-113.9) + 0.6, -113.9, 0.8], [magF(-114.6) + 2.4, -115.2, 1.4], [magF(-114.6) + 1.6, -120.5, 2.2], [magR(-114) + 0.4, -120.5, 2.2], [magR(-114) - 1.3, -116.4, 1.2]], { w: 24, bevel: 1.5, bevelSeg: 3 }), 'polymer');

  // ======================================================================================== SOCKETS
  g.socket('muzzle', [SL, 0, 0]);
  g.socket('eject', [91, 7, 9], { dir: [-0.15, 0.55, 1] });
  g.socket('grip_r', [24, -72, 0], { rot: [0, 0, -22] });
  g.socket('grip_l', [22, -98, -8]);
  g.socket('magwell', [18, -116, 0]);
  g.socket('charge', [31, 0, 0]);
  g.socket('sight_rear', [9.4, 15.6, 0]);
  g.socket('sight_front', [172.2, 16, 0]);
  g.meta({
    grip: 'pistol', support: 'pistol_cup', reload: 'mag_pistol', chargeSide: 'rear',
    notes: 'Glock-pattern striker pistol. Barrel is static in body (real slide recoils over it; muzzle/guide rod show when the slide is back). '
      + 'Slide racks via rear serrations (pinch both sides at the charge socket). Optional child part "selector" (on the slide, left rear) '
      + 'rotates about w: 0 = semi, -32 deg = burst. Trigger includes the safety blade.',
  });
  return g;
}
