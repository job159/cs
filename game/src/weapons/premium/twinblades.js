// 虹霓．雙絕 Hongni Prismedge — 神兵 X06 dual sabres (docs/PREMIUM_WEAPONS.md §2.33; def in defs.js, model
// tools/assets/weapons/twinblades.mjs, FX pieces twinblades_fx.js). A premium melee on the dual grip: the special drives
// its own attacks (Arsenal._melee -> special.melee), the skills run on the specials v2 engine, and the two sabres are
// posed by the weapon itself: every clip carries per-hand keys (camera-space grip position, blade direction, edge
// direction; quaternion interpolation) that partsHook writes into R_gun / L_gun each frame -- the hands follow by IK.
//   LMB tap   疾虹五連: 虹 right diagonal 60 -> 霓 left diagonal 60 -> 虹 flat sweep 70 -> 霓 rising cut 70 -> 交虹: both
//             blades crossed down through an X 160 that throws the 虹橋 X wave (9 m, 90 each, pierces); every cut hits
//             everything in its arc; one colour a blade (虹 gold -> vermilion, 霓 cyan -> violet), the cut that connects
//             burns brighter (§1.17), hit-stop, a roll of the view towards the cutting side, prism sparks, blood
//   LMB held  虹貫: after a cut, still held = the iai stance (blades crossed at the left hip, a rainbow path on the
//             street to where the dash ends); release = an 8 m dash through the horde (invulnerable, 70 each) and 0.3 s
//             later 後斬: every body passed bursts with a warm-and-cool X cut (180, severs)
//   RMB held  交虹 guard: blades crossed in an X; -70 % from the front 150°; a hit within 0.3 s of raising it = parry:
//             a white freeze, the attacker reels, 霓返 follows (eight cuts all round in 0.5 s, 40 each)
//   Q tap     虹輪 (40 刃氣): six glazed spirit blades (warm / cool) orbit 2.4 m out for 5 s, 22 each pass, shoving;
//             雙虹 +10 % team damage within 4 m; the real blades keep cutting meanwhile
//   Q held    千刃蓮華 (ult, 5,500 damage): the two sabres thrown spinning to the mark (crosshair ground / zombie, else
//             the densest cluster within 25 m, else 10 m ahead), a lotus sigil, twelve 3 m spirit blades rise round it
//             as petals, close through the centre one by one (90 a lane), spin (pulling in) and bloom (600); the
//             sabres fly back into the hands
//   kill      KE_PRISM: a warm and a cool cut crossing on the body, prism chips, a pale violet rim (≤ 3 at a time);
//             the wave's last kill: two spirit blades cross-cut it from the sky (KE_FINAL)
//   crisis    虹障 (crisis.js, knock): a crossed-blade prism veil flashes up and shatters
// Sound cues (§1.12, produced later): see SFX; a missing cue falls back to an existing sample or stays silent.
import * as THREE from 'three';
import { registerSpecial, registerSkill, startSkill, endSkill, meterAdd, meterEvent, canCast, addAura } from '../specials.js';
import { registerClip } from '../../player/clips.js';
import { registerCrosshair } from '../../ui/crosshairs.js';
import { registerKillMark } from '../../ui/killmarks.js';
import { SKINS } from '../../ui/dmgnums.js';
import { FRAME, DECAL, DECAL_TINT } from '../../fx/fx.js';
import { applyHardSurface } from '../../gfx/materials.js';
import { instanceGLB } from '../../engine/assets.js';
import { WEAPONS } from '../defs.js';
import { clipComfort, haptic } from '../arsenal.js';
import { HONG, NI, waveMesh, pathMesh, cutPair, orbitRing, phantomGeometry } from './twinblades_fx.js';

const ID = 'twinblades';
const WHITE = [5.2, 4.8, 4.4];
const GOLD = HONG.core, VERM = HONG.body, CYAN = NI.core, VIO = NI.body;
const UP = new THREE.Vector3(0, 1, 0);
const V3 = () => new THREE.Vector3();
const _a = V3(), _b = V3(), _c = V3(), _d = V3(), _e = V3(), _f = V3(), _q = new THREE.Quaternion();
const R = Math.random;
const G_PLAYER = 15.2;                                   // controller gravity (player/controller.js MOVE.gravity)
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const shake = (g, a) => { if (clipComfort.shake) g.addShake?.(a); };
const stop = (g, s) => { if (clipComfort.hitstop) g.hitStop?.(s); };
const SIDE = (H) => (H === 'L' ? 'l' : 'r');
const COLS = { R: HONG, L: NI };
/** a spectral colour (0..1 round the rainbow), HDR k */
const spec = (x, k = 2.6) => { const h = ((x % 1) + 1) % 1; return [clamp(Math.abs(h * 6 - 3) - 1, 0, 1) * k + 0.25, clamp(2 - Math.abs(h * 6 - 2), 0, 1) * k + 0.2, clamp(2 - Math.abs(h * 6 - 4), 0, 1) * k + 0.3]; };
// sound cues: name -> fallback (existing sample) | null
const SFX = {
  twinblades_draw: 'draw', twinblades_draw_first: 'draw', twinblades_first_sting: null, twinblades_clash: 'impact_metal', twinblades_idle: null,
  twinblades_swing_r: 'swing', twinblades_swing_l: 'swing', twinblades_swing_cross: 'swingHeavy', twinblades_hit: 'knife_hit_flesh', twinblades_hit_flesh: 'knife_hit_flesh',
  twinblades_hit_wall: 'knife_hit_wall', twinblades_kill: null, twinblades_sever: 'gib', twinblades_wave: 'swingHeavy', twinblades_wave_hit: 'knife_hit_flesh',
  twinblades_dash_charge: null, twinblades_dash: 'swingHeavy', twinblades_aftercut: 'impact_metal',
  twinblades_guard_up: 'knife_hit_wall', twinblades_block: 'impact_metal', twinblades_parry: 'bifang_bell', twinblades_flurry: 'swing',
  twinblades_storm_start: 'swingHeavy', twinblades_storm: null, twinblades_storm_hit: 'knife_hit_flesh', twinblades_storm_end: 'swing',
  twinblades_ult_cast: null, twinblades_ult_throw: 'swingHeavy', twinblades_ult_sigil: 'bifang_bell', twinblades_ult_rise: null, twinblades_ult_petal: 'swing',
  twinblades_ult_spin: 'swingHeavy', twinblades_ult_bloom: 'explosion_large', twinblades_ult_shatter: 'impact_glass', twinblades_ult_bed: null,
  twinblades_catch: 'impact_metal', ready_twinblades: null, twinblades_inspect: 'cloth', twinblades_link: 'impact_metal', twinblades_recover: 'cloth',
  twinblades_crisis: 'impact_glass', twinblades_final: 'explosion_far',
};
function sfx(g, name, o = {}) {
  const au = g.audio;
  if (!au) return null;
  if (au.has?.(name)) return au.play(name, o);
  const fb = SFX[name];
  return fb ? au.play(fb, { ...o, volume: (o.volume ?? 1) * 0.7 }) : null;
}
const psOf = (vm, name) => vm.partState[name] || (vm.partState[name] = { v: 0 });

// ------------------------------------------------------------------------------------------ per-weapon state
function ssOf(ws) {
  return ws.sp.tb || (ws.sp.tb = {
    mode: 'idle', t: 0, cur: null, step: -1, hit: false, chainT: 0, buf: 0, pressing: false, pressT: 0, fresh: true,
    lockT: 0, combos: 0, dash: null, dashCd: 0, ct: 0, guard: null, guardEnd: -9, storm: null, ultK: null, q: [], view: { w: null },
    hum: null, chargeSnd: null, readyN: false, readyT: 0, finalWave: -1, lastHand: 'L',
    pose: { R: { p: V3(), q: new THREE.Quaternion() }, L: { p: V3(), q: new THREE.Quaternion() } }, poseOK: false,
    kick: { R: { x: 0, v: 0, y: 0, w: 0 }, L: { x: 0, v: 0, y: 0, w: 0 } }, dev: DEV,
  });
}
function later(ws, sec, fn) { ssOf(ws).q.push([sec, fn]); }
function runQueue(ss, dt) { const q = ss.q; for (let i = q.length - 1; i >= 0; i--) if ((q[i][0] -= dt) <= 0) { const f = q[i][1]; q.splice(i, 1); f(); } }
const held = (g, ws) => g.arsenal?.current === ws;
function eyeFwd(g, eye = _a, fwd = _b) {
  const cam = g.camera;
  eye.copy(cam.position);
  cam.getWorldDirection(fwd); fwd.y = 0;
  if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
  return fwd.normalize();
}
const floorAt = (g, p) => { const y = g.world?.collision?.floorBelow?.(_f.set(p.x, p.y + 0.6, p.z), 0.2, 30); return Number.isFinite(y) ? y : p.y; };

// ------------------------------------------------------------------------------------------ world system (per game)
// KE_PRISM cut pairs, the dash path, flying X waves, the real sabres for the ult throw
function sys(g) {
  if (g._tb) return g._tb;
  const S = g._tb = { cuts: [], cutPool: [], slashPool: [], kf: 0, ck: [], path: null, blades: null, update: (dt) => sysUpdate(g, S, dt) };
  for (let i = 0; i < 3; i++) { const m = cutPair(); g.scene.add(m); S.cutPool.push(m); }
  for (let i = 0; i < 6; i++) { const m = cutPair(); g.scene.add(m); S.slashPool.push(m); }
  S.screenX = cutPair(); g.camera.add(S.screenX);                // the after-cut X across the view
  S.path = pathMesh(); g.scene.add(S.path);
  g.systems.push(S);
  // the real sabres (world materials) for the 千刃蓮華 throw: R_gun / L_gun cut out of the model, loaded once per game
  instanceGLB(`weapons/${WEAPONS[ID]?.model || ID}.glb`).then((root) => {
    root.traverse((o) => { if (o.userData?.restHidden) o.visible = false; });
    applyHardSurface(root, { premium: WEAPONS[ID]?.premium, premiumKey: `p3:${ID}:throw`, world: true });
    root.updateMatrixWorld(true);
    const take = (name) => {
      const n = root.getObjectByName(name);
      if (!n) return null;
      const grp = new THREE.Group(), c = n.clone(true);
      c.position.set(0, 0, 0);                                   // the grip at the origin
      grp.add(c);
      return grp;
    };
    S.blades = { R: take('R_gun'), L: take('L_gun') };
    // their world materials compile now, hidden (the first 千刃蓮華 throw hitched ~1 s compiling them)
    const wg = new THREE.Group();
    for (const b of Object.values(S.blades)) if (b) { const c = b.clone(true); c.traverse((o) => { o.frustumCulled = false; }); wg.add(c); }
    wg.position.set(0, -500, 0); g.scene.add(wg);
    g.renderer?.gl?.compileAsync?.(wg, g.camera, g.scene)?.then?.(() => wg.removeFromParent())?.catch?.(() => wg.removeFromParent());
  }).catch((e) => console.warn('[twinblades] world blades', e));
  return S;
}
function sysUpdate(g, S, dt) {
  S.kf = 0;
  for (let i = S.ck.length - 1; i >= 0; i--) if ((S.ck[i].t -= dt) <= 0) S.ck.splice(i, 1);
  for (let i = S.cuts.length - 1; i >= 0; i--) {
    const c = S.cuts[i], T = c.T || CUT_T;
    c.t += dt;
    for (const [k, m] of c.mesh.userData.mats.entries()) {
      const tt = c.t - k * (c.slash ? 0.02 : 0.05);
      m.uniforms.uT.value = clamp(tt / T.ramp, 0, 1);
      m.uniforms.uFade.value = tt < T.hold ? 1 : Math.max(0, 1 - (tt - T.hold) / T.fade);
    }
    if (c.z) c.mesh.position.copy(c.z.pos).add(c.off);
    if (c.t >= T.end) { c.mesh.visible = false; S.cuts.splice(i, 1); }
  }
}

// ------------------------------------------------------------------------------------------ hits
const SEVER_HI = ['neck', 'neck', 'upperarm_l', 'upperarm_r'], SEVER_ANY = ['neck', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r'], SEVER_ARM = ['upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r'];
/**
 * One blow on a zombie (local player): damage + HUD + meters. `skill` tags a skill's own hits (the prism skin, no 刃氣
 * refund: the meter is earned by the 疾虹 cuts and parries).
 */
function strike(ws, g, z, dmg, dir, { knock = 1.6, stagger = 0.45, sever = null, point = null, tag = 'cut', head = false, skill = null, light = false, explosive = false, blood = 1 } = {}) {
  const ar = g.arsenal;
  const p = point || z.center(V3());
  const amount = dmg * (ar?.dmgMul ?? 1) * (head ? ws.def.head ?? 1.5 : 1), hp0 = z.hp ?? 0;
  let box = sever && amount >= hp0 * 0.98 ? (head ? 'neck' : sever[(R() * sever.length) | 0]) : undefined;
  if (!box && head && amount >= hp0 && !light) box = 'neck';
  if (!box && light && hp0 > 0 && amount >= hp0 * 1.6) box = SEVER_ARM[(R() * 4) | 0];
  const info = { amount, part: head ? 'head' : 'body', headshot: head, point: p, normal: dir.clone().negate(), dir: dir.clone(), knock: knock * (ar?.knockMul ?? 1), stagger,
    weapon: ID, shooter: g.localId, melee: true, box, ss: tag, explosive, blood };
  if (skill) info.skill = skill;
  const q0 = skill ? ws.sp?.m?.qi : undefined;
  const res = z.damage(info);
  g.hud?.onHit?.(info, res, z);
  ar?._special?.(ws, 'onHit', info, res, z);
  if (q0 !== undefined && ws.sp.m.qi > q0) ws.sp.m.qi = q0;
  if (res?.killed) {
    if (box) { z.sever?.(box, dir); sfx(g, 'twinblades_sever', { pos: p, volume: 0.7 }); }
    launch(z, dir, tag);
  }
  return res;
}
/** a sabre kill: the body thrown along the cut, the death clip skips its upright first beat and plays fast */
function launch(z, dir, tag) {
  if (!z.kvel || z.def?.boss) return;
  const k = { cut: [3.6, 2.6], cross: [5, 3.6], wave: [4.5, 3], pass: [2.5, 2], after: [5.5, 4.4], flurry: [4.5, 3.2], storm: [4.2, 2.8], ult: [6.5, 5.5] }[tag] || [4, 3];
  z.kvel.x += dir.x * k[0]; z.kvel.z += dir.z * k[0];
  z.kvel.y = Math.max(z.kvel.y || 0, k[1] * (0.85 + R() * 0.3));
  const a = z.action, d = a?.getClip?.().duration;
  if (d) { a.time = Math.min(d * 0.3, 0.32); a.timeScale = Math.max(a.timeScale, 1.6); }
}
/** zombies inside a horizontal sector round the eye (arc 360 = all round), not behind a wall */
function inSector(g, eye, fwd, r, arc, { dy = 2.4 } = {}) {
  const out = [];
  for (const z of g.zombies?.list || []) {
    if (!z.alive) continue;
    const zc = z.center(V3());
    const dx = zc.x - eye.x, dz = zc.z - eye.z, d = Math.hypot(dx, dz);
    if (d > r + (z.radius ?? 0.4) || Math.abs(zc.y - eye.y) > dy + (z.def?.boss ? 3 : 0)) continue;
    const ang = d < 1e-3 ? 0 : Math.acos(clamp((dx * fwd.x + dz * fwd.z) / d, -1, 1)) * 180 / Math.PI;
    if (arc < 360 && ang > arc / 2 + (d < 1.2 ? 35 : 6)) continue;
    const dir = _c.copy(zc).sub(eye), dl = dir.length();
    dir.multiplyScalar(1 / Math.max(1e-3, dl));
    const wh = g.world?.collision?.raycast(eye, dir, dl);
    if (wh && wh.dist < dl - 0.6) continue;
    const side = (fwd.x * dz - fwd.z * dx) < 0 ? 1 : -1;   // + = right of the view
    out.push({ z, d, ang, side, zc });
  }
  return out;
}
// where each cut crosses a target relative to the eye: [height at the eye, rise per side (+ = higher on the right)]
const CUT_Y = { r1: [-0.18, 0.45], l1: [-0.18, -0.45], r2: [-0.12, 0], l2: [-0.4, -0.5], x: [-0.25, 0], flurry: [-0.2, 0] };
/** a cut connecting: everything in the arc; a flesh layer per body (≤ 3), a kill sound per kill (≤ 2) */
function sweep(ws, g, c, hand) {
  const eye = _d.copy(g.camera.position), fwd = eyeFwd(g, _e, V3());
  const list = inSector(g, eye, fwd, c.r, c.arc);
  const look = g.camera.getWorldDirection(V3()), tanP = Math.tan(Math.asin(clamp(look.y, -0.95, 0.95))), [by, rise] = CUT_Y[c.id] || [-0.2, 0];
  const sweepDir = hand === 'R' ? 1 : hand === 'L' ? -1 : 0;
  let kills = 0, n = 0, heads = 0;
  list.sort((a, b) => a.ang - b.ang);
  for (const { z, zc, side, d } of list) {
    const dir = V3().subVectors(zc, eye).setY(0).normalize();
    dir.addScaledVector(_c.crossVectors(UP, dir), 0.55 * sweepDir).normalize();   // carried along the cut
    const bladeY = eye.y + by + tanP * d + rise * side * Math.min(1, d / 2.2);
    const head = !z.def?.boss && bladeY >= z.pos.y + (z.height ?? 1.8) * 0.8;
    const res = strike(ws, g, z, c.dmg, dir, { knock: c.knock, stagger: c.stagger, sever: c.id === 'x' ? SEVER_HI : null, tag: c.id === 'x' ? 'cross' : 'cut', head, light: c.id !== 'x', blood: n < 3 ? 1 : 0.3 });
    n++; if (head) heads++;
    if (res?.killed) kills++;
    else if (n <= 4) slashOn(g, z, hand, c.id);              // the cut drawn across the body (a kill gets the KE X)
    hitBurst(g, zc, dir, hand, n <= 3 ? 1 : 0.45, n <= 1 ? 1 : n <= 3 ? 0.5 : 0);
    if (n <= 3) sfx(g, 'twinblades_hit_flesh', { pos: zc, volume: 0.8 - n * 0.1, pitch: (hand === 'L' ? 1.1 : 0.95) + R() * 0.15, delay: (n - 1) * 0.015 });
    if (res?.killed && kills <= 2) sfx(g, 'twinblades_kill', { pos: zc, volume: 0.6, delay: (kills - 1) * 0.04 });
  }
  const heavy = c.id === 'x';
  if (n) {
    g.arsenal?._trailHit?.();                              // §1.17 the rest of the cut burns in its colour
    edgeSparks(g, hand, 8 + Math.min(10, n * 3));
    tipFlare(g, hand, heavy ? 1.4 : 1);
    stop(g, heavy ? (kills >= 2 ? 0.1 : 0.08) : kills >= 2 || (heads && kills) ? 0.06 : 0.04);
    shake(g, (heavy ? 0.2 : 0.07) + Math.min(heavy ? 0.15 : 0.08, n * 0.03));
    g.punch?.impulse?.((heavy ? -1.8 : -0.7) * 0.0175, sweepDir * 0.6 * 0.0175, sweepDir * 1.2 * 0.0175);
    bladeKick(ws, hand, heavy ? 1.4 : 1);
    if (heavy) g.arsenal?.fovKick?.(-1.5, 0.18);
    sfx(g, 'twinblades_hit', { volume: heavy ? 1 : 0.8, pitch: hand === 'L' ? 1.08 : 0.96 });
    haptic(heavy ? 32 : 18);
  } else wallClang(ws, g, eye, fwd, c.r, hand);
  return n;
}
/** a cut that met no zombie but a wall within reach: sparks and a clang */
function wallClang(ws, g, eye, fwd, r, hand) {
  const d = _c.copy(fwd); d.y = -0.1; d.normalize();
  const wh = g.world?.collision?.raycast(eye, d, r * 0.8);
  if (!wh) return;
  const C = COLS[hand] || HONG;
  g.fx?.impact?.(wh.surf, wh.point, wh.normal, d, { big: 0.7 });
  g.fx?.sparkBurst?.(wh.point, { color: WHITE, color1: C.body, count: 14, speed: 6, glow: 0.4, normal: wh.normal });
  sfx(g, 'twinblades_hit_wall', { pos: wh.point });
  shake(g, 0.06);
  haptic(12);
}
/** additive spark streaks flung off the cutting blade in the viewmodel (a cut that connects) */
function edgeSparks(g, hand, n) {
  const hs = hand === 'X' ? ['R', 'L'] : [hand];
  const vm = g.vm, P = g.fx?.particles;
  if (!P) return;
  for (const H of hs) {
    const C = COLS[H], a = vm.socketCam('mid_' + SIDE(H), _a), b = vm.socketCam('tip_' + SIDE(H), _b);
    if (!a || !b) continue;
    const v = ssOf(g.arsenal.current).view.tipV?.[H] || _c.set(0, 0, 0);
    for (let i = 0; i < n; i++) {
      const u = 0.1 + R() * 0.9, x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u, z = a.z + (b.z - a.z) * u, k = 0.3 + R() * 0.45;
      P.spawn({ additive: true, vm: true, x, y, z, vx: v.x * k + (R() - 0.5) * 0.5, vy: v.y * k + (R() - 0.3) * 0.4, vz: v.z * k + (R() - 0.5) * 0.3, life: 0.1 + R() * 0.12,
        size: 0.003 + R() * 0.003, stretch: 0.03, color: [...WHITE, 1], color1: [...C.body, 0], frame: FRAME.spark, gravity: 1.5, drag: 3 });
    }
  }
}
/**
 * The contact frame on the blade itself: a hot prism star at the point, a ring of spectral sparks, and a one-frame
 * smear (short streaks laid along the blade, flung with the point's speed)
 */
function tipFlare(g, hand, k = 1) {
  const vm = g.vm, P = g.fx?.particles;
  if (!P) return;
  for (const H of hand === 'X' ? ['R', 'L'] : [hand]) {
    const C = COLS[H], t = vm.socketCam('tip_' + SIDE(H), _a), b = vm.socketCam('base_' + SIDE(H), _b);
    if (!t || !b) continue;
    const v = ssOf(g.arsenal.current).view.tipV?.[H] || _c.set(0, 0, 0);
    // the star sits a little in from the point (the part of the edge that bit)
    const s = _d.copy(t).lerp(b, 0.12);
    P.spawn({ additive: true, vm: true, x: s.x, y: s.y, z: s.z, life: 0.09, size: 0.05 * k, size1: 0.1 * k, color: [...WHITE, 1], color1: [...C.body, 0], frame: FRAME.glint, rot: R() * 6 });
    P.spawn({ additive: true, vm: true, x: s.x, y: s.y, z: s.z, life: 0.12, size: 0.07 * k, size1: 0.13 * k, color: [...C.body, 0.8], color1: [...C.tail, 0], frame: FRAME.glow });
    for (let i = 0; i < 12 * k; i++) {
      const a = R() * 6.283, sp = 0.5 + R() * 0.9;
      P.spawn({ additive: true, vm: true, x: s.x, y: s.y, z: s.z, vx: Math.cos(a) * sp + v.x * 0.15, vy: Math.sin(a) * sp + v.y * 0.15, vz: 0.1, life: 0.1 + R() * 0.1,
        size: 0.0035, stretch: 0.025, color: [...(i % 3 ? spec(R(), 2.6) : WHITE), 1], color1: [...C.tail, 0], frame: FRAME.spark, gravity: 1.2, drag: 2 });
    }
    // smear: a sheet of streaks along the blade, one frame long
    for (let i = 0; i < 9; i++) {
      const u = 0.25 + i / 8 * 0.8, x = b.x + (t.x - b.x) * u, y = b.y + (t.y - b.y) * u, z = b.z + (t.z - b.z) * u;
      P.spawn({ additive: true, vm: true, x, y, z, vx: v.x * 0.35 * u, vy: v.y * 0.35 * u, vz: v.z * 0.35 * u, life: 0.05, size: 0.006, stretch: 0.06, color: [...C.core, 0.9], color1: [...C.body, 0], frame: FRAME.spark });
    }
  }
}
// screen angle of each cut's stroke on a body (the line drawn along it), radians from +x (camera right)
const CUT_ANG = { r1: -2.4, l1: -0.74, r2: Math.PI, l2: 0.72, flurry: 0 };
/** the cut drawn across a body that took it (warm 虹 / cool 霓, a pair for 交虹): 0.1 s, the KE_PRISM line, smaller */
function slashOn(g, z, hand, id) {
  const S = sys(g), cam = g.camera, c = z.center(V3());
  const m = S.slashPool.find((x) => !x.visible) || S.cuts.find((x) => x.slash)?.mesh;
  if (!m) return;
  const old = S.cuts.findIndex((x) => x.mesh === m); if (old >= 0) S.cuts.splice(old, 1);
  m.quaternion.copy(cam.quaternion);
  const L = 0.62 + R() * 0.15, j = (R() - 0.5) * 0.25;
  const pair = hand === 'X' ? [[0, 0.75 + j], [1, -0.75 + j]] : [[hand === 'L' ? 1 : 0, (CUT_ANG[id] ?? 0) + j]];
  m.children.forEach((ch) => { ch.visible = false; });
  for (const [ci, ang] of pair) {
    const mesh = m.children[ci];
    mesh.visible = true;
    mesh.rotation.set(0, 0, ang);
    mesh.position.set(-Math.cos(ang) * L / 2, -Math.sin(ang) * L / 2, 0);
    mesh.scale.set(L, 0.11, 1);
  }
  m.position.copy(c).addScaledVector(_a.copy(c).sub(cam.position).normalize(), -0.25);   // in front of the body
  m.visible = true;
  S.cuts.push({ mesh: m, t: 0, z, off: m.position.clone().sub(z.pos), slash: true, T: SLASH_T });
}
const CUT_T = { ramp: 0.07, hold: 0.18, fade: 0.22, end: 0.48 }, SLASH_T = { ramp: 0.035, hold: 0.07, fade: 0.1, end: 0.2 };
/** prism sparks, a coloured streak, blood chunks where the edge bites (gk: the glint, thinned on multi-hits) */
function hitBurst(g, p, dir, hand, k = 1, gk = 1) {
  const P = g.fx?.particles;
  if (!P) return;
  const C = hand === 'L' ? NI : HONG;
  for (let i = 0; i < 10 * k; i++) {
    _c.set(R() - 0.5, R() * 0.9 - 0.2, R() - 0.5).multiplyScalar(5).addScaledVector(dir, 3);
    const col = hand === 'X' ? (i % 2 ? HONG.core : NI.core) : i % 3 === 0 ? spec(R()) : C.core;
    P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, vx: _c.x, vy: _c.y, vz: _c.z, life: 0.18 + R() * 0.2, size: 0.022, stretch: 0.026, color: [...col, 1], color1: [...C.tail, 0], frame: FRAME.spark, gravity: 6, drag: 2 });
  }
  for (let i = 0; i < 4 * k; i++) {
    _c.set(R() - 0.5, R() * 0.8, R() - 0.5).multiplyScalar(2.6).addScaledVector(dir, 2.2);
    P.spawn({ x: p.x, y: p.y, z: p.z, vx: _c.x, vy: _c.y + 1, vz: _c.z, life: 0.6 + R() * 0.4, size: 0.03, color: [0.28, 0.02, 0.02, 1], color1: [0.2, 0.01, 0.01, 1],
      frame: FRAME.rock, lit: true, gravity: 12, spin: (R() - 0.5) * 16, rot: R() * 6, collide: true, bounce: 0.2 });
  }
  if (gk > 0) P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.1, size: 0.3 * k * gk, size1: 0.5 * k * gk, color: [...WHITE, 0.85], color1: [0, 0, 0, 0], frame: FRAME.glint, rot: R() * 6 });
  if (gk > 0) P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.14, size: 0.18 * k, size1: 0.36 * k, color: [...(hand === 'L' ? NI.body : HONG.body), 0.5], color1: [0, 0, 0, 0], frame: FRAME.glow });
}
/** KE_PRISM: a warm and a cool cut crossing on the body, prism chips; the n-th kill of a frame gets less */
function prismKill(g, z, dir, n = 1) {
  const S = sys(g), cam = g.camera, c = z.center(V3());
  let m = n <= 2 ? S.cutPool.find((x) => !x.visible) : null;
  if (!m && n <= 2) { const i = S.cuts.findIndex((x) => !x.slash); if (i >= 0) m = S.cuts.splice(i, 1)[0].mesh; }
  if (m) {
    const L = 0.9 + R() * 0.3;
    m.quaternion.copy(cam.quaternion);
    const [m0, m1] = m.children;
    for (const [mesh, ang] of [[m0, 0.75 + (R() - 0.5) * 0.3], [m1, -0.75 + (R() - 0.5) * 0.3]]) {
      mesh.visible = true;
      mesh.rotation.set(0, 0, ang);
      mesh.position.set(-Math.cos(ang) * L / 2, -Math.sin(ang) * L / 2, 0);
      mesh.scale.set(L, 0.16, 1);
    }
    m.position.copy(c);
    m.visible = true;
    S.cuts.push({ mesh: m, t: 0, z, off: m.position.clone().sub(z.pos) });
  }
  const P = g.fx?.particles;
  for (let i = 0; i < (n > 3 ? 4 : 9); i++) {
    const a = R() * 6.28, r = R() * 0.3;
    P?.spawn({ additive: true, x: c.x + Math.cos(a) * r, y: c.y - 0.2 + R() * 0.6, z: c.z + Math.sin(a) * r, vx: (R() - 0.5) * 1.2, vy: 0.6 + R() * 1.6, vz: (R() - 0.5) * 1.2, delay: 0.05 + R() * 0.2,
      life: 0.6 + R() * 0.5, size: 0.03 + R() * 0.03, size1: 0.006, color: [...spec(R(), 2.2), 1], color1: [0.3, 0.2, 0.5, 0], frame: i % 2 ? FRAME.glint : FRAME.glow, drag: 1.3, spin: (R() - 0.5) * 5, rot: R() * 6 });
  }
  if (n > 3) return;
  // a small star where the cuts cross (a body-sized pale glint and a lavender light washed whole packs pale violet)
  const gk = 1 / (1 + 0.6 * (n - 1));
  P?.spawn({ additive: true, x: c.x, y: c.y, z: c.z, life: 0.14, size: 0.32 * gk, size1: 0.55 * gk, color: [2.2, 1.9, 1.6, 0.8], color1: [0, 0, 0, 0], frame: FRAME.glint, rot: R() * 6 });
  if (n <= 1) g.fx?.lights?.flash?.(c, R() < 0.5 ? '#ff9a50' : '#8a7aff', 0.6, 1.3, 0.08);
}

// ------------------------------------------------------------------------------------------ the blade pose layer
// A pose is { p (camera-space grip), q (blade orientation: +y the blade, -z the edge, +x the flat) }. Clips carry
// per-hand keys bR / bL: [{ t (0..1 of the clip), p, q, e (ease into it), idle (follow the live idle pose) }].
const N3 = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
const _m4 = new THREE.Matrix4(), _bx = V3(), _by = V3(), _bz = V3();
/** blade orientation from a blade direction d (grip -> tip) and the way the edge faces, m */
function bq(d, m, out = new THREE.Quaternion()) {
  _by.set(d[0], d[1], d[2]).normalize();
  _bz.set(-m[0], -m[1], -m[2]);
  _bz.addScaledVector(_by, -_bz.dot(_by));
  if (_bz.lengthSq() < 1e-6) _bz.set(0, 0, 1).addScaledVector(_by, -_by.z);
  _bz.normalize();
  _bx.crossVectors(_by, _bz);
  return out.setFromRotationMatrix(_m4.makeBasis(_bx, _by, _bz));
}
const BLADE_REACH = 0.5;                                   // tip distance used to derive the leading edge (m)
const EASE = {
  linear: (t) => t, in: (t) => t * t, out: (t) => 1 - (1 - t) * (1 - t), inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  in3: (t) => t * t * t, out3: (t) => 1 - (1 - t) ** 3, outBack: (t) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; }, snap: (t) => (t < 1 ? 0 : 1),
};
// rest poses (camera space): both canted in, tips towards the upper middle (an open A round the crosshair), the flats
// and the dragon heads in profile to the eye (eye + pearl read), edges out; the fists low and wide, mostly under the
// frame (seen from behind they were two black balls over a quarter of the screen); 虹 a little taller than 霓
const IDLE = {
  R: { p: [0.2, -0.24, -0.42], d: N3(-0.11, 0.8, -0.58), m: N3(1, 0.09, -0.065) },
  L: { p: [-0.205, -0.25, -0.41], d: N3(0.15, 0.76, -0.62), m: N3(-1, 0.1, -0.08) },
};
const IDLE_Q = { R: bq(IDLE.R.d, IDLE.R.m), L: bq(IDLE.L.d, IDLE.L.m) };
const _iq = new THREE.Quaternion(), _ie = new THREE.Euler();
/** the live idle pose: the rest pose breathing (the two hands out of phase), ready: a slow tremor */
function idlePose(H, t, out, ready = 0) {
  const I = IDLE[H], ph = H === 'R' ? 0 : 1.9, br = Math.sin(t * 1.75 + ph);
  out.p.set(I.p[0] + Math.sin(t * 0.9 + ph) * 0.0015, I.p[1] + br * 0.003, I.p[2] + Math.sin(t * 1.1 + ph) * 0.0015);
  const j = ready * 0.006;
  out.q.copy(IDLE_Q[H]).multiply(_iq.setFromEuler(_ie.set(br * 0.012 + Math.sin(t * 3.3 + ph) * j, 0, Math.sin(t * 1.3 + ph) * 0.01 + Math.sin(t * 2.7) * j)));
  return out;
}
const _poseA = { p: V3(), q: new THREE.Quaternion() }, _poseB = { p: V3(), q: new THREE.Quaternion() };
function sampleBlade(keys, t, H, now, ready, out) {
  let i = 1;
  while (i < keys.length - 1 && keys[i].t < t) i++;
  const k0 = keys[i - 1], k1 = keys[i];
  const a = k0.idle ? idlePose(H, now, _poseA, ready) : k0, b = k1.idle ? idlePose(H, now, _poseB, ready) : k1;
  const span = k1.t - k0.t, u = span > 0 ? clamp((t - k0.t) / span, 0, 1) : 1, e = (EASE[k1.e] || EASE.inOut)(u);
  out.p.lerpVectors(a.p, b.p, e);
  out.q.slerpQuaternions(a.q, b.q, e);
  return out;
}
/**
 * A clip from per-hand key lists [t, p | null (keep), d | null (keep), m | null (lead with the edge), ease]: each hand
 * starts from where its sabre is now and ends on the live idle pose (end 'idle'), or holds its last key (end 'hold').
 */
function twinClip(vm, { R: kr = [], L: kl = [], dur, loop, events = [], tracks = {}, end = 'idle', endEase = 'inOut' } = {}) {
  const ss = vm?._tbss, t0 = vm?.time ?? 0;
  const mk = (H, keys) => {
    const cur = ss?.poseOK ? ss.pose[H] : idlePose(H, t0, { p: V3(), q: new THREE.Quaternion() });
    const out = [{ t: 0, p: cur.p.clone(), q: cur.q.clone(), d: V3().set(0, 1, 0).applyQuaternion(cur.q), e: 'linear' }];
    for (const [t, p, d, m, e] of keys) {
      const prev = out[out.length - 1];
      out.push({ t, p: p ? V3().fromArray(p) : prev.p.clone(), d: d ? V3().fromArray(d).normalize() : prev.d.clone(), m: m ? V3().fromArray(m) : null, keepQ: !d && !m ? prev : null, e: e || 'inOut' });
    }
    // the edge leads the motion: m from the tip's travel between the neighbouring keys
    for (let i = 1; i < out.length; i++) {
      const k = out[i];
      if (k.q) continue;
      if (k.keepQ) { k.q = k.keepQ.q.clone(); continue; }
      let m = k.m;
      if (!m) {
        const a = out[i - 1], b = out[i + 1] && !out[i + 1].keepQ ? out[i + 1] : k;
        const ta = _a.copy(a.d).multiplyScalar(BLADE_REACH).add(a.p), tb = _b.copy(b.d).multiplyScalar(BLADE_REACH).add(b.p);
        const mv = tb.sub(ta);
        mv.addScaledVector(k.d, -mv.dot(k.d));
        m = mv.lengthSq() > 1e-6 ? mv.normalize().clone() : V3().set(0, 0, -1).applyQuaternion(out[i - 1].q);
      }
      k.q = bq(k.d.toArray(), m.toArray());
    }
    if (end === 'idle') out.push({ t: 1, idle: true, e: endEase });
    return out;
  };
  const c = { tracks, events, bR: mk('R', kr), bL: mk('L', kl) };
  if (dur) c.duration = dur;
  if (loop) c.loop = loop;
  return c;
}
/** per-hand jolt (a cut that lands: the blade tips back in its plane and twists a little, springs home) */
function bladeKick(ws, hand, k = 1) {
  const ss = ssOf(ws);
  for (const H of hand === 'X' ? ['R', 'L'] : [hand]) { const s = ss.kick[H]; s.v -= 2.6 * k; s.w += (H === 'R' ? 1 : -1) * 1.4 * k; }
}
const _hq = new THREE.Quaternion(), _kq = new THREE.Quaternion(), _ke = new THREE.Euler(), _tipPrev = { R: V3(), L: V3() };
/** vm.weapon.onParts: write the sampled camera-space poses into R_gun / L_gun (in the hip frame) */
function partsHook(ws, vm, dt) {
  const w = vm.weapon, ss = ssOf(ws), c = vm.clip;
  if (!w?.parts?.R_gun) return;
  vm._tbss = ss;
  const ready = vm.readyW || 0;
  _hq.setFromEuler(vm.hip.rot).invert();
  for (const H of ['R', 'L']) {
    const part = w.parts[H + '_gun'], pose = ss.pose[H], keys = c.active ? c.clip?.['b' + H] : null;
    if (keys) sampleBlade(keys, c.t, H, vm.time, ready, pose); else idlePose(H, vm.time, pose, ready);
    // jolt spring (rad): x = tilt back in the blade plane, y = twist
    const s = ss.kick[H];
    s.v += (-160 * s.x - 15 * s.v) * dt; s.x += s.v * dt;
    s.w += (-180 * s.y - 16 * s.w) * dt; s.y += s.w * dt;
    const n = part.node;
    n.position.copy(pose.p).sub(vm.hip.pos).applyQuaternion(_hq).add(w.pivot);
    n.quaternion.copy(_hq).multiply(pose.q).multiply(_kq.setFromEuler(_ke.set(0, s.y, s.x)));
  }
  ss.poseOK = true;
}

// ------------------------------------------------------------------------------------------ the sabres' life (view)
function view(ws, g, dt) {
  const vm = g.vm, w = vm?.weapon, ss = ssOf(ws);
  if (!w?.parts?.R_gun || w.def !== ws.def) return;
  const v = ss.view;
  if (v.w !== w) {
    Object.assign(v, { w, t: 0, flare: 0, moteT: 0.5, glintT: 1, tipV: { R: V3(), L: V3() }, readyFlash: 0 });
    w.onParts = (vm2, dt2) => partsHook(ws, vm2, dt2);
    // a fist round each grip (the dual default is a pistol hold)
    vm.rightGrip.pose = 'fist';
    vm.supportGrip = { ...vm.supportGrip, pose: 'fist' };
    vm.arms?.setPose('R', 'fist', 0.05); vm.arms?.setPose('L', 'fist', 0.05);
    ss.poseOK = false;
    // the viewmodel lights every glow_* part at the stock intensity (7-8) whatever the def says: per-key factors bring
    // them to the def's (veins 1.3, edges 1.8, projected blades ~2: at 8 the veins outshone the pearls and the
    // projected blades tone-mapped to white)
    v.gk = {};
    const mats = ws.def.premium?.mat || {};
    for (const { m, base } of w.glowMats || []) { const k = m.userData.preset, d = mats[k]?.glow; if (d != null && base > 0) v.gk[k] = d / base; }
    warm(g);
  }
  v.t += dt;
  for (const H of ['R', 'L']) {
    const tp = vm.socketCam('tip_' + SIDE(H), _d);
    if (tp && dt > 0) { v.tipV[H].copy(tp).sub(_tipPrev[H]).multiplyScalar(1 / dt); _tipPrev[H].copy(tp); }
  }
  if (!ss.hum && g.audio?.has?.('twinblades_idle')) ss.hum = sfx(g, 'twinblades_idle', { loop: true, volume: 0.07, fadeIn: 0.4 });
  const ready = canCast(ws, 'ult').ok, busy = ss.lockT > 0 || ss.mode === 'thrown' || ss.mode === 'dash';
  const charging = ss.mode === 'charge', guarding = !!ss.guard?.up, readyIdle = ready && !busy && !charging && !guarding;
  // ---- the projected blades: out in the iai stance, the guard and the storm (clips drive their own on skills)
  const fl = charging || guarding || ss.storm ? 1 : 0;
  v.flare = damp(v.flare, fl, fl ? 10 : 14, dt);
  for (const H of ['R', 'L']) {
    const name = H + '_fx_flare', part = w.parts[name];
    if (!part) continue;
    const clipFlare = vm.clip.active && vm.clip.clip?.tracks?.[name + '.scale'];
    psOf(vm, name).hidden = !clipFlare && v.flare < 0.03;
    part.scale.set(1, clipFlare ? 1 : Math.max(0.03, v.flare), 1);
  }
  // ---- jaws: open in the stance, a snap on each ready reminder
  v.readyFlash = Math.max(0, v.readyFlash - dt);
  const jaw = charging ? 1 : v.readyFlash > 0 ? 0.8 : guarding ? 0.4 : 0;
  for (const H of ['R', 'L']) { const p = psOf(vm, H + '_fx_jaw'); if (!p.tw) p.v = damp(p.v || 0, jaw, jaw > (p.v || 0) ? 20 : 8, dt); }
  XH.guard = guarding; XH.charge = charging; XH.storm = !!ss.storm;
  // ---- glow: the pearls breathe (0.6 Hz, faster when ready), veins step up in the stance; at rest the pearls stay
  // the brightest thing on the pair (veins and edges ≤ 0.5 x, the card's focus rule), ready lifts the pearls only
  const G = vm._glowMat, gk = (k) => v.gk?.[k] ?? 1;
  if (G) {
    const br = 0.5 + 0.5 * Math.sin(v.t * (readyIdle ? 7.5 : 3.8));
    // (pv_energy scales the glow parts by the charge: ~0.23 at rest, 1 + pulses and a x1.5 ready layer when ready --
    // so the veins get more at rest and less when ready, where the pearls must stay on top)
    const pearl = (readyIdle ? 1.5 : 1) * (0.85 + 0.3 * br) * (v.readyFlash > 0 ? 1.6 : 1), vein = charging ? 2.5 + 0.5 * br : readyIdle ? 0.6 : 1.8, edge = charging ? 2.2 : guarding ? 1.1 : readyIdle ? 0.8 : 1.5;
    G.crystal = gk('crystal') * pearl; G.glass = gk('glass') * pearl;
    G.glow_vermilion = gk('glow_vermilion') * vein; G.glow_purple = gk('glow_purple') * vein;
    G.glow_gold = gk('glow_gold') * edge; G.glow_ice = gk('glow_ice') * edge;
    G.glow_orange = gk('glow_orange'); G.glow_blue = gk('glow_blue');
  }
  // ---- prism motes drifting off the edges (idle ≤ 8; in the stance they stream towards the points)
  const P = g.fx?.particles;
  if (P && !busy && (v.moteT -= dt) <= 0) {
    v.moteT = charging ? 0.03 : readyIdle ? 0.18 : 0.5 + R() * 0.4;
    const H = R() < 0.5 ? 'R' : 'L', a = vm.socketCam('base_' + SIDE(H), _a), b = vm.socketCam('tip_' + SIDE(H), _b);
    if (a && b) {
      const u = R(), p = _c.copy(a).lerp(b, u), C = COLS[H];
      if (charging) P.spawn({ additive: true, vm: true, x: p.x, y: p.y, z: p.z, vx: (b.x - a.x) * 1.5, vy: (b.y - a.y) * 1.5, vz: (b.z - a.z) * 1.5, life: 0.2, size: 0.005, size1: 0.002, stretch: 0.02,
        color: [...C.core, 1], color1: [...C.body, 0], frame: FRAME.spark });
      else P.spawn({ additive: true, vm: true, x: p.x + (R() - 0.5) * 0.02, y: p.y, z: p.z, vx: (R() - 0.5) * 0.03, vy: 0.04 + R() * 0.05, vz: (R() - 0.5) * 0.03,
        life: 0.9 + R() * 0.6, size: 0.0035, size1: 0.001, color: [...(R() < 0.35 ? spec(R(), 1.8) : C.core), 1], color1: [...C.tail, 0], frame: FRAME.glow, inertia: 0.5 });
    }
  }
  // ---- ready (§1.7.1 beat 7): the jaws snap, the pearls flash; again every 2.5 s
  if (ready && !busy) {
    if (!ss.readyN) { ss.readyN = true; ss.readyT = 0; readyBeat(ws, g, 1); }
    else if ((ss.readyT += dt) >= 2.5) { ss.readyT = 0; if (g.hud?.settings?.readyReminder !== false) readyBeat(ws, g, 0.5); }
  } else ss.readyN = false;
}
function readyBeat(ws, g, k) {
  const v = ssOf(ws).view, vm = g.vm, P = g.fx?.particles;
  v.readyFlash = 0.3 * (0.6 + 0.4 * k);
  vm.weapon?.premium?.fire?.(0.35 * k, 0.25);
  for (const H of ['R', 'L']) {
    const p = vm.socketCam('pearl_' + SIDE(H), _a);
    if (p && P) P.spawn({ additive: true, vm: true, x: p.x, y: p.y, z: p.z, life: 0.25, size: 0.03, size1: 0.07, color: [...COLS[H].core, 1], color1: [0, 0, 0, 0], frame: FRAME.glint, rot: R() });
  }
}

// ------------------------------------------------------------------------------------------ combo / dash driver
const COMBO_CLIP = ['twinblades_r1', 'twinblades_l1', 'twinblades_r2', 'twinblades_l2', 'twinblades_x'];
function startSwing(ws, g, step) {
  const ss = ssOf(ws), c = ws.def.special.combo[step], ar = g.arsenal;
  ss.mode = 'swing'; ss.step = step; ss.cur = c; ss.t = 0; ss.hit = false; ss.chainT = 0;
  ar.sinceShot = 0;
  ar.playClip(COMBO_CLIP[step], { duration: c.dur });
  sfx(g, c.hand === 'X' ? 'twinblades_swing_cross' : c.hand === 'L' ? 'twinblades_swing_l' : 'twinblades_swing_r', { volume: 0.9, pitch: 0.95 + R() * 0.1, delay: c.hit * 0.4 });
  XH.flash = c.hand; XH.flashT = 0.12; XH.step = step + 1;
  ss.lastHand = c.hand;
  if (c.hand !== 'X') bladeKick(ws, c.hand === 'R' ? 'L' : 'R', -0.75);   // the resting blade flicks ~6° (not frozen)
  g.noise?.(g.camera.position, 10);
  // the view rolls a hair towards the cutting side
  if (g.punch && clipComfort.shake) g.punch.impulse(0, 0, (c.hand === 'R' ? -1 : c.hand === 'L' ? 1 : 0) * 0.6 * 0.0175);
}
function vignette(g, k) {
  const post = g.renderer?.post;
  if (!post) return;
  if (g._tbVig == null) g._tbVig = post.vignette ?? 0;
  post.vignette = g._tbVig + k;
  if (k === 0) g._tbVig = null;
}
function startCharge(ws, g) {
  const ss = ssOf(ws), ar = g.arsenal;
  ss.mode = 'charge'; ss.ct = 0; ss.t = 0;
  ar.sinceShot = 0;
  ar.playClip('twinblades_iai', { duration: 1.6 });
  g.vm.clip.hold = true;
  ss.chargeSnd = sfx(g, 'twinblades_dash_charge', { loop: true, volume: 0.5 });
  ar.fovHold(-1, 0.2);
  vignette(g, 0.06);
  haptic(12);
}
/** where the dash ends: along the view (level), the full reach or short of a wall */
function dashTarget(ws, g, out) {
  const p = ws.def.special.dash, pl = g.player, feet = pl?.pos || g.camera.position;
  const fwd = eyeFwd(g, _a, _b), from = _c.set(feet.x, feet.y + 0.9, feet.z);
  const wh = g.world?.collision?.raycast(from, fwd, p.range + 0.6);
  const len = wh ? Math.max(0.8, wh.dist - 0.6) : p.range;
  out.copy(feet).addScaledVector(fwd, len);
  out.y = floorAt(g, out);
  if (Math.abs(out.y - feet.y) > 1.6) out.y = feet.y;
  return len;
}
function releaseDash(ws, g) {
  const ss = ssOf(ws), ar = g.arsenal, p = ws.def.special.dash, pl = g.player;
  ss.chargeSnd?.stop?.(0.08); ss.chargeSnd = null;
  ar.fovHold(0, 0.15);
  vignette(g, 0);
  sys(g).path.visible = false;
  if (!pl) { ss.mode = 'idle'; return; }
  const to = V3(), len = dashTarget(ws, g, to), from = pl.pos.clone();
  const dir = V3().subVectors(to, from).setY(0).normalize();
  const T = p.time * Math.max(0.5, len / p.range), t0 = Math.max(0.03, T - 0.15);
  // the iai pass-through turn (see dashUpdate) only when the lane holds someone to cut
  const expect = laneCount(g, from, to, p.width);
  ss.dash = { from, to, dir, len, t: 0, T, passed: new Set(), list: [], landed: false, turn: expect && clipComfort.autoTurn !== false ? -TURN : 0, turnT0: t0, turnDur: T - t0 + 0.1, yawDone: 0 };
  ss.mode = 'dash'; ss.t = 0; ss.fresh = false;
  pl.onGround = false;
  if (g.status) g.status.invuln = Math.max(g.status.invuln || 0, ss.dash.T + p.invuln);
  ar.playClip('twinblades_dash', { duration: ss.dash.T + p.delay + 0.35 });
  ar.fovKick(6, 0.25);
  if (clipComfort.overlay) g.fx?.overlay?.radial?.(0.6, 0.15, { r0: 0.32, density: 0.35, thin: 0.55 });
  sfx(g, 'twinblades_dash', { volume: 1 });
  haptic(20);
  // teammates see the path light and the streak
  const ev = { type: 'skill', id: 'twinblades_dash', w: ID, slot: 'fx', seed: (R() * 2147483647) | 0, pos: [from.x, from.y, from.z], dir: [dir.x, 0, dir.z], by: g.localId, ph: 0, len };
  startSkill(g, ev, { ws, local: true });
  g.net?.sendSkill?.(ev);
}
const TURN = 175 * Math.PI / 180;
/** alive zombies inside the dash lane (from -> to, width w) */
function laneCount(g, a, b, w) {
  const sx = b.x - a.x, sz = b.z - a.z, L2 = Math.max(1e-6, sx * sx + sz * sz);
  let n = 0;
  for (const z of g.zombies?.list || []) {
    if (!z.alive) continue;
    const u = clamp(((z.pos.x - a.x) * sx + (z.pos.z - a.z) * sz) / L2, 0, 1);
    if (Math.hypot(z.pos.x - a.x - sx * u, z.pos.z - a.z - sz * u) <= w / 2 + (z.radius ?? 0.4) && Math.abs(z.pos.y - a.y) < 2) n++;
  }
  return n;
}
/** the dash: the controller is steered along the line (walls still resolve); every body within the lane is cut once */
function dashUpdate(ws, g, dt) {
  const ss = ssOf(ws), D = ss.dash, pl = g.player, p = ws.def.special.dash;
  if (!D || !pl) return;
  D.t += dt;
  // iai pass-through: over the last 0.15 s of the dash and 0.1 s after it the view swings 175° round (to the right,
  // the way the draw-cut went) to face the row it cut through, so the 後斬 bursts in front of the eye
  // (comfort: clipComfort.autoTurn = false keeps the heading; the after-cut then draws a full-screen X instead)
  if (D.turn) {
    const u = clamp((D.t - D.turnT0) / D.turnDur, 0, 1), e = u * u * u * (u * (6 * u - 15) + 10), y = D.turn * e;
    pl.yaw += y - D.yawDone; D.yawDone = y;
  }
  const u2 = Math.min(1, (D.t + dt) / D.T);
  const h = Math.max(dt, 1 / 240);
  const nx = D.from.x + (D.to.x - D.from.x) * u2, nz = D.from.z + (D.to.z - D.from.z) * u2, ny = D.from.y + (D.to.y - D.from.y) * u2;
  if (!D.landed) {
    pl.vel.set((nx - pl.pos.x) / h, (ny - pl.pos.y) / h + G_PLAYER * h, (nz - pl.pos.z) / h);
    pl.onGround = false;
  }
  // pass cuts: the lane between the start and where the player is now
  const a = D.from, b = pl.pos, seg = _a.subVectors(b, a), L2 = Math.max(1e-6, seg.x * seg.x + seg.z * seg.z);
  for (const z of g.zombies?.list || []) {
    if (!z.alive || D.passed.has(z)) continue;
    const zc = z.center(V3());
    const u = clamp(((zc.x - a.x) * seg.x + (zc.z - a.z) * seg.z) / L2, 0, 1);
    const qx = a.x + seg.x * u, qz = a.z + seg.z * u;
    if (Math.hypot(zc.x - qx, zc.z - qz) > p.width / 2 + (z.radius ?? 0.4) || Math.abs(zc.y - (b.y + 1)) > 2) continue;
    D.passed.add(z); D.list.push(z);
    const side = (D.dir.x * (zc.z - a.z) - D.dir.z * (zc.x - a.x)) > 0 ? 1 : -1;
    const dir = V3().copy(D.dir).addScaledVector(_c.set(-D.dir.z, 0, D.dir.x), 0.8 * side).normalize();
    strike(ws, g, z, p.pass, dir, { knock: 1.2, stagger: 0.8, tag: 'pass', skill: 'twinblades_dash', light: true, blood: D.list.length < 4 ? 0.8 : 0.25 });
    hitBurst(g, zc, dir, D.list.length % 2 ? 'R' : 'L', 0.6, D.list.length < 3 ? 0.6 : 0);
    sfx(g, 'twinblades_hit_flesh', { pos: zc, volume: 0.6, pitch: 1.1 + R() * 0.2 });
  }
  if (!D.landed && (D.t >= D.T || !g.status?.alive)) {
    D.landed = true;
    pl.vel.x *= 0.15; pl.vel.z *= 0.15; if (pl.vel.y > 0) pl.vel.y = 0;
    ss.mode = 'after'; ss.t = 0;
    stop(g, 0.03);
    // 後斬 a beat later: every body passed bursts at once
    const list = D.list.slice(), turned = !!D.turn;
    later(ws, p.delay, () => afterCut(ws, g, list, D.dir.clone(), turned));
  }
}
function afterCut(ws, g, list, dir, turned = false) {
  const p = ws.def.special.dash, ss = ssOf(ws);
  const pts = [];
  let n = 0, kills = 0;
  for (const z of list) {
    if (!z.alive) continue;
    const zc = z.center(V3()), d = V3().copy(dir).addScaledVector(_c.set((R() - 0.5), 0.3, (R() - 0.5)), 0.6).normalize();
    pts.push([zc.x, zc.y, zc.z]);
    if (n < 6) afterColumn(g, z, n);
    const res = strike(ws, g, z, p.after, d, { knock: 3.2, stagger: 1, sever: SEVER_ANY, tag: 'after', skill: 'twinblades_dash', explosive: n < 3, blood: n < 3 ? 1 : 0.3 });
    if (res?.killed) kills++;
    if (!res?.killed) prismCutAt(g, z, n);
    hitBurst(g, zc, d, 'X', n < 3 ? 1.1 : 0.5, n < 2 ? 1 : n < 4 ? 0.4 : 0);
    n++;
  }
  // teammates see the same bursts (their pass cuts already showed the streak)
  const ev = { type: 'skill', id: 'twinblades_after', w: ID, slot: 'fx', seed: (R() * 2147483647) | 0, pos: pts[0] || [0, 0, 0], dir: [dir.x, 0, dir.z], by: g.localId, ph: 0, pts };
  if (pts.length) { g.net?.sendSkill?.(ev); }
  sfx(g, 'twinblades_aftercut', { volume: 1 });
  if (n) screenSlash(g, turned ? 0.7 : 1.6);
  if (n && clipComfort.overlay) g.fx?.overlay?.radial?.(0.5, 0.15, { r0: 0.3, density: 0.32, thin: 0.55 });
  if (n) {
    stop(g, kills >= 2 ? 0.1 : 0.08);
    shake(g, 0.22 + Math.min(0.08, n * 0.02));
    g.punch?.impulse?.(-1.2 * 0.0175, 0, 0);
    haptic(40); setTimeout(() => haptic(40), 100);
    sfx(g, 'twinblades_hit', { volume: 1 });
  }
  ss.dashCd = p.cd;
}
/**
 * The after-cut on the screen: a warm and a cool slash crossing the view (k 1.6 = edge to edge, when the view did not
 * turn round and the bursts are behind), drawn as two KE cut lines on the camera, plus a pale prism tint
 */
function screenSlash(g, k = 1) {
  const S = sys(g), m = S.screenX;
  if (!clipComfort.overlay) return;
  if (m) {
    const L = 0.75 * k;
    for (const [mesh, ang] of [[m.children[0], -0.52], [m.children[1], Math.PI + 0.52]]) {
      mesh.visible = true;
      mesh.rotation.set(0, 0, ang);
      mesh.position.set(-Math.cos(ang) * L / 2, -Math.sin(ang) * L / 2, 0);
      mesh.scale.set(L, 0.035 + 0.012 * k, 1);
    }
    m.position.set(0, -0.02, -0.6);
    m.visible = true;
    const old = S.cuts.findIndex((x) => x.mesh === m); if (old >= 0) S.cuts.splice(old, 1);
    S.cuts.push({ mesh: m, t: 0, z: null, slash: true, T: { ramp: 0.06, hold: 0.12, fade: 0.16, end: 0.36 } });
  }
  g.fx?.overlay?.tint?.([1.15, 1.0, 1.3], 0.08, 0.25, { fadeIn: 0.02, fadeOut: 0.2 });
}
/** 後斬 on each body: a thin column of warm / cool light up through it (reads past the edge of the view too) */
function afterColumn(g, z, i) {
  const c = z.pos, C = i % 2 ? NI : HONG;
  g.fx?.sigils?.pillar?.(_e.set(c.x, c.y, c.z), { radius: 0.32, height: 5.5, color: [C.body[0] * 1.3, C.body[1] * 1.3, C.body[2] * 1.3], life: 0.45, motes: 3, ring: false });
  g.fx?.shockwave?.(_e.set(c.x, c.y + 0.05, c.z), { normal: UP, r0: 0.2, r1: 1.4, life: 0.3, color: C.core, thin: true });
}
/** a lingering X cut on a body that survived the after-cut (the KE cut pair without the kill glow) */
function prismCutAt(g, z, n) { if (n < 3) prismKill(g, z, _a.set(0, 0, -1), 4); }
function driver(ws, dt, g) {
  const ss = ssOf(ws), p = ws.def.special, ar = g.arsenal;
  runQueue(ss, dt);
  ss.buf = Math.max(0, ss.buf - dt);
  if (ss.pressing) ss.pressT += dt;
  ss.lockT = Math.max(0, ss.lockT - dt);
  ss.dashCd = Math.max(0, ss.dashCd - dt);
  XH.flashT = Math.max(0, XH.flashT - dt);
  if (ss.mode === 'swing') {
    ss.t += dt;
    const c = ss.cur;
    if (!ss.hit && ss.t >= c.hit) {
      ss.hit = true;
      sweep(ws, g, c, c.hand);
      if (c.wave) launchWave(ws, g, c);
    }
    if (ss.t >= c.dur) {
      ss.mode = 'recover'; ss.t = 0; ss.chainT = p.chain;
      if (ss.step === 4) {
        // 收招 after 交虹: both sabres twirled in the hands (1 in 8: tossed, flipped, caught), any input cancels
        ss.combos++;
        const rare = ss.combos % 8 === 0;
        ar.playClip(rare ? 'twinblades_recover_rare' : 'twinblades_recover', { duration: p.recover + (rare ? 0.1 : 0) });
        ss.step = -1; XH.step = 0;
      }
    }
  } else if (ss.mode === 'recover') {
    ss.t += dt;
    if (ss.chainT > 0 && (ss.chainT -= dt) <= 0) { ss.step = -1; XH.step = 0; }
    if (ss.t >= p.recover) ss.mode = 'idle';
  } else if (ss.mode === 'charge') {
    ss.ct += dt;
    g.vm.clip.hold = true;
    ss.chargeSnd?.setRate?.(0.85 + 0.35 * Math.min(1, ss.ct / 0.6));
    const mk = sys(g).path, to = V3(), len = dashTarget(ws, g, to), pl = g.player;
    if (pl) {
      mk.visible = true;
      mk.position.set(pl.pos.x, floorAt(g, pl.pos) + 0.03, pl.pos.z);
      const fwd = eyeFwd(g, _a, _b);
      mk.rotation.set(0, Math.atan2(-fwd.x, -fwd.z), 0);
      mk.scale.set(p.dash.width, 1, 1);
      const u = mk.material.uniforms; u.uLen.value = len; u.uW.value = p.dash.width; u.uAmt.value = damp(u.uAmt.value, 1, 10, dt); u.uHot.value = 0;
      // the landing mark: warm and cool motes rising off the ring
      if ((ss.moteT = (ss.moteT ?? 0) - dt) <= 0) {
        ss.moteT = 0.05;
        const C = R() < 0.5 ? HONG : NI, a = R() * 6.283;
        g.fx?.particles?.spawn({ additive: true, x: to.x + Math.cos(a) * 0.55, y: mk.position.y + 0.05, z: to.z + Math.sin(a) * 0.55, vy: 1.2 + R() * 0.8, life: 0.55, size: 0.035, size1: 0.008,
          color: [...C.body, 1], color1: [...C.tail, 0], frame: FRAME.glow });
      }
    }
    if (!g.status?.alive) { mk.visible = false; ss.mode = 'idle'; }
  } else if (ss.mode === 'dash') dashUpdate(ws, g, dt);
  else if (ss.mode === 'after') {
    ss.t += dt;
    if (ss.dash) dashUpdate(ws, g, dt);
    if (ss.t >= p.dash.delay + 0.3) { ss.mode = 'idle'; ss.dash = null; }
  }
}

// ------------------------------------------------------------------------------------------ 虹橋 X wave
function launchWave(ws, g, c) {
  const eye = g.camera.position, fwd = eyeFwd(g, _a, V3());
  const pos = V3().copy(eye).addScaledVector(fwd, 1.5); pos.y -= 0.25;
  const ev = { type: 'skill', id: 'twinblades_wave', w: ID, slot: 'fx', seed: (R() * 2147483647) | 0, pos: [pos.x, pos.y, pos.z], dir: [fwd.x, 0, fwd.z], by: g.localId, ph: 0 };
  startSkill(g, ev, { ws, local: true });
  g.net?.sendSkill?.(ev);
}
registerSkill('twinblades_wave', {
  level: 'L2', dur: 0.8,
  start(k) {
    const g = k.game, d = k.data;
    d.mesh = waveMesh(); d.mesh.position.copy(k.pos);
    d.dir = k.dir.clone().setY(0).normalize();
    d.mesh.quaternion.setFromUnitVectors(_a.set(0, 0, -1), d.dir);
    d.mesh.scale.setScalar(0.6);
    g.scene.add(d.mesh);
    d.dist = 0; d.hit = new Set(); d.dead = false; d.dustT = 0;
    sfx(g, 'twinblades_wave', k.local ? { volume: 0.9 } : { pos: k.pos, volume: 0.8 });
  },
  update(k, dt) {
    const g = k.game, d = k.data, p = wv(k);
    if (d.dead) return false;
    const step = p.speed * dt;
    const wh = g.world?.collision?.raycast(d.mesh.position, d.dir, step + 0.3);
    if (wh) {
      g.fx?.impact?.(wh.surf, wh.point, wh.normal, d.dir, { big: 1 });
      g.fx?.sparkBurst?.(wh.point, { color: WHITE, color1: VIO, count: 20, speed: 6, glow: 0.6, normal: wh.normal });
      d.dead = true;
    }
    const prev = _e.copy(d.mesh.position);
    d.mesh.position.addScaledVector(d.dir, step);
    d.dist += step;
    const grow = Math.min(1, d.dist / 2.2);
    d.mesh.scale.setScalar(0.6 + 0.55 * grow);
    const amt = (d.dist < p.range - 2 ? 1 : Math.max(0, (p.range - d.dist) / 2)) * (0.6 + 0.4 * grow);
    for (const m of d.mesh.userData.mats) m.uniforms.uAmt.value = amt;
    if ((d.dustT -= dt) <= 0) {
      d.dustT = 0.05;
      const fy = k.floorY(d.mesh.position);
      g.fx?.knockDust?.(_a.set(d.mesh.position.x, fy, d.mesh.position.z), _b.copy(d.dir).multiplyScalar(3), 0.55);
      g.fx?.particles?.spawn({ additive: true, x: d.mesh.position.x + (k.rng() - 0.5) * 1.6, y: d.mesh.position.y + (k.rng() - 0.5) * 1.2, z: d.mesh.position.z, vx: -d.dir.x, vy: 0.4, vz: -d.dir.z,
        life: 0.5, size: 0.04, size1: 0.01, color: [...spec(k.rng(), 2), 1], color1: [0.3, 0.2, 0.5, 0], frame: FRAME.glow });
    }
    if (k.local && k.ws) {
      let n = 0;
      for (const z of g.zombies?.list || []) {
        if (!z.alive || d.hit.has(z)) continue;
        const zc = z.center(_a), rel = _b.set(zc.x - prev.x, 0, zc.z - prev.z), along = rel.dot(d.dir);
        if (along < -0.6 || along > step + 0.6) continue;
        const lat = Math.abs(rel.x * d.dir.z - rel.z * d.dir.x);
        if (lat > p.width / 2 + (z.radius ?? 0.4) || Math.abs(zc.y - d.mesh.position.y) > 1.8) continue;
        d.hit.add(z);
        strike(k.ws, g, z, p.dmg, d.dir.clone(), { knock: 3, stagger: 1, sever: SEVER_HI, tag: 'wave', skill: 'twinblades_wave', blood: n < 3 ? 1 : 0.3 });
        hitBurst(g, zc.clone(), d.dir, 'X', 0.8, n < 2 ? 0.7 : 0);
        if (n < 3) sfx(g, 'twinblades_wave_hit', { pos: zc, volume: 0.7, pitch: 0.95 + k.rng() * 0.2 });
        n++;
      }
      if (n) { stop(g, 0.03); shake(g, 0.06); }
    }
    return d.dist < p.range;
  },
  end(k) { const m = k.data.mesh; m?.removeFromParent(); for (const mm of m?.userData?.mats || []) mm.dispose(); },
});
const wv = (k) => k.def.special.combo[4].wave;

// ------------------------------------------------------------------------------------------ 虹貫 dash (all clients: the streak)
registerSkill('twinblades_dash', {
  level: 'L2', dur: 0.6,
  start(k) {
    const g = k.game, d = k.data, from = k.pos.clone(), dir = k.dir.clone().setY(0).normalize(), len = k.ev.len ?? 8;
    d.from = from; d.dir = dir; d.len = len;
    // two world ribbons following the body (warm over cool), lit for 0.45 s
    d.tr = [[1.25, HONG], [0.85, NI]].map(([h, C]) => ({ h, r: g.fx?.trail?.({ vm: false, width: 0.32, life: 0.45, profile: 'soft', color: [...C.core, 1], color1: [...C.body, 0], segs: 24 }) }));
    if (!k.local) sfx(g, 'twinblades_dash', { pos: from, volume: 0.8 });
    // dust kicked along the lane
    for (let i = 0; i <= 8; i++) { const p = _a.copy(from).addScaledVector(dir, len * i / 8); p.y = k.floorY(p); g.fx?.knockDust?.(p, _b.copy(dir).multiplyScalar(4), 0.7); }
  },
  update(k) {
    const d = k.data, u = Math.min(1, k.t / 0.22), pos = k.local ? k.game.player?.pos : _a.copy(d.from).addScaledVector(d.dir, d.len * u);
    if (!pos) return true;
    if (k.t < 0.26) for (const t of d.tr) t.r?.push?.(_b.set(pos.x, pos.y + t.h, pos.z));
    else for (const t of d.tr) { t.r?.stop?.(); }
    return true;
  },
  end(k) { for (const t of k.data.tr || []) t.r?.stop?.(); },
});
// teammates: the after-cut bursts at the points the caster sent
registerSkill('twinblades_after', {
  level: 'L2', dur: 0.3,
  start(k) {
    if (k.local) return;
    const g = k.game;
    for (const [x, y, z] of k.ev.pts || []) hitBurst(g, _a.set(x, y, z), k.dir, 'X', 0.8, 0.6);
    sfx(g, 'twinblades_aftercut', { pos: k.pos, volume: 0.8 });
  },
});

// ------------------------------------------------------------------------------------------ 交虹 guard (damage filter) + 霓返
// PlayerStatus is not edited: the filter wraps its damage() once per status (like crisis.js / X02). Frontal 150°: x0.3
// and no shove; inside the perfect window: blocked, the attacker reels, 霓返 follows.
function installGuard(g) {
  const st = g.status;
  if (!st || st._tbGuard) return;
  st._tbGuard = true;
  const orig = st.damage;
  st.damage = (amount, opts = {}) => {
    const ws = g.arsenal?.current, ss = ws?.def?.id === ID ? ws.sp?.tb : null, gd = ss?.guard;
    if (!gd || !gd.up || opts.dot || !(amount > 0) || !st.alive || st.downed) return orig.call(st, amount, opts);
    const from = opts.from || opts.zombie?.pos;
    if (from) {
      const fwd = eyeFwd(g, _a, V3()), dx = from.x - g.camera.position.x, dz = from.z - g.camera.position.z, d = Math.hypot(dx, dz) || 1;
      const ang = Math.acos(clamp((dx * fwd.x + dz * fwd.z) / d, -1, 1)) * 180 / Math.PI;
      if (ang > ws.def.special.guard.cone / 2) return orig.call(st, amount, opts);
    }
    if (g.time <= gd.perfectUntil) { perfectGuard(ws, g, opts); return 0; }
    block(ws, g);
    const o = { ...opts }; delete o.knock;
    return orig.call(st, amount * ws.def.special.guard.mul, o);
  };
}
const _x0 = V3(), _x1 = V3(), _x2 = V3(), _x3 = V3(), _xu = V3(), _xv = V3(), _xw = V3();
/** where the two blades cross (camera space): the closest points of the two blade segments (root -> tip), averaged */
function crossPoint(g, out) {
  const vm = g.vm, p0 = vm.socketCam('base_r', _x0), p1 = vm.socketCam('tip_r', _x1), q0 = vm.socketCam('base_l', _x2), q1 = vm.socketCam('tip_l', _x3);
  if (!p0 || !p1 || !q0 || !q1) return null;
  const u = _xu.subVectors(p1, p0), v = _xv.subVectors(q1, q0), w = _xw.subVectors(p0, q0);
  const a = u.dot(u), b = u.dot(v), c = v.dot(v), d = u.dot(w), e = v.dot(w), D = a * c - b * b;
  let sc = D > 1e-8 ? clamp((b * e - c * d) / D, 0, 1) : 0;
  const tc = clamp((b * sc + e) / Math.max(c, 1e-8), 0, 1);
  sc = clamp((b * tc - d) / Math.max(a, 1e-8), 0, 1);
  return out.copy(p0).addScaledVector(u, sc).add(_xw.copy(q0).addScaledVector(v, tc)).multiplyScalar(0.5);
}
function block(ws, g) {
  const c = crossPoint(g, _c);
  if (c) for (let i = 0; i < 10; i++) g.fx?.particles.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, vx: (R() - 0.5) * 0.7, vy: R() * 0.45, vz: R() * 0.3, life: 0.2, size: 0.003, stretch: 0.01, color: [...WHITE, 1], color1: [...(i % 2 ? VERM : VIO), 0], frame: FRAME.spark, gravity: 1 });
  sfx(g, 'twinblades_block', { volume: 0.8 });
  shake(g, 0.1);
  bladeKick(ws, 'X', 0.8);
  haptic(25);
}
function perfectGuard(ws, g, opts) {
  const ss = ssOf(ws), st = g.status;
  ss.guard.perfectUntil = -1;
  st.invuln = Math.max(st.invuln || 0, 0.35);
  meterEvent(ws, 'parry');
  // the skill moment: a short white freeze with the colour drained, a prism starburst where the blades cross, the
  // crosshair flares, a ring off the attacker and it reels
  stop(g, 0.1);
  shake(g, 0.18);
  sfx(g, 'twinblades_parry', { volume: 1 });
  const post = g.renderer?.post;
  if (post && clipComfort.overlay && !ss.desat) { ss.desat = 0.7; post.saturation = (post.saturation ?? 1) - 0.7; setTimeout(() => { post.saturation += ss.desat; ss.desat = 0; }, 170); }
  if (clipComfort.overlay) g.fx?.overlay?.tint?.([1.1, 0.95, 1.35], 0.1, 0.3, { fadeIn: 0.02, fadeOut: 0.25 });
  haptic(12); setTimeout(() => haptic(40), 80);
  XH.parryT = 0.3;
  const P = g.fx?.particles, c = crossPoint(g, _c);
  if (c && P) {
    P.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, life: 0.26, size: 0.26, size1: 0.1, color: [...WHITE, 1], color1: [0.6, 0.4, 1.2, 0], frame: FRAME.glint, rot: R() * 6 });
    P.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, life: 0.2, size: 0.16, size1: 0.32, color: [1.8, 1.5, 2.4, 0.9], color1: [0, 0, 0, 0], frame: FRAME.glow });
    for (let i = 0; i < 18; i++) { const a = R() * 6.283, sp = 0.8 + R() * 1.2; P.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 0.2, life: 0.18 + R() * 0.12, size: 0.006, stretch: 0.04, color: [...spec(i / 18, 2.6), 1], color1: [0.2, 0.1, 0.4, 0], frame: FRAME.spark, gravity: 1 }); }
  }
  const z = opts.zombie;
  if (z?.alive) {
    z.flinchV?.set?.(0, 6, 0);
    if (z.kvel) { const dx = z.pos.x - g.camera.position.x, dz = z.pos.z - g.camera.position.z, l = Math.hypot(dx, dz) || 1; z.kvel.x += dx / l * 5; z.kvel.z += dz / l * 5; }
    if (!z.def?.boss) {
      if (!z.puppet) { z.state = 'stagger'; z.stateT = 0; }
      z.playOnce?.(z.actions?.stagger ? 'stagger' : 'hit_front', { fade: 0.06, speed: 1.1 });
    }
    const zc = z.center(V3()), n = _b.copy(g.camera.position).sub(zc).normalize();
    g.fx?.shockwave?.(zc, { normal: n, r0: 0.2, r1: 1.8, life: 0.3, color: [1.6, 1.4, 2.6], thin: true });
    g.fx?.shockwave?.(_c.set(z.pos.x, z.pos.y + 0.05, z.pos.z), { normal: UP, r0: 0.3, r1: 2.2, life: 0.35, color: VIO, thin: true });
    hitBurst(g, zc, n.negate(), 'X', 1.2);
  }
  // 霓返 a beat later
  later(ws, 0.06, () => {
    if (!held(g, ws)) return;
    if (ss.guard) ss.guard.up = false;
    ss.guardEnd = g.time + 10;   // (released by the next RMB press: guard end() stamps the real time)
    const ev = { type: 'skill', id: 'twinblades_flurry', w: ID, slot: 'fx', seed: (R() * 2147483647) | 0, pos: g.camera.position.toArray(), dir: eyeFwd(g, _a, _b).toArray(), by: g.localId, ph: 0 };
    startSkill(g, ev, { ws, local: true });
    g.net?.sendSkill?.(ev);
  });
}
registerSkill('twinblades_guard', {
  level: 'L1', channel: true,
  start(k) {
    const g = k.game;
    if (!k.local) { k.data.ring = 0; return; }
    const ws = k.ws, ss = ssOf(ws);
    installGuard(g);
    ss.guard = { k, up: false, perfectUntil: -1, t: 0 };
  },
  update(k, dt) {
    const g = k.game;
    if (!k.local) {
      // teammates: a faint prism veil in front of the caster while the guard is up
      if ((k.data.ring -= dt) <= 0) { k.data.ring = 0.35; const p = k.caster(_a, _b); g.fx?.particles?.spawn({ additive: true, x: p.x + _b.x * 0.6, y: p.y - 0.4, z: p.z + _b.z * 0.6, life: 0.4, size: 0.8, size1: 1.1, color: [0.9, 0.7, 1.5, 0.4], color1: [0, 0, 0, 0], frame: FRAME.glint }); }
      return;
    }
    const ws = k.ws, ss = ssOf(ws), gd = ss.guard, ar = g.arsenal;
    if (!gd) return false;
    gd.t += dt;
    // raise once the sabres are free (a cut in progress finishes first)
    const free = ss.mode === 'idle' || ss.mode === 'recover';
    if (!gd.up && free && ss.lockT <= 0 && ar.state === 'idle') {
      gd.up = true; gd.upAt = g.time;
      ss.mode = 'idle'; ss.step = -1; XH.step = 0;
      const gp = ws.def.special.guard;
      if (g.time - ss.guardEnd >= gp.rearm) gd.perfectUntil = g.time + gp.raise + gp.perfect;
      ar.playClip('twinblades_guard', { duration: 1.2 });
      g.vm.clip.hold = true;
      sfx(g, 'twinblades_guard_up', { volume: 0.7 });
    }
    if (gd.up) {
      if (g.vm.clip.clip && g.vm.clip.active) g.vm.clip.hold = true;
      g.status?.applySlow?.(0.08, ws.def.special.guard.speedMul);
      ar.sinceShot = 0;
    }
  },
  end(k) {
    if (!k.local) return;
    const g = k.game, ss = ssOf(k.ws);
    if (ss.guard?.up) g.vm.clip.hold = false;
    ss.guard = null;
    ss.guardEnd = g.time;
  },
});
// 霓返: eight cuts all round in 0.5 s (the caster's clip and hits; teammates see the ring of colour)
registerSkill('twinblades_flurry', {
  level: 'L2', dur: 0.55,
  start(k) {
    const g = k.game, d = k.data;
    d.n = 0; d.hit = [];
    if (k.local) {
      const ss = ssOf(k.ws);
      ss.mode = 'idle'; ss.lockT = 0.55;
      g.vm.clip.hold = false;
      g.arsenal.playClip('twinblades_flurry', { duration: 0.55 });
      sfx(g, 'twinblades_flurry', { volume: 1 });
    }
    const c = k.feet(V3());
    g.fx?.shockwave?.(_a.set(c.x, c.y + 0.06, c.z), { normal: UP, r0: 0.4, r1: 3.4, life: 0.4, color: [1.6, 1.0, 2.6], thin: true });
  },
  update(k) {
    const g = k.game, d = k.data, p = k.def.special.guard.flurry;
    const due = Math.min(p.n, Math.floor(k.t / (p.dur / p.n)) + 1);
    while (d.n < due) {
      const i = d.n++, H = i % 2 ? 'L' : 'R', eye = k.caster(_a, _b), c = k.feet(_c);
      // a ring of colour sweeping round (every client)
      const a0 = i * 2.4;
      for (let j = 0; j < 6; j++) {
        const a = a0 + j * 0.25, r = 2.2 + k.rng() * 0.6;
        g.fx?.particles?.spawn({ additive: true, x: c.x + Math.cos(a) * r, y: c.y + 0.9 + (k.rng() - 0.5) * 0.6, z: c.z + Math.sin(a) * r, vx: -Math.sin(a) * 6, vy: 0, vz: Math.cos(a) * 6,
          life: 0.16, size: 0.05, stretch: 0.05, color: [...COLS[H].core, 1], color1: [...COLS[H].tail, 0], frame: FRAME.spark });
      }
      if (!k.local || !k.ws) continue;
      let n = 0;
      for (const { z, zc } of inSector(g, eye, eyeFwd(g, _e, V3()), p.r, 360)) {
        const dir = V3().subVectors(zc, eye).setY(0).normalize();
        dir.addScaledVector(_d.crossVectors(UP, dir), H === 'R' ? 0.7 : -0.7).normalize();
        strike(k.ws, g, z, p.dmg, dir, { knock: 1.4, stagger: 1, sever: SEVER_ARM, tag: 'flurry', skill: 'twinblades_flurry', blood: n < 3 ? 0.7 : 0.25 });
        if (n < 4) hitBurst(g, zc, dir, H, 0.5, n < 2 ? 0.5 : 0);
        n++;
      }
      if (n) { if (i % 3 === 0) stop(g, 0.035); shake(g, 0.06); sfx(g, 'twinblades_hit_flesh', { volume: 0.6, pitch: 0.95 + i * 0.05 }); haptic(10); }
    }
    return d.n < p.n || k.t < p.dur;
  },
});

// ------------------------------------------------------------------------------------------ 虹輪 blade storm (★ tap)
// Six spirit blades (warm / cool alternating) orbit the caster at r for p.dur s; each blade cuts every body in the
// band once per pass (the angle it swept this frame), shoves it out a little. Every client draws the blades from the
// event (round the caster's live position); only the caster deals damage. 雙虹: a following dmg aura for the team.
registerSkill('twinblades_storm', {
  level: 'L2', dur: 5,
  start(k) {
    const g = k.game, d = k.data, p = k.p, gh = g.fx?.summons;
    d.blades = []; d.ang = k.rng() * Math.PI * 2; d.prev = d.ang;
    for (let i = 0; i < p.n; i++) {
      const C = i % 2 ? NI : HONG;
      // a broad glazed spirit blade (2.4 x the sabre's width), its flat turned to the caster so the colour reads
      const h = gh?.ghost?.({ geometry: phantomGeometry(2.4), size: 1.7, pos: k.feet(V3()), appear: 0.18, life: p.dur, out: 0.3, motion: 'none', big: false,
        ...glaze(C), opacity: 0.78, exit: { kind: 'ember', count: 6, color: C.body, speed: 2 } });
      const tr = g.fx?.trail?.({ vm: false, width: 0.7, life: 0.2, profile: C === NI ? 'prismRev' : 'prism', color: [...C.body, 1], color1: [...C.tail, 0], segs: 20 });
      d.blades.push({ h, tr, C });
    }
    d.ring = orbitRing(p.r - 0.35, p.r + 0.35); g.scene.add(d.ring);
    addAura(g, { type: 'dmg', mul: k.def.premium?.aura?.mul ?? 1.1, radius: k.def.premium?.aura?.radius ?? 4, pos: k.feet(V3()), dur: p.dur, by: k.by, follow: true });
    d.loop = sfx(g, 'twinblades_storm', { loop: true, volume: 0.6, ...(k.local ? {} : { pos: k.pos }) });
    sfx(g, 'twinblades_storm_start', k.local ? { volume: 0.9 } : { pos: k.pos, volume: 0.8 });
    if (k.local) {
      const ss = ssOf(k.ws);
      ss.storm = k;
      if (ss.mode === 'idle' || ss.mode === 'recover') g.arsenal.playClip('twinblades_storm_cast', { duration: 0.5 });
    }
  },
  update(k, dt) {
    const g = k.game, d = k.data, p = k.p, c = k.feet(_c), omega = p.rate * Math.PI / 180;
    d.prev = d.ang; d.ang += omega * dt;
    const fade = Math.min(1, k.t / 0.2) * Math.min(1, (p.dur - k.t) / 0.3);
    d.ring.position.set(c.x, k.floorY(_a.set(c.x, c.y + 0.5, c.z)) + 0.04, c.z);
    d.ring.material.uniforms.uAmt.value = 0.16 * fade;
    d.ring.material.uniforms.uPhase.value = d.ang / (Math.PI * 2);
    for (let i = 0; i < d.blades.length; i++) {
      const b = d.blades[i], a = d.ang + i * Math.PI * 2 / d.blades.length, rr = p.r * (0.6 + 0.4 * Math.min(1, k.t / 0.25)) + Math.sin(k.t * 7 + i) * 0.08;
      const x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr, y = c.y + 1.15 + Math.sin(k.t * 5 + i * 1.3) * 0.12;
      if (b.h?.obj) {
        b.h.obj.position.set(x, y, z);
        // blade lying along the orbit, tilted up through the swing, the edge up: the flat faces the caster (edge out
        // showed only a thin white streak from the middle)
        const tan = _a.set(-Math.sin(a), 0, Math.cos(a));
        _d.copy(tan).multiplyScalar(0.92).addScaledVector(UP, 0.38).normalize();
        b.h.obj.quaternion.copy(bq(_d.toArray(), [0, 1, 0]));
        b.h.obj.position.addScaledVector(_d, -0.6);
      }
      if (b.tr) { const root = _e.set(x, y, z).addScaledVector(_d, -0.15), tip = _f.set(x, y, z).addScaledVector(_d, 0.6); b.tr.push(root, tip); }
    }
    if (!k.local || !k.ws) return true;
    // cuts: each blade sweeps the angle it covered this frame through the band
    const n0 = d.n || 0;
    for (const z of g.zombies?.list || []) {
      if (!z.alive) continue;
      const zc = z.center(_a), dx = zc.x - c.x, dz = zc.z - c.z, dist = Math.hypot(dx, dz);
      if (dist < p.band[0] - (z.radius ?? 0.4) || dist > p.band[1] + (z.radius ?? 0.4) || Math.abs(zc.y - (c.y + 0.9)) > 1.6) continue;
      const az = Math.atan2(dz, dx);
      for (let i = 0; i < d.blades.length; i++) {
        const off = i * Math.PI * 2 / d.blades.length;
        let a0 = d.prev + off - az, a1 = d.ang + off - az;
        const kk = Math.floor(a1 / (Math.PI * 2));
        a0 -= kk * Math.PI * 2; a1 -= kk * Math.PI * 2;
        if (!(a0 <= 0 && a1 >= 0) && !(a0 <= Math.PI * 2 && a1 >= Math.PI * 2)) continue;
        const dir = V3().set(dx, 0, dz).normalize();
        strike(k.ws, g, z, p.dmg, dir, { knock: p.push, stagger: 0.7, sever: SEVER_ARM, tag: 'storm', skill: 'twinblades_storm', blood: 0.35 });
        hitBurst(g, zc.clone(), dir, i % 2 ? 'L' : 'R', 0.45, 0);
        d.n = (d.n || 0) + 1;
      }
    }
    if ((d.n || 0) > n0) {
      if ((d.sfxT = (d.sfxT ?? 0) - dt) <= 0) { d.sfxT = 0.09; sfx(g, 'twinblades_storm_hit', { volume: 0.55, pitch: 0.9 + k.rng() * 0.3 }); }
      if ((d.stopT = (d.stopT ?? 0) - dt) <= 0) { d.stopT = 0.6; stop(g, 0.025); }
      haptic(8);
    }
    return true;
  },
  end(k) {
    const g = k.game, d = k.data;
    for (const b of d.blades || []) { b.h?.dissolveOut?.(0.25); b.tr?.stop?.(); }
    d.ring?.removeFromParent(); d.ring?.geometry.dispose(); d.ring?.material.dispose();
    d.loop?.stop?.(0.2);
    sfx(g, 'twinblades_storm_end', k.local ? { volume: 0.7 } : { pos: k.pos, volume: 0.6 });
    if (k.local && k.ws) ssOf(k.ws).storm = null;
  },
});

// ------------------------------------------------------------------------------------------ 千刃蓮華 ultimate (★ held)
// Beats (§1.7.3): 0-0.35 cast + the throw, 0.25 the lotus sigil, 0.35-0.9 twelve petals rise round the edge, 0.9-2.35
// they close through the centre one by one (a lane each), 2.35-2.95 spin (pulling in), 2.95 the bloom, 3.5 the catch.
// The sabres fly back in from the sides and vanish ~2 m out (back[1]); the viewmodel pair sweeps in from the frame's
// edges and lands in the palms at `catch` (they used to fly through the eye at 2.6 x: a screen full of dragon head).
const ULT = { sigil: 0.25, rise: [0.35, 0.9], close: [0.9, 2.35], spin: [2.35, 2.95], bloom: 2.95, back: [3.0, 3.42], catch: 3.54, end: 3.9 };
const _u0 = V3(), _u1 = V3(), _u2 = V3();
/** a spirit blade's glaze: the saturated 虹 / 霓 body colour through and through, a bright edge (white read as a storm) */
const glaze = (C, o = {}) => ({ base: C.body.map((v) => v * 0.42), core: C.body, rim: C.body.map((v) => v * 0.7), edge: C.core, ...o });
/** ult trauma: everything up to the bloom stacks to at most 0.3 (the card: 0.08 a petal, 0.5 at the bloom) */
const ultShake = (g, a, cap = 0.3) => { if (clipComfort.shake && (g.shake ?? 0) < cap) g.addShake?.(Math.min(a, cap - (g.shake ?? 0))); };
function ultAim(k) {
  const g = k.game, eye = k.pos, dir = k.dir, range = k.p.range;
  const hit = g.world?.collision?.raycast(eye, dir, range);
  if (hit && hit.normal.y > 0.5) return hit.point.clone();
  // a zombie under the crosshair, else the densest cluster in a 30° cone, else 10 m ahead
  let best = null, bc = Math.cos(5 * Math.PI / 180);
  for (const z of g.zombies?.list || []) {
    if (!z.alive) continue;
    _a.subVectors(z.center(_b), eye); const d = _a.length();
    if (d > range) continue;
    const cs = _a.dot(dir) / d;
    if (cs > bc) { bc = cs; best = z; }
  }
  if (best) return best.pos.clone();
  const fh = _c.set(dir.x, 0, dir.z).normalize();
  let bs = 0, bp = null;
  for (const z of g.zombies?.list || []) {
    if (!z.alive) continue;
    const dx = z.pos.x - eye.x, dz = z.pos.z - eye.z, d = Math.hypot(dx, dz);
    if (d > range || d < 2 || (dx * fh.x + dz * fh.z) / d < Math.cos(15 * Math.PI / 180)) continue;
    let s = 0; for (const o of g.zombies.list) if (o.alive && Math.hypot(o.pos.x - z.pos.x, o.pos.z - z.pos.z) < 4) s++;
    if (s > bs) { bs = s; bp = z.pos.clone(); }
  }
  if (bp) return bp;
  const p = eye.clone().addScaledVector(fh, hit ? Math.min(10, hit.dist - 0.5) : 10);
  return p;
}
registerSkill('twinblades_ult', {
  level: 'L4', dur: ULT.end,
  start(k) {
    const g = k.game, d = k.data, p = k.p;
    const c = ultAim(k); c.y = k.floorY(_a.set(c.x, c.y + 1.2, c.z));
    d.c = c; d.beat = 0; d.petals = []; d.closed = 0; d.spinT = 0; d.hitSpin = 0;
    d.yaw0 = Math.atan2(c.x - k.pos.x, c.z - k.pos.z);
    if (k.local) {
      const ws = k.ws, ss = ssOf(ws);
      ss.mode = 'thrown'; ss.ultK = k; ss.step = -1;
      g.vm.clip.hold = false;
      g.arsenal.playClip('twinblades_ult_cast', { duration: ULT.end });
      g.hud?.card?.(k.cardText(), { color: '#d8b8ff', sub: k.def.en });
      if (k.level >= 4 && clipComfort.overlay) { g.fx?.overlay?.tint?.([1.2, 1.0, 1.35], 0.05, ULT.end, { fadeIn: 0.3, fadeOut: 0.6 }); g.hud?.border?.('#c8a8ff', 0.22, ULT.end); }
      g.arsenal.fovKick(3, 0.5);
      if (g.status) g.status.invuln = Math.max(g.status.invuln || 0, 1.0);
      sfx(g, 'twinblades_ult_cast', { volume: 1 });
      d.bed = sfx(g, 'twinblades_ult_bed', { volume: 0.6 });
    } else sfx(g, 'twinblades_ult_cast', { pos: c, volume: 0.8 });
    d.fly = [];
  },
  update(k, dt) {
    const g = k.game, d = k.data, p = k.p, c = d.c, t = k.t, fx = g.fx;
    // ① the throw: the two real sabres fly spinning from the caster to the centre (all clients)
    if (d.beat < 1 && t >= 0.09) {
      d.beat = 1;
      // (the local pair leaves from 0.7 m out at 1 x and grows to 2.6 x on the way: never a giant blade at the eye)
      const S = sys(g), from = k.local ? g.camera.position.clone().add(_a.set(0, -0.3, 0)).addScaledVector(eyeFwd(g, _u0, _u1), 0.7) : k.caster(V3(), V3());
      for (const H of ['R', 'L']) {
        const proto = S.blades?.[H];
        const obj = proto ? proto.clone(true) : new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 0.02), new THREE.MeshBasicMaterial({ color: H === 'R' ? 0xffaa44 : 0xaa88ff }));
        obj.scale.setScalar(2.6);
        g.scene.add(obj);
        const C = COLS[H], tr = fx?.trail?.({ vm: false, width: 0.4, life: 0.2, profile: 'soft', color: [...C.core, 1], color1: [...C.tail, 0], segs: 20 });
        d.fly.push({ H, obj, tr, from: from.clone().add(_b.set(H === 'R' ? 0.3 : -0.3, 0, 0)), spin: 0 });
      }
      sfx(g, 'twinblades_ult_throw', k.local ? { volume: 1 } : { pos: k.pos, volume: 0.8 });
    }
    for (const f of d.fly) {
      // out (0.09 -> 0.35), hovering and spinning over the lotus, back to the hands (ULT.back)
      let pos;
      const top = _c.set(c.x, c.y + 3.2, c.z);
      if (t < 0.35) { const uo = clamp((t - 0.09) / 0.26, 0, 1); pos = _a.copy(f.from).lerp(top, uo); f.obj.scale.setScalar(1 + 1.6 * uo); }
      else if (t < ULT.back[0]) { const a = t * 6 + (f.H === 'R' ? 0 : Math.PI); pos = _a.set(c.x + Math.cos(a) * 0.9, c.y + 3.2 + Math.sin(t * 3) * 0.15, c.z + Math.sin(a) * 0.9); }
      else {
        const ub = clamp((t - ULT.back[0]) / (ULT.back[1] - ULT.back[0]), 0, 1), e = ub * ub * (3 - 2 * ub);
        if (k.local) {
          // home in on a curve from the hand's side, shrinking 2.6 -> 1, and stop ~2 m out of the eye (out to the side
          // and below it): never through the near volume
          const eye = g.camera.position, fw = eyeFwd(g, _u0, _u1), sd = f.H === 'R' ? 1 : -1, rt = _u2.set(-fw.z, 0, fw.x);
          const end = _d.copy(eye).addScaledVector(fw, 1.7).addScaledVector(rt, 1.15 * sd); end.y -= 0.35;
          const mid = _e.copy(top).lerp(end, 0.5).addScaledVector(rt, 2.2 * sd); mid.y += 0.6;
          const a0 = (1 - e) * (1 - e), a1 = 2 * (1 - e) * e, a2 = e * e;
          pos = _a.set(top.x * a0 + mid.x * a1 + end.x * a2, top.y * a0 + mid.y * a1 + end.y * a2, top.z * a0 + mid.z * a1 + end.z * a2);
          f.obj.scale.setScalar(2.6 - 1.6 * e);
          if (f.obj.visible && (ub >= 1 || pos.distanceTo(eye) < 2.2)) { f.obj.visible = false; f.tr?.stop?.(); }
        } else {
          pos = _a.copy(top).lerp(k.caster(V3(), V3()), e);
          if (ub >= 1 && f.obj.visible) { f.obj.visible = false; f.tr?.stop?.(); }
        }
      }
      f.spin += dt * 24;
      f.obj.position.copy(pos);
      f.obj.quaternion.setFromAxisAngle(_b.set(0.3, 0.2, 1).normalize(), f.spin);
      if (f.obj.visible) f.tr?.push?.(_d.copy(pos).add(_e.set(0, 0.35, 0).applyQuaternion(f.obj.quaternion)));
    }
    // ② the lotus sigil
    if (d.beat < 2 && t >= ULT.sigil) {
      d.beat = 2;
      d.sigil = fx?.sigils?.sigil?.(c, { design: 'lotus', radius: p.r, color: [2.4, 0.95, 0.2], color1: [0.85, 0.4, 2.6], life: ULT.end - 0.4, spin: 0.6, seed: k.ev.seed });
      sfx(g, 'twinblades_ult_sigil', { pos: c, volume: 0.9 });
    }
    // ③ twelve petals rise round the edge, warm and cool alternating, tips out a little
    if (d.beat < 3 && t >= ULT.rise[0]) {
      d.beat = 3;
      for (let i = 0; i < p.petals; i++) {
        const a = d.yaw0 + i * Math.PI * 2 / p.petals, C = i % 2 ? NI : HONG;
        const h = fx?.summons?.ghost?.({ geometry: phantomGeometry(1.5), size: 6.2, pos: _a.set(c.x + Math.sin(a) * (p.r - 1), c.y - 4, c.z + Math.cos(a) * (p.r - 1)), appear: 0.25, life: ULT.bloom - ULT.rise[0] + 0.6, out: 0.35,
          motion: 'none', big: false, ...glaze(C), opacity: 0.72,
          exit: { kind: 'shard', count: 10, palette: [C.body, C.core, C.tail], speed: 4, up: 1.5 } });
        d.petals.push({ a, h, C, state: 'rise', tr: null });
        const pp = _b.set(c.x + Math.sin(a) * (p.r - 1), c.y, c.z + Math.cos(a) * (p.r - 1));
        fx?.knockDust?.(pp, _e.set(Math.sin(a) * 3, 0, Math.cos(a) * 3), 1.0);
        rubble(g, pp, 3, 3.5, k.rng);
      }
      sfx(g, 'twinblades_ult_rise', { pos: c, volume: 0.9 });
      if (k.local) {
        ultShake(g, 0.15);
        // a 0.3 s nudge of the view down towards the lotus (seen from above, the twelve petals read as a flower)
        const eye = g.camera.position, want = Math.atan2(eye.y - c.y, Math.max(1, Math.hypot(c.x - eye.x, c.z - eye.z)));
        const amt = clamp((want - (g.player?.pitch ?? 0)) * 0.5, 0, 0.14);
        if (amt > 0.01 && g.player && clipComfort.autoTurn !== false) d.nudge = { t0: t, amt, done: 0 };
      }
    }
    // pose the petals
    const tc = (t - ULT.close[0]) / (ULT.close[1] - ULT.close[0]);
    for (let i = 0; i < d.petals.length; i++) {
      const P = d.petals[i], h = P.h;
      if (!h?.obj) continue;
      const out = _a.set(Math.sin(P.a), 0, Math.cos(P.a)), tan = _b.set(Math.cos(P.a), 0, -Math.sin(P.a));
      const rise = clamp((t - ULT.rise[0] - i * 0.025) / 0.4, 0, 1), base = _c.set(c.x, c.y, c.z).addScaledVector(out, p.r - 1.6);
      let ang = -0.6, y = -4.2 + 4.4 * (1 - (1 - rise) ** 3);          // tips flared out (a cup, not a fence)
      const dir = _d.copy(UP).multiplyScalar(Math.cos(ang)).addScaledVector(out, -Math.sin(ang)).normalize();
      const edge = _f.copy(UP).multiplyScalar(-Math.sin(ang)).addScaledVector(out, -Math.cos(ang)).normalize();
      const ci = clamp((tc - i / p.petals) * p.petals * 0.9, 0, 1);   // this petal's close (0 -> 1)
      if (t >= ULT.close[0] && ci > 0) {
        // fold in: the blade swings down across the centre (a lane), the root sliding in from the edge
        const sw = 1 - (1 - ci) ** 2.4;
        ang = -0.6 + 2.25 * sw;
        dir.copy(UP).multiplyScalar(Math.cos(ang)).addScaledVector(out, -Math.sin(ang)).normalize();
        edge.copy(UP).multiplyScalar(-Math.sin(ang)).addScaledVector(out, -Math.cos(ang)).normalize();
        base.addScaledVector(out, -2.2 * sw);
        if (!P.cut && ci > 0.55) {
          P.cut = true;
          laneCut(k, P, out.clone().negate());
        }
        if (!P.tr && ci > 0.05) P.tr = fx?.trail?.({ vm: false, width: 2.2, life: 0.26, profile: P.C === NI ? 'prismRev' : 'prism', color: [...P.C.body, 1], color1: [...P.C.tail, 0], segs: 18 });
      }
      if (t >= ULT.spin[0]) {
        // all twelve spin round the centre, laid flat, pulling in
        const sp = clamp((t - ULT.spin[0]) / (ULT.spin[1] - ULT.spin[0]), 0, 1), a = P.a + sp * sp * Math.PI * 2.2;
        base.set(c.x + Math.sin(a) * 0.5, c.y + 0.7, c.z + Math.cos(a) * 0.5);
        dir.set(Math.sin(a), 0.12, Math.cos(a)).normalize();
        edge.set(Math.cos(a), 0, -Math.sin(a));
        y = 0;
      }
      if (t >= ULT.bloom) {
        // 花心綻放: flung out from the centre, tips up and out, then shattered
        const sb = clamp((t - ULT.bloom) / 0.35, 0, 1), a = P.a + Math.PI * 2.2, o = _b.set(Math.sin(a), 0, Math.cos(a));
        base.set(c.x, c.y, c.z).addScaledVector(o, 0.5 + 7 * (1 - (1 - sb) ** 2));
        y = 0.7 + 1.6 * sb;
        dir.copy(o).addScaledVector(UP, 0.4 + sb).normalize();
        edge.set(Math.cos(a), 0, -Math.sin(a));
        if (sb > 0.3 && h.outT < 0) h.dissolveOut(0.3);
      }
      h.obj.position.copy(base).add(_e.set(0, y, 0));
      h.obj.quaternion.copy(bq(dir.toArray(), edge.toArray()));
      if (P.tr) { if (t < ULT.bloom) P.tr.push(_e.copy(h.obj.position).addScaledVector(dir, 1.6), _f.copy(h.obj.position).addScaledVector(dir, 4.0)); else { P.tr.stop(); P.tr = null; } }
    }
    // ④b the spin: pull in + ticks
    if (t >= ULT.spin[0] && t < ULT.bloom) {
      if (d.beat < 4) { d.beat = 4; sfx(g, 'twinblades_ult_spin', { pos: c, volume: 0.9 }); }
      if (k.local && k.ws) {
        for (const z of g.zombies?.list || []) {
          if (!z.alive || z.def?.boss || z.puppet || !z.kvel) continue;
          const dx = c.x - z.pos.x, dz = c.z - z.pos.z, dist = Math.hypot(dx, dz);
          if (dist > p.spinR || dist < 0.8) continue;
          z.kvel.x += dx / dist * p.pull * 7 * dt; z.kvel.z += dz / dist * p.pull * 7 * dt;
        }
        if ((d.spinT -= dt) <= 0) {
          d.spinT = 0.15;
          for (const z of g.zombies?.list || []) {
            if (!z.alive) continue;
            const zc = z.center(_a), dist = Math.hypot(zc.x - c.x, zc.z - c.z);
            if (dist > p.spinR || Math.abs(zc.y - c.y) > 2.6) continue;
            strike(k.ws, g, z, p.spin, V3().set(c.x - zc.x, 0, c.z - zc.z).normalize(), { knock: 0.5, stagger: 0.8, tag: 'ult', skill: 'twinblades_ult', blood: 0.25 });
          }
          ultShake(g, 0.06);
        }
      }
      if (k.rng() < 0.5) g.fx?.knockDust?.(_a.set(c.x + (k.rng() - 0.5) * 4, c.y, c.z + (k.rng() - 0.5) * 4), _b.set((k.rng() - 0.5) * 6, 0, (k.rng() - 0.5) * 6), 0.7);
    }
    // ⑤ the bloom
    if (d.beat < 5 && t >= ULT.bloom) { d.beat = 5; bloom(k); }
    // the catch: the viewmodel pair lands in the palms
    if (d.beat < 6 && t >= ULT.catch) {
      d.beat = 6;
      if (k.local && k.ws) catchBlades(k);
    }
    if (k.local) {
      if (d.nudge) { const u = clamp((t - d.nudge.t0) / 0.3, 0, 1), v = d.nudge.amt * u * u * (3 - 2 * u); g.player.pitch += v - d.nudge.done; d.nudge.done = v; if (u >= 1) d.nudge = null; }
      if (t < ULT.bloom && g.shake > 0.3) g.shake = 0.3;             // kills and hits stack no more than the cap either
    }
    return true;
  },
  end(k) {
    const g = k.game, d = k.data;
    for (const P of d.petals || []) { P.tr?.stop?.(); if (P.h?.alive) P.h.dissolveOut?.(0.2); }
    for (const f of d.fly || []) { f.tr?.stop?.(); f.obj?.removeFromParent(); }
    d.sigil?.stop?.(0.4);
    d.bed?.stop?.(0.4);
    if (k.local && k.ws) {
      const ss = ssOf(k.ws);
      if (ss.mode === 'thrown') ss.mode = 'idle';
      ss.ultK = null;
      g.vm?.hideFor?.(0);
    }
  },
});
/** one petal closing: everything in its lane across the lotus (a 1.8 m strip through the centre) */
const _la = V3(), _lb = V3(), _lc = V3(), _ld = V3(), _le = V3();
function laneCut(k, P, dir) {
  const g = k.game, d = k.data, p = k.p, c = d.c;
  sfx(g, 'twinblades_ult_petal', { pos: c, volume: 0.7, pitch: 0.85 + d.closed * 0.04 });
  d.closed++;
  const a = _la.copy(c).addScaledVector(dir, -p.r), fx = g.fx;
  for (let i = 0; i < 6; i++) { const q = _lb.copy(a).addScaledVector(dir, p.r * 2 * i / 5); q.y = c.y; fx?.knockDust?.(q, _le.copy(dir).multiplyScalar(4), 0.6); }
  if (k.local) ultShake(g, 0.08);
  if (!k.local || !k.ws) return;
  let n = 0;
  for (const z of g.zombies?.list || []) {
    if (!z.alive) continue;
    const zc = z.center(_lc), rel = _ld.set(zc.x - c.x, 0, zc.z - c.z), lat = Math.abs(rel.x * dir.z - rel.z * dir.x);
    if (lat > p.lane / 2 + (z.radius ?? 0.4) || rel.length() > p.r + 0.4 || Math.abs(zc.y - c.y) > 2.6) continue;
    const sd = V3().crossVectors(UP, dir).multiplyScalar(rel.x * dir.z - rel.z * dir.x > 0 ? 1 : -1).normalize();
    strike(k.ws, g, z, p.petal, sd, { knock: 1.5, stagger: 1, sever: SEVER_ANY, tag: 'ult', skill: 'twinblades_ult', blood: n < 3 ? 0.8 : 0.25 });
    if (n < 3) hitBurst(g, zc.clone(), sd, P.C === NI ? 'L' : 'R', 0.7, n < 1 ? 0.6 : 0);
    n++;
  }
  if (n && (d.stopT ?? -1) < k.t) { d.stopT = k.t + 0.36; stop(g, 0.04); }
}
function rubble(g, p, n, speed, rng = R) {
  const P = g.fx?.particles;
  for (let i = 0; i < n; i++) {
    const a = rng() * 6.283, s = speed * (0.4 + rng() * 0.8);
    P?.spawn({ x: p.x, y: p.y + 0.05, z: p.z, vx: Math.cos(a) * s * 0.5, vy: s * (0.6 + rng() * 0.8), vz: Math.sin(a) * s * 0.5, life: 0.9 + rng() * 0.6, size: 0.03 + rng() * 0.05,
      color: [0.42, 0.4, 0.38, 1], color1: [0.36, 0.34, 0.32, 1], frame: FRAME.rock, lit: true, gravity: 12, spin: (rng() - 0.5) * 14, rot: rng() * 6, collide: true, bounce: 0.3 });
  }
}
function bloom(k) {
  const g = k.game, d = k.data, p = k.p, c = d.c, fx = g.fx;
  const near = g.camera.position.distanceTo(c) < 9 ? 0.6 : 1;
  fx?.lights?.flash?.(_a.set(c.x, c.y + 1, c.z), '#f0d8ff', 10, 12, 0.25);
  fx?.particles?.spawn({ additive: true, x: c.x, y: c.y + 0.6, z: c.z, life: 0.12, size: 2.6 * near, size1: 4.2 * near, color: [4, 3.6, 4.4, 1], color1: [0.8, 0.4, 1.6, 0], frame: FRAME.glow });
  for (let i = 0; i < 3; i++) fx?.shockwave?.(_a.set(c.x, c.y + 0.07 + i * 0.01, c.z), { normal: UP, r0: 0.5, r1: p.bloomR * (0.7 + i * 0.25), life: 0.4 + i * 0.12, color: i === 1 ? VIO : i === 2 ? GOLD : [3, 2.8, 3.4], thin: i !== 0 });
  fx?.sigils?.pillar?.(c, { radius: 1.5, height: 14, color: [2.8, 2.3, 3.4], life: 0.7, motes: 16, ring: false });
  for (let i = 0; i < 18 * near; i++) { const a = i / 18 * 6.283 + k.rng() * 0.3; fx?.knockDust?.(_a.set(c.x + Math.cos(a) * 1.6, c.y, c.z + Math.sin(a) * 1.6), _b.set(Math.cos(a) * 8, 0, Math.sin(a) * 8), 1.3); }
  rubble(g, c, Math.round(18 * near), 6, k.rng);
  fx?.motes?.burst?.('shard', _a.set(c.x, c.y + 1.4, c.z), Math.round(22 * near), { seed: k.ev.seed, speed: 5, spread: 1, radius: 2, palette: [[2.4, 1.2, 0.4], [1.2, 0.8, 2.4], [2, 2, 2.2], [0.6, 2, 2.4]] });
  fx?.decals?.add?.(_a.copy(c), UP, { frame: DECAL.scorch, size: 5, tint: DECAL_TINT.scorch, alpha: 0.55, life: 3 });
  sfx(g, 'twinblades_ult_bloom', { pos: c, volume: 1 });
  sfx(g, 'twinblades_ult_shatter', { pos: c, volume: 0.8, delay: 0.1 });
  if (!k.local || !k.ws) { if (g.camera.position.distanceTo(c) < 15) shake(g, 0.2); return; }
  let n = 0;
  for (const z of g.zombies?.list || []) {
    if (!z.alive) continue;
    const zc = z.center(V3()), dist = Math.hypot(zc.x - c.x, zc.z - c.z);
    if (dist > p.bloomR + (z.radius ?? 0.4) || Math.abs(zc.y - c.y) > 3) continue;
    const dir = V3().set(zc.x - c.x, 0, zc.z - c.z); if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1); dir.normalize();
    strike(k.ws, g, z, p.bloom * Math.max(0.4, 1 - dist / (p.bloomR * 1.3)), dir, { knock: 8, stagger: 1, sever: SEVER_ANY, tag: 'ult', skill: 'twinblades_ult', explosive: n < 3, blood: n < 3 ? 1 : 0.3 });
    n++;
  }
  stop(g, 0.11);
  shake(g, 0.5);
  if (clipComfort.overlay) g.fx?.overlay?.radial?.(0.55, 0.2, { r0: 0.32, density: 0.32, thin: 0.55 });
  haptic(40); setTimeout(() => haptic(40), 110);
}
function catchBlades(k) {
  const g = k.game, ss = ssOf(k.ws);
  g.vm.hideFor(0);
  sfx(g, 'twinblades_catch', { volume: 1 }); sfx(g, 'twinblades_catch', { volume: 0.8, delay: 0.06, pitch: 1.1 });
  stop(g, 0.04); shake(g, 0.12);
  g.punch?.impulse?.(-1.2 * 0.0175, 0, 0);
  haptic(40);
  ss.mode = 'idle'; ss.lockT = 0.25;
  // the palms 'pop' the blades in: a coloured ring and a spark spray at each grip
  const P = g.fx?.particles;
  for (const H of ['R', 'L']) {
    const c = g.vm.socketCam('grip_' + SIDE(H), _a), C = COLS[H];
    if (!c) continue;
    g.fx?.shockwave?.(c, { r0: 0.02, r1: 0.16, life: 0.28, color: C.body, thin: true, vm: true });
    g.fx?.shockwave?.(c, { r0: 0.01, r1: 0.08, life: 0.18, color: C.core, thin: true, vm: true });
    for (let i = 0; i < 10; i++) { const a = R() * 6.283, sp = 0.4 + R() * 0.6; P?.spawn({ additive: true, vm: true, x: c.x, y: c.y + 0.03, z: c.z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 0.3, vz: 0, life: 0.16, size: 0.004, stretch: 0.02, color: [...C.core, 1], color1: [...C.tail, 0], frame: FRAME.spark, gravity: 2 }); }
  }
}

// ------------------------------------------------------------------------------------------ crisis + final kill
registerSkill('twinblades_crisis', {
  level: 'L1', dur: 1.0,
  start(k) {
    const g = k.game, c = k.feet(V3()), eye = k.caster(_a, _b), fwd = _b.setY(0).normalize();
    // 虹障: two crossed spirit blades flash up in front, low and to the left, and shatter into prism shards
    const side = _f.crossVectors(fwd, UP).normalize();
    const pos = _c.copy(eye).addScaledVector(fwd, 1.2).addScaledVector(side, -0.2).add(_d.set(0, -0.45, 0));
    for (const [C, ang] of [[HONG, 0.7], [NI, -0.7]]) {
      const q = bq([Math.sin(ang) * side.x, Math.cos(ang), Math.sin(ang) * side.z], [fwd.x, 0, fwd.z]);
      g.fx?.summons?.ghost?.({ geometry: phantomGeometry(1.5), size: 1.1, pos: pos.clone().addScaledVector(UP, -0.3), quat: q, appear: 0.05, life: 0.26, out: 0.18, motion: 'none', big: false,
        ...glaze(C), opacity: 0.55,
        exit: { kind: 'shard', count: 7, palette: [C.body, C.core, [1.2, 1.1, 1.3]], speed: 6, up: 1, scale: 1 } });
    }
    g.fx?.shockwave?.(_a.set(c.x, c.y + 0.1, c.z), { normal: UP, r0: 0.4, r1: 4.5, life: 0.4, color: [1.6, 1.1, 2.6], thin: false });
    if (!k.p.sfx) sfx(g, 'twinblades_crisis', { pos: c, volume: 1 });
  },
});
registerSkill('twinblades_final', {
  level: 'L2', dur: 1.2,
  start(k) {
    const g = k.game, fx = g.fx, c = k.pos.clone();
    c.y = k.floorY(_a.set(c.x, c.y + 1, c.z));
    if (!k.local) { fx?.sigils?.pillar?.(c, { radius: 0.45, height: 7, color: [2.2, 1.6, 2.8], life: 0.7, motes: 4, ring: false }); return; }
    fx?.sigils?.sigil?.(c, { design: 'lotus', radius: 2.6, color: [2.6, 1.6, 0.8], color1: [1.4, 0.9, 2.8], life: 1.2, spin: 0.8, seed: k.ev.seed });
    // two spirit blades cross-cut the spot from the sky
    const yaw = Math.atan2(g.camera.position.x - c.x, g.camera.position.z - c.z);
    const across = _b.set(Math.cos(yaw), 0, -Math.sin(yaw));
    const pair = [[HONG, 1], [NI, -1]].map(([C, sd]) => ({ sd, C, h: fx?.summons?.ghost?.({ geometry: phantomGeometry(1.5), size: 4.2, pos: c.clone(), appear: 0.08, life: 0.7, out: 0.3, motion: 'none', big: false,
      ...glaze(C), opacity: 0.6, exit: { kind: 'shard', count: 8, palette: [C.body, C.core], speed: 3 } }) }));
    let t = 0;
    const sysA = { update: (dt) => {
      t += dt;
      const u = Math.min(1, t / 0.25), sw = u * u;
      for (const { sd, h } of pair) {
        if (!h?.obj) continue;
        const ang = sd * (0.9 - 2.2 * sw);
        const dir = _d.copy(UP).multiplyScalar(Math.cos(ang)).addScaledVector(across, Math.sin(ang)).normalize();
        h.obj.position.copy(c).addScaledVector(across, -sd * 1.2).add(_e.set(0, 1.5, 0)).addScaledVector(dir, -1.4);
        h.obj.quaternion.copy(bq(dir.toArray(), [-across.x * sd, -0.3, -across.z * sd]));
      }
      if (t >= 0.25 && !sysA.hit) { sysA.hit = true; g.fx?.shockwave?.(_a.set(c.x, c.y + 0.06, c.z), { normal: UP, r0: 0.3, r1: 3.2, life: 0.4, color: [2.2, 1.6, 2.8], thin: true }); rubble(g, c, 10, 5, k.rng); }
      if (t > 1 || !pair.some((x) => x.h?.alive)) g.systems.splice(g.systems.indexOf(sysA), 1);
    } };
    g.systems.push(sysA);
    sfx(g, 'twinblades_final', { pos: c, volume: 0.9 });
  },
});

// ------------------------------------------------------------------------------------------ the special (engine overrides)
registerSpecial(ID, {
  init(ws) {
    ssOf(ws);
    const g = ws.game;
    if (g?.scene) sys(g);
    const au = g?.audio;
    if (au?.defs && !au._tbPre) { au._tbPre = true; au.preload?.(Object.keys(au.defs).filter((n) => /^(twinblades_|ready_twinblades)/.test(n)))?.catch?.(() => {}); }
  },
  /** the attacks (Arsenal._melee asks every frame while the weapon is idle in hand) */
  melee(ws, s, g) {
    const ss = ssOf(ws), p = ws.def.special;
    if (!g.status?.alive) return true;
    if (s.pressed.fire) { ss.buf = 0.3; ss.pressT = 0; ss.pressing = true; ss.fresh = true; }
    if (!s.held.fire) { ss.pressing = false; ss.fresh = true; }
    if (ss.lockT > 0 || ss.guard?.up || ss.mode === 'thrown' || ss.mode === 'dash' || ss.mode === 'after') return true;
    if (ss.mode === 'charge') { if (!s.held.fire || ss.ct >= p.dash.max) releaseDash(ws, g); return true; }
    // still held after a cut -> 虹貫 stance (not while the dash cools down)
    if (ss.pressing && ss.fresh && ss.pressT >= p.dash.hold && ss.dashCd <= 0 && (ss.mode === 'idle' || ss.mode === 'recover' || (ss.mode === 'swing' && ss.hit && ss.t >= ss.cur.dur * 0.8))) {
      ss.buf = 0; startCharge(ws, g); return true;
    }
    if (ss.buf > 0) {
      if (ss.mode === 'idle' || ss.mode === 'recover') { ss.buf = 0; startSwing(ws, g, ss.mode === 'recover' && ss.chainT > 0 && ss.step >= 0 ? (ss.step + 1) % 5 : 0); }
      else if (ss.mode === 'swing' && ss.hit && ss.t >= ss.cur.dur * 0.7 && ss.step < 4) { ss.buf = 0; startSwing(ws, g, ss.step + 1); }
    }
    return true;
  },
  onHit(ws, info, res, target) {
    const g = ws.game, z = target?.zombie || target;
    if (!res?.killed || !z?.center) return;
    const dir = info.dir || _a.set(0, 0, -1);
    const zf = z.zfx || g.fx?.zfx, S = sys(g), n = ++S.kf;
    if (zf) {
      zf.clearStatus?.(z, 'kill');                                  // a pale prism rim, not the white flash
      if (S.ck.length < 3) { zf.status?.(z, 'prismkill', 0.5); S.ck.push({ z, t: 0.5 }); }
    }
    prismKill(g, z, dir, n);
    if (!info.skill) stop(g, info.headshot ? 0.06 : 0.035);   // (skills time their own stops)
    // the wave's last kill: two spirit blades cross-cut it from the sky (KE_FINAL, §1.10) -- once a wave
    const m = g.match, ss = ssOf(ws);
    if (m && m.state === 'round' && (m.queue?.length ?? 1) + (g.zombies?.alive ?? 1) <= 0 && ss.finalWave !== m.round) {
      ss.finalWave = m.round;
      const ev = { type: 'skill', id: 'twinblades_final', w: ID, slot: 'fx', seed: (R() * 2147483647) | 0, pos: [z.pos.x, z.pos.y, z.pos.z], dir: [0, 0, -1], by: g.localId, ph: 0 };
      startSkill(g, ev, { ws, local: true });
      g.net?.sendSkill?.(ev);
    }
  },
  update(ws, dt, g) {
    const ss = ssOf(ws), inp = g.input?.state;
    // F mid-fight is not an inspect
    if ((ss.mode !== 'idle' && ss.mode !== 'recover') || ss.guard?.up || ss.lockT > 0) { if (inp) inp.pressed.inspect = false; }
    // the ult throws the sabres: hide the viewmodel pair while they fly (the arms stay for the sword-finger gesture)
    if (ss.mode === 'thrown' && ss.ultK) { const t = ss.ultK.t; if (t >= 0.09 && t < ULT.back[1]) g.vm.hideFor(0.05, 1); }
    driver(ws, dt, g);
    view(ws, g, dt);
    if (ss.mode === 'charge' || ss.mode === 'dash' || ss.mode === 'thrown' || ss.guard?.up) g.arsenal.sinceShot = 0;
  },
  tick(ws, dt, g) {
    const ss = ssOf(ws);
    if (!held(g, ws)) {
      if (ss.hum) { ss.hum.stop?.(0.2); ss.hum = null; }
      if (ss.chargeSnd) { ss.chargeSnd.stop?.(0.1); ss.chargeSnd = null; }
      if (ss.mode === 'charge') { const mk = g._tb?.path; if (mk) mk.visible = false; vignette(g, 0); g.arsenal?.fovHold?.(0, 0.2); }
      if (ss.mode !== 'idle' && ss.mode !== 'thrown') { ss.mode = 'idle'; ss.step = -1; ss.lockT = 0; ss.dash = null; }
      ss.view.w = null; ss.poseOK = false;
    }
  },
  dispose(ws) {
    const ss = ws.sp?.tb;
    if (!ss) return;
    ss.hum?.stop?.(0.1); ss.chargeSnd?.stop?.(0.1);
    if (ss.storm && !ss.storm.done) endSkill(ss.storm);
  },
  meterInfo(ws, key, m) {
    if (key !== 'combo') return null;
    const ss = ssOf(ws), n = ss.step >= 0 && (ss.mode === 'swing' || (ss.mode === 'recover' && ss.chainT > 0)) ? ss.step + 1 : 0;
    return { ...m, raw: n, value: n / 5, ready: n >= 5, hidden: n === 0 };
  },
  onClipEvent(ws, name, arg, g) {
    if (name !== 'tb') return;
    const what = typeof arg === 'string' ? arg : arg?.do;
    if (what === 'clash') clash(g, arg?.k ?? 1);
    else if (what === 'pearls') readyBeat(ws, g, arg?.k ?? 0.6);
    else if (what === 'world') worldInspect(ws, g);
    else if (what === 'link') link(g, false);
    else if (what === 'rainbow') link(g, true);
    else if (what === 'rub') clash(g, 0.35);
  },
});

/** first-use hitches: the custom materials, the spirit geometry and the lotus sigil are built up front */
function warm(g) {
  if (g._tbWarm) return;
  g._tbWarm = true;
  try {
    phantomGeometry(); phantomGeometry(1.5); phantomGeometry(2.4);   // (the broad variants re-crease their normals)
    g.fx?.sigils?.preload?.(['lotus']);
    for (const t of g.fx?.sigils?.tex || []) if (t) g.renderer?.gl?.initTexture?.(t);
    const grp = new THREE.Group();
    grp.name = 'twinblades-warmup';
    for (const m of [waveMesh(), pathMesh(), cutPair(), orbitRing(1, 2, 8)]) { m.visible = true; m.traverse((o) => { o.frustumCulled = false; }); m.visible = false; grp.add(m); }
    const gm = g.fx?.summons?._materials?.({ base: [0.3, 0.1, 0.05], core: HONG.body, rim: HONG.core, edge: HONG.core, opacity: 0.5 }, false, phantomGeometry());
    if (gm) for (const m of [gm.depth, gm.color]) { const o = new THREE.Mesh(phantomGeometry(), m); o.visible = false; o.frustumCulled = false; grp.add(o); }
    const sg = g.fx?.sigils;
    if (sg?._sigilMat && sg.geo) { const o = new THREE.Mesh(sg.geo, sg._sigilMat()); o.visible = false; grp.add(o); }
    if (sg?._pillarMat && sg.pillarGeo?.round) { const o = new THREE.Mesh(sg.pillarGeo.round, sg._pillarMat()); o.visible = false; grp.add(o); }
    g.scene.add(grp);
    g.renderer?.gl?.compileAsync?.(grp, g.camera, g.scene)?.catch?.(() => {});
  } catch (e) { console.warn('[twinblades] warm-up', e); }
}
/** 改變世界的檢視: the world dims under a prism haze for 2.5 s (only this screen) */
function worldInspect(ws, g) {
  const post = g.renderer?.post, ss = ssOf(ws);
  if (!post || ss.dim) return;
  const k = 0.85;
  post.exposure *= k; ss.dim = true;
  if (clipComfort.overlay) g.fx?.overlay?.tint?.([1.1, 0.95, 1.35], 0.12, 2.5, { fadeIn: 0.4, fadeOut: 0.6 });
  const P = g.fx?.particles, cam = g.camera;
  for (let i = 0; i < 22; i++) {
    _a.set((R() - 0.5) * 8, R() * 2.5 - 1, -3 - R() * 6).applyQuaternion(cam.quaternion).add(cam.position);
    P?.spawn({ additive: true, x: _a.x, y: _a.y, z: _a.z, vy: 0.2, delay: R() * 0.8, life: 1.6, fadeIn: 0.3, size: 0.035 + R() * 0.03, size1: 0.01, color: [...spec(R(), 1.6), 1], color1: [0.2, 0.15, 0.35, 0], frame: FRAME.glow });
  }
  later(ws, 2.5, () => { post.exposure /= k; ss.dim = false; });
}
/** the blades meet: a prism starburst where they cross (first draw clash, the ready rub) */
function clash(g, k = 1) {
  const c = crossPoint(g, _c), P = g.fx?.particles;
  if (!c || !P) return;
  P.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, life: 0.2, size: 0.12 * k, size1: 0.22 * k, color: [...WHITE, 1], color1: [0.5, 0.3, 1, 0], frame: FRAME.glint, rot: R() * 6 });
  for (let i = 0; i < 14 * k; i++) { const a = R() * 6.283, sp = 0.5 + R() * 0.8; P.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 0.2, vz: 0.1, life: 0.18 + R() * 0.1, size: 0.004, stretch: 0.025, color: [...spec(R(), 2.4), 1], color1: [0.2, 0.1, 0.4, 0], frame: FRAME.spark, gravity: 2 }); }
  if (k >= 0.9) { const w = g.vm.socketWorld?.('mid_r', _d); if (w) g.fx?.lights?.flash?.(w, '#f0e0ff', 2.5 * k, 1.5, 0.12); }
}
/** inspect: the ring pommels hooked together -- a ring of colour; rare: a little rainbow springs up between the heads */
function link(g, rainbow) {
  const a = g.vm.socketCam('ring_r', _a), b = g.vm.socketCam('ring_l', _b), P = g.fx?.particles;
  if (!a || !b || !P) return;
  const c = _c.copy(a).lerp(b, 0.5);
  g.fx?.shockwave?.(c, { r0: 0.005, r1: 0.06, life: 0.3, color: [2.2, 1.8, 2.8], thin: true, vm: true });
  for (let i = 0; i < 10; i++) { const an = i / 10 * 6.283; P.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, vx: Math.cos(an) * 0.15, vy: Math.sin(an) * 0.15, vz: 0, life: 0.3, size: 0.003, size1: 0.001, color: [...spec(i / 10, 2.2), 1], color1: [0.2, 0.1, 0.3, 0], frame: FRAME.glow }); }
  if (!rainbow) return;
  // a little arched rainbow between the two pearls, hanging a moment, dissolving into motes
  const pa = g.vm.socketCam('pearl_r', _d), pb = g.vm.socketCam('pearl_l', _e);
  if (!pa || !pb) return;
  for (let band = 0; band < 7; band++) for (let i = 0; i <= 26; i++) {
    const u = i / 26, x = pa.x + (pb.x - pa.x) * u, z = pa.z + (pb.z - pa.z) * u, y = pa.y + (pb.y - pa.y) * u + Math.sin(Math.PI * u) * (0.15 - band * 0.007);
    P.spawn({ additive: true, vm: true, x, y, z, vy: 0.01, delay: u * 0.15, life: 0.8, fadeIn: 0.1, size: 0.015, size1: 0.008, color: [...spec(band / 7, 1.8), 1], color1: [...spec(band / 7, 1.2), 0], frame: FRAME.glow });
  }
}

// ------------------------------------------------------------------------------------------ clips
// Keys per hand: [t (0..1 of the clip), grip [x, y, z] | null (keep), blade dir | null (keep), edge | null (leads the
// motion), ease into the key]. Camera space: +x right, +y up, -z forward. Each clip starts from where the sabres are
// and ends on the live idle pose. TR / TROFF: a cut's trails (crescent + soft glow + white core), one colour a blade.
// The band is the 'prism' ribbon (fx/ribbons.js): saturated gold -> vermilion (虹) / cyan -> violet (霓) with white only
// in its leading fifth and on the tip hairline, a spectral fringe inside the edge (the colour order reversed per blade);
// ext 1.25 carries the sweep past the point (a band about twice the old visible width). The hit colours (§1.17: the
// rest of a cut that connects) are the deeper element colours, brighter.
const TRC = { R: ['#ffae14', '#ff2a06', '#ff6a08', '#c80800'], L: ['#3a8cff', '#9a1aff', '#8a2aff', '#5000d8'] };
const TRAIL = (H, o = {}) => ({ on: true, id: 'cut' + H, from: 'base_' + SIDE(H), to: 'tip_' + SIDE(H), profile: H === 'L' ? 'prismRev' : 'prism', ext: 1.25, color: TRC[H][0], color1: TRC[H][1], k: 2.1,
  hitColor: TRC[H][2], hitColor1: TRC[H][3], life: 0.2, segs: 24, ...o });
const GLOW = (H, o = {}) => ({ on: true, id: 'glow' + H, from: 'tip_' + SIDE(H), to: null, profile: 'soft', width: 0.12, color: TRC[H][0], color1: TRC[H][1], k: 1.5, life: 0.14, segs: 16, ...o });
const CORE = (H, o = {}) => ({ on: true, id: 'core' + H, from: 'tip_' + SIDE(H), to: null, profile: 'beam', width: 0.0055, color: '#fff6ea', color1: TRC[H][0], k: 4.5, life: 0.08, segs: 14, ...o });
const TR = (t, H, o = {}) => [[t, 'trail', TRAIL(H, o)], [t, 'trail', GLOW(H, { life: (o.life ?? 0.2) * 0.7 })], [t, 'trail', CORE(H, { life: (o.life ?? 0.2) * 0.4 })]];
const TROFF = (t, H) => [[t, 'trail', { on: false, id: 'cut' + H }], [t, 'trail', { on: false, id: 'glow' + H }], [t, 'trail', { on: false, id: 'core' + H }]];
const FLARE = (H, a, b, c, d) => ({ [H + '_fx_flare.scale']: [[0, [1, 0.03, 1]], [a, [1, 0.03, 1]], [b, [1, 1, 1], 'out3'], [c, [1, 1, 1]], [d, [1, 0.03, 1]]],
  [H + '_fx_flare.vis']: [[0, 0], [a, 1, 'snap'], [d, 1], [Math.min(1, d + 0.01), 0, 'snap']] });
const mx = (p) => (p ? [-p[0], p[1], p[2]] : p);            // mirror a key across the view (the other hand)
const mk = (keys) => keys.map(([t, p, d, m, e]) => [t, mx(p), mx(d), mx(m), e]);
const mx3 = ([p, d, m]) => [mx(p), mx(d), mx(m)];          // a [grip, dir, edge] key mirrored
// a cut: wind-up W (grip, blade dir), the arc through the dirs A (grip moving from W to F with a forward bulge), the
// follow-through F; times: wind-up, arc start, hit, arc end, follow-through
function cutKeys(W, A, F, [tw, ta, th, te, tf], low = null) {
  const out = [[tw, W[0], W[1], null, 'out3']];
  const n = A.length;
  A.forEach((d, i) => {
    const u = n > 1 ? i / (n - 1) : 0.5, t = ta + (te - ta) * u;
    const p = [W[0][0] + (F[0][0] - W[0][0]) * u, W[0][1] + (F[0][1] - W[0][1]) * u + Math.sin(Math.PI * u) * 0.02, W[0][2] + (F[0][2] - W[0][2]) * u - Math.sin(Math.PI * u) * 0.08];
    out.push([t, p, d, null, i === 0 ? 'in' : t <= th + 1e-3 ? 'linear' : 'out']);
  });
  out.push([tf, F[0], F[1], null, 'out3']);
  if (low) out.push([low[0], low[1], low[2], null, 'inOut']);
  return out;
}
// the off hand pulls back and out while the other cuts (the point leaning out, clear of the middle) and is ready for
// its own
const OFF = (H, t0, t1) => { const I = IDLE[H], sx = H === 'R' ? 1 : -1; return [[t0, [I.p[0] * 1.15, I.p[1] - 0.04, I.p[2] + 0.04], N3(sx * 0.35, 0.74, -0.58), N3(sx, 0.12, -0.1), 'out3'], [t1, null, null, null, 'linear']]; };
// ① 虹 right diagonal: up over the right shoulder, down across the front to the lower left
const C_R1 = cutKeys([[0.26, -0.06, -0.32], N3(0.55, 0.75, -0.38)], [N3(0.3, 0.85, -0.45), N3(-0.35, 0.45, -0.82), N3(-0.8, -0.25, -0.55)], [[-0.08, -0.27, -0.42], N3(-0.7, -0.6, -0.4)], [0.14, 0.22, 0.32, 0.42, 0.56],
  [0.76, [0.12, -0.32, -0.38], N3(0.3, -0.2, -0.93)]);
// ③ 虹 flat sweep: drawn back out to the right, flat across the front at chest height to the left
const C_R2 = cutKeys([[0.26, -0.18, -0.32], N3(0.95, 0.15, -0.3)], [N3(0.6, 0.12, -0.8), N3(0.0, 0.1, -1), N3(-0.6, 0.08, -0.8), N3(-0.9, 0.05, -0.42)], [[-0.14, -0.24, -0.4], N3(-0.9, -0.15, -0.4)], [0.14, 0.2, 0.33, 0.46, 0.58],
  [0.78, [0.1, -0.32, -0.36], N3(0.2, -0.3, -0.93)]);
// ④ 霓 rising cut: down by the left hip, up across the front to the upper right
const C_L2 = cutKeys([[-0.22, -0.3, -0.34], N3(-0.6, -0.55, -0.58)], [N3(-0.35, -0.15, -0.92), N3(0.2, 0.4, -0.9), N3(0.6, 0.7, -0.38)], [[0.06, -0.1, -0.4], N3(0.55, 0.75, -0.37)], [0.14, 0.22, 0.33, 0.44, 0.56],
  [0.78, [-0.06, -0.12, -0.38], N3(-0.25, 0.95, -0.15)]);
registerClip('twinblades_r1', (vm) => twinClip(vm, { R: C_R1, L: OFF('L', 0.3, 0.7), events: [...TR(0.2, 'R'), [0.3, 'haptic', 'tick'], ...TROFF(0.62, 'R')] }));
registerClip('twinblades_l1', (vm) => twinClip(vm, { L: mk(C_R1), R: OFF('R', 0.3, 0.7), events: [...TR(0.2, 'L'), [0.3, 'haptic', 'tick'], ...TROFF(0.62, 'L')] }));
registerClip('twinblades_r2', (vm) => twinClip(vm, { R: C_R2, L: OFF('L', 0.3, 0.7), events: [...TR(0.2, 'R'), [0.3, 'haptic', 'tick'], ...TROFF(0.62, 'R')] }));
registerClip('twinblades_l2', (vm) => twinClip(vm, { L: C_L2, R: OFF('R', 0.3, 0.7), events: [...TR(0.2, 'L'), [0.3, 'haptic', 'tick'], ...TROFF(0.62, 'L')] }));
// ⑤ 交虹: both raised over the shoulders, down and in through an X in front of the eye (crossing below the crosshair)
const C_XR = cutKeys([[0.26, -0.02, -0.29], N3(0.35, 0.85, -0.38)], [N3(0.12, 0.9, -0.42), N3(-0.42, 0.42, -0.8), N3(-0.66, -0.42, -0.62)], [[0.1, -0.27, -0.42], N3(-0.6, -0.58, -0.55)], [0.2, 0.28, 0.37, 0.48, 0.6],
  [0.78, [0.14, -0.33, -0.36], N3(0.3, -0.25, -0.92)]);
registerClip('twinblades_x', (vm) => twinClip(vm, { R: C_XR, L: mk(C_XR), events: [...TR(0.24, 'R', { life: 0.16, k: 2 }), ...TR(0.24, 'L', { life: 0.16, k: 2 }), [0.36, 'tb', { do: 'clash', k: 1.1 }],
  [0.37, 'haptic', 'thud'], [0.37, 'snd', 'twinblades_clash'], ...TROFF(0.6, 'R'), ...TROFF(0.6, 'L')], tracks: { ...FLARE('R', 0.18, 0.26, 0.42, 0.55), ...FLARE('L', 0.18, 0.26, 0.42, 0.55) } }));
// 收招 after 交虹: each sabre spun once in its hand (opposite ways), back to the stance
const spinKeys = (H, t0, t1, k) => {
  const I = IDLE[H], s = H === 'R' ? 1 : -1, p = [I.p[0] + s * 0.03, I.p[1] + 0.03, I.p[2] - 0.02], out = [];
  for (let i = 0; i <= 4; i++) { const a = i / 4 * Math.PI * 2 * k; out.push([t0 + (t1 - t0) * i / 4, p, [s * Math.sin(a) * 0.85, Math.cos(a), -0.5], [s * Math.cos(a) * 0.85, -Math.sin(a), -0.15], i === 0 ? 'out3' : 'linear']); }
  return out;
};
registerClip('twinblades_recover', (vm) => twinClip(vm, { R: spinKeys('R', 0.12, 0.62, 1), L: spinKeys('L', 0.16, 0.66, 1), events: [[0.1, 'snd', 'twinblades_recover'], [0.66, 'tb', 'rub']] }));
// rare 收招: both tossed up, a full flip in the air, caught by the grips
const tossKeys = (H) => { const I = IDLE[H], s = H === 'R' ? 1 : -1, out = []; for (let i = 0; i <= 6; i++) { const u = i / 6, a = u * Math.PI * 2, lift = Math.sin(Math.PI * u) * 0.16; out.push([0.12 + 0.6 * u, [I.p[0] - s * 0.02, I.p[1] + 0.04 + lift, I.p[2] - 0.04], [s * Math.sin(a) * 0.4, Math.cos(a), -0.55], null, i === 0 ? 'out' : 'linear']); } return out; };
registerClip('twinblades_recover_rare', (vm) => twinClip(vm, { R: tossKeys('R'), L: tossKeys('L'),
  events: [[0.1, 'anchorR', ['rest', 0.1]], [0.12, 'anchorL', ['rest', 0.1]], [0.68, 'anchorR', ['grip_r', 0.06]], [0.7, 'anchorL', ['grip_l', 0.06]], [0.72, 'snd', 'twinblades_catch'], [0.73, 'haptic', 'tick']] }));
// 虹貫 stance: both sabres crossed low at the left hip, edges out, the projected blades out (loops 0.25 -> 0.85 while held)
const IAI_R = [[-0.03, -0.21, -0.37], N3(-0.9, 0.06, -0.42), N3(-0.05, 0.3, -0.95)], IAI_L = [[-0.12, -0.24, -0.35], N3(-0.85, -0.08, -0.52), N3(-0.2, 0.3, -0.93)];
const tremble = (k, dx) => [k[0].map((v, i) => v + dx[i]), k[1], k[2]];
registerClip('twinblades_iai', (vm) => twinClip(vm, {
  R: [[0.2, ...IAI_R, 'out3'], [0.45, ...tremble(IAI_R, [0.002, 0.002, 0]), 'inOut'], [0.65, ...tremble(IAI_R, [-0.002, 0, 0.001]), 'inOut'], [0.85, ...IAI_R, 'inOut']],
  L: [[0.22, ...IAI_L, 'out3'], [0.45, ...tremble(IAI_L, [-0.002, 0.002, 0]), 'inOut'], [0.65, ...tremble(IAI_L, [0.002, 0, -0.001]), 'inOut'], [0.85, ...IAI_L, 'inOut']],
  loop: [0.25, 0.85], events: [[0.04, 'snd', 'cloth'], [0.2, 'tb', 'pearls']],
}));
// 虹貫 the draw-cut: out of the stance across the front to the right (0 -> 0.35 of the clip ~ the dash and the turn
// round), then 收刀 just before the after-cut (~0.59): the fists just past the frame's side edges (the forearms out
// of view), both blades flicked down and in at ~45° from there -- the heads at the edges, the points towards the
// bottom middle: a V in the lower third that frames the row as it bursts -- held, back to the stance
const SHOU_R = [[0.42, -0.08, -0.42], N3(-0.5, -0.65, -0.57), [0.6, -0.5, 0]];
registerClip('twinblades_dash', (vm) => twinClip(vm, {
  R: [[0.06, [0.0, -0.22, -0.4], N3(-0.6, 0.12, -0.8), null, 'in'], [0.16, [0.12, -0.2, -0.43], N3(0.2, 0.15, -0.97), null, 'linear'], [0.28, [0.26, -0.2, -0.34], N3(0.92, 0.12, -0.38), null, 'out'],
    [0.46, ...SHOU_R, 'out3'], [0.5, ...tremble(SHOU_R, [0.004, 0.006, 0]), 'outBack'], [0.8, ...SHOU_R, 'inOut']],
  L: [[0.09, [-0.1, -0.24, -0.38], N3(-0.5, 0.02, -0.86), null, 'in'], [0.19, [0.02, -0.22, -0.43], N3(0.3, 0.08, -0.95), null, 'linear'], [0.3, [0.16, -0.24, -0.35], N3(0.88, 0.05, -0.47), null, 'out'],
    [0.47, ...mx3(SHOU_R), 'out3'], [0.51, ...mx3(tremble(SHOU_R, [0.004, 0.006, 0])), 'outBack'], [0.8, ...mx3(SHOU_R), 'inOut']],
  events: [...TR(0.04, 'R', { life: 0.18, k: 2.2 }), ...TR(0.07, 'L', { life: 0.18, k: 2.2 }), ...TROFF(0.32, 'R'), ...TROFF(0.34, 'L'), [0.44, 'snd', 'cloth'], [0.47, 'haptic', 'tick']],
  tracks: { ...FLARE('R', 0, 0.02, 0.28, 0.4), ...FLARE('L', 0, 0.02, 0.3, 0.42) },
}));
// 交虹 guard: an X in front -- the grips wide and low, the blades crossing at mid-blade ~9° under the crosshair (the
// crosshair sits in the upper V), edges forward and out (the projected blades show beside each blade in their own
// colour; edge-on they were two white lines); 虹 a hair in front of 霓 where they meet; loops while held
const GR = [[0.17, -0.26, -0.38], N3(-0.57, 0.58, -0.57), N3(0.6, 0.2, -0.75)], GL = [[-0.17, -0.265, -0.39], N3(0.57, 0.58, -0.57), N3(-0.6, 0.2, -0.75)];
registerClip('twinblades_guard', (vm) => twinClip(vm, {
  R: [[0.1, ...GR, 'out3'], [0.5, ...tremble(GR, [0, 0.002, 0]), 'inOut'], [0.9, ...GR, 'inOut']],
  L: [[0.1, ...GL, 'out3'], [0.5, ...tremble(GL, [0, -0.002, 0]), 'inOut'], [0.9, ...GL, 'inOut']],
  loop: [0.12, 0.9], events: [[0.08, 'tb', { do: 'clash', k: 0.5 }], [0.09, 'haptic', 'tick']], tracks: { ...FLARE('R', 0.05, 0.12, 0.9, 0.98), ...FLARE('L', 0.05, 0.12, 0.9, 0.98) },
}));
// 霓返: eight cuts all round, alternating, each a wide flat sweep (a windmill of colour)
registerClip('twinblades_flurry', (vm) => {
  const R1 = [], L1 = [], ev = [];
  for (let i = 0; i < 8; i++) {
    const H = i % 2 ? 'L' : 'R', s = H === 'R' ? 1 : -1, t0 = 0.04 + i * 0.105, t1 = t0 + 0.09, y = [-0.1, -0.22, -0.14, -0.24][i >> 1];
    const keys = H === 'R' ? R1 : L1;
    keys.push([t0, [s * 0.24, y, -0.32], [s * 0.9, 0.1 + (i % 3) * 0.1, -0.35], null, 'out'], [t0 + 0.045, [0, y + 0.02, -0.42], [0, 0.35, -0.94], null, 'linear'], [t1, [-s * 0.18, y, -0.36], [-s * 0.9, 0, -0.4], null, 'out']);
    ev.push(...TR(t0 - 0.01, H, { life: 0.1 }), ...TROFF(t1 + 0.02, H));
  }
  return twinClip(vm, { R: R1, L: L1, events: [[0, 'haptic', 'thud'], ...ev], endEase: 'out3' });
});
// 虹輪 cast: both flung out wide (the spirits leave the blades), back
registerClip('twinblades_storm_cast', (vm) => twinClip(vm, {
  R: [[0.3, [0.3, -0.2, -0.36], N3(0.85, 0.4, -0.35), null, 'out3'], [0.55, null, null, null, 'linear']],
  L: [[0.3, [-0.3, -0.21, -0.35], N3(-0.85, 0.4, -0.35), null, 'out3'], [0.55, null, null, null, 'linear']],
  events: [[0.28, 'haptic', 'tick'], [0.3, 'tb', 'pearls']], tracks: { ...FLARE('R', 0.1, 0.25, 0.5, 0.8), ...FLARE('L', 0.1, 0.25, 0.5, 0.8) },
}));
// 千刃蓮華 (3.9 s): crossed overhead, thrown (0.09: the viewmodel pair hides, the special flies the real ones), both
// hands in a sword-finger gesture before the eye while the lotus works, the catch at 0.9 (from the sides into the grips)
const SWORD_R = { pos: [0.12, -0.14, -0.4], F: [-0.1, 0.92, -0.36], N: [-0.6, 0.0, -0.8], pose: 'point', palm: [0.015, 0.05] };
const SWORD_L = { pos: [0.16, -0.2, -0.36], F: [-0.2, 0.3, -0.93], N: [-0.3, -0.95, -0.1], pose: 'relaxed', palm: [0.02, 0.05] };
registerClip('twinblades_ult_cast', (vm) => twinClip(vm, {
  // (0.872 = 3.40 s: the snap out to the side happens while the pair is still hidden; they sweep in from the frame's
  // edges as the world sabres vanish ~2 m out, and land at ULT.catch)
  R: [[0.02, [0.1, 0.02, -0.3], N3(-0.4, 0.85, 0.3)], [0.023, null, null, null, 'linear'], [0.872, [0.5, -0.2, -0.2], N3(1, 0.2, 0), null, 'snap'], [0.915, [0.2, -0.22, -0.36], IDLE.R.d, null, 'out3']],
  L: [[0.02, [-0.1, 0.0, -0.3], N3(0.4, 0.85, 0.3)], [0.023, null, null, null, 'linear'], [0.872, [-0.5, -0.2, -0.2], N3(-1, 0.2, 0), null, 'snap'], [0.915, [-0.2, -0.24, -0.36], IDLE.L.d, null, 'out3']],
  events: [[0.01, 'haptic', 'thud'], [0.02, 'tb', { do: 'clash', k: 0.8 }], [0.03, 'anchorR', [SWORD_R, 0.12]], [0.035, 'anchorL', [SWORD_L, 0.14]],
    [0.872, 'anchorR', ['grip_r', 0.05]], [0.876, 'anchorL', ['grip_l', 0.05]], [0.905, 'haptic', 'thud']],
  dur: ULT.end,
}));
// first draw (1.6 s, once per match, fire cancels): flipped up from the lower corners, crossed and struck together (a
// prism burst), swung apart while the edges light (stopping at the frame's edges, the points up and out), a pose (虹
// forward, 霓 across the chest at a third of the height), a 0.2 s hold
registerClip('twinblades_first', (vm) => twinClip(vm, {
  R: [[0.0, [0.28, -0.5, -0.2], N3(0.4, -0.6, -0.7), N3(0, 0, -1), 'snap'], [0.16, [0.14, -0.26, -0.38], N3(-0.1, 0.9, -0.4), null, 'out3'], [0.26, [0.06, -0.18, -0.4], N3(-0.62, 0.74, -0.25), N3(0, 0.1, -1), 'inOut'],
    [0.3, [0.07, -0.18, -0.39], null, null, 'out'], [0.5, [0.2, -0.17, -0.38], N3(0.6, 0.64, -0.48), null, 'out3'], [0.66, [0.16, -0.2, -0.44], N3(-0.05, 0.25, -0.97), N3(0.9, 0.2, 0), 'inOut'], [0.86, null, null, null, 'linear']],
  L: [[0.0, [-0.28, -0.5, -0.2], N3(-0.4, -0.6, -0.7), N3(0, 0, -1), 'snap'], [0.17, [-0.14, -0.27, -0.38], N3(0.1, 0.9, -0.4), null, 'out3'], [0.26, [-0.06, -0.19, -0.4], N3(0.62, 0.74, -0.25), N3(0, 0.1, -1), 'inOut'],
    [0.3, [-0.07, -0.19, -0.39], null, null, 'out'], [0.5, [-0.2, -0.18, -0.38], N3(-0.6, 0.62, -0.5), null, 'out3'], [0.66, [-0.16, -0.2, -0.37], N3(0.85, 0.35, -0.4), N3(0, 0.6, -0.8), 'inOut'], [0.86, null, null, null, 'linear']],
  dur: 1.6, endEase: 'inOut',
  tracks: { R_fx_jaw: [[0, 0], [0.5, 0], [0.56, 1, 'out3'], [0.72, 1], [0.8, 0]], L_fx_jaw: [[0, 0], [0.51, 0], [0.57, 1, 'out3'], [0.73, 1], [0.81, 0]],
    ...FLARE('R', 0.48, 0.58, 0.68, 0.8), ...FLARE('L', 0.49, 0.59, 0.69, 0.81) },
  events: [[0.02, 'snd', 'twinblades_draw_first'], [0.27, 'tb', { do: 'clash', k: 1.3 }], [0.27, 'snd', 'twinblades_clash'], [0.28, 'haptic', 'tick'], [0.27, 'tb', 'pearls'],
    [0.32, 'glow', { to: 1.8, sec: 0.2 }], ...TR(0.34, 'R', { life: 0.2 }), ...TR(0.35, 'L', { life: 0.2 }), ...TROFF(0.52, 'R'), ...TROFF(0.53, 'L'), [0.7, 'glow', { to: 1, sec: 0.4 }],
    [0.72, 'snd', 'twinblades_first_sting']],
}));
// normal draw (0.45 s): both up from below the frame, the edges shifting from the twin colour back (§1.17)
registerClip('twinblades_draw', (vm) => twinClip(vm, {
  R: [[0.0, [0.24, -0.5, -0.25], N3(0.3, -0.4, -0.85), N3(0, 0, -1), 'snap']], L: [[0.0, [-0.24, -0.52, -0.25], N3(-0.3, -0.4, -0.85), N3(0, 0, -1), 'snap']],
  endEase: 'out3', events: [[0.02, 'snd', 'twinblades_draw']],
}));
// inspect (4.4 s): the flats turned to the eye (0.12 -> 0.24 loops on a held F), the right sabre spun once in the hand,
// the ring pommels hooked together under the middle, the pair held up half a metre out, both blades sweeping up and
// out: the two heads and their pearls frame the middle, the fists low under them (the forearms meet below the frame),
// the rare rainbow arching between the heads over the crosshair; apart
const IR = [[0.1, -0.2, -0.36], N3(-0.15, 0.95, -0.25), N3(1, 0.1, 0.1)], IL = [[-0.12, -0.22, -0.36], N3(0.15, 0.95, -0.25), N3(-1, 0.1, 0.1)];
const ARC_R = [[0.065, -0.17, -0.5], N3(0.32, 0.92, -0.22), N3(0.92, -0.32, 0)], ARC_L = [[-0.065, -0.17, -0.5], N3(-0.32, 0.92, -0.22), N3(-0.92, -0.32, 0)];
function inspectClip(vm, rare) {
  const spinR = [];
  for (let i = 1; i <= 4; i++) { const a = i / 4 * Math.PI * 2; spinR.push([0.26 + 0.04 * i, IR[0], [Math.sin(a) * 0.95, Math.cos(a), -0.25], [Math.cos(a), -Math.sin(a), 0.1], 'linear']); }
  return twinClip(vm, {
    R: [[0.08, ...IR, 'inOut'], [0.16, IR[0], N3(-0.25, 0.95, -0.15), N3(0.95, 0.2, 0.25), 'inOut'], [0.24, ...IR, 'inOut'], ...spinR, [0.46, ...IR, 'inOut'],
      [0.55, ...ARC_R, 'inOut'], [0.77, ...tremble(ARC_R, [0, 0.004, 0]), 'inOut'], [0.84, ...IR, 'inOut'], [0.95, null, null, null, 'linear']],
    L: [[0.08, ...IL, 'inOut'], [0.16, IL[0], N3(0.25, 0.95, -0.15), N3(-0.95, 0.2, 0.25), 'inOut'], [0.24, ...IL, 'inOut'], [0.46, ...IL, 'inOut'],
      [0.55, ...ARC_L, 'inOut'], [0.77, ...tremble(ARC_L, [0, 0.004, 0]), 'inOut'], [0.84, ...IL, 'inOut'], [0.95, null, null, null, 'linear']],
    dur: 4.4, loop: [0.12, 0.24],
    tracks: { env: [[0, 0], [0.1, 1], [0.9, 1], [1, 0]], R_fx_jaw: [[0, 0], [0.6, 0], [0.64, rare ? 1 : 0.4, 'out3'], [0.74, rare ? 1 : 0.4], [0.78, 0]], L_fx_jaw: [[0, 0], [0.6, 0], [0.64, rare ? 1 : 0.4, 'out3'], [0.74, rare ? 1 : 0.4], [0.78, 0]] },
    events: [[0.03, 'snd', 'cloth'], [0.06, 'tb', 'world'], [0.1, 'snd', 'twinblades_inspect'], [0.27, 'snd', 'cloth'], [0.56, 'tb', 'link'], [0.56, 'snd', 'twinblades_link'], [0.565, 'haptic', 'tick'],
      [0.6, 'tb', 'pearls'], ...(rare ? [[0.65, 'tb', 'rainbow'], [0.65, 'snd', 'twinblades_first_sting']] : []), [0.86, 'tb', 'pearls']],
  });
}
registerClip('twinblades_inspect', (vm) => inspectClip(vm, false));
registerClip('twinblades_inspect_rare', (vm) => inspectClip(vm, true));
// ready idle extra (§1.17 idle tiers): the two edges rub once (嚓), the pearls flash
registerClip('twinblades_ready', (vm) => twinClip(vm, {
  R: [[0.3, [0.11, -0.22, -0.4], N3(-0.45, 0.82, -0.35), N3(-0.3, 0.2, -0.93), 'out3'], [0.45, [0.13, -0.24, -0.4], N3(-0.35, 0.86, -0.36), null, 'linear']],
  L: [[0.3, [-0.11, -0.24, -0.39], N3(0.35, 0.7, -0.62), N3(0.3, 0.2, -0.93), 'out3'], [0.45, [-0.13, -0.25, -0.39], N3(0.25, 0.66, -0.7), null, 'linear']],
  dur: 0.9, events: [[0.3, 'tb', 'rub'], [0.31, 'snd', 'twinblades_clash'], [0.32, 'tb', 'pearls']],
}));
registerClip('twinblades_glint', (vm) => twinClip(vm, {
  R: [[0.45, [0.17, -0.24, -0.4], N3(-0.1, 0.85, -0.5), N3(0.95, 0.25, -0.1), 'inOut']], L: [[0.5, [-0.18, -0.26, -0.38], N3(-0.25, 0.55, -0.8), N3(-0.9, 0.42, -0.2), 'inOut']],
  dur: 0.9, tracks: { ...FLARE('R', 0.2, 0.45, 0.5, 0.85), ...FLARE('L', 0.25, 0.5, 0.55, 0.9) },
}));

// ------------------------------------------------------------------------------------------ crosshair, kill mark, damage skin
// xh_twin: four short diagonal arms in an X round a hollow diamond; the right pair belongs to 虹, the left pair to 霓
// and each flashes when its sabre cuts (§1.8.1); five pips under it count the 疾虹 steps; the 虹貫 stance adds a
// forward chevron, the guard closes the arms into a tight X, the storm spins six ticks round it
const XH = { flash: '', flashT: 0, step: 0, guard: false, charge: false, storm: false, parryT: 0 };
registerCrosshair('xh_twin', {
  state: () => `${XH.flashT > 0 ? XH.flash : ''}|${XH.step}|${XH.guard ? 1 : 0}|${XH.charge ? 1 : 0}|${XH.storm ? 1 : 0}`,
  draw(gap, c) {
    const g0 = XH.guard ? 4 : 6 + gap * 0.6, L = XH.guard ? 6 : 8;
    const arm = (sx, sy, on) => `<path class="a" d="M${(sx * g0).toFixed(1)} ${(sy * g0).toFixed(1)} L${(sx * (g0 + L)).toFixed(1)} ${(sy * (g0 + L)).toFixed(1)}" stroke="${c}" stroke-width="${on ? 3 : 1.8}" stroke-linecap="round" opacity="${on ? 1 : 0.9}"/>`;
    const fr = XH.flashT > 0 && (XH.flash === 'R' || XH.flash === 'X'), fl = XH.flashT > 0 && (XH.flash === 'L' || XH.flash === 'X');
    let s = arm(0.71, -0.71, fr) + arm(0.71, 0.71, fr) + arm(-0.71, -0.71, fl) + arm(-0.71, 0.71, fl);
    s += `<path class="a" d="M0 -2.4 L2.4 0 L0 2.4 L-2.4 0 Z" fill="none" stroke="${c}" stroke-width="1.1"/>`;
    if (XH.step > 0) for (let i = 0; i < 5; i++) s += `<circle cx="${(-8 + i * 4).toFixed(1)}" cy="${(g0 + L + 6).toFixed(1)}" r="${i < XH.step ? 1.5 : 1}" fill="${c}" opacity="${i < XH.step ? 1 : 0.35}"/>`;
    if (XH.charge) s += `<path class="a" d="M-5 ${-g0 - 4} L0 ${-g0 - 9} L5 ${-g0 - 4}" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>`;
    if (XH.storm) {
      const ticks = [0, 1, 2, 3, 4, 5].map((i) => { const a = i * Math.PI / 3; return `M${(Math.cos(a) * 18).toFixed(1)} ${(Math.sin(a) * 18).toFixed(1)} L${(Math.cos(a) * 21).toFixed(1)} ${(Math.sin(a) * 21).toFixed(1)}`; }).join(' ');
      s += `<g><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="1.2s" repeatCount="indefinite"/><path d="${ticks}" stroke="${c}" stroke-width="1.6" stroke-linecap="round" opacity=".8"/></g>`;
    }
    return s;
  },
  nodes: 22,
});

// km_twinblades: a warm and a cool slash cross a dark field and draw two crossed sabres (beat 1), the blades fill and a
// two-headed rainbow dragon arches over them from ring to ring (2), full glow (3), both heads' eyes flash -- one warm,
// one cool -- with a ding (4)
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const seg = (t, a, b) => ease((t - a) / (b - a));
registerKillMark('km_twinblades', {
  draw(ctx, S, t, o) {
    const c = S / 2, R0 = S * 0.42, lw = S * 0.03, warm = '#ff7a2a', cool = '#9a6bff', gold = o.gold ? '#ffd56a' : '#e3b04b', silver = '#cfd6e0';
    const p1 = seg(t, 0, 0.45), p2 = seg(t, 0.45, 0.8), p3 = seg(t, 0.8, 1.0), p4 = seg(t, 1.0, 1.15);
    ctx.clearRect(0, 0, S, S);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.save();
    ctx.beginPath(); ctx.arc(c, c, R0 * (0.75 + 0.25 * p1), 0, Math.PI * 2);
    const bg = ctx.createRadialGradient(c, c, R0 * 0.1, c, c, R0);
    bg.addColorStop(0, '#2a1a3a'); bg.addColorStop(0.7, '#120c1a'); bg.addColorStop(1, '#050308');
    ctx.globalAlpha = 0.95 * Math.min(1, p1 * 1.5); ctx.fillStyle = bg; ctx.fill();
    ctx.restore();
    // two crossed sabres: grips low, blades crossing over the middle, curved to the spine
    const sabre = (sd) => {
      const gx = c + sd * R0 * 0.55, gy = c + R0 * 0.62, tx = c - sd * R0 * 0.62, ty = c - R0 * 0.55;
      const mxp = (gx + tx) / 2 + sd * R0 * 0.08, myp = (gy + ty) / 2 - R0 * 0.08;
      return { gx, gy, tx, ty, mxp, myp };
    };
    const draw = (sd, col, metal, fill) => {
      const s = sabre(sd);
      ctx.save();
      ctx.setLineDash([S * 2, S * 2]); ctx.lineDashOffset = S * 2 * (1 - p1);
      ctx.strokeStyle = col; ctx.lineWidth = lw * (fill ? 1.7 : 0.7); ctx.shadowColor = col; ctx.shadowBlur = S * 0.05 * (p3 + 0.2);
      ctx.beginPath(); ctx.moveTo(s.gx, s.gy); ctx.quadraticCurveTo(s.mxp, s.myp, s.tx, s.ty); ctx.stroke();
      ctx.setLineDash([]);
      if (fill > 0) {
        ctx.globalAlpha = fill; ctx.strokeStyle = '#e8ecf2'; ctx.lineWidth = lw * 0.5;
        ctx.beginPath(); ctx.moveTo(s.gx, s.gy); ctx.quadraticCurveTo(s.mxp, s.myp, s.tx, s.ty); ctx.stroke();
        // guard + ring pommel
        ctx.fillStyle = metal; ctx.beginPath(); ctx.arc(s.gx - sd * lw * 0.6, s.gy - lw * 0.8, lw * 1.3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = metal; ctx.lineWidth = lw * 0.6; ctx.beginPath(); ctx.arc(s.gx + sd * lw * 2.2, s.gy + lw * 2.2, lw * 1.2, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    };
    draw(1, warm, gold, p2); draw(-1, cool, silver, p2);
    // beat 2: the two-headed rainbow arch from ring to ring (seven bands), heads hanging at the ends
    if (p2 > 0) {
      ctx.save();
      const ax = R0 * 0.78, ay = c + R0 * 0.72, top = c - R0 * 0.25;
      const cols = ['#ff4a3a', '#ff9a3a', '#ffd84a', '#5aff7a', '#4ad8ff', '#5a7aff', '#b46bff'];
      for (let i = 0; i < 7; i++) {
        const k = i * lw * 0.42;
        ctx.globalAlpha = p2 * (0.55 + 0.45 * p3); ctx.strokeStyle = cols[i]; ctx.lineWidth = lw * 0.42;
        ctx.beginPath(); ctx.moveTo(c - ax + k, ay); ctx.bezierCurveTo(c - ax + k, top + k, c + ax - k, top + k, c + ax - k, ay); ctx.stroke();
      }
      // heads: little curls at both feet
      for (const sd of [-1, 1]) { ctx.strokeStyle = sd < 0 ? cool : warm; ctx.lineWidth = lw * 0.6; ctx.beginPath(); ctx.arc(c + sd * (ax - lw), ay + lw * 0.6, lw * 1.2, 0, Math.PI * 1.6); ctx.stroke(); }
      ctx.restore();
    }
    // beat 4: 點睛 -- both heads' eyes flash (a cross-flare + a ring on a headshot)
    const glow = p3 * 0.6 + Math.sin(Math.PI * p4) * 0.9 + (o.head ? Math.max(0, 1 - Math.abs(t - 1.1) / 0.08) : 0);
    if (glow > 0.01) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const [sd, col] of [[-1, cool], [1, warm]]) {
        const x = c + sd * (R0 * 0.78 - lw), y = c + R0 * 0.72 + lw * 0.2, r = lw * (0.9 + glow * 1.6);
        const g2 = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
        g2.addColorStop(0, '#ffffff'); g2.addColorStop(0.3, col); g2.addColorStop(1, '#00000000');
        ctx.globalAlpha = Math.min(1, glow); ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(x, y, r * 2, 0, Math.PI * 2); ctx.fill();
        if (p4 > 0) { const L = S * 0.03 * (1.5 + glow * (o.head ? 3.4 : 1.8)); ctx.strokeStyle = '#fff'; ctx.lineWidth = lw * 0.25; ctx.beginPath(); ctx.moveTo(x - L, y); ctx.lineTo(x + L, y); ctx.moveTo(x, y - L); ctx.lineTo(x, y + L); ctx.stroke(); }
      }
      ctx.restore();
    }
    if (o.head && t > 1.0) {
      const u = Math.min(1, (t - 1.0) / 0.17);
      ctx.save(); ctx.globalAlpha = 1 - u; ctx.lineWidth = lw * 0.35;
      const gr = ctx.createLinearGradient(c - R0, c, c + R0, c); gr.addColorStop(0, cool); gr.addColorStop(1, warm);
      ctx.strokeStyle = gr; ctx.beginPath(); ctx.arc(c, c, S * 0.03 + S * 0.36 * u, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
  },
});
// prism skin for skill hits (虹橋, 虹貫, 霓返, 虹輪, 千刃蓮華): white -> warm gold -> violet on a gold edge
SKINS.prism = ['#ffffff', '#ffc46a', '#9a6bff', '#e3b04b'];

// pose tuning from the console / QA scripts (ws.sp.tb.dev): the key tables are live (clips are built when played)
const DEV = { IDLE, bq, N3, ULT, keys: { GR, GL, IR, IL, ARC_R, ARC_L, SHOU_R }, setIdle(H, p, d, m) { IDLE[H] = { p, d: N3(...d), m: N3(...m) }; IDLE_Q[H] = bq(IDLE[H].d, IDLE[H].m); } };

export { SFX as TWINBLADES_SFX };
