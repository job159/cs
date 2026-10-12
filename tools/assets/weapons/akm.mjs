// 草原 Steppe-47 — AKM-pattern 7.62x39 assault rifle, laminated wood furniture, plum magazine.
// Side view, mm: s forward from the rear face of the stamped receiver, t up from the bore axis,
// w right (ejection port / charging handle / selector side).
//
// Real reference (AKM): OAL 880 mm (butt plate -235 → compensator lip 646), barrel 415 mm (bolt face
// s=200 → crown 619.5), sight radius 378 mm (notch 214 → post 592), height ≈ 300 mm with the
// 30-round magazine (notch tab +49 → floor plate -252).
//
// Local helpers (loft, rpoly, ...) live in this file: the kit has no loft / variable-section sweep,
// which organic furniture (stock, grip, handguard swells, curved magazine) needs.
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';
import { Gun, DEG, profile, section, lathe, cyl, tube, box, sphere, sweep, screw, cut, cutters, merge, xform, mirrorW } from '../lib/gunkit.mjs';

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
const rivet = (c, r = 2.3, axis = 'w') => head(c, [[0, 0], [0, r], [0.4, r * 0.93], [0.85, r * 0.62], [1.05, 0]], axis, 10);
const pinHead = (c, r = 2.4, axis = 'w') => head(c, [[0, 0], [0, r], [0.55, r], [0.75, r - 0.3], [0.75, r * 0.4], [0.5, 0]], axis, 12);

// ------------------------------------------------------------------------------------ dimensions

const RW = 14.8;        // receiver half width (outer)
const RS = 1.2;         // receiver sheet
const RB = -36;         // receiver bottom
const RT = 14;          // receiver wall top (dust cover skirts overlap from +11)
const STOCK_L = 230;    // wood length behind the receiver (butt plate adds 5)
const MAG = { s: 172, t: RB, R: 330, a0: 8 * DEG, depth: 58, hw: 13.4 };

export default function build() {
  const g = new Gun('akm');

  // =========================================================================== RECEIVER (stamped U)
  const recvSec = [
    [RW, RT, 0.3], [RW - 3.4, RT, 0.3], [RW - 3.4, RT - RS, 0.3], [RW - RS, RT - RS, 0.3],
    [RW - RS, RB + RS, 2], [-(RW - RS), RB + RS, 2],
    [-(RW - RS), RT - RS, 0.3], [-(RW - 3.4), RT - RS, 0.3], [-(RW - 3.4), RT, 0.3], [-RW, RT, 0.3],
    [-RW, RB, 3.2], [RW, RB, 3.2],
  ];
  let recv = section(recvSec, 0, 248, { bevel: 0.35, curveSeg: 4 });
  const dimple = (side) => xform(sphere([0, 0, 0], 1, { seg: 22 }), { scale: [9.5, 5.2, 3.0], move: [189, -21, side * (RW + 2.0)] });
  recv = cut(recv, [
    cutters.pocketW([[128, -5, 4], [198, -5, 4], [198, 22], [128, 22]], 11, 12),      // ejection port
    cutters.pocketW([[98, 7.2, 1.5], [226, 7.2, 1.5], [226, 22], [98, 22]], 11, 12),  // charging handle slot
    cutters.box([172.5, RB, 0], [59, 6, 26.6]),                                       // magwell
    cutters.box([97, RB, 0], [20, 6, 7]),                                             // trigger slot
    dimple(1), dimple(-1),                                                            // magazine guide dimples
  ]);
  g.add(recv, 'steel');
  // stamped selector detent marks (right) and serial panel (left)
  g.add(cut(cbox([42, -18, -RW + 0.2], [30, 7, 1.2], { r: 0.4 }), [cutters.box([42, -18, -RW - 0.6], [27, 4.6, 1.2])]), 'steel');
  for (const [s, t] of [[131, -9.5], [131, -20.5]]) g.add(cbox([s, t, RW + 0.05], [5, 1.0, 0.5], { r: 0.2 }), 'steel_dark');

  // trunnions inside the shell (seen through the port / magwell)
  g.add(cbox([17, -19, 0], [33, 33, 27.1], { r: 1 }), 'steel_dark');                    // rear trunnion
  let ftrun = cbox([225, -22.5, 0], [46, 26, 27.1], { r: 1 });
  g.add(ftrun, 'steel_dark');

  // rivets / pins (AKM pattern), both sides
  for (const side of [1, -1]) {
    const ax = side > 0 ? 'w' : '-w', w = side * (RW - 0.05);
    for (const [s, t] of [[7, -28], [7, -12], [26, -28],                 // rear trunnion
      [138, -28.5], [138, -14],                                             // centre support
      [207, -28.5], [222, -28.5], [237, -28.5], [214, -13], [234, -13]])    // front trunnion
      g.add(rivet([s, t, w], 2.25, ax), 'steel');
    for (const [s, t, r] of [[97, -25, 2.5], [117, -24, 2.5], [80, -15, 2.2]]) g.add(pinHead([s, t, w], r, ax), 'steel_dark');
  }

  // ---- rear trunnion tangs over the stock (upper and lower) + stock screws
  const stockTop = (x) => 12.5 - 0.148 * x;
  const stockBot = (x) => -38.5 - (109 / STOCK_L) * x + 3.2 * Math.sin(Math.PI * clamp01(x / STOCK_L));
  g.add(prof([[1, stockTop(-1) - 1.2], [-44, stockTop(44) - 1.2, 3], [-50, stockTop(50) - 0.2, 3], [-44, stockTop(44) + 1.2, 2], [1, stockTop(-1) + 1.2]], { w: 15, bevel: 0.5 }), 'steel');
  g.add(head([-37, stockTop(37) + 1.0, 0], [[0, 0], [0, 3.4], [0.5, 3.3], [0.9, 2.6], [0.9, 0]], 't'), 'steel');
  g.add(cbox([-37, stockTop(37) + 1.95, 0], [0.7, 0.5, 5.2], { r: 0.1 }), 'steel_dark');
  g.add(prof([[34, RB + 1.0], [0, RB + 1.0], [-58, stockBot(58) + 1.0, 4], [-66, stockBot(66) - 0.2, 3], [-58, stockBot(58) - 1.4, 2], [0, RB - 1.4], [34, RB - 1.4]], { w: 16, bevel: 0.5 }), 'steel');
  g.add(head([-56, stockBot(56) - 1.2, 0], [[0, 0], [0, 3.4], [0.5, 3.3], [0.9, 2.6], [0.9, 0]], '-t'), 'steel');

  // =========================================================================== DUST COVER (ribbed)
  const DC = { hw: 15.6, tb: 11, tt: 34, r: 8 };
  const coverOuter = capPath(DC.hw, DC.tb, DC.tt, DC.r, 7);
  {
    // one stamped sheet: U section lofted along s, transverse stiffening ribs pressed into the top/shoulders
    const RIBS = [20, 54, 88, 122, 156, 190, 222];
    const ribH = (s) => RIBS.reduce((m, c) => Math.max(m, Math.cos(Math.min(1, Math.abs(s - c) / 3.4) * Math.PI / 2) ** 2), 0) * 0.8;
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
    const ss = [2.6, 5];
    for (const c of RIBS) ss.push(c - 3.4, c - 1.7, c, c + 1.7, c + 3.4);
    ss.push(236, 239.5);
    const rings = ss.map((sv) => band(outer(ribH(sv)), inner).map(([w, t]) => [sv, t, w]));
    let cover = loft(rings, { crease: 40 });
    cover = cut(cover, [cutters.pocketW([[130, 8, 0], [196, 8, 0], [196, 20.5, 3], [130, 20.5, 3]], 12, 10)]);
    g.add(cover, 'steel');
  }
  // rear end of the cover (bent face) with the opening for the recoil-spring guide button
  g.add(section(coverOuter.slice(1, -1).concat([[-DC.hw, 13.5], [DC.hw, 13.5]]), 1, 3.2, {
    bevel: 0.45, curveSeg: 3, holes: [[[-4.2, 19.5, 1], [4.2, 19.5, 1], [4.2, 28, 1], [-4.2, 28, 1]]],
  }), 'steel');
  // recoil spring guide button through the cover's rear face
  g.add(cbox([-1.6, 23.7, 0], [9.6, 7.8, 7.8], { r: 1.6 }), 'steel_bright');
  g.add(cbox([-5.6, 23.7, 0], [2.2, 5.5, 5.5], { r: 0.9 }), 'steel_bright');

  // =========================================================================== SELECTOR (right)
  const sel = g.part('selector', { pivot: [16, -2, 15.9], extras: { axis: 'w', safe: 0, auto: -6, semi: -12 } });
  sel.add(prof([[9, -6, 6], [26, -10.5, 5], [96, -2.2, 10], [124, 1.5, 2], [129, 5, 2], [129, 10.4, 1], [104, 10.6, 3], [32, 7.4, 6], [10, 5.5, 6]],
    { w: 1.8, cw: 15.9, bevel: 0.45, curveSeg: 4 }), 'steel');
  sel.add(cbox([124.5, 2.2, 18.2], [6.5, 4.6, 5.4], { r: 1.2 }), 'steel');                         // finger tab
  sel.add(head([16, -2, 16.7], [[0, 0], [0, 6], [0.7, 5.8], [1.3, 5.1], [1.3, 0]], 'w', 18), 'steel');  // axle boss
  sel.add(cbox([16, -2, 18.05], [1, 6.5, 0.4], { r: 0.15 }), 'steel_dark');

  // =========================================================================== PISTOL GRIP (lofted, ribbed)
  {
    const A = [56, RB + 0.6], rake = 18 * DEG;
    const d = [-Math.sin(rake), -Math.cos(rake)], u = [Math.cos(rake), -Math.sin(rake)];
    const L = 103;
    const ring = (z, sc = 1) => {
      const af = keys(z, [[0, 17.6], [16, 17.0], [30, 16.8], [52, 18.6], [74, 18.0], [96, 19.4]]) * sc;
      const ab = keys(z, [[0, 20.5], [28, 21.4], [66, 23.4], [98, 24.6]]) * sc;
      const hw = keys(z, [[0, 11.6], [30, 12.4], [70, 13.4], [98, 14.2]]) * sc;
      const rf = Math.min(af - 2, hw * 0.8), rb = Math.min(ab - 2, hw);
      const ribEnv = smooth((z - 12) / 10) * smooth((92 - z) / 10);
      const pts = [];
      const NS = 20, NC = 9;
      // right side (front -> back), rear cap, left side (back -> front), front cap
      const side = (sgn) => {
        for (let i = 0; i < NS; i++) {
          const v = sgn > 0 ? i / NS : 1 - i / NS;
          const x = lerp(af - rf, -(ab - rb), v);
          const yw = lerp(hw * 0.86, hw, smooth(v * 1.4));
          const rib = 0.55 * ribEnv * (0.5 - 0.5 * Math.cos(2 * Math.PI * (v * 6)));
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
    const zs = [0, 4, 9, 15, 22, 30, 38, 46, 54, 62, 70, 78, 86, 92, 97];
    const rings = zs.map((z) => ring(z));
    rings.push(ring(100.6, 0.975), ring(102.2, 0.92), ring(103.2, 0.8), ring(103.6, 0.6));
    g.add(loft(rings, { crease: 60 }), 'bakelite_plum');
    // grip screw washer at the bottom
    const bc = [A[0] + d[0] * 103.7, A[1] + d[1] * 103.7];
    g.add(xform(head([0, 0, 0], [[0, 0], [0, 5.2], [0.5, 5.0], [0.8, 4.2], [0.8, 0]], '-t', 18), { rot: [-18, 0, 0], move: [bc[0], bc[1], 0] }), 'steel_dark');
  }

  // =========================================================================== TRIGGER GUARD, TRIGGER, MAG CATCH
  g.add(prof([[70, RB + 0.6, 1], [135, RB + 0.6, 1], [135, -40, 2], [131, -58, 5], [124, -64.5, 6], [86, -64.5, 9], [75, -57, 5], [71, -45, 3], [70, -40, 1]],
    { w: 10, bevel: 1.0, curveSeg: 4, holes: [[[82, -39, 4], [128, -39, 4], [125.5, -56.5, 5], [88, -58.8, 7], [80, -50, 4]]] }), 'steel');
  g.add(rivet([73, -37.5, 5.0], 1.6, 'w'), 'steel');
  g.add(rivet([73, -37.5, -5.0], 1.6, '-w'), 'steel');
  const trig = g.part('trigger', { pivot: [97, -25, 0] });
  trig.add(prof('M 95.4 -30 L 101.2 -30 L 101.2 -37 Q 98.8 -45.5 97 -54 Q 95.9 -56.4 94.4 -55.2 Q 93.6 -45.5 95.4 -37 Z', { w: 6.2, bevel: 0.9, curveSeg: 10 }), 'steel');
  trig.add(cbox([97, -28, 0], [8, 8, 5.2], { r: 1 }), 'steel_dark');
  // magazine catch (paddle in front of the guard, pivot pin through the guard's front ears)
  g.add(prof([[135.2, RB + 0.5, 1], [142.6, RB + 0.5, 1], [143.2, -44, 2], [142, -55.5, 2.5], [136.8, -57.5, 2], [135.4, -54, 1.5], [137.2, -44, 2]], { w: 12, bevel: 0.8 }), 'steel');
  for (let i = 0; i < 4; i++) g.add(cbox([136.4 - i * 0.15, -46.5 - i * 2.3, 0], [1.2, 1.0, 12.4], { r: 0.3 }), 'steel');
  g.add(cyl(-7.2, 7.2, 1.6, { t: -40, w: 0 }).rotateY(Math.PI / 2).translate(0, 0, -138), 'steel_dark');

  // =========================================================================== FRONT END
  // ---- barrel (stepped, real bore)
  g.add(lathe([[246, 3.9], [246, 12.5], [305, 12.5], [306.5, 9.2], [497, 9.2], [498, 8.4], [571, 8.4], [572, 8], [610, 8], [610.6, 7], [619.5, 7], [619.5, 6.2], [619.9, 5.0], [619.9, 3.9], [246, 3.9]], { seg: 28 }), 'steel_dark');

  // ---- rear sight block with ramps, leaf channel, gas tube lock lever
  let rsb = prof([[240, 11, 0.6], [240, 35.4, 1.6], [262, 37.0, 26], [292, 42.6, 5], [301, 40.2, 3], [305, 31, 2], [305, 4, 1], [248, 4, 0.6], [248, 11, 0.6]], { w: 25, bevel: 1.1, curveSeg: 6 });
  rsb = cut(rsb, [cutters.box([267.5, 45, 0], [63, 18, 14.2]), holeS(23, 0, 9.6, 300, 320)]);
  g.add(rsb, 'steel');
  for (const side of [1, -1]) {
    const ax = side > 0 ? 'w' : '-w';
    g.add(pinHead([258, 8, side * 12.45], 2.0, ax), 'steel_dark');
    g.add(pinHead([296, 39.6, side * 12.45], 1.9, ax), 'steel_dark');   // leaf hinge pin
  }
  g.add(prof([[287, 17, 4], [302.5, 17.5, 3], [303.5, 27, 3], [292, 34.5, 2], [281.5, 38, 1.4], [279.5, 35, 1.4], [286, 26, 4]], { w: 2.0, cw: 13.45, bevel: 0.5 }), 'steel');
  g.add(head([295, 23, 14.4], [[0, 0], [0, 4.2], [0.6, 4.0], [1.1, 3.2], [1.1, 0]], 'w'), 'steel');
  g.add(cbox([295, 23, 15.55], [0.8, 5, 0.4], { r: 0.15 }), 'steel_dark');
  // leaf spring under the leaf (seen between the cheeks)
  g.add(prof([[262, 36.2, 1], [294, 39.2, 1], [294, 40.4, 1], [262, 37.4, 1]], { w: 9, bevel: 0.3 }), 'steel_dark');

  // ---- rear sight leaf (part), notch at the rear end, range ticks, slider
  const leaf = g.part('leaf', { pivot: [296, 40.6, 0] });
  const leafTop = (s) => lerp(45.2, 43.2, (s - 214) / (297.5 - 214));
  leaf.add(prof([[214, 42.6, 0.6], [296, 40.4, 2], [297.6, 43.0, 1.4], [214, 45.2, 0.6]], { w: 12.6, bevel: 0.5 }), 'steel');
  {
    // upturned notch plate at the rear of the leaf: U notch, bottom on the sight line (t = 46.5)
    const u = [];
    for (let i = 0; i <= 6; i++) { const a = Math.PI * (i / 6); u.push([1.35 * Math.cos(a), 47.85 - 1.35 * Math.sin(a)]); }
    const plate = rpoly([[-6.6, 42.6, 0.5], [6.6, 42.6, 0.5], [6.6, 49.3, 1.2], [1.35, 49.3, 0.35], ...u.map(([w, t]) => [w, t, 0]), [-1.35, 49.3, 0.35], [-6.6, 49.3, 1.2]], 2);
    leaf.add(densify(section(plate, 210.8, 216.4, { bevel: 0.45, bevelSeg: 1 }), 2.5), 'steel');
  }
  for (let i = 0; i < 10; i++) { const s = 226 + i * 6.6; leaf.add(cbox([s, leafTop(s) + 0.1, i % 2 ? 2.2 : 0], [0.7, 0.5, i % 2 ? 2.6 : 5.4], { r: 0.15 }), 'steel_bright'); }
  leaf.add(densify(cbox([248, 41.8, 0], [11, 7.6, 16.2], { r: 1.1 }), 2.5), 'steel');
  for (const side of [1, -1]) leaf.add(cbox([243.6, 41.4, side * 8.6], [3.2, 5.2, 1.8], { r: 0.5 }), 'steel_bright');

  // ---- handguard retainers
  // receiver-side cup holding the rear of the lower handguard
  g.add(section(band(cupPath(18.8, 9.5, -30.2, 5), cupPath(17.6, 9.5, -29.0, 4)), 247, 262, { bevel: 0.4 }), 'steel');
  g.add(rivet([254.5, -18, 18.75], 1.8, 'w'), 'steel');
  g.add(rivet([254.5, -18, -18.75], 1.8, '-w'), 'steel');
  // front retainer band, latch lever (right) and sling loop (left)
  g.add(section([[18.8, 11.8, 3], [-18.8, 11.8, 3], [-18.8, -30.2, 5], [18.8, -30.2, 5]], 466.5, 480, {
    bevel: 0.5, curveSeg: 3, holes: [[[17.6, 10.6, 2], [-17.6, 10.6, 2], [-17.6, -29.0, 4], [17.6, -29.0, 4]]],
  }), 'steel');
  g.add(prof([[452, -3.2, 2], [471, -5.2, 2], [475.5, -0.5, 2.5], [471, 3.2, 2], [453, 1.2, 2]], { w: 1.8, cw: 19.6, bevel: 0.45 }), 'steel');
  g.add(rivet([471.5, -1, 20.4], 2.2, 'w'), 'steel');
  for (const s of [465, 481.5]) g.add(cbox([s, -12, -19.6], [3.2, 5, 2.6], { r: 0.6 }), 'steel');
  g.add(sweep([[465, -12.2, -21], [473, -12.2, -21.2], [481.5, -12.2, -21], [482.5, -19, -21.2], [473, -24.5, -21.4], [463.5, -19, -21.2]], 1.4, { closed: true, seg: 40, radial: 8 }), 'steel');

  // ---- lower handguard (laminated wood, palm swells) — lofted
  {
    const P = (s) => {
      const inCupR = 1 - smooth((s - 262) / 5), inCupF = smooth((s - 461) / 5);
      const shrink = Math.max(inCupR, inCupF);
      const swell = smooth((s - 290) / 40) * smooth((452 - s) / 30);
      const hl = lerp(19.2 + 2.0 * swell, 17.3, shrink);
      const hm = lerp(18.7 + 1.6 * swell, 17.1, shrink);
      const hb = lerp(16.6 + 0.6 * swell, 15.2, shrink);
      const bot = lerp(-30.6, -28.6, shrink);
      const cr = s < 308 ? 13.1 : 10.2;
      return { hl, hm, hb, bot, cr, lipT: 8.2 };
    };
    const lhgRing = (s) => {
      const { hl, hm, hb, bot, cr, lipT } = P(s);
      const right = [[cr * 0.5, -cr * 0.866, 0], [cr * 0.866, -cr * 0.5, 0], [cr, 0, 0], [cr, lipT, 0.9], [hl, lipT, 1.8], [hl, lipT - 4.5, 1.6], [hm, -12, 10], [hb, bot, 6]];
      const left = right.map(([w, t, r]) => [-w, t, r]).reverse();
      return rpoly([[0, -cr, 0], ...right, [0, bot, 0], ...left], 3).map(([w, t]) => [s, t, w]);
    };
    const ss = [250, 261, 263.5, 266, 274, 290, 306, 309, 330, 360, 390, 420, 444, 456, 461, 463.5, 466, 478.5];
    g.add(loft(ss.map(lhgRing), { crease: 50 }), 'wood');
  }

  // ---- gas tube with vent holes, upper handguard (wood) with its steel retainer
  let gasTube = tube(300, 505, 9.5, 7.9, { t: 23, seg: 20 });
  gasTube = cut(gasTube, [holeW(481, 23, 1.6), holeW(486.5, 23, 1.6), holeW(492, 23, 1.6)]);
  g.add(gasTube, 'steel');
  {
    const uOuter = capPath(15.2, 12.6, 39.6, 10.5, 7);
    const uInner = [[10.7, 12.6]];
    for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI; uInner.push([10.7 * Math.cos(a), 23 + 10.7 * Math.sin(a)]); }
    uInner.push([-10.7, 12.6]);
    g.add(section(band(uOuter, uInner), 306, 476, { bevel: 2.4, bevelSeg: 3 }), 'wood');
    const rOut = capPath(16.0, 12.0, 40.4, 11.2, 7), rIn = capPath(15.0, 12.0, 39.4, 10.2, 7);
    g.add(section(band(rOut, rIn), 466, 474, { bevel: 0.4 }), 'steel');
  }

  // ---- 45° gas block with bayonet lug, cross pin
  g.add(lathe([[496.5, 9.0], [496.5, 12.2], [497.5, 13], [530, 13], [531.5, 12], [531.5, 8.2]], { seg: 28 }), 'steel');
  {
    let gb = prof([[496.5, 6], [496.5, 30.5, 4], [505, 34.6, 8], [514, 33.6, 4], [531.5, 12.5, 3], [531.5, 6]], { w: 21.5, bevel: 4.2, bevelSeg: 3 });
    gb = cut(gb, [holeS(23, 0, 9.6, 480, 503)]);
    g.add(gb, 'steel');
    g.add(head([0, 0, 0], [[0, 0], [0, 2.6], [0.6, 2.2], [0.6, 0]], 's', 12).applyMatrix4(new THREE.Matrix4().makeRotationX(38.5 * DEG)).translate(0, 22.4, -522.6), 'steel_dark');
    let lug = prof([[503, -8, 1], [533, -8, 1], [536.5, -11.5, 1.5], [533.5, -21.5, 1.5], [503, -21.5, 1]], { w: 13, bevel: 0.8 });
    lug = cut(lug, [holeS(-15.5, 0, 3.6, 490, 560)]);
    g.add(lug, 'steel');
    for (const side of [1, -1]) g.add(pinHead([514, -3, side * 12.4], 1.8, side > 0 ? 'w' : '-w'), 'steel_dark');
  }

  // ---- front sight base: collar, tower, protective ears, drum + post, cleaning-rod lug, comp detent
  {
    g.add(lathe([[571, 7.9], [571, 11], [572, 12], [609, 12], [610, 11], [610, 7.9]], { seg: 28 }), 'steel');
    const tower = prof([[575.5, 6], [575.5, 19, 4], [580.5, 30.5, 5], [603.5, 30.5, 5], [608.5, 19, 4], [608.5, 6]], { w: 15.6, bevel: 2.6, bevelSeg: 2 });
    g.add(tower, 'steel');
    for (const side of [1, -1]) {
      const ear = prof([[580.5, 24], [604, 24], [603, 45.5, 6], [597.5, 51, 4], [587, 51, 4], [581.5, 45.5, 6]], { w: 2.2, cw: side * 6.7, bevel: 0.6 });
      g.add(ear, 'steel');
      g.add(pinHead([586, 9, side * 7.75], 1.7, side > 0 ? 'w' : '-w'), 'steel_dark');
    }
    g.add(cyl(-5.7, 5.7, 4.4, { t: 35.5, w: 0, seg: 20 }).rotateY(Math.PI / 2).translate(0, 0, -592), 'steel_dark'); // windage drum
    g.add(cbox([592, 35.5, -5.5], [2.0, 1.2, 0.5], { r: 0.2 }), 'steel_bright');                                     // zero mark
    g.add(cyl(35, 41.4, 1.75, { seg: 12 }).rotateX(Math.PI / 2).translate(0, 0, 0).applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, -592)), 'steel_dark');
    g.add(cyl(41, 46.5, 1.05, { seg: 12, b: 0.25 }).rotateX(Math.PI / 2).applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, -592)), 'steel_dark'); // post
    let rodLug = prof([[577, -6, 1], [610, -6, 1], [610, -20.5, 2], [600, -22.5, 3], [580, -19, 3]], { w: 12, bevel: 0.8 });
    rodLug = cut(rodLug, [holeS(-15.5, 0, 3.9, 560, 640)]);
    g.add(rodLug, 'steel');
    g.add(cyl(606, 612.5, 1.3, { t: -6.5, w: 7.5, seg: 10 }), 'steel_bright'); // spring-loaded comp detent pin
  }

  // ---- slant compensator (open upper-right, lip lower-left), real bore, detent notches
  {
    let comp = lathe([[610.4, 7.05], [610.4, 10.4], [611.2, 11.1], [645.3, 11.1], [646, 10.4], [646, 5.0], [619.6, 5.0], [619.6, 7.05], [610.4, 7.05]], { seg: 32 });
    const slant = xform(cutters.box([0, 0, 0], [80, 80, 80]), { rot: [42.2, 0, 0], move: [636 + 40 * 0.74, 40 * 0.67, 0] });
    const notches = [];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; notches.push(cutters.box([610.6, Math.sin(a) * 10.4, Math.cos(a) * 10.4], [2.4, 2.4, 2.4])); }
    comp = cut(comp, [slant, ...notches]);
    g.add(comp, 'steel_dark');
  }

  // ---- cleaning rod under the barrel, head held in the FSB lug
  g.add(cyl(464, 606, 3.0, { t: -15.5, seg: 12 }), 'steel');
  {
    let rodHead = lathe([[600, 0], [600, 3.0], [602, 3.7], [614, 3.7], [615.2, 3.0], [615.2, 0]], { t: -15.5, seg: 14 });
    rodHead = cut(rodHead, [holeW(610, -15.5, 1.6)]);
    g.add(rodHead, 'steel');
  }

  // =========================================================================== STOCK (laminated wood) + butt plate
  {
    const sec = (x, grow = 0) => {
      const top = stockTop(x) + grow, bot = stockBot(x) - grow;
      const hw = 14.4 + 5.6 * clamp01(x / STOCK_L) + grow;
      const rT = Math.min(hw - 0.8, 11 + 2.5 * clamp01(x / STOCK_L) + grow);
      const mid = (top + bot) / 2;
      return rpoly([[hw, bot, 7, 4], [hw + 0.9, mid, 60, 4], [hw, top, rT, 5], [-hw, top, rT, 5], [-hw - 0.9, mid, 60, 4], [-hw, bot, 7, 4]], 4);
    };
    const xs = [];
    for (let i = 0; i <= 20; i++) xs.push((i / 20) * STOCK_L);
    xs.unshift(-0.8);
    g.add(loft(xs.map((x) => sec(Math.max(0, x)).map(([w, t]) => [-x, t, w])), { crease: 50 }), 'wood');
    // butt plate: stamped steel cap following the stock outline, trap door seam, two screws
    const bp = [STOCK_L - 0.2, STOCK_L + 3.6, STOCK_L + 4.6, STOCK_L + 5.0].map((x, i) => sec(STOCK_L, [0.45, 0.45, 0.1, -0.9][i]).map(([w, t]) => [-x, t, w]));
    let plate = loft(bp, { crease: 40 });
    const doorO = rpoly([[9, -90, 5], [9, -46, 5], [-9, -46, 5], [-9, -90, 5]], 3);
    const doorI = rpoly([[8.2, -89.2, 4.2], [8.2, -46.8, 4.2], [-8.2, -46.8, 4.2], [-8.2, -89.2, 4.2]], 3);
    const seam = section(doorO, -STOCK_L - 6, -STOCK_L - 4.2, { bevel: 0, holes: [doorI] });
    plate = cut(plate, [seam]);
    g.add(plate, 'steel');
    g.add(cbox([-STOCK_L - 5.0, -43.6, 0], [0.8, 2.4, 6], { r: 0.3 }), 'steel_bright');   // trap door latch
    for (const t of [-30, -134]) {
      g.add(head([-STOCK_L - 5.0, t, 0], [[0, 0], [0, 3.6], [0.5, 3.4], [0.9, 2.6], [0.9, 0]], '-s'), 'steel');
      g.add(cbox([-STOCK_L - 5.95, t, 0], [0.4, 0.7, 5.4], { r: 0.1 }), 'steel_dark');
    }
    // rear sling loop on the left side of the wrist (plate + 2 screws + loop)
    const ls = -58, lt = -30;
    g.add(cbox([ls, lt, -16.2], [30, 9, 1.6], { r: 0.6 }), 'steel');
    for (const s of [ls - 10, ls + 10]) g.add(head([s, lt, -17.0], [[0, 0], [0, 2.4], [0.4, 2.2], [0.7, 1.6], [0.7, 0]], '-w', 12), 'steel');
    g.add(sweep([[ls - 6, lt - 3.5, -17.4], [ls, lt - 3.8, -17.6], [ls + 6, lt - 3.5, -17.4], [ls + 6.5, lt - 11, -17.8], [ls, lt - 15.5, -18.0], [ls - 6.5, lt - 11, -17.8]], 1.35, { closed: true, seg: 36, radial: 8 }), 'steel');
  }

  // =========================================================================== CHARGING HANDLE + CARRIER (bolt)
  {
    const bolt = g.part('bolt', { pivot: [214, 9, 20], extras: { travel: 0.105 } });
    // carrier body seen through the port and the handle slot
    let carrier = prof([[124, 2.4, 3], [205, 2.4, 2], [226, 5.5, 2], [226, 30.5, 3], [124, 30.5, 6]], { w: 20.4, bevel: 1.0 });
    carrier = cut(carrier, [cutters.pocketW([[150, 12, 3], [196, 12, 3], [196, 22, 3], [150, 22, 3]], 9.4, 4)]);  // lightening relief
    bolt.add(carrier, 'steel_bright');
    bolt.add(cyl(226, 330, 6.8, { t: 23, seg: 18 }), 'steel_bright');                                            // piston extension
    // rotating bolt with extractor and cam lug
    bolt.add(cyl(150, 199.4, 9.1, { seg: 22 }), 'steel_bright');
    bolt.add(cbox([191, 2.5, 8.6], [16, 4.4, 2.6], { r: 0.6 }), 'steel_dark');                                    // extractor
    bolt.add(cbox([166, 6, 7.6], [9, 6, 5], { r: 1.2 }), 'steel_bright');                                         // cam lug
    // the handle: flat stem bent out of the carrier, upswept, ribbed knob
    bolt.add(prof([[204, 7.7, 1.2], [222, 7.7, 1.2], [222, 10.5, 1.2], [204, 10.5, 1.2]], { w: 8.8, cw: 13.3, bevel: 0.6 }), 'steel_bright');
    bolt.add(sweep([[213, 9.1, 16.2], [213.2, 9.6, 20], [213.8, 11, 23.5], [214.4, 12.6, 26.5]], 3.0, { seg: 14, radial: 14 }), 'steel_bright');
    const knob = head([0, 0, 0], [[0, 0], [0, 4.4], [0.8, 5.6], [2.0, 6.3], [6.0, 6.5], [8.2, 6.0], [9.6, 4.4], [10.2, 2.2], [10.4, 0]], 'w', 22);
    xform(knob, { rot: [0, 0, 12], move: [214.6, 12.9, 25.2] });
    bolt.add(knob, 'steel_bright');
  }

  // =========================================================================== MAGAZINE (plum, curved, lofted)
  {
    const mag = g.part('mag', { pivot: [MAG.s, MAG.t, 0], extras: { drop: true } });
    const K = [MAG.s + Math.cos(MAG.a0) * MAG.R, MAG.t + Math.sin(MAG.a0) * MAG.R];
    const frame = (phi) => {
      const a = MAG.a0 + phi;
      const P = [K[0] - MAG.R * Math.cos(a), K[1] - MAG.R * Math.sin(a)];
      const er = [-Math.cos(a), -Math.sin(a)];           // radial: towards the rear (outer) edge
      const T = [Math.sin(a), -Math.cos(a)];             // tangent: down along the magazine
      return { a, P, er, T };
    };
    const at = (phi, xr, along = 0) => { const f = frame(phi); return [f.P[0] + f.er[0] * xr + f.T[0] * along, f.P[1] + f.er[1] * xr + f.T[1] * along]; };
    const phiTop = -2.8 * DEG, phiBot = 38 * DEG;
    const H = MAG.depth / 2;
    const ring = (phi, sc = 1) => {
      const env = smooth((phi - phiTop - 9 * DEG) / (8 * DEG)) * smooth((phiBot - phi - 2 * DEG) / (5 * DEG));
      const hw = MAG.hw * sc, hd = H * sc, rib = 0.75 * env;
      const right = [[-hd, hw, 6], [-24.5, hw, 0.6, 1], [-23.5, hw + rib, 0.6, 1], [-18.5, hw + rib, 0.6, 1], [-17.5, hw, 0.6, 1],
        [18.5, hw, 0.6, 1], [19.5, hw + rib, 0.6, 1], [24.5, hw + rib, 0.6, 1], [25.5, hw, 0.6, 1], [hd, hw, 4.5]];
      const left = right.map(([x, w, r, k]) => [x, -w, r, k]).reverse();
      const f = frame(phi);
      return rpoly([...right, ...left], 3).map(([x, w]) => [f.P[0] + f.er[0] * x, f.P[1] + f.er[1] * x, w]);
    };
    const rings = [];
    const n = 18;
    for (let i = 0; i <= n; i++) rings.push(ring(lerp(phiTop, phiBot, i / n)));
    mag.add(loft(rings, { crease: 55 }), 'bakelite_plum');
    // steel floor plate with the rear locking tab
    const fb = frame(phiBot);
    const fpC = at(phiBot, 0.6, 1.9);
    mag.add(cbox([fpC[0], fpC[1], 0], [61, 3.8, 29.6], { r: 1.4, rot: [fb.a / DEG, 0, 0] }), 'steel');
    const tab = at(phiBot, 30.8, 0.4);
    mag.add(cbox([tab[0], tab[1], 0], [4.2, 6.5, 12], { r: 1, rot: [fb.a / DEG, 0, 0] }), 'steel');
    // steel locking lugs (front hooks into the trunnion, rear meets the catch)
    const ft = frame(phiTop);
    const fl = at(phiTop, -H - 2.6, 8.5);
    mag.add(cbox([fl[0], fl[1], 0], [5.6, 9, 14], { r: 1.2, rot: [ft.a / DEG, 0, 0] }), 'steel');
    const rl = at(phiTop + 2 * DEG, H + 1.6, 14);
    mag.add(cbox([rl[0], rl[1], 0], [3.6, 6.2, 12], { r: 0.9, rot: [ft.a / DEG, 0, 0] }), 'steel');
    // feed lips (steel inserts) and the top cartridge (7.62x39, steel case lacquer -> brass tone, FMJ)
    const lipSec = [[13.4, -2.2, 0.4], [13.4, 7.4, 1.6], [6.4, 9.4, 1.2], [5.6, 8.2, 0.4], [11.8, 6.6, 1], [12.2, -2.2, 0.4]];
    const lipGeo = section(lipSec, -24, 22, { bevel: 0.35, curveSeg: 3, bevelSeg: 1 });
    const lips = merge([lipGeo, mirrorW(lipGeo)]);
    const top = frame(phiTop);
    xform(lips, { rot: [top.a / DEG - 0, 0, 0], move: [top.P[0], top.P[1], 0] });
    mag.add(lips, 'steel');
    const rnd = lathe([[-25, 0], [-25, 5.0], [-24.4, 5.6], [-23.6, 5.6], [-23, 4.7], [-21.6, 4.7], [-21, 5.6], [5, 5.0], [8.5, 4.4], [12, 4.2], [12, 0]], { seg: 18, t: 4.3, w: 3.0 });
    const bul = lathe([[11.9, 0], [11.9, 3.95], [20, 3.95], [24, 3.3], [28, 2.0], [31, 0.6], [31.4, 0]], { seg: 18, t: 4.3, w: 3.0 });
    for (const geo of [rnd, bul]) xform(geo, { rot: [top.a / DEG, 0, 0], move: [top.P[0], top.P[1], 0] });
    mag.add(rnd, 'brass');
    mag.add(bul, 'copper');
  }

  // =========================================================================== SOCKETS / META
  g.socket('muzzle', [640, 0, 0]);
  g.socket('eject', [165, 6, 15.5], { dir: [0.15, 0.55, 1] });
  g.socket('grip_r', [42.4, -77.8, 0], { rot: [0, 0, -18] });
  g.socket('grip_l', [385, -12, 0]);
  g.socket('magwell', [176, -62, 0]);
  g.socket('charge', [215, 13, 30]);
  g.socket('sight_rear', [213.6, 46.5, 0]);
  g.socket('sight_front', [592, 46.5, 0]);
  g.meta({
    grip: 'rifle', support: 'handguard', reload: 'mag_curved', chargeSide: 'right',
    name: '草原 Steppe-47',
    notes: 'AKM pattern. bolt = carrier + charging handle (right), travel 0.105 m. selector pivots on its rear axle about w (safe 0°, auto -12°, semi -24°). leaf = rear sight leaf hinged at its front. mag rocks forward-then-down out of the well (front lug hooks the trunnion).',
  });
  return g;
}
