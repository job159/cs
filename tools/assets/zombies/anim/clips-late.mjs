// Floor-level and special clips: knockdown, get_up, death_front, death_back, crawl, crawl_attack,
// leap, climb, eat, idle_b.
import * as THREE from 'three';
import { proc, fingerCurl, applyOffsets, loopNoise, noise, DEG } from './pose.mjs';
import { sample, retime, crop, blendPose, smooth, removeRootMotion, findLoop, makeLoop, fixSigns, smoothClip } from './clip.mjs';
import { clonePose } from './skeleton.mjs';
import { zombify } from './zombify.mjs';
import { fromUAL, fromCMU } from './lib.mjs';
import { groundFeet, footPoints, twoBoneIK, ARM, LEG, kneePole, lockFeet, clampFeetAboveGround } from './ik.mjs';

/** Cross-fades the first `dur` seconds of a clip in from poseFn(t). */
export function blendIn(clip, poseFn, dur) {
  const n = Math.min(clip.poses.length, Math.round(dur * clip.fps) + 1);
  for (let f = 0; f < n; f++) clip.poses[f] = blendPose(poseFn(f / clip.fps), clip.poses[f], smooth(f / (n - 1)));
  return clip;
}
/** Cross-fades the last `dur` seconds of a clip out to poseFn(t) (t = clip time). */
export function blendOut(clip, poseFn, dur) {
  const N = clip.poses.length;
  const n = Math.min(N, Math.round(dur * clip.fps) + 1);
  for (let k = 0; k < n; k++) {
    const f = N - n + k;
    clip.poses[f] = blendPose(clip.poses[f], poseFn(f / clip.fps), smooth(k / (n - 1)));
  }
  return clip;
}
/** Raises the root wherever any joint / foot point / hand would sink below `minY`. */
export function groundClamp(skel, clip, minY = 0.0) {
  for (const p of clip.poses) {
    const fk = skel.fk(p);
    let m = Infinity;
    for (let i = 1; i < fk.wp.length; i++) m = Math.min(m, fk.wp[i].y);
    for (const s of ['l', 'r']) { const fp = footPoints(skel, fk, s); m = Math.min(m, fp.heel.y, fp.toe.y); }
    // fingertips / head top
    for (const b of ['head', 'middle_03_l', 'middle_03_r']) m = Math.min(m, skel.tail(fk, skel.i(b)).y);
    if (m < minY) p.root.y += minY - m;
  }
  return clip;
}
const shiftXZ = (clip, dx, dz) => { for (const p of clip.poses) { p.root.x += dx; p.root.z += dz; } return clip; };
/** Ground a standing-start clip: feet of the first frames on the ground. */
function groundStart(skel, clip, frames = 4) {
  let m = Infinity;
  for (let f = 0; f < Math.min(frames, clip.poses.length); f++) {
    const fk = skel.fk(clip.poses[f]);
    for (const s of ['l', 'r']) { const fp = footPoints(skel, fk, s); m = Math.min(m, fp.heel.y, fp.toe.y); }
  }
  for (const p of clip.poses) p.root.y -= m;
  return clip;
}
const limp = (skel, pose, amt) => fingerCurl(skel, pose, 'both', amt, { thumb: amt * 0.4 });

export function buildLate(skel, only, loco, { base, A, env, clawLayer, shakeLayer }) {
  const out = {};
  const idle = loco.idle;
  const idlePose = (t) => sample(idle, t * idle.fps);
  const idle0 = clonePose(idle.poses[0]);
  const pel = skel.i('pelvis');

  // ------------------------------------------------------------------ get_up (UAL2 LayToIdle, slowed, zombified)
  {
    let c = fromUAL(skel, 2, 'LayToIdle', { name: 'get_up' });
    // struggling start, then the quick rise: 1.53 s -> 2.6 s with a slow first half
    c = retime(c, Math.round(2.6 * 30) + 1, (u) => (u < 0.55 ? 0.42 * smooth(u / 0.55) ** 0.9 : 0.42 + 0.58 * smooth((u - 0.55) / 0.45)));
    groundClamp(skel, c, 0.0);
    zombify(skel, c, { slump: 2, headTilt: 10, twitch: 1.4, claw: 26, seed: 31 });
    // end on the idle pose, standing over the origin
    const last = c.poses[c.poses.length - 1].root;
    shiftXZ(c, idle0.root.x - last.x, idle0.root.z - last.z);
    blendOut(c, idlePose, 0.45);
    groundClamp(skel, c, 0.0);
    c.meta.source = 'Quaternius UAL2 LayToIdle';
    c.meta.notes = 'rises from lying on the back (knockdown end pose); time-warped: slow struggle then the push up; ends on idle';
    out.get_up = c;
  }

  // ------------------------------------------------------------------ knockdown (CMU 90_18 rug-pull fall, lands on the back)
  {
    const c = fromCMU(skel, '90_18', { from: 0.55, to: 2.6, heading: 'hips0', name: 'knockdown' });
    groundStart(skel, c);
    const r0 = c.poses[0].root;
    shiftXZ(c, idle0.root.x - r0.x, idle0.root.z - r0.z);
    zombify(skel, c, { slump: 0, neck: 0, headTilt: 8, dropL: 0, hangL: 0, claw: 20, twitch: 0.3, seed: 33 });
    blendIn(c, idlePose, 0.25);
    groundClamp(skel, c, 0.0);
    // settle into the first frame of get_up so the two chain without a pop
    const g0 = out.get_up.poses[0];
    const drift = g0.root.clone().sub(c.poses[c.poses.length - 1].root);
    const n = c.poses.length, f0 = Math.round(0.9 * c.fps);
    for (let f = f0; f < n; f++) { const w = smooth((f - f0) / (n - 1 - f0)); c.poses[f].root.x += drift.x * w; c.poses[f].root.z += drift.z * w; }
    blendOut(c, () => clonePose(g0), 0.7);
    c.meta.source = 'CMU 90_18 RugPullFall';
    c.meta.notes = 'feet swept out, falls on the back; ends exactly on the first frame of get_up';
    c.meta.events = { ground: 0.7 };
    out.knockdown = c;
  }

  // ------------------------------------------------------------------ death_back (UAL1 Death01)
  {
    const c = fromUAL(skel, 1, 'Death01', { name: 'death_back' });
    groundStart(skel, c);
    const r0 = c.poses[0].root;
    shiftXZ(c, idle0.root.x - r0.x, idle0.root.z - r0.z);
    zombify(skel, c, { slump: 0, neck: 0, headTilt: 6, dropL: 0, hangL: 0, claw: 0, twitch: 0, seed: 35 });
    for (const p of c.poses) limp(skel, p, 20);
    blendIn(c, idlePose, 0.2);
    groundClamp(skel, c, 0.0);
    c.meta.source = 'Quaternius UAL1 Death01';
    c.meta.notes = 'staggers and falls on the back; root drift: the pelvis ends ~0.45 m behind the origin (-Z)';
    c.meta.events = { ground: 0.95 };
    c.meta.rootMotion = { z: +(c.poses[c.poses.length - 1].root.z - idle0.root.z).toFixed(2) };
    out.death_back = c;
  }

  // ------------------------------------------------------------------ death_front (keyframed collapse onto the face)
  {
    const b = () => clonePose(idle0);
    const c = proc(skel, {
      name: 'death_front', dur: 1.9, base: b, plant: { l: true, r: true },
      keys: [
        { t: 0 },
        { t: 0.12, head: [12, 0, 14], neck_01: [6, 0, 0], spine_02: [4, 0, 0], root: [0, -0.03, 0.01], upperarm: [-6, 0, 4] },
        { t: 0.42, root: [0, -0.3, 0.1], pelvis: [14, 0, 0], spine_01: [6, 0, 0], spine_02: [10, 0, 0], spine_03: [8, 0, 0], neck_01: [10, 0, 0], head: [22, 0, 16], upperarm: [-4, 0, -12], lowerarm: [6, 0, 0], plantL: [1, 0, 0], plantR: [1, 0, 0] },
        { t: 0.6, root: [0, -0.38, 0.2], pelvis: [30, 0, 0], thigh: [-26, 0, 2], calf: [96, 0, 0], foot: [36, 0, 0], plantL: [0, 0, 0], plantR: [0, 0, 0], spine_02: [12, 0, 0], upperarm: [-14, 0, -10] },
        { t: 0.86, root: [0, -0.56, 0.45], pelvis: [68, 0, 0], thigh: [-14, 0, 4], calf: [70, 0, 0], foot: [40, 0, 0], spine_01: [0, 0, 0], spine_02: [2, 0, 0], spine_03: [0, 0, 0], neck_01: [-6, 10, 0], head: [-10, 30, 10], upperarm: [-40, 0, 8], lowerarm: [-10, 0, 0] },
        { t: 1.0, root: [0, -0.7, 0.58], pelvis: [86, 0, 0], thigh: [-2, 0, 6], calf: [18, 0, 0], foot: [45, 0, 0], spine_01: [-8, 0, 0], spine_02: [-10, 0, 0], spine_03: [-8, 0, 0], neck_01: [-14, 25, 0], head: [-16, 45, 14], upperarm: [10, 0, -4], lowerarm: [-6, 0, 0] },
        { t: 1.12, root: [0, -0.66, 0.6], pelvis: [83, 0, 0], spine_02: [-7, 0, 0], calf: [26, 0, 0] },
        { t: 1.35, root: [0, -0.7, 0.6], pelvis: [86, 0, 0], spine_02: [-10, 0, 0], calf: [16, 0, 0], upperarm: [16, 0, -10] },
        { t: 1.9, root: [0, -0.7, 0.6], pelvis: [86, 0, 0], calf: [14, 0, 0], upperarm: [18, 0, -12] },
      ],
      post: (t, pose) => limp(skel, pose, 10 + 12 * Math.min(1, t)),
    });
    groundClamp(skel, c, 0.0);
    c.meta.source = 'procedural';
    c.meta.notes = 'keyframed: jolt, knees buckle, drop to the knees, topple onto the face; root drift: pelvis ends ~0.6 m in front (+Z)';
    c.meta.events = { ground: 1.0 };
    c.meta.rootMotion = { z: +(c.poses[c.poses.length - 1].root.z - idle0.root.z).toFixed(2) };
    out.death_front = c;
  }

  // ------------------------------------------------------------------ crawl (legless arm-drag crawl, loop)
  const crawlBase = () => {
    const p = skel.restPose();
    p.root.set(0, 0.17, 0);
    applyOffsets(skel, p, {
      pelvis: [80, 0, 0],
      spine_01: [-10, 0, 0], spine_02: [-14, 0, 0], spine_03: [-14, 0, 0], neck_01: [-22, 0, 0], head: [-34, 0, 8],
      thigh: [10, 0, 4], calf: [18, 0, 0], foot: [42, 0, 0],
      clavicle: [0, 0, 8],
    });
    return p;
  };
  const CRAWL_T = 1.8, CRAWL_V = 0.32;
  const crawlArms = (t, pose, P, opts = {}) => {
    // alternate pull strokes; hand targets on the ground, sliding back at the crawl speed while planted
    const stroke = CRAWL_V * P / 2;
    const fk = skel.fk(pose);
    for (const s of ['l', 'r']) {
      if (opts.skip === s) continue;
      const ph = ((t / P + (s === 'l' ? 0 : 0.5)) % 1 + 1) % 1; // 0..0.5 planted & pulling, 0.5..1 reaching
      const zFront = 0.86, zBack = zFront - stroke;
      let z, y;
      if (ph < 0.5) { z = zFront - stroke * (ph / 0.5); y = 0.03; }
      else { const u = (ph - 0.5) / 0.5; z = zBack + stroke * smooth(u); y = 0.03 + Math.sin(u * Math.PI) * 0.13; }
      const x = (s === 'l' ? 1 : -1) * (0.2 + (ph < 0.5 ? 0.02 : 0.05 * Math.sin(((ph - 0.5) / 0.5) * Math.PI)));
      const tgt = new THREE.Vector3(x, y, z);
      const pole = new THREE.Vector3(s === 'l' ? 1 : -1, 0.6, -0.4).normalize();
      // palm down, fingers forward: hand world rotation from the rest hand rotation pitched down
      const hq = new THREE.Quaternion().setFromEuler(new THREE.Euler(-55 * DEG, (s === 'l' ? -10 : 10) * DEG, 0, 'YXZ')).multiply(skel.restWorldQ[skel.i(`hand_${s}`)]);
      twoBoneIK(skel, pose, ARM(skel, s), tgt, pole, hq, fk);
    }
  };
  {
    const P = CRAWL_T;
    const c = proc(skel, {
      name: 'crawl', dur: P, loop: true, base: crawlBase,
      layers: [(t, pose) => {
        const a = (t / P) * Math.PI * 2;
        // torso rolls towards the pulling arm, shoulders surge, head bobs
        applyOffsets(skel, pose, {
          pelvis: [0, Math.sin(a) * 4, Math.sin(a) * 3],
          spine_02: [Math.sin(a * 2) * 2, Math.sin(a) * 5, -Math.sin(a) * 6],
          spine_03: [Math.sin(a * 2) * 2, Math.sin(a) * 4, -Math.sin(a) * 5],
          neck_01: [Math.sin(a * 2 + 1) * 3, -Math.sin(a) * 4, 0],
          head: [Math.sin(a * 2 + 1.5) * 4 + loopNoise(t, P, 3, 2) * 3, -Math.sin(a) * 6 + loopNoise(t, P, 2, 5) * 6, loopNoise(t, P, 2, 7) * 4],
          thigh_l: [Math.sin(a) * 6, 0, 0], thigh_r: [-Math.sin(a) * 6, 0, 0],
          calf_l: [Math.max(0, Math.sin(a)) * 18, 0, 0], calf_r: [Math.max(0, -Math.sin(a)) * 18, 0, 0],
          root: [Math.sin(a) * 0.015, Math.abs(Math.sin(a)) * 0.015, Math.sin(a * 2) * 0.02],
        });
        crawlArms(t, pose, P);
      }],
      post: (t, pose) => fingerCurl(skel, pose, 'both', 32, { thumb: 15, spread: 10 }),
    });
    groundClamp(skel, c, 0.0);
    c.meta.speed = CRAWL_V;
    c.meta.source = 'procedural';
    c.meta.notes = 'keyframed/IK: prone arm-over-arm drag crawl (legless crawler); hands planted while pulling (treadmill speed = speed)';
    out.crawl = c;
  }

  // ------------------------------------------------------------------ crawl_attack (rear up on the left arm, swipe with the right)
  {
    const P = CRAWL_T;
    const c = proc(skel, {
      name: 'crawl_attack', dur: 1.3, base: (t) => clonePose(out.crawl.poses[0]),
      keys: [
        { t: 0 },
        { t: 0.3, spine_01: [-8, 8, 0], spine_02: [-12, 10, -6], spine_03: [-10, 8, -6], neck_01: [-8, 0, 0], head: [-14, 0, 0], upperarm_r: [-50, 0, 30], lowerarm_r: [-60, 0, 0], root: [0, 0.08, -0.02] },
        { t: 0.48, spine_01: [-4, -6, 0], spine_02: [-6, -10, 4], spine_03: [-4, -8, 4], head: [-20, -10, 0], upperarm_r: [-85, 0, -15], lowerarm_r: [-10, 0, 0], root: [0, 0.06, 0.06] },
        { t: 0.6, upperarm_r: [-60, 0, -35], lowerarm_r: [-25, 0, 0] },
        { t: 0.85, spine_01: [-4, 0, 0], spine_02: [-6, 0, 0], spine_03: [-4, 0, 0], head: [-6, 0, 0], upperarm_r: [-30, 0, -10], lowerarm_r: [-40, 0, 0], root: [0, 0.02, 0.02] },
        { t: 1.3, spine_01: [0, 0, 0], spine_02: [0, 0, 0], spine_03: [0, 0, 0], neck_01: [0, 0, 0], head: [0, 0, 0], upperarm_r: [0, 0, 0], lowerarm_r: [0, 0, 0], root: [0, 0, 0] },
      ],
      layers: [(t, pose) => {
        // left arm stays planted (IK); right arm is free during the swipe and returns to the crawl stroke
        crawlArms(0, pose, P, { skip: 'r' });
        const w = 1 - env([[0, 1], [0.2, 0], [1.0, 0], [1.3, 1]])(t);
        if (w < 1) {
          const keep = ARM(skel, 'r').map((i) => pose.q[i].clone());
          crawlArms(0, pose, P, { skip: 'l' });
          ARM(skel, 'r').forEach((i, k) => pose.q[i].slerp(keep[k], w));
        } else crawlArms(0, pose, P, { skip: 'l' });
      }],
      post: (t, pose) => fingerCurl(skel, pose, 'both', 32 + 30 * env([[0.4, 0], [0.55, 1], [0.9, 0]])(t), { thumb: 15, spread: 10 }),
    });
    groundClamp(skel, c, 0.0);
    c.meta.source = 'procedural';
    c.meta.events = { hit: 0.52 };
    c.meta.notes = 'keyframed: from the crawl pose, rears up on the left arm and rakes forward with the right (ankle height)';
    out.crawl_attack = c;
  }

  // ------------------------------------------------------------------ leap (UAL2 NinjaJump start + land, zombie arms)
  {
    const st = fromUAL(skel, 2, 'NinjaJump_Start');
    const ld = fromUAL(skel, 2, 'NinjaJump_Land');
    const air = fromUAL(skel, 2, 'NinjaJump_Idle_Loop');
    const s1 = crop(st, 0, 0.45), a1 = crop(air, 0, 0.2);
    const poses = [];
    // 0.3 s anticipation: idle -> crouched take-off pose
    const nA = 10;
    for (let f = 0; f < nA; f++) poses.push(blendPose(idlePose(f / 30), s1.poses[0], smooth(f / nA)));
    poses.push(...s1.poses, ...a1.poses.slice(1), ...ld.poses.slice(1));
    const c = { name: 'leap', fps: 30, poses: poses.map(clonePose), loop: false, meta: {} };
    // align pelvis over the origin at the start, then zombie arms reaching forward in the air
    const takeoff = nA / 30 + 0.07, land = nA / 30 + 0.45 + 0.2 + 0.13;
    const armEnv = env([[0, 0], [takeoff, 0], [takeoff + 0.12, 1], [land, 1], [land + 0.35, 0]]);
    c.poses.forEach((p, f) => {
      const t = f / 30, w = armEnv(t);
      if (w > 0) {
        const keep = {};
        for (const b of ['upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'clavicle_l', 'clavicle_r', 'hand_l', 'hand_r']) keep[b] = p.q[skel.i(b)].clone();
        const q = clonePose(p);
        for (const b of Object.keys(keep)) q.q[skel.i(b)].copy(skel.restLocalQ[skel.i(b)]);
        applyOffsets(skel, q, { upperarm: [-95, 0, -12], lowerarm: [-25, 0, 0], hand: [-15, 0, 0], clavicle: [0, 0, 10], head: [-10, 0, 0] });
        for (const b of Object.keys(keep)) p.q[skel.i(b)].copy(keep[b]).slerp(q.q[skel.i(b)], w);
        fingerCurl(skel, p, 'both', 45 * w, { thumb: 20 * w, spread: 12 * w });
      }
    });
    const r0 = c.poses[0].root;
    shiftXZ(c, idle0.root.x - r0.x, idle0.root.z - r0.z);
    zombify(skel, c, { slump: 0, neck: 0, headTilt: 6, dropL: 0, hangL: 0, claw: 18, twitch: 0.3, seed: 37 });
    blendOut(c, idlePose, 0.4);
    groundClamp(skel, c, 0.0);
    c.meta.source = 'Quaternius UAL2 NinjaJump_Start + NinjaJump_Idle_Loop + NinjaJump_Land';
    c.meta.events = { takeoff: +takeoff.toFixed(2), land: +land.toFixed(2) };
    c.meta.notes = 'crouch, spring, tucked flight with clawing arms, heavy landing. In place: the game moves the zombie along its jump arc between takeoff and land (pelvis keeps standing height while airborne)';
    out.leap = c;
  }

  // ------------------------------------------------------------------ climb (CMU 14_33 ladder climb, vertical in-place loop)
  {
    const c = fromCMU(skel, '14_33', { from: 2.4, to: 6.6, heading: 'hips', name: 'climb' });
    // remove the vertical climb trend (the game moves the zombie up the wall) and horizontal drift
    const n = c.poses.length;
    let st = 0, sy = 0, stt = 0, sty = 0;
    c.poses.forEach((p, f) => { st += f; sy += p.root.y; stt += f * f; sty += f * p.root.y; });
    const slope = (n * sty - st * sy) / (n * stt - st * st);
    c.poses.forEach((p, f) => { p.root.y -= slope * f; });
    removeRootMotion(c);
    c.meta.climbSpeed = slope * c.fps;
    smoothClip(c, 1);
    const best = findLoop(skel, c, { minLen: 30, maxLen: 70, lo: 12, hi: n - 1 });
    const L = makeLoop(c, best.s, best.e, 8);
    L.name = 'climb';
    fixSigns(L);
    zombify(skel, L, { slump: 0, neck: 2, headTilt: 10, dropL: 0, hangL: 0, claw: 30, twitch: 0.6, sway: 0.5, seed: 39 });
    // put the pelvis near standing height so the game positions it like the other clips
    const y0 = L.poses.reduce((a, p) => a + p.root.y, 0) / L.poses.length;
    for (const p of L.poses) p.root.y += 0.9 - y0;
    L.meta = { ...c.meta, speed: 0, climbSpeed: +(c.meta.climbSpeed).toFixed(3), source: 'CMU 14_33 climb ladder', notes: `in-place climbing loop (hands and feet on a ladder/wall in front, +Z). The game raises the zombie at climbSpeed m/s; feet are off the ground` };
    out.climb = L;
  }

  // ------------------------------------------------------------------ eat (crouched feeding loop)
  {
    const cr = fromUAL(skel, 1, 'Crouch_Idle_Loop');
    cr.loop = true;
    const P = (cr.poses.length - 1) / 30;
    const crouch = (t) => sample(cr, ((t % P) + P) % P * 30);
    const c = proc(skel, {
      name: 'eat', dur: P, loop: true, base: crouch,
      keys: [
        { t: 0, spine_01: [8, 0, 0], spine_02: [14, 0, 0], spine_03: [10, 0, 0], neck_01: [10, 0, 0], head: [16, 0, 10], root: [0, -0.04, 0.02] },
        { t: 0.55, spine_02: [18, -4, 0], neck_01: [18, 0, 0], head: [26, 6, 10] },
        { t: 0.8, spine_02: [10, 6, 0], neck_01: [-4, 12, 0], head: [-8, 20, 14] },
        { t: 1.0, neck_01: [6, -6, 0], head: [8, -14, 6] },
        { t: 1.35, spine_02: [16, 0, 0], neck_01: [16, 0, 0], head: [24, 0, 12] },
        { t: 1.75, spine_02: [12, -6, 0], neck_01: [4, -10, 0], head: [2, -18, 8] },
        { t: 2.1, spine_02: [17, 2, 0], neck_01: [17, 2, 0], head: [25, 4, 12] },
        { t: 2.5, spine_02: [12, 0, 0], neck_01: [6, 6, 0], head: [10, 8, 10] },
      ],
      layers: [(t, pose) => {
        // hands: one pins the body to the ground, the other tears up towards the mouth (alternating)
        const fk = skel.fk(pose);
        const a = (t / P) * Math.PI * 2;
        for (const s of ['l', 'r']) {
          const sg = s === 'l' ? 1 : -1;
          const tear = Math.max(0, Math.sin(a * 2 + (s === 'l' ? 0 : Math.PI))) ** 2;
          const tgt = new THREE.Vector3(sg * (0.16 + 0.03 * tear), 0.05 + 0.32 * tear, 0.42 - 0.12 * tear);
          const pole = new THREE.Vector3(sg, 0.2, -0.5).normalize();
          const hq = new THREE.Quaternion().setFromEuler(new THREE.Euler((-60 + 40 * tear) * DEG, 0, 0, 'YXZ')).multiply(skel.restWorldQ[skel.i(`hand_${s}`)]);
          twoBoneIK(skel, pose, ARM(skel, s), tgt, pole, hq, fk);
        }
      }, shakeLayer(['head', 'neck_01'], 4, 9, () => 1, 13)],
      post: (t, pose) => fingerCurl(skel, pose, 'both', 40, { thumb: 20, spread: 6 }),
    });
    groundFeet(skel, c);
    c.meta.source = 'Quaternius UAL1 Crouch_Idle_Loop + procedural arms/head';
    c.meta.notes = 'crouched over a body: one hand pins, the other tears up to the mouth, head dips, bites and rips with shakes (loop)';
    out.eat = c;
  }

  // ------------------------------------------------------------------ idle_b (searching / twitchy idle)
  {
    const P = 3.2;
    const c = proc(skel, {
      name: 'idle_b', dur: P, loop: true, base: (t) => idlePose(t * (idle.poses.length - 1) / 30 / P * 2),
      keys: [
        { t: 0, neck_01: [0, 0, 0], head: [0, 0, 0], spine_02: [0, 0, 0], root: [0, 0, 0] },
        { t: 0.6, neck_01: [-4, 14, 0], head: [-8, 26, -6], spine_02: [0, 6, 0], spine_03: [-2, 4, 0] },
        { t: 1.1, neck_01: [-4, 16, 0], head: [-10, 30, -8] },
        { t: 1.25, neck_01: [6, -4, 0], head: [10, -8, 18] },
        { t: 1.9, neck_01: [-2, -14, 0], head: [-6, -30, 4], spine_02: [0, -6, 0], spine_03: [-2, -4, 0], root: [0.02, 0, 0] },
        { t: 2.5, neck_01: [-3, -12, 0], head: [-10, -26, 2] },
        { t: 2.75, neck_01: [8, 0, 0], head: [14, 4, 16], spine_02: [2, 0, 0], spine_03: [0, 0, 0], root: [0, -0.02, 0] },
        { t: 3.2, neck_01: [0, 0, 0], head: [0, 0, 0], spine_02: [0, 0, 0], root: [0, 0, 0] },
      ],
      loop: true,
      plant: { l: true, r: true },
      layers: [shakeLayer(['head'], 7, 14, env([[1.15, 0], [1.2, 1], [1.32, 0], [2.68, 0], [2.72, 1], [2.85, 0]]), 17),
        (t, pose) => applyOffsets(skel, pose, { clavicle_r: [0, 0, 6 * Math.max(0, Math.sin((t / P) * Math.PI * 2 * 3)) ** 8] })],
    });
    c.meta.source = 'Quaternius UAL2 Zombie_Idle_Loop + procedural head search';
    c.meta.notes = 'searching idle: slow look left/right with sudden head jerks and a shoulder twitch (loop)';
    out.idle_b = c;
  }
  void loco; void base; void A; void clawLayer; void noise; void retime; void lockFeet; void clampFeetAboveGround; void LEG; void kneePole;
  return out;
}
