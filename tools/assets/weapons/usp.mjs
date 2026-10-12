// 執法者 Warden .45 — USP-pattern .45 service pistol: polymer frame with accessory-rail grooves, matte steel
// slide, external spur hammer, ambidextrous control lever (safety / decocker), 12-round double-stack magazine.
// Side view, mm: s forward from the slide's rear face, t up from the bore axis, w right (ejection-port side).
// Reference: overall length 200 (hammer spur -> muzzle), barrel 112, height 136 (rear sight -> floorplate),
// width 32 (levers), grip / magazine rake 19 deg.
import * as THREE from 'three';
import {
  Gun, V, DEG, makeShape, profile, plan, section, lathe, cyl, box, screw, cut, cutters, merge, xform, mirrorW, circle,
} from '../lib/gunkit.mjs';

const DBG = !!process.env.USP_DEBUG;
const triCount = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
/** cut() with optional cost logging (USP_DEBUG=1) */
function cutx(label, a, list) {
  const t0 = Date.now();
  const r = cut(a, list);
  if (DBG) console.log(`  cut ${label.padEnd(18)} ${triCount(a)} -> ${triCount(r)} tris  ${Date.now() - t0} ms`);
  return r;
}

// ------------------------------------------------------------------------------------------ layout
const RAKE = 19;                       // grip / magazine rake from vertical (deg)
const PIV = [63, -20, 0];              // magazine seat: top centre of the mag body
const CR = Math.cos(RAKE * DEG), SR = Math.sin(RAKE * DEG);
/** magazine frame (u across the mag towards the muzzle, v up the mag axis) -> side view [s, t] */
const G = (u, v) => [PIV[0] + u * CR + v * SR, PIV[1] - u * SR + v * CR];
/** geometry authored upright around PIV (s = 63 + u, t = -20 + v) -> raked into the grip */
const tilt = (geo) => xform(geo, { rot: [-RAKE, 0, 0], pivot: PIV });

const SW = 13.2;     // slide half width
const SB = -21;      // slide bottom
const ST = 12;       // slide top flat
const MUZ = 190;     // slide front face
const FW = 12.8;     // frame half width under the slide
const FT = -21.4;    // frame top (0.4 mm seam under the slide)

// grip lines (front strap u = +21.5, back strap u = -34) and the bottom (v = -90, square to the rake)
const TOE = G(21.5, -90), HEEL = G(-34, -90);
const frontAt = (t) => TOE[0] + (t - TOE[1]) * (SR / CR);
const backAt = (t) => HEEL[0] + (t - HEEL[1]) * (SR / CR);

// ------------------------------------------------------------------------------------------ helpers
/**
 * Kit workaround: gunkit.mirrorW() negates normal.x after geo.scale(-1,1,1) already did, so mirrored parts end up with
 * inward-facing side normals (wrong shading + wrong AO rays). Flip them back here.
 */
function mirror(geo) {
  const m = mirrorW(geo);
  const n = m.attributes.normal;
  if (n) for (let i = 0; i < n.count; i++) n.setX(i, -n.getX(i));
  return m;
}
/** chamfered disc (pin / axle head) facing +w or -w */
function pin(s, t, w, r, h = 0.5, seg = 18) {
  const g = lathe([[0, 0], [0, r], [h * 0.6, r * 0.92], [h, r * 0.7], [h, 0]], { seg });
  g.rotateY(w >= 0 ? -Math.PI / 2 : Math.PI / 2);
  const c = V(s, t, w);
  return g.translate(c.x, c.y, c.z);
}

/** half-space cutter: removes everything on `side` (+1 = left of p0->p1, i.e. above a forward line) */
function planeCut(p0, p1, side = 1, size = 300) {
  const th = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
  const n = [-Math.sin(th) * side, Math.cos(th) * side];
  const m = [(p0[0] + p1[0]) / 2 + n[0] * size / 2, (p0[1] + p1[1]) / 2 + n[1] * size / 2];
  return box([m[0], m[1], 0], [size, size, size], { r: 0, rot: [th / DEG, 0, 0] });
}

/** edge-chamfer cutter for an opening in a side face at w0: outline grown by b, beveled b into the face */
function sideChamfer(pts, w0, b = 0.8, X = 6) {
  return profile(pts, { w: 2 * X, cw: w0 + Math.sign(w0) * (X - b), bevel: b, bevelSeg: 1, curveSeg: 6 });
}

// Tiny stroke font (4 x 6 units) for laser-etched markings.
const FONT = {
  A: [[0, 0, 2, 6], [2, 6, 4, 0], [0.9, 2.4, 3.1, 2.4]],
  C: [[4, 6, 1, 6], [1, 6, 0, 5], [0, 5, 0, 1], [0, 1, 1, 0], [1, 0, 4, 0]],
  D: [[0, 0, 0, 6], [0, 6, 2.8, 6], [2.8, 6, 4, 4.8], [4, 4.8, 4, 1.2], [4, 1.2, 2.8, 0], [2.8, 0, 0, 0]],
  E: [[0, 0, 0, 6], [0, 6, 4, 6], [0, 3, 3, 3], [0, 0, 4, 0]],
  F: [[0, 0, 0, 6], [0, 6, 4, 6], [0, 3, 3, 3]],
  I: [[2, 0, 2, 6], [1, 0, 3, 0], [1, 6, 3, 6]],
  L: [[0, 6, 0, 0], [0, 0, 4, 0]],
  M: [[0, 0, 0, 6], [0, 6, 2, 3], [2, 3, 4, 6], [4, 6, 4, 0]],
  N: [[0, 0, 0, 6], [0, 6, 4, 0], [4, 0, 4, 6]],
  O: [[1, 0, 3, 0], [3, 0, 4, 1], [4, 1, 4, 5], [4, 5, 3, 6], [3, 6, 1, 6], [1, 6, 0, 5], [0, 5, 0, 1], [0, 1, 1, 0]],
  P: [[0, 0, 0, 6], [0, 6, 3, 6], [3, 6, 4, 5], [4, 5, 4, 4], [4, 4, 3, 3], [3, 3, 0, 3]],
  R: [[0, 0, 0, 6], [0, 6, 3, 6], [3, 6, 4, 5], [4, 5, 4, 4], [4, 4, 3, 3], [3, 3, 0, 3], [2, 3, 4, 0]],
  S: [[4, 6, 1, 6], [1, 6, 0, 5], [0, 5, 0, 4], [0, 4, 1, 3], [1, 3, 3, 3], [3, 3, 4, 2], [4, 2, 4, 1], [4, 1, 3, 0], [3, 0, 0, 0]],
  T: [[0, 6, 4, 6], [2, 6, 2, 0]],
  U: [[0, 6, 0, 1], [0, 1, 1, 0], [1, 0, 3, 0], [3, 0, 4, 1], [4, 1, 4, 6]],
  W: [[0, 6, 0.8, 0], [0.8, 0, 2, 4], [2, 4, 3.2, 0], [3.2, 0, 4, 6]],
  0: [[1, 0, 3, 0], [3, 0, 4, 1], [4, 1, 4, 5], [4, 5, 3, 6], [3, 6, 1, 6], [1, 6, 0, 5], [0, 5, 0, 1], [0, 1, 1, 0]],
  1: [[1, 5, 2, 6], [2, 6, 2, 0], [1, 0, 3, 0]],
  2: [[0, 5, 1, 6], [1, 6, 3, 6], [3, 6, 4, 5], [4, 5, 4, 4], [4, 4, 0, 0], [0, 0, 4, 0]],
  3: [[0, 6, 4, 6], [4, 6, 4, 0], [1.2, 3, 4, 3], [0, 0, 4, 0]],
  4: [[3, 0, 3, 6], [3, 6, 0, 2], [0, 2, 4, 2]],
  5: [[4, 6, 0, 6], [0, 6, 0, 3.4], [0, 3.4, 3, 3.4], [3, 3.4, 4, 2.4], [4, 2.4, 4, 1], [4, 1, 3, 0], [3, 0, 0, 0]],
  6: [[4, 6, 1, 6], [1, 6, 0, 5], [0, 5, 0, 0], [0, 0, 4, 0], [4, 0, 4, 3], [4, 3, 0, 3]],
  7: [[0, 6, 4, 6], [4, 6, 1.5, 0]],
  8: [[0, 0, 4, 0], [4, 0, 4, 6], [4, 6, 0, 6], [0, 6, 0, 0], [0, 3, 4, 3]],
  9: [[0, 0, 3, 0], [3, 0, 4, 1], [4, 1, 4, 6], [4, 6, 0, 6], [0, 6, 0, 3], [0, 3, 4, 3]],
  '-': [[1, 3, 3, 3]],
  '.': [[2, 0, 2, 0]],
};
const advance = (ch) => (ch === ' ' ? 3.2 : ch === '.' ? 3.4 : 5.6);

/** One stroke: a thin box spanning p1..p2 (gun mm) sunk into a face with outward normal n, standing `raise` proud. */
function strokeBox(p1, p2, n, X, sw, raise, sink) {
  const A = V(...p1), B = V(...p2);
  const d = B.clone().sub(A);
  const len = d.length();
  const a = len > 1e-6 ? d.clone().normalize() : V(...X).normalize();
  const nn = V(...n).normalize();
  const b = new THREE.Vector3().crossVectors(a, nn);
  const geo = new THREE.BoxGeometry(len + sw, raise + sink, sw);
  geo.applyMatrix4(new THREE.Matrix4().makeBasis(a, nn, b));
  const c = A.clone().add(B).multiplyScalar(0.5).addScaledVector(nn, (raise - sink) / 2);
  geo.translate(c.x, c.y, c.z);
  return geo;
}

/**
 * Laser-etched marking: strokes inlaid flush (a few hundredths proud) in a contrasting material.
 * o = bottom-left of the first glyph, X = reading direction, Y = glyph up, n = face normal (all [s,t,w]).
 */
function etch(text, { o, X, Y, n, h = 4, sw, raise = 0.04 }) {
  const k = h / 6;
  sw = sw || Math.max(0.26, 0.75 * k);
  const out = [];
  let x = 0, i = 0;
  const P = (gx, gy) => [0, 1, 2].map((j) => o[j] + (x + gx) * k * X[j] + gy * k * Y[j]);
  for (const ch of text) {
    const gl = FONT[ch];
    if (gl) for (const [x1, y1, x2, y2] of gl) out.push(strokeBox(P(x1, y1), P(x2, y2), n, X, sw, raise + (i++ % 4) * 0.01, 0.3));
    x += advance(ch);
  }
  return merge(out);
}

/** 4-triangle pyramid (checkering diamond) at [s,t,w]; N/A/B are three-space unit vectors with A x B = N. */
const FACES = {
  w: [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
  '-w': [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  s: [[0, 0, -1], [0, 1, 0], [1, 0, 0]],
  '-s': [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
};
function diamond(s, t, w, dir, r = 1.15, hgt = 0.5) {
  const [N, A, B] = FACES[dir].map((v) => new THREE.Vector3(...v));
  const c = V(s, t, w);
  const ap = c.clone().addScaledVector(N, hgt);
  const b = [A, B, A.clone().negate(), B.clone().negate()].map((d) => c.clone().addScaledVector(d, r));
  const pos = [];
  for (let i = 0; i < 4; i++) pos.push(...b[i].toArray(), ...b[(i + 1) % 4].toArray(), ...ap.toArray());
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

/** small raised ridges on a flat face (thumb-pad serrations): boxes across `along` */
function ridges(list, size, n) {
  return merge(list.map(([s, t, w]) => box([s, t, w], size, { r: 0.18, seg: 1 })));
}

function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function distToPoly(p, poly) {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j], [bx, by] = poly[i];
    const dx = bx - ax, dy = by - ay;
    const u = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy)));
    d = Math.min(d, Math.hypot(p[0] - ax - u * dx, p[1] - ay - u * dy));
  }
  return d;
}

// ------------------------------------------------------------------------------------------ build
export default function build() {
  const g = new Gun('usp');

  // ======================================================================================== SLIDE
  const slide = g.part('slide', { pivot: [0, 0, 0], extras: { travel: 0.03 } });
  const slideXS = [[-SW, SB, 0.9], [SW, SB, 0.9], [SW, 4.6, 2.6], [7.6, ST, 1.9], [-7.6, ST, 1.9], [-SW, 4.6, 2.6]];
  let sl = section(slideXS, 0, MUZ, { bevel: 1.1, bevelSeg: 2, curveSeg: 8 });

  // nose: top and lower chamfers, plus side chamfers seen from above
  sl = cutx('nose', sl, [planeCut([179.5, ST + 0.8], [191, 8.4], 1), planeCut([185.2, SB - 0.6], [191, -15.6], -1)]);
  for (const sg of [1, -1]) {
    const big = new THREE.BoxGeometry(300, 300, 300).translate(sg * 150, 0, 0);
    big.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.atan2(1.5 * sg, 8.5)));
    const p = V(182.5, 0, sg * SW);
    sl = cutx('nose side', sl, [big.translate(p.x, p.y, p.z)]);
  }
  // ejection port: right side + top, radiused corners, chamfered rims
  const PS0 = 80, PS1 = 126, PT0 = -2.2, PWL = -7.6;
  const portBox = box([(PS0 + PS1) / 2, 16, (PWL + 30) / 2], [PS1 - PS0, 36.4, 30 - PWL], { r: 1.6, seg: 3 });
  const portSide = sideChamfer([[PS0 - 0.8, PT0 - 0.8, 2.4], [PS1 + 0.8, PT0 - 0.8, 2.4], [PS1 + 0.8, 30, 0], [PS0 - 0.8, 30, 0]], SW, 0.8);
  const portTop = plan([[PS0 - 0.7, PWL - 0.7, 2.3], [PS1 + 0.7, PWL - 0.7, 2.3], [PS1 + 0.7, 30, 0], [PS0 - 0.7, 30, 0]],
    { h: 12, ct: ST - 0.7 + 6, bevel: 0.7, bevelSeg: 1, curveSeg: 6 });
  // serration pockets (filled by the toothed inserts below)
  const SR0 = 6.3, SR1 = 32.7, SRT = 2.0;
  sl = cutx('port+bores', sl, [
    portBox, portSide, portTop,
    cyl(70, 186, 10, { t: 0, b: 0, seg: 28 }),                             // barrel channel
    cyl(183, 196, 8.95, { t: 0, b: 0, seg: 28 }),                          // muzzle bushing bore
    cutters.box([70, -13.5, 0], [112, 19, 18]),                            // hollow underside (s 14..126, w ±9)
    cyl(120, 186, 5.1, { t: -14, b: 0, seg: 16 }),                         // recoil spring channel
    cyl(183, 196, 3.9, { t: -14, b: 0, seg: 16 }),                         // guide rod hole
  ]);
  sl = cutx('details', sl, [
    box([1.6, -10, 0], [8.4, 24.4, 9.2], { r: 1.2, seg: 2 }),              // hammer notch (s -2.6..5.8)
    cutters.box([(SR0 + SR1) / 2, (SRT - 23) / 2, SW + 4.1], [SR1 - SR0, SRT + 23, 10]),
    cutters.box([(SR0 + SR1) / 2, (SRT - 23) / 2, -SW - 4.1], [SR1 - SR0, SRT + 23, 10]),
    cutters.pocketW([[55.2, -1.6, 1.8], [80.4, -1.6, 0], [80.4, 4.9, 0], [55.2, 4.9, 1.8]], SW - 1.2, 10), // extractor pocket
    box([100, -19.4, -12.55], [10.5, 5.2, 5.9], { r: 0.8, seg: 2 }),       // slide-stop notch (left)
    cutters.box([9.6, 12.4, 0], [9.2, 3.6, 44]),                           // rear sight dovetail
    cutters.box([175.3, 12.4, 0], [6.8, 3.6, 44]),                         // front sight dovetail
  ]);
  slide.add(sl, 'steel');
  // toothed serration inserts (V grooves, 10 per side)
  const tp = [[SR0, SW - 1.2], [SR0, SW]];
  for (let i = 0; i < 10; i++) { const c = 7.6 + i * 2.6; tp.push([c - 0.85, SW], [c, SW - 0.88], [c + 0.85, SW]); }
  tp.push([SR1, SW], [SR1, SW - 1.2]);
  const teeth = plan(tp, { h: SRT - SB, ct: (SRT + SB) / 2, bevel: 0.3, bevelSeg: 1 });
  slide.add(merge([teeth, mirror(teeth)]), 'steel');
  // roll marks (laser etched): left side model name, right side caliber
  slide.add(etch('WARDEN .45', { o: [167, -12.4, -SW], X: [-1, 0, 0], Y: [0, 1, 0], n: [0, 0, -1], h: 4.4 }), 'steel_bright');
  slide.add(etch('CAL.45', { o: [150, -17.6, SW], X: [1, 0, 0], Y: [0, 1, 0], n: [0, 0, 1], h: 2.2, sw: 0.3 }), 'steel_bright');

  // rear sight: dovetail base + body with square notch and two white dots
  const dovetail = (s0, s1) => section([[-8.55, 10.75, 0.2], [8.55, 10.75, 0.2], [7.5, 12.15, 0.2], [-7.5, 12.15, 0.2]], s0, s1, { bevel: 0.25, curveSeg: 2 });
  slide.add(dovetail(5.3, 13.9), 'steel_dark');
  let rs = profile([[4, 11.9, 0.3], [15.4, 11.9, 0.3], [15.4, 15.2, 1.4], [11.6, 18.6, 1.0], [4.6, 19, 0.5], [4, 18.4, 0.4]], { w: 14.4, bevel: 0.6, curveSeg: 4 });
  rs = cutx('rear sight', rs, [box([9.6, 20, 0], [16, 8, 3.9], { r: 0.25, seg: 1 })]);   // notch, bottom at t = 16
  slide.add(rs, 'steel_dark');
  for (const w of [-4.7, 4.7]) slide.add(cyl(3.82, 4.5, 0.95, { t: 14.4, w, seg: 16, b: 0.15 }), 'paint_white');
  slide.add(screw([10.2, 15.0, 7.2], 1.0, { face: 'w', depth: 0.45 }), 'steel_dark');      // windage set screw

  // front sight: dovetail base + post with white dot
  slide.add(dovetail(172.2, 178.4), 'steel_dark');
  slide.add(profile([[171.6, 11.9, 0.3], [179, 11.9, 0.3], [179, 13.2, 1.4], [173.6, 16, 0.5], [171.6, 16, 0.4]], { w: 3.3, bevel: 0.45, curveSeg: 4 }), 'steel_dark');
  slide.add(cyl(171.4, 172.1, 0.85, { t: 14.4, w: 0, seg: 16, b: 0.12 }), 'paint_white');

  // extractor (right side) with its pin; firing-pin tip and bushing in the hammer notch
  slide.add(profile([[55.8, -1.0, 1.6], [79.6, -1.0, 0.5], [80.9, 0.4, 0.4], [80.9, 4.3, 0.4], [55.8, 4.3, 1.6]], { w: 2.0, cw: SW - 0.75, bevel: 0.45, curveSeg: 4 }), 'steel');
  slide.add(pin(60.5, 1.65, SW + 0.25, 1.2, 0.35, 14), 'steel_dark');
  slide.add(cyl(5.2, 6.4, 1.5, { t: 0, seg: 16, b: 0.25 }), 'steel_bright');
  slide.add(cyl(5.6, 6.2, 3.1, { t: 0, seg: 20, b: 0.2 }), 'steel_dark');

  // ======================================================================================== BARREL & GUIDE ROD (static)
  g.add(lathe([[78.4, 0], [78.4, 9.0], [78.9, 9.4], [107, 9.4], [111, 8.6], [188.9, 8.6], [189.4, 8.1], [189.4, 7.0],
    [189.0, 6.4], [188.5, 5.72], [150, 5.72], [150, 0]], { seg: 36 }), 'steel_bright');
  g.add(box([102, 6.2, 0], [47.2, 11.0, 13.8], { r: 0.7, seg: 2 }), 'steel_bright');    // chamber hood
  g.add(etch('45 AUTO', { o: [91.5, 11.7, 1.25], X: [1, 0, 0], Y: [0, 0, -1], n: [0, 1, 0], h: 2.5, sw: 0.32 }), 'steel_dark');
  g.add(lathe([[118, 0], [118, 3.4], [189.2, 3.4], [189.8, 2.8], [189.8, 1.3], [189.3, 1.0], [189.3, 0]], { t: -14, seg: 18 }), 'steel_dark');

  // steel frame-rail inserts riding inside the slide (visible through the port when the slide is back)
  for (const sg of [1, -1]) g.add(section([[sg * 7.3, -21.6, 0.3], [sg * 8.85, -21.6, 0.3], [sg * 8.85, -18.6, 0.4], [sg * 7.3, -18.6, 0.4]], 8, 124, { bevel: 0.3, curveSeg: 2 }), 'steel_dark');

  // ======================================================================================== FRAME (polymer)
  const magwell = tilt(cutters.box([63, -55, 0], [37.2, 130, 24]));
  const magwellLow = tilt(cutters.box([63, -75, 0], [37.2, 90, 24]));       // full width only below the frame rails
  const magTop = cutters.box([63, -27, 0], [37.2, 12, 19.2]);              // narrow clearance for the feed lips
  const flare = tilt(plan([[63 - 20.2, -13.6, 2.5], [63 + 20.2, -13.6, 2.5], [63 + 20.2, 13.6, 2.5], [63 - 20.2, 13.6, 2.5]],
    { h: 20, ct: -110 + 1.6 - 10, bevel: 1.6, bevelSeg: 1, curveSeg: 4 }));

  // upper frame: tang, rails region under the slide, dust cover with rail grooves
  let fr = profile([[-4, FT, 2], [183.6, FT, 0.8], [185.4, -24, 1.5], [181.6, -37.6, 2.5], [76, -37.6, 0], [70, -36, 0],
    [18, -36, 0], [8, -32, 5], [-9.4, -29.6, 3.2], [-10, -23.6, 3]], { w: 2 * FW, bevel: 1.6, bevelSeg: 2, curveSeg: 8 });
  const groove = (sg) => cutters.pocketW([[126, -34.2, 1.6], [200, -34.2, 0], [200, -30.2, 0], [126, -30.2, 1.6]], sg * (FW - 1.8), 10);
  fr = cutx('frame', fr, [
    cutters.box([-1.5, -26, 0], [21, 12.4, 8.6]),                          // hammer slot
    cutters.box([93, -36, 0], [12, 8.4, 7.4]),                             // trigger slot
    magwellLow, magTop,
    groove(1), groove(-1),
    cutters.box([152, -37.6, 0], [4, 3, 40]),                              // rail cross slots
    cutters.box([166, -37.6, 0], [4, 3, 40]),
  ]);
  g.add(fr, 'polymer');

  // grip (wider, heavily rounded) with a flared magwell and a lanyard slot
  const gripPts = [[10, -32, 1], [frontAt(-32), -32, 1], [...G(23.9, -50), 40], [TOE[0], TOE[1], 4], [HEEL[0], HEEL[1], 8],
    [...G(-38.4, -66), 40], [backAt(-42), -42, 14], [13, -33.5, 3]];
  let grip = profile(gripPts, { w: 30, bevel: 2.8, bevelSeg: 3, curveSeg: 10 });
  grip = cutx('grip', grip, [magwell, flare, cutters.box([backAt(-92) + 1, -92, 0], [6, 3.2, 40])]);
  g.add(grip, 'polymer');
  g.add(cyl(-6, 6, 1.1, { seg: 12 }).rotateY(Math.PI / 2).translate(0, -92, -(backAt(-92) + 1.5)), 'steel_dark'); // lanyard pin

  // trigger guard (U), squared front with serrations
  let guard = profile([[66, -30, 0], [131.8, -30, 0], [131.8, -40, 2.5], [129.8, -55, 6], [119, -60, 8], [86, -59.8, 6], [74, -58, 5], [66, -50, 0]], {
    w: 9.6, bevel: 1.6, bevelSeg: 2, curveSeg: 8,
    holes: [[[74, -36.6, 0], [123.5, -36.6, 0], [124.2, -41, 2], [122.4, -50.5, 4.5], [114, -53.4, 5], [80, -53, 4], [73, -50, 0]]],
  });
  guard = cutx('guard', guard, [magwell, merge([-43, -45.6, -48.2, -50.8].map((t) => cutters.box([131.8 - (-40 - t) * (2 / 15), t, 0], [1.6, 1.1, 14])))]);
  g.add(guard, 'polymer');

  // grip panels: slightly raised, stippled, with checkering diamonds
  const panel = [G(-29, -26.9), G(16.5, -11.2), G(16.5, -85), G(-29, -85)];
  g.add(profile(panel.map(([s, t]) => [s, t, 4]), { w: 31, bevel: 0.5, bevelSeg: 1, curveSeg: 6 }), 'polymer_grip');
  const dia = [];
  for (let u = -27.5; u <= 15.5; u += 2.7) {
    for (let v = -12; v >= -86; v -= 2.7) {
      const p = G(u, v);
      if (!pointInPoly(p, panel) || distToPoly(p, panel) < 2.4) continue;
      dia.push(diamond(63 + u, -20 + v, 15.48, 'w'), diamond(63 + u, -20 + v, -15.48, '-w'));
    }
  }
  // front / back strap checkering follows the curved straps: intersect each row (v = const) with the grip outline
  const gripPoly = makeShape(gripPts).getPoints(24).map((p) => [p.x, p.y]);
  const stripU = (v) => {
    const O = G(0, v), D = [CR, -SR];
    let lo = Infinity, hi = -Infinity;
    for (let i = 0, j = gripPoly.length - 1; i < gripPoly.length; j = i++) {
      const [ax, ay] = gripPoly[j], [bx, by] = gripPoly[i];
      const ex = bx - ax, ey = by - ay, det = D[0] * -ey - D[1] * -ex;
      if (Math.abs(det) < 1e-9) continue;
      const rx = ax - O[0], ry = ay - O[1];
      const u = (rx * -ey - ry * -ex) / det, lam = (D[0] * ry - D[1] * rx) / det;
      if (lam >= 0 && lam <= 1) { lo = Math.min(lo, u); hi = Math.max(hi, u); }
    }
    return [lo, hi];
  };
  for (let v = -37; v >= -85; v -= 2.7) { const u = stripU(v)[1]; for (let w = -9; w <= 9.01; w += 2.6) dia.push(diamond(63 + u - 0.03, -20 + v, w, 's')); }
  for (let v = -45; v >= -82; v -= 2.7) { const u = stripU(v)[0]; for (let w = -9; w <= 9.01; w += 2.6) dia.push(diamond(63 + u + 0.03, -20 + v, w, '-s')); }
  g.add(tilt(merge(dia)), 'polymer_grip');

  // pins
  for (const w of [FW, -FW]) g.add(pin(91, -31, w, 1.5), 'steel_dark');      // trigger pin
  g.add(pin(112, -27.2, FW, 1.9), 'steel_dark');                            // slide-stop axle end (right)
  for (const w of [FW, -FW]) g.add(pin(128, -27.4, w, 1.3), 'steel_dark');  // locking insert pin
  for (const w of [FW, -FW]) g.add(pin(17, -27.6, w, 1.25), 'steel_dark');  // rear insert pin

  // serial plate (right side of the dust cover) — steel insert moulded into the polymer, etched number
  g.add(profile([[139, -28.2, 0.6], [161, -28.2, 0.6], [161, -23.6, 0.6], [139, -23.6, 0.6]], { w: 0.8, cw: FW - 0.15, bevel: 0.2, bevelSeg: 1, curveSeg: 3 }), 'steel_bright');
  g.add(etch('WD0451', { o: [141.4, -27.1, FW + 0.25], X: [1, 0, 0], Y: [0, 1, 0], n: [0, 0, 1], h: 2.3, sw: 0.3 }), 'steel_dark');

  // slide stop (left): axle hub, arm, serrated thumb pad
  g.add(pin(112, -27.2, -FW, 3.8, 1.6), 'steel_dark');
  g.add(profile([[115, -23.4, 2], [78, -22.8, 1.5], [66, -23, 2], [62.5, -25, 2], [63, -29.4, 2], [74, -29.6, 2], [108, -30.8, 3], [115.5, -30, 3]],
    { w: 1.6, cw: -(FW + 0.8), bevel: 0.5, curveSeg: 5 }), 'steel_dark');
  g.add(profile([[62.4, -22.6, 1.6], [75, -22.6, 1.6], [75, -29.8, 1.6], [62.6, -29.6, 1.6]], { w: 2.6, cw: -(FW + 1.9), bevel: 0.7, curveSeg: 4 }), 'steel_dark');
  g.add(ridges([0, 1, 2, 3].map((i) => [65 + i * 2.5, -26.2, -(FW + 3.2)]), [0.9, 5.2, 0.6]), 'steel_dark');

  // magazine release: ambidextrous paddle under the rear of the trigger guard
  g.add(plan([[70, -9.4, 1.6], [80.5, -9.0, 2], [83, -5.2, 1.5], [83, 5.2, 1.5], [80.5, 9.0, 2], [70, 9.4, 1.6]], { h: 3.0, ct: -58.4, bevel: 0.8, curveSeg: 4 }), 'polymer');

  // ======================================================================================== TRIGGER
  const trig = g.part('trigger', { pivot: [91, -31, 0] });
  trig.add(profile('M 88.6 -30 L 95 -30 Q 94 -42 97.6 -51.6 Q 97.6 -53.6 95.6 -53.3 Q 89.4 -47 88.4 -38 Z', { w: 6.4, bevel: 1.3, bevelSeg: 3, curveSeg: 10 }), 'polymer');

  // ======================================================================================== HAMMER (decocked / forward)
  const ham = g.part('hammer', { pivot: [2, -26, 0] });
  let hm = profile([[-3.6, -30.6, 3], [7, -30.6, 3], [6.8, -23, 1.5], [5.0, -20.6, 0.4], [5.0, 1.4, 0.6], [-0.3, 1.8, 0.6], [-0.6, 5.4, 1.5],
    [-3, 8.2, 2.6], [-7.8, 8.2, 2.8], [-10.2, 4.6, 2.2], [-9.2, -0.4, 2], [-4.4, -4.6, 3], [-4.6, -22, 1]], {
    w: 7.4, bevel: 0.8, bevelSeg: 2, curveSeg: 6, holes: [circle(-5.4, 3.4, 1.9)],
  });
  const hc = [-5.4, 3.4];
  hm = cutx('hammer', hm, [merge([70, 92, 114, 136, 158].map((a) =>
    box([hc[0] + 5.0 * Math.cos(a * DEG), hc[1] + 5.0 * Math.sin(a * DEG), 0], [0.9, 2.4, 10], { r: 0, rot: [a - 90, 0, 0] })))]);
  ham.add(hm, 'steel_dark');

  // ======================================================================================== CONTROL LEVER (selector: safe / fire / decock)
  const sel = g.part('selector', { pivot: [2, -26, 0] });
  const lever = [
    pin(2, -26, FW, 4.2, 1.8),
    profile([[2, -22.6, 1.5], [22, -23.2, 1.5], [22, -29.6, 1.5], [2, -29.8, 1.5]], { w: 1.8, cw: FW + 0.9, bevel: 0.5, curveSeg: 4 }),
    profile([[19, -22.3, 2], [31.6, -23.5, 2.2], [31, -30.2, 2.2], [19, -30, 2]], { w: 3.2, cw: FW + 1.6, bevel: 0.9, curveSeg: 5 }),
    ridges([0, 1, 2, 3].map((i) => [22 + i * 2.5, -26.3, FW + 3.2]), [0.9, 5.6, 0.6]),
    cyl(-0.5, 0.5, 1.2, { seg: 12 }).rotateY(Math.PI / 2).translate(FW + 1.8, -26, -2),   // axle boss
  ];
  const rightLever = merge(lever);
  sel.add(merge([rightLever, mirror(rightLever)]), 'steel_dark');

  // ======================================================================================== MAGAZINE (12 rd, double stack)
  const mag = g.part('mag', { pivot: PIV, extras: { drop: true, dropDir: [0, -CR, SR] } });
  const MW = 11.3;
  let mbody = profile([[45, -110.4, 1.2], [81, -110.4, 1.2], [81, -30, 2], [77, -27.6, 2], [45, -26, 1]], { w: 2 * MW, bevel: 1.1, curveSeg: 4 });
  mbody = cutx('mag', mbody, [merge([-46, -58, -70, -82].map((t) => cutters.holeS(t, 0, 1.4, 40, 48.2)))]);  // witness holes
  mag.add(tilt(mbody), 'steel_dark');
  const lip = section([[8.0, -19.4, 0.5], [MW, -20.8, 0.8], [MW, -27.2, 0], [MW - 1.1, -27.2, 0], [MW - 1.1, -21.6, 0.3], [8.0, -20.5, 0.3]], 45.4, 66, { bevel: 0.3, curveSeg: 4 });
  mag.add(tilt(merge([lip, mirror(lip)])), 'steel_dark');
  mag.add(tilt(profile([[43.4, -110.4, 1.5], [83.8, -110.4, 1.5], [83.8, -113.8, 2], [82.2, -115.5, 1.5], [45, -115.5, 1.5], [43.4, -114, 1.5]], { w: 27, bevel: 1.6, bevelSeg: 2, curveSeg: 5 })), 'polymer');
  // top cartridge (.45 ACP, rimless) riding on the right lip
  const cw0 = 3.4, ct0 = -19.2;
  mag.add(tilt(lathe([[45.7, 0], [45.7, 5.5], [46.1, 6.05], [46.9, 6.05], [47.1, 5.1], [48.2, 5.1], [48.6, 6.0], [68.4, 6.0], [68.5, 5.75], [68.5, 0]], { t: ct0, w: cw0, seg: 20 })), 'brass');
  mag.add(tilt(lathe([[68.4, 0], [68.4, 5.72], [71, 5.72], [74, 5.15], [76.4, 3.9], [77.7, 2.3], [78.1, 0]], { t: ct0, w: cw0, seg: 20 })), 'copper');

  // ======================================================================================== SOCKETS / META
  g.socket('muzzle', [MUZ, 0, 0]);
  g.socket('eject', [103, 7, SW], { dir: [-0.15, 0.55, 1] });
  g.socket('grip_r', [...G(-6, -45), 0], { rot: [0, 0, -RAKE] });
  g.socket('grip_l', [...G(-4, -62), -12], { rot: [0, 0, -RAKE] });
  g.socket('magwell', [...G(0, -94), 0]);
  g.socket('charge', [18, 2, 0]);
  g.socket('sight_rear', [9.6, 16, 0]);
  g.socket('sight_front', [175.3, 16, 0]);
  g.meta({
    grip: 'pistol', support: 'pistol_cup', reload: 'mag_pistol', chargeSide: 'rear',
    notes: 'Hammer modelled decocked (forward); cock = rotate hammer ~+55 deg about local X (spur swings back), ' +
      'it falls forward on fire. Selector (ambi control lever) pivots on the hammer axis: safe = +12 deg, decock = -15 deg about local X, ' +
      'springs back to fire. Trigger: DA pull ~ -14 deg about local X (blade swings back). Slide travel 30 mm; barrel stays in the frame. ' +
      'Magazine drops along its 19 deg rake (extras.dropDir, three space).',
  });
  return g;
}
