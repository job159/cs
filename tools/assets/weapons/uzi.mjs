// 鐵鼠 Rattler-9 — open-bolt 9 mm SMG, Uzi pattern (stamped sheet-steel receiver with pressed side ribs,
// magazine through the pistol grip, telescoping bolt, top cocking knob, folding metal stock folded under).
//
// Side view, mm: s forward from the rear face of the receiver, t up from the bore axis, w right (ejection side).
// Real reference: 470 mm long stock folded (650 extended), 260 mm barrel, 32-round box magazine.
//   rearmost (stock hinge eye)  s ≈ -11.5    muzzle  s = 460      -> ≈472 mm overall, stock folded
//   breech face                 s = 200      barrel 200..460      -> 260 mm
//   grip / magwell axis         s = 181, raked 5° (bottom rearward); the magazine runs up through the grip
//   folded stock: hinge eye at (-5, -37), arms 151 mm hinge-to-hinge, buttplate nested between the arms.
//   Deployed (stock 180° about w, buttplate -90°) the shoulder face sits at s ≈ -168 -> 628 mm overall (measured).
//   The real 650 mm needs ≈22 mm more arm than fits between the receiver rear and the grip safety when folded.
//
// Finish: the receiver/sheet parts use 'steel' (least glossy steel key). MATS has no matte phosphate /
// parkerized key yet; until it exists the post-bake pass at the bottom raises the baked cavity channel on the
// sheet steel a little (+roughness, slightly lighter grey-brown) and keeps edge wear to real contact edges.
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
const SP = [-5, -37];   // stock hinge pin
const BH = [146, -41.5]; // buttplate hinge pin (stock folded)

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
const clamp01 = (x) => Math.max(0, Math.min(1, x));

/** rake an upright-authored grip/mag geometry about GP (bottom swings rearward) */
const rk = (geo) => xform(geo, { rot: [-RAKE, 0, 0], pivot: [GP[0], GP[1], 0] });
/** same transform for a point [s, t] */
function rkPt(s, t) {
  const r = RAKE * DEG, ds = s - GP[0], dt = t - GP[1];
  return [GP[0] + ds * Math.cos(r) + dt * Math.sin(r), GP[1] + dt * Math.cos(r) - ds * Math.sin(r)];
}
/** inverse of rkPt: gun-space point -> upright grip frame */
function unRk(s, t) {
  const r = -RAKE * DEG, ds = s - GP[0], dt = t - GP[1];
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

/** like the kit's finish(): position only, non-indexed, creased normals */
function fin(geo, crease = 38) {
  for (const k of Object.keys(geo.attributes)) if (k !== 'position') geo.deleteAttribute(k);
  const g = geo.index ? geo.toNonIndexed() : geo;
  return toCreasedNormals(g, crease * DEG);
}

/**
 * Closed outline (fillets expanded exactly as the kit does) with extra points every `step` mm on long segments.
 * The bake writes edge wear and AO per vertex and the kit's extrusions are single-span: a rim vertex next to a
 * long triangle smears its wear across the face. A pre-gridded skin keeps triangles (and the wear) local.
 */
function gridPts(spec, step, curveSeg, PathClass = THREE.Shape) {
  const src = spec instanceof THREE.Path ? spec : makeShape(spec, PathClass);
  const raw = src.getPoints(curveSeg);
  if (raw.length > 2 && raw[0].distanceTo(raw[raw.length - 1]) < 1e-6) raw.pop();
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i], b = raw[(i + 1) % raw.length];
    out.push(a.clone());
    const k = Math.floor(a.distanceTo(b) / step);
    for (let j = 1; j < k; j++) out.push(new THREE.Vector2().lerpVectors(a, b, j / k));
  }
  return out;
}
function gridShape(spec, holes, step, curveSeg) {
  const sh = new THREE.Shape(gridPts(spec, step, curveSeg));
  for (const h of holes) sh.holes.push(new THREE.Path(gridPts(h, step, curveSeg, THREE.Path)));
  return sh;
}
/** section() with a gridded skin (outline points every `step`, rings every `sStep` along s) */
function gridSec(spec, s0, s1, { step = 8, sStep = step, bevel = 1, bevelSeg = 2, curveSeg = 4, holes = [] } = {}) {
  const len = Math.abs(s1 - s0), b = Math.max(0, Math.min(bevel, len / 2 - 0.05)), depth = Math.max(0.02, len - 2 * b);
  const geo = new THREE.ExtrudeGeometry(gridShape(spec, holes, step, curveSeg), {
    depth, steps: Math.max(1, Math.round(depth / sStep)), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b,
    bevelSegments: bevelSeg, curveSegments: 1,
  });
  geo.translate(0, 0, b + Math.min(s0, s1));
  geo.scale(1, 1, -1);
  let g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  const p = g.attributes.position.array;
  for (let i = 0; i < p.length; i += 9) for (let c = 0; c < 3; c++) { const tmp = p[i + 3 + c]; p[i + 3 + c] = p[i + 6 + c]; p[i + 6 + c] = tmp; }
  return toCreasedNormals(g, 38 * DEG);
}
/** profile() with a gridded skin: outline points every `step` and rings every `step` across w */
function gridProf(spec, { w = 20, cw = 0, bevel = 1, bevelSeg = 2, curveSeg = 5, holes = [], step = 8 } = {}) {
  const b = Math.max(0, Math.min(bevel, w / 2 - 0.05)), depth = Math.max(0.02, w - 2 * b);
  const geo = new THREE.ExtrudeGeometry(gridShape(spec, holes, step, curveSeg), {
    depth, steps: Math.max(1, Math.round(depth / step)), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b,
    bevelSegments: bevelSeg, curveSegments: 1,
  });
  geo.translate(0, 0, -depth / 2);
  geo.rotateY(Math.PI / 2);
  geo.translate(cw, 0, 0);
  return fin(geo);
}

/** regular polygon (hole outline) centred at (a, b): exact segment count, independent of the part's curveSeg */
const ngon = (a, b, r, n) => Array.from({ length: n }, (_, i) => [a + r * Math.cos((i / n) * 2 * Math.PI), b + r * Math.sin((i / n) * 2 * Math.PI)]);

/** plan() with a gridded skin: (s, w) outline extruded up t0..t1 with rings every `tStep` (gridded side faces) */
function gridPlan(spec, t0, t1, { step = 8, tStep = step, bevel = 1, bevelSeg = 2, curveSeg = 4 } = {}) {
  const h = Math.abs(t1 - t0), b = Math.max(0, Math.min(bevel, h / 2 - 0.05)), depth = Math.max(0.02, h - 2 * b);
  const geo = new THREE.ExtrudeGeometry(gridShape(spec, [], step, curveSeg), {
    depth, steps: Math.max(1, Math.round(depth / tStep)), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b,
    bevelSegments: bevelSeg, curveSegments: 1,
  });
  geo.translate(0, 0, -depth / 2);
  geo.applyMatrix4(new THREE.Matrix4().set(0, 1, 0, 0, 0, 0, 1, 0, -1, 0, 0, 0, 0, 0, 0, 1)); // (s, w, h) -> (w, h, -s)
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  const p = g.attributes.position.array; // the (s, w, h) frame is left-handed in three space: flip the winding
  for (let i = 0; i < p.length; i += 9) for (let c = 0; c < 3; c++) { const tmp = p[i + 3 + c]; p[i + 3 + c] = p[i + 6 + c]; p[i + 6 + c] = tmp; }
  g.translate(0, (t0 + t1) / 2, 0);
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
/** low flat rivet on the rear face (facing -s) whose base is at s0: 0.45 mm proud, broad chamfer */
const rivetRear = (s0, t, w, r = 2.0, seg = 12) => lathe([[s0 - 0.45, 0], [s0 - 0.45, r * 0.62], [s0 - 0.12, r], [s0 + 0.1, r], [s0 + 0.1, 0]], { t, w, seg });
/** spot weld: barely raised soft disc (0.1 mm) — reads as a mottled spot, not a bead */
const weld = (s, t, w, side, r = 1.7) => latheW([[0, 0], [0, r], [0.08, r * 0.8], [0.13, r * 0.4], [0.14, 0]], s, t, w - side * 0.03, side, 10);
/** flat pin head on a side face: ~0.45 mm proud with a broad chamfer (no dome) */
const pinHead = (s, t, w, side, r = 2.4) => latheW([[0, 0], [0, r], [0.2, r], [0.5, r * 0.66], [0.5, 0]], s, t, w - side * 0.05, side, 12);
/** slotted screw head on a side face (low cheese head), slot angle `ang` deg in the side plane */
function slotScrew(s, t, w, side, r = 2.6, ang = 30) {
  const head = latheW([[0, 0], [0, r], [0.35, r], [0.85, r * 0.8], [0.95, 0]], s, t, w - side * 0.1, side, 14);
  return cut(head, bx([s, t, w + side * 1.0], [r * 2.6, 0.6, 1.0], 0, [ang, 0, 0]));
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

// --- tiny stroke font for roll-marked markings: glyphs on a 4 x 6 grid
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
const MARKS = []; // [s0, s1, t0, t1, side] rectangles of every marking (no edge wear, darkened in the bake)
/**
 * Roll-marked text, read as recessed: one flat stroke box per glyph stroke, only 0.1 mm proud of the side face at
 * wSurf (engraving them with CSG into the gridded skin cost ~10k tris and a minute of build time). The post-bake
 * pass gives them no edge wear and a dark, occluded tone. side = +1 (right face, reads towards the muzzle) or
 * -1 (left face, reads towards the stock); (s, t) = lower-left corner of the first glyph as the reader sees it.
 */
function inlay(text, s, t, wSurf, side, { h = 4, stroke = 0.6, raise = 0.1, gap = 2 } = {}) {
  const k = h / 6, out = [];
  let x = 0;
  for (const ch of text) {
    for (const [x0, y0, x1, y1] of FONT[ch] || []) {
      const a = [s + side * (x + x0) * k, t + y0 * k], b = [s + side * (x + x1) * k, t + y1 * k];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) / DEG;
      out.push(bx([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, wSurf + side * (raise - 0.15) / 2], [L + stroke, stroke, raise + 0.15], 0, [ang, 0, 0]));
    }
    x += 4 + gap;
  }
  const s1 = s + side * (x - gap) * k;
  MARKS.push([Math.min(s, s1) - 0.8, Math.max(s, s1) + 0.8, t - 0.8, t + h + 0.8, side]);
  return merge(out);
}

// ==========================================================================================
export default function build() {
  const g = new Gun('uzi');
  MARKS.length = 0;

  // ---------------------------------------------------------------- receiver (stamped sheet-steel box)
  let recv = gridSec([[-RW, R_BOT, 2], [RW, R_BOT, 2], [RW, R_TOP, 1.5], [-RW, R_TOP, 1.5]], 0, R_FRONT, { step: 8, bevel: 1.8, bevelSeg: 3 });
  const rc = [];
  // pressed longitudinal ribs: two channels per side leave three raised lands; the upper channel sits low
  // enough to leave a 3 mm land under the top-cover lip (t 15.5)
  for (const side of [1, -1]) {
    const ws = side * RW;
    rc.push(grooveCutter(46, 284, -15, ws, 6, 2.1));               // lower channel (runs under the port)
    if (side < 0) rc.push(grooveCutter(46, 334, 7.6, ws, 5.2, 2.0));   // upper channel, left: full length
    else {
      rc.push(grooveCutter(46, 140, 7.6, ws, 5.2, 2.0));                // upper channel, right: interrupted by the port
      rc.push(grooveCutter(220, 334, 7.6, ws, 5.2, 2.0));
    }
  }
  // ejection port: a 2.6 mm "sheet" opening with a chamfered rim into a dark internal cavity around the bolt
  rc.push(...chamferPocket(152, 208, -5, 15, 2, RW, 2.8, 1.2));
  rc.push(cutters.box([181, 4.75, 12.2], [70, 27.5, 14.4]));       // cavity s 146..216, t -9..18.5, w 5..19.4
  rc.push(cutters.box([245, 19, 0], [128, 10, 11]));                // cocking channel under the top-cover slot
  recv = cut(recv, rc);
  g.add(recv, 'steel');
  // roll marks (original names only)
  g.add(inlay('RATTLER-9', 270, -5.2, -RW, -1, { h: 4.6, stroke: 0.62 }), 'steel_dark');
  g.add(inlay('CAL 9X19', 236, -25.6, -RW, -1, { h: 3.2, stroke: 0.5 }), 'steel_dark');
  g.add(inlay('CF-04172', 44, -5.2, RW, 1, { h: 3.4, stroke: 0.5 }), 'steel_dark');
  g.add(inlay('CALAMITY FRONT ARMS', 216, -5.2, RW, 1, { h: 2.6, stroke: 0.42, gap: 1.6 }), 'steel_dark');
  for (const [ch, s] of [['S', 174.5], ['R', 184], ['A', 193.5]]) g.add(inlay(ch, s, -25.8, -RW, -1, { h: 3.2, stroke: 0.55 }), 'steel_dark');

  // front & rear end plates (slightly proud of the box -> visible seams)
  g.add(S([[-RW - 0.5, R_BOT - 0.5, 3.5], [RW + 0.5, R_BOT - 0.5, 3.5], [RW + 0.5, R_TOP, 1], [-RW - 0.5, R_TOP, 1]], 364.5, 371, { bevel: 0.9 }), 'steel');
  // rear plate: flat stamping with a shallow pressed panel, perimeter weld bead to the box, four low rivets
  {
    const outer = [[-RW - 0.5, R_BOT - 0.5, 3], [RW + 0.5, R_BOT - 0.5, 3], [RW + 0.5, R_TOP + 1, 2], [-RW - 0.5, R_TOP + 1, 2]];
    let plate = gridSec(outer, -3, 1.2, { step: 8, bevel: 0.9, bevelSeg: 2 });
    plate = cut(plate, S([[-RW + 4.5, R_BOT + 5, 3], [RW - 4.5, R_BOT + 5, 3], [RW - 4.5, R_TOP - 3, 3], [-RW + 4.5, R_TOP - 3, 3]], -6, -2.55, { bevel: 0.4, bevelSeg: 1 }));
    g.add(plate, 'steel');
    const box0 = [[-RW, R_BOT, 2], [RW, R_BOT, 2], [RW, R_TOP, 1.5], [-RW, R_TOP, 1.5]];
    g.add(S(offsetPoly(box0, 0.45), 1.0, 2.3, { bevel: 0.6, bevelSeg: 2, curveSeg: 3, holes: [offsetPoly(box0, -0.4)] }), 'steel'); // weld bead
    for (const [t, w] of [[13.5, 13.5], [13.5, -13.5], [-19.5, 13.5], [-19.5, -13.5]]) g.add(rivetRear(-2.5, t, w, 1.9), 'steel');
  }

  // spot welds where the sight bases and brackets are welded to the box (sparse, very low)
  for (const side of [1, -1]) {
    for (const s of [10, 30, 348]) g.add(weld(s, 18.6, side * RW, side, 1.4), 'steel');
    for (const s of [8, 300]) g.add(weld(s, -23.6, side * RW, side, 1.3), 'steel');
  }

  // ---------------------------------------------------------------- top cover (separate stamped lid, gridded skin)
  const coverSec = [[-RW - 1.1, 15.5, 0.4], [-RW - 0.1, 15.5], [-RW - 0.1, R_TOP], [RW + 0.1, R_TOP], [RW + 0.1, 15.5], [RW + 1.1, 15.5, 0.4],
    [RW + 1.1, 26, 3.5], [15, 30.5, 8], [-15, 30.5, 8], [-RW - 1.1, 26, 3.5]];
  let cover = gridSec(coverSec, 43, 335.4, { step: 10, sStep: 18, bevel: 1.0, bevelSeg: 2, curveSeg: 4 });
  cover = cut(cover, [
    PL(rectPts(188, 302, -3.7, 3.7, 3.6), { h: 30, ct: 30, bevel: 0, curveSeg: 6 }),                        // knob slot
    PL(rectPts(186.8, 303.2, -4.9, 4.9, 4.8), { h: 8.4, ct: 33.5, bevel: 1.2, bevelSeg: 1, curveSeg: 6 }), // chamfered lip
  ]);
  g.add(cover, 'steel');
  // stamped stiffening beads along the crown + rear thumb serrations
  for (const w of [-11.5, 11.5]) g.add(S([[w - 1.6, 28.4], [w + 1.6, 28.4], [w + 1.1, 30.9, 0.8], [w - 1.1, 30.9, 0.8]], 60, 176, { bevel: 0.8, curveSeg: 3 }), 'steel');
  for (let i = 0; i < 7; i++) g.add(S([[-8, 29.6], [8, 29.6], [7.2, 31.1], [-7.2, 31.1]], 50 + i * 4.2, 52.2 + i * 4.2, { bevel: 0.35, bevelSeg: 1 }), 'steel');

  // ---------------------------------------------------------------- rear sight: base, protective ears, flip aperture
  g.add(P([[2, R_TOP - 1, 1], [42, R_TOP - 1, 1], [42, 28, 2], [39, 31, 2], [5, 31, 2], [2, 28, 1]], { w: 30, bevel: 1.2, curveSeg: 3 }), 'steel');
  const earR = [[4, 27, 1], [38, 27, 1], [38, 36, 5], [31, 48, 4], [12, 48, 4], [4, 37, 5]];
  for (const side of [1, -1]) g.add(P(earR, { w: 3.2, cw: side * 10.6, bevel: 0.8, curveSeg: 4, holes: [ngon(23, 39.5, 2.4, 16)] }), 'steel');
  // aperture leaf: thin plate across the bore, peep hole along the sight line, countersunk on the eye side
  {
    let leaf = S([[-4.6, 30.2, 0.6], [4.6, 30.2, 0.6], [4.6, 45.2, 2.4], [-4.6, 45.2, 2.4]], 16.8, 19.4, { bevel: 0.45, curveSeg: 4, holes: [ngon(0, 41.5, 1.35, 20)] });
    leaf = cut(leaf, lathe([[16.1, 0], [16.1, 2.6], [17.65, 1.25], [17.65, 0]], { t: 41.5, seg: 20, phase: Math.PI / 20 }));
    g.add(leaf, 'steel_dark');
  }
  g.add(P([[5, 31, 1], [18, 31, 1], [18, 34, 1], [5, 33.2, 1]], { w: 9, bevel: 0.5, curveSeg: 2 }), 'steel_dark'); // second leaf folded back
  g.add(cylW(18, 32.6, -12.6, 12.6, 1.5), 'steel_dark'); // leaf pivot pin through both ears
  for (const side of [1, -1]) g.add(pinHead(18, 32.6, side * 12.2, side, 2.0), 'steel_dark');
  // top-cover latch buttons through the rear sight base (push to lift the cover)
  for (const side of [1, -1]) g.add(latheW([[0, 0], [0, 4.2], [2.2, 4.2], [2.9, 3.5], [3.0, 0]], 28, 25, side * 15, side, 16), 'steel_dark');

  // ---------------------------------------------------------------- front sight: base, tall ears, post on an elevation drum
  g.add(P([[336, R_TOP - 1, 1], [371, R_TOP - 1, 1], [371, 30, 2.5], [367, 34, 2], [343, 34, 2], [336, 30, 2]], { w: 28, bevel: 1.2, curveSeg: 3 }), 'steel');
  const earF = [[340, 30, 1], [369, 30, 1], [369, 41, 4], [363, 52, 4.5], [347, 52, 4.5], [340, 42, 4]];
  for (const side of [1, -1]) g.add(P(earF, { w: 3, cw: side * 9.6, bevel: 0.75, curveSeg: 4, holes: [ngon(361, 44, 2.0, 16)] }), 'steel');
  g.add(cylT(354, 0, 33.5, 36.2, 4.6, { seg: 20 }), 'steel_dark');                        // elevation drum
  g.add(PL(gearPts(354, 0, 4.9, 0.4, 18), { h: 1.6, ct: 35, bevel: 0.25, bevelSeg: 1 }), 'steel_dark'); // drum knurl
  g.add(bx([354, 37.2, 0], [3.8, 2.4, 3.0], 0.5), 'steel_dark');
  g.add(bx([354, 39.6, 0], [2.2, 3.8, 1.8], 0.25), 'steel_dark');                       // post, tip at t = 41.5
  g.add(cylW(354, 31.5, -8.2, 8.2, 1.1), 'steel_dark');                                 // drum retaining pin
  for (const side of [1, -1]) g.add(slotScrew(362, 25.5, side * 14, side, 2.2, 90), 'steel_dark');

  // ---------------------------------------------------------------- barrel nut (fine straight knurl) + barrel with crown and real bore
  // faces carry intermediate radial rings so the rim wear cannot smear across them
  g.add(lathe([[371, 10.6], [371, 13.2], [371, 15.8], [371, 18.2], [371, 20.0], [372, 21.0], [374.5, 21.0], [374.5, 20.3],
    [388.5, 20.3], [388.5, 21.0], [391, 21.0], [392, 20.0], [392, 18.2], [392, 15.8], [392, 13.2], [392, 10.6], [371, 10.6]], { seg: 36 }), 'steel');
  g.add(S(gearPts(0, 0, 21.25, 0.42, 60), 375.3, 388.2, { bevel: 0.3, bevelSeg: 1, holes: [circle(0, 0, 11)] }), 'steel');
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
    g.add(cylW(s, -23, -RW - 0.3, RW + 0.3, 1.8), 'steel_dark');
    for (const side of [1, -1]) g.add(pinHead(s, -23, side * RW, side, 2.6), 'steel_dark');
  }
  for (const [s, r] of [[214, 1.7], [238, 1.5], [262, 1.5]]) {
    g.add(cylW(s, -31, -18.2, 18.2, r * 0.8), 'steel_dark');
    for (const side of [1, -1]) g.add(pinHead(s, -31, side * 18, side, r), 'steel_dark');
  }

  // trigger guard: stamped band (gridded skin) with a pressed stiffening bead on both faces; rear end tucks into the grip
  {
    const gOut = [[200, -33, 1], [290, -33, 1], [290, -38, 2], [287, -64, 9], [276, -76, 10], [212, -76, 9], [200, -70, 4]];
    const gIn = [[210, -38, 2], [282, -38, 2], [280.5, -62, 7], [272, -70.5, 7], [214, -70.5, 6], [209, -62, 4]];
    g.add(gridProf(gOut, { w: 10, bevel: 1.0, holes: [gIn], curveSeg: 5, step: 9 }), 'steel');
    g.add(P(offsetPoly(gOut, -1.7), { w: 11.2, bevel: 0.5, bevelSeg: 1, curveSeg: 5, holes: [offsetPoly(gIn, 1.7)] }), 'steel');
  }

  // pistol grip, authored upright then raked: steel frame core + bakelite panels
  {
    const parts = [];
    let core = P([[155, -31, 1], [206, -31, 1], [206, -126, 5], [207.2, -136.2, 1.5], [153.6, -136.2, 1.5], [155, -126, 5]], { w: 30, bevel: 1.4, bevelSeg: 2 });
    core = cut(core, [
      cutters.box([181, -125, 0], [35.4, 40, 26.6]),    // magwell mouth (the magazine passes through with a gap)
      cutters.box([155, -68, 0], [8.4, 58, 14]),         // back-strap recess for the grip safety
    ]);
    parts.push([core, 'steel']);
    // heel band: barely proud (0.4 mm) with a small bevel, flush with the frame
    parts.push([gridProf([[153.2, -136.6, 1.2], [207.6, -136.6, 1.2], [207.3, -132.4, 0.6], [153.5, -132.4, 0.6]], { w: 30.8, bevel: 0.4, bevelSeg: 1, curveSeg: 2, step: 9,
      holes: [rectPts(163, 199, -136, -133, 0.5)] }), 'steel']);
    // panels: smooth upper boss with the screw, horizontal grip grooves below
    let panel = P([[160, -36, 3], [201.5, -36, 3], [201.5, -123, 6], [160.5, -123, 6]], { w: 4, cw: 16.4, bevel: 1.5, bevelSeg: 2, curveSeg: 5 });
    const pc = [];
    for (let i = 0; i < 12; i++) pc.push(grooveCutter(165.5, 196.5, -57 - i * 5.3, 18.4, 1.7, 0.7, 6));
    pc.push(grooveCutter(165, 197, -51, 18.4, 1.0, 0.45, 6)); // border line under the boss
    panel = cut(panel, pc);
    parts.push([panel, 'bakelite'], [mirror(panel), 'bakelite']);
    parts.push([slotScrew(181, -44, 18.3, 1, 2.6, 20), 'steel_dark'], [slotScrew(181, -44, -18.3, -1, 2.6, -35), 'steel_dark']);
    // mag release (left, low on the grip): flat escutcheon plate + flat serrated push button
    parts.push([latheW([[0, 0], [0, 5.4], [0.25, 5.4], [0.45, 5.0], [0.5, 0]], 168, -117, -18.3, -1, 18), 'steel']);
    let btn = latheW([[0, 0], [0, 3.7], [1.0, 3.7], [1.35, 3.3], [1.4, 0]], 168, -117, -18.5, -1, 18);
    btn = cut(btn, [-1.6, 0, 1.6].map((dt) => bx([168, -117 + dt, -19.9], [9, 0.55, 0.8])));
    parts.push([btn, 'steel_dark']);
    for (const [geo, mat] of parts) g.add(rk(geo), mat);
  }

  // grip safety (moving part): lever in the back-strap recess, pivots at its top pin
  {
    const piv = rkPt(155.5, -41);
    const gs = g.part('grip_safety', { pivot: [piv[0], piv[1], 0], extras: { axis: 'w', squeeze: -6 } });
    gs.add(rk(gridProf([[151, -41, 2], [158.5, -40, 1.5], [158.5, -96, 2], [153.5, -97.5, 3], [149.3, -90, 6], [149.6, -60, 10]], { w: 13, bevel: 1.2, step: 6 })), 'steel');
    for (let i = 0; i < 6; i++) gs.add(rk(rib([149.4, -64 - i * 5, 0], [1.4, 1.6, 11.6], 0.3)), 'steel');
    gs.add(rk(cylW(155.5, -41, -7.8, 7.8, 1.6)), 'steel_dark');
  }

  // trigger (moving part), pin inside the housing
  const trig = g.part('trigger', { pivot: [214, -31, 0], extras: { axis: 'w', pull: 12 } });
  trig.add(P('M 210 -31 L 219 -31 L 219.5 -35 Q 214 -48 218.5 -60 L 214.5 -62.5 Q 207.5 -50 210.5 -36 Z', { w: 6.5, bevel: 1.2, curveSeg: 8 }), 'steel_dark');

  // fire selector (moving part): slider on the left of the lower frame, S-R-A from rear to front (letters engraved above)
  const sel = g.part('selector', { pivot: [176, -31, -18], extras: { slide: 's', positions: { S: 0, R: 0.0095, A: 0.019 } } });
  sel.add(bx([176, -31, -19.4], [9, 6.2, 3.2], 1.2), 'steel_dark');
  for (let i = 0; i < 3; i++) sel.add(rib([173 + i * 3, -31, -21.1], [1.1, 5.4, 0.9], 0.2), 'steel_dark');
  g.add(P(rectPts(170, 198, -34, -28.5, 2.5), { w: 1, cw: -18.4, bevel: 0.3, curveSeg: 3 }), 'steel_dark'); // selector track

  // ---------------------------------------------------------------- handguard (bakelite): bathtub section, swept rear-lower corner
  {
    // side-view outline extruded across the gun with a 5.5 mm rolled edge: the belly corners become a bathtub
    // radius and the rear lower corner sweeps up towards the guard front. The top part hides inside the receiver.
    let hg = gridProf([[292, -1, 2], [362, -1, 2], [362, -41.5, 6], [292, -41.5, 15]], { w: 51, bevel: 5.5, bevelSeg: 3, curveSeg: 6, step: 8 });
    const hc = [];
    for (const side of [1, -1]) {
      for (const t of [-10, -26]) hc.push(grooveCutter(303, 353, t, side * 25.5, 2.4, 1.3, 10));
      hc.push(grooveCutter(303, 318, -18, side * 25.5, 2.4, 1.3, 10), grooveCutter(336, 353, -18, side * 25.5, 2.4, 1.3, 10));
    }
    hc.push(cutters.box([336, -41.5, 0], [44, 0.7, 0.5]));          // mould parting line along the belly
    hg = cut(hg, hc);
    g.add(hg, 'bakelite');
    g.add(slotScrew(327, -18, 25.5, 1, 2.6, 60), 'steel_dark');
    g.add(latheW([[0, 0], [0, 3.6], [1.2, 3.6], [1.4, 3.2], [1.4, 0]], 327, -18, -25.4, -1, 6), 'steel_dark'); // hex nut on the left
  }

  // ---------------------------------------------------------------- sling loops (left side)
  for (const [s, t] of [[357, 6], [10, 4]]) {
    g.add(P(rectPts(s - 6, s + 6, t - 4, t + 4, 2.5), { w: 3, cw: -RW - 1.2, bevel: 0.7, curveSeg: 3 }), 'steel');
    g.add(ring(s, 6.2, 1.5, { t, w: -RW - 6.5, axis: 's', seg: 20 }), 'steel_dark');
  }

  // ---------------------------------------------------------------- stock hinge bracket (body) + folding stock (moving)
  g.add(gridProf([[-12.5, -36, 5], [-6, -44.5, 5], [16, -44.5, 3], [24, R_BOT + 0.5, 1.5], [-4, R_BOT + 0.5, 2]], { w: 36, bevel: 1.2, curveSeg: 4, step: 7 }), 'steel');
  g.add(cylT(5, 0, -47.6, -44, 3.2, { seg: 14, b: 0.6 }), 'steel_dark'); // stock release button (under the bracket)

  const stock = g.part('stock', { pivot: [SP[0], SP[1], 0], extras: { axis: 'w', deploy: 180,
    note: 'folded under the receiver; rotate 180 deg about w at the rear hinge pin to deploy, then unfold the buttplate -90 deg' } });
  {
    const top = (s) => -30.5 - 6 * (s / 146), bot = (s) => -43.5 - 2 * ((s + 5) / 145);
    const arm = `M -5 -43.5 L 140 ${bot(140)} Q 151 ${bot(140)} 151 -41.5 Q 151 -36.5 146 -36.5 L 0 -30.5 Q -11.5 -30.5 -11.5 -37 Q -11.5 -43.5 -5 -43.5 Z`;
    const ribPts = [[12, (top(12) + bot(12)) / 2 - 2.1, 1.5], [128, (top(128) + bot(128)) / 2 - 2.1, 1.5], [128, (top(128) + bot(128)) / 2 + 2.1, 1.5], [12, (top(12) + bot(12)) / 2 + 2.1, 1.5]];
    for (const side of [1, -1]) {
      stock.add(P(arm, { w: 3, cw: side * 21, bevel: 0.8, curveSeg: 5 }), 'steel');
      stock.add(P(ribPts, { w: 1.2, cw: side * 22.6, bevel: 0.45, curveSeg: 3 }), 'steel');                           // pressed rib
      stock.add(P([[24, bot(24) - 0.0], [132, bot(132)], [132, bot(132) + 1.4], [24, bot(24) + 1.4]], { w: 3.6, cw: side * 17.8, bevel: 0.45, bevelSeg: 1 }), 'steel'); // inward L flange
      stock.add(pinHead(SP[0], SP[1], side * 22.5, side, 3.2), 'steel_dark');
      stock.add(pinHead(BH[0], BH[1], side * 22.5, side, 2.6), 'steel_dark');
    }
    stock.add(cylW(SP[0], SP[1], -23, 23, 2.2), 'steel_dark');  // stock hinge pin through bracket and arms
    stock.add(cylW(BH[0], BH[1], -22.8, 22.8, 2.3), 'steel_dark'); // buttplate hinge pin
  }

  // buttplate: stamped dished plate nested between the arms (0.8 mm each side). Folded, its shoulder face (ribs,
  // rolled rim, curled toe) faces up into the arms; at deploy -90 it ends up facing the shooter, 10 mm behind the pin.
  const butt = g.part('buttplate', { parent: 'stock', pivot: [BH[0], BH[1], 0], extras: { axis: 'w', deploy: -90 } });
  {
    const bp = [[50, -18.7, 6], [141, -18.7, 3], [141, 18.7, 3], [50, 18.7, 6]];
    butt.add(PL(bp, { h: 2.4, ct: -32, bevel: 0.7, curveSeg: 5 }), 'steel');
    butt.add(PL(bp, { h: 1.6, ct: -30.3, bevel: 0.5, bevelSeg: 1, curveSeg: 5, holes: [offsetPoly(bp, -2.4)] }), 'steel');   // rolled rim
    for (let i = 0; i < 6; i++) butt.add(rib([60 + i * 13, -30.6, 0], [3, 0.9, 28], 0.3), 'steel');                       // anti-slip ribs
    butt.add(P('M 52 -33.2 L 47.5 -33.2 Q 43.6 -33.2 43.6 -29.6 L 43.6 -29.2 L 46.4 -29.2 L 46.4 -29.6 Q 46.4 -30.8 48 -30.8 L 52 -30.8 Z',
      { w: 37.4, bevel: 0.6, curveSeg: 5 }), 'steel');                                                                     // curled toe
    for (const side of [1, -1]) {
      butt.add(P(`M 128 -33.2 L 128 -30.8 L 140 -30.8 Q 145 -30.8 145.3 -35 L 150.2 -41.5 Q 150.2 -45.7 146 -45.7 Q 141.8 -45.7 141.8 -41.5 L 136 -33.2 Z`,
        { w: 3, cw: side * 17.1, bevel: 0.6, curveSeg: 4 }), 'steel');                                                   // hinge lugs
    }
    // latch hook: tab on the hinge end that snaps behind the lower frame when folded
    butt.add(P([[139, -31.6, 0.4], [145.3, -31.6, 0.4], [145.3, -33.6, 0.5], [144.2, -33.6, 0.3], [144.2, -32.6], [139, -32.6]], { w: 9, bevel: 0.35, bevelSeg: 1 }), 'steel');
  }

  // ---------------------------------------------------------------- bolt (moving): telescoping bolt body seen in the right-hand port
  // Cycles on every shot. Open bolt: the cocked / ready-to-fire state is the bolt held REARWARD (travel), this rest
  // pose is the bolt forward (fired / uncocked).
  const bolt = g.part('bolt', { pivot: [200, 5, 0], extras: { travel: 0.1, openBolt: true, ready: 'rear', cycles: true } });
  {
    // section: flat sides, chamfered top corners; side face 8 mm inside the receiver skin so the port has depth
    let bb = S([[-13.5, -8.5, 1.5], [13.5, -8.5, 1.5], [13.5, 10.2, 0.8], [8.6, 18.4, 1.5], [-8.6, 18.4, 1.5], [-13.5, 10.2, 0.8]], 138, 262, { bevel: 1.0, bevelSeg: 2, curveSeg: 3 });
    bb = cut(bb, [
      cutters.box([171.5, -3.2, 14], [64, 2.2, 2.6]),                                   // ejector raceway
      ...chamferPocket(160, 184, 2.5, 10.5, 1.6, 13.5, 1.3, 0.6),                       // lightening relief
      cutters.box([199.5, 5, 14], [18, 8.6, 3.2]),                                      // extractor slot
      cutters.box([216, 4, 13], [22, 18, 9]),                                           // casing window in the bolt sleeve
    ]);
    bolt.add(bb, 'steel');
    // extractor: spring claw in its slot, hook at the bolt-face edge (front of the port)
    bolt.add(P([[191.2, 2.2, 0.8], [204.6, 2.2, 0.4], [207.6, 4.4, 0.4], [205.8, 8.0, 0.4], [191.2, 7.6, 0.8]], { w: 1.8, cw: 13.15, bevel: 0.35, curveSeg: 2 }), 'steel_dark');
    bolt.add(pinHead(194, 5, 14.0, 1, 0.9), 'steel_dark');
  }
  // charging handle (moving): top knob + cocking slide. Moves only when charging (pulls the bolt back with it),
  // then springs forward again; it does NOT reciprocate when the gun fires.
  const charger = g.part('charger', { pivot: [KNOB_S, 30, 0], extras: { travel: 0.1, chargeOnly: true, returns: true, drives: 'bolt' } });
  {
    let knob = PL(gearPts(KNOB_S, 0, 10, 0.6, 30), { h: 7.5, ct: 35.6, bevel: 0.7, bevelSeg: 2 });
    knob = cut(knob, [cutters.box([KNOB_S, 39.4, 0], [30, 4, 3.2])]); // sighting groove through the knob
    charger.add(knob, 'steel_dark');
    charger.add(cylT(KNOB_S, 0, 15.5, 32.2, 3.0, { seg: 14 }), 'steel_dark');              // stem
    charger.add(bx([KNOB_S - 45, 16.2, 0], [100, 3.4, 9.6], 1), 'steel_dark');              // cocking slide in the channel
  }

  // ---------------------------------------------------------------- magazine (32 rd, straight double stack) — through the grip
  {
    const mtop = rkPt(181, -6);
    const ax = [0, -Math.cos(RAKE * DEG), Math.sin(RAKE * DEG)]; // three gun space (x = w, y = t, z = -s): down + rearward
    const mag = g.part('mag', { pivot: [mtop[0], mtop[1], 0], extras: { drop: true, axis: ax.map((v) => +v.toFixed(4)), clear: 0.145 } });
    const parts = [];
    parts.push([gridPlan([[164, -12.5, 1.6], [198, -12.5, 1.6], [198, 12.5, 1.6], [164, 12.5, 1.6]], -232, -7, { step: 10, tStep: 12, bevel: 1.1, curveSeg: 3 }), 'steel']); // body, gridded side faces
    parts.push([P(rectPts(179, 183, -227, -16, 1.8), { w: 26.0, bevel: 0.5, curveSeg: 3 }), 'steel']);        // full-length pressed side ribs (0.5 proud)
    for (const s of [163.75, 198.25]) parts.push([bx([s, -120, 0], [0.9, 216, 1.5], 0.35), 'steel']);           // spine weld seams
    for (const side of [1, -1]) parts.push([P(rectPts(167, 192, -9, -4.6, 1.2), { w: 3.4, cw: side * 9.4, bevel: 0.7, curveSeg: 2 }), 'steel_dark']); // feed lips
    parts.push([P([[162.8, -238.8, 1.8], [199.4, -238.8, 1.8], [199.4, -231.6, 0.8], [162.8, -231.6, 0.8]], { w: 26.6, bevel: 0.7, curveSeg: 3 }), 'steel']); // floorplate
    parts.push([P([[159.6, -238.8, 0.8], [163.2, -238.8], [163.2, -235.4], [160.4, -236, 0.8]], { w: 10, bevel: 0.4, bevelSeg: 1, curveSeg: 2 }), 'steel']); // release tab
    parts.push([cylT(178, 0, -239.6, -238.4, 3.0, { seg: 12, b: 0.4 }), 'steel']); // floorplate detent
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
  g.socket('grip_l', [326, -38, 0]);
  const mw = rkPt(181, -160);
  g.socket('magwell', [mw[0], mw[1], 0]);
  g.socket('charge', [KNOB_S, 38, 0]);
  g.socket('sight_rear', [18, 41.5, 0]);
  g.socket('sight_front', [354, 41.5, 0]);
  g.meta({
    grip: 'pistol', support: 'handguard', reload: 'mag_pistol', chargeSide: 'top',
    notes: 'Open-bolt SMG. Magazine inserts up through the pistol grip (raked 5 deg): drop it along mag.extras.axis '
      + '(gun space, down and 5 deg rearward) for the full mag.extras.clear = 0.145 m before it leaves the grip. '
      + 'bolt = bolt body in the right-hand port only; it cycles 0.1 m on every shot. Ready-to-fire (cocked) state is the '
      + 'bolt held rearward; the modelled rest pose is bolt forward. charger = top cocking knob + slide: it moves back with '
      + 'the bolt only while charging, then springs forward alone (knob stays still while firing). '
      + 'grip_safety pivots at its top pin (squeeze ~6 deg about w). selector slides along s (S rear, R, A front). '
      + 'stock is folded under the receiver: rotate 180 deg about w at its hinge pin to deploy, then buttplate -90 deg.',
  });

  // ---------------------------------------------------------------- bake post-process (local: the kit has no per-part wear control)
  const inMark = (s, t, w) => MARKS.some(([s0, s1, t0, t1, sd]) => w * sd > RW - 0.6 && s > s0 && s < s1 && t > t0 && t < t1);
  const edge = (v, k) => k * clamp01((v - 0.45) / 0.55);
  const rules = {
    'body:steel': (s, t, w, v) => {
      if (inMark(s, t, w)) return 0;
      if (t > 27 && ((s > 2 && s < 42) || (s > 336 && s < 371))) return edge(v, t > 40 ? 0.42 : 0.32); // sight ear tops / bases
      if (s < -1.6) return edge(v, 0.16);                                                  // rear plate face, rivets
      if (s > 198 && s < 292 && t < -66) return edge(v, 0.62);                            // trigger guard bottom
      if (t > 28 && s > 58 && s < 178 && Math.abs(Math.abs(w) - 11.5) < 2.2) return edge(v, 0.18); // crown beads: no glinting streaks
      if (t > 15 && s > 43 && s < 336) return edge(v, 0.46);                              // top cover
      if (s > 364 && s < 393) return edge(v, 0.5);                                        // front plate / barrel nut
      return edge(v, 0.42);
    },
    'body:steel_dark': (s, t, w, v) => (inMark(s, t, w) ? 0 : s > 457.5 ? edge(v, 0.85) : s > 446 && Math.abs(t) < 11 && Math.abs(w) < 11 ? edge(v, 0.3) : s > 214 && s < 452 && Math.abs(w) < 11 && Math.abs(t) < 11 ? edge(v, 0.25) : edge(v, 0.2)),
    'body:bakelite': (s, t, w, v) => edge(v, 0.22),
    'bolt:steel': (s, t, w, v) => edge(v, 0.35),
    'bolt:steel_dark': (s, t, w, v) => edge(v, 0.55),
    'charger:steel_dark': (s, t, w, v) => edge(v, t > 32 ? 0.9 : 0.3),                   // knob rim is the brightest edge
    'mag:steel': (s, t, w, v) => { const [, tu] = unRk(s, t); return edge(v, tu < -230 ? 0.8 : tu > -20 ? 0.45 : 0.3); },
    'mag:steel_dark': (s, t, w, v) => edge(v, 0.5),
    'stock:steel': (s, t, w, v) => edge(v, 0.42),
    'stock:steel_dark': (s, t, w, v) => edge(v, 0.25),
    'buttplate:steel': (s, t, w, v) => edge(v, 0.42),
    'grip_safety:steel': (s, t, w, v) => edge(v, 0.3),
    'grip_safety:steel_dark': (s, t, w, v) => edge(v, 0.2),
    'trigger:steel_dark': (s, t, w, v) => edge(v, 0.45),
    'selector:steel_dark': (s, t, w, v) => edge(v, 0.5),
  };
  // cavity floor on the sheet steel: +0.1 roughness and a slightly lighter, greyer tone (stand-in for a phosphate key)
  const matte = { 'body:steel': 0.62, 'mag:steel': 0.6, 'stock:steel': 0.6, 'buttplate:steel': 0.6, 'bolt:steel': 0.4, 'grip_safety:steel': 0.6 };
  // roll marks: occluded, grimy strokes so they read as struck into the metal
  const aoRules = {
    'body:steel_dark': (s, t, w, ao) => (inMark(s, t, w) ? ao * 0.6 : ao),
    // the shoulder face is baked folded (facing up into the arms, fully occluded) but is in the open once deployed
    'buttplate:steel': (s, t, w, ao) => (t > -31.2 ? Math.max(ao, 0.8) : ao),
  };
  // the magazine is baked seated in the grip; the part hidden in the grip is shown when it drops out
  for (const m of ['mag:steel', 'mag:steel_dark', 'mag:brass', 'mag:copper']) aoRules[m] = (s, t, w, ao) => (unRk(s, t)[1] > -140 ? Math.max(ao, 0.78) : ao);
  // AO floor on big flat faces: vertices buried under pins, screws and ribs bake black and smear dark halos
  // across the face triangles; the port cavity keeps its real occlusion
  const inPort = (s, t, w) => s > 144 && s < 218 && t > -11 && t < 20 && w > 4 && w < 21;
  const faceAo = (s, t, w) => (inPort(s, t, w) ? 0 : 0.6);
  const build0 = g.build.bind(g);
  g.build = (opts = {}) => { const root = build0(opts); if (opts.bake !== false) postBake(g, root, rules, matte, aoRules, faceAo); return root; };
  return g;
}

// ==========================================================================================
// Bake post-process. The kit's curvature wear saturates on every bevel and fillet under ~7 mm radius and is
// interpolated per vertex, so on big flat faces the rim values smear across long triangles. Here:
//  1. every mesh is split into planar patches (coplanar triangles sharing a vertex); patches wider than ~2 mm are
//     real faces: their vertices get zero wear (vertices shared with a bevel are duplicated, so the bevel keeps it);
//  2. the remaining edge values are remapped per part / material / position (only contact edges brighten);
//  3. optional cavity floor (matte stand-in).
function postBake(g, root, rules, matte, aoRules, faceAo) {
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry.attributes._bake) return;
    const piv0 = g.parts.get(o.name.split(':')[0]).pivot;
    suppressFaceWear(o.geometry, 0.00105, (x, y, z) => faceAo(-(z * 1000 + piv0.z), y * 1000 + piv0.y, x * 1000 + piv0.x));
    const rule = rules[o.name], mb = matte[o.name], aoRule = aoRules[o.name];
    if (!rule && !mb && !aoRule) return;
    const piv = g.parts.get(o.name.split(':')[0]).pivot; // three coords, mm
    const pos = o.geometry.attributes.position, bake = o.geometry.attributes._bake, arr = bake.array;
    const mbv = Math.round((mb || 0) * 255);
    for (let i = 0; i < pos.count; i++) {
      if (rule || aoRule) {
        const s = -(pos.getZ(i) * 1000 + piv.z), t = pos.getY(i) * 1000 + piv.y, w = pos.getX(i) * 1000 + piv.x;
        if (rule) arr[i * 4 + 1] = Math.round(clamp01(rule(s, t, w, arr[i * 4 + 1] / 255)) * 255);
        if (aoRule) arr[i * 4] = Math.round(clamp01(aoRule(s, t, w, arr[i * 4] / 255)) * 255);
      }
      if (mbv) arr[i * 4 + 2] = Math.max(arr[i * 4 + 2], mbv);
    }
    bake.needsUpdate = true;
  });
}

/** symmetric 3x3 middle eigenvalue */
function midEig(xx, yy, zz, xy, xz, yz) {
  const p1 = xy * xy + xz * xz + yz * yz;
  if (p1 < 1e-30) { const e = [xx, yy, zz].sort((a, b) => a - b); return e[1]; }
  const q = (xx + yy + zz) / 3;
  const p2 = (xx - q) ** 2 + (yy - q) ** 2 + (zz - q) ** 2 + 2 * p1;
  const p = Math.sqrt(p2 / 6);
  const b = [(xx - q) / p, (yy - q) / p, (zz - q) / p, xy / p, xz / p, yz / p];
  const det = b[0] * (b[1] * b[2] - b[5] * b[5]) - b[3] * (b[3] * b[2] - b[5] * b[4]) + b[4] * (b[3] * b[5] - b[1] * b[4]);
  const r = Math.max(-1, Math.min(1, det / 2));
  const phi = Math.acos(r) / 3;
  const e1 = q + 2 * p * Math.cos(phi), e3 = q + 2 * p * Math.cos(phi + (2 * Math.PI) / 3);
  return 3 * q - e1 - e3;
}

function suppressFaceWear(geo, sigmaMax, aoFloor) {
  const idx = geo.index.array, P0 = geo.attributes.position.array, N0 = geo.attributes.normal.array, B0 = geo.attributes._bake.array;
  const nT = idx.length / 3, nV = P0.length / 3;
  const fn = new Float64Array(nT * 3), fa = new Float64Array(nT);
  for (let f = 0; f < nT; f++) {
    const a = idx[f * 3] * 3, b = idx[f * 3 + 1] * 3, c = idx[f * 3 + 2] * 3;
    const ux = P0[b] - P0[a], uy = P0[b + 1] - P0[a + 1], uz = P0[b + 2] - P0[a + 2];
    const vx = P0[c] - P0[a], vy = P0[c + 1] - P0[a + 1], vz = P0[c + 2] - P0[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz);
    fa[f] = l / 2;
    if (l > 0) { fn[f * 3] = nx / l; fn[f * 3 + 1] = ny / l; fn[f * 3 + 2] = nz / l; }
  }
  // vertex -> triangles
  const cnt = new Int32Array(nV + 1);
  for (let i = 0; i < idx.length; i++) cnt[idx[i] + 1]++;
  for (let v = 0; v < nV; v++) cnt[v + 1] += cnt[v];
  const vt = new Int32Array(idx.length), fill = cnt.slice(0, nV);
  for (let i = 0; i < idx.length; i++) vt[fill[idx[i]]++] = (i / 3) | 0;
  // union-find over coplanar triangles that share a vertex
  const par = new Int32Array(nT);
  for (let f = 0; f < nT; f++) par[f] = f;
  const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  const cosTol = Math.cos(3 * DEG);
  for (let v = 0; v < nV; v++) {
    for (let i = cnt[v]; i < cnt[v + 1]; i++) {
      const f = vt[i];
      for (let j = cnt[v]; j < i; j++) {
        const h = vt[j];
        if (fn[f * 3] * fn[h * 3] + fn[f * 3 + 1] * fn[h * 3 + 1] + fn[f * 3 + 2] * fn[h * 3 + 2] > cosTol) {
          const rf = find(f), rh = find(h);
          if (rf !== rh) par[rf] = rh;
        }
      }
    }
  }
  // per patch: area-weighted second moments of its vertices -> in-plane minor spread
  const M = new Map();
  for (let f = 0; f < nT; f++) {
    const r = find(f);
    let m = M.get(r);
    if (!m) M.set(r, (m = new Float64Array(10)));
    const wgt = fa[f] / 3;
    for (let k = 0; k < 3; k++) {
      const p = idx[f * 3 + k] * 3, x = P0[p], y = P0[p + 1], z = P0[p + 2];
      m[0] += wgt; m[1] += wgt * x; m[2] += wgt * y; m[3] += wgt * z;
      m[4] += wgt * x * x; m[5] += wgt * y * y; m[6] += wgt * z * z; m[7] += wgt * x * y; m[8] += wgt * x * z; m[9] += wgt * y * z;
    }
  }
  const isFace = new Map();
  for (const [r, m] of M) {
    const W = m[0];
    if (W <= 0) { isFace.set(r, false); continue; }
    const mx = m[1] / W, my = m[2] / W, mz = m[3] / W;
    const e = midEig(m[4] / W - mx * mx, m[5] / W - my * my, m[6] / W - mz * mz, m[7] / W - mx * my, m[8] / W - mx * mz, m[9] / W - my * mz);
    isFace.set(r, Math.sqrt(Math.max(0, e)) > sigmaMax);
  }
  const faceTri = new Uint8Array(nT);
  for (let f = 0; f < nT; f++) faceTri[f] = isFace.get(find(f)) ? 1 : 0;
  // vertices: face-only -> wear 0; shared by face and non-face triangles -> duplicate for the face side
  const dup = new Int32Array(nV).fill(-1);
  let extra = 0;
  const floorOf = new Uint8Array(nV);
  for (let v = 0; v < nV; v++) {
    let hasF = false, hasN = false;
    for (let i = cnt[v]; i < cnt[v + 1]; i++) { if (faceTri[vt[i]]) hasF = true; else hasN = true; }
    if (!hasF) continue;
    floorOf[v] = Math.round(clamp01(aoFloor(P0[v * 3], P0[v * 3 + 1], P0[v * 3 + 2])) * 255);
    if (hasN && (B0[v * 4 + 1] > 0 || B0[v * 4] < floorOf[v])) dup[v] = nV + extra++;
    else if (!hasN) { B0[v * 4 + 1] = 0; B0[v * 4] = Math.max(B0[v * 4], floorOf[v]); }
  }
  if (!extra) { geo.attributes._bake.needsUpdate = true; return; }
  const n2 = nV + extra;
  const P1 = new Float32Array(n2 * 3), N1 = new Float32Array(n2 * 3), B1 = new Uint8Array(n2 * 4);
  P1.set(P0); N1.set(N0); B1.set(B0);
  for (let v = 0; v < nV; v++) {
    const d = dup[v];
    if (d < 0) continue;
    for (let c = 0; c < 3; c++) { P1[d * 3 + c] = P0[v * 3 + c]; N1[d * 3 + c] = N0[v * 3 + c]; }
    for (let c = 0; c < 4; c++) B1[d * 4 + c] = B0[v * 4 + c];
    B1[d * 4 + 1] = 0;
    B1[d * 4] = Math.max(B1[d * 4], floorOf[v]);
  }
  const I1 = n2 > 65535 ? new Uint32Array(idx.length) : new Uint16Array(idx.length);
  for (let f = 0; f < nT; f++) for (let k = 0; k < 3; k++) {
    const v = idx[f * 3 + k];
    I1[f * 3 + k] = faceTri[f] && dup[v] >= 0 ? dup[v] : v;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(P1, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(N1, 3));
  geo.setAttribute('_bake', new THREE.BufferAttribute(B1, 4, true));
  geo.setIndex(new THREE.BufferAttribute(I1, 1));
}
