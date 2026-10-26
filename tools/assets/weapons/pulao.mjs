// 蒲牢．鐘吼 Pulao Bellroar — 神兵 shotgun M08 (docs/PREMIUM_WEAPONS.md M08 card, §1.5, §1.1).
// An 870-class pump gun (1,000 mm overall, 470 mm barrel, 8-round tube) dressed as 蒲牢, the bell-knob dragon that
// loves to roar:
//   - muzzle = a cast bronze bell mouth (Ø28 -> Ø100 over 110 mm, a deep late flare, a scalloped 八波 lip with a gilt bead) with three raised
//     bands of cloud curls; eight pierced 如意 windows in gilt frames, backed by bronze lattice over a glowing cyan
//     liner; inside, a terraced bronze throat (six stepped ribs) with the glow only in the grooves between them
//   - receiver top = the coiled 蒲牢: an arched S-body with a dorsal keel, flank scale rows, belly plates, flame spines
//     and four clawed legs gripping a dark bronze saddle (scale arcs on its top); its tail curls up into the ghost-ring
//     rear sight; the head fx_pulao (pivot at the neck) rears up roaring, the lower jaw fx_jaw opens wider (ready). The
//     head is a displaced loft: overhanging brows over gilt slit-pupil eyes, a keeled snout rising to an upturned 如意
//     nose pad, flared nostrils, lip line and gum ridge with seated teeth, scale plates, jaw scale bands, forked fluted
//     antlers with knob rings, grooved mane, ears, gill fins, whiskers in gilt sockets
//   - receiver right: a bronze 鐘架 rack with three hanging 梵鐘-style bells fx_bell1..3 (篆帶 bands, 3 x 3 枚 bosses,
//     lotus striking bosses, plain 鉦 panels with a cloud, a rolled lip; pendulum on their top rings); a clapper inside
//     whose gilt bead and a glowing ring inside the lip (fx_lit1..3) show a loaded bell shell; drawn at Ø24 so the count reads at hip
//   - engraving: both flanks sunk into panels with a matted (stippled) ground, v-cut scroll grooves inlaid with gilt
//     wire, beaded gilt frames; left: running scroll fields round a cast bronze bell cartouche, cut-and-gilt stroke-font
//     roll-marks; right: a 青海波 wave scene with the house mark under the bells, a scroll band under the port, a gilt
//     回紋 band; a forged front bolster, the 九子 resonance lamp
//   - barrel: a bronze whisker rib on cloud-curl posts, a cast cloud band, gold damascene scrolls, a figure-8 band and a
//     cast clamp with a cloud lug tying it to the tube; the tube's exposed run wears an engraved bronze sleeve bound in
//     red silk cord; bronze cap with a knurled ring
//   - pump: carved 剔紅 cinnabar lacquer (錦地 lattice ground, a scroll vine with cloud scrolls in two relief tiers, a 回紋
//     strip, deep finger grooves) on three bronze bands with gilt beads, twin action bars and the bolt it drives
//   - stock: a heightfield-sculpted 紫檀 rosewood stock (rolled edges, comb flat, a cheek piece with a gilt-wire foot,
//     palm swells, carved cloud drop points, checkering sunk inside a cut border), a contoured top tang, a crescent cast
//     bronze butt plate (heel / toe spurs, gilt rim, cloud relief, serrations, two screws), bronze medallions with the
//     house mark, a bronze grip cap
// Materials: blued steel, rosewood, cinnabar lacquer / sand-cast bronze (a value under the gilt), dark bronze plinths,
// gold / glow (the bell's cyan liner and throat grooves, the gilt clappers). Side view, mm: s forward from the rear face
// of the receiver, t up from the bore axis, w right.
import * as THREE from 'three';
import { toCreasedNormals, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer';
import { Gun, V, profile, plan, section, lathe, cyl, tube, box, sphere, cut, cutters, merge, xform, makeShape } from '../lib/gunkit.mjs';
import { bakeMeshes } from '../lib/bake.mjs';
import { postBake } from './m4.mjs';
import {
  D2R, TAU, lerp, smooth, clamp01, vadd, vsub, vmul, vnorm, vcross, vdot, vlen, lax, along, dome, loft, ttube,
  ribbonT, mapTris, curlT, wireT, scaleT, petal, tooth, ellip, tessellateFat, arcP, circleP, resample, curveFn,
  insetPoly, slotScrew, ftube, thunderT, sweep,
} from '../lib/sculpt.mjs';
import { SegIndex, hfFace, roundDrop, bump as hbump, sstep, halfRound, plateau as hplat } from '../lib/hfield.mjs';

// materials: sand-cast bronze (dragon, bells, bell mouth, bands), oil-dark bronze (the saddle plinth), 紫檀 rosewood,
// carved cinnabar lacquer, matted (stippled) blued ground under the engraving
const BZ = 'bronze_cast', BD = 'bronze_dark', WD = 'wood_rose', LQ = 'lacquer_carved', MT = 'steel_stipple';

// ------------------------------------------------------------------------------------------ small helpers
const PF = (pts, o = {}) => profile(pts, { curveSeg: 3, ...o });
const SC = (pts, a, b, o = {}) => section(pts, a, b, { curveSeg: 3, ...o });
const fin = (geo, crease = 40) => {
  for (const k of Object.keys(geo.attributes)) if (k !== 'position') geo.deleteAttribute(k);
  return toCreasedNormals(geo.index ? geo.toNonIndexed() : geo, crease * D2R);
};
const sideAx = (sd) => (sd > 0 ? 'w' : '-w');
const capScrew = (at, r, axis = 'w', d = 1.4, seg = 10) => lax([[0, 0], [0, r], [d * 0.62, r], [d, r - 0.35], [d, r * 0.52], [d - 0.7, r * 0.5], [d - 0.7, 0]], at, axis, seg);
const hexHead = (at, r, axis = 'w', d = 1.6) => lax([[0, 0], [0, r], [d - 0.35, r], [d, r - 0.35], [d, 0]], at, axis, 6);
const pinEnd = (at, r, axis = 'w', d = 0.6) => lax([[0, 0], [0, r], [d, r - 0.2], [d, 0]], at, axis, 10);
const rivet = (at, r, axis = 'w', d = 0.8, seg = 8) => lax([[0, 0], [0, r], [d * 0.55, r * 0.8], [d, 0]], at, axis, seg);
/** slotted screw head on the side plane (axis w / -w): the slot as a cut */
function slotted(at, r, sd, d = 1.2, ang = 0) {
  const h = lax([[-0.2, 0], [-0.2, r], [d * 0.55, r * 0.97], [d, r * 0.6], [d, 0]], at, sideAx(sd), 12);
  const sl = xform(box([at[0], at[1], at[2] + sd * (d + 0.1)], [r * 2.4, 0.45, 1.0], { r: 0 }), { rot: [0, 0, ang], pivot: at });
  return cut(h, [sl]);
}
const spiral = (cs, ct, r0, r1, a0, a1, n) => {
  const out = [];
  for (let i = 0; i <= n; i++) { const u = i / n, a = (a0 + (a1 - a0) * u) * D2R, r = r0 + (r1 - r0) * u; out.push([cs + r * Math.cos(a), ct + r * Math.sin(a)]); }
  return out;
};
/** 雲紋 cloud scroll (side plane): a big curl out of its eye, an S tail, a small counter-curl. k = size, f = ±1 mirror. */
function cloudPts(cs, ct, k, f = 1) {
  const big = spiral(0, 0, 0.28 * k, k, -40, 450, 22);
  const tail = [[0.75 * k, 1.02 * k], [1.35 * k, 0.78 * k]];
  const small = spiral(1.85 * k, 0.32 * k, 0.5 * k, 0.16 * k, 160, -200, 14);
  return [...big, ...tail, ...small].map(([x, y]) => [cs + f * x, ct + y]);
}
/**
 * Mitred band along a side-plane polyline [s, t] lying on the plane w (sd = side): half width hw, height h; top and both
 * walls, end caps, nothing underneath (inlaid wires, frames, meanders).
 */
function band(pts, w, sd, hw, h) {
  const n = pts.length, L = [], R = [], pos = [];
  const nrm = (a, b) => { const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [-(b[1] - a[1]) / d, (b[0] - a[0]) / d]; };
  for (let i = 0; i < n; i++) {
    const a = nrm(pts[Math.max(0, i - 1)], pts[Math.max(1, i)]), b = nrm(pts[Math.min(n - 2, i)], pts[Math.min(n - 1, i + 1)]);
    const m = [a[0] + b[0], a[1] + b[1]], ml = Math.hypot(m[0], m[1]) || 1, k = hw / Math.max(0.35, (m[0] * a[0] + m[1] * a[1]) / ml);
    L.push([pts[i][0] + (m[0] / ml) * k, pts[i][1] + (m[1] / ml) * k]); R.push([pts[i][0] - (m[0] / ml) * k, pts[i][1] - (m[1] / ml) * k]);
  }
  const wt = w + sd * h, q = (A, B, C, D, out) => {
    for (const [a, b, c] of [[A, B, C], [A, C, D]]) {
      const nn = vcross(vsub(b, a), vsub(c, a));
      const [p1, p2] = vdot(nn, out) < 0 ? [c, b] : [b, c];
      for (const p of [a, p1, p2]) pos.push(p[2], p[1], -p[0]);
    }
  };
  for (let i = 0; i + 1 < n; i++) {
    const d = [pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]], nl = nrm(pts[i], pts[i + 1]);
    q([...L[i], wt], [...L[i + 1], wt], [...R[i + 1], wt], [...R[i], wt], [0, 0, sd]);
    q([...L[i], w], [...L[i + 1], w], [...L[i + 1], wt], [...L[i], wt], [nl[0], nl[1], 0]);
    q([...R[i], w], [...R[i + 1], w], [...R[i + 1], wt], [...R[i], wt], [-nl[0], -nl[1], 0]);
    if (i === 0) q([...L[0], w], [...R[0], w], [...R[0], wt], [...L[0], wt], [-d[0], -d[1], 0]);
    if (i === n - 2) q([...L[n - 1], w], [...R[n - 1], w], [...R[n - 1], wt], [...L[n - 1], wt], [d[0], d[1], 0]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return fin(geo, 40);
}
/** relief slab from a side-plane outline ([s, t], fanned from its centroid): top face at cw + sd th / 2, bevel, wall */
function slab(pts, cw, sd, th, bevel) {
  const n = pts.length, C = [pts.reduce((a, p) => a + p[0], 0) / n, pts.reduce((a, p) => a + p[1], 0) / n];
  const Q = pts.map(([s, t]) => { const d = Math.hypot(C[0] - s, C[1] - t) || 1, k = Math.min(bevel, d * 0.45) / d; return [s + (C[0] - s) * k, t + (C[1] - t) * k]; });
  const wt = cw + sd * th / 2, wm = wt - sd * Math.min(bevel * 0.8, th * 0.45), wb = cw - sd * th / 2, pos = [];
  const tri = (a, b, c, out) => {
    const n0 = vcross(vsub(b, a), vsub(c, a));
    if (vdot(n0, out) < 0) [b, c] = [c, b];
    for (const p of [a, b, c]) pos.push(p[2], p[1], -p[0]);
  };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, o = [(pts[i][0] + pts[j][0]) / 2 - C[0], (pts[i][1] + pts[j][1]) / 2 - C[1], 0];
    tri([C[0], C[1], wt], [...Q[i], wt], [...Q[j], wt], [0, 0, sd]);
    tri([...Q[i], wt], [...Q[j], wt], [...pts[j], wm], vadd(o, [0, 0, sd]));
    tri([...Q[i], wt], [...pts[j], wm], [...pts[i], wm], vadd(o, [0, 0, sd]));
    tri([...pts[i], wm], [...pts[j], wm], [...pts[j], wb], o);
    tri([...pts[i], wm], [...pts[j], wb], [...pts[i], wb], o);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return fin(geo, 50);
}
/** checkering: 4-sided pyramids {c, n, a, b, h} (base diamond c ± a, c ± b, apex c + n h), all [s, t, w] arrays */
function pyramids(list) {
  const pos = [];
  for (const { c, n, a, b, h } of list) {
    const q = [vadd(c, a), vadd(c, b), vsub(c, a), vsub(c, b)].map((p) => V(...p)), ap = V(...vadd(c, vmul(n, h))), C = V(...c);
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
/** signed distance inside a side-plane polygon ([s, t]; < 0 outside) */
function polyDist(poly, s, t) {
  let inside = false, d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [si, ti] = poly[i], [sj, tj] = poly[j];
    if ((ti > t) !== (tj > t) && s < ((sj - si) * (t - ti)) / (tj - ti) + si) inside = !inside;
    const ds = sj - si, dt = tj - ti, L2 = ds * ds + dt * dt, k = L2 ? clamp01(((s - si) * ds + (t - ti) * dt) / L2) : 0;
    d = Math.min(d, Math.hypot(s - si - ds * k, t - ti - dt * k));
  }
  return inside ? d : -d;
}
/** small cloud curl (cheap): a 1.2-turn spiral with a tail, tapering, for bands seen at arm's length */
function curlLo(cu, cv, r0, dir, a0, z0, z1, lw = 0.8) {
  const ta = a0 * D2R, pts = [[cu + Math.cos(ta) * r0 + Math.sin(ta) * dir * r0 * 1.2, cv + Math.sin(ta) * r0 - Math.cos(ta) * dir * r0 * 1.2]];
  for (let i = 0; i <= 9; i++) { const u = i / 9, a = (a0 + dir * u * 1.25 * 360) * D2R, rr = r0 * (1 - 0.68 * u); pts.push([cu + Math.cos(a) * rr, cv + Math.sin(a) * rr]); }
  return ribbonT(pts, (f) => lw * (1 - 0.35 * f), z0, z1, { step: 2.6, b: 0.22 });
}
// stroke font (4 x 6 cell) for the roll-marks: cut-and-gilt strokes (sunk 0.3, standing 0.07 proud)
const SFONT = {
  A: [[[0, 0], [0, 4.2], [1.8, 6], [2.2, 6], [4, 4.2], [4, 0]], [[0, 2.8], [4, 2.8]]],
  B: [[[0, 0], [0, 6], [3, 6], [3.8, 5.3], [3.8, 3.8], [3, 3], [0, 3]], [[3, 3], [4, 2.2], [4, 0.8], [3.2, 0], [0, 0]]],
  E: [[[4, 6], [0, 6], [0, 0], [4, 0]], [[0, 3], [3, 3]]],
  G: [[[4, 5.2], [3.2, 6], [0.8, 6], [0, 5.2], [0, 0.8], [0.8, 0], [3.2, 0], [4, 0.8], [4, 3], [2.2, 3]]],
  L: [[[0, 6], [0, 0], [4, 0]]],
  M: [[[0, 0], [0, 6], [2, 3], [4, 6], [4, 0]]],
  O: [[[0.8, 0], [0, 0.8], [0, 5.2], [0.8, 6], [3.2, 6], [4, 5.2], [4, 0.8], [3.2, 0], [0.8, 0]]],
  P: [[[0, 0], [0, 6], [3.2, 6], [4, 5.2], [4, 3.8], [3.2, 3], [0, 3]]],
  R: [[[0, 0], [0, 6], [3.2, 6], [4, 5.2], [4, 3.8], [3.2, 3], [0, 3]], [[1.8, 3], [4, 0]]],
  U: [[[0, 6], [0, 0.8], [0.8, 0], [3.2, 0], [4, 0.8], [4, 6]]],
  0: [[[0.8, 0], [0, 0.8], [0, 5.2], [0.8, 6], [3.2, 6], [4, 5.2], [4, 0.8], [3.2, 0], [0.8, 0]], [[3.6, 5], [0.4, 1]]],
  1: [[[0.9, 4.8], [2.2, 6], [2.2, 0]], [[0.8, 0], [3.6, 0]]],
  2: [[[0, 5.2], [0.8, 6], [3.2, 6], [4, 5.2], [4, 3.8], [0, 0], [4, 0]]],
  8: [[[0.8, 3], [0, 3.8], [0, 5.2], [0.8, 6], [3.2, 6], [4, 5.2], [4, 3.8], [3.2, 3], [0.8, 3], [0, 2.2], [0, 0.8], [0.8, 0], [3.2, 0], [4, 0.8], [4, 2.2], [3.2, 3]]],
};
/** roll-mark `str` on the side plane w (sd = the face's side), centred on [sc, tc], cap height h, reading left to right */
function rollMark(str, sc, tc, h, w, sd, { hw = 0.26, sink = 0.3, proud = 0.07 } = {}) {
  const k = h / 6, adv = 5.6 * k, space = 3.6 * k, dir = sd > 0 ? 1 : -1;   // +s reads rightwards on the right flank
  let width = -1.6 * k;
  for (const ch of str) width += ch === ' ' ? space : adv;
  let x = -width / 2;
  const out = [];
  for (const ch of str) {
    if (ch === ' ') { x += space; continue; }
    for (const line of SFONT[ch] || []) out.push(band(line.map((p) => [sc + dir * (x + p[0] * k), tc - h / 2 + p[1] * k]), w - sd * sink, sd, hw, sink + proud));
    x += adv;
  }
  return merge(out);
}
/**
 * The house mark as vector relief on the side plane w (sd = facing side): a hanging bell (domed crown, flared lip, two
 * belt lines, five bosses, the knob loop) cast proud, a gilt rim, three sound arcs either side. k = scale (1: 22 x 22 mm).
 * Returns { body, gold } geometry lists (the body in the caller's bronze).
 */
function bellMark(cs, ct, k, w, sd, { relief = 1.4, arcs = 3 } = {}) {
  const P = (s, t) => [cs + (s - 101) * k, ct + (t + 9) * k];
  const bell = [[88, -20], [114, -20], [112.6, -17.5], [110.2, -15.8], [109.6, -6], [107.2, -1.8], [103.8, 0.6], [101, 1.6], [98.2, 0.6], [94.8, -1.8], [92.4, -6], [91.8, -15.8], [89.4, -17.5]].map(([s, t]) => P(s, t));
  const top = w + sd * relief, body = [slab(bell, w + sd * relief / 2, sd, relief, 0.5 * k)], gold = [];
  gold.push(band([...bell, bell[0]], top - sd * 0.25, sd, 0.3 * Math.max(0.8, k), 0.35));
  for (const t of [-12.5, -16.6]) gold.push(band([P(93.4, t), P(108.6, t)], top - sd * 0.3, sd, 0.3 * Math.max(0.8, k), 0.38));
  for (const [s, t] of [[95.5, -9], [101, -9], [106.5, -9], [98.3, -5.4], [103.7, -5.4]]) gold.push(dome([...P(s, t), top], [0, 0, sd], 0.85 * k, 0.6 * k, 7));
  body.push(lax([[0, 0], [0, 1.9 * k], [0.7, 1.9 * k], [0.7, 0]], [...P(101, 3.6), w], sideAx(sd), 14));
  for (let i = 0; i < arcs; i++) for (const [a0, a1] of [[200 - i * 6, 250 - i * 3], [290 + i * 3, 340 + i * 6]]) {
    const r = (13 + i * 3.4) * k, c = P(101, -9);
    gold.push(band(arcP(c[0], c[1], r, a0, a1, 7), w, sd, 0.3 * Math.max(0.8, k), 0.4));
  }
  return { body, gold };
}
/**
 * Continuous scroll engraving for a panel [s0, s1] x [t0, t1]: a running S-vine; off every crest and trough a big
 * spiral into the open side (1.6 turns), a counter-curl budding off its outer flank, a pair of tapered leaves on the
 * narrow side. Polylines [[s, t], ...] with a stroke weight each (taper: thins to its end).
 */
function scrollPaths(s0, s1, t0, t1, { waves = 3, avoid = null } = {}) {
  const H = t1 - t0, mid = (t0 + t1) / 2, A = H * 0.14, lam = (s1 - s0) / waves, R0 = Math.min(H * 0.27, lam * 0.31), out = [];
  const vy = (s) => mid + A * Math.sin(((s - s0) / lam) * TAU);
  const inside = (P, m = 0.3) => P.every(([x, y]) => x > s0 - m && x < s1 + m && y > t0 - m && y < t1 + m);
  const vine = [];
  for (let s = s0; s <= s1 + 1e-6; s += 1.0) vine.push([s, vy(s)]);
  out.push({ pts: vine, w: 1.0 });
  const spiral = (C, R, a0, turns, dir, rEnd) => {
    const p = [];
    for (let i = 0, n = Math.ceil(turns * 30); i <= n; i++) { const u = i / n, a = a0 + dir * u * turns * TAU, r = R * (1 - (1 - rEnd) * Math.pow(u, 0.8)); p.push([C[0] + Math.cos(a) * r, C[1] + Math.sin(a) * r]); }
    return p;
  };
  for (let k = 0; k < waves * 2; k++) {
    const crest = k % 2 === 0, sgn = crest ? -1 : 1, dir = crest ? -1 : 1;   // the open side: under a crest, over a trough
    const sx = s0 + lam * (0.25 + k * 0.5), sy = vy(sx), C = [sx + lam * 0.03, sy + sgn * R0];
    if (avoid && avoid(C[0], C[1], R0)) continue;
    const sp = spiral(C, R0, Math.atan2(sy - C[1], sx - C[0]), 1.6, dir, 0.11);
    out.push({ pts: sp, w: 0.95 });
    // counter-curl: buds off the spiral's leading flank (a quarter turn in) and rolls the other way
    const i0 = Math.round(sp.length * 0.14), q = sp[i0], o = vnorm([q[0] - C[0], q[1] - C[1], 0]), r2 = R0 * 0.42;
    const C2 = [q[0] + o[0] * r2 * 1.15 + lam * 0.05, q[1] + o[1] * r2 * 1.15];
    const cc = [q, ...spiral(C2, r2, Math.atan2(q[1] - C2[1], q[0] - C2[0]), 1.25, -dir, 0.18)];
    if (inside(cc) && !(avoid && avoid(C2[0], C2[1], r2))) out.push({ pts: cc, w: 0.7 });
    // a pair of small tendril curls on the narrow side of the crest / trough
    const gap = crest ? t1 - sy : sy - t0, r3 = Math.min(gap * 0.26, lam * 0.075);
    for (const f of [-1, 1]) {
      const C3 = [sx + f * lam * 0.12, sy - sgn * gap * 0.45], q0 = [sx + f * lam * 0.02, sy - sgn * 0.2];
      const L = [q0, ...spiral(C3, r3 * 1.15, Math.atan2(q0[1] - C3[1], q0[0] - C3[0]) + f * sgn * 0.5, 1.05, f * sgn, 0.3)];
      if (inside(L) && !(avoid && avoid(sx, sy, 2))) out.push({ pts: L, w: 0.7 });
    }
  }
  return out;
}
/** a polyline thinned to points at least `step` apart (ends kept): native spiral / vine density is far finer than a stroke needs */
function thin(path, step) {
  const out = [path[0]];
  for (let i = 1; i < path.length - 1; i++) { const q = out[out.length - 1]; if (Math.hypot(path[i][0] - q[0], path[i][1] - q[1]) >= step) out.push(path[i]); }
  out.push(path[path.length - 1]);
  return out;
}
/** distance field over polylines (SegIndex) for engraved grooves: v-groove depth at (s, t), half width hw */
function grooveField(paths, hw) {
  const SI = new SegIndex(paths.map((p, i) => ({ pts: p.pts, closed: false, tag: i })), 3);
  return (s, t) => {
    const n = SI.near(s, t, hw * 1.6 + 0.3);
    if (!n) return 0;
    const W = hw * (paths[n.tag].w ?? 1);
    return n.d >= W ? 0 : 1 - n.d / W;
  };
}

/**
 * Revolve a closed side profile [[s, r], ...] (outer, lip, inner back) round an axis parallel to the bore at (t, w):
 * M points a ring, mod(s, a) -> [ds, dr] shapes it per angle (scalloped lips, grooves). A closed solid (CSG-safe).
 */
function revolve(prof, { t = 0, w = 0, M = 48, mod = null, crease = 40 } = {}) {
  const rings = prof.map(([s, r]) => {
    const ring = [];
    for (let j = 0; j < M; j++) {
      const a = (j / M) * TAU, [ds, dr] = mod ? mod(s, a, r) : [0, 0];
      ring.push([s + ds, t + (r + dr) * Math.sin(a), w + (r + dr) * Math.cos(a)]);
    }
    return ring;
  });
  return loft(rings, { wrap: true, crease });
}
/**
 * Design space wrapped round an axis parallel to the bore through (t0, w0): u = arc length (mm) at radius R(v) from
 * angle a0 (0 = +w, 90° = +t), v = s, z = height off the surface. R may be a number or a function of s.
 */
const sMap = (R, { t0 = 0, w0 = 0, a0 = 0 } = {}) => (u, v, z) => {
  const r = typeof R === 'function' ? R(v) : R, a = a0 * D2R + u / r;
  return [v, t0 + (r + z) * Math.sin(a), w0 + (r + z) * Math.cos(a)];
};

/** A sampled spine (tail -> head) for the dragon: arc-length frames (N = up, B = right), radius and section shape. */
class Spine {
  constructor(pts, rad, { n = 400 } = {}) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
    this.S = [];
    let L = 0, prev = null;
    for (let i = 0; i <= n; i++) {
      const p = curve.getPointAt(i / n), c = [p.x, p.y, p.z];
      if (prev) L += vlen(vsub(c, prev));
      const tg = curve.getTangentAt(i / n), T = vnorm([tg.x, tg.y, tg.z]);
      let N = vsub([0, 1, 0], vmul(T, T[1]));
      if (vlen(N) < 0.2) N = vsub([0, 0, -1], vmul(T, -T[2]));
      N = vnorm(N);
      this.S.push({ L, c, T, N, B: vnorm(vcross(T, N)) });
      prev = c;
    }
    this.len = L; this.rad = rad;
  }
  at(L) {
    const S = this.S, x = Math.max(0, Math.min(this.len, L));
    let lo = 0, hi = S.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m].L < x) lo = m; else hi = m; }
    const a = S[lo], b = S[hi], k = (x - a.L) / Math.max(1e-6, b.L - a.L);
    return { c: vlerp3(a.c, b.c, k), T: vnorm(vlerp3(a.T, b.T, k)), N: vnorm(vlerp3(a.N, b.N, k)), B: vnorm(vlerp3(a.B, b.B, k)) };
  }
  r(L) { return this.rad(Math.max(0, Math.min(1, L / this.len)), L); }
  /** section radius at angle a (rad; +90° = the dorsal keel, -90° the belly): a slightly flattened belly, a keel */
  ra(L, a) {
    const r = this.r(L), s = Math.sin(a);
    return r * (s >= 0 ? 1 + 0.04 * s : 1 - 0.13 * s * s) + r * keelAt(a);
  }
  surf(L, a, z = 0) {
    const f = this.at(L), R = this.ra(L, a) + z;
    return vadd(f.c, vadd(vmul(f.N, Math.sin(a) * R), vmul(f.B, Math.cos(a) * R)));
  }
  /** design-space map: u = arc length along, v = arc length round at the local radius from the right side (a = 0) */
  map() { return (u, v, z) => this.surf(u, v / Math.max(0.5, this.r(u)), z); }
  body(L0, L1, { step = 1.6, M = 18 } = {}) {
    const rings = [];
    for (let L = L0; L <= L1 + 1e-6; L += step) {
      const ring = [];
      for (let j = 0; j < M; j++) ring.push(this.surf(L, (j / M) * TAU));
      rings.push(ring);
    }
    return loft(rings, { crease: 55 });
  }
}
const vlerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
/** dorsal keel profile round the section (angle a, rad): a sharp ridge on top */
function keelAt(a) { let d = Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2)); return 0.3 * Math.exp(-(d * d) / 0.06); }

/** superellipse-section loft along s: st [s, halfW, top, bot, n] stations (head pieces) */
function podLoft(st, { M = 18, crease = 50, capA = true, capB = true, wOff = 0 } = {}) {
  const rings = st.map(([s, A, top, bot, n = 2.4]) => {
    const c = (top + bot) / 2, h = (top - bot) / 2, ring = [];
    for (let j = 0; j < M; j++) {
      const a = (j / M) * TAU, cs = Math.cos(a), sn = Math.sin(a);
      ring.push([s, c + h * Math.sign(sn) * Math.abs(sn) ** (2 / n), wOff + A * Math.sign(cs) * Math.abs(cs) ** (2 / n)]);
    }
    return ring;
  });
  return loft(rings, { crease, capA, capB });
}

/**
 * Superellipse pod displaced along its normal (the head, the jaw): stations [s, halfW, top, bottom, n] interpolated
 * smoothly along s, disp(s, phi) in mm with phi the elevation round the section (0 the side, 90 the top, -90 under).
 */
class Pod {
  constructor(st, disp = () => 0) {
    const f = (k, d) => curveFn(st.map((r) => [r[0], r[k] ?? d]));
    this.A = f(1); this.T = f(2); this.B = f(3); this.n = f(4, 2.4); this.s0 = st[0][0]; this.s1 = st[st.length - 1][0]; this.disp = disp;
  }
  raw(s, a) {
    const A = this.A(s), T = this.T(s), B = this.B(s), e = 2 / this.n(s), c = Math.cos(a), sn = Math.sin(a);
    return [s, (T + B) / 2 + ((T - B) / 2) * Math.sign(sn) * Math.abs(sn) ** e, A * Math.sign(c) * Math.abs(c) ** e];
  }
  nrm(s, a) {
    const e = 0.02, n = vnorm(vcross(vsub(this.raw(s + e, a), this.raw(s - e, a)), vsub(this.raw(s, a + e), this.raw(s, a - e)))), p = this.raw(s, a);
    return vdot(n, [0, p[1] - (this.T(s) + this.B(s)) / 2, p[2]]) < 0 ? vmul(n, -1) : n;
  }
  surf(s, a, z = 0) { return vadd(this.raw(s, a), vmul(this.nrm(s, a), this.disp(s, Math.atan2(Math.sin(a), Math.abs(Math.cos(a))) / D2R) + z)); }
  body(step = 0.7, M = 40) {
    const rings = [], n = Math.ceil((this.s1 - this.s0) / step);
    for (let i = 0; i <= n; i++) { const s = this.s0 + ((this.s1 - this.s0) * i) / n, ring = []; for (let j = 0; j < M; j++) ring.push(this.surf(s, (j / M) * TAU)); rings.push(ring); }
    return loft(rings, { crease: 55 });
  }
}

/** QEM-decimate a (non-indexed, creased) mesh in metres to at most err mm of surface error; returns non-indexed */
function decimate(geo, err, nw = 0.3, prune = false) {
  for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
  const w = mergeVertices(geo.index ? geo.toNonIndexed() : geo, 1e-7);
  const P = w.attributes.position.array, N = w.attributes.normal.array;
  const Pmm = new Float32Array(P.length);
  for (let i = 0; i < P.length; i++) Pmm[i] = P[i] * 1000;
  const [I] = MeshoptSimplifier.simplifyWithAttributes(Uint32Array.from(w.index.array), Pmm, 3, N, 3, [nw, nw, nw], null, 0, err, prune ? ['ErrorAbsolute', 'Prune'] : ['ErrorAbsolute']);
  const pos = new Float32Array(I.length * 3), nrm = new Float32Array(I.length * 3);
  for (let k = 0; k < I.length; k++) for (let c = 0; c < 3; c++) { pos[k * 3 + c] = P[I[k] * 3 + c]; nrm[k * 3 + c] = N[I[k] * 3 + c]; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return out;
}

// ------------------------------------------------------------------------------------------ bake settings
const TESS = 22;
/** per-material wear [curvature (1/m) mapped to full wear, cap]: the bronze rubs gold-brown on its ridges */
const WEAR = {
  '*:bronze_aged': [1 / 420, 0.75], '*:gold': [1 / 500, 0.55], '*:brass': [1 / 500, 0.55], '*:steel_blued': [1 / 900, 0.65],
  '*:steel_dark': [1 / 1000, 0.6], '*:steel': [1 / 800, 0.7], '*:steel_bright': [1 / 500, 0.7], '*:lacquer_red': [1 / 1200, 0.38],
  '*:wood': [1 / 700, 0.55], '*:black_chrome': [0, 0], '*:crystal': [0, 0], '*:glow_ice': [0, 0], '*:glow_gold': [0, 0], '*:paint_red': [1 / 900, 0.4],
  '*:bronze_cast': [1 / 380, 0.75], '*:bronze_dark': [1 / 450, 0.7], '*:wood_rose': [1 / 700, 0.5], '*:lacquer_carved': [1 / 1000, 0.42],
  '*:steel_stipple': [1 / 1200, 0.3], '*:silk_red': [0, 0], '*:rubber': [0, 0],
};

// ------------------------------------------------------------------------------------------ model
export default function build() {
  const g = new Gun('pulao');
  const RS1 = 212;                        // receiver front face
  const TT = -23, TR = 11.2;              // magazine tube axis / radius
  const BR = 10.6;                        // barrel radius
  const MUZ = 684;                        // bell lip
  const RL = 50;                          // bell lip radius (the card's Ø62, flared to Ø100 so it reads at the far end of the gun)
  const RACK_T = 38, RACK_W = 25.5;       // bell rack crossbar
  const BELLS = [23, 51, 79];             // bell hinge s
  const BK = 1.36;                        // the bells are drawn at Ø18 x 22 and enlarged about their hinge (first person: Ø24)

  // ======================================================================== receiver (blued steel)
  const recSec = [[-14.5, -34, 2], [14.5, -34, 2], [14.5, 7, 2.5], [13.3, 12.6, 3], [9, 15.5, 2.2], [-9, 15.5, 2.2], [-13.3, 12.6, 3], [-14.5, 7, 2.5]];
  let rec = SC(recSec, 0, RS1, { bevel: 1.3 });
  rec = cut(rec, [
    PF([[96, -5, 2.4], [162, -5, 2.4], [162, 11, 2.4], [96, 11, 2.4]], { w: 14, cw: 14, bevel: 0 }),          // ejection port (right)
    PF([[52, -40, 5], [152, -40, 5], [152, -25, 5], [52, -25, 5]], { w: 21, cw: 0, bevel: 0 }),                // loading port (bottom)
    cutters.holeS(0, 0, 9.3, RS1 - 30, RS1 + 5),                                                                 // chamber mouth
    // engraving panels sunk 1 mm (floor at |w| 13.5): left the full flank, right under the bells and under the port
    PF([[14, -27, 3], [188, -27, 3], [188, 8, 3], [14, 8, 3]], { w: 2.0, cw: -14.5, bevel: 0 }),
    PF([[14, -27, 3], [90, -27, 3], [90, 8, 3], [14, 8, 3]], { w: 2.0, cw: 14.5, bevel: 0 }),
    PF([[93, -27, 3], [191, -27, 3], [191, -9, 3], [93, -9, 3]], { w: 2.0, cw: 14.5, bevel: 0 }),
  ]);
  g.add(rec, 'steel_blued');
  // forged front bolster: the receiver thickens into a rolled collar where the barrel screws in, a gilt bead behind it
  {
    const bol = recSec.map(([w, t, r]) => [w * (1 + 0.9 / 14.5), t > 0 ? t + 0.8 : t - 0.6, r + 0.8]);
    g.add(SC(bol, 205.5, 212.6, { bevel: 1.6, bevelSeg: 3 }), 'steel_blued');
    for (const sd of [1, -1]) g.add(band([[204.6, -33.6], [204.6, 6.5], [204.2, 12.2]], 14.5 * sd, sd, 0.4, 0.5), 'gold');
  }
  // receiver rear + stock joint: a bronze escutcheon collar; the top tang runs back along the wrist (contoured, a
  // teardrop finial, one screw), the lower tang under the grip
  g.add(SC([[-15.2, -35, 2], [15.2, -35, 2], [15.2, 7, 2.5], [13.9, 13, 3], [9.4, 16.2, 2.2], [-9.4, 16.2, 2.2], [-13.9, 13, 3], [-15.2, 7, 2.5]], -6, 0.5, { bevel: 0.8 }), BZ);
  for (const sd of [1, -1]) for (const t of [-28, 4]) g.add(rivet([-2.8, t, 15.2 * sd], 1.1, sideAx(sd), 0.7), 'gold');
  // shell carrier (lifter) and the next shell's brass in the tube mouth, seen through the loading port
  g.add(box([102, -30.5, 0], [92, 1.6, 16], { r: 0.5 }), 'steel_bright');
  g.add(cut(box([102, -29.6, 0], [74, 1.2, 6], { r: 0.4 }), [cutters.box([102, -29.6, 0], [60, 3, 2.4])]), 'steel_bright');
  g.add(lax([[0, 0], [0, 10.3], [0.9, 10.3], [1.3, 9.3], [2.6, 9.3], [2.6, 0]], [149.5, TT, 0], '-s', 24), 'brass');
  g.add(lax([[0, 0], [0, 2.6], [0.5, 2.4], [0.5, 0]], [146.9, TT, 0], '-s', 14), 'copper');
  // ejection port: the chamber shoulder and a gilt bead round the opening (right)
  {
    const ep = [[95, -6, 3], [163, -6, 3], [163, 12, 3], [95, 12, 3]];
    const pts = [];
    for (let i = 0; i < 4; i++) { const a = ep[i], b = ep[(i + 1) % 4]; for (let k = 0; k < 6; k++) pts.push([a[0] + (b[0] - a[0]) * k / 6, a[1] + (b[1] - a[1]) * k / 6]); }
    pts.push(pts[0]);
    g.add(band(pts, 14.5, 1, 0.45, 0.45), 'gold');
  }
  // trigger plate group (dark steel) + bronze trigger guard with a 如意 cloud bow
  g.add(SC([[-12.6, -44, 1.5], [12.6, -44, 1.5], [12.6, -33, 0.5], [-12.6, -33, 0.5]], 6, 112, { bevel: 1 }), 'steel_dark');
  for (const sd of [1, -1]) for (const s of [16, 104]) { g.add(pinEnd([s, -38.5, 12.6 * sd], 2.1, sideAx(sd), 0.55), 'steel_bright'); g.add(pinEnd([s, -38.5, 12.6 * sd + sd * 0.55], 0.9, sideAx(sd), 0.4), 'steel_dark'); }
  {
    const GO = [[26, -44, 1], [98, -44, 1], [96, -51, 6], [86, -64, 10], [66, -68, 11], [40, -66, 11], [27, -56, 6], [22, -46, 1]];
    const guard = PF(GO, { w: 9, bevel: 1.6, bevelSeg: 2, holes: [[[36, -46, 3], [88, -46, 3], [82, -58, 7], [66, -62, 8], [44, -61, 8], [34, -52, 4]]] });
    g.add(guard, BZ);
    // cloud curl relief at the bow's front and a gilt bead along its outer edge
    for (const sd of [1, -1]) {
      g.add(band(cloudPts(80, -62.5, 2.2, -1), 4.5 * sd, sd, 0.32, 0.4), 'gold');
      g.add(band(cloudPts(36, -61.5, 2.0, 1), 4.5 * sd, sd, 0.3, 0.4), 'gold');
    }
    // the bead follows the bow's own outline, 0.45 inside its edge, so it seats into the bevel
    const bead = insetPoly(makeShape(GO).getPoints(5).map((v) => [v.x, v.y]), 0.45).filter(([, t]) => t < -45.2)
      .filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 0.3);
    g.add(ttube(bead.map(([s, t]) => [s, t, 0]), 0.75, 0.75, { radial: 6, seg: 40 }), 'gold');
  }
  // safety cross-bolt behind the trigger (red ring on the left), slide release lever (left, ahead of the guard)
  g.add(xform(cyl(-15.6, 15.6, 2.6, { seg: 14 }), { rot: [0, 90, 0], move: [10, -40, 0] }), 'steel_bright');
  g.add(xform(cyl(-1, 1, 2.9, { seg: 14 }), { rot: [0, 90, 0], move: [10, -40, -15.6] }), 'paint_red');
  g.add(xform(cyl(-1, 1, 2.9, { seg: 14 }), { rot: [0, 90, 0], move: [10, -40, 15.6] }), 'steel_bright');
  g.add(PF([[100, -40, 1], [114, -41, 1], [116, -46, 2], [104, -46.5, 2]], { w: 1.6, cw: -13.6, bevel: 0.5 }), 'steel_dark');
  // receiver pins / screws (both flanks), front ring screws
  for (const sd of [1, -1]) {
    for (const s of [8, 196]) g.add(slotted([s, -20, 14.5 * sd], 2.2, sd, 1.1, s === 8 ? 30 : -25), 'steel_bright');
    g.add(hexHead([200, 4, 14.5 * sd], 2.2, sideAx(sd), 0.9), 'steel_bright');
  }

  // ---- engraved panels (both flanks): a matted (stippled) ground 0.35 over the 1 mm pocket floor, v-cut scroll grooves
  // 0.3 deep with gilt wire laid in the main strokes, a beaded gilt frame. Left (the shooter's flank): scroll fields either
  // side of a cast bronze bell cartouche. Right: a 青海波 wave scene with the house mark under the bells, a scroll band
  // under the ejection port.
  const FLOOR = 13.5, GROUND = FLOOR + 0.35;
  /** one panel: ground face with grooves along `paths` (half width hw), gilt wire in the strokes with gild = true */
  const panel = (sd, s0, s1, t0, t1, paths, { hw = 0.56, beads = true, frameN = 8 } = {}) => {
    const gf = grooveField(paths, hw), o = 1.4, loop = [[s0 - o, t0 - o], [s1 + o, t0 - o], [s1 + o, t1 + o], [s0 - o, t1 + o]];
    const F = hfFace([{ pts: loop, tag: 'p' }], (s, t) => -0.27 * gf(s, t), {
      map: (x, y, z) => [x, y, sd * (GROUND + z)], walls: false, tol: 0.1, minCell: 0.4, maxCell: 8, edge: 2.4,
      decimate: { error: 0.24, normals: 0.45, lattice: 8 } });   // the lattice keeps triangles short: no shading streaks
    g.add(F.face, MT);
    const wires = [];
    for (const p of paths) if (p.gild !== false) wires.push(...wireT(thin(p.pts, 1.35), (f) => 0.5 * (p.w ?? 1) * (p.taper ? 1 - 0.7 * f : 1), -0.29, -0.02, { step: 2.4 }));
    if (wires.length) g.add(mapTris(wires, (u, v, z) => [u, v, sd * (GROUND + z)], 40), 'gold');
    // beaded gilt frame standing 0.5 over the ground
    const fr = [[s0 - 1.6, t0 - 1.6], [s1 + 1.6, t0 - 1.6], [s1 + 1.6, t1 + 1.6], [s0 - 1.6, t1 + 1.6]], frPts = [];
    for (let i = 0; i < 4; i++) { const a = fr[i], b = fr[(i + 1) % 4]; for (let k = 0; k < frameN; k++) frPts.push([a[0] + (b[0] - a[0]) * k / frameN, a[1] + (b[1] - a[1]) * k / frameN]); }
    frPts.push(frPts[0]);
    g.add(band(frPts, sd * FLOOR, sd, 0.45, 0.85), 'gold');
    if (beads) {
      const B = [];
      for (let s = s0 + 2.2; s <= s1 - 2; s += 5.4) for (const t of [t0 + 0.3, t1 - 0.3]) B.push(dome([s, t, sd * GROUND], [0, 0, sd], 0.6, 0.5, 5));
      for (let t = t0 + 4.5; t <= t1 - 4; t += 5) for (const s of [s0 + 0.3, s1 - 0.3]) B.push(dome([s, t, sd * GROUND], [0, 0, sd], 0.6, 0.5, 5));
      g.add(merge(B), 'gold');
    }
  };
  {
    // left: two scroll fields round the cartouche (a bell in relief, sound arcs either side)
    const sd = -1, C = [101, -9];
    const avoid = (s, t, r) => Math.hypot(s - C[0], t - C[1]) < 22 + r;
    const P = [...scrollPaths(19.5, 79, -23, 4, { waves: 2 }), ...scrollPaths(123, 182.5, -23, 4, { waves: 2 })];
    panel(sd, 17.5, 184.5, -24.4, 5.4, P);
    const M = bellMark(C[0], C[1], 1, -GROUND, sd, { relief: 1.4 });
    g.add(merge(M.body), BZ); g.add(merge(M.gold), 'gold');
    // roll-marks under the panel, cut and gilt
    g.add(rollMark('PULAO BELLROAR', 158, -30.4, 2.4, -14.5, sd), 'gold');
    g.add(rollMark('M08 12GA', 62, -30.4, 2.4, -14.5, sd), 'gold');
  }
  {
    // right, under the bells: 青海波 (three-ring wave scales) rising to the house mark between two wave crests
    const sd = 1, P = [];
    const R = 5.2;
    for (let j = 0; j < 3; j++) for (let i = -1; i < 9; i++) {
      const cs = 17.5 + i * 2 * R + (j % 2) * R, ct = -24.4 + j * R * 0.62;
      for (const f of [1, 0.68, 0.36]) {
        const pts = arcP(cs, ct, R * f, 8, 172, 9).filter(([s, t]) => s > 18 && s < 86 && t > -24 && t < -8);
        if (pts.length > 1) P.push({ pts, w: f > 0.9 ? 0.85 : 0.6, gild: f > 0.9 });
      }
    }
    for (const [cs, ct, k, f] of [[24, -6.5, 3.4, 1], [79, -6.5, 3.4, -1]]) P.push({ pts: cloudPts(cs, ct, k, f), w: 0.85 });
    panel(sd, 17.5, 87, -24.4, 5.4, P, { frameN: 6 });
    const M = bellMark(52, -4.2, 0.62, GROUND, sd, { relief: 1.1, arcs: 2 });
    g.add(merge(M.body), BZ); g.add(merge(M.gold), 'gold');
    // under the ejection port: a scroll band
    panel(sd, 96, 188, -24.4, -11.4, scrollPaths(97, 187, -24, -11.8, { waves: 3 }), { hw: 0.42, beads: false, frameN: 8 });
    // lower receiver: a gilt 回紋 meander band on the right, roll-marks on the left
    const out = [], t0 = -32.6, h = 2.6, u = 4.8;
    for (let x = 98; x + u * 0.8 <= 196; x += u) out.push(band([[x, t0 + h - 0.4], [x, t0 + 0.4], [x + u * 0.72, t0 + 0.4], [x + u * 0.72, t0 + h - 1.1], [x + u * 0.3, t0 + h - 1.1], [x + u * 0.3, t0 + 1.2]], 14.5 - 0.2, 1, 0.22, 0.3));
    g.add(merge(out), 'gold');
  }
  // 九子共鳴燈 (§1.3): Ø6 crystal in a gilt bezel on the left flank, front upper corner
  {
    const at = [198.5, -8, -14.5];
    g.add(lax([[0, 0], [0, 4.6], [0.9, 4.6], [1.7, 3.9], [1.7, 3.1], [0.9, 2.95], [0.9, 0]], at, '-w', 20), 'gold');
    for (let k = 0; k < 4; k++) { const a = (45 + k * 90) * D2R; g.add(dome([at[0] + Math.cos(a) * 3.85, at[1] + Math.sin(a) * 3.85, -16.1], [0, 0, -1], 0.42, 0.38, 5), 'steel_bright'); }
    const lamp = g.part('fx_resonance', { pivot: at, extras: { pv: { preset: 'pv_crystal', coreTint: '#c8843a', gem: 0.55 }, note: '九子共鳴燈: colour by the 九子 owned (bronze / teal / vermilion / gold), <= 0.4x the hero' } });
    lamp.add(sphere([at[0], at[1], at[2] - 0.7], 2.9, { seg: 14, scale: [1, 1, 0.8] }), 'crystal');
  }

  // ======================================================================== dragon saddle (bronze) + bell rack
  g.add(SC([[-9.6, 15.2, 0.5], [9.6, 15.2, 0.5], [9.6, 17.4, 1], [8.2, 19, 1], [-8.2, 19, 1], [-9.6, 17.4, 1]], 36, 158, { bevel: 1 }), BD);
  {
    // its top: a row of cast scale arcs along each edge (the dragon covers the middle), standing in the lighter bronze
    const T = [];
    for (const v of [-6.0, 6.0]) for (let u = 40; u <= 154; u += 4.4) T.push(...wireT(arcP(u, v, 2.6, 100, 260, 5), 0.6, -0.1, 0.42, { step: 4 }));
    g.add(mapTris(T, (u, v, z) => [u, 19 + z, v], 40), BZ);
  }
  for (const sd of [1, -1]) g.add(ttube([[37, 18.6, 8.7 * sd], [157, 18.6, 8.7 * sd]], 0.42, 0.42, { radial: 5, seg: 24, caps: false }), 'gold');
  for (const s of [42, 97, 152]) for (const sd of [1, -1]) g.add(rivet([s, 18.8, 6.2 * sd], 1.2, 't', 0.9), 'gold');
  // 回紋 meander on the saddle's left edge face
  {
    const out = [], t0 = 15.6, h = 2.8, u = 5.4, hw = 0.24, w = -9.6;
    for (let x = 40; x + u * 0.8 <= 155; x += u) out.push(band([[x, t0 + h - 0.4], [x, t0 + 0.6], [x + u * 0.72, t0 + 0.6], [x + u * 0.72, t0 + h - 1.2], [x + u * 0.3, t0 + h - 1.2], [x + u * 0.3, t0 + 1.4]], w, -1, hw, 0.3));
    g.add(merge(out), 'gold');
  }
  // the 鐘架 bell rack on the right top: two posts curving out from the receiver shoulder, a crossbar with cloud-curl
  // finials, three hooks
  {
    const posts = [];
    for (const s of [9, 93]) {
      posts.push(ttube([[s, 13.4, 11.6], [s, 21, 16.5], [s, 30, 22.5], [s, RACK_T, RACK_W]], 2.2, 1.8, { radial: 10, seg: 14 }));
      posts.push(lax([[0, 0], [0, 3.4], [1.4, 3.4], [2.2, 2.6], [2.2, 0]], [s, 12.6, 11.2], 't', 14));                // foot
      posts.push(dome([s, 13.6, 13.6], [0, 0.6, 1], 1.0, 0.8, 7));
    }
    g.add(merge(posts), BZ);
    g.add(ttube([[4, RACK_T, RACK_W], [98, RACK_T, RACK_W]], 2.0, 2.0, { radial: 12, seg: 30 }), BZ);
    for (const [s, f] of [[3, -1], [99, 1]]) {
      g.add(lax([[0, 0], [0, 2.6], [1.2, 2.8], [2.6, 2.0], [3.4, 0]], [s, RACK_T, RACK_W], f > 0 ? 's' : '-s', 14), BZ);
      const c = [];
      for (let i = 0; i <= 20; i++) { const a = (i / 20) * 1.6 * TAU, r = 3.4 * (1 - 0.6 * i / 20); c.push([s + f * (2.4 + 2.6 * Math.sin(a) * 0.4) + f * r * 0.2, RACK_T + 2.4 + r * Math.cos(a) * 0.9, RACK_W + r * Math.sin(a) * 0.6]); }
      g.add(ttube(c, 0.9, 0.5, { radial: 6, seg: 24 }), 'gold');
    }
    for (const s of BELLS) g.add(ttube([[s, RACK_T - 1.2, RACK_W], [s + 0.6, RACK_T - 2.6, RACK_W + 0.4], [s, RACK_T - 3.6, RACK_W]], 0.6, 0.6, { radial: 6, seg: 8 }), 'gold');
    for (const s of [9, 93]) g.add(ellip([s, RACK_T, RACK_W], [1, 0, 0], [0, 1, 0], [0, 0, 1], 2.8, 2.8, 2.8, 12), 'gold');
  }

  // ======================================================================== the coiled 蒲牢 (bronze, own static part)
  const dg = g.part('dragon');
  {
    // spine: the tail curls up into the ghost-ring rear sight (s 48, t 31.5), the body arches over the saddle (rear feet
    // s 66, front feet s 118), the neck rises to the head pivot (s 146)
    const RC = [48, 34.5], RR = 7.2, ring = [];
    for (let k = 0; k <= 10; k++) { const a = (215 - k * 30.5) * D2R; ring.push([RC[0] - Math.cos(a) * RR, RC[1] + Math.sin(a) * RR, 0]); }
    const pts = [...ring, [57, 26, 1.2], [66, 25.6, 3.0], [78, 31, 2.8], [91, 37.5, -2], [104, 35, -3.8], [117, 27.2, -1.2], [129, 27.4, 1.9], [139, 31.5, 1.4], [146.5, 34.5, 0]];
    const SP = new Spine(pts, (u, L) => (L < 30 ? 2.4 + 0.016 * L : lerp(2.9, 6.8, smooth(30, 72, L)) - 0.6 * smooth(112, 145, L) + 1.0 * smooth(150, 162, L)));
    const Lmax = SP.len;
    dg.add(SP.body(0, Lmax, { step: 1.9, M: 16 }), BZ);
    // tail tuft: three flame petals where the curl closes
    for (const [s, t, sw] of [[54.2, 30.2, -1], [54.2, 30.2, 1], [53.8, 31.4, 0]]) dg.add(petal([s, t, sw * 1.2], vnorm([0.75, 0.5, sw * 0.45]), [0, 1, 0], [0, 0, 1], 8.0, 2.0, 0.8, { bulge: 1.3, flick: 2.0, nu: 6, na: 6 }), BZ);
    // flank scale rows (cast, standing proud at their free edges towards the tail), belly plates underneath
    const map = SP.map(), sc = [];
    const L0 = 44, L1 = Lmax - 8;
    for (const [deg, row] of [[14, 0], [40, 1], [64, 2], [116, 2], [140, 1], [166, 0]]) {
      const a = deg * D2R, step = 3.8;
      for (let L = L0 + (row % 2) * 1.9; L <= L1; L += step) {
        const v = a * SP.r(L), k = 0.5 + 0.5 * smooth(L0, L0 + 22, L);
        sc.push(...scaleT(4.0 * k, 4.3 * k, (p, q) => [L + 2.0 - p, v + q], { lift: 0.6, th: 0.5, rim: 0.36, keel: 0.2, sink: 0.3 }));
      }
    }
    dg.add(mapTris(sc, map, 45), BZ);
    const belly = [];
    for (let L = L0; L <= L1; L += 2.8) belly.push(...ribbonT(arcP(0, 0, 1, -150, -30, 6).map(([x, y]) => [L, Math.atan2(y, x) * SP.r(L)]), 1.2, -0.2, 0.55, { step: 2.2, b: 0.25 }));
    dg.add(mapTris(belly, map, 50), BZ);
    // dorsal flame spines along the keel, leaning back
    for (let L = 52; L <= Lmax - 14; L += 6.2) {
      const f = SP.at(L), base = SP.surf(L, Math.PI / 2, -0.5), k = 0.8 + 0.6 * Math.sin(((L - 50) / (Lmax - 62)) * Math.PI);
      dg.add(petal(base, vnorm(vadd(f.N, vmul(f.T, -0.9))), vmul(f.T, -1), f.B, 6.8 * k, 2.0 * k, 0.7, { bulge: 1.1, flick: 1.9, nu: 6, na: 6 }), BZ);
    }
    // four legs: an elbow tuft, three claws gripping the saddle
    for (const [Lk, sFoot] of [[SP.S.find((x) => x.c[0] > 64).L, 66], [SP.S.find((x) => x.c[0] > 116).L, 118]]) {
      for (const sd of [1, -1]) {
        const root = SP.surf(Lk, sd > 0 ? -0.35 : Math.PI + 0.35, -0.8), knee = [sFoot - 2, 25, 9.6 * sd], foot = [sFoot + 2, 19.6, 9.4 * sd];
        dg.add(ttube([root, knee, foot], 2.4, 1.5, { radial: 8, seg: 10 }), BZ);
        dg.add(petal(knee, vnorm([-1, 0.5, 0.4 * sd]), [0, 0, sd], [0, 1, 0], 5.6, 1.6, 0.6, { bulge: 0.8, flick: 1.2, nu: 5, na: 6 }), BZ);
        for (const c of [-1, 0, 1]) dg.add(tooth([foot[0] + 1, 19.8, foot[2] + c * 1.5], vnorm([1, -0.15, c * 0.45]), [0, -1, 0], 4.0, 0.85, { radial: 6, seg: 4 }), 'gold');
      }
    }
  }

  // ======================================================================== 蒲牢 head (fx_pulao: rears up about the neck)
  // Authored at 1:1 round the neck, then scaled HKS about it (first person reads it at ~70 mm long). The cranium and the
  // upper jaw are one displaced superellipse loft (Pod): brow ridges overhanging deep eye sockets, the stop, a keeled
  // snout rising to an upturned 如意 nose with flared nostril cups, a lip line with the gum ridge the teeth seat in,
  // cheek bosses; cast scale plates on the snout and cheeks, scale bands under the jaw; forked antlers with a burr and
  // knob rings, grooved mane locks, ears, gill fins, whiskers rooted in gilt sockets.
  const NECK = [146.5, 28.4, 0], NECK2 = [146.5, 34.5, 0], HKS = 1.86;
  const G = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
  const H = new Pod([[143.5, 4.6, 31.4, 25.2, 2.2], [146.5, 6.4, 34.4, 25.0, 2.4], [150, 7.4, 36.4, 25.4, 2.5], [154, 7.8, 37.4, 26.0, 2.6],
    [158, 7.4, 37.2, 27.0, 2.6], [161, 6.4, 35.8, 27.8, 2.6], [164, 5.4, 34.4, 28.4, 2.7], [167, 5.0, 34.0, 28.9, 2.8], [170, 5.2, 34.7, 29.4, 2.8],
    [173, 5.6, 36.5, 30.0, 2.7], [175.5, 5.6, 38.0, 30.6, 2.6], [177.6, 5.0, 38.5, 31.3, 2.5], [179.3, 4.1, 37.8, 32.0, 2.4], [180.5, 2.0, 36.6, 32.7, 2.2]],
  (s, phi) => {
    let d = 0;
    d += 2.2 * G(phi, 50, 14) * smooth(150, 158.8, s) * (1 - smooth(159.4, 161.0, s));      // brow ridge, overhanging the eye
    d -= 1.05 * G(phi, 26, 11) * G(s, 161.8, 2.0);                                         // eye socket
    d -= 0.45 * G(phi, 90, 22) * G(s, 163.2, 1.6);                                         // the stop
    d += 0.55 * G(phi, 90, 7) * smooth(164, 167, s) * (1 - smooth(171, 173, s));           // snout keel
    d += 1.3 * G(phi, -12, 16) * G(s, 152.5, 3.2);                                         // cheek boss
    const lip = smooth(155, 158, s) * (1 - smooth(178.5, 180, s));
    d -= 0.5 * G(phi, -48, 4.5) * lip;                                                     // lip line
    d += 0.6 * G(phi, -63, 5.5) * lip;                                                     // gum ridge
    d += 1.4 * G(phi, 26, 18) * G(s, 176.6, 1.9);                                          // nostril flare
    d += 0.9 * G(phi, 90, 16) * G(s, 176.4, 2.2);                                          // the 如意 nose pad
    d += 0.7 * G(phi, 90, 9) * G(s, 155.5, 2.6);                                           // 尺木 boss on the brow
    return d;
  });
  const head = g.part('fx_pulao', { pivot: NECK, extras: { open: 30, hinge: 'w', note: '蒲牢 head: v 1 = rears up 30° (roar / ready / first draw)' } });
  {
    head.add(H.body(0.8, 40), BZ);
    const am = (phi, sd) => (sd > 0 ? phi : 180 - phi) * D2R;                              // section angle of an elevation, per side
    const hmap = (sd) => (u, v, z) => H.surf(u, am(v / 5 / D2R, sd), z);                     // design space: v = elevation x 5 mm
    for (const sd of [1, -1]) {
      // scale plates: three rows on the snout flank, two on the cheek (tips back, standing proud at the free edge)
      const S = [];
      for (const [phi, s0, s1, L] of [[10, 165, 173, 2.3], [32, 165, 173.5, 2.3], [56, 165.5, 172.5, 2.1], [-6, 145.5, 155.5, 2.8], [-30, 147, 155, 2.6]]) {
        const v = phi * D2R * 5, row = Math.round(phi / 20) & 1;
        for (let s = s0 + row * L * 0.5; s <= s1; s += L * 0.95) S.push(...scaleT(L, L * 1.05, (p, q) => [s + L / 2 - p, v + q], { lift: 0.35, th: 0.3, rim: 0.2, keel: 0.12, sink: 0.25 }));
      }
      head.add(mapTris(S, hmap(sd), 45), BZ);
      // eye: polished black under the brow, a gilt ring, upper / lower lids
      const E0 = H.surf(161.8, am(26, sd), 0), En = H.nrm(161.8, am(26, sd)), Ec = vadd(E0, vmul(En, -0.5));
      const Ex = vnorm(vsub(H.surf(162.8, am(26, sd), 0), H.surf(160.8, am(26, sd), 0))), Ey = vnorm(vcross(En, Ex)), up = Ey[1] > 0 ? 1 : -1;
      head.add(sphere(Ec, 2.05, { seg: 16 }), 'gold');
      head.add(ellip(vadd(Ec, vmul(En, 1.72)), Ex, Ey, En, 0.42, 1.25, 0.42, 10), 'black_chrome');
      const lid = (a0, a1, R, r, lift) => ttube(Array.from({ length: 9 }, (_, i) => { const a = (a0 + (a1 - a0) * i / 8) * D2R; return vadd(Ec, vadd(vmul(En, lift), vadd(vmul(Ex, Math.cos(a) * R), vmul(Ey, up * Math.sin(a) * R)))); }), r, r * 0.6, { radial: 7, seg: 16 });
      head.add(lid(5, 175, 2.4, 0.8, 1.15), BZ);
      head.add(lid(200, 330, 2.35, 0.42, 0.8), BZ);
      // brow flame flicking back off the ridge
      head.add(petal(H.surf(159.4, am(56, sd), -0.3), vnorm([-1, 0.4, 0.3 * sd]), [0, 1, 0], [0, 0, 1], 8.5, 1.5, 0.75, { bulge: 1.3, flick: 2.0, nu: 7, na: 8, groove: 0.4 }), BZ);
      // nostril cups: a flared rim round a dark hole
      const Np = H.surf(178.2, am(34, sd), -0.2), Nn = vnorm(vadd(H.nrm(178.2, am(34, sd)), [1.1, 0.4, 0]));
      head.add(along([[-0.5, 0.6], [-0.5, 1.0], [0.2, 1.25], [0.7, 1.2], [0.95, 0.9], [0.8, 0.62], [0.3, 0.55], [-0.5, 0.6]], Np, Nn, 14), BZ);
      head.add(sphere(vadd(Np, vmul(Nn, 0.15)), 0.62, { seg: 8 }), 'black_chrome');
      // whisker in its gilt socket on the upper lip, sweeping back and curling
      const Wr = H.surf(174.5, am(-34, sd), 0), Wn = H.nrm(174.5, am(-34, sd));
      head.add(along([[-0.4, 0.95], [0.15, 1.15], [0.5, 0.95], [0.45, 0.55], [-0.4, 0.55], [-0.4, 0.95]], Wr, Wn, 12), 'gold');
      head.add(ttube([vadd(Wr, vmul(Wn, 0.3)), [Wr[0] + 1.5, Wr[1] - 1.8, Wr[2] + sd * 3.0], [Wr[0] - 1, Wr[1] - 3.6, Wr[2] + sd * 7.5], [Wr[0] - 8, Wr[1] - 3.2, Wr[2] + sd * 11.5],
        [Wr[0] - 16, Wr[1] - 0.4, Wr[2] + sd * 12.5], [Wr[0] - 21, Wr[1] + 3.6, Wr[2] + sd * 10.5], [Wr[0] - 20, Wr[1] + 6.4, Wr[2] + sd * 8.2]], 0.55, 0.16, { radial: 6, seg: 30 }), 'gold');
      // upper teeth seated in the gum ridge, the big fang at the front
      for (let s = 162; s <= 175.5; s += 2.3) head.add(tooth(H.surf(s, am(-64, sd), -0.35), vnorm([0.05, -1, 0.12 * sd]), [-1, 0, 0], 1.3 + 0.25 * Math.sin(s), 0.5, { radial: 6, seg: 3 }), 'gold');
      head.add(tooth(H.surf(177.8, am(-62, sd), -0.4), vnorm([0.25, -1, 0.1 * sd]), [-1, 0, 0], 4.4, 0.95, { radial: 8, seg: 6, groove: 0.25 }), 'gold');
      // antlers: a burr at the root, a fluted main beam back and up with knob rings, a front tine, a forked tip
      const r0 = H.surf(153.6, am(72, sd), -0.4);
      const beam = [r0, vadd(r0, [-3.4, 2.6, 1.4 * sd]), vadd(r0, [-8, 4.6, 2.4 * sd]), vadd(r0, [-13.5, 6.4, 3.0 * sd]), vadd(r0, [-18.5, 7.2, 2.6 * sd])];
      head.add(ftube(beam, (u) => lerp(1.65, 0.55, u), { radial: 10, seg: 22, flutes: 5, depth: 0.12 }), BZ);
      head.add(ftube([beam[3], vadd(beam[3], [-0.8, 2.6, 1.0 * sd]), vadd(beam[3], [-0.2, 5.0, 1.6 * sd])], (u) => lerp(0.75, 0.3, u), { radial: 8, seg: 8, flutes: 4, depth: 0.1 }), BZ);
      head.add(ftube([beam[1], vadd(beam[1], [1.2, 2.8, 0.6 * sd]), vadd(beam[1], [3.0, 5.6, 1.2 * sd])], (u) => lerp(0.95, 0.35, u), { radial: 8, seg: 10, flutes: 4, depth: 0.1 }), BZ);
      const knob = (p, q, r) => along([[-0.45, r - 0.15], [0, r + 0.35], [0.45, r - 0.15], [0, r - 0.4], [-0.45, r - 0.15]], p, vnorm(vsub(q, p)), 14);
      head.add(merge([knob(r0, beam[1], 1.75), knob(vlerp3(beam[1], beam[2], 0.6), beam[2], 1.32), knob(vlerp3(beam[2], beam[3], 0.6), beam[3], 1.0)]), 'gold');
      for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU; head.add(dome(vadd(r0, [Math.cos(a) * 1.9, 0.4, Math.sin(a) * 1.9]), vnorm([Math.cos(a), 0.6, Math.sin(a)]), 0.5, 0.4, 5), BZ); }
      // ear (cupped) and gill fins off the jaw hinge
      head.add(petal(H.surf(150.5, am(58, sd), -0.4), vnorm([-0.8, 0.55, 0.45 * sd]), vnorm([0, -0.3, sd]), [0, 1, 0], 6.4, 2.1, 0.6, { bulge: 0.9, flick: 1.0, nu: 6, na: 8, groove: 0.45 }), BZ);
      for (const [phi, L, up2] of [[-6, 8.0, 0.35], [-24, 7.0, 0.05], [-40, 5.6, -0.25]]) head.add(petal(H.surf(149.5, am(phi, sd), -0.4), vnorm([-1, up2, 0.4 * sd]), vnorm([0, 0.2, sd]), [0, 1, 0], L, 1.5, 0.55, { bulge: 1.1, flick: 2.2, nu: 6, na: 8, groove: 0.35 }), BZ);
      // mane: two layers of grooved flame locks flowing back over the neck
      const lock = (s, phi, L, up2, W, th, o) => petal(H.surf(s, am(phi, sd), -0.6), vnorm([-1, up2, 0.32 * sd]), vnorm([0, Math.sin(phi * D2R), sd * Math.cos(phi * D2R)]),
        vnorm([0, Math.cos(phi * D2R), -sd * Math.sin(phi * D2R)]), L, W, th, o);
      for (const [phi, L, up2, W] of [[84, 11.5, 0.7, 2.0], [66, 11, 0.5, 2.2], [46, 10, 0.3, 2.2], [26, 9, 0.1, 2.0], [8, 8, -0.05, 1.8]]) head.add(lock(147, phi, L, up2, W, 0.8, { bulge: 1.6, flick: 2.6, nu: 7, na: 8, groove: 0.4 }), BZ);
      for (const [phi, L, up2] of [[75, 8, 0.85], [55, 8.5, 0.55], [35, 7.5, 0.35]]) head.add(lock(150.5, phi, L, up2, 1.5, 0.6, { bulge: 1.2, flick: 2.2, nu: 7, na: 8, groove: 0.4 }), BZ);
    }
    head.add(petal(H.surf(146.5, Math.PI / 2, -0.6), vnorm([-1, 0.75, 0]), [0, 1, 0], [0, 0, 1], 12, 2.0, 0.8, { bulge: 1.6, flick: 2.8, nu: 7, na: 8, groove: 0.4 }), BZ);
    // the 如意 nose: two cloud curls cast on the pad, rolling outwards from the keel, a lobe between them (gilt edge)
    {
      const top = (u, v, z) => H.surf(u, Math.PI / 2 - v / 5.2, z), T = [];
      for (const f of [1, -1]) {
        const arc = arcP(176.3, f * 1.9, 1.9, f > 0 ? 200 : 160, f > 0 ? -110 : 470, 14).map(([u, v], i, a) => { const k = 1 - 0.45 * i / a.length; return [176.3 + (u - 176.3) * k, f * 1.9 + (v - f * 1.9) * k]; });
        T.push(...ribbonT([[174.4, f * 0.3], ...arc], (q) => 1.0 * (1 - 0.4 * q), -0.2, 0.75, { step: 0.7, b: 0.25 }));
      }
      T.push(...ribbonT(arcP(178.2, 0, 1.0, 250, 110, 6), 0.75, -0.2, 0.6, { step: 0.7, b: 0.2 }));
      head.add(mapTris(T, top, 40), BZ);
    }
    // the lower jaw (fx_jaw): opens further on ready / roar; tongue, teeth, beard and the scale bands ride on it
    const JAW = [151, 26.6, 0];
    const J = new Pod([[149, 4.6, 27.4, 22.8, 2.4], [153, 5.4, 27.6, 22.4, 2.5], [158, 5.4, 27.6, 22.6, 2.6], [163, 4.9, 27.5, 23.1, 2.6], [168, 4.3, 27.3, 23.7, 2.6],
      [173, 3.7, 27.0, 24.3, 2.5], [176.5, 3.0, 26.9, 24.8, 2.4], [178.6, 2.0, 26.9, 25.3, 2.3], [179.8, 1.0, 26.9, 25.8, 2.2]],
    (s, phi) => { const k = smooth(152, 155, s) * (1 - smooth(177.5, 179.5, s)); return 0.55 * G(phi, 62, 6) * k - 0.4 * G(phi, 46, 4) * k + 0.6 * G(phi, -20, 14) * G(s, 153, 2.6); });
    const jaw = g.part('fx_jaw', { parent: 'fx_pulao', pivot: JAW, extras: { open: -22, hinge: 'w', note: 'lower jaw: v 1 = 22° wider (ready every 2.5 s / roar)' } });
    const JR = { rot: [-10, 0, 0], pivot: JAW };   // rests a little open: it is always roaring
    jaw.add(xform(J.body(0.7, 36), JR), BZ);
    jaw.add(xform(podLoft([[155, 2.6, 27.8, 26.4, 2], [162, 2.8, 28.0, 26.6, 2], [168, 2.4, 28.2, 26.8, 2], [174, 1.6, 28.6, 27.4, 2], [176.4, 0.6, 28.9, 28.0, 2]], { M: 14 }), JR), 'lacquer_red');   // tongue
    {
      // scale bands across the underside of the jaw
      const B = [], jm = (u, v, z) => J.surf(u, v / 4, z);
      for (let s = 153; s <= 175.5; s += 2.5) B.push(...ribbonT([[s, -150 * D2R * 4], [s - 0.5, -90 * D2R * 4], [s, -30 * D2R * 4]], 1.25, -0.25, 0.45, { step: 0.9, b: 0.2 }));
      jaw.add(xform(mapTris(B, jm, 50), JR), BZ);
    }
    const ja = (phi, sd) => (sd > 0 ? phi : 180 - phi) * D2R;
    for (const sd of [1, -1]) {
      jaw.add(xform(tooth(J.surf(177.4, ja(64, sd), -0.4), vnorm([0.2, 1, 0.08 * sd]), [-1, 0, 0], 3.6, 0.85, { radial: 8, seg: 5, groove: 0.25 }), JR), 'gold');
      for (let s = 163; s <= 175; s += 2.3) jaw.add(xform(tooth(J.surf(s, ja(64, sd), -0.35), vnorm([0, 1, 0.1 * sd]), [-1, 0, 0], 1.2, 0.45, { radial: 6, seg: 3 }), JR), 'gold');
      // beard: grooved tufts under the chin
      for (const [s, L] of [[160, 6.5], [165, 5.5], [170, 4.2]]) jaw.add(xform(petal(J.surf(s, ja(-70, sd), -0.4), vnorm([-0.55, -1, 0.25 * sd]), [-1, 0, 0], [0, 0, 1], L, 1.3, 0.5, { bulge: 1.0, flick: 1.6, nu: 6, na: 8, groove: 0.35 }), JR), BZ);
    }
  }

  // the head at rest: raised 12° and turned 15° towards the shooter (the -w flank faces the eye at hip), so 蒲牢 shows
  // its face instead of a tuft of antlers and mane; the sockets take the same matrix
  const HM = (() => {
    const n0 = V(...NECK), n1 = V(...NECK2);
    const R = new THREE.Matrix4().makeRotationY(15 * D2R).multiply(new THREE.Matrix4().makeRotationX(12 * D2R));
    return new THREE.Matrix4().makeTranslation(n1.x, n1.y, n1.z).multiply(R).multiply(new THREE.Matrix4().makeScale(HKS, HKS, HKS)).multiply(new THREE.Matrix4().makeTranslation(-n0.x, -n0.y, -n0.z));
  })();
  for (const name of ['fx_pulao', 'fx_jaw']) { for (const list of g.part(name).geos.values()) for (const geo of list) geo.applyMatrix4(HM); g.part(name).pivot.applyMatrix4(HM); }
  // ======================================================================== three hanging bells (fx_bell1..3)
  // each: lip at t 8.5 (22 mm under the hinge), Ø18; gilt lip bead, a shoulder band, a belt of 8 bosses, cloud curls,
  // the hanging loop on the rack hook, a clapper inside; its gilt bead fx_litN shows only while that bell shell is loaded
  BELLS.forEach((s, i) => {
    const hinge = [s, RACK_T - 3.6, RACK_W];
    const b = g.part(`fx_bell${i + 1}`, { pivot: hinge, extras: { swing: 'pendulum', len: 0.02, order: i, note: `bell ${i + 1}: pendulum on its top ring; lit (fx_lit${i + 1}) = a loaded bell shell` } });
    const lip = hinge[1] - 24, at = [s, lip, RACK_W];
    // a 梵鐘 in miniature: rolled lip moulding, 篆帶 bands framing four upper panels of 3 x 3 枚 bosses, two plain 鉦
    // panels with a cloud each and two lotus striking bosses below
    const out = [[0, 9.3], [0.45, 9.75], [1.4, 9.9], [2.3, 9.45], [2.9, 8.6], [3.6, 8.15], [7, 7.55], [12, 7.4], [16, 7.1], [18.6, 6.1], [20.2, 4.4], [21.2, 2.4], [21.6, 0]];
    const inn = [[19.6, 0], [18.6, 4.6], [15, 6.3], [9, 6.5], [3.4, 7.2], [1.2, 8.3], [0, 8.6]];
    b.add(lax([...out, ...inn, [0, 9.3]], at, 't', 28), BZ);
    b.add(lax([[-0.5, 9.75], [0, 10.25], [0.5, 9.75], [0, 9.5], [-0.5, 9.75]], [s, lip + 1.4, RACK_W], 't', 28), 'gold');        // lip bead
    b.add(lax([[-0.5, 6.95], [0, 7.45], [0.5, 6.95], [0, 6.8], [-0.5, 6.95]], [s, lip + 16.6, RACK_W], 't', 24), 'gold');         // shoulder band
    const Rb = curveFn([[3.6, 8.15], [7, 7.55], [12, 7.4], [16, 7.1], [18.6, 6.1]]), R0 = 7.45, C = TAU * R0;
    const bmap = (u, v, z) => { const a = u / R0, r = Rb(v - lip) + z; return [s + r * Math.cos(a), v, RACK_W + r * Math.sin(a)]; };
    const Z = [], Gd = [];
    for (const v of [4.6, 10.4, 15.6]) Z.push(...ribbonT([[0, lip + v], [C * 0.25, lip + v], [C * 0.5, lip + v], [C * 0.75, lip + v], [C, lip + v]], 0.75, -0.2, 0.42, { step: 3.6, b: 0.15, closed: false }));
    for (let k = 0; k < 4; k++) Z.push(...ribbonT([[C * (k / 4 + 0.125), lip + 4.6], [C * (k / 4 + 0.125), lip + 15.6]], 0.75, -0.2, 0.42, { step: 3, b: 0.15 }));
    for (let k = 0; k < 4; k++) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const u = C * (k / 4 + 0.25) + (i - 1) * 2.15, v = lip + 11.6 + j * 1.55;
      Gd.push(dome(bmap(u, v, -0.1), vnorm([Math.cos(u / R0), 0, Math.sin(u / R0)]), 0.52, 0.55, 5));
    }
    for (const k of [1, 3]) Z.push(...ribbonT(cloudPts(C * (k / 4 + 0.25) - 0.85 * (k === 1 ? 1 : -1), lip + 7.3, 1.25, k === 1 ? 1 : -1), 0.55, -0.15, 0.4, { step: 0.8, b: 0.12 }));
    b.add(mapTris(Z, bmap, 40), BZ);
    b.add(merge(Gd), BZ);
    for (const k of [0, 2]) {
      const u = C * (k / 4 + 0.25), c = bmap(u, lip + 7.5, 0), n = vnorm([Math.cos(u / R0), 0, Math.sin(u / R0)]);
      b.add(dome(c, n, 1.25, 0.8, 12), 'gold');
      const P = [];
      for (let q = 0; q < 8; q++) { const a = (q / 8) * TAU; P.push(dome(bmap(u + Math.cos(a) * 1.85, lip + 7.5 + Math.sin(a) * 1.85, -0.05), n, 0.55, 0.38, 6)); }
      b.add(merge(P), BZ);
    }
    // crown knob and the hanging loop round the hook
    b.add(lax([[0, 0], [0, 2.6], [0.9, 2.4], [1.6, 1.4], [2.0, 0]], [s, lip + 21.4, RACK_W], 't', 12), BZ);
    b.add(xform(lathe([[-0.7, 2.4], [0, 3.1], [0.7, 2.4], [0, 1.7], [-0.7, 2.4]], { seg: 14 }), { rot: [0, 90, 0], move: [s, hinge[1] - 0.6, RACK_W] }), BZ);
    // clapper: rod + ball (dark bronze); the gilt bead over it is its own part
    b.add(cyl(0, 12.5, 0.55, { seg: 6 }).rotateX(Math.PI / 2).translate(RACK_W, lip + 6, -s), 'steel_dark');
    b.add(sphere([s, lip + 4.6, RACK_W], 1.9, { seg: 10 }), BZ);
    const lit = g.part(`fx_lit${i + 1}`, { parent: `fx_bell${i + 1}`, pivot: [s, lip + 4.6, RACK_W], extras: { note: 'gilt clapper bead: hidden while that bell shell is not loaded' } });
    lit.add(sphere([s, lip + 4.6, RACK_W], 2.25, { seg: 12 }), 'glow_gold');
    // a glowing bead round the rim's edge: the loaded bell reads from the side at hip, not only from below
    lit.add(lax([[-0.6, 9.0], [-0.3, 9.6], [0.3, 9.9], [0.8, 9.5], [0.7, 8.7], [0.0, 8.5], [-0.6, 9.0]], at, 't', 28), 'glow_gold');
    // and a glowing collar over the gilt shoulder band (faces up: the count reads from the eye above the gun at hip)
    lit.add(lax([[15.7, 7.15], [16.1, 7.75], [17.1, 7.7], [17.5, 7.05], [16.6, 6.95], [15.7, 7.15]], at, 't', 28), 'glow_gold');
  });
  BELLS.forEach((s, i) => {
    const hp = V(s, RACK_T - 3.6, RACK_W), M = new THREE.Matrix4().makeTranslation(hp.x, hp.y, hp.z).multiply(new THREE.Matrix4().makeScale(BK, BK, BK)).multiply(new THREE.Matrix4().makeTranslation(-hp.x, -hp.y, -hp.z));
    for (const name of [`fx_bell${i + 1}`, `fx_lit${i + 1}`]) for (const list of g.part(name).geos.values()) for (const geo of list) geo.applyMatrix4(M);
    g.part(`fx_lit${i + 1}`).pivot.applyMatrix4(M);
  });
  g.socket('bells', [51, RACK_T - 16, RACK_W]);
  BELLS.forEach((s, i) => g.socket(`bell${i + 1}`, [s, RACK_T - 19, RACK_W]));
  // under the bell lips, a little outboard: the inspect's flicking hand stays below the bells it shows
  g.socket('bells_low', [51, -6, RACK_W + 6]);
  BELLS.forEach((s, i) => g.socket(`bell${i + 1}_low`, [s, -4, RACK_W + 5]));

  // ======================================================================== barrel, tube, cap (blued) and the bell mouth (bronze)
  // the barrel carries a slim bronze whisker rib on cloud-curl posts, a cast band, gold damascene scrolls past the
  // receiver nut and ahead of the clamp; a figure-8 band and the cast clamp tie it to the tube, whose exposed run wears an
  // engraved bronze sleeve bound in red silk cord. The crown sits deep in the bell's throat.
  g.add(lathe([[RS1 - 1, 9.3], [RS1 - 1, 12.4], [RS1, 12.9], [RS1 + 16, 12.9], [RS1 + 18, 11.6], [RS1 + 19, BR], [645, BR], [646.2, BR - 0.8], [646.2, 9.25], [RS1 - 1, 9.25]], { seg: 32 }), 'steel_dark');
  g.add(lathe([[600, 0], [600, 9.2], [601.5, 9.2], [601.5, 0]], { seg: 24 }), 'rubber');   // matte plug deep in the bore
  for (const s of [236, 241]) g.add(lathe([[s - 0.6, BR - 0.1], [s, BR + 0.42], [s + 0.6, BR - 0.1]], { seg: 32 }), 'gold');
  // receiver nut: a knurled ring
  g.add(revolve([[RS1 + 3, 12.6], [RS1 + 3.6, 13.3], [RS1 + 12.4, 13.3], [RS1 + 13, 12.6]], { M: 64, mod: (s, a) => [0, s > RS1 + 3.4 && s < RS1 + 12.6 ? 0.28 * Math.cos(a * 32) : 0] }), 'steel_blued');
  /** cast band round the barrel / tube axis (t0): a plateau ring with gilt beads at its edges and n cloud curls on it */
  const castBand = (c, R, { t0 = 0, hw = 4, rise = 1.2, n = 8, k = 2.4, skip = null, part = g } = {}) => {
    part.add(revolve([[c - hw, R - 0.6], [c - hw, R + rise - 0.5], [c - hw + 0.5, R + rise], [c + hw - 0.5, R + rise], [c + hw, R + rise - 0.5], [c + hw, R - 0.6]], { t: t0, M: 48 }), BZ);
    for (const e of [-1, 1]) part.add(revolve([[c + e * hw - 0.5, R + rise - 0.3], [c + e * hw, R + rise + 0.25], [c + e * hw + 0.5, R + rise - 0.3], [c + e * hw, R + rise - 0.6]], { t: t0, M: 48 }), 'gold');
    const T = [], Rt = R + rise, C = TAU * Rt;
    for (let i = 0; i < n; i++) {
      const u = (i / n) * C, f = i % 2 ? -1 : 1;
      if (skip && skip((u / Rt) / D2R)) continue;
      T.push(...ribbonT(thin(cloudPts(u - f * 0.85 * k, c - 0.1 * k, k, f), 0.9), (q) => 0.95 * (1 - 0.35 * q), -0.2, 0.9, { step: 1.6, b: 0.25 }));
    }
    if (T.length) part.add(mapTris(T, sMap(Rt, { t0 }), 40), BZ);
  };
  // band 1: barrel only (the tube runs 1.2 mm under it; the racked pump slides beneath), curls on its upper part
  castBand(302, BR, { hw: 3.6, rise: 1.15, n: 9, k: 2.0, skip: (a) => a > 215 && a < 325 });
  // figure-8 band 2 and the clamp: barrel and tube in one casting, a web between them, the clamp with a cloud lug
  for (const [s0, s1, lug] of [[466, 474, false], [550, 562, true]]) {
    const ring = (t0, R) => revolve([[s0, R], [s0, R + 1.4], [s0 + 0.6, R + 2.0], [s1 - 0.6, R + 2.0], [s1, R + 1.4], [s1, R]], { t: t0, M: 40 });
    g.add(merge([ring(0, BR), ring(TT, TR), SC([[-6.2, TT + 9.5, 1], [6.2, TT + 9.5, 1], [6.2, -9.2, 1], [-6.2, -9.2, 1]], s0 + 0.4, s1 - 0.4, { bevel: 0.6 })]), BZ);
    const T = [];
    for (let i = 0; i < 5; i++) { const u = (i / 4 - 0.5) * 2.2 * (BR + 2), j = i % 2 ? -1 : 1; T.push(...ribbonT(thin(cloudPts(u - 0.85 * 1.6 * j, (s0 + s1) / 2 - 0.2, 1.6, j), 0.8), 0.75, -0.2, 0.6, { step: 1.6, b: 0.2 })); }
    g.add(mapTris(T, sMap(BR + 2.0, { a0: 90 }), 40), 'gold');
    if (lug) {
      g.add(PF([[s0 + 1, TT - 12, 2], [s1 - 1, TT - 12, 2], [s1 + 1.5, TT - 15.5, 3], [(s0 + s1) / 2, TT - 20.5, 4], [s0 - 1.5, TT - 15.5, 3]], { w: 6, bevel: 1.0, bevelSeg: 2 }), BZ);
      for (const sd of [1, -1]) g.add(band(cloudPts((s0 + s1) / 2 - 1.8 * sd, TT - 16, 1.6, sd), 3 * sd, sd, 0.32, 0.4), 'gold');
      g.add(hexHead([(s0 + s1) / 2, TT - 16.5, 3], 1.7, 'w', 1.1), 'steel_bright');
    }
  }
  // whisker rib: a crowned bronze strip on cloud-curl posts, a gilt line down its crown and a gilt wave on each side
  {
    const R0 = BR + 3.4;
    g.add(SC([[-2.3, R0, 0.3], [2.3, R0, 0.3], [2.75, R0 + 0.9, 0.4], [2.3, R0 + 2.6, 0.9], [-2.3, R0 + 2.6, 0.9], [-2.75, R0 + 0.9, 0.4]], 233, 557, { bevel: 0.8, bevelSeg: 2 }), BZ);
    g.add(ttube([[234, R0 + 2.62, 0], [556, R0 + 2.62, 0]], 0.32, 0.32, { radial: 5, seg: 40, caps: true }), 'gold');
    for (const sd of [1, -1]) {
      const wave = [];
      for (let s = 236; s <= 554; s += 3) wave.push([s, R0 + 1.2 + 0.45 * Math.sin((s - 236) * 0.42)]);
      g.add(band(wave, 2.66 * sd, sd, 0.2, 0.18), 'gold');
    }
    for (const s of [262, 342, 422, 512]) {
      g.add(band(cloudPts(s - 1.6, BR + 1.9, 1.45, 1), -1.5, 1, 0.65, 3.0), BZ);
      g.add(PF([[s - 2.4, BR - 0.6, 0.8], [s + 2.6, BR - 0.6, 0.8], [s + 1.6, BR + 1.0, 0.8], [s - 1.4, BR + 1.0, 0.8]], { w: 3.6, bevel: 0.5 }), BZ);
    }
  }
  // gold damascene: scroll wire laid flush in the blued barrel, either side of the rib, past the nut and before the clamp
  {
    const W = [], WR = [];
    for (const [s0, s1] of [[245, 296], [480, 546]]) {
      const P = scrollPaths(s0, s1, -7.6, 7.6, { waves: 2 }).filter((p) => p.w > 0.7 || p.taper);
      for (const p of P) (s0 > 400 ? WR : W).push(...wireT(thin(p.pts, 1.4).map(([s, t]) => [t, s]), (f) => 0.46 * (p.w ?? 1) * (p.taper ? 1 - 0.7 * f : 1), -0.1, 0.09, { step: 1.5 }));
    }
    g.add(mapTris([...W, ...WR], sMap(BR, { a0: 155 }), 40), 'gold');
    g.add(mapTris(WR, sMap(BR, { a0: 25 }), 40), 'gold');
  }
  // magazine tube + cap (bronze knob with a knurled ring) + swivel
  g.add(tube(RS1 - 2, 566, TR, TR - 1.2, { t: TT, seg: 28 }), 'steel_dark');
  g.add(revolve([[565, TR - 0.4], [565, 12.4], [567, 13.0], [573, 13.0], [574, 12.2], [576, 12.2], [577, 13.2], [584, 13.2], [585, 12.2], [592, 10.8], [596, 8.2], [597.6, 4.6], [598, 0.5], [565, 0.5]], {
    t: TT, M: 40, mod: (s, a) => [0, s > 577.2 && s < 583.8 ? 0.35 * Math.cos(a * 30) : 0] }), BZ);
  {
    const c = [];
    for (let k = 0; k < 6; k++) c.push(...curlT(k * 10.4, 590, 1.6, k % 2 ? 1 : -1, 0, -0.2, 0.35, 0.55));
    g.add(mapTris(c, sMap((s) => 12.2 - (s - 585) * 0.2, { t0: TT, a0: 0 }), 40), 'gold');
  }
  g.add(xform(lathe([[-0.9, 4.0], [0, 4.9], [0.9, 4.0], [0, 3.1], [-0.9, 4.0]], { seg: 16 }), { rot: [0, 90, 0], move: [588, TT - 16.5, 0] }), 'steel_bright');
  g.add(box([588, TT - 13, 0], [6, 4, 3.4], { r: 1 }), 'steel_dark');
  // the tube's exposed run: an engraved bronze sleeve (a 回紋 belt between gilt beads), red silk cord bound at both ends
  {
    const Rs = TR + 0.35;
    g.add(revolve([[476, TR - 0.2], [476, Rs - 0.3], [476.6, Rs + 0.3], [548.4, Rs + 0.3], [549, Rs - 0.3], [549, TR - 0.2]], { t: TT, M: 36 }), BZ);
    for (const s of [493.5, 531.5]) g.add(revolve([[s - 0.5, Rs + 0.2], [s, Rs + 0.7], [s + 0.5, Rs + 0.2], [s, Rs]], { t: TT, M: 40 }), 'gold');
    g.add(mapTris(thunderT(0, TAU * (Rs + 0.3), 495.5, 529.5, -0.15, 0.4, { lw: 0.8, gap: 0.75 }), sMap(Rs + 0.3, { t0: TT }), 40), BZ);
    for (const [s0, turns] of [[478, 11], [536.4, 11]]) {
      const P = [], n = turns * 14, pitch = 1.0, Rc = Rs + 0.45;
      for (let i = 0; i <= n; i++) { const u = i / n, a = u * turns * TAU; P.push([s0 + u * turns * pitch, TT + Rc * Math.sin(a), Rc * Math.cos(a)]); }
      g.add(sweep(P, 0.46, { seg: n, radial: 4 }), 'silk_red');
    }
  }

  // ---- the bell mouth shroud: cast bronze, a scalloped 八波 lip, three cloud bands, eight pierced 如意 windows backed by
  // bronze lattice over the glowing liner; inside, a terraced bronze throat with the glow only in the grooves between ribs
  {
    // its own part: it rings (a short scale shiver) on every shot and toll (pulao.js onParts)
    const M = g.part('fx_mouth', { pivot: [572, 0, 0], extras: { note: 'bell mouth: rings with a scale shiver about its root (pulao.js)' } });
    const bandAt = [592, 618, 674], bump = (s) => bandAt.reduce((a, c) => a + 1.3 * Math.exp(-(((s - c) / 3.3) ** 8)), 0);
    const Rf = (s) => lerp(14.4, RL, Math.pow(clamp01((s - 572) / (MUZ - 572)), 2.9));   // a late, deep trumpet flare
    const Ro = (s) => Rf(s) + bump(s), Ri = (s) => Math.max(12.2, Rf(s) - 2.2);
    const st = [];
    for (let s = 568; s <= MUZ - 2;) { st.push([s, Ro(s)]); const nb = bandAt.some((c) => Math.abs(s - c) < 4.6); s += nb ? 1.05 : s < 640 ? 4 : 2.4; }
    const lip = [[MUZ - 0.8, RL + 0.1], [MUZ, RL], [MUZ + 0.8, RL - 0.6], [MUZ + 1.1, RL - 1.6], [MUZ + 0.6, RL - 2.6], [MUZ - 0.6, RL - 3.1]];
    const inner = [];
    for (let s = MUZ - 2; s >= 600; s -= s > 636 ? 3.4 : 8) inner.push([s, Ri(s)]);
    const prof = [[568, 12.2], ...st, ...lip, ...inner, [598, 12.2]];
    const mod = (s, a) => (s > MUZ - 6 ? [-2.4 * (1 - Math.abs(Math.cos(a * 4))) * smooth(MUZ - 6, MUZ, s), 0] : [0, 0]);
    let bell = revolve(prof, { M: 36, mod, crease: 36 });
    // the 如意 window: a cloud head of three lobes, the side lobes hooking in over a pointed stem (towards the shooter)
    const RY = (() => {
      const inside = (x, y) => {
        const c = (cx, cy, r) => Math.hypot(x - cx, y - cy) < r;
        let a = c(2.0, 0, 3.0) || c(-0.7, 4.0, 2.5) || c(-0.7, -4.0, 2.5) || (x > -8.5 && x < -0.5 && Math.abs(y) < (2.4 * (x + 8.5)) / 7)
          || (x > 3.5 && x < 6.8 && Math.abs(y) < 1.9 * (6.8 - x) / 3.3);
        if (c(-3.3, 3.25, 1.45) || c(-3.3, -3.25, 1.45) || c(1.0, 3.5, 0.75) || c(1.0, -3.5, 0.75)) a = false;
        return a;
      };
      const out = [];
      for (let i = 0; i < 48; i++) {
        const th = (i / 48) * TAU, dx = Math.cos(th), dy = Math.sin(th);
        let r = 0;
        while (r < 12 && inside(dx * (r + 0.04), dy * (r + 0.04))) r += 0.04;
        out.push([dx * r * 1.25, dy * r * 1.25]);
      }
      return out;
    })();
    const WS = 652, wins = [];
    for (let k = 0; k < 8; k++) wins.push((k / 8) * TAU + TAU / 16);
    bell = cut(bell, wins.map((a) => xform(plan(RY.map(([x, y]) => [WS + x, y]), { h: 60, ct: 30, bevel: 0, curveSeg: 1 }), { rot: [0, 0, a / D2R - 90] })));
    M.add(bell, BZ);
    const Wf = [], Lt = [];
    const RYin = insetPoly(RY, 0.05);
    for (const a of wins) {
      const map = sMap(Ro, { a0: a / D2R }), lmap = sMap((s) => Rf(s) - 1.15, { a0: a / D2R });
      // gilt frame round the window's lip
      Wf.push(mapTris(wireT(insetPoly(RY, -0.55).map(([x, y]) => [y, WS + x]), 0.85, -0.3, 0.45, { closed: true, step: 2.5 }), map, 40));
      // lattice: diagonal bronze bars clipped to the window, the glow behind them
      const T = [];
      for (const dir of [1, -1]) for (let o = -16; o <= 16; o += 2.3) {
        const seg = [];
        for (let q = -14; q <= 14; q += 0.25) { const x = q, y = dir * (q - o); seg.push([x, y, polyDist(RYin, x, y) > 0]); }
        let run = [];
        for (const [x, y, inn] of seg) { if (inn) run.push([y, WS + x]); else { if (run.length > 1) T.push(...ribbonT([run[0], run[run.length - 1]], 0.6, -0.45, 0.45, { step: 40, b: 0.1 })); run = []; } }
        if (run.length > 1) T.push(...ribbonT([run[0], run[run.length - 1]], 0.6, -0.45, 0.45, { step: 40, b: 0.1 }));
      }
      Lt.push(mapTris(T, lmap, 40));
    }
    M.add(merge(Wf), 'gold');
    M.add(merge(Lt), BZ);
    // gilt beads at the lip and both sides of the window belt
    M.add(revolve([[MUZ - 1.2, RL - 0.1], [MUZ - 0.6, RL + 0.65], [MUZ, RL - 0.1], [MUZ - 0.6, RL - 0.6]], { M: 72, mod: (s, a) => [-2.4 * (1 - Math.abs(Math.cos(a * 4))), 0] }), 'gold');
    for (const s of [639.6, 664.6]) M.add(revolve([[s - 0.55, Ro(s) - 0.15], [s, Ro(s) + 0.5], [s + 0.55, Ro(s) - 0.15], [s, Ro(s) - 0.35]], { M: 64 }), 'gold');
    // three cast bands: 1.3 proud, gilt beads at their edges, eight / eight / twelve cloud curls 1.2 high
    for (const [c, n, k] of [[592, 8, 2.5], [618, 8, 2.75], [674, 10, 3.0]]) {
      const T = [];
      for (let i = 0; i < n; i++) {
        const R = Ro(c), u = (i / n) * TAU * R + TAU * R / (2 * n), f = i % 2 ? -1 : 1;
        T.push(...ribbonT(thin(cloudPts(u - f * 0.85 * k, c - 0.1 * k, k, f), 1.25), (q) => 1.1 * (1 - 0.35 * q), -0.2, 1.2, { step: 2.4, b: 0.3 }));
      }
      M.add(mapTris(T, sMap(Ro), 40), BZ);
      for (const e of [-1, 1]) { const s = c + e * 3.7; M.add(revolve([[s - 0.45, Ro(s) - 0.1], [s, Ro(s) + 0.42], [s + 0.45, Ro(s) - 0.1], [s, Ro(s) - 0.3]], { M: 56 }), 'gold'); }
    }
    // collar clamp at the shroud's root (two screws), the front sight bead on the lip
    g.add(lathe([[565, 11.6], [565, 15.2], [566, 15.8], [573, 15.8], [574, 15.0], [574, 11.6]], { seg: 32 }), BZ);
    for (const sd of [1, -1]) g.add(slotted([569.5, 0, 15.8 * sd], 1.6, sd, 0.9, 0), 'steel_bright');
    M.add(sphere([MUZ - 3.5, RL + 1.4, 0], 1.6, { seg: 12 }), 'gold');
    M.add(box([MUZ - 3.5, RL + 0.2, 0], [3.4, 2.2, 2.2], { r: 0.6 }), BZ);
    // the glowing liner just inside the shell (seen only through the lattice)
    M.add(revolve([[637, Ri(637) - 0.25], [667, Ri(667) - 0.25], [667, Ri(667) - 0.85], [637, Ri(637) - 0.85]], { M: 56 }), 'glow_ice');
    // the throat: six terraces stepping down to the bore, each face with a glowing groove and a rolled rib at its inner edge
    const faces = [[681.5, 34.5], [675, 30.5], [668.5, 26.8], [662, 23.0], [655.5, 19.6], [649, 13.0]];
    const TP = [[638, Ri(638) - 1.0]];
    for (let s = 644; s < 681; s += 6) TP.push([s, Ri(s) - 1.0]);
    let rOut = Ri(681.5) - 1.0;
    const glow = [];
    faces.forEach(([sf, rin], i) => {
      const gO = rin + 0.62 * (rOut - rin), gI = gO - 0.95;
      TP.push([sf, rOut], [sf, gO], [sf - 0.8, gO - 0.08], [sf - 0.8, gI + 0.08], [sf, gI], [sf, rin + 0.9], [sf + 0.55, rin + 0.45], [sf + 0.3, rin], [i + 1 < faces.length ? faces[i + 1][0] + 0.02 : 638.6, rin]);
      glow.push(revolve([[sf - 0.78, gI + 0.1], [sf - 0.42, gI + 0.1], [sf - 0.42, gO - 0.1], [sf - 0.78, gO - 0.1]], { M: 48 }));
      rOut = rin;
    });
    TP.push([638, 13.0]);
    M.add(revolve(TP.reverse(), { M: 44, crease: 40 }), 'bronze_aged');
    M.add(merge(glow), 'glow_ice');
    // gilt bezel where the throat meets the lip
    M.add(revolve([[680.6, Ri(681) - 0.9], [681.5, Ri(681) - 0.25], [682.3, Ri(681) - 0.9], [681.5, Ri(681) - 1.4]], { M: 64 }), 'gold');
  }

  // ======================================================================== pump (vermilion 剔紅 carved lacquer on bronze bands)
  const pump = g.part('pump', { pivot: [372, TT, 0], extras: { travel: 0.09 } });
  {
    const P0 = 292, P1 = 452, RINGS = [300, 372, 444];
    const Rs = (s) => 19.6 - 2.6 * Math.pow(Math.max(0, (P0 + 18 - s) / 18), 2) - 3.0 * Math.pow(Math.max(0, (s - (P1 - 20)) / 20), 2);
    // section: round, the top flattened under the barrel, eight finger grooves on the lower half
    const sec = (s, a, dr = 0) => {
      let r = Rs(s) + dr;
      const sn = Math.sin(a);
      if (sn < -0.65) for (let k = 0; k < 6; k++) { const ga = -Math.PI * 0.27 - (k / 5) * Math.PI * 0.46, d = Math.atan2(Math.sin(a - ga), Math.cos(a - ga)); r -= 1.5 * Math.exp(-(d * d) / 0.006) * (dr ? 0 : 1); }
      return [r * sn, r * Math.cos(a)];
    };
    const flatTop = -12.6 - TT;
    const pumpLoft = (s0, s1, step, dr = 0, M = 64) => {
      const rings = [];
      for (let s = s0; s <= s1 + 1e-6; s += step) {
        const ring = [];
        for (let j = 0; j < M; j++) { const a = (j / M) * TAU; let [t, w] = sec(s, a, dr); t = Math.min(t, flatTop + dr * 0.6); ring.push([s, TT + t, w]); }
        rings.push(ring);
      }
      return loft(rings, { crease: 50 });
    };
    pump.add(pumpLoft(P0, P1, 6, 0, 52), LQ);
    // bronze bands with a gilt bead; bronze end ferrules
    for (const c of RINGS) {
      pump.add(pumpLoft(c - 3.4, c + 3.4, 1.7, 1.35, 48), BZ);
      const beads = [];
      for (let j = 0; j < 40; j++) { const a = (j / 40) * TAU; let [t, w] = sec(c, a, 1.8); t = Math.min(t, flatTop + 1.08); beads.push([c, TT + t, w]); }
      pump.add(ttube([...beads, beads[0], beads[1]], 0.5, 0.5, { radial: 4, seg: 46, caps: false }), 'gold');
    }
    // 剔紅 carving on the round flanks of the two panels (the top is flat under the barrel, the bottom grooved): a 錦地
    // diamond lattice ground, a 回紋 strip along the upper edge, big cloud scrolls in high relief with small ones in
    // their gaps (two tiers), gilt border lines. The left (the shooter's side, sd 1: a0 180°) is full, the right lighter.
    // Design space: u round the pump from the side (+ towards the bottom), v = s.
    for (const [a0, a1] of [[306, 366], [378, 438]]) {
      const R = 19.6, len = a1 - a0 - 2;
      for (const [sd, a0d] of [[1, 180], [-1, 0]]) {
        const U = (u) => sd * u, T = [], L = [], map = sMap(R, { t0: TT, a0: a0d });
        // lattice ground: straight diagonals clipped to the field
        const u0 = -5.4, u1 = 13.3, v0 = a0 + 1.9, v1 = a1 - 1.9;
        if (sd > 0) for (const dir of [1, -1]) for (let o = -90; o <= 90; o += 3.8) {
          const pts = [];
          for (let v = v0; v <= v1; v += 0.5) { const u = dir * (v - a0) + o; if (u >= u0 && u <= u1) pts.push([U(u), v]); }
          if (pts.length > 1) T.push(...wireT([pts[0], pts[pts.length - 1]], 0.42, -0.15, 0.24, { step: 80 }));
        }
        if (sd > 0) for (let v = a0 + 3; v < a1 - 5; v += 6) T.push(...ribbonT([[U(-6.5), v], [U(-8.5), v], [U(-8.5), v + 4], [U(-7.2), v + 4], [U(-7.2), v + 2]], 0.55, -0.2, 0.45, { step: 3, b: 0.15 }));
        // the scrolls: cloudPts laid with x along v
        const big = sd > 0 ? 4 : 2, scroll = (cu, cv, k, f, w, z1) => T.push(...ribbonT(thin(cloudPts(0, 0, k, f).map(([x, y]) => [U(cu + y), cv + x - f * 0.68 * k]), 1.2), (q) => w * (1 - 0.35 * q), -0.3, z1, { step: 2.2, b: 0.45 }));
        const vine = [];
        for (let v = a0 + 2.5; v <= a1 - 2.5; v += 3) vine.push([U(3.9 + 3.6 * Math.sin(((v - a0 - 1) / len) * big * Math.PI)), v]);
        T.push(...ribbonT(vine, 1.1, -0.3, 1.15, { step: 2.5, b: 0.35 }));
        for (let i = 0; i < big; i++) {
          const cv = a0 + 1 + (len * (i + 0.5)) / big, hi = i % 2 === 0;
          scroll(hi ? 0.6 : 7.2, cv, big > 2 ? 4.1 : 5.2, hi ? 1 : -1, 1.6, 1.7);
          if (sd > 0) scroll(hi ? 8.6 : -0.4, cv + len / big * 0.08, 2.1, hi ? -1 : 1, 1.0, 1.0);
        }
        pump.add(mapTris(T, map, 45), LQ);
        for (const u of [-10, 14]) L.push(...wireT([[U(u), a0 + 1], [U(u), a1 - 1]], 0.5, -0.1, 0.38, { step: 80 }));
        L.push(...wireT([[U(-10), a0 + 1.2], [U(14), a0 + 1.2]], 0.5, -0.1, 0.38, { step: 6 }), ...wireT([[U(-10), a1 - 1.2], [U(14), a1 - 1.2]], 0.5, -0.1, 0.38, { step: 6 }));
        pump.add(mapTris(L, map, 45), 'gold');
      }
    }
    // ferrules at both ends
    pump.add(lathe([[P0 - 2.2, TR + 0.2], [P0 - 2.2, Rs(P0) - 1.4], [P0 - 1, Rs(P0) - 0.6], [P0 + 2, Rs(P0) - 0.6], [P0 + 2, TR + 0.2]], { seg: 40, t: TT }), BZ);
    pump.add(lathe([[P1 - 2, TR + 0.2], [P1 - 2, Rs(P1) - 0.4], [P1 + 1, Rs(P1) - 0.8], [P1 + 2.4, Rs(P1) - 2], [P1 + 2.4, TR + 0.2]], { seg: 40, t: TT }), BZ);
    // twin action bars back into the receiver, the bolt they drive (seen in the ejection port)
    for (const sd of [1, -1]) pump.add(box([250, TT + 4, 12.4 * sd], [108, 5.4, 2.0], { r: 0.4 }), 'steel_dark');
    pump.add(box([150, 1.6, 4], [112, 15, 17], { r: 1.6 }), 'steel_bright');
    pump.add(cut(box([150, 1.6, 12.3], [100, 10, 1.2], { r: 0.3 }), [cutters.slotW(120, 175, 1.6, 4, 40, 12.3)]), 'steel_dark');
    pump.add(box([196, 1.6, 4], [8, 18, 18], { r: 1 }), 'steel_bright');
  }

  // ======================================================================== stock (紫檀 rosewood) and its bronze furniture
  // A heightfield sculpt over the side outline (hfield.mjs): the half width swells from a 27 mm wrist to a 40 mm butt,
  // every edge rolls over (radius ~0.8 x the half width, a flat on the comb), the flanks are a little convex; a raised
  // cheek piece on the left (its outline a carved line on the right), palm swells on the grip, carved cloud drop points
  // behind the receiver collar, checkering sunk 0.42 inside a cut border. The butt end is a shallow crescent.
  {
    const butt = (t) => -333 + 2.5 * (1 - ((t + 67) / 58.5) ** 2);
    const SO = [[0.5, 15.6, 0], [-26, 12.8, 14], [-70, 9.8, 30], [-140, 8.6, 40], [-262, 4.0, 30], [-333, -8.6, 0],
      ...[-24, -42, -60, -76, -92, -110].map((t) => [butt(t), t, 0]),
      [-333, -125.5, 0], [-212, -98, 40], [-118, -80, 18], [-100, -88.5, 4], [-62, -88.5, 4], [-46, -64, 14], [-22, -42, 9], [0.5, -35, 0]];
    const poly = makeShape(SO).getPoints(6).map((v) => [v.x, v.y]).filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 0.05);
    // rounded edges: the outline less the butt end and the receiver joint
    const iHeel = poly.findIndex((p) => p[0] < -332.5), iToe = poly.findIndex((p, i) => i > iHeel + 2 && p[1] < -125);
    const A = poly.slice(0, iHeel + 1), B = poly.slice(iToe).filter((p) => p[0] < 0.4);
    const EI = new SegIndex([{ pts: A, closed: false, tag: 'top' }, { pts: B, closed: false, tag: 'bot' }], 4);
    const topAt = curveFn(A.map(([s, t]) => [s, t]).reverse().filter((p, i, a) => i === 0 || p[0] > a[i - 1][0] + 0.2));
    const botAt = (s) => -125.5 + (s + 333) * (27.5 / 121);
    const Wb = curveFn([[-333, 20.2], [-280, 19.6], [-200, 18.4], [-130, 16.6], [-85, 14.2], [-45, 13.6], [-20, 13.5], [0.5, 13.8]]);
    const CK = makeShape([[-150, 1, 8], [-262, -3, 10], [-268, -34, 10], [-205, -32, 14], [-150, -16, 10], [-128, -6, 6]]).getPoints(4).map((v) => [v.x, v.y]);
    const DP = makeShape([[-5, 9, 4], [-5, -31, 4], [-20, -27, 9], [-44, -10, 5], [-24, 6, 8]]).getPoints(4).map((v) => [v.x, v.y]);
    const PN = makeShape([[-38, -30, 3], [-62, -22, 3], [-90, -66, 4], [-86, -80, 3], [-68, -82, 3], [-48, -52, 4]]).getPoints(4).map((v) => [v.x, v.y]);
    const CURL = new SegIndex([{ pts: cloudPts(-31, -10, 3.6, -1), closed: false, tag: 'c' }], 3);
    const hStock = (sd) => (s, t) => {
      const n = EI.near(s, t, 40), d = n ? n.d : 40;
      const W = Wb(s) * (1 - 0.06 * sstep(-60, -125, t) * sstep(-150, -250, s)) + (sd > 0 ? 1.8 : 1.1) * hbump(s, t, -82, -66, 16, 17);
      const R = 0.78 * W;
      let h = W - 0.8 - roundDrop(d, R) + 0.8 * sstep(R * 0.5, R + 25, d);
      const ck = polyDist(CK, s, t);
      if (sd < 0) h += 2.2 * hplat(ck, 3.5);
      const dp = polyDist(DP, s, t);
      if (dp > -2) {
        h += 1.1 * hplat(dp, 1.6);
        const c = CURL.near(s, t, 1.2);
        if (c) h -= 0.5 * halfRound(c.d, 0.65) * sstep(0, 1, dp);
      }
      const pn = polyDist(PN, s, t);
      if (pn > -1.5) h -= 0.42 * sstep(0.2, 0.6, pn) + 0.32 * Math.max(0, 1 - Math.abs(pn + 0.8) / 0.42);
      return h;
    };
    const SM = (sd) => (x, y, z) => [x, y, sd * z];
    const opts = { tol: 0.1, minCell: 0.5, maxCell: 14, edge: 2.8, decimate: { error: 0.26, normals: 0.3, ao: 0.4, lattice: 36 } };
    for (const sd of [1, -1]) {
      const h = hStock(sd), F = hfFace([{ pts: poly, tag: 'o' }], h, { ...opts, map: SM(sd), walls: sd > 0 });
      g.add(F.face, WD);
      if (F.walls) g.add(F.walls, WD);   // the end faces (butt, joint) and the rolled edges' rims
      const surf = (u, v, z) => [u, v, sd * (h(u, v) + z)];
      // gilt wire round the cheek piece's foot (left), the same line inlaid flush on the right
      g.add(mapTris(wireT(resample(insetPoly(CK, sd < 0 ? -0.9 : 0), 2.0, true), 0.6, -0.3, 0.08, { closed: true, step: 2 }), surf, 40), 'gold');
      // checkering: 4-sided pyramids on the sunk floor, tangent to it, rising back to the surface
      const cells = [], Ac = 1.9, e = 0.05;
      for (let s = -92; s <= -34; s += Ac) for (let t = -84; t <= -20; t += Ac) {
        const ss = s + (Math.round((t + 84) / Ac) % 2) * Ac * 0.5, dd = polyDist(PN, ss, t);
        if (dd < 1.1) continue;
        const z = h(ss, t), hx = (h(ss + e, t) - h(ss - e, t)) / (2 * e), hy = (h(ss, t + e) - h(ss, t - e)) / (2 * e);
        cells.push({ c: [ss, t, sd * (z - 0.02)], n: vnorm([-hx, -hy, sd]), a: [Ac * 0.5, 0, sd * hx * Ac * 0.5], b: [0, Ac * 0.5, sd * hy * Ac * 0.5], h: 0.42 * clamp01(dd / 3) });
      }
      g.add(pyramids(cells), WD);
      // bronze medallion with the house mark, four gilt rivets
      const mc = [-192, -58], h0 = h(mc[0], mc[1]), wl = sd * h0;
      const med = circleP(mc[0], mc[1], 9.5, 32);
      g.add(slab(med, wl + sd * 0.15, sd, 1.9, 0.6), BZ);
      g.add(band([...med, med[0]], wl + sd * 0.8, sd, 0.36, 0.4), 'gold');
      const M = bellMark(mc[0], mc[1] - 0.6, 0.6, wl + sd * 1.1, sd, { relief: 0.8, arcs: 1 });
      g.add(merge(M.body), BZ); g.add(merge(M.gold), 'gold');
      for (let k = 0; k < 4; k++) { const a = (45 + k * 90) * D2R; g.add(rivet([mc[0] + Math.cos(a) * 10.9, mc[1] + Math.sin(a) * 10.9, wl - sd * 0.3], 0.9, sideAx(sd), 0.9, 6), 'gold'); }
    }
    // top tang: the receiver's strap runs back along the comb, contoured, a teardrop finial and one screw
    {
      const pts = [];
      for (let s = 1; s >= -36; s -= 3) pts.push([s, topAt(s) + 1.25 - 0.25 * smooth(-20, -36, s)]);
      for (let s = -36; s <= 1; s += 3) pts.push([s, topAt(s) - 0.9]);
      g.add(PF(pts.map(([s, t]) => [s, t, 0]), { w: 7.6, bevel: 0.7, bevelSeg: 2 }), 'steel_blued');
      g.add(lax([[0, 0], [0, 3.6], [1.2, 3.4], [2.0, 2.2], [2.4, 0]], [-38.5, topAt(-38.5) - 0.6, 0], 't', 18), 'steel_blued');
      g.add(slotScrew([-21, topAt(-21) + 1.2, 0], [0, 1, 0.0], 1.7, 0.8), 'steel_bright');
      g.add(dome([-38.5, topAt(-38.5) + 1.8, 0], [0, 1, 0], 1.0, 0.7, 10), 'gold');
    }
    // butt plate: cast bronze shaped to the crescent, heel and toe spurs over the comb / toe, a gilt rim, a cast cloud
    // field between two slotted screws, line serrations top and bottom
    {
      const TH = 7, hR = hStock(1), hL = hStock(-1);
      const wAt = (t) => Math.max(1.5, Math.max(hR(-331.6, t), hL(-331.6, t)) + 0.5);
      const rings = [], tH = -8.6, tT = -125.5;
      for (let i = 0; i <= 60; i++) {
        const t = lerp(tH + 0.4, tT - 0.4, i / 60), W = wAt(Math.min(tH - 0.3, Math.max(tT + 0.3, t))), sb = butt(t), ring = [];
        for (let j = 0; j < 16; j++) {
          const a = (j / 16) * TAU, c = Math.cos(a), sn = Math.sin(a);
          // rounded rear corners, a square front edge into the wood
          ring.push([c < 0 ? sb - TH + 2.4 * (1 - Math.abs(c) ** 0.6) : sb + 0.6, t, Math.sign(sn) * Math.min(W, W * Math.abs(sn) ** 0.25)]);
        }
        rings.push(ring);
      }
      g.add(loft(rings, { crease: 50 }), BZ);
      // heel / toe spurs
      const spur = (s0, s1, f, sd) => { const P = []; for (let s = s0; s <= s1; s += 2) P.push([s, f(s) + sd * (1.3 - 0.9 * smooth(s1 - 8, s1, s))]); for (let s = s1; s >= s0; s -= 2) P.push([s, f(s) - sd * 0.8]); return PF(P.map(([s, t]) => [s, t, 0]), { w: 8.4, bevel: 0.6, bevelSeg: 2 }); };
      g.add(spur(-333.5, -314, topAt, 1), BZ);
      g.add(spur(-333.5, -312, botAt, -1), BZ);
      for (const [s, f, sd] of [[-319, topAt, 1], [-317, botAt, -1]]) g.add(slotScrew([s, f(s) + sd * 1.2, 0], [0, sd, 0], 1.4, 0.7), 'steel_bright');
      // the rear face design space: u = w, v = t, z = out of the face (towards -s)
      const rear = (u, v, z) => [butt(v) - TH - z, v, u];
      const rim = [];
      for (let t = tH - 2.2; t >= tT + 2.2; t -= 3) rim.push([wAt(t) - 2.0, t]);
      for (let t = tT + 2.2; t <= tH - 2.2; t += 3) rim.push([-(wAt(t) - 2.0), t]);
      g.add(mapTris(ribbonT(rim, 0.9, -0.2, 0.42, { closed: true, step: 2.5, b: 0.2 }), rear, 40), 'gold');
      const R = [];
      for (const [u, v, k, f] of [[-4.5, -44, 4.8, 1], [4.5, -63, 4.8, -1], [-4.5, -82, 4.8, 1]]) R.push(...ribbonT(cloudPts(u, v, k, f).map(([a, b]) => [a, b]), (q) => 1.5 * (1 - 0.4 * q), -0.2, 1.0, { step: 1.4, b: 0.35 }));
      for (const tz of [[-13.5, -21.5], [-111.5, -120]]) for (let t = tz[0]; t >= tz[1]; t -= 1.15) R.push(...ribbonT([[-(wAt(t) - 3.6), t], [wAt(t) - 3.6, t]], 0.5, -0.2, 0.32, { step: 6, b: 0.1 }));
      g.add(mapTris(R, rear, 40), BZ);
      for (const t of [-27, -104.5]) g.add(slotScrew(rear(0, t, -0.2), [-1, 0, 0], 2.2, 1.1), 'steel_bright');
    }
    // pistol-grip cap (bronze, gilt ring and a bell boss)
    g.add(PF([[-66, -86, 1], [-95, -86, 1], [-97, -92, 3], [-63, -92, 3]], { w: 27, bevel: 2.2, bevelSeg: 2 }), BZ);
    g.add(lax([[0, 0], [0, 5.5], [0.6, 5.2], [0.6, 0]], [-80, -92.2, 0], '-t', 20), 'gold');
    g.add(lax([[0, 0], [0, 3.2], [0.9, 2.6], [1.2, 0]], [-80, -92.6, 0], '-t', 16), BZ);
    // sling swivel under the toe
    g.add(xform(lathe([[-0.9, 4.0], [0, 4.9], [0.9, 4.0], [0, 3.1], [-0.9, 4.0]], { seg: 16 }), { rot: [0, 90, 0], move: [-296, botAt(-296) - 6.5, 0] }), 'steel_bright');
    g.add(box([-296, botAt(-296) - 1.4, 0], [8, 4, 3.6], { r: 1.2 }), 'steel_dark');
  }

  // ======================================================================== trigger, loading shell
  const trig = g.part('trigger', { pivot: [60, -40, 0], extras: { axis: 'x', pullDeg: -14 } });
  trig.add(PF([[58, -40, 1], [63.5, -40, 1], [64.5, -48, 3], [63.4, -57, 3], [59.6, -61.4, 1.2], [58.4, -57, 3], [59.8, -48, 3]], { w: 5.2, bevel: 1.1 }), 'steel_bright');
  for (let k = 0; k < 4; k++) trig.add(box([63.6 - k * 0.3, -50 - k * 2.2, 0], [0.6, 0.8, 5.0], { r: 0.2 }), 'steel_dark');
  // the shell the support hand thumbs into the tube during reloads (shown only by the shell clips)
  const shell = g.part('shell', { pivot: [118, -31.5, 0], extras: { note: 'loading shell: hidden at rest (pulao.js), the shell clips show it' } });
  shell.add(lax([[0, 0], [0, 8.6], [0.8, 9.6], [2.0, 9.6], [2.4, 9.25], [12, 9.25], [12, 0]], [84, -31.5, 0], 's', 20), 'brass');
  shell.add(lax([[0, 9.2], [54, 9.2], [55.6, 8.4], [56.2, 4.6], [56.2, 0]], [96, -31.5, 0], 's', 20), 'paint_red');
  shell.add(lax([[0, 0], [0, 2.4], [0.4, 2.2], [0.4, 0]], [83.6, -31.5, 0], '-s', 12), 'copper');
  for (const s of [118, 132]) shell.add(lax([[-0.5, 9.2], [0, 9.6], [0.5, 9.2]], [s, -31.5, 0], 's', 20), 'gold');

  // ======================================================================== sockets + meta
  g.socket('muzzle', [672, 0, 0]);
  g.socket('bellmouth', [670, 0, 0]);
  g.socket('lip_top', [MUZ, RL, 0]);
  g.socket('eject', [130, 4, 15], { dir: [0.15, 0.55, 1] });
  g.socket('grip_r', [-16, -46, 0], { rot: [0, 0, -26] });
  g.socket('grip_l', [372, -42.6, 0]);
  g.socket('sight_rear', [48, 34.5, 0]);
  g.socket('sight_front', [MUZ - 3.5, RL + 3.0, 0]);
  const HS = ([s, t, w]) => { const v = V(s, t, w).applyMatrix4(HM); return [-v.z, v.y, v.x]; };
  g.socket('head', HS([166, 32, 0]));
  g.socket('mouth', HS([179, 29, 0]));
  g.socket('eye_r', HS(H.surf(161.8, 26 * D2R, 1.4)));
  g.socket('eye_l', HS(H.surf(161.8, (180 - 26) * D2R, 1.4)));
  g.socket('ring_rear', [48, 34.5, 0]);
  g.socket('saddle', [97, 22, 0]);
  g.socket('pump_l', [372, TT + 4, -20.5]);
  g.socket('flank_l', [101, -6, -16]);
  g.meta({
    grip: 'rifle', support: 'pump', reload: 'shell_tube', series: 'jiuzi',
    notes: 'M08 蒲牢. pump: travel 0.09 (bolt + action bars ride on it). fx_pulao: head, open 30 about w (rears up); fx_jaw (child): '
      + 'open -22 (wider). fx_bell1..3: pendulum bells on the right-hand rack, fx_lit1..3 (children): gilt clapper beads, hidden '
      + 'unless that bell shell is loaded. shell: the loading shell (hidden at rest). Hero: glow_ice liner inside the bell mouth '
      + '(pvKey veinAxis 1) seen through eight pierced windows. fx_resonance: 九子 lamp (left flank).',
  });

  // bake: pre-tessellated (relief already fine), glow / crystal kept out, m4's post-bake (buried AO refill, per-material
  // wear from curvature), then verdigris pooled in the bronze's cast recesses (cavity from the AO)
  g.build = (o = {}) => {
    const root = Gun.prototype.build.call(g, { ...o, bake: false });
    // QEM decimation of every dense mesh (filigree, scale rows, carved lacquer, the bell mouth's lathes): welded by
    // position + normal (crease splits stay split), the normal as an attribute, at most 0.16 mm off the authored surface
    // (~0.4 px at hip, ~1 px in the 20 cm inspect close-up; the relief is 0.3-0.9 mm deep, so it stays); the engraved
    // grounds keep their own lattice. g.lod 1 (pulao_tp, third person): 1.2 mm, small parts pruned, the grounds too.
    const tp = g.lod === 1;
    if (o.decimate !== false) {
      let before = 0, after = 0;
      root.traverse((m) => {
        if (!m.isMesh || /^(glow_|crystal)/.test(m.userData.mat) || (!tp && m.userData.mat === MT)) return;
        const n = m.geometry.attributes.position.count / 3;
        before += n;
        if (n > 600 || tp) m.geometry = tp ? decimate(m.geometry, 1.2, 0.1, true) : decimate(m.geometry, /^gold/.test(m.userData.mat) ? 0.14 : 0.16);
        after += m.geometry.attributes.position.count / 3;
      });
      if (o.log !== false) console.log(`pulao decimate: ${Math.round(before)} -> ${Math.round(after)} triangles`);
    }
    if (o.bake === false) return root;
    const meshes = [];
    root.traverse((m) => { if (m.isMesh && !/^(glow_|crystal)/.test(m.userData.mat)) meshes.push(m); });
    const tess = (o.tessellate ?? TESS) * 0.001 * (tp ? 2.5 : 1);
    for (const m of meshes) {
      const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
      for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
      // blued / dark steel is plain cylinders and slabs: a coarse grid is enough for its AO; relief-dense bronze and gilt
      // are already fine, the wood and lacquer get the finest
      const k = /^(lacquer_|wood)/.test(m.userData.mat) ? 1 : /^steel/.test(m.userData.mat) ? 4 : 1.6;
      m.geometry = tessellateFat(geo, tess * k, 0.0016);
    }
    if (o.tessOnly) return root;
    const relief = (m) => (/^(bronze|gold)/.test(m.userData.mat) ? 0.0009 : /^(lacquer|wood|steel_stipple)/.test(m.userData.mat) ? 0.0006 : 0);
    bakeMeshes(meshes, { tessellate: 0, aoDist: 0.022, rays: 32, log: true, minHeight: relief });
    postBake(root, { cos: 0.99999 }, WEAR);
    root.traverse((m) => {
      const B = m.isMesh && m.geometry.attributes._bake?.array;
      if (!B) return;
      if (/bronze_cast/.test(m.userData.mat)) for (let i = 0; i < B.length; i += 4) { const ao = B[i] / 255; B[i + 2] = Math.max(B[i + 2], Math.round(255 * Math.min(0.9, 2.6 * Math.max(0, 0.93 - ao)))); }
    });
    return root;
  };
  return g;
}
