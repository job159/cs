// 燃燒彈 incendiary (quick-throw molotov, weapons/throwables.js): a clear glass bottle two-thirds full of amber fuel,
// a black tape band, a fuel-soaked rag stuffed in the neck and hanging down the front. The left hand holds it by
// the neck; the rag tip (socket `wick`) is lit in first person before the throw.
// Also the projectile in flight and the kill-feed / HUD icon (ui/icons.js renders weapons/fire.glb from the side).
// Side view, mm: s forward (the side the rag hangs on), t up from the bottom, w right. Bottle axis = t.
import { Gun, lathe, sphere, sweep, xform } from '../lib/gunkit.mjs';

/** lathe along t (the bottle axis) */
const latheT = (pts, seg = 40) => xform(lathe(pts, { seg }), { rot: [90, 0, 0] });
const GLASS = [[0, 0], [0, 27], [1.5, 30.5], [5, 32], [112, 32], [122, 30.2], [134, 23.5], [146, 15.5], [153, 12.6], [180, 12], [181, 13.6], [188, 13.6], [190, 11.6], [190, 0]];

export default function build() {
  const g = new Gun('fire');

  // ======================================================================================== BOTTLE + FUEL
  g.add(latheT(GLASS, 40), 'glass_clear');
  g.add(latheT([[3.5, 0], [3.5, 29.4], [4.5, 30.2], [86, 30.2], [86, 0]], 36), 'glaze_ochre');   // fuel, two-thirds full
  // punt (the dimple in the base) reads through the glass as a darker ring
  g.add(latheT([[0.4, 0], [0.4, 18], [1.6, 22], [2.2, 22], [2.2, 0]], 32), 'glaze_ochre');
  // tape band holding the rag's tail against the bottle
  g.add(latheT([[96, 0], [96, 32.5], [97, 32.7], [113, 32.7], [114, 32.5], [114, 0]], 40), 'fabric_black');

  // ======================================================================================== RAG
  const rag = g.part('rag', { pivot: [0, 186, 0] });
  rag.add(latheT([[176, 0], [176, 10.6], [184, 11.2], [192, 10.4], [197, 8.8], [199, 0]], 20), 'paper_oil');      // plug in the neck
  rag.add(sphere([1.5, 202, 0], 9.5, { scale: [1.1, 0.8, 1], seg: 14 }), 'paper_oil');                              // bunched wick
  rag.add(sphere([-4, 199, 4], 6.5, { scale: [1, 0.8, 1.1], seg: 12 }), 'paper_oil');
  // tail: over the lip, down the shoulder, tucked under the tape
  rag.add(sweep([[6, 201, 1], [13, 196, 2], [15.5, 186, 0], [16, 172, -1.5], [20.5, 156, 0.5], [27, 140, -0.5], [32.5, 124, 0.8], [34, 108, 0]], 4.2, { seg: 40, radial: 9 }), 'paper_oil');
  rag.add(sweep([[4, 199, -3], [10, 193, -6], [13, 182, -8], [14.5, 170, -9]], 2.6, { seg: 20, radial: 8 }), 'paper_oil');   // a loose second strip

  // ======================================================================================== SOCKETS
  g.socket('center', [0, 150, 0]);      // the hand holds it by the neck / shoulder
  g.socket('wick', [2, 206, 0]);
  g.socket('top', [0, 206, 0]);
  g.meta({ grip: 'grenade', support: 'none', reload: 'none', throwable: 'fire', notes: 'Molotov. Part rag (lit at socket wick in first person).' });
  return g;
}
