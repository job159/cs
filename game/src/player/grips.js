// How hands sit on weapon sockets. Each grip gives, in GUN space (forward -Z, up +Y, right +X):
//   F   finger direction (wrist -> knuckles), N   palm normal (the way the palm faces)
//   pose  finger pose name (ik.js HAND_POSES), palm  [contact offset along N, palm centre distance from wrist]
// The wrist is placed so the palm centre sits `palm[0]` behind the socket along N and `palm[1]` behind
// it along F.  Values were tuned by eye on screenshots; per-weapon overrides live in weapon defs.
import * as THREE from 'three';
import { HAND_POSES } from './ik.js';

const n = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const D = Math.PI / 180;

/** Right hand on a pistol grip with rake angle (radians, grip bottom further back). */
export function rightGrip(rake = 18 * D) {
  // knuckle line follows the grip axis; fingers wrap around the front of the grip toward the left
  const F = n(-0.35, Math.sin(rake) * 0.9, -Math.cos(rake));
  const N = n(-1, 0, 0.18);
  return { F, N, pose: 'grip', palm: [0.024, 0.05] };
}

/** Mirror image of a grip across the gun's X axis (dual wielding: the left hand holds its own pistol grip). */
export function mirrorGrip(g) {
  return { F: new THREE.Vector3(-g.F.x, g.F.y, g.F.z), N: new THREE.Vector3(-g.N.x, g.N.y, g.N.z), pose: g.pose, palm: g.palm };
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

// Free anchors in CAMERA space, written for the RIGHT hand (the left hand mirrors X). They follow the gun's
// sway / bob but not the gun itself: gesture hands and things held without a gun (PREMIUM_WEAPONS §4.2 row 0.3).
//   pos = palm centre [x, y, z] (m), F / N as above, pose = finger pose set when the hand switches to it.
export const FREE_GRIPS = {
  // open palm held up in front (a drone / spirit boat landing on the hand, a summon presented)
  palm: { pos: [0.085, -0.12, -0.34], F: n(-0.4, 0.25, -1), N: n(-0.2, 1, 0.3), pose: 'palm', palm: [0.012, 0.045] },
  // a hand grenade held ready to throw (throwables; also a premium "held orb")
  grenade: { pos: [0.12, -0.13, -0.33], F: n(-0.3, 0.6, -0.75), N: n(-0.85, 0.3, 0.2), pose: 'grenade', palm: [0.03, 0.045] },
  // arm out, index finger pointing down the crosshair (hand-gesture orders, Blackwater-style summons)
  point: { pos: [0.16, -0.14, -0.5], F: n(-0.18, 0.14, -1), N: n(-0.3, -0.95, 0), pose: 'point', palm: [0.02, 0.05] },
};

/** A clip's inline free anchor { pos: [x,y,z], F: [x,y,z], N: [x,y,z], pose, palm } (right-hand terms). */
function inlineGrip(o) {
  if (!o._grip) {
    const v = (a, d) => (Array.isArray(a) ? n(a[0], a[1], a[2]) : a?.isVector3 ? a.clone().normalize() : d);
    o._grip = { pos: o.pos || [0.08, -0.12, -0.32], F: v(o.F, n(0, 0, -1)), N: v(o.N, n(0, 1, 0)), pose: o.pose || 'relaxed', palm: o.palm || [0.02, 0.05] };
  }
  return o._grip;
}

/**
 * Free anchor transform for a side ('R' | 'L'): { pos: Vector3, F, N, grip } in camera space, or null. `name` is a
 * FREE_GRIPS key or an inline anchor object (clips: ['anchorL', [{ pos, F, N, pose }, blend]]).
 */
export function freeGrip(name, side, out = { pos: new THREE.Vector3(), F: new THREE.Vector3(), N: new THREE.Vector3(), grip: null }) {
  const g = name && typeof name === 'object' ? inlineGrip(name) : FREE_GRIPS[name];
  if (!g) return null;
  const m = side === 'L' ? -1 : 1;
  out.pos.set(g.pos[0] * m, g.pos[1], g.pos[2]);
  out.F.set(g.F.x * m, g.F.y, g.F.z);
  out.N.set(g.N.x * m, g.N.y, g.N.z);
  out.grip = g;
  return out;
}

// extra finger poses for the free grips (ik.js owns the table; these only add names)
Object.assign(HAND_POSES, {
  // flat hand, fingers together and slightly cupped, thumb out to the side
  palm: { index: [6, 8, 4], middle: [6, 8, 4], ring: [8, 10, 5], pinky: [10, 10, 6], spread: [7, 2, -3, -9], thumb: [5, 25, 10, 5, 5] },
  // one-handed pistol grip (dual wielding): the thumb tucks along the frame instead of waiting for a support hand
  gripOne: { index: [42, 58, 22], middle: [78, 92, 50], ring: [80, 94, 52], pinky: [80, 92, 50], spread: [-4, 0, 2, 5], thumb: [30, -10, 40, 20, 10] },
  // fingers wrapped around a ~6 cm ball, thumb over the spoon
  grenade: { index: [48, 42, 22], middle: [52, 46, 24], ring: [55, 50, 26], pinky: [58, 50, 26], spread: [5, 0, -3, -7], thumb: [35, 45, 45, 20, 12] },
});
