// 草原 Steppe-47 — AKM-pattern 7.62x39 assault rifle, laminated wood furniture, plum magazine.
// Side view, mm: s forward from the rear face of the stamped receiver, t up from the bore axis,
// w right (ejection port / charging handle / selector side).
//
// Real reference (AKM): OAL 880 mm (butt plate -235 → compensator lip 646), barrel 415 mm (bolt face
// s=200 → crown 619.5), height ≈ 300 mm with the 30-round magazine (notch tab +49 → floor plate -252).
// Sight radius here is 368 mm (notch 224 → post 592; real 378): the leaf is kept short so it only
// overhangs the sight block by ~15 mm.
//
// Local helpers (loft, rpoly, ...) live in this file: the kit has no loft / variable-section sweep,
// which organic furniture (stock, grip, handguard swells, curved magazine) and the pressed receiver
// dimples need.
//
// Materials: the stamped sheet parts (receiver, dust cover, guard, selector, catch, retainers) want a
// mid-grey low-detail phosphate key and the furniture a laminate key; neither exists in MATS yet
// (see RECV / WOOD below), the closest existing keys are used until they do.
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';
import { Gun, DEG, profile, plan, section, lathe, cyl, tube, sweep, cut, intersect, cutters, merge, xform, mirrorW } from '../lib/gunkit.mjs';

// material keys
const RECV = 'steel';        // stamped / phosphated sheet (wanted: 'steel_phosphate')
const MACH = 'steel_blued';  // machined + blued: barrel, sight blocks, gas block, compensator, tangs, butt plate
const WOOD = 'wood';         // laminated red wood (wanted: 'wood_laminate')

// ------------------------------------------------------------------------------------ local helpers

const V3 = (s, t, w) => new THREE.Vector3(w, t, -s);
const lerp = (a, b, u) => a + (b - a) * u;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
/** Piecewise smooth curve through [[x, y], ...] (smoothstep between keys). */
function keys(x, list) {
  if (x <= list[0][0]) return list[0][1];
  for (let i = 1; i < list.length; i++) {
    if (x <= list[i][0]) { const [x0, y0] = list[i - 1], [x1, y1] = list[i]; return lerp(y0, y1, smooth((x - x0) / (x1 - x0))); }
  }
  return list[list.length - 1][1];
}

/** Rounded polygon sampler: [[x, y, r, k?]] -> [[x, y]]. Fixed count: 1 point per sharp corner, k+1 per fillet. */
function rpoly(pts, k = 3) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const [x, y, r = 0, kk = k] = pts[i];
    if (!r) { out.push([x, y]); continue; }
    const [px, py] = pts[(i - 1 + n) % n], [nx, ny] = pts[(i + 1) % n];
    const li = Math.hypot(x - px, y - py) || 1e-6, lo = Math.hypot(nx - x, ny - y) || 1e-6;
    const ri = Math.min(r, li * 0.5), ro = Math.min(r, lo * 0.5);
    const ax = x + ((px - x) / li) * ri, ay = y + ((py - y) / li) * ri;
    const bx = x + ((nx - x) / lo) * ro, by = y + ((ny - y) / lo) * ro;
    for (let j = 0; j <= kk; j++) {
      const u = j / kk, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
      out.push([a * ax + b * x + c * bx, a * ay + b * y + c * by]);
    }
  }
  return out;
}

/** Open path over a rounded top: right-bottom -> over the top -> left-bottom (w, t). */
function capPath(hw, tb, tt, r, k = 6) {
  const pts = [[hw, tb]];
  for (let i = 0; i <= k; i++) { const a = (i / k) * 90 * DEG; pts.push([hw - r + r * Math.cos(a), tt - r + r * Math.sin(a)]); }
  for (let i = 0; i <= k; i++) { const a = (90 + (i / k) * 90) * DEG; pts.push([-hw + r + r * Math.cos(a), tt - r + r * Math.sin(a)]); }
  pts.push([-hw, tb]);
  return pts;
}
/** Open path around a rounded bottom: right-top -> under the bottom -> left-top (w, t). */
function cupPath(hw, tt, tb, r, k = 5) {
  return capPath(hw, -tt, -tb, r, k).map(([w, t]) => [w, -t]);
}
/** Band between two open paths (outer, inner) -> closed polygon. */
const band = (outer, inner) => outer.concat(inner.slice().reverse());

/**
 * Loft through closed rings of [s, t, w] points (all rings the same count). Walls are oriented
 * outward automatically, end caps are ear-clipped in the ring's best-fit plane.
 */
function loft(rings, { caps = [true, true], crease = 52 } = {}) {
  const R = rings.map((r) => r.map(([s, t, w]) => V3(s, t, w)));
  const N = R[0].length;
  const pos = [];
  const cen = (ring) => ring.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / ring.length);
  const newell = (ring) => {
    const n = new THREE.Vector3();
    for (let j = 0; j < ring.length; j++) {
      const a = ring[j], b = ring[(j + 1) % ring.length];
      n.x += (a.y - b.y) * (a.z + b.z); n.y += (a.z - b.z) * (a.x + b.x); n.z += (a.x - b.x) * (a.y + b.y);
    }
    return n;
  };
  const push = (a, b, c) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  const c0 = cen(R[0]), c1 = cen(R[1]);
  const ccw = newell(R[0]).dot(c1.clone().sub(c0)) > 0;
  for (let i = 0; i < R.length - 1; i++) {
    const A = R[i], B = R[i + 1];
    for (let j = 0; j < N; j++) {
      const j2 = (j + 1) % N;
      if (ccw) { push(A[j], A[j2], B[j2]); push(A[j], B[j2], B[j]); }
      else { push(A[j], B[j2], A[j2]); push(A[j], B[j], B[j2]); }
    }
  }
  const cap = (ring, out) => {
    const c = cen(ring), n = newell(ring).normalize();
    const e1 = new THREE.Vector3(1, 0, 0);
    if (Math.abs(n.dot(e1)) > 0.9) e1.set(0, 1, 0);
    e1.sub(n.clone().multiplyScalar(n.dot(e1))).normalize();
    const e2 = n.clone().cross(e1);
    const p2 = ring.map((p) => { const d = p.clone().sub(c); return new THREE.Vector2(d.dot(e1), d.dot(e2)); });
    const tris = THREE.ShapeUtils.triangulateShape(p2, []);
    const ab = new THREE.Vector3(), ac = new THREE.Vector3();
    for (const [i0, i1, i2] of tris) {
      const a = ring[i0], b = ring[i1], cc = ring[i2];
      ab.subVectors(b, a); ac.subVectors(cc, a);
      if (ab.cross(ac).dot(out) >= 0) push(a, b, cc); else push(a, cc, b);
    }
  };
  if (caps[0]) cap(R[0], c0.clone().sub(c1));
  if (caps[1]) { const L = R.length; cap(R[L - 1], cen(R[L - 1]).sub(cen(R[L - 2]))); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return toCreasedNormals(geo, crease * DEG);
}

/** Lathe-made head (rivet, pin, button, knob) along +axis from `c`; prof = [[h, r], ...] from h = 0. */
function head(c, prof, axis = 'w', seg = 16) {
  const g = lathe(prof, { seg });
  if (axis === 'w') g.rotateY(-Math.PI / 2);
  else if (axis === '-w') g.rotateY(Math.PI / 2);
  else if (axis === 't') g.rotateX(Math.PI / 2);
  else if (axis === '-t') g.rotateX(-Math.PI / 2);
  else if (axis === '-s') g.rotateY(Math.PI);
  const v = V3(...c);
  g.translate(v.x, v.y, v.z);
  return g;
}
/** Cheap chamfered box centred at [s, t, w] (≈60 tris instead of RoundedBox's 300). rot = [deg about w, about t, about s]. */
function cbox(c, size, { r = 0.5, rot } = {}) {
  const [ls, lt, lw] = size;
  const rr = Math.max(0.05, Math.min(r, ls / 2 - 0.02, lt / 2 - 0.02, lw / 2 - 0.02));
  const s0 = -ls / 2, s1 = ls / 2, t0 = -lt / 2, t1 = lt / 2;
  const g = profile([[s0, t0, rr], [s1, t0, rr], [s1, t1, rr], [s0, t1, rr]], { w: lw, bevel: rr, bevelSeg: 1, curveSeg: 1 });
  if (rot) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG)));
  const v = V3(...c);
  g.translate(v.x, v.y, v.z);
  return g;
}
/** Plain box cutter centred at [s, t, w], optionally rotated about w (deg) — for stamped strokes. */
function boxCut(c, size, rotW = 0) {
  const g = new THREE.BoxGeometry(size[2], size[1], size[0]);
  if (rotW) g.rotateX(rotW * DEG);
  const v = V3(...c);
  g.translate(v.x, v.y, v.z);
  return g;
}
/** Low-poly cutter along w through everything (holes / slots). */
const holeW = (s, t, r, seg = 12, len = 200) => cyl(-len / 2, len / 2, r, { seg, b: 0 }).rotateY(Math.PI / 2).translate(0, t, -s);
const holeS = (t, w, r, s0, s1, seg = 14) => cyl(s0, s1, r, { t, w, seg, b: 0 });
/**
 * Pre-tessellates a small part so the AO / edge-wear bake (per vertex, 12 mm grid) gets interior
 * vertices: without them a part smaller than the bake grid is "all edge" and renders fully worn.
 */
function densify(geo, maxEdge = 3) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  g = new TessellateModifier(maxEdge, 8).modify(g);
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  return g;
}
/** profile() with economical defaults */
const prof = (pts, o = {}) => profile(pts, { curveSeg: 5, ...o });
const rivet = (c, r = 2.3, axis = 'w') => head(c, [[0, 0], [0, r], [0.4, r * 0.93], [0.85, r * 0.62], [1.05, 0]], axis, 9);
const pinHead = (c, r = 2.4, axis = 'w') => head(c, [[0, 0], [0, r], [0.55, r], [0.75, r - 0.3], [0.75, r * 0.4], [0.5, 0]], axis, 10);
/** near-flush pin end (under the selector lever's swing) */
const pinFlush = (c, r = 2.4, axis = 'w') => head(c, [[0, 0], [0, r], [0.3, r], [0.42, r - 0.25], [0.42, 0]], axis, 12);

/**
 * Tiny stroke font for stamped markings (original glyphs, 2 x 4 units, strokes as [x0, y0, x1, y1]).
 * Returns box cutters recessed `depth` into the sheet at w = wFace (side = ±1), glyph x running along `dirS`.
 */
const GLYPHS = {
  0: [[0, 0, 2, 0], [2, 0, 2, 4], [2, 4, 0, 4], [0, 4, 0, 0]],
  1: [[1.1, 0, 1.1, 4], [0.3, 3.2, 1.1, 4]],
  2: [[0, 4, 2, 4], [2, 4, 2, 2], [2, 2, 0, 2], [0, 2, 0, 0], [0, 0, 2, 0]],
  3: [[0, 4, 2, 4], [2, 4, 2, 0], [2, 0, 0, 0], [0.6, 2, 2, 2]],
  4: [[0, 4, 0, 1.6], [0, 1.6, 2, 1.6], [1.5, 3.2, 1.5, 0]],
  6: [[2, 4, 0, 4], [0, 4, 0, 0], [0, 0, 2, 0], [2, 0, 2, 2], [2, 2, 0, 2]],
  7: [[0, 4, 2, 4], [2, 4, 0.8, 0]],
  8: [[0, 0, 2, 0], [2, 0, 2, 4], [2, 4, 0, 4], [0, 4, 0, 0], [0, 2, 2, 2]],
  S: [[2, 4, 0, 4], [0, 4, 0, 2], [0, 2, 2, 2], [2, 2, 2, 0], [2, 0, 0, 0]],
  T: [[0, 4, 2, 4], [1, 4, 1, 0]],
  '-': [[0.3, 2, 1.7, 2]],
  '<>': [[1, 4, 2, 2], [2, 2, 1, 0], [1, 0, 0, 2], [0, 2, 1, 4]],
};
function stamp(text, { s, t, wFace, side, u = 1.05, sw = 0.55, depth = 0.32, gap = 1.3, dirS = -1 }) {
  const out = [];
  let x0 = 0;
  for (const ch of text) {
    if (ch === ' ') { x0 += 2 * u + gap; continue; }
    for (const [ax, ay, bx, by] of GLYPHS[ch] || []) {
      const sA = s + dirS * (x0 + ax * u), sB = s + dirS * (x0 + bx * u), tA = t + ay * u, tB = t + by * u;
      const len = Math.hypot(sB - sA, tB - tA) + sw;
      const ang = Math.atan2(tB - tA, sB - sA) / DEG;
      out.push(boxCut([(sA + sB) / 2, (tA + tB) / 2, side * (wFace + 0.5 - depth / 2)], [len, sw, 1 + depth], ang));
    }
    x0 += 2 * u + gap;
  }
  return out;
}

// ------------------------------------------------------------------------------------ dimensions

const RW = 14.8;        // receiver half width (outer)
const RS = 1.2;         // receiver sheet
const RB = -36;         // receiver bottom
const RT = 14;          // receiver wall top (dust cover skirts overlap from +11)
const STOCK_L = 230;    // wood length behind the receiver (butt plate adds ~5)
const MAG = { s: 172, t: RB, R: 330, a0: 8 * DEG, depth: 58, hw: 13.4 };
const RSB0 = 236.5;     // rear face of the rear sight block
/** rear sight leaf lower edge (leaf hinged at s=296, lies 3.2 thick in the block's channel) */
const leafBot = (s) => 42.6 - (s - 224) * (3.2 / 70);

export default function build() {
  const g = new Gun('akm');

  // =========================================================================== RECEIVER (stamped U, lofted)
  {
    // U section: flanges, inner walls, bottom; extra points down the outer walls carry the pressed
    // magazine-guide dimples (a smooth displacement, not a boolean: no torn crater / shading streaks)
    const wallT = [];
    for (let t = -14.2; t >= -28.3; t -= 1.4) wallT.push(+t.toFixed(3));
    const sec = [
      [RW, RT, 0.3], [RW - 3.4, RT, 0.3], [RW - 3.4, RT - RS, 0.3], [RW - RS, RT - RS, 0.3],
      [RW - RS, RB + RS, 2], [-(RW - RS), RB + RS, 2],
      [-(RW - RS), RT - RS, 0.3], [-(RW - 3.4), RT - RS, 0.3], [-(RW - 3.4), RT, 0.3], [-RW, RT, 0.3],
      ...wallT.map((t) => [-RW, t, 0]),
      [-RW, RB, 3.2], [RW, RB, 3.2],
      ...wallT.slice().reverse().map((t) => [RW, t, 0]),
    ];
    const ring2d = rpoly(sec, 3);
    const DIM = { s: 189.5, t: -21, a: 10.6, b: 5.6, d: 0.95 };
    const dimple = (s, t) => { const u = ((s - DIM.s) / DIM.a) ** 2 + ((t - DIM.t) / DIM.b) ** 2; return u < 1 ? DIM.d * (1 - u) ** 2 : 0; };
    const ss = [0, 25, 33, 41, 49, 57, 65, 73, 172, 177.4];   // short strips under the stampings (no CSG slivers)
    for (let s = 179.2; s <= 200; s += 1.75) ss.push(+s.toFixed(2));
    ss.push(201.8, 248);
    const rings = ss.map((s) => ring2d.map(([w, t]) => {
      const onWall = Math.abs(Math.abs(w) - RW) < 1e-6 && t < -13.5 && t > -29;
      return [s, t, onWall ? Math.sign(w) * (RW - dimple(s, t)) : w];
    }));
    let recv = loft(rings, { crease: 40 });
    recv = cut(recv, [
      cutters.pocketW([[128, -5, 4], [198, -5, 4], [198, 22], [128, 22]], 11, 12),      // ejection port
      cutters.pocketW([[98, 7.2, 1.5], [226, 7.2, 1.5], [226, 22], [98, 22]], 11, 12),  // charging handle slot
      cutters.box([174.75, RB, 0], [63.5, 6, 26.8]),                                    // magwell (+ front-lug recess)
      cutters.box([97, RB, 0], [20, 6, 7]),                                             // trigger slot
      // stamped markings straight into the sheet: model mark (left side) and serial (left, rear trunnion area)
      ...stamp('ST47', { s: 66, t: -19.0, wFace: RW, side: -1 }),
      ...stamp('318', { s: 40, t: -24.7, wFace: RW, side: -1, u: 0.95 }),
      // selector detents (right): AUTO = long dash, SEMI = two short dashes
      boxCut([134.2, -10.1, RW + 0.34], [4.6, 0.75, 1.32]),
      boxCut([132.0, -22.1, RW + 0.34], [1.8, 0.75, 1.32]), boxCut([135.2, -22.1, RW + 0.34], [1.8, 0.75, 1.32]),
    ]);
    g.add(recv, RECV);
  }

  // trunnions inside the shell (seen through the port / magwell)
  g.add(cbox([17, -19, 0], [33, 33, 27.1], { r: 1 }), 'steel_dark');                    // rear trunnion
  g.add(cbox([225, -22.5, 0], [46, 26, 27.1], { r: 1 }), 'steel_dark');                 // front trunnion

  // rivets / pins (AKM pattern), both sides
  for (const side of [1, -1]) {
    const ax = side > 0 ? 'w' : '-w', w = side * (RW - 0.05);
    for (const [s, t] of [[7, -28], [7, -12], [26, -28],                 // rear trunnion
      [138, -28.5], [138, -14],                                             // centre support
      [207, -28.5], [222, -28.5], [237, -28.5], [214, -13], [234, -13]])    // front trunnion
      g.add(rivet([s, t, w], 2.25, ax), RECV);
    // trigger / hammer / disconnector pins: near flush on the right (the selector lever sweeps over them)
    for (const [s, t, r] of [[97, -25, 2.5], [117, -24, 2.5], [80, -15, 2.2]]) g.add((side > 0 ? pinFlush : pinHead)([s, t, w], r, ax), 'steel_dark');
  }

  // ---- stock line (shared by the tangs, the wood and the butt plate): straight comb, concave belly behind
  //      the lower tang, rounded toe (R 9) and heel (R 5) at the butt face
  const XE = STOCK_L + 5.1;
  const tLin = (x) => 12.5 - 0.148 * x;
  const bLin = (x) => -38.5 - (109 / STOCK_L) * x + 3.2 * Math.sin(Math.PI * clamp01(x / STOCK_L)) + 2.4 * Math.sin(Math.PI * clamp01((x - 62) / 110));
  const corner = (f, R, faceDir) => {
    const m = (f(XE) - f(XE - 6)) / 6;                 // slope dt/dx near the butt
    const d1 = new THREE.Vector2(-1, -m).normalize();   // along the line, forward
    const d2 = new THREE.Vector2(0, faceDir);            // along the butt face
    const phi = Math.acos(d1.dot(d2)) / 2;
    const C = new THREE.Vector2(XE, f(XE));
    const O = C.clone().add(d1.clone().add(d2).normalize().multiplyScalar(R / Math.sin(phi)));
    const x0 = XE + d1.x * (R / Math.tan(phi));
    return (x) => (x <= x0 ? f(x) : O.y - faceDir * Math.sqrt(Math.max(0, R * R - (Math.min(x, XE) - O.x) ** 2)));
  };
  const stockTop = corner(tLin, 5, -1);
  const stockBot = corner(bLin, 9, 1);

  // ---- rear trunnion tangs over the stock (upper and lower) + stock screws
  g.add(prof([[1, stockTop(-1) - 1.2], [-44, stockTop(44) - 1.2, 3], [-50, stockTop(50) - 0.2, 3], [-44, stockTop(44) + 1.2, 2], [1, stockTop(-1) + 1.2]], { w: 15, bevel: 0.5 }), MACH);
  g.add(head([-37, stockTop(37) + 1.0, 0], [[0, 0], [0, 3.4], [0.5, 3.3], [0.9, 2.6], [0.9, 0]], 't'), MACH);
  g.add(cbox([-37, stockTop(37) + 1.95, 0], [0.7, 0.5, 5.2], { r: 0.1 }), 'steel_dark');
  g.add(prof([[34, RB + 1.0], [0, RB + 1.0], [-58, stockBot(58) + 1.0, 4], [-66, stockBot(66) - 0.2, 3], [-58, stockBot(58) - 1.4, 2], [0, RB - 1.4], [34, RB - 1.4]], { w: 16, bevel: 0.5 }), MACH);
  g.add(head([-56, stockBot(56) - 1.2, 0], [[0, 0], [0, 3.4], [0.5, 3.3], [0.9, 2.6], [0.9, 0]], '-t'), MACH);

  // =========================================================================== DUST COVER (ribbed)
  const DC = { hw: 15.6, tb: 11, tt: 34, r: 8, s1: RSB0 - 0.9 };
  const coverOuter = capPath(DC.hw, DC.tb, DC.tt, DC.r, 7);
  {
    // one stamped sheet: U section lofted along s; transverse stiffening ribs pressed into the top and
    // shoulders: narrow (≈3.8 mm), 1.1 mm proud, steep flanks, flat sheet between, fading before the skirts
    const RIBS = [20, 54, 88, 122, 156, 190, 222];
    const RIB = [[-1.85, 0], [-0.9, 1.1], [0.9, 1.1], [1.85, 0]];
    const outer = (h) => {
      const k = 5, pts = [];
      const fade = (t) => smooth((t - 17.5) / 6);
      for (const t of [DC.tb, 15, 19, 22.5]) pts.push([DC.hw + h * fade(t), t]);
      for (let i = 0; i <= k; i++) { const a = (i / k) * 90 * DEG, rr = DC.r + h; pts.push([DC.hw - DC.r + rr * Math.cos(a), DC.tt - DC.r + rr * Math.sin(a)]); }
      for (let i = 0; i <= k; i++) { const a = (90 + (i / k) * 90) * DEG, rr = DC.r + h; pts.push([-DC.hw + DC.r + rr * Math.cos(a), DC.tt - DC.r + rr * Math.sin(a)]); }
      for (const t of [22.5, 19, 15, DC.tb]) pts.push([-DC.hw - h * fade(t), t]);
      return pts;
    };
    const inner = (() => { const p = capPath(DC.hw - 1, DC.tb, DC.tt - 1, DC.r - 1, 5); return [p[0], [DC.hw - 1, 15], [DC.hw - 1, 19], [DC.hw - 1, 22.5], ...p.slice(1, -1), [-DC.hw + 1, 22.5], [-DC.hw + 1, 19], [-DC.hw + 1, 15], p[p.length - 1]]; })();
    const st = [[2.6, 0], [5, 0]];
    for (const c of RIBS) for (const [o, h] of RIB) st.push([c + o, h]);
    st.push([DC.s1 - 3, 0], [DC.s1, 0]);
    const rings = st.map(([sv, h]) => band(outer(h), inner).map(([w, t]) => [sv, t, w]));
    let cover = loft(rings, { crease: 40 });
    cover = cut(cover, [cutters.pocketW([[130, 8, 0], [196, 8, 0], [196, 20.5, 3], [130, 20.5, 3]], 12, 10)]);
    g.add(cover, RECV);
  }
  // rear end of the cover (bent face) with the opening for the recoil-spring guide button
  g.add(section(coverOuter.slice(1, -1).concat([[-DC.hw, 13.5], [DC.hw, 13.5]]), 1, 3.2, {
    bevel: 0.45, curveSeg: 3, holes: [[[-4.2, 19.5, 1], [4.2, 19.5, 1], [4.2, 28, 1], [-4.2, 28, 1]]],
  }), RECV);
  // recoil spring guide button through the cover's rear face
  g.add(cbox([-1.6, 23.7, 0], [9.6, 7.8, 7.8], { r: 1.6 }), 'steel_bright');
  g.add(cbox([-5.6, 23.7, 0], [2.2, 5.5, 5.5], { r: 0.9 }), 'steel_bright');

  // =========================================================================== SELECTOR (right)
  {
    // stamped blade: straight top edge just under the dust-cover skirt, ≈17 mm deep; at SAFE its front
    // covers the rear of the charging-handle slot. The lower front corner is a finger tab bent outward.
    const CW = 16.3;
    const sel = g.part('selector', { pivot: [16, -2, CW], extras: { axis: 'w', safe: 0, auto: -6, semi: -12 } });
    sel.add(prof([[9.5, -5.5, 5], [26, -8.2, 5], [117.6, -6.9, 1.0], [118.2, 1.4, 0.8], [131, 1.4, 0.8], [131, 10.6, 1.3], [32, 10.6, 5], [11, 6.5, 6]],
      { w: 1.8, cw: CW, bevel: 0.45, curveSeg: 4 }), RECV);
    // finger tab: joggled 3.6 mm outboard (top view outline extruded 8.2 mm tall)
    sel.add(plan([[115.6, CW - 0.9], [118.2, CW - 0.9], [121.6, CW + 2.7], [130.8, CW + 2.7, 1.0], [130.8, CW + 4.5, 1.0], [120.8, CW + 4.5, 0.5], [117.4, CW + 0.9], [115.6, CW + 0.9]],
      { h: 8.2, ct: -2.7, bevel: 0.45, curveSeg: 3 }), RECV);
    sel.add(head([16, -2, CW + 0.9], [[0, 0], [0, 6], [0.7, 5.8], [1.3, 5.1], [1.3, 0]], 'w', 18), RECV);   // axle boss
    sel.add(cbox([16, -2, CW + 2.25], [1, 6.5, 0.4], { r: 0.15 }), 'steel_dark');
  }

  // =========================================================================== PISTOL GRIP (lofted, ribbed)
  {
    const A = [56, RB + 0.6], rake = 18 * DEG;
    const d = [-Math.sin(rake), -Math.cos(rake)], u = [Math.cos(rake), -Math.sin(rake)];
    const L = 103;
    const ring = (z, sc = 1) => {
      // front strap: finger swell around z 40-55; back strap: gentle palm swell; base ≈ 25 x 39 mm
      const af = keys(z, [[0, 16.8], [18, 16.0], [33, 15.6], [47, 17.5], [61, 16.2], [80, 16.6], [98, 17.2]]) * sc;
      const ab = keys(z, [[0, 19.8], [24, 20.6], [54, 22.6], [78, 22.2], [98, 21.8]]) * sc;
      const hw = keys(z, [[0, 11.3], [28, 11.9], [62, 12.45], [98, 12.4]]) * sc;
      const rf = Math.min(af - 2, hw * 0.8), rb = Math.min(ab - 2, hw);
      const ribEnv = smooth((z - 12) / 10) * smooth((90 - z) / 10);
      const pts = [];
      const NS = 16, NC = 9;
      // right side (front -> back), rear cap, left side (back -> front), front cap
      const side = (sgn) => {
        for (let i = 0; i < NS; i++) {
          const v = sgn > 0 ? i / NS : 1 - i / NS;
          const x = lerp(af - rf, -(ab - rb), v);
          const yw = lerp(hw * 0.86, hw, smooth(v * 1.4));
          const rib = 0.5 * ribEnv * (0.5 - 0.5 * Math.cos(2 * Math.PI * (v * 6)));
          pts.push([x, sgn * (yw + rib)]);
        }
      };
      side(1);
      for (let i = 0; i < NC; i++) { const th = (i / NC) * Math.PI; pts.push([-(ab - rb) - rb * Math.sin(th), hw * Math.cos(th)]); }
      side(-1);
      for (let i = 0; i < NC; i++) { const a = (i / NC) * Math.PI; pts.push([af - rf + rf * Math.sin(a), -hw * 0.86 * Math.cos(a)]); }
      // to gun space; the top rings blend into the horizontal receiver plane
      const blend = clamp01(1 - z / 16);
      return pts.map(([x, y]) => {
        let s = A[0] + d[0] * z + u[0] * x, t = A[1] + d[1] * z + u[1] * x;
        if (blend > 0) {
          const tt = A[1] + d[1] * z, lam = (tt - t) / d[1];
          s = lerp(s, s + lam * d[0], blend); t = lerp(t, t + lam * d[1], blend);
        }
        return [s, t, y];
      });
    };
    const zs = [0, 4, 9, 15, 22, 30, 38, 44, 50, 56, 63, 71, 80, 89, 96];
    const rings = zs.map((z) => ring(z));
    // ≈4 mm rounded base edge
    for (const [dz, sc] of [[2.2, 0.99], [1.2, 0.965], [0.5, 0.92], [0.12, 0.84], [0, 0.66]]) rings.push(ring(L - dz, sc));
    g.add(loft(rings, { crease: 60 }), 'bakelite_plum');
    // grip screw washer at the bottom
    const bc = [A[0] + d[0] * (L + 0.1), A[1] + d[1] * (L + 0.1)];
    g.add(xform(head([0, 0, 0], [[0, 0], [0, 5.2], [0.5, 5.0], [0.8, 4.2], [0.8, 0]], '-t', 18), { rot: [-18, 0, 0], move: [bc[0], bc[1], 0] }), 'steel_dark');
  }

  // =========================================================================== TRIGGER GUARD, TRIGGER, MAG CATCH
  g.add(prof([[70, RB + 0.6, 1], [135, RB + 0.6, 1], [135, -40, 2], [131, -58, 5], [124, -64.5, 6], [86, -64.5, 9], [75, -57, 5], [71, -45, 3], [70, -40, 1]],
    { w: 10, bevel: 1.0, curveSeg: 4, holes: [[[82, -39, 4], [128, -39, 4], [125.5, -56.5, 5], [88, -58.8, 7], [80, -50, 4]]] }), RECV);
  g.add(rivet([73, -37.5, 5.0], 1.6, 'w'), RECV);
  g.add(rivet([73, -37.5, -5.0], 1.6, '-w'), RECV);
  // trigger: broad stamped blade, concave face curving forward to a rounded tip
  const trig = g.part('trigger', { pivot: [97, -25, 0] });
  trig.add(prof('M 95.0 -30 L 101.6 -30 L 101.6 -37 Q 99.0 -46.5 100.9 -52.4 Q 102.4 -55.4 100.4 -55.9 Q 97.6 -56.3 96.5 -53.6 Q 93.2 -46.2 95.0 -37 Z',
    { w: 6.8, bevel: 1.0, curveSeg: 10 }), RECV);
  trig.add(cbox([97, -28, 0], [8, 8, 5.2], { r: 1 }), 'steel_dark');
  // magazine catch: curved stamped paddle hanging from its pin, finger tab bent rearward at the bottom
  g.add(prof('M 135.6 -36.6 L 140.8 -36.6 Q 142.9 -46 141.7 -54.8 Q 141.1 -58.8 137.6 -59.5 L 133.2 -59.7 Q 132.3 -59.4 132.5 -58.2 Q 132.8 -57.4 134.0 -57.4 L 136.7 -57.3 Q 139.1 -56.9 139.4 -54.5 Q 140.3 -46.6 137.8 -40.8 Q 136.8 -38.6 135.6 -36.6 Z',
    { w: 12.4, bevel: 0.7, curveSeg: 5 }), RECV);
  g.add(cyl(-7.0, 7.0, 1.5, { t: -39.4, w: 0, seg: 12 }).rotateY(Math.PI / 2).translate(0, 0, -139.3), 'steel_dark');

  // =========================================================================== FRONT END
  // ---- barrel (stepped, real bore)
  g.add(lathe([[246, 3.9], [246, 12.5], [305, 12.5], [306.5, 9.2], [497, 9.2], [498, 8.4], [571, 8.4], [572, 8], [610, 8], [610.6, 7], [619.5, 7], [619.5, 6.2], [619.9, 5.0], [619.9, 3.9], [246, 3.9]], { seg: 28 }), MACH);

  // ---- rear sight block: cheeks / ramps tallest at the rear, sloping down to the hinge boss; leaf channel
  let rsb = prof([[RSB0, 11, 0.6], [RSB0, 42.4, 1.2], [239.2, 43.5, 1.6], [252, 43.2, 8], [272, 41.6, 16], [286.5, 39.3, 4], [292, 40.5, 2.5], [298.5, 43.2, 3.5], [303.5, 41.4, 2.5], [305, 33, 2], [305, 4, 1], [248, 4, 0.6], [248, 11, 0.6]],
    { w: 25, bevel: 1.1, curveSeg: 4 });
  rsb = cut(rsb, [cutters.box([265.75, 47.5, 0], [71.5, 23, 14.2]), holeS(23, 0, 9.6, 300, 320)]);
  g.add(rsb, MACH);
  for (const side of [1, -1]) {
    const ax = side > 0 ? 'w' : '-w';
    g.add(pinHead([258, 8, side * 12.45], 2.0, ax), 'steel_dark');
    g.add(pinHead([296, 39.6, side * 12.45], 1.9, ax), 'steel_dark');   // leaf hinge pin
  }
  // gas tube lock lever (right)
  g.add(prof([[287, 17, 4], [302.5, 17.5, 3], [303.5, 27, 3], [292, 34.5, 2], [281.5, 37.4, 1.4], [279.5, 34.6, 1.4], [286, 26, 4]], { w: 2.0, cw: 13.45, bevel: 0.5 }), MACH);
  g.add(head([295, 23, 14.4], [[0, 0], [0, 4.2], [0.6, 4.0], [1.1, 3.2], [1.1, 0]], 'w'), MACH);
  g.add(cbox([295, 23, 15.55], [0.8, 5, 0.4], { r: 0.15 }), 'steel_dark');
  // leaf spring: anchored on the channel floor at the front, pressing up on the leaf at the rear
  g.add(prof([[292, 36.1, 1], [262, 39.7, 1], [262, 40.85, 1], [292, 37.3, 1]], { w: 9, bevel: 0.3 }), 'steel_dark');

  // ---- rear sight leaf (part, hinged at its front pin): notch plate at the rear, range ticks, slider
  {
    const leaf = g.part('leaf', { pivot: [296, 39.6, 0] });
    const L1 = 289;
    leaf.add(prof([[224, leafBot(224), 0.6], [L1, leafBot(L1), 3], [296.5, 36.4, 2.5], [299.6, 39.6, 2.6], [297.5, 42.5, 2], [L1, leafBot(L1) + 3.2, 3], [224, leafBot(224) + 3.2, 0.6]],
      { w: 12.6, bevel: 0.55 }), MACH);
    // upturned notch plate: U notch, bottom on the sight line (t = 46.5)
    const u = [];
    for (let i = 0; i <= 6; i++) { const a = Math.PI * (i / 6); u.push([1.35 * Math.cos(a), 47.85 - 1.35 * Math.sin(a)]); }
    const plate = rpoly([[-6.6, leafBot(224), 0.5], [6.6, leafBot(224), 0.5], [6.6, 49.3, 1.2], [1.35, 49.3, 0.35], ...u.map(([w, t]) => [w, t, 0]), [-1.35, 49.3, 0.35], [-6.6, 49.3, 1.2]], 2);
    leaf.add(densify(section(plate, 221.2, 226.6, { bevel: 0.45, bevelSeg: 1 }), 3.2), MACH);
    // range graduations ahead of the slider
    for (let i = 0; i < 9; i++) { const s = 256 + i * 4; leaf.add(cbox([s, leafBot(s) + 3.25, i % 2 ? 2.0 : 0], [0.6, 0.3, i % 2 ? 2.4 : 5.0], { r: 0.1 }), 'steel_bright'); }
    // slider: wraps the leaf, its feet ride on the block's ramps (cheek tops ≈ 43.4 at s 246)
    const SS = 246.5, top = leafBot(SS) + 3.2;
    leaf.add(densify(cbox([SS, top + 0.62, 0], [10, 1.24, 18.2], { r: 0.5 }), 5), MACH);
    for (const side of [1, -1]) {
      leaf.add(cbox([SS, (43.45 + top + 1.24) / 2, side * 8.3], [10, top + 1.24 - 43.45, 1.6], { r: 0.5 }), MACH);
      leaf.add(cbox([SS - 3.0, 44.6, side * 9.45], [3.0, 2.2, 1.0], { r: 0.35 }), 'steel_bright');   // latch buttons
    }
  }

  // ---- handguard retainers
  // receiver-side cup holding the rear of the lower handguard
  g.add(section(band(cupPath(18.8, 9.5, -30.2, 5), cupPath(17.6, 9.5, -29.0, 4)), 247, 262, { bevel: 0.4 }), RECV);
  g.add(rivet([254.5, -18, 18.75], 1.8, 'w'), RECV);
  g.add(rivet([254.5, -18, -18.75], 1.8, '-w'), RECV);
  // front retainer band, latch lever (right) and sling loop (left)
  g.add(section([[18.8, 11.8, 3], [-18.8, 11.8, 3], [-18.8, -30.2, 5], [18.8, -30.2, 5]], 466.5, 480, {
    bevel: 0.5, curveSeg: 3, holes: [[[17.6, 10.6, 2], [-17.6, 10.6, 2], [-17.6, -29.0, 4], [17.6, -29.0, 4]]],
  }), RECV);
  g.add(prof([[452, -3.2, 2], [471, -5.2, 2], [475.5, -0.5, 2.5], [471, 3.2, 2], [453, 1.2, 2]], { w: 1.8, cw: 19.6, bevel: 0.45 }), RECV);
  g.add(rivet([471.5, -1, 20.4], 2.2, 'w'), RECV);
  for (const s of [465, 481.5]) g.add(cbox([s, -12, -19.6], [3.2, 5, 2.6], { r: 0.6 }), RECV);
  g.add(sweep([[465, -12.2, -21], [473, -12.2, -21.2], [481.5, -12.2, -21], [482.5, -19, -21.2], [473, -24.5, -21.4], [463.5, -19, -21.2]], 1.4, { closed: true, seg: 28, radial: 8 }), MACH);

  // ---- lower handguard (laminated wood): U section with flared shoulders, rolled top lip, palm swells
  {
    const P = (s) => {
      const inCupR = 1 - smooth((s - 262) / 5), inCupF = smooth((s - 461) / 5);
      const shrink = Math.max(inCupR, inCupF);
      const swell = smooth((s - 268) / 58) * smooth((462 - s) / 40);
      return {
        hl: lerp(19.3 + 4.9 * swell, 17.2, shrink),      // lip (widest), +5 mm per side at the swell
        hm: lerp(18.3 + 3.0 * swell, 17.0, shrink),      // flank
        hb: lerp(17.0 + 0.9 * swell, 15.6, shrink),      // bottom corner
        bot: lerp(-30.6, -28.6, shrink),
        cr: s < 308 ? 13.1 : 10.2,
        roll: (0.4 + 0.7 * swell) * (1 - shrink),
        tuck: 0.6 + 1.0 * swell,
        lipT: 8.2,
      };
    };
    const lhgRing = (s) => {
      const { hl, hm, hb, bot, cr, roll, tuck, lipT } = P(s);
      const right = [[cr * 0.5, -cr * 0.866, 0], [cr * 0.866, -cr * 0.5, 0], [cr, 0, 0], [cr, lipT, 1.0],
        [hl - 1.4, lipT + 0.5, 2.0], [hl + roll, lipT - 2.4, 2.0], [hl - tuck, lipT - 7.2, 3.0], [hm, -12.5, 14, 4], [hb, bot, 10, 5]];
      const left = right.map(([w, t, r, k]) => [-w, t, r, k]).reverse();
      return rpoly([[0, -cr, 0], ...right, [0, bot, 0], ...left], 3).map(([w, t]) => [s, t, w]);
    };
    const ss = [250, 261, 263.5, 266, 274, 288, 306, 309, 324, 344, 372, 400, 422, 438, 450, 458, 461.5, 464, 478.5];
    g.add(loft(ss.map(lhgRing), { crease: 50 }), WOOD);
  }

  // ---- gas tube with vent holes, upper handguard (wood) with its steel retainer
  g.add(tube(300, 471.5, 9.5, 7.9, { t: 23, seg: 16, b: 0 }), MACH);            // under the upper handguard / inside the gas block
  g.add(tube(497, 505, 9.5, 7.9, { t: 23, seg: 16, b: 0 }), MACH);
  let gasTube = tube(471, 497.5, 9.5, 7.9, { t: 23, seg: 20, b: 0 });
  gasTube = cut(gasTube, [holeW(481, 23, 1.6, 10), holeW(486.5, 23, 1.6, 10), holeW(492, 23, 1.6, 10)]);
  g.add(gasTube, MACH);
  {
    const uOuter = capPath(15.2, 12.6, 39.6, 10.5, 7);
    const uInner = [[10.7, 12.6]];
    for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI; uInner.push([10.7 * Math.cos(a), 23 + 10.7 * Math.sin(a)]); }
    uInner.push([-10.7, 12.6]);
    g.add(section(band(uOuter, uInner), 306, 476, { bevel: 2.4, bevelSeg: 3 }), WOOD);
    const rOut = capPath(16.0, 12.0, 40.4, 11.2, 7), rIn = capPath(15.0, 12.0, 39.4, 10.2, 7);
    g.add(section(band(rOut, rIn), 466, 474, { bevel: 0.4 }), RECV);
  }

  // ---- 45° gas block with bayonet lug, cross pin
  g.add(lathe([[496.5, 9.0], [496.5, 12.2], [497.5, 13], [530, 13], [531.5, 12], [531.5, 8.2]], { seg: 28 }), MACH);
  {
    let gb = prof([[496.5, 6], [496.5, 30.5, 4], [505, 34.6, 8], [514, 33.6, 4], [531.5, 12.5, 3], [531.5, 6]], { w: 21.5, bevel: 4.2, bevelSeg: 3 });
    gb = cut(gb, [holeS(23, 0, 9.6, 480, 503)]);
    g.add(gb, MACH);
    g.add(head([0, 0, 0], [[0, 0], [0, 2.6], [0.6, 2.2], [0.6, 0]], 's', 12).applyMatrix4(new THREE.Matrix4().makeRotationX(38.5 * DEG)).translate(0, 22.4, -522.6), 'steel_dark');
    let lug = prof([[503, -8, 1], [533, -8, 1], [536.5, -11.5, 1.5], [533.5, -21.5, 1.5], [503, -21.5, 1]], { w: 13, bevel: 0.8 });
    lug = cut(lug, [holeS(-15.5, 0, 3.6, 490, 560)]);
    g.add(lug, MACH);
    for (const side of [1, -1]) g.add(pinHead([514, -3, side * 12.4], 1.8, side > 0 ? 'w' : '-w'), 'steel_dark');
  }

  // ---- front sight base: ONE casting = side outline ∩ front outline. Near-vertical front face, rear face
  //      raked ≈17°, the tower narrows upward and runs straight into the protective ears (flared, rounded
  //      tips, 13.5-14.2 mm apart); collar and cleaning-rod lug flow into it with fillets.
  {
    const side = prof([[571.5, -8, 2], [571.5, 10.6, 2], [575.5, 12.5, 4], [587.0, 49.6, 4], [591.0, 52.2, 3.5], [604.5, 52.0, 4.5], [609.4, 45.0, 3],
      [609.8, -18.5, 2], [604.0, -22.6, 4], [585.0, -20.6, 8], [576.5, -11.5, 4]], { w: 30, bevel: 0, curveSeg: 4 });
    const front = section([[6.0, -24, 1.5], [6.2, -16.5, 4], [11.3, -7.5, 6], [12.2, 0, 5], [11.6, 8.5, 3], [9.9, 28.5, 3], [9.6, 32, 2],
      [10.3, 54, 0.8], [7.1, 54, 0.8], [6.75, 31.2, 1.6],
      [-6.75, 31.2, 1.6], [-7.1, 54, 0.8], [-10.3, 54, 0.8],
      [-9.6, 32, 2], [-9.9, 28.5, 3], [-11.6, 8.5, 3], [-12.2, 0, 5], [-11.3, -7.5, 6], [-6.2, -16.5, 4], [-6.0, -24, 1.5]], 565, 616, { bevel: 0, curveSeg: 3 });
    let fsb = intersect(side, front);
    fsb = cut(fsb, [holeS(-15.5, 0, 3.9, 560, 640)]);
    g.add(fsb, MACH);
    for (const sd of [1, -1]) g.add(pinHead([589, 3, sd * 11.85], 1.7, sd > 0 ? 'w' : '-w'), 'steel_dark');
    g.add(cyl(-6.6, 6.6, 1.1, { t: 35.5, w: 0, seg: 10 }).rotateY(Math.PI / 2).translate(0, 0, -592), 'steel_dark');   // drum axle
    g.add(cyl(-5.7, 5.7, 4.4, { t: 35.5, w: 0, seg: 20 }).rotateY(Math.PI / 2).translate(0, 0, -592), 'steel_dark'); // windage drum
    g.add(cbox([592, 35.5, -5.5], [2.0, 1.2, 0.5], { r: 0.2 }), 'steel_bright');                                     // zero mark
    g.add(cyl(35, 41.4, 1.75, { seg: 12 }).rotateX(Math.PI / 2).translate(0, 0, -592), 'steel_dark');
    g.add(cyl(41, 46.5, 1.05, { seg: 12, b: 0.25 }).rotateX(Math.PI / 2).translate(0, 0, -592), 'steel_dark');  // post
    g.add(cyl(606, 612.5, 1.3, { t: -6.5, w: 7.5, seg: 10 }), 'steel_bright'); // spring-loaded comp detent pin
  }

  // ---- slant compensator: the long lip sits at ≈7 o'clock seen from the shooter, vents up and right
  {
    let comp = lathe([[610.4, 7.05], [610.4, 10.4], [611.2, 11.1], [645.3, 11.1], [646, 10.4], [646, 5.0], [619.6, 5.0], [619.6, 7.05], [610.4, 7.05]], { seg: 28 });
    const slant = xform(cutters.box([0, 0, 0], [80, 80, 80]), { rot: [42.2, 0, 0], move: [636 + 40 * 0.74, 40 * 0.67, 0] });
    xform(slant, { rot: [0, 0, -22] });   // roll about the bore: lip to lower-left, opening to upper-right
    const notches = [];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; notches.push(cutters.box([610.6, Math.sin(a) * 10.4, Math.cos(a) * 10.4], [2.4, 2.4, 2.4])); }
    comp = cut(comp, [slant, ...notches]);
    g.add(comp, MACH);
  }

  // ---- cleaning rod under the barrel, head held in the FSB lug
  g.add(cyl(464, 606, 3.0, { t: -15.5, seg: 12 }), MACH);
  {
    let rodHead = lathe([[600, 0], [600, 3.0], [602, 3.7], [614, 3.7], [615.2, 3.0], [615.2, 0]], { t: -15.5, seg: 14 });
    rodHead = cut(rodHead, [holeW(610, -15.5, 1.6)]);
    g.add(rodHead, MACH);
  }

  // =========================================================================== STOCK (laminated wood) + butt plate
  {
    // crowned comb, side swell towards the butt, rounded toe / heel (stockTop / stockBot above)
    const sec = (x, grow = 0) => {
      const xx = Math.max(0, x);
      const top = stockTop(xx) + grow, bot = stockBot(xx) - grow;
      const hw = 14.4 + 5.6 * clamp01(xx / STOCK_L) + 0.9 * Math.sin(Math.PI * clamp01((xx - 105) / 135)) + grow;
      const rT = hw * 0.94;
      const mid = (top + bot) / 2;
      return rpoly([[hw, bot, 7, 4], [hw + 0.9, mid, 60, 4], [hw, top, rT, 6], [-hw, top, rT, 6], [-hw - 0.9, mid, 60, 4], [-hw, bot, 7, 4]], 4);
    };
    const xs = [-0.8];
    for (let i = 0; i <= 18; i++) xs.push((i / 18) * 216);
    xs.push(221, 224.5, 227.5, STOCK_L);
    g.add(loft(xs.map((x) => sec(x).map(([w, t]) => [-x, t, w])), { crease: 50 }), WOOD);

    // butt plate: blued steel cap wrapping the toe, slight raised rim around a flat field
    const BP = [[STOCK_L - 0.2, 0.45], [STOCK_L + 1.8, 0.45], [STOCK_L + 3.4, 0.45], [STOCK_L + 4.5, 0.05], [XE, -0.7], [XE, -2.3], [STOCK_L + 4.55, -2.9]];
    g.add(loft(BP.map(([x, gr]) => sec(Math.min(x, XE), gr).map(([w, t]) => [-x, t, w])), { caps: [true, false], crease: 40 }), MACH);
    const FX = STOCK_L + 4.6;   // field surface
    let field = section(sec(FX, -2.6), -FX, -FX + 1.8, { bevel: 0.05, bevelSeg: 1 });
    // trap door outline: visible 1.2 mm wide, 0.7 mm deep groove
    const doorO = rpoly([[9.6, -90.6, 5.6], [9.6, -45.4, 5.6], [-9.6, -45.4, 5.6], [-9.6, -90.6, 5.6]], 4);
    const doorI = rpoly([[8.4, -89.4, 4.4], [8.4, -46.6, 4.4], [-8.4, -46.6, 4.4], [-8.4, -89.4, 4.4]], 4);
    field = cut(field, [section(doorO, -FX - 1, -FX + 0.7, { bevel: 0, holes: [doorI] })]);
    g.add(field, MACH);
    // hinge knuckles at the top of the door (door centre knuckle + two plate knuckles), latch button below
    g.add(cyl(-3.8, 3.8, 1.45, { t: -44.2, w: 0, seg: 12 }).rotateY(Math.PI / 2).translate(0, 0, FX - 0.15), MACH);
    for (const sd of [1, -1]) g.add(cyl(-1.6, 1.6, 1.45, { seg: 12 }).rotateY(Math.PI / 2).translate(sd * 5.8, -44.2, FX - 0.15), MACH);
    g.add(cyl(-7.6, 7.6, 0.55, { seg: 8, b: 0.1 }).rotateY(Math.PI / 2).translate(0, -44.2, FX - 0.15), 'steel_dark');   // hinge pin
    g.add(head([-FX, -95.6, 0], [[0, 0], [0, 3.3], [0.7, 3.15], [1.25, 2.5], [1.35, 0]], '-s', 18), 'steel_bright');       // latch button
    g.add(head([-FX, -95.6, 0], [[0, 0], [0, 4.6], [0.35, 4.4], [0.45, 0]], '-s', 18), MACH);                            // its collar
    for (const t of [-32, -122]) {
      g.add(head([-FX, t, 0], [[0, 0], [0, 3.6], [0.5, 3.4], [0.9, 2.6], [0.9, 0]], '-s'), MACH);
      g.add(cbox([-FX - 0.95, t, 0], [0.4, 0.7, 5.4], { r: 0.1 }), 'steel_dark');
    }
    // rear sling loop on the left side of the wrist (plate + 2 screws + loop)
    const ls = -58, lt = -30;
    g.add(cbox([ls, lt, -16.2], [30, 9, 1.6], { r: 0.6 }), MACH);
    for (const s of [ls - 10, ls + 10]) g.add(head([s, lt, -17.0], [[0, 0], [0, 2.4], [0.4, 2.2], [0.7, 1.6], [0.7, 0]], '-w', 12), MACH);
    g.add(sweep([[ls - 6, lt - 3.5, -17.4], [ls, lt - 3.8, -17.6], [ls + 6, lt - 3.5, -17.4], [ls + 6.5, lt - 11, -17.8], [ls, lt - 15.5, -18.0], [ls - 6.5, lt - 11, -17.8]], 1.35, { closed: true, seg: 36, radial: 8 }), MACH);
  }

  // =========================================================================== CHARGING HANDLE + CARRIER (bolt)
  const KNOB = { base: [213.5, 11.2, 21.0], rot: [0, -8, 28], len: 16 };
  const kdir = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(KNOB.rot[0] * DEG, KNOB.rot[1] * DEG, KNOB.rot[2] * DEG)); // three space
  {
    const bolt = g.part('bolt', { pivot: [214, 9, 20], extras: { travel: 0.105 } });
    // carrier body seen through the port and the handle slot
    let carrier = prof([[124, 2.4, 3], [205, 2.4, 2], [226, 5.5, 2], [226, 30.5, 3], [124, 30.5, 6]], { w: 20.4, bevel: 1.0 });
    carrier = cut(carrier, [cutters.pocketW([[150, 12, 3], [196, 12, 3], [196, 22, 3], [150, 22, 3]], 9.4, 4)]);  // lightening relief
    bolt.add(carrier, 'steel_bright');
    bolt.add(cyl(226, 330, 6.8, { t: 23, seg: 18 }), 'steel_bright');                                            // piston extension
    // rotating bolt with extractor and cam lug (Ø15.6: rides just over the top cartridge)
    bolt.add(cyl(150, 199.4, 7.8, { seg: 22 }), 'steel_bright');
    bolt.add(cbox([191, 2.5, 7.4], [16, 4.4, 2.6], { r: 0.6 }), 'steel_dark');                                    // extractor
    bolt.add(cbox([166, 6, 6.8], [9, 6, 5], { r: 1.2 }), 'steel_bright');                                         // cam lug
    // the handle: flat root in the slot, upswept stem, satin cylindrical knob angled up and slightly rearward
    bolt.add(prof([[204, 7.7, 1.2], [222, 7.7, 1.2], [222, 10.5, 1.2], [204, 10.5, 1.2]], { w: 8.8, cw: 13.3, bevel: 0.6 }), 'steel');
    bolt.add(sweep([[213, 9.1, 15.0], [213.1, 9.3, 17.6], [213.3, 10.0, 19.6], [213.5, 11.2, 21.4]], 2.9, { seg: 10, radial: 12 }), 'steel');
    const knob = head([0, 0, 0], [[0, 0], [0, 4.6], [1.2, 5.6], [2.6, 6.0], [12.6, 6.0], [14.4, 5.5], [15.4, 4.2], [15.9, 2.2], [KNOB.len, 0]], 'w', 20);
    xform(knob, { scale: [0.88, 1, 1], rot: KNOB.rot, move: KNOB.base });
    bolt.add(knob, 'steel');
  }

  // =========================================================================== MAGAZINE (plum, curved, lofted)
  {
    const mag = g.part('mag', { pivot: [MAG.s, MAG.t, 0], extras: { drop: true, rock: [203, -30, 0] } });
    const K = [MAG.s + Math.cos(MAG.a0) * MAG.R, MAG.t + Math.sin(MAG.a0) * MAG.R];
    const frame = (phi) => {
      const a = MAG.a0 + phi;
      const P = [K[0] - MAG.R * Math.cos(a), K[1] - MAG.R * Math.sin(a)];
      const er = [-Math.cos(a), -Math.sin(a)];           // radial: towards the rear (outer) edge
      const T = [Math.sin(a), -Math.cos(a)];             // tangent: down along the magazine
      return { a, P, er, T };
    };
    const at = (phi, xr, along = 0) => { const f = frame(phi); return [f.P[0] + f.er[0] * xr + f.T[0] * along, f.P[1] + f.er[1] * xr + f.T[1] * along]; };
    // the body runs ≈22 mm up inside the well above the seat (pivot) so the feed lips sit just under the bolt
    const phiTop = -3.75 * DEG, phiBot = 38 * DEG;
    const H = MAG.depth / 2;
    const ring = (phi) => {
      const env = smooth((phi - 2 * DEG) / (8 * DEG)) * smooth((phiBot - phi - 2 * DEG) / (5 * DEG));
      const hw = lerp(12.9, MAG.hw, smooth((phi + 0.6 * DEG) / (0.8 * DEG))), hd = H, rib = 0.75 * env;
      const right = [[-hd, hw, 6], [-24.5, hw, 0.6, 1], [-23.5, hw + rib, 0.6, 1], [-18.5, hw + rib, 0.6, 1], [-17.5, hw, 0.6, 1],
        [18.5, hw, 0.6, 1], [19.5, hw + rib, 0.6, 1], [24.5, hw + rib, 0.6, 1], [25.5, hw, 0.6, 1], [hd, hw, 4.5]];
      const left = right.map(([x, w, r, k]) => [x, -w, r, k]).reverse();
      const f = frame(phi);
      return rpoly([...right, ...left], 3).map(([x, w]) => [f.P[0] + f.er[0] * x, f.P[1] + f.er[1] * x, w]);
    };
    const rings = [];
    for (const deg of [-3.75, -1.6, -0.6, 0.2, 2.5]) rings.push(ring(deg * DEG));
    const n = 13;
    for (let i = 1; i <= n; i++) rings.push(ring(lerp(2.5 * DEG, phiBot, i / n)));
    mag.add(loft(rings, { crease: 55 }), 'bakelite_plum');
    // steel floor plate with the rear locking tab
    const fb = frame(phiBot);
    const fpC = at(phiBot, 0.6, 1.9);
    mag.add(cbox([fpC[0], fpC[1], 0], [61, 3.8, 29.6], { r: 1.4, rot: [fb.a / DEG, 0, 0] }), 'steel');
    const tab = at(phiBot, 30.8, 0.4);
    mag.add(cbox([tab[0], tab[1], 0], [4.2, 6.5, 12], { r: 1, rot: [fb.a / DEG, 0, 0] }), 'steel');
    // steel locking lugs: front hooks into the front trunnion (rock point), rear meets the catch
    const f0 = frame(0);
    const fl = at(0, -H - 2.6, -4.2);
    mag.add(cbox([fl[0], fl[1], 0], [5.6, 9, 14], { r: 1.2, rot: [f0.a / DEG, 0, 0] }), 'steel');
    const rl = at(0.5 * DEG, H + 1.6, 0.5);
    mag.add(cbox([rl[0], rl[1], 0], [3.6, 6.2, 12], { r: 0.9, rot: [f0.a / DEG, 0, 0] }), 'steel');
    // feed lips (steel inserts) and the top cartridge (7.62x39, lacquered case -> brass tone, FMJ)
    const lipSec = [[13.0, -2.2, 0.4], [13.0, 4.8, 1.6], [6.8, 6.6, 1.2], [6.0, 5.6, 0.4], [11.6, 3.8, 1], [11.8, -2.2, 0.4]];
    const lipGeo = section(lipSec, -24, 22, { bevel: 0.35, curveSeg: 3, bevelSeg: 1 });
    const lips = merge([lipGeo, mirrorW(lipGeo)]);
    const top = frame(phiTop);
    xform(lips, { rot: [top.a / DEG, 0, 0], move: [top.P[0], top.P[1], 0] });
    mag.add(lips, 'steel');
    const RT0 = 0.75;   // round axis above the top ring
    const rnd = lathe([[-25, 0], [-25, 5.0], [-24.4, 5.6], [-23.6, 5.6], [-23, 4.7], [-21.6, 4.7], [-21, 5.6], [5, 5.0], [8.5, 4.4], [12, 4.2], [12, 0]], { seg: 18, t: RT0, w: 3.0 });
    const bul = lathe([[11.9, 0], [11.9, 3.95], [20, 3.95], [24, 3.3], [28, 2.0], [31, 0.6], [31.4, 0]], { seg: 18, t: RT0, w: 3.0 });
    for (const geo of [rnd, bul]) xform(geo, { rot: [top.a / DEG, 0, 0], move: [top.P[0], top.P[1], 0] });
    mag.add(rnd, 'brass');
    mag.add(bul, 'copper');
  }

  // =========================================================================== BAKE TWEAK (local)
  // The kit's edge-wear term saturates on any convex feature under ≈7 mm radius (curvScale 1/150 m), so
  // narrow pressed ribs, the 12 mm knob and the small selector bake to 100 % worn (chrome bands / a
  // chrome knob). Damp the edge channel there so the grunge mask turns it into patchy wear instead.
  const DAMP = [
    { part: 'body', mat: RECV, k: 0.5, where: (s, t) => t > 14.6 && s > 0.5 && s < DC.s1 + 0.5 },   // dust cover
    { part: 'bolt', mat: 'steel', k: 0.62 },                                                        // handle + knob
    { part: 'selector', mat: RECV, k: 0.45 },
  ];
  const build0 = g.build.bind(g);
  g.build = (opts = {}) => {
    const root = build0(opts);
    root.traverse((o) => {
      const bk = o.isMesh && o.geometry.attributes._bake;
      if (!bk) return;
      const [pn, mat] = o.name.split(':');
      const rule = DAMP.find((d) => d.part === pn && d.mat === mat);
      if (!rule) return;
      const pv = g.parts.get(pn).pivot, pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) * 1000 + pv.x, y = pos.getY(i) * 1000 + pv.y, z = pos.getZ(i) * 1000 + pv.z;
        if (rule.where && !rule.where(-z, y, x)) continue;
        bk.setY(i, bk.getY(i) * rule.k);
      }
      bk.needsUpdate = true;
    });
    return root;
  };

  // =========================================================================== SOCKETS / META
  const kc = [KNOB.base[0] - kdir.z * KNOB.len * 0.5, KNOB.base[1] + kdir.y * KNOB.len * 0.5, KNOB.base[2] + kdir.x * KNOB.len * 0.5];   // knob centre
  g.socket('muzzle', [640, 0, 0]);
  g.socket('eject', [165, 6, 15.5], { dir: [0.15, 0.55, 1] });
  g.socket('grip_r', [42.4, -77.8, 0], { rot: [0, 0, -18] });
  g.socket('grip_l', [385, -12, 0]);
  g.socket('magwell', [176, -62, 0]);
  g.socket('charge', kc.map((v) => +v.toFixed(1)));
  g.socket('sight_rear', [223.9, 46.5, 0]);
  g.socket('sight_front', [592, 46.5, 0]);
  g.meta({
    grip: 'rifle', support: 'handguard', reload: 'mag_curved', chargeSide: 'right',
    name: '草原 Steppe-47',
    notes: 'AKM pattern. bolt = carrier + charging handle (right), travel 0.105 m. selector pivots on its rear axle about w (safe 0°, auto -6°, semi -12°). leaf = rear sight leaf hinged at its front pin. mag rocks forward-then-down out of the well: extras.rock = front-lug hook point [s, t, w] in authoring mm (gun space x = w, y = t, z = -s, /1000 for metres).',
  });
  return g;
}
