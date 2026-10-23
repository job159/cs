// 螭吻．吞潮 Chiwen Tidewarden — 神兵 rifle M07 (docs/PREMIUM_WEAPONS.md M07 card, §1.5, §1.15.1 v1.2).
// A 7.62 battle rifle (SCAR-H / FAL class: 1,050 mm overall, 450 mm barrel) dressed as the roof-ridge 螭吻
// (dragon head, fish tail, swallowing the ridge):
//   - muzzle shroud = the 螭吻 head biting the barrel, sculpted as a lofted mask (Body + brushes below: squared brow
//     plane, brow ridges, cheekbones, nasal bridge, lip roll): bulging crystal eyes with lids and slit pupils in gilt
//     rings, grooved gilt flame brows, a 如意 snout plate with gilt nostrils, curled lip corners, fangs, ringed gilt
//     antlers with a burr of knobs, relief scales over the crown, grooved cobalt flame locks over the nape, cloud-scroll
//     cheek plates on the jaw hinge, cobalt gill fins; the lower jaw fx_jaw hinges open (3° a shot, 25° beam /
//     ultimate) and carries a grooved lacquer tongue (rugae on the palate above)
//   - receiver top = a roof ridge: 12 jade 筒瓦 tiles strapped with gilt clips on a porcelain ridge body whose
//     flanks carry a raised gilt 回紋 meander, a 瓦當 end cap facing the shooter; the rear keeps a Picatinny section
//     for the low-power holographic sight (gilt-framed hood, cloud-scroll side plates, cobalt top, knurled knobs)
//   - handguard flanks = 開片 crackle-glazed fish scales, cobalt back fading to a white belly, each with a gilt rim:
//     6 groups fx_scale1..6 (2 columns x 4 rows a side, both sides in one part) that flick 4° rear -> front;
//     ice-cyan light shows through the seams (glow_ice bed in a gilt frame); ahead of them 海水江崖 plates (cobalt
//     enamel wave bands in gilt walls, jade rock peaks, 立水 stripes)
//   - hero focus: a Ø16 glass water tube along the lower right of the handguard (fx_tube: pv_core water, fx_flow:
//     a bubble helix whose spin reads as the water circulating), knurled brass union nuts with screwed flats
//   - the stock is the fish body (a swelled loft): a gilt-rimmed cobalt gill cover, four rows of relief scales
//     tapering to the tail (cobalt -> white), a gilt lateral line with its pores, pectoral and pelvic fins, a 海水
//     belly band, a cobalt dorsal comb with gilt rays, a cobalt spacer with a gilt wave; it ends in the upturned forked
//     tail fx_tail (tapered, ribbed cobalt lobes with scalloped trailing edges, gilt edges and rays) that sways
//   - receiver: gilt cloud-scroll filigree in beaded frames, gold-inlaid roll-marks, rear serrations, an open dust
//     cover, a grooved carrier with its cam pin in the port; lower: gilt-edged panels, a cobalt enamel medallion
//     (right) and a wave cartouche (left) on the magwell, the 九子 resonance lamp fx_resonance (§1.3)
//   - transparent 40-round water-tank magazine: the round stack and the follower show above the water line
// Materials 60 / 30 / 10: ice-white / cobalt / jade glaze (crackle via premium.pvKey) / dark steel, black chrome,
// gold, chrome / glow (glow_ice seams, water, eyes).
// Side view, mm: s forward from the rear face of the receiver, t up from the bore axis, w right.
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';
import { Gun, V, makeShape, profile, plan, section, lathe, cyl, tube, box, sphere, sweep, cut, union, cutters, merge, xform } from '../lib/gunkit.mjs';
import { bakeMeshes } from '../lib/bake.mjs';
import { postBake } from './m4.mjs';

// ------------------------------------------------------------------------------------------ local helpers

const D2R = Math.PI / 180;
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
const dome = (at, r, axis = 'w', d = 0.8, seg = 6) => lax([[0, 0], [0, r], [d * 0.55, r * 0.75], [d, 0]], at, axis, seg);
const sideAx = (sd) => (sd > 0 ? 'w' : '-w');
const arcPts = (cs, ct, r, a0, a1, n) => {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = (a0 + ((a1 - a0) * i) / n) * D2R; out.push([cs + r * Math.cos(a), ct + r * Math.sin(a)]); }
  return out;
};
/** spiral (s, t): centre, radius r0 -> r1 over angles a0 -> a1 (deg) */
const spiral = (cs, ct, r0, r1, a0, a1, n) => {
  const out = [];
  for (let i = 0; i <= n; i++) { const u = i / n, a = (a0 + (a1 - a0) * u) * D2R, r = r0 + (r1 - r0) * u; out.push([cs + r * Math.cos(a), ct + r * Math.sin(a)]); }
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
/** straight strip (inlay / wire / bead) from a to b ([s, t]) in the side plane at w: height h across, thickness d in w */
function strip(a, b, w, h, d) {
  const ds = b[0] - a[0], dt = b[1] - a[1], L = Math.hypot(ds, dt);
  return box([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, w], [L + h * 0.5, h, d], { r: 0, rot: [Math.atan2(dt, ds) / D2R, 0, 0] });
}
/** side-plane points [s, t] -> sweep points at w */
const atW = (pts, w) => pts.map(([s, t]) => [s, t, w]);
const plen = (pts) => { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(...pts[i].map((x, k) => x - pts[i - 1][k])); return l; };

/** Tapered tube along [s, t, w] points, radius r0 -> r1 (or rf(u)): horns, whiskers, curls. */
function taper(points, r0, r1, { seg = 24, radial = 8, tension = 0.5, rf = null } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => V(...p)), false, 'catmullrom', tension);
  const geo = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  const p = geo.attributes.position, n = radial + 1, c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const u = i / seg, r = rf ? rf(u) : r0 + (r1 - r0) * u;
    curve.getPointAt(u, c);
    for (let j = 0; j < n; j++) { const k = i * n + j; v.fromBufferAttribute(p, k).sub(c).multiplyScalar(r).add(c); p.setXYZ(k, v.x, v.y, v.z); }
  }
  geo.deleteAttribute('uv');
  geo.computeVertexNormals();
  return geo;
}

/** 雲紋 cloud scroll (side plane): a big curl out of its eye, an S tail, a small counter-curl. k = size, f = ±1 mirror. */
function cloudPts(cs, ct, k, f = 1) {
  const big = spiral(0, 0, 0.28 * k, k, -40, 450, 22);                 // inside -> out, ends on top (0, k)
  const tail = [[0.75 * k, 1.02 * k], [1.35 * k, 0.78 * k]];
  const small = spiral(1.85 * k, 0.32 * k, 0.5 * k, 0.16 * k, 160, -200, 14);   // counter-curl, inward
  return [...big, ...tail, ...small].map(([x, y]) => [cs + f * x, ct + y]);
}
/** raised gilt 回紋 meander band along s (s0..s1) between t0 and t0 + h, side plane at w (sd = side) */
function meander(s0, s1, t0, h, w, sd, unit = 9, wire = 0.6, proud = 0.55) {
  const out = [], u = unit, ww = w + sd * proud / 2;
  const P = ([x, y]) => [x, t0 + y];
  const top = h - wire / 2, low = h * 0.2;
  out.push(strip(P([s0, wire / 2]), P([s1, wire / 2]), ww, wire, proud));   // base line
  out.push(strip(P([s0, top]), P([s1, top]), ww, wire, proud));             // top line
  for (let x = s0 + 1.5; x + u * 0.8 <= s1; x += u) {
    // a square key spiral hanging from the top line
    const k = [[x, top], [x, low], [x + u * 0.75, low], [x + u * 0.75, top - h * 0.28], [x + u * 0.28, top - h * 0.28], [x + u * 0.28, low + h * 0.42]];
    for (let i = 1; i < k.length; i++) out.push(strip(P(k[i - 1]), P(k[i]), ww, wire, proud));
  }
  return merge(out);
}
const _q = new THREE.Quaternion(), _fw = new THREE.Vector3(0, 0, -1);
/** geometry authored along +s from the origin (lathe pts [[s, r]] from s = 0), turned towards b and moved to a */
function aimGeo(geo, a, b) {
  const A = V(...a), d = V(...b).sub(A).normalize();
  _q.setFromUnitVectors(_fw, d);
  geo.applyQuaternion(_q);
  geo.translate(A.x, A.y, A.z);
  return geo;
}

/**
 * Fish scale: free edge (a half circle, radius r) to the rear, straight front edge at s0 + len (round = a rounded
 * front instead, for the first scale of a row); thick th across w, centred on cw; the free edge stands proud by
 * `tilt` degrees about the front edge. rim: a gilt bead along the free edge.
 */
function fishScale(s0, t0, r, len, cw, sd, { th = 2.2, tilt = 6, bevel = 0.8, rim = true, round = false } = {}) {
  const front = round ? arcPts(0, 0, 1, -90, 90, 6).map(([a, b]) => [s0 + len * (0.55 + 0.45 * a), t0 + r * b]) : [[s0 + len, t0 - r], [s0 + len, t0 + r]];
  const pts = [...front.map(([a, b]) => [a, b, 0]), ...arcPts(s0, t0, r, 90, 270, 5).map(([a, b]) => [a, b, 0])];
  const pivot = [s0 + len, t0, cw];
  const body = xform(PF(pts, { w: th, cw, bevel, bevelSeg: 1 }), { rot: [0, tilt * sd, 0], pivot });
  const bead = rim ? xform(sweep(atW(arcPts(s0, t0, r - 0.75, 98, 262, 6), cw + sd * (th / 2 - 0.05)), 0.4, { seg: 4, radial: 3 }), { rot: [0, tilt * sd, 0], pivot }) : null;
  return { body, bead };
}

// 3x5 pixel font for the roll-marks (gold inlay, flush but for 0.06 mm)
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
/** pixel lettering on the face plane w0 (side = ±1): sunk `sink` into the part, `proud` above it */
function stamp(str, at, { px = 0.6, side = 1, proud = 0.06, sink = 0.35 } = {}) {
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
        parts.push(box([sc, t0 - (r + 0.5) * px, w0 + side * (proud - sink) / 2], [(e - c) * px, px, proud + sink], { r: 0 }));
        c = e;
      }
    });
    col += gl[0].length + 1;
  }
  return merge(parts);
}
// house emblem: a curling wave under a dragon's eye (original)
const WAVE = ['0011100', '0100010', '1001010', '1000100', '0100001', '1011110', '0100001'];

// ------------------------------------------------------------------------------------------ surface helpers
// The kit extrudes flat profiles; the head, the fish body, the locks, the tongue and the cloisonné strips below are
// lofts / sweeps of a varying section, and side-plane plates are bent onto curved bodies (warp).

const vadd = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vnorm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const vmul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const mirW = (p) => [p[0], p[1], -p[2]];

const fin = (geo, crease = 40) => {
  for (const k of Object.keys(geo.attributes)) if (k !== 'position') geo.deleteAttribute(k);
  return toCreasedNormals(geo.index ? geo.toNonIndexed() : geo, crease * D2R);
};

/** monotone cubic through [[x, y], ...] (x ascending): no overshoot between stations */
function pchip(pts) {
  const n = pts.length, x = pts.map((p) => p[0]), y = pts.map((p) => p[1]), h = [], d = [];
  for (let i = 0; i < n - 1; i++) { h.push(x[i + 1] - x[i]); d.push((y[i + 1] - y[i]) / h[i]); }
  const m = new Array(n);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (3 * (h[i - 1] + h[i])) / ((2 * h[i] + h[i - 1]) / d[i - 1] + (h[i] + 2 * h[i - 1]) / d[i]);
  return (X) => {
    if (X <= x[0]) return y[0];
    if (X >= x[n - 1]) return y[n - 1];
    let i = 0;
    while (X > x[i + 1]) i++;
    const u = (X - x[i]) / h[i], u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * y[i] + (u3 - 2 * u2 + u) * h[i] * m[i] + (-2 * u3 + 3 * u2) * y[i + 1] + (u3 - u2) * h[i] * m[i + 1];
  };
}
function segDist(s, t, w, a, b) {
  const ds = b[0] - a[0], dt = b[1] - a[1], dw = b[2] - a[2], L2 = ds * ds + dt * dt + dw * dw;
  const k = L2 ? Math.max(0, Math.min(1, ((s - a[0]) * ds + (t - a[1]) * dt + (w - a[2]) * dw) / L2)) : 0;
  return Math.hypot(s - a[0] - ds * k, t - a[1] - dt * k, w - a[2] - dw * k);
}

/**
 * A lofted body along s. Stations [s, A (half width), top, c (height of the widest line), bot, nT, nB]: at each s a
 * superellipse section (crown squareness nT, belly nB), optionally clamped flat at floor(s) / ceil(s) and scaled
 * about c by scale(s) (rounded ends). Sculpt brushes push the surface along the section normal: [polyline of [s, t,
 * w >= 0] (mirrored to both sides), radius, height, mesa?] with a smooth (1 - x²)² falloff (mesa: flat-topped out to
 * that fraction of the radius), or (s, t, |w|) => mm for shaped ones.
 */
class Body {
  constructor(st, { floor = null, ceil = null, scale = null, brushes = [] } = {}) {
    const col = (k) => pchip(st.map((r) => [r[0], r[k]]));
    this.A = col(1); this.top = col(2); this.c = col(3); this.bot = col(4); this.nT = col(5); this.nB = col(6);
    this.floor = floor; this.ceil = ceil; this.scale = scale; this.brushes = brushes;
  }
  sec(s, th) {
    const c = this.c(s), cs = Math.cos(th), sn = Math.sin(th), up = sn >= 0, n = up ? this.nT(s) : this.nB(s);
    const k = this.scale ? this.scale(s) : 1;
    const w = k * this.A(s) * Math.sign(cs) * Math.abs(cs) ** (2 / n);
    let t = c + k * (up ? this.top(s) - c : c - this.bot(s)) * Math.sign(sn) * Math.abs(sn) ** (2 / n);
    if (this.floor) t = Math.max(t, this.floor(s));
    if (this.ceil) t = Math.min(t, this.ceil(s));
    return [t, w];
  }
  disp(s, t, w) {
    let d = 0;
    const aw = Math.abs(w);
    for (const b of this.brushes) {
      if (typeof b === 'function') { d += b(s, t, aw); continue; }
      const [pts, r, h, mesa] = b;
      let m = Infinity;
      for (let i = 0; i < Math.max(1, pts.length - 1); i++) m = Math.min(m, segDist(s, t, aw, pts[i], pts[Math.min(i + 1, pts.length - 1)]));
      if (m < r) { const x = mesa ? Math.max(0, (m / r - mesa) / (1 - mesa)) : m / r; d += h * (1 - x * x) ** 2; }
    }
    return d;
  }
  pt(s, th) {
    const [t, w] = this.sec(s, th);
    if (!this.brushes.length || (this.floor && t <= this.floor(s) + 1e-6) || (this.ceil && t >= this.ceil(s) - 1e-6)) return [s, t, w];
    const e = 1e-3, [ta, wa] = this.sec(s, th - e), [tb, wb] = this.sec(s, th + e);
    let nw = tb - ta, nt = -(wb - wa);
    const l = Math.hypot(nw, nt) || 1, d = this.disp(s, t, w);
    nw /= l; nt /= l;
    return [s, t + nt * d, w + nw * d];
  }
  /** right-side section angle at height t (t rises with th from the bottom to the crown) */
  thAt(s, t) { let a = -Math.PI / 2 + 1e-4, b = Math.PI / 2 - 1e-4; for (let k = 0; k < 36; k++) { const m = (a + b) / 2; if (this.pt(s, m)[1] < t) a = m; else b = m; } return (a + b) / 2; }
  hw(s, t) { return this.pt(s, this.thAt(s, t))[2]; }
  /** crown angle at half width w (w falls from A to 0 as th goes 0 -> 90°) */
  thTop(s, w) { let a = 0, b = Math.PI / 2; for (let k = 0; k < 36; k++) { const m = (a + b) / 2; if (this.pt(s, m)[2] > w) a = m; else b = m; } return (a + b) / 2; }
  topAt(s, w) { return this.pt(s, this.thTop(s, Math.abs(w)))[1]; }
  frame(s, th) {
    const P = this.pt(s, th);
    const U = vsub(this.pt(s, th + 0.01), this.pt(s, th - 0.01)), S = vsub(this.pt(s + 0.25, th), this.pt(s - 0.25, th));
    let N = vnorm(vcross(S, U));
    if (vdot(N, [0, P[1] - this.c(s), P[2]]) < 0) N = vmul(N, -1);
    return { P, N, T: vnorm(S) };
  }
  frameAt(s, t, sd = 1) { const f = this.frame(s, this.thAt(s, t)); return sd > 0 ? f : { P: mirW(f.P), N: mirW(f.N), T: mirW(f.T) }; }
  frameTop(s, w) { const f = this.frame(s, this.thTop(s, Math.abs(w))); return w >= 0 ? f : { P: mirW(f.P), N: mirW(f.N), T: mirW(f.T) }; }
  rings(sList, M) {
    return sList.map((s) => { const r = []; for (let j = 0; j < M; j++) r.push(V(...this.pt(s, -Math.PI / 2 + (2 * Math.PI * j) / M))); return r; });
  }
}
/** station list s0..s1 with fine rings at both ends (for the rounded end bevels) */
function sList(s0, s1, step, ends = [0, 0.35, 1, 2, 3]) {
  const out = ends.map((e) => s0 + e);
  for (let s = s0 + ends[ends.length - 1] + step; s < s1 - ends[ends.length - 1] - step * 0.5; s += step) out.push(s);
  for (const e of ends.slice().reverse()) out.push(s1 - e);
  return out;
}

/** Closed loft through rings of three-space points; fan caps; winding made outward (sides vs. ring centres, caps vs. ends). */
function skin(rows, { capA = true, capB = true, crease = 50 } = {}) {
  const n = rows[0].length, R = rows.length, pos = [];
  for (const r of rows) for (const p of r) pos.push(p.x, p.y, p.z);
  const cen = rows.map((r) => r.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / n));
  const P = (k) => new THREE.Vector3(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
  const nrm = (a, b, c) => { const A = P(a); return P(b).sub(A).cross(P(c).sub(A)); };
  const tris = [];
  for (let i = 0; i + 1 < R; i++) for (let j = 0; j < n; j++) {
    const a = i * n + j, b = i * n + ((j + 1) % n), c = (i + 1) * n + j, d = (i + 1) * n + ((j + 1) % n);
    tris.push([a, c, b], [b, c, d]);
  }
  let o = 0;
  tris.forEach((tr, k) => {
    const i = Math.floor(k / (2 * n));
    o += nrm(...tr).dot(P(tr[0]).add(P(tr[1])).add(P(tr[2])).multiplyScalar(1 / 3).sub(cen[i].clone().add(cen[i + 1]).multiplyScalar(0.5)));
  });
  if (o < 0) for (const tr of tris) [tr[1], tr[2]] = [tr[2], tr[1]];
  const cap = (i, out) => {
    const c = pos.length / 3;
    pos.push(cen[i].x, cen[i].y, cen[i].z);
    const list = [];
    for (let j = 0; j < n; j++) list.push([c, i * n + j, i * n + ((j + 1) % n)]);
    let q = 0;
    for (const tr of list) q += nrm(...tr).dot(out);
    if (q < 0) for (const tr of list) [tr[1], tr[2]] = [tr[2], tr[1]];
    tris.push(...list);
  };
  if (capA) cap(0, cen[0].clone().sub(cen[1]));
  if (capB) cap(R - 1, cen[R - 1].clone().sub(cen[R - 2]));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(tris.flat());
  return fin(geo, crease);
}

// unit sections for ribbon(): x across, y up
const SEC = {
  rect: [[-1, -1], [1, -1], [1, 1], [-1, 1]],                                   // flat cloisonné strip
  round6: Array.from({ length: 6 }, (_, i) => [Math.cos((i / 6) * Math.PI * 2), Math.sin((i / 6) * Math.PI * 2)]),
  lens: Array.from({ length: 10 }, (_, i) => [Math.cos((i / 10) * Math.PI * 2), Math.sin((i / 10) * Math.PI * 2)]),
  groove1: [[-1, 0], [-0.75, -0.7], [0, -0.9], [0.75, -0.7], [1, 0], [0.78, 0.66], [0.32, 0.95], [0, 0.45], [-0.32, 0.95], [-0.78, 0.66]],
  groove2: [[-1, 0], [-0.7, -0.72], [0, -0.92], [0.7, -0.72], [1, 0], [0.84, 0.58], [0.58, 0.86], [0.42, 0.42], [0.26, 0.9], [-0.26, 0.9], [-0.42, 0.42], [-0.58, 0.86], [-0.84, 0.58]],
};
/**
 * Sweep of a section along [s, t, w] points: wf(u) / hf(u) = half width / half height (mm); up = [s, t, w] or
 * (u) => [s, t, w]: the section's y axis leans towards it (a strip lying on a face: up = the face normal).
 */
function ribbon(points, sec, { wf = () => 1, hf = () => 1, up = [0, 1, 0], seg = 24, tension = 0.5, crease = 40, capA = true, capB = true } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => V(...p)), false, 'catmullrom', tension);
  const rows = [], P = new THREE.Vector3(), T = new THREE.Vector3(), L = new THREE.Vector3(), U = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    curve.getPointAt(u, P); curve.getTangentAt(u, T);
    U.copy(V(...(typeof up === 'function' ? up(u) : up)));
    L.crossVectors(T, U).normalize(); U.crossVectors(L, T).normalize();
    const w = Math.max(0.03, wf(u)), h = Math.max(0.03, hf(u));
    rows.push(sec.map(([x, y]) => P.clone().addScaledVector(L, x * w).addScaledVector(U, y * h)));
  }
  return skin(rows, { crease, capA, capB });
}
/** flat gilt strip lying on the side plane at w (sd = side): pts [s, t], half width hw, half thickness hh */
const flat = (pts, w, sd, hw = 0.32, hh = 0.22, seg) =>
  ribbon(atW(pts, w + sd * hh), SEC.rect, { wf: () => hw, hf: () => hh, up: [0, 0, sd], seg: seg ?? Math.max(4, Math.round(plen(pts) / 1.3)) });

/** geometry authored round the origin in side-plane terms (w = out of the surface) placed at P with normal N, +s along T */
function placeOn(geo, P, N, T) {
  const n = V(...N).normalize(), t = V(...T);
  t.addScaledVector(n, -t.dot(n)).normalize();
  const nt = t.clone().negate(), b = new THREE.Vector3().crossVectors(nt, n);
  return geo.applyMatrix4(new THREE.Matrix4().makeBasis(n, b, nt).setPosition(V(...P)));
}
/** moves every vertex: [s, t, w] -> fn(s, t, w) (plates bent onto curved bodies), optionally tessellated first */
function warp(geo, fn, { tess = 0, crease = 40 } = {}) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (tess) g = new TessellateModifier(tess, 8).modify(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const [s, t, w] = fn(-p.getZ(i), p.getY(i), p.getX(i)); p.setXYZ(i, w, t, -s); }
  return fin(g, crease);
}
/** point in polygon ([s, t]) at least m from its edges */
function insidePoly(poly, s, t, m = 0) {
  let inside = false, d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [si, ti] = poly[i], [sj, tj] = poly[j];
    if ((ti > t) !== (tj > t) && s < ((sj - si) * (t - ti)) / (tj - ti) + si) inside = !inside;
    d = Math.min(d, segDist(s, t, 0, [si, ti, 0], [sj, tj, 0]));
  }
  return inside && d >= m;
}
/** checkering: 4-sided pyramids {c, n, a, b, h} (base diamond c ± a, c ± b, apex c + n h), all gun-space arrays */
function pyramids(list) {
  const pos = [];
  for (const { c, n, a, b, h } of list) {
    const q = [vadd(c, a), vadd(c, b), vadd(c, a, -1), vadd(c, b, -1)].map((p) => V(...p)), ap = V(...vadd(c, n, h)), C = V(...c);
    for (let k = 0; k < 4; k++) {
      let A = q[k], B = q[(k + 1) % 4];
      const nn = B.clone().sub(A).cross(ap.clone().sub(A)), out = A.clone().add(B).multiplyScalar(0.5).sub(C).add(ap.clone().sub(C).multiplyScalar(0.3));
      if (nn.dot(out) < 0) [A, B] = [B, A];
      pos.push(A.x, A.y, A.z, B.x, B.y, B.z, ap.x, ap.y, ap.z);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return fin(geo, 30);
}

/**
 * Pre-bake (metres, non-indexed): coplanar, vertex-connected triangle groups at least `width` wide (true flat faces
 * of the extrusions) get their exact face normal. The kit creases at 38°, so a flat face bordering a 3-step bevel
 * inherits the bevel's tilted normals and smears them across its long earcut triangles (the streaks and wedges on
 * the porcelain flanks). Lofted surfaces never form groups that wide. mergeVertices in the bake keeps the copies.
 */
function flattenFaces(geo, { width = 0.004, cos = 0.9995 } = {}) {
  const Pa = geo.attributes.position, Na = geo.attributes.normal;
  if (!Pa || !Na || geo.index) return;
  const nt = Pa.count / 3, A = Pa.array;
  const fn = new Float64Array(nt * 3), ar = new Float64Array(nt);
  for (let t = 0; t < nt; t++) {
    const a = t * 9, ux = A[a + 3] - A[a], uy = A[a + 4] - A[a + 1], uz = A[a + 5] - A[a + 2], vx = A[a + 6] - A[a], vy = A[a + 7] - A[a + 1], vz = A[a + 8] - A[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz);
    ar[t] = l / 2;
    if (l > 0) { fn[t * 3] = nx / l; fn[t * 3 + 1] = ny / l; fn[t * 3 + 2] = nz / l; }
  }
  const map = new Map(), vid = new Int32Array(Pa.count);
  let W = 0;
  for (let i = 0; i < Pa.count; i++) {
    const k = Math.round(A[i * 3] * 2e5) + ',' + Math.round(A[i * 3 + 1] * 2e5) + ',' + Math.round(A[i * 3 + 2] * 2e5);
    let id = map.get(k);
    if (id === undefined) { id = W++; map.set(k, id); }
    vid[i] = id;
  }
  const par = Int32Array.from({ length: nt }, (_, i) => i);
  const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  const byV = Array.from({ length: W }, () => []);
  for (let t = 0; t < nt; t++) if (ar[t] > 0) for (let k = 0; k < 3; k++) byV[vid[t * 3 + k]].push(t);
  for (const list of byV) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const s = list[i], t = list[j];
    if (fn[s * 3] * fn[t * 3] + fn[s * 3 + 1] * fn[t * 3 + 1] + fn[s * 3 + 2] * fn[t * 3 + 2] > cos) { const a = find(s), b = find(t); if (a !== b) par[a] = b; }
  }
  // width of each group: minor axis of its in-plane second moment
  const M = new Map();
  for (let t = 0; t < nt; t++) {
    if (!ar[t]) continue;
    const r = find(t);
    let m = M.get(r);
    if (!m) {
      const n = [fn[t * 3], fn[t * 3 + 1], fn[t * 3 + 2]], h = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      const u = vnorm(vcross(n, h)), v = vcross(n, u);
      m = { u, v, A: 0, x: 0, y: 0, xx: 0, yy: 0, xy: 0 };
      M.set(r, m);
    }
    const q = [0, 1, 2].map((k) => { const i = (t * 3 + k) * 3, p = [A[i], A[i + 1], A[i + 2]]; return [vdot(p, m.u), vdot(p, m.v)]; });
    const gx = (q[0][0] + q[1][0] + q[2][0]) / 3, gy = (q[0][1] + q[1][1] + q[2][1]) / 3, a = ar[t];
    let cxx = 0, cyy = 0, cxy = 0;
    for (const [x, y] of q) { cxx += (x - gx) ** 2; cyy += (y - gy) ** 2; cxy += (x - gx) * (y - gy); }
    m.A += a; m.x += a * gx; m.y += a * gy;
    m.xx += a * (gx * gx + cxx / 12); m.yy += a * (gy * gy + cyy / 12); m.xy += a * (gx * gy + cxy / 12);
  }
  const isFace = new Map();
  for (const [r, m] of M) {
    const X = m.x / m.A, Y = m.y / m.A, sxx = m.xx / m.A - X * X, syy = m.yy / m.A - Y * Y, sxy = m.xy / m.A - X * Y;
    const lmin = (sxx + syy) / 2 - Math.sqrt(((sxx - syy) / 2) ** 2 + sxy * sxy);
    isFace.set(r, Math.sqrt(Math.max(0, 12 * lmin)) >= width);
  }
  for (let t = 0; t < nt; t++) if (ar[t] > 0 && isFace.get(find(t))) for (let k = 0; k < 3; k++) Na.setXYZ(t * 3 + k, fn[t * 3], fn[t * 3 + 1], fn[t * 3 + 2]);
  Na.needsUpdate = true;
}
/**
 * Splits triangles by the planes s = k * step (metres; three z = -s): the long faces of the extrusions and lathes
 * along the gun become strips. Longest-edge bisection (TessellateModifier) turns each 0.3 m sliver into ~1000
 * triangles before it gets under the bake length. Non-indexed position + normal in, the same out.
 */
function sliceS(geo, step) {
  const P = geo.attributes.position.array, N = geo.attributes.normal.array, op = [], on = [];
  const vert = (i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2], N[i * 3], N[i * 3 + 1], N[i * 3 + 2]];
  const emit = (poly) => {
    for (let i = 1; i + 1 < poly.length; i++) for (const v of [poly[0], poly[i], poly[i + 1]]) {
      const l = Math.hypot(v[3], v[4], v[5]) || 1;
      op.push(v[0], v[1], v[2]); on.push(v[3] / l, v[4] / l, v[5] / l);
    }
  };
  for (let t = 0; t < P.length / 9; t++) {
    let poly = [vert(t * 3), vert(t * 3 + 1), vert(t * 3 + 2)];
    const z0 = Math.min(poly[0][2], poly[1][2], poly[2][2]), z1 = Math.max(poly[0][2], poly[1][2], poly[2][2]);
    if (z1 - z0 > step) {
      for (let k = Math.floor(z0 / step) + 1; k * step < z1 && poly.length >= 3; k++) {
        const pl = k * step, lo = [], hi = [];
        for (let i = 0; i < poly.length; i++) {
          const a = poly[i], b = poly[(i + 1) % poly.length];
          (a[2] < pl ? lo : hi).push(a);
          if ((a[2] < pl) !== (b[2] < pl)) { const f = (pl - a[2]) / (b[2] - a[2]); const m = a.map((x, j) => x + (b[j] - x) * f); lo.push(m); hi.push(m); }
        }
        if (lo.length >= 3) emit(lo);
        poly = hi;
      }
    }
    if (poly.length >= 3) emit(poly);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(op, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(on, 3));
  return out;
}
/** glass, water, glow and the eyes need no AO detail: left untessellated */
const NO_TESS = /:(glass|glass_clear|glow_ice|lens|crystal)$/;
/** wear per mesh 'part:mat' / '*:mat' for m4's postBake: [curvature (1/m) for full wear, cap]. Glaze chips only on
 * true edges (bevels under ~1 mm) and never past 0.45, so the biscuit shows as a rim, not as grey smudges. */
const WEAR = {
  '*:porcelain': [1 / 900, 0.45], '*:glaze_cobalt': [1 / 900, 0.45], '*:glaze_jade': [1 / 900, 0.45], '*:lacquer_red': [1 / 900, 0.4],
  '*:gold': [1 / 700, 0.55], '*:brass': [1 / 600, 0.6], '*:copper': [1 / 600, 0.6], '*:steel_dark': [1 / 1000, 0.6], '*:steel': [1 / 800, 0.7],
  '*:steel_bright': [1 / 500, 0.8], '*:black_chrome': [1 / 1000, 0.5], '*:chrome': [0, 0], '*:polymer_grip': [1 / 450, 0.6], '*:rubber': [1 / 450, 0.5],
  '*:crystal': [0, 0], '*:glow_ice': [0, 0], '*:glass': [0, 0], '*:glass_clear': [0, 0], '*:lens': [0, 0],
};

// ------------------------------------------------------------------------------------------ model

export default function build() {
  const g = new Gun('chiwen');
  const RAIL_T = 24;
  const AIM = 62;                  // holo window centre
  const MUZZLE = 696;              // the mouth
  const HG0 = 240, HG1 = 542;      // handguard
  const TT = -24.5, TW = 18.6;     // water tube axis (lower right of the handguard)
  const TS0 = 250, TS1 = 534;      // water tube ends (fittings outside)
  const ROOF = 9.6, FLOOR = -9.6;  // the mouth: roof of the upper jaw, floor of the lower

  // ======================================================================== upper receiver
  const upperSec = [[-15, -12, 1], [15, -12, 1], [15, 14, 2.5], [12.6, 20, 1.5], [11, 24, 0], [-11, 24, 0], [-12.6, 20, 1.5], [-15, 14, 2.5]];
  let upper = SC(upperSec, 0, HG0, { bevel: 1.2 });
  const serr = [];
  for (const sd of [1, -1]) for (let k = 0; k < 6; k++) serr.push(box([3.6 + k * 2.3, 8.6, 15 * sd], [0.9, 9.4, 1.6], { r: 0 }));   // rear grip serrations
  upper = cut(upper, [
    PF([[120, -7, 2.5], [186, -7, 2.5], [186, 9, 2.5], [120, 9, 2.5]], { w: 40, cw: 9, bevel: 0 }),   // ejection port
    cutters.box([160, -12.5, 0], [78, 17, 25]),                                                          // magazine / feed opening
    PF([[172, 2.4, 2.6], [236, 2.4, 2.6], [236, 9.6, 2.6], [172, 9.6, 2.6]], { w: 12, cw: -15, bevel: 0 }),   // charging slot, left
    // lightening flutes on both flanks (rear half)
    PF([[10, 15, 1.4], [108, 15, 1.4], [108, 17.4, 1.4], [10, 17.4, 1.4]], { w: 2, cw: 15.2, bevel: 0 }),
    PF([[10, 15, 1.4], [160, 15, 1.4], [160, 17.4, 1.4], [10, 17.4, 1.4]], { w: 2, cw: -15.2, bevel: 0 }),
    merge(serr),
  ]);
  g.add(upper, 'steel_dark');
  g.add(lightRail(4, 140, RAIL_T), 'steel_dark');
  // gilt inlay lines in the flutes (the 30 % trim)
  g.add(box([59, 16.2, 14.85], [96, 1.2, 0.6], { r: 0.2, seg: 1 }), 'gold');
  g.add(box([85, 16.2, -14.85], [148, 1.2, 0.6], { r: 0.2, seg: 1 }), 'gold');
  // gilt cloud-scroll filigree (flat cloisonné strips) in a beaded frame on both flanks, s 36..112
  for (const sd of [1, -1]) {
    const w = 15 * sd, s0 = 36, s1 = 112;
    const fr = [[s0, -9.6], [s1, -9.6], [s1, 10.6], [s0, 10.6]];
    const wires = [];
    for (let i = 0; i < 4; i++) wires.push(strip(fr[i], fr[(i + 1) % 4], w + sd * 0.25, 0.7, 0.5));
    const n = 3, span = (s1 - s0) / n;
    for (let i = 0; i < n; i++) {
      const f = i % 2 ? -1 : 1, cs = s0 + 5 + i * span + (f < 0 ? 15 : 0);
      wires.push(flat(cloudPts(cs, -3.6 + (i % 2) * 2.2, 4.6, f), w, sd, 0.3, 0.2, 34));
    }
    // a running tendril linking the clouds along the top of the panel
    const ten = [];
    for (let s = s0 + 3; s <= s1 - 3; s += 3) ten.push([s, 6.8 + Math.sin((s - s0) * 0.21) * 1.5]);
    wires.push(flat(ten, w, sd, 0.26, 0.18));
    for (const [s, t] of fr) wires.push(dome([s, t, w], 0.9, sideAx(sd), 0.6));
    g.add(merge(wires), 'gold');
  }
  // ejection-port brass deflector
  g.add(PL([[188, 13.6], [204, 13.6], [204, 17, 0.8], [200, 21.6, 2], [192, 21, 3], [188, 17.2, 2]], { h: 14, ct: 2, bevel: 1 }), 'steel_dark');
  // gilt bead round the ejection port
  {
    const ep = [[119.2, -8, 3], [186.8, -8, 3], [186.8, 10, 3], [119.2, 10, 3]];
    const pts = [];
    for (let i = 0; i < 4; i++) { const a = ep[i], b = ep[(i + 1) % 4]; for (let k = 0; k < 4; k++) pts.push([a[0] + (b[0] - a[0]) * k / 4, a[1] + (b[1] - a[1]) * k / 4]); }
    pts.push(pts[0]);
    g.add(sweep(atW(pts, 15.1), 0.45, { seg: 64, radial: 4, tension: 0.05 }), 'gold');
  }
  // dust cover, open: a door hanging under the port on its hinge rod, a gilt wave on its face, a latch nib
  {
    const piv = [153, -9.4, 15.3], open = { rot: [0, 0, 14], pivot: piv };
    g.add(xform(merge([PF([[121.5, -9.8, 0.6], [184.5, -9.8, 0.6], [184.5, -20.2, 1.6], [121.5, -20.2, 1.6]], { w: 1.2, cw: 15.9, bevel: 0.4 }),
      box([153, -19.6, 16.7], [8, 1.4, 1.2], { r: 0.4, seg: 1 })]), open), 'steel_dark');
    const wv = [];
    for (let i = 0; i <= 26; i++) wv.push([125 + i * 2.2, -15 + Math.sin(i * 0.62) * 1.7]);
    g.add(xform(flat(wv, 16.5, 1, 0.28, 0.18), open), 'gold');
    g.add(cyl(120, 186, 1.0, { t: -9.4, w: 15.3, seg: 10 }), 'steel');
  }
  // receiver pins / screws
  for (const [s, t] of [[18, -6], [222, -6], [222, 6]]) for (const sd of [1, -1]) g.add(pinEnd([s, t, 15 * sd], 1.6, sideAx(sd), 0.5), 'steel');
  for (const s of [30, 196]) for (const sd of [1, -1]) g.add(hexHead([s, 4, 15.2 * sd], 2.4, sideAx(sd), 0.9), 'steel_bright');
  for (const sd of [1, -1]) g.add(capScrew([234, 12.4, 15 * sd], 1.5, sideAx(sd), 0.7, 8), 'steel_bright');

  // roll-marks (left, original), gold-inlaid between the filigree panel and the charging slot, and the house emblem
  g.add(stamp('CHIWEN TIDEWARDEN', [168, 11.4, -15], { px: 0.55, side: -1 }), 'gold');
  g.add(stamp('M07 7.62X51', [168, 4.9, -15], { px: 0.5, side: -1 }), 'gold');
  g.add(stamp(WAVE, [128, 8, -15], { px: 0.9, side: -1, proud: 0.32, sink: 0.1 }), 'gold');

  // 九子共鳴燈 (§1.3): Ø6 crystal in a gilt bezel on the right receiver flank, ahead of the screws
  {
    const at = [231, 0.5, 15];
    g.add(lax([[0, 0], [0, 4.8], [0.9, 4.8], [1.7, 4.1], [1.7, 3.2], [0.9, 3.05], [0.9, 0]], at, 'w', 20), 'gold');
    for (let k = 0; k < 4; k++) { const a = (45 + k * 90) * D2R; g.add(dome([at[0] + Math.cos(a) * 3.95, at[1] + Math.sin(a) * 3.95, 16.6], 0.45, 'w', 0.4, 5), 'steel_bright'); }
    const lamp = g.part('fx_resonance', { pivot: at, extras: { pv: { preset: 'pv_crystal', coreTint: '#c8843a', gem: 0.55 }, note: '九子共鳴燈: colour by the 九子 owned (bronze / teal / vermilion / gold), <= 0.4x the hero' } });
    lamp.add(sphere([at[0], at[1], at[2] + 0.6], 3.0, { seg: 14, scale: [1, 1, 0.8] }), 'crystal');
  }

  // ======================================================================== bolt (left charging handle + carrier in the port)
  const bolt = g.part('bolt', { pivot: [214, 6, -15], extras: { travel: 0.09 } });
  bolt.add(box([214, 6, -22.5], [10, 6.4, 15], { r: 2, seg: 2 }), 'steel_dark');
  bolt.add(PF(gearPts(214, 6, 6.1, 5.5, 28), { w: 9, cw: -34.6, bevel: 0.35, curveSeg: 1 }), 'polymer_grip');     // knurled knob
  bolt.add(lax([[0, 0], [0, 5.7], [0.8, 5.5], [1.3, 4.6], [1.5, 0]], [214, 6, -39], '-w', 20), 'polymer_grip');
  bolt.add(lax([[0, 6.2], [0, 6.6], [0.6, 6.6], [0.6, 6.2]], [214.8, 6, -29.6], '-w', 16), 'gold');
  {
    // carrier: sand-cut grooves, the cam pin and a keyed gas block seen through the port
    let car = lathe([[96, 0], [96, 11.2], [97, 12], [202, 12], [203, 11.2], [203, 0]], { seg: 24 });
    car = cut(car, [merge([0, 1, 2, 3].map((k) => washer(124 + k * 3.4, 125.4 + k * 3.4, 11.1, 13, 0.2, 24)))]);
    bolt.add(car, 'steel_bright');
    bolt.add(cut(box([158, 6, 10], [44, 5, 6], { r: 1 }), [cutters.box([158, 6, 10], [40, 1.2, 8])]), 'steel_bright');
    bolt.add(lax([[0, 0], [0, 2.6], [2.2, 2.6], [2.9, 1.9], [2.9, 0]], [168, -1.5, 10.6], 'w', 14), 'steel');
    for (const s0 of [142, 174]) bolt.add(capScrew([s0, 8.6, 10], 1.2, 't', 0.5, 6), 'steel_dark');
  }

  // ======================================================================== lower receiver (porcelain glaze), magwell
  const lowerMain = PF([[-12, -11.6, 1.5], [206, -11.6, 1], [206, -22, 0.5], [118, -22, 0], [116, -44, 2], [-2, -44, 3],
    [-10, -36, 5], [-14, -20, 3]], { w: 28, bevel: 1.4 });
  const magwell = PF([[116, -21, 1], [206, -21, 1], [208, -58, 1.5], [213, -63, 2], [213, -68, 1.5], [116, -68, 2], [113, -58, 2]], { w: 34, bevel: 1.6 });
  let lower = union(lowerMain, magwell);
  lower = cut(lower, [cutters.box([160, -45, 0], [79, 72, 25.5]), cutters.box([95, -44, 0], [24, 12, 8])]);
  g.add(lower, 'porcelain');
  // gilt rim round the magwell mouth, gilt seam bead between upper and lower receiver
  g.add(PF([[114, -66.6, 1.5], [214, -66.6, 1.5], [214, -69.2, 1.5], [114, -69.2, 1.5]], { w: 35, bevel: 0.6 }), 'gold');
  for (const sd of [1, -1]) g.add(strip([-11, -12.4], [205, -12.4], 14.15 * sd, 0.8, 0.5), 'gold');
  // gilt-edged panel on both lower flanks (over the trigger pocket) with a cloud pair, a wave crest by the trigger
  for (const sd of [1, -1]) {
    const w = 14 * sd, pn = [[47, -15.2, 2.6], [106, -15.2, 2.6], [106, -27.4, 2.6], [47, -27.4, 2.6]];
    const ring = [];
    for (let i = 0; i <= 40; i++) { const sh = makeShape(pn).getPoint(i / 40); ring.push([sh.x, sh.y]); }
    const gl = [flat(ring, w, sd, 0.36, 0.22, 40)];
    gl.push(flat(cloudPts(58, -23.6, 2.5, 1), w, sd, 0.26, 0.18, 24), flat(cloudPts(95, -23.6, 2.5, -1), w, sd, 0.26, 0.18, 24));
    const vine = [];
    for (let s = 66; s <= 86; s += 2) vine.push([s, -21.3 + Math.sin((s - 66) * 0.32) * 1.4]);
    gl.push(flat(vine, w, sd, 0.24, 0.18));
    const crest = [[50, -41.8], [54, -40.4], [58, -38.6], [61.6, -37.8], [63.2, -38.8], [62, -40], [60.6, -39.4]];
    gl.push(flat(crest, w, sd, 0.3, 0.2, 18), flat([[63.6, -41.8], [68, -40.6], [72, -39.2], [75, -39.6]], w, sd, 0.26, 0.18, 10));
    g.add(merge(gl), 'gold');
  }
  // cobalt enamel medallion on the right magwell flank: gilt bezel, enamel, a gilt wave-and-eye relief (house emblem)
  {
    const C = [166, -45], W0 = 17;
    g.add(lax([[0, 0], [0, 12.2], [1.0, 12.2], [1.7, 11.5], [1.7, 9.9], [1.0, 9.6], [1.0, 0]], [C[0], C[1], W0 - 0.2], 'w', 28), 'gold');
    g.add(lax([[0, 0], [0, 9.6], [1.25, 9.4], [1.35, 0]], [C[0], C[1], W0 - 0.1], 'w', 28), 'glaze_cobalt');
    const relief = [];
    relief.push(flat([[C[0] - 8, C[1] - 4.2], [C[0] - 4, C[1] - 2.6], [C[0] - 0.5, C[1] - 3.2], [C[0] + 2.5, C[1] - 1], [C[0] + 3.4, C[1] + 2.4], [C[0] + 1.4, C[1] + 4.2], [C[0] - 0.8, C[1] + 2.6], [C[0] + 0.4, C[1] + 1.2]], W0 + 1.25, 1, 0.42, 0.22, 26));
    relief.push(flat(spiral(C[0] - 4.2, C[1] + 1.6, 2.2, 0.5, 200, -160, 12), W0 + 1.25, 1, 0.32, 0.2, 14));
    relief.push(flat([[C[0] - 7.5, C[1] - 6.4], [C[0] - 2, C[1] - 5.6], [C[0] + 3, C[1] - 6.2], [C[0] + 7.5, C[1] - 5.4]], W0 + 1.25, 1, 0.3, 0.2, 10));
    relief.push(lax([[0, 0], [0, 1.3], [0.5, 1.0], [0.7, 0]], [C[0] + 4.2, C[1] + 4.6, W0 + 1.25], 'w', 8));   // the eye
    g.add(merge(relief), 'gold');
  }
  // 如意 wave cartouche on the left magwell flank: gilt rim plate, cobalt enamel, three stacked gilt wave crests, a pearl
  {
    const W0 = -17, cart = [[143, -45, 0], [146.5, -38.8, 2.5], [151, -36.4, 2.5], [181, -36.4, 2.5], [185.5, -38.8, 2.5], [189, -45, 0],
      [185.5, -51.2, 2.5], [181, -53.6, 2.5], [151, -53.6, 2.5], [146.5, -51.2, 2.5]];
    const inset = cart.map(([s, t, r]) => [166 + (s - 166) * 0.93, -45 + (t + 45) * 0.86, r]);
    g.add(PF(cart, { w: 1.2, cw: W0 - 0.3, bevel: 0.4, bevelSeg: 1 }), 'gold');
    g.add(PF(inset, { w: 1.3, cw: W0 - 0.75, bevel: 0.3, bevelSeg: 1 }), 'glaze_cobalt');
    const rel = [];
    for (const [b, ph] of [[-51, 0], [-46.6, 4.5], [-42.2, 9]]) {
      const pts = [];
      for (let s = 152 - ph % 9; s <= 181; s += 1.5) { const u = ((s - 152 + ph) % 9) / 9; pts.push([s, b + (u < 0.75 ? Math.sin(u / 0.75 * Math.PI / 2) * 2.4 : 2.4 * (1 - (u - 0.75) / 0.25) ** 1.5)]); }
      rel.push(flat(pts.filter(([s]) => s > 151 && s < 181.5), W0 - 1.4, -1, 0.26, 0.18));
    }
    rel.push(dome([166, -39.4, W0 - 1.35], 1.4, '-w', 0.9, 10));
    g.add(merge(rel), 'gold');
  }
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
  for (const sd of [1, -1]) { g.add(rollPin([95, -30, 14 * sd], 1.5, sideAx(sd)), 'steel'); g.add(rollPin([80, -33, 14 * sd], 1.5, sideAx(sd)), 'steel'); }

  // ======================================================================== trigger, selector
  const trig = g.part('trigger', { pivot: [95, -30, 0], extras: { axis: 'x', pullDeg: -12 } });
  trig.add(PF([[90.5, -33, 2], [100, -33, 2], [100.5, -44, 0], [98.2, -50, 6], [99.8, -56.6, 1.5], [97.4, -58, 1.2], [93.4, -51, 6],
    [93, -44, 0], [90.5, -39, 2]], { w: 6, bevel: 0.9 }), 'gold');
  const sel = g.part('selector', { pivot: [36, -26, 0], extras: { axis: 'x', safeDeg: -90, autoDeg: 90, note: 'modelled on FIRE' } });
  for (const sd of [1, -1]) {
    sel.add(PF([...arcPts(36, -26, 6.2, 150, 390, 10), [40, -19.6, 1.5], [42.4, -16.6, 2], [29.6, -16.6, 2], [32, -19.6, 1.5]],
      { w: 2.2, cw: 15.3 * sd, bevel: 0.6 }), 'steel_dark');
    sel.add(capScrew([36, -26, 16.4 * sd], 2.2, sideAx(sd), 1), 'steel');
    // selector markings: a gilt tick at SAFE and a wave crest at FIRE
    g.add(strip([36, -33.8], [36, -36.2], 14.25 * sd, 0.7, 0.5), 'gold');
    g.add(sweep(atW([[42.6, -30.6], [44.6, -29], [44.2, -27.2], [42.8, -27.8]], 14.3 * sd), 0.32, { seg: 8, radial: 4 }), 'gold');
  }

  // ======================================================================== pistol grip
  const GS = 22, GT = -3.6;   // the Sentry-4 grip, moved to this lower
  const gp = (pts) => pts.map(([s, t, r]) => [s + GS, t + GT, r]);
  {
    // front strap: three finger grooves cut into the old palm curve
    const fc = new THREE.CatmullRomCurve3([[36, -50], [31.5, -68], [25.5, -88], [17.5, -106], [10.6, -122.5]].map(([s, t]) => new THREE.Vector3(s, t, 0)));
    const fpt = (u, d, r) => { const p = fc.getPointAt(u), tg = fc.getTangentAt(u); return [p.x + tg.y * d, p.y - tg.x * d, r]; };
    const GRIP = gp([[38.5, -40.8, 1], [36, -50, 6], fpt(0.19, 2.4, 9), fpt(0.355, -0.4, 4), fpt(0.52, 2.6, 9), fpt(0.685, -0.4, 4), fpt(0.85, 2.1, 8),
      [10.6, -122.5, 3], [-31.7, -107.1, 3], [-26.3, -83.5, 26], [-11.9, -52.6, 8], [-14, -44, 4], [-19.5, -38.5, 3], [-12, -36.2, 3], [-4, -40.8, 1]]);
    g.add(PF(GRIP, { w: 29.5, bevel: 3.5, bevelSeg: 3, curveSeg: 5 }), 'polymer_grip');
    // checkering on the front and back straps: pyramids on the flat of the strap (the side wall of the extrusion)
    const out = makeShape(GRIP).getPoints(6).map((v) => [v.x, v.y]);
    const near = (p) => { let k = 0, d = Infinity; out.forEach((q, i) => { const e = Math.hypot(q[0] - p[0], q[1] - p[1]); if (e < d) { d = e; k = i; } }); return k; };
    const pyr = [];
    const field = (a, b, cols) => {
      const seg = out.slice(Math.min(a, b), Math.max(a, b) + 1), L = plen(seg);
      for (let x = 2.4, row = 0; x < L - 2.4; x += 2.2, row++) {
        let acc = 0, i = 1;
        while (i < seg.length - 1 && acc + Math.hypot(seg[i][0] - seg[i - 1][0], seg[i][1] - seg[i - 1][1]) < x) { acc += Math.hypot(seg[i][0] - seg[i - 1][0], seg[i][1] - seg[i - 1][1]); i++; }
        const A = seg[i - 1], B = seg[i], l = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, f = Math.min(1, (x - acc) / l);
        const p = [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f], tg = [(B[0] - A[0]) / l, (B[1] - A[1]) / l];
        let n = [tg[1], -tg[0]];
        if (!insidePoly(out, p[0] - n[0] * 1.5, p[1] - n[1] * 1.5)) n = [-n[0], -n[1]];   // outward
        for (let wv = -cols + (row % 2) * 1.1; wv <= cols + 0.01; wv += 2.2) {
          pyr.push({ c: [p[0] - n[0] * 0.12, p[1] - n[1] * 0.12, wv], n: [n[0], n[1], 0], a: [tg[0] * 1.05, tg[1] * 1.05, 0], b: [0, 0, 1.05], h: 0.7 });
        }
      }
    };
    field(near(gp([[36, -50]])[0]), near(gp([[10.6, -122.5]])[0]), 8.8);
    field(near(gp([[-11.9, -52.6]])[0]), near(gp([[-30.4, -101]])[0]), 8.8);
    g.add(pyramids(pyr), 'polymer_grip');
  }
  g.add(PF(gp([[11, -123.2, 0.8], [8.4, -128.8, 3], [-33.9, -113.4, 3], [-32.3, -107.9, 0.8]]), { w: 27.5, bevel: 1.8 }), 'steel_dark');
  // porcelain side panels of the grip with a gilt edge, filled with an overlapping scale field (cobalt -> white)
  for (const sd of [1, -1]) {
    const sc = gp([[28, -56, 4], [22.5, -78, 14], [15, -100, 8], [7, -113, 4], [-20, -103, 4], [-18.5, -84, 12], [-8, -60, 4], [-6, -55, 3]]);
    g.add(PF(sc, { w: 2.4, cw: 15.6 * sd, bevel: 0.9, curveSeg: 2 }), 'porcelain');
    g.add(sweep(atW([...sc.map(([s, t]) => [s, t]), [sc[0][0], sc[0][1]]].map(([s, t]) => {
      // pull the bead 1.3 mm inside the outline (towards the panel centre)
      const cs = 4 + GS, ct = -84 + GT, dx = cs - s, dy = ct - t, l = Math.hypot(dx, dy) || 1;
      return [s + dx / l * 1.3, t + dy / l * 1.3];
    }), 16.85 * sd), 0.45, { seg: 60, radial: 4, closed: false, tension: 0.2 }), 'gold');
    const poly = sc.map(([s, t]) => [s, t]), body = { glaze_cobalt: [], porcelain: [] }, bead = [];
    for (let r = 0; r < 6; r++) {
      const row = [];
      for (let c = -1; c < 7; c++) {
        // columns lean with the grip's rake (the panel edges run ~0.33 mm forward per mm up)
        const t0 = -61 + GT - r * 8.4, s0 = -19 + GS + c * 8.6 + (r % 2) * 4.3 + 0.33 * (t0 + 61 - GT);
        if (insidePoly(poly, s0 - 4.2, t0, 1.5) && insidePoly(poly, s0 + 6.2, t0, 1.5) && insidePoly(poly, s0, t0 + 4.2, 1.3) && insidePoly(poly, s0, t0 - 4.2, 1.3)) row.push([s0, t0]);
      }
      row.forEach(([s0, t0], i) => {
        const front = i === row.length - 1;
        const { body: b, bead: bd } = fishScale(s0, t0, 4.2, 6.2, 16.8 * sd + sd * 0.6, sd, { th: 1.2, tilt: 3, bevel: 0.4, round: front });
        body[r < 2 || (r === 2 && i % 2 === 0) ? 'glaze_cobalt' : 'porcelain'].push(b); bead.push(bd);
      });
    }
    for (const [m, l] of Object.entries(body)) if (l.length) g.add(merge(l), m);
    g.add(merge(bead), 'gold');
    g.add(capScrew(gp([[-12, -98, 0]])[0].slice(0, 2).concat([17.2 * sd]), 1.6, sideAx(sd), 0.7), 'gold');
  }

  // ======================================================================== stock = the fish body (a porcelain loft) + buttpad
  g.add(box([-7, 3, 0], [14, 32, 27], { r: 2.5 }), 'steel_dark');   // hinge block
  g.add(lax([[0, 0], [0, 4.4], [1.4, 4.4], [2, 3.6], [2, 0]], [-7, 12, 13.6], 'w', 18), 'steel_bright');
  g.add(lax([[0, 0], [0, 4.4], [1.4, 4.4], [2, 3.6], [2, 0]], [-7, 12, -13.6], '-w', 18), 'steel_bright');
  const stTop = pchip([[-300, 21], [-250, 22.5], [-110, 22.5], [-40, 19.5], [-12, 18]]);
  const stBot = pchip([[-300, -68], [-220, -62], [-130, -54], [-60, -45], [-12, -34]]);
  const stA = pchip([[-300, 15.4], [-250, 16.2], [-150, 16.8], [-60, 16], [-12, 14.8]]);
  const SB0 = -300, SB1 = -12;
  const STK = (() => {
    const st = [];
    for (let s = SB0; s <= SB1 + 0.01; s += 12) { const tp = stTop(s), bt = stBot(s); st.push([s, stA(s), tp, bt + (tp - bt) * 0.58, bt, 2.8, 2.4]); }
    return new Body(st, { scale: (s) => { const d = Math.min(s - SB0, SB1 - s); return d >= 3 ? 1 : 0.9 + 0.1 * Math.sqrt(Math.max(0, d) / 3); } });
  })();
  g.add(skin(STK.rings(sList(SB0, SB1, 4.5), 56), { crease: 60 }), 'porcelain');
  // side-plane features are authored at w = ±16 and bent onto the swelled flank
  const onS = (s, t, off, sd) => [s, t, sd * (STK.hw(s, t) + off)];
  const toStock = (geo, tess = 0) => warp(geo, (s, t, w) => [s, t, Math.sign(w) * (STK.hw(s, t) + Math.abs(w) - 16)], { tess });
  {
    // gilt spacer rims and a steel sling socket near the butt
    // dorsal comb: a cobalt strip along the back with gilt fin rays (chevrons pointing to the tail)
    g.add(PF([[-46, 13, 2], [-252, 16, 4], [-258, 26.6, 3], [-150, 27.4, 30], [-50, 22.6, 2]], { w: 17, bevel: 2.2, bevelSeg: 2 }), 'glaze_cobalt');
    const rays = [];
    const combTop = (s) => (s > -150 ? 22.6 + (-s - 50) / 100 * 4.8 : 27.4 - (-s - 150) / 108 * 0.8);
    for (let s = -64; s >= -244; s -= 13) {
      const t = combTop(s) - 0.15;
      rays.push(sweep([[s + 5, t - 1.9, -7.4], [s + 1, t - 0.5, -4.4], [s - 1, t, 0], [s + 1, t - 0.5, 4.4], [s + 5, t - 1.9, 7.4]], 0.38, { seg: 10, radial: 4 }));
    }
    g.add(merge(rays), 'gold');
    const rad = (s) => 4.6 + 1.6 * Math.min(1, Math.max(0, (s + 250) / 200));
    const rimS = (t) => -14 - 29 * Math.sqrt(Math.max(0, 1 - ((t + 7.5) / 20.5) ** 2));   // gill cover rim at height t
    const rowT = (r, s) => stTop(s) - 1.25 * rad(s) - r * 1.45 * rad(s);
    const latT = (s) => rowT(3, s) - rad(s) - 2.2;
    for (const sd of [1, -1]) {
      // gill cover (operculum): a cobalt half-ellipse behind the receiver, gilt rim on its free edge, three gilt rays
      const gill = [[-13, 13, 0], ...arcPts(0, 0, 1, 96, 264, 14).map(([a, b]) => [-14 + a * 29, -7.5 + b * 20.5, 0]), [-13, -28, 0]];
      g.add(toStock(PF(gill, { w: 2.2, cw: sd * 16.4, bevel: 0.7, bevelSeg: 1 }), 7), 'glaze_cobalt');
      const edge = arcPts(0, 0, 1, 100, 260, 16).map(([a, b]) => onS(-14 + a * 27.6, -7.5 + b * 19.2, 1.45, sd));
      g.add(sweep(edge, 0.55, { seg: 40, radial: 5 }), 'gold');
      g.add(merge([[-17, 6, -32, 2], [-17, -7.5, -36, -7.5], [-17, -21, -32, -17]].map(([a, b, c, d]) => sweep([onS(a, b, 1.45, sd), onS((a + c) / 2, (b + d) / 2 + 0.5, 1.5, sd), onS(c, d, 1.45, sd)], 0.4, { seg: 6, radial: 4 }))), 'gold');
      // four rows of relief scales tapering to the tail (cobalt back -> white belly, gilt rims); each row starts with a
      // scale tucked under the gill cover, odd rows half a pitch on
      for (let r = 0; r < 4; r++) {
        const body = { glaze_cobalt: [], porcelain: [] }, bead = [];
        let s0 = rimS(rowT(r, -36)) - 1.55 * rad(-36) + 1.6, c = 0;
        while (s0 - rad(s0) > -294) {
          const R = rad(s0), t0 = rowT(r, s0);
          const sc = fishScale(s0, t0, R, 1.55 * R, sd * (16 + 0.75 + r * 0.12), sd, { th: 2.0, tilt: 5, bevel: 0.6 });
          body[r < 2 || (r === 2 && c % 2 === 0) ? 'glaze_cobalt' : 'porcelain'].push(sc.body); bead.push(sc.bead);
          s0 -= 2.1 * R * (c === 0 && r % 2 ? 0.5 : 1);
          c++;
        }
        for (const [m, l] of Object.entries(body)) if (l.length) g.add(toStock(merge(l)), m);
        g.add(toStock(merge(bead)), 'gold');
      }
      // gilt lateral line under the scales, its pores lit (glow_ice beads in gilt collars): at rest a faint chase of
      // light runs along them (pv_energy vein), with a full meter they burn -- the ready state reads in the corner
      const lat = [];
      for (let s = -36; s >= -292; s -= 8) lat.push(onS(s, latT(s), 0.2, sd));
      g.add(sweep(lat, 0.5, { seg: 64, radial: 5 }), 'gold');
      const pores = [], collars = [];
      for (let s = -44, i = 0; s >= -286; s -= 12, i++) {
        const f = STK.frameAt(s, latT(s) - 2.9 - (i % 2) * 0.6, sd), P = vadd(f.P, f.N, -0.15), Q = vadd(P, f.N);
        collars.push(aimGeo(lathe([[0, 0.7], [0, 1.45], [0.5, 1.2], [0.55, 0.7]], { seg: 5 }), P, Q));
        pores.push(aimGeo(lathe([[0, 0.8], [0.4, 0.6], [0.75, 0]], { seg: 5 }), P, Q));
      }
      g.add(merge(collars), 'gold');
      g.add(merge(pores), 'glow_ice');
      // pectoral fin behind the grip and a pelvic fin further back: cobalt, scalloped trailing edge, gilt rays + edge
      for (const [fin0, root, lead] of [
        [[[-17, -23.8, 2], [-36, -26, 8], [-56, -30, 6], [-74, -36.5, 1], [-67, -37.4, 2], [-61, -36, 3], [-55, -38.6, 1], [-49, -36.8, 3], [-43, -37.6, 1], [-36, -35, 3], [-28, -34.6, 1], [-18, -31, 3]],
          [-19, -27.6], [[-17, -23.8], [-36, -26], [-56, -30], [-73, -36.3]]],
        [[[-146, -25, 2], [-160, -26.4, 6], [-176, -30, 5], [-192, -35.8, 1], [-185, -36.6, 2], [-180, -35.6, 3], [-175, -38.2, 1], [-169, -36.4, 3], [-163, -38.4, 1], [-156, -35.6, 3], [-147, -32, 3]],
          [-148, -28.4], [[-146, -25], [-160, -26.4], [-176, -30], [-191, -35.6]]],
      ]) {
        g.add(toStock(PF(fin0, { w: 1.4, cw: sd * 16.5, bevel: 0.45, bevelSeg: 1, curveSeg: 2 }), 8), 'glaze_cobalt');
        const tips = fin0.filter((p, i) => i >= 3 && p[2] === 1);
        const fr = tips.map(([s, t]) => { const d = Math.hypot(s - root[0], t - root[1]); return sweep([onS(root[0], root[1], 1.3, sd), onS(root[0] + (s - root[0]) * 0.5, root[1] + (t - root[1]) * 0.5 + 0.4, 1.35, sd), onS(root[0] + (s - root[0]) * (1 - 2 / d), root[1] + (t - root[1]) * (1 - 2 / d), 1.3, sd)], 0.36, { seg: 8, radial: 4 }); });
        fr.push(sweep(lead.map(([s, t]) => onS(s, t - 0.4, 1.0, sd)), 0.5, { seg: 24, radial: 5 }));
        g.add(merge(fr), 'gold');
      }
      // 海水紋 belly band: cobalt sea-wave relief along the bottom of the body, scalloped crests with a gilt edge
      {
        const bot = [], top = [];
        for (let s0 = -84; s0 >= -292; s0 -= 4) {
          bot.push([s0, stBot(s0) + 6.4]);
          top.push([s0, stBot(s0) + 16.5 + 3.6 * Math.abs(Math.sin((-s0 - 84) / 19 * Math.PI)) ** 0.6]);
        }
        g.add(toStock(PF([...bot.map(([a, b]) => [a, b, 0]), ...top.slice().reverse().map(([a, b]) => [a, b, 0])], { w: 1.3, cw: sd * 16.45, bevel: 0.45, bevelSeg: 1, curveSeg: 1 }), 12), 'glaze_cobalt');
        g.add(sweep(top.map(([a, b]) => onS(a, b + 0.2, 1.1, sd)), 0.42, { seg: 90, radial: 4 }), 'gold');
        // foam curls on every other crest
        const curls = [];
        for (let i = 0; i < 6; i++) { const cs = -84 - 19 * (2 * i + 1) + 4; if (cs < -285) break; curls.push(toStock(flat(spiral(cs, stBot(cs) + 13.6, 2.6, 0.7, 120, -200, 12), 16 * sd + sd * 1.25, sd, 0.3, 0.2, 16))); }
        g.add(merge(curls), 'gold');
      }
      // sling socket
      const ss = STK.frameAt(-284, -31, sd);
      g.add(aimGeo(lathe([[0, 0], [0, 6.2], [1.6, 6.2], [2.2, 5.6], [2.2, 3.9], [1.2, 3.7], [1.2, 0]], { seg: 16 }), vadd(ss.P, ss.N, -0.4), vadd(ss.P, ss.N, 1)), 'steel_bright');
    }
  }
  // cobalt spacer between the body and the butt pad: gilt rims, a gilt wave running up each side
  g.add(PF([[-299, 22.6, 2], [-306, 22.6, 2], [-306, -70, 2], [-299, -70, 2]], { w: 34.4, bevel: 0.8 }), 'glaze_cobalt');
  for (const s0 of [-299.2, -305.8]) g.add(PF([[s0 + 0.6, 23.2, 1.5], [s0 - 0.6, 23.2, 1.5], [s0 - 0.6, -70.6, 1.5], [s0 + 0.6, -70.6, 1.5]], { w: 35.4, bevel: 0.4 }), 'gold');
  for (const sd of [1, -1]) {
    const wv = [];
    for (let t = -66; t <= 19; t += 1.5) wv.push([-302.5 + Math.sin(t * 0.42) * 1.5, t]);
    g.add(flat(wv, 17.2 * sd, sd, 0.36, 0.22), 'gold');
  }
  {
    let pad = PF([[-306, 23, 3], [-312, 24.4, 5], [-320, 21, 5], [-320, -69, 5], [-312, -73, 5], [-306, -71, 3]], { w: 36, bevel: 4, bevelSeg: 3 });
    const gr = [];
    for (let k = 0; k < 9; k++) gr.push(cutters.box([-320.2, -60 + k * 9, 0], [3.2, 1.7, 44]));
    pad = cut(pad, [merge(gr)]);
    g.add(pad, 'rubber');
    for (const t of [7.5, -46.5]) g.add(capScrew([-320, t, 0], 2.6, '-s', 1.1, 10), 'steel_bright');
  }

  // ======================================================================== fish tail fx_tail (sways about t at the butt)
  {
    const tail = g.part('fx_tail', { pivot: [-296, -32, 0], extras: { open: 7, hinge: 't', note: 'upturned forked fish tail; v -1..1 sway (driven by the weapon logic)' } });
    // lobes: leading edge, scalloped trailing edge between the ray tips; thickness 6 at the root -> 2.5 at the tips,
    // thinner membrane between the rays (ribbed); rays fan from the root (both faces) to 2 mm inside the outline
    const lobe = (lead, ends, back, R, rootPts) => {
      const outline = [...lead.map(([s, t, r]) => [s, t, r])];
      ends.forEach((e, i) => {
        outline.push([e[0], e[1], 0.6]);
        const n = ends[i + 1] || back[0];
        const m = [(e[0] + n[0]) / 2, (e[1] + n[1]) / 2], d = Math.hypot(m[0] - R[0], m[1] - R[1]);
        outline.push([m[0] + (R[0] - m[0]) / d * 3.2, m[1] + (R[1] - m[1]) / d * 3.2, 5]);
      });
      outline.push(...back);
      const ang = ends.map((e) => Math.atan2(e[1] - R[1], e[0] - R[0]));
      const thick = (s, t) => {
        const d = Math.hypot(s - R[0], t - R[1]), a = Math.atan2(t - R[1], s - R[0]);
        let near = Infinity;
        for (const b of ang) near = Math.min(near, Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))));
        const gap = Math.abs(ang[0] - ang[ang.length - 1]) / Math.max(1, ang.length - 1);
        const rib = 0.74 + 0.26 * Math.cos(Math.min(1, near / (gap / 2)) * Math.PI / 2) ** 2;
        return (2.5 + 3.5 * Math.max(0, 1 - d / 95)) * (d < 18 ? 1 : rib);
      };
      const geo = warp(PF(outline, { w: 4, bevel: 1.3, bevelSeg: 2, curveSeg: 3 }), (s, t, w) => [s, t, w / 2 * thick(s, t) / 2], { tess: 7 });
      const rays = [];
      for (const sd of [1, -1]) {
        ends.forEach((e, i) => {
          const a = rootPts[i], d = Math.hypot(e[0] - a[0], e[1] - a[1]), k = 1 - 2.2 / d;
          const pts = [0, 0.33, 0.66, 1].map((u) => { const s = a[0] + (e[0] - a[0]) * u * k, t = a[1] + (e[1] - a[1]) * u * k; return [s, t, sd * (thick(s, t) / 2 + 0.12)]; });
          rays.push(sweep(pts, 0.45, { seg: 10, radial: 4 }));
        });
      }
      return { geo, rays };
    };
    const up = lobe([[-232, 21.6, 0], [-256, 33, 24], [-292, 61, 24], [-334, 93, 8], [-376, 116, 1]],
      [[-366, 100.5], [-356, 84.5], [-347, 68.5], [-337, 52.5], [-325, 37.5]], [[-306, 24.5, 4], [-288, 21, 0]], [-268, 26], [[-256, 27], [-264, 26], [-272, 25.4], [-280, 24.8], [-290, 24]]);
    const dn = lobe([[-246, -63.6, 0], [-276, -82, 14], [-316, -104, 8], [-352, -126, 1]],
      [[-340, -110], [-328, -97], [-316, -85]], [[-302, -71, 4], [-290, -67.5, 0]], [-262, -66.5], [[-258, -67.5], [-268, -68.2], [-278, -68.6]]);
    tail.add(merge([up.geo, dn.geo]), 'glaze_cobalt');
    tail.add(merge([...up.rays, ...dn.rays]), 'gold');
    tail.add(sweep([[-232, 22, 0], [-256, 33.6, 0], [-292, 61.8, 0], [-334, 93.8, 0], [-376, 116, 0]], 1.25, { seg: 30, radial: 6 }), 'gold');
    tail.add(sweep([[-246, -64.2, 0], [-276, -82.8, 0], [-316, -104.8, 0], [-352, -126, 0]], 1.1, { seg: 22, radial: 6 }), 'gold');
    // root collars (the fins hinge in gilt sockets on the stock) with a rivet each side
    tail.add(box([-284, 22.3, 0], [32, 3.2, 9.4], { r: 1.2 }), 'gold');
    tail.add(box([-276, -66.6, 0], [28, 3, 8.4], { r: 1.2, rot: [3.9, 0, 0] }), 'gold');
    for (const sd of [1, -1]) {
      for (const s of [-276, -294]) tail.add(dome([s, 23.2, 4.7 * sd], 1.1, sideAx(sd), 0.8), 'steel_bright');
      for (const s of [-268, -284]) tail.add(dome([s, -67.2 + (s + 276) * 0.07, 4.2 * sd], 1.0, sideAx(sd), 0.7), 'steel_bright');
    }
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

  // scale panels s 248..420 on both upper flanks: glow bed in a gilt frame, 6 groups x (2 columns x 4 rows)
  const SC0 = 258, SP = 13, ROWS = [10.3, 3.45, -3.45, -10.3];
  for (const sd of [1, -1]) {
    g.add(box([333, 0.25, 19.2 * sd], [162, 30, 0.6], { r: 0.2, seg: 1 }), 'glow_ice');   // runs on under both posts
    // frame: top and bottom gilt rails with a bead row, front and rear posts with screws
    g.add(box([333, 15.8, 19.5 * sd], [172, 1.6, 1.4], { r: 0.4, seg: 1 }), 'gold');
    g.add(box([333, -15.3, 19.5 * sd], [172, 1.6, 1.4], { r: 0.4, seg: 1 }), 'gold');
    g.add(box([250.6, 0.25, 19.6 * sd], [7.6, 32.6, 1.6], { r: 0.6, seg: 1 }), 'gold');
    g.add(box([412.1, 0.25, 20.4 * sd], [14.2, 32.6, 2.4], { r: 0.7, seg: 1 }), 'gold');   // wide front post: caps the scale ends
    const beads = [];
    for (let s = 252; s <= 414; s += 10) { beads.push(dome([s, 15.8, 20.2 * sd], 0.55, sideAx(sd), 0.5, 5)); beads.push(dome([s + 3, -15.3, 20.2 * sd], 0.55, sideAx(sd), 0.5, 5)); }
    g.add(merge(beads), 'gold');
    for (const [s, w] of [[250.6, 20.3], [412.1, 21.5]]) for (const t of [11.5, -11, 0.25]) if (s > 300 || t !== 0.25) g.add(capScrew([s, t, w * sd], 1.1, sideAx(sd), 0.5, 6), 'steel_bright');
  }
  for (let k = 0; k < 6; k++) {
    const front = SC0 + (2 * k + 1) * SP + 7;
    const grp = g.part(`fx_scale${k + 1}`, { pivot: [front, 0.25, 0], extras: { open: -4, hinge: 'w', order: k, note: 'scale group k (rear -> front): rear edges flick 4° up' } });
    const geo = { glaze_cobalt: [], porcelain: [], gold: [] };
    for (let c = 2 * k; c < 2 * k + 2; c++) {
      ROWS.forEach((t0, r) => {
        const s0 = SC0 + c * SP + (r % 2) * (SP / 2);
        if (s0 + 9.4 > 417) return;   // the last scales end under the front post
        // cobalt back, white belly (青花 fish): rows 0-1 cobalt, row 2 every other one, row 3 white
        const mat = r < 2 || (r === 2 && c % 2 === 0) ? 'glaze_cobalt' : 'porcelain';
        for (const sd of [1, -1]) {
          const sc = fishScale(s0, t0, 5.6, 9.4, (20.6 + r * 0.14) * sd, sd, { th: 2.2, tilt: 6, bevel: 0.75 });
          geo[mat].push(sc.body); geo.gold.push(sc.bead);
        }
      });
    }
    for (const [m, list] of Object.entries(geo)) if (list.length) grp.add(merge(list), m);
  }

  // 海水江崖 plates s 422..538 on both front flanks (in a gilt frame): 立水 stripes at the bottom, three wave bands
  // (cobalt enamel / white / cobalt) in gilt walls with curling crests, jade rock peaks rising through them, clouds
  for (const sd of [1, -1]) {
    const w = 19.7 * sd, F = 20.6 * sd;                  // plate centre, plate face
    g.add(PF([[422, -13.6, 2], [538, -13.6, 2], [538, 15.4, 2], [422, 15.4, 2]], { w: 1.8, cw: w, bevel: 0.6 }), 'porcelain');
    const fr = [[424.4, -11.2], [535.6, -11.2], [535.6, 13], [424.4, 13]];
    const gold = [], cob = [], jade = [];
    for (let i = 0; i < 4; i++) gold.push(strip(fr[i], fr[(i + 1) % 4], F + sd * 0.25, 0.6, 0.5));
    // 立水: slanted stripes, every other cell cobalt
    for (let s = 425, k = 0; s < 532; s += 4.2, k++) {
      gold.push(strip([s, -11.2], [s + 3, -6.4], F + sd * 0.3, 0.45, 0.6));
      if (k % 2 === 0 && s + 7.4 < 535) cob.push(PF([[s, -11.2], [s + 4.2, -11.2], [s + 7.2, -6.4], [s + 3, -6.4]], { w: 0.55, cw: F + sd * 0.27, bevel: 0.1, bevelSeg: 1, curveSeg: 1 }));
    }
    gold.push(strip([424.4, -6.4], [535.6, -6.4], F + sd * 0.3, 0.5, 0.6));
    // wave crest lines (s ascending): arches rising to a crest that curls over, then drops into the next one
    const crest = (b, L, ph) => {
      const line = [[425, b]], curls = [];
      for (let a = 425 - ph; a < 535; a += L) {
        for (const p of [[a + 0.3 * L, b + 1.6], [a + 0.56 * L, b + 3.4], [a + 0.74 * L, b + 4.1], [a + 0.8 * L, b + 3.2], [a + 0.86 * L, b + 1.0], [a + L, b]]) if (p[0] > 425.6 && p[0] < 534.4) line.push(p);
        const cs = a + 0.66 * L;
        if (cs > 428 && cs < 532) curls.push(spiral(cs, b + 2.3, 1.7, 0.45, 80, -240, 12));
      }
      line.push([535, b]);
      return { line, curls };
    };
    const C0 = crest(-5.2, 17, 3), C1 = crest(-0.4, 17, 11.5), C2 = crest(4.4, 17, 6);
    cob.push(PF([[425, -6.4], [535, -6.4], ...C0.line.slice().reverse()], { w: 0.6, cw: F + sd * 0.3, bevel: 0.12, bevelSeg: 1, curveSeg: 1 }));
    cob.push(PF([...C1.line, ...C2.line.slice().reverse()], { w: 0.6, cw: F + sd * 0.3, bevel: 0.12, bevelSeg: 1, curveSeg: 1 }));
    for (const C of [C0, C1, C2]) {
      gold.push(flat(C.line, F + sd * 0.55, sd, 0.3, 0.22, Math.round(plen(C.line) / 2.5)));
      for (const c of C.curls) gold.push(flat(c, F + sd * 0.55, sd, 0.26, 0.2, 7));
    }
    // 江崖: three rock peaks (jade), gilt outlines and facet lines
    for (const [rock, facets] of [
      [[[468, -11.2], [470.6, -4.4], [473.4, -2.6], [476, 2.4], [480, 7.6], [483.8, 2.6], [486.2, 0.6], [489.2, -3], [492, -11.2]], [[[480, 7.6], [479.2, 0], [476.4, -7]], [[483.8, 2.6], [483, -3], [485.6, -9]], [[473.4, -2.6], [474.6, -8]]]],
      [[[438, -11.2], [440.8, -5.6], [443.4, -4], [446.6, 1.4], [449.8, -2.2], [451.6, -4.6], [454, -11.2]], [[[446.6, 1.4], [445.8, -4], [443.4, -9]]]],
      [[[506, -11.2], [508.8, -3.8], [512, 2], [515.2, -1.4], [518, -4.4], [521.6, -11.2]], [[[512, 2], [512.6, -3.4], [510.6, -9]]]],
    ]) {
      jade.push(PF(rock.map(([s, t]) => [s, t, 0.6]), { w: 1.6, cw: F + sd * 0.8, bevel: 0.45, bevelSeg: 1, curveSeg: 1 }));
      for (let i = 1; i < rock.length; i++) gold.push(strip(rock[i - 1], rock[i], F + sd * 1.7, 0.45, 0.4));
      for (const f of facets) gold.push(flat(f, F + sd * 1.6, sd, 0.22, 0.15, 8));
    }
    // clouds in the sky over the waves
    for (const [cs, f] of [[430, 1], [497, -1], [526, 1]]) gold.push(flat(cloudPts(cs, 9.4, 1.5, f), F, sd, 0.24, 0.18, 20));
    g.add(merge(cob), 'glaze_cobalt');
    g.add(merge(jade), 'glaze_jade');
    g.add(merge(gold), 'gold');
  }

  // ======================================================================== roof ridge (正脊) on top, s 142..548
  g.add(SC([[-10.4, 21.6, 0.5], [10.4, 21.6, 0.5], [10.4, 27.8, 0.6], [8.6, 28.8, 0.6], [-8.6, 28.8, 0.6], [-10.4, 27.8, 0.6]], 142, 548, { bevel: 0.7 }), 'porcelain');
  // raised gilt 回紋 meander on both flanks of the ridge body
  for (const sd of [1, -1]) g.add(meander(150, 540, 22.2, 5.2, 10.4 * sd, sd, 12, 0.62, 0.55), 'gold');
  // 12 筒瓦 (half-round tiles), each with a bead at its rear end; gilt straps over the joints with a rivet a side
  for (let i = 0; i < 12; i++) {
    const s0 = 150 + i * 32.6;
    g.add(lathe([[s0, 0], [s0, 8.4], [s0 + 0.8, 9.3], [s0 + 3.6, 9.3], [s0 + 4.4, 8.6], [s0 + 30.8, 8.6], [s0 + 31.4, 8.0], [s0 + 31.4, 0]],
      { t: 28.6, seg: 12, phase: -Math.PI / 2, arc: Math.PI }), 'glaze_jade');
  }
  {
    const straps = [];
    for (let i = 1; i < 12; i++) {
      const s = 150 + i * 32.6 - 0.6;
      straps.push(lathe([[s - 1.6, 9.0], [s - 1.6, 9.9], [s - 1.0, 10.4], [s + 1.0, 10.4], [s + 1.6, 9.9], [s + 1.6, 9.0], [s - 1.6, 9.0]], { t: 28.6, seg: 12, phase: -Math.PI / 2, arc: Math.PI }));
    }
    g.add(merge(straps), 'gold');
  }
  // 瓦當 end cap facing the shooter: gilt disc, ring and boss
  g.add(lathe([[141, 0], [141, 8.8], [141.8, 9.6], [146, 9.6], [146, 0]], { t: 28.6, seg: 24, phase: -Math.PI / 2, arc: Math.PI }), 'gold');
  g.add(lax([[0, 0], [0, 6.6], [0.8, 6.6], [0.8, 5.2], [0.3, 5.2], [0.3, 2.2], [1.4, 2], [1.8, 0]], [141, 28.8, 0], '-s', 16), 'gold');

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
  // a porcelain drum with gilt rims, a ring of cobalt scales (free edges to the shooter) and a bead row
  g.add(lathe([[543, 9], [543, 24], [544, 25], [555, 25], [556, 24], [556, 9], [543, 9]], { seg: 36 }), 'porcelain');
  g.add(washer(543.6, 545.2, 24.6, 25.9, 0.4, 36), 'gold');
  g.add(washer(554, 555.6, 24.6, 25.9, 0.4, 36), 'gold');
  {
    const cb = [], cbd = [], beads = [];
    for (let k = 0; k < 30; k++) {
      const a = (k / 30) * Math.PI * 2, ct = Math.cos(a), cw = Math.sin(a);
      if (25 * ct > 14) continue;                     // under the head
      const N = [0, ct, cw];
      const { body, bead } = fishScale(-1.4, 0, 2.6, 3.4, 0.55, 1, { th: 1.1, tilt: 6, bevel: 0.3 });
      cb.push(placeOn(body, [549.4, 24.7 * ct, 24.7 * cw], N, [1, 0, 0]));
      cbd.push(placeOn(bead, [549.4, 24.7 * ct, 24.7 * cw], N, [1, 0, 0]));
    }
    for (let k = 0; k < 44; k++) {
      const a = (k / 44) * Math.PI * 2, ct = Math.cos(a), cw = Math.sin(a);
      if (25 * ct > 14) continue;
      beads.push(aimGeo(lathe([[0, 0], [0, 0.75], [0.4, 0.55], [0.6, 0]], { seg: 6 }), [552.8, 24.85 * ct, 24.85 * cw], [552.8, 26 * ct, 26 * cw]));
    }
    g.add(merge(cb), 'glaze_cobalt');
    g.add(merge([...cbd, ...beads]), 'gold');
  }

  // ======================================================================== 螭吻 head (a sculpted loft, see Body)
  // stations: s, A (half width), top, c (widest line), bot (lower extent; the floor clamps it flat: the mouth roof
  // from s 609, the jowls behind), nT (crown squareness: a squared brow plane), nB
  const HEAD = new Body([
    [541.5, 6, 29.5, 18.5, 1, 2.2, 2.2],
    [544, 13.5, 33.6, 18.8, -1, 2.3, 2.3],
    [548, 20.5, 39.2, 19.6, -4, 2.4, 2.3],
    [556, 26, 45, 21.2, -9, 2.6, 2.3],
    [570, 30, 49.4, 22.8, -13, 2.9, 2.3],
    [586, 31.8, 51.2, 23.5, -12, 3.3, 2.3],
    [600, 31.6, 51.6, 24, -6, 3.7, 2.3],
    [610, 30, 51.4, 25, 2.6, 3.9, 2.3],
    [622, 27, 50, 26.5, 2.6, 3.8, 2.3],
    [636, 23, 46.4, 26, 2.6, 3.4, 2.3],
    [650, 19.4, 42.6, 25.5, 2.6, 3.0, 2.3],
    [664, 17.8, 40.4, 25, 2.6, 2.9, 2.3],
    [676, 17.6, 41, 25, 2.6, 2.9, 2.3],
    [686, 18.6, 43.6, 25.6, 2.6, 3.0, 2.3],
    [694, 18.6, 44.2, 25.6, 2.6, 3.0, 2.3],
    [700, 16.4, 42.4, 25, 2.6, 2.8, 2.3],
    [704.5, 12.2, 38.2, 23.4, 2.6, 2.6, 2.3],
    [707.6, 5.5, 31, 21.5, 4, 2.3, 2.3],
    [708.6, 1.8, 27, 20.5, 6, 2.2, 2.2],
  ], { floor: pchip([[541.5, 11], [546, 6], [552, 1], [562, -4], [576, -6], [590, -5], [600, 0.5], [609, ROOF], [712, ROOF]]) });
  // 如意 nose: a front lobe, two side lobes (the nostrils, mirrored) and a stem, in plan (s, |w|)
  const RUYI = [[697.5, 0, 6.8], [686.5, 8, 4.9], [676, 0, 3.6]];
  const ruyiQ = (s, w) => Math.min(...RUYI.map(([cs, cw, r]) => Math.hypot(s - cs, w - cw) - r));
  {
    // sculpt brushes (placed on the bare loft; w >= 0, mirrored)
    const hb = (s, t) => [s, t, HEAD.hw(s, t)], hc = (s, w = 0) => [s, HEAD.topAt(s, w), w];
    HEAD.brushes = [
      [[hb(598, 44), hb(610, 47.6), hb(622, 49), hb(634, 47), hb(645, 43)], 6.8, 5.6, 0.35],   // brow ridge over the eye
      [[hb(622, 41)], 10, -4.6],                                                         // eye socket
      [[hc(609)], 11, 2.4],                                                                 // forehead boss
      [[hc(596), hc(628)], 3.2, -1.6],                                                      // furrow between the brows
      [[hb(600, 40)], 7, -2],                                                             // temple hollow
      [[hb(586, 25), hb(604, 23), hb(626, 26), hb(648, 22.6)], 5, 3.6],                   // cheekbone ridge
      [[hb(584, 14), hb(600, 15)], 7, 2.6],                                                 // jowl
      [[hb(566, 31), hb(586, 34)], 6, 1.4],                                                 // swell behind the eye
      [[hb(610, ROOF + 3.4), hb(650, ROOF + 3.6), hb(690, ROOF + 3.6), hb(702, ROOF + 3)], 3.4, 2.2],   // upper lip roll
      [[hb(612, ROOF + 7.6), hb(650, ROOF + 8), hb(688, ROOF + 7.8)], 2, -1.0],            // groove over the lip
      [[hc(638), hc(672)], 4.4, 1.6],                                                         // nasal bridge
      [[hc(642, 6.4), hc(672, 7)], 2.1, -1.0],                                            // furrows beside it
      [[hc(548), hc(596)], 4.6, 1.3],                                                       // nape ridge
      [[hb(691, 37)], 7, 4.2],                                                              // flared nostril wings
      [[hc(691)], 11, 4.2],                                                                 // nose pad
      (s, t, w) => {                                                                        // the raised 如意 plate, crisp shoulder
        if (s < 668 || t < 33) return 0;
        const k = Math.min(1, Math.max(0, (0.9 - ruyiQ(s, w)) / 1.8));
        return 3.8 * k * k * (3 - 2 * k) * Math.min(1, (t - 33) / 4);
      },
    ];
  }
  g.add(skin(HEAD.rings(sList(541.5, 708.2, 2.4, [0, 0.4, 1.1, 2]), 84), { crease: 55 }), 'porcelain');
  const EYE = HEAD.frameAt(622, 41);
  {
    // red-lacquer palate under the roof (follows the mouth outline) with transverse rugae
    const pal = [];
    for (let s = 607; s <= 701; s += 6) pal.push([s, Math.max(1, HEAD.hw(s, ROOF + 0.05) - 1.4)]);
    g.add(PL([...pal.map(([s, w]) => [s, w, 0]), ...pal.slice().reverse().map(([s, w]) => [s, -w, 0])], { h: 1.2, ct: ROOF - 0.7, bevel: 0.3 }), 'lacquer_red');
    const rug = [];
    for (const s of [616, 625, 634, 643, 652, 661]) {
      const hw = HEAD.hw(s, ROOF + 0.05) - 3;
      rug.push(ribbon([[s - 0.6, ROOF - 1.2, -hw], [s + 1.8, ROOF - 1.25, -hw * 0.45], [s + 2.6, ROOF - 1.25, 0], [s + 1.8, ROOF - 1.25, hw * 0.45], [s - 0.6, ROOF - 1.2, hw]], SEC.round6,
        { wf: () => 0.75, hf: () => 0.45, up: [0, -1, 0], seg: 10 }));
    }
    g.add(merge(rug), 'lacquer_red');
    // the 如意 nose: a gilt rim on the shoulder of the raised plate, nostrils in gilt rings in the side lobes with a
    // gilt curl round each, a gilt bead down the front lobe
    const O = [688, 0], rim = [];
    for (let k = 0; k < 96; k++) {
      const a = (k / 96) * Math.PI * 2, u = [Math.cos(a), Math.sin(a)];
      let best = 0;
      for (const [cs, cw0, r] of [...RUYI, [686.5, -8, 4.9]]) {
        const dx = cs - O[0], dy = cw0 - O[1], b = u[0] * dx + u[1] * dy, disc = b * b - (dx * dx + dy * dy) + r * r;
        if (disc >= 0) best = Math.max(best, b + Math.sqrt(disc));
      }
      const s = O[0] + u[0] * (best - 1.1), w = O[1] + u[1] * (best - 1.1);
      rim.push([s, HEAD.topAt(s, w) + 0.12, w]);
    }
    g.add(ribbon([...rim, rim[0]], SEC.rect, { wf: () => 0.45, hf: () => 0.2, up: [0, 1, 0], seg: 120, tension: 0.2 }), 'gold');
    g.add(ribbon([694, 697, 700, 703].map((s) => [s, HEAD.topAt(s, 0) + 0.15, 0]), SEC.rect, { wf: () => 0.4, hf: () => 0.2, up: [0, 1, 0], seg: 10 }), 'gold');
    for (const sd of [1, -1]) {
      const f = HEAD.frameTop(686.5, 8 * sd), N = vnorm(vadd(f.N, [0.55, 0, 0.15 * sd])), P = vadd(f.P, f.N, 0.05);
      g.add(placeOn(sphere([0, 0, 0], 1, { scale: [1.8, 1.25, 0.45], seg: 10 }), P, N, [1, 0, 0]), 'black_chrome');
      g.add(aimGeo(lathe([[0, 1.9], [0, 3.0], [0.7, 2.85], [1.0, 2.2], [1.0, 1.9]], { seg: 16 }), vadd(P, N, -0.35), vadd(P, N, 1)), 'gold');
      const cl = spiral(686.5, 8 * sd, 3.4, 4.4, sd > 0 ? 200 : -20, sd > 0 ? 470 : -290, 16).map(([s, w]) => [s, HEAD.topAt(s, w) + 0.12, w]);
      g.add(ribbon(cl, SEC.rect, { wf: () => 0.32, hf: () => 0.18, up: [0, 1, 0], seg: 20 }), 'gold');
    }
    // the upper lip rolls up into a gilt scroll on each side of the snout (如意 curl)
    for (const sd of [1, -1]) {
      const lw = HEAD.hw(696, 15) + 0.4;
      g.add(sweep(atW(spiral(695.5, 16.2, 5.0, 1.1, -95, 250, 20), lw * sd), 0.72, { seg: 24, radial: 5 }), 'gold');
    }
    for (const sd of [1, -1]) {
      // eye: a bulging crystal with a slit pupil, porcelain lids and a slim gilt ring
      const E = sd > 0 ? EYE : { P: mirW(EYE.P), N: mirW(EYE.N), T: mirW(EYE.T) };
      const eye = sphere([0, 0, 0], 8.2, { seg: 22 });
      g.add(placeOn(eye, vadd(E.P, E.N, -1.0), E.N, E.T), 'crystal');
      g.add(placeOn(sphere([0, 0, 0], 1, { scale: [1.5, 5.8, 0.7], seg: 10 }), vadd(E.P, E.N, 6.9), E.N, E.T), 'black_chrome');
      const lid = (a0, a1, r, th) => placeOn(taper(arcPts(0, 0, r, a0, a1, 10).map(([s, t]) => [s, t, 1.5 + 0.3 * Math.sin(((s + r) / (2 * r)) * Math.PI)]), 0, 0, { seg: 18, radial: 7, rf: (u) => 0.5 + th * Math.sin(Math.PI * u) }), E.P, E.N, E.T);
      g.add(merge([lid(-12, 192, 8.8, 1.9), lid(204, 336, 8.6, 1.1)]), 'porcelain');
      g.add(placeOn(lax([[0, 10.8], [0, 11.8], [0.5, 11.9], [0.9, 11.4], [0.9, 10.8], [0, 10.8]], [0, 0, 0], 'w', 32), vadd(E.P, E.N, -0.6), E.N, E.T), 'gold');
      // heavy brow visor overhanging the eye: a porcelain lens-section sweep from the inner corner up and back,
      // flicking up behind the temple
      {
        const vp = [[640, 45.2, 1.2], [632, 49.4, 2.8], [622, 51.6, 3.6], [611, 51, 3.2], [601, 48.6, 2], [594, 51.2, 1.4]].map(([s, t, o]) => { const f = HEAD.frameAt(s, Math.min(t, HEAD.top(s) - 3), sd); return vadd(f.P, f.N, o); });
        g.add(ribbon(vp, SEC.lens, { wf: (u) => 4.6 * Math.sin(Math.PI * Math.min(1, 0.12 + u * 0.95)) + 0.6, hf: (u) => 2.2 * (1 - u) + 0.7, up: [0, 0.75, 0.66 * sd], seg: 24 }), 'porcelain');
      }
      // flame brows: four grooved gilt tongues off the brow ridge, sweeping back and up (kept under the sight line)
      const tongues = [];
      for (const [s, t, L] of [[644, 44.4, 15], [634, 48.4, 17], [622, 50.4, 18], [610, 49, 16]]) {
        const f = HEAD.frameAt(s, t, sd), P0 = vadd(f.P, f.N, 0.3);
        const path = [[0, 0, 0], [-0.3 * L, 0.16 * L, 0.06 * L], [-0.62 * L, 0.3 * L, 0.1 * L], [-0.88 * L, 0.34 * L, 0.06 * L], [-L, 0.25 * L, 0]].map(([a, b, c]) => [P0[0] + a, Math.min(54, P0[1] + b), P0[2] + sd * c]);
        tongues.push(ribbon(path, SEC.groove2, { wf: (u) => 2.7 * (1 - u) ** 0.8 + 0.25, hf: (u) => 0.95 * (1 - u) + 0.25, up: f.N, seg: 12 }));
      }
      g.add(merge(tongues), 'gold');
      // lip-corner curls (卷雲嘴角) and short whisker curls (the 焚海 twin grows the long sensing whiskers)
      const cw0 = HEAD.hw(608, ROOF + 1) + 0.6;
      g.add(sweep(atW(spiral(607, 9.4, 5.6, 1.2, 100, -230, 18), cw0 * sd), 0.85, { seg: 22, radial: 5 }), 'gold');
      const ww = HEAD.hw(676, 14);
      g.add(taper([[678, 14, (ww - 0.6) * sd], [669, 10.6, (ww + 3.8) * sd], [658, 12.4, (ww + 6.8) * sd], [651, 17.6, (ww + 7.2) * sd], [653, 21.4, (ww + 5.8) * sd], [657.5, 20.2, (ww + 4.8) * sd]], 1.3, 0.45, { seg: 22, radial: 6 }), 'gold');
      // ringed antlers swept back and out (they frame the reticle when aiming; nothing above t 55.5, the sight line is
      // t 62): main beam off the brow with a burr of knobs at its root, two tines, curling tips
      const T0 = HEAD.topAt(606, 10.5) - 1;
      const ringed = (pts, r0, r1, pitch, seg) => taper(pts, 0, 0, { seg, radial: 9, rf: (u) => (r0 + (r1 - r0) * u) * (1 + 0.14 * (0.5 + 0.5 * Math.cos(2 * Math.PI * u * plen(pts) / pitch)) ** 4) });
      const beam = [[606, T0, 10.5 * sd], [594, T0 + 3.4, 14.4 * sd], [578, 54.2, 19 * sd], [562, 55, 23.6 * sd], [548, 53.6, 27.6 * sd], [537, 49.6, 30.4 * sd], [532, 44.6, 30 * sd], [534.6, 41.2, 28.2 * sd]];
      g.add(ringed(beam, 4.4, 0.8, 4.6, 96), 'gold');
      g.add(ringed([[583, 52.4, 16.8 * sd], [578, 55.2, 21 * sd], [570, 55.6, 25.4 * sd], [564, 54.4, 28 * sd], [562.4, 52.4, 27.6 * sd]], 2.4, 0.55, 4, 34), 'gold');
      g.add(ringed([[557, 53, 24.6 * sd], [550, 55, 29.4 * sd], [544.6, 54, 32.2 * sd], [543, 51.8, 31.6 * sd]], 1.8, 0.5, 3.6, 26), 'gold');
      {
        const a = V(...beam[0]), d = V(...beam[1]).sub(a).normalize(), e1 = new THREE.Vector3(0, 1, 0).cross(d).normalize(), e2 = d.clone().cross(e1);
        const knobs = [];
        for (let k = 0; k < 7; k++) {
          const ang = (k / 7) * Math.PI * 2, p = a.clone().addScaledVector(d, 1.6).addScaledVector(e1, Math.cos(ang) * 4.7).addScaledVector(e2, Math.sin(ang) * 4.7);
          knobs.push(sphere([-p.z, p.y, p.x], 1.35 + (k % 2) * 0.25, { seg: 8 }));
        }
        g.add(merge(knobs), 'gold');
      }
      // gill fins flaring behind the cheeks (the fish half of the 螭吻), cobalt with gilt rays and edge
      const gw = HEAD.hw(592, 20) - 0.8;
      const finP = [[600, 28, 2], [588, 37, 8], [564, 41, 10], [540, 35, 4], [528, 26, 0], [544, 21, 4], [532, 12, 0], [550, 6.5, 4], [574, 4.5, 8], [598, 12, 3]];
      g.add(PF(finP, { w: 2.6, cw: gw * sd, bevel: 0.9, curveSeg: 2 }), 'glaze_cobalt');
      for (const [a, b] of [[[596, 27], [542, 34]], [[596, 22], [532, 26]], [[596, 16], [534, 12]], [[594, 10.5], [552, 7]]]) g.add(sweep([[a[0], a[1], (gw + 1.45) * sd], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.8, (gw + 1.55) * sd], [b[0], b[1], (gw + 1.45) * sd]], 0.55, { seg: 6, radial: 4 }), 'gold');
      g.add(sweep(atW([[588, 37.6], [564, 41.6], [540, 35.6], [528.6, 26]], (gw + 0.2) * sd), 0.75, { seg: 18, radial: 5 }), 'gold');
      // cloud-scroll cheek plate over the jaw hinge (comma: a disc running out into a tail up and back), gilt spiral,
      // gilt rim, the hinge rivet at its eye
      {
        const C = [604, -3], R = 8.6, tip = [589, 9.5], ang = Math.atan2(tip[1] - C[1], tip[0] - C[0]), L = Math.hypot(tip[0] - C[0], tip[1] - C[1]), be = Math.acos(R / L);
        const arc = [];
        for (let i = 0; i <= 16; i++) { const a = ang + be + ((2 * Math.PI - 2 * be) * i) / 16; arc.push([C[0] + R * Math.cos(a), C[1] + R * Math.sin(a)]); }
        const q = (a, c, b, n) => Array.from({ length: n }, (_, i) => { const k = (i + 1) / n, m = 1 - k; return [m * m * a[0] + 2 * m * k * c[0] + k * k * b[0], m * m * a[1] + 2 * m * k * c[1] + k * k * b[1]]; });
        const e0 = arc[arc.length - 1], s0 = arc[0];
        const outline = [...arc, ...q(e0, [C[0] - 13, C[1] - 1], tip, 6), ...q(tip, [C[0] - 2.5, C[1] + 7], s0, 6).slice(0, -1)];
        const cw = 21.4 * sd;
        g.add(PF(outline.map(([s, t]) => [s, t, 0]), { w: 2.6, cw, bevel: 0.8, bevelSeg: 2, curveSeg: 1 }), 'glaze_cobalt');
        const face = cw + sd * 1.3;
        g.add(merge([flat(spiral(C[0], C[1], 1.6, 6.6, 70, -400, 30).concat([[C[0] - 9.6, C[1] + 4.2], [tip[0] + 2.6, tip[1] - 2]]), face, sd, 0.36, 0.22, 40),
          flat([...outline, outline[0]].map(([s, t]) => { const d = Math.hypot(s - C[0], t - C[1]) || 1; return [s + (C[0] - s) / d * 0.9, t + (C[1] - t) / d * 0.9]; }), face, sd, 0.3, 0.2, 60),
          lax([[0, 0], [0, 2.1], [0.9, 1.7], [1.3, 0]], [C[0], C[1], face], sideAx(sd), 12)]), 'gold');
      }
    }
    // relief scales over the crown and nape (cobalt, gilt rims), free edges to the shooter
    {
      const cbd = [], cbd2 = [];
      for (let i = 0; i < 7; i++) {
        const s = 562 + i * 5.3;
        for (let j = -3; j <= 3; j++) {
          const w = j * 5.6 + (i % 2) * 2.8;
          if (Math.abs(w) > 17.5 || (s > 590 && Math.abs(w) > 12)) continue;
          const f = HEAD.frameTop(s, w), { body, bead } = fishScale(-1.8, 0, 2.9, 3.9, 0.55, 1, { th: 1.1, tilt: 7, bevel: 0.35 });
          cbd.push(placeOn(body, vadd(f.P, f.N, -0.4), f.N, f.T)); cbd2.push(placeOn(bead, vadd(f.P, f.N, -0.4), f.N, f.T));
        }
      }
      g.add(merge(cbd), 'glaze_cobalt');
      g.add(merge(cbd2), 'gold');
    }
    // the mane: grooved cobalt flame locks off the upper rear of the head, following the skull back over the neck and
    // flicking up at the tips (clear of the first ridge tile)
    {
      const locks = [];
      for (const sd of [1, -1]) {
        for (const [s, t, L, rise, out, wd] of [[599, 46.5, 34, 6, 2.5, 6.6], [596, 41, 40, 5, 5.5, 7.6], [592, 34.5, 42, 3.5, 7.5, 7.8], [588, 28, 38, 2.5, 8.5, 7]]) {
          const path = [];
          for (let k = 0; k <= 6; k++) {
            const u = k / 6, ss = s - L * u, tt = t + rise * u * u + 1.2 * Math.sin(Math.PI * u);
            path.push([ss, tt, sd * (HEAD.hw(Math.max(ss, 549), Math.min(tt, HEAD.top(Math.max(ss, 549)) - 2)) + 0.5 + out * u ** 1.6)]);
          }
          const e = path[path.length - 1];
          path.push([e[0] - 3, e[1] + 3.2, e[2]]);
          locks.push(ribbon(path, SEC.groove2, { wf: (u) => wd * (u < 0.2 ? 0.6 + 2 * u : 1 - 0.85 * ((u - 0.2) / 0.8) ** 1.2), hf: (u) => 2.1 * (1 - u) + 0.5, up: [0.1, 0.45, sd], seg: 20 }));
        }
      }
      g.add(merge(locks), 'glaze_cobalt');
    }
    // gilt upper lip all round the mouth (one sweep, right corner -> snout -> left corner)
    const lipS = [606, 616, 626, 636, 646, 656, 666, 676, 684, 690, 695, 699, 702.5, 705];
    const lipR = lipS.map((s) => [s, ROOF + 0.2, HEAD.hw(s, ROOF + 0.2) + 0.15]);
    g.add(sweep([...lipR, [707.2, ROOF + 0.3, 0], ...lipR.slice().reverse().map(([s, t, w]) => [s, t, -w])], 1.1, { seg: 60, radial: 6 }), 'gold');
    // teeth hang from the lip where they clear the compensator (w > ~9.5); two fangs a side
    const teeth = [];
    for (const sd of [1, -1]) for (const [s, L] of [[624, 2.6], [632, 2.8], [640, 3], [648, 2.8], [656, 2.8], [664, 3], [672, 3.2], [681, 7.6], [692, 4.6]]) {
      teeth.push(xform(lathe([[0, 0], [0, L > 5 ? 1.7 : 1.15], [L, 0]], { seg: 6 }), { rot: [-90, 0, 0], move: [s, ROOF + 0.1, (HEAD.hw(s, ROOF + 0.05) - 1.6) * sd] }));
    }
    g.add(merge(teeth), 'porcelain');
  }
  // lower jaw fx_jaw (hinge at the cheek plates): 3° a shot, 25° for the beam / ultimate (extras.open = -25)
  {
    const jaw = g.part('fx_jaw', { pivot: [604, -4, 0], extras: { open: -25, hinge: 'w', note: 'lower jaw: v 0.12 per shot (3°), 1 = 25° open' } });
    const JAW = new Body([
      [598, 7, 2, -11, -15, 2.3, 2.2],
      [603, 12.5, 2, -12, -20, 2.4, 2.3],
      [612, 16.6, 0, -13, -24.2, 2.5, 2.4],
      [628, 17.4, -1, -13.5, -26.6, 2.6, 2.5],
      [648, 15.8, -1, -14, -27, 2.6, 2.5],
      [666, 14.4, -1.5, -13.8, -25.8, 2.6, 2.4],
      [682, 14.6, -2, -13.4, -23.8, 2.5, 2.4],
      [694, 13.6, -3, -12.8, -21, 2.4, 2.3],
      [700, 10.6, -4, -12.4, -18, 2.3, 2.2],
      [704.5, 5, -5.5, -12, -14.6, 2.2, 2.1],
      [706.5, 1.6, -7, -11.8, -13, 2.1, 2.1],
    ], { ceil: pchip([[598, 0], [606, -5], [614, FLOOR], [710, FLOOR]]) });
    const jb = (s, t) => [s, t, JAW.hw(s, t)];
    JAW.brushes = [
      [[jb(616, FLOOR - 2.6), jb(650, FLOOR - 2.8), jb(690, FLOOR - 2.6), jb(701, FLOOR - 2.2)], 2.6, 1.1],   // lower lip roll
      [[jb(612, -18.5), jb(640, -21.6), jb(668, -21.6), jb(692, -18.2)], 2.8, 1.3],                            // jaw line
      [[JAW.pt(626, -Math.PI / 2), JAW.pt(694, -Math.PI / 2)], 3.2, 1.0],                                      // chin keel
    ];
    jaw.add(skin(JAW.rings(sList(598, 706.5, 2.5, [0, 0.4, 1.1, 2]), 56), { crease: 55 }), 'porcelain');
    // arms up to the hinge (inside the cheek plates)
    for (const sd of [1, -1]) jaw.add(PF([[597, 0, 2], [610, 0, 2], [628, -10, 3], [616, -15.5, 4], [598, -9, 3]], { w: 2.6, cw: 13.4 * sd, bevel: 0.8 }), 'porcelain');
    // grooved lacquer tongue, rounded tip
    const tw = (u) => (u < 0.8 ? 6.4 - 2.2 * u : 4.64 * Math.sqrt(Math.max(0.02, 1 - ((u - 0.8) / 0.2) ** 2)));
    jaw.add(ribbon([[617, FLOOR + 0.2, 0], [640, FLOOR + 1.0, 0], [664, FLOOR + 1.2, 0], [684, FLOOR + 0.6, 0], [694.5, FLOOR - 0.1, 0]], SEC.groove1,
      { wf: tw, hf: (u) => (u < 0.85 ? 1.05 : 1.05 * Math.sqrt(Math.max(0.05, 1 - ((u - 0.85) / 0.15) ** 2))), up: [0, 1, 0], seg: 30 }), 'lacquer_red');
    const llS = [608, 618, 630, 642, 654, 666, 676, 684, 690, 695, 699, 702, 704.6];
    const llR = llS.map((s) => [s, FLOOR - 0.1, JAW.hw(s, FLOOR - 0.15) + 0.1]);
    jaw.add(sweep([...llR, [706.4, FLOOR, 0], ...llR.slice().reverse().map(([s, t, w]) => [s, t, -w])], 1.0, { seg: 52, radial: 6 }), 'gold');
    const teeth = [];
    for (const sd of [1, -1]) {
      for (const [s, L] of [[652, 2.4], [662, 2.6], [672, 2.6], [679, 6.2], [688, 2.6]]) teeth.push(xform(lathe([[0, 0], [0, L > 5 ? 1.5 : 1.1], [L, 0]], { seg: 6 }), { rot: [90, 0, 0], move: [s, FLOOR - 0.1, (JAW.hw(s, FLOOR - 0.15) - 1.4) * sd] }));
      jaw.add(taper([[682, -23, 5 * sd], [678, -28, 6.6 * sd], [672, -31.4, 6.2 * sd], [667, -29.4, 5 * sd], [669.5, -27.2, 4.4 * sd]], 1.1, 0.4, { seg: 14, radial: 5 }), 'gold');
      // gilt bead along the jaw-line ridge
      jaw.add(sweep([612, 626, 640, 654, 668, 682, 692].map((s) => { const t = -18.5 - 3.1 * Math.sin(((s - 612) / 80) * Math.PI); return [s, t, sd * (JAW.hw(s, t) + 0.25)]; }), 0.5, { seg: 24, radial: 4 }), 'gold');
    }
    jaw.add(merge(teeth), 'porcelain');
    // authored 6° agape: the jaws hold the barrel, the fire kick / beam open it further
    for (const list of jaw.geos.values()) for (const geo of list) xform(geo, { rot: [-6, 0, 0], pivot: [604, -4, 0] });
  }

  // ======================================================================== water tube (hero focus) on the lower right of the handguard
  g.add(tube(TS0 + 6, TS1 - 6, 8, 7.3, { t: TT, w: TW, seg: 24 }), 'glass_clear');
  {
    const water = g.part('fx_tube', { pivot: [392, TT, TW], extras: { pv: { preset: 'pv_core', coreMode: 2, coreScale: 3 }, note: 'water column (pv_core mode 2)' } });
    water.add(cyl(TS0 + 7, TS1 - 7, 4.4, { t: TT, w: TW, seg: 20 }), 'glass');
    // bubbles riding a 3-start helix between the water core and the glass: spinning it = the water flowing
    const flow = g.part('fx_flow', { pivot: [392, TT, TW], extras: { spin: 's', rate: 1380, note: 'bubble helix (pitch 130 mm): spinMul 1 = water flowing 0.5 m/s' } });
    const bub = [];
    for (let k = 0; k < 3; k++) for (let i = 0; i < 6; i++) {
      const u = (i + k / 3) / 6, s = TS0 + 14 + u * (TS1 - TS0 - 28), a = k * 2.094 + u * Math.PI * 4;
      const r = 1.15 + ((i * 7 + k * 3) % 4) * 0.12;
      bub.push(sphere([s, TT + Math.cos(a) * 5.85, TW + Math.sin(a) * 5.85], r, { seg: 9 }));
    }
    flow.add(merge(bub), 'crystal');
  }
  // brass union nuts: a hex (two screws on its outer flat) and a knurled ring, a gilt band between; elbows feeding
  // the water into the handguard
  for (const [s0, dir] of [[TS0, 1], [TS1, -1]]) {
    const a = dir > 0 ? s0 : s0 - 12, b = dir > 0 ? s0 + 12 : s0;
    const [h0, h1] = dir > 0 ? [a, a + 7] : [b - 7, b], [k0, k1] = dir > 0 ? [a + 8, b] : [a, b - 8];
    g.add(lathe([[h0, 6], [h0, 9.8], [h0 + 0.7, 10.5], [h1 - 0.7, 10.5], [h1, 9.8], [h1, 6], [h0, 6]], { t: TT, w: TW, seg: 6 }), 'brass');
    g.add(SC(gearPts(TW, TT, 10.3, 9.7, 30), k0, k1, { bevel: 0.35, bevelSeg: 1, curveSeg: 1 }), 'brass');
    g.add(washer(dir > 0 ? h1 : k1, dir > 0 ? k0 : h0, 7, 10.2, 0.2, 18, TT, TW), 'gold');
    g.add(washer(dir > 0 ? b - 0.2 : a - 1.6, dir > 0 ? b + 1.6 : a + 0.2, 7.6, 9.2, 0.3, 16, TT, TW), 'brass');
    g.add(sweep([[s0 + dir * 4, TT + 7, TW - 3], [s0 + dir * 4, TT + 11, TW - 6], [s0 + dir * 4, TT + 13, TW - 12]], 2.6, { seg: 8, radial: 8 }), 'brass');
    for (const t of [TT + 2.5, TT - 2.5]) g.add(capScrew([(h0 + h1) / 2, t, TW + 9.05], 1.05, 'w', 0.55, 6), 'steel_bright');
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
    // battery cap (right): knurled gilt knob; brightness buttons (rear) with a gilt frame
    g.add(lax([[0, 0], [0, 7.4], [1.0, 7.6], [5.2, 7.6], [6, 6.8], [6, 0]], [47, B + 16, 15], 'w', 24), 'steel_dark');
    g.add(PF(gearPts(47, B + 16, 8.1, 7.4, 22), { w: 3.6, cw: 18.6, bevel: 0.3 }), 'gold');
    g.add(lax([[0, 0], [0, 3.2], [0.8, 3.0], [1.0, 0]], [47, B + 16, 21], 'w', 16), 'gold');
    // hood: two side walls + bridge, window frames
    for (const sd of [1, -1]) {
      g.add(PF([[66, B + 6, 1.5], [128, B + 6, 1.5], [128, B + 50, 3], [104, B + 53, 5], [70, B + 51, 5], [66, B + 26, 1.5]], { w: 4, cw: 16.4 * sd, bevel: 1.2,
        holes: [[[74, B + 19, 4], [120, B + 19, 4], [120, B + 43, 6], [74, B + 43, 6]]] }), 'steel_dark');
      g.add(capScrew([118, B + 10, 18.6 * sd], 1.4, sideAx(sd), 0.6, 6), 'steel_bright');
      g.add(capScrew([72, B + 10, 18.6 * sd], 1.4, sideAx(sd), 0.6, 6), 'steel_bright');
      // gilt frame round the side window + a cloud scroll on the lower panel
      const wf = [[73.4, B + 18.4], [120.6, B + 18.4], [120.6, B + 43.6], [73.4, B + 43.6]];
      const wires = [];
      for (let i = 0; i < 4; i++) wires.push(strip(wf[i], wf[(i + 1) % 4], 18.55 * sd, 0.9, 0.5));
      wires.push(flat(cloudPts(80, B + 10.5, 2.6, 1), 18.4 * sd, sd, 0.28, 0.18, 30));
      wires.push(flat(cloudPts(110, B + 10.5, 2.6, -1), 18.4 * sd, sd, 0.28, 0.18, 30));
      g.add(merge(wires), 'gold');
    }
    // the bridge: cobalt glaze top in a gilt rim, a little upturned at the front corners (a roof eave)
    g.add(PF([[68, B + 48.4, 3], [128, B + 48.4, 3], [128, B + 53, 3], [70, B + 53, 3]], { w: 36.8, bevel: 1.4 }), 'steel_dark');
    g.add(PF([[69, B + 52.6, 2], [126.6, B + 52.6, 2], [128.4, B + 54.6, 1], [124, B + 54.2, 1], [72, B + 54.2, 1]], { w: 33.6, bevel: 0.6 }), 'glaze_cobalt');
    g.add(PF([[68, B + 52.4, 2], [128, B + 52.4, 2], [128, B + 53.4, 1], [70, B + 53.4, 1]], { w: 37.4, bevel: 0.3 }), 'gold');
    for (const sd of [1, -1]) g.add(taper([[121, B + 53.6, 18.4 * sd], [126, B + 54.4, 19.2 * sd], [129.5, B + 57, 19.6 * sd], [130.2, B + 59.2, 18.8 * sd]], 1.0, 0.4, { seg: 10, radial: 5 }), 'gold');
    g.add(sweep([[74, B + 54.5, 0], [100, B + 54.9, 0], [124, B + 54.7, 0]], 0.5, { seg: 10, radial: 4 }), 'gold');
    g.add(box([97, B + 10.5, 0], [62, 9, 28.8], { r: 1.2, seg: 1 }), 'steel_dark');   // lower housing under the window (laser diode, electronics)
    // window frames (front + rear: the front one gilt) and glass
    for (const s of [76, 124]) {
      g.add(SC([[-14.4, B + 14], [14.4, B + 14], [14.4, B + 49], [-14.4, B + 49]], s - 2, s + 2, { bevel: 0.6, bevelSeg: 1,
        holes: [[[-12.2, B + 18, 2.5], [12.2, B + 18, 2.5], [12.2, B + 46, 3], [-12.2, B + 46, 3]]] }), s > 100 ? 'gold' : 'steel_dark');
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
    g.add(stamp('TW-1', [62, B + 17, -15], { px: 0.5, side: -1 }), 'gold');
  }

  // ======================================================================== transparent water-tank magazine (40 rds)
  const mag = g.part('mag', { pivot: [160, -13, 0], extras: { drop: true } });
  {
    mag.add(PF([[121.6, -13, 1.5], [198.4, -13, 1.5], [200, -168, 4], [120, -168, 4]], { w: 29, bevel: 2.4, bevelSeg: 2 }), 'glass_clear');
    // steel frame: front and rear spines, base plate (2 screws), feed lips
    mag.add(PF([[196.6, -16, 1], [201.4, -16, 1], [203.2, -170, 2], [198.4, -170, 2]], { w: 23, bevel: 0.8 }), 'steel_dark');
    mag.add(PF([[118.6, -16, 1], [123.4, -16, 1], [121.6, -170, 2], [116.8, -170, 2]], { w: 23, bevel: 0.8 }), 'steel_dark');
    mag.add(PF([[114, -167, 2], [206, -167, 2], [206, -176, 3], [114, -176, 3]], { w: 32, bevel: 1.6 }), 'steel_dark');
    // gilt straps round the tank (under the magwell, low) and a gilt wave on the base plate
    for (const t of [-72.4, -128]) mag.add(PF([[118.4, t + 1.6, 0.6], [201.6, t + 1.6, 0.6], [201.8, t - 1.6, 0.6], [118.2, t - 1.6, 0.6]], { w: 30.6, bevel: 0.5 }), 'gold');
    for (const sd of [1, -1]) {
      const wv = [];
      for (let i = 0; i <= 20; i++) wv.push([122 + i * 3.8, -171.5 + Math.sin(i * 0.9) * 1.6]);
      mag.add(flat(wv, 16, sd, 0.4, 0.24), 'gold');
    }
    for (const s of [134, 186]) mag.add(capScrew([s, -176.2, 0], 1.6, '-t', 0.6), 'steel_bright');
    for (const sd of [1, -1]) mag.add(box([150, -14.6, 11.2 * sd], [52, 3.2, 2.6], { r: 0.8 }), 'steel_dark');
    for (let k = 0; k < 5; k++) mag.add(box([202.2, -96 - k * 16, 0], [1.2, 0.8, 10], { r: 0 }), 'steel_bright');   // level ticks
    // the round stack (staggered) down to the follower; the air gap under the magwell shows the last of it
    for (let i = 0; i < 9; i++) {
      const t = -19.8 - i * 7.4, w = i % 2 ? -2.8 : 2.6;
      mag.add(lathe([[125, 0], [125, 5.6], [125.8, 5.9], [126.6, 5.9], [127.2, 5.3], [128.6, 5.3], [129.2, 6], [168, 5.7], [171.5, 4.4], [177, 4.3], [177, 0]], { t, w, seg: 10 }), 'brass');
      mag.add(lathe([[176.8, 0], [176.8, 3.95], [183, 3.95], [188, 3.1], [192, 1.5], [194, 0.3], [194.2, 0]], { t, w, seg: 10 }), 'copper');
    }
    mag.add(PF([[123.4, -84, 1.2], [197, -82, 1.2], [197, -86.4, 1], [123.4, -88.4, 1]], { w: 22, bevel: 0.6 }), 'polymer_grip');   // follower
    // the tank's water: a deeper, dimmer blue than the hero tube, under the round stack (one focus, §1.1 #3)
    const mw = g.part('fx_magwater', { parent: 'mag', pivot: [160, -125, 0], extras: { pv: { preset: 'pv_core', coreMode: 2, coreScale: 0.7, coreTint: '#1b5a84' }, note: 'water in the tank magazine' } });
    mw.add(PF([[123.6, -89, 2], [196.4, -89, 2], [197.4, -165, 3], [122.6, -165, 3]], { w: 24.4, bevel: 1.6 }), 'glass');
  }

  // ======================================================================== sockets & meta
  const eyeFront = (sd) => { const p = vadd(EYE.P, EYE.N, 5.4); return sd > 0 ? p : mirW(p); };
  g.socket('muzzle', [MUZZLE, 0, 0]);
  g.socket('eject', [154, 2, 15.5], { dir: [0.2, 0.45, 1] });
  g.socket('grip_r', [1 + GS, -80 + GT, 0], { rot: [0, 0, -20] });
  g.socket('grip_l', [338, -24, 0]);
  g.socket('magwell', [164, -82, 0]);
  g.socket('charge', [214, 6, -26]);
  g.socket('optic', [123, AIM, 0], { type: 'holo', zoom: 1.25 });
  g.socket('whiskerL', [676, 14, -13]);       // S_whiskerL / R: twin 焚海 whisker roots (cheeks)
  g.socket('whiskerR', [676, 14, 13]);
  g.socket('mouth', [676, 0, 0]);             // bubbles, water mist, beam origin
  g.socket('eye_r', eyeFront(1));
  g.socket('eye_l', eyeFront(-1));
  g.socket('tube', [392, TT, TW + 8]);        // middle of the water tube (outside face)
  g.socket('tube_a', [TS0 + 10, TT, TW]);
  g.socket('tube_b', [TS1 - 10, TT, TW]);
  g.socket('ridge', [300, 38, 0]);
  g.socket('scales_r', [333, 0, 22]);
  g.socket('scales_l', [333, 0, -22]);
  g.socket('tail', [-340, 76, 0]);
  g.socket('mane', [556, 50, 0]);
  g.meta({
    grip: 'rifle', support: 'handguard', reload: 'mag', chargeSide: 'left', series: 'jiuzi',
    notes: 'M07 螭吻. fx_jaw hinge w (open -25: v 0.12 = 3° per shot, 1 = beam / ult). fx_scale1..6: groups rear -> front, '
      + 'open -4 about w (rear edges flick up), order = k. fx_tail: open 7 about t, driven -1..1 (sway). fx_tube: pv_core water; '
      + 'fx_flow: bubble helix, spin s (spinMul = flow speed). mag: clear tank + fx_magwater (pv_core). fx_resonance: 九子 lamp. '
      + 'The ejection-port dust cover is modelled open.',
  });
  // bake: flat faces keep their own normals; every mesh but glass / glow is sliced along s and tessellated to 14 mm
  // (so the per-vertex AO does not streak across the long extrusion faces), then the kit's bake (no further splits)
  // and m4's postBake (unbury AO, per-material wear, clean flat faces).
  g.build = (opts = {}) => {
    if (opts.bake === false) return Gun.prototype.build.call(g, opts);
    const root = Gun.prototype.build.call(g, { ...opts, bake: false });
    const L = (opts.tessellate ?? 14) * 0.001, meshes = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      flattenFaces(o.geometry);
      if (!NO_TESS.test(o.name)) o.geometry = new TessellateModifier(L, 10).modify(sliceS(o.geometry, L));
      meshes.push(o);
    });
    bakeMeshes(meshes, { tessellate: 1, aoDist: 0.035, rays: 32, log: true });
    postBake(root, {}, WEAR);
    return root;
  };
  return g;
}
