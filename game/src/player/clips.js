// Action clips for the viewmodel, generated from the weapon's reload style and sockets.
// Times are normalised (0..1) and scaled to the gameplay duration by the caller.
// Track names: gunPos [m], gunRot [deg], <part> (0..1 travel/angle), <part>.pos, <part>.rot, <part>.vis
// Events:  anchorL/anchorR [anchor, blend s], poseL/poseR pose, sounds 'snd' name, 'magDrop', 'ammo', 'shellOut'...

const Z3 = [0, 0, 0];

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

export function inspectClip() {
  return {
    tracks: {
      gunPos: [[0, Z3], [0.18, [-0.03, 0.02, 0.03]], [0.5, [-0.05, 0.03, 0.02]], [0.82, [0.0, 0.0, 0.02]], [1, Z3]],
      gunRot: [[0, Z3], [0.18, [8, 30, -28]], [0.48, [10, 38, -36]], [0.62, [-4, -18, 34]], [0.84, [-2, -12, 26]], [1, Z3]],
    },
    events: [[0.12, 'snd', 'cloth'], [0.55, 'snd', 'cloth'], [0.7, 'anchorL', ['grip_l', 0.2]]],
  };
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

export function reloadClipFor(vm, style, empty) {
  switch (style) {
    case 'mag_pistol': return pistolReload(vm, { empty });
    case 'shell_break': return breakReload(vm);
    case 'belt': return beltReload(vm);
    case 'cylinder': return cylinderReload(vm);
    case 'none': return rocketReload(vm);
    case 'mag': case 'mag_curved': case 'drum': default: return magReload(vm, { empty, style });
  }
}
