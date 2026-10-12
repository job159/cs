// 鐵鼠 Rattler-9 — open-bolt 9 mm SMG, Uzi pattern (stamped sheet-steel receiver with pressed side ribs,
// magazine through the pistol grip, telescoping bolt, top cocking knob, folding metal stock folded under).
//
// Side view, mm: s forward from the rear face of the receiver, t up from the bore axis, w right (ejection side).
// Real reference: 470 mm long stock folded (650 extended), 260 mm barrel, 32-round box magazine.
//   rearmost (stock hinge eye)  s ≈ -9      muzzle  s = 460      -> ≈470 mm overall, stock folded
//   breech face                 s = 200     barrel 200..460      -> 260 mm
//   grip / magwell axis         s = 181, raked 5° (bottom rearward); the magazine runs up through the grip
//   folded stock: arms 148 mm hinge-to-hinge + buttplate -> ≈ +175 mm when deployed (≈645 mm extended)
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  Gun, DEG, makeShape, profile, plan, section, lathe, cyl, box, ring, cut, cutters, merge, xform, circle,
} from '../lib/gunkit.mjs';

// ------------------------------------------------------------------------------------------ dimensions
const RW = 22;          // receiver half width (44 mm sheet box)
const R_TOP = 22;       // receiver top (top cover sits above)
const R_BOT = -28;      // receiver bottom
const R_FRONT = 366;    // receiver front (front plate 364.5..371)
const MUZZLE = 460;
const RAKE = 5;         // grip / magazine rake, deg
const GP = [181, -30];  // rake pivot (magwell axis at the receiver bottom)
const KNOB_S = 294;     // cocking knob rest position (forward end of its slot)

// ------------------------------------------------------------------------------------------ budget-aware wrappers
// The kit defaults to 10 segments per fillet; most fillets here are 1–3 mm, so 4–6 segments are plenty.
const P = (spec, o = {}) => profile(spec, { curveSeg: 5, bevelSeg: 2, ...o });
const S = (spec, s0, s1, o = {}) => section(spec, s0, s1, { curveSeg: 5, bevelSeg: 2, ...o });
const PL = (spec, o = {}) => plan(spec, { curveSeg: 5, bevelSeg: 2, ...o });
/** small box: r = 0 -> 12 tris, r > 0 -> one rounding segment (the kit's default seg 2 costs ~300 tris) */
const bx = (c, size, r = 0, rot) => box(c, size, { r, seg: 1, rot });
/** small chamfered block (~30 tris): side-view rect extruded across w with a 1-segment bevel */
const rib = ([s, t, w], [ls, lt, lw], ch = 0.3) => P(rectPts(s - ls / 2, s + ls / 2, t - lt / 2, t + lt / 2, 0), { w: lw, cw: w, bevel: ch, bevelSeg: 1 });

// ------------------------------------------------------------------------------------------ helpers
const rectPts = (s0, s1, t0, t1, r = 0) => [[s0, t0, r], [s1, t0, r], [s1, t1, r], [s0, t1, r]];

/** rake an upright-authored grip/mag geometry about GP (bottom swings rearward) */
const rk = (geo) => xform(geo, { rot: [-RAKE, 0, 0], pivot: [GP[0], GP[1], 0] });
/** same transform for a point [s, t] */
function rkPt(s, t) {
  const r = RAKE * DEG, ds = s - GP[0], dt = t - GP[1];
  return [GP[0] + ds * Math.cos(r) + dt * Math.sin(r), GP[1] + dt * Math.cos(r) - ds * Math.sin(r)];
}

/**
 * Left/right mirror. Works around gunkit's mirrorW, which negates normal.x a second time after
 * geometry.scale(-1,1,1) has already mirrored the normals (mirrored parts render lit from the wrong side),
 * and which swaps triangle positions without swapping their normals.
 */
function mirror(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.scale(-1, 1, 1);
  for (const name of ['position', 'normal']) {
    const a = g.attributes[name];
    if (!a) continue;
    const arr = a.array;
    for (let i = 0; i < a.count; i += 3) {
      for (let c = 0; c < 3; c++) { const k1 = (i + 1) * 3 + c, k2 = (i + 2) * 3 + c; const tmp = arr[k1]; arr[k1] = arr[k2]; arr[k2] = tmp; }
    }
  }
  return g;
}

/**
 * section() with a gridded skin: the (w, t) outline gets extra points every `step` mm and the extrusion is split into
 * `step`-long rings. CSG on the kit's single-span extrusions leaves long slivers fanning out from small features (groove
 * ends, port corners); the bake writes edge wear per vertex and only splits to 12 mm, so a high-wear vertex at a groove
 * tip smears into a bright spike along every sliver. A pre-gridded skin keeps the CSG triangles (and the wear) local.
 */
function gridSection(spec, s0, s1, { step = 8, bevel = 1, bevelSeg = 2, curveSeg = 4 } = {}) {
  const pts = [];
  for (let i = 0; i < spec.length; i++) {
    const a = spec[i], b = spec[(i + 1) % spec.length];
    pts.push(a);
    const k = Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / step);
    for (let j = 1; j < k; j++) pts.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k, 0]);
  }
  const len = Math.abs(s1 - s0), b = Math.max(0, Math.min(bevel, len / 2 - 0.05)), depth = Math.max(0.02, len - 2 * b);
  const geo = new THREE.ExtrudeGeometry(makeShape(pts), {
    depth, steps: Math.max(1, Math.round(depth / step)), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b,
    bevelSegments: bevelSeg, curveSegments: curveSeg,
  });
  geo.translate(0, 0, b + Math.min(s0, s1));
  geo.scale(1, 1, -1);
  let g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  const p = g.attributes.position.array;
  for (let i = 0; i < p.length; i += 9) for (let c = 0; c < 3; c++) { const tmp = p[i + 3 + c]; p[i + 3 + c] = p[i + 6 + c]; p[i + 6 + c] = tmp; }
  return toCreasedNormals(g, 38 * DEG);
}

/** offset a closed [s, t, r] polygon by d (d > 0 grows it), fillet radii follow */
function offsetPoly(pts, d) {
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n]; area += x0 * y1 - x1 * y0; }
  const sg = area > 0 ? 1 : -1;
  const nrm = ([x, y]) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n], c = pts[(i + 1) % n];
    const e1 = nrm([p[0] - a[0], p[1] - a[1]]), e2 = nrm([c[0] - p[0], c[1] - p[1]]);
    const n1 = [e1[1] * sg, -e1[0] * sg], n2 = [e2[1] * sg, -e2[0] * sg];
    const m = nrm([n1[0] + n2[0], n1[1] + n2[1]]);
    const k = d / Math.max(0.25, m[0] * n1[0] + m[1] * n1[1]);
    return [p[0] + m[0] * k, p[1] + m[1] * k, p[2] ? Math.max(0.2, p[2] + d) : 0];
  });
}

/** cylinder whose axis runs along w (pins, hinge barrels) */
function cylW(s, t, w0, w1, r, { seg = 14, b } = {}) {
  const L = Math.abs(w1 - w0);
  const g = cyl(-L / 2, L / 2, r, { seg, b: b ?? Math.min(0.5, r * 0.25) });
  g.rotateY(Math.PI / 2);
  return g.translate((w0 + w1) / 2, t, -s);
}
/** cylinder whose axis runs along t (stems, posts) */
function cylT(s, w, t0, t1, r, { seg = 14, b } = {}) {
  const L = Math.abs(t1 - t0);
  const g = cyl(-L / 2, L / 2, r, { seg, b: b ?? Math.min(0.5, r * 0.25) });
  g.rotateX(Math.PI / 2);
  return g.translate(w, (t0 + t1) / 2, -s);
}
/** lathe around a side (w) axis facing outward (+w if side > 0): pts = [[height, r], ...] from surface w0 */
function latheW(pts, s, t, w0, side = 1, seg = 16) {
  const g = lathe(pts, { seg });
  g.rotateY(side > 0 ? -Math.PI / 2 : Math.PI / 2);
  return g.translate(w0, t, -s);
}
/** dome on the rear face (facing -s) whose base is at s0 */
const domeRear = (s0, t, w, r, h = 0.9, seg = 14) => lathe([[s0 - h, 0], [s0 - h * 0.75, r * 0.6], [s0 - h * 0.35, r * 0.92], [s0, r], [s0, 0]], { t, w, seg });
/** shallow spot-weld dimple on a side face */
const weld = (s, t, w, side, r = 1.7) => latheW([[0, 0], [0, r], [0.22, r * 0.72], [0.32, 0]], s, t, w - side * 0.05, side, 10);
/** domed pin head on a side face */
const pinHead = (s, t, w, side, r = 2.4) => latheW([[0, 0], [0, r], [0.5, r * 0.95], [0.95, r * 0.68], [1.15, 0]], s, t, w - side * 0.1, side, 14);
/** slotted screw head on a side face, slot angle `ang` deg in the side plane */
function slotScrew(s, t, w, side, r = 2.6, ang = 30) {
  const head = latheW([[0, 0], [0, r], [0.6, r * 0.96], [1.2, r * 0.74], [1.45, 0]], s, t, w - side * 0.1, side, 16);
  return cut(head, bx([s, t, w + side * 1.45], [r * 2.6, 0.7, 1.5], 0, [ang, 0, 0]));
}
/** capsule along s (rounded ends) — cutter for pressed grooves / channels */
function capsule(s0, s1, t, w, R, seg = 16) {
  const n = 4, pts = [[s0, 0]];
  for (let i = 1; i <= n; i++) { const a = (i / n) * Math.PI / 2; pts.push([s0 + R - R * Math.cos(a), R * Math.sin(a)]); }
  for (let i = 1; i < n; i++) { const a = (i / n) * Math.PI / 2; pts.push([s1 - R + R * Math.sin(a), R * Math.cos(a)]); }
  pts.push([s1, 0]);
  return lathe(pts, { t, w, seg });
}
/** groove of depth d and radius R pressed into a side face at wSurf (sign gives the side) */
const grooveCutter = (s0, s1, t, wSurf, R, d, seg = 16) => capsule(s0, s1, t, wSurf + Math.sign(wSurf) * (R - d), R, seg);
/** side pocket with a 45° chamfered rim: rect (s0..s1, t0..t1, fillet r) cut from the face at wSurf, `depth` deep */
function chamferPocket(s0, s1, t0, t1, r, wSurf, depth, ch = 1.2) {
  const sg = Math.sign(wSurf);
  const wIn = wSurf - sg * depth, wOut = wSurf + sg * 20;
  const main = P(rectPts(s0, s1, t0, t1, r), { w: Math.abs(wOut - wIn), cw: (wIn + wOut) / 2, bevel: 0 });
  const T = 2 * ch + 6;
  const rim = P(rectPts(s0 - ch, s1 + ch, t0 - ch, t1 + ch, r + ch), { w: T, cw: wSurf + sg * (T / 2 - ch), bevel: ch, bevelSeg: 1 });
  return [main, rim];
}
/** gear / knurl outline (closed polygon) centred at (a, b) */
function gearPts(a, b, R, depth, teeth, phase = 0) {
  const pts = [];
  for (let i = 0; i < teeth * 2; i++) {
    const ang = phase + (i * Math.PI) / teeth;
    const rr = i % 2 ? R - depth : R;
    pts.push([a + rr * Math.cos(ang), b + rr * Math.sin(ang)]);
  }
  return pts;
}

// --- tiny stroke font for stamped (raised) markings: glyphs on a 4 x 6 grid
const FONT = {
  A: [[0, 0, 0, 4], [0, 4, 2, 6], [2, 6, 4, 4], [4, 4, 4, 0], [0, 3, 4, 3]],
  C: [[4, 6, 0, 6], [0, 6, 0, 0], [0, 0, 4, 0]],
  E: [[0, 0, 0, 6], [0, 6, 4, 6], [0, 3, 3, 3], [0, 0, 4, 0]],
  F: [[0, 0, 0, 6], [0, 6, 4, 6], [0, 3, 3, 3]],
  I: [[2, 0, 2, 6], [1, 0, 3, 0], [1, 6, 3, 6]],
  L: [[0, 6, 0, 0], [0, 0, 4, 0]],
  M: [[0, 0, 0, 6], [0, 6, 2, 3], [2, 3, 4, 6], [4, 6, 4, 0]],
  N: [[0, 0, 0, 6], [0, 6, 4, 0], [4, 0, 4, 6]],
  O: [[0, 0, 0, 6], [0, 6, 4, 6], [4, 6, 4, 0], [4, 0, 0, 0]],
  R: [[0, 0, 0, 6], [0, 6, 3, 6], [3, 6, 4, 5], [4, 5, 4, 4], [4, 4, 3, 3], [3, 3, 0, 3], [1.5, 3, 4, 0]],
  S: [[4, 6, 0, 6], [0, 6, 0, 3], [0, 3, 4, 3], [4, 3, 4, 0], [4, 0, 0, 0]],
  T: [[0, 6, 4, 6], [2, 6, 2, 0]],
  X: [[0, 0, 4, 6], [0, 6, 4, 0]],
  Y: [[0, 6, 2, 3], [4, 6, 2, 3], [2, 3, 2, 0]],
  0: [[0, 0, 0, 6], [0, 6, 4, 6], [4, 6, 4, 0], [4, 0, 0, 0], [0.4, 1, 3.6, 5]],
  1: [[2, 0, 2, 6], [2, 6, 0.8, 4.8], [1, 0, 3, 0]],
  2: [[0, 6, 4, 6], [4, 6, 4, 3], [4, 3, 0, 3], [0, 3, 0, 0], [0, 0, 4, 0]],
  4: [[0, 6, 0, 3], [0, 3, 4, 3], [4, 6, 4, 0]],
  7: [[0, 6, 4, 6], [4, 6, 1.5, 0]],
  9: [[4, 3, 0, 3], [0, 3, 0, 6], [0, 6, 4, 6], [4, 6, 4, 0], [4, 0, 0, 0]],
  '-': [[1, 3, 3, 3]],
};
/**
 * Raised stamped text on a side face. side = +1 (right face, reads towards the muzzle) or -1 (left face, reads
 * towards the stock). (s, t) = lower-left corner of the first glyph as the reader sees it.
 */
function stamp(text, s, t, w, side, { h = 4, stroke = 0.6, raise = 0.3, gap = 2 } = {}) {
  const k = h / 6, parts = [];
  let x = 0;
  for (const ch of text) {
    for (const [x0, y0, x1, y1] of FONT[ch] || []) {
      const a = [s + side * (x + x0) * k, t + y0 * k], b = [s + side * (x + x1) * k, t + y1 * k];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) / DEG;
      parts.push(bx([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, w + side * (raise / 2 - 0.1)], [L + stroke, stroke, raise + 0.2], 0, [ang, 0, 0]));
    }
    x += 4 + gap;
  }
  return merge(parts);
}

// ==========================================================================================
export default function build() {
  const g = new Gun('uzi');

  // ---------------------------------------------------------------- receiver (stamped sheet-steel box)
  let recv = gridSection([[-RW, R_BOT, 2], [RW, R_BOT, 2], [RW, R_TOP, 1.5], [-RW, R_TOP, 1.5]], 0, R_FRONT, { step: 8, bevel: 1.8, bevelSeg: 3 });
  const rc = [];
  // pressed longitudinal ribs: two deep channels per side leave three raised lands
  for (const side of [1, -1]) {
    const ws = side * RW;
    rc.push(grooveCutter(46, 284, -15, ws, 6, 2.1));               // lower channel (runs under the port)
    if (side < 0) rc.push(grooveCutter(46, 334, 9, ws, 6, 2.1));   // upper channel, left: full length
    else {
      rc.push(grooveCutter(46, 140, 9, ws, 6, 2.1));                // upper channel, right: interrupted by the port
      rc.push(grooveCutter(220, 334, 9, ws, 6, 2.1));
    }
  }
  rc.push(...chamferPocket(152, 208, -5, 15, 2, RW, 17, 1.2));     // ejection port, deep enough to show the bolt
  rc.push(cutters.box([245, 19, 0], [128, 10, 11]));                // cocking channel under the top-cover slot
  recv = cut(recv, rc);
  g.add(recv, 'steel');

  // front & rear end plates (slightly proud of the box -> visible seams)
  g.add(S([[-RW - 0.5, R_BOT - 0.5, 3.5], [RW + 0.5, R_BOT - 0.5, 3.5], [RW + 0.5, R_TOP, 1], [-RW - 0.5, R_TOP, 1]], 364.5, 371, { bevel: 0.9 }), 'steel_dark');
  g.add(S([[-RW - 0.5, R_BOT - 0.5, 3], [RW + 0.5, R_BOT - 0.5, 3], [RW + 0.5, R_TOP + 1, 2], [-RW - 0.5, R_TOP + 1, 2]], -3, 1.2, { bevel: 0.9 }), 'steel_dark');
  // recoil-spring cap boss + retaining ring on the rear plate, four rivets
  g.add(lathe([[-6.2, 0], [-5.8, 5.4], [-4.6, 7.6], [-3.4, 8.4], [-2.6, 8.4], [-2.6, 0]], { t: 2, seg: 28 }), 'steel_dark');
  g.add(ring(-3.1, 10.2, 0.8, { t: 2, axis: 's', seg: 28 }), 'steel_dark');
  for (const [t, w] of [[16, 15], [16, -15], [-20, 15], [-20, -15]]) g.add(domeRear(-2.9, t, w, 2.1, 0.9), 'steel_dark');

  // spot welds where the sight bases, brackets and the lower land are welded to the box
  for (const side of [1, -1]) {
    for (const s of [8, 20, 32, 344, 356]) g.add(weld(s, 18, side * RW, side, 1.4), 'steel');
    for (const s of [6, 18, 30, 296, 340]) g.add(weld(s, -23.6, side * RW, side, 1.3), 'steel');
  }

  // ---------------------------------------------------------------- top cover (separate stamped lid)
  const coverSec = [[-RW - 1.1, 15.5, 0.4], [-RW - 0.1, 15.5], [-RW - 0.1, R_TOP], [RW + 0.1, R_TOP], [RW + 0.1, 15.5], [RW + 1.1, 15.5, 0.4],
    [RW + 1.1, 26, 3.5], [15, 30.5, 8], [-15, 30.5, 8], [-RW - 1.1, 26, 3.5]];
  let cover = S(coverSec, 43, 335.4, { bevel: 1.0, curveSeg: 6 });
  cover = cut(cover, [
    PL(rectPts(188, 302, -3.7, 3.7, 3.6), { h: 30, ct: 30, bevel: 0, curveSeg: 6 }),                        // knob slot
    PL(rectPts(186.8, 303.2, -4.9, 4.9, 4.8), { h: 8.4, ct: 33.5, bevel: 1.2, bevelSeg: 1, curveSeg: 6 }), // chamfered lip
  ]);
  g.add(cover, 'steel');
  // stamped stiffening beads along the crown + rear thumb serrations + front hook tab
  for (const w of [-11.5, 11.5]) g.add(S([[w - 1.6, 28.4], [w + 1.6, 28.4], [w + 1.1, 30.9, 0.8], [w - 1.1, 30.9, 0.8]], 60, 176, { bevel: 0.8, curveSeg: 3 }), 'steel');
  for (let i = 0; i < 7; i++) g.add(S([[-8, 29.6], [8, 29.6], [7.2, 31.1], [-7.2, 31.1]], 50 + i * 4.2, 52.2 + i * 4.2, { bevel: 0.35, bevelSeg: 1 }), 'steel');
  for (const side of [1, -1]) g.add(weld(48, 19, side * (RW + 1.1), side, 1.2), 'steel');

  // ---------------------------------------------------------------- rear sight: base, protective ears, flip aperture
  g.add(P([[2, R_TOP - 1, 1], [42, R_TOP - 1, 1], [42, 28, 2], [39, 31, 2], [5, 31, 2], [2, 28, 1]], { w: 30, bevel: 1.2, curveSeg: 3 }), 'steel');
  const earR = [[4, 27, 1], [38, 27, 1], [38, 36, 5], [31, 48, 4], [12, 48, 4], [4, 37, 5]];
  for (const side of [1, -1]) g.add(P(earR, { w: 3.2, cw: side * 10.6, bevel: 0.8, holes: [circle(23, 39.5, 2.4)] }), 'steel');
  // aperture leaves: one up (aim), one folded back
  g.add(P([[14.5, 30, 1], [21.5, 30, 1], [21.5, 45.5, 2.4], [14.5, 45.5, 2.4]], { w: 9, bevel: 0.6, holes: [circle(18, 41.5, 1.35)] }), 'steel_dark');
  g.add(P([[5, 31, 1], [18, 31, 1], [18, 34, 1], [5, 33.2, 1]], { w: 9, bevel: 0.5, curveSeg: 2 }), 'steel_dark');
  g.add(cylW(18, 32.6, -12.6, 12.6, 1.5), 'steel_dark'); // leaf pivot pin through both ears
  for (const side of [1, -1]) g.add(pinHead(18, 32.6, side * 12.2, side, 2.0), 'steel_dark');
  // top-cover latch buttons through the rear sight base (push to lift the cover)
  for (const side of [1, -1]) g.add(latheW([[0, 0], [0, 4.2], [2.6, 4.2], [3.4, 3.4], [3.6, 0]], 28, 25, side * 15, side, 18), 'steel_dark');

  // ---------------------------------------------------------------- front sight: base, tall ears, post on an elevation drum
  g.add(P([[336, R_TOP - 1, 1], [371, R_TOP - 1, 1], [371, 30, 2.5], [367, 34, 2], [343, 34, 2], [336, 30, 2]], { w: 28, bevel: 1.2, curveSeg: 3 }), 'steel');
  const earF = [[340, 30, 1], [369, 30, 1], [369, 41, 4], [363, 52, 4.5], [347, 52, 4.5], [340, 42, 4]];
  for (const side of [1, -1]) g.add(P(earF, { w: 3, cw: side * 9.6, bevel: 0.75, holes: [circle(361, 44, 2.0)] }), 'steel');
  g.add(cylT(354, 0, 33.5, 36.2, 4.6, { seg: 20 }), 'steel_dark');                        // elevation drum
  g.add(PL(gearPts(354, 0, 4.9, 0.5, 14), { h: 1.6, ct: 35, bevel: 0.25, bevelSeg: 1 }), 'steel_dark'); // drum knurl
  g.add(bx([354, 37.2, 0], [3.8, 2.4, 3.0], 0.5), 'steel_dark');
  g.add(bx([354, 39.6, 0], [2.2, 3.8, 1.8], 0.25), 'steel_dark');                       // post, tip at t = 41.5
  g.add(cylW(354, 31.5, -8.2, 8.2, 1.1), 'steel_dark');                                 // drum retaining pin
  for (const side of [1, -1]) g.add(slotScrew(362, 25.5, side * 14, side, 2.2, 90), 'steel_dark');

  // ---------------------------------------------------------------- barrel nut (knurled) + barrel with crown and real bore
  g.add(lathe([[371, 10.6], [371, 20.0], [372, 21.0], [374.5, 21.0], [374.5, 20.3], [388.5, 20.3], [388.5, 21.0], [391, 21.0], [392, 20.0], [392, 10.6], [371, 10.6]], { seg: 40 }), 'steel');
  g.add(S(gearPts(0, 0, 21.4, 0.8, 36), 375, 388, { bevel: 0.35, bevelSeg: 1, holes: [circle(0, 0, 11)] }), 'steel');
  // nut locking catch (front right, under the nut)
  g.add(P([[370, -27, 1], [378.5, -27, 1], [379.5, -21, 1.5], [370, -16.5, 1]], { w: 5, cw: 16.5, bevel: 0.6, curveSeg: 3 }), 'steel_dark');
  const threads = [];
  for (let s = 448; s < 457; s += 1.2) threads.push([s, 9.75], [s + 0.6, 9.2]);
  g.add(lathe([
    [214, 4.5], [214, 10.2], [446, 10.2], [446.8, 9.75], ...threads, [458.2, 9.6], [460, 8.6], [460, 5.8], [459.2, 4.5], [214, 4.5],
  ], { seg: 24 }), 'steel_dark');

  // ---------------------------------------------------------------- lower frame: trigger housing, guard, grip
  g.add(P([[146, R_BOT + 1, 1], [290, R_BOT + 1, 1], [290, -34, 1.5], [146, -34, 1.5]], { w: 36, bevel: 1, curveSeg: 3 }), 'steel');
  // housing retaining pins (heads on the receiver's lower land) and trigger/sear pins through the housing
  for (const s of [150, 282]) {
    g.add(cylW(s, -23, -RW - 0.6, RW + 0.6, 1.8), 'steel_dark');
    for (const side of [1, -1]) g.add(pinHead(s, -23, side * RW, side, 2.6), 'steel_dark');
  }
  for (const [s, r] of [[214, 1.7], [238, 1.5], [262, 1.5]]) {
    g.add(cylW(s, -31, -18.4, 18.4, r * 0.8), 'steel_dark');
    for (const side of [1, -1]) g.add(pinHead(s, -31, side * 18, side, r), 'steel_dark');
  }

  // trigger guard: stamped band with a pressed stiffening bead on both faces; rear end tucks into the grip
  {
    const gOut = [[200, -33, 1], [290, -33, 1], [290, -38, 2], [287, -64, 9], [276, -76, 10], [212, -76, 9], [200, -70, 4]];
    const gIn = [[210, -38, 2], [282, -38, 2], [280.5, -62, 7], [272, -70.5, 7], [214, -70.5, 6], [209, -62, 4]];
    g.add(P(gOut, { w: 10, bevel: 1.0, holes: [gIn], curveSeg: 6 }), 'steel');
    g.add(P(offsetPoly(gOut, -1.7), { w: 11.4, bevel: 0.6, bevelSeg: 1, curveSeg: 5, holes: [offsetPoly(gIn, 1.7)] }), 'steel');
    for (const side of [1, -1]) g.add(weld(286.5, -50, side * 5, side, 1.2), 'steel');
  }

  // pistol grip, authored upright then raked: steel frame core + bakelite panels
  {
    const parts = [];
    let core = P([[155, -31, 1], [206, -31, 1], [206, -126, 5], [208, -136, 1.5], [152.5, -136, 1.5], [155, -126, 5]], { w: 30, bevel: 1.6, bevelSeg: 2 });
    core = cut(core, [
      cutters.box([181, -125, 0], [35.4, 40, 26.2]),    // magwell mouth (the magazine passes through with a gap)
      cutters.box([155, -68, 0], [8.4, 58, 14]),         // back-strap recess for the grip safety
    ]);
    parts.push([core, 'steel']);
    // magwell flare lip
    parts.push([P([[151.5, -137, 1], [209, -137, 1], [208.6, -131, 1], [152, -131, 1]], { w: 32.5, bevel: 1, curveSeg: 2,
      holes: [rectPts(162.8, 199.2, -136, -132, 0.5)] }), 'steel']);
    // panels: smooth upper boss with the screw, horizontal grip grooves below
    let panel = P([[160, -36, 3], [201.5, -36, 3], [201.5, -123, 6], [160.5, -123, 6]], { w: 4, cw: 16.4, bevel: 1.5, bevelSeg: 2, curveSeg: 5 });
    const pc = [];
    for (let i = 0; i < 12; i++) pc.push(grooveCutter(165.5, 196.5, -57 - i * 5.3, 18.4, 1.7, 0.7, 8));
    pc.push(grooveCutter(165, 197, -51, 18.4, 1.0, 0.45, 8)); // border line under the boss
    panel = cut(panel, pc);
    parts.push([panel, 'bakelite'], [mirror(panel), 'bakelite']);
    parts.push([slotScrew(181, -44, 18.3, 1, 2.6, 20), 'steel_dark'], [slotScrew(181, -44, -18.3, -1, 2.6, -35), 'steel_dark']);
    // mag release button with escutcheon (left, low on the grip)
    parts.push([latheW([[0, 0], [0, 5.4], [0.7, 5.1], [0.9, 0]], 168, -117, -18.3, -1, 18), 'steel']);
    parts.push([latheW([[0, 0], [0, 4.1], [2.4, 3.9], [3.0, 3.1], [3.2, 0]], 168, -117, -18.6, -1, 18), 'steel_dark']);
    for (const [geo, mat] of parts) g.add(rk(geo), mat);
  }

  // grip safety (moving part): lever in the back-strap recess, pivots at its top pin
  {
    const piv = rkPt(155.5, -41);
    const gs = g.part('grip_safety', { pivot: [piv[0], piv[1], 0], extras: { axis: 'w', squeeze: -6 } });
    gs.add(rk(P([[151, -41, 2], [158.5, -40, 1.5], [158.5, -96, 2], [153.5, -97.5, 3], [149.3, -90, 6], [149.6, -60, 10]], { w: 13, bevel: 1.2 })), 'steel');
    for (let i = 0; i < 6; i++) gs.add(rk(rib([149.4, -64 - i * 5, 0], [1.4, 1.6, 11.6], 0.3)), 'steel');
    gs.add(rk(cylW(155.5, -41, -7.8, 7.8, 1.6)), 'steel_dark');
  }

  // trigger (moving part), pin inside the housing
  const trig = g.part('trigger', { pivot: [214, -31, 0], extras: { axis: 'w', pull: 12 } });
  trig.add(P('M 210 -31 L 219 -31 L 219.5 -35 Q 214 -48 218.5 -60 L 214.5 -62.5 Q 207.5 -50 210.5 -36 Z', { w: 6.5, bevel: 1.2, curveSeg: 8 }), 'steel_dark');

  // fire selector (moving part): slider on the left of the lower frame, S-R-A from rear to front
  const sel = g.part('selector', { pivot: [176, -31, -18], extras: { slide: 's', positions: { S: 0, R: 0.0095, A: 0.019 } } });
  sel.add(bx([176, -31, -19.4], [9, 6.2, 3.2], 1.2), 'steel_dark');
  for (let i = 0; i < 3; i++) sel.add(rib([173 + i * 3, -31, -21.1], [1.1, 5.4, 0.9], 0.2), 'steel_dark');
  g.add(P(rectPts(170, 198, -34, -28.5, 2.5), { w: 1, cw: -18.4, bevel: 0.3, curveSeg: 3 }), 'steel_dark'); // selector track
  g.add(stamp('S', 174.5, -26.5, -RW, -1, { h: 3.2, stroke: 0.55 }), 'steel');
  g.add(stamp('R', 184, -26.5, -RW, -1, { h: 3.2, stroke: 0.55 }), 'steel');
  g.add(stamp('A', 193.5, -26.5, -RW, -1, { h: 3.2, stroke: 0.55 }), 'steel');

  // ---------------------------------------------------------------- handguard (bakelite, wraps the lower front of the receiver)
  {
    const hs = [[-25.5, -1, 1.6], [-25.5, -40, 9], [25.5, -40, 9], [25.5, -1, 1.6], [RW + 0.1, -1], [RW + 0.1, R_BOT - 0.4], [-RW - 0.1, R_BOT - 0.4], [-RW - 0.1, -1]];
    let hg = S(hs, 292, 362, { bevel: 2.6, bevelSeg: 2, curveSeg: 6 });
    const hc = [];
    for (const side of [1, -1]) for (const t of [-9, -17.5, -26]) hc.push(grooveCutter(301, 353, t, side * 25.5, 2.4, 1.1, 10));
    for (let i = 0; i < 5; i++) hc.push(cylW(305 + i * 10, -41.4, -30, 30, 2.8, { seg: 12, b: 0 })); // finger grooves under the belly
    hg = cut(hg, hc);
    g.add(hg, 'bakelite');
    g.add(slotScrew(327, -32.5, 25.4, 1, 2.6, 60), 'steel_dark');
    g.add(latheW([[0, 0], [0, 3.6], [1.6, 3.6], [1.6, 0]], 327, -32.5, -25.4, -1, 6), 'steel_dark'); // hex nut on the left
  }

  // ---------------------------------------------------------------- sling loops (left side)
  for (const [s, t] of [[357, 6], [10, 4]]) {
    g.add(P(rectPts(s - 6, s + 6, t - 4, t + 4, 2.5), { w: 3, cw: -RW - 1.2, bevel: 0.7, curveSeg: 3 }), 'steel');
    g.add(ring(s, 6.2, 1.5, { t, w: -RW - 6.5, axis: 's', seg: 20 }), 'steel_dark');
    for (const ds of [-4, 4]) g.add(weld(s + ds, t, -RW - 2.7, -1, 1.1), 'steel');
  }

  // ---------------------------------------------------------------- stamped markings (original names only)
  g.add(stamp('RATTLER-9', 270, -5.5, -RW, -1, { h: 4.6, stroke: 0.65 }), 'steel');
  g.add(stamp('CAL 9X19', 236, -26.2, -RW, -1, { h: 3.2, stroke: 0.5 }), 'steel');
  g.add(stamp('CF-04172', 44, -5.5, RW, 1, { h: 3.4, stroke: 0.5 }), 'steel');
  g.add(stamp('CALAMITY FRONT ARMS', 216, -5.5, RW, 1, { h: 2.6, stroke: 0.42, gap: 1.6 }), 'steel');

  // ---------------------------------------------------------------- stock hinge bracket (body) + folding stock (moving)
  g.add(P([[-8, -42, 5], [16, -42, 3], [22, R_BOT + 0.5, 1], [-3, R_BOT + 0.5, 2]], { w: 36, bevel: 1.2, curveSeg: 4 }), 'steel');
  g.add(cylW(-3, -36, -23.2, 23.2, 2.2), 'steel_dark');
  for (const side of [1, -1]) g.add(pinHead(-3, -36, side * 22.6, side, 3.2), 'steel_dark');
  g.add(latheW([[0, 0], [0, 3.4], [2.2, 3.4], [2.8, 2.8], [3, 0]], 9, -35, 18, 1, 16), 'steel_dark'); // stock release button
  for (const side of [1, -1]) g.add(weld(8, -30, side * 18, side, 1.2), 'steel');

  const stock = g.part('stock', { pivot: [-3, -36, 0], extras: { axis: 'w', deploy: 180, note: 'folded under the receiver; rotate 180 deg about w at the rear hinge pin to deploy, then unfold the buttplate 90 deg' } });
  for (const side of [1, -1]) {
    stock.add(P([[-9.5, -36, 6], [-3, -42.5, 6], [134, -42.5, 3], [142, -38.5, 4], [138, -30.5, 3], [4, -30.5, 3]], { w: 3, cw: side * 21, bevel: 0.8 }), 'steel');
    stock.add(P(rectPts(12, 124, -38.6, -34.4, 2), { w: 1.4, cw: side * 22.6, bevel: 0.5, curveSeg: 3 }), 'steel'); // pressed rib
  }
  stock.add(cylW(138, -38.5, -23, 23, 2.6), 'steel_dark'); // buttplate hinge barrel
  for (const side of [1, -1]) stock.add(pinHead(138, -38.5, side * 22.6, side, 2.4), 'steel_dark');

  const butt = g.part('buttplate', { parent: 'stock', pivot: [138, -38.5, 0], extras: { axis: 'w', deploy: -90 } });
  // stamped buttplate folded flat under the arms (shoulder face down): flanged rim, curled toe, hinge lugs
  const bpOut = [[38, -21.5, 9], [133, -21.5, 4], [133, 21.5, 4], [38, 21.5, 9]];
  butt.add(PL(bpOut, { h: 3.2, ct: -47.4, bevel: 1.0, curveSeg: 6 }), 'steel');
  butt.add(PL(bpOut, { h: 5.2, ct: -47.2, bevel: 0.9, curveSeg: 6, holes: [offsetPoly(bpOut, -3)] }), 'steel');
  butt.add(P([[29, -49.6, 3], [42, -49.6, 1], [42, -45, 1], [32, -41.6, 3]], { w: 36, bevel: 1.2, curveSeg: 4 }), 'steel'); // curled toe
  for (const side of [1, -1]) butt.add(P([[122, -45, 2], [141, -43, 4], [141, -34, 4], [127, -42, 1]], { w: 3, cw: side * 17.6, bevel: 0.6, curveSeg: 3 }), 'steel');
  for (let i = 0; i < 6; i++) butt.add(rib([56 + i * 12, -49.9, 0], [3, 1.4, 26], 0.4), 'steel'); // anti-slip ribs on the shoulder face

  // ---------------------------------------------------------------- bolt group (moving): cocking knob, slide, bolt body in the port
  const bolt = g.part('bolt', { pivot: [KNOB_S, 30, 0], extras: { travel: 0.1 } });
  {
    let knob = PL(gearPts(KNOB_S, 0, 10, 0.7, 26), { h: 7.5, ct: 35.6, bevel: 0.7, bevelSeg: 2 });
    knob = cut(knob, [cutters.box([KNOB_S, 39.4, 0], [30, 4, 3.2])]); // sighting groove through the knob
    bolt.add(knob, 'steel_dark');
    bolt.add(cylT(KNOB_S, 0, 15.5, 32.2, 3.0, { seg: 14 }), 'steel_dark');              // stem
    bolt.add(bx([KNOB_S - 45, 16.2, 0], [100, 3.4, 9.6], 1), 'steel_dark');              // cocking slide in the channel
    let bb = bx([200, 5, 12.5], [124, 27, 13], 2);
    bb = cut(bb, [cutters.box([182, -1.5, 19.2], [70, 2.6, 2.4])]);                       // ejector raceway groove
    bolt.add(bb, 'steel_bright');
    bolt.add(P([[193, 3, 1], [207.5, 3, 0.5], [209, 5, 0.5], [207, 8, 0.5], [193, 7.5, 1]], { w: 1.5, cw: 19.3, bevel: 0.35, curveSeg: 2 }), 'steel_dark'); // extractor
    bolt.add(pinHead(196, 5.3, 19.9, 1, 1.0), 'steel_dark');
  }

  // ---------------------------------------------------------------- magazine (32 rd, straight double stack) — through the grip
  {
    const mtop = rkPt(181, -6);
    const mag = g.part('mag', { pivot: [mtop[0], mtop[1], 0], extras: { drop: true } });
    const parts = [];
    parts.push([P([[164, -232, 2], [198, -232, 2], [198, -12, 1], [195, -7, 1.5], [167, -7, 1.5], [164, -12, 1]], { w: 25, bevel: 1.1, curveSeg: 3 }), 'steel_dark']);
    for (const side of [1, -1]) {
      parts.push([P(rectPts(177.5, 184.5, -224, -150, 2), { w: 1.4, cw: side * 12.6, bevel: 0.6, curveSeg: 3 }), 'steel_dark']); // pressed rib
      parts.push([P(rectPts(168, 194, -150, -146.6, 1), { w: 1.2, cw: side * 12.5, bevel: 0.5, curveSeg: 2 }), 'steel_dark']);
      parts.push([P(rectPts(167, 192, -9, -4.6, 1.2), { w: 3.4, cw: side * 9.4, bevel: 0.7, curveSeg: 2 }), 'steel_dark']);  // feed lip
    }
    parts.push([P(rectPts(196.5, 199.6, -228, -150, 1.4), { w: 12, bevel: 0.6, curveSeg: 3 }), 'steel_dark']); // front spine
    parts.push([P([[160.5, -240, 2.5], [203, -240, 2.5], [203, -232.5, 1.5], [160.5, -232.5, 1.5]], { w: 28, bevel: 1.3, curveSeg: 3 }), 'steel_dark']);
    parts.push([cylT(172, 0, -241.2, -239.4, 3.4, { seg: 14, b: 0.5 }), 'steel_dark']); // floor-plate release detent
    for (const [geo, mat] of parts) mag.add(rk(geo), mat);
    // top round (offset right) and the next one down (offset left)
    mag.add(rk(cyl(167.5, 186.5, 4.75, { t: -8.8, w: 3.4, seg: 14, b: 0.5 })), 'brass');
    mag.add(rk(lathe([[186.5, 0], [186.5, 4.5], [190, 4.4], [194, 3.4], [196.6, 1.6], [197.2, 0]], { t: -8.8, w: 3.4, seg: 14 })), 'copper');
    mag.add(rk(cyl(167.5, 186.5, 4.75, { t: -15.5, w: -3.4, seg: 14, b: 0.5 })), 'brass');
  }

  // ---------------------------------------------------------------- sockets + meta
  g.socket('muzzle', [MUZZLE, 0, 0]);
  g.socket('eject', [180, 5, RW + 1], { dir: [0.15, 0.45, 1] });
  const gr = rkPt(177, -82);
  g.socket('grip_r', [gr[0], gr[1], 0], { rot: [0, 0, -RAKE] });
  g.socket('grip_l', [326, -36, 0]);
  const mw = rkPt(181, -160);
  g.socket('magwell', [mw[0], mw[1], 0]);
  g.socket('charge', [KNOB_S, 38, 0]);
  g.socket('sight_rear', [18, 41.5, 0]);
  g.socket('sight_front', [354, 41.5, 0]);
  g.meta({
    grip: 'pistol', support: 'handguard', reload: 'mag_pistol', chargeSide: 'top',
    notes: 'Open-bolt SMG. Magazine inserts up through the pistol grip (raked 5 deg, drop straight along that axis). '
      + 'bolt = top cocking knob + cocking slide + bolt body seen in the right-hand port; it travels 0.1 m back. '
      + 'grip_safety pivots at its top pin (squeeze ~6 deg about w). selector slides along s (S rear, R, A front). '
      + 'stock is folded under the receiver: rotate 180 deg about w at its hinge pin to deploy, then buttplate 90 deg.',
  });
  return g;
}
