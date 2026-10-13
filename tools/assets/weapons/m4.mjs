// 哨兵 Sentry-4 — M4A1 / HK416-pattern 5.56 mm carbine: free-float M-LOK rail, tube red dot on a riser,
// folding BUIS, CTR-style collapsible stock (shown fully extended). Black hard-anodised receivers and rail; FDE
// (polymer_tan) stock, hand stop and magazine for value contrast against the black gun; black grip and controls.
// Side view, mm: s forward from the rear face of the upper receiver, t up from the bore axis, w right
// (ejection-port side). Real dimensions: 840 mm overall (stock extended), 368 mm (14.5 in) barrel from the
// breech face (s = 152) to the crown (s = 520), A2 birdcage to s = 564, butt pad at s = -276.
import * as THREE from 'three';
import { toCreasedNormals, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshBVH } from 'three-mesh-bvh';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';
import { Gun, V, DEG, makeShape, profile, plan, section, lathe, cyl, tube, box, sphere, sweep, cut, cutters, merge, xform, circle } from '../lib/gunkit.mjs';
import { bakeMeshes } from '../lib/bake.mjs';

// ------------------------------------------------------------------------------------------ post-bake (kit gaps)
//
// The kit bakes edge wear per vertex from welded-normal curvature with one global scale (1/150 per metre). Two
// problems on a black anodised carbine:
//  1. every vertex that touches a bevel saturates, and its value is then interpolated across whatever triangle
//     fans out from it into the flat face (earcut cap slivers, 178/290 mm extrusion walls, CSG slot fans) ->
//     white shards and streaks on flat anodised faces;
//  2. round alu / steel surfaces under ~7 mm radius (tubes, pins, turrets) bake to half wear -> blotchy chrome.
// postBake() runs after the kit's bake: (a) the edge channel is recomputed per mesh with its own curvature scale and
// cap (WEAR rules), then (b) faceClean() gives every vertex of a flat face its own unworn copy, so the wear stays on
// the bevel / fillet / chamfer strips and ends at the edge of the face instead of smearing over it (no extra triangles).

const WQ = 2e5; // weld grid: 5 µm (geometry is in metres here)
function weldIds(pos) {
  const n = pos.count, ids = new Int32Array(n), map = new Map();
  let W = 0;
  for (let i = 0; i < n; i++) {
    const k = Math.round(pos.getX(i) * WQ) + ',' + Math.round(pos.getY(i) * WQ) + ',' + Math.round(pos.getZ(i) * WQ);
    let id = map.get(k);
    if (id === undefined) { id = W++; map.set(k, id); }
    ids[i] = id;
  }
  return { ids, W };
}
/** welded positions + area-agnostic averaged normals (as the kit's bake does) */
function weldData(geo) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const { ids, W } = weldIds(pos);
  const wp = new Float64Array(W * 3), wn = new Float64Array(W * 3);
  for (let i = 0; i < pos.count; i++) {
    const id = ids[i];
    wp[id * 3] = pos.getX(i); wp[id * 3 + 1] = pos.getY(i); wp[id * 3 + 2] = pos.getZ(i);
    wn[id * 3] += nor.getX(i); wn[id * 3 + 1] += nor.getY(i); wn[id * 3 + 2] += nor.getZ(i);
  }
  for (let i = 0; i < W; i++) {
    const l = Math.hypot(wn[i * 3], wn[i * 3 + 1], wn[i * 3 + 2]) || 1;
    wn[i * 3] /= l; wn[i * 3 + 1] /= l; wn[i * 3 + 2] /= l;
  }
  return { ids, W, wp, wn };
}
/** per-vertex convex curvature (1/m), same estimator as tools/assets/lib/bake.mjs */
function curvature(geo) {
  const { ids, W, wp, wn } = weldData(geo);
  const idx = geo.index.array, sum = new Float64Array(W), cnt = new Float64Array(W);
  const edge = (a, b) => {
    if (a === b) return;
    const dx = wp[b * 3] - wp[a * 3], dy = wp[b * 3 + 1] - wp[a * 3 + 1], dz = wp[b * 3 + 2] - wp[a * 3 + 2];
    const l2 = dx * dx + dy * dy + dz * dz;
    if (l2 < 1e-14) return;
    const k = ((wn[b * 3] - wn[a * 3]) * dx + (wn[b * 3 + 1] - wn[a * 3 + 1]) * dy + (wn[b * 3 + 2] - wn[a * 3 + 2]) * dz) / l2;
    sum[a] += k; cnt[a]++; sum[b] += k; cnt[b]++;
  };
  for (let i = 0; i < idx.length; i += 3) {
    const a = ids[idx[i]], b = ids[idx[i + 1]], c = ids[idx[i + 2]];
    edge(a, b); edge(b, c); edge(c, a);
  }
  const out = new Float32Array(ids.length);
  for (let i = 0; i < ids.length; i++) out[i] = cnt[ids[i]] ? sum[ids[i]] / cnt[ids[i]] : 0;
  return out;
}

/**
 * Keeps the baked wear (g) off flat faces without adding triangles. Triangles are grouped into planar components
 * (coplanar and vertex-connected); a component whose rectangle-equivalent width (from its area-weighted second
 * moment in its plane) is at least `width` is a face: its vertices get their own copy with no wear and `cav` x the
 * cavity. Bevel / fillet / chamfer strips and curved surfaces keep the curvature wear, so it ends exactly at the edge
 * of the face instead of being interpolated across the long earcut / extrusion / CSG triangles that touch the bevel.
 */
function faceClean(geo, { width = 0.0016, cos = 0.9995, cav = 0.5 } = {}) {
  const P = geo.attributes.position.array, I = geo.index.array, nt = I.length / 3;
  const { ids, W } = weldIds(geo.attributes.position);
  const fn = new Float64Array(nt * 3), ar = new Float64Array(nt);
  for (let t = 0; t < nt; t++) {
    const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz);
    ar[t] = l / 2;
    if (l > 0) { fn[t * 3] = nx / l; fn[t * 3 + 1] = ny / l; fn[t * 3 + 2] = nz / l; }
  }
  // union coplanar triangles that share a welded vertex
  const par = new Int32Array(nt).map((_, i) => i);
  const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  const byV = Array.from({ length: W }, () => []);
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) byV[ids[I[t * 3 + k]]].push(t);
  for (const list of byV) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const s = list[i], t = list[j];
      if (fn[s * 3] * fn[t * 3] + fn[s * 3 + 1] * fn[t * 3 + 1] + fn[s * 3 + 2] * fn[t * 3 + 2] > cos) { const a = find(s), b = find(t); if (a !== b) par[a] = b; }
    }
  }
  // width of each component: minor axis of its in-plane second moment (exact per-triangle moments)
  const M = new Map();
  for (let t = 0; t < nt; t++) {
    if (!ar[t]) continue;
    const r = find(t);
    let m = M.get(r);
    if (!m) {
      const n = [fn[t * 3], fn[t * 3 + 1], fn[t * 3 + 2]], h = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      const u = [n[1] * h[2] - n[2] * h[1], n[2] * h[0] - n[0] * h[2], n[0] * h[1] - n[1] * h[0]], ul = Math.hypot(...u);
      u[0] /= ul; u[1] /= ul; u[2] /= ul;
      const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
      m = { u, v, A: 0, x: 0, y: 0, xx: 0, yy: 0, xy: 0 };
      M.set(r, m);
    }
    const q = [0, 1, 2].map((k) => { const i = I[t * 3 + k] * 3; return [P[i] * m.u[0] + P[i + 1] * m.u[1] + P[i + 2] * m.u[2], P[i] * m.v[0] + P[i + 1] * m.v[1] + P[i + 2] * m.v[2]]; });
    const gx = (q[0][0] + q[1][0] + q[2][0]) / 3, gy = (q[0][1] + q[1][1] + q[2][1]) / 3, a = ar[t];
    let cxx = 0, cyy = 0, cxy = 0;
    for (const [x, y] of q) { cxx += (x - gx) ** 2; cyy += (y - gy) ** 2; cxy += (x - gx) * (y - gy); }
    m.A += a; m.x += a * gx; m.y += a * gy;
    m.xx += a * (gx * gx + cxx / 12); m.yy += a * (gy * gy + cyy / 12); m.xy += a * (gx * gy + cxy / 12);
  }
  const isFace = new Map();
  for (const [r, m] of M) {
    const X = m.x / m.A, Y = m.y / m.A, sxx = m.xx / m.A - X * X, syy = m.yy / m.A - Y * Y, sxy = m.xy / m.A - X * Y;
    const lmin = (sxx + syy) / 2 - Math.sqrt(((sxx - syy) / 2) ** 2 + sxy * sxy);
    isFace.set(r, Math.sqrt(Math.max(0, 12 * lmin)) >= width);
  }
  // per vertex: face-only -> clean in place; shared by face and edge triangles -> clean copy for the face triangles
  const nv = geo.attributes.position.count, use = new Uint8Array(nv); // bit 1 face, bit 2 other
  const face = new Uint8Array(nt);
  for (let t = 0; t < nt; t++) { face[t] = ar[t] && isFace.get(find(t)) ? 1 : 0; for (let k = 0; k < 3; k++) use[I[t * 3 + k]] |= face[t] ? 1 : 2; }
  const dup = new Int32Array(nv).fill(-1);
  let extra = 0;
  for (let i = 0; i < nv; i++) if (use[i] === 3) dup[i] = nv + extra++;
  const N = geo.attributes.normal.array, B = geo.attributes._bake.array;
  const P2 = new Float32Array((nv + extra) * 3), N2 = new Float32Array((nv + extra) * 3), B2 = new Uint8Array((nv + extra) * 4);
  P2.set(P); N2.set(N); B2.set(B);
  for (let i = 0; i < nv; i++) {
    const j = use[i] === 1 ? i : dup[i];
    if (j < 0) continue;
    if (j !== i) { P2.set(P.subarray(i * 3, i * 3 + 3), j * 3); N2.set(N.subarray(i * 3, i * 3 + 3), j * 3); B2.set(B.subarray(i * 4, i * 4 + 4), j * 4); }
    B2[j * 4 + 1] = 0;
    B2[j * 4 + 2] = Math.round(B[i * 4 + 2] * cav);
  }
  const I2 = nv + extra < 65536 ? new Uint16Array(I.length) : new Uint32Array(I.length); // 16-bit index when it fits
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) { const i = I[t * 3 + k]; I2[t * 3 + k] = face[t] && dup[i] >= 0 ? dup[i] : i; }
  const g2 = new THREE.BufferGeometry();
  g2.setAttribute('position', new THREE.BufferAttribute(P2, 3));
  g2.setAttribute('normal', new THREE.BufferAttribute(N2, 3));
  g2.setAttribute('_bake', new THREE.BufferAttribute(B2, 4, true));
  g2.setIndex(new THREE.BufferAttribute(I2, 1));
  return g2;
}

/**
 * Wear rules per mesh 'part:mat' (or '*:mat'): [curvature (1/m) that maps to full wear, cap]. Hard-anodised alu
 * only scuffs on true edges (bevels under ~1.5 mm) and never past a chipped 0.6; tubes and turrets stay black.
 */
const WEAR = {
  '*:alu': [1 / 1100, 0.52], '*:steel_dark': [1 / 1000, 0.6], '*:steel': [1 / 800, 0.7], '*:steel_bright': [1 / 500, 0.8],
  'body:steel_bright': [0, 0], // roll-marks and selector markings: bare bright metal, never chipped
  '*:paint_white': [0, 0],
  '*:polymer': [1 / 450, 0.75], '*:polymer_tan': [1 / 450, 0.8], '*:polymer_grip': [1 / 450, 0.6], '*:rubber': [1 / 450, 0.5],
};
/**
 * The kit's bake with one change: meshes are pre-tessellated to the same 12 mm with up to 14 split iterations (the
 * kit stops after 6), so the long earcut / extrusion slivers really end up <= 12 mm and the per-vertex AO does not
 * streak across a whole magazine side or handguard flat. Same AO distance, ray count and tessellation length.
 */
export function bakeRoot(root, tessMm = 12) {
  const meshes = [];
  root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const m of meshes) {
    let geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
    m.geometry = new TessellateModifier(tessMm * 0.001, 14).modify(geo);
  }
  bakeMeshes(meshes, { tessellate: tessMm * 0.001, aoDist: 0.035, rays: 32, log: true });
}

/**
 * Kitbashed parts overlap (ribs on the magazine, panels on the lower, screws in faces): body vertices buried inside
 * another solid bake to near-black AO, and that value bleeds up to 12 mm into the visible face around the part as a
 * dark blotch. A vertex is buried when rays along its normal hit a back face first; its AO is then refilled from its
 * visible neighbours (a few relaxation passes), so only the real contact shadow stays.
 */
function unburyAO(meshes, { dist = 0.035, rays = 5 } = {}) {
  const world = meshes.map((m) => { const g = m.geometry.clone(); for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k); return g.applyMatrix4(m.matrixWorld); });
  const bvh = new MeshBVH(mergeGeometries(world.map((g) => (g.index ? g.toNonIndexed() : g)), false));
  const ray = new THREE.Ray(), p = new THREE.Vector3(), n = new THREE.Vector3(), d = new THREE.Vector3(), nm = new THREE.Matrix3();
  const jit = [[0, 0], [0.35, 0], [-0.35, 0], [0, 0.35], [0, -0.35]].slice(0, rays);
  let total = 0;
  for (const m of meshes) {
    const G = m.geometry, pos = G.attributes.position, nor = G.attributes.normal, B = G.attributes._bake.array, I = G.index.array, nv = pos.count;
    nm.getNormalMatrix(m.matrixWorld);
    const buried = new Uint8Array(nv);
    for (let i = 0; i < nv; i++) {
      if (B[i * 4] > 140) continue; // only dark vertices can be buried
      p.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      const t = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0).cross(n).normalize() : new THREE.Vector3(1, 0, 0).cross(n).normalize(), b = new THREE.Vector3().crossVectors(n, t);
      let back = 0;
      for (const [a, c] of jit) {
        d.copy(n).addScaledVector(t, a).addScaledVector(b, c).normalize();
        ray.origin.copy(p).addScaledVector(n, 0.00005);
        ray.direction.copy(d);
        const hit = bvh.raycastFirst(ray, THREE.DoubleSide, 0, dist);
        if (hit && hit.face && hit.face.normal.dot(d) > 0) back++;
      }
      if (back === jit.length) buried[i] = 1;
    }
    // relax: buried AO <- mean of non-buried (or already refilled) neighbours
    const nb = Array.from({ length: nv }, () => []);
    for (let k = 0; k < I.length; k += 3) for (let e = 0; e < 3; e++) { const a = I[k + e], c = I[k + (e + 1) % 3]; nb[a].push(c); nb[c].push(a); }
    let todo = [];
    for (let i = 0; i < nv; i++) if (buried[i]) todo.push(i);
    total += todo.length;
    for (let pass = 0; pass < 8 && todo.length; pass++) {
      const next = [], set = [];
      for (const i of todo) {
        let s = 0, c = 0;
        for (const j of nb[i]) if (!buried[j]) { s += B[j * 4]; c++; }
        if (c) set.push([i, Math.round(s / c)]); else next.push(i);
      }
      for (const [i, v] of set) { B[i * 4] = v; buried[i] = 0; }
      todo = next;
    }
  }
  return total;
}

export function postBake(root, opts = {}, wear = WEAR) {
  const meshes = [];
  root.traverse((o) => { if (o.isMesh && o.geometry.attributes._bake) meshes.push(o); });
  root.updateMatrixWorld(true);
  if (opts.unbury !== false) unburyAO(meshes);
  for (const o of meshes) {
    // lenses sit 2-6 mm deep in the tube: keep their AO open so the coating reflection still reads
    if (o.name.endsWith(':lens')) { const B = o.geometry.attributes._bake.array; for (let i = 0; i < B.length; i += 4) B[i] = Math.max(B[i], 215); }
    const geo = o.geometry;
    const rule = wear[o.name] ?? wear['*:' + o.name.split(':')[1]];
    if (rule) {
      const [scale, cap] = rule, bk = geo.attributes._bake.array, cv = curvature(geo);
      for (let i = 0; i < cv.length; i++) bk[i * 4 + 1] = Math.round(Math.max(0, Math.min(cap, cv[i] * scale)) * 255);
    }
    o.geometry = faceClean(geo, opts);
  }
}

// ------------------------------------------------------------------------------------------ local helpers

// Low-segment wrappers: the kit defaults to 10 segments per fillet, far too many for a 45k budget.
const PF = (pts, o = {}) => profile(pts, { curveSeg: 3, ...o });
const PL = (pts, o = {}) => plan(pts, { curveSeg: 3, ...o });
const SC = (pts, a, b, o = {}) => section(pts, a, b, { curveSeg: 3, ...o });
/** chamfered box: octagonal section along s (60 tris; a seg-1 RoundedBox costs 108) */
const cb = ([s, t, w], [ls, lt, lw], b = 0.5) => {
  const hw = lw / 2, ht = lt / 2, c = Math.min(b, hw - 0.05, ht - 0.05);
  return section([[w - hw + c, t - ht], [w + hw - c, t - ht], [w + hw, t - ht + c], [w + hw, t + ht - c], [w + hw - c, t + ht], [w - hw + c, t + ht],
    [w - hw, t + ht - c], [w - hw, t - ht + c]], s - ls / 2, s + ls / 2, { bevel: Math.min(b, ls / 2 - 0.05), bevelSeg: 1 });
};

function flipWinding(geo) {
  const p = geo.attributes.position;
  if (geo.index) {
    const idx = geo.index.array;
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    return;
  }
  for (let i = 0; i < p.count; i += 3) {
    for (let c = 0; c < 3; c++) { const t = p.array[(i + 1) * 3 + c]; p.array[(i + 1) * 3 + c] = p.array[(i + 2) * 3 + c]; p.array[(i + 2) * 3 + c] = t; }
  }
}
function finishGeo(geo, crease = 38) {
  for (const k of Object.keys(geo.attributes)) if (k !== 'position') geo.deleteAttribute(k);
  const g = geo.index ? geo.toNonIndexed() : geo;
  return toCreasedNormals(g, crease * DEG);
}
/**
 * Kit section() with extrusion steps: the walls get a vertex ring every `step` mm along s instead of one 178 / 290 mm
 * quad, so the bake's 12 mm tessellation (6 iterations) ends in a regular grid rather than long slivers.
 */
function SS(spec, s0, s1, { bevel = 0.6, bevelSeg = 2, curveSeg = 3, holes = [], step = 20 } = {}) {
  const shape = makeShape(spec);
  for (const hp of holes) shape.holes.push(hp instanceof THREE.Path ? hp : makeShape(hp, THREE.Path));
  const len = Math.abs(s1 - s0);
  const b = Math.max(0, Math.min(bevel, len / 2 - 0.05));
  const depth = Math.max(0.02, len - 2 * b);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: bevelSeg, curveSegments: curveSeg,
    steps: Math.max(1, Math.ceil(depth / step)),
  });
  geo.translate(0, 0, b + Math.min(s0, s1));
  geo.scale(1, 1, -1);
  flipWinding(geo);
  return finishGeo(geo);
}
/** offsets a [[x, y, r?], ...] outline outward by d (mitred corners, fillet radii grow by d) */
function grow(pts, d) {
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; area += p[0] * q[1] - q[0] * p[1]; }
  const sg = area > 0 ? 1 : -1;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const l1 = Math.hypot(p[0] - a[0], p[1] - a[1]) || 1, l2 = Math.hypot(b[0] - p[0], b[1] - p[1]) || 1;
    const n1 = [((p[1] - a[1]) / l1) * sg, (-(p[0] - a[0]) / l1) * sg], n2 = [((b[1] - p[1]) / l2) * sg, (-(b[0] - p[0]) / l2) * sg];
    let mx = n1[0] + n2[0], my = n1[1] + n2[1];
    const ml = Math.hypot(mx, my) || 1;
    mx /= ml; my /= ml;
    const k = d / Math.max(0.3, mx * n1[0] + my * n1[1]);
    return [p[0] + mx * k, p[1] + my * k, p[2] ? Math.max(0.05, p[2] + d) : 0];
  });
}
const rrPts = (s0, s1, t0, t1, r) => [[s0, t0, r], [s1, t0, r], [s1, t1, r], [s0, t1, r]];
/** chamfer cutter (45 deg x d) for an opening `pts` (side view) in a face looking along side*w at |w| = wf */
const chamW = (pts, wf, side, d = 0.5, depth = 6) => PF(grow(pts, d), { w: depth, cw: side * (wf - d + depth / 2), bevel: d, bevelSeg: 1, curveSeg: 2 });
/** straight-walled cutter for an opening `pts` (side view) from w0 outward (sign of side) */
const potW = (pts, w0, side, depth = 30) => PF(pts, { w: depth, cw: side * (w0 + depth / 2), bevel: 0, curveSeg: 2 });

/**
 * Loft along t through rounded rectangles [t, s0, s1, hw, r] (top to bottom). With `inner` rings (same count) it is
 * a hollow well: outer wall, inner wall and annular top / bottom faces. Gives the magwell its flared mouth.
 */
function loftT(outer, inner = null, nc = 3) {
  const ring = ([t, s0, s1, hw, r]) => {
    const pts = [];
    const cs = [[s1 - r, hw - r, 0], [s0 + r, hw - r, 90], [s0 + r, -hw + r, 180], [s1 - r, -hw + r, 270]];
    for (const [cx, cy, a0] of cs) for (let i = 0; i <= nc; i++) { const a = (a0 + (90 * i) / nc) * DEG; pts.push(V(cx + r * Math.cos(a), t, cy + r * Math.sin(a))); }
    return { pts, c: V((s0 + s1) / 2, t, 0) };
  };
  const tris = [];
  const push = (a, b, c, out) => {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (n.dot(out) >= 0) tris.push(a, b, c); else tris.push(a, c, b);
  };
  const wall = (rings, sign) => {
    for (let i = 0; i + 1 < rings.length; i++) {
      const A = rings[i], B = rings[i + 1], n = A.pts.length;
      for (let k = 0; k < n; k++) {
        const k1 = (k + 1) % n;
        const out = A.pts[k].clone().add(A.pts[k1]).multiplyScalar(0.5).sub(A.c).setY(0).multiplyScalar(sign);
        push(A.pts[k], A.pts[k1], B.pts[k1], out);
        push(A.pts[k], B.pts[k1], B.pts[k], out);
      }
    }
  };
  const O = outer.map(ring), I = inner ? inner.map(ring) : null;
  wall(O, 1);
  if (I) wall(I, -1);
  for (const [ri, up] of [[0, 1], [O.length - 1, -1]]) {
    const o = O[ri], n = o.pts.length, out = new THREE.Vector3(0, up, 0);
    if (I) {
      const ii = I[ri === 0 ? 0 : I.length - 1];
      for (let k = 0; k < n; k++) { const k1 = (k + 1) % n; push(o.pts[k], o.pts[k1], ii.pts[k1], out); push(o.pts[k], ii.pts[k1], ii.pts[k], out); }
    } else for (let k = 0; k < n; k++) push(o.c, o.pts[k], o.pts[(k + 1) % n], out);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(tris.flatMap((p) => [p.x, p.y, p.z]), 3));
  return finishGeo(geo);
}

// ---- direct plate builder (openings without CSG)
/** kit shape spec -> de-duplicated [[x, y]] polygon, same discretisation as the kit's extrusions (curveSeg div) */
function polyPts(spec, div = 3) {
  const out = [];
  for (const p of makeShape(spec).getPoints(div)) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p.x - q[0], p.y - q[1]) > 1e-4) out.push([p.x, p.y]);
  }
  if (out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 1e-4) out.pop();
  return out;
}
const area2 = (P) => { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return a; };
/** mitred offset of a closed polygon, away from its interior for d > 0 */
function offsetPoly(P, d) {
  const n = P.length, sg = area2(P) > 0 ? 1 : -1;
  return P.map((p, i) => {
    const a = P[(i - 1 + n) % n], b = P[(i + 1) % n];
    const l1 = Math.hypot(p[0] - a[0], p[1] - a[1]) || 1, l2 = Math.hypot(b[0] - p[0], b[1] - p[1]) || 1;
    const n1 = [((p[1] - a[1]) / l1) * sg, (-(p[0] - a[0]) / l1) * sg], n2 = [((b[1] - p[1]) / l2) * sg, (-(b[0] - p[0]) / l2) * sg];
    let mx = n1[0] + n2[0], my = n1[1] + n2[1];
    const ml = Math.hypot(mx, my) || 1;
    mx /= ml; my /= ml;
    const k = d / Math.max(0.3, mx * n1[0] + my * n1[1]);
    return [p[0] + mx * k, p[1] + my * k];
  });
}
/** nearest point of a closed polygon to P: { i (segment), t, q (point) } */
function locate(C, P) {
  let best = { d: Infinity };
  for (let i = 0; i < C.length; i++) {
    const a = C[i], b = C[(i + 1) % C.length], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((P[0] - a[0]) * dx + (P[1] - a[1]) * dy) / l2)) : 0;
    const q = [a[0] + dx * t, a[1] + dy * t], d = Math.hypot(P[0] - q[0], P[1] - q[1]);
    if (d < best.d) best = { d, i, t, q };
  }
  return best;
}
/** boundary of polygon C from A to B in its own winding order (A, B on the boundary) */
function chain(C, A, B) {
  const a = locate(C, A), b = locate(C, B), n = C.length, out = [a.q];
  if (!(a.i === b.i && a.t <= b.t)) for (let i = (a.i + 1) % n; ; i = (i + 1) % n) { out.push(C[i]); if (i === b.i) break; }
  out.push(b.q);
  return out;
}
/** pushes triangle (a, b, c), flipped if needed so that it faces `out` */
function tri(list, a, b, c, out) {
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
  if (n.dot(out) >= 0) list.push(a, b, c); else list.push(a, c, b);
}
/**
 * Plate with chamfered openings, built directly (no CSG): outline / holes are kit specs in a local (x, y) plane, the
 * thickness runs along local z from 0 (inner face) to th (outer face). Openings get a 45 deg x d chamfer on the outer
 * face and square walls below it; the outline's own edges stay square so the plate butts flush against its
 * neighbours. place(x, y, z) maps local to gun space (any handedness).
 */
function plate(outline, holes, th, d, place, div = 2) {
  const O = polyPts(outline, div), H = holes.map((h) => polyPts(h, div)), HG = H.map((P) => offsetPoly(P, d));
  const L = (p, z) => place(p[0], p[1], z);
  const dir = (x, y, z, dx, dy, dz) => place(x + dx, y + dy, z + dz).sub(place(x, y, z)).normalize();
  const up = dir(0, 0, 0, 0, 0, 1), dn = up.clone().negate(), P3 = [], N3 = [];
  // analytic normals: flat caps, per-vertex radial normals round the openings (smooth slot ends, crisp chamfer)
  const face = (v, n, out) => {
    const f = new THREE.Vector3().subVectors(v[1], v[0]).cross(new THREE.Vector3().subVectors(v[2], v[0]));
    const o = f.dot(out) >= 0 ? [0, 1, 2] : [0, 2, 1];
    for (const k of o) { P3.push(v[k]); N3.push(n[k]); }
  };
  const cap = (hs, z, nrm) => {
    const f = THREE.ShapeUtils.triangulateShape(O.map(([x, y]) => new THREE.Vector2(x, y)), hs.map((h) => h.map(([x, y]) => new THREE.Vector2(x, y))));
    const all = [O, ...hs].flat();
    for (const [a, b, c] of f) face([L(all[a], z), L(all[b], z), L(all[c], z)], [nrm, nrm, nrm], nrm);
  };
  cap(HG, th, up);
  cap(H, 0, dn);
  const sg = area2(O) > 0 ? 1 : -1;
  for (let i = 0; i < O.length; i++) {
    const p = O[i], q = O[(i + 1) % O.length];
    const out = dir(p[0], p[1], 0, (q[1] - p[1]) * sg, -(q[0] - p[0]) * sg, 0);
    face([L(p, 0), L(q, 0), L(q, th)], [out, out, out], out); face([L(p, 0), L(q, th), L(p, th)], [out, out, out], out);
  }
  H.forEach((P, hi) => {
    const G = HG[hi], n = P.length;
    // into-the-opening direction per vertex (the offset G - P points into the material)
    const R = P.map((p, i) => dir(p[0], p[1], 0, p[0] - G[i][0], p[1] - G[i][1], 0));
    const C = R.map((r) => r.clone().add(up).normalize());
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, oc = C[i].clone().add(C[j]), ow = R[i].clone().add(R[j]);
      face([L(G[i], th), L(G[j], th), L(P[j], th - d)], [C[i], C[j], C[j]], oc); face([L(G[i], th), L(P[j], th - d), L(P[i], th - d)], [C[i], C[j], C[i]], oc);
      face([L(P[i], th - d), L(P[j], th - d), L(P[j], 0)], [R[i], R[j], R[j]], ow); face([L(P[i], th - d), L(P[j], 0), L(P[i], 0)], [R[i], R[j], R[i]], ow);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P3.flatMap((p) => [p.x, p.y, p.z]), 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N3.flatMap((p) => [p.x, p.y, p.z]), 3));
  return geo;
}

/**
 * Picatinny rail: base + chamfered teeth on the 10 mm pitch (MIL-STD-1913: 5.23 mm slots, ~4.8 mm teeth).
 * Light version of kit.rail (~300 tris per tooth there); the tooth bevel stays at 0.2 so the edge wear is a hairline.
 */
function lightRail(s0, s1, t) {
  const parts = [SS([[-8.6, 0], [8.6, 0], [10.6, 2], [9.4, 3.3], [-9.4, 3.3], [-10.6, 2]], s0, s1, { bevel: 0.4, bevelSeg: 1, step: 20 })];
  const TOOTH = 4.8, n = Math.floor((s1 - s0) / 10), off = (s1 - s0 - n * 10) / 2 + (10 - TOOTH) / 2;
  for (let i = 0; i < n; i++) {
    const a = s0 + off + i * 10;
    parts.push(section([[-9.8, 3], [9.8, 3], [9.2, 6], [-9.2, 6]], a, a + TOOTH, { bevel: 0.2, bevelSeg: 1 }));
  }
  return xform(merge(parts), { move: [0, t, 0] });
}

// Lathe along a principal axis: pts [[a, r]] with a measured from `at` along +axis.
const ROT = { s: null, t: [90, 0, 0], '-t': [-90, 0, 0], w: [0, -90, 0], '-w': [0, 90, 0] };
function lax(pts, at, axis = 's', seg = 20) {
  const g = lathe(pts, { seg });
  if (ROT[axis]) xform(g, { rot: ROT[axis] });
  const c = V(...at);
  g.translate(c.x, c.y, c.z);
  return g;
}
/** socket-head cap screw (round recess) */
const capScrew = (at, r, axis = 'w', d = 1.4, seg = 12) =>
  lax([[0, 0], [0, r], [d * 0.62, r], [d, r - 0.35], [d, r * 0.52], [d - 0.7, r * 0.5], [d - 0.7, 0]], at, axis, seg);
/** hex head / nut */
const hexHead = (at, r, axis = 'w', d = 1.6) => lax([[0, 0], [0, r], [d - 0.35, r], [d, r - 0.35], [d, 0]], at, axis, 6);
/** flush pin end */
const pinEnd = (at, r, axis = 'w', d = 0.6) => lax([[0, 0], [0, r], [d, r - 0.2], [d, 0]], at, axis, 14);
/** roll pin end (hollow look) */
const rollPin = (at, r, axis = 'w', d = 0.5) => lax([[0, 0], [0, r], [d, r - 0.15], [d, r * 0.55], [d - 0.4, r * 0.5], [d - 0.4, 0]], at, axis, 14);

const arcPts = (cs, ct, r, a0, a1, n) => {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = (a0 + ((a1 - a0) * i) / n) * Math.PI / 180; out.push([cs + r * Math.cos(a), ct + r * Math.sin(a)]); }
  return out;
};
/** star / gear outline for fluted knobs (extrude with profile -> axis w, plan -> axis t) */
const gearPts = (cx, cy, ro, ri, n) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, h = Math.PI / n;
    out.push([cx + ro * Math.cos(a - h * 0.35), cy + ro * Math.sin(a - h * 0.35)]);
    out.push([cx + ro * Math.cos(a + h * 0.35), cy + ro * Math.sin(a + h * 0.35)]);
    out.push([cx + ri * Math.cos(a + h), cy + ri * Math.sin(a + h)]);
  }
  return out;
};
/** rotated rounded bar (side view) from A to B, width wd */
const barPts = ([as, at], [bs, bt], wd, r = 1) => {
  const l = Math.hypot(bs - as, bt - at), ux = (bs - as) / l, uy = (bt - at) / l, nx = -uy * wd / 2, ny = ux * wd / 2;
  return [[as - nx, at - ny, r], [bs - nx, bt - ny, r], [bs + nx, bt + ny, r], [as + nx, at + ny, r]];
};

// 3x5 pixel font for raised roll-marks (+ 5x5 pointers)
const FONT = {
  A: ['010', '101', '111', '101', '101'], C: ['111', '100', '100', '100', '111'], D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'], F: ['111', '100', '110', '100', '100'], I: ['111', '010', '010', '010', '111'],
  L: ['100', '100', '100', '100', '111'], M: ['101', '111', '111', '101', '101'], N: ['110', '101', '101', '101', '101'],
  O: ['111', '101', '101', '101', '111'], P: ['111', '101', '111', '100', '100'], R: ['110', '101', '110', '101', '101'],
  S: ['111', '100', '111', '001', '111'], T: ['111', '010', '010', '010', '010'], U: ['101', '101', '101', '101', '111'],
  Y: ['101', '101', '010', '010', '010'], '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'], '3': ['111', '001', '011', '001', '111'], '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '110'], '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '001', '010', '010'],
  '8': ['111', '101', '111', '101', '111'], '9': ['111', '101', '111', '001', '111'], '-': ['000', '000', '111', '000', '000'],
  '.': ['000', '000', '000', '000', '010'], ' ': ['000', '000', '000', '000', '000'],
  '<': ['00100', '01100', '11111', '01100', '00100'], '>': ['00100', '00110', '11111', '00110', '00100'],
};
/** raised lettering on a face looking towards +w (side 1) or -w (side -1); reads left-to-right from that side */
function stamp(str, at, { px = 0.6, side = 1, h = 0.32 } = {}) {
  const [s0, t0, w0] = at;
  const parts = [];
  const glyphs = typeof str === 'string' ? [...str].map((c) => FONT[c] || FONT[' ']) : [str];
  let col = 0;
  for (const gl of glyphs) {
    gl.forEach((row, r) => {
      let c = 0;
      while (c < row.length) {
        if (row[c] !== '1') { c++; continue; }
        let e = c;
        while (e < row.length && row[e] === '1') e++;
        const sc = s0 + side * (col + (c + e) / 2) * px;
        parts.push(box([sc, t0 - (r + 0.5) * px, w0 + side * (h / 2 - 0.08)], [(e - c) * px, px, h], { r: 0 }));
        c = e;
      }
    });
    col += gl[0].length + 1;
  }
  return merge(parts);
}
// original maker's mark: a stylised "sentry eye"
const EYE = ['0001000', '0011100', '0110110', '1101011', '0110110', '0011100', '0001000'];

// ------------------------------------------------------------------------------------------ model

export default function build() {
  const g = new Gun('m4');
  const RAIL_T = 23;          // Picatinny base on the receiver and the handguard (teeth top = 29)
  const AIM = 65;             // optical axis / iron-sight line (absolute co-witness, 36 mm over the rail)
  const MUZZLE = 564;

  // ======================================================================== upper receiver (7075 forging)
  const upperSec = [[-14.5, -13, 1], [14.5, -13, 1], [14.5, 11, 2.5], [12.2, 17, 1.5], [10.6, 18.8, 0.5], [10.6, 23.6, 0],
    [-10.6, 23.6, 0], [-10.6, 18.8, 0.5], [-12.2, 17, 1.5], [-14.5, 11, 2.5]];
  const PORT = rrPts(88, 150, -8, 8.5, 2.5);
  let upper = SS(upperSec, 0, 178, { bevel: 0.8, bevelSeg: 2, step: 18 });
  upper = cut(upper, [
    potW(PORT, -11, 1, 40),                                     // ejection port + raceway
    chamW(PORT, 14.5, 1, 0.6),                                  // 0.6 mm chamfer round the port
    cutters.box([145, -12.5, 0], [64.6, 17, 23.4]),             // magazine / feed opening
    cutters.box([22, 20.7, 0], [54, 6.4, 10.8]),                // charging-handle channel
  ]);
  g.add(upper, 'alu');
  g.add(lightRail(0, 178, RAIL_T), 'alu');

  // forward assist: housing yawed out at the rear, forged web blending it into the side wall, ribbed plunger
  const fa = (geo) => xform(geo, { rot: [0, 7, 0], move: [1.5, 7.5, 16.4] });
  g.add(fa(lathe([[0, 0], [0, 7.6], [0.8, 8.6], [36, 8.6], [50, 7], [58, 3.5], [58.5, 0]], { seg: 20 })), 'alu');
  g.add(fa(xform(lathe([[3, 0], [3, 10.4], [4.5, 11.6], [30, 11.6], [46, 8.4], [56, 2], [56.5, 0]], { seg: 16 }), { scale: [1, 1, 0.42] })), 'alu');
  g.add(fa(lathe([[-5.4, 0], [-5.4, 1.6], [-4.9, 2.1], [-5.4, 2.7], [-5.4, 3.9], [-4.9, 4.4], [-5.4, 5], [-5.3, 6.2], [-4.7, 7.3],
    [-3.6, 8], [-1.5, 8.1], [0.6, 8.1], [0.6, 0]], { seg: 18 })), 'steel_dark');
  // brass deflector behind the port
  g.add(PL([[64, 13.8], [90, 13.8], [90, 17, 0.8], [86.5, 21.6, 2], [75, 21, 4], [66, 17.2, 3]], { h: 12, ct: 8.5, bevel: 1 }), 'alu');
  // dust-cover hinge lugs, rod and spring
  for (const s of [82, 156]) g.add(cb([s, -10.6, 15], [6, 5.2, 4], 0.8), 'alu');
  g.add(cyl(78, 160, 1.0, { t: -10.6, w: 15.4, seg: 10 }), 'steel');
  {
    const pts = [];
    for (let i = 0; i <= 72; i++) { const a = (i / 72) * Math.PI * 2 * 6; pts.push([112 + (14 * i) / 72, -10.6 + 1.6 * Math.cos(a), 15.4 + 1.6 * Math.sin(a)]); }
    g.add(sweep(pts, 0.32, { seg: 40, radial: 4 }), 'steel_dark');
  }
  // barrel extension (seen through the port when the bolt is back)
  g.add(tube(152.2, 178, 12.4, 4.6, { seg: 20 }), 'steel');

  // ======================================================================== dust cover (modelled OPEN)
  const DC = [119, -10.6, 15.4];
  const dc = g.part('dustcover', { pivot: DC, extras: { axis: 'z', closeDeg: 140, note: 'modelled open; rotate +140 deg about local Z to close' } });
  dc.add(xform(merge([
    PF([[86.4, -9.4, 2.2], [151.6, -9.4, 2.2], [151.6, 9.6, 2.2], [86.4, 9.6, 2.2]], { w: 1.3, cw: 15.55, bevel: 0.45 }),
    PF([[96, 0.5, 1.2], [142, 0.5, 1.2], [142, 4, 1.2], [96, 4, 1.2]], { w: 1.2, cw: 16.6, bevel: 0.45 }),
    cb([140, 6, 14.4], [5, 3, 1.6], 0.4),
    cyl(86.6, 92.5, 2.1, { t: -10.6, w: 15.4, seg: 12 }),
    cyl(145.5, 151.4, 2.1, { t: -10.6, w: 15.4, seg: 12 }),
  ]), { rot: [0, 0, -140], pivot: DC }), 'steel_dark');

  // ======================================================================== charging handle ('bolt') + carrier
  // The T-handle only moves when charging; the carrier (nested under it, so it rides back with the handle) is the
  // part that reciprocates on every shot.
  const bolt = g.part('bolt', { pivot: [-8, 21, 0], extras: { travel: 0.07 } });
  bolt.add(PL([[-0.6, -8.9, 0.3], [-0.6, 8.9, 0.3], [-3.6, 10.4, 1.4], [-3.6, 22.4, 2], [-6.2, 25.6, 2.6], [-11.6, 24.6, 4],
    [-14.4, 16, 6], [-14.4, -8.9, 0.4]], { h: 6.4, ct: 21, bevel: 0.7 }), 'alu');
  bolt.add(PL([[-1.4, -9.5, 0.3], [-14.4, -9.5, 0.4], [-14.4, -16, 6], [-11.6, -24.6, 4], [-6.2, -25.6, 2.6], [-3.6, -22.4, 2],
    [-3.6, -10.6, 1]], { h: 6.4, ct: 21, bevel: 0.7 }), 'alu');
  for (let k = 0; k < 5; k++) bolt.add(box([-9.5, 24.4, -13 - k * 2.3], [7, 0.7, 1], { r: 0 }), 'alu');
  bolt.add(pinEnd([-5, 24.2, -10.2], 1.1, 't', 0.35), 'steel');
  bolt.add(cb([40, 20.4, 0], [82, 4.6, 9.4], 0.6), 'alu'); // shaft
  const carrier = g.part('carrier', { pivot: [14, 0, 0], parent: 'bolt', extras: { travel: 0.075, cycle: true,
    note: 'bolt carrier + bolt: reciprocates on every shot (travel 75 mm); nested under bolt so the T-handle drags it when charging' } });
  let carrierGeo = lathe([[14, 0], [14, 11.4], [15, 12.3], [117, 12.3], [118, 11.5], [118, 0]], { seg: 18 });
  const notch = [];
  for (let i = 0; i < 6; i++) notch.push(cutters.box([90.5 + i * 2.6, 1, 13], [1.3, 12, 4]));
  notch.push(cutters.box([112, 0, 14.5], [14, 14, 6]));
  carrierGeo = cut(carrierGeo, merge(notch));
  carrier.add(carrierGeo, 'steel_bright');
  carrier.add(lathe([[117.6, 0], [117.6, 8.1], [118.2, 8.6], [121, 8.6], [121, 8.1], [121.8, 8.1], [121.8, 8.6], [123, 8.6], [123, 8.1],
    [123.8, 8.1], [123.8, 8.6], [150.6, 8.6], [151.6, 7.6], [151.6, 0]], { seg: 18 }), 'steel');
  carrier.add(xform(cb([141, 5.2, 8.3], [18, 3, 4.2], 0.5), { rot: [0, 0, -58], pivot: [141, 5.2, 8.3] }), 'steel_dark');
  carrier.add(pinEnd([135, 5.4, 10], 0.9, 'w', 0.4), 'steel');

  // ======================================================================== lower receiver (cast / forged layers)
  // core 24.4 wide; raised 1.3 mm fire-control panel; grip boss; tang sweeping up into the buffer tower; magwell loft
  // standing 2.2 mm proud with a flared, chamfered mouth.
  {
    let core = PF([[-1, -13.6, 0], [178.5, -13.6, 1], [181, -15.6, 1.5], [181, -21.6, 0], [109, -22, 0], [108, -40, 2], [-2, -40, 3],
      [-8.5, -37, 4], [-13.6, -29, 9], [-16.4, -19, 0], [-16.4, -13.6, 0]], { w: 24.4, bevel: 1.0, bevelSeg: 2 });
    core = cut(core, [
      cutters.box([144.9, -45, 0], [64.6, 70, 23.4]), // magazine well
      cutters.box([79, -40, 0], [23, 12, 7.4]),        // trigger slot
    ]);
    g.add(core, 'alu');
    // raised fire-control panel (both sides): pins, selector and rear takedown pin sit on it
    for (const sd of [1, -1]) g.add(PF([[-1, -14.4, 1], [105.5, -14.4, 1], [105.5, -36.6, 3], [46, -37.6, 5], [30, -33.6, 7], [-1, -31.6, 2]], { w: 1.9, cw: 12.55 * sd, bevel: 0.6, bevelSeg: 2 }), 'alu');
    // pistol-grip boss with its rear ledge
    g.add(PF([[-12.4, -31, 4], [40, -31, 1], [40, -40.6, 0.5], [-5, -40.6, 1], [-12.4, -36, 3]], { w: 26.4, bevel: 1.2, bevelSeg: 2 }), 'alu');
    // receiver-extension tower (the tang above runs up into it)
    g.add(lathe([[-16.5, 0], [-16.5, 15.4], [-15.1, 16.8], [-2, 16.8], [-0.6, 15.6], [-0.6, 0]], { seg: 22 }), 'alu');
    // magwell: outer walls 28.8 wide, flaring to 32.8 with a chamfered lip; inner mouth flared 45 deg x 2.8 mm
    g.add(loftT([
      [-13.9, 108.2, 181, 14.4, 1.4], [-58, 107.8, 180, 14.4, 1.4], [-63.4, 107.0, 182.8, 15.6, 2.0], [-68.6, 106.8, 184.6, 16.4, 2.4],
      [-69.5, 107.6, 183.8, 15.6, 1.8],
    ], [
      [-13.9, 112.6, 177.2, 11.7, 1.0], [-58, 112.6, 177.2, 11.7, 1.0], [-63.4, 112.6, 177.2, 11.7, 1.0], [-66.7, 112.6, 177.2, 11.7, 1.0],
      [-69.5, 109.8, 180.0, 14.5, 2.4],
    ]), 'alu');
    // front pivot-pin lug
    g.add(PF([[178, -13.8, 0], [183.6, -13.8, 2], [186.6, -18.2, 3.6], [183.6, -22.6, 2], [178, -22.6, 0]], { w: 12.6, bevel: 0.8 }), 'alu');
  }
  // trigger guard + ears
  g.add(PF([[109, -40.4, 0.5], [109, -48, 3], [101, -62.5, 9], [48, -63.5, 9], [37, -60, 4], [33.5, -54, 1.5], [34.5, -46, 1.5],
    [40, -40.4, 0.5], [44.5, -40.4, 0.5], [44.5, -52, 3], [50, -57.6, 5], [95, -56.6, 5], [101, -49, 3], [101, -40.4, 0.5]],
  { w: 9.6, bevel: 1.4 }), 'alu');
  g.add(PF([[99.5, -39, 0.5], [110, -39, 0.5], [110, -45, 2], [105, -50, 3], [99.5, -48, 2]], { w: 14, bevel: 0.9 }), 'alu');
  g.add(PF([[37.5, -39, 0.5], [48, -39, 0.5], [48, -44, 2], [43, -47.5, 3], [37.5, -45.5, 2]], { w: 14, bevel: 0.9 }), 'alu');
  for (const sd of [1, -1]) {
    const ax = sd > 0 ? 'w' : '-w';
    g.add(rollPin([105, -44.5, 7 * sd], 1.5, ax), 'steel');
    g.add(rollPin([42.5, -43, 7 * sd], 1.5, ax), 'steel');
  }
  // fire-control pins (anti-walk hex heads on the right), takedown / pivot pins
  for (const [s, t] of [[74, -27], [52, -25]]) {
    g.add(hexHead([s, t, 13.5], 3.3, 'w', 1.0), 'steel_dark');
    g.add(pinEnd([s, t, 14.5], 1.5, 'w', 0.5), 'steel');
    g.add(pinEnd([s, t, -13.5], 2.6, '-w', 0.7), 'steel_dark');
  }
  for (const [s, t, r, wf] of [[6, -20.6, 4.2, 13.5], [171, -18.2, 3.8, 14.4]]) {
    g.add(lax([[0, 0], [0, r], [1.1, r], [1.5, r - 0.6], [1.5, 0]], [s, t, -wf], '-w', 16), 'steel');
    g.add(pinEnd([s, t, wf], r * 0.72, 'w', 0.5), 'steel');
  }
  // bolt catch (left) on its boss
  g.add(cb([116.5, -18.3, -14.9], [14, 6, 2.2], 0.6), 'alu');
  g.add(PF([[111.5, -15.6, 2], [121.5, -15.6, 2], [123.5, -25, 1], [127.5, -29, 2], [127.5, -34, 2.5], [109.5, -34, 2.5],
    [109.5, -29, 2], [113, -25, 1]], { w: 2, cw: -16.9, bevel: 0.5 }), 'steel');
  for (let k = 0; k < 5; k++) g.add(box([112 + k * 3.2, -31.5, -18.0], [0.9, 4, 0.5], { r: 0 }), 'steel');
  g.add(pinEnd([117, -19.5, -17.9], 1.4, '-w', 0.4), 'steel_dark');
  // magazine release (right) with its fence
  g.add(lax([[0, 0], [0, 4.7], [2.3, 4.7], [3, 4.1], [3, 0]], [104, -30, 13.4], 'w', 20), 'steel');
  g.add(PF([...arcPts(104, -30, 8.6, 165, 375, 12), ...arcPts(104, -30, 6.6, 375, 165, 12)], { w: 2.6, cw: 14.6, bevel: 0.7 }), 'alu');
  // roll-marks on the left of the magwell (original maker/model, calibre) and the selector markings
  g.add(stamp('SENTRY-4', [171, -26, -14.4], { px: 0.75, side: -1 }), 'steel_bright');
  g.add(stamp('CAL 5.56', [171, -32.5, -14.4], { px: 0.6, side: -1 }), 'steel_bright');
  g.add(stamp(EYE, [143, -26, -14.4], { px: 0.8, side: -1 }), 'steel_bright');
  g.add(stamp('SAFE<', [48.8, -20.4, -13.5], { px: 0.5, side: -1 }), 'steel_bright');
  g.add(stamp('>AUTO', [22.6, -20.4, -13.5], { px: 0.5, side: -1 }), 'steel_bright');
  g.add(stamp('SEMI', [47, -15.6, -13.5], { px: 0.45, side: -1 }), 'steel_bright');

  // ======================================================================== trigger, selector
  const trig = g.part('trigger', { pivot: [74, -27, 0], extras: { axis: 'x', pullDeg: -12 } });
  trig.add(PF([[69.5, -30, 2], [79, -30, 2], [79.5, -41, 0], [77.2, -47, 6], [78.8, -53.6, 1.5], [76.4, -55, 1.2], [72.4, -48, 6],
    [72, -41, 0], [69.5, -36, 2]], { w: 6, bevel: 0.9 }), 'steel');

  const sel = g.part('selector', { pivot: [30, -24, 0], extras: { axis: 'x', safeDeg: -90, autoDeg: 90, note: 'modelled on SEMI (lever up)' } });
  sel.add(PF([...arcPts(30, -24, 6.4, 150, 390, 10), [34.2, -17.5, 1.5], [36.6, -14.4, 2], [23.4, -14.4, 2], [25.8, -17.5, 1.5]],
    { w: 2.2, cw: -14.7, bevel: 0.6 }), 'steel');
  for (let k = 0; k < 4; k++) sel.add(box([26 + k * 2.6, -16.6, -15.9], [0.8, 3, 0.5], { r: 0 }), 'steel');
  sel.add(lax([[0, 0], [0, 3.2], [1.2, 3], [1.4, 0]], [30, -24, -15.8], '-w', 16), 'steel');
  sel.add(PF([...arcPts(30, -24, 5.4, 150, 390, 8), [33.6, -18.6, 1.2], [35.2, -15.6, 1.6], [24.8, -15.6, 1.6], [26.4, -18.6, 1.2]],
    { w: 2, cw: 14.5, bevel: 0.55 }), 'steel');
  sel.add(capScrew([30, -24, 15.5], 2.4, 'w', 1.1), 'steel_dark');

  // ======================================================================== pistol grip (20 deg rake)
  {
    const GRIP = [[38.5, -40.8, 1], [36, -50, 6], [29.5, -74, 24], [20, -101, 20], [10.6, -122.5, 3], [-31.7, -107.1, 3],
      [-26.3, -83.5, 26], [-11.9, -52.6, 8], [-14, -44, 4], [-19.5, -38.5, 3], [-12, -36.2, 3], [-4, -40.8, 1]];
    const PANEL = [[30, -52, 4], [23.8, -76, 15], [15.6, -98.5, 9], [6.8, -112.6, 3], [-22, -102.8, 3], [-20.6, -83, 13], [-9.8, -59, 4],
      [-6.8, -52, 3]];
    let grip = PF(GRIP, { w: 29.5, bevel: 4, bevelSeg: 2, curveSeg: 4 });
    grip = cut(grip, [potW(PANEL, 13.75, 1, 10), potW(PANEL, 13.75, -1, 10), chamW(PANEL, 14.75, 1, 0.6), chamW(PANEL, 14.75, -1, 0.6)]);
    g.add(grip, 'polymer');
    g.add(PF(grow(PANEL, -0.2), { w: 28.3, bevel: 0.5, bevelSeg: 1, curveSeg: 3 }), 'polymer_grip'); // stippled insert, 0.6 mm below the frame
    g.add(PF([[11, -123.2, 0.8], [8.4, -128.8, 3], [-33.9, -113.4, 3], [-32.3, -107.9, 0.8]], { w: 27.5, bevel: 1.8 }), 'polymer');
  }

  // ======================================================================== buffer tube, end plate, castle nut
  g.add(lathe([[-182, 0], [-182, 12.6], [-181, 14.1], [-179.6, 14.6], [-92, 14.6], [-73, 14.6], [-54, 14.6], [-35, 14.6], [-16, 14.6], [-16, 0]], { seg: 24 }), 'alu');
  {
    const rib = SS([[-4.3, -18, 0.8], [4.3, -18, 0.8], [4.3, -12, 0], [-4.3, -12, 0]], -179, -29, { bevel: 0.6, step: 25 });
    const holes = [];
    for (let k = 0; k < 4; k++) holes.push(lax([[0, 0], [0, 2.2], [16, 2.2], [16, 0]], [-36 - k * 16, -26, 0], 't', 10));
    g.add(cut(rib, merge(holes)), 'alu');
  }
  g.add(lathe([[-19.8, 0], [-19.8, 16.8], [-19.2, 17.4], [-17.2, 17.4], [-16.8, 16.8], [-16.8, 0]], { seg: 22 }), 'steel');
  g.add(cb([-18.3, -21.5, 0], [3, 9, 11], 0.7), 'steel');
  g.add(cb([-18.3, -1, -19], [3, 12, 8], 0.7), 'steel');
  g.add(cb([-21.5, -1, -21.5], [6.5, 11, 6], 1.2), 'steel');
  g.add(lax([[0, 0], [0, 4.4], [0.8, 4.2], [0.8, 2.8], [0.2, 2.7], [0.2, 0]], [-21.5, -1, -24.5], '-w', 16), 'steel_dark');
  {
    const nut = lathe([[-28.2, 14.65], [-28.2, 16.2], [-27.6, 16.8], [-20.4, 16.8], [-19.8, 16.2], [-19.8, 14.65], [-28.2, 14.65]], { seg: 16 });
    const nn = [];
    for (let k = 0; k < 8; k++) nn.push(xform(cutters.box([-26.6, 15.8, 0], [3.6, 3, 3.4]), { rot: [0, 0, k * 45 + 22.5] }));
    g.add(cut(nut, merge(nn)), 'steel_dark');
  }

  // ======================================================================== CTR-style stock (extended)
  // tube housing with 6 mm rounds; skeletonised wedge: 24 mm frame round deep side pockets (10.5 mm) with a 3 mm centre
  // web and two ribs; stepped lower edge; open sling loop at the toe; ribbed rubber pad behind a 1.2 mm seam.
  g.add(SS([[-12, -17.6, 5], [12, -17.6, 5], [18.6, -8.5, 6], [18.6, 10, 6], [12.5, 20.6, 6], [-12.5, 20.6, 6], [-18.6, 10, 6],
    [-18.6, -8.5, 6]], -256, -92, { bevel: 4, bevelSeg: 2, step: 42 }), 'polymer_tan');
  {
    const POCKET = [[-165, -24, 4], [-246, -24, 5], [-246, -55, 5], [-211.5, -55, 5]];
    const c = [-240, -72.4], d = [-0.832, -0.555], n = [0.555, -0.832], L = 10.5, rr = 4.2;
    const SLING = [[c[0] - d[0] * L - n[0] * rr, c[1] - d[1] * L - n[1] * rr, rr], [c[0] + d[0] * L - n[0] * rr, c[1] + d[1] * L - n[1] * rr, rr],
      [c[0] + d[0] * L + n[0] * rr, c[1] + d[1] * L + n[1] * rr, rr], [c[0] - d[0] * L + n[0] * rr, c[1] - d[1] * L + n[1] * rr, rr]];
    g.add(PF([[-96, -8, 2], [-96, -17, 2], [-150, -21.5, 10], [-172, -36.1, 2], [-174.5, -39.6, 2], [-244, -86, 12], [-257, -91.5, 3],
      [-258.4, 24, 3], [-247, 27.5, 6], [-200, 21.5, 30], [-130, 16, 6]], { w: 24, bevel: 2.4, bevelSeg: 2, curveSeg: 3, holes: [POCKET, SLING] }), 'polymer_tan');
    g.add(PF(grow(POCKET, 1.5), { w: 3, bevel: 0.5, bevelSeg: 1 }), 'polymer_tan');                 // centre web
    for (const [a, b] of [[[-196, -22.5], [-186, -39.3]], [[-232, -22.5], [-210, -55]]]) {
      g.add(PF(barPts(a, b, 3.2, 1), { w: 19, bevel: 0.8, bevelSeg: 2, curveSeg: 2 }), 'polymer_tan');  // ribs, 2.5 mm under the frame
    }
  }
  {
    // rubber butt pad: horizontal ribs on the face (serrated rear edge), seam gap 1.2 mm to the stock
    const rear = [];
    for (let t = 25; t > -84; t -= 7.6) rear.push([-276, t], [-276, t - 5], [-274.7, t - 5.6], [-274.7, t - 7.1]);
    g.add(PF([[-259.6, 30.5, 3], [-266, 31.5, 6], [-276, 29, 3], ...rear, [-276, -93, 3], [-266, -97, 6], [-258.2, -93.5, 3]],
      { w: 38, bevel: 3.5, bevelSeg: 2, curveSeg: 3 }), 'rubber');
    g.add(PF([[-256, 22], [-260.6, 22], [-260.6, -86], [-256, -86]], { w: 16, bevel: 0.5, bevelSeg: 1 }), 'polymer_tan'); // hidden pad stem
  }
  // adjustment latch under the tube, friction-lock lever on the left of the housing
  g.add(PF([[-99, -17, 1], [-146, -19.8, 2], [-146, -24.6, 2], [-108, -25.4, 2], [-99.5, -23.5, 2]], { w: 10, bevel: 1.2 }), 'polymer');
  for (let k = 0; k < 4; k++) g.add(box([-102 - k * 2.6, -25.6, 0], [1, 1.2, 8.6], { r: 0 }), 'polymer');
  g.add(PF([[-103, -2.6, 2], [-133, -2.6, 2], [-138, -8, 3], [-133, -13.4, 2], [-103, -13.4, 2]], { w: 3, cw: -19.4, bevel: 1, bevelSeg: 2 }), 'polymer_tan');
  g.add(PF([[-108, -5.2, 1.2], [-128, -6.2, 1.5], [-131, -9.6, 1.5], [-108, -10.8, 1.2]], { w: 1.6, cw: -21.5, bevel: 0.5 }), 'polymer');
  g.add(pinEnd([-112, -8, -22.3], 1.4, '-w', 0.4), 'steel_dark');
  for (const sd of [1, -1]) {
    g.add(pinEnd([-140, -22.4, 5 * sd], 1.3, sd > 0 ? 'w' : '-w', 0.4), 'steel');
    g.add(lax([[0, 0], [0, 6.2], [1.6, 6.2], [2.2, 5.6], [2.2, 3.9], [1.2, 3.7], [1.2, 0]], [-238, 1, 18.4 * sd], sd > 0 ? 'w' : '-w', 14), 'steel');
  }

  // ======================================================================== free-float M-LOK handguard
  const HG0 = 180.5, HG1 = 468;
  const hgO = [[-12, -22, 2.5], [12, -22, 2.5], [20, -14, 2.5], [20, 12, 2.5], [13.6, 20.9, 1.5], [10.6, 23.6, 0], [-10.6, 23.6, 0],
    [-13.6, 20.9, 1.5], [-20, 12, 2.5], [-20, -14, 2.5]];
  const hgI = [[-10.6, -19.6, 1.5], [10.6, -19.6, 1.5], [17.6, -12.8, 1.5], [17.6, 11, 1.5], [12.6, 18.3, 1], [-12.6, 18.3, 1],
    [-17.6, 11, 1.5], [-17.6, -12.8, 1.5]];
  {
    // No CSG: the octagon tube is split into 5 plain extrusions (corners + top) and 5 plates (both sides and the bottom
    // with M-LOK slots, the upper bevels with vents) whose openings are built with a 0.5 mm 45 deg chamfer. Plates and
    // extrusions meet flush on the flats, so the joints carry no groove. A short bevelled ring closes the rear end.
    const TH = 2.4, HS0 = 182.5;
    const Oc = polyPts(hgO), Ic = polyPts(hgI);
    const e45 = [-0.5838, 0.8119], n45 = [0.8119, 0.5838], at45 = (u) => [20 + e45[0] * u, 12 + e45[1] * u], mw = ([w, t]) => [-w, t];
    // flats in CCW order round the outer contour: outer start / end points and outward normal
    const faces = [
      { a: [-8.8, -22], b: [8.8, -22], n: [0, -1], kind: 'slot', y0: 5.2 },
      { a: [20, -11], b: [20, 9.2], n: [1, 0], kind: 'slot', y0: 6.4 },
      { a: at45(3.3), b: at45(8.3), n: n45, kind: 'vent' },
      { a: mw(at45(8.3)), b: mw(at45(3.3)), n: [-n45[0], n45[1]], kind: 'vent' },
      { a: [-20, 9.2], b: [-20, -11], n: [-1, 0], kind: 'slot', y0: 6.6 },
    ];
    for (const f of faces) {
      f.ai = locate(Ic, [f.a[0] - TH * f.n[0], f.a[1] - TH * f.n[1]]).q;
      f.bi = locate(Ic, [f.b[0] - TH * f.n[0], f.b[1] - TH * f.n[1]]).q;
    }
    for (let k = 0; k < faces.length; k++) {
      const f = faces[k], f2 = faces[(k + 1) % faces.length];
      g.add(SS([...chain(Oc, f.b, f2.a), ...chain(Ic, f.bi, f2.ai).reverse()], HS0, HG1, { bevel: 0, step: 96 }), 'alu');
      const len = Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]), e = [(f.b[0] - f.a[0]) / len, (f.b[1] - f.a[1]) / len];
      const place = (x, y, z) => V(x, f.a[1] + e[1] * y - f.n[1] * (TH - z), f.a[0] + e[0] * y - f.n[0] * (TH - z));
      const holes = [];
      if (f.kind === 'slot') for (const a of [205, 246, 287, 328, 369, 410]) holes.push(rrPts(a, a + 32, f.y0, f.y0 + 7.2, 3.6)); // M-LOK 32 x 7.2
      else for (const a of [212, 294, 376]) holes.push(rrPts(a, a + 59, len / 2 - 1.7, len / 2 + 1.7, 1.7));             // 59 x 3.4 vents
      g.add(plate(rrPts(HS0, HG1, 0, len, 0), holes, TH, f.kind === 'slot' ? 0.5 : 0.4, place, 2), 'alu');
    }
    g.add(SC(hgO, HG0, HS0 + 0.5, { bevel: 0.8, bevelSeg: 1, curveSeg: 2, holes: [hgI] }), 'alu');
  }
  // chamfered front end cap with a relief ring round the barrel
  g.add(SC(grow(hgO, -0.7), HG1 - 0.5, HG1 + 3.2, { bevel: 1.1, bevelSeg: 1, holes: [circle(0, 0, 13.2)] }), 'alu');
  g.add(lathe([[HG1 - 3, 11.6], [HG1 - 3, 13.3], [HG1 + 3.4, 13.3], [HG1 + 3.9, 12.8], [HG1 + 3.9, 11.6], [HG1 - 3, 11.6]], { seg: 22 }), 'steel_dark');
  g.add(lightRail(HG0, HG1, RAIL_T), 'alu');
  for (const sd of [1, -1]) {
    g.add(cb([178.6, 21, 11.6 * sd], [6, 4, 2], 0.5), 'alu'); // anti-rotation tabs
    for (const s of [188, 200]) g.add(xform(capScrew([0, 0, 0], 2.3, sd > 0 ? 'w' : '-w', 1.3), { rot: [0, 0, -45 * sd], move: [s, -18, 16.1 * sd] }), 'steel_dark');
    g.add(lax([[0, 0], [0, 6.4], [1.6, 6.4], [2.3, 5.7], [2.3, 3.8], [1.0, 3.6], [1.0, 0]], [455, -1, 19.8 * sd], sd > 0 ? 'w' : '-w', 14), 'steel');
  }
  // hand stop on the front bottom slot
  g.add(PF([[416, -21.6, 0], [446, -21.6, 0], [446, -25.5, 2], [437, -37, 4], [430.5, -37.5, 3], [420, -27, 5]], { w: 15, bevel: 3, bevelSeg: 3 }), 'polymer_tan');
  // barrel nut
  g.add(lathe([[176, 9.8], [176, 15.4], [176.6, 16], [196, 16], [196.6, 15.4], [196.6, 9.8], [176, 9.8]], { seg: 20 }), 'steel_dark');

  // ======================================================================== barrel, gas system, A2 birdcage
  g.add(lathe([[178, 2.85], [178, 9.2], [178.6, 9.8], [330, 9.8], [332, 8.9], [338, 8.1], [503.4, 8.1], [503.6, 7.7], [519.6, 7.7],
    [520, 7.3], [520, 3.6], [519.4, 2.85], [178, 2.85]], { seg: 24 }), 'steel_dark');
  g.add(lathe([[322, 8.0], [322, 13.6], [322.8, 14.4], [340, 14.4], [340.8, 13.6], [340.8, 8.0], [322, 8.0]], { seg: 20 }), 'steel_dark');
  g.add(cb([331, 14.6, 0], [17, 5, 10], 1.2), 'steel_dark'); // gas block top at t 17.1: 1.2 mm under the rail
  for (const s of [326, 336]) g.add(capScrew([s, -14.2, 0], 2, '-t', 1), 'steel');
  g.add(cyl(176, 326, 2.4, { t: 15.4, seg: 10 }), 'steel');
  g.add(lathe([[503.6, 7.8], [503.6, 9.4], [504, 9.8], [505.4, 9.8], [505.8, 9.4], [505.8, 7.8], [503.6, 7.8]], { seg: 24 }), 'steel');
  {
    const fh = lathe([[506, 7.8], [506, 9.4], [506.6, 10.2], [515.6, 10.2], [517.4, 11.1], [561.6, 11.1], [563, 10.5], [564, 9.6], [564, 5.2],
      [563.4, 4.6], [521, 4.6], [521, 7.8], [506, 7.8]], { seg: 16 });
    const fc = [];
    for (const a of [0, 60, 120, -60, -120]) {
      fc.push(xform(PL(rrPts(527, 554, -1.65, 1.65, 1.65), { h: 10, ct: 9, bevel: 0, curveSeg: 2 }), { rot: [0, 0, -a] }));
    }
    fc.push(cutters.box([511, 0, 12.4], [8.6, 30, 6.4]), cutters.box([511, 0, -12.4], [8.6, 30, 6.4]));
    g.add(cut(fh, merge(fc)), 'steel_dark');
  }

  // ======================================================================== folding BUIS
  const buisBase = [[-11.8, 23.8, 0.6], [11.8, 23.8, 0.6], [11.8, 31, 1.2], [9.2, 33.4, 1.4], [-9.2, 33.4, 1.4], [-11.8, 31, 1.2]];
  const buisCommon = (s0, s1, hingeS, knobS) => {
    g.add(SC(buisBase, s0, s1, { bevel: 0.8 }), 'alu');
    for (const sd of [1, -1]) g.add(cb([hingeS, 35.5, 8.6 * sd], [8, 6, 2.6], 0.8), 'alu');
    g.add(lax([[0, 0], [0, 1.3], [20.4, 1.3], [20.4, 0]], [hingeS, 35.5, -10.2], 'w', 12), 'steel');
    g.add(PF(gearPts(knobS, 26.8, 5.4, 4.7, 12), { w: 4.4, cw: 14.2, bevel: 0.5, bevelSeg: 1 }), 'alu');
    g.add(capScrew([knobS, 26.8, 16.4], 1.6, 'w', 0.6), 'steel');
    g.add(hexHead([knobS, 26.8, -11.8], 3.6, '-w', 1.8), 'steel_dark');
  };
  // rear
  buisCommon(4, 32, 8, 19);
  const leaf = g.part('leaf', { pivot: [8, 35.5, 0], extras: { flip: { axis: 'x', deg: 90 }, note: 'rear BUIS folded forward; +90 deg about local X stands it up' } });
  leaf.add(PL([[5.4, -6.2, 1], [33.5, -6.2, 1], [33.5, -8.6, 1.5], [42.2, -8.6, 2.5], [42.2, 8.6, 2.5], [33.5, 8.6, 1.5], [33.5, 6.2, 1],
    [5.4, 6.2, 1]], { h: 3.4, ct: 35.5, bevel: 0.6, holes: [circle(37.6, 0, 1.6)] }), 'alu');
  leaf.add(lax([[0, 1.6], [0, 4], [0.6, 4.4], [5.4, 4.4], [6, 4], [6, 1.6], [0, 1.6]], [37.6, 33, 0], 't', 18), 'alu');
  leaf.add(PF(gearPts(37.6, 35.5, 3.9, 3.4, 11), { w: 3.6, cw: 10.4, bevel: 0.4, bevelSeg: 1 }), 'alu');
  // front
  buisCommon(440, 466, 462, 449);
  g.add(lax([[0, 0], [0, 2.2], [1.4, 2.2], [1.8, 1.8], [1.8, 0]], [457, 29.5, 11.8], 'w', 14), 'steel');
  const leafF = g.part('leaf_front', { pivot: [462, 35.5, 0], extras: { flip: { axis: 'x', deg: -90 }, note: 'front BUIS folded back; -90 deg about local X stands it up' } });
  leafF.add(PL([[464.6, -6.2, 1], [464.6, 6.2, 1], [440.5, 6.2, 1], [438, 8.6, 1.5], [429.6, 8.6, 2.5], [429.6, -8.6, 2.5], [438, -8.6, 1.5],
    [440.5, -6.2, 1]], { h: 3.4, ct: 35.5, bevel: 0.6, holes: [[[431.4, -5.6, 1.2], [437.6, -5.6, 1.2], [437.6, 5.6, 1.2], [431.4, 5.6, 1.2]]] }), 'alu');
  leafF.add(cb([435.2, 35.5, 0], [6.4, 1.6, 1.8], 0.3), 'steel');

  // ======================================================================== tube red dot on a QD riser
  // lenses sit ~2 mm behind 45 deg lips, so the bore wall shows round them
  g.add(lathe([[103, 12.4], [103, 13.1], [103.8, 13.9], [105.6, 13.9], [105.6, 13.3], [106.8, 13.3],
    [106.8, 13.9], [109.8, 13.9], [110.6, 14.7], [111.2, 15], [150, 15], [150.8, 15.8], [163.4, 15.8], [164.6, 15.2],
    [165, 14.4], [165, 13.8], [163.9, 12.7], [158.6, 12.7], [158.6, 11.4], [104.2, 11.4], [103, 12.4]], { t: AIM, seg: 20 }), 'alu');
  g.add(cyl(106.2, 106.9, 11.45, { t: AIM, seg: 18, b: 0.3 }), 'lens');
  g.add(cyl(156.4, 157.1, 11.45, { t: AIM, seg: 18, b: 0.3 }), 'lens');
  g.add(sphere([155.9, AIM, 0], 0.42, { seg: 8 }), 'reticle_red');
  // turrets (elevation top, windage right) and brightness dial (left)
  g.add(box([131, AIM + 13.2, 0], [24, 8, 17], { seg: 1, r: 3 }), 'alu');
  g.add(lax([[0, 0], [0, 7.2], [1.6, 7.2], [1.6, 0]], [131, AIM + 17, 0], 't', 22), 'alu');
  g.add(PL(gearPts(131, 0, 7.6, 7.0, 15), { h: 6.4, ct: AIM + 21.6, bevel: 0.35, bevelSeg: 1 }), 'alu');
  g.add(box([131, AIM, 13.2], [24, 17, 8], { seg: 1, r: 3 }), 'alu');
  g.add(lax([[0, 0], [0, 7.2], [1.6, 7.2], [1.6, 0]], [131, AIM, 17], 'w', 22), 'alu');
  g.add(PF(gearPts(131, AIM, 7.6, 7.0, 15), { w: 6.4, cw: 21.8, bevel: 0.35, bevelSeg: 1 }), 'alu');
  g.add(box([146, AIM, -12.8], [18, 16, 8], { seg: 1, r: 3 }), 'alu');
  g.add(PF(gearPts(146, AIM, 8.6, 7.8, 16), { w: 5.6, cw: -19.4, bevel: 0.5, bevelSeg: 1 }), 'alu');
  g.add(lax([[0, 0], [0, 4.5], [0.8, 4.2], [0.8, 0]], [146, AIM, -22.2], '-w', 18), 'steel_dark');
  // mount saddle, riser with lightening windows, QD clamp
  g.add(SC([[-11, 46.4, 1], [11, 46.4, 1], [11, 52, 1.5], [8.4, 56, 2], [-8.4, 56, 2], [-11, 52, 1.5]], 108, 160, { bevel: 0.8 }), 'alu');
  for (const s of [114, 154]) for (const sd of [1, -1]) g.add(capScrew([s, 49.4, 11 * sd], 1.9, sd > 0 ? 'w' : '-w', 1, 10), 'steel_dark');
  g.add(stamp('SRD-1', [133, 51.3, -11], { px: 0.45, side: -1 }), 'steel_bright');
  g.add(PF([[104, 23.8, 1], [164, 23.8, 1], [164, 31, 1], [158, 46.6, 2.5], [110, 46.6, 2.5], [104, 31, 1]], {
    w: 24, bevel: 0.9, holes: [rrPts(115, 132, 33.6, 42.6, 2.5), rrPts(136, 153, 33.6, 42.6, 2.5)],
  }), 'alu');
  g.add(cb([134, 27.6, 13.4], [30, 7.4, 2.8], 0.7), 'alu');
  g.add(PF([[146.5, 24.2, 3.2], [150, 27.6, 3.2], [146.5, 31, 3.2], [118, 31.4, 2], [114, 29.6, 2], [118, 27, 2.5]], { w: 2.4, cw: 16, bevel: 0.6 }), 'steel_dark');
  for (let k = 0; k < 3; k++) g.add(box([116.5 + k * 2.2, 29.2, 17.3], [0.8, 3, 0.5], { r: 0 }), 'steel_dark');
  g.add(capScrew([146.5, 27.6, 17.2], 2.6, 'w', 1.2), 'steel');
  for (const s of [126, 142]) g.add(hexHead([s, 27.6, -12], 3.4, '-w', 1.8), 'steel_dark');

  // ======================================================================== 30-round polymer magazine (FDE)
  const mag = g.part('mag', { pivot: [145, -13, 0], extras: { drop: true } });
  {
    const R = 260, MC = 145.3, HD = 31.2;
    /** point at distance d down the curved centre line, offset `side` x half-depth (front +) */
    const P = (d, side) => {
      let s = MC, t = -13 - d, ph = 0;
      if (d > 69) { ph = (d - 69) / R; s = MC + R * (1 - Math.cos(ph)); t = -82 - R * Math.sin(ph); }
      return [s + side * HD * Math.cos(ph), t + side * HD * Math.sin(ph), ph];
    };
    const ds = [6, 69, 82, 96, 110, 124, 138, 152, 167];
    const front = ds.map((d) => { const [s, t] = P(d, 1); return [s, t, d === 167 ? 2 : 0]; });
    const rear = ds.slice().reverse().filter((d) => d > 6).map((d) => { const [s, t] = P(d, -1); return [s, t, d === 167 ? 2 : 0]; });
    let body = PF([[114.1, -15.5, 1.5], [117.5, -13, 1], [150, -13, 1], [155.5, -19, 1], ...front, ...rear], { w: 22.6, bevel: 2.6, bevelSeg: 3 });
    body = cut(body, [cutters.box([136, -11.5, 0], [34, 5, 9.2])]);
    mag.add(body, 'polymer_tan');
    // local frame at distance d: across (front +) and along (down +)
    const at = (d, a, b) => { const [cs, ct, ph] = P(d, 0); return [cs + Math.cos(ph) * a + Math.sin(ph) * b, ct + Math.sin(ph) * a - Math.cos(ph) * b]; };
    // horizontal grip ribs, 1.2 mm proud on both sides
    for (let k = 0; k < 6; k++) {
      const d = 110 + k * 8.2;
      mag.add(PF([[...at(d, -24.5, -1.1), 1], [...at(d, 24.5, -1.1), 1], [...at(d, 24.5, 1.1), 1], [...at(d, -24.5, 1.1), 1]],
        { w: 25, bevel: 0.6, bevelSeg: 1, curveSeg: 1 }), 'polymer_tan');
    }
    // raised marking panel on the upper body, calibre / capacity moulded on it
    mag.add(PF([[...at(74, -22, 0), 2], [...at(74, 18, 0), 2], [...at(97, 18, 0), 2], [...at(97, -22, 0), 2]], { w: 23.6, bevel: 0.4, bevelSeg: 1 }), 'polymer_tan');
    { const [s, t] = at(80, 12, 0); mag.add(stamp('5.56 30', [s, t, -11.82], { px: 0.8, side: -1, h: 0.24 }), 'paint_white'); } // paint-pen marking
    // floor plate: 1.6 mm lip all round, front tab, 0.6 mm seam to the body
    mag.add(PF([[...at(167.6, -HD - 1.6, 0), 1], [...at(167.6, HD + 3.6, 0), 1.5], [...at(167.6, HD + 3.6, 2.6), 1.5],
      [...at(167.6, HD + 1.6, 4.4), 2], [...at(167.6, HD, 8.2), 3], [...at(167.6, -HD - 0.4, 8.2), 3], [...at(167.6, -HD - 1.6, 5.4), 2]],
    { w: 25.8, bevel: 1.6, bevelSeg: 2 }), 'polymer_tan');
    mag.add(PF([[...at(165, -HD + 3, 0), 0], [...at(165, HD - 3, 0), 0], [...at(165, HD - 3, 3.4), 0], [...at(165, -HD + 3, 3.4), 0]],
      { w: 17, bevel: 0.3, bevelSeg: 1 }), 'polymer_tan'); // hidden stem bridging the seam
    // cartridges in the feed lips
    for (const [t, w] of [[-14.6, 1.6], [-18.4, -2.8]]) {
      mag.add(lathe([[118.5, 0], [118.5, 4.5], [119.2, 4.7], [119.8, 4.7], [120.3, 4], [121.5, 4], [122.1, 4.75], [155, 4.55], [157.6, 3.1],
        [163.5, 3.1], [163.5, 0]], { t, w, seg: 12 }), 'brass');
      mag.add(lathe([[163.4, 0], [163.4, 2.86], [168, 2.86], [171.5, 2.3], [174.2, 1.2], [175.4, 0.3], [175.6, 0]], { t, w, seg: 12 }), 'copper');
    }
  }

  // ======================================================================== sockets & meta
  g.socket('muzzle', [MUZZLE, 0, 0]);
  g.socket('eject', [119, 2, 15], { dir: [0.35, 0.25, 1] });
  g.socket('grip_r', [1, -80, 0], { rot: [0, 0, -20] });
  g.socket('grip_l', [395, -27, -3]);
  g.socket('magwell', [150, -78, 0]);
  g.socket('charge', [-8, 21, 0]);
  g.socket('sight_rear', [8, AIM, 0]);
  g.socket('sight_front', [462, AIM + 0.5, 0]);
  g.socket('optic', [105.5, AIM, 0], { type: 'reddot', zoom: 1.3 });
  g.meta({
    grip: 'rifle', support: 'handguard', reload: 'mag', chargeSide: 'rear',
    notes: 'Rear T-handle (bolt) pulls straight back only when charging (bolt.travel 70 mm); it does NOT reciprocate on fire. '
      + 'The carrier is its own part (carrier, nested under bolt, extras.travel 75 mm, extras.cycle) and should cycle on every shot '
      + '(engine: arsenal.js only cycles "bolt" for chargeSide right/left). Dust cover is modelled OPEN (node dustcover: rotate '
      + '+140 deg about local Z to close). BUIS are folded (leaf / leaf_front: extras.flip). Selector modelled on SEMI (lever up). '
      + 'Lens meshes (mat lens) should be hidden or see-through while aiming; the reticle dot sits on the optical axis just behind the objective lens.',
  });
  g.build = (opts = {}) => {
    if (opts.bake === false) return Gun.prototype.build.call(g, opts);
    const root = Gun.prototype.build.call(g, { ...opts, bake: false });
    bakeRoot(root, opts.tessellate ?? 12);
    postBake(root);
    return root;
  };
  return g;
}
