// 蝮蛇 Viper .44 — N-frame-pattern double-action .44 Magnum revolver (S&W Model 29 archetype) with a 6.5"
// full-lug barrel, ventilated rib, adjustable rear sight, fluted 6-shot cylinder and checkered wood target stocks.
//
// Side view, mm: s forward from the breech face (rear of the cylinder window), t up from the bore axis,
// w right. Real dimensions: OAL 305, barrel 165 (cylinder face -> muzzle), cylinder Ø44 x 42, 6 chambers.
// Moving parts: crane (swings the cylinder out to the LEFT on a hinge below it) > cylinder (spins on its axis)
// > ejector (star + rod, pushes back) / shell (6 cartridges); hammer; trigger.
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshBVH } from 'three-mesh-bvh';
import {
  Gun, V, DEG, makeShape, profile, section, lathe, cyl, box, screw, cut, cutters, merge, xform,
} from '../lib/gunkit.mjs';

// ------------------------------------------------------------------------------------------ key dimensions
const FW = 10.5;            // frame half width
const TOP = 16.6;           // topstrap / rib top
const CYL_T = -14.6;        // cylinder axis height (top chamber on the bore axis)
const CYL_R = 22;           // cylinder radius (Ø44)
const CH_R = 14.6;          // chamber bolt-circle radius
const CYL_S0 = 0.6, CYL_S1 = 42.6;   // cylinder rear / front faces (42 long)
const FF = 57.5;            // frame front face
const MUZ = CYL_S1 + 165;   // 207.6 muzzle (165 mm barrel)
const SIGHT_T = 22.2;       // sight line height (rear notch bottom = front blade top)
const BR = 9.8;             // barrel radius
const HAM = [-30, -14];     // hammer pin
const TRG = [-4, -42];      // trigger pin
const HINGE = [50, -41.5, -7.5]; // crane hinge axis (s, t, w)
const CRANE_OPEN = 85;      // degrees about +z (three) = cylinder swings to the left

// chamber centres (w, t) — chamber 0 is at 12 o'clock on the bore axis
const CHAMBERS = [...Array(6)].map((_, k) => {
  const a = (90 + 60 * k) * DEG;
  return [CH_R * Math.cos(a), CYL_T + CH_R * Math.sin(a)];
});

// ------------------------------------------------------------------------------------------ local helpers
// (kept in this file: the kit has no loft / checkering / lettering helpers)

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

/** Box along segment p0 -> p1 (three vectors) lying on a surface with normal en. */
function strokeBox(p0, p1, en, width, depth) {
  const dir = new THREE.Vector3().subVectors(p1, p0);
  const len = dir.length();
  dir.normalize();
  const perp = new THREE.Vector3().crossVectors(en, dir).normalize();
  const g = new THREE.BoxGeometry(len + width, width, depth);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(dir, perp, en));
  const c = p0.clone().add(p1).multiplyScalar(0.5).addScaledVector(en, depth / 2 - 0.04);
  g.translate(c.x, c.y, c.z);
  return clean(g);
}

/** Raised roll-mark lettering. o = left-bottom origin (three), ex = reading direction, ey = up, en = out. */
function markText(str, { o, ex, ey, en, h = 3, stroke = 0.42, depth = 0.14, align = 'left' }) {
  const u = h / 6, adv = 5.7 * u;
  const width = [...str].reduce((a, ch) => a + (ch === ' ' ? 4 * u : adv), 0) - 1.7 * u;
  let x = align === 'center' ? -width / 2 : 0;
  const parts = [];
  for (const ch of str) {
    for (const [x0, y0, x1, y1] of FONT[ch] || []) {
      const p0 = o.clone().addScaledVector(ex, x + x0 * u).addScaledVector(ey, y0 * u);
      const p1 = o.clone().addScaledVector(ex, x + x1 * u).addScaledVector(ey, y1 * u);
      parts.push(strokeBox(p0, p1, en, stroke, depth));
    }
    x += ch === ' ' ? 4 * u : adv;
  }
  return merge(parts);
}

/** Original maker's emblem: a ring with a fanged "V" inside. */
function emblem(o, ex, ey, en, r = 3.2, stroke = 0.38) {
  const parts = [];
  const P = (a, b) => o.clone().addScaledVector(ex, a).addScaledVector(ey, b);
  const n = 18;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    parts.push(strokeBox(P(r * Math.cos(a0), r * Math.sin(a0)), P(r * Math.cos(a1), r * Math.sin(a1)), en, stroke, 0.14));
  }
  const k = r * 0.62;
  parts.push(strokeBox(P(-k, k * 0.75), P(0, -k * 0.95), en, stroke * 1.1, 0.16));
  parts.push(strokeBox(P(k, k * 0.75), P(0, -k * 0.95), en, stroke * 1.1, 0.16));
  parts.push(strokeBox(P(-k * 0.45, k * 0.75), P(k * 0.45, k * 0.75), en, stroke * 0.9, 0.16));
  return merge(parts);
}

/**
 * Checkering: a lattice of low diamond pyramids shot onto a surface by ray casting.
 *  geo      surface (three space) to project onto
 *  O, A, B  plane the lattice lives on (O origin, A/B unit axes, three space); rays go along D (into the surface)
 *  inside(u, v) region test in plane coordinates; d1/d2 diamond diagonals (mm); rot lattice angle (rad)
 */
function checker(geo, { O, A, B, D, inside, uRange, vRange, d1, d2, h, sink = 0.12, rot = 0, minDot = 0.5 }) {
  const g = geo.clone();
  const bvh = new MeshBVH(g);
  const L1 = A.clone().multiplyScalar(Math.cos(rot)).addScaledVector(B, Math.sin(rot));
  const L2 = A.clone().multiplyScalar(-Math.sin(rot)).addScaledVector(B, Math.cos(rot));
  const uv = (p) => [p.dot(A), p.dot(B)];
  const ray = new THREE.Ray();
  const tris = [];
  const R = Math.hypot(uRange[1] - uRange[0], vRange[1] - vRange[0]);
  const cu = (uRange[0] + uRange[1]) / 2, cv = (vRange[0] + vRange[1]) / 2;
  const C0 = A.clone().multiplyScalar(cu).addScaledVector(B, cv);
  const ni = Math.ceil(R / (d1 / 2)), nj = Math.ceil(R / (d2 / 2));
  for (let i = -ni; i <= ni; i++) {
    for (let j = -nj; j <= nj; j++) {
      if ((i + j) & 1) continue;
      const c = C0.clone().addScaledVector(L1, (i * d1) / 2).addScaledVector(L2, (j * d2) / 2);
      const offs = [L1.clone().multiplyScalar(d1 / 2), L2.clone().multiplyScalar(d2 / 2), L1.clone().multiplyScalar(-d1 / 2), L2.clone().multiplyScalar(-d2 / 2)];
      if (!inside(...uv(c))) continue;
      if (!offs.every((o) => inside(...uv(c.clone().add(o))))) continue;
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
      const apex = P.clone().addScaledVector(n, h - sink);
      for (let k = 0; k < 4; k++) pushTri(tris, base[k], base[(k + 1) % 4], apex, n);
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

// ------------------------------------------------------------------------------------------ grip (target stocks)
// Lofted from horizontal slices: each slice is a super-ellipse between the front strap and the backstrap.
const gripFront = spline([[-131, -44.5], [-120, -43], [-100, -38.5], [-80, -33], [-62, -27.5], [-50, -23.5], [-40, -20]]);
const gripBack = spline([[-131, -96.0], [-126, -96.8], [-118, -94.5], [-100, -88], [-70, -76.5], [-45, -65], [-30, -58.5], [-18, -53]]);
const gripHalfW = spline([[-131, 13.6], [-116, 15.6], [-92, 16.6], [-72, 16.4], [-54, 14.6], [-40, 12.6], [-28, 11.5], [-18, 11.1]]);
// top edge of the wood runs diagonally along the frame from the trigger guard up to the tang
const gripDiag = (t) => -22.5 + (t + 48) * (-28.5 / 34);
const gripFrontAt = (t) => smin(gripFront(t), gripDiag(t), 5);
const G_TB = -131, G_TT = -21;

function gripHalf(side) {
  const seam = 0.22, N = 22, ex = 2.7, egg = 0.1, Rb = 6, Rt = 3.5;
  const ts = [];
  for (let i = 0; i <= 5; i++) ts.push(G_TB + Rb * (1 - Math.cos((i / 5) * Math.PI / 2)));
  const m0 = G_TB + Rb, m1 = G_TT - Rt, nm = Math.ceil((m1 - m0) / 3.4);
  for (let i = 1; i < nm; i++) ts.push(m0 + ((m1 - m0) * i) / nm);
  for (let i = 4; i >= 0; i--) ts.push(G_TT - Rt * (1 - Math.cos((i / 4) * Math.PI / 2)));
  const rings = ts.map((t) => {
    let d = 0;
    if (t < G_TB + Rb) { const y = t - G_TB; d = Rb - Math.sqrt(Math.max(0, Rb * Rb - (Rb - y) ** 2)); }
    if (t > G_TT - Rt) { const y = G_TT - t; d = Rt - Math.sqrt(Math.max(0, Rt * Rt - (Rt - y) ** 2)); }
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
      const Rl = 25.5 * fall;
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

/** Cylinder axis position (w, t) with the crane swung fully open. */
function swungAxis() {
  const a = CRANE_OPEN * DEG;
  const dw = 0 - HINGE[2], dt = CYL_T - HINGE[1];
  return { w: HINGE[2] + dw * Math.cos(a) - dt * Math.sin(a), t: HINGE[1] + dw * Math.sin(a) + dt * Math.cos(a) };
}

// ------------------------------------------------------------------------------------------ build
export default function build() {
  const g = new Gun('revolver');

  // ======================================================================= FRAME (one forging, C-shaped window)
  const frameOutline = [
    [FF, TOP, 1.0],
    [FF, -9.0, 0.6],
    [46.0, -9.0, 0.6],
    [46.0, 8.2, 1.4],
    [0.0, 8.2, 1.4],
    [0.0, -37.6, 1.4],
    [42.9, -37.6, 0.8],
    [42.9, -47.4, 0.5],
    [-18, -47.4, 3],
    [-30, -58, 6],
    [-46, -104, 4],
    [-62, -104, 4],
    [-57, -40, 10],
    [-52.5, -16, 8],
    [-47, -3, 8],
    [-35, 7, 10],
    [-22, 14.5, 8],
    [-14, TOP, 3],
  ];
  let frame = profile(frameOutline, { w: FW * 2, bevel: 1.2, curveSeg: 8 });

  // rounded topstrap (fillet cutters along both top corners)
  const filletCutter = (sg) => {
    const R = 3.6, cw = FW - R, ct = TOP - R;
    const pts = [[sg * cw, TOP + 2], [sg * (FW + 2), TOP + 2], [sg * (FW + 2), ct], [sg * FW, ct]];
    for (let i = 1; i < 12; i++) { const a = (i / 12) * Math.PI / 2; pts.push([sg * (cw + R * Math.cos(a)), ct + R * Math.sin(a)]); }
    pts.push([sg * cw, TOP]);
    return section(sg > 0 ? pts : pts.reverse(), -32, 60, { bevel: 0 });
  };
  // side plate (right side): pocket + plate leave a fine seam
  const plateOutline = [
    [-3.5, 5.5, 2], [-3.5, -33, 3], [-9, -43.5, 4], [-24, -45, 4], [-36, -66, 3], [-55, -60, 3],
    [-54, -38, 6], [-48.5, -13, 6], [-41, -3.5, 6], [-28, 3, 8], [-14, 6.5, 4],
  ];
  const platePocket = profile(offsetOutline(plateOutline, 0.32), { w: 4, cw: FW - 0.6 + 2, bevel: 0 });
  const grooves = (s0, s1) => [-3, -1.5, 0, 1.5, 3].map((w) => cutters.box([(s0 + s1) / 2, TOP, w], [s1 - s0, 0.7, 0.5]));
  frame = cut(frame, [
    filletCutter(1), filletCutter(-1),
    cutters.box([-34, 7.5, 0], [44, 45, 8.8]),            // hammer slot
    cutters.box([-3, TOP + 1.1, 0], [26, 4, 9.6]),          // rear sight seat (0.9 deep)
    ...grooves(10.5, 56.5),                                // matte topstrap lines
    platePocket,
    cyl(-1.5, 1.2, 1.6, { t: 0, b: 0, seg: 16 }),          // firing pin hole in the breech face
    cutters.box([-1.5, -46, 0], [15.5, 6, 10.2]),          // trigger slot
    cutters.box([7.75, -37.6, 0], [5.2, 2.4, 4.2]),        // cylinder stop window
    cutters.box([0, -8.5, 5.5], [3, 6, 2.4]),              // hand slot in the breech face
  ]);
  g.add(frame, 'steel_blued');
  // side plate + screws + emblem
  g.add(profile(plateOutline, { w: 0.65, cw: FW - 0.6 + 0.325 + 0.05, bevel: 0.25, bevelSeg: 1, curveSeg: 6 }), 'steel_blued');
  const PL = FW + 0.05;
  for (const [s, t, a] of [[-7, 1.5, 20], [-7.5, -25, 70], [-10.5, -39, 45], [-38, -6.5, 110]]) g.add(slotScrew([s, t, PL], 2.3, 'w', a, 0.75), 'steel_blued');
  g.add(emblem(V(-24, -19, PL), FWD(), UP(), RIGHT(), 4.2, 0.42), 'steel_dark');
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

  // cylinder release thumbpiece (left side, grooved)
  let thumb = profile([[-26, -8.5, 2.5], [-8, -8.5, 2], [-6.5, 1.5, 2], [-24, 2, 3]], { w: 2.8, cw: -FW - 1.2, bevel: 0.7, bevelSeg: 2, curveSeg: 6 });
  thumb = cut(thumb, [-22, -19.5, -17, -14.5, -12, -9.5].map((s) => cutters.box([s, -3.3, -FW - 2.75], [0.7, 14, 0.7])));
  g.add(thumb, 'steel_blued');
  g.add(slotScrew([-16, -5.5, -FW - 2.6], 1.3, '-w', 90, 0.5), 'steel_blued');

  // trigger guard (integral, rounded), open at the top where it runs into the frame
  g.add(profile([
    [42.4, -44, 0.5], [42.4, -49, 2], [38.5, -60, 8], [27, -73.5, 12], [6, -78.5, 12], [-12, -74.5, 10], [-22, -65, 6],
    [-27.5, -57, 2], [-26, -44, 0.5], [-19, -44, 0.5], [-19, -52, 3], [-16, -64, 5], [-8, -71.5, 7], [4, -74.5, 7],
    [20, -70, 9], [31, -59, 6], [34.5, -44, 0.5],
  ], { w: 7.6, bevel: 1.7, bevelSeg: 2, curveSeg: 8 }), 'steel_blued');

  // ======================================================================= BARREL (full lug + vent rib)
  g.add(lathe([
    [42.85, 7.0], [42.85, 8.2], [43.25, 8.6], [FF + 0.1, 8.6], [FF + 0.1, BR - 0.7], [FF + 0.9, BR], [MUZ - 0.8, BR],
    [MUZ, BR - 0.8], [MUZ, 7.4], [MUZ - 0.6, 5.45], [44.4, 5.45], [42.85, 7.0],
  ], { seg: 48 }), 'steel_blued');
  // rifling lands visible in the bore at the muzzle
  for (let k = 0; k < 6; k++) {
    g.add(xform(box([MUZ - 9.5, 5.3, 0], [17, 0.5, 1.5], { r: 0 }), { rot: [0, 0, 60 * k + 15], pivot: [MUZ - 9.5, 0, 0] }), 'steel_dark');
  }
  // full-length under-lug with the ejector-rod channel
  let lug = section([[-7.2, -3], [7.2, -3], [7.2, -21.8, 5.5], [-7.2, -21.8, 5.5]], FF + 0.1, MUZ - 1.0, { bevel: 1.1, bevelSeg: 2 });
  lug = cut(lug, [cyl(55, 91, 3.6, { t: CYL_T, b: 0, seg: 20 })]);
  g.add(lug, 'steel_blued');
  // ventilated rib: web with windows + top plate with matte lines
  const windows = [];
  for (let i = 0; i < 8; i++) {
    const a = 66 + i * 14.6;
    windows.push([[a, 9.3, 0.5], [a + 10.8, 9.3, 0.5], [a + 10.8, 13.4, 0.5], [a, 13.4, 0.5]]);
  }
  g.add(profile([[FF + 0.1, 8.0], [MUZ - 1.2, 8.0], [MUZ - 1.2, 13.6], [FF + 0.1, 13.6]], { w: 3.6, bevel: 0.35, bevelSeg: 1, curveSeg: 3, holes: windows }), 'steel_blued');
  let ribTop = section([[-4.7, 13.2, 0.5], [4.7, 13.2, 0.5], [4.7, TOP, 1.0], [-4.7, TOP, 1.0]], FF + 0.1, MUZ - 0.8, { bevel: 0.6, curveSeg: 4 });
  ribTop = cut(ribTop, grooves(59, 183));
  g.add(ribTop, 'steel_blued');
  // roll marks on the lug flats
  g.add(markText('CALAMITY ARMS', { o: V(72, -12.6, 7.2), ex: FWD(), ey: UP(), en: RIGHT(), h: 3.0, stroke: 0.44 }), 'steel_dark');
  g.add(markText('VIPER .44 MAGNUM', { o: V(122, -12.6, -7.2), ex: BACK(), ey: UP(), en: LEFT(), h: 3.0, stroke: 0.44 }), 'steel_dark');
  g.add(markText('CAL .44 MAG', { o: V(152, -12.0, 7.2), ex: FWD(), ey: UP(), en: RIGHT(), h: 2.2, stroke: 0.34 }), 'steel_dark');

  // front sight: pinned ramp with a red insert
  g.add(profile([[181, TOP - 0.6, 1], [205.6, TOP - 0.6, 0.8], [205.6, TOP + 2.0, 1], [183, TOP + 1.5, 1.5]], { w: 6, bevel: 0.6 }), 'steel_blued');
  g.add(profile([[185, TOP + 1.0, 1.5], [204.4, TOP + 1.0, 0.4], [204.4, SIGHT_T - 0.6, 0.5], [203.4, SIGHT_T, 0.4], [199.6, SIGHT_T, 0.5]], { w: 3.2, bevel: 0.45 }), 'steel_blued');
  { // red insert flush with the ramp slope near the top
    const k = (SIGHT_T - TOP - 1.0) / (199.6 - 185), at = (s) => TOP + 1.0 + (s - 185) * k;
    g.add(profile([[193.5, at(193.5) + 0.03], [199.4, at(199.4) + 0.03], [199.4, at(199.4) - 1.6], [194.6, at(194.6) - 1.7]], { w: 3.3, bevel: 0.15 }), 'paint_red');
  }
  for (const sg of [1, -1]) g.add(lathe([[0, 0], [0, 0.9], [0.15, 0.75], [0.2, 0]], { seg: 12 }).rotateY(-sg * Math.PI / 2).translate(sg * 3, TOP + 0.7, -187), 'steel_dark');

  // rear sight: leaf + blade with square notch, windage / elevation screws
  const RS = TOP - 0.9; // leaf seat
  g.add(profile([[-14, RS, 0.5], [9, RS, 0.5], [9, RS + 2.1, 1.6], [-4, RS + 3.6, 2.5], [-11, RS + 3.9, 0.5], [-14, RS + 3.9, 0.5]], { w: 9, bevel: 0.6 }), 'steel_blued');
  let blade = profile([[-15.8, RS + 1.6, 0.4], [-11.2, RS + 1.6, 0.4], [-11.2, SIGHT_T + 2.8, 0.5], [-15.8, SIGHT_T + 2.8, 0.5]], { w: 13, bevel: 0.5 });
  blade = cut(blade, [
    cutters.box([-13.5, SIGHT_T + 3.5, 0], [8, 7, 3.2]),
    ...[0, 1, 2, 3, 4].map((i) => cutters.box([-15.95, RS + 3.0 + i * 1.1, 0], [0.9, 0.45, 16])),
  ]);
  g.add(blade, 'steel_blued');
  g.add(slotScrew([-13.5, RS + 4.6, 6.5], 1.45, 'w', 90, 0.6), 'steel_blued');
  g.add(lathe([[0, 0], [0, 1.1], [0.3, 0.8], [0.35, 0]], { seg: 12 }).rotateY(Math.PI / 2).translate(-6.5, RS + 4.6, 13.5), 'steel_dark');
  g.add(slotScrew([-5.5, RS + 3.55, 0], 2.0, 't', 0, 0.7), 'steel_blued');
  g.add(slotScrew([5.2, RS + 1.6, 0], 1.5, 't', 0, 0.5), 'steel_blued');
  for (const sg of [1, -1]) g.add(lathe([[0, 0], [0, 1.0], [0.15, 0.85], [0.2, 0]], { seg: 12 }).rotateY(-sg * Math.PI / 2).translate(sg * 4.5, RS + 1.3, -1.5), 'steel_dark');

  // ======================================================================= GRIPS (two wood panels, checkered)
  const gripR = gripHalf(1), gripL = gripHalf(-1);
  g.add(gripR, 'wood');
  g.add(gripL, 'wood');
  const ESC = [(gripFrontAt(-84) + gripBack(-84)) / 2, -84];
  const panel = (s, t) => {
    const t0 = -123, t1 = -55;
    if (t < t0 || t > t1) return false;
    const smin_ = gripBack(t) + 6.5, smax = gripFrontAt(t) - 7.5;
    const u = (t - (t0 + t1) / 2) / ((t1 - t0) / 2), v = (s - (smin_ + smax) / 2) / ((smax - smin_) / 2);
    if (u ** 4 + v ** 4 > 1) return false;
    return Math.hypot(s - ESC[0], t - ESC[1]) > 6.8;
  };
  for (const [geo, side] of [[gripR, 1], [gripL, -1]]) {
    const chk = checker(geo, {
      O: V(0, 0, side * 60), A: FWD(), B: UP(), D: T3(-side, 0, 0),
      inside: panel, uRange: [-100, -20], vRange: [-126, -50], d1: 3.3, d2: 2.15, h: 0.62, sink: 0.15, rot: 111 * DEG,
    });
    if (chk) g.add(chk, 'wood');
    // medallion near the top of each panel
    const med = surfaceHit(geo, V(-47.5, -50.5, side * 60), new THREE.Vector3(-side, 0, 0));
    if (med) {
      g.add(orientTo(lathe([[-0.4, 0], [-0.4, 4.4], [0.25, 4.4], [0.45, 4.0], [0.45, 0]], { seg: 28 }), med.p, med.n), 'steel_bright');
      const en = med.n.clone();
      const ey = new THREE.Vector3(0, 1, 0).addScaledVector(en, -en.y).normalize();
      const ex = new THREE.Vector3().crossVectors(ey, en);
      g.add(emblem(med.p.clone().addScaledVector(en, 0.42), ex, ey, en, 3.0, 0.34), 'steel_dark');
    }
    // escutcheon + grip screw (screw head on the left, nut on the right)
    const esc = surfaceHit(geo, V(ESC[0], ESC[1], side * 60), new THREE.Vector3(-side, 0, 0));
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

  // ======================================================================= HAMMER (case-hardened, checkered target spur)
  const hammer = g.part('hammer', { pivot: [HAM[0], HAM[1], 0], extras: { axis: 'x', cock: 38, notes: 'rotate +x by `cock` deg to full cock' } });
  hammer.add(profile([
    [-13.2, 10, 1.5], [-13.2, -6, 1], [-18, -21, 5], [-30, -25.5, 7], [-40.5, -16, 6], [-42.5, -1, 3],
    [-44, 9.5, 3], [-42, 15.8, 4], [-30, 17.4, 8], [-19, 15.0, 5],
  ], { w: 8, bevel: 0.8, curveSeg: 6 }), 'steel');
  const spur = profile([[-37, 11.6, 1.5], [-46, 9.6, 3], [-55.5, 10.6, 2], [-57.4, 13.6, 2], [-50, 16.4, 6], [-38, 17.4, 3]], { w: 12.4, bevel: 1.0, bevelSeg: 2 });
  hammer.add(spur, 'steel');
  const spurChk = checker(spur, {
    O: V(0, 40, 0), A: FWD(), B: RIGHT(), D: T3(0, -1, 0),
    inside: (s, w) => s > -55.8 && s < -41.5 && Math.abs(w) < 5.0, uRange: [-56, -41], vRange: [-5.5, 5.5],
    d1: 1.9, d2: 1.5, h: 0.32, sink: 0.1, rot: 0, minDot: 0.35,
  });
  if (spurChk) hammer.add(spurChk, 'steel');
  hammer.add(cyl(-13.8, -12.3, 1.25, { t: 0, seg: 14 }), 'steel_bright'); // firing pin nose

  // ======================================================================= TRIGGER (wide target trigger, grooved face)
  const trigger = g.part('trigger', { pivot: [TRG[0], TRG[1], 0], extras: { axis: 'x', pull: -16, notes: 'rotate x by `pull` deg when fired' } });
  const tFace = (u) => { // quadratic front face (5.2,-47) ctrl (1.6,-57) -> (8.4,-67.2): concave finger cradle
    const a = [5.2, -47], c = [1.6, -57], b = [8.4, -67.2];
    return [(1 - u) ** 2 * a[0] + 2 * u * (1 - u) * c[0] + u * u * b[0], (1 - u) ** 2 * a[1] + 2 * u * (1 - u) * c[1] + u * u * b[1]];
  };
  let trig = profile('M -7.5 -36 L 5.2 -36 L 5.2 -47 Q 1.6 -57 8.4 -67.2 Q 8.6 -69.6 6.0 -69.4 Q 1.6 -68.8 -1.4 -62 Q -3.6 -55 -5.4 -49.4 L -8 -44 Z', { w: 9.6, bevel: 0.9, bevelSeg: 2, curveSeg: 8 });
  const gpts = [];
  for (let i = 0; i <= 7; i++) {
    const u = 0.06 + (i / 7) * 0.86, p = tFace(u), q = tFace(u + 0.01);
    const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy);
    gpts.push([p[0] + (dy / l) * 0.45, p[1] - (dx / l) * 0.45]); // 0.45 mm inside the face
  }
  const groovePoly = [...gpts, [16, gpts[gpts.length - 1][1] - 2], [16, gpts[0][1]]];
  trig = cut(trig, [-3.2, -1.6, 0, 1.6, 3.2].map((w) => profile(groovePoly, { w: 0.6, cw: w, bevel: 0 })));
  trigger.add(trig, 'steel');

  // ======================================================================= CRANE (swing-out yoke; parent of the cylinder)
  const crane = g.part('crane', { pivot: HINGE, extras: { axis: 'z', open: CRANE_OPEN, notes: 'rotate +z by `open` deg: cylinder swings out to the left' } });
  crane.add(profile([[43.3, -9.4, 0.6], [FF, -9.4, 0.6], [FF, -27, 10], [47, -47.4, 6], [43.3, -47.4, 0.5]], { w: FW * 2, bevel: 1.0 }), 'steel_blued');
  crane.add(cyl(1.4, 43.6, 4.5, { t: CYL_T, seg: 24 }), 'steel');                         // yoke barrel (cylinder bearing)
  crane.add(cyl(8, 43.6, 2.8, { t: HINGE[1], w: HINGE[2], seg: 16 }), 'steel');           // hinge tube in the frame
  crane.add(lathe([[42.75, 4.5], [42.75, 5.6], [43.4, 5.6], [43.4, 4.5]], { t: CYL_T, seg: 24 }), 'steel_bright'); // bearing collar

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
  cylinder.add(body, 'steel_blued');

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
  ejector.add(section(ratchet, 0.18, CYL_S0 + 0.3, { bevel: 0.1 }), 'steel_bright');
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
  g.socket('charge', [-51, 16, 0]);                       // hammer spur (thumb-cocked)
  g.socket('sight_rear', [-15.8, SIGHT_T, 0]);
  g.socket('sight_front', [201.5, SIGHT_T, 0]);
  g.socket('magwell', [-8, sw.t, sw.w], { notes: 'speed-loader position behind the swung-out cylinder' });
  g.socket('eject', [CYL_S0, sw.t, sw.w], { dir: [-1, -0.25, -0.15], notes: 'cases leave the swung-out cylinder rearward' });
  g.socket('latch', [-16, -3, -FW - 2.8]);                // cylinder release thumbpiece (left)
  // Workaround (kit/shader): wood grain follows the mesh's local z axis, which is the barrel axis, so a vertical
  // grip shows rings across it. Re-express the wood mesh in a frame whose z runs down the raked grip (world
  // positions and bake unchanged).
  const build0 = g.build.bind(g);
  g.build = (opts) => {
    const root = build0(opts);
    root.traverse((o) => {
      if (!o.isMesh || o.userData.mat !== 'wood') return;
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
