// soldier AnimationClips, authored directly on the soldier's own game_engine skeleton (so remote.js can play them
// without retargeting). Legs / torso come from CC0 Quaternius UAL1/UAL2 mocap (retargeted with the zombie anim tools,
// read-only imports); the rifle is a rigid "gun frame" carried by the chest (or the pelvis), and both arms are solved
// with two-bone IK onto it: the right wrist onto the pistol grip through the exported hand socket, the left wrist
// onto the handguard (or the reload targets: magazine, chest pouch, charging handle).
//
// Gun frame: origin = the weapon's S_grip_r point, axes = weapon space (x = right / ejection side, y = up,
// -z = muzzle). The socket written to extras.handSocket is this frame expressed in hand_r's local space, so
// remote.js places any weapon GLB with: gun.quaternion = socket.quaternion;
// gun.position = socket.position - S_grip_r.position.applyQuaternion(gun.quaternion).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { PosedSet, insideDepth, loadWeapon, toGun } from './collide.mjs';
import { Skeleton as AnimSkeleton, clonePose } from '../zombies/anim/skeleton.mjs';
import { fromUAL, ualLoop } from '../zombies/anim/lib.mjs';
import { applyOffsets, setOffsets, loopNoise, DEG } from '../zombies/anim/pose.mjs';
import { fixSigns, crop, makeLoop, smooth } from '../zombies/anim/clip.mjs';
import { twoBoneIK, ARM, lockFeet, groundFeet, clampFeetAboveGround, groundAll, strideWarp, kneePole } from '../zombies/anim/ik.mjs';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Q = () => new THREE.Quaternion();
const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The anim tools' Skeleton API on top of the lib skeleton of a built human (same bone order as the GLB skin). */
export function animSkeleton(human) {
  const bones = human.skeleton.bones;
  const sk = Object.create(AnimSkeleton.prototype);
  sk.names = bones.map((b) => b.name);
  sk.index = new Map(sk.names.map((n, i) => [n, i]));
  sk.parent = bones.map((b) => b.parent);
  sk.restWorldQ = bones.map((b) => b.world.clone());
  sk.restWorldP = bones.map((b) => b.head.clone());
  sk.tailWorldP = bones.map((b) => b.tail.clone());
  sk.restLocalQ = bones.map((b) => b.localQuat.clone());
  sk.restLocalP = bones.map((b) => b.localPos.clone());
  sk.length = bones.map((b) => b.head.distanceTo(b.tail));
  sk.children = sk.names.map((_, i) => sk.parent.map((p, k) => (p === i ? k : -1)).filter((k) => k >= 0));
  sk.boneIndex = bones.map((_, i) => i);
  return sk;
}

// ------------------------------------------------------------------------------------------------ collision QA
const WEAPON_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'game', 'assets', 'weapons');
const weaponCache = new Map();
/** Rifle-class weapon GLBs (rifles / SMGs held with the rifle clips), loaded once. */
export function rifleModels(ids = ['akm', 'm4']) {
  return ids.filter((id) => fs.existsSync(path.join(WEAPON_DIR, id + '.glb'))).map((id) => {
    if (!weaponCache.has(id)) weaponCache.set(id, { id, ...loadWeapon(path.join(WEAPON_DIR, id + '.glb')) });
    return weaponCache.get(id);
  });
}
/** Weapon-space sample points of the stock (everything behind `z0`), thinned to one per `cell`. */
export function stockPoints(models, z0 = 0.06, cell = 0.012) {
  const seen = new Set(), out = [];
  for (const m of models) {
    const v = m.verts;
    for (let i = 0; i < v.length; i += 3) {
      if (v[i + 2] < z0) continue;
      const k = `${Math.round(v[i] / cell)},${Math.round(v[i + 1] / cell)},${Math.round(v[i + 2] / cell)}`;
      if (seen.has(k)) continue;
      seen.add(k); out.push(new THREE.Vector3(v[i], v[i + 1], v[i + 2]));
    }
  }
  return out;
}
const anySeg = (segs) => (r, a, b, c) => segs.includes(r.seg[a]) || segs.includes(r.seg[b]) || segs.includes(r.seg[c]);
// triangles entirely in these segments (boundary triangles towards the arms stretch with the pre-IK mocap arm pose)
const allSeg = (segs) => (r, a, b, c) => segs.includes(r.seg[a]) && segs.includes(r.seg[b]) && segs.includes(r.seg[c]);

/**
 * Per clip / weapon: deepest stock point inside the torso + gear (+ upper arms), and deepest head / helmet vertex
 * inside the weapon (cheek weld). gunFn(fk) -> weapon frame {p, q} (origin at the grip point).
 */
function collisionReport(S, res, clips, gunFn, o = {}) {
  const rend = Object.fromEntries(res.parts.map((p) => [p.name, p.toRender()]));
  const torso = new PosedSet(S, ['body', 'uniform', 'gear'].map((n) => rend[n]), allSeg([0]));
  const arms = new PosedSet(S, ['body', 'uniform'].map((n) => rend[n]), (r, a, b, c) => [2, 4].includes(r.seg[a]) && [2, 4].includes(r.seg[b]) && [2, 4].includes(r.seg[c]));
  const head = new PosedSet(S, ['body', 'gear', 'eyes'].map((n) => rend[n]), (r, a, b, c) => r.seg[a] === 1 && r.seg[b] === 1 && r.seg[c] === 1);
  const whole = o.sling ? new PosedSet(S, ['body', 'uniform', 'gear', 'boots'].map((n) => rend[n]).filter(Boolean), (r, a, b, c) => ![3, 5].includes(r.seg[a])) : null;
  const models = rifleModels(o.weapons || ['akm', 'm4', 'mp5', 'ump', 'vector', 'uzi']);
  const stock = models.map((m) => ({ m, pts: stockPoints([m], 0.06, 0.011), all: stockPoints([m], -1, 0.025) }));
  // inside: the first hits along dir and against it both leave a surface (a single ray can escape through the open
  // parts of the torso: shirt cut away under the plates, arm seams); depth = exit distance along dir
  const depthIn = (set, p, dir, back) => {
    const hf = set.first(p, dir, 0.6);
    if (!hf || !hf.back) return 0;
    const hb = set.first(p, back, 0.6);
    return hb && hb.back ? hf.dist : 0;
  };
  const rows = {};
  const W = V3(), Gl = V3();
  const chestQ = (fk) => fk.wq[S.i('spine_03')].clone().multiply(S.restWorldQ[S.i('spine_03')].clone().invert());
  for (const c of clips) {
    if (c.name === 'revive' && whole) {
      // slung rifle (whole weapon) vs the whole body except the hands
      const r = rows[c.name] = {};
      for (const { m } of stock) r[m.id] = { torso: 0, arm: 0, head: 0, slung: 0, at: null };
      c.poses.forEach((p, f) => {
        const fk = S.fk(p);
        const G = o.sling(fk);
        whole.pose(fk);
        const out = V3(0, 0, -1).applyQuaternion(chestQ(fk)), inw = out.clone().negate();
        for (const { m, all } of stock) for (const s of all) {
          W.copy(s).applyQuaternion(G.q).add(G.p);
          const d = depthIn(whole, W, out, inw);
          if (d > r[m.id].slung) { r[m.id].slung = d; r[m.id].at = [f, +(s.z).toFixed(2)]; }
        }
      });
      continue;
    }
    if (!/rifle|crouch/.test(c.name) || c.name === 'run') continue;
    const r = rows[c.name] = {};
    for (const { m } of stock) r[m.id] = { torso: 0, arm: 0, head: 0, at: null };
    c.poses.forEach((p, f) => {
      const fk = S.fk(p);
      const G = gunFn(fk);
      torso.pose(fk); arms.pose(fk);
      const fw = V3(0, 0, 1).applyQuaternion(chestQ(fk)), rt = V3(-1, 0, 0).applyQuaternion(chestQ(fk)), up = V3(0, 1, 0);
      const aim = /^(aim|fire)_/.test(c.name);
      for (const { m, pts } of stock) {
        if (aim) head.pose(o.headDrop ? S.fk(o.headDrop(p, m.id)) : fk);
        const e = r[m.id];
        const bw = fw.clone().negate();
        for (const s of pts) {
          W.copy(s).applyQuaternion(G.q).add(G.p);
          const d = depthIn(torso, W, fw, bw);
          if (d > e.torso) { e.torso = d; e.at = [f, +(s.z).toFixed(2)]; }
          e.arm = Math.max(e.arm, depthIn(arms, W, fw, bw));
        }
        if (aim) {
          // stock points inside the head / neck surface (lateral rays in weapon space, both must exit)
          const gx = V3(1, 0, 0).applyQuaternion(G.q), gxn = gx.clone().negate();
          for (const s2 of pts) {
            W.copy(s2).applyQuaternion(G.q).add(G.p);
            const a = head.first(W, gx, 0.3);
            if (!a || !a.back) continue;
            const b = head.first(W, gxn, 0.3);
            if (b && b.back) { const d = Math.min(a.dist, b.dist); if (d > e.head) { e.head = d; e.headAt = [f, 'stock', +(s2.z).toFixed(2)]; } }
          }
          // head / helmet vertices inside the weapon: exit distance (up / right / left in weapon space)
          for (let v = 0; v < head.count; v++) {
            toGun(G, head.vertex(v, Gl), Gl);
            if (Gl.z < -0.25 || Gl.z > 0.32 || Math.abs(Gl.x) > 0.06 || Gl.y < -0.2 || Gl.y > 0.2) continue;
            const h = m.first(Gl, V3(0, 1, 0), 0.4);
            if (!h || !h.back) continue;
            const h2 = m.first(Gl, V3(0, -1, 0), 0.4);
            if (!h2 || !h2.back) continue;
            let d = h.dist;
            for (const dir of [V3(1, 0, 0), V3(-1, 0, 0)]) { const k = m.first(Gl, dir, 0.2); if (k && k.back) d = Math.min(d, k.dist); }
            if (d > e.head) { e.head = d; e.headAt = [f, ...Gl.toArray().map((x) => +x.toFixed(3)), 'rest', ...Array.from(head.rest.slice(v * 3, v * 3 + 3), (x) => +x.toFixed(3))]; }
          }
        }
      }
    });
  }
  const fmt = (v) => (v * 100).toFixed(1);
  console.log('  collision (cm): clip / weapon: stock in torso+gear [frame, stock z], stock in upper arms, head in weapon');
  for (const [n, r] of Object.entries(rows)) console.log(`    ${n.padEnd(13)} ` + Object.entries(r).map(([id, e]) => (e.slung !== undefined ? `${id}: slung ${fmt(e.slung)}${e.at ? ` [${e.at}]` : ''}` : `${id}: ${fmt(e.torso)}${e.at ? ` [${e.at}]` : ''} / ${fmt(e.arm)} / ${fmt(e.head)}${e.headAt ? ` [${e.headAt}]` : ''}`)).join('   '));
  return rows;
}

/** Rotation taking basis (a1, a2) onto (b1, b2) (each pair orthonormalised, a1 / b1 exact). */
function basisQ(a1, a2, b1, b2) {
  const m = (x, y) => {
    const X = x.clone().normalize();
    const Y = y.clone().addScaledVector(X, -y.dot(X)).normalize();
    const Z = X.clone().cross(Y);
    return new THREE.Matrix4().makeBasis(X, Y, Z);
  };
  const A = m(a1, a2), B = m(b1, b2);
  return Q().setFromRotationMatrix(B.multiply(A.transpose()));
}

/** Gun frame from the butt-plate position, muzzle direction and cant (deg, + = top rolls to the shooter's right). */
const BUTT = V3(0, 0.03, 0.28); // butt-plate centre relative to the grip point, weapon space (AK / M4 class)
function gunFrame(butt, dir, cant = 0) {
  const d = dir.clone().normalize();
  const up = V3(0, 1, 0).applyAxisAngle(d, -cant * DEG);
  const x = d.clone().cross(up).normalize();
  const y = d.clone().negate().cross(x).normalize();
  const z = d.clone().negate();
  const q = Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  return { p: butt.clone().sub(BUTT.clone().applyQuaternion(q)), q };
}
const frameMul = (a, b) => ({ p: b.p.clone().applyQuaternion(a.q).add(a.p), q: a.q.clone().multiply(b.q) });
const frameInv = (a) => { const qi = a.q.clone().invert(); return { p: a.p.clone().negate().applyQuaternion(qi), q: qi }; };
const frameLerp = (a, b, t) => ({ p: a.p.clone().lerp(b.p, t), q: a.q.clone().slerp(b.q, t) });

export function buildClips(res) {
  const h = res.human;
  const skel = animSkeleton(h);
  const S = skel;
  const I = (n) => skel.i(n);
  const fps = 30;
  const strict = process.env.SOLDIER_CHECK !== 'warn';
  // dev: SOLDIER_ONLY=aim_rifle,fire_rifle builds only those clips (tuning runs)
  const only = process.env.SOLDIER_ONLY ? new Set(process.env.SOLDIER_ONLY.split(',')) : null;
  const want = (n) => !only || only.has(n);
  const P = (k, d) => (process.env['SOLDIER_' + k] !== undefined ? +process.env['SOLDIER_' + k] : d); // dev tuning overrides

  // ------------------------------------------------------------------------------------------ hands
  // hand-local "finger direction" (wrist -> middle knuckle) and palm normal (+z local for both hands)
  const handLocal = {};
  for (const s of ['l', 'r']) {
    const hb = I(`hand_${s}`), mk = I(`middle_01_${s}`);
    const qi = S.restWorldQ[hb].clone().invert();
    const F = S.restWorldP[mk].clone().sub(S.restWorldP[hb]).applyQuaternion(qi).normalize();
    handLocal[s] = { F, N: V3(0, 0, 1) };
  }
  // Grips in weapon space (grip-point origin). Tuned by eye on screenshots (see captures/soldier/).
  const GRIP_R = { F: V3(-0.3, 0.3, -0.9), N: V3(-1, 0.05, 0.15), palm: [0.026, 0.052] };
  const GRIPL = {
    handguard: { at: V3(0, 0.06, -0.29), F: V3(0.7, 0.3, -0.65), N: V3(0.25, 1, 0.05), palm: [0.032, 0.046] },
    mag: { at: V3(0.0, -0.125, -0.16), F: V3(0.75, 0.25, -0.6), N: V3(0.95, 0, 0.2), palm: [0.024, 0.05] },
    charge: { at: V3(0.032, 0.09, -0.16), F: V3(0.2, 0.2, -0.95), N: V3(-0.9, 0.1, 0.3), palm: [0.02, 0.06] },
  };
  /** Hand frame (wrist) in weapon space for a grip definition at point `at`. */
  const handInGun = (s, g, at = g.at || V3()) => {
    const q = basisQ(handLocal[s].F, handLocal[s].N, g.F, g.N);
    const F = g.F.clone().normalize(), Nn = g.N.clone().normalize();
    const p = at.clone().addScaledVector(Nn, -g.palm[0]).addScaledVector(F, -g.palm[1]);
    return { p, q };
  };
  /** World wrist frame for a contact point, finger direction F and palm normal N (world). */
  const handWorld = (s, at, F, N, palm = [0.025, 0.05]) => {
    const q = basisQ(handLocal[s].F, handLocal[s].N, F, N);
    const f = F.clone().normalize(), n = N.clone().addScaledVector(f, -N.dot(f)).normalize();
    return { p: at.clone().addScaledVector(n, -palm[0]).addScaledVector(f, -palm[1]), q };
  };
  const HR = handInGun('r', GRIP_R);
  const socket = frameInv(HR); // gun frame in hand_r space
  const HL = handInGun('l', GRIPL.handguard);
  /** Support hand on the handguard at weapon z = s (the short arms slide it back towards the magwell). */
  const leftAt = (s) => handInGun('l', GRIPL.handguard, V3(0, 0.06, s));
  // generic muzzle points from the grip (weapon space): AK / M4 class rifle, service pistol
  const MUZZLE = { rifle: V3(0, 0.078, -0.62), pistol: V3(0, 0.07, -0.17) };
  const hR = I('hand_r');
  /** Weapon frame carried by hand_r in a FK result, its muzzle / butt, lowest of the two and the bore direction. */
  const gunPoints = (fk, pistol = false) => {
    const G = frameMul({ p: fk.wp[hR], q: fk.wq[hR] }, socket);
    const m = frameMul(G, { p: pistol ? MUZZLE.pistol : MUZZLE.rifle, q: Q() }).p;
    const b = frameMul(G, { p: pistol ? V3(0, -0.11, 0.02) : BUTT, q: Q() }).p;
    return { G, muzzle: m, butt: b, low: Math.min(m.y, b.y), dir: V3(0, 0, -1).applyQuaternion(G.q) };
  };

  // finger poses (deg per joint, about local x = curl towards the palm)
  const FINGERS = {
    grip: { thumb: [10, 25, 20], index: [30, 40, 25], middle: [70, 85, 45], ring: [75, 85, 45], pinky: [80, 80, 40] },
    trigger: { thumb: [10, 25, 20], index: [15, 30, 20], middle: [70, 85, 45], ring: [75, 85, 45], pinky: [80, 80, 40] },
    cradle: { thumb: [5, 10, 10], index: [35, 40, 25], middle: [40, 45, 30], ring: [45, 50, 30], pinky: [50, 50, 30] },
    grab: { thumb: [15, 25, 20], index: [45, 55, 35], middle: [50, 60, 35], ring: [55, 60, 35], pinky: [55, 60, 35] },
    relaxed: { thumb: [5, 10, 10], index: [15, 20, 15], middle: [20, 25, 15], ring: [25, 25, 15], pinky: [25, 25, 15] },
    press: { thumb: [0, 5, 5], index: [8, 10, 8], middle: [10, 12, 8], ring: [12, 12, 8], pinky: [14, 12, 8] },
    open: { thumb: [0, 0, 0], index: [5, 5, 5], middle: [5, 5, 5], ring: [8, 5, 5], pinky: [10, 5, 5] },
  };
  const setFingers = (pose, s, name, w = 1, from = null) => {
    const a = FINGERS[name], b = from ? FINGERS[from] : null;
    for (const fn of ['thumb', 'index', 'middle', 'ring', 'pinky']) for (let k = 1; k <= 3; k++) {
      const i = I(`${fn}_0${k}_${s}`);
      const ang = (b ? b[fn][k - 1] + (a[fn][k - 1] - b[fn][k - 1]) * w : a[fn][k - 1] * w) * DEG;
      pose.q[i] = S.restLocalQ[i].clone().multiply(Q().setFromAxisAngle(V3(1, 0, 0), ang));
    }
  };

  // ------------------------------------------------------------------------------------------ body landmarks
  const PF = res.PF, plate = res.plate;
  const chestZ = (x, y) => PF.depth(x, y) + plate.th; // front face of the plate carrier (rest)
  const sp3 = I('spine_03'), pel = I('pelvis'), uaR = I('upperarm_r'), uaL = I('upperarm_l');
  const chestRestQ = S.restWorldQ[sp3].clone();
  const pelvisRest = { p: S.restWorldP[pel].clone(), q: S.restWorldQ[pel].clone() };
  const chestRot = (fk) => fk.wq[sp3].clone().multiply(chestRestQ.clone().invert());
  const reachL = (S.length[uaL] + S.length[I('lowerarm_l')]) * 0.985, reachR = (S.length[uaR] + S.length[I('lowerarm_r')]) * 0.985;
  function fitGun(fk, G, left = HL) {
    const shL = fk.wp[uaL], shR = fk.wp[uaR];
    for (let k = 0; k < 6; k++) {
      const wl = frameMul(G, left).p, wr = frameMul(G, HR).p;
      const dl = wl.distanceTo(shL) - reachL, dr = wr.distanceTo(shR) - reachR;
      if (dl <= 0 && dr <= 0) break;
      if (dl > 0) G.p.add(shL.clone().sub(wl).normalize().multiplyScalar(dl + 0.004));
      if (dr > 0) G.p.add(shR.clone().sub(wr).normalize().multiplyScalar(dr + 0.004));
    }
    return G;
  }
  const ikErr = {};
  const noteErr = (name, pose, G, wl) => {
    const fk = S.fk(pose);
    const er = fk.wp[I('hand_r')].distanceTo(frameMul(G, HR).p), el = wl ? fk.wp[I('hand_l')].distanceTo(wl.p) : 0;
    const e = ikErr[name] || (ikErr[name] = { r: 0, l: 0 });
    e.r = Math.max(e.r, er); e.l = Math.max(e.l, el);
  };

  // ------------------------------------------------------------------------------------------ stock vs body solver
  // The torso (body / uniform / plate carrier, chest segment) is skinned per frame; the rifle is pushed out along the
  // chest's forward axis until every stock sample (AK and M4 stocks, the envelope of the rifle-class models) is
  // CLEAR in front of it. The butt therefore rides on the shoulder strap / pec / plate instead of sinking into them.
  const rend = Object.fromEntries(res.parts.map((p) => [p.name, p.toRender()]));
  const torsoSet = new PosedSet(S, ['body', 'uniform', 'gear'].map((n) => rend[n]), allSeg([0]));
  const STOCK = stockPoints(rifleModels(['akm', 'm4']), 0.06, 0.018);
  let posedFk = null;
  const poseTorso = (fk) => { if (posedFk !== fk) { torsoSet.pose(fk); posedFk = fk; } };
  const _w = V3();
  /**
   * Moves G along `dir` (default f = chest forward) until every stock sample is at least `clear` in front of the
   * posed torso along f. A sample is inside when the first hits forward and backward both leave a surface (depth =
   * forward exit distance); a front face behind it nearer than `clear` is a near miss. Returns the move (m).
   */
  function clearStock(G, f, clear = 0.012, dir = f) {
    const back = f.clone().negate();
    const k = Math.max(0.3, dir.dot(f));
    let total = 0;
    for (let it = 0; it < 4; it++) {
      let push = 0;
      for (const s of STOCK) {
        _w.copy(s).applyQuaternion(G.q).add(G.p);
        const hf = torsoSet.first(_w, f, 0.6);
        if (hf && hf.back) {
          const hb = torsoSet.first(_w, back, 0.6);
          if (hb && hb.back) { push = Math.max(push, (hf.dist + clear) / k); continue; }
        }
        const hn = torsoSet.first(_w, back, clear);
        if (hn && !hn.back) push = Math.max(push, (clear - hn.dist) / k);
      }
      if (push < 5e-4) break;
      G.p.addScaledVector(dir, push + 0.0005);
      total += push;
    }
    return total;
  }

  // Rifle carries. pocket: butt-plate centre relative to the right shoulder joint, chest frame (then pushed forward
  // until the stock clears the torso). dir: muzzle direction (character space), dir2: steeper / more inward fallback
  // blended in (u = 0..1) where the short MakeHuman arms cannot reach; slide: support-hand range on the handguard
  // (weapon z, forward first). stab: 0 = orientation follows the chest, 1 = as authored.
  const CARRY = {
    lowReady: { pocket: [0.02, -0.05, 0], dir: V3(0.30, -0.62, 0.72), dir2: V3(0.39, -0.73, 0.56), cant: 4, stab: 0.8, slide: [-0.30, -0.19], clear: 0.014 },
    port: { pocket: [0.02, -0.06, 0], dir: V3(0.6, -0.42, 0.68), dir2: V3(0.62, -0.58, 0.53), cant: -12, stab: 0.55, slide: [-0.30, -0.19], clear: 0.014 },
    crouch: { pocket: [0.02, -0.045, 0], dir: V3(0.29, -0.375, 0.88), dir2: V3(0.36, -0.5, 0.79), cant: 4, stab: 1, slide: [-0.30, -0.19], clear: 0.02 },
  };
  /** Gun frame for carry c at blend u (stock cleared off the posed torso). */
  function carryAt(fk, c, u = 0) {
    const R = chestRot(fk);
    const dir = c.dir.clone().normalize().lerp(c.dir2.clone().normalize(), u).normalize();
    const rq = gunFrame(V3(), dir, c.cant || 0).q;
    const q = R.clone().multiply(rq).slerp(rq, c.stab ?? 0.75);
    const butt = fk.wp[uaR].clone().add(V3(...c.pocket).applyQuaternion(R));
    const G = { p: butt.sub(BUTT.clone().applyQuaternion(q)), q };
    poseTorso(fk);
    clearStock(G, V3(0, 0, 1).applyQuaternion(R), c.clear ?? 0.012);
    return G;
  }
  /** Smallest u (and the most forward support-hand slide) the arms can reach for this frame. */
  function solveCarry(fk, c) {
    const shL = fk.wp[uaL], shR = fk.wp[uaR];
    const dR = (G) => frameMul(G, HR).p.distanceTo(shR) - reachR;
    const dL = (G, s) => frameMul(G, leftAt(s)).p.distanceTo(shL) - reachL;
    // c.reach: an extra support-hand frame (weapon space) that must be reachable too (reload: mag pulled out)
    const ok = (G) => dR(G) <= 0 && dL(G, c.slide[1]) <= 0 && (!c.reach || frameMul(G, c.reach).p.distanceTo(shL) <= reachL);
    let u = 0, G = carryAt(fk, c, 0);
    if (!ok(G)) {
      let lo = 0, hi = 1, Gh = carryAt(fk, c, 1);
      if (ok(Gh)) {
        for (let k = 0; k < 5; k++) { const m = (lo + hi) / 2, Gm = carryAt(fk, c, m); if (ok(Gm)) { hi = m; Gh = Gm; } else lo = m; }
      }
      u = hi; G = Gh;
    }
    let s = c.slide[0];
    if (dL(G, s) > 0) {
      let lo = c.slide[0], hi = c.slide[1];
      for (let k = 0; k < 10; k++) { const m = (lo + hi) / 2; if (dL(G, m) > 0) lo = m; else hi = m; }
      s = hi;
    }
    return { u, s, reach: [+dR(G).toFixed(3), +dL(G, s).toFixed(3)] };
  }
  const solveLog = {};
  /** Smooths a per-frame series (cyclic for loops). */
  const smoothSeries = (a, loop, passes = 3) => {
    const n = loop ? a.length - 1 : a.length;
    for (let p = 0; p < passes; p++) {
      const b = a.slice();
      for (let i = 0; i < n; i++) {
        const im = loop ? (i - 1 + n) % n : Math.max(0, i - 1), ip = loop ? (i + 1) % n : Math.min(n - 1, i + 1);
        a[i] = (b[im] + 2 * b[i] + b[ip]) / 4;
      }
      if (loop) a[n] = a[0];
    }
    return a;
  };
  /** Rifle carry over a clip: posture per frame, solve (u, slide), smooth them, then IK the hands. */
  function carryClip(c, carry, post, name, o = {}) {
    const posed = c.poses.map((p, f) => post(clonePose(p), f, f / c.fps));
    // solved on every 2nd frame (and the last), linear in between, then smoothed
    const sol = posed.map((p, f) => (f % 2 === 0 || f === posed.length - 1 ? solveCarry(S.fk(p), carry) : null));
    for (let f = 1; f < sol.length - 1; f++) if (!sol[f]) sol[f] = { u: (sol[f - 1].u + sol[f + 1].u) / 2, s: (sol[f - 1].s + sol[f + 1].s) / 2 };
    const us = smoothSeries(sol.map((x) => x.u), c.loop), sl = smoothSeries(sol.map((x) => x.s), c.loop);
    solveLog[name] = { u: [+Math.min(...us).toFixed(2), +Math.max(...us).toFixed(2)], slide: [+Math.min(...sl).toFixed(3), +Math.max(...sl).toFixed(3)] };
    c.poses = posed.map((p, f) => holdRifle(p, (fk) => {
      const G = carryAt(fk, carry, us[f]);
      if (o.mod) { o.mod(G, f / c.fps); poseTorso(fk); clearStock(G, V3(0, 0, 1).applyQuaternion(chestRot(fk)), 0.008); }
      return G;
    }, { name, left: leftAt(sl[f]), ...(o.hold || {}) }));
    if (c.loop) c.poses[c.poses.length - 1] = clonePose(c.poses[0]);
    return c;
  }

  const POLE_R = V3(-0.85, -0.55, -0.2).normalize();
  const POLE_L = V3(0.3, -0.95, 0.05).normalize();

  /** Upper body: damp the source's spine motion, lean / twist the torso, then keep the head looking along +Z. */
  const posture = (pose, o = {}) => {
    for (const b of ['spine_01', 'spine_02', 'spine_03', 'neck_01', 'head']) pose.q[I(b)].slerp(S.restLocalQ[I(b)], o.damp ?? 0.5);
    const lean = o.lean ?? 3, tw = o.twist ?? 0;
    applyOffsets(S, pose, {
      spine_01: [lean, tw * 0.4, 0], spine_02: [lean * 0.8, tw * 0.35, 0], spine_03: [lean * 0.6, tw * 0.25, 0],
      neck_01: [o.neck ?? -2, 0, 0], head: [o.head ?? -2, 0, o.tilt ?? 0],
    });
    if (o.look !== false) lookForward(pose, o.lookK ?? 1);
    if (o.level !== undefined) lookLevel(pose, o.level);
    if (o.clavDamp) for (const b of ['clavicle_l', 'clavicle_r']) pose.q[I(b)].slerp(S.restLocalQ[I(b)], o.clavDamp); // mocap shoulder shrug / swing
    if (o.clav) applyOffsets(S, pose, o.clav);
    return pose;
  };
  /** Turns neck + head (yaw only) so the face points along +Z (k = fraction of the correction). */
  function lookForward(pose, k = 1) {
    const fk = S.fk(pose);
    const hi = I('head');
    const f = V3(0, 0, 1).applyQuaternion(fk.wq[hi].clone().multiply(S.restWorldQ[hi].clone().invert()));
    const err = Math.atan2(f.x, f.z) / DEG * k;
    applyOffsets(S, pose, { neck_01: [0, -err * 0.45, 0] });
    applyOffsets(S, pose, { head: [0, -err * 0.55, 0] });
  }
  /** Rotates neck + head (world rotations, CCD) so the face points along `dir` (world). */
  function aimHead(pose, dir, k = 1) {
    const hi = I('head');
    for (let it = 0; it < 3; it++) for (const [b, share] of [['neck_01', 0.4], ['head', 0.75]]) {
      const fk = S.fk(pose);
      const f = V3(0, 0, 1).applyQuaternion(fk.wq[hi].clone().multiply(S.restWorldQ[hi].clone().invert()));
      const dq = Q().setFromUnitVectors(f, dir.clone().normalize()).slerp(Q(), 1 - share * k);
      const bi = I(b), pw = fk.wq[S.parent[bi]];
      pose.q[bi].premultiply(pw.clone().invert().multiply(dq).multiply(pw));
    }
  }
  /** Face pitch to `deg` (+ = up), heading kept: eyes level instead of a bowed head. */
  function lookLevel(pose, deg = -4) {
    const fk = S.fk(pose);
    const f = V3(0, 0, 1).applyQuaternion(fk.wq[I('head')].clone().multiply(S.restWorldQ[I('head')].clone().invert()));
    const hz = Math.hypot(f.x, f.z) || 1;
    aimHead(pose, V3(f.x / hz * Math.cos(deg * DEG), Math.sin(deg * DEG), f.z / hz * Math.cos(deg * DEG)));
  }
  /** Rotates bone b's world frame by dq (children follow). */
  const rotWorld = (pose, b, dq) => { const fk = S.fk(pose), bi = I(b), pw = fk.wq[S.parent[bi]]; pose.q[bi].premultiply(pw.clone().invert().multiply(dq).multiply(pw)); };
  /** Straightens the trunk (pelvis -> neck) to at most maxDeg from vertical, spread over spine_01..03. */
  function uprightTrunk(pose, maxDeg) {
    for (let it = 0; it < 3; it++) {
      const fk = S.fk(pose);
      const t = fk.wp[I('neck_01')].clone().sub(fk.wp[pel]);
      const ang = Math.acos(Math.min(1, t.y / t.length())) / DEG;
      if (ang <= maxDeg + 0.2) return ang;
      const axis = t.clone().cross(V3(0, 1, 0)).normalize();
      for (const [b, sh] of [['spine_01', 0.4], ['spine_02', 0.3], ['spine_03', 0.3]]) rotWorld(pose, b, Q().setFromAxisAngle(axis, (ang - maxDeg) * DEG * sh));
    }
    const fk = S.fk(pose), t = fk.wp[I('neck_01')].clone().sub(fk.wp[pel]);
    return Math.acos(Math.min(1, t.y / t.length())) / DEG;
  }

  /** Sets the trunk (pelvis -> neck) to deg forward of vertical in its current heading plane, spread over the spine. */
  function setTrunk(pose, deg) {
    for (let it = 0; it < 3; it++) {
      const fk = S.fk(pose);
      const t = fk.wp[I('neck_01')].clone().sub(fk.wp[pel]);
      const fwd = V3(t.x, 0, t.z);
      if (fwd.lengthSq() < 1e-8) fwd.set(0, 0, 1);
      fwd.normalize();
      const cur = Math.atan2(t.dot(fwd), t.y) / DEG;
      if (Math.abs(cur - deg) < 0.2) break;
      const axis = V3(0, 1, 0).cross(fwd).normalize(); // positive rotation tips the trunk forward
      for (const [b, sh] of [['spine_01', 0.4], ['spine_02', 0.3], ['spine_03', 0.3]]) rotWorld(pose, b, Q().setFromAxisAngle(axis, (deg - cur) * DEG * sh));
    }
    const fk = S.fk(pose), t = fk.wp[I('neck_01')].clone().sub(fk.wp[pel]);
    return Math.acos(Math.min(1, t.y / t.length())) / DEG;
  }

  /** Hands on the rifle (gunFn(fk) -> frame is evaluated after the posture), fingers, optional left override. */
  function holdRifle(pose, gunFn, o = {}) {
    let fk = S.fk(pose);
    const G = typeof gunFn === 'function' ? gunFn(fk) : gunFn;
    const wr = frameMul(G, HR);
    twoBoneIK(S, pose, ARM(S, 'r'), wr.p, o.poleR || POLE_R, wr.q, fk, 0.015);
    fk = S.fk(pose);
    const wl = o.leftWorld ? o.leftWorld(G, fk) : frameMul(G, o.leftFn ? o.leftFn() : o.left || HL);
    twoBoneIK(S, pose, ARM(S, 'l'), wl.p, o.poleL || POLE_L, wl.q, fk, 0.015);
    setFingers(pose, 'r', o.fingersR || 'trigger');
    if (o.fingersL !== null) setFingers(pose, 'l', o.fingersL || 'cradle');
    if (o.name) noteErr(o.name, pose, G, wl);
    return pose;
  }

  // ------------------------------------------------------------------------------------------ eyes / cheek weld
  // right (dominant) eye in head-local space, so a pose can put it on the rifle's sight line
  const headI = I('head');
  const eyeLocal = V3(...res.eyeR).sub(S.restWorldP[headI]).applyQuaternion(S.restWorldQ[headI].clone().invert());
  const eyeWorld = (fk) => fk.wp[headI].clone().add(eyeLocal.clone().applyQuaternion(fk.wq[headI]));
  // where the eye sits on a rifle, weapon space from the grip point: on the highest sight line of the rifle-class
  // models (M4 optic 0.145; lower sights get a per-weapon head drop at runtime, extras.aimWeld), ~9 cm ahead of the
  // butt plate over the stock comb
  // (cheekbone on the comb, jaw beside the stock; at z = 0.03 the mouth was over the AK's receiver cover). The plate
  // carrier seats the butt ~20 cm in front of the shoulder joint, the neck can only bring the eye ~6 cm forward.
  const EYE_IN_RIFLE = V3(P('EYEX', -0.012), P('EYEY', 0.145), P('EYEZ', 0.19));
  /**
   * Rotates neck + head (CCD, a few passes) so the right eye moves onto `target` (cheek on the stock). target may be a
   * function of the current eye (e.g. the nearest point of a sight line).
   */
  function cheekWeld(pose, target, k = 1, passes = 4) {
    const T = typeof target === 'function' ? target : () => target;
    for (let it = 0; it < passes; it++) for (const [b, share] of [['neck_01', 0.45], ['head', 0.8]]) {
      const fk = S.fk(pose);
      const bi = I(b), piv = fk.wp[bi];
      const a = eyeWorld(fk).sub(piv), t = T(eyeWorld(fk)).sub(piv);
      if (a.lengthSq() < 1e-8 || t.lengthSq() < 1e-8) continue;
      const dq = Q().setFromUnitVectors(a.normalize(), t.normalize()).slerp(Q(), 1 - share * k);
      const pw = fk.wq[S.parent[bi]];
      pose.q[bi].premultiply(pw.clone().invert().multiply(dq).multiply(pw));
    }
    const e = eyeWorld(S.fk(pose));
    return e.distanceTo(T(e));
  }
  const weldErr = {};

  const clips = {};
  const meta = {};
  let tLast = Date.now();
  const finish = (name, c, m = {}) => {
    console.log('  built', name, ((Date.now() - tLast) / 1000).toFixed(1) + 's');
    tLast = Date.now();
    c.name = name;
    fixSigns(c);
    clips[name] = c;
    meta[name] = { duration: +((c.poses.length - 1) / c.fps).toFixed(4), loop: !!c.loop, speed: +(c.meta?.speed || 0).toFixed(3), source: c.meta?.source || 'procedural', ...m };
    return c;
  };
  const mapPoses = (c, fn) => { c.poses = c.poses.map((p, f) => fn(clonePose(p), f, f / c.fps)); return c; };
  // clavicles: the support-side shoulder protracted (y < 0 brings the left shoulder forward on this rig; y > 0 pulls
  // it back), the firing side neutral
  const CLAV = { clavicle_r: [0, 3, 0], clavicle_l: [0, -14, 0] };

  // ------------------------------------------------------------------------------------------ idle_rifle
  if (want('idle_rifle')) {
    const c = ualLoop(skel, 1, 'Idle_Loop', { name: 'idle_rifle', lock: true });
    c.meta.speed = 0;
    const P = (c.poses.length - 1) / c.fps;
    carryClip(c, CARRY.lowReady, (p) => posture(p, { lean: 3, twist: -20, head: 2, damp: 0.4, clavDamp: 0.6, clav: { clavicle_r: [0, 3, 0], clavicle_l: [0, -20, 0] } }), 'idle_rifle', {
      mod: (G, t) => G.q.multiply(Q().setFromAxisAngle(V3(1, 0, 0), loopNoise(t, P, 1, 2) * 1.2 * DEG)), // breathing sway
    });
    lockFeet(skel, c, { speed: 0 });
    finish('idle_rifle', c, { notes: 'low ready, bladed stance: butt on the right shoulder strap / pec outside the plate carrier, muzzle ~38 deg down towards the front-left; UAL1 Idle_Loop legs / breathing' });
  }

  // ------------------------------------------------------------------------------------------ walk_rifle
  if (want('walk_rifle')) {
    const c = ualLoop(skel, 1, 'Walk_Loop', { name: 'walk_rifle' });
    carryClip(c, CARRY.lowReady, (p) => posture(p, { lean: 3, twist: -20, damp: 0.7, clavDamp: 0.85, clav: { clavicle_r: [0, 3, 0], clavicle_l: [0, -20, 0] } }), 'walk_rifle');
    lockFeet(skel, c, { speed: c.meta.speed });
    finish('walk_rifle', c, { notes: 'UAL1 Walk_Loop legs, rifle at low ready (as idle_rifle)' });
  }

  // ------------------------------------------------------------------------------------------ run_rifle (+ alias run)
  if (want('run_rifle')) {
    const c0 = ualLoop(skel, 1, 'Jog_Fwd_Loop', { name: 'run_rifle', lock: false });
    // the Quaternius jog strides like a sprint: shorten the stride to a loaded combat jog (~3.5 m/s, which is what
    // remote.js assumes for timeScale = speed / 3.5), then re-lock the feet
    strideWarp(skel, c0, 3.5 / c0.meta.speed);
    // the shortened stride leaves the knees deeply bent: stand the runner up a little (the feet are re-locked below)
    for (const p of c0.poses) {
      p.root.y += 0.07;
      // less heel-to-butt kick in the swing (a loaded jog, not a sprint)
      for (const s of ['l', 'r']) p.q[I(`calf_${s}`)].slerp(S.restLocalQ[I(`calf_${s}`)], 0.3);
    }
    // start the loop on a passing pose (feet under the body), so a cross-fade in from idle never starts mid-stride
    const n = c0.poses.length - 1;
    let best = 0, bd = Infinity;
    for (let f = 0; f < n; f++) {
      const fk = S.fk(c0.poses[f]);
      const d = Math.abs(fk.wp[I('foot_l')].z - fk.wp[I('foot_r')].z) + Math.abs(fk.wp[I('foot_l')].y - fk.wp[I('foot_r')].y) * 2;
      if (d < bd) { bd = d; best = f; }
    }
    const c = { ...c0, poses: [] };
    for (let f = 0; f <= n; f++) c.poses.push(clonePose(c0.poses[(best + f) % n]));
    carryClip(c, CARRY.port, (p) => posture(p, { lean: 4, twist: -14, neck: -4, head: -2, damp: 0.7, clavDamp: 0.85, clav: { clavicle_r: [0, 2, 0], clavicle_l: [0, -14, 0] } }), 'run_rifle');
    groundFeet(skel, c);
    lockFeet(skel, c, { speed: c.meta.speed });
    clampFeetAboveGround(skel, c);
    finish('run_rifle', c, { notes: 'UAL1 Jog_Fwd_Loop legs (stride shortened to 3.5 m/s), rifle across the chest (muzzle forward-left-down, stock clear of the carrier); loop starts on a passing pose' });
  }

  // ------------------------------------------------------------------------------------------ crouch_idle / crouch_walk
  if (want('crouch_idle')) {
    const c = ualLoop(skel, 1, 'Crouch_Idle_Loop', { name: 'crouch_idle', lock: true });
    c.meta.speed = 0;
    carryClip(c, CARRY.crouch, (p) => posture(p, { lean: 2, twist: -18, damp: 0.6, head: 0, level: -6, clavDamp: 0.85, clav: CLAV }), 'crouch_idle');
    lockFeet(skel, c, { speed: 0 });
    finish('crouch_idle', c, { notes: 'UAL1 Crouch_Idle_Loop, head up (eyes level), rifle at a high low-ready (muzzle ~22 deg down)' });
  }
  if (want('crouch_walk')) {
    const c = ualLoop(skel, 1, 'Crouch_Fwd_Loop', { name: 'crouch_walk' });
    // less of a duck-walk: the pelvis rides ~9 cm higher (each foot keeps its path, the knees open) and the stride
    // is shortened
    const leg = (s) => [I(`thigh_${s}`), I(`calf_${s}`), I(`foot_${s}`)];
    const legLen = (s) => (S.length[I(`thigh_${s}`)] + S.length[I(`calf_${s}`)]) * 0.985;
    let raised = Infinity;
    for (const p of c.poses) {
      const fk = S.fk(p);
      let dy = 0.09;
      for (const s of ['l', 'r']) {
        const hip = fk.wp[I(`thigh_${s}`)], ank = fk.wp[I(`foot_${s}`)];
        const hz = Math.hypot(hip.x - ank.x, hip.z - ank.z), L = legLen(s);
        dy = Math.min(dy, Math.sqrt(Math.max(0, L * L - hz * hz)) - (hip.y - ank.y));
      }
      raised = Math.min(raised, dy);
    }
    raised = Math.max(0, raised);
    for (const p of c.poses) {
      const fk = S.fk(p);
      const keep = ['l', 'r'].map((s) => ({ s, a: fk.wp[I(`foot_${s}`)].clone(), q: fk.wq[I(`foot_${s}`)].clone() }));
      p.root.y += raised;
      for (const k of keep) { const f2 = S.fk(p); twoBoneIK(S, p, leg(k.s), k.a, kneePole(f2, S, k.s), k.q, f2); }
    }
    strideWarp(skel, c, 0.82);
    carryClip(c, CARRY.crouch, (p) => posture(p, { lean: 2, twist: -16, damp: 0.7, head: 0, level: -6, clavDamp: 0.85, clav: CLAV }), 'crouch_walk');
    lockFeet(skel, c, { speed: c.meta.speed });
    clampFeetAboveGround(skel, c);
    finish('crouch_walk', c, { notes: `UAL1 Crouch_Fwd_Loop, pelvis raised ${(raised * 100).toFixed(0)} cm, stride x0.82, head up, rifle at a high low-ready` });
  }

  // ------------------------------------------------------------------------------------------ aim_rifle / fire_rifle
  // Bladed shooting stance (Idle_Loop's staggered feet, chest turned right), stock in the shoulder pocket and the cheek
  // on the stock: the rifle is pulled part of the way up / in towards the right eye and the neck + head close the rest
  // (CCD), so the eye sits on the sight line. aim_rifle holds it (breathing sway); fire_rifle = 4 shots at 600 rpm per
  // 0.4 s loop. The kick is authored per frame (shot frame 0, next frame 1.0, then 0.35): at 30 fps a continuous
  // envelope peaking a few ms after the shot was sampled to almost nothing. Both clips share frame 0 exactly, so the
  // game can snap between them.
  const idleBase = ualLoop(skel, 1, 'Idle_Loop', { name: 'tmp', lock: true }).poses[0];
  const AIM_POST = { lean: P('LEAN', 14), twist: P('TWIST', -12), neck: P('NECK', 16), head: P('HEAD', 2), tilt: P('TILT', 22), damp: 0.85, clav: { clavicle_r: [0, 4, 6], clavicle_l: [0, -14, 0] } };
  // butt-plate place relative to the right shoulder joint (chest frame): in the pocket between the plate's outer edge
  // and the deltoid, on the shoulder strap. Its depth comes from contact: the rifle is pulled back along the bore, then
  // pushed forward until the stock just touches the posed torso (the padded strap gives 3 mm).
  const AIM_POCKET = V3(P('PX', 0.015), P('PY', -0.04), 0);
  const AIM_DIR = V3(Math.sin(P('YAW', 4) * DEG), 0, Math.cos(P('YAW', 4) * DEG)); // muzzle a little inward
  const KICK = [0, 1, 0.35];
  // head / helmet vs weapon (every rifle-class model): the eye target rises off the sight line (<= 2 cm) instead of
  // the jaw sinking into the stock
  const headSet = new PosedSet(S, ['body', 'gear', 'eyes'].map((n) => rend[n]), allSeg([1]));
  const RIFLE_IDS = ['akm', 'm4', 'mp5', 'ump', 'vector', 'uzi'];
  const aimGuns = rifleModels(RIFLE_IDS);
  const aimStock = new Map(aimGuns.map((m) => [m, stockPoints([m], 0.1, 0.012)]));
  const headInGun = (fk, G, guns = aimGuns) => {
    headSet.pose(fk);
    let d = 0;
    const g = V3();
    const gx = V3(1, 0, 0).applyQuaternion(G.q), gxn = gx.clone().negate();
    for (const m of guns) for (const p of aimStock.get(m)) {
      g.copy(p).applyQuaternion(G.q).add(G.p);
      const a = headSet.first(g, gx, 0.3);
      if (!a || !a.back) continue;
      const b = headSet.first(g, gxn, 0.3);
      if (b && b.back) d = Math.max(d, Math.min(a.dist, b.dist));
    }
    for (let v = 0; v < headSet.count; v++) {
      toGun(G, headSet.vertex(v, g), g);
      if (g.z < -0.25 || g.z > 0.32 || Math.abs(g.x) > 0.06 || g.y < -0.1 || g.y > 0.2) continue;
      for (const m of guns) {
        const h = m.first(g, V3(0, 1, 0), 0.3);
        if (!h || !h.back) continue;
        const h2 = m.first(g, V3(0, -1, 0), 0.3);
        if (h2 && h2.back) d = Math.max(d, h.dist);
      }
    }
    return d;
  };
  let aimInfo = null;
  const rifleAim = (kick, sway, name) => {
    const p = posture(clonePose(idleBase), AIM_POST);
    // lean into the rifle a little (side bend to the right) and the recoil follow-through: the chest rocks back and
    // the right shoulder rolls back; the seated rifle goes with them
    applyOffsets(S, p, { spine_02: [0, 0, P('SIDE', 3)], spine_03: [0, 0, P('SIDE', 3)] });
    applyOffsets(S, p, { spine_03: [-4.5 * kick, 1.5 * kick, 0], spine_02: [-2.2 * kick, 0, 0], clavicle_r: [0, 4 * kick, 4 * kick] });
    let G, slide = -0.29;
    holdRifle(p, (fk) => {
      const R = chestRot(fk);
      // bore straight ahead, muzzle climb about the grip (kick) and breathing sway
      const q = gunFrame(V3(), AIM_DIR, P('CANT', 8)).q.multiply(Q().setFromAxisAngle(V3(1, 0, 0), (4.5 * kick + sway) * DEG));
      const butt = fk.wp[uaR].clone().add(AIM_POCKET.clone().applyQuaternion(R));
      G = { p: butt.sub(BUTT.clone().applyQuaternion(q)), q };
      // sight line part of the way towards the eye (the neck / head weld closes the rest)
      const d = toGun(G, eyeWorld(fk)).sub(EYE_IN_RIFLE); d.z = 0; d.clampLength(0, 0.1);
      G.p.add(d.multiplyScalar(P('PULL', 0.5)).applyQuaternion(G.q));
      const fwd = V3(0, 0, -1).applyQuaternion(G.q);
      G.p.addScaledVector(fwd, -0.12);
      poseTorso(fk);
      const push = clearStock(G, V3(0, 0, 1).applyQuaternion(R), P('SEAT', 0.01), fwd);
      // support hand as far forward on the handguard as the arm reaches
      const shL = fk.wp[uaL];
      for (slide = -0.31; slide < -0.185 && frameMul(G, leftAt(slide)).p.distanceTo(shL) > reachL; slide += 0.005);
      if (!aimInfo) aimInfo = { push, eye: toGun(G, eyeWorld(fk)), butt: toGun({ p: fk.wp[uaR], q: G.q }, frameMul(G, { p: BUTT, q: Q() }).p) };
      return G;
    }, { poleR: V3(-0.95, -0.25, -0.15).normalize(), fingersR: 'grip', name, leftFn: () => leftAt(slide) });
    if (aimInfo && !aimInfo.logged) {
      aimInfo.logged = true;
      console.log('  aim f0: eye in gun space before the weld', aimInfo.eye.toArray().map((v) => v.toFixed(3)).join(','), 'target', EYE_IN_RIFLE.toArray().join(','), 'seat push', aimInfo.push.toFixed(3), 'butt from shoulder', aimInfo.butt.toArray().map((v) => v.toFixed(3)).join(','), 'slide', slide.toFixed(3));
    }
    // the eye goes onto the sight line, as far forward along it as the neck allows (between EYE z and 5 cm behind)
    let raise = 0, e = 0;
    const onLine = (eye) => { const g = toGun(G, eye); g.x = EYE_IN_RIFLE.x; g.y = EYE_IN_RIFLE.y + raise; g.z = Math.min(Math.max(g.z - 0.03, EYE_IN_RIFLE.z), EYE_IN_RIFLE.z + 0.05); return frameMul(G, { p: g, q: Q() }).p; };
    for (let it = 0; it < 3; it++) {
      e = cheekWeld(p, onLine, 1, 6);
      const dh = headInGun(S.fk(p), G);
      if (dh < 0.006 || raise >= 0.02) break;
      raise = Math.min(0.02, raise + dh);
    }
    // off-axis error: distance of the eye from the sight line (the raise counts)
    { const g = toGun(G, eyeWorld(S.fk(p))); e = Math.hypot(g.x - EYE_IN_RIFLE.x, g.y - EYE_IN_RIFLE.y); }
    weldErr[name] = Math.max(weldErr[name] || 0, e);
    if (!aimInfo.weldLogged) { aimInfo.weldLogged = true; console.log('  aim f0 weld: residual', e.toFixed(3), 'raise', raise.toFixed(3), 'eye-sight point (gun space)', toGun(G, eyeWorld(S.fk(p))).sub(EYE_IN_RIFLE).toArray().map((v) => v.toFixed(3)).join(',')); }
    return p;
  };
  if (want('aim_rifle')) {
    const dur = 2.0, frames = Math.round(dur * fps) + 1, poses = [];
    for (let f = 0; f < frames; f++) poses.push(rifleAim(0, Math.sin(f / (frames - 1) * Math.PI * 2) * 0.5, 'aim_rifle'));
    poses[frames - 1] = clonePose(poses[0]);
    const c = { name: 'aim_rifle', fps, poses, loop: true, meta: { source: 'procedural (IK + cheek weld) on UAL1 Idle_Loop stance' } };
    lockFeet(skel, c, { speed: 0 });
    finish('aim_rifle', c, { notes: 'shouldered aim, cheek on the stock comb (eye on the sight line), breathing sway; frame 0 = fire_rifle frame 0' });
  }
  if (want('fire_rifle')) {
    const dur = 0.4, frames = Math.round(dur * fps) + 1, poses = [];
    for (let f = 0; f < frames; f++) poses.push(rifleAim(KICK[f % 3], 0, 'fire_rifle'));
    poses[frames - 1] = clonePose(poses[0]);
    const c = { name: 'fire_rifle', fps, poses, loop: true, meta: { source: 'procedural recoil on UAL1 Idle_Loop stance' } };
    lockFeet(skel, c, { speed: 0 });
    finish('fire_rifle', c, { notes: 'shouldered aim, 4 shots at 600 rpm per loop, kick authored per frame (32 mm back, 4.5 deg climb, chest / shoulder follow-through)', events: { shots: [0, 0.1, 0.2, 0.3] }, shotInterval: 0.1 });
  }

  // ------------------------------------------------------------------------------------------ reload helper
  // keys: [{t, g: grip key, off?: weapon-space (or chest-space for 'pouch') offset}], the left hand moves between them
  // (smoothstep, lifted arc between different grips), the gun goes from the base carry to a tilted one and back.
  const pouchAt = (fk) => {
    // front-left mag pouch top, chest frame: fingers down into the pouch, palm towards the body
    const x = 0.076, y = plate.bot + 0.018 + 0.115 + 0.04;
    const R = chestRot(fk);
    const restP = V3(x, y, chestZ(x, y) + 0.035);
    const at = fk.wp[sp3].clone().add(restP.sub(S.restWorldP[sp3]).applyQuaternion(R));
    const F = V3(-0.1, -1, 0.15).applyQuaternion(R).normalize(), Nn = V3(0, 0.15, -1).applyQuaternion(R).normalize();
    const q = basisQ(handLocal.l.F, handLocal.l.N, F, Nn);
    return { p: at.addScaledVector(F, -0.07).addScaledVector(Nn, -0.03), q };
  };
  function reloadClip(name, o) {
    const frames = Math.round(o.dur * fps) + 1, poses = [];
    const keys = o.keys;
    for (let f = 0; f < frames; f++) {
      const t = f / fps;
      const k = ss(0.05, 0.3, t) * (1 - ss(o.dur - 0.4, o.dur - 0.05, t));
      const p = posture(clonePose(idleBase), o.post(k));
      let a = keys[0], b = keys[keys.length - 1];
      for (let i = 0; i < keys.length - 1; i++) if (t >= keys[i].t && t <= keys[i + 1].t) { a = keys[i]; b = keys[i + 1]; break; }
      const u = smooth((t - a.t) / Math.max(1e-6, b.t - a.t));
      let hold = o.grips.hold;
      holdRifle(p, (fk) => {
        const base = o.base(fk);
        if (base.s !== undefined) hold = leftAt(base.s);
        const G = frameLerp(base.G || base, o.tilted(fk), k);
        // jolts: the new mag seats, the slide / bolt slams home
        const seat = t > o.events.magIn ? Math.exp(-(t - o.events.magIn) * 25) : 0, drop = t > o.events.charge ? Math.exp(-(t - o.events.charge) * 25) : 0;
        G.p.add(V3(0, 1, 0).applyQuaternion(G.q).multiplyScalar(0.012 * seat - 0.008 * drop));
        if (o.rifle) { poseTorso(fk); clearStock(G, V3(0, 0, 1).applyQuaternion(chestRot(fk)), 0.008); return G; }
        return fitGun(fk, G, o.grips.hold);
      }, {
        fingersL: null, name, left: o.grips.hold, poleR: o.poleR, poleL: o.poleL,
        leftWorld: (G, fk) => {
          const at = (key) => {
            if (key.g === 'pouch') { const w = pouchAt(fk); if (key.off) w.p.add(key.off.clone().applyQuaternion(chestRot(fk))); return w; }
            const w = frameMul(G, key.g === 'hold' ? hold : o.grips[key.g]);
            if (key.off) w.p.add(key.off.clone().applyQuaternion(G.q));
            return w;
          };
          const wl = frameLerp(at(a), at(b), u);
          if (a.g !== b.g) wl.p.add(V3(0, 0.05 * Math.sin(u * Math.PI), 0.04 * Math.sin(u * Math.PI)));
          return wl;
        },
      });
      setFingers(p, 'l', o.fingers[b.g], u, o.fingers[a.g]);
      if (process.env.SOLDIER_DEBUG) { const e = ikErr[name]; if (e && e.l > (o._lastL || 0)) { o._lastL = e.l; console.log(`  ${name} t=${t.toFixed(2)} ${a.g}->${b.g} left err ${e.l.toFixed(3)}`); } }
      poses.push(p);
    }
    const c = { name, fps, poses, loop: false, meta: { source: 'procedural (IK) on UAL1 Idle_Loop stance' } };
    lockFeet(skel, c, { speed: 0 });
    return c;
  }

  // ------------------------------------------------------------------------------------------ reload_rifle
  if (want('reload_rifle')) {
    const L = (g) => handInGun('l', g);
    const ev = { magOut: 0.6, magIn: 1.7, charge: 1.98 };
    // reload workspace: rifle raised to ~16 deg down and canted 40 deg so the magwell faces the support hand
    const TILT = { pocket: [0.03, -0.08, 0], dir: V3(0.45, -0.28, 0.85), dir2: V3(0.78, -0.22, 0.58), cant: 40, stab: 0.7, slide: [-0.3, -0.19], clear: 0.014,
      reach: handInGun('l', GRIPL.mag, GRIPL.mag.at.clone().add(V3(0.03, -0.1, 0.05))) };
    const c = reloadClip('reload_rifle', {
      dur: 2.4, events: ev, rifle: true,
      keys: [
        { t: 0.0, g: 'hold' }, { t: 0.22, g: 'hold' },
        { t: 0.42, g: 'mag' }, { t: 0.56, g: 'mag', off: V3(0, -0.02, 0) }, { t: 0.76, g: 'mag', off: V3(0.03, -0.1, 0.05) },
        { t: 1.04, g: 'pouch' }, { t: 1.2, g: 'pouch', off: V3(0, 0.03, 0.02) },
        { t: 1.48, g: 'mag', off: V3(0.0, -0.12, 0.03) }, { t: 1.6, g: 'mag', off: V3(0, -0.02, 0) }, { t: 1.7, g: 'mag', off: V3(0, 0.005, 0) },
        { t: 1.86, g: 'charge' }, { t: 1.98, g: 'charge', off: V3(0, 0, 0.09) }, { t: 2.04, g: 'charge', off: V3(0, 0, 0.09) },
        { t: 2.24, g: 'hold' }, { t: 2.4, g: 'hold' },
      ],
      grips: { hold: HL, mag: L(GRIPL.mag), charge: L(GRIPL.charge) },
      fingers: { hold: 'cradle', mag: 'grab', pouch: 'grab', charge: 'grab' },
      post: (k) => ({ lean: 4 + 3 * k, twist: -18 - 6 * k, neck: -4 - 8 * k, head: 2 + 10 * k, damp: 0.6, clav: { clavicle_r: [0, 3, 0], clavicle_l: [0, -14 - 8 * k, 0] } }),
      base: (fk) => { const s = solveCarry(fk, CARRY.lowReady); return { G: carryAt(fk, CARRY.lowReady, s.u), s: s.s }; },
      tilted: (fk) => carryAt(fk, TILT, solveCarry(fk, TILT).u),
    });
    finish('reload_rifle', c, { notes: 'mag out, new mag from the chest pouch, seat, rack the charging handle; starts / ends on idle_rifle (the game hides the weapon mag and puts a copy in hand_l between magOut and magIn)', events: ev });
  }

  // ------------------------------------------------------------------------------------------ pistols
  // Two-hand grip: support hand wrapped round the strong hand (thumbs forward), same hand_r socket as the rifles.
  // idle_pistol = compressed ready (gun at the sternum, muzzle forward-down), aim_pistol / fire_pistol = isosceles
  // with the sights on the right eye line, reload_pistol = mag dropped, new one from the chest pouch, slide release.
  const GRIPL_PISTOL = { at: V3(-0.024, -0.034, -0.012), F: V3(0.35, 0.1, -0.93), N: V3(0.9, 0.2, 0.25), palm: [0.026, 0.045] };
  const HLP = handInGun('l', GRIPL_PISTOL);
  const EYE_IN_PISTOL = V3(0, 0.092, 0.4);
  const P_POLE_R = V3(-0.75, -0.65, -0.1).normalize(), P_POLE_L = V3(0.7, -0.7, -0.1).normalize();
  const pistolReady = (fk) => {
    const R = chestRot(fk);
    const q0 = gunFrame(V3(), V3(0.04, -0.42, 0.9), 0).q;
    const q = R.clone().multiply(q0).slerp(q0, 0.6);
    const y = plate.top - 0.09;
    const at = V3(-0.03, y, chestZ(0, y) + 0.17);
    return fitGun(fk, { p: fk.wp[sp3].clone().add(at.sub(S.restWorldP[sp3]).applyQuaternion(R)), q }, HLP);
  };
  const PISTOL_CLAV = { clavicle_r: [0, -4, 0], clavicle_l: [0, -6, 0] };
  const PISTOL_POST = { lean: 6, twist: -5, neck: 3, head: 2, damp: 0.85, clav: PISTOL_CLAV };
  const pistolAim = (kick, sway, name) => {
    const p = posture(clonePose(idleBase), PISTOL_POST);
    applyOffsets(S, p, { spine_03: [-1.4 * kick, 0, 0], neck_01: [-1.2 * kick, 0, 0] });
    let G, eyeT;
    holdRifle(p, (fk) => {
      // sights on the eye line, pushed out as far as both arms reach (short MakeHuman arms: the distance is solved
      // instead of pulling the gun back towards the shoulders, which would drop it below the eye)
      const q = gunFrame(V3(), V3(0, 0, 1), 0).q;
      const eye = eyeWorld(fk), shL = fk.wp[uaL], shR = fk.wp[uaR];
      for (let D = EYE_IN_PISTOL.z; D > 0.18; D -= 0.01) {
        G = { p: eye.clone().sub(V3(0, EYE_IN_PISTOL.y, D).applyQuaternion(q)), q };
        if (frameMul(G, HLP).p.distanceTo(shL) <= reachL && frameMul(G, HR).p.distanceTo(shR) <= reachR) break;
      }
      eyeT = eye;
      G.p.add(V3(0, 0.35, 1).applyQuaternion(G.q).multiplyScalar(0.024 * kick)); // push back + up
      G.q.multiply(Q().setFromAxisAngle(V3(1, 0, 0), (9 * kick + sway) * DEG));   // muzzle flip
      return G;
    }, { left: HLP, poleR: P_POLE_R, poleL: P_POLE_L, fingersR: 'grip', fingersL: 'grab', name });
    // report how far the sight line passes from the eye (no head weld: the head stays upright)
    const sl = frameMul(G, { p: V3(0, EYE_IN_PISTOL.y, 0), q: Q() }).p;
    weldErr[name] = Math.max(weldErr[name] || 0, Math.hypot(sl.x - eyeT.x, sl.y - eyeT.y));
    return p;
  };
  if (want('idle_pistol')) {
    const c = ualLoop(skel, 1, 'Idle_Loop', { name: 'idle_pistol', lock: true });
    c.meta.speed = 0;
    mapPoses(c, (p) => holdRifle(posture(p, { lean: 3, twist: -4, head: 1, damp: 0.4, clav: PISTOL_CLAV }), pistolReady,
      { left: HLP, poleR: P_POLE_R, poleL: P_POLE_L, fingersR: 'grip', fingersL: 'grab', name: 'idle_pistol' }));
    lockFeet(skel, c, { speed: 0 });
    finish('idle_pistol', c, { notes: 'pistol at compressed ready (two hands, at the sternum, muzzle forward-down); UAL1 Idle_Loop breathing; upper body also used over walk / run legs' });
  }
  if (want('aim_pistol')) {
    const dur = 2.0, frames = Math.round(dur * fps) + 1, poses = [];
    for (let f = 0; f < frames; f++) poses.push(pistolAim(0, Math.sin(f / (frames - 1) * Math.PI * 2) * 0.6, 'aim_pistol'));
    poses[frames - 1] = clonePose(poses[0]);
    const c = { name: 'aim_pistol', fps, poses, loop: true, meta: { source: 'procedural (IK) on UAL1 Idle_Loop stance' } };
    lockFeet(skel, c, { speed: 0 });
    finish('aim_pistol', c, { notes: 'isosceles two-hand aim, sights on the eye line; frame 0 = fire_pistol frame 0' });
  }
  if (want('fire_pistol')) {
    const dur = 0.4, frames = Math.round(dur * fps) + 1, poses = [];
    const PK = [0, 1, 0.55, 0.25, 0.08, 0];
    for (let f = 0; f < frames; f++) poses.push(pistolAim(PK[f % 6], 0, 'fire_pistol'));
    poses[frames - 1] = clonePose(poses[0]);
    const c = { name: 'fire_pistol', fps, poses, loop: true, meta: { source: 'procedural recoil on UAL1 Idle_Loop stance' } };
    lockFeet(skel, c, { speed: 0 });
    finish('fire_pistol', c, { notes: '2 shots per 0.4 s loop, kick per frame (24 mm back, 9 deg muzzle flip)', events: { shots: [0, 0.2] }, shotInterval: 0.2 });
  }
  if (want('reload_pistol')) {
    const L = (g) => handInGun('l', g);
    const ev = { magOut: 0.45, magIn: 1.35, charge: 1.5 };
    // weapon space from the grip point: mag base under the grip (palm up)
    const base = L({ at: V3(0, -0.06, 0.004), F: V3(0.6, 0.05, -0.8), N: V3(0.05, 1, 0.1), palm: [0.022, 0.045] });
    const c = reloadClip('reload_pistol', {
      dur: 1.8, events: ev,
      keys: [
        { t: 0.0, g: 'hold' }, { t: 0.12, g: 'hold' },
        { t: 0.32, g: 'base' }, { t: 0.45, g: 'base', off: V3(0, -0.02, 0) }, { t: 0.6, g: 'base', off: V3(0.02, -0.12, 0.04) },
        { t: 0.86, g: 'pouch' }, { t: 1.0, g: 'pouch', off: V3(0, 0.03, 0.02) },
        { t: 1.22, g: 'base', off: V3(0, -0.1, 0.02) }, { t: 1.35, g: 'base' }, { t: 1.42, g: 'base', off: V3(0, 0.012, 0) },
        { t: 1.6, g: 'hold' }, { t: 1.8, g: 'hold' },
      ],
      grips: { hold: HLP, base },
      fingers: { hold: 'grab', base: 'grab', pouch: 'grab' },
      post: (k) => ({ lean: 4, twist: -5, neck: -2 - 8 * k, head: 2 + 8 * k, damp: 0.6, clav: PISTOL_CLAV }),
      base: pistolReady,
      tilted: (fk) => { const G = pistolReady(fk); G.q.multiply(Q().setFromAxisAngle(V3(0, 0, 1), -30 * DEG)).multiply(Q().setFromAxisAngle(V3(1, 0, 0), 20 * DEG)); G.p.add(V3(0.02, 0.06, -0.02)); return G; },
      poleR: P_POLE_R, poleL: P_POLE_L,
    });
    finish('reload_pistol', c, { notes: 'mag dropped, new mag from the chest pouch, seated with a palm slap; starts / ends on idle_pistol', events: ev });
  }

  // ------------------------------------------------------------------------------------------ death
  if (want('death')) {
    const c = fromUAL(skel, 1, 'Death01', { name: 'death' });
    c.loop = false;
    for (const p of c.poses) { p.root.x -= c.poses[0].root.x; p.root.z -= c.poses[0].root.z; }
    groundAll(skel, c, 0.03);
    for (const p of c.poses) setFingers(p, 'r', 'grip');
    finish('death', c, { notes: 'UAL1 Death01: hit, stagger, fall on the back; hold the last frame', events: { ground: 1.0 } });
  }

  // ------------------------------------------------------------------------------------------ downed (lying, one arm up)
  if (want('downed')) {
    const lay = fromUAL(skel, 2, 'LayToIdle', { name: 'tmp' });
    const base = clonePose(lay.poses[0]);
    const dur = 3.0, frames = Math.round(dur * fps) + 1;
    const poses = [];
    for (let f = 0; f < frames; f++) {
      const t = f / fps;
      const p = clonePose(base);
      const br = Math.sin(t / dur * Math.PI * 2 * 3); // laboured breathing: 3 breaths per loop
      const wave = loopNoise(t, dur, 1, 3);
      applyOffsets(S, p, { spine_02: [-2 * br, 0, 0], spine_03: [-3 * br, 0, 0], neck_01: [8, 0, 0], head: [10 + wave * 3, 10 + wave * 6, 0] });
      setOffsets(S, p, { clavicle_l: [0, 6, 8], upperarm_l: [-100 + wave * 8, 0, 18 + wave * 6], lowerarm_l: [-30 - wave * 12, 0, 0], hand_l: [-15, 0, 0] });
      setFingers(p, 'l', 'relaxed');
      const fk = S.fk(p);
      // rifle lying across the body (world space of the lying pose: head towards -Z, face up)
      const pp = fk.wp[pel];
      const G = gunFrame(V3(pp.x - 0.15, pp.y + 0.14, pp.z - 0.32), V3(0.32, 0.02, 0.95), 80);
      const wr = frameMul(G, HR);
      twoBoneIK(S, p, ARM(S, 'r'), wr.p, V3(-1, -0.3, 0).normalize(), wr.q, fk, 0.02);
      setFingers(p, 'r', 'grip');
      poses.push(p);
    }
    poses[frames - 1] = clonePose(poses[0]);
    const c = { name: 'downed', fps, poses, loop: true, meta: { source: 'UAL2 LayToIdle (first frame) + procedural arm / breathing' } };
    groundAll(skel, c, 0.03);
    finish('downed', c, { notes: 'lying on the back, left arm raised calling for help, rifle in the right hand; loop' });
  }

  // ------------------------------------------------------------------------------------------ sling (revive)
  // The rifle is slung on the back for the revive: muzzle down behind the right shoulder blade, its side flat on the
  // back plate bag (ejection side out, magazine towards the spine). extras.sling = that weapon frame in spine_03
  // space (same convention as handSocket); remote.js re-parents the weapon to it while the clip plays.
  const sling = (() => {
    const PB = res.PB, pb = res.plateB;
    const x = -0.115, y = pb.top - 0.035;
    const backZ = -(PB.depth(x, y) + pb.th);
    const md = V3(-Math.sin(6 * DEG), -Math.cos(6 * DEG), -0.03).normalize(); // muzzle: down, a little out to the right, off the buttocks
    const X = V3(0, 0, -1).addScaledVector(md, -V3(0, 0, -1).dot(md)).normalize(); // ejection side faces out of the back
    const Z = md.clone().negate(), Y = Z.clone().cross(X).normalize();
    const q = Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
    const butt = V3(x, y, backZ - 0.052);
    const world = { p: butt.sub(BUTT.clone().applyQuaternion(q)), q };
    return frameMul(frameInv({ p: S.restWorldP[sp3].clone(), q: S.restWorldQ[sp3].clone() }), world);
  })();
  const slungFrame = (fk) => frameMul({ p: fk.wp[sp3], q: fk.wq[sp3] }, sling);

  // ------------------------------------------------------------------------------------------ revive (kneel)
  if (want('revive')) {
    // Fixing_Kneeling kneels down, works, stands up again: the kneeling part is the loop base. The trunk is
    // straightened to <= 28 deg from vertical (it folded the head down to the knee), both hands work on the casualty
    // ~0.45 m in front at ~0.25 m (alternating pressure / packing motion), the head looks at the hands and the rifle
    // is slung on the back (extras.sling).
    const src = fromUAL(skel, 1, 'Fixing_Kneeling', { name: 'revive' });
    const c = makeLoop(src, Math.round(1.05 * 30), Math.round(3.75 * 30), 12);
    c.name = 'revive';
    c.meta = { ...src.meta, speed: 0 };
    const P = (c.poses.length - 1) / c.fps;
    let trunk = 0;
    // casualty point: in front of the kneeling pelvis (mean over the loop, so it does not slide)
    const centre = V3();
    for (const p of c.poses) centre.add(S.fk(p).wp[pel]);
    centre.divideScalar(c.poses.length);
    mapPoses(c, (p, f, t) => {
      for (const b of ['spine_01', 'spine_02', 'spine_03']) p.q[I(b)].slerp(S.restLocalQ[I(b)], 0.35);
      trunk = Math.max(trunk, setTrunk(p, 30));
      applyOffsets(S, p, { clavicle_l: [0, -16, -6], clavicle_r: [0, -16, -6] }); // shoulders forward and down over the work
      const ph = (t / P) * Math.PI * 2 * 3;
      const base = V3(centre.x + 0.03, 0.31, centre.z + 0.40);
      if (process.env.SOLDIER_DEBUG && f === 0) { const k = S.fk(p); const t = k.wp[I('neck_01')].clone().sub(k.wp[pel]); console.log('  revive trunk', (Math.atan2(Math.hypot(t.x, t.z), t.y) / DEG).toFixed(1), 'neck', k.wp[I('neck_01')].toArray().map((v) => v.toFixed(3)).join(','), 'pelvis q', k.wq[pel].toArray().map((v) => v.toFixed(2)).join(',')); }
      const tl = base.clone().add(V3(0.075 + 0.02 * Math.cos(ph), 0.012 * Math.sin(ph) + 0.01 * (Math.sin(ph) > 0 ? 1 : 0), 0.02 * Math.sin(ph)));
      const tr = base.clone().add(V3(-0.07 + 0.01 * Math.sin(ph + 1.2), 0.018 * Math.max(0, Math.sin(ph + 1.9)), -0.015 + 0.012 * Math.cos(ph + 0.7)));
      for (const [s, at, F, N, pole] of [['l', tl, V3(-0.3, -0.35, 1), V3(0.12, -1, 0.1), V3(0.8, -0.3, -0.5)], ['r', tr, V3(0.3, -0.35, 1), V3(-0.12, -1, 0.1), V3(-0.8, -0.3, -0.5)]]) {
        const w = handWorld(s, at, F, N, [0.024, 0.055]);
        const fk = S.fk(p);
        twoBoneIK(S, p, ARM(S, s), w.p, pole.normalize(), w.q, fk, 0.01);
        setFingers(p, s, 'press');
        const e = ikErr.revive || (ikErr.revive = { r: 0, l: 0 });
        e[s] = Math.max(e[s], S.fk(p).wp[I('hand_' + s)].distanceTo(w.p));
      }
      const fk = S.fk(p);
      const look = tl.clone().add(tr).multiplyScalar(0.5).sub(eyeWorld(fk));
      const hz = Math.hypot(look.x, look.z);
      look.y = Math.max(look.y, -Math.tan(50 * DEG) * hz);
      aimHead(p, look, 0.9);
      return p;
    });
    lockFeet(skel, c, { speed: 0 });
    finish('revive', c, { notes: `UAL1 Fixing_Kneeling legs (one knee down), trunk <= ${trunk.toFixed(0)} deg from vertical, both hands working on the casualty ~0.4 m in front at ~0.3 m (chest of a casualty in a plate carrier), head on the hands, rifle slung on the back (extras.sling)`, sling: true });
  }

  // ------------------------------------------------------------------------------------------ per-weapon cheek weld
  // aim / fire are authored on the highest sight line (M4). For a weapon with a lower sight line (AK irons 0.124, SMGs)
  // remote.js tips the head down by extras.aimWeld.perWeapon[id] (radians, about the model's lateral axis, spread over
  // HEAD_CHAIN) while aim / fire play. The angle brings the eye to 4 mm above that weapon's sight line, but never
  // lets the head / helmet sink more than 9 mm into that weapon (checked on the aim frame and the fire kick frames).
  // Unknown weapons at runtime: angle = clamp((eyeY - sight height) * perMetre, minAngle, maxAngle).
  const HEAD_CHAIN = [['neck_01', 0.55], ['head', 0.45]];
  const dropPose = (pose, a) => { for (const [b, k] of HEAD_CHAIN) rotWorld(pose, b, Q().setFromAxisAngle(V3(1, 0, 0), a * k)); return pose; };
  const aimWeld = { chain: HEAD_CHAIN, perWeapon: {}, eyeY: 0, perMetre: 0, maxAngle: 0.3, minAngle: -0.16 };
  const weldRows = {};
  if (clips.aim_rifle && clips.fire_rifle) {
    const probe = [clips.aim_rifle.poses[0], clips.fire_rifle.poses[1], clips.fire_rifle.poses[2]];
    const eyeY = (pose, a) => { const q = dropPose(clonePose(pose), a), fk = S.fk(q); return toGun(gunPoints(fk).G, eyeWorld(fk)).y; };
    aimWeld.eyeY = +eyeY(probe[0], 0).toFixed(4);
    aimWeld.perMetre = +(0.1 / (eyeY(probe[0], 0) - eyeY(probe[0], 0.1))).toFixed(3); // radians per metre of eye drop
    for (const m of aimGuns) {
      const sight = (m.points.S_optic || m.points.S_sight_rear || V3(0, aimWeld.eyeY, 0)).y;
      const deep = (a) => Math.max(...probe.map((pose) => { const q = dropPose(clonePose(pose), a), fk = S.fk(q); return headInGun(fk, gunPoints(fk).G, [m]); }));
      // as close to 4 mm above the sight line as the head clearance allows; a straight stock (M4 / MP5 class) may
      // need the head a little higher than authored (negative angle, at most ~2.5 cm more eye height)
      let a = Math.max(aimWeld.minAngle, Math.min(aimWeld.maxAngle, (aimWeld.eyeY - sight - 0.004) * aimWeld.perMetre));
      while (a > aimWeld.minAngle + 1e-4 && deep(a) > 0.009) a = Math.max(aimWeld.minAngle, a - 0.008);
      aimWeld.perWeapon[m.id] = +a.toFixed(4);
      const off = eyeY(probe[0], a) - sight;
      weldRows[m.id] = { sight: +sight.toFixed(3), angle: +(a / DEG).toFixed(1), eyeAboveSight: +off.toFixed(3), head: +deep(a).toFixed(3) };
    }
    console.log('  per-weapon cheek weld (eye height above the sight line / head in weapon, m):', JSON.stringify(weldRows));
  }

  const order = ['idle_rifle', 'walk_rifle', 'run_rifle', 'crouch_idle', 'crouch_walk', 'aim_rifle', 'fire_rifle', 'reload_rifle',
    'idle_pistol', 'aim_pistol', 'fire_pistol', 'reload_pistol', 'downed', 'revive', 'death'];
  const list = order.filter((n) => clips[n]).map((n) => clips[n]);
  console.log(`  carry solve (${STOCK.length} stock samples; u = fallback blend, support-hand slide):`, JSON.stringify(solveLog));
  console.log('  max IK error (m):', JSON.stringify(ikErr, (k, v) => (typeof v === 'number' ? +v.toFixed(3) : v)));
  console.log('  cheek-weld / sight-line eye error (m):', JSON.stringify(weldErr, (k, v) => (typeof v === 'number' ? +v.toFixed(3) : v)));
  // ground clamp check: the weapon (carried by hand_r through the socket) must stay above the floor in every frame.
  // death is exempt (the game drops the weapon from the hand when the body hits the ground)
  const bad = [];
  for (const c of list) {
    const pistol = /pistol/.test(c.name);
    let low = Infinity, aimPitch = null, pitchR = [Infinity, -Infinity];
    for (const p of c.poses) {
      const fk = S.fk(p);
      const g = c.name === 'revive' ? { low: Math.min(...[MUZZLE.rifle, BUTT].map((v) => frameMul(slungFrame(fk), { p: v, q: Q() }).p.y)) } : gunPoints(fk, pistol);
      low = Math.min(low, g.low);
      if (g.dir) { const pd = Math.asin(g.dir.y) / DEG; pitchR = [Math.min(pitchR[0], pd), Math.max(pitchR[1], pd)]; }
    }
    if (/^(aim|fire)_/.test(c.name)) { const g = gunPoints(S.fk(c.poses[0]), pistol); aimPitch = Math.asin(g.dir.y) / DEG; }
    meta[c.name].gunLow = +low.toFixed(3);
    if (low < 0.02 && c.name !== 'death') bad.push(`${c.name} ${low.toFixed(3)}`);
    console.log(`  clip ${c.name.padEnd(13)} ${((c.poses.length - 1) / c.fps).toFixed(2)}s ${c.loop ? 'loop' : '    '} v=${(c.meta?.speed || 0).toFixed(2)}  weapon low point ${low.toFixed(3)} m${aimPitch !== null ? `  bore pitch ${aimPitch.toFixed(1)} deg` : isFinite(pitchR[0]) ? `  bore pitch ${pitchR[0].toFixed(0)}..${pitchR[1].toFixed(0)} deg` : ''}`);
  }
  if (bad.length) console.warn('  WARNING weapon below the floor in:', bad.join(', '));
  // collision QA (build fails above 1 cm unless SOLDIER_CHECK=warn): stock vs torso / plate carrier in every rifle
  // clip frame and head vs weapon in aim / fire for the AK and the M4, the slung rifle vs the body in revive for every
  // rifle-class model (the SMG rows are reported for information: their straight stocks rest on the jaw ~1 cm)
  const rows = collisionReport(S, res, list, (fk) => gunPoints(fk).G, { sling: slungFrame, headDrop: (pose, id) => dropPose(clonePose(pose), aimWeld.perWeapon[id] || 0) });
  const fails = [];
  for (const [n, r] of Object.entries(rows)) for (const [id, e] of Object.entries(r)) {
    if (e.torso > 0.01 && (id === 'akm' || id === 'm4')) fails.push(`${n}/${id} stock in torso ${(e.torso * 100).toFixed(1)} cm`);
    if (e.head > 0.01 && (id === 'akm' || id === 'm4')) fails.push(`${n}/${id} head in weapon ${(e.head * 100).toFixed(1)} cm`);
    if (e.slung > 0.01) fails.push(`${n}/${id} slung rifle in body ${(e.slung * 100).toFixed(1)} cm`);
  }
  if (fails.length) {
    const msg = 'collision check failed: ' + fails.join('; ');
    if (strict) throw new Error(msg);
    console.warn('  WARNING ' + msg);
  }
  const handSocket = {
    bone: 'hand_r',
    position: socket.p.toArray().map((v) => +v.toFixed(5)),
    quaternion: socket.q.toArray().map((v) => +v.toFixed(6)),
    point: 'S_grip_r',
    note: 'weapon frame (origin at S_grip_r, weapon axes) in hand_r space: gun.quaternion = q; gun.position = p - S_grip_r.position.applyQuaternion(q)',
  };
  const slingSocket = {
    bone: 'spine_03',
    position: sling.p.toArray().map((v) => +v.toFixed(5)),
    quaternion: sling.q.toArray().map((v) => +v.toFixed(6)),
    point: 'S_grip_r', clips: ['revive'],
    note: 'rifle slung on the back while these clips play: same convention as handSocket, parent bone spine_03',
  };
  return {
    skel, clips: list, aliases: { run: 'run_rifle' }, collision: rows,
    extras: { handSocket, sling: slingSocket, aimWeld, clips: { ...meta, run: { ...meta.run_rifle, alias: 'run_rifle' } }, support: { bone: 'hand_l', point: 'S_grip_l', authoredFor: 'rifle handguard 0.19-0.30 m ahead of the grip (AK / M4); slides back where the arms are short' } },
  };
}
