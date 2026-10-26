// Locomotion + idle clips: idle, walk_a, walk_b, walk_c, walk_limp, walk_stalk, walk_hurry, run, sprint.
import * as THREE from 'three';
import { mocapLoop, ualLoop } from './lib.mjs';
import { zombify } from './zombify.mjs';
import { applyOffsets, setOffsets, fingerCurl, loopNoise, proc, DEG } from './pose.mjs';
import { retime, fixSigns, sample, duration } from './clip.mjs';
import { lockFeet, clampFeetAboveGround, groundFeet, twoBoneIK, LEG, kneePole, footPoints, strideWarp, lengthenStride } from './ik.mjs';

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

/**
 * Speeds a mocap walk up to the ground speeds the game moves its users at: cadence x `cadence` (retimed), strides x
 * `stride` (lengthenStride: the pelvis dips where the longer steps need it), feet re-locked to the new treadmill speed.
 * The CMU zombie walks are 0.4-0.7 m/s shuffles, the walkers / spitters / riots move at 0.9-1.9 m/s: played at their
 * own speed x1.8 (the rate clamp) the feet skated 0.3-0.9 m/s.
 */
function quicken(skel, c, { cadence, stride }) {
  const D = duration(c);
  const q = retime(c, Math.round((D / cadence) * c.fps) + 1);
  q.loop = true;
  q.poses[q.poses.length - 1] = { q: q.poses[0].q.map((x) => x.clone()), root: q.poses[0].root.clone() };
  q.meta = { ...c.meta, speed: c.meta.speed * (D / duration(q)) };
  fixSigns(q);
  lengthenStride(skel, q, stride);
  lockFeet(skel, q, { speed: q.meta.speed });
  clampFeetAboveGround(skel, q);
  return q;
}

/**
 * Lowers the feet through the swing: where a foot is off the ground (heel and ball both above `clear`) the whole foot
 * drops by (1 - k) of its heel height, keeping its attitude and at least `clear` of toe clearance (leg IK).
 */
function lowerSwing(skel, clip, k, clear = 0.012) {
  for (const p of clip.poses) {
    for (const s of ['l', 'r']) {
      const fk = skel.fk(p);
      const fp = footPoints(skel, fk, s);
      const low = Math.min(fp.heel.y, fp.toe.y);
      const drop = Math.min(fp.heel.y * (1 - k), low - clear);
      if (low <= clear || drop <= 0) continue;
      const t = fp.ankle.clone();
      t.y -= drop;
      twoBoneIK(skel, p, LEG(skel, s), t, kneePole(fk, skel, s), fk.wq[skel.i(`foot_${s}`)].clone(), fk);
    }
  }
  return clip;
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
    // its users move at 0.9-1.9 m/s (walkers, spitters, riots): x1.5 cadence, x1.45 stride
    const c = quicken(skel, mocapLoop(skel, '104_41', { from: 3, to: 11, name: 'walk_b' }), { cadence: 1.5, stride: 1.45 });
    zombify(skel, c, { slump: 5, headTilt: 14, headNod: 6, dropL: 4, hangL: 4, claw: 30, seed: 7 });
    c.meta.notes = 'CMU 104_41 ZombieWalk, arms-forward shuffle; quickened to the game speeds (cadence x1.5, stride x1.45)';
    out.walk_b = c;
  }

  // ---------------------------------------------------------------- walk_c: lolling stagger (CMU 120_22)
  {
    // walkers (0.9-1.4 m/s): x1.2 cadence, x1.3 stride
    const c = quicken(skel, mocapLoop(skel, '120_22', { from: 5.3, to: 9.2, name: 'walk_c' }), { cadence: 1.2, stride: 1.3 });
    zombify(skel, c, { slump: 4, headTilt: -10, dropL: 0, dropR: 8, hangL: 0, hangR: 8, claw: 24, seed: 9 });
    c.meta.notes = 'CMU 120_22 Zombie, lolling head and dangling arms; quickened to the game speeds (cadence x1.2, stride x1.3)';
    out.walk_c = c;
  }

  // ---------------------------------------------------------------- walk_limp (CMU 91_24 hurt leg) + right foot drag
  {
    // walkers and bloaters (0.9-1.4 m/s): x1.35 cadence, x1.65 stride
    const c = quicken(skel, mocapLoop(skel, '91_24', { from: 6.3, to: 17.2, minLen: 1.2, maxLen: 2.8, name: 'walk_limp' }), { cadence: 1.35, stride: 1.65 });
    dragFoot(skel, c, 'r');
    zombify(skel, c, { slump: 7, headTilt: 12, claw: 26, seed: 11 });
    c.meta.notes = 'CMU 91_24 HurtLegWalk, right foot dragged (toe scrapes the ground through the swing); quickened to the game speeds (cadence x1.35, stride x1.65)';
    out.walk_limp = c;
  }

  // ---------------------------------------------------------------- walk_stalk: upright stalking walk (screamer)
  {
    // UAL1's formal walk: upright, even, clean feet. Slower cadence and longer strides (1.33 s -> 1.6 s per cycle,
    // x1.2) for a measured, deliberate gait at the screamer's 1.2-1.4 m/s; the swing foot carried 30 % lower (the
    // longer steps flicked the heel up behind, jaunty, and lifted the robe hem in profile); the upper body replaced:
    // tall spine, arms raised a little in front with the claws open, head held level and forward (stabilised)
    const c0 = ualLoop(skel, 1, 'Walk_Formal_Loop', { name: 'walk_stalk' });
    const c = lowerSwing(skel, quicken(skel, c0, { cadence: duration(c0) / 1.6, stride: 1.2 }), 0.7);
    const ph = legPhase(skel, c);
    const P = duration(c);
    const hi = skel.i('head'), ni = skel.i('neck_01');
    for (let f = 0; f < c.poses.length; f++) {
      const p = c.poses[f];
      const t = f / c.fps, a = ph(f), sw = Math.cos(a);
      const wob = (k) => loopNoise(t, P, 1, k);
      setOffsets(skel, p, {
        clavicle_l: [0, -4, 4], clavicle_r: [0, -4, 4],
        upperarm_l: [-30 + sw * 5 + wob(1) * 3, 6, -24 + wob(2) * 3], upperarm_r: [-34 - sw * 5 + wob(3) * 3, 6, -22 + wob(4) * 3],
        lowerarm_l: [-38 - Math.max(0, -sw) * 6, 0, 0], lowerarm_r: [-42 - Math.max(0, sw) * 6, 0, 0],
        hand_l: [18 + wob(5) * 6, 0, 8], hand_r: [14 + wob(6) * 6, 0, 8],
      });
      applyOffsets(skel, p, { spine_01: [-2, 0, 0], spine_02: [-2, -sw * 2, 0], spine_03: [-1, -sw * 2, 0] });
      // head steady: the neck takes 40 % and the head the rest of the rotation back to level and forward, with a
      // slow searching drift
      const fk = skel.fk(p);
      const want = new THREE.Quaternion().setFromEuler(new THREE.Euler(-2 * DEG + wob(7) * 2 * DEG, wob(8) * 7 * DEG, 0, 'YXZ')).multiply(skel.restWorldQ[hi]);
      const d = want.clone().multiply(fk.wq[hi].clone().invert());
      const Gn = new THREE.Quaternion().slerp(d, 0.4).multiply(fk.wq[ni]);
      p.q[ni] = fk.wq[skel.parent[ni]].clone().invert().multiply(Gn);
      p.q[hi] = Gn.clone().invert().multiply(want);
      fingerCurl(skel, p, 'both', 30 + 12 * Math.max(0, wob(9)), { thumb: 12, spread: 14 });
    }
    c.meta.source = 'Quaternius UAL1 Walk_Formal_Loop';
    c.meta.notes = 'Quaternius UAL1 Walk_Formal_Loop legs, slowed to a 1.6 s cycle with x1.2 strides, swing foot carried 30 % lower; upright stalking upper body: arms raised a little in front with open claws, head steady, level and forward';
    out.walk_stalk = c;
  }

  // ---------------------------------------------------------------- walk_hurry: hurried hunched shamble (spitter, riot)
  {
    // walk_a's lurch for the faster walkers (spitters 1.5-1.9 m/s, riots 1.3-1.6 m/s): quicker steps (x1.3 cadence),
    // strides only x1.12 so the knees stay up -- walk_b quickened to these speeds read as a crouched speed-walk with
    // long lunging strides; hunched a little further over the feet
    const c = quicken(skel, ualLoop(skel, 2, 'Zombie_Walk_Fwd_Loop', { name: 'walk_hurry' }), { cadence: 1.3, stride: 1.12 });
    zombify(skel, c, { slump: 4, headTilt: 10, neck: 3, twitch: 0.8, claw: 28, seed: 13 });
    c.meta.notes = 'Quaternius UAL2 Zombie_Walk_Fwd_Loop quickened (cadence x1.3, stride x1.12); hurried hunched shamble for the faster walkers';
    out.walk_hurry = c;
  }

  // ---------------------------------------------------------------- run (UAL1 jog legs + zombie upper body)
  {
    const c = ualLoop(skel, 1, 'Jog_Fwd_Loop', { name: 'run' });
    // UAL's jog strides 2.6 m per step (5.6 m/s): shorten to a choppier ~3.8 m/s zombie run
    strideWarp(skel, c, 0.68);
    lockFeet(skel, c, { speed: c.meta.speed });
    clampFeetAboveGround(skel, c);
    zombieRunUpper(skel, c, { reach: 55, reachR: 0.8, swing: 22, spread: 8, elbow: 25, lean: 16 });
    zombify(skel, c, { slump: 0, neck: 0, headTilt: 6, dropL: 0, hangL: 0, claw: 32, twitch: 0.6, sway: 0, seed: 13 });
    c.meta.notes = 'Quaternius UAL1 Jog_Fwd_Loop legs; procedural reaching/clawing arms, forward lean';
    out.run = c;
  }

  // ---------------------------------------------------------------- sprint (UAL1 sprint legs + wild arms)
  {
    const c = ualLoop(skel, 1, 'Sprint_Loop', { name: 'sprint' });
    strideWarp(skel, c, 0.66);
    lockFeet(skel, c, { speed: c.meta.speed });
    clampFeetAboveGround(skel, c);
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
