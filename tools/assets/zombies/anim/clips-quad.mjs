// Quadruped set for the crawler (爬牆者, game/assets/zombies/crawler.glb: a starved man who moves on all fours):
// crawl_quad (gallop loop), crawl_quad_attack, pounce, death_quad, idle_quad.
//
// Posed on the crawler's own skeleton (model-skel.mjs: its forearms, hands and shins are 5-18 % longer than the
// library body's and the shoulders wider) so the planted hands and feet sit exactly on the ground after the game's
// rotation retarget, then converted to library rotations. Spider-like build: elbows up and out, knees splayed out
// over the feet, the spine low and slung between the shoulders and hips, the head craned up and held steady.
// Hands: the model's extras.poseOffsets hook the fingers into claws after the mixer, so a planted hand rides on its
// claw tips and the heel of the palm (knuckles HAND_Y above the floor); the clips leave the fingers straight.
import * as THREE from 'three';
import { applyOffsets, loopNoise, DEG } from './pose.mjs';
import { hingeIK, ARM, LEG } from './ik.mjs';
import { smooth } from './clip.mjs';
import { clonePose } from './skeleton.mjs';
import { modelSkeleton, toLibrary, applyModelOffsets } from './model-skel.mjs';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const SIDE = { l: 1, r: -1 };
const TAU = Math.PI * 2;
const wrap01 = (x) => ((x % 1) + 1) % 1;
const lerp = (a, b, u) => a + (b - a) * u;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

/** Rotation taking the orthonormal frame (f0, n0) onto (f1, n1). */
function frameRot(f0, n0, f1, n1) {
  const m0 = new THREE.Matrix4().makeBasis(f0, n0, f0.clone().cross(n0));
  const m1 = new THREE.Matrix4().makeBasis(f1, n1, f1.clone().cross(n1));
  return new THREE.Quaternion().setFromRotationMatrix(m1.multiply(m0.transpose()));
}

/** Rest-pose hand frame: finger direction, palm normal (palm side), wrist -> middle knuckle offset. */
function handFrame(S, s) {
  const h = S.restWorldP[S.i(`hand_${s}`)], m = S.restWorldP[S.i(`middle_01_${s}`)];
  const f = m.clone().sub(h).normalize();
  const across = S.restWorldP[S.i(`index_01_${s}`)].clone().sub(S.restWorldP[S.i(`pinky_01_${s}`)]);
  const n = f.clone().cross(across).multiplyScalar(SIDE[s]).normalize();
  n.addScaledVector(f, -n.dot(f)).normalize();
  return { f, n, knuckle: m.clone().sub(h) };
}

/**
 * Plants / places a hand: `p` = middle knuckle (world), fingers pointing forward turned `out` deg outwards and
 * pitched `pitch` deg down, palm facing down (rolled `roll` deg, + = thumb up). IK weight w (0 keeps the FK arm).
 */
function solveHand(S, pose, s, { p, out = 20, pitch = 8, roll = 0, pole, w = 1 }, fk) {
  if (w <= 0) return;
  const F = (S._quadHand ||= {})[s] ||= handFrame(S, s);
  const sg = SIDE[s], cp = Math.cos(pitch * DEG);
  const f1 = V3(sg * Math.sin(out * DEG) * cp, -Math.sin(pitch * DEG), Math.cos(out * DEG) * cp).normalize();
  const n1 = V3(0, -1, 0).applyAxisAngle(f1, sg * roll * DEG);
  n1.addScaledVector(f1, -n1.dot(f1)).normalize();
  const R = frameRot(F.f, F.n, f1, n1);
  const Qh = R.clone().multiply(S.restWorldQ[S.i(`hand_${s}`)]);
  const wrist = p.clone().sub(F.knuckle.clone().applyQuaternion(R));
  const arm = ARM(S, s);
  const before = w < 1 ? arm.map((i) => pose.q[i].clone()) : null;
  hingeIK(S, pose, arm, wrist, pole, Qh, fk || S.fk(pose), 0.05, 0.5);
  if (before) arm.forEach((i, k) => pose.q[i].copy(before[k].slerp(pose.q[i], w)));
  else if (p.y < HAND_Y + 0.01) trackErr(S, S.fk(pose).wp[S.i(`middle_01_${s}`)].distanceTo(p));
  // the thumb (pointing down off the palm at rest) swings forward-in along the floor instead of into it
  // (near the floor only, fading out over 8 cm of lift)
  const ti = S.i(`thumb_01_${s}`);
  const tf = S.fk(pose);
  const d = V3(0, 1, 0).applyQuaternion(tf.wq[ti]);
  const near = w * clamp01(1 - (p.y - HAND_Y) / 0.08);
  if (d.y < -0.2 && near > 0) {
    const flat = d.clone().setY(-0.2 + (d.y + 0.2) * (1 - near)).normalize();
    const G = new THREE.Quaternion().setFromUnitVectors(d, flat).multiply(tf.wq[ti]);
    pose.q[ti] = tf.wq[S.parent[ti]].clone().invert().multiply(G);
  }
}
/** Largest planted-contact miss of the IK (soft reach limit), reported by contactQA. */
const trackErr = (S, e) => { S._ikErr = Math.max(S._ikErr || 0, e); };

/**
 * Plants / places a foot: `p` = ball joint (world), heel raised `heel` deg (on the ball of the foot), toes turned
 * `out` deg outwards, toes bent up `toe` deg relative to the floor plane (0 = flat on it).
 */
function solveFoot(S, pose, s, { p, heel = 30, out = 15, toe = 0, pole, w = 1 }, fk) {
  if (w <= 0) return;
  const sg = SIDE[s];
  const fi = S.i(`foot_${s}`), bi = S.i(`ball_${s}`);
  const Ry = new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), sg * out * DEG);
  const R = Ry.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), heel * DEG));
  const Qf = R.clone().multiply(S.restWorldQ[fi]);
  const ballOff = S.restWorldP[bi].clone().sub(S.restWorldP[fi]);
  const ankle = p.clone().sub(ballOff.applyQuaternion(R));
  const leg = LEG(S, s);
  const before = w < 1 ? [...leg, bi].map((i) => pose.q[i].clone()) : null;
  hingeIK(S, pose, leg, ankle, pole, Qf, fk || S.fk(pose), 0.03);
  const Qb = Ry.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), -toe * DEG)).multiply(S.restWorldQ[bi]);
  pose.q[bi] = Qf.clone().invert().multiply(Qb);
  if (before) [...leg, bi].forEach((i, k) => pose.q[i].copy(before[k].slerp(pose.q[i], w)));
  else if (p.y < S.restWorldP[bi].y + 0.01) trackErr(S, S.fk(pose).wp[bi].distanceTo(p));
}

/**
 * Cranes the neck up to `neckPitch` deg above the horizontal (turned `yaw`) and turns the head to a world
 * orientation (pitch < 0 = face up, applied after yaw; roll last, about the world forward axis): the head stays
 * raised, level and forward whatever the spine does.
 */
function aimHead(S, pose, { yaw = 0, pitch = -12, roll = 0, neckPitch = 30, neckYaw = yaw * 0.5 }) {
  const ni = S.i('neck_01'), hi = S.i('head');
  let fk = S.fk(pose);
  const cur = V3(0, 1, 0).applyQuaternion(fk.wq[ni]);
  const np = neckPitch * DEG, ny = neckYaw * DEG;
  const dir = V3(Math.sin(ny) * Math.cos(np), Math.sin(np), Math.cos(ny) * Math.cos(np));
  const Gn = new THREE.Quaternion().setFromUnitVectors(cur, dir).multiply(fk.wq[ni]);
  pose.q[ni] = fk.wq[S.parent[ni]].clone().invert().multiply(Gn);
  fk = S.fk(pose);
  const want = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch * DEG, yaw * DEG, roll * DEG, 'ZYX')).multiply(S.restWorldQ[hi]);
  pose.q[hi] = fk.wq[ni].clone().invert().multiply(want);
}

/** Lowest point of the posed character with its extras.poseOffsets (claws, cocked head): joints + finger / toe tips. */
function lowest(S, pose) {
  const p = applyModelOffsets(S, clonePose(pose));
  const fk = S.fk(p);
  let m = Infinity, at = '';
  for (let i = 1; i < fk.wp.length; i++) {
    const y = Math.min(fk.wp[i].y, S.tail(fk, i).y);
    if (y < m) { m = y; at = S.names[i]; }
  }
  return { y: m, at };
}

/**
 * Planted-contact QA on the model skeleton: the four contact points (balls of the feet, middle knuckles) while each
 * is within 4 mm of its lowest height; slide = their mean / max horizontal speed with the treadmill speed V
 * added back (0 = locked), plus the lowest point of the character with its claws (applyModelOffsets).
 */
function contactQA(S, clip, V = 0) {
  const pts = { ball_l: [], ball_r: [], middle_01_l: [], middle_01_r: [] };
  for (const p of clip.poses) { const fk = S.fk(p); for (const k of Object.keys(pts)) pts[k].push(fk.wp[S.i(k)].clone()); }
  let sum = 0, n = 0, max = 0;
  for (const list of Object.values(pts)) {
    const lo = Math.min(...list.map((v) => v.y));
    for (let f = 1; f < list.length; f++) {
      if (list[f].y > lo + 0.004 || list[f - 1].y > lo + 0.004) continue;
      const v = Math.hypot(list[f].x - list[f - 1].x, list[f].z - list[f - 1].z + V / clip.fps) * clip.fps;
      sum += v; n++; max = Math.max(max, v);
    }
  }
  const low = clip.poses.reduce((a, p) => { const l = lowest(S, p); return l.y < a.y ? l : a; }, { y: Infinity });
  const err = S._ikErr || 0;
  S._ikErr = 0;
  return `contacts slide ${(n ? sum / n : 0).toFixed(3)} max ${max.toFixed(2)} m/s (${n} frames), planted IK miss ${(err * 100).toFixed(1)} cm  lowest ${low.y.toFixed(3)} (${low.at})`;
}

/** Catmull-Rom through keyed values (clamped ends). */
function spline1(times, vals, t) {
  const n = times.length;
  if (n === 1 || t <= times[0]) return vals[0];
  if (t >= times[n - 1]) return vals[n - 1];
  let k = 0;
  while (k < n - 2 && times[k + 1] <= t) k++;
  const i0 = Math.max(0, k - 1), i3 = Math.min(n - 1, k + 2);
  const t1 = times[k], t2 = times[k + 1], u = (t - t1) / (t2 - t1);
  const m1 = k > 0 ? (vals[k + 1] - vals[i0]) / (t2 - times[i0]) * (t2 - t1) : 0;
  const m2 = k + 2 < n ? (vals[i3] - vals[k]) / (times[i3] - t1) * (t2 - t1) : 0;
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * vals[k] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * vals[k + 1] + (u3 - u2) * m2;
}
/** Keys { t, channel: number[] } -> fn(t) -> { channel: number[] }; a channel holds its value until re-keyed. */
function keyed(keys) {
  const ks = keys.slice().sort((a, b) => a.t - b.t);
  const names = new Set(ks.flatMap((k) => Object.keys(k).filter((n) => n !== 't')));
  const ch = {};
  for (const n of names) {
    let cur = null;
    const times = [], vals = [];
    for (const k of ks) { if (k[n] !== undefined) cur = k[n].slice(); if (cur) { times.push(k.t); vals.push(cur.slice()); } }
    ch[n] = { times, vals };
  }
  return (t) => {
    const o = {};
    for (const [n, c] of Object.entries(ch)) o[n] = c.vals[0].map((_, j) => spline1(c.times, c.vals.map((v) => v[j]), t));
    return o;
  };
}

// ------------------------------------------------------------------------------------------- shared posture
// Body: pelvis joint (the clip root) behind the origin and the shoulders ahead of it, so the body is centred on the
// game's collision circle; the trunk is nearly level with the shoulders a little lower than the hips.
const BODY = { y: 0.5, z: -0.2, pitch: 94, flex: 4 };
const HAND_Y = 0.08; // middle knuckle height of a planted hand (claw tips on the floor, see the file header)
const ELBOW = (s) => V3(SIDE[s] * 0.85, 0.55, -0.3).normalize(); // elbows up, out and back (spider)
// knees splayed out over the feet, bent ~20 deg further forward under the body than straight out sideways (seen from
// behind / the side, thighs abducted to the horizontal stretched the shorts into a sheet between them)
const KNEE = (s) => V3(SIDE[s] * 0.78, -0.3, 0.6).normalize();
// in the pounce's flight the trailing legs: knees down and out
const KNEE_AIR = (s) => [SIDE[s] * 0.5, -0.82, 0.28];

/** Body offsets (degrees); the limb entries only set the FK pose under a partial IK weight (hingeIK solves them). */
function bodyOffsets({ pitch = BODY.pitch, flex = BODY.flex, yaw = 0, roll = 0, twist = 0, clavL = [0, 0, 0], clavR = [0, 0, 0] } = {}) {
  return {
    pelvis: [pitch, yaw, roll],
    spine_01: [flex, twist * 0.3, -roll * 0.3],
    spine_02: [flex, twist * 0.35, -roll * 0.35],
    spine_03: [flex * 0.8, twist * 0.35, -roll * 0.3],
    clavicle_l: clavL, clavicle_r: clavR,
    // shoulders flexed forward and the arms abducted, hips flexed and abducted, knees / elbows bent
    upperarm: [-75, 0, 28], lowerarm: [-35, 0, 0],
    thigh: [-95, 0, 42], calf: [105, 0, 0],
  };
}

export function buildQuad(skel, only) {
  const want = (n) => !only || only.includes(n);
  if (!['crawl_quad', 'crawl_quad_attack', 'pounce', 'death_quad', 'idle_quad'].some(want)) return {};
  const S = modelSkeleton(skel, 'crawler');
  const out = {};
  const finish = (c, notes) => {
    c.meta.qa = contactQA(S, c, c.loop ? (c.meta.speed || 0) * S.heightRatio : 0);
    toLibrary(skel, S, c);
    c.meta.source = 'procedural';
    c.meta.notes = notes;
    return c;
  };

  // ------------------------------------------------------------------ crawl_quad: transverse gallop
  // Footfalls (phase of the cycle): left hind 0, right hind 0.09, left fore 0.42, right fore 0.51; each limb on the
  // ground for 28 % of the cycle. Gathered flight after the fore push-off (back arched, hind feet swinging up under
  // the belly), a short extended flight before the forehands strike. Planted points move back at exactly V.
  const GP = 15 / 30; // cycle (s)
  const GV = 4.6; // treadmill speed on the crawler (m/s): its run speed, so the game plays the loop at ~1x
  const LIMBS = {
    hl: { td: 0.0, duty: 0.28, zTD: 0.1, x: 0.37, hind: true, s: 'l' },
    hr: { td: 0.09, duty: 0.28, zTD: 0.1, x: 0.37, hind: true, s: 'r' },
    fl: { td: 0.42, duty: 0.28, zTD: 0.6, x: 0.31, hind: false, s: 'l' },
    fr: { td: 0.51, duty: 0.28, zTD: 0.6, x: 0.31, hind: false, s: 'r' },
  };
  /** Limb state at cycle phase ph: contact point + foot / hand attitude. */
  const limbAt = (L, ph, V = GV, P = GP) => {
    const sweep = V * L.duty * P;
    const zLO = L.zTD - sweep;
    const d = wrap01(ph - L.td);
    const sg = SIDE[L.s];
    if (d < L.duty) {
      const u = d / L.duty;
      const p = V3(sg * L.x, L.hind ? S.restWorldP[S.i(`ball_${L.s}`)].y + 0.004 : HAND_Y, L.zTD - sweep * u);
      // heel rises through the stance (rolling onto the ball), the hand's fingers flatten then dig in
      return L.hind ? { p, heel: lerp(28, 62, smooth(u)), out: 18, toe: lerp(0, 8, u) } : { p, pitch: lerp(-2, 10, u), out: 24, roll: 0 };
    }
    const u = (d - L.duty) / (1 - L.duty);
    const fwd = smooth(u);
    if (L.hind) {
      // tucked forward swing: toe trails, knee drives up and out, the foot reaches and drops onto the ball
      const lift = 0.08 * Math.sin(Math.PI * Math.min(1, u * 1.08)) ** 0.9;
      const p = V3(sg * (L.x + 0.05 * Math.sin(Math.PI * u)), S.restWorldP[S.i(`ball_${L.s}`)].y + 0.004 + lift, zLO + sweep * fwd);
      return { p, heel: lerp(62, 28, smooth(u * 1.2)) + 18 * Math.sin(Math.PI * u) * (1 - u), out: 18, toe: lerp(8, -6, u) };
    }
    // forelimb: snaps up high (elbow up), swings forward and strikes down claws first
    const lift = 0.11 * Math.sin(Math.PI * clamp01(u ** 1.25));
    const reach = 0.05 * Math.sin(Math.PI * clamp01((u - 0.45) / 0.55));
    const p = V3(sg * (L.x + 0.07 * Math.sin(Math.PI * u)), HAND_Y + lift, zLO + sweep * fwd + reach);
    return { p, pitch: lerp(16, 4, smooth(u)) + 45 * Math.sin(Math.PI * u), out: 24 - 10 * Math.sin(Math.PI * u), roll: 10 * Math.sin(Math.PI * u) };
  };
  const gallopPose = (t, { V = GV, P = GP, heading = 0 } = {}) => {
    const ph = wrap01(t / P);
    const a = ph * TAU;
    const pose = S.restPose();
    const reachL = Math.cos(TAU * (ph - 0.55)), reachR = Math.cos(TAU * (ph - 0.64)); // + = that forehand forward
    applyOffsets(S, pose, bodyOffsets({
      pitch: BODY.pitch + 3 * Math.cos(TAU * (ph - 0.5)),
      flex: BODY.flex + 5 * Math.cos(a) + 1.5 * Math.cos(2 * a - 1),
      yaw: 3 * Math.sin(a - 0.6), roll: 4 * Math.sin(a - 1.1), twist: -5 * Math.sin(a - 0.4),
      clavL: [0, -9 * reachL, 2 + 4 * Math.max(0, -reachL)], clavR: [0, -9 * reachR, 2 + 4 * Math.max(0, -reachR)],
    }));
    pose.root.set(0.012 * Math.sin(a - 0.4), BODY.y + 0.032 * Math.cos(TAU * (ph - 0.9)) + 0.01 * Math.cos(2 * TAU * (ph - 0.42)),
      BODY.z + 0.03 * Math.sin(TAU * (ph - 0.1)));
    let fk = S.fk(pose);
    for (const L of Object.values(LIMBS)) {
      const st = limbAt(L, ph, V, P);
      if (L.hind) solveFoot(S, pose, L.s, { ...st, pole: KNEE(L.s) }, fk);
      else solveHand(S, pose, L.s, { ...st, pole: ELBOW(L.s) }, fk);
      fk = S.fk(pose);
    }
    aimHead(S, pose, { pitch: -10 + 3 * Math.sin(a + 0.5) + 2 * loopNoise(t, P * 4, 3, 41), yaw: heading + 4 * loopNoise(t, P * 4, 2, 43), neckPitch: 32 + 4 * Math.sin(a + 0.3) });
    return pose;
  };
  if (want('crawl_quad')) {
    const n = Math.round(GP * 30);
    const poses = [];
    for (let f = 0; f <= n; f++) poses.push(gallopPose(f / 30));
    poses[n] = clonePose(poses[0]);
    const c = { name: 'crawl_quad', fps: 30, poses, loop: true, meta: { speed: GV / S.heightRatio } };
    out.crawl_quad = finish(c, 'keyframed/IK on the crawler skeleton: fast spider-like transverse gallop on hands and feet (elbows up, knees splayed, low slung spine flexing with the stride, head craned up and held steady); planted hands / feet move back at exactly the treadmill speed');
  }

  // ------------------------------------------------------------------ keyed one-shots
  // Keys hold world-space targets (in place, character facing +Z): root = pelvis position, body = [pitch, flex, yaw,
  // roll, twist], head = [pitch, yaw, roll, neckPitch], hL / hR = middle knuckle [x, y, z, fingerPitch, out, roll],
  // fL / fR = ball of the foot [x, y, z, heel, out, toe], eL / eR / kL / kR = elbow / knee poles, clL / clR = clavicle
  // offsets. Channels are cumulative (held until re-keyed) and Catmull-Rom interpolated.
  const BY = S.restWorldP[S.i('ball_l')].y + 0.004;
  const STANCE = {
    root: [0, BODY.y, BODY.z], body: [BODY.pitch, BODY.flex, 0, 0, 0], head: [-10, 0, 0, 32],
    hL: [0.31, HAND_Y, 0.42, 4, 24, 0], hR: [-0.31, HAND_Y, 0.42, 4, 24, 0],
    fL: [0.35, BY, -0.18, 34, 18, 0], fR: [-0.35, BY, -0.18, 34, 18, 0],
    eL: ELBOW('l').toArray(), eR: ELBOW('r').toArray(), kL: KNEE('l').toArray(), kR: KNEE('r').toArray(),
    clL: [0, 0, 3], clR: [0, 0, 3],
  };
  const keyedPose = (k) => {
    const pose = S.restPose();
    const [pitch, flex, yaw, roll, twist] = k.body;
    applyOffsets(S, pose, bodyOffsets({ pitch, flex, yaw, roll, twist, clavL: k.clL, clavR: k.clR }));
    pose.root.set(...k.root);
    let fk = S.fk(pose);
    for (const s of ['l', 'r']) {
      const U = s.toUpperCase();
      const f = k['f' + U];
      solveFoot(S, pose, s, { p: V3(f[0], f[1], f[2]), heel: f[3], out: f[4], toe: f[5], pole: V3(...k['k' + U]).normalize() }, fk);
      fk = S.fk(pose);
      const h = k['h' + U];
      solveHand(S, pose, s, { p: V3(h[0], h[1], h[2]), pitch: h[3], out: h[4], roll: h[5], pole: V3(...k['e' + U]).normalize() }, fk);
      fk = S.fk(pose);
    }
    aimHead(S, pose, { pitch: k.head[0], yaw: k.head[1], roll: k.head[2], neckPitch: k.head[3] });
    return pose;
  };
  const keyedClip = (name, dur, keys, layer = null) => {
    const tr = keyed([{ t: 0, ...STANCE }, ...keys]);
    const poses = [];
    for (let f = 0; f <= Math.round(dur * 30); f++) {
      const t = f / 30, k = tr(t);
      if (layer) layer(t, k);
      poses.push(keyedPose(k));
    }
    return { name, fps: 30, poses, loop: false, meta: {} };
  };

  // ------------------------------------------------------------------ crawl_quad_attack: lunging swipe from all fours
  if (want('crawl_quad_attack')) {
    const c = keyedClip('crawl_quad_attack', 1.2, [
      // rock back onto the haunches, the right claw comes up off the floor
      { t: 0.12, root: [0, 0.45, -0.3], body: [90, 2, 0, 0, -4], head: [-12, -6, 0, 38], hR: [-0.3, 0.2, 0.3, 55, 10, 25], fL: [0.35, BY, -0.18, 18, 18, 0], fR: [-0.35, BY, -0.18, 18, 18, 0] },
      // wind-up: claw raised high out to the side behind the shoulder, chest low, eyes on the target
      { t: 0.27, root: [0.02, 0.43, -0.33], body: [88, 1, -4, 3, -12], head: [-16, -4, 0, 40], hR: [-0.46, 0.62, 0.08, -25, -35, 70], eR: [-0.6, 0.7, -0.4], clR: [0, 8, 10] },
      // lunge: rears up off the hind legs and the left arm, surges forward, the claw rakes across in front
      { t: 0.3, hL: [0.31, HAND_Y, 0.42, 4, 24, 0] },
      { t: 0.4, root: [0, 0.6, 0.02], body: [80, -6, 4, -4, 14], head: [-28, 8, 0, 48], hR: [-0.22, 0.66, 0.78, 5, -10, 75], hL: [0.3, 0.26, 0.56, 30, 20, 10], fL: [0.35, BY, -0.18, 62, 18, 6], fR: [-0.35, BY, -0.18, 62, 18, 6], clR: [0, -12, 6] },
      { t: 0.48, hR: [0.12, 0.52, 0.9, 25, -45, 85], head: [-20, 14, 6, 46] },
      // follow-through low across to the left, the body drops back onto the left arm
      { t: 0.6, root: [0, 0.52, -0.06], body: [88, 2, 6, -6, -8], head: [-12, 6, 0, 36], hR: [0.36, 0.26, 0.6, 45, -60, 55], hL: [0.31, HAND_Y, 0.5, 6, 24, 0], eR: [-0.8, 0.5, -0.2], clR: [0, -6, 4] },
      // the claw comes back round and re-plants, settle onto all fours
      { t: 0.82, root: [0, 0.49, -0.16], body: [94, 4, 0, 0, 0], head: [-10, 0, 0, 32], hL: [0.31, HAND_Y, 0.44, 4, 24, 0], hR: [-0.3, HAND_Y + 0.06, 0.44, 30, 20, 10], eR: ELBOW('r').toArray(), clR: [0, 0, 3], fL: [0.35, BY, -0.18, 34, 18, 0], fR: [-0.35, BY, -0.18, 34, 18, 0] },
      { t: 0.92, hR: [-0.31, HAND_Y, 0.42, 4, 24, 0] },
      { t: 1.2, ...STANCE },
    ]);
    c.meta.events = { hit: 0.48 };
    out.crawl_quad_attack = finish(c, 'keyframed/IK on the crawler skeleton: from all fours rocks back, raises the right claw, rears up off the hands and lunges forward raking across in front at thigh-chest height, drops back onto the left claw and re-plants (in place)');
  }

  // ------------------------------------------------------------------ pounce: crouch-load, long low leap, land on all fours
  if (want('pounce')) {
    const c = keyedClip('pounce', 1.15, [
      // load: chest drops to the floor, hind feet coil up under the hips, elbows high, head low on the target
      { t: 0.1, root: [0, 0.42, -0.26], body: [99, 10, 0, 0, 0], head: [-14, 0, 0, 38], fL: [0.33, BY, -0.12, 24, 18, 0], fR: [-0.33, BY, -0.12, 24, 18, 0] },
      { t: 0.18, root: [0, 0.36, -0.3], body: [101, 12, 0, 0, 0], head: [-16, 0, 0, 40], hL: [0.3, HAND_Y, 0.38, 6, 24, 0], hR: [-0.3, HAND_Y, 0.38, 6, 24, 0], fL: [0.33, BY, -0.08, 22, 18, 0], fR: [-0.33, BY, -0.08, 22, 18, 0] },
      // explosive extension: the hind legs drive back, the arms fire forward (takeoff)
      { t: 0.24, root: [0, 0.5, -0.06], body: [90, -6, 0, 0, 0], head: [-18, 0, 0, 36], hL: [0.3, 0.26, 0.62, -10, 18, 10], hR: [-0.3, 0.26, 0.62, -10, 18, 10], fL: [0.3, BY + 0.02, -0.5, 72, 14, 10], fR: [-0.3, BY + 0.02, -0.5, 72, 14, 10], kL: KNEE_AIR('l'), kR: KNEE_AIR('r') },
      // flight: stretched long and low, claws spread forward, legs trailing with pointed feet
      { t: 0.34, root: [0, 0.5, 0.0], body: [86, -9, 0, 0, 0], head: [-22, 0, 0, 40], hL: [0.3, 0.42, 0.8, -25, 14, 20], hR: [-0.3, 0.42, 0.8, -25, 14, 20], fL: [0.26, 0.22, -0.74, 85, 10, 0], fR: [-0.26, 0.24, -0.72, 85, 10, 0] },
      { t: 0.52, root: [0, 0.48, -0.02], body: [90, -4, 0, 0, 0], head: [-18, 0, 0, 38], hL: [0.32, 0.28, 0.82, 0, 20, 15], hR: [-0.32, 0.3, 0.8, 0, 20, 15], fL: [0.3, 0.24, -0.5, 70, 14, 0], fR: [-0.3, 0.24, -0.5, 70, 14, 0] },
      // claws strike the floor first (land), the chest absorbs down between the elbows, the body runs over the hands
      { t: 0.7, root: [0, 0.44, -0.04], body: [97, 4, 0, 0, 0], head: [-12, 0, 0, 30], hL: [0.33, HAND_Y, 0.74, 8, 26, 0], hR: [-0.33, HAND_Y, 0.74, 8, 26, 0], fL: [0.35, 0.14, -0.3, 45, 18, 0], fR: [-0.35, 0.14, -0.3, 45, 18, 0], kL: KNEE('l').toArray(), kR: KNEE('r').toArray() },
      { t: 0.79, root: [0, 0.4, -0.1], body: [100, 9, 0, 0, 0], head: [-8, 0, 0, 26], hL: [0.33, HAND_Y, 0.52, 10, 26, 0], hR: [-0.33, HAND_Y, 0.52, 10, 26, 0], fL: [0.35, BY, -0.16, 30, 18, 0], fR: [-0.35, BY, -0.16, 30, 18, 0] },
      { t: 0.92, root: [0, 0.48, -0.18], body: [95, 5, 0, 0, 0], head: [-10, 0, 0, 31], hL: [0.31, HAND_Y, 0.44, 5, 24, 0], hR: [-0.31, HAND_Y, 0.44, 5, 24, 0] },
      { t: 1.15, ...STANCE },
    ]);
    c.meta.events = { takeoff: 0.24, land: 0.7 };
    out.pounce = finish(c, 'keyframed/IK on the crawler skeleton: crouch-load (chest to the floor, hind feet coiled), explosive spring, long low flight stretched out with the claws forward and legs trailing, lands claws first and absorbs onto all fours. In place: the game carries the zombie between takeoff and land');
  }

  // ------------------------------------------------------------------ death_quad: collapse face-down from all fours
  if (want('death_quad')) {
    const c = keyedClip('death_quad', 1.6, [
      // the hit jolts the head back and the body up
      { t: 0.08, root: [0, 0.54, -0.22], body: [91, -5, 0, 0, 0], head: [-34, 0, 12, 46] },
      // forelimbs buckle outwards, the chest drops, the head starts to fall
      { t: 0.3, root: [0.03, 0.4, -0.18], body: [104, 10, 2, 4, 0], head: [12, 10, 20, 8], hL: [0.42, HAND_Y, 0.44, 10, 40, 0], hR: [-0.44, HAND_Y, 0.4, 10, 40, 0], eL: [0.9, 0.4, 0], eR: [-0.9, 0.4, 0] },
      // chest and face hit the floor, the hips still up
      { t: 0.48, root: [0.05, 0.34, -0.14], body: [110, 8, 4, 8, 0], head: [72, 0, 66, 2], hL: [0.5, 0.075, 0.38, -20, 60, -40], hR: [-0.52, 0.075, 0.32, -20, 60, -40], clL: [0, 6, -6], clR: [0, 6, -6] },
      // the hind legs slide out and the hips collapse onto the floor, rolling a little to the left
      { t: 0.74, root: [0.1, 0.17, -0.2], body: [94, 2, 4, 16, 0], head: [86, 0, 84, 4], fL: [0.4, 0.05, -0.8, 80, 25, 0], fR: [-0.22, 0.05, -0.86, 82, 8, 0], kL: [1, 0.2, 0.2], kR: [-1, 0.2, 0.2] },
      { t: 0.9, root: [0.11, 0.15, -0.21], body: [91, 0, 4, 12, 0], hL: [0.56, 0.075, 0.28, -20, 70, -50], hR: [-0.5, 0.075, 0.5, -10, 40, -40], fL: [0.42, 0.05, -0.84, 84, 28, 0], fR: [-0.2, 0.05, -0.9, 85, 8, 0] },
      // last twitch of the right claw, then still
      { t: 1.18, hR: [-0.5, 0.075, 0.5, -10, 40, -40] },
      { t: 1.26, hR: [-0.52, 0.12, 0.54, 20, 30, -20] },
      { t: 1.42, hR: [-0.5, 0.075, 0.5, -10, 40, -40], root: [0.11, 0.15, -0.21] },
      { t: 1.6, root: [0.11, 0.15, -0.21] },
    ]);
    c.meta.events = { ground: 0.48 };
    out.death_quad = finish(c, 'keyframed/IK on the crawler skeleton: jolt, the forelimbs buckle outwards, chest and face hit the floor, the hind legs slide out and the hips drop; ends lying face-down with the limbs splayed (a last twitch of the right claw)');
  }
  // ------------------------------------------------------------------ idle_quad: crouched on all fours, breathing, searching
  if (want('idle_quad')) {
    const P = 2.4;
    const c = keyedClip('idle_quad', P, [
      { t: 0.3, root: [0.01, BODY.y - 0.008, BODY.z], body: [BODY.pitch, BODY.flex + 1.5, 0, 0, 0] },
      { t: 0.6, root: [0.02, BODY.y + 0.004, BODY.z], body: [BODY.pitch, BODY.flex - 1, 2, 1, 3], head: [-12, 24, 0, 34] },
      { t: 0.95, head: [-13, 26, 0, 35] },
      // a sudden jerk of the head the other way, the right claw flexes off the floor and digs back in
      { t: 1.05, head: [-6, -8, 10, 30], hR: [-0.31, HAND_Y + 0.04, 0.45, 25, 24, 10] },
      { t: 1.3, root: [-0.01, BODY.y - 0.008, BODY.z], body: [BODY.pitch, BODY.flex + 1.5, -2, -1, -3], hR: [-0.31, HAND_Y, 0.44, 4, 24, 0] },
      { t: 1.6, root: [-0.02, BODY.y + 0.004, BODY.z], head: [-14, -24, 0, 34] },
      { t: 1.95, head: [-13, -22, 0, 33], body: [BODY.pitch, BODY.flex - 1, 0, 0, 0] },
      { t: P, ...STANCE },
    ]);
    c.loop = true;
    c.poses[c.poses.length - 1] = clonePose(c.poses[0]);
    c.meta.speed = 0;
    out.idle_quad = finish(c, 'keyframed/IK on the crawler skeleton: crouched on all fours breathing, the head searching left / right with a sudden jerk, a claw flexing off the floor (loop; the crawler when it stands still)');
  }

  return out;
}

export { lowest, solveHand, solveFoot, aimHead, bodyOffsets };
