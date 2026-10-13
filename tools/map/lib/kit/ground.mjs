// Ground surfaces: flat / sloped areas split on the chunk grid, raised sidewalks with curbs, road markings,
// asphalt patches, manholes and drains.
import { ShapeUtils, Vector2, Matrix4 } from 'three';
import { Kit, ensureCCW, V } from './core.mjs';

/** Clips a convex polygon [[x, z]] to the axis rectangle [x0, z0, x1, z1] (Sutherland-Hodgman). */
export function clipRect(poly, x0, z0, x1, z1) {
  let out = poly;
  const edges = [[(p) => p[0] >= x0, (a, b) => { const t = (x0 - a[0]) / (b[0] - a[0]); return [x0, a[1] + (b[1] - a[1]) * t]; }],
    [(p) => p[0] <= x1, (a, b) => { const t = (x1 - a[0]) / (b[0] - a[0]); return [x1, a[1] + (b[1] - a[1]) * t]; }],
    [(p) => p[1] >= z0, (a, b) => { const t = (z0 - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, z0]; }],
    [(p) => p[1] <= z1, (a, b) => { const t = (z1 - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, z1]; }]];
  for (const [inside, cut] of edges) {
    if (!out.length) break;
    const inp = out;
    out = [];
    for (let i = 0; i < inp.length; i++) {
      const a = inp[(i + inp.length - 1) % inp.length], b = inp[i];
      const ia = inside(a), ib = inside(b);
      if (ib) { if (!ia) out.push(cut(a, b)); out.push(b); } else if (ia) out.push(cut(a, b));
    }
  }
  return out;
}

/** Triangulates a 2D polygon with holes: returns triangles [[x,z],[x,z],[x,z]] (CCW from above). */
export function triangulate2(poly, holes = []) {
  const c = ensureCCW(poly).map((p) => new Vector2(p[0], -p[1]));
  const hs = holes.map((h) => ensureCCW(h).reverse().map((p) => new Vector2(p[0], -p[1])));
  const all = [...c, ...hs.flat()];
  return ShapeUtils.triangulateShape(c, hs).map((t) => t.map((k) => [all[k].x, -all[k].y]));
}

/** Polygon offset (miter, convex/concave OK for small d). d > 0 grows a CCW polygon. */
export function offsetPoly(poly, d) {
  const p = ensureCCW(poly);
  const n = p.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = p[(i - 1 + n) % n], b = p[i], c = p[(i + 1) % n];
    const n1 = edgeNormal(a, b), n2 = edgeNormal(b, c);
    let m = [n1[0] + n2[0], n1[1] + n2[1]];
    const ml = Math.hypot(m[0], m[1]) || 1;
    m = [m[0] / ml, m[1] / ml];
    const cos = m[0] * n1[0] + m[1] * n1[1];
    const s = d / Math.max(0.25, cos);
    out.push([b[0] + m[0] * s, b[1] + m[1] * s]);
  }
  return out;
}
/** Outward normal (x, z) of edge a->b of a CCW (from above) polygon. */
export function edgeNormal(a, b) { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [-dz / l, dx / l]; }

Object.assign(Kit.prototype, {
  /**
   * Flat ground area. poly [[x, z]...], options: y (default 0), mat, holes, collide (default true),
   * heightAt(x, z) -> y for non-flat ground (vertices are evaluated, so keep slopes planar per chunk),
   * tint / grime / uvOffset / uvRot as face().
   * The area is split on the chunk grid (bounded lightmap charts, frustum culling).
   */
  ground(poly, o = {}) {
    const y = o.y || 0;
    const tris = triangulate2(poly, o.holes || []);
    const C = this.chunk;
    const byCell = new Map();
    for (const t of tris) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const p of t) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
      for (let ci = Math.floor(x0 / C); ci * C < x1; ci++) for (let cj = Math.floor(z0 / C); cj * C < z1; cj++) {
        const piece = clipRect(t, ci * C, cj * C, (ci + 1) * C, (cj + 1) * C);
        if (piece.length < 3) continue;
        const k = ci + ',' + cj;
        if (!byCell.has(k)) byCell.set(k, []);
        byCell.get(k).push(piece);
      }
    }
    const hy = o.heightAt || (() => y);
    // pieces are stored in world space and emitted by finalize(), after every building footprint is known,
    // so ground hidden under buildings is cut away (no wasted lightmap texels / overdraw)
    this._pendingGround ||= [];
    const { collide, heightAt, holes, ...fo } = o;
    void collide; void heightAt; void holes;
    for (const pieces of byCell.values()) {
      for (const piece of pieces) {
        const pts = ensureCCW(piece).map((p) => this.W([p[0], hy(p[0], p[1]), p[1]]));
        this._pendingGround.push({ pts, mat: o.mat, o: { ...fo, collide: false }, keep: !!o.keep });
      }
    }
    if (o.collide !== false) {
      const surf = typeof o.collide === 'string' ? o.collide : this.material(o.mat).surf;
      for (const t of tris) this.colPoly(t.map((p) => [p[0], hy(p[0], p[1]), p[1]]), surf);
    }
  },

  /** Registers a solid footprint (world [[x, z]], base y0, top y1): ground under it is removed by finalize(). */
  solid(poly, y0, y1) {
    const w = poly.map((p) => { const q = this.W([p[0], y0, p[1]]); return [q[0], q[2]]; });
    const by = this.W([poly[0][0], y0, poly[0][1]])[1];
    (this.solids ||= []).push({ poly: w, y0: by, y1: by + (y1 - y0) });
  },

  /** Emits the deferred ground pieces minus solid footprints (called by the compiler after build()). */
  finalize() {
    const pending = this._pendingGround || [];
    this._pendingGround = [];
    const solids = (this.solids || []).map((sd) => ({ ...sd, tris: triangulate2(sd.poly).map((t) => ccwXZ(t)), bb: bbox2(sd.poly) }));
    this.push(new Matrix4()); // pieces are already in world space
    const saved = this.stack;
    this.stack = [new Matrix4()];
    // ground layers stacked within a few cm (gravel lot laid over a sidewalk slab ...) hide the lower one
    for (const g of pending) { g.xz = ccwXZ(g.pts.map((p) => [p[0], p[2]])); g.bb = bbox2(g.xz); g.y = g.pts.reduce((a, p) => a + p[1], 0) / g.pts.length; }
    try {
      for (const g of pending) {
        let polys = [g.xz];
        const plane = planeOf(g.pts);
        const gy = g.y;
        if (!g.keep) {
          const pb = g.bb;
          for (const sd of solids) {
            if (gy < sd.y0 - 0.35 || gy > sd.y0 + 0.6) continue;
            if (pb[2] < sd.bb[0] || pb[0] > sd.bb[2] || pb[3] < sd.bb[1] || pb[1] > sd.bb[3]) continue;
            for (const tri of sd.tris) polys = polys.flatMap((pp) => subtractConvex(pp, tri));
            if (!polys.length) break;
          }
          for (const c of pending) {
            if (!polys.length) break;
            if (c === g || c.y - gy <= 0.004 || c.y - gy > 0.06) continue;
            if (pb[2] < c.bb[0] || pb[0] > c.bb[2] || pb[3] < c.bb[1] || pb[1] > c.bb[3]) continue;
            polys = polys.flatMap((pp) => subtractConvex(pp, c.xz));
          }
        }
        for (const pp of polys) {
          if (Math.abs(area2xz(pp)) < 1e-4) continue;
          const pts3 = pp.map(([x, z]) => [x, plane(x, z), z]);
          this.face(fixUpFacing(pts3), g.mat, g.o);
        }
      }
    } finally { this.stack = saved; this.pop(); }
  },

  /**
   * Raised slab (sidewalk, plaza, platform, loading dock) with vertical edges.
   * poly, y0 (base, default 0), y1 (top, default 0.15), mat (top), edge: material of the vertical faces
   * (default 'curb'), curb: width of the curb strip along the edges (default 0.18, 0 = none) in curbMat,
   * edges: array of edge indices that get a curb/vertical face (default all). Collides.
   */
  slab(poly, o = {}) {
    const y0 = o.y0 ?? 0, y1 = o.y1 ?? 0.15;
    const pts = ensureCCW(poly);
    const n = pts.length;
    const edges = o.edges ? new Set(o.edges) : null;
    const curbW = o.curb ?? 0.18;
    const edgeMat = o.edge || 'curb';
    const curbMat = o.curbMat || 'curb';
    // top: inner area (inset by the curb width on curbed edges) + curb strips
    let inner = pts;
    if (curbW > 0) {
      inner = insetEdges(pts, (i) => (!edges || edges.has(i) ? curbW : 0));
    }
    this.ground(inner, { ...o, y: y1, mat: o.mat, collide: false });
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const on = !edges || edges.has(i);
      if (on && curbW > 0) {
        const ia = inner[i], ib = inner[(i + 1) % n];
        this.face([[a[0], y1, a[1]], [ia[0], y1, ia[1]], [ib[0], y1, ib[1]], [b[0], y1, b[1]]].reverse(), curbMat, { uvLocal: false });
      }
      if (on || o.allSides) {
        if (y1 - y0 > 1e-3) this.face([[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]], on ? edgeMat : (o.side || edgeMat), { grime: o.grime });
      }
    }
    if (o.collide !== false) this.colPrism(pts, y0 - 0.05, y1, this.material(o.mat).surf);
  },

  /**
   * Road marking line along a polyline [[x, z]...]: width (0.12), dash [on, off] (m) or null for solid,
   * mat ('paint_white'), y (road top, default 0), double: gap (m) for double lines.
   */
  markLine(path, o = {}) {
    const w = o.width ?? 0.12, mat = o.mat || 'paint_white', y = (o.y || 0) + 0.008;
    const offsets = o.double ? [-(o.double + w) / 2, (o.double + w) / 2] : [0];
    for (const off of offsets) {
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i], b = path[i + 1];
        const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
        if (L < 1e-3) continue;
        const ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
        const segs = [];
        if (o.dash) { const [on, off2] = o.dash; for (let s = o.phase || 0; s < L; s += on + off2) segs.push([s, Math.min(L, s + on)]); } else segs.push([0, L]);
        for (const [s0, s1] of segs) {
          const p0 = [a[0] + ux * s0 + nx * off, a[1] + uz * s0 + nz * off], p1 = [a[0] + ux * s1 + nx * off, a[1] + uz * s1 + nz * off];
          const q = [[p0[0] - nx * w / 2, y, p0[1] - nz * w / 2], [p1[0] - nx * w / 2, y, p1[1] - nz * w / 2], [p1[0] + nx * w / 2, y, p1[1] + nz * w / 2], [p0[0] + nx * w / 2, y, p0[1] + nz * w / 2]];
          const u0 = this.rnd(0, 6), v0 = this.rnd(0, 6);
          this.upFace(q, mat, [[u0 + s0, v0], [u0 + s1, v0], [u0 + s1, v0 + w], [u0 + s0, v0 + w]]);
        }
      }
    }
  },

  /** Zebra crosswalk centred at [x, z], dir (radians, direction of travel of the road), across = road width. */
  crosswalk(o) {
    const [cx, cz] = o.at, len = o.length ?? 3.0, across = o.across ?? 8, stripe = o.stripe ?? 0.5, gap = o.gap ?? 0.6;
    const ang = o.dir || 0, ux = Math.cos(ang), uz = -Math.sin(ang), nx = -uz, nz = ux;
    const y = (o.y || 0) + 0.009;
    for (let s = -across / 2 + gap / 2; s + stripe <= across / 2; s += stripe + gap) {
      const c0 = [cx + nx * s, cz + nz * s], c1 = [cx + nx * (s + stripe), cz + nz * (s + stripe)];
      const q = [[c0[0] - ux * len / 2, y, c0[1] - uz * len / 2], [c0[0] + ux * len / 2, y, c0[1] + uz * len / 2], [c1[0] + ux * len / 2, y, c1[1] + uz * len / 2], [c1[0] - ux * len / 2, y, c1[1] - uz * len / 2]];
      const u0 = this.rnd(0, 4), v0 = this.rnd(0, 4);
      this.upFace(q, o.mat || 'paint_white', [[u0, v0], [u0 + len, v0], [u0 + len, v0 + stripe], [u0, v0 + stripe]]);
    }
  },

  /** Horizontal face that is flipped to face up if needed (uvs, given per point in metres, follow). */
  upFace(pts, mat, uvs, o = {}) {
    let s = 0;
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += (a[2] - b[2]) * (a[0] + b[0]); }
    if (s < 0) { pts = pts.slice().reverse(); if (uvs) uvs = uvs.slice().reverse(); }
    this.face(pts, mat, { ...o, uvs });
  },

  /** Decal patch (asphalt repair, stain): polygon at y + lift. */
  patch(poly, o = {}) {
    const y = (o.y || 0) + (o.lift ?? 0.006);
    this.face(fixUpFacing(ensureCCW(poly).map((p) => [p[0], y, p[1]]).reverse()), o.mat || 'asphalt_patch', { uvOffset: [this.rnd(0, 10), this.rnd(0, 10)], uvRot: this.rnd(0, 6.28) });
  },

  /**
   * Ground decal (stain, puddle, cracks, dirt): at [x, z], size (m, or [w, d]), rot, mat ('decal_stain'), y.
   * Decal materials use UV 0..1 over the quad and alpha-blend over the surface below.
   */
  decal(o) {
    const [w, d] = Array.isArray(o.size) ? o.size : [o.size ?? 2, o.size ?? 2];
    const y = (o.y || 0) + (o.lift ?? 0.012);
    const c = Math.cos(o.rot || 0), s = Math.sin(o.rot || 0);
    const P = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([px, pz]) => [o.at[0] + px * c + pz * s, y, o.at[1] - px * s + pz * c]);
    this.upFace(P, o.mat || 'decal_stain', [[0, 0], [1, 0], [1, 1], [0, 1]], { tint: o.tint });
  },

  /**
   * Scatters ground decals inside a polygon: count, mats (array or { mat: weight }), size [min, max], y,
   * avoid: [[x, z, r]...] keep-out circles.
   */
  scatterDecals(poly, o = {}) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of poly) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
    const mats = Array.isArray(o.mats) ? Object.fromEntries(o.mats.map((m) => [m, 1])) : o.mats || { decal_stain: 3, decal_cracks: 2, decal_dirt: 2, decal_puddle: 1 };
    const tot = Object.values(mats).reduce((a, b) => a + b, 0);
    const [s0, s1] = o.size || [1.2, 3.5];
    let placed = 0;
    for (let k = 0; k < (o.count ?? 8) * 6 && placed < (o.count ?? 8); k++) {
      const p = [this.rnd(x0, x1), this.rnd(z0, z1)];
      if (!inPoly(p, poly) || (o.avoid || []).some(([ax, az, r]) => Math.hypot(ax - p[0], az - p[1]) < r)) continue;
      let r = this.rnd(0, tot), mat = Object.keys(mats)[0];
      for (const [m, wgt] of Object.entries(mats)) { r -= wgt; if (r <= 0) { mat = m; break; } }
      const sz = this.rnd(s0, s1);
      this.decal({ at: p, size: [sz, sz * this.rnd(0.7, 1.3)], rot: this.rnd(0, 6.28), mat, y: o.y, lift: 0.01 + placed * 0.0004 });
      placed++;
    }
  },

  /** Round manhole cover (procedural iron disc) at [x, z]; r (0.32). */
  manhole(at, o = {}) {
    const r = o.r ?? 0.32, y = (o.y || 0) + 0.004, seg = 16;
    const ring = [];
    for (let i = 0; i < seg; i++) { const a = (i / seg) * Math.PI * 2; ring.push([at[0] + Math.cos(a) * r, y, at[1] - Math.sin(a) * r]); }
    this.face(ring.reverse().reverse(), o.mat || 'steel_dark', { uvLocal: false, tint: o.tint || '#7a7470' });
  },

  /** Curb-side storm drain grate on the road at a curb edge point. */
  drain(at, dir, o = {}) {
    this.at({ x: at[0], y: o.y || 0, z: at[1], rot: dir }, () => {
      this.box({ x: 0, y: -0.02, z: 0, w: 0.9, h: 0.03, d: 0.45, mat: 'steel_dark', tint: '#5a5550', faces: { bottom: false } });
    });
  },
});

const area2xz = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length]; a += q[0] * r[1] - r[0] * q[1]; } return a / 2; };
/** Counter-clockwise in the (x, z) plane (math convention: interior on the left of each edge). */
function ccwXZ(p) { return area2xz(p) >= 0 ? p.slice() : p.slice().reverse(); }
function bbox2(p) { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const q of p) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); } return [x0, z0, x1, z1]; }
/** Height function of the plane through a planar polygon (falls back to the mean height). */
function planeOf(pts) {
  const a = pts[0];
  for (let i = 1; i < pts.length - 1; i++) {
    const b = pts[i], c = pts[i + 1];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (Math.abs(n[1]) > 1e-9) return (x, z) => a[1] - (n[0] * (x - a[0]) + n[2] * (z - a[2])) / n[1];
  }
  const m = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return () => m;
}
/** Splits a convex polygon by the line a->b: [left (inside of a CCW clip edge), right]. */
function splitLine(poly, a, b) {
  const L = [], R = [];
  const side = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const sp = side(p), sq = side(q);
    if (sp >= 0) L.push(p);
    if (sp <= 0) R.push(p);
    if ((sp > 0 && sq < 0) || (sp < 0 && sq > 0)) {
      const t = sp / (sp - sq);
      const x = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
      L.push(x); R.push(x);
    }
  }
  return [L, R];
}
/** Convex polygon P minus convex polygon C (both CCW in x,z): list of convex pieces outside C. */
function subtractConvex(P, C) {
  const out = [];
  let rest = P;
  for (let i = 0; i < C.length && rest.length >= 3; i++) {
    const [inside, outside] = splitLine(rest, C[i], C[(i + 1) % C.length]);
    if (outside.length >= 3 && Math.abs(area2xz(outside)) > 1e-6) out.push(outside);
    rest = inside;
  }
  return out;
}

function inPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** Makes sure a horizontal face list is wound so its normal points up. */
export function fixUpFacing(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += (a[2] - b[2]) * (a[0] + b[0]); }
  // Newell y component = sum (z_i - z_j)(x_i + x_j); > 0 means +Y normal
  return s >= 0 ? pts : pts.slice().reverse();
}

/** Insets each edge i of a CCW polygon by d(i) (0 keeps it). */
export function insetEdges(pts, d) {
  const n = pts.length;
  const lines = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const nn = edgeNormal(a, b), dd = d(i);
    lines.push([[a[0] - nn[0] * dd, a[1] - nn[1] * dd], [b[0] - nn[0] * dd, b[1] - nn[1] * dd]]);
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const L1 = lines[(i - 1 + n) % n], L2 = lines[i];
    out.push(intersectLines(L1[0], L1[1], L2[0], L2[1]) || L2[0]);
  }
  return out;
}
export function intersectLines(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  return [a[0] + r[0] * t, a[1] + r[1] * t];
}
void V;
