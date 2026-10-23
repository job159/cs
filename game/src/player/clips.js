// Action clips for the viewmodel, generated from the weapon's reload style and sockets.
// Times are normalised (0..1) and scaled to the gameplay duration by the caller (or `clip.duration` s).
// Track names: gunPos [m], gunRot [deg], <part> (0..1 travel/angle; fx_* parts: their extras `open` amount),
//   <part>.pos [m], <part>.rot [deg], <part>.vis (0/1), <part>.scale (number or [x,y,z])
// Viewmodel events: anchorL/anchorR [anchor, blend s] (sockets, 'rest', 'pouch', free grips 'palm' | 'grenade' |
//   'point'), poseL/poseR pose.
// Weapon events (Arsenal._clipEvent): 'snd' name, 'magDrop', 'ammo', 'ammo1', 'shellOut', 'hit', and the premium
//   set fx / trail / hitstop / shake / fov / tint / overlay / haptic / glow / vmHide / summon / hud (see arsenal.js);
//   anything else goes to the weapon special's onClipEvent(ws, name, arg, game).
// Premium weapons reference clips by id (def.premium.firstDraw / inspect / rareInspect / rareReload /
// ready.layer.idleExtra): registerClip(id, (vm, opts) => clip | clipObject), clipFor(id, vm, opts).

const Z3 = [0, 0, 0];

const LIB = new Map();
/** Registers a clip by id: a factory (vm, opts) => clip, or a static clip object. */
export function registerClip(id, make) { LIB.set(id, make); return make; }
export function hasClip(id) { return LIB.has(id); }
/** A playable clip from an id, a factory or a clip object (null if the id is unknown). */
export function clipFor(id, vm, opts = {}) {
  const src = typeof id === 'string' ? LIB.get(id) : id;
  if (!src) return null;
  return typeof src === 'function' ? src(vm, opts) : src;
}

export function drawClip(heavy = false) {
  return {
    tracks: {
      gunPos: [[0, [0.02, -0.16, 0.06]], [0.75, [0, 0.004, 0], 'out3'], [1, Z3, 'inOut']],
      gunRot: [[0, [-38, 12, 28]], [0.75, [2, -1, -2], 'out3'], [1, Z3, 'inOut']],
    },
    events: [[0.05, 'snd', heavy ? 'drawHeavy' : 'draw']],
  };
}

export function holsterClip() {
  return { tracks: { gunPos: [[0, Z3], [1, [0.02, -0.18, 0.06], 'in']], gunRot: [[0, Z3], [1, [-40, 10, 25], 'in']] }, events: [] };
}

/** Inspect (2.6 s). Holding inspect loops 0.18..0.48 (a slow tilt that starts and ends on the same pose). */
export function inspectClip() {
  return {
    duration: 2.6, loop: [0.18, 0.48],
    tracks: {
      gunPos: [[0, Z3], [0.18, [-0.03, 0.02, 0.03]], [0.33, [-0.05, 0.03, 0.02]], [0.48, [-0.03, 0.02, 0.03]], [0.56, [-0.04, 0.025, 0.02]], [0.82, [0.0, 0.0, 0.02]], [1, Z3]],
      gunRot: [[0, Z3], [0.18, [8, 30, -28]], [0.33, [11, 40, -38]], [0.48, [8, 30, -28]], [0.62, [-4, -18, 34]], [0.84, [-2, -12, 26]], [1, Z3]],
    },
    events: [[0.12, 'snd', 'cloth'], [0.55, 'snd', 'cloth'], [0.7, 'anchorL', ['grip_l', 0.2]]],
  };
}

/**
 * Generic premium first draw (spec §1.7.1 beat 1, ~1.5 s, once per match, fire cancels): the gun enters from
 * above-right with half a roll, presents its side to the light, the signature part moves once, a burst of theme
 * motes, a 0.2 s freeze on the settle pose, then the theme sting. opts: { duration, part (fx_* part to open and
 * close), motes: fx event arg, sting: sound, glow: false to skip the energy wake-up }.
 */
export function firstDrawClip(vm, { duration = 1.5, part = null, motes = null, sting = 'draw', glow = true } = {}) {
  const tracks = {
    gunPos: [[0, [0.1, 0.12, 0.06]], [0.2, [0.006, 0.006, 0.0], 'out3'], [0.42, [-0.035, 0.03, 0.02], 'inOut'], [0.62, [-0.04, 0.032, 0.022]],
      [0.76, [0.0, 0.002, 0.0], 'out3'], [0.88, [0.0, 0.002, 0.0]], [1, Z3]],
    gunRot: [[0, [26, -30, 150]], [0.2, [3, 4, -10], 'out3'], [0.42, [9, 34, -30], 'inOut'], [0.62, [10, 37, -33]],
      [0.76, [1, -1, 1], 'out3'], [0.88, [1, -1, 1]], [1, Z3]],
  };
  if (part) tracks[part] = [[0, 0], [0.4, 0], [0.5, 1, 'outBack'], [0.66, 1], [0.76, 0, 'in3'], [1, 0]];
  const events = [
    [0, 'anchorL', ['rest', 0.05]], [0.02, 'snd', 'draw'], [0.2, 'haptic', 'tick'], [0.44, 'snd', 'cloth'],
    [0.72, 'anchorL', ['grip_l', 0.14]], [0.76, 'poseL', vm?.supportGrip?.pose || 'cradle'], [0.76, 'haptic', 'tick'], [0.88, 'snd', sting],
  ];
  if (motes) events.push([0.5, 'fx', motes]);
  if (glow) events.push([0, 'glow', { to: 0.15, sec: 0 }], [0.45, 'glow', { to: 1.8, sec: 0.2 }], [0.78, 'glow', { to: 1, sec: 0.5 }]);
  return { duration, tracks, events };
}

/** Box-magazine reload (rifles, SMGs, MGs with box mags). style: mag | mag_curved | drum */
export function magReload(vm, { empty = false, style = 'mag' } = {}) {
  const w = vm.weapon;
  const curved = style === 'mag_curved', drum = style === 'drum';
  const hasCharge = !!w.socket('charge') && !!w.parts.bolt;
  const end = empty && hasCharge ? 0.76 : 0.86;
  const out = curved ? [0, -0.06, -0.02] : drum ? [0.01, -0.07, 0.01] : [0, -0.07, 0];
  const away = [-0.05, -0.34, 0.06];
  const tracks = {
    gunPos: [[0, Z3], [0.12, [-0.025, -0.012, 0.015]], [0.32, [-0.03, -0.018, 0.02]], [0.62, [-0.028, -0.014, 0.02]],
      [0.7, [-0.03, -0.004, 0.018], 'out3'], [0.74, [-0.028, -0.012, 0.02]], [end + 0.04, [-0.01, 0, 0.01]], [1, Z3]],
    gunRot: [[0, Z3], [0.12, [7, 10, 24]], [0.34, [9, 12, 28]], [0.62, [6, 10, 26]], [0.7, [9, 10, 24], 'out3'], [0.74, [6, 9, 23]],
      [end + 0.04, [2, 2, 6]], [1, Z3]],
    'mag.pos': [[0, Z3], [0.22, Z3], [0.3, out, 'out3'], [0.42, away, 'in'], [0.5, away], [0.64, out, 'out3'], [0.7, Z3, 'outBack'], [1, Z3]],
    'mag.rot': [[0, Z3], [0.22, Z3], [0.3, curved ? [18, 0, 0] : [4, 0, 6]], [0.42, [10, 25, 40]], [0.5, [10, -15, 20]], [0.64, curved ? [16, 0, 0] : [3, 0, 4]], [0.7, Z3], [1, Z3]],
  };
  const events = [
    [0.06, 'anchorL', ['magwell', 0.16]], [0.08, 'poseL', 'magGrab'], [0.2, 'snd', 'magRelease'], [0.24, 'snd', 'magOut'],
    [0.25, 'anchorL', ['mag', 0.06]], [0.42, 'magDrop'], [0.48, 'snd', 'pouch'], [0.66, 'snd', 'magIn'], [0.7, 'ammo'],
  ];
  if (empty && hasCharge) {
    tracks.bolt = [[0, 0], [0.8, 0], [0.84, 1, 'out3'], [0.88, 1], [0.9, 0, 'in3'], [1, 0]];
    events.push([0.72, 'anchorL', ['charge', 0.1]], [0.74, 'poseL', 'pinch'], [0.82, 'snd', 'boltBack'], [0.9, 'snd', 'boltForward'],
      [0.92, 'anchorL', ['grip_l', 0.14]], [0.93, 'poseL', vm.supportGrip.pose]);
  } else {
    events.push([0.74, 'anchorL', ['grip_l', 0.16]], [0.76, 'poseL', vm.supportGrip.pose]);
  }
  return { tracks, events };
}

/** Pistol: mag drops out of the grip, new one inserted from below, slide release if empty. */
export function pistolReload(vm, { empty = false } = {}) {
  const tracks = {
    gunPos: [[0, Z3], [0.14, [-0.02, 0.025, 0.02]], [0.6, [-0.02, 0.02, 0.02]], [0.68, [-0.02, 0.03, 0.02], 'out3'], [0.74, [-0.02, 0.022, 0.02]], [1, Z3]],
    gunRot: [[0, Z3], [0.14, [16, 14, 10]], [0.6, [18, 15, 12]], [0.68, [20, 15, 12], 'out3'], [0.74, [17, 14, 11]], [1, Z3]],
    'mag.pos': [[0, Z3], [0.16, Z3], [0.28, [0, -0.18, 0.02], 'in'], [0.36, [0, -0.36, 0.04]], [0.46, [-0.03, -0.3, 0.05]], [0.62, [0, -0.04, 0.005], 'out3'], [0.68, Z3, 'outBack'], [1, Z3]],
    'mag.rot': [[0, Z3], [0.28, [0, 0, 8]], [0.46, [15, 20, 25]], [0.62, [2, 0, 3]], [0.68, Z3], [1, Z3]],
  };
  const events = [
    [0.1, 'anchorL', ['pouch', 0.2]], [0.16, 'snd', 'magOut'], [0.3, 'magDrop'], [0.38, 'anchorL', ['mag', 0.12]], [0.4, 'poseL', 'magGrab'],
    [0.64, 'snd', 'magIn'], [0.68, 'ammo'],
  ];
  if (empty) {
    tracks.slide = [[0, 1], [0.8, 1], [0.84, 0, 'in3'], [1, 0]];
    events.push([0.72, 'anchorL', ['grip_l', 0.12]], [0.8, 'snd', 'slideRelease']);
  } else events.push([0.72, 'anchorL', ['grip_l', 0.16]]);
  events.push([0.74, 'poseL', vm.supportGrip.pose]);
  return { tracks, events };
}

/** Tube-fed shotgun: start (tilt, hand to port), one shell, end (back, pump if empty). */
export function shellStart() {
  return {
    tracks: { gunPos: [[0, Z3], [1, [-0.015, 0.01, 0.01]]], gunRot: [[0, Z3], [1, [6, 6, -24]]] },
    events: [[0.1, 'anchorL', ['shell', 0.2]], [0.2, 'poseL', 'pinch']],
  };
}
export function shellInsert() {
  return {
    tracks: {
      gunPos: [[0, [-0.015, 0.01, 0.01]], [0.6, [-0.015, 0.01, 0.01]], [0.72, [-0.012, 0.016, 0.006], 'out3'], [1, [-0.015, 0.01, 0.01]]],
      gunRot: [[0, [6, 6, -24]], [0.6, [6, 6, -24]], [0.72, [8, 6, -23], 'out3'], [1, [6, 6, -24]]],
      'shell.pos': [[0, [0, -0.12, 0.02]], [0.3, [0, -0.12, 0.02]], [0.55, [0, -0.01, 0], 'out3'], [0.72, [0, 0.005, -0.04]], [1, [0, 0.005, -0.04]]],
      'shell.vis': [[0, 0], [0.3, 1], [0.74, 1], [0.76, 0], [1, 0]],
    },
    events: [[0.0, 'anchorL', ['pouch', 0.15]], [0.3, 'anchorL', ['shell', 0.18]], [0.68, 'snd', 'shellIn'], [0.72, 'ammo1']],
  };
}
export function shellEnd(vm, { pump = false } = {}) {
  const tracks = { gunPos: [[0, [-0.015, 0.01, 0.01]], [1, Z3]], gunRot: [[0, [6, 6, -24]], [1, Z3]] };
  const events = [[0.0, 'anchorL', ['grip_l', 0.2]], [0.1, 'poseL', vm.supportGrip.pose]];
  if (pump) {
    tracks.pump = [[0, 0], [0.45, 0], [0.62, 1, 'out3'], [0.82, 0, 'in3'], [1, 0]];
    events.push([0.5, 'snd', 'pumpBack'], [0.78, 'snd', 'pumpForward'], [0.6, 'shellOut']);
  }
  return { tracks, events };
}

/** Pump action after each shot. */
export function pumpCycle() {
  return {
    tracks: {
      pump: [[0, 0], [0.12, 0], [0.45, 1, 'out3'], [0.8, 0, 'in3'], [1, 0]],
      gunPos: [[0, Z3], [0.45, [0.004, -0.008, 0.012]], [0.8, [0, 0.002, -0.004]], [1, Z3]],
      gunRot: [[0, Z3], [0.45, [-2, 1, 3]], [0.8, [1, 0, -1]], [1, Z3]],
    },
    events: [[0.2, 'snd', 'pumpBack'], [0.42, 'shellOut'], [0.72, 'snd', 'pumpForward']],
  };
}

/** Bolt-action cycle: right hand leaves the grip, lifts and pulls the bolt. */
export function boltCycle() {
  return {
    tracks: {
      bolt: [[0, 0], [0.18, 0], [0.32, 0.35], [0.5, 1, 'out3'], [0.66, 0.35, 'in3'], [0.76, 0], [1, 0]],
      gunPos: [[0, Z3], [0.2, [-0.01, 0.0, 0.01]], [0.5, [-0.012, -0.005, 0.02]], [0.76, [-0.01, 0, 0.01]], [1, Z3]],
      gunRot: [[0, Z3], [0.2, [2, 4, 12]], [0.5, [3, 6, 16]], [0.76, [2, 4, 10]], [1, Z3]],
    },
    events: [[0.05, 'anchorR', ['charge', 0.13]], [0.1, 'poseR', 'pinch'], [0.3, 'snd', 'boltUp'], [0.45, 'snd', 'boltBack'], [0.5, 'shellOut'],
      [0.66, 'snd', 'boltForward'], [0.76, 'snd', 'boltDown'], [0.82, 'anchorR', ['grip_r', 0.12]], [0.86, 'poseR', 'grip']],
  };
}

/** Break-action (double barrel): open, eject, two shells, close. */
export function breakReload(vm) {
  return {
    tracks: {
      breech: [[0, 0], [0.12, 0], [0.22, 1, 'outBack'], [0.78, 1], [0.86, 0, 'in3'], [1, 0]],
      gunPos: [[0, Z3], [0.15, [-0.02, -0.02, 0.02]], [0.8, [-0.02, -0.02, 0.02]], [0.88, [-0.01, 0.01, 0.01], 'out3'], [1, Z3]],
      gunRot: [[0, Z3], [0.15, [-10, 10, 18]], [0.8, [-8, 10, 16]], [0.88, [4, 4, 6], 'out3'], [1, Z3]],
      'shell.pos': [[0, [0, -0.1, 0.03]], [0.4, [0, -0.1, 0.03]], [0.62, [0, 0, 0], 'out3'], [1, Z3]],
      'shell.vis': [[0, 0], [0.4, 1], [1, 1]],
    },
    events: [[0.05, 'snd', 'breakOpen'], [0.24, 'shellOut', 2], [0.26, 'anchorL', ['pouch', 0.14]], [0.42, 'anchorL', ['shell', 0.18]], [0.62, 'snd', 'shellIn'],
      [0.72, 'ammo'], [0.76, 'anchorL', ['grip_l', 0.1]], [0.84, 'snd', 'breakClose']],
  };
}

/** Belt-fed MG: cover open, swap box/belt, close, charge. */
export function beltReload(vm) {
  const tracks = {
    cover: [[0, 0], [0.12, 0], [0.22, 1, 'outBack'], [0.66, 1], [0.74, 0, 'in3'], [1, 0]],
    gunPos: [[0, Z3], [0.12, [-0.03, -0.01, 0.02]], [0.7, [-0.03, -0.01, 0.02]], [0.76, [-0.03, 0.0, 0.02], 'out3'], [1, Z3]],
    gunRot: [[0, Z3], [0.12, [6, 12, 20]], [0.7, [8, 12, 22]], [0.76, [10, 12, 20], 'out3'], [1, Z3]],
    'mag.pos': [[0, Z3], [0.28, Z3], [0.36, [0, -0.06, 0]], [0.44, [-0.06, -0.34, 0.05]], [0.5, [-0.06, -0.34, 0.05]], [0.6, [0, -0.04, 0]], [0.64, Z3], [1, Z3]],
    'belt.vis': [[0, 1], [0.3, 1], [0.32, 0], [0.6, 0], [0.62, 1], [1, 1]],
    bolt: [[0, 0], [0.82, 0], [0.86, 1, 'out3'], [0.9, 0, 'in3'], [1, 0]],
  };
  const events = [[0.06, 'anchorL', ['magwell', 0.14]], [0.12, 'snd', 'coverOpen'], [0.28, 'snd', 'magOut'], [0.3, 'anchorL', ['mag', 0.08]],
    [0.44, 'magDrop'], [0.6, 'snd', 'magIn'], [0.66, 'snd', 'beltIn'], [0.7, 'anchorL', ['magwell', 0.08]], [0.74, 'snd', 'coverClose'], [0.76, 'ammo'],
    [0.78, 'anchorL', ['charge', 0.08]], [0.84, 'snd', 'boltBack'], [0.9, 'snd', 'boltForward'], [0.93, 'anchorL', ['grip_l', 0.12]]];
  return { tracks, events };
}

/** Revolver: crane out, eject, speed-loader in, close. */
export function cylinderReload(vm) {
  return {
    tracks: {
      crane: [[0, 0], [0.14, 0], [0.22, 1, 'outBack'], [0.78, 1], [0.86, 0, 'in3'], [1, 0]],
      gunPos: [[0, Z3], [0.14, [-0.03, 0.03, 0.02]], [0.8, [-0.03, 0.03, 0.02]], [0.88, [-0.01, 0.01, 0.01]], [1, Z3]],
      gunRot: [[0, Z3], [0.14, [28, 20, 30]], [0.3, [40, 10, 10]], [0.42, [28, 20, 30]], [0.8, [26, 18, 28]], [0.88, [6, 4, 8]], [1, Z3]],
    },
    events: [[0.08, 'anchorL', ['pistol_cup', 0.1]], [0.16, 'snd', 'craneOpen'], [0.32, 'shellOut', 6], [0.34, 'snd', 'shellsDrop'], [0.4, 'anchorL', ['pouch', 0.12]],
      [0.55, 'anchorL', ['magwell', 0.15]], [0.68, 'snd', 'speedloader'], [0.72, 'ammo'], [0.76, 'anchorL', ['grip_l', 0.1]], [0.84, 'snd', 'craneClose']],
  };
}

/** Rocket launcher: load a new rocket into the muzzle. */
export function rocketReload() {
  return {
    tracks: {
      gunPos: [[0, Z3], [0.15, [-0.04, -0.06, 0.04]], [0.75, [-0.04, -0.06, 0.04]], [1, Z3]],
      gunRot: [[0, Z3], [0.15, [18, 18, 10]], [0.75, [18, 18, 10]], [1, Z3]],
      'rocket.pos': [[0, [0, -0.25, -0.1]], [0.3, [0, -0.25, -0.1]], [0.6, [0, 0, -0.08], 'out3'], [0.7, Z3], [1, Z3]],
      'rocket.vis': [[0, 0], [0.3, 1], [1, 1]],
    },
    events: [[0.05, 'anchorL', ['pouch', 0.15]], [0.3, 'anchorL', ['muzzle', 0.2]], [0.68, 'snd', 'rocketIn'], [0.7, 'ammo'], [0.8, 'anchorL', ['grip_l', 0.15]]],
  };
}

/**
 * Quick-throw beats (normalised over THROW.dur s), shared by throwClip and weapons/throwables.js, which shows the
 * grenade in the hand at `show`, pulls the pin / lights the rag at `pin`, lets go at `release`.
 */
export const THROW = { dur: 0.76, show: 0.13, pin: 0.29, cock: 0.34, release: 0.54 };

// left-hand anchors of the throw, written for the RIGHT hand (freeGrip mirrors x for the left): pos = palm centre in
// camera space, F = fingers, N = palm normal
const T_HOLD = { pos: [0.025, -0.092, -0.3], F: [-0.3, 0.72, -0.62], N: [-0.88, 0.22, 0.28], pose: 'grenade', palm: [0.03, 0.045] };    // presented to the gun hand
const T_PIN = { pos: [0.085, -0.118, -0.31], F: [-0.15, 0.7, -0.7], N: [-0.9, 0.1, 0.35], pose: 'grenade', palm: [0.03, 0.045] };       // jerked off the pin
const T_COCK = { pos: [0.27, 0.025, -0.13], F: [0.15, 0.75, 0.6], N: [-0.2, 0.45, -0.85], pose: 'grenade', palm: [0.03, 0.045] };     // wound up by the ear (off-screen)
const T_REL = { pos: [0.06, -0.01, -0.5], F: [-0.08, 0.5, -0.86], N: [0.08, -0.86, -0.5], pose: 'palm', palm: [0.02, 0.045] };          // arm out, fingers open
const T_FOLLOW = { pos: [-0.03, -0.25, -0.4], F: [-0.45, -0.4, -0.8], N: [-0.35, -0.8, 0.45], pose: 'relaxed', palm: [0.02, 0.05] };  // swung down across

/**
 * Quick-throw (G, weapons/throwables.js; ~0.4 s to the release): the gun ducks down and to the right (it stays in the
 * right hand), the LEFT hand takes the grenade off the vest, presents it to the gun hand that hooks the pin out (a
 * molotov's rag is lit instead), cocks back by the head and throws overhand with a follow-through, then returns to
 * the gun. full: a weapon the left hand holds itself (dual pistols, bows) drops right out of view instead of ducking.
 */
export function throwClip(vm, { full = false } = {}) {
  const r = THROW.release;
  const lo = full ? [0.06, -0.28, 0.08] : [0.03, -0.075, 0.04];
  const loR = full ? [-42, 14, 30] : [-16, 8, 13];
  const kick = (a, k) => a.map((v, i) => v + k[i]);
  const tracks = {
    gunPos: [[0, Z3], [0.15, lo, 'out3'], [r - 0.03, kick(lo, [0.004, -0.008, 0.004])], [r + 0.06, kick(lo, [0.012, -0.03, 0.02]), 'out3'],
      [0.74, lo], [1, Z3, 'inOut']],
    gunRot: [[0, Z3], [0.15, loR, 'out3'], [r - 0.03, kick(loR, [-2, 1, 2])], [r + 0.06, kick(loR, [-7, 4, 8]), 'out3'], [0.74, loR], [1, Z3, 'inOut']],
  };
  const events = [
    [0, 'anchorL', ['pouch', 0.09]], [0.02, 'poseL', 'magGrab'],
    [0.12, 'anchorL', [T_HOLD, 0.1]],
    [THROW.pin - 0.02, 'anchorL', [T_PIN, 0.04]],
    [THROW.cock, 'anchorL', [T_COCK, 0.1]],
    [r - 0.04, 'anchorL', [T_REL, 0.06]],
    [r + 0.05, 'anchorL', [T_FOLLOW, 0.09]],
    [0.76, 'anchorL', [vm?.defaultLeft?.() || 'rest', 0.15]], [0.82, 'poseL', vm?.supportGrip?.pose || 'cradle'],
  ];
  return { duration: THROW.dur, tracks, events };
}

/** Knife attacks. */
export function knifeSlash(dir = 1) {
  return {
    tracks: {
      gunPos: [[0, Z3], [0.18, [0.06 * dir, 0.04, 0.03], 'out'], [0.48, [-0.09 * dir, -0.06, -0.08], 'in3'], [1, Z3]],
      gunRot: [[0, Z3], [0.18, [10, 30 * dir, 40 * dir], 'out'], [0.48, [-15, -50 * dir, -30 * dir], 'in3'], [1, Z3]],
    },
    events: [[0.22, 'snd', 'swing'], [0.4, 'hit']],
  };
}
export function knifeStab() {
  return {
    tracks: {
      gunPos: [[0, Z3], [0.3, [0.02, 0.03, 0.1], 'out'], [0.45, [-0.02, 0.0, -0.22], 'in3'], [0.62, [-0.02, 0.0, -0.2]], [1, Z3]],
      gunRot: [[0, Z3], [0.3, [25, 10, -20], 'out'], [0.45, [-5, -5, 0], 'in3'], [1, Z3]],
    },
    events: [[0.32, 'snd', 'swingHeavy'], [0.46, 'hit']],
  };
}

/**
 * Dual pistols (§1.8.1): both guns tip inward, drop their magazines and take new ones together, slides drop if
 * empty. Each hand keeps its gun (per-gun part tracks L_gun / R_gun); ~1.3x a single pistol reload.
 */
export function dualReload(vm, { empty = false } = {}) {
  const tracks = {
    gunPos: [[0, Z3], [0.15, [0, 0.025, 0.01]], [0.7, [0, 0.025, 0.01]], [0.78, [0, 0.035, 0.01], 'out3'], [1, Z3]],
    gunRot: [[0, Z3], [0.15, [16, 0, 0]], [0.7, [18, 0, 0]], [0.78, [21, 0, 0], 'out3'], [1, Z3]],
  };
  for (const S of ['L', 'R']) {
    const k = S === 'L' ? 1 : -1;   // roll the grips inward so the magwells face the middle
    tracks[S + '_gun.rot'] = [[0, Z3], [0.15, [0, 6 * k, 28 * k]], [0.7, [0, 6 * k, 30 * k]], [0.86, Z3], [1, Z3]];
    tracks[S + '_mag.pos'] = [[0, Z3], [0.18, Z3], [0.3, [0, -0.18, 0.02], 'in'], [0.36, [0, -0.36, 0.04]], [0.5, [0, -0.3, 0.03]], [0.64, [0, -0.03, 0.005], 'out3'], [0.7, Z3, 'outBack'], [1, Z3]];
    tracks[S + '_mag.vis'] = [[0, 1], [0.35, 1], [0.36, 0, 'snap'], [0.46, 0], [0.47, 1, 'snap'], [1, 1]];
    if (empty) tracks[S + '_slide'] = [[0, 1], [0.8, 1], [0.84, 0, 'in3'], [1, 0]];
  }
  const events = [[0.16, 'snd', 'magOut'], [0.3, 'magDrop'], [0.62, 'snd', 'magIn'], [0.66, 'snd', 'magIn'], [0.7, 'ammo']];
  if (empty) events.push([0.82, 'snd', 'slideRelease']);
  return { tracks, events };
}

/** Dual inspect (§1.8.1): turn both wrists out to show each side, tap the guns together, back. Hold loops the look. */
export function dualInspectClip() {
  const out = (k) => [[0, Z3], [0.2, [10, -32 * k, -58 * k]], [0.32, [12, -36 * k, -64 * k]], [0.45, [10, -32 * k, -58 * k]], [0.58, [0, 24 * k, 0]], [0.62, [0, 21 * k, 0], 'out3'], [0.84, Z3], [1, Z3]];
  return {
    duration: 3.0, loop: [0.2, 0.45],
    tracks: { gunPos: [[0, Z3], [0.2, [0, 0.02, 0.02]], [0.8, [0, 0.02, 0.02]], [1, Z3]], 'R_gun.rot': out(1), 'L_gun.rot': out(-1) },
    events: [[0.1, 'snd', 'cloth'], [0.5, 'snd', 'cloth'], [0.585, 'snd', 'shell_brass'], [0.585, 'haptic', 'tick']],
  };
}

export function reloadClipFor(vm, style, empty) {
  if (vm?.weapon?.dual) return dualReload(vm, { empty });
  switch (style) {
    case 'mag_pistol': return pistolReload(vm, { empty });
    case 'shell_break': return breakReload(vm);
    case 'belt': return beltReload(vm);
    case 'cylinder': return cylinderReload(vm);
    case 'none': return rocketReload(vm);
    case 'mag': case 'mag_curved': case 'drum': default: return magReload(vm, { empty, style });
  }
}

// ------------------------------------------------------------------ examples and test clips (premium spec §4.2 rows 0.3/0.4)

/**
 * 05d §8.5 Meinong parasol blade, open-to-block, copied verbatim: canopy shown and scaled up, 12 ribs open
 * in sequence. 0.37 s. Needs parts `canopy`, `rib1`..`rib12` (missing parts are simply skipped).
 */
export function parasolOpen() {
  const tracks = {
    gunPos: [[0, [0, 0, 0]], [0.35, [-0.07, 0.05, 0.03], 'outBack'], [1, [-0.07, 0.05, 0.03]]],
    gunRot: [[0, [0, 0, 0]], [0.35, [6, 32, -18], 'outBack'], [1, [6, 32, -18]]],
    'canopy.vis': [[0, 0], [0.04, 1, 'snap'], [1, 1]],
    'canopy.scale': [[0, [0.2, 0.2, 1]], [0.8, [1, 1, 1], 'outBack'], [1, [1, 1, 1]]],
  };
  for (let i = 1; i <= 12; i++) {            // 12 ribs open one after another, ~4 ms apart
    const t0 = 0.05 + i * 0.012;
    tracks[`rib${i}.rot`] = [[0, [0, 0, 0]], [t0, [0, 0, 0]], [Math.min(t0 + 0.3, 0.95), [72, 0, 0], 'outBack'], [1, [72, 0, 0]]];
  }
  return {
    duration: 0.37,
    tracks,
    events: [
      [0.02, 'snd', 'parasol_open'],
      [0.30, 'haptic', 'tick'],
      [0.32, 'fx', { id: 'MOTE', kind: 'paper_petal', socket: 'canopyRim', n: 6 }],
      [0.33, 'parryWindow', 0.25],            // perfect-block window (s), timed by the weapon logic
    ],
  };
}
registerClip('parasol_open', parasolOpen);

// One clip per clip event, played in the test range: __cf.game.arsenal.playClip('test_fx') etc.
const tilt = (x = 6, y = 24, z = -18) => ({
  gunPos: [[0, Z3], [0.15, [-0.03, 0.02, 0.02]], [0.85, [-0.03, 0.02, 0.02]], [1, Z3]],
  gunRot: [[0, Z3], [0.15, [x, y, z]], [0.85, [x, y, z]], [1, Z3]],
});
const TESTS = {
  test_fx: { duration: 1.6, tracks: tilt(), events: [
    [0.08, 'fx', { id: 'RING', socket: 'muzzle', r1: 0.12, life: 0.35, color: '#6fe3ff' }],
    [0.25, 'fx', { id: 'SPRAY', socket: 'muzzle', n: 16, color: '#ffcf6a', speed: 1.2 }],
    [0.42, 'fx', { id: 'MOTE', socket: 'muzzle', kind: 'goldpaper', n: 14 }],
    [0.5, 'fx', { id: 'TRAIL_DROP', socket: 'muzzle', to: 'aim', range: 14, kind: 'feather' }],
    [0.55, 'fx', { id: 'FLIP', socket: 'muzzle', color: '#ffffff' }],
    [0.6, 'fx', { id: 'BOLT', socket: 'muzzle', to: 'aim', range: 10, color: '#d6ccff', life: 0.35 }],
    [0.75, 'fx', { id: 'RING', at: 'aim', range: 10, ground: true, r1: 2.5, color: '#ffb43a' }],
    [0.8, 'fx', { id: 'PILLAR', at: 'aim', range: 10, ground: true, color: '#fff2b0', h: 6 }],
    [0.7, 'fx', { id: 'SIGIL', at: 'aim', range: 10, ground: true, design: 'clouds', radius: 3, life: 1.6, color: '#ffb43a' }],
  ] },
  test_wing: { duration: 2.0, tracks: tilt(4, 10, -8), events: [[0.05, 'fx', { id: 'WING', open: 0.25 }], [0.75, 'fx', { id: 'WING', close: 0.2 }]] },
  test_trail: { duration: 0.9, tracks: {
    gunPos: [[0, Z3], [0.2, [0.08, 0.05, 0.02], 'out'], [0.55, [-0.1, -0.05, -0.06], 'in3'], [1, Z3]],
    gunRot: [[0, Z3], [0.2, [10, 25, 35], 'out'], [0.55, [-12, -45, -30], 'in3'], [1, Z3]],
  }, events: [[0.18, 'trail', { on: true, id: 'test', from: 'muzzle', to: 'grip_l', color: '#ffffff', color1: '#6fe3ff', life: 0.2 }], [0.6, 'trail', { on: false, id: 'test' }]] },
  test_hitstop: { duration: 0.8, tracks: tilt(-4, 0, 0), events: [[0.3, 'hitstop', 90], [0.3, 'shake', 0.25]] },
  test_shake: { duration: 0.8, tracks: tilt(0, 0, 0), events: [[0.2, 'shake', 0.55]] },
  test_fov: { duration: 1.2, tracks: tilt(0, 0, 0), events: [[0.1, 'fov', [4, 0.8]]] },
  test_tint: { duration: 1.0, tracks: tilt(0, 0, 0), events: [[0.1, 'tint', { rgb: '#ffcf6a', a: 0.25, in: 0.05, hold: 0.25, out: 0.35 }]] },
  test_overlay: { duration: 1.0, tracks: tilt(0, 0, 0), events: [[0.1, 'overlay', { id: 'RADIAL', dur: 0.6 }]] },
  test_haptic: { duration: 1.0, tracks: tilt(0, 0, 0), events: [[0.1, 'haptic', 'tick'], [0.4, 'haptic', 'thud'], [0.7, 'haptic', 'ready_double']] },
  test_glow: { duration: 1.6, tracks: tilt(), events: [[0.05, 'glow', { to: 0, sec: 0.2 }], [0.3, 'glow', { to: 3, sec: 0.3 }],
    [0.3, 'glow', { u: 'pCharge', to: 1, sec: 0.3 }], [0.75, 'glow', { to: 1, sec: 0.3 }], [0.75, 'glow', { u: 'pCharge', to: 0.35, sec: 0.3 }]] },
  test_vmHide: { duration: 1.6, tracks: tilt(0, 0, 0), events: [[0.05, 'anchorL', ['point', 0.2]], [0.15, 'vmHide', true],
    [0.7, 'vmHide', false], [0.75, 'anchorL', ['grip_l', 0.2]], [0.8, 'poseL', 'cradle']] },
  test_summon: { duration: 1.4, tracks: tilt(0, 0, 0), events: [[0.05, 'anchorL', ['point', 0.15]], [0.2, 'summon', { id: 'GHOST', at: 'aim', range: 12, ground: true, shape: 'bird', size: 2.6, life: 1.2, motion: 'rise', rim: '#6fe3ff', core: '#bfe9ff' }],
    [0.75, 'anchorL', ['grip_l', 0.2]], [0.8, 'poseL', 'cradle']] },
  test_hud: { duration: 1.0, tracks: tilt(0, 0, 0), events: [[0.1, 'hud', { id: 'card', text: '測試．招式', sub: 'Test Move' }]] },
  // a part scaled through a <part>.scale track (any GLB: the magazine swells and shrinks back)
  test_scale: { duration: 1.2, tracks: { ...tilt(), 'mag.scale': [[0, [1, 1, 1]], [0.4, [1.6, 1.6, 1.6], 'outBack'], [0.7, [1.6, 1.6, 1.6]], [1, [1, 1, 1], 'in3']] }, events: [] },
  // free grips: left palm up, then pointing; right hand leaves the hidden gun to hold a grenade
  test_gestures: { duration: 3.0, tracks: tilt(0, 0, 0), events: [[0.02, 'vmHide', true], [0.03, 'anchorL', ['palm', 0.25]], [0.05, 'anchorR', ['grenade', 0.25]],
    [0.4, 'anchorL', ['point', 0.25]], [0.75, 'anchorL', ['grip_l', 0.2]], [0.75, 'anchorR', ['grip_r', 0.2]], [0.8, 'poseL', 'cradle'], [0.8, 'poseR', 'grip'], [0.82, 'vmHide', false]] },
  // rare inspect stand-in: present the side, then toss the gun up with a full roll and catch it
  test_inspect_rare: { duration: 3.0, loop: [0.12, 0.28], tracks: {
    gunPos: [[0, Z3], [0.12, [-0.035, 0.025, 0.02]], [0.2, [-0.045, 0.03, 0.02]], [0.28, [-0.035, 0.025, 0.02]], [0.36, [-0.03, 0.0, 0.02], 'in'],
      [0.5, [-0.02, 0.16, -0.02], 'out3'], [0.64, [-0.01, 0.01, 0.0], 'in3'], [0.7, [-0.005, -0.012, 0.0], 'out3'], [0.82, [0, 0.003, 0], 'outBack'], [1, Z3]],
    gunRot: [[0, Z3], [0.12, [9, 32, -28]], [0.2, [11, 38, -34]], [0.28, [9, 32, -28]], [0.36, [4, 10, -12], 'in'],
      // after the catch the roll wraps -362 -> -2 (same pose) so the blend back to rest never unwinds a full turn
      [0.64, [4, 4, -372], 'linear'], [0.7, [-3, 0, -362], 'out3'], [0.7005, [-3, 0, -2], 'snap'], [0.82, [1, -1, 0], 'outBack'], [1, Z3]],
  }, events: [[0.06, 'snd', 'cloth'], [0.3, 'anchorL', ['rest', 0.12]], [0.38, 'anchorR', ['rest', 0.08]], [0.38, 'snd', 'cloth'],
    [0.4, 'glow', { to: 2, sec: 0.3 }], [0.62, 'anchorR', ['grip_r', 0.06]], [0.64, 'poseR', 'grip'], [0.65, 'haptic', 'tick'], [0.66, 'snd', 'magIn'],
    [0.7, 'glow', { to: 1, sec: 0.4 }], [0.78, 'anchorL', ['grip_l', 0.16]], [0.84, 'poseL', 'cradle']] },
  test_first_draw: (vm) => firstDrawClip(vm, { motes: { id: 'MOTE', socket: 'muzzle', n: 16, color: '#ffd36b' } }),
};
for (const [id, c] of Object.entries(TESTS)) registerClip(id, c);
