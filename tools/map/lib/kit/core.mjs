// Map kit core: geometry accumulation (per material x chunk), transform stack, primitives with world-space
// UVs, collision soup, gameplay data. Feature modules (ground, arch, street, vehicles) add methods to Kit.
//
// Conventions (same as every map layout): metres; +X east, +Y up, +Z south (north = -Z).
// rot = three.js rotation.y (radians, counter-clockwise seen from above): local +X -> (cos, 0, -sin).
// Faces are counter-clockwise seen from their front. Points are [x, y, z]; 2D ground points [x, z].
// UVs: unless given, every planar face gets "world" UVs in metres projected on the face plane
//   (vertical faces: u along cross(up, n), v = height; floors: u = x, v = -z), divided by the material's
//   tile size, so textures line up across pieces and keep their real-world scale.
import * as THREE from 'three';
import { ShapeUtils } from 'three';
import { resolveMaterial } from '../materials.mjs';

export const SURF = { concrete: 0, metal: 1, wood: 2, dirt: 3, glass: 4, flesh: 5, water: 6, tile: 7, sand: 8, grate: 9 };
export const NAVF = { WALK: 1, WATER: 2, CLIMB: 4, BLOCK: 8 };

// ---------------------------------------------------------------------------------- growable buffers
class Grow {
  constructor(Type, n = 4096) { this.T = Type; this.a = new Type(n); this.n = 0; }
  reserve(k) {
    if (this.n + k <= this.a.length) return;
    let m = this.a.length * 2;
    while (m < this.n + k) m *= 2;
    const b = new this.T(m); b.set(this.a.subarray(0, this.n)); this.a = b;
  }
  push1(v) { this.reserve(1); this.a[this.n++] = v; }
  push2(a, b) { this.reserve(2); this.a[this.n++] = a; this.a[this.n++] = b; }
  push3(a, b, c) { this.reserve(3); this.a[this.n++] = a; this.a[this.n++] = b; this.a[this.n++] = c; }
  push4(a, b, c, d) { this.reserve(4); this.a[this.n++] = a; this.a[this.n++] = b; this.a[this.n++] = c; this.a[this.n++] = d; }
  view() { return this.a.subarray(0, this.n); }
  copy() { return this.a.slice(0, this.n); }
}

export class Bucket {
  constructor(mat, chunk) {
    this.mat = mat; this.chunk = chunk;
    this.pos = new Grow(Float32Array); this.nrm = new Grow(Float32Array); this.uv = new Grow(Float32Array);
    this.col = new Grow(Uint8Array); this.idx = new Grow(Uint32Array);
    this.verts = 0;
  }
  get tris() { return this.idx.n / 3; }
}

// ---------------------------------------------------------------------------------- small vector helpers
export const V = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};
const UP = [0, 1, 0];
/** UV basis (unit T, B) for a face normal: walls u along cross(up, n), v up; floors u = +x, v = -z. */
export function faceBasis(n) {
  if (Math.abs(n[1]) > 0.999) return n[1] > 0 ? [[1, 0, 0], [0, 0, -1]] : [[1, 0, 0], [0, 0, 1]];
  const T = V.norm(V.cross(UP, n));
  const B = V.cross(n, T);
  return [T, B];
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashString(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

function parseColor(c) {
  if (c === undefined || c === null) return null;
  if (Array.isArray(c)) return c;
  const col = new THREE.Color(c); // sRGB hex -> linear working space in three r15x+
  return [col.r, col.g, col.b];
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------------------------- Kit
export class Kit {
  /**
   * @param {object} o
   *   zone: id string (names, random seed), manifest: textures.json, props: props.json (+ loaded GLB data via
   *   loadProp), chunk: merge cell size (m), log
   */
  constructor(o = {}) {
    this.zone = o.zone || 'zone';
    this.manifest = o.manifest || { sets: {} };
    this.propLib = o.props || {};
    this.loadProp = o.loadProp || null;
    this.chunk = o.chunk || 40;
    this.log = o.log || console.log;
    this.layout = o.layout || null;
    this.rand = mulberry32(hashString(this.zone) ^ (o.seed || 0));
    this.buckets = new Map();
    this.mats = new Map();
    this.col = { pos: new Grow(Float32Array, 1 << 14), surf: new Grow(Uint8Array, 1 << 12) };
    this.lights = []; this.spawners = []; this.playerSpawns = []; this.buyZones = []; this.supplies = [];
    this.zones = []; this.bossArenas = {}; this.objectives = []; this.markers = [];
    this.navAreas = []; // { poly: [[x,z]], flag, y0?, y1? }
    this.propInstances = []; // for stats / runtime (dynamic props)
    this.stack = [new THREE.Matrix4()];
    this._nm = new THREE.Matrix3();
    this._v = new THREE.Vector3();
    this.defaults = { tint: null, grime: null };
  }

  // ---------------------------------------------------------------- random helpers
  rnd(a = 0, b = 1) { return a + (b - a) * this.rand(); }
  irnd(a, b) { return Math.floor(this.rnd(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.rand() * arr.length) % arr.length]; }
  chance(p) { return this.rand() < p; }

  // ---------------------------------------------------------------- materials
  material(name) {
    let m = this.mats.get(name);
    if (!m) { m = resolveMaterial(name, this.manifest); this.mats.set(name, m); }
    return m;
  }

  // ---------------------------------------------------------------- transforms
  get matrix() { return this.stack[this.stack.length - 1]; }
  /** Pushes a local frame { x, y, z, rot, rx, rz, scale } (or a Matrix4) on the stack. */
  push(t = {}) {
    let m;
    if (t.isMatrix4) m = t;
    else {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(t.rx || 0, t.rot || 0, t.rz || 0, 'YXZ'));
      const s = t.scale === undefined ? 1 : t.scale;
      m = new THREE.Matrix4().compose(new THREE.Vector3(t.x || 0, t.y || 0, t.z || 0), q, Array.isArray(s) ? new THREE.Vector3(...s) : new THREE.Vector3(s, s, s));
    }
    this.stack.push(this.matrix.clone().multiply(m));
    return this;
  }
  pop() { if (this.stack.length > 1) this.stack.pop(); return this; }
  /** Runs fn inside a local frame. */
  at(t, fn) { this.push(t); try { return fn(this); } finally { this.pop(); } }
  /** Local point -> world [x, y, z]. */
  W(p) { const v = this._v.set(p[0], p[1], p[2]).applyMatrix4(this.matrix); return [v.x, v.y, v.z]; }
  /** Local direction -> world unit direction. */
  WD(d) { this._nm.getNormalMatrix(this.matrix); const v = this._v.set(d[0], d[1], d[2]).applyMatrix3(this._nm).normalize(); return [v.x, v.y, v.z]; }
  /** Current frame's yaw (rotation.y) - for facing values. */
  get yaw() { const e = this.matrix.elements; return Math.atan2(-e[2], e[0]); }

  // ---------------------------------------------------------------- emission
  _bucket(matName, cx, cz) {
    const ci = Math.floor(cx / this.chunk), cj = Math.floor(cz / this.chunk);
    const key = `${matName}@${ci},${cj}`;
    let b = this.buckets.get(key);
    if (!b) { b = new Bucket(matName, [ci, cj]); this.buckets.set(key, b); }
    return b;
  }

  /**
   * Low-level: adds world-space vertices + triangles. P, N: flat arrays (world); UV: flat (already in texture
   * units); C: flat linear rgb (0..1+) or null; I: indices (local).
   */
  emit(matName, P, N, UV, C, I) {
    const nv = P.length / 3;
    if (!nv || !I.length) return;
    this.material(matName); // registers (and validates) the material
    let cx = 0, cz = 0;
    for (let i = 0; i < nv; i++) { cx += P[i * 3]; cz += P[i * 3 + 2]; }
    const b = this._bucket(matName, cx / nv, cz / nv);
    const base = b.verts;
    b.pos.reserve(nv * 3); b.nrm.reserve(nv * 3); b.uv.reserve(nv * 2); b.col.reserve(nv * 4);
    for (let i = 0; i < nv; i++) {
      b.pos.push3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      b.nrm.push3(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
      b.uv.push2(UV[i * 2], UV[i * 2 + 1]);
      if (C) {
        const r = Math.min(1, Math.max(0, C[i * 3])), g = Math.min(1, Math.max(0, C[i * 3 + 1])), bl = Math.min(1, Math.max(0, C[i * 3 + 2]));
        b.col.push4(Math.round(r * 255), Math.round(g * 255), Math.round(bl * 255), 255); // linear (three multiplies vertex colours as-is)
      } else b.col.push4(255, 255, 255, 255);
    }
    b.idx.reserve(I.length);
    for (let i = 0; i < I.length; i++) b.idx.push1(base + I[i]);
    b.verts += nv;
  }

  /** Vertex colour for a world point given piece options (tint * grime gradient). */
  _color(o, wp) {
    const tint = parseColor(o.tint ?? this.defaults.tint) || [1, 1, 1];
    let k = 1;
    const g = o.grime ?? this.defaults.grime;
    if (g) {
      const y0 = g.y ?? 0, h = g.h ?? 1.2, amt = g.k ?? 0.3;
      k *= 1 - amt * (1 - smooth(0, h, wp[1] - y0));
    }
    if (o.shade) k *= o.shade;
    return [tint[0] * k, tint[1] * k, tint[2] * k];
  }

  /**
   * Planar convex/concave polygon face (local points, CCW from the front). Options:
   *   uvs: per-vertex [u, v] in metres (overrides projection), uvLocal: project local instead of world coords,
   *   basis: [T, B] world (or local with uvLocal) override, uvOffset: [du, dv] m, uvRot: radians, uvScale,
   *   tint, grime, shade, holes: [[pts...]] (same plane), normal: override, collide: surf name|true
   */
  face(pts, mat, o = {}) {
    if (pts.length < 3) return;
    const M = this.material(mat);
    const W = pts.map((p) => this.W(p));
    let n = o.normal ? this.WD(o.normal) : null;
    if (!n) {
      // Newell normal (robust for concave)
      let nx = 0, ny = 0, nz = 0;
      for (let i = 0; i < W.length; i++) {
        const a = W[i], b = W[(i + 1) % W.length];
        nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]);
      }
      const l = Math.hypot(nx, ny, nz);
      if (l < 1e-12) return;
      n = [nx / l, ny / l, nz / l];
    }
    const holesW = (o.holes || []).map((h) => h.map((p) => this.W(p)));
    const all = [W, ...holesW];
    // triangulate in the plane
    const [T, B] = faceBasis(n);
    const to2 = (p) => new THREE.Vector2(V.dot(p, T), V.dot(p, B));
    let tris;
    if (W.length === 3 && !holesW.length) tris = [[0, 1, 2]];
    else if (W.length === 4 && !holesW.length && isConvex4(W.map(to2))) tris = [[0, 1, 2], [0, 2, 3]];
    else {
      const contour = W.map(to2), holes = holesW.map((h) => h.map(to2));
      // ShapeUtils wants CCW contour, CW holes
      if (ShapeUtils.isClockWise(contour)) { contour.reverse(); W.reverse(); }
      holes.forEach((h, i) => { if (!ShapeUtils.isClockWise(h)) { h.reverse(); holesW[i].reverse(); } });
      tris = ShapeUtils.triangulateShape(contour, holes);
      // ShapeUtils returns CCW in 2D (T, B) which is front-facing for n = T x B
    }
    const flat = [].concat(W, ...holesW);
    const P = [], N = [], UV = [], C = [];
    const loc = o.uvLocal ? [].concat(pts, ...(o.holes || [])) : null;
    let bT = T, bB = B;
    if (o.basis) [bT, bB] = o.basis;
    else if (o.uvLocal) {
      // local-space basis from the local normal
      const ln = V.norm(V.cross(V.sub(pts[1], pts[0]), V.sub(pts[2], pts[0])));
      [bT, bB] = faceBasis(ln);
    }
    const uvRot = (o.uvRot || 0) + (o.uvs ? 0 : M.uvRot || 0);
    const cr = Math.cos(uvRot), sr = Math.sin(uvRot);
    const sc = o.uvScale || 1;
    const [du, dv] = o.uvOffset || [0, 0];
    flat.forEach((wp, i) => {
      P.push(wp[0], wp[1], wp[2]); N.push(n[0], n[1], n[2]);
      let u, v;
      if (o.uvs) [u, v] = o.uvs[i];
      else {
        const src = loc ? loc[i] : wp;
        u = V.dot(src, bT); v = V.dot(src, bB);
      }
      const ru = u * cr - v * sr + du, rv = u * sr + v * cr + dv;
      if (M.metric) UV.push(ru / (M.tileU * sc), rv / (M.tileV * sc)); else UV.push(ru, rv);
      C.push(...this._color(o, wp));
    });
    const I = [];
    for (const t of tris) I.push(t[0], t[1], t[2]);
    this.emit(mat, P, N, UV, C, I);
    if (o.collide) this.colPoly(pts, o.collide === true ? M.surf : o.collide, o.holes);
  }

  /** Quad a b c d (CCW from front). */
  quad(a, b, c, d, mat, o) { this.face([a, b, c, d], mat, o); }

  /**
   * Axis-aligned box in the current frame: { x, y, z } = centre of the BOTTOM face, w (x) h (y) d (z), rot.
   * mat or faces: { top, bottom, px, nx, pz, nz } (material names, false = skip). Options of face() apply.
   * collide: true (box collider, material surf) | surf name | false.
   */
  box(o) {
    const { w, h, d } = o;
    const run = () => {
      const x0 = -w / 2, x1 = w / 2, y0 = 0, y1 = h, z0 = -d / 2, z1 = d / 2;
      const F = o.faces || {};
      const mf = (k) => (F[k] === false ? null : F[k] || o.mat);
      const fo = { ...o, collide: false };
      let m;
      if ((m = mf('top'))) this.face([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], m, fo);
      if ((m = mf('bottom'))) this.face([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], m, fo);
      if ((m = mf('pz'))) this.face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], m, fo);
      if ((m = mf('nz'))) this.face([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], m, fo);
      if ((m = mf('px'))) this.face([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], m, fo);
      if ((m = mf('nx'))) this.face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], m, fo);
      if (o.collide !== false && o.collide !== undefined) {
        const surf = o.collide === true ? this.material(o.mat || Object.values(F).find(Boolean)).surf : o.collide;
        this.colBox({ x: 0, y: 0, z: 0, w, h, d }, surf);
      }
    };
    this.at({ x: o.x || 0, y: o.y || 0, z: o.z || 0, rot: o.rot || 0, rx: o.rx, rz: o.rz }, run);
  }

  /**
   * Chamfered box (bevelled edges catch highlights: vehicles, furniture, machinery). Same frame as box();
   * bevel = chamfer size (m). Optional taper: { top: [sx, sz] } scales the top face (car cabins).
   */
  bbox(o) {
    const b = Math.min(o.bevel ?? 0.03, o.w / 2 - 1e-3, o.h / 2 - 1e-3, o.d / 2 - 1e-3);
    const tw = o.taper?.top?.[0] ?? 1, td = o.taper?.top?.[1] ?? 1;
    const tx = o.taper?.shift?.[0] ?? 0, tz = o.taper?.shift?.[1] ?? 0;
    const run = () => {
      const hw = o.w / 2, hd = o.d / 2, h = o.h;
      // convex hull of 24 points: every corner pulled in by the bevel along each of its 3 edges
      const pts = [];
      for (const sy of [0, 1]) for (const [sx, sz] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
        const W2 = hw * (1 + (tw - 1) * sy), D2 = hd * (1 + (td - 1) * sy);
        const cx = sx * W2 + tx * sy, cy = sy * h, cz = sz * D2 + tz * sy;
        const dy = sy ? -b : b;
        pts.push([cx - sx * b, cy, cz - sz * b], [cx, cy + dy, cz - sz * b], [cx - sx * b, cy + dy, cz]);
      }
      this.hull(pts, o.mat, { ...o, collide: false });
      if (o.collide !== false && o.collide !== undefined) this.colBox({ x: 0, y: 0, z: 0, w: o.w * Math.max(1, tw), h: o.h, d: o.d * Math.max(1, td) }, o.collide === true ? this.material(o.mat).surf : o.collide);
    };
    this.at({ x: o.x || 0, y: o.y || 0, z: o.z || 0, rot: o.rot || 0, rx: o.rx, rz: o.rz }, run);
  }

  /** Convex hull of local points as flat faces (coplanar triangles merged). */
  hull(points, mat, o = {}) {
    const geo = convexHullFaces(points);
    for (const f of geo) this.face(f, mat, o);
  }

  /**
   * Vertical prism from a 2D footprint [[x, z]...] (any winding) between y0 and y1.
   * top / bottom / side: material names (false to skip). Side UVs run continuously along the perimeter.
   */
  prism(pts2, y0, y1, o) {
    const pts = ensureCCW(pts2); // CCW seen from above (x right, -z up)
    const side = o.side === undefined ? o.mat : o.side;
    const top = o.top === undefined ? o.mat : o.top;
    const bottom = o.bottom === undefined ? false : o.bottom;
    const fo = { ...o, collide: false };
    if (side) {
      let acc = o.uOffset || 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (L < 1e-6) continue;
        // outward = right of a->b when CCW from above (x, -z): we emit [a0, b0, b1, a1] which faces outward
        const uvs = o.continuousUV ? [[acc, y0], [acc + L, y0], [acc + L, y1], [acc, y1]] : undefined;
        this.face([[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]], side, { ...fo, uvs });
        acc += L;
      }
    }
    if (top) this.face(pts.map((p) => [p[0], y1, p[1]]).reverse(), top, fo);
    if (bottom) this.face(pts.map((p) => [p[0], y0, p[1]]), bottom, fo);
    if (o.collide) this.colPrism(pts, y0, y1, o.collide === true ? this.material(o.mat || side || top).surf : o.collide);
  }

  /**
   * Sweeps a 2D profile along a 3D polyline (cornices, curbs, gutters, pipes, rails, wires).
   * profile: [[px, py]...] in the plane perpendicular to the path (px = right of travel, py = up), CCW.
   * Options: closed (profile loop, default true), smooth (shared normals around the profile, for pipes),
   *   caps (true: close the ends), up (reference up vector, default +Y; use [1,0,0] for vertical paths),
   *   tint/grime as face(). UV: u = distance along the path, v = distance around the profile.
   */
  sweep(profile, path, mat, o = {}) {
    if (path.length < 2) return;
    const M = this.material(mat);
    const closed = o.closed !== false;
    const np = profile.length;
    const up0 = o.up || [0, 1, 0];
    // frames at each path point (mitred)
    const frames = [];
    for (let i = 0; i < path.length; i++) {
      const p = path[i];
      const dPrev = i > 0 ? V.norm(V.sub(p, path[i - 1])) : null;
      const dNext = i < path.length - 1 ? V.norm(V.sub(path[i + 1], p)) : null;
      let t = dPrev && dNext ? V.norm(V.add(dPrev, dNext)) : (dPrev || dNext);
      let r = V.cross(t, up0);
      if (V.len(r) < 1e-6) r = V.cross(t, [1, 0, 0]);
      r = V.norm(r);
      const u = V.norm(V.cross(r, t));
      let s = 1;
      if (dPrev && dNext) { const c = V.dot(dPrev, t); s = c > 0.2 ? 1 / c : 5; }
      frames.push({ p, r, u, s });
    }
    let along = 0;
    const alongs = [0];
    for (let i = 1; i < path.length; i++) { along += V.len(V.sub(path[i], path[i - 1])); alongs.push(along); }
    const ring = profile.map(() => 0);
    let per = 0;
    for (let k = 1; k < np + (closed ? 1 : 0); k++) {
      const a = profile[k - 1], b = profile[k % np];
      per += Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (k < np) ring[k] = per;
    }
    const P = [], N = [], UV = [], C = [], I = [];
    const segs = closed ? np : np - 1;
    if (o.smooth) {
      // shared verts around the profile: normals from the profile normal (outward = perpendicular of tangent)
      const pn = profile.map((q, k) => {
        const a = profile[(k - 1 + np) % np], b = profile[(k + 1) % np];
        const tx = b[0] - a[0], ty = b[1] - a[1];
        const l = Math.hypot(tx, ty) || 1;
        return [ty / l, -tx / l]; // right-hand normal of a CCW profile = outward
      });
      for (let i = 0; i < frames.length; i++) {
        const f = frames[i];
        for (let k = 0; k <= np; k++) {
          const q = profile[k % np];
          const lp = V.add(f.p, V.add(V.scale(f.r, q[0] * f.s), V.scale(f.u, q[1])));
          const ln = V.norm(V.add(V.scale(f.r, pn[k % np][0]), V.scale(f.u, pn[k % np][1])));
          const wp = this.W(lp), wn = this.WD(ln);
          P.push(...wp); N.push(...wn);
          const vv = k < np ? ring[k] : per;
          UV.push(M.metric ? alongs[i] / M.tileU : alongs[i], M.metric ? vv / M.tileV : vv);
          C.push(...this._color(o, wp));
        }
      }
      const rowN = np + 1;
      for (let i = 0; i < frames.length - 1; i++) for (let k = 0; k < segs; k++) {
        const a = i * rowN + k, b = i * rowN + k + 1, c = (i + 1) * rowN + k + 1, d = (i + 1) * rowN + k;
        I.push(a, d, c, a, c, b);
      }
      this.emit(mat, P, N, UV, C, I);
    } else {
      for (let i = 0; i < frames.length - 1; i++) {
        const f0 = frames[i], f1 = frames[i + 1];
        for (let k = 0; k < segs; k++) {
          const q0 = profile[k], q1 = profile[(k + 1) % np];
          const A = V.add(f0.p, V.add(V.scale(f0.r, q0[0] * f0.s), V.scale(f0.u, q0[1])));
          const Bp = V.add(f0.p, V.add(V.scale(f0.r, q1[0] * f0.s), V.scale(f0.u, q1[1])));
          const Cp = V.add(f1.p, V.add(V.scale(f1.r, q1[0] * f1.s), V.scale(f1.u, q1[1])));
          const D = V.add(f1.p, V.add(V.scale(f1.r, q0[0] * f1.s), V.scale(f1.u, q0[1])));
          const v0 = ring[k], v1 = k + 1 < np ? ring[k + 1] : per;
          this.face([A, D, Cp, Bp], mat, { ...o, collide: false, uvs: [[alongs[i], v0], [alongs[i + 1], v0], [alongs[i + 1], v1], [alongs[i], v1]] });
        }
      }
    }
    if (o.caps) {
      for (const [fi, rev] of [[0, true], [frames.length - 1, false]]) {
        const f = frames[fi];
        let cap = profile.map((q) => V.add(f.p, V.add(V.scale(f.r, q[0]), V.scale(f.u, q[1]))));
        if (rev) cap = cap.reverse();
        this.face(cap, mat, { ...o, collide: false });
      }
    }
    if (o.collide) {
      const surf = o.collide === true ? M.surf : o.collide;
      for (let i = 0; i < frames.length - 1; i++) {
        // coarse: profile bounding box swept as a box between frames
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const q of profile) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
        const f0 = frames[i], f1 = frames[i + 1];
        const c = (f, x, y) => V.add(f.p, V.add(V.scale(f.r, x), V.scale(f.u, y)));
        this.colHex([c(f0, x0, y0), c(f0, x1, y0), c(f0, x1, y1), c(f0, x0, y1), c(f1, x0, y0), c(f1, x1, y0), c(f1, x1, y1), c(f1, x0, y1)], surf);
      }
    }
  }

  /** Upright cylinder / cone frustum: centre of the base at (x, y, z), radius r (top r2), height h. */
  cyl(o) {
    const seg = o.seg || 12, r = o.r, r2 = o.r2 ?? o.r, h = o.h;
    const prof = [];
    // sweep along a vertical line with a circular profile would twist; build directly
    const run = () => {
      const M = this.material(o.mat);
      const P = [], N = [], UV = [], C = [], I = [];
      const slope = (r - r2) / h;
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        const cx = Math.cos(a), cz = -Math.sin(a);
        for (const [y, rr] of [[0, r], [h, r2]]) {
          const wp = this.W([cx * rr, y, cz * rr]);
          P.push(...wp);
          N.push(...this.WD(V.norm([cx, slope, cz])));
          const u = a * Math.max(r, r2), v = y;
          UV.push(M.metric ? u / M.tileU : i / seg, M.metric ? (v + (o.vOffset || 0)) / M.tileV : y / h);
          C.push(...this._color(o, wp));
        }
      }
      for (let i = 0; i < seg; i++) { const a = i * 2, b = a + 1, c = a + 3, d = a + 2; I.push(a, d, c, a, c, b); }
      this.emit(o.mat, P, N, UV, C, I);
      const capMat = o.capMat || o.mat;
      if (o.caps !== false) {
        const ring = (y, rr, up) => {
          const pts = [];
          for (let i = 0; i < seg; i++) { const a = (i / seg) * Math.PI * 2; pts.push([Math.cos(a) * rr, y, -Math.sin(a) * rr]); }
          return up ? pts.reverse() : pts;
        };
        if (o.top !== false && r2 > 1e-4) this.face(ring(h, r2, true), capMat, { ...o, collide: false });
        if (o.bottom && r > 1e-4) this.face(ring(0, r, false), capMat, { ...o, collide: false });
      }
      if (o.collide) {
        const rr = Math.max(r, r2) * 0.9;
        this.colBox({ x: 0, y: 0, z: 0, w: rr * 2, h, d: rr * 2 }, o.collide === true ? M.surf : o.collide);
      }
    };
    void prof;
    this.at({ x: o.x || 0, y: o.y || 0, z: o.z || 0, rot: o.rot || 0, rx: o.rx || 0, rz: o.rz || 0 }, run);
  }

  /** Lathe: profile [[r, y]...] bottom->top rotated around local Y. */
  lathe(profile, o) {
    const seg = o.seg || 16;
    const run = () => {
      const M = this.material(o.mat);
      const P = [], N = [], UV = [], C = [], I = [];
      const n = profile.length;
      // profile normals (2D, outward)
      const pn = profile.map((q, k) => {
        const a = profile[Math.max(0, k - 1)], b = profile[Math.min(n - 1, k + 1)];
        const dr = b[0] - a[0], dy = b[1] - a[1];
        const l = Math.hypot(dr, dy) || 1;
        return [dy / l, -dr / l];
      });
      let vlen = [0];
      for (let k = 1; k < n; k++) vlen.push(vlen[k - 1] + Math.hypot(profile[k][0] - profile[k - 1][0], profile[k][1] - profile[k - 1][1]));
      const rmax = Math.max(...profile.map((q) => q[0]));
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2, ca = Math.cos(a), sa = -Math.sin(a);
        for (let k = 0; k < n; k++) {
          const [r, y] = profile[k];
          const wp = this.W([ca * r, y, sa * r]);
          P.push(...wp);
          N.push(...this.WD(V.norm([ca * pn[k][0], pn[k][1], sa * pn[k][0]])));
          UV.push(M.metric ? (a * rmax) / M.tileU : i / seg, M.metric ? vlen[k] / M.tileV : vlen[k] / vlen[n - 1]);
          C.push(...this._color(o, wp));
        }
      }
      for (let i = 0; i < seg; i++) for (let k = 0; k < n - 1; k++) {
        const a = i * n + k, b = i * n + k + 1, c = (i + 1) * n + k + 1, d = (i + 1) * n + k;
        I.push(a, d, c, a, c, b);
      }
      this.emit(o.mat, P, N, UV, C, I);
      if (o.collide) {
        const h = Math.max(...profile.map((q) => q[1])) - Math.min(...profile.map((q) => q[1]));
        this.colBox({ x: 0, y: Math.min(...profile.map((q) => q[1])), z: 0, w: rmax * 1.8, h, d: rmax * 1.8 }, o.collide === true ? M.surf : o.collide);
      }
    };
    this.at({ x: o.x || 0, y: o.y || 0, z: o.z || 0, rot: o.rot || 0, rx: o.rx || 0, rz: o.rz || 0 }, run);
  }

  /** Adds a THREE.BufferGeometry (local frame). uv: 'keep' (authored, default when present) | 'world' (box projection). */
  mesh(geo, mat, o = {}) {
    const M = this.material(mat);
    const g = geo.index ? geo : geo;
    const pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv;
    const P = [], N = [], UV = [], C = [];
    const keep = (o.uv || (uv ? 'keep' : 'world')) === 'keep' && uv;
    for (let i = 0; i < pos.count; i++) {
      const wp = this.W([pos.getX(i), pos.getY(i), pos.getZ(i)]);
      const wn = nrm ? this.WD([nrm.getX(i), nrm.getY(i), nrm.getZ(i)]) : [0, 1, 0];
      P.push(...wp); N.push(...wn);
      if (keep) UV.push(uv.getX(i) * (o.uvScale?.[0] ?? 1), uv.getY(i) * (o.uvScale?.[1] ?? 1));
      else {
        // box projection on the dominant axis of the normal
        const ax = Math.abs(wn[0]), ay = Math.abs(wn[1]), az = Math.abs(wn[2]);
        let u, v;
        if (ay >= ax && ay >= az) { u = wp[0]; v = -wp[2]; } else if (ax >= az) { u = -wp[2] * Math.sign(wn[0]); v = wp[1]; } else { u = wp[0] * Math.sign(wn[2]); v = wp[1]; }
        UV.push(M.metric ? u / M.tileU : u, M.metric ? v / M.tileV : v);
      }
      C.push(...this._color(o, wp));
    }
    const I = g.index ? Array.from(g.index.array) : Array.from({ length: pos.count }, (_, i) => i);
    this.emit(mat, P, N, UV, C, I);
    if (o.collide) this.colMesh(geo, o.collide === true ? M.surf : o.collide);
  }

  // ---------------------------------------------------------------- collision
  _surf(s) { return typeof s === 'number' ? s : SURF[s] ?? 0; }
  /** World-space triangle soup. */
  colTris(Pw, surf) {
    const s = this._surf(surf);
    const n = Pw.length / 3;
    this.col.pos.reserve(Pw.length); this.col.surf.reserve(n);
    for (let i = 0; i < Pw.length; i++) this.col.pos.a[this.col.pos.n++] = Pw[i];
    for (let i = 0; i < n; i++) this.col.surf.a[this.col.surf.n++] = s;
  }
  /** Collision polygon (local points, any winding; triangulated). */
  colPoly(pts, surf, holes) {
    const W = pts.map((p) => this.W(p));
    if (W.length === 3 && !holes) { this.colTris([...W[0], ...W[1], ...W[2]], surf); return; }
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < W.length; i++) { const a = W[i], b = W[(i + 1) % W.length]; nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]); }
    const n = V.norm([nx, ny, nz]);
    const [T, B] = faceBasis(n);
    const H = (holes || []).map((h) => h.map((p) => this.W(p)));
    const c2 = W.map((p) => new THREE.Vector2(V.dot(p, T), V.dot(p, B)));
    const h2 = H.map((h) => h.map((p) => new THREE.Vector2(V.dot(p, T), V.dot(p, B))));
    if (ShapeUtils.isClockWise(c2)) { c2.reverse(); W.reverse(); }
    h2.forEach((h, i) => { if (!ShapeUtils.isClockWise(h)) { h.reverse(); H[i].reverse(); } });
    const flat = [].concat(W, ...H);
    const tris = ShapeUtils.triangulateShape(c2, h2);
    const out = [];
    for (const t of tris) for (const k of t) out.push(...flat[k]);
    this.colTris(out, surf);
  }
  colQuad(a, b, c, d, surf) { this.colPoly([a, b, c, d], surf); }
  /** Box collider in the current frame ({ x, y, z } = bottom centre, rot). */
  colBox(o, surf) {
    this.at({ x: o.x || 0, y: o.y || 0, z: o.z || 0, rot: o.rot || 0 }, () => {
      const x = o.w / 2, z = o.d / 2, h = o.h;
      this.colHex([[-x, 0, z], [x, 0, z], [x, h, z], [-x, h, z], [-x, 0, -z], [x, 0, -z], [x, h, -z], [-x, h, -z]], surf);
    });
  }
  /** 8-corner hexahedron collider: [a0 b0 c0 d0] (one end, CCW) then [a1 b1 c1 d1] (other end), local. */
  colHex(c, surf) {
    const W = c.map((p) => this.W(p));
    const q = (a, b, cc, d) => [...W[a], ...W[b], ...W[cc], ...W[a], ...W[cc], ...W[d]];
    this.colTris([
      ...q(0, 1, 2, 3), ...q(5, 4, 7, 6), ...q(4, 0, 3, 7), ...q(1, 5, 6, 2), ...q(3, 2, 6, 7), ...q(4, 5, 1, 0),
    ], surf);
  }
  colPrism(pts2, y0, y1, surf) {
    const pts = ensureCCW(pts2);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      this.colQuad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], surf);
    }
    this.colPoly(pts.map((p) => [p[0], y1, p[1]]), surf);
    this.colPoly(pts.map((p) => [p[0], y0, p[1]]), surf);
  }
  colMesh(geo, surf) {
    const pos = geo.attributes.position, idx = geo.index;
    const n = idx ? idx.count : pos.count;
    const out = [];
    for (let i = 0; i < n; i++) { const k = idx ? idx.getX(i) : i; out.push(...this.W([pos.getX(k), pos.getY(k), pos.getZ(k)])); }
    this.colTris(out, surf);
  }
  /** Invisible walking ramp (stairs collision): from [x,y,z] (bottom centre) to [x,y,z] (top centre), width. */
  colRamp(from, to, width, surf = 'concrete') {
    const d = V.sub(to, from);
    const side = V.norm(V.cross([d[0], 0, d[2]], [0, 1, 0]));
    const hw = width / 2;
    const a = V.add(from, V.scale(side, hw)), b = V.sub(from, V.scale(side, hw));
    const c = V.sub(to, V.scale(side, hw)), e = V.add(to, V.scale(side, hw));
    this.colQuad(b, a, e, c, surf);
  }

  // ---------------------------------------------------------------- gameplay data (positions are local)
  light(l) {
    const pos = this.W(l.pos);
    const out = { type: l.type || 'point', pos: pos.map((v) => +v.toFixed(3)), color: l.color || '#ffd2a0', intensity: l.intensity ?? 10, range: l.range ?? 12 };
    if (l.radius !== undefined) out.radius = l.radius;
    if (l.dir) out.dir = this.WD(l.dir).map((v) => +v.toFixed(4));
    if (l.type === 'spot') { out.angle = l.angle ?? Math.PI / 4; out.penumbra = l.penumbra ?? 0.5; if (!out.dir) out.dir = [0, -1, 0]; }
    if (l.flicker) out.flicker = l.flicker;
    if (l.realtime) out.realtime = true;
    if (l.bake === false) out.bake = false;
    if (l.name) out.name = l.name;
    if (l.shadow) out.shadow = true;
    this.lights.push(out);
    return out;
  }
  /** Zombie spawner: { id?, pos, kind: street|alley|window|roof|manhole|fence|gate, facing (yaw) | lookAt [x,z], zone? } */
  spawner(s) {
    const pos = this.W(s.pos);
    let facing = s.facing;
    if (s.lookAt) facing = Math.atan2(-(s.lookAt[0] - pos[0]), -(s.lookAt[1] - pos[2]));
    else if (facing !== undefined) facing += this.yaw;
    const out = { id: s.id || `${this.zone}_${this.spawners.length}`, zone: s.zone || this.zone, pos: pos.map((v) => +v.toFixed(2)), kind: s.kind || 'street', facing: +(facing || 0).toFixed(4) };
    if (s.weight !== undefined) out.weight = s.weight;
    if (s.rounds) out.rounds = s.rounds;
    this.spawners.push(out);
    return out;
  }
  playerSpawn(pos, yaw = 0) { const p = this.W(pos); this.playerSpawns.push([...p.map((v) => +v.toFixed(2)), +(yaw + this.yaw).toFixed(4)]); }
  buy(pos, radius = 3) { const p = this.W(pos); this.buyZones.push([...p.map((v) => +v.toFixed(2)), radius]); }
  supply(pos) { const p = this.W(pos); this.supplies.push(p.map((v) => +v.toFixed(2))); }
  zoneDef(z) { this.zones.push({ id: z.id, name: z.name, polygon: z.polygon.map((p) => { const w = this.W([p[0], 0, p[1]]); return [+w[0].toFixed(2), +w[2].toFixed(2)]; }), ...(z.extra || {}) }); }
  bossArena(name, a) { const c = this.W(a.center); this.bossArenas[name] = { center: c.map((v) => +v.toFixed(2)), radius: a.radius }; }
  objective(o) { this.objectives.push(o); }
  marker(name, pos) { this.markers.push({ name, pos: this.W(pos) }); }
  /** Nav annotations (2D polygons, local): flag = 'block' | 'climb' | 'water' | 'walk'; optional y range. */
  nav(flag, poly, o = {}) {
    const p = poly.map((q) => { const w = this.W([q[0], 0, q[1]]); return [w[0], w[2]]; });
    this.navAreas.push({ flag, poly: p, y0: o.y0 ?? -Infinity, y1: o.y1 ?? Infinity });
  }

  // ---------------------------------------------------------------- stats
  stats() {
    let tris = 0, verts = 0;
    for (const b of this.buckets.values()) { tris += b.tris; verts += b.verts; }
    return { buckets: this.buckets.size, tris, verts, colTris: this.col.pos.n / 9, lights: this.lights.length, spawners: this.spawners.length };
  }
}

// ---------------------------------------------------------------------------------- geometry utilities
function isConvex4(q) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cr) < 1e-12) continue;
    const s = Math.sign(cr);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}
/** Signed area of a 2D ground polygon [[x, z]] in the (x, -z) plane: > 0 = CCW seen from above. */
export function area2(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * -q[1] - q[0] * -p[1]; } return a / 2; }
export function ensureCCW(pts) { return area2(pts) >= 0 ? pts.slice() : pts.slice().reverse(); }

/** Convex hull (3D, gift-wrapping via three's ConvexHull-free incremental algorithm) -> list of faces (CCW). */
export function convexHullFaces(points) {
  // Simple O(n^4)-safe approach for small n (<= 64): every triple whose plane has all points behind.
  const pts = dedupe(points);
  const n = pts.length;
  const faces = new Map();
  const eps = 1e-6;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
    const a = pts[i], b = pts[j], c = pts[k];
    let nrm = V.cross(V.sub(b, a), V.sub(c, a));
    const l = V.len(nrm);
    if (l < 1e-10) continue;
    nrm = V.scale(nrm, 1 / l);
    let pos = 0, neg = 0;
    for (let m = 0; m < n; m++) { const d = V.dot(V.sub(pts[m], a), nrm); if (d > eps) pos++; else if (d < -eps) neg++; if (pos && neg) break; }
    if (pos && neg) continue;
    if (pos) nrm = V.scale(nrm, -1);
    const dd = V.dot(nrm, a);
    const key = nrm.map((v) => Math.round(v * 1e4)).join(',') + '|' + Math.round(dd * 1e4);
    if (!faces.has(key)) faces.set(key, { n: nrm, set: new Set() });
    const f = faces.get(key);
    f.set.add(i); f.set.add(j); f.set.add(k);
  }
  const out = [];
  for (const { n: nrm, set } of faces.values()) {
    const idx = [...set];
    const [T, B] = faceBasis(nrm);
    const c = idx.reduce((s, i) => V.add(s, pts[i]), [0, 0, 0]).map((v) => v / idx.length);
    idx.sort((x, y) => Math.atan2(V.dot(V.sub(pts[x], c), B), V.dot(V.sub(pts[x], c), T)) - Math.atan2(V.dot(V.sub(pts[y], c), B), V.dot(V.sub(pts[y], c), T)));
    out.push(idx.map((i) => pts[i]));
  }
  return out;
}
function dedupe(points) {
  const seen = new Map();
  for (const p of points) { const k = p.map((v) => Math.round(v * 1e5)).join(','); if (!seen.has(k)) seen.set(k, p); }
  return [...seen.values()];
}
