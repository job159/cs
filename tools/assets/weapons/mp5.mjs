// 黃蜂 Hornet-9 — roller-delayed 9 mm submachine gun, MP5A2 pattern with the fixed polymer stock.
// Side view in mm: s forward from the rear face of the receiver (butt pad at s ≈ -215, muzzle at 465 ->
// 680 mm overall), t up from the bore axis, w to the right (ejection-port side).
// Reference: 680 mm overall, 225 mm barrel (chamber at s = 240), ~260 mm tall with the 30-round curved mag,
// 340 mm sight radius (drum at s = 65, front post at s = 406.5).
//
// Finish: the kit has no smooth painted / phosphated stamped-steel key yet ('steel' / 'steel_dark' carry a
// coarse cast texture), so the stamped sheet-steel parts (receiver, cocking tube, sights, magwell, magazine,
// levers) use 'alu' (satin black, fine weak detail); 'steel_dark' is kept for pins, barrel and small parts.
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { Gun, V, DEG, profile, plan, section, lathe, cyl, tube, box, sphere, ring, screw, sweep, cut, cutters, merge, xform, mirrorW, makeShape } from '../lib/gunkit.mjs';

const SKIN = 'alu'; // stand-in for a painted / phosphated stamped-steel finish (see the header)

// ------------------------------------------------------------------------------------------ local helpers

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lerp = (a, b, f) => a + (b - a) * f;
const smooth = (x) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
const nrm = ([x, y]) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };

/** geometry + its mirror across w = 0 */
const both = (geo) => merge([geo, mirrorW(geo)]);

/** lathe around an axis parallel to w through [s,t,w]; axial coordinate maps to +w */
function latheW(pts, [s, t, w], seg = 20) {
  const geo = lathe(pts, { seg });
  geo.rotateY(-Math.PI / 2);
  const c = V(s, t, w);
  return geo.translate(c.x, c.y, c.z);
}
/** lathe around a vertical axis through [s,t,w]; axial coordinate maps to +t */
function latheT(pts, [s, t, w], seg = 20) {
  const geo = lathe(pts, { seg });
  geo.rotateX(Math.PI / 2);
  const c = V(s, t, w);
  return geo.translate(c.x, c.y, c.z);
}
/** domed pin / rivet head sitting on the +w face at w = W, mirrored onto the -w face */
function pinPair(s, t, W, r = 2.4, h = 0.9, seg = 16) {
  return both(latheW([[0, 0], [0, r], [h * 0.45, r * 0.93], [h, r * 0.55], [h, 0]], [s, t, W - 0.05], seg));
}
/** low resistance spot-weld dimple pair (cheap: 3-step profile, 8 sides) */
function weldPair(s, t, W, r = 1.15, h = 0.45) {
  return both(latheW([[0, 0], [0, r], [h, r * 0.5], [h, 0]], [s, t, W - 0.05], 8));
}
/** side-view pocket cutter starting at wIn and running outward; its bevel gives the opening a soft chamfer */
function pocketCut(pts, wIn, depth = 12, bevel = 1.2) {
  const dir = Math.sign(wIn) || 1;
  return profile(pts, { w: depth, cw: wIn + dir * depth / 2, bevel, bevelSeg: 2, curveSeg: 6 });
}

const ringArea = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; a += x1 * y2 - x2 * y1; } return a / 2; };
/** pushes every ring vertex k mm along its outward normal (vertex normal from the neighbours) */
function offsetRing(pts, k) {
  if (!k) return pts;
  const n = pts.length, o = ringArea(pts) >= 0 ? 1 : -1;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const [dx, dy] = nrm([b[0] - a[0], b[1] - a[1]]);
    return [p[0] + o * k * dy, p[1] - o * k * dx];
  });
}
/** max w where a ring (w,t) crosses height t (surface w of lofted furniture, for seating pins / loops) */
function ringWAt(pts, t) {
  let best = 0;
  for (let i = 0; i < pts.length; i++) {
    const [w1, t1] = pts[i], [w2, t2] = pts[(i + 1) % pts.length];
    if (t1 !== t2 && (t1 - t) * (t2 - t) <= 0) best = Math.max(best, w1 + (w2 - w1) * (t - t1) / (t2 - t1));
  }
  return best;
}
/**
 * Loft through rings [{ s, pts: [[x, y], ...] }] (same point count, sorted rear -> front along s, which may be any
 * local axis the caller later transforms). The kit has no loft, so this builds the BufferGeometry directly
 * (non-indexed, creased normals like the kit's primitives). Caps are fans from (0, mid-height): rings must be
 * star-shaped from there. `split(i, j)` (rings must already be counter-clockwise seen from behind) sorts each
 * quad into one of two output geometries, e.g. a stippled panel inside a plain moulding.
 */
function ringLoft(rings, { crease = 40, caps = true, split } = {}) {
  const rev = ringArea(rings[0].pts) < 0;
  const R = rev ? rings.map((r) => ({ s: r.s, pts: [...r.pts].reverse() })) : rings;
  const n = R[0].pts.length;
  const outs = [[], []];
  const P = (i, j) => { const [x, y] = R[i].pts[((j % n) + n) % n]; return [x, y, -R[i].s]; };
  for (let i = 0; i < R.length - 1; i++) {
    for (let j = 0; j < n; j++) {
      const a0 = P(i, j), a1 = P(i, j + 1), b0 = P(i + 1, j), b1 = P(i + 1, j + 1);
      outs[split ? split(i, j) : 0].push(...a0, ...b0, ...b1, ...a0, ...b1, ...a1);
    }
  }
  if (caps) {
    for (const [i, front] of [[0, false], [R.length - 1, true]]) {
      const ys = R[i].pts.map((p) => p[1]);
      const c = [0, (Math.min(...ys) + Math.max(...ys)) / 2, -R[i].s];
      for (let j = 0; j < n; j++) {
        const p0 = P(i, j), p1 = P(i, j + 1);
        outs[0].push(...c, ...(front ? p1 : p0), ...(front ? p0 : p1));
      }
    }
  }
  const mk = (arr) => {
    if (!arr.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    return toCreasedNormals(geo, crease * DEG);
  };
  return split ? outs.map(mk) : mk(outs[0]);
}
/** points of a kit shape spec (closing duplicate removed) */
function shapePts(spec, seg = 5) {
  const p = makeShape(spec).getPoints(seg).map((v) => [v.x, v.y]);
  const a = p[0], b = p[p.length - 1];
  if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) p.pop();
  return p;
}
/** the quadratic fillet makeShape puts on vertex v (between p and n, tangent distance r), sampled */
function filletPts(p, v, nx, r, steps = 8) {
  const li = Math.hypot(v[0] - p[0], v[1] - p[1]), lo = Math.hypot(nx[0] - v[0], nx[1] - v[1]);
  const ri = Math.min(r, li / 2), ro = Math.min(r, lo / 2);
  const a = [v[0] + (p[0] - v[0]) / li * ri, v[1] + (p[1] - v[1]) / li * ri];
  const b = [v[0] + (nx[0] - v[0]) / lo * ro, v[1] + (nx[1] - v[1]) / lo * ro];
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    out.push([(1 - u) ** 2 * a[0] + 2 * (1 - u) * u * v[0] + u * u * b[0], (1 - u) ** 2 * a[1] + 2 * (1 - u) * u * v[1] + u * u * b[1]]);
  }
  return out;
}
/** resamples a polyline to n equal-length segments (n + 1 points) */
function resample(poly, n) {
  const L = [0];
  for (let i = 1; i < poly.length; i++) L.push(L[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]));
  const out = [];
  for (let k = 0; k <= n; k++) {
    const d = L[L.length - 1] * k / n;
    let i = 1;
    while (i < L.length - 1 && L[i] < d) i++;
    const f = (d - L[i - 1]) / (L[i] - L[i - 1] || 1);
    out.push([lerp(poly[i - 1][0], poly[i][0], f), lerp(poly[i - 1][1], poly[i][1], f)]);
  }
  return out;
}
/** intersection of the lines p + a u and q + b v */
function lineX(p, u, q, v) {
  const den = u[0] * v[1] - u[1] * v[0];
  const a = ((q[0] - p[0]) * v[1] - (q[1] - p[1]) * v[0]) / den;
  return [p[0] + a * u[0], p[1] + a * u[1]];
}
/** circular fillet of radius r in the corner between line A (point pa, unit dir ua away from the corner) and line B */
function filletArc(pa, ua, pb, ub, r, n = 48) {
  const K = lineX(pa, ua, pb, ub);
  const th = Math.acos(ua[0] * ub[0] + ua[1] * ub[1]);
  const bis = nrm([ua[0] + ub[0], ua[1] + ub[1]]);
  const dc = r / Math.sin(th / 2), tl = r / Math.tan(th / 2);
  const C = [K[0] + bis[0] * dc, K[1] + bis[1] * dc];
  const TA = [K[0] + ua[0] * tl, K[1] + ua[1] * tl], TB = [K[0] + ub[0] * tl, K[1] + ub[1] * tl];
  const a0 = Math.atan2(TA[1] - C[1], TA[0] - C[0]);
  let da = Math.atan2(TB[1] - C[1], TB[0] - C[0]) - a0;
  if (da > Math.PI) da -= 2 * Math.PI;
  if (da < -Math.PI) da += 2 * Math.PI;
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = a0 + da * i / n; pts.push([C[0] + r * Math.cos(a), C[1] + r * Math.sin(a)]); }
  return pts;
}
/** tp of a fillet arc (list of local [d, tp]) at station d: null above its range, the far tangent value below it */
function arcTp(arc, d) {
  let lo = arc[0], hi = arc[0];
  for (const p of arc) { if (p[0] < lo[0]) lo = p; if (p[0] > hi[0]) hi = p; }
  if (d > hi[0]) return null;
  if (d <= lo[0]) return lo[1];
  for (let i = 0; i < arc.length - 1; i++) {
    const [d0, t0] = arc[i], [d1, t1] = arc[i + 1];
    if (d0 !== d1 && (d - d0) * (d - d1) <= 0) return t0 + (t1 - t0) * (d - d0) / (d1 - d0);
  }
  return null;
}
/** bullet pictogram outline (rectangle with a round nose) pointing radially at angle ang from centre (cs, ct) */
function bulletPts(cs, ct, ang, r0, len, wd, grow = 0) {
  const h = wd / 2 + grow, a0 = r0 - grow, a1 = r0 + len + grow;
  const loc = [[a0, -h], [a1 - h, -h]];
  for (let i = 1; i < 8; i++) { const q = -Math.PI / 2 + Math.PI * i / 8; loc.push([a1 - h + h * Math.cos(q), h * Math.sin(q)]); }
  loc.push([a1 - h, h], [a0, h]);
  const c = Math.cos(ang * DEG), s = Math.sin(ang * DEG);
  return loc.map(([x, y]) => [cs + x * c - y * s, ct + x * s + y * c]);
}

// Tiny stroke font (3 x 5 grid, y up) for the roll-stamped markings.
const GLYPHS = {
  H: [[0, 0, 0, 4], [2, 0, 2, 4], [0, 2, 2, 2]],
  O: [[0, 0, 2, 0], [2, 0, 2, 4], [2, 4, 0, 4], [0, 4, 0, 0]],
  R: [[0, 0, 0, 4], [0, 4, 2, 4], [2, 4, 2, 2], [2, 2, 0, 2], [0.9, 2, 2, 0]],
  N: [[0, 0, 0, 4], [2, 0, 2, 4], [0, 4, 2, 0]],
  E: [[0, 0, 0, 4], [0, 4, 2, 4], [0, 2, 1.5, 2], [0, 0, 2, 0]],
  T: [[1, 0, 1, 4], [0, 4, 2, 4]],
  K: [[0, 0, 0, 4], [0, 1.8, 2, 4], [0.7, 2.6, 2, 0]],
  A: [[0, 0, 1, 4], [1, 4, 2, 0], [0.5, 1.6, 1.5, 1.6]],
  L: [[0, 0, 0, 4], [0, 0, 2, 0]],
  '-': [[0.3, 2, 1.7, 2]],
  '.': [[0.9, 0, 1.1, 0]],
  x: [[0.2, 0, 1.8, 2.6], [0.2, 2.6, 1.8, 0]],
  0: [[0, 0, 2, 0], [2, 0, 2, 4], [2, 4, 0, 4], [0, 4, 0, 0], [0.2, 0.4, 1.8, 3.6]],
  1: [[1, 0, 1, 4], [0.2, 3.2, 1, 4]],
  2: [[0, 4, 2, 4], [2, 4, 2, 2], [2, 2, 0, 2], [0, 2, 0, 0], [0, 0, 2, 0]],
  3: [[0, 4, 2, 4], [2, 4, 2, 0], [2, 0, 0, 0], [0.6, 2, 2, 2]],
  4: [[0, 4, 0, 2], [0, 2, 2, 2], [1.6, 0, 1.6, 4]],
  7: [[0, 4, 2, 4], [2, 4, 0.8, 0]],
  9: [[2, 0, 2, 4], [2, 4, 0, 4], [0, 4, 0, 2], [0, 2, 2, 2], [2, 0, 0, 0]],
};
/** stroke rectangles (centre line a -> b, width sw, square caps) of a string; reads correctly from its own side */
function textStrokes(str, { s0, t0, h = 4, side = 1, stroke }) {
  const u = h / 4, sw = stroke ?? Math.max(0.42, h * 0.15), adv = u * 3;
  const out = [];
  [...str].forEach((ch, i) => {
    for (const [x1, y1, x2, y2] of GLYPHS[ch] || []) {
      out.push({ a: [s0 + side * (i * adv + x1 * u), t0 + y1 * u], b: [s0 + side * (i * adv + x2 * u), t0 + y2 * u], sw });
    }
  });
  return out;
}
/** Douglas-Peucker on an open polyline */
function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-9;
  let k = 0, dm = -1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((b[0] - a[0]) * (a[1] - pts[i][1]) - (a[0] - pts[i][0]) * (b[1] - a[1])) / L;
    if (d > dm) { dm = d; k = i; }
  }
  if (dm <= eps) return [a, b];
  return [...simplify(pts.slice(0, k + 1), eps).slice(0, -1), ...simplify(pts.slice(k), eps)];
}
/**
 * Union of stroke rectangles, rasterised (res mm) and traced into closed (s, t) polygons: CCW glyph outlines and
 * CW counters. Lets lettering be an earcut stencil plate instead of dozens of CSG cuts (≈ 1/3 of the triangles).
 */
function traceText(strokes, res = 0.04, eps = 0.03) {
  let s0 = 1e9, s1 = -1e9, t0 = 1e9, t1 = -1e9;
  for (const { a, b, sw } of strokes) for (const p of [a, b]) { s0 = Math.min(s0, p[0] - sw); s1 = Math.max(s1, p[0] + sw); t0 = Math.min(t0, p[1] - sw); t1 = Math.max(t1, p[1] + sw); }
  const nx = Math.ceil((s1 - s0) / res) + 2, ny = Math.ceil((t1 - t0) / res) + 2;
  s0 -= res; t0 -= res;
  const F = new Uint8Array(nx * ny);
  for (const { a, b, sw } of strokes) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = L ? (b[0] - a[0]) / L : 1, uy = L ? (b[1] - a[1]) / L : 0;
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, hl = (L + sw) / 2, hw = sw / 2;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const dx = s0 + (i + 0.5) * res - mx, dy = t0 + (j + 0.5) * res - my;
      if (Math.abs(dx * ux + dy * uy) <= hl && Math.abs(-dx * uy + dy * ux) <= hw) F[j * nx + i] = 1;
    }
  }
  const on = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && F[j * nx + i] === 1;
  // directed boundary edges with the filled cell on the left
  const out = new Map();
  const key = (i, j) => j * (nx + 1) + i;
  const addE = (a, b) => { const k = key(...a); if (!out.has(k)) out.set(k, []); out.get(k).push({ a, b, used: false }); };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!on(i, j)) continue;
    if (!on(i, j - 1)) addE([i, j], [i + 1, j]);
    if (!on(i + 1, j)) addE([i + 1, j], [i + 1, j + 1]);
    if (!on(i, j + 1)) addE([i + 1, j + 1], [i, j + 1]);
    if (!on(i - 1, j)) addE([i, j + 1], [i, j]);
  }
  const loops = [];
  for (const list of out.values()) {
    for (const e0 of list) {
      if (e0.used) continue;
      const loop = [];
      let e = e0;
      while (e && !e.used) {
        e.used = true;
        loop.push(e.a);
        const cand = (out.get(key(...e.b)) || []).filter((c) => !c.used);
        if (cand.length > 1) { // saddle: turn left so diagonal neighbours stay separate loops
          const dx = e.b[0] - e.a[0], dy = e.b[1] - e.a[1];
          cand.sort((p, q) => ((dx * (q.b[1] - q.a[1]) - dy * (q.b[0] - q.a[0])) - (dx * (p.b[1] - p.a[1]) - dy * (p.b[0] - p.a[0]))));
        }
        e = cand[0];
      }
      // simplify the closed loop (split at the vertex farthest from the start)
      const P = loop.map(([i, j]) => [s0 + i * res, t0 + j * res]);
      let k = 0, dm = -1;
      P.forEach((p, i) => { const d = Math.hypot(p[0] - P[0][0], p[1] - P[0][1]); if (d > dm) { dm = d; k = i; } });
      const A = simplify(P.slice(0, k + 1), eps), B = simplify([...P.slice(k), P[0]], eps);
      loops.push([...A.slice(0, -1), ...B.slice(0, -1)]);
    }
  }
  return { outlines: loops.filter((l) => ringArea(l) > 0), counters: loops.filter((l) => ringArea(l) < 0) };
}
/** removes the triangles lying in the plane w = wPlane (hidden back face of a flush insert) */
function dropPlane(geo, wPlane) {
  const p = geo.attributes.position, nrmA = geo.attributes.normal, keep = [];
  for (let i = 0; i < p.count; i += 3) {
    if ([0, 1, 2].every((k) => Math.abs(p.getX(i + k) - wPlane) < 1e-4)) continue;
    keep.push(i);
  }
  const P = new Float32Array(keep.length * 9), N = new Float32Array(keep.length * 9);
  keep.forEach((i, n) => { for (let k = 0; k < 9; k++) { P[n * 9 + k] = p.array[i * 3 + k]; N[n * 9 + k] = nrmA.array[i * 3 + k]; } });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  return g;
}
/**
 * Roll-stamped (recessed) lettering on a flat side face at |w| = W: returns the pocket cutter for the host part,
 * a flush stencil insert with the glyphs as holes (counters as islands) and a 0.05 mm floor sheet under it (the
 * letter floors: struck through the paint, so they get their own darker-grey material). `rect` = [s0, t0, s1, t1].
 */
function stampText(lines, { side = 1, W, depth = 0.25, margin = 0.7 }) {
  const strokes = lines.flatMap((l) => textStrokes(l.str, { ...l, side }));
  const { outlines, counters } = traceText(strokes);
  let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
  for (const l of outlines) for (const [s, t] of l) { a0 = Math.min(a0, s); a1 = Math.max(a1, s); b0 = Math.min(b0, t); b1 = Math.max(b1, t); }
  a0 -= margin; a1 += margin; b0 -= margin; b1 += margin;
  const rectP = [[a0, b0], [a1, b0], [a1, b1], [a0, b1]];
  const cw = side * (W - depth / 2);
  const parts = [profile(rectP, { w: depth, cw, bevel: 0, holes: outlines })];
  for (const c of counters) parts.push(profile(c, { w: depth, cw, bevel: 0 }));
  const fl = 0.05;
  return {
    pocket: cutters.box([(a0 + a1) / 2, (b0 + b1) / 2, side * (W - depth - fl + 1)], [a1 - a0, b1 - b0, 2]),
    insert: dropPlane(merge(parts), side * (W - depth)),
    floor: dropPlane(profile(rectP, { w: fl, cw: side * (W - depth - fl / 2), bevel: 0 }), side * (W - depth - fl)),
    rect: [a0, b0, a1, b1],
  };
}

/**
 * Bake post-process (kit gap: its convex-curvature wear saturates on every bevel under ~7 mm radius, so a black
 * painted gun turns silver). Rules remap the baked edge value per mesh ('part:mat') by gun-space position (mm).
 */
function tuneWear(g, root, rules, aoRules = {}) {
  root.traverse((o) => {
    const rule = o.isMesh && (rules[o.name] || rules['*:' + o.name.split(':')[1]]);
    const aoRule = o.isMesh && aoRules[o.name];
    const bake = (rule || aoRule) && o.geometry.attributes._bake;
    if (!bake) return;
    const piv = g.parts.get(o.name.split(':')[0]).pivot;
    const pos = o.geometry.attributes.position, arr = bake.array;
    for (let i = 0; i < pos.count; i++) {
      const s = -(pos.getZ(i) * 1000 + piv.z), t = pos.getY(i) * 1000 + piv.y, w = pos.getX(i) * 1000 + piv.x;
      if (rule) arr[i * 4 + 1] = Math.round(clamp01(rule(s, t, w, arr[i * 4 + 1] / 255)) * 255);
      if (aoRule) arr[i * 4] = Math.round(clamp01(aoRule(s, t, w, arr[i * 4] / 255)) * 255);
    }
    bake.needsUpdate = true;
  });
}

// ------------------------------------------------------------------------------------------ dimensions
const RW = 17;               // receiver half width (outer skin)
const TT = 22, TR = 11;      // cocking-tube axis height and radius (receiver top = 33)
const SIGHT_T = 44;          // aim line (drum aperture centre / front post tip)
const RS = 65;               // rear sight drum centre (340 mm sight radius to the post at 406.5)

/** receiver cross-section (w, t): wide lower box for the bolt, cocking tube on top, shallow weld groove between */
const ARC0 = -22; // where the tube arc leaves the shoulder (deg)
function recvSection(inset = 0) {
  const hw = RW - inset, bot = -19 + inset, R = TR - inset;
  const neck = [13.4 - inset * 0.95, 13.6 - inset * 0.5, 2];
  const pts = [[-hw, bot, 3 - inset], [hw, bot, 3 - inset], [hw, 7.5 - inset * 0.4, 4.5], neck];
  for (let a = ARC0; a <= 180 - ARC0 + 0.01; a += (180 - 2 * ARC0) / 28) pts.push([R * Math.cos(a * DEG), TT + R * Math.sin(a * DEG)]);
  pts.push([-neck[0], neck[1], 2], [-hw, 7.5 - inset * 0.4, 4.5]);
  return pts;
}
/** centre of the weld bead sitting in the groove between shoulder and tube (right side) */
function weldSeam() {
  const c = [TR * Math.cos(ARC0 * DEG), TT + TR * Math.sin(ARC0 * DEG)];
  const a = [13.4 - c[0], 13.6 - c[1]], la = Math.hypot(...a);
  const b = [-Math.sin(ARC0 * DEG), Math.cos(ARC0 * DEG)];
  const m = [a[0] / la + b[0], a[1] / la + b[1]], lm = Math.hypot(...m);
  return [c[0] + 0.45 * m[0] / lm, c[1] + 0.45 * m[1] / lm];
}

// ---- stock sections. Both half outlines run from the bottom centre up the right side to the top centre with the
// same point count per segment, so the nose (receiver keyhole) can morph into the rounded-square butt.
const sTop = (s) => 33 - 4 * (-s / 201);
const sBot = (s) => { const x = clamp01(-s / 201); return -46 - 55.5 * x + 22 * x * (1 - x); }; // concave A2 underside
const sHw = (s) => 17 + 3 * (-s / 201);
const sDish = (s) => 1.3 * clamp01((s + 182) / 4) * clamp01((-66 - s) / 4);           // shallow flank panel depth
/** rounded-square butt section with a crisp shoulder (r 3.5) at the comb and a dished flank panel */
function stockHalf(s) {
  const top = sTop(s), bot = sBot(s), hw = sHw(s), rb = 9, rs = 3.5, crown = 0.6, dd = sDish(s);
  const out = [];
  for (let i = 0; i < 3; i++) out.push([(hw - rb) * i / 3, bot]);
  for (let i = 0; i < 6; i++) { const a = (-90 + 15 * i) * DEG; out.push([hw - rb + rb * Math.cos(a), bot + rb + rb * Math.sin(a)]); }
  const t0 = bot + rb, t5 = top - rs, e1 = bot + 15, e2 = bot + 18, e3 = top - 13, e4 = top - 10;
  const ts = [t0, (t0 + e1) / 2, e1, e2];
  for (let k = 1; k <= 5; k++) ts.push(lerp(e2, e3, k / 6));
  ts.push(e3, e4, (e4 + t5) / 2);
  const prof = (t) => clamp01(Math.min((t - e1) / (e2 - e1), (e4 - t) / (e4 - e3)));
  for (const t of ts) out.push([hw - dd * prof(t), t]);
  for (let i = 0; i < 6; i++) { const a = 15 * i * DEG; out.push([hw - rs + rs * Math.cos(a), top - rs + rs * Math.sin(a)]); }
  for (let i = 0; i < 9; i++) { const w = (hw - rs) * (1 - i / 9); out.push([w, top + crown * (1 - (w / (hw - rs)) ** 2)]); }
  out.push([0, top + crown]);
  return out; // 37 points
}
/** the receiver's keyhole outline (recvSection(0)) carried down to the stock's lower line */
const KEY_NECK = (() => {
  const P1 = [RW, -19], V1 = [RW, 7.5], V2 = [13.4, 13.6], N2 = [TR * Math.cos(ARC0 * DEG), TT + TR * Math.sin(ARC0 * DEG)];
  const poly = [...filletPts(P1, V1, V2, 4.5), ...filletPts(V1, V2, N2, 2), N2];
  return resample(poly, 6).slice(0, 6);
})();
function keyHalf(bot) {
  const out = [], kb = 6;
  for (let i = 0; i < 3; i++) out.push([(RW - kb) * i / 3, bot]);
  for (let i = 0; i < 6; i++) { const a = (-90 + 15 * i) * DEG; out.push([RW - kb + kb * Math.cos(a), bot + kb + kb * Math.sin(a)]); }
  for (let i = 0; i < 12; i++) out.push([RW, lerp(bot + kb, KEY_NECK[0][1], i / 12)]);
  out.push(...KEY_NECK);
  for (let i = 0; i < 9; i++) { const a = (ARC0 + (90 - ARC0) * i / 9) * DEG; out.push([TR * Math.cos(a), TT + TR * Math.sin(a)]); }
  out.push([0, TT + TR]);
  return out; // 37 points
}
/** full stock ring at s (counter-clockwise from behind): keyhole for s >= -15, butt section for s <= -60 */
function stockRing(s, k = 0) {
  const b = smooth((s + 60) / 45);
  const A = stockHalf(s), B = keyHalf(sBot(s));
  const half = A.map((p, i) => [lerp(p[0], B[i][0], b), lerp(p[1], B[i][1], b)]);
  return offsetRing([...half, ...half.slice(1, -1).reverse().map(([w, t]) => [-w, t])], k);
}

// ---- pistol grip: 15 deg rake, lofted along a local axis (d = distance down the grip, tp = towards the front strap)
const GR = 15 * DEG, GSN = Math.sin(GR), GCS = Math.cos(GR), GT = [69, -46];
const G_EX = 2.6, gWf = (v) => 1 - 0.2 * v;
const gToWorld = (d, tp) => [GT[0] - d * GSN + tp * GCS, GT[1] - d * GCS - tp * GSN];
const gToLocal = ([s, t]) => { const ds = s - GT[0], dt = t - GT[1]; return [-(ds * GSN + dt * GCS), ds * GCS - dt * GSN]; };
function gBase(d) {
  const x = clamp01(d / 96);
  const front = 21 + 2.6 * Math.max(0, (d - 76) / 16) ** 2;
  return { top: Math.min(front, 23.6), bot: -21 - 3.2 * Math.sin(Math.PI * Math.min(1, x * 1.12)), hw: 15 - 1.4 * x };
}
/** front strap point (tp = 21 - inset) at height t */
const strapPt = (t, inset = 0) => { const tp = 21 - inset; return gToWorld((GT[1] - t - tp * GSN) / GCS, tp); };
const seAt = (a) => {
  const c = Math.cos(a * DEG), s = Math.sin(a * DEG);
  return [Math.sign(c) * Math.abs(c) ** (2 / G_EX), 0.5 + 0.5 * Math.sign(s) * Math.abs(s) ** (2 / G_EX)];
};
const gPoint = (st, a, k) => { const [u, v] = seAt(a); return [u * (st.hw * gWf(v) + k), st.bot - k + v * (st.top - st.bot + 2 * k)]; };

export default function build() {
  const g = new Gun('mp5');

  // ======================================================================================== RECEIVER
  let recv = section(recvSection(0), 0, 238, { bevel: 0.5, curveSeg: 5, holes: [recvSection(1.5)] });
  // claw-mount recesses on the receiver top (two pairs, ahead of the rear sight and above the port)
  const claw = [];
  for (const s of [92, 190]) {
    for (const a of [50, 130]) {
      const rc = TR - 1.2 + 2;
      claw.push(box([s, TT + rc * Math.sin(a * DEG), rc * Math.cos(a * DEG)], [10, 6, 4], { r: 1.1, seg: 1, rot: [0, 0, a] }));
    }
  }
  // roll-stamped markings, recessed 0.25 mm: model + calibre on the left above the magwell, serial on the right
  const markL = stampText([{ str: 'HORNET-9', s0: 158, t0: -12, h: 4.6 }, { str: '9x19', s0: 158, t0: -4.5, h: 3.2 }], { side: -1, W: RW });
  const markR = stampText([{ str: 'HN-04172', s0: 92, t0: -12.5, h: 3.4 }], { side: 1, W: RW });
  recv = cut(recv, [
    pocketCut([[186, -4, 2.5], [228, -4, 2.5], [228, 8.5, 2.5], [186, 8.5, 2.5]], 14.6, 12, 1.2), // ejection port
    cutters.box([184.5, -18, 0], [41.5, 6, 25.4]),                                                 // magwell opening
    ...claw,
    // pressed bolt-guide grooves along both sides (the guide rails inside are spot welded through them)
    profile([[6, 1.4, 1.6], [180, 1.4, 1.6], [180, 4.6, 1.6], [6, 4.6, 1.6]], { w: 12, cw: RW - 0.7 + 6, bevel: 0.5, bevelSeg: 1, curveSeg: 3 }),
    profile([[6, 1.4, 1.6], [236, 1.4, 1.6], [236, 4.6, 1.6], [6, 4.6, 1.6]], { w: 12, cw: -(RW - 0.7 + 6), bevel: 0.5, bevelSeg: 1, curveSeg: 3 }),
    markL.pocket, markR.pocket,
  ]);
  g.add(recv, SKIN);
  g.add(merge([markL.insert, markR.insert]), SKIN);
  g.add(merge([markL.floor, markR.floor]), 'steel');
  // front trunnion plug (closes the receiver nose behind the handguard)
  g.add(section(recvSection(1.6), 231, 237.6, { bevel: 0.4, bevelSeg: 1, curveSeg: 3 }), 'steel_dark');
  // seam welds where the cocking tube is joined to the bolt housing, both sides
  { const [ww, wt] = weldSeam(); g.add(both(cyl(2, 236, 0.7, { t: wt, w: ww, seg: 6, b: 0.3 })), SKIN); }
  // spot welds of the internal bolt guide rails, both sides
  for (let s = 22; s <= 172; s += 25) g.add(weldPair(s, 3, RW - 0.7, 1.15, 0.5), SKIN);
  for (const t of [-8, 2]) g.add(weldPair(234.5, t, RW, 1.3, 0.45), SKIN);
  // pressed brass deflector behind the ejection port
  g.add(profile([[176, 2, 1], [185, 2, 0.6], [185, 10, 1], [180, 10, 1]], { w: 3.6, cw: RW + 0.9, bevel: 0.8, curveSeg: 4 }), SKIN);
  // handguard retaining pin
  g.add(pinPair(232.5, -9, RW, 2.3), 'steel_dark');
  g.add(box([232.5, -9, 0], [4.6, 4.6, 2 * RW + 2.8], { r: 1.4, seg: 1 }), 'steel_dark');

  // ---- forward cocking tube (part of the receiver stamping) with the cocking slot on the left
  let ctube = tube(237.6, 396, TR, TR - 1.6, { t: TT, seg: 30 });
  ctube = cut(ctube, [
    cutters.slotW(290.5, 395, TT, 5.6, 10, -9),     // cocking slot (rear end clears the lever root when pulled back)
    cutters.slotW(290.5, 302, TT + 3, 7.2, 10, -9),  // rear "slap" notch
  ]);
  g.add(ctube, SKIN);
  g.add(lathe([[237.2, 0], [237.2, TR + 0.1], [237.6, TR + 0.65], [238.4, TR + 0.65], [238.8, TR + 0.1], [238.8, 0]], { t: TT, seg: 30 }), SKIN); // tube-to-receiver weld ring

  // ---- rear sight (drum at s = 65): base block, two cheek plates, hollow rotary drum with 3 apertures + V-notch
  g.add(profile([[RS - 12, 27, 1], [RS + 13, 27, 1], [RS + 13, 35.5, 1.5], [RS + 10, 37.6, 1.5], [RS - 9, 37.6, 1.5], [RS - 12, 35, 1.5]], { w: 19, bevel: 1, curveSeg: 4 }), SKIN);
  const cheek = profile(`M ${RS - 8} 33 L ${RS + 8} 33 L ${RS + 6.6} 44 Q ${RS + 6.6} 50.6 ${RS} 50.6 Q ${RS - 6.6} 50.6 ${RS - 6.6} 44 Z`, { w: 1.8, cw: 9.9, bevel: 0.5, curveSeg: 11 });
  g.add(both(cheek), SKIN);
  {
    let drum = latheW([[-8, 0], [-8, 7.4], [-7.5, 8.4], [-6.3, 8.5], [-5.8, 7.9], [-5.2, 8.5], [5.2, 8.5], [5.8, 7.9], [6.3, 8.5], [7.5, 8.4], [8, 7.4], [8, 0]], [RS, SIGHT_T, 0], 32);
    const radial = (r, a) => xform(cyl(RS, RS + 12, r, { t: SIGHT_T, b: 0, seg: 20 }), { rot: [a, 0, 0], pivot: [RS, SIGHT_T, 0] });
    drum = cut(drum, [
      latheW([[-5.6, 0], [-5.6, 5.2], [5.6, 5.2], [5.6, 0]], [RS, SIGHT_T, 0], 24), // hollow drum
      radial(3.7, 180),  // combat aperture (rear): frames the front hood ring from the 170 mm ADS eye relief
      radial(4.4, 0),    // front exit (wider than the cone through the rear aperture)
      radial(1.3, 270),                                                              // fine aperture (down)
      section([[0, 49.6], [3.4, 53.6], [-3.4, 53.6]], RS - 12, RS + 12, { bevel: 0 }), // V-notch position (top)
    ]);
    g.add(drum, SKIN);
  }
  g.add(pinPair(RS, SIGHT_T, 10.8, 2.6, 0.9, 20), 'steel_bright');               // drum axle screws
  g.add(screw([RS - 6, 31.5, 9.5], 1.5, { face: 'w', depth: 0.6 }), 'steel_bright'); // windage screws
  g.add(screw([RS + 7, 31.5, 9.5], 1.5, { face: 'w', depth: 0.6 }), 'steel_bright');
  for (const s of [RS - 9.5, RS + 10.5]) g.add(weldPair(s, 31.5, 9.5, 1.1, 0.45), SKIN); // spot welds

  // ======================================================================================== FRONT END
  // barrel (bore 9 mm), chamber end inside the trunnion
  g.add(lathe([[228, 4.45], [228, 11.5], [240, 11.5], [242, 9.4], [420, 8.6], [420, 4.45], [228, 4.45]], { seg: 28 }), 'steel_dark');
  // tri-lug section and threaded muzzle
  g.add(lathe([[418, 4.45], [418, 8.6], [433, 8.6], [434, 8.0], [446, 8.0], [446.6, 7.3], [447.4, 6.7], [448.2, 7.3], [449, 6.7], [449.8, 7.3], [450.6, 6.7], [451.4, 7.3], [452.2, 6.7], [453, 7.3], [453.8, 6.7], [454.6, 7.3], [455.4, 6.7], [456.2, 7.3], [457, 6.7], [457.8, 7.3], [458.6, 6.7], [459.4, 7.3], [460.2, 6.7], [461, 7.3], [462, 7.3], [463.6, 6.6], [465, 6.0], [465, 5.2], [464.4, 4.45], [418, 4.45]], { seg: 18 }), 'steel_dark');
  for (const a of [90, 210, 330]) {
    g.add(xform(box([426.5, 8.6 + 1.5, 0], [13, 3.6, 7], { r: 0.9, seg: 1 }), { rot: [0, 0, a - 90], pivot: [426.5, 0, 0] }), 'steel_dark');
  }
  // front sight base: barrel collar + cocking-tube end cap + flat web, hooded ring with post
  g.add(lathe([[396, 0], [396, 11.4], [397.2, 12.5], [414.6, 12.5], [416, 11.2], [416, 0]], { seg: 28 }), SKIN);
  g.add(lathe([[394, 0], [394, 11.6], [395, 12.2], [412, 12.2], [414.6, 11.2], [416.4, 8.4], [416.4, 6.2], [415.8, 5.6], [415.8, 0]], { t: TT, seg: 28 }), SKIN);
  g.add(profile([[397, -2, 1], [414.5, -2, 1], [414.5, 24, 1], [397, 24, 1]], { w: 20, bevel: 1.4, curveSeg: 4 }), SKIN);
  g.add(profile([[399.5, 30, 1], [413, 30, 1], [412, 37.2, 1.5], [400.5, 37.2, 1.5]], { w: 11, bevel: 1, curveSeg: 4 }), SKIN);
  g.add(tube(400, 412.5, 10, 8.3, { t: SIGHT_T, seg: 36, b: 0.6 }), SKIN);
  g.add(box([406.5, 37.6, 0], [4.2, 3.2, 4.2], { r: 0.6, seg: 1 }), SKIN);
  g.add(box([406.5, 40, 0], [2.4, 8, 2.0], { r: 0.3, seg: 1 }), 'steel_dark');      // front post (tip at t = 44)
  g.add(ring(405.5, 5.4, 1.2, { t: 14, w: -14.5, axis: 't', seg: 20 }), SKIN);      // front sling loop (left)
  g.add(pinPair(405.5, 6, 10, 1.8, 0.6, 12), 'steel_dark');                          // barrel cross pin

  // slim polymer handguard: U section around the barrel under the cocking tube, two deep flutes per side,
  // flared front hand-stop lip with a short concave ramp
  const hg = [[10.6, 16.2, 0.8], [16.2, 16.2, 2.5], [21.2, 11, 4], [21.6, -12, 3], [17.5, -21.5, 7], [9, -26.5, 9],
    [-9, -26.5, 9], [-17.5, -21.5, 7], [-21.6, -12, 3], [-21.2, 11, 4], [-16.2, 16.2, 2.5], [-10.6, 16.2, 0.8],
    [-14, 9, 3], [-14.2, -6, 6], [-8, -15.5, 6], [8, -15.5, 6], [14.2, -6, 6], [14, 9, 3]];
  let hguard = section(hg, 239.2, 383, { bevel: 2.4, bevelSeg: 2, curveSeg: 4 });
  const flutes = [];
  for (const side of [1, -1]) {
    for (const t of [3.0, -5.0]) flutes.push(profile([[255, t - 2.5, 2.5], [372, t - 2.5, 2.5], [372, t + 2.5, 2.5], [255, t + 2.5, 2.5]], { w: 10, cw: side * 24.7, bevel: 0.9, bevelSeg: 1, curveSeg: 4 }));
  }
  hguard = cut(hguard, flutes);
  g.add(hguard, 'polymer');
  const lip = hg.map(([w, t, r]) => [w * (Math.abs(w) > 9 ? 1.12 : 1), t < 0 ? t * 1.12 : t, r]);
  {
    const hgP = shapePts(hg, 4), lipP = shapePts(lip, 4);
    const ramp = [[377.6, 0, -0.3], [379.6, 0.3, 0], [381, 0.65, 0], [382.4, 1, -0.2]]
      .map(([s, f, k]) => ({ s, pts: offsetRing(hgP.map((p, i) => [lerp(p[0], lipP[i][0], f), lerp(p[1], lipP[i][1], f)]), k) }));
    g.add(ringLoft(ramp, { caps: false, crease: 55 }), 'polymer');
  }
  g.add(section(lip, 381, 394.8, { bevel: 1.2, bevelSeg: 2, curveSeg: 4 }), 'polymer');

  // ======================================================================================== LOWER
  // magwell (stamped, welded under the receiver), flared mouth
  let mw = profile([[160.4, -16, 1], [207.5, -16, 1], [208.6, -50, 2.5], [210.2, -55, 1.2], [158.6, -55, 1.2], [160.2, -50, 2.5]], { w: 30, bevel: 1.2, curveSeg: 5 });
  mw = cut(mw, [plan([[164, -12.7, 2], [205.6, -12.7, 2], [205.6, 12.7, 2], [164, 12.7, 2]], { h: 60, ct: -27, bevel: 1.6, curveSeg: 4 })]);
  g.add(mw, SKIN);
  for (let s = 164; s <= 205; s += 8) g.add(weldPair(s, -17.6, 15, 1.1, 0.45), SKIN);
  // mag release button (right side) with a guard rib
  g.add(latheW([[0, 0], [0, 4.2], [1.6, 4.0], [2.4, 3.3], [2.6, 0]], [168, -37, 15], 20), 'steel_dark');
  g.add(profile([[161, -44, 1], [176, -44, 1], [176, -42, 1], [161, -42, 1]], { w: 2.4, cw: 15.6, bevel: 0.6, curveSeg: 4 }), SKIN);

  // polymer trigger housing with integral grip and guard (ambi lower). Its lower edge sweeps up behind the grip.
  const HW = 30.6;
  const HP = HW / 2 - 0.6; // recessed side panel surface
  const SEL = [64, -39];   // selector axle
  const SEL_A = 62;        // rest pose of the levers: pointing at the semi-auto pictogram
  const ICONS = [[115, 'paint_white'], [SEL_A, 'paint_red'], [18, 'paint_red'], [9, 'paint_red'], [0, 'paint_red'], [-9, 'paint_red']];
  {
    let housing = profile([[10.5, -17, 1], [159.4, -17, 1], [159.4, -47, 2.5], [148, -50, 2], [92, -50, 2], [50, -51.5, 8], [10.5, -44.5, 3]], { w: HW, bevel: 1.6, bevelSeg: 2, curveSeg: 6 });
    const panel = [[17, -20.6, 2.5], [152, -20.6, 2.5], [152, -44.5, 2.5], [96, -46.6, 3], [52, -48.2, 4], [18, -41.8, 3]];
    const cutsH = [pocketCut(panel, HP, 10, 0.5), pocketCut(panel, -HP, 10, 0.5)];
    // fire-control pictograms (white = safe, 1 red = semi, row of red = auto) sunk into recessed outlines
    for (const side of [1, -1]) {
      for (const [a, mat] of ICONS) {
        if (a < 30) continue; // the auto row shares one recess (below)
        cutsH.push(profile(bulletPts(SEL[0], SEL[1], a, 15.4, 4.2, 2.0, 0.42), { w: 2.4, cw: side * (HP - 0.35 + 1.2), bevel: 0, curveSeg: 4 }));
      }
      // one fan-shaped recess around the row of auto pictograms
      const fan = [];
      for (let k = 0; k <= 3; k++) { const a = (-15.2 + 39.4 * k / 3) * DEG; fan.push([SEL[0] + 14.98 * Math.cos(a), SEL[1] + 14.98 * Math.sin(a)]); }
      for (let k = 3; k >= 0; k--) { const a = (-14.4 + 37.8 * k / 3) * DEG; fan.push([SEL[0] + 20.02 * Math.cos(a), SEL[1] + 20.02 * Math.sin(a)]); }
      cutsH.push(profile(fan, { w: 2.4, cw: side * (HP - 0.35 + 1.2), bevel: 0, curveSeg: 3 }));
      for (const [a, mat] of ICONS) {
        g.add(profile(bulletPts(SEL[0], SEL[1], a, 15.4, 4.2, 2.0), { w: 0.26, cw: side * (HP - 0.35 + 0.13), bevel: 0, curveSeg: 4 }), mat);
      }
    }
    housing = cut(housing, cutsH);
    g.add(housing, 'polymer');
  }
  // raised selector boss (1 mm) on both panels
  g.add(both(latheW([[0, 0], [0, 7.6], [0.6, 7.5], [1.05, 6.8], [1.05, 0]], [SEL[0], SEL[1], HP - 0.05], 24)), 'polymer');

  // Lofted pistol grip: oval section narrowing to the front strap, palm swell at the back, pinky lip at the
  // bottom front. Its top flows into the housing through two circular fillets (r 11 at the backstrap, r 5 at
  // the front strap) and each side carries a stippled panel (polymer_grip) inside a 1 mm recessed border.
  {
    const placeGrip = (geo) => {
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const [s, t] = gToWorld(-p.getZ(i), p.getY(i));
        p.setY(i, t);
        p.setZ(i, -s);
      }
      geo.deleteAttribute('normal');
      return toCreasedNormals(geo, 40 * DEG);
    };
    // fillet arcs in local (d, tp)
    const HB0 = [50, -51.5], HB1 = [10.5, -44.5];
    const backArc = filletArc(gToWorld(25, gBase(25).bot), [-GSN, -GCS], [HB0[0], HB0[1] + 0.5], nrm([HB1[0] - HB0[0], HB1[1] - HB0[1]]), 11).map(gToLocal);
    const frontArc = filletArc(gToWorld(0, 21), [-GSN, -GCS], [92, -49.6], [1, 0], 5).map(gToLocal);
    const gSt = (d, k = 0) => {
      const b = gBase(d), bt = arcTp(backArc, d), ft = arcTp(frontArc, d);
      return { s: d, top: ft === null ? b.top : Math.max(b.top, ft), bot: bt === null ? b.bot : Math.min(b.bot, bt), hw: b.hw, k };
    };
    // stippled side panels: angular extent (deg on the section) and grip depth range, groove profile in mm
    const PA = 39, PD0 = 30, PD1 = 84, GROOVE = [0, 0.25, 0.85, 1.1];
    const mmPerDeg = (() => { const st = gBase(55), p0 = gPoint(st, PA - 0.5, 0), p1 = gPoint(st, PA + 0.5, 0); return Math.hypot(p1[0] - p0[0], p1[1] - p0[1]); })();
    const grooveProf = (m) => (m <= 1e-6 ? 0 : m < 0.25 ? -0.9 * m / 0.25 : m <= 0.85 ? -0.9 : m < 1.1 ? -0.9 + 1.15 * (m - 0.85) / 0.25 : 0.25);
    const gDisp = (d, a) => {
      const aa = a > 90 ? 180 - a : a;
      const m = Math.min((PA - Math.abs(aa)) * mmPerDeg, d - PD0, PD1 - d);
      return m < -1e-6 ? 0 : grooveProf(Math.max(0, m));
    };
    const angs = new Set();
    for (let a = -90; a < 270; a += 12) angs.add(a);
    for (const o of GROOVE) { const a = PA - o / mmPerDeg; for (const x of [a, -a, 180 - a, 180 + a]) angs.add(+x.toFixed(4)); }
    const gAngles = [...angs].sort((x, y) => x - y);
    const dl = new Set([-8, -5.5, 3.5, 6.5, 9.5, 24.5, 27.5, 38, 46, 54, 62, 70, 76, 86.5, 89, 91.5]);
    for (const o of GROOVE) { dl.add(PD0 + o); dl.add(PD1 - o); }
    for (let i = 0; i <= 5; i++) dl.add(+frontArc[Math.round(i * (frontArc.length - 1) / 5)][0].toFixed(3));
    for (let i = 0; i <= 8; i++) dl.add(+backArc[Math.round(i * (backArc.length - 1) / 8)][0].toFixed(3));
    const ds = [...dl].sort((x, y) => x - y).filter((d, i, a) => i === 0 || d - a[i - 1] > 0.12);
    const stations = [...ds.map((d) => gSt(d)), { ...gSt(94.2), k: -1.3 }, { ...gSt(96), k: -4.5 }];
    const D = [];
    const rings = stations.map((st) => {
      const row = gAngles.map((a) => gDisp(st.s, a));
      D.push(row);
      return { s: st.s, pts: gAngles.map((a, j) => gPoint(st, a, st.k + row[j])) };
    });
    const n = gAngles.length;
    const [gMain, gPanel] = ringLoft(rings, { split: (i, j) => ([D[i][j], D[i][(j + 1) % n], D[i + 1][j], D[i + 1][(j + 1) % n]].every((x) => x > 0.2) ? 1 : 0) });
    g.add(placeGrip(gMain), 'polymer');
    g.add(placeGrip(gPanel), 'polymer_grip');
  }
  // trigger guard: large glove-friendly opening (t -50..-78, s from the front strap to 145), 6 mm bottom bar,
  // front post rooted in the housing with an inner fillet, rear end blended into the front strap
  {
    const J1 = strapPt(-84, 0.5), J2 = strapPt(-89.5, 4), J3 = strapPt(-89.5, 9), J4 = strapPt(-73, 9), J5 = strapPt(-78, 0.5);
    const guard = profile([[150.6, -44.5, 0], [150.2, -84, 13], [J1[0], -84, 4], [...J2, 0], [...J3, 0], [...J4, 0], [J5[0], -78, 5],
      [145, -78, 8], [145, -50.4, 3], [138, -50.4, 0], [138, -46, 0]], { w: 11, bevel: 1.5, bevelSeg: 2, curveSeg: 10 });
    g.add(guard, 'polymer');
  }
  // housing pins (trigger, hammer, sear)
  for (const [s, t] of [[106, -42], [40, -31], [132, -33]]) g.add(pinPair(s, t, HP, 2.0, 0.6, 10), 'steel_dark');

  // ---- selector (ambidextrous flag levers on a standoff hub), pivot on its axle, rest pose = semi
  const sel = g.part('selector', { pivot: [SEL[0], SEL[1], 0], extras: { axis: 'w', rest: 'semi', safe: 53, auto: -57 } });
  const lever = (len, tab, arm) => {
    const loc = [[-5.4, -arm, 2.4], [len - 9.5, -arm, 2.5], [len - 6.5, -tab, 1.6], [len, -tab + 0.4, 2.6], [len, tab - 0.4, 2.6], [len - 6.5, tab, 1.6], [len - 9.5, arm, 2.5], [-5.4, arm, 2.4]];
    const c = Math.cos(SEL_A * DEG), s = Math.sin(SEL_A * DEG);
    return loc.map(([x, y, r]) => [SEL[0] + x * c - y * s, SEL[1] + x * s + y * c, r]);
  };
  {
    const LW = 18.4; // lever plane (clears the receiver skin at w = 17)
    let left = profile(lever(23, 4.6, 2.8), { w: 2.2, cw: -LW, bevel: 0.6, curveSeg: 6 });
    const tc = [SEL[0] + 19.5 * Math.cos(SEL_A * DEG), SEL[1] + 19.5 * Math.sin(SEL_A * DEG)];
    left = cut(left, [sphere([tc[0], tc[1], -(LW + 1.1 + 14 - 0.45)], 14, { seg: 18 })]); // dished thumb tab
    sel.add(left, SKIN);
    sel.add(profile(lever(16, 3.4, 2.5), { w: 2.2, cw: LW, bevel: 0.6, curveSeg: 6 }), SKIN);
    const hub = latheW([[0, 0], [0, 5.0], [0.3, 5.2], [1.8, 5.2], [2.1, 4.9], [2.1, 0]], [SEL[0], SEL[1], HP + 0.95], 20);
    const head = latheW([[0, 0], [0, 3.2], [0.5, 3.1], [0.9, 2.4], [0.9, 0]], [SEL[0], SEL[1], LW + 1.05], 16);
    sel.add(both(hub), SKIN);
    sel.add(both(head), 'steel_dark');
  }

  // ---- trigger (pivot on the trigger pin); tip at t ≈ -67 leaves >10 mm above the guard bar
  const trig = g.part('trigger', { pivot: [106, -42, 0] });
  trig.add(profile('M 103 -46 L 110 -46 Q 106.6 -56 112.6 -64.6 Q 111.8 -68.2 108 -66.9 Q 100.8 -58 103 -46 Z', { w: 6.4, bevel: 0.9, curveSeg: 12 }), SKIN);
  trig.add(cyl(-3.4, 3.4, 2.4, { seg: 12 }).rotateY(-Math.PI / 2).translate(0, -42, -106), 'steel_dark');

  // ---- paddle magazine release between the guard and the magwell
  const latch = g.part('latch', { pivot: [155.3, -48, 0], extras: { rot: 'w', angle: 14 } });
  latch.add(profile('M 152.2 -48 L 158.2 -48 L 157.8 -55 Q 157.4 -64 154.6 -70.5 L 151.6 -69.6 Q 153.8 -62 153.4 -55 Z', { w: 13, bevel: 1, curveSeg: 10 }), SKIN);
  for (const [s, t, a] of [[153.2, -56.5, -4], [153.1, -59.8, -10], [152.7, -63.1, -18], [152.0, -66.3, -28]]) {
    latch.add(box([s, t, 0], [1.2, 1.3, 13.6], { r: 0.4, seg: 1, rot: [a, 0, 0] }), SKIN);
  }

  // ======================================================================================== STOCK
  // Lofted polymer stock: the nose repeats the receiver keyhole (tube on top, no ledges) for 15 mm, then morphs
  // into the rounded-square butt (34 -> 40 mm wide) with a crisp comb shoulder, a shallow dished flank panel
  // each side and the concave A2 underside.
  {
    const SST = [-201, -199.6, -184, -182, -178, -150, -118, -88, -70, -66, -60, -49, -38, -28, -19, -11, -4];
    const rings = SST.map((s) => ({ s, pts: stockRing(s) }));
    rings.push({ s: -1.2, pts: stockRing(-1.2, -0.5) }, { s: 0, pts: stockRing(0, -1.8) });
    g.add(ringLoft(rings), 'polymer');
    // yellow identification band near the butt (slightly proud of the moulding, chamfered edges)
    g.add(ringLoft([[-194, 0.05], [-193.5, 0.45], [-186.5, 0.45], [-186, 0.05]].map(([s, k]) => ({ s, pts: stockRing(s, k) })), { caps: false }), 'paint_yellow');
    // rubber butt pad: same section, inflated, rounded rear (plain: the stipple of the rubber reads on its own)
    // (the flat rear face is closed by concentric rings, not one fan, so the baked AO has no X-shaped streaks)
    const padRear = stockRing(-201.4, -2.4), pys = padRear.map((p) => p[1]), pmid = (Math.min(...pys) + Math.max(...pys)) / 2;
    const shrink = (f) => padRear.map(([w, t]) => [w * f, pmid + (t - pmid) * f]);
    g.add(ringLoft([...[[-215.4, 0.3], [-215.2, 0.7]].map(([s, f]) => ({ s, pts: shrink(f) })),
      ...[[-215, -2.4], [-213.6, -0.2], [-211, 0.9], [-201.4, 0.4]].map(([s, k]) => ({ s, pts: stockRing(-201.4, k) }))]), 'rubber');
    g.add(ringLoft([-202, -200.2].map((s) => ({ s, pts: stockRing(-201.4, 0.15) })), { caps: false }), 'polymer'); // butt cap rim
    // moulding parting line all round the centreline (comb and underside)
    // (bead centres on the loft's own ring stations, joined by straight spans: tension 0 keeps it on the surface)
    const topL = [], botL = [];
    for (const s of SST.slice(1)) { const r = stockRing(s); topL.push([s, r[36][1] - 0.1, 0]); botL.push([s, r[0][1] + 0.1, 0]); }
    g.add(sweep(topL, 0.42, { seg: 40, radial: 5, tension: 0 }), 'polymer');
    g.add(sweep(botL, 0.42, { seg: 40, radial: 5, tension: 0 }), 'polymer');
  }
  // stock lug wrapping the rear of the trigger housing (follows the swept-up lower edge)
  g.add(profile([[-8, -18.6, 1], [10.2, -18.6, 1], [10.2, -44.8, 2.5], [-8, -46.2, 2.5]], { w: HW + 0.6, bevel: 1.4, curveSeg: 5 }), 'polymer');
  // stock push pin (heads both sides) + housing pin through the lug
  g.add(pinPair(-9, 2, ringWAt(stockRing(-9), 2) + 0.1, 2.6, 0.9), 'steel_dark');
  g.add(pinPair(1, -33, (HW + 0.6) / 2, 2.4, 0.8), 'steel_dark');
  // rear sling loop on the left of the stock nose
  {
    const wl = ringWAt(stockRing(-18), 6);
    g.add(ring(-18, 5.6, 1.4, { t: 6, w: -wl - 3.6, axis: 't', seg: 20 }), SKIN);
    g.add(box([-18, 6, -wl - 0.6], [11, 7, 3], { r: 1.2, seg: 1 }), SKIN);
  }

  // ======================================================================================== BOLT / COCKING LEVER
  const bolt = g.part('bolt', { pivot: [398, TT, -29], extras: { travel: 0.09 } });
  // folding cocking lever in the slot on the left of the cocking tube, knurled vertical knob
  bolt.add(plan([[383.5, -6.5, 1], [391.5, -6.5, 1], [400.5, -24.5, 2], [393.5, -27.5, 2]], { h: 4.6, ct: TT, bevel: 0.9, curveSeg: 4 }), SKIN);
  bolt.add(latheT([[-9, 0], [-9, 4.6], [-8, 5.6], [-3.2, 5.6], [-2.6, 5.1], [-2, 5.6], [2, 5.6], [2.6, 5.1], [3.2, 5.6], [8, 5.6], [9, 4.6], [9, 0]], [398, TT, -29], 20), 'steel');
  bolt.add(box([388.5, TT, -8], [10, 4.8, 4], { r: 0.6, seg: 1 }), 'steel');     // cocking piece in the slot
  // bolt group seen through the ejection port (dull phosphate; bright only on the face bevel and extractor claw)
  bolt.add(lathe([[196, 0], [196, 9.6], [229.2, 9.6], [229.2, 0]], { seg: 24 }), 'steel');
  bolt.add(lathe([[229.2, 0], [229.2, 9.6], [229.6, 9.45], [231, 8.4], [231, 0]], { seg: 24 }), 'steel_bright');
  bolt.add(section([[-12.5, -10, 2], [12.5, -10, 2], [12.5, 12, 3], [-12.5, 12, 3]], 110, 197, { bevel: 0.6, curveSeg: 4 }), 'steel');
  bolt.add(box([218.5, 6.8, 8.6], [14, 3, 3.4], { r: 0.6, seg: 1 }), 'steel');           // extractor
  bolt.add(box([227.6, 6.6, 8.8], [3.4, 2.6, 2.6], { r: 0.5, seg: 1 }), 'steel_bright');  // extractor claw
  for (const w of [10.2, -10.2]) bolt.add(latheT([[-4, 0], [-4, 2.6], [-3.4, 3], [3.4, 3], [4, 2.6], [4, 0]], [224, 0, w], 14), 'steel_dark'); // locking rollers

  // ======================================================================================== MAGAZINE
  const mag = g.part('mag', { pivot: [184, -19, 0], extras: { drop: true } });
  mag.add(profile('M 166 -21 L 202 -21 L 202.4 -50 C 203.5 -100 212 -150 234 -189 L 201 -204 C 182 -166 168.5 -110 166.6 -50 Z', { w: 24, bevel: 1.6, bevelSeg: 2, curveSeg: 18 }), SKIN);
  // pressed stiffening ribs following the curve
  mag.add(profile('M 181.5 -58 L 187.5 -58 C 188.5 -105 195 -155 213 -192 L 208 -194.5 C 190.5 -157 183 -105 181.5 -58 Z', { w: 25.2, bevel: 0.5, curveSeg: 14 }), SKIN);
  mag.add(profile('M 196.5 -62 L 199.5 -62 C 200.5 -105 207 -145 221.5 -177 L 218.5 -178.5 C 204 -146 197.5 -105 196.5 -62 Z', { w: 24.9, bevel: 0.4, curveSeg: 12 }), SKIN);
  // floor plate (perpendicular to the curved body) with a lock dimple
  {
    const d = [0.447, -0.894], e = [0.91, 0.41];
    const P = (b, ke, kd) => [b[0] + e[0] * ke + d[0] * kd, b[1] + e[1] * ke + d[1] * kd];
    const R0 = [201, -204], F0 = [234, -189];
    mag.add(profile([[...P(R0, -1.6, -2.5), 1], [...P(F0, 1.6, -2.5), 1], [...P(F0, 2.2, 3.2), 1.6], [...P(R0, -1.6, 4.2), 1.6]], { w: 26.4, bevel: 1.2, curveSeg: 4 }), SKIN);
    const c = P([217.5, -196.5], 0, 4.2);
    mag.add(xform(latheT([[0, 0], [0, 3.4], [0.7, 3.0], [1.0, 0]], [0, 0, 0], 16), { rot: [26.6, 0, 0] }).translate(0, c[1], -c[0]), SKIN);
  }
  // feed lips and the top cartridge (9x19)
  const lipR = [[9.6, -22.5], [12, -22.5], [12, -17.5, 1.6], [8.4, -14.2, 1.1], [6.4, -14.6], [7.2, -16.1], [9.6, -17.2]];
  mag.add(section(lipR, 166.5, 194, { bevel: 0.5, curveSeg: 4 }), 'steel_dark');
  mag.add(mirrorW(section(lipR, 166.5, 194, { bevel: 0.5, curveSeg: 4 })), 'steel_dark');
  mag.add(lathe([[168, 0], [168, 4.6], [168.6, 4.95], [169.6, 4.95], [169.8, 4.4], [170.6, 4.4], [170.9, 4.85], [187, 4.75], [187.2, 4.5], [187.2, 0]], { t: -19, w: 2.6, seg: 18 }), 'brass');
  mag.add(lathe([[187.1, 0], [187.1, 4.5], [190.5, 4.45], [194.5, 3.6], [197, 2.2], [197.7, 0]], { t: -19, w: 2.6, seg: 18 }), 'copper');

  // ======================================================================================== SOCKETS / META
  g.socket('muzzle', [465, 0, 0]);
  g.socket('eject', [207, 3, RW], { dir: [0.6, 0.35, 1] });
  g.socket('grip_r', [57.3, -89.5, 0], { rot: [0, 0, -15] });
  g.socket('grip_l', [345, -14, 0]);
  g.socket('magwell', [190, -72, 0]);
  g.socket('charge', [398, TT, -29]);
  g.socket('sight_rear', [RS, SIGHT_T, 0]);
  g.socket('sight_front', [406.5, SIGHT_T, 0]);
  g.meta({
    grip: 'rifle', support: 'handguard', reload: 'mag_curved', chargeSide: 'left',
    notes: 'Non-reciprocating cocking lever on the left front of the cocking tube: bolt part slides back 90 mm '
      + '(lever + bolt group seen through the port) and can be "slapped" forward. Paddle mag release = latch part '
      + '(rotates about w, front edge down). Selector rotates about w; the model rests on semi (lever at 62 deg): '
      + '+53 deg = safe (up/back), -57 deg = auto (forward).',
  });

  // ---- wear: black paint over phosphate keeps its flats; only crisp edges chip, more where hands and mags rub
  const edge = (v, k) => k * smooth((v - 0.7) / 0.3);
  const inRect = ([a0, b0, a1, b1], s, t, m = 0) => s > a0 - m && s < a1 + m && t > b0 - m && t < b1 + m;
  // marking inserts: no wear (the struck floors carry the lettering; glints on 0.7 mm strokes only smear)
  const onMark = (s, t, w) => [[markL, -1], [markR, 1]].some(([mk, sg]) => w * sg > RW - 0.6 && inRect(mk.rect, s, t, 0.15));
  const rules = {
    ['body:' + SKIN]: (s, t, w, v) => (onMark(s, t, w) ? 0
      : edge(v, s > 388 ? 0.42 : Math.abs(s - RS) < 16 && t > 26 ? 0.3 : t < -47 && s > 150 && s < 214 ? 0.5 : 0.34)),
    'body:steel_dark': (s, t, w, v) => edge(v, s > 430 ? 0.75 : 0.45),
    'body:steel': () => 0, // letter floors
    'body:steel_bright': (s, t, w, v) => v * 0.8,
    '*:paint_yellow': (s, t, w, v) => edge(v, 0.16),
    '*:paint_red': (s, t, w, v) => edge(v, 0.1),
    '*:paint_white': (s, t, w, v) => edge(v, 0.1),
    ['mag:' + SKIN]: (s, t, w, v) => edge(v, (s - 201) * 0.447 - (t + 204) * 0.894 > -3 ? 0.42 : t > -40 ? 0.45 : 0.28), // floor plate, feed end
    'mag:steel_dark': (s, t, w, v) => edge(v, 0.7),
    ['selector:' + SKIN]: (s, t, w, v) => edge(v, 0.42),
    'selector:steel_dark': (s, t, w, v) => edge(v, 0.5),
    ['bolt:' + SKIN]: (s, t, w, v) => edge(v, 0.62),
    'bolt:steel': (s, t, w, v) => edge(v, 0.45),
    ['trigger:' + SKIN]: (s, t, w, v) => edge(v, 0.3),
    ['latch:' + SKIN]: (s, t, w, v) => edge(v, 0.35),
    // polymer: scuffs on the grip / handguard edges; the stock's comb shoulder and parting bead would read as dashes
    'body:polymer': (s, t, w, v) => edge(v, s >= 0 ? 0.6 : Math.abs(w) < 1.2 ? 0.2 : 0.32),
  };
  const build0 = g.build.bind(g);
  // letter floors: the 0.3 mm grooves would trace almost fully occluded; keep them readable as struck grey metal
  const aoRules = { 'body:steel': () => 0.72 };
  g.build = (opts) => { const root = build0(opts); tuneWear(g, root, rules, aoRules); return root; };
  return g;
}
