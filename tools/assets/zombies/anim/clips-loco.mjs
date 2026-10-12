// Locomotion + idle clips: idle, idle_b, walk_a, walk_b, walk_c, walk_limp, run, sprint, crawl.
import * as THREE from 'three';
import { mocapLoop, ualLoop } from './lib.mjs';
import { zombify } from './zombify.mjs';
import { applyOffsets, setOffsets, fingerCurl, loopNoise, proc, DEG } from './pose.mjs';
import { retime, fixSigns, sample } from './clip.mjs';
import { lockFeet, clampFeetAboveGround, groundFeet, twoBoneIK, LEG, kneePole, footPoints } from './ik.mjs';

/** Phase (radians) at frame f where 0 = left thigh furthest forward. */
function legPhase(skel, clip) {
  const n = clip.poses.length - 1;
  let best = 0, bz = -Infinity;
  const ti = skel.i('thigh_l');
  for (let f = 0; f < n; f++) {
    const fk = skel.fk(clip.poses[f]);
    const d = new THREE.Vector3(0, 1, 0).applyQuaternion(fk.wq[ti]);
    if (d.z > bz) { bz = d.z; best = f; }
  }
  return (f) => ((f - best) / n) * Math.PI * 2;
}

/**
 * Replaces the arm swing of a run cycle with zombie arms: reaching forward, clawing, swinging with
 * the opposite leg, plus a forward-leaning torso and a jutting head.
 */
function zombieRunUpper(skel, clip, o) {
  const ph = legPhase(skel, clip);
  const n = clip.poses.length;
  const P = (n - 1) / clip.fps;
  for (let f = 0; f < n; f++) {
    const p = clip.poses[f];
    const a = ph(f); // 0: left leg forward -> right arm forward
    const t = f / clip.fps;
    const sw = Math.cos(a);
    const wob = (k) => loopNoise(t, P, 2, k);
    setOffsets(skel, p, {
      clavicle_l: [0, -6 + sw * 6, -4 - 4 * Math.max(0, sw)],
      clavicle_r: [0, -6 - sw * 6, -4 - 4 * Math.max(0, -sw)],
      upperarm_l: [-o.reach + sw * o.swing + wob(1) * 6, 0, -o.spread + wob(2) * 5],
      upperarm_r: [-o.reach * o.reachR - sw * o.swing + wob(3) * 6, 0, -o.spread * 1.2 + wob(4) * 5],
      lowerarm_l: [-o.elbow - Math.max(0, -sw) * 18, 0, 0],
      lowerarm_r: [-o.elbow * 1.3 - Math.max(0, sw) * 18, 0, 0],
      hand_l: [-15 + sw * 10, 0, 10],
      hand_r: [-15 - sw * 10, 0, 10],
    });
    applyOffsets(skel, p, {
      spine_01: [o.lean * 0.3, -sw * 4, 0],
      spine_02: [o.lean * 0.35, -sw * 5, 0],
      spine_03: [o.lean * 0.35, -sw * 4, 0],
      neck_01: [-o.lean * 0.45, sw * 3, 4],
      head: [-o.lean * 0.35 + wob(5) * 5, sw * 4 + wob(6) * 6, 10 + wob(7) * 6],
    });
  }
}

export function buildLoco(skel) {
  const out = {};

  // ---------------------------------------------------------------- idle (Quaternius zombie idle)
  {
    let c = ualLoop(skel, 2, 'Zombie_Idle_Loop', { name: 'idle', lock: false });
    // slower, heavier breathing/sway: 1.33 s -> 2.0 s
    c = retime(c, 61);
    c.loop = true;
    c.meta.speed = 0;
    zombify(skel, c, { slump: -9, neck: 2, headNod: -4, headTilt: 10, twitch: 0.8, claw: 22, seed: 3 });
    lockFeet(skel, c, { speed: 0 });
    c.meta.notes = 'Quaternius UAL2 Zombie_Idle_Loop slowed x1.5, zombified (head tilt, dropped shoulder, claw hands)';
    out.idle = c;
  }

  // ---------------------------------------------------------------- walk_a: hunched lurch (UAL2)
  {
    const c = ualLoop(skel, 2, 'Zombie_Walk_Fwd_Loop', { name: 'walk_a' });
    zombify(skel, c, { slump: 2, headTilt: 8, neck: 2, twitch: 0.7, claw: 25, seed: 5 });
    c.meta.notes = 'Quaternius UAL2 Zombie_Walk_Fwd_Loop; hunched lurching walk';
    out.walk_a = c;
  }

  // ---------------------------------------------------------------- walk_b: arms-forward shuffle (CMU 104_41)
  {
    const c = mocapLoop(skel, '104_41', { from: 3, to: 11, name: 'walk_b' });
    zombify(skel, c, { slump: 5, headTilt: 14, headNod: 6, dropL: 4, hangL: 4, claw: 30, seed: 7 });
    c.meta.notes = 'CMU 104_41 ZombieWalk, arms-forward shuffle';
    out.walk_b = c;
  }

  // ---------------------------------------------------------------- walk_c: lolling stagger (CMU 120_22)
  {
    const c = mocapLoop(skel, '120_22', { from: 5.3, to: 9.2, name: 'walk_c' });
    zombify(skel, c, { slump: 4, headTilt: -10, dropL: 0, dropR: 8, hangL: 0, hangR: 8, claw: 24, seed: 9 });
    c.meta.notes = 'CMU 120_22 Zombie, lolling head and dangling arms';
    out.walk_c = c;
  }

  // ---------------------------------------------------------------- walk_limp (CMU 91_24 hurt leg) + right foot drag
  {
    const c = mocapLoop(skel, '91_24', { from: 6.3, to: 17.2, minLen: 1.2, maxLen: 2.8, name: 'walk_limp' });
    dragFoot(skel, c, 'r');
    zombify(skel, c, { slump: 7, headTilt: 12, claw: 26, seed: 11 });
    c.meta.notes = 'CMU 91_24 HurtLegWalk, right foot dragged (toe scrapes the ground through the swing)';
    out.walk_limp = c;
  }

  // ---------------------------------------------------------------- run (UAL1 jog legs + zombie upper body)
  {
    const c = ualLoop(skel, 1, 'Jog_Fwd_Loop', { name: 'run' });
    zombieRunUpper(skel, c, { reach: 55, reachR: 0.8, swing: 22, spread: 8, elbow: 25, lean: 16 });
    zombify(skel, c, { slump: 0, neck: 0, headTilt: 6, dropL: 0, hangL: 0, claw: 32, twitch: 0.6, sway: 0, seed: 13 });
    c.meta.notes = 'Quaternius UAL1 Jog_Fwd_Loop legs; procedural reaching/clawing arms, forward lean';
    out.run = c;
  }

  // ---------------------------------------------------------------- sprint (UAL1 sprint legs + wild arms)
  {
    const c = ualLoop(skel, 1, 'Sprint_Loop', { name: 'sprint' });
    zombieRunUpper(skel, c, { reach: 40, reachR: 1.25, swing: 40, spread: 14, elbow: 30, lean: 24 });
    zombify(skel, c, { slump: 0, neck: 0, headTilt: 4, dropL: 0, hangL: 0, claw: 35, twitch: 0.4, sway: 0, seed: 15 });
    c.meta.notes = 'Quaternius UAL1 Sprint_Loop legs; flailing arms, strong forward lean (infected-runner)';
    out.sprint = c;
  }
  return out;
}

/**
 * Turns one leg into a dragged leg: during its swing the foot stays low (toe scraping), turned out
 * and pointed; the knee stays stiffer.
 */
function dragFoot(skel, clip, s) {
  const n = clip.poses.length;
  for (let f = 0; f < n; f++) {
    const p = clip.poses[f];
    const fk = skel.fk(p);
    const fp = footPoints(skel, fk, s);
    const lift = Math.min(fp.heel.y, fp.toe.y);
    if (lift <= 0.004) continue;
    const ank = fp.ankle.clone();
    ank.y -= lift * 0.75; // keep 25 % of the lift: the toe scrapes along
    const fq = fk.wq[skel.i(`foot_${s}`)];
    // point the toe down a little and turn it out
    const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(18 * DEG * Math.min(1, lift / 0.05), (s === 'l' ? 1 : -1) * 12 * DEG, 0, 'YXZ'));
    twoBoneIK(skel, p, LEG(skel, s), ank, kneePole(fk, skel, s), turn.multiply(fq), fk);
  }
  clampFeetAboveGround(skel, clip);
  if (clip.loop) clip.poses[n - 1] = { q: clip.poses[0].q.map((q) => q.clone()), root: clip.poses[0].root.clone() };
}

export { proc, fingerCurl, sample, fixSigns, groundFeet };
