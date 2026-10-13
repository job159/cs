// 畢方．焚翼 Bifang Pyrewing (and, through buildPyrewing('guiche'), its light/dark twin 鬼車．晦翼 Guiche Gloomwing)
// — M03 神兵 heavy, docs/PREMIUM_WEAPONS.md M03 (v1.2 card: cloisonné feathers, feather veins, crest fan; no gold-leaf
// shards / honeycomb / corona).
// An AA-12-pattern automatic scatter cannon built as the one-legged crane of the 山海經 (「其狀如鶴，一足，赤文青質而白喙」):
//   - tail = in-line stock with cloisonné tail-feather plates, body = porcelain receiver shell, neck = vented barrel
//     shroud with gold bands, head = crest plume (front sight) + sky-blue eyes, beak = the muzzle shroud: a fixed
//     upper mandible and a hinged lower one (fx_beak) held a little open, the bore fires out of the gape;
//   - two gold wing bones on ball joints in shoulder pods (fx_wingRootL / R) folded back 10°, opening 69° up and out
//     (compound hinge); the light-wing cards grow from their rivets at runtime (S_wingL / S_wingR = open pose);
//   - 羽脈紋 feather veins (rachis + 9 barbs per side) inlaid with glow strips; cloisonné covert panels and tail
//     feathers (static part `enamel`: gold-wire Voronoi cells through extras.pv) and cloisonné inlays on the bones;
//   - the single focus: a floating 火珠 fire pearl (fx_pearl, crystal) over a gold claw cradle on the receiver top;
//     鬼車: a crescent of nine eyes instead (one large, eight at 0.4 brightness);
//   - single-leg foregrip (畢方一足): slender leg, bronze knee band, three-toed claw (grip_l);
//   - feather-shaped energy magazine (glass shell over a pv_core furnace / cloud interior) behind a side gate.
// Materials 60 / 30 / 10: porcelain (or black lacquer) / gold (or antique silver) / glow.
// Side view, mm: s forward from the buttplate, t up from the bore axis, w right.
import * as THREE from 'three';
import { Gun, V, profile, plan, section, lathe, cyl, box, sphere, sweep, cut, union, intersect, cutters, merge, xform } from '../lib/gunkit.mjs';

// ------------------------------------------------------------------------------------------ local helpers

const PF = (pts, o = {}) => profile(pts, { curveSeg: 4, ...o });
const PL = (pts, o = {}) => plan(pts, { curveSeg: 4, ...o });
const SC = (pts, a, b, o = {}) => section(pts, a, b, { curveSeg: 4, ...o });
const ROT = { s: null, '-s': [0, 180, 0], t: [90, 0, 0], '-t': [-90, 0, 0], w: [0, -90, 0], '-w': [0, 90, 0] };
/** lathe along `axis` ('t' runs up, '-t' down, 'w' right...) starting at `at` (s, t, w) */
function lax(pts, at, axis = 's', seg = 20) {
  const g = lathe(pts, { seg });
  if (ROT[axis]) xform(g, { rot: ROT[axis] });
  const c = V(...at);
  g.translate(c.x, c.y, c.z);
  return g;
}
const capScrew = (at, r, axis = 'w', d = 1.4, seg = 10) =>
  lax([[0, 0], [0, r], [d * 0.62, r], [d, r - 0.35], [d, r * 0.5], [d - 0.7, r * 0.5], [d - 0.7, 0]], at, axis, Math.min(seg, 10));
const domeRivet = (at, r, axis = 'w', d = 1.2) => lax([[0, 0], [0, r], [d * 0.5, r * 0.8], [d, 0]], at, axis, 10);
const pinEnd = (at, r, axis = 'w', d = 0.6) => lax([[0, 0], [0, r], [d, r - 0.2], [d, 0]], at, axis, 14);
const arcPts = (cs, ct, r, a0, a1, n) => {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = (a0 + ((a1 - a0) * i) / n) * Math.PI / 180; out.push([cs + r * Math.cos(a), ct + r * Math.sin(a)]); }
  return out;
};
/** ring band round the bore axis (s0..s1, radii r0..r1, chamfer b), axis offset t */
const band = (s0, s1, r0, r1, t = 0, b = 0.5, seg = 36) => lathe([[s0, r0], [s0, r1 - b], [s0 + b, r1], [s1 - b, r1], [s1, r1 - b], [s1, r0], [s0, r0]], { t, seg });
/** straight strip (inlay, wire, groove cutter) from a to b in the side plane at w: height h, thickness d */
function strip(a, b, w, h, d, r = 0.25) {
  const ds = b[0] - a[0], dt = b[1] - a[1], L = Math.hypot(ds, dt);
  if (Math.min(h, d) < 1.5) r = 0;          // thin wires / inlays: plain boxes (12 tris), rounding is invisible there
  return box([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, w], [L, h, d], { r, seg: 1, rot: [Math.atan2(dt, ds) * 180 / Math.PI, 0, 0] });
}

// 3x5 pixel font for raised roll-marks
const FONT = {
  A: ['010', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'], C: ['111', '100', '100', '100', '111'],
  D: ['110', '101', '101', '101', '110'], E: ['111', '100', '110', '100', '111'], F: ['111', '100', '110', '100', '100'],
  G: ['111', '100', '101', '101', '111'], H: ['101', '101', '111', '101', '101'], I: ['111', '010', '010', '010', '111'],
  K: ['101', '101', '110', '101', '101'], L: ['100', '100', '100', '100', '111'], M: ['101', '111', '111', '101', '101'],
  N: ['110', '101', '101', '101', '101'], O: ['111', '101', '101', '101', '111'], P: ['111', '101', '111', '100', '100'],
  R: ['110', '101', '110', '101', '101'], S: ['111', '100', '111', '001', '111'], T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '111'], W: ['101', '101', '111', '111', '101'], Y: ['101', '101', '010', '010', '010'],
  '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'], '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '011', '001', '111'], '-': ['000', '000', '111', '000', '000'], '.': ['000', '000', '000', '000', '010'],
  ' ': ['000', '000', '000', '000', '000'],
};
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
// original emblem: the one-legged crane in a 9x9 cell (side = -1 reads correctly on the left flank)
const CRANE = ['000011000', '000111000', '000010000', '001110000', '011111100', '111111110', '000110000', '000010000', '000111000'];

// variant looks (the twin shares the skeleton, §2.26)
const LOOKS = {
  bifang: {
    id: 'bifang', body: 'porcelain', trim: 'gold', dark: 'black_chrome', vein: 'glow_sun', crest: 'lacquer_red', toe: 'gold', claw: 'bronze_aged',
    grout: '#e3b04b', mark: 'BIFANG M03', sub: 'PYREWING 12G', hooked: false, focus: 'pearl', eye: 'crystal',
    eyeTint: '#6ec8ff', mag: { coreMode: 3, coreTint: '#ff8a2a' },
  },
  guiche: {
    id: 'guiche', body: 'lacquer_black', trim: 'chrome', dark: 'black_chrome', vein: 'glow_purple', crest: 'glaze_aubergine', toe: 'chrome', claw: 'black_chrome',
    grout: '#9aa0a6', mark: 'GUICHE M03', sub: 'GLOOMWING 12G', hooked: true, focus: 'eyes', eye: 'obsidian',
    eyeTint: '#b54bff', mag: { coreMode: 1, coreTint: '#b54bff' },
  },
};

// wing geometry (rest = folded back 10° along the shoulder; open = 69° about a compound hinge, up and out)
const HINGE = [420, 70, 38];            // s, t, |w| of the shoulder ball joints
const BONE_L = 180;
const D2R = Math.PI / 180;
const tv = (s, t, w) => new THREE.Vector3(w, t, -s);           // gunkit (s,t,w) -> three
const st = (v) => [-v.z, v.y, v.x];                            // three -> (s,t,w)
function wingHinge(sd) {
  // folded direction d0 (backwards, 10° up) -> open direction d1 (up, out, a little back): rotation axis + angle
  const d0 = tv(-Math.cos(10 * D2R), Math.sin(10 * D2R), 0).normalize();
  const d1 = tv(-0.22, 0.78, 0.58 * sd).normalize();
  const axis = new THREE.Vector3().crossVectors(d0, d1).normalize();
  const ang = Math.acos(d0.dot(d1)) / D2R;
  return { axis, ang, q: new THREE.Quaternion().setFromAxisAngle(axis, ang * D2R), sAxis: st(axis).map((x) => +x.toFixed(4)) };
}
/** rest point (s,t,w) on a wing bone -> where it sits with the wing open (s,t,w) */
function openPoint(p, sd) {
  const h = wingHinge(sd), piv = tv(HINGE[0], HINGE[1], HINGE[2] * sd);
  const v = tv(...p).sub(piv).applyQuaternion(h.q).add(piv);
  return st(v).map((x) => +x.toFixed(2));
}

// ------------------------------------------------------------------------------------------ model

export function buildPyrewing(variant = 'bifang') {
  const L = LOOKS[variant];
  const g = new Gun(L.id);
  const BODY = L.body, TRIM = L.trim, DARK = L.dark;
  const SHARD = { shardScale: 55, groutW: 0.8, groutMetal: 1, grout: L.grout };
  const SIGHT = 92;

  // ======================================================================== receiver shell (s 236-652)
  // side profile x rounded cross-section: a soft porcelain body with full shoulders
  {
    const side = PF([[236, -24, 1], [640, -24, 1], [652, 2, 8], [646, 30, 12], [604, 52, 24], [540, 61, 16], [330, 61, 16], [266, 56, 18], [236, 46, 4]],
      { w: 64, bevel: 3.2, bevelSeg: 2, curveSeg: 3 });
    const sec = SC([[-32, -26, 0], [32, -26, 0], [32, 46, 10], [20, 63.5, 10], [-20, 63.5, 10], [-32, 46, 10]], 230, 660, { bevel: 0, curveSeg: 3 });
    let shell = intersect(side, sec);
    // 羽脈紋 feather vein grooves: a rachis rising 6° (s 344-604) and 9 barbs per side, alternating down / up at 45°
    // towards the muzzle, 30 -> 18 mm long; 0.8 mm deep in the flank
    const cuts = [], glows = [];
    const R0 = [344, 0], R1 = [604, 27.3];
    for (const sd of [1, -1]) {
      const wf = 32 * sd;
      cuts.push(strip(R0, R1, wf, 2.2, 1.6, 0));
      glows.push(strip([R0[0] + 2, R0[1] + 0.21], [R1[0] - 2, R1[1] - 0.21], wf - 0.55 * sd, 1.3, 0.5, 0.2));
      for (let i = 0; i < 9; i++) {
        const u = 0.07 + i * 0.105, up = i % 2 === 1 ? 1 : -1;
        const a = [R0[0] + (R1[0] - R0[0]) * u, R0[1] + (R1[1] - R0[1]) * u];
        const len = 30 - 12 * (i / 8), ang = (6 + 45 * up) * D2R;
        const b = [a[0] + Math.cos(ang) * len, a[1] + Math.sin(ang) * len];
        cuts.push(strip(a, b, wf, 1.2, 1.6, 0));
        const a2 = [a[0] + Math.cos(ang) * 1.6, a[1] + Math.sin(ang) * 1.6], b2 = [b[0] - Math.cos(ang) * 0.8, b[1] - Math.sin(ang) * 0.8];
        glows.push(strip(a2, b2, wf - 0.55 * sd, 0.62, 0.5, 0.15));
      }
    }
    // shallow pockets for the cloisonné covert panels
    for (const sd of [1, -1]) cuts.push(cutters.pocketW([[246, -18, 6], [322, -18, 3], [338, 2, 4], [320, 30, 8], [276, 38, 10], [246, 30, 6]], 31.4 * sd, 6));
    shell = cut(shell, cuts);
    g.add(shell, BODY);
    g.add(merge(glows), L.vein);
    // vein terminals: tiny gold studs at both ends of each rachis
    for (const sd of [1, -1]) {
      g.add(domeRivet([R0[0] - 2.6, R0[1] - 0.27, 31.7 * sd], 1.5, sd > 0 ? 'w' : '-w', 0.7), TRIM);
      g.add(domeRivet([R1[0] + 2.6, R1[1] + 0.27, 31.7 * sd], 1.5, sd > 0 ? 'w' : '-w', 0.7), TRIM);
    }
    // gold pinstripe along the lower edge of the shell (where it seats on the lower receiver)
    for (const sd of [1, -1]) {
      g.add(strip([350, -21.6], [636, -21.6], 32.15 * sd, 1.1, 0.5, 0.2), TRIM);
      g.add(strip([238, -21.6], [330, -21.6], 32.15 * sd, 1.1, 0.5, 0.2), TRIM);
    }
    // receiver top: a gold spine with screws between the carry handle and the focus
    g.add(SC([[-4.2, 60.4, 0.6], [4.2, 60.4, 0.6], [3.4, 62.6, 0.6], [-3.4, 62.6, 0.6]], 398, 452, { bevel: 0.5 }), TRIM);
    for (const s of [402, 448]) g.add(capScrew([s, 62, 0], 1.6, 't', 0.7, 10), DARK);
  }

  // ======================================================================== cloisonné panels (static part `enamel`)
  // gold-wire cells (pv_glaze SHARD, gold grout) set into the flank pockets with a gold rim; tail-feather plates on
  // the stock below. The shard parameters ride on the part (extras.pv) so the rest of the porcelain stays plain.
  const en = g.part('enamel', { extras: { pv: { ...SHARD, irid: 0.08 } } });
  {
    const covert = [[247, -17, 6], [321, -17, 3], [337, 2, 4], [319, 29, 8], [276, 37, 10], [247, 29, 6]];
    for (const sd of [1, -1]) {
      en.add(PF(covert, { w: 4.6, cw: 29.8 * sd, bevel: 0.8, bevelSeg: 1, curveSeg: 3 }), BODY);
      const rim = PF([[244, -20, 8], [324, -20, 4], [341, 2, 5], [322, 32, 9], [276, 40, 11], [244, 32, 7]],
        { w: 1.2, cw: 31.9 * sd, bevel: 0.35, bevelSeg: 1, curveSeg: 3, holes: [covert] });
      en.add(rim, TRIM);
      for (const [a, b] of [[[262, -15], [300, 33]], [[284, -15], [318, 26]]]) en.add(strip(a, b, 32.05 * sd, 0.9, 0.5, 0.2), TRIM);
    }
  }

  // ======================================================================== shoulder pods (static) + wing bones (fx_wingRootL / R)
  for (const sd of [1, -1]) {
    // a porcelain bulb grown out of the shoulder; its gold-lipped cup holds the ball joint
    const PW = (HINGE[2] - 4) * sd;
    g.add(lax([[0, 0], [0, 9], [3, 12.6], [12, 14.2], [17, 13.4], [20.6, 11.2], [21.4, 9.6], [21.4, 0]], [HINGE[0], 44, PW], 't', 20), BODY);
    g.add(lax([[0, 8.6], [0, 11.2], [0.7, 11.9], [2.2, 11.9], [2.2, 8.6], [0, 8.6]], [HINGE[0], 64.8, PW], 't', 20), TRIM);
    for (let k = 0; k < 4; k++) { const a = (k + 0.5) * Math.PI / 2; g.add(capScrew([HINGE[0] + Math.cos(a) * 12.2, 58.3, PW + Math.sin(a) * 12.2], 1.1, 't', 0.5, 8), DARK); }

    const side = sd > 0 ? 'R' : 'L';
    const h = wingHinge(sd);
    const bone = g.part('fx_wingRoot' + side, { pivot: [HINGE[0], HINGE[1], HINGE[2] * sd], extras: {
      open: +h.ang.toFixed(2), hinge: h.sAxis, wing: side, cards: 7, order: sd > 0 ? 1 : 0, pv: { ...SHARD, irid: 0.06 },
      note: 'wing bone on a ball joint: folded back 10°, open 1 = 69° up and out (compound hinge); wing cards spawn at S_wing' + side } });
    // bone outline in the folded pose: a tapering wing arm, smooth leading edge on top, scalloped trailing edge
    const c10 = Math.cos(10 * D2R), s10 = Math.sin(10 * D2R);
    const P = (u, o) => [HINGE[0] - u * c10 - o * s10, HINGE[1] + u * s10 + o * c10];     // u along the bone (back), o across (up)
    const hw = (u) => 17 - 12 * (u / BONE_L);                                              // half width 17 -> 5
    const top = [], bot = [];
    for (let i = 0; i <= 10; i++) { const u = 8 + (BONE_L - 8) * i / 10; top.push([...P(u, hw(u) * 0.95 + 1.5 * Math.sin(Math.PI * i / 10)), 0]); }
    for (let i = 10; i >= 0; i--) {
      const u = 8 + (BONE_L - 8) * i / 10, scl = i > 0 && i < 10 ? 2.2 * Math.abs(Math.sin(i * 2.4)) : 0;
      bot.push([...P(u, -hw(u) + scl), 0]);
    }
    const outline = [[...P(-6, 10), 6], ...top, [...P(BONE_L + 4, 0), 3], ...bot, [...P(-6, -10), 6]];
    const W0 = HINGE[2] * sd;
    bone.add(PF(outline, { w: 8, cw: W0, bevel: 1.4, bevelSeg: 2, curveSeg: 3 }), TRIM);
    // cloisonné inlays on both faces, a glow line along the leading edge (lights up when ready)
    const inner = [];
    for (let i = 0; i <= 8; i++) { const u = 22 + (BONE_L - 40) * i / 8; inner.push([...P(u, hw(u) * 0.62), i === 0 || i === 8 ? 1.5 : 0]); }
    for (let i = 8; i >= 0; i--) { const u = 22 + (BONE_L - 40) * i / 8; inner.push([...P(u, -hw(u) * 0.62), i === 0 || i === 8 ? 1.5 : 0]); }
    for (const f of [1, -1]) bone.add(PF(inner, { w: 1.4, cw: W0 + f * 4.25, bevel: 0.45, bevelSeg: 1 }), BODY);
    bone.add(strip(P(22, hw(22) * 0.8), P(BONE_L - 18, hw(BONE_L - 18) * 0.8), W0 + sd * 4.1, 1.0, 0.6, 0.2), L.vein);
    // 5 Ø4 rivets on the outer inlay (the wing cards grow from them)
    for (let k = 0; k < 5; k++) { const u = 34 + k * 28; bone.add(domeRivet([...P(u, hw(u) * 0.3), W0 + sd * 4.9], 2, sd > 0 ? 'w' : '-w', 1.2), TRIM); }
    // ball joint at the hinge: gold ball, porcelain collar on the bone
    bone.add(sphere([HINGE[0], HINGE[1], W0], 9.5, { seg: 16 }), TRIM);
    bone.add(lax([[0, 6], [0, 10.5], [1, 11.2], [4.5, 11.2], [5.5, 10], [5.5, 6], [0, 6]], [HINGE[0] - 9, HINGE[1] + 1.6, W0], '-s', 14), BODY);
    // alula: three short feather plates at the root
    for (let k = 0; k < 3; k++) {
      const u0 = 14 + k * 9, ang = 22 + k * 12;
      const a = P(u0, hw(u0) * 0.9), dir = [-Math.cos((10 + ang) * D2R), Math.sin((10 + ang) * D2R)];
      const len = 26 - k * 5;
      const fp = [[a[0], a[1], 1], [a[0] + dir[0] * len * 0.55 - dir[1] * 3.4, a[1] + dir[1] * len * 0.55 + dir[0] * 3.4, 2], [a[0] + dir[0] * len, a[1] + dir[1] * len, 1],
        [a[0] + dir[0] * len * 0.5 + dir[1] * 2.6, a[1] + dir[1] * len * 0.5 - dir[0] * 2.6, 2]];
      bone.add(PF(fp, { w: 2.2, cw: W0 + sd * (1.4 + k * 1.3), bevel: 0.5, bevelSeg: 1, curveSeg: 3 }), k === 1 ? BODY : TRIM);
    }
    // where the cards root once the wing is open (the middle rivet); extras.rest = the folded position
    const rv = [...P(90, hw(90) * 0.3), W0 + sd * 6];
    g.socket('wing' + side, openPoint(rv, sd), { rest: rv.map((x) => +x.toFixed(2)), side });
  }

  // ======================================================================== carry handle + rear aperture (s 256-394)
  {
    const hp = PF([[256, 50, 0], [394, 50, 0], [394, 62, 2], [382, 79, 12], [300, 86.5, 14], [268, 86.5, 6], [256, 72, 4]], {
      w: 17, bevel: 2.6, bevelSeg: 2, curveSeg: 3, holes: [[[280, 63.5, 5], [362, 63.5, 5], [356, 77, 9], [286, 79, 9]]] });
    g.add(hp, BODY);
    g.add(SC([[-5, 86.2, 0.8], [5, 86.2, 0.8], [3.8, 88.4, 0.8], [-3.8, 88.4, 0.8]], 272, 352, { bevel: 0.5 }), TRIM);
    for (const sd of [1, -1]) for (const s of [266, 386]) g.add(capScrew([s, 62, 8.6 * sd], 1.5, sd > 0 ? 'w' : '-w', 0.6, 10), DARK);
    // rear aperture: gold ring on a short post (sight_rear at its centre)
    g.add(box([266, 89, 0], [7, 6, 7], { r: 1.2 }), TRIM);
    g.add(lathe([[263, 1.5], [263, 5.6], [263.6, 6.2], [268.4, 6.2], [269, 5.6], [269, 1.5], [263, 1.5]], { t: SIGHT, seg: 24 }), TRIM);
    g.add(PF([[292, 63.2, 2], [352, 63.2, 2], [348, 66.4, 2], [296, 66.4, 2]], { w: 12, bevel: 0.8 }), 'rubber');
  }

  // ======================================================================== focus: the fire pearl / nine eyes
  if (L.focus === 'pearl') {
    // floating 火珠 (Ø16 faceted crystal) over a gold claw cradle: 5 curled prongs, a 1.5 mm air gap, a faint field disc
    const PC = [470, 79];
    g.add(lax([[0, 0], [0, 15], [1.4, 15.6], [3, 15.4], [4.4, 13.2], [6, 9.4], [7.2, 8.4], [7.2, 0]], [PC[0], 60.8, 0], 't', 20), BODY);
    g.add(lax([[0, 6.6], [0, 9.6], [0.6, 10.2], [2, 10.2], [2, 6.6], [0, 6.6]], [PC[0], 67.4, 0], 't', 20), TRIM);
    g.add(lax([[0, 0], [0, 6.4], [0.45, 6.4], [0.45, 0]], [PC[0], 69.2, 0], 't', 24), 'glow_vermilion');
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.3, ca = Math.cos(a), sa = Math.sin(a);
      const R = (r, t) => [PC[0] + ca * r, t, sa * r];
      const pts = [R(8.4, 68.2), R(11.8, 71), R(12.4, 76), R(10.8, 80), R(9.3, 81.6)];
      g.add(sweep(pts, 1.05, { seg: 10, radial: 5 }), TRIM);
      g.add(sphere(pts[4], 1.2, { seg: 8 }), TRIM);
    }
    const pearl = g.part('fx_pearl', { pivot: [PC[0], PC[1], 0], extras: { spin: 't', rate: 24, hover: 0.0012, period: 2.6, pv: { gem: 1.5, irid: 0.18, coreTint: '#ffb43a' },
      note: '火珠 focus: floats over the claw cradle, spins slowly (spinMul up when ready / casting)' } });
    pearl.add(sphere([PC[0], PC[1], 0], 8, { seg: 12 }), 'crystal');
    g.socket('pearl', [PC[0], PC[1], 0]);
  } else {
    // 鬼車: a crescent of nine eyes on a black plate: one large (focus), eight at 0.4 brightness behind it
    const C = [486, 0];
    const plate = [...arcPts(C[0], 0, 23, 96, 264, 12), ...arcPts(C[0], 0, 10.5, 264, 96, 8)].map(([s, w]) => [s, w, 0]);
    g.add(PL(plate, { h: 5, ct: 62.6, bevel: 1 }), DARK);
    g.add(lax([[0, 0], [0, 12.4], [1.2, 12.8], [3, 12.4], [5, 9.6], [8.6, 8.4], [8.6, 0]], [C[0], 60.8, 0], 't', 24), BODY);
    const big = g.part('fx_eye', { pivot: [C[0], 79, 0], extras: { hover: 0.0012, period: 2.2, pv: { gem: 1.5, irid: 0.1, coreTint: L.eyeTint }, note: 'the large eye (focus)' } });
    big.add(sphere([C[0], 79, 0], 6.8, { seg: 12 }), 'crystal');
    g.add(lax([[0, 6.4], [0, 8.6], [0.8, 9.2], [2.4, 9.2], [2.4, 6.4], [0, 6.4]], [C[0], 69.4, 0], 't', 24), TRIM);
    const small = g.part('fx_eyes', { extras: { pv: { gem: 0.6, irid: 0.05, coreTint: L.eyeTint }, note: 'eight small eyes (0.4 brightness of the large one)' } });
    for (let k = 0; k < 8; k++) {
      const a = (110 + k * 20) * D2R, p = [C[0] + Math.cos(a) * 16.5, 67.2, Math.sin(a) * 16.5];
      small.add(sphere(p, 2.5, { seg: 8 }), 'crystal');
      g.add(lax([[0, 2.3], [0, 3.3], [0.5, 3.7], [1.3, 3.7], [1.3, 2.3], [0, 2.3]], [p[0], 64.9, p[2]], 't', 12), TRIM);
    }
    g.socket('pearl', [C[0], 79, 0]);
  }

  // ======================================================================== stock = tail (s 0-238)
  {
    let stock = PF([[18, -88, 6], [70, -78, 30], [196, -42, 40], [238, -26, 4], [238, 44, 4], [150, 41, 80], [42, 35, 10], [18, 33, 4]], { w: 46, bevel: 5, bevelSeg: 2 });
    stock = cut(stock, [cutters.slotW(40, 62, -60, 8, 80, 0)]);      // sling slot through the tail
    g.add(stock, BODY);
    g.add(PF([[18, 35, 2], [8, 36, 8], [0, 30, 6], [0, -84, 6], [8, -92, 8], [18, -90, 2]], { w: 50, bevel: 4, bevelSeg: 2 }), 'rubber');
    g.add(SC([[-23, -90, 2], [23, -90, 2], [23, 35.5, 2], [-23, 35.5, 2]], 17.4, 20.2, { bevel: 0.6 }), TRIM);
    // tail-feather plates: three overlapping cloisonné feathers per side pointing back, gold rims, rachis wires
    const feather = (s0, t0, len, wid, tilt) => {
      const pts = [], c = Math.cos(tilt * D2R), s = Math.sin(tilt * D2R);
      const at = (u, o) => [s0 - u * len * c + o * s, t0 - u * len * s + o * c, 0];
      for (let i = 0; i <= 9; i++) { const u = i / 9; pts.push(at(u, wid * Math.sin(Math.PI * Math.pow(u, 0.8)))); }
      for (let i = 8; i >= 1; i--) { const u = i / 9; pts.push(at(u, -wid * 0.7 * Math.sin(Math.PI * Math.pow(u, 0.8)))); }
      return pts;
    };
    for (const sd of [1, -1]) {
      [[224, 16, 150, 15, -4], [222, -4, 140, 14, 4], [218, -24, 118, 12, 14]].forEach(([s0, t0, len, wid, tilt], j) => {
        en.add(PF(feather(s0, t0, len, wid, tilt), { w: 1.6, cw: (23.4 + j * 0.5) * sd, bevel: 0.5, bevelSeg: 1 }), BODY);
        en.add(PF(feather(s0 + 1.6, t0, len + 3.4, wid + 1.8, tilt), { w: 1.6, cw: (23.0 + j * 0.5) * sd, bevel: 0.4, bevelSeg: 1 }), TRIM);
        const tip = [s0 - len * 0.92 * Math.cos(tilt * D2R), t0 - len * 0.92 * Math.sin(tilt * D2R)];
        en.add(strip([s0 - 4, t0 - 0.3], tip, (24.25 + j * 0.5) * sd, 0.9, 0.4, 0.2), TRIM);
      });
    }
  }

  // ======================================================================== lower receiver, magwell, trigger group, grip
  {
    let lower = PF([[252, -23.5, 1], [522, -23.5, 1], [522, -38, 3], [486, -47, 4], [404, -47, 2], [362, -45, 6], [258, -45, 6], [250, -36, 4]], { w: 50, bevel: 1.6, curveSeg: 3 });
    const well = PF([[404, -40, 1], [484, -40, 1], [486, -66, 3], [400, -66, 3]], { w: 42, bevel: 1.8, curveSeg: 3 });
    lower = union(lower, well);
    lower = cut(lower, [cutters.box([443, -50, 0], [48.5, 46, 30.4]), cutters.box([334, -46, 0], [20, 14, 8])]);
    g.add(lower, DARK);
    g.add(PF([[398, -63.5, 2], [488, -63.5, 2], [490, -67.5, 1], [396, -67.5, 1]], { w: 43.6, bevel: 0.6 }), TRIM);
    for (const sd of [1, -1]) {
      for (const [s, t] of [[276, -34], [334, -31], [508, -33]]) g.add(pinEnd([s, t, 25 * sd], 1.7, sd > 0 ? 'w' : '-w', 0.5), 'steel');
      g.add(capScrew([392, -40, 25.1 * sd], 2.1, sd > 0 ? 'w' : '-w', 0.9), 'steel_dark');
    }
    // roll marks (right) + the crane emblem (left)
    g.add(stamp(L.mark, [372, -27.4, 25.1], { px: 0.62, side: 1 }), DARK);
    g.add(stamp(L.sub, [372, -33.6, 25.1], { px: 0.5, side: 1 }), DARK);
    g.add(stamp(CRANE, [516, -27.6, -25.1], { px: 1.15, side: -1 }), TRIM);
    // trigger guard (one piece) and trigger
    g.add(PF([[300, -44, 1], [372, -44, 1], [374, -50, 2], [366, -64, 10], [318, -66, 6], [300, -56, 3], [306, -56, 2], [322, -60, 4], [360, -59, 6], [366, -50, 2], [306, -50, 1]],
      { w: 9, bevel: 1.2, curveSeg: 3 }), DARK);
    const trig = g.part('trigger', { pivot: [338, -40, 0], extras: { axis: 'x', pullDeg: -12 } });
    trig.add(PF([[333.5, -43, 2], [343, -43, 2], [343.5, -49, 0], [341.4, -53, 4], [342.6, -57, 1.2], [340.4, -58, 1], [336.6, -53, 4], [336, -49, 0]], { w: 6, bevel: 0.9 }), TRIM);
    // selector lever (left) + magazine latch button (right)
    g.add(PF([...arcPts(268, -32, 5, 150, 390, 8), [272, -26.5, 1.2], [276, -22.5, 1.6], [262, -22.5, 1.6], [264, -26.5, 1.2]], { w: 2.2, cw: -26.2, bevel: 0.6 }), TRIM);
    g.add(lax([[0, 0], [0, 4.2], [1.6, 4.2], [2.2, 3.6], [2.2, 0]], [494, -54, 21], 'w', 18), TRIM);
    // pistol grip: porcelain shell, rubber side panels, gold cap (20° rake)
    const GS = 292, GT = -6;
    const gp = (pts) => pts.map(([s, t, r]) => [s + GS, t + GT, r]);
    g.add(PF(gp([[38.5, -38.8, 1], [36, -50, 6], [29.5, -74, 24], [20, -101, 20], [10.6, -122.5, 3], [-31.7, -107.1, 3], [-26.3, -83.5, 26], [-11.9, -52.6, 8], [-14, -44, 4], [-19.5, -38.5, 3], [-4, -38.8, 1]]),
      { w: 30, bevel: 3.6, bevelSeg: 2, curveSeg: 4 }), BODY);
    g.add(PF(gp([[31, -50, 4], [24.5, -76, 16], [16, -100, 10], [6.5, -114, 4], [-23.5, -103.5, 4], [-21.5, -83, 14], [-9.5, -58, 4], [-6.5, -50, 3]]), { w: 30.8, bevel: 1, bevelSeg: 1, curveSeg: 4 }), 'rubber');
    g.add(PF(gp([[11, -121.2, 0.8], [8.4, -127.8, 3], [-33.9, -112.4, 3], [-32.3, -106.9, 0.8]]), { w: 28, bevel: 1.8 }), TRIM);
  }

  // ======================================================================== neck (barrel shroud, s 630-826) and head
  {
    const NT = 3;   // neck axis sits 3 mm above the bore
    // hollow shroud (the barrel runs inside), three vent slots per side show it
    let neck = lathe([[630, 15.8], [630, 31], [636, 32], [652, 30.5], [682, 24.5], [716, 22.6], [742, 24.6], [768, 29.4], [794, 31.2], [816, 30.2], [824, 26], [826, 15.8], [630, 15.8]], { t: NT, seg: 28 });
    const vents = [];
    for (const sd of [1, -1]) for (const [a, b] of [[664, 688], [698, 720], [730, 748]]) vents.push(PF([[a, NT - 6.5, 4.5], [b, NT - 6.5, 4.5], [b, NT + 2.5, 4.5], [a, NT + 2.5, 4.5]], { w: 16, cw: 24 * sd, bevel: 0, curveSeg: 3 }));
    neck = cut(neck, vents);
    g.add(neck, BODY);
    // gold neck bands (the crane's throat rings), a collar at the body and one where the beak seats
    g.add(band(690, 695, 22.6, 25.4, NT, 0.5, 28), TRIM);
    g.add(band(724, 729, 22.6, 25.4, NT, 0.5, 28), TRIM);
    g.add(band(638, 646, 29, 32.6, NT, 0.6, 28), TRIM);
    g.add(band(818, 823, 26.5, 29.8, NT, 0.5, 28), TRIM);
    // eyes (sky-blue gems for 畢方, dark for 鬼車) in gold bezels, brow ridges
    for (const sd of [1, -1]) {
      g.add(lax([[0, 0], [0, 4.4], [0.8, 4.8], [1.8, 4.6], [1.8, 0]], [792, 15, 27.6 * sd], sd > 0 ? 'w' : '-w', 18), TRIM);
      g.add(sphere([792, 15, 28.9 * sd], 3.0, { seg: 10 }), L.eye);
      g.add(strip([782, 21.6], [802, 19.4], 25.6 * sd, 1.6, 1.6, 0.4), TRIM);
    }
    // crest plume = front sight tower: a vermilion (aubergine) plume with tongues, gold edge, sight post + ears
    const plume = [[754, 26, 3], [812, 25, 4], [808, 46, 10], [800, 70, 6], [797.2, 86, 0], [794.8, 86, 0], [792, 74, 4], [782, 82, 4], [772, 96, 3], [770, 78, 8], [758, 84, 3], [756, 66, 10], [750, 40, 8]];
    g.add(PF(plume, { w: 6.4, bevel: 1.4, bevelSeg: 2 }), L.crest);
    g.add(PF([[754.5, 26.5, 3], [811.5, 25.5, 4], [807.5, 46, 10], [800.5, 69, 6], [799, 69, 4], [806, 46, 8], [809.5, 27.5, 2], [756, 28, 2]], { w: 6.9, bevel: 0.5 }), TRIM);
    g.add(box([796, 89, 0], [1.6, 6.4, 1.6], { r: 0.4 }), TRIM);
    for (const sd of [1, -1]) g.add(PF([[792, 84, 1], [800, 84, 1], [799, 93, 1.5], [795, 91.5, 1]], { w: 1.4, cw: 3.4 * sd, bevel: 0.4 }), TRIM);
  }

  // ======================================================================== barrel (bore Ø18.6, OD Ø24), ember crown
  g.add(lathe([[520, 9.3], [520, 12], [858, 12], [858.6, 11.4], [860, 10.6], [860, 9.3], [520, 9.3]], { seg: 28 }), 'steel_dark');
  g.add(band(859.6, 860.8, 6.8, 9.2, 0, 0.3, 20), 'glow_vermilion');     // the furnace throat behind the beak

  // ======================================================================== beak: fixed upper mandible, hinged lower one (fx_beak)
  {
    const hook = L.hooked;
    // upper mandible: culmen 34 -> 13, tomium 13 -> 9 at the tip (a gape the bore fires through); 鬼車: tip hooked down
    const upper = hook
      ? [[808, 13, 0], [808, 34, 6], [880, 26, 30], [932, 18, 20], [956, 9, 6], [960, -4, 2], [954, -2, 2], [948, 6, 6], [920, 10.5, 30], [840, 12.6, 20]]
      : [[808, 13, 0], [808, 34, 6], [880, 26.5, 40], [962, 13, 1], [962, 9.4, 1], [900, 11.2, 40], [840, 12.6, 20]];
    const taper = PL([[804, -16, 0], [966, -5.4, 0], [966, 5.4, 0], [804, 16, 0]], { h: 120, ct: 0, bevel: 0 });
    const taperL = PL([[804, -15, 0], [966, -5.4, 0], [966, 5.4, 0], [804, 15, 0]], { h: 120, ct: 0, bevel: 0 });
    let up = intersect(PF(upper, { w: 32, bevel: 1.6, bevelSeg: 2 }), taper);
    up = cut(up, [cutters.holeS(0, 0, 12.2, 780, 862)]);
    g.add(up, BODY);
    // gold edges (喙緣): wires along the tomium following the taper, and the culmen ridge
    const halfW = (s) => 16 - 10.6 * (s - 804) / 162;
    const tom = hook ? [[842, 12.6], [880, 11.6], [920, 10.3], [946, 6.4]] : [[842, 12.6], [880, 11.8], [920, 10.6], [958, 9.6]];
    for (const sd of [1, -1]) g.add(sweep(tom.map(([s, t]) => [s, t + 0.2, (halfW(s) - 0.9) * sd]), 0.75, { seg: 20, radial: 5 }), TRIM);
    const ridge = hook ? [[820, 33.2], [880, 26.6], [930, 18.6], [952, 10]] : [[820, 33.2], [880, 27], [940, 17.6], [960, 13.4]];
    g.add(sweep(ridge.map(([s, t]) => [s, t + 0.6, 0]), 1.2, { seg: 24, radial: 6 }), TRIM);
    for (const sd of [1, -1]) g.add(strip([826, 24], [846, 21.5], (halfW(836) - 0.2) * sd, 1.0, 1.0, 0.3), DARK);   // nostril slits
    // lower mandible: hinged at s 820 / t -6, opens 12° (≈4° per shot)
    const beak = g.part('fx_beak', { pivot: [820, -6, 0], extras: { open: -12, hinge: 'w', note: 'lower mandible: open 1 = 12° down; a shot kicks it to ~0.33 (4°)' } });
    const lower = hook
      ? [[812, -13, 0], [840, -12.6, 20], [920, -10.2, 26], [944, -8.4, 2], [944, -12, 2], [900, -19, 26], [812, -34, 6]]
      : [[812, -13, 0], [840, -12.6, 20], [900, -11.3, 40], [954, -9.4, 1], [954, -13, 1], [880, -24, 40], [812, -34, 6]];
    let lo = intersect(PF(lower, { w: 30, bevel: 1.5, bevelSeg: 2 }), taperL);
    lo = cut(lo, [cutters.holeS(0, 0, 12.2, 780, 862)]);
    beak.add(lo, BODY);
    const halfL = (s) => 15 - 9.6 * (s - 804) / 162;
    const ltom = hook ? [[842, -12.6], [880, -11.6], [920, -10.4], [942, -9]] : [[842, -12.6], [880, -11.8], [920, -10.8], [950, -9.9]];
    for (const sd of [1, -1]) beak.add(sweep(ltom.map(([s, t]) => [s, t - 0.2, (halfL(s) - 0.9) * sd]), 0.75, { seg: 20, radial: 5 }), TRIM);
    for (const sd of [1, -1]) beak.add(lax([[0, 0], [0, 4.4], [1, 4.4], [1.6, 3.6], [1.6, 0]], [820, -6, 15.6 * sd], sd > 0 ? 'w' : '-w', 18), TRIM);
  }

  // ======================================================================== single-leg foregrip (畢方一足)
  {
    const LS = 664;
    g.add(PF([[640, -18, 4], [690, -18, 4], [684, -34, 6], [648, -34, 6]], { w: 30, bevel: 2.2 }), BODY);         // hip block under the neck
    g.add(lax([[0, 0], [0, 13], [1, 14], [5, 14], [6, 13], [6, 0]], [LS, -40, 0], 't', 20), TRIM);
    // thigh (porcelain) -> knee band (bronze) -> shin (rubber wrap with ribs) -> ankle (gold); '-t' lathes run down
    g.add(lax([[0, 0], [0, 11.4], [2, 11.4], [8, 10.8], [32, 11.4], [40, 12.6], [40, 0]], [LS, -40, 0], '-t', 20), BODY);
    g.add(lax([[0, 0], [0, 12.6], [1.2, 14], [8.8, 14], [10, 12.6], [10, 0]], [LS, -80, 0], '-t', 20), 'bronze_aged');
    g.add(lax([[0, 0], [0, 11.6], [1.5, 12.4], [43, 12.4], [44.5, 11.6], [44.5, 0]], [LS, -90, 0], '-t', 20), 'rubber');
    g.add(merge(Array.from({ length: 6 }, (_, k) => lax([[0, 12.1], [0, 12.9], [1.2, 12.9], [1.2, 12.1]], [LS, -96 - k * 6.6, 0], '-t', 16))), 'rubber');
    g.add(lax([[0, 0], [0, 11], [1, 12], [6, 12], [8, 10], [8, 0]], [LS, -134.5, 0], '-t', 16), TRIM);
    // three-toed claw: two front toes (40 mm, spread ±24°), one back toe (25 mm); talons
    const AT = -146;
    const toe = (ang, len) => {
      const a = ang * D2R, ca = Math.cos(a), sa = Math.sin(a);
      // built along +s, then turned about t (a positive three-y turn swings +s towards -w, hence -ang)
      const body = merge([box([len * 0.5, 0, 0], [len, 9, 10], { r: 3, seg: 1 }), box([len * 0.5 - 6, 4.2, 0], [len * 0.42, 2.4, 7], { r: 0.8, seg: 1 })]);
      xform(body, { rot: [0, -ang, 0], move: [LS, AT, 0] });
      const tip = xform(lax([[0, 0], [0, 4.6], [4, 3.8], [8, 1.8], [10, 0]], [0, 0, 0], 's', 10), { rot: [-14, 0, 0] });
      xform(tip, { rot: [0, -ang, 0], move: [LS + ca * (len - 2), AT - 1.6, sa * (len - 2)] });
      return { body, tip };
    };
    for (const [ang, len] of [[24, 40], [-24, 40], [180, 25]]) { const t = toe(ang, len); g.add(t.body, L.claw); g.add(t.tip, L.toe); }
    g.add(sphere([LS, AT, 0], 9.5, { seg: 12, scale: [1, 0.75, 1] }), L.claw);
    g.socket('grip_l', [LS, -114, 0]);
  }

  // ======================================================================== feather energy magazine + side gate
  {
    const MS = 443, MT = -42;
    const mag = g.part('mag', { pivot: [MS, MT, 0], extras: { drop: true, pv: { ...L.mag }, note: 'feather energy cell: glass shell over a pv_core interior (obsidian key)' } });
    // feather silhouette: straight in the well, then curving forward and narrowing to a rounded tip (≈150 mm)
    const sc = (u) => MS + 26 * u * u, tt = (u) => MT + 2 - u * 146, hwm = (u) => 23 * (1 - 0.55 * u * u * u);
    const outline = (k, u0 = 0) => {
      const pts = [];
      for (let i = 0; i <= 14; i++) { const u = u0 + (1 - u0) * i / 14; pts.push([sc(u) + hwm(u) * k, tt(u), i === 14 ? 6 : 0]); }
      pts.push([sc(1) + 2, tt(1) - 7 * k, 4]);
      for (let i = 14; i >= 0; i--) { const u = u0 + (1 - u0) * i / 14; pts.push([sc(u) - hwm(u) * k, tt(u), i === 14 ? 6 : 0]); }
      return pts;
    };
    mag.add(PF(outline(1), { w: 28, bevel: 3, bevelSeg: 2 }), 'glass_clear');
    mag.add(PF(outline(0.74, 0.12), { w: 19, bevel: 3, bevelSeg: 2 }), 'obsidian');
    // gold rachis spine along the front edge (a ball at the tip)
    const spine = [];
    for (let i = 0; i <= 12; i++) { const u = 0.04 + 0.96 * i / 12; spine.push([sc(u) + hwm(u) + 0.6, tt(u), 0]); }
    mag.add(sweep(spine, 2.2, { seg: 24, radial: 6 }), TRIM);
    mag.add(sphere([sc(1) + 4, tt(1) - 5, 0], 3.2, { seg: 12 }), TRIM);
    // feed collar (dark) + gold band + 4 screws, contact rail on top (all inside the well)
    mag.add(SC([[-15, MT - 2, 2], [15, MT - 2, 2], [15, MT + 6, 2], [-15, MT + 6, 2]], MS - 24, MS + 24, { bevel: 1 }), DARK);
    mag.add(SC([[-14.6, MT - 10, 2], [14.6, MT - 10, 2], [14.6, MT - 2, 1], [-14.6, MT - 2, 1]], MS - 25, MS + 25, { bevel: 0.8 }), TRIM);
    for (const sd of [1, -1]) for (const s of [MS - 18, MS + 18]) mag.add(capScrew([s, MT - 6, 14.9 * sd], 1.4, sd > 0 ? 'w' : '-w', 0.6, 10), DARK);
    mag.add(SC([[-6, MT + 6, 1], [6, MT + 6, 1], [5, MT + 14, 1], [-5, MT + 14, 1]], MS - 16, MS + 16, { bevel: 0.5 }), 'steel_bright');
    // side gate on the left of the well: hinged on its bottom edge, swings down / out to free the cell
    const gate = g.part('fx_cover', { pivot: [MS, -66, -21.6], extras: { open: -100, hinge: 's', note: 'magazine gate (left): open 1 = swung 100° down / out' } });
    gate.add(PF([[MS - 36, -66, 2], [MS + 36, -66, 2], [MS + 36, -42, 4], [MS - 36, -42, 4]], { w: 2.2, cw: -22.4, bevel: 0.6,
      holes: [[[MS - 22, -62, 3], [MS + 22, -62, 3], [MS + 22, -48, 3], [MS - 22, -48, 3]]] }), DARK);
    gate.add(PF([[MS - 22.6, -62.6, 3], [MS + 22.6, -62.6, 3], [MS + 22.6, -47.4, 3], [MS - 22.6, -47.4, 3]], { w: 0.8, cw: -22.2, bevel: 0.2 }), 'glass_clear');
    gate.add(box([MS + 33, -54, -24.2], [5, 10, 3.4], { r: 1.2 }), TRIM);
    gate.add(cyl(MS - 37, MS + 37, 1.8, { t: -66, w: -21.6, seg: 10 }), TRIM);
    g.socket('magwell', [MS, -96, 0]);
  }

  // ======================================================================== sockets & meta
  g.socket('muzzle', [866, 0, 0]);
  g.socket('crest', [1022, 0, 0]);                 // 冠羽扇 fan centre, 60 mm past the beak tip
  g.socket('beak', [958, 2, 0]);
  g.socket('grip_r', [293, -86, 0], { rot: [0, 0, -20] });
  g.socket('sight_rear', [266, SIGHT, 0]);
  g.socket('sight_front', [796, SIGHT, 0]);
  for (const sd of [1, -1]) {
    const k = sd > 0 ? 'r' : 'l';
    g.socket('vein0_' + k, [346, 0.2, 33.2 * sd]);
    g.socket('vein1_' + k, [602, 27.1, 33.2 * sd]);
  }
  g.socket('back', [300, 40, 0]);                  // ready motes / cocoon centre
  g.meta({
    grip: 'heavy', support: 'vertical', reload: 'mag', variant: L.id,
    notes: 'Crane-form scatter cannon. fx_wingRootL/R: wing bones on ball joints, extras open/hinge (compound axis, open 1 = spread); '
      + 'cards spawn at runtime at S_wingL/R (open pose; extras.rest = folded pose). fx_beak: lower jaw (open -12 about w). '
      + 'fx_cover: magazine gate (left). fx_pearl (畢方) or fx_eye + fx_eyes (鬼車): the focus. Part `enamel` carries the cloisonné shard params.',
  });
  return g;
}

export default function build() { return buildPyrewing('bifang'); }
