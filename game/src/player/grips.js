// How hands sit on weapon sockets. Each grip gives, in GUN space (forward -Z, up +Y, right +X):
//   F   finger direction (wrist -> knuckles), N   palm normal (the way the palm faces)
//   pose  finger pose name (ik.js HAND_POSES), palm  [contact offset along N, palm centre distance from wrist]
// The wrist is placed so the palm centre sits `palm[0]` behind the socket along N and `palm[1]` behind
// it along F.  Values were tuned by eye on screenshots; per-weapon overrides live in weapon defs.
import * as THREE from 'three';

const n = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const D = Math.PI / 180;

/** Right hand on a pistol grip with rake angle (radians, grip bottom further back). */
export function rightGrip(rake = 18 * D) {
  // knuckle line follows the grip axis; fingers wrap around the front of the grip toward the left
  const F = n(-0.35, Math.sin(rake) * 0.9, -Math.cos(rake));
  const N = n(-1, 0, 0.18);
  return { F, N, pose: 'grip', palm: [0.024, 0.05] };
}

export const LEFT_GRIPS = {
  // palm up under the handguard, fingers wrapping up the right side
  handguard: { F: n(0.72, 0.28, -0.62), N: n(0.18, 1, 0.05), pose: 'cradle', palm: [0.03, 0.045] },
  // vertical / angled foregrip: knuckles along the grip, palm on its left side
  vertical: { F: n(0.45, 0.05, -0.9), N: n(1, 0.1, 0), pose: 'wrap', palm: [0.022, 0.05] },
  angled: { F: n(0.55, 0.35, -0.75), N: n(0.8, 0.5, 0), pose: 'wrap', palm: [0.022, 0.05] },
  pump: { F: n(0.7, 0.25, -0.65), N: n(0.2, 1, 0), pose: 'wrap', palm: [0.032, 0.045] },
  // supporting a pistol: cup under/around the right hand
  pistol_cup: { F: n(0.55, 0.45, -0.7), N: n(0.55, 0.75, 0.1), pose: 'wrap', palm: [0.03, 0.05] },
  // carry handle / top handle (minigun, MG42 carried)
  top_handle: { F: n(0.75, 0, -0.65), N: n(0, -1, 0), pose: 'wrap', palm: [0.02, 0.05] },
  none: { F: n(0.3, -0.2, -0.9), N: n(0.2, 1, 0), pose: 'relaxed', palm: [0.03, 0.05] },
  // reload anchors
  magwell: { F: n(0.85, 0.1, -0.5), N: n(0.85, 0, 0.3), pose: 'magGrab', palm: [0.02, 0.05] },
  mag: { F: n(0.85, 0.15, -0.5), N: n(0.9, 0, 0.25), pose: 'magGrab', palm: [0.02, 0.05] },
  charge: { F: n(0.6, 0.2, -0.75), N: n(0.3, 0.2, 0.9), pose: 'pinch', palm: [0.015, 0.06] },
  chargeLeft: { F: n(-0.2, 0.3, -0.9), N: n(1, 0, 0.3), pose: 'pinch', palm: [0.015, 0.06] },
  shell: { F: n(0.7, 0.4, -0.6), N: n(0.6, 0.8, 0), pose: 'pinch', palm: [0.02, 0.06] },
  // right hand working a bolt handle (bolt-action rifles)
  boltR: { F: n(-0.5, 0.3, -0.8), N: n(-0.6, -0.2, 0.3), pose: 'pinch', palm: [0.018, 0.06] },
};
