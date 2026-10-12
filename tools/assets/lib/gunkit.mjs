// Hard-surface modelling kit for weapons and props (runs in Node, exports GLB).
//
// Authoring coordinates are a SIDE VIEW in millimetres: s = forward (towards the muzzle), t = up,
// w = right (the ejection-port side). They map to three.js gun space as (x = w, y = t, z = -s),
// i.e. the muzzle points down -Z like a camera looks. Export converts mm -> metres.
//
//   const g = new Gun('ak74');
//   g.add(profile([[0,0,2],[120,0,4],...], { w: 26, bevel: 1.2 }), 'steel');      // into part 'body'
//   const mag = g.part('mag', { pivot: [60, -10, 0] });
//   mag.add(profile(...), 'polymer');
//   g.socket('muzzle', [700, 18, 0]);
//   g.meta({ grip: 'rifle', ... });
//   await g.export('game/assets/weapons/ak74.glb');
import * as THREE from 'three';
import { mergeGeometries, mergeVertices, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Brush, Evaluator, SUBTRACTION, ADDITION, INTERSECTION } from 'three-bvh-csg';
import './node-env.mjs';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { bakeMeshes } from './bake.mjs';
import fs from 'node:fs';
import path from 'node:path';

export const DEG = Math.PI / 180;
export const V = (s = 0, t = 0, w = 0) => new THREE.Vector3(w, t, -s);
const CREASE = 38 * DEG;

// ------------------------------------------------------------------------------------------ shapes

/**
 * Builds a THREE.Shape from either
 *  - an array of [s, t, r?] points: polygon with rounded corners (r = fillet radius in mm), or
 *  - an SVG-like path string in (s, t): M L H V Q C Z commands (absolute only).
 */
export function makeShape(spec, ShapeClass = THREE.Shape) {
  const sh = new ShapeClass();
  if (typeof spec === 'string') {
    const tok = spec.match(/[MLHVQCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi);
    let i = 0, cmd = 'M', x = 0, y = 0;
    const num = () => parseFloat(tok[i++]);
    while (i < tok.length) {
      if (/[A-Z]/i.test(tok[i])) cmd = tok[i++].toUpperCase();
      if (cmd === 'M') { x = num(); y = num(); sh.moveTo(x, y); cmd = 'L'; }
      else if (cmd === 'L') { x = num(); y = num(); sh.lineTo(x, y); }
      else if (cmd === 'H') { x = num(); sh.lineTo(x, y); }
      else if (cmd === 'V') { y = num(); sh.lineTo(x, y); }
      else if (cmd === 'Q') { const cx = num(), cy = num(); x = num(); y = num(); sh.quadraticCurveTo(cx, cy, x, y); }
      else if (cmd === 'C') { const a = num(), b = num(), c = num(), d = num(); x = num(); y = num(); sh.bezierCurveTo(a, b, c, d, x, y); }
      else if (cmd === 'Z') { sh.closePath(); }
    }
    return sh;
  }
  const pts = spec;
  const n = pts.length;
  const P = (k) => pts[(k + n) % n];
  for (let k = 0; k < n; k++) {
    const [x, y, r = 0] = P(k);
    if (!r) { k === 0 ? sh.moveTo(x, y) : sh.lineTo(x, y); continue; }
    const [px, py] = P(k - 1), [nx, ny] = P(k + 1);
    const li = Math.hypot(x - px, y - py), lo = Math.hypot(nx - x, ny - y);
    const ri = Math.min(r, li * 0.5), ro = Math.min(r, lo * 0.5);
    const ax = x + ((px - x) / li) * ri, ay = y + ((py - y) / li) * ri;
    const bx = x + ((nx - x) / lo) * ro, by = y + ((ny - y) / lo) * ro;
    k === 0 ? sh.moveTo(ax, ay) : sh.lineTo(ax, ay);
    sh.quadraticCurveTo(x, y, bx, by);
  }
  sh.closePath();
  return sh;
}

/** Circle helper for holes: [s, t] centre, radius. */
export function circle(s, t, r, ShapeClass = THREE.Path) {
  const p = new ShapeClass();
  p.absarc(s, t, r, 0, Math.PI * 2, false);
  return p;
}

// ------------------------------------------------------------------------------------------ primitives

function finish(geo, crease = CREASE) {
  for (const k of Object.keys(geo.attributes)) if (k !== 'position') geo.deleteAttribute(k);
  const g = geo.index ? geo.toNonIndexed() : geo;
  const out = toCreasedNormals(g, crease);
  return out;
}

/**
 * Side-view profile extruded across the gun (thickness w, centred on w = cw).
 * opts: w (thickness mm), cw (centre), bevel (mm), bevelSeg, curveSeg, holes ([shape spec | Path]), crease (deg)
 */
export function profile(spec, opts = {}) {
  const { w = 20, cw = 0, bevel = 1, bevelSeg = 2, curveSeg = 10, holes = [], crease } = opts;
  const shape = makeShape(spec);
  for (const h of holes) shape.holes.push(h instanceof THREE.Path ? h : makeShape(h, THREE.Path));
  const b = Math.max(0, Math.min(bevel, w / 2 - 0.05));
  const depth = Math.max(0.02, w - 2 * b);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b,
    bevelSegments: bevelSeg, curveSegments: curveSeg, steps: 1,
  });
  geo.translate(0, 0, -depth / 2);
  geo.rotateY(Math.PI / 2); // (x=s, y=t, z=thick) -> (thick, t, -s)
  geo.translate(cw, 0, 0);
  return finish(geo, crease === undefined ? CREASE : crease * DEG);
}

/**
 * Top-view profile: shape in (s, w) extruded vertically (height h centred on t = ct).
 * Useful for flat parts seen from above (charging handles, levers, sights).
 */
export function plan(spec, opts = {}) {
  const { h = 10, ct = 0, bevel = 0.8, bevelSeg = 2, curveSeg = 10, holes = [] } = opts;
  const shape = makeShape(spec);
  for (const hp of holes) shape.holes.push(hp instanceof THREE.Path ? hp : makeShape(hp, THREE.Path));
  const b = Math.max(0, Math.min(bevel, h / 2 - 0.05));
  const depth = Math.max(0.02, h - 2 * b);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: bevelSeg, curveSegments: curveSeg,
  });
  geo.translate(0, 0, -depth / 2);
  // shape (x=s, y=w, z=h) -> three (x=w, y=h, z=-s)
  const m = new THREE.Matrix4().set(0, 1, 0, 0, 0, 0, 1, 0, -1, 0, 0, 0, 0, 0, 0, 1);
  geo.applyMatrix4(m);
  flipWinding(geo); // the (s, w, h) frame is left-handed in three space
  geo.translate(0, ct, 0);
  return finish(geo);
}

/**
 * Front-view profile: shape in (w, t) extruded along s from s0 to s1.
 * Great for rails, handguard cross-sections, magazines seen end-on.
 */
export function section(spec, s0, s1, opts = {}) {
  const { bevel = 0.6, bevelSeg = 2, curveSeg = 10, holes = [] } = opts;
  const shape = makeShape(spec);
  for (const hp of holes) shape.holes.push(hp instanceof THREE.Path ? hp : makeShape(hp, THREE.Path));
  const len = Math.abs(s1 - s0);
  const b = Math.max(0, Math.min(bevel, len / 2 - 0.05));
  const depth = Math.max(0.02, len - 2 * b);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: bevelSeg, curveSegments: curveSeg,
  });
  // shape (x=w, y=t, z=len) ; extrusion z 0..depth -> s from s0+b .. s1-b, i.e. three z = -(s)
  geo.translate(0, 0, b + Math.min(s0, s1));
  geo.scale(1, 1, -1);
  flipWinding(geo);
  return finish(geo);
}

function flipWinding(geo) {
  const g = geo.index ? geo : null;
  if (g) {
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  } else {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i += 3) {
      for (let c = 0; c < 3; c++) { const t = p.array[(i + 1) * 3 + c]; p.array[(i + 1) * 3 + c] = p.array[(i + 2) * 3 + c]; p.array[(i + 2) * 3 + c] = t; }
    }
  }
}

/**
 * Lathe around the forward axis: pts = [[s, r], ...] from back to front. Axis at (t, w).
 * Closed solids should start/end with r = 0. For hollow tubes list the outer profile then the inner one back.
 */
export function lathe(pts, opts = {}) {
  const { t = 0, w = 0, seg = 32, phase = 0, arc = Math.PI * 2, crease } = opts;
  const v2 = pts.map(([s, r]) => new THREE.Vector2(Math.max(0, r), s));
  const geo = new THREE.LatheGeometry(v2, seg, phase, arc);
  geo.rotateX(-Math.PI / 2); // y (=s) -> -z
  geo.translate(w, t, 0);
  return finish(geo, crease === undefined ? CREASE : crease * DEG);
}

/** Solid cylinder along s from s0 to s1, radius r, edge chamfer b. */
export function cyl(s0, s1, r, opts = {}) {
  const { b = Math.min(0.6, r * 0.2), ...rest } = opts;
  return lathe([[s0, 0], [s0, r - b], [s0 + b, r], [s1 - b, r], [s1, r - b], [s1, 0]], rest);
}

/** Tube (open bore) along s: outer radius ro, inner ri. */
export function tube(s0, s1, ro, ri, opts = {}) {
  const { b = Math.min(0.5, (ro - ri) * 0.3), ...rest } = opts;
  return lathe([[s0, ri], [s0, ro - b], [s0 + b, ro], [s1 - b, ro], [s1, ro - b], [s1, ri], [s0, ri]], rest);
}

/** Rounded box centred at [s, t, w] with size [ls, lt, lw]; rot = three Euler in degrees (x, y, z). */
export function box(center, size, opts = {}) {
  const { r = 0.8, seg = 2, rot } = opts;
  const [ls, lt, lw] = size;
  const rr = Math.min(r, ls / 2 - 0.01, lt / 2 - 0.01, lw / 2 - 0.01);
  const geo = rr > 0.05 ? new RoundedBoxGeometry(lw, lt, ls, seg, rr) : new THREE.BoxGeometry(lw, lt, ls);
  if (rot) geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG)));
  const c = V(...center);
  geo.translate(c.x, c.y, c.z);
  return finish(geo);
}

/** Sphere / ellipsoid at [s, t, w]. */
export function sphere(center, r, opts = {}) {
  const { scale = [1, 1, 1], seg = 20 } = opts;
  const geo = new THREE.SphereGeometry(r, seg, Math.max(8, seg >> 1));
  geo.scale(scale[2], scale[1], scale[0]);
  const c = V(...center);
  geo.translate(c.x, c.y, c.z);
  return finish(geo, 80 * DEG);
}

/** Tube swept along a path of [s, t, w] points (cables, handles, wires). */
export function sweep(points, r, opts = {}) {
  const { seg = 48, radial = 10, closed = false, tension = 0.5 } = opts;
  const curve = new THREE.CatmullRomCurve3(points.map((p) => V(...p)), closed, 'catmullrom', tension);
  return finish(new THREE.TubeGeometry(curve, seg, r, radial, closed), 70 * DEG);
}

/** Torus ring around the forward axis at s (e.g. sling swivels, muzzle rings). */
export function ring(s, R, r, opts = {}) {
  const { t = 0, w = 0, axis = 's', seg = 32 } = opts;
  const geo = new THREE.TorusGeometry(R, r, 10, seg);
  if (axis === 'w') geo.rotateY(Math.PI / 2);
  else if (axis === 't') geo.rotateX(Math.PI / 2);
  const c = V(s, t, w);
  geo.translate(c.x, c.y, c.z);
  return finish(geo, 80 * DEG);
}

/** Picatinny rail along s (top of the receiver by default): base + teeth. */
export function rail(s0, s1, opts = {}) {
  const { t = 0, w = 0, width = 21.2, height = 6, slot = 10, tooth = 5.3, side = 'top' } = opts;
  const parts = [];
  const len = s1 - s0;
  parts.push(section([[-width / 2 + 2, 0], [width / 2 - 2, 0], [width / 2, 2, 0.4], [width / 2 - 1.2, height * 0.55, 0.3], [-width / 2 + 1.2, height * 0.55, 0.3], [-width / 2, 2, 0.4]], s0, s1, { bevel: 0.3 }));
  const n = Math.floor(len / slot);
  const off = (len - n * slot) / 2 + (slot - tooth) / 2;
  for (let i = 0; i < n; i++) {
    const a = s0 + off + i * slot;
    parts.push(section([[-width / 2 + 0.8, height * 0.5], [width / 2 - 0.8, height * 0.5], [width / 2 - 1.6, height, 0.3], [-width / 2 + 1.6, height, 0.3]], a, a + tooth, { bevel: 0.25 }));
  }
  let geo = merge(parts);
  if (side !== 'top') {
    const ang = side === 'left' ? -90 : side === 'right' ? 90 : 180;
    geo.rotateZ(-ang * DEG);
  }
  geo.translate(w, t, 0);
  return geo;
}

/** Screw head (slotted) facing +w or -w at [s, t, w]. */
export function screw(center, r = 2, opts = {}) {
  const { face = 'w', depth = 1 } = opts;
  const head = lathe([[0, 0], [0, r], [depth * 0.6, r * 0.95], [depth, r * 0.6], [depth, 0]], { seg: 16 });
  // lathe makes it along s; rotate to face +w
  if (face === 'w') head.rotateY(-Math.PI / 2);
  else if (face === '-w') head.rotateY(Math.PI / 2);
  else if (face === 't') head.rotateX(Math.PI / 2);
  const c = V(...center);
  head.translate(c.x, c.y, c.z);
  return head;
}

export function merge(list) {
  const geos = list.filter(Boolean).map((g) => {
    const c = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(c.attributes)) if (k !== 'position' && k !== 'normal') c.deleteAttribute(k);
    return c;
  });
  return mergeGeometries(geos, false);
}

/** Transforms a geometry: rotate (deg, three axes, about pivot [s,t,w]) then translate by [ds, dt, dw]. */
export function xform(geo, { rot, pivot = [0, 0, 0], move, scale } = {}) {
  const p = V(...pivot);
  geo.translate(-p.x, -p.y, -p.z);
  if (scale) geo.scale(scale[2] ?? scale, scale[1] ?? scale, scale[0] ?? scale);
  if (rot) geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG)));
  geo.translate(p.x, p.y, p.z);
  if (move) { const m = V(...move); geo.translate(m.x, m.y, m.z); }
  return geo;
}

/** Mirror across the w = 0 plane (left/right copy). */
export function mirrorW(geo) {
  const g = geo.clone();
  g.scale(-1, 1, 1);
  flipWinding(g);
  if (g.attributes.normal) { const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setX(i, -n.getX(i)); }
  return g;
}

// ------------------------------------------------------------------------------------------ CSG

const evaluator = new Evaluator();
evaluator.attributes = ['position', 'normal'];
evaluator.useGroups = false;

function brush(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  const b = new Brush(g);
  b.updateMatrixWorld();
  return b;
}

/** a minus every cutter in `cutters` (geometry or array). */
export function cut(a, cutters) {
  let res = brush(a);
  for (const c of [].concat(cutters)) {
    res = evaluator.evaluate(res, brush(c), SUBTRACTION);
  }
  return finish(res.geometry);
}
export function union(a, others) {
  let res = brush(a);
  for (const c of [].concat(others)) res = evaluator.evaluate(res, brush(c), ADDITION);
  return finish(res.geometry);
}
export function intersect(a, b) {
  return finish(evaluator.evaluate(brush(a), brush(b), INTERSECTION).geometry);
}

/** Cutter helpers (slightly oversized so faces never coincide). */
export const cutters = {
  /** hole through the gun along w at [s, t], radius r */
  holeW: (s, t, r, len = 200) => { const g = new THREE.CylinderGeometry(r, r, len, 24); g.rotateZ(Math.PI / 2); const c = V(s, t, 0); g.translate(c.x, c.y, c.z); return g; },
  /** hole along t (vertical) */
  holeT: (s, w, r, t0 = -200, t1 = 200) => { const g = new THREE.CylinderGeometry(r, r, t1 - t0, 24); const c = V(s, (t0 + t1) / 2, w); g.translate(c.x, c.y, c.z); return g; },
  /** hole along s (bore) */
  holeS: (t, w, r, s0 = -500, s1 = 2000) => cyl(s0, s1, r, { t, w, b: 0 }),
  /** slot: rounded rectangle in side view, cut through w */
  slotW: (s0, s1, t, h, depth = 200, cw = 0) => profile([[s0, t - h / 2, h / 2], [s1, t - h / 2, h / 2], [s1, t + h / 2, h / 2], [s0, t + h / 2, h / 2]], { w: depth, cw, bevel: 0 }),
  /** pocket on one side: rounded rect in side view, from w = w0 outward */
  pocketW: (pts, w0, depth = 50) => profile(pts, { w: depth, cw: w0 + Math.sign(w0 || 1) * depth / 2, bevel: 0 }),
  box: (center, size) => { const g = new THREE.BoxGeometry(size[2], size[1], size[0]); const c = V(...center); g.translate(c.x, c.y, c.z); return g; },
};

// ------------------------------------------------------------------------------------------ assembly

class Part {
  constructor(gun, name, opts) {
    this.gun = gun;
    this.name = name;
    this.pivot = V(...(opts.pivot || [0, 0, 0]));
    this.parent = opts.parent || null;
    this.geos = new Map(); // material -> [geometry]
    this.extras = opts.extras || {};
  }
  add(geo, mat = 'steel') {
    if (!geo) return this;
    if (!this.geos.has(mat)) this.geos.set(mat, []);
    this.geos.get(mat).push(geo);
    return this;
  }
}

export class Gun {
  constructor(id) {
    this.id = id;
    this.parts = new Map();
    this.sockets = {};
    this.metaData = {};
    this.part('body');
  }
  part(name, opts = {}) {
    if (!this.parts.has(name)) this.parts.set(name, new Part(this, name, opts));
    return this.parts.get(name);
  }
  add(geo, mat) { return this.part('body').add(geo, mat); }
  /** Named attachment point; dir = optional forward direction [s, t, w]; up optional. Coordinates in mm (gun space). */
  socket(name, pos, extra = {}) { this.sockets[name] = { pos: V(...pos), ...extra }; return this; }
  meta(obj) { Object.assign(this.metaData, obj); return this; }

  /** Builds the THREE scene graph in metres. */
  build({ bake = true, tessellate = 12 } = {}) {
    const root = new THREE.Group();
    root.name = this.id;
    const groups = new Map();
    const meshes = [];
    for (const part of this.parts.values()) {
      const g = new THREE.Group();
      g.name = part.name;
      g.userData = { part: true, ...part.extras };
      groups.set(part.name, g);
    }
    for (const part of this.parts.values()) {
      const g = groups.get(part.name);
      const parent = part.parent ? groups.get(part.parent) : root;
      const parentPivot = part.parent ? this.parts.get(part.parent).pivot : new THREE.Vector3();
      g.position.copy(part.pivot).sub(parentPivot).multiplyScalar(0.001);
      parent.add(g);
      for (const [mat, list] of part.geos) {
        const geo = merge(list);
        geo.translate(-part.pivot.x, -part.pivot.y, -part.pivot.z);
        geo.scale(0.001, 0.001, 0.001);
        const mesh = new THREE.Mesh(geo, materialFor(mat));
        mesh.name = `${part.name}:${mat}`;
        mesh.userData.mat = mat;
        g.add(mesh);
        meshes.push(mesh);
      }
    }
    for (const [name, s] of Object.entries(this.sockets)) {
      const o = new THREE.Object3D();
      o.name = 'S_' + name;
      o.position.copy(s.pos).multiplyScalar(0.001);
      if (s.rot) o.rotation.set(s.rot[0] * DEG, s.rot[1] * DEG, s.rot[2] * DEG);
      const extra = { ...s }; delete extra.pos; delete extra.rot;
      o.userData = extra;
      root.add(o);
    }
    root.userData = { weapon: this.id, ...this.metaData };
    root.updateMatrixWorld(true);
    if (bake) bakeMeshes(meshes, { tessellate: tessellate * 0.001, aoDist: 0.035, rays: 32, log: true });
    return root;
  }

  async export(file, opts) {
    const root = this.build(opts);
    const glb = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: false });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(glb));
    let tris = 0;
    root.traverse((o) => { if (o.isMesh) tris += o.geometry.attributes.position.count / 3; });
    return { file, bytes: glb.byteLength, tris: Math.round(tris) };
  }
}

const matCache = new Map();
function materialFor(name) {
  if (!matCache.has(name)) {
    const m = new THREE.MeshStandardMaterial({ name });
    matCache.set(name, m);
  }
  return matCache.get(name);
}
