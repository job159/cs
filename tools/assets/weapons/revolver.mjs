// 蝮蛇 Viper .44 — N-frame-pattern double-action .44 Magnum revolver (S&W Model 29 archetype) with a 6.5"
// full-lug barrel, ventilated rib, adjustable rear sight, fluted 6-shot cylinder and checkered wood target stocks.
//
// Side view, mm: s forward from the breech face (rear of the cylinder window), t up from the bore axis,
// w right. Real dimensions: OAL 305, barrel 165 (cylinder face -> muzzle), cylinder Ø44 x 42, 6 chambers.
// Moving parts: crane (swings the cylinder out to the LEFT on a hinge below it) > cylinder (spins on its axis)
// > ejector (star + rod, pushes back) / shell (6 cartridges); hammer; trigger.
//
// Local helpers (loft, true-radius fillets, cap-preserving normals, cut-in checkering / roll marks) live in this
// file: the kit has none of them.
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshBVH } from 'three-mesh-bvh';
import { Brush, Evaluator, SUBTRACTION, ADDITION, INTERSECTION } from 'three-bvh-csg';
import {
  Gun, V, DEG, makeShape, circle, profile, section, lathe, cyl, box, screw, cut, intersect, cutters, merge, xform,
} from '../lib/gunkit.mjs';

// ------------------------------------------------------------------------------------------ key dimensions
const FW = 10.5;            // frame half width
const TOP = 16.6;           // topstrap / rib top
const CYL_T = -14.6;        // cylinder axis height (top chamber on the bore axis)
const CYL_R = 22;           // cylinder radius (Ø44)
const CH_R = 14.6;          // chamber bolt-circle radius
const CYL_S0 = 0.3, CYL_S1 = 42.6;   // cylinder rear / front faces (0.3 gap to the recoil shield)
const FF = 57.5;            // frame front face
const MUZ = CYL_S1 + 165;   // 207.6 muzzle (165 mm barrel)
const SIGHT_T = 22.2;       // sight line height (rear notch bottom = front blade top)
const BR = 9.8;             // barrel radius (round top)
const FLAT = 9.3;           // barrel side flats = full-lug half width
const HAM = [-30, -14];     // hammer pin
const TRG = [-4, -42];      // trigger pin
const HINGE = [50, -41.5, -6.0]; // crane hinge axis (s, t, w); close enough to the bore line that the cylinder clears the topstrap as it swings
const CRANE_OPEN = 85;
const MARK = 'steel_dark';  // matte floor of the stamped roll marks (stamped steel does not take the polish)      // degrees about +z (three) = cylinder swings to the left
const R_ARM = 32.4;         // crane top edge = arc about the hinge, so the yoke clears the frame while it swings
// recoil shield: rear shoulder profile (s, r about the cylinder axis); front face flush with the breech face
const SHIELD = [[-11.6, 10.0], [-10.2, 13.6], [-8.6, 17.2], [-7.2, 19.8], [-6.0, 21.1], [-4.8, 21.5]];

// chamber centres (w, t) — chamber 0 is at 12 o'clock on the bore axis
const CHAMBERS = [...Array(6)].map((_, k) => {
  const a = (90 + 60 * k) * DEG;
  return [CH_R * Math.cos(a), CYL_T + CH_R * Math.sin(a)];
});

// ------------------------------------------------------------------------------------------ local helpers

const P3 = (p) => V(p[0], p[1], p[2]);
const T3 = (x, y, z) => new THREE.Vector3(x, y, z); // three-space direction
const FWD = () => T3(0, 0, -1), BACK = () => T3(0, 0, 1), UP = () => T3(0, 1, 0), RIGHT = () => T3(1, 0, 0), LEFT = () => T3(-1, 0, 0);

/** Builds a non-indexed geometry from three-space triangles. */
function triGeo(tris, creaseDeg = 40) {
  const pos = new Float32Array(tris.length * 9);
  let o = 0;
  for (const tri of tris) for (const p of tri) { pos[o++] = p.x; pos[o++] = p.y; pos[o++] = p.z; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return toCreasedNormals(g, creaseDeg * DEG);
}
const triNormal = (a, b, c) => new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
/** Pushes triangle (a, b, c), flipped if needed so its normal points along `out`. */
function pushTri(list, a, b, c, out) {
  if (triNormal(a, b, c).dot(out) >= 0) list.push([a, b, c]); else list.push([a, c, b]);
}

/** Cleans a three primitive (indexed, uv) into the kit's format (non-indexed position+normal). */
function clean(geo, creaseDeg = 30) {
  for (const k of Object.keys(geo.attributes)) if (k !== 'position') geo.deleteAttribute(k);
  const g = geo.index ? geo.toNonIndexed() : geo;
  return toCreasedNormals(g, creaseDeg * DEG);
}

const AXES = { x: T3(1, 0, 0), y: T3(0, 1, 0), z: T3(0, 0, 1) };
/**
 * Normals that keep big planar faces flat. Faces whose normal lies within `tol` deg of one of `axes` (±) keep
 * their face normal; a bevel vertex that touches such a face takes the flat normal too (the round starts tangent),
 * every other vertex is smoothed (area weighted) with its non-flat neighbours inside `crease`.
 * The kit's creased normals blend the flat cap into the first bevel band, and the long CSG / earcut slivers of the
 * cap then interpolate that tilted normal (and the edge wear the bake derives from it) across the face -> the
 * bright/dark sawtooth along bevels.
 */
function flatNormals(geo, axes = ['x'], { tol = 2, crease = 42 } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position.array;
  const nt = pos.length / 9;
  const fn = new Float64Array(nt * 3), un = new Float64Array(nt * 3), flat = new Uint8Array(nt);
  const ax = axes.map((a) => (typeof a === 'string' ? AXES[a] : a.clone().normalize()));
  const cTol = Math.cos(tol * DEG), cCr = Math.cos(crease * DEG);
  const map = new Map();
  const key = (i) => `${Math.round(pos[i * 3] * 500)},${Math.round(pos[i * 3 + 1] * 500)},${Math.round(pos[i * 3 + 2] * 500)}`;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let t = 0; t < nt; t++) {
    a.fromArray(pos, t * 9); b.fromArray(pos, t * 9 + 3); c.fromArray(pos, t * 9 + 6);
    n.subVectors(b, a).cross(c.sub(a));
    fn[t * 3] = n.x; fn[t * 3 + 1] = n.y; fn[t * 3 + 2] = n.z;
    const l = n.length();
    if (l > 1e-12) {
      n.divideScalar(l);
      un[t * 3] = n.x; un[t * 3 + 1] = n.y; un[t * 3 + 2] = n.z;
      flat[t] = ax.some((v) => Math.abs(n.dot(v)) > cTol) ? 1 : 0;
    } else { un[t * 3 + 1] = 1; flat[t] = 2; }
    for (let k = 0; k < 3; k++) { const kk = key(t * 3 + k); let L = map.get(kk); if (!L) map.set(kk, (L = [])); L.push(t); }
  }
  const nor = new Float32Array(pos.length);
  for (let t = 0; t < nt; t++) {
    const ux = un[t * 3], uy = un[t * 3 + 1], uz = un[t * 3 + 2];
    for (let k = 0; k < 3; k++) {
      let x = ux, y = uy, z = uz;
      if (!flat[t]) {
        x = y = z = 0;
        let snap = -1, best = cCr;
        for (const j of map.get(key(t * 3 + k))) {
          if (flat[j] !== 1) continue;
          const d = un[j * 3] * ux + un[j * 3 + 1] * uy + un[j * 3 + 2] * uz;
          if (d > best) { best = d; snap = j; }
        }
        if (snap >= 0) { x = un[snap * 3]; y = un[snap * 3 + 1]; z = un[snap * 3 + 2]; }
        else for (const j of map.get(key(t * 3 + k))) {
          if (flat[j]) continue;
          if (un[j * 3] * ux + un[j * 3 + 1] * uy + un[j * 3 + 2] * uz < cCr) continue;
          x += fn[j * 3]; y += fn[j * 3 + 1]; z += fn[j * 3 + 2];
        }
        const l = Math.hypot(x, y, z);
        if (l < 1e-12) { x = ux; y = uy; z = uz; } else { x /= l; y /= l; z /= l; }
      }
      nor[(t * 3 + k) * 3] = x; nor[(t * 3 + k) * 3 + 1] = y; nor[(t * 3 + k) * 3 + 2] = z;
    }
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return g;
}

/**
 * Polygon with circular fillets: [[s, t, r?], ...] -> [[s, t], ...]. As in the kit, r is how far the round runs
 * along each edge (capped at half the edge), so nearly straight corners become long gentle arcs.
 */
function filletPoly(pts, segLen = 1.1) {
  const n = pts.length, out = [];
  for (let k = 0; k < n; k++) {
    const [x, y, r = 0] = pts[k];
    if (!r) { out.push([x, y]); continue; }
    const [px, py] = pts[(k - 1 + n) % n], [nx, ny] = pts[(k + 1) % n];
    let ux = px - x, uy = py - y, vx = nx - x, vy = ny - y;
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    ux /= lu; uy /= lu; vx /= lv; vy /= lv;
    const th = Math.acos(Math.max(-1, Math.min(1, ux * vx + uy * vy)));
    if (th < 1e-3 || Math.PI - th < 1e-3) { out.push([x, y]); continue; }
    const d = Math.min(r, lu * 0.5, lv * 0.5), rr = d * Math.tan(th / 2);
    let bx = ux + vx, by = uy + vy;
    const lb = Math.hypot(bx, by); bx /= lb; by /= lb;
    const h = rr / Math.sin(th / 2), cx = x + bx * h, cy = y + by * h;
    const a0 = Math.atan2(y + uy * d - cy, x + ux * d - cx), a1 = Math.atan2(y + vy * d - cy, x + vx * d - cx);
    let da = a1 - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    const seg = Math.max(2, Math.min(18, Math.ceil((Math.abs(da) * rr) / segLen), Math.ceil(Math.abs(da) / (12 * DEG))));
    for (let i = 0; i <= seg; i++) { const a = a0 + (da * i) / seg; out.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); }
  }
  return out;
}

// --- CSG that keeps the input normals (the kit's cut() recomputes creased normals, which facets CSG slivers)
const EVK = new Evaluator();
EVK.attributes = ['position', 'normal'];
EVK.useGroups = false;
EVK.useCDTClipping = true; // constrained Delaunay re-triangulation: well-shaped triangles instead of sliver fans
function brushK(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  const b = new Brush(g);
  b.updateMatrixWorld();
  return b;
}
function csgK(a, others, op) {
  let r = brushK(a);
  for (const c of [].concat(others)) r = EVK.evaluate(r, brushK(c), op);
  const g = r.geometry.index ? r.geometry.toNonIndexed() : r.geometry;
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) { const l = Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) || 1; n.setXYZ(i, n.getX(i) / l, n.getY(i) / l, n.getZ(i) / l); }
  return g;
}
const cutK = (a, c) => csgK(a, c, SUBTRACTION);
const unionK = (a, c) => csgK(a, c, ADDITION);
const intersectK = (a, c) => csgK(a, c, INTERSECTION);

/**
 * Side-view extrusion (replaces the kit's profile() where shading matters) with analytic normals:
 * flat caps, a true quarter-round bevel that starts tangent to the cap and ends tangent to the wall, smooth walls
 * (sharp only at unfilleted corners). Extra vertex rings `rim` mm inside each cap edge and `edge` mm inside each wall
 * edge keep the bake's per-vertex edge wear in a thin strip next to the bevel instead of smearing it along the
 * cap / wall triangles (the old sawtooth). outer / holes: [[s, t], ...] polygons (any winding).
 */
function extrudeW(outer, holes = [], { w = 20, cw = 0, bevel = 1, bevelSeg = 3, rim = 0.6, edge = 0.4, sharp = 35, axis = 'w' } = {}) {
  const H = w / 2, b = Math.max(0, Math.min(bevel, H - 0.05));
  const area = (P) => { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return a; };
  const dedupe = (P) => P.filter((p, i) => { const q = P[(i + 1) % P.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-4; });
  const contours = [dedupe(area(outer) > 0 ? outer : [...outer].reverse()), ...holes.map((h) => dedupe(area(h) < 0 ? h : [...h].reverse()))];
  const cosSharp = Math.cos(sharp * DEG);
  // per contour: point, inward miter (unit offset per mm), outward edge normals, sharpness
  const C = contours.map((P) => {
    const n = P.length;
    const edgeN = P.map((p, i) => { const q = P[(i + 1) % n]; const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy); return [dy / l, -dx / l]; }); // outward (right)
    const pts = P.map((p, i) => {
      const e0 = edgeN[(i - 1 + n) % n], e1 = edgeN[i];
      let mx = -(e0[0] + e1[0]), my = -(e0[1] + e1[1]);
      const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
      const k = 1 / Math.max(0.3, -(mx * e1[0] + my * e1[1]));
      const sh = e0[0] * e1[0] + e0[1] * e1[1] < cosSharp;
      return { p, m: [mx * k, my * k], vn: [-mx, -my], sh };
    });
    return { pts, edgeN };
  });
  const inset = (c, i, d) => { const { p, m } = c.pts[i]; return [p[0] + m[0] * d, p[1] + m[1] * d]; };
  // inset contour with reversed (swallow-tail) runs collapsed so it stays simple
  const insetLoop = (c, d) => {
    const n = c.pts.length, Q = c.pts.map((_, i) => inset(c, i, d));
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, P0 = c.pts[i].p, P1 = c.pts[j].p;
        if ((Q[j][0] - Q[i][0]) * (P1[0] - P0[0]) + (Q[j][1] - Q[i][1]) * (P1[1] - P0[1]) < 0) {
          const mx = (Q[i][0] + Q[j][0]) / 2, my = (Q[i][1] + Q[j][1]) / 2;
          Q[i] = [mx, my]; Q[j] = [mx, my];
        }
      }
    }
    return Q;
  };
  const tris = [];
  // axis 'w': outline in (s, t), depth along w centred on cw.  axis 's': outline in (w, t), depth along s centred on cw.
  const X = axis === 'w' ? T3(1, 0, 0) : T3(0, 0, -1);
  const P = axis === 'w' ? (q, z) => V(q[0], q[1], cw + z) : (q, z) => V(cw + z, q[1], q[0]);
  const N = axis === 'w' ? (nx, ny, nz) => new THREE.Vector3(nz, ny, -nx) : (nx, ny, nz) => new THREE.Vector3(nx, ny, -nz);
  const push = (a, b2, c, na, nb, nc, out) => {
    if (triNormal(a, b2, c).dot(out) >= 0) tris.push([a, b2, c, na, nb, nc]); else tris.push([a, c, b2, na, nc, nb]);
  };
  // rings from the +w cap edge round the wall to the -w cap edge: [inset, z, capWeight, wallWeight]
  const rings = [];
  for (let j = 0; j <= bevelSeg; j++) { const f = (j / bevelSeg) * Math.PI / 2; rings.push([b * (1 - Math.sin(f)), H - b * (1 - Math.cos(f)), Math.cos(f), Math.sin(f)]); }
  if (edge > 0 && H - b - edge > 0.05) { rings.push([0, H - b - edge, 0, 1]); rings.push([0, -(H - b - edge), 0, 1]); }
  for (let j = bevelSeg; j >= 0; j--) { const f = (j / bevelSeg) * Math.PI / 2; rings.push([b * (1 - Math.sin(f)), -(H - b * (1 - Math.cos(f))), -Math.cos(f), Math.sin(f)]); }
  for (const c of C) {
    const n = c.pts.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, en = c.edgeN[i];
      const wn = (k) => (c.pts[k].sh ? en : c.pts[k].vn);
      for (let r = 0; r + 1 < rings.length; r++) {
        const [d0, z0, cz0, cw0] = rings[r], [d1, z1, cz1, cw1] = rings[r + 1];
        const nrm = (k, cz, cww) => { const v = wn(k); return N(v[0] * cww, v[1] * cww, cz).normalize(); };
        const A = P(inset(c, i, d0), z0), B = P(inset(c, j, d0), z0), Cc = P(inset(c, j, d1), z1), D = P(inset(c, i, d1), z1);
        const nA = nrm(i, cz0, cw0), nB = nrm(j, cz0, cw0), nC = nrm(j, cz1, cw1), nD = nrm(i, cz1, cw1);
        const out = nA.clone().add(nB).add(nC).add(nD);
        push(A, B, Cc, nA, nB, nC, out);
        push(A, Cc, D, nA, nC, nD, out);
      }
    }
  }
  // caps: rim strip + earcut interior
  for (const sg of [1, -1]) {
    const z = sg * H, nc = X.clone().multiplyScalar(sg);
    const inner = C.map((c) => insetLoop(c, b + rim));
    if (rim > 0) C.forEach((c, ci) => {
      const n = c.pts.length;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const A = P(inset(c, i, b), z), B = P(inset(c, j, b), z), Cc = P(inner[ci][j], z), D = P(inner[ci][i], z);
        push(A, B, Cc, nc, nc, nc, nc); push(A, Cc, D, nc, nc, nc, nc);
      }
    });
    const loops = (rim > 0 ? inner : C.map((c) => c.pts.map((_, i) => inset(c, i, b)))).map(dedupe);
    const f = THREE.ShapeUtils.triangulateShape(loops[0].map(([x, y]) => new THREE.Vector2(x, y)), loops.slice(1).map((h) => h.map(([x, y]) => new THREE.Vector2(x, y))));
    const all = loops.flat();
    for (const [a, b2, c] of f) push(P(all[a], z), P(all[b2], z), P(all[c], z), nc, nc, nc, nc);
  }
  const pos = new Float32Array(tris.length * 9), nor = new Float32Array(tris.length * 9);
  let o = 0;
  for (const [a, b2, c, na, nb, nc] of tris) {
    for (const [p, q] of [[a, na], [b2, nb], [c, nc]]) { pos[o] = p.x; pos[o + 1] = p.y; pos[o + 2] = p.z; nor[o] = q.x; nor[o + 1] = q.y; nor[o + 2] = q.z; o += 3; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return g;
}

/** Smooth 1D interpolation through [x, y] control points (cubic Hermite, Catmull-Rom tangents). */
function spline(pts) {
  return (x) => {
    if (x <= pts[0][0]) return pts[0][1];
    if (x >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
    let i = 0;
    while (x > pts[i + 1][0]) i++;
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const tan = (k) => {
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
      return (b[1] - a[1]) / (b[0] - a[0]);
    };
    const h = x1 - x0, u = (x - x0) / h;
    const m0 = tan(i) * h, m1 = tan(i + 1) * h;
    const u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * y0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * y1 + (u3 - u2) * m1;
  };
}
const smin = (a, b, k) => (a + b - Math.sqrt((a - b) * (a - b) + k * k)) / 2;

/** Polygon offset (outward for d > 0) of a kit shape spec, returned as [[s, t], ...]. */
function offsetOutline(spec, d, div = 8) {
  let pts = makeShape(spec).getPoints(div).map((p) => [p.x, p.y]);
  pts = pts.filter((p, i) => { const q = pts[(i + 1) % pts.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-4; });
  let area = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const sg = area > 0 ? 1 : -1; // CCW -> outward normal is (dy, -dx)
  return pts.map((p, i) => {
    const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length];
    const n1 = [(p[1] - a[1]), -(p[0] - a[0])], n2 = [(b[1] - p[1]), -(b[0] - p[0])];
    const l1 = Math.hypot(...n1) || 1, l2 = Math.hypot(...n2) || 1;
    let nx = n1[0] / l1 + n2[0] / l2, ny = n1[1] / l1 + n2[1] / l2;
    const ln = Math.hypot(nx, ny) || 1;
    nx /= ln; ny /= ln;
    const cosHalf = Math.max(0.5, (n1[0] * nx + n1[1] * ny) / l1);
    return [p[0] + sg * nx * d / cosHalf, p[1] + sg * ny * d / cosHalf];
  });
}

/** Lathe-made part re-oriented so its +s axis points along `n` (three vector), placed at `p` (three). */
function orientTo(geo, p, n) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), n.clone().normalize());
  geo.applyQuaternion(q);
  geo.translate(p.x, p.y, p.z);
  return geo;
}

/** Slotted screw head on face 'w' | '-w' | 't'. */
function slotScrew(c, r, face = 'w', ang = 0, depth = 0.9) {
  const head = screw(c, r, { face, depth });
  const [s, t, w] = c;
  let slot;
  if (face === 'w' || face === '-w') {
    const sg = face === 'w' ? 1 : -1;
    slot = box([s, t, w + sg * depth], [r * 2.6, Math.max(0.45, r * 0.26), depth * 1.1], { r: 0, rot: [ang, 0, 0] });
  } else {
    slot = box([s, t + depth, w], [r * 2.6, depth * 1.1, Math.max(0.45, r * 0.26)], { r: 0, rot: [0, ang, 0] });
  }
  return cut(head, slot);
}

/**
 * Loft along s: ringAt(s) -> closed loop of [w, t] (same count and winding at every station), capped at both ends.
 */
function loftS(stations, ringAt) {
  const rings = stations.map((s) => ringAt(s).map(([w, t]) => V(s, t, w)));
  const N = rings[0].length;
  const mid = ringAt(stations[stations.length >> 1]);
  let area = 0;
  for (let i = 0; i < mid.length; i++) { const p = mid[i], q = mid[(i + 1) % mid.length]; area += p[0] * q[1] - q[0] * p[1]; }
  const flip = area > 0;
  const tris = [];
  for (let k = 0; k + 1 < rings.length; k++) {
    for (let i = 0; i < N; i++) {
      const a = rings[k][i], b = rings[k][(i + 1) % N], c = rings[k + 1][(i + 1) % N], d = rings[k + 1][i];
      if (!flip) { tris.push([a, b, c], [a, c, d]); } else { tris.push([a, c, b], [a, d, c]); }
    }
  }
  for (const [k, out] of [[0, BACK()], [rings.length - 1, FWD()]]) {
    const R = rings[k];
    const cen = R.reduce((acc, p) => acc.add(p), new THREE.Vector3()).multiplyScalar(1 / N);
    for (let i = 0; i < N; i++) pushTri(tris, cen, R[i], R[(i + 1) % N], out);
  }
  const pos = new Float32Array(tris.length * 9);
  let o = 0;
  for (const tri of tris) for (const p of tri) { pos[o++] = p.x; pos[o++] = p.y; pos[o++] = p.z; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return g;
}

// --- tiny stroke font for roll marks (4 x 6 grid)
const FONT = {
  A: [[0, 0, 2, 6], [2, 6, 4, 0], [0.9, 2.3, 3.1, 2.3]],
  C: [[4, 5, 3, 6], [3, 6, 1, 6], [1, 6, 0, 5], [0, 5, 0, 1], [0, 1, 1, 0], [1, 0, 3, 0], [3, 0, 4, 1]],
  E: [[0, 0, 0, 6], [0, 6, 4, 6], [0, 3, 3, 3], [0, 0, 4, 0]],
  G: [[4, 5, 3, 6], [3, 6, 1, 6], [1, 6, 0, 5], [0, 5, 0, 1], [0, 1, 1, 0], [1, 0, 3, 0], [3, 0, 4, 1], [4, 1, 4, 3], [4, 3, 2.2, 3]],
  I: [[2, 0, 2, 6], [1, 0, 3, 0], [1, 6, 3, 6]],
  L: [[0, 6, 0, 0], [0, 0, 4, 0]],
  M: [[0, 0, 0, 6], [0, 6, 2, 2.4], [2, 2.4, 4, 6], [4, 6, 4, 0]],
  N: [[0, 0, 0, 6], [0, 6, 4, 0], [4, 0, 4, 6]],
  O: [[1, 0, 3, 0], [3, 0, 4, 1], [4, 1, 4, 5], [4, 5, 3, 6], [3, 6, 1, 6], [1, 6, 0, 5], [0, 5, 0, 1], [0, 1, 1, 0]],
  P: [[0, 0, 0, 6], [0, 6, 3, 6], [3, 6, 4, 5], [4, 5, 4, 4], [4, 4, 3, 3], [3, 3, 0, 3]],
  R: [[0, 0, 0, 6], [0, 6, 3, 6], [3, 6, 4, 5], [4, 5, 4, 4], [4, 4, 3, 3], [3, 3, 0, 3], [2, 3, 4, 0]],
  S: [[4, 5, 3, 6], [3, 6, 1, 6], [1, 6, 0, 5], [0, 5, 0, 4], [0, 4, 1, 3], [1, 3, 3, 3], [3, 3, 4, 2], [4, 2, 4, 1], [4, 1, 3, 0], [3, 0, 1, 0], [1, 0, 0, 1]],
  T: [[0, 6, 4, 6], [2, 6, 2, 0]],
  U: [[0, 6, 0, 1], [0, 1, 1, 0], [1, 0, 3, 0], [3, 0, 4, 1], [4, 1, 4, 6]],
  V: [[0, 6, 2, 0], [2, 0, 4, 6]],
  Y: [[0, 6, 2, 3], [4, 6, 2, 3], [2, 3, 2, 0]],
  4: [[3, 0, 3, 6], [3, 6, 0, 2], [0, 2, 4, 2]],
  '.': [[1.7, 0, 2.1, 0]],
  '-': [[0.6, 3, 3.4, 3]],
  ' ': [],
};

/** Box along segment p0 -> p1 (three vectors) on a surface with normal en, from `depth` below to `above` above it. */
function strokeBox(p0, p1, en, width, depth, above) {
  const dir = new THREE.Vector3().subVectors(p1, p0);
  const len = dir.length();
  dir.normalize();
  const perp = new THREE.Vector3().crossVectors(en, dir).normalize();
  const g = new THREE.BoxGeometry(len + width, width, depth + above);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(dir, perp, en));
  const c = p0.clone().add(p1).multiplyScalar(0.5).addScaledVector(en, (above - depth) / 2);
  g.translate(c.x, c.y, c.z);
  return clean(g);
}

/** Stroke segments of a string. o = left-bottom origin (three), ex = reading direction, ey = up. */
function textSegs(str, { o, ex, ey, h = 3, align = 'left' }) {
  const u = h / 6, adv = 5.7 * u;
  const width = [...str].reduce((a, ch) => a + (ch === ' ' ? 4 * u : adv), 0) - 1.7 * u;
  let x = align === 'center' ? -width / 2 : 0;
  const segs = [];
  for (const ch of str) {
    for (const [x0, y0, x1, y1] of FONT[ch] || []) {
      segs.push([o.clone().addScaledVector(ex, x + x0 * u).addScaledVector(ey, y0 * u), o.clone().addScaledVector(ex, x + x1 * u).addScaledVector(ey, y1 * u)]);
    }
    x += ch === ' ' ? 4 * u : adv;
  }
  return segs;
}

/** Original maker's emblem (a ring with a fanged "V") as stroke segments [p0, p1, widthScale]. */
function emblemSegs(o, ex, ey, r = 3.2) {
  const P = (a, b) => o.clone().addScaledVector(ex, a).addScaledVector(ey, b);
  const segs = [];
  const n = 18;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    segs.push([P(r * Math.cos(a0), r * Math.sin(a0)), P(r * Math.cos(a1), r * Math.sin(a1)), 1]);
  }
  const k = r * 0.62;
  segs.push([P(-k, k * 0.75), P(0, -k * 0.95), 1.1], [P(k, k * 0.75), P(0, -k * 0.95), 1.1], [P(-k * 0.45, k * 0.75), P(k * 0.45, k * 0.75), 0.9]);
  return segs;
}
/** Raised emblem (grip medallions). */
function emblem(o, ex, ey, en, r = 3.2, stroke = 0.38) {
  return merge(emblemSegs(o, ex, ey, r).map(([a, b, k]) => strokeBox(a, b, en, stroke * k, 0.04, 0.12)));
}
/** Keeps the triangles of a non-indexed geometry for which keep(centroid) is true. */
function filterTris(geo, keep) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const P = g.attributes.position.array, N = g.attributes.normal?.array;
  const op = [], on = [];
  const c = new THREE.Vector3();
  for (let i = 0; i < P.length; i += 9) {
    c.set((P[i] + P[i + 3] + P[i + 6]) / 3, (P[i + 1] + P[i + 4] + P[i + 7]) / 3, (P[i + 2] + P[i + 5] + P[i + 8]) / 3);
    if (!keep(c)) continue;
    for (let k = 0; k < 9; k++) { op.push(P[i + k]); if (N) on.push(N[i + k]); }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(op, 3));
  if (N) out.setAttribute('normal', new THREE.Float32BufferAttribute(on, 3));
  return out;
}

/**
 * Engraved strokes as explicit geometry (no CSG): signed distance of the stroke boxes on a fine grid -> marching
 * squares -> simplified loops (stroke outlines CCW, counters CW) -> top sheet with holes + groove walls + floor.
 * segs: [[x0, y0, x1, y1, width], ...] in plane coordinates; rect = [x0, y0, x1, y1] of the sheet.
 * Returns triangles in plane space (x, y, z) with the sheet at z = 0 and the floor at z = -depth.
 */
function engraveTris(segs, rect, depth, res = 0.05, tol = 0.024) {
  const [X0, Y0, X1, Y1] = rect;
  const nx = Math.ceil((X1 - X0) / res), ny = Math.ceil((Y1 - Y0) / res);
  const sd = new Float32Array((nx + 1) * (ny + 1));
  const S = segs.map(([ax, ay, bx, by, w]) => {
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1e-6;
    return { cx: (ax + bx) / 2, cy: (ay + by) / 2, ux: dx / l, uy: dy / l, hl: l / 2 + w / 2, hw: w / 2 };
  });
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const x = X0 + i * res, y = Y0 + j * res;
    let d = 1e9;
    for (const s of S) {
      const px = x - s.cx, py = y - s.cy;
      const u = Math.abs(px * s.ux + py * s.uy) - s.hl, v = Math.abs(-px * s.uy + py * s.ux) - s.hw;
      const out = Math.hypot(Math.max(u, 0), Math.max(v, 0)), ins = Math.min(Math.max(u, v), 0);
      d = Math.min(d, out + ins);
    }
    sd[j * (nx + 1) + i] = Math.abs(d) < 1e-7 ? 1e-7 : d;
  }
  const val = (i, j) => sd[j * (nx + 1) + i];
  const ept = new Map();
  const point = (key, i0, j0, i1, j1) => {
    if (!ept.has(key)) {
      const a = val(i0, j0), b = val(i1, j1), u = a / (a - b);
      ept.set(key, [X0 + (i0 + (i1 - i0) * u) * res, Y0 + (j0 + (j1 - j0) * u) * res]);
    }
    return key;
  };
  const next = new Map();
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
    const inn = c.map(([a, b]) => val(a, b) < 0);
    const edges = [`h${i},${j}`, `v${i + 1},${j}`, `h${i},${j + 1}`, `v${i},${j}`];
    const cr = [];
    for (let k = 0; k < 4; k++) {
      if (inn[k] === inn[(k + 1) % 4]) continue;
      const [i0, j0] = c[k], [i1, j1] = c[(k + 1) % 4];
      cr.push({ key: point(edges[k], i0, j0, i1, j1), exit: inn[k] });
    }
    if (!cr.length) continue;
    const centreIn = (val(i, j) + val(i + 1, j) + val(i + 1, j + 1) + val(i, j + 1)) / 4 < 0;
    const pairExit = cr.length === 4 && centreIn;
    for (let k = 0; k < cr.length; k++) {
      const a = cr[k], b = cr[(k + 1) % cr.length];
      if (pairExit ? a.exit : !a.exit) { if (pairExit) next.set(a.key, b.key); else next.set(b.key, a.key); }
    }
  }
  // trace + simplify loops
  const loops = [];
  const seen = new Set();
  for (const k0 of next.keys()) {
    if (seen.has(k0)) continue;
    const L = [];
    let k = k0;
    while (k !== undefined && !seen.has(k)) { seen.add(k); L.push(ept.get(k)); k = next.get(k); }
    if (L.length >= 3) loops.push(simplifyLoop(L, tol));
  }
  const area = (L) => { let a = 0; for (let i = 0; i < L.length; i++) { const p = L[i], q = L[(i + 1) % L.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
  const insidePoly = ([x, y], L) => {
    let c = false;
    for (let i = 0, j = L.length - 1; i < L.length; j = i++) {
      const [xi, yi] = L[i], [xj, yj] = L[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const outer = loops.filter((L) => area(L) > 0), counters = loops.filter((L) => area(L) < 0);
  const tris = [], floor = [];
  const P = (x, y, z) => new THREE.Vector3(x, y, z);
  const up = P(0, 0, 1);
  const fill = (contour, holes, z, list = tris) => {
    const f = THREE.ShapeUtils.triangulateShape(contour.map(([x, y]) => new THREE.Vector2(x, y)), holes.map((h) => h.map(([x, y]) => new THREE.Vector2(x, y))));
    const all = [...contour, ...holes.flat()];
    for (const [a, b, c] of f) pushTri(list, P(...all[a], z), P(...all[b], z), P(...all[c], z), up);
  };
  fill([[X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1]], outer, 0);              // sheet around the strokes
  for (const C of counters) fill([...C].reverse(), [], 0);                // islands inside letters (A, O, R, 4 ...)
  for (const O of outer) fill(O, counters.filter((C) => insidePoly(C[0], O)).map((C) => [...C].reverse()), -depth, floor); // groove floor
  // groove walls (face into the groove). Their top edge stays 0.02 below the sheet so the bake does not weld the
  // rim into a convex edge: otherwise its edge wear floods the small letter faces, which have no inner vertices.
  const zt = -0.02;
  for (const L of loops) for (let i = 0; i < L.length; i++) {
    const [ax, ay] = L[i], [bx, by] = L[(i + 1) % L.length];
    const n = P(-(by - ay), bx - ax, 0);
    pushTri(tris, P(ax, ay, zt), P(bx, by, zt), P(bx, by, -depth), n);
    pushTri(tris, P(ax, ay, zt), P(bx, by, -depth), P(ax, ay, -depth), n);
  }
  return { tris, floor };
}
/** Douglas-Peucker on a closed loop. */
function simplifyLoop(L, tol) {
  const dp = (pts) => {
    if (pts.length < 3) return pts;
    const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1e-9;
    let best = -1, bi = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / l;
      if (d > best) { best = d; bi = i; }
    }
    if (best <= tol) return [pts[0], pts[pts.length - 1]];
    const a = dp(pts.slice(0, bi + 1)), b = dp(pts.slice(bi));
    return [...a.slice(0, -1), ...b];
  };
  let far = 0, fd = -1;
  for (let i = 1; i < L.length; i++) { const d = Math.hypot(L[i][0] - L[0][0], L[i][1] - L[0][1]); if (d > fd) { fd = d; far = i; } }
  const a = dp(L.slice(0, far + 1)), b = dp([...L.slice(far), L[0]]);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

/**
 * Roll marks stamped into flat faces: a small rectangle around each marking is cut out of the host face and filled
 * by an engraved sheet (flush, same material; groove floors in a matte material). The pocket walls / floors are
 * dropped, so the seam has no edge for the bake to wear and the face reads continuous. All rectangles are cut in
 * one CSG pass while the host is still closed (CSG on an open mesh misclassifies faces).
 * items: [{ segs: [[p0, p1, widthScale?], ...] (three space, on the face), ex, ey, en, width, depth }]
 * Returns { host, inlays: [geo], floors: [geo] }.
 */
function stampMany(host, items, margin = 0.6) {
  const R = items.map(({ segs, ex, ey, en, width, depth = 0.18 }) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z = 0;
    for (const [a, b] of segs) for (const p of [a, b]) {
      x0 = Math.min(x0, p.dot(ex)); x1 = Math.max(x1, p.dot(ex)); y0 = Math.min(y0, p.dot(ey)); y1 = Math.max(y1, p.dot(ey)); z = p.dot(en);
    }
    x0 -= margin + width; x1 += margin + width; y0 -= margin + width; y1 += margin + width;
    const slab = new THREE.BoxGeometry(x1 - x0, y1 - y0, 1.1);
    slab.applyMatrix4(new THREE.Matrix4().makeBasis(ex, ey, en));
    const c = ex.clone().multiplyScalar((x0 + x1) / 2).addScaledVector(ey, (y0 + y1) / 2).addScaledVector(en, z - 0.05);
    slab.translate(c.x, c.y, c.z);
    const inRect = (q, e = 1e-3) => { const x = q.dot(ex), y = q.dot(ey); return x > x0 - e && x < x1 + e && y > y0 - e && y < y1 + e && q.dot(en) < z - 1e-3 && q.dot(en) > z - 0.62; };
    const { tris, floor } = engraveTris(segs.map(([a, b, k = 1]) => [a.dot(ex), a.dot(ey), b.dot(ex), b.dot(ey), width * k]), [x0, y0, x1, y1], depth);
    const toW = (p) => new THREE.Vector3(0, 0, 0).addScaledVector(ex, p.x).addScaledVector(ey, p.y).addScaledVector(en, p.z + z);
    return { slab: clean(slab), inRect, inlay: triGeo(tris.map((t) => t.map(toW)), 30), floor: triGeo(floor.map((t) => t.map(toW)), 30) };
  });
  const cutHost = filterTris(cutK(host, R.map((r) => r.slab)), (q) => !R.some((r) => r.inRect(q)));
  return { host: cutHost, inlays: R.map((r) => r.inlay), floors: R.map((r) => r.floor) };
}

/**
 * Cut-in checkering: a lattice of diamond pyramids whose apexes sit on the original surface (minus `top`) and whose
 * bases are `sink` below it, shot onto `geo` by ray casting. The caller recesses the field so only the pyramids
 * show, which reads as V-grooves cut into the surface (the bake darkens the grooves).
 *  O, A, B  plane the lattice lives on (O origin, A/B unit axes, three space); rays go along D (into the surface)
 *  bounds   [F(u, v), ...] region (F <= 0 inside). Diamonds crossing a bound are clipped on its tangent line and get a
 *           vertical cut face, so the field ends on a clean line instead of a sawtooth of whole diamonds.
 *  d1/d2 diamond diagonals (mm); rot lattice angle (rad)
 */
function checker(geo, { O, A, B, D, bounds = [], uRange, vRange, d1, d2, sink = 0.55, top = 0.03, rot = 0, minDot = 0.5 }) {
  const bvh = new MeshBVH(geo.clone());
  const L1 = A.clone().multiplyScalar(Math.cos(rot)).addScaledVector(B, Math.sin(rot));
  const L2 = A.clone().multiplyScalar(-Math.sin(rot)).addScaledVector(B, Math.cos(rot));
  const uv = (p) => [p.dot(A), p.dot(B)];
  const ray = new THREE.Ray();
  const tris = [];
  const R = Math.hypot(uRange[1] - uRange[0], vRange[1] - vRange[0]);
  const cu = (uRange[0] + uRange[1]) / 2, cv = (vRange[0] + vRange[1]) / 2;
  const C0 = A.clone().multiplyScalar(cu).addScaledVector(B, cv);
  const ni = Math.ceil(R / (d1 / 2)), nj = Math.ceil(R / (d2 / 2));
  const offs = [L1.clone().multiplyScalar(d1 / 2), L2.clone().multiplyScalar(d2 / 2), L1.clone().multiplyScalar(-d1 / 2), L2.clone().multiplyScalar(-d2 / 2)];
  for (let i = -ni; i <= ni; i++) {
    for (let j = -nj; j <= nj; j++) {
      if ((i + j) & 1) continue;
      const c = C0.clone().addScaledVector(L1, (i * d1) / 2).addScaledVector(L2, (j * d2) / 2);
      const [cu, cv] = uv(c);
      const b2 = offs.map((o) => [cu + o.dot(A), cv + o.dot(B)]);
      const planes = [];
      let skip = false;
      for (const F of bounds) {
        const f0 = F(cu, cv);
        if (f0 > 0) { skip = true; break; }
        if (b2.every(([u, v]) => F(u, v) <= 0)) continue;
        const h = 0.01, gu = (F(cu + h, cv) - F(cu - h, cv)) / (2 * h), gv = (F(cu, cv + h) - F(cu, cv - h)) / (2 * h), gl = Math.hypot(gu, gv) || 1;
        planes.push({ gu: gu / gl, gv: gv / gl, d: f0 / gl, cu, cv });
      }
      if (skip) continue;
      ray.origin.copy(O).add(c);
      ray.direction.copy(D);
      const hit = bvh.raycastFirst(ray, THREE.DoubleSide);
      if (!hit) continue;
      const n = hit.face.normal.clone();
      if (n.dot(D) > 0) n.negate();
      if (-n.dot(D) < minDot) continue;
      const P = hit.point;
      const base = offs.map((o) => {
        const lam = -n.dot(o) / n.dot(D);
        return P.clone().add(o).addScaledVector(D, lam).addScaledVector(n, -sink);
      });
      const apex = P.clone().addScaledVector(n, -top);
      if (!planes.length) { for (let k = 0; k < 4; k++) pushTri(tris, base[k], base[(k + 1) % 4], apex, n); continue; }
      const Lp = (pl, q) => pl.d + pl.gu * (q.p2[0] - pl.cu) + pl.gv * (q.p2[1] - pl.cv);
      for (let k = 0; k < 4; k++) {
        let poly = [{ p2: b2[k], p3: base[k] }, { p2: b2[(k + 1) % 4], p3: base[(k + 1) % 4] }, { p2: [cu, cv], p3: apex }];
        for (const pl of planes) {
          const out = [];
          for (let e = 0; e < poly.length; e++) {
            const q0 = poly[e], q1 = poly[(e + 1) % poly.length], l0 = Lp(pl, q0), l1 = Lp(pl, q1);
            if (l0 <= 0) out.push(q0);
            if ((l0 <= 0) !== (l1 <= 0)) {
              const f = l0 / (l0 - l1);
              out.push({ p2: [q0.p2[0] + (q1.p2[0] - q0.p2[0]) * f, q0.p2[1] + (q1.p2[1] - q0.p2[1]) * f], p3: q0.p3.clone().lerp(q1.p3, f) });
            }
          }
          poly = out;
          if (poly.length < 3) break;
        }
        if (poly.length < 3) continue;
        for (let e = 1; e + 1 < poly.length; e++) pushTri(tris, poly[0].p3, poly[e].p3, poly[e + 1].p3, n);
        // vertical cut face where the facet was clipped
        for (let e = 0; e < poly.length; e++) {
          const q0 = poly[e], q1 = poly[(e + 1) % poly.length];
          const pl = planes.find((p) => Math.abs(Lp(p, q0)) < 1e-6 && Math.abs(Lp(p, q1)) < 1e-6);
          if (!pl) continue;
          const drop = (q) => q.p3.clone().addScaledVector(n, -q.p3.clone().sub(base[0]).dot(n));
          const out = A.clone().multiplyScalar(pl.gu).addScaledVector(B, pl.gv);
          const a0 = q0.p3, a1 = q1.p3, a2 = drop(q1), a3 = drop(q0);
          pushTri(tris, a0, a1, a2, out); pushTri(tris, a0, a2, a3, out);
        }
      }
    }
  }
  return tris.length ? triGeo(tris, 15) : null;
}

/** Surface point + normal by ray cast (three space). */
function surfaceHit(geo, origin, dir) {
  const bvh = new MeshBVH(geo.clone());
  const hit = bvh.raycastFirst(new THREE.Ray(origin, dir), THREE.DoubleSide);
  if (!hit) return null;
  const n = hit.face.normal.clone();
  if (n.dot(dir) > 0) n.negate();
  return { p: hit.point.clone(), n };
}

/** Recoil-shield shoulder: s of the shield surface at radius r from the cylinder axis (null = outside it). */
function shieldS(r) {
  if (r <= SHIELD[0][1]) return SHIELD[0][0];
  for (let i = 1; i < SHIELD.length; i++) {
    const [s0, r0] = SHIELD[i - 1], [s1, r1] = SHIELD[i];
    if (r <= r1) return s0 + ((s1 - s0) * (r - r0)) / (r1 - r0);
  }
  return null;
}

// ------------------------------------------------------------------------------------------ grip (target stocks)
// Lofted from horizontal slices: each slice is a super-ellipse between the front strap and the backstrap.
const gripFront = spline([[-131, -44.5], [-120, -43], [-100, -38.5], [-80, -33], [-66, -28.6], [-58, -26.2], [-50, -23.9], [-40, -20]]);
const gripBack = spline([[-131, -96.0], [-126, -96.8], [-118, -94.5], [-100, -88], [-70, -76.5], [-45, -65], [-30, -58.5], [-18, -53]]);
const gripHalfW = spline([[-131, 13.6], [-116, 15.6], [-92, 16.6], [-72, 16.4], [-54, 14.6], [-40, 12.6], [-28, 11.5], [-18, 11.1]]);
// top edge of the wood runs diagonally along the frame from the trigger guard up to the tang
const gripDiag = (t) => -22.5 + (t + 48) * (-28.5 / 34);
const gripFrontAt = (t) => smin(gripFront(t), gripDiag(t), 1.6);
const G_TB = -131, G_TT = -21;

/** One stock panel (side = +1 right / -1 left). inset > 0 shrinks it (the floor of the checkered field). */
function gripHalf(side, inset = 0) {
  const seam = 0.22, N = 20, ex = 2.7, egg = 0.1, Rb = 6, Rt = 3.5;
  const ts = [];
  for (let i = 0; i <= 5; i++) ts.push(G_TB + Rb * (1 - Math.cos((i / 5) * Math.PI / 2)));
  const m0 = G_TB + Rb, m1 = G_TT - Rt, nm = Math.ceil((m1 - m0) / 4.0);
  for (let i = 1; i < nm; i++) ts.push(m0 + ((m1 - m0) * i) / nm);
  for (let i = 4; i >= 0; i--) ts.push(G_TT - Rt * (1 - Math.cos((i / 4) * Math.PI / 2)));
  const rings = ts.map((t) => {
    let d = inset;
    if (t < G_TB + Rb) { const y = t - G_TB; d += Rb - Math.sqrt(Math.max(0, Rb * Rb - (Rb - y) ** 2)); }
    if (t > G_TT - Rt) { const y = G_TT - t; d += Rt - Math.sqrt(Math.max(0, Rt * Rt - (Rt - y) ** 2)); }
    const fr = gripFrontAt(t) - d, bk = gripBack(t) + d, b = gripHalfW(t) - d;
    const mid = (fr + bk) / 2, a = (fr - bk) / 2;
    const ring = [];
    for (let i = 0; i <= N; i++) {
      const th = (Math.PI * i) / N;
      const c = Math.cos(th), sn = Math.sin(th);
      const xn = Math.sign(c) * Math.abs(c) ** (2 / ex);
      const s = mid + a * xn;
      const w = b * Math.abs(sn) ** (2 / ex) * (1 - egg * xn);
      ring.push([s, t, side * (seam + w)]);
    }
    return { ring, mid, t };
  });
  // speed-loader relief on the left panel (clears a loader on the swung-out cylinder)
  if (side < 0) {
    const ax = swungAxis();
    for (const { ring } of rings) for (const p of ring) {
      const fall = Math.min(1, Math.max(0, (p[0] + 34) / 7));
      const Rl = (25.5 + inset) * fall;
      const dw = p[2] - ax.w, dt = p[1] - ax.t, d = Math.hypot(dw, dt);
      if (d < Rl && d > 1e-6) { p[2] = ax.w + (dw / d) * Rl; p[1] = ax.t + (dt / d) * Rl; }
    }
  }
  const tris = [];
  const K = rings.length - 1;
  const R = rings.map((r) => r.ring.map(P3));
  // side skin (orientation decided once from a mid-height quad)
  const km = K >> 1, im = N >> 1;
  const a0 = R[km][im], b0 = R[km][im + 1], c0 = R[km + 1][im];
  const outRef = V(0, 0, side);
  const flip = triNormal(a0, b0, c0).dot(outRef) < 0;
  for (let k = 0; k < K; k++) {
    for (let i = 0; i < N; i++) {
      const a = R[k][i], b = R[k][i + 1], c = R[k + 1][i + 1], d = R[k + 1][i];
      if (!flip) { tris.push([a, b, c]); tris.push([a, c, d]); } else { tris.push([a, c, b]); tris.push([a, d, c]); }
    }
  }
  // inner (seam) face
  const contour = [];
  for (let k = 0; k <= K; k++) contour.push(rings[k].ring[0]);
  for (let k = K; k >= 0; k--) contour.push(rings[k].ring[N]);
  const faces = THREE.ShapeUtils.triangulateShape(contour.map((p) => new THREE.Vector2(p[0], p[1])), []);
  const inner = contour.map(P3);
  for (const [i, j, k] of faces) pushTri(tris, inner[i], inner[j], inner[k], V(0, 0, -side));
  // end caps
  for (const [k, out] of [[0, V(0, -1, 0)], [K, V(0, 1, 0)]]) {
    const ring = R[k];
    const c = ring.reduce((acc, p) => acc.add(p), new THREE.Vector3()).multiplyScalar(1 / ring.length);
    for (let i = 0; i < N; i++) pushTri(tris, c, ring[i], ring[i + 1], out);
    pushTri(tris, c, ring[N], ring[0], out);
  }
  return triGeo(tris, 50);
}

// checkered field on each panel: super-ellipse between the straps, raked with the grip, around the escutcheon
const F_T0 = -121, F_T1 = -58.5;
const ESC_T = -84;
const ESC = [(gripFrontAt(ESC_T) + gripBack(ESC_T)) / 2, ESC_T];
const fieldS = (t) => [gripBack(t) + 6.5, gripFrontAt(t) - 7.5];
function fieldPoly(n = 52) {
  const pts = [];
  const tm = (F_T0 + F_T1) / 2, th = (F_T1 - F_T0) / 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
    const t = tm + th * Math.sign(sn) * Math.abs(sn) ** 0.5;
    const [s0, s1] = fieldS(t);
    pts.push([(s0 + s1) / 2 + ((s1 - s0) / 2) * Math.sign(c) * Math.abs(c) ** 0.5, t]);
  }
  return pts;
}
/** Field outline as an implicit function (<= 0 inside), shrunk by margin mm. */
const fieldF = (s, t, margin = 0) => {
  const [s0, s1] = fieldS(Math.max(F_T0, Math.min(F_T1, t)));
  const u = (t - (F_T0 + F_T1) / 2) / ((F_T1 - F_T0) / 2 - margin), v = (s - (s0 + s1) / 2) / ((s1 - s0) / 2 - margin);
  return (u ** 4 + v ** 4) ** 0.25 - 1;
};

/** Cylinder axis position (w, t) with the crane swung fully open. */
function swungAxis() {
  const a = CRANE_OPEN * DEG;
  const dw = 0 - HINGE[2], dt = CYL_T - HINGE[1];
  return { w: HINGE[2] + dw * Math.cos(a) - dt * Math.sin(a), t: HINGE[1] + dw * Math.sin(a) + dt * Math.cos(a) };
}

/**
 * Crane yoke seen from the front (w, t): arm from the left frame face to the bearing boss round the cylinder axis,
 * tangent down to the hinge boss. Every edge that leads the swing is an arc about the hinge (top: R_ARM, bottom-left:
 * the hinge boss), so the yoke never rises into the frame while it swings out; the top-left edge on the frame face
 * gets a 45 deg chamfer. grow = clearance offset for the matching frame pocket (keeps a constant seam).
 */
function linkPoly(grow = 0) {
  const Hw = HINGE[2], Ht = HINGE[1];
  const R = R_ARM + grow, r1 = 6.4 + grow, r2 = 4.6 + grow, wL = -15;
  const C1 = [0, CYL_T], C2 = [Hw, Ht];
  const pts = [];
  // top-left chamfer: 45 deg line through the arc point at w = -9.8 (grow = 0), pushed out by grow
  const wc = -9.8, tc = Ht + Math.sqrt(R_ARM * R_ARM - (wc - Hw) ** 2);
  const lineT = (w) => tc + (w - wc) + grow * Math.SQRT2; // t on the chamfer line
  let wA = wc; // chamfer meets the (grown) arc: solve by bisection
  for (let lo = wc - 3, hi = wc + 3, k = 0; k < 40; k++) {
    wA = (lo + hi) / 2;
    if (lineT(wA) > Ht + Math.sqrt(R * R - (wA - Hw) ** 2)) hi = wA; else lo = wA;
  }
  pts.push([wL, lineT(wL)]);
  // arc about the hinge from the chamfer to where it meets the bearing boss
  const dx = C1[0] - Hw, dy = C1[1] - Ht, D = Math.hypot(dx, dy);
  const a = (R * R - r1 * r1 + D * D) / (2 * D), h = Math.sqrt(R * R - a * a);
  const px = Hw + (a * dx) / D, py = Ht + (a * dy) / D;
  const I = [px + (h * dy) / D, py - (h * dx) / D]; // right-hand intersection
  const angL = Math.atan2(Ht + Math.sqrt(R * R - (wA - Hw) ** 2) - Ht, wA - Hw), angI = Math.atan2(I[1] - Ht, I[0] - Hw);
  for (let i = 0; i <= 14; i++) { const t = angL + ((angI - angL) * i) / 14; pts.push([Hw + R * Math.cos(t), Ht + R * Math.sin(t)]); }
  // external tangent (right side) between the bearing boss and the hinge boss
  const ux = (C1[0] - C2[0]) / D, uy = (C1[1] - C2[1]) / D;
  const sa = (r2 - r1) / D, ca = Math.sqrt(1 - sa * sa);
  const nx = ca * uy + sa * ux, ny = -ca * ux + sa * uy;
  const b0 = Math.atan2(I[1] - C1[1], I[0] - C1[0]), b1 = Math.atan2(ny, nx);
  for (let i = 1; i <= 8; i++) { const t = b0 + ((b1 - b0) * i) / 8; pts.push([C1[0] + r1 * Math.cos(t), C1[1] + r1 * Math.sin(t)]); }
  const c0 = b1, c1 = -Math.PI;
  for (let i = 0; i <= 12; i++) { const t = c0 + ((c1 - c0) * i) / 12; pts.push([C2[0] + r2 * Math.cos(t), C2[1] + r2 * Math.sin(t)]); }
  pts.push([wL, Ht]);
  return pts;
}

// ------------------------------------------------------------------------------------------ hammer (target spur)
// Side view: the top rises from the hammer face in a concave sweep, runs back in a long arc and turns down into a
// rounded tip; underneath, the neck curls back into the spur (a comma). Plan view: 8 mm neck flaring to 12.7 mm.
const H_TIP = -58.6, H_FRONT = -14.4;
const HT = spline([[-58.6, 18.0], [-56.5, 19.4], [-53, 20.5], [-49, 21.1], [-44, 21.35], [-38, 21.15], [-32, 20.7], [-26, 20.1], [-20, 19.4], [-17, 18.9], [-15.2, 18.5], [-14.4, 18.2]]);
const HU = spline([[-58.6, 14.3], [-56.5, 14.7], [-53, 15.6], [-50, 16.3], [-46, 16.8], [-40, 16.9], [-30, 16.5], [-14.4, 14.0]]);
const HB = spline([[-44.5, 16.8], [-43, 16.2], [-41.6, 14.6], [-40.3, 12.0], [-39.2, 8.6], [-38.3, 5.2], [-37.5, 2.4], [-36.6, 0.8], [-35.8, 0.5], [-14.4, 0.5]]);
const HWd = spline([[-58.6, 3.4], [-57.6, 5.0], [-56.3, 5.9], [-54.5, 6.3], [-50, 6.35], [-44, 6.35], [-41.5, 6.0], [-39.2, 5.3], [-37, 4.55], [-35, 4.12], [-33, 4.0], [-14.4, 4.0]]);
const H_SF0 = -55.2, H_SF1 = -36.6;   // checkered field on the spur top
const H_DEP = 0.35;                   // field recess (checkering depth)
const hRt = (T, U, W) => Math.max(0, Math.min(1.7, (T - U) * 0.42, W * 0.42));

function hammerRing(s, recess = true) {
  const rnd = (x, r) => (x >= r ? 0 : r - Math.sqrt(Math.max(0, r * r - (r - x) ** 2)));
  const d = Math.max(rnd(s - H_TIP, 1.8), rnd(H_FRONT - s, 0.9));
  let T = HT(s) - d, U = HU(s) + d, B = HB(s) + d;
  const W = Math.max(0.3, HWd(s) - d), Ws = Math.max(0.3, 4.0 - d);
  U = Math.min(U, T); B = Math.min(B, U);
  const o = Math.max(0, W - Ws);
  const cb = Math.max(0, Math.min(0.6, (U - B) / 2));
  const f = Math.max(0, Math.min(3.4, o * 0.62, U - B - cb));
  const rc = Math.max(0, Math.min(1.2, o - f, (T - U) * 0.35));
  const rt = hRt(T, U, W);
  const Wf = W - rt - 0.35;
  const dep = recess && s > H_SF0 && s < H_SF1 && Wf > 0.8 ? H_DEP : 0;
  const R = [[0, B], [Ws - cb, B], [Ws, B + cb]];
  for (let i = 0; i <= 2; i++) { const a = Math.PI - (i / 2) * (Math.PI / 2); R.push([Ws + f + f * Math.cos(a), U - f + f * Math.sin(a)]); }
  for (let i = 0; i <= 2; i++) { const a = -Math.PI / 2 + (i / 2) * (Math.PI / 2); R.push([W - rc + rc * Math.cos(a), U + rc + rc * Math.sin(a)]); }
  for (let i = 0; i <= 3; i++) { const a = (i / 3) * (Math.PI / 2); R.push([W - rt + rt * Math.cos(a), T - rt + rt * Math.sin(a)]); }
  const wf = Math.max(0.05, Math.min(Wf, W - rt));
  R.push([wf, T], [Math.max(0.02, wf - 0.06), T - dep], [0, T - dep]);
  return [...R, ...R.slice(1, -1).reverse().map(([w, t]) => [-w, t])];
}
function hammerStations() {
  const st = new Set();
  for (const x of [0, 0.06, 0.25, 0.55, 0.95, 1.4, 1.8]) st.add(H_TIP + x);
  for (let s = H_TIP + 2.4; s < -45.2; s += 1.4) st.add(s);
  for (let s = -45.2; s < -35.2; s += 0.75) st.add(s);
  for (let s = -34.6; s < H_FRONT - 1.6; s += 2.0) st.add(s);
  for (const x of [0, 0.05, 0.2, 0.42, 0.7, 0.9]) st.add(H_FRONT - x);
  for (const s of [H_SF0, H_SF1]) { st.add(s - 0.03); st.add(s + 0.03); }
  return [...st].sort((a, b) => a - b);
}

// frame backstrap + hump: one smooth spline from the grip frame over the hammer to the topstrap (no straight
// facets between fillets for the bevel highlight to break on)
const HUMP = new THREE.SplineCurve([
  [-58.0, -60], [-57.3, -44], [-55.6, -30], [-52.9, -18], [-48.8, -7.0], [-42.8, 2.4], [-35.4, 8.8], [-27.4, 13.0], [-20.2, 15.5],
  [-14.6, 16.5], [-10, TOP],
].map(([x, y]) => new THREE.Vector2(x, y))).getSpacedPoints(40).map((p) => [p.x, p.y]);

// ------------------------------------------------------------------------------------------ build
export default function build() {
  const g = new Gun('revolver');

  // ======================================================================= FRAME (one forging, closed window)
  const frameOuter = filletPoly([
    [FF, TOP, 2.4],
    [FF, -26, 11],
    [47.5, -47.4, 6],
    [-20.0, -47.4, 1],
    // front strap: kept where the stock's rounded front edge is >= 11.2 mm thick, so the wood wraps it completely
    // right behind the guard and no frame or side-plate tail pokes through
    [-30.6, -48.2, 1.5],
    [-31.4, -54, 3],
    [-32.4, -60],
    [-35.1, -72],
    [-38.7, -84],
    [-43.4, -100, 3],
    [-44.6, -104, 3],
    [-62, -104, 4],
    ...HUMP,
  ]);
  const frameWindow = filletPoly([[0, 8.2, 0.5], [46, 8.2, 0.8], [46, -9.8, 1.6], [42.9, -9.8, 1.6], [42.9, -37.6, 0.8], [0, -37.6, 1.4]]);
  let frame = extrudeW(frameOuter, [frameWindow], { w: FW * 2, bevel: 1.4, bevelSeg: 3 });
  // recoil shield: round boss behind the cylinder (covers the case heads), shoulder sloping into the frame flats
  const shield = lathe([[SHIELD[0][0], 0], ...SHIELD, [-0.75, 21.5], [-0.03, 20.8], [-0.03, 0]], { t: CYL_T, seg: 72 });
  frame = unionK(frame, shield);

  // rounded topstrap edges (fillet cutters), run out over the rear-sight seat into the plain hump bevel
  const filletCutter = (sg) => {
    const R = 2.6, cw = FW - R, ct = TOP - R;
    const pts = [[sg * cw, TOP + 2], [sg * (FW + 2), TOP + 2], [sg * (FW + 2), ct], [sg * FW, ct]];
    for (let i = 1; i < 12; i++) { const a = (i / 12) * Math.PI / 2; pts.push([sg * (cw + R * Math.cos(a)), ct + R * Math.sin(a)]); }
    pts.push([sg * cw, TOP]);
    const c = section(sg > 0 ? pts : pts.reverse(), -20, 60, { bevel: 0 });
    return cut(c, profile([[-40, -10], [-11, -10], [-11, TOP - R - 0.6], [-21, TOP + 0.6], [-40, TOP + 6]], { w: 40, bevel: 0 }));
  };
  // side plate (right side): front edge follows the recoil-shield shoulder; plate + pocket from one polygon
  const plateFront = [];
  for (let t = 5.0; t >= -33.6; t -= 1.4) {
    const sf = shieldS(Math.hypot(FW, t - CYL_T));
    plateFront.push([Math.min(-5.7, sf === null ? -5.7 : sf - 0.9), t]);
  }
  const plateSpec = [
    ...plateFront.map((p, i) => (i === 0 ? [p[0], p[1], 1.4] : i === plateFront.length - 1 ? [p[0], p[1], 2.5] : p)),
    [-9, -43.5, 4], [-26, -44.5, 3], [-33.5, -49, 3], [-35, -58, 3], [-37, -66, 3], [-55, -60, 3], [-54, -38, 6], [-48.5, -13, 6], [-41, -3.5, 6], [-28, 3, 8], [-14, 6.5, 4],
  ];
  const platePoly = filletPoly(plateSpec);
  const platePocket = profile(offsetOutline(platePoly, 0.32), { w: 4, cw: FW - 0.6 + 2, bevel: 0 });
  const grooves = (s0, s1) => [-3, -1.5, 0, 1.5, 3].map((w) => cutters.box([(s0 + s1) / 2, TOP, w], [s1 - s0, 0.7, 0.5]));

  // crane yoke (left side) and its pocket in the frame
  const armSide = filletPoly([[43.2, -8.0], [FF - 0.15, -8.0], [FF - 0.15, -20.5, 4.5], [51.0, -25.5, 4], [50.4, -34, 3], [50.4, -46.6, 1.5], [43.2, -46.6]]);
  const cranePocket = intersect(
    profile(offsetOutline(armSide, 0.3), { w: 22, cw: -3, bevel: 0 }),
    section(linkPoly(0.3), 42.3, 59, { bevel: 0 }),
  );
  frame = cutK(frame, [
    filletCutter(1), filletCutter(-1),
    cutters.box([-34, 7.5, 0], [44, 45, 8.8]),            // hammer slot
    cutters.box([-3, TOP + 1.1, 0], [26, 4, 9.6]),          // rear sight seat (0.9 deep)
    ...grooves(10.5, 56.5),                                // matte topstrap lines
    platePocket,
    cyl(-1.5, 1.2, 1.6, { t: 0, b: 0, seg: 16 }),          // firing pin hole in the breech face
    cutters.box([-1.5, -46, 0], [15.5, 6, 10.2]),          // trigger slot
    cutters.box([7.75, -37.6, 0], [5.2, 2.4, 4.2]),        // cylinder stop window
    cutters.box([0, -8.5, 5.5], [3, 6, 2.4]),              // hand slot in the breech face
    cranePocket,
  ]);
  g.add(frame, 'steel_blued');
  // side plate + screws + stamped emblem
  let plate = profile(platePoly, { w: 0.65, cw: FW - 0.6 + 0.325 + 0.05, bevel: 0.25, bevelSeg: 1 });
  const PL = FW + 0.1;
  {
    const r = stampMany(plate, [{ segs: emblemSegs(V(-24, -19, PL), FWD(), UP(), 4.2), ex: FWD(), ey: UP(), en: RIGHT(), width: 0.42, depth: 0.16 }]);
    plate = r.host;
    g.add(r.inlays[0], 'steel_blued');
    g.add(r.floors[0], MARK);
  }
  g.add(flatNormals(plate, ['x']), 'steel_blued');
  for (const [s, t, a] of [[-12.5, 1.5, 20], [-14.5, -25, 70], [-11.5, -39.5, 45], [-38, -6.5, 110]]) g.add(slotScrew([s, t, PL - 0.05], 2.3, 'w', a, 0.75), 'steel_blued');
  // pins / studs (left side + trigger stud on the right)
  g.add(lathe([[0, 0], [0, 2.5], [0.25, 2.2], [0.3, 0]], { seg: 20 }).rotateY(Math.PI / 2).translate(-FW, HAM[1], -HAM[0]), 'steel_dark');
  g.add(lathe([[0, 0], [0, 2.1], [0.25, 1.8], [0.3, 0]], { seg: 20 }).rotateY(Math.PI / 2).translate(-FW, TRG[1], -TRG[0]), 'steel_dark');
  g.add(lathe([[0, 0], [0, 2.1], [0.25, 1.8], [0.3, 0]], { seg: 20 }).rotateY(-Math.PI / 2).translate(FW, TRG[1], -TRG[0]), 'steel_dark');
  // barrel pin through the frame boss
  for (const sg of [1, -1]) g.add(lathe([[0, 0], [0, 1.3], [0.2, 1.1], [0.25, 0]], { seg: 14 }).rotateY(-sg * Math.PI / 2).translate(sg * FW, 12.2, -52), 'steel_dark');
  // cylinder stop (bolt) rising into the bottom notch
  g.add(box([7.75, -37.4, 0], [3.4, 2.4, 3.0], { r: 0.4 }), 'steel_dark');
  // breech face: firing-pin bushing ring
  g.add(lathe([[-0.2, 1.65], [0.05, 1.65], [0.05, 2.6], [-0.2, 2.8]], { seg: 20 }), 'steel_bright');

  // cylinder release thumbpiece (left side, tucked behind the recoil shield, serrated)
  let thumb = extrudeW(filletPoly([[-26.5, -13.6, 2.5], [-11.8, -14.4, 2], [-11.0, -4.4, 2.5], [-25.2, -3.8, 3]]), [], { w: 2.8, cw: -FW - 1.2, bevel: 0.7, bevelSeg: 2, rim: 0.3, edge: 0 });
  // V-grooves 0.7 deep on the outer face (w = -FW - 2.6): their slanted walls catch the light, unlike flat slots
  thumb = cutK(thumb, [-23.4, -21.8, -20.2, -18.6, -17.0, -15.4, -13.8].map((s) => box([s, -9.1, -FW - 2.6], [1.0, 14, 1.0], { r: 0, rot: [0, 45, 0] })));
  g.add(thumb, 'steel_blued');

  // trigger guard (integral, rounded); the rear leg sweeps into the front strap with a fillet
  g.add(extrudeW(filletPoly([
    [42.4, -44, 0.5], [42.4, -49, 2], [38.5, -60, 8], [27, -73.5, 12], [6, -78.5, 12], [-12, -74.5, 10], [-21.6, -66.4, 6],
    [-26.6, -58.4, 3.5], [-24.0, -50.0, 3], [-21, -44, 0.5], [-19, -44, 0.5], [-19, -52, 3], [-16, -64, 5], [-8, -71.5, 7], [4, -74.5, 7],
    [20, -70, 9], [31, -59, 6], [34.5, -44, 0.5],
  ]), [], { w: 7.6, bevel: 1.7, bevelSeg: 3, rim: 0.4, edge: 0.3 }), 'steel_blued');

  // ======================================================================= BARREL (round top, ground flats, full lug)
  g.add(lathe([
    [42.85, 7.0], [42.85, 8.2], [43.25, 8.6], [FF + 0.1, 8.6], [FF + 0.1, 5.45], [44.4, 5.45], [42.85, 7.0],
  ], { seg: 48 }), 'steel_blued');
  {
    const fT = Math.sqrt(BR * BR - FLAT * FLAT), a0 = Math.atan2(fT, FLAT);
    const sec = [];
    for (let i = 0; i <= 26; i++) { const a = a0 + ((Math.PI - 2 * a0) * i) / 26; sec.push([BR * Math.cos(a), BR * Math.sin(a)]); }
    for (let i = 0; i <= 16; i++) { const a = Math.PI + a0 + ((Math.PI - 2 * a0) * i) / 16; sec.push([BR * Math.cos(a), BR * Math.sin(a)]); }
    // the muzzle opening is the crown diameter; a bore liner with a coned (recessed) crown fills it
    const crown = [];
    for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; crown.push([7.3 * Math.cos(a), 7.3 * Math.sin(a)]); }
    g.add(extrudeW(sec, [crown], { w: MUZ - FF - 0.1, cw: (MUZ + FF + 0.1) / 2, axis: 's', bevel: 0.6, bevelSeg: 3, rim: 0.4, edge: 0.5, sharp: 12 }), 'steel_blued');
    g.add(lathe([[FF + 0.1, 5.45], [MUZ - 1.7, 5.45], [MUZ - 0.62, 7.22], [MUZ - 0.62, 7.45], [FF + 0.1, 7.45]], { seg: 48 }), 'steel_blued');
  }
  // rifling lands visible in the bore at the muzzle
  for (let k = 0; k < 6; k++) {
    g.add(xform(box([MUZ - 10.2, 5.33, 0], [17, 0.42, 1.3], { r: 0 }), { rot: [0, 0, 60 * k + 15], pivot: [MUZ - 10.2, 0, 0] }), 'steel_dark');
  }
  // full-length under-lug, flush with the flats; radiused swept-back nose 3.5 mm short of the crown
  {
    const LW = FLAT - 0.02, LUG_END = MUZ - 3.5, K = 0.3;
    let lug = section(filletPoly([[-LW, -1.0], [LW, -1.0], [LW, -21.8, 5.5], [-LW, -21.8, 5.5]]), FF + 0.1, LUG_END, { bevel: 1.5, bevelSeg: 3 });
    const p = lug.attributes.position;
    for (let i = 0; i < p.count; i++) if (-p.getZ(i) > LUG_END - 10) p.setZ(i, p.getZ(i) + K * Math.max(0, -1.0 - p.getY(i)));
    lug = flatNormals(lug, ['x', 'y', T3(0, K, 1)]);
    // ejector-rod channel, opened out through the left wall along the rod's swing arc
    lug = cutK(lug, [cyl(55, 91, 3.6, { t: CYL_T, b: 0, seg: 20 }), cutters.slotW(55.5, 91.8, -14.1, 8.4, 20, -10)]);
    // roll marks stamped into the flats
    const marks = stampMany(lug, [
      ['CALAMITY ARMS', V(74, -12.8, LW), FWD(), RIGHT(), 3.0, 0.44],
      ['CAL .44 MAG', V(150, -12.2, LW), FWD(), RIGHT(), 2.2, 0.34],
      ['VIPER .44 MAGNUM', V(160, -12.8, -LW), BACK(), LEFT(), 3.0, 0.44],
    ].map(([str, o, ex, en, h, width]) => ({ segs: textSegs(str, { o, ex, ey: UP(), h }), ex, ey: UP(), en, width })));
    lug = marks.host;
    for (const m of marks.inlays) g.add(m, 'steel_blued');
    for (const m of marks.floors) g.add(m, MARK);
    g.add(lug, 'steel_blued');
  }
  // ventilated rib: web with windows + top plate with matte lines
  const windows = [];
  for (let i = 0; i < 8; i++) {
    const a = 66 + i * 14.6;
    windows.push([[a, 9.3, 0.5], [a + 10.8, 9.3, 0.5], [a + 10.8, 13.4, 0.5], [a, 13.4, 0.5]]);
  }
  g.add(flatNormals(profile([[FF + 0.1, 8.0], [MUZ - 1.2, 8.0], [MUZ - 1.2, 13.6], [FF + 0.1, 13.6]], { w: 3.6, bevel: 0.35, bevelSeg: 1, curveSeg: 3, holes: windows }), ['x']), 'steel_blued');
  let ribTop = section([[-4.7, 13.2, 0.5], [4.7, 13.2, 0.5], [4.7, TOP, 1.0], [-4.7, TOP, 1.0]], FF + 0.1, MUZ - 0.8, { bevel: 0.6, curveSeg: 4 });
  ribTop = cut(ribTop, grooves(59, 183));
  g.add(flatNormals(ribTop, ['y', 'x']), 'steel_blued');

  // front sight: pinned ramp with a red insert
  g.add(profile([[181, TOP - 0.6, 1], [205.6, TOP - 0.6, 0.8], [205.6, TOP + 2.0, 1], [183, TOP + 1.5, 1.5]], { w: 6, bevel: 0.6 }), 'steel_blued');
  g.add(profile([[185, TOP + 1.0, 1.5], [204.4, TOP + 1.0, 0.4], [204.4, SIGHT_T - 0.6, 0.5], [203.4, SIGHT_T, 0.4], [199.6, SIGHT_T, 0.5]], { w: 3.2, bevel: 0.45 }), 'steel_blued');
  { // red insert flush with the ramp slope near the top
    const k = (SIGHT_T - TOP - 1.0) / (199.6 - 185), at = (s) => TOP + 1.0 + (s - 185) * k;
    g.add(profile([[193.5, at(193.5) + 0.03], [199.4, at(199.4) + 0.03], [199.4, at(199.4) - 1.6], [194.6, at(194.6) - 1.7]], { w: 3.3, bevel: 0.15 }), 'paint_red');
  }
  for (const sg of [1, -1]) g.add(lathe([[0, 0], [0, 0.9], [0.15, 0.75], [0.2, 0]], { seg: 12 }).rotateY(-sg * Math.PI / 2).translate(sg * 3, TOP + 0.7, -187), 'steel_dark');

  // rear sight: tall tapered leaf (blends into the topstrap at its front), low blade with a white-outline notch
  const RS = TOP - 0.9; // leaf seat
  const leaf = flatNormals(profile(filletPoly([[-14, RS, 0.4], [10, RS, 0.3], [10, RS + 0.9, 0.4], [3, RS + 2.5, 7], [-5, RS + 4.9, 6], [-11, RS + 5.6, 1.2], [-14, RS + 5.6, 0.6]]), { w: 9, bevel: 0.6, bevelSeg: 2 }), ['x']);
  g.add(leaf, 'steel_blued');
  const BL0 = RS + 5.0, BL1 = SIGHT_T + 2.8;
  let blade = profile(filletPoly([[-15.8, BL0, 0.4], [-11.2, BL0, 0.4], [-11.2, BL1, 0.5], [-15.8, BL1, 0.5]]), { w: 13, bevel: 0.5 });
  const serr = [];
  for (const t of [BL0 + 0.6, BL0 + 1.7, BL0 + 2.8, BL0 + 3.9]) for (const sg of [1, -1]) serr.push(cutters.box([-15.95, t, sg * 5.0], [0.9, 0.42, 3.4]));
  blade = cut(blade, [cutters.box([-13.5, SIGHT_T + 3.5, 0], [8, 7, 3.2]), ...serr]);
  g.add(flatNormals(blade, ['x', 'z']), 'steel_blued');
  for (const sg of [1, -1]) g.add(box([-15.86, (SIGHT_T - 0.9 + BL1 - 0.35) / 2, sg * 2.45], [0.2, BL1 - 0.35 - (SIGHT_T - 0.9), 0.55], { r: 0.05 }), 'paint_white');
  g.add(box([-15.86, SIGHT_T - 0.65, 0], [0.2, 0.5, 5.45], { r: 0.05 }), 'paint_white');
  const BLM = (BL0 + BL1) / 2;
  g.add(slotScrew([-13.5, BLM, 6.5], 1.45, 'w', 90, 0.6), 'steel_blued');
  g.add(lathe([[0, 0], [0, 1.1], [0.3, 0.8], [0.35, 0]], { seg: 12 }).rotateY(Math.PI / 2).translate(-6.5, BLM, 13.5), 'steel_dark');
  for (const [s, r, d] of [[-5.5, 2.0, 0.7], [5.2, 1.5, 0.5]]) {
    const hit = surfaceHit(leaf, V(s, 40, 0), T3(0, -1, 0));
    if (hit) g.add(slotScrew([s, hit.p.y - 0.25, 0], r, 't', 0, d), 'steel_blued');
  }
  for (const sg of [1, -1]) g.add(lathe([[0, 0], [0, 1.0], [0.15, 0.85], [0.2, 0]], { seg: 12 }).rotateY(-sg * Math.PI / 2).translate(sg * 4.5, RS + 1.3, -1.5), 'steel_dark');

  // ======================================================================= GRIPS (two wood panels, cut checkering)
  const fieldPts = fieldPoly();
  const WOOD = 'wood_light'; // reads better than 'wood' (saturated orange with crack-like grain) on these panels
  for (const side of [1, -1]) {
    const panel = gripHalf(side);
    // recessed field + border line: cutter = (field prism + border ring) minus the panel shrunk by the cut depth
    const prism = profile(fieldPts, { w: 40, cw: side * 22, bevel: 0, holes: [circle(ESC[0], ESC[1], 6.8)] });
    const floor = gripHalf(side, 0.5);
    const field = cutK(prism, floor);
    g.add(cutK(panel, field), WOOD);
    const chk = checker(panel, {
      O: V(0, 0, side * 60), A: FWD(), B: UP(), D: T3(-side, 0, 0),
      bounds: [(s, t) => fieldF(s, t, 0.65), (s, t) => 6.8 + 0.65 - Math.hypot(s - ESC[0], t - ESC[1])],
      uRange: [-100, -20], vRange: [-126, -50], d1: 2.6, d2: 1.7, sink: 0.58, top: 0.03, rot: 69 * DEG,
    });
    if (chk) g.add(chk, WOOD);
    // medallion near the top of each panel
    const med = surfaceHit(panel, V(-47.5, -50.5, side * 60), new THREE.Vector3(-side, 0, 0));
    if (med) {
      g.add(orientTo(lathe([[-0.4, 0], [-0.4, 4.4], [0.25, 4.4], [0.45, 4.0], [0.45, 0]], { seg: 28 }), med.p, med.n), 'steel_bright');
      const en = med.n.clone();
      const ey = new THREE.Vector3(0, 1, 0).addScaledVector(en, -en.y).normalize();
      const ex = new THREE.Vector3().crossVectors(ey, en);
      g.add(emblem(med.p.clone().addScaledVector(en, 0.45), ex, ey, en, 3.0, 0.34), 'steel_dark');
    }
    // escutcheon + grip screw (screw head on the left, nut on the right)
    const esc = surfaceHit(panel, V(ESC[0], ESC[1], side * 60), new THREE.Vector3(-side, 0, 0));
    if (esc) {
      g.add(orientTo(lathe([[-0.6, 0], [-0.6, 4.8], [0.15, 4.8], [0.3, 4.5], [0.3, 0]], { seg: 28 }), esc.p, esc.n), 'steel_bright');
      if (side < 0) {
        let head = lathe([[0.2, 0], [0.2, 3.3], [0.6, 3.15], [1.1, 2.4], [1.25, 0]], { seg: 24 });
        head = cut(head, box([0.95, 0, 0], [0.9, 0.7, 8], { r: 0, rot: [0, 0, 25] }));
        g.add(orientTo(head, esc.p, esc.n), 'steel_blued');
      } else {
        g.add(orientTo(lathe([[0.2, 0], [0.2, 2.6], [0.45, 2.4], [0.5, 0]], { seg: 20 }), esc.p, esc.n), 'steel_dark');
      }
    }
  }

  // ======================================================================= HAMMER (checkered target spur)
  const hammer = g.part('hammer', { pivot: [HAM[0], HAM[1], 0], extras: { axis: 'x', cock: 38, notes: 'rotate +x by `cock` deg to full cock' } });
  hammer.add(flatNormals(profile(filletPoly([
    [-14.9, 3.5, 0.8], [-14.9, -6, 1], [-18, -21, 5], [-30, -25.5, 7], [-40.5, -16, 6], [-39.4, -2, 3], [-36.4, 3.5, 0.8],
  ]), { w: 7.8, bevel: 0.8, bevelSeg: 2 }), ['x']), 'steel');
  const hst = hammerStations();
  hammer.add(flatNormals(loftS(hst, (s) => hammerRing(s, true)), ['x'], { crease: 50 }), 'steel');
  const spurRef = loftS(hst, (s) => hammerRing(s, false));
  const spurChk = checker(spurRef, {
    O: V(0, 40, 0), A: FWD(), B: RIGHT(), D: T3(0, -1, 0),
    bounds: [
      (s) => H_SF0 + 0.3 - s,
      (s) => s - (H_SF1 - 0.3),
      (s, w) => { const W = HWd(s); return Math.abs(w) - (W - hRt(HT(s), HU(s), W) - 0.35 - 0.3); },
    ],
    uRange: [-56, -36], vRange: [-6.5, 6.5], d1: 1.3, d2: 1.3, sink: H_DEP + 0.04, top: 0.03, rot: 45 * DEG, minDot: 0.35,
  });
  if (spurChk) hammer.add(spurChk, 'steel');
  hammer.add(cyl(-15.2, -12.3, 1.25, { t: 0, seg: 14 }), 'steel_bright'); // firing pin nose

  // ======================================================================= TRIGGER (wide target trigger, grooved face)
  const trigger = g.part('trigger', { pivot: [TRG[0], TRG[1], 0], extras: { axis: 'x', pull: -16, notes: 'rotate x by `pull` deg when fired' } });
  const tFace = (u) => { // quadratic front face (5.2,-47) ctrl (1.6,-57) -> (8.4,-67.2): concave finger cradle
    const a = [5.2, -47], c = [1.6, -57], b = [8.4, -67.2];
    return [(1 - u) ** 2 * a[0] + 2 * u * (1 - u) * c[0] + u * u * b[0], (1 - u) ** 2 * a[1] + 2 * u * (1 - u) * c[1] + u * u * b[1]];
  };
  // top kept under the window floor (t -37.6) so the tab never meets the cylinder
  let trig = profile('M -7.5 -39 L 5.2 -39 L 5.2 -47 Q 1.6 -57 8.4 -67.2 Q 8.6 -69.6 6.0 -69.4 Q 1.6 -68.8 -1.4 -62 Q -3.6 -55 -5.4 -49.4 L -8 -44 Z', { w: 9.6, bevel: 0.9, bevelSeg: 2, curveSeg: 8 });
  const gpts = [];
  for (let i = 0; i <= 7; i++) {
    const u = 0.06 + (i / 7) * 0.86, p = tFace(u), q = tFace(u + 0.01);
    const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy);
    gpts.push([p[0] + (dy / l) * 0.45, p[1] - (dx / l) * 0.45]); // 0.45 mm inside the face
  }
  const groovePoly = [...gpts, [16, gpts[gpts.length - 1][1] - 2], [16, gpts[0][1]]];
  trig = cutK(flatNormals(trig, ['x']), [-3.2, -1.6, 0, 1.6, 3.2].map((w) => profile(groovePoly, { w: 0.6, cw: w, bevel: 0 })));
  trigger.add(trig, 'steel');

  // ======================================================================= CRANE (swing-out yoke; parent of the cylinder)
  const crane = g.part('crane', { pivot: HINGE, extras: { axis: 'z', open: CRANE_OPEN, notes: 'rotate +z by `open` deg: cylinder swings out to the left' } });
  const arm = intersectK(
    extrudeW(armSide, [], { w: 18.5, cw: -1.25, bevel: 1.0, bevelSeg: 3, rim: 0.4, edge: 0.3 }),
    flatNormals(section(linkPoly(0), 42.8, 58.2, { bevel: 0 }), ['x', 'z']),
  );
  crane.add(arm, 'steel_blued');
  crane.add(cyl(1.1, 43.6, 4.5, { t: CYL_T, seg: 24 }), 'steel');                         // yoke barrel (cylinder bearing)
  crane.add(cyl(8, 43.6, 2.8, { t: HINGE[1], w: HINGE[2], seg: 16 }), 'steel');           // hinge tube in the frame
  crane.add(lathe([[42.75, 4.5], [42.75, 5.6], [43.15, 5.6], [43.15, 4.5]], { t: CYL_T, seg: 24 }), 'steel_bright'); // bearing collar

  // ======================================================================= CYLINDER (6 chambers, long flutes, stop notches)
  const cylinder = g.part('cylinder', { parent: 'crane', pivot: [CYL_S0, CYL_T, 0], extras: { axis: 'z', step: 60, chambers: 6, notes: 'rotate +z by `step` deg per shot (counter-clockwise seen from the rear)' } });
  let body = lathe([[CYL_S0, 0], [CYL_S0, CYL_R - 0.6], [CYL_S0 + 0.6, CYL_R], [CYL_S1 - 2.0, CYL_R], [CYL_S1 - 0.35, CYL_R - 1.0], [CYL_S1, CYL_R - 1.25], [CYL_S1, 0]], { t: CYL_T, seg: 60 });
  const cylCut = [cyl(-5, 60, 4.8, { t: CYL_T, b: 0, seg: 24 })];
  const capsule = (s0, s1, r, t, w) => {
    const pts = [[s0, 0]];
    for (let i = 1; i <= 6; i++) { const a = Math.PI - (i / 6) * Math.PI / 2; pts.push([s0 + r + r * Math.cos(a), r * Math.sin(a)]); }
    for (let i = 1; i <= 6; i++) { const a = Math.PI / 2 - (i / 6) * Math.PI / 2; pts.push([s1 - r + r * Math.cos(a), r * Math.sin(a)]); }
    return lathe(pts, { t, w, seg: 14 });
  };
  for (let k = 0; k < 6; k++) {
    const [w, t] = CHAMBERS[k];
    cylCut.push(cyl(-5, CYL_S1 - 5, 5.85, { t, w, b: 0, seg: 20 }));      // chamber
    cylCut.push(cyl(CYL_S1 - 5.2, 60, 5.5, { t, w, b: 0, seg: 20 }));     // throat
    cylCut.push(cyl(-5, CYL_S0 + 1.55, 6.68, { t, w, b: 0, seg: 20 }));   // rim counterbore
    const fa = (120 + 60 * k) * DEG, fr = CYL_R + 1.3;               // flute between chambers
    cylCut.push(capsule(9.5, 34.0, 4.3, CYL_T + fr * Math.sin(fa), fr * Math.cos(fa)));
    // stop notch over each chamber + its lead groove
    cylCut.push(xform(cutters.box([6.6, CYL_T + CYL_R, 0], [3.6, 1.8, 3.0]), { rot: [0, 0, 60 * k], pivot: [6.6, CYL_T, 0] }));
    cylCut.push(xform(cutters.box([6.6, CYL_T + CYL_R, 0], [3.0, 0.8, 4.4]), { rot: [0, 0, 60 * k - 9], pivot: [6.6, CYL_T, 0] }));
  }
  // recess for the extractor star
  const starPoly = (lobeR, arcR, n = 216) => {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
      let r = lobeR;
      for (const [cw, ct] of CHAMBERS) {
        const cx = cw, cy = ct - CYL_T;
        const b = dx * cx + dy * cy, cc = cx * cx + cy * cy - arcR * arcR, disc = b * b - cc;
        if (disc > 0) { const r1 = b - Math.sqrt(disc); if (r1 > 0 && r1 < r) r = r1; }
      }
      pts.push([dx * r, CYL_T + dy * r]);
    }
    return pts;
  };
  cylCut.push(section(starPoly(12.9, 6.5, 96), -3, CYL_S0 + 2.0, { bevel: 0 }));
  body = cut(body, cylCut);
  cylinder.add(flatNormals(body, ['z']), 'steel_blued');

  // ejector: star + ratchet + rod with knurled head (pushes rearward)
  const ejector = g.part('ejector', { parent: 'cylinder', pivot: [CYL_S0, CYL_T, 0], extras: { travel: 0.022, notes: 'slides back (+z) to extract the six cases' } });
  ejector.add(section(starPoly(12.5, 6.9, 96), CYL_S0 + 0.04, CYL_S0 + 2.0, { bevel: 0.2, bevelSeg: 1 }), 'steel_bright');
  const ratchet = [];
  for (let k = 0; k < 6; k++) {
    const a0 = (90 + 60 * k) * DEG;
    ratchet.push([3.9 * Math.cos(a0), CYL_T + 3.9 * Math.sin(a0)]);
    ratchet.push([5.5 * Math.cos(a0 + 50 * DEG), CYL_T + 5.5 * Math.sin(a0 + 50 * DEG)]);
    ratchet.push([5.3 * Math.cos(a0 + 57 * DEG), CYL_T + 5.3 * Math.sin(a0 + 57 * DEG)]);
  }
  ejector.add(section(ratchet, 0.1, CYL_S0 + 0.3, { bevel: 0.08 }), 'steel_bright');
  ejector.add(cyl(CYL_S0 + 1.5, 82, 2.9, { t: CYL_T, seg: 16 }), 'steel_blued');
  const knurl = [[81.5, 0], [81.5, 2.9]];
  for (let i = 0; i < 7; i++) { knurl.push([82 + i, 3.45]); knurl.push([82.5 + i, 3.1]); }
  knurl.push([89, 3.3], [89.6, 2.6], [89.8, 0]);
  ejector.add(lathe(knurl, { t: CYL_T, seg: 16 }), 'steel_blued');

  // six loaded .44 Magnum cartridges (rims + primers visible at the rear, bullet tips at the front)
  const shell = g.part('shell', { parent: 'cylinder', pivot: [CYL_S0, CYL_T, 0], extras: { count: 6, notes: 'six cartridges/cases; ride with the ejector, then drop' } });
  for (const [w, t] of CHAMBERS) {
    shell.add(lathe([[CYL_S0 + 0.12, 0], [CYL_S0 + 0.12, 6.25], [CYL_S0 + 0.3, 6.5], [CYL_S0 + 1.45, 6.5], [CYL_S0 + 1.6, 5.8], [33.3, 5.75], [33.3, 0]], { t, w, seg: 16 }), 'brass');
    shell.add(lathe([[CYL_S0 + 0.06, 0], [CYL_S0 + 0.06, 2.0], [CYL_S0 + 0.14, 2.2], [CYL_S0 + 0.6, 2.2], [CYL_S0 + 0.6, 0]], { t, w, seg: 12 }), 'steel_bright');
    shell.add(lathe([[33.2, 0], [33.2, 5.42], [37.2, 5.4], [39.8, 4.4], [41.0, 2.9], [41.2, 0]], { t, w, seg: 14 }), 'copper');
  }

  // ======================================================================= SOCKETS + META
  const sw = swungAxis();
  g.socket('muzzle', [MUZ, 0, 0]);
  g.socket('grip_r', [-58, -78, 0], { rot: [0, 0, -21] });
  g.socket('grip_l', [-50, -102, -4], { rot: [0, 0, -21] });
  g.socket('charge', [-50, 21, 0]);                       // hammer spur (thumb-cocked)
  g.socket('sight_rear', [-15.8, SIGHT_T, 0]);
  g.socket('sight_front', [201.5, SIGHT_T, 0]);
  g.socket('magwell', [-8, sw.t, sw.w], { notes: 'speed-loader position behind the swung-out cylinder' });
  g.socket('eject', [CYL_S0, sw.t, sw.w], { dir: [-1, -0.25, -0.15], notes: 'cases leave the swung-out cylinder rearward' });
  g.socket('latch', [-19, -9, -FW - 2.8]);                // cylinder release thumbpiece (left)
  // Workaround (kit/shader): wood grain follows the mesh's local z axis, which is the barrel axis, so a vertical
  // grip shows rings across it. Re-express the wood mesh in a frame whose z runs down the raked grip (world
  // positions and bake unchanged).
  const build0 = g.build.bind(g);
  g.build = (opts) => {
    const root = build0(opts);
    root.traverse((o) => {
      if (!o.isMesh || !String(o.userData.mat).startsWith('wood')) return;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 90 * DEG);
      o.geometry.applyQuaternion(q.clone().invert());
      o.quaternion.premultiply(q);
      o.updateMatrixWorld(true);
    });
    return root;
  };
  g.meta({
    grip: 'pistol', support: 'pistol_cup', reload: 'cylinder', chargeSide: 'rear',
    notes: 'Double-action revolver. Reload: push latch, rotate crane +z by crane.open deg (cylinder swings left), ' +
      'push ejector back by ejector.travel, drop shell, load via magwell socket, close crane. Fire: trigger pull + hammer cock/fall, ' +
      'cylinder steps +60 deg about its own z.',
  });
  return g;
}
