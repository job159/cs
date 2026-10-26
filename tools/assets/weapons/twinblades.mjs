// 虹霓．雙絕 Hongni Prismedge — 神兵 X06 dual sabres, docs/PREMIUM_WEAPONS.md §2.33.
// A pair of Han-style ring-pommel 環首刀 with a willow-leaf curve, each one half of the two-headed rainbow dragon of the
// oracle-bone 虹 glyph: the guard is the dragon's head swallowing the blade (吞口), the grip its silk-bound body, the ring
// pommel its curled tail. Right hand 虹 (bronze, gold, cinnabar, red silk, a warm temper line and warm light), left hand
// 霓 (aged silver, bright silver, cobalt, violet silk, a blued temper line and cool light) -- the 霓 sabre is the 虹 sabre
// mirrored across its flat with its own materials. Per sabre, from the tip down:
//   - blade (t -8 -> 660, buried in the head below t 20): one 36-point lofted section a ring every 6.5 mm: brushed spine
//     with chamfers, dark mirror flats (a faint folded-steel figure from the def), a real fuller near the spine (t 140 ->
//     470, 10 mm wide, 2 mm deep, polished chamfered walls, the energy vein (fx_vein) seated on its floor under five
//     clamp bridges on domed rivets), a 0.4 mm forging step, the ridge, the bright main bevel, a wavy temper band (刃文)
//     with a frosted nioi fringe (baked), the mirror edge grind; willow-leaf curve (26 mm to the spine), widest 62 mm at
//     t 420, a convex point with a false edge
//   - machi: the ricasso (t -8 -> 128) stands 1.6 mm proud of the edge line and 0.8 of the spine, a bevelled notch; the
//     edge grind runs out over 16 mm and the temper band fades in over 20 (yakidashi)
//   - ricasso plaque on each flat: the oracle-bone 虹 glyph inlaid in gold (虹) / silver (霓) wire on the dark ground
//     inside a raised double frame: the arched body in enamel cells, a dragon head drinking at each foot, ripples
//     under the mouths, cloud scrolls in the corners; along the lower flat a 鱗紋 frieze (scale arcs in wire, granules)
//     and a running cloud inlay (錯金 / 錯銀) with a curl on every crest
//   - 刃鎺 sleeve (t -6 -> 34): gold / silver, the ricasso section + 1.2 mm, a bevelled top and a bead line
//   - the 吞口 dragon head (t -19 -> 86, two heightfield solids through the blade, lib/hfield.mjs): the skull / upper
//     jaw over the spine, its cheeks down to the middle of the flats (heavy brow arches with flame ridges over sunken
//     almond sockets, rolled lids, amber (虹) / teal (霓) enamel eyes with a gold iris ring and a slit pupil; a gold
//     frontal shield between the horns; a blunt snout with a nose bulb, comma-shaped drilled nostrils in flared rims
//     curling into scrolls; a cut lip line with a gold cord curling up at the front; a whisker boss; carved hair over
//     the bare cheek; a round cheek plate with an incised border and a cloud scroll round the jaw's hinge pin (rosette
//     washer); cast scales over the crown, the neck, the bridge sides and down to the hinge), the hinged lower jaw
//     (fx_jaw: hinge lobe under the cheek plate, lip groove with a cord, carved hair, jawline, chin, flame beard, gold
//     barbels); the inside of the mouth cinnabar (虹) / aubergine (霓); uneven teeth and fangs biting both flats; two
//     ringed antler horns swept back over the grip with a tine; a mane of long fluted flames with enamel inlays and
//     cheek fins; gold whiskers trailing back; the faceted dragon pearl (fx_pearl, the focus) in a beaded bezel cup at
//     the jaw tip, held by four talons
//   - the neck collar: the back of the skull tapering into the gold ferrule, a row of cast scales, a bead edge
//   - grip: ivory ray skin (coarse pebble in the def) with king nodules and granule rosettes, a band of cast dragon-body
//     scales down each flat in the windows clear of the hand, a two-strand ribbed silk wrap folded at the crossings, a
//     目釘 peg with rosette washers, beaded ferrules, a 雲雷紋 collar
//   - the ring pommel (OD 60): the dragon tail curled into a D-section ring (dorsal ridge, two rows of cast scales
//     outside, ventral plates inside), its root in a beaded gold clasp, ending in a fan of fluted fins; a carved neck;
//     a silk cord and the tassel (fx_tassel: jade melon bead, metal caps, 26 strands; pendulum)
// Side view, mm: t along the sabre (tip +t), s = the edge direction, w = the flat normal. The two sabres stand side by
// side: 虹 (R_gun) at w +110, 霓 (L_gun) at w -110. The game poses each sabre itself (weapons/premium/twinblades.js).
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { Gun, V } from '../lib/gunkit.mjs';
import { bakeMeshes } from '../lib/bake.mjs';
import { postBake } from './m4.mjs';
import { SegIndex, hfFace, mirror, halfRound, bump, sstep } from '../lib/hfield.mjs';
import {
  D2R, TAU, clamp01, smooth, lerp, vadd, vsub, vmul, vnorm, vcross,
  domeAt, dome, loft, ttube, mesh, ribbonT, wireT, fanT, mapTris, thunderT, curlT, petal, tessellateFat,
  ellip, tooth, ftube, merge, curveFn, scaleT, arcP,
} from '../lib/sculpt.mjs';

// ------------------------------------------------------------------------------------------ layout (mm)
const T_IN = 20, T_ROOT = -8, T_RIC = 128, T_TIP0 = 500, T_TIP = 660, T_FALSE = 530;   // curve start, blade root (buried), ricasso end, tip zone, point, false edge
const F0 = 140, F1 = 470;                       // fuller
const MACHI = 1.6, MACHI_S = 0.8;               // the ricasso stands proud of the edge / spine line by this much
const OFF = 110;                                // each sabre's w offset in the GLB
const GRIP_T = -84;                             // palm centre on the grip
const HANDLE = { s: 2, a: 15, b: 12, t0: -32, t1: -146 };   // ray-skin core: centre s, half-axes (s, w), extent
const RING = { s: 2, t: -199.5, R: 24 };        // ring pommel centreline
const SLEEVE = [-6, 34];                        // 刃鎺 sleeve
const HINGE = [17, 17];                         // the jaw's hinge pin (s, t): fx_jaw turns about w here
const PEARL = { s: 41, t: 68.8, R: 9.5 };       // the dragon pearl (centre, radius)

const u01 = (t) => clamp01((t - T_IN) / (T_TIP - T_IN));
const sbBase = (t) => -22 - 38 * u01(t) ** 2;            // spine line (the curve bends towards the spine)
const machi = (t) => 1 - smooth(T_RIC - 0.6, T_RIC + 2.2, t);   // 1 on the ricasso, a bevelled step to 0 on the blade
const Wbody = (t) => 50 + 12 * smooth(T_RIC, 420, t) + MACHI * machi(t);
const PNT = sbBase(T_TIP) + 14;                          // the point (s)
/** blade outline and thickness at t: spine s, edge s, half thickness at the spine, ricasso-ness 0..1, false-edge grind */
function bladeAt(t) {
  const m = machi(t);
  let sb = sbBase(t) - MACHI_S * m, se = sbBase(t) + Wbody(t);
  if (t > T_TIP0) {
    const v = clamp01((t - T_TIP0) / (T_TIP - T_TIP0));
    se = PNT + (se - PNT) * Math.pow(Math.max(0, 1 - v * v), 0.55);
    sb = sb + (PNT - sb) * Math.pow(smooth(0.19, 1, v), 1.6);
  }
  const ric = 1 - smooth(T_RIC, T_RIC + 16, t);          // the unsharpened ricasso section runs out over 16 mm
  const hb = lerp(3.4, 2.4, smooth(T_RIC, T_TIP0, t)) * (t > T_TIP0 ? lerp(1, 0.25, smooth(T_TIP0, T_TIP, t)) : 1);
  const h = lerp(hb, 3.8, m);                             // the ricasso shoulder: 0.4 thicker
  const fe = smooth(T_FALSE, T_FALSE + 50, t);
  return { sb, se, W: se - sb, h, ric, fe };
}
const fullerAt = (t) => (t < F0 || t > F1 ? 0 : Math.min(smooth(F0, F0 + 14, t), 1 - smooth(F1 - 14, F1, t)));
const fullerGeo = (t) => {
  const { sb, W, h } = bladeAt(t);
  const fd = Math.min(2.0, 0.6 * h) * fullerAt(t), fw = 10 * Math.min(1, W / 30), f0 = sb + Math.min(0.9, W * 0.03) + 2.4;
  return { fd, fw, f0, fc: f0 + fw / 2, floor: h - fd - 0.12 };
};
// temper line: distance from the edge (three incommensurate waves, no term finer than the 5 mm ring spacing can follow),
// faded in over 20 mm past the ricasso (yakidashi)
const hamonOff = (t) => (7.2 + 2.0 * Math.sin(t * 0.052 + 0.7) + 1.1 * Math.sin(t * 0.17 + 1.3) + 0.6 * Math.sin(t * 0.093 + 2.1)) * smooth(T_RIC + 2, T_RIC + 24, t);
const hamonS = (t) => { const b = bladeAt(t); return b.se - hamonOff(t) * Math.min(1, b.W / 40); };

// ------------------------------------------------------------------------------------------ helpers
/** closed loft of rings (each [s,t,w] points, equal counts) split into one geometry per material class of the segment
 *  j -> j+1 round the ring; the whole surface (with fan caps) is wound outward before it is split */
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
/** revolve [[r, t] ...] about the t axis, oval ks / kw, centred on s0 */
function revT(pts, { seg = 32, ks = 1, kw = 1, s0 = 0, crease = 40 } = {}) {
  let A = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; A += p[0] * q[1] - q[0] * p[1]; }
  const P = A < 0 ? [...pts].reverse() : pts;
  const g = new THREE.LatheGeometry(P.map(([r, t]) => new THREE.Vector2(Math.max(0, r), t)), seg);
  g.scale(kw, 1, ks);
  g.translate(0, 0, -s0);
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  const ng = g.toNonIndexed();
  return outwardT(ng, crease);
}
function outwardT(geo, crease = 40) {
  const p = geo.attributes.position.array;
  let vol = 0;
  for (let i = 0; i < p.length; i += 9) vol += p[i] * (p[i + 4] * p[i + 8] - p[i + 5] * p[i + 7]) - p[i + 1] * (p[i + 3] * p[i + 8] - p[i + 5] * p[i + 6]) + p[i + 2] * (p[i + 3] * p[i + 7] - p[i + 4] * p[i + 6]);
  if (vol < 0) for (let i = 0; i < p.length; i += 9) for (let c = 0; c < 3; c++) { const t = p[i + 3 + c]; p[i + 3 + c] = p[i + 6 + c]; p[i + 6 + c] = t; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', geo.attributes.position);
  return toCreasedNormals(g, crease * D2R);
}
/** ellipsoid at c: semi-axis ra along A, rn along the normal N, rb across (B = N x A) */
const ell = (c, A, N, ra, rb, rn, seg = 14) => ellip(c, vnorm(A), vnorm(vcross(N, A)), vnorm(N), ra, rb, rn, seg);
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
/** cloud curl as a single tapered wire (cheaper than curlT): centre, radius, direction, start angle, top height, width */
function curlW(cu, cv, r0, dir, a0, z1, lw = 1.0, n = 9) {
  const ta = a0 * D2R, pts = [[cu + Math.cos(ta) * r0 + Math.sin(ta) * dir * r0 * 1.2, cv + Math.sin(ta) * r0 - Math.cos(ta) * dir * r0 * 1.2]];
  for (let i = 0; i <= n; i++) { const u = i / n, a = (a0 + dir * u * 1.3 * 360) * D2R, rr = r0 * (1 - 0.68 * u); pts.push([cu + Math.cos(a) * rr, cv + Math.sin(a) * rr]); }
  return wireT(pts, (f) => lw * (1 - 0.4 * f), -0.05, z1, { step: 1.6 });
}
/** a small geometry built in [s, t, w] = [u, z, v] (three space x = v, y = z, z = -u) as design-space triangles [u, v, z] */
function mapTrisRaw(geo) {
  const p = (geo.index ? geo.toNonIndexed() : geo).attributes.position.array, T = [];
  // (x, y, z) -> (-z, x, y) is a reflection: swap two corners to keep the faces outward
  for (let i = 0; i < p.length; i += 9) for (const k of [0, 2, 1]) T.push(-p[i + k * 3 + 2], p[i + k * 3], p[i + k * 3 + 1]);
  return T;
}
/** quarter-ellipse round-over: 0 at an outline, 1 from R inwards (vertical at the outline: a rounded edge) */
const fe = (d, R) => (d >= R ? 1 : Math.sqrt(Math.max(0, 1 - (1 - d / R) ** 2)));
/** a point on the +w face of a heightfield h (s, t) moved z along its normal */
const onField = (h, e = 0.04) => (s, t, z = 0) => {
  const w = h(s, t), hs = (h(s + e, t) - h(s - e, t)) / (2 * e), ht = (h(s, t + e) - h(s, t - e)) / (2 * e), k = 1 / Math.hypot(hs, ht, 1);
  return [s - hs * k * z, t - ht * k * z, w + k * z];
};
/** split a non-indexed geometry's triangles into groups by key(s, t) of their centroid, dropping slivers of no area */
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
/** a faceted ball (a cut crystal bead): latitude rings offset by half a step, flat facets */
function facetBall(C, R, nLon = 20, nLat = 11) {
  const P = [], I = [], pt = (lat, lon) => { P.push(C[0] + Math.sin(lat) * Math.cos(lon) * R, C[1] + Math.cos(lat) * R, C[2] + Math.sin(lat) * Math.sin(lon) * R); return P.length / 3 - 1; };
  const top = pt(0, 0), rings = [], off = (k) => (k % 2) * 0.5;
  for (let k = 1; k < nLat; k++) { const r = []; for (let i = 0; i < nLon; i++) r.push(pt(k / nLat * Math.PI * (1 + 0.04 * Math.sin(k * 1.7)), (i + off(k)) / nLon * TAU)); rings.push(r); }
  const bot = pt(Math.PI, 0), L = (i) => (i + nLon) % nLon;
  for (let i = 0; i < nLon; i++) I.push(top, rings[0][L(i + 1)], rings[0][i]);
  for (let k = 0; k + 1 < rings.length; k++) {
    const A = rings[k], B = rings[k + 1], up = off(k + 2) > off(k + 1);   // B[i] lies after A[i] (else before)
    for (let i = 0; i < nLon; i++) {
      const bm = up ? B[i] : B[L(i + 1)], bn = up ? B[L(i + 1)] : B[L(i + 2)];
      I.push(A[i], A[L(i + 1)], bm, bm, A[L(i + 1)], bn);
    }
  }
  const Z = rings.at(-1), up = off(nLat + 1) > off(nLat);
  for (let i = 0; i < nLon; i++) I.push(bot, Z[i], Z[L(i + 1)]);
  void up;
  return mesh(P, I, { crease: 1, closed: true });
}
/** a flat strap across [s0 -> s1] at t (width bw along t, thickness th), lying at w(s) on a face (sd = +-1) */
function strap(s0, s1, t, wOf, sd, bw = 3, th = 0.8, n = 6) {
  const R = [];
  for (let i = 0; i <= n; i++) {
    const s = lerp(s0, s1, i / n), w = wOf(s), c = 0.35;
    R.push([[s, t - bw / 2, sd * (w - 0.3)], [s, t - bw / 2, sd * (w + th - c)], [s, t - bw / 2 + c, sd * (w + th)], [s, t + bw / 2 - c, sd * (w + th)], [s, t + bw / 2, sd * (w + th - c)], [s, t + bw / 2, sd * (w - 0.3)]]);
  }
  return loft(R, { crease: 50 });
}

// ------------------------------------------------------------------------------------------ materials per sabre
// M: material keys of this sabre. Built at w = 0 for the right hand; the left one is mirrored.
const MATS_R = {
  metal: 'bronze_aged', trim: 'gold', hamon: 'brass', silk: 'silk_red', fin: 'lacquer_red', mouth: 'lacquer_red', eye: 'glaze_ochre', iris: 'glaze_vermilion',
  bands: ['glaze_vermilion', 'glaze_ochre', 'glaze_jade'], pearl: 'crystal', vein: 'glow_vermilion', edge: 'glow_gold', flare: 'glow_orange',
};
const MATS_L = {
  metal: 'silver_aged', trim: 'chrome', hamon: 'steel_blued', silk: 'silk_violet', fin: 'glaze_cobalt', mouth: 'glaze_aubergine', eye: 'glaze_teal', iris: 'glaze_cobalt',
  bands: ['glaze_aubergine', 'glaze_cobalt', 'glaze_teal'], pearl: 'glass', vein: 'glow_purple', edge: 'glow_ice', flare: 'glow_blue',
};
const STEEL = { spine: 'steel_bright', flat: 'black_chrome', bevel: 'steel_bright', edge: 'chrome', polish: 'steel_bright', floor: 'black_chrome' };

// ======================================================================================================= the head
// Two heightfield solids (lib/hfield.mjs) symmetric about the blade plane: w = +-h(s, t) over a side-view region,
// round-overs (quarter ellipses) at the dorsal line and the occiput, rolled lips where the mouth closes on the flats.
// Upper head: crown over the spine, cheeks down to the middle of the flats; lower jaw (fx_jaw) under the edge.
const SKULL_CP = [
  [-17, 80], [-24, 84], [-34, 85.5], [-43, 84], [-50, 78.5],
  [-50, 70], [-45.5, 61], [-47, 51], [-56, 42], [-62.5, 31], [-60, 18], [-54, 7], [-50, -2], [-45, -10], [-34, -16.5],
  [-14, -19], [6, -17.5],
  [22, -10], [29.5, 0], [31, 12], [29.5, 22], [24, 29],
  [16, 32], [10, 34.5], [3, 41], [-3, 49], [-8, 57], [-11.5, 65], [-13, 72], [-14, 77],
];
const skTag = (i) => (i <= 3 ? 'snout' : i <= 13 ? 'top' : i <= 15 ? 'rear' : i <= 20 ? 'cheek' : 'lip');
const JAW_CP = [
  [13, 34], [17, 41], [21.5, 47.5], [26, 53], [30, 57], [33, 60],
  [37, 62], [45, 62], [48.5, 58], [49.5, 49], [49, 38], [47, 26], [43.5, 14], [38, 5], [31, -1.5], [22, -3.5], [11, 3], [8.5, 17], [10, 28],
];
const jwTag = (i) => (i <= 4 ? 'lip' : 'jaw');
const HL = 6.4;                                  // lip half thickness (the sleeve is 5.0)
const EYE = [-46, 31.5];
const NOS = [-43.5, 77.5];

const HEAD = (() => {
  const near = (I, tag, s, t, m) => I.near(s, t, m, (g) => g === tag)?.d ?? m;
  // ---- upper head
  const SO = tagged(SKULL_CP, skTag, 0.9), SI = new SegIndex(SO.lines, 3);
  const HmT = curveFn([[-18, 12.5], [-6, 15], [6, 16], [20, 17.5], [32, 18], [44, 15.5], [56, 13.5], [66, 13.8], [76, 14], [86, 12]]);
  // eye socket (almond, the outer corner raised), brow, flame ridges, nostril scroll, lip groove, cheek scroll
  const almond = crv([[-39, 45], [-48, 42], [-54.5, 34], [-55, 24.5], [-52, 17.5], [-46.5, 20.5], [-39, 27], [-36.5, 37]], 0.5).pts;
  const AL = new SegIndex([{ pts: almond, closed: true, tag: 'a' }], 2);
  const browP = crv([[-52, 12], [-58.5, 19], [-61, 30], [-59.5, 41], [-53, 49], [-48, 51]], 0.6, false).pts;
  const flames = [crv([[-56.5, 18], [-56, 9], [-52.5, 0], [-46, -6], [-43, -3.5]], 0.6, false).pts, crv([[-51.5, 16], [-50, 8], [-45.5, 2], [-40, -2], [-38.5, 1]], 0.6, false).pts,
    crv([[-47, 16.5], [-44.5, 10.5], [-40, 7], [-36.5, 8.5]], 0.6, false).pts];
  const spiral = (c, r0, r1, a0, turns, dir = 1, n = 60) => { const o = []; for (let i = 0; i <= n; i++) { const u = i / n, a = (a0 + dir * u * turns * 360) * D2R, r = lerp(r0, r1, u); o.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]); } return o; };
  const nosScroll = spiral([-49, 69], 4.2, 1.2, 70, 1.25, 1);
  const lipGroove = crv([[10.5, 30.5], [5, 36.5], [-1, 43.5], [-6.5, 51.5], [-11, 59.5], [-14.5, 67], [-16.5, 73], [-19.5, 77.5], [-23, 79.5], [-24.5, 76.5], [-22, 75]], 0.6, false).pts;
  // carved hair flowing back from under the eye over the bare cheek to the cheek plate
  const cheekHair = [[[-33, 46], [-26, 39.5], [-18, 35], [-11, 32.5], [-5.5, 28], [-5.5, 24], [-8, 23]], [[-27, 53], [-19, 48], [-10.5, 43.5], [-3, 38.5], [1.5, 33.5], [1, 30], [-1.5, 30]], [[-35, 33], [-29, 27], [-22, 23.5], [-16, 23.5], [-13.5, 26]], [[-21, 60], [-14, 55], [-7, 49.5], [-1.5, 45]]]
    .map((c) => crv(c, 0.6, false).pts);
  const cheekScroll = spiral(HINGE, 10.6, 5.6, 200, 1.15, -1);
  const BR = new SegIndex([{ pts: browP, tag: 'b' }], 2), FL = new SegIndex(flames.map((p) => ({ pts: p, tag: 'f' })), 2);
  const NS = new SegIndex([{ pts: nosScroll, tag: 'n' }], 2), LG = new SegIndex([{ pts: lipGroove, tag: 'l' }], 2), CS = new SegIndex([{ pts: cheekScroll, tag: 'c' }], 2);
  const CH = new SegIndex(cheekHair.map((p) => ({ pts: p, tag: 'h' })), 2);
  const nostril = crv([[-41, 83.5], [-45, 82.5], [-46.5, 78.5], [-45.5, 74.5], [-47.5, 71.5], [-46.5, 70.5], [-43.5, 73], [-41.5, 76.5], [-39.5, 80.5]], 0.4).pts;
  const NP = new SegIndex([{ pts: nostril, closed: true, tag: 'n' }], 2);
  const bAcc = browP.map((_, i) => i / (browP.length - 1));
  function skBase(s, t) {
    const dT = near(SI, 'top', s, t, 14), dN = near(SI, 'snout', s, t, 7), dR = near(SI, 'rear', s, t, 8), dC = near(SI, 'cheek', s, t, 4), dL = near(SI, 'lip', s, t, 6);
    const Hm = HmT(t) + 3.2 * bump(s, t, 18, 12, 17, 17) + 1.8 * bump(s, t, -47, 30, 15, 14) - 1.4 * bump(s, t, -30, 50, 11, 9);
    let h = Hm * fe(dT, 13) * fe(dN, 6) * fe(dR, 7) * fe(dC, 3.2);
    if (dL < 5.5) h = lerp(HL, h, fe(dL, 5.5));
    return { h, dE: Math.min(dT, dN, dR, dC), dL };
  }
  function skFeat(s, t) {
    let z = 0;
    // cheek plate round the hinge: a raised disc, an incised border, a cloud scroll
    const dh = Math.hypot(s - HINGE[0], t - HINGE[1]);
    if (dh < 15) {
      const sd = 13.2 - dh;
      z += 1.5 * sstep(0, 1.1, sd) - 0.55 * halfRound(Math.abs(sd - 2.3), 0.6);
      const c = CS.near(s, t, 1.3); if (c && dh > 4.8) z += 1.1 * halfRound(c.d, 1.15);
    }
    // the almond socket sinks to a flat floor, rolled lids round it (the upper one heavier)
    if (Math.abs(s - EYE[0]) < 16 && Math.abs(t - EYE[1]) < 18) {
      const sd = AL.sd(s, t, 4);
      if (sd > 0) z -= 3.4 * sstep(0, 1.8, sd);
      z += (s < -45 ? 1.9 : 1.3) * halfRound(Math.abs(sd + 1.0), 1.7);
    }
    // brow arch over the eye: a flat-topped bar, crisp towards the socket; three flame ridges sweeping back
    if (s < -42 && t > 6 && t < 56) {
      const b = BR.near(s, t, 5.0);
      if (b) { const u = b.u / b.len, hb = 1.3 + 5.8 * Math.pow(Math.sin(Math.PI * u), 0.5); z += hb * (1 - sstep(2.8, 5.0, b.d)); }
    }
    if (s < -34 && t < 22) { const f = FL.near(s, t, 1.8); if (f) z += 1.5 * (1 - 0.55 * f.u / f.len) * halfRound(f.d, 1.7); }
    // nose: the bulb's wing swells round a drilled nostril, a C ridge open to the front, a scroll behind it
    if (s < -30 && t > 58) {
      z += 4.2 * bump(s, t, -43.5, 77.5, 10.5, 9.5);
      const nd = NP.sd(s, t, 4);                                       // the comma-shaped nostril (> 0 inside)
      z += 2.6 * halfRound(Math.abs(nd + 1.6), 1.9) * sstep(64, 70, t);   // flared rim round the front of the opening
      if (nd > 0) z -= 4.4 * sstep(0, 1.3, nd);
      const n = NS.near(s, t, 1.2); if (n) z += 1.1 * halfRound(n.d, 1.0);
    }
    // the lip line: a groove cut along the upper lip, curling into a scroll at the front; a whisker boss on the snout
    if (s > -32 && t > 24) { const l = LG.near(s, t, 1.1); if (l) z -= 0.9 * halfRound(l.d, 0.85); }
    z += 1.6 * bump(s, t, -20.5, 70, 4.6, 4.6);
    if (s > -42 && s < 2 && t > 20 && t < 54) { const c = CH.near(s, t, 2.0); if (c) { const u = c.u / c.len; z += 1.9 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.1)), 0.5) * halfRound(c.d, 1.9); } }
    return z;
  }
  const skull = (s, t) => { const b = skBase(s, t); return Math.max(0, b.h + skFeat(s, t) * sstep(0, 2.5, b.dE)); };

  // ---- lower jaw
  const JO = tagged(JAW_CP, jwTag, 0.9), JI = new SegIndex(JO.lines, 3);
  const HmJ = curveFn([[-12, 11], [6, 12], [24, 11.2], [44, 10.6], [60, 10], [68, 9.8]]);
  const jawGroove = crv([[16.5, 33], [20, 39.5], [24.2, 45.5], [28.5, 51], [32.6, 55.2], [35.6, 57.6], [37, 55.8], [35.8, 53.6]], 0.6, false).pts;
  const jawLine = crv([[46.8, 55], [46.8, 44], [45.2, 31], [42, 19], [37, 10]], 0.6, false).pts;
  const jawHair = [[[33, 54], [35.5, 46], [36, 37], [34, 30], [31, 28], [30, 30.5]], [[40, 55.5], [42, 45.5], [41.5, 34], [38.5, 22], [34, 14.5], [31.5, 16]]]
    .map((c) => crv(c, 0.6, false).pts);
  const JG = new SegIndex([{ pts: jawGroove, tag: 'g' }], 2), JL = new SegIndex([{ pts: jawLine, tag: 'j' }], 2), JH = new SegIndex(jawHair.map((p) => ({ pts: p, tag: 'h' })), 2);
  function jwBase(s, t) {
    const dJ = near(JI, 'jaw', s, t, 8), dL = near(JI, 'lip', s, t, 6);
    let h = (HmJ(t) + 1.6 * bump(s, t, 44, 52, 7, 8)) * fe(dJ, 7.5);
    if (dL < 5) h = lerp(HL, h, fe(dL, 5));
    return { h, dE: dJ };
  }
  function jwFeat(s, t) {
    let z = 0;
    const g = JG.near(s, t, 1.1); if (g) z -= 0.9 * halfRound(g.d, 0.85);
    const j = JL.near(s, t, 1.8); if (j) z += 1.2 * halfRound(j.d, 1.7);
    const hh = JH.near(s, t, 1.8); if (hh) { const u = hh.u / hh.len; z += 1.4 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15)), 0.5) * halfRound(hh.d, 1.6); }
    return z;
  }
  const jaw = (s, t) => { const b = jwBase(s, t); return Math.max(0, b.h + jwFeat(s, t) * sstep(0, 2.5, b.dE)); };

  // ---- the top of the skull: s on the dorsal surface at (t, w) (the face where h = |w|, near the dorsal line)
  const RI = new SegIndex([{ pts: SO.loop, closed: true, tag: 'o' }], 3);
  const sTopCache = new Map();
  const sTop = (t) => {
    const k = Math.round(t * 20);
    if (sTopCache.has(k)) return sTopCache.get(k);
    let s = -95; while (s < 0 && !RI.inside(s, t)) s += 0.5;
    let a = s - 0.5, b = s; for (let i = 0; i < 20; i++) { const m = (a + b) / 2; if (RI.inside(m, t)) b = m; else a = m; }
    sTopCache.set(k, b); return b;
  };
  const topS = (t, w) => { let a = sTop(t), b = a + 13; const W = Math.abs(w); for (let i = 0; i < 26; i++) { const m = (a + b) / 2; if (skull(m, t) < W) a = m; else b = m; } return (a + b) / 2; };
  const JRI = new SegIndex([{ pts: JO.loop, closed: true, tag: 'o' }], 3);
  return { SO, SI, JO, JI, skull, jaw, skBase, topS, AL, almond, lipGroove, jawGroove, near, inSk: (s, t) => RI.inside(s, t), inJw: (s, t) => JRI.inside(s, t) };
})();

/** the head's geometry once (both sabres share it): { role: { part: [geo] } } with roles metal / trim / mouth / ... */
let HEAD_GEO = null;
const DEC = { error: 0.28, normals: 0.22, lattice: 8 };   // QEM decimation of the head solids (mm; analytic normals kept; 0.42 left facets in the polished metal)
function headGeo() {
  if (HEAD_GEO) return HEAD_GEO;
  const G = {};
  const add = (role, part, geo) => { if (geo) ((G[role] ||= {})[part] ||= []).push(geo); };
  const both = (role, part, geo) => { add(role, part, geo); add(role, part, mirror(geo)); };   // +w and its mirror

  const { skull, jaw, SI, JI, near } = HEAD;
  const onSk = onField(skull), onJw = onField(jaw);

  // ---- the two solids: faces + walls (the mouth inside: the lip walls)
  const solid = (O, h, I, part) => {
    const F = hfFace([{ pts: O.loop, tag: 'o' }], h, { tol: 0.05, minCell: 0.5, maxCell: 6, edge: 0.9, walls: true, eps: 0.45, decimate: { error: DEC.error, normals: DEC.normals, ao: 0.6, lattice: DEC.lattice } });
    both('metal', part, F.face);
    const W = splitTris(F.walls, (s, t) => (near(I, 'lip', s, t, 3) < 1.2 ? 'mouth' : 'metal'));
    for (const [k, g] of Object.entries(W)) add(k, part, g);
    return F;
  };
  solid(HEAD.SO, skull, SI, 'gun');
  solid(HEAD.JO, jaw, JI, 'fx_jaw');

  // ---- cast scales: staggered rows, free edges towards the neck (-t); skipped on the features and the round-overs
  const SC = { lift: 0.55, th: 0.4, rim: 0.4, keel: 0.16, sink: 0.06 };
  const scaleField = (h, on, ok, rows, part, role = 'metal') => {
    const T = [];
    for (const [s0, t0, L, Wd] of rows) { if (!ok(s0, t0)) continue; T.push(...scaleT(L, Wd, (a, b) => [t0 - a, s0 + b], SC)); }
    both(role, part, mapTris(T, (u, v, z) => on(v, u, z), 50));
  };
  {
    const rows = [];
    for (let r = 0; r < 12; r++) for (let c = 0; c < 10; c++) {
      const s0 = -54 + r * 4.6, t0 = 22 - c * 5.2 - (r % 2) * 2.6, k = lerp(1.1, 0.9, r / 11);
      rows.push([s0, t0, 6.0 * k, 5.6 * k]);
    }
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) rows.push([-44 + r * 4.2, 66 - c * 4.8 - (r % 2) * 2.4, 5.2, 4.8]);   // bridge sides
    scaleField(skull, onSk, (s, t) => {
      if (!HEAD.inSk(s, t)) return false;
      if (near(SI, 'top', s, t, 9) < 4.2 || near(SI, 'snout', s, t, 9) < 5 || near(SI, 'rear', s, t, 9) < 4.5 || near(SI, 'cheek', s, t, 9) < 3.5 || near(SI, 'lip', s, t, 9) < 7) return false;
      if (Math.hypot(s - HINGE[0], t - HINGE[1]) < 15.2) return false;                  // cheek plate
      if (HEAD.AL.sd(s, t, 8) > -4.2) return false;                                     // eye + lids
      if (t > 13 && t < 50 && s < -48) return false;                                    // brow
      if (t > 38 && (Math.hypot(s - NOS[0], t - NOS[1]) < 13 || t > 68)) return false;  // nose
      if (t > 44 && s > -24) return false;                                              // lip band
      if (t > 14 && t < 46 && s > -40) return false;                                    // the face: carved hair, no scales
      return true;
    }, rows, 'gun');
  }
  // ---- eyes: amber (虹) / teal (霓) enamel under the lids, a gold iris ring, a black slit pupil
  {
    const sd = 1, base = HEAD.skBase(EYE[0], EYE[1]).h - 3.4, A = vnorm([-0.35, 1, 0]);
    const c = [EYE[0] + 0.2, EYE[1] + 0.6, base + 0.9];
    both('eye', 'gun', ell(c, A, [0, 0, sd], 11.2, 6.6, 5.0, 18));
    const eyeH = (s, t) => { const x = ((s - c[0]) * A[1] - (t - c[1]) * A[0]) / 6.6, y = ((s - c[0]) * A[0] + (t - c[1]) * A[1]) / 11.2; return c[2] + 5.0 * Math.sqrt(Math.max(0, 1 - x * x - y * y)); };
    const on = onField(eyeH);
    both('trim', 'gun', mapTris(ribbonT(arcP(0, 0, 3.6, 0, 350, 32).map(([x, y]) => [x * 0.85, y * 1.3]), 0.65, -0.05, 0.22, { closed: true, step: 0.9, b: 0.12 }), (u, v, z) => on(c[0] + u, c[1] + v, z), 60));
    both('obsidian', 'gun', mapTris(ribbonT([[0, -3.2], [0, 3.2]], (f) => 1.3 * Math.sin(Math.PI * Math.max(0.08, Math.min(0.92, f))), -0.05, 0.12, { step: 0.5, b: 0.05 }), (u, v, z) => on(c[0] + u, c[1] + v, z), 60));   // slit pupil
    both('iris', 'gun', mapTris(fanT(arcP(0, 0, 3.35, 0, 360, 28).map(([x, y]) => [x * 0.85, y * 1.3]), -0.05, 0.09, { b: 0.06, step: 0.7, rings: 1 }), (u, v, z) => on(c[0] + u, c[1] + v, z), 60));
    // lids: rolls along the almond, the upper one (spine side, -s) heavy and hooded over the top of the eye
    const lid = (pts, r, lift) => both('metal', 'gun', ttube(pts.map(([s, t]) => { const o = [s - c[0], t - c[1]], l = Math.hypot(...o) || 1; return onSk(s + o[0] / l * 0.6, t + o[1] / l * 0.6, lift); }),
      (u) => r * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, u))), 0.45) + 0.15, null, { radial: 8, seg: 30 }));
    lid([[-40.5, 43.5], [-46, 42.5], [-51, 39.5], [-54.6, 33.5], [-55.2, 26.5], [-53.6, 20.5], [-51.5, 17.8]], 1.7, 0.6);
    lid([[-51, 18.5], [-47.5, 20.5], [-43, 23.5], [-39.2, 27.5], [-37.3, 33]], 0.95, 0.3);
    // the cornea: a clear dome just over the enamel (a wet highlight that rolls with the view)
    both('cornea', 'gun', ell([c[0], c[1], c[2] + 0.2], A, [0, 0, sd], 11.8, 7.0, 5.8, 20));
  }
  // ---- gold cords in the lip grooves (upper and lower)
  {
    const cord = (path, on, part, r = 0.62) => {
      const P = path.filter((_, i) => i % 3 === 0).map(([s, t]) => on(s, t, -0.25));
      both('trim', part, ttube(P, (u) => r * Math.min(1, u * 10, (1 - u) * 14 + 0.3), null, { radial: 5, seg: Math.max(12, P.length) }));
    };
    cord(HEAD.lipGroove, onSk, 'gun');
    cord(HEAD.jawGroove, onJw, 'fx_jaw', 0.55);
  }
  // ---- hinge pin: a rosette washer and a domed head (the jaw turns about it)
  {
    const w0 = skull(HINGE[0], HINGE[1]);
    const ros = [];
    for (let i = 0; i < 40; i++) { const a = i / 40 * TAU, r = 4.6 + 0.55 * Math.cos(8 * a); ros.push([HINGE[0] + Math.cos(a) * r, HINGE[1] + Math.sin(a) * r]); }
    both('trim', 'gun', mapTris(fanT(ros.map(([s, t]) => [s - HINGE[0], t - HINGE[1]]), -0.3, 0.9, { b: 0.35, step: 1.6, rings: 1 }), (u, v, z) => [HINGE[0] + u, HINGE[1] + v, w0 + z], 45));
    both('trim', 'gun', domeAt([HINGE[0], HINGE[1], w0 + 0.8], [0, 0, 1], 2.5, 1.6, 14));
  }
  // ---- teeth along both lips, fangs at the front, biting the flats from both sides
  {
    const lipLine = (O, tag) => O.lines.find((l) => l.tag === tag).pts;
    const teeth = (pts, part, dir, t0, t1, every, L, r) => {
      let acc = 0;
      for (let i = 1; i < pts.length - 1; i++) {
        const [s, t] = pts[i]; acc += Math.hypot(s - pts[i - 1][0], t - pts[i - 1][1]);
        if (t < t0 || t > t1 || acc < every) continue;
        acc = 0;
        const tg = vnorm([pts[i + 1][0] - pts[i - 1][0], pts[i + 1][1] - pts[i - 1][1], 0]), nrm = [tg[1] * dir, -tg[0] * dir, 0], k = 0.75 + 0.55 * hash(t * 3.1);
        both('bone', part, tooth([s - nrm[0] * 0.9, t - nrm[1] * 0.9, HL - 0.9], vnorm([nrm[0], nrm[1], -0.08]), [0, -1, 0], L * k, r * (0.85 + 0.25 * k), { radial: 6, seg: 4 }));
      }
    };
    const up = lipLine(HEAD.SO, 'lip'), lo = lipLine(HEAD.JO, 'lip');
    teeth(up, 'gun', 1, 36, 70, 6.6, 4.6, 1.25);
    teeth(lo, 'fx_jaw', -1, 38, 54, 6.4, 4.0, 1.15);
    // the fangs: upper pair hooking down over the blade at the front, lower pair rising at the jaw tip
    both('bone', 'gun', tooth([-14.8, 74, HL - 0.6], vnorm([1, -0.12, -0.06]), [0, -1, 0], 11, 2.0, { radial: 8, seg: 6, groove: 0.25 }));
    both('bone', 'gun', tooth([0.3, 43.5, HL - 0.6], vnorm([1, -0.2, -0.06]), [0, -1, 0], 7, 1.5, { radial: 8, seg: 5, groove: 0.2 }));
    both('bone', 'fx_jaw', tooth([29.5, 55, HL - 0.6], vnorm([-1, 0.3, -0.06]), [0, 1, 0], 9, 1.8, { radial: 8, seg: 5, groove: 0.25 }));
  }
  // ---- frontal shield (gold) on the dorsal line between the brows, three granules down its keel; crown scales behind
  {
    const { topS } = HEAD;
    const map = (x, y, z) => [topS(y, x) - z, y, x];
    const sh = crv([[0, 52], [5.5, 45], [9, 33], [9.2, 21], [6.8, 11], [3, 6.5], [0, 8.5], [-3, 6.5], [-6.8, 11], [-9.2, 21], [-9, 33], [-5.5, 45]], 0.8).pts;
    const SH = new SegIndex([{ pts: sh, closed: true, tag: 's' }], 2);
    const hS = (x, y) => { const d = SH.sd(x, y, 3); return d <= 0 ? 0 : 0.9 * sstep(0, 0.9, d) + 0.7 * halfRound(Math.abs(x), 1.6) * sstep(0, 3, d) - 0.35 * halfRound(Math.abs(d - 1.8), 0.4); };
    const F = hfFace([{ pts: sh, tag: 's' }], (x, y) => 0.06 + hS(x, y), { map, walls: false, tol: 0.05, minCell: 0.55, maxCell: 4, edge: 1.0, decimate: { error: 0.08, normals: 0.3 } });
    add('trim', 'gun', F.face);
    for (const t of [16, 27, 38]) add('trim', 'gun', dome(map(0, t, 1.45), [-1, 0, 0], 1.1, 0.9, 8));
    const T = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const x = -9 + c * 6 + (r % 2) * 3, y = 4 - r * 4.8;
      if (Math.abs(x) > 10.5) continue;
      T.push(...scaleT(5.2, 5.4, (a, b) => [x + b, y - a], SC));
    }
    add('metal', 'gun', mapTris(T, map, 50));
  }
  // ---- horns: fluted, swept far back over the grip, gold tips, a tine curling up off each, a bead ring at the root
  {
    const { topS } = HEAD;
    for (const sd of [1, -1]) {
      const r0 = [topS(4, 9) + 2.5, 4, sd * 9];
      // an S-swept antler: back and up off the crown, along the grip, the tip flicking up; a tine curling forward
      const pts = [r0, [r0[0] - 9, -6, sd * 12.5], [r0[0] - 19, -19, sd * 16], [r0[0] - 25, -34, sd * 18.5], [r0[0] - 26, -48, sd * 20], [r0[0] - 32, -58, sd * 20.5]];
      add('metal', 'gun', ftube(pts, (u) => lerp(6.8, 1.9, Math.pow(u, 0.8)) * (1 + 0.08 * Math.pow(Math.cos(u * 52), 8)), { radial: 12, seg: 38, flutes: 4, depth: 0.14, oval: 0.85 }));
      add('trim', 'gun', ftube([pts[4], vadd(pts[5], [-0.3, -0.2, 0]), [r0[0] - 38, -60, sd * 20.2]], (u) => lerp(2.4, 0.5, u), { radial: 8, seg: 10 }));
      const tb = [r0[0] - 17, -16, sd * 15.5];
      add('metal', 'gun', ftube([tb, [r0[0] - 27, -15, sd * 18], [r0[0] - 34, -8, sd * 19.5], [r0[0] - 36, 0, sd * 20]], (u) => lerp(3.4, 1.0, u), { radial: 8, seg: 16, flutes: 3, depth: 0.1 }));
      add('trim', 'gun', ftube([[r0[0] - 35.7, -1.5, sd * 19.9], [r0[0] - 36.2, 3.5, sd * 20.1]], (u) => lerp(1.3, 0.35, u), { radial: 6, seg: 5 }));
      const g = beadRing(0, 0, 6.8, 6.8, 0.75, 14);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), V(...vnorm(vsub(pts[1], pts[0]))));
      g.applyQuaternion(q); const C = V(...vadd(r0, vmul(vnorm(vsub(pts[1], pts[0])), 2.2))); g.translate(C.x, C.y, C.z);
      add('trim', 'gun', g);
    }
  }
  // ---- mane: long fluted flames flowing back off the occiput, curling out at the ends; cheek fins flaring back off the
  // rim of the cheek plate; enamel inlays
  {
    const fins = [[-44, -7, 46, -0.65, 0.36, 7.0], [-31, -14, 58, -0.38, 0.42, 7.4], [-17, -17.5, 50, -0.12, 0.5, 6.8], [-3, -17, 40, 0.1, 0.58, 6.2],
      [21, -6, 30, 0.5, 0.95, 5.6], [27, 4, 26, 0.65, 1.1, 5.2]];
    for (const [s, t, L, bs, out, Wd] of fins) {
      const w0 = skull(s + 2, t + 4) - 1.5;
      const b = [s, t, w0], D = vnorm([bs, -1, out]), Rd = vnorm([0, 0.35, 1]), Sd = vnorm(vcross(D, Rd));
      both('metal', 'gun', petal(b, D, Rd, Sd, L, Wd, 1.9, { bulge: 3.8, flick: L * 0.26, nu: 11, na: 8, groove: 0.3 }));
      both('fin', 'gun', petal(vadd(b, vmul(Rd, 1.2)), D, Rd, Sd, L * 0.74, Wd * 0.58, 0.75, { bulge: 4.1, flick: L * 0.22, nu: 9, na: 6 }));
    }
  }
  // ---- whiskers: from the snout boss back under the eye, out past the cheek, curling at the end
  {
    // (hugging the face over the first half, then trailing free behind the cheek over the mane)
    const pts = [onSk(-20.5, 70, 1.2), onSk(-18, 61, 1.6), onSk(-15.5, 52, 1.8), onSk(-14, 43, 2.0), [-13, 33, 23], [-12, 21, 26], [-14, 7, 28.5], [-19, -8, 30], [-25, -20, 30.5], [-31, -26, 29.5], [-33.5, -21.5, 29], [-30.5, -19.5, 29]];
    both('trim', 'gun', ttube(pts, (u) => lerp(1.4, 0.4, Math.pow(u, 0.8)), null, { radial: 6, seg: 46 }));
  }
  // ---- the lower jaw: flame beard under the chin, sweeping back
  {
    const beard = [[50, 52, 22, 0.25], [51, 42, 26, 0.35], [50, 31, 20, 0.45], [47.5, 20, 15, 0.55]];
    for (const [s, t, L, k] of beard) {
      const b = [s - 1.5, t, 3.2], D = vnorm([k, -1, 0.32]), Rd = vnorm([1, 0.15, 0.15]), Sd = vnorm(vcross(D, Rd));
      both('metal', 'fx_jaw', petal(b, D, Rd, Sd, L, 3.8, 1.4, { bulge: 2.8, flick: 4, nu: 9, na: 6, groove: 0.3 }));
    }
    for (const sd of [1, -1]) add('trim', 'fx_jaw', ttube([[48.5, 58, sd * 4], [53.5, 52, sd * 6.5], [55, 44, sd * 7.5], [52.5, 38, sd * 7]], (u) => lerp(1.1, 0.4, u), null, { radial: 6, seg: 16 }));
  }
  // ---- the pearl's seat at the jaw tip: a beaded bezel cup, four talons gripping the stone
  {
    const { s: ps, t: pt, R } = PEARL;
    add('trim', 'fx_jaw', revT([[0, -11.9], [6.8, -11.9], [8.9, -10.4], [9.9, -7.9], [10.1, -6.0], [9.4, -4.7], [8.3, -4.8], [7.7, -5.8], [0, -5.8]].map(([r, t]) => [r, pt + t]), { seg: 32, s0: ps }));
    add('trim', 'fx_jaw', beadRing(pt - 5.0, ps, 9.85, 9.85, 0.62, 22));
    for (let k = 0; k < 4; k++) {
      const a = (k + 0.5) / 4 * TAU, dr = [Math.cos(a), 0, Math.sin(a)], P = [];
      for (const [ph, rr] of [[-42, 1.15], [-28, 1.25], [-10, 1.2], [8, 0.95], [20, 0.5], [26, 0.15]]) {
        const p = ph * D2R, r = R + rr;
        P.push([ps + dr[0] * Math.cos(p) * r, pt + Math.sin(p) * r, dr[2] * Math.cos(p) * r]);
      }
      add('trim', 'fx_jaw', ftube(P, (u) => lerp(1.45, 0.4, Math.pow(u, 1.3)) * (1 + 0.18 * Math.exp(-(((u - 0.45) / 0.08) ** 2))), { radial: 6, seg: 12 }));
    }
  }
  HEAD_GEO = G;
  return G;
}

// ======================================================================================================= one sabre
/** returns { part: { mat: [geo] } } for parts gun, fx_edge, fx_flare, fx_vein, fx_jaw, fx_pearl, fx_tassel */
function sabre(M) {
  const P = { gun: {}, fx_edge: {}, fx_flare: {}, fx_vein: {}, fx_jaw: {}, fx_pearl: {}, fx_tassel: {} };
  const add = (part, mat, geo) => { if (geo) (P[part][mat] ||= []).push(geo); };
  const roleMat = { metal: M.metal, trim: M.trim, mouth: M.mouth, fin: M.fin, eye: M.eye, iris: M.iris, bone: 'bone', obsidian: 'obsidian', cornea: 'glass_clear' };

  // ======================================================================== blade
  {
    const T = [];
    for (let t = T_ROOT; t < T_RIC - 30; t += 24) T.push(t);
    for (const d of [-28, -16, -8, -3, -0.6, 0, 0.8, 1.6, 2.2, 3.2, 5, 7.5, 10, 13, 16.5, 20.5, 25]) T.push(T_RIC + d);
    for (let t = T_RIC + 30; t < T_TIP0; t += 6.5) T.push(t);
    for (const f of [F0, F0 + 4, F0 + 9, F0 + 14, F1 - 14, F1 - 9, F1 - 4, F1]) T.push(f);
    for (let i = 0; i <= 30; i++) T.push(T_TIP0 + (T_TIP - T_TIP0) * (1 - Math.pow(1 - i / 30, 1.25)));
    const TS = [...new Set(T.map((t) => Math.round(t * 100) / 100))].sort((a, b) => a - b);
    const ring = (t) => {
      const { sb, se, W, h, ric, fe } = bladeAt(t);
      if (W < 0.08) return Array.from({ length: 36 }, () => [PNT, t, 0]);
      const { fd, fw: fw0, f0 } = fullerGeo(t), k = Math.min(1, W / 34), fw = fw0 * k;
      const hs = h * lerp(0.72, 0.06, fe);                   // spine face half height (the false edge grinds it away)
      const ch = Math.min(0.9, W * 0.03) + fe * Math.min(5, W * 0.22);   // spine chamfer grows into the false-edge bevel
      const eb = lerp(2.8 * Math.min(1, W / 20), 1.0, ric);  // edge micro bevel (the ricasso's edge is blunt)
      const sg = se - eb, wg = lerp(0.38 * Math.min(1, W / 20), h * 0.6, ric);
      const hr = lerp(h * 0.86, h * 0.985, ric), sr0 = sb + lerp(0.6, 0.84, ric) * W;
      const step = 0.42 * (1 - ric) * (1 - fe);
      const sh0 = Math.min(hamonS(t), sg - 0.3 * k);
      const fk = fd > 0.01 ? 1 : 0, wc = 0.45 * k, wall = 0.65 * fd;
      const S = [sb, sb + ch, f0, f0 + wc, f0 + wc + wall, f0 + fw / 2, f0 + fw - wc - wall, f0 + fw - wc, f0 + fw, sb + 0.36 * W, sb + 0.36 * W + 0.35 * k, sr0, sh0 - 0.9 * k, sh0, 0, 0, sg];
      S[14] = lerp(sh0, sg, 0.3); S[15] = lerp(sh0, sg, 0.65);
      for (let i = 1; i < S.length; i++) S[i] = Math.min(Math.max(S[i], S[i - 1] + 0.02 * k + 0.005), sg - (S.length - 1 - i) * 0.04 * k);
      const [, , , , , , , , , st, st2, sr, sn, sh, sh1, sh2] = S;
      const wAt = (s) => lerp(hr, wg, clamp01((s - sr) / Math.max(0.01, sg - sr)));
      const up = [
        [S[0], hs], [S[1], h], [S[2], h], [S[3], h - 0.45 * fd / 2 * fk], [S[4], h - fd], [S[5], h - fd - 0.12 * fk], [S[6], h - fd], [S[7], h - 0.45 * fd / 2 * fk], [S[8], h],
        [st, h * 0.985], [st2, h * 0.985 - step], [sr, hr], [sn, wAt(sn)], [sh, wAt(sh)], [sh1, wAt(sh1)], [sh2, wAt(sh2)], [sg, wg],
      ];
      return [[sb, t, 0], ...up.map(([s, w]) => [s, t, w]), [se, t, 0], ...up.slice().reverse().map(([s, w]) => [s, t, -w])];
    };
    // segment classes, upper half (spine -> edge), mirrored for the lower half
    const UP = ['spine', 'spine', 'flat', 'polish', 'polish', 'floor', 'floor', 'polish', 'polish', 'flat', 'flat', 'flat', 'bevel', 'bevel', 'HAMON', 'HAMON', 'HAMON', 'edge'];
    const cls = [...UP, ...UP.slice().reverse()];
    const rings = TS.map(ring);
    const geos = zonedLoft(rings, (k, j) => {
      const c = cls[j], t = TS[k];
      if ((c === 'polish' || c === 'floor') && fullerAt(t) === 0 && fullerAt(TS[k + 1]) === 0) return STEEL.flat;   // no fuller here
      if (t < T_RIC && (c === 'edge' || c === 'HAMON')) return STEEL.bevel;     // the ricasso is unsharpened
      return c === 'HAMON' ? M.hamon : STEEL[c];
    }, { capA: true, capB: false, crease: 28 });
    for (const [m, g] of Object.entries(geos)) add('gun', m, g);

    // ---- energy edge (fx_edge): a hairline band just off the cutting edge, root -> point -> back along the false edge
    const band = (off0, off1, th, tA, tB, back = false) => {
      const R = [];
      for (let t = tA; t <= tB + 0.01; t += 6) {
        const { sb, se, W } = bladeAt(Math.min(t, T_TIP - 0.5));
        const k = Math.min(1, W / 14) * smooth(tA, tA + 30, t), e = back ? sb : se, d = back ? -1 : 1;
        const a = e + d * off0 * k, b = e + d * off1 * k, hh = th * Math.max(0.3, k);
        R.push([[a, t, hh], [b, t, hh * 0.6], [b, t, -hh * 0.6], [a, t, -hh]]);
      }
      return loft(R, { crease: 60 });
    };
    add('fx_edge', M.edge, band(0.35, 1.7, 0.32, T_RIC + 14, T_TIP - 2));
    add('fx_edge', M.edge, band(0.35, 1.4, 0.28, T_FALSE + 20, T_TIP - 2, true));
    add('fx_flare', M.flare, band(0.6, 15, 0.7, T_RIC + 10, T_TIP - 1));

    // ---- the lower flat (forging step -> ridge): a cast scale frieze near the ricasso, then the running cloud inlay
    // (錯金 on 虹, 錯銀 on 霓) with a curl on every crest
    const zone = (t) => { const b = bladeAt(t), st2 = b.sb + 0.36 * b.W + 0.35, sr = b.sb + 0.6 * b.W; return { b, st2, sr, sc: (st2 + sr) / 2 }; };
    const wFlat = (s0, t) => { const { b, st2, sr } = zone(t); const k = clamp01((s0 - st2) / Math.max(0.5, sr - st2)); return lerp(b.h * 0.985 - 0.42, b.h * 0.86, k); };
    for (const sd of [1, -1]) {
      const map = (T0) => (u, v, z) => { const t = T0 + u, s0 = zone(t).sc + v; return [s0, t, sd * (wFlat(s0, t) + z)]; };
      // frieze: two border wires, three rows of scales between (free edges towards the guard)
      const FA = 146, FB = 184, fm = map(FA);
      for (const v of [-5.4, 5.4]) add('gun', M.trim, mapTris(ribbonT([[0, v], [FB - FA, v]], 0.8, -0.05, 0.35, { step: 3, b: 0.2 }), fm, 50));
      add('gun', M.trim, mapTris(ribbonT([[-0.4, -5.8], [-0.4, 5.8]], 0.8, -0.05, 0.35, { step: 3, b: 0.2 }), fm, 50));
      const T = [];
      // 鱗紋: rows of scale arcs inlaid in wire (each arc the free edge of a scale, opening towards the tip), a granule
      // in every scale
      for (let r = 0; r < 3; r++) for (let c = 0; c < 10; c++) {
        const v = -3.5 + r * 3.5, u = 2.6 + c * 3.9 + (r % 2) * 1.95;
        if (u > FB - FA - 2.4) continue;
        const arc = []; for (let i = 0; i <= 6; i++) { const a = (200 + i * 140 / 6) * D2R; arc.push([u + Math.sin(a) * 2.2 + 2.2, v + Math.cos(a) * 1.95]); }
        T.push(...wireT(arc, 0.42, -0.05, 0.3, { step: 1.2 }));
        if (r < 2 || c % 2) T.push(...mapTrisRaw(dome([u + 1.9, 0, v], [0, 1, 0], 0.42, 0.3, 5)));
      }
      add('gun', M.trim, mapTris(T, fm, 50));
      // cloud wave: 1.8 mm wire, period 76 mm, curls on every crest
      const T0 = FB + 4, T1 = 456, wm = map(T0), A = 2.0, Pd = 76, wave = [];
      for (let u = 0; u <= T1 - T0; u += 3) wave.push([u, A * Math.sin(TAU * u / Pd) * Math.min(1, u / 20, (T1 - T0 - u) / 24)]);
      add('gun', M.trim, mapTris(wireT(wave, 1.8, -0.05, 0.32, { step: 3.2 }), wm, 55));
      for (let kc = 0; ; kc++) {
        const u = Pd / 4 + kc * Pd / 2, top = kc % 2 === 0;
        if (u > T1 - T0 - 18) break;
        const r0 = 2.1, v = top ? A + r0 * 0.92 : -(A + r0 * 0.92);
        add('gun', M.trim, mapTris(curlW(u + (top ? 1.5 : -1.5), v, r0, top ? 1 : -1, top ? -90 : 90, 0.3, 1.3), wm, 55));
      }
    }

    // ---- fuller: the vein (fx_vein) seated on the floor, five clamp bridges on domed rivets, teardrop end caps
    for (const sd of [1, -1]) {
      const pts = [];
      for (let t = F0 + 8; t <= F1 - 8; t += 8) { const f = fullerGeo(t); pts.push([f.fc, t, sd * (f.floor - 0.35)]); }
      add('fx_vein', M.vein, ttube(pts, (u) => 1.3 * Math.min(1, u * 16, (1 - u) * 16), null, { radial: 6, seg: 44 }));
    }
    for (const tb of [175, 245, 315, 385, 455]) {
      const { h } = bladeAt(tb), f = fullerGeo(tb);
      for (const sd of [1, -1]) {
        add('gun', M.trim, strap(f.f0 - 2.2, f.f0 + f.fw * Math.min(1, bladeAt(tb).W / 34) + 2.2, tb, () => h + 0.05, sd, 3.2, 0.75));
        for (const s of [f.f0 - 1.4, f.f0 + f.fw + 1.4]) add('gun', M.trim, domeAt([s, tb, sd * (h + 0.75)], [0, 0, sd], 0.9, 0.55, 6));
      }
    }
    for (const [tc, dir] of [[F0 + 3, -1], [F1 - 3, 1]]) {
      const { h } = bladeAt(tc), f = fullerGeo(tc + dir * 4);
      for (const sd of [1, -1]) add('gun', M.trim, ell([f.fc, tc + dir * 1.2, sd * (h - 0.75)], [0, 1, 0], [0, 0, sd], 4.6, 5.4, 1.05, 14));
    }

    // ---- the ricasso plaque on each flat: the oracle-bone 虹 glyph inlaid in wire on the dark ground of the ricasso,
    // inside a raised double frame: the arched body in enamel cells, a dragon head drinking at each foot, ripples
    // under the mouths, cloud scrolls in the top corners
    const PC = { s: -1, t: 102 };
    for (const sd of [1, -1]) {
      const h0 = bladeAt(PC.t).h, map = (u, v, z) => [PC.s + u + (sbBase(PC.t + v) + 22), PC.t + v, sd * (h0 + z)];
      const se = (c, e) => Math.sign(c) * Math.pow(Math.abs(c), e);
      const frame = (ins) => { const o = []; for (let i = 0; i < 36; i++) { const a = i / 36 * TAU; o.push([se(Math.cos(a), 0.3) * (14.5 - ins), se(Math.sin(a), 0.3) * (19 - ins)]); } return o; };
      add('gun', M.trim, mapTris(ribbonT(frame(1.1), 2.1, -0.05, 0.75, { closed: true, step: 3.2, b: 0.4 }), map, 50));
      add('gun', M.trim, mapTris(wireT(frame(3.2), 0.55, -0.05, 0.32, { closed: true, step: 3.6 }), map, 50));
      // the arched body: two wires 3.8 apart, cross wires into cells, enamel in the cells (rainbow order)
      const CY = -2.5, RX = 8.4, RY = 12.5;
      const arch = (r, a0 = 180, a1 = 0, n = 40) => { const o = []; for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n) * D2R; o.push([Math.cos(a) * (RX + r), CY + Math.sin(a) * (RY + r)]); } return o; };
      for (const r of [-1.9, 1.9]) add('gun', M.trim, mapTris(wireT(arch(r, 180, 0, 26), 0.6, -0.05, 0.42, { step: 2.0 }), map, 50));
      const NC = 9;
      for (let i = 0; i <= NC; i++) { const a = lerp(180, 0, i / NC) * D2R; add('gun', M.trim, mapTris(wireT([[Math.cos(a) * (RX - 1.9), CY + Math.sin(a) * (RY - 1.9)], [Math.cos(a) * (RX + 1.9), CY + Math.sin(a) * (RY + 1.9)]], 0.5, -0.05, 0.42, { step: 1 }), map, 50)); }
      for (let i = 0; i < NC; i++) {
        const A0 = lerp(180, 0, i / NC), A1 = lerp(180, 0, (i + 1) / NC), e = (A1 - A0) * 0.05, cell = [...arch(-1.55, A0 + e, A1 - e, 3), ...arch(1.55, A1 - e, A0 + e, 3)];
        add('gun', M.bands[i % 3], mapTris(fanT(cell, -0.05, 0.24, { b: 0.12, step: 1.6, rings: 0 }), map, 40));
      }
      // the heads: a cast wedge at each foot, the snout turned down and out, open jaws (drinking), an enamel eye, a
      // horn; ripples under the mouths
      for (const dx of [-1, 1]) {
        const head = [[6.5, -2.2], [10.3, -2.2], [11.3, -5], [11.8, -7.8], [10.1, -8.8], [8.2, -7.4], [6.8, -5]].map(([x, y]) => [dx * x, y]);
        add('gun', M.trim, mapTris(fanT(dx > 0 ? head : head.slice().reverse(), -0.05, 0.55, { b: 0.25, step: 0.9, rings: 1 }), map, 45));
        add('gun', M.trim, mapTris(wireT([[dx * 11.6, -8], [dx * 13.4, -10.4], [dx * 12.9, -11.6]], 0.55, -0.05, 0.42, { step: 0.8 }), map, 50));
        add('gun', M.trim, mapTris(wireT([[dx * 10.1, -8.6], [dx * 9.9, -11.2], [dx * 9.0, -12.2]], 0.55, -0.05, 0.42, { step: 0.8 }), map, 50));
        add('gun', M.trim, mapTris(wireT([[dx * 8.8, -2.6], [dx * 7.2, -0.2], [dx * 5.6, 0.6]], 0.45, -0.05, 0.36, { step: 0.8 }), map, 50));
        add('gun', M.bands[0], mapTris(fanT(arcP(dx * 9.7, -4.9, 0.75, 0, 330, 11), 0.3, 0.75, { b: 0.1, step: 0.5, rings: 1 }), map, 40));
        for (const [y, w] of [[-13.6, 3.2], [-15.0, 2.2]]) {
          const rip = []; for (let i = 0; i <= 8; i++) { const x = dx * 11.2 - w / 2 + w * i / 8; rip.push([x, y + 0.35 * Math.sin(i / 8 * TAU)]); }
          add('gun', M.trim, mapTris(wireT(rip, 0.45, -0.05, 0.32, { step: 0.6 }), map, 50));
        }
        add('gun', M.trim, mapTris(curlW(dx * 7.2, 11.8, 1.9, -dx, dx > 0 ? 200 : -20, 0.4, 0.7), map, 50));
      }
      add('gun', M.trim, dome(map(0, 13.6, 0.1), [0, 0, sd], 0.95, 0.8, 8));
    }
  }

  // ======================================================================== 刃鎺 sleeve: the ricasso section + 1.2 mm
  {
    const sec = (t, grow) => {
      const { sb, se, h } = bladeAt(t), sg = se - 1.0, wg = h * 0.6, o = [];
      const half = [[sb - grow, 0], [sb - grow * 0.7, h * 0.72 + grow * 0.7], [sb + 0.9, h + grow], [lerp(sb, se, 0.5), h + grow], [sb + 0.84 * (se - sb), h * 0.985 + grow], [sg, wg + grow * 0.92], [se + grow * 0.6, wg * 0.4 + grow * 0.6], [se + grow, 0]];
      for (const [s, w] of half) o.push([s, t, w]);
      for (const [s, w] of half.slice(1, -1).reverse()) o.push([s, t, -w]);
      return o;
    };
    const R = [[SLEEVE[0], 1.2], [SLEEVE[1] - 6.4, 1.2], [SLEEVE[1] - 5.8, 1.7], [SLEEVE[1] - 5.2, 1.95], [SLEEVE[1] - 4.6, 1.7], [SLEEVE[1] - 4.0, 1.2], [SLEEVE[1] - 0.9, 1.2], [SLEEVE[1], 0.45]].map(([t, g]) => sec(t, g));
    add('gun', M.trim, loft(R, { crease: 50 }));
  }

  // ======================================================================== the head (shared geometry)
  for (const [role, parts] of Object.entries(headGeo())) for (const [part, list] of Object.entries(parts)) for (const g of list) add(part, roleMat[role], g);
  add('fx_pearl', M.pearl, facetBall([PEARL.s, PEARL.t, 0], PEARL.R, 20, 11));

  // ======================================================================== neck collar: the back of the skull into the ferrule
  {
    const ROWS = [[4, -12, 40, 15.5], [-6, -11, 37, 16], [-10, -8, 32, 16], [-14, -4.5, 26.5, 15.6], [-17.5, -1, 22, 15], [-19.8, 1.4, 19.8, 14.3], [-21, 2, 19, 13.8]];
    const fC = (k) => curveFn(ROWS.map((r) => [-r[0], r[k]]));
    const sC = fC(1), hsC = fC(2), hwC = fC(3), se = (c, e) => Math.sign(c) * Math.pow(Math.abs(c), e);
    const at = (a, t) => [sC(-t) + hsC(-t) * se(Math.cos(a), 0.8), t, hwC(-t) * se(Math.sin(a), 0.8)];
    const R = [];
    for (let t = 4; t >= -21.01; t -= 1.25) { const r = []; for (let i = 0; i < 44; i++) r.push(at(i / 44 * TAU, t)); R.push(r); }
    add('gun', M.metal, loft(R, { crease: 50 }));
    // one row of cast scales round it, the free edges down towards the grip
    const on = (a, t, z) => { const p = at(a, t), e = 0.004, pa = at(a + e, t), pt = at(a, t - 0.05), n = vnorm(vcross(vsub(pa, p), vsub(pt, p))); return vadd(p, vmul(n, z)); };
    const T = [], NA = 26;
    for (let i = 0; i < NA; i++) for (const [t0, off] of [[-13.4, 0]]) T.push(...scaleT(5.6, 5.8, (a, b) => [(i + off) / NA * TAU + b * 0.042, t0 - a], SC2));
    add('gun', M.metal, mapTris(T, (u, v, z) => on(u, v, z), 50));
    add('gun', M.trim, beadRing(-20.6, 2, 19.4 * 1.0, 14.3, 0.8, 30));
  }

  // ======================================================================== grip
  {
    const H0 = HANDLE;
    // ferrule under the collar (t -21 -> -32) with two incised lines, and the pommel collar (t -146 -> -160)
    add('gun', M.trim, revT([[0, -20.5], [15.7, -20.5], [16.4, -21.6], [16.4, -24.6], [16.0, -25.0], [16.4, -25.4], [16.4, -27.6], [16.0, -28.0], [16.4, -28.4], [16.4, -31], [15.6, -32.2], [0, -32.2]], { seg: 40, ks: 1.1, kw: 0.84, s0: H0.s }));
    add('gun', M.trim, beadRing(-31.8, H0.s, 17.4, 14.2, 0.75, 30));
    add('gun', M.trim, revT([[0, -146], [15.4, -146], [16.6, -148], [16.6, -156], [14, -160], [0, -160]], { seg: 36, ks: 1.1, kw: 0.84, s0: H0.s }));
    add('gun', M.trim, beadRing(-146.4, H0.s, 17.4, 14.2, 0.75, 30));
    // 雲雷紋 band round the pommel collar
    add('gun', M.metal, mapTris(thunderT(0, 2 * Math.PI * 16, -155.6, -148.4, 0, 0.5, { lw: 1.15, gap: 1.0, border: false }), (u, v, z) => { const a = u / 16; return [H0.s + Math.cos(a) * (16.6 + z) * 1.1, v, Math.sin(a) * (16.6 + z) * 0.84]; }, 50));
    // ray-skin core (slightly waisted)
    const kOf = (t) => 1 - 0.05 * Math.sin(Math.PI * (t - H0.t0) / (H0.t1 - H0.t0));
    const surf = (a, t, dr) => { const k = kOf(t); return [H0.s + Math.cos(a) * (H0.a * k + dr), t, Math.sin(a) * (H0.b * k + dr)]; };
    const core = [];
    for (let t = H0.t0 + 1; t >= H0.t1 - 1; t -= 6) { const R = []; for (let i = 0; i < 32; i++) R.push(surf(i / 32 * TAU, t, 0)); core.push(R); }
    add('gun', 'leather_pebble', loft(core, { crease: 60 }));
    // two-strand silk wrap: helices of opposite hand, over / under at alternate crossings; three ribs along each
    // strand, the over strand folded (narrower, a raised crease) at its crossings
    const pitch = 34, t0 = H0.t0 - 3, t1 = H0.t1 + 3;
    const X = [-1, -0.88, -0.6, -0.3, 0, 0.3, 0.6, 0.88, 1], Z = [-1, 0.62, 1, 0.72, 0.95, 0.72, 1, 0.62, -1];
    for (const hand of [1, -1]) {
      const R = [];
      for (let t = t0; t >= t1 - 0.01; t -= 1.5) {
        const ph = (t0 - t) / pitch * TAU, a = hand * ph + (hand > 0 ? 0 : Math.PI), dr = 0.75 + 0.42 * hand * Math.sin(ph);
        const c = surf(a, t, dr), nrm = vnorm(vsub(surf(a, t, dr + 1), c));
        const tan = vnorm(vsub(surf(a + hand * 0.02, t - 0.02 * pitch / TAU, dr), c)), bin = vnorm(vcross(nrm, tan));
        const m = ((ph % Math.PI) + Math.PI) % Math.PI, fold = hand * Math.sin(ph) > 0 ? Math.exp(-(((m - Math.PI / 2) / 0.32) ** 2)) : 0;
        const hw = 3.4 * (1 - 0.22 * fold), th = 0.55;
        R.push(X.map((x, i) => vadd(vadd(c, vmul(bin, x * hw)), vmul(nrm, Z[i] * th + (i > 0 && i < 8 ? fold * 0.55 * (1 - Math.abs(x)) : 0)))));
      }
      add('gun', M.silk, loft(R, { crease: 50 }));
    }
    // windows: on the +-s sides king nodules with granule rosettes; on the +-w sides a band of cast dragon-body
    // scales (visible between the strands)
    const sOn = (a, t, z) => { const p = surf(a, t, 0), n = vnorm(vsub(surf(a, t, 1), p)); return vadd(p, vmul(n, z)); };
    // (the strands cross on the +-w sides; on the +-s sides the skin shows midway between their passes)
    for (let n = 0; n < 12; n++) {
      const t = t0 - (0.25 + n * 0.5) * pitch;
      if (t < t1 + 5) break;
      for (const a of [0, Math.PI]) {
        add('gun', 'leather_pebble', dome(sOn(a, t, 0), vnorm(vsub(surf(a, t, 1), surf(a, t, 0))), 2.5, 1.2, 10));
        if (t < -50 && t > -120) continue;     // under the hand: the king nodule alone
        for (let j = 0; j < 6; j++) {
          const b = (j + 0.5) / 6 * TAU, da = Math.cos(b) * 4.2 / 15, dt = Math.sin(b) * 4.4;
          add('gun', 'leather_pebble', dome(sOn(a + da, t + dt, 0), vnorm(vsub(surf(a + da, t + dt, 1), surf(a + da, t + dt, 0))), 1.0, 0.55, 5));
        }
      }
    }
    const T = [];
    for (const a0 of [Math.PI / 2, -Math.PI / 2]) for (let r = 0; r < 26; r++) for (const c of [-1, 0, 1]) {
      const t = t0 - 1 - r * 4.4 - (c === 0 ? 2.2 : 0);
      if (t < t1 + 3 || (t < -50 && t > -118)) continue;     // under the hand: hidden
      T.push(...scaleT(5.0, 5.0, (a, b) => [a0 * 15 + c * 4.3 + b, t - a], SC2));   // free edges towards the tail (the pommel)
    }
    add('gun', M.metal, mapTris(T, (u, v, z) => sOn(u / 15, v, z), 50));
    // 目釘: a peg through the grip in the windows, domed caps on rosette washers
    for (const sd of [1, -1]) {
      const a = sd * Math.PI / 2, t = -52, p = sOn(a, t, 1.0), n = [0, 0, sd];
      const ros = []; for (let i = 0; i < 40; i++) { const b = i / 40 * TAU, r = 3.2 + 0.4 * Math.cos(6 * b); ros.push([Math.cos(b) * r, Math.sin(b) * r]); }
      add('gun', M.trim, mapTris(fanT(ros, -0.4, 0.55, { b: 0.25, step: 1, rings: 1 }), (u, v, z) => [p[0] + u, t + v, p[2] + sd * z], 45));
      add('gun', M.trim, domeAt([p[0], t, p[2] + sd * 0.5], n, 1.8, 1.3, 12));
    }
  }

  // ======================================================================== ring pommel (the dragon tail) + tassel
  {
    const { s: rs, t: rt, R } = RING;
    const A0 = 84, SWEEP = 306, N = 84, NS = 16;     // from inside the clasp at the top round to the fin (a gap for it)
    // section in (r = radial offset, w): a D -- flat-ish inner (ventral) face, rounded outer with a bevelled dorsal ridge
    const sect = (th, k, plate) => {
      const c = Math.cos(th), s = Math.sin(th), wh = 6.0 * k;
      if (c >= 0) { const ridge = 1.0 * k * Math.max(0, 1 - Math.abs(Math.atan2(s, c)) / 0.34); return [(4.6 * k) * Math.pow(c, 0.7) + ridge, wh * s]; }
      return [-(4.0 * k + plate) * Math.pow(-c, 0.18), wh * s * (1 - 0.06 * Math.pow(-c, 4))];
    };
    const kOf = (u) => lerp(1, 0.5, smooth(0.3, 1, u)) * lerp(1.12, 1, smooth(0, 0.08, u));
    const ringPt = (u, th, z = 0, plate = 0) => {
      const a = (A0 + u * SWEEP) * D2R, rr = R * (1 - 0.08 * smooth(0.8, 1, u)), c = [rs + Math.cos(a) * rr, rt + Math.sin(a) * rr], k = kOf(u);
      const [r, w] = sect(th, k, plate);
      return [c[0] + Math.cos(a) * (r + z), c[1] + Math.sin(a) * (r + z), w];
    };
    const Rg = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, arc = u * SWEEP * D2R * R, f = (arc / 4.4) % 1, plate = 0.38 * kOf(u) * Math.min(1, f / 0.8) * (u < 0.97 ? 1 : 0);
      Rg.push(Array.from({ length: NS }, (_, j) => ringPt(u, j / NS * TAU, 0, plate)));
    }
    add('gun', M.metal, loft(Rg, { crease: 42 }));
    // two rows of cast scales along the outer face either side of the ridge, free edges towards the tail
    const onR = (u, th, z) => { const p = ringPt(u, th), e = 0.002, pu = ringPt(u + e, th), pt = ringPt(u, th + 0.01), n = vnorm(vcross(vsub(pu, p), vsub(pt, p))); return vadd(p, vmul(n, z)); };
    const T = [], L0 = SWEEP * D2R * R;
    for (const [th, off] of [[0.72, 0], [-0.72, 0.5]]) for (let i = 0; ; i++) {
      const u0 = (i + off) * 4.8 / L0;
      if (u0 > 0.86) break;
      const k = kOf(u0);
      T.push(...scaleT(5.2 * k, 4.6 * k, (a, b) => [u0 + a / L0, th + b / (5.2 * k)], { lift: 0.55, th: 0.4, rim: 0.34, keel: 0.18, sink: 0.08 }));
    }
    add('gun', M.metal, mapTris(T, (u, v, z) => onR(u, v, z), 50));
    // the clasp: a gold band round the top of the ring (the tail's root hidden in it), beaded rims
    {
      const Rc = [];
      for (const [a, g] of [[75.5, 0.6], [76, 1.6], [77, 2.0], [78, 1.6], [80, 1.25], [84, 1.15], [90, 1.1], [96, 1.15], [100, 1.25], [102, 1.6], [103, 2.0], [104, 1.6], [104.5, 0.6]]) {
        const aa = a * D2R, c = [rs + Math.cos(aa) * R, rt + Math.sin(aa) * R], k = 1.12, r = [];
        for (let j = 0; j < 24; j++) { const th = j / 24 * TAU, [x, w] = sect(th, k, 0), m = Math.hypot(x, w) || 1; r.push([c[0] + Math.cos(aa) * (x + x / m * g), c[1] + Math.sin(aa) * (x + x / m * g), w + w / m * g]); }
        Rc.push(r);
      }
      add('gun', M.trim, loft(Rc, { crease: 45 }));
    }
    // the neck: a carved collar with bead edges joining the pommel ferrule to the clasp
    add('gun', M.trim, revT([[0, -159.5], [10.6, -159.5], [11.4, -160.6], [10.6, -161.8], [9.2, -162.6], [8.6, -164], [9.6, -165.2], [9.0, -166.4], [7.6, -167.2], [7.0, -171.5], [0, -171.5]], { seg: 28, ks: 1, kw: 1.1, s0: rs }));
    // tail fin: a fan of three fluted petals sweeping out of the tail's end, enamel inlays, gold ribs
    const tip = ringPt(1, 0, -2), prev = ringPt(0.97, 0, -2), D = vnorm(vsub(tip, prev)), out = vnorm([tip[0] - rs, tip[1] - rt, 0]);
    for (const [ang, L, Wd] of [[0.95, 22, 5.2], [1.35, 27, 6.2], [1.75, 20, 5.0]]) {
      const Dd = vnorm(vadd(vmul(D, Math.cos(ang)), vmul(out, Math.sin(ang)))), Rd = [0, 0, 1], Sd = vnorm(vcross(Dd, Rd));
      for (const sd of [1, -1]) {
        add('gun', M.metal, petal(vadd(tip, [0, 0, sd * 0.4]), Dd, vmul(Rd, sd), vmul(Sd, sd), L, Wd, 1.5, { bulge: 1.2, flick: 3.5, nu: 10, na: 8, groove: 0.35 }));
      }
      add('gun', M.fin, petal(vadd(tip, vmul(Dd, 2)), Dd, [0, 0, 1], Sd, L * 0.72, Wd * 0.55, 1.75, { bulge: 1.2, flick: 3.2, nu: 8, na: 6 }));
      add('gun', M.trim, ttube([vadd(tip, vmul(Dd, 1)), vadd(tip, vmul(Dd, L * 0.55)), vadd(vadd(tip, vmul(Dd, L * 0.95)), vmul(Sd, 0.6))], 0.7, 0.3, { radial: 6, seg: 10 }));
    }
    // the tassel (fx_tassel): cord loop through the bottom of the ring, metal cap, jade melon bead, cap, 32 strands
    const rb = rt - R - 4.2, TB = rb - 4;
    add('fx_tassel', M.silk, ttube([[rs - 3, rb + 3, 0], [rs - 3.4, TB - 3, 0], [rs, TB - 6, 0], [rs + 3.4, TB - 3, 0], [rs + 3, rb + 3, 0]], 1.1, 1.1, { radial: 6, seg: 24 }));
    add('fx_tassel', M.trim, revT([[0, TB - 5], [2.6, TB - 5], [3.6, TB - 7.5], [4.4, TB - 11], [0, TB - 11]], { seg: 20, s0: rs }));
    const bead = [];
    for (let i = 0; i <= 12; i++) { const u = i / 12, a = Math.PI * u; bead.push([Math.sin(a) * 6.4 + 0.3, TB - 11 - u * 13]); }
    {
      const g = new THREE.LatheGeometry(bead.slice().reverse().map(([r, tt]) => new THREE.Vector2(Math.max(0, r), tt)), 24);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 - 0.06 * Math.pow(Math.abs(Math.cos(a * 4)), 3); p.setX(i, x * k); p.setZ(i, z * k); }
      g.translate(0, 0, -rs);
      for (const key of Object.keys(g.attributes)) if (key !== 'position') g.deleteAttribute(key);
      add('fx_tassel', 'jade', outwardT(g.toNonIndexed(), 70));
    }
    add('fx_tassel', M.trim, revT([[0, TB - 23.5], [4.4, TB - 23.5], [3.4, TB - 27], [2.2, TB - 29.5], [0, TB - 29.5]], { seg: 20, s0: rs }));
    const strands = [];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU + hash(i) * 0.3, r0 = 1.4 + hash(i + 9) * 0.6, L = 54 + hash(i + 3) * 14, r1 = 3 + hash(i + 5) * 2.5, sw = (hash(i + 7) - 0.5) * 2;
      strands.push(ttube([[rs + Math.cos(a) * r0, TB - 29, Math.sin(a) * r0], [rs + Math.cos(a) * (r0 + 1.5), TB - 29 - L * 0.4, Math.sin(a) * (r0 + 1.5)], [rs + Math.cos(a) * r1 + sw, TB - 29 - L, Math.sin(a) * r1]], 0.42, 0.26, { radial: 4, seg: 6, caps: false }));
    }
    add('fx_tassel', M.silk, merge(strands));
  }
  return P;
}
const SC2 = { lift: 0.55, th: 0.4, rim: 0.4, keel: 0.16, sink: 0.06 };   // cast scales on the collar and the grip

// ------------------------------------------------------------------------------------------ assembly
export default function build() {
  const g = new Gun('twinblades');
  const R = sabre(MATS_R), L = sabre(MATS_L);
  const pivots = {
    gun: [HANDLE.s, GRIP_T, 0], fx_edge: [bladeAt(T_RIC + 14).se, T_RIC + 14, 0], fx_flare: [bladeAt(T_RIC + 10).se, T_RIC + 10, 0], fx_vein: [0, 300, 0],
    fx_jaw: [HINGE[0], HINGE[1], 0], fx_pearl: [PEARL.s, PEARL.t, 0], fx_tassel: [RING.s, RING.t - RING.R - 8, 0],
  };
  const extras = {
    gun: {}, fx_edge: { energy: true }, fx_flare: { energy: true, restHidden: true }, fx_vein: { energy: true },
    fx_jaw: { open: -16, hinge: 'w' }, fx_pearl: { hero: true, pv: { gem: 2.6, irid: 0.4 } }, fx_tassel: { swing: 'pendulum', len: 0.05 },
  };
  for (const [S, parts, sw] of [['R', R, 1], ['L', L, -1]]) {
    for (const [name, mats] of Object.entries(parts)) {
      const piv = pivots[name], pw = [piv[0], piv[1], sw * piv[2] + sw * OFF];
      const pname = S + '_' + name;
      const ex = { ...extras[name] };
      if (name === 'fx_pearl') ex.pv = { ...ex.pv, coreTint: S === 'R' ? '#ff6a2a' : '#8a6bff' };
      const part = g.part(pname, { pivot: pw, parent: name === 'gun' ? undefined : name === 'fx_pearl' ? S + '_fx_jaw' : S + '_gun', extras: ex });
      for (const [mat, list] of Object.entries(mats)) {
        for (const geo of list) {
          let gg = geo.index ? geo.toNonIndexed() : geo;
          if (sw < 0) gg = mirror(gg);
          gg = gg.clone(); gg.translate(sw * OFF, 0, 0);
          part.add(gg, mat);
        }
      }
    }
  }
  // sockets (both sides): grip, blade root, mid blade (trail start), point (trail end, muzzle), pearl, ring, head
  for (const [side, sw] of [['r', 1], ['l', -1]]) {
    const w = sw * OFF;
    g.socket('grip_' + side, [HANDLE.s, GRIP_T, w], { rot: [0, 0, -6] });
    g.socket('base_' + side, [(bladeAt(T_RIC + 6).sb + bladeAt(T_RIC + 6).se) / 2, T_RIC + 6, w]);
    g.socket('mid_' + side, [(bladeAt(380).sb + bladeAt(380).se) / 2, 380, w]);
    g.socket('edge_' + side, [bladeAt(380).se, 380, w]);
    g.socket('tip_' + side, [PNT, T_TIP, w]);
    g.socket('muzzle_' + side, [PNT, T_TIP, w]);
    g.socket('pearl_' + side, [PEARL.s, PEARL.t, w]);
    g.socket('ring_' + side, [RING.s, RING.t, w]);
    g.socket('head_' + side, [EYE[0], EYE[1], w]);
  }
  g.meta({
    grip: 'dual', support: 'dual', reload: 'none', series: 'shanhai',
    notes: 'X06 虹霓．雙絕 dual sabres. R_gun = 虹 (right hand, w +110), L_gun = 霓 (left, mirrored). t = blade axis (tip +t), s = edge, '
      + 'w = flat normal. Each sabre is posed by weapons/premium/twinblades.js (camera-space blade + edge directions written into R_gun / L_gun). '
      + 'R_/L_fx_edge: energy edge; R_/L_fx_flare: projected blade (restHidden; scale t grows it from the root); R_/L_fx_vein: fuller energy; '
      + 'R_/L_fx_jaw: lower jaw (open -16° about w at the hinge pin); R_/L_fx_pearl: dragon pearls (the focus); R_/L_fx_tassel: pendulum.',
  });
  // bake: pre-tessellated (enamel finer, metal coarser; slivers kept whole), glass and glow left out of the occluders,
  // then m4's post-bake (buried AO refill, per-material wear, flat faces unworn); patina pools in the recesses of the
  // bronze / tarnish in the silver (cavity from the AO); the temper line gets a frosted fringe (wear along it)
  g.build = (o = {}) => {
    const root = Gun.prototype.build.call(g, { ...o, bake: false });
    if (o.bake === false) return root;
    const meshes = [];
    root.traverse((m) => { if (m.isMesh && !/^(glass_|glow_)/.test(m.userData.mat)) meshes.push(m); });
    const tess = (o.tessellate ?? TESS) * 0.001;
    for (const m of meshes) {
      const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
      for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
      m.geometry = tessellateFat(geo, /^(glaze_|lacquer|pearl|leather|silk)/.test(m.userData.mat) ? tess : tess * TESS_K, 0.0014);
    }
    if (o.tessOnly) return root;
    const relief = (m) => (/^(bronze|silver|gold|chrome)/.test(m.userData.mat) ? 0.0009 : /^(steel|black_chrome|brass)/.test(m.userData.mat) ? 0.0008 : 0);
    bakeMeshes(meshes, { tessellate: 0, aoDist: 0.014, rays: 32, log: true, minHeight: relief });
    postBake(root, { cos: 0.99999 }, WEAR);
    root.traverse((m) => {
      const B = m.isMesh && m.geometry.attributes._bake?.array;
      if (!B) return;
      const mat = m.userData.mat, part = m.parent?.name || '';
      if (/^(bronze_aged|silver_aged)$/.test(mat)) for (let i = 0; i < B.length; i += 4) { const ao = B[i] / 255; B[i + 2] = Math.max(B[i + 2], Math.round(255 * Math.min(0.95, 2.6 * Math.max(0, 0.94 - ao)))); }
      if (/_gun$/.test(part) && /^(brass|steel_blued|steel_bright)$/.test(mat)) {
        const p = m.geometry.attributes.position.array, piv = pivots.gun;
        for (let i = 0, v = 0; i < p.length; i += 3, v++) {
          const t = p[i + 1] * 1000 + piv[1], s = piv[0] - p[i + 2] * 1000;
          if (t < T_RIC + 2 || t > T_TIP - 20) continue;
          const d = Math.abs(s - hamonS(t)), f = Math.exp(-((d / 1.1) ** 2)) * smooth(T_RIC + 4, T_RIC + 30, t);
          B[v * 4 + 1] = Math.max(B[v * 4 + 1], Math.round(255 * (mat === 'steel_bright' ? 0.45 : 0.62) * f));
          // nioi: a frosted (light, satin) fringe inside the temper band -- the cavity channel with a light cavCol in
          // the def, so it shows on a pristine (low-wear) weapon too
          if (mat !== 'steel_bright') B[v * 4 + 2] = Math.max(B[v * 4 + 2], Math.round(255 * 0.75 * Math.exp(-((d / 1.6) ** 2)) * smooth(T_RIC + 4, T_RIC + 30, t)));
        }
      }
    });
    return root;
  };
  return g;
}

const TESS = 12, TESS_K = 2.2;
/** per-material wear [curvature (1/m) mapped to full wear, cap] */
const WEAR = {
  '*:black_chrome': [1 / 800, 0.35], '*:chrome': [1 / 600, 0.3], '*:steel_bright': [1 / 600, 0.35], '*:brass': [1 / 600, 0.3], '*:steel_blued': [1 / 700, 0.4],
  '*:bronze_aged': [1 / 380, 0.85], '*:silver_aged': [1 / 380, 0.85], '*:gold': [1 / 420, 0.7], '*:gold_leaf': [1 / 450, 0.5],
  '*:leather_pebble': [1 / 600, 0.3], '*:silk_red': [1 / 900, 0.2], '*:silk_violet': [1 / 900, 0.2], '*:jade': [1 / 1400, 0.3], '*:bone': [1 / 700, 0.45],
  '*:glaze_vermilion': [0, 0], '*:glaze_ochre': [0, 0], '*:glaze_jade': [0, 0], '*:glaze_aubergine': [0, 0], '*:glaze_cobalt': [0, 0], '*:glaze_teal': [0, 0],
  '*:lacquer_red': [1 / 900, 0.25], '*:pearl': [0, 0], '*:crystal': [0, 0], '*:glass': [0, 0], '*:obsidian': [0, 0],
};
