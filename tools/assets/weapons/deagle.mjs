// 沙隼 Sandhawk .50 — gas-operated heavy pistol in the Mark XIX .50 calibre pattern.
// Side view, mm: s forward from the rear face of the slide, t up from the bore axis, w right (ejection side).
// Real reference: overall 270 (tang -6 .. muzzle 264), barrel 152 (breech face s = 112), height 149
// (rear sight 29.5 .. magazine floor -120), width 32, 7-round single-stack magazine.
import * as THREE from 'three';
import { Gun, DEG, profile, plan, section, lathe, cyl, tube, box, rail, screw, cut, intersect, cutters, merge, xform, mirrorW } from '../lib/gunkit.mjs';
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

/**
 * Serration comb that fills a side pocket: (s, w) zig-zag extruded along t, sheared to lean the grooves
 * back by `lean` deg. Right side (w > 0); mirror for the left.
 */
function serrationComb({ s0, n, pitch, land, t0, t1, wFace, depth, lean }) {
  const top = [];
  const s1 = s0 + n * pitch;
  top.push([s1, wFace - depth + 0.1]);
  for (let i = n - 1; i >= 0; i--) {
    const c = s0 + pitch / 2 + i * pitch;
    top.push([c + land / 2, wFace], [c - land / 2, wFace], [c - pitch / 2, wFace - depth + 0.1]);
  }
  const pts = [[s0, wFace - depth - 0.3], [s1, wFace - depth - 0.3], ...top];
  const geo = plan(pts, { h: t1 - t0, ct: (t0 + t1) / 2, bevel: 0.12, bevelSeg: 1 });
  const kx = Math.tan(lean * DEG), tc = (t0 + t1) / 2;
  // three z = -s ; s' = s - (t - tc) * k  ->  z' = z + (y - tc) * k
  geo.applyMatrix4(new THREE.Matrix4().set(1, 0, 0, 0, 0, 1, 0, 0, 0, kx, 1, -kx * tc, 0, 0, 0, 1));
  return geo;
}
/** Matching pocket cutter (side-view parallelogram) for serrationComb. */
function serrationPocket({ s0, n, pitch, t0, t1, wFace, depth, lean }, side = 1) {
  const kx = Math.tan(lean * DEG), tc = (t0 + t1) / 2, s1 = s0 + n * pitch, e = 0.04;
  const sh = (s, t) => [s - (t - tc) * kx, t];
  return cutters.pocketW([sh(s0 - e, t0 - e), sh(s1 + e, t0 - e), sh(s1 + e, t1 + e), sh(s0 - e, t1 + e)], side * (wFace - depth), 12);
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
/** Re-traces only the AO channel of already-baked `targets` against `occluders` in their current pose. */
function rebakeAO(targets, occluders, { aoDist = 0.035, rays = 32 } = {}) {
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
      p.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
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
      bake.array[i * 4] = Math.round(Math.max(0, Math.min(1, open / dirs.length)) * 255);
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
    root.updateMatrixWorld(true);
    rebakeAO(all.filter((m) => m.name.startsWith('hood:')), all.filter((m) => !m.name.startsWith('mag:')));
    slide.position.copy(slideRest);
    mag.position.copy(magRest);
    root.updateMatrixWorld(true);
    return root;
  }
}

export default function build() {
  const g = new SplitBakeGun('deagle');

  // ======================================================================================== SLIDE
  const slide = g.part('slide', { pivot: [75, 0, 0], extras: { travel: 0.04 } });
  const SL0 = 0, SL1 = 150.6;           // slide rear / front faces
  const slideSec = [
    [-13.1, -15.6, 0.5], [13.1, -15.6, 0.5], [13.1, -11.2], [14, -10.3, 0.3], [14, 6.6, 1.4],
    [8.8, 17.6, 1.2], [-8.8, 17.6, 1.2], [-14, 6.6, 1.4], [-14, -10.3, 0.3], [-13.1, -11.2],
  ];
  let sl = section(slideSec, SL0, SL1, { bevel: 1.1, bevelSeg: 2, curveSeg: 4 });
  // deep serrations: a pocket on each side filled with a sheared comb insert (8 deg lean)
  const SERR = { s0: 23.4, n: 10, pitch: 3.6, land: 0.8, t0: -9.2, t1: 4.8, wFace: 14, depth: 1.35, lean: 8 };
  const slideA = [serrationPocket(SERR, 1), serrationPocket(SERR, -1)];
  // anti-glare grooves on the top flat, vertical grooves on the rear face
  for (const w of [-4.5, -1.5, 1.5, 4.5]) slideA.push(box([84, 17.6, w], [118, 1.0, 0.9], { r: 0 }));
  for (const w of [-10, -7.5, 7.5, 10]) slideA.push(box([0, 4, w], [1.4, 18, 0.9], { r: 0 }));
  // firing pin hole in the rear face, hammer channel at the bottom rear (the slide rides over the hammer)
  slideA.push(cyl(-3, 6, 1.7, { t: 0.5, b: 0 }));
  slideA.push(profile([[-5, -20, 0], [24, -20, 0], [24, -10, 3], [-5, -6, 0]], { w: 9.4, bevel: 0 }));
  sl = cutG('slide', sl, [
    slideA,
    // ejection port (right), with a 0.7 mm relief step around the opening; deep enough to show the bolt
    profile([[86, -3.5, 2.5], [132, -3.5, 2.5], [132, 14.5, 2], [86, 14.5, 2]], { w: 30, cw: -1.5 + 15, bevel: 0, curveSeg: 6 }),
    cutters.pocketW([[84.8, -4.7, 3.2], [133.2, -4.7, 3.2], [133.2, 15.6, 2.6], [84.8, 15.6, 2.6]], 13.3, 10),
    // front sleeve that rides over the barrel hood
    section([[-11.9, -12.9, 2.5], [11.9, -12.9, 2.5], [11.9, 12.9, 2.5], [-11.9, 12.9, 2.5]], 108, 160, { bevel: 0, curveSeg: 4 }),
  ]);
  const comb = serrationComb(SERR);
  slide.add(merge([comb, mirrorW(comb)]), 'steel_bright');
  slide.add(inlay('CF ARMORY', 96, -4.4, 4.0, -14), 'steel_dark');
  slide.add(sl, 'steel_bright');

  // firing-pin retaining cross pin + extractor-side pin heads
  for (const w of [14.05, -14.05]) {
    slide.add(screw([8, 10.5 - 0.2, w], 1.6, { face: w > 0 ? 'w' : '-w', depth: 0.35 }), 'steel_dark');
    slide.add(screw([66, -6.5, w], 1.4, { face: w > 0 ? 'w' : '-w', depth: 0.3 }), 'steel_dark');
  }
  // rear sight: dovetailed block with a square notch, serrated rear face, two white dots
  let rs = intersect(
    profile([[4.6, 17.0, 0.4], [17.5, 17.0, 0.4], [17.5, 20.5, 1.0], [12.0, 29.6, 0.8], [4.6, 29.6, 0.5]], { w: 24, bevel: 0.6, curveSeg: 4 }),
    section([[-9.6, 16.8, 0], [9.6, 16.8, 0], [9.6, 20.0, 0.8], [7.4, 29.6, 0.8], [-7.4, 29.6, 0.8], [-9.6, 20.0, 0.8]], 3, 19, { bevel: 0, curveSeg: 4 }),
  );
  const rsCuts = [box([8, 29.8, 0], [30, 6.6, 4.0], { r: 0 })];
  for (let i = 0; i < 5; i++) rsCuts.push(box([4.6, 19.2 + i * 1.6, 0], [0.9, 0.7, 30], { r: 0 }));
  rs = cutG('rear sight', rs, [rsCuts]);
  slide.add(rs, 'steel_dark');
  slide.add(section([[-11.5, 0], [11.5, 0], [9.5, 2.2], [-9.5, 2.2]], 6.2, 16, { bevel: 0.3 }).translate(0, 16.2, 0), 'steel_dark'); // dovetail
  slide.add(cyl(4.0, 4.9, 0.85, { t: 27.4, w: 4.4, seg: 12, b: 0.2 }), 'paint_white');
  slide.add(cyl(4.0, 4.9, 0.85, { t: 27.4, w: -4.4, seg: 12, b: 0.2 }), 'paint_white');
  slide.add(screw([11, 29.6, 6.8], 1.2, { face: 't', depth: 0.3 }), 'steel');

  // ambidextrous safety levers at the rear corners of the slide: round hub on the firing-pin axis, a wedge
  // shaped arm and a serrated thumb pad pointing forward (fire position)
  for (const side of [1, -1]) {
    let lev = profile([[3.2, 2.6, 3.8], [7.4, -2.0, 3], [18.6, -2.8, 1.2], [21.4, -0.6, 1.4], [20.8, 5.2, 1.2], [8.4, 6.2, 3]], { w: 2.2, cw: side * 15.05, bevel: 0.55, curveSeg: 5 });
    const lc = [];
    for (let i = 0; i < 4; i++) lc.push(vGroove(14.0 + i * 1.9, 1.3, 9, side * 16.15, 0.42, 0));
    lev = cutG('safety', lev, [lc]);
    slide.add(lev, 'steel_dark');
    const hub = lathe([[0, 0], [0, 3.3], [0.9, 3.3], [1.5, 2.6], [1.5, 0]], { seg: 20 });
    slide.add(hub.rotateY(side > 0 ? -Math.PI / 2 : Math.PI / 2).translate(side * 16.1, 2.6, -7.0), 'steel_dark');
    slide.add(box([7.0, 2.6, side * 17.55], [0.7, 4.2, 0.4], { r: 0 }), 'steel_dark'); // screw slot ridge
  }

  // rotating bolt seen through the port: body, lug ring, extractor
  slide.add(cyl(66, 107.6, 9.0, { seg: 28, b: 0.8 }), 'steel_bright');
  let lugs = tube(107.6, 112.0, 9.4, 4.2, { seg: 28 });
  lugs = cutG('lugs', lugs, [[0, 90, 180, 270].map((a) => xform(box([110, 0, 9.4], [6, 3.4, 5], { r: 0 }), { rot: [0, 0, a + 45], pivot: [110, 0, 0] }))]);
  slide.add(lugs, 'steel_bright');
  slide.add(box([99, 3.8, 8.6], [22, 3.6, 1.6], { r: 0.5 }), 'steel_dark'); // extractor
  slide.add(cyl(88, 94, 2.4, { t: 0, w: 8.2, seg: 12 }).rotateZ(0), 'steel_dark');
  slide.add(cyl(78, 82, 3.4, { t: 8.6, w: 0, seg: 16 }), 'steel_dark'); // cam pin head

  // ======================================================================================== BARREL
  const B0 = 151.4, MZ = 264;
  const barSec = [
    [-13.5, -16, 1.4], [13.5, -16, 1.4], [13.5, -2.2, 1.6], [8.0, 15.8, 1.2], [-8.0, 15.8, 1.2], [-13.5, -2.2, 1.6],
  ];
  let barrel = section(barSec, B0, MZ, { bevel: 1.0, curveSeg: 4 });
  const flute = [[176, -12.8, 1.5], [236, -12.8, 1.5], [236, -9.6, 1.5], [176, -9.6, 1.5]];
  barrel = cutG('barrel', barrel, [
    cutters.holeS(0, 0, 6.35, 100, 300),
    // muzzle crown (recessed cone)
    lathe([[MZ - 3.2, 0], [MZ - 3.2, 6.35], [MZ + 0.01, 9.2], [MZ + 2, 9.2], [MZ + 2, 0]], { seg: 32 }),
    // chin: angled lower front of the barrel; long relief flutes along the lower band
    [xform(cutters.box([MZ + 2, -22, 0], [26, 20, 40]), { rot: [-38, 0, 0], pivot: [MZ, -12, 0] }),
      cutters.pocketW(flute, 12.7, 10), cutters.pocketW(flute, -12.7, 10)],
  ]);
  g.add(inlay('SANDHAWK .50 AE', 206, -5.4, 4.0, 13.5), 'steel_dark');
  g.add(inlay('SANDHAWK .50 AE', 206, -5.4, 4.0, -13.5), 'steel_dark');
  g.add(barrel, 'steel_bright');
  // integral rail on top + front sight base and blade
  g.add(rail(154, 238, { t: 15.6 }), 'steel_bright');
  g.add(profile([[239, 15, 0.5], [258.5, 15, 0.5], [258.5, 18.6, 1.4], [242, 19.6, 1], [239, 19.6, 0.5]], { w: 14, bevel: 0.7 }), 'steel_bright');
  g.add(profile([[246.4, 18.6, 0], [257.6, 18.6, 0], [257.6, 20.4, 1.2], [249.6, 26.6, 0.5], [246.4, 26.6, 0.4]], { w: 3.4, bevel: 0.45 }), 'steel_dark');
  g.add(cyl(245.9, 246.6, 0.75, { t: 24.9, seg: 12, b: 0.2 }), 'paint_white');
  for (const w of [7.05, -7.05]) g.add(screw([252, 17.2, w], 0.9, { face: w > 0 ? 'w' : '-w', depth: 0.25 }), 'steel_dark'); // blade cross pin

  // barrel hood / chamber block (inside the slide sleeve; exposed when the slide is back)
  let hood = section([[-11.4, -12.4, 2.2], [11.4, -12.4, 2.2], [11.4, 12.4, 2.2], [-11.4, 12.4, 2.2]], 112.6, B0 + 0.4, { bevel: 0.8 });
  hood = cutG('hood', hood, [
    cutters.holeS(0, 0, 6.9, 100, 130),
    [0, 90, 180, 270].map((a) => xform(cutters.box([112.6, 0, 8.6], [5, 3.8, 4.4]), { rot: [0, 0, a + 45], pivot: [112.6, 0, 0] })),
  ]);
  const hoodPart = g.part('hood', { pivot: [130, 0, 0], extras: { static: true } });
  hoodPart.add(hood, 'steel_bright');
  hoodPart.add(inlay('.50 AE', 123.5, 6.4, 3.0, 11.4), 'steel_dark');

  // ======================================================================================== FRAME
  const FT = -16.2;                      // frame top (slide/barrel seam 0.6 mm)
  const frameOutline = [
    [-2.5, FT, 0.6], [163, FT, 1.0], [164.5, -18.2, 1.6], [146, -29.6, 3],
    [131, -29.6, 0], [80, -29.6, 0],
    G(34, 26.5, 0), G(34, -26.5, 0), G(23, -27.5, 6),
    [11, -31.5, 8], [-6, -28.8, 4], [-12.4, -24.6, 3], [-13.0, -20.8, 2.2], [-6, -17.6, 2],
  ];
  let frame = profile(frameOutline, { w: 26, bevel: 1.2, bevelSeg: 2 });
  frame = cutG('frame', frame, [[
    // hammer channel through the rear of the frame
    profile([[-18, -25.5, 0], [16, -31, 0], [16, -10, 0], [-18, -10, 0]], { w: 9.0, bevel: 0 }),
    // magwell mouth (hidden by the grip/mag, keeps the frame from swallowing the magazine top)
    profile([G(-8, -23.6), G(-8, 23.6), G(40, 23.6), G(40, -23.6)], { w: 19.4, bevel: 0 }),
    // machined relief flat on the right side of the dust cover
    cutters.pocketW([[104, -26.4, 1.6], [141, -26.4, 1.6], [151.5, -19.4, 1.6], [104, -19.4, 1.6]], 12.3, 6),
  ]]);
  g.add(frame, 'steel_bright');
  // trigger guard: squared front with a serrated face, merged into the frame and the front strap
  let guard = profile([
    [128, -28.6, 0], [137.5, -28.6, 2], [137.5, -57.5, 5.5], [133, -63, 6], [86, -63, 12], G(33, 27, 0), G(16, 26, 0), [84, -29, 0],
  ], { w: 10.4, bevel: 1.4, bevelSeg: 2, curveSeg: 12 });
  const gs = [profile([[86, -28, 3], [128.5, -28, 3], [128.5, -52.5, 7], [123.5, -57.4, 5], [90, -57.4, 13], G(27, 27, 0), G(14, 26, 0)], { w: 40, bevel: 0, curveSeg: 12 })];
  for (let i = 0; i < 7; i++) gs.push(box([137.5, -33.5 - i * 3.0, 0], [1.4, 1.2, 14], { r: 0 }));
  guard = cutG('guard', guard, [gs]);
  g.add(guard, 'steel_bright');

  // pins (both sides): hammer pin, sear pin, trigger pin, slide-stop pin, barrel-latch axle
  const pins = [[5, -23.5, 2.0], [22, -21.5, 1.6], [96, -21.0, 1.7]];
  for (const [s, t, r] of pins) for (const w of [13.02, -13.02]) g.add(screw([s, t, w], r, { face: w > 0 ? 'w' : '-w', depth: 0.4 }), 'steel_dark');

  // slide stop (left): pivot pin forward, serrated thumb pad at the rear above the grip
  let stop = profile([[74, -19.2, 2.2], [122, -18.6, 3], [124, -23.6, 3], [86, -25.8, 2], [74, -26.4, 2.4]], { w: 1.8, cw: -13.9, bevel: 0.45 });
  stop = cutG('stop', stop, [[0, 1, 2, 3].map((i) => vGroove(76.5 + i * 2.6, -22.8, 8, -14.8, 0.45))]);
  g.add(stop, 'steel_dark');
  g.add(cyl(0, 2.2, 2.6, { b: 0.5, seg: 18 }).rotateY(Math.PI / 2).translate(-13.4, -21.2, -118), 'steel_dark');
  g.add(screw([118, -21.2, 13.02], 1.8, { face: 'w', depth: 0.4 }), 'steel_dark');

  // barrel latch (takedown) on the left of the frame nose, axle head on the right
  g.add(cyl(0, 2.4, 4.4, { b: 0.7, seg: 22 }).rotateY(Math.PI / 2).translate(-13.2, -21.4, -150), 'steel_dark');
  g.add(profile([[147, -20.2, 1.2], [156.5, -18.6, 1.4], [157.4, -21.2, 1.4], [148, -24.4, 1.2]], { w: 2.2, cw: -15.4, bevel: 0.5, curveSeg: 4 }), 'steel_dark');
  g.add(screw([150, -21.4, 13.02], 2.6, { face: 'w', depth: 0.5 }), 'steel_dark');

  // magazine release (left, behind the trigger guard)
  g.add(lathe([[0, 0], [0, 4.1], [1.4, 4.1], [2.4, 3.6], [2.8, 0]], { seg: 22 }).rotateY(Math.PI / 2).translate(-13.0, -35.0, -79.5), 'steel_dark');

  // ======================================================================================== GRIP
  // one-piece rubber wraparound, slightly swelled palm, finger-groove free front strap with horizontal ribs
  const gripOutline = [
    G(9, -27.4, 2), G(40, -28.8, 20), G(96.6, -27.6, 6), G(97.2, 26.8, 4), G(78, 29.0, 20), G(40, 29.2, 20), G(20, 27.6, 1),
    G(14, 26.2, 1), [24, -28.8, 2],
  ];
  let grip = profile(gripOutline, { w: 32, bevel: 4.6, bevelSeg: 3, curveSeg: 14 });
  const gripCuts = [];
  for (let i = 0; i < 13; i++) {
    const [s, t] = G(30 + i * 5, 29.4);
    gripCuts.push(box([s, t, 0], [2.6, 1.6, 40], { r: 0, rot: [-RAKE / DEG, 0, 0] }));
  }
  // backstrap ribs
  for (let i = 0; i < 12; i++) {
    const [s, t] = G(32 + i * 5, -29.0);
    gripCuts.push(box([s, t, 0], [2.6, 1.6, 40], { r: 0, rot: [-RAKE / DEG, 0, 0] }));
  }
  grip = cutG('grip', grip, [gripCuts]);
  g.add(grip, 'rubber');
  // stippled grip panels (raised 0.7 mm) and a tan anodised medallion above them
  const panel = profile([G(31, -21.5, 5), G(91, -21.5, 6), G(91, 22.5, 6), G(31, 22.5, 5)], { w: 2.6, cw: 15.6, bevel: 1.0, bevelSeg: 3, curveSeg: 6 });
  g.add(merge([panel, mirrorW(panel)]), 'polymer_grip');
  for (const side of [1, -1]) {
    const [s, t] = G(21.5, -1.5);
    g.add(lathe([[0, 0], [0, 5.6], [0.5, 5.6], [1.0, 5.0], [1.0, 0]], { seg: 28 }).rotateY(side > 0 ? -Math.PI / 2 : Math.PI / 2).translate(side * 15.6, t, -s), 'alu_tan');
    // stylised hawk-wing chevron emblem
    const em = [[-4.0, 1.4, 0.3], [-0.6, -2.6, 0.3], [0.6, -2.6, 0.3], [4.0, 1.4, 0.3], [2.6, 2.2, 0.3], [0, -0.4, 0.3], [-2.6, 2.2, 0.3]].map(([a, b, r]) => [s + a, t + b, r]);
    g.add(profile(em, { w: 0.8, cw: side * 16.65, bevel: 0.2, curveSeg: 2 }), 'steel_dark');
    g.add(cyl(0, 0.8, 0.9, { seg: 10, b: 0.2 }).rotateY(side > 0 ? -Math.PI / 2 : Math.PI / 2).translate(side * 16.25, t + 2.6, -s), 'steel_dark');
  }

  // ======================================================================================== HAMMER
  const HP = [4, -20.5];                 // hammer pin (in the frame, just under the slide)
  const FALL = 20;                         // modelled cocked; fires by rotating FALL deg forward about the pin
  const hammer = g.part('hammer', { pivot: [HP[0], HP[1], 0], extras: { fall: -FALL, axis: 'x' } });
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
  hammer.add(ham, 'steel_dark');

  // ======================================================================================== TRIGGER
  const TP = [96, -21];
  const trig = g.part('trigger', { pivot: [TP[0], TP[1], 0], extras: { pull: 12, axis: 'w' } });
  trig.add(profile('M 93 -18 L 99 -18 Q 101.5 -28 100.2 -36 Q 99.2 -46 95.0 -53.4 Q 93.2 -54.6 92.4 -53 Q 95.0 -44 94.2 -36 Q 93.4 -30 90.6 -26 Z', { w: 7.2, bevel: 1.0, curveSeg: 12 }), 'steel_dark');

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
  mag.add(mb, 'steel_bright');
  // feed lips
  for (const w of [1, -1]) mag.add(profile([[33, -17, 1], [70, -17, 1], [66, -11.6, 1.5], [35, -11.6, 1.5]], { w: 1.4, cw: w * 6.6, bevel: 0.4 }), 'steel_bright');
  // top cartridge: .50 case + jacketed hollow point
  mag.add(lathe([[33.2, 0], [33.2, 6.9], [34.6, 6.9], [35.0, 5.9], [36.4, 5.9], [36.8, 6.75], [65.6, 6.6], [65.6, 0]], { t: -10.2, seg: 26 }), 'brass');
  mag.add(lathe([[65.4, 0], [65.4, 6.38], [70.8, 5.2], [73.2, 3.3], [73.6, 2.4], [72.2, 1.2], [72.2, 0]], { t: -10.2, seg: 26 }), 'copper');
  // floor plate with front finger lip (tan accent)
  mag.add(profile([G(97.4, -24.6, 1.5), G(97.4, 25.4, 1.2), G(98.2, 28.2, 2), G(102.6, 28.2, 2), G(102.6, -25.4, 2), G(99.6, -25.8, 1.5)], { w: 22, bevel: 1.2, curveSeg: 6 }), 'alu_tan');

  // ======================================================================================== SOCKETS
  g.socket('muzzle', [MZ, 0, 0]);
  g.socket('eject', [108, 6, 14], { dir: [-0.15, 0.55, 1] });
  g.socket('grip_r', [...G(42, -2), 0], { rot: [0, 0, -18] });
  g.socket('grip_l', [...G(76, 6), -12]);
  g.socket('magwell', [...G(101, 0), 0]);
  g.socket('charge', [41, 0, 0]);
  g.socket('sight_rear', [8, 26.4, 0]);
  g.socket('sight_front', [248, 26.6, 0]);
  g.meta({
    grip: 'pistol', support: 'pistol_cup', reload: 'mag_pistol', chargeSide: 'rear',
    notes: 'Slide travels 40 mm. Hammer modelled cocked; on fire rotate it by extras.fall deg about w (forward), '
      + 're-cock as the slide returns. Trigger rotates back by extras.pull deg about its pin. Magazine drops along '
      + 'extras.dir (grip axis, s/t mm-space direction). Overhand rack on the rear serrations.',
  });
  return g;
}
