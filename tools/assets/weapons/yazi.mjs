// 睚眥．裂魂 Yazi Soulrend — 神兵 M02 ring-pommel long sabre and its lacquered scabbard, docs/PREMIUM_WEAPONS.md M02.
// A 環首長刀 (820 mm blade, 1,150 overall, 32 mm wide, 18 mm of curve) whose ring pommel holds 睚眥 -- the dragon-headed
// jackal among the nine sons, the one that never forgets a wrong -- glaring out of it with ruby eyes, and a cinnabar
// lacquer 鞘 held in the left hand (the iai draw, the parry, the sheathing beats all play against it).
// Sword (R_gun), from the point down:
//   - blade: shinogi-zukuri on a 38-point lofted section, rings every ~5 mm: a roofed spine (iori-mune) in satin steel,
//     the burnished dark mirror shinogi-ji, the ridge, the grey satin ji, a nioi fringe grading over three vertices into a
//     wavy frosted temper band (hamon) and a mirror edge grind; a 4.4 mm rune groove (bo-hi, rounded ends) down the
//     shinogi-ji of the straight forte holding the seal-script rune strip (fx_rune, pv_rune); the curve lives in the
//     foible (sakizori) so the groove stays straight; a fukura point behind a crisp yokote, the ko-shinogi converging on
//     the point, the kissaki its own matt (narume) polish; a gold-inlaid cartouche (錯金) on both faces above the collar
//   - 刃鎺 collar: two-tier red gold, the lower tier file-marked, the upper engraved (border lines, facing cloud curls)
//   - 刀鐔 guard: round blackened bronze (烏銅), its faces a sculpted heightfield: six cloud windows (透雕) with rolled lips,
//     a scroll beside each, gold wire inlaid in a groove round each, ribs between them, a hammered (tsuchime) ground; a
//     raised seppa-dai, a slim gold rim (覆輪) with a bead line round it, gold washers either side
//   - grip: fuchi collar (gold, a black lacquer band, beads); ivory ray skin (samegawa) -- king nodules, a row of large
//     ones down each flat and ~2,700 jittered small ones in every window; a black leather two-strand wrap, three ribs a
//     strand, folded at the crossings, paper hishigami in the crossings' acute corners, a tie-off knot at the pommel end;
//     gold 目貫 (a cloud gripped by a 睚眥 paw, cast relief) that the wrap rides over; a 目釘 peg on rosettes
//   - 環首 ring (OD 56): rounded-flat section; the outer rim zoned gold / bronze -- a bead rib down the middle, a gold
//     回紋 key-fret on a bronze ground either side; a 雲雷紋 band (square spirals) cast in gold round both bronze faces
//     between granulation and a wire; a bead line round the inner rim; the clasp where the ferrule's neck holds it; a
//     cinnabar silk tassel (fx_tassel, pendulum) under it
//   - 睚眥 head inside the ring (fx_head, blackened bronze; two heightfield solids, lib/hfield.mjs): a snarling dragon-
//     jackal in profile facing the edge side -- heavy flame brows over sunken almond sockets, a wrinkled snarling bridge,
//     a drilled comma nostril, a lip groove, a cheek scroll; the hinged lower jaw (fx_jaw: lip groove, jawline, a flame
//     beard); teeth and fangs; gold antler horns swept back into the ring, a flame mane along it, gold whiskers; the
//     faceted ruby eyes (fx_eyes, the focus)
// Scabbard (L_gun): cinnabar lacquer (朱漆) over an oval section following the blade's curve, black lacquer bands with
//   gold bead wires, a bronze 鯉口 mouth fitting with the blade slot and a lining that glows when the iai is drawn
//   (fx_mouth), two bronze suspension bands (a cast scroll on each face) with a lug and a hanging ring each, a cinnabar
//   silk cord wound round, three black lacquer rune panels in gold frames carrying gold seal-script glyphs, over which
//   the strips light one by one as the iai charges (fx_rune1..3, pv_rune), maki-e down the curve (如意 cloud heads riding
//   a gold line, gold dust), a bronze chape (kojiri) with a bead rim and a cast 如意 cloud.
// Side view, mm: t along the blade (point +t), s = the edge direction, w = the flat normal. The sword stands at w +OFF,
// the scabbard (built round the blade, sheathed) at w -OFF; the game poses both (weapons/premium/yazi.js).
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { Gun, plan } from '../lib/gunkit.mjs';
import { bakeMeshes } from '../lib/bake.mjs';
import { postBake } from './m4.mjs';
import { SegIndex, hfFace, mirror, halfRound, bump, sstep } from '../lib/hfield.mjs';
import { MeshoptSimplifier } from 'meshoptimizer';
import {
  D2R, TAU, clamp01, smooth, lerp, vadd, vsub, vmul, vnorm, vcross,
  domeAt, dome, loft, ttube, mesh, ribbonT, wireT, fanT, mapTris, petal, tessellateFat,
  tooth, ftube, merge, curveFn, scaleT, arcP, cat, loftT, resample, insetPoly, sqSpiral,
} from '../lib/sculpt.mjs';

// ------------------------------------------------------------------------------------------ layout (mm)
const OFF = 70;                                   // GLB layout: sword at w +OFF, scabbard at w -OFF
const T_TIP = 820, T_YOKO = 774, T_CURVE = 470, SORI = 18;
const W0 = 32, W1 = 26.5, SB0 = -16;              // blade width at the collar / at the point's shoulder; spine at t 0
const GROOVE = { t0: 46, t1: 458, half: 2.2, depth: 1.05, off: 5.0 };   // rune groove: centre `off` from the spine
const HAB = [0, 34];                              // 刃鎺 collar
const TSUBA = { t0: -8.6, t1: -1.4, R: 39 };      // guard (seppa washers either side)
const FUCHI = [-24, -10];
const GRIP = { t0: -24, t1: -250, a: 15.2, b: 12.0 };   // grip core: half axes (s, w)
const KASH = [-262, -250];                        // pommel ferrule
const RING = { t: -300.5, R: 24.4, rr: 3.7, rw: 6.2 };  // ring centreline (s 0), radial / w half sizes: OD 56.2
const GRIP_T = -66;                               // right palm centre on the grip
const kOf = (t) => 1 - 0.05 * Math.sin(Math.PI * (t - GRIP.t0) / (GRIP.t1 - GRIP.t0));   // the grip core is a little waisted
const gripSurf = (a, t, dr) => { const k = kOf(t); return [Math.cos(a) * (GRIP.a * k + dr), t, Math.sin(a) * (GRIP.b * k + dr)]; };
const SAYA = { t0: 0, mouth: 22, kojiri: 818, t1: 858 };
const SAYA_GRIP_T = 64;                           // left palm on the scabbard, just below the mouth fitting
const HEAD_T = RING.t;                            // the head's local frame: x = s, y = t - RING.t

const uC = (t) => clamp01((t - T_CURVE) / (T_TIP - T_CURVE));
const curveS = (t) => -SORI * uC(t) * uC(t);      // the spine bends back past the straight forte (sakizori)
const Wb = (t) => lerp(W0, W1, clamp01(t / T_YOKO));
const PNT = SB0 + curveS(T_TIP) + 2.5;            // the point (s)
/** blade outline at t: spine s, edge s, width, half thickness at the ridge */
function bladeAt(t) {
  let sb = SB0 + curveS(t), se = sb + Wb(t);
  if (t > T_YOKO) {
    const v = clamp01((t - T_YOKO) / (T_TIP - T_YOKO));
    se = PNT + (se - PNT) * Math.pow(Math.max(0, 1 - v * v), 0.55);        // fukura: the edge sweeps round to the point
    sb = sb + (PNT - sb) * Math.pow(v, 2.4);
  }
  // past the yokote the kissaki is ground on its own plane: the thickness breaks there (a crisp transverse line), not a
  // smooth ease
  const h = lerp(3.55, 2.75, clamp01(t / T_YOKO)) * (t > T_YOKO ? lerp(1, 0.22, Math.pow(clamp01((t - T_YOKO) / (T_TIP - T_YOKO)), 0.9)) : 1);
  return { sb, se, W: se - sb, h };
}
/** the ridge (shinogi) at t: a third of the width off the spine; past the yokote the ko-shinogi converges on the point */
const ridgeS = (t, b = bladeAt(t)) => b.sb + 0.31 * b.W * (t > T_YOKO ? 1 - 0.5 * Math.pow(clamp01((t - T_YOKO) / (T_TIP - T_YOKO)), 0.85) : 1);
const grooveAt = (t) => (t < GROOVE.t0 || t > GROOVE.t1 ? 0 : Math.min(smooth(GROOVE.t0, GROOVE.t0 + 9, t), 1 - smooth(GROOVE.t1 - 9, GROOVE.t1, t)));
const GC = SB0 + GROOVE.off;                      // groove centre line (the forte is straight)
// temper line: distance from the edge (three incommensurate waves; yakidashi past the collar; the boshi follows the point)
// (the short waves calm towards the point: a gentle notare through the foible into the boshi)
const hamonOff = (t) => (8.2 + 1.9 * Math.sin(t * 0.05 + 0.4) + (1.2 * Math.sin(t * 0.143 + 1.9) + 0.5 * Math.sin(t * 0.21 + 0.2)) * (1 - 0.7 * smooth(560, 760, t))) * smooth(HAB[1] - 6, HAB[1] + 22, t);
const hamonS = (t) => { const b = bladeAt(t); return b.se - hamonOff(t) * Math.min(1, b.W / 26); };
/** the temper line as the loft places it (kept clear of the ridge and the edge bevel) */
const temperS = (t, b = bladeAt(t)) => { const k = Math.min(1, b.W / 26); return Math.max(ridgeS(t, b) + 2.5 * k, Math.min(hamonS(t), b.se - 1.35 * k - 0.7 * k)); };
/** the shinogi-ji's surface (half thickness) at s on the +w face */
function sjW(t, s) { const b = bladeAt(t), sr = ridgeS(t, b), hm = b.h * 0.84; return lerp(hm + 0.12, b.h, clamp01((s - b.sb) / Math.max(0.5, sr - b.sb))); }

// ------------------------------------------------------------------------------------------ helpers
/** closed loft split into one geometry per material class of the segment j -> j+1 round the ring (fan caps) */
function zonedLoft(rings, clsOf, { capA = true, capB = false, crease = 30 } = {}) {
  const cl = typeof clsOf === 'function' ? clsOf : (k, j) => clsOf[j];
  const n = rings[0].length, P = [], tris = [];
  for (const r of rings) for (const p of r) P.push(p);
  for (let k = 0; k + 1 < rings.length; k++) for (let j = 0; j < n; j++) {
    const a = k * n + j, b = k * n + (j + 1) % n, c = (k + 1) * n + j, d = (k + 1) * n + (j + 1) % n;
    tris.push([a, c, b, cl(k, j)], [b, c, d, cl(k, j)]);
  }
  const cap = (k, rev, mat) => {
    const r = rings[k], c = r.reduce((o, p) => [o[0] + p[0] / n, o[1] + p[1] / n, o[2] + p[2] / n], [0, 0, 0]);
    const ci = P.length; P.push(c);
    for (let j = 0; j < n; j++) { const a = k * n + j, b = k * n + (j + 1) % n; tris.push(rev ? [ci, b, a, mat] : [ci, a, b, mat]); }
  };
  if (capA) cap(0, false, cl(0, 2));
  if (capB) cap(rings.length - 1, true, cl(rings.length - 2, 2));
  let vol = 0;
  for (const [a, b, c] of tris) { const A = P[a], B = P[b], C = P[c]; vol += A[0] * (B[1] * C[2] - B[2] * C[1]) - A[1] * (B[0] * C[2] - B[2] * C[0]) + A[2] * (B[0] * C[1] - B[1] * C[0]); }
  const out = {};
  for (const [a, b, c, m] of tris) (out[m] ||= []).push(vol < 0 ? [a, c, b] : [a, b, c]);
  const res = {};
  for (const [m, L] of Object.entries(out)) {
    const flat = [], I = [];
    for (const tri of L) for (const i of tri) { I.push(flat.length / 3); flat.push(...P[i]); }
    res[m] = mesh(flat, I, { crease, closed: false });
  }
  return res;
}
/** revolve [[r, t] ...] about the t axis, oval ks / kw, centred on s0 */
function revT(pts, { seg = 32, ks = 1, kw = 1, s0 = 0, crease = 40 } = {}) {
  let A = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; A += p[0] * q[1] - q[0] * p[1]; }
  const P = A < 0 ? [...pts].reverse() : pts;
  const g = new THREE.LatheGeometry(P.map(([r, t]) => new THREE.Vector2(Math.max(0, r), t)), seg);
  g.scale(kw, 1, ks);
  g.translate(0, 0, -s0);
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  return outwardT(g.toNonIndexed(), crease);
}
function outwardT(geo, crease = 40) {
  const p = geo.attributes.position.array;
  let vol = 0;
  for (let i = 0; i < p.length; i += 9) vol += p[i] * (p[i + 4] * p[i + 8] - p[i + 5] * p[i + 7]) - p[i + 1] * (p[i + 3] * p[i + 8] - p[i + 5] * p[i + 6]) + p[i + 2] * (p[i + 3] * p[i + 7] - p[i + 4] * p[i + 6]);
  if (vol < 0) for (let i = 0; i < p.length; i += 9) for (let c = 0; c < 3; c++) { const t = p[i + 3 + c]; p[i + 3 + c] = p[i + 6 + c]; p[i + 6 + c] = t; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', geo.attributes.position);
  return toCreasedNormals(g, crease * D2R);
}
/** ring of beads round the t axis at height t (centre s0), oval radii (rs, rw), bead radius br, n beads */
function beadRing(t, s0, rs, rw, br, n, { per = 2, R = 4 } = {}) {
  const N = n * per, P = [], I = [];
  for (let i = 0; i < N; i++) {
    const a = i / N * TAU, rr = br * (0.4 + 0.6 * Math.abs(Math.cos(Math.PI * n * i / N)));
    const c = [s0 + Math.cos(a) * rs, t, Math.sin(a) * rw], nr = vnorm([Math.cos(a) * rw, 0, Math.sin(a) * rs]);
    for (let j = 0; j < R; j++) { const b = j / R * TAU; P.push(c[0] + nr[0] * Math.cos(b) * rr, t + Math.sin(b) * rr, c[2] + nr[2] * Math.cos(b) * rr); }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < R; j++) {
    const a = i * R + j, b = i * R + (j + 1) % R, c = ((i + 1) % N) * R + j, d = ((i + 1) % N) * R + (j + 1) % R;
    I.push(a, b, c, b, d, c);
  }
  return mesh(P, I, { crease: 80, closed: true });
}
/** a closed wire (round section r) along a loop of [s, t, w] points */
function wireLoop(pts, r, radial = 5) {
  const n = pts.length, P = [], I = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i + n - 1) % n], b = pts[i], c = pts[(i + 1) % n];
    const T = vnorm(vsub(c, a)), ref = Math.abs(T[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], N1 = vnorm(vcross(T, ref)), N2 = vcross(T, N1);
    for (let j = 0; j < radial; j++) { const q = j / radial * TAU; P.push(...vadd(b, vadd(vmul(N1, Math.cos(q) * r), vmul(N2, Math.sin(q) * r)))); }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < radial; j++) {
    const a = i * radial + j, b = i * radial + (j + 1) % radial, c = ((i + 1) % n) * radial + j, d = ((i + 1) % n) * radial + (j + 1) % radial;
    I.push(a, c, b, b, c, d);
  }
  return mesh(P, I, { crease: 70, closed: true });
}
const hash = (k) => { const x = Math.sin(k * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
/** Catmull-Rom through [[x, y] ...] about `step` apart (closed by default), with the control span of each point */
function crv(P, step = 1, closed = true) {
  const n = P.length, pts = [], span = [];
  const at = (i) => (closed ? P[(i + n) % n] : P[Math.max(0, Math.min(n - 1, i))]);
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const k = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let j = 0; j < k; j++) {
      const u = j / k, u2 = u * u, u3 = u2 * u;
      pts.push([0, 1].map((c) => 0.5 * (2 * p1[c] + (p2[c] - p0[c]) * u + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * u2 + (3 * p1[c] - p0[c] - 3 * p2[c] + p3[c]) * u3)));
      span.push(i);
    }
  }
  if (!closed) { pts.push(P[n - 1]); span.push(n - 1); }
  return { pts, span };
}
/** a closed outline through control points, tagged per control span: the loop and one open polyline per tag run */
function tagged(CP, tagOf, step = 1) {
  const { pts, span } = crv(CP, step), lines = [];
  let cur = null;
  pts.forEach((p, i) => {
    const tag = tagOf(span[i]);
    if (!cur || cur.tag !== tag) { if (cur) cur.pts.push(p); cur = { tag, pts: [p] }; lines.push(cur); } else cur.pts.push(p);
  });
  cur.pts.push(pts[0]);
  if (lines.length > 1 && lines[0].tag === lines.at(-1).tag) { const L = lines.pop(); lines[0].pts = [...L.pts.slice(0, -1), ...lines[0].pts]; }
  return { loop: pts, lines: lines.map((l) => ({ ...l, closed: false })) };
}
/** cloud curl as a single tapered wire: centre, radius, direction, start angle, top height, width */
function curlW(cu, cv, r0, dir, a0, z1, lw = 1.0, n = 9) {
  const ta = a0 * D2R, pts = [[cu + Math.cos(ta) * r0 + Math.sin(ta) * dir * r0 * 1.2, cv + Math.sin(ta) * r0 - Math.cos(ta) * dir * r0 * 1.2]];
  for (let i = 0; i <= n; i++) { const u = i / n, a = (a0 + dir * u * 1.3 * 360) * D2R, rr = r0 * (1 - 0.68 * u); pts.push([cu + Math.cos(a) * rr, cv + Math.sin(a) * rr]); }
  return wireT(pts, (f) => lw * (1 - 0.4 * f), -0.05, z1, { step: 1.4 });
}
/** quarter-ellipse round-over: 0 at an outline, 1 from R inwards */
const fe = (d, R) => (d >= R ? 1 : Math.sqrt(Math.max(0, 1 - (1 - d / R) ** 2)));
/** a point on the +w face of a heightfield h (x, y) moved z along its normal (head-local x, y -> [s, t, w]) */
const onField = (h, e = 0.04) => (x, y, z = 0) => {
  const w = h(x, y), hs = (h(x + e, y) - h(x - e, y)) / (2 * e), ht = (h(x, y + e) - h(x, y - e)) / (2 * e), k = 1 / Math.hypot(hs, ht, 1);
  return [x - hs * k * z, y + HEAD_T - ht * k * z, w + k * z];
};
/** split a non-indexed geometry's triangles into groups by key(s, t) of their centroid */
function splitTris(geo, key) {
  const p = geo.attributes.position.array, n = geo.attributes.normal.array, out = {};
  for (let i = 0; i < p.length; i += 9) {
    const ax = p[i + 3] - p[i], ay = p[i + 4] - p[i + 1], az = p[i + 5] - p[i + 2], bx = p[i + 6] - p[i], by = p[i + 7] - p[i + 1], bz = p[i + 8] - p[i + 2];
    if (Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx) < 1e-4) continue;
    const k = key(-(p[i + 2] + p[i + 5] + p[i + 8]) / 3, (p[i + 1] + p[i + 4] + p[i + 7]) / 3);
    const o = (out[k] ||= { p: [], n: [] });
    for (let j = 0; j < 9; j++) { o.p.push(p[i + j]); o.n.push(n[i + j]); }
  }
  const res = {};
  for (const [k, { p: P, n: N }] of Object.entries(out)) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(N), 3));
    res[k] = g;
  }
  return res;
}
/**
 * faceted cabochon (the ruby eyes): an almond girdle of n facets round c on the plane (A major, B minor), crown rings
 * offset half a step, a small table; standing h along N; the back sunk 0.6 into the socket
 */
function facetGem(c, A, B, N, ra, rb, h, n = 14) {
  const P = [], I = [], pt = (x, y, z) => { P.push(...vadd(c, vadd(vadd(vmul(A, x), vmul(B, y)), vmul(N, z)))); return P.length / 3 - 1; };
  const ringOf = (k, z, off) => Array.from({ length: n }, (_, i) => { const a = (i + off) / n * TAU; return pt(Math.cos(a) * ra * k, Math.sin(a) * rb * k, z); });
  const g0 = ringOf(1, -0.6, 0), g1 = ringOf(1, h * 0.22, 0), c1 = ringOf(0.74, h * 0.68, 0.5), c2 = ringOf(0.4, h * 0.94, 0), top = pt(0, 0, h), bot = pt(0, 0, -0.6);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    I.push(bot, g0[j], g0[i], g0[i], g0[j], g1[i], g1[i], g0[j], g1[j]);
    I.push(g1[i], g1[j], c1[i], c1[i], g1[j], c2[j], c1[i], c2[j], c2[i]);     // kite facets
    I.push(c1[i], c2[i], c1[(i + n - 1) % n]);
    I.push(c2[i], c2[j], top);
  }
  for (let i = 0; i < n; i++) { const j = (i + n - 1) % n; I.push(g1[i], c1[i], c1[j]); }
  return mesh(P, I, { crease: 8, closed: true });
}
/**
 * Many small domes in one geometry with explicit normals (ray-skin nodules, granulation, bead lines, gold dust): an apex
 * fan over a base ring sunk a hair into the surface (and a mid ring with `mid`); the base normals lean out by `tilt`
 * so a 6-sided fan shades like a pebble.
 */
class Domes {
  constructor() { this.P = []; this.N = []; this.k = 0; }
  add(c, n, r, h, sides = 6, { tilt = 55, mid = false, sink = 0.03 } = {}) {
    if (LOD && r < 1.2) return this;
    n = vnorm(n);
    const e1 = vnorm(vcross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), e2 = vcross(n, e1), p0 = hash(++this.k * 1.731) * TAU;
    const ring = (rr, z, tl) => Array.from({ length: sides }, (_, i) => {
      const a = p0 + i / sides * TAU, rd = vadd(vmul(e1, Math.cos(a)), vmul(e2, Math.sin(a)));
      return [vadd(vadd(c, vmul(rd, rr)), vmul(n, z)), vnorm(vadd(vmul(n, Math.cos(tl * D2R)), vmul(rd, Math.sin(tl * D2R))))];
    });
    const B = ring(r, -sink, tilt), A = [vadd(c, vmul(n, h)), n];
    const tri = (...V) => { for (const [p, q] of V) { this.P.push(p[2], p[1], -p[0]); this.N.push(q[2], q[1], -q[0]); } };
    if (mid) {
      const Mr = ring(r * 0.62, h * 0.74, tilt * 0.5);
      for (let i = 0; i < sides; i++) { const j = (i + 1) % sides; tri(B[i], B[j], Mr[i]); tri(Mr[i], B[j], Mr[j]); tri(Mr[i], Mr[j], A); }
    } else for (let i = 0; i < sides; i++) tri(B[i], B[(i + 1) % sides], A);
    return this;
  }
  get count() { return this.P.length / 9; }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.P), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.N), 3));
    return g;
  }
}
/** unit normal of a surface point function f(u, v) -> [s, t, w] (numeric), turned to face `towards` */
function surfN(f, u, v, towards) {
  const p = f(u, v), n = vnorm(vcross(vsub(f(u + 0.05, v), p), vsub(f(u, v + 0.05), p)));
  return n[0] * towards[0] + n[1] * towards[1] + n[2] * towards[2] < 0 ? vmul(n, -1) : n;
}
/**
 * 如意 cloud head (design space; S mm across, the head towards local +v, turned by rot): a filled plate (z0 -> z1) with a
 * raised rim wire round it and an inward curl in each side lobe; `tail` > 0: a tapered streamer that long off the base
 */
const RUYI = [[0, -0.62], [0.36, -0.32], [0.74, -0.1], [0.9, 0.2], [0.76, 0.48], [0.46, 0.44], [0.4, 0.74], [0.18, 0.96], [-0.18, 0.96], [-0.4, 0.74], [-0.46, 0.44], [-0.76, 0.48], [-0.9, 0.2], [-0.74, -0.1], [-0.36, -0.32]];
function ruyiT(cu, cv, S, rot, z0, z1, { rim = 0.16, tail = 0, tailBend = 1 } = {}) {
  const c = Math.cos(rot), s = Math.sin(rot), tr = ([x, y]) => [cu + (x * c - y * s) * S * 0.5, cv + (x * s + y * c) * S * 0.5];
  // the plate: a wall, a rolled rim standing `rim` over the field just inside the outline, the field fanned to the centre
  const O = crv(RUYI.map(tr), S * 0.09).pts, I1 = insetPoly(O, S * 0.035), I2 = insetPoly(O, S * 0.085), C = [0, 0];
  for (const p of O) { C[0] += p[0] / O.length; C[1] += p[1] / O.length; }
  const T = [...loftT([O.map(([u, v]) => [u, v, z0]), O.map(([u, v]) => [u, v, z1]), I1.map(([u, v]) => [u, v, z1 + rim]), I2.map(([u, v]) => [u, v, z1]), I2.map(([u, v]) => [lerp(u, C[0], 0.5), lerp(v, C[1], 0.5), z1])])];
  for (const d of [-1, 1]) {
    const [x, y] = tr([d * 0.5, 0.17]), a0 = (d > 0 ? 200 : -20) + rot / D2R;
    T.push(...curlR(x, y, S * 0.17, -d, a0, z1 - 0.05, z1 + 0.15, S * 0.05, 8));
  }
  { const [x, y] = tr([0, 0.62]); T.push(...curlR(x, y, S * 0.1, 1, 250 + rot / D2R, z1 - 0.05, z1 + 0.13, S * 0.04, 6)); }
  if (tail > 0) {
    const P = [];
    for (let i = 0; i <= 8; i++) { const u = i / 8; P.push(tr([tailBend * 0.35 * Math.sin(u * Math.PI * 1.4), -0.55 - u * tail / (S * 0.5)])); }
    T.push(...roofT(crv(P, 1.6, false).pts, (f) => S * 0.11 * (1 - 0.85 * f), z0, z1 + 0.06, { step: 2 }));
  }
  return T;
}
/** a raised stroke with a ridge (roof) section, 6 triangles a segment: fine inlay lines, seal glyphs, frets */
function roofT(path, w, z0, z1, { step = 6, closed = false } = {}) {
  const P = resample(path, step, closed), n = P.length, W = typeof w === 'function' ? w : () => w, acc = [0];
  for (let i = 1; i < n; i++) acc.push(acc[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const tot = acc[n - 1] || 1, nrm = (a, c) => { const dx = c[0] - a[0], dy = c[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };
  const rings = [];
  for (let i = 0; i < n; i++) {
    const n1 = closed || i > 0 ? nrm(P[(i + n - 1) % n], P[i]) : null, n2 = closed || i < n - 1 ? nrm(P[i], P[(i + 1) % n]) : null;
    let m;
    if (!n1) m = n2; else if (!n2) m = n1; else { const k = 1 / Math.max(0.35, 1 + n1[0] * n2[0] + n1[1] * n2[1]); m = [(n1[0] + n2[0]) * k, (n1[1] + n2[1]) * k]; }
    const h = Math.max(0.05, W(acc[i] / tot) / 2);
    rings.push([[-h, z0], [0, z1], [h, z0]].map(([x, z]) => [P[i][0] + m[0] * x, P[i][1] + m[1] * x, z]));
  }
  return loftT(rings, { wrap: closed });
}
/** cloud curl as a roof stroke (curlW's path) */
function curlR(cu, cv, r0, dir, a0, z0, z1, lw = 1.0, n = 9) {
  const ta = a0 * D2R, pts = [[cu + Math.cos(ta) * r0 + Math.sin(ta) * dir * r0 * 1.2, cv + Math.sin(ta) * r0 - Math.cos(ta) * dir * r0 * 1.2]];
  for (let i = 0; i <= n; i++) { const u = i / n, a = (a0 + dir * u * 1.3 * 360) * D2R, rr = r0 * (1 - 0.68 * u); pts.push([cu + Math.cos(a) * rr, cv + Math.sin(a) * rr]); }
  return roofT(pts, (f) => lw * (1 - 0.4 * f), z0, z1, { step: 9 });
}
/** 原創篆印 glyph (design space, g mm square, centre cu, cv): an abstract seal-script stroke grammar -- a frame or a
 *  three-sided bracket, two or three inner bars on a 4 x 4 node grid, sometimes a hook -- not a real character */
function glyphT(seed, cu, cv, g, z0, z1, lw = 0.36) {
  const rnd = (k) => hash(seed * 13.71 + k * 3.17), q = g / 3, at = (i, j) => [cu - g / 2 + i * q, cv - g / 2 + j * q], S = [];
  const C = [at(0, 0), at(3, 0), at(3, 3), at(0, 3)], open = Math.floor(rnd(1) * 5);
  if (open === 4) S.push([...C, C[0]]); else S.push([0, 1, 2, 3].map((k) => C[(open + 1 + k) % 4]));
  const n = 2 + Math.floor(rnd(2) * 2);
  for (let i = 0; i < n; i++) {
    const hz = rnd(10 + i) < 0.5, k = 1 + Math.floor(rnd(20 + i) * 2), a0 = Math.floor(rnd(30 + i) * 2), a1 = Math.min(3, a0 + 1 + Math.floor(rnd(40 + i) * 3));
    S.push(hz ? [at(a0, k), at(a1, k)] : [at(k, a0), at(k, a1)]);
  }
  if (rnd(50) < 0.6) { const k = 1 + Math.floor(rnd(51) * 2); S.push([at(k, 1), at(k, 2), at(k + (rnd(52) < 0.5 ? -1 : 1) * 0.5, 2)]); }
  return cat(...S.map((p) => roofT(p, lw, z0, z1, { step: 9 })));
}
/** walls of a plate face meshed by hfFace (its M: X, Y, bnd loops; material left of every loop) from the face at +h to
 *  its mirror at -h through the map's z = 0 (any map, unlike hfFace's own walls, which mirror w) */
function plateWalls(M, h, map) {
  const { X, Y, bnd } = M, WP = [], toV3 = (p) => new THREE.Vector3(p[2], p[1], -p[0]);
  for (const ids of bnd) for (let k = 0; k < ids.length; k++) {
    const a = ids[k], b = ids[(k + 1) % ids.length], ha = h(X[a], Y[a]), hb = h(X[b], Y[b]);
    const q = [map(X[a], Y[a], ha), map(X[b], Y[b], hb), map(X[b], Y[b], -hb), map(X[a], Y[a], ha), map(X[b], Y[b], -hb), map(X[a], Y[a], -ha)].map(toV3);
    const ex = X[b] - X[a], ey = Y[b] - Y[a], out = toV3(map(X[a] + ey, Y[a] - ex, 0)).sub(toV3(map(X[a], Y[a], 0)));
    const fn = q[1].clone().sub(q[0]).cross(q[2].clone().sub(q[0]));
    for (const v of fn.dot(out) < 0 ? [q[0], q[2], q[1], q[3], q[5], q[4]] : q) WP.push(v.x, v.y, v.z);
  }
  const W = new THREE.BufferGeometry();
  W.setAttribute('position', new THREE.BufferAttribute(new Float32Array(WP), 3));
  return toCreasedNormals(W, 40 * D2R);
}
/** mirror a (three-space) geometry across t = t0, normals and winding kept right */
function mirrorT(geo, t0) {
  const g = geo.clone(), p = g.attributes.position.array, n = g.attributes.normal.array;
  for (let i = 1; i < p.length; i += 3) { p[i] = 2 * t0 - p[i]; n[i] = -n[i]; }
  for (let i = 0; i < p.length; i += 9) for (let c = 0; c < 3; c++) {
    let t = p[i + 3 + c]; p[i + 3 + c] = p[i + 6 + c]; p[i + 6 + c] = t;
    t = n[i + 3 + c]; n[i + 3 + c] = n[i + 6 + c]; n[i + 6 + c] = t;
  }
  return g;
}

// ------------------------------------------------------------------------------------------ materials
// Yazi palette: black lacquer + mirror steel, red gold (赤金) trim, cinnabar scabbard, crimson crystal light
const M = {
  spine: 'steel_bright', sj: 'black_chrome', ji: 'steel_bright', hamon: 'steel', edge: 'chrome', groove: 'black_chrome',
  gold: 'gold', bronze: 'bronze_dark', fit: 'bronze_aged', skin: 'leather_pebble', wrap: 'leather_black',
  lacquer: 'lacquer_red', black: 'lacquer_black', leaf: 'gold_leaf', silk: 'silk_red', bone: 'bone', eye: 'crystal', mouth: 'lacquer_red',
  rune: 'glaze_black', glow: 'glow_red', paper: 'ceramic',
};

// ======================================================================================================= the blade
function blade(add) {
  // rings every ~5 mm down the whole blade: the temper line is a material boundary through the ring vertices, so their
  // spacing is what keeps it a smooth wave (9.5 mm made a stepped sawtooth in the foible); the yokote gets its own pair
  const T = [T_YOKO - 1.2, T_YOKO + 0.8];
  for (let t = -2; t < 40; t += 6) T.push(t);
  for (const d of [-9, -6, -3, -1, 0, 1.5, 3, 5, 7, 9, 12]) { T.push(GROOVE.t0 + d); T.push(GROOVE.t1 - d); }
  for (let t = 40; t < T_YOKO - 2; t += 5.2) T.push(t);
  for (let i = 0; i <= 24; i++) T.push(T_YOKO + (T_TIP - T_YOKO) * (1 - Math.pow(1 - i / 24, 1.3)));
  const TS = [...new Set(T.filter((t) => t >= -2 && t <= T_TIP).map((t) => Math.round(t * 100) / 100))].sort((a, b) => a - b);
  const NUP = 18;
  const ring = (t) => {
    const b = bladeAt(t), { sb, se, W, h } = b;
    if (W < 0.08) return Array.from({ length: 2 * NUP + 2 }, () => [PNT, t, 0]);
    const k = Math.min(1, W / 26), hm = h * 0.84;
    const apex = sb - 1.15 * k, sr = ridgeS(t, b), sg = se - 1.35 * k, wg = 0.42 * k;
    const sh = temperS(t, b);
    const f = grooveAt(t), gw = GROOVE.half * Math.sqrt(f), gd = GROOVE.depth * f;
    const gc = Math.min(Math.max(GC + curveS(t), sb + 1.4), sr - 1.4);
    const wSJ = (s) => lerp(hm + 0.12, h, clamp01((s - sb) / Math.max(0.5, sr - sb)));
    const wJi = (s) => { const u = clamp01((s - sr) / Math.max(0.5, sg - sr)); return lerp(h, wg, Math.pow(u, 0.92)); };   // a little niku
    // ... ridge, the ji, three vertices grading into the temper line (the nioi fringe is baked on them), the hamon, the
    // edge bevel
    const S = [apex, sb, sb + 0.55 * k, gc - gw - 0.4, gc - gw, gc - gw + 0.55 * Math.sqrt(f), gc + gw - 0.55 * Math.sqrt(f), gc + gw, gc + gw + 0.4, sr,
      sr + 0.35 * k, lerp(sr, sh, 0.5), sh - 2.2 * k, sh - 1.1 * k, sh - 0.45 * k, sh, Math.min(sh + 0.9 * k, lerp(sh, sg, 0.45)), lerp(sh, sg, 0.6), sg, se];
    for (let i = 1; i < S.length; i++) S[i] = Math.max(S[i], S[i - 1] + 0.012);
    const up = [
      [S[1], hm], [S[2], hm + 0.1], [S[3], wSJ(S[3])], [S[4], wSJ(S[4]) - 0.18 * f], [S[5], wSJ(S[5]) - gd], [S[6], wSJ(S[6]) - gd], [S[7], wSJ(S[7]) - 0.18 * f], [S[8], wSJ(S[8])],
      [S[9], h], [S[10], h - 0.025], ...S.slice(11, 18).map((s) => [s, wJi(s)]), [S[18], wg],
    ];
    return [[S[0], t, 0], ...up.map(([s, w]) => [s, t, w]), [S[19], t, 0], ...up.slice().reverse().map(([s, w]) => [s, t, -w])];
  };
  // segment classes, upper half (spine -> edge), mirrored for the lower half. Past the yokote the ji is the kissaki's
  // own polish zone (narume, baked lighter) and the shinogi-ji narrows to the ko-shinogi-ji
  const UP = ['spine', 'spine', 'sj', 'groove', 'groove', 'groove', 'groove', 'groove', 'sj', 'ji', 'ji', 'ji', 'NIOI', 'NIOI', 'NIOI', 'hamon', 'hamon', 'hamon', 'edge'];
  const cls = [...UP, ...UP.slice().reverse()];
  const rings = TS.map(ring);
  const geos = zonedLoft(rings, (k, j) => {
    const c = cls[j], t = TS[k];
    if (c === 'groove' && grooveAt(t) === 0 && grooveAt(TS[k + 1]) === 0) return M.sj;
    if (t < HAB[1] - 4 && (c === 'edge' || c === 'hamon' || c === 'NIOI')) return M.ji;       // under the collar
    return c === 'NIOI' ? M.ji : M[c];
  }, { capA: true, capB: false, crease: 26 });
  for (const [m, g] of Object.entries(geos)) add('gun', m, g);

  // ---- the rune strip (fx_rune, pv_rune): a thin plate on the groove floor, both faces
  for (const sd of [1, -1]) {
    const R = [];
    for (let t = GROOVE.t0 + 9; t <= GROOVE.t1 - 9 + 0.01; t += 6) {
      const w = sjW(t, GC) - GROOVE.depth + 0.07;
      R.push([[GC - 1.75, t, sd * (w - 0.06)], [GC - 1.6, t, sd * w], [GC + 1.6, t, sd * w], [GC + 1.75, t, sd * (w - 0.06)]]);
    }
    add('fx_rune', M.rune, loft(R, { crease: 60 }));
  }
  // ---- energy edge (fx_edge, rest hidden): a hairline of crimson light just off the cutting edge, collar -> point
  {
    const R = [];
    for (let t = HAB[1] + 4; t <= T_TIP - 1.5; t += 6) {
      const { se, W } = bladeAt(t), k = Math.min(1, W / 12) * smooth(HAB[1] + 4, HAB[1] + 40, t), hh = 0.3 * Math.max(0.3, k);
      R.push([[se + 0.25 * k, t, hh], [se + 1.6 * k, t, hh * 0.5], [se + 1.6 * k, t, -hh * 0.5], [se + 0.25 * k, t, -hh]]);
    }
    add('fx_edge', M.glow, loft(R, { crease: 60 }));
  }
  // ---- the gold-inlaid cartouche (錯金) on the shinogi-ji / ji above the collar, both faces: a double frame, two cloud
  // curls, a seal (原創篆印: an abstract stroke grammar, not a real character), granules at the corners
  for (const sd of [1, -1]) {
    const TC = 58, map = (u, v, z) => { const t = TC + u, s = SB0 + 13 + v, b = bladeAt(t), sr = b.sb + 0.31 * b.W; const w = s <= sr ? sjW(t, s) : lerp(b.h, 0.42, clamp01((s - sr) / (b.se - 1.35 - sr))); return [s, t, sd * (w + z)]; };
    const frame = (ins) => { const o = []; for (let i = 0; i < 32; i++) { const a = i / 32 * TAU, se = (c, e) => Math.sign(c) * Math.pow(Math.abs(c), e); o.push([se(Math.cos(a), 0.35) * (20 - ins), se(Math.sin(a), 0.35) * (6.2 - ins)]); } return o; };
    add('gun', M.gold, mapTris(wireT(frame(0), 0.7, -0.05, 0.22, { closed: true, step: 3.6 }), map, 55));
    add('gun', M.gold, mapTris(wireT(frame(1.7), 0.4, -0.05, 0.16, { closed: true, step: 4 }), map, 55));
    for (const dx of [-1, 1]) add('gun', M.gold, mapTris(curlW(dx * 11.5, 0, 2.6, dx, dx > 0 ? 160 : 20, 0.2, 0.55), map, 55));
    // the seal: a square of strokes
    const seal = [[[-3, -3], [3, -3], [3, 3], [-3, 3], [-3, -3]], [[-1.6, -1.8], [-1.6, 1.8]], [[-1.6, 0], [1.8, 0]], [[0.4, -1.8], [1.6, -1.8], [1.6, 1.8], [0.4, 1.8]], [[-0.4, 0], [-0.4, 1.8]]];
    for (const p of seal) add('gun', M.gold, mapTris(roofT(p, 0.45, -0.05, 0.2, { step: 9 }), map, 55));
    for (const [u, v] of [[-18.5, -4.8], [18.5, -4.8], [-18.5, 4.8], [18.5, 4.8]]) add('gun', M.gold, dome(map(u, v, 0), [0, 0, sd], 0.5, 0.32, 6));
  }
}

// ======================================================================================================= collar + guard
function habaki(add) {
  // two tiers: the lower one thicker (file-marked), a step and a bead, the upper one tapering into the blade
  const sec = (t, grow) => {
    const { sb, se, h } = bladeAt(t), o = [];
    const half = [[sb - grow, 0], [sb - grow * 0.6, h * 0.8 + grow * 0.7], [sb + 1.0, h + grow], [lerp(sb, se, 0.5), h + grow], [se - 2.0, h * 0.42 + grow * 0.92], [se + grow * 0.6, h * 0.16 + grow * 0.6], [se + grow, 0]];
    for (const [s, w] of half) o.push([s, t, w]);
    for (const [s, w] of half.slice(1, -1).reverse()) o.push([s, t, -w]);
    return o;
  };
  const R = [[HAB[0] - 1, 1.6], [19.4, 1.6], [19.6, 1.95], [20.4, 2.15], [21.2, 1.95], [21.4, 1.25], [HAB[1] - 1.2, 1.0], [HAB[1], 0.4]].map(([t, g]) => sec(t, g));
  add('gun', M.gold, loft(R, { crease: 50 }));
  // file marks (neko-gaki): fine diagonal ribs on the lower tier, both faces
  for (const sd of [1, -1]) {
    const T = [];
    for (let i = 0; i < 9; i++) { const u = -11 + i * 2.6; T.push(...wireT([[u, 1.5], [u + 4.5, 17.5]], 0.45, -0.05, 0.16, { step: 3 })); }
    add('gun', M.gold, mapTris(T, (u, v, z) => { const t = v, b = bladeAt(t); return [lerp(b.sb, b.se, 0.5) + u * 0.9, t, sd * (b.h + 1.6 + z)]; }, 55));
  }
  // the upper tier, engraved: a border line along each end and a pair of cloud curls facing each other with a granule
  // between them (raised 0.15: gold on gold reads by its relief), both faces
  const gOf = curveFn([[21.4, 1.25], [HAB[1] - 1.2, 1.0], [HAB[1], 0.4]]);
  for (const sd of [1, -1]) {
    const map = (u, v, z) => {
      const b = bladeAt(v), g = gOf(v), mid = lerp(b.sb, b.se, 0.5), s = mid + u;
      const w = s <= mid ? b.h + g : lerp(b.h + g, b.h * 0.42 + g * 0.92, clamp01((s - mid) / (b.se - 2 - mid)));
      return [s, v, sd * (w + z)];
    };
    const T = [...roofT([[-13.6, 22.7], [4.5, 22.7]], 0.42, -0.06, 0.15, { step: 3 }), ...roofT([[-13.6, 31.5], [4.5, 31.5]], 0.42, -0.06, 0.15, { step: 3 }),
      ...curlR(-9.4, 27.1, 2.3, 1, 200, -0.06, 0.16, 0.55, 8), ...curlR(-2.6, 27.1, 2.3, -1, -20, -0.06, 0.16, 0.55, 8)];
    add('gun', M.gold, mapTris(T, map, 50));
    for (const u of [-6.0, 1.6]) add('gun', M.gold, dome(map(u, 27.1, -0.05), [0, 0, sd], 0.45, 0.32, 6));
  }
}

function guard(add) {
  const { t0, t1, R } = TSUBA, tc = (t0 + t1) / 2, th = t1 - t0, Hb = th / 2;
  // six cloud windows round the seppa-dai, alternating a cloud comma and a split leaf
  const win = (k, step = 1.1) => {
    const a0 = k / 6 * TAU + Math.PI / 6, P = [];
    const shape = k % 2 ? [[0, -5.2], [3.8, -3.6], [5.6, 0], [4.4, 3.8], [1.2, 5.6], [-1.6, 4.0], [-0.2, 1.6], [-2.6, -0.8], [-4.6, -3.2]] : [[0, -6.0], [3.2, -2.8], [3.8, 1.6], [1.6, 5.2], [0, 6.2], [-1.6, 5.2], [-3.8, 1.6], [-3.2, -2.8]];
    const cr = 27.5, ca = Math.cos(a0), sa = Math.sin(a0);
    for (const [x, y] of crv(shape, step).pts) P.push([cr * ca + x * ca - y * sa, cr * sa + x * sa + y * ca]);
    return P;
  };
  const W6 = Array.from({ length: 6 }, (_, k) => win(k, 0.8));
  // the plate face as a heightfield over (s, w) (z = half thickness, mirrored through the plate's mid plane): a rolled lip
  // round every window with a groove 2.5 mm out holding the inlaid gold wire, a cast scroll beside each window, six ribs
  // between them, a groove for the border wire, and a hammered (tsuchime) ground clear of all of it. Meshed with
  // interior vertices (the old extruded plate fanned 30-40 mm slivers from the rim into the windows: the bake's AO and
  // patina streaked along them)
  const WI = new SegIndex(W6.map((p) => ({ pts: p, closed: true, tag: 'w' })), 2);
  const spiral = (c, r0, r1, a0, turns, dir, n = 40) => { const o = []; for (let i = 0; i <= n; i++) { const u = i / n, a = (a0 + dir * u * turns * 360) * D2R, r = lerp(r0, r1, u); o.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]); } return o; };
  const curls = Array.from({ length: 6 }, (_, k) => {
    const sd = k % 2 ? 1 : -1, a = k / 6 * TAU + Math.PI / 6 + sd * 0.42, c = [32 * Math.cos(a), 32 * Math.sin(a)];
    return spiral(c, 2.4, 0.7, a / D2R + 180 - sd * 40, 1.2, sd);
  });
  const CI = new SegIndex(curls.map((p) => ({ pts: p, tag: 'c' })), 2);
  const DS = 3.2;
  const dent = (x, y) => {
    let best = 9; const i0 = Math.floor(x / DS), j0 = Math.floor(y / DS);
    for (let j = j0 - 1; j <= j0 + 1; j++) for (let i = i0 - 1; i <= i0 + 1; i++) {
      const px = (i + 0.5 + 0.7 * (hash(i * 7.1 + j * 13.3) - 0.5)) * DS, py = (j + 0.5 + 0.7 * (hash(i * 3.7 + j * 5.9 + 1) - 0.5)) * DS;
      best = Math.min(best, Math.hypot(x - px, y - py));
    }
    const q = Math.min(1, best / 1.9); return (1 - q * q) ** 2;
  };
  const h = (x, y) => {
    const r = Math.hypot(x, y), ov = Math.hypot(x / 21.5, y / 9.0);
    const nw = WI.near(x, y, 4.2), d = nw ? nw.d : 4.2;
    let z = Hb + 0.7 * Math.exp(-(((d - 0.35) / 0.75) ** 2)) - 0.24 * halfRound(Math.abs(d - 2.5), 0.45);
    z -= 0.22 * halfRound(Math.abs(r - (R - 3.6)), 0.5);
    if (r > 21 && r < R - 2.6) for (let k = 0; k < 6; k++) {
      const a = k / 6 * TAU, ca = Math.cos(a), sa = Math.sin(a), u = x * ca + y * sa, v = -x * sa + y * ca;
      if (u < 21 || u > R - 3) continue;
      z += 0.5 * halfRound(Math.abs(v), 1.1 - 0.45 * clamp01((u - 22) / (R - 25.2))) * sstep(21, 23, u) * (1 - sstep(R - 4.2, R - 3, u));
    }
    { const c = CI.near(x, y, 0.7); if (c) z += 0.42 * halfRound(c.d, 0.6); }
    z -= 0.1 * dent(x, y) * sstep(1.4, 3.4, d) * sstep(1.0, 1.12, ov) * (1 - sstep(R - 2.2, R - 1.2, r));
    return z;
  };
  // meshed in (w, s) (hfFace takes its normals from the map's gradient: the map must be right-handed about +t)
  const hs = (x, y) => h(y, x), sw = (P) => P.map(([s, w]) => [w, s]), map = (x, y, z) => [y, tc + z, x];
  const F = hfFace([{ pts: sw(arcP(0, 0, R - 0.3, 0, 360, 168).slice(0, -1)), tag: 'o' }, ...W6.map((p) => ({ pts: sw(p), tag: 'w' }))], hs,
    { map, walls: false, tol: 0.1, minCell: 1.1, maxCell: 4.4, edge: 0.9, decimate: { error: 0.04, normals: 0.15, ao: 0 } });
  add('gun', M.bronze, F.face);
  add('gun', M.bronze, mirrorT(F.face, tc));
  add('gun', M.bronze, plateWalls(F.M, hs, map));
  // gold rim (覆輪): slim, a bead line run round its middle so the openwork bronze, not a plain gold band, dominates
  add('gun', M.gold, revT([[R - 0.9, t0 - 0.15], [R - 0.25, t0 - 0.15], [R + 0.2, t0 + 0.3], [R + 0.34, tc], [R + 0.2, t1 - 0.3], [R - 0.25, t1 + 0.15], [R - 0.9, t1 + 0.15]], { seg: 96 }));
  // bead lines: round the rim's middle, and round each face just inside it
  const B = new Domes();
  for (let i = 0; i < 150; i++) { const a = (i + 0.5) / 150 * TAU, c = Math.cos(a), s = Math.sin(a); B.add([c * (R + 0.3), tc, s * (R + 0.3)], [c, 0, s], 0.5, 0.42, 6); }
  for (const [t, sd] of [[t0 - 0.05, -1], [t1 + 0.05, 1]]) for (let i = 0; i < 84; i++) { const a = (i + 0.5) / 84 * TAU, c = Math.cos(a), s = Math.sin(a); B.add([c * (R - 1.35), t, s * (R - 1.35)], [0, sd, 0], 0.45, 0.36, 6); }
  add('gun', M.gold, B.geo());
  // seppa-dai (the raised oval centre) on both faces + gold washers (seppa) either side
  for (const [face, sd] of [[t1, 1], [t0, -1]]) {
    add('gun', M.bronze, revT([[0, face], [21.5, face], [21.2, face + sd * 0.55], [20.4, face + sd * 0.8], [0, face + sd * 0.8]], { seg: 48, ks: 1.0, kw: 0.42 }));
    // a gold wire inlaid in the groove round each window (金線象嵌), the border wire in its groove
    const fm = (u, v, z) => [u, face + sd * z, v];
    for (const P of Array.from({ length: 6 }, (_, k) => win(k, 2.0))) {
      const off = P.map(([s, w], i) => { const a = P[(i + P.length - 1) % P.length], b = P[(i + 1) % P.length], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [s + dy / l * 2.5, w - dx / l * 2.5]; });
      add('gun', M.gold, mapTris(roofT(crv(off, 2.2).pts, 0.6, -0.3, 0.14, { closed: true, step: 2.4 }), fm, 50));
    }
    add('gun', M.gold, mapTris(roofT(arcP(0, 0, R - 3.6, 0, 359, 96).slice(0, -1), 0.55, -0.28, 0.12, { closed: true, step: 3 }), fm, 50));
    // rivet heads capping the ribs
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; add('gun', M.gold, dome([Math.cos(a) * (R - 4.6), face + sd * 0.4, Math.sin(a) * (R - 4.6)], [0, sd, 0], 0.85, 0.65, 8)); }
    const sp = face + sd * 0.8;
    add('gun', M.gold, revT([[0, sp], [18.6, sp], [18.9, sp + sd * 0.3], [18.6, sp + sd * 0.7], [0, sp + sd * 0.7]], { seg: 40, ks: 1.0, kw: 0.36 }));
  }
}

// ======================================================================================================= grip
function grip(add) {
  const G = GRIP;
  // fuchi collar (gold, a black lacquer band between bead lines), the pommel ferrule (gold, black band, beads)
  add('gun', M.gold, revT([[0, FUCHI[1] + 0.6], [14.6, FUCHI[1] + 0.6], [15.9, FUCHI[1] - 0.4], [16.2, FUCHI[1] - 2.2], [16.2, FUCHI[0] + 2.2], [15.6, FUCHI[0] + 0.4], [14.9, FUCHI[0]], [0, FUCHI[0]]], { seg: 44, ks: 1.0, kw: 0.79 }));
  add('gun', M.black, revT([[0, FUCHI[1] - 3.4], [16.45, FUCHI[1] - 3.4], [16.5, FUCHI[0] + 3.6], [0, FUCHI[0] + 3.6]], { seg: 44, ks: 1.0, kw: 0.79 }));
  for (const t of [FUCHI[1] - 3.1, FUCHI[0] + 3.3]) add('gun', M.gold, beadRing(t, 0, 16.6, 13.1, 0.55, 30));
  add('gun', M.gold, revT([[0, KASH[1]], [15.6, KASH[1]], [16.0, KASH[1] - 1.2], [16.0, KASH[0] + 2.0], [14.8, KASH[0] + 0.6], [11.0, KASH[0]], [0, KASH[0]]], { seg: 44, ks: 1.0, kw: 0.79 }));
  add('gun', M.black, revT([[0, KASH[1] - 3.6], [16.25, KASH[1] - 3.6], [16.3, KASH[1] - 7.2], [0, KASH[1] - 7.2]], { seg: 44, ks: 1.0, kw: 0.79 }));
  for (const t of [KASH[1] - 3.3, KASH[1] - 7.5]) add('gun', M.gold, beadRing(t, 0, 16.4, 12.95, 0.5, 30));
  // ray-skin core (slightly waisted); u = arc length round the oval from the edge side (a 0) towards +w
  const surf = gripSurf, nrmAt = (a) => vnorm([G.b * Math.cos(a), 0, G.a * Math.sin(a)]);
  const NAR = 720, ARC = new Float64Array(NAR + 1);
  for (let i = 1; i <= NAR; i++) { const a0 = (i - 1) / NAR * TAU, a1 = i / NAR * TAU; ARC[i] = ARC[i - 1] + Math.hypot(G.a * (Math.cos(a1) - Math.cos(a0)), G.b * (Math.sin(a1) - Math.sin(a0))); }
  const PER = ARC[NAR];
  const aOfU = (u) => { u = ((u % PER) + PER) % PER; let lo = 0, hi = NAR; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ARC[m] <= u) lo = m; else hi = m; } return (lo + (u - ARC[lo]) / (ARC[hi] - ARC[lo])) / NAR * TAU; };
  const uOfA = (a) => { a = ((a % TAU) + TAU) % TAU; const f = a / TAU * NAR, i = Math.min(NAR - 1, Math.floor(f)); return ARC[i] + (f - i) * (ARC[i + 1] - ARC[i]); };
  const wrapU = (d) => d - PER * Math.round(d / PER);
  const onSkin = (a, t, z = 0) => vadd(surf(a, t, 0), vmul(nrmAt(a), z));
  {
    const core = [];
    for (let t = G.t0 + 0.5; t >= G.t1 - 0.5; t -= 5.5) core.push(Array.from({ length: 36 }, (_, i) => surf(i / 36 * TAU, t, 0)));
    core.push(Array.from({ length: 36 }, (_, i) => surf(i / 36 * TAU, G.t1 - 0.5, 0)));
    add('gun', M.skin, loft(core, { crease: 60 }));
  }

  // ---- menuki: a cast cloud with a 睚眥 paw gripping it (three talons, a knuckled wrist reaching in from the edge
  // side), 2-3 mm of rounded relief on each flat, sculpted as a heightfield; the wrap rides up over it
  const TM = -116.5, MU0 = [uOfA(Math.PI / 2), uOfA(-Math.PI / 2)];   // centred in the +w window (the -w one sits under a crossing)
  const MEN = crv([[0, 13.0], [-2.6, 12.0], [-3.2, 10.6], [-5.6, 10.0], [-6.8, 7.8], [-5.8, 5.6], [-3.6, 4.6], [-4.2, 1.0], [-5.2, -3.0], [-4.6, -7.4], [-2.2, -11.0], [1.4, -12.6], [4.8, -11.6], [6.2, -9.0],
    [4.6, -7.2], [2.6, -8.2], [1.0, -6.4], [2.4, -2.0], [4.2, 1.6], [3.6, 4.6], [5.8, 5.6], [6.8, 7.8], [5.6, 10.0], [3.2, 10.6], [2.6, 12.0]], 0.5).pts;
  const MI = new SegIndex([{ pts: MEN, closed: true, tag: 'o' }], 1.5);
  const spiral = (c, r0, r1, a0, turns, dir, n = 36) => { const o = []; for (let i = 0; i <= n; i++) { const u = i / n, a = (a0 + dir * u * turns * 360) * D2R, r = lerp(r0, r1, u); o.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]); } return o; };
  const MC = new SegIndex([spiral([0, 10.4], 1.8, 0.4, 200, 1.2, -1), spiral([-4.4, 7.8], 1.6, 0.4, 0, 1.2, 1), spiral([4.4, 7.8], 1.6, 0.4, 180, 1.2, -1), spiral([3.4, -9.8], 1.8, 0.4, 90, 1.25, 1)].map((p) => ({ pts: p, tag: 'c' })), 1.5);
  const toes = [[[-2.2, 0.7], [-0.2, 2.6], [1.6, 3.7], [2.7, 3.0]], [[-1.8, -0.2], [0.6, 0.1], [2.7, -0.1], [3.5, -1.0]], [[-2.2, -1.0], [-0.5, -3.1], [1.2, -4.4], [2.3, -4.0]]].map((c) => crv(c, 0.3, false).pts);
  const TI = new SegIndex(toes.map((p, i) => ({ pts: p, tag: i })), 1.5), WR = new SegIndex([{ pts: [[-9, -1.6], [-6, -1.0], [-3.8, -0.5], [-2.0, -0.2]], tag: 'w' }], 1.5);
  const menH = (x, y) => {
    const e = MI.near(x, y, 2.2), dE = e ? e.d : 2.2;
    if (!MI.inside(x, y)) return 0;
    let z = 1.45 * fe(dE, 1.9) + 0.45 * bump(x, y, 0, 10.6, 2.6, 2.4) + 0.4 * bump(x, y, -4.4, 7.8, 2.5, 2.3) + 0.4 * bump(x, y, 4.4, 7.8, 2.5, 2.3) + 0.3 * bump(x, y, 0, -8.6, 4, 3.6);
    { const c = MC.near(x, y, 0.5); if (c) z -= 0.34 * halfRound(c.d, 0.45) * sstep(0.2, 1.0, dE); }
    { const w = WR.near(x, y, 2.4); if (w) z += 0.95 * halfRound(w.d, 2.3) * sstep(0, 0.8, dE); }
    const tq = TI.near(x, y, 1.3);
    if (tq) { const u = tq.u / tq.len, wd = 1.2 * (1 - 0.6 * u) + 0.05; z += (1.05 - 0.3 * u) * halfRound(tq.d, wd) + 0.28 * bump(x, y, ...toes[tq.tag][Math.round(toes[tq.tag].length * 0.32)], 1.1, 1.1); }
    return z;
  };
  for (const sd of [1, -1]) {
    // x runs against u on both flats: right-handed about each outward normal, both paws on the spine side
    const mu = MU0[sd > 0 ? 0 : 1], map = (x, y, z) => { const a = aOfU(mu - x); return onSkin(a, TM + y, z - 0.3); };
    const F = hfFace([{ pts: MEN, tag: 'o' }], menH, { map, walls: false, tol: 0.05, minCell: 0.4, maxCell: 1.6, edge: 0.5, decimate: { error: 0.035, normals: 0.2, ao: 0.3 } });
    add('gun', M.gold, F.face);
  }
  // menuki height under a point of the skin (a, t): the wrap lifts over it
  const menAt = (a, t) => { let m = 0; for (const i of [0, 1]) { const x = -wrapU(uOfA(a) - MU0[i]), y = t - TM; if (Math.abs(x) < 8 && Math.abs(y) < 14) m = Math.max(m, menH(x, y)); } return m; };

  // ---- two-strand leather wrap (tsuka-maki): helices of opposite hand, over / under at alternate crossings, folded (a
  // raised crease) where they cross, three ribs 0.3 mm deep along each strand; lifted over the menuki
  const pitch = 33, t0 = G.t0 - 2, t1 = G.t1 + 2, HW = 5.3;
  const X = [-1, -0.88, -0.62, -0.31, 0, 0.31, 0.62, 0.88, 1], Z = [-1, 0.5, 1, 0.58, 1, 0.58, 1, 0.5, -1];
  const CL = { 1: [], [-1]: [] };   // strand centre lines on the skin: [s, t, w, half width]
  for (const hand of [1, -1]) {
    const R = [];
    for (let t = t0; t >= t1 - 0.01; t -= 1.2) {
      const ph = (t0 - t) / pitch * TAU, a = hand * ph + (hand > 0 ? 0 : Math.PI), dr = 0.8 + 0.45 * hand * Math.sin(ph);
      const tan0 = vnorm(vsub(surf(a + hand * 0.02, t - 0.02 * pitch / TAU, dr), surf(a, t, dr))), nrm = nrmAt(a), bin = vnorm(vcross(nrm, tan0));
      let lift = 0;
      for (const x of [-0.8, -0.4, 0, 0.4, 0.8]) { const p = vadd(surf(a, t, 0), vmul(bin, x * HW)); lift = Math.max(lift, menAt(Math.atan2(p[2] / G.b, p[0] / G.a), p[1])); }
      const c = vadd(surf(a, t, 0), vmul(nrm, dr + lift)), tan = tan0;
      const m = ((ph % Math.PI) + Math.PI) % Math.PI, fold = hand * Math.sin(ph) > 0 ? Math.exp(-(((m - Math.PI / 2) / 0.32) ** 2)) : 0;
      const hw = HW * (1 - 0.2 * fold), th = 0.72, b2 = vnorm(vcross(nrm, tan));
      CL[hand].push([...surf(a, t, 0), hw]);
      R.push(X.map((x, i) => vadd(vadd(c, vmul(b2, x * hw)), vmul(nrm, Z[i] * th + (i > 0 && i < 8 ? fold * 0.6 * (1 - Math.abs(x)) : 0)))));
    }
    add('gun', M.wrap, loft(R, { crease: 50 }));
  }
  // tie-off at the pommel end: both strands end on the -w flat under a flattened knot, two short tails tucked under the
  // ferrule
  {
    const a = -Math.PI / 2, tk = t1 + 3.4, n = nrmAt(a), e1 = [0, 1, 0], e2 = vcross(n, e1), c = onSkin(a, tk, 1.35), rings = [];
    for (let i = 0; i < 16; i++) {
      const th = i / 16 * TAU, rr = 2.5 * (1 + 0.12 * Math.cos(2 * th)), cc = vadd(c, vadd(vmul(e1, Math.cos(th) * rr * 0.8), vmul(e2, Math.sin(th) * rr * 1.15)));
      const rd = vnorm(vadd(vmul(e1, Math.cos(th) * 0.8), vmul(e2, Math.sin(th) * 1.15)));
      rings.push(Array.from({ length: 6 }, (_, j) => { const ph = j / 6 * TAU; return vadd(cc, vadd(vmul(rd, Math.cos(ph) * 1.05), vmul(n, Math.sin(ph) * 0.75))); }));
    }
    add('gun', M.wrap, loft(rings, { wrap: true, crease: 60 }));
    for (const sd of [-1, 1]) add('gun', M.wrap, ttube([onSkin(a + sd * 0.12, tk - 1.6, 1.2), onSkin(a + sd * 0.2, tk - 3.4, 0.9), onSkin(a + sd * 0.24, t1 - 2.6, 0.5)], 1.0, 0.8, { radial: 6, seg: 6 }));
  }
  // ---- hishigami: a folded paper triangle in the acute corner of every crossing, both sides (the strands' edges meet
  // there; the triangle's sides tuck under them)
  const HG = [];   // [u, t] triangles for the nodule cull
  {
    const P = [];
    // strand +1's two edges as (u, t) polylines on the skin (the offset is across the strand, mostly along t, so an edge
    // crosses a given t somewhere else than its centre line does)
    const EDGE = { 1: [], [-1]: [] }, L1 = CL[1];
    for (let i = 0; i < L1.length; i++) {
      const A = L1[Math.max(0, i - 1)], B = L1[Math.min(L1.length - 1, i + 1)], c = L1[i], a = Math.atan2(c[2] / G.b, c[0] / G.a);
      const bn = vnorm(vcross(nrmAt(a), vnorm(vsub(B, A))));
      for (const side of [1, -1]) { const q = vadd(c, vmul(bn, side * c[3])); EDGE[side].push([uOfA(Math.atan2(q[2] / G.b, q[0] / G.a)), q[1]]); }
    }
    const edgeU = (t, side) => {     // u where strand +1's edge `side` crosses t
      const E = EDGE[side];
      for (let i = 0; i + 1 < E.length; i++) {
        const [ua, ta] = E[i], [ub, tb] = E[i + 1];
        if ((ta - t) * (tb - t) > 0 || ta === tb) continue;
        return ua + wrapU(ub - ua) * (t - ta) / (tb - ta);
      }
      return null;
    };
    for (let k = 0; ; k++) {
      const tc = t0 - (0.25 + 0.5 * k) * pitch;
      if (tc < t1 + 4) break;
      const ac = k % 2 ? -Math.PI / 2 : Math.PI / 2, uc = uOfA(ac);
      for (const sg of [1, -1]) {
        let tip = null;
        for (const side of [1, -1]) { const u = edgeU(tc, side); if (u != null && sg * wrapU(u - uc) > 0) tip = uc + wrapU(u - uc); }
        if (tip == null) continue;
        // walk 4 mm out along the strand's edge (the other side mirrors in t): the edge's slope from two nearby samples
        let best = null;
        for (const side of [1, -1]) for (const dt of [1.6, -1.6]) { const u = edgeU(tc + dt, side); if (u == null) continue; const du = wrapU(u - tip); if (Math.abs(du) < 8 && sg * du > 0 && (!best || Math.abs(du) > Math.abs(best[0]))) best = [du, dt]; }
        if (!best) continue;
        const L = 5.0 / Math.hypot(best[0], best[1]), du = best[0] * L, dt = Math.abs(best[1]) * L;
        const tri = [[tip - sg * 1.0, tc], [tip + du + sg * 0.3, tc + dt + 0.6], [tip + du + sg * 0.3, tc - dt - 0.6]];
        HG.push(tri);
        // a thin plate (0.22) on the skin, its top split in four so it follows the curve
        const pt = ([u, t], z) => onSkin(aOfU(u), t, z), mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        const [A, B, C] = tri, ab = mid(A, B), bc = mid(B, C), ca = mid(C, A), top = [[A, ab, ca], [ab, B, bc], [ca, bc, C], [ab, bc, ca]];
        const push = (...V) => { for (const v of V) P.push(v); };
        for (const [p, q, r] of top) push(pt(p, 0.24), pt(q, 0.24), pt(r, 0.24));
        for (const [p, q] of [[A, ab], [ab, B], [B, bc], [bc, C], [C, ca], [ca, A]]) push(pt(p, -0.1), pt(q, -0.1), pt(q, 0.24), pt(p, -0.1), pt(q, 0.24), pt(p, 0.24));
      }
    }
    if (P.length) {
      const flat = [], I = [];
      for (const p of P) { I.push(flat.length / 3); flat.push(...p); }
      add('gun', M.paper, mesh(flat, I, { crease: 40, closed: false }));
    }
  }
  const inTri = (u, t, [A, B, C], m) => {
    const s = (p, q) => ((q[0] - p[0]) * (t - p[1]) - (q[1] - p[1]) * (u - p[0])) / Math.hypot(q[0] - p[0], q[1] - p[1]);
    const d1 = s(A, B), d2 = s(B, C), d3 = s(C, A);
    return (d1 >= -m && d2 >= -m && d3 >= -m) || (d1 <= m && d2 <= m && d3 <= m);
  };

  // ---- 目釘 peg through the grip (rosette washers, domed caps)
  const PEG = -48;
  for (const sd of [1, -1]) {
    const p = surf(sd * Math.PI / 2, PEG, 1.1);
    const ros = []; for (let i = 0; i < 40; i++) { const b = i / 40 * TAU, r = 3.1 + 0.4 * Math.cos(6 * b); ros.push([Math.cos(b) * r, Math.sin(b) * r]); }
    add('gun', M.gold, mapTris(fanT(ros, -0.4, 0.55, { b: 0.25, step: 1, rings: 1 }), (u, v, z) => [p[0] + u, PEG + v, p[2] + sd * z], 45));
    add('gun', M.gold, domeAt([p[0], PEG, p[2] + sd * 0.5], [0, 0, sd], 1.7, 1.2, 12));
  }

  // ---- ray skin (samegawa) in every window: a big 親粒 king nodule at each window centre on the edge / spine sides, a
  // row of large nodules down the middle of each flat, and a jittered field of small ones (0.4-0.85 mm, ~1.7 mm apart)
  // over everything the wrap leaves bare; a nodule may tuck a little under a strand's edge (hides its lip)
  const D = new Domes(), placed = [];
  const clear = (p, a, t, r, slack = 0) => {
    if (t > G.t0 - 1.6 || t < G.t1 + 1.4) return false;
    for (const h of [1, -1]) for (const q of CL[h]) {
      if (Math.abs(q[1] - t) > 6.5) continue;
      if (Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < q[3] - 0.15 + 0.15 * r - slack) return false;
    }
    if (menAt(a, t) > 0 || menAt(a, t + r + 0.4) > 0 || menAt(a, t - r - 0.4) > 0) return false;
    for (const sd of [1, -1]) { const q = surf(sd * Math.PI / 2, PEG, 0); if (Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < 3.7 + r) return false; }
    const u = uOfA(a);
    for (const tri of HG) if (inTri(tri[0][0] + wrapU(u - tri[0][0]), t, tri, r + 0.15)) return false;
    return true;
  };
  const free = (p, r) => placed.every(([q, rq]) => Math.abs(q[1] - p[1]) > rq + r + 0.12 || Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) > rq + r + 0.12);   // (kings and rows only: the lattice spaces the field)
  // king nodules (edge / spine sides) and the flats' rows
  for (let n = 0; n < 14; n++) {
    const t = t0 - (0.25 + n * 0.5) * pitch;
    if (t < t1 + 6) break;
    for (const a of [0, Math.PI]) { const p = onSkin(a, t); D.add(p, nrmAt(a), 2.3, 1.0, 16, { mid: true }); placed.push([p, 2.3]); }
  }
  for (const sd of [1, -1]) for (let t = t0 - 1.5; t > t1 + 1.5; t -= 3.1) {
    if (hash(t * 0.91 + sd * 3) < 0.2) continue;
    const a = sd * Math.PI / 2 + (hash(t * 1.7 + sd) - 0.5) * 0.1, r = 0.85 + 0.42 * hash(t * 0.37 + sd), p = onSkin(a, t);
    if (!clear(p, a, t, r, 0.2) || !free(p, r)) continue;
    D.add(p, nrmAt(a), r, 0.42 + 0.18 * r, 10, { mid: true }); placed.push([p, r]);
  }
  // the field: hex rows round the oval, jittered
  const SP = 1.85, DT = SP * 0.866;
  let row = 0;
  for (let t = t0 + 0.5; t > t1 - 0.5; t -= DT, row++) {
    const k = kOf(t), n = Math.round(PER * k / SP);
    for (let i = 0; i < n; i++) {
      const j = row * 977 + i, u = (i + 0.5 * (row % 2) + 0.36 * (hash(j * 1.13) - 0.5)) / n * PER, tt = t + 0.32 * DT * (hash(j * 2.71) - 0.5);
      const r = 0.4 + 0.45 * Math.pow(hash(j * 0.731), 1.6), a = aOfU(u), p = onSkin(a, tt);
      if (!clear(p, a, tt, r) || !free(p, r)) continue;
      D.add(p, nrmAt(a), r, 0.15 + 0.42 * r, r < 0.6 ? 4 : 5, { tilt: 55 });
    }
  }
  add('gun', M.skin, D.geo());
}

// ======================================================================================================= ring + tassel
function ringPommel(add) {
  const { t: rt, R, rr, rw } = RING;
  // section: a rounded-flat superellipse, radial rr (r) x across rw (w): |r/rr|^(2/.55) + |w/rw|^(2/.32) = 1
  const rOfW = (w) => rr * Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(w) / rw), 2 / 0.32)), 0.55 / 2);
  const wOfR = (r) => rw * Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(r) / rr), 2 / 0.55)), 0.32 / 2);
  const faceW = (v) => wOfR(v);
  // section loop sampled where the zoning changes: the outer rim (w -5.45..5.45), the +w face, the inner rim, the -w face
  const SEC = [];
  for (const w of [-5.45, -5.0, -4.45, -3.2, -1.3, -0.65, 0, 0.65, 1.3, 3.2, 4.45, 5.0, 5.45]) SEC.push([rOfW(w), w]);
  for (const r of [2.75, 1.6, 0, -1.6, -2.75]) SEC.push([r, wOfR(r)]);
  for (const w of [5.45, 4.2, 1.8, 0, -1.8, -4.2, -5.45]) SEC.push([-rOfW(w), w]);
  for (const r of [-2.75, -1.6, 0, 1.6, 2.75]) SEC.push([r, -wOfR(r)]);
  const NS = SEC.length, NA = 80;
  const at = (a, [r, w]) => [Math.cos(a) * (R + r), rt + Math.sin(a) * (R + r), w];
  // zoning: the faces blackened bronze; the outer rim gold at its edges and a centre rib, the two fret grounds between
  // them bronze (the gold key-frets stand on them); the inner rim gold
  const zone = (r, w) => (Math.abs(w) > 5.25 ? M.bronze : r < 0 ? M.gold : Math.abs(w) < 1.3 || Math.abs(w) > 4.45 ? M.gold : M.bronze);
  {
    const out = {};
    for (let i = 0; i < NA; i++) for (let j = 0; j < NS; j++) {
      const a0 = i / NA * TAU, a1 = (i + 1) / NA * TAU, p = SEC[j], q = SEC[(j + 1) % NS];
      const tri = [[at(a0, p), at(a1, p), at(a0, q)], [at(a0, q), at(a1, p), at(a1, q)]], m = zone((p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
      const c = [Math.cos((a0 + a1) / 2) * R, rt + Math.sin((a0 + a1) / 2) * R, 0];
      for (const T of tri) {
        const n = vcross(vsub(T[1], T[0]), vsub(T[2], T[0])), g = vmul(vadd(vadd(T[0], T[1]), T[2]), 1 / 3), o = (out[m] ||= []);
        if (n[0] * (g[0] - c[0]) + n[1] * (g[1] - c[1]) + n[2] * (g[2] - c[2]) < 0) o.push(T[0], T[2], T[1]); else o.push(...T);
      }
    }
    for (const [mat, T] of Object.entries(out)) { const P = [], I = []; T.forEach((p, k) => { P.push(...p); I.push(k); }); add('gun', mat, mesh(P, I, { crease: 45, closed: false })); }
  }
  // everything below runs round the ring clear of the clasp (the top, a 73..107 deg)
  const A0 = Math.PI / 2 + 0.38, A1 = Math.PI / 2 - 0.38 + TAU;
  // ---- outer rim: a 回紋 key-fret (hooked square wave) in gold on each bronze ground, a bead rib down the middle
  {
    const Ro = R + rr, L = Ro * (A1 - A0), units = Math.round(L / 3.05), Pm = L / units, T = [];
    for (const sd of [1, -1]) {
      const Hm = 2.75, vc = 2.875, pts = [];
      for (let k = 0; k < units; k++) { const x = k * Pm; pts.push([x, vc - Hm / 2], [x, vc + Hm / 2], [x + 0.6 * Pm, vc + Hm / 2], [x + 0.6 * Pm, vc - Hm / 2 + 1.05], [x + 0.3 * Pm, vc - Hm / 2 + 1.05], [x + 0.3 * Pm, vc - Hm / 2]); }
      pts.push([L, vc - Hm / 2]);
      T.push(...roofT(sd > 0 ? pts : pts.map(([x, y]) => [x, -y]), 0.42, -0.06, 0.34, { step: 9 }));
    }
    add('gun', M.gold, mapTris(T, (u, v, z) => { const a = A0 + u / Ro, rad = R + rOfW(v) + z; return [Math.cos(a) * rad, rt + Math.sin(a) * rad, v]; }, 50));
    const B = new Domes(), n = Math.round(L / 1.08);
    for (let i = 0; i <= n; i++) { const a = A0 + i / n * (A1 - A0), c = Math.cos(a), s = Math.sin(a); B.add([c * (R + rr), rt + s * (R + rr), 0], [c, s, 0], 0.52, 0.44, 7, { tilt: 60 }); }
    // the inner rim: a finer bead line
    const ni = Math.round((R - rr) * (A1 - A0) / 0.95);
    for (let i = 0; i <= ni; i++) { const a = A0 + i / ni * (A1 - A0), c = Math.cos(a), s = Math.sin(a); B.add([c * (R - rr), rt + s * (R - rr), 0], [-c, -s, 0], 0.4, 0.32, 6); }
    // ---- both faces: granulation round the outer edge, a wire round the inner one, between them a 雲雷紋 band
    // (square spirals of alternating hand) cast in gold on the bronze
    const L2 = R * (A1 - A0);
    for (const sd of [1, -1]) {
      const map = (u, v, z) => { const a = A0 + u / R; return [Math.cos(a) * (R + v), rt + Math.sin(a) * (R + v), sd * (faceW(v) + z)]; };
      const ng = Math.round((R + 2.85) * (A1 - A0) / 1.0);
      for (let i = 0; i <= ng; i++) { const a = A0 + i / ng * (A1 - A0), r0 = R + 2.85; B.add([Math.cos(a) * r0, rt + Math.sin(a) * r0, sd * (faceW(2.85) - 0.08)], [0, 0, sd], 0.42, 0.34, 6); }
      const F = [...roofT([[0, -2.75], [L2, -2.75]].map(([u, v]) => [u, v]), 0.5, -0.06, 0.3, { step: 3 })];
      const H = 4.3, lw = 0.42, p = 0.84, cells = Math.round(L2 / H), cw = L2 / cells, Ls = Math.min(cw, H) - lw - 0.4;
      for (let k = 0; k < cells; k++) {
        const cu = cw * (k + 0.5), mir = k % 2 ? -1 : 1;
        const sp = sqSpiral(Ls, p).slice(0, 7).map(([x, y]) => [cu + mir * (x - Ls / 2), -0.2 + (y - Ls / 2)]);
        F.push(...roofT(sp, lw, -0.06, 0.32, { step: 9 }));
      }
      add('gun', M.gold, mapTris(F, map, 50));
    }
    add('gun', M.gold, B.geo());
  }
  // the clasp: a red-gold collar round the top of the ring with bead rims, where the neck holds it
  {
    const sect = (th) => { const se = (c, e) => Math.sign(c) * Math.pow(Math.abs(c), e); return [rr * se(Math.cos(th), 0.55), rw * se(Math.sin(th), 0.32)]; };
    const Rc = [];
    for (const [a, g] of [[73, 0.5], [73.6, 1.4], [75, 1.9], [77, 1.6], [80, 1.3], [90, 1.25], [100, 1.3], [103, 1.6], [105, 1.9], [106.4, 1.4], [107, 0.5]]) {
      const aa = a * D2R, r = [];
      for (let j = 0; j < 24; j++) { const th = j / 24 * TAU, [x, w] = sect(th), m = Math.hypot(x, w) || 1; r.push([Math.cos(aa) * (R + x + x / m * g), rt + Math.sin(aa) * (R + x + x / m * g), w + w / m * g]); }
      Rc.push(r);
    }
    add('gun', M.gold, loft(Rc, { crease: 45 }));
  }
  // the neck from the ferrule down into the clasp: a waisted collar, two bead lines
  add('gun', M.gold, revT([[0, KASH[0] + 0.4], [11.2, KASH[0] + 0.4], [11.6, KASH[0] - 1.4], [9.2, KASH[0] - 3.6], [8.4, KASH[0] - 6], [9.6, KASH[0] - 8.6], [9.0, rt + R + 2.2], [0, rt + R + 2.2]], { seg: 32, ks: 1.0, kw: 0.88 }));
  add('gun', M.gold, beadRing(KASH[0] - 1.2, 0, 11.7, 10.3, 0.55, 22));
}

function tassel(add) {
  const { t: rt, R, rr } = RING, rb = rt - R - rr, TB = rb - 4.5;
  // a gold loop through a lug under the ring, the cord, a cap, a cinnabar lacquer bead, a cap, 26 silk strands
  add('fx_tassel', M.gold, wireLoop(arcP(0, rb - 2.4, 2.6, 0, 359, 18).slice(0, -1).map(([s, t]) => [s, t, 0]), 0.8, 6));
  add('fx_tassel', M.silk, ttube([[-1.6, rb - 4, 0], [-2.2, TB - 3, 0], [0, TB - 5.5, 0], [2.2, TB - 3, 0], [1.6, rb - 4, 0]], 1.0, 1.0, { radial: 6, seg: 20 }));
  add('fx_tassel', M.gold, revT([[0, TB - 4.5], [2.4, TB - 4.5], [3.4, TB - 7], [4.0, TB - 10], [0, TB - 10]], { seg: 20 }));
  const bead = [];
  for (let i = 0; i <= 12; i++) { const u = i / 12, a = Math.PI * u; bead.push([Math.sin(a) * 5.6 + 0.3, TB - 10 - u * 11]); }
  {
    const g = new THREE.LatheGeometry(bead.slice().reverse().map(([r, tt]) => new THREE.Vector2(Math.max(0, r), tt)), 24);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 - 0.07 * Math.pow(Math.abs(Math.cos(a * 4)), 3); p.setX(i, x * k); p.setZ(i, z * k); }
    for (const key of Object.keys(g.attributes)) if (key !== 'position') g.deleteAttribute(key);
    add('fx_tassel', M.black, outwardT(g.toNonIndexed(), 70));
  }
  add('fx_tassel', M.gold, revT([[0, TB - 20.5], [4.0, TB - 20.5], [3.0, TB - 23.5], [2.0, TB - 26], [0, TB - 26]], { seg: 20 }));
  const strands = [];
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * TAU + hash(i) * 0.3, r0 = 1.3 + hash(i + 9) * 0.5, L = 46 + hash(i + 3) * 12, r1 = 2.6 + hash(i + 5) * 2.2, sw = (hash(i + 7) - 0.5) * 2;
    strands.push(ttube([[Math.cos(a) * r0, TB - 25.5, Math.sin(a) * r0], [Math.cos(a) * (r0 + 1.3), TB - 25.5 - L * 0.4, Math.sin(a) * (r0 + 1.3)], [Math.cos(a) * r1 + sw, TB - 25.5 - L, Math.sin(a) * r1]], 0.4, 0.25, { radial: 4, seg: 6, caps: false }));
  }
  add('fx_tassel', M.silk, merge(strands));
}

// ======================================================================================================= the 睚眥 head
// Two heightfield solids symmetric about the blade plane (w = +-h(x, y)), head-local x = s, y = t - RING.t; the head
// sits in the ring facing the edge side (+s), its neck rooted in the ring's spine side.
const SKULL_CP = [
  [15.2, 7.6], [12.6, 9.9], [7.6, 10.2], [2.2, 13.0], [-4.6, 14.2], [-11.6, 12.9], [-16.8, 11.6], [-22.6, 10.6],
  [-23.6, 0.5], [-22.8, -9.6],
  [-14.2, -10.6], [-8.2, -7.6], [-4.4, -3.6],
  [-1.6, -0.6], [3.8, 0.7], [9.0, 1.1], [13.6, 1.7],
  [16.1, 3.2], [16.6, 5.6],
];
const skTag = (i) => (i <= 6 ? 'top' : i <= 9 ? 'ring' : i <= 11 ? 'throat' : i <= 12 ? 'cheek' : i <= 16 ? 'lip' : 'snout');
const JAW_CP = [
  [-1.2, -2.0], [-6.4, -2.6], [-8.6, -5.6], [-6.2, -8.6], [0, -10.1], [7.2, -10.6], [13.4, -9.0], [15.0, -5.9],
  [13.1, -4.3], [9.0, -3.7], [4.0, -2.9],
];
const jwTag = (i) => (i >= 7 || i === 0 ? 'lip' : 'jaw');
const HL = 3.1;                                   // lip half thickness
const EYE = [3.4, 6.6];                           // eye centre (head-local)
const NOS = [13.4, 7.4];
const HINGE = [-5.6, -3.4];

const HEAD = (() => {
  const near = (I, tag, x, y, m) => I.near(x, y, m, (g) => g === tag)?.d ?? m;
  const SO = tagged(SKULL_CP, skTag, 0.6), SI = new SegIndex(SO.lines, 2.5);
  const HmX = curveFn([[-25, 6.1], [-14, 6.5], [-4, 6.9], [3, 6.6], [9, 5.3], [14, 4.3], [17.5, 3.5]]);
  const almond = crv([[7.2, 7.4], [5.0, 8.9], [1.6, 8.8], [-0.6, 7.2], [0.2, 5.2], [3.0, 4.4], [6.0, 5.4]], 0.4).pts;
  const AL = new SegIndex([{ pts: almond, closed: true, tag: 'a' }], 1.5);
  // flame brow: an arch over the eye, three tongues licking back off it over the crown
  const browP = crv([[8.6, 8.8], [6.2, 10.8], [2.6, 11.6], [-1.4, 10.8], [-4.0, 9.0]], 0.4, false).pts;
  const flames = [crv([[-1.6, 11.6], [-5.6, 12.4], [-9.6, 11.2], [-11.4, 9.4]], 0.4, false).pts, crv([[-2.4, 9.4], [-6.4, 9.6], [-10.2, 7.8], [-11.8, 5.6]], 0.4, false).pts,
    crv([[-3.4, 7.4], [-7.0, 6.6], [-10.0, 4.0], [-10.6, 1.8]], 0.4, false).pts];
  const BR = new SegIndex([{ pts: browP, tag: 'b' }], 1.5), FL = new SegIndex(flames.map((p) => ({ pts: p, tag: 'f' })), 1.5);
  // the snarl: transverse wrinkles over the bridge
  const wr = [crv([[8.0, 10.4], [8.8, 8.4], [9.8, 7.2]], 0.3, false).pts, crv([[9.8, 10.2], [10.5, 8.6], [11.4, 7.8]], 0.3, false).pts, crv([[6.2, 10.6], [6.6, 9.2]], 0.3, false).pts];
  const WR = new SegIndex(wr.map((p) => ({ pts: p, tag: 'w' })), 1.5);
  const nostril = crv([[14.8, 8.6], [13.2, 8.8], [12.4, 7.6], [13.0, 6.4], [12.2, 5.6], [12.8, 5.3], [14.2, 6.4], [15.0, 7.4]], 0.25).pts;
  const NP = new SegIndex([{ pts: nostril, closed: true, tag: 'n' }], 1.5);
  const lipGroove = crv([[-0.6, 1.3], [3.8, 1.9], [8.8, 2.4], [13.2, 3.1], [15.2, 4.4], [14.8, 5.6]], 0.35, false).pts;
  const LG = new SegIndex([{ pts: lipGroove, tag: 'l' }], 1.5);
  const spiral = (c, r0, r1, a0, turns, dir = 1, n = 50) => { const o = []; for (let i = 0; i <= n; i++) { const u = i / n, a = (a0 + dir * u * turns * 360) * D2R, r = lerp(r0, r1, u); o.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]); } return o; };
  const cheekScroll = spiral(HINGE, 4.2, 1.4, 110, 1.3, -1);
  const CS = new SegIndex([{ pts: cheekScroll, tag: 'c' }], 1.5);
  const cheekHair = [[[-2.2, 4.4], [-6.2, 3.2], [-10.4, 1.0], [-13.4, -2.2]], [[-1.8, 2.0], [-5.2, 0.4], [-9.4, -2.6], [-11.6, -5.6]], [[-6.4, 6.0], [-10.8, 5.2], [-14.6, 3.4]]].map((c) => crv(c, 0.4, false).pts);
  const CH = new SegIndex(cheekHair.map((p) => ({ pts: p, tag: 'h' })), 1.5);
  function skBase(x, y) {
    const dT = near(SI, 'top', x, y, 8), dN = near(SI, 'snout', x, y, 5), dTh = near(SI, 'throat', x, y, 6), dC = near(SI, 'cheek', x, y, 4), dL = near(SI, 'lip', x, y, 4), dR = near(SI, 'ring', x, y, 3);
    const Hm = HmX(x) + 1.0 * bump(x, y, -2, 2, 7, 6) + 0.8 * bump(x, y, 12.5, 7.5, 4.5, 3.5);
    let h = Hm * fe(dT, 5.5) * fe(dN, 3.2) * fe(dTh, 4.5) * fe(dC, 2.4) * fe(dR, 0.8);
    if (dL < 2.6) h = lerp(HL, h, fe(dL, 2.6));
    return { h, dE: Math.min(dT, dN, dTh, dC) };
  }
  function skFeat(x, y) {
    let z = 0;
    // the almond socket sinks to a floor; rolled lids round it (the upper one heavy, hooded)
    if (Math.abs(x - EYE[0]) < 9 && Math.abs(y - EYE[1]) < 7) {
      const sd = AL.sd(x, y, 3);
      if (sd > 0) z -= 2.1 * sstep(0, 1.1, sd);
      z += (y > EYE[1] ? 1.1 : 0.7) * halfRound(Math.abs(sd + 0.6), 1.0);
    }
    // flame brow + tongues
    if (y > 6 && x < 10) { const b = BR.near(x, y, 2.6); if (b) { const u = b.u / b.len; z += (0.9 + 1.6 * Math.pow(Math.sin(Math.PI * u), 0.6)) * (1 - sstep(1.3, 2.6, b.d)); } }
    if (x < 0 && y > 0) { const f = FL.near(x, y, 1.2); if (f) z += 1.0 * (1 - 0.5 * f.u / f.len) * halfRound(f.d, 1.1); }
    // the snarl wrinkles, the nose bulb, the drilled nostril with a flared rim
    { const w = WR.near(x, y, 0.9); if (w) z += 0.75 * halfRound(w.d, 0.8); }
    if (x > 10) {
      z += 1.2 * bump(x, y, NOS[0], NOS[1], 3.6, 3.2);
      const nd = NP.sd(x, y, 2.5);
      z += 1.1 * halfRound(Math.abs(nd + 0.7), 0.9);
      if (nd > 0) z -= 2.6 * sstep(0, 0.7, nd);
    }
    // lip groove, cheek scroll round the hinge, carved hair over the cheek
    { const l = LG.near(x, y, 0.7); if (l) z -= 0.55 * halfRound(l.d, 0.55); }
    { const c = CS.near(x, y, 0.9); if (c) z += 0.7 * halfRound(c.d, 0.8); }
    if (x < -1 && x > -16) { const c = CH.near(x, y, 1.1); if (c) { const u = c.u / c.len; z += 0.85 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.1)), 0.5) * halfRound(c.d, 1.0); } }
    return z;
  }
  const skull = (x, y) => { const b = skBase(x, y); return Math.max(0, b.h + skFeat(x, y) * sstep(0, 1.6, b.dE)); };

  // ---- lower jaw
  const JO = tagged(JAW_CP, jwTag, 0.6), JI = new SegIndex(JO.lines, 2.5);
  const HmJ = curveFn([[-9, 5.0], [0, 5.2], [8, 4.6], [15, 3.6]]);
  const jawGroove = crv([[0.2, -3.6], [4.2, -3.9], [8.8, -4.7], [12.6, -5.4], [13.8, -6.6]], 0.35, false).pts;
  const jawLine = crv([[14.0, -8.4], [9.6, -9.4], [4.0, -9.3], [-2.2, -8.4]], 0.35, false).pts;
  const JG = new SegIndex([{ pts: jawGroove, tag: 'g' }], 1.5), JL = new SegIndex([{ pts: jawLine, tag: 'j' }], 1.5);
  function jwBase(x, y) {
    const dJ = near(JI, 'jaw', x, y, 6), dL = near(JI, 'lip', x, y, 4);
    let h = (HmJ(x) + 0.7 * bump(x, y, 11, -7.4, 4, 3)) * fe(dJ, 4.0);
    if (dL < 2.4) h = lerp(HL - 0.3, h, fe(dL, 2.4));
    return { h, dE: dJ };
  }
  function jwFeat(x, y) {
    let z = 0;
    const g = JG.near(x, y, 0.7); if (g) z -= 0.55 * halfRound(g.d, 0.55);
    const j = JL.near(x, y, 1.1); if (j) z += 0.7 * halfRound(j.d, 1.0);
    return z;
  }
  const jaw = (x, y) => { const b = jwBase(x, y); return Math.max(0, b.h + jwFeat(x, y) * sstep(0, 1.4, b.dE)); };
  const RI = new SegIndex([{ pts: SO.loop, closed: true, tag: 'o' }], 2);
  return { SO, SI, JO, JI, skull, jaw, skBase, AL, almond, lipGroove, jawGroove, near, inSk: (x, y) => RI.inside(x, y) };
})();

function head(add) {
  const both = (role, part, geo) => { add(part, role, geo); add(part, role, mirror(geo)); };
  const { skull, jaw, SI, JI, near } = HEAD;
  const map = (x, y, z) => [x, y + HEAD_T, z];
  const onSk = onField(skull), onJw = onField(jaw);
  const solid = (O, h, I, part) => {
    const F = hfFace([{ pts: O.loop, tag: 'o' }], h, { map, tol: 0.035, minCell: 0.32, maxCell: 3.2, edge: 0.55, walls: true, eps: 0.3, decimate: { error: 0.16, normals: 0.22, ao: 0.6, lattice: 4 } });
    both(M.bronze, part, F.face);
    const W = splitTris(F.walls, (s, t) => (near(I, 'lip', s, t - HEAD_T, 2) < 0.9 ? 'mouth' : 'metal'));
    for (const [k, g] of Object.entries(W)) add(part, k === 'mouth' ? M.mouth : M.bronze, g);
  };
  solid(HEAD.SO, skull, SI, 'fx_head');
  solid(HEAD.JO, jaw, JI, 'fx_jaw');
  // cast scales over the neck down to the ring (free edges towards the ring)
  {
    const T = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
      const x = -13.5 - r * 2.0, y = 6.5 - c * 3.6 - (r % 2) * 1.8;
      if (!HEAD.inSk(x, y) || near(SI, 'top', x, y, 6) < 2.4 || near(SI, 'throat', x, y, 6) < 2.2 || near(SI, 'ring', x, y, 6) < 1.2) continue;
      if (Math.hypot(x - HINGE[0], y - HINGE[1]) < 6) continue;
      T.push(...scaleT(3.0, 3.2, (a, b) => [x - a, y + b], { lift: 0.32, th: 0.25, rim: 0.22, keel: 0.1, sink: 0.05 }));
    }
    both(M.bronze, 'fx_head', mapTris(T, (u, v, z) => onSk(u, v, z), 50));
  }
  // gold lip cords in the grooves (upper, lower)
  const cord = (path, on, part, r = 0.36) => {
    const P = path.filter((_, i) => i % 2 === 0).map(([x, y]) => on(x, y, -0.12));
    both(M.gold, part, ttube(P, (u) => r * Math.min(1, u * 10, (1 - u) * 12 + 0.3), null, { radial: 5, seg: Math.max(10, P.length) }));
  };
  cord(HEAD.lipGroove, onSk, 'fx_head');
  cord(HEAD.jawGroove, onJw, 'fx_jaw', 0.32);
  // hinge pin: a rosette washer and a domed head
  {
    const w0 = skull(HINGE[0], HINGE[1]), ros = [];
    for (let i = 0; i < 30; i++) { const a = i / 30 * TAU, r = 1.9 + 0.25 * Math.cos(8 * a); ros.push([Math.cos(a) * r, Math.sin(a) * r]); }
    both(M.gold, 'fx_head', mapTris(fanT(ros, -0.2, 0.45, { b: 0.18, step: 0.8, rings: 1 }), (u, v, z) => [HINGE[0] + u, HEAD_T + HINGE[1] + v, w0 + z], 45));
    both(M.gold, 'fx_head', domeAt([HINGE[0], HEAD_T + HINGE[1], w0 + 0.4], [0, 0, 1], 1.0, 0.7, 10));
  }
  // teeth along both lips, fangs at the front
  {
    const lipLine = (O, tag) => O.lines.find((l) => l.tag === tag).pts;
    const teeth = (pts, part, dir, x0, x1, every, L, r) => {
      let acc = 0;
      for (let i = 1; i < pts.length - 1; i++) {
        const [x, y] = pts[i]; acc += Math.hypot(x - pts[i - 1][0], y - pts[i - 1][1]);
        if (x < x0 || x > x1 || acc < every) continue;
        acc = 0;
        const tg = vnorm([pts[i + 1][0] - pts[i - 1][0], pts[i + 1][1] - pts[i - 1][1], 0]), nrm = [tg[1] * dir, -tg[0] * dir, 0], k = 0.75 + 0.5 * hash(x * 3.1);
        both(M.bone, part, tooth([x - nrm[0] * 0.5, y + HEAD_T - nrm[1] * 0.5, HL - 0.55], vnorm([nrm[0], nrm[1], -0.08]), [0, -1, 0], L * k, r * (0.85 + 0.25 * k), { radial: 6, seg: 4 }));
      }
    };
    const up = lipLine(HEAD.SO, 'lip'), lo = lipLine(HEAD.JO, 'lip');
    teeth(up, 'fx_head', 1, 1.5, 12.6, 2.0, 1.6, 0.55);
    teeth(lo, 'fx_jaw', 1, 1.5, 11.4, 2.0, 1.4, 0.5);
    both(M.bone, 'fx_head', tooth([13.6, 2.0 + HEAD_T, HL - 0.4], vnorm([0.1, -1, -0.05]), [-1, 0, 0], 4.8, 0.95, { radial: 8, seg: 6, groove: 0.25 }));
    both(M.bone, 'fx_head', tooth([4.6, 0.9 + HEAD_T, HL - 0.4], vnorm([0, -1, -0.05]), [-1, 0, 0], 2.8, 0.7, { radial: 8, seg: 5, groove: 0.2 }));
    both(M.bone, 'fx_jaw', tooth([11.8, -3.9 + HEAD_T, HL - 0.6], vnorm([-0.1, 1, -0.05]), [-1, 0, 0], 3.8, 0.85, { radial: 8, seg: 5, groove: 0.25 }));
  }
  // horns: gold antlers off the crown swept back over the occiput and fused into the ring's inner face, a tine each
  for (const sd of [1, -1]) {
    const r0 = [-2.4, 12.6 + HEAD_T, sd * 3.6];
    const pts = [r0, [-6.8, 15.2 + HEAD_T, sd * 4.4], [-11.6, 17.0 + HEAD_T, sd * 4.9], [-16.0, 16.4 + HEAD_T, sd * 5.0], [-19.4, 14.4 + HEAD_T, sd * 4.9]];
    add('fx_head', M.gold, ftube(pts, (u) => lerp(2.5, 1.3, Math.pow(u, 0.8)) * (1 + 0.1 * Math.pow(Math.cos(u * 40), 8)), { radial: 10, seg: 30, flutes: 3, depth: 0.14, oval: 0.85 }));
    add('fx_head', M.gold, ftube([[-8.6, 15.9 + HEAD_T, sd * 4.6], [-9.6, 18.4 + HEAD_T, sd * 5.4], [-8.4, 19.6 + HEAD_T, sd * 5.8]], (u) => lerp(1.1, 0.3, u), { radial: 6, seg: 8 }));
  }
  // flame mane: fluted tongues off the neck sweeping back along the ring's inner face, the tips curling
  {
    const fins = [[-15.4, 9.0, 8.4, -0.55, 0.15, 2.4], [-17.2, 3.6, 9.6, -0.35, -0.55, 2.6], [-16.6, -2.6, 9.0, -0.2, -0.85, 2.5], [-15.0, -7.6, 7.8, 0.25, -0.95, 2.2]];
    for (const [x, y, L, dx, dy, Wd] of fins) {
      const w0 = skull(x + 1.2, y) - 0.9;
      const b = [x, y + HEAD_T, w0], D = vnorm([dx, dy, 0.16]), Rd = vnorm([0, 0, 1]), Sd = vnorm(vcross(D, Rd));
      both(M.bronze, 'fx_head', petal(b, D, Rd, Sd, L, Wd, 1.0, { bulge: 1.2, flick: L * 0.22, nu: 9, na: 8, groove: 0.3 }));
    }
  }
  // gold whiskers: from the snout boss back under the eye, out past the cheek, curling
  {
    const pts = [onSk(10.6, 3.4, 0.6), onSk(7.6, 3.2, 0.8), onSk(3.6, 3.0, 0.9), onSk(-0.4, 2.2, 1.0), [-4.4, 1.0 + HEAD_T, 7.2], [-8.6, -1.6 + HEAD_T, 7.6], [-11.4, -5.2 + HEAD_T, 7.4], [-10.6, -7.6 + HEAD_T, 7.1], [-9.0, -6.6 + HEAD_T, 7.0]];
    both(M.gold, 'fx_head', ttube(pts, (u) => lerp(0.62, 0.22, Math.pow(u, 0.8)), null, { radial: 5, seg: 34 }));
  }
  // flame beard under the chin (jaw)
  for (const [x, y, L, k] of [[12.6, -9.2, 4.6, -0.35], [9.4, -10.2, 5.2, -0.15], [6.0, -10.3, 4.4, 0.0]]) {
    const b = [x, y + HEAD_T, 1.4], D = vnorm([k - 0.55, -1, 0.15]), Rd = vnorm([0, 0, 1]), Sd = vnorm(vcross(D, Rd));
    both(M.bronze, 'fx_jaw', petal(b, D, Rd, Sd, L, 1.5, 0.8, { bulge: 0.9, flick: 1.4, nu: 7, na: 6, groove: 0.3 }));
  }
  // the ruby eyes (fx_eyes): faceted cabochons in the sockets (a hair proud of the lids' floor)
  {
    const floor = HEAD.skBase(EYE[0], EYE[1]).h - 2.1;
    const A = vnorm([1, 0.22, 0]), B = vnorm(vcross([0, 0, 1], A));
    for (const sd of [1, -1]) add('fx_eyes', M.eye, facetGem([EYE[0], EYE[1] + HEAD_T, sd * (floor + 0.2)], A, B, [0, 0, sd], 3.4, 1.85, 1.45, 14));
  }
}

// ======================================================================================================= the scabbard
// sayaAt(t): centre s, half axes (s, w) of the oval section; the body follows the blade's curve
function sayaAt(t) {
  const tt = Math.min(t, T_YOKO - 4), b = bladeAt(tt);
  let cs = (b.sb + b.se) / 2, hs = b.W / 2 + 4.2, hw = b.h + 3.4;
  if (t > T_YOKO - 4) {                       // past the point's shoulder: the body continues on the curve, a little slimmer
    const v = clamp01((t - (T_YOKO - 4)) / (SAYA.t1 - (T_YOKO - 4)));
    cs += curveS(Math.min(t, T_TIP)) - curveS(tt) + 0.6 * v; hs *= 1 - 0.08 * v; hw *= 1 - 0.06 * v;
  }
  return { cs, hs, hw };
}
const SE_S = 0.82;                             // section superellipse exponent (a soft oval, a little flattened)
const sOval = (a, k) => Math.sign(k) * Math.pow(Math.abs(k), SE_S);
function sayaPt(t, a, grow = 0) { const { cs, hs, hw } = sayaAt(t); return [cs + (hs + grow) * sOval(a, Math.cos(a)), t, (hw + grow) * sOval(a, Math.sin(a))]; }
/** a point on the +w face (sd) of the scabbard at t, lateral offset v (s from the centre), lifted z along w */
function sayaFace(t, v, z, sd) { const { cs, hs, hw } = sayaAt(t); const c = Math.pow(clamp01(Math.abs(v) / hs), 1 / SE_S); return [cs + v, t, sd * (hw * Math.pow(Math.max(0, 1 - c * c), SE_S / 2) + z)]; }

function scabbard(add) {
  const NA = 32;
  const sayaN = (t, a) => { const { cs } = sayaAt(t), p = sayaPt(t, a); return surfN((aa, tt) => sayaPt(tt, aa), a, t, [p[0] - cs, 0, p[2]]); };
  // ---- the body: cinnabar lacquer, black lacquer bands (zoned), from the mouth fitting on under the chape (both ends
  // pinned: the lacquer runs into the chape, no gap). Rings every 10 mm plus +-1.2 / 4 mm off every fitting, band and
  // cord edge, so the per-vertex AO falls off in millimetres instead of smearing 10-20 mm along the lacquer
  {
    const T = [SAYA.mouth - 1, SAYA.kojiri - 0.5, SAYA.kojiri + 1];
    for (let t = SAYA.mouth - 1; t <= SAYA.kojiri + 1; t += 10) T.push(t);
    const edges = [SAYA.mouth + 0.6, ...BANDS.flat(), ...SUSP.flatMap((tb) => [tb - 6.2, tb + 6.2]), CORD.t0 - 1.2, CORD.t0 + CORD.turns * CORD.pitch + 1.2, SAYA.kojiri - 0.5];
    for (const e of edges) for (const d of [-4, -1.2, 1.2, 4]) T.push(e + d);
    for (const b of BANDS) T.push(b[0], b[0] + 0.01, b[1] - 0.01, b[1]);
    const TS = [...new Set(T.filter((t) => t >= SAYA.mouth - 1 && t <= SAYA.kojiri + 1).map((t) => Math.round(t * 100) / 100))].sort((a, b) => a - b);
    const rings = TS.map((t) => Array.from({ length: NA }, (_, i) => sayaPt(t, i / NA * TAU)));
    const geos = zonedLoft(rings, (k) => { const t = (TS[k] + TS[k + 1]) / 2; return BANDS.some(([a, b]) => t > a && t < b) ? M.black : M.lacquer; }, { capA: true, capB: true, crease: 50 });
    for (const [m, g] of Object.entries(geos)) add('L', m, g);
    // gold bead wires at the band edges
    for (const [a, b] of BANDS) for (const t of [a, b]) add('L', M.gold, wireLoop(Array.from({ length: 36 }, (_, i) => sayaPt(t, i / 36 * TAU, 0.25)), 0.42, 4));
  }
  // ---- 鯉口 mouth fitting (bronze): outer oval + 0.9, a chamfer onto the front face, the blade slot 12 mm deep
  {
    const { W, h } = bladeAt(0), slot = (t, k = 0) => Array.from({ length: NA }, (_, i) => { const a = i / NA * TAU; return [W / 2 * 0 + (W / 2 + 0.9 - k) * Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), 0.7), t, (h + 0.65 - k * 0.3) * Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), 1.4)]; });
    const R = [
      Array.from({ length: NA }, (_, i) => sayaPt(SAYA.mouth + 0.6, i / NA * TAU, 0.9)),
      Array.from({ length: NA }, (_, i) => sayaPt(3.2, i / NA * TAU, 0.9)),
      Array.from({ length: NA }, (_, i) => sayaPt(1.6, i / NA * TAU, 1.35)),
      Array.from({ length: NA }, (_, i) => sayaPt(0.5, i / NA * TAU, 1.0)),
      Array.from({ length: NA }, (_, i) => sayaPt(0, i / NA * TAU, 0.2)),
      slot(0), slot(12),
    ];
    // the slot is centred on the blade's centre at t 0 (s 0); the oval on the scabbard's centre (the same at t 0)
    add('L', M.fit, loft(R, { capA: true, capB: true, crease: 40 }));
    add('L', M.gold, wireLoop(Array.from({ length: 36 }, (_, i) => sayaPt(SAYA.mouth - 1.2, i / 36 * TAU, 1.2)), 0.55, 4));
    add('L', M.gold, wireLoop(Array.from({ length: 36 }, (_, i) => sayaPt(1.9, i / 36 * TAU, 1.42)), 0.5, 4));
    // cloud scrolls cast on the fitting's faces
    for (const sd of [1, -1]) for (const dx of [-1, 1]) add('L', M.fit, mapTris(curlW(dx * 8, 0, 2.6, dx, dx > 0 ? 200 : -20, 0.45, 0.85), (u, v, z) => sayaFace(11.6 + v, u, 0.9 + z, sd), 50));
    // the lining (fx_mouth): a plug 4 mm into the slot that glows when the iai draws
    add('fx_mouth', M.glow, loft([slot(4.2, 0.18), slot(11.6, 0.18)], { capA: true, capB: true, crease: 40 }));
  }
  // ---- suspension bands (bronze) with a lug and a hanging ring on the spine side. The face is four rows (one 10 mm quad
  // row let the AO / patina of its edges wash over half of it); the gold bead wires sit on it, not sunk into it
  for (const tb of SUSP) {
    const prof = [[-6.2, 0], [-6.1, 0.72], [-5.8, 1.15], [-5.2, 1.34], [-3.4, 1.4], [-1.7, 1.43], [0, 1.44], [1.7, 1.43], [3.4, 1.4], [5.2, 1.34], [5.8, 1.15], [6.1, 0.72], [6.2, 0]];
    add('L', M.fit, loft(prof.map(([d, g]) => Array.from({ length: 40 }, (_, i) => sayaPt(tb + d, i / 40 * TAU, g))), { capA: false, capB: false, crease: 40 }));
    for (const d of [-4.4, 4.4]) add('L', M.gold, wireLoop(Array.from({ length: 48 }, (_, i) => sayaPt(tb + d, i / 48 * TAU, 1.4 + 0.33)), 0.38, 5));
    // a cast cloud scroll on each face between the wires
    for (const sd of [1, -1]) add('L', M.fit, mapTris(curlW(0, 0, 2.3, sd, sd > 0 ? 200 : -20, 0.42, 0.8, 9), (u, v, z) => sayaFace(tb + v * 0.85, u, 1.42 + z, sd), 50));
    // the lug: a cast boss on the spine side with a bar, the ring through it
    const { cs, hs } = sayaAt(tb), s0 = cs - hs - 1.0;
    add('L', M.fit, revT([[0, -4.6], [3.6, -4.6], [4.2, -3.2], [4.2, 3.2], [3.6, 4.6], [0, 4.6]].map(([r, t]) => [r, t]), { seg: 16, ks: 0.7, kw: 1.0 }).translate(0, tb, -(s0 - 2.4)));
    add('L', M.fit, wireLoop(arcP(0, 0, 6.2, 0, 359, 28).slice(0, -1).map(([x, y]) => [s0 - 6.2 + x, tb + y, 0]), 1.25, 8));
  }
  // ---- the cord (sageo): cinnabar silk wound three times round between the bands, a knot on the spine side
  {
    const P = [], { t0, turns, pitch } = CORD;
    for (let i = 0; i <= turns * 36; i++) { const u = i / 36, a = u * TAU; P.push(sayaPt(t0 + u * pitch, a, 1.1)); }
    add('L', M.silk, ttube(P, 1.05, 1.05, { radial: 6, seg: turns * 36, caps: true }));
    const { cs, hs } = sayaAt(t0 + 12);
    add('L', M.silk, ttube([[cs - hs - 0.6, t0 + 4, 0], [cs - hs - 4.2, t0 + 8, 1.6], [cs - hs - 5.0, t0 + 13, -1.2], [cs - hs - 3.6, t0 + 18, 0.6], [cs - hs - 0.8, t0 + 21, 0]], 1.3, 1.1, { radial: 6, seg: 16 }));
  }
  // ---- three rune panels on each face: black lacquer slabs in gold frames carrying six seal-script glyphs in gold leaf
  // (0.24 proud: the panel reads at rest); the strips (fx_rune1..3) float over the glyphs and light stage by stage
  RUNES.forEach(([tc, len], i) => {
    for (const sd of [1, -1]) {
      const map = (u, v, z) => sayaFace(tc + v, u, z, sd);
      const rect = (hw, hl) => { const o = []; for (let k = 0; k < 28; k++) { const a = k / 28 * TAU, se = (c, e) => Math.sign(c) * Math.pow(Math.abs(c), e); o.push([se(Math.cos(a), 0.22) * hw, se(Math.sin(a), 0.22) * hl]); } return o; };
      add('L', M.black, mapTris(fanT(rect(5.4, len / 2 + 2.4), -0.15, 0.32, { b: 0.15, step: 2.4, rings: 1 }), map, 50));
      add('L', M.gold, mapTris(wireT(rect(5.9, len / 2 + 2.9), 0.7, 0.0, 0.62, { closed: true, step: 4.5 }), map, 55));
      for (const v of [-(len / 2 + 2.9), len / 2 + 2.9]) add('L', M.gold, dome(map(0, v, 0.55), [0, 0, sd], 0.9, 0.7, 8));
      const G = [];
      for (let k = 0; k < 5; k++) G.push(...glyphT(i * 31 + k * 7 + (sd > 0 ? 0 : 101), 0, -len / 2 + 5 + k * (len - 10) / 4, 4.2, 0.26, 0.5, 0.36));
      add('L', M.leaf, mapTris(G, map, 55));
      const R = [];
      for (let v = -len / 2; v <= len / 2 + 0.01; v += 4) R.push([map(-2.45, v, 0.56), map(-2.3, v, 0.62), map(2.3, v, 0.62), map(2.45, v, 0.56)]);
      add('fx_rune' + (i + 1), M.rune, loft(R, { crease: 60 }));
    }
  });
  // ---- maki-e down the curve (both faces): a smooth gold line weaving the length, four 如意 cloud heads riding it (heads
  // to the point, streamers trailing), a scatter of gold dust; small cloud curls beside the rune panels
  for (const sd of [1, -1]) {
    const T0 = 492, L = 298, map = (u, v, z) => sayaFace(T0 + u, v, z, sd), T = [];
    const wv = []; for (let u = 0; u <= L; u += 12) wv.push([u, 3.0 * Math.sin(TAU * u / 148 + 0.5)]);
    const line = crv(wv, 3, false).pts;
    T.push(...roofT(line, (f) => 0.85 * Math.min(1, f * 10, (1 - f) * 10 + 0.12), -0.05, 0.26, { step: 3 }));
    const CL = [];
    for (let k = 0; k < 4; k++) {
      const u = 30 + k * 78, v = (k % 2 ? -1 : 1) * 6.4;
      CL.push([u, v]);
      T.push(...ruyiT(u, v, 13, -Math.PI / 2 + (k % 2 ? -0.35 : 0.35), -0.05, 0.22, { tail: 22, tailBend: k % 2 ? -1 : 1 }));
    }
    add('L', M.leaf, mapTris(T, map, 55));
    const D = new Domes();
    for (let k = 0; k < 90; k++) {
      const u = 4 + hash(k * 1.3 + sd * 50) * (L - 8), v = (hash(k * 3.7 + sd * 7) - 0.5) * 24;
      if (CL.some(([cu, cv]) => Math.hypot(u - cu, v - cv) < 9.5 || (u < cu && u > cu - 28 && Math.abs(v - cv) < 3.5))) continue;
      const r = 0.22 + 0.32 * hash(k * 5.1 + sd), p = sayaFace(T0 + u, v, 0, sd);
      D.add(p, surfN((a, b) => sayaFace(T0 + a, b, 0, sd), u, v, [0, 0, sd]), r, 0.06 + 0.05 * r, 5, { tilt: 25, sink: 0.02 });
    }
    add('L', M.leaf, D.geo());
    for (const [tc, v, d] of [[183, 6.5, 1], [262, -6.5, -1], [380, 6.5, 1], [470, -6.5, -1]]) add('L', M.leaf, mapTris(curlR(0, v, 2.4, d, d > 0 ? 160 : 20, -0.05, 0.26, 1.0), (u, vv, z) => sayaFace(tc + u, vv, z, sd), 55));
  }
  // ---- 鞘尾 chape (bronze): a gold bead rim, the body, a rounded end; a cast 如意 cloud with a streamer on each face
  {
    const R = [];
    for (const [t, g] of [[SAYA.kojiri - 0.5, 0.0], [SAYA.kojiri, 0.9], [SAYA.kojiri + 1.2, 1.25], [SAYA.kojiri + 2.2, 1.0], [SAYA.kojiri + 12, 1.0], [SAYA.kojiri + 22, 1.0], [SAYA.t1 - 10, 0.9], [SAYA.t1 - 5, 0.4], [SAYA.t1 - 2, -1.6], [SAYA.t1 - 0.4, -4.4]]) R.push(Array.from({ length: 40 }, (_, i) => sayaPt(t, i / 40 * TAU, g)));
    add('L', M.fit, loft(R, { capA: false, capB: true, crease: 40 }));
    const D = new Domes(), tB = SAYA.kojiri + 1.15;
    for (let i = 0; i < 66; i++) { const a = (i + 0.5) / 66 * TAU; D.add(sayaPt(tB, a, 1.2), sayaN(tB, a), 0.6, 0.5, 6, { mid: true }); }
    add('L', M.gold, D.geo());
    add('L', M.gold, wireLoop(Array.from({ length: 40 }, (_, i) => sayaPt(SAYA.kojiri + 2.6, i / 40 * TAU, 1.12)), 0.3, 4));
    for (const sd of [1, -1]) add('L', M.fit, mapTris(ruyiT(0, -1.5, 11, 0, -0.1, 0.75, { rim: 0.42, tail: 9 }), (u, v, z) => sayaFace(SAYA.kojiri + 16 + v, u, 1.0 + z, sd), 50));
  }
}
const BANDS = [[40, 46], [90, 95], [204, 208], [452, 456], [800, 806]];
const SUSP = [116, 296];                           // suspension bands (centre t)
const CORD = { t0: 150, turns: 3, pitch: 7.5 };
const RUNES = [[240, 48], [318, 48], [396, 48]];   // centre t, strip length (the straight part of the scabbard)

// ======================================================================================================= assembly
let LOD = false;                                  // yazi_tp: the third-person LOD drops the sub-millimetre domes
export default function build({ lod = false } = {}) {
  LOD = lod;
  const g = new Gun('yazi');
  const P = {};
  const add = (part, mat, geo) => { if (geo) ((P[part] ||= {})[mat] ||= []).push(geo); };
  // sword parts (built at w 0 -> shifted to +OFF), scabbard (L, built sheathed round the blade -> -OFF)
  const S = { add: (part, mat, geo) => add('R:' + part, mat, geo) };
  blade(S.add); habaki(S.add); guard(S.add); grip(S.add); ringPommel(S.add); tassel(S.add); head(S.add);
  scabbard((part, mat, geo) => add(part === 'L' ? 'L:gun' : 'L:' + part, mat, geo));

  const eyeW = HEAD.skBase(EYE[0], EYE[1]).h;
  const pivots = {
    'R:gun': [0, GRIP_T, 0], 'R:fx_rune': [GC, (GROOVE.t0 + GROOVE.t1) / 2, 0], 'R:fx_edge': [0, 400, 0], 'R:fx_tassel': [0, RING.t - RING.R - RING.rr - 2.4, 0],
    'R:fx_head': [-20, HEAD_T, 0], 'R:fx_jaw': [HINGE[0], HINGE[1] + HEAD_T, 0], 'R:fx_eyes': [EYE[0], EYE[1] + HEAD_T, 0],
    'L:gun': [0, SAYA_GRIP_T, 0], 'L:fx_mouth': [0, 8, 0], 'L:fx_rune1': [0, RUNES[0][0], 0], 'L:fx_rune2': [0, RUNES[1][0], 0], 'L:fx_rune3': [0, RUNES[2][0], 0],
  };
  const parents = { 'R:fx_jaw': 'R:fx_head', 'R:fx_eyes': 'R:fx_head' };
  const runeX = (t) => [0, t / 1000, -GC / 1000];   // rest-space origin of a stele strip (glyph columns stacked down +t)
  const extras = {
    'R:gun': {}, 'R:fx_edge': { energy: true, restHidden: true }, 'R:fx_tassel': { swing: 'pendulum', len: 0.045 },
    'R:fx_rune': { pv: { preset: 'pv_rune', runeAxis: 1, runeOrigin: runeX(GROOVE.t1 - 9), runeWidth: 0.0036, runeSpeed: 0.04 } },
    'R:fx_head': { open: 9, hinge: 'w' }, 'R:fx_jaw': { open: -18, hinge: 'w' }, 'R:fx_eyes': { hero: true, pv: { gem: 2.4, irid: 0.25, coreTint: '#ff2a1a' } },
    'L:gun': {}, 'L:fx_mouth': { energy: true, restHidden: true },   // lit by yazi.js through the iai only
  };
  RUNES.forEach(([tc, len], i) => { extras['L:fx_rune' + (i + 1)] = { restHidden: true, stage: i + 1, pv: { preset: 'pv_rune', runeAxis: 1, runeOrigin: [0, (tc + len / 2) / 1000, -sayaAt(tc).cs / 1000], runeWidth: 0.0049, runeSpeed: 0.08 } }; });
  const name = (k) => k.replace(':', '_');
  // parts in parent-first order
  const order = Object.keys(P).sort((a, b) => (parents[a] ? 1 : 0) - (parents[b] ? 1 : 0) || (a.endsWith(':gun') ? -1 : 0) - (b.endsWith(':gun') ? -1 : 0));
  for (const key of order) {
    const sw = key[0] === 'R' ? 1 : -1, piv = pivots[key] || [0, 0, 0], pw = [piv[0], piv[1], piv[2] + sw * OFF];
    const parent = parents[key] ? name(parents[key]) : key.endsWith(':gun') ? undefined : name(key[0] + ':gun');
    const part = g.part(name(key), { pivot: pw, parent, extras: extras[key] || {} });
    for (const [mat, list] of Object.entries(P[key])) for (const geo of list) {
      const gg = (geo.index ? geo.toNonIndexed() : geo).clone();
      gg.translate(sw * OFF, 0, 0);
      part.add(gg, mat);
    }
  }
  // sockets: grips, the blade (root, mid, edge, point / muzzle), the ring and the eye; the scabbard's mouth, end and panels
  const bm = (t) => { const b = bladeAt(t); return (b.sb + b.se) / 2; };
  g.socket('grip_r', [0, GRIP_T, OFF], { rot: [0, 0, -6] });
  g.socket('base_r', [bm(60), 60, OFF]);
  g.socket('mid_r', [bm(430), 430, OFF]);
  g.socket('fore_r', [bm(650), 650, OFF]);
  g.socket('edge_r', [bladeAt(430).se, 430, OFF]);
  g.socket('tip_r', [PNT, T_TIP, OFF]);
  g.socket('muzzle_r', [PNT, T_TIP, OFF]);
  g.socket('guard_r', [0, (TSUBA.t0 + TSUBA.t1) / 2, OFF]);
  g.socket('ring_r', [0, RING.t, OFF]);
  g.socket('eye_r', [EYE[0], EYE[1] + HEAD_T, OFF + eyeW]);
  g.socket('grip_l', [0, SAYA_GRIP_T, -OFF], { rot: [0, 0, -6] });
  g.socket('mouth_l', [0, 0, -OFF]);
  g.socket('muzzle_l', [0, 0, -OFF]);
  g.socket('end_l', [sayaAt(SAYA.t1).cs, SAYA.t1, -OFF]);
  RUNES.forEach(([tc], i) => g.socket('rune' + (i + 1) + '_l', [sayaAt(tc).cs, tc, -OFF]));
  g.meta({
    grip: 'dual', support: 'dual', reload: 'none', series: 'jiuzi',
    notes: 'M02 睚眥．裂魂 ring-pommel long sabre + lacquered scabbard. R_gun = the sabre (right hand, w +70), L_gun = the scabbard '
      + '(left hand, w -70, built round the blade: placed on the sabre it is sheathed). t = blade axis (point +t), s = edge, w = flat normal. '
      + 'weapons/premium/yazi.js poses both in camera space. R_fx_rune: pv_rune strip in the groove; R_fx_edge: crimson edge light (restHidden); '
      + 'R_fx_head: the 睚眥 head (raises about w at its neck), R_fx_jaw: lower jaw (open -18° about w at the hinge), R_fx_eyes: ruby eyes (the focus); '
      + 'R_fx_tassel: pendulum; L_fx_mouth: the mouth lining glow; L_fx_rune1..3: scabbard rune strips lit stage by stage (restHidden).',
  });
  // bake: pre-tessellated (lacquer / enamel finer, metal coarser; slivers kept whole), glows left out of the occluders,
  // then m4's post-bake (buried AO refill, per-material wear); patina in the bronze recesses; the temper line's nioi
  g.build = (o = {}) => {
    const root = Gun.prototype.build.call(g, { ...o, bake: false });
    budget(root);
    if (o.bake === false) return root;
    const meshes = [];
    root.traverse((m) => { if (m.isMesh && !/^(glow_)/.test(m.userData.mat)) meshes.push(m); });
    const tess = (o.tessellate ?? TESS) * 0.001;
    for (const m of meshes) {
      const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
      for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
      m.geometry = tessellateFat(geo, /^(lacquer|leather|silk|glaze)/.test(m.userData.mat) ? tess : tess * TESS_K, 0.0012);
    }
    if (o.tessOnly) return root;
    // low relief does not shade its neighbours (inlays, wires, maki-e on the lacquer); the bands, cord and fittings still do
    const relief = (m) => (m.userData.mat === 'bronze_aged' ? 0.0009 : /^(bronze|gold)/.test(m.userData.mat) ? 0.0007 : /^(steel|black_chrome|chrome)/.test(m.userData.mat) ? 0.0006 : /^lacquer/.test(m.userData.mat) ? 0.0006 : 0);
    bakeMeshes(meshes, { tessellate: 0, aoDist: 0.012, rays: 32, log: true, minHeight: relief });
    postBake(root, { cos: 0.99999 }, WEAR);
    root.traverse((m) => {
      const B = m.isMesh && m.geometry.attributes._bake?.array;
      if (!B) return;
      const mat = m.userData.mat, part = m.parent?.name || '', p = m.geometry.attributes.position.array;
      if (/^(bronze_aged|bronze_dark)$/.test(mat)) for (let i = 0; i < B.length; i += 4) { const ao = B[i] / 255; B[i + 2] = Math.max(B[i + 2], Math.round(255 * Math.min(0.85, 2.2 * Math.max(0, 0.92 - ao)))); }
      if (part === 'R_gun' && /^(steel|steel_bright)$/.test(mat)) {
        const piv = pivots['R:gun'];
        for (let i = 0, v = 0; i < p.length; i += 3, v++) {
          const t = p[i + 1] * 1000 + piv[1], s = piv[0] - p[i + 2] * 1000;
          if (t < HAB[1] || t > T_TIP - 4) continue;
          const b = bladeAt(t), d = Math.abs(s - temperS(t, b)), on = smooth(HAB[1], HAB[1] + 24, t);
          // nioi: a frosted fringe grading into the temper line over three vertices (cavity channel, light cavCol in the
          // def); a satin rub (wear)
          B[v * 4 + 1] = Math.max(B[v * 4 + 1], Math.round(255 * 0.5 * Math.exp(-((d / 1.1) ** 2)) * on));
          if (mat === 'steel_bright') {
            B[v * 4 + 2] = Math.max(B[v * 4 + 2], Math.round(255 * 0.85 * Math.exp(-((d / 1.9) ** 2)) * on));
            // the kissaki past the yokote: its own matt narume polish (lighter), the spine excluded
            if (t > T_YOKO + 0.3 && s > ridgeS(t, b) + 0.2) B[v * 4 + 2] = Math.max(B[v * 4 + 2], 120);
          }
        }
      }
      // ray skin: the cavities between the nodules yellowed and dark, the nodules' tops polished pale
      if (part === 'R_gun' && mat === 'leather_pebble') {
        const piv = pivots['R:gun'];
        for (let i = 0, v = 0; i < p.length; i += 3, v++) {
          const t = p[i + 1] * 1000 + piv[1], s = piv[0] - p[i + 2] * 1000, w = p[i] * 1000, k = kOf(t);
          const hgt = (Math.hypot(s / (GRIP.a * k), w / (GRIP.b * k)) - 1) * 13.5;
          B[v * 4 + 2] = Math.max(B[v * 4 + 2], Math.round(255 * 0.5 * (1 - clamp01(hgt / 0.28))));
          B[v * 4 + 1] = Math.max(B[v * 4 + 1], Math.round(255 * 0.55 * clamp01((hgt - 0.22) / 0.4)));
        }
      }
    });
    return root;
  };
  return g;
}

const TESS = 11, TESS_K = 2.2;
// The budget pass (docs/WEAPON_MODELING.md: 152k triangles before tessellation -> ~100k): QEM collapses within a fraction
// of a millimetre (absolute error, m) on the fine gold, bronze and lacquer work -- lathe and loft rings no curvature
// needs, flat runs of the fretwork, the scabbard's long lacquer spans -- with the authored normals kept (vertices welded
// on position + normal, so seams and the domes' rounded shading stay as built). The blade is left whole: its temper
// line and nioi are baked per vertex on its 5 mm rings.
await MeshoptSimplifier.ready;
const BUDGET = {
  'R_gun:gold': [0.00025, 0.45], 'R_gun:bronze_dark': [0.0003, 0.45], 'R_gun:leather_pebble': [0.0002, 0.6], 'R_gun:leather_black': [0.0002, 0.7],
  'R_fx_head:bronze_dark': [0.0002, 0.55], 'R_fx_head:gold': [0.0002, 0.6], 'R_fx_jaw:bronze_dark': [0.0002, 0.6], 'R_fx_tassel:silk_red': [0.0002, 0.5],
  'L_gun:gold': [0.0003, 0.4], 'L_gun:gold_leaf': [0.0003, 0.45], 'L_gun:lacquer_red': [0.00015, 0.3], 'L_gun:lacquer_black': [0.00015, 0.3],
  'L_gun:bronze_aged': [0.0003, 0.5], 'L_gun:silk_red': [0.0002, 0.6],
};
function budget(root) {
  const q = (v) => Math.round(v * 1e6);
  root.traverse((m) => {
    const b = m.isMesh && BUDGET[(m.parent?.name || '') + ':' + m.userData.mat];
    if (!b) return;
    const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry, p = geo.attributes.position.array, n = geo.attributes.normal?.array;
    if (!n) return;
    const map = new Map(), P = [], N = [], I = new Uint32Array(p.length / 3);
    for (let i = 0; i < I.length; i++) {
      const k = `${q(p[i * 3])},${q(p[i * 3 + 1])},${q(p[i * 3 + 2])},${Math.round(n[i * 3] * 100)},${Math.round(n[i * 3 + 1] * 100)},${Math.round(n[i * 3 + 2] * 100)}`;
      let j = map.get(k);
      if (j === undefined) { j = P.length / 3; map.set(k, j); P.push(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]); N.push(n[i * 3], n[i * 3 + 1], n[i * 3 + 2]); }
      I[i] = j;
    }
    const Pf = new Float32Array(P), Nf = new Float32Array(N);
    const [I2] = MeshoptSimplifier.simplifyWithAttributes(I, Pf, 3, Nf, 3, [0.5, 0.5, 0.5], null, Math.floor(I.length * b[1] / 3) * 3, b[0], ['ErrorAbsolute']);
    if (I2.length >= I.length * 0.97) return;
    const P2 = new Float32Array(I2.length * 3), N2 = new Float32Array(I2.length * 3);
    for (let i = 0; i < I2.length; i++) for (let c = 0; c < 3; c++) { P2[i * 3 + c] = Pf[I2[i] * 3 + c]; N2[i * 3 + c] = Nf[I2[i] * 3 + c]; }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(P2, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(N2, 3));
    m.geometry = out;
  });
}
/** per-material wear [curvature (1/m) mapped to full wear, cap] */
const WEAR = {
  '*:black_chrome': [1 / 800, 0.3], '*:chrome': [1 / 600, 0.25], '*:steel_bright': [1 / 600, 0.3], '*:steel': [1 / 700, 0.25],
  '*:bronze_dark': [1 / 380, 0.8], '*:bronze_aged': [1 / 380, 0.85], '*:gold': [1 / 420, 0.65], '*:gold_leaf': [1 / 450, 0.4],
  '*:leather_pebble': [1 / 600, 0.3], '*:leather_black': [1 / 700, 0.45], '*:silk_red': [1 / 900, 0.2], '*:bone': [1 / 700, 0.45],
  '*:lacquer_red': [1 / 900, 0.3], '*:lacquer_black': [1 / 900, 0.3], '*:crystal': [0, 0], '*:glaze_black': [0, 0],
};
