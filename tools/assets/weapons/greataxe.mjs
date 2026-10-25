// 刑天．舞戚 Xingtian Wardancer — 神兵 X05 great axe (docs/PREMIUM_WEAPONS.md §2.32).
// 「刑天……以乳為目，以臍為口，操干戚以舞」: a Shang-style bronze 鉞 (yue) blown up to mythic size on a 1.5 m black-lacquered
// haft. The axe IS Xingtian's face: the blade carries a pierced human mask whose eyes are two crimson crystals and whose
// grinning toothed mouth is open-cut through the bronze (the lower teeth on a sliding jaw that drops when the axe roars,
// a molten core glowing between the teeth). Built like a real 鐵刃銅鉞: a forged iron edge cast into the bronze.
//   - blade body: one bronze plate (11 mm) with the eye holes, the mouth and three lashing slots cut through; flaring
//     shoulders running out into crescent horns; a raised frame along the shoulders and the rear edge; 雲雷紋 square
//     spirals in bronze over turquoise floors in both shoulder bands and across the brow
//   - iron edge: a lofted band (7 mm at the seam -> 0.7 mm at the cutting line) whose faces carry a forged flat, a
//     ground bevel (steel_bright) and a mirror micro-bevel (chrome): two real grind lines; it tapers into both horn tips.
//     The bronze laps over it in a wavy line of cast tongues, a molten seam glowing in the joint (fx_seam)
//   - mask (both faces): the face rim from temple to chin, gold-leaf brows, almond lids, a nose ridge with flared
//     nostrils, cheek crescents, curled ears, a lip rim ending in spiral corners; gold-bezelled crystal eyes on claws
//     (fx_eyes, the hero); upper fangs with gold tips; the jaw (fx_jaw) with the lower teeth; the molten core (fx_mouth)
//   - socket: a bronze sleeve hugging the haft front (闌) with beaded lips; three rawhide lashings through the slots
//   - 內 (tang): a cast plaque behind the haft, a turquoise mosaic field (individual tiles) under a bronze 夔 dragon,
//     a pierced lug carrying the red horsehair tassel (fx_tassel, pendulum)
//   - haft: black lacquer, cinnabar bands between gold 雷紋 inlay bands, two leather grips under a woven over-under
//     silk lattice between beaded bronze ferrules, bronze collars over and under the head, a flame-crown finial and a
//     faceted 鐏 butt spike with a stud band
//   - fx_flare: the projected energy crescent beyond the edge (restHidden; the special grows it for heavy blows)
// Side view mm: t along the haft (head +t), s = cutting direction (edge +s), w = blade normal (+w faces the player in
// first person). The right hand holds the upper grip at t = 200 like a pistol grip (viewmodel conventions).
import * as THREE from 'three';
import { toCreasedNormals, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';
import { Gun, V, profile, merge, mirrorW, circle, xform } from '../lib/gunkit.mjs';
import { bakeMeshes } from '../lib/bake.mjs';
import { postBake } from './m4.mjs';

const D2R = Math.PI / 180;
const TAU = Math.PI * 2;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, u) => a + (b - a) * u;
const smooth = (a, b, x) => { const u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); };
const BRONZE = 'bronze_aged', GOLD = 'gold', LEAF = 'gold_leaf', TURQ = 'glaze_turquoise';

// ------------------------------------------------------------------------------------------ layout (mm)
const HW = 5.5;                    // blade body half thickness
const RS = 19, RW = 17;            // haft half axes (s, w): an oval
const HAFT = [-480, 797];          // lacquered haft between the butt and the finial
const BODY = { rear: 21, t0: 405, t1: 745 };   // blade body along the haft front (head units, see K)
// the head is authored in its own units and scaled by K about the haft front (HPV): one knob for its size
const K = 1.15, HPV = [21, 587, 0];
const hp = ([s, t, w = 0]) => [HPV[0] + (s - HPV[0]) * K, HPV[1] + (t - HPV[1]) * K, w * K];
// the crescent edge: an arc (centre CE, radius RE) from the lower horn (u 0, t 310) to the upper horn (u 1, t 865)
const CE = [-259.9, 587.5], RE = 624.9, TH0 = -26.36 * D2R, TH1 = 26.36 * D2R;
const EDGE = (u) => { const a = lerp(TH0, TH1, u); return [CE[0] + Math.cos(a) * RE, CE[1] + Math.sin(a) * RE]; };
const EIN = (u) => { const a = lerp(TH0, TH1, u); return [-Math.cos(a), -Math.sin(a)]; };     // inward (towards the body)
const UM = [0.085, 0.915];         // where the shoulders meet the seam
const DMAX = 60;                   // iron band depth (seam side hidden under the bronze lip)
const BAND = (u) => DMAX * Math.max(0.035, Math.min(smooth(0, 0.11, u), smooth(1, 0.89, u)));
// the bronze lip: cast tongues lapping over the iron
const SEAM = (u) => 46 - 8.5 * Math.pow(0.5 + 0.5 * Math.sin(u * TAU * 6.5 + 0.9), 2.2);
const at = (u, d) => { const e = EDGE(u), n = EIN(u); return [e[0] + n[0] * d, e[1] + n[1] * d]; };
// face
const FACE = { s: 160, eyeT: 640, eyeDs: 43, eyeR: 17, mouthT: 520 };
const EYES = [[FACE.s - FACE.eyeDs, FACE.eyeT], [FACE.s + FACE.eyeDs, FACE.eyeT]];
const LASH = [452, 590, 704];      // lashing slots (t)
const TANG = { s0: -16, s1: -168, t0: 540, t1: 628 };
const GRIP_U = [96, 312], GRIP_L = [-300, -90];

// ------------------------------------------------------------------------------------------ mesh helpers
const fin = (geo, crease = 30) => {
  for (const k of Object.keys(geo.attributes)) if (k !== 'position') geo.deleteAttribute(k);
  return toCreasedNormals(geo.index ? geo.toNonIndexed() : geo, crease * D2R);
};
/** indexed mesh from [s, t, w] points + triangle list */
function mesh(pts, idx, crease = 30) {
  const g = new THREE.BufferGeometry(), a = new Float32Array(pts.length * 3);
  pts.forEach(([s, t, w], i) => { a[i * 3] = w; a[i * 3 + 1] = t; a[i * 3 + 2] = -s; });
  g.setAttribute('position', new THREE.BufferAttribute(a, 3));
  g.setIndex(idx);
  return fin(g, crease);
}
/** loft of rings ([s, t, w] points, same count); open = the ring is a strip (no closing quad) */
function loftRings(rings, { close = true, capA = false, capB = false, crease = 30, flip = false } = {}) {
  const n = rings[0].length, pts = [], idx = [];
  for (const r of rings) pts.push(...r);
  const m = close ? n : n - 1;
  for (let i = 0; i + 1 < rings.length; i++) for (let j = 0; j < m; j++) {
    const a = i * n + j, b = i * n + (j + 1) % n, c = (i + 1) * n + j, d = (i + 1) * n + (j + 1) % n;
    flip ? idx.push(a, b, c, b, d, c) : idx.push(a, c, b, b, c, d);
  }
  const cap = (ri, f) => {
    const r = rings[ri], c = r.reduce((o, p) => [o[0] + p[0] / n, o[1] + p[1] / n, o[2] + p[2] / n], [0, 0, 0]);
    const ci = pts.length; pts.push(c);
    for (let j = 0; j < n; j++) { const a = ri * n + j, b = ri * n + (j + 1) % n; (f !== flip) ? idx.push(ci, a, b) : idx.push(ci, b, a); }
  };
  if (capA) cap(0, true);
  if (capB) cap(rings.length - 1, false);
  return mesh(pts, idx, crease);
}
/** signed area of a closed [x, y] loop (> 0 counter-clockwise) */
function loopArea(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
function volume(geo) {
  const p = geo.attributes.position.array; let v = 0;
  for (let i = 0; i < p.length; i += 9) v += p[i] * (p[i + 4] * p[i + 8] - p[i + 5] * p[i + 7]) - p[i + 1] * (p[i + 3] * p[i + 8] - p[i + 5] * p[i + 6]) + p[i + 2] * (p[i + 3] * p[i + 7] - p[i + 4] * p[i + 6]);
  return v / 6;
}
/** revolve [[r, t], ...] about the haft axis (t), oval by ks (s) / kw (w); turned counter-clockwise so faces point out */
function revT(pts, { seg = 28, ks = RS / RW, kw = 1, s = 0, w = 0, phase = 0, arc = TAU, crease = 40, what = 'revT' } = {}) {
  const P = loopArea(pts) < 0 ? [...pts].reverse() : pts;
  const g = new THREE.LatheGeometry(P.map(([r, t]) => new THREE.Vector2(Math.max(0, r), t)), seg, phase, arc);
  const closed = arc >= TAU - 1e-6 && ((P[0][0] <= 1e-6 && P.at(-1)[0] <= 1e-6) || (P[0][0] === P.at(-1)[0] && P[0][1] === P.at(-1)[1]));
  if (closed && volume(g.toNonIndexed()) <= 0) throw new Error(`greataxe: ${what} lathe is inside-out`);
  g.scale(kw, 1, ks);
  g.translate(w, 0, -s);
  return fin(g, crease);
}
/** round tube along [s, t, w] points (cords, lashings) */
function tubeAlong(points, r, { seg = 48, radial = 6, closed = false, tension = 0.5 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => V(...p)), closed, 'catmullrom', tension);
  const geo = new THREE.TubeGeometry(curve, seg, r, radial, closed);
  geo.deleteAttribute('uv');
  return fin(geo, 70);
}
/** tapered tube (hair strands, flame tongues): radius r0 -> r1 */
function taper(points, r0, r1, { seg = 10, radial = 4 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => V(...p)));
  const geo = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  const p = geo.attributes.position, n = radial + 1, c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const r = lerp(r0, r1, i / seg);
    curve.getPointAt(i / seg, c);
    for (let j = 0; j < n; j++) { const k = i * n + j; v.fromBufferAttribute(p, k).sub(c).multiplyScalar(r).add(c); p.setXYZ(k, v.x, v.y, v.z); }
  }
  geo.deleteAttribute('uv');
  return fin(geo, 80);
}
/** a ring of beads round the haft (one modulated tube: 4 segments a bead) at height t, radius r */
function beadRing(t, r, br, n, ks = RS / RW, kw = 1) {
  const N = n * 4, R = 5, pts = [], idx = [];
  for (let i = 0; i < N; i++) {
    const a = i / N * TAU, rr = br * (0.45 + 0.55 * Math.abs(Math.cos(Math.PI * n * i / N)));
    const c = [Math.cos(a) * r * ks, t, Math.sin(a) * r * kw], nr = [Math.cos(a), 0, Math.sin(a)];
    for (let j = 0; j < R; j++) { const b = j / R * TAU; pts.push([c[0] + nr[0] * Math.cos(b) * rr, t + Math.sin(b) * rr, c[2] + nr[2] * Math.cos(b) * rr]); }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < R; j++) {
    const a = i * R + j, b = i * R + (j + 1) % R, c = ((i + 1) % N) * R + j, d = ((i + 1) % N) * R + (j + 1) % R;
    idx.push(a, b, c, b, d, c);
  }
  return mesh(pts, idx, 80);
}
// ------------------------------------------------------------------------------------------ 2D (s, t) helpers
const quad = (a, c, b, n = 12) => { const o = []; for (let i = 0; i <= n; i++) { const u = i / n; o.push([(1 - u) ** 2 * a[0] + 2 * (1 - u) * u * c[0] + u * u * b[0], (1 - u) ** 2 * a[1] + 2 * (1 - u) * u * c[1] + u * u * b[1]]); } return o; };
const arcP = (cx, cy, r, a0, a1, n, ry = r) => { const o = []; for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n) * D2R; o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * ry]); } return o; };
/** points every `step` mm along a polyline (corners kept) */
function resample(path, step, closed = false) {
  const P = closed ? [...path, path[0]] : path, out = [P[0]];
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1], b = P[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / step));
    for (let k = 1; k <= n; k++) out.push([lerp(a[0], b[0], k / n), lerp(a[1], b[1], k / n)]);
  }
  if (closed) out.pop();
  return out;
}
/** outline polygon of a stroked polyline (half width hw, mitred corners; hw may be a function of the index fraction) */
function stroke(pts, hw, closed = false) {
  const n = pts.length, L = [], R = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i], h = typeof hw === 'function' ? hw(i / (n - 1)) : hw;
    const a = closed ? pts[(i - 1 + n) % n] : pts[Math.max(0, i - 1)], b = closed ? pts[(i + 1) % n] : pts[Math.min(n - 1, i + 1)];
    let d1 = [p[0] - a[0], p[1] - a[1]], d2 = [b[0] - p[0], b[1] - p[1]];
    const l1 = Math.hypot(...d1) || 1, l2 = Math.hypot(...d2) || 1;
    d1 = [d1[0] / l1, d1[1] / l1]; d2 = [d2[0] / l2, d2[1] / l2];
    if (i === 0 && !closed) d1 = d2;
    if (i === n - 1 && !closed) d2 = d1;
    let m = [-(d1[1] + d2[1]), d1[0] + d2[0]];
    const ml = Math.hypot(...m) || 1; m = [m[0] / ml, m[1] / ml];
    const k = 1 / Math.max(0.35, m[0] * -d1[1] + m[1] * d1[0]);
    L.push([p[0] + m[0] * h * k, p[1] + m[1] * h * k]); R.push([p[0] - m[0] * h * k, p[1] - m[1] * h * k]);
  }
  return closed ? { outer: L, inner: R } : [...L, ...R.reverse()];
}
/**
 * Raised relief on the blade faces: `poly` (closed [s, t] outline) extruded `h` mm proud of the face w0 (+ its mirror on
 * the far face when both). Sunk 0.25 mm into the face so no seam shows.
 */
function relief(poly, h, { w0 = HW, both = true, bevel = 0.35, holes = [] } = {}) {
  const P = loopArea(poly) < 0 ? [...poly].reverse() : poly;
  const g = profile(P.map(([s, t]) => [s, t]), { w: h + 0.25, cw: w0 + (h - 0.25) / 2, bevel: Math.min(bevel, (h + 0.25) / 2 - 0.06), bevelSeg: 1, curveSeg: 3, holes });
  return both ? merge([g, mirrorW(g)]) : g;
}
const line = (pts, hw, h, o) => relief(stroke(pts, hw), h, o);
/** raised ring along a closed loop (half width hw): the bigger offset is the outline, the other the hole */
function ringRelief(loop, hw, h, o = {}, step = 4) {
  const st = stroke(resample(loop, step, true), hw, true);
  const [A, B] = Math.abs(loopArea(st.outer)) > Math.abs(loopArea(st.inner)) ? [st.outer, st.inner] : [st.inner, st.outer];
  return relief(A, h, { ...o, holes: [B] });
}
/** square spiral polyline (雷紋): from the outer corner (x0, y0) along +x, turning ccw (dir 1) or cw (-1) */
function sqSpiral(x0, y0, L, p, dir = 1) {
  const out = [[x0, y0]]; let x = x0, y = y0, dx = 1, dy = 0, i = 0;
  const lens = [L, L]; for (let k = 1; L - k * p > p * 0.6; k++) lens.push(L - k * p, L - k * p);
  for (const len of lens) {
    x += dx * len; y += dy * len * dir; out.push([x, y]);
    [dx, dy] = [-dy, dx];
    if (++i > 12) break;
  }
  return out;
}
/**
 * 雲雷紋 band in a local (u, v) frame (u along, v across, 0 .. H): framing lines and alternating square spirals;
 * map(u, v) -> [s, t] places it on the blade. Returns { lines: [polylines in s, t], floor: polygon }.
 */
function thunderBand(U, H, map, { unit = H - 6, pitch = 3.0 } = {}) {
  const lines = [], n = Math.max(1, Math.floor(U / (unit + 2.2)));
  const pad = (U - n * (unit + 2.2)) / 2 + 1.1;
  for (let k = 0; k < n; k++) {
    const x0 = pad + k * (unit + 2.2), flip = k % 2;
    const sp = flip ? sqSpiral(x0, 3, unit, pitch, 1).map(([x, y]) => [x, H - y]) : sqSpiral(x0, 3, unit, pitch, 1);
    lines.push(sp);
  }
  const m = (pl) => pl.map(([u, v]) => map(u, v));
  const rim = (v) => m(resample([[0, v], [U, v]], 9));
  const floor = [...resample([[0, 0], [U, 0]], 9), ...resample([[U, H], [0, H]], 9)];
  return { lines: [...lines.map(m), rim(0.6), rim(H - 0.6)], floor: m(floor) };
}
/** frame along a curve: map(u, v) for a band whose spine is the polyline `path` (u = arc length), v to the left */
function curveFrame(path) {
  const P = resample(path, 2), A = [0];
  for (let i = 1; i < P.length; i++) A.push(A[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const len = A.at(-1);
  const map = (u, v) => {
    const x = Math.max(0, Math.min(len, u));
    let i = 1; while (i < A.length - 1 && A[i] < x) i++;
    const k = (x - A[i - 1]) / Math.max(1e-6, A[i] - A[i - 1]), a = P[i - 1], b = P[i];
    const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
    return [lerp(a[0], b[0], k) - ty / l * v, lerp(a[1], b[1], k) + tx / l * v];
  };
  return { map, len };
}

// ------------------------------------------------------------------------------------------ haft helpers
/** gold 雷紋 band wrapped round the haft between t0 and t1: square spirals + rims, inlaid flush-ish (h proud) */
function haftThunder(t0, t1, r0, h = 0.7) {
  const C = TAU * r0, H = t1 - t0, n = 8, unit = C / n - 2.2, out = [];
  const lines = [];
  for (let k = 0; k < n; k++) {
    const x0 = k * (unit + 2.2) + 1.1, flip = k % 2;
    const sp = flip ? sqSpiral(x0, H - 2.5, unit * 0.82, 2.4, -1) : sqSpiral(x0, 2.5, unit * 0.82, 2.4, 1);
    lines.push(sp);
  }
  lines.push(resample([[0, 0.7], [C, 0.7]], 4.5), resample([[0, H - 0.7], [C, H - 0.7]], 4.5));
  for (const pl of lines) {
    const poly = stroke(resample(pl, 4.5), 0.6);
    // flat ribbon in (u, v), extruded h, then wrapped: u -> angle, v -> t, z -> radius
    const g = profile(poly, { w: h + 0.3, cw: (h - 0.3) / 2, bevel: 0.2, bevelSeg: 1, curveSeg: 2 });
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getX(i), v = p.getY(i), u = p.getZ(i), a = u / r0, r = r0 + z;
      p.setXYZ(i, Math.sin(a) * r, t0 + v, -Math.cos(a) * r * RS / RW);
    }
    out.push(fin(g, 40));
  }
  return merge(out);
}
/** woven over-under lattice of cords round a grip: n strands each way, pitch P (mm per turn) */
function lattice(t0, t1, R, n = 3, P = 84, r = 1.45, amp = 0.9) {
  const out = [], N = Math.ceil((t1 - t0) / 4);
  for (const dir of [1, -1]) for (let i = 0; i < n; i++) {
    const pts = [];
    for (let k = 0; k <= N; k++) {
      const t = lerp(t0, t1, k / N), a = dir * TAU * (t - t0) / P + TAU * i / n;
      const rr = R + dir * amp * Math.cos(TAU * n * (t - t0) / P);
      pts.push([Math.cos(a) * rr * RS / RW, t, Math.sin(a) * rr]);
    }
    out.push(tubeAlong(pts, r, { seg: Math.ceil(N * 1.3), radial: 5 }));
  }
  return merge(out);
}

// ======================================================================================================= build
export default function build() {
  const g = new Gun('greataxe');

  // ------------------------------------------------------------------ haft (柲)
  {
    // lacquered core (black), under the grips too
    // (rows every ~45 mm: one 1.3 m sliver per side would blow up in the bake tessellation)
    const rows = []; for (let t = HAFT[0] + 0.6; t < HAFT[1] - 0.6; t += 45) rows.push([RW, t]);
    g.add(revT([[0, HAFT[0]], [RW - 0.6, HAFT[0]], ...rows, [RW, HAFT[1] - 0.6], [RW - 0.6, HAFT[1]], [0, HAFT[1]]], { seg: 32, what: 'haft' }), 'lacquer_black');
    // cinnabar bands with gold rims, gold 雷紋 inlay bands between them
    for (const [a, b] of [[-70, -44], [30, 56], [-414, -390]]) {
      g.add(revT([[RW + 0.15, a], [RW + 0.45, a + 0.6], [RW + 0.45, b - 0.6], [RW + 0.15, b]], { seg: 32, what: 'band' }), 'lacquer_red');
      for (const t of [a - 1.2, b + 1.2]) g.add(revT([[RW, t - 1.1], [RW + 0.9, t - 0.6], [RW + 0.9, t + 0.6], [RW, t + 1.1]], { seg: 32, what: 'rim' }), GOLD);
    }
    g.add(haftThunder(-36, -20, RW + 0.1), GOLD);
    g.add(haftThunder(62, 78, RW + 0.1), GOLD);
    g.add(haftThunder(-440, -424, RW + 0.1), GOLD);
    // grips: pebbled leather wrapped in a spiral (raised strap edges), a woven silk lattice over it, beaded bronze ferrules
    for (const [t0, t1] of [GRIP_U, GRIP_L]) {
      g.add(revT([[RW + 0.2, t0], [RW + 1.3, t0 + 1.2], [RW + 1.3, t1 - 1.2], [RW + 0.2, t1]], { seg: 32, what: 'grip' }), 'leather_grain');
      const turns = (t1 - t0) / 26, strap = [];
      for (let k = 0; k <= Math.ceil(turns * 22); k++) { const u = k / Math.ceil(turns * 22), t = lerp(t0 + 3, t1 - 3, u), a = u * turns * TAU; strap.push([Math.cos(a) * (RW + 1.25) * RS / RW, t, Math.sin(a) * (RW + 1.25)]); }
      g.add(tubeAlong(strap, 0.75, { seg: strap.length, radial: 4 }), 'leather_grain');
      g.add(lattice(t0 + 4, t1 - 4, RW + 2.6), 'silk_red');
      for (const [a, sd] of [[t0, -1], [t1, 1]]) {
        const b = a + sd * 16;
        const ring = sd > 0 ? [[RW + 0.1, a - 2], [RW + 2.8, a - 1.2], [RW + 3.1, a + 1], [RW + 2.6, a + 6], [RW + 3.4, a + 9], [RW + 3.4, b - 1.5], [RW + 2.2, b], [RW + 0.1, b]]
          : [[RW + 0.1, b], [RW + 2.2, b], [RW + 3.4, b + 1.5], [RW + 3.4, a - 9], [RW + 2.6, a - 6], [RW + 3.1, a - 1], [RW + 2.8, a + 1.2], [RW + 0.1, a + 2]];
        g.add(revT(ring, { seg: 32, what: 'ferrule' }), BRONZE);
        g.add(beadRing(a + sd * 3.6, RW + 3.0, 1.15, 26), GOLD);
      }
    }
    // collars under and over the head (the head's sleeve sits between them)
    g.add(revT([[RW, 336], [RW + 2.2, 337], [RW + 3.4, 342], [RW + 3.4, 360], [RW + 4.6, 365], [RW + 4.6, 372], [RW + 2.8, 376], [RW, 377]], { seg: 32, what: 'collarL' }), BRONZE);
    g.add(beadRing(351, RW + 3.6, 1.2, 28), GOLD);
    g.add(revT([[RW, 769], [RW + 2.8, 770], [RW + 4.6, 774], [RW + 4.6, 781], [RW + 3.4, 786], [RW + 3.4, 792], [RW + 2, 796], [RW, 797]], { seg: 32, what: 'collarU' }), BRONZE);
    g.add(beadRing(789, RW + 3.6, 1.1, 28), GOLD);
    // finial (柲冒): a stepped cap, a ring of three flame tongues, a gold knob
    g.add(revT([[0, 797], [RW + 1.5, 797], [RW + 2.5, 801], [RW + 1.2, 817], [RW + 3.5, 823], [RW + 3.5, 828], [14, 833], [10, 849], [12.5, 855], [12.5, 859], [7, 865], [0, 867]], { seg: 32, what: 'finial' }), BRONZE);
    g.add(beadRing(825.5, RW + 3.2, 1.0, 26), GOLD);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU + 0.26, c = Math.cos(a), sn = Math.sin(a), k = i % 2 ? 0.7 : 1;
      g.add(taper([[c * 14 * RS / RW, 839, sn * 14], [c * 19 * RS / RW, 853 + 4 * k, sn * 19], [c * 15 * RS / RW, 873 + 10 * k, sn * 15], [c * 7, 885 + 14 * k, sn * 7]], 4.2, 0.4, { seg: 10, radial: 6 }), BRONZE);
    }
    g.add(revT([[0, 865], [5.5, 866.5], [7.5, 872], [6.5, 878], [3.5, 882], [0, 883]], { seg: 20, what: 'knob' }), GOLD);
    // 鐏 butt: a stud band, a flared socket, a four-sided spike
    g.add(revT([[RW, -478], [RW + 2.2, -480], [RW + 3.4, -486], [RW + 3.4, -500], [RW + 1.6, -506], [RW + 1.6, -528], [RW + 3.8, -534], [RW + 3.8, -544], [RW + 1, -550], [12, -556], [0, -557]], { seg: 32, what: 'butt' }), BRONZE);
    g.add(beadRing(-482.5, RW + 3.2, 1.1, 26), GOLD);
    for (let i = 0; i < 10; i++) {   // stud band (乳釘)
      const a = i / 10 * TAU + 0.31, c = Math.cos(a), sn = Math.sin(a), r = RW + 1.6;
      const st = new THREE.SphereGeometry(2.6, 10, 6, 0, TAU, 0, Math.PI / 2);
      st.rotateZ(-Math.PI / 2); st.rotateY(Math.PI / 2 - a); st.translate(sn * r, -517, -c * r * RS / RW);
      g.add(fin(st, 80), BRONZE);
    }
    g.add(revT([[0, -552], [13.6, -552], [13.6, -556], [0, -640]], { seg: 4, phase: Math.PI / 4, ks: 1, crease: 25, what: 'spike' }), BRONZE);
  }

  // the head (blade, mask, edge, eyes, jaw, tang, flare) is authored in head units and scaled by K about HPV
  const hs = (geo) => xform(geo, { pivot: HPV, scale: K });
  const H = { add: (geo, mat) => g.add(hs(geo), mat) };
  const hpart = (name, o = {}) => { const p = g.part(name, { ...o, pivot: hp(o.pivot || [0, 0, 0]) }); return { add: (geo, mat) => p.add(hs(geo), mat) }; };

  // ------------------------------------------------------------------ head: bronze body
  const pL = at(UM[0], SEAM(UM[0])), pU = at(UM[1], SEAM(UM[1]));
  const shoulderL = quad([BODY.rear, BODY.t0], [190, BODY.t0 + 24], pL, 16);
  const shoulderU = quad([BODY.rear, BODY.t1], [190, BODY.t1 - 22], pU, 16);
  const seam = []; for (let k = 0; k <= 150; k++) { const u = lerp(UM[0], UM[1], k / 150); seam.push(at(u, SEAM(u))); }
  const outline = [...shoulderL, ...seam.slice(1, -1), ...shoulderU.slice().reverse()];
  const mouthTop = (s) => FACE.mouthT + 22 - 7 * ((s - FACE.s) / 72) ** 2;
  const mouthBot = (s) => FACE.mouthT - 20 + 24 * ((s - FACE.s) / 72) ** 2;
  const mouth = []; { const n = 24; for (let i = 0; i <= n; i++) { const s = lerp(FACE.s - 70, FACE.s + 70, i / n); mouth.push([s, mouthBot(s)]); } for (let i = n; i >= 0; i--) { const s = lerp(FACE.s - 70, FACE.s + 70, i / n); mouth.push([s, mouthTop(s)]); } }
  const slot = (t) => [[BODY.rear + 9, t - 13, 4.5], [BODY.rear + 19, t - 13, 4.5], [BODY.rear + 19, t + 13, 4.5], [BODY.rear + 9, t + 13, 4.5]];
  {
    const holes = [circle(EYES[0][0], EYES[0][1], FACE.eyeR), circle(EYES[1][0], EYES[1][1], FACE.eyeR), mouth, ...LASH.map(slot)];
    H.add(profile(outline.map(([s, t]) => [s, t]), { w: HW * 2, bevel: 1.4, bevelSeg: 2, curveSeg: 4, holes }), BRONZE);
    // raised frame: rear edge (broken by the lashing slots) and both shoulders
    const rearSegs = [[BODY.t0 + 2, LASH[0] - 17], [LASH[0] + 17, LASH[1] - 17], [LASH[1] + 17, LASH[2] - 17], [LASH[2] + 17, BODY.t1 - 2]];
    for (const [a, b] of rearSegs) H.add(line([[BODY.rear + 3.2, a], [BODY.rear + 3.2, b]], 2.6, 1.5), BRONZE);
    const inset = (path, d) => { const F = curveFrame(path); const o = []; for (let u = 0; u <= F.len; u += 3) o.push(F.map(u, d)); return o; };
    const sL = inset(shoulderL, 3.4).filter(([s]) => s > BODY.rear + 6), sU = inset(shoulderU, -3.4).filter(([s]) => s > BODY.rear + 6);
    H.add(line(sL.slice(0, -2), 2.4, 1.5), BRONZE);
    H.add(line(sU.slice(0, -2), 2.4, 1.5), BRONZE);
    // 雲雷紋 bands on turquoise floors inside both shoulders (bronze spirals proud of the glaze)
    for (const [path, sd] of [[shoulderL, 1], [shoulderU, -1]]) {
      const F = curveFrame(path), U0 = 16, U1 = F.len - 26;
      const band = thunderBand(U1 - U0, 15, (u, v) => F.map(U0 + u, sd * (8.5 + v)));
      H.add(relief(band.floor, 0.5, { bevel: 0.2 }), TURQ);
      for (const pl of band.lines) H.add(line(pl, 0.85, 1.25, { bevel: pl.length > 9 ? 0.3 : 0 }), BRONZE);   // spirals: crisp, no bevel rows
    }
    // the cast lip: a raised line 6 mm inside the seam following every tongue (reads as bronze poured over the iron)
    {
      const lip = []; for (let k = 0; k <= 120; k++) { const u = lerp(UM[0] + 0.02, UM[1] - 0.02, k / 120); lip.push(at(u, SEAM(u) + 6.5)); }
      H.add(line(lip, 1.1, 1.0, { bevel: 0.35 }), BRONZE);
    }
    // 乳釘 studs on the rear frame between the lashings
    for (const t of [BODY.t0 + 18, (LASH[0] + LASH[1]) / 2 - 14, (LASH[0] + LASH[1]) / 2 + 14, (LASH[1] + LASH[2]) / 2, BODY.t1 - 18]) {
      for (const sd of [1, -1]) {
        const st = new THREE.SphereGeometry(3.4, 12, 6, 0, TAU, 0, Math.PI / 2);
        st.scale(1, 0.75, 1); st.rotateZ(-sd * Math.PI / 2); st.translate(sd * (HW + 1.2), t, -(BODY.rear + 13));
        H.add(fin(st, 80), BRONZE);
      }
    }
    // clan emblem (an original 族徽): a 亞-shaped cartouche holding a headless dancer with shield and axe
    {
      const cx = FACE.s + 116, cy = 640, a = 15, b = 32, n = 6;
      const ya = [[cx - a + n, cy - b], [cx + a - n, cy - b], [cx + a - n, cy - b + n], [cx + a, cy - b + n], [cx + a, cy + b - n], [cx + a - n, cy + b - n], [cx + a - n, cy + b],
        [cx - a + n, cy + b], [cx - a + n, cy + b - n], [cx - a, cy + b - n], [cx - a, cy - b + n], [cx - a + n, cy - b + n]];
      H.add(ringRelief(ya, 1.3, 1.3, {}, 200), BRONZE);
      // the dancer: torso with two eye dots and a mouth, legs apart, a shield (left) and an axe raised (right)
      H.add(line([[cx, cy + 12], [cx, cy - 6]], 3.2, 1.3), BRONZE);
      H.add(line([[cx - 7, cy - 22], [cx, cy - 6], [cx + 7, cy - 22]], 1.3, 1.2), BRONZE);
      H.add(line([[cx - 9, cy + 2], [cx, cy + 9], [cx + 8, cy + 14], [cx + 8, cy + 24]], 1.1, 1.2), BRONZE);
      H.add(relief(arcP(cx - 10, cy + 2, 4.4, 0, 340, 14, 6), 1.6), BRONZE);
      H.add(relief([[cx + 4, cy + 24], [cx + 12, cy + 20], [cx + 13, cy + 27], [cx + 6, cy + 29]], 1.6), BRONZE);
      for (const d of [-1.6, 1.6]) H.add(relief(arcP(cx + d, cy + 6, 0.9, 0, 330, 8), 1.6), GOLD);
    }
  }

  // ------------------------------------------------------------------ head: the mask (both faces)
  {
    const S = FACE.s;
    // face rim: temple -> cheek -> chin -> cheek -> temple
    const rim = [...quad([S - 92, 690], [S - 104, 560], [S - 58, 478], 14), ...quad([S - 58, 478], [S, 440], [S + 58, 478], 12).slice(1), ...quad([S + 58, 478], [S + 104, 560], [S + 92, 690], 14).slice(1)];
    H.add(line(resample(rim, 7), (u) => 2.2 + 1.6 * Math.sin(Math.PI * u), 1.8), BRONZE);
    // brows (gold leaf) and almond lids round the eye holes
    for (const [ex, ey] of EYES) {
      const sd = ex < S ? -1 : 1;
      const brow = quad([ex - sd * 34, ey + 22], [ex - sd * 2, ey + 44], [ex + sd * 34, ey + 30], 14);
      H.add(line(brow, (u) => 2.4 + 3.4 * Math.sin(Math.PI * Math.min(1, u * 1.15)), 2.3, { bevel: 0.6 }), LEAF);
      const lid = [...quad([ex - 31, ey + 1], [ex, ey + 30], [ex + 31, ey + 1], 12), ...quad([ex + 31, ey + 1], [ex, ey - 27], [ex - 31, ey + 1], 12).slice(1, -1)];
      H.add(ringRelief(lid, 1.6, 1.3), BRONZE);
      // cheek crescent under each eye
      H.add(line(quad([ex - sd * 22, ey - 38], [ex + sd * 6, ey - 50], [ex + sd * 30, ey - 36], 10), (u) => 0.8 + 2.4 * Math.sin(Math.PI * u), 1.2), BRONZE);
      // ear: a C curl with a spiral inside, on the outer side of the face
      const exs = S + sd * 100;
      const ear = [...arcP(exs, 628, 15, sd > 0 ? 120 : 60, sd > 0 ? -120 : 240, 14, 26)];
      H.add(line(ear, 2.2, 1.6), BRONZE);
      const curl = []; for (let i = 0; i <= 16; i++) { const a = (sd > 0 ? 200 : -20) + sd * i * 32, r = 10 * (1 - i / 19); curl.push([exs + sd * 2 + Math.cos(a * D2R) * r, 626 + Math.sin(a * D2R) * r * 1.4]); }
      H.add(line(curl, 1.0, 1.2), BRONZE);
    }
    // nose: a ridge widening into flared nostrils
    H.add(line([[S, 668], [S, 610], [S, 566]], (u) => 4.0 + 6.5 * u * u, 1.6, { bevel: 0.6 }), BRONZE);
    H.add(line([[S, 664], [S, 610], [S, 570]], (u) => 1.6 + 2.6 * u * u, 3.6, { bevel: 0.9 }), BRONZE);
    H.add(line(quad([S - 22, 566], [S, 548], [S + 22, 566], 10), (u) => 1.5 + 2.6 * Math.sin(Math.PI * u), 2.0), BRONZE);
    for (const sd of [-1, 1]) {
      H.add(ringRelief(arcP(S + sd * 15, 566, 7.5, 0, 345, 24, 5.8), 2.1, 2.3, { bevel: 0.7 }, 2.5), BRONZE);   // flared wing round a pit
    }
    // lip rim round the mouth, the corners rolling into spirals
    H.add(ringRelief(mouth, 2.0, 1.7), BRONZE);
    for (const sd of [-1, 1]) {
      const cx = S + sd * 80, cy = FACE.mouthT + 4, sp = [];
      for (let i = 0; i <= 22; i++) { const a = (sd > 0 ? 180 : 0) - sd * i * 30, r = 11 * (1 - i / 26); sp.push([cx + Math.cos(a * D2R) * r, cy + Math.sin(a * D2R) * r]); }
      H.add(line(sp, 1.3, 1.5), BRONZE);
    }
    // eye sockets: a stepped bronze seat round each hole
    for (const [ex, ey] of EYES) H.add(relief(arcP(ex, ey, FACE.eyeR + 5.5, 0, 350, 35), 0.9, { holes: [arcP(ex, ey, FACE.eyeR + 0.6, 350, 0, 35)] }), BRONZE);
  }

  // ------------------------------------------------------------------ head: iron edge (鐵刃) — lofted band, three grinds
  {
    const N = 140;
    const ringAt = (u, ds, hs) => { const D = BAND(u) / DMAX; const r = []; for (let i = 0; i < ds.length; i++) { const [s, t] = at(u, ds[i] * D); r.push([s, t, hs[i]]); } return r; };
    const band = (d0, d1, h0, h1, mat) => {
      const rings = [];
      for (let k = 0; k <= N; k++) {
        const u = k / N, taper = 0.55 + 0.45 * Math.min(smooth(0, 0.18, u), smooth(1, 0.82, u));
        const ds = [d1, d0, d0, d1], hs = [h1 * taper, h0 * taper, -h0 * taper, -h1 * taper];
        rings.push(ringAt(u, ds, hs));
      }
      return loftRings(rings, { close: true, capA: true, capB: true, crease: 28 });
    };
    H.add(band(31, DMAX, 3.15, 3.5), 'steel');           // forged flat (under and past the bronze lip)
    H.add(band(3.2, 31, 1.0, 3.15), 'steel_bright');     // ground bevel
    H.add(band(0, 3.2, 0.32, 1.0), 'chrome');            // mirror micro-bevel at the cutting line
  }
  // the molten seam: a thin glowing bead on the iron right at the bronze lip, both faces
  {
    const fx = hpart('fx_seam', { pivot: [200, 587, 0], extras: { energy: true } });
    const rings = [];
    for (let k = 0; k <= 150; k++) {
      const u = lerp(UM[0] + 0.004, UM[1] - 0.004, k / 150), d = SEAM(u) - 0.6, hz = 3.15 + 0.15;
      const a = at(u, d - 1.7), b = at(u, d);
      rings.push([[a[0], a[1], hz], [b[0], b[1], hz + 0.55], [b[0], b[1], hz + 1.2], [a[0], a[1], hz + 0.25]]);
    }
    const one = loftRings(rings, { close: true, capA: true, capB: true, crease: 60 });
    fx.add(merge([one, mirrorW(one)]), 'glow_red');
  }

  // ------------------------------------------------------------------ head: eyes (hero), teeth, jaw, molten core
  {
    const eyes = hpart('fx_eyes', { pivot: [FACE.s, FACE.eyeT, 0], extras: { hero: true, pv: { gem: 2.6, coreTint: '#ff2a1a', irid: 0.15 } } });
    for (const [ex, ey] of EYES) {
      const gem = new THREE.SphereGeometry(FACE.eyeR - 0.8, 28, 16);
      gem.scale(0.62, 1, 1); gem.translate(0, ey, -ex);
      eyes.add(fin(gem, 85), 'crystal');
      // gold bezel + four claws on each face, two domed rivets beside the eye
      for (const sd of [1, -1]) {
        const bz = new THREE.TorusGeometry(FACE.eyeR + 0.6, 1.5, 8, 40);
        bz.rotateY(Math.PI / 2); bz.translate(sd * (HW + 0.9), ey, -ex);
        H.add(fin(bz, 70), GOLD);
        for (let c = 0; c < 4; c++) {
          const a = (c / 4) * TAU + Math.PI / 4, cs = Math.cos(a), sn = Math.sin(a);
          H.add(taper([[ex + cs * (FACE.eyeR + 2.2), ey + sn * (FACE.eyeR + 2.2), sd * (HW + 1.2)], [ex + cs * (FACE.eyeR - 0.6), ey + sn * (FACE.eyeR - 0.6), sd * (HW + 4.2)], [ex + cs * (FACE.eyeR - 3.4), ey + sn * (FACE.eyeR - 3.4), sd * (HW + 5.0)]], 1.7, 0.7, { seg: 6, radial: 5 }), GOLD);
        }
        for (const ds of [-1, 1]) {
          const rv = new THREE.SphereGeometry(2.2, 10, 6, 0, TAU, 0, Math.PI / 2);
          rv.rotateZ(-sd * Math.PI / 2); rv.translate(sd * (HW + 0.6), ey + 26, -(ex + ds * 15));
          H.add(fin(rv, 80), GOLD);
        }
      }
    }
    // upper fangs (bronze, gold tips) hanging from the top lip into the mouth
    const S = FACE.s, tops = [-56, -38, -19, 0, 19, 38, 56];
    tops.forEach((ds, i) => {
      const s = S + ds, top = mouthTop(s) + 1, L = i === 1 || i === 5 ? 18 : 12, wd = i === 1 || i === 5 ? 6.5 : 7.5;
      H.add(profile([[s - wd, top, 1], [s + wd, top, 1], [s + wd * 0.55, top - L * 0.7, 2], [s, top - L, 1.2], [s - wd * 0.55, top - L * 0.7, 2]], { w: 7.6, bevel: 1.1, bevelSeg: 2, curveSeg: 3 }), BRONZE);
      H.add(profile([[s - wd * 0.62, top - L * 0.62, 1], [s + wd * 0.62, top - L * 0.62, 1], [s, top - L - 0.6, 1]], { w: 8.2, bevel: 0.6, bevelSeg: 1, curveSeg: 2 }), GOLD);
    });
    // the jaw: lower lip plate + teeth, slides down into the body when the mask roars (open = 1)
    const jaw = hpart('fx_jaw', { pivot: [S, FACE.mouthT - 10, 0], extras: { open: [0, -0.019 * K, 0], order: 0 } });
    const mid = (s) => lerp(mouthBot(s), mouthTop(s), 0.4);
    const plate = []; { const n = 20; for (let i = 0; i <= n; i++) { const s = lerp(S - 64, S + 64, i / n); plate.push([s, mouthBot(s) + 1.4]); } for (let i = n; i >= 0; i--) { const s = lerp(S - 64, S + 64, i / n); plate.push([s, mid(s)]); } }
    jaw.add(profile(plate, { w: 8.4, bevel: 1.0, bevelSeg: 2, curveSeg: 3 }), BRONZE);
    [-47, -28, -9.5, 9.5, 28, 47].forEach((ds, i) => {
      const s = S + ds, b = mid(s) - 1, L = i === 0 || i === 5 ? 14 : 10, wd = 7;
      jaw.add(profile([[s - wd, b, 1], [s + wd, b, 1], [s + wd * 0.5, b + L * 0.7, 2], [s, b + L, 1.2], [s - wd * 0.5, b + L * 0.7, 2]], { w: 7.2, bevel: 1.0, bevelSeg: 2, curveSeg: 3 }), BRONZE);
      jaw.add(profile([[s - wd * 0.58, b + L * 0.62, 1], [s + wd * 0.58, b + L * 0.62, 1], [s, b + L + 0.6, 1]], { w: 7.8, bevel: 0.5, bevelSeg: 1, curveSeg: 2 }), GOLD);
    });
    // molten core between the teeth: a thin ember plate in the blade's mid-plane (seen from both faces)
    const core = hpart('fx_mouth', { pivot: [S, FACE.mouthT, 0], extras: { energy: true } });
    const cp = []; { const n = 18; for (let i = 0; i <= n; i++) { const s = lerp(S - 62, S + 62, i / n); cp.push([s, lerp(mouthBot(s), mouthTop(s), 0.18)]); } for (let i = n; i >= 0; i--) { const s = lerp(S - 62, S + 62, i / n); cp.push([s, lerp(mouthBot(s), mouthTop(s), 0.86)]); } }
    core.add(profile(cp, { w: 1.4, bevel: 0.4, bevelSeg: 1, curveSeg: 3 }), 'glow_orange');
  }

  // ------------------------------------------------------------------ head: socket sleeve (闌), lashings
  {
    // a bronze sleeve hugging the front of the haft, flowing into the blade's rear edge; beaded lips top and bottom
    const T0 = hp([0, BODY.t0])[1], T1 = hp([0, BODY.t1])[1];
    const sl = [[RW + 0.2, T0 - 4], [RW + 2.4, T0 - 3], [RW + 3.4, T0 + 2], [RW + 3.4, T1 - 2], [RW + 2.4, T1 + 3], [RW + 0.2, T1 + 4]];
    const PH0 = Math.PI * 0.46, ARC = Math.PI * 1.08;
    g.add(revT(sl, { seg: 22, arc: ARC, phase: PH0, what: 'sleeve' }), BRONZE);
    for (const [phi, f] of [[PH0, 1], [PH0 + ARC, -1]]) {   // end caps (the shell's cut faces behind the blade)
      const pts2 = sl.map(([r, t]) => [r, t]), tri = THREE.ShapeUtils.triangulateShape(pts2.map(([r, t]) => new THREE.Vector2(r, t)), []);
      const P3 = pts2.map(([r, t]) => [-Math.cos(phi) * r * RS / RW, t, Math.sin(phi) * r]);
      const idx = []; for (const [a, b, c] of tri) f > 0 ? idx.push(a, c, b) : idx.push(a, b, c);
      g.add(mesh(P3, idx, 30), BRONZE);
    }
    for (const t of [T0 - 1.5, T1 + 1.5]) {
      const pts = []; for (let i = 0; i <= 26; i++) { const a = (i / 26 - 0.5) * Math.PI * 1.05; pts.push([Math.cos(a) * (RW + 3.6) * RS / RW, t, Math.sin(a) * (RW + 3.6)]); }
      g.add(tubeAlong(pts, 1.3, { seg: 40, radial: 6 }), GOLD);
    }
    // rawhide lashings: three figure-eights through each slot and round the back of the haft
    const sx = hp([BODY.rear + 14, 0])[0];   // slot centre (s)
    for (const t of LASH.map((x) => hp([0, x])[1])) {
      for (let k = 0; k < 3; k++) {
        const pts = [], dt = (k - 1) * 6.5;
        for (let i = 0; i < 28; i++) {
          const a = i / 28 * TAU;
          pts.push([(sx - 22) / 2 + 0.5 + (sx + 22) / 2 * Math.cos(a), t + dt + 3 * Math.cos(a) + 1.2 * Math.sin(2 * a + k), (RW + 5) * Math.sin(a)]);
        }
        g.add(tubeAlong(pts, 2.2, { seg: 44, radial: 6, closed: true }), 'leather_grain');
      }
    }
  }

  // ------------------------------------------------------------------ 內 (tang): mosaic plaque, 夔 dragon, tassel lug
  {
    const { s0, s1, t0, t1 } = TANG;
    const hx = s1 + 22, hy = t0 - 20;   // tassel lug hole
    const plq = [[s0 + 6, t0, 1], [s1 + 42, t0, 4], [s1 + 38, t0 - 20, 8], [hx, t0 - 35, 9], [s1 + 6, t0 - 24, 8], [s1, t0, 3], [s1, t1 - 14, 10], [s1 + 13, t1, 8], [s0 + 6, t1, 1]];
    H.add(profile(plq, { w: 9, bevel: 1.2, bevelSeg: 2, curveSeg: 4, holes: [circle(hx, hy, 4.6)] }), BRONZE);
    // raised frame and a field of turquoise tiles (each its own chip) under a bronze 夔 dragon
    const fr = [[s0 - 4, t0 + 7], [s1 + 11, t0 + 7], [s1 + 11, t1 - 7], [s0 - 4, t1 - 7]];
    H.add(ringRelief(fr, 2.2, 1.5, { w0: 4.5 }, 200), BRONZE);
    const tiles = [];
    let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let row = 0, t = t0 + 11.5; t < t1 - 11; row++, t += 7.2) {
      for (let s = s0 - 9 - (row % 2) * 3.6; s > s1 + 14; s -= 7.2) {
        const tw = 5.9 + rnd() * 0.5, th = 5.9 + rnd() * 0.4, h = 0.9 + rnd() * 0.4;
        const tile = profile([[s - tw / 2, t - th / 2], [s + tw / 2, t - th / 2], [s + tw / 2, t + th / 2], [s - tw / 2, t + th / 2]], { w: h, cw: 4.5 + h / 2 - 0.2, bevel: 0.25, bevelSeg: 1, curveSeg: 1 });
        tiles.push(tile, mirrorW(tile));
      }
    }
    H.add(merge(tiles), TURQ);
    // 夔: an S body from the head (near the haft) to a curled tail, a hooked crest, a round eye
    const S0 = s0 - 12, kui = [[S0, t0 + 52], [S0 - 22, t0 + 60], [S0 - 52, t0 + 46], [S0 - 82, t0 + 24], [S0 - 108, t0 + 22], [S0 - 124, t0 + 38], [S0 - 116, t0 + 52], [S0 - 104, t0 + 46]];
    H.add(line(resample(quad(kui[0], kui[1], kui[2], 6).concat(quad(kui[2], kui[3], kui[4], 8).slice(1), quad(kui[4], kui[5], kui[6], 6).slice(1), [kui[7]]), 2.5), (u) => 3.2 - 2.1 * u, 1.9, { w0: 4.5 }), BRONZE);
    H.add(line(quad([S0 - 4, t0 + 56], [S0 + 4, t0 + 74], [S0 - 16, t0 + 72], 8), 1.6, 1.8, { w0: 4.5 }), BRONZE);
    H.add(line([[S0 - 30, t0 + 52], [S0 - 34, t0 + 40], [S0 - 30, t0 + 30]], 1.4, 1.8, { w0: 4.5 }), BRONZE);
    H.add(relief(arcP(S0 - 8, t0 + 50, 4.2, 0, 340, 16), 2.1, { w0: 4.5 }), GOLD);
    // tassel: a gold ring through the lug, a bronze cap, 44 red horsehair strands in clumps (pendulum)
    const ts = hpart('fx_tassel', { pivot: [hx, hy, 0], extras: { swing: 'pendulum', len: 0.09 } });
    const rg = new THREE.TorusGeometry(7, 1.5, 8, 24); rg.translate(0, hy - 4, -hx);
    ts.add(fin(rg, 70), GOLD);
    ts.add(revT([[0, hy - 10], [4, hy - 11], [8, hy - 16], [9.5, hy - 24], [8.2, hy - 30], [9, hy - 33], [0, hy - 33]], { seg: 16, ks: 1, s: hx, what: 'tcap' }), BRONZE);
    ts.add(beadRing(hy - 31.5, 9.3, 0.9, 16, 1, 1).translate(0, 0, -hx), GOLD);
    const strands = [];
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * TAU + (i % 3) * 0.2, r0 = 3 + (i % 4) * 1.6, L = 120 + ((i * 37) % 30), sway = 3 * Math.sin(i * 1.7);
      strands.push(taper([[hx + Math.cos(a) * r0, hy - 32, Math.sin(a) * r0], [hx + Math.cos(a) * (r0 + 3), hy - 50, Math.sin(a) * (r0 + 3)],
        [hx + Math.cos(a) * (r0 + 6) + sway, hy - 32 - L * 0.6, Math.sin(a) * (r0 + 6)], [hx + Math.cos(a + 0.06) * (r0 + 8) + sway * 1.6, hy - 32 - L, Math.sin(a + 0.06) * (r0 + 8)]], 0.9, 0.35, { seg: 8, radial: 4 }));
    }
    ts.add(merge(strands), 'silk_red');
  }

  // ------------------------------------------------------------------ fx_flare: the projected energy crescent
  {
    const fl = hpart('fx_flare', { pivot: [262, 587, 0], extras: { energy: true, restHidden: true } });
    const o = [], n = 60;
    for (let i = 0; i <= n; i++) { const u = i / n, d = -(1.5 + 62 * Math.pow(Math.sin(Math.PI * u), 0.75)); o.push(at(u, d)); }
    for (let i = n; i >= 0; i--) o.push(at(i / n, -0.6));
    fl.add(profile(o, { w: 1.2, bevel: 0.4, bevelSeg: 1, curveSeg: 2 }), 'glow_white');
  }

  // ======================================================================== sockets & meta
  g.socket('grip_r', [0, 204, 0], { rot: [0, 0, -6] });
  g.socket('grip_l', [0, -195, 0]);
  const e = EDGE(0.5), eU = EDGE(0.97), eL = EDGE(0.03);
  const HS = { head: [FACE.s, 587, 0], edge: [e[0], e[1], 0], hornU: [eU[0], eU[1], 0], hornL: [eL[0], eL[1], 0], mid: [BODY.rear, 587, 0],
    eyes: [FACE.s, FACE.eyeT, HW + 3], mouth: [FACE.s, FACE.mouthT, HW + 2], tang: [TANG.s1 + 22, TANG.t0 - 20, 0], blade: [e[0] - 120, e[1], 0] };
  for (const [k, v] of Object.entries(HS)) g.socket(k, hp(v));
  for (const k of ['tip', 'muzzle']) g.socket(k, hp(HS.edge));
  g.socket('base', hp(HS.mid));
  g.socket('butt', [0, -640, 0]);
  g.socket('top', [0, 885, 0]);
  g.meta({
    grip: 'melee', support: 'vertical', reload: 'none', series: 'shanhai',
    notes: 'X05 刑天．舞戚 great axe. t = haft axis (head +t), s = cutting direction, w = blade normal (+w faces the player). '
      + 'fx_eyes: hero crystal eyes. fx_jaw: lower teeth, slides down 19 mm (open 0..1). fx_mouth: molten core between the teeth. '
      + 'fx_seam: glowing seam at the bronze lip over the iron edge. fx_flare: projected energy crescent, restHidden (scale about '
      + 'the pivot grows it out of the edge). fx_tassel: pendulum. Sockets hornL / hornU span the cutting edge (trails).',
  });
  // bake: pre-tessellated (glaze / leather finer, metal coarser; thin slivers kept whole), glow parts left out of the
  // occluders, then m4's post-bake (buried AO refill, per-material wear, flat faces unworn)
  g.build = (o = {}) => {
    const root = Gun.prototype.build.call(g, { ...o, bake: false });
    if (o.bake === false) return root;
    const meshes = [];
    root.traverse((m) => { if (m.isMesh && !/^(glass_|glow_)/.test(m.userData.mat)) meshes.push(m); });
    const tess = (o.tessellate ?? TESS) * 0.001;
    for (const m of meshes) {
      const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
      for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
      m.geometry = tessellateFat(geo, /^(glaze_|leather)/.test(m.userData.mat) ? tess : tess * TESS_K, 0.0016);
    }
    if (o.tessOnly) return root;
    const relief = (m) => (/^(bronze|gold)/.test(m.userData.mat) ? 0.0012 : /^(steel|chrome)/.test(m.userData.mat) ? 0.0008 : 0);
    bakeMeshes(meshes, { tessellate: 0, aoDist: 0.024, rays: 32, log: true, minHeight: relief });
    postBake(root, { cos: 0.99999 }, WEAR);
    return root;
  };
  return g;
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
  '*:bronze_aged': [1 / 450, 0.75], '*:gold': [1 / 500, 0.55], '*:gold_leaf': [1 / 450, 0.6],
  '*:steel': [1 / 700, 0.4], '*:steel_bright': [1 / 600, 0.3], '*:chrome': [1 / 600, 0.2],
  '*:lacquer_black': [1 / 500, 0.45], '*:lacquer_red': [1 / 500, 0.4], '*:leather_grain': [1 / 450, 0.5],
  '*:glaze_turquoise': [0, 0], '*:crystal': [0, 0], '*:silk_red': [0, 0],
};
