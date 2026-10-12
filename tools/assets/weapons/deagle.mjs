// 沙隼 Sandhawk .50 — gas-operated heavy pistol in the Mark XIX .50 calibre pattern.
// Side view, mm: s forward from the rear face of the slide, t up from the bore axis, w right (ejection side).
// Real reference: overall 277 (tang -13 .. muzzle 264), barrel 152 (breech face s = 112), height 149
// (rear sight 30.8 .. magazine floor -118), width 32 (33 over the safety hubs), 7-round single-stack magazine.
//
// Kit note: gunkit mirrorW() negates normal.x by hand after g.scale(-1, 1, 1), but BufferGeometry.applyMatrix4
// already mirrors the normals, so every mirrorW copy ends up with inverted normals. This file never uses it:
// every left-side part is built directly on its own side (negative cw / w).
import * as THREE from 'three';
import { Gun, DEG, V, profile, section, lathe, cyl, tube, box, rail, screw, cut, intersect, cutters, merge, xform } from '../lib/gunkit.mjs';
import { bakeMeshes } from '../lib/bake.mjs';
import { MeshBVH } from 'three-mesh-bvh';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ------------------------------------------------------------------------------------------ helpers

const RAKE = 18 * DEG;                       // grip rake back from vertical
const P0 = [54, -14];                        // top-centre of the magazine (mag pivot)
const DU = [-Math.sin(RAKE), -Math.cos(RAKE)]; // down the grip axis
const DV = [Math.cos(RAKE), -Math.sin(RAKE)];  // forward, across the grip
/** Grip-local coordinates (u down the grip axis from the mag top, v forward) -> [s, t, r?]. */
const G = (u, v, r) => {
  const p = [P0[0] + u * DU[0] + v * DV[0], P0[1] + u * DU[1] + v * DV[1]];
  return r === undefined ? p : [p[0], p[1], r];
};
/** Inverse of G: [s, t] -> [u, v]. */
const GI = (s, t) => { const ds = s - P0[0], dt = t - P0[1]; return [ds * DU[0] + dt * DU[1], ds * DV[0] + dt * DV[1]]; };
/** u where the grip line v = f(u) crosses the horizontal t = T (bisection, t decreases with u). */
function uAtT(f, T, lo = -30, hi = 130) {
  for (let k = 0; k < 60; k++) {
    const m = (lo + hi) / 2;
    if (G(m, f(m))[1] > T) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}
/** Samples a quadratic Bezier a -> b with control c as [s, t] points (both ends included). */
function qPts(a, c, b, n = 6) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n, m = 1 - k;
    out.push([m * m * a[0] + 2 * m * k * c[0] + k * k * b[0], m * m * a[1] + 2 * m * k * c[1] + k * k * b[1]]);
  }
  return out;
}
const lerp2 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
const along = (a, b, d) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]); return lerp2(a, b, d / l); };

/** Box cutter along an arbitrary side-view segment (engraving strokes, grooves). */
function strokeBox(a, b, width, w, depth) {
  const ds = b[0] - a[0], dt = b[1] - a[1];
  const len = Math.hypot(ds, dt) + width;
  const ang = Math.atan2(dt, ds) / DEG;
  return box([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, w], [len, width, depth * 2], { r: 0, rot: [ang, 0, 0] });
}

// Minimal stroke font (4 x 6 cell) for the roll-engraved markings.
const FONT = {
  A: [[[0, 0], [0, 4.2], [1.8, 6], [2.2, 6], [4, 4.2], [4, 0]], [[0, 2.8], [4, 2.8]]],
  C: [[[4, 6], [0.8, 6], [0, 5.2], [0, 0.8], [0.8, 0], [4, 0]]],
  D: [[[0, 0], [0, 6], [2.8, 6], [4, 4.8], [4, 1.2], [2.8, 0], [0, 0]]],
  E: [[[4, 6], [0, 6], [0, 0], [4, 0]], [[0, 3], [3, 3]]],
  F: [[[4, 6], [0, 6], [0, 0]], [[0, 3], [3, 3]]],
  H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  K: [[[0, 0], [0, 6]], [[4, 6], [0.4, 2.8]], [[1.4, 3.6], [4, 0]]],
  M: [[[0, 0], [0, 6], [2, 3], [4, 6], [4, 0]]],
  N: [[[0, 0], [0, 6], [4, 0], [4, 6]]],
  O: [[[0.8, 0], [0, 0.8], [0, 5.2], [0.8, 6], [3.2, 6], [4, 5.2], [4, 0.8], [3.2, 0], [0.8, 0]]],
  R: [[[0, 0], [0, 6], [3.2, 6], [4, 5.2], [4, 3.8], [3.2, 3], [0, 3]], [[1.8, 3], [4, 0]]],
  S: [[[4, 6], [0.8, 6], [0, 5.2], [0, 3.8], [0.8, 3], [3.2, 3], [4, 2.2], [4, 0.8], [3.2, 0], [0, 0]]],
  W: [[[0, 6], [0.8, 0], [2, 3.6], [3.2, 0], [4, 6]]],
  Y: [[[0, 6], [2, 3], [4, 6]], [[2, 3], [2, 0]]],
  0: [[[0.8, 0], [0, 0.8], [0, 5.2], [0.8, 6], [3.2, 6], [4, 5.2], [4, 0.8], [3.2, 0], [0.8, 0]]],
  5: [[[4, 6], [0, 6], [0, 3.4], [3, 3.4], [4, 2.6], [4, 0.8], [3.2, 0], [0, 0]]],
  '.': [[[1.6, 0], [2.4, 0]]],
};
/**
 * Roll-mark lettering for `str` on a vertical face at w, centred on [sc, tc], reading left-to-right as seen
 * from that side; h = cap height (mm). Built as blackened inlay strokes standing 0.08 mm proud of the face
 * (CSG engraving multiplied the triangle count of the barrel by 10).
 */
function inlay(str, sc, tc, h, w, { stroke = 0.6, proud = 0.08, sink = 0.3 } = {}) {
  const k = h / 6, adv = 5.6 * k, space = 3.6 * k;
  let width = 0;
  for (const ch of str) width += ch === ' ' ? space : adv;
  width -= 1.6 * k;
  const dir = w >= 0 ? 1 : -1;            // +s on the right side, -s on the left
  const cw = w + dir * (proud - sink) / 2, th = proud + sink;
  let x = -width / 2;
  const out = [];
  for (const ch of str) {
    if (ch === ' ') { x += space; continue; }
    for (const line of FONT[ch] || []) {
      for (let i = 0; i + 1 < line.length; i++) {
        const P = (p) => [sc + dir * (x + p[0] * k), tc - h / 2 + p[1] * k];
        out.push(strokeBox(P(line[i]), P(line[i + 1]), stroke, cw, th / 2));
      }
    }
    x += adv;
  }
  return merge(out);
}

/** Subtracts cutter groups: each entry is a geometry or an array of non-overlapping geometries (merged into one brush). */
function cutG(label, geo, groups) {
  const t0 = Date.now();
  const list = groups.map((gr) => (Array.isArray(gr) ? merge(gr) : gr));
  const out = cut(geo, list);
  if (process.env.DEAGLE_TIME) console.log(`  cut ${label}: ${list.length} brushes, ${Date.now() - t0} ms, ${out.attributes.position.count / 3} tris`);
  return out;
}

/** V-groove cutter (90 deg) on a vertical face at w: centre [s, t], groove length along t = len, depth d. */
function vGroove(s, t, len, w, d, lean = 0) {
  const a = d * Math.SQRT2;             // box edge so the half diagonal equals the groove depth
  const cw = w + Math.sign(w) * (a / Math.SQRT2 - d);
  return box([s, t, cw], [a, len, a], { r: 0, rot: [lean, 45, 0] });
}

/** Rotates a list of [s, t] points by deg about [s, t] pivot (positive = top goes rearward). */
function rotST(pts, pivot, deg) {
  const c = Math.cos(deg * DEG), sn = Math.sin(deg * DEG);
  return pts.map(([s, t, r]) => {
    const ds = s - pivot[0], dt = t - pivot[1];
    const p = [pivot[0] + ds * c - dt * sn, pivot[1] + ds * sn + dt * c];
    return r === undefined ? p : [...p, r];
  });
}

/**
 * Diamond checkering field on a flat side face: truncated pyramids on a centred rectangular lattice in
 * grip-local (u, v), kept only where the whole diamond fits inside `inside(u, v)`. Bases sit at |w| = wBase,
 * tops (scaled by `top`) at |w| = wTop. Built straight on the requested side (flat normals, outward winding).
 */
function checkerField({ side, inside, u0, u1, v0, v1, hu, hv, wBase, wTop, top = 0.22 }) {
  const pos = [], nor = [];
  const P = (u, v, w) => { const [s, t] = G(u, v); return V(s, t, side * w); };
  const tri = (a, b, c, out) => {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (n.dot(out) < 0) { const tmp = b; b = c; c = tmp; n.negate(); }
    n.normalize();
    for (const p of [a, b, c]) { pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); }
  };
  for (let j = 0; v0 + j * hv <= v1; j++) {
    const v = v0 + j * hv;
    for (let i = 0; u0 + i * 2 * hu + (j & 1) * hu <= u1; i++) {
      const u = u0 + i * 2 * hu + (j & 1) * hu;
      const corners = [[u - hu, v], [u, v + hv], [u + hu, v], [u, v - hv]];
      if (!corners.every(([a, b]) => inside(a, b))) continue;
      const base = corners.map(([a, b]) => P(a, b, wBase));
      const cen = P(u, v, (wBase + wTop) / 2);
      if (!top) {                          // pointed diamond: 4 facets meeting at the apex
        const apex = P(u, v, wTop);
        for (let k = 0; k < 4; k++) {
          const a = base[k], b = base[(k + 1) % 4];
          tri(a, b, apex, new THREE.Vector3().add(a).add(b).add(apex).multiplyScalar(1 / 3).sub(cen));
        }
        continue;
      }
      const tops = corners.map(([a, b]) => P(u + (a - u) * top, v + (b - v) * top, wTop));
      for (let k = 0; k < 4; k++) {
        const a = base[k], b = base[(k + 1) % 4], c = tops[(k + 1) % 4], d = tops[k];
        const fc = new THREE.Vector3().add(a).add(b).add(c).add(d).multiplyScalar(0.25);
        const out = fc.sub(cen);
        tri(a, b, c, out); tri(a, c, d, out);
      }
      const up = new THREE.Vector3(side, 0, 0);
      tri(tops[0], tops[1], tops[2], up); tri(tops[0], tops[2], tops[3], up);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

// Cosine-weighted Hammersley hemisphere directions (same sampling as tools/assets/lib/bake.mjs).
function hemisphere(n) {
  const dirs = [];
  for (let i = 0; i < n; i++) {
    let b = i;
    b = ((b << 16) | (b >>> 16)) >>> 0;
    b = (((b & 0x55555555) << 1) | ((b & 0xaaaaaaaa) >>> 1)) >>> 0;
    b = (((b & 0x33333333) << 2) | ((b & 0xcccccccc) >>> 2)) >>> 0;
    b = (((b & 0x0f0f0f0f) << 4) | ((b & 0xf0f0f0f0) >>> 4)) >>> 0;
    b = (((b & 0x00ff00ff) << 8) | ((b & 0xff00ff00) >>> 8)) >>> 0;
    const u = (i + 0.5) / n, v = b / 4294967296, r = Math.sqrt(u), phi = 2 * Math.PI * v;
    dirs.push([r * Math.cos(phi), r * Math.sin(phi), Math.sqrt(1 - u)]);
  }
  return dirs;
}
/**
 * Re-traces only the AO channel of already-baked `targets` against `occluders` in their current pose.
 * filter(localPos) limits it to some vertices (mesh-local metres); keepMax keeps the brighter of old / new.
 */
function rebakeAO(targets, occluders, { aoDist = 0.035, rays = 32, filter = null, keepMax = false } = {}) {
  const geos = occluders.map((m) => {
    const g = new THREE.BufferGeometry().setAttribute('position', m.geometry.attributes.position.clone());
    if (m.geometry.index) g.setIndex(m.geometry.index.clone());
    g.applyMatrix4(m.matrixWorld);
    return g.index ? g.toNonIndexed() : g;
  });
  const bvh = new MeshBVH(mergeGeometries(geos, false));
  const dirs = hemisphere(rays);
  const ray = new THREE.Ray(), p = new THREE.Vector3(), n = new THREE.Vector3(), tt = new THREE.Vector3(), bb = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const m of targets) {
    const pos = m.geometry.attributes.position, nor = m.geometry.attributes.normal, bake = m.geometry.attributes._bake;
    nm.getNormalMatrix(m.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      if (filter && !filter(p)) continue;
      p.applyMatrix4(m.matrixWorld);
      n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      if (Math.abs(n.y) < 0.9) tt.set(0, 1, 0).cross(n).normalize(); else tt.set(1, 0, 0).cross(n).normalize();
      bb.crossVectors(n, tt);
      const rot = rnd() * Math.PI * 2, cr = Math.cos(rot), sr = Math.sin(rot);
      ray.origin.copy(p).addScaledVector(n, 0.0003);
      let open = 0;
      for (const [x0, y0, z] of dirs) {
        const x = x0 * cr - y0 * sr, y = x0 * sr + y0 * cr;
        ray.direction.set(0, 0, 0).addScaledVector(tt, x).addScaledVector(bb, y).addScaledVector(n, z);
        const hit = bvh.raycastFirst(ray, THREE.DoubleSide, 0, aoDist);
        open += hit ? Math.sqrt(Math.min(1, hit.distance / aoDist)) * 0.7 : 1;
      }
      const ao = Math.round(Math.max(0, Math.min(1, open / dirs.length)) * 255);
      bake.array[i * 4] = keepMax ? Math.max(bake.array[i * 4], ao) : ao;
    }
    bake.needsUpdate = true;
  }
}

// Gun subclass working around two limits of the single-pose bake (kit untouched):
//  - the magazine is baked dropped clear of the grip, otherwise its body bakes pitch-black inside the
//    closed magwell and looks wrong the moment it falls out during a reload;
//  - the barrel hood (own static node 'hood') gets its AO re-traced with the slide locked back, so the
//    chamber exposed during slide-lock / racking reads as lit steel instead of a black hole.
class SplitBakeGun extends Gun {
  build({ bake = true, tessellate = 12 } = {}) {
    const root = super.build({ bake: false, tessellate });
    if (!bake) return root;
    const all = [];
    root.traverse((o) => { if (o.isMesh) all.push(o); });
    const mag = root.getObjectByName('mag');
    const slide = root.getObjectByName('slide');
    const magRest = mag.position.clone();
    const slideRest = slide.position.clone();
    mag.position.add(new THREE.Vector3(0, -0.22, 0.07));
    root.updateMatrixWorld(true);
    bakeMeshes(all, { tessellate: tessellate * 0.001, aoDist: 0.035, rays: 32, log: true });
    slide.position.z += 0.04;
    mag.position.copy(magRest);
    root.updateMatrixWorld(true);
    rebakeAO(all.filter((m) => m.name.startsWith('hood:')), all.filter((m) => !m.name.startsWith('mag:')));
    // inside of the slide sleeve / bolt seen through the port when the slide is locked back: keep the brighter
    // of the two poses (forward, those faces are hidden behind the hood anyway)
    const SP = 75;                                   // slide pivot s (mm)
    rebakeAO(all.filter((m) => m.name.startsWith('slide:')), all, {
      keepMax: true,
      filter: (p) => Math.abs(p.x) < 0.0122 && Math.abs(p.y) < 0.0135 && SP - p.z * 1000 > 64,
    });
    slide.position.copy(slideRest);
    mag.position.copy(magRest);
    root.updateMatrixWorld(true);
    return root;
  }
}

export default function build() {
  const g = new SplitBakeGun('deagle');
  const MZ = 264;                         // muzzle face (barrel and frame chin are flush here)
  const FT = -16.2;                       // frame top (0.6 mm seam under the slide and the barrel)
  const FB = -29.6;                       // frame bottom (dust cover underside)

  // grip lines in grip-local (u, v): steel front strap (slightly bowed), polymer wrap front edge,
  // polymer backstrap with a palm swell and a flared heel
  const UB = 97.4;                        // bottom of the grip
  const fsV = (u) => 27.4 + 1.2 * Math.sin(Math.PI * Math.min(1, Math.max(0, (u - 14) / (UB - 14))));
  const wrapFV = (u) => fsV(u) - 4.0;
  const bsV = (u) => {
    const hump = u > 28 && u < 76 ? 3.0 * Math.sin(Math.PI * (u - 28) / 48) : 0;
    const flare = u > 84 ? 1.7 * ((u - 84) / (UB - 84)) ** 2 : 0;
    return -28.8 - hump - flare;
  };

  // ======================================================================================== SLIDE
  const slide = g.part('slide', { pivot: [75, 0, 0], extras: { travel: 0.04 } });
  const SL0 = 0, SL1 = 150.6;           // slide rear / front faces
  const slideSec = [
    [-13.1, -15.6, 0.5], [13.1, -15.6, 0.5], [13.1, -11.2], [14, -10.3, 0.3], [14, 6.6, 1.4],
    [8.8, 17.6, 1.2], [-8.8, 17.6, 1.2], [-14, 6.6, 1.4], [-14, -10.3, 0.3], [-13.1, -11.2],
  ];
  let sl = section(slideSec, SL0, SL1, { bevel: 1.1, bevelSeg: 2, curveSeg: 4 });
  // deep cocking serrations machined straight into both flanks: 11 grooves, 2 mm wide x 2 mm deep, 4.2 mm
  // pitch, leaning back 8 deg, running off the lower step of the slide
  const SERR = { s0: 25, n: 11, pitch: 4.2, width: 2.0, depth: 2.0, t0: -12.6, t1: 6.0, lean: 8 };
  const serr = [];
  for (const side of [1, -1]) {
    for (let i = 0; i < SERR.n; i++) {
      serr.push(box([SERR.s0 + i * SERR.pitch, (SERR.t0 + SERR.t1) / 2, side * 14.2], [SERR.width, SERR.t1 - SERR.t0, 2 * (SERR.depth + 0.2)], { r: 0, rot: [SERR.lean, 0, 0] }));
    }
  }
  const slideA = [];
  // anti-glare grooves on the top flat, vertical grooves on the rear face
  for (const w of [-4.5, -1.5, 1.5, 4.5]) slideA.push(box([84, 17.6, w], [118, 1.0, 0.9], { r: 0 }));
  for (const w of [-10, -7.5, 7.5, 10]) slideA.push(box([0, 4, w], [1.4, 18, 0.9], { r: 0 }));
  // firing pin hole in the rear face; hammer channel along the bottom rear (long enough for the over-cocked
  // hammer, extras.rack, to pass under the slide at full travel) with a shallow hammer-face recess at the rear
  // so the hammer can fall extras.fall deg onto the firing pin without entering the slide
  slideA.push(cyl(-3, 6, 1.7, { t: 0.5, b: 0 }));
  slideA.push(profile([[-5, -20, 0], [62, -20, 0], [62, -11, 3], [3.0, -6.5, 0], [3.0, 8.2, 1.2], [-5, 8.2, 0]], { w: 9.4, bevel: 0 }));
  sl = cutG('slide', sl, [
    serr, slideA,
    // ejection port (right), with a 0.7 mm relief step around the opening; deep enough to show the bolt
    profile([[86, -3.5, 2.5], [132, -3.5, 2.5], [132, 14.5, 2], [86, 14.5, 2]], { w: 30, cw: -1.5 + 15, bevel: 0, curveSeg: 6 }),
    cutters.pocketW([[84.8, -4.7, 3.2], [133.2, -4.7, 3.2], [133.2, 15.6, 2.6], [84.8, 15.6, 2.6]], 13.3, 10),
    // front sleeve that rides over the barrel hood
    section([[-11.9, -12.9, 2.5], [11.9, -12.9, 2.5], [11.9, 12.9, 2.5], [-11.9, 12.9, 2.5]], 108, 160, { bevel: 0, curveSeg: 4 }),
  ]);
  slide.add(inlay('CF ARMORY', 98, -4.4, 4.0, -14), 'steel_dark');
  slide.add(sl, 'steel_bright');

  // firing-pin retaining cross pin + extractor-side pin heads
  for (const w of [14.05, -14.05]) {
    slide.add(screw([8, 10.5 - 0.2, w], 1.6, { face: w > 0 ? 'w' : '-w', depth: 0.35 }), 'steel_dark');
    slide.add(screw([75, -6.5, w], 1.4, { face: w > 0 ? 'w' : '-w', depth: 0.3 }), 'steel_dark');
  }
  // rear sight: dovetailed block with a square notch, serrated rear face, two white dots
  let rs = intersect(
    profile([[4.6, 17.0, 0.4], [17.5, 17.0, 0.4], [17.5, 20.5, 1.0], [12.0, 30.8, 0.8], [4.6, 30.8, 0.5]], { w: 24, bevel: 0.6, curveSeg: 4 }),
    section([[-9.6, 16.8, 0], [9.6, 16.8, 0], [9.6, 20.0, 0.8], [7.4, 30.8, 0.8], [-7.4, 30.8, 0.8], [-9.6, 20.0, 0.8]], 3, 19, { bevel: 0, curveSeg: 4 }),
  );
  const rsCuts = [box([8, 31.0, 0], [30, 6.6, 4.0], { r: 0 })];
  for (let i = 0; i < 6; i++) rsCuts.push(box([4.6, 19.2 + i * 1.6, 0], [0.9, 0.7, 30], { r: 0 }));
  rs = cutG('rear sight', rs, [rsCuts]);
  slide.add(rs, 'steel_blued');
  slide.add(section([[-11.5, 0], [11.5, 0], [9.5, 2.2], [-9.5, 2.2]], 6.2, 16, { bevel: 0.3 }).translate(0, 16.2, 0), 'steel_blued'); // dovetail
  slide.add(cyl(4.0, 4.9, 0.85, { t: 28.6, w: 4.4, seg: 12, b: 0.2 }), 'paint_white');
  slide.add(cyl(4.0, 4.9, 0.85, { t: 28.6, w: -4.4, seg: 12, b: 0.2 }), 'paint_white');
  slide.add(screw([11, 30.8, 6.8], 1.2, { face: 't', depth: 0.3 }), 'steel');

  // ambidextrous safety levers at the rear corners of the slide: round hub on the firing-pin axis, a wedge
  // shaped arm and a serrated thumb pad pointing forward (fire position)
  for (const side of [1, -1]) {
    let lev = profile([[3.2, 2.6, 3.8], [7.4, -2.0, 3], [18.6, -2.8, 1.2], [21.4, -0.6, 1.4], [20.8, 5.2, 1.2], [8.4, 6.2, 3]], { w: 2.0, cw: side * 14.95, bevel: 0.55, curveSeg: 5 });
    const lc = [];
    for (let i = 0; i < 4; i++) lc.push(vGroove(14.0 + i * 1.9, 1.3, 9, side * 15.95, 0.42, 0));
    lev = cutG('safety', lev, [lc]);
    slide.add(lev, 'steel_blued');
    const hub = lathe([[0, 0], [0, 3.3], [0.45, 3.3], [0.75, 2.8], [0.75, 0]], { seg: 20 });
    slide.add(hub.rotateY(side > 0 ? -Math.PI / 2 : Math.PI / 2).translate(side * 15.9, 2.6, -7.0), 'steel_blued');
  }

  // rotating bolt seen through the port: body, lug head with a chamfered face, extractor in its own slot
  let bolt = cyl(66, 107.6, 9.0, { seg: 28, b: 0.8 });
  let lugs = tube(107.6, 112.0, 9.6, 4.2, { seg: 28, b: 0.6 });
  const extractorSlot = box([104, 0, 9.6], [18.4, 5.0, 3.6], { r: 0 });
  bolt = cutG('bolt', bolt, [box([104, 0, 9.6], [18.4, 5.0, 3.6], { r: 0 })]);
  lugs = cutG('lugs', lugs, [
    [0, 90, 180, 270].map((a) => xform(box([110, 0, 9.6], [6, 3.4, 5], { r: 0 }), { rot: [0, 0, a + 45], pivot: [110, 0, 0] })),
    extractorSlot,
  ]);
  slide.add(bolt, 'steel');
  slide.add(lugs, 'steel');
  // extractor: long spring claw on the right of the bolt, hooked inward at the bolt face, retaining pin
  slide.add(profile([[95.5, -1.8, 0.8], [110.4, -2.0, 0.4], [112.3, -1.0, 0.3], [112.3, 1.0, 0.3], [110.4, 2.0, 0.4], [95.5, 1.8, 0.8]], { w: 1.5, cw: 9.25, bevel: 0.3, curveSeg: 3 }), 'steel_blued');
  slide.add(box([111.7, 0, 8.1], [1.2, 2.2, 1.6], { r: 0.25 }), 'steel_blued');
  slide.add(screw([99, 0, 10.0], 1.0, { face: 'w', depth: 0.3 }), 'steel_dark');
  slide.add(cyl(78, 82, 3.4, { t: 8.6, w: 0, seg: 16 }), 'steel_dark'); // cam pin head

  // ======================================================================================== BARREL
  const B0 = 151.4;
  const barSec = [
    [-13.5, -15.6, 1.4], [13.5, -15.6, 1.4], [13.5, -2.2, 1.6], [8.0, 15.8, 1.2], [-8.0, 15.8, 1.2], [-13.5, -2.2, 1.6],
  ];
  let barrel = section(barSec, B0, MZ, { bevel: 1.0, curveSeg: 4 });
  const flute = [[176, -12.8, 1.5], [236, -12.8, 1.5], [236, -9.6, 1.5], [176, -9.6, 1.5]];
  barrel = cutG('barrel', barrel, [
    cutters.holeS(0, 0, 6.35, 100, 300),
    // muzzle crown (recessed cone); long relief flutes along the lower band
    [lathe([[MZ - 3.2, 0], [MZ - 3.2, 6.35], [MZ + 0.01, 9.2], [MZ + 2, 9.2], [MZ + 2, 0]], { seg: 32 })],
    [cutters.pocketW(flute, 12.7, 10), cutters.pocketW(flute, -12.7, 10)],
  ]);
  g.add(inlay('SANDHAWK .50 AE', 206, -5.4, 4.0, 13.5), 'steel_dark');
  g.add(inlay('SANDHAWK .50 AE', 206, -5.4, 4.0, -13.5), 'steel_dark');
  g.add(barrel, 'steel_bright');
  // polygonal-rifled bore liner (hexagonal, dark) so the bore falls off to black, closed 60 mm in
  g.add(lathe([[MZ - 60, 0], [MZ - 60, 6.3], [MZ - 3.3, 6.3], [MZ - 3.3, 5.2], [MZ - 58, 5.2], [MZ - 58, 0]], { seg: 6, phase: Math.PI / 6 }), 'steel_dark');
  // integral top rail: raised spine continuing the barrel flats, dovetail flanks and cross-slotted teeth
  g.add(section([[-7.3, 15.0, 0], [7.3, 15.0, 0], [7.3, 17.6, 0.3], [-7.3, 17.6, 0.3]], 155, 237.5, { bevel: 0.5, curveSeg: 3 }), 'steel_bright');
  g.add(rail(155, 237.5, { t: 17.3 }), 'steel_bright');
  // front sight base and blade (pinned), white dot facing the shooter
  g.add(profile([[238.6, 15.0, 0], [259.2, 15.0, 0], [259.2, 19.6, 1.4], [252, 21.8, 1.0], [242, 21.8, 1.0], [238.6, 19.8, 0.8]], { w: 13, bevel: 0.7, curveSeg: 4 }), 'steel_bright');
  g.add(profile([[246.4, 20.8, 0], [257.6, 20.8, 0], [257.6, 22.6, 1.2], [250.0, 27.8, 0.5], [246.4, 27.8, 0.4]], { w: 3.4, bevel: 0.45, curveSeg: 4 }), 'steel_blued');
  g.add(cyl(245.9, 246.6, 0.75, { t: 26.0, seg: 12, b: 0.2 }), 'paint_white');
  for (const w of [6.55, -6.55]) g.add(screw([252.5, 18.4, w], 0.9, { face: w > 0 ? 'w' : '-w', depth: 0.25 }), 'steel_dark'); // blade cross pin

  // barrel hood / chamber block (inside the slide sleeve; exposed when the slide is back)
  let hood = section([[-11.4, -12.4, 2.2], [11.4, -12.4, 2.2], [11.4, 12.4, 2.2], [-11.4, 12.4, 2.2]], 112.6, B0 + 0.4, { bevel: 0.8 });
  hood = cutG('hood', hood, [
    cutters.holeS(0, 0, 6.9, 100, 130),
    [0, 90, 180, 270].map((a) => xform(cutters.box([112.6, 0, 8.6], [5, 3.8, 4.4]), { rot: [0, 0, a + 45], pivot: [112.6, 0, 0] })),
  ]);
  const hoodPart = g.part('hood', { pivot: [130, 0, 0], extras: { static: true } });
  hoodPart.add(hood, 'steel_bright');
  // calibre stamp sits ahead of the ejection port: only shows with the slide locked back
  hoodPart.add(inlay('.50 AE', 140.5, 4.0, 3.0, 11.4), 'steel_dark');

  // ======================================================================================== FRAME
  // one-piece frame: full-length dust cover under the barrel ending in the angled chin, trigger guard root,
  // exposed steel front strap, grip core and a beavertail tang whose underside sweeps down into the backstrap
  const uStrapTop = uAtT(fsV, FB);                       // front strap meets the dust cover (inside the guard)
  const strap = [];
  for (const u of [24, 32, 40, 48, 56, 64, 72, 80, 88]) strap.push(G(u, fsV(u), 0));
  const tangC = [18.6, -31.0];                         // tang underside meets the backstrap line
  const backTop = GI(...tangC);                        // (u, v) of that corner
  const frameOutline = [
    [-2.5, FT, 0.6], [MZ, FT, 0.8], [MZ, -19.2, 1.0], [MZ - 14, FB, 2.5],
    [G(uStrapTop, fsV(uStrapTop))[0], FB, 5],
    ...strap,
    G(UB - 0.4, fsV(UB - 0.4), 1.5), G(UB - 0.4, -25.6, 0), G(46, -25.6, 0), G(44, backTop[1], 0),
    [tangC[0], tangC[1], 10], [-6, -29.0, 4], [-12.4, -24.6, 3], [-13.0, -20.8, 2.2], [-6, -17.6, 2],
  ];
  let frame = profile(frameOutline, { w: 26, bevel: 1.2, bevelSeg: 2, curveSeg: 8 });
  // magazine well: straight along the grip axis from the frame top to the bottom of the grip
  const magwell = () => profile([G(-14, -23.8), G(-14, 24.0), G(106, 24.0), G(106, -23.8)], { w: 19.2, bevel: 0 });
  const strapCuts = [];
  for (let u = 46; u <= 93; u += 3.2) {
    const [s, t] = G(u, fsV(u));
    const ang = Math.atan2(fsV(u + 0.5) - fsV(u - 0.5), 1) / DEG;  // follow the bow
    strapCuts.push(box([s, t, 0], [2.4, 1.3, 30], { r: 0, rot: [-RAKE / DEG + ang, 0, 0] }));
  }
  frame = cutG('frame', frame, [
    [
      // hammer channel through the tang
      profile([[-18, -25.0, 0], [16, -29.4, 0], [16, -10, 0], [-18, -10, 0]], { w: 9.0, bevel: 0 }),
      // trigger slot in the underside of the frame
      box([96, FB + 2.5, 0], [14, 7, 7.8], { r: 0 }),
    ],
    magwell(),
    strapCuts,
  ]);
  g.add(frame, 'steel');
  // twin recoil-spring guide-rod caps seated square to the chin chamfer (a short collar + domed end each)
  {
    const a = [MZ - 14, FB], b = [MZ, -19.2];
    const ang = Math.atan2(-(b[0] - a[0]), b[1] - a[1]);   // outward chamfer normal angle about w
    const k = 0.42, c = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    for (const w of [6.2, -6.2]) {
      const cap = lathe([[-1.0, 0], [-1.0, 3.0], [0.15, 3.0], [0.35, 2.6], [0.35, 2.0], [0.7, 1.9], [1.05, 1.3], [1.15, 0]], { seg: 20 });
      cap.applyMatrix4(new THREE.Matrix4().makeRotationX(ang));
      const p = V(c[0], c[1], w);
      g.add(cap.translate(p.x, p.y, p.z), 'steel_blued');
    }
  }

  // trigger guard: squared, serrated front with a fillet up into the dust cover; the bottom bar runs into the
  // front strap at full thickness with fillets above and below
  const GI_ = -56.4, GO_ = -63.6;               // bottom bar inner / outer line (7.2 mm bar)
  const uCg = uAtT(fsV, GI_), uCb = uAtT(fsV, GO_);
  const Cg = G(uCg, fsV(uCg)), Cb = G(uCb, fsV(uCb));
  const upStrap = G(uCg - 3.2, fsV(uCg - 3.2)), downStrap = G(uCb + 3.4, fsV(uCb + 3.4));
  const guardPts = [
    [152, -28.6],
    ...qPts([141.8, -29.3], [137.5, -29.6], [137.5, -34.0], 5),
    [137.5, GO_ + 5.5, 5.5], [133, GO_, 6],
    ...qPts([Cb[0] + 3.6, GO_], Cb, downStrap, 5),
    G(uCb + 3.4, fsV(uCb + 3.4) - 6), G(uCg - 3.2, fsV(uCg - 3.2) - 6),
    ...qPts(upStrap, Cg, [Cg[0] + 3.4, GI_], 5),
    [122.6, GI_, 5], [127.6, GI_ + 4.9, 7], [127.6, -28.6],
  ];
  let guard = profile(guardPts, { w: 10.4, bevel: 1.4, bevelSeg: 2, curveSeg: 12 });
  const gs = [];
  for (let i = 0; i < 6; i++) gs.push(box([137.5, -37.5 - i * 3.0, 0], [1.4, 1.2, 14], { r: 0 }));
  guard = cutG('guard', guard, [gs]);
  g.add(guard, 'steel');

  // pins (both sides): hammer pin (on the hammer pivot), sear pin, trigger pin
  const HP = [4, -20.5];                 // hammer pin (in the frame, just under the slide)
  const pins = [[HP[0], HP[1], 2.0], [22, -22.0, 1.6], [96, -21.0, 1.7]];
  for (const [s, t, r] of pins) for (const w of [13.02, -13.02]) g.add(screw([s, t, w], r, { face: w > 0 ? 'w' : '-w', depth: 0.4 }), 'steel_dark');

  // slide stop (left): pivot pin forward, serrated thumb pad at the rear above the grip
  let stop = profile([[74, -19.2, 2.2], [122, -18.6, 3], [124, -23.6, 3], [86, -25.8, 2], [74, -26.4, 2.4]], { w: 1.8, cw: -13.9, bevel: 0.45 });
  stop = cutG('stop', stop, [[0, 1, 2, 3].map((i) => vGroove(76.5 + i * 2.6, -22.8, 8, -14.8, 0.45))]);
  g.add(stop, 'steel_blued');
  g.add(cyl(0, 2.2, 2.6, { b: 0.5, seg: 18 }).rotateY(Math.PI / 2).translate(-13.4, -21.2, -118), 'steel_blued');
  g.add(screw([118, -21.2, 13.02], 1.8, { face: 'w', depth: 0.4 }), 'steel_dark');

  // barrel latch (takedown) on the left of the frame nose with a tan button, axle head on the right
  g.add(cyl(0, 2.4, 4.4, { b: 0.7, seg: 22 }).rotateY(Math.PI / 2).translate(-13.2, -21.4, -150), 'alu_tan');
  g.add(profile([[147, -20.2, 1.2], [156.5, -18.6, 1.4], [157.4, -21.2, 1.4], [148, -24.4, 1.2]], { w: 2.0, cw: -15.0, bevel: 0.5, curveSeg: 4 }), 'steel_blued');
  g.add(screw([150, -21.4, 13.02], 2.6, { face: 'w', depth: 0.5 }), 'steel_dark');

  // magazine release (left): on the frame just behind the trigger guard, the wrap is relieved around it
  const MR = G(17, 22.2);
  g.add(lathe([[0, 0], [0, 4.0], [1.6, 4.0], [2.8, 3.4], [3.3, 0]], { seg: 22 }).rotateY(Math.PI / 2).translate(-13.0, MR[1], -MR[0]), 'steel_blued');

  // ======================================================================================== GRIP
  // one-piece polymer wrap over the sides and the backstrap (front strap stays bare steel): palm swell,
  // flared heel, checkered side panels, ribbed backstrap, tan medallion
  const WT = -30.5;                                     // top edge of the wrap (0.5 mm into the frame side)
  const uTF = uAtT(wrapFV, WT), uTB = uAtT(bsV, WT);
  const wrap = [G(uTF, wrapFV(uTF), 1.5), [G(uTB, bsV(uTB))[0], WT, 1.5]];
  for (let u = Math.ceil(uTB) + 3; u <= UB - 5; u += 3) wrap.push(G(u, bsV(u), 0));
  wrap.push(G(UB, bsV(UB), 3), G(UB, wrapFV(UB), 2));
  for (let u = UB - 5; u > uTF + 3; u -= 4) wrap.push(G(u, wrapFV(u), 0));
  let grip = profile(wrap, { w: 32, bevel: 3.8, bevelSeg: 3, curveSeg: 4 });
  // checkered panels sit in shallow pockets with a plain border
  const PU0 = 38, PU1 = 90.5, PV0 = -22, PV1 = 18.4, PR = 4;
  const panelPts = [G(PU0, PV0, PR), G(PU1, PV0, PR), G(PU1, PV1, PR), G(PU0, PV1, PR)];
  const WP = 15.1;                                     // pocket floor
  const ribCuts = [];
  for (let u = 46; u <= 93; u += 4) {
    const p = G(u, bsV(u)), a = G(u - 0.5, bsV(u - 0.5)), b = G(u + 0.5, bsV(u + 0.5));
    const rot = Math.atan2(-(b[0] - a[0]), b[1] - a[1]) / DEG;
    ribCuts.push(box([p[0], p[1], 0], [2.2, 1.5, 21], { r: 0, rot: [rot, 0, 0] }));
  }
  grip = cutG('grip', grip, [
    [cutters.pocketW(panelPts, WP, 6), cutters.pocketW(panelPts, -WP, 6)],
    magwell(),
    ribCuts,
    cutters.holeW(MR[0], MR[1], 5.4, 10).translate(-18.5, 0, 0),
  ]);
  g.add(grip, 'polymer');
  const sd = (u, v, m) => {                         // rounded-rect test for the checkering
    const cu = (PU0 + PU1) / 2, cv = (PV0 + PV1) / 2;
    const hx = (PU1 - PU0) / 2 - m - PR, hy = (PV1 - PV0) / 2 - m - PR;
    const qx = Math.max(Math.abs(u - cu) - hx, 0), qy = Math.max(Math.abs(v - cv) - hy, 0);
    return Math.hypot(qx, qy) - PR;
  };
  for (const side of [1, -1]) {
    g.add(checkerField({
      side, inside: (u, v) => sd(u, v, 0.7) < 0, u0: PU0, u1: PU1, v0: PV0, v1: PV1,
      hu: 1.75, hv: 1.25, wBase: WP - 0.05, wTop: 16.0, top: 0,
    }), 'polymer');
    const [s, t] = G(29.5, -2.5);
    g.add(lathe([[0, 0], [0, 5.0], [0.5, 5.0], [1.0, 4.4], [1.0, 0]], { seg: 28 }).rotateY(side > 0 ? -Math.PI / 2 : Math.PI / 2).translate(side * 15.6, t, -s), 'alu_tan');
    // stylised hawk-wing chevron emblem
    const em = [[-3.6, 1.3, 0.3], [-0.5, -2.3, 0.3], [0.5, -2.3, 0.3], [3.6, 1.3, 0.3], [2.3, 2.0, 0.3], [0, -0.4, 0.3], [-2.3, 2.0, 0.3]].map(([a, b, r]) => [s + a, t + b, r]);
    g.add(profile(em, { w: 0.6, cw: side * 16.45, bevel: 0.18, curveSeg: 2 }), 'steel_dark');
    g.add(cyl(0, 0.6, 0.8, { seg: 10, b: 0.18 }).rotateY(side > 0 ? -Math.PI / 2 : Math.PI / 2).translate(side * 16.15, t + 2.4, -s), 'steel_dark');
  }

  // ======================================================================================== HAMMER
  const FALL = 18;                       // modelled cocked; falls FALL deg forward onto the firing pin (face recess)
  const RACK = 40;                       // over-cock while the slide is back (top rearward), clears the slide channel
  const hammer = g.part('hammer', { pivot: [HP[0], HP[1], 0], extras: { fall: -FALL, rack: RACK, axis: 'w' } });
  // cocked outline: hub on the pin, a broad body leaning back, rounded head with a knurled spur
  const hamPts = [
    [4, -27.2, 3], [10.2, -22.4, 3], [8.4, -16.6, 2.4], [0.6, -14.2, 1.6], [-2.8, -4, 1.4], [-4.8, 1.4, 1.8], [-8, 4.8, 2.6],
    [-13.6, 6.0, 2.8], [-19.4, 4.0, 2.2], [-19.4, 0.4, 1.6], [-14.6, -1.4, 2], [-12.2, -8, 4], [-8, -17.4, 4], [-2.4, -24.8, 3],
  ];
  let ham = profile(hamPts, { w: 8.2, bevel: 0.8, curveSeg: 6 });
  const hc = [cutters.holeW(-7.8, -7.6, 2.3)];
  const knurl = [[-9.6, 5.3], [-11.3, 5.7], [-13.0, 5.95], [-14.7, 5.8], [-16.4, 5.25], [-18.0, 4.55]];
  knurl.forEach(([sg, tg], i) => hc.push(box([sg, tg, 0], [0.85, 2.0, 12], { r: 0, rot: [-12 + i * 6.4, 0, 0] })));
  ham = cutG('hammer', ham, [hc]);
  hammer.add(ham, 'steel_blued');

  // ======================================================================================== TRIGGER
  const TP = [96, -21];
  const trig = g.part('trigger', { pivot: [TP[0], TP[1], 0], extras: { pull: 12, axis: 'w' } });
  trig.add(profile('M 93 -18 L 99 -18 Q 101.5 -28 100.2 -36 Q 99.2 -46 95.0 -53.4 Q 93.2 -54.6 92.4 -53 Q 95.0 -44 94.2 -36 Q 93.4 -30 90.6 -26 Z', { w: 7.2, bevel: 1.0, curveSeg: 12 }), 'steel_blued');

  // ======================================================================================== MAGAZINE
  const mag = g.part('mag', { pivot: [P0[0], P0[1], 0], extras: { drop: true, dir: [DU[0], DU[1], 0] } });
  const magBody = [G(98, -23, 1.2), G(98, 23, 1.2), [78, -16, 2], [29.3, -16, 2]];
  let mb = profile(magBody, { w: 18.4, bevel: 0.8 });
  const mcuts = [];
  for (let i = 0; i < 4; i++) {
    const [s, t] = G(30 + i * 15, -14);
    for (const w of [9.2, -9.2]) mcuts.push(cutters.holeW(s, t, 1.6, 4).translate(w, 0, 0));
  }
  mb = cutG('mag', mb, [[...mcuts, box([54, -15, 0], [40, 4, 12.6], { r: 0 })]]);
  mag.add(mb, 'steel_blued');
  // feed lips
  for (const w of [1, -1]) mag.add(profile([[33, -17, 1], [70, -17, 1], [66, -11.6, 1.5], [35, -11.6, 1.5]], { w: 1.4, cw: w * 6.6, bevel: 0.4 }), 'steel_blued');
  // top cartridge: .50 case + jacketed hollow point
  mag.add(lathe([[33.2, 0], [33.2, 6.9], [34.6, 6.9], [35.0, 5.9], [36.4, 5.9], [36.8, 6.75], [65.6, 6.6], [65.6, 0]], { t: -10.2, seg: 26 }), 'brass');
  mag.add(lathe([[65.4, 0], [65.4, 6.38], [70.8, 5.2], [73.2, 3.3], [73.6, 2.4], [72.2, 1.2], [72.2, 0]], { t: -10.2, seg: 26 }), 'copper');
  // thin floor plate following the grip footprint (heel flare to toe), tan accent
  mag.add(profile([G(UB + 0.2, bsV(UB) + 0.6, 1.2), G(UB + 0.2, fsV(UB) - 0.3, 1.0), G(UB + 3.2, fsV(UB) - 0.6, 1.4), G(UB + 3.2, bsV(UB) + 0.9, 1.6)], { w: 29, bevel: 1.1, curveSeg: 6 }), 'alu_tan');

  // ======================================================================================== SOCKETS
  g.socket('muzzle', [MZ, 0, 0]);
  g.socket('eject', [108, 6, 14], { dir: [-0.15, 0.55, 1] });
  g.socket('grip_r', [...G(42, -2), 0], { rot: [0, 0, -18] });
  g.socket('grip_l', [...G(76, 6), -20], { rot: [0, 0, -18] });
  g.socket('magwell', [...G(101, 0), 0]);
  g.socket('charge', [SERR.s0 + SERR.pitch * (SERR.n - 1) / 2, 0, 0]);
  g.socket('sight_rear', [8, 27.7, 0]);
  g.socket('sight_front', [248, 27.8, 0]);
  g.meta({
    grip: 'pistol', support: 'pistol_cup', reload: 'mag_pistol', chargeSide: 'rear',
    notes: 'Slide travels 40 mm. Hammer modelled cocked; parts hammer and trigger both rotate about the w axis '
      + '(three +x; positive = top rearward). On fire rotate the hammer by extras.fall deg (forward); while the slide '
      + 'is back, and whenever it is locked back, hold the hammer over-cocked at extras.rack deg (rearward) or it '
      + 'pokes through the slide; let it return to 0 (cocked) as the slide closes. Trigger rotates back by extras.pull '
      + 'deg about its pin. Magazine drops along extras.dir (grip axis, s/t mm-space direction). Overhand rack on the '
      + 'rear serrations.',
  });
  return g;
}
