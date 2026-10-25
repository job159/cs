// Sculpting helpers for premium weapon models (tools/assets/weapons/*.mjs), on top of gunkit.mjs.
// Generic pieces first written for X03 sunbow.mjs (lofts, tapered tubes, design-space relief strokes, 雲雷紋 bands,
// gems, petals, bake tessellation) plus the cylinder / helix / frame maps the X04 staff needed. All geometry is in
// gunkit's side-view millimetres: [s, t, w] = forward, up, right (three space x = w, y = t, z = -s).
import * as THREE from 'three';
import { toCreasedNormals, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';
import { V, lathe, sweep, cut, merge, xform } from './gunkit.mjs';

export const D2R = Math.PI / 180;
export const TAU = Math.PI * 2;
export const clamp01 = (x) => Math.max(0, Math.min(1, x));
export const smooth = (a, b, x) => { const u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); };
export const lerp = (a, b, u) => a + (b - a) * u;
export const cat = (...L) => [].concat(...L);

// ------------------------------------------------------------------------------------------ vectors ([s, t, w] arrays)
export const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vmul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const vlen = (a) => Math.hypot(a[0], a[1], a[2]);
export const vnorm = (a) => vmul(a, 1 / (vlen(a) || 1));
export const vlerp = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
/** a + x X + y Y + z Z (a local frame) */
export const vfr = (a, X, Y, Z, x, y, z) => [a[0] + X[0] * x + Y[0] * y + Z[0] * z, a[1] + X[1] * x + Y[1] * y + Z[1] * z, a[2] + X[2] * x + Y[2] * y + Z[2] * z];

// ------------------------------------------------------------------------------------------ placement
const ROT = { s: null, '-s': [0, 180, 0], t: [90, 0, 0], '-t': [-90, 0, 0], w: [0, -90, 0], '-w': [0, 90, 0] };
/** lathe along `axis` ('t' runs up, '-s' towards the shooter...) starting at `at` (s, t, w) */
export function lax(pts, at, axis = 's', seg = 20, crease) {
  const g = lathe(pts, { seg, crease });
  if (ROT[axis]) xform(g, { rot: ROT[axis] });
  const c = V(...at);
  g.translate(c.x, c.y, c.z);
  return g;
}
const _qa = new THREE.Quaternion(), _fw = new THREE.Vector3(0, 0, -1);
/** geometry authored along +s from the origin, turned towards the [s,t,w] direction d and moved to a */
export function aimDir(geo, a, d, roll = 0) {
  if (roll) geo.rotateZ(roll * D2R);
  _qa.setFromUnitVectors(_fw, V(...d).normalize());
  geo.applyQuaternion(_qa);
  const A = V(...a);
  geo.translate(A.x, A.y, A.z);
  return geo;
}
/** lathe profile [[along, r]...] aimed along the [s,t,w] direction d from a */
export const along = (pts, a, d, seg = 16, crease) => aimDir(lathe(pts, { seg, crease }), a, d);
/** slotted screw head on an arbitrary surface normal n (slot across, 0.5 mm deep) */
export function slotScrew(at, n, r, d = 1.3) {
  const g = along([[-0.3, 0], [-0.3, r], [d * 0.55, r * 0.98], [d, r * 0.62], [d, 0]], at, n, 12, 50);
  const N = V(...n).normalize(), A = V(...at).addScaledVector(N, d), up = Math.abs(N.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const slot = new THREE.BoxGeometry(r * 2.6, 0.5, 1.0);
  slot.applyMatrix4(new THREE.Matrix4().lookAt(new THREE.Vector3(), N, up)); slot.translate(A.x, A.y, A.z);
  return cut(g, [slot]);
}
/** domed rivet / pin head on a surface normal n */
export const domeAt = (at, n, r, d = r * 0.7, seg = 10) => along([[-0.3, 0], [-0.3, r], [d * 0.5, r * 0.82], [d, 0]], at, n, seg, 70);
const _domes = new Map();
/** granulation bead: a smooth low dome (radius r, height h) standing on a surface at c along the normal n */
export function dome(c, n, r, h = r * 0.78) {
  const k = r.toFixed(3) + ':' + h.toFixed(3);
  if (!_domes.has(k)) _domes.set(k, lathe([[-0.3 * r, r], [0.5 * h, r * 0.8], [h, 0]], { seg: 6, crease: 85 }));
  return aimDir(_domes.get(k).clone(), c, n);
}

// ------------------------------------------------------------------------------------------ meshes and lofts
const _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _vc = new THREE.Vector3();
/** indexed [s,t,w] triangles -> non-indexed geometry with creased normals; closed solids are wound outward */
export function mesh(P, I, { crease = 40, closed = true } = {}) {
  const pos = new Float32Array(P.length);
  for (let i = 0; i < P.length; i += 3) { pos[i] = P[i + 2]; pos[i + 1] = P[i + 1]; pos[i + 2] = -P[i]; }
  if (closed) {
    let vol = 0;
    for (let i = 0; i < I.length; i += 3) {
      _va.fromArray(pos, I[i] * 3); _vb.fromArray(pos, I[i + 1] * 3); _vc.fromArray(pos, I[i + 2] * 3);
      vol += _va.dot(_vb.cross(_vc));
    }
    if (vol < 0) for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(I);
  return toCreasedNormals(geo.toNonIndexed(), crease * D2R);
}
/** loft through closed rings of [s,t,w] points (equal counts); ends capped by a fan to the ring centroid, or the last
 *  ring joined back to the first (wrap) */
export function loft(rings, { capA = true, capB = true, crease = 40, wrap = false } = {}) {
  const n = rings[0].length, m = rings.length, P = [], I = [];
  for (const r of rings) for (const p of r) P.push(p[0], p[1], p[2]);
  for (let k = 0; k < (wrap ? m : m - 1); k++) {
    const k2 = (k + 1) % m;
    for (let i = 0; i < n; i++) {
      const a = k * n + i, b = k * n + (i + 1) % n;
      I.push(a, k2 * n + i, b, b, k2 * n + i, k2 * n + (i + 1) % n);
    }
  }
  const cap = (k, rev) => {
    const r = rings[k], c = [0, 0, 0];
    for (const p of r) { c[0] += p[0] / n; c[1] += p[1] / n; c[2] += p[2] / n; }
    const ci = P.length / 3;
    P.push(...c);
    for (let i = 0; i < n; i++) { const a = k * n + i, b = k * n + (i + 1) % n; if (rev) I.push(ci, b, a); else I.push(ci, a, b); }
  };
  if (!wrap && capA) cap(0, false);
  if (!wrap && capB) cap(m - 1, true);
  return mesh(P, I, { crease, closed: wrap || (capA && capB) });
}
/** a merged set of closed solids (three space, non-indexed) wound outward */
export function outward(geo) {
  const p = geo.attributes.position.array;
  let vol = 0;
  for (let i = 0; i < p.length; i += 9) vol += p[i] * (p[i + 4] * p[i + 8] - p[i + 5] * p[i + 7]) - p[i + 1] * (p[i + 3] * p[i + 8] - p[i + 5] * p[i + 6]) + p[i + 2] * (p[i + 3] * p[i + 7] - p[i + 4] * p[i + 6]);
  if (vol < 0) for (let i = 0; i < p.length; i += 9) for (let c = 0; c < 3; c++) { const t = p[i + 3 + c]; p[i + 3 + c] = p[i + 6 + c]; p[i + 6 + c] = t; }
  return geo;
}
/** tapered tube along a polyline of [s,t,w] points (r0 -> r1, or r(u) a function), rounded-ish ends */
export function ttube(pts, r0, r1, { radial = 8, seg = 24, caps = true, crease = 60 } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const fr = curve.computeFrenetFrames(seg, false), rings = [], R = typeof r0 === 'function' ? r0 : (u) => lerp(r0, r1, u);
  for (let i = 0; i <= seg; i++) {
    const u = i / seg, c = curve.getPointAt(u), r = R(u) * (caps && (i === 0 || i === seg) ? 0.55 : 1);
    const N = fr.normals[i], B = fr.binormals[i], ring = [];
    for (let j = 0; j < radial; j++) { const a = j / radial * TAU; ring.push([c.x + (N.x * Math.cos(a) + B.x * Math.sin(a)) * r, c.y + (N.y * Math.cos(a) + B.y * Math.sin(a)) * r, c.z + (N.z * Math.cos(a) + B.z * Math.sin(a)) * r]); }
    rings.push(ring);
  }
  return loft(rings, { crease });
}
/** smooth function through [x, y] control points sorted by x (Catmull-Rom Hermite, clamped ends) */
export function curveFn(pts) {
  const n = pts.length;
  const m = (k) => { const a = pts[Math.max(0, k - 1)], b = pts[Math.min(n - 1, k + 1)]; return (b[1] - a[1]) / (b[0] - a[0]); };
  return (x) => {
    if (x <= pts[0][0]) return pts[0][1];
    if (x >= pts[n - 1][0]) return pts[n - 1][1];
    let i = 0;
    while (x > pts[i + 1][0]) i++;
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], h = x1 - x0, t = (x - x0) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * m(i) * h + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * m(i + 1) * h;
  };
}
export const arcP = (cx, cy, r, a0, a1, n) => { const o = []; for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * D2R; o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return o; };
export const circleP = (cx, cy, r, n = 40) => arcP(cx, cy, r, 0, 360 * (n - 1) / n, n - 1);
/** closed polygon moved inwards by d (mitred) */
export function insetPoly(poly, d) {
  let A = 0; for (let i = 0; i < poly.length; i++) { const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length]; A += x0 * y1 - x1 * y0; }
  const s = A > 0 ? 1 : -1, n = poly.length;
  return poly.map((p, i) => {
    const a = poly[(i + n - 1) % n], b = poly[(i + 1) % n];
    const e1 = [p[0] - a[0], p[1] - a[1]], e2 = [b[0] - p[0], b[1] - p[1]], l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1;
    const n1 = [-e1[1] / l1 * s, e1[0] / l1 * s], n2 = [-e2[1] / l2 * s, e2[0] / l2 * s];
    const k = d / Math.max(0.3, 1 + n1[0] * n2[0] + n1[1] * n2[1]);
    return [p[0] + (n1[0] + n2[0]) * k, p[1] + (n1[1] + n2[1]) * k];
  });
}

// ------------------------------------------------------------------------------------------ design-space relief
// Relief is built as triangle lists in design space (u right, v up, z = height off the surface, mm), wound outward,
// then mapped onto a surface (mapTris). Strokes are lofted ribbons: a 1 mm wire costs a few triangles per 2.5 mm.
export function windOut(T) {
  let vol = 0;
  for (let i = 0; i < T.length; i += 9) vol += T[i] * (T[i + 4] * T[i + 8] - T[i + 5] * T[i + 7]) - T[i + 1] * (T[i + 3] * T[i + 8] - T[i + 5] * T[i + 6]) + T[i + 2] * (T[i + 3] * T[i + 7] - T[i + 4] * T[i + 6]);
  if (vol < 0) for (let i = 0; i < T.length; i += 9) for (let c = 0; c < 3; c++) { const t = T[i + 3 + c]; T[i + 3 + c] = T[i + 6 + c]; T[i + 6 + c] = t; }
  return T;
}
/** closed rings of [u, v, z] -> triangles; ends fanned to the ring centroids unless wrapped */
export function loftT(rings, { wrap = false } = {}) {
  const T = [], m = rings.length, n = rings[0].length, tri = (a, b, c) => T.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  for (let k = 0; k < (wrap ? m : m - 1); k++) {
    const A = rings[k], N = rings[(k + 1) % m];
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; tri(A[i], N[i], A[j]); tri(A[j], N[i], N[j]); }
  }
  if (!wrap) for (const [k, rev] of [[0, false], [m - 1, true]]) {
    const r = rings[k], c = [0, 0, 0];
    for (const p of r) { c[0] += p[0] / n; c[1] += p[1] / n; c[2] += p[2] / n; }
    for (let i = 0; i < n; i++) { const a = r[i], b = r[(i + 1) % n]; if (rev) tri(c, b, a); else tri(c, a, b); }
  }
  return windOut(T);
}
/** a polyline resampled so no segment exceeds `step` */
export function resample(path, step, closed = false) {
  const P = [], n = path.length;
  for (let i = 0; i < n - (closed ? 0 : 1); i++) {
    const a = path[i], c = path[(i + 1) % n], L = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (L < 1e-6) continue;
    const k = Math.max(1, Math.ceil(L / step));
    for (let j = 0; j < k; j++) P.push([lerp(a[0], c[0], j / k), lerp(a[1], c[1], j / k)]);
  }
  if (!closed) P.push(path[n - 1]);
  return P;
}
/**
 * Raised stroke along a path [[u, v], ...]: width w (mm, or (f along 0..1) => mm) from z0 to z1 with chamfered top
 * edges (b); flutes [[across -1..1, depth], ...] run along it as V grooves. Mitred joints.
 */
export function ribbonT(path, w, z0, z1, { b = 0.3, closed = false, step = 2.5, flutes = [] } = {}) {
  const P = resample(path, step, closed), n = P.length, acc = [0];
  for (let i = 1; i < n; i++) acc.push(acc[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const tot = acc[n - 1] || 1, W = typeof w === 'function' ? w : () => w;
  const nrm = (a, c) => { const dx = c[0] - a[0], dy = c[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };
  const rings = [];
  for (let i = 0; i < n; i++) {
    const n1 = closed || i > 0 ? nrm(P[(i + n - 1) % n], P[i]) : null, n2 = closed || i < n - 1 ? nrm(P[i], P[(i + 1) % n]) : null;
    let m;
    if (!n1) m = n2; else if (!n2) m = n1; else { const k = 1 / Math.max(0.35, 1 + n1[0] * n2[0] + n1[1] * n2[1]); m = [(n1[0] + n2[0]) * k, (n1[1] + n2[1]) * k]; }
    const h = Math.max(0.06, W(acc[i] / tot) / 2), bb = Math.min(b, h * 0.6, (z1 - z0) * 0.5);
    const xs = [[-h, z0], [-h, z1 - bb], [-h + bb, z1]];
    for (const [f, d] of flutes) { const fw = Math.min(0.75, h * 0.28), x = f * h; xs.push([x - fw, z1], [x, z1 - Math.min(d, (z1 - z0) * 0.5)], [x + fw, z1]); }
    xs.push([h - bb, z1], [h, z1 - bb], [h, z0]);
    rings.push(xs.map(([x, z]) => [P[i][0] + m[0] * x, P[i][1] + m[1] * x, z]));
  }
  return loftT(rings, { wrap: closed });
}
/** filled plate from a star-shaped outline: wall, chamfer, concentric rings to the centre (no slivers) */
export function fanT(poly, z0, z1, { b = 0.3, step = 2.5, rings = 2 } = {}) {
  const O = resample(poly, step, true), I0 = insetPoly(O, b), c = [0, 0];
  for (const p of O) { c[0] += p[0] / O.length; c[1] += p[1] / O.length; }
  const R = [O.map(([u, v]) => [u, v, z0]), O.map(([u, v]) => [u, v, z1 - b]), I0.map(([u, v]) => [u, v, z1])];
  for (let k = 1; k <= rings; k++) R.push(I0.map(([u, v]) => [lerp(u, c[0], k / (rings + 1)), lerp(v, c[1], k / (rings + 1)), z1]));
  return loftT(R);
}
/** design-space triangles -> three-space geometry via map(u, v, z) -> [s, t, w]; the map's handedness is checked at
 *  the design centroid (a mirrored face flips every triangle) */
export function mapTris(T, map, crease = 35) {
  const pos = new Float32Array(T.length), c = [0, 0, 0], n = T.length / 3;
  for (let i = 0; i < T.length; i += 3) {
    const q = V(...map(T[i], T[i + 1], T[i + 2])); pos[i] = q.x; pos[i + 1] = q.y; pos[i + 2] = q.z;
    c[0] += T[i] / n; c[1] += T[i + 1] / n; c[2] += T[i + 2] / n;
  }
  const e = 0.05, M = (a, b, z) => V(...map(a, b, z)), o = M(...c);
  const du = M(c[0] + e, c[1], c[2]).sub(o), dv = M(c[0], c[1] + e, c[2]).sub(o), dz = M(c[0], c[1], c[2] + e).sub(o);
  if (du.cross(dv).dot(dz) < 0) for (let i = 0; i < pos.length; i += 9) for (let k = 0; k < 3; k++) { const t = pos[i + 3 + k]; pos[i + 3 + k] = pos[i + 6 + k]; pos[i + 6 + k] = t; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return toCreasedNormals(g, crease * D2R);
}
/**
 * Wraps design space round a cylinder about the t axis through [cs, ?, cw]: u = arc length (mm) round from the +s side
 * towards +w, v = t, z = height off the radius R.
 */
export const cylMap = (R, { cs = 0, cw = 0, a0 = 0 } = {}) => (u, v, z) => { const a = a0 + u / R; return [cs + (R + z) * Math.cos(a), v, cw + (R + z) * Math.sin(a)]; };

// ------------------------------------------------------------------------------------------ motifs
/** square spiral centreline filling [0, L]^2 from its outer corner, turning left, pitch p */
export function sqSpiral(L, p) {
  const D = [[1, 0], [0, 1], [-1, 0], [0, -1]], lens = [L, L, L];
  for (let l = L - p; l > p * 0.75; l -= p) lens.push(l, l);
  const pts = [[0, 0]];
  let x = 0, y = 0;
  lens.forEach((len, k) => { x += D[k % 4][0] * len; y += D[k % 4][1] * len; pts.push([x, y]); });
  return pts;
}
/** 雲雷紋 band: square spirals of alternating hand between two border lines over u0..u1 x v0..v1 (z0 -> z1) */
export function thunderT(u0, u1, v0, v1, z0, z1, { lw = 0.95, gap = 0.8, border = true } = {}) {
  const out = [], p = lw + gap;
  if (border) for (const v of [v0 + lw / 2, v1 - lw / 2]) out.push(ribbonT([[u0, v], [u1, v]], lw, z0, z1, { step: 4 }));
  const a0 = border ? v0 + lw + gap : v0, a1 = border ? v1 - lw - gap : v1, H = a1 - a0;
  const n = Math.max(1, Math.round((u1 - u0) / H)), cw = (u1 - u0) / n, cell = Math.min(cw, H), L = cell - lw - gap;
  for (let k = 0; k < n; k++) {
    const cu = u0 + cw * (k + 0.5), cv = (a0 + a1) / 2, mir = k % 2 ? -1 : 1;
    out.push(ribbonT(sqSpiral(L, p).map(([x, y]) => [cu + mir * (x - L / 2), cv + (y - L / 2)]), lw, z0, z1, { step: 5 }));
  }
  return cat(...out);
}
/** cloud curl: a spiral stroke (1.35 turns) with a short tail, tapering inwards; dir 1 = counter-clockwise */
export function curlT(cu, cv, r0, dir, a0, z0, z1, lw = 0.9) {
  const ta = a0 * D2R, pts = [[cu + Math.cos(ta) * r0 + Math.sin(ta) * dir * r0 * 1.3, cv + Math.sin(ta) * r0 - Math.cos(ta) * dir * r0 * 1.3]];
  for (let i = 0; i <= 16; i++) { const u = i / 16, a = (a0 + dir * u * 1.35 * 360) * D2R, rr = r0 * (1 - 0.7 * u); pts.push([cu + Math.cos(a) * rr, cv + Math.sin(a) * rr]); }
  return ribbonT(pts, (f) => lw * (1 - 0.35 * f), z0, z1, { step: 2, b: 0.25 });
}
/** brilliant-cut stone (n-fold) with its table facing +s from the centre C (girdle radius R0) */
export function brilliant(C, R0, { n = 16, tableR = 0.56, crownH = 0.42, girdle = 0.07, pavH = 0.8, starR = 0.8, starH = 0.55 } = {}) {
  const P = [], I = [];
  const pt = (a, r, ang) => { P.push(C[0] - a, C[1] + Math.cos(ang) * r, C[2] + Math.sin(ang) * r); return P.length / 3 - 1; };
  const d = TAU / n, g = girdle * R0 / 2, hc = crownH * R0, hp = pavH * R0;
  const T = [], S = [], G = [], H = [], G2 = [], H2 = [], Q = [];
  for (let k = 0; k < n; k++) {
    T.push(pt(g + hc, tableR * R0, k * d)); S.push(pt(g + starH * hc, starR * R0, (k + 0.5) * d));
    G.push(pt(g, R0, k * d)); H.push(pt(g, R0, (k + 0.5) * d)); G2.push(pt(-g, R0, k * d)); H2.push(pt(-g, R0, (k + 0.5) * d));
    Q.push(pt(-g - hp * 0.76, R0 * 0.24, (k + 0.5) * d));
  }
  const tc = pt(g + hc, 0, 0), cu = pt(-g - hp, 0, 0);
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n, km = (k + n - 1) % n;
    I.push(tc, T[k], T[k1], T[k], S[k], T[k1], T[k], S[km], G[k], T[k], G[k], S[k], S[k], G[k], H[k], S[k], H[k], G[k1]);
    I.push(G[k], G2[k], H2[k], G[k], H2[k], H[k], H[k], H2[k], G2[k1], H[k], G2[k1], G[k1]);
    I.push(G2[k], Q[k], H2[k], H2[k], Q[k], G2[k1], cu, Q[km], G2[k], cu, G2[k], Q[k]);
  }
  return mesh(P, I, { crease: 1 });
}
/** flame petal: base b, rising along axis D, bulging along radial Rd, side Sd; length L, half width W, thickness th */
export function petal(b, D, Rd, Sd, L, W, th, { bulge = 11, flick = 7, nu = 12, na = 8, crease = 55 } = {}) {
  const rings = [];
  for (let i = 0; i <= nu; i++) {
    const x = i / nu, out = bulge * Math.sin(Math.PI * x * 0.8) + flick * x * x * x;
    const c = [b[0] + D[0] * x * L + Rd[0] * out, b[1] + D[1] * x * L + Rd[1] * out, b[2] + D[2] * x * L + Rd[2] * out];
    const wv = Math.max(0.15, W * Math.sin(Math.PI * Math.pow(Math.max(0.02, x), 0.75)) * (1 - 0.2 * x)), tv = Math.max(0.12, th * (1 - 0.75 * x)), r = [];
    for (let j = 0; j < na; j++) { const a = j / na * TAU, cs = Math.cos(a) * wv, sn = Math.sin(a) * tv; r.push([c[0] + Sd[0] * cs + Rd[0] * sn, c[1] + Sd[1] * cs + Rd[1] * sn, c[2] + Sd[2] * cs + Rd[2] * sn]); }
    rings.push(r);
  }
  return loft(rings, { crease });
}
/** helical cord / wire round the t axis: radius R (to the cord centre), from t0 rising `turns` times by `pitch` */
export function helixCord(R, t0, turns, pitch, r, { a0 = 0, radial = 6, perTurn = 28, cs = 0, cw = 0 } = {}) {
  const P = [], n = Math.max(4, Math.round(turns * perTurn));
  for (let i = 0; i <= n; i++) { const u = i / n, a = a0 + u * turns * TAU; P.push([cs + R * Math.cos(a), t0 + u * turns * pitch, cw + R * Math.sin(a)]); }
  return sweep(P, r, { seg: n, radial });
}

// ------------------------------------------------------------------------------------------ bake
/** bake tessellation of the triangles that need it (thin slivers kept whole) */
export function tessellateFat(geo, maxEdge, thin) {
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
export { merge, sweep };
