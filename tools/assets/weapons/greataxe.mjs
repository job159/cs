// 刑天．舞戚 Xingtian Wardancer — 神兵 X05 great axe (docs/PREMIUM_WEAPONS.md §2.32).
// 「刑天……以乳為目，以臍為口，操干戚以舞」: a Shang-style bronze 鉞 (yue) blown up to mythic size on a 1.5 m black-lacquered
// haft. The axe IS Xingtian's face: the blade carries a cast human mask whose eyes are two crimson stones and whose
// grinning toothed mouth is open-cut through the bronze (the lower teeth on a sliding jaw that drops when the axe roars,
// a molten core glowing between the teeth). Built like a real 鐵刃銅鉞: a forged iron edge cast into the bronze.
//   - blade body: one cast bronze relief (lib/hfield.mjs heightfield, both faces): 16 mm at the socket thinning to 9 at
//     the seam, a low dome over the face; a raised frame along the shoulders and the rear edge; 雲雷紋 gold spirals over
//     turquoise floors in channels along both shoulders; cast studs between three lashing slots; a raised lip line
//     following the bronze tongues over the iron; an original 族徽 (a 亞 cartouche with an intaglio headless dancer)
//   - iron edge: a lofted band (7 mm at the seam -> 0.7 mm at the cutting line) whose faces carry a forged flat, a
//     ground bevel and a mirror micro-bevel; it tapers into both horn tips. A molten seam glows in the joint (fx_seam)
//   - mask (sculpted, both faces): a raised face plateau with a rolled rim, fierce brow ridges under gold leaf sinking
//     towards the nose, recessed almond sockets with rolled lids, a lofted nose with flared wings and drilled nostrils,
//     cheekbones, curled ears, rolled lips round the open mouth ending in spirals, a rhomb on the brow; faceted crimson
//     eye stones with an iris dish and a slit pupil in gold bezels on claws (fx_eyes, the hero); tapered upper fangs with
//     gold caps; the jaw (fx_jaw) with the lower teeth; the molten core (fx_mouth) filling the throat
//   - socket: a bronze sleeve hugging the haft front (闌) with beaded lips; rawhide straps through the slots, knotted
//   - 內 (tang): a tapered cast plaque behind the haft with a raked end: a bronze 夔 dragon in relief over a mosaic of
//     irregular turquoise chips, a pierced lug carrying the red horsehair tassel (fx_tassel, pendulum)
//   - haft: black lacquer, cinnabar bands between gold 雷紋 inlay bands, two leather grips wrapped in overlapping spirals
//     under a woven over-under silk ribbon lattice between beaded bronze ferrules, bronze collars over and under the head,
//     a flame-crown finial and an octagonal 鐏 butt with a stud band and a cruciform spike
//   - fx_flare: the projected energy crescent beyond the edge (restHidden; the special grows it for heavy blows)
// Side view mm: t along the haft (head +t), s = cutting direction (edge +s), w = blade normal (+w faces the player in
// first person). The right hand holds the upper grip at t = 200 like a pistol grip (viewmodel conventions).
import * as THREE from 'three';
import { toCreasedNormals, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';
import { Gun, V, profile, merge, xform } from '../lib/gunkit.mjs';
import { mesh as smesh, ribbonT, mapTris, petal } from '../lib/sculpt.mjs';
import { SegIndex, hfFace, mirror, sheet, roundDrop, halfRound, bump, sstep, horizonAO } from '../lib/hfield.mjs';
import { bakeMeshes } from '../lib/bake.mjs';
import { postBake } from './m4.mjs';

const D2R = Math.PI / 180;
const TAU = Math.PI * 2;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, u) => a + (b - a) * u;
const smooth = (a, b, x) => { const u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); };
const BRONZE = 'bronze_aged', GOLD = 'gold', LEAF = 'gold_leaf', TURQ = 'glaze_turquoise';

// ------------------------------------------------------------------------------------------ layout (mm)
const RS = 19, RW = 17;            // haft half axes (s, w): an oval
const HAFT = [-480, 797];          // lacquered haft between the butt and the finial
const BODY = { rear: 21, t0: 405, t1: 745 };   // blade body along the haft front (head units, see K)
// the head is authored in its own units and scaled by K about the haft front (HPV): one knob for its size
const K = 1.15, HPV = [21, 587, 0];
const hp = ([s, t, w = 0]) => [HPV[0] + (s - HPV[0]) * K, HPV[1] + (t - HPV[1]) * K, w * K];
// the crescent edge: an arc (centre CE, radius RE) from the lower horn (u 0, t 310) to the upper horn (u 1, t 865)
const CE = [-259.9, 587.5], RE = 624.9, TH0 = -26.36 * D2R, TH1 = 26.36 * D2R;
const FLARE = 34;                  // the horn tips flare out (and away from the middle) past the arc
const EDGE = (u) => { const a = lerp(TH0, TH1, u), f = FLARE * Math.pow(Math.abs(2 * u - 1), 5); return [CE[0] + Math.cos(a) * RE + f, CE[1] + Math.sin(a) * RE + Math.sign(u - 0.5) * f * 0.75]; };
const EIN = (u) => { const a = lerp(TH0, TH1, u); return [-Math.cos(a), -Math.sin(a)]; };     // inward (towards the body)
const UM = [0.085, 0.915];         // where the shoulders meet the seam
const DMAX = 76;                   // iron band depth (seam side hidden under the bronze lip)
const BAND = (u) => DMAX * Math.max(0.006, Math.min(smooth(0, 0.13, u), smooth(1, 0.87, u)));   // narrows to the horn points
// the bronze lip: cast tongues lapping over the iron (~55 mm of iron shows: a broad forged crescent)
const SEAM = (u) => 60 - 9 * Math.pow(0.5 + 0.5 * Math.sin(u * TAU * 6.5 + 0.9), 2.2);
const at = (u, d) => { const e = EDGE(u), n = EIN(u); return [e[0] + n[0] * d, e[1] + n[1] * d]; };
// face
const FACE = { s: 160, eyeT: 640, eyeDs: 43, eyeR: 17, mouthT: 520 };
const S = FACE.s;
const EYES = [[FACE.s - FACE.eyeDs, FACE.eyeT], [FACE.s + FACE.eyeDs, FACE.eyeT]];
// the eyes are almonds: the round stone layout (radius eyeR) stretched EYE_K and turned up at the outer corner (獰)
const EYE_K = [1.4, 0.6], EYE_TILT = 0.26;
/** (s, t) round-eye layout -> the tilted almond eye centred on e */
const eyeXf = ([ex, ey], s, t) => { const sd = ex < S ? -1 : 1, a = sd * EYE_TILT, x = (s - ex) * EYE_K[0], y = (t - ey) * EYE_K[1]; return [ex + x * Math.cos(a) - y * Math.sin(a), ey + x * Math.sin(a) + y * Math.cos(a)]; };
/** a point in the eye's own tilted frame (no stretch) */
const eyeL = ([ex, ey], x, y) => { const sd = ex < S ? -1 : 1, a = sd * EYE_TILT; return [ex + x * Math.cos(a) - y * Math.sin(a), ey + x * Math.sin(a) + y * Math.cos(a)]; };
const LASH = [452, 585, 704];      // lashing slots (t)
const SLOT = { s0: BODY.rear + 9.5, s1: BODY.rear + 15.5, h: 8 };   // slot s range and half height
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
  const g = mesh(pts, idx, crease);
  // a capped loft is a closed solid: wind it outward whichever way its rings run
  if (capA && capB && volume(g) < 0) { const p = g.attributes.position.array, n = g.attributes.normal.array; for (let i = 0; i < p.length; i += 9) for (let c = 0; c < 3; c++) { let t = p[i + 3 + c]; p[i + 3 + c] = p[i + 6 + c]; p[i + 6 + c] = t; t = n[i + 3 + c]; n[i + 3 + c] = n[i + 6 + c]; n[i + 6 + c] = t; } for (let i = 0; i < n.length; i++) n[i] = -n[i]; }
  return g;
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
  const N = n * 4, R = 4, pts = [], idx = [];
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
/** both faces of a +w-side geometry (mirror keeps the normals right; gunkit mirrorW flips normal.x twice) */
const both = (g) => merge([g, mirror(g)]);
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
/** closed Catmull-Rom loop (or open curve) through [x, y] control points, about `step` mm apart */
function crv(P, step = 2, closed = true) {
  const C = new THREE.CatmullRomCurve3(P.map(([x, y]) => new THREE.Vector3(x, y, 0)), closed, 'centripetal');
  const o = C.getSpacedPoints(Math.max(4, Math.round(C.getLength() / step))).map((v) => [v.x, v.y]);
  if (closed) o.pop();
  return o;
}
/** spiral polyline: centre (cx, cy), from angle a0 (deg) turning `turns` (sign = direction), radius r0 -> r1, 6 deg steps */
function spiral(cx, cy, a0, turns, r0, r1, ry = 1) {
  const n = Math.ceil(Math.abs(turns) * 60), o = [];
  for (let i = 0; i <= n; i++) { const u = i / n, a = (a0 + turns * 360 * u) * D2R, r = lerp(r0, r1, u); o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * ry]); }
  return o;
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
/** signed lateral offset from an open polyline in a SegIndex (side > 0 towards +t), with its arc fraction u */
function lateral(I, s, t, maxD) {
  const n = I.near(s, t, maxD);
  if (!n) return null;
  const g = I.S[n.k];
  let nx = -(g.by - g.ay), ny = g.bx - g.ax;
  if (ny < 0) { nx = -nx; ny = -ny; }
  const side = (s - g.ax) * nx + (t - g.ay) * ny;
  return { d: n.d, side: side >= 0 ? 1 : -1, u: n.u / n.len, li: n.li };
}
/** capsule distance (2D) */
/** C1 bevel (smoothstep) from 0 at sd 0 to 1 at sd b: every feature foot fillets into the ground, so the analytic
 *  normals have no crease to jag along */
const bev = (sd, b) => sstep(0, b, sd);
/** smooth union of non-negative heights (p-norm: exact where either is 0, a mild swell where they merge) */
const uni = (a, b, p = 5) => (a <= 0 ? Math.max(0, b) : b <= 0 ? a : Math.pow(a ** p + b ** p, 1 / p));
const capD = (x, y, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9; const k = clamp01(((x - ax) * dx + (y - ay) * dy) / L2); return Math.hypot(x - ax - dx * k, y - ay - dy * k); };

// ------------------------------------------------------------------------------------------ the blade (heightfield)
// outline: lower shoulder -> the seam (bronze tongues over the iron) -> upper shoulder -> straight rear edge
const pL = at(UM[0], SEAM(UM[0])), pU = at(UM[1], SEAM(UM[1]));
const shoulderL = quad([BODY.rear, BODY.t0], [190, BODY.t0 + 24], pL, 24);
const shoulderU = quad([BODY.rear, BODY.t1], [190, BODY.t1 - 22], pU, 24);
const seamLine = []; for (let k = 0; k <= 300; k++) { const u = lerp(UM[0], UM[1], k / 300); seamLine.push(at(u, SEAM(u))); }
const outline = [...shoulderL, ...seamLine.slice(1, -1), ...shoulderU.slice().reverse()];
const mouthTop = (s) => FACE.mouthT + 24 - 15 * ((s - FACE.s) / 72) ** 2;   // both lips pull down at the corners: a snarl
const mouthBot = (s) => FACE.mouthT - 18 - 10 * ((s - FACE.s) / 72) ** 2;
const mouthLoop = (() => { const o = [], n = 40; for (let i = 0; i <= n; i++) { const s = lerp(S - 70, S + 70, i / n); o.push([s, mouthBot(s)]); } for (let i = n - 1; i > 0; i--) { const s = lerp(S - 70, S + 70, i / n); o.push([s, mouthTop(s)]); } return o; })();
const slotLoop = (t) => { const { s0, s1, h } = SLOT, r = 2.6; return [...arcP(s1 - r, t - h + r, r, -90, 0, 4), ...arcP(s1 - r, t + h - r, r, 0, 90, 4), ...arcP(s0 + r, t + h - r, r, 90, 180, 4), ...arcP(s0 + r, t - h + r, r, 180, 270, 4)]; };
const eyeLoop = (e) => arcP(e[0], e[1], FACE.eyeR, 0, 360 - 5, 71).map(([s, t]) => eyeXf(e, s, t));
// the mask
const FACE_R = [[0, 713], [48, 709], [86, 696], [99, 660], [101, 622], [98, 576], [93, 524], [76, 478], [44, 452]];
const faceLoop = crv([...FACE_R.map(([x, y]) => [S + x, y]), [S, 444], ...FACE_R.slice(1).reverse().map(([x, y]) => [S - x, y])], 2);
// the socket: an almond round the eye, its outer corner flicked out
const almond = (e) => { const sd = e[0] < S ? -1 : 1, a = eyeL(e, -sd * 31, -1), b = eyeL(e, sd * 37, 1.5); return [...quad(a, eyeL(e, sd * 2, 31), b, 30), ...quad(b, eyeL(e, sd * 3, -27), a, 30).slice(1, -1)]; };
// brows: near-straight bars slanting down to a knot over the nose (a scowl), not arches
const browLine = ([ex, ey]) => { const sd = ex < S ? -1 : 1; return quad([ex - sd * 35, ey + 7], [ex + sd * 4, ey + 25], [ex + sd * 47, ey + 41], 32); };
const lipSpiral = (sd) => spiral(S + sd * 83, FACE.mouthT - 12, sd > 0 ? 180 : 0, -sd * 1.6, 9.5, 2.6);
const EAR = { ds: 104, t: 628, rx: 11, ry: 20 };
const earC = (sd) => { const o = []; for (let i = 0; i <= 50; i++) { const a = (125 - 250 * i / 50) * D2R; o.push([S + sd * (EAR.ds + EAR.rx * Math.cos(a)), EAR.t + EAR.ry * Math.sin(a)]); } return o; };
const earCurl = (sd) => spiral(0, 0, -125, -1.25, 8.5, 2.2).map(([x, y]) => [S + sd * (EAR.ds + 0.5 + x), EAR.t + 2 + y * 1.5]);
// shoulder 雲雷紋 bands (channels with turquoise floors and gold spirals)
const bands = [[shoulderL, 1], [shoulderU, -1]].map(([path, sd]) => {
  const F = curveFrame(path), U0 = 16, U1 = F.len - 26, H = 15, V0 = 8.5;
  const map = (u, v) => F.map(U0 + u, sd * (V0 + v));
  const loop = [];
  for (let u = 0; u <= U1 - U0; u += 3) loop.push(map(u, 0));
  loop.push(map(U1 - U0, 0));
  for (let u = U1 - U0; u >= 0; u -= 3) loop.push(map(u, H));
  if (loop.at(-1)[0] !== map(0, H)[0]) loop.push(map(0, H));
  return { map, U: U1 - U0, H, loop };
});
// 族徽: a 亞 cartouche (raised) with an intaglio headless dancer, low on the cheek side towards the edge
const EMB = { cx: 268, cy: 497, a: 12, b: 26, n: 5 };
const yaLoop = (() => { const { cx, cy, a, b, n } = EMB; return [[cx - a + n, cy - b], [cx + a - n, cy - b], [cx + a - n, cy - b + n], [cx + a, cy - b + n], [cx + a, cy + b - n], [cx + a - n, cy + b - n], [cx + a - n, cy + b], [cx - a + n, cy + b], [cx - a + n, cy + b - n], [cx - a, cy + b - n], [cx - a, cy - b + n], [cx - a + n, cy - b + n]]; })();
/** the dancer pictograph (distance < 0 inside), cartouche-local mm: a headless torso (eyes on the chest, a navel mouth),
 *  splayed legs, the shield disc on the left, the axe raised on the right */
function dancerSD(x, y) {
  let d = capD(x, y, 0, -4, 0, 8.5) - 3.1;                                           // torso
  d = Math.min(d, capD(x, y, -1.2, -4, -5, -16.5) - 1.5, capD(x, y, 1.2, -4, 5, -16.5) - 1.5);   // legs
  d = Math.min(d, capD(x, y, -5, -16.5, -8, -17.5) - 1.0, capD(x, y, 5, -16.5, 8, -17.5) - 1.0); // feet
  d = Math.min(d, capD(x, y, -2, 7, -5.2, 4) - 1.0, Math.hypot(x + 7.2, y - 3) - 3.4);          // shield arm + shield
  d = Math.min(d, capD(x, y, 2, 7, 5.5, 12.5) - 1.0, capD(x, y, 5.5, 9, 5.5, 20) - 0.8);         // axe arm + haft
  const ax = Math.max(Math.hypot(x - 6, y - 17.5) - 3.6, 5.6 - x);                                // axe head (half disc)
  d = Math.min(d, ax);
  const eyes = Math.min(Math.hypot(x + 1.3, y - 5.5), Math.hypot(x - 1.3, y - 5.5)) - 0.75, navel = capD(x, y, -1.1, -0.5, 1.1, -0.5) - 0.5;
  return Math.max(d, -Math.min(eyes, navel));                                          // chest eyes / navel stay raised
}

const blade = (() => {
  const idx = (lines, B = 4) => new SegIndex(lines, B);
  const RI = idx([{ pts: resample(outline, 1.2, true), closed: true, tag: 'out' }, ...EYES.map((e) => ({ pts: eyeLoop(e), closed: true, tag: 'eye' })),
    { pts: mouthLoop, closed: true, tag: 'mouth' }, ...LASH.map((t) => ({ pts: slotLoop(t), closed: true, tag: 'slot' }))], 3.6);
  const FR = idx([{ pts: shoulderL }, { pts: shoulderU }, { pts: [[BODY.rear, BODY.t1], [BODY.rear, BODY.t0]] }]);
  const SM = idx([{ pts: seamLine }]);
  const FO = idx([{ pts: faceLoop, closed: true }]);
  const AL = EYES.map((e) => idx([{ pts: almond(e), closed: true }], 3));
  const BR = EYES.map((e) => idx([{ pts: browLine(e) }], 3));
  const MO = idx([{ pts: mouthLoop, closed: true }], 3);
  const SP = idx([{ pts: lipSpiral(1) }, { pts: lipSpiral(-1) }], 2);
  const EA = idx([{ pts: earC(1) }, { pts: earC(-1) }], 3), EC = idx([{ pts: earCurl(1) }, { pts: earCurl(-1) }], 2);
  const BA = idx(bands.map((b) => ({ pts: b.loop, closed: true })), 4);
  const YA = idx([{ pts: yaLoop, closed: true }], 2);
  const SL = idx(LASH.map((t) => ({ pts: slotLoop(t), closed: true })), 3);
  const STUDS = [BODY.t0 + 20, (LASH[0] + LASH[1]) / 2 - 16, (LASH[0] + LASH[1]) / 2 + 16, (LASH[1] + LASH[2]) / 2, BODY.t1 - 20].map((t) => [BODY.rear + 12.5, t]);
  const hBase = (s) => 4.6 + 2.4 * (1 - sstep(30, 290, s));
  const dome = (s, t) => 3.4 * bump(s, t, S, 586, 140, 190);
  const floors = EYES.map(([ex, ey]) => hBase(ex) + dome(ex, ey) + 3.4 - 3.6);   // deep sockets: the stones sit flush, hooded
  const inBox = (s, t, x0, x1, y0, y1) => s > x0 && s < x1 && t > y0 && t < y1;
  /** the mask relief above the plateau (union of the raised features) */
  function mask(s, t) {
    let r = 0;
    // brows: wedges rising from the nose to the outer third, crisp towards the forehead, sloping into the sockets
    for (let i = 0; i < 2; i++) {
      if (!inBox(s, t, EYES[i][0] - 50, EYES[i][0] + 58, 630, 700)) continue;
      const L = lateral(BR[i], s, t, 16);
      if (!L) continue;
      const u = L.u, hh = (u < 0.35 ? lerp(3.4, 6.0, smooth(0, 0.35, u)) : lerp(6.0, 0.4, smooth(0.35, 1, u))), hw = u < 0.3 ? lerp(6, 8.5, u / 0.3) : lerp(8.5, 3.5, (u - 0.3) / 0.7);
      const x = L.side * L.d / hw;
      const p = x >= 0 ? 1 - sstep(0.6, 1.0, x) : 1 - sstep(0.45, 1.45, -x);   // flat-topped bar, a crisp edge to the brow, a bevel into the socket
      r = uni(r, hh * p * (0.92 + 0.08 * Math.min(1, Math.abs(x))));
    }
    // lids: rolled lips round the almond sockets
    for (let i = 0; i < 2; i++) {
      if (!inBox(s, t, EYES[i][0] - 42, EYES[i][0] + 42, EYES[i][1] - 30, EYES[i][1] + 32)) continue;
      const sd = AL[i].sd(s, t, 6), up = t > EYES[i][1] ? 1.25 : 0.8;
      r = uni(r, 3.0 * up * halfRound(Math.abs(sd - 1.2), 2.4));
    }
    // nose: a wedge from between the brows widening to a broad base (wings and tip one mass), a rounded tip, the wings
    // creased off it, drilled nostrils
    if (inBox(s, t, S - 30, S + 30, 548, 682)) {
      const u = clamp01((664 - t) / (664 - 572)), hw = 5.5 + 8.5 * Math.pow(u, 1.4), hh = (2.8 + 5.4 * Math.pow(u, 1.2)) * smooth(-0.12, 0.1, (664 - t) / 92) * smooth(556, 580, t);
      const x = Math.abs(s - S) / hw, ridge = x < 1 ? hh * (1 - Math.pow(x, 1.6)) * sstep(1, 0.6, x) : 0;
      const qb = Math.hypot((s - S) / 19.5, (t - 566.5) / 9.5), base = qb < 1 ? 6.4 * Math.pow(1 - qb * qb, 0.6) * sstep(1, 0.72, qb) : 0;
      const qt = Math.hypot((s - S) / 9, (t - 572) / 8.5), tip = qt < 1 ? 9.4 * Math.sqrt(1 - qt * qt) * sstep(1, 0.55, qt) : 0;
      let nose = uni(uni(ridge, base, 4), tip, 4);
      for (const sd of [-1, 1]) {
        const qw = Math.hypot((s - S - sd * 12.5) / 7.5, (t - 565.5) / 6.5);
        nose -= 0.9 * halfRound(Math.abs(qw - 1) * 6.5, 0.9) * smooth(568, 562, t + (qw < 1 ? 6 : 0));   // alar crease
        nose += 0.8 * bump(s, t, S + sd * 13, 566, 7, 6);                                                 // wing swell
      }
      for (const sd of [-1, 1]) {
        const qp = Math.hypot((s - S - sd * 8.4) / 3.5, (t - 561.2) / 2.4);
        if (qp < 1.1) nose = Math.min(nose, lerp(1.0, nose, sstep(0.82, 1.08, qp)));
      }
      r = uni(r, Math.max(0, nose));
    }
    // lips: rolled half rounds round the mouth, corners curling into spirals
    if (inBox(s, t, S - 100, S + 100, 480, 560)) {
      const m = MO.near(s, t, 10);
      if (m && !MO.inside(s, t)) r = uni(r, 4.5 * halfRound(Math.abs(m.d - 3.8), 5.0));
      const sp = SP.near(s, t, 2);
      if (sp) r = uni(r, 2.4 * halfRound(sp.d, 1.5));
    }
    // ears: a C ridge, an inner curl, a lobe, a hollow inside
    if (Math.abs(Math.abs(s - S) - EAR.ds) < 20 && Math.abs(t - EAR.t) < 30) {
      const e = EA.near(s, t, 4), c = EC.near(s, t, 2);
      const sd = s > S ? 1 : -1, qc = Math.hypot((s - S - sd * EAR.ds) / EAR.rx, (t - EAR.t) / EAR.ry);
      const hollow = qc < 0.9 ? 1.1 * smooth(0.9, 0.55, qc) : 0;
      const ear = uni(e ? 4.0 * halfRound(e.d, 3.4) : 0, c ? 2.6 * halfRound(c.d, 1.4) : 0) + 2.6 * bump(s, t, S + sd * (EAR.ds - 2.5), EAR.t - 18, 6.5, 6);
      r = uni(r, ear) - hollow * clamp01(1 - ear);
    }
    // a rhomb boss on the brow
    { const q = Math.abs(s - S) / 9 + Math.abs(t - 693) / 12.5; if (q < 1.2) r = uni(r, 2.2 * bev((1 - q) * 9, 1.4)); }
    // cheekbones and the chin: soft mounds
    r += 2.0 * (bump(s, t, S - 62, 592, 30, 20) + bump(s, t, S + 62, 592, 30, 20)) + 1.4 * bump(s, t, S, 468, 32, 15);
    // the frown: two short creases between the brows, a furrow over the nose root
    for (const sd of [-1, 1]) { const d = capD(s, t, S + sd * 4, 654, S + sd * 6, 678); if (d < 1.6) r -= 0.9 * halfRound(d, 1.4); }
    return r;
  }
  function h(s, t) {
    let z = hBase(s) + dome(s, t);
    // the face: a plateau with a rolled rim carrying the mask; the eye sockets sink to a flat floor
    if (inBox(s, t, S - 130, S + 130, 430, 728)) {
      const sdF = FO.sd(s, t, 6);
      z += 3.4 * bev(sdF, 2.2);   // the plateau, its rim a crisp cast step
      if (sdF > -26) z += mask(s, t);
      for (let i = 0; i < 2; i++) {
        if (!inBox(s, t, EYES[i][0] - 40, EYES[i][0] + 40, EYES[i][1] - 28, EYES[i][1] + 30)) continue;
        const sd = AL[i].sd(s, t, 6);
        if (sd > 2.2) z = lerp(z, floors[i], smooth(2.2, 4.4, sd));
      }
    }
    // raised frame along the shoulders and the rear edge; the cast lip line following the tongues over the iron
    const f = FR.near(s, t, 7);
    if (f) z += 1.6 * (1 - sstep(1.3, 2.6, Math.abs(f.d - 3.4)));
    const m = SM.near(s, t, 9);
    if (m) z += 1.0 * halfRound(Math.abs(m.d - 6.5), 1.3);
    // shoulder channels (turquoise floors laid in later)
    if (t < 450 || t > 700) { const b = BA.sd(s, t, 2); if (b > -1) z -= 0.9 * bev(b, 0.8); }
    // studs and slot surrounds on the rear strip
    if (s < 50) {
      for (const [ss, tt] of STUDS) { const d = Math.hypot(s - ss, t - tt); if (d < 4.2) z += 2.6 * halfRound(d, 4.2); }
      const sl = SL.near(s, t, 4);
      if (sl && !SL.inside(s, t)) z += 1.0 * halfRound(Math.abs(sl.d - 1.9), 1.5);
    }
    // the clan cartouche with its intaglio dancer
    if (inBox(s, t, EMB.cx - EMB.a - 3, EMB.cx + EMB.a + 3, EMB.cy - EMB.b - 3, EMB.cy + EMB.b + 3)) {
      const sy = YA.sd(s, t, 3);
      if (sy > -1) {
        let c = 1.8 * bev(sy, 0.6);
        c -= 0.45 * halfRound(Math.abs(sy - 2.2), 0.45);                    // an incised border line
        const dd = dancerSD(s - EMB.cx, t - EMB.cy);
        if (dd < 0.4) c -= 1.0 * bev(-dd + 0.4, 0.5);
        z += c;
      }
    }
    // rounded edges: 1.6 on the frame, 0.6 at the seam (the iron must stay inside), rolled lips at the mouth
    const e = RI.near(s, t, 1.7);
    if (e) {
      let r = e.tag === 'mouth' ? 1.6 : e.tag === 'eye' ? 1.0 : e.tag === 'slot' ? 0.8 : 1.6;
      if (e.tag === 'out' && SM.near(s, t, 1.8)) r = 0.6;
      z -= roundDrop(e.d, r);
    }
    return z;
  }
  const loops = [{ pts: resample(outline, 1.2, true), tag: 'out' }, ...EYES.map((e) => ({ pts: eyeLoop(e), tag: 'eye' })), { pts: mouthLoop, tag: 'mouth' }, ...LASH.map((t) => ({ pts: slotLoop(t), tag: 'slot' }))];
  // detail zones keep finer cells (the mask, the cartouche, the spirals)
  const refine = (s, t, sz) => (sz > 1.6 && Math.abs(s - EMB.cx) < EMB.a + 2 && Math.abs(t - EMB.cy) < EMB.b + 2);
  const hPolish = (s, t) => h(s, t) - (inBox(s, t, S - 130, S + 130, 430, 728) ? 3.4 * bev(FO.sd(s, t, 6), 2.2) : 0);
  return { h, hPolish, loops, floors, hBase, dome, RI, BR, opts: { tol: 0.08, minCell: 0.6, maxCell: 8, edge: 1.2, refine, decimate: { error: 0.34, normals: 0.3, ao: 0.7, lattice: 10 } } };
})();
export const __blade = blade;   // dev: build/t/ga_mesh.mjs plots its mesh

// ------------------------------------------------------------------------------------------ jewellery helpers
/**
 * Double-sided faceted eye stone through the blade: girdle radius R at |w| = w0 (a plain cylinder between, hidden in
 * the hole), crowns (upper-girdle, kite and star facets) rising hc to an iris dish of radial facets.
 */
function eyeStone(ex, ey, R, w0, hc, n = 24, xf = (s, t) => [s, t]) {
  const P = [], I = [], D = [], pt = (r, a, w) => { P.push(...xf(ex + Math.cos(a) * r, ey + Math.sin(a) * r), w); return P.length / 3 - 1; };
  const d = TAU / n, rings = {};
  for (const sg of [1, -1]) {
    const G = [], Hh = [], U = [], T = [];
    for (let k = 0; k < n; k++) {
      G.push(pt(R, k * d, sg * w0)); Hh.push(pt(R, (k + 0.5) * d, sg * w0));
      U.push(pt(R * 0.84, (k + 0.5) * d, sg * (w0 + hc * 0.42)));
      T.push(pt(R * 0.6 * (k % 2 ? 0.97 : 1), k * d, sg * (w0 + hc - (k % 2 ? 0.16 : 0))));
    }
    const C = pt(0, 0, sg * (w0 + hc - 0.7));
    const tri = (L) => (sg > 0 ? (a, b, c) => L.push(a, b, c) : (a, b, c) => L.push(a, c, b));   // the -w crown is mirrored
    const t1 = tri(I), t2 = tri(D);
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n, km = (k + n - 1) % n;
      t1(G[k], Hh[k], U[k]); t1(Hh[k], G[k1], U[k]);                    // upper girdle
      t1(T[k], U[km], G[k]); t1(T[k], G[k], U[k]);                      // kite
      t1(T[k], U[k], T[k1]);                                            // star
      t2(C, T[k], T[k1]);                                               // iris dish
    }
    rings[sg] = [G, Hh];
  }
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n, [Ga, Ha] = rings[1], [Gb, Hb] = rings[-1];
    I.push(Ga[k], Gb[k], Ha[k], Ha[k], Gb[k], Hb[k], Ha[k], Hb[k], Ga[k1], Ga[k1], Hb[k], Gb[k1]);
  }
  // one closed stone for the winding check, then split: crown + girdle (bright), iris dishes (dark)
  const all = smesh(P, [...I, ...D], { crease: 1, closed: true }), nI = I.length / 3, pa = all.attributes.position.array, na = all.attributes.normal.array;
  const part = (a, b) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pa.slice(a * 9, b * 9), 3)); g.setAttribute('normal', new THREE.BufferAttribute(na.slice(a * 9, b * 9), 3)); return g; };
  return { stone: part(0, nI), iris: part(nI, nI + D.length / 3) };
}
/** a small heightfield solid (teeth, caps, pupils): region `loop`, half thickness th(s, t) (mirrored through w = 0) */
function hfSolid(loop, th, o = {}) {
  const F = hfFace([{ pts: loop, tag: 'o' }], th, { tol: 0.04, minCell: 0.35, maxCell: 2.5, edge: 0.7, decimate: { error: 0.06, normals: 0.3 }, ...o });
  return merge([F.face, mirror(F.face), F.walls]);
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
    // grips: leather wrapped in an overlapping spiral, a woven silk ribbon lattice over it, beaded bronze ferrules
    for (const [t0, t1] of [GRIP_U, GRIP_L]) {
      g.add(gripWrap(t0, t1), 'leather_grain');
      g.add(lattice(t0, t1, RW + 2.3), 'silk_red');
      for (const [a, sd] of [[t0, -1], [t1, 1]]) {
        const b = a + sd * 16;
        const ring = sd > 0 ? [[RW + 0.1, a - 3.5], [RW + 2.6, a - 3], [RW + 3.3, a - 1.8], [RW + 3.3, a + 1], [RW + 2.7, a + 6], [RW + 3.4, a + 9], [RW + 3.4, b - 1.5], [RW + 2.2, b], [RW + 0.1, b]]
          : [[RW + 0.1, b], [RW + 2.2, b], [RW + 3.4, b + 1.5], [RW + 3.4, a - 9], [RW + 2.7, a - 6], [RW + 3.3, a - 1], [RW + 3.3, a + 1.8], [RW + 2.6, a + 3], [RW + 0.1, a + 3.5]];
        g.add(revT(ring, { seg: 40, what: 'ferrule' }), BRONZE);
        g.add(beadRing(a + sd * 3.6, RW + 3.0, 1.15, 22), GOLD);
      }
    }
    // collars under and over the head (the head's sleeve sits between them)
    g.add(revT([[RW, 336], [RW + 2.2, 337], [RW + 3.4, 342], [RW + 3.4, 360], [RW + 4.6, 365], [RW + 4.6, 372], [RW + 2.8, 376], [RW, 377]], { seg: 40, what: 'collarL' }), BRONZE);
    g.add(beadRing(351, RW + 3.6, 1.2, 24), GOLD);
    g.add(revT([[RW, 769], [RW + 2.8, 770], [RW + 4.6, 774], [RW + 4.6, 781], [RW + 3.4, 786], [RW + 3.4, 792], [RW + 2, 796], [RW, 797]], { seg: 40, what: 'collarU' }), BRONZE);
    g.add(beadRing(789, RW + 3.6, 1.1, 24), GOLD);
    // finial (柲冒): a stepped cap, a ring of six flame tongues, a gold knob
    g.add(revT([[0, 797], [RW + 1.5, 797], [RW + 2.5, 801], [RW + 1.2, 817], [RW + 3.5, 823], [RW + 3.5, 828], [14, 833], [10, 849], [12.5, 855], [12.5, 859], [7, 865], [0, 867]], { seg: 40, what: 'finial' }), BRONZE);
    g.add(beadRing(825.5, RW + 3.2, 1.0, 22), GOLD);
    // six flame tongues (long and short): lofted petals bulging out, licking back in at the tips
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU + 0.26, c = Math.cos(a), sn = Math.sin(a), k = i % 2 ? 0.72 : 1;
      g.add(petal([c * 11 * RS / RW, 836, sn * 11], [0, 1, 0], [c, 0, sn], [-sn, 0, c], 50 * k, 7.5 * k, 2.6, { bulge: 9, flick: -5, nu: 14, na: 10, crease: 60 }), BRONZE);
    }
    g.add(revT([[0, 865], [4.5, 865.6], [6.6, 867.5], [7.6, 871], [7.2, 875.5], [5.6, 879.5], [3.2, 882.2], [0, 883]], { seg: 40, ks: 1, crease: 60, what: 'knob' }), GOLD);
    buttSpike(g);
  }

  // the head (blade, mask, edge, eyes, jaw, tang, flare) is authored in head units and scaled by K about HPV
  const hs = (geo) => xform(geo, { pivot: HPV, scale: K });
  const H = { add: (geo, mat) => g.add(hs(geo), mat) };
  const hpart = (name, o = {}) => { const p = g.part(name, { ...o, pivot: hp(o.pivot || [0, 0, 0]) }); return { add: (geo, mat) => p.add(hs(geo), mat) }; };
  const hB = blade.h;
  const onB = (u, v, z) => [u, v, hB(u, v) + z];   // design space laid on the blade's +w face

  // ------------------------------------------------------------------ head: bronze body (one cast relief, both faces)
  {
    const F = hfFace(blade.loops, hB, { ...blade.opts, idx: blade.RI });
    RELIEFS.push({ h: hB, hp: blade.hPolish, inside: (s, t) => blade.RI.inside(s, t) });
    H.add(merge([F.face, mirror(F.face), F.walls]), BRONZE);
    // shoulder bands: turquoise floors in the channels, gold 雲雷紋 spirals standing in them
    for (const B of bands) {
      H.add(both(sheet([{ pts: B.loop, tag: 'f' }], hB, 0.15, -0.5, { edge: 1.2, maxCell: 4, decimate: { error: 0.08, normals: 0.3 } })), TURQ);
      const n = Math.max(1, Math.floor(B.U / (B.H - 6 + 2.2))), unit = B.H - 6, pad = (B.U - n * (unit + 2.2)) / 2 + 1.1, T = [];
      for (let k = 0; k < n; k++) {
        const x0 = pad + k * (unit + 2.2), sp = sqSpiral(x0, 3, unit, 3.0, 1).map(([x, y]) => (k % 2 ? [x, B.H - y] : [x, y]));
        T.push(...ribbonT(sp.map(([u, v]) => B.map(u, v)), 1.5, -0.6, 1.0, { b: 0, step: 8 }));
      }
      for (const v of [1.0, B.H - 1.0]) { const L = []; for (let u = 0; u <= B.U; u += 5) L.push(B.map(u, v)); L.push(B.map(B.U, v)); T.push(...ribbonT(L, 1.3, -0.6, 0.9, { b: 0, step: 6 })); }
      H.add(both(mapTris(T, onB, 40)), GOLD);
    }
    // gold leaf over the brow ridges
    for (let i = 0; i < 2; i++) {
      const line = browLine(EYES[i]), up = [], dn = [];
      for (let k = 2; k <= line.length - 5; k++) {
        const p = line[k], q = line[Math.min(line.length - 1, k + 1)], o = line[k - 1];
        let nx = -(q[1] - o[1]), ny = q[0] - o[0]; const l = Math.hypot(nx, ny); nx /= l; ny /= l; if (ny < 0) { nx = -nx; ny = -ny; }
        const u = k / (line.length - 1), hw = u < 0.3 ? lerp(6, 8.5, u / 0.3) : lerp(8.5, 3.5, (u - 0.3) / 0.7);
        up.push([p[0] + nx * hw * 0.55, p[1] + ny * hw * 0.55]); dn.push([p[0] - nx * hw * 0.95, p[1] - ny * hw * 0.95]);
      }
      const loop = [...up, ...dn.reverse()];
      H.add(both(sheet([{ pts: loop, tag: 'l' }], hB, 0.32, -0.6, { edge: 0.8, maxCell: 2, tol: 0.03, decimate: { error: 0.06, normals: 0.3 } })), LEAF);
    }
    // 雲雷紋 ground: low (0.7 mm) square spirals cast into the face's empty fields -- a row either side of the brow
    // boss, the cheeks under the eyes, the chin under the snarl -- crisp-edged ribbons laid on the relief
    {
      const T = [];
      const field = (x0, y0, nx, ny, unit, mir = false) => {
        for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
          const flip = (i + j) % 2 === 1, ox = x0 + i * (unit + 2.2), oy = y0 + j * (unit + 2.2);
          const sp = sqSpiral(0, 0, unit, 2.3, 1).map(([x, y]) => [ox + (flip !== mir ? unit - x : x), oy + y]);
          T.push(...ribbonT(sp, 1.05, -0.4, 0.7, { b: 0.22, step: 6 }));   // (straight runs: corners kept, few cuts)
        }
      };
      for (const sd of [-1, 1]) {
        const at0 = (o) => (sd > 0 ? S + o : S - o - 10);
        for (let i = 0; i < 4; i++) field(at0(14 + i * 12.2), 690, 1, 1, 10, sd < 0);              // forehead
        for (let i = 0; i < 4; i++) field(at0(38 + i * 12.2), 560, 1, 3, 10, sd < 0);              // cheeks
      }
      field(S - 24.4, 458, 4, 2, 10);                                                                 // chin
      H.add(both(mapTris(T, onB, 40)), BRONZE);
    }
  }

  // ------------------------------------------------------------------ head: iron edge (鐵刃) — lofted band, three grinds
  {
    const N = 200;
    const ringAt = (u, ds, hs) => { const D = BAND(u) / DMAX; const r = []; for (let i = 0; i < ds.length; i++) { const [s, t] = at(u, ds[i] * D); r.push([s, t, hs[i]]); } return r; };
    const F = (v, u) => (typeof v === 'function' ? v(u) : v);
    // the horns thin to points (tp -> 0.05): a square-cut tip read as a blunt stub
    const tpOf = (u) => 0.05 + 0.95 * Math.min(smooth(0, 0.2, u), smooth(1, 0.8, u));
    const band = (d0, d1, h0, h1) => {
      const rings = [];
      for (let k = 0; k <= N; k++) {
        const u = k / N, tp = tpOf(u), a = F(d0, u), b = F(d1, u), ha = F(h0, u), hb = F(h1, u);
        rings.push(ringAt(u, [b, a, a, b], [hb * tp, ha * tp, -ha * tp, -hb * tp]));
      }
      return loftRings(rings, { close: true, capA: true, capB: true, crease: 28 });
    };
    // the temper line (刃文) wanders: the hard ground edge meets the forged body along a wave
    const HAMON = (u) => 34 + 3.4 * Math.sin(u * TAU * 13 + 0.6) + 1.7 * Math.sin(u * TAU * 29 + 2.1);
    const bevH = (d) => 1.0 + (3.2 - 1.0) * (d - 3.2) / (34 - 3.2);
    H.add(band(HAMON, DMAX, (u) => bevH(HAMON(u)), 3.55), 'steel');           // forged flat (under and past the bronze lip)
    H.add(band(3.2, HAMON, 1.0, (u) => bevH(HAMON(u))), 'steel_bright');     // ground bevel
    H.add(band(0, 3.2, 0.32, 1.0), 'chrome');                                // mirror micro-bevel at the cutting line
    // the temper line itself: a blued wave where the ground bevel meets the forged flat
    H.add(band((u) => HAMON(u) - 2.6, (u) => HAMON(u) + 0.8, (u) => bevH(HAMON(u) - 2.6) + 0.04, (u) => bevH(HAMON(u)) + 0.05), 'steel_blued');
    // forge-fold grain (鍛紋): dark wavy lines along the forged flat between the temper line and the bronze lip
    const ARC = RE * (TH1 - TH0), T = [];
    for (let k = 0; k < 5; k++) {
      const P = [];
      for (let x = ARC * 0.1; x <= ARC * 0.9; x += 5) { const u = x / ARC; P.push([x, 39.5 + k * 4.4 + 1.6 * Math.sin(u * TAU * 9 + k * 1.3) + 0.8 * Math.sin(u * TAU * 23 + k * 2.7)]); }
      T.push(...ribbonT(P, 0.75, -0.2, 0.11, { b: 0, step: 5 }));
    }
    const flatH = (u, d) => { const h0 = HAMON(u); return tpOf(u) * lerp(bevH(h0), 3.55, clamp01((d - h0) / (DMAX - h0))); };
    H.add(both(mapTris(T, (x, d, z) => { const u = clamp01(x / ARC), [s2, t2] = at(u, d * BAND(u) / DMAX); return [s2, t2, flatH(u, d) + z]; }, 40)), 'steel_dark');
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
    fx.add(both(loftRings(rings, { close: true, capA: true, capB: true, crease: 60 })), 'glow_red');
  }

  // ------------------------------------------------------------------ head: eyes (hero), teeth, jaw, molten core
  {
    const eyes = hpart('fx_eyes', { pivot: [FACE.s, FACE.eyeT, 0], extras: { hero: true, pv: { gem: 2.2, coreTint: '#ff1206', irid: 0.04 } } });
    // the iris dishes and pupils ride with the eyes but keep their own darker stone tint
    const iris = hpart('eyes_iris', { parent: 'fx_eyes', pivot: [FACE.s, FACE.eyeT, 0], extras: { pv: { gem: 0.5, coreTint: '#7a0a0c', irid: 0 } } });
    EYES.forEach(([ex, ey], i) => {
      const fl = blade.floors[i];
      const xe = (s, t) => eyeXf([ex, ey], s, t);
      const st = eyeStone(ex, ey, FACE.eyeR - 0.05, fl - 0.4, 4.0, 24, xe);
      eyes.add(st.stone, 'crystal');
      iris.add(st.iris, 'glass');
      // the slit pupil: an obsidian lens set into the iris dish
      // (one slab through the stone serves both faces; it shows where it rises out of the dish)
      const pupil = []; for (let k = 0; k < 32; k++) { const a = k / 32 * TAU; const c = Math.cos(a); pupil.push(eyeL([ex, ey], Math.sign(c) * Math.pow(Math.abs(c), 0.7) * 2.2, Math.sin(a) * 7.8)); }
      const pz = fl - 0.4 + 4.0 - 0.7;
      iris.add(hfSolid(pupil, (s, t) => pz + 0.4 + 0.35 * clamp01(1 - ((s - ex) / 2.4) ** 2) * clamp01(1 - ((t - ey) / 7.8) ** 2), { minCell: 0.3, maxCell: 1.5, edge: 0.5 }), 'obsidian');
      // gold bezel (a ring on the socket floor), four claws over the crown, two rivets at the lid corners
      const bz = []; for (let k = 0; k < 64; k++) { const a = k / 64 * TAU; bz.push([...xe(ex + Math.cos(a) * (FACE.eyeR + 1.6), ey + Math.sin(a) * (FACE.eyeR + 2.6)), fl + 0.9]); }
      H.add(both(tubeAlong(bz, 1.55, { seg: 72, radial: 8, closed: true })), GOLD);
      for (let c = 0; c < 4; c++) {
        const a = (c / 4) * TAU + Math.PI / 4, cs = Math.cos(a), sn = Math.sin(a), R0 = FACE.eyeR;
        const P = (r, w) => [...xe(ex + cs * r, ey + sn * r), w];
        H.add(both(taper([P(R0 + 2.8, fl + 0.5), P(R0 + 0.9, fl + 2.7), P(R0 - 1.4, fl + 2.35), P(R0 - 3.4, fl + 2.55)], 1.65, 0.5, { seg: 12, radial: 8 })), GOLD);
      }
      const sd = ex < S ? -1 : 1;
      for (const [cx, cy] of [eyeL([ex, ey], -sd * 35, -1.5), eyeL([ex, ey], sd * 41, 2)]) {
        const z = hB(cx, cy) - 0.5, rv = new THREE.SphereGeometry(2.2, 14, 7, 0, TAU, 0, Math.PI / 2);
        rv.rotateZ(-Math.PI / 2); rv.translate(z, cy, -cx);
        H.add(both(fin(rv, 80)), GOLD);
      }
    });
    // upper fangs: tapered lens sections with a ridge, gold caps wrapped over the points
    const tops = [-56, -38, -19, 0, 19, 38, 56];
    tops.forEach((ds, i) => {
      const s = S + ds, top = mouthTop(s) + 3, big = i === 1 || i === 5, L = big ? 21 : 15, wd = big ? 7 : 8;
      H.add(fang(s, top, -1, L, wd, big ? 8.2 : 7.6), BRONZE);
      H.add(fang(s, top, -1, L, wd, big ? 8.2 : 7.6, 0.6), GOLD);
    });
    // the jaw: lower gum plate + teeth, slides down into the body when the mask roars (open = 1)
    const jaw = hpart('fx_jaw', { pivot: [S, FACE.mouthT - 10, 0], extras: { open: [0, -0.019 * K, 0], order: 0 } });
    const gum = (s) => lerp(mouthBot(s), mouthTop(s), 0.36);
    const plate = []; { const n = 28; for (let i = 0; i <= n; i++) { const s = lerp(S - 74, S + 74, i / n); plate.push([s, mouthBot(s) - 3]); } for (let i = n; i >= 0; i--) { const s = lerp(S - 74, S + 74, i / n); plate.push([s, gum(s)]); } }
    jaw.add(hfSolid(plate, (s, t) => 8.0 - 1.4 * smooth(gum(s) - 3, gum(s), t), { maxCell: 4 }), BRONZE);
    [-47, -28, -9.5, 9.5, 28, 47].forEach((ds, i) => {
      const s = S + ds, b = gum(s) - 1.5, big = i === 0 || i === 5, L = big ? 16 : 12;
      jaw.add(fang(s, b, 1, L, 7, 7.4), BRONZE);
      jaw.add(fang(s, b, 1, L, 7, 7.4, 0.6), GOLD);
    });
    // molten core: an ember plate in the blade's mid-plane filling the throat (and the slot the jaw drops into)
    const core = hpart('fx_mouth', { pivot: [S, FACE.mouthT, 0], extras: { energy: true } });
    const cp = []; { const n = 24; for (let i = 0; i <= n; i++) { const s = lerp(S - 73, S + 73, i / n); cp.push([s, mouthBot(s) - 26]); } for (let i = n; i >= 0; i--) { const s = lerp(S - 73, S + 73, i / n); cp.push([s, mouthTop(s) + 3]); } }
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
      g.add(tubeAlong(pts, 1.3, { seg: 40, radial: 8 }), GOLD);
      for (const p of [pts[0], pts.at(-1)]) { const b = new THREE.SphereGeometry(1.75, 12, 8); const v = V(...p); b.translate(v.x, v.y, v.z); g.add(fin(b, 80), GOLD); }
    }
    lashings(g);
  }

  // ------------------------------------------------------------------ 內 (tang): mosaic plaque, 夔 dragon, tassel lug
  tang(g, H, hpart);

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
  g.socket('grip_l', [0, -265, 0]);
  const e = EDGE(0.5), eU = EDGE(0.97), eL = EDGE(0.03);
  const HS = { head: [FACE.s, 587, 0], edge: [e[0], e[1], 0], hornU: [eU[0], eU[1], 0], hornL: [eL[0], eL[1], 0], mid: [BODY.rear, 587, 0],
    eyes: [FACE.s, FACE.eyeT, blade.floors[1] + 4], mouth: [FACE.s, FACE.mouthT, 10], tang: [TANG.s1 + 22, TANG.t0 - 20, 0], blade: [e[0] - 120, e[1], 0] };
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
  // bake: pre-tessellated (only what the AO needs: the relief is already fine), glow parts left out of the occluders,
  // then m4's post-bake (buried AO refill, per-material wear, flat faces unworn) and the cast-bronze patina pass
  g.build = (o = {}) => {
    const root = Gun.prototype.build.call(g, { ...o, bake: false });
    if (o.bake === false) return root;
    const meshes = [];
    root.traverse((m) => { if (m.isMesh && !/^(glass_|glow_)/.test(m.userData.mat)) meshes.push(m); });
    const tess = (o.tessellate ?? TESS) * 0.001;
    for (const m of meshes) {
      const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
      for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
      m.geometry = tessellateFat(geo, /^glaze_/.test(m.userData.mat) ? tess : tess * TESS_K, 0.0016);
    }
    if (o.tessOnly) return root;
    const relief = (m) => (/^(bronze|gold)/.test(m.userData.mat) ? 0.0012 : /^(steel|chrome)/.test(m.userData.mat) ? 0.0008 : 0);
    bakeMeshes(meshes, { tessellate: 0, aoDist: 0.016, rays: 32, log: true, minHeight: relief });
    postBake(root, { cos: 0.99999 }, WEAR);
    patina(root);
    return root;
  };
  return g;
}

// ------------------------------------------------------------------------------------------ cast-bronze patina
const RELIEFS = [];   // [{ h, inside(s, t) }] in head units: the blade faces, the tang
/**
 * After the bake: on the cast reliefs, hollows go verdigris (cavity channel, from the heightfield's own horizon
 * occlusion) and the high points that hands and cloth rub go polished gold-brown (wear channel, from how far a point
 * stands above its surroundings) -- card ②: 磨亮處金褐、凹處銅綠.
 */
function patina(root) {
  root.updateMatrixWorld(true);
  root.traverse((m) => {
    if (!m.isMesh || m.userData.mat !== BRONZE || m.parent?.name !== 'body') return;
    const P = m.geometry.attributes.position, B = m.geometry.attributes._bake;
    for (let i = 0; i < P.count; i++) {
      const s = HPV[0] + (-P.getZ(i) * 1000 - HPV[0]) / K, t = HPV[1] + (P.getY(i) * 1000 - HPV[1]) / K, w = Math.abs(P.getX(i) * 1000) / K;
      for (const R of RELIEFS) {
        if (!R.inside(s, t)) continue;
        const z = R.h(s, t);
        if (Math.abs(w - z) > 0.35) continue;
        const hp = R.hp || R.h;
        let avg = 0; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; avg += hp(s + Math.cos(a) * 4.5, t + Math.sin(a) * 4.5) / 8; }
        const prom = hp(s, t) - avg, occ = horizonAO(R.h, s, t, z);
        const pol = clamp01((prom - 0.3) / 0.9) * 0.9, cav = clamp01(occ * 2.0 - 0.12);
        B.setY(i, Math.max(B.getY(i), pol));
        B.setZ(i, Math.max(B.getZ(i) * (1 - pol), cav * 0.85));
        break;
      }
    }
    B.needsUpdate = true;
  });
}

// ------------------------------------------------------------------------------------------ parts
/** a tooth: root centre (s, t), pointing dir (-1 down / +1 up), length L, half width wd; half thickness th at the root
 *  falling to a thin ridged point. cap > 0: the gold cap over the last 38 % (cap mm proud) */
function fang(s, t, dir, L, wd, th, cap = 0) {
  const n = 18, o = [];
  const wAt = (u) => wd * (u < 0.5 ? 1 - 0.18 * u : (1 - u) / 0.5 * 0.91) + 0.25;
  for (let i = 0; i <= n; i++) { const u = i / n; o.push([s + wAt(u), t + dir * L * u]); }
  for (let i = n; i >= 0; i--) { const u = i / n; o.push([s - wAt(u), t + dir * L * u]); }
  const th0 = (ss, tt) => {
    const u = clamp01(dir * (tt - t) / L), x = Math.min(1, Math.abs(ss - s) / wAt(u));
    return 0.45 + (th * (1 - 0.72 * Math.pow(u, 1.3)) - 0.45) * (1 - Math.pow(x, 1.6));
  };
  if (!cap) return hfSolid(o, th0);
  const u0 = 0.62, c = [];
  for (let i = 0; i <= 10; i++) { const u = lerp(u0, 1, i / 10); c.push([s + wAt(u) + cap, t + dir * L * u]); }
  c.push([s, t + dir * (L + cap)]);
  for (let i = 10; i >= 0; i--) { const u = lerp(u0, 1, i / 10); c.push([s - wAt(u) - cap, t + dir * L * u]); }
  return hfSolid(c, (ss, tt) => th0(ss, Math.max(Math.min(tt, Math.max(t, t + dir * L)), Math.min(t, t + dir * L))) + cap);
}

/** gold 雷紋 band wrapped round the haft between t0 and t1: square spirals + rims, inlaid flush-ish (h proud) */
function haftThunder(t0, t1, r0, h = 0.7) {
  const C = TAU * r0, Hh = t1 - t0, n = 8, unit = C / n - 2.2, lines = [];
  for (let k = 0; k < n; k++) {
    const x0 = k * (unit + 2.2) + 1.1, flip = k % 2;
    lines.push(flip ? sqSpiral(x0, Hh - 2.5, unit * 0.82, 2.4, -1) : sqSpiral(x0, 2.5, unit * 0.82, 2.4, 1));
  }
  lines.push(resample([[0, 0.7], [C, 0.7]], 4.5), resample([[0, Hh - 0.7], [C, Hh - 0.7]], 4.5));
  const T = [];
  for (const pl of lines) T.push(...ribbonT(pl, 1.2, -0.3, h, { b: 0.2, step: 4.5 }));
  // wrap: u -> angle, v -> t, z -> radius
  return mapTris(T, (u, v, z) => { const a = u / r0, r = r0 + z; return [-Math.cos(a) * r * RS / RW, t0 + v, Math.sin(a) * r]; }, 40);
}
/** leather wrapped round a grip in an overlapping spiral (each turn laps over the last; raised leading edge) */
function gripWrap(t0, t1) {
  const R = RW + 0.2, pitch = 24, turns = (t1 - t0) / pitch + 1, n = Math.ceil(turns * 26), sec = [[-1.5, 0.55], [-0.6, 1.25], [3, 1.5], [pitch - 3, 0.45], [pitch + 2, 0.05], [pitch + 2, -0.5], [-1.5, -0.5]];
  const rings = [];
  for (let i = 0; i <= n; i++) {
    const a = i / n * turns * TAU, tc = t0 - pitch + i / n * turns * pitch, c = Math.cos(a), sn = Math.sin(a);
    rings.push(sec.map(([v, z]) => { const tt = Math.max(t0 + 0.6, Math.min(t1 - 0.6, tc + v)); const r = R + z * (tt === tc + v ? 1 : 0.2); return [c * r * RS / RW, tt, sn * r]; }));
  }
  return loftRings(rings, { close: true, capA: true, capB: true, crease: 40 });
}
/** woven over-under silk ribbons round a grip: n strands each way, pitch P (mm per turn), ends tucked under the ferrules */
function lattice(t0, t1, R, n = 3, P = 96, wdt = 4.4, th = 0.8, amp = 1.15) {
  const out = [], a0 = t0 - 1, a1 = t1 + 1, N = Math.ceil((a1 - a0) / 3.2);
  for (const dir of [1, -1]) for (let i = 0; i < n; i++) {
    const rings = [];
    for (let k = 0; k <= N; k++) {
      const t = lerp(a0, a1, k / N), a = dir * TAU * (t - t0) / P + TAU * i / n;
      const tuck = Math.min(smooth(a0, t0 + 5, t), smooth(a1, t1 - 5, t));
      const rr = R + (dir * amp * Math.cos(TAU * n * (t - t0) / P)) * tuck - (1 - tuck) * 1.4;
      // ribbon frame: tangent along the helix, across = on the cylinder perpendicular to it, out = radial
      const ta = dir * TAU / P * rr, tl = Math.hypot(ta, 1);   // helix slope: d(arc) / dt
      const pts = [[-wdt / 2, -th / 2], [wdt / 2, -th / 2], [wdt / 2, th / 2], [-wdt / 2, th / 2]];
      rings.push(pts.map(([x, z]) => {
        const r = rr + z, aa = a + x / tl / rr, tt = t - x * ta / tl;   // across = perpendicular to the helix on the cylinder
        return [Math.cos(aa) * r * RS / RW, tt, Math.sin(aa) * r];
      }));
    }
    out.push(loftRings(rings, { close: true, capA: true, capB: true, crease: 50 }));
  }
  return merge(out);
}
/** 鐏 butt: an octagonal stepped socket, a turned band with gold 雷紋 inlay, faceted stud bosses on the lower octagon,
 *  a cast collar, a cruciform spike */
function buttSpike(g) {
  const oct = (pts, what) => revT(pts, { seg: 8, phase: Math.PI / 8, crease: 25, what });
  g.add(oct([[RW, -478], [RW + 2.2, -479.5], [RW + 3.6, -483], [RW + 3.6, -488], [RW + 2.4, -490], [RW + 2.0, -490.5]], 'buttU'), BRONZE);
  g.add(revT([[RW + 1.8, -489.6], [RW + 2.6, -490.2], [RW + 3.0, -491.2], [RW + 3.0, -508.8], [RW + 2.6, -509.8], [RW + 1.8, -510.4]], { seg: 40, what: 'buttBand' }), BRONZE);
  g.add(oct([[RW + 2.0, -509.6], [RW + 2.4, -510], [RW + 3.6, -512], [RW + 3.6, -526], [RW + 2.0, -529], [RW + 1.4, -534], [0, -534]], 'buttL'), BRONZE);
  g.add(beadRing(-481.5, RW + 3.5, 1.1, 22), GOLD);
  g.add(haftThunder(-507.5, -492.5, RW + 3.0, 0.45), GOLD);
  // faceted stud bosses (乳釘): six-sided pyramids, one on each facet of the lower octagon
  const rf = (RW + 3.6) * Math.cos(Math.PI / 8), up = new THREE.Vector3(0, 1, 0);
  for (let k = 0; k < 8; k++) {
    const ph = k * Math.PI / 4, d = new THREE.Vector3(Math.sin(ph), 0, Math.cos(ph) / (RS / RW)).normalize();
    const st = new THREE.ConeGeometry(3.0, 2.6, 6, 1);
    st.translate(0, 1.3, 0);
    st.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, d));
    st.translate(Math.sin(ph) * (rf - 0.25), -519, Math.cos(ph) * (rf - 0.25) * RS / RW);
    g.add(fin(st, 30), BRONZE);
  }
  // cast collar between the socket and the spike: a gold bead over a waisted neck
  g.add(revT([[0, -533], [RW + 0.8, -533], [14, -537], [12.4, -541], [14.5, -545], [13, -549], [0, -549]], { seg: 40, ks: 1, what: 'collar' }), BRONZE);
  g.add(beadRing(-545, 14.4, 1.3, 20, 1, 1), GOLD);
  // spike: cruciform section (four ridges, hollow-ground between), 92 mm to the point
  const rings = [];
  for (let k = 0; k <= 16; k++) {
    const u = k / 16, t = -548 - u * 92, r = 12.5 * Math.pow(1 - u, 0.9) + 0.15, ring = [];
    for (let j = 0; j < 16; j++) { const a = j / 16 * TAU + Math.PI / 4, q = j % 4, f = q === 0 ? 1 : q === 2 ? 0.46 : 0.58; ring.push([Math.cos(a) * r * f, t, Math.sin(a) * r * f]); }
    rings.push(ring);
  }
  g.add(loftRings(rings, { close: true, capA: true, capB: true, crease: 35 }), BRONZE);
}
/** rawhide straps through the three slots: three side-by-side turns hugging the blade faces and round the haft, the
 *  turns crossing over the sleeve, a knot with a tucked tail at the back of the haft */
function lashings(g) {
  strapLoops(g, hp([(SLOT.s0 + SLOT.s1) / 2, 0])[0], hp([BODY.rear, 0])[0], 4.4, 1.5);
}
function strapLoops(g, sx, sb, W0, TH) {
  const out = [];
  LASH.forEach((tl, li) => {
    const tc = hp([0, tl])[1];
    for (let k = 0; k < 3; k++) {
      const dt = (k - 1) * 4.7;
      const tt = tc + dt;
      const surf = (s) => blade.h((s - HPV[0]) / K + HPV[0], (tt - HPV[1]) / K + HPV[1]) * K;
      // closed loop in (s, w), starting in the slot, going +w side backwards, round the back of the haft, -w side forwards
      const L = [];
      L.push([sx, 0]);
      L.push([sx - 2.0, surf(sx - 3) * 0.55]);
      for (let s = sx - 4; s > sb + 0.6; s -= 1.8) L.push([s, surf(s) + TH / 2 + 0.15]);
      const w0 = L.at(-1)[1];
      // round the haft: over the sleeve (front), stepping down onto the bare haft behind it
      const R = (th) => RW + TH / 2 + 0.25 + 3.4 * smooth(2.05, 1.65, th);
      const th0 = Math.asin(Math.min(0.95, w0 / R(0.4)));
      for (let i = 1; i <= 16; i++) { const th = lerp(th0, Math.PI, i / 16); L.push([Math.cos(th) * R(th) * RS / RW, Math.sin(th) * R(th)]); }
      // (the arc ends behind the haft at w 0; mirror back on -w)
      const half = L.slice();
      for (let i = half.length - 2; i >= 1; i--) L.push([half[i][0], -half[i][1]]);
      // strap cross-section: W0 along t, TH across the path in (s, w), slight twist
      const pts = L.map(([s, w]) => [s, w]);
      const n = pts.length, rings = [];
      for (let i = 0; i < n; i++) {
        const p = pts[i], q = pts[(i + 1) % n], o = pts[(i - 1 + n) % n];
        let ns = -(q[1] - o[1]), nw = q[0] - o[0]; const l = Math.hypot(ns, nw) || 1; ns /= l; nw /= l;
        const tw = 0.12 * Math.sin(i * 1.7 + k + li);
        const sec = [[-W0 / 2, -TH / 2], [W0 / 2, -TH / 2], [W0 / 2 + 0.25, 0], [W0 / 2, TH / 2], [-W0 / 2, TH / 2], [-W0 / 2 - 0.25, 0]];
        rings.push(sec.map(([y, z]) => { const z2 = z + y * tw * 0.3; return [p[0] + ns * z2, tt + y, p[1] + nw * z2]; }));
      }
      rings.push(rings[0]);
      out.push(loftRings(rings, { close: true, crease: 50 }));
    }
    // the knot at the back of the haft, a tucked tail hanging out of it
    const kb = -(RW + TH + 0.6) * RS / RW, tk = tc + 1.5;
    const knot = []; for (let i = 0; i < 20; i++) { const a = i / 20 * TAU; knot.push([kb - 1.6 + Math.cos(a) * 1.9, tk + Math.sin(a) * 3.6, Math.sin(a * 2) * 2.2]); }
    out.push(tubeAlong(knot, 1.5, { seg: 30, radial: 7, closed: true }));
    out.push(taper([[kb - 1.2, tk - 3, 0.8], [kb - 0.4, tk - 10, 1.4], [kb + 0.1, tk - 18, 1.0], [kb + 0.3, tk - 25, 0.4]], 1.45, 1.0, { seg: 14, radial: 6 }));
  });
  g.add(merge(out), 'leather_grain');
  // slot webs: a bronze plate in the mid-plane behind the straps, so nothing shows through past them
  for (const tl of LASH) {
    const t = tl, { s0, s1, h } = SLOT, web = [[s0 - 2, t - h - 2], [s1 + 2, t - h - 2], [s1 + 2, t + h + 2], [s0 - 2, t + h + 2]];
    const hole = [[s0 + 2, t - 6.8], [s1 - 2, t - 6.8], [s1 - 2, t + 6.8], [s0 + 2, t + 6.8]];
    g.add(xform(profile(web, { w: 1.2, bevel: 0.2, bevelSeg: 1, curveSeg: 1, holes: [hole] }), { pivot: HPV, scale: K }), BRONZE);
  }
}

/** 內: a tapered plaque with a raked end, a bronze 夔 in relief over irregular turquoise chips, the tassel */
function tang(g, H, hpart) {
  const { s0, s1, t0, t1 } = TANG;
  const hx = s1 + 24, hy = t0 - 21;   // tassel lug hole
  // outline (x = distance out from the haft, mm): full height at the haft, the top edge tapering, a raked and slightly
  // bulging end, the lug hanging from the lower edge just short of the end
  const XS = (P) => P.map(([x, t]) => [s0 - 6 - x, t]);
  const out = crv(XS([[-12, 540], [40, 541.5], [92, 545.5], [106, 542], [111.5, 526], [122, 507.5], [132.5, 526], [135.5, 543], [139, 553.5], [144.5, 585], [150, 616.5], [147.5, 620], [136, 623], [90, 626.5], [40, 628], [-12, 628]]), 1.2);
  const lug = arcP(hx, hy, 4.6, 0, 355, 36);
  const OI = new SegIndex([{ pts: out, closed: true }], 3);
  // field: the plaque face inset 6 mm, recessed 1 mm (the frame stays proud)
  const field = crv(XS([[-4, 547.5], [60, 549], [100, 552.5], [128, 559], [133.5, 562], [137.5, 585], [141.5, 609], [138, 614], [100, 619], [40, 620.5], [-4, 620.5]]), 1.2);
  const FI = new SegIndex([{ pts: field, closed: true }], 3);
  // the 夔 (cartouche frame local: x along the tang from the haft (0) outwards = -s, y = t - mid)
  const mid = (t0 + t1) / 2 + 2, X = (s) => s0 - 6 - s, Y = (t) => t - mid;
  const kui = kuiSD();
  const hT = (s, t) => {
    let z = 4.5;
    const e = OI.near(s, t, 1.4);
    if (e) z -= roundDrop(e.d, 1.2);
    const lh = Math.hypot(s - hx, t - hy) - 4.6;
    if (lh < 1.2) z -= roundDrop(Math.max(0, lh), 1.0);
    const sf = FI.sd(s, t, 2.5);
    if (sf > -1.2) z -= 1.0 * bev(sf, 0.5);                       // the field sinks 1 mm inside the frame
    if (sf > -0.5) {
      const k = kui(X(s), Y(t));
      if (k.d < 0.9) z += k.h * bev(0.9 - k.d, 0.9);              // the dragon stands 2.6 off the field
    }
    return z;
  };
  const loops = [{ pts: out, tag: 'o' }, { pts: lug, tag: 'lug' }];
  RELIEFS.push({ h: hT, inside: (s, t) => OI.inside(s, t) && Math.hypot(s - hx, t - hy) > 4.6 });
  const F = hfFace(loops, hT, { tol: 0.05, minCell: 0.4, maxCell: 6, edge: 1.0, decimate: { error: 0.34, normals: 0.25, ao: 0.7, lattice: 12 } });
  H.add(merge([F.face, mirror(F.face), F.walls]), BRONZE);
  // the eye boss: a gold dome
  const ke = kui.eye, es = s0 - 6 - ke[0], et = mid + ke[1];
  const eb = new THREE.SphereGeometry(2.6, 16, 8, 0, TAU, 0, Math.PI / 2); eb.rotateZ(-Math.PI / 2); eb.translate(hT(es, et) - 0.4, et, -es);
  H.add(both(fin(eb, 80)), GOLD);
  // mosaic: irregular chips (jittered Voronoi, 3-7 mm), 0.7 mm grout, following the frame and the dragon
  const chips = mosaic(field, (s, t) => kui(X(s), Y(t)).d, hT);
  const mats = ['glaze_turquoise', 'glaze_teal', 'glaze_jade'];
  chips.forEach((list, i) => { if (list.length) H.add(both(merge(list)), mats[i]); });
  // tassel: a gold ring through the lug, a bronze cap over a thread-bound neck, ~150 horsehair strands in 7 clumps
  const ts = hpart('fx_tassel', { pivot: [hx, hy, 0], extras: { swing: 'pendulum', len: 0.09 } });
  const rg = new THREE.TorusGeometry(7, 1.5, 10, 32); rg.translate(0, hy - 4, -hx);
  ts.add(fin(rg, 70), GOLD);
  ts.add(revT([[0, hy - 10], [4, hy - 11], [8, hy - 16], [9.5, hy - 24], [8.2, hy - 30], [9, hy - 33], [0, hy - 33]], { seg: 24, ks: 1, s: hx, what: 'tcap' }), BRONZE);
  ts.add(beadRing(hy - 31.5, 9.3, 0.9, 16, 1, 1).translate(0, 0, -hx), GOLD);
  // binding: red thread wound round the neck under the cap
  { const P = []; const n = 7 * 28; for (let i = 0; i <= n; i++) { const a = i / 28 * TAU, r = 6.4; P.push([hx + Math.cos(a) * r, hy - 34.2 - i / n * 9, Math.sin(a) * r]); } ts.add(tubeAlong(P, 0.55, { seg: n, radial: 5 }), 'silk_red'); }
  ts.add(revT([[0, hy - 33], [5.9, hy - 33.5], [6.0, hy - 44], [0, hy - 44.5]], { seg: 20, ks: 1, s: hx, what: 'neck' }), 'silk_red');
  const strands = [];
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let c = 0; c < 7; c++) {
    const ca = c / 7 * TAU + 0.3, cr = 3.2 + rnd() * 1.4, Lc = 112 + rnd() * 40, sway = (rnd() - 0.5) * 10, fl = 8 + rnd() * 6;
    for (let i = 0; i < 19; i++) {
      const a = ca + (rnd() - 0.5) * 0.9, r0 = cr * (0.4 + rnd() * 0.7), L = Lc + (rnd() - 0.5) * 50, ph = rnd() * TAU;
      const ox = Math.cos(a), oz = Math.sin(a), y0 = hy - 43;
      const P = [];
      for (let k = 0; k <= 5; k++) {
        const u = k / 5, rr = r0 + fl * Math.pow(u, 1.3) + 1.2 * u, sc = Math.sin(u * Math.PI * 1.6 + ph) * 3.2 * u;
        P.push([hx + ox * rr + sway * u * u + sc * -oz, y0 - L * u, oz * rr + sc * ox]);
      }
      strands.push(taper(P, 0.5, 0.18, { seg: 7, radial: 3 }));
    }
  }
  ts.add(merge(strands), 'silk_red');
}
/** the 夔 dragon as a signed distance + height in the plaque frame (x from the haft outwards, y up; mm):
 *  head at the haft end with an open jaw, a C-curl horn, a round eye; an S body with a raised spine and 雲紋 hatching,
 *  one three-claw leg, a tail curling up at the far end. Returns (x, y) => { d, h }. */
function kuiSD() {
  const body = crv([[22, 6], [36, 12], [56, 9], [78, -2], [100, -6], [120, -1], [131, 8], [128, 17], [119, 16], [116, 9]], 1.0, false);
  const BI = new SegIndex([{ pts: body }], 3);
  const horn = crv([[24, 15], [21, 25], [28, 31], [35, 27], [32, 21], [28, 23]], 0.8, false);
  const HI = new SegIndex([{ pts: horn }], 2);
  const legs = [crv([[50, 6], [52, -6], [47, -16]], 0.8, false), crv([[47, -16], [41, -18]], 0.6, false), crv([[47, -16], [46, -22]], 0.6, false), crv([[47, -16], [52, -21]], 0.6, false)];
  const LI = new SegIndex(legs.map((p) => ({ pts: p })), 2);
  const jawU = crv([[24, 9], [14, 12], [7, 10], [4, 6]], 0.8, false), jawL = crv([[23, 2], [14, -2], [8, -5], [5, -2]], 0.8, false);
  const JI = new SegIndex([{ pts: jawU }, { pts: jawL }], 2);
  const hatch = [];
  for (let k = 0; k < 7; k++) { const p = body[Math.round(20 + k * 13)]; if (!p) continue; const c = p; hatch.push(arcP(c[0], c[1], 2.4, 30, 300, 10)); }
  const HAI = new SegIndex(hatch.map((p) => ({ pts: p })), 2);
  const eye = [22, 7.5];
  const f = (x, y) => {
    if (x < -2 || x > 142 || y < -30 || y > 40) return { d: 9, h: 0 };
    const b = BI.near(x, y, 9);
    let d = 9, hh = 2.6;
    if (b) {
      const u = b.u / b.len, r = u < 0.12 ? lerp(5.5, 6.2, u / 0.12) : lerp(6.2, 1.6, (u - 0.12) / 0.88);
      d = b.d - r;
      hh = 2.0 + 0.9 * halfRound(b.d, r);                                     // raised spine
      const hc = HAI.near(x, y, 1.2);
      if (hc) hh -= 0.55 * halfRound(hc.d, 0.5);                             // 雲紋 hatching cut into the body
    }
    const hd = Math.hypot((x - 19) / 9, (y - 7) / 7.5) - 1;                    // the head mass
    if (hd * 7 < d) { d = hd * 7; hh = 2.5 + 0.6 * clamp01(-hd * 2); }
    const j = JI.near(x, y, 4); if (j && j.d - 1.8 < d) { d = j.d - 1.8; hh = 2.2; }
    const ho = HI.near(x, y, 4); if (ho && ho.d - 1.7 < d) { d = ho.d - 1.7; hh = 2.4 + 0.5 * halfRound(ho.d, 1.7); }
    const lg = LI.near(x, y, 4); if (lg && lg.d - 1.5 < d) { d = lg.d - 1.5; hh = 2.1 + 0.4 * halfRound(lg.d, 1.5); }
    const ed = Math.hypot(x - eye[0], y - eye[1]);
    if (ed < 3.6) hh -= 0.8 * halfRound(Math.abs(ed - 3.2), 0.5);            // a ring cut round the eye boss
    return { d, h: hh };
  };
  f.eye = eye;
  return f;
}
/** irregular mosaic chips over `field` (a closed loop): jittered Voronoi cells inset by half the grout, pushed off the
 *  dragon (dist(s, t) < 0 inside it); each chip a bevelled prism laid in the recessed field at h(s, t). 3 colour lists. */
function mosaic(field, dist, h) {
  const FI = new SegIndex([{ pts: field, closed: true }], 3);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of field) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  let seed = 23; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const sp = 6.0, seeds = [];
  for (let y = y0 - sp; y < y1 + sp; y += sp * 0.88) for (let x = x0 - sp; x < x1 + sp; x += sp) seeds.push([x + (rnd() - 0.5) * sp * 0.9 + (Math.round(y / sp) % 2) * sp * 0.5, y + (rnd() - 0.5) * sp * 0.8]);
  const out = [[], [], []], grout = 0.35;
  for (let i = 0; i < seeds.length; i++) {
    const c = seeds[i];
    if (!FI.inside(c[0], c[1]) || dist(c[0], c[1]) < 0.5) continue;
    // cell: a box clipped by the bisectors of nearby seeds, inset by the grout
    let poly = [[c[0] - sp * 2, c[1] - sp * 2], [c[0] + sp * 2, c[1] - sp * 2], [c[0] + sp * 2, c[1] + sp * 2], [c[0] - sp * 2, c[1] + sp * 2]];
    for (let j = 0; j < seeds.length && poly.length; j++) {
      if (j === i) continue;
      const q = seeds[j], dx = q[0] - c[0], dy = q[1] - c[1], L = Math.hypot(dx, dy);
      if (L > sp * 2.6) continue;
      const nx = dx / L, ny = dy / L, off = L / 2 - grout;
      poly = clipHalf(poly, nx, ny, nx * c[0] + ny * c[1] + off);
    }
    if (poly.length < 3) continue;
    // follow the field's edge and the dragon: resample, pull vertices back inside
    let P = resample(poly, 1.7, true).map(([x, y]) => {
      for (let it = 0; it < 4; it++) {
        const sd = FI.sd(x, y, 6), dd = dist(x, y);
        if (sd < grout + 0.5) { const e = 0.05, gx = (FI.sd(x + e, y, 6) - FI.sd(x - e, y, 6)) / (2 * e), gy = (FI.sd(x, y + e, 6) - FI.sd(x, y - e, 6)) / (2 * e), l = Math.hypot(gx, gy) || 1; x += gx / l * (grout + 0.5 - sd); y += gy / l * (grout + 0.5 - sd); }
        if (dd < grout + 0.35) { const e = 0.05, gx = (dist(x + e, y) - dist(x - e, y)) / (2 * e), gy = (dist(x, y + e) - dist(x, y - e)) / (2 * e), l = Math.hypot(gx, gy) || 1; x += gx / l * (grout + 0.35 - dd); y += gy / l * (grout + 0.35 - dd); }
      }
      return [x, y];
    });
    P = dpLoop(P, 0.18);
    if (P.length < 3 || Math.abs(loopArea(P)) < 3) continue;
    if (loopArea(P) < 0) P = P.reverse();
    const tilt = [(rnd() - 0.5) * 0.06, (rnd() - 0.5) * 0.06], lift = 0.55 + rnd() * 0.25, cx = c[0], cy = c[1];
    const hc = (x, y) => h(cx, cy) + lift + (x - cx) * tilt[0] + (y - cy) * tilt[1];
    const r = rnd(), k = r < 0.58 ? 0 : r < 0.82 ? 1 : 2;
    out[k].push(chip(P, hc, h(cx, cy) - 0.4));
  }
  return out;
}
/** Douglas-Peucker on a closed loop (keeps the corners, drops points on straight runs) */
function dpLoop(P, tol) {
  const n = P.length;
  if (n < 5) return P;
  let a = 0, b = 0, best = -1;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const d = Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]); if (d > best) { best = d; a = i; b = j; } }
  const keep = new Uint8Array(n); keep[a] = keep[b] = 1;
  const rec = (i, j) => {   // i -> j going forward round the loop
    let m = -1, md = tol;
    const A = P[i % n], B = P[j % n], dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1e-9;
    for (let k = i + 1; k < j; k++) { const q = P[k % n], d = Math.abs((q[0] - A[0]) * dy - (q[1] - A[1]) * dx) / L; if (d > md) { md = d; m = k; } }
    if (m >= 0) { keep[m % n] = 1; rec(i, m); rec(m, j); }
  };
  rec(a, b); rec(b, a + n);
  return P.filter((_, i) => keep[i]);
}
/** half-plane clip (keep n . p <= d) */
function clipHalf(poly, nx, ny, d) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], da = nx * a[0] + ny * a[1] - d, db = nx * b[0] + ny * b[1] - d;
    if (da <= 0) out.push(a);
    if ((da < 0) !== (db < 0)) { const k = da / (da - db); out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]); }
  }
  return out;
}
/** one mosaic chip: flat top (exact normal) at top(x, y), a 0.28 mm bevel, a wall down to `bot` */
function chip(P, top, bot) {
  const b = 0.28, n = P.length, inner = P.map((p, i) => {
    const a = P[(i - 1 + n) % n], c = P[(i + 1) % n];
    const e1 = [p[0] - a[0], p[1] - a[1]], e2 = [c[0] - p[0], c[1] - p[1]], l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1;
    const nx = -(e1[1] / l1 + e2[1] / l2), ny = e1[0] / l1 + e2[0] / l2, l = Math.hypot(nx, ny) || 1;
    return [p[0] + nx / l * b, p[1] + ny / l * b];
  });
  const tri = THREE.ShapeUtils.triangulateShape(inner.map(([x, y]) => new THREE.Vector2(x, y)), []);
  const pts = [], T = [];
  inner.forEach(([x, y]) => pts.push([x, y, top(x, y)]));
  P.forEach(([x, y]) => pts.push([x, y, top(x, y) - b]));
  P.forEach(([x, y]) => pts.push([x, y, bot]));
  const cx = P.reduce((o, p) => o + p[0] / n, 0), cy = P.reduce((o, p) => o + p[1] / n, 0);
  const add = (i, j, k, up) => {
    const A = pts[i], B = pts[j], C = pts[k];
    // normal in [s, t, w]; expected: +w on the top, outward (and up) round the sides
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const gx = (A[0] + B[0] + C[0]) / 3 - cx, gy = (A[1] + B[1] + C[1]) / 3 - cy;
    const ok = up ? nn[2] > 0 : nn[0] * gx + nn[1] * gy > 0;
    // ((s, t, w) -> three (w, t, -s) keeps handedness: det +1)
    ok ? T.push(i, j, k) : T.push(i, k, j);
  };
  for (const [a, c, d] of tri) add(a, c, d, true);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    add(i, n + i, n + j, false); add(i, n + j, j, false);
    add(n + i, 2 * n + i, 2 * n + j, false); add(n + i, 2 * n + j, n + j, false);
  }
  const g = new THREE.BufferGeometry(), A = new Float32Array(pts.length * 3);
  pts.forEach(([s, t, w], i) => { A[i * 3] = w; A[i * 3 + 1] = t; A[i * 3 + 2] = -s; });
  g.setAttribute('position', new THREE.BufferAttribute(A, 3)); g.setIndex(T);
  const geo = toCreasedNormals(g.toNonIndexed(), 30 * D2R);
  // flat tops get the exact plane normal (no bevel smoothing into them)
  const pn = geo.attributes.normal, pp = geo.attributes.position, nTop = new THREE.Vector3(), a3 = new THREE.Vector3(), b3 = new THREE.Vector3(), c3 = new THREE.Vector3();
  for (let i = 0; i < pp.count; i += 3) {
    a3.fromBufferAttribute(pp, i); b3.fromBufferAttribute(pp, i + 1); c3.fromBufferAttribute(pp, i + 2);
    nTop.copy(b3).sub(a3).cross(c3.sub(a3)).normalize();
    if (nTop.x > 0.985) for (let k = 0; k < 3; k++) pn.setXYZ(i + k, nTop.x, nTop.y, nTop.z);
  }
  return geo;
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
  '*:glaze_turquoise': [0, 0], '*:glaze_teal': [0, 0], '*:glaze_jade': [0, 0], '*:crystal': [0, 0], '*:silk_red': [0, 0], '*:obsidian': [0, 0],
};
