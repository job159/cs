// Heightfield relief for cast faces (blade masks, plaques, cartouches), on top of gunkit.mjs.
// A face is a 2D region (outline + holes, in the caller's side-view mm, usually [s, t]) meshed by an adaptive,
// conforming Delaunay triangulation (quadtree points refined where h(x, y) bends, boundary points every `edge` mm),
// then lifted by the height function. Vertex normals come from h's gradient, so smooth sculpted volumes shade cleanly
// at a modest triangle count and flat areas stay exactly flat (no smoothing wedges from long earcut fans).
//   const F = hfFace(loops, h, { tol: 0.05, minCell: 0.6, maxCell: 8 });   // one face (+w), walls to its mirror
//   g.add(merge([F.face, mirror(F.face), F.walls]), 'bronze_aged');
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer';

await MeshoptSimplifier.ready;

const D2R = Math.PI / 180;

// ------------------------------------------------------------------------------------------ segment index
/**
 * Polylines (open or closed) with tags in a bucket grid: nearest-segment queries (distance, tag, arc-length position
 * along its polyline) and even-odd inside tests over the closed ones.
 */
export class SegIndex {
  constructor(lines, B = 4) {
    // lines: [{ pts: [[x, y]...], closed, tag }]
    this.B = B;
    const S = [];
    this.lines = lines.map((L, li) => {
      const P = L.pts, n = P.length, m = L.closed ? n : n - 1, cum = [0];
      for (let i = 0; i < m; i++) {
        const a = P[i], b = P[(i + 1) % n];
        S.push({ ax: a[0], ay: a[1], bx: b[0], by: b[1], li, i, tag: L.tag });
        cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
      }
      return { ...L, cum, len: cum[m] };
    });
    this.S = S;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of S) { x0 = Math.min(x0, s.ax, s.bx); y0 = Math.min(y0, s.ay, s.by); x1 = Math.max(x1, s.ax, s.bx); y1 = Math.max(y1, s.ay, s.by); }
    this.x0 = x0 - B; this.y0 = y0 - B;
    this.nx = Math.ceil((x1 - x0) / B) + 3; this.ny = Math.ceil((y1 - y0) / B) + 3;
    this.grid = Array.from({ length: this.nx * this.ny }, () => []);
    this.rows = Array.from({ length: this.ny }, () => []);   // segments by y band (inside tests)
    S.forEach((s, k) => {
      const i0 = this.cx(Math.min(s.ax, s.bx)), i1 = this.cx(Math.max(s.ax, s.bx)), j0 = this.cy(Math.min(s.ay, s.by)), j1 = this.cy(Math.max(s.ay, s.by));
      for (let j = j0; j <= j1; j++) {
        if (this.lines[s.li].closed) this.rows[j].push(k);
        for (let i = i0; i <= i1; i++) this.grid[j * this.nx + i].push(k);
      }
    });
    this._seen = new Int32Array(S.length); this._stamp = 0;
  }
  cx(x) { return Math.max(0, Math.min(this.nx - 1, Math.floor((x - this.x0) / this.B))); }
  cy(y) { return Math.max(0, Math.min(this.ny - 1, Math.floor((y - this.y0) / this.B))); }
  /** nearest segment within maxD: { d, tag, li, u (arc length along its line), k } or null */
  near(x, y, maxD = 12, filter = null) {
    const B = this.B, ci = Math.floor((x - this.x0) / B), cj = Math.floor((y - this.y0) / B);
    let best = null, bd = maxD * maxD;
    const st = ++this._stamp, seen = this._seen;
    const R = Math.ceil(maxD / B);
    for (let r = 0; r <= R; r++) {
      if (best && (r - 1) * B > Math.sqrt(bd)) break;
      for (let j = cj - r; j <= cj + r; j++) {
        if (j < 0 || j >= this.ny) continue;
        for (let i = ci - r; i <= ci + r; i++) {
          if (i < 0 || i >= this.nx || (Math.abs(i - ci) !== r && Math.abs(j - cj) !== r)) continue;
          for (const k of this.grid[j * this.nx + i]) {
            if (seen[k] === st) continue;
            seen[k] = st;
            const s = this.S[k];
            if (filter && !filter(s.tag)) continue;
            const dx = s.bx - s.ax, dy = s.by - s.ay, L2 = dx * dx + dy * dy || 1e-12;
            let t = ((x - s.ax) * dx + (y - s.ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
            const ex = s.ax + dx * t - x, ey = s.ay + dy * t - y, d2 = ex * ex + ey * ey;
            if (d2 < bd) { bd = d2; best = { k, t }; }
          }
        }
      }
    }
    if (!best) return null;
    const s = this.S[best.k], L = this.lines[s.li];
    return { d: Math.sqrt(bd), tag: s.tag, li: s.li, u: L.cum[s.i] + best.t * (L.cum[s.i + 1] - L.cum[s.i]), len: L.len, k: best.k };
  }
  /** even-odd inside test over the closed lines (optionally only those whose tag passes `filter`) */
  inside(x, y, filter = null) {
    const j = this.cy(y);
    let c = false;
    for (const k of this.rows[j]) {
      const s = this.S[k];
      if (filter && !filter(s.tag)) continue;
      if ((s.ay > y) !== (s.by > y) && x < s.ax + (y - s.ay) * (s.bx - s.ax) / (s.by - s.ay)) c = !c;
    }
    return c;
  }
  /** signed distance (> 0 inside the closed lines) */
  sd(x, y, maxD = 12, filter = null) {
    const n = this.near(x, y, maxD, filter), d = n ? n.d : maxD;
    return this.inside(x, y, filter) ? d : -d;
  }
}

// ------------------------------------------------------------------------------------------ Delaunay
/** Delaunay triangulation of 2D points (Bowyer-Watson, walking point location): Int32Array of ccw triangles. */
export function delaunay(X, Y) {
  const n = X.length;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) { x0 = Math.min(x0, X[i]); y0 = Math.min(y0, Y[i]); x1 = Math.max(x1, X[i]); y1 = Math.max(y1, Y[i]); }
  const D = Math.max(x1 - x0, y1 - y0) * 20 + 10, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const px = new Float64Array(n + 3), py = new Float64Array(n + 3);
  // a tiny deterministic jitter breaks exact collinear / cocircular ties (straight resampled outlines, grids)
  const J = Math.max(x1 - x0, y1 - y0, 1) * 2e-8;
  for (let i = 0; i < n; i++) { const r = Math.sin(i * 12.9898 + 0.5) * 43758.5453, q = Math.sin(i * 78.233 + 1.5) * 12543.123; px[i] = X[i] + (r - Math.floor(r) - 0.5) * J; py[i] = Y[i] + (q - Math.floor(q) - 0.5) * J; }
  px[n] = mx - D; py[n] = my - D; px[n + 1] = mx + D; py[n + 1] = my - D; px[n + 2] = mx; py[n + 2] = my + D;
  let cap = 2 * n + 64;
  let V = new Int32Array(cap * 3), N = new Int32Array(cap * 3), alive = new Uint8Array(cap), mark = new Int32Array(cap), test = new Int32Array(cap);
  let nt = 0;
  const free = [];
  const grow = () => {
    const c2 = cap * 2, V2 = new Int32Array(c2 * 3), N2 = new Int32Array(c2 * 3), a2 = new Uint8Array(c2), m2 = new Int32Array(c2), t2 = new Int32Array(c2);
    V2.set(V); N2.set(N); a2.set(alive); m2.set(mark); t2.set(test);
    V = V2; N = N2; alive = a2; mark = m2; test = t2; cap = c2;
  };
  const alloc = () => { if (free.length) return free.pop(); if (nt >= cap) grow(); return nt++; };
  const t0 = alloc();
  V[0] = n; V[1] = n + 1; V[2] = n + 2; N[0] = N[1] = N[2] = -1; alive[0] = 1;
  const orient = (a, b, x, y) => (px[b] - px[a]) * (y - py[a]) - (py[b] - py[a]) * (x - px[a]);
  const inCirc = (t, x, y) => {
    const a = V[t * 3], b = V[t * 3 + 1], c = V[t * 3 + 2];
    const adx = px[a] - x, ady = py[a] - y, bdx = px[b] - x, bdy = py[b] - y, cdx = px[c] - x, cdy = py[c] - y;
    return (adx * adx + ady * ady) * (bdx * cdy - cdx * bdy) - (bdx * bdx + bdy * bdy) * (adx * cdy - cdx * ady) + (cdx * cdx + cdy * cdy) * (adx * bdy - bdx * ady) > 0;
  };
  // insertion order: snake through y bands so the walk stays short
  const band = Math.max(1e-6, Math.sqrt(((x1 - x0) * (y1 - y0) || 1) / Math.max(1, n)) * 6);
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => {
    const ja = Math.floor((Y[a] - y0) / band), jb = Math.floor((Y[b] - y0) / band);
    return ja !== jb ? ja - jb : (ja & 1 ? X[b] - X[a] : X[a] - X[b]);
  });
  const byA = new Int32Array(n + 3).fill(-1), byB = new Int32Array(n + 3).fill(-1);
  let last = t0, stamp = 0;
  const bad = [], stack = [], edges = [];
  for (const p of order) {
    const x = px[p], y = py[p];
    // locate
    let t = last, steps = 0;
    for (;;) {
      let moved = false;
      const r = steps++ % 3;
      for (let j = 0; j < 3; j++) {
        const k = (j + r) % 3, a = V[t * 3 + (k + 1) % 3], b = V[t * 3 + (k + 2) % 3];
        if (orient(a, b, x, y) < 0 && N[t * 3 + k] >= 0) { t = N[t * 3 + k]; moved = true; break; }
      }
      if (!moved) break;
      if (steps > 4 * nt + 100) { for (let q = 0; q < nt; q++) if (alive[q]) { const a = V[q * 3], b = V[q * 3 + 1], c = V[q * 3 + 2]; if (orient(a, b, x, y) >= 0 && orient(b, c, x, y) >= 0 && orient(c, a, x, y) >= 0) { t = q; break; } } break; }
    }
    // cavity
    stamp++;
    bad.length = 0; stack.length = 0; edges.length = 0;
    mark[t] = stamp; bad.push(t); stack.push(t);
    while (stack.length) {
      const q = stack.pop();
      for (let k = 0; k < 3; k++) {
        const nb = N[q * 3 + k];
        if (nb < 0 || mark[nb] === stamp || test[nb] === stamp) continue;
        if (inCirc(nb, x, y)) { mark[nb] = stamp; bad.push(nb); stack.push(nb); } else test[nb] = stamp;
      }
    }
    for (const q of bad) for (let k = 0; k < 3; k++) {
      const nb = N[q * 3 + k];
      if (nb >= 0 && mark[nb] === stamp) continue;
      edges.push(V[q * 3 + (k + 1) % 3], V[q * 3 + (k + 2) % 3], nb, q);
    }
    for (const q of bad) { alive[q] = 0; free.push(q); }
    const made = [];
    for (let e = 0; e < edges.length; e += 4) {
      const a = edges[e], b = edges[e + 1], nb = edges[e + 2], old = edges[e + 3];
      const T = alloc();
      alive[T] = 1; mark[T] = 0; test[T] = 0;
      V[T * 3] = p; V[T * 3 + 1] = a; V[T * 3 + 2] = b;
      N[T * 3] = nb;
      if (nb >= 0) for (let k = 0; k < 3; k++) if (N[nb * 3 + k] === old) { N[nb * 3 + k] = T; break; }
      byA[a] = T; byB[b] = T;
      made.push(T);
    }
    for (const T of made) { N[T * 3 + 1] = byA[V[T * 3 + 2]]; N[T * 3 + 2] = byB[V[T * 3 + 1]]; }
    last = made[0];
  }
  const out = [];
  for (let t = 0; t < nt; t++) {
    if (!alive[t]) continue;
    const a = V[t * 3], b = V[t * 3 + 1], c = V[t * 3 + 2];
    if (a >= n || b >= n || c >= n) continue;
    if ((X[b] - X[a]) * (Y[c] - Y[a]) - (Y[b] - Y[a]) * (X[c] - X[a]) <= 1e-10) continue;   // hull slivers of collinear points
    out.push(a, b, c);
  }
  return Int32Array.from(out);
}

// ------------------------------------------------------------------------------------------ region mesh
const loopArea = (P) => { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
/** closed polyline resampled so no segment exceeds `step` (corners kept) */
export function resampleLoop(P, step) {
  const out = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-6) continue;
    const k = Math.max(1, Math.ceil(L / step));
    for (let j = 0; j < k; j++) out.push([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]);
  }
  return out;
}

/**
 * Adaptive mesh of a region: loops = [{ pts, tag }] (the first is the outline, the rest holes; resampled to `edge`).
 * h(x, y) drives the refinement (bilinear error > tol splits a cell down to minCell); refine(x, y, size) may force
 * splits. Returns { X, Y, T, bnd } with bnd = per loop the vertex indices in order (outline ccw, holes cw).
 */
export function regionMesh(loops, h, { tol = 0.05, minCell = 0.6, maxCell = 8, edge = 1.2, refine = null, idx = null } = {}) {
  const L = loops.map((l, i) => {
    let P = resampleLoop(l.pts, edge);
    const ccw = loopArea(P) > 0;
    if ((i === 0) !== ccw) P = P.reverse();
    return { pts: P, tag: l.tag, closed: true };
  });
  const SI = idx || new SegIndex(L, Math.max(2, edge * 3));
  const inR = (x, y) => SI.inside(x, y);
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const p of L[0].pts) { bx0 = Math.min(bx0, p[0]); by0 = Math.min(by0, p[1]); bx1 = Math.max(bx1, p[0]); by1 = Math.max(by1, p[1]); }
  const pts = new Map(), q = minCell / 8;
  const addP = (x, y) => { const k = Math.round(x / q) + ',' + Math.round(y / q); if (!pts.has(k)) pts.set(k, [x, y]); };
  const S = 4;   // error samples per cell side
  // quadtree: split by the bilinear error of h (and near the boundary), then 2:1 balanced so a coarse cell never
  // borders a much finer one (Delaunay would fan needles from its corner up a steep wall: sawtooth spikes)
  const ox = bx0 - maxCell * 0.5, oy = by0 - maxCell * 0.5, NX = Math.ceil((bx1 - ox) / maxCell) + 1, NY = Math.ceil((by1 - oy) / maxCell) + 1;
  const roots = new Array(NX * NY).fill(null);
  const want = (x, y, sz) => {
    const c = sz * 0.5, cxm = x + c, cym = y + c;
    if (sz <= minCell * 1.01) return false;
    const nb = SI.near(cxm, cym, sz * 0.72 + edge);
    if ((nb && sz > edge * 1.25) || (refine && refine(cxm, cym, sz))) return true;
    const nearB = SI.near(cxm, cym, sz * 0.72 + edge * 0.5);
    if (nearB && sz < edge * 0.9) return false;
    const h00 = h(x, y), h10 = h(x + sz, y), h01 = h(x, y + sz), h11 = h(x + sz, y + sz);
    for (let j = 0; j <= S; j++) for (let i = 0; i <= S; i++) {
      if ((i === 0 || i === S) && (j === 0 || j === S)) continue;
      const u = i / S, v = j / S, bi = (h00 * (1 - u) + h10 * u) * (1 - v) + (h01 * (1 - u) + h11 * u) * v;
      if (Math.abs(h(x + u * sz, y + v * sz) - bi) > tol) return true;
    }
    return false;
  };
  const kids = (n) => { const s2 = n.sz / 2; n.k = [[0, 0], [s2, 0], [0, s2], [s2, s2]].map(([dx, dy]) => ({ x: n.x + dx, y: n.y + dy, sz: s2, k: null })); return n.k; };
  const grow = (n) => {
    const c = n.sz * 0.5;
    if (!inR(n.x + c, n.y + c) && !SI.near(n.x + c, n.y + c, n.sz * 0.72 + edge)) { n.out = true; return; }   // wholly outside
    if (want(n.x, n.y, n.sz)) for (const k of kids(n)) grow(k);
  };
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const n = { x: ox + i * maxCell, y: oy + j * maxCell, sz: maxCell, k: null }; roots[j * NX + i] = n; grow(n); }
  const leafAt = (x, y) => {
    const i = Math.floor((x - ox) / maxCell), j = Math.floor((y - oy) / maxCell);
    if (i < 0 || j < 0 || i >= NX || j >= NY) return null;
    let n = roots[j * NX + i];
    while (n.k) { const s2 = n.sz / 2; n = n.k[(x >= n.x + s2 ? 1 : 0) + (y >= n.y + s2 ? 2 : 0)]; }
    return n;
  };
  const leaves = [];
  const collect = (n) => { if (n.k) n.k.forEach(collect); else if (!n.out) leaves.push(n); };
  roots.forEach(collect);
  for (let it = 0, changed = true; changed && it < 12; it++) {
    changed = false;
    const list = leaves.splice(0);
    for (const n of list) {
      if (n.k) continue;
      const e = n.sz * 1e-3, probes = [];
      for (const f of [0.25, 0.75]) probes.push([n.x - e, n.y + n.sz * f], [n.x + n.sz + e, n.y + n.sz * f], [n.x + n.sz * f, n.y - e], [n.x + n.sz * f, n.y + n.sz + e]);
      if (probes.some(([px, py]) => { const m = leafAt(px, py); return m && !m.out && m.sz < n.sz * 0.49; })) { for (const k of kids(n)) leaves.push(k); changed = true; } else leaves.push(n);
    }
  }
  for (const n of leaves) { const { x, y, sz } = n; addP(x, y); addP(x + sz, y); addP(x, y + sz); addP(x + sz, y + sz); }
  const X = [], Y = [], bnd = [];
  for (const l of L) { const ids = []; for (const p of l.pts) { ids.push(X.length); X.push(p[0]); Y.push(p[1]); } bnd.push(ids); }
  const nB = X.length;
  for (const [x, y] of pts.values()) {
    if (!inR(x, y)) continue;
    const nb = SI.near(x, y, edge);
    if (nb && nb.d < edge * 0.5) continue;                       // keeps the boundary edges' diametral circles empty
    X.push(x); Y.push(y);
  }
  const Tall = delaunay(X, Y), T = [];
  for (let i = 0; i < Tall.length; i += 3) {
    const a = Tall[i], b = Tall[i + 1], c = Tall[i + 2];
    const gx = (X[a] + X[b] + X[c]) / 3, gy = (Y[a] + Y[b] + Y[c]) / 3;
    if (a < nB && b < nB && c < nB && !inR(gx, gy)) continue;
    if (!inR(gx, gy)) continue;
    T.push(a, b, c);
  }
  return { X, Y, T, bnd, loops: L, SI, ox, oy };
}

// ------------------------------------------------------------------------------------------ faces
/** quarter-round fall-off of radius r at distance d (>= 0) from an edge: 0 inside, r at the edge */
export const roundDrop = (d, r) => (d >= r ? 0 : r - Math.sqrt(Math.max(0, r * r - (r - d) * (r - d))));

/**
 * One face of a region lifted by h: map(x, y, z) -> [s, t, w] (default the +w face: [x, y, z]). Normals from the
 * gradient of h through the map; boundary vertices lean out along the boundary normal (they meet the walls).
 * Returns { face, walls, M } (walls join the face's boundary to its mirror through w = 0 when `walls` is set).
 */
export function hfFace(loops, h, opts = {}) {
  const { map = (x, y, z) => [x, y, z], walls = true, eps = 0.03, lean = 0.12, decimate = null } = opts;
  const M = regionMesh(loops, h, opts);
  const { X, Y, bnd } = M, n = X.length;
  let T = M.T;
  const Z = new Float64Array(n);
  for (let i = 0; i < n; i++) Z[i] = h(X[i], Y[i]);
  // boundary normals (2D, away from the material: the material is left of every loop)
  const bn = new Map();
  for (const ids of bnd) for (let k = 0; k < ids.length; k++) {
    const a = ids[(k - 1 + ids.length) % ids.length], b = ids[k], c = ids[(k + 1) % ids.length];
    const e1 = [X[b] - X[a], Y[b] - Y[a]], e2 = [X[c] - X[b], Y[c] - Y[b]], l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1;
    const nx = e1[1] / l1 + e2[1] / l2, ny = -e1[0] / l1 - e2[0] / l2, l = Math.hypot(nx, ny) || 1;
    bn.set(b, [nx / l, ny / l]);
  }
  const vN = new Array(n);
  const toV3 = (p) => new THREE.Vector3(p[2], p[1], -p[0]);
  for (let i = 0; i < n; i++) {
    const x = X[i], y = Y[i];
    let nrm;
    const o = toV3(map(x, y, Z[i]));
    if (bn.has(i)) {
      const [bx, by] = bn.get(i);
      const up = toV3(map(x, y, Z[i] + 1)).sub(o).normalize(), side = toV3(map(x + bx, y + by, Z[i])).sub(o).normalize();
      nrm = side.multiplyScalar(1).addScaledVector(up, lean).normalize();
    } else {
      const hx = (h(x + eps, y) - h(x - eps, y)) / (2 * eps), hy = (h(x, y + eps) - h(x, y - eps)) / (2 * eps);
      const du = toV3(map(x + 1, y, Z[i] + hx)).sub(o), dv = toV3(map(x, y + 1, Z[i] + hy)).sub(o);
      nrm = du.cross(dv).normalize();
    }
    vN[i] = [o, nrm];
  }
  // decimate (QEM, meshoptimizer): the isotropic quadtree mesh collapses into long triangles along ridges and big ones
  // on flats; vertices keep their positions and analytic normals, the boundary stays locked for the walls
  if (decimate) {
    // attributes: the normal, and a horizon-occlusion estimate from h (the bake's per-vertex AO needs vertices wherever
    // occlusion changes, which is often on flat ground next to a tall feature, where the normal says nothing)
    const pos = new Float32Array(n * 3), att = new Float32Array(n * 4), wA = decimate.ao ?? 0;
    for (let i = 0; i < n; i++) { const [o, nr] = vN[i]; pos.set([o.x, o.y, o.z], i * 3); att.set([nr.x, nr.y, nr.z, wA ? horizonAO(h, X[i], Y[i], Z[i]) : 0], i * 4); }
    const wN = decimate.normals ?? 0.4;
    // a lattice of locked vertices (every `lattice` mm) bounds how long a triangle can get: no long fans streaking a
    // tilted normal (or the baked AO) across a flat
    let lock = null;
    if (decimate.lattice) {
      const L = decimate.lattice, x0 = M.ox, y0 = M.oy;
      lock = new Uint8Array(n);
      for (let i = 0; i < n; i++) { const fx = (X[i] - x0) / L, fy = (Y[i] - y0) / L; if (Math.abs(fx - Math.round(fx)) < 1e-6 && Math.abs(fy - Math.round(fy)) < 1e-6) lock[i] = 1; }
    }
    const [I2] = MeshoptSimplifier.simplifyWithAttributes(Uint32Array.from(T), pos, 3, att, 4, [wN, wN, wN, wA], lock, 0, decimate.error ?? 0.05, ['LockBorder', 'ErrorAbsolute', ...(decimate.flags || [])]);
    T = Array.from(I2);
    M.T = T;
  }
  // orientation: ccw in (x, y) must face the map's +z
  const o0 = toV3(map(0, 0, 0)), su = toV3(map(1, 0, 0)).sub(o0), sv = toV3(map(0, 1, 0)).sub(o0), sz = toV3(map(0, 0, 1)).sub(o0);
  const flip = su.cross(sv).dot(sz) < 0;
  const P = new Float32Array(T.length * 3), Nn = new Float32Array(T.length * 3);
  for (let t = 0; t < T.length; t += 3) for (let k = 0; k < 3; k++) {
    const i = T[t + (flip ? [0, 2, 1][k] : k)], [o, nr] = vN[i];
    P[(t + k) * 3] = o.x; P[(t + k) * 3 + 1] = o.y; P[(t + k) * 3 + 2] = o.z;
    Nn[(t + k) * 3] = nr.x; Nn[(t + k) * 3 + 1] = nr.y; Nn[(t + k) * 3 + 2] = nr.z;
  }
  const face = new THREE.BufferGeometry();
  face.setAttribute('position', new THREE.BufferAttribute(P, 3));
  face.setAttribute('normal', new THREE.BufferAttribute(Nn, 3));
  let W = null;
  if (walls) {
    // quads from each boundary vertex at +z(h) to its mirror (-z), creased normals
    const WP = [];
    const mir = (p) => [p[0], p[1], -p[2]];
    for (const ids of bnd) for (let k = 0; k < ids.length; k++) {
      const a = ids[k], b = ids[(k + 1) % ids.length];
      const A = map(X[a], Y[a], Z[a]), Bp = map(X[b], Y[b], Z[b]), A2 = mir(A), B2 = mir(Bp);
      // material left of a->b: the wall faces right
      const ex = X[b] - X[a], ey = Y[b] - Y[a], out = toV3(map(X[a] + ey, Y[a] - ex, Z[a])).sub(toV3(A));
      const quad = [A, Bp, B2, A, B2, A2].map(toV3);
      const fn = quad[1].clone().sub(quad[0]).cross(quad[2].clone().sub(quad[0]));
      const q = fn.dot(out) < 0 ? [quad[0], quad[2], quad[1], quad[3], quad[5], quad[4]] : quad;
      for (const v of q) WP.push(v.x, v.y, v.z);
    }
    W = new THREE.BufferGeometry();
    W.setAttribute('position', new THREE.BufferAttribute(new Float32Array(WP), 3));
    W = toCreasedNormals(W, 40 * D2R);
  }
  return { face, walls: W, M };
}

/** Mirror across w = 0 keeping the (already mirrored) normals right: scale then flip the winding. */
export function mirror(geo) {
  const g = geo.clone();
  g.scale(-1, 1, 1);
  const p = g.attributes.position.array, n = g.attributes.normal?.array;
  for (let i = 0; i < p.length; i += 9) for (let c = 0; c < 3; c++) {
    let t = p[i + 3 + c]; p[i + 3 + c] = p[i + 6 + c]; p[i + 6 + c] = t;
    if (n) { t = n[i + 3 + c]; n[i + 3 + c] = n[i + 6 + c]; n[i + 6 + c] = t; }
  }
  return g;
}

/**
 * A thin plate laid on a heightfield (gold leaf, enamel floors): region `loops` meshed and lifted to h + top, with a
 * wall down to h + bot. Returns one geometry (+w side; mirror() it for the other face).
 */
export function sheet(loops, h, top = 0.35, bot = -0.3, opts = {}) {
  const { map = (x, y, z) => [x, y, z] } = opts;
  const F = hfFace(loops, (x, y) => h(x, y) + top, { ...opts, map, walls: false, maxCell: opts.maxCell ?? 4, tol: opts.tol ?? 0.04 });
  const { X, Y, bnd } = F.M, WP = [], toV3 = (p) => new THREE.Vector3(p[2], p[1], -p[0]);
  for (const ids of bnd) for (let k = 0; k < ids.length; k++) {
    const a = ids[k], b = ids[(k + 1) % ids.length];
    const A = map(X[a], Y[a], h(X[a], Y[a]) + top), Bp = map(X[b], Y[b], h(X[b], Y[b]) + top);
    const A2 = map(X[a], Y[a], h(X[a], Y[a]) + bot), B2 = map(X[b], Y[b], h(X[b], Y[b]) + bot);
    const ex = X[b] - X[a], ey = Y[b] - Y[a], out = toV3(map(X[a] + ey, Y[a] - ex, 0)).sub(toV3(map(X[a], Y[a], 0)));
    const quad = [A, Bp, B2, A, B2, A2].map(toV3);
    const fn = quad[1].clone().sub(quad[0]).cross(quad[2].clone().sub(quad[0]));
    const q = fn.dot(out) < 0 ? [quad[0], quad[2], quad[1], quad[3], quad[5], quad[4]] : quad;
    for (const v of q) WP.push(v.x, v.y, v.z);
  }
  let W = new THREE.BufferGeometry();
  W.setAttribute('position', new THREE.BufferAttribute(new Float32Array(WP), 3));
  W = toCreasedNormals(W, 40 * D2R);
  const g = new THREE.BufferGeometry();
  const fp = F.face.attributes.position.array, fnm = F.face.attributes.normal.array, wp = W.attributes.position.array, wn = W.attributes.normal.array;
  const P = new Float32Array(fp.length + wp.length), N = new Float32Array(fp.length + wp.length);
  P.set(fp); P.set(wp, fp.length); N.set(fnm); N.set(wn, fp.length);
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  return g;
}

/** horizon-based ambient occlusion of a heightfield at (x, y) (0 open .. 1 buried): 8 directions, steps to 12 mm */
export function horizonAO(h, x, y, z = h(x, y)) {
  let occ = 0;
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4 + 0.2, dx = Math.cos(a), dy = Math.sin(a);
    let m = 0;
    for (const r of [1.5, 4, 8, 13]) m = Math.max(m, (h(x + dx * r, y + dy * r) - z) / r);
    occ += m / Math.sqrt(1 + m * m);
  }
  return occ / 8;
}

// ------------------------------------------------------------------------------------------ height primitives
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const sstep = (a, b, x) => { const u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); };
/** rolled (half-round) ridge profile at distance d from its spine (half width r), filleted into its foot: 0..1 */
export const halfRound = (d, r) => { if (d >= r) return 0; const x = d / r, u = Math.min(1, (1 - x) / 0.45); return Math.sqrt(1 - x * x) * u * u * (3 - 2 * u); };
/** smooth bump (cos^2) of radii rx, ry about (cx, cy): 0..1 */
export const bump = (x, y, cx, cy, rx, ry) => { const q = Math.hypot((x - cx) / rx, (y - cy) / ry); return q >= 1 ? 0 : Math.cos(q * Math.PI / 2) ** 2; };
/** plateau of height 1 inside (signed distance sd > 0 inside) with a rounded bevel of width b (convex top edge) */
export const plateau = (sd, b) => (sd <= 0 ? 0 : sd >= b ? 1 : 1 - (1 - sd / b) * (1 - sd / b));
/** smooth max (k = blend width) */
export const smax = (a, b, k = 0.5) => { const hh = clamp01(0.5 + 0.5 * (a - b) / k); return b + (a - b) * hh + k * hh * (1 - hh); };
export const smin = (a, b, k = 0.5) => -smax(-a, -b, k);
