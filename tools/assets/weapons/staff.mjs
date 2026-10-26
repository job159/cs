// 應龍．御霆 Yinglong Stormherald — X04 神兵 magic staff, docs/PREMIUM_WEAPONS.md §2.31.
// A Shang / Zhou bronze dragon staff: 「應龍處南極」— the winged thunder dragon. From the butt up:
//   - butt: a cast bronze 鐏 (spike with 蕉葉紋 banana-leaf relief, beaded lips, a 雲雷紋 collar, four notched 扉棱
//     flanges), a gold collar;
//   - shaft: black lacquer (snake-belly 斷紋 in the shader) with bronze bands carrying gold 雲雷紋 between bead borders,
//     gold ferrules with granulation; two grips in black leather wrapped as a real stepped helix (skived lip, a little
//     hand-wrapped jitter, a row of red silk stitches) with red silk cord bindings at both ends;
//   - the dragon's body coils 1.35 turns up the shaft above the right hand: a smooth lofted helix (tail 3.5 -> 12 mm)
//     clad in real cast shield scales (staggered rows, each with a bevelled rim and keel, its free edge standing proud
//     towards the tail), separate chamfered belly plates on the shaft side, one continuous scalloped crest, a flame tuft
//     at the tail; a foreleg on the player's side and a hind leg (thigh, flame tuft at the elbow, scaled forearm, four
//     toes with knuckle pads hooked round the shaft, curved bone talons); a granulated gold ring where the neck enters
//   - the head (sculpted lofts in Shang bronze planes): skull and upper jaw (high crown, brow shelf, a planar bridge with
//     a notched 扉棱 flange, corner ridges where the planes meet), 臣字目 almond eyes (cast lids, long outer tails, the
//     crystal sunk half into the socket), flat 如意 nostril scrolls, cheek plates of cloud curls and 鱗紋, a 雲雷紋 band
//     down the snout, a gold bead along the lips, shield scales on the crown and the bridge; a hinged lower jaw (fx_jaw)
//     with a chin, a side ridge, belly plates and a flame beard underneath; inside the mouth: gums with tooth sockets,
//     a ridged palate, a dark throat, curved ivory teeth, grooved fangs and a grooved tongue with a forked tip; fluted
//     oval antlers with a coronet burr and gold tine caps, fluted flame mane and cheek fins, gold whiskers sweeping back
//     along the jaw line to a curl;
//   - on top: a cast cloud-scroll bracket rising off the crown to a pivot cup holding the armillary (渾天儀): fx_ring1
//     (gold, 28 ticks, studs; spins about t) > fx_ring2 (bronze band with gold 雲雷紋, pinned at ±s, spins about s) >
//     fx_ring3 (gold, beaded, pinned at ±w, spins about w) — at rest the three rings stand orthogonal — and the 雷珠 hero
//     focus floating in the middle (fx_pearl: a glass shell engraved with 北斗 / 南斗 star maps in gold, a cut crystal
//     thunder seed inside it throwing glowing lightning forks to the shell);
//   - the wings (fx_wingL / fx_wingR): floating off bronze wing mounts on the head with a glowing seam: a bronze wing
//     bone (knuckle boss, gold talon), seven primary feathers in cloisonné (bronze plate with cast barbs on the back;
//     deep, mid and pale enamel fields with a white eye spot, gold border wire, rachis and raked barb wires), six
//     tapering gold-leaf coverts with alternating curls and a granulated edge;
//   - fx_tassel: red silk tassel with a carved jade bead under a gold cap, hung off the back of the mane.
// Side view, mm: t along the staff (head +t), s = the way the dragon faces, w right. Right hand at the origin.
import * as THREE from 'three';
import { Gun, V, lathe, sphere, profile, xform } from '../lib/gunkit.mjs';
import { bakeMeshes } from '../lib/bake.mjs';
import { postBake } from './m4.mjs';
import {
  D2R, TAU, clamp01, smooth, lerp, cat, vadd, vsub, vmul, vdot, vcross, vlen, vnorm, vlerp, vfr,
  lax, along, aimDir, domeAt, dome, loft, ttube, curveFn, insetPoly, ribbonT, fanT, mapTris, cylMap, thunderT, curlT,
  petal, helixCord, tessellateFat, sweep, brilliant, wireT, clipHalf, scaleT, ellip, tooth, ftube,
} from '../lib/sculpt.mjs';

const BRONZE = 'bronze_aged', GOLD = 'gold', LAQ = 'lacquer_black', LEATHER = 'leather_black', SILK = 'silk_red', BONE = 'bone';
const JADE = 'glaze_jade', TEAL = 'glaze_teal', TURQ = 'glaze_turquoise', COBALT = 'glaze_cobalt', INK = 'glaze_inkteal', PORC = 'porcelain';
const TONGUE = 'glaze_vermilion', GUM = 'lacquer_red', PEARL = 'crystal', EYE = 'glass', GLOW = 'glow_cyan', BEAD = 'jade', OBS = 'obsidian';

// ------------------------------------------------------------------------------------------ layout (mm)
export const STAFF = {
  r: 15,                         // shaft radius (grip zone)
  top: 347, butt: -1192,         // socket top / spike tip
  gripL: -250,
  C: [12, 500, 0],               // armillary centre = 雷珠
  R1: 56, R2: 48.5, R3: 41.5, pearl: 20.5,
  head: [-10, 350, 0], ang: 30, headScale: 1.28,  // head origin (back of the skull, bottom), upward tilt, sculpt scale
  jaw: 24,                       // lower jaw opening at rest (deg)
};
const S = STAFF;
const se = (x, n) => Math.sign(x) * Math.pow(Math.abs(x), 2 / n);
const sgn = (x) => (x < 0 ? -1 : 1);
const UPV = [0, 1, 0], SV = [1, 0, 0], WV = [0, 0, 1];
const hash = (k) => { const x = Math.sin(k * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/** torus about `axis` through c (major R, tube r) */
function torusAt(c, axis, R, r, seg = 40, radial = 8) {
  const pts = [];
  for (let i = 0; i <= radial; i++) { const a = i / radial * TAU; pts.push([r * Math.sin(a), R + r * Math.cos(a)]); }
  return along(pts, c, axis, seg, 70);
}
/** ring with a chamfered rectangular section (radial `th` inwards from R, axial width wd) round axis N through C;
 *  E1 / E2 span its plane */
function bandRing(C, E1, E2, N, R, th, wd, { seg = 72, ch = 0.8 } = {}) {
  const h = wd / 2, sec = [[-th, -h + ch], [-th + ch, -h], [-ch, -h], [0, -h + ch], [0, h - ch], [-ch, h], [-th + ch, h], [-th, h - ch]];
  const rings = [];
  for (let i = 0; i < seg; i++) {
    const a = i / seg * TAU, rd = vadd(vmul(E1, Math.cos(a)), vmul(E2, Math.sin(a)));
    rings.push(sec.map(([dr, da]) => vadd(vadd(C, vmul(rd, R + dr)), vmul(N, da))));
  }
  return loft(rings, { wrap: true, crease: 50 });
}
const ringPt = (C, E1, E2, R, a) => vadd(C, vadd(vmul(E1, R * Math.cos(a)), vmul(E2, R * Math.sin(a))));
/** cloud curl as a wire (cheaper than curlT's ribbon): 1.35 turns with a short tail, tapering in */
function curlW(cu, cv, r0, dir, a0, z0, z1, lw = 0.9) {
  const ta = a0 * D2R, pts = [[cu + Math.cos(ta) * r0 + Math.sin(ta) * dir * r0 * 1.3, cv + Math.sin(ta) * r0 - Math.cos(ta) * dir * r0 * 1.3]];
  for (let i = 0; i <= 12; i++) { const u = i / 12, a = (a0 + dir * u * 1.35 * 360) * D2R, rr = r0 * (1 - 0.7 * u); pts.push([cu + Math.cos(a) * rr, cv + Math.sin(a) * rr]); }
  return wireT(pts, (f) => lw * (1 - 0.35 * f), z0, z1, { step: 2.6 });
}
/** unit normal of a design-space map at (u, v, z) */
const mapN = (map, u, v, z) => vnorm(vsub(map(u, v, z + 0.2), map(u, v, z)));

export default function build() {
  const g = new Gun('staff');

  // ======================================================================== butt (鐏)
  {
    const B = S.butt, sp = [[0, 0], [10, 3.6], [30, 7.2], [48, 9.6], [52, 11.5], [54, 15.2], [57, 16.6], [92, 17.4], [95, 19.2], [100, 19.3], [103, 17.2], [118, 16.4], [121, 18.2], [127, 18.2], [130, 15], [130, 0]];
    g.add(lax(sp, [0, B, 0], 't', 32), BRONZE);
    // granulated lips
    for (const [t, r] of [[B + 97.5, 19.3], [B + 124, 18.2]]) for (let k = 0; k < 22; k++) { const a = k / 22 * TAU + 0.07; g.add(dome([Math.cos(a) * r, t, Math.sin(a) * r], [Math.cos(a), 0, Math.sin(a)], 1.25), GOLD); }
    // 蕉葉紋: six banana leaves cast on the spike, points down, a midrib each
    const rSp = curveFn(sp.slice(0, 5)), spike = (u, v, z) => { const a = u / 10, r = rSp(v - B) + z; return [Math.cos(a) * r, v, Math.sin(a) * r]; };
    const leaves = [];
    for (let k = 0; k < 6; k++) {
      const a = (k + 0.5) / 6 * TAU * 10, w = 0.44 * 10;
      leaves.push(wireT([[a - w, B + 46], [a - w * 0.55, B + 30], [a - w * 0.18, B + 16], [a, B + 8], [a + w * 0.18, B + 16], [a + w * 0.55, B + 30], [a + w, B + 46]], 1.0, -0.3, 0.55, { step: 6 }));
      leaves.push(wireT([[a, B + 45], [a, B + 14]], 0.7, -0.3, 0.45, { step: 4 }));
    }
    g.add(mapTris(cat(...leaves), spike, 50), BRONZE);
    // 雲雷紋 on the collar between the flanges
    g.add(mapTris(thunderT(0, TAU * 17.25, B + 62, B + 87, -0.25, 0.6, { lw: 1.8, gap: 1.75 }), cylMap(17.05), 50), BRONZE);
    // four notched 扉棱 flanges
    const fl = [[16, B + 56], [20, B + 58], [23.5, B + 64], [21, B + 70], [25, B + 76], [22, B + 82], [25.5, B + 88], [20.5, B + 92], [17, B + 94]];
    for (let k = 0; k < 4; k++) g.add(xform(profile(fl.map(([r, t]) => [r, t, 0.6]), { w: 3.2, bevel: 0.8, curveSeg: 2 }), { rot: [0, 45 + k * 90, 0] }), BRONZE);
    g.add(lax([[0, 15], [0, 17.2], [1, 17.9], [7, 17.9], [8, 17.2], [8, 15]], [0, B + 130, 0], 't', 32), GOLD);
  }

  // ======================================================================== shaft
  // lacquer core: butt collar -> socket. Not bake-tessellated: its lathe stations sit dense only where the bands,
  // ferrules, wraps and the coil throw AO, sparse along the bare lacquer
  {
    const t0 = S.butt + 135, prof = [[0, 14.2], [400, 14.6], [880, 15], [1150, 15.2], [1380, 15.6]];
    const rAt = (x) => { for (let i = 0; i < prof.length - 1; i++) if (x <= prof[i + 1][0]) return lerp(prof[i][1], prof[i + 1][1], (x - prof[i][0]) / (prof[i + 1][0] - prof[i][0])); return 15.6; };
    const edges = [-138, -118, -570, -550, -870, -850, -611, -609, -811, -809, -1011, -1009, -337, -327, -175, -165, -91, -81, 81, 91, 330];
    const hidden = [[-322, -180], [-76, 76]], coilZ = [100, 305];
    const pts = [[0, 0]];
    for (let t = t0; t < t0 + 1380;) {
      pts.push([t - t0, rAt(t - t0)]);
      const dist = Math.min(...edges.map((e) => Math.abs(e - t)));
      let step = dist < 10 ? 7 : Math.min(100, 7 + (dist - 10) * 1.1);
      if (t > coilZ[0] && t < coilZ[1]) step = Math.min(step, 12);
      if (hidden.some(([a, b]) => t > a + 8 && t < b - 8)) step = Math.max(step, 30);
      t += step;
    }
    pts.push([1380, 15.6], [1387, 0]);
    g.add(lax(pts, [0, t0, 0], 't', 30), LAQ);
  }
  // socket the neck rises from: a bronze collar with a bead row and a ring of lotus petals cupping the throat
  {
    g.add(lax([[0, 15.6], [2, 17.6], [8, 17.8], [9.5, 16.8], [11, 16.8], [12, 15.4], [12, 0]], [0, 318, 0], 't', 36), BRONZE);
    for (let k = 0; k < 20; k++) { const a = k / 20 * TAU; g.add(dome([Math.cos(a) * 17.8, 323, Math.sin(a) * 17.8], [Math.cos(a), 0, Math.sin(a)], 1.1), GOLD); }
    for (let k = 0; k < 8; k++) {
      const a = (k + 0.5) / 8 * TAU, R = [Math.cos(a), 0, Math.sin(a)], T = [-Math.sin(a), 0, Math.cos(a)];
      g.add(petal([Math.cos(a) * 13.5, 327, Math.sin(a) * 13.5], vnorm(vadd(UPV, vmul(R, 0.42))), R, T, 17, 6, 1.6, { bulge: -0.6, flick: 3.2, nu: 8, na: 12, groove: 0.3 }), BRONZE);
    }
  }

  /** gold ferrule (height h) with a granulated waist at t */
  const ferrule = (t, h = 10, r = 15.4) => {
    g.add(lax([[-h / 2, r - 0.2], [-h / 2, r + 1.4], [-h / 2 + 1, r + 2.2], [-1.4, r + 2.2], [-0.8, r + 1.6], [0.8, r + 1.6], [1.4, r + 2.2], [h / 2 - 1, r + 2.2], [h / 2, r + 1.4], [h / 2, r - 0.2]], [0, t, 0], 't', 32), GOLD);
    for (let k = 0; k < 18; k++) { const a = (k + 0.5) / 18 * TAU; g.add(dome([Math.cos(a) * (r + 1.6), t, Math.sin(a) * (r + 1.6)], [Math.cos(a), 0, Math.sin(a)], 0.9, 0.7, 5), GOLD); }
  };
  /** bronze band with gold 雲雷紋 between bead borders (height 20 at t) */
  const thunderBand = (t, R = 15.6, lw = 1.0, gap = 0.85) => {
    g.add(lax([[-10, R - 0.6], [-10, R + 0.6], [-9, R + 1.1], [9, R + 1.1], [10, R + 0.6], [10, R - 0.6]], [0, t, 0], 't', 40), BRONZE);
    const C = 2 * Math.PI * (R + 1.1);
    g.add(mapTris(thunderT(0, C, t - 7.6, t + 7.6, -0.2, 0.75, { lw, gap }), cylMap(R + 1.1)), GOLD);
    for (const dt of [-8.9, 8.9]) for (let k = 0; k < 26; k++) { const a = (k + (dt > 0 ? 0.5 : 0)) / 26 * TAU; g.add(dome([Math.cos(a) * (R + 1.1), t + dt, Math.sin(a) * (R + 1.1)], [Math.cos(a), 0, Math.sin(a)], 0.75, 0.58, 5), GOLD); }
  };
  /** stepped leather helix (each turn rides over the last, skived leading lip, hand-wrapped jitter in pitch and width)
   *  from t0 to t1, a row of red silk stitches along every lip, silk cord bindings at both ends */
  const wrap = (t0, t1, { R = 15, pitch = 11, width = 13, th = 1.35, a0 = 0, seed = 1 } = {}) => {
    const turns = (t1 - t0 - width) / pitch, n = Math.ceil(turns * 15), hw0 = width / 2, rings = [];
    const jit = (u, k) => 0.5 * Math.sin(u * turns * 2.3 + seed * 3.3 + k) + 0.5 * Math.sin(u * turns * 5.1 + seed + k * 2.1);
    const tcAt = (u) => t0 + hw0 + u * turns * pitch + 0.45 * jit(u, 0), hwAt = (u) => hw0 * (1 + 0.045 * jit(u, 1));
    for (let i = 0; i <= n; i++) {
      const u = i / n, a = a0 + u * turns * TAU, tc = tcAt(u), hw = hwAt(u), c = Math.cos(a), s = Math.sin(a);
      const sec = [[R + th, -hw], [R + th * 1.5, -hw + 0.35], [R + th * 2, -hw + 1.5], [R + th * 1.85, hw - 3], [R + th * 1.15, hw - 0.45], [R, hw]];
      rings.push(sec.map(([r, dt]) => [c * r, tc + dt, s * r]));
    }
    g.add(loft(rings, { crease: 32 }), LEATHER);
    // stitches: little raised lozenges every 4.8 mm along each lip
    const Rs = R + th * 2, T = [], ns = Math.floor(turns * TAU * Rs / 4.8);
    for (let k = 1; k < ns; k++) {
      const u = k / ns, a = a0 + u * turns * TAU, c = [a * Rs, tcAt(u) - hwAt(u) + 1.9];
      const dir = vnorm([Rs * TAU, pitch, 0]), dx = dir[0], dy = dir[1], q = (x, y, z) => [c[0] + dx * x - dy * y, c[1] + dy * x + dx * y, z];
      const P = [q(-1.15, 0, -0.15), q(0, -0.36, -0.15), q(1.15, 0, -0.15), q(0, 0.36, -0.15)], top = q(0, 0, 0.32);
      for (let j = 0; j < 4; j++) T.push(...P[j], ...P[(j + 1) % 4], ...top);
    }
    g.add(mapTris(T, cylMap(Rs), 50), SILK);
    for (const [tb, n2] of [[t0 - 0.6, 5], [t1 - 5 * 2.3 + 0.6, 5]]) g.add(helixCord(R + 1.25, tb, n2, 2.3, 1.15, { a0: a0 + 0.6, radial: 4, perTurn: 14 }), SILK);
  };
  // upper grip (right hand, t 0) and lower grip (left hand, t -250)
  wrap(-80, 80, { a0: 0.3, seed: 1 }); ferrule(-86); ferrule(86);
  wrap(-326, -176, { a0: 1.7, seed: 2 }); ferrule(-332); ferrule(-170);
  thunderBand(-128);
  thunderBand(-560, 15.6, 1.2, 1.05); thunderBand(-860, 15.6, 1.2, 1.05);
  for (const t of [-610, -810, -1010]) g.add(lax([[-1.2, 14.6], [-1.2, 15.6], [0, 16.2], [1.2, 15.6], [1.2, 14.6]], [0, t, 0], 't', 32), GOLD);
  // gold inlay on the bare lacquer: a hairline 雲雷紋 inlay band (flush, between gold hairlines) every 90-200 mm, and the
  // 北斗 seven stars inlaid twice down the long stretch above the lower grip (gold studs joined by fine wire), so no
  // stretch of the shaft is a plain black tube at 15 cm
  {
    const shaftR = (t) => 14.2 + 1.4 * clamp01((t - (S.butt + 135)) / 1380);
    const inlay = (t, h = 6.5) => {
      const r = shaftR(t), C = TAU * r;
      g.add(mapTris(thunderT(0, C, t - h / 2, t + h / 2, -0.12, 0.2, { lw: 0.55, gap: 0.45 }), cylMap(r), 50), GOLD);
    };
    for (const t of [-1032, -940, -830, -710, -590, -152, -104]) inlay(t, t > -200 || t === -830 || t === -590 ? 5 : 6.5);
    const dipper = [[0, 0], [5, 27], [3, 54], [9, 79], [27, 86], [30, 118], [11, 123]], links = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]];
    for (const a0 of [0.35, 0.35 + Math.PI]) {
      const t0 = -538, r = shaftR(-450), M = cylMap(r, { a0 }), W = [];
      for (const [i, j] of links) W.push(wireT([[dipper[i][0], t0 + dipper[i][1]], [dipper[j][0], t0 + dipper[j][1]]], 0.5, -0.1, 0.16, { step: 3 }));
      g.add(mapTris(cat(...W), M, 50), GOLD);
      for (const [u, v] of dipper) { const p = M(u, t0 + v, 0), n = vnorm([p[0], 0, p[2]]); g.add(dome(p, n, 1.35, 0.8, 10), GOLD); g.add(torusAt(vadd(p, vmul(n, -0.05)), n, 2.2, 0.26, 20, 5), GOLD); }
    }
  }

  // ======================================================================== the dragon: body coil + neck
  const hF = [Math.cos(S.ang * D2R), Math.sin(S.ang * D2R), 0], hU = [-hF[1], hF[0], 0];
  const HP = (x, y, z) => vfr(S.head, hF, hU, WV, x, y, z);
  // the head is sculpted at 1:1 in head-local mm and scaled up about its origin (HSC): HPw = where a head point ends up
  const HSC = S.headScale, HPw = (x, y, z) => vfr(S.head, hF, hU, WV, x * HSC, y * HSC, z * HSC);
  const hsc = (geo) => xform(geo, { scale: HSC, pivot: S.head }), hsp = (p) => vadd(S.head, vmul(vsub(p, S.head), HSC));
  const addH = (geo, mat) => g.add(hsc(geo), mat);
  /** geometry authored in head-local (x, y, z) as (s, t, w), then placed on the head */
  const toHead = (geo) => xform(geo, { rot: [S.ang, 0, 0], move: S.head });
  let coil;
  {
    // centreline: 1.35 turns up the shaft (t 108 -> 296), ending behind it (-s), then the neck up into the skull
    const turns = 1.35, aEnd = Math.PI, a0 = aEnd - turns * TAU, path = [], guide = [];
    const rb0 = (u) => lerp(3.6, 11.2, Math.pow(u, 0.75));
    for (let i = 0; i <= 90; i++) {
      const u = i / 90, a = a0 + u * turns * TAU, R = 15.2 + rb0(u) * 0.7;
      path.push([R * Math.cos(a), 108 + u * 188, R * Math.sin(a)]); guide.push([Math.cos(a), 0, Math.sin(a)]);
    }
    const neck = [[-23.8, 300, 0], [-27, 318, 0], [-24, 336, 0], HPw(4, 2, 0), HPw(14, 6, 0)];
    const nc = new THREE.CatmullRomCurve3(neck.map((p) => new THREE.Vector3(...p)));
    for (let i = 1; i <= 26; i++) { const p = nc.getPointAt(i / 26); path.push([p.x, p.y, p.z]); guide.push(vnorm(vlerp([-1, 0, 0], [-0.75, 0.62, 0], i / 26))); }
    const acc = [0];
    for (let i = 1; i < path.length; i++) acc.push(acc[i - 1] + vlen(vsub(path[i], path[i - 1])));
    const L = acc[acc.length - 1], coilL = acc[90];
    const rad = (d) => (d <= coilL ? rb0(d / coilL) : lerp(11.2, 15.5, smooth(0, 1, (d - coilL) / (L - coilL)))) * lerp(0.22, 1, smooth(0, 10, d));
    const curve = new THREE.CatmullRomCurve3(path.map((p) => new THREE.Vector3(...p)));
    // frames every mm: D = dorsal (away from the shaft), B = t x D; the belly faces the shaft
    const nF = Math.ceil(L), FR = [];
    for (let i = 0; i <= nF; i++) {
      const u = i / nF, d = u * L, p = curve.getPointAt(u), T = curve.getTangentAt(u), t = vnorm([T.x, T.y, T.z]);
      let k = 0; while (k < acc.length - 2 && acc[k + 1] < d) k++;
      const gd = vnorm(vlerp(guide[k], guide[k + 1], clamp01((d - acc[k]) / Math.max(1e-6, acc[k + 1] - acc[k]))));
      const D = vnorm(vsub(gd, vmul(t, vdot(gd, t))));
      FR.push({ c: [p.x, p.y, p.z], t, D, r: rad(d) });
    }
    const frAt = (d) => {
      const f = clamp01(d / L) * nF, i = Math.min(nF - 1, Math.floor(f)), k = f - i, A = FR[i], Bf = FR[i + 1];
      const t = vnorm(vlerp(A.t, Bf.t, k)), D = vnorm(vlerp(A.D, Bf.D, k));
      return { c: vlerp(A.c, Bf.c, k), t, D, B: vnorm(vcross(t, D)), r: lerp(A.r, Bf.r, k) };
    };
    const bodyP = (d, ph, z = 0) => {
      const F = frAt(d), cph = Math.cos(ph), sph = Math.sin(ph), belly = smooth(0.55, 0.8, -cph), rr = F.r * (1 - 0.14 * belly) + z;
      return vadd(F.c, vadd(vmul(F.D, rr * cph), vmul(F.B, rr * sph * (1 - 0.06 * belly))));
    };
    const bodyMap = (u, v, z) => bodyP(u, v / 10, z);     // design space: u = arc length (mm), v = 10 x angle from the spine
    coil = { L, coilL, frAt, bodyP, rad, a0, turns };
    // the smooth body under the scales
    {
      const rings = [], nR = Math.ceil(L / 4.4), na = 26;
      for (let i = 0; i <= nR; i++) { const d = i / nR * L, ring = []; for (let j = 0; j < na; j++) ring.push(bodyP(d, j / na * TAU)); rings.push(ring); }
      g.add(loft(rings, { crease: 82 }), BRONZE);
    }
    // cast shield scales: staggered rows from the neck down to the tail, 7 across the back and sides, each overlapping
    // the next row; their size follows the body
    {
      const T = [], PH = 2.15, m = 7, wv = 2 * PH / m;
      let d = L - 9;
      for (let row = 0; d > 9; row++) {
        const r = rad(d), step = Math.max(3.2, 0.6 * r + 1.6), Ls = step * 1.72, cols = row % 2 ? m - 1 : m, d0 = d;
        for (let j = 0; j < cols; j++) {
          const ph = -PH + (j + (row % 2 ? 1 : 0.5)) * wv;
          T.push(...scaleT(Ls, wv * r * 1.5, (a, b) => [d0 - a, 10 * (ph + b / rad(Math.max(2, d0 - a)))], { lift: 0.25 + 0.075 * r, th: 0.35 + 0.05 * r, rim: 0.3 + 0.012 * r, keel: 0.12 + 0.03 * r, sink: 0.2 }));
        }
        d -= step;
      }
      g.add(mapTris(T, bodyMap, 55), BRONZE);
    }
    // belly plates: separate chamfered transverse plates where the belly shows (up the neck; on the coil it lies on the shaft)
    {
      const T = [];
      for (let d = coilL - 30; d < L - 8;) { const r = rad(d), p = 0.3 * r + 1.6; T.push(...ribbonT([[d, 10 * (Math.PI - 1.05)], [d, 10 * (Math.PI + 1.05)]], p * 0.84, -0.4, 0.32 + 0.03 * r, { b: 0.3, step: 7 })); d += p; }
      g.add(mapTris(T, bodyMap, 40), BRONZE);
    }
    // one continuous scalloped crest along the spine, each scallop raked back towards the tail
    {
      const rings = [];
      const hAt = (d) => lerp(2.2, 6.8, smooth(0.04, 0.95, d / L));
      const ring = (d, k, rake) => {
        const h = hAt(d) * k, r = rad(d);
        return [[-0.75, -0.6, 0], [-0.42, 0.45, 0.3], [-0.15, 1, 1], [0.15, 1, 1], [0.42, 0.45, 0.3], [0.75, -0.6, 0]].map(([b, z, rk]) => bodyP(d - rake * h * rk, b / r, z > 0 ? z * h : z));
      };
      for (let d = 7; d < L - 3;) {
        const lam = 0.45 * rad(d) + 3;
        rings.push(ring(d, 0.32, 0), ring(d + lam * 0.13, 1, 0.38), ring(d + lam * 0.55, 0.62, 0.1));
        d += lam;
      }
      g.add(loft(rings, { crease: 50 }), BRONZE);
    }
    // the tail ends in a flame tuft
    {
      const F0 = frAt(2), back = vmul(F0.t, -1);
      for (const [sd, Lp, W] of [[0, 21, 3.4], [1, 16, 2.7], [-1, 15, 2.5]]) {
        const D = vnorm(vadd(back, vadd(vmul(F0.D, 0.3 + 0.15 * Math.abs(sd)), vmul(F0.B, sd * 0.6))));
        const Rd = vnorm(vsub(F0.D, vmul(D, vdot(F0.D, D)))), Sd = vcross(D, Rd);
        g.add(petal(F0.c, D, Rd, Sd, Lp, W, 1.2, { bulge: 1.5, flick: 5, nu: 9, na: 12, groove: 0.3 }), BRONZE);
      }
    }
    // granulated gold ring where the neck enters the skull
    {
      const d = L - 25, F = frAt(d), R = F.r + 2.1;
      g.add(bandRing(F.c, F.D, F.B, F.t, R, 4.4, 5.6, { seg: 56, ch: 0.7 }), GOLD);
      for (const off of [-3.2, 3.2]) for (let k = 0; k < 30; k++) { const a = (k + (off > 0 ? 0.5 : 0)) / 30 * TAU, n = vadd(vmul(F.D, Math.cos(a)), vmul(F.B, Math.sin(a))); g.add(dome(vadd(vadd(F.c, vmul(n, R - 0.6)), vmul(F.t, off)), vnorm(vadd(n, vmul(F.t, off * 0.08))), 0.95), GOLD); }
    }
  }

  // ---- legs: the foreleg under the neck on the player's side (back-right), the hind leg on the left. Thigh out to an
  // elbow with a flame tuft, a scaled forearm down to the wrist, three toes (and a dewclaw) wrapped round the shaft
  // with knuckle pads and curved bone talons
  for (const [fu, dir] of [[0.88, 1], [0.38, -1]]) {
    const d = fu * coil.coilL, F = coil.frAt(d), rb = F.r, Rs = 15.45;
    const root = coil.bodyP(d, -1.75, -1.2);
    const ar = Math.atan2(root[2], root[0]), tr = root[1], P = (a, t, R) => [Math.cos(a) * R, t, Math.sin(a) * R];
    const elbow = P(ar + dir * 0.16, tr - 5, Rs + 21), wrist = P(ar + dir * 0.32, tr - 24, Rs + 5.5), aw = ar + dir * 0.32, tw = tr - 24;
    g.add(ttube([root, vlerp(root, elbow, 0.5), elbow], (u) => lerp(rb * 0.45, 3.9, u), 0, { radial: 12, seg: 12 }), BRONZE);
    g.add(sphere(elbow, 4.1, { seg: 16 }), BRONZE);
    g.add(ttube([elbow, vlerp(elbow, wrist, 0.5), wrist], (u) => lerp(3.6, 2.9, u), 0, { radial: 12, seg: 10 }), BRONZE);
    // elbow flame tuft, sweeping back down along the forearm and out
    {
      const out = vnorm([Math.cos(ar), 0, Math.sin(ar)]);
      for (const [k, Lp, W] of [[0, 18, 4.6], [1, 14, 3.8], [-1, 13, 3.6]]) {
        const D = vnorm(vadd(vmul(out, 0.5), vadd([0, -0.8, 0], vmul([-Math.sin(ar), 0, Math.cos(ar)], k * 0.5 * dir))));
        const Rd = vnorm(vsub(out, vmul(D, vdot(out, D))));
        g.add(petal(vadd(elbow, vmul(out, 1.5)), D, Rd, vcross(D, Rd), Lp, W, 1.3, { bulge: 1.5, flick: 6, nu: 8, na: 12, groove: 0.32 }), BRONZE);
      }
    }
    // thigh and forearm scales (free edges towards the paw) on the outer face
    const limbScales = (p0, p1, r0, r1, u1 = 3) => {
      const A = vnorm(vsub(p1, p0)), mid = vlerp(p0, p1, 0.5), am = Math.atan2(mid[2], mid[0]), radial = [Math.cos(am), 0, Math.sin(am)];
      const O = vnorm(vsub(radial, vmul(A, vdot(radial, A)))), S2 = vcross(A, O), len = vlen(vsub(p1, p0)), rr = (u) => lerp(r0, r1, clamp01(u / len));
      const fmap = (u, v, z) => vadd(vadd(p0, vmul(A, u)), vmul(vadd(vmul(O, Math.cos(v / 10)), vmul(S2, Math.sin(v / 10))), rr(u) + z));
      const T = [];
      for (let row = 0, u0 = u1; u0 < len - 3; row++, u0 += 3.6) for (let j = 0; j < (row % 2 ? 3 : 4); j++) {
        const ph = -1.35 + (j + (row % 2 ? 1 : 0.5)) * 0.68, r = rr(u0), uu = u0;
        T.push(...scaleT(5.6, 0.68 * r * 1.45, (a, b) => [uu + a, 10 * (ph + b / r)], { lift: 0.5, th: 0.4, rim: 0.28, keel: 0.2, sink: 0.25 }));
      }
      g.add(mapTris(T, fmap, 55), BRONZE);
    };
    limbScales(elbow, wrist, 3.6, 2.9, 4);
    limbScales(vlerp(root, elbow, 0.3), elbow, lerp(rb * 0.45, 3.9, 0.3), 3.9, 1);
    // three toes stacked along the shaft wrapping round it, a dewclaw the other way
    for (const [k, wrapA, dt, Lsc] of [[0, 1.05, 6.5, 1], [1, 1.12, 0, 1], [2, 1.0, -6.5, 0.95], [3, -0.62, 1.5, 0.7]]) {
      const sgw = Math.sign(wrapA) * dir, wa = Math.abs(wrapA) * Lsc, tt = tw - 4 + dt;
      const p0 = vlerp(wrist, P(aw, tt, Rs + 4), 0.6);
      const k1 = P(aw + sgw * 0.38 * wa, tt - 0.6, Rs + 2.7), k2 = P(aw + sgw * 0.76 * wa, tt - 1.1, Rs + 2.3), tip = P(aw + sgw * wa, tt - 1.5, Rs + 2.0);
      g.add(ttube([p0, k1, k2, tip], (u) => lerp(2.5, 1.6, u) * (1 + 0.2 * Math.exp(-(((u - 0.36) / 0.07) ** 2)) + 0.18 * Math.exp(-(((u - 0.7) / 0.07) ** 2))), 0, { radial: 10, seg: 14 }), BRONZE);
      for (const q of [k1, k2]) g.add(sphere(P(Math.atan2(q[2], q[0]), q[1] - 0.4, Rs + 1.1), 1.55, { seg: 10 }), BRONZE);
      // talon: hooks on round the shaft and bites in
      const at = Math.atan2(tip[2], tip[0]);
      g.add(ttube([vlerp(k2, tip, 0.6), tip, P(at + sgw * 0.22, tip[1] - 0.6, Rs + 1.9), P(at + sgw * 0.42, tip[1] - 1.1, Rs + 0.4)], (u) => lerp(1.45, 0.12, Math.pow(u, 0.8)), 0, { radial: 10, seg: 10 }), BONE);
    }
  }

  // ======================================================================== the head
  // head-local mm: x forward along F (skull back 0 -> nose tip 101.5), y up along U, z = w. Shang bronze planes: a high
  // crown, a brow shelf over the eye, a planar bridge, a squared muzzle whose upper lip curls up at the tip; squircle
  // sections (flat planes, round corners) with cast ridges where the planes meet
  const Ht = curveFn([[-4, 20], [0, 27], [10, 34], [22, 37.5], [32, 37], [40, 35.5], [47, 31], [54, 26.5], [64, 24], [74, 24.2], [82, 25], [89, 24], [95, 19], [99.5, 11], [101.5, 3]]);
  const Hb = curveFn([[-4, -22], [10, -22], [22, -14], [32, -5], [42, -0.6], [86, -0.6], [92, 1.2], [98, 4.5], [101.5, 3]]);
  const Hw = curveFn([[-4, 20], [0, 26], [12, 32], [24, 33.5], [34, 31.5], [44, 27.5], [54, 22], [64, 19.5], [74, 20], [84, 20.5], [92, 18.5], [98, 12], [101.5, 4]]);
  const NT = 3, NB = 3.6, NZ = 2.9;
  // the cheek swells behind the eye; the eye sits in a socket
  const bumpW = (x, y) => 2.2 * Math.exp(-(((x - 17) / 11) ** 2) - (((y + 1) / 10) ** 2)) - 1.7 * Math.exp(-(((x - 40) / 9) ** 2) - (((y - 23) / 5) ** 2));
  const headZ = (x, y) => { const h = Ht(x), b = Hb(x), yc = (h + b) / 2, hh = Math.max(1e-3, (h - b) / 2), Y = clamp01(Math.abs((y - yc) / hh)); return Math.max(0, Hw(x) + bumpW(x, y)) * Math.pow(Math.max(0, 1 - Math.pow(Y, y > yc ? NT : NB)), 1 / NZ); };
  const headPt = (x, y, sg, off = 0) => {
    const e = 0.4, p = HP(x, y, sg * headZ(x, y)), px = vsub(HP(x + e, y, sg * headZ(x + e, y)), HP(x - e, y, sg * headZ(x - e, y))), py = vsub(HP(x, y + e, sg * headZ(x, y + e)), HP(x, y - e, sg * headZ(x, y - e)));
    let n = vnorm(vcross(px, py)); if (vdot(n, [0, 0, sg]) < 0) n = vmul(n, -1);
    return { p: vadd(p, vmul(n, off)), n };
  };
  const headMap = (sg) => (u, v, z) => headPt(u, v, sg, z).p;
  // the top (bridge, crown) and the palate, by (x, z): bisection for y on the squircle
  const topY = (x, z) => { const h = Ht(x), b = Hb(x), az = Math.abs(z); let lo = (h + b) / 2, hi = h; if (headZ(x, lo) < az) return lo; for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (headZ(x, m) > az) lo = m; else hi = m; } return (lo + hi) / 2; };
  const botY = (x, z) => { const h = Ht(x), b = Hb(x), az = Math.abs(z); let lo = b, hi = (h + b) / 2; if (headZ(x, hi) < az) return hi; for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (headZ(x, m) > az) hi = m; else lo = m; } return (lo + hi) / 2; };
  const surfPt = (fn, x, z, off, up) => {
    const e = 0.3, P = (a, c) => HP(a, fn(a, c), c), p = P(x, z);
    let n = vnorm(vcross(vsub(P(x + e, z), P(x - e, z)), vsub(P(x, z + e), P(x, z - e)))); if (vdot(n, up) < 0) n = vmul(n, -1);
    return vadd(p, vmul(n, off));
  };
  const topMap = (u, v, z) => surfPt(topY, u, v, z, hU), palMap = (u, v, z) => surfPt(botY, u, v, z, vmul(hU, -1));
  const yCorner = (x) => { const h = Ht(x), b = Hb(x); return (h + b) / 2 + 0.76 * (h - b) / 2; };
  {
    // skull + upper jaw
    const rings = [], na = 48, xs = [];
    for (let x = -4; x < 100; x += 1.75) xs.push(x);
    xs.push(100.5, 101.5);
    for (const x of xs) {
      const h = Ht(x), b = Hb(x), yc = (h + b) / 2, hh = (h - b) / 2, ring = [];
      for (let j = 0; j < na; j++) { const a = j / na * TAU, s = Math.sin(a), c = Math.cos(a), y = yc + hh * se(s, s > 0 ? NT : NB); ring.push(HP(x, y, sgn(c) * headZ(x, y))); }
      rings.push(ring);
    }
    addH(loft(rings, { crease: 60 }), BRONZE);

    for (const sg of [1, -1]) {
      const M = headMap(sg), R = [], Rg = [];
      // corner ridges where the bridge meets the snout side; the cheek plate's border; a ridge under the eye
      R.push(ribbonT(Array.from({ length: 15 }, (_, k) => { const x = 50 + k * 3.1; return [x, yCorner(x) - 0.4]; }), (f) => lerp(1.9, 1.1, f), -0.3, 1.05, { step: 3.2 }));
      R.push(ribbonT([[31, 15.5], [23, 15.5], [14.5, 12.5], [8.5, 5], [7.2, -4], [10, -11], [16, -15], [22, -12.5], [27.5, -5.5]], (f) => lerp(1.8, 1.2, f), -0.3, 1.15, { step: 2 }));
      // cheek plate: two cloud curls and a field of 鱗紋 arcs
      R.push(curlT(17.5, 0.5, 6.8, 1, 200, -0.2, 1.0, 1.25), curlT(27, 8.5, 3.6, -1, 20, -0.2, 0.9, 1.0));
      for (const [cx, cy] of [[13, 9], [19, 10.5], [25, 1.5], [12.5, -7], [18.5, -9.5], [24, -6], [10.5, 2]]) R.push(wireT([[cx - 3, cy + 0.6], [cx - 1.8, cy - 1.4], [cx, cy - 2], [cx + 1.8, cy - 1.4], [cx + 3, cy + 0.6]], 0.75, -0.2, 0.6, { step: 1.6 }));
      // 雲雷紋 band down the snout side between the corner ridge and the lip
      R.push(thunderT(50, 91, 5.2, 14.6, -0.25, 0.7, { lw: 1.0, gap: 0.85 }));
      // 臣字目: almond eye with cast lids — the upper lid runs on into a long tail sweeping back, the inner corner hooks
      R.push(ribbonT([[52.5, 19], [49.5, 23.3], [44, 26.6], [38, 27.6], [32, 26.7], [26.5, 25.6], [20, 26.6], [14.5, 29.3]], (f) => lerp(2.4, 1.1, f), -0.3, 1.8, { step: 2.2 }));
      R.push(ribbonT([[54, 17.4], [51.5, 19.6], [47, 19.8], [41, 18.7], [35, 19.5], [30.5, 22.2], [26.8, 25.4]], (f) => lerp(1.2, 1.8, f), -0.3, 1.35, { step: 2.2 }));
      R.push(ribbonT([[52.5, 19], [54.5, 15.5], [53.2, 13]], 1.1, -0.3, 1.1, { step: 1.5 }));
      // brow shelf: a heavy fluted band arching over the eye to the bridge
      R.push(ribbonT([[22, 31.6], [30, 32.6], [38, 32.6], [46, 30], [53.5, 25.8]], (f) => lerp(3.8, 2.0, f), -0.3, 2.4, { step: 2.6, flutes: [[0, 0.5]] }));
      // 如意 nostril scroll: a raised three-lobed cloud head with a spiral, the dark nostril in its eye
      {
        const poly = [];
        for (let k = 0; k < 26; k++) { const th = k / 26 * TAU, r = 3.6 * (1 + 0.24 * Math.cos(3 * th)); poly.push([93.2 + Math.cos(th) * r * 1.25, 13.6 + Math.sin(th) * r * 0.8]); }
        R.push(fanT(poly, -0.4, 0.9, { b: 0.4, step: 1.6, rings: 1 }), curlT(93.4, 13.7, 2.5, 1, 0, 0.6, 1.5, 0.75));
      }
      // lip line: gold wire with granules
      Rg.push(wireT(Array.from({ length: 19 }, (_, k) => { const x = 43 + k * 3; return [x, Hb(x) + 1.6]; }), 1.15, -0.25, 0.85, { step: 3 }));
      addH(mapTris(cat(...R), M, 50), BRONZE);
      addH(mapTris(cat(...Rg), M), GOLD);
      for (let x = 45; x < 97; x += 3.2) { const P = headPt(x, Hb(x) + 3.15, sg, -0.15); addH(dome(P.p, P.n, 0.8, 0.65), GOLD); }

      // eye: the crystal sunk half into the socket, a slit pupil
      {
        const E = headPt(40.5, 23.1, sg), Ta = vnorm(vsub(headPt(46.5, 21.6, sg).p, headPt(34.5, 24.6, sg).p)), Tb = vnorm(vcross(E.n, Ta));
        const c = vadd(E.p, vmul(E.n, -2.0));
        addH(ellip(c, Ta, Tb, E.n, 8.6, 4.5, 4.4, 44), EYE);
        addH(ellip(vadd(c, vmul(E.n, 4.25)), Ta, Tb, E.n, 0.8, 3.3, 0.45, 24), OBS);
        g.socket(sg > 0 ? 'eyeR' : 'eyeL', hsp(vadd(E.p, vmul(E.n, 3))));
      }
      // brow flame tufts sweeping back off the end of the brow
      {
        const b0 = headPt(24, 31.8, sg, 1.5).p;
        for (const [k, L, W] of [[0, 27, 4.6], [1, 21, 3.8], [2, 15, 3]]) {
          const p = vadd(b0, vmul(hF, -k * 3.2));
          addH(petal(p, vnorm([-0.85, 0.55 - k * 0.08, sg * 0.3]), [0, 0, sg], vnorm([0.5, 0.86, 0]), L, W, 1.4, { bulge: 3, flick: 6, nu: 8, na: 12, groove: 0.32, bend: vnorm([0.25, 1, 0]) }), BRONZE);
        }
      }
      // cheek fins (ears): three fluted flame plates fanning back
      const fin = headPt(6, 14, sg, -1).p;
      for (let k = 0; k < 3; k++) addH(petal(fin, vnorm(vadd(vmul(hF, -0.85), [0, 0.35 - k * 0.3, sg * 0.45])), [0, 0, sg], vnorm(vcross(vadd(vmul(hF, -1), [0, 0.3 - k * 0.3, 0]), [0, 0, sg])), 31 - k * 5, 6, 1.7, { bulge: 4, flick: 7, nu: 9, na: 12, groove: 0.3 }), BRONZE);
      // mane: broad fluted flame locks off the back of the skull and the cheeks, a thinner lock beside each
      for (let k = 0; k < 4; k++) {
        const b = HP(1 + k * 3, -2 + k * 10, sg * (22 - k * 4));
        const Dm = vnorm([-0.95, 0.04 + k * 0.17, sg * (0.42 - k * 0.06)]), Um = vnorm(vsub([0.1, 1, 0], vmul(Dm, vdot([0.1, 1, 0], Dm))));
        addH(petal(b, Dm, [0, 0, sg], Um, 62 + k * 8, 12 - k, 2.7, { bulge: 6, flick: 16, nu: 10, na: 12, groove: 0.35, bend: Um }), BRONZE);
        addH(petal(vadd(b, vadd(vmul(Um, 4.5), [0, 0, sg * 1.6])), vnorm(vadd(Dm, vmul(Um, 0.08))), [0, 0, sg], Um, (62 + k * 8) * 0.6, (12 - k) * 0.48, 1.6, { bulge: 5, flick: 19, nu: 7, na: 12, groove: 0.3, bend: Um }), BRONZE);
      }
      // antler: fluted oval main beam back-up-out with two tines, a coronet burr at the base, gold caps on every tip
      {
        const a0 = HP(18, 31, sg * 12);
        const beam = [a0, vadd(a0, [-10, 26, sg * 7]), vadd(a0, [-36, 52, sg * 17]), vadd(a0, [-78, 66, sg * 30]), vadd(a0, [-112, 64, sg * 38])];
        const bc = new THREE.CatmullRomCurve3(beam.map((q) => new THREE.Vector3(...q)));
        addH(ftube(beam, (u) => lerp(7, 2.4, u), { radial: 15, seg: 26, flutes: 5, depth: 0.2, oval: 1.16 }), BRONZE);
        const bp = (k) => { const p = bc.getPointAt(k); return [p.x, p.y, p.z]; }, bt = (k) => { const p = bc.getTangentAt(k); return vnorm([p.x, p.y, p.z]); };
        const cb = bp(0.07), ct = bt(0.07);
        addH(torusAt(cb, ct, 7.4, 1.9, 24, 6), BRONZE);
        for (let j = 0; j < 9; j++) {
          const a = j / 9 * TAU, e1 = vnorm(vcross(ct, [0, 0, 1])), e2 = vcross(ct, e1), n = vadd(vmul(e1, Math.cos(a)), vmul(e2, Math.sin(a)));
          addH(dome(vadd(cb, vmul(n, 8.6)), n, 1.25, 1.1), BRONZE);
        }
        for (const [k, d, L] of [[0.3, [-4, 1, sg * 0.25], 30], [0.62, [-0.5, 1, sg * 0.2], 24]]) {
          const b = bp(k), dd = vnorm(d), tip = vadd(b, vadd(vmul(dd, L), [-L * 0.25, 0, 0])), pre = vadd(b, vmul(dd, L * 0.55));
          addH(ftube([b, pre, tip], (u) => lerp(4.6 - k * 1.6, 1.5, u), { radial: 12, seg: 10, flutes: 4, depth: 0.12, oval: 1.12 }), BRONZE);
          addH(along([[-1.2, 1.9], [0, 1.95], [3.4, 1.2], [5.6, 0]], vadd(tip, vmul(vnorm(vsub(tip, pre)), -1.6)), vnorm(vsub(tip, pre)), 10), GOLD);
        }
        addH(along([[-1.5, 2.6], [0, 2.6], [6, 1.2], [9, 0]], beam[4], vnorm(vsub(beam[4], beam[3])), 10), GOLD);
      }
      // whisker: gold, back along the jaw line clear of the mouth and the eye, bead collars, a tight curl at the tip
      {
        const wk = [[92, 6.5, 16.6], [88, 4.2, 22], [78, 3, 26.5], [64, 2.6, 28.5], [50, 2.4, 33], [40, 1.6, 36.4], [32, 0.4, 38.6], [26.5, -2.6, 39.4], [25.6, -7, 39], [28.4, -9.4, 38.4], [31.2, -7.6, 38.2], [30.6, -4.8, 38.4], [28.6, -4.6, 38.6]];
        const pts = wk.map(([x, y, z]) => HP(x, y, sg * z));
        addH(ttube(pts, (u) => lerp(2.2, 0.85, u), 0, { radial: 10, seg: 40 }), GOLD);
        const wc = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q)));
        for (const u of [0.16, 0.34, 0.52]) { const p = wc.getPointAt(u), tg = wc.getTangentAt(u); addH(torusAt([p.x, p.y, p.z], vnorm([tg.x, tg.y, tg.z]), lerp(2.2, 0.85, u) + 0.45, 0.62, 18, 6), GOLD); }
      }
    }
    // the crown and the bridge carry cast shield scales (free edges back towards the neck); a notched 扉棱 flange runs
    // up the middle of the bridge
    {
      const T = [];
      for (let r = 0; r < 7; r++) {
        const x0 = 45 - r * 5.6, zl = 0.6 * Hw(x0) - 3, off = r % 2 ? 3 : 0;
        for (let k = -4; k <= 4; k++) if (Math.abs(k * 6 + off) <= zl) T.push(...scaleT(7.6, 6.7, (a, b) => [x0 - a, k * 6 + off + b], { lift: 0.9, th: 0.7, rim: 0.4, keel: 0.35, sink: 0.25 }));
      }
      for (let r = 0; r < 8; r++) {
        const x0 = 91 - r * 5.4, off = r % 2 ? 2.6 : 0;
        for (const z0 of [4.6 + off, 10 + off * 0.6, -4.6 - off, -10 - off * 0.6]) if (Math.abs(z0) < 0.66 * Hw(x0) - 2.5) T.push(...scaleT(6.6, 5.4, (a, b) => [x0 - a, z0 + b], { lift: 0.75, th: 0.6, rim: 0.35, keel: 0.3, sink: 0.25 }));
      }
      addH(mapTris(T, topMap, 55), BRONZE);
      const top = [];
      for (let x = 50; x < 92; x += 6) {
        const h0 = smooth(50, 58, x) * (1 - smooth(86, 92, x)), H = (xx) => Ht(xx) + 0.6;
        top.push([x, H(x) + 1.2 * h0, 0], [x + 1, H(x + 1) + 3.6 * h0, 0], [x + 4.4, H(x + 4.4) + 3.9 * h0, 0], [x + 5.2, H(x + 5.2) + 1.4 * h0, 0]);
      }
      const base = [];
      for (let x = 92; x >= 50; x -= 3) base.push([x, Ht(x) - 1.6, 0]);
      addH(toHead(profile([...top, ...base], { w: 2.4, bevel: 0.6, curveSeg: 1 })), BRONZE);
    }
    // crown crest between the antlers
    addH(petal(HP(12, 33, 0), vnorm(vadd(vmul(hF, -0.6), [0, 0.8, 0])), vmul(hF, -1), WV, 34, 6, 2.2, { bulge: 5, flick: 6, nu: 10, na: 12, groove: 0.3 }), BRONZE);
    addH(petal(HP(28, 34, 0), vnorm(vadd(vmul(hF, -0.4), [0, 0.9, 0])), vmul(hF, -1), WV, 20, 4.5, 1.8, { bulge: 3, flick: 4, nu: 8, na: 12, groove: 0.3 }), BRONZE);

    // ---- inside the upper jaw: gums with tooth sockets, a ridged palate, the throat, curved teeth and a grooved fang
    const gumZ = (x) => Hw(x) - 3.6, UT = [[50, 0], [57, 0], [64, 0], [71, 0], [78, 0], [87, 1]];
    for (const sg of [1, -1]) {
      const rings = [];
      for (let x = 43; x <= 95; x += 1.6) {
        const sw = 1 + 0.4 * Math.max(...UT.map(([tx]) => Math.exp(-(((x - tx) / 2.3) ** 2)))), ring = [];
        for (let k = 0; k < 10; k++) { const th = k / 10 * TAU, s = Math.sin(th); ring.push(HP(x, Hb(x) + 0.4 + (s < 0 ? 1.9 * sw * s : 0.6 * s), sg * (gumZ(x) + 2.3 * Math.cos(th)))); }
        rings.push(ring);
      }
      addH(loft(rings, { crease: 70 }), GUM);
      for (const [x, fang] of UT) {
        const p = HP(x, Hb(x) + 1.0, sg * (gumZ(x) + 0.2));
        addH(tooth(p, vmul(hU, -1), vnorm(vadd(vmul(hF, -1), [0, 0, -sg * 0.15])), fang ? 20 : 6.2 + 0.09 * (x - 50), fang ? 4 : 1.75, { groove: fang ? 0.32 : 0, radial: fang ? 16 : 12, seg: fang ? 9 : 5 }), BONE);
      }
    }
    {
      const poly = [];
      for (let x = 41; x <= 93; x += 4) poly.push([x, -(gumZ(x) - 1.6)]);
      for (let x = 93; x >= 41; x -= 4) poly.push([x, gumZ(x) - 1.6]);
      const P = [fanT(poly, -0.3, 0.3, { b: 0.25, step: 4, rings: 2 })];
      for (let x0 = 47; x0 < 88; x0 += 5.6) P.push(wireT([[x0 + 2.6, -(gumZ(x0) - 3.4)], [x0 + 0.8, -4], [x0, 0], [x0 + 0.8, 4], [x0 + 2.6, gumZ(x0) - 3.4]], 1.5, 0.15, 1.0, { step: 3 }));
      addH(mapTris(cat(...P), palMap), GUM);
      addH(ellip(HP(36, -5.2, 0), hF, hU, WV, 6.5, 6.5, 15, 24), GUM);
    }
  }

  // ---- lower jaw (fx_jaw): hinged under the cheeks, open S.jaw degrees at rest
  {
    const J = HP(28, -5, 0), al = -S.jaw * D2R;
    const jF = vnorm(vadd(vmul(hF, Math.cos(al)), vmul(hU, Math.sin(al)))), jU = vcross(WV, jF);
    const JP = (x, y, z) => vfr(J, jF, jU, WV, x - 28, y + 5, z);
    const jaw = g.part('fx_jaw', { pivot: hsp(J), extras: { open: -16, hinge: 'w', note: 'lower jaw: open 1 = jaws wide (ult, rare reload)' } });
    const jadd = (geo, mat) => jaw.add(hsc(geo), mat);
    // a deep jaw with a chin, its tip curling up to meet the upper lip
    const Jb = curveFn([[26, -13], [36, -18], [50, -19], [64, -17], [76, -14.5], [86, -12.5], [92, -9.5], [96, -5], [97.5, -1.5]]);
    const Jw = curveFn([[26, 26], [40, 24.5], [56, 21], [70, 18.5], [82, 16.5], [90, 13.5], [95, 9], [97.5, 4]]);
    const T0 = -1.4, NTJ = 5, NBJ = 2.4, NZJ = 2.6;
    const jawZ = (x, y) => { const b = Jb(x), yc = (T0 + b) / 2, hh = Math.max(1e-3, (T0 - b) / 2), Y = clamp01(Math.abs((y - yc) / hh)); return Jw(x) * Math.pow(Math.max(0, 1 - Math.pow(Y, y > yc ? NTJ : NBJ)), 1 / NZJ); };
    const jawPt = (x, y, sg, off = 0) => {
      const e = 0.4, P = (a, b) => JP(a, b, sg * jawZ(a, b)), p = P(x, y);
      let n = vnorm(vcross(vsub(P(x + e, y), P(x - e, y)), vsub(P(x, y + e), P(x, y - e)))); if (vdot(n, [0, 0, sg]) < 0) n = vmul(n, -1);
      return { p: vadd(p, vmul(n, off)), n };
    };
    const jawBot = (u, v, z) => {
      const P = (x, zz) => { const b = Jb(x), yc = (T0 + b) / 2, hh = (T0 - b) / 2, w = Jw(x); return JP(x, yc - hh * Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(zz) / w), NZJ)), 1 / NBJ), zz); };
      const e = 0.3, p = P(u, v);
      let n = vnorm(vcross(vsub(P(u + e, v), P(u - e, v)), vsub(P(u, v + e), P(u, v - e)))); if (vdot(n, jU) > 0) n = vmul(n, -1);
      return vadd(p, vmul(n, z));
    };
    {
      const rings = [], na = 40;
      for (let x = 26; x <= 97.5; x += x > 92 ? 1.1 : 2) {
        const b = Jb(x), w = Jw(x), yc = (T0 + b) / 2, hh = (T0 - b) / 2, ring = [];
        for (let j = 0; j < na; j++) { const a = j / na * TAU, c = Math.cos(a), s = Math.sin(a); ring.push(JP(x, yc + hh * se(s, s > 0 ? NTJ : NBJ), w * se(c, NZJ))); }
        rings.push(ring);
      }
      jadd(loft(rings, { crease: 60 }), BRONZE);
    }
    const LT = [[52, 0], [59, 0], [66, 0], [73, 0], [80, 0], [89, 1]], lgZ = (x) => Jw(x) - 3.6;
    for (const sg of [1, -1]) {
      const M = (u, v, z) => jawPt(u, v, sg, z).p, R = [];
      // side ridge, a cloud curl at the hinge, 鱗紋 arcs on the cheek of the jaw
      R.push(ribbonT(Array.from({ length: 16 }, (_, k) => { const x = 33 + k * 4; return [x, (T0 + Jb(x)) / 2 + 1.2]; }), (f) => lerp(1.6, 1.0, f), -0.3, 1.0, { step: 2.2 }));
      R.push(curlT(35, -9.2, 4.8, 1, 90, -0.2, 1.0, 1.1));
      for (const [cx, cy] of [[47, -5], [54, -5.4], [50.5, -12.2], [57.5, -12.4], [64.5, -11.4]]) R.push(wireT([[cx - 2.8, cy + 0.6], [cx - 1.6, cy - 1.3], [cx, cy - 1.9], [cx + 1.6, cy - 1.3], [cx + 2.8, cy + 0.6]], 0.7, -0.2, 0.55, { step: 1.6 }));
      jaw.add(hsc(mapTris(cat(...R), M, 50)), BRONZE);
      // lower lip: gold wire with granules
      jaw.add(hsc(mapTris(wireT(Array.from({ length: 19 }, (_, k) => { const x = 40 + k * 3.1; return [x, T0 - 1.5 - 0.1 * smooth(88, 97, x) * 8]; }), 1.1, -0.25, 0.8, { step: 2.4 }), M)), GOLD);
      for (let x = 42; x < 94; x += 3.2) { const P = jawPt(x, T0 - 3, sg, -0.15); jadd(dome(P.p, P.n, 0.75, 0.6), GOLD); }
      // gums along the jaw rim with tooth sockets; curved teeth, a grooved fang
      const rings = [];
      for (let x = 42; x <= 95; x += 1.6) {
        const sw = 1 + 0.4 * Math.max(...LT.map(([tx]) => Math.exp(-(((x - tx) / 2.3) ** 2)))), ring = [];
        for (let k = 0; k < 10; k++) { const th = k / 10 * TAU, s = Math.sin(th); ring.push(JP(x, T0 - 0.3 + (s > 0 ? 1.9 * sw * s : 0.6 * s), sg * (lgZ(x) + 2.2 * Math.cos(th)))); }
        rings.push(ring);
      }
      jadd(loft(rings, { crease: 70 }), GUM);
      for (const [x, fang] of LT) {
        const p = JP(x, T0 - 0.9, sg * (lgZ(x) + 0.2));
        jadd(tooth(p, jU, vnorm(vadd(vmul(jF, -1), [0, 0, -sg * 0.12])), fang ? 14.5 : 5.6 + 0.07 * (x - 52), fang ? 3.2 : 1.6, { groove: fang ? 0.3 : 0, radial: fang ? 16 : 12, seg: fang ? 9 : 5 }), BONE);
      }
      // flame beard: four fluted flames hanging back off the jaw
      for (let k = 0; k < 4; k++) {
        const x = 47 + k * 9.5, b = JP(x, Jb(x) + 2.6, sg * Jw(x) * 0.5);
        const D = vnorm(vadd(vadd(vmul(jF, -0.7), vmul(jU, -0.7)), [0, 0, sg * 0.12])), Rd = vnorm(vsub([0, 0, sg], vmul(D, D[2] * sg))), Sd = vcross(D, Rd);
        jadd(petal(b, D, Rd, Sd, 28 - k * 3, 6.5 - k * 0.5, 1.8, { bulge: 4, flick: 9, nu: 9, na: 12, groove: 0.32, bend: vnorm(vsub(vmul(jF, -1), vmul(D, vdot(vmul(jF, -1), D)))) }), BRONZE);
      }
    }
    // chin shields: chamfered transverse plates under the jaw
    {
      const T = [];
      for (let x = 40; x < 92; x += 4.6) { const w = Jw(x) * 0.62; T.push(...ribbonT([[x, -w], [x, w]], 3.9, -0.4, 0.75, { b: 0.35, step: 6 })); }
      jaw.add(hsc(mapTris(T, jawBot, 40)), BRONZE);
    }
    // mouth floor lining and the tongue: a grooved tapered loft lying in the jaw, curling up out past the lip, forked
    {
      const poly = [];
      for (let x = 30; x <= 94; x += 4) poly.push([x, -(lgZ(Math.max(42, x)) - 1.8)]);
      for (let x = 94; x >= 30; x -= 4) poly.push([x, lgZ(Math.max(42, x)) - 1.8]);
      jadd(mapTris(fanT(poly, -0.3, 0.3, { b: 0.25, step: 4, rings: 2 }), (u, v, z) => JP(u, T0 + z, v)), GUM);
      const cl = curveFn([[34, -0.2], [46, 0.6], [58, 1.0], [70, 1.2], [80, 1.7], [88, 2.8], [93, 4.4], [97, 6.4], [100, 8]]);
      const ys = [];
      for (let k = 0; k <= 26; k++) { const x = 34 + (100 - 34) * Math.pow(k / 26, 0.8); ys.push([x, cl(x)]); }
      const rings = [];
      for (let i = 0; i < ys.length; i++) {
        const [x, y] = ys[i], [xa, ya] = ys[Math.max(0, i - 1)], [xb, yb] = ys[Math.min(ys.length - 1, i + 1)], l = Math.hypot(xb - xa, yb - ya) || 1;
        const nx = -(yb - ya) / l, ny = (xb - xa) / l, u = i / (ys.length - 1), hw = lerp(3.8, 2.0, Math.pow(u, 1.4)), ht = lerp(1.5, 0.8, u), ring = [];
        for (let k = 0; k < 12; k++) { const th = k / 12 * TAU, s = Math.sin(th), up = ht * s * (s > 0.5 && Math.abs(Math.cos(th)) < 0.6 ? 1 - 0.45 * Math.exp(-((Math.cos(th) / 0.3) ** 2)) : 1); ring.push(JP(x + nx * up, y + ny * up, hw * Math.cos(th))); }
        rings.push(ring);
      }
      jadd(loft(rings, { crease: 60 }), TONGUE);
      const [xe, ye] = ys[ys.length - 1], [xp, yp] = ys[ys.length - 2], tD = vnorm(vsub(JP(xe, ye, 0), JP(xp, yp, 0)));
      for (const sg of [1, -1]) {
        const D = vnorm(vadd(tD, [0, 0, sg * 0.42])), Rd = vnorm(vcross(D, WV));
        jadd(petal(JP(xe, ye, sg * 0.8), D, Rd, vcross(D, Rd), 5, 1.4, 0.7, { bulge: 0.3, flick: -0.8, nu: 6, na: 8 }), TONGUE);
      }
    }
    g.socket('mouth', hsp(JP(94, 6, 0)));
  }

  // ======================================================================== armillary (渾天儀) and the 雷珠
  {
    const C = S.C;
    const cup = [C[0], C[1] - S.R1 - 12, 0];
    // cast cloud-scroll bracket rising off the crown to the pivot cup: a flat bevelled scroll with a curl lobe either
    // side, its faces carrying the curls in relief
    {
      const sc = [[-18, 399, 0], [-1, 399, 0], [2, 407, 2], [6, 413, 1.5], [12.5, 412.5, 3], [16.5, 416.5, 2.5], [14.5, 421.5, 2], [9.5, 420.5, 1], [8.6, 425.5, 1.5], [17.5, 428, 1.5], [18.5, 432.5, 0],
        [5.5, 432.5, 0], [3.5, 428.5, 1.5], [-2.5, 424.5, 2], [-9.5, 425, 2.5], [-14.5, 420.5, 2.5], [-12.5, 415.5, 2], [-7, 416.5, 1], [-6, 410.5, 2], [-12, 404.5, 3]];
      g.add(profile(sc, { w: 5.2, bevel: 1.1, bevelSeg: 2, curveSeg: 3 }), GOLD);
      for (const sg of [1, -1]) {
        const M = (u, v, z) => [u, v, sg * (2.6 + z)];
        g.add(mapTris(cat(curlT(13.2, 417, 2.7, sg, 0, -0.2, 0.7, 0.75), curlT(-10.6, 420.4, 2.9, -sg, 180, -0.2, 0.7, 0.75), wireT([[-8, 402], [-3, 408], [1, 416], [3.5, 424], [8, 430]], 0.8, -0.2, 0.55, { step: 2.5 })), M), GOLD);
      }
    }
    g.add(lax([[-2, 0], [-2, 4.2], [0, 6.2], [5, 8.6], [8.5, 9], [9.5, 7.5], [9.5, 3.2], [9.5, 0]], cup, 't', 24), GOLD);
    for (let k = 0; k < 14; k++) { const a = k / 14 * TAU; g.add(dome([cup[0] + Math.cos(a) * 8.6, cup[1] + 5.5, Math.sin(a) * 8.6], [Math.cos(a), 0.3, Math.sin(a)], 0.9), GOLD); }
    // 4 small 扉棱 on the cup
    for (let k = 0; k < 4; k++) g.add(xform(profile([[8, -1, 0.3], [11.5, 0, 0.3], [12.5, 4, 0.3], [10.5, 7, 0.3], [8, 7.5, 0.3]], { w: 1.8, bevel: 0.5, curveSeg: 2 }), { rot: [0, k * 90 + 45, 0], move: [cup[0], cup[1], 0] }), GOLD);

    // ring 1: gold, in the s-t plane, spins about t; 28 ticks, 4 studs, bottom pin into the cup
    const r1 = g.part('fx_ring1', { pivot: C, extras: { spin: 't', rate: 20, note: 'armillary outer ring (spins about t); setSpin scales it' } });
    r1.add(bandRing(C, SV, UPV, WV, S.R1, 4.4, 7, { seg: 80 }), GOLD);
    for (let k = 0; k < 28; k++) {
      const a = (k + 0.5) / 28 * TAU, p = ringPt(C, SV, UPV, S.R1, a), n = [Math.cos(a), Math.sin(a), 0];
      if (Math.abs(Math.sin(a)) > 0.985) continue;                 // clear of the top / bottom pins
      r1.add(aimDir(lathe([[0, 0.9], [1.4, 0.7], [1.6, 0]], { seg: 6 }), p, n), GOLD);
    }
    for (const a of [45, 135, 225, 315]) { const r = a * D2R; r1.add(domeAt(ringPt(C, SV, UPV, S.R1, r), [Math.cos(r), Math.sin(r), 0], 2.3, 1.8, 14), GOLD); }
    r1.add(torusAt(C, WV, S.R1 - 4.6, 0.55, 80, 4), GLOW);
    r1.add(lax([[0, 0], [0, 2.2], [10, 2.2], [11, 3.6], [13, 3.6], [14, 2.2], [15, 0]], [C[0], C[1] - S.R1 - 14, 0], 't', 14), GOLD);
    r1.add(lax([[0, 0], [0, 3.4], [2.5, 3.4], [4, 2], [5, 0]], [C[0], C[1] + S.R1 - 0.5, 0], 't', 14), GOLD);   // top finial knob
    // ring 2: bronze band in the s-w plane (pinned to ring 1 at ±s, spins about s), gold 雲雷紋 on its outer face
    const r2 = g.part('fx_ring2', { parent: 'fx_ring1', pivot: C, extras: { spin: 's', rate: 28, note: 'armillary middle ring (spins about s inside ring 1)' } });
    r2.add(bandRing(C, SV, WV, UPV, S.R2, 4.2, 9.5, { seg: 80 }), BRONZE);
    const R2o = S.R2 + 0.05;
    r2.add(mapTris(thunderT(0, TAU * R2o, C[1] - 4.4, C[1] + 4.4, -0.15, 0.7, { lw: 0.85, gap: 0.7, border: true }), cylMap(R2o, { cs: C[0] })), GOLD);
    for (const sg of [1, -1]) {
      const p = [C[0] + sg * (S.R2 - 1), C[1], 0];
      r2.add(along([[0, 0], [0, 2], [S.R1 - S.R2 + 1.2, 2], [S.R1 - S.R2 + 1.2, 3.1], [S.R1 - S.R2 + 2.4, 2.5], [S.R1 - S.R2 + 3.0, 0]], p, [sg, 0, 0], 12), GOLD);
    }
    // ring 3: gold in the t-w plane (pinned to ring 2 at ±w, spins about w), beaded
    const r3 = g.part('fx_ring3', { parent: 'fx_ring2', pivot: C, extras: { spin: 'w', rate: -24, note: 'armillary inner ring (spins about w inside ring 2)' } });
    r3.add(bandRing(C, UPV, WV, SV, S.R3, 3.2, 5.6, { seg: 72 }), GOLD);
    for (let k = 0; k < 24; k++) { const a = (k + 0.5) / 24 * TAU; r3.add(dome(ringPt(C, UPV, WV, S.R3, a), [0, Math.cos(a), Math.sin(a)], 1.25), GOLD); }
    for (const sg of [1, -1]) r3.add(along([[0, 0], [0, 1.8], [S.R2 - S.R3 - 1.2, 1.8], [S.R2 - S.R3 - 0.6, 0]], [C[0], C[1], sg * (S.R3 - 1)], [0, 0, sg], 10), GOLD);
    // the 雷珠: hero focus, floats (hover) in the middle — a clear glass shell engraved with star maps in gold, inside
    // it a cut crystal thunder seed facing the wielder, throwing glowing lightning forks out to the shell
    const pearl = g.part('fx_pearl', { pivot: C, extras: { hover: 0.002, period: 2.2, note: '雷珠 hero focus (glass shell, cut crystal seed, lightning forks): hovers; plasma arcs are drawn by premium/staff.js' } });
    pearl.add(sphere(C, S.pearl, { seg: 44 }), 'glass_clear');
    const face = vnorm([-0.5, 0.18, 0.85]);
    pearl.add(aimDir(brilliant([0, 0, 0], 10.8, { n: 12, pavH: 0.86 }), C, vmul(face, -1)), PEARL);
    {
      const T = [], e1 = face, e2 = vnorm(vcross(UPV, e1)), e3 = vcross(e1, e2), Rp = S.pearl;
      const dirOf = (lon, lat) => vadd(vmul(vadd(vmul(e1, Math.cos(lon)), vmul(e2, Math.sin(lon))), Math.cos(lat)), vmul(e3, Math.sin(lat)));
      const sph = (u, v, z) => vadd(C, vmul(dirOf(u / Rp, v / Rp), Rp + z));
      // 北斗 on the wielder's side, 南斗 behind
      const dipper = [[-13, 5], [-7.5, 6.5], [-2.5, 4], [2.5, 2.2], [5.5, -3.2], [11.8, -3.6], [13.4, 2.6]];
      const south = [[-11, -2], [-6, 3], [-1, 1.5], [4, 4.5], [8.5, 1], [12, -3.5]].map(([u, v]) => [u + Math.PI * Rp, v]);
      for (const st of [dipper, south]) {
        T.push(...wireT(st, 0.42, -0.1, 0.22, { step: 2 }));
        for (const [u, v] of st) { const p = sph(u, v, 0); pearl.add(dome(p, vnorm(vsub(p, C)), 0.95, 0.7), GOLD); }
      }
      pearl.add(mapTris(T, sph, 50), GOLD);
      // lightning forks: jagged glowing filaments from the seed out to the shell, a branch on each
      for (let k = 0; k < 5; k++) {
        const lon = (k / 5) * TAU + 0.4, lat = ((k % 2) ? 0.5 : -0.35), D = dirOf(lon, lat), Q = vnorm(vcross(D, e3)), Q2 = vcross(D, Q);
        const pts = [];
        for (let j = 0; j <= 5; j++) { const r = lerp(7.5, 18.6, j / 5), jg = j > 0 && j < 5 ? 1.6 : 0; pts.push(vadd(C, vadd(vmul(D, r), vadd(vmul(Q, (hash(k * 7 + j) - 0.5) * 2 * jg), vmul(Q2, (hash(k * 13 + j) - 0.5) * 2 * jg))))); }
        pearl.add(ttube(pts, 0.5, 0.22, { radial: 5, seg: 14 }), GLOW);
        const b0 = pts[2], b1 = vadd(b0, vadd(vmul(D, 4.5), vmul(Q, 3.2))), b2 = vadd(C, vmul(vnorm(vsub(vadd(b1, vmul(Q, 2)), C)), 18.4));
        pearl.add(ttube([b0, b1, b2], 0.32, 0.15, { radial: 4, seg: 8 }), GLOW);
      }
    }
    g.socket('pearl', C); g.socket('muzzle', C);
    g.socket('boltL', [C[0] + 8, C[1] - 6, -S.R1 - 8]); g.socket('boltR', [C[0] + 8, C[1] - 6, S.R1 + 8]);
    g.socket('top', [C[0], C[1] + S.R1 + 4, 0]);
  }

  // ======================================================================== wings (浮空 on mounts with a glowing seam)
  for (const sg of [1, -1]) {
    const mount = HPw(10, 6, sg * (Hw(10) + 1.5));
    const axis = [0, 0, sg];
    g.add(along([[-4, 0], [-4, 10.5], [-2.5, 12], [2, 12], [3.5, 10.5], [3.5, 0]], mount, axis, 28), BRONZE);
    g.add(torusAt(vadd(mount, vmul(axis, 3.5)), axis, 9.8, 0.75, 32, 5), GOLD);
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + 0.3, q = vadd(mount, [Math.cos(a) * 7, Math.sin(a) * 7, sg * 3.6]); g.add(domeAt(q, axis, 1.3, 0.9, 8), GOLD); }
    g.add(torusAt(vadd(mount, vmul(axis, 6.2)), axis, 8.2, 0.9, 32, 6), GLOW);
    // wing frame: bone back-up-out behind the head, the feathers trailing down-back; a gentle camber
    const R0 = vadd(mount, vmul(axis, 9));
    const Dw = vnorm([-0.8, 0.14, sg * 0.58]);
    let Ew = vnorm([-0.2, -0.96, sg * 0.1]); Ew = vnorm(vsub(Ew, vmul(Dw, vdot(Ew, Dw))));
    let Nw = vnorm(vcross(Dw, Ew)); if (Nw[2] * sg < 0) Nw = vmul(Nw, -1);
    const map = (u, v, z) => vadd(vfr(R0, Dw, Ew, Nw, u, v, z), vmul(Nw, 0.0003 * u * u - 0.0005 * v * v - 0.00012 * u * v));
    const wing = g.part(sg > 0 ? 'fx_wingR' : 'fx_wingL', { pivot: R0, extras: { open: sg * 34, hinge: [1, 0.2, 0], hover: 0.003, period: 2.7, order: sg > 0 ? 0 : 1,
      note: 'wing: floats off its mount (hover); open 1 = spread (channel / ult)' } });
    wing.add(along([[-1.5, 0], [-1.5, 8.5], [0, 9.6], [3.5, 9.2], [5, 7], [5, 0]], vadd(R0, vmul(axis, -1)), axis, 24), BRONZE);
    wing.add(domeAt(vadd(R0, vmul(axis, 4)), axis, 4.2, 2.6, 14), GOLD);
    // bone: knuckle boss, gold talon at the tip
    const bone = [[0, 2], [34, 10], [70, 13], [112, 9], [150, 0], [174, -8]];
    const boneV = curveFn(bone.map(([u, v]) => [u, v]));
    wing.add(ttube(bone.map(([u, v]) => map(u, v, 5)), (u) => lerp(6, 2.4, u), 0, { radial: 10, seg: 34 }), BRONZE);
    wing.add(sphere(map(70, 13, 5), 6.4, { seg: 16 }), BRONZE);
    wing.add(torusAt(map(70, 13, 5), vnorm(vsub(map(74, 13, 5), map(66, 12.6, 5))), 6.2, 1.1, 20, 5), GOLD);
    wing.add(along([[0, 2.4], [6, 1.7], [13, 0.4], [14, 0]], map(172, -7, 5), vnorm(vsub(map(180, -11, 5), map(166, -4, 5))), 10), GOLD);
    // seven primaries fanning from inner (down) to outer (swept back along the bone); the outer ones under the inner.
    // Each: a bronze plate (cast barbs on its back), enamel in a deep root field, a mid field and a pale tip with a
    // white eye spot, a gold border wire, the rachis and raked barb wires on alternate sides (8-10 cells a vane)
    const F = [[16, -84, 50, 13.5], [38, -94, 60, 14.5], [60, -105, 68, 15], [82, -116, 76, 15], [104, -128, 82, 14.5], [126, -140, 86, 13.5], [148, -152, 84, 12.5]];
    const PAL = [[COBALT, JADE, TURQ], [INK, TEAL, TURQ]];
    const Tm = { [BRONZE]: [], [GOLD]: [], [PORC]: [], [COBALT]: [], [INK]: [], [JADE]: [], [TEAL]: [], [TURQ]: [] };
    F.slice().reverse().forEach(([ub, ang, L, Wf], ri) => {
      const i = F.length - 1 - ri, z0 = 0.4 + (F.length - 1 - i) * 1.5, a = ang * D2R, dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
      const vb = boneV(ub) - 3, pal = PAL[i % 2];
      const P = (x, y) => [ub + dx * x + nx * y, vb + dy * x + ny * y];
      // outline: narrow leading vane (+y side), broad trailing vane, rounded tip
      const wv = (u) => (0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, u * 1.15) * 0.5)) * (u > 0.8 ? Math.sqrt(Math.max(0, 1 - ((u - 0.8) / 0.2) ** 2)) : 1);
      const out = [];
      for (let k = 0; k <= 10; k++) { const u = Math.pow(k / 10, 0.85); out.push(P(u * L, -Wf * wv(u))); }
      for (let k = 10; k >= 0; k--) { const u = Math.pow(k / 10, 0.85); out.push(P(u * L, Wf * 0.6 * wv(u))); }
      const poly = out.filter((p, k) => k === 0 || Math.hypot(p[0] - out[k - 1][0], p[1] - out[k - 1][1]) > 0.3);
      Tm[BRONZE].push(...fanT(poly, z0 - 1.5, z0, { b: 0.45, step: 8, rings: 1 }));
      const inner = insetPoly(poly, 1.5), c0 = ub * dx + vb * dy;
      const zone = (lo, hi) => { let Q = inner; if (lo > 0) Q = clipHalf(Q, -dx, -dy, -(c0 + lo * L)); if (hi < 1) Q = clipHalf(Q, dx, dy, c0 + hi * L); return Q; };
      [[0, 0.4], [0.4, 0.78], [0.78, 1]].forEach(([lo, hi], zi) => { const Q = zone(lo, hi); if (Q.length > 2) Tm[pal[zi]].push(...fanT(Q, z0 - 0.2, z0 + 0.3, { b: 0.15, step: 5, rings: 1 })); });
      { const spot = []; for (let k = 0; k < 10; k++) { const th = k / 10 * TAU; spot.push(P(L * 0.87 + Math.cos(th) * L * 0.055, -Wf * 0.3 + Math.sin(th) * Wf * 0.24)); } Tm[PORC].push(...fanT(spot, z0 - 0.1, z0 + 0.42, { b: 0.12, step: 3.5, rings: 1 })); }
      const G = Tm[GOLD];
      G.push(...wireT(insetPoly(poly, 0.9), 1.15, z0 - 0.1, z0 + 0.95, { closed: true, step: 9 }));
      G.push(...ribbonT([P(2, 0), P(L * 0.5, -0.5), P(L * 0.88, -0.8)], (f) => lerp(1.9, 0.7, f), z0 - 0.1, z0 + 1.15, { step: 8 }));
      for (const k of [0.4, 0.78]) G.push(...wireT([P(L * k, -Wf * wv(k) * 0.95), P(L * (k + 0.02), 0), P(L * k, Wf * 0.6 * wv(k) * 0.95)], 0.6, z0 - 0.1, z0 + 0.8, { step: 9 }));
      for (let k = 0; k < 8; k++) {
        const s2 = k % 2 ? 1 : -1, kk = 0.09 + 0.77 * k / 7, w = Wf * (s2 < 0 ? 1 : 0.6) * wv(Math.min(1, kk + 0.1)) * 0.93;
        G.push(...wireT([P(L * kk, 0), P(L * (kk + 0.05), s2 * w * 0.5), P(L * (kk + 0.1), s2 * w)], 0.55, z0 - 0.1, z0 + 0.75, { step: 9 }));
      }
      // cast barbs on the back
      Tm[BRONZE].push(...wireT([P(3, 0), P(L * 0.5, -0.5), P(L * 0.86, -0.8)], (f) => lerp(1.6, 0.7, f), z0 - 1.4, z0 - 2.1, { step: 14 }));
      for (let k = 0; k < 4; k++) { const s2 = k % 2 ? 1 : -1, kk = 0.16 + 0.18 * k, w = Wf * (s2 < 0 ? 1 : 0.6) * wv(kk + 0.1) * 0.85; Tm[BRONZE].push(...wireT([P(L * kk, 0), P(L * (kk + 0.05), s2 * w * 0.5), P(L * (kk + 0.1), s2 * w)], 0.8, z0 - 1.4, z0 - 1.95, { step: 12 })); }
    });
    for (const [mat, T] of Object.entries(Tm)) if (T.length) wing.add(mapTris(T, map), mat);
    // coverts: tapering gold-leaf shields over the feather roots, cast bronze rims, curls alternating, granulated edges
    for (let k = 0; k < 6; k++) {
      const ub = 4 + k * 23, vb = boneV(ub) - 3.5, z0 = 13.4 - k * 0.55, Lc = 40 - k * 2.8, Wc = 11 - k * 0.6, a = (-84 - k * 9) * D2R;
      const at = (x, y) => [ub + Math.cos(a) * x - Math.sin(a) * y, vb + Math.sin(a) * x + Math.cos(a) * y];
      const wc = (f) => Wc * Math.pow(Math.sin(Math.PI * Math.min(0.999, Math.pow(f, 0.75))), 0.7) * (f < 0.12 ? 0.6 + f * 3.3 : 1), poly = [];
      for (let j = 0; j <= 8; j++) { const f = j / 8; poly.push(at(f * Lc, -wc(f))); }
      for (let j = 7; j >= 1; j--) { const f = j / 8; poly.push(at(f * Lc, wc(f) * 0.86)); }
      wing.add(mapTris(fanT(poly, z0 - 2, z0, { b: 0.5, step: 6, rings: 1 }), map), 'gold_leaf');
      wing.add(mapTris(cat(wireT(insetPoly(poly, 0.8), 1.15, z0 - 0.1, z0 + 0.9, { closed: true, step: 7 }),
        curlW(...at(Lc * 0.36, 0), 3.6 * Lc / 30, k % 2 ? -sg : sg, k * 40, z0 - 0.1, z0 + 0.75, 0.85),
        wireT([at(Lc * 0.5, 0), at(Lc * 0.72, -0.4), at(Lc * 0.9, -0.6)], (f) => lerp(0.9, 0.5, f), z0 - 0.1, z0 + 0.7, { step: 7 })), map), BRONZE);
      for (let j = 0; j < 5; j++) {
        const f = 0.26 + j * 0.15, [u, v] = at(f * Lc, -wc(f) * 0.78);
        wing.add(dome(map(u, v, z0 + 0.05), mapN(map, u, v, z0), 0.8, 0.65), GOLD);
      }
    }
    g.socket(sg > 0 ? 'wingR' : 'wingL', map(174, -8, 5));
  }

  // ======================================================================== tassel off the back of the mane
  {
    const hang = [-49, 343, 0];
    g.add(ttube([HPw(-2, 4, 0), [-34, 352, 0], [-46, 350, 0], vadd(hang, [0, 2, 0])], 2.6, 2, { radial: 7, seg: 12 }), BRONZE);
    const ts = g.part('fx_tassel', { pivot: hang, extras: { swing: 'pendulum', len: 0.1, note: 'silk tassel: pendulum' } });
    ts.add(torusAt(hang, WV, 4, 1.2, 18, 6), GOLD);
    const c1 = vadd(hang, [0, -18, 0]), bead = vadd(hang, [0, -28, 0]), cap = vadd(hang, [0, -38, 0]);
    ts.add(sweep([vadd(hang, [0, -3, 0]), vadd(hang, [0.8, -14, 0]), c1], 1.1, { seg: 10, radial: 6 }), SILK);
    ts.add(lax([[0, 0], [0, 3], [2, 4.2], [4, 4.2], [5, 2], [5, 0]], vadd(c1, [0, -1, 0]), 't', 14), GOLD);
    ts.add(sphere(bead, 7.4, { seg: 18 }), BEAD);
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; ts.add(ttube([vadd(bead, [Math.cos(a) * 3, 6.8, Math.sin(a) * 3]), vadd(bead, [Math.cos(a) * 7.6, 0, Math.sin(a) * 7.6]), vadd(bead, [Math.cos(a) * 3, -6.8, Math.sin(a) * 3])], 0.7, 0.7, { radial: 4, seg: 8, caps: false }), BEAD); }
    ts.add(lax([[0, 0], [0, 6.6], [3, 7.2], [9, 5.6], [10, 3], [10, 0]], vadd(cap, [0, -8, 0]), 't', 16), GOLD);
    for (let k = 0; k < 22; k++) {
      const a = k / 22 * TAU + (k % 2) * 0.1, r0 = 3 + (k % 3), L = 48 + (k % 5) * 3;
      const p0 = vadd(cap, [Math.cos(a) * r0, -9, Math.sin(a) * r0]);
      ts.add(ttube([p0, vadd(p0, [Math.cos(a) * 3, -L * 0.5, Math.sin(a) * 3]), vadd(p0, [Math.cos(a) * 5, -L, Math.sin(a) * 5])], 0.75, 0.45, { radial: 3, seg: 6 }), SILK);
    }
    ts.add(helixCord(4.6, cap[1] - 16, 3, 2.1, 0.75, { cs: cap[0], cw: cap[2], radial: 4, perTurn: 16 }), GOLD);
  }

  // ======================================================================== sockets & meta
  g.socket('grip_r', [0, 0, 0], { rot: [0, 0, -6] });
  g.socket('grip_l', [0, S.gripL, 0]);
  g.socket('butt', [0, S.butt, 0]);
  g.socket('base', [0, 300, 0]);
  g.meta({
    grip: 'melee', support: 'vertical', reload: 'none', series: 'leize',
    notes: 'X04 應龍．御霆 staff. t = staff axis (head +t), s = the way the dragon faces. fx_ring1 > fx_ring2 > fx_ring3: nested armillary '
      + '(spin t / s / w). fx_pearl: 雷珠 hero (muzzle). fx_wingL/R: floating wings (open 1 = spread). fx_jaw: lower jaw (open 1 = wide). '
      + "fx_tassel: pendulum. Sockets boltL/R = where the darts leave, mouth = the dragon's breath.",
  });

  // bake: pre-tessellated (not the lacquer shaft: its own lathe stations carry the AO), short AO reach, m4's post-bake
  // (buried AO refill, per-material wear from curvature), patina only in real recesses
  const build0 = g.build.bind(g);
  g.build = (o = {}) => {
    const root = build0({ ...o, bake: false });
    if (o.bake !== false) {
      const meshes = [];
      root.traverse((m) => { if (m.isMesh) meshes.push(m); });
      const tess = (o.tessellate ?? TESS) * 0.001;
      for (const m of meshes) {
        let geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
        for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
        m.geometry = m.userData.mat === LAQ ? geo : tessellateFat(geo, /^(lacquer_|leather|glaze_|crystal)/.test(m.userData.mat) ? tess : tess * 2, 0.0016);
      }
      if (o.tessOnly) return root;
      const glassy = (m) => /^(crystal|glass|glow_)/.test(m.userData.mat);
      bakeMeshes(meshes, { tessellate: 0, aoDist: 0.022, rays: 32, log: true, minHeight: (m) => (glassy(m) ? 0.004 : /^bronze/.test(m.userData.mat) ? 0.0005 : 0) });
      postBake(root, {}, WEAR);
      root.traverse((m) => {
        if (!m.isMesh) return;
        const B = m.geometry.attributes._bake?.array;
        if (!B) return;
        // patina pools in the cast recesses of the bronze (cavity from the AO), glass / glow stay clean
        if (glassy(m)) for (let i = 0; i < B.length; i += 4) { B[i] = Math.max(B[i], 225); B[i + 1] = 0; B[i + 2] = 0; }
        else if (/bronze/.test(m.userData.mat)) for (let i = 0; i < B.length; i += 4) { const ao = B[i] / 255; B[i + 2] = Math.max(B[i + 2], Math.round(255 * Math.min(0.95, 2.7 * Math.max(0, 0.935 - ao)))); }
      });
    }
    return root;
  };
  return g;
}

const TESS = 20;
/** per-material wear [curvature (1/m) mapped to full wear, cap] */
const WEAR = {
  '*:bronze_aged': [1 / 420, 0.75], '*:gold': [1 / 450, 0.6], '*:gold_leaf': [1 / 450, 0.5], '*:lacquer_black': [1 / 700, 0.35], '*:leather_black': [1 / 600, 0.5],
  '*:bone': [1 / 700, 0.3], '*:glaze_jade': [0, 0], '*:glaze_teal': [0, 0], '*:glaze_turquoise': [0, 0], '*:glaze_cobalt': [0, 0], '*:glaze_inkteal': [0, 0],
  '*:porcelain': [0, 0], '*:glaze_vermilion': [0, 0], '*:lacquer_red': [0, 0], '*:silk_red': [0, 0], '*:jade': [1 / 900, 0.2],
};
