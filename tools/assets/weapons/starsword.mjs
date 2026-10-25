// 星河．斬嶽 Xinghe Peakcleaver — 神兵 X02 energy greatsword (docs/PREMIUM_WEAPONS.md §2.29).
// A two-handed 斬馬劍 (1,500 mm overall, 1,100 mm blade, 122 -> 128 -> 114 mm wide) whose solid core carries a sealed
// star river and whose edges project an energy blade:
//   - blade: a lofted section (32-point ring): mirror-polished edge bevel (a real grind line), a tempered slope (straw ->
//     violet bands) up to an outer flat that steps up 0.7 mm to the inner flat (a crisp forging line the whole length),
//     the recessed 星河 channel (t 228 -> 880) whose floor is the galaxy (obsidian, pv_core) under glass_clear in
//     silver frames on rivets, closed by sculpted 如意 caps; past the channel a star-sigil cartouche, the 北辰 pole star
//     and a raised 鎬 ridge running out into an angled point. The outline swells to its percussion point (128 mm) and
//     kinks into the point at t 990; the root flares into ears
//   - ricasso (t 48 -> 215): thicker (5.7 mm), unsharpened chamfered edges, dark mirror finish, a designed cloisonné
//     star chart on each flat (cells cut by rings and star rays, each its own enamel, gold wire on every border); a
//     crisp shoulder and plunge where the edge grind begins
//   - engraved bands between the step and the emitter rails: running cloud scrolls and four-point stars cut 0.3 mm
//     into a plate with a silver inlay floor (錯銀); emitter rails with gold-ringed projector ports
//   - 北斗七星 on both flats: gold eight-point bezels with cut crystal domes over glow cores (fx_starglow1..7)
//   - guard: a silver block (knuckle bosses with a slot each, the hero 天樞 gem cut as a 32-fold brilliant in a gold
//     gallery bezel with six prongs and a bead row, star-ray cloisonné wings, gold rim), and two sculpted 如意 cloud
//     heads fx_guardL / fx_guardR on hinge pins (tongue in the slot, domed pin heads), pierced lobes, a spine rib,
//     tapering 17 -> 7 mm; a mortise plate and a stepped washer stack under the block
//   - grip: ray-skin core (stipple + real 親粒 nodules in the windows), a flat-tape 柄卷 (over / under at every crossing,
//     a fold at each, tie-off knots under the ferrules), gold ferrules with raised 回紋, a gold mid-collar
//   - pommel: an inverted 斗 (octagonal frustum) with a framed cloud relief on every face and gold-leaf corner ridges,
//     the 二十八宿 dial fx_dial (28 inlaid tick grooves, four star studs; spins 24°/s) and the tassel fx_tassel (盤長結,
//     carved and drilled jade melon bead, gold caps, gold-thread binding, 48 strands in clumps; pendulum)
// Side-view mm: t along the sword (tip +t), s = edge direction (front edge +s), w = flat normal (+w faces the player in
// first person). Grip at the origin like a pistol grip (the viewmodel's hand conventions).
import * as THREE from 'three';
import { toCreasedNormals, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';
import { Gun, V, makeShape, profile, plan, sphere, merge, xform, cut, cutters } from '../lib/gunkit.mjs';
import { bakeMeshes } from '../lib/bake.mjs';
import { postBake } from './m4.mjs';

const D2R = Math.PI / 180;
const TAU = Math.PI * 2;
const PF = (pts, o = {}) => profile(pts, { curveSeg: 4, ...o });
const PL = (pts, o = {}) => plan(pts, { curveSeg: 4, ...o });
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
/** loft of closed rings (each ring: [s, t, w] points, same count) with optional end caps (fan to the centroid) */
function loftRings(rings, { close = true, capA = false, capB = false, crease = 30 } = {}) {
  const n = rings[0].length, pts = [], idx = [];
  for (const r of rings) pts.push(...r);
  const m = close ? n : n - 1;
  for (let i = 0; i + 1 < rings.length; i++) for (let j = 0; j < m; j++) {
    const a = i * n + j, b = i * n + (j + 1) % n, c = (i + 1) * n + j, d = (i + 1) * n + (j + 1) % n;
    idx.push(a, c, b, b, c, d);
  }
  const cap = (ri, flip) => {
    const r = rings[ri], c = r.reduce((o, p) => [o[0] + p[0] / n, o[1] + p[1] / n, o[2] + p[2] / n], [0, 0, 0]);
    const ci = pts.length; pts.push(c);
    for (let j = 0; j < n; j++) { const a = ri * n + j, b = ri * n + (j + 1) % n; flip ? idx.push(ci, a, b) : idx.push(ci, b, a); }
  };
  if (capA) cap(0, true);
  if (capB) cap(rings.length - 1, false);
  return mesh(pts, idx, crease);
}
/** smooth round tube along [s, t, w] points (wires, cords): radial normals; hair wires (< 0.6 mm) get 4 sides */
function tubeAlong(points, r, { seg = 32, radial = 6, closed = false, tension = 0.5 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => V(...p)), closed, 'catmullrom', tension);
  const geo = new THREE.TubeGeometry(curve, seg, r, r < 0.6 ? 4 : radial, closed);
  geo.deleteAttribute('uv');
  return geo.toNonIndexed();
}
/** tapered tube (strands, prongs): radius r0 -> r1 */
function taper(points, r0, r1, { seg = 16, radial = 6 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => V(...p)));
  const geo = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  const p = geo.attributes.position, n = radial + 1, c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const u = i / seg, r = r0 + (r1 - r0) * u;
    curve.getPointAt(u, c);
    for (let j = 0; j < n; j++) { const k = i * n + j; v.fromBufferAttribute(p, k).sub(c).multiplyScalar(r).add(c); p.setXYZ(k, v.x, v.y, v.z); }
  }
  geo.deleteAttribute('uv');
  geo.computeVertexNormals();
  return geo.toNonIndexed();
}
/** a ring of beads round the t axis (one modulated tube: 4 segments a bead) at height t, radius r, oval ks / kw */
function beadRing(t, r, br, n, ks = 1, kw = 1) {
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
/** the same bead ring lying on a flat face (round the w axis at [s, t], on the plane w0, outward sd) */
function beadRingW(c, w0, sd, r, br, n) {
  const g = beadRing(0, r, br, n);
  g.rotateZ(-Math.PI / 2);                       // t axis -> w
  g.translate(w0 + sd * br * 0.35, c[1], -c[0]);
  return g;
}
/** signed area of a closed [x, y] loop (> 0 counter-clockwise) */
function loopArea(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
/** signed volume of a closed triangle soup */
function volume(geo) {
  const p = geo.attributes.position.array; let v = 0;
  for (let i = 0; i < p.length; i += 9) v += p[i] * (p[i + 4] * p[i + 8] - p[i + 5] * p[i + 7]) - p[i + 1] * (p[i + 3] * p[i + 8] - p[i + 5] * p[i + 6]) + p[i + 2] * (p[i + 3] * p[i + 7] - p[i + 4] * p[i + 6]);
  return v / 6;
}
/**
 * LatheGeometry faces point out only for a counter-clockwise (r, axis) profile; profiles written t-descending (the old
 * ferrules, collar, pommel, knob, tassel caps) or clockwise rings (the old dial) rendered inside-out. Every lathe is
 * turned to CCW here, and a closed one (ends on the axis, or a closed ring) must come out with a positive volume.
 */
function latheCCW(pts, seg, phase, what) {
  const P = loopArea(pts) < 0 ? [...pts].reverse() : pts;
  const g = new THREE.LatheGeometry(P.map(([r, t]) => new THREE.Vector2(Math.max(0, r), t)), seg, phase);
  const closed = (P[0][0] <= 1e-6 && P.at(-1)[0] <= 1e-6) || (P[0][0] === P.at(-1)[0] && P[0][1] === P.at(-1)[1]);
  if (closed && volume(g.toNonIndexed()) <= 0) throw new Error(`starsword: ${what} lathe is inside-out`);
  return g;
}
/** revolve [[r, t], ...] about the t axis (the sword axis), oval by ks (s) / kw (w), centred on (s, w) */
function revT(pts, { seg = 32, ks = 1, kw = 1, s = 0, w = 0, phase = 0, crease = 40, what = 'revT' } = {}) {
  const g = latheCCW(pts, seg, phase, what);
  g.scale(kw, 1, ks);
  g.translate(w, 0, -s);
  return fin(g, crease);
}
/** revolve about the w axis (bezels, rings, screw heads seen on the flat): [[r, dw], ...] from the face at (s, t, w0), outward sign sd */
function revW(pts, at, sd = 1, { seg = 24, crease = 40, what = 'revW' } = {}) {
  const g = latheCCW(pts, seg, 0, what);
  g.rotateZ(-Math.PI / 2);            // lathe axis y -> +x (= w)
  if (sd < 0) { g.scale(-1, 1, 1); flip(g); }
  const c = V(...at);
  g.translate(c.x, c.y, c.z);
  return fin(g, crease);
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
/** turns a geometry so its normals agree on average with out(p) (three-space position -> expected outward direction) */
function faceOut(geo, out, crease = 40) {
  const p = geo.attributes.position, n = geo.attributes.normal, v = new THREE.Vector3();
  let dot = 0;
  for (let i = 0; i < p.count; i++) { const o = out(v.fromBufferAttribute(p, i)); dot += n.getX(i) * o.x + n.getY(i) * o.y + n.getZ(i) * o.z; }
  return dot < 0 ? fin(flip(geo), crease) : geo;
}
/** mirror across the w = 0 plane (the other flat). scale() already mirrors the normals (normal matrix): negating them
 * again, as the old helper did, left every mirrored copy lit from inside (and the pv rim blazing violet on it) */
function mirW(geo) {
  const g = geo.clone();
  g.scale(-1, 1, 1);
  return flip(g);
}
const both = (geo) => (geo ? [geo, mirW(geo)] : []);
/** mirror across s = 0 (front / back edge) */
function mirS(geo) {
  const g = geo.clone();
  g.scale(1, 1, -1);
  return flip(g);
}
const starPts = (cs, ct, ro, ri, n = 8, rot = 0) => Array.from({ length: n * 2 }, (_, i) => {
  const a = rot + (i / (n * 2)) * TAU, r = i & 1 ? ri : ro;
  return [cs + Math.sin(a) * r, ct + Math.cos(a) * r];
});
const arcPts = (cs, ct, r, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => { const a = (a0 + (a1 - a0) * i / n) * D2R; return [cs + r * Math.cos(a), ct + r * Math.sin(a)]; });
const spiral = (cs, ct, r0, r1, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => { const u = i / n, a = (a0 + (a1 - a0) * u) * D2R, r = r0 + (r1 - r0) * u; return [cs + r * Math.cos(a), ct + r * Math.sin(a)]; });

// ------------------------------------------------------------------------------------------ 2D outlines and plates
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
 * Plate on a flat face without its hidden bottom: top cap + side walls of poly [[s, t]...] (and holes) from z0 to z1
 * above the face w0 (sd = outward side). Enamel cells, cloison wires, inlays, stencil plates.
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
      const m = l.length, sg = (loopArea(l) > 0 ? 1 : -1) * (li ? -1 : 1);   // outer walls face out, hole walls into the hole
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
// sub-millimetre wires shade as one rounded bead: walls share the top's smoothed normals
const WIRE = 100;
const inlayLine = (pts, w0, sd, wd = 0.5, z0 = -0.1, z1 = 0.4) => slab(strokePoly(pts, wd), w0, sd, z0, z1, [], { crease: WIRE });
const inlayRing = (poly, w0, sd, wd = 0.6, z0 = -0.1, z1 = 0.4) => { const p = dedupe(poly); return slab(offsetPoly(p, wd / 2), w0, sd, z0, z1, [offsetPoly(p, -wd / 2)], { crease: WIRE }); };
/** small domed stud on a flat face */
const stud = (s, t, w0, sd, r, h = r * 0.6, seg = 10) => revW([[0, 0], [r, 0], [r * 0.92, h * 0.45], [r * 0.6, h * 0.85], [0, h]], [s, t, w0], sd, { seg });

// ---- signed distance fields -> sculpted outlines (unions with fillets, piercings): marching squares
const sdCircle = (c, r) => (p) => Math.hypot(p[0] - c[0], p[1] - c[1]) - r;
/** round cone a -> b (radii ra -> rb) */
const sdCapsule = (a, b, ra, rb = ra) => (p) => {
  const bx = b[0] - a[0], by = b[1] - a[1], px = p[0] - a[0], py = p[1] - a[1];
  const h = clamp01((px * bx + py * by) / (bx * bx + by * by));
  return Math.hypot(px - bx * h, py - by * h) - lerp(ra, rb, h);
};
/** polygon (negative inside), optionally rounded by r (grows by r) */
const sdPoly = (poly, r = 0) => (p) => {
  let d = Infinity, inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j], b = poly[i], ex = b[0] - a[0], ey = b[1] - a[1], wx = p[0] - a[0], wy = p[1] - a[1];
    const h = clamp01((wx * ex + wy * ey) / (ex * ex + ey * ey));
    d = Math.min(d, Math.hypot(wx - ex * h, wy - ey * h));
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < a[0] + (p[1] - a[1]) / (b[1] - a[1]) * ex) inside = !inside;
  }
  return (inside ? -d : d) - r;
};
const smin = (a, b, k) => { if (k <= 0) return Math.min(a, b); const h = clamp01(0.5 + 0.5 * (b - a) / k); return lerp(b, a, h) - k * h * (1 - h); };
/** smooth union of fields (fillet k) */
const U = (k, ...fs) => (p) => { let d = fs[0](p); for (let i = 1; i < fs.length; i++) d = smin(d, fs[i](p), k); return d; };
/** field minus fields (sharp) */
const SUB = (f, ...gs) => (p) => { let d = f(p); for (const g of gs) d = Math.max(d, -g(p)); return d; };
/** 0-level outlines of a field on a grid of pitch h: [{ outer, holes }] (outer CCW, holes CW), simplified */
function shapes(sdf, [x0, y0, x1, y1], h = 0.35, tol = 0.03) {
  const nx = Math.ceil((x1 - x0) / h) + 1, ny = Math.ceil((y1 - y0) / h) + 1, F = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let v = i === 0 || j === 0 || i === nx - 1 || j === ny - 1 ? Math.max(1e-3, sdf([x0 + i * h, y0 + j * h])) : sdf([x0 + i * h, y0 + j * h]);
    if (Math.abs(v) < 1e-7) v = 1e-7;
    F[j * nx + i] = v;
  }
  const at = (i, j) => F[j * nx + i];
  const Hd = (i, j) => 2 * (j * nx + i), Vd = (i, j) => 2 * (j * nx + i) + 1;
  const pos = (e) => {
    const k = e >> 1, i = k % nx, j = (k / nx) | 0, a = F[k];
    if (e & 1) { const b = at(i, j + 1); return [x0 + i * h, y0 + (j + a / (a - b)) * h]; }
    const b = at(i + 1, j); return [x0 + (i + a / (a - b)) * h, y0 + j * h];
  };
  // directed segments with the inside on the left: outer loops come out CCW, holes CW
  const next = new Map();
  for (let j = 0; j + 1 < ny; j++) for (let i = 0; i + 1 < nx; i++) {
    const a = at(i, j) < 0, b = at(i + 1, j) < 0, c = at(i + 1, j + 1) < 0, d = at(i, j + 1) < 0;
    const e0 = Hd(i, j), e1 = Vd(i + 1, j), e2 = Hd(i, j + 1), e3 = Vd(i, j);
    const m = (at(i, j) + at(i + 1, j) + at(i + 1, j + 1) + at(i, j + 1)) / 4 < 0;
    switch ((a ? 1 : 0) | (b ? 2 : 0) | (c ? 4 : 0) | (d ? 8 : 0)) {
      case 1: next.set(e0, e3); break; case 2: next.set(e1, e0); break; case 4: next.set(e2, e1); break; case 8: next.set(e3, e2); break;
      case 3: next.set(e1, e3); break; case 6: next.set(e2, e0); break; case 12: next.set(e3, e1); break; case 9: next.set(e0, e2); break;
      case 7: next.set(e2, e3); break; case 11: next.set(e1, e2); break; case 13: next.set(e0, e1); break; case 14: next.set(e3, e0); break;
      case 5: if (m) { next.set(e0, e1); next.set(e2, e3); } else { next.set(e0, e3); next.set(e2, e1); } break;
      case 10: if (m) { next.set(e3, e0); next.set(e1, e2); } else { next.set(e1, e0); next.set(e3, e2); } break;
      default: break;
    }
  }
  const loops = [], seen = new Set();
  for (const s of next.keys()) {
    if (seen.has(s)) continue;
    const L = []; let e = s;
    while (e !== undefined && !seen.has(e)) { seen.add(e); L.push(pos(e)); e = next.get(e); }
    if (L.length >= 3) loops.push(simplify(L, tol));
  }
  const outers = loops.filter((l) => loopArea(l) > 0).map((l) => ({ outer: l, holes: [] }));
  for (const l of loops.filter((q) => loopArea(q) < 0)) {
    const o = outers.find((O) => inPoly(l[0], O.outer));
    if (o) o.holes.push(l);
  }
  return outers;
}
function inPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j], b = poly[i];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < a[0] + (p[1] - a[1]) / (b[1] - a[1]) * (b[0] - a[0])) inside = !inside;
  }
  return inside;
}
/** drops points that sit within tol of the line through their neighbours (segments stay <= 2.5 mm) */
function simplify(loop, tol) {
  let pts = loop;
  for (let pass = 0; pass < 8; pass++) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], a = out.length ? out[out.length - 1] : pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length];
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-9;
      if (Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / L > tol || L > 2.5 || i % 2) out.push(p);
    }
    if (out.length === pts.length) break;
    pts = out;
  }
  return pts;
}
/** sculpted plate: an outline (+ holes) in (s, t) extruded across w (thickness w centred on cw), rounded edges */
function sculpt(shape, { w, cw = 0, bs = 1, bt = bs, seg = 3, crease = 50 }) {
  const sh = new THREE.Shape(shape.outer.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of shape.holes) sh.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  const depth = Math.max(0.02, w - 2 * bt);
  const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bs > 0, bevelThickness: bt, bevelSize: bs, bevelOffset: -bs, bevelSegments: seg, curveSegments: 1, steps: 1 });
  geo.translate(0, 0, -depth / 2);
  geo.rotateY(Math.PI / 2);             // (x = s, y = t, z = thick) -> (thick, t, -s)
  geo.translate(cw, 0, 0);
  return fin(geo, crease);
}
const sculptAll = (sdf, box, o, h) => shapes(sdf, box, h).map((s) => sculpt(s, o));
/**
 * Inlaid line following a field's outline at inset d (width wd): the band between the d - wd/2 and d + wd/2 level
 * sets (outer boundaries only). Robust where a mitred polygon offset folds over itself at the sharp corners.
 */
function insetRing(sdf, box, d, wd, w0, sd, z0, z1, h = 0.3) {
  const A = shapes((p) => sdf(p) + d - wd / 2, box, h, 0.09), B = shapes((p) => sdf(p) + d + wd / 2, box, h, 0.09);
  return A.map((a) => slab(a.outer, w0, sd, z0, z1, B.filter((b) => inPoly(b.outer[0], a.outer)).map((b) => b.outer), { crease: WIRE })).filter(Boolean);
}
/** Sutherland-Hodgman: subject polygon clipped by a convex polygon */
function clipConvex(subject, clip) {
  let out = subject;
  const ccw = loopArea(clip) > 0;
  for (let i = 0; i < clip.length && out.length; i++) {
    const A = clip[i], B = clip[(i + 1) % clip.length];
    const side = (p) => (B[0] - A[0]) * (p[1] - A[1]) - (B[1] - A[1]) * (p[0] - A[0]);
    const ins = (p) => (ccw ? side(p) >= -1e-9 : side(p) <= 1e-9);
    const inp = out; out = [];
    for (let j = 0; j < inp.length; j++) {
      const P = inp[j], Q = inp[(j + 1) % inp.length], pi = ins(P), qi = ins(Q);
      const X = () => { const a = side(P), b = side(Q), u = a / (a - b); return [P[0] + (Q[0] - P[0]) * u, P[1] + (Q[1] - P[1]) * u]; };
      if (pi) { out.push(P); if (!qi) out.push(X()); } else if (qi) out.push(X());
    }
  }
  return out;
}
const onBoundary = (p, poly, eps = 0.06) => poly.some((a, i) => {
  const b = poly[(i + 1) % poly.length], ex = b[0] - a[0], ey = b[1] - a[1], h = clamp01(((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / (ex * ex + ey * ey));
  return Math.hypot(p[0] - a[0] - ex * h, p[1] - a[1] - ey * h) < eps;
});
/**
 * Star-chart cells: rings (radii) x sectors (per ring { n, a0 }) round c, every arc sampled on one 3.75° grid so
 * neighbours share their vertices; clipped to a convex polygon. toneOf(ring, sector) -> enamel index.
 */
function polarCells(c, radii, sectors, clip, toneOf) {
  const cells = [], G = (r) => (r < 25 ? 7.5 : 3.75);   // arc grid by radius (both neighbours of an arc sample it alike)
  const arc = (r, a0, a1) => { const g = G(r), out = []; for (let k = Math.round(a0 / g); k <= Math.round(a1 / g); k++) out.push([c[0] + r * Math.cos(k * g * D2R), c[1] + r * Math.sin(k * g * D2R)]); return out; };
  for (let i = 0; i + 1 < radii.length; i++) {
    const { n, a0 = 0 } = sectors[i], step = 360 / n;
    for (let j = 0; j < n; j++) {
      const A0 = a0 + j * step, A1 = A0 + step;
      const poly = radii[i] === 0 ? (n === 1 ? arc(radii[1], 0, 360 - G(radii[1])) : [[...c], ...arc(radii[i + 1], A0, A1)]) : [...arc(radii[i + 1], A0, A1), ...arc(radii[i], A0, A1).reverse()];
      const cl = dedupe(clipConvex(poly, clip), 0.01);
      if (cl.length >= 3 && Math.abs(loopArea(cl)) > 0.4) cells.push({ poly: cl, tone: toneOf(i, j) });
    }
  }
  return cells;
}
/**
 * Designed cloisonné: enamel cell tops (each cell its own enamel key; walls hide under wires / frame), gold wire on
 * every border (shared edges once, chained into runs; a bead at every junction). border false: edges lying on `clip`
 * are left to a frame. Returns { [material]: [geo] }.
 */
function cloisonne(cells, clip, w0, sd, keys, { wd = 0.5, ez = [-0.15, 0.4], wz = [-0.1, 0.75], border = false, beads = false } = {}) {
  const out = {};
  const add = (k, g) => { if (g) (out[k] ||= []).push(g); };
  for (const c of cells) add(keys[c.tone], slab(c.poly, w0, sd, ez[0], ez[1], [], { walls: false }));
  const K = (p) => Math.round(p[0] * 40) + ',' + Math.round(p[1] * 40);
  const edges = new Map();
  for (const c of cells) {
    const P = c.poly;
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length], ka = K(a), kb = K(b);
      if (ka === kb) continue;
      if (!border && onBoundary(a, clip) && onBoundary(b, clip) && onBoundary([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], clip)) continue;
      const key = ka < kb ? ka + '|' + kb : kb + '|' + ka;
      if (!edges.has(key)) edges.set(key, [a, b, ka, kb]);
    }
  }
  const list = [...edges.values()], adj = new Map(), pts = new Map();
  list.forEach((e, i) => { for (const [k, p] of [[e[2], e[0]], [e[3], e[1]]]) { pts.set(k, p); if (!adj.has(k)) adj.set(k, []); adj.get(k).push(i); } });
  const used = new Uint8Array(list.length);
  const walk = (k0, e0) => {
    const path = [pts.get(k0)]; let k = k0, ei = e0;
    while (ei !== undefined && !used[ei]) {
      used[ei] = 1;
      const e = list[ei]; k = e[2] === k ? e[3] : e[2]; path.push(pts.get(k));
      const nb = adj.get(k); if (nb.length !== 2) break;
      ei = nb.find((j) => !used[j]);
    }
    return path;
  };
  for (const [k, nb] of adj) if (nb.length !== 2) for (const ei of nb) if (!used[ei]) add('gold', slab(strokePoly(walk(k, ei), wd), w0, sd, wz[0], wz[1], [], { crease: WIRE }));
  for (let i = 0; i < list.length; i++) if (!used[i]) { const p = walk(list[i][2], i); p.pop(); add('gold', inlayRing(p, w0, sd, wd, wz[0], wz[1])); }
  if (beads) for (const [k, nb] of adj) if (nb.length >= 3) { const p = pts.get(k); add('gold', stud(p[0], p[1], w0 + sd * (wz[1] - 0.2), sd, wd * 0.85, wd * 0.6, 8)); }
  return out;
}
const addAll = (target, byMat) => { for (const [m, list] of Object.entries(byMat)) if (list.length) target.add(merge(list), m); };
const joinAll = (...maps) => { const o = {}; for (const m of maps) for (const [k, l] of Object.entries(m)) (o[k] ||= []).push(...l); return o; };
/** maps geometry built round a local origin (local s -> right, t -> up, w -> normal; three-space vectors) onto a face */
function onFrame(geo, origin, right, up, normal) {
  // local three axes: x = w (normal), y = t (up), z = -s (-right); the basis must be right-handed
  const m = new THREE.Matrix4().makeBasis(normal, up, right.clone().negate());
  if (m.determinant() < 0) { geo.scale(1, 1, -1); flip(geo); m.makeBasis(normal, up, right); }
  geo.applyMatrix4(m);
  geo.translate(origin.x, origin.y, origin.z);
  return fin(geo, 60);
}
/** 祥雲 cloud: three lobes over a base and a curling tail (about 22 x 12 mm at k = 1), f = -1 mirrors */
const cloudSDF = (cx, cy, k = 1, f = 1) => U(1.1 * k,
  sdCircle([cx - f * 5 * k, cy + 0.6 * k], 3.4 * k), sdCircle([cx + f * 0.6 * k, cy + 2.6 * k], 4.3 * k), sdCircle([cx + f * 5.6 * k, cy + 0.2 * k], 2.9 * k),
  sdCapsule([cx - f * 9.5 * k, cy - 2.6 * k], [cx + f * 10.5 * k, cy - 2.4 * k], 1.5 * k, 0.8 * k));
/** cut dome (faceted cabochon) on a flat face: girdle R, height H, n facets a ring (alternate rings turned half a facet) */
function cutDome(c, w0, sd, R, H, n = 12) {
  const rows = [[1, 0], [1, 0.32], [0.8, 0.7], [0.5, 0.94], [0.02, 1]];
  const rings = rows.map(([k, h], i) => Array.from({ length: n }, (_, j) => { const a = (j + (i % 2) * 0.5) / n * TAU; return [c[0] + Math.cos(a) * R * k, c[1] + Math.sin(a) * R * k, w0 + sd * H * h]; }));
  const base = V(c[0], c[1], w0);
  return faceOut(loftRings(rings, { crease: 8 }), (p) => p.clone().sub(base), 8);
}

// ------------------------------------------------------------------------------------------ blade law (mm)
const T0 = 48, TT = 1150, TR = 215, TS = 990;   // blade foot (inside the guard), tip, ricasso end (shoulder), point
const CH0 = 228, CH1 = 880;                      // 星河 channel
const RIC = 5.7, FLAT = 5.2, CHD = 2.4;          // ricasso / blade half thickness, channel depth
const HS = 57;                                   // half width at the shoulder of the point
const hwOf = (t) => {
  if (t >= TS) { const u = Math.min(1, (t - TS) / (TT - TS)); return HS * (1 - u) * (1 + 0.6 * u * (1 - u)); }   // angled point (kinks in at TS)
  if (t >= 760) return 64 - 7 * (1 - Math.cos(Math.PI * (t - 760) / (TS - 760))) / 2;
  if (t >= TR) return 60.6 + 3.4 * Math.sin(Math.PI / 2 * (t - TR) / (760 - TR));               // swell to the percussion point
  const ear = t < 88 ? 0 : t < 99 ? Math.sin(Math.PI / 2 * (t - 88) / 11) : Math.pow(1 - smooth(99, 138, t), 1.4);
  return lerp(61, 60.6, smooth(138, TR, t)) + 5.5 * ear;                                          // ears at the root
};
const thOf = (t) => (t <= 920 ? FLAT : 1.0 + 4.2 * Math.pow(Math.max(0, 1 - (t - 920) / (TT - 920)), 0.8));
const cwOf = (t) => (t < CH0 || t > CH1 ? 0 : 12 - 5 * (t - CH0) / (CH1 - CH0));   // channel half width
/** section parameters at t: half width, thickness, edge bevel (eb wide, ew half thick at the grind line), slope sw, outer flat thO, step, channel, ridge */
function bladeAt(t) {
  const hw = hwOf(t);
  if (t < TR) return { hw, th: RIC, thO: RIC, eb: 0.6, ew: RIC * 0.78, sw: 1.0, stepS: 0.6 * hw, stepF: 0.6 * hw + 0.8, c: 0, d: 0, ridge: 0 };
  const th = thOf(t), k = th / FLAT, pl = smooth(TR, TR + 16, t);
  const eb = lerp(1.0, Math.min(9.5, hw * 0.4), pl), ew = lerp(th * 0.72, Math.min(2.4, th * 0.46), pl), sw = lerp(1.0, Math.min(10, hw * 0.17), pl);   // a temper band wide enough to read at arm's length
  const fl = hw - eb - sw, stepS = 0.72 * fl;
  const c = cwOf(t);
  return { hw, th, thO: th - 1.1 * k, eb, ew, sw, stepS, stepF: stepS + Math.min(0.8, 0.2 * fl), c, d: c > 0 ? CHD : 0, ridge: t > 1040 ? smooth(1040, 1078, t) * k : 0 };
}
const flOf = (t) => { const p = bladeAt(t); return p.hw - p.eb - p.sw; };
const railS = (t) => flOf(t) - 2.4;              // emitter rail centre line (|s|), just inside the slope
const PLATE = 0.85;                              // engraved plate: its top above the outer flat (the cut is 0.9 mm, silver-filled)

// the 7 stars of 北斗 on the +w flat (s, t, size): bowl 天樞 天璇 天璣 天權, handle 玉衡 開陽 搖光
const STARS = [[24, 262, 1.15], [-25, 338, 1], [-22, 440, 1], [21, 478, 1], [21, 596, 1], [-21, 706, 1], [19, 826, 1.05]];
const LINKS = [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]];
// enamel keys (each retinted per weapon in defs.js): cobalt, night, sky, nebula, star white
const EN = ['glaze_cobalt', 'glaze_inkteal', 'glaze_turquoise', 'glaze_aubergine', 'porcelain'];

export default function build() {
  const g = new Gun('starsword');

  // ======================================================================== blade (one loft, split by material)
  {
    const ts = [T0, 60, 76, 86, 90, 93, 96, 99, 102, 106, 112, 120, 130, 142, 158, 178, 198, TR - 0.8, TR + 0.8, TR + 4, TR + 8, TR + 12, TR + 17, CH0 - 1.2, CH0 + 0.6];
    for (let t = CH0 + 22; t < CH1; t += 24) ts.push(t);
    ts.push(CH1 - 0.6, CH1 + 1.2);
    for (let t = CH1 + 16; t < TS; t += 16) ts.push(t);
    ts.push(TS - 0.5, TS, TS + 0.5, 1040, 1046, 1052, 1060, 1068, 1078);
    for (let i = 1; i <= 26; i++) ts.push(TS + (TT - TS) * (1 - Math.pow(1 - i / 26, 1.3)));
    const T = [...new Set(ts.map((t) => Math.round(t * 100) / 100))].sort((a, b) => a - b);
    const ring = (t) => {
      const { hw, th, thO, eb, ew, sw, stepS, stepF, c, d, ridge } = bladeAt(t);
      if (hw < 0.05) return Array.from({ length: 32 }, () => [0, t, 0]);
      const fl = hw - eb - sw;
      const inner = c > 0 ? [[c + 0.8, th], [c, th - d]] : [[stepS * 0.6, th + ridge * 0.4], [stepS * 0.25, th + ridge * 0.75]];
      const F = [[hw - eb, ew], [hw - eb - sw * 0.45, lerp(ew, thO, 0.62)], [fl, thO], [stepF, thO], [stepS, th], ...inner];
      const up = [...F, [0, c > 0 ? th - d : th + ridge], ...F.slice().reverse().map(([s, w]) => [-s, w])];
      return [[hw, t, 0], ...up.map(([s, w]) => [s, t, w]), [-hw, t, 0], ...up.slice().reverse().map(([s, w]) => [s, t, -w])];
    };
    const rings = T.map(ring);
    // segment classes round the upper half (the lower half repeats them): mirror edge, temper bands, flats, channel floor
    const CLS = ['edge', 'straw', 'violet', 'blued', 'blued', 'blued', 'blued', 'floor', 'floor', 'blued', 'blued', 'blued', 'blued', 'violet', 'straw', 'edge'];
    const parts = {};
    for (let i = 0; i + 1 < rings.length; i++) for (let j = 0; j < 32; j++) {
      const cls = CLS[j % 16], ric = T[i] < TR;
      const mat = ric ? (cls === 'edge' ? 'chrome' : 'black_chrome')
        : cls === 'edge' ? 'chrome' : cls === 'straw' ? 'brass' : cls === 'violet' ? 'steel_bright'
          : cls === 'floor' && cwOf(T[i]) > 0 && cwOf(T[i + 1]) > 0 ? 'obsidian' : 'steel_blued';
      (parts[mat] ||= []).push([rings[i][j], rings[i][(j + 1) % 32], rings[i + 1][j], rings[i + 1][(j + 1) % 32]]);
    }
    for (const [mat, quads] of Object.entries(parts)) {
      const pts = [], idx = [];
      for (const [a, b, c, d] of quads) { const o = pts.length; pts.push(a, b, c, d); idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
      g.add(mesh(pts, idx, mat === 'chrome' ? 25 : 22), mat);
    }
    // the blade foot is closed inside the guard (a cap so the bake sees a solid)
    g.add(loftRings([ring(T0), ring(T0 + 0.01)], { capA: true }), 'black_chrome');
  }

  // ---- glass over the galaxy (both flats), slightly below the flat
  {
    const glass = [];
    const T = []; for (let t = CH0 + 2; t <= CH1 - 2; t += 20) T.push(t); T.push(CH1 - 2);
    for (const sd of [1, -1]) {
      const pts = [], idx = [];
      T.forEach((t) => { const c = cwOf(t) - 0.3, w = sd * (FLAT - 0.8); pts.push([c, t, w], [-c, t, w]); });
      for (let i = 0; i + 1 < T.length; i++) { const a = i * 2; sd > 0 ? idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3) : idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      glass.push(mesh(pts, idx, 60));
    }
    g.add(merge(glass), 'glass_clear');
  }

  // ---- channel frames on rivets, sculpted 如意 end caps with an inlaid gold line and a centre bead
  {
    const fr = [], riv = [], gold = [];
    for (const sd of [1, -1]) for (const side of [1, -1]) {
      // a raised lip 3.4 mm wide over the channel edge, following the taper (ribbon box on the flat)
      const T = []; for (let t = CH0 - 4; t <= CH1 + 4; t += 20) T.push(t);
      const rings = T.map((t) => {
        const c = Math.max(cwOf(Math.min(CH1, Math.max(CH0, t))), 0) * side, w0 = sd * (FLAT - 0.4), w1 = sd * (FLAT + 0.75);
        const a = c - side * 0.6, b = c + side * 2.8;
        return [[a, t, w0], [b, t, w0], [b + side * 0.3, t, w1 - sd * 0.25], [b, t, w1], [a + side * 0.3, t, w1], [a, t, w1 - sd * 0.25]];
      });
      fr.push(loftRings(sd * side > 0 ? rings : rings.map((r) => r.slice().reverse()), { capA: true, capB: true, crease: 35 }));
      for (let t = CH0 + 45; t < CH1 - 20; t += 90) riv.push(stud((cwOf(t) + 1.2) * side, t, sd * (FLAT + 0.7), sd, 1.2, 0.9));
    }
    // 如意 cap: a base over the frame ends, three lobes reaching into the channel (dir +1 = up the blade)
    const capSDF = (t0, dir) => {
      const c0 = cwOf(dir > 0 ? CH0 : CH1) + 4.5;
      return U(1.6, sdPoly([[-c0, t0 - dir * 1], [c0, t0 - dir * 1], [c0, t0 + dir * 5], [-c0, t0 + dir * 5]], 1.2),
        sdCircle([0, t0 + dir * 10.5], c0 * 0.4), sdCircle([c0 * 0.6, t0 + dir * 6.5], c0 * 0.29), sdCircle([-c0 * 0.6, t0 + dir * 6.5], c0 * 0.29));
    };
    for (const [t0, dir] of [[CH0 - 7, 1], [CH1 + 7, -1]]) {
      const c0 = cwOf(dir > 0 ? CH0 : CH1) + 4.5;
      const sh = shapes(capSDF(t0, dir), [-c0 - 4, Math.min(t0 - 6 * dir, t0 + 22 * dir), c0 + 4, Math.max(t0 - 6 * dir, t0 + 22 * dir)], 0.3, 0.05);
      for (const s of sh) fr.push(...both(sculpt(s, { w: 2.0, cw: FLAT + 0.6, bs: 0.7, bt: 0.6, seg: 2 })));
      for (const r of insetRing(capSDF(t0, dir), [-c0 - 4, Math.min(t0 - 6 * dir, t0 + 22 * dir), c0 + 4, Math.max(t0 - 6 * dir, t0 + 22 * dir)], 1.9, 0.45, FLAT + 1.6, 1, -0.15, 0.3, 0.25)) gold.push(...both(r));
      gold.push(...both(stud(0, t0 + dir * 9.5, FLAT + 1.55, 1, 1.5, 1.0, 12)));
    }
    g.add(merge([...fr, ...riv]), 'silver_aged');
    g.add(merge(gold), 'gold');
  }

  // ---- engraved bands (錯銀): a plate over the outer flat between the step and the emitter rail, running cloud
  // scrolls and four-point stars cut 0.3 mm through it onto a silver inlay floor
  {
    const B0 = 238, B1 = 898;
    const plateW0 = FLAT - 1.1;                  // outer flat (thO) along the band
    const edge = (t) => { const p = bladeAt(t); return [p.stepF + 0.15, p.hw - p.eb - p.sw - 0.15]; };
    const lower = [], upper = [];
    for (let t = B0; t <= B1 + 1e-6; t += 16.5) { const [a, b] = edge(t); lower.push([a, t]); upper.push([b, t]); }
    const poly = [...lower, ...upper.reverse()];
    // strokes: S scrolls (two spirals joined by a line) alternating with four-point stars; centred in the band; ~1 mm
    // wide so the bright inlay still reads at arm's length (0.55 mm aliased away)
    const holes = [], fills = [];
    const H = 5.8, Rr = H / 4 * 0.95, r0 = Rr * 0.36, Lx = 14, P = 22, n = 8;
    const sp = [];
    for (let i = 0; i <= n; i++) { const u = i / n, ang = Math.PI / 2 + (1 - u) * 0.9 * TAU, r = lerp(r0, Rr, u); sp.push([-(Lx / 2 - Rr) + Math.cos(ang) * r, -Rr + Math.sin(ang) * r]); }
    const S = [...sp, ...sp.slice().reverse().map(([x, y]) => [-x, -y])];
    for (let k = 0, t = B0 + 14; t + Lx / 2 < B1 - 6; k++, t += P) {
      const mid = (tt) => { const p = bladeAt(tt), fl = p.hw - p.eb - p.sw; return (p.stepF + fl - 3.5) / 2; };   // between the step and the rail
      const f = k % 2 ? -1 : 1;
      const pts = S.map(([x, y]) => [mid(t + x) + f * y, t + x]);
      const st = strokePoly(pts, 1.0);
      holes.push(st); fills.push(st);
      const tc = t + P / 2, sc = mid(tc), star = starPts(sc, tc, 2.6, 0.75, 4, 0);
      holes.push(star); fills.push(star);
    }
    const sil = [], blu = [];
    blu.push(slab(poly, plateW0, 1, -0.05, PLATE, holes, { crease: 30 }));
    // the silver fills the cut up to just under the plate face (錯銀 is flush: a fill at the bottom of a 0.75 mm groove
    // baked black under its own AO)
    for (const f of fills) sil.push(slab(f, plateW0, 1, -0.05, PLATE - 0.1, [], { walls: false }));
    const plateB = merge(blu), fillB = merge(sil);
    g.add(merge([plateB, mirW(plateB), mirS(plateB), mirW(mirS(plateB))]), 'steel_blued');
    g.add(merge([fillB, mirW(fillB), mirS(fillB), mirW(mirS(fillB))]), 'steel');   // bright inlay silver (retinted in defs.js)
  }

  // ---- emitter rails on the engraved plates + projector ports (gold rims, glow dots), gold terminals
  {
    const rails = [], rims = [], dots = [];
    const top = FLAT - 1.1 + PLATE;
    for (const sd of [1, -1]) for (const side of [1, -1]) {
      const T = []; for (let t = 242; t <= 894; t += 16) T.push(t);
      const rings = T.map((t) => {
        const c = railS(t) * side, w0 = sd * (top - 0.15), w1 = sd * (top + 0.8);
        return [[c - 1.3, t, w0], [c + 1.3, t, w0], [c + 1.3, t, w1 - sd * 0.2], [c + 1.0, t, w1], [c - 1.0, t, w1], [c - 1.3, t, w1 - sd * 0.2]];
      });
      rails.push(loftRings(sd > 0 ? rings : rings.map((r) => r.slice().reverse()), { capA: true, capB: true, crease: 35 }));
      for (let t = 280; t <= 880; t += 75) {
        const c = railS(t) * side;
        rims.push(revW([[1.2, 0], [2.6, 0], [2.6, 0.9], [2.2, 1.35], [1.5, 1.35], [1.2, 0.9]], [c, t, sd * (top + 0.55)], sd, { seg: 10 }));
        dots.push(revW([[0, 0], [1.25, 0], [1.2, 0.8], [0, 0.95]], [c, t, sd * (top + 0.6)], sd, { seg: 10 }));
      }
      for (const t of [240, 896]) rims.push(stud(railS(t) * side, t, sd * (top - 0.1), sd, 2.0, 1.6, 10));
    }
    g.add(merge(rails), 'silver_aged');
    g.add(merge(rims), 'gold');
    g.add(merge(dots), 'glow_arc');
  }

  // ---- 北斗七星: gold bezels, cut crystal domes, glow cores (fx_starglow1..7: a ring of light round each crystal)
  {
    const bez = [], cry = [], wires = [];
    STARS.forEach(([s, t, k], i) => {
      const ro = 8.2 * k, ri = 4.6 * k;
      for (const sd of [1, -1]) {
        bez.push(PF(starPts(s, t, ro, ri, 8, Math.PI / 8 * (i === 0 ? 1 : i % 2)), { curveSeg: 1, w: 1.6, cw: sd * (FLAT + 0.55), bevel: 0.5, bevelSeg: 1, holes: [makeShape(starPts(s, t, 3.9 * k, 3.9 * k * 0.92, 8, 0), THREE.Path)] }));
        bez.push(revW([[3.9 * k, 0], [4.6 * k, 0], [4.6 * k, 1.9], [4.1 * k, 2.25], [3.9 * k, 2.25]], [s, t, sd * (FLAT + 0.3)], sd, { seg: 16 }));
        cry.push(cutDome([s, t], sd * (FLAT + 0.3), sd, 3.25 * k, 1.9 * k, 12));
        const glow = g.part('fx_starglow' + (i + 1), { pivot: [s, t, 0], extras: { order: i, star: i + 1 } });
        glow.add(revW([[0, 0], [3.85 * k, 0], [3.85 * k, 0.4], [0, 0.4]], [s, t, sd * (FLAT + 0.25)], sd, { seg: 16 }), 'glow_white');
      }
    });
    // constellation wires on the flat, arching over the channel frames (and the glass between them)
    for (const [a, b] of LINKS) {
      const [s0, t0, k0] = STARS[a], [s1, t1, k1] = STARS[b];
      const L = Math.hypot(s1 - s0, t1 - t0), ux = (s1 - s0) / L, uy = (t1 - t0) / L;
      const pa = [s0 + ux * 8.4 * k0, t0 + uy * 8.4 * k0], pb = [s1 - ux * 8.4 * k1, t1 - uy * 8.4 * k1];
      const N = 18, pts = [];
      for (let i = 0; i <= N; i++) {
        const u = i / N, s = pa[0] + (pb[0] - pa[0]) * u, t = pa[1] + (pb[1] - pa[1]) * u;
        const over = Math.abs(s) < cwOf(t) + 4.2 && cwOf(t) > 0;
        pts.push([s, t, FLAT + (over ? 1.25 : 0.45)]);
      }
      for (const sd of [1, -1]) wires.push(tubeAlong(pts.map(([s, t, w]) => [s, t, w * sd]), 0.5, { seg: 24, tension: 0.2 }));
    }
    g.add(merge([...bez, ...wires]), 'gold');
    g.add(merge(cry), 'crystal');
  }

  // ---- past the channel: a star-sigil cartouche (asterisms, not glyphs) in a silver frame with 如意 corners, then
  // the 北辰 pole star where the 鎬 ridge begins
  {
    const sil = [], gold = [], cry = [];
    const C0 = 911, C1 = 989, CW = 9.4;
    const frame = SUB(U(1.0, sdPoly([[-CW - 2.4, C0 - 2.4], [CW + 2.4, C0 - 2.4], [CW + 2.4, C1 + 2.4], [-CW - 2.4, C1 + 2.4]], 0.6),
      ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].flatMap(([a, b]) => [sdCircle([a * (CW + 2.6), b < 0 ? C0 - 2.6 : C1 + 2.6], 2.6), sdCircle([a * (CW + 0.2), b < 0 ? C0 - 5.0 : C1 + 5.0], 1.6)])),
    sdPoly([[-CW, C0], [CW, C0], [CW, C1], [-CW, C1]]));
    for (const s of shapes(frame, [-CW - 8, C0 - 10, CW + 8, C1 + 10], 0.3, 0.05)) sil.push(...both(sculpt(s, { w: 1.2, cw: FLAT + 0.35, bs: 0.35, bt: 0.3, seg: 1 })));
    const cellH = (C1 - C0) / 4;
    for (let i = 1; i < 4; i++) gold.push(...both(inlayLine([[-CW, C0 + i * cellH], [CW, C0 + i * cellH]], FLAT, 1, 0.55, -0.1, 0.45)));
    // four asterisms: 參 (belt + shoulders + feet), 心 (three in a bow), 箕 (winnowing basket), 斗 (the ladle)
    const SIG = [
      { st: [[-5.5, 6.2], [5.6, 6.6], [-1.8, 0.9], [0, 0.1], [1.8, -0.7], [-5.2, -6.4], [5.8, -6.6]], ln: [[0, 2], [1, 4], [2, 3], [3, 4], [2, 5], [4, 6]] },
      { st: [[-6, -1.5], [0, 2.4], [6, -1.2], [-2.6, -5.6]], ln: [[0, 1], [1, 2], [0, 3]] },
      { st: [[-5.2, 5], [5.4, 5.6], [4.0, -4.6], [-4.4, -4.0]], ln: [[0, 1], [1, 2], [2, 3], [3, 0]] },
      { st: [[-6.2, -5.4], [-2.0, -6.4], [3.0, -4.6], [5.4, -0.4], [2.4, 4.4], [-3.0, 5.6]], ln: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]] },
    ];
    SIG.forEach(({ st, ln }, i) => {
      const tc = C0 + (i + 0.5) * cellH;
      for (const [a, b] of ln) gold.push(...both(inlayLine([[st[a][0], tc + st[a][1]], [st[b][0], tc + st[b][1]]], FLAT, 1, 0.38, -0.1, 0.3)));
      st.forEach(([x, y], j) => gold.push(...both(stud(x, tc + y, FLAT + 0.1, 1, j === 0 ? 1.3 : 1.0, j === 0 ? 0.9 : 0.7, 10))));
    });
    // 北辰: a long four-point star bezel (tips along the blade) with a crystal, a gold collar ring
    const PS = 1030, star = [[0, 13], [2.4, 2.6], [8, 0], [2.4, -2.6], [0, -12], [-2.4, -2.6], [-8, 0], [-2.4, 2.6]].map(([x, y]) => [x, PS + y]);
    gold.push(...both(PF(star, { curveSeg: 1, w: 1.5, cw: FLAT + 0.45, bevel: 0.5, bevelSeg: 1, holes: [makeShape(arcPts(0, PS, 3.6, 0, 345, 23), THREE.Path)] })));
    gold.push(...both(revW([[3.6, 0], [4.3, 0], [4.3, 1.8], [3.9, 2.1], [3.6, 2.1]], [0, PS, FLAT + 0.2], 1, { seg: 20 })));
    cry.push(...both(cutDome([0, PS], FLAT + 0.3, 1, 3.2, 1.9, 14)));
    g.add(merge(sil), 'silver_aged');
    g.add(merge(gold), 'gold');
    g.add(merge(cry), 'crystal');
  }

  // ---- projected energy edge fx_edge (front and back edge, from the collar to the point): a fine line just off the
  // steel apex at rest (1.3 mm, fading in at the root and out at the point); clips grow it through fx_edge.scale
  {
    const edge = g.part('fx_edge', { pivot: [0, 92, 0], extras: { energy: true } });
    const T = []; for (let t = 100; t < TT - 4; t += 18) T.push(t);
    for (let i = 0; i <= 10; i++) T.push(TT - 60 + 60 * i / 10);
    const ringE = (t, side) => {
      const f = Math.max(0.12, smooth(100, 220, t) * (1 - 0.75 * smooth(TT - 90, TT, t))), hw = hwOf(Math.min(t, TT - 0.5));
      const a = hw + 0.35, b = a + 1.3 * f, hwid = 0.32 * f;
      return [[a * side, t, hwid], [b * side, t, hwid * 0.5], [b * side, t, -hwid * 0.5], [a * side, t, -hwid]];
    };
    for (const side of [1, -1]) {
      const rings = T.map((t) => ringE(t, side));
      edge.add(loftRings(side > 0 ? rings.map((r) => r.slice().reverse()) : rings, { capA: true, capB: true, crease: 60 }), 'glow_arc');
    }
    // fx_flare: the full projected blade (from the steel edge out to +18 mm at the root, +9 mm at the point), hidden
    // at rest (extras.restHidden: viewer / icons hide it too); charge stage 3 / guard / skills grow it out along the
    // blade from the collar (scale t 0 -> 1)
    const flare = g.part('fx_flare', { pivot: [0, 92, 0], extras: { energy: true, restHidden: true } });
    const ringF = (t, side) => {
      const u = Math.min(1, (t - 96) / 30), hw = hwOf(Math.min(t, TT - 0.5)), k = 1 - 0.5 * clamp01((t - 96) / (TT - 96)), a = hw + 0.6;
      const b = hw + 0.6 + (18 * k) * u * (t > TT - 50 ? Math.max(0.1, (TT - t) / 50) : 1), hwid = 0.45 * Math.max(0.3, u);
      return [[a * side, t, hwid], [b * side, t, hwid * 0.5], [b * side, t, -hwid * 0.5], [a * side, t, -hwid]];
    };
    for (const side of [1, -1]) {
      const rings = T.map((t) => ringF(t, side));
      flare.add(loftRings(side > 0 ? rings.map((r) => r.slice().reverse()) : rings, { capA: true, capB: true, crease: 60 }), 'glow_blue');
    }
  }

  // ======================================================================== blade root: collar, ricasso star charts
  {
    const col = [], gold = [];
    const WC = 64.6, DC = 9.4;
    col.push(PL([[-WC, -DC, 3.2], [WC, -DC, 3.2], [WC, DC, 3.2], [-WC, DC, 3.2]], { h: 34, ct: 70, bevel: 1.6, bevelSeg: 2 }));
    for (const ct of [55, 86]) col.push(PL([[-WC - 1.1, -DC - 1, 3.6], [WC + 1.1, -DC - 1, 3.6], [WC + 1.1, DC + 1, 3.6], [-WC - 1.1, DC + 1, 3.6]], { h: 4, ct, bevel: 1, bevelSeg: 1 }));
    // gold bead lines round the collar and a row of studs on the flats
    for (const t of [58.5, 82.5]) gold.push(tubeAlong([[-WC - 0.3, t, -DC - 0.3], [WC + 0.3, t, -DC - 0.3], [WC + 0.8, t, 0], [WC + 0.3, t, DC + 0.3], [-WC - 0.3, t, DC + 0.3], [-WC - 0.8, t, 0]], 0.75, { seg: 64, radial: 5, closed: true, tension: 0.1 }));
    for (let s = -56; s <= 56; s += 8) if (Math.abs(s) > 44 || Math.abs(s) < 14) gold.push(...both(stud(s, 70, DC, 1, 0.95, 0.7, 8)));
    // gold 祥雲 reliefs on the collar flats (sculpted plates)
    for (const f of [1, -1]) for (const s of shapes(cloudSDF(f * 29, 70, 0.95, -f), [f * 29 - 16, 58, f * 29 + 16, 82], 0.3, 0.05)) gold.push(...both(sculpt(s, { w: 1.2, cw: DC + 0.45, bs: 0.4, bt: 0.35, seg: 2 })));
    g.add(merge(col), 'silver_aged');
    g.add(merge(gold), 'gold');
  }
  {
    // star-chart plaques (t 98 -> 202) on both ricasso flats: silver frame, designed cloisonné (rings x star rays round
    // the pole, every cell its own enamel, gold wire on every border, a bead at every junction), the dipper in studs
    const P0 = 98, P1 = 202, PS = 35, PC = [0, 150];
    const sil = [], gold = [];
    const rr = (s0, t0, s1, t1, r) => [[s0, t0, r], [s1, t0, r], [s1, t1, r], [s0, t1, r]];
    const clip = [[-PS + 0.4, P0 + 0.4], [PS - 0.4, P0 + 0.4], [PS - 0.4, P1 - 0.4], [-PS + 0.4, P1 - 0.4]];
    const cells = polarCells(PC, [0, 6, 13, 22, 33, 80], [{ n: 1 }, { n: 8, a0: 22.5 }, { n: 16 }, { n: 16, a0: 7.5 }, { n: 8, a0: 22.5 }], clip,
      (i, j) => [[4], [j % 2 ? 2 : 0], [j % 2 ? 0 : 1], [j % 4 === 1 ? 3 : j % 2 ? 0 : 1], [1]][i][0]);
    let byMat = {};
    for (const sd of [1, -1]) {
      sil.push(PF(rr(-PS - 2.4, P0 - 2.4, PS + 2.4, P1 + 2.4, 6), { w: 1.6, cw: sd * (RIC + 0.45), bevel: 0.5, bevelSeg: 1, holes: [makeShape(rr(-PS + 0.2, P0 + 0.2, PS - 0.2, P1 - 0.2, 4), THREE.Path)] }));
      byMat = joinAll(byMat, cloisonne(cells, clip, sd * RIC, sd, EN, { wd: 0.5 }));
      const dip = [[-14, 182], [-6, 186], [-4, 177], [-11, 173], [2, 170], [9, 166], [17, 168]];
      dip.forEach(([s, t], i) => gold.push(stud(s, t, sd * (RIC + 0.6), sd, i ? 1.25 : 1.5, 0.9, 10)));
      for (const [s, t] of [[-PS + 4, P0 + 4], [PS - 4, P0 + 4], [-PS + 4, P1 - 4], [PS - 4, P1 - 4]]) gold.push(stud(s, t, sd * (RIC + 1.2), sd, 1.5, 1.1, 10));
      // the ricasso ends in a crisp shoulder: a gold line across the flat just below it
      gold.push(inlayLine([[-57, TR - 6], [57, TR - 6]], sd * RIC, sd, 0.8, -0.15, 0.3));
    }
    g.add(merge(sil), 'silver_aged');
    g.add(merge(gold), 'gold');
    addAll(g, byMat);
  }

  // ======================================================================== guard
  const PIV = [54, 18];                          // hinge pins of the cloud heads (right; the left mirrors)
  {
    const sil = [], gold = [];
    // block: a broad outline with knuckle bosses round both hinge pins, a slot through each boss for the arm's tongue
    const core = [[-42, -11], [42, -11], [50, 8], [52, 30], [57, 49], [48, 54], [22, 55], [0, 60], [-22, 55], [-48, 54], [-57, 49], [-52, 30], [-50, 8]];
    const blockSDF = U(4, sdPoly(core, 3), sdCircle(PIV, 14), sdCircle([-PIV[0], PIV[1]], 14));
    let block = merge(sculptAll(blockSDF, [-75, -20, 75, 70], { w: 44, bs: 2.5, bt: 2.5, seg: 3, crease: 40 }, 0.4));
    block = cut(block, [cutters.box([61, 18, 0], [34, 30, 9.8]), cutters.box([-61, 18, 0], [34, 30, 9.8])]);
    sil.push(block);
    // face panel: a gold rim, star-ray cloisonné wings radiating from the gem, two screws
    const panel = [[-38, -6], [38, -6], [45, 8], [47, 30], [51, 46], [45, 50], [21, 51.5], [0, 56], [-21, 51.5], [-45, 50], [-51, 46], [-47, 30], [-45, 8]];
    const wingR = [[19, -3], [37, -3], [43, 9], [44.5, 30], [45.2, 44], [40, 47.5], [19, 48.5]];
    const wingCells = polarCells([0, 22], [20.5, 27, 34, 70], [{ n: 24 }, { n: 24, a0: 7.5 }, { n: 12 }], wingR,
      (i, j) => (i === 0 ? (j % 2 ? 2 : 0) : i === 1 ? (j % 2 ? 0 : 1) : (j % 3 === 1 ? 3 : 1)));
    const wingCellsL = wingCells.map((c) => ({ ...c, poly: c.poly.map(([s, t]) => [-s, t]) }));
    let byMat = {};
    for (const sd of [1, -1]) {
      gold.push(inlayRing(panel, sd * 22, sd, 1.3, -0.2, 0.55));
      byMat = joinAll(byMat, cloisonne(wingCells, wingR, sd * 22, sd, EN, { wd: 0.5, border: true }), cloisonne(wingCellsL, wingR.map(([s, t]) => [-s, t]), sd * 22, sd, EN, { wd: 0.5, border: true }));
      for (const t of [-1.5, 50.5]) sil.push(revW([[0, 0], [1.7, 0], [1.6, 0.6], [1.0, 1.0], [0, 1.1]], [0, t, sd * 22], sd, { seg: 12 }));
      // gem setting: gallery bezel (cup + bead row), six prongs clasping the girdle
      gold.push(revW([[13.2, 0], [17.4, 0], [17.6, 1.4], [16.8, 2.2], [14.6, 2.2], [13.6, 1.6]], [0, 22, sd * 21.8], sd, { seg: 48 }));
      gold.push(beadRingW([0, 22], sd * 21.9, sd, 18.6, 0.75, 30));
      for (let i = 0; i < 6; i++) {
        const a = (i + 0.5) / 6 * TAU, cs = Math.cos(a), sn = Math.sin(a), P = (r, d) => [cs * r, 22 + sn * r, sd * (21.8 + d)];
        gold.push(taper([P(15.8, 1.6), P(15.0, 3.2), P(13.6, 4.1), P(12.6, 4.3)], 1.15, 0.55, { seg: 8, radial: 6 }));
        gold.push(sphere(P(12.5, 4.35), 0.62, { seg: 6 }));
      }
    }
    // hinge pins: domed heads with a bead ring on both faces (the pin itself runs through the knuckles)
    for (const f of [1, -1]) {
      sil.push(revW([[0, -22], [3, -22], [3, 22], [0, 22]], [f * PIV[0], PIV[1], 0], 1, { seg: 16 }));
      for (const sd of [1, -1]) {
        gold.push(revW([[0, 0], [5.2, 0], [5.1, 0.9], [4.2, 1.8], [2.4, 2.4], [0, 2.6]], [f * PIV[0], PIV[1], sd * 21.9], sd, { seg: 24 }));
      }
    }
    // under the block: a mortise plate with four screws round the grip entry, then a stepped washer stack
    sil.push(PL([[-30, -17, 4], [30, -17, 4], [30, 17, 4], [-30, 17, 4]], { h: 1.8, ct: -14.7, bevel: 0.6, bevelSeg: 1 }));
    for (const [s, w] of [[24, 11.5], [-24, 11.5], [24, -11.5], [-24, -11.5]]) gold.push(revT([[0, -15.6], [1.7, -15.6], [1.6, -16.2], [1.0, -16.8], [0, -16.9]], { seg: 10, s, w, what: 'screw' }));
    gold.push(revT([[0, -15.5], [24, -15.5], [24.6, -16.1], [24.6, -16.6], [24, -17.1], [0, -17.1]], { seg: 48, kw: 0.84, what: 'washer1' }));
    gold.push(beadRing(-16.35, 24.9, 0.6, 30, 1, 0.84));
    sil.push(revT([[0, -17.0], [22.2, -17.0], [22.6, -17.4], [22.6, -18.7], [22.2, -19.1], [0, -19.1]], { seg: 48, kw: 0.84, what: 'washer2' }));
    gold.push(revT([[0, -19.0], [20.8, -19.0], [21.1, -19.4], [21.1, -20.1], [20.8, -20.5], [0, -20.5]], { seg: 48, kw: 0.84, what: 'washer3' }));
    g.add(merge(sil), 'silver_aged');
    g.add(merge(gold), 'gold');
    addAll(g, byMat);

    // the hero gem 天樞: one stone through the block, a brilliant crown proud of each face: girdle band, upper girdle,
    // bezel and star facets (alternate rows turned half a facet, alternate points pulled in: kites and triangles at
    // 32-fold), a flat table
    const gem = g.part('fx_gem', { pivot: [0, 22, 0], extras: { hero: true, pv: { gem: 3.2, coreTint: '#4f80ff', irid: 0.5 } } });   // the focal point: a strong blue core, facet fire
    const crown = (() => {
      const n = 32, rows = [[13.4, 0, 0], [13.4, 0.9, 0], [11.7, 2.4, 0.5, 11.0], [8.6, 3.9, 0, 7.8], [6.7, 4.6, 0.5]];
      const rings = rows.map(([r, h, ph, r2]) => Array.from({ length: n }, (_, j) => {
        const a = (j + ph) / n * TAU, rr = r2 && j % 2 ? r2 : r;
        return [Math.cos(a) * rr, 22 + Math.sin(a) * rr, 22.2 + h];
      }));
      const base = V(0, 22, 22.2);
      return faceOut(loftRings(rings, { capB: true, crease: 4 }), (p) => p.clone().sub(base), 4);
    })();
    // its own material key (glass, retinted sapphire in defs.js): the shared crystal of the seven stars read as a
    // frosted white disc on the focal point
    gem.add(merge([crown, mirW(crown), revW([[0, -22.3], [13.4, -22.3], [13.4, 22.3], [0, 22.3]], [0, 22, 0], 1, { seg: 48, what: 'gem body' })]), 'glass');

    // cloud-head arms (fx_guardR at +s, fx_guardL at -s) on the hinge pins: open 18° about w (the heads rise towards
    // the blade). Sculpted 如意 head (three lobes + core, smooth fillets, a pierced curl in each lobe) on a rising stem,
    // 17 mm thick at the root tapering to 7 at the head; a spine rib, gold rim, lobe scrolls, rivets, a cloisonné
    // medallion; the tongue rides in the block's slot round the pin
    const HC = [146, 47], L1 = [137.2, 63.9], L2 = [159.8, 58.3], L3 = [161, 38.3];
    const P1 = [135.5, 65.3], P2 = [161.8, 60], P3 = [162.8, 37.5];
    const stem = [[62, 17], [86, 22.4], [108, 29.6], [128, 38.5]], stemR = [12.5, 11.6, 10.6, 10.0];
    const armUnion = U(3.2,
      ...stem.slice(1).map((p, i) => sdCapsule(stem[i], p, stemR[i], stemR[i + 1])),
      sdCircle(HC, 16.5), sdCircle(L1, 14.6), sdCircle(L2, 12.8), sdCircle(L3, 11));
    const armSDF = SUB(armUnion,
    sdCircle(PIV, 14.6), sdCircle(P1, 3.6), U(0.6, sdCircle(P2, 2.9), sdCapsule(P2, [P2[0] + 3.2, P2[1] - 3.0], 1.8, 1.4)), sdCircle(P3, 2.4));
    const HW = 8.0, BS = 1.8, BT = 2.0;
    const kOf = (s) => lerp(1, 0.72, smooth(66, 172, s));   // 16 -> 11.5 mm: thinner read as bent rods in first person
    const armShape = shapes(armSDF, [55, 2, 184, 86], 0.3, 0.07).sort((a, b) => loopArea(b.outer) - loopArea(a.outer))[0];
    const armGeo = sculpt(armShape, { w: 2 * HW, bs: BS, bt: BT, seg: 2, crease: 45 });
    const deco = { gold: [], silver_aged: [] };
    const rib = (() => {
      const path = [[66, 18.2], [78, 20.6], [92, 24.4], [106, 29], [118, 33.6], [130, 39.4]], rings = [];
      path.forEach((p, i) => {
        const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
        const nx = -dy / l, ny = dx / l, u = i / (path.length - 1), hw = lerp(2.4, 0.7, u), hh = lerp(1.1, 0.35, u) * (i === path.length - 1 ? 0.2 : 1);
        rings.push([[-1, -0.25], [-0.55, 0.72], [0, 1], [0.55, 0.72], [1, -0.25]].map(([x, y]) => [p[0] + nx * x * hw, p[1] + ny * x * hw, HW + y * hh]));
      });
      return faceOut(loftRings(rings, { capA: true, capB: true, crease: 50 }), () => new THREE.Vector3(1, 0, 0), 50);
    })();
    deco.silver_aged.push(rib);
    // (the rim follows the silhouette only: an inset of the pierced field opened the thin side of a lobe and filled the hole)
    deco.gold.push(...insetRing(SUB(armUnion, sdCircle(PIV, 17.5)), [55, 2, 184, 86], BS + 1.0, 1.3, HW, 1, -0.1, 0.75, 0.35));   // gold piping
    for (const [c, r0, r1, a0] of [[P1, 5.6, 8.2, 200], [P2, 4.8, 7.0, 120], [P3, 4.3, 6.1, 290]]) deco.gold.push(inlayLine(spiral(c[0], c[1], r1 + 0.6, r0, a0, a0 - 320, 34), HW, 1, 1.05, -0.1, 0.75));   // scroll curls
    for (const [s, t] of [[80, 16.0], [100, 22.0], [118, 27.8]]) deco.gold.push(stud(s, t, HW, 1, 1.3, 0.9, 10));
    const sq = [[HC[0] - 9.5, HC[1] - 9.5], [HC[0] + 9.5, HC[1] - 9.5], [HC[0] + 9.5, HC[1] + 9.5], [HC[0] - 9.5, HC[1] + 9.5]];
    const med = polarCells(HC, [0, 2.75, 7.5], [{ n: 1 }, { n: 8 }], sq, (i, j) => (i ? (j % 2 ? 1 : 0) : 2));
    const medM = cloisonne(med, sq, HW, 1, EN, { wd: 0.45, border: true, beads: false });
    const decoAll = joinAll(deco, medM);
    // taper: both faces move in by HW (1 - k(s)) (the rounded edges and the inlays keep their own height)
    const taperArm = (geo) => {
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), s = -p.getZ(i); p.setX(i, x - Math.sign(x) * HW * (1 - kOf(s))); }
      return fin(geo, 45);
    };
    const tongue = sculpt(shapes(U(2, sdCircle(PIV, 11), sdCapsule(PIV, [PIV[0] + 17, PIV[1] + 1], 7.5, 8.5)), [38, 0, 76, 36], 0.3)[0], { w: 9.0, bs: 0.8, bt: 0.8, seg: 2 });
    for (const f of [1, -1]) {
      const arm = g.part(f > 0 ? 'fx_guardR' : 'fx_guardL', { pivot: [f * PIV[0], PIV[1], 0], extras: { open: f > 0 ? 18 : -18, hinge: 'w', order: f > 0 ? 0 : 1 } });
      const side = (geo) => (f > 0 ? geo : mirS(geo));
      arm.add(side(merge([taperArm(armGeo.clone()), tongue])), 'silver_aged');
      for (const [m, list] of Object.entries(decoAll)) {
        const one = merge(list), two = taperArm(merge([one, mirW(one)]));
        arm.add(side(two), m);
      }
    }
  }

  // ======================================================================== grip
  const KS = 1, KW = 0.84, GR = 17.4;     // oval: 34.8 (s) x 29.2 (w)
  const GT0 = -47, GT1 = -266, TURNS = 8, WA = 0.6;   // wrap from under the top ferrule to the bottom one; WA steepens the tapes across the faces
  {
    // core: ray skin (鮫皮; stipple pebbling in the material) with a slight swell
    g.add(revT([[0, -296], [16.2, -296], [16.8, -272], [GR, -200], [GR + 0.3, -150], [GR, -95], [16.8, -44], [16.2, -21], [0, -21]], { seg: 32, ks: KS, kw: KW, what: 'grip core' }), 'leather_pebble');
    // the large 親粒 nodule of every diamond window (front and back faces) in a ring of smaller ones
    const nod = [];
    const domeAt = (ph, t, r, h, seg = 6) => {
      const prof = r > 1.5 ? [[0, 0], [r, 0], [r * 0.82, h * 0.55], [r * 0.45, h * 0.92], [0, h]] : [[0, 0], [r, 0], [r * 0.6, h * 0.8], [0, h]];
      const g0 = new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), seg);
      g0.rotateZ(-Math.PI / 2);                           // axis -> +x (w, radial at ph = 0)
      const R = GR + 0.1 - 0.35;
      g0.translate(R, 0, 0);
      g0.rotateY(ph);                                     // round the grip axis
      const p = g0.attributes.position;
      for (let i = 0; i < p.count; i++) { p.setX(i, p.getX(i) * KW); p.setZ(i, p.getZ(i) * KS); }
      g0.translate(0, t, 0);
      return fin(g0, 70);
    };
    const tOf = (u) => { const th = u * TURNS * TAU; return GT0 + (GT1 - GT0) * (th + WA / 2 * Math.sin(2 * th)) / (TURNS * TAU); };
    for (let m = 0; m < TURNS; m++) for (const [u, ph] of [[(m + 0.5) / TURNS, 0], [m / TURNS, Math.PI]]) {
      const t = tOf(u);
      if (u === 0 || (t < -140 && t > -165)) continue;
      nod.push(domeAt(ph, t, 2.3, 1.1, 10));
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + m; nod.push(domeAt(ph + Math.cos(a) * 3.3 / GR, t + Math.sin(a) * 3.3, 0.6 + 0.25 * ((k * 7) % 3) / 2, 0.55, 5)); }
    }
    g.add(merge(nod), 'leather_pebble');
    // 柄卷: two helical flat tapes (0.9 mm, crowned, crisp edges); at every crossing one goes over (lifted), the other
    // dips under, the upper one folds (narrows and rolls); a tie-off knot under each ferrule where both tapes meet
    const band = (dir) => {
      const N = 216, rings = [], sig = 0.014;
      for (let i = 0; i <= N; i++) {
        const u = i / N, t = tOf(u), ph = dir * u * TURNS * TAU;
        let lift = 0, fold = 0, roll = 0;
        for (let k = 0; k <= 2 * TURNS; k++) {
          const du = u - k / (2 * TURNS), b = Math.exp(-((du / sig) ** 2)), over = (k % 2 === 0) === (dir > 0);
          lift += (over ? 0.72 : -0.33) * b;
          if (over) { fold += b; roll += Math.sign(du) * b * 0.22; }
        }
        const r = GR + 0.15 + lift;
        const c = [Math.sin(ph) * r * KS, t, Math.cos(ph) * r * KW];
        const nr = [Math.sin(ph) * KW, 0, Math.cos(ph) * KS]; const nl = Math.hypot(...nr); nr[0] /= nl; nr[2] /= nl;
        const tan = [Math.cos(ph) * r * KS * dir * TURNS * TAU, (GT1 - GT0) * (1 + WA * Math.cos(2 * u * TURNS * TAU)), -Math.sin(ph) * r * KW * dir * TURNS * TAU];
        const tl = Math.hypot(...tan); tan[0] /= tl; tan[1] /= tl; tan[2] /= tl;
        let bn = [nr[1] * tan[2] - nr[2] * tan[1], nr[2] * tan[0] - nr[0] * tan[2], nr[0] * tan[1] - nr[1] * tan[0]];
        // roll about the tape's own axis (the fold), then the section
        const cr = Math.cos(roll), sr = Math.sin(roll);
        const nR = [nr[0] * cr + bn[0] * sr, nr[1] * cr + bn[1] * sr, nr[2] * cr + bn[2] * sr];
        bn = [bn[0] * cr - nr[0] * sr, bn[1] * cr - nr[1] * sr, bn[2] * cr - nr[2] * sr];
        const wdt = 1 - 0.2 * Math.min(1, fold);
        const prof = [[-5.2, -0.15], [-5.2, 0.62], [-4.85, 0.9], [-1.8, 1.02], [1.8, 1.02], [4.85, 0.9], [5.2, 0.62], [5.2, -0.15]];
        rings.push(prof.map(([x, y]) => [c[0] + bn[0] * x * wdt + nR[0] * y, c[1] + bn[1] * x * wdt + nR[1] * y, c[2] + bn[2] * x * wdt + nR[2] * y]));
      }
      return faceOut(loftRings(rings, { capA: true, capB: true, crease: 50 }), (p) => new THREE.Vector3(p.x, 0, p.z), 50);
    };
    const knot = (t, up) => {
      // a flattened overhand knot: a lobed torus lying on the front face, a tucked tail
      const tor = new THREE.TorusGeometry(2.6, 1.05, 6, 16);
      const p = tor.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * 0.75);
      tor.rotateY(Math.PI / 2);                           // lies flat on the front face (axis = +w)
      tor.translate(GR * KW + 0.9, t, 0);
      return [fin(tor, 60), tubeAlong([[0, t + up * 1.5, GR * KW + 1.2], [0.6, t + up * 3.2, GR * KW + 0.9], [0.3, t + up * 4.8, GR * KW + 0.5]], 1.0, { seg: 6 })];
    };
    g.add(merge([band(1), band(-1), ...knot(GT0 + 1.0, 1), ...knot(GT1 - 1.2, -1)]), 'leather_black');
    // ferrules (gold) with raised 回紋 bands and bead rings, and the mid-collar between the hands
    const fer = [], fs = [];
    fer.push(revT([[0, -20.4], [19.6, -20.4], [20.6, -23], [20.6, -27.5], [19.4, -29], [19.4, -38], [18.4, -42], [16.6, -44], [0, -44]], { seg: 48, ks: KS, kw: KW, what: 'top ferrule' }));
    fer.push(revT([[0, -268], [16.6, -268], [18.6, -271], [19.6, -276], [19.6, -287], [21.4, -290], [21.4, -295], [20, -298], [0, -298]], { seg: 48, ks: KS, kw: KW, what: 'bottom ferrule' }));
    fer.push(revT([[0, -146], [GR + 0.3, -146], [GR + 2.0, -148], [GR + 2.4, -152.5], [GR + 2.0, -157], [GR + 0.3, -159], [0, -159]], { seg: 48, ks: KS, kw: KW, what: 'mid collar' }));
    for (const [t, r] of [[-25.2, 20.9], [-292.5, 21.7], [-149.5, GR + 2.5], [-155.5, GR + 2.5]]) fs.push(beadRing(t, r, 0.8, 28, KS, KW));
    // 回紋: a hooked square wave run once round the ferrule, raised 0.45 mm (gold on gold reads by its relief)
    const meander = (R, tc) => {
      const units = 18, circ = TAU * R, Pm = circ / units, Hm = 4.6, pts = [];
      for (let k = 0; k < units; k++) { const x = k * Pm; pts.push([x, -Hm / 2], [x, Hm / 2], [x + 0.58 * Pm, Hm / 2], [x + 0.58 * Pm, -Hm / 2 + 1.55], [x + 0.27 * Pm, -Hm / 2 + 1.55], [x + 0.27 * Pm, -Hm / 2]); }
      pts.push([circ, -Hm / 2]);
      const flat = slab(strokePoly(pts, 0.62), 0, 1, -0.2, 0.45, [], { crease: 60 });   // (x, y, z) = (s, t, w)
      const p = flat.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = -p.getZ(i), y = p.getY(i), z = p.getX(i), a = x / R, rr = R + z;
        p.setXYZ(i, Math.cos(a) * rr * KW, tc + y, -Math.sin(a) * rr * KS);
      }
      // the wrap round the oval may turn the triangles: keep the tops facing out
      const g2 = fin(flat, 60), n = g2.attributes.normal, q = g2.attributes.position;
      let dot = 0; for (let i = 0; i < n.count; i++) dot += n.getX(i) * q.getX(i) + n.getZ(i) * q.getZ(i);
      return dot < 0 ? fin(flip(g2), 60) : g2;
    };
    fs.push(meander(19.4, -33.5), meander(19.6, -281.5));
    // cloud tabs on the top ferrule's lip (4 sides)
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      fs.push(xform(sphere([0, 0, 0], 2.2, { seg: 10, scale: [1, 1.4, 0.55] }), { rot: [0, a / D2R, 0], move: [Math.cos(a) * 20.9 * KS, -25.2, Math.sin(a) * 20.9 * KW] }));
    }
    g.add(merge(fer), 'gold');
    g.add(merge(fs), 'gold');
  }

  // ======================================================================== pommel (inverted 斗) + dial + tassel
  {
    const sil = [], gold = [], leaf = [];
    sil.push(revT([[0, -298], [22, -298], [24, -300], [24, -304.6], [22.6, -306.4], [0, -306.4]], { seg: 48, ks: KS, kw: KW * 1.05, what: 'pommel cap' }));
    // octagonal frustum: wide at the top (斗), bevelled corners
    const FR = [[0, -318], [25, -318], [27.2, -320], [27.2, -324], [21.6, -350], [19.6, -353], [13, -360], [8, -363], [0, -364]];
    g.add(revT(FR, { seg: 8, phase: Math.PI / 8, ks: 1, kw: 0.86, crease: 30, what: 'frustum' }), 'steel_blued');
    // every face: a raised silver frame (the panel inside reads recessed) with a gold cloud relief; gold-leaf ridges
    // on the eight slanted corners
    const corner = (ph, r, t) => new THREE.Vector3(0.86 * r * Math.sin(ph), t, r * Math.cos(ph));   // three space (x = w, z = -s)
    for (let i = 0; i < 8; i++) {
      const a0 = Math.PI / 8 + i * Math.PI / 4, a1 = a0 + Math.PI / 4;
      const TL = corner(a0, 27.2, -324), TR = corner(a1, 27.2, -324), BL = corner(a0, 21.6, -350), BR = corner(a1, 21.6, -350);
      const O = TL.clone().add(TR).add(BL).add(BR).multiplyScalar(0.25);
      const up = TL.clone().add(TR).sub(BL).sub(BR).normalize();
      let nrm = TR.clone().sub(TL).cross(up).normalize();
      if (nrm.dot(new THREE.Vector3(O.x, 0, O.z)) < 0) nrm.negate();
      const right = up.clone().cross(nrm).normalize();
      const loc = (P) => { const d = P.clone().sub(O); return [d.dot(right), d.dot(up)]; };
      const quad = [loc(TL), loc(TR), loc(BR), loc(BL)];
      const fq = loopArea(quad) > 0 ? quad : quad.slice().reverse();
      const frame = slab(offsetPoly(fq, -0.5), 0, 1, -0.3, 0.75, [offsetPoly(fq, -2.3)], { crease: 35 });
      const cloud = shapes(cloudSDF(0, -0.5, 0.52, i % 2 ? 1 : -1), [-9, -8, 9, 7], 0.25, 0.04).map((s) => sculpt(s, { w: 1.1, cw: 0.35, bs: 0.35, bt: 0.3, seg: 1 }));
      sil.push(onFrame(frame, O, right, up, nrm));
      for (const c of cloud) gold.push(onFrame(c, O, right, up, nrm));
      // the corner ridge along the slanted edge at a0
      const e0 = corner(a0, 27.5, -323.4), e1 = corner(a0, 21.9, -350.2);
      leaf.push(taper([[-e0.z, e0.y, e0.x], [-(e0.z + e1.z) / 2, (e0.y + e1.y) / 2, (e0.x + e1.x) / 2], [-e1.z, e1.y, e1.x]], 0.95, 0.7, { seg: 6, radial: 6 }));
    }
    // knob + tassel loop
    sil.push(revT([[0, -362], [7, -362], [8, -364], [8, -368], [6, -371], [0, -371]], { seg: 24, what: 'knob' }));
    gold.push(beadRing(-366, 8.4, 0.6, 18));
    sil.push(fin(new THREE.TorusGeometry(5.2, 1.5, 8, 18).rotateY(Math.PI / 2).translate(0, -377, 0), 60));
    g.add(merge(sil), 'silver_aged');
    g.add(merge(gold), 'gold');
    g.add(merge(leaf), 'gold_leaf');

    // 二十八宿 dial: a silver ring with 28 gold-inlaid tick grooves (every 7th long) and four star studs; turns 24°/s about t
    const dial = g.part('fx_dial', { pivot: [0, -312, 0], extras: { spin: 't', rate: 24 } });
    const DK = 0.9, DR = 26.2;
    dial.add(revT([[21.8, -306.8], [25.4, -306.8], [DR, -308], [DR - 0.6, -308.3], [DR - 0.6, -315.7], [DR, -316], [25.4, -317.6], [21.8, -317.6], [21.8, -306.8]], { seg: 56, ks: 1, kw: DK, what: 'dial ring' }), 'silver_aged');
    {
      // the outer band as a grid round the ring: a V groove at every tick (long ones reach further), crisp ends
      const del = 0.62 / DR, A = [], isFloor = [];
      for (let k = 0; k < 28; k++) {
        const th = k / 28 * TAU;
        for (const [d, fl] of [[-1, 0], [-0.55, 1], [0.55, 1], [1, 0], [2.6, 0], [4.2, 0]]) { A.push(th + d * del * (d > 1.5 ? 2.2 : 1)); isFloor.push(fl ? k : -1); }
      }
      const rows = [-308, -308.7, -309.5, -314.5, -315.3, -316];
      const inGroove = (k, t) => (k % 7 === 0 ? t <= -308.7 && t >= -315.3 : t <= -309.5 && t >= -314.5);
      const rings = rows.map((t) => A.map((a, i) => { const r = isFloor[i] >= 0 && inGroove(isFloor[i], t) ? DR - 0.5 : DR; return [-r * Math.cos(a), t, DK * r * Math.sin(a)]; }));
      let band = loftRings(rings, { crease: 40 });
      const n = band.attributes.normal, q = band.attributes.position;
      let dot = 0; for (let i = 0; i < n.count; i++) dot += n.getX(i) * q.getX(i) + n.getZ(i) * q.getZ(i);
      if (dot < 0) band = fin(flip(band), 40);
      dial.add(band, 'silver_aged');
      // gold in the grooves (0.2 below the band) and the four cardinal star studs
      const inl = [];
      for (let k = 0; k < 28; k++) {
        const th = k / 28 * TAU, long = k % 7 === 0;
        if (long) {
          const st = slab(starPts(0, 0, 2.7, 0.95, 4, 0), 0, 1, -0.4, 0.75, [], { crease: 30 });
          st.translate(DR - 0.1, -312, 0);
          st.rotateY(th - Math.PI / 2);
          const p = st.attributes.position; for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * DK);
          inl.push(fin(st, 30));
        } else {
          const b = new THREE.BoxGeometry(0.4, 4.8, 0.62);
          b.translate(DR - 0.32, -312, 0);
          b.rotateY(th - Math.PI / 2);
          const p = b.attributes.position; for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * DK);
          inl.push(fin(b, 30));
        }
      }
      dial.add(merge(inl), 'gold');
    }

    // tassel: cord, a 盤長結 knot, gold caps, a carved and drilled jade melon bead, gold-thread binding, 48 strands in
    // eight clumps (pendulum about the loop)
    const ts = g.part('fx_tassel', { pivot: [0, -378, 0], extras: { swing: 'pendulum', len: 0.07 } });
    const cord = [];
    cord.push(tubeAlong([[0, -380, 0], [0.5, -385, 0.2], [0, -389.5, 0]], 1.3, { seg: 8, radial: 8 }), tubeAlong([[0, -380, 0.6], [-0.5, -385, 0.4], [0, -389.5, 0.5]], 1.2, { seg: 8, radial: 8 }));
    {
      // 盤長結: two serpentines of four strands at ±45° woven over / under, U-turns at the ends, ears at the corners
      const KC = [0, -402.5], sp = 3.0, Lk = 6.2, o = [-1.5, -0.5, 0.5, 1.5].map((x) => x * sp);
      const d1 = [Math.SQRT1_2, Math.SQRT1_2], d2 = [Math.SQRT1_2, -Math.SQRT1_2];
      const lift = (i, j) => ((i + j) % 2 ? -0.62 : 0.62);
      const fam = (D, N, sgn, startEnd) => {
        const P = [];
        for (let i = 0; i < 4; i++) {
          const dirn = (i % 2 === 0 ? 1 : -1) * startEnd;
          for (let k = 0; k <= 12; k++) {
            const lam = -dirn * Lk + dirn * 2 * Lk * k / 12;
            let w = 0; for (let j = 0; j < 4; j++) w += sgn * lift(i, j) * Math.exp(-(((lam - o[j]) / 0.9) ** 2));
            P.push([KC[0] + o[i] * N[0] + lam * D[0], KC[1] + o[i] * N[1] + lam * D[1], w]);
          }
          if (i < 3) {   // U-turn to the next strand
            const endLam = dirn * Lk, c = [KC[0] + (o[i] + sp / 2) * N[0] + endLam * D[0], KC[1] + (o[i] + sp / 2) * N[1] + endLam * D[1]];
            for (let k = 1; k < 6; k++) { const a = Math.PI * k / 6; const x = -Math.cos(a) * sp / 2, y = Math.sin(a) * sp / 2 * dirn; P.push([c[0] + x * N[0] + y * D[0], c[1] + x * N[1] + y * D[1], 0]); }
          }
        }
        return P;
      };
      const A = fam(d1, d2, 1, -1), B = fam(d2, d1, -1, 1);
      // A enters at the top and leaves at the right corner, B enters at the left corner and leaves at the top: the
      // cord comes down into A, loops out round the right ear, under the knot (the tail hangs from here) and the left
      // ear into B, and back up
      const y0 = KC[1];
      const path = [[0, -389, 0], [0.8, -392.6, 0], ...A, [10, y0 + 3, 0], [12.2, y0, 0], [10, y0 - 2.6, 0], [6.2, y0 - 7.4, 0], [0, y0 - 12, 0],
        [-6.2, y0 - 7.4, 0], [-10, y0 - 2.6, 0], [-12.2, y0, 0], [-10, y0 + 3, 0], ...B, [-0.8, -392.6, 0], [0, -389, 0.4]];
      cord.push(tubeAlong(path, 0.85, { seg: 220, radial: 5, tension: 0.35 }));
      cord.push(tubeAlong([[0, y0 - 12, 0], [0.3, y0 - 13.2, 0.1], [0, -417, 0]], 1.3, { seg: 6, radial: 8 }));
      // the cord runs on through the bead's bore to the bottom cap
      cord.push(tubeAlong([[0, -417, 0], [0, -432, 0], [0, -447, 0]], 1.35, { seg: 6, radial: 8 }));
    }
    ts.add(merge(cord), 'silk_violet');
    ts.add(merge([revT([[0, -416.5], [3.0, -416.5], [4.6, -419], [4.6, -422], [2.6, -424], [0, -424]], { seg: 20, what: 'tassel cap top' }),
      beadRing(-420.5, 4.8, 0.5, 14),
      revT([[0, -440.5], [2.6, -440.5], [5.2, -443.5], [6.4, -447.5], [6.2, -451], [0, -451]], { seg: 20, what: 'tassel cap bottom' }),
      tubeAlong(Array.from({ length: 121 }, (_, i) => { const a = i / 120 * TAU * 6; return [Math.cos(a) * 5.4, -452.2 - i / 120 * 5.2, Math.sin(a) * 5.4]; }), 0.34, { seg: 240 })]), 'gold');
    {
      // carved melon bead: eight lobes, a waist groove, drilled through (chamfered openings; the cord shows in the bore)
      const R = 8.4, rb = 1.85, tc = -432.3, n = 40, rings = [];
      const ph0 = Math.asin((rb + 0.5) / R);
      const lobe = (th) => 1 - 0.07 * (0.5 - 0.5 * Math.cos(8 * th));
      for (let i = 0; i <= 22; i++) {
        const ph = lerp(ph0, Math.PI - ph0, i / 22);
        const groove = 1 - 0.06 * Math.exp(-(((ph - Math.PI / 2) / 0.09) ** 2));
        rings.push(Array.from({ length: n }, (_, j) => { const th = j / n * TAU, r = R * Math.sin(ph) * lobe(th) * groove; return [Math.cos(th) * r, tc + R * Math.cos(ph) * 0.95, Math.sin(th) * r]; }));
      }
      const bore = (t) => Array.from({ length: n }, (_, j) => { const th = j / n * TAU; return [Math.cos(th) * rb, t, Math.sin(th) * rb]; });
      const top = tc + R * Math.cos(ph0) * 0.95 - 0.4, bot = tc - R * Math.cos(ph0) * 0.95 + 0.4;
      rings.push(bore(bot), bore(top), rings[0]);
      let bead = loftRings(rings, { crease: 50 });
      if (volume(bead) < 0) bead = fin(flip(bead), 50);
      ts.add(bead, 'jade');
    }
    const strands = [];
    for (let c = 0; c < 8; c++) for (let k = 0; k < 6; k++) {
      const a = c / 8 * TAU + (k - 2.5) * 0.07, r0 = 3.6 + (k % 3) * 0.5, r1 = 6.5 + (k % 3) * 1.4 + (c % 2) * 0.8, L = 88 + ((c * 5 + k * 3) % 7) * 2.6;
      const sway = 1.2 * Math.sin(c * 1.7 + k);
      strands.push(taper([[Math.cos(a) * r0, -449, Math.sin(a) * r0], [Math.cos(a) * (r0 + 1.2), -462, Math.sin(a) * (r0 + 1.2)],
        [Math.cos(a) * (r0 + 3) + sway, -449 - L * 0.6, Math.sin(a) * (r0 + 3)], [Math.cos(a + 0.05) * r1 + sway * 1.5, -449 - L, Math.sin(a + 0.05) * r1]], 0.5, 0.26, { seg: 8, radial: 4 }));
    }
    ts.add(merge(strands), 'silk_violet');
  }

  // ======================================================================== sockets & meta
  g.socket('grip_r', [0, -62, 0], { rot: [0, 0, -6] });
  g.socket('grip_l', [0, -204, 0]);
  g.socket('base', [0, 96, 0]);
  g.socket('mid', [0, 620, 0]);
  g.socket('tip', [0, TT, 0]);
  g.socket('muzzle', [0, TT, 0]);
  g.socket('gem', [0, 22, 28]);
  g.socket('pommel', [0, -340, 0]);
  g.socket('edge_f', [hwOf(620) + 4, 620, 0]);
  g.socket('edge_b', [-hwOf(620) - 4, 620, 0]);
  g.socket('guard_r', [146, 50, 0]);
  g.socket('guard_l', [-146, 50, 0]);
  STARS.forEach(([s, t], i) => g.socket('star' + (i + 1), [s, t, FLAT + 1.5]));
  g.meta({
    grip: 'melee', support: 'vertical', reload: 'none', series: 'xingxiu',
    notes: 'X02 星河．斬嶽 greatsword. t = sword axis (tip +t), s = edge direction, w = flat normal. fx_edge: projected energy edge '
      + '(pivot at the collar: scale [w, t, s] widens / lengthens it). fx_flare: full projected blade, extras.restHidden (hidden at rest). '
      + 'fx_guardL/R: cloud-head arms on hinge pins at (±54, 18), open ±18° about w. fx_gem: 天樞 hero crystal. '
      + 'fx_starglow1..7: glow rings round the 北斗 crystals (hide / show one by one). fx_dial: 二十八宿 ring, spin t 24°/s. fx_tassel: pendulum.',
  });
  // bake: pre-tessellated (enamel / leather finer, metal coarser; thin slivers kept whole), glass and glow left out of
  // the occluders (the glass over the galaxy blocked every AO ray; the hidden fx_flare darkened both edges), low relief
  // ignored on the big shells, then m4's post-bake (buried AO refill, per-material wear, flat faces unworn)
  g.build = (o = {}) => {
    const root = Gun.prototype.build.call(g, { ...o, bake: false });
    if (o.bake === false) return root;
    const meshes = [];
    root.traverse((m) => { if (m.isMesh && !/^(glass_|glow_)/.test(m.userData.mat)) meshes.push(m); });
    const tess = (o.tessellate ?? TESS) * 0.001;
    for (const m of meshes) {
      const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
      for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
      m.geometry = tessellateFat(geo, /^(glaze_|porcelain|leather|jade)/.test(m.userData.mat) ? tess : tess * TESS_K, 0.0016);
    }
    if (o.tessOnly) return root;
    const relief = (m) => (/^(leather_pebble)/.test(m.userData.mat) ? 0.0016 : /^(steel_blued|black_chrome|brass|steel_bright|chrome)/.test(m.userData.mat) ? 0.0013 : /^(silver|glaze|porcelain)/.test(m.userData.mat) ? 0.0009 : 0);
    bakeMeshes(meshes, { tessellate: 0, aoDist: 0.022, rays: 32, log: true, minHeight: relief });
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
  '*:steel_blued': [1 / 700, 0.45], '*:black_chrome': [1 / 800, 0.4], '*:chrome': [1 / 600, 0.3], '*:brass': [1 / 600, 0.3], '*:steel_bright': [1 / 600, 0.3],
  '*:silver_aged': [1 / 450, 0.7], '*:gold': [1 / 500, 0.55], '*:gold_leaf': [1 / 450, 0.6],
  '*:leather_black': [1 / 450, 0.5], '*:leather_pebble': [1 / 600, 0.3], '*:jade': [1 / 1400, 0.3],
  '*:glaze_cobalt': [0, 0], '*:glaze_inkteal': [0, 0], '*:glaze_turquoise': [0, 0], '*:glaze_aubergine': [0, 0], '*:porcelain': [0, 0],
  '*:crystal': [0, 0], '*:obsidian': [0, 0], '*:silk_violet': [0, 0],
};
