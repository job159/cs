// 颱風眼．斬浪 Typhoon-Eye Tidecleaver — 異能 E07 weather-instrument greatsword (docs/PREMIUM_WEAPONS.md E07, 05d §8.2;
// def in defs.js, model tools/assets/weapons/taifeng.mjs, FX pieces taifeng_fx.js). A premium melee: the special drives
// its own attacks (Arsenal._melee -> special.melee), the skills run on the specials v2 engine.
//   LMB tap   三段斬: 橫斬 (right -> left 110) -> 反橫斬 (left -> right 110) -> 劈地 (the vanes flare, an overhead chop
//             into the street 1.7 m ahead: 200 in a 3 m ring, a splash ring, a puddle, spray, rubble); every target in
//             the arc is hit; held LMB keeps chaining. A swing that connects: 50-90 ms hit-stop, shake, camera punch,
//             the trail's tail turns storm cyan (§1.17), spray + droplets; heavy kills sever.
//   LMB draw  破浪: LMB while the sword comes out (or within 0.3 s after) cuts the draw short into a 4 m water arc, 160
//   RMB hold  三階蓄力: the blade stands before the face, the vanes slide out, the anemometer spins up, rain gathers on
//             the blade; stage 1 at 0.4 s, then one every 0.9 s (the barometer needle drops 980 -> 960 -> 940, a tick,
//             the frame darkens, FOV -1°); stage 3 only with 颱風能量 full (else the needle shivers at 960); release:
//             0 = lowered, 1 = a diagonal wind blade (6 m, 180), 2 = two crossed blades (180 each), 3 = 颱風眼
//   Q tap     斬浪擲 (15 s): a translucent water-wind copy of the blade leaves the sword on a cyan-white spiral trail,
//             homes on the nearest targets out to 25 m (300 each, pierces), flies home and merges with the blade (a
//             flash, a "clang"); 1.5 s invulnerable from the throw
//   Q held    颱風眼 (ult, 颱風能量 ~40 s): a forward slash, an isobar sigil at the mark (≤ 12 m), the eye wall rises
//             (r 5 m, 7 m high, three counter-turning layers, spiral rain), zombies dragged to the centre at 3 m/s,
//             a bolt (120) every 0.4 s, a calm shaft of light in the eye; after 2.5 s the wall collapses: 700 in 8 m,
//             a spray ring, a white flash; the caster's screen rains (L4); the clouds break, 10 %: a rainbow
//   kill      KE_GALE: a wind cut across the body, a little spiral of spray rising, droplets
// Sound cues (§1.12, produced later): see SFX; a missing cue falls back to an existing sample or stays silent.
import * as THREE from 'three';
import { registerSpecial, registerSkill, startSkill, canCast, castSkill, endSkill } from '../specials.js';
import { registerClip } from '../../player/clips.js';
import { registerCrosshair } from '../../ui/crosshairs.js';
import { registerKillMark } from '../../ui/killmarks.js';
import { SKINS } from '../../ui/dmgnums.js';
import { FRAME, DECAL, DECAL_TINT } from '../../fx/fx.js';
import { clipComfort, haptic } from '../arsenal.js';
import { gustBand, windBladeMesh, eyeWall, rainScreen, gustCut, ghostBladeGeometry, rainbowArc } from './taifeng_fx.js';

const ID = 'taifeng';
const WHITE = [5.2, 6.0, 6.8];      // white-hot spray / edge
const ICE = [2.4, 4.4, 5.4];        // #bff4ff core
const CYAN = [0.9, 3.0, 4.6];       // #5fd8ff rim
const TEAL = [0.12, 0.8, 1.3];      // deep sea wake
const MIST = [1.6, 2.0, 2.3];       // grey-white mist (lit-ish additive)
const RED = [4.0, 0.5, 0.25];       // the storm lamp
const UP = new THREE.Vector3(0, 1, 0);
const V3 = () => new THREE.Vector3();
const _a = V3(), _b = V3(), _c = V3(), _d = V3(), _e = V3(), _f = V3(), _q = new THREE.Quaternion();
const R = Math.random;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const shake = (g, a) => { if (clipComfort.shake) g.addShake?.(a); };
const stop = (g, s) => { if (clipComfort.hitstop) g.hitStop?.(s); };
// sound cues: name -> fallback (existing sample) | null
const SFX = {
  taifeng_draw: 'draw', taifeng_draw_first: 'drawHeavy', taifeng_first_sting: null, taifeng_catch_grip: 'cloth', taifeng_idle: null,
  taifeng_swing: 'swingHeavy', taifeng_swing2: 'swingHeavy', taifeng_cleave_up: 'cloth', taifeng_cleave: 'swingHeavy', taifeng_hit: 'melee_heavy_hit',
  taifeng_hit_flesh: 'knife_hit_flesh', taifeng_hit_splash: null, taifeng_hit_wall: 'knife_hit_wall', taifeng_kill: null, taifeng_sever: 'gib',
  taifeng_slam: 'explosion_small', taifeng_slam_water: null, taifeng_drawslash: 'swingHeavy', taifeng_drawslash_wave: null, taifeng_recover: 'cloth',
  taifeng_charge: null, taifeng_charge_stage: 'xh_node', taifeng_charge_full: null, taifeng_needle: 'xh_node', taifeng_vane_out: 'cloth', taifeng_vane_in: 'cloth',
  taifeng_gale: 'swingHeavy', taifeng_gale_fly: null, taifeng_gale_hit: 'melee_heavy_hit',
  taifeng_throw: 'swingHeavy', taifeng_throw_fly: null, taifeng_throw_hit: 'knife_hit_flesh', taifeng_throw_turn: null, taifeng_catch: 'impact_metal',
  taifeng_eye_cast: 'swingHeavy', taifeng_eye_sigil: null, taifeng_eye_rise: null, taifeng_eye_loop: null, taifeng_eye_rain: null,
  taifeng_thunder: 'explosion_far', taifeng_collapse: 'explosion_large', taifeng_collapse_wave: null, taifeng_eye_after: null,
  ready_taifeng: null, taifeng_inspect: 'cloth', taifeng_glass_tap: 'xh_node', taifeng_rotor_flick: null, taifeng_wipe: 'cloth',
  taifeng_flick: 'cloth', taifeng_gust_blow: null,
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
function tfOf(ws) {
  return ws.sp.tf || (ws.sp.tf = {
    mode: 'idle', t: 0, cur: null, step: -1, hit: false, chainT: 0, buf: 0, lockT: 0, combos: 0,
    ct: 0, stage: 0, relStage: 0, relHit: 0, gale: null, q: [], view: { w: null }, hum: null, chargeSnd: null,
    readyN: false, readyT: 0, drawing: false, drawEnd: -9, slashed: false, throwK: null, dim: false,
  });
}
function later(ws, sec, fn) { tfOf(ws).q.push([sec, fn]); }
function runQueue(ss, dt) { const q = ss.q; for (let i = q.length - 1; i >= 0; i--) if ((q[i][0] -= dt) <= 0) { const f = q[i][1]; q.splice(i, 1); f(); } }
const held = (g, ws) => g.arsenal?.current === ws;
/** the eye and the horizontal forward of the local camera */
function eyeFwd(g, eye = _a, fwd = _b) {
  const cam = g.camera;
  eye.copy(cam.position);
  cam.getWorldDirection(fwd); fwd.y = 0;
  if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
  return fwd.normalize();
}
const floorAt = (g, p) => { const y = g.world?.collision?.floorBelow?.(_f.set(p.x, p.y + 0.6, p.z), 0.2, 30); return Number.isFinite(y) ? y : p.y; };

// ------------------------------------------------------------------------------------------ world system (per game)
// swept bands, flying wind blades, kill cuts, the rain screen
function sys(g) {
  if (g._tf) return g._tf;
  const S = g._tf = { arcs: [], cuts: [], cutPool: [], rain: null, rainAmt: 0, rainT: 0, update: (dt) => sysUpdate(g, S, dt) };
  for (let i = 0; i < 3; i++) { const m = gustCut(); m.visible = false; g.scene.add(m); S.cutPool.push(m); }
  S.rain = rainScreen(); g.scene.add(S.rain);
  g.systems.push(S);
  return S;
}
/** a swept water band round pos: head 0 -> 1 between t0 and t1, then the wake drains */
function sweepArc(g, pos, yaw, o, { t0 = 0, t1 = 0.25, span = 0.35, fade = 0.25, amt = 0.7 } = {}) {
  const S = sys(g), mesh = gustBand(o);
  mesh.position.copy(pos); mesh.rotation.y = yaw;
  mesh.material.uniforms.uSpan.value = span;
  g.scene.add(mesh);
  const a = { mesh, t: 0, t0, t1, fade, amt, dur: t1 + fade + span * (t1 - t0) };
  S.arcs.push(a);
  return a;
}
/** the caster's rain screen (L4): amt 0..1 held for `dur` s then faded */
function rainOn(g, amt, dur) { const S = sys(g); S.rainTarget = amt; S.rainT = dur; }
function sysUpdate(g, S, dt) {
  for (let i = S.arcs.length - 1; i >= 0; i--) {
    const a = S.arcs[i], u = a.mesh.material.uniforms;
    a.t += dt;
    const k = clamp((a.t - a.t0) / (a.t1 - a.t0), 0, 1);
    u.uHead.value = k * (1 + u.uSpan.value);
    u.uAmt.value = a.amt * (a.t < a.t0 ? 0 : a.t > a.t1 ? Math.max(0, 1 - (a.t - a.t1) / a.fade) : 1);
    if (a.t >= a.dur) { a.mesh.removeFromParent(); a.mesh.geometry.dispose(); a.mesh.material.dispose(); S.arcs.splice(i, 1); }
  }
  for (let i = S.cuts.length - 1; i >= 0; i--) {
    const c = S.cuts[i];
    c.t += dt;
    const u = c.mesh.material.uniforms;
    u.uT.value = Math.min(1, c.t / 0.08);
    u.uFade.value = c.t < 0.15 ? 1 : Math.max(0, 1 - (c.t - 0.15) / 0.25);
    if (c.z) c.mesh.position.copy(c.z.pos).add(c.off);
    if (c.t >= 0.4) { c.mesh.visible = false; S.cuts.splice(i, 1); }
  }
  // rain screen: eases to its target while held, then drains (only the caster's own screen)
  if (S.rainT > 0) S.rainT -= dt; else S.rainTarget = 0;
  S.rainAmt = damp(S.rainAmt, (S.rainTarget || 0) * (clipComfort.overlay ? 1 : 0), S.rainTarget ? 3 : 1.6, dt);
  const ru = S.rain.material.uniforms;
  ru.uAmt.value = S.rainAmt;
  ru.uAspect.value = g.camera?.aspect || 16 / 9;
  S.rain.visible = S.rainAmt > 0.01;
}

// ------------------------------------------------------------------------------------------ hits
const SEVER_HI = ['neck', 'neck', 'upperarm_l', 'upperarm_r'], SEVER_MID = ['upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r'];
/**
 * One blow on a zombie (local player): damage + HUD + meters. `skill` tags a skill's own hits (the gale damage skin;
 * the ult meter fills from sword strokes and skills alike, never from the ult itself -- the engine's rule).
 */
function strike(ws, g, z, dmg, dir, { knock = 3, stagger = 0.6, sever = null, point = null, tag = 'swing', head = false, skill = null, light = false } = {}) {
  const ar = g.arsenal;
  const p = point || z.center(V3());
  const amount = dmg * (ar?.dmgMul ?? 1) * (head ? ws.def.head ?? 1.5 : 1), hp0 = z.hp ?? 0;
  let box = sever && amount >= hp0 * 0.98 ? (head ? 'neck' : sever[(R() * sever.length) | 0]) : sever && amount > (z.maxHp ?? 999) * 0.45 && R() < 0.35 ? SEVER_MID[(R() * 4) | 0] : undefined;
  if (!box && head && amount >= hp0) box = 'neck';
  if (!box && light && hp0 > 0 && amount >= hp0 * 1.6) box = SEVER_MID[(R() * 4) | 0];
  const info = { amount, part: head ? 'head' : 'body', headshot: head, point: p, normal: dir.clone().negate(), dir: dir.clone(), knock: knock * (ar?.knockMul ?? 1), stagger,
    weapon: ID, shooter: g.localId, melee: true, box, elem: skill ? 'gale' : null, tf: tag };
  if (skill) info.skill = skill;
  const res = z.damage(info);
  g.hud?.onHit?.(info, res, z);
  ar?._special?.(ws, 'onHit', info, res, z);
  if (res?.killed) {
    if (box) { z.sever?.(box, dir); sfx(g, 'taifeng_sever', { pos: p, volume: 0.7 }); }
    launch(z, dir, tag);
  }
  return res;
}
/** greatsword kill weight: the body is thrown along the blow and falls at once (no standing corpses sliding) */
function launch(z, dir, tag) {
  if (!z.kvel || z.def?.boss) return;
  const heavy = tag !== 'sweep' && tag !== 'backsweep', push = heavy ? 4.8 : 3.2, up = heavy ? 4.6 : 3.2;
  z.kvel.x += dir.x * push; z.kvel.z += dir.z * push;
  z.kvel.y = Math.max(z.kvel.y || 0, up * (0.85 + R() * 0.3));
  const a = z.action, d = a?.getClip?.().duration;
  if (d) { a.time = Math.min(d * 0.3, 0.32); a.timeScale = Math.max(a.timeScale, 1.6); }
}
/** zombies inside a horizontal sector around the eye (arc 360 = all round), not behind a wall */
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
    const side = (fwd.x * dz - fwd.z * dx) < 0 ? 1 : -1;
    out.push({ z, d, ang, side, zc });
  }
  return out;
}
// where the blade crosses each target: [height at the eye, rise per side]; at or above the neck the cut is a head hit
const BLADE_Y = { sweep: [-0.22, 0], backsweep: [-0.3, 0.2], drawslash: [-0.25, -0.1] };
/** a horizontal swing connecting: everything in the arc; one swing sound, a flesh layer per body */
function sweep(ws, g, c, sweepDir) {
  const eye = _d.copy(g.camera.position), fwd = eyeFwd(g, _e, V3());
  const list = inSector(g, eye, fwd, c.r, c.arc);
  const look = g.camera.getWorldDirection(V3()), tanP = Math.tan(Math.asin(clamp(look.y, -0.95, 0.95))), [by, rise] = BLADE_Y[c.id] || [-0.25, 0];
  let kills = 0, n = 0, heads = 0, first = null;
  list.sort((a, b) => a.ang - b.ang);
  for (const { z, zc, side, d } of list) {
    const dir = V3().subVectors(zc, eye).setY(0).normalize();
    dir.addScaledVector(_c.crossVectors(UP, dir), 0.6 * sweepDir).normalize();
    const bladeY = eye.y + by + tanP * d + rise * side * Math.min(1, d / 2.2);
    const head = !z.def?.boss && bladeY >= z.pos.y + (z.height ?? 1.8) * 0.8;
    const res = strike(ws, g, z, c.dmg, dir, { knock: c.knock, stagger: c.stagger, sever: c.heavy ? SEVER_HI : null, tag: c.id, head, light: !c.heavy, skill: c.skill || null });
    n++; if (head) heads++;
    if (res?.killed) { kills++; if (kills > 1) z.zfx?.clearStatus?.(z, 'gustkill'); }
    if (!first) first = zc.clone();
    hitSplash(g, zc, dir, c.heavy ? 1.3 : 1);
    if (n <= 3) sfx(g, 'taifeng_hit_flesh', { pos: zc, volume: 0.75 - n * 0.1, pitch: 0.9 + R() * 0.22, delay: (n - 1) * 0.015 });
    if (res?.killed && kills <= 2) sfx(g, 'taifeng_kill', { pos: zc, volume: 0.6, delay: (kills - 1) * 0.04 });
  }
  if (n) {
    g.arsenal?._trailHit?.();                                     // §1.17 the rest of the swing turns storm cyan
    stop(g, kills >= 2 || (heads && kills) ? 0.09 : c.heavy ? 0.08 : 0.05);
    shake(g, (c.heavy ? 0.28 : 0.12) + Math.min(0.2, n * 0.03));
    g.punch?.impulse?.(-0.9 * 0.0175, sweepDir * 0.9 * 0.0175, sweepDir * 1.2 * 0.0175);
    g.vm?.kick?.({ back: 0.02, up: 1.8, side: 1.2 * sweepDir, roll: 2 });
    g.arsenal?.fovKick?.(-1, 0.16);
    sfx(g, 'taifeng_hit', { pos: first, volume: 0.9 });
    sfx(g, 'taifeng_hit_splash', { pos: first, volume: 0.5 });
    haptic(c.heavy ? 40 : 20);
  } else wallClang(g, eye, fwd, c.r);
  return n;
}
/** a swing that met no zombie but a wall within reach: sparks, a wet clang */
function wallClang(g, eye, fwd, r) {
  const d = _c.copy(fwd); d.y = -0.15; d.normalize();
  const wh = g.world?.collision?.raycast(eye, d, r * 0.85);
  if (!wh) return;
  g.fx?.impact?.(wh.surf, wh.point, wh.normal, d, { big: 0.8 });
  g.fx?.sparkBurst?.(wh.point, { color: WHITE, color1: CYAN, count: 12, speed: 5, glow: 0.4, normal: wh.normal });
  spray(g, wh.point, wh.normal, 10, 3);
  sfx(g, 'taifeng_hit_wall', { pos: wh.point });
  shake(g, 0.08);
  haptic(14);
}
/** water spray off a hit: droplets flung along the blow, a mist puff, a cyan glint */
function hitSplash(g, p, dir, k = 1) {
  const P = g.fx?.particles;
  if (!P) return;
  for (let i = 0; i < 12 * k; i++) {
    _c.set(R() - 0.5, R() * 0.9 - 0.1, R() - 0.5).multiplyScalar(4.5).addScaledVector(dir, 3.2);
    P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, vx: _c.x, vy: _c.y, vz: _c.z, life: 0.3 + R() * 0.3, size: 0.02, stretch: 0.03, color: [...WHITE, 1], color1: [...CYAN, 0], frame: FRAME.spark, gravity: 9, drag: 1.4 });
  }
  for (let i = 0; i < 3; i++) P.spawn({ x: p.x, y: p.y, z: p.z, vx: dir.x * 1.2 + (R() - 0.5), vy: 0.3 + R() * 0.4, vz: dir.z * 1.2 + (R() - 0.5), life: 0.5 + R() * 0.3, size: 0.25 * k, size1: 0.8 * k, sizePow: 0.5, color: [0.75, 0.85, 0.9, 0.45], color1: [0.7, 0.8, 0.85, 0], frame: FRAME.dusty, lit: true, drag: 2 });
  P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.12, size: 0.35 * k, size1: 0.55 * k, color: [1.2, 2.6, 3.4, 1], color1: [0, 0, 0, 0], frame: FRAME.glint, rot: R() * 6 });
}
/** a burst of water from a point along a normal (n droplets), optional bigger splash sheet */
function spray(g, p, n0, n, speed = 4, rng = R) {
  const P = g.fx?.particles;
  for (let i = 0; i < n; i++) {
    const v = _c.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(1.4).add(n0).normalize().multiplyScalar(speed * (0.5 + rng()));
    P?.spawn({ additive: true, x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y + 1, vz: v.z, life: 0.45 + rng() * 0.4, size: 0.025, stretch: 0.035, color: [...WHITE, 1], color1: [...TEAL, 0], frame: FRAME.spark, gravity: 9.8, drag: 0.8 });
  }
}
/** KE_GALE: a wind cut across the body, spray spiralling up round it (≤ 3 cuts alive) */
function galeKill(g, z, dir) {
  const S = sys(g), cam = g.camera, c = z.center(V3());
  const m = S.cutPool.find((x) => !x.visible) || S.cuts.shift()?.mesh;
  if (m) {
    const L = 1.2 + R() * 0.4, ang = (R() - 0.5) * 0.8 + (dir.x * cam.matrixWorld.elements[0] + dir.z * cam.matrixWorld.elements[2] > 0 ? 0.25 : -0.25);
    m.quaternion.copy(cam.quaternion).multiply(_q.setFromAxisAngle(_d.set(0, 0, 1), ang));
    _e.set(1, 0, 0).applyQuaternion(m.quaternion);
    m.position.copy(c).addScaledVector(_e, -L / 2);
    m.scale.set(L, 0.2, 1);
    m.visible = true;
    S.cuts.push({ mesh: m, t: 0, z, off: m.position.clone().sub(z.pos) });
  }
  const P = g.fx?.particles;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * 6.283 * 1.6, r = 0.35 + i * 0.012;
    P?.spawn({ additive: true, x: c.x + Math.cos(a) * r, y: c.y - 0.6 + i * 0.07, z: c.z + Math.sin(a) * r, vx: -Math.sin(a) * 2.2, vy: 1.2 + R() * 0.6, vz: Math.cos(a) * 2.2, delay: i * 0.012,
      life: 0.45 + R() * 0.25, size: 0.03, stretch: 0.05, color: [...WHITE, 1], color1: [...CYAN, 0], frame: FRAME.spark, drag: 2.2 });
  }
  g.fx?.motes?.burst?.('frost', _a.set(c.x, c.y + 0.3, c.z), 6, { color: [2.4, 3.8, 4.6], speed: 1.5, spread: 1, radius: 0.3 });
  P?.spawn({ additive: true, x: c.x, y: c.y, z: c.z, life: 0.2, size: 1.1, size1: 1.8, color: [...CYAN, 0.7], color1: [0, 0, 0, 0], frame: FRAME.glint, rot: R() * 6 });
  g.fx?.lights?.flash?.(c, '#8feaff', 1.4, 2, 0.1);
}

// ------------------------------------------------------------------------------------------ the sword's life (view)
// rotor ω (rad/s; extras rate 150°/s = 2.62 rad/s is spinMul 1), needle hPa (spring), vanes slide / flap 0..1 (onParts)
const ROTOR_BASE = 150 * Math.PI / 180;
function view(ws, g, dt) {
  const vm = g.vm, w = vm?.weapon, ss = tfOf(ws), ar = g.arsenal;
  if (!w?.parts?.fx_core || w.def !== ws.def) return;
  const v = ss.view;
  if (v.w !== w) {
    Object.assign(v, { w, t: 0, omega: 3, omegaT: 3, drift: 0, hpa: 1000, hpaV: 0, hpaT: 1000, jitter: 0, slide: 0, flap: 0, slideT: 0, flapT: 0,
      lamp: 0, lampBlink: 0, glintT: 1.5, dripT: 2, coreU: null, kick: 0 });
    w.onParts = (vm2) => vanes(ws, vm2);
    psOf(vm, 'fx_lamp').hidden = true;
  }
  v.t += dt;
  if (!ss.hum && g.audio?.has?.('taifeng_idle')) ss.hum = sfx(g, 'taifeng_idle', { loop: true, volume: 0.08, fadeIn: 0.4 });
  const ready = canCast(ws, 'ult').ok, busy = ss.lockT > 0 || ss.mode === 'cast';
  const charging = ss.mode === 'charge', st = charging ? ss.stage : 0, thrown = !!(ss.throwK && !ss.throwK.done);
  // ---- rotor: idle drifts 2-4 rad/s like a breeze, spins up 20 in the charge, ready kicks; flicks add impulses
  if ((v.drift -= dt) <= 0) { v.drift = 0.8 + R() * 1.4; v.omegaT = 2 + R() * 2; }
  const want = charging ? 12 + 6 * st : thrown ? 14 : ss.mode === 'cast' ? 26 : ready ? 6 : v.omegaT;
  v.omega = damp(v.omega, want, charging ? 2.2 : 1.1, dt) + v.kick;
  v.kick = 0;
  vm.setSpin('fx_rotor', v.omega / ROTOR_BASE);
  // ---- barometer: a damped spring to the target pressure, a shiver when the stage is capped
  const capped = charging && ss.cap < 3 && ss.ct > ws.def.special.gale.stages[2] - 0.05;
  v.hpaT = charging ? [1000, 980, 960, 940][st] + (capped ? 2 * Math.sin(v.t * 37) : 0) : ready ? 988 + 1.5 * Math.sin(v.t * 1.3) : 1000 + 1.2 * Math.sin(v.t * 0.7) + 0.6 * Math.sin(v.t * 2.3);
  if (v.hpaHold > 0) { v.hpaHold -= dt; v.hpaT = v.hpaHold > 0 ? v.hpaPin : v.hpaT; }
  v.hpaV += ((v.hpaT - v.hpa) * 140 - v.hpaV * 14) * dt;
  v.hpa += v.hpaV * dt;
  psOf(vm, 'fx_needle').v = (1000 - v.hpa) / 20;
  XH.stage = st; XH.capped = capped; XH.thrown = thrown; XH.ready = ready && !charging;
  // ---- vanes: out in the charge (flared at stage 3), the cleave wind-up, the throw, the cast; a clip can drive them too
  const vt = charging ? [1, st >= 3 ? 1 : 0.35] : thrown || ss.mode === 'cast' ? [1, 0.6] : (ss.mode === 'swing' && ss.step === 2 && !ss.hit) ? [1, 0.8] : [v.slideT, v.flapT];
  v.slide = damp(v.slide, vt[0], vt[0] > v.slide ? 14 : 8, dt);
  v.flap = damp(v.flap, vt[0] > 0.5 ? vt[1] : 0, 10, dt);
  // ---- the storm lamp: lit when ready (a pulse), blinks on the reminder
  v.lampBlink = Math.max(0, v.lampBlink - dt);
  v.lamp = damp(v.lamp, ready ? 1 : 0, 8, dt);
  psOf(vm, 'fx_lamp').hidden = v.lamp < 0.05 || (v.lampBlink > 0 && Math.floor(v.lampBlink * 16) % 2 === 0);
  // ---- glow: the light lines x1.3 a stage, the core streams faster (pCharge) and whitens at stage 3; thrown: bright
  const G = vm._glowMat, st3 = charging && st >= 3;
  if (G) {
    const pulse = 0.5 + 0.5 * Math.sin(v.t * (st3 ? 15 : 3.1));
    G.glow_cyan = charging ? 1.3 ** st * (st3 ? 1.3 + 0.6 * pulse : 1) : thrown ? 2.0 + 0.5 * pulse : ready ? 1.3 + 0.3 * pulse : 1;
    G.glow_red = 0.6 + 0.6 * v.lamp * (0.6 + 0.4 * Math.sin(v.t * 6.3));
  }
  const prem = w.premium;
  if (prem) prem.override.pCharge = charging ? 0.55 + 0.15 * st : thrown || ss.mode === 'cast' ? 1 : null;
  // the core's tint whitens at stage 3 / in the throw (its own uniform: pv_core coreTint is per material)
  if (!v.coreU) { w.root.traverse((o) => { if (!v.coreU && o.isMesh && o.parent?.name === 'fx_core') v.coreU = o.material?.userData?.shader?.uniforms?.pCoreTint || null; }); }
  if (v.coreU) { v.whiten = damp(v.whiten ?? 0, st3 || thrown ? 1 : 0, 6, dt); v.coreU.value.setRGB(0.62 + 0.38 * v.whiten, 0.91 + 0.09 * v.whiten, 1); }
  if (charging) chargeLife(ws, g, v, st, dt);
  // ---- ready (§1.7.1 beat 7): the rotor kicks, the lamp lights, a gust of mist off the blade
  if (ready && !busy) {
    if (!ss.readyN) { ss.readyN = true; ss.readyT = 0; v.kick += 16; gust(g, 10); }
    else if ((ss.readyT += dt) >= 2.5) { ss.readyT = 0; if (g.hud?.settings?.readyReminder !== false) { v.kick += 8; v.lampBlink = 0.35; gust(g, 4); } }
  } else ss.readyN = false;
  // ---- idle life: a droplet now and then runs down the edge and drips off the point; mist glints off the slot
  const idle = ss.mode === 'idle' && !vm.clip.active && !busy;
  if (idle && (v.dripT -= dt) <= 0) {
    v.dripT = 1.6 + R() * 2.2;
    const c = vm.socketCam(R() < 0.5 ? 'tip' : 'edge_f', _a);
    if (c) g.fx?.particles.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, vy: -0.05, life: 0.9, size: 0.004, size1: 0.003, color: [...WHITE, 0.9], color1: [...CYAN, 0], frame: FRAME.glow, gravity: 0.6, inertia: 0.5 });
  }
  if (idle && (v.glintT -= dt) <= 0) {
    v.glintT = 0.5 + R() * 0.9;
    const c = vm.socketCam(['slot', 'slot_lo', 'slot_hi'][(R() * 3) | 0], _a);
    if (c) g.fx?.particles.spawn({ additive: true, vm: true, x: c.x + (R() - 0.5) * 0.01, y: c.y + (R() - 0.5) * 0.05, z: c.z, vy: 0.03, life: 0.7, size: 0.004, size1: 0.001, color: [...ICE, 1], color1: [...CYAN, 0], frame: FRAME.glint, rot: R() * 6, inertia: 0.5 });
  }
}
/** vm.weapon.onParts: the vanes slide out along -s (18 mm) and then hinge out 12° about the blade axis */
function vanes(ws, vm) {
  const v = tfOf(ws).view, w = vm.weapon;
  for (const [name, sd] of [['fx_vaneR', 1], ['fx_vaneL', -1]]) {
    const p = w.parts[name];
    if (!p) continue;
    const cs = clipVane(vm, name), slide = Math.max(v.slide, cs?.[0] ?? 0), flap = Math.max(v.flap, cs?.[1] ?? 0);
    if (slide < 1e-3 && flap < 1e-3) continue;
    p.node.position.z += 0.018 * slide;                       // -s is three +z
    p.node.quaternion.multiply(_q.setFromAxisAngle(UP, -sd * 12 * Math.PI / 180 * flap * slide));
  }
}
/** clip-driven vanes: scalar tracks 'vane.slide' / 'vane.flap' */
function clipVane(vm) {
  const c = vm.clip;
  if (!c?.active) return null;
  const s = c.sample('vane.slide'), f = c.sample('vane.flap');
  return typeof s === 'number' || typeof f === 'number' ? [s ?? 0, f ?? 0] : null;
}
/** a breath of wind off the blade: mist streaks along it (ready, reminders, the first draw) */
function gust(g, n) {
  const vm = g.vm;
  for (let i = 0; i < n; i++) {
    const c = vm.socketCam(['slot_lo', 'slot', 'slot_hi', 'tip'][i % 4], _a);
    if (c) g.fx?.particles.spawn({ additive: true, vm: true, x: c.x + (R() - 0.5) * 0.04, y: c.y, z: c.z + (R() - 0.5) * 0.02, vx: (R() - 0.3) * 0.12, vy: 0.08 + R() * 0.1, vz: -0.02, delay: i * 0.03,
      life: 0.6, size: 0.006, size1: 0.002, stretch: 0.04, color: [...ICE, 1], color1: [...CYAN, 0], frame: FRAME.spark, inertia: 0.6 });
  }
}
/** while charging: rain streaks converge on the blade, stage 3 throws arcs along it and lights the hands */
function chargeLife(ws, g, v, st, dt) {
  const vm = g.vm, P = g.fx?.particles;
  if (!P) return;
  v.rainT = (v.rainT ?? 0) - dt;
  while (v.rainT <= 0) {
    v.rainT += 1 / (26 + 26 * st);
    const to = vm.socketCam(['slot_lo', 'slot', 'slot_hi', 'mid', 'tip'][(R() * 5) | 0], _b);
    if (!to) break;
    const a = R() * 6.283, r = 0.14 + R() * 0.12;
    const from = _a.set(to.x + Math.cos(a) * r, to.y + Math.sin(a) * r * 0.7 + 0.04, to.z + (R() - 0.5) * 0.05);
    const k = 3.2 + st * 0.6;
    P.spawn({ additive: true, vm: true, x: from.x, y: from.y, z: from.z, vx: (to.x - from.x) * k, vy: (to.y - from.y) * k, vz: (to.z - from.z) * k, life: 1 / k, size: 0.006 + 0.002 * st, size1: 0.002, stretch: 0.035,
      color: [...WHITE, 0.9], color1: [...CYAN, 0.3], frame: FRAME.spark });
  }
  if (st >= 3) {
    if ((v.boltT = (v.boltT ?? 0) - dt) <= 0) {
      v.boltT = 0.13 + R() * 0.08;
      const a = vm.socketCam(R() < 0.5 ? 'slot_lo' : 'base', _a), b = vm.socketCam(R() < 0.5 ? 'tip' : 'slot_hi', _b);
      if (a && b) g.fx?.bolt?.(a.clone(), b.clone(), { vm: true, col: [3.6, 4.6, 6.4], glow: [0.6, 1.4, 2.6], width: 0.012, core: 0.2, levels: 3, jitter: 0.08, branches: 1, regen: 0.04, life: 0.12 });
    }
    if ((v.handT = (v.handT ?? 0) - dt) <= 0) { v.handT = 0.08; const p = vm.socketWorld?.('base', _c); if (p) g.fx?.lights?.flash?.(p, '#bff4ff', 4 + 3 * Math.sin(v.t * 15), 1.6, 0.11); }
  }
}

// ------------------------------------------------------------------------------------------ combo / charge driver
const COMBO_CLIP = ['taifeng_sweep', 'taifeng_backsweep', 'taifeng_cleave'];
function startSwing(ws, g, step) {
  const ss = tfOf(ws), c = ws.def.special.combo[step], ar = g.arsenal;
  ss.mode = 'swing'; ss.step = step; ss.cur = c; ss.t = 0; ss.hit = false; ss.chainT = 0;
  ar.sinceShot = 0;
  ar.playClip(COMBO_CLIP[step], { duration: c.dur });
  if (step === 2) { sfx(g, 'taifeng_cleave_up', { volume: 0.6 }); sfx(g, 'taifeng_cleave', { volume: 1, delay: c.hit * 0.6 }); }
  else sfx(g, step ? 'taifeng_swing2' : 'taifeng_swing', { volume: 0.9, delay: c.hit * 0.45, pitch: step ? 1.05 : 1 });
  g.noise?.(g.camera.position, 12);
}
function vignette(g, k) {
  const post = g.renderer?.post;
  if (!post) return;
  if (g._tfVig == null) g._tfVig = post.vignette ?? 0;
  post.vignette = g._tfVig + k;
  if (k === 0) g._tfVig = null;
}
/** the sword is free for a new action */
const free = (ss, ar) => (ss.mode === 'idle' || ss.mode === 'recover') && ss.lockT <= 0 && ar.state === 'idle';
function startCharge(ws, g) {
  const ss = tfOf(ws), ar = g.arsenal;
  ss.mode = 'charge'; ss.ct = 0; ss.stage = 0; ss.t = 0; ss.cap = canCast(ws, 'ult').ok ? 3 : 2; ss.step = -1;
  ar.sinceShot = 0;
  ar.playClip('taifeng_charge', { duration: 2.4 });
  g.vm.clip.hold = true;
  ss.chargeSnd = sfx(g, 'taifeng_charge', { loop: true, volume: 0.5 });
  ss.chargeSnd?.setRate?.(0.8);
  sfx(g, 'taifeng_vane_out', { volume: 0.6 });
}
/** a skill cast mid-charge (Q / hold Q with RMB down): the charge is dropped without a release */
function abortCharge(ws, g) {
  const ss = tfOf(ws);
  if (ss.mode !== 'charge') return;
  ss.chargeSnd?.stop?.(0.1); ss.chargeSnd = null;
  g.arsenal?.fovHold?.(0, 0.2); vignette(g, 0);
  g.vm.clip.hold = false; ss.mode = 'idle'; ss.stage = 0;
}
function releaseCharge(ws, g) {
  const ss = tfOf(ws), ar = g.arsenal, st = ss.stage;
  ss.chargeSnd?.stop?.(0.1); ss.chargeSnd = null;
  ar.fovHold(0, 0.25);
  vignette(g, 0);
  g.vm.clip.hold = false;
  if (st >= 3 && canCast(ws, 'ult').ok) { ss.mode = 'idle'; castSkill(ws, 'ult'); return; }
  if (st <= 0) {
    ss.mode = 'recover'; ss.t = ws.def.special.recover - 0.35; ss.step = -1;
    ar.playClip('taifeng_lower', { duration: 0.35 });
    sfx(g, 'taifeng_vane_in', { volume: 0.5 });
    return;
  }
  ss.mode = 'release'; ss.t = 0; ss.relStage = Math.min(2, st); ss.relHit = 0;
  ar.playClip(st >= 2 ? 'taifeng_gale2' : 'taifeng_gale1', { duration: st >= 2 ? 0.8 : 0.6 });
  sfx(g, 'taifeng_gale', { volume: 1, pitch: 0.92 });
}
/** a wind blade leaves the sword: one skill event per blade (every client flies it; the caster deals the damage) */
function galeBlade(ws, g, roll, i) {
  const cam = g.camera, dir = cam.getWorldDirection(V3());
  dir.y = clamp(dir.y, -0.35, 0.35); dir.normalize();
  const ev = { type: 'skill', id: 'taifeng_wind', w: ID, slot: 'fx', seed: (R() * 2147483647) | 0, pos: [cam.position.x, cam.position.y, cam.position.z], dir: [dir.x, dir.y, dir.z], by: g.localId, ph: 0, roll, i };
  startSkill(g, ev, { ws, local: true });
  g.net?.sendSkill?.(ev);
  shake(g, 0.15 + 0.05 * i);
  g.punch?.impulse?.(-1.2 * 0.0175, roll > 0 ? 0.6 * 0.0175 : -0.6 * 0.0175, 0);
  haptic(25);
}

function driver(ws, dt, g) {
  const ss = tfOf(ws), p = ws.def.special, ar = g.arsenal;
  runQueue(ss, dt);
  ss.buf = Math.max(0, ss.buf - dt);
  ss.lockT = Math.max(0, ss.lockT - dt);
  if (ss.mode === 'swing') {
    ss.t += dt;
    const c = ss.cur;
    if (!ss.hit && ss.t >= c.hit) { ss.hit = true; if (c.heavy) cleave(ws, g, c); else sweep(ws, g, c, ss.step === 1 ? -1 : 1); }
    if (ss.t >= c.dur) {
      ss.mode = 'recover'; ss.t = 0; ss.chainT = p.chain;
      if (ss.step === 2) { ss.combos++; ar.playClip('taifeng_recover', { duration: p.recover }); ss.step = -1; }
    }
  } else if (ss.mode === 'recover') {
    ss.t += dt;
    if (ss.chainT > 0 && (ss.chainT -= dt) <= 0) ss.step = -1;
    if (ss.t >= p.recover) ss.mode = 'idle';
  } else if (ss.mode === 'drawslash') {
    ss.t += dt;
    const c = p.drawSlash;
    if (!ss.hit && ss.t >= c.hit) { ss.hit = true; drawSlash(ws, g); }
    if (ss.t >= c.dur) { ss.mode = 'recover'; ss.t = p.recover - 0.3; ss.step = -1; }
  } else if (ss.mode === 'charge') {
    ss.ct += dt;
    g.vm.clip.hold = true;
    ss.cap = canCast(ws, 'ult').ok ? 3 : 2;
    const st = Math.min(ss.cap, p.gale.stages.filter((x) => ss.ct >= x).length);
    if (st > ss.stage) {
      ss.stage = st;
      sfx(g, st >= 3 ? 'taifeng_charge_full' : 'taifeng_charge_stage', { volume: 0.6, pitch: [1, 1, 1.1225, 1.26][st] });
      sfx(g, 'taifeng_needle', { volume: 0.45, pitch: 1.3 + 0.1 * st });
      haptic(12);
      ar.fovHold(-st, 0.2);
      vignette(g, 0.08 * st);
      stageFlash(g, st);
      g.vm?.weapon?.premium?.fire?.(0.4 + 0.2 * st, 0.3);
    }
    ss.chargeSnd?.setRate?.(0.8 + 0.45 * Math.min(1, ss.ct / p.gale.stages[2]));
    if (!g.status?.alive) releaseCharge(ws, g);
  } else if (ss.mode === 'release') {
    ss.t += dt;
    const times = ss.relStage >= 2 ? [0.1, 0.3] : [0.12];
    while (ss.relHit < times.length && ss.t >= times[ss.relHit]) {
      const i = ss.relHit++;
      galeBlade(ws, g, ss.relStage >= 2 ? (i ? -38 : 38) : 32, i);
    }
    if (ss.t >= (ss.relStage >= 2 ? 0.8 : 0.6)) { ss.mode = 'recover'; ss.t = p.recover - 0.4; ss.step = -1; }
  } else if (ss.mode === 'throw' || ss.mode === 'cast') {
    if (ss.lockT <= 0) ss.mode = 'idle';
  }
}
/** a charge stage: a flash on the dial, a ring off the guard, rain rushing up the blade */
function stageFlash(g, st) {
  const vm = g.vm, P = g.fx?.particles, d = vm.socketCam('dial', _a);
  if (d) {
    P?.spawn({ additive: true, vm: true, x: d.x, y: d.y, z: d.z, life: 0.25, size: 0.03 + 0.012 * st, size1: 0.07, color: [...(st >= 3 ? RED : WHITE), 1], color1: [0, 0, 0, 0], frame: FRAME.glint, rot: R() * 6 });
    for (let i = 0; i < 8; i++) P?.spawn({ additive: true, vm: true, x: d.x, y: d.y, z: d.z, vx: (R() - 0.5) * 0.5, vy: R() * 0.4, vz: (R() - 0.5) * 0.3, life: 0.2, size: 0.003, stretch: 0.012, color: [...WHITE, 1], color1: [...CYAN, 0], frame: FRAME.spark, gravity: 1 });
  }
  const b = vm.socketCam('rotor', _b);
  if (b) g.fx?.shockwave?.(b, { r0: 0.02, r1: 0.12 + 0.04 * st, life: 0.3, color: CYAN, thin: true, vm: true });
  for (let i = 0; i < 10 + st * 5; i++) {
    const m = vm.socketCam(['slot_lo', 'slot', 'slot_hi', 'mid'][i % 4], _c), t = vm.socketCam('tip', _d);
    if (m && t) P?.spawn({ additive: true, vm: true, x: m.x, y: m.y, z: m.z, vx: (t.x - m.x) * 3, vy: (t.y - m.y) * 3, vz: (t.z - m.z) * 3, delay: i * 0.01, life: 0.3, size: 0.01, stretch: 0.03, color: [...WHITE, 1], color1: [...CYAN, 0], frame: FRAME.spark });
  }
}

// ------------------------------------------------------------------------------------------ 劈地 cleave (third swing)
function cleave(ws, g, c) {
  const eye = _a.copy(g.camera.position), fwd = eyeFwd(g, _e, V3());
  const at = V3().copy(eye).addScaledVector(fwd, c.reach);
  const wh = g.world?.collision?.raycast(eye, fwd, c.reach + 0.2);
  if (wh) at.copy(eye).addScaledVector(fwd, Math.max(0.6, wh.dist - 0.3));
  at.y = floorAt(g, at);
  const ev = { type: 'skill', id: 'taifeng_splash', w: ID, slot: 'fx', seed: (R() * 2147483647) | 0, pos: [at.x, at.y, at.z], dir: [fwd.x, 0, fwd.z], by: g.localId, ph: 0, r: c.r };
  startSkill(g, ev, { ws, local: true });
  g.net?.sendSkill?.(ev);
  let n = 0, kills = 0;
  for (const z of g.zombies?.list || []) {
    if (!z.alive) continue;
    const zc = z.center(V3()), d = Math.hypot(zc.x - at.x, zc.z - at.z);
    if (d > c.r + (z.radius ?? 0.4) || Math.abs(zc.y - at.y) > 2.5) continue;
    const dir = V3().set(zc.x - at.x, 0, zc.z - at.z);
    if (dir.lengthSq() < 1e-4) dir.copy(fwd);
    dir.normalize();
    const res = strike(ws, g, z, c.dmg * Math.max(0.6, 1 - d / (c.r * 1.8)), dir, { knock: c.knock, stagger: 1, sever: SEVER_HI, tag: 'cleave', head: d < 1.0 });
    if (res?.killed) kills++;
    hitSplash(g, zc, dir, 1.2);
    n++;
  }
  if (n) { g.arsenal?._trailHit?.(); sfx(g, 'taifeng_hit', { pos: at, volume: 1 }); }
  stop(g, n ? 0.09 : 0.06);
  shake(g, 0.35);
  g.punch?.impulse?.(-2.6 * 0.0175, 0, (R() - 0.5) * 0.02);
  g.arsenal?.fovKick?.(2, 0.3);
  haptic(40);
  void kills;
}
registerSkill('taifeng_splash', {
  level: 'L2', dur: 1.2,
  start(k) {
    const g = k.game, fx = g.fx, at = k.pos.clone(), r = k.ev.r ?? 3, near = g.camera.position.distanceTo(at) < 5 ? 0.6 : 1;
    fx?.impact?.(0, _a.set(at.x, at.y + 0.02, at.z), UP, _b.set(k.dir.x, -1, k.dir.z).normalize(), { big: 1.6 });
    fx?.shockwave?.(_a.set(at.x, at.y + 0.06, at.z), { normal: UP, r0: 0.4, r1: r * 1.15, life: 0.42, color: [0.5, 1.8, 2.6], thin: true });
    fx?.shockwave?.(_a.set(at.x, at.y + 0.08, at.z), { normal: UP, r0: 0.2, r1: r * 0.7, life: 0.26, color: [1.6, 2.2, 2.6], thin: true });
    fx?.lights?.flash?.(_a.set(at.x, at.y + 0.6, at.z), '#9feaff', 5, 6, 0.2);
    // a crown of water: droplets up and out, a ring of spray sheets, mist rolling out low
    const P = fx?.particles;
    for (let i = 0; i < Math.round(26 * near); i++) {
      const a = k.rng() * 6.283, s = 2 + k.rng() * 3;
      P?.spawn({ additive: true, x: at.x + Math.cos(a) * 0.3, y: at.y + 0.1, z: at.z + Math.sin(a) * 0.3, vx: Math.cos(a) * s, vy: 3.5 + k.rng() * 3, vz: Math.sin(a) * s, life: 0.7 + k.rng() * 0.4, size: 0.035, stretch: 0.04,
        color: [...WHITE, 1], color1: [...TEAL, 0], frame: FRAME.spark, gravity: 9.8, drag: 0.4 });
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * 6.283 + k.rng() * 0.3;
      P?.spawn({ x: at.x + Math.cos(a) * 0.6, y: at.y + 0.15, z: at.z + Math.sin(a) * 0.6, vx: Math.cos(a) * 3.2, vy: 0.4, vz: Math.sin(a) * 3.2, life: 0.8, size: 0.4, size1: 1.2, sizePow: 0.5,
        color: [0.78, 0.86, 0.9, 0.5], color1: [0.7, 0.78, 0.82, 0], frame: FRAME.dusty, lit: true, drag: 2.4 });
      fx?.knockDust?.(_a.set(at.x + Math.cos(a) * r * 0.5, at.y, at.z + Math.sin(a) * r * 0.5), _b.set(Math.cos(a) * 5, 0, Math.sin(a) * 5), 0.8);
    }
    rubble(g, at, Math.round(12 * near), 4, k.rng);
    fx?.decals?.add?.(_a.set(at.x, at.y, at.z), UP, { frame: DECAL.concrete, size: 1.1, alpha: 1, life: 25 });
    fx?.decals?.add?.(_a.set(at.x, at.y, at.z), UP, { frame: DECAL.pool, size: 2.4, tint: DECAL_TINT.none, alpha: 0.55, life: 8 });
    sfx(g, 'taifeng_slam', { pos: at, volume: 0.9 });
    sfx(g, 'taifeng_slam_water', { pos: at, volume: 0.8 });
  },
});
/** chips of street flying off a strike (lit, gravity, bouncing) */
function rubble(g, p, n, speed, rng = R) {
  const P = g.fx?.particles;
  for (let i = 0; i < n; i++) {
    const a = rng() * 6.283, s = speed * (0.4 + rng() * 0.8);
    P?.spawn({ x: p.x, y: p.y + 0.05, z: p.z, vx: Math.cos(a) * s * 0.5, vy: s * (0.6 + rng() * 0.8), vz: Math.sin(a) * s * 0.5, life: 0.9 + rng() * 0.6, size: 0.035 + rng() * 0.045,
      color: [0.42, 0.4, 0.38, 1], color1: [0.36, 0.34, 0.32, 1], frame: FRAME.rock, lit: true, gravity: 12, spin: (rng() - 0.5) * 14, rot: rng() * 6, collide: true, bounce: 0.3 });
  }
}

// ------------------------------------------------------------------------------------------ 破浪 draw slash
function drawSlash(ws, g) {
  const c = ws.def.special.drawSlash, eye = g.camera.position, fwd = eyeFwd(g, _a, V3());
  const n = sweep(ws, g, { id: 'drawslash', dmg: c.dmg, r: c.r, arc: c.arc, knock: c.knock, stagger: 1, heavy: true }, 1);
  // the water arc for everyone (a wide wave sheet sweeping right -> left at waist height)
  const ev = { type: 'skill', id: 'taifeng_wave', w: ID, slot: 'fx', seed: (R() * 2147483647) | 0, pos: [eye.x, eye.y, eye.z], dir: [fwd.x, 0, fwd.z], by: g.localId, ph: 0 };
  startSkill(g, ev, { ws, local: true });
  g.net?.sendSkill?.(ev);
  if (n) stop(g, 0.05);
  shake(g, 0.2);
  sfx(g, 'taifeng_drawslash_wave', { volume: 0.9 });
}
registerSkill('taifeng_wave', {
  level: 'L2', dur: 0.8,
  start(k) {
    const g = k.game, fwd = _a.copy(k.dir).setY(0).normalize(), a0 = Math.atan2(fwd.x, fwd.z);
    const eye = k.caster(_b, _c);
    // the band's arc starts 85° to the right of the forward and runs 170° round to the left
    sweepArc(g, eye, a0 - 85 * Math.PI / 180 - Math.PI, { r0: 1.2, r1: 4.3, h0: -0.75, h1: -0.2, arc: 170 * Math.PI / 180 }, { t0: 0, t1: 0.18, span: 0.45, fade: 0.3, amt: 0.85 });
    // spray flung off the outer lip
    const P = g.fx?.particles;
    for (let i = 0; i < 26; i++) {
      const a = a0 + (85 - 170 * (i / 25)) * Math.PI / 180, r = 3.6 + k.rng() * 0.6;
      P?.spawn({ additive: true, x: eye.x + Math.sin(a) * r, y: eye.y - 0.45, z: eye.z + Math.cos(a) * r, vx: Math.sin(a) * 2.5, vy: 1 + k.rng() * 2, vz: Math.cos(a) * 2.5, delay: i * 0.006,
        life: 0.5 + k.rng() * 0.3, size: 0.03, stretch: 0.04, color: [...WHITE, 1], color1: [...TEAL, 0], frame: FRAME.spark, gravity: 9.8, drag: 0.6 });
    }
    if (!k.local) sfx(g, 'taifeng_drawslash', { pos: eye, volume: 0.8 });
  },
});

// ------------------------------------------------------------------------------------------ 三階蓄力 (RMB channel)
registerSkill('taifeng_gale', {
  level: 'L1', channel: true,
  start(k) {
    if (!k.local) { k.data.mist = 0; return; }
    const ss = tfOf(k.ws);
    ss.gale = { k };
  },
  update(k, dt) {
    const g = k.game;
    if (!k.local) {
      // teammates: rain and mist gathering round the caster's blade while the charge builds
      if ((k.data.mist -= dt) <= 0) {
        k.data.mist = 0.06;
        const p = k.caster(_a, _b), a = k.rng() * 6.283, r = 1.2;
        g.fx?.particles?.spawn({ additive: true, x: p.x + Math.cos(a) * r, y: p.y - 0.2 + k.rng() * 0.6, z: p.z + Math.sin(a) * r, vx: -Math.cos(a) * 3, vy: 0, vz: -Math.sin(a) * 3, life: 0.35, size: 0.04, stretch: 0.05, color: [...WHITE, 1], color1: [...CYAN, 0], frame: FRAME.spark });
      }
      return;
    }
    const ws = k.ws, ss = tfOf(ws), ar = g.arsenal;
    // raise once the sword is free (a swing in progress finishes first)
    if (ss.mode !== 'charge' && free(ss, ar)) startCharge(ws, g);
    if (ss.mode === 'charge') { ar.sinceShot = 0; g.status?.applySlow?.(0.08, 0.75); }
  },
  end(k) {
    if (!k.local) return;
    const g = k.game, ws = k.ws, ss = tfOf(ws);
    ss.gale = null;
    if (ss.mode === 'charge' && held(g, ws)) releaseCharge(ws, g);
  },
});
// a flying crescent wind blade (6 m at 30 m/s): every client flies it from the event; the caster deals 180 to each body
// it passes (once per blade), a wall stops it in a burst of spray
registerSkill('taifeng_wind', {
  level: 'L2', dur: 0.75,
  start(k) {
    const g = k.game, d = k.data, p = k.def.special.gale;
    const dir = k.dir.clone().normalize(), right = _a.crossVectors(dir, UP).normalize(), up = _b.crossVectors(right, dir).normalize();
    d.dir = dir; d.p = p; d.dist = 0.6; d.hit = new Set(); d.alive = true;
    d.from = k.pos.clone().addScaledVector(up, -0.28);
    const m = d.mesh = windBladeMesh();
    m.material.uniforms.uSeed.value = k.rng() * 10;
    // the crescent stands across the flight, rolled along the slash (+roll: from the upper right down to the lower left)
    const basis = new THREE.Matrix4().makeBasis(right, up, dir.clone().negate());
    m.quaternion.setFromRotationMatrix(basis).multiply(_q.setFromAxisAngle(_c.set(0, 0, 1), (k.ev.roll ?? 30) * Math.PI / 180));
    m.scale.set(p.width, p.width, p.width * 0.8);
    m.position.copy(d.from).addScaledVector(dir, d.dist);
    g.scene.add(m);
    // its edge cuts a thin white line in the air the first frames
    sfx(g, 'taifeng_gale_fly', k.local ? { volume: 0.8 } : { pos: k.pos, volume: 0.8 });
    if (!k.local) sfx(g, 'taifeng_gale', { pos: k.pos, volume: 0.8 });
  },
  update(k, dt) {
    const g = k.game, d = k.data, m = d.mesh, u = m.material.uniforms;
    if (!d.alive) { u.uAmt.value = Math.max(0, u.uAmt.value - dt * 6); u.uHit.value = Math.max(0, u.uHit.value - dt * 6); return u.uAmt.value > 0; }
    const step = d.p.speed * dt, prev = d.dist;
    const wall = g.world?.collision?.raycast(_a.copy(d.from).addScaledVector(d.dir, d.dist), d.dir, step + 0.2);
    d.dist = Math.min(d.p.range, d.dist + step);
    m.position.copy(d.from).addScaledVector(d.dir, d.dist);
    u.uAmt.value = Math.min(1, d.dist / 1.2) * (1 - Math.max(0, (d.dist - d.p.range * 0.75) / (d.p.range * 0.25)) * 0.7);
    u.uHit.value = Math.max(0, u.uHit.value - dt * 5);
    // mist and droplets peeling off the horns
    const P = g.fx?.particles, right = _b.set(1, 0, 0).applyQuaternion(m.quaternion);
    for (const sgn of [1, -1]) {
      const h = _c.copy(m.position).addScaledVector(right, sgn * d.p.width * 0.48);
      P?.spawn({ additive: true, x: h.x, y: h.y, z: h.z, vx: (k.rng() - 0.5) * 0.6, vy: (k.rng() - 0.5) * 0.6, vz: (k.rng() - 0.5) * 0.6, life: 0.3, size: 0.06, size1: 0.2, color: [...ICE, 0.5], color1: [...TEAL, 0], frame: FRAME.glow });
    }
    if (k.rng() < 0.6) P?.spawn({ x: m.position.x, y: m.position.y, z: m.position.z, vx: d.dir.x, vy: 0.2, vz: d.dir.z, life: 0.5, size: 0.3, size1: 0.9, sizePow: 0.5, color: [0.8, 0.88, 0.92, 0.28], color1: [0.75, 0.82, 0.86, 0], frame: FRAME.dusty, lit: true, drag: 2 });
    if (k.local && k.ws) {
      // the blade sweeps a band 'width' wide (in its own plane) between prev and dist along the flight
      for (const z of g.zombies?.list || []) {
        if (!z.alive || d.hit.has(z)) continue;
        const zc = z.center(_a), rel = _c.copy(zc).sub(d.from), along = rel.dot(d.dir);
        if (along < prev - 0.6 || along > d.dist + (z.radius ?? 0.4)) continue;
        const lat = rel.addScaledVector(d.dir, -along).length();
        if (lat > d.p.width * 0.5 + (z.radius ?? 0.4)) continue;
        d.hit.add(z);
        const dir = V3().copy(d.dir).setY(0).normalize();
        strike(k.ws, g, z, d.p.dmg, dir, { knock: 5, stagger: 1, sever: SEVER_MID, tag: 'gale', skill: 'taifeng_wind' });
        hitSplash(g, zc.clone(), dir, 1.2);
        u.uHit.value = 1;
        if (d.hit.size === 1) { stop(g, 0.05); sfx(g, 'taifeng_gale_hit', { pos: zc, volume: 0.9 }); g.arsenal?._trailHit?.(); }
        shake(g, 0.06);
      }
    }
    if (wall || d.dist >= d.p.range) {
      d.alive = false;
      const end = m.position;
      for (let i = 0; i < 18; i++) {
        const a = k.rng() * 6.283;
        P?.spawn({ additive: true, x: end.x, y: end.y, z: end.z, vx: Math.cos(a) * 3 + d.dir.x * 2, vy: Math.sin(a) * 2 + 1, vz: (k.rng() - 0.5) * 3 + d.dir.z * 2, life: 0.45, size: 0.025, stretch: 0.04, color: [...WHITE, 1], color1: [...TEAL, 0], frame: FRAME.spark, gravity: 6 });
      }
      if (wall) { g.fx?.impact?.(wall.surf, wall.point, wall.normal, d.dir, { big: 1.1 }); spray(g, wall.point, wall.normal, 16, 4, k.rng); g.fx?.decals?.add?.(wall.point, wall.normal, { frame: DECAL.slash, size: 1.2, alpha: 0.8, life: 12 }); }
    }
    return true;
  },
  end(k) { const m = k.data?.mesh; if (m) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); } },
});

// ------------------------------------------------------------------------------------------ 斬浪擲 the homing water blade
// The blade's water-wind ghost leaves at RELEASE (0.22 s) from the sword's middle, flies at `speed` towards the target
// nearest the crosshair (a 50° cone), turns onto the next unhit body after each pass (300 each, pierces), and after
// `range` metres of flight (or nothing left to hunt) turns home to the caster's hands; the caster's client deals the
// damage, every client flies the same seeded path from its own copy of the zombies.
const RELEASE = 0.22;
let _gbGeo = null;
const gbGeo = () => _gbGeo || (_gbGeo = ghostBladeGeometry());
registerSkill('taifeng_throw', {
  level: 'L2', dur: 4, defaults: { speed: 26, range: 25, dmg: 300, invuln: 1.5 },
  start(k) {
    const g = k.game, d = k.data;
    Object.assign(d, { phase: k.local ? 'wind' : 'out', pos: null, vel: null, dist: 0, hit: new Set(), target: null, ghost: null, trails: [], spin: 0, retarget: 0, flyLoop: null, back: 0 });
    if (k.local) {
      const ws = k.ws, ss = tfOf(ws);
      abortCharge(ws, g);
      ss.mode = 'throw'; ss.lockT = 0.45; ss.step = -1; ss.throwK = k;
      g.vm.clip.hold = false;
      g.arsenal.playClip('taifeng_throw', { duration: 0.45 });
      if (g.status) g.status.invuln = Math.max(g.status.invuln || 0, k.p.invuln);
      sfx(g, 'taifeng_throw', { volume: 1, delay: RELEASE * 0.7 });
    } else launchBlade(k);
  },
  update(k, dt) {
    const g = k.game, d = k.data, p = k.p;
    if (d.phase === 'wind') { if (k.t >= RELEASE) launchBlade(k); else return true; }
    if (!d.ghost) return true;
    const prev = _e.copy(d.pos);
    const speed = p.speed * (d.phase === 'back' ? 1.25 : 1);
    if (d.phase === 'out') {
      // home on the target (re-pick every 0.15 s or when it falls)
      if ((d.retarget -= dt) <= 0 || !d.target?.alive || d.hit.has(d.target)) { d.retarget = 0.15; d.target = pickTarget(g, d, p.range - d.dist); }
      if (d.target) {
        const to = d.target.center(_a).sub(d.pos).normalize();
        d.vel.normalize().lerp(to, 1 - Math.exp(-9 * dt)).normalize();
      }
      const wh = g.world?.collision?.raycast(d.pos, d.vel, speed * dt + 0.3);
      if (wh) { wallSplash(g, wh, d.vel); d.phase = 'back'; sfx(g, 'taifeng_throw_turn', { pos: d.pos, volume: 0.8 }); }
      else { d.pos.addScaledVector(d.vel, speed * dt); d.dist += speed * dt; }
      if (d.dist >= p.range || (!d.target && d.dist > 9) || k.t > 2.6) { d.phase = 'back'; sfx(g, 'taifeng_throw_turn', { pos: d.pos, volume: 0.8 }); }
    } else {
      // home to the caster's hands: steer harder as it closes, never through the floor
      const hand = k.caster(_a, _b).add(_c.set(0, -0.3, 0)).addScaledVector(_b.setY(0).normalize(), 0.5);
      const to = _d.copy(hand).sub(d.pos), L = to.length();
      d.back += dt;
      d.vel.normalize().lerp(to.normalize(), 1 - Math.exp(-(6 + d.back * 10) * dt)).normalize();
      d.pos.addScaledVector(d.vel, Math.min(L, speed * dt));
      if (L < 0.8 || d.back > 2.5) { catchBlade(k); return false; }
    }
    // the ghost: the edge leads (local -Z of the blade frame = its cutting edge), the blade axis along the flight
    // (+Y forward), spinning slowly about the flight so both flats flash
    d.spin += dt * 9;
    const fly = d.vel;
    const ax = _a.copy(fly).normalize(), side = _b.crossVectors(ax, UP).normalize();
    if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
    const edge = _c.crossVectors(side, ax).normalize().applyAxisAngle(ax, d.spin);
    const flat = _d.crossVectors(edge, ax).normalize();                     // right-handed: flat x axis = -edge (the geometry's edge is local -Z)
    d.ghost.obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(flat, ax, edge.negate()));
    d.ghost.obj.position.copy(d.pos).addScaledVector(ax, -0.75);            // the blade's middle rides the path
    // the spiral trails: two cyan-white ribbons wound round the flight line
    for (let i = 0; i < d.trails.length; i++) {
      const a = d.spin * 2.2 + i * Math.PI, r = 0.32;
      const o = _f.copy(side).multiplyScalar(Math.cos(a) * r).addScaledVector(_c.crossVectors(side, ax).normalize(), Math.sin(a) * r);
      d.trails[i].push(d.pos.clone().add(o));
    }
    // spray shed along the path; the flight loop rides it (pitched by the closing speed: Doppler)
    if (k.rng() < 0.7) g.fx?.particles?.spawn({ additive: true, x: d.pos.x + (k.rng() - 0.5) * 0.4, y: d.pos.y + (k.rng() - 0.5) * 0.4, z: d.pos.z + (k.rng() - 0.5) * 0.4, vx: -fly.x * 2, vy: 0.4, vz: -fly.z * 2,
      life: 0.4, size: 0.03, stretch: 0.04, color: [...WHITE, 1], color1: [...TEAL, 0], frame: FRAME.spark, gravity: 5 });
    if (d.flyLoop) {
      d.flyLoop.setPos?.(d.pos);
      const cam = g.camera.position, closing = -_a.copy(d.pos).sub(cam).normalize().dot(fly) * speed;
      d.flyLoop.setRate?.(clamp(1 + closing / 120, 0.75, 1.3));
    }
    if (k.local && k.ws && d.phase === 'out') throwHits(k, prev, d.pos);
    return true;
  },
  end(k) {
    const d = k.data, g = k.game;
    if (d.ghost?.alive) d.ghost.dissolveOut?.(0.25);
    for (const t of d.trails) t.stop?.();
    d.flyLoop?.stop?.(0.1);
    if (k.local && k.ws) { const ss = tfOf(k.ws); if (ss.throwK === k) ss.throwK = null; }
    void g;
  },
});
function launchBlade(k) {
  const g = k.game, d = k.data;
  d.pos = (k.local ? g.vm.socketApparent('mid', V3()) : null) || k.muzzle(V3());
  d.vel = k.dir.clone().normalize();
  d.phase = 'out';
  d.ghost = g.fx?.summons?.ghost?.({ geometry: gbGeo(), size: 1.55, pos: d.pos.clone(), appear: 0.08, life: Infinity, out: 0.3, motion: 'none', big: false,
    base: [0.04, 0.16, 0.24], core: [0.5, 1.8, 2.6], rim: [1.2, 3.2, 4.2], edge: [3.4, 4.4, 5.2], opacity: 0.72, glaze: 1.0, rimPower: 2.2, flowSpeed: 1.8,
    exit: { kind: 'spray', count: 26, color: [2.4, 3.2, 3.6], speed: 3 }, seed: k.ev.seed }) || null;
  if (!d.ghost) { d.ghost = { obj: new THREE.Group(), alive: true }; g.scene.add(d.ghost.obj); }
  for (let i = 0; i < 2; i++) { const t = g.fx?.trail?.({ width: 0.12, life: 0.32, color: [3.0, 4.2, 5.0, 1], color1: [0.3, 1.2, 2.0, 0], taper: 0.2, segs: 28 }); if (t) d.trails.push(t); }
  d.flyLoop = sfx(g, 'taifeng_throw_fly', { loop: true, volume: 0.65, pos: d.pos });
  if (k.local) {
    // the blade copy peels off the sword: a flash on the slot, spray off the edge
    g.vm?.weapon?.premium?.fire?.(0.7, 0.2);
    const c = g.vm.socketCam('mid', _a);
    if (c) for (let i = 0; i < 12; i++) g.fx?.particles.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, vx: (R() - 0.5) * 0.6, vy: R() * 0.3, vz: -R() * 0.6, life: 0.25, size: 0.004, stretch: 0.02, color: [...WHITE, 1], color1: [...CYAN, 0], frame: FRAME.spark });
  }
}
/** the unhit zombie best in front of the flight (angle first, then distance) within `left` metres */
function pickTarget(g, d, left) {
  let best = null, bs = Infinity;
  const fwd = _b.copy(d.vel).normalize();
  for (const z of g.zombies?.list || []) {
    if (!z.alive || d.hit.has(z)) continue;
    const zc = z.center(_a), to = _c.copy(zc).sub(d.pos), dist = to.length();
    if (dist > left + 1 || dist < 0.2) continue;
    const cs = to.dot(fwd) / dist;
    if (cs < Math.cos(55 * Math.PI / 180)) continue;
    const wh = g.world?.collision?.raycast(d.pos, to.multiplyScalar(1 / dist), dist);
    if (wh && wh.dist < dist - 0.5) continue;
    const score = (1 - cs) * 30 + dist;
    if (score < bs) { bs = score; best = z; }
  }
  return best;
}
function throwHits(k, a, b) {
  const g = k.game, d = k.data, p = k.p;
  const seg = _f.copy(b).sub(a), L2 = Math.max(1e-6, seg.lengthSq());
  for (const z of g.zombies?.list || []) {
    if (!z.alive || d.hit.has(z)) continue;
    const zc = z.center(V3());
    const u = clamp(_c.copy(zc).sub(a).dot(seg) / L2, 0, 1);
    const near = _c.copy(a).addScaledVector(seg, u);
    if (near.distanceTo(zc) > 0.95 + (z.radius ?? 0.4)) continue;
    d.hit.add(z);
    const dir = seg.clone().setY(0).normalize();
    strike(k.ws, g, z, p.dmg, dir, { knock: 4, stagger: 1, sever: SEVER_MID, tag: 'throw', skill: 'taifeng_throw', head: zc.y + 0.3 < near.y });
    hitSplash(g, zc, dir, 1.4);
    spray(g, zc, dir, 14, 4);
    d.ghost?.flash?.(0.8);
    sfx(g, 'taifeng_throw_hit', { pos: zc, volume: 0.9, pitch: 0.9 + k.rng() * 0.2 });
    stop(g, 0.03); shake(g, 0.08);
    d.retarget = 0;
  }
}
function wallSplash(g, wh, dir) {
  g.fx?.impact?.(wh.surf, wh.point, wh.normal, dir, { big: 1.2 });
  spray(g, wh.point, wh.normal, 22, 4.5);
  sfx(g, 'taifeng_hit_wall', { pos: wh.point, volume: 0.9 });
}
function catchBlade(k) {
  const g = k.game;
  if (!k.local || !k.ws) return;
  const ss = tfOf(k.ws);
  if (held(g, k.ws)) {
    if (ss.mode === 'idle' || ss.mode === 'recover') { g.arsenal.playClip('taifeng_catch', { duration: 0.42 }); ss.lockT = Math.max(ss.lockT, 0.2); }
    sfx(g, 'taifeng_catch', { volume: 1 });
    g.vm?.weapon?.premium?.fire?.(1, 0.3);                        // the blade flashes as the copy merges into it
    stop(g, 0.04); shake(g, 0.12);
    g.punch?.impulse?.(-1.2 * 0.0175, 0, 0);
    haptic(30);
    const c = g.vm.socketCam('slot', _a);
    if (c) {
      g.fx?.shockwave?.(c, { r0: 0.02, r1: 0.16, life: 0.25, color: CYAN, thin: true, vm: true });
      for (let i = 0; i < 16; i++) g.fx?.particles.spawn({ additive: true, vm: true, x: c.x, y: c.y + (R() - 0.5) * 0.3, z: c.z, vx: (R() - 0.5) * 0.9, vy: R() * 0.5, vz: (R() - 0.5) * 0.4, life: 0.25, size: 0.004, stretch: 0.012, color: [...WHITE, 1], color1: [...CYAN, 0], frame: FRAME.spark, gravity: 2 });
    }
  }
}

// ------------------------------------------------------------------------------------------ 颱風眼 ultimate
// Beats (05d §8.2): ① 0-0.15 a forward slash, an 8 m water ARC pushed out, FOV +4; ② 0.35 the 等壓線 sigil at the mark,
// turning 30°/s anticlockwise; ③ 0.45-0.85 the WALL grows out of the ground (r 5, h 7, three layers at 180°/s, spiral
// rain); ④ 0.85-3.35 the pull (3 m/s to the centre), a bolt every 0.4 s (120), a calm shaft of light in the eye, the
// caster's screen rains (L4); ⑤ 3.35-3.7 the wall collapses inwards (scale 1 -> 0.2): 700 in 8 m, a spray ring, a white
// flash; then the clouds break (a soft light 1 s), a puddle stays 4 s, 10 %: a rainbow.
registerSkill('taifeng_eye', {
  level: 'L4', aim: 'target', dur: 4.6, defaults: { range: 12, r: 5, h: 7, wall: 2.5, pull: 3, boltEvery: 0.4, boltDmg: 120, collapseR: 8, collapseDmg: 700 },
  start(k) {
    const g = k.game, d = k.data, c = (k.at || k.feet()).clone();
    // a ray that found no surface: land where it crosses the caster's floor, at most `range` out
    const fy = k.floorY(_a.copy(k.pos).setY(k.pos.y - 1));
    if (k.dir.y < -0.02 && c.distanceTo(k.pos) > (k.pos.y - fy) / -k.dir.y + 0.5) c.copy(k.pos).addScaledVector(k.dir, (k.pos.y - fy) / -k.dir.y).setY(fy);
    const flat = _b.copy(c).sub(k.pos).setY(0);
    if (flat.length() > k.p.range) { c.copy(k.pos).addScaledVector(flat.normalize(), k.p.range); c.y = k.floorY(c); }
    d.c = c; d.beat = 0; d.bolts = 0; d.yaw = Math.atan2(k.dir.x, k.dir.z);
    d.near = g.camera.position.distanceTo(c) < k.p.r + 3;
    if (k.local) {
      const ws = k.ws, ss = tfOf(ws);
      abortCharge(ws, g);
      ss.mode = 'cast'; ss.lockT = 1.15; ss.step = -1;
      g.vm.clip.hold = false;
      g.arsenal.playClip('taifeng_ult_cast', { duration: 1.15 });
      g.hud?.card?.('斬浪．颱風眼', { color: k.hex.rim, sub: k.def.en });
      g.arsenal.fovKick(4, 0.5);
      if (g.status) g.status.invuln = Math.max(g.status.invuln || 0, 0.8);
      if (clipComfort.overlay) g.hud?.border?.(k.hex.rim, 0.22, 4.0);
      sfx(g, 'taifeng_eye_cast', { volume: 1 });
      sfx(g, 'taifeng_eye_rise', { volume: 0.9, delay: 0.3 });
      // ① the 8 m water arc pushed out by the slash
      const eye = k.caster(_a, _b), a0 = Math.atan2(_b.x, _b.z);
      sweepArc(g, eye, a0 - Math.PI / 2 - Math.PI, { r0: 1.5, r1: 8, h0: -0.7, h1: -0.15, arc: Math.PI }, { t0: 0.02, t1: 0.17, span: 0.5, fade: 0.35, amt: 0.9 });
    } else sfx(g, 'taifeng_eye_rise', { pos: c, volume: 0.9 });
  },
  update(k, dt) {
    const g = k.game, fx = g.fx, d = k.data, c = d.c, t = k.t, p = k.p;
    const T0 = 0.85, T1 = T0 + p.wall, TC = T1 + 0.35;   // (p.wall: the eye's hold; p.dur is the engine's skill length)              // the eye holds 0.85 -> 3.35, collapses 3.35 -> 3.7
    // ② the isobar sigil
    if (d.beat < 1 && t >= 0.35) {
      d.beat = 1;
      d.sigil = fx?.sigils?.sigil?.(c, { design: 'isobar', radius: p.r + 0.8, color: [0.9, 2.6, 3.6], color1: [0.3, 1.0, 1.6], life: TC - 0.3, spin: -0.52, seed: k.ev.seed });
      sfx(g, 'taifeng_eye_sigil', { pos: c, volume: 0.9 });
    }
    // ③ the wall grows out of the ground
    if (d.beat < 2 && t >= 0.45) {
      d.beat = 2;
      d.wall = eyeWall();
      d.wall.position.copy(c);
      d.wall.scale.set(p.r, p.h, p.r);
      g.scene.add(d.wall);
      d.loop = sfx(g, 'taifeng_eye_loop', { pos: c, loop: true, volume: 1 });
      if (k.local && k.level >= 4) { rainOn(g, 1, TC - 0.45); d.rainSnd = sfx(g, 'taifeng_eye_rain', { loop: true, volume: 0.6 }); }
      d.pillar = fx?.sigils?.pillar?.(c, { radius: 0.6, height: 24, color: [0.14, 0.2, 0.27], color1: [0.05, 0.09, 0.14], life: T1 - 0.4, strike: 0.25, motes: 3, ring: false, rise: true, light: 2 });   // the calm in the eye: soft
    }
    if (d.wall) {
      const grow = clamp((t - 0.45) / 0.4, 0, 1), col = clamp((t - T1) / (TC - T1), 0, 1);
      const amt = (1 - (1 - grow) ** 2) * (1 - clamp((t - TC) / 0.3, 0, 1));
      d.flash = Math.max(0, (d.flash ?? 0) - dt * 5);
      // the near side thins when the viewer stands in / at it (rim alpha does most of it)
      d.wall.userData.set({ amt: amt * (d.near ? 0.75 : 1), rise: 0.15 + 0.85 * grow, flash: d.flash });
      const sc = 1 - 0.8 * col * col;
      d.wall.scale.set(p.r * sc, p.h * (1 - 0.25 * col), p.r * sc);
      // spiral rain + dust round the base
      if (amt > 0.1) for (let i = 0; i < 3; i++) {
        const a = k.rng() * 6.283, r = p.r * sc * (0.88 + k.rng() * 0.15), y = k.rng() * p.h * 0.9;
        fx?.particles?.spawn({ additive: true, x: c.x + Math.cos(a) * r, y: c.y + y, z: c.z + Math.sin(a) * r, vx: -Math.sin(a) * 9, vy: 1.5, vz: Math.cos(a) * 9, life: 0.35, size: 0.05, stretch: 0.08,
          color: [...WHITE, 0.8], color1: [...CYAN, 0], frame: FRAME.spark });
      }
      if (amt > 0.2 && k.rng() < 0.5) { const a = k.rng() * 6.283; fx?.knockDust?.(_a.set(c.x + Math.cos(a) * p.r * sc, c.y, c.z + Math.sin(a) * p.r * sc), _b.set(-Math.sin(a) * 6, 0, Math.cos(a) * 6), 1.1); }
    }
    // ④ the pull + the bolts
    if (t >= T0 && t < T1) {
      if (k.local) pullIn(k, c, p.r + 2, p.pull, dt);
      const due = Math.floor((t - T0) / p.boltEvery) + 1;
      while (d.bolts < due) { d.bolts++; bolt(k, c); }
    }
    // ⑤ the collapse
    if (d.beat < 3 && t >= T1) {
      d.beat = 3;
      sfx(g, 'taifeng_collapse', { pos: c, volume: 1.2 });
      sfx(g, 'taifeng_collapse_wave', { pos: c, volume: 1 });
    }
    if (d.beat < 4 && t >= T1 + 0.2) { d.beat = 4; collapse(k, c); }
    if (d.beat < 5 && t >= TC + 0.1) {
      d.beat = 5;
      d.loop?.stop?.(0.4); d.rainSnd?.stop?.(1.2);
      // the clouds break: a soft shaft of daylight on the spot for a second, 10 %: a rainbow
      fx?.sigils?.pillar?.(c, { radius: 2.2, height: 30, color: [1.4, 1.35, 1.1], color1: [0.5, 0.55, 0.6], life: 1.0, strike: 0.3, motes: 8, ring: false });
      sfx(g, 'taifeng_eye_after', { pos: c, volume: 0.8 });
      if (k.rng() < 0.1) {
        const bow = d.bow = rainbowArc(9, 1.2);
        bow.position.set(c.x, c.y - 1, c.z); bow.rotation.y = Math.atan2(g.camera.position.x - c.x, g.camera.position.z - c.z);
        g.scene.add(bow);
      }
    }
    if (d.bow) { const u = clamp((t - TC - 0.1) / 0.4, 0, 1) * (1 - clamp((t - 4.2) / 0.4, 0, 1)); d.bow.material.uniforms.uAmt.value = u; }
  },
  end(k) {
    const d = k.data;
    d.sigil?.stop?.(); d.loop?.stop?.(0.3); d.rainSnd?.stop?.(0.6);
    if (d.wall) { d.wall.removeFromParent(); d.wall.userData.dispose(); }
    if (d.bow) { d.bow.removeFromParent(); d.bow.geometry.dispose(); d.bow.material.dispose(); }
  },
});
/** the eye drags everything within R towards the centre at `speed` m/s (kvel decays at 7/s: adding speed·7·dt holds it) */
function pullIn(k, c, Rr, speed, dt) {
  const g = k.game;
  for (const z of g.zombies?.list || []) {
    if (!z.alive || z.def?.boss || z.puppet || !z.kvel) continue;
    const dx = c.x - z.pos.x, dz = c.z - z.pos.z, dist = Math.hypot(dx, dz);
    if (dist > Rr || dist < 0.6) continue;
    // inwards with a swirl (anticlockwise, the wind round a low)
    const ix = dx / dist, iz = dz / dist, sw = 0.45;
    z.kvel.x += (ix - iz * sw) * speed * 7 * dt; z.kvel.z += (iz + ix * sw) * speed * 7 * dt;
    if (!z.def?.boss && z.state !== 'stagger' && k.rng() < dt * 2) { z.flinchV?.set?.(0, 2, 0); }
  }
}
/** one lightning strike inside the wall: a zombie in it (seeded pick), else a point on the floor */
function bolt(k, c) {
  const g = k.game, fx = g.fx, p = k.p, d = k.data;
  const inside = (g.zombies?.list || []).filter((z) => z.alive && Math.hypot(z.pos.x - c.x, z.pos.z - c.z) <= p.r);
  const z = inside.length ? inside[(k.rng() * inside.length) | 0] : null;
  const to = z ? z.center(V3()) : V3().set(c.x + (k.rng() - 0.5) * p.r * 1.4, c.y, c.z + (k.rng() - 0.5) * p.r * 1.4);
  if (!z) to.y = k.floorY(to);
  const from = V3().set(to.x + (k.rng() - 0.5) * 3, c.y + p.h + 9, to.z + (k.rng() - 0.5) * 3);
  fx?.bolt?.(from, to.clone(), { col: [3.6, 4.6, 6.4], glow: [0.8, 1.4, 3.2], width: 0.32, core: 0.22, levels: 4, jitter: 0.12, branches: 2, regen: 0.05, life: 0.24 });
  fx?.sparkBurst?.(to, { color: WHITE, color1: CYAN, count: 16, speed: 7, glow: 0.8 });
  fx?.shockwave?.(_a.set(to.x, k.floorY(to) + 0.05, to.z), { normal: UP, r0: 0.2, r1: 1.6, life: 0.25, color: [1.6, 2.4, 3.4], thin: true });
  fx?.lights?.flash?.(_a.set(to.x, to.y + 1, to.z), '#cfe8ff', d.near ? 10 : 24, 14, 0.12);
  fx?.decals?.add?.(_a.set(to.x, k.floorY(to), to.z), UP, { frame: DECAL.scorch, size: 1.0, tint: DECAL_TINT.scorch, alpha: 0.6, life: 10 });
  d.flash = 1;
  sfx(g, 'taifeng_thunder', { pos: to, volume: 0.9 });
  if (k.local) {
    if (z) {
      const info = { amount: p.boltDmg * (g.arsenal?.dmgMul ?? 1), part: 'body', point: to.clone(), dir: V3().set(0, -1, 0), knock: 0.5, stagger: 1, weapon: ID, shooter: g.localId, skill: 'taifeng_eye', elem: 'shock' };
      k._feedback(info, z.damage(info), z);   // (KE_GALE comes through onHit)
    }
    shake(g, d.near ? 0.12 : 0.06);
    haptic(12);
  }
}
function collapse(k, c) {
  const g = k.game, fx = g.fx, p = k.p, d = k.data, cn = d.near ? 0.6 : 1;
  fx?.shockwave?.(_a.set(c.x, c.y + 0.08, c.z), { normal: UP, r0: 0.6, r1: p.collapseR * 1.15, life: 0.55, color: [1.4, 2.6, 3.2], thin: d.near });
  fx?.shockwave?.(_a.set(c.x, c.y + 0.1, c.z), { normal: UP, r0: 0.4, r1: p.collapseR * 0.8, life: 0.4, color: CYAN, thin: true });
  fx?.lights?.flash?.(_a.set(c.x, c.y + 3, c.z), '#e8fbff', d.near ? 8 : 22, 20, 0.35);
  // the wall falls in as a ring of spray: droplets thrown up and out, mist rolling over the street
  const P = fx?.particles;
  for (let i = 0; i < Math.round(64 * cn); i++) {
    const a = (i / 64) * 6.283 + k.rng() * 0.2, r = p.r * 0.4 + k.rng() * 0.8, s = 3 + k.rng() * 5;
    P?.spawn({ additive: true, x: c.x + Math.cos(a) * r, y: c.y + 0.3 + k.rng() * 2.5, z: c.z + Math.sin(a) * r, vx: Math.cos(a) * s, vy: 2 + k.rng() * 5, vz: Math.sin(a) * s, life: 0.8 + k.rng() * 0.5, size: 0.05, stretch: 0.06,
      color: [...WHITE, 1], color1: [...TEAL, 0], frame: FRAME.spark, gravity: 9.8, drag: 0.4 });
  }
  for (let i = 0; i < Math.round(16 * cn); i++) {
    const a = (i / 16) * 6.283;
    P?.spawn({ x: c.x + Math.cos(a) * 2, y: c.y + 0.4, z: c.z + Math.sin(a) * 2, vx: Math.cos(a) * 6, vy: 0.6, vz: Math.sin(a) * 6, life: 1.2, size: 0.8, size1: 2.6, sizePow: 0.5,
      color: [0.8, 0.88, 0.92, 0.5], color1: [0.72, 0.8, 0.84, 0], frame: FRAME.dusty, lit: true, drag: 1.8 });
    fx?.knockDust?.(_a.set(c.x + Math.cos(a) * 3, c.y, c.z + Math.sin(a) * 3), _b.set(Math.cos(a) * 9, 0, Math.sin(a) * 9), 1.5);
  }
  rubble(g, c, Math.round(26 * cn), 6, k.rng);
  fx?.decals?.add?.(_a.copy(c), UP, { frame: DECAL.pool, size: 7, tint: DECAL_TINT.none, alpha: 0.6, life: 4 });
  fx?.decals?.add?.(_a.copy(c), UP, { frame: DECAL.concrete, size: 3.5, alpha: 0.9, life: 30 });
  if (k.local) {
    k.hurt(c, p.collapseR, p.collapseDmg, { knock: 8, stagger: 1, falloffMin: 0.5 });
    stop(g, 0.12); shake(g, 0.5);
    if (clipComfort.overlay) g.fx?.overlay?.tint?.([1.3, 1.45, 1.6], 0.25, 0.35, { fadeIn: 0.05, fadeOut: 0.3 });
    if (clipComfort.overlay) g.fx?.overlay?.radial?.(0.5, 0.2, { r0: 0.3, density: 0.3, thin: 0.5 });
    haptic(40); setTimeout(() => haptic(40), 110);
  } else if (g.camera.position.distanceTo(c) < 20) shake(g, 0.25);
}

// ------------------------------------------------------------------------------------------ the special (engine overrides)
registerSpecial(ID, {
  init(ws) {
    tfOf(ws);
    const g = ws.game;
    if (g?.scene) { sys(g); warm(g); }
    const au = g?.audio;
    if (au?.defs && !au._tfPre) { au._tfPre = true; au.preload?.(Object.keys(au.defs).filter((n) => /^(taifeng_|ready_taifeng)/.test(n)))?.catch?.(() => {}); }
  },
  /** the attacks (Arsenal._melee asks every frame while the weapon is idle in hand) */
  melee(ws, s, g) {
    const ss = tfOf(ws);
    if (!g.status?.alive) return true;
    if (s.pressed.fire) ss.buf = 0.3;
    if (ss.lockT > 0 || ss.mode === 'charge' || ss.mode === 'release' || ss.mode === 'drawslash' || ss.mode === 'cast') return true;
    // held LMB keeps chaining (a buffered press near the end of each swing)
    if (s.held.fire && ss.mode === 'swing' && ss.t >= ss.cur.dur * 0.7) ss.buf = Math.max(ss.buf, 0.05);
    if (s.held.fire && (ss.mode === 'idle' || ss.mode === 'recover') && ss.buf <= 0) ss.buf = 0.05;
    if (ss.buf > 0) {
      if (ss.mode === 'idle' || ss.mode === 'recover') { ss.buf = 0; startSwing(ws, g, ss.mode === 'recover' && ss.chainT > 0 && ss.step >= 0 ? (ss.step + 1) % 3 : 0); }
      else if (ss.mode === 'swing' && ss.hit && ss.t >= ss.cur.dur * 0.68) { ss.buf = 0; startSwing(ws, g, (ss.step + 1) % 3); }
    }
    return true;
  },
  onHit(ws, info, res, target) {
    const g = ws.game, z = target?.zombie || target;
    if (!res?.killed || !z?.center) return;
    const dir = info.dir || _a.set(0, 0, -1);
    const zf = z.zfx || g.fx?.zfx;
    if (zf) { zf.clearStatus?.(z, 'kill'); zf.status?.(z, 'gustkill', 0.25); }
    galeKill(g, z, dir);
    if (info.melee) stop(g, info.headshot ? 0.07 : 0.04);
  },
  update(ws, dt, g) {
    const ss = tfOf(ws), ar = g.arsenal, inp = g.input?.state;
    // 破浪: LMB while the sword is coming out (or 0.3 s after) cuts the draw into the draw slash
    if (ar.state === 'draw') { if (!ss.drawing) { ss.drawing = true; ss.slashed = false; } }
    else if (ss.drawing) { ss.drawing = false; ss.drawEnd = g.time; }
    if (inp?.pressed.fire && !ss.slashed && (ss.drawing || (g.time - ss.drawEnd < ws.def.special.drawSlash.window && ss.mode === 'idle'))) {
      ss.slashed = true;
      inp.pressed.fire = false;
      if (ar.state === 'draw') { ar.firstDrawing = false; ar.timer = 0; }
      g.vm.stopClip?.();
      ss.mode = 'drawslash'; ss.t = 0; ss.hit = false; ss.step = -1;
      ar.sinceShot = 0;
      ar.playClip('taifeng_drawslash', { duration: ws.def.special.drawSlash.dur });
      sfx(g, 'taifeng_drawslash', { volume: 1 });
    }
    // F mid-fight is not an inspect
    if (ss.mode !== 'idle' || ss.lockT > 0) { if (inp) inp.pressed.inspect = false; }
    driver(ws, dt, g);
    view(ws, g, dt);
    if (ss.mode === 'charge') ar.sinceShot = 0;
  },
  tick(ws, dt, g) {
    const ss = tfOf(ws);
    if (!held(g, ws)) {
      if (ss.hum) { ss.hum.stop?.(0.2); ss.hum = null; }
      if (ss.chargeSnd) { ss.chargeSnd.stop?.(0.1); ss.chargeSnd = null; }
      if (ss.mode !== 'idle') { ss.mode = 'idle'; ss.step = -1; ss.lockT = 0; g.arsenal?.fovHold?.(0, 0.2); vignette(g, 0); }
      if (ss.view.w?.premium) ss.view.w.premium.override.pCharge = null;
      ss.view.w = null;
      ss.drawing = false;
    }
  },
  dispose(ws) {
    const ss = ws.sp?.tf;
    if (!ss) return;
    ss.hum?.stop?.(0.1); ss.chargeSnd?.stop?.(0.1);
    if (ss.throwK && !ss.throwK.done) endSkill(ss.throwK);
  },
  meterInfo(ws, key, m) {
    if (key !== 'charge') return null;
    const ss = tfOf(ws), n = ss.mode === 'charge' ? ss.stage : 0;
    return { ...m, raw: n, value: n / 3, ready: n >= 3, hidden: ss.mode !== 'charge' };
  },
  onClipEvent(ws, name, arg, g) {
    if (name !== 'tf') return;
    const what = typeof arg === 'string' ? arg : arg?.do, vm = g.vm, v = tfOf(ws).view;
    if (what === 'gust') gust(g, arg?.n ?? 8);
    else if (what === 'rotor') v.kick += arg?.k ?? 24;                 // a finger flicks the anemometer
    else if (what === 'needle') { v.hpaV -= arg?.k ?? 140; sfx(g, 'taifeng_glass_tap', { volume: 0.5 }); }
    else if (what === 'pin') { v.hpaPin = arg?.hpa ?? 900; v.hpaHold = arg?.sec ?? 1.2; }
    else if (what === 'drops') drops(g, arg?.n ?? 10);
    else if (what === 'wipe') wipe(g);
    else if (what === 'world') worldInspect(ws, g);
    else if (what === 'vanes') { v.slideT = arg?.slide ?? 1; v.flapT = arg?.flap ?? 0; }
    else if (what === 'spark') { const d = vm.socketCam('dial', _a); if (d) g.fx?.particles.spawn({ additive: true, vm: true, x: d.x, y: d.y, z: d.z, life: 0.25, size: 0.02, size1: 0.05, color: [...WHITE, 1], color1: [0, 0, 0, 0], frame: FRAME.glint, rot: R() }); }
    else if (what === 'rain') { if (clipComfort.overlay) rainOn(g, arg?.amt ?? 0.5, arg?.sec ?? 0.4); }
  },
});
/** droplets flung off the blade (a wrist flick, the first draw) */
function drops(g, n) {
  const vm = g.vm;
  for (let i = 0; i < n; i++) {
    const c = vm.socketCam(['tip', 'edge_f', 'mid', 'slot_hi'][i % 4], _a);
    if (c) g.fx?.particles.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, vx: (R() - 0.2) * 0.9, vy: R() * 0.5, vz: (R() - 0.5) * 0.4, delay: i * 0.01, life: 0.5, size: 0.005, stretch: 0.02,
      color: [...WHITE, 1], color1: [...CYAN, 0], frame: FRAME.spark, gravity: 3, inertia: 0.4 });
  }
}
/** the palm wiped along the flat: water pushed off in a sheet of droplets, light running up the edge */
function wipe(g) {
  const vm = g.vm;
  for (let i = 0; i < 14; i++) {
    const c = vm.socketCam(i % 2 ? 'slot' : 'mid', _a);
    if (c) g.fx?.particles.spawn({ additive: true, vm: true, x: c.x + (R() - 0.5) * 0.03, y: c.y + (R() - 0.5) * 0.12, z: c.z, vx: 0.3 + R() * 0.4, vy: (R() - 0.5) * 0.2, vz: -0.05, delay: i * 0.015, life: 0.4, size: 0.004, stretch: 0.015,
      color: [...WHITE, 1], color1: [...CYAN, 0], frame: FRAME.spark, gravity: 2, inertia: 0.5 });
  }
  sfx(g, 'taifeng_wipe', { volume: 0.6 });
}

/** first-use hitches: the custom materials, the ghost geometry and the isobar sigil are built up front */
function warm(g) {
  if (g._tfWarm) return;
  g._tfWarm = true;
  try {
    gbGeo();
    g.fx?.sigils?.preload?.(['isobar']);
    for (const t of g.fx?.sigils?.tex || []) if (t) g.renderer?.gl?.initTexture?.(t);
    const grp = new THREE.Group();
    grp.name = 'taifeng-warmup';
    const wall = eyeWall(), bow = rainbowArc(), blade = windBladeMesh(8), band = gustBand({ seg: 8 });
    for (const m of [blade, band, bow]) { m.visible = false; m.frustumCulled = false; grp.add(m); }
    wall.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; } }); wall.visible = false; grp.add(wall);
    const gm = g.fx?.summons?._materials?.({ base: [0.04, 0.16, 0.24], core: [0.5, 1.8, 2.6], rim: [1.2, 3.2, 4.2], edge: [3.4, 4.4, 5.2], opacity: 0.72 }, false, gbGeo());
    if (gm) for (const m of [gm.depth, gm.color]) { const o = new THREE.Mesh(gbGeo(), m); o.visible = false; o.frustumCulled = false; grp.add(o); }
    const sg = g.fx?.sigils;
    if (sg?._sigilMat && sg.geo) { const o = new THREE.Mesh(sg.geo, sg._sigilMat()); o.visible = false; grp.add(o); }
    if (sg?._pillarMat && sg.pillarGeo?.round) { const o = new THREE.Mesh(sg.pillarGeo.round, sg._pillarMat()); o.visible = false; grp.add(o); }
    g.scene.add(grp);
    g.renderer?.gl?.compileAsync?.(grp, g.camera, g.scene)?.catch?.(() => {});
  } catch (e) { console.warn('[taifeng] warm-up', e); }
}
/** 改變世界的檢視: the light drops as a squall passes (exposure x0.82, a cold grey-blue haze, a few rain streaks) */
function worldInspect(ws, g) {
  const post = g.renderer?.post, ss = tfOf(ws);
  if (!post || ss.dim) return;
  const k = 0.82;
  post.exposure *= k; ss.dim = true;
  if (clipComfort.overlay) { g.fx?.overlay?.tint?.([0.62, 0.78, 0.95], 0.14, 2.5, { fadeIn: 0.4, fadeOut: 0.6 }); rainOn(g, 0.45, 2.0); }
  later(ws, 2.5, () => { post.exposure /= k; ss.dim = false; });
}

// ------------------------------------------------------------------------------------------ clips
// Swings are authored as camera-space blade directions (d: where the blade points, m: where the cutting edge travels --
// the edge leads the cut) and grip offsets (m from the hip pose); bladeRot() turns each into the clip's gunRot offset
// about the grip (Euler YXZ, unwrapped key to key). Every swing starts from wherever the sword is now and ends below
// the frame before it comes back up, so no cut is seen unwinding. +x right, +y up, -z forward. The scalar tracks
// 'vane.slide' / 'vane.flap' (0..1) open the vanes (onParts), fx_* tracks drive the other parts.
const Z3 = [0, 0, 0];
const D2R = Math.PI / 180;
const _qb = new THREE.Quaternion(), _qt = new THREE.Quaternion(), _m4 = new THREE.Matrix4(), _eu = new THREE.Euler(), _bx = V3(), _by = V3(), _bz = V3();
function bladeRot(vm, d, m, prev = null) {
  _qb.setFromEuler(vm?.hip?.rot ?? _eu.set(0, 0, 0));
  _by.set(d[0], d[1], d[2]).normalize();
  _bz.set(-m[0], -m[1], -m[2]);                                 // gun +Z = against the edge (the edge is gun -Z)
  _bz.addScaledVector(_by, -_bz.dot(_by)).normalize();
  _bx.crossVectors(_by, _bz);
  _qt.setFromRotationMatrix(_m4.makeBasis(_bx, _by, _bz)).multiply(_qb.invert());
  _eu.setFromQuaternion(_qt, 'YXZ');
  const r = [_eu.x / D2R, _eu.y / D2R, _eu.z / D2R];
  if (prev) for (let i = 0; i < 3; i++) { while (r[i] - prev[i] > 180) r[i] -= 360; while (r[i] - prev[i] < -180) r[i] += 360; }
  return r;
}
const now = (vm) => ({ p: vm?.clip?.active ? vm.clip.sample('gunPos', [0, 0, 0]) || Z3 : Z3, r: vm?.clip?.active ? vm.clip.sample('gunRot', [0, 0, 0]) || Z3 : Z3 });
/** a clip from blade keys [t, gripPos, d, m, ease] (d null = keep the previous blade pose); starts at the current pose */
function swingClip(vm, keys, { events = [], extra = {}, hide = -1, from = null, rest = 'out3', loop, dur } = {}) {
  const f = from ? { p: from[0], r: bladeRot(vm, from[1], from[2]) } : now(vm), gp = [[0, f.p]], gr = [[0, f.r]];
  let prev = f.r;
  keys.forEach(([t, p, d, m, e = 'inOut'], i) => {
    const r = d ? bladeRot(vm, d, m, prev) : prev.slice();
    gp.push([t, p, e]); gr.push([t, r, e]);
    if (i === hide) {
      const n = r.map((x) => ((x % 360) + 540) % 360 - 180);
      gr.push([t + 0.0005, n, 'snap']); gp.push([t + 0.0005, p, 'snap']);
      prev = n; return;
    }
    prev = r;
  });
  const last = gr[gr.length - 1][1], fold = last.map((x) => ((x % 360) + 540) % 360 - 180);
  if (fold.some((x, i) => Math.abs(x - last[i]) > 1e-3)) { const tl = gr[gr.length - 1][0] + 0.0005; gr.push([tl, fold, 'snap']); gp.push([tl, gp[gp.length - 1][1], 'snap']); }
  gp.push([1, Z3, rest]); gr.push([1, Z3, rest]);
  const c = { tracks: { gunPos: gp, gunRot: gr, ...extra }, events };
  if (loop) c.loop = loop;
  if (dur) c.duration = dur;
  return c;
}
// §1.17: a white-hot crescent off the outer half of the blade, cyan-teal in the wake; the cut that lands turns storm
// cyan and brighter (hitColor)
const TRAIL = (id = 'blade', o = {}) => ({ on: true, id, from: 'mid', to: 'tip', profile: 'crescent', color: '#f4fdff', color1: '#2a9fd0', k: 4.2,
  hitColor: '#bff4ff', hitColor1: '#1a7fc0', life: 0.14, ...o });
const TRAIL_OFF = (id = 'blade') => ({ on: false, id });
const LOW = [-0.04, -0.46, 0.04];   // below the frame: the sword comes back up from here
const tr3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const VANES = (keys) => ({ 'vane.slide': keys.map(([t, s]) => [t, s]), 'vane.flap': keys.map(([t, , f]) => [t, f ?? 0]) });
// 橫斬: wind up high right, the blade flat across the front at chest height to the left, out of frame, back up
registerClip('taifeng_sweep', (vm) => swingClip(vm, [
  [0.26, [0.06, 0.1, 0.06], [0.75, 0.62, 0.2], [-0.2, 0.1, -1], 'out3'],
  [0.36, [-0.04, 0.08, -0.1], [0.25, 0.16, -1], [-1, -0.05, 0.1], 'in'],
  [0.48, [-0.24, 0.05, -0.12], [-0.95, 0.0, -0.32], [-0.25, -0.1, 1], 'out'],
  [0.62, [-0.34, -0.1, -0.04], [-0.8, -0.45, 0.35], [0.2, -1, 0.3], 'out3'],
  [0.8, LOW, null, null, 'inOut'],
], { hide: 4, events: [[0.22, 'trail', TRAIL()], [0.28, 'haptic', 'tick'], [0.33, 'tf', { do: 'drops', n: 6 }], [0.64, 'trail', TRAIL_OFF()]] }));
// 反橫斬: from the lower left, back across at chest height to the right
registerClip('taifeng_backsweep', (vm) => swingClip(vm, [
  [0.26, [-0.3, -0.06, -0.02], [-0.92, -0.12, 0.15], [0.25, 0.25, -1], 'out3'],
  [0.38, [-0.06, 0.02, -0.14], [-0.15, 0.22, -1], [1, 0.25, 0.05], 'in'],
  [0.5, [0.12, 0.08, -0.1], [0.85, 0.32, -0.15], [0.3, 0.2, 1], 'out'],
  [0.66, [0.16, 0.12, 0.0], [0.55, 0.7, 0.35], [-0.2, 0.2, 1], 'out3'],
  [0.84, [0.12, -0.46, 0.06], null, null, 'inOut'],
], { hide: 4, events: [[0.22, 'trail', TRAIL()], [0.28, 'haptic', 'tick'], [0.36, 'tf', { do: 'drops', n: 6 }], [0.68, 'trail', TRAIL_OFF()]] }));
// 劈地: raised overhead (the vanes flare: 吸氣), straight down into the street ahead (bites at 0.33 of 0.8 = 0.41), a beat
// in the ground, pulled out with water running off it, back up
registerClip('taifeng_cleave', (vm) => swingClip(vm, [
  [0.24, [-0.04, 0.14, 0.04], [-0.12, 0.9, 0.3], [0, 0.4, -1], 'out3'],
  [0.3, [-0.05, 0.13, -0.04], [-0.12, 0.6, -0.8], [0, -0.6, -0.5], 'in'],
  [0.41, [-0.15, -0.12, -0.3], [-0.12, -0.6, -0.9], [0, -1, 0.3], 'in3'],
  [0.62, [-0.15, -0.13, -0.29], null, null, 'linear'],
  [0.86, LOW, null, null, 'inOut'],
], { hide: 4, extra: VANES([[0, 0, 0], [0.18, 1, 0.9], [0.4, 1, 0.9], [0.6, 0, 0]]),
  events: [[0.04, 'snd', 'taifeng_vane_out'], [0.26, 'trail', TRAIL('blade', { life: 0.13, k: 5 })], [0.44, 'trail', TRAIL_OFF()], [0.62, 'tf', { do: 'drops', n: 12 }]] }));
// 收招 (any input cancels): a half turn of the blade before the body flinging the water off, up onto the right shoulder
registerClip('taifeng_recover', (vm) => swingClip(vm, [
  [0.2, [0.02, 0.0, 0.02], [0.1, 0.8, -0.55], [1, 0.1, 0.1], 'out3'],
  [0.36, [0.02, 0.02, 0.02], [-0.1, 0.8, -0.55], [-1, -0.1, -0.1], 'inOut'],
  [0.52, [0.06, 0.04, 0.08], [0.35, 0.5, 0.8], [0, 1, 0], 'out3'],
  [0.74, [0.06, 0.045, 0.085], null, null, 'linear'],
], { events: [[0.18, 'snd', 'taifeng_flick'], [0.3, 'tf', { do: 'drops', n: 14 }], [0.55, 'snd', 'taifeng_recover']] }));
// 破浪: out of the draw low right, straight into a wide horizontal cut right -> left (bites at 0.18 of 0.42)
registerClip('taifeng_drawslash', (vm) => swingClip(vm, [
  [0.2, [0.12, -0.08, 0.02], [0.95, 0.15, 0.25], [-0.3, 0, -1], 'out'],
  [0.43, [-0.02, 0.02, -0.14], [0.1, 0.1, -1], [-1, 0, 0], 'in'],
  [0.66, [-0.3, 0.0, -0.06], [-0.95, 0.0, -0.2], [-0.2, -0.1, 1], 'out'],
  [0.84, LOW, null, null, 'inOut'],
], { hide: 3, from: [[0.12, -0.42, 0.1], [0.4, 0.4, -0.8], [-0.4, 0.2, -1]], events: [[0.12, 'trail', TRAIL('blade', { life: 0.16, k: 5.5, color1: '#3fbfff' })], [0.2, 'haptic', 'thud'], [0.7, 'trail', TRAIL_OFF()]] }));
// 三階蓄力: the blade stands before the face, flat square to the eye (the slot and the barometer read), the line of the
// blade passing left of the crosshair; held (0.15 -> 0.85 loops, a faint tremble)
registerClip('taifeng_charge', (vm) => {
  const f = now(vm), up = [0.05, 0.03, 0.03], ur = bladeRot(vm, [-0.6, 0.78, -0.2], [0.72, 0.6, 0.15], f.r);
  return {
    loop: [0.15, 0.85],
    tracks: {
      gunPos: [[0, f.p], [0.15, up, 'out3'], [0.32, tr3(up, [0.002, 0.003, 0])], [0.5, tr3(up, [-0.002, 0.001, 0.002])], [0.68, tr3(up, [0.001, 0.003, -0.001])], [0.85, up], [1, Z3, 'inOut']],
      gunRot: [[0, f.r], [0.15, ur, 'out3'], [0.32, tr3(ur, [0.6, -0.4, 0.5])], [0.5, tr3(ur, [-0.5, 0.5, -0.3])], [0.68, tr3(ur, [0.4, 0.3, 0.6])], [0.85, ur], [1, Z3, 'inOut']],
    },
    events: [[0.05, 'snd', 'cloth'], [0.1, 'tf', { do: 'gust', n: 8 }]],
  };
});
registerClip('taifeng_lower', (vm) => swingClip(vm, [[0.5, [0.0, -0.06, 0.02], [0.2, 0.9, -0.3], [1, 0, 0], 'inOut']], { rest: 'inOut' }));
// release 1: a diagonal cut from the upper right down to the lower left (the blade leaves at 0.12 of 0.6)
registerClip('taifeng_gale1', (vm) => swingClip(vm, [
  [0.12, [0.08, 0.12, 0.0], [0.6, 0.75, -0.2], [-0.5, 0.2, -1], 'out3'],
  [0.26, [-0.04, 0.02, -0.14], [0.1, 0.25, -1], [-0.7, -0.7, 0], 'in'],
  [0.42, [-0.26, -0.12, -0.06], [-0.75, -0.5, -0.4], [-0.3, -0.6, 1], 'out'],
  [0.7, LOW, null, null, 'inOut'],
], { hide: 3, events: [[0.1, 'trail', TRAIL('blade', { life: 0.16, k: 5.5 })], [0.2, 'haptic', 'thud'], [0.5, 'trail', TRAIL_OFF()]] }));
// release 2: two crossing cuts (upper right -> lower left, then upper left -> lower right), the blades leave at 0.1 / 0.3
registerClip('taifeng_gale2', (vm) => swingClip(vm, [
  [0.08, [0.08, 0.12, 0.0], [0.6, 0.75, -0.2], [-0.5, 0.2, -1], 'out3'],
  [0.2, [-0.06, 0.0, -0.14], [0.0, 0.2, -1], [-0.7, -0.7, 0], 'in'],
  [0.3, [-0.2, 0.1, -0.04], [-0.6, 0.75, -0.2], [0.5, 0.2, -1], 'out3'],
  [0.44, [0.04, 0.0, -0.14], [0.0, 0.2, -1], [0.7, -0.7, 0], 'in'],
  [0.58, [0.24, -0.12, -0.06], [0.75, -0.5, -0.4], [0.3, -0.6, 1], 'out'],
  [0.8, LOW, null, null, 'inOut'],
], { hide: 5, events: [[0.06, 'trail', TRAIL('blade', { life: 0.15, k: 5.5 })], [0.13, 'haptic', 'thud'], [0.27, 'trail', TRAIL_OFF()], [0.3, 'trail', TRAIL('blade', { life: 0.15, k: 5.5 })], [0.38, 'haptic', 'thud'], [0.66, 'trail', TRAIL_OFF()]] }));
// 斬浪擲: the vanes slide out, the blade drawn back over the right shoulder and slung forward flat (the copy leaves at 0.22)
registerClip('taifeng_throw', (vm) => swingClip(vm, [
  [0.3, [0.1, 0.1, 0.1], [0.4, 0.6, 0.7], [0, 1, 0], 'out3'],
  [0.5, [-0.02, 0.04, -0.2], [0.05, 0.25, -1], [-1, 0, 0], 'in3'],
  [0.7, [-0.04, -0.02, -0.12], [0.0, 0.5, -0.85], [-1, 0, 0], 'out'],
], { rest: 'inOut', extra: VANES([[0, 0, 0], [0.25, 1, 0.5], [0.85, 1, 0.5], [1, 0.6, 0.3]]),
  events: [[0.02, 'snd', 'taifeng_vane_out'], [0.3, 'trail', TRAIL('blade', { life: 0.2, k: 5 })], [0.5, 'haptic', 'thud'], [0.62, 'trail', TRAIL_OFF()]] }));
// the copy merges back: the sword jolts in the hands, the flat swings to the eye
registerClip('taifeng_catch', (vm) => swingClip(vm, [
  [0.18, [0.02, -0.03, 0.05], [-0.2, 0.9, -0.2], [1, 0, 0.3], 'out3'],
  [0.5, [0.0, 0.0, 0.02], null, null, 'linear'],
], { rest: 'inOut', events: [[0.02, 'tf', { do: 'drops', n: 10 }], [0.18, 'tf', 'spark']] }));
// 颱風眼 cast: a forward step and a wide horizontal slash (0 -> 0.15 of the beat), then the blade raised to the sky with
// the vanes flared while the wall rises, held, lowered to the shoulder
registerClip('taifeng_ult_cast', (vm) => swingClip(vm, [
  [0.06, [0.1, 0.05, 0.02], [0.9, 0.3, 0.3], [-0.3, 0, -1], 'out3'],
  [0.15, [-0.06, 0.0, -0.18], [0.05, 0.15, -1], [-1, 0, 0], 'in'],
  [0.26, [-0.26, -0.02, -0.08], [-0.95, 0.05, -0.2], [-0.2, 0, 1], 'out'],
  [0.46, [0.02, 0.16, 0.04], [0.12, 1, 0.12], [-1, 0, 0], 'inOut'],
  [0.78, [0.02, 0.17, 0.04], null, null, 'linear'],
], { rest: 'inOut', extra: VANES([[0, 0, 0], [0.3, 1, 1], [0.85, 1, 1], [1, 0, 0]]),
  events: [[0.02, 'trail', TRAIL('blade', { life: 0.18, k: 6 })], [0.08, 'haptic', 'thud'], [0.28, 'trail', TRAIL_OFF()], [0.44, 'tf', { do: 'rotor', k: 30 }], [0.46, 'shake', 0.12], [0.5, 'tf', { do: 'gust', n: 14 }]] }));
// first draw (1.6 s, once per match, fire cancels): falls into frame from the upper right point-down, turning; caught
// at 0.25 s (the rotor spins up), a full horizontal swing round onto the right shoulder; the needle jumps into the storm
// band (0.7 s, a spark on the dial, distant thunder); the vanes slide out and back (a breath), rain sweeps the screen;
// the 0.2 s freeze, back to the guard
registerClip('taifeng_first', (vm) => swingClip(vm, [
  [0.16, [0.06, 0.02, 0.0], [0.2, -0.8, -0.55], [-0.9, 0, 0.3], 'in'],
  [0.26, [0.04, -0.02, 0.02], [0.4, 0.5, -0.75], [-1, 0.1, 0.1], 'out3'],
  [0.38, [-0.12, 0.04, -0.12], [-0.4, 0.15, -0.9], [-1, 0, 0.4], 'linear'],
  [0.5, [-0.18, 0.06, 0.02], [-0.9, 0.2, 0.3], [0.3, 0, 1], 'linear'],
  [0.62, [0.04, 0.08, 0.08], [0.3, 0.55, 0.8], [0.8, 0.3, -0.4], 'out3'],
  [0.72, [0.05, 0.05, 0.06], [0.2, 0.9, 0.2], [1, 0, 0.2], 'inOut'],
  [0.9, [0.05, 0.05, 0.06], null, null, 'linear'],
], { from: [[0.28, 0.5, -0.1], [0.3, -0.6, -0.7], [-1, 0, 0]], dur: 1.6,
  extra: { ...VANES([[0, 0, 0], [0.56, 0, 0], [0.66, 1, 0.6], [0.78, 1, 0.6], [0.86, 0, 0]]) },
  events: [[0, 'anchorR', ['rest', 0.02]], [0, 'anchorL', ['rest', 0.02]], [0.02, 'snd', 'taifeng_draw_first'], [0.04, 'tf', { do: 'drops', n: 16 }], [0.15, 'anchorR', ['grip_r', 0.05]], [0.16, 'snd', 'taifeng_catch_grip'], [0.16, 'haptic', 'tick'], [0.3, 'anchorL', ['grip_l', 0.15]], [0.17, 'tf', { do: 'rotor', k: 9 }],
    [0.18, 'trail', TRAIL('blade', { life: 0.2, k: 4 })], [0.48, 'trail', TRAIL_OFF()], [0.44, 'tf', { do: 'pin', hpa: 935, sec: 0.5 }], [0.44, 'tf', 'spark'], [0.44, 'haptic', 'tick'],
    [0.45, 'snd', 'taifeng_needle'], [0.47, 'snd', 'taifeng_thunder'], [0.56, 'tf', { do: 'rain', amt: 0.6, sec: 0.4 }], [0.57, 'snd', 'taifeng_vane_out'], [0.6, 'tf', { do: 'gust', n: 12 }],
    [0.8, 'snd', 'taifeng_first_sting'], [0.82, 'glow', { to: 2, sec: 0.15 }], [0.92, 'glow', { to: 1, sec: 0.4 }]] }));
// normal draw (0.55 s): up out of the lower right, the rotor spins a turn, the colour shift is §1.17's
registerClip('taifeng_draw', (vm) => swingClip(vm, [
  [0.7, [0.0, 0.01, 0.0], [-0.25, 0.92, -0.35], [1, 0.1, 0.1], 'out3'],
], { from: [[0.1, -0.42, 0.1], [0.4, 0.6, -0.7], [0, 1, 0]], rest: 'inOut', events: [[0.02, 'snd', 'taifeng_draw'], [0.3, 'tf', { do: 'rotor', k: 7 }]] }));
// inspect (4.2 s): the flat turned to the eye, a slow turn so the light runs over the slot (0.12 -> 0.36 loops while F
// is held); the left hand lets go and taps the barometer glass (the needle shivers), flicks the anemometer (30 rad/s),
// wipes the flat (water pushed off, a light run); back onto the shoulder
registerClip('taifeng_inspect', (vm) => swingClip(vm, [
  [0.12, [-0.12, 0.03, 0.05], [-0.48, 0.86, 0.12], [0.88, 0.48, 0.2], 'inOut'],
  [0.24, [-0.13, 0.04, 0.05], [-0.42, 0.88, 0.24], [0.88, 0.45, 0.55], 'inOut'],
  [0.36, [-0.12, 0.03, 0.05], [-0.48, 0.86, 0.12], [0.88, 0.48, 0.2], 'inOut'],
  [0.46, [-0.08, 0.0, 0.08], [-0.3, 0.9, 0.2], [1, 0.1, 0.4], 'inOut'],
  [0.62, [-0.08, 0.0, 0.08], null, null, 'linear'],
  [0.76, [-0.1, 0.04, 0.08], [-0.15, 0.95, 0.1], [1, 0, 0.1], 'inOut'],
  [0.9, [0.04, 0.04, 0.08], [0.3, 0.6, 0.75], [0, 1, 0], 'inOut'],
], { rest: 'inOut', loop: [0.12, 0.36], dur: 4.2,
  extra: { env: [[0, 0], [0.1, 1], [0.9, 1], [1, 0]], ...VANES([[0, 0, 0], [0.4, 0, 0], [0.47, 1, 0.3], [0.58, 1, 0.3], [0.64, 0, 0]]) },
  events: [[0.03, 'snd', 'cloth'], [0.06, 'tf', 'world'], [0.1, 'snd', 'taifeng_inspect'], [0.15, 'tf', { do: 'gust', n: 6 }], [0.38, 'anchorL', ['rest', 0.15]],
    [0.42, 'tf', { do: 'needle', k: 160 }], [0.42, 'haptic', 'tick'], [0.52, 'tf', { do: 'rotor', k: 28 }], [0.52, 'snd', 'taifeng_rotor_flick'],
    [0.66, 'tf', 'wipe'], [0.74, 'anchorL', ['grip_l', 0.15]], [0.88, 'tf', { do: 'drops', n: 8 }]] }));
// rare inspect (1 in 10): the pressure falls through the floor -- the needle swings to 900, the anemometer races, the
// sword is shoved sideways by a gust (the hands fight it), rain lashes the screen; it passes, the needle creeps back
registerClip('taifeng_inspect_rare', (vm) => swingClip(vm, [
  [0.12, [-0.06, 0.06, 0.06], [-0.22, 0.95, 0.12], [1, 0, 0.2], 'inOut'],
  [0.26, [-0.06, 0.06, 0.06], null, null, 'linear'],
  [0.32, [0.06, 0.04, 0.04], [0.25, 0.92, 0.1], [1, -0.1, 0.4], 'out'],
  [0.38, [-0.02, 0.07, 0.07], [-0.1, 0.95, 0.2], [1, 0.1, -0.2], 'inOut'],
  [0.44, [0.04, 0.05, 0.05], [0.18, 0.93, 0.1], [1, -0.05, 0.3], 'inOut'],
  [0.52, [-0.04, 0.06, 0.06], [-0.2, 0.95, 0.12], [1, 0, 0.2], 'inOut'],
  [0.8, [-0.06, 0.06, 0.06], null, null, 'linear'],
  [0.92, [0.04, 0.04, 0.08], [0.3, 0.6, 0.75], [0, 1, 0], 'inOut'],
], { rest: 'inOut', loop: [0.12, 0.26], dur: 4.2,
  extra: { env: [[0, 0], [0.1, 1], [0.9, 1], [1, 0]], ...VANES([[0, 0, 0], [0.28, 0, 0], [0.32, 1, 1], [0.6, 1, 1], [0.7, 0, 0]]) },
  events: [[0.03, 'snd', 'cloth'], [0.06, 'tf', 'world'], [0.26, 'tf', { do: 'pin', hpa: 900, sec: 1.6 }], [0.27, 'snd', 'taifeng_needle'], [0.28, 'tf', { do: 'rotor', k: 40 }],
    [0.29, 'snd', 'taifeng_gust_blow'], [0.3, 'tf', { do: 'rain', amt: 0.8, sec: 1.0 }], [0.31, 'shake', 0.12], [0.31, 'haptic', 'thud'], [0.33, 'tf', { do: 'gust', n: 18 }], [0.45, 'tf', { do: 'drops', n: 14 }]] }));
// ready idle extra (every 2.5 s while 颱風能量 is full): a flick of the blade, the anemometer kicks, the needle twitches
registerClip('taifeng_ready', {
  duration: 0.9,
  tracks: { gunPos: [[0, Z3], [0.3, [0.01, 0.015, 0.01], 'out3'], [1, Z3, 'inOut']], gunRot: [[0, Z3], [0.3, [-5, 4, -5], 'out3'], [0.55, [2, -1, 2], 'inOut'], [1, Z3, 'inOut']],
    ...VANES([[0, 0, 0], [0.3, 0.6, 0.3], [1, 0, 0]]) },
  events: [[0.25, 'tf', { do: 'gust', n: 6 }], [0.28, 'tf', { do: 'needle', k: 60 }]],
});
// idle tier extra (34-99 %): a wrist flick shaking water off, the needle shivers (稀有待機)
registerClip('taifeng_gust', {
  duration: 1.0,
  tracks: { gunRot: [[0, Z3], [0.25, [3, -4, 4], 'out3'], [0.45, [-2, 2, -2], 'inOut'], [1, Z3, 'inOut']] },
  events: [[0.22, 'tf', { do: 'drops', n: 8 }], [0.24, 'snd', 'taifeng_flick'], [0.3, 'tf', { do: 'needle', k: 80 }]],
});

// ------------------------------------------------------------------------------------------ crosshair, kill mark, damage skin
// xh_typhoon: three spiral rain bands curling in to a hollow eye; 三階蓄力 lights a tick per stage on the outer ring
// (a capped third stage blinks red), 斬浪擲 in flight opens the eye into a broken ring
const XH = { stage: 0, capped: false, thrown: false, ready: false };   // written by view() every frame; state() redraws on a change
registerCrosshair('xh_typhoon', {
  state: () => XH.stage + (XH.capped ? 'c' : '') + (XH.thrown ? 't' : '') + (XH.ready ? 'r' : ''),
  draw(gap, c) {
    const R0 = 13 + gap * 0.6, arms = [];
    for (let i = 0; i < 3; i++) {
      const a0 = i * 2.0944 - 0.5, pts = [];
      for (let k = 0; k <= 10; k++) {
        const u = k / 10, r = R0 * (1 - 0.6 * u), a = a0 + 1.9 * u;   // curling in anticlockwise (the flow round a low)
        pts.push(`${(Math.sin(a) * r).toFixed(1)} ${(-Math.cos(a) * r).toFixed(1)}`);
      }
      arms.push(`M${pts.join(' L')}`);
    }
    const eye = XH.thrown ? `<path class="a" d="M-4 0 A4 4 0 0 1 0 -4 M4 0 A4 4 0 0 1 0 4" fill="none" stroke="${c}" stroke-width="1.3"/>`
      : `<circle class="a" r="3.4" fill="none" stroke="${c}" stroke-width="1.2"/>`;
    const ticks = [0, 1, 2].map((i) => {
      const a = -0.42 + i * 0.42, lit = i < XH.stage, col = i === 2 && XH.capped ? '#ff5a4a' : c;
      return `<path d="M${(Math.sin(a) * (R0 + 4)).toFixed(1)} ${(-Math.cos(a) * (R0 + 4)).toFixed(1)} L${(Math.sin(a) * (R0 + 9)).toFixed(1)} ${(-Math.cos(a) * (R0 + 9)).toFixed(1)}" stroke="${col}" stroke-width="${lit ? 2.6 : 1.6}" stroke-linecap="round" opacity="${lit ? 1 : XH.stage ? 0.3 : 0}"/>`;
    }).join('');
    // ready (颱風能量 full): the tropical-cyclone mark under the crosshair (05d §8.2: HUD 準星下方颱風圖示)
    const mark = XH.ready ? `<g transform="translate(0 ${R0 + 13})" fill="none" stroke="#ff6a4a" stroke-width="1.4" stroke-linecap="round"><circle r="2.6"/><path d="M2.6 0 Q3 -5 -1.5 -6.5 M-2.6 0 Q-3 5 1.5 6.5"/></g>` : '';
    return `<path class="a" d="${arms.join(' ')}" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>${eye}${ticks}${mark}`;
  },
  nodes: 22,
});

// km_taifeng: the satellite image of a typhoon. Beat 1: three cloud bands spiral in from the rim (strokes); 2: the
// disc fills with cloud (white -> cyan), the bands turning; 3: full glow, a ring of rain; 4: the eye flashes clear
// with a ding (headshot: a cross-star in the eye + a ring)
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const seg = (t, a, b) => ease((t - a) / (b - a));
registerKillMark('km_taifeng', {
  draw(ctx, S, t, o) {
    const c = S / 2, R0 = S * 0.42, lw = S * 0.032, col = '#bff4ff', cyan = '#5fd8ff', gold = o.gold ? '#ffd56a' : '#c99a4b';
    const p1 = seg(t, 0, 0.45), p2 = seg(t, 0.45, 0.8), p3 = seg(t, 0.8, 1.0), p4 = seg(t, 1.0, 1.15);
    ctx.clearRect(0, 0, S, S);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const rot = t * 1.6;
    // the dark sea under it (beat 1 opens it)
    ctx.save();
    ctx.globalAlpha = 0.9 * p1;
    const bg = ctx.createRadialGradient(c, c, R0 * 0.1, c, c, R0 * 1.05);
    bg.addColorStop(0, '#0e2b3a'); bg.addColorStop(0.75, '#081a26'); bg.addColorStop(1, 'rgba(4,10,16,0)');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(c, c, R0 * 1.05, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // brass isobar rings round it
    ctx.save(); ctx.strokeStyle = gold; ctx.lineWidth = lw * 0.35; ctx.globalAlpha = 0.6 * p1;
    for (let i = 0; i < 2; i++) { ctx.beginPath(); for (let k = 0; k <= 64; k++) { const a = k / 64 * Math.PI * 2, r = R0 * (0.98 + 0.08 * i) * (1 + 0.03 * Math.sin(3 * a + i)); ctx[k ? 'lineTo' : 'moveTo'](c + Math.cos(a) * r, c + Math.sin(a) * r); } ctx.stroke(); }
    ctx.restore();
    // three cloud bands spiralling in (beat 1 draws them, beat 2 fattens them into cloud)
    const band = (i, w, len) => {
      ctx.beginPath();
      const N = 40;
      for (let k = 0; k <= N * len; k++) {
        const u = k / N, r = R0 * (0.95 - 0.78 * u), a = i * 2.0944 + rot - 4.2 * u;
        ctx[k ? 'lineTo' : 'moveTo'](c + Math.cos(a) * r, c + Math.sin(a) * r);
      }
      ctx.lineWidth = w; ctx.stroke();
    };
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = cyan; ctx.globalAlpha = 0.35 + 0.3 * p2; band(i, lw * (1.2 + 4.5 * p2), Math.max(0.02, p1));
      ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 0.5 + 0.5 * p2; band(i, lw * (0.4 + 1.6 * p2), Math.max(0.02, p1));
    }
    // the central dense overcast (beat 2) with the eye punched out
    if (p2 > 0) {
      const g2 = ctx.createRadialGradient(c, c, R0 * 0.08, c, c, R0 * 0.55);
      g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(0.18, `rgba(235,250,255,${0.85 * p2})`); g2.addColorStop(0.6, `rgba(150,225,255,${0.45 * p2})`); g2.addColorStop(1, 'rgba(60,160,220,0)');
      ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(c, c, R0 * 0.55, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // beat 3: full glow and a ring of rain streaks
    if (p3 > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = col; ctx.lineWidth = lw * 0.3; ctx.globalAlpha = 0.7 * p3;
      for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2 + rot * 0.5; const r0 = R0 * 0.78, r1 = R0 * 0.9; ctx.beginPath(); ctx.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0); ctx.lineTo(c + Math.cos(a - 0.12) * r1, c + Math.sin(a - 0.12) * r1); ctx.stroke(); }
      ctx.shadowColor = cyan; ctx.shadowBlur = S * 0.05 * p3; ctx.globalAlpha = 0.5 * p3; ctx.lineWidth = lw * 0.6; ctx.beginPath(); ctx.arc(c, c, R0 * 0.62, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    // beat 4: the eye clears with a flash (the focal point); headshot: a cross-star + an expanding ring
    const fl = Math.sin(Math.PI * p4) + (o.head ? Math.max(0, 1 - Math.abs(t - 1.1) / 0.08) * 0.8 : 0);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.3 + 0.7 * Math.min(1, fl + p3 * 0.4);
    ctx.shadowColor = cyan; ctx.shadowBlur = S * 0.06;
    ctx.beginPath(); ctx.arc(c, c, S * (0.022 + 0.02 * fl), 0, Math.PI * 2); ctx.fill();
    if (fl > 0.01) {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = lw * 0.35; ctx.globalAlpha = Math.min(1, fl);
      const L = S * 0.03 * (1.6 + fl * (o.head ? 3.6 : 2));
      ctx.beginPath(); ctx.moveTo(c - L, c); ctx.lineTo(c + L, c); ctx.moveTo(c, c - L); ctx.lineTo(c, c + L);
      if (o.head) { const q = L * 0.45; ctx.moveTo(c - q, c - q); ctx.lineTo(c + q, c + q); ctx.moveTo(c + q, c - q); ctx.lineTo(c - q, c + q); }
      ctx.stroke();
    }
    ctx.restore();
    if (o.head && t > 1.0) {
      const u = Math.min(1, (t - 1.0) / 0.17);
      ctx.save(); ctx.globalAlpha = 1 - u; ctx.strokeStyle = cyan; ctx.lineWidth = lw * 0.35;
      ctx.beginPath(); ctx.arc(c, c, S * 0.02 + S * 0.35 * u, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
  },
});
// damage numbers: sword strokes white -> storm cyan on a brass edge; skill hits (wind blades, the throw, the eye) a
// brighter ice -> deep-sea gradient
SKINS.typhoon = ['#ffffff', '#bff4ff', '#5fd8ff', '#8a6a2a'];
SKINS.typhoon_crit = ['#ffffff', '#9feaff', '#2fb8ff', '#c99a4b'];
SKINS.gale = ['#f4fdff', '#8feaff', '#1f8fd0', '#0b2a3a'];

export { SFX as TAIFENG_SFX };
