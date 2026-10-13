// 獵犬 Hound-45 — UMP-pattern .45 polymer SMG. Side view, mm: s forward from the rear face of the upper
// receiver (stock hinge), t up from the bore axis, w right (ejection-port side).
// Real reference: 690 mm stock extended / 450 mm folded, 200 mm barrel, 25-round straight .45 magazine.
//   receiver rear s = 0, chamber s = 250, muzzle s = 448 (200 mm barrel), butt pad s = -240 -> 688 mm overall.
// Finish: black polymer mouldings (receiver, trigger group, sights, stock, selector, cocking handle) with recessed
// stippled (polymer_grip) zones; the little steel hardware is matte black, worn only on its sharp edges (see rewear).
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { Gun, profile, plan, section, lathe, cyl, tube, box, ring, cut, intersect, cutters, merge, xform, DEG } from '../lib/gunkit.mjs';

// ------------------------------------------------------------------------------------------ local helpers
/** profile with a lighter default curve resolution (small fillets don't need 10 segments) */
const P = (spec, o = {}) => profile(spec, { curveSeg: 5, ...o });
/** rounded box with a single rounding segment (~108 tris instead of ~300) */
const B = (c, s, o = {}) => box(c, s, { seg: 1, ...o });
/** cylinder along t (vertical) at [s, w] */
const cylT = (s, w, t0, t1, r, o = {}) => xform(cyl(t0, t1, r, o), { rot: [90, 0, 0], move: [s, 0, w] });
/** cylinder along w (across the gun) at [s, t] */
const cylW = (s, t, w0, w1, r, o = {}) => xform(cyl(w0, w1, r, o), { rot: [0, -90, 0], move: [s, t, 0] });
/** pin / rivet head facing +w (dir 1) or -w (dir -1): wide and nearly flush (0.35 mm crown), so it reads as a
 * black pressed pin with a worn rim instead of a chrome dome */
const head = (s, t, w, r = 2.6, dir = 1, depth = 0.35, seg = 12) => {
  const h = lathe([[0, 0], [0, r], [depth * 0.35, r * 0.97], [depth * 0.75, r * 0.86], [depth, r * 0.7], [depth, 0]], { seg });
  h.rotateY(dir > 0 ? -Math.PI / 2 : Math.PI / 2);
  return h.translate(w, t, -s);
};
/** pin through the gun: flat heads on both faces at |w| = half */
const pinHeads = (s, t, half, r = 2.6) => merge([head(s, t, half - 0.12, r, 1), head(s, t, -half + 0.12, r, -1)]);
/** socket-head cap screw facing ±w (recessed hex drive) */
const capScrew = (s, t, w, r = 2.2, dir = 1) => {
  const h = lathe([[0, 0], [0, r], [0.35, r], [1.1, r * 0.9], [1.1, r * 0.5], [0.5, r * 0.5], [0.5, 0]], { seg: 12 });
  h.rotateY(dir > 0 ? -Math.PI / 2 : Math.PI / 2);
  return h.translate(w, t, -s);
};
/** flat screw head facing +t */
const headT = (s, t, w, r = 2, depth = 0.4) => {
  const h = lathe([[0, 0], [0, r], [depth * 0.4, r * 0.96], [depth, r * 0.75], [depth, 0]], { seg: 14 });
  h.rotateX(Math.PI / 2);
  return h.translate(w, t, -s);
};
/** rounded rectangle outline [s0..s1] x [t0..t1] (corner r), optionally inset */
const rect = (s0, s1, t0, t1, r, inset = 0) => {
  const rr = Math.max(0.3, r - inset);
  return [[s0 + inset, t0 + inset, rr], [s1 - inset, t0 + inset, rr], [s1 - inset, t1 - inset, rr], [s0 + inset, t1 - inset, rr]];
};
/**
 * Cutter for a recessed panel in a side face at |w| = face (sd = ±1): floor at depth d, 45° chamfered rim c
 * (the profile's bevel insets the outline at the floor, full size from face - d + c outward).
 */
const pocket = (pts, sd, face, d = 0.8, c = 0.6) => profile(pts, { w: 6, cw: sd * (face - d + 3), bevel: c, bevelSeg: 1, curveSeg: 5 });
/** stippled floor insert for a pocket (outline already inset by the chamfer), 0.06 mm proud of the cut floor */
const floorSlab = (pts, sd, face, d = 0.8) => P(pts, { w: 0.6, cw: sd * (face - d - 0.24), bevel: 0.12, bevelSeg: 1 });
/** fillet offset: R at the wall (x <= 0) falling to 0 at x = R along a quarter circle */
const ef = (x, R) => (x >= R ? 0 : x <= 0 ? R : R - Math.sqrt(x * (2 * R - x)));
const smooth01 = (x) => { const u = Math.max(0, Math.min(1, x)); return u * u * (3 - 2 * u); };
/** piecewise-linear lookup in [[t, v], ...] sorted by t descending */
const keyed = (keys, t) => {
  if (t >= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t >= keys[i][0]) { const [t0, v0] = keys[i - 1], [t1, v1] = keys[i]; return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0); }
  }
  return keys[keys.length - 1][1];
};

/** rounded rectangle in a local (u, v) frame: u in ±hu, v in v0..v1, corner r; CCW, always 4 * (k + 1) points */
function rrUV(hu, v0, v1, r, k = 5) {
  const rr = Math.min(r, hu - 0.05, (v1 - v0) / 2 - 0.05);
  const pts = [];
  for (const [cu, cv, a0] of [[hu - rr, v1 - rr, 0], [-hu + rr, v1 - rr, 90], [-hu + rr, v0 + rr, 180], [hu - rr, v0 + rr, 270]]) {
    for (let i = 0; i <= k; i++) { const a = (a0 + (i / k) * 90) * DEG; pts.push([cu + rr * Math.cos(a), cv + rr * Math.sin(a)]); }
  }
  return pts;
}
/** horizontal rounded-rectangle ring at height t: [s0..s1] x [-hw..hw] */
const ringT = (t, s0, s1, hw, r, k = 4) => rrUV((s1 - s0) / 2, -hw, hw, r, k).map(([u, v]) => [(s0 + s1) / 2 + u, t, v]);

/**
 * Closed loft through rings of [s, t, w] points (same count and winding in every ring), both ends capped with a
 * centroid fan. The kit has no loft; grips, struts and the magwell funnel need varying cross-sections.
 */
function loft(rings, crease = 40) {
  const n = rings[0].length, pos = [];
  const tri = (a, b, c) => pos.push(a[2], a[1], -a[0], b[2], b[1], -b[0], c[2], c[1], -c[0]);
  for (let k = 0; k + 1 < rings.length; k++) {
    const A = rings[k], C = rings[k + 1];
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; tri(A[i], C[j], C[i]); tri(A[i], A[j], C[j]); }
  }
  const cap = (R, end) => {
    const c = [0, 1, 2].map((d) => R.reduce((m, p) => m + p[d], 0) / n);
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; end ? tri(c, R[i], R[j]) : tri(c, R[j], R[i]); }
  };
  cap(rings[0], false);
  cap(rings[rings.length - 1], true);
  let vol = 0;
  for (let i = 0; i < pos.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = pos.slice(i, i + 9);
    vol += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  if (vol < 0) for (let i = 0; i < pos.length; i += 9) for (let c = 0; c < 3; c++) { const x = pos[i + 3 + c]; pos[i + 3 + c] = pos[i + 6 + c]; pos[i + 6 + c] = x; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return toCreasedNormals(geo, crease * DEG);
}

/**
 * Light Picatinny rail: dovetail base (section) + one comb profile for all the cross teeth
 * (the kit's rail() builds every tooth as a filleted extrusion: ~300 tris per tooth).
 */
function lrail(s0, s1, { t = 0, w = 0, side = 'top', width = 21.2, height = 6, slot = 10, tooth = 5.3 } = {}) {
  const hw = width / 2;
  const base = section([[-hw + 1.6, 0], [hw - 1.6, 0], [hw, 1.8], [hw - 1.1, 3.3], [-hw + 1.1, 3.3], [-hw, 1.8]], s0, s1, { bevel: 0.35, bevelSeg: 1 });
  const len = s1 - s0, n = Math.floor(len / slot), off = (len - n * slot) / 2 + (slot - tooth) / 2;
  const pts = [[s0 + 0.6, 2.4]];
  for (let i = 0; i < n; i++) {
    const a = s0 + off + i * slot;
    pts.push([a, 3.1], [a, height], [a + tooth, height], [a + tooth, 3.1]);
  }
  pts.push([s1 - 0.6, 2.4]);
  const comb = profile(pts, { w: width - 2.6, bevel: 0.35, bevelSeg: 1 });
  const geo = merge([base, comb]);
  if (side !== 'top') geo.rotateZ(-(side === 'left' ? -90 : side === 'right' ? 90 : 180) * DEG);
  geo.translate(w, t, 0);
  return geo;
}

// Tiny stroke font for raised markings (original names only). Glyph cell 2 x 4 units.
const FONT = {
  A: [[0, 0, 0, 3], [0, 3, 1, 4], [1, 4, 2, 3], [2, 3, 2, 0], [0, 1.8, 2, 1.8]],
  C: [[2, 4, 0, 4], [0, 4, 0, 0], [0, 0, 2, 0]],
  D: [[0, 0, 0, 4], [0, 4, 1.3, 4], [1.3, 4, 2, 3.2], [2, 3.2, 2, 0.8], [2, 0.8, 1.3, 0], [1.3, 0, 0, 0]],
  E: [[2, 4, 0, 4], [0, 4, 0, 0], [0, 0, 2, 0], [0, 2, 1.5, 2]],
  F: [[2, 4, 0, 4], [0, 4, 0, 0], [0, 2, 1.5, 2]],
  H: [[0, 0, 0, 4], [2, 0, 2, 4], [0, 2, 2, 2]],
  I: [[1, 0, 1, 4]],
  K: [[0, 0, 0, 4], [0, 1.6, 2, 4], [0.7, 2.4, 2, 0]],
  L: [[0, 4, 0, 0], [0, 0, 2, 0]],
  M: [[0, 0, 0, 4], [0, 4, 1, 2], [1, 2, 2, 4], [2, 4, 2, 0]],
  N: [[0, 0, 0, 4], [0, 4, 2, 0], [2, 0, 2, 4]],
  O: [[0, 0, 2, 0], [2, 0, 2, 4], [2, 4, 0, 4], [0, 4, 0, 0]],
  P: [[0, 0, 0, 4], [0, 4, 2, 4], [2, 4, 2, 2], [2, 2, 0, 2]],
  R: [[0, 0, 0, 4], [0, 4, 2, 4], [2, 4, 2, 2], [2, 2, 0, 2], [0.8, 2, 2, 0]],
  S: [[2, 4, 0, 4], [0, 4, 0, 2], [0, 2, 2, 2], [2, 2, 2, 0], [2, 0, 0, 0]],
  T: [[0, 4, 2, 4], [1, 4, 1, 0]],
  U: [[0, 4, 0, 0], [0, 0, 2, 0], [2, 0, 2, 4]],
  0: [[0, 0, 2, 0], [2, 0, 2, 4], [2, 4, 0, 4], [0, 4, 0, 0], [0, 0.5, 2, 3.5]],
  1: [[1, 0, 1, 4], [1, 4, 0.3, 3.3]],
  2: [[0, 4, 2, 4], [2, 4, 2, 2], [2, 2, 0, 2], [0, 2, 0, 0], [0, 0, 2, 0]],
  3: [[0, 4, 2, 4], [2, 4, 2, 0], [2, 0, 0, 0], [0.6, 2, 2, 2]],
  4: [[0, 4, 0, 1.6], [0, 1.6, 2, 1.6], [1.5, 3, 1.5, 0]],
  5: [[2, 4, 0, 4], [0, 4, 0, 2], [0, 2, 2, 2], [2, 2, 2, 0], [2, 0, 0, 0]],
  7: [[0, 4, 2, 4], [2, 4, 0.8, 0]],
  '-': [[0.3, 2, 1.7, 2]],
  '.': [[0.75, 0, 1.25, 0]],
};
/**
 * Raised lettering on a side face. side = +1 (right face, reads towards +s) or -1 (left face, reads towards -s).
 * s0/t0 = start of the baseline, h = cap height, w0 = face position, depth = relief height.
 */
function text(str, { s0, t0, h = 4, side = 1, w0, depth = 0.45, stroke = 0.6 }) {
  const k = h / 4, out = [];
  let x = 0;
  for (const ch of str.toUpperCase()) {
    const glyph = FONT[ch];
    if (glyph) for (const [x0, y0, x1, y1] of glyph) {
      const a = [s0 + side * (x + x0) * k, t0 + y0 * k], b = [s0 + side * (x + x1) * k, t0 + y1 * k];
      const ds = b[0] - a[0], dt = b[1] - a[1], L = Math.hypot(ds, dt);
      out.push(box([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, w0 + side * (depth / 2 - 0.25)], [L + stroke, stroke, depth + 0.5], { r: 0, rot: [Math.atan2(dt, ds) / DEG, 0, 0] }));
    }
    x += ch === ' ' ? 2.4 : ch === '.' ? 1.8 : 3.3;
  }
  return merge(out);
}
/** cartridge-silhouette pictogram (selector markings), standing on t0, slightly proud of the face */
const cartridge = (s, t0, face, sd, h = 4.2, wd = 1.3) => P(
  `M ${s - wd / 2} ${t0} L ${s + wd / 2} ${t0} L ${s + wd / 2} ${t0 + h * 0.58} Q ${s + wd / 2} ${t0 + h} ${s} ${t0 + h} Q ${s - wd / 2} ${t0 + h} ${s - wd / 2} ${t0 + h * 0.58} Z`,
  { w: 0.7, cw: face + sd * 0.1, bevel: 0.12, bevelSeg: 1, curveSeg: 4 });

// ------------------------------------------------------------------------------------------ pistol grip
// Horizontal slices (constant t) through an oval, superellipse cross-section: square-ish where it grows out of the
// 36 mm trigger housing, ~31 mm wide x ~46 mm long oval in the hand, with a beavertail hump under the tang, a palm
// swell around t = -92 and a flared heel/toe at the base.
const SB_TOP = [[-33.2, 34.6], [-34.6, 36.0], [-36, 38.6], [-37.5, 41.8], [-39, 44.6], [-41, 46.6], [-43.5, 46.2], [-46.5, 45.2], [-49.5, 45.0],
  [-53, 46.9], [-57, 50.0], [-62, 53.6], [-66, 55.6]];
const SF_TOP = [[-33.2, 111.8], [-34.6, 111.6], [-37, 111.0], [-40, 109.4], [-44, 106.8], [-50, 104.2], [-56, 103.0], [-62, 101.9]];
const HW_TOP = [[-38, 18.25], [-41, 17.95], [-45, 17.3], [-50, 16.5], [-56, 15.9], [-62, 15.62]];
const EX = [[-38, 7], [-42, 5], [-48, 3.6], [-56, 2.9], [-64, 2.55], [-70, 2.5]];
const EGG = [[-38, 0], [-56, 0.08]];
function gripSlice(t) {
  const sb = t > -66 ? keyed(SB_TOP, t)
    : 32 + 0.30 * (t + 145) - 1.0 * Math.exp(-(((t + 92) / 16) ** 2)) - 2.4 * smooth01((-136 - t) / 11);
  const sf = t > -62 ? keyed(SF_TOP, t) : 80 + 0.30 * (t + 135) + 2.8 * smooth01((-135 - t) / 12);
  const hw = t > -62 ? keyed(HW_TOP, t) : 15.5 + 1.6 * Math.exp(-(((t + 92) / 19) ** 2)) + 1.3 * smooth01((-137 - t) / 10);
  return { sb, sf, hw, ex: keyed(EX, t), egg: keyed(EGG, t) };
}
function ovalRing(t, { sb, sf, hw, ex, egg }, N = 28) {
  const sc = (sb + sf) / 2, a = (sf - sb) / 2, pts = [];
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
    const u = Math.sign(c) * Math.abs(c) ** (2 / ex), v = Math.sign(sn) * Math.abs(sn) ** (2 / ex);
    pts.push([sc + a * u, t, hw * v * (1 - egg * u)]);
  }
  return pts;
}
function gripLoft(inset = 0) {
  const ts = [];
  ts.push(-33.2);
  for (let t = -34.6; t >= -49.65; t -= 1) ts.push(t);
  for (let t = -52; t >= -133.1; t -= 3) ts.push(t);
  for (let t = -136; t > -148; t -= 1.4) ts.push(t);
  ts.push(-148.6);
  const rings = ts.map((t) => {
    const g = gripSlice(t);
    return ovalRing(t, { ...g, sb: g.sb + inset, sf: g.sf - inset, hw: g.hw - inset });
  });
  // rounded bottom edge
  for (const [t, k] of [[-149.4, 0.8], [-149.95, 2.2]]) {
    const g = gripSlice(-148.6);
    rings.push(ovalRing(t, { ...g, sb: g.sb + inset + k, sf: g.sf - inset - k, hw: g.hw - inset - k }));
  }
  return loft(rings, 40);
}

// ------------------------------------------------------------------------------------------ bake post-process
/** Convex curvature per vertex (1/m), same estimator as tools/assets/lib/bake.mjs (not exported there). */
function curvature(geo) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, idx = geo.index.array, n = pos.count;
  const weld = new Int32Array(n), map = new Map(), q = 1 / 0.00004;
  const wp = new Float64Array(n * 3), wn = new Float64Array(n * 3);
  let W = 0;
  for (let i = 0; i < n; i++) {
    const x = Math.round(pos.getX(i) * q), y = Math.round(pos.getY(i) * q), z = Math.round(pos.getZ(i) * q);
    const k = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
    const bucket = map.get(k);
    let id = -1;
    if (bucket) for (const c of bucket) if (Math.abs(wp[c * 3] - pos.getX(i)) < 1e-5 && Math.abs(wp[c * 3 + 1] - pos.getY(i)) < 1e-5 && Math.abs(wp[c * 3 + 2] - pos.getZ(i)) < 1e-5) { id = c; break; }
    if (id < 0) {
      id = W++;
      wp[id * 3] = pos.getX(i); wp[id * 3 + 1] = pos.getY(i); wp[id * 3 + 2] = pos.getZ(i);
      if (bucket) bucket.push(id); else map.set(k, [id]);
    }
    weld[i] = id;
    wn[id * 3] += nor.getX(i); wn[id * 3 + 1] += nor.getY(i); wn[id * 3 + 2] += nor.getZ(i);
  }
  for (let i = 0; i < W; i++) {
    const l = Math.hypot(wn[i * 3], wn[i * 3 + 1], wn[i * 3 + 2]) || 1;
    wn[i * 3] /= l; wn[i * 3 + 1] /= l; wn[i * 3 + 2] /= l;
  }
  const sum = new Float64Array(W), cnt = new Float64Array(W);
  const edge = (a, b) => {
    if (a === b) return;
    const dx = wp[b * 3] - wp[a * 3], dy = wp[b * 3 + 1] - wp[a * 3 + 1], dz = wp[b * 3 + 2] - wp[a * 3 + 2];
    const l2 = dx * dx + dy * dy + dz * dz;
    if (l2 < 1e-14) return;
    const k = ((wn[b * 3] - wn[a * 3]) * dx + (wn[b * 3 + 1] - wn[a * 3 + 1]) * dy + (wn[b * 3 + 2] - wn[a * 3 + 2]) * dz) / l2;
    sum[a] += k; cnt[a]++; sum[b] += k; cnt[b]++;
  };
  for (let i = 0; i < idx.length; i += 3) {
    const a = weld[idx[i]], b = weld[idx[i + 1]], c = weld[idx[i + 2]];
    edge(a, b); edge(b, c); edge(c, a);
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const id = weld[i]; out[i] = cnt[id] ? sum[id] / cnt[id] : 0; }
  return out;
}
/**
 * Kit gap: bake.mjs maps curvature to edge wear with one global scale (1/150 per metre), so every steel part under
 * ~7 mm radius (pins, sight drum, loops, barrel stub, trigger) bakes to full wear and renders as blotchy chrome.
 * The baked edge channel (`_bake`.g) is recomputed here per mesh with its own scale (curvature that maps to full
 * wear) and an optional cap ([scale, cap]): 1/1300 keeps wear on true sharp edges (bevels under ~0.8 mm) and leaves
 * round surfaces black; the cap turns the rims of the flush pins into speckled wear instead of solid bright rings.
 */
function rewear(root, scales) {
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry.attributes._bake) return;
    const rule = scales[o.name] ?? scales['*:' + o.name.split(':')[1]];
    if (rule === undefined) return;
    const [scale, cap = 1] = [].concat(rule);
    const bake = o.geometry.attributes._bake, curv = curvature(o.geometry);
    for (let i = 0; i < curv.length; i++) bake.array[i * 4 + 1] = Math.round(Math.max(0, Math.min(cap, curv[i] * scale)) * 255);
    bake.needsUpdate = true;
  });
}

export default function build() {
  const g = new Gun('ump');
  const RW = 21;     // receiver half-width (42 mm polymer upper)
  const LW = 36;     // trigger-housing width
  const LOS = 36;    // iron-sight line above the bore

  // ============================================================================ upper receiver (polymer)
  // Side silhouette: boxy upper with a chamfered rear top, deeper fore-end with a hand-stop lip.
  let recv = profile([
    [0, 13, 3], [7, 21, 3], [409, 21, 2], [412, 18, 2], [412, -12, 2], [410, -27, 5], [402, -47, 3], [391, -47, 3],
    [384, -38, 4], [253, -38, 0], [253, -26, 0], [0, -26, 3],
  ], { w: RW * 2, bevel: 2.6, bevelSeg: 3, curveSeg: 6 });
  // cross-section: chamfered top edges along the whole receiver
  const xsec = section([[-22, -60], [22, -60], [22, 10.5, 3], [16.4, 23, 3], [-16.4, 23, 3], [-22, 10.5, 3]], -5, 420, { bevel: 0, curveSeg: 4 });
  recv = intersect(recv, xsec);
  /** removes the region outside an R fillet on the lower corners (side tangent at t = tc) between s0 and s1 */
  const filletCut = (sd, tc, s0, s1, R = 8) => {
    const pts = [[sd * (RW - R), tc - R - 3], [sd * (RW + 3), tc - R - 3], [sd * (RW + 3), tc], [sd * RW, tc]];
    for (let a = 10; a < 90; a += 10) pts.push([sd * (RW - R + R * Math.cos(a * DEG)), tc - R * Math.sin(a * DEG)]);
    pts.push([sd * (RW - R), tc - R]);
    return section(pts, s0, s1, { bevel: 0 });
  };
  const foreGrip = rect(286, 372, -28.6, -20.4, 2.5);     // stippled fore-end zones (below the side rails)
  const flute = rect(58, 182, -1.5, 8, 4);                 // long moulded flute along the upper receiver
  const magHole = cutters.box([229, -40, 0], [43, 62, 27.2]);
  recv = cut(recv, [
    cutters.pocketW([[190, -8, 3.5], [252, -8, 3.5], [252, 10, 3.5], [190, 10, 3.5]], 5, 40),        // ejection port (right)
    cutters.pocketW([[256, 5.2, 3], [356, 5.2, 3], [356, 11.4, 3], [256, 11.4, 3]], -14.5, 40),        // charging-handle slot (left)
    magHole,
    cutters.pocketW([[66, -22, 2], [182, -22, 2], [182, -6, 2], [66, -6, 2]], -(RW - 0.8), 12),       // marking panel left
    cutters.pocketW([[62, -22, 2], [168, -22, 2], [168, -10, 2], [62, -10, 2]], RW - 0.8, 12),        // marking panel right
    pocket(foreGrip, 1, RW, 0.8, 0.6), pocket(foreGrip, -1, RW, 0.8, 0.6),
    pocket(flute, 1, RW, 1.2, 1.0), pocket(flute, -1, RW, 1.2, 1.0),
    filletCut(1, -30, 251, 383.6), filletCut(-1, -30, 251, 383.6),                                   // rounded fore-end belly
    filletCut(1, -39, 383.6, 416), filletCut(-1, -39, 383.6, 416),                                   // rounded hand-stop lip
  ]);
  g.add(recv, 'polymer');
  for (const sd of [1, -1]) g.add(floorSlab(rect(286, 372, -28.6, -20.4, 2.5, 0.62), sd, RW, 0.8), 'polymer_grip');
  // raised moulded surround on the ejection port
  g.add(P([[186.5, -11, 4.5], [255.5, -11, 4.5], [255.5, 11.6, 3], [186.5, 11.6, 3]], { w: 1.4, cw: RW + 0.05, bevel: 0.5, bevelSeg: 1, holes: [[[190, -8, 3.5], [252, -8, 3.5], [252, 10, 3.5], [190, 10, 3.5]]] }), 'polymer');

  // magazine well (part of the moulding): hugs the 39 mm magazine, flares 2.3 mm over its bottom 9 mm with a
  // rounded lip, and opens into a chamfered funnel
  let well = loft([
    ringT(-21, 200.5, 254.5, 18.5, 2.5), ringT(-49, 200.5, 254.5, 18.5, 2.5), ringT(-53, 200.1, 254.9, 18.9, 2.9),
    ringT(-56, 199.0, 256.0, 20.0, 3.6), ringT(-58.4, 198.2, 256.8, 20.8, 4.2), ringT(-59.6, 198.3, 256.7, 20.7, 4.1),
    ringT(-60.3, 199.0, 256.0, 20.0, 3.6),
  ]);
  const funnel = loft([
    ringT(-8, 207.5, 250.5, 13.6, 1.2), ringT(-51, 207.5, 250.5, 13.6, 1.2), ringT(-55, 206.6, 251.4, 14.5, 1.8),
    ringT(-58.5, 204.4, 253.6, 16.6, 2.8), ringT(-62, 202.8, 255.2, 18.0, 3.2),
  ]);
  well = cut(well, [funnel]);
  g.add(well, 'polymer');

  // ---- top rail (full length between the sights) + clamp screws in the slots
  g.add(lrail(58, 386, { t: 21 }), 'alu');
  for (const s of [82, 222, 362]) g.add(headT(s, 24.3, 0, 2.1), 'steel_dark');
  // ---- side rails on the fore-end + bottom rail (polymer accessory rails, screwed to the moulding)
  g.add(lrail(282, 384, { t: -8, w: RW, side: 'right' }), 'polymer');
  g.add(lrail(282, 384, { t: -8, w: -RW, side: 'left' }), 'polymer');
  g.add(lrail(294, 382, { t: -38, side: 'bottom' }), 'polymer');
  for (const s of [293, 373]) {
    g.add(capScrew(s, -8, RW + 3.3, 2.1, 1), 'steel_dark');
    g.add(capScrew(s, -8, -RW - 3.3, 2.1, -1), 'steel_dark');
  }

  // ---- receiver pins (trigger housing, barrel trunnion, stock block): flat black pressed pins
  g.add(pinHeads(274, -23, RW, 2.6), 'steel_dark');      // fore-end / trunnion cross pin
  g.add(pinHeads(398, -14, RW, 2.4), 'steel_dark');      // barrel retaining pin
  g.add(pinHeads(16, -14, RW, 2.8), 'steel_dark');       // rear housing pin
  g.add(pinHeads(184.5, -16, RW, 1.8), 'steel_dark');    // ejector pin (behind the port)
  // rear sling loop (left), front sling loop (left, on the hand stop's flat flank)
  g.add(ring(22, 6.5, 1.5, { t: 4, w: -RW - 1, axis: 's', seg: 20 }), 'steel_dark');
  g.add(B([22, 4, -RW - 0.6], [14, 14, 2], { r: 1 }), 'polymer');
  g.add(ring(396, 6, 1.4, { t: -33, w: -RW - 1, axis: 's', seg: 20 }), 'steel_dark');
  g.add(B([396, -33, -RW - 0.5], [10, 10, 2], { r: 1 }), 'polymer');

  // ---- markings (original name only)
  g.add(text('HOUND-45', { s0: 170, t0: -14, h: 5.6, side: -1, w0: -(RW - 0.8) }), 'polymer');
  g.add(text('CAL.45 HD 04172', { s0: 170, t0: -20, h: 3, side: -1, w0: -(RW - 0.8), stroke: 0.45 }), 'polymer');
  g.add(text('CAL.45', { s0: 68, t0: -18.5, h: 4.2, side: 1, w0: RW - 0.8 }), 'polymer');
  g.add(text('CF ARMS', { s0: 106, t0: -18.5, h: 4.2, side: 1, w0: RW - 0.8 }), 'polymer');
  // riveted steel serial plate moulded into the right rear of the receiver
  g.add(P([[24, -21, 1.5], [56, -21, 1.5], [56, -7, 1.5], [24, -7, 1.5]], { w: 1.2, cw: RW + 0.2, bevel: 0.4, bevelSeg: 1 }), 'steel_dark');
  g.add(head(27, -14, RW + 0.75, 1.2, 1, 0.3, 10), 'steel');
  g.add(head(53, -14, RW + 0.75, 1.2, 1, 0.3, 10), 'steel');
  g.add(text('HD04172', { s0: 30.5, t0: -16, h: 3.4, side: 1, w0: RW + 0.8, stroke: 0.45, depth: 0.3 }), 'steel');

  // ============================================================================ sights
  // rear: rotary diopter drum between protective ears; base and ears are part of the polymer moulding
  g.add(P([[8, 21, 0], [56, 21, 0], [56, 24.5, 2.5], [51, 27.5, 2.5], [12, 27.5, 2.5], [8, 24.5, 2.5]], { w: 26, bevel: 1.5 }), 'polymer');
  for (const sd of [1, -1]) {
    g.add(P([[15, 26, 1], [47, 26, 1], [47, 33, 4], [41, LOS + 4, 5], [21, LOS + 4, 5], [15, 33, 4]], { w: 4, cw: sd * 10.8, bevel: 1.0, bevelSeg: 2 }), 'polymer');
    g.add(head(20.5, 30.5, sd * 12.68, 1.6, sd), 'steel_dark');
    g.add(head(41.5, 30.5, sd * 12.68, 1.6, sd), 'steel_dark');
  }
  let drum = cylW(31, LOS, -7.4, 7.4, 9, { seg: 32, b: 0.5 });
  drum = cut(drum, [
    cyl(0, 60, 1.3, { t: LOS, w: 0, b: 0, seg: 12 }),                                              // in-use aperture
    xform(cyl(0, 60, 1.9, { t: LOS, w: 0, b: 0, seg: 14 }), { rot: [90, 0, 0], pivot: [31, LOS, 0] }), // large aperture (90°)
    xform(cyl(0, 60, 1.0, { t: LOS, w: 0, b: 0, seg: 12 }), { rot: [45, 0, 0], pivot: [31, LOS, 0] }), // fine aperture (45°)
    xform(cutters.box([31, LOS, 0], [28, 2.2, 3]), { rot: [-45, 0, 0], pivot: [31, LOS, 0] }),        // V-notch slot (135°)
  ]);
  g.add(drum, 'steel');
  // knurled rims: 42 fine V-ridges (0.45 mm) cut around the edge, like a turned and knurled ring
  const knurl = [];
  for (let i = 0; i < 84; i++) { const a = (i / 84) * Math.PI * 2, r = i % 2 ? 9.15 : 9.6; knurl.push([31 + r * Math.cos(a), LOS + r * Math.sin(a)]); }
  for (const sd of [1, -1]) g.add(profile(knurl, { w: 2.2, cw: sd * 6.5, bevel: 0.3, bevelSeg: 1, curveSeg: 1 }), 'steel_dark');
  g.add(cylW(31, LOS, -9.5, 9.5, 2.2, { seg: 12 }), 'steel_dark');       // drum axle (ends buried in the ears)
  g.add(head(31, LOS, 12.68, 2.8, 1, 0.4), 'steel_dark');                 // windage / axle screw (right)
  g.add(head(31, LOS, -12.68, 2.8, -1, 0.4), 'steel_dark');               // axle nut (left)
  // front: hooded post on a sight tower at the front of the rail (polymer moulding, steel post)
  g.add(P([[386, 21, 0], [411.5, 21, 0], [411.5, 24.5, 2], [408.5, 31.5, 3], [391.5, 31.5, 3], [386, 25, 2.5]], { w: 17, bevel: 1.6, bevelSeg: 2 }), 'polymer');
  const hs0 = 392.5, hs1 = 407.5, hro = 10.8, hri = 8.0, hb = 0.6;
  g.add(lathe([[hs0 + hb, hri], [hs0, hri + hb], [hs0, hro - hb], [hs0 + hb, hro], [hs1 - hb, hro], [hs1, hro - hb], [hs1, hri + hb], [hs1 - hb, hri], [hs0 + hb, hri]], { t: LOS, seg: 36 }), 'polymer');
  // broad webs flaring from the tower flanks up into the hood ring
  for (const sd of [1, -1]) g.add(section([[sd * 7.6, 23.5], [sd * 8.7, 23.5], [sd * 10.5, 33.2], [sd * 7.6, 33.2]], 393.6, 406.4, { bevel: 0.4, bevelSeg: 1 }), 'polymer');
  g.add(P([[397, 31, 0], [403, 31, 0], [401.3, 33.6, 0.6], [400.6, LOS, 0.3], [399.4, LOS, 0.3], [398.7, 33.6, 0.6]], { w: 1.8, bevel: 0.3 }), 'steel_dark');
  g.add(box([399.3, LOS - 1.3, 0], [0.5, 1.1, 1.1], { r: 0 }), 'tritium');

  // ============================================================================ barrel / muzzle
  g.add(lathe([[408, 0], [408, 13], [410, 14.2], [417, 14.2], [418.5, 12.6], [418.5, 0]], { seg: 28 }), 'steel_dark'); // front cap / nut
  for (let i = 0; i < 6; i++) g.add(xform(box([413.5, 14.2, 0], [5, 1.4, 3], { r: 0 }), { rot: [0, 0, i * 60] }), 'steel_dark'); // spanner flats
  g.add(tube(416, 437.5, 9.4, 5.75, { seg: 24 }), 'steel_dark');
  const prot = [[436, 5.75], [436, 10.2], [437, 11.1]];
  for (const s of [439.5, 442.5]) prot.push([s, 11.1], [s + 0.5, 10.4], [s + 1.3, 10.4], [s + 1.8, 11.1], [s + 2.4, 11.1]);
  prot.push([447, 11.1], [448, 10.2], [448, 6.8], [447.2, 5.75], [436, 5.75]);
  g.add(lathe(prot, { seg: 28 }), 'steel_dark');                      // knurled thread protector, crowned bore
  g.add(cyl(424, 425.5, 5.8, { seg: 16 }), 'steel_dark');             // bore floor (blocks see-through)
  g.add(tube(250, 262, 11.5, 6.2, { seg: 20 }), 'steel');             // chamber end, seen through the port with the bolt back

  // ============================================================================ trigger housing (lower)
  // box under the upper receiver; the pistol grip is lofted below it (oval section, beavertail hump, palm swell)
  g.add(profile([[28, -26.6, 2], [201.5, -26.6, 1], [201.5, -37, 2], [44, -37, 4], [28, -33, 3]], { w: LW, bevel: 3, bevelSeg: 3, curveSeg: 8 }), 'polymer');
  // big glove-friendly trigger guard, narrower than the grip
  g.add(P([[104, -34, 0], [195.6, -34, 0], [195.6, -61, 3], [190, -71, 6], [114, -71, 7], [98, -66, 5], [100, -46, 0]], {
    w: 15, bevel: 2, bevelSeg: 2, holes: [[[112, -36.5, 2], [189, -36.5, 2], [189, -63.5, 5], [117, -63.5, 8], [107, -52, 5]]],
  }), 'polymer');
  // grip: stippled side zones recessed 0.75 mm (the outer skin is cut away there, the inset loft fills the window)
  const gripPanel = [];
  for (let t = -57; t >= -134; t -= 7) gripPanel.push([gripSlice(t).sb + 6.5, t, t === -57 || t === -134 ? 5 : 0]);
  for (let t = -134; t <= -57; t += 7) gripPanel.push([gripSlice(t).sf - 6.5, t, t === -57 || t === -134 ? 5 : 0]);
  const panelPrism = profile(gripPanel, { w: 60, bevel: 0, curveSeg: 4 });
  g.add(cut(gripLoft(0), [panelPrism, cutters.holeW(37.5, -142.5, 2.3)]), 'polymer');   // + lanyard hole through the heel
  g.add(intersect(gripLoft(0.75), panelPrism), 'polymer_grip');
  // housing pins
  g.add(pinHeads(38, -31.4, LW / 2, 2.3), 'steel_dark');
  g.add(pinHeads(170, -31.5, LW / 2, 2.5), 'steel_dark');
  // ambidextrous mag release paddle at the rear of the magwell (inside the guard)
  g.add(P([[183, -36, 1], [190, -36, 1], [190, -58, 2], [185.5, -59, 2.5], [181.5, -48, 3]], { w: 12, bevel: 0.8 }), 'polymer');
  for (let i = 0; i < 4; i++) g.add(box([182 + i * 0.35, -42 - i * 4.2, 0], [1, 1.6, 10], { r: 0 }), 'polymer');

  // selector: flat black paddle on a flat disc hub (both sides) + cartridge pictograms
  // (safe: one white cartridge, semi: one red, auto: three red)
  const sel = g.part('selector', { pivot: [60, -33, 0], extras: { axis: 'w', positions: [0, 45, 90] } });
  for (const sd of [1, -1]) {
    const face = sd * (LW / 2);
    sel.add(cylW(60, -33, sd > 0 ? face : face - 1.4, sd > 0 ? face + 1.4 : face, 6.2, { seg: 24, b: 0.45 }), 'polymer');
    sel.add(P([[60, -36.4, 3], [80, -38.2, 2], [85.6, -37.6, 1.6], [87.4, -34.4, 1.2], [84.6, -33.3, 1.2], [60, -29.6, 3]], { w: 3, cw: face + sd * 2.9, bevel: 0.7, bevelSeg: 2 }), 'polymer');
    sel.add(head(60, -33, face + sd * 4.3, 1.7, sd, 0.3), 'steel_dark');
    g.add(cartridge(90, -33.0, face, sd, 3.2), 'paint_white');
    g.add(cartridge(95.5, -33.0, face, sd, 3.2), 'paint_red');
    for (const s of [101, 103, 105]) g.add(cartridge(s, -33.0, face, sd, 3.2), 'paint_red');
  }

  // ============================================================================ trigger
  const trig = g.part('trigger', { pivot: [128, -33, 0] });
  trig.add(profile('M 123 -35 L 131 -35 Q 129 -46 134.5 -57 Q 132.5 -60.5 129 -58.5 Q 122 -48 123 -35 Z', { w: 7, bevel: 1, curveSeg: 10 }), 'steel_dark');
  for (let i = 0; i < 4; i++) trig.add(box([130.8 + i * 0.75, -44 - i * 3.6, 0], [0.7, 1.2, 6.2], { r: 0, rot: [-24, 0, 0] }), 'steel_dark');

  // ============================================================================ bolt + charging handle
  const bolt = g.part('bolt', { pivot: [200, 2, 0], extras: { travel: 0.08 } });
  bolt.add(B([194.5, 1.5, 0], [110, 21, 31], { r: 2 }), 'steel');
  bolt.add(B([240, 5, 15.6], [16, 3.6, 1.4], { r: 0.5 }), 'steel_dark');                // extractor
  bolt.add(head(233, 5, 16.1, 1.1, 1, 0.3, 10), 'steel_dark');
  bolt.add(B([214, -4.5, 15.6], [44, 2.2, 0.8], { r: 0.3 }), 'steel_dark');             // machined flats
  bolt.add(B([208, 8.5, 15.6], [32, 1.4, 0.6], { r: 0.2 }), 'steel_dark');
  bolt.add(B([200, 2, 15.6], [10, 4.5, 0.6], { r: 0.2 }), 'steel_dark');
  // cocking handle (black polymer): stem in the slot, detent/spring housing at its root, forward-swept arm,
  // vertical knurled knob
  bolt.add(B([346, 8.3, -19.5], [12, 5.6, 12], { r: 1 }), 'polymer');
  bolt.add(lathe([[336.5, 0], [336.5, 2.6], [337.3, 3.2], [350, 3.2], [350, 0]], { t: 8.3, w: -26, seg: 16 }), 'polymer');
  bolt.add(cyl(335.6, 336.6, 1.4, { t: 8.3, w: -26, seg: 10 }), 'steel_dark');            // detent plunger cap
  bolt.add(plan([[339.5, -24, 2], [352.5, -24, 2], [360, -34, 2.5], [356, -39, 2], [347, -36, 2]], { h: 6.5, ct: 8.3, bevel: 1, curveSeg: 4 }), 'polymer');
  const kp = [[0, 0], [0, 5.2], [1.4, 6.2]];
  for (let i = 0; i < 5; i++) { const a = 3.4 + i * 2.6; kp.push([a - 0.7, 6.2], [a, 5.5], [a + 0.7, 6.2]); }
  kp.push([15.6, 6.2], [17, 5.2], [17, 0]);
  bolt.add(xform(lathe(kp, { seg: 20 }), { rot: [90, 0, 0], move: [356, 0, -39] }), 'polymer_grip');
  bolt.add(headT(356, 17, -39, 3.2, 0.4), 'steel_dark');

  // ============================================================================ magazine (25 rd straight .45)
  const mag = g.part('mag', { pivot: [229, -16, 0], extras: { drop: true } });
  const magTex = rect(215.6, 245, -199.5, -143, 2);   // textured lower third (recessed)
  mag.add(cut(P([[209.8, -16, 1.5], [248.8, -16, 1.5], [248.8, -207, 2], [209.8, -207, 2]], { w: 26, bevel: 2.2, bevelSeg: 3 }),
    [pocket(magTex, 1, 13, 0.7, 0.5), pocket(magTex, -1, 13, 0.7, 0.5)]), 'polymer');
  for (const sd of [1, -1]) mag.add(floorSlab(rect(215.6, 245, -199.5, -143, 2, 0.52), sd, 13, 0.7), 'polymer_grip');
  // side ribs (upper two thirds), raised rib down the front face, rear spine with the catch notch
  for (const sd of [1, -1]) for (const s of [219, 239]) mag.add(B([s, -102, sd * 13.1], [3.2, 76, 1.4], { r: 0.6 }), 'polymer');
  mag.add(B([249.4, -111, 0], [1.8, 174, 8], { r: 0.6 }), 'polymer');
  mag.add(B([208.7, -110, 0], [2.4, 180, 14], { r: 0.8 }), 'polymer');
  mag.add(box([207.2, -40, 0], [1.8, 6, 10], { r: 0 }), 'steel_dark'); // catch plate
  // floor plate: 1.5 mm step all round where it meets the body
  mag.add(P([[208.3, -205.2, 1], [250.3, -205.2, 1], [250.8, -213, 2.5], [207.8, -213, 2.5]], { w: 29, bevel: 1.2, bevelSeg: 2 }), 'polymer');
  mag.add(cylT(229, 0, -214, -211, 3.2, { seg: 12 }), 'steel_dark');
  // feed lips + top cartridge (round-nose .45)
  for (const sd of [1, -1]) mag.add(P([[212, -17, 1], [242, -17, 1], [242, -11, 2], [212, -11, 2]], { w: 2.4, cw: sd * 9.8, bevel: 0.6 }), 'steel_dark');
  mag.add(cyl(213.5, 236.5, 5.9, { t: -12.5, w: 2.6, seg: 16 }), 'brass');
  mag.add(lathe([[236, 0], [236, 5.7], [239.5, 5.7], [243, 4.6], [245.5, 2.6], [246.4, 0]], { t: -12.5, w: 2.6, seg: 16 }), 'copper');
  mag.add(cyl(214, 233, 5.9, { t: -20.5, w: -2.6, seg: 14 }), 'brass');
  // witness numbers on the right of the body
  for (const [n, t] of [['5', -172], ['15', -140], ['25', -108]]) mag.add(text(n, { s0: 212.4, t0: t, h: 3.2, side: 1, w0: 13, stroke: 0.5, depth: 0.4 }), 'polymer');

  // ============================================================================ side-folding skeleton stock
  // stock head (hinge block)
  g.add(P([[-24, 18, 1.2], [-1, 18, 2], [-1, -31, 2], [-24, -31, 3]], { w: 32, bevel: 2.6, bevelSeg: 3 }), 'polymer');
  // top (cheek) strut: 27 x 21 mm rounded section, roots flared into the stock head and the butt block (R9 fillets)
  const topT = (s) => 16.6 + (s + 24) * 0.0115;
  const topRings = [];
  for (const s of [-19, -22, -24, -24.6, -25.3, -26.2, -27.3, -28.6, -30, -31.5, -33, -36, -42, -60, -90, -120, -150, -175,
    -190, -196, -199, -200.7, -202, -203, -203.8, -204.4, -205, -207, -210]) {
    const eh = ef(-24 - s, 9), eb = ef(s + 205, 9);
    const top = topT(s) + ef(s + 205, 3) * 0.4;
    const bot = topT(s) - 21 - eh - eb;
    topRings.push(rrUV(13.5 + (2.1 * eh) / 9 + (3.0 * eb) / 9, bot, top, 6, 4).map(([u, v]) => [s, v, u]));
  }
  const cheek = [[-60, 2.6, 2.5], [-185, 0.9, 2.5], [-185, 7.9, 2.5], [-60, 9.6, 2.5]];
  const cheekIn = [[-60.6, 3.2, 1.9], [-184.4, 1.5, 1.9], [-184.4, 7.3, 1.9], [-60.6, 9.0, 1.9]];
  g.add(cut(loft(topRings), [pocket(cheek, 1, 13.5), pocket(cheek, -1, 13.5)]), 'polymer');
  for (const sd of [1, -1]) g.add(floorSlab(cheekIn, sd, 13.5), 'polymer_grip');
  // diagonal strut: 25 x 17 mm rounded section along its own axis, flared into the head (top) and the butt block
  const dS = -0.9359, dT = -0.3523, nS = -0.3523, nT = 0.9359;   // axis (rearward-down) and its upward normal
  const diagRings = [];
  for (const u of [-8, -5, -2, 0, 1, 2.2, 3.5, 5, 6.5, 8, 10, 13, 18, 40, 70, 100, 130, 160, 176, 181, 183.5, 185.3, 186.6,
    187.8, 189, 190.5, 192.5, 195, 199]) {
    const cs = -24 + u * dS + 8.5 * nS, ct = -30.5 + u * dT + 8.5 * nT;
    const ft = ef(u + 6.4, 9) + ef(187.0 - u, 9), fb = ef(193.4 - u, 4);
    const hw = 12.5 + (3.1 * ef(u + 3.2, 9)) / 9 + (4.0 * ef(190.2 - u, 9)) / 9;
    diagRings.push(rrUV(hw, -8.5 - fb, 8.5 + ft, 5.5, 4).map(([a, b]) => [cs + b * nS, ct + b * nT, a]));
  }
  g.add(loft(diagRings), 'polymer');
  // butt block with stippled flanks
  const buttTex = rect(-221, -210, -86, 4, 3);
  g.add(cut(P([[-205, 18.8, 3], [-226, 18.8, 3], [-226, -104.3, 3], [-205, -104.3, 3]], { w: 34, bevel: 3.4, bevelSeg: 3 }),
    [pocket(buttTex, 1, 17), pocket(buttTex, -1, 17)]), 'polymer');
  for (const sd of [1, -1]) g.add(floorSlab(rect(-221, -210, -86, 4, 3, 0.62), sd, 17), 'polymer_grip');
  // rubber butt pad: rounded block + a separate comb of horizontal ribs on its rear face (a 3 mm bevel on the
  // serrated outline itself self-intersects and leaves spikes at the corners)
  g.add(profile([[-227, 19.5, 2], [-227, -105.5, 2], [-238.6, -103, 5], [-238.6, 17.5, 4]], { w: 36, bevel: 3, bevelSeg: 2, curveSeg: 4 }), 'rubber');
  const comb = [[-237.6, -97.5]];
  for (let t = -94; t <= 8; t += 6.8) comb.push([-240.4, t, 0.8], [-240.4, t + 3.4, 0.8], [-237.6, t + 3.9], [-237.6, t + 6.3]);
  comb.push([-237.6, 14.5]);
  g.add(profile(comb, { w: 31, bevel: 0.6, bevelSeg: 1, curveSeg: 2 }), 'rubber');
  // hinge (right side): polymer knuckles top/bottom on the receiver, stock knuckle in the middle, steel pin
  g.add(cylT(-0.5, 17.5, 7.5, 16, 5.6, { seg: 18 }), 'polymer');
  g.add(cylT(-0.5, 17.5, -26, -15.5, 5.6, { seg: 18 }), 'polymer');
  g.add(cylT(-0.5, 17.5, -14.8, 6.8, 5.6, { seg: 18 }), 'polymer');
  g.add(cylT(-0.5, 17.5, -27, 17.4, 2, { seg: 10 }), 'steel_dark');
  g.add(headT(-0.5, 16, 17.5, 3.4, 0.45), 'steel_dark');
  // fold latch button (left side of the stock head)
  g.add(cylW(-12, -6, -17.6, -15, 5, { seg: 18, b: 0.6 }), 'polymer');
  g.add(cylW(-12, -6, -18.6, -16.5, 3.6, { seg: 16, b: 0.5 }), 'polymer_grip');
  // stock sling slot
  g.add(B([-216, -96, 0], [6, 4, 36], { r: 1 }), 'steel_dark');

  // ============================================================================ sockets / meta
  g.socket('muzzle', [448, 0, 0]);
  g.socket('eject', [222, 1, RW], { dir: [0.1, 0.45, 1] });
  g.socket('grip_r', [71, -88, 0], { rot: [0, 0, -17] });
  g.socket('grip_l', [336, -45, -4]);
  g.socket('magwell', [229, -84, 0]);
  g.socket('charge', [356, 8.5, -39]);
  g.socket('sight_rear', [31, LOS, 0]);
  g.socket('sight_front', [400, LOS, 0]);
  g.meta({ grip: 'rifle', support: 'handguard', reload: 'mag', chargeSide: 'left',
    notes: 'Cocking handle on the left, front (HK style); bolt part = handle + visible bolt (travel 80 mm). Stock folds to the right on a vertical hinge at s=-0.5 mm, w=+17.5 mm (kept static in body). Selector part rotates about w.' });

  // matte black hardware: wear only on sharp edges (see rewear); paint-filled pictograms never wear
  // polymer: curvature that maps to full wear 1/420 m (default 1/150) so the 2-3 mm moulding bevels still scuff but
  // the big rounded forms (grip oval, R6 stock struts, magazine body) don't wash out grey
  const WEAR = {
    '*:steel_dark': [1 / 1300, 0.55], '*:steel': [1 / 1300, 0.6], 'body:steel': [1 / 700, 0.9], 'bolt:steel': 1 / 450, 'bolt:steel_dark': [1 / 1300, 0.7],
    'body:alu': [1 / 1300, 0.7], '*:paint_white': 0, '*:paint_red': 0,
    'body:polymer': 1 / 420, 'mag:polymer': 1 / 420, 'bolt:polymer': 1 / 420, 'selector:polymer': 1 / 420,
  };
  const build0 = g.build.bind(g);
  g.build = (opts) => { const root = build0(opts); rewear(root, WEAR); return root; };
  return g;
}
