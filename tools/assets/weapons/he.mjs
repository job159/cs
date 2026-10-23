// 破片手雷 HE frag grenade (quick-throw, weapons/throwables.js): M67-pattern steel sphere in olive drab with the
// yellow HE band, the fuse assembly on top, the safety lever (spoon) down the front and the pull ring at the back.
// Used three ways: the grenade the left hand pulls and throws in first person (parts `pin` / `spoon` come off),
// the projectile in flight, and the kill-feed / HUD icon (ui/icons.js renders weapons/he.glb from the side:
// ring left, spoon right, fuse up).
// Side view, mm: s forward (spoon side), t up from the bottom of the body, w right. Grenade axis = t.
import { Gun, lathe, cyl, box, ring, profile, merge, xform } from '../lib/gunkit.mjs';

const R0 = 31.75;                       // body radius (63.5 mm sphere)
// body outline (height t, radius) from the bottom pole to the fuse neck
const BODY = [[0, 0], [1.2, 7.5], [3.5, 14], [8, 21], [15, 27], [23, 30.6], [31.5, R0], [40, 31.1], [47.5, 28.8], [54, 24.6], [59, 19.2], [62, 14.6], [63.6, 11.2], [63.6, 0]];
/** body radius at height t (piecewise linear over BODY) */
function rb(t) {
  for (let i = 1; i < BODY.length; i++) {
    const [t0, r0] = BODY[i - 1], [t1, r1] = BODY[i];
    if (t <= t1 && t1 > t0) return r0 + (r1 - r0) * (t - t0) / (t1 - t0);
  }
  return 0;
}
/** lathe along t (the grenade axis) */
const latheT = (pts, seg = 40) => xform(lathe(pts, { seg }), { rot: [90, 0, 0] });

/** A curved strip in the s-t plane: centre line `pts` [[s, t], ...], thickness `th` (mm), width along w `wd`. */
function strip(pts, th, wd, bevel = 0.35) {
  const out = [], inn = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let ns = b[1] - a[1], nt = -(b[0] - a[0]);
    const l = Math.hypot(ns, nt) || 1;
    ns /= l; nt /= l;
    out.push([pts[i][0] + ns * th / 2, pts[i][1] + nt * th / 2]);
    inn.push([pts[i][0] - ns * th / 2, pts[i][1] - nt * th / 2]);
  }
  return profile([...out, ...inn.reverse()], { w: wd, bevel, bevelSeg: 1, curveSeg: 2 });
}

export default function build() {
  const g = new Gun('he');

  // ======================================================================================== BODY
  g.add(latheT(BODY, 48), 'paint_od');
  // weld seam around the equator, the yellow HE band under the shoulder
  g.add(xform(ring(0, R0 + 0.15, 0.55, { axis: 't', seg: 64 }), { move: [0, 31.5, 0] }), 'paint_od');
  const band = [];
  for (let t = 51; t <= 57.01; t += 1.5) band.push([t, rb(t) + 0.4]);
  g.add(latheT([[51, 0], ...band, [57, 0]], 48), 'paint_yellow');

  // ======================================================================================== FUSE
  g.add(xform(cyl(0, 6, 12.2, { seg: 32, b: 0.8 }), { rot: [90, 0, 0], move: [0, 60.5, 0] }), 'steel_dark');      // threaded collar
  g.add(xform(cyl(0, 15, 9.8, { seg: 32, b: 0.6 }), { rot: [90, 0, 0], move: [0, 66, 0] }), 'steel_dark');       // fuse body
  g.add(xform(cyl(0, 3.2, 8.4, { seg: 32, b: 1.0 }), { rot: [90, 0, 0], move: [0, 80.6, 0] }), 'steel');         // striker cap
  // lever ears either side of the fuse (the spoon hinges between them) and the pin bosses
  for (const w of [-8.6, 8.6]) g.add(box([6.5, 75.5, w], [9, 9, 2.2], { r: 0.8 }), 'steel');

  // ======================================================================================== SPOON (safety lever)
  // pivot at the hinge on top of the fuse: the throw flips it off about w
  const spoon = g.part('spoon', { pivot: [8, 84, 0] });
  const spoonPath = [[-4, 84.6], [4, 84.8], [9.5, 83.6], [12.2, 79.5], [12.6, 70], [13.2, 64], [16.5, 60.6]];
  for (let t = 58; t >= 27; t -= 3) spoonPath.push([rb(t) + 1.1, t]);
  spoon.add(strip(spoonPath, 1.3, 13), 'steel');
  spoon.add(box([12.4, 74, 0], [1.6, 7, 14.5], { r: 0.4 }), 'steel');      // stiffening rib where it bends

  // ======================================================================================== PIN + PULL RING
  // pivot at the pin's exit on the back of the fuse: the left hand's thumb hooks the ring and pulls it out along -s
  const pin = g.part('pin', { pivot: [-10, 74, 0] });
  pin.add(xform(cyl(-12, 13, 1.15, { seg: 12, b: 0.3 }), { move: [0, 74, 0] }), 'steel');
  pin.add(xform(ring(-23.5, 11, 1.45, { axis: 'w', seg: 40 }), { move: [0, 74, 0] }), 'steel');
  pin.add(xform(ring(-12.4, 2.4, 0.9, { axis: 'w', seg: 16 }), { move: [0, 74, 0] }), 'steel');   // split loop

  // ======================================================================================== SOCKETS
  g.socket('center', [0, 31.5, 0]);      // the hand cradles the body around here
  g.socket('top', [0, 84, 0]);
  g.socket('ring', [-23.5, 74, 0]);
  g.meta({ grip: 'grenade', support: 'none', reload: 'none', throwable: 'frag', notes: 'HE frag grenade. Parts: pin (pull ring, comes off along -s), spoon (flies off about its hinge).' });
  return g;
}
