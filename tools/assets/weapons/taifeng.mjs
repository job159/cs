// 颱風眼．斬浪 Typhoon-Eye Tidecleaver — 異能 E07 two-handed weather-instrument greatsword (docs/PREMIUM_WEAPONS.md E07,
// 05d §8.2). A single-edged broad cleaver blade (1,400 mm overall, 1,050 mm blade, 62 -> 40 mm wide, 7 mm thick) carrying
// a sealed wind tunnel and the instruments of a weather station:
//   - blade: one lofted solid (gunmetal faces, a mirror-bright 4 mm edge bevel on a crisp grind line, a 0.5 mm edge
//     land), a sheepsfoot point with a short sharpened clip on the spine; a cyan light line set in a lipped groove along
//     the grind line (glow_cyan), a brass strip inlaid along the spine
//   - 風洞槽: a 680 x 14 mm slot cut through the blade (CSG), two glass panes sandwiching the wind core fx_core (pv_core,
//     cyan-white, streaming towards the tip), a raised brass frame on screws, three flow-straightener stays
//   - ricasso: 等壓線 isobars inlaid in brass round a low, the tropical-cyclone mark in the eye (original weather-map
//     motif); two wavy isobars run on along the spine flat past the vanes
//   - 導流板 fx_vaneL / fx_vaneR: two 220 x 24 x 3 mm trailing-edge flaps on rails along the spine (slide 18 mm out past
//     the spine, then hinge out 12°: an air brake), brass lips, hinge knuckles, rivets and a cyan slit
//   - 風速計 fx_rotor: a three-cup anemometer riding a bearing ring round the blade root (Ø12 bosses, 60 mm arms, Ø28 cups),
//     on a tsuba-like bearing housing with a fluted rim and a bolt circle; spins about the blade axis
//   - guard: a gunmetal block with airfoil quillons (brass ferrules and acorn finials); on the playside the aneroid
//     barometer (Ø48 x 10 brass case, knurled bezel, glass, enamel dial engraved 1000 / 980 / 960 / 940 hPa with a fair /
//     storm band, a brass set hand, the needle fx_needle, the storm lamp fx_lamp); on the far side a brass cartouche with
//     the cyclone mark
//   - grip: 360 mm, two hands: leather core under a tight leather cord wrap, three-strand turk's-head braids, brass
//     ferrules and a mid ring; pommel: a Ø40 fluted brass counterweight with a compass-cyclone end cap
// Side-view mm: t along the sword (tip +t), s = edge direction (the cutting edge +s, the spine -s), w = flat normal (+w
// faces the player in first person). Grip at the origin like a pistol grip (the viewmodel's hand conventions).
import * as THREE from 'three';
import { toCreasedNormals, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';
import { Gun, V, profile, merge, cut } from '../lib/gunkit.mjs';
import { helixCord, along, slotScrew } from '../lib/sculpt.mjs';
import { bakeMeshes } from '../lib/bake.mjs';
import { postBake } from './m4.mjs';

const D2R = Math.PI / 180;
const TAU = Math.PI * 2;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, u) => a + (b - a) * u;
const smooth = (a, b, x) => { const u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); };
const fin = (geo, crease = 30) => {
  for (const k of Object.keys(geo.attributes)) if (k !== 'position') geo.deleteAttribute(k);
  return toCreasedNormals(geo.index ? geo.toNonIndexed() : geo, crease * D2R);
};
/** indexed mesh from [s, t, w] points + triangle index list */
function mesh(pts, idx, crease = 30) {
  const g = new THREE.BufferGeometry();
  const a = new Float32Array(pts.length * 3);
  pts.forEach(([s, t, w], i) => { a[i * 3] = w; a[i * 3 + 1] = t; a[i * 3 + 2] = -s; });
  g.setAttribute('position', new THREE.BufferAttribute(a, 3));
  g.setIndex(idx);
  return fin(g, crease);
}
/** signed area of a closed [x, y] loop (> 0 counter-clockwise) */
function loopArea(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
/** signed volume of a closed triangle soup (three space) */
function volume(geo) {
  const p = geo.attributes.position.array; let v = 0;
  for (let i = 0; i < p.length; i += 9) v += p[i] * (p[i + 4] * p[i + 8] - p[i + 5] * p[i + 7]) - p[i + 1] * (p[i + 3] * p[i + 8] - p[i + 5] * p[i + 6]) + p[i + 2] * (p[i + 3] * p[i + 7] - p[i + 4] * p[i + 6]);
  return v / 6;
}
/** reverses the winding (non-indexed: swaps the 2nd and 3rd vertex of every triangle, normals with them) */
function flip(geo) {
  if (geo.index) { const a = geo.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } return geo; }
  for (const k of ['position', 'normal']) {
    const p = geo.attributes[k]?.array;
    if (p) for (let i = 0; i < p.length; i += 9) for (let c = 0; c < 3; c++) { const t = p[i + 3 + c]; p[i + 3 + c] = p[i + 6 + c]; p[i + 6 + c] = t; }
  }
  return geo;
}
/** a closed solid wound outward (positive volume) */
function outward(geo, crease = 40) { return volume(geo) < 0 ? fin(flip(geo), crease) : geo; }
/** loft of closed rings (each ring: [s, t, w] points, same count) with optional end caps (fan to the centroid) */
function loftRings(rings, { close = true, capA = false, capB = false, crease = 30 } = {}) {
  const n = rings[0].length, pts = [], idx = [];
  for (const r of rings) pts.push(...r);
  const m = close ? n : n - 1;
  for (let i = 0; i + 1 < rings.length; i++) for (let j = 0; j < m; j++) {
    const a = i * n + j, b = i * n + (j + 1) % n, c = (i + 1) * n + j, d = (i + 1) * n + (j + 1) % n;
    idx.push(a, c, b, b, c, d);
  }
  const cap = (ri, f) => {
    const r = rings[ri], c = r.reduce((o, p) => [o[0] + p[0] / n, o[1] + p[1] / n, o[2] + p[2] / n], [0, 0, 0]);
    const ci = pts.length; pts.push(c);
    for (let j = 0; j < n; j++) { const a = ri * n + j, b = ri * n + (j + 1) % n; f ? idx.push(ci, a, b) : idx.push(ci, b, a); }
  };
  if (capA) cap(0, true);
  if (capB) cap(rings.length - 1, false);
  const g = mesh(pts, idx, crease);
  return capA && capB ? outward(g, crease) : g;
}
/** smooth round tube along [s, t, w] points (wires, cords) */
function tubeAlong(points, r, { seg = 32, radial = 6, closed = false, tension = 0.5 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => V(...p)), closed, 'catmullrom', tension);
  const geo = new THREE.TubeGeometry(curve, seg, r, radial, closed);
  geo.deleteAttribute('uv');
  return geo.toNonIndexed();
}
/** LatheGeometry with its profile turned counter-clockwise (faces out); closed profiles must come out with + volume */
function latheCCW(pts, seg, phase, what) {
  const P = loopArea(pts) < 0 ? [...pts].reverse() : pts;
  const g = new THREE.LatheGeometry(P.map(([r, t]) => new THREE.Vector2(Math.max(0, r), t)), seg, phase);
  const closed = (P[0][0] <= 1e-6 && P.at(-1)[0] <= 1e-6) || (P[0][0] === P.at(-1)[0] && P[0][1] === P.at(-1)[1]);
  if (closed && volume(g.toNonIndexed()) <= 0) throw new Error(`taifeng: ${what} lathe is inside-out`);
  return g;
}
/** revolve [[r, t], ...] about the t axis (the sword axis), oval by ks (s) / kw (w), centred on (s, w) */
function revT(pts, { seg = 32, ks = 1, kw = 1, s = 0, w = 0, phase = 0, crease = 40, what = 'revT' } = {}) {
  const g = latheCCW(pts, seg, phase, what);
  g.scale(kw, 1, ks);
  g.translate(w, 0, -s);
  return fin(g, crease);
}
/** revolve about the w axis (bezels, dials, screw heads on a flat): [[r, dw], ...] from the face at (s, t, w0), outward sd */
function revW(pts, at, sd = 1, { seg = 24, crease = 40, what = 'revW' } = {}) {
  const g = latheCCW(pts, seg, 0, what);
  g.rotateZ(-Math.PI / 2);            // lathe axis y -> +x (= w)
  if (sd < 0) { g.scale(-1, 1, 1); flip(g); }
  const c = V(...at);
  g.translate(c.x, c.y, c.z);
  return fin(g, crease);
}
/** mirror across the w = 0 plane (the other flat); scale() mirrors the normals already */
function mirW(geo) { const g = geo.clone(); g.scale(-1, 1, 1); return flip(g); }
const both = (geo) => (geo ? [geo, mirW(geo)] : []);
/** drops near-duplicate consecutive points (earcut chokes on them) */
function dedupe(pts, eps = 0.02) {
  const out = [];
  for (const p of pts) { const q = out[out.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > eps) out.push(p); }
  if (out.length > 2 && Math.hypot(out[0][0] - out.at(-1)[0], out[0][1] - out.at(-1)[1]) <= eps) out.pop();
  return out;
}
/** closed polygon offset (miter), d > 0 grows it */
function offsetPoly(pts, d) {
  const n = pts.length, sg = loopArea(pts) > 0 ? 1 : -1;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const e1 = [p[0] - a[0], p[1] - a[1]], e2 = [b[0] - p[0], b[1] - p[1]];
    const l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1;
    const n1 = [e1[1] / l1, -e1[0] / l1], n2 = [e2[1] / l2, -e2[0] / l2];
    const m = [n1[0] + n2[0], n1[1] + n2[1]], ml = Math.hypot(...m) || 1;
    const k = d * sg / Math.max(0.35, (m[0] * n1[0] + m[1] * n1[1]) / ml);
    return [p[0] + (m[0] / ml) * k, p[1] + (m[1] / ml) * k];
  });
}
/** ribbon polygon of width wd round an open polyline (mitred joints) */
function strokePoly(pts0, wd) {
  const pts = dedupe(pts0, 0.01), n = pts.length, L = [], R = [];
  const dir = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
  for (let i = 0; i < n; i++) {
    const p = pts[i], d0 = i > 0 ? dir(pts[i - 1], p) : null, d1 = i < n - 1 ? dir(p, pts[i + 1]) : null;
    let nx, ny, k = 1;
    if (d0 && d1) {
      const m = [d0[0] + d1[0], d0[1] + d1[1]], ml = Math.hypot(...m) || 1;
      nx = -m[1] / ml; ny = m[0] / ml;
      k = 1 / Math.max(0.45, nx * -d1[1] + ny * d1[0]);
    } else { const d = d0 || d1; nx = -d[1]; ny = d[0]; }
    L.push([p[0] + nx * wd / 2 * k, p[1] + ny * wd / 2 * k]); R.push([p[0] - nx * wd / 2 * k, p[1] - ny * wd / 2 * k]);
  }
  return [...L, ...R.reverse()];
}
/**
 * Plate on a flat face: top cap + side walls of poly [[s, t]...] (and holes) from z0 to z1 above the face w0 (sd = the
 * outward side). Inlays, frames, enamel fields, glass panes (bottom: true closes it underneath).
 */
function slab(poly, w0, sd, z0, z1, holes = [], { walls = true, bottom = false, crease = 40 } = {}) {
  const loops = [dedupe(poly), ...holes.map((h) => dedupe(h))].filter((l) => l.length >= 3);
  if (!loops.length || Math.abs(loopArea(loops[0])) < 1e-4) return null;
  const v2 = (l) => l.map(([x, y]) => new THREE.Vector2(x, y));
  const tris = THREE.ShapeUtils.triangulateShape(v2(loops[0]), loops.slice(1).map(v2));
  const flat = loops.flat(), n = flat.length, P = [], I = [], E = [];
  for (const [x, y] of flat) P.push([x, y, w0 + sd * z1]);
  for (const [x, y] of flat) P.push([x, y, w0 + sd * z0]);
  for (const [a, b, c] of tris) { I.push(a, b, c); E.push([0, 0, sd]); }
  if (bottom) for (const [a, b, c] of tris) { I.push(n + a, n + c, n + b); E.push([0, 0, -sd]); }
  if (walls) {
    let o = 0;
    loops.forEach((l, li) => {
      const m = l.length, sg = (loopArea(l) > 0 ? 1 : -1) * (li ? -1 : 1);
      for (let i = 0; i < m; i++) {
        const j = (i + 1) % m, p = l[i], q = l[j], e = [(q[1] - p[1]) * sg, -(q[0] - p[0]) * sg, 0];
        I.push(o + i, o + j, n + o + j, o + i, n + o + j, n + o + i); E.push(e, e);
      }
      o += m;
    });
  }
  for (let k = 0; k < E.length; k++) {
    const a = P[I[3 * k]], b = P[I[3 * k + 1]], c = P[I[3 * k + 2]];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], e = E[k];
    if (nn[0] * e[0] + nn[1] * e[1] + nn[2] * e[2] < 0) { const t = I[3 * k + 1]; I[3 * k + 1] = I[3 * k + 2]; I[3 * k + 2] = t; }
  }
  return mesh(P, I, crease);
}
const WIRE = 100;   // sub-millimetre wires shade as one rounded bead
const inlayLine = (pts, w0, sd, wd = 0.5, z0 = -0.1, z1 = 0.4) => slab(strokePoly(pts, wd), w0, sd, z0, z1, [], { crease: WIRE });
const inlayRing = (poly, w0, sd, wd = 0.6, z0 = -0.1, z1 = 0.4) => { const p = dedupe(poly); return slab(offsetPoly(p, wd / 2), w0, sd, z0, z1, [offsetPoly(p, -wd / 2)], { crease: WIRE }); };
/** small domed stud / rivet on a flat face */
const stud = (s, t, w0, sd, r, h = r * 0.6, seg = 10) => revW([[0, 0], [r, 0], [r * 0.92, h * 0.45], [r * 0.6, h * 0.85], [0, h]], [s, t, w0], sd, { seg });
const arcPts = (cs, ct, r, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => { const a = (a0 + (a1 - a0) * i / n) * D2R; return [cs + r * Math.cos(a), ct + r * Math.sin(a)]; });
/** capsule outline (stadium) between end centres A and B, radius r */
function capsulePoly(A, B, r, n = 12) {
  const dx = B[0] - A[0], dy = B[1] - A[1], a = Math.atan2(dy, dx) / D2R;
  return [...arcPts(B[0], B[1], r, a - 90, a + 90, n), ...arcPts(A[0], A[1], r, a + 90, a + 270, n)];
}
/** maps geometry built round a local origin (local x = w normal, y = up, z = -right) onto a face frame (three vectors) */
function onFrame(geo, origin, right, up, normal) {
  const m = new THREE.Matrix4().makeBasis(normal, up, right.clone().negate());
  if (m.determinant() < 0) { geo.scale(1, 1, -1); flip(geo); m.makeBasis(normal, up, right); }
  geo.applyMatrix4(m);
  geo.translate(origin.x, origin.y, origin.z);
  return fin(geo, 60);
}
const addAll = (target, byMat) => { for (const [m, list] of Object.entries(byMat)) if (list.length) target.add(merge(list.filter(Boolean)), m); };
const push = (o, k, ...g) => { (o[k] ||= []).push(...g.filter(Boolean)); };

// ---- a stroke font for the dial (digits, h P a): polylines in a 1 x 1.6 box, origin at the lower left
const GLYPH = {
  0: [[[0.5, 0], [0.12, 0.12], [0, 0.8], [0.12, 1.48], [0.5, 1.6], [0.88, 1.48], [1, 0.8], [0.88, 0.12], [0.5, 0], [0.12, 0.12]]],
  1: [[[0.25, 1.25], [0.6, 1.6], [0.6, 0]], [[0.25, 0], [0.95, 0]]],
  2: [[[0.05, 1.3], [0.3, 1.58], [0.7, 1.58], [0.95, 1.3], [0.92, 1.0], [0.05, 0], [1, 0]]],
  4: [[[0.75, 0], [0.75, 1.6], [0, 0.45], [1, 0.45]]],
  6: [[[0.9, 1.45], [0.6, 1.6], [0.25, 1.5], [0.05, 1.0], [0.05, 0.45], [0.25, 0.05], [0.65, 0.05], [0.95, 0.35], [0.9, 0.75], [0.6, 0.9], [0.25, 0.85], [0.05, 0.6]]],
  8: [[[0.5, 0.88], [0.15, 1.05], [0.12, 1.42], [0.5, 1.6], [0.88, 1.42], [0.85, 1.05], [0.5, 0.88], [0.08, 0.62], [0.1, 0.18], [0.5, 0], [0.9, 0.18], [0.92, 0.62], [0.5, 0.88]]],
  9: [[[0.1, 0.15], [0.4, 0], [0.75, 0.1], [0.95, 0.6], [0.95, 1.15], [0.75, 1.55], [0.35, 1.55], [0.05, 1.25], [0.1, 0.85], [0.4, 0.7], [0.75, 0.75], [0.95, 1.0]]],
  h: [[[0.05, 1.6], [0.05, 0]], [[0.05, 0.7], [0.35, 0.95], [0.75, 0.95], [0.95, 0.7], [0.95, 0]]],
  P: [[[0.05, 0], [0.05, 1.6], [0.6, 1.6], [0.95, 1.4], [0.95, 1.0], [0.6, 0.8], [0.05, 0.8]]],
  a: [[[0.1, 0.9], [0.4, 1.0], [0.8, 0.9], [0.9, 0.6], [0.9, 0]], [[0.9, 0.5], [0.4, 0.55], [0.1, 0.4], [0.1, 0.12], [0.4, 0], [0.9, 0.2]]],
};
/** a text line of glyph polylines centred at (s, t), cap height h (mm), advance 0.82 h */
function textStrokes(txt, cs, ct, h) {
  const k = h / 1.6, adv = h * 0.82, w = (txt.length - 1) * adv + k, out = [];
  [...txt].forEach((ch, i) => { for (const pl of GLYPH[ch] || []) out.push(pl.map(([x, y]) => [cs - w / 2 + i * adv + x * k, ct - h / 2 + y * k])); });
  return out;
}

// ------------------------------------------------------------------------------------------ blade law (mm)
// The card's real-sword section (62 -> 40 x 7, slot 14) is drawn ~1.75x across (110 -> 72 x 9, slot 20): §1.1 allows a
// viewmodel 1.3-1.6x the visual volume of its realistic counterpart, the user wants an exaggerated greatsword, and at
// 62 mm the blade read as a rapier at arm's length in first person.
const T0 = 100, TT = 1150, TP = 1000, TC = 1070;  // blade foot (in the shoulder socket), tip, point region, clip
const HT = 4.5;                                   // half thickness (9 mm)
const SL0 = 232, SL1 = 912, SLR = 10;             // 風洞槽 680 x 20
const VA0 = 300, VA1 = 520;                       // 導流板 span
const sbOf = (t) => (t <= TP ? -53 + 16 * clamp01((t - T0) / (TP - T0)) : t <= TC ? -37 : lerp(-37, -16, Math.pow((t - TC) / (TT - TC), 1.1)));   // spine
const seOf = (t) => (t <= TP ? 57 - 22 * (t - T0) / (TP - T0) : lerp(35, -16, Math.pow((t - TP) / (TT - TP), 1.7)));                            // edge
const htOf = (t) => (t <= TP ? HT : HT * (1 - 0.72 * Math.pow((t - TP) / (TT - TP), 1.4)));
const scOf = (t) => seOf(t) - 46.4;               // slot centre line (parallel to the edge; the spine side keeps the vanes)
const F = (sd, z = 0) => sd * (HT + z);          // a face of the blade (sd = side) lifted by z
/** section at t: spine, edge, half thickness, grind line, flat end (primary bevel start), clip bevel width */
function bladeAt(t) {
  const sb = sbOf(t), se = seOf(t), W = Math.max(0.01, se - sb), ht = htOf(t), k = Math.min(1, W / 72);
  const sgl = se - 5 * k, spf = sgl - 22 * k;                  // edge bevel 5 mm, primary bevel 22 mm (scaled in the point)
  const room = spf - sb, fe = t <= TC ? 0 : Math.min(0.7 * room, 15 * Math.pow((t - TC) / (TT - TC), 0.6) * Math.min(1, W / 36));
  return { sb, se, W, ht, sgl, spf, fe, ch: Math.min(0.9, 0.3 * room), hg: Math.min(ht * 0.9, 1.4 * Math.max(0.5, k)), he: Math.min(0.3, ht * 0.3) };
}
/** blade surface half thickness at (s, t) on the faces (for parts laid on the bevel) */
function surfW(s, t) {
  const b = bladeAt(t);
  if (s >= b.sgl) return lerp(b.hg, b.he, (s - b.sgl) / Math.max(0.01, b.se - b.sgl));
  if (s >= b.spf) return lerp(b.ht, b.hg, (s - b.spf) / Math.max(0.01, b.sgl - b.spf));
  return b.ht;
}

export default function build() {
  const g = new Gun('taifeng');

  // ======================================================================== blade (one loft, the slot cut, split by finish)
  {
    const ts = [T0, T0 + 6, T0 + 16, T0 + 30, T0 + 50, T0 + 75, T0 + 100, SL0 - 8, SL0, SL0 + 8];
    for (let t = SL0 + 30; t < SL1; t += 30) ts.push(t);
    ts.push(SL1 - 8, SL1, SL1 + 8);
    for (let t = SL1 + 20; t < TP; t += 20) ts.push(t);
    ts.push(TP - 4, TP, TP + 6);
    for (let t = TP + 14; t < TC; t += 14) ts.push(t);
    ts.push(TC - 1, TC + 1);
    for (let i = 1; i <= 18; i++) ts.push(TC + (TT - 0.6 - TC) * (1 - Math.pow(1 - i / 18, 1.25)));
    const T = [...new Set(ts.map((t) => Math.round(t * 100) / 100))].sort((a, b) => a - b);
    const ring = (t) => {
      const b = bladeAt(t);
      // upper half edge -> spine: edge land, grind line, flat start, spine corner (or the clip bevel), spine
      const top = [[b.se, b.he], [b.sgl, b.hg], [b.spf, b.ht], [b.sb + Math.max(b.ch, b.fe), b.ht], [b.sb, b.fe > 0 ? Math.max(b.he, (b.ht - b.ch) * (1 - clamp01(b.fe / 6))) : b.ht - b.ch]];
      const pts = [...top.map(([s, w]) => [s, t, w]), ...top.slice().reverse().map(([s, w]) => [s, t, -w])];
      return pts;
    };
    let solid = loftRings(T.map(ring), { capA: true, capB: true, crease: 20 });
    // the wind tunnel: a capsule through the blade along the slot centre line
    const cap = capsulePoly([scOf(SL0 + SLR), SL0 + SLR], [scOf(SL1 - SLR), SL1 - SLR], SLR, 14);
    solid = cut(solid, [profile(cap.map(([s, t]) => [s, t]), { w: 30, bevel: 0, curveSeg: 1 })]);
    // finish zones by triangle: the edge bevel (and the clip's) mirror bright, the rest gunmetal
    const P = solid.attributes.position.array, zones = { edge: [], face: [] };
    for (let i = 0; i < P.length; i += 9) {
      const w = (P[i] + P[i + 3] + P[i + 6]) / 3, t = (P[i + 1] + P[i + 4] + P[i + 7]) / 3, s = -(P[i + 2] + P[i + 5] + P[i + 8]) / 3;
      const b = bladeAt(t);
      const edge = s > b.sgl - 0.08 || (b.fe > 0.6 && s < b.sb + b.fe - 0.08 && Math.abs(w) < b.ht - 0.02);
      zones[edge ? 'edge' : 'face'].push(i);
    }
    const pick = (list) => {
      const a = new Float32Array(list.length * 9);
      list.forEach((i, k) => a.set(P.subarray(i, i + 9), k * 9));
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(a, 3));
      return fin(geo, 22);
    };
    g.add(pick(zones.face), 'steel_dark');
    g.add(pick(zones.edge), 'steel_bright');
  }

  // ---- the cyan light line: a lipped groove insert along the grind line on both faces (glow is a part, not paint)
  {
    const glow = [], lip = [];
    const T = []; for (let t = T0 + 16; t <= TP + 40; t += 12) T.push(t);
    const strip = (s0, s1, lift) => {
      const pts = [], idx = [];
      T.forEach((t, i) => {
        const b = bladeAt(t), a = b.sgl - s0, c = b.sgl - s1;
        pts.push([a, t, surfW(a, t) + lift], [c, t, surfW(c, t) + lift]);
        if (i) { const o = (i - 1) * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
      });
      return mesh(pts, idx, 50);
    };
    glow.push(...both(strip(1.8, 3.2, 0.07)));
    for (const [a, b] of [[1.2, 1.7], [3.3, 3.8]]) lip.push(...both(strip(a, b, 0.17)));
    // the strips face +w (and their mirrors -w): orientation check through a probe normal
    g.add(merge(glow.map((x) => faceUp(x))), 'glow_cyan');
    g.add(merge(lip.map((x) => faceUp(x))), 'steel_bright');
  }

  // ---- brass strip inlaid along the spine (the back flat)
  {
    const rings = [];
    for (let t = T0 + 14; t <= TC - 8; t += 24) { const sb = sbOf(t); rings.push([[sb - 0.35, t, 1.2], [sb + 0.2, t, 1.5], [sb + 0.2, t, -1.5], [sb - 0.35, t, -1.2]]); }
    g.add(loftRings(rings, { capA: true, capB: true, crease: 50 }), 'brass');
  }

  // ======================================================================== 風洞槽: glass, core, frame, stays, screws
  {
    const A = [scOf(SL0 + SLR), SL0 + SLR], B = [scOf(SL1 - SLR), SL1 - SLR];
    const cap = capsulePoly(A, B, SLR, 14);
    // glass panes 1 mm under each face, the wind core between them
    g.add(merge(both(slab(offsetPoly(cap, -0.05), HT - 2.0, 1, 0, 0.9, [], { bottom: true, crease: 60 }))), 'glass_clear');
    const core = g.part('fx_core', { pivot: [scOf(572), 572, 0], extras: { hero: true, pv: { preset: 'pv_core', coreMode: 5, coreAxis: 1, coreScale: 1 } } });
    core.add(slab(offsetPoly(cap, -0.2), -0.55, 1, 0, 1.1, [], { bottom: true, crease: 60 }), 'obsidian');
    // raised brass frame (overlaps the slot by 0.4 mm so the pane edges hide), three stays, screws
    const frame = {}, outerF = offsetPoly(cap, 3.0), innerF = offsetPoly(cap, -0.45);
    for (const sd of [1, -1]) {
      push(frame, 'brass', slab(outerF, F(sd), sd, -0.15, 0.75, [innerF], { crease: 35 }));
      // a fine bead round the outside of the frame
      push(frame, 'brass', inlayRing(offsetPoly(cap, 3.4), F(sd), sd, 0.5, -0.1, 0.5));
      for (const t of [402, 572, 742]) {
        const sc = scOf(t), e = SLR + 1.9;
        push(frame, 'brass', slab([[sc - e, t - 1.9], [sc + e, t - 1.9], [sc + e, t + 1.9], [sc - e, t + 1.9]], F(sd), sd, -0.15, 1.05, [], { crease: 35 }));
        push(frame, 'steel_bright', stud(sc - e + 1.3, t, F(sd, 1.05), sd, 0.9, 0.5, 8), stud(sc + e - 1.3, t, F(sd, 1.05), sd, 0.9, 0.5, 8));
      }
      // screws on the frame band: both ends and every ~75 mm alternating sides
      const sp = [[A[0], A[1] - SLR - 1.4], [B[0], B[1] + SLR + 1.4]];
      for (let t = SL0 + 90, k = 0; t < SL1 - 60; t += 75, k++) sp.push([scOf(t) + (k % 2 ? 1 : -1) * (SLR + 1.4), t]);
      for (const [s, t] of sp) push(frame, 'steel_bright', slotScrewW(s, t, F(sd, 0.75), sd, 1.05));
    }
    addAll(g, frame);
  }

  // ======================================================================== ricasso: 等壓線 isobars round a low, the cyclone mark
  {
    const iso = {};
    const c0 = [-14, 168];
    for (const sd of [1, -1]) {
      for (let i = 0; i < 4; i++) {
        const rs = 9 + 6.5 * i, rt = 10 + 13 * i, pts = [];
        for (let k = 0; k < 72; k++) {
          const a = k / 72 * TAU, wob = 1 + 0.07 * Math.sin(3 * a + i * 1.3) + 0.045 * Math.sin(5 * a + 2.1 * i);
          pts.push([c0[0] + Math.cos(a) * rs * wob, c0[1] + Math.sin(a) * rt * wob]);
        }
        push(iso, 'brass', inlayRing(pts, F(sd), sd, 0.55, -0.1, 0.32));
      }
      // the tropical-cyclone mark: a ring with two hooked arms (counter-clockwise inflow)
      push(iso, 'brass', inlayRing(arcPts(c0[0], c0[1], 2.6, 0, 345, 24).slice(0, 24), F(sd), sd, 1.0, -0.1, 0.45));
      for (const f of [1, -1]) {
        const arm = Array.from({ length: 9 }, (_, k) => { const u = k / 8, a = (f > 0 ? 0 : 180) + 150 * u; return [c0[0] + Math.cos(a * D2R) * (2.6 + 3.6 * u), c0[1] + Math.sin(a * D2R) * (2.6 + 3.6 * u) * 1.2]; });
        push(iso, 'brass', inlayLine(arm, F(sd), sd, lerpArr(1.0, 0.45, 9), -0.1, 0.45));
      }
      push(iso, 'brass', stud(c0[0], c0[1], F(sd), sd, 1.1, 0.7, 12));
      // station plots (weather-map wind barbs: a ring, the staff, feathers 10 / 5 kt, a pennant 50 kt) on the spine flat
      for (const [t0, full, half, pen] of [[560, 1, 1, 0], [650, 2, 0, 0], [740, 3, 1, 0], [830, 0, 0, 1]]) {
        const s0 = sbOf(t0) + 23, L = 20, st = [[s0, t0 + 2.2], [s0 - 2.5, t0 + L]];
        push(iso, 'brass', inlayRing(arcPts(s0, t0, 2.0, 0, 330, 12).slice(0, 12), F(sd), sd, 0.55, -0.1, 0.35), inlayLine(st, F(sd), sd, 0.5, -0.1, 0.32));
        const dir = [(st[1][0] - st[0][0]) / L, (st[1][1] - st[0][1]) / L], nrm = [dir[1], -dir[0]];
        let k = 0;
        const at = (u) => [st[1][0] - dir[0] * u, st[1][1] - dir[1] * u];
        if (pen) { const a = at(0), b = at(4.2); push(iso, 'brass', slab([a, b, [a[0] + nrm[0] * 6.5, a[1] + nrm[1] * 6.5 + 1.5]], F(sd), sd, -0.1, 0.32, [], { crease: 40 })); k = 1.4; }
        for (let i = 0; i < full; i++, k++) { const a = at(k * 2.8); push(iso, 'brass', inlayLine([a, [a[0] + nrm[0] * 7 + dir[0] * 2.5, a[1] + nrm[1] * 7 + dir[1] * 2.5]], F(sd), sd, 0.45, -0.1, 0.3)); }
        for (let i = 0; i < half; i++, k++) { const a = at(k * 2.8 + 0.6); push(iso, 'brass', inlayLine([a, [a[0] + nrm[0] * 3.6 + dir[0] * 1.3, a[1] + nrm[1] * 3.6 + dir[1] * 1.3]], F(sd), sd, 0.45, -0.1, 0.3)); }
      }
      // past the slot: the eye of the storm -- a three-arm cyclone spiral inlaid in brass, a ring of pressure ticks
      {
        const t0 = 968, b = bladeAt(t0), c = [(b.sb + b.spf) / 2 + 2, t0];
        for (let k = 0; k < 3; k++) { const arm = []; for (let i = 0; i <= 18; i++) { const u = i / 18, a = k * 120 + 210 * u, r = 2.8 + 12 * u; arm.push([c[0] + Math.cos(a * D2R) * r, c[1] + Math.sin(a * D2R) * r * 1.25]); } push(iso, 'brass', inlayLine(arm, F(sd), sd, 0.7, -0.1, 0.38)); }
        push(iso, 'brass', inlayRing(arcPts(c[0], c[1], 2.4, 0, 345, 20).slice(0, 20), F(sd), sd, 0.8, -0.1, 0.42));
        for (let i = 0; i < 16; i++) { const a = i / 16 * 360; push(iso, 'brass', inlayLine([[c[0] + Math.cos(a * D2R) * 17, c[1] + Math.sin(a * D2R) * 21], [c[0] + Math.cos(a * D2R) * (i % 4 ? 18.6 : 20), c[1] + Math.sin(a * D2R) * (i % 4 ? 23 : 24.8)]], F(sd), sd, 0.45, -0.1, 0.3)); }
      }
      // a fine brass line on the strip between the slot frame and the grind (the slot's whole length)
      { const pts = []; for (let t = SL0 - 6; t <= SL1 + 6; t += 8) pts.push([seOf(t) - 30.2, t]); push(iso, 'brass', inlayLine(pts, F(sd), sd, 0.45, -0.1, 0.28)); }
      // isobars running on along the spine flat past the vanes
      for (const [o, f, ph] of [[7, 23, 0], [15, 31, 1.4]]) {
        const pts = [];
        for (let t = VA1 + 18; t <= SL1 - 6; t += 4) pts.push([sbOf(t) + o + 1.3 * Math.sin(t / f + ph), t]);
        push(iso, 'brass', inlayLine(pts, F(sd), sd, 0.5, -0.1, 0.3));
      }
    }
    addAll(g, iso);
  }

  // ======================================================================== 導流板 vanes on rails along the spine
  {
    const body = {};
    for (const sd of [1, -1]) {
      // rails + end stops (revealed when the vanes slide out)
      for (const o of [5, 23]) {
        const rail = [];
        for (let t = VA0 - 6; t <= VA1 + 6; t += 22) { const s = sbOf(t) + o; rail.push([s - 1.5, t], [s + 1.5, t]); }
        const poly = [...rail.filter((_, i) => i % 2 === 0), ...rail.filter((_, i) => i % 2 === 1).reverse()];
        push(body, 'steel_dark', slab(poly, F(sd), sd, -0.1, 0.9, [], { crease: 35 }));
      }
      for (const t of [VA0 - 10, VA1 + 10]) { const s = sbOf(t); push(body, 'steel', slab([[s + 1, t - 2.2], [s + 27, t - 2.2], [s + 27, t + 2.2], [s + 1, t + 2.2]], F(sd), sd, -0.1, 1.6, [], { crease: 35 })); }
      const vane = g.part(sd > 0 ? 'fx_vaneR' : 'fx_vaneL', { pivot: [sbOf(410), 410, sd * (HT + 0.9)], extras: { side: sd, slide: 18, flap: 12, order: sd > 0 ? 0 : 1 } });
      const parts = {};
      const outline = [];
      const sbA = sbOf(VA0), sbB = sbOf(VA1);
      // swept trailing edge, rounded corners
      outline.push([sbA + 1.2, VA0 + 4, 3], [sbA + 25, VA0 + 10, 4], [sbB + 29, VA1 - 6, 4], [sbB + 1.2, VA1, 3]);
      const pl = profile(outline, { w: 3, cw: sd * (HT + 0.9 + 1.5), bevel: 0.9, bevelSeg: 2, curveSeg: 3 });
      // the cyan slit through the vane (a glow strip set into it)
      const slit = [[sbA + 14.5, VA0 + 40, 0.9], [sbB + 16.5, VA1 - 40, 0.9]];
      const slitPoly = capsulePoly(slit[0], slit[1], 1.0, 6);
      push(parts, 'steel_bright', cut(pl, [profile(slitPoly, { w: 20, cw: sd * (HT + 2.4), bevel: 0, curveSeg: 1 })]));
      push(parts, 'glow_cyan', slab(offsetPoly(slitPoly, -0.15), F(sd, 0.9), sd, 0.4, 1.6, [], { bottom: true, crease: 60 }));
      // brass lip along the spine side, hinge knuckles, rivets
      const lipPts = []; for (let t = VA0 + 2; t <= VA1 - 2; t += 20) lipPts.push([sbOf(t) + 1.4, t, sd * (HT + 2.6)]);
      push(parts, 'brass', tubeAlong(lipPts, 1.45, { seg: 24, radial: 8 }));
      for (const t of [VA0 + 30, 410, VA1 - 30]) push(parts, 'brass', revT([[0, -5], [1.9, -5], [2.3, -4.4], [2.3, 4.4], [1.9, 5], [0, 5]], { s: sbOf(t) + 1.4, w: sd * (HT + 2.6), seg: 12 }).translate(0, t, 0));
      // a row of vortex generators (small brass fins) behind the lip
      for (let i = 0; i < 7; i++) { const t = VA0 + 34 + i * 25, s0 = sbOf(t) + 5.5; push(parts, 'brass', slab([[s0, t - 2.6], [s0 + 4.2, t + 1.8], [s0 + 3.4, t + 2.6], [s0 - 0.6, t - 1.6]], F(sd, 3.9), sd, -0.1, 1.6, [], { crease: 35 })); }
      for (const t of [VA0 + 18, VA0 + 82, VA1 - 82, VA1 - 18]) for (const o of [8, 24]) push(parts, 'steel_bright', stud(sbOf(t) + o, t, F(sd, 3.9), sd, 0.75, 0.4, 8));
      addAll(vane, parts);
    }
    addAll(g, body);
  }

  // ======================================================================== the mast (neck) + 風速計 rotor + shoulder socket
  {
    const hs = {};
    // a round mast between the guard and the blade shoulders: a collar, the bearing race, the rotor's retaining cap, a
    // fluted upper neck flaring into the shoulder socket
    const neck = revT([[0, 26], [15.5, 26], [16.6, 34], [16.6, 38.6], [20.6, 39.6], [21.4, 41.2], [21.4, 44.4], [20.2, 46], [17.2, 46.4], [17.2, 50.2],
      [16.4, 51], [16.4, 64.6], [17.4, 65.6], [17.4, 74], [16.6, 75], [16.6, 90], [18.6, 94], [22, 98], [0, 98]], { seg: 96, what: 'mast' });
    push(hs, 'steel', fluteT(neck, 16.6, 76.5, 88.5, 24, 0.7));
    push(hs, 'brass', revT([[16.8, 50.0], [19.2, 50.0], [19.8, 50.8], [19.2, 52.2], [16.8, 52.2], [16.6, 51.1]], { seg: 64, what: 'race' }));
    push(hs, 'brass', revT([[16.6, 62.4], [19.8, 62.4], [20.6, 63.2], [20.6, 66.2], [19.8, 67.0], [16.6, 67.0]], { seg: 64, what: 'cap' }));
    // bolt circle on the collar, set screws in the retaining cap
    for (let i = 0; i < 8; i++) {
      const a = (i + 0.5) / 8 * TAU, r = 19;
      push(hs, 'steel_bright', along([[-0.2, 0], [-0.2, 1.3], [0.45, 1.2], [0.85, 0.8], [0.95, 0]], [Math.cos(a) * r, 46.2, Math.sin(a) * r], [0, 1, 0], 10, 60));
    }
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4; push(hs, 'steel_bright', along([[-0.3, 0], [-0.3, 1.1], [0.5, 1.0], [0.7, 0]], [Math.cos(a) * 20.4, 64.7, Math.sin(a) * 20.4], [Math.cos(a), 0, Math.sin(a)], 10, 60)); }
    // shoulder socket: flares from the mast to the blade root and grips its foot between two cheeks
    const sh = [[-14, 88, 2], [14, 88, 2], [33, 96, 7], [61, 106, 4], [60, 114, 2], [-56, 114, 2], [-57, 106, 4], [-31, 96, 7]];
    push(hs, 'steel', profile(sh, { w: 17, bevel: 1.8, bevelSeg: 3, curveSeg: 4 }));
    for (const sd of [1, -1]) {
      push(hs, 'brass', inlayLine([[-55, 112.6], [59, 112.6]], sd * 8.5, sd, 1.1, -0.2, 0.55));
      push(hs, 'brass', inlayLine([[-29, 97.5], [-12, 90.6], [12, 90.6], [31, 97.5], [57, 107]], sd * 8.5, sd, 0.6, -0.2, 0.4));
      for (const s0 of [-42, 46]) push(hs, 'steel_bright', stud(s0, 107, sd * 8.5, sd, 1.6, 1.0, 12));
      push(hs, 'steel_bright', slotScrewW(2, 101, sd * 8.5, sd, 1.9));
    }
    addAll(g, hs);
    // the anemometer: a brass ring on the race, three Ø12 bosses, 60 mm arms, Ø28 cups opening along the tangent
    const RT = 57.3;
    const rotor = g.part('fx_rotor', { pivot: [0, RT, 0], extras: { spin: 't', rate: 150 } });
    const rp = {};
    push(rp, 'brass', revT([[19.9, 52.6], [25.6, 52.6], [26.8, 53.8], [26.8, 55.4], [26.0, 56.2], [26.8, 57.0], [26.8, 60.8], [25.6, 62.0], [19.9, 62.0], [19.5, 57.3]], { seg: 72, what: 'rotor ring' }));
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * TAU + 0.3, c = Math.cos(a), sn = Math.sin(a), dirR = [c, 0, sn], tan = [-sn, 0, c];
      const P = (r, dt = 0) => [c * r, RT + dt, sn * r];
      // Ø12 boss, the tapered arm, a clamp collar, the cup bracket
      push(rp, 'brass', along([[0, 0], [0, 6], [5.6, 6], [6.6, 4.6], [6.6, 0]], P(25.8), dirR, 16, 50));
      push(rp, 'steel_bright', along([[0, 0], [0, 3.6], [52, 2.5], [53, 0]], P(31.6), dirR, 12, 40));
      push(rp, 'brass', along([[0, 0], [0, 3.6], [3.4, 3.6], [3.4, 0]], P(54), dirR, 12, 50));
      push(rp, 'brass', along([[0, 0], [0, 3.2], [4.0, 3.2], [4.0, 0]], P(81.4), dirR, 12, 50));
      // the cup: a brass shell opening along the tangent (it catches the wind), a rolled rim, glazed inside; the arm
      // meets the back of its side wall 4.5 mm behind the rim
      const cc = P(98.5).map((v, k) => v + tan[k] * 4.5), cup = cupShell();
      push(rp, 'brass', aim(cup.outer, cc, tan, dirR));
      push(rp, 'porcelain', aim(cup.inner, cc, tan, dirR));
    }
    addAll(rotor, rp);
  }

  // ======================================================================== guard: gunmetal block, airfoil quillons, barometer
  {
    const gd = {};
    const BW = 12.5;   // block half thickness
    const blockOutline = [[-36, -16, 5], [36, -16, 5], [44, 4, 7], [40, 28, 5], [24, 36, 4], [-24, 36, 4], [-40, 28, 5], [-44, 4, 7]];
    push(gd, 'steel', profile(blockOutline, { w: BW * 2, bevel: 1.8, bevelSeg: 3, curveSeg: 4 }));
    // a recessed panel line round the face (both sides) and the throat where the blade enters
    for (const sd of [1, -1]) push(gd, 'steel_dark', inlayRing(offsetPoly(blockOutline.map(([s, t]) => [s, t]), -4.2), sd * BW, sd, 0.9, -0.3, 0.12));
    // quillons: airfoil sections swept a little towards the blade, brass ferrules and acorn finials
    for (const f of [1, -1]) {
      const rings = [];
      const S = [38, 46, 56, 68, 80, 92, 102, 108];
      for (const s of S) {
        const u = (s - 38) / 70, tc = 8 + 7 * Math.pow(u, 1.5), ht = lerp(12, 7.5, u), hw = lerp(8.4, 5.6, u), ring = [];
        for (let j = 0; j < 20; j++) {
          const a = j / 20 * TAU, x = Math.cos(a), y = Math.sin(a);
          // airfoil: blunt towards the blade (+t), a fine trailing edge towards the grip, a ridge on the flats
          const tt = x > 0 ? x * ht : x * ht * 1.15, ww = y * hw * (x < 0 ? 0.55 + 0.45 * Math.sqrt(1 - x * x) : 1) * (1 + 0.08 * Math.pow(Math.abs(y), 6));
          ring.push([f * s, tc + tt, ww]);
        }
        rings.push(ring);
      }
      const q = loftRings(rings, { capA: true, capB: true, crease: 35 });
      push(gd, 'steel', q);
      // a brass wire along each flat of the quillon (on its ridge), two bands before the finial
      for (const sd of [1, -1]) {
        const wire = S.slice(1, -1).map((sx) => { const u = (sx - 38) / 70; return [f * sx, 8 + 7 * Math.pow(u, 1.5) + 1.2, sd * (lerp(8.4, 5.6, u) * 1.06 + 0.15)]; });
        push(gd, 'brass', tubeAlong(wire, 0.55, { seg: 20, radial: 5 }));
      }
      for (const sx of [94, 99]) { const u = (sx - 38) / 70; push(gd, 'brass', along([[0, 0], [0, lerp(12, 7.5, u) * 0.86], [2.2, lerp(12, 7.5, u) * 0.86], [2.2, 0]], [f * sx, 8 + 7 * Math.pow(u, 1.5) + 0.8, 0], [f, 0.1, 0], 20, 45)); }
      // ferrule at the root and the finial
      push(gd, 'brass', along([[0, 0], [0, 12.4], [1, 13.2], [5, 13.2], [6, 12.4], [6, 0]], [f * 38.5, 8.3, 0], [f, 0.06, 0], 24, 45));
      const tip = [f * 106.5, 8 + 7 * Math.pow(68.5 / 70, 1.5), 0];
      push(gd, 'brass', along([[0, 0], [0, 6.6], [2.5, 7.4], [3.6, 6.8], [4.4, 7.2], [9, 6.2], [13, 3.6], [15.2, 1.2], [15.6, 0]], tip, [f, 0.12, 0], 24, 45));
      push(gd, 'brass', along([[0, 0], [0, 1.4], [1.6, 1.0], [2.1, 0]], [tip[0] + f * 15.4, tip[1] + 1.8, 0], [f, 0.12, 0], 10, 60));
    }
    // four slotted screws on the playside face round the barometer, rivets on the far side
    for (const [s, t] of [[-35, -8], [35, -8], [-31, 27], [31, 27]]) push(gd, 'steel_bright', slotScrewW(s, t, BW, 1, 1.5));
    // far side: a brass cartouche with the cyclone mark, on four rivets
    const cart = [[-20, -4, 3], [20, -4, 3], [26, 10, 2], [20, 24, 3], [-20, 24, 3], [-26, 10, 2]];
    push(gd, 'brass', profile(cart, { w: 1.8, cw: -(BW + 0.7), bevel: 0.6, curveSeg: 3 }));
    for (const [s, t] of [[-19, 0], [19, 0], [-19, 20], [19, 20]]) push(gd, 'steel_bright', stud(s, t, -(BW + 1.6), -1, 1.1, 0.7, 10));
    {
      const c = [0, 10], w0 = -(BW + 1.6);
      push(gd, 'brass', inlayRing(arcPts(c[0], c[1], 3.4, 0, 350, 28).slice(0, 28), w0, -1, 1.2, -0.1, 0.7));
      for (const f of [1, -1]) {
        const arm = Array.from({ length: 10 }, (_, k) => { const u = k / 9, a = (f > 0 ? 0 : 180) + 160 * u; return [c[0] + Math.cos(a * D2R) * (3.4 + 6.5 * u), c[1] + Math.sin(a * D2R) * (3.4 + 6.5 * u)]; });
        push(gd, 'brass', inlayLine(arm, w0, -1, lerpArr(1.3, 0.5, 10), -0.1, 0.7));
      }
    }
    addAll(g, gd);

    // ---- the barometer (playside): case, knurled bezel, dial, ticks, numerals, bands, set hand, glass
    const bm = {};
    const BC = [1, 9], W0 = BW;                   // centre on the block face
    push(bm, 'brass', revW([[0, -0.4], [24, -0.4], [24, 1.2], [24.6, 1.9], [24.6, 6.4], [23.4, 7.0], [21.3, 7.0], [21.3, 5.2], [0, 5.2]], [BC[0], BC[1], W0], 1, { seg: 64, what: 'case' }));
    // bezel ring with a knurled band (60 teeth)
    push(bm, 'brass', knurlRing(BC, W0 + 6.6, 21.2, 24.9, 3.2, 60));
    push(bm, 'porcelain', revW([[0, 5.0], [21.4, 5.0], [21.4, 5.35], [0, 5.35]], [BC[0], BC[1], W0], 1, { seg: 64, what: 'dial' }));
    const DW = W0 + 5.35;                       // the dial plane
    const ang = (hpa) => (1000 - hpa) * 2 * D2R;    // 20 hPa = 40°, falling pressure turns the needle anticlockwise
    const at = (hpa, r) => [BC[0] - Math.sin(ang(hpa)) * r, BC[1] + Math.cos(ang(hpa)) * r];
    // fair band (1000 -> 1020, cobalt), storm band (940 -> 900, vermilion), enamel arcs in brass channels
    const band = (h0, h1, r0, r1) => { const pts = []; for (let k = 0; k <= 24; k++) pts.push(at(lerp(h0, h1, k / 24), r1)); for (let k = 24; k >= 0; k--) pts.push(at(lerp(h0, h1, k / 24), r0)); return pts; };
    push(bm, 'glaze_cobalt', slab(band(1000, 1020, 16.6, 18.4), DW, 1, -0.05, 0.12, [], { crease: 60 }));
    push(bm, 'glaze_vermilion', slab(band(900, 940, 16.6, 18.4), DW, 1, -0.05, 0.12, [], { crease: 60 }));
    // ticks: every 5 hPa, majors every 20
    for (let h = 900; h <= 1020; h += 5) {
      const major = h % 20 === 0, r0 = major ? 15.0 : 16.3;
      push(bm, 'steel_blued', inlayLine([at(h, r0), at(h, 19.3)], DW, 1, major ? 0.55 : 0.3, -0.05, 0.14));
    }
    push(bm, 'steel_blued', inlayRing(arcPts(BC[0], BC[1], 19.4, 0, 359, 72).slice(0, 72), DW, 1, 0.3, -0.05, 0.14));
    for (const h of [1000, 980, 960, 940]) { const [s, t] = at(h, 11.3); for (const pl of textStrokes(String(h), s, t, 2.6)) push(bm, 'steel_blued', inlayLine(pl, DW, 1, 0.3, -0.05, 0.12)); }
    for (const pl of textStrokes('hPa', BC[0], BC[1] - 7.5, 2.2)) push(bm, 'steel_blued', inlayLine(pl, DW, 1, 0.26, -0.05, 0.12));
    // the storm lamp seat (dark glass in a brass bezel; fx_lamp lights it)
    const LP = [BC[0], BC[1] - 13.2];
    push(bm, 'brass', revW([[1.6, 0], [2.6, 0], [2.6, 0.7], [2.1, 1.0], [1.6, 0.8]], [LP[0], LP[1], DW], 1, { seg: 20, what: 'lamp bezel' }));
    push(bm, 'crystal', revW([[0, 0], [1.7, 0], [1.5, 0.6], [0.9, 1.0], [0, 1.15]], [LP[0], LP[1], DW], 1, { seg: 16, what: 'lamp glass' }));
    // brass set hand (fixed at 1005) and the centre knob on the glass
    {
      const a = ang(1005), d = [-Math.sin(a), Math.cos(a)], n = [-d[1], d[0]];
      const P = (u, o) => [BC[0] + d[0] * u + n[0] * o, BC[1] + d[1] * u + n[1] * o];
      push(bm, 'brass', slab([P(-3, 0.5), P(15.5, 0.25), P(18.2, 0), P(15.5, -0.25), P(-3, -0.5)], DW + 1.6, 1, 0, 0.3, [], { crease: 60 }));
    }
    push(bm, 'glass_clear', revW([[0, 6.9], [21.4, 6.9], [21.0, 7.7], [16, 8.6], [8, 9.15], [0, 9.3], [0, 6.9]].map(([r, w]) => [r, w]), [BC[0], BC[1], W0], 1, { seg: 48, what: 'glass' }));
    push(bm, 'brass', revW([[0, 9.2], [2.6, 9.2], [2.9, 9.7], [2.6, 10.8], [1.8, 11.2], [0, 11.3]], [BC[0], BC[1], W0], 1, { seg: 20, what: 'knob' }));
    addAll(g, bm);
    // the needle: blued steel spade pointer (18 mm) with a counterweight ring, a brass cap
    const nd = g.part('fx_needle', { pivot: [BC[0], BC[1], DW + 0.8], extras: { open: 40, hinge: 'w', unit: '20 hPa' } });
    {
      const P = (s, t) => [BC[0] + s, BC[1] + t];
      const spade = [P(0, 18), P(0.75, 13.5), P(0.32, 12.5), P(0.42, 2), P(0.9, -1.5), P(1.6, -3.4), P(1.1, -5.6), P(0, -6.2), P(-1.1, -5.6), P(-1.6, -3.4), P(-0.9, -1.5), P(-0.42, 2), P(-0.32, 12.5), P(-0.75, 13.5)];
      nd.add(slab(spade, DW + 0.5, 1, 0, 0.28, [arcPts(BC[0], BC[1] - 3.7, 0.9, 360, 0, 12).slice(0, 12)], { bottom: true, crease: 40 }), 'steel_blued');
      nd.add(revW([[0, 0.3], [1.5, 0.3], [1.4, 0.75], [0.9, 1.05], [0, 1.15]], [BC[0], BC[1], DW + 0.5], 1, { seg: 16, what: 'needle cap' }), 'brass');
    }
    const lamp = g.part('fx_lamp', { pivot: [LP[0], LP[1], DW], extras: { restHidden: true, energy: true } });
    lamp.add(revW([[0, 0], [1.75, 0], [1.55, 0.62], [0.95, 1.04], [0, 1.2]], [LP[0], LP[1], DW + 0.02], 1, { seg: 16, what: 'lamp' }), 'glow_red');
  }

  // ======================================================================== grip: ferrules, leather core, cord wrap, turk's heads
  {
    const gp = {};
    const KW = 0.84;   // oval grip (narrower across the flat)
    push(gp, 'brass', revT([[0, -36], [17.6, -36], [18.6, -34.6], [18.6, -31.2], [17.8, -30.4], [18.6, -29.6], [18.6, -26.4], [20.6, -24.6], [21.4, -21.4], [20.8, -18.0], [0, -18.0]], { seg: 36, kw: KW, what: 'upper ferrule' }));
    push(gp, 'leather_black', revT([[0, -312], [15.2, -312], [15.8, -286], [16.2, -240], [15.7, -186], [15.2, -171], [15.7, -156], [16.2, -100], [15.9, -60], [15.2, -36], [0, -36]], { seg: 28, kw: KW, what: 'grip core' }));
    push(gp, 'brass', revT([[0, -176], [16.2, -176], [17.4, -174.6], [17.4, -167.4], [16.2, -166], [0, -166]], { seg: 32, kw: KW, what: 'mid ring' }));
    push(gp, 'brass', revT([[0, -320], [17.2, -320], [18.4, -318.6], [18.4, -311.4], [17.2, -310], [0, -310]], { seg: 32, kw: KW, what: 'lower ferrule' }));
    // the cord: one tight helix per hand (leather lace, 2.9 mm), scaled to the oval
    for (const [t0, t1] of [[-162, -41], [-305, -181]]) {   // t0 = the lower end (the helix rises)
      const pitch = 3.05, turns = (t1 - t0) / pitch;
      const h = helixCord(17.3, t0, turns, pitch, 1.48, { perTurn: 12, radial: 5 });
      h.scale(KW, 1, 1);
      push(gp, 'leather_grain', fin(h, 70));
      // three-strand turk's heads at both ends of the wrap
      for (const tk of [t0 - 1.6, t1 + 1.6]) push(gp, 'leather_grain', ...turksHead(tk, 17.4, KW));
    }
    addAll(g, gp);
  }

  // ======================================================================== pommel: fluted brass counterweight, cyclone end cap
  {
    const pm = {};
    const body = revT([[0, -322], [17.6, -322], [19.2, -323.6], [20, -327], [20, -347], [19, -351], [16.4, -354.4], [12.6, -356.2], [11.6, -356.4], [0, -356.4]], { seg: 96, what: 'pommel' });
    push(pm, 'brass', fluteT(body, 20, -345.5, -328.5, 24, 0.75));
    push(pm, 'steel_dark', revT([[0, -323.5], [18.0, -323.5], [18.0, -321.2], [0, -321.2]], { seg: 48, what: 'pommel washer' }));
    // end cap relief: a compass rose of four points under the cyclone mark
    const end = {};
    {
      const geoList = [];
      const c = [0, 0];
      const star = [];
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, r = i % 2 ? 2.8 : 8.6; star.push([Math.cos(a) * r, Math.sin(a) * r]); }
      geoList.push(slab(star, 0, 1, -0.1, 0.55, [], { crease: 20 }));
      geoList.push(inlayRing(arcPts(c[0], c[1], 2.2, 0, 345, 20).slice(0, 20), 0, 1, 0.9, 0.3, 0.95));
      for (const f of [1, -1]) {
        const arm = Array.from({ length: 9 }, (_, k) => { const u = k / 8, a = (f > 0 ? 0 : 180) + 150 * u; return [Math.cos(a * D2R) * (2.2 + 3.4 * u), Math.sin(a * D2R) * (2.2 + 3.4 * u)]; });
        geoList.push(inlayLine(arm, 0, 1, lerpArr(0.9, 0.4, 9), 0.3, 0.95));
      }
      for (const gg of geoList) if (gg) push(end, 'brass', onFrame(gg, V(0, -356.4, 0), V(1, 0, 0), V(0, 0, 1), V(0, -1, 0).normalize()));
    }
    addAll(g, pm); addAll(g, end);
  }

  // ======================================================================== sockets & meta
  g.socket('grip_r', [0, -66, 0], { rot: [0, 0, -6] });
  g.socket('grip_l', [0, -226, 0]);
  g.socket('base', [scOf(SL0) - 8, T0 + 40, 0]);
  g.socket('mid', [scOf(600) - 6, 600, 0]);
  g.socket('tip', [-14, TT - 6, 0]);
  g.socket('muzzle', [-14, TT - 6, 0]);
  g.socket('slot', [scOf(572), 572, 0]);
  g.socket('slot_lo', [scOf(300), 300, 0]);
  g.socket('slot_hi', [scOf(860), 860, 0]);
  g.socket('dial', [1, 9, 12.5 + 9.4]);
  g.socket('lamp', [1, 9 - 13.2, 12.5 + 6.4]);
  g.socket('rotor', [0, 57.3, 0]);
  g.socket('pommel', [0, -350, 0]);
  g.socket('edge_f', [seOf(640) + 3, 640, 0]);
  g.socket('edge_b', [sbOf(640) - 3, 640, 0]);
  g.socket('vane', [sbOf(410) - 8, 410, 0]);
  g.socket('guard_r', [118, 15, 0]);
  g.socket('guard_l', [-118, 15, 0]);
  g.meta({
    grip: 'melee', support: 'vertical', reload: 'none', series: 'summer',
    notes: 'E07 颱風眼．斬浪 greatsword. t = sword axis (tip +t), s = edge direction (spine -s), w = flat normal (+w to the player). '
      + 'fx_core: wind-tunnel core (pv_core, coreAxis 1: flows to the tip). fx_rotor: three-cup anemometer, spin t (setSpin). '
      + 'fx_needle: barometer needle, hinge w, extras.open 40° per unit (v = (1000 - hPa) / 20). fx_vaneL/R: flaps (extras.slide 18 mm '
      + 'along -s, then flap 12° about t, driven by the weapon). fx_lamp: storm lamp (restHidden).',
  });
  // bake: pre-tessellated (enamel / leather finer, metal coarser; thin slivers kept whole), glass and glow left out of the
  // occluders, low relief ignored on the big shells, then m4's post-bake (buried AO refill, per-material wear)
  g.build = (o = {}) => {
    const root = Gun.prototype.build.call(g, { ...o, bake: false });
    if (o.bake === false) return root;
    const meshes = [];
    root.traverse((m) => { if (m.isMesh && !/^(glass_|glow_)/.test(m.userData.mat)) meshes.push(m); });
    const tess = (o.tessellate ?? TESS) * 0.001;
    for (const m of meshes) {
      const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
      for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
      m.geometry = tessellateFat(geo, /^(glaze_|porcelain|leather)/.test(m.userData.mat) ? tess : tess * TESS_K, 0.0016);
    }
    if (o.tessOnly) return root;
    const relief = (m) => (/^(leather)/.test(m.userData.mat) ? 0.0016 : /^(steel|brass)/.test(m.userData.mat) ? 0.0012 : /^(glaze|porcelain)/.test(m.userData.mat) ? 0.0009 : 0);
    bakeMeshes(meshes, { tessellate: 0, aoDist: 0.022, rays: 32, log: true, minHeight: relief });
    postBake(root, { cos: 0.99999 }, WEAR);
    return root;
  };
  return g;
}

// ------------------------------------------------------------------------------------------ local builders
/** width list tapering a -> b over n points (inlayLine accepts a constant only: averaged) */
function lerpArr(a, b) { return (a + b) / 2; }
/** a strip built on the +w face may come out wound towards -w: turn it so its normals face away from the blade */
function faceUp(geo) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  let dot = 0;
  for (let i = 0; i < p.count; i++) dot += n.getX(i) * Math.sign(p.getX(i) || 1);
  return dot < 0 ? fin(flip(geo), 50) : geo;
}
/** slotted screw head on a flat face (w0, outward sd) */
function slotScrewW(s, t, w0, sd, r) { return slotScrew([s, t, w0], [0, 0, sd], r, r * 0.9); }
/** domed rivet on any surface normal n ([s, t, w]) */
function stud3(at, n, r) { return along([[-0.2, 0], [-0.2, r], [r * 0.4, r * 0.85], [r * 0.7, 0]], at, n, 10, 70); }
/** places geometry authored with its axis along +s (lathe) so that axis points along d, its +t towards up */
function aim(geo, at, d, up) {
  const D = V(...d).normalize(), U = V(...up).normalize(), X = new THREE.Vector3().crossVectors(U, D).normalize(), Y = new THREE.Vector3().crossVectors(D, X);
  const m = new THREE.Matrix4().makeBasis(X, Y, D.clone().negate());
  geo.applyMatrix4(m);
  const A = V(...at); geo.translate(A.x, A.y, A.z);
  return fin(geo, 50);
}
/** anemometer cup: an outer brass shell (dome + rolled rim) and an inner glazed liner; lathe along +s, opening at +s */
let _cup = null;
function cupShell() {
  if (!_cup) {
    // one closed shell (outer dome, rolled rim, inner bowl) lathed along +s; split by surface: the bowl is glazed
    const R = 14, prof = [];
    for (let i = 0; i <= 9; i++) { const a = (i / 9) * Math.PI / 2; prof.push([-R * Math.cos(a), R * Math.sin(a)]); }
    prof.push([0.3, R + 0.35], [1.0, R + 0.45], [1.4, R - 0.1], [1.0, R - 0.75], [0.2, R - 0.85]);
    for (let i = 9; i >= 0; i--) { const a = (i / 9) * Math.PI / 2, r = R - 1.0; prof.push([-r * Math.cos(a) - 0.05, r * Math.sin(a)]); }
    let g = new THREE.LatheGeometry(prof.map(([x, r]) => new THREE.Vector2(Math.max(0, r), x)), 24);
    g.rotateX(-Math.PI / 2);                     // lathe y -> -z (= +s)
    g = outward(fin(g, 50), 50);
    const P = g.attributes.position.array, sets = { outer: [], inner: [] };
    for (let i = 0; i < P.length; i += 9) {
      const x = (P[i] + P[i + 3] + P[i + 6]) / 3, y = (P[i + 1] + P[i + 4] + P[i + 7]) / 3, z = (P[i + 2] + P[i + 5] + P[i + 8]) / 3;
      sets[Math.hypot(x, y, z) < R - 0.5 && z > -0.1 ? 'inner' : 'outer'].push(i);
    }
    const pick = (list) => { const a = new Float32Array(list.length * 9); list.forEach((i, k) => a.set(P.subarray(i, i + 9), k * 9)); const q = new THREE.BufferGeometry(); q.setAttribute('position', new THREE.BufferAttribute(a, 3)); return fin(q, 50); };
    _cup = { outer: pick(sets.outer), inner: pick(sets.inner) };
  }
  return { outer: _cup.outer.clone(), inner: _cup.inner.clone() };
}
/** a knurled ring (bezel): n teeth round the w axis between radii ri..ro, height h above w0 */
function knurlRing(c, w0, ri, ro, h, n) {
  const pts = [], idx = [], N = n * 4;
  const prof = (k) => { const tooth = Math.abs(Math.cos(Math.PI * n * k / N)); return ro - 0.45 * (1 - tooth); };
  // rings: inner-bottom, inner-top, outer-top, outer-bottom per angle step
  for (let k = 0; k < N; k++) {
    const a = k / N * TAU, ca = Math.cos(a), sa = Math.sin(a), r = prof(k);
    const P = (rr, z) => [c[0] + ca * rr, c[1] + sa * rr, w0 + z];
    pts.push(P(ri, 0), P(ri, h), P(r - 0.35, h), P(r, h - 0.4), P(r, 0.3), P(r - 0.3, 0));
  }
  const m = 6;
  for (let k = 0; k < N; k++) for (let j = 0; j < m; j++) {
    const a = k * m + j, b = k * m + (j + 1) % m, cc = ((k + 1) % N) * m + j, d = ((k + 1) % N) * m + (j + 1) % m;
    idx.push(a, cc, b, b, cc, d);
  }
  return outward(mesh(pts, idx, 50), 50);
}
/** flutes cut into a revolved solid (around the t axis): radius rr between t0..t1, n flutes of depth d */
function fluteT(geo, rr, t0, t1, n, d) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, z);
    if (y < t0 || y > t1 || r < rr - 0.05) continue;
    const a = Math.atan2(z, x), k = smooth(t0, t0 + 1.5, y) * (1 - smooth(t1 - 1.5, t1, y));
    const f = Math.pow(Math.max(0, Math.cos(a * n)), 3) * d * k;
    p.setXYZ(i, x * (r - f) / r, y, z * (r - f) / r);
  }
  return fin(geo, 40);
}
/** three-strand turk's head round the grip at height t (radius R, oval kw): interleaved sinusoidal strands */
function turksHead(t, R, kw) {
  const out = [];
  for (let k = 0; k < 3; k++) {
    const pts = [];
    for (let i = 0; i < 90; i++) {
      const a = i / 90 * TAU, ph = k * TAU / 3, bights = 4;
      const tt = t + 2.3 * Math.sin(bights * a + ph), rr = R + 0.75 * Math.cos(2 * bights * a + ph * 2);
      pts.push([Math.cos(a) * rr, tt, Math.sin(a) * rr * kw]);
    }
    out.push(fin(tubeAlong(pts, 1.05, { seg: 90, radial: 5, closed: true }), 70));
  }
  return out;
}

const TESS = 14, TESS_K = 2.2;
/** bake tessellation of the triangles that need it (thin slivers kept whole) */
function tessellateFat(geo, maxEdge, thin) {
  const p = geo.attributes.position, n = geo.attributes.normal, keep = [], fat = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    const L = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
    const area = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
    (2 * area / Math.max(L, 1e-9) < thin ? keep : fat).push(i);
  }
  const pick = (list) => {
    const g = new THREE.BufferGeometry(), P = new Float32Array(list.length * 9), N = new Float32Array(list.length * 9);
    list.forEach((i, k) => { for (let j = 0; j < 3; j++) for (let d = 0; d < 3; d++) { P[k * 9 + j * 3 + d] = p.array[(i + j) * 3 + d]; N[k * 9 + j * 3 + d] = n.array[(i + j) * 3 + d]; } });
    g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    return g;
  };
  if (!fat.length) return geo;
  const t = new TessellateModifier(maxEdge, 14).modify(pick(fat));
  for (const k of Object.keys(t.attributes)) if (k !== 'position' && k !== 'normal') t.deleteAttribute(k);
  return keep.length ? mergeGeometries([t, pick(keep)], false) : t;
}

/** per-material wear [curvature (1/m) mapped to full wear, cap] */
const WEAR = {
  '*:steel_dark': [1 / 700, 0.45], '*:steel': [1 / 600, 0.5], '*:steel_bright': [1 / 600, 0.3], '*:steel_blued': [1 / 700, 0.35],
  '*:brass': [1 / 500, 0.5], '*:leather_black': [1 / 450, 0.4], '*:leather_grain': [1 / 450, 0.45],
  '*:porcelain': [0, 0], '*:glaze_cobalt': [0, 0], '*:glaze_vermilion': [0, 0], '*:crystal': [0, 0], '*:obsidian': [0, 0],
};
