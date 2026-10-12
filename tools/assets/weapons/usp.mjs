// 執法者 Warden .45 — USP-pattern .45 service pistol: polymer frame with accessory-rail grooves, matte black steel
// slide, external spur hammer, ambidextrous control lever (safety / decocker), 12-round double-stack magazine.
// Side view, mm: s forward from the slide's rear face, t up from the bore axis, w right (ejection-port side).
// Reference: overall length 200 (hammer spur -> muzzle), barrel 112, height 136 (rear sight -> floorplate),
// width 32 (levers), grip / magazine rake 19 deg, oversized trigger guard (~22 mm finger opening).
// Finish: the slide is matte black (steel_dark); edge wear is rescaled per part after the bake (tuneWear) because the
// kit bakes full wear onto every small bevel. The grip is a custom rounded extrusion (roundSlab: back strap r 9.5,
// front strap r 7) tapered 30 -> 28.5 mm, with checkered panels recessed into its flats.
import * as THREE from 'three';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  Gun, V, DEG, makeShape, profile, plan, section, lathe, cyl, tube, box, screw, cut, union, intersect, cutters, merge, xform, mirrorW, circle,
} from '../lib/gunkit.mjs';

const DBG = !!process.env.USP_DEBUG;
const triCount = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
/** cut() with optional cost logging (USP_DEBUG=1) */
function cutx(label, a, list) {
  const t0 = Date.now();
  const r = cut(a, list);
  if (DBG) console.log(`  cut ${label.padEnd(18)} ${triCount(a)} -> ${triCount(r)} tris  ${Date.now() - t0} ms`);
  return r;
}

// ------------------------------------------------------------------------------------------ layout
const RAKE = 19;                       // grip / magazine rake from vertical (deg)
const PIV = [63, -20, 0];              // magazine seat: top centre of the mag body
const CR = Math.cos(RAKE * DEG), SR = Math.sin(RAKE * DEG);
/** magazine frame (u across the mag towards the muzzle, v up the mag axis) -> side view [s, t] */
const G = (u, v) => [PIV[0] + u * CR + v * SR, PIV[1] - u * SR + v * CR];
const U = (s, t) => (s - PIV[0]) * CR - (t - PIV[1]) * SR;
const Vv = (s, t) => (s - PIV[0]) * SR + (t - PIV[1]) * CR;
/** geometry authored upright around PIV (s = 63 + u, t = -20 + v) -> raked into the grip */
const tilt = (geo) => xform(geo, { rot: [-RAKE, 0, 0], pivot: PIV });

const SW = 13.2;     // slide half width
const SB = -21;      // slide bottom
const ST = 12;       // slide top flat
const MUZ = 190;     // slide front face
const FW = 12.8;     // frame half width under the slide
const FT = -21.4;    // frame top (0.4 mm seam under the slide)
const GH = 15;       // grip half width (before the taper)
const PD = 0.4;      // checkered panel recess depth

// grip lines (front strap u = +21.5, back strap u = -34) and the bottom (v = -90, square to the rake)
const TOE = G(21.5, -90), HEEL = G(-34, -90);
const frontAt = (t) => TOE[0] + (t - TOE[1]) * (SR / CR);
const backAt = (t) => HEEL[0] + (t - HEEL[1]) * (SR / CR);

const sstep = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
/**
 * Grip width profile (factor on w by height t): narrows to 12.2 mm half width where the grip runs up into the frame
 * (no corners poking out under the tang), flares to the full 15 mm below the frame and tapers to 14.25 at the bottom.
 */
const FTOP = 12.2 / GH, FBOT = 14.25 / GH;
const fW = (t) => (t > -31 ? FTOP : t > -41 ? FTOP + (1 - FTOP) * sstep((-31 - t) / 10) : 1 - ((1 - FBOT) * (-41 - t)) / 74);
/** applies the grip width profile to a geometry in gun space (three x = w, y = t) */
function taperW(geo) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * fW(p.getY(i)));
  if (geo.attributes.normal) geo.deleteAttribute('normal');
  geo.computeVertexNormals();
  return geo;
}

// ------------------------------------------------------------------------------------------ helpers
/**
 * Kit workaround: gunkit.mirrorW() negates normal.x after geo.scale(-1,1,1) already did, so mirrored parts end up with
 * inward-facing side normals (wrong shading + wrong AO rays). Flip them back here.
 */
function mirror(geo) {
  const m = mirrorW(geo);
  const n = m.attributes.normal;
  if (n) for (let i = 0; i < n.count; i++) n.setX(i, -n.getX(i));
  return m;
}
/** chamfered disc (pin / axle head) facing +w or -w */
function pin(s, t, w, r, h = 0.5, seg = 14) {
  const g = lathe([[0, 0], [0, r], [h * 0.6, r * 0.92], [h, r * 0.7], [h, 0]], { seg });
  g.rotateY(w >= 0 ? -Math.PI / 2 : Math.PI / 2);
  const c = V(s, t, w);
  return g.translate(c.x, c.y, c.z);
}
/** Cylinder whose axis runs along w (hubs, axles) from w0 to w1 at (s, t). */
function cylW(s, t, w0, w1, r, { seg = 20, b = 0.25 } = {}) {
  const len = Math.abs(w1 - w0);
  const g = cyl(0, len, r, { seg, b: Math.min(b, r * 0.4, len * 0.45) });
  g.rotateY(-Math.PI / 2); // +s -> +w
  g.translate(Math.min(w0, w1), t, -s);
  return g;
}

/** half-space cutter: removes everything on `side` (+1 = left of p0->p1, i.e. above a forward line) */
function planeCut(p0, p1, side = 1, size = 300) {
  const th = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
  const n = [-Math.sin(th) * side, Math.cos(th) * side];
  const m = [(p0[0] + p1[0]) / 2 + n[0] * size / 2, (p0[1] + p1[1]) / 2 + n[1] * size / 2];
  return box([m[0], m[1], 0], [size, size, size], { r: 0, rot: [th / DEG, 0, 0] });
}

/** edge-chamfer cutter for an opening in a side face at w0: outline grown by b, beveled b into the face */
function sideChamfer(pts, w0, b = 0.8, X = 6) {
  return profile(pts, { w: 2 * X, cw: w0 + Math.sign(w0) * (X - b), bevel: b, bevelSeg: 1, curveSeg: 6 });
}

/**
 * Local copy of gunkit.section() with `steps` (the kit's version always extrudes in one step): cross-section in (w, t)
 * extruded along s with its side walls divided every (s1 - s0 - 2 bevel) / steps. Used for the serrated rear block so
 * each wall quad holds exactly one groove (one cut per triangle keeps the CSG from shredding the flank).
 */
function sectionSteps(spec, s0, s1, { bevel = 0.6, bevelSeg = 2, curveSeg = 10, steps = 1 } = {}) {
  const shape = makeShape(spec);
  const b = Math.max(0, Math.min(bevel, Math.abs(s1 - s0) / 2 - 0.05));
  const depth = Math.max(0.02, Math.abs(s1 - s0) - 2 * b);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, steps, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: bevelSeg, curveSegments: curveSeg,
  });
  geo.translate(0, 0, b + Math.min(s0, s1));
  geo.scale(1, 1, -1);
  const idx = geo.index;
  if (idx) for (let i = 0; i < idx.count; i += 3) { const t = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, t); }
  else {
    const p = geo.attributes.position.array;
    for (let i = 0; i < p.length; i += 9) for (let c = 0; c < 3; c++) { const t = p[i + 3 + c]; p[i + 3 + c] = p[i + 6 + c]; p[i + 6 + c] = t; }
  }
  for (const k of Object.keys(geo.attributes)) if (k !== 'position') geo.deleteAttribute(k);
  const g = geo.index ? geo.toNonIndexed() : geo;
  return toCreasedNormals(g, 38 * DEG);
}

/**
 * V-groove cutter (slide serration) on side +1 / -1: 90 deg V `depth` deep, running along t from t0 to t1. A triangular
 * prism that only just clears the surface, so neighbouring cutters never overlap (overlapping cutters merged into one
 * CSG brush are not a valid solid and the cut fails).
 */
function vgroove(s, side, depth, t0, t1) {
  const o = 0.15, hw = depth + o;
  const pts = [[s - hw, side * (SW + o)], [s + hw, side * (SW + o)], [s, side * (SW - depth)]];
  return plan(side > 0 ? pts : pts.reverse(), { h: t1 - t0, ct: (t0 + t1) / 2, bevel: 0 });
}

// Tiny stroke font (4 x 6 units) for laser-etched markings.
const FONT = {
  A: [[0, 0, 2, 6], [2, 6, 4, 0], [0.9, 2.4, 3.1, 2.4]],
  C: [[4, 6, 1, 6], [1, 6, 0, 5], [0, 5, 0, 1], [0, 1, 1, 0], [1, 0, 4, 0]],
  D: [[0, 0, 0, 6], [0, 6, 2.8, 6], [2.8, 6, 4, 4.8], [4, 4.8, 4, 1.2], [4, 1.2, 2.8, 0], [2.8, 0, 0, 0]],
  E: [[0, 0, 0, 6], [0, 6, 4, 6], [0, 3, 3, 3], [0, 0, 4, 0]],
  F: [[0, 0, 0, 6], [0, 6, 4, 6], [0, 3, 3, 3]],
  I: [[2, 0, 2, 6], [1, 0, 3, 0], [1, 6, 3, 6]],
  L: [[0, 6, 0, 0], [0, 0, 4, 0]],
  M: [[0, 0, 0, 6], [0, 6, 2, 3], [2, 3, 4, 6], [4, 6, 4, 0]],
  N: [[0, 0, 0, 6], [0, 6, 4, 0], [4, 0, 4, 6]],
  O: [[1, 0, 3, 0], [3, 0, 4, 1], [4, 1, 4, 5], [4, 5, 3, 6], [3, 6, 1, 6], [1, 6, 0, 5], [0, 5, 0, 1], [0, 1, 1, 0]],
  P: [[0, 0, 0, 6], [0, 6, 3, 6], [3, 6, 4, 5], [4, 5, 4, 4], [4, 4, 3, 3], [3, 3, 0, 3]],
  R: [[0, 0, 0, 6], [0, 6, 3, 6], [3, 6, 4, 5], [4, 5, 4, 4], [4, 4, 3, 3], [3, 3, 0, 3], [2, 3, 4, 0]],
  S: [[4, 6, 1, 6], [1, 6, 0, 5], [0, 5, 0, 4], [0, 4, 1, 3], [1, 3, 3, 3], [3, 3, 4, 2], [4, 2, 4, 1], [4, 1, 3, 0], [3, 0, 0, 0]],
  T: [[0, 6, 4, 6], [2, 6, 2, 0]],
  U: [[0, 6, 0, 1], [0, 1, 1, 0], [1, 0, 3, 0], [3, 0, 4, 1], [4, 1, 4, 6]],
  W: [[0, 6, 0.8, 0], [0.8, 0, 2, 4], [2, 4, 3.2, 0], [3.2, 0, 4, 6]],
  0: [[1, 0, 3, 0], [3, 0, 4, 1], [4, 1, 4, 5], [4, 5, 3, 6], [3, 6, 1, 6], [1, 6, 0, 5], [0, 5, 0, 1], [0, 1, 1, 0]],
  1: [[1, 5, 2, 6], [2, 6, 2, 0], [1, 0, 3, 0]],
  2: [[0, 5, 1, 6], [1, 6, 3, 6], [3, 6, 4, 5], [4, 5, 4, 4], [4, 4, 0, 0], [0, 0, 4, 0]],
  3: [[0, 6, 4, 6], [4, 6, 4, 0], [1.2, 3, 4, 3], [0, 0, 4, 0]],
  4: [[3, 0, 3, 6], [3, 6, 0, 2], [0, 2, 4, 2]],
  5: [[4, 6, 0, 6], [0, 6, 0, 3.4], [0, 3.4, 3, 3.4], [3, 3.4, 4, 2.4], [4, 2.4, 4, 1], [4, 1, 3, 0], [3, 0, 0, 0]],
  6: [[4, 6, 1, 6], [1, 6, 0, 5], [0, 5, 0, 0], [0, 0, 4, 0], [4, 0, 4, 3], [4, 3, 0, 3]],
  7: [[0, 6, 4, 6], [4, 6, 1.5, 0]],
  8: [[0, 0, 4, 0], [4, 0, 4, 6], [4, 6, 0, 6], [0, 6, 0, 0], [0, 3, 4, 3]],
  9: [[0, 0, 3, 0], [3, 0, 4, 1], [4, 1, 4, 6], [4, 6, 0, 6], [0, 6, 0, 3], [0, 3, 4, 3]],
  '-': [[1, 3, 3, 3]],
  '.': [[2, 0, 2, 0]],
};
const advance = (ch) => (ch === ' ' ? 3.2 : ch === '.' ? 3.4 : 5.6);

/** One stroke: a thin box spanning p1..p2 (gun mm) sunk into a face with outward normal n, standing `raise` proud. */
function strokeBox(p1, p2, n, X, sw, raise, sink) {
  const A = V(...p1), B = V(...p2);
  const d = B.clone().sub(A);
  const len = d.length();
  const a = len > 1e-6 ? d.clone().normalize() : V(...X).normalize();
  const nn = V(...n).normalize();
  const b = new THREE.Vector3().crossVectors(a, nn);
  const geo = new THREE.BoxGeometry(len + sw, raise + sink, sw);
  geo.applyMatrix4(new THREE.Matrix4().makeBasis(a, nn, b));
  const c = A.clone().add(B).multiplyScalar(0.5).addScaledVector(nn, (raise - sink) / 2);
  geo.translate(c.x, c.y, c.z);
  return geo;
}

/**
 * Laser-etched marking: strokes inlaid flush (a few hundredths proud) in a contrasting material.
 * o = bottom-left of the first glyph, X = reading direction, Y = glyph up, n = face normal (all [s,t,w]).
 */
function etch(text, { o, X, Y, n, h = 4, sw, raise = 0.04 }) {
  const k = h / 6;
  sw = sw || Math.max(0.26, 0.75 * k);
  const out = [];
  let x = 0, i = 0;
  const P = (gx, gy) => [0, 1, 2].map((j) => o[j] + (x + gx) * k * X[j] + gy * k * Y[j]);
  for (const ch of text) {
    const gl = FONT[ch];
    if (gl) for (const [x1, y1, x2, y2] of gl) out.push(strokeBox(P(x1, y1), P(x2, y2), n, X, sw, raise + (i++ % 4) * 0.01, 0.3));
    x += advance(ch);
  }
  return merge(out);
}

/** three-space position of a side-view point [s, t, w] */
const T3 = (p) => [p[2], p[1], -p[0]];
/** Triangle soup builder: pushes (a, b, c) wound so that its normal faces `hint` (all [s, t, w]). */
function soup() {
  const pos = [];
  return {
    pos,
    tri(a, b, c, hint) {
      const A = T3(a), B = T3(b), C = T3(c), h = T3(hint);
      const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      if (n[0] * h[0] + n[1] * h[1] + n[2] * h[2] < 0) pos.push(...A, ...C, ...B); else pos.push(...A, ...B, ...C);
    },
    geo() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      return g;
    },
  };
}

/**
 * Checkering pyramid at c (side view [s,t,w]) on a surface with outward unit normal n, base half-diagonals along the
 * unit vectors a and b (both in the surface), height h. Base corners touch the neighbours' (full-coverage checkering).
 */
function pyramid(S, c, n, a, b, r, h) {
  const apex = [0, 1, 2].map((k) => c[k] + n[k] * h);
  const base = [a, b, a.map((x) => -x), b.map((x) => -x)].map((d) => [0, 1, 2].map((k) => c[k] + d[k] * r));
  for (let i = 0; i < 4; i++) {
    const p = base[i], q = base[(i + 1) % 4];
    const hint = [0, 1, 2].map((k) => (p[k] + q[k] + apex[k]) / 3 - c[k] + n[k] * 0.01);
    S.tri(p, q, apex, hint);
  }
}

function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function distToPoly(p, poly) {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j], [bx, by] = poly[i];
    const dx = bx - ax, dy = by - ay;
    const u = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy)));
    d = Math.min(d, Math.hypot(p[0] - ax - u * dx, p[1] - ay - u * dy));
  }
  return d;
}
/** u-range [back, front] of a side-view polygon along the line v = const of the magazine frame */
function stripU(poly, v) {
  const O = G(0, v), D = [CR, -SR];
  let lo = Infinity, hi = -Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j], [bx, by] = poly[i];
    const ex = bx - ax, ey = by - ay, det = D[0] * -ey - D[1] * -ex;
    if (Math.abs(det) < 1e-9) continue;
    const rx = ax - O[0], ry = ay - O[1];
    const u = (rx * -ey - ry * -ex) / det, lam = (D[0] * ry - D[1] * rx) / det;
    if (lam >= 0 && lam <= 1) { lo = Math.min(lo, u); hi = Math.max(hi, u); }
  }
  return [lo, hi];
}
/** bisection root of a monotonic f on [a, b] */
function solve(f, a, b) {
  let fa = f(a);
  for (let i = 0; i < 50; i++) { const m = (a + b) / 2, fm = f(m); if ((fm > 0) === (fa > 0)) { a = m; fa = fm; } else b = m; }
  return (a + b) / 2;
}

/** closed polyline cleanup (drop near-duplicate points) and densify (no segment longer than maxLen) */
function cleanLoop(pts, eps = 0.05) {
  const out = [];
  for (const p of pts) if (!out.length || Math.hypot(p[0] - out[out.length - 1][0], p[1] - out[out.length - 1][1]) > eps) out.push(p);
  while (out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= eps) out.pop();
  return out;
}
function densify(P, maxLen) {
  const out = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / maxLen));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

/**
 * Side-view outline extruded across the gun (half width H) with a per-point edge radius R(s, t): each face meets the
 * outline wall through a quarter round of that radius (the kit's profile() bevel is one size all round, which made the
 * grip a brick). R is limited to the local outline radius at convex points and slope-limited along the outline so the
 * flat-face contour never folds. The flat caps are tessellated (capEdge) so a later w warp (taperW) bends them smoothly.
 * Returns { geo, P (outline, CCW), N (inward normals), R, cap (flat-face contour) }.
 */
function roundSlab(outline, { H, R, K = 4, maxSeg = 2.4, capEdge = 4, slope = 0.6, rMin = 0.4 }) {
  let P = cleanLoop(densify(cleanLoop(outline), maxSeg));
  const area = P.reduce((a, p, i) => { const q = P[(i + 1) % P.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0);
  if (area < 0) P.reverse();
  const n = P.length, N = [], Rr = [], len = [];
  for (let i = 0; i < n; i++) {
    const a = P[(i - 1 + n) % n], p = P[i], b = P[(i + 1) % n];
    const d1 = [p[0] - a[0], p[1] - a[1]], d2 = [b[0] - p[0], b[1] - p[1]];
    const l1 = Math.hypot(...d1), l2 = Math.hypot(...d2);
    const n1 = [-d1[1] / l1, d1[0] / l1], n2 = [-d2[1] / l2, d2[0] / l2];
    let m = [n1[0] + n2[0], n1[1] + n2[1]];
    const lm = Math.hypot(...m) || 1;
    m = [m[0] / lm, m[1] / lm];
    const c = Math.max(0.5, m[0] * n1[0] + m[1] * n1[1]);
    N.push([m[0] / c, m[1] / c]);
    const cross = d1[0] * d2[1] - d1[1] * d2[0];
    const turn = Math.acos(Math.max(-1, Math.min(1, (d1[0] * d2[0] + d1[1] * d2[1]) / (l1 * l2))));
    const rc = cross > 0 && turn > 1e-4 ? (0.5 * (l1 + l2)) / turn : Infinity; // convex: local outline radius
    Rr.push(Math.min(R(p[0], p[1]), 0.8 * rc, H - 0.2));
    len.push(l2);
  }
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < n; i++) { const j = (i - 1 + n) % n; Rr[i] = Math.min(Rr[i], Rr[j] + slope * len[j]); }
    for (let i = n - 1; i >= 0; i--) { const j = (i + 1) % n; Rr[i] = Math.min(Rr[i], Rr[j] + slope * len[i]); }
  }
  for (let i = 0; i < n; i++) Rr[i] = Math.max(rMin, Rr[i]);
  const order = [];
  for (let k = K; k >= 0; k--) order.push([1, k]);
  for (let k = 0; k <= K; k++) order.push([-1, k]);
  const ring = ([sg, k]) => {
    const ph = (Math.PI / 2) * (k / K);
    return P.map((p, i) => {
      const ins = Rr[i] * (1 - Math.cos(ph));
      return [p[0] + N[i][0] * ins, p[1] + N[i][1] * ins, sg * (H - Rr[i] + Rr[i] * Math.sin(ph))];
    });
  };
  const outward = ([sg, k], i) => {
    const ph = (Math.PI / 2) * (k / K), l = Math.hypot(...N[i]);
    return [(-N[i][0] / l) * Math.cos(ph), (-N[i][1] / l) * Math.cos(ph), sg * Math.sin(ph)];
  };
  const rings = order.map(ring);
  const S = soup();
  for (let r = 0; r + 1 < rings.length; r++) {
    const A = rings[r], B = rings[r + 1];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ha = outward(order[r], i), hb = outward(order[r + 1], j);
      const hint = [ha[0] + hb[0], ha[1] + hb[1], ha[2] + hb[2]];
      S.tri(A[i], A[j], B[j], hint);
      S.tri(A[i], B[j], B[i], hint);
    }
  }
  const cap = rings[0].map((p) => [p[0], p[1]]);
  const faces = THREE.ShapeUtils.triangulateShape(cap.map((p) => new THREE.Vector2(p[0], p[1])), []);
  const C = soup();
  for (const sg of [1, -1]) for (const [a, b, c] of faces) C.tri([...cap[a], sg * H], [...cap[b], sg * H], [...cap[c], sg * H], [0, 0, sg]);
  const capGeo = new TessellateModifier(capEdge, 8).modify(C.geo());
  for (const k of Object.keys(capGeo.attributes)) if (k !== 'position' && k !== 'normal') capGeo.deleteAttribute(k);
  return { geo: merge([S.geo(), capGeo]), P, N, R: Rr, cap };
}

/**
 * The kit bakes full edge wear onto every bevel, which turned the black slide and the small steel parts into polished
 * chrome with grunge blobs (the per-vertex value also smears along long CSG slivers). The baked channels are rescaled
 * per mesh after the bake: rules = { 'part:mat': (s, t, w, v) => v' } on the edge channel (gun-space mm, v 0..1);
 * flats = { 'part:mat': (s, t, w) => bool } gives big flat faces one uniform AO and no edge / cavity (their long earcut
 * fans otherwise smear the outline values into streaks). Same approach as glock.mjs; the kit has no per-part control.
 */
function tuneWear(g, root, rules, flats = {}) {
  root.traverse((o) => {
    const rule = o.isMesh && rules[o.name], flat = o.isMesh && flats[o.name];
    const bake = (rule || flat) && o.geometry.attributes._bake;
    if (!bake) return;
    const piv = g.parts.get(o.name.split(':')[0]).pivot; // three coords (x = w, y = t, z = -s), mm
    const pos = o.geometry.attributes.position, arr = bake.array;
    const at = (i) => [-(pos.getZ(i) * 1000 + piv.z), pos.getY(i) * 1000 + piv.y, pos.getX(i) * 1000 + piv.x];
    if (rule) for (let i = 0; i < pos.count; i++) {
      const [s, t, w] = at(i);
      const v = rule(s, t, w, arr[i * 4 + 1] / 255);
      arr[i * 4 + 1] = Math.round(Math.max(0, Math.min(1, v)) * 255);
    }
    if (flat) {
      const hit = [];
      let ao = 0;
      for (let i = 0; i < pos.count; i++) if (flat(...at(i))) { hit.push(i); ao += arr[i * 4]; }
      ao = hit.length ? Math.round(ao / hit.length) : 255;
      for (const i of hit) { arr[i * 4] = ao; arr[i * 4 + 1] = 0; arr[i * 4 + 2] = 0; }
    }
    bake.needsUpdate = true;
  });
}

// ------------------------------------------------------------------------------------------ build
export default function build() {
  const g = new Gun('usp');

  // ======================================================================================== SLIDE
  // matte black slide: small fillets with few segments (long thin fillet strips smeared the edge-wear bake into streaks).
  // Finish: steel_dark like the Glock's nitride. steel_blued and alu were tried, but their metal 0.9 / 0.55 at low roughness
  // mirror the sky and read as a silver slide in game; there is no fine-detail matte 'nitride' key (see report).
  const slide = g.part('slide', { pivot: [0, 0, 0], extras: { travel: 0.03 } });
  const SLIDE = 'steel_dark';
  const slideXS = [[-SW, SB, 1.0], [SW, SB, 1.0], [SW, 4.6, 1.2], [7.6, ST, 1.1], [-7.6, ST, 1.1], [-SW, 4.6, 1.2]];
  const slFull = section(slideXS, 0, MUZ, { bevel: 0.8, bevelSeg: 1, curveSeg: 3 });
  // the slide is split at s = 36 (coplanar internal faces, invisible): the serration grooves are cut into the short rear
  // block only, so the CSG does not shred the 190 mm flank faces into long slivers
  const SPLIT = 36;
  // rear block walls in 2.3 mm steps (0.8 + 2.3 k), one serration groove centred in each step
  let slr = intersect(sectionSteps(slideXS, 0, 40.7, { bevel: 0.8, bevelSeg: 1, curveSeg: 3, steps: 17 }), cutters.box([SPLIT / 2 - 3, 0, 0], [SPLIT + 6, 80, 60]));
  let sl = intersect(slFull, cutters.box([SPLIT + 100, 0, 0], [200, 80, 60]));

  // nose: top and lower chamfers, plus side chamfers seen from above
  sl = cutx('nose', sl, [planeCut([179.5, ST + 0.8], [191, 8.4], 1), planeCut([185.2, SB - 0.6], [191, -15.6], -1)]);
  for (const sg of [1, -1]) {
    const big = new THREE.BoxGeometry(300, 300, 300).translate(sg * 150, 0, 0);
    big.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.atan2(1.5 * sg, 8.5)));
    const p = V(182.5, 0, sg * SW);
    sl = cutx('nose side', sl, [big.translate(p.x, p.y, p.z)]);
  }
  // ejection port: right side + top, radiused corners, chamfered rims
  const PS0 = 80, PS1 = 126, PT0 = -2.2, PWL = -7.6;
  const portBox = box([(PS0 + PS1) / 2, 16, (PWL + 30) / 2], [PS1 - PS0, 36.4, 30 - PWL], { r: 1.6, seg: 3 });
  const portSide = sideChamfer([[PS0 - 0.8, PT0 - 0.8, 2.4], [PS1 + 0.8, PT0 - 0.8, 2.4], [PS1 + 0.8, 30, 0], [PS0 - 0.8, 30, 0]], SW, 0.8);
  const portTop = plan([[PS0 - 0.7, PWL - 0.7, 2.3], [PS1 + 0.7, PWL - 0.7, 2.3], [PS1 + 0.7, 30, 0], [PS0 - 0.7, 30, 0]],
    { h: 12, ct: ST - 0.7 + 6, bevel: 0.7, bevelSeg: 1, curveSeg: 6 });
  sl = cutx('port+bores', sl, [
    portBox, portSide, portTop,
    cyl(70, 186, 10, { t: 0, b: 0, seg: 28 }),                             // barrel channel
    cyl(183, 196, 8.95, { t: 0, b: 0, seg: 28 }),                          // muzzle bushing bore
    cutters.box([70, -13.5, 0], [112, 19, 18]),                            // hollow underside (s 14..126, w ±9)
    cyl(120, 186, 5.1, { t: -14, b: 0, seg: 16 }),                         // recoil spring channel
    cyl(183, 196, 3.9, { t: -14, b: 0, seg: 16 }),                         // guide rod hole
  ]);
  // rear cocking serrations: 12 V grooves per side cut straight into the flanks; they run out through the slide bottom
  // and fade out on the top chamfer (the chamfer recedes past the groove floor at t ~ 5.8)
  const SER = [];
  for (let k = 3; k < 15; k++) SER.push(0.8 + 2.3 * k + 1.15);
  const grooves = [];
  for (const side of [1, -1]) for (const s of SER) grooves.push(vgroove(s, side, 0.85, SB - 2, 9));
  sl = cutx('details', sl, [
    cutters.pocketW([[55.2, -1.6, 1.8], [80.4, -1.6, 0], [80.4, 4.9, 0], [55.2, 4.9, 1.8]], SW - 1.2, 10), // extractor pocket
    cutters.box([100, SB + 1.2, -SW], [10.5, 6.4, 6.0]),                   // slide-stop notch (left), plain box through the bevel
    cutters.box([175.3, 12.4, 0], [6.8, 3.6, 44]),                         // front sight dovetail
  ]);
  slr = cutx('rear block', slr, [
    cutters.box([70, -13.5, 0], [112, 19, 18]),                            // hollow underside (from s 14)
    box([1.6, -10, 0], [8.4, 24.4, 9.2], { r: 1.2, seg: 2 }),              // hammer notch (s -2.6..5.8)
    cutters.box([9.6, 12.4, 0], [9.2, 3.6, 44]),                           // rear sight dovetail
    merge(grooves),
  ]);
  slide.add(merge([slr, sl]), SLIDE);
  // roll marks (laser etched, bare metal): left side model name, right side caliber
  slide.add(etch('WARDEN .45', { o: [167, -12.4, -SW], X: [-1, 0, 0], Y: [0, 1, 0], n: [0, 0, -1], h: 4.4 }), 'steel_bright');
  slide.add(etch('CAL.45', { o: [150, -17.6, SW], X: [1, 0, 0], Y: [0, 1, 0], n: [0, 0, 1], h: 2.2, sw: 0.3 }), 'steel_bright');

  // rear sight: dovetail base + body with a square notch and two large white-ring tritium dots set 0.2 mm into the face.
  // Aim line = notch top (18.8) -> front post top (17.2); the dots sit 1.9 mm (rear) / 3.1 mm (front) under it, which
  // lines the three dots up at the pistol's 270 mm eye relief (0.61 apparent scale of the front sight)
  const RT = 18.8, FPT = 17.2, RDT = RT - 1.95, FDT = FPT - 3.1, RDW = 4.8;
  const dovetail = (s0, s1) => section([[-8.55, 10.75, 0.2], [8.55, 10.75, 0.2], [7.5, 12.15, 0.2], [-7.5, 12.15, 0.2]], s0, s1, { bevel: 0.25, curveSeg: 2 });
  slide.add(dovetail(5.3, 13.9), 'steel_dark');
  let rs = profile([[4, 11.9, 0.3], [15.4, 11.9, 0.3], [15.4, 15.0, 1.4], [11.8, RT, 1.0], [4, RT, 0.5]], { w: 14.4, bevel: 0.5, bevelSeg: 1, curveSeg: 4 });
  rs = cutx('rear sight', rs, [
    box([9.6, 21, 0], [16, 10, 3.9], { r: 0.25, seg: 1 }),                 // notch, bottom at t = 16
    cyl(2, 7.2, 1.38, { t: RDT, w: RDW, b: 0, seg: 22 }), cyl(2, 7.2, 1.38, { t: RDT, w: -RDW, b: 0, seg: 22 }),
  ]);
  slide.add(rs, 'steel_dark');
  for (const w of [-RDW, RDW]) {
    slide.add(lathe([[4.2, 0.75], [4.2, 1.24], [4.32, 1.33], [7.2, 1.33], [7.2, 0.75], [4.2, 0.75]], { t: RDT, w, seg: 18 }), 'paint_white');
    slide.add(cyl(4.35, 7.2, 0.75, { t: RDT, w, seg: 12, b: 0.1 }), 'tritium');
  }
  slide.add(screw([10.2, 15.0, 7.2], 1.0, { face: 'w', depth: 0.45 }), 'steel_dark');      // windage set screw

  // front sight: dovetail base + post (3.6 wide in a 3.9 notch) with one white-ring tritium dot
  slide.add(dovetail(172.2, 178.4), 'steel_dark');
  let fs = profile([[171.6, 11.2, 0.3], [179, 11.2, 0.3], [179, 12.8, 0.8], [174.6, FPT, 0.6], [171.6, FPT, 0.4]], { w: 3.6, bevel: 0.35, bevelSeg: 1, curveSeg: 4 });
  fs = cutx('front sight', fs, [cyl(169, 174.8, 1.3, { t: FDT, b: 0, seg: 22 })]);
  slide.add(fs, 'steel_dark');
  slide.add(lathe([[171.8, 0.7], [171.8, 1.16], [171.92, 1.25], [174.8, 1.25], [174.8, 0.7], [171.8, 0.7]], { t: FDT, seg: 18 }), 'paint_white');
  slide.add(cyl(171.95, 174.8, 0.7, { t: FDT, seg: 12, b: 0.1 }), 'tritium');

  // extractor (right side) with its pin; firing-pin tip and bushing in the hammer notch
  slide.add(profile([[55.8, -1.0, 1.6], [79.6, -1.0, 0.5], [80.9, 0.4, 0.4], [80.9, 4.3, 0.4], [55.8, 4.3, 1.6]], { w: 2.0, cw: SW - 0.75, bevel: 0.35, bevelSeg: 1, curveSeg: 4 }), 'steel_dark');
  slide.add(pin(60.5, 1.65, SW + 0.25, 1.2, 0.35, 14), 'steel_dark');
  slide.add(cyl(5.2, 6.4, 1.5, { t: 0, seg: 16, b: 0.25 }), 'steel_bright');
  slide.add(cyl(5.6, 6.2, 3.1, { t: 0, seg: 20, b: 0.2 }), 'steel_dark');

  // ======================================================================================== BARREL (separate, static)
  // black barrel with a real .45 chamber (seen through the port at slide lock), feed ramp and an octagonal
  // (polygonal-rifling) bore. Own part so the animator can tilt it (Browning drop) when the slide is back.
  const barrel = g.part('barrel', { pivot: [100, -10, 0], extras: { axis: 'w', tiltDeg: 2.5 } });
  let bar = lathe([[78.4, 0], [78.4, 9.0], [78.9, 9.4], [107, 9.4], [111, 8.6], [188.9, 8.6], [189.4, 8.1], [189.4, 0]], { seg: 32 });
  bar = union(bar, box([102, 6.2, 0], [47.2, 11.0, 13.8], { r: 0.7, seg: 2 }));   // chamber hood (locks into the port)
  bar = cutx('barrel', bar, [
    lathe([[74, 0], [74, 6.05], [93.4, 6.05], [94.6, 5.65], [94.6, 0]], { seg: 32 }),                    // chamber
    lathe([[90, 0], [90, 5.62], [MUZ + 3, 5.62], [MUZ + 3, 0]], { seg: 8, phase: Math.PI / 8 }),         // octagonal bore
    lathe([[187.9, 0], [187.9, 5.62], [189.0, 6.6], [192, 6.6], [192, 0]], { seg: 32 }),                  // crown chamfer
    profile([[74, -13], [78.7, -13], [85.6, -5.4], [74, -5.4]], { w: 7.4, bevel: 0 }),                    // feed ramp
  ]);
  barrel.add(bar, 'steel_dark');
  // matte black liner a hair inside the octagonal bore (the bare steel bore read as a bright mirror from the muzzle)
  barrel.add(tube(97, MUZ - 6, 5.5, 5.3, { seg: 8, phase: Math.PI / 8, b: 0.05 }), 'rubber');
  barrel.add(etch('45 AUTO', { o: [91.5, 11.7, 1.25], X: [1, 0, 0], Y: [0, 0, -1], n: [0, 1, 0], h: 2.5, sw: 0.32 }), 'steel_bright');
  // recoil spring guide rod (static in the frame)
  g.add(lathe([[118, 0], [118, 3.4], [189.2, 3.4], [189.8, 2.8], [189.8, 1.3], [189.3, 1.0], [189.3, 0]], { t: -14, seg: 18 }), 'steel_dark');

  // steel frame-rail inserts riding inside the slide (visible through the port when the slide is back)
  for (const sg of [1, -1]) g.add(section([[sg * 7.3, -21.6, 0.3], [sg * 8.95, -21.6, 0.3], [sg * 8.95, -18.6, 0.4], [sg * 7.3, -18.6, 0.4]], 8, 124, { bevel: 0.3, curveSeg: 2 }), 'steel_dark');

  // ======================================================================================== FRAME (polymer)
  const magwell = tilt(cutters.box([63, -55, 0], [37.2, 130, 24]));
  const magwellLow = tilt(cutters.box([63, -75, 0], [37.2, 90, 24]));       // full width only below the frame rails
  const magTop = cutters.box([63, -27, 0], [37.2, 12, 19.2]);              // narrow clearance for the feed lips
  // magwell mouth chamfer (1 mm at 45 deg)
  const flare = tilt(plan([[63 - 19.6, -13, 2.5], [63 + 19.6, -13, 2.5], [63 + 19.6, 13, 2.5], [63 - 19.6, 13, 2.5]],
    { h: 10, ct: -110 - 5 + 1.0, bevel: 1.0, bevelSeg: 1, curveSeg: 4 }));

  // upper frame: tang, rails region under the slide, dust cover with deep rail grooves (2.3 mm, 0.3 chamfers) that
  // run out through the front, and two cross slots
  let fr = profile([[-4, FT, 2], [183.6, FT, 0.8], [185.4, -24, 1.5], [181.6, -37.6, 2.5], [76, -37.6, 0], [70, -36, 0],
    [18, -36, 0], [8, -32, 5], [-9.4, -29.6, 3.2], [-10, -23.6, 3]], { w: 2 * FW, bevel: 1.6, bevelSeg: 2, curveSeg: 6 });
  const GRV = [[126, -34.4, 1.2], [200, -34.4, 0], [200, -30.0, 0], [126, -30.0, 1.2]];
  const GRVc = [[125.7, -34.7, 1.5], [200, -34.7, 0], [200, -29.7, 0], [125.7, -29.7, 1.5]];
  fr = cutx('frame', fr, [
    cutters.box([-1.5, -26, 0], [21, 12.4, 8.6]),                          // hammer slot
    cutters.box([97.5, -36, 0], [12, 8.4, 7.4]),                           // trigger slot
    magwellLow, magTop,
    cutters.pocketW(GRV, FW - 2.3, 10), cutters.pocketW(GRV, -(FW - 2.3), 10),
    sideChamfer(GRVc, FW, 0.3), sideChamfer(GRVc, -FW, 0.3),
    cutters.box([152, -37.6, 0], [5, 4.4, 40]),                            // rail cross slots (2.2 deep)
    cutters.box([166, -37.6, 0], [5, 4.4, 40]),
  ]);
  g.add(fr, 'polymer');

  // ---- grip: rounded cross-section (back strap r 9.5, front strap r 7, bottom r 3), narrowing into the frame at the
  // top and tapering 30 -> 28.5 mm towards the bottom; the back strap sweeps up into the tang without a corner
  const gripPts = [[9.5, -31.5, 6], [frontAt(-29), -29, 2], [...G(23.9, -50), 40], [TOE[0], TOE[1], 4], [HEEL[0], HEEL[1], 8],
    [...G(-38.4, -66), 40], [backAt(-42), -42, 16]];
  const gripR = (s, t) => {
    const u = U(s, t), v = Vv(s, t);
    let r = 7 + 2.5 * sstep((-2 - u) / 10);                // 9.5 at the back strap, 7 at the front strap
    r += (3 - r) * sstep((-82 - v) / 7);                   // small at the bottom edge
    r += (3.5 - r) * sstep((t + 37) / 5);                  // small where it disappears into the frame
    return r;
  };
  const slab = roundSlab(makeShape(gripPts).getPoints(12).map((p) => [p.x, p.y]), { H: GH, R: gripR, K: 3, maxSeg: 3, capEdge: 9 });
  // checkered side panels: recessed PD into the flats, 3 mm smooth border inside the rounded edges, r6 corners,
  // top edge parallel to the frame (t -46), bottom edge square to the rake (v -83)
  const BORDER = 3, TTOP = -46, VBOT = -83;
  const ub = (v) => stripU(slab.cap, v)[0] + BORDER, uf = (v) => stripU(slab.cap, v)[1] - BORDER;
  const vBT = solve((v) => G(ub(v), v)[1] - TTOP, -70, -10), vFT = solve((v) => G(uf(v), v)[1] - TTOP, -70, -5);
  const panelPts = [[...G(ub(VBOT), VBOT), 6]];
  for (let v = VBOT + 10; v < vBT - 6; v += 10) panelPts.push([...G(ub(v), v), 14]);
  panelPts.push([...G(ub(vBT), vBT), 6], [...G(uf(vFT), vFT), 6]);
  for (let v = vFT - 10; v > VBOT + 6; v -= 10) panelPts.push([...G(uf(v), v), 14]);
  panelPts.push([...G(uf(VBOT), VBOT), 6]);
  const panelPoly = makeShape(panelPts).getPoints(8).map((p) => [p.x, p.y]);
  const pocket = taperW(merge([cutters.pocketW(panelPts, GH - PD, 10), cutters.pocketW(panelPts, -(GH - PD), 10)]));
  let grip = taperW(slab.geo);
  grip = cutx('grip', grip, [magwell, flare, cutters.box([backAt(-88.5) + 1.2, -88.5, 0], [5.4, 2.8, 40]), pocket]);
  g.add(grip, 'polymer');
  g.add(cyl(-6, 6, 1.1, { seg: 12 }).rotateY(Math.PI / 2).translate(0, -88.5, -(backAt(-88.5) + 1.8)), 'steel_dark'); // lanyard pin

  // checkering: low pyramids (pitch 1.8 = 20 lpi / 0.28 high, lines at 45 deg) filling the panel floors, and the flat middle of
  // the front and back straps
  const CKR = 0.9, CKH = 0.28;
  const S = soup();
  const panelUV = panelPoly.map(([s, t]) => [U(s, t), Vv(s, t)]);
  const uvs = panelUV.map((p) => p[0]), vvs = panelUV.map((p) => p[1]);
  const [u0, u1, v0, v1] = [Math.min(...uvs), Math.max(...uvs), Math.min(...vvs), Math.max(...vvs)];
  const A = [CR, -SR, 0], B = [SR, CR, 0];                   // u and v directions in side view
  for (let j = 0, v = v0; v <= v1; j++, v += CKR) {
    for (let u = u0 + (j % 2) * CKR; u <= u1; u += 2 * CKR) {
      if (!pointInPoly([u, v], panelUV) || distToPoly([u, v], panelUV) < CKR + 0.3) continue;
      const [s, t] = G(u, v);
      for (const sg of [1, -1]) pyramid(S, [s, t, sg * (GH - PD)], [0, 0, sg], A, B, CKR, CKH);
    }
  }
  // straps: walk the outline, one row every CKR of arc length, alternate rows offset by CKR across the strap
  const P = slab.P, nP = P.length;
  const rowsOn = (inside) => {
    let acc = 0, j = 0;
    for (let i = 0; i < nP; i++) {
      const a = P[i], b = P[(i + 1) % nP];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const T = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      for (; acc < L; acc += CKR) {
        const p = [a[0] + T[0] * acc, a[1] + T[1] * acc];
        if (!inside(p[0], p[1])) continue;
        const wl = GH - Math.max(slab.R[i], slab.R[(i + 1) % nP]) - 1.0 - CKR;
        for (let w = -wl + (j % 2) * CKR; w <= wl + 1e-6; w += 2 * CKR) pyramid(S, [p[0], p[1], w], [T[1], -T[0], 0], [T[0], T[1], 0], [0, 0, 1], CKR, CKH);
        j++;
      }
      acc -= L;
    }
  };
  if (DBG) console.log('  panel pyramids', S.pos.length / 36);
  rowsOn((s, t) => U(s, t) < -20 && Vv(s, t) > VBOT + 4 && t < -48);       // back strap
  if (DBG) console.log('  + back strap', S.pos.length / 36);
  rowsOn((s, t) => U(s, t) > 12 && Vv(s, t) > VBOT && t < -71);        // front strap (below the guard / mag release)
  if (DBG) console.log('  + front strap', S.pos.length / 36);
  g.add(taperW(S.geo()), 'polymer_grip');

  // trigger guard: oversized for gloves (opening 22 mm tall), squared and serrated front
  let guard = profile([[66, -30, 0], [131.8, -30, 0], [131.8, -40, 2.5], [129.6, -60, 6], [118, -65, 8], [86, -65, 6], [74, -63, 5], [66, -53, 0]], {
    w: 9.6, bevel: 1.6, bevelSeg: 2, curveSeg: 8,
    holes: [[[74, -36.6, 0], [123.5, -36.6, 0], [124.2, -41, 2], [122.6, -54, 4.5], [114, -58.5, 5], [80, -58.4, 4], [73, -55, 0]]],
  });
  guard = cutx('guard', guard, [magwell,
    merge([-43, -45.6, -48.2, -50.8, -53.4].map((t) => cutters.box([131.8 + (t + 40) * (2.2 / 20), t, 0], [1.6, 1.1, 14]))),
  ]);
  g.add(guard, 'polymer');

  // magazine release: ambidextrous paddle saddled over the rear-bottom of the guard (0.4 mm seam all round), its wings
  // covering the guard bar's sides, rounded underside and a downward lip at the front for the trigger finger
  let paddle = intersect(
    profile([[73.6, -60.4, 0.6], [84.8, -60.4, 2.0], [89.4, -64.4, 1.6], [88.8, -67.8, 1.0], [85.5, -68.2, 2], [80, -67.4, 4], [73.6, -65.6, 1.5]],
      { w: 13.6, bevel: 0.5, bevelSeg: 1, curveSeg: 5 }),
    section([[-6.8, -60.2, 0.6], [6.8, -60.2, 0.6], [6.6, -63.4, 2.2], [4.0, -68.6, 3.0], [-4.0, -68.6, 3.0], [-6.6, -63.4, 2.2]], 70, 92, { bevel: 0, curveSeg: 5 }));
  paddle = cutx('mag release', paddle, profile([[65.6, -29.6], [132.2, -29.6], [132.2, -40], [130, -60.4, 6], [118, -65.4, 8], [86, -65.4, 6], [74, -63.4, 5], [65.6, -53]],
    { w: 10.4, bevel: 0 }));
  g.add(paddle, 'polymer');

  // pins (the left trigger-pin head sits under the slide-stop arm)
  g.add(pin(95.5, -31, FW, 1.5), 'steel_dark');                              // trigger pin (right)
  g.add(pin(112, -27.2, FW, 1.9), 'steel_dark');                            // slide-stop axle end (right)
  for (const w of [FW, -FW]) g.add(pin(128, -27.4, w, 1.3), 'steel_dark');  // locking insert pin
  for (const w of [FW, -FW]) g.add(pin(17, -27.6, w, 1.25), 'steel_dark');  // rear insert pin

  // serial plate (right side of the dust cover) — steel insert moulded into the polymer, etched number
  g.add(profile([[139, -28.2, 0.6], [161, -28.2, 0.6], [161, -23.6, 0.6], [139, -23.6, 0.6]], { w: 0.8, cw: FW - 0.15, bevel: 0.2, bevelSeg: 1, curveSeg: 3 }), 'steel_bright');
  g.add(etch('WD0451', { o: [141.4, -27.1, FW + 0.25], X: [1, 0, 0], Y: [0, 1, 0], n: [0, 0, 1], h: 2.3, sw: 0.3 }), 'steel_dark');

  // ======================================================================================== SLIDE STOP (left, own part)
  // 2.6 mm arm with a raised, grooved thumb pad; rotates about its axle so the pad rises into the slide's notch
  const latch = g.part('latch', { pivot: [112, -27.2, -FW], extras: { axis: 'w', up: -6 } });
  const LW0 = -FW, LW1 = -(FW + 2.6);
  latch.add(profile([[115, -23.4, 2], [78, -22.8, 1.5], [66, -23, 2], [62.5, -25, 2], [63, -29.4, 2], [74, -29.6, 2], [108, -30.8, 3], [115.5, -30, 3]],
    { w: 2.6, cw: (LW0 + LW1) / 2, bevel: 0.3, bevelSeg: 1, curveSeg: 5 }), 'steel_dark');
  let pad = profile([[62.6, -22.8, 1.6], [75, -22.8, 1.6], [75, -29.6, 1.6], [62.8, -29.4, 1.6]], { w: 1.4, cw: LW1 - 0.6, bevel: 0.3, bevelSeg: 1, curveSeg: 4 });
  pad = cutx('latch pad', pad, merge([0, 1, 2, 3].map((i) => cutters.box([65.2 + i * 2.5, -26.2, LW1 - 1.4], [0.8, 9, 0.9]))));
  latch.add(pad, 'steel_dark');
  latch.add(cylW(112, -27.2, LW1 + 0.2, LW1 - 0.5, 2.2, { seg: 20, b: 0.2 }), 'steel_dark');   // axle head

  // ======================================================================================== TRIGGER
  // sits forward in the big guard (double-action rest: finger face at s ~ 100)
  const trig = g.part('trigger', { pivot: [95.5, -31, 0] });
  trig.add(profile('M 93.1 -30 L 99.5 -30 Q 98.4 -43.5 102.4 -54.6 Q 102.7 -56.8 100.4 -56.4 Q 93.9 -50 92.9 -38 Z', { w: 6.4, bevel: 1.3, bevelSeg: 2, curveSeg: 10 }), 'polymer');

  // ======================================================================================== HAMMER (decocked / forward)
  const ham = g.part('hammer', { pivot: [2, -26, 0] });
  let hm = profile([[-3.6, -30.6, 3], [7, -30.6, 3], [6.8, -23, 1.5], [5.0, -20.6, 0.4], [5.0, 1.4, 0.6], [-0.3, 1.8, 0.6], [-0.6, 5.4, 1.5],
    [-3, 8.2, 2.6], [-7.8, 8.2, 2.8], [-10.2, 4.6, 2.2], [-9.2, -0.4, 2], [-4.4, -4.6, 3], [-4.6, -22, 1]], {
    w: 7.4, bevel: 0.45, bevelSeg: 1, curveSeg: 6, holes: [circle(-5.4, 3.4, 1.9)],
  });
  const hc = [-5.4, 3.4];
  hm = cutx('hammer', hm, [merge([70, 92, 114, 136, 158].map((a) =>
    box([hc[0] + 5.0 * Math.cos(a * DEG), hc[1] + 5.0 * Math.sin(a * DEG), 0], [0.9, 2.4, 10], { r: 0, rot: [a - 90, 0, 0] })))]);
  ham.add(hm, 'steel_dark');

  // ======================================================================================== CONTROL LEVER (selector: safe / fire / decock)
  // ambidextrous: 2.6 mm plates, 3.4 mm grooved thumb paddle, hub on the hammer axis
  const sel = g.part('selector', { pivot: [2, -26, 0] });
  let paddleR = profile([[19, -22.3, 2], [31.6, -23.5, 2.2], [31, -30.2, 2.2], [19, -30, 2]], { w: 3.4, cw: FW + 1.7, bevel: 0.3, bevelSeg: 1, curveSeg: 5 });
  paddleR = cutx('lever pad', paddleR, merge([0, 1, 2, 3].map((i) => cutters.box([22 + i * 2.5, -26.3, FW + 3.4], [0.8, 9, 1.0]))));
  const lever = merge([
    cylW(2, -26, FW, FW + 3.0, 4.2, { seg: 22, b: 0.3 }),                                                 // hub
    profile([[2, -22.6, 1.5], [22, -23.2, 1.5], [22, -29.6, 1.5], [2, -29.8, 1.5]], { w: 2.6, cw: FW + 1.3, bevel: 0.3, bevelSeg: 1, curveSeg: 4 }),
    paddleR,
    cylW(2, -26, FW + 3.0, FW + 3.5, 1.4, { seg: 16, b: 0.2 }),                                           // axle boss
  ]);
  sel.add(merge([lever, mirror(lever)]), 'steel_dark');

  // ======================================================================================== MAGAZINE (12 rd, double stack)
  const mag = g.part('mag', { pivot: PIV, extras: { drop: true, dropDir: [0, -CR, SR] } });
  const MW = 11.3;
  let mbody = profile([[45, -110.4, 1.2], [81, -110.4, 1.2], [81, -30, 2], [77, -27.6, 2], [45, -26, 1]], { w: 2 * MW, bevel: 1.1, curveSeg: 4 });
  mbody = cutx('mag', mbody, [merge([-46, -58, -70, -82].map((t) => cyl(40, 48.2, 1.4, { t, b: 0, seg: 12 })))]);  // witness holes
  mag.add(tilt(mbody), 'steel_dark');
  const lip = section([[8.0, -19.4, 0.5], [MW, -20.8, 0.8], [MW, -27.2, 0], [MW - 1.1, -27.2, 0], [MW - 1.1, -21.6, 0.3], [8.0, -20.5, 0.3]], 45.4, 66, { bevel: 0.3, curveSeg: 4 });
  mag.add(tilt(merge([lip, mirror(lip)])), 'steel_dark');
  // floorplate: 0.5 mm seam under the tube, rounded rear flush with the magwell mouth, forward finger lip, sides
  // tapering 26.6 -> 24.6 mm towards the bottom
  const floor = intersect(
    profile([[43.0, -110.9, 0.8], [81.4, -110.9, 0.8], [84.8, -111.3, 1.2], [86.6, -112.8, 1.0], [86.4, -116.6, 0.9], [84.0, -117.0, 1.0], [81.6, -115.2, 1.2], [46.5, -115.0, 2.4], [43.0, -113.2, 2.2]],
      { w: 26.6, bevel: 1.0, bevelSeg: 2, curveSeg: 5 }),
    section([[-13.3, -110.6, 0.6], [13.3, -110.6, 0.6], [12.2, -117.4, 1.4], [-12.2, -117.4, 1.4]], 40, 90, { bevel: 0, curveSeg: 4 }));
  mag.add(tilt(floor), 'polymer');
  // top cartridge (.45 ACP, rimless) riding on the right lip
  const cw0 = 2.9, ct0 = -19.2;
  mag.add(tilt(lathe([[45.7, 0], [45.7, 5.5], [46.1, 6.05], [46.9, 6.05], [47.1, 5.1], [48.2, 5.1], [48.6, 6.0], [68.4, 6.0], [68.5, 5.75], [68.5, 0]], { t: ct0, w: cw0, seg: 20 })), 'brass');
  mag.add(tilt(lathe([[68.4, 0], [68.4, 5.72], [71, 5.72], [74, 5.15], [76.4, 3.9], [77.7, 2.3], [78.1, 0]], { t: ct0, w: cw0, seg: 20 })), 'copper');

  // ======================================================================================== SOCKETS / META
  g.socket('muzzle', [MUZ, 0, 0]);
  g.socket('eject', [103, 7, SW], { dir: [-0.15, 0.55, 1] });
  g.socket('grip_r', [...G(-6, -52), 0], { rot: [0, 0, -RAKE] });
  g.socket('grip_l', [...G(-2, -74), -13], { rot: [0, 0, -RAKE] });
  g.socket('magwell', [...G(0, -94), 0]);
  g.socket('charge', [21.5, 0, 0]);                 // middle of the rear serrations
  g.socket('sight_rear', [9.6, RT, 0]);      // notch top
  g.socket('sight_front', [172.6, FPT, 0]);  // front post top flat
  g.meta({
    grip: 'pistol', support: 'pistol_cup', reload: 'mag_pistol', chargeSide: 'rear',
    notes: 'Hammer modelled decocked (forward); cock = rotate hammer ~+55 deg about local X (spur swings back), ' +
      'it falls forward on fire. Selector (ambi control lever) pivots on the hammer axis: safe = +12 deg, decock = -15 deg about local X, ' +
      'springs back to fire. Trigger: DA pull ~ -14 deg about local X (blade swings back). Slide travel 30 mm. ' +
      'Part "barrel" (pivot at the locking lug) may tilt ~2.5 deg while the slide is back (+2.5 deg about local X drops the chamber end). ' +
      'Part "latch" = slide stop (left), pivot on its axle: rotate -6 deg about local X (extras.up) to raise the pad into the slide notch at slide lock, ' +
      'the thumb pushes it back down to drop the slide. Magazine drops along its 19 deg rake (extras.dropDir, three space).',
  });

  // ---- bake post-process: matte nitride slide with wear only on the sight edges, nose corners and serration lands,
  // small steel parts barely worn, roll marks uniform bare metal, polymer softened
  const chamfer = (t, w) => Math.abs(0.7974 * (Math.abs(w) - SW) + 0.6034 * (t - 4.6)) < 0.03;  // top chamfer planes
  const slideWear = (s, t, w, v) => v * (
    t > ST + 0.3 && (s < 17 || s > 170) ? 0.3                                                // sights
    : s > MUZ - 9 ? (Math.abs(w) > SW - 3 || t > 7 || t < SB + 1.5 ? 0.4 : 0.06)            // nose corners
    : s > 7.5 && s < 35.5 && Math.abs(w) > SW - 0.9 && t < 6 ? 0.2                             // serration lands
    : s < 1 ? 0.12                                                                           // rear face edges
    : 0.1);
  const rules = {
    'slide:steel_dark': slideWear,                                                         // slide, sights, extractor
    'slide:steel_bright': () => 1,
    'slide:paint_white': (s, t, w, v) => v * 0.2,
    'barrel:steel_dark': (s, t, w, v) => v * 0.35,
    'barrel:steel_bright': () => 1,
    'body:polymer': (s, t, w, v) => v * 0.5,
    'body:polymer_grip': (s, t, w, v) => v * 0.3,
    'body:steel_dark': (s, t, w, v) => v * 0.3,
    'body:steel_bright': (s, t, w, v) => v * 0.4,
    'latch:steel_dark': (s, t, w, v) => v * 0.3,
    'selector:steel_dark': (s, t, w, v) => v * 0.3,
    'hammer:steel_dark': (s, t, w, v) => v * 0.3,
    'trigger:polymer': (s, t, w, v) => v * 0.4,
    'mag:steel_dark': (s, t, w, v) => v * 0.45,
    'mag:polymer': (s, t, w, v) => v * 0.5,
  };
  const flats = {
    // slide flanks, top flat, top chamfers and rear face (big CSG-cut faces)
    'slide:steel_dark': (s, t, w) => (s > -0.5 && s < MUZ - 9 && t > SB + 0.5 && t < ST + 0.02 && (
      Math.abs(Math.abs(w) - SW) < 0.02 || (Math.abs(t - ST) < 0.02 && Math.abs(w) < 7.7) || chamfer(t, w)))
      || (s < 0.03 && s > -0.5 && t < 4.6 && t > SB + 1),                                    // rear face
    // grip flats and checkered panel floors / frame side faces
    'body:polymer': (s, t, w) => (t < -40 && Math.abs(w) > (GH - PD - 0.03) * fW(t) && pointInPoly([s, t], slab.cap) && distToPoly([s, t], slab.cap) > 0.3)
      || (t > -37.4 && t < -22 && s > -2 && Math.abs(Math.abs(w) - FW) < 0.02),
    'latch:steel_dark': (s, t, w) => Math.abs(Math.abs(w) - (FW + 2.6)) < 0.02,
    'selector:steel_dark': (s, t, w) => Math.abs(Math.abs(w) - (FW + 2.6)) < 0.02,
  };
  const build0 = g.build.bind(g);
  g.build = (opts) => { const root = build0(opts); tuneWear(g, root, rules, flats); return root; };
  return g;
}
