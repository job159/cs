// 應龍．御霆 Yinglong Stormherald — X04 神兵 magic staff, docs/PREMIUM_WEAPONS.md §2.31.
// A Shang / Zhou bronze dragon staff: 「應龍處南極」— the winged thunder dragon. From the butt up:
//   - butt: a cast bronze 鐏 (spike, beaded lips, four notched 扉棱 flanges), a gold collar;
//   - shaft: black lacquer (crackle in the shader) with bronze bands carrying gold 雲雷紋 (square spirals of alternating
//     hand between bead borders), gold ferrules with granulation; two grips in black leather wrapped as a real stepped
//     helix (each turn rides over the last) with red silk cord bindings at both ends;
//   - the dragon's body coils 1.35 turns up the shaft above the right hand: a lofted helix (tail 3.5 -> 12 mm) carrying
//     real fish scales (staggered rows, each scale rising to its free edge towards the tail), transverse belly plates on
//     the shaft side, a dorsal crest of flame fins, a foreleg and a hind leg with three toes hooked round the shaft
//     (bone talons); the neck rises from the back of the shaft into
//   - the head (sculpted lofts): skull and upper jaw (crown, brow, bridge, snout, nose), a hinged lower jaw (fx_jaw)
//     with a vermilion tongue curling out and a flame beard, bone teeth and fangs, crystal eyes in gold bezels under
//     heavy brows, nostril bulbs with gold curls, cheek cloud-curl relief, three-tine antlers, flame mane and cheek
//     fins, two long gold whiskers sweeping back;
//   - on top: a gold cloud bracket rising off the crown to a pivot cup holding the armillary (渾天儀): fx_ring1 (gold,
//     28 ticks, studs; spins about t) > fx_ring2 (bronze band with gold 雲雷紋, pinned at ±s, spins about s) > fx_ring3
//     (gold, beaded, pinned at ±w, spins about w) — at rest the three rings stand orthogonal — and the 雷珠 hero focus
//     floating in the middle (fx_pearl, crystal);
//   - the wings (fx_wingL / fx_wingR): floating off bronze wing mounts on the head with a glowing seam: a bronze wing
//     bone (knuckle boss, gold talon), five primary feathers in cloisonné (bronze plate, jade / teal enamel, gold
//     border wire, rachis and cell wires), three covert plates;
//   - fx_tassel: red silk tassel with a carved jade bead under a gold cap, hung off the back of the mane.
// Side view, mm: t along the staff (head +t), s = the way the dragon faces, w right. Right hand at the origin.
import * as THREE from 'three';
import { Gun, V, lathe, sphere, profile, merge, xform } from '../lib/gunkit.mjs';
import { bakeMeshes } from '../lib/bake.mjs';
import { postBake } from './m4.mjs';
import {
  D2R, TAU, clamp01, smooth, lerp, cat, vadd, vsub, vmul, vdot, vcross, vlen, vnorm, vlerp, vfr,
  lax, along, aimDir, domeAt, dome, mesh, loft, ttube, curveFn, arcP, circleP, insetPoly,
  ribbonT, fanT, loftT, mapTris, cylMap, thunderT, curlT, petal, helixCord, tessellateFat, sweep,
} from '../lib/sculpt.mjs';

const BRONZE = 'bronze_aged', GOLD = 'gold', LAQ = 'lacquer_black', LEATHER = 'leather_black', SILK = 'silk_red', BONE = 'bone';
const JADE = 'glaze_jade', TEAL = 'glaze_teal', TONGUE = 'glaze_vermilion', PEARL = 'crystal', EYE = 'glass', GLOW = 'glow_cyan', BEAD = 'jade';

// ------------------------------------------------------------------------------------------ layout (mm)
export const STAFF = {
  r: 15,                         // shaft radius (grip zone)
  top: 347, butt: -1192,         // finial top / spike tip
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

export default function build() {
  const g = new Gun('staff');

  // ======================================================================== butt (鐏)
  {
    const B = S.butt;
    g.add(lax([[0, 0], [10, 3.6], [30, 7.2], [48, 9.6], [52, 11.5], [54, 15.2], [57, 16.6], [92, 17.4], [95, 19.2], [100, 19.3], [103, 17.2], [118, 16.4], [121, 18.2], [127, 18.2], [130, 15], [130, 0]], [0, B, 0], 't', 32), BRONZE);
    // granulated lips
    for (const [t, r] of [[B + 97.5, 19.3], [B + 124, 18.2]]) for (let k = 0; k < 22; k++) { const a = k / 22 * TAU + 0.07; g.add(dome([Math.cos(a) * r, t, Math.sin(a) * r], [Math.cos(a), 0, Math.sin(a)], 1.25), GOLD); }
    // four notched 扉棱 flanges
    const fl = [[16, B + 56], [20, B + 58], [23.5, B + 64], [21, B + 70], [25, B + 76], [22, B + 82], [25.5, B + 88], [20.5, B + 92], [17, B + 94]];
    for (let k = 0; k < 4; k++) g.add(xform(profile(fl.map(([r, t]) => [r, t, 0.6]), { w: 3.2, bevel: 0.8, curveSeg: 2 }), { rot: [0, 45 + k * 90, 0] }), BRONZE);
    g.add(lax([[0, 15], [0, 17.2], [1, 17.9], [7, 17.9], [8, 17.2], [8, 15]], [0, B + 130, 0], 't', 32), GOLD);
  }

  // ======================================================================== shaft
  // lacquer core: butt collar -> finial (slight swell towards the head)
  g.add(lax([[0, 0], [0, 14.2], [400, 14.6], [880, 15], [1150, 15.2], [1380, 15.6], [1387, 0]], [0, S.butt + 135, 0], 't', 30), LAQ);
  // finial: gold cap with a bead row
  g.add(lax([[0, 15.6], [3, 17.4], [9, 17.2], [14, 15.5], [22, 11], [28, 6], [31, 0]], [0, 318, 0], 't', 30), GOLD);
  for (let k = 0; k < 20; k++) { const a = k / 20 * TAU; g.add(dome([Math.cos(a) * 17.4, 324, Math.sin(a) * 17.4], [Math.cos(a), 0, Math.sin(a)], 1.1), GOLD); }

  /** gold ferrule (height h) with a granulated waist at t */
  const ferrule = (t, h = 10, r = 15.4) => {
    g.add(lax([[-h / 2, r - 0.2], [-h / 2, r + 1.4], [-h / 2 + 1, r + 2.2], [-1.4, r + 2.2], [-0.8, r + 1.6], [0.8, r + 1.6], [1.4, r + 2.2], [h / 2 - 1, r + 2.2], [h / 2, r + 1.4], [h / 2, r - 0.2]], [0, t, 0], 't', 32), GOLD);
    for (let k = 0; k < 18; k++) { const a = (k + 0.5) / 18 * TAU; g.add(dome([Math.cos(a) * (r + 1.6), t, Math.sin(a) * (r + 1.6)], [Math.cos(a), 0, Math.sin(a)], 0.9), GOLD); }
  };
  /** bronze band with gold 雲雷紋 between bead borders (height 20 at t) */
  const thunderBand = (t, R = 15.6) => {
    g.add(lax([[-10, R - 0.6], [-10, R + 0.6], [-9, R + 1.1], [9, R + 1.1], [10, R + 0.6], [10, R - 0.6]], [0, t, 0], 't', 40), BRONZE);
    const C = 2 * Math.PI * (R + 1.1);
    g.add(mapTris(thunderT(0, C, t - 7.6, t + 7.6, -0.2, 0.75, { lw: 1.0, gap: 0.85 }), cylMap(R + 1.1)), GOLD);
    for (const dt of [-8.9, 8.9]) for (let k = 0; k < 26; k++) { const a = (k + (dt > 0 ? 0.5 : 0)) / 26 * TAU; g.add(dome([Math.cos(a) * (R + 1.1), t + dt, Math.sin(a) * (R + 1.1)], [Math.cos(a), 0, Math.sin(a)], 0.75), GOLD); }
  };
  /** stepped leather helix (each turn rides over the last) from t0 to t1 */
  const wrap = (t0, t1, { R = 15, pitch = 11, width = 13, th = 1.35, a0 = 0 } = {}) => {
    const turns = (t1 - t0 - width) / pitch, n = Math.ceil(turns * 24), hw = width / 2, rings = [];
    const sec = [[R + th, -hw], [R + 2 * th, -hw + 0.7], [R + th * 1.75, hw - 2.2], [R + th, hw - 0.4], [R, hw]];
    for (let i = 0; i <= n; i++) {
      const u = i / n, a = a0 + u * turns * TAU, tc = t0 + hw + u * turns * pitch, c = Math.cos(a), s = Math.sin(a);
      rings.push(sec.map(([r, dt]) => [c * r, tc + dt, s * r]));
    }
    g.add(loft(rings, { crease: 30 }), LEATHER);
    // silk cord bindings at both ends
    for (const [tb, n2] of [[t0 - 0.6, 5], [t1 - 5 * 2.3 + 0.6, 5]]) g.add(helixCord(R + 1.25, tb, n2, 2.3, 1.15, { a0: a0 + 0.6, radial: 5, perTurn: 16 }), SILK);
  };
  // upper grip (right hand, t 0) and lower grip (left hand, t -250)
  wrap(-80, 80, { a0: 0.3 }); ferrule(-86); ferrule(86);
  wrap(-326, -176, { a0: 1.7 }); ferrule(-332); ferrule(-170);
  thunderBand(-128);
  thunderBand(-560); thunderBand(-860);
  for (const t of [-610, -810, -1010]) g.add(lax([[-1.2, 14.6], [-1.2, 15.6], [0, 16.2], [1.2, 15.6], [1.2, 14.6]], [0, t, 0], 't', 32), GOLD);

  // ======================================================================== the dragon: body coil + neck
  const hF = [Math.cos(S.ang * D2R), Math.sin(S.ang * D2R), 0], hU = [-hF[1], hF[0], 0];
  const HP = (x, y, z) => vfr(S.head, hF, hU, WV, x, y, z);
  // the head is sculpted at 1:1 in head-local mm and scaled up about its origin (HSC): HPw = where a head point ends up
  const HSC = S.headScale, HPw = (x, y, z) => vfr(S.head, hF, hU, WV, x * HSC, y * HSC, z * HSC);
  const hsc = (geo) => xform(geo, { scale: HSC, pivot: S.head }), hsp = (p) => vadd(S.head, vmul(vsub(p, S.head), HSC));
  const addH = (geo, mat) => g.add(hsc(geo), mat);
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
    // arc length, radius along it
    const acc = [0];
    for (let i = 1; i < path.length; i++) acc.push(acc[i - 1] + vlen(vsub(path[i], path[i - 1])));
    const L = acc[acc.length - 1], coilL = acc[90];
    const rad = (d) => (d <= coilL ? rb0(d / coilL) : lerp(11.2, 15.5, smooth(0, 1, (d - coilL) / (L - coilL))));
    // resample every ~2.3 mm (three rings per scale)
    const curve = new THREE.CatmullRomCurve3(path.map((p) => new THREE.Vector3(...p)));
    const nR = Math.ceil(L / 2.3), na = 36, rings = [], frames = [];
    let scaleA = 0, prevD = 0;
    for (let i = 0; i <= nR; i++) {
      const u = i / nR, d = u * L, p = curve.getPointAt(u), T = curve.getTangentAt(u), c = [p.x, p.y, p.z], t = [T.x, T.y, T.z];
      // guide by arc length
      let k = 0; while (k < acc.length - 2 && acc[k + 1] < d) k++;
      const gd = vnorm(vlerp(guide[k], guide[k + 1], clamp01((d - acc[k]) / Math.max(1e-6, acc[k + 1] - acc[k]))));
      const D = vnorm(vsub(gd, vmul(t, vdot(gd, t)))), Bv = vcross(t, D), r = rad(d);
      const Ls = lerp(4.2, 7.6, smooth(0, 0.6, d / L));
      scaleA += (d - prevD) / Ls; prevD = d;
      frames.push({ c, t, D, B: Bv, r, d });
      const row = Math.floor(scaleA), fa = scaleA - row, ring = [];
      for (let j = 0; j < na; j++) {
        const ph = j / na * TAU, cph = Math.cos(ph), sph = Math.sin(ph);
        const belly = smooth(0.55, 0.8, -cph);                       // 0 back .. 1 belly (towards the shaft)
        let b = (j / na) * 10 + (row % 2 ? 0.5 : 0), fb = b - Math.floor(b) - 0.5;
        const sc = 0.13 * Math.pow(1 - fa, 0.8) * Math.sqrt(Math.max(0, 1 - 4 * fb * fb)) - 0.02;
        const plate = 0.07 * (1 - ((d / 4.6) % 1));
        const dorsal = 0.12 * Math.pow(Math.max(0, cph), 12);
        const rr = r * (1 - 0.14 * belly) * (1 + lerp(sc, plate, belly) + dorsal) * (i === 0 ? 0.2 : i === nR ? 0.98 : 1);
        ring.push(vadd(c, vadd(vmul(D, rr * cph), vmul(Bv, rr * sph * (1 - 0.06 * belly)))));
      }
      rings.push(ring);
    }
    g.add(loft(rings, { crease: 50, capB: true }), BRONZE);
    // dorsal crest: flame fins along the spine, growing towards the neck
    for (let i = 3; i < frames.length - 4; i += 5) {
      const f = frames[i], u = f.d / L, h = lerp(4, 13, smooth(0.05, 0.95, u));
      const base = vadd(f.c, vmul(f.D, f.r * 1.02));
      g.add(petal(base, vnorm(vadd(vmul(f.D, 0.75), vmul(f.t, -0.66))), f.B, f.t, h, lerp(1.8, 4.2, u), 0.9, { bulge: 0.3, flick: 0.6, nu: 6, na: 6 }), BRONZE);
    }
    // legs: three toes hooked round the shaft, bone talons
    for (const [fu, side] of [[0.28, 1], [0.66, -1]]) {
      const i = Math.round(fu * nR), f = frames[i];
      const root = vadd(f.c, vmul(vnorm(vadd(vmul(f.D, -0.25), vmul(f.B, side * 0.95))), f.r * 0.9));
      const ang = Math.atan2(root[2], root[0]), tt = root[1] - 10;
      const knee = [Math.cos(ang + side * 0.25) * (S.r + 8), tt + 2, Math.sin(ang + side * 0.25) * (S.r + 8)];
      const ankle = [Math.cos(ang + side * 0.42) * (S.r + 3.2), tt - 9, Math.sin(ang + side * 0.42) * (S.r + 3.2)];
      g.add(ttube([root, knee, ankle], (u) => lerp(f.r * 0.45, 3.4, u), 0, { radial: 8, seg: 10 }), BRONZE);
      g.add(sphere(knee, 4.4, { seg: 12 }), BRONZE);
      for (const [da, dt] of [[-0.36, -4], [0, -10], [0.36, -4]]) {
        const a1 = ang + side * 0.42 + da, a2 = a1 + side * 0.22, R1 = S.r + 2.6, R2 = S.r + 1.4;
        const p1 = [Math.cos(a1) * R1, tt - 9 + dt * 0.5, Math.sin(a1) * R1], p2 = [Math.cos(a2) * R2, tt - 9 + dt, Math.sin(a2) * R2];
        g.add(ttube([ankle, p1, p2], 2.5, 1.5, { radial: 6, seg: 6 }), BRONZE);
        const td = vnorm(vsub(p2, p1));
        g.add(along([[0, 1.5], [2.2, 1.2], [4.8, 0.3], [5.2, 0]], p2, vnorm(vadd(td, [-Math.cos(a2) * 0.6, 0, -Math.sin(a2) * 0.6])), 8), BONE);
      }
    }
  }

  // ======================================================================== the head
  // head-local mm: x forward along F (skull back 0 -> nose tip 101), y up along U, z = w. A short muzzle under a high
  // brow, a pinched bridge and a big upturned 如意 nose; the upper lip curls up at the tip
  const Ht = curveFn([[-4, 20], [0, 27], [10, 34], [22, 37], [34, 35.5], [44, 33], [54, 25.5], [64, 22.5], [74, 25.5], [82, 28], [90, 25], [96, 18], [100, 9], [101.5, 3]]);
  const Hb = curveFn([[-4, -22], [10, -22], [22, -14], [32, -5], [42, -0.6], [86, -0.6], [92, 1.2], [98, 4.5], [101.5, 3]]);
  const Hw = curveFn([[-4, 20], [0, 26], [12, 32], [24, 33.5], [36, 30.5], [46, 27], [56, 21.5], [66, 19], [76, 21.5], [86, 22.5], [93, 19], [98, 12], [101.5, 4]]);
  const NT = 2.3, NB = 3.8, NZ = 2.5;
  /** head side surface point at (x, y) on side sg (z from the superellipse) */
  const headZ = (x, y) => { const h = Ht(x), b = Hb(x), yc = (h + b) / 2, hh = (h - b) / 2, Y = clamp01(Math.abs((y - yc) / hh)); return Hw(x) * Math.pow(Math.max(0, 1 - Math.pow(Y, y > yc ? NT : NB)), 1 / NZ); };
  const headPt = (x, y, sg, off = 0) => {
    const e = 0.4, p = HP(x, y, sg * headZ(x, y)), px = vsub(HP(x + e, y, sg * headZ(x + e, y)), HP(x - e, y, sg * headZ(x - e, y))), py = vsub(HP(x, y + e, sg * headZ(x, y + e)), HP(x, y - e, sg * headZ(x, y - e)));
    let n = vnorm(vcross(px, py)); if (vdot(n, [0, 0, sg]) < 0) n = vmul(n, -1);
    return { p: vadd(p, vmul(n, off)), n };
  };
  const headMap = (sg) => (u, v, z) => headPt(u, v, sg, z).p;
  {
    // skull + upper jaw
    const rings = [], na = 32;
    for (const x of [...Array.from({ length: 35 }, (_, k) => -4 + k * 3), 99.5, 101.5]) {
      const h = Ht(x), b = Hb(x), w = Hw(x), yc = (h + b) / 2, hh = (h - b) / 2, ring = [];
      for (let j = 0; j < na; j++) {
        const a = j / na * TAU, c = Math.cos(a), s = Math.sin(a);
        // cheek swell behind the eye, brow shelf over it, a pinched bridge
        const cheek = 2.4 * Math.exp(-(((x - 18) / 11) ** 2)) * Math.exp(-(((s + 0.1) / 0.45) ** 2));
        const brow = 3.2 * Math.exp(-(((x - 40) / 9) ** 2)) * Math.exp(-(((Math.abs(c) - 0.55) / 0.22) ** 2)) * (s > 0 ? 1 : 0);
        ring.push(HP(x, yc + hh * se(s, s > 0 ? NT : NB) + brow * 0.5, (w + cheek + brow) * se(c, NZ)));
      }
      rings.push(ring);
    }
    addH(loft(rings, { crease: 50 }), BRONZE);
    // cheek cloud curls + flame strokes (cast relief), nostril bulbs with gold curls, brows, eyes
    for (const sg of [1, -1]) {
      const M = headMap(sg);
      addH(mapTris(cat(curlT(16, -4, 8.5, sg, 200, 0, 1.4, 1.5), curlT(31, 0, 4.5, -sg, 30, 0, 1.2, 1.2),
        ribbonT([[6, 8], [18, 12], [32, 11], [44, 6]], (f) => lerp(1.6, 0.6, f), 0, 1.2, { step: 2 }),
        ribbonT([[4, 0], [14, 2], [26, -1]], (f) => lerp(1.4, 0.5, f), 0, 1.1, { step: 2 })), M), BRONZE);
      // eye: a bulging crystal dome in a gold bezel under a heavy brow ridge with three flame tufts sweeping back
      const E = headPt(40, 24, sg);
      addH(sphere(vadd(E.p, vmul(E.n, -1.6)), 7.6, { seg: 20 }), EYE);
      addH(torusAt(vadd(E.p, vmul(E.n, 0.4)), E.n, 8, 1.4, 26, 6), GOLD);
      g.socket(sg > 0 ? 'eyeR' : 'eyeL', hsp(vadd(E.p, vmul(E.n, 5))));
      const b0 = headPt(26, 30, sg, 1).p, b1 = headPt(38, 31, sg, 6).p, b2 = headPt(52, 22, sg, 2).p;
      addH(ttube([b0, b1, b2], (u) => 4.8 - 2.4 * u, 0, { radial: 8, seg: 14 }), BRONZE);
      for (const [k, L, W] of [[0.1, 28, 4.4], [0.32, 22, 3.8], [0.55, 15, 3]]) {
        const p = vlerp(b0, b1, k);
        addH(petal(p, vnorm([-0.85, 0.55, sg * 0.32]), vnorm([0.25, 1, 0]), [0, 0, sg], L, W, 1.4, { bulge: 3, flick: 4.5, nu: 7, na: 6 }), BRONZE);
      }
      // the nose: flared nostril bulbs on top of the muzzle with gold curls, a ridge up the bridge
      const N = headPt(83, 21.5, sg, -1.5);
      addH(sphere(N.p, 8.2, { scale: [1.15, 0.9, 1], seg: 16 }), BRONZE);
      const nd = vnorm(vadd(vadd(N.n, vmul(hF, 0.9)), vmul(hU, 0.4)));
      addH(torusAt(vadd(N.p, vmul(nd, 6.6)), nd, 4.2, 0.95, 20, 5), GOLD);
      addH(sphere(vadd(N.p, vmul(nd, 6.2)), 2.6, { seg: 10 }), BRONZE);
      // cheek fins (ears): three flame plates fanning back
      const fin = headPt(6, 14, sg, -1).p;
      for (let k = 0; k < 3; k++) addH(petal(fin, vnorm(vadd(vmul(hF, -0.85), [0, 0.35 - k * 0.3, sg * 0.45])), [0, 0, sg], vnorm(vcross(vadd(vmul(hF, -1), [0, 0.3 - k * 0.3, 0]), [0, 0, sg])), 30 - k * 5, 5, 1.6, { bulge: 4, flick: 6, nu: 8, na: 6 }), BRONZE);
      // upper teeth along the palate edge, a fang near the front
      for (const x of [50, 58, 66, 74, 86]) {
        const fang = x === 86, z = sg * (Hw(x) - (fang ? 4.5 : 3.4)), p = HP(x, -0.4, z);
        addH(along([[0, fang ? 3.2 : 2.1], [fang ? 8 : 3.8, fang ? 1.8 : 0.7], [fang ? 14 : 4.8, 0]], p, vnorm(vadd(vmul(hU, -1), vmul(hF, fang ? -0.22 : 0))), 8), BONE);
      }
      // mane: big flame tufts off the back of the skull and the cheeks, sweeping back
      for (let k = 0; k < 4; k++) {
        const b = HP(1 + k * 3, -2 + k * 10, sg * (22 - k * 4));
        addH(petal(b, vnorm([-0.95, 0.04 + k * 0.17, sg * (0.42 - k * 0.06)]), vnorm([0.15, 1, sg * 0.25]), [0, 0, sg], 62 + k * 8, 11 - k, 3.2, { bulge: 9, flick: 12, nu: 10, na: 6 }), BRONZE);
      }
      // antler: main beam back-up-out with two tines, gold tips
      const a0 = HP(18, 31, sg * 12);
      const beam = [a0, vadd(a0, [-10, 26, sg * 7]), vadd(a0, [-36, 52, sg * 17]), vadd(a0, [-78, 66, sg * 30]), vadd(a0, [-112, 64, sg * 38])];
      addH(ttube(beam, (u) => lerp(7, 2.4, u), 0, { radial: 9, seg: 22 }), BRONZE);
      for (const [k, d, L] of [[0.3, [-4, 1, sg * 0.25], 30], [0.62, [-0.5, 1, sg * 0.2], 24]]) {
        const p = new THREE.CatmullRomCurve3(beam.map((q) => new THREE.Vector3(...q))).getPointAt(k), b = [p.x, p.y, p.z], dd = vnorm(d);
        addH(ttube([b, vadd(b, vmul(dd, L * 0.55)), vadd(b, vadd(vmul(dd, L), [-L * 0.25, 0, 0]))], (u) => lerp(4.6 - k * 1.6, 1.5, u), 0, { radial: 7, seg: 9 }), BRONZE);
      }
      addH(along([[0, 2.4], [6, 1.2], [9, 0]], beam[4], vnorm(vsub(beam[4], beam[3])), 8), GOLD);
      // whisker: gold, out past the jaw and back in a long curl
      const wk = [HP(90, 4, sg * 18), HP(98, -2, sg * 30), HP(84, -10, sg * 44), HP(56, -7, sg * 52), HP(32, 2, sg * 52), HP(22, 9, sg * 46), HP(25, 13, sg * 40), HP(30, 10, sg * 39)];
      addH(ttube(wk, (u) => lerp(2.4, 0.8, u), 0, { radial: 6, seg: 40 }), GOLD);
    }
    // crown crest between the antlers
    addH(petal(HP(12, 33, 0), vnorm(vadd(vmul(hF, -0.6), [0, 0.8, 0])), vmul(hF, -1), WV, 34, 5, 2.2, { bulge: 5, flick: 6, nu: 9, na: 6 }), BRONZE);
    addH(petal(HP(28, 34, 0), vnorm(vadd(vmul(hF, -0.4), [0, 0.9, 0])), vmul(hF, -1), WV, 20, 4, 1.8, { bulge: 3, flick: 4, nu: 8, na: 6 }), BRONZE);
  }

  // ---- lower jaw (fx_jaw): hinged under the cheeks, open S.jaw degrees at rest
  {
    const J = HP(28, -5, 0), al = -S.jaw * D2R;
    const jF = vnorm(vadd(vmul(hF, Math.cos(al)), vmul(hU, Math.sin(al)))), jU = vcross(WV, jF);
    const JP = (x, y, z) => vfr(J, jF, jU, WV, x - 28, y + 5, z);
    const jaw = g.part('fx_jaw', { pivot: hsp(J), extras: { open: -16, hinge: 'w', note: 'lower jaw: open 1 = jaws wide (ult, rare reload)' } });
    const Jb = curveFn([[26, -12], [40, -16], [56, -16], [70, -14], [82, -11], [90, -7], [94, -3]]);
    const Jw = curveFn([[26, 25], [40, 24], [56, 20], [70, 17], [82, 15], [90, 12], [94, 7]]);
    const rings = [], na = 26;
    for (let x = 26; x <= 94; x += 4) {
      const t0 = -1.4, b = Jb(x), w = Jw(x), yc = (t0 + b) / 2, hh = (t0 - b) / 2, ring = [];
      for (let j = 0; j < na; j++) { const a = j / na * TAU, c = Math.cos(a), s = Math.sin(a); ring.push(JP(x, yc + hh * se(s, s > 0 ? 5 : 2.4), w * se(c, 2.6))); }
      rings.push(ring);
    }
    jaw.add(hsc(loft(rings, { crease: 50 })), BRONZE);
    for (const sg of [1, -1]) {
      for (const x of [50, 58, 66, 74, 84]) {
        const fang = x === 84, p = JP(x, -1.2, sg * (Jw(x) - 3.2));
        jaw.add(hsc(along([[0, fang ? 2.4 : 1.8], [fang ? 6 : 3.4, fang ? 1.2 : 0.5], [fang ? 9.5 : 4.1, 0]], p, vnorm(vadd(jU, vmul(jF, fang ? 0.15 : 0))), 8)), BONE);
      }
      // jaw-line flame beard
      for (let k = 0; k < 3; k++) {
        const b = JP(50 + k * 13, Jb(50 + k * 13) + 2, sg * (7 + k * 2));
        jaw.add(hsc(petal(b, vnorm(vadd(vmul(jF, -0.75), vmul(jU, -0.66))), vmul(jF, -1), [0, 0, sg], 26 - k * 5, 4.5, 1.6, { bulge: 3, flick: 5, nu: 8, na: 6 })), BRONZE);
      }
      jaw.add(hsc(mapTris(curlT(0, 0, 6, sg, 90, 0, 1.1, 1.2), (u, v, z) => vadd(JP(44 + u, -9 + v, sg * Jw(44 + u) * 0.97), [0, 0, sg * z]))), BRONZE);
    }
    // the tongue curls up out of the mouth
    jaw.add(hsc(petal(JP(40, -2, 0), vnorm(vadd(jF, vmul(jU, 0.3))), jU, WV, 48, 6.5, 2, { bulge: 6, flick: 13, nu: 12, na: 8 })), TONGUE);
    g.socket('mouth', hsp(JP(94, 6, 0)));
  }

  // ======================================================================== armillary (渾天儀) and the 雷珠
  {
    const C = S.C;
    // gold cloud bracket off the crown up to the pivot cup
    const cup = [C[0], C[1] - S.R1 - 12, 0];
    const st = [HPw(20, 30, 0), HPw(24, 40, 0), [cup[0] - 10, cup[1] - 12, 0], [cup[0] - 2, cup[1] - 4, 0], vadd(cup, [0, 1, 0])];
    g.add(ttube(st, (u) => lerp(4.6, 3.4, u), 0, { radial: 10, seg: 26 }), GOLD);
    for (const sg of [1, -1]) {
      const p = vlerp(st[2], st[3], 0.2);
      g.add(ttube([p, vadd(p, [-4, 4, sg * 9]), vadd(p, [-11, 2, sg * 13]), vadd(p, [-13, -4, sg * 10]), vadd(p, [-9, -6, sg * 6])], (u) => lerp(2.4, 1.0, u), 0, { radial: 6, seg: 14 }), GOLD);
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
    // the 雷珠: hero focus, floats (hover) in the middle
    const pearl = g.part('fx_pearl', { pivot: C, extras: { hover: 0.002, period: 2.2, note: '雷珠 hero focus (crystal): hovers; plasma arcs are drawn by premium/staff.js' } });
    pearl.add(sphere(C, S.pearl, { seg: 40 }), PEARL);
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
    const Dw = vnorm([-0.8, 0.46, sg * 0.38]);
    let Ew = vnorm([-0.3, -0.94, sg * 0.12]); Ew = vnorm(vsub(Ew, vmul(Dw, vdot(Ew, Dw))));
    let Nw = vnorm(vcross(Dw, Ew)); if (Nw[2] * sg < 0) Nw = vmul(Nw, -1);
    const map = (u, v, z) => vadd(vfr(R0, Dw, Ew, Nw, u, v, z), vmul(Nw, 0.0003 * u * u - 0.0005 * v * v - 0.00012 * u * v));
    const wing = g.part(sg > 0 ? 'fx_wingR' : 'fx_wingL', { pivot: R0, extras: { open: -sg * 24, hinge: [1, 0.25, 0], hover: 0.003, period: 2.7, order: sg > 0 ? 0 : 1,
      note: 'wing: floats off its mount (hover); open 1 = spread (channel / ult)' } });
    wing.add(along([[-1.5, 0], [-1.5, 8.5], [0, 9.6], [3.5, 9.2], [5, 7], [5, 0]], vadd(R0, vmul(axis, -1)), axis, 24), BRONZE);
    wing.add(domeAt(vadd(R0, vmul(axis, 4)), axis, 4.2, 2.6, 14), GOLD);
    // bone: knuckle boss, gold talon at the tip
    const bone = [[0, 2], [34, 10], [70, 13], [112, 9], [150, 0], [174, -8]];
    const boneV = curveFn(bone.map(([u, v]) => [u, v]));
    wing.add(ttube(bone.map(([u, v]) => map(u, v, 5)), (u) => lerp(6, 2.4, u), 0, { radial: 9, seg: 34 }), BRONZE);
    wing.add(sphere(map(70, 13, 5), 6.4, { seg: 14 }), BRONZE);
    wing.add(torusAt(map(70, 13, 5), vnorm(vsub(map(74, 13, 5), map(66, 12.6, 5))), 6.2, 1.1, 20, 5), GOLD);
    wing.add(along([[0, 2.4], [6, 1.7], [13, 0.4], [14, 0]], map(172, -7, 5), vnorm(vsub(map(180, -11, 5), map(166, -4, 5))), 10), GOLD);
    // seven primaries fanning from inner (down) to outer (swept back along the bone); the outer ones under the inner
    const F = [[16, -84, 50, 13.5], [38, -94, 60, 14.5], [60, -105, 68, 15], [82, -116, 76, 15], [104, -128, 82, 14.5], [126, -140, 86, 13.5], [148, -152, 84, 12.5]];
    F.slice().reverse().forEach(([ub, ang, L, Wf], ri) => {
      const i = F.length - 1 - ri, z0 = 0.4 + (F.length - 1 - i) * 1.5, a = ang * D2R, dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
      const vb = boneV(ub) - 3, enamel = i % 2 ? TEAL : JADE;
      const P = (x, y) => [ub + dx * x + nx * y, vb + dy * x + ny * y];
      // outline: narrow leading vane (+y side), broad trailing vane, rounded tip
      const wv = (u) => (0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, u * 1.15) * 0.5)) * (u > 0.8 ? Math.sqrt(Math.max(0, 1 - ((u - 0.8) / 0.2) ** 2)) : 1);
      const out = [];
      for (let k = 0; k <= 12; k++) { const u = k / 12; out.push(P(u * L, -Wf * wv(u))); }
      for (let k = 12; k >= 0; k--) { const u = k / 12; out.push(P(u * L, Wf * 0.6 * wv(u))); }
      const poly = out.filter((p, k) => k === 0 || Math.hypot(p[0] - out[k - 1][0], p[1] - out[k - 1][1]) > 0.3);
      wing.add(mapTris(fanT(poly, z0 - 1.5, z0, { b: 0.45, step: 5, rings: 1 }), map), BRONZE);
      wing.add(mapTris(fanT(insetPoly(poly, 1.5), z0 - 0.2, z0 + 0.3, { b: 0.15, step: 5, rings: 1 }), map), enamel);
      wing.add(mapTris(ribbonT(insetPoly(poly, 0.9), 1.1, z0 - 0.1, z0 + 0.95, { closed: true, step: 4.5 }), map), GOLD);
      wing.add(mapTris(ribbonT([P(2, 0), P(L * 0.5, -0.5), P(L * 0.88, -0.8)], (f) => lerp(1.9, 0.7, f), z0 - 0.1, z0 + 1.15, { step: 5 }), map), GOLD);
      // cell wires: barbs from the rachis out to the border (cloisonné cells), raked towards the tip
      for (const [k, s2] of [[0.3, -1], [0.56, -1], [0.78, -1], [0.44, 1]]) {
        const w = Wf * (s2 < 0 ? 1 : 0.6) * wv(k + 0.12) * 0.9;
        wing.add(mapTris(ribbonT([P(L * k, 0), P(L * (k + 0.07), s2 * w * 0.55), P(L * (k + 0.12), s2 * w)], 0.7, z0 - 0.1, z0 + 0.8, { step: 4 }), map), GOLD);
      }
    });
    // coverts: rounded bronze shields with gold rims and a cloud curl, over the feather roots along the bone
    for (let k = 0; k < 6; k++) {
      const ub = 6 + k * 25, vb = boneV(ub) - 4, z0 = 13.4 - k * 0.5, Lc = 30 - k * 1.5, a = (-86 - k * 9) * D2R;
      const poly = [];
      for (let j = 0; j < 16; j++) { const t2 = j / 16 * TAU, x = (Math.cos(t2) * 0.5 + 0.5) * Lc, y = Math.sin(t2) * 9.5 * (1 - 0.32 * Math.cos(t2)); poly.push([ub + Math.cos(a) * x - Math.sin(a) * y, vb + Math.sin(a) * x + Math.cos(a) * y]); }
      wing.add(mapTris(fanT(poly, z0 - 2, z0, { b: 0.5, step: 4, rings: 1 }), map), BRONZE);
      wing.add(mapTris(fanT(insetPoly(poly, 1.4), z0 - 0.2, z0 + 0.3, { b: 0.15, step: 4, rings: 1 }), map), k % 2 ? JADE : TEAL);
      wing.add(mapTris(ribbonT(insetPoly(poly, 0.8), 1.0, z0 - 0.1, z0 + 0.8, { closed: true, step: 4 }), map), GOLD);
      if (k % 2 === 0) wing.add(mapTris(curlT(ub + Math.cos(a) * Lc * 0.5, vb + Math.sin(a) * Lc * 0.5, 4.4, sg, 0, z0 - 0.1, z0 + 0.7, 0.8), map), GOLD);
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
    for (let k = 0; k < 30; k++) {
      const a = k / 30 * TAU + (k % 2) * 0.1, r0 = 3 + (k % 3), L = 48 + (k % 5) * 3;
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
      + "fx_tassel: pendulum. Part 'relief': cast relief (static). Sockets boltL/R = where the darts leave, mouth = the dragon's breath.",
  });

  // bake: pre-tessellated, short AO reach, m4's post-bake (buried AO refill, per-material wear from curvature)
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
        m.geometry = tessellateFat(geo, /^(lacquer_|leather|glaze_|crystal)/.test(m.userData.mat) ? tess : tess * 2, 0.0016);
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
        else if (/bronze/.test(m.userData.mat)) for (let i = 0; i < B.length; i += 4) { const ao = B[i] / 255; B[i + 2] = Math.max(B[i + 2], Math.round(255 * Math.min(0.9, 0.25 + 0.9 * (1 - ao)))); }
      });
    }
    return root;
  };
  return g;
}

const TESS = 20;
/** per-material wear [curvature (1/m) mapped to full wear, cap] */
const WEAR = {
  '*:bronze_aged': [1 / 380, 0.85], '*:gold': [1 / 450, 0.6], '*:lacquer_black': [1 / 700, 0.35], '*:leather_black': [1 / 600, 0.5],
  '*:bone': [1 / 700, 0.35], '*:glaze_jade': [0, 0], '*:glaze_teal': [0, 0], '*:glaze_vermilion': [0, 0], '*:silk_red': [0, 0], '*:jade': [1 / 900, 0.2],
};
