// 彤弓．落陽 Tonggong Sunfall — X03 神兵 great bow, docs/PREMIUM_WEAPONS.md §2.30.
// 「帝俊賜羿彤弓素矰」: a Manchu-proportioned long-siyah composite bow blown up to mythic size (1.76 m braced), the riser
// cast as a Sanxingdui-style bronze 扶桑 tree: 「九日居下枝，一日居上枝」 — nine sun cups on its lower branches (the
// nine arrows, fx_ray1-9, lit = loaded) and the tenth sun, the 日珠 focus (fx_sun), in a window on the top branch.
//   - riser: one bronze loft (super-ellipse sections) shifted left over the arrow shelf (thumb draw: the arrow passes
//     on the right), swelling into a round boss at the window. Cast relief panels on the belly the archer looks at
//     (雲雷紋 thunder-scroll bands, the 扶桑 trunk with bark grooves and branch roots, a nine-spoke sun wheel with a
//     gold boss, root systems below the grip): raised bronze on a patinated floor (part 'relief', verdigris cavity);
//     red-lacquer flank panels with gold borders and ruyi inlays; nine tapered branches with root flares and leaves
//     ending in gold sun cups (16 bevelled flame tongues, granulation) round their glow cores;
//   - the window: conforming gold bezels with granulation on both faces, a gold sun-ray halo flaring past the riser
//     outline, a static gold seat ring, and the 日珠 rotor (fx_sun): a 16-fold brilliant-cut stone in a pierced gold
//     sun-wheel collet with eight claws folding over the girdle; three 扶桑 crown leaves in a gold calyx (fx_leafL/C/R,
//     staggered layers, they fan open on a full draw, §1.17);
//   - grip: pebbled leather, 12 silk cords woven over-under, gold ferrules with granulation, a tie-off knot;
//     a cloud-lobed bronze arrow shelf with a pearl pad;
//   - fork sockets: a cast collar flaring off each riser end (granulation, thunder band, gold ruyi cheek plates with
//     slotted screws) and a bronze limb shoe with ogee lappets riding the limb (no seam at the root);
//   - limbs (fx_limbU / fx_limbL, hinged at the fork): horn belly (crowned), bamboo core, sinew back under red lacquer;
//     gold-leaf edge wires, a ruyi chain on the belly, a running 卷雲 scroll on the back;
//   - siyahs (fx_earU / fx_earL): a lofted scarf knee (limb section -> siyah section) bound in 30 turns of silk between
//     beaded gold bands; a tapered, back-swept horn ear widening to the nock, a pinned bone overlay, a carved bone
//     bridge saddle with the string in its groove, a bone tip with a notch and the string loop, and a 扶桑 flame-bud
//     finial (six gold petals round a gold bud with a crystal tip);
//   - string (fx_strU / fx_strL): white silk with a vermilion serving and a gold nocking bead, authored at brace from
//     the nock to the bridges (straight along ±t) — re-aimed / stretched every frame by premium/sunbow.js;
//   - arrow (fx_arrow on fx_nock; head fx_head): bone nock, bamboo shaft with nodes, three shield-cut, serrated,
//     twisted silk vanes on quill rachises with gold-dipped tails, gold wraps, a sun-silk helix (glow_sun), and a
//     bronze 柳葉 broadhead lofted with a diamond crest, ground edges, barbed outline and glowing inlays in real fullers.
// Materials ~60/30/10: red lacquer + horn / bronze + gold / glow. Side view, mm: s forward, t up, w right (arrow side).
import * as THREE from 'three';
import { toCreasedNormals, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';
import { Gun, V, lathe, plan, sphere, sweep, cut, merge, xform } from '../lib/gunkit.mjs';
import { bakeMeshes } from '../lib/bake.mjs';
import { postBake } from './m4.mjs';

// ------------------------------------------------------------------------------------------ layout (mm)
export const BOW = {
  brace: -190,            // string / nock s at brace (t = 0, w = 0)
  draw: 400,              // full-draw travel of the nock (fx_nock extras.open, m)
  arrowW: 12,             // the arrow line passes the riser at w = +12 (thumb draw: right side)
  arrowL: 700,            // nock groove to the head's point (a full draw puts the point 0.11 m past the riser)
  riser: 240,             // riser half length (limb roots at t = ±240)
  win: 150,               // 日珠 window centre t
  limb: [[4, 236], [16, 400], [-60, 560], [-170, 640]],   // limb spine (upper; the lower one mirrors t)
  ear: [0.42, 0.91], earL: 270,                            // siyah direction (forward-up) and length
};
const D2R = Math.PI / 180;
const TAU = Math.PI * 2;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (a, b, x) => { const u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); };
const lerp = (a, b, u) => a + (b - a) * u;
const BRONZE = 'bronze_aged', GOLD = 'gold', LAQ = 'lacquer_red', HORN = 'horn';

// ------------------------------------------------------------------------------------------ generic helpers
const ROT = { s: null, '-s': [0, 180, 0], t: [90, 0, 0], '-t': [-90, 0, 0], w: [0, -90, 0], '-w': [0, 90, 0] };
/** lathe along `axis` ('t' runs up, '-s' towards the archer...) starting at `at` (s, t, w) */
function lax(pts, at, axis = 's', seg = 20, crease) {
  const g = lathe(pts, { seg, crease });
  if (ROT[axis]) xform(g, { rot: ROT[axis] });
  const c = V(...at);
  g.translate(c.x, c.y, c.z);
  return g;
}
const _qa = new THREE.Quaternion(), _fw = new THREE.Vector3(0, 0, -1);
/** geometry authored along +s from the origin, turned towards the [s,t,w] direction d and moved to a */
function aimDir(geo, a, d, roll = 0) {
  if (roll) geo.rotateZ(roll * D2R);
  _qa.setFromUnitVectors(_fw, V(...d).normalize());
  geo.applyQuaternion(_qa);
  const A = V(...a);
  geo.translate(A.x, A.y, A.z);
  return geo;
}
/** lathe profile [[along, r]...] aimed along the [s,t,w] direction d from a */
const along = (pts, a, d, seg = 16, crease) => aimDir(lathe(pts, { seg, crease }), a, d);
/** slotted screw head on an arbitrary surface normal n (slot across, 0.5 mm deep) */
function slotScrew(at, n, r, d = 1.3) {
  let g = along([[-0.3, 0], [-0.3, r], [d * 0.55, r * 0.98], [d, r * 0.62], [d, 0]], at, n, 12, 50);
  const N = V(...n).normalize(), A = V(...at).addScaledVector(N, d), up = Math.abs(N.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const slot = new THREE.BoxGeometry(r * 2.6, 0.5, 1.0);   // across x, then turned so its depth runs along the normal
  const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), N, up);
  slot.applyMatrix4(m); slot.translate(A.x, A.y, A.z);
  return cut(g, [slot]);
}
const domeRivet = (at, r, axis = 'w', d = 1.2, seg = 10) => lax([[0, 0], [0, r], [d * 0.5, r * 0.82], [d, 0]], at, axis, seg, 70);
const _domes = new Map();
/** granulation bead: a smooth low dome (radius r, height h) standing on a surface at c along the normal n */
function dome(c, n, r, h = r * 0.78) {
  const k = r.toFixed(3) + ':' + h.toFixed(3);
  if (!_domes.has(k)) _domes.set(k, lathe([[-0.3 * r, r], [0.5 * h, r * 0.8], [h, 0]], { seg: 6, crease: 85 }));
  return aimDir(_domes.get(k).clone(), c, n);
}

const _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _vc = new THREE.Vector3();
/** indexed [s,t,w] triangles -> non-indexed geometry with creased normals; closed solids are wound outward */
function mesh(P, I, { crease = 40, closed = true } = {}) {
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
 *  ring joined back to the first (wrap: a closed sweep such as a bezel ring) */
function loft(rings, { capA = true, capB = true, crease = 40, wrap = false } = {}) {
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
/** a merged set of closed solids (three space, non-indexed) wound outward (a mapping may have mirrored them) */
function outward(geo) {
  const p = geo.attributes.position.array;
  let vol = 0;
  for (let i = 0; i < p.length; i += 9) vol += p[i] * (p[i + 4] * p[i + 8] - p[i + 5] * p[i + 7]) - p[i + 1] * (p[i + 3] * p[i + 8] - p[i + 5] * p[i + 6]) + p[i + 2] * (p[i + 3] * p[i + 7] - p[i + 4] * p[i + 6]);
  if (vol < 0) for (let i = 0; i < p.length; i += 9) for (let c = 0; c < 3; c++) { const t = p[i + 3 + c]; p[i + 3 + c] = p[i + 6 + c]; p[i + 6 + c] = t; }
  return geo;
}
/** tapered tube along a polyline of [s,t,w] points (r0 at the start, r1 at the end), rounded-ish ends */
function ttube(pts, r0, r1, { radial = 8, seg = 24, caps = true } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const fr = curve.computeFrenetFrames(seg, false), rings = [];
  for (let i = 0; i <= seg; i++) {
    const u = i / seg, c = curve.getPointAt(u), r = lerp(r0, r1, u) * (caps && (i === 0 || i === seg) ? 0.55 : 1);
    const N = fr.normals[i], B = fr.binormals[i], ring = [];
    for (let j = 0; j < radial; j++) { const a = j / radial * TAU; ring.push([c.x + (N.x * Math.cos(a) + B.x * Math.sin(a)) * r, c.y + (N.y * Math.cos(a) + B.y * Math.sin(a)) * r, c.z + (N.z * Math.cos(a) + B.z * Math.sin(a)) * r]); }
    rings.push(ring);
  }
  return loft(rings, { crease: 60 });
}
/** smooth function through [x, y] control points sorted by x (Catmull-Rom Hermite, clamped ends) */
function curveFn(pts) {
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
/** rounded rectangle polyline [x, y] (centre cx, cy; half sizes hx, hy; corner radius r; k points per corner) */
function rrect(cx, cy, hx, hy, r, k = 3) {
  r = Math.min(r, hx - 0.01, hy - 0.01);
  const out = [], C = [[hx - r, hy - r, 0], [-hx + r, hy - r, 90], [-hx + r, -hy + r, 180], [hx - r, -hy + r, 270]];
  for (const [x, y, a0] of C) for (let i = 0; i <= k; i++) { const a = (a0 + 90 * i / k) * D2R; out.push([cx + x + Math.cos(a) * r, cy + y + Math.sin(a) * r]); }
  return out;
}
/** point + outward normal at perimeter fraction f (0..1) of a centred rounded rectangle (x half hx, y half hy, radius r) */
function rrectAt(hx, hy, r, f) {
  r = Math.min(r, hx - 0.01, hy - 0.01);
  const ax = hx - r, ay = hy - r, seg = [2 * ay, Math.PI / 2 * r, 2 * ax, Math.PI / 2 * r, 2 * ay, Math.PI / 2 * r, 2 * ax, Math.PI / 2 * r];
  let L = (((f % 1) + 1) % 1) * seg.reduce((a, b) => a + b, 0), k = 0;
  while (k < 7 && L > seg[k]) L -= seg[k++];
  const arc = (cx, cy, a0) => { const a = a0 + L / r; return [[cx + Math.cos(a) * r, cy + Math.sin(a) * r], [Math.cos(a), Math.sin(a)]]; };
  switch (k) {
    case 0: return [[hx, -ay + L], [1, 0]];
    case 1: return arc(ax, ay, 0);
    case 2: return [[ax - L, hy], [0, 1]];
    case 3: return arc(-ax, ay, Math.PI / 2);
    case 4: return [[-hx, ay - L], [-1, 0]];
    case 5: return arc(-ax, -ay, Math.PI);
    case 6: return [[-ax + L, -hy], [0, -1]];
    default: return arc(ax, -ay, Math.PI * 1.5);
  }
}
const arcP = (cx, cy, r, a0, a1, n) => { const o = []; for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * D2R; o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return o; };
const circleP = (cx, cy, r, n = 40) => arcP(cx, cy, r, 0, 360 * (n - 1) / n, n - 1);
const spiral = (cx, cy, r0, turns, a0, dir = 1, n = 16) => { const o = []; for (let i = 0; i <= n; i++) { const u = i / n, a = (a0 + dir * u * turns * 360) * D2R, r = r0 * (1 - 0.82 * u); o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return o; };
/** closed polygon moved inwards by d (mitred) */
function insetPoly(poly, d) {
  let A = 0; for (let i = 0; i < poly.length; i++) { const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length]; A += x0 * y1 - x1 * y0; }
  const s = A > 0 ? 1 : -1, n = poly.length;
  return poly.map((p, i) => {
    const a = poly[(i + n - 1) % n], b = poly[(i + 1) % n];
    const e1 = [p[0] - a[0], p[1] - a[1]], e2 = [b[0] - p[0], b[1] - p[1]], l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1;
    const n1 = [-e1[1] / l1 * s, e1[0] / l1 * s], n2 = [-e2[1] / l2 * s, e2[0] / l2 * s];   // left normals of a CCW outline = inwards
    const k = d / Math.max(0.3, 1 + n1[0] * n2[0] + n1[1] * n2[1]);
    return [p[0] + (n1[0] + n2[0]) * k, p[1] + (n1[1] + n2[1]) * k];
  });
}
const shapeOf = (poly, holes = []) => {
  const s = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  return s;
};

/**
 * Extrudes 2D shapes (design coords u right, v up, mm) from z0 to z1 with a chamfer and wraps them onto a surface,
 * map(u, v, z) -> [s, t, w]. Tessellated to `edge` mm first so long cap triangles follow the curved surface.
 */
function wrapShapes(shapes, map, z0, z1, { bevel = 0.3, curveSeg = 5, edge = 2.2, crease = 35 } = {}) {
  const b = Math.min(bevel, (z1 - z0) * 0.45), depth = Math.max(0.02, z1 - z0 - 2 * b), out = [];
  for (const sh of [].concat(shapes)) {
    let g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: b > 0.01, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 1, curveSegments: curveSeg });
    g = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    if (edge) { g = new TessellateModifier(edge, 10).modify(g); for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k); }
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const q = V(...map(p.getX(i), p.getY(i), z0 + b + p.getZ(i))); p.setXYZ(i, q.x, q.y, q.z); }
    out.push(g);
  }
  return toCreasedNormals(outward(mergeGeometries(out, false)), crease * D2R);
}
// ------------------------------------------------------------------------------------------ design-space relief
// Relief is built as triangle lists in design space (u right, v up, z = height off the surface, mm), wound outward,
// then mapped onto the surface (mapTris). Strokes are lofted ribbons, so a 1 mm wire costs a few triangles per
// 2.5 mm instead of the slivers an extruded, tessellated shape breaks into.
function windOut(T) {
  let vol = 0;
  for (let i = 0; i < T.length; i += 9) vol += T[i] * (T[i + 4] * T[i + 8] - T[i + 5] * T[i + 7]) - T[i + 1] * (T[i + 3] * T[i + 8] - T[i + 5] * T[i + 6]) + T[i + 2] * (T[i + 3] * T[i + 7] - T[i + 4] * T[i + 6]);
  if (vol < 0) for (let i = 0; i < T.length; i += 9) for (let c = 0; c < 3; c++) { const t = T[i + 3 + c]; T[i + 3 + c] = T[i + 6 + c]; T[i + 6 + c] = t; }
  return T;
}
/** closed rings of [u, v, z] -> triangles; ends fanned to the ring centroids unless wrapped */
function loftT(rings, { wrap = false } = {}) {
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
function resample(path, step, closed = false) {
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
 * edges (b); flutes [[across -1..1, depth], ...] run along it as V grooves (bark). Mitred joints.
 */
function ribbonT(path, w, z0, z1, { b = 0.3, closed = false, step = 2.5, flutes = [] } = {}) {
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
function fanT(poly, z0, z1, { b = 0.3, step = 2.5, rings = 2 } = {}) {
  const O = resample(poly, step, true), I0 = insetPoly(O, b), c = [0, 0];
  for (const p of O) { c[0] += p[0] / O.length; c[1] += p[1] / O.length; }
  const R = [O.map(([u, v]) => [u, v, z0]), O.map(([u, v]) => [u, v, z1 - b]), I0.map(([u, v]) => [u, v, z1])];
  for (let k = 1; k <= rings; k++) R.push(I0.map(([u, v]) => [lerp(u, c[0], k / (rings + 1)), lerp(v, c[1], k / (rings + 1)), z1]));
  return loftT(R);
}
/** open sheet over u0..u1 x v0..v1 at height z, gridded every d mm (AO resolution), facing +z */
function gridT(u0, u1, v0, v1, z, d = 1.8) {
  const nu = Math.max(2, Math.ceil((u1 - u0) / d)), nv = Math.max(2, Math.ceil((v1 - v0) / d)), T = [];
  const p = (i, j) => [lerp(u0, u1, i / nu), lerp(v0, v1, j / nv), z];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = p(i, j), b = p(i + 1, j), c = p(i + 1, j + 1), e = p(i, j + 1); T.push(...a, ...b, ...c, ...a, ...c, ...e); }
  return T;
}
/** design-space triangles -> three-space geometry via map(u, v, z) -> [s, t, w]; the map's handedness is checked at
 *  the design centroid (a mirrored face flips every triangle) */
function mapTris(T, map, crease = 35) {
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
const cat = (...L) => [].concat(...L);
/**
 * Leaf blade: a lens plate in a local frame (c = base [s,t,w], d = blade direction, nrm = face normal), length L,
 * half width W, thickness th; a tapered midrib and `veins` pairs of tapered vein ridges on the face (same material,
 * so the patina / AO collects along them).
 */
function leaf(c, d, nrm, L, W, th = 1.4, veins = 3) {
  const sh = new THREE.Shape(), n = 8;
  sh.moveTo(0, 0);
  for (let i = 1; i <= n; i++) { const u = i / n; sh.lineTo(u * L, W * Math.sin(Math.PI * Math.pow(u, 0.8)) * (1 - 0.15 * u)); }
  for (let i = n - 1; i >= 1; i--) { const u = i / n; sh.lineTo(u * L, -W * Math.sin(Math.PI * Math.pow(u, 0.8)) * (1 - 0.15 * u)); }
  sh.closePath();
  let g = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: true, bevelThickness: th * 0.3, bevelSize: Math.min(0.6, W * 0.12), bevelSegments: 1, curveSegments: 2 });
  g = g.toNonIndexed ? (g.index ? g.toNonIndexed() : g) : g;
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  g.translate(0, 0, -th / 2);
  // local x = blade, z = face normal -> world (three space)
  const X = V(...d).normalize(), Z = V(...nrm).normalize(), Y = new THREE.Vector3().crossVectors(Z, X).normalize();
  const Zo = new THREE.Vector3().crossVectors(X, Y);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(X, Y, Zo));
  const C = V(...c); g.translate(C.x, C.y, C.z);
  // midrib and veins: tapered ridges on the +z face
  const P = (x, y, z) => { const v = C.clone().addScaledVector(X, x).addScaledVector(Y, y).addScaledVector(Zo, z); return [-v.z, v.y, v.x]; };
  const ribs = [ttube([P(L * 0.04, 0, th * 0.62), P(L * 0.5, 0, th * 0.6), P(L * 0.9, 0, th * 0.55)], th * 0.34, th * 0.1, { radial: 4, seg: 6 })];
  for (let k = 1; k <= veins; k++) for (const q of [1, -1]) {
    const u = k / (veins + 1), x0 = u * L * 0.86, vl = W * 0.75 * Math.sin(Math.PI * u);
    ribs.push(ttube([P(x0, 0, th * 0.6), P(x0 + vl * 0.5, q * vl * 0.42, th * 0.58), P(x0 + vl * 0.95, q * vl * 0.7, th * 0.52)], th * 0.22, th * 0.07, { radial: 3, seg: 3 }));
  }
  return merge([toCreasedNormals(g, 40 * D2R), ...ribs]);
}

// ------------------------------------------------------------------------------------------ riser surface
// Super-ellipse sections in (s, w) along t. θ: 0 = back (+s, the target side), π = belly (towards the archer),
// +π/2 = right (+w, arrow side). hw swells into a round boss round the window (t 116..184).
const R = {
  hs: curveFn([[-240, 17], [-205, 20], [-150, 24], [-70, 24], [-12, 23.5], [20, 23], [80, 22.5], [150, 22.5], [205, 20], [240, 17.5]]),
  hw: curveFn([[-240, 30], [-205, 26], [-150, 19.5], [-70, 18.4], [-14, 19.2], [-2, 22], [30, 22], [90, 23.5], [114, 24.8], [126, 28], [138, 31.6], [150, 33],
    [162, 31.6], [174, 28.4], [186, 27.6], [205, 28], [240, 30]]),
  wc: curveFn([[-240, 0], [-150, 0], [-22, 0], [-3, -16.2], [42, -16.2], [110, -8], [180, -2], [240, 0]]),
  sc: curveFn([[-240, 4], [-150, 1], [-70, 0], [20, 0], [150, 2], [240, 4]]),
  n: curveFn([[-240, 5], [-150, 4.2], [-110, 3.2], [-30, 3.2], [-6, 4.4], [240, 5]]),
};
const se = (x, n) => Math.sign(x) * Math.pow(Math.abs(x), 2 / n);
function RSx(t, th) {
  const hs = R.hs(t), hw = R.hw(t), n = R.n(t), c = Math.cos(th), s = Math.sin(th);
  const x = se(c, n), y = se(s, n);
  let ns = Math.sign(x) * Math.pow(Math.abs(x), n - 1) / hs, nw = Math.sign(y) * Math.pow(Math.abs(y), n - 1) / hw;
  const l = Math.hypot(ns, nw) || 1;
  return [R.sc(t) + hs * x, R.wc(t) + hw * y, ns / l, nw / l];
}
/** riser surface point at (t, θ), pushed `off` mm along the section normal -> [s, t, w] */
function RS(t, th, off = 0) { const [s, w, ns, nw] = RSx(t, th); return [s + ns * off, t, w + nw * off]; }
/** riser section normal at (t, θ) -> [s, 0, w] */
const RN = (t, th) => { const [, , ns, nw] = RSx(t, th); return [ns, 0, nw]; };
/** loft of the riser surface (offset `off`) over t0..t1 (full ring) */
function riserLoft(t0, t1, off, { nt = 40, na = 28 } = {}) {
  const rings = [];
  for (let i = 0; i <= nt; i++) { const t = lerp(t0, t1, i / nt), r = []; for (let j = 0; j < na; j++) r.push(RS(t, j / na * TAU, off)); rings.push(r); }
  return loft(rings);
}
/** loft through riser rings at [[t, off], ...] (collars, ferrules) */
function riserRings(prof, na = 48) {
  return loft(prof.map(([t, o]) => { const r = []; for (let j = 0; j < na; j++) r.push(RS(t, j / na * TAU, o)); return r; }));
}
/** granulation round the riser at t (offset off, bead radius r, n beads) */
function riserBeads(t, off, r, n) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = (i + 0.5) / n * TAU; out.push(dome(RS(t, a, off - 0.15), RN(t, a), r)); }
  return merge(out);
}
/** curved slab on the riser surface over t0..t1 x θ0..θ1, from off0 (just under the surface) to off1 */
function riserPanel(t0, t1, a0, a1, off0, off1, { nt = 16, na = 8, shrink = 0 } = {}) {
  const rings = [];
  for (let i = 0; i <= nt; i++) {
    const t = lerp(t0, t1, i / nt), r = [];
    // rounded corners: the θ span narrows a touch at both ends of t
    const k = shrink ? 1 - shrink * (1 - Math.sin(Math.PI * i / nt)) : 1, m = (a0 + a1) / 2, h = (a1 - a0) / 2 * k;
    for (let j = 0; j <= na; j++) r.push(RS(t, m - h + 2 * h * j / na, off1));
    for (let j = na; j >= 0; j--) r.push(RS(t, m - h + 2 * h * j / na, off0));
    rings.push(r);
  }
  return loft(rings, { crease: 50 });
}
/** wire (r) along the riser surface through (t, θ) params, sunk to half its radius */
function riserWire(params, r, { seg, closed = false, off = 0, radial = 5 } = {}) {
  const pts = params.map(([t, a]) => RS(t, a, r * 0.45 + off));
  return sweep(pts, r, { seg: seg ?? Math.max(12, pts.length * 3), radial, closed });
}
/** border loop round a riser panel */
function panelBorder(t0, t1, a0, a1, r, off = 0.7) {
  const P = [], n = 10;
  for (let i = 0; i <= n; i++) P.push([lerp(t0, t1, i / n), a0]);
  for (let i = 1; i <= 6; i++) P.push([t1, lerp(a0, a1, i / 6)]);
  for (let i = n - 1; i >= 0; i--) P.push([lerp(t0, t1, i / n), a1]);
  for (let i = 5; i >= 1; i--) P.push([t0, lerp(a0, a1, i / 6)]);
  return riserWire(P, r, { closed: true, off, seg: 34, radial: 3 });
}
/** riser face mapper: (t, y mm across) -> θ on face 'F' (belly, y = w - wc), 'B' (back, y = w - wc), 'R' / 'L' (y = s - sc) */
function faceTheta(face) {
  return (t, y) => {
    const n = R.n(t), inv = (v) => Math.sign(v) * Math.pow(Math.min(0.985, Math.abs(v)), n / 2);
    if (face === 'F' || face === 'B') { const a = Math.asin(inv(y / R.hw(t))); return face === 'B' ? a : Math.PI - a; }
    const a = Math.acos(inv(y / R.hs(t)));
    return face === 'R' ? a : -a;
  };
}
/** design-coordinate map of a riser face as its viewer sees it: u right, v = t, z = offset off the surface */
function faceMap(face) {
  const th = faceTheta(face), sg = face === 'B' || face === 'L' ? -1 : 1;
  return (u, v, z) => RS(v, th(v, sg * u), z);
}
// ------------------------------------------------------------------------------------------ 如意雲頭 inlays
/**
 * A ruyi cloud head (如意雲頭) in a local 2D frame (x up the motif, y across), size R: the trefoil outline (two side
 * lobes, a top lobe, a pointed foot) and a spiral curl inside each side lobe. Polylines [[x, y], ...]; rot = 90 turns it.
 */
function ruyi(R, rot = 0) {
  const cxL = -0.06 * R, cyL = -0.5 * R, cxR = -0.06 * R, cyR = 0.5 * R, r = 0.46 * R;
  const loop = [[-R, 0], ...arcP(cxL, cyL, r, 160, 380, 12), ...arcP(0.46 * R, 0, 0.42 * R, 250, 470, 14), ...arcP(cxR, cyR, r, -20, 200, 12), [-R, 0]];
  const curls = [spiral(cxL, cyL, 0.3 * R, 1.1, 90, 1), spiral(cxR, cyR, 0.3 * R, 1.1, -90, -1), spiral(0.46 * R, 0, 0.24 * R, 1.0, 180, 1, 12)];
  const c = Math.cos(rot * D2R), sn = Math.sin(rot * D2R), T = (p) => p.map(([x, y]) => [x * c - y * sn, x * sn + y * c]);
  return [T(loop), ...curls.map(T)];
}
/** gold ruyi inlay on a riser face centred at (tc, yc) */
function riserRuyi(face, tc, yc, Rr, rot, r = 0.42, off = 0.72) {
  const th = faceTheta(face), out = [], small = Rr < 9;
  for (const line of ruyi(Rr, rot)) out.push(sweep(line.map(([x, y]) => RS(tc + x, th(tc + x, yc + y), r * 0.45 + off)), r, { seg: Math.max(6, Math.round(line.length * (small ? 0.42 : 0.62))), radial: small ? 3 : 4 }));
  return merge(out);
}

// ------------------------------------------------------------------------------------------ cast relief motifs
/** square spiral centreline filling [0, L]^2 from its outer corner, turning left, pitch p */
function sqSpiral(L, p) {
  const D = [[1, 0], [0, 1], [-1, 0], [0, -1]], lens = [L, L, L];
  for (let l = L - p; l > p * 0.75; l -= p) lens.push(l, l);
  const pts = [[0, 0]];
  let x = 0, y = 0;
  lens.forEach((len, k) => { x += D[k % 4][0] * len; y += D[k % 4][1] * len; pts.push([x, y]); });
  return pts;
}
/** 雲雷紋 band: square spirals of alternating hand between two border lines over u0..u1 x v0..v1 (z0 -> z1) */
function thunderT(u0, u1, v0, v1, z0, z1, { lw = 0.95, gap = 0.8, border = true } = {}) {
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
/** Sanxingdui-style sun wheel: outer ring (to zr), hub ring and `spokes` tapered spokes (to zs); centre (cu, cv) */
function sunWheelT(cu, cv, r, z0, zr, zs, spokes = 9) {
  const out = [ribbonT(circleP(cu, cv, r - 1.2, 48), 2.4, z0, zr, { closed: true, b: 0.4 }), ribbonT(circleP(cu, cv, 5.2, 22), 1.4, z0, zs, { closed: true })];
  for (let k = 0; k < spokes; k++) {
    const a = (k / spokes + 0.25) * TAU, c = Math.cos(a), s = Math.sin(a);
    out.push(ribbonT([[cu + c * 5.4, cv + s * 5.4], [cu + c * (r - 1.8), cv + s * (r - 1.8)]], (f) => lerp(2.9, 1.9, f), z0, zs, { step: 2.2 }));
  }
  return cat(...out);
}
/** cloud curl: a spiral stroke (1.35 turns) with a short tail, tapering inwards; dir 1 = counter-clockwise */
function curlT(cu, cv, r0, dir, a0, z0, z1, lw = 0.9) {
  const ta = a0 * D2R, pts = [[cu + Math.cos(ta) * r0 + Math.sin(ta) * dir * r0 * 1.3, cv + Math.sin(ta) * r0 - Math.cos(ta) * dir * r0 * 1.3]];
  for (let i = 0; i <= 16; i++) { const u = i / 16, a = (a0 + dir * u * 1.35 * 360) * D2R, rr = r0 * (1 - 0.7 * u); pts.push([cu + Math.cos(a) * rr, cv + Math.sin(a) * rr]); }
  return ribbonT(pts, (f) => lw * (1 - 0.35 * f), z0, z1, { step: 2, b: 0.25 });
}
/** tapered root / branch along the bezier a b c d: width w0 -> w1, pointed tip */
function rootT(a, b, c, d, w0, w1, z0, z1, flutes = []) {
  const P = [];
  for (let i = 0; i <= 16; i++) { const u = i / 16, v = 1 - u; P.push([v * v * v * a[0] + 3 * v * v * u * b[0] + 3 * v * u * u * c[0] + u * u * u * d[0], v * v * v * a[1] + 3 * v * v * u * b[1] + 3 * v * u * u * c[1] + u * u * u * d[1]]); }
  return ribbonT(P, (f) => lerp(w0, w1, f) * (f > 0.85 ? 1 - 0.75 * (f - 0.85) / 0.15 : 1), z0, z1, { step: 2, flutes });
}
/** the 扶桑 trunk (fluted bark) rising from three roots at v0 to v1 */
function trunkT(cu, v0, v1, z0, z1) {
  const bark = [[-0.56, 0.42], [-0.08, 0.5], [0.46, 0.42]];
  return cat(
    ribbonT([[cu, v0 + 3], [cu - 0.25, v0 + 18], [cu + 0.2, v0 + 38], [cu, v1]], (f) => lerp(9.6, 7.6, smooth(0, 0.22, f)) - 0.9 * f, z0, z1, { step: 2.5, flutes: bark }),
    rootT([cu - 2.4, v0 + 7], [cu - 6, v0 + 4.6], [cu - 10.5, v0 + 2.2], [cu - 15, v0 + 0.4], 5.4, 1.3, z0, z1 - 0.05),
    rootT([cu, v0 + 6], [cu - 0.1, v0 + 3], [cu - 0.4, v0 + 0.6], [cu - 0.7, v0 - 1.6], 5.2, 1.5, z0, z1 - 0.05),
    rootT([cu + 2.4, v0 + 7], [cu + 6.2, v0 + 4.4], [cu + 10.6, v0 + 2], [cu + 14.8, v0 + 0.2], 5.2, 1.3, z0, z1 - 0.05));
}

// ------------------------------------------------------------------------------------------ limb spine
const bez = (P, u) => {
  const v = 1 - u;
  return [v * v * v * P[0][0] + 3 * v * v * u * P[1][0] + 3 * v * u * u * P[2][0] + u * u * u * P[3][0],
    v * v * v * P[0][1] + 3 * v * v * u * P[1][1] + 3 * v * u * u * P[2][1] + u * u * u * P[3][1]];
};
const bezD = (P, u) => {
  const v = 1 - u;
  const ds = 3 * v * v * (P[1][0] - P[0][0]) + 6 * v * u * (P[2][0] - P[1][0]) + 3 * u * u * (P[3][0] - P[2][0]);
  const dt = 3 * v * v * (P[1][1] - P[0][1]) + 6 * v * u * (P[2][1] - P[1][1]) + 3 * u * u * (P[3][1] - P[2][1]);
  const l = Math.hypot(ds, dt);
  return [ds / l, dt / l];
};
/** limb frame at u for side sg (1 upper, -1 lower): centre C, tangent T, belly normal N (all [s, t]) */
function limbFrame(u, sg) {
  const c = bez(BOW.limb, u), d = bezD(BOW.limb, u);
  const C = [c[0], c[1] * sg], T = [d[0], d[1] * sg];
  // belly = towards the archer (-s side): the tangent turned a quarter towards -s
  let N = [-T[1], T[0]];
  if (N[0] > 0) N = [-N[0], -N[1]];
  return { C, T, N };
}
const LIMB_H = (u) => lerp(27, 18, smooth(0, 1, u));          // thickness (belly normal)
const LIMB_W = (u) => lerp(58, 36, smooth(0.05, 1, u));       // width (w): an exaggerated great bow
// arc length along the limb spine (mm) <-> u
const LIMB_ARC = (() => { const a = [0]; let p = bez(BOW.limb, 0); for (let i = 1; i <= 400; i++) { const q = bez(BOW.limb, i / 400); a.push(a[i - 1] + Math.hypot(q[0] - p[0], q[1] - p[1])); p = q; } return a; })();
const limbArc = (u) => { const x = clamp01(u) * 400, i = Math.min(399, Math.floor(x)); return lerp(LIMB_ARC[i], LIMB_ARC[i + 1], x - i); };
const limbU = (mm) => { const A = LIMB_ARC; if (mm <= 0) return 0; if (mm >= A[400]) return 1; let i = 0; while (A[i + 1] < mm) i++; return (i + (mm - A[i]) / (A[i + 1] - A[i])) / 400; };
/** one lamination: n from n0(u) to n1(u) (fractions of the thickness, + = belly), crown on the belly face */
function limbLayer(sg, f0, f1, { u0 = 0, u1 = 1, nu = 34, r = 1.2, inset = 0, crown = 0 } = {}) {
  const rings = [];
  for (let i = 0; i <= nu; i++) {
    const u = lerp(u0, u1, i / nu), F = limbFrame(u, sg), h = LIMB_H(u), W = LIMB_W(u) / 2 - inset;
    const a = f0 * h, b = f1 * h, ring = [];
    const pts = rrect((a + b) / 2, 0, (b - a) / 2, W, r, 2);
    for (const [n, w] of pts) {
      const cr = crown && n > (a + b) / 2 ? crown * (1 - (w / W) ** 2) : 0;
      ring.push([F.C[0] + F.N[0] * (n + cr), F.C[1] + F.N[1] * (n + cr), w]);
    }
    rings.push(ring);
  }
  return loft(rings, { crease: 45 });
}
/** point on a limb face: f = thickness fraction (-0.5 back .. 0.5 belly), w across, extra = lift off the face */
function limbPt(u, sg, f, w, extra = 0) {
  const F = limbFrame(u, sg), n = f * LIMB_H(u) + Math.sign(f) * extra;
  return [F.C[0] + F.N[0] * n, F.C[1] + F.N[1] * n, w];
}
/** limb section ring grown by k mm (shoes, bands) */
function limbRing(u, sg, k, rr = 2.4, kk = 3) {
  const F = limbFrame(u, sg);
  return rrect(0, 0, LIMB_H(u) / 2 + k, LIMB_W(u) / 2 + k, rr + k * 0.4, kk).map(([n, w]) => [F.C[0] + F.N[0] * n, F.C[1] + F.N[1] * n, w]);
}
/** design map on a limb face: u across (w), v along the limb (mm from u0), z off the face (belly crown included) */
function limbMap(sg, f, u0) {
  const a0 = limbArc(u0);
  return (x, y, z) => { const u = limbU(a0 + y), W2 = LIMB_W(u) / 2, cr = f > 0 ? 1.6 * Math.max(0, 1 - (x / W2) ** 2) : 0; return limbPt(u, sg, f, x, z + cr); };
}

// ------------------------------------------------------------------------------------------ gems, petals, vanes
/**
 * 16-fold brilliant: table, star facets, kite bezels and upper-girdle halves; a faceted girdle band; lower-girdle
 * halves and kite mains to the culet. Axis along -s (crown towards the archer) from the girdle centre C.
 */
function brilliant(C, R0, { n = 16, tableR = 0.56, crownH = 0.42, girdle = 0.07, pavH = 0.8, starR = 0.8, starH = 0.55 } = {}) {
  const P = [], I = [];
  const pt = (a, r, ang) => { P.push(C[0] - a, C[1] + Math.cos(ang) * r, C[2] + Math.sin(ang) * r); return P.length / 3 - 1; };
  const d = TAU / n, g = girdle * R0 / 2, hc = crownH * R0, hp = pavH * R0;
  const T = [], S = [], G = [], H = [], G2 = [], H2 = [], Q = [];
  for (let k = 0; k < n; k++) {
    T.push(pt(g + hc, tableR * R0, k * d));
    S.push(pt(g + starH * hc, starR * R0, (k + 0.5) * d));
    G.push(pt(g, R0, k * d)); H.push(pt(g, R0, (k + 0.5) * d));
    G2.push(pt(-g, R0, k * d)); H2.push(pt(-g, R0, (k + 0.5) * d));
    Q.push(pt(-g - hp * 0.76, R0 * 0.24, (k + 0.5) * d));
  }
  const tc = pt(g + hc, 0, 0), cu = pt(-g - hp, 0, 0);
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n, km = (k + n - 1) % n;
    I.push(tc, T[k], T[k1]);                                      // table
    I.push(T[k], S[k], T[k1]);                                    // star
    I.push(T[k], S[km], G[k], T[k], G[k], S[k]);                  // kite bezel
    I.push(S[k], G[k], H[k], S[k], H[k], G[k1]);                  // upper girdle halves
    I.push(G[k], G2[k], H2[k], G[k], H2[k], H[k], H[k], H2[k], G2[k1], H[k], G2[k1], G[k1]);   // girdle band
    I.push(G2[k], Q[k], H2[k], H2[k], Q[k], G2[k1]);              // lower girdle halves
    I.push(cu, Q[km], G2[k], cu, G2[k], Q[k]);                    // pavilion main (kite)
  }
  return mesh(P, I, { crease: 1 });
}
/** flame petal: base b, rising along axis D, bulging along radial Rd, side Sd; length L, half width W, thickness th */
function petal(b, D, Rd, Sd, L, W, th, { bulge = 11, flick = 7, nu = 12, na = 8 } = {}) {
  const rings = [];
  for (let i = 0; i <= nu; i++) {
    const x = i / nu, out = bulge * Math.sin(Math.PI * x * 0.8) + flick * x * x * x;
    const c = [b[0] + D[0] * x * L + Rd[0] * out, b[1] + D[1] * x * L + Rd[1] * out, b[2] + D[2] * x * L + Rd[2] * out];
    const wv = Math.max(0.15, W * Math.sin(Math.PI * Math.pow(Math.max(0.02, x), 0.75)) * (1 - 0.2 * x)), tv = Math.max(0.12, th * (1 - 0.75 * x)), r = [];
    for (let j = 0; j < na; j++) { const a = j / na * TAU, cs = Math.cos(a) * wv, sn = Math.sin(a) * tv; r.push([c[0] + Sd[0] * cs + Rd[0] * sn, c[1] + Sd[1] * cs + Rd[1] * sn, c[2] + Sd[2] * cs + Rd[2] * sn]); }
    rings.push(r);
  }
  return loft(rings, { crease: 55 });
}
/**
 * Feather vane on the arrow shaft (axis +s at t 0, w aw): shield cut (low leading edge, tall rear, a steep shield
 * tail), barb-sheared grid with a serrated edge and a few deeper splits, thickness tapering to the edge, a slight
 * helical twist; the rear `goldMm` gold-dipped. sFront = leading end s, a0 = radial angle (deg).
 */
function vane(sFront, aw, a0, { Lf = 138, Hm = 16, rb = 4.5, nx = 48, ny = 4, tw = 5, shear = 0.75, splits = [0.28, 0.5, 0.69], goldMm = 9 } = {}) {
  const Hf = (u) => (u < 0.84 ? Hm * (0.16 + 0.84 * Math.pow(Math.sin(Math.PI / 2 * u / 0.84), 1.15)) : Hm * (1 - 0.62 * Math.pow((u - 0.84) / 0.16, 1.4)));
  const P = [], top = [], bot = [], rows = [0, 0.32, 0.62, 0.86, 1];
  const put = (x, y, z) => {
    const a = (a0 + tw * x / Lf) * D2R, rd = [0, Math.sin(a), Math.cos(a)], zd = [0, -Math.cos(a), Math.sin(a)];
    P.push(sFront - x, rd[1] * (rb + y) + zd[1] * z, aw + rd[2] * (rb + y) + zd[2] * z);
    return P.length / 3 - 1;
  };
  for (let i = 0; i <= nx; i++) {
    const u = i / nx, x0 = u * Lf;
    let H = Hf(u) * (i % 2 ? 0.94 : 1);
    for (const s of splits) { const k = Math.abs(u - s) * nx; if (k < 0.5) H *= 0.58; else if (k < 1.5) H *= 0.9; }
    if (i === 0 || i === nx) H = Math.max(1.2, H * 0.98);
    top.push([]); bot.push([]);
    for (const f of rows) {
      const y = H * f, x = Math.min(Lf + Hm * shear, x0 + y * shear * (0.4 + 0.6 * u)), th = lerp(0.62, 0.16, f) * (i === 0 ? 0.6 : 1);
      const pl = (i % 2 ? 0.3 : -0.3) * Math.min(1, f * 2.5);     // barb pleats: the sheen breaks along the barbs
      top[i].push(put(x, y, pl + th / 2)); bot[i].push(put(x, y, pl - th / 2));
    }
  }
  const red = [], gold = [], ny1 = rows.length - 1;
  const quad = (L, a, b, c, d) => L.push(a, b, c, a, c, d);
  for (let i = 0; i < nx; i++) {
    const L = (i + 0.5) / nx * Lf > Lf - goldMm ? gold : red;
    for (let j = 0; j < ny1; j++) { quad(L, top[i][j], top[i + 1][j], top[i + 1][j + 1], top[i][j + 1]); quad(L, bot[i][j], bot[i][j + 1], bot[i + 1][j + 1], bot[i + 1][j]); }
    quad(L, top[i][ny1], top[i + 1][ny1], bot[i + 1][ny1], bot[i][ny1]);   // outer edge
    quad(L, bot[i][0], bot[i + 1][0], top[i + 1][0], top[i][0]);           // root (in the rachis)
  }
  for (let j = 0; j < ny1; j++) { quad(red, top[0][j + 1], bot[0][j + 1], bot[0][j], top[0][j]); quad(gold, top[nx][j], bot[nx][j], bot[nx][j + 1], top[nx][j + 1]); }
  // wind the whole (closed) vane outward once, then split by material
  const all = red.concat(gold), pos = new THREE.Vector3(), q1 = new THREE.Vector3(), q2 = new THREE.Vector3();
  let vol = 0;
  for (let i = 0; i < all.length; i += 3) { pos.fromArray(P, all[i] * 3); q1.fromArray(P, all[i + 1] * 3); q2.fromArray(P, all[i + 2] * 3); vol += pos.dot(q1.cross(q2)); }
  const fix = (L) => { if (vol < 0) for (let i = 0; i < L.length; i += 3) { const t = L[i + 1]; L[i + 1] = L[i + 2]; L[i + 2] = t; } return L; };
  return { red: mesh(P, fix(red), { crease: 20, closed: false }), gold: mesh(P, fix(gold), { crease: 20, closed: false }) };
}

// ------------------------------------------------------------------------------------------ the bow
export default function build() {
  const g = new Gun('sunbow');
  const B = BOW;
  const relief = g.part('relief');           // cast-relief floors (verdigris crust, cavity from their AO after the bake)
  const F = faceMap('F');

  // ======================================================================== riser (bronze 扶桑 tree)
  const winW = R.wc(B.win);
  {
    // the body, the window cut through it front to back
    let body = riserLoft(-246, 246, 0, { nt: 62, na: 36 });
    body = cut(body, [lax([[0, 0], [0, 20.6], [80, 20.6], [80, 0]], [-40, B.win, winW], 's', 48)]);
    g.add(body, BRONZE);
    // red-lacquer panels on both flanks (upper between the branches, lower below the grip) + the back (target side)
    const P = [];
    for (const sd of [1, -1]) {
      const a = sd * Math.PI / 2, h = 0.55;
      P.push([30, 108, a - h, a + h], [-212, -142, a - h, a + h], [186, 212, a - h, a + h]);
    }
    P.push([-212, -142, -0.5, 0.5], [30, 116, -0.48, 0.48], [186, 214, -0.5, 0.5]);
    for (const [t0, t1, a0, a1] of P) {
      g.add(riserPanel(t0, t1, a0, a1, -0.4, 0.75, { nt: 10, na: 7, shrink: 0.08 }), LAQ);
      g.add(panelBorder(t0 - 1.5, t1 + 1.5, a0 - 0.06, a1 + 0.06, 0.62, 0.55), GOLD);
      const face = Math.abs((a0 + a1) / 2) < 0.2 ? 'B' : (a0 + a1) / 2 > 0 ? 'R' : 'L', L = t1 - t0, tc = (t0 + t1) / 2;
      const Rr = Math.min(16, L * 0.22), up = tc > 0 ? 90 : -90;
      g.add(riserRuyi(face, tc, 0, Rr, up), GOLD);
      if (L > 50 && face !== 'B' && tc > 0) for (const k of [-1, 1]) g.add(riserRuyi(face, tc + k * (L / 2 - Rr * 0.55 - 4), 0, Rr * 0.42, k > 0 ? 90 : -90, 0.34), GOLD);
    }
  }

  // ---- cast relief on the belly (what the archer looks at): raised bronze on a patinated floor inside a cast frame
  const panel = (map, u0, u1, v0, v1, layers, { frame = 1.15, base = 0, rr = 2.4 } = {}) => {
    relief.add(mapTris(gridT(u0 + 0.5, u1 - 0.5, v0 + 0.5, v1 - 0.5, base + 0.42, 2.2), map, 50), 'patina_bronze');
    const T = [...layers];
    if (frame) T.push(ribbonT(rrect((u0 + u1) / 2, (v0 + v1) / 2, (u1 - u0 - frame) / 2, (v1 - v0 - frame) / 2, Math.max(0.4, rr - frame / 2), 3), frame, base + 0.1, base + 1.5, { closed: true, b: 0.38, step: 4.5 }));
    g.add(mapTris(cat(...T), map), BRONZE);
  };
  {
    // A: shelf -> window. Thunder bands top and bottom, the trunk rising from its roots, branch roots peeling off to
    // the corners where the cast branches leave, a nine-spoke sun wheel (the sun in the tree) with a gold boss.
    panel(F, -17.2, 17.2, -2.6, 119.2, [
      thunderT(-15.4, 15.4, 0.2, 11.8, 0.1, 1.25), thunderT(-15.4, 15.4, 105.6, 117.2, 0.1, 1.25),
      trunkT(0, 13.6, 73.5, 0.1, 1.38),
      rootT([-3.6, 27], [-8, 28.5], [-12.5, 31.5], [-15.2, 37.5], 4.6, 1.9, 0.1, 1.3, [[0, 0.5]]), rootT([3.4, 51], [8, 52.6], [12.5, 55.6], [15.2, 61.5], 4.4, 1.8, 0.1, 1.3, [[0, 0.5]]),
      rootT([-3.7, 44], [-6.5, 46], [-8.5, 49], [-9.4, 54.5], 2.6, 1.1, 0.1, 1.2), rootT([3.6, 32], [6.2, 34], [8, 37.5], [8.8, 42], 2.4, 1.0, 0.1, 1.2),
      curlT(-11.2, 21.5, 3.3, 1, 200, 0.1, 1.1), curlT(11.4, 25, 3.0, -1, -20, 0.1, 1.1), curlT(-11.6, 63, 3.2, -1, 160, 0.1, 1.1), curlT(11.6, 43.5, 2.8, 1, 20, 0.1, 1.1),
      curlT(10.8, 66.5, 2.9, 1, 40, 0.1, 1.1), curlT(-12.6, 45, 2.2, 1, 160, 0.1, 1.1),
      sunWheelT(0, 86, 15, 0.1, 1.65, 1.4),
    ]);
    const hubC = F(0, 86, 0.3), hubN = RN(86, Math.PI);
    g.add(along([[-0.4, 0], [-0.4, 4.6], [0.9, 4.5], [2.0, 3.6], [2.8, 2.0], [3.15, 0]], hubC, hubN, 22, 40), GOLD);
    const beads = [];
    for (let k = 0; k < 9; k++) { const a = (k / 9 + 0.25 + 0.5 / 9) * TAU; beads.push(dome(F(Math.cos(a) * 9.4, 86 + Math.sin(a) * 9.4, 0.3), hubN, 1.05)); }
    for (let k = 0; k < 27; k++) { const a = (k + 0.5) / 27 * TAU; beads.push(dome(F(Math.cos(a) * 13.8, 86 + Math.sin(a) * 13.8, 1.5), RN(86 + Math.sin(a) * 13.8, Math.PI), 0.55)); }
    g.add(merge(beads), GOLD);

    // C: below the grip — the tree's roots spreading down to a thunder band above the lower fork collar
    panel(F, -15.2, 15.2, -219.2, -133.4, [
      thunderT(-13.6, 13.6, -216.6, -205.4, 0.1, 1.25),
      rootT([0, -134.5], [0, -142], [-0.5, -150], [-1, -158], 8.4, 6.4, 0.1, 1.38, [[-0.5, 0.55], [0.05, 0.65], [0.5, 0.55]]),
      rootT([-1.5, -154], [-6, -162], [-11, -170], [-11.8, -194], 4.8, 1.8, 0.1, 1.33, [[0, 0.5]]), rootT([0.6, -156], [1.4, -168], [-0.6, -182], [1.2, -200], 4.6, 1.8, 0.1, 1.33, [[0, 0.5]]),
      rootT([2.2, -153], [7, -161], [11.6, -172], [11.2, -192], 4.4, 1.6, 0.1, 1.33, [[0, 0.5]]), rootT([-9, -166], [-5, -172], [-4.6, -180], [-6.2, -187], 2.2, 0.9, 0.1, 1.2),
      rootT([8.8, -168], [5.4, -175], [5.6, -183], [7.4, -190], 2.1, 0.9, 0.1, 1.2),
      curlT(-9.6, -146, 3.1, -1, 160, 0.1, 1.1), curlT(9.8, -147, 3.0, 1, 20, 0.1, 1.1),
    ]);
  }

  // ---- grip: pebbled leather over the core, 12 silk cords woven over-under, gold ferrules, a tie-off knot
  {
    const t0 = -126, t1 = -12;
    g.add(riserLoft(t0 + 4, t1 - 4, 1.5, { nt: 20, na: 28 }), 'leather_grain');
    // + cords and - cords cross every Δu = (2π/6) / (2K): a plain weave is then just ±A·cos(πu/Δu) on the two hands
    const K = TAU * 0.92, Du = (TAU / 6) / (2 * K), cords = [];
    for (let k = 0; k < 6; k++) for (const dir of [1, -1]) {
      const P = [], N = [], a0 = k / 6 * TAU, n = 48;
      for (let i = 0; i <= n; i++) {
        const u = i / n, t = lerp(t0 + 1, t1 - 1, u), a = a0 + dir * u * K, off = 2.45 + dir * 0.62 * Math.cos(Math.PI * u / Du);
        P.push(RS(t, a, off)); N.push(RN(t, a));
      }
      // flattened cord: a lozenge section, wide across the path, low along the surface normal
      const rings = P.map((p, i) => {
        const q = P[Math.min(n, i + 1)], o = P[Math.max(0, i - 1)], d = V(q[0] - o[0], q[1] - o[1], q[2] - o[2]).normalize(), nn = V(...N[i]).normalize();
        const b = new THREE.Vector3().crossVectors(nn, d).normalize(), r = [];
        for (let j = 0; j < 4; j++) { const a = j / 4 * TAU, v = V(...p).addScaledVector(b, Math.cos(a) * 0.72).addScaledVector(nn, Math.sin(a) * 0.46); r.push([-v.z, v.y, v.x]); }
        return r;
      });
      cords.push(loft(rings, { crease: 95 }));
    }
    g.add(merge(cords), 'silk_red');
    for (const [ta, tb] of [[t0 - 3, t0 + 5], [t1 - 5, t1 + 3]]) {
      g.add(riserRings([[ta, 2.0], [ta + 0.4, 2.75], [ta + 1.2, 3.0], [tb - 1.2, 3.0], [tb - 0.4, 2.75], [tb, 2.0]], 36), GOLD);
      g.add(merge([riserBeads(ta + 1.2, 3.0, 0.62, 22), riserBeads(tb - 1.2, 3.0, 0.62, 22)]), GOLD);
      g.add(riserRings([[(ta + tb) / 2 - 0.8, 2.9], [(ta + tb) / 2 - 0.3, 3.35], [(ta + tb) / 2 + 0.3, 3.35], [(ta + tb) / 2 + 0.8, 2.9]], 36), GOLD);
    }
    // tie-off knot under the upper ferrule (belly): a bound bulb, two tails through a gold barrel bead, splayed ends
    const kc = RS(-23, Math.PI, 3.6), KP = (ds, dt, dw) => [kc[0] + ds, kc[1] + dt, kc[2] + dw];
    g.add(merge([sphere(kc, 2.2, { seg: 10, scale: [0.85, 1.2, 1.05] }), sphere(KP(-0.3, 1.6, 0), 1.5, { seg: 8, scale: [0.8, 0.7, 1.5] }),
      ttube([KP(-0.5, -1.4, -0.7), KP(-1.2, -5, -0.6), KP(-1.3, -8, -0.7), KP(-1.1, -13, -2.4)], 0.72, 0.42, { radial: 5, seg: 9 }),
      ttube([KP(-0.5, -1.4, 0.7), KP(-1.2, -5, 0.6), KP(-1.3, -8, 0.7), KP(-1.0, -12.4, 2.6)], 0.72, 0.42, { radial: 5, seg: 9 })]), 'silk_red');
    g.add(lax([[0, 0], [0, 1.45], [0.5, 2.0], [2.7, 2.0], [3.2, 1.45], [3.2, 0]], KP(-1.25, -4.4, 0), '-t', 12), GOLD);
  }

  // ---- arrow shelf: a cloud-lobed bronze corbel + a pearl pad (the arrow lies on it at t = 0, w = +12)
  {
    const s0 = -16, s1 = 18;
    g.add(plan([[s0, 3.5, 1], [s1, 3.5, 1], [s1, 15, 3], [s1 - 3, 20.4, 2.6], [8, 21.8, 3], [3, 19.6, 1.6], [-2, 21.8, 3], [s0 + 3, 20.4, 2.6], [s0, 15, 3]], { h: 7, ct: -8.5, bevel: 1.1, curveSeg: 4 }), BRONZE);
    g.add(plan(rrect(1.5, 13.4, 13.2, 5.6, 2.2, 3).map(([x, y]) => [x, y]), { h: 1.7, ct: -5.6, bevel: 0.6, curveSeg: 3 }), 'pearl');
    g.add(sweep(rrect(1.5, 13.4, 14.6, 7.0, 3, 3).map(([s, w]) => [s, -4.9, w]), 0.45, { seg: 48, radial: 4, closed: true }), GOLD);
    for (const s of [8, -2]) g.add(domeRivet([s, -8.5, 20.5], 1.1, 'w', 0.9), GOLD);
    // corbel underside: a scroll bracket into the riser
    g.add(ttube([[1, -12, 6], [1, -15.5, 11], [1, -13.6, 16.5], [1, -11.6, 15.4]], 2.4, 1.2, { radial: 7, seg: 12 }), BRONZE);
  }

  // ---- the window: bezels, sun-ray halo, seat ring, the 日珠 rotor (fx_sun), crown leaves in a calyx
  {
    const C = [0, B.win, winW];
    // conforming bezel on both faces: an annulus following the riser surface round the hole, a beaded lip and a flat
    const bezel = (face) => {
      const th = faceTheta(face), prof = [[0, -0.6], [0, 1.0], [0.08, 1.75], [0.2, 1.95], [0.32, 1.55], [0.37, 1.1], [0.64, 1.1], [0.71, 1.45], [0.83, 1.6], [0.93, 1.15], [1, 0.3], [1, -0.6]];
      const rings = [], beads = [];
      for (let k = 0; k < 60; k++) {
        const a = k / 60 * TAU;
        rings.push(prof.map(([f, h]) => { const r = lerp(20.2, 25.6, f), t = C[1] + Math.cos(a) * r, w = C[2] + Math.sin(a) * r; return RS(t, th(t, w - R.wc(t)), h); }));
      }
      for (let k = 0; k < 30; k++) {
        const a = (k + 0.5) / 30 * TAU, r = 22.85, t = C[1] + Math.cos(a) * r, w = C[2] + Math.sin(a) * r, q = th(t, w - R.wc(t));
        beads.push(dome(RS(t, q, 1.0), RN(t, q), 0.62));
      }
      return merge([loft(rings, { wrap: true, crease: 45 }), merge(beads)]);
    };
    g.add(merge([bezel('F'), bezel('B')]), GOLD);
    // sun-ray halo in the mid plane: 16 rays (alternating long / short) flaring past the riser flanks
    {
      const Pp = [], I = [], nr = 6, rIn = 26;
      const rOut = (a) => { const k = a / (TAU / 16), j = Math.round(k), d = Math.abs(k - j) * 2; return 37.5 + (j % 2 ? 6.5 : 12.5) * Math.pow(Math.max(0, 1 - d), 1.6); };
      // thickness: a cast plate thinning outwards, each ray raised into a diamond-section mid-rib (a sharp spine that
      // catches the light, not a flat stamped spike)
      const half = (a, u) => { const k = a / (TAU / 16), j = Math.round(k), d = Math.abs(k - j) * 2; return lerp(8.6, 0.8, Math.pow(u, 0.7)) + 3.0 * Math.max(0, 1 - d * 1.8) * (1 - u * 0.5); };
      for (const [a0, a1] of [[56, 124], [236, 304]]) {
        const na = Math.round((a1 - a0) / 1.6), base = Pp.length / 3, idx = (j, i, side) => base + (j * (nr + 1) + i) * 2 + side;
        for (let j = 0; j <= na; j++) {
          const a = lerp(a0, a1, j / na) * D2R, ro = rOut(a);
          for (let i = 0; i <= nr; i++) {
            const u = i / nr, r = lerp(rIn, ro, u), hh = half(a, u), t = C[1] + Math.cos(a) * r, w = C[2] + Math.sin(a) * r;
            Pp.push(C[0] - hh, t, w, C[0] + hh, t, w);
          }
        }
        for (let j = 0; j < na; j++) for (let i = 0; i < nr; i++) {
          I.push(idx(j, i, 0), idx(j + 1, i, 0), idx(j + 1, i + 1, 0), idx(j, i, 0), idx(j + 1, i + 1, 0), idx(j, i + 1, 0));
          I.push(idx(j, i, 1), idx(j + 1, i + 1, 1), idx(j + 1, i, 1), idx(j, i, 1), idx(j, i + 1, 1), idx(j + 1, i + 1, 1));
        }
        const quad = (a, b, c, d, rev) => (rev ? I.push(a, c, b, a, d, c) : I.push(a, b, c, a, c, d));
        for (let j = 0; j < na; j++) for (const i of [0, nr]) quad(idx(j, i, 0), idx(j, i, 1), idx(j + 1, i, 1), idx(j + 1, i, 0), i === nr);
        for (const j of [0, na]) for (let i = 0; i < nr; i++) quad(idx(j, i, 0), idx(j, i + 1, 0), idx(j, i + 1, 1), idx(j, i, 1), j === na);
      }
      g.add(mesh(Pp, I, { crease: 32 }), GOLD);
    }
    // static gold seat ring in the bore: a channel the rotor's rim runs in
    const Cs = C[0] - 4;
    g.add(lax([[-3.4, 20.9], [-3.4, 19.5], [-2.7, 18.95], [-1.6, 18.95], [-1.4, 19.7], [1.4, 19.7], [1.6, 18.95], [2.7, 18.95], [3.4, 19.5], [3.4, 20.9], [-3.4, 20.9]], [Cs, C[1], C[2]], 's', 56), GOLD);
    // the 日珠 rotor: brilliant-cut stone, pierced gold sun-wheel collet, rim bead, eight claws over the girdle
    const sun = g.part('fx_sun', { pivot: C, extras: { spin: 's', rate: 14, note: '日珠: the hero focus (brilliant-cut stone in a sun-wheel collet), spins slowly about the window axis' } });
    const Rg = 14.2;
    sun.add(brilliant([Cs, C[1], C[2]], Rg), 'crystal');
    const holes = [circleP(0, 0, 13.8, 48)];
    for (let k = 0; k < 16; k++) {
      const a = (k + 0.5) / 16 * TAU, c = Math.cos(a), s = Math.sin(a), P = (r, da) => [Math.cos(a + da) * r, Math.sin(a + da) * r];
      void c; void s;
      holes.push([P(15.3, -0.1), P(16.2, -0.115), P(17.0, -0.07), P(17.75, 0), P(17.0, 0.07), P(16.2, 0.115), P(15.3, 0.1), P(15.05, 0)]);
    }
    const plane = (u, v, z) => [Cs - z, C[1] + v, C[2] + u];
    sun.add(wrapShapes(shapeOf(circleP(0, 0, 18.4, 64), holes), plane, -0.95, 0.95, { bevel: 0.3, edge: 0 }), GOLD);
    sun.add(lax([[-0.75, 18.2], [-0.5, 18.75], [0, 18.95], [0.5, 18.75], [0.75, 18.2], [-0.75, 18.2]], [Cs, C[1], C[2]], 's', 56), GOLD);
    const g2 = Rg * 0.035, hc = 0.42 * Rg, hp = 0.8 * Rg, claws = [];
    for (let k = 0; k < 8; k++) {
      const a = (k + 0.25) / 8 * TAU, ca = Math.cos(a), sa = Math.sin(a), P = (ax, r) => [Cs - ax, C[1] + ca * r, C[2] + sa * r];
      const cr = (r) => g2 + hc * (Rg - r) / (Rg * 0.44), pv = (r) => -g2 - hp * (Rg - r) / Rg;
      claws.push(ttube([P(-0.2, 15.2), P(g2 + 0.9, Rg + 0.55), P(cr(Rg - 1.0) + 0.55, Rg - 1.0), P(cr(Rg - 2.1) + 0.45, Rg - 2.1)], 1.05, 0.5, { radial: 6, seg: 7 }));
      claws.push(ttube([P(0.2, 15.2), P(-g2 - 0.9, Rg + 0.55), P(pv(Rg - 1.0) - 0.55, Rg - 1.0), P(pv(Rg - 2.0) - 0.45, Rg - 2.0)], 1.0, 0.5, { radial: 6, seg: 7 }));
    }
    sun.add(merge(claws), GOLD);
    // 扶桑 crown above the window: a gold calyx with three leaves in staggered layers (jade in front) that fan open on
    // a full draw (§1.17 蓄滿必須有變形); the side leaves tilt 8° off the face
    const tc = 181.5, top = RS(tc, Math.PI, 0);
    g.add(along([[-0.6, 0], [-0.6, 4.9], [0.7, 5.4], [2.3, 6.7], [3.2, 6.3], [3.2, 4.6], [2.1, 3.9], [2.1, 0]], top, [-1, 0, 0], 22, 45), GOLD);
    g.add(merge([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => { const a = (k + 0.5) / 10 * TAU; return dome([top[0] - 2.75, top[1] + Math.cos(a) * 6.55, top[2] + Math.sin(a) * 6.55], [-0.35, Math.cos(a), Math.sin(a)], 0.5); })), GOLD);
    for (const [nm, ang, L, open, mat, ds, tilt] of [['fx_leafL', 124, 26, 22, GOLD, -1.4, 8], ['fx_leafC', 90, 32, 0, 'glaze_jade', -3.3, 0], ['fx_leafR', 56, 26, -22, GOLD, -1.4, 8]]) {
      const lp = g.part(nm, { pivot: top, extras: { open, hinge: 's', note: '扶桑 crown leaf: open 1 = fanned out (full draw)' } });
      const d0 = [0, Math.sin(ang * D2R), Math.cos(ang * D2R)], n0 = [-1, 0, 0], ct = Math.cos(tilt * D2R), st = Math.sin(tilt * D2R);
      const d = d0.map((v, i) => v * ct + n0[i] * st), nrm = n0.map((v, i) => v * ct - d0[i] * st);
      const base = [top[0] + ds, top[1] + d0[1] * 2.5, top[2] + d0[2] * 2.5];
      lp.add(leaf(base, d, nrm, L, L * 0.3, 2, 3), mat);
      lp.add(ttube([[base[0] + 1.1, top[1], top[2]], [base[0] + d[0] * L * 0.3 + 0.2, base[1] + d[1] * L * 0.3, base[2] + d[2] * L * 0.3]], 1.1, 0.6, { radial: 6, seg: 5 }), GOLD);
    }
    g.socket('sun', C);
  }

  // ---- nine branches with the sun cups (fx_ray1-9 = the nine arrows; ammo order 9 -> 1 from the top)
  {
    // one gold cup, built once at the origin facing -s: dish + rim, inner lip, granulation, 16 bevelled flame tongues
    const cupParts = [];
    cupParts.push(lax([[0, 0], [0, 6.2], [1.0, 8.0], [2.2, 8.5], [3.1, 8.1], [3.4, 7.3], [3.4, 5.4], [3.7, 4.9], [3.4, 4.35], [1.4, 4.3], [1.4, 0]], [2.6, 0, 0], '-s', 22));
    for (let k = 0; k < 9; k++) { const a = (k + 0.5) / 9 * TAU; cupParts.push(dome([-0.8, Math.cos(a) * 6.4, Math.sin(a) * 6.4], [-1, 0, 0], 0.55)); }
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU, long = k % 2 === 0, L = long ? 6.4 : 3.8, w0 = long ? 1.6 : 1.25, ca = Math.cos(a), sa = Math.sin(a), pc = -sa, ps = ca;
      const rings = [];
      for (let i = 0; i <= 3; i++) {
        const u = i / 3, r = 8.1 + u * L, wig = (long ? 0.9 : 0.5) * Math.sin(u * Math.PI * 1.1) * (k % 4 < 2 ? 1 : -1), hw = Math.max(0.08, w0 * (1 - u) ** 0.85), hz = Math.max(0.08, 0.55 * (1 - u * 0.7));
        const cx = ca * r + pc * wig, cy = sa * r + ps * wig, sx = 0.35 + 0.15 * u;
        rings.push([[sx - hz, cx, cy], [sx, cx + pc * hw, cy + ps * hw], [sx + hz, cx, cy], [sx, cx - pc * hw, cy - ps * hw]].map(([s, t, w]) => [s, t, w]));
      }
      cupParts.push(loft(rings, { crease: 30 }));
    }
    const cupT = merge(cupParts);
    const BR = [[34, -1, -12, 30], [58, 1, -10, 28], [84, -1, -12, 33], [104, 1, -10, 31], [112, -1, -6, 36], [194, 1, -6, 34], [200, -1, -8, 36], [222, 1, -4, 32], [232, -1, -2, 32]];
    const cups = [], tubes = [], flares = [], leaves = [];
    BR.forEach(([t, sd, dt, dw], i) => {
      const a = sd * Math.PI / 2 + sd * 0.22;                // a little towards the belly
      const ra = a + sd * 0.15 + Math.PI * 0.03 * sd, r0 = RS(t, ra, -1), nr = RN(t, ra);
      const tip = [r0[0] - 9, t + dt, r0[2] + sd * dw];
      const mid = [r0[0] - 5, t + 7, r0[2] + sd * dw * 0.5];
      tubes.push(ttube([r0, mid, tip], 2.9, 1.7, { radial: 7, seg: 10 }));
      // root flare: the branch grows out of the casting rather than being stuck on
      const d1 = V(mid[0] - r0[0], mid[1] - r0[1], mid[2] - r0[2]).normalize(), dd = [-d1.z, d1.y, d1.x];
      flares.push(ttube([[r0[0] - nr[0] * 1.2, r0[1], r0[2] - nr[2] * 1.2], [r0[0] + nr[0] * 1.6 + dd[0] * 2, r0[1] + dd[1] * 2, r0[2] + nr[2] * 1.6 + dd[2] * 2], [r0[0] + dd[0] * 6.5 + nr[0] * 2.4, r0[1] + dd[1] * 6.5, r0[2] + dd[2] * 6.5 + nr[2] * 2.4]], 5.0, 2.95, { radial: 9, seg: 6, caps: false }));
      // a twig and two leaves per branch (bronze: the patina gathers along the veins)
      const tw = [mid[0] - 1, mid[1] + 1, mid[2] + sd * 3];
      tubes.push(ttube([tw, [tw[0] - 2, tw[1] + 9, tw[2] + sd * 7]], 1.1, 0.5, { radial: 5, seg: 5 }));
      leaves.push(leaf([tw[0] - 2, tw[1] + 8, tw[2] + sd * 6], [0, 0.85, sd * 0.5], [-1, 0, sd * 0.2], 13, 4.2, 1.2, 1));
      leaves.push(leaf([mid[0] - 1, mid[1] - 2, mid[2]], [0, -0.55, sd * 0.85], [-1, 0.2, 0], 11, 3.6, 1.1, 1));
      // the sun cup facing the archer; the glow core (recessed, smaller: the metalwork reads first) is its own part
      const cup = [tip[0] - 2, tip[1], tip[2]];
      const cg = cupT.clone(), cv = V(...cup); cg.translate(cv.x, cv.y, cv.z); cups.push(cg);
      const ray = g.part('fx_ray' + (9 - i), { pivot: cup, extras: { note: 'sun core ' + (9 - i) + ' (lit = arrow loaded)' } });
      ray.add(lax([[0, 0], [0, 4.3], [0.6, 4.45], [1.2, 3.9], [1.65, 2.1], [1.8, 0]], [cup[0] + 1.6, cup[1], cup[2]], '-s', 20), 'glow_gold');
      g.socket('ray' + (9 - i), [cup[0] - 1, cup[1], cup[2]]);
    });
    g.add(merge(cups), GOLD);
    g.add(merge([...tubes, ...flares, ...leaves]), BRONZE);
  }

  // ======================================================================== fork sockets, limbs, siyahs
  const earDir = B.ear, earL = B.earL;
  for (const sg of [1, -1]) {
    const U = sg > 0 ? 'U' : 'L';
    // ---- fork collar (body): the riser end swells into a cast socket; granulation, thunder band, ruyi cheek plates
    {
      const T = (t) => sg * t;
      g.add(riserRings([[219.4, -0.5], [221, 0.85], [222.4, 1.9], [224.1, 2.5], [225.8, 2.65], [236.4, 2.65], [237.2, 2.15], [238.4, 2.15], [239.3, 3.0],
        [242.2, 3.25], [244.6, 3.05], [246.3, 2.3], [247.6, 0.9]].map(([t, o]) => [T(t), o]), 56), BRONZE);
      g.add(riserBeads(T(225.2), 2.65, 0.82, 44), GOLD);
      g.add(riserRings([[242.6, 3.15], [243.0, 3.6], [245.2, 3.6], [245.7, 2.9]].map(([t, o]) => [T(t), o]), 56), GOLD);
      const vb = T(231.1), vc = T(233.6), lip = [];
      for (const face of ['F', 'B']) { const m = faceMap(face); for (let k = 0; k < 9; k++) { const u = -12 + k * 3, p = m(u, T(240.7), 3.1), q = m(u, T(240.7), 4.1); lip.push(dome(p, [q[0] - p[0], q[1] - p[1], q[2] - p[2]], 0.75)); } }
      g.add(merge(lip), GOLD);
      for (const face of ['F', 'B']) panel(faceMap(face), -14.4, 14.4, vb - 4.7, vb + 4.7, [thunderT(-13.2, 13.2, vb - 3.6, vb + 3.6, 2.7, 3.82, { border: false })], { base: 2.6, frame: 0.85, rr: 1.4 });
      // cheek plates: a shield crowned with three ruyi lobes (towards the limb), chamfered, an inner line, two screws
      const lob = (p) => p.map(([u, v]) => [u, vc + sg * v]);
      const shield = lob([[-12.6, -6.4], [12.6, -6.4], [12.6, 1.6], ...arcP(9.0, 2.9, 3.6, -20, 152, 8), ...arcP(0, 5.0, 4.8, -8, 188, 12), ...arcP(-9.0, 2.9, 3.6, 28, 200, 8), [-12.6, 1.6]]);
      const sh = sg > 0 ? shield : shield.slice().reverse();
      for (const face of ['R', 'L']) {
        const map = faceMap(face);
        g.add(mapTris(cat(fanT(sh, 2.45, 3.75, { b: 0.35, rings: 2, step: 3 }), ribbonT(insetPoly(sh, 1.8), 0.6, 3.6, 4.07, { closed: true, b: 0.16, step: 3 })), map), 'gold_leaf');
        for (const u of [-7.6, 7.6]) {
          const p = map(u, vc - sg * 1.4, 3.7), q = map(u, vc - sg * 1.4, 4.7), n = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
          g.add(slotScrew(p, n, 1.35, 1.0), 'steel_dark');
        }
      }
    }
    const root = [4, 240 * sg, 0];
    const limb = g.part('fx_limb' + U, { pivot: root, extras: { open: 9 * sg, hinge: 'w', note: 'limb: open 1 = full draw (tip back)' } });
    // three laminations: sinew back under red lacquer, bamboo core, horn belly (crowned)
    // (the laminations end just inside the knee, which starts at u 0.955 and turns away from the limb's own axis)
    limb.add(limbLayer(sg, -0.5, -0.07, { r: 1.6, u1: 0.968 }), LAQ);
    limb.add(limbLayer(sg, -0.07, 0.07, { r: 0.4, inset: 0.45, u1: 0.968 }), 'wood_light');
    limb.add(limbLayer(sg, 0.07, 0.5, { r: 1.8, crown: 1.6, u1: 0.968 }), HORN);
    // ---- limb shoe (rides the limb): wraps the root inside the collar, a bevelled top edge with granulation, ogee
    // lappets running up the belly and the back
    {
      const uT = 0.066;
      limb.add(loft([[0, 2.25], [uT - 0.013, 2.25], [uT - 0.006, 2.1], [uT - 0.002, 1.35], [uT, 0.35]].map(([u, k]) => limbRing(u, sg, k, 2.6, 4))), BRONZE);
      const bd = [], uB = uT - 0.0075, Fr = limbFrame(uB, sg);
      for (let i = 0; i < 38; i++) {
        const [[n, w], [nn, nw]] = rrectAt(LIMB_H(uB) / 2 + 2.15, LIMB_W(uB) / 2 + 2.15, 3.4, (i + 0.5) / 38);
        bd.push(dome([Fr.C[0] + Fr.N[0] * n, Fr.C[1] + Fr.N[1] * n, w], [Fr.N[0] * nn, Fr.N[1] * nn, nw], 0.62));
      }
      limb.add(merge(bd), GOLD);
      const ogee = [[-7.6, -2], [7.6, -2], [7.4, 3], [6.2, 7.6], [4.4, 11.4], [2.2, 14.6], [0, 19.5], [-2.2, 14.6], [-4.4, 11.4], [-6.2, 7.6], [-7.4, 3]];
      for (const f of [0.5, -0.5]) {
        const map = limbMap(sg, f, uT);
        limb.add(mapTris(fanT(ogee, -0.3, 1.0, { b: 0.3, rings: 2 }), map), BRONZE);
        limb.add(mapTris(ribbonT(insetPoly(ogee, 1.6), 0.55, 0.85, 1.35, { closed: true, b: 0.15, step: 2 }), map), GOLD);
      }
    }
    // gold-leaf edge wires, a ruyi chain on the belly, a running 卷雲 scroll on the back
    const wires = [];
    for (const [f, lift, rw] of [[-0.5, 0.25, 0.5], [0.5, 0.45, 0.6]]) for (const q of [1, -1]) {
      const pts = []; for (let i = 0; i <= 16; i++) { const u = 0.075 + 0.86 * i / 16; pts.push(limbPt(u, sg, f, q * (LIMB_W(u) / 2 - 2.4), lift)); }
      wires.push(sweep(pts, rw, { seg: 30, radial: 3 }));
    }
    {
      // back: a wave running the limb, each crest rolling into a curl (12-15 mm), wire 0.65
      const a0 = limbArc(0.1) + 6, a1 = limbArc(0.9), lam = 52, pt = (x, y) => { const u = limbU(x); return limbPt(u, sg, -0.5, y, 0.32); };
      const amp = (x) => LIMB_W(limbU(x)) * 0.17, wave = [];
      for (let x = a0; x <= a1; x += lam / 12) wave.push(pt(x, amp(x) * Math.sin(TAU * (x - a0) / lam)));
      wires.push(sweep(wave, 0.65, { seg: wave.length, radial: 4 }));
      for (let k = 0; ; k++) {
        const xc = a0 + lam / 4 + k * lam / 2; if (xc > a1 - 8) break;
        const up = k % 2 ? -1 : 1, A = amp(xc), r0 = A * 0.82, cy = up * (A - r0), c = [];
        for (let i = 0; i <= 9; i++) { const v = i / 9, ang = Math.PI / 2 * up - up * v * 1.25 * TAU, rr = r0 * (1 - 0.68 * v); c.push(pt(xc + Math.cos(ang) * rr * 1.05, cy + Math.sin(ang) * rr)); }
        wires.push(sweep(c, 0.6, { seg: 10, radial: 3 }));
      }
    }
    {
      // belly ornament: ruyi heads pointing to the tip, linked by a fine tendril (lift follows the horn's crown)
      const belly = (u, y, r) => limbPt(u, sg, 0.5, y, 1.6 * (1 - (y / (LIMB_W(u) / 2)) ** 2) + r * 0.45 + 0.05);
      const pts = []; for (let i = 0; i <= 40; i++) { const u = 0.1 + 0.76 * i / 40; pts.push(belly(u, Math.sin(u * 46) * 1.6, 0.32)); }
      wires.push(sweep(pts, 0.34, { seg: 50, radial: 3 }));
      for (let k = 0; k < 5; k++) {
        const uc = 0.16 + k * 0.152, Rr = LIMB_W(uc) * 0.2;
        for (const line of ruyi(Rr, 0)) wires.push(sweep(line.map(([x, y]) => belly(uc + x / 520, y, 0.4)), 0.4, { seg: Math.max(8, Math.round(line.length * 0.55)), radial: 3 }));
      }
    }
    limb.add(merge(wires), 'gold_leaf');

    // ---- siyah (ear part, hinged at the limb tip): knee, wrap, bands, ear, overlay, bridge, nock, loop, finial
    const P3 = [B.limb[3][0], B.limb[3][1] * sg];
    const dl = Math.hypot(earDir[0], earDir[1]), D = [earDir[0] / dl, earDir[1] * sg / dl];
    let NB = [-D[1], D[0]]; if (NB[0] > 0) NB = [-NB[0], -NB[1]];   // the ear's belly side (towards the archer)
    const ear = g.part('fx_ear' + U, { parent: 'fx_limb' + U, pivot: [P3[0], P3[1], 0], extras: { open: 12 * sg, hinge: 'w', note: 'siyah: open 1 = full draw' } });
    const uN = 0.893, KU = 0.2;                                     // nock notch, knee end on the ear axis
    const EH = (u) => lerp(13, 11.4, smooth(0.12, 0.6, u)) + 3.4 * smooth(0.6, 0.9, u) - 3.6 * smooth(0.95, 1.0, u);
    const EW = (u) => lerp(10.4, 7.6, u);
    const EC = (u) => -5 * Math.max(0, (u - 0.12) / 0.88) ** 2;     // back-swept tip (the string clears the ear)
    const notch = (u) => 1.55 * Math.max(0, 1 - ((u - uN) / 0.0085) ** 2);
    const EP = (u, n, w = 0) => [P3[0] + D[0] * u * earL + NB[0] * (n + EC(u)), P3[1] + D[1] * u * earL + NB[1] * (n + EC(u)), w];
    const earRing = (u, k = 0, rr = 2.6) => rrect(0, 0, EH(u) - notch(u) + k, EW(u) - notch(u) * 0.8 + k, rr + k * 0.4, 3).map(([n, w]) => EP(u, n, w));
    {
      // knee: bezier from the limb (u 0.955) into the ear axis (EP 0.16), sections blending limb -> ear
      const L0 = limbFrame(0.955, sg), K0 = L0.C, T0 = L0.T, K1 = EP(KU, 0), Lk = 23;
      const Q = [K0, [K0[0] + T0[0] * Lk, K0[1] + T0[1] * Lk], [K1[0] - D[0] * Lk, K1[1] - D[1] * Lk], [K1[0], K1[1]]];
      const kneeAt = (v) => {
        const c = bez(Q, v), d = bezD(Q, v);
        let N = [-d[1], d[0]]; if (N[0] > 0) N = [-N[0], -N[1]];
        const m = smooth(0, 1, v);
        return { c, N, hn: lerp(LIMB_H(0.955) / 2 + 2.3, EH(KU), m), hw: lerp(LIMB_W(0.955) / 2 + 0.8, EW(KU), m), rr: lerp(2.2, 2.8, m) };
      };
      const sect = (v, k = 0, n = 3) => { const s = kneeAt(v); return rrect(0, 0, s.hn + k, s.hw + k, s.rr + k * 0.4, n).map(([a, w]) => [s.c[0] + s.N[0] * a, s.c[1] + s.N[1] * a, w]); };
      const vs = []; for (let i = 0; i <= 22; i++) vs.push(i / 22);
      ear.add(loft(vs.map((v) => sect(v))), HORN);
      // silk binding: 34 tight turns of 1.2 mm cord over the real sections (ridged sleeve: valley 0.1 mm, crown 1.15)
      const va = 0.1, vb = 0.885, rv = [];
      let len = 0; for (let i = 0; i < 40; i++) { const a = bez(Q, lerp(va, vb, i / 40)), b = bez(Q, lerp(va, vb, (i + 1) / 40)); len += Math.hypot(b[0] - a[0], b[1] - a[1]); }
      const turns = Math.round(len / 1.34);
      for (let j = 0; j < turns; j++) for (const [f, k] of [[0, 0.1], [0.3, 0.98], [0.7, 0.98]]) rv.push(sect(lerp(va, vb, (j + f) / turns), k, 2));
      rv.push(sect(vb, 0.1, 2));
      ear.add(loft(rv, { crease: 80 }), 'silk_red');
      // beaded gold bands at both ends of the binding
      for (const [v0, v1] of [[0.0, 0.09], [0.895, 0.985]]) {
        const prof = [[0, 0.3], [0.12, 1.15], [0.2, 1.5], [0.3, 1.15], [0.7, 1.15], [0.8, 1.5], [0.88, 1.15], [1, 0.3]];
        ear.add(loft(prof.map(([f, k]) => sect(lerp(v0, v1, f), k, 3))), GOLD);
      }
    }
    {
      // the ear: horn (u 0.13..0.83), gold band, horn tip with the nock notch (0.84..0.965), gold finial collar
      const us = []; for (let i = 0; i <= 16; i++) us.push(lerp(KU - 0.03, 0.835, i / 16));
      ear.add(loft(us.map((u) => earRing(u))), HORN);
      const tipU = [0.832, 0.85, 0.87, 0.879, 0.885, 0.889, 0.893, 0.897, 0.901, 0.907, 0.916, 0.93, 0.945, 0.958, 0.968];
      ear.add(loft(tipU.map((u) => earRing(u, 0, 2.2))), HORN);
      ear.add(loft([[0.824, 0.3], [0.827, 1.0], [0.831, 1.25], [0.836, 1.0], [0.84, 0.3]].map(([u, k]) => earRing(u, k))), GOLD);
      ear.add(loft([[0.962, 0.1], [0.966, 0.95], [0.975, 1.25], [0.988, 1.05], [0.996, 0.55], [1.0, -0.6]].map(([u, k]) => earRing(u, k, 2.4))), GOLD);
      // gold side lines and a pinned bone overlay on the belly
      const lines = [];
      for (const q of [1, -1]) { const pts = []; for (let i = 0; i <= 12; i++) { const u = 0.2 + 0.6 * i / 12; pts.push(EP(u, 0, q * (EW(u) + 0.2))); } lines.push(sweep(pts, 0.55, { seg: 24, radial: 4 })); }
      ear.add(merge(lines), GOLD);
      const emap = (x, y, z) => { const u = 0.29 + y / earL; return EP(u, EH(u) - notch(u) + z, x); };
      ear.add(mapTris(ribbonT([[0, -6], [0, 136]], (f) => 11.2 * Math.pow(Math.min(1, f * 142 / 12), 0.55) * Math.pow(Math.min(1, (1 - f) * 142 / 18), 0.6), -0.3, 1.0, { b: 0.3, step: 4 }), emap), 'pearl');
      const pins = [];
      for (const y of [6, 36, 66, 96, 125]) { const p = emap(0, y, 0.95), q = emap(0, y, 1.95); pins.push(dome(p, [q[0] - p[0], q[1] - p[1], q[2] - p[2]], 1.05, 0.75)); }
      ear.add(merge(pins), GOLD);
      // bridge saddle (弦墊): a carved bone saddle across the ear root, the string seated in its groove
      const uB = 0.245, top = (w) => 8.0 + 1.9 * Math.pow(Math.abs(w) / 11.4, 2.2) - 1.6 * Math.max(0, 1 - (w / 2.6) ** 2);
      const ring = (w, sc) => [[-5.8, -0.8], [5.8, -0.8], [5.4, 2.6], [3.4, 4.6], [3.0, top(w) - 1.6], [1.4, top(w)], [-1.4, top(w)], [-3.0, top(w) - 1.6], [-3.4, 4.6], [-5.4, 2.6]]
        .map(([x, n]) => EP(uB + x * sc / earL, EH(uB) + n * sc, w));
      ear.add(loft([[-11.4, 0.86], [-10.6, 1], [-7, 1], [-3, 1], [-1.6, 1], [0, 1], [1.6, 1], [3, 1], [7, 1], [10.6, 1], [11.4, 0.86]].map(([w, sc]) => ring(w, sc)), { crease: 40 }), 'pearl');
      for (const q of [1, -1]) ear.add(dome(EP(uB, EH(uB) + 3.2, q * 11.4), [0, 0, q], 1.0, 0.7), GOLD);
      const bridge = EP(uB, EH(uB) + 8.0 - 1.6 + 1.45);
      // the string loop seated in the notch, and the braced string along the siyah (bridge -> loop)
      const loop = [], rl = 1.3;
      for (let i = 0; i < 28; i++) { const [[n, w], [nn, nw]] = rrectAt(EH(uN) - notch(uN), EW(uN) - notch(uN) * 0.8, 2.2, i / 28 + 0.25); loop.push(EP(uN, n + nn * (rl - 0.3), w + nw * (rl - 0.3))); }
      ear.add(sweep(loop, rl, { seg: 28, radial: 6, closed: true }), 'bone');
      const nockPt = EP(uN, EH(uN) - notch(uN) + rl - 0.3 + 0.1);
      ear.add(sweep([bridge, [(bridge[0] + nockPt[0]) / 2, (bridge[1] + nockPt[1]) / 2, 0], nockPt], 1.45, { seg: 10, radial: 6 }), 'bone');
      g.socket('bridge' + U, bridge, { ride: 'fx_ear' + U });
      g.socket('tip' + U, nockPt, { ride: 'fx_ear' + U });
      // 扶桑 flame-bud finial: a gold bud with a crystal tip, six gold flame petals round it (~90 mm)
      const Fb = EP(1.0, 0), D3 = [D[0], D[1], 0], NB3 = [NB[0], NB[1], 0];
      ear.add(along([[-1, 0], [-1, 7.4], [3, 8.8], [14, 10.4], [26, 9.2], [38, 6.0], [47, 2.6], [51, 0]], Fb, D3, 18, 50), GOLD);
      const spir = [];
      for (const ph of [0, Math.PI]) { const pts = []; for (let i = 0; i <= 18; i++) { const x = 3 + 42 * i / 18, rr = x < 14 ? lerp(8.8, 10.4, (x - 3) / 11) : lerp(10.4, 2.8, (x - 14) / 31), a = ph + i / 18 * 1.6 * TAU; const R0 = [NB3[0] * Math.cos(a), NB3[1] * Math.cos(a), Math.sin(a)]; pts.push([Fb[0] + D3[0] * x + R0[0] * (rr + 0.15), Fb[1] + D3[1] * x + R0[1] * (rr + 0.15), R0[2] * (rr + 0.15)]); } spir.push(sweep(pts, 0.5, { seg: 40, radial: 4 })); }
      ear.add(merge(spir), GOLD);
      ear.add(sphere([Fb[0] + D3[0] * 52.5, Fb[1] + D3[1] * 52.5, 0], 4.2, { seg: 12 }), 'crystal');
      const pet = [];
      for (let k = 0; k < 6; k++) {
        const a = (k + 0.5) / 6 * TAU, Rd = [NB3[0] * Math.cos(a), NB3[1] * Math.cos(a), Math.sin(a)], Sd = [-NB3[0] * Math.sin(a), -NB3[1] * Math.sin(a), Math.cos(a)];
        const b = [Fb[0] + D3[0] * 1 + Rd[0] * 7.6, Fb[1] + D3[1] * 1 + Rd[1] * 7.6, Rd[2] * 7.6];
        pet.push(petal(b, D3, Rd, Sd, k % 2 ? 50 : 64, k % 2 ? 6.0 : 7.4, 1.6, { bulge: k % 2 ? 9 : 13, flick: k % 2 ? 6 : 11 }));
      }
      ear.add(merge(pet), GOLD);
    }
  }

  // ======================================================================== string, nock, arrow
  {
    // free string sections at brace: nock (s = brace, t = 0) straight up / down to the bridges (re-aimed at runtime)
    const L0 = 650;
    for (const sg of [1, -1]) {
      const U = sg > 0 ? 'U' : 'L';
      const st = g.part('fx_str' + U, { pivot: [B.brace, 0, 0], extras: { str: U, len: L0 / 1000, note: 'free string, nock -> bridge; re-aimed and stretched along its length by premium/sunbow.js' } });
      st.add(lax([[0, 0], [0, 1.5], [L0, 1.5], [L0, 0]], [B.brace, 0, 0], sg > 0 ? 't' : '-t', 8), 'bone');
      st.add(lax([[2, 0], [2, 2.05], [64, 2.05], [66, 1.6], [66, 0]], [B.brace, 0, 0], sg > 0 ? 't' : '-t', 10), 'silk_red');
      for (let k = 0; k < 4; k++) st.add(lax([[0, 0], [0, 2.3], [1.4, 2.3], [1.4, 0]], [B.brace, sg * (12 + k * 14), 0], sg > 0 ? 't' : '-t', 10), GOLD);
    }
    const nock = g.part('fx_nock', { pivot: [B.brace, 0, 0], extras: { open: [-B.draw / 1000, 0, 0], note: 'draw: open 1 = full draw (the nock slides back)' } });
    nock.add(sphere([B.brace, 0, 0], 2.6, { seg: 10 }), GOLD);   // nocking bead

    // arrow along +s at w = arrowW (premium/sunbow.js swings its nock onto the string)
    const AW = B.arrowW, A0 = B.brace, LH = 92, HEAD = A0 + B.arrowL - LH;
    const arrow = g.part('fx_arrow', { parent: 'fx_nock', pivot: [A0, 0, AW], extras: { note: 'nocked arrow; formed / hidden by premium/sunbow.js' } });
    // bone nock with its slot, bamboo shaft with nodes, gold ferrule
    {
      let nk = lax([[0, 0], [0, 4.2], [2, 5.3], [16, 5.3], [18, 5.0], [18, 0]], [A0 - 2, 0, AW], 's', 14);
      nk = cut(nk, [new THREE.BoxGeometry(2.2, 12, 8).translate(...V(A0 + 1, 0, AW).toArray())]);
      arrow.add(nk, 'bone');
      const shaft = [[0, 0], [0, 4.8]];
      for (const s of [190, 400]) shaft.push([s - 4, 4.8], [s - 1.5, 5.4], [s + 1.5, 5.4], [s + 4, 4.8]);
      shaft.push([HEAD - A0 - 14, 4.7], [HEAD - A0 - 14, 0]);
      arrow.add(lax(shaft, [A0 + 14, 0, AW], 's', 12), 'wood_light');
      arrow.add(lax([[0, 0], [0, 5.3], [1, 5.9], [11, 5.9], [12, 5.3], [12, 0]], [HEAD - 12, 0, AW], 's', 16), GOLD);
      // fletching: three shield-cut vanes (cock vane up), quill rachises, gold thread wraps at both ends
      const red = [], gold = [], quills = [];
      for (const a of [90, 210, 330]) {
        const v = vane(A0 + 162, AW, a);
        red.push(v.red); gold.push(v.gold);
        const r0 = (s, r) => { const aa = (a + 5 * (A0 + 162 - s) / 138) * D2R; return [s, Math.sin(aa) * r, AW + Math.cos(aa) * r]; };
        quills.push(ttube([r0(A0 + 166, 5.0), r0(A0 + 120, 5.1), r0(A0 + 70, 5.15), r0(A0 + 22, 5.2)], 0.62, 0.95, { radial: 6, seg: 16 }));
      }
      arrow.add(merge(red), 'silk_red');
      arrow.add(merge(gold), 'gold_leaf');
      arrow.add(merge(quills), 'bone');
      for (const s of [A0 + 18, A0 + 166]) {
        arrow.add(lax([[0, 0], [0, 5.5], [0.5, 5.75], [4.5, 5.75], [5, 5.5], [5, 0]], [s, 0, AW], 's', 16), GOLD);
        const th = []; for (let i = 0; i <= 40; i++) { const u = i / 40, aa = u * TAU * 5; th.push([s + 0.4 + u * 4.2, Math.sin(aa) * 5.82, AW + Math.cos(aa) * 5.82]); }
        arrow.add(sweep(th, 0.2, { seg: 80, radial: 3 }), GOLD);
      }
      // 素矰 sun-silk: a fine helix down the shaft that lights with the draw (glow_sun)
      const hel = [];
      for (let i = 0; i <= 110; i++) { const u = i / 110, s = lerp(A0 + 176, HEAD - 16, u), a = u * TAU * 11; hel.push([s, Math.cos(a) * 4.95, AW + Math.sin(a) * 4.95]); }
      arrow.add(sweep(hel, 0.32, { seg: 240, radial: 3 }), 'glow_sun');
    }
    // the broadhead (fx_head): a bronze 柳葉 blade lofted from the full outline (barbs included, the notch between
    // barb and socket cut with a ground bevel), diamond crest, ground edges, fullers with glowing inlays; socket neck
    {
      const head = g.part('fx_head', { parent: 'fx_arrow', pivot: [HEAD, 0, AW], extras: { note: 'arrowhead; swells / glows with the draw stage' } });
      head.add(lax([[0, 0], [0, 5.6], [1.5, 5.95], [3, 5.5], [12, 4.9], [17, 4.1], [21, 3.2], [22, 0]], [HEAD - 2, 0, AW], 's', 18), BRONZE);
      head.add(lax([[0, 0], [0, 5.75], [0.6, 6.15], [2.2, 6.15], [2.8, 5.75], [2.8, 0]], [HEAD + 1.5, 0, AW], 's', 18), GOLD);
      const Wo = (x) => (x <= 26 ? lerp(15.6, 16, smooth(-6, 26, x)) - 0.5 * Math.sin(Math.PI * clamp01((x + 6) / 32)) : 16 * Math.pow(Math.max(0, 1 - Math.pow((x - 26) / 66, 1.6)), 0.9));
      const Tc = (x) => (x <= 18 ? 4.6 : 4.6 - 4.05 * Math.pow((x - 18) / 74, 1.1));
      const fulD = (x) => 0.8 * smooth(32, 38, x) * (1 - smooth(72, 79, x));
      const sect = (x) => {
        const W = Math.max(0.35, Wo(x)), tc = Tc(x), wr = Math.min(2.6, W * 0.22), wg = Math.max(wr + 0.4, W - Math.min(2.4, W * 0.3)), tg = Math.max(0.28, tc * 0.3), tr = Math.max(tg + 0.06, tc - 1.5 * (1 - 0.5 * x / 92)), te = Math.min(0.2, tg * 0.6);
        const h = (w) => lerp(tr, tg, (w - wr) / (wg - wr)), wf = (wr + wg) / 2, fw = Math.min(1.1, (wg - wr) * 0.3), d = fulD(x);
        const half = [[W, te], [wg, tg], [wf + fw, h(wf + fw)], [wf, h(wf) - d], [wf - fw, h(wf - fw)], [wr, tr], [0, tc]];
        const topS = half.concat(half.slice(0, -1).reverse().map(([w, t]) => [-w, t]));
        const ring = topS.concat(topS.slice().reverse().map(([w, t]) => [w, -t]));
        return ring.map(([w, t]) => [HEAD + x, t, AW + w]);
      };
      const xs = [-6, -4.5, -2, 1, 4.5, 8, 11.5, 14.5, 17.5, 21, 24, 27, 30, 33, 35, 37, 40, 44, 48, 52, 56, 60, 64, 68, 72, 75, 77, 79, 82, 85, 87.5, 89.5, 91];
      let blade = loft(xs.map(sect), { crease: 22 });
      // the notch between barbs and socket: cut with sloped walls so the barbs' inner edges are ground too
      const notchP = (o) => [[-14, -15.25 - o], [-6, -15.25 - o], [1.5, -12.6 - o], [8.5, -9.0 - o], [13, -5.9 - o * 0.8], [15.6 + o * 0.5, -2.6], [16.3 + o * 0.6, 0], [15.6 + o * 0.5, 2.6], [13, 5.9 + o * 0.8], [8.5, 9.0 + o], [1.5, 12.6 + o], [-6, 15.25 + o], [-14, 15.25 + o]];
      const cutter = loft([[-4, 2.4], [0, 0], [4, 2.4]].map(([t, o]) => notchP(o).map(([x, w]) => [HEAD + x, t, AW + w])));
      blade = cut(blade, [cutter]);
      head.add(blade, BRONZE);
      for (const q of [1, -1]) for (const f of [1, -1]) {
        const pts = [];
        for (let x = 37; x <= 74; x += 3.7) { const s = sect(x), p = s[f > 0 ? (q > 0 ? 3 : 9) : (q > 0 ? 22 : 16)]; pts.push([p[0], p[1] + f * 0.36, p[2]]); }
        head.add(sweep(pts, 0.42, { seg: 18, radial: 5 }), 'glow_vermilion');
      }
      g.socket('muzzle', [HEAD + LH, 0, AW], { ride: 'fx_head' });
      g.socket('head', [HEAD + 30, 0, AW], { ride: 'fx_head' });
    }
  }

  // ======================================================================== sockets & meta
  g.socket('grip_l', [0, -70, 0]);
  g.socket('grip_r', [B.brace - 32, -22, 10], { ride: 'fx_nock' });
  g.socket('nock', [B.brace, 0, 0], { ride: 'fx_nock' });
  g.socket('sight_rear', [B.brace, 30, B.arrowW]);
  g.socket('sight_front', [B.brace + B.arrowL, 30, B.arrowW]);
  g.meta({
    grip: 'bow', support: 'bow', reload: 'none', brace: B.brace / 1000, draw: B.draw / 1000, arrowW: B.arrowW / 1000,
    notes: 'Great bow (thumb draw, arrow right of the riser). fx_nock slides back (open = draw); fx_arrow / fx_head ride it. '
      + 'fx_limbU/L + fx_earU/L hinge about w (open 1 = full draw). fx_strU/L: free string sections (nock -> bridge), re-aimed / '
      + 'stretched each frame. fx_ray1-9: the nine sun cores (= arrows). fx_sun: 日珠 focus. fx_leafL/C/R: crown leaves (full draw). '
      + 'Sockets with extras.ride follow that part (grip_r = the draw hand on the string, muzzle = the arrow point). '
      + "Part 'relief': the cast-relief floors (static).",
  });

  // bake: pre-tessellated (glossy lacquer / horn / leather finer), short AO reach, m4's post-bake (buried AO refill,
  // per-material wear from curvature, flat faces unworn); the relief floors then get their verdigris (cavity) wash
  const build = g.build.bind(g);
  g.build = (o = {}) => {
    const root = build({ ...o, bake: false });
    if (o.bake !== false) {
      const meshes = [];
      root.traverse((m) => { if (m.isMesh) meshes.push(m); });
      const tess = (o.tessellate ?? TESS) * 0.001;
      for (const m of meshes) {
        let geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
        for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
        m.geometry = tessellateFat(geo, /^(lacquer_|horn|leather)/.test(m.userData.mat) ? tess : tess * TESS_K, 0.0016);
      }
      if (o.tessOnly) return root;
      const floor = (m) => m.name.startsWith('relief:');
      const reliefH = (m) => (floor(m) ? 0 : /^(lacquer_|horn|leather)/.test(m.userData.mat) ? 0.003 : /^bronze/.test(m.userData.mat) ? 0.0006 : 0);
      bakeMeshes(meshes, { tessellate: 0, aoDist: 0.02, rays: 32, log: true, minHeight: reliefH });
      postBake(root, {}, WEAR);
      root.traverse((m) => {
        if (!m.isMesh || !floor(m)) return;
        // patina pools in the recesses: cavity follows the floor's AO (darker = deeper in among the relief)
        const B = m.geometry.attributes._bake.array;
        for (let i = 0; i < B.length; i += 4) { const ao = B[i] / 255; B[i + 2] = Math.round(255 * Math.min(0.95, 0.5 + 0.7 * (1 - ao))); B[i + 1] = 0; }
      });
    }
    return root;
  };
  return g;
}

const TESS = 22, TESS_K = 2.2;
/** per-material wear [curvature (1/m) mapped to full wear, cap] */
const WEAR = {
  '*:lacquer_red': [1 / 700, 0.4], '*:horn': [1 / 800, 0.35], '*:gold': [1 / 450, 0.7], '*:gold_leaf': [1 / 450, 0.6], '*:bronze_aged': [1 / 380, 0.85],
  'relief:patina_bronze': [0, 0], '*:leather_pebble': [1 / 600, 0.5], '*:leather_grain': [1 / 600, 0.5], '*:steel_dark': [1 / 1000, 0.6], '*:bone': [1 / 700, 0.4], '*:wood_light': [1 / 700, 0.5],
  '*:glaze_jade': [0, 0], '*:pearl': [1 / 900, 0.2], '*:silk_red': [0, 0],
};

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
