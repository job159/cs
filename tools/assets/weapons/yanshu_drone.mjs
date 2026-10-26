// 隼翼僚機 Falcon wingman drone of 焰樞．破限 (docs/PREMIUM_WEAPONS.md M04 card: 機身 90 mm, 隼翼翼展 220 mm 後掠 30°, 中央鏡頭眼
// fx_eye Ø14, 尾部 2 個推進器, 白陶加安全橘翼尖). Built like the gun: a ceramic-armour fuselage over a gunmetal belly pan with
// panel strips and rivets, a bezelled lens eye with a glowing iris (fx_eye, cyan; the weapon tints it gold when 破限 is
// ready), a twin micro-barrel gun pod under the nose, falcon wings (fx_wingL / fx_wingR, hinged at the root for the
// hover flap and the docking fold): a swept main plate, five layered primary feathers along the trailing edge and
// safety-orange tips; a fanned tail and two thruster nozzles with glowing liners. Drone-local mm: s = nose, t = up, w = right.
// Budget (card: 2k a drone; four on screen in 破限): low ring / lathe / fillet counts, a 0.2 mm QEM pass, ~7k.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer';
import { Gun, lathe, tube, plan, profile, section, sweep, merge, xform, cut } from '../lib/gunkit.mjs';
import { along, domeAt, loft, D2R } from '../lib/sculpt.mjs';
import { bakeMeshes } from '../lib/bake.mjs';

await MeshoptSimplifier.ready;

const ARMOR = 'ceramic_armor', SAFE = 'paint_safety', DARK = 'steel_dark', BRIGHT = 'steel_bright', STEEL = 'steel', GLASS = 'glass_clear', EYE = 'glow_cyan', THRUST = 'glow_teal', LENS = 'lens';

/** superellipse ring at s with half sizes (w, t), centre t c, n points */
function ring(s, hw, ht, c = 0, n = 16, p = 2.6) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    out.push([s, c + Math.sign(sa) * Math.pow(Math.abs(sa), 2 / p) * ht, Math.sign(ca) * Math.pow(Math.abs(ca), 2 / p) * hw]);
  }
  return out;
}

export default function build() {
  const g = new Gun('yanshu_drone');
  // ---------------------------------------------------------------- fuselage: ceramic upper shell, gunmetal belly
  const S = [[-45, 5, 4, 1], [-36, 10, 7.5, 1], [-22, 14.5, 10.5, 1.5], [-4, 16.5, 12, 1.5], [14, 15, 11, 1], [30, 12, 9.5, 0.5], [40, 9.5, 8.4, 0], [45, 8, 8, 0]];
  g.add(loft(S.map(([s, w, t, c]) => ring(s, w, t, c, 16)), { crease: 50 }), ARMOR);
  g.add(loft(S.slice(1, 6).map(([s, w, t, c]) => ring(s, w * 0.92, t * 0.55, c - t * 0.52, 12, 2.2)), { crease: 50 }), DARK);
  // spine ridge, panel strips, rivets, two antenna stubs
  g.add(section([[-1.4, 0], [1.4, 0], [0.8, 1.6], [-0.8, 1.6]].map(([w, t]) => [w, t + 12.6]), -30, 22, { bevel: 0.3 }), DARK);
  for (const sg of [1, -1]) {
    g.add(sweep([[-30, 6.5, sg * 12.6], [-10, 8, sg * 15.8], [12, 7.5, sg * 14.4], [30, 5.5, sg * 11]], 0.45, { seg: 14, radial: 4 }), DARK);
    for (const s of [-24, -8, 8, 24]) { const k = 1 - Math.abs(s) / 60; g.add(domeAt([s, 2, sg * 16.4 * k], [0, 0.2, sg], 0.7, 0.49, 6), BRIGHT); }
    g.add(along([[0, 0.7], [7, 0.4], [7.4, 0]], [-26, 9.5, sg * 5], [-0.6, 1, sg * 0.2], 6), DARK);
  }
  // ---------------------------------------------------------------- the eye (fx_eye): bezel, lens, glowing iris
  const eye = g.part('fx_eye', { pivot: [45, 0, 0] });
  g.add(along([[-2, 0], [-2, 9.2], [0.6, 9.2], [1.6, 8.4], [1.6, 7], [0, 7], [0, 0]], [45, 0, 0], [1, 0, 0], 18, 40), BRIGHT);
  eye.add(along([[-1.2, 6.8], [0.4, 6.8], [0.4, 0]], [45, 0, 0], [1, 0, 0], 16), EYE);
  eye.add(along([[0, 3.2], [0.6, 3.2], [0.6, 0]], [45.4, 0, 0], [1, 0, 0], 12), LENS);
  eye.add(along([[0, 7], [1.2, 6.2], [2, 0]], [45.2, 0, 0], [1, 0, 0], 16), GLASS);
  // ---------------------------------------------------------------- gun pod: twin micro barrels under the nose
  g.add(loft([ring(4, 5, 3.4, -10.5, 10), ring(30, 5.2, 3.6, -10.5, 10), ring(36, 4.6, 3, -10.5, 10)], { crease: 50 }), DARK);
  for (const sg of [1, -1]) g.add(tube(30, 47, 1.6, 0.9, { t: -10.5, w: sg * 2.4, seg: 8 }), STEEL);
  // ---------------------------------------------------------------- wings (fx_wingL / fx_wingR): swept plate, primaries, orange tip
  for (const [nm, sg] of [['fx_wingL', -1], ['fx_wingR', 1]]) {
    const w = g.part(nm, { pivot: [2, 4, sg * 13], extras: { open: sg * 55, hinge: 's' } });
    const sw = Math.tan(30 * D2R), P = (s, ww) => [s, sg * ww];
    const LE = (ww) => 13 - (ww - 13) * sw, chord = (ww) => 34 - (ww - 13) * 0.16;
    const mainPts = [P(LE(13), 13), P(LE(86), 86), P(LE(86) - chord(86) * 0.7, 86), P(-24, 13)];
    const tipPts = [P(LE(86) + 0.4, 86.6), P(LE(110) + 2, 108), P(LE(110) - 6, 111), P(LE(86) - chord(86) * 0.62, 86.6)];
    const dih = (geo) => xform(geo, { rot: [0, 0, sg * 6], pivot: [0, 4, sg * 13] });
    w.add(dih(plan(mainPts.map(([s, ww], i) => [s, ww, i === 1 ? 4 : 2]), { h: 2.6, ct: 4, bevel: 0.8, curveSeg: 3 })), ARMOR);
    w.add(dih(plan(tipPts.map(([s, ww]) => [s, ww, 2]), { h: 2.2, ct: 4, bevel: 0.7, curveSeg: 3 })), SAFE);
    // a cambered leading edge (a rounded ceramic nose over the plate's front edge), a panel line across the plate at
    // mid span, a root fairing
    w.add(dih(sweep([[LE(14), 4.3, sg * 14], [LE(50), 4.5, sg * 50], [LE(85), 4.3, sg * 85]], 1.75, { seg: 10, radial: 6 })), ARMOR);
    w.add(dih(sweep([[LE(14) + 0.9, 4.1, sg * 14], [LE(50) + 0.9, 4.3, sg * 50], [LE(85) + 0.9, 4.1, sg * 85]], 0.7, { seg: 10, radial: 4 })), STEEL);
    w.add(dih(plan([P(LE(50) - 2.4, 49.6), P(LE(50) - 2.4, 50.4), P(LE(50) - chord(50) * 0.66, 50.4), P(LE(50) - chord(50) * 0.66, 49.6)], { h: 0.3, ct: 5.36, bevel: 0.1 })), DARK);
    w.add(dih(plan([P(14, 11), P(14, 18), P(-20, 18), P(-24, 11)].map(([s, ww]) => [s, ww, 3]), { h: 4.4, ct: 4.2, bevel: 1.2, curveSeg: 3 })), DARK);
    // five tapered primaries layered under the trailing edge, fanning out towards the tip: a pointed vane with a raised
    // rachis ridge down its middle, each one a little lower than the one inboard of it
    for (let k = 0; k < 5; k++) {
      const ww = 30 + k * 15, base = LE(ww) - chord(ww) * 0.72, len = 24 + k * 4.5, ang = (8 + k * 6) * D2R, ct = 2.5 - k * 0.24;
      const dir = [-Math.cos(ang), Math.sin(ang)], acr = [dir[1], -dir[0]], W0 = 6.6;
      const F = (u, v, r = 0) => [base + dir[0] * u + acr[0] * v, ww + dir[1] * u + acr[1] * v, r];
      // a long vane, its trailing (outer) edge straight, the tip rounded off like a primary feather
      const pts = [F(0, -W0), F(len * 0.62, -W0 * 0.96, 3), F(len, -W0 * 0.25, 4), F(len * 0.96, W0 * 0.55, 3), F(len * 0.45, W0, 2), F(0, W0)];
      w.add(dih(plan(pts.map(([s, x, r]) => [s, sg * x, r]), { h: 1.2, ct, bevel: 0.45, curveSeg: 2 })), k === 4 ? SAFE : ARMOR);
      const r0 = F(1.5, 0), r1 = F(len * 0.86, 0.3);
      w.add(dih(sweep([[r0[0], ct + 0.62, sg * r0[1]], [(r0[0] + r1[0]) / 2, ct + 0.66, sg * (r0[1] + r1[1]) / 2], [r1[0], ct + 0.6, sg * r1[1]]], 0.36, { seg: 5, radial: 4 })), k === 4 ? STEEL : DARK);
    }
  }
  // ---------------------------------------------------------------- tail: fan plate, two thrusters with glowing liners
  g.add(plan([[-36, -5, 2], [-36, 5, 2], [-58, 13, 3], [-62, 4, 4], [-62, -4, 4], [-58, -13, 3]], { h: 2, ct: 5, bevel: 0.6, curveSeg: 3 }), ARMOR);
  for (const sg of [1, -1]) {
    g.add(lathe([[-38, 0], [-38, 5.4], [-41, 6], [-50, 5.2], [-51, 4.2], [-44, 3.6], [-44, 0]], { t: -1, w: sg * 7, seg: 12 }), DARK);
    g.add(tube(-50.2, -44, 3.8, 2.6, { t: -1, w: sg * 7, seg: 12 }), THRUST);
  }
  g.socket('muzzle', [47, -10.5, 0]);
  g.socket('eye', [46.5, 0, 0]);
  g.socket('thrustL', [-51, -1, -7]);
  g.socket('thrustR', [-51, -1, 7]);
  g.meta({ grip: 'none', series: 'qiming', notes: 'M04 falcon drone. fx_eye: lens + iris (glow_cyan; tint per instance). fx_wingL / fx_wingR: hinge along s (open 55 = folded up for docking). Sockets muzzle, eye, thrustL / R.' });
  // a QEM pass (0.15 mm: the lofts and lathes are dense for a 90 mm body) before the standard bake
  const build0 = g.build.bind(g);
  g.build = (o = {}) => {
    const root = build0({ ...o, bake: false });
    root.traverse((m) => { if (m.isMesh && !/^(glow_|glass)/.test(m.userData.mat) && m.geometry.attributes.position.count > 300) m.geometry = decimate(m.geometry, 0.2); });
    if (o.bake !== false) {
      const meshes = [];
      root.traverse((m) => { if (m.isMesh) meshes.push(m); });
      bakeMeshes(meshes, { tessellate: 0.016, aoDist: 0.012, rays: 24, log: false });
    }
    return root;
  };
  return g;
}
function decimate(geo, err) {
  for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
  const w = mergeVertices(geo.index ? geo.toNonIndexed() : geo, 1e-7);
  const P = w.attributes.position.array, N = w.attributes.normal.array, Pmm = new Float32Array(P.length);
  for (let i = 0; i < P.length; i++) Pmm[i] = P[i] * 1000;
  const [I] = MeshoptSimplifier.simplifyWithAttributes(Uint32Array.from(w.index.array), Pmm, 3, N, 3, [0.3, 0.3, 0.3], null, 0, err, ['ErrorAbsolute']);
  const pos = new Float32Array(I.length * 3), nrm = new Float32Array(I.length * 3);
  for (let k = 0; k < I.length; k++) for (let c = 0; c < 3; c++) { pos[k * 3 + c] = P[I[k] * 3 + c]; nrm[k * 3 + c] = N[I[k] * 3 + c]; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return out;
}
