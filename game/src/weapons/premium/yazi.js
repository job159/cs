// 睚眥．裂魂 Yazi Soulrend — 神兵 M02 ring-pommel long sabre and its cinnabar scabbard (docs/PREMIUM_WEAPONS.md M02; def in
// defs.js, model tools/assets/weapons/yazi.mjs, FX pieces yazi_fx.js). A premium melee on the dual grip of the model: the
// sabre (R_gun, right hand) and the scabbard (L_gun, left hand) are posed by the weapon itself in camera space (clips
// carry per-hand keys; a scabbard key may be "sheathed": placed on the sabre with the blade `sh` mm out of it), the
// hands follow by IK. The special drives its own attacks (Arsenal._melee -> special.melee); skills run on specials v2.
//   LMB tap   三段斬: 袈裟 (a diagonal cut, 95) -> 橫 (the flat return, 95) -> 兜割 (an overhead cleave with a 1.5 m lunge,
//             160, hard knockback); everything in the 110° arc; white cuts that turn blood red on the bite (§1.17),
//             hit-stop, a camera punch; 收招 after the third (a blood flick; 1 in 8: the drops write 報 in the air)
//   RMB held  居合: the blade goes home into the scabbard at the left hip in 0.15 s. Hit in the next 0.25 s = perfect
//             parry (0 damage, the attacker reels 1.5 s, +15 怨氣, a free full 一閃). Held on: 3 rune stages to 1.2 s
//             (the scabbard's three seal strips light one by one; at full the thumb breaks the mouth, the blade 3 cm
//             out, the 睚眥 jaw opens). Release = 一閃: a 6 m dash-cut through the lane (180 -> 520, pierces all), four
//             white-to-blood slashes across the view (three for show), 90 ms hit-stop, FOV +4°, the bodies it passed
//             burst a beat later
//   Q tap     睚眥必報 (18 s cooldown): 4 s of vengeance -- melee damage taken x0.5 and 200 % of it struck back on the
//             attacker (bosses 50 %): a crimson thread snaps out and stamps a 報 seal on it
//   Q held    裂魂 (怨氣 100 %): shadow-puppet swordsmen (皮影刀客) propped up beside up to 6 targets in a 10 m cone,
//             the targets dragged 3 m together, six cuts in 0.6 s (150 each), the blood-red 報 seal stamped in the
//             air over them with a pillar, then one draw straight through the middle (600 in 6 m, a ring of red on
//             the street), the blade half home, the puppets fall back into paper ash; 1.0 s invulnerable; 報仇: team
//             headshots +10 % for 4 s after it
//   kill      KE_SOUL: a red soul wisp flies from the body into the blade (+2 怨氣 on arrival); the wave's last kill: a
//             puppet swordsman rises at the body and cuts it again (KE_FINAL)
//   crisis    怒目 (crisis.js counter): the blade draws itself all round, a ring of red light (300 in 4 m)
// Sound cues (§1.12, produced later): see SFX; a missing cue falls back to an existing sample or stays silent.
import * as THREE from 'three';
import { registerSpecial, registerSkill, startSkill, meterAdd, meterEvent, canCast, addAura, auraMul } from '../specials.js';
import { registerClip } from '../../player/clips.js';
import { registerCrosshair } from '../../ui/crosshairs.js';
import { registerKillMark } from '../../ui/killmarks.js';
import { SKINS } from '../../ui/dmgnums.js';
import { FRAME, DECAL, DECAL_TINT } from '../../fx/fx.js';
import { clipComfort, haptic } from '../arsenal.js';
import { SHELL } from '../../fx/zfx.js';
import { WHITE, BLOOD, CRIM, EMBER, GOLD, sealMesh, cutLine, puppet, puppetPool, fxTextures } from './yazi_fx.js';

const ID = 'yazi';
const UP = new THREE.Vector3(0, 1, 0);
const V3 = () => new THREE.Vector3();
const _a = V3(), _b = V3(), _c = V3(), _d = V3(), _e = V3(), _f = V3(), _q = new THREE.Quaternion();
const R = Math.random;
const G_PLAYER = 15.2;                                   // controller gravity (player/controller.js MOVE.gravity)
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const shake = (g, a) => { if (clipComfort.shake) g.addShake?.(a); };
const stop = (g, s) => { if (clipComfort.hitstop) g.hitStop?.(s); };
const MIST = [0.55, 0.03, 0.03];                         // the dark-red mist / blood drops
// sound cues: name -> fallback (existing sample) | null
const SFX = {
  yazi_draw: 'draw', yazi_draw_first: 'draw', yazi_koiguchi: 'impact_metal', yazi_unsheathe: 'swing', yazi_first_sting: null, yazi_growl: null, yazi_idle: null,
  yazi_swing: 'swing', yazi_swing_heavy: 'swingHeavy', yazi_hit: 'melee_heavy_hit', yazi_hit_flesh: 'knife_hit_flesh', yazi_hit_wall: 'knife_hit_wall', yazi_kill: null, yazi_sever: 'gib',
  yazi_flick: 'cloth', yazi_sheathe: 'impact_metal', yazi_charge: null, yazi_charge_stage: 'xh_node', yazi_charge_full: null, yazi_issen: 'swingHeavy', yazi_issen_ring: null, yazi_issen_burst: 'knife_hit_flesh',
  yazi_parry: 'bifang_bell', yazi_parry_cymbal: null, yazi_vengeance: null, yazi_reflect: 'impact_metal', yazi_vengeance_end: null,
  yazi_ult_cast: null, yazi_ult_puppet: null, yazi_ult_suona: null, yazi_ult_slash: 'swing', yazi_ult_seal: 'bifang_bell', yazi_ult_issen: 'swingHeavy', yazi_ult_boom: 'explosion_large',
  yazi_ult_sheathe: 'impact_metal', yazi_ult_bed: null, ready_yazi: null, yazi_inspect: 'cloth', yazi_crisis: 'impact_glass', yazi_final: 'explosion_far', yazi_soul: null, yazi_recover: 'cloth', yazi_blood: null,
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
  return ws.sp.yz || (ws.sp.yz = {
    mode: 'idle', t: 0, cur: null, step: -1, hit: false, chainT: 0, buf: 0, lockT: 0, combos: 0, lunge: null,
    iai: null, iaiEnd: -9, issen: null, venge: null, q: [], view: { w: null }, hum: null, chargeSnd: null, readyN: false, readyT: 0, finalWave: -1,
    pose: { R: { p: V3(), q: new THREE.Quaternion() }, L: { p: V3(), q: new THREE.Quaternion() } }, poseOK: false, kuchi: 0,
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
// cut lines on bodies (pool), the screen slashes (camera), soul wisps, live puppets, the headshot aura hook
function sys(g) {
  if (g._yz) return g._yz;
  const S = g._yz = { cuts: [], pool: [], screen: [], smears: [], smearI: 0, wisps: [], puppets: [], seals: [], pupPool: [], sealPool: [], headHook: false, update: (dt) => sysUpdate(g, S, dt) };
  for (let i = 0; i < 8; i++) { const m = cutLine(); g.scene.add(m); S.pool.push(m); }
  for (let i = 0; i < 4; i++) { const m = cutLine(); g.camera.add(m); S.screen.push(m); }
  // the combo's swing smears (camera space, two so a quick chain never steals the one still fading)
  for (let i = 0; i < 2; i++) { const m = cutLine(); g.camera.add(m); S.smears.push(m); }
  g.systems.push(S);
  return S;
}
function sysUpdate(g, S, dt) {
  // cut lines (bodies and screen): draw in, hold, bleed to red, fade
  // (the screen slashes and smears run on real time: they keep drawing through a hit-stop instead of hanging in it; a
  // frame is slowed only when the stop was already running at its start -- one set during this frame is not yet)
  const rdt = S.hsPrev > 0 ? dt / 0.08 : dt;
  S.hsPrev = g.hitStopT;
  for (let i = S.cuts.length - 1; i >= 0; i--) {
    const c = S.cuts[i], u = c.mesh.material.uniforms;
    c.t += c.screen || c.smear ? rdt : dt;
    const tt = c.t - (c.delay || 0);
    u.uT.value = clamp(tt / c.T[0], 0, 1);
    // a swing smear stays white unless the cut bites (§1.17): then it bleeds red from the bite on
    u.uRed.value = c.smear ? (c.biteT != null ? clamp((c.t - c.biteT) / 0.06, 0, 1) : 0) : clamp((tt - c.T[0]) / c.T[1], 0, 1);
    u.uFade.value = tt < c.T[0] + c.T[1] ? (tt < 0 ? 0 : 1) : Math.max(0, 1 - (tt - c.T[0] - c.T[1]) / c.T[2]);
    if (c.z) c.mesh.position.copy(c.z.pos).add(c.off);
    if (tt >= c.T[0] + c.T[1] + c.T[2]) { c.mesh.visible = false; S.cuts.splice(i, 1); }
  }
  // soul wisps: a bezier from the body to the blade, a comet of red motes; +2 怨氣 on arrival
  const P = g.fx?.particles;
  for (let i = S.wisps.length - 1; i >= 0; i--) {
    const w = S.wisps[i];
    w.t += dt;
    const u = Math.min(1, w.t / w.T), e = u * u * (3 - 2 * u);
    const to = g.vm?.socketApparent?.('mid_r', _e) || _e.copy(g.camera.position).add(_f.set(0, -0.25, 0));
    const a = w.a, c1 = w.c1, x = (1 - e) * (1 - e) * a.x + 2 * (1 - e) * e * c1.x + e * e * to.x, y = (1 - e) * (1 - e) * a.y + 2 * (1 - e) * e * c1.y + e * e * to.y, z = (1 - e) * (1 - e) * a.z + 2 * (1 - e) * e * c1.z + e * e * to.z;
    if (P) {
      P.spawn({ additive: true, x, y, z, life: 0.05, size: 0.07 * (1 - 0.4 * u), size1: 0.05, color: [4.2, 2.6, 2.0, 1], color1: [...EMBER, 0], frame: FRAME.glow });
      P.spawn({ additive: true, x, y, z, life: 0.22, size: 0.2 * (1 - 0.5 * u), size1: 0.03, color: [...CRIM, 0.9], color1: [...BLOOD, 0], frame: FRAME.glow });
      for (let j = 0; j < 2; j++) P.spawn({ additive: true, x: x + (R() - 0.5) * 0.08, y: y + (R() - 0.5) * 0.08, z: z + (R() - 0.5) * 0.08, vx: (R() - 0.5) * 0.4, vy: (R() - 0.5) * 0.4, vz: (R() - 0.5) * 0.4, life: 0.35, size: 0.035, size1: 0.005, color: [...EMBER, 1], color1: [0.3, 0.01, 0, 0], frame: FRAME.glow, drag: 2 });
    }
    if (u >= 1) {
      S.wisps.splice(i, 1);
      // (no refill while the ultimate runs)
      if (w.ws && held(g, w.ws)) { if (![...(w.ws.sp.run || [])].some((k) => k.slot === 'ult' && !k.done)) meterAdd(w.ws, 'ult', 2); ssOf(w.ws).view.soulT = 0.25; }
    }
  }
  // puppets (the ult, KE_FINAL)
  for (let i = S.puppets.length - 1; i >= 0; i--) if (!S.puppets[i].update(dt)) S.puppets.splice(i, 1);
  // 報 seals
  for (let i = S.seals.length - 1; i >= 0; i--) { const s = S.seals[i]; if (s.update(dt) === false) { sealFree(s.mesh); S.seals.splice(i, 1); } }
  // 報仇 (headshots +10 % for the team after 裂魂): the zombies' damage() scales this player's head hits while it lasts
  if (!S.headHook && g.zombies?.list?.length) installHeadHook(g, S);
}
/** 報仇: wraps Zombie.prototype.damage once; a head hit from this player is scaled by the live headDmg aura */
function installHeadHook(g, S) {
  const proto = Object.getPrototypeOf(g.zombies.list[0]);
  S.headHook = true;
  if (!proto || proto._yzHead) return;
  proto._yzHead = true;
  const orig = proto.damage;
  proto.damage = function (info) {
    const gg = this.mgr?.game;
    if (gg && info && info.amount > 0 && (info.headshot || info.part === 'head') && info.shooter === gg.localId) {
      const k = auraMul(gg, 'headDmg');
      if (k !== 1) info = { ...info, amount: info.amount * k };
    }
    return orig.call(this, info);
  };
}

// ------------------------------------------------------------------------------------------ hits
const SEVER_HI = ['neck', 'neck', 'upperarm_l', 'upperarm_r'], SEVER_ANY = ['neck', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r'], SEVER_ARM = ['upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r'];
/**
 * One blow on a zombie (local player): damage + HUD + meters. `skill` tags a skill's own hits (no 怨氣 refund from the
 * skill itself; the ultimate's meter fills from cuts, parries and kills). elem 'soulrend': the white skill numbers.
 */
function strike(ws, g, z, dmg, dir, { knock = 1.8, stagger = 0.5, sever = null, point = null, tag = 'cut', head = false, skill = null, light = false, blood = 1, elem = null } = {}) {
  const ar = g.arsenal;
  const p = point || z.center(V3());
  const amount = dmg * (ar?.dmgMul ?? 1) * (head ? ws.def.head ?? 1.5 : 1), hp0 = z.hp ?? 0;
  let box = sever && amount >= hp0 * 0.98 ? (head ? 'neck' : sever[(R() * sever.length) | 0]) : undefined;
  if (!box && head && amount >= hp0 && !light) box = 'neck';
  if (!box && light && hp0 > 0 && amount >= hp0 * 1.6) box = SEVER_ARM[(R() * 4) | 0];
  const info = { amount, part: head ? 'head' : 'body', headshot: head, point: p, normal: dir.clone().negate(), dir: dir.clone(), knock: knock * (ar?.knockMul ?? 1), stagger,
    weapon: ID, shooter: g.localId, melee: true, box, ss: tag, blood };
  if (skill) info.skill = skill;
  if (elem) info.elem = elem;
  const u0 = skill ? ws.sp?.m?.ult : undefined;
  const res = z.damage(info);
  g.hud?.onHit?.(info, res, z);
  ar?._special?.(ws, 'onHit', info, res, z);
  // a skill's own hits do not count as cuts for 怨氣 (its damage still lands)
  if (u0 !== undefined && skill !== 'yazi_issen' && ws.sp.m.ult > u0) ws.sp.m.ult = u0;
  if (res?.killed) {
    if (box) { z.sever?.(box, dir); sfx(g, 'yazi_sever', { pos: p, volume: 0.7 }); }
    launch(z, dir, tag);
  }
  return res;
}
/** a sabre kill: the body thrown along the cut, the death clip skips its upright first beat and plays fast */
function launch(z, dir, tag) {
  if (!z.kvel || z.def?.boss) return;
  const k = { cut: [3.4, 2.6], heavy: [5.5, 4.2], issen: [6.5, 3.2], reflect: [4, 3], ult: [5.5, 5.0], final: [6, 4] }[tag] || [3.6, 2.8];
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
const CUT_Y = { kesa: [-0.2, 0.5], yoko: [-0.16, 0], kabuto: [-0.3, 0], crisis: [-0.3, 0] };
// screen angle of each cut's stroke on a body, radians from +x (camera right)
const CUT_ANG = { kesa: -2.35, yoko: 0.05, kabuto: -1.57, issen: 0.08, ult: 0.4, reflect: 0.9, crisis: 0 };
/** a cut connecting: everything in the arc; a flesh layer per body (≤ 3), a kill sound per kill (≤ 2) */
function sweep(ws, g, c, sweepDir) {
  const eye = _d.copy(g.camera.position), fwd = eyeFwd(g, _e, V3());
  const list = inSector(g, eye, fwd, c.r, c.arc);
  const look = g.camera.getWorldDirection(V3()), tanP = Math.tan(Math.asin(clamp(look.y, -0.95, 0.95))), [by, rise] = CUT_Y[c.id] || [-0.2, 0];
  let kills = 0, n = 0, heads = 0;
  const heavy0 = !!c.heavy;
  list.sort((a, b) => a.ang - b.ang);
  for (const { z, zc, side, d } of list) {
    const dir = V3().subVectors(zc, eye).setY(0).normalize();
    dir.addScaledVector(_c.crossVectors(UP, dir), 0.55 * sweepDir).normalize();   // carried along the cut
    const bladeY = eye.y + by + tanP * d + rise * side * Math.min(1, d / 2.2);
    const head = !z.def?.boss && bladeY >= z.pos.y + (z.height ?? 1.8) * 0.8;
    const res = strike(ws, g, z, c.dmg, dir, { knock: c.knock, stagger: c.stagger, sever: c.heavy ? SEVER_HI : null, tag: c.heavy ? 'heavy' : 'cut', head, light: !c.heavy, blood: n < 3 ? 1 : 0.3 });
    n++; if (head) heads++;
    if (res?.killed) kills++;
    else if (n <= 4) slashOn(g, z, CUT_ANG[c.id] ?? 0, 0.85, 0.42);
    hitBurst(g, zc, dir, n <= 3 ? 1 : 0.45, n <= 2 ? 1 : n <= 3 ? 0.5 : 0, heavy0 ? 1.3 : 1);
    if (n <= 3) sfx(g, 'yazi_hit_flesh', { pos: zc, volume: 0.8 - n * 0.1, pitch: 0.95 + R() * 0.15, delay: (n - 1) * 0.015 });
    if (res?.killed && kills <= 2) sfx(g, 'yazi_kill', { pos: zc, volume: 0.6, delay: (kills - 1) * 0.04 });
  }
  const heavy = !!c.heavy;
  if (n) {
    g.arsenal?._trailHit?.();                              // §1.17 the rest of the cut bleeds red
    smearBite(g);
    edgeSparks(g, 8 + Math.min(10, n * 3));
    stop(g, heavy ? (kills >= 2 ? 0.11 : 0.07) : kills >= 2 || (heads && kills) ? 0.06 : 0.04);
    shake(g, (heavy ? 0.2 : 0.08) + Math.min(heavy ? 0.15 : 0.08, n * 0.03));
    g.punch?.impulse?.((heavy ? -1.8 : -0.7) * 0.0175, sweepDir * 0.6 * 0.0175, sweepDir * 1.2 * 0.0175);
    bladeKick(ws, heavy ? 1.4 : 1);
    if (heavy) g.arsenal?.fovKick?.(-1.5, 0.18);
    sfx(g, 'yazi_hit', { volume: heavy ? 1 : 0.8 });
    haptic(heavy ? 40 : 20);
    ssOf(ws).view.edgeT = heavy ? 0.35 : 0.22;
  } else wallClang(ws, g, eye, fwd, c.r);
  return n;
}
/** 兜割's ARC: a 3 m crescent of light standing upright through the front, bleeding red when it bit; street dust */
function cleaveArc(g, bit) {
  const S = sys(g), cam = g.camera, fwd = eyeFwd(g, _a, V3());
  const m = S.pool.find((x) => !x.visible) || S.cuts.find((x) => x.z)?.mesh;
  if (m) {
    const old = S.cuts.findIndex((x) => x.mesh === m); if (old >= 0) S.cuts.splice(old, 1);
    const c = V3().copy(cam.position).addScaledVector(fwd, 2.2); c.y = floorAt(g, c);
    // upright, facing the eye, drawn top -> bottom
    m.quaternion.copy(cam.quaternion).multiply(_q.setFromAxisAngle(_d.set(0, 0, 1), -Math.PI / 2 + 0.12));
    m.position.set(c.x, c.y + 3.0, c.z);
    m.scale.set(3.0, 1.1, 1);
    m.material.uniforms.uBend.value = 0.3; m.material.uniforms.uHole.value = 0;
    m.visible = true;
    S.cuts.push({ mesh: m, t: 0, z: null, T: bit ? [0.05, 0.06, 0.22] : [0.05, 0.3, 0.12] });
    g.fx?.knockDust?.(c, _b.copy(fwd).multiplyScalar(3), 0.9);
    g.fx?.shockwave?.(_e.set(c.x, c.y + 0.05, c.z), { normal: UP, r0: 0.2, r1: 1.4, life: 0.3, color: bit ? CRIM : [1.6, 1.4, 1.3], thin: true });
    if (bit) g.fx?.decals?.add?.(c, UP, { frame: DECAL.slash ?? DECAL.scorch, size: 1.2, along: fwd, tint: DECAL_TINT.scorch, alpha: 0.45, life: 10 });
  }
}
// the combo's swing smears (camera space, 0.75 m out, §1.17): a wide white crescent along each cut's arc on screen,
// the thin TRAIL ribbon the edge line over it; white on a miss, bleeding blood red from the bite on a hit. a / b: the
// arc's ends (m at that depth), w: the quad's height (the lens and its halo ~30 cm), bend: the crescent's bow (+ =
// towards the quad's +y), at: start (fraction of the swing), T: [draw, hold, fade] (s)
const SMEAR = {
  kesa: { a: [0.44, 0.26], b: [-0.42, -0.34], w: 0.44, bend: 0.36, at: 0.18, T: [0.07, 0.04, 0.1] },
  yoko: { a: [-0.5, -0.1], b: [0.5, -0.19], w: 0.44, bend: 0.26, at: 0.18, T: [0.07, 0.04, 0.1] },
  kabuto: { a: [0.07, 0.46], b: [-0.01, -0.46], w: 0.52, bend: 0.2, at: 0.26, T: [0.08, 0.05, 0.12] },
};
const PALE = [0.55, 0.46, 0.44];   // the halo of a smear that has not bitten (a faint warm white, no fog)
function swingSmear(g, id) {
  const S = sys(g), o = SMEAR[id];
  if (!o) return;
  const m = S.smears[S.smearI++ % S.smears.length];
  const old = S.cuts.findIndex((x) => x.mesh === m); if (old >= 0) S.cuts.splice(old, 1);
  const dx = o.b[0] - o.a[0], dy = o.b[1] - o.a[1];
  m.rotation.set(0, 0, Math.atan2(dy, dx)); m.position.set(o.a[0], o.a[1], -0.75); m.scale.set(Math.hypot(dx, dy), o.w, 1);
  const u = m.material.uniforms;
  u.uBend.value = o.bend; u.uHole.value = 0.05; u.uRim.value.set(...PALE); u.uRed.value = 0;
  m.visible = true;
  S.cuts.push(S.lastSmear = { mesh: m, t: 0, z: null, T: o.T, smear: true, biteT: null });
}
/** the live smear's cut bit: it turns blood red from here */
function smearBite(g) {
  const c = sys(g).lastSmear;
  if (c && c.mesh.visible && c.biteT == null && c.t < 0.3) { c.biteT = c.t; c.mesh.material.uniforms.uRim.value.set(...BLOOD); }
}
/** a cut that met no zombie but a wall within reach: sparks and a clang */
function wallClang(ws, g, eye, fwd, r) {
  const d = _c.copy(fwd); d.y = -0.1; d.normalize();
  const wh = g.world?.collision?.raycast(eye, d, r * 0.8);
  if (!wh) return;
  g.fx?.impact?.(wh.surf, wh.point, wh.normal, d, { big: 0.7 });
  g.fx?.sparkBurst?.(wh.point, { color: WHITE, color1: EMBER, count: 14, speed: 6, glow: 0.4, normal: wh.normal });
  sfx(g, 'yazi_hit_wall', { pos: wh.point });
  shake(g, 0.06);
  haptic(12);
}
/** additive spark streaks flung off the cutting edge in the viewmodel (a cut that connects) */
function edgeSparks(g, n) {
  const vm = g.vm, P = g.fx?.particles, a = vm.socketCam('mid_r', _a), b = vm.socketCam('tip_r', _b);
  if (!P || !a || !b) return;
  const v = ssOf(g.arsenal.current).view.tipV || _c.set(0, 0, 0);
  for (let i = 0; i < n; i++) {
    const u = 0.1 + R() * 0.9, x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u, z = a.z + (b.z - a.z) * u, k = 0.3 + R() * 0.45;
    P.spawn({ additive: true, vm: true, x, y, z, vx: v.x * k + (R() - 0.5) * 0.5, vy: v.y * k + (R() - 0.3) * 0.4, vz: v.z * k + (R() - 0.5) * 0.3, life: 0.1 + R() * 0.12,
      size: 0.003 + R() * 0.003, stretch: 0.03, color: [...WHITE, 1], color1: [...BLOOD, 0], frame: FRAME.spark, gravity: 1.5, drag: 3 });
  }
  // the contact star a little in from the point
  const s = _d.copy(b).lerp(a, 0.15);
  P.spawn({ additive: true, vm: true, x: s.x, y: s.y, z: s.z, life: 0.09, size: 0.05, size1: 0.1, color: [...WHITE, 1], color1: [...BLOOD, 0], frame: FRAME.glint, rot: R() * 6 });
}
/** a cut drawn across a body (screen angle ang), length L; T = [draw, bleed to red, fade] */
function slashOn(g, z, ang, L = 0.75, w = 0.4, T = [0.04, 0.08, 0.14], delay = 0) {
  const S = sys(g), cam = g.camera, c = z.center(V3());
  const m = S.pool.find((x) => !x.visible) || S.cuts.find((x) => x.z)?.mesh;
  if (!m) return;
  const old = S.cuts.findIndex((x) => x.mesh === m); if (old >= 0) S.cuts.splice(old, 1);
  const j = (R() - 0.5) * 0.3;
  m.quaternion.copy(cam.quaternion).multiply(_q.setFromAxisAngle(_d.set(0, 0, 1), ang + j));
  _e.set(1, 0, 0).applyQuaternion(m.quaternion);
  m.position.copy(c).addScaledVector(_e, -L / 2).addScaledVector(_a.copy(c).sub(cam.position).normalize(), -0.25);
  m.scale.set(L, w, 1);
  m.material.uniforms.uBend.value = (R() - 0.5) * 0.4; m.material.uniforms.uHole.value = 0;
  m.visible = true;
  S.cuts.push({ mesh: m, t: 0, z, off: m.position.clone().sub(z.pos), T, delay });
}
/**
 * blood chunks, a white spark ring, a dark mist where the edge bites (gk: the glint, thinned on multi-hits); gk 1 (the
 * first two bodies of a cut): a fan of blood thrown along the cut and a red flash card ~0.6 m across
 */
function hitBurst(g, p, dir, k = 1, gk = 1, big = 1) {
  const P = g.fx?.particles;
  if (!P) return;
  if (gk >= 1) {
    // the fan: 16-20 drops spread across the cut's plane, flung along it, falling and landing as spots
    const sx = -dir.z, sz = dir.x, nf = 16 + ((R() * 5) | 0);
    for (let i = 0; i < nf; i++) {
      const f = (i / (nf - 1) - 0.5) * 2, sp = (3 + R() * 3.5) * big;
      P.spawn({ x: p.x, y: p.y + (R() - 0.5) * 0.15, z: p.z, vx: dir.x * sp + sx * f * 2.4, vy: 0.6 + R() * 2.2 - Math.abs(f) * 0.6, vz: dir.z * sp + sz * f * 2.4,
        life: 0.45 + R() * 0.35, size: 0.016 + R() * 0.018, stretch: 0.03, color: [...MIST, 1], color1: [0.35, 0.02, 0.02, 0.9], frame: FRAME.drop ?? 7, gravity: 9.8, collide: true, bounce: 0.05 });
    }
    P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.11, size: 0.34 * big, size1: 0.62 * big, sizePow: 0.5, color: [3.2, 0.25, 0.14, 0.9], color1: [0.9, 0.02, 0.02, 0], frame: FRAME.glow });
    g.fx?.blood?.(p, _a.copy(dir).negate(), dir, 1.4 * big);
  }
  for (let i = 0; i < 9 * k; i++) {
    _c.set(R() - 0.5, R() * 0.9 - 0.2, R() - 0.5).multiplyScalar(5).addScaledVector(dir, 3);
    P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, vx: _c.x, vy: _c.y, vz: _c.z, life: 0.16 + R() * 0.18, size: 0.022, stretch: 0.026, color: [...(i % 3 ? WHITE : EMBER), 1], color1: [...BLOOD, 0], frame: FRAME.spark, gravity: 6, drag: 2 });
  }
  for (let i = 0; i < 5 * k; i++) {
    _c.set(R() - 0.5, R() * 0.8, R() - 0.5).multiplyScalar(2.8).addScaledVector(dir, 2.4);
    P.spawn({ x: p.x, y: p.y, z: p.z, vx: _c.x, vy: _c.y + 1, vz: _c.z, life: 0.6 + R() * 0.4, size: 0.03, color: [0.28, 0.02, 0.02, 1], color1: [0.2, 0.01, 0.01, 1],
      frame: FRAME.rock, lit: true, gravity: 12, spin: (R() - 0.5) * 16, rot: R() * 6, collide: true, bounce: 0.2 });
  }
  if (gk > 0) P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.1, size: 0.3 * k * gk, size1: 0.5 * k * gk, color: [...WHITE, 0.85], color1: [0, 0, 0, 0], frame: FRAME.glint, rot: R() * 6 });
  if (gk > 0) P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.14, size: 0.18 * k, size1: 0.38 * k, color: [...CRIM, 0.55], color1: [0, 0, 0, 0], frame: FRAME.glow });
}
/** KE_SOUL: a soul wisp rises off the body and flies into the blade (≤ 4 in flight) */
function soulWisp(ws, g, z) {
  const S = sys(g);
  if (S.wisps.length >= 4) return false;
  const a = z.center(V3()), cam = g.camera.position;
  const c1 = a.clone().lerp(cam, 0.45).add(_a.set((R() - 0.5) * 1.5, 1.6 + R() * 0.8, (R() - 0.5) * 1.5));
  S.wisps.push({ a, c1, t: 0, T: 0.42 + R() * 0.1, ws });
  g.fx?.particles?.spawn({ additive: true, x: a.x, y: a.y + 0.2, z: a.z, life: 0.3, size: 0.25, size1: 0.6, color: [...CRIM, 0.7], color1: [0, 0, 0, 0], frame: FRAME.glow });
  sfx(g, 'yazi_soul', { pos: a, volume: 0.5 });
  return true;
}

// ------------------------------------------------------------------------------------------ the pose layer
// A pose is { p (camera-space grip), q (orientation: +y the blade / scabbard axis, -z the edge side, +x the flat) }.
// Clips carry per-hand keys bR / bL: [{ t (0..1 of the clip), p, q, e (ease into it), idle, sh }]: a scabbard key with
// `sh` sits on the sabre (sheathed) with the blade sh mm out of it (0 = home); the live 鯉口 offset ss.kuchi adds to it.
const N3 = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
const _m4 = new THREE.Matrix4(), _bx = V3(), _by = V3(), _bz = V3();
/** orientation from an axis direction d (grip -> point) and the way the edge faces, m */
function bq(d, m, out = new THREE.Quaternion()) {
  _by.set(d[0], d[1], d[2]).normalize();
  _bz.set(-m[0], -m[1], -m[2]);
  _bz.addScaledVector(_by, -_bz.dot(_by));
  if (_bz.lengthSq() < 1e-6) _bz.set(0, 0, 1).addScaledVector(_by, -_by.z);
  _bz.normalize();
  _bx.crossVectors(_by, _bz);
  return out.setFromRotationMatrix(_m4.makeBasis(_bx, _by, _bz));
}
const REACH = 0.55;                                       // tip distance used to derive the leading edge (m)
const SHEATH = 0.13;                                      // sabre grip -> scabbard grip when home (model: t -66 -> t 64)
const EASE = {
  linear: (t) => t, in: (t) => t * t, out: (t) => 1 - (1 - t) * (1 - t), inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  in3: (t) => t * t * t, out3: (t) => 1 - (1 - t) ** 3, outBack: (t) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; }, snap: (t) => (t < 1 ? 0 : 1),
};
// rest (刀橫放): the sabre laid across the lower third, the point off to the left, the edge up and forward, its flat
// turned to the eye so the ring pommel and the 睚眥 in it show at the lower right; the scabbard held low on the left
// (the grip just left of the middle and the pommel end raised: the ring and its 睚眥 land about (1300, 765) on a
// 1600 x 900 view, 21:9 alike; the scabbard's mouth peeks in at the lower left)
const IDLE = {
  R: { p: [-0.025, -0.125, -0.43], d: N3(-0.96, -0.03, -0.3), m: N3(0.0, 0.8, -0.6) },
  L: { p: [-0.2, -0.235, -0.37], d: N3(-0.3, -0.45, 0.84), m: N3(0.15, 0.85, 0.5) },
};
// the hand on the hilt (player/grips.js 'tsuka'): the dual default's pistol hold turned 55° round the hilt, so the
// curled fingers and the knuckle row show to the eye instead of the flat back of the glove, the fingers tipped 18°
// towards the guard, the hilt under the finger roots inside the curl; the left hand mirrored round the scabbard
const GRIP_R = (() => {
  const a = -55 * Math.PI / 180, N = new THREE.Vector3(-0.984, 0, 0.177).applyAxisAngle(UP, a).normalize();
  const F = new THREE.Vector3(-0.331, 0.089, -0.94).applyAxisAngle(UP, a).applyAxisAngle(N, 18 * Math.PI / 180).normalize();
  return { F, N, pose: 'tsuka', palm: [0.027, 0.072] };
})();
const GRIP_L = { F: new THREE.Vector3(-GRIP_R.F.x, GRIP_R.F.y, GRIP_R.F.z), N: new THREE.Vector3(-GRIP_R.N.x, GRIP_R.N.y, GRIP_R.N.z), pose: 'saya', palm: [0.03, 0.072] };
const IDLE_Q = { R: bq(IDLE.R.d, IDLE.R.m), L: bq(IDLE.L.d, IDLE.L.m) };
const _iq = new THREE.Quaternion(), _ie = new THREE.Euler();
/** the live idle pose: breathing (the two hands out of phase), ready: a slow tremor */
function idlePose(H, t, out, ready = 0) {
  const I = IDLE[H], ph = H === 'R' ? 0 : 1.9, br = Math.sin(t * 1.75 + ph);
  out.p.set(I.p[0] + Math.sin(t * 0.9 + ph) * 0.0015, I.p[1] + br * 0.003, I.p[2] + Math.sin(t * 1.1 + ph) * 0.0015);
  const j = ready * 0.006;
  out.q.copy(IDLE_Q[H]).multiply(_iq.setFromEuler(_ie.set(br * 0.01 + Math.sin(t * 3.3 + ph) * j, 0, Math.sin(t * 1.3 + ph) * 0.008 + Math.sin(t * 2.7) * j)));
  return out;
}
/** the scabbard on the sabre: home, with the blade sh mm out */
function sheathPose(Rp, sh, out) {
  out.p.set(0, SHEATH + sh / 1000, 0).applyQuaternion(Rp.q).add(Rp.p);
  out.q.copy(Rp.q);
  return out;
}
const _poseA = { p: V3(), q: new THREE.Quaternion() }, _poseB = { p: V3(), q: new THREE.Quaternion() };
function resolveKey(k, H, now, ready, Rp, kuchi, out) {
  if (k.idle) return idlePose(H, now, out, ready);
  if (k.sh != null && Rp) return sheathPose(Rp, k.sh + kuchi, out);
  out.p.copy(k.p); out.q.copy(k.q);
  return out;
}
function samplePose(keys, t, H, now, ready, out, Rp, kuchi) {
  let i = 1;
  while (i < keys.length - 1 && keys[i].t < t) i++;
  const k0 = keys[i - 1], k1 = keys[i];
  const a = resolveKey(k0, H, now, ready, Rp, kuchi, _poseA), b = resolveKey(k1, H, now, ready, Rp, kuchi, _poseB);
  const span = k1.t - k0.t, u = span > 0 ? clamp((t - k0.t) / span, 0, 1) : 1, e = (EASE[k1.e] || EASE.inOut)(u);
  out.p.lerpVectors(a.p, b.p, e);
  out.q.slerpQuaternions(a.q, b.q, e);
  return out;
}
/**
 * A clip from per-hand key lists [t, p | null (keep), d | null (keep), m | null (lead with the edge), ease, { sh }]: each
 * hand starts from where it is now and ends on the live idle pose (end 'idle'), or holds its last key (end 'hold').
 */
function yClip(vm, { R: kr = [], L: kl = [], dur, loop, events = [], tracks = {}, end = 'idle', endEase = 'inOut' } = {}) {
  const ss = vm?._yzss, t0 = vm?.time ?? 0;
  const mk = (H, keys) => {
    const cur = ss?.poseOK ? ss.pose[H] : idlePose(H, t0, { p: V3(), q: new THREE.Quaternion() });
    const out = [{ t: 0, p: cur.p.clone(), q: cur.q.clone(), d: V3().set(0, 1, 0).applyQuaternion(cur.q), e: 'linear' }];
    for (const [t, p, d, m, e, x] of keys) {
      const prev = out[out.length - 1];
      // sheathed keys (and a bare "keep" key after one) sit on the sabre
      if (x?.sh != null || (!p && !d && !m && prev.sh != null)) { out.push({ t, sh: x?.sh ?? prev.sh, e: e || 'inOut', d: prev.d.clone(), p: prev.p.clone() }); continue; }
      out.push({ t, p: p ? V3().fromArray(p) : prev.p.clone(), d: d ? V3().fromArray(d).normalize() : prev.d.clone(), m: m ? V3().fromArray(m) : null, keepQ: !d && !m ? prev : null, e: e || 'inOut' });
    }
    // the edge leads the motion: m from the tip's travel between the neighbouring keys
    for (let i = 1; i < out.length; i++) {
      const k = out[i];
      if (k.q || k.sh != null) continue;
      if (k.keepQ) { k.q = (k.keepQ.q || new THREE.Quaternion()).clone(); continue; }
      let m = k.m;
      if (!m) {
        const a = out[i - 1], b = out[i + 1] && !out[i + 1].keepQ && out[i + 1].sh == null ? out[i + 1] : k;
        const ta = _a.copy(a.d).multiplyScalar(REACH).add(a.p), tb = _b.copy(b.d).multiplyScalar(REACH).add(b.p);
        const mv = tb.sub(ta);
        mv.addScaledVector(k.d, -mv.dot(k.d));
        m = mv.lengthSq() > 1e-6 ? mv.normalize().clone() : V3().set(0, 0, -1).applyQuaternion(out[i - 1].q || IDLE_Q[H]);
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
/** a jolt on the sabre (a cut that lands: the blade tips back in its plane and twists a little, springs home) */
function bladeKick(ws, k = 1) { const s = ssOf(ws).kick.R; s.v -= 2.4 * k; s.w += 1.2 * k; }
const _hq = new THREE.Quaternion(), _kq = new THREE.Quaternion(), _ke = new THREE.Euler();
/** vm.weapon.onParts: write the sampled camera-space poses into R_gun / L_gun (in the hip frame) */
function partsHook(ws, vm, dt) {
  const w = vm.weapon, ss = ssOf(ws), c = vm.clip;
  if (!w?.parts?.R_gun || !w.parts.L_gun) return;
  vm._yzss = ss;
  const ready = vm.readyW || 0;
  _hq.setFromEuler(vm.hip.rot).invert();
  for (const H of ['R', 'L']) {
    const part = w.parts[H + '_gun'], pose = ss.pose[H], keys = c.active ? c.clip?.['b' + H] : null;
    if (keys) samplePose(keys, c.t, H, vm.time, ready, pose, ss.pose.R, ss.kuchi); else idlePose(H, vm.time, pose, ready);
    // jolt spring (rad): x = tilt back in the blade plane, y = twist
    const s = ss.kick[H];
    s.v += (-160 * s.x - 15 * s.v) * dt; s.x += s.v * dt;
    s.w += (-180 * s.y - 16 * s.w) * dt; s.y += s.w * dt;
    const n = part.node;
    n.position.copy(pose.p).sub(vm.hip.pos).applyQuaternion(_hq).add(w.pivot);
    n.quaternion.copy(_hq).multiply(pose.q).multiply(_kq.setFromEuler(_ke.set(0, s.y, s.x)));
  }
  ss.poseOK = true;
  // the tassel under the ring: a damped pendulum along the apparent gravity in the hilt's frame (gravity minus the
  // ring's acceleration): it streams out on every cut and hangs down whichever way the hilt is turned, never back up
  // through the ring (the target is kept off the hilt's axis)
  const tp = w.parts.R_fx_tassel, T = ss.tassel;
  if (tp && T && dt > 1e-4) {
    const Rp = ss.pose.R, r = _tr.set(0, -0.2345, 0).applyQuaternion(Rp.q).add(Rp.p);
    if (T.prev) { _tv.subVectors(r, T.prev).divideScalar(dt); T.acc.lerp(_ta.subVectors(_tv, T.vel).divideScalar(dt).clampLength(0, 80), Math.min(1, dt * 25)); T.vel.copy(_tv); }
    (T.prev ||= V3()).copy(r);
    const a = _ta.set(0, -9.8, 0).applyQuaternion(_tq.copy(vm.camera.quaternion).invert()).sub(T.acc).applyQuaternion(_tq.copy(Rp.q).invert()).normalize();
    // (pommel up: it drapes down over the ring's rim in the ring's own plane, beside it -- not through the ring and
    // the head, not behind them)
    if (a.y > 0.45) a.set(a.x * 0.3, 0.45, (Math.sign(a.z) || 1) * 0.9).normalize();
    T.dir ||= V3().set(0, -1, 0); T.v ||= V3();
    T.v.addScaledVector(_tv.subVectors(a, T.dir), 230 * dt).multiplyScalar(Math.exp(-5 * dt));
    T.dir.addScaledVector(T.v, dt).normalize();
    tp.node.quaternion.copy(tp.quat).multiply(_tq.setFromUnitVectors(DOWN, T.dir));
  }
}
const _tr = V3(), _tv = V3(), _ta = V3(), _tq = new THREE.Quaternion(), DOWN = new THREE.Vector3(0, -1, 0);

// ------------------------------------------------------------------------------------------ the pair's life (view)
const _tipPrev = V3();
function view(ws, g, dt) {
  const vm = g.vm, w = vm?.weapon, ss = ssOf(ws);
  if (!w?.parts?.R_gun || w.def !== ws.def) return;
  const v = ss.view;
  if (v.w !== w) {
    Object.assign(v, { w, t: 0, mistT: 1, emberT: 1, edge: 0, edgeT: 0, mouth: 0, soulT: 0, readyFlash: 0, runeFlash: 0, raise: 0, tipV: V3() });
    w.onParts = (vm2, dt2) => partsHook(ws, vm2, dt2);
    // the fingers round the hilt and round the scabbard (the dual default is a pistol hold)
    vm.rightGrip = { ...GRIP_R };
    vm.supportGrip = { ...GRIP_L };
    vm.arms?.setPose('R', 'tsuka', 0.05); vm.arms?.setPose('L', 'saya', 0.05);
    // the tassel swings from the hilt's own motion (partsHook), not the gun root's
    if (w.parts.R_fx_tassel?.motion) w.parts.R_fx_tassel.motion.pend = null;
    ss.tassel = { ax: 0, az: 0, vx: 0, vz: 0, prev: null, vel: V3(), acc: V3() };
    ss.poseOK = false;
    // the viewmodel lights every glow_* part at the stock intensity whatever the def says: per-key factors bring them
    // to the def's (the edge / mouth 2.4 instead of 8)
    v.gk = {};
    const mats = ws.def.premium?.mat || {};
    for (const { m, base } of w.glowMats || []) { const k = m.userData.preset, d = mats[k]?.glow; if (d != null && base > 0) v.gk[k] = d / base; }
    warm(g);
  }
  v.t += dt;
  const tp = vm.socketCam('tip_r', _d);
  if (tp && dt > 0) { v.tipV.copy(tp).sub(_tipPrev).multiplyScalar(1 / dt); _tipPrev.copy(tp); }
  if (!ss.hum && g.audio?.has?.('yazi_idle')) ss.hum = sfx(g, 'yazi_idle', { loop: true, volume: 0.07, fadeIn: 0.4 });
  const ready = canCast(ws, 'ult').ok, busy = ss.lockT > 0 || ss.mode === 'issen';
  const iai = ss.iai, stage = iai?.stage ?? 0, venge = !!ss.venge && g.time < ss.venge.until, readyIdle = ready && !busy && !iai && !venge;
  // ---- the edge light: on through the iai at full, the vengeance, the strikes that bite, the ult
  v.edgeT = Math.max(0, v.edgeT - dt);
  const edgeOn = stage >= 3 || venge || v.edgeT > 0 || ss.mode === 'issen' || ss.ultOn ? 1 : 0;
  v.edge = damp(v.edge, edgeOn, edgeOn ? 14 : 6, dt);
  psOf(vm, 'R_fx_edge').hidden = v.edge < 0.03;
  // ---- the mouth lining glows through the iai (brighter a stage), else dark
  const mouthOn = iai ? 0.4 + 0.3 * stage : ss.mode === 'issen' ? 0.6 : 0;
  v.mouth = damp(v.mouth, mouthOn, 12, dt);
  psOf(vm, 'L_fx_mouth').hidden = v.mouth < 0.03;
  // ---- the scabbard's rune strips: one a stage (all three through the vengeance / ult), dark at rest
  for (let i = 1; i <= 3; i++) psOf(vm, 'L_fx_rune' + i).hidden = !(stage >= i || venge || ss.ultOn);
  // ---- the head raises its eyes (ready, the stance at full, the vengeance), the jaw opens on the stance at full / ult
  v.readyFlash = Math.max(0, v.readyFlash - dt);
  v.runeFlash = Math.max(0, v.runeFlash - dt * 3.5);   // a stage's flare: white-hot, settling to red in ~0.3 s
  const raise = v.readyFlash > 0 || stage >= 3 || venge || ss.ultOn ? 1 : readyIdle ? 0.35 + 0.15 * Math.sin(v.t * 2.2) : 0;
  const ph = psOf(vm, 'R_fx_head'); if (!ph.tw) ph.v = damp(ph.v || 0, raise, raise > (ph.v || 0) ? 14 : 5, dt);
  const jaw = stage >= 3 || ss.ultOn ? 1 : v.readyFlash > 0.15 || venge ? 0.6 : 0;
  const pj = psOf(vm, 'R_fx_jaw'); if (!pj.tw) pj.v = damp(pj.v || 0, jaw, jaw > (pj.v || 0) ? 22 : 7, dt);
  XH.stage = stage; XH.stance = !!iai; XH.venge = venge; XH.parry = !!iai && g.time <= (iai.perfectUntil ?? -1) && g.time >= (iai.perfectFrom ?? 0);
  // ---- glow: the ruby eyes are the focus (breathing 0.6 Hz, brighter when ready / in the stance / vengeance); the
  // edge and the lining scale with their state
  v.soulT = Math.max(0, v.soulT - dt);
  const G = vm._glowMat, gk = (k) => v.gk?.[k] ?? 1;
  if (G) {
    const br = 0.5 + 0.5 * Math.sin(v.t * (readyIdle ? 7.5 : 3.8));
    G.crystal = gk('crystal') * (readyIdle ? 1.5 : 1) * (0.85 + 0.3 * br) * (v.readyFlash > 0 ? 1.7 : 1) * (1 + 0.35 * stage) * (venge ? 1.8 : 1) * (ss.ultOn ? 2.2 : 1) * (1 + 2 * v.soulT);
    G.glow_red = gk('glow_red') * Math.max(v.edge * (stage >= 3 ? 1.1 + 0.4 * br : venge ? 0.8 + 0.4 * br : 1.2), v.mouth * 1.4, iai ? 0.6 + 0.25 * stage : 0) * (1 + 3 * v.soulT) * (1 + 3 * v.runeFlash * v.runeFlash);
  }
  const P = g.fx?.particles;
  // ---- idle life: a thread of red mist from the scabbard's mouth (≤ 6), embers off the edge when ready
  if (P && !busy && (v.mistT -= dt) <= 0) {
    v.mistT = iai ? 0.08 : readyIdle ? 0.35 : 1.4 + R() * 1.2;
    const m = vm.socketCam('mouth_l', _a);
    if (m) P.spawn({ additive: true, vm: true, x: m.x + (R() - 0.5) * 0.01, y: m.y, z: m.z, vx: (R() - 0.5) * 0.03, vy: 0.05 + R() * 0.04, vz: (R() - 0.5) * 0.02, life: 0.9 + R() * 0.6,
      size: 0.01, size1: 0.03, color: [...CRIM, iai ? 0.6 : 0.35], color1: [0.3, 0.01, 0.01, 0], frame: FRAME.glow, inertia: 0.6 });
  }
  if (P && readyIdle && (v.emberT -= dt) <= 0) {
    v.emberT = 0.25 + R() * 0.25;
    const a = vm.socketCam('base_r', _a), b = vm.socketCam('tip_r', _b);
    if (a && b) { const p = _c.copy(a).lerp(b, R()); P.spawn({ additive: true, vm: true, x: p.x, y: p.y, z: p.z, vx: (R() - 0.5) * 0.03, vy: 0.04 + R() * 0.05, vz: (R() - 0.5) * 0.03, life: 0.8 + R() * 0.5, size: 0.004, size1: 0.001, color: [...EMBER, 1], color1: [...BLOOD, 0], frame: FRAME.glow, inertia: 0.5 }); }
  }
  // ---- ready (§1.7.1 beat 7): the head raises its eyes, the jaw snaps, the runes flare; again every 2.5 s
  if (ready && !busy && !iai) {
    if (!ss.readyN) { ss.readyN = true; ss.readyT = 0; readyBeat(ws, g, 1); }
    else if ((ss.readyT += dt) >= 2.5) { ss.readyT = 0; if (g.hud?.settings?.readyReminder !== false) readyBeat(ws, g, 0.5); }
  } else ss.readyN = false;
}
function readyBeat(ws, g, k) {
  const v = ssOf(ws).view, vm = g.vm, P = g.fx?.particles;
  v.readyFlash = 0.3 + 0.3 * k;
  vm.weapon?.premium?.fire?.(0.3 * k, 0.25);
  const e = vm.socketCam('eye_r', _a);
  if (e && P) {
    const q = Math.min(1.6, k);
    P.spawn({ additive: true, vm: true, x: e.x, y: e.y, z: e.z, life: 0.22, size: 0.02 * q, size1: 0.05 * q, color: [...EMBER, 1], color1: [...BLOOD, 0], frame: FRAME.glint, rot: R() });
    for (let i = 0; i < 4 * k + 2; i++) P.spawn({ additive: true, vm: true, x: e.x, y: e.y, z: e.z, vx: (R() - 0.5) * 0.06, vy: 0.04 + R() * 0.06, vz: (R() - 0.5) * 0.04, life: 0.7, size: 0.006, size1: 0.02, color: [...CRIM, 0.6], color1: [0.2, 0, 0, 0], frame: FRAME.glow, inertia: 0.5 });
  }
  if (k >= 1) sfx(g, 'yazi_growl', { volume: 0.5 });
}

// ------------------------------------------------------------------------------------------ combo driver
const COMBO_CLIP = ['yazi_kesa', 'yazi_yoko', 'yazi_kabuto'];
function startSwing(ws, g, step) {
  const ss = ssOf(ws), c = ws.def.special.combo[step], ar = g.arsenal;
  ss.mode = 'swing'; ss.step = step; ss.cur = c; ss.t = 0; ss.hit = false; ss.chainT = 0;
  ar.sinceShot = 0;
  ar.playClip(COMBO_CLIP[step], { duration: c.dur });
  sfx(g, c.heavy ? 'yazi_swing_heavy' : 'yazi_swing', { volume: 0.9, pitch: 0.95 + R() * 0.1, delay: c.hit * 0.4 });
  XH.cutT = 0.12;
  g.noise?.(g.camera.position, 10);
  // the wide smear along the arc, timed with the blade entering it
  const sm = SMEAR[c.id];
  if (sm) later(ws, c.dur * sm.at, () => { if (ss.mode === 'swing' && ss.step === step && held(g, ws)) swingSmear(g, c.id); });
  // the view rolls a hair towards the cut
  if (g.punch && clipComfort.shake) g.punch.impulse(0, 0, (step === 0 ? 1 : step === 1 ? -1 : 0) * 0.6 * 0.0175);
  // 兜割: a 1.5 m lunge into the cleave
  if (c.lunge && g.player) { const fwd = eyeFwd(g, _a, V3()); ss.lunge = { dir: fwd.clone(), t: 0, T: 0.16, dist: c.lunge, at: 0.08 }; }
}
function lungeUpdate(ss, g, dt) {
  const L = ss.lunge, pl = g.player;
  if (!L || !pl) return;
  L.t += dt;
  if (L.t < L.at) return;
  const u = (L.t - L.at) / L.T;
  if (u >= 1) { pl.vel.x *= 0.3; pl.vel.z *= 0.3; ss.lunge = null; return; }
  // stop short of a body in front (no running through the target) and of walls
  const sp = L.dist / L.T * (1 - u * 0.5);
  const wh = g.world?.collision?.raycast(_a.set(pl.pos.x, pl.pos.y + 0.9, pl.pos.z), L.dir, 0.8);
  let block = !!wh;
  for (const z of g.zombies?.list || []) { if (z.alive && Math.hypot(z.pos.x - pl.pos.x, z.pos.z - pl.pos.z) < 1.05 && (z.pos.x - pl.pos.x) * L.dir.x + (z.pos.z - pl.pos.z) * L.dir.z > 0) { block = true; break; } }
  if (!block) { pl.vel.x = L.dir.x * sp; pl.vel.z = L.dir.z * sp; }
}
function vignette(g, k) {
  const post = g.renderer?.post;
  if (!post) return;
  if (g._yzVig == null) g._yzVig = post.vignette ?? 0;
  post.vignette = g._yzVig + k;
  if (k === 0) g._yzVig = null;
}

// ------------------------------------------------------------------------------------------ 居合 iai (stance, parry, 一閃)
// The stance is the alt channel (RMB held): yazi_iai's update drives it; its end releases the draw. PlayerStatus is
// not edited: one damage filter per status (like crisis.js / X02) covers the parry window and the vengeance.
function installFilter(g) {
  const st = g.status;
  if (!st || st._yzFilter) return;
  st._yzFilter = true;
  const orig = st.damage;
  st.damage = (amount, opts = {}) => {
    const ws = g.arsenal?.current, ss = ws?.def?.id === ID ? ws.sp?.yz : null;
    if (!ss || opts.dot || !(amount > 0) || !st.alive || st.downed) return orig.call(st, amount, opts);
    const iai = ss.iai;
    // perfect parry: inside the window right after the blade went home
    if (iai && g.time >= iai.perfectFrom && g.time <= iai.perfectUntil) { perfectParry(ws, g, opts); return 0; }
    // 睚眥必報: melee blows halved and struck back double
    const melee = !!opts.zombie || (!!opts.from && !opts.acid && !opts.explosive);
    if (ss.venge && g.time < ss.venge.until && melee) {
      const p = ws.def.special.skills.tap;
      reflect(ws, g, amount, opts);
      return orig.call(st, amount * p.mul, opts);
    }
    return orig.call(st, amount, opts);
  };
}
function startStance(ws, g, k) {
  const ss = ssOf(ws), ar = g.arsenal, p = ws.def.special.iai, now = g.time;
  ss.mode = 'idle'; ss.step = -1; ss.lunge = null;
  ss.iai = { k, t: 0, stage: 0, sheathed: false, release: false, perfectFrom: now + p.sheathe, perfectUntil: now + p.sheathe + p.perfect, parried: false };
  ar.sinceShot = 0;
  ar.playClip('yazi_stance', { duration: 1.6 });
  g.vm.clip.hold = true;
  sfx(g, 'yazi_unsheathe', { volume: 0.5, pitch: 1.2 });
  haptic(10);
}
function stanceUpdate(ws, g, dt) {
  const ss = ssOf(ws), iai = ss.iai, p = ws.def.special.iai, ar = g.arsenal;
  if (!iai) return;
  iai.t += dt;
  g.vm.clip.hold = true;
  ar.sinceShot = 0;
  g.status?.applySlow?.(0.08, 0.7);
  if (!iai.sheathed && iai.t >= p.sheathe) {
    iai.sheathed = true;
    sfx(g, 'yazi_sheathe', { volume: 0.9 });
    ss.chargeSnd = sfx(g, 'yazi_charge', { loop: true, volume: 0.45 });
    ss.chargeSnd?.setRate?.(0.8);
    haptic(14);
    vignette(g, 0.03);
    // a thin red spark at the mouth (BOLT): the blade's home
    const m = g.vm.socketCam('mouth_l', _a), P = g.fx?.particles;
    if (m && P) for (let i = 0; i < 10; i++) { const a = R() * 6.283, sp = 0.2 + R() * 0.4; P.spawn({ additive: true, vm: true, x: m.x, y: m.y, z: m.z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 0.05, life: 0.1 + R() * 0.08, size: 0.003, stretch: 0.02, color: [...WHITE, 1], color1: [...BLOOD, 0], frame: FRAME.spark }); }
    if (iai.release) { releaseIai(ws, g, 0); return; }
  }
  if (!iai.sheathed) return;
  const ct = iai.t - p.sheathe, st = p.stages.filter((x) => ct >= x).length;
  if (st > iai.stage) {
    iai.stage = st;
    sfx(g, st >= 3 ? 'yazi_charge_full' : 'yazi_charge_stage', { volume: 0.6, pitch: 1 + 0.12 * (st - 1) });
    haptic(12);
    ar.fovHold(-st, 0.2);
    vignette(g, [0.06, 0.11, 0.2][st - 1] ?? 0.2);
    runeFlare(ws, g, st);
    g.vm?.weapon?.premium?.fire?.(0.35 + 0.15 * st, 0.3);
    if (st >= 3) { koiguchi(ws, g, true); sfx(g, 'yazi_koiguchi', { volume: 0.8 }); }
  }
  ss.chargeSnd?.setRate?.(0.8 + 0.45 * Math.min(1, ct / p.stages[2]));
  // the thumb breaks the mouth at full charge: the collar and 3 cm of blade out of it, the edge lit
  ss.kuchi = damp(ss.kuchi, iai.stage >= 3 ? 64 : 0, 18, dt);
  const vm = g.vm, P = g.fx?.particles, stg = iai.stage;
  // stage motes: red sparks gathering at the mouth, faster a stage
  if ((iai.moteT = (iai.moteT ?? 0) - dt) <= 0) {
    iai.moteT = 0.09 - 0.025 * stg;
    const m = vm.socketCam('mouth_l', _a), r = vm.socketCam('rune' + Math.max(1, Math.min(3, stg)) + '_l', _b);
    if (m && r) P?.spawn({ additive: true, vm: true, x: r.x + (R() - 0.5) * 0.02, y: r.y + (R() - 0.5) * 0.02, z: r.z, vx: (m.x - r.x) * 2.6, vy: (m.y - r.y) * 2.6, vz: (m.z - r.z) * 2.6, life: 0.38, size: 0.004 + 0.001 * stg, size1: 0.002, stretch: 0.02, color: [...EMBER, 1], color1: [...BLOOD, 0], frame: FRAME.spark });
  }
  if (!stg) return;
  // red lightning crawling down the scabbard (more and longer a stage), red mist streaming out of the lit mouth
  if ((iai.boltT = (iai.boltT ?? 0) - dt) <= 0) {
    iai.boltT = [0.16, 0.09, 0.045][stg - 1];
    for (let k = 0; k < (stg >= 3 ? 2 : 1); k++) sayaBolt(g, stg);
  }
  if ((iai.mistT = (iai.mistT ?? 0) - dt) <= 0) {
    iai.mistT = [0.06, 0.04, 0.025][stg - 1];
    const m = vm.socketCam('mouth_l', _a), r = vm.socketCam('rune1_l', _b);
    if (m && r && P) {
      const ax = _c.subVectors(m, r).normalize(), sp = 0.05 + 0.03 * stg;
      P.spawn({ additive: true, vm: true, x: m.x + (R() - 0.5) * 0.008, y: m.y + (R() - 0.5) * 0.008, z: m.z, vx: ax.x * sp + (R() - 0.5) * 0.03, vy: ax.y * sp + 0.05 + R() * 0.04, vz: ax.z * sp, life: 0.6 + R() * 0.4,
        size: 0.008 + 0.004 * stg, size1: 0.03 + 0.012 * stg, color: [...CRIM, 0.35 + 0.15 * stg], color1: [0.3, 0.01, 0.01, 0], frame: FRAME.glow, inertia: 0.6 });
    }
  }
  // full: an ember ring pulsing round the mouth, the bared edge glinting
  if (stg >= 3 && (iai.ringT = (iai.ringT ?? 0) - dt) <= 0) {
    iai.ringT = 0.26;
    const m = vm.socketCam('mouth_l', _a), r = vm.socketCam('rune1_l', _b);
    if (m && r) {
      g.fx?.shockwave?.(m, { normal: _c.subVectors(m, r).normalize().clone(), r0: 0.014, r1: 0.055, life: 0.28, color: [3.4, 1.2, 0.4], thin: true, vm: true });
      const e = vm.socketCam('base_r', _d);
      if (e && P) P.spawn({ additive: true, vm: true, x: (e.x + m.x) / 2, y: (e.y + m.y) / 2, z: (e.z + m.z) / 2, life: 0.16, size: 0.012, size1: 0.03, color: [...WHITE, 0.9], color1: [...BLOOD, 0], frame: FRAME.glint, rot: R() * 6 });
    }
  }
}
/** one jagged red arc crawling a few cm down the scabbard's face (camera space) */
function sayaBolt(g, stg) {
  const vm = g.vm, m = vm.socketCam('mouth_l', _a), e = vm.socketCam('end_l', _b);
  if (!m || !e || !g.fx?.bolt) return;
  const u0 = R() * 0.75, L = 0.06 + 0.05 * stg * R(), a = _c.copy(m).lerp(e, u0), b = _d.copy(m).lerp(e, Math.min(1, u0 + L / Math.max(0.1, m.distanceTo(e))));
  const j = 0.008;
  a.x += (R() - 0.5) * j; a.y += (R() - 0.5) * j; b.x += (R() - 0.5) * j; b.y += (R() - 0.5) * j;
  g.fx.bolt(a.clone(), b.clone(), { vm: true, col: [5, 0.9, 0.5], glow: [2.2, 0.1, 0.05], width: 0.0024 + 0.0008 * stg, core: 0.3, levels: 2, jitter: 0.18, branches: stg >= 2 ? 1 : 0, life: 0.07 });
}
/** a stage lights: its rune strip flares white and settles to red, sparks run along it, a ring off the mouth */
function runeFlare(ws, g, st) {
  const vm = g.vm, P = g.fx?.particles, r = vm.socketCam('rune' + st + '_l', _a), m = vm.socketCam('mouth_l', _b);
  ssOf(ws).view.runeFlash = 1;
  if (r && P) {
    P.spawn({ additive: true, vm: true, x: r.x, y: r.y, z: r.z, life: 0.3, size: 0.05, size1: 0.13, color: [...WHITE, 1], color1: [...BLOOD, 0], frame: FRAME.glint, rot: R() * 6 });
    P.spawn({ additive: true, vm: true, x: r.x, y: r.y, z: r.z, life: 0.4, size: 0.06, size1: 0.1, color: [...CRIM, 0.7], color1: [0, 0, 0, 0], frame: FRAME.glow });
    if (m) { const ax = _c.subVectors(r, m).normalize(); for (let i = 0; i < 10; i++) { const o = (i / 9 - 0.5) * 0.05; P.spawn({ additive: true, vm: true, x: r.x + ax.x * o, y: r.y + ax.y * o, z: r.z + ax.z * o, vx: (R() - 0.5) * 0.12, vy: 0.04 + R() * 0.1, vz: (R() - 0.5) * 0.05, life: 0.3 + R() * 0.2, size: 0.003, size1: 0.001, stretch: 0.01, color: [...WHITE, 1], color1: [...BLOOD, 0], frame: FRAME.spark }); } }
  }
  if (m) g.fx?.shockwave?.(m, { r0: 0.01, r1: 0.06 + 0.025 * st, life: 0.28, color: st >= 3 ? [3.4, 1.4, 0.6] : CRIM, thin: true, vm: true });
  for (let i = 0; i < 2 + st; i++) sayaBolt(g, st);
}
/** 鯉口を切る: the thumb pushes the guard, a click, sparks at the mouth, the 睚眥 jaw snaps (hard: the iai at full -- a ping) */
function koiguchi(ws, g, hard = false) {
  const m = g.vm.socketCam('mouth_l', _a), P = g.fx?.particles;
  if (m && P) {
    P.spawn({ additive: true, vm: true, x: m.x, y: m.y, z: m.z, life: hard ? 0.2 : 0.18, size: hard ? 0.08 : 0.05, size1: hard ? 0.2 : 0.12, color: [...WHITE, 1], color1: [...BLOOD, 0], frame: FRAME.glint, rot: R() * 6 });
    if (hard) {
      P.spawn({ additive: true, vm: true, x: m.x, y: m.y, z: m.z, life: 0.3, size: 0.05, size1: 0.16, color: [3.2, 0.5, 0.25, 0.8], color1: [0, 0, 0, 0], frame: FRAME.glow });
      g.fx?.shockwave?.(m, { r0: 0.01, r1: 0.14, life: 0.22, color: [4, 3, 2.4], thin: true, vm: true });
      XH.flashT = 0.16;
    }
    for (let i = 0; i < 14; i++) { const a = R() * 6.283, sp = 0.3 + R() * 0.6; P.spawn({ additive: true, vm: true, x: m.x, y: m.y, z: m.z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 0.1, life: 0.14 + R() * 0.1, size: 0.003, stretch: 0.025, color: [...WHITE, 1], color1: [...BLOOD, 0], frame: FRAME.spark, gravity: 1 }); }
  }
  const e = g.vm.socketWorld?.('mouth_l', _b);
  if (e) g.fx?.lights?.flash?.(e, '#ff3a20', 2.5, 1.2, 0.15);
  shake(g, 0.05);
  haptic(20);
}
/** the stance ends (RMB up): draw. `force` 1 = a full 一閃 (parry) */
function releaseIai(ws, g, force = 0) {
  const ss = ssOf(ws), iai = ss.iai, p = ws.def.special.iai;
  if (!iai) return;
  if (!iai.sheathed && !force) { iai.release = true; return; }   // drawn the moment it is home
  const charge = force ? 1 : clamp((iai.t - p.sheathe) / p.stages[2], 0, 1);
  ss.chargeSnd?.stop?.(0.08); ss.chargeSnd = null;
  ss.iai = null; ss.iaiEnd = g.time;
  g.arsenal.fovHold(0, 0.15);
  vignette(g, 0);
  issen(ws, g, charge);
}
/** the stance broken without a draw (weapon swapped, death) */
function dropStance(ws, g) {
  const ss = ssOf(ws);
  if (!ss.iai) return;
  ss.chargeSnd?.stop?.(0.08); ss.chargeSnd = null;
  ss.iai = null; ss.iaiEnd = g.time; ss.kuchi = 0;
  g.arsenal?.fovHold?.(0, 0.15);
  vignette(g, 0);
  if (g.vm?.clip) g.vm.clip.hold = false;
}

/**
 * where the draw ends: along the view (level), the full reach, 1 m past the farthest body in the lane (they stay in
 * view for the burst), or short of a wall -- the body swept as a capsule (knee, waist and eye height, either shoulder)
 * so a door jamb or a lintel stops it instead of carrying the player into a recess
 */
function dashTarget(g, range, out, width = 1.7) {
  const pl = g.player, feet = pl?.pos || g.camera.position, col = g.world?.collision;
  const fwd = eyeFwd(g, _a, _b), sx = -fwd.z, sz = fwd.x;
  let len = range;
  if (col) for (const h of [0.35, 0.9, 1.55]) for (const o of [-0.3, 0, 0.3]) {
    const wh = col.raycast(_c.set(feet.x + sx * o, feet.y + h, feet.z + sz * o), fwd, range + 0.6);
    if (wh) len = Math.min(len, Math.max(0.6, wh.dist - 0.6));
  }
  // the lane's bodies: the farthest one + 1 m (no bodies: the full reach)
  let far = -1;
  for (const z of g.zombies?.list || []) {
    if (!z.alive) continue;
    const dx = z.pos.x - feet.x, dz = z.pos.z - feet.z, along = dx * fwd.x + dz * fwd.z;
    if (along < 0 || along > len + 0.5 || Math.abs(dx * sx + dz * sz) > width / 2 + (z.radius ?? 0.4) || Math.abs(z.pos.y - feet.y) > 2) continue;
    far = Math.max(far, along);
  }
  if (far >= 0) len = Math.max(0.6, Math.min(len, far + 1.0));
  out.copy(feet).addScaledVector(fwd, len);
  out.y = floorAt(g, out);
  if (Math.abs(out.y - feet.y) > 1.6) out.y = feet.y;
  return len;
}
/** 一閃: the dash-cut. charge 0..1 -> damage 180 -> 520 */
function issen(ws, g, charge) {
  const ss = ssOf(ws), ar = g.arsenal, p = ws.def.special.iai, pl = g.player;
  if (!pl) return;
  const to = V3(), len = dashTarget(g, p.range, to, p.width), from = pl.pos.clone();
  const dir = V3().subVectors(to, from).setY(0); if (dir.lengthSq() < 1e-6) eyeFwd(g, _a, dir); dir.normalize();
  const T = Math.max(0.06, p.time * len / p.range);
  ss.issen = { from, to, dir, len, t: 0, T, charge, dmg: lerp(p.dmg[0], p.dmg[1], charge), passed: new Set(), list: [], landed: false };
  ss.mode = 'issen'; ss.t = 0; ss.kuchi = 0;
  pl.onGround = false;
  if (g.status) g.status.invuln = Math.max(g.status.invuln || 0, T + p.invuln);
  ar.playClip('yazi_issen', { duration: 0.62 });
  ar.fovKick(4, 0.3);
  if (clipComfort.overlay) g.fx?.overlay?.radial?.(0.55, 0.16, { r0: 0.32, density: 0.32, thin: 0.5, color: [2.4, 0.5, 0.4] });
  sfx(g, 'yazi_issen', { volume: 1 });
  sfx(g, 'yazi_issen_ring', { volume: 0.9, delay: 0.05 });
  haptic(25);
  screenSlashes(g, charge);
  // teammates see the lane light and the streak
  const ev = { type: 'skill', id: 'yazi_issen', w: ID, slot: 'fx', seed: (R() * 2147483647) | 0, pos: [from.x, from.y, from.z], dir: [dir.x, 0, dir.z], by: g.localId, ph: 0, len, ch: charge };
  startSkill(g, ev, { ws, local: true });
  g.net?.sendSkill?.(ev);
}
const lerp = (a, b, u) => a + (b - a) * u;
/** four long cuts across the view: white-hot, bleeding to blood red from the tail (three are only for show) */
function screenSlashes(g, charge = 1, big = false) {
  const S = sys(g);
  for (const m of S.screen) m.material.uniforms.uHole.value = big ? 0.12 : 0.16;   // the crosshair's 20 % stays clean (§1.14)
  if (!clipComfort.overlay && !big) return;
  const n = 4, set = big ? [[-0.08, -0.02], [0.3, 0.06], [-0.32, -0.1], [0.1, 0.17]] : [[0.03, -0.01], [-0.22, 0.08], [0.25, -0.09], [-0.08, 0.14]];
  for (let i = 0; i < n; i++) {
    const m = S.screen[i];
    const [ang, y] = set[i], L = (big ? 1.4 : 1.05) * (i === 0 ? 1 : 0.7 + 0.08 * i), w = (big ? 0.2 : 0.13) * (i === 0 ? 1 : 0.62) * (0.75 + 0.25 * charge);
    m.rotation.set(0, 0, ang);
    m.position.set(-Math.cos(ang) * L / 2, y - 0.04 - Math.sin(ang) * L / 2, -0.6);
    m.scale.set(L, w, 1);
    m.material.uniforms.uBend.value = (i % 2 ? -1 : 1) * (0.18 + 0.08 * i);   // each one a shallow crescent
    m.visible = true;
    const old = S.cuts.findIndex((x) => x.mesh === m); if (old >= 0) S.cuts.splice(old, 1);
    S.cuts.push({ mesh: m, t: 0, z: null, T: [0.05, 0.08, 0.2], delay: 0.03 * i, screen: true });
  }
}
/** the dash: the controller is steered along the line; every body within the lane is cut once as it is passed */
function issenUpdate(ws, g, dt) {
  const ss = ssOf(ws), D = ss.issen, pl = g.player, p = ws.def.special.iai;
  if (!D || !pl) return;
  D.t += dt;
  const u2 = Math.min(1, (D.t + dt) / D.T), h = Math.max(dt, 1 / 240);
  const nx = D.from.x + (D.to.x - D.from.x) * u2, nz = D.from.z + (D.to.z - D.from.z) * u2, ny = D.from.y + (D.to.y - D.from.y) * u2;
  if (!D.landed) { pl.vel.set((nx - pl.pos.x) / h, (ny - pl.pos.y) / h + G_PLAYER * h, (nz - pl.pos.z) / h); pl.onGround = false; }
  // pass cuts: the lane between the start and where the player is now (+ the blade's reach ahead)
  const a = D.from, b = _a.copy(pl.pos).addScaledVector(D.dir, D.landed ? 0 : 1.2), seg = _b.subVectors(b, a), L2 = Math.max(1e-6, seg.x * seg.x + seg.z * seg.z);
  for (const z of D.ult ? [] : g.zombies?.list || []) {
    if (!z.alive || D.passed.has(z)) continue;
    const zc = z.center(V3());
    const u = clamp(((zc.x - a.x) * seg.x + (zc.z - a.z) * seg.z) / L2, 0, 1);
    if (Math.hypot(zc.x - a.x - seg.x * u, zc.z - a.z - seg.z * u) > p.width / 2 + (z.radius ?? 0.4) || Math.abs(zc.y - (pl.pos.y + 1)) > 2) continue;
    D.passed.add(z); D.list.push(z);
    const side = (D.dir.x * (zc.z - a.z) - D.dir.z * (zc.x - a.x)) > 0 ? 1 : -1;
    const dir = V3().copy(D.dir).addScaledVector(_c.set(-D.dir.z, 0, D.dir.x), 0.35 * side).normalize();   // (thrown on along the lane)
    const res = strike(ws, g, z, D.dmg, dir, { knock: 2.4 + 2 * D.charge, stagger: 1, sever: D.charge > 0.6 ? SEVER_ANY : SEVER_HI, tag: 'issen', skill: 'yazi_issen', blood: D.list.length < 4 ? 0.6 : 0.2, elem: D.charge >= 1 ? 'soulrend' : null });
    slashOn(g, z, CUT_ANG.issen + (R() - 0.5) * 0.3, 1.1, 0.55, [0.03, 0.1, 0.25], 0.04);
    if (!res?.killed) z.flinchV?.set?.(0, 3, 0);
  }
  if (!D.landed && (D.t >= D.T || !g.status?.alive)) {
    D.landed = true;
    pl.vel.x *= 0.15; pl.vel.z *= 0.15; if (pl.vel.y > 0) pl.vel.y = 0;
    const n = D.list.length;
    if (n) {
      // the bite: a hard freeze on the far side, then the bodies it passed burst (the delayed realisation)
      stop(g, 0.09);
      shake(g, 0.22 + Math.min(0.15, n * 0.03));
      g.punch?.impulse?.(-1.4 * 0.0175, 0, 0.6 * 0.0175);
      haptic(40);
      sfx(g, 'yazi_hit', { volume: 1 });
      ssOf(ws).view.edgeT = 0.5;
      const list = D.list.slice();
      later(ws, 0.12, () => {
        // the bodies it passed are thrown on along the lane, past the camera into view (the player stopped 1 m beyond
        // the last one); a red flash on the beat
        list.forEach((z, i) => {
          if (z.kvel && !z.def?.boss) { const k = z.alive ? 4 : 8.5; z.kvel.x += D.dir.x * k; z.kvel.z += D.dir.z * k; z.kvel.y = Math.max(z.kvel.y || 0, z.alive ? 1.5 : 4.2); }
          if (i < 6) { const c = z.center(V3()); hitBurst(g, c, D.dir, i < 3 ? 1.3 : 0.6, i < 2 ? 1 : 0, 1.3); bloodMist(g, c, D.dir, i < 3 ? 1 : 0.5); }
        });
        if (clipComfort.overlay) g.fx?.overlay?.tint?.([2.4, 0.22, 0.16], 0.16, 0.04, { fadeIn: 0.01, fadeOut: 0.24 });
        shake(g, 0.12);
        sfx(g, 'yazi_issen_burst', { volume: 0.9 });
      });
    }
  }
}
/** the burst of dark blood mist off a body the draw passed (none within 1.5 m of the eye: a smoke blob on the crosshair) */
function bloodMist(g, c, dir, k = 1) {
  const P = g.fx?.particles, d = c.distanceTo(g.camera.position);
  if (!P || d < 1.5) return;
  if (d < 3) k *= 0.5;
  g.fx?.blood?.(c, _a.copy(dir).negate(), dir, 1.8 * k);
  for (let i = 0; i < 6 * k; i++) {
    const a = R() * 6.283, s = 0.6 + R() * 1.4;
    P.spawn({ x: c.x, y: c.y + (R() - 0.3) * 0.5, z: c.z, vx: Math.cos(a) * s + dir.x * 1.5, vy: R() * 1.2, vz: Math.sin(a) * s + dir.z * 1.5, life: 0.7 + R() * 0.4, size: 0.12, size1: 0.45, sizePow: 0.5,
      color: [0.32, 0.02, 0.02, 0.55], color1: [0.18, 0.01, 0.01, 0], frame: FRAME.dusty?.[0] ?? 54, drag: 2.5, gravity: -0.3 });
  }
}

/** 完美彈反: the blow is turned at the mouth -- a freeze, colour drained, a gold-red flash, the attacker reels; a free full draw */
function perfectParry(ws, g, opts) {
  const ss = ssOf(ws), st = g.status, iai = ss.iai, p = ws.def.special.iai;
  if (!iai) return;
  iai.perfectUntil = -1; iai.parried = true;
  st.invuln = Math.max(st.invuln || 0, 0.35);
  meterEvent(ws, 'parry');
  stop(g, 0.1);
  shake(g, 0.2);
  sfx(g, 'yazi_parry', { volume: 1 });
  sfx(g, 'yazi_parry_cymbal', { volume: 0.8, delay: 0.03 });
  later(ws, 0.05, () => stop(g, 0.05));   // the cymbal's own beat of freeze after the ding's
  const post = g.renderer?.post;
  // (game time, so a frozen frame or a stepped test does not leave the world grey)
  if (post && clipComfort.overlay && !ss.desat) { ss.desat = 0.7; post.saturation = (post.saturation ?? 1) - 0.7; later(ws, 0.17, () => { post.saturation += ss.desat; ss.desat = 0; }); }
  if (clipComfort.overlay) g.fx?.overlay?.tint?.([1.6, 0.35, 0.3], 0.12, 0.3, { fadeIn: 0.02, fadeOut: 0.25 });
  haptic(12); setTimeout(() => haptic(40), 80);
  XH.flashT = 0.3;
  const P = g.fx?.particles, c = g.vm.socketCam('mouth_l', _c);
  // (white only in the small glint card at the mouth; the light and the glow gold-red and kept down, the gloves
  // must not flash to white plastic)
  if (c && P) {
    P.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, life: 0.2, size: 0.07, size1: 0.03, color: [4.2, 3.6, 3.0, 1], color1: [...BLOOD, 0], frame: FRAME.glint, rot: R() * 6 });
    P.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, life: 0.2, size: 0.05, size1: 0.13, color: [2.2, 0.75, 0.3, 0.75], color1: [0.8, 0.08, 0.04, 0], frame: FRAME.glow });
    g.fx?.shockwave?.(c, { r0: 0.01, r1: 0.1, life: 0.2, color: [3, 1.2, 0.5], thin: true, vm: true });
    for (let i = 0; i < 18; i++) { const a = R() * 6.283, sp = 0.8 + R() * 1.2; P.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 0.2, life: 0.18 + R() * 0.12, size: 0.004, stretch: 0.04, color: [...(i % 3 ? GOLD : EMBER), 1], color1: [...BLOOD, 0], frame: FRAME.spark, gravity: 1 }); }
  }
  // the light at the attacker, not at the mouth: a point light a hand's width from the gloves bleached them white
  // the attacker reels for 1.5 s
  const z = opts.zombie || nearestTo(g, opts.from, 1.8);
  if (z?.alive) {
    z.flinchV?.set?.(0, 6, 0);
    if (z.kvel) { const dx = z.pos.x - g.camera.position.x, dz = z.pos.z - g.camera.position.z, l = Math.hypot(dx, dz) || 1; z.kvel.x += dx / l * 4; z.kvel.z += dz / l * 4; }
    if (!z.def?.boss) {
      if (!z.puppet) { z.state = 'stagger'; z.stateT = -(p.stun - 0.6); }
      z.playOnce?.(z.actions?.stagger ? 'stagger' : 'hit_front', { fade: 0.06, speed: 0.9 });
      z.yzStun = g.time + p.stun;
    }
    const zc = z.center(V3()), n = _b.copy(g.camera.position).sub(zc).normalize();
    g.fx?.lights?.flash?.(zc, '#ff8a50', 2.4, 2.2, 0.15);
    g.fx?.shockwave?.(zc, { normal: n, r0: 0.2, r1: 1.6, life: 0.3, color: GOLD, thin: true });
    hitBurst(g, zc, n.negate(), 1.0, 1);
  }
  // teammates: a flash at the caster
  const ev = { type: 'skill', id: 'yazi_parry', w: ID, slot: 'fx', seed: (R() * 2147483647) | 0, pos: g.camera.position.toArray(), dir: eyeFwd(g, _a, _b).toArray(), by: g.localId, ph: 0 };
  startSkill(g, ev, { ws, local: true });
  g.net?.sendSkill?.(ev);
  // the free full draw a beat later (the stance channel may still be held: it is cleared)
  later(ws, 0.08, () => { if (held(g, ws) && ss.iai) releaseIai(ws, g, 1); });
}
const nearestTo = (g, p, r) => { if (!p) return null; let best = null, bd = r; for (const z of g.zombies?.list || []) { if (!z.alive) continue; const d = z.pos.distanceTo(p); if (d < bd) { bd = d; best = z; } } return best; };

// ------------------------------------------------------------------------------------------ 睚眥必報 reflect
function reflect(ws, g, amount, opts) {
  const p = ws.def.special.skills.tap, z = opts.zombie || nearestTo(g, opts.from, 2.2);
  sfx(g, 'yazi_reflect', { volume: 0.9 });
  haptic(25);
  if (clipComfort.overlay) g.fx?.overlay?.tint?.([1.4, 0.35, 0.3], 0.05, 0.16, { fadeIn: 0.02, fadeOut: 0.12 });
  if (!z?.alive) return;
  const zc = z.center(V3()), eye = g.camera.position, dir = V3().subVectors(zc, eye).setY(0).normalize();
  const k = z.def?.boss ? p.bossReflect : p.reflect;
  strike(ws, g, z, amount * k, dir, { knock: 3, stagger: 1, tag: 'reflect', skill: 'yazi_vengeance', elem: 'soulrend', sever: SEVER_ARM, blood: 1 });
  // the crimson thread snaps from the blade through it (2-3 m, a white core in a blood glow), a short freeze; the 報
  // seal stamped over its head where the viewmodel never hides it, facing the eye
  const from = g.vm.socketApparent?.('mid_r', _a) || _a.copy(eye).add(_b.set(0, -0.3, 0));
  const to = zc.clone().addScaledVector(_c.subVectors(zc, from).normalize(), 1.1);
  g.fx?.bolt?.(from, to, { col: [6.5, 0.9, 0.55], glow: [2.6, 0.12, 0.06], width: 0.1, core: 0.22, levels: 3, jitter: 0.05, branches: 0, life: 0.24 });
  g.fx?.bolt?.(from, to, { col: [7, 5.5, 5], glow: [1.6, 0.2, 0.1], width: 0.03, core: 0.5, levels: 2, jitter: 0.03, branches: 0, life: 0.14 });
  stop(g, 0.06);
  stampSeal(g, _d.set(z.pos.x, z.pos.y + (z.height ?? 1.8) + 0.5, z.pos.z), 0.8, 0.85);
  g.fx?.shockwave?.(zc, { r0: 0.2, r1: 1.4, life: 0.26, color: [3, 0.3, 0.2], thin: true });
  hitBurst(g, zc, dir, 1, 1);
  slashOn(g, z, CUT_ANG.reflect, 0.9, 0.48);
}
/** a 報 seal mesh from the pool (built on first use or by the warm-up, never disposed mid-fight) */
function sealGet(g) {
  const S = sys(g);
  let m = S.sealPool.find((x) => x.userData.free);
  if (!m) { m = sealMesh(); g.scene.add(m); S.sealPool.push(m); }
  m.userData.free = false; m.visible = true; m.scale.setScalar(1);
  const u = m.material.uniforms; u.uT.value = 0; u.uAmt.value = 0; u.uGlow.value = 1;
  return m;
}
function sealFree(m) { m.visible = false; m.userData.free = true; }
/** a small 報 seal stamped facing the camera at p (size m), life s */
function stampSeal(g, p, size = 0.6, life = 0.6) {
  const S = sys(g), mesh = sealGet(g);
  mesh.position.copy(p); mesh.scale.setScalar(size);
  const u = mesh.material.uniforms;
  let t = 0;
  S.seals.push({ mesh, update: (dt) => {
    t += dt;
    mesh.quaternion.copy(g.camera.quaternion);
    u.uT.value = clamp(t / 0.08, 0, 1);
    u.uAmt.value = t < life - 0.25 ? 1 : Math.max(0, (life - t) / 0.25);
    mesh.scale.setScalar(size * (1 + 0.25 * Math.max(0, 1 - t / 0.08)));
    return t < life;
  } });
}

registerSkill('yazi_vengeance', {
  level: 'L2', dur: 4,
  start(k) {
    const g = k.game, d = k.data, c = k.feet(V3());
    d.ringT = 0; d.moteT = 0;
    g.fx?.shockwave?.(_a.set(c.x, c.y + 0.06, c.z), { normal: UP, r0: 0.3, r1: 3.2, life: 0.45, color: CRIM, thin: true });
    g.fx?.sigils?.sigil?.(c, { design: 'seal', radius: 1.6, color: [2.6, 0.25, 0.15], color1: [1.2, 0.05, 0.05], life: 1.2, spin: 1.2, seed: k.ev.seed });
    inkRing(g, c, k.rng);
    if (k.local) {
      const ws = k.ws, ss = ssOf(ws), g2 = g;
      installFilter(g2);
      ss.venge = { until: g.time + (k.p.dur ?? 4), k };
      // (cast in the stance: the stance holds -- only the runes and the eyes answer)
      if (!ss.iai) {
        ss.lockT = Math.max(ss.lockT, 0.32);
        if (ss.mode !== 'issen') { ss.mode = 'idle'; ss.step = -1; g.arsenal.playClip('yazi_venge', { duration: 0.6 }); }
      } else readyBeat(ws, g, 1);
      // a crimson flash, then a thin red border held through the 4 s (who is not to be touched)
      if (clipComfort.overlay) {
        g.fx?.overlay?.tint?.([1.6, 0.3, 0.24], 0.14, 0.3, { fadeIn: 0.03, fadeOut: 0.24 });
        d.border = g.fx?.overlay?.border?.([2.6, 0.16, 0.1], 0.2, (k.p.dur ?? 4) - 0.1, { fadeIn: 0.12, fadeOut: 0.4 });
      }
      sfx(g, 'yazi_vengeance', { volume: 1 });
      sfx(g, 'yazi_growl', { volume: 0.7, delay: 0.1 });
      shake(g, 0.08);
    } else sfx(g, 'yazi_vengeance', { pos: c, volume: 0.8 });
  },
  update(k, dt) {
    const g = k.game, d = k.data, c = k.feet(_c);
    // a slow crimson ring and red motes rising round the caster (everyone sees who is not to be touched)
    if ((d.ringT -= dt) <= 0) { d.ringT = 0.7; g.fx?.shockwave?.(_a.set(c.x, c.y + 0.05, c.z), { normal: UP, r0: 1.4, r1: 0.4, life: 0.6, color: [1.6, 0.1, 0.06], thin: true }); }
    if ((d.moteT -= dt) <= 0) {
      d.moteT = 0.06;
      const a = k.rng() * 6.283, r = 0.5 + k.rng() * 0.5;
      g.fx?.particles?.spawn({ additive: true, x: c.x + Math.cos(a) * r, y: c.y + 0.1 + k.rng() * 0.4, z: c.z + Math.sin(a) * r, vx: -Math.sin(a) * 0.6, vy: 1.2 + k.rng(), vz: Math.cos(a) * 0.6, life: 0.8, size: 0.05, size1: 0.01, color: [...CRIM, 1], color1: [0.3, 0.01, 0.01, 0], frame: FRAME.glow, drag: 1 });
    }
  },
  end(k) {
    const g = k.game;
    k.data.border?.stop?.(0.3);
    if (k.local) { const ss = ssOf(k.ws); if (ss.venge?.k === k) ss.venge = null; sfx(g, 'yazi_vengeance_end', { volume: 0.7 }); }
  },
});

// ------------------------------------------------------------------------------------------ 一閃 / parry replays
registerSkill('yazi_issen', {
  level: 'L2', dur: 0.7,
  start(k) {
    const g = k.game, d = k.data, from = k.pos.clone(), dir = k.dir.clone().setY(0).normalize(), len = k.ev.len ?? 6;
    d.from = from; d.dir = dir; d.len = len;
    // a white-to-blood streak along the lane at sword height + one at the hip, dust along it
    d.tr = [[1.15, [3.6, 2.4, 2.2], BLOOD, 0.3], [0.85, [2.6, 0.3, 0.2], [1.0, 0.02, 0.02], 0.2]].map(([h, c0, c1, w]) => ({ h, r: g.fx?.trail?.({ vm: false, width: w, life: 0.35, profile: 'soft', color: [...c0, 0.8], color1: [...c1, 0], segs: 24 }) }));
    if (!k.local) sfx(g, 'yazi_issen', { pos: from, volume: 0.8 });
    for (let i = 0; i <= 6; i++) { const p = _a.copy(from).addScaledVector(dir, len * i / 6); p.y = k.floorY(p); g.fx?.knockDust?.(p, _b.copy(dir).multiplyScalar(4), 0.6); }
    // the cut lane on the street: a scorched hairline
    const mid = _a.copy(from).addScaledVector(dir, len / 2); mid.y = k.floorY(mid);
    g.fx?.decals?.add?.(mid, UP, { frame: DECAL.slash ?? DECAL.scorch, size: Math.min(6, len), along: dir, tint: DECAL_TINT.scorch, alpha: 0.5, life: 8 });
  },
  update(k) {
    const d = k.data, u = Math.min(1, k.t / 0.16), pos = k.local ? k.game.player?.pos : _a.copy(d.from).addScaledVector(d.dir, d.len * u);
    if (!pos) return true;
    if (k.t < 0.2) for (const t of d.tr) t.r?.push?.(_b.set(pos.x, pos.y + t.h, pos.z));
    else for (const t of d.tr) t.r?.stop?.();
    return true;
  },
  end(k) { for (const t of k.data.tr || []) t.r?.stop?.(); },
});
registerSkill('yazi_parry', {
  level: 'L1', dur: 0.3,
  start(k) {
    if (k.local) return;
    const g = k.game, p = k.caster(_a, _b);
    p.addScaledVector(_b, 0.5).y -= 0.4;
    g.fx?.particles?.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.25, size: 0.8, size1: 0.3, color: [4, 2.6, 1.2, 1], color1: [...BLOOD, 0], frame: FRAME.glint, rot: k.rng() * 6 });
    sfx(g, 'yazi_parry', { pos: p, volume: 0.8 });
  },
});
// the alt channel: RMB held = the stance (the special drives it); teammates see a red glow at the caster's hip
registerSkill('yazi_iai', {
  level: 'L1', channel: true,
  start(k) {
    const g = k.game;
    if (!k.local) { k.data.glow = 0; return; }
    installFilter(g);
    k.data.started = false;
  },
  update(k, dt) {
    const g = k.game;
    if (!k.local) {
      if ((k.data.glow -= dt) <= 0) { k.data.glow = 0.3; const p = k.caster(_a, _b); g.fx?.particles?.spawn({ additive: true, x: p.x - _b.z * 0.25 + _b.x * 0.2, y: p.y - 0.7, z: p.z + _b.x * 0.25 + _b.z * 0.2, life: 0.35, size: 0.4, size1: 0.6, color: [...CRIM, 0.6], color1: [0, 0, 0, 0], frame: FRAME.glow }); }
      return;
    }
    const ws = k.ws, ss = ssOf(ws), p = ws.def.special.iai;
    if (!k.data.started) {
      // the stance once the blade is free (a cut finishes first; not straight after a draw)
      const free = (ss.mode === 'idle' || ss.mode === 'recover') && ss.lockT <= 0 && g.time - ss.iaiEnd >= p.rearm && g.arsenal.state === 'idle';
      if (!free) return;
      k.data.started = true;
      startStance(ws, g, k);
    }
    if (!ss.iai || ss.iai.k !== k) return false;
  },
  end(k) {
    if (!k.local) return;
    const g = k.game, ws = k.ws, ss = ssOf(ws);
    if (ss.iai?.k === k) { if (held(g, ws) && g.status?.alive) releaseIai(ws, g); else dropStance(ws, g); }
  },
});

// ------------------------------------------------------------------------------------------ 裂魂 ultimate (★ held)
// Beats (§1.7.3, 1.9 s): 0-0.2 the blade raised before the eyes (CARD, red lightning on the blade); 0.2-0.4 shadow-
// puppet swordsmen propped up beside up to 6 targets in a 10 m cone, the targets dragged 3 m together; 0.4-1.0 six
// cuts in turn (150 each) while the blood-red 報 seal is stamped in the air over them and a pillar falls; 1.0-1.3 one
// draw straight through the middle (600 in 6 m, a ring of red on the street); 1.3-1.9 the blade half home, the puppets
// fall back burning into paper ash. 1.0 s invulnerable. End: 報仇 (team headshots +10 %, 4 s).
const ULT = { rise: 0.2, cuts: [0.4, 1.0], seal: 0.4, draw: 1.0, hit: 1.12, sheathe: 1.3, end: 1.9 };
function ultTargets(k) {
  const g = k.game, p = k.p, eye = k.caster(_a, _b), fwd = _c.copy(_b).setY(0).normalize(), out = [];
  for (const z of g.zombies?.list || []) {
    if (!z.alive || out.length > 40) continue;
    const zc = z.center(V3()), dx = zc.x - eye.x, dz = zc.z - eye.z, d = Math.hypot(dx, dz);
    if (d > p.range || Math.abs(zc.y - eye.y) > 4) continue;
    const ang = Math.acos(clamp((dx * fwd.x + dz * fwd.z) / Math.max(1e-3, d), -1, 1)) * 180 / Math.PI;
    if (ang > p.cone / 2 + (d < 2 ? 30 : 0)) continue;
    const wh = g.world?.collision?.raycast(eye, _d.copy(zc).sub(eye).normalize(), zc.distanceTo(eye));
    if (wh && wh.dist < zc.distanceTo(eye) - 0.6) continue;
    out.push({ z, d });
  }
  out.sort((a, b) => a.d - b.d);
  return out.slice(0, p.max).map((o) => o.z);
}
registerSkill('yazi_ult', {
  level: 'L4', dur: ULT.end, defaults: { range: 10, cone: 70, max: 6, slash: 150, every: 0.1, pull: 3, final: 600, finalR: 6, invuln: 1.0 },
  start(k) {
    const g = k.game, d = k.data, eye = k.caster(V3(), _b), fwd = _b.clone().setY(0).normalize();
    d.beat = 0; d.cut = 0; d.pups = []; d.targets = [];
    // the centre: the middle of the targets (the local caster picks them; teammates rebuild the same from the event's
    // aim) or 6 m ahead
    const tg = ultTargets(k);
    d.targets = tg;
    const c = V3();
    if (tg.length) { for (const z of tg) c.add(z.pos); c.multiplyScalar(1 / tg.length); }
    else c.copy(eye).addScaledVector(fwd, 6);
    const off = c.clone().sub(eye).setY(0);
    if (off.length() > k.p.range) c.copy(eye).addScaledVector(off.normalize(), k.p.range);
    const wh = g.world?.collision?.raycast(eye, _a.copy(c).sub(eye).setY(0).normalize(), eye.distanceTo(c));
    if (wh) c.copy(eye).addScaledVector(_a, Math.max(1.5, wh.dist - 0.6));
    c.y = k.floorY(c);
    d.c = c; d.fwd = fwd;
    if (k.local) {
      const ws = k.ws, ss = ssOf(ws);
      dropStance(ws, g);
      ss.mode = 'idle'; ss.step = -1; ss.lockT = ULT.end; ss.ultOn = true; ss.lunge = null;
      g.arsenal.playClip('yazi_ult_cast', { duration: ULT.end });
      g.hud?.card?.(k.cardText(), { color: k.hex.rim, sub: k.def.en });
      g.arsenal.fovKick(3, 0.5);
      if (g.status) g.status.invuln = Math.max(g.status.invuln || 0, k.p.invuln);
      if (clipComfort.overlay) { d.border = g.hud?.border?.(k.hex.core, 0.26, ULT.end - 0.2); g.fx?.overlay?.tint?.([1.3, 0.55, 0.5], 0.1, 1.2, { fadeIn: 0.1, fadeOut: 0.4 }); }
      sfx(g, 'yazi_ult_cast', { volume: 1 });
      sfx(g, 'yazi_ult_bed', { volume: 0.8, delay: 0.2 });
      later(ws, 0.08, () => bladeLightning(g, 8));
    } else sfx(g, 'yazi_ult_cast', { pos: c, volume: 0.8 });
  },
  update(k, dt) {
    const g = k.game, fx = g.fx, d = k.data, t = k.t, p = k.p, c = d.c, S = sys(g);
    if (k.local && t < 0.95 && k.rng() < 0.35) bladeLightning(g, 1);
    // ② the puppets rise beside each target (or in a fan ahead), the targets dragged together
    if (d.beat < 1 && t >= ULT.rise) {
      d.beat = 1;
      const n = Math.max(3, d.targets.length);
      for (let i = 0; i < n; i++) {
        const z = d.targets[i % Math.max(1, d.targets.length)];
        let pos;
        if (z && i < d.targets.length) {
          const side = _a.set(-d.fwd.z, 0, d.fwd.x).multiplyScalar(i % 2 ? 1 : -1);
          pos = z.pos.clone().addScaledVector(side, 0.9).addScaledVector(d.fwd, -0.4);
        } else {
          const a = (i / (n - 1) - 0.5) * 1.2;
          pos = c.clone().add(_a.set(Math.sin(a) * 2.2, 0, 0).applyAxisAngle(UP, Math.atan2(d.fwd.x, d.fwd.z))).addScaledVector(d.fwd, Math.cos(a) * 1.2 - 1);
        }
        pos.y = k.floorY(pos);
        const face = z && i < d.targets.length ? z.pos.clone() : c.clone();
        const pup = puppet(g, pos, { height: 1.85, face, rise: 0.1, life: ULT.end - ULT.rise + 0.05 - i * 0.02, seed: k.ev.seed + i * 17 });
        S.puppets.push(pup);
        d.pups.push({ pup, z: z && i < d.targets.length ? z : null });
        fx?.knockDust?.(pos, _b.set(0, 0, 0), 0.8);
      }
      sfx(g, 'yazi_ult_puppet', { pos: c, volume: 1 });
      sfx(g, 'yazi_ult_suona', { pos: c, volume: 0.9, delay: 0.05 });
      if (k.local) {
        if (clipComfort.overlay) fx?.overlay?.radial?.(0.5, 0.3, { r0: 0.32, density: 0.3, thin: 0.5, color: [2.4, 0.4, 0.3] });
        // the drag: every target pulled towards the middle (3 m at most), reeling
        for (const z of d.targets) {
          const to = _a.copy(c).sub(z.pos).setY(0), L = to.length();
          if (L < 0.4 || !z.kvel) continue;
          const pull = Math.min(p.pull, L - 0.6) / 0.25;
          z.kvel.x += to.x / L * pull; z.kvel.z += to.z / L * pull;
          if (!z.def?.boss && !z.puppet) { z.state = 'stagger'; z.stateT = -0.6; }
          z.playOnce?.(z.actions?.stagger ? 'stagger' : 'hit_front', { fade: 0.06, speed: 0.9 });
        }
      }
    }
    // ③ the seal stamped in the air over the middle + a pillar of blood light
    if (d.beat < 2 && t >= ULT.seal) {
      d.beat = 2;
      const mesh = sealGet(g), u = mesh.material.uniforms, cam = g.camera;
      const near = cam.position.distanceTo(c) < 7;
      mesh.scale.setScalar(near ? 2.6 : 3.4);
      let st = 0;
      S.seals.push({ mesh, update: (dt2) => {
        st += dt2;
        // descends 6.5 -> 3 m over 0.6 s, stamps in over 0.12 s, glows; fades as the draw passes
        const v = Math.min(1, st / 0.6), y = 6.5 - 3.5 * (1 - (1 - v) ** 3);
        mesh.position.copy(c).add(_a.set(0, y, 0));
        mesh.quaternion.copy(cam.quaternion);
        u.uT.value = clamp(st / 0.12, 0, 1);
        // the draw shatters it: a quick fade (it hangs right over the caster after the dash)
        if (S.seals.find((x) => x.mesh === mesh)?.fade && st < 1.0) { st = 1.0; fx?.motes?.burst?.('ember', mesh.position, 18, { color: EMBER, speed: 3.5, spread: 1, radius: 1.2, seed: k.ev.seed }); }
        u.uAmt.value = st < 1.0 ? 1 : Math.max(0, 1 - (st - 1.0) / 0.05);
        u.uGlow.value = 1 + 0.6 * Math.sin(st * 18) * Math.max(0, 1 - st);
        return st < 1.06;
      } });
      fx?.sigils?.pillar?.(c, { radius: 1.1, height: 14, color: [3.0, 0.3, 0.2], color1: [1.2, 0.04, 0.03], life: 0.7, motes: 10 });
      fx?.sigils?.sigil?.(c, { design: 'seal', radius: 3.4, color: [2.8, 0.25, 0.15], color1: [1.0, 0.04, 0.04], life: 1.5, spin: 0.8, seed: k.ev.seed });
      sfx(g, 'yazi_ult_seal', { pos: c, volume: 1 });
      if (k.local) shake(g, 0.15);
    }
    // ④ six cuts in turn: each puppet slashes its target (150), the cut drawn on the body, 40 ms freezes
    const due = t < ULT.cuts[0] ? 0 : Math.min(6, Math.floor((t - ULT.cuts[0]) / p.every) + 1);
    while (d.cut < due && d.pups.length) {
      const i = d.cut++, P = d.pups[i % d.pups.length];
      P.pup.cut();
      sfx(g, 'yazi_ult_slash', { pos: P.pup.obj.position, volume: 0.7, pitch: 0.9 + i * 0.05 });
      const z = P.z;
      if (z?.alive) {
        const zc = z.center(V3()), dir = V3().subVectors(zc, P.pup.obj.position).setY(0).normalize();
        hitBurst(g, zc, dir, 0.8, i < 3 ? 0.6 : 0.3);
        if (k.local && k.ws) {
          const res = strike(k.ws, g, z, p.slash, dir, { knock: 0.6, stagger: 1, tag: 'ult', skill: 'yazi_ult', elem: 'soulrend', light: true, blood: 0.6 });
          if (!res?.killed) slashOn(g, z, (i % 2 ? 0.7 : -0.7) + (R() - 0.5) * 0.4, 0.9, 0.48);
          stop(g, 0.04); shake(g, 0.07); haptic(12);
        }
      }
    }
    // ⑤ the draw through the middle: the caster dashes through the centre; 600 in 6 m; a ring of red on the street
    if (d.beat < 3 && t >= ULT.draw) {
      d.beat = 3;
      // the draw cuts the puppets down with it: they fall back into ash one after another
      d.pups.forEach((P, i) => P.pup.stop(0.025 * i, 0.22));
      for (const sl of S.seals) sl.fade = true;
      if (k.local) {
        const ws = k.ws, pl = g.player;
        if (pl) {
          const from = pl.pos.clone(), to = c.clone().addScaledVector(_a.subVectors(c, from).setY(0).normalize(), -0.6);
          const dir = V3().subVectors(to, from).setY(0), L = dir.length();
          dir.normalize();
          const wh = g.world?.collision?.raycast(_a.set(from.x, from.y + 0.9, from.z), dir, L + 0.6);
          const len = wh ? Math.max(0.5, wh.dist - 0.6) : L;
          to.copy(from).addScaledVector(dir, len); to.y = k.floorY(to);
          ssOf(ws).issen = { from, to, dir, len, t: 0, T: 0.14, charge: 1, dmg: 0, passed: new Set(), list: [], landed: false, ult: true };
          ssOf(ws).mode = 'issen';
          if (g.status) g.status.invuln = Math.max(g.status.invuln || 0, 0.4);
        }
        screenSlashes(g, 1, true);
        g.arsenal.fovKick(5, 0.35);
        sfx(g, 'yazi_ult_issen', { volume: 1 });
      } else sfx(g, 'yazi_ult_issen', { pos: c, volume: 0.9 });
    }
    if (d.beat < 4 && t >= ULT.hit) {
      d.beat = 4;
      ultImpact(k, c);
    }
    if (d.beat < 5 && t >= ULT.sheathe) {
      d.beat = 5;
      for (const P of d.pups) P.pup.stop(0.05 * d.pups.indexOf(P));
      sfx(g, 'yazi_ult_sheathe', { volume: 0.9 });
    }
  },
  end(k) {
    const g = k.game, d = k.data;
    d.border?.stop?.(0.3);
    // 報仇: the whole team's headshots +10 % for 4 s (every client applies it to its own player)
    addAura(g, { type: 'headDmg', mul: 1.1, radius: 999, pos: null, dur: 4, by: k.by });
    if (k.local) { const ss = ssOf(k.ws); ss.ultOn = false; if (ss.mode === 'issen' && ss.issen?.ult) { ss.mode = 'idle'; ss.issen = null; } }
    for (const P of d.pups || []) P.pup.stop(0);
  },
});
function ultImpact(k, c) {
  const g = k.game, fx = g.fx, p = k.p, near = g.camera.position.distanceTo(c) < 6;
  fx?.shockwave?.(_a.set(c.x, c.y + 0.08, c.z), { normal: UP, r0: 0.5, r1: p.finalR * 1.2, life: 0.55, color: [3.0, 0.3, 0.2], thin: false });
  fx?.shockwave?.(_a.set(c.x, c.y + 0.1, c.z), { normal: UP, r0: 0.4, r1: p.finalR, life: 0.4, color: WHITE, thin: true });
  fx?.sigils?.ring?.(c, { r0: 0.3, r1: p.finalR, life: 0.8, color: [2.6, 0.2, 0.15] });
  fx?.lights?.flash?.(_a.set(c.x, c.y + 1.5, c.z), '#ff3020', near ? 10 : 24, 14, 0.3);
  const nd = near ? 12 : 22;
  for (let i = 0; i < nd; i++) { const a = (i / nd) * 6.283; fx?.knockDust?.(_a.set(c.x + Math.cos(a) * 2.5, c.y, c.z + Math.sin(a) * 2.5), _b.set(Math.cos(a) * 8, 0, Math.sin(a) * 8), near ? 1 : 1.6); }
  fx?.decals?.add?.(_a.copy(c), UP, { frame: DECAL.scorch, size: p.finalR * 1.4, tint: DECAL_TINT.scorch, alpha: 0.55, life: 15 });
  fx?.motes?.burst?.('ember', _a.set(c.x, c.y + 1.2, c.z), near ? 14 : 24, { color: EMBER, speed: 3, spread: 1, radius: 2, seed: k.ev.seed });
  sfx(g, 'yazi_ult_boom', { pos: c, volume: 1.1 });
  if (k.local) {
    for (const t of g.targets?.inRadius?.(c, p.finalR) || []) {
      const z = t.zombie || t, zc = t.center(V3()), dir = V3().subVectors(zc, c).setY(0); if (dir.lengthSq() < 1e-6) dir.copy(k.data.fwd); dir.normalize();
      const f = Math.max(0.6, 1 - t.distanceTo(c) / p.finalR);
      if (k.ws && z.alive) strike(k.ws, g, z, p.final * f, dir, { knock: 6, stagger: 1, tag: 'ult', skill: 'yazi_ult', elem: 'soulrend', sever: SEVER_ANY, blood: 0.8 });
    }
    stop(g, 0.12); shake(g, 0.45);
    if (clipComfort.overlay) { fx?.overlay?.radial?.(0.6, 0.2, { r0: 0.3, density: 0.32, thin: 0.5, color: [2.6, 0.4, 0.3] }); if (!near) fx?.screen?.kick?.([0.3, 0.06, 0.05], 0.05); }
    haptic(40); setTimeout(() => haptic(40), 110);
  } else if (g.camera.position.distanceTo(c) < 20) shake(g, 0.2);
}
/** red lightning crawling along the raised blade (viewmodel) */
function bladeLightning(g, n) {
  const vm = g.vm, a = vm.socketCam('base_r', _a), b = vm.socketCam('tip_r', _b), P = g.fx?.particles;
  if (!a || !b || !P) return;
  for (let i = 0; i < n; i++) {
    const u = R(), x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u, z = a.z + (b.z - a.z) * u;
    P.spawn({ additive: true, vm: true, x, y, z, vx: (R() - 0.5) * 0.6, vy: (R() - 0.5) * 0.6, vz: (R() - 0.5) * 0.2, life: 0.06 + R() * 0.05, size: 0.004, stretch: 0.05, color: [...WHITE, 1], color1: [...BLOOD, 0], frame: FRAME.spark });
  }
}

// ------------------------------------------------------------------------------------------ crisis + final kill
registerSkill('yazi_crisis', {
  level: 'L1', dur: 1.0,
  start(k) {
    const g = k.game, c = k.feet(V3());
    // 怒目: the blade draws itself and cuts all round -- a ring of red light at waist height, a ground ring
    for (let i = 0; i < 24; i++) { const a = i / 24 * 6.283; g.fx?.particles?.spawn({ additive: true, x: c.x + Math.cos(a) * 1.2, y: c.y + 1.0, z: c.z + Math.sin(a) * 1.2, vx: -Math.sin(a) * 9, vy: 0, vz: Math.cos(a) * 9, delay: i * 0.006, life: 0.18, size: 0.08, stretch: 0.05, color: [...WHITE, 1], color1: [...BLOOD, 0], frame: FRAME.spark }); }
    g.fx?.shockwave?.(_a.set(c.x, c.y + 0.1, c.z), { normal: UP, r0: 0.4, r1: 4.5, life: 0.4, color: CRIM, thin: false });
    sfx(g, 'yazi_crisis', { pos: c, volume: 1 });
    if (k.local && k.ws && held(g, k.ws)) { const ss = ssOf(k.ws); dropStance(k.ws, g); ss.mode = 'idle'; ss.lockT = 0.6; g.arsenal.playClip('yazi_crisis', { duration: 0.6 }); }
  },
});
registerSkill('yazi_final', {
  level: 'L2', dur: 1.4,
  start(k) {
    const g = k.game, fx = g.fx, c = k.pos.clone();
    c.y = k.floorY(_a.set(c.x, c.y + 1, c.z));
    if (!k.local) { fx?.sigils?.pillar?.(c, { radius: 0.45, height: 7, color: CRIM, life: 0.7, motes: 4, ring: false }); return; }
    // a puppet swordsman rises over the body and cuts it again; the small 報 seal flashes
    const cam = g.camera.position, side = _a.subVectors(cam, c).setY(0).normalize(), pos = c.clone().add(_b.set(-side.z, 0, side.x).multiplyScalar(0.9));
    const pup = puppet(g, pos, { height: 1.9, face: c.clone(), life: 1.3, seed: k.ev.seed });
    sys(g).puppets.push(pup);
    k.data.pup = pup;
    stampSeal(g, c.clone().add(_a.set(0, 2.4, 0)), 1.1, 1.0);
    fx?.sigils?.pillar?.(c, { radius: 0.5, height: 9, color: [3.0, 0.3, 0.2], color1: [1.2, 0.04, 0.03], life: 0.7, motes: 6 });
    sfx(g, 'yazi_final', { pos: c, volume: 0.9 });
  },
  update(k) { if (k.data.pup && !k.data.cut && k.t >= 0.25) { k.data.cut = true; k.data.pup.cut(); sfx(k.game, 'yazi_ult_slash', { pos: k.pos, volume: 0.7 }); } },
});

// ------------------------------------------------------------------------------------------ the special (engine overrides)
registerSpecial(ID, {
  init(ws) {
    ssOf(ws);
    const g = ws.game;
    if (g?.scene) sys(g);
    const au = g?.audio;
    if (au?.defs && !au._yzPre) { au._yzPre = true; au.preload?.(Object.keys(au.defs).filter((n) => /^(yazi_|ready_yazi)/.test(n)))?.catch?.(() => {}); }
  },
  /** the attacks (Arsenal._melee asks every frame while the weapon is idle in hand) */
  melee(ws, s, g) {
    const ss = ssOf(ws);
    if (!g.status?.alive) return true;
    if (s.pressed.fire) ss.buf = 0.3;
    if (ss.lockT > 0 || ss.iai || ss.mode === 'issen') return true;
    if (ss.buf > 0) {
      if (ss.mode === 'idle' || ss.mode === 'recover') { ss.buf = 0; startSwing(ws, g, ss.mode === 'recover' && ss.chainT > 0 && ss.step >= 0 ? (ss.step + 1) % 3 : 0); }
      else if (ss.mode === 'swing' && ss.hit && ss.t >= ss.cur.dur * 0.7 && ss.step < 2) { ss.buf = 0; startSwing(ws, g, ss.step + 1); }
    }
    return true;
  },
  onHit(ws, info, res, target) {
    const g = ws.game, z = target?.zombie || target;
    if (!res?.killed || !z?.center) return;
    // KE_SOUL: a crimson rim on the body, the soul wisp into the blade (+1 now, +2 on arrival = the card's 3)
    const zf = z.zfx || g.fx?.zfx;
    if (zf) { zf.clearStatus?.(z, 'kill'); zf.status?.(z, 'soulkill', 0.35); }
    soulWisp(ws, g, z);
    if (!info.skill) stop(g, info.headshot ? 0.06 : 0.035);
    // the wave's last kill: a puppet swordsman rises at the body and cuts it again (KE_FINAL, §1.10) -- once a wave
    const m = g.match, ss = ssOf(ws);
    if (m && m.state === 'round' && (m.queue?.length ?? 1) + (g.zombies?.alive ?? 1) <= 0 && ss.finalWave !== m.round) {
      ss.finalWave = m.round;
      const ev = { type: 'skill', id: 'yazi_final', w: ID, slot: 'fx', seed: (R() * 2147483647) | 0, pos: [z.pos.x, z.pos.y, z.pos.z], dir: [0, 0, -1], by: g.localId, ph: 0 };
      startSkill(g, ev, { ws, local: true });
      g.net?.sendSkill?.(ev);
    }
  },
  update(ws, dt, g) {
    const ss = ssOf(ws), inp = g.input?.state;
    // F mid-fight is not an inspect
    if ((ss.mode !== 'idle' && ss.mode !== 'recover') || ss.iai || ss.lockT > 0) { if (inp) inp.pressed.inspect = false; }
    driver(ws, dt, g);
    view(ws, g, dt);
    if (ss.iai || ss.mode === 'issen') g.arsenal.sinceShot = 0;
  },
  tick(ws, dt, g) {
    const ss = ssOf(ws);
    if (!held(g, ws)) {
      if (ss.hum) { ss.hum.stop?.(0.2); ss.hum = null; }
      if (ss.iai) dropStance(ws, g);
      if (ss.mode !== 'idle') { ss.mode = 'idle'; ss.step = -1; ss.lockT = 0; ss.issen = null; ss.lunge = null; }
      ss.view.w = null; ss.poseOK = false; ss.kuchi = 0;
    }
  },
  dispose(ws, g) {
    const ss = ws.sp?.yz;
    if (!ss) return;
    ss.hum?.stop?.(0.1); ss.chargeSnd?.stop?.(0.1);
    if (g) vignette(g, 0);
  },
  meterInfo(ws, key, m, g) {
    if (key !== 'iai') return null;
    // the stance's timing bar: the white parry window just past the sheathe, the charge to full beyond (the needle runs)
    const ss = ssOf(ws), iai = ss.iai, p = ws.def.special.iai, tot = p.sheathe + p.stages[2];
    if (!iai) return { ...m, type: 'bar', value: 0, raw: 0, hidden: true };   // (bar: no crosshair meter out of the stance)
    const v = clamp(iai.t / tot, 0, 1), w0 = p.sheathe / tot, w1 = (p.sheathe + p.perfect) / tot;
    // (twice the stock bar: 220 x 9 px, filling red behind the needle; the white parry window stands out of it)
    return { ...m, value: v, raw: v * 100, ready: iai.stage >= 3, window: [[p.sheathe + p.stages[2] * 0.995, tot].map((x) => x / tot), [w0, w1]], hidden: false, color: iai.stage >= 3 ? '#ff2a1a' : m.color, w: 220, h: 9, fill: true };
  },
  onClipEvent(ws, name, arg, g) {
    if (name !== 'yz') return;
    const what = typeof arg === 'string' ? arg : arg?.do;
    if (what === 'flick') bloodFlick(g, arg?.rare);
    else if (what === 'eyes') readyBeat(ws, g, arg?.k ?? 0.6);
    else if (what === 'world') worldInspect(ws, g);
    else if (what === 'koiguchi') koiguchi(ws, g);
    else if (what === 'runes') runeSweep(g, arg?.k ?? 1);
    else if (what === 'lightning') bladeLightning(g, arg?.n ?? 6);
  },
});

function driver(ws, dt, g) {
  const ss = ssOf(ws), p = ws.def.special, ar = g.arsenal;
  runQueue(ss, dt);
  ss.buf = Math.max(0, ss.buf - dt);
  ss.lockT = Math.max(0, ss.lockT - dt);
  XH.flashT = Math.max(0, XH.flashT - dt); XH.cutT = Math.max(0, XH.cutT - dt);
  if (ss.lunge) lungeUpdate(ss, g, dt);
  if (ss.iai) { stanceUpdate(ws, g, dt); if (!g.status?.alive) dropStance(ws, g); }
  if (!ss.iai) ss.kuchi = damp(ss.kuchi, 0, 20, dt);
  if (ss.mode === 'swing') {
    ss.t += dt;
    const c = ss.cur;
    if (!ss.hit && ss.t >= c.hit) { ss.hit = true; const n = sweep(ws, g, c, ss.step === 0 ? -1 : ss.step === 1 ? 1 : 0); if (c.heavy) cleaveArc(g, n > 0); }
    if (ss.t >= c.dur) {
      ss.mode = 'recover'; ss.t = 0; ss.chainT = p.chain;
      if (ss.step === 2) {
        // 收招 after the cleave: the blood flicked off (1 in 8: the drops write 報 in the air), any input cancels
        ss.combos++;
        const rare = ss.combos % 8 === 0;
        ar.playClip(rare ? 'yazi_recover_rare' : 'yazi_recover', { duration: p.recover });
        ss.step = -1;
      }
    }
  } else if (ss.mode === 'recover') {
    ss.t += dt;
    if (ss.chainT > 0 && (ss.chainT -= dt) <= 0) ss.step = -1;
    if (ss.t >= p.recover) ss.mode = 'idle';
  } else if (ss.mode === 'issen') {
    issenUpdate(ws, g, dt);
    const D = ss.issen;
    if (!D || (D.landed && D.t >= D.T + 0.3)) { ss.mode = 'idle'; ss.issen = null; }
  }
}

/**
 * First-use hitches (a 3-ult profile spent ~105 ms linking programs mid-ult, a first fight showed a 234 ms frame): on
 * the first equip of a game the pools are built (six puppets and a spare, four 報 seals: nothing is created mid-fight),
 * the custom programs compiled off the main thread (compileAsync), and once they are linked each is drawn for a couple
 * of frames far under the map (frustum culling is off on all of them) together with the shared kit pieces this weapon
 * uses (the seal sigil, the pillar, a world trail, bolts, rings, a slash decal, the ember motes), so every first use
 * is paid while the sabre is being drawn, not in a fight
 */
function warm(g) {
  if (g._yzWarm) return;
  g._yzWarm = true;
  try {
    const S = sys(g), fx = g.fx, gl = g.renderer?.gl;
    const rigs = puppetPool(g, 7);
    const fresh = [];
    while (S.sealPool.length < 4) fresh.push(sealGet(g));
    fresh.forEach(sealFree);
    for (const t of fxTextures()) gl?.initTexture?.(t);
    fx?.sigils?.preload?.(['seal']);
    const objs = [rigs[0].root, S.sealPool[0], S.pool[0]];
    Promise.all(objs.map((o) => gl?.compileAsync?.(o, g.camera, g.scene)?.catch?.(() => {}))).then(() => {
      if (g._yz !== S) return;
      const far = V3().copy(g.camera.position).add(_a.set(0, -60, 0)), far2 = far.clone().add(_b.set(0, -0.5, 0.3));
      S.puppets.push(puppet(g, far, { life: 0.1, rise: 0.01, height: 0.2 }));
      stampSeal(g, far.clone(), 0.1, 0.1);
      const m = S.pool.find((x) => !x.visible);
      if (m) { m.position.copy(far); m.scale.set(0.1, 0.05, 1); m.visible = true; S.cuts.push({ mesh: m, t: 0, z: null, T: [0.02, 0.02, 0.04] }); }
      fx?.sigils?.sigil?.(far, { design: 'seal', radius: 0.1, color: CRIM, life: 0.1 });
      fx?.sigils?.pillar?.(far, { radius: 0.05, height: 0.1, life: 0.1, motes: 0, ring: false, light: 0 });
      const tr = fx?.trail?.({ width: 0.01, life: 0.05, profile: 'katana', color: [1, 1, 1, 1], color1: [1, 0, 0, 0], segs: 4 });
      if (tr) { tr.push(far, far2); tr.push(far2, far); later2(g, 0.1, () => tr.stop?.()); }
      fx?.bolt?.(far, far2, { width: 0.005, levels: 2, branches: 0, life: 0.05 });
      fx?.bolt?.(_c.set(0, -0.3, -0.5), _d.set(0, -0.31, -0.52), { vm: true, width: 0.0001, levels: 1, branches: 0, life: 0.05 });
      fx?.shockwave?.(far, { normal: UP, r1: 0.05, life: 0.05, thin: false });
      fx?.shockwave?.(far, { r1: 0.05, life: 0.05 });
      fx?.decals?.add?.(far, UP, { frame: DECAL.slash ?? DECAL.scorch, size: 0.05, tint: DECAL_TINT.scorch, alpha: 0.01, life: 0.1 });
      fx?.motes?.burst?.('ember', far, 1, { color: EMBER, speed: 0.1, spread: 0.1, radius: 0.05 });
    });
  } catch (e) { console.warn('[yazi] warm-up', e); }
}
/** a game-time timer that needs no held weapon (the warm-up) */
function later2(g, sec, fn) { let t = 0; const s = { update: (dt) => { if ((t += dt) >= sec) { g.systems.splice(g.systems.indexOf(s), 1); fn(); } } }; g.systems.push(s); }
/** 改變世界的檢視: the world dims under a crimson haze for 2.5 s (only this screen), embers drift */
function worldInspect(ws, g) {
  const post = g.renderer?.post, ss = ssOf(ws);
  if (!post || ss.dim) return;
  const k = 0.82;
  post.exposure *= k; ss.dim = true;
  if (clipComfort.overlay) g.fx?.overlay?.tint?.([1.35, 0.6, 0.55], 0.12, 2.5, { fadeIn: 0.4, fadeOut: 0.6 });
  const P = g.fx?.particles, cam = g.camera;
  for (let i = 0; i < 20; i++) {
    _a.set((R() - 0.5) * 8, R() * 2.5 - 1, -3 - R() * 6).applyQuaternion(cam.quaternion).add(cam.position);
    P?.spawn({ additive: true, x: _a.x, y: _a.y, z: _a.z, vy: 0.25, delay: R() * 0.8, life: 1.6, fadeIn: 0.3, size: 0.03 + R() * 0.03, size1: 0.008, color: [...EMBER, 1], color1: [...BLOOD, 0], frame: FRAME.glow });
  }
  later(ws, 2.5, () => { post.exposure /= k; ss.dim = false; });
}
/** 血振り: dark drops flung off the blade (rare: they hang a moment in the shape of 報, then fall as blood spots) */
function bloodFlick(g, rare = false) {
  const vm = g.vm, P = g.fx?.particles, a = vm.socketCam('mid_r', _a), b = vm.socketCam('tip_r', _b);
  if (!P || !a || !b) return;
  sfx(g, 'yazi_flick', { volume: 0.8 });
  if (!rare) {
    for (let i = 0; i < 3; i++) { const p = _c.copy(a).lerp(b, 0.4 + i * 0.25); P.spawn({ vm: true, x: p.x, y: p.y, z: p.z, vx: 0.4 + R() * 0.3, vy: -0.6 - R() * 0.4, vz: -0.2, life: 0.5, size: 0.006, size1: 0.004, stretch: 0.015, color: [...MIST, 1], color1: [...MIST, 0.6], frame: FRAME.drop ?? 7, gravity: 6 }); }
    return;
  }
  // rare: ~22 drops hang in the air ahead in the strokes of 報 for 0.3 s, then fall and land as blood spots (world)
  const cam = g.camera, c = _d.set(0, 0.05, -1.6).applyQuaternion(cam.quaternion).add(cam.position), rx = _e.set(1, 0, 0).applyQuaternion(cam.quaternion), uy = _f.set(0, 1, 0).applyQuaternion(cam.quaternion);
  const strokes = [[[0.06, 0.1], [0.4, 0.1]], [[0.23, 0.02], [0.23, 0.26]], [[0.02, 0.27], [0.44, 0.27]], [[0.04, 0.52], [0.42, 0.52]], [[0.23, 0.52], [0.23, 0.98]], [[0.56, 0.08], [0.95, 0.08], [0.95, 0.4]], [[0.56, 0.08], [0.56, 0.5]], [[0.58, 0.58], [0.96, 0.58], [0.6, 0.97]], [[0.66, 0.68], [0.98, 0.98]]];
  for (const s of strokes) for (let i = 0; i < s.length - 1; i++) for (let j = 0; j <= 2; j++) {
    const u = j / 2, x = s[i][0] + (s[i + 1][0] - s[i][0]) * u, y = s[i][1] + (s[i + 1][1] - s[i][1]) * u;
    const p = _a.copy(c).addScaledVector(rx, (x - 0.5) * 0.5).addScaledVector(uy, (0.5 - y) * 0.5);
    P.spawn({ x: p.x, y: p.y, z: p.z, delay: 0.3, life: 0.9, size: 0.014, size1: 0.01, color: [...MIST, 1], color1: [...MIST, 0.8], frame: FRAME.glow, gravity: 9.8, collide: true });
    P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.32, size: 0.016, size1: 0.012, color: [0.9, 0.04, 0.03, 1], color1: [0.5, 0.02, 0.01, 1], frame: FRAME.glow });
  }
  setTimeout(() => { const f = _a.copy(c); f.y = floorAt(g, f); g.fx?.decals?.add?.(f, UP, { frame: DECAL.blood2 ?? DECAL.blood, size: 0.5, tint: DECAL_TINT.blood, alpha: 0.8, life: 20 }); }, 700);
}
/** the runes light from the collar to the point (first draw, inspect, 睚眥必報): a hot spot runs up the blade */
function runeSweep(g, k = 1) {
  const vm = g.vm, a = vm.socketCam('base_r', _a), b = vm.socketCam('tip_r', _b), P = g.fx?.particles;
  if (!a || !b || !P) return;
  const n = Math.round(10 + 6 * k);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1), p = _c.copy(a).lerp(b, u);
    P.spawn({ additive: true, vm: true, x: p.x, y: p.y, z: p.z, delay: i * 0.018, life: 0.2, size: 0.012 * k, size1: 0.022 * k, color: [...EMBER, 1], color1: [...BLOOD, 0], frame: FRAME.glow });
    if (k > 1 && i % 3 === 0) P.spawn({ additive: true, vm: true, x: p.x, y: p.y, z: p.z, delay: i * 0.018, life: 0.12, size: 0.008, size1: 0.03, color: [...WHITE, 1], color1: [...BLOOD, 0], frame: FRAME.glint, rot: R() * 6 });
  }
  vm.weapon?.premium?.fire?.(0.5, 0.35);
}
/**
 * 睚眥必報's cast (seen by all): a ring of blood-red ink thrown out round the caster along the street -- splashed
 * blobs that land as spots, red streaks skimming out, a heavy crimson ring, an ink splat stamped under the feet
 */
function inkRing(g, c, rng = R) {
  const P = g.fx?.particles, fx = g.fx;
  fx?.shockwave?.(_a.set(c.x, c.y + 0.08, c.z), { normal: UP, r0: 0.6, r1: 6, life: 0.55, color: [2.8, 0.16, 0.1], thin: false });
  fx?.decals?.add?.(_a.set(c.x, c.y, c.z), UP, { frame: DECAL.blood2 ?? DECAL.blood, size: 2.6, tint: DECAL_TINT.blood, alpha: 0.6, life: 8 });
  if (!P) return;
  // (thrown from waist height in a high arc: from the eye they fly out into view and rain down 3-6 m away)
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * 6.283 + rng() * 0.15, sp = 6.5 + rng() * 4, cs = Math.cos(a), sn = Math.sin(a);
    P.spawn({ x: c.x + cs * 0.4, y: c.y + 0.7, z: c.z + sn * 0.4, vx: cs * sp, vy: 2.4 + rng() * 2, vz: sn * sp, life: 0.9 + rng() * 0.4, size: 0.06 + rng() * 0.08, stretch: 0.05,
      color: [...MIST, 1], color1: [0.32, 0.02, 0.02, 0.9], frame: FRAME.drop ?? 7, gravity: 9.8, collide: true, bounce: 0.05 });
    if (i % 2 === 0) P.spawn({ additive: true, x: c.x + cs * 0.5, y: c.y + 0.9 + rng() * 0.4, z: c.z + sn * 0.5, vx: cs * (11 + rng() * 4), vy: 0.6, vz: sn * (11 + rng() * 4), life: 0.32, size: 0.07, stretch: 0.12,
      color: [3.6, 0.35, 0.2, 1], color1: [...BLOOD, 0], frame: FRAME.spark, drag: 1.5 });
  }
}

// ------------------------------------------------------------------------------------------ clips
// Keys per hand: [t (0..1), grip [x, y, z] | null (keep), blade / scabbard dir | null (keep), edge | null (leads the
// motion), ease into the key, { sh } (scabbard keys: sheathed on the sabre, the blade sh mm out)]. Camera space: +x
// right, +y up, -z forward. Each clip starts from where the pair is and ends on the live idle pose.
// Trails (§1.17): a white-hot crescent with a pale wake; the cut that bites bleeds blood red for the rest of it.
// (the band from the middle of the blade: twice the width of the old fore -> tip ribbon; the edge line over the smear)
const TRAIL = (o = {}) => ({ on: true, id: 'cut', from: 'mid_r', to: 'tip_r', profile: 'katana', ext: 1.06, color: '#ffeae4', color1: '#b02018', k: 6, hitColor: '#ff3020', hitColor1: '#7a0008', life: 0.15, segs: 22, ...o });
const TROFF = { on: false, id: 'cut' };
// a cut: wind-up W (grip, blade dir), the arc through the dirs A (the grip moving W -> F with a forward bulge), the
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
// the scabbard steadies low on the left while the right hand cuts (a counter-swing)
const SAYA_HOLD = (t0, t1, dx = 0.02) => [[t0, [IDLE.L.p[0] - dx, IDLE.L.p[1] - 0.02, IDLE.L.p[2] + 0.02], IDLE.L.d, IDLE.L.m, 'out3'], [t1, null, null, null, 'linear']];
// ① 袈裟: up over the right shoulder, down across the front to the lower left
const C_KESA = cutKeys([[0.24, -0.04, -0.3], N3(0.45, 0.85, -0.3)], [N3(0.2, 0.9, -0.42), N3(-0.35, 0.45, -0.82), N3(-0.82, -0.28, -0.5)], [[-0.12, -0.3, -0.4], N3(-0.7, -0.62, -0.35)], [0.12, 0.2, 0.37, 0.5, 0.66],
  [0.84, [0.1, -0.34, -0.36], N3(-0.3, -0.2, -0.93)]);
// ② 橫: drawn out to the left, flat across the front at chest height to the right; the blade tipped ~15° down so the
// cut's plane opens to the eye (seen flat on, not edge-on)
const C_YOKO = cutKeys([[-0.2, -0.16, -0.32], N3(-0.95, 0.12, -0.25)], [N3(-0.6, -0.14, -0.8), N3(0, -0.3, -1), N3(0.6, -0.28, -0.8), N3(0.92, -0.16, -0.38)], [[0.22, -0.2, -0.36], N3(0.9, -0.15, 0.4)], [0.12, 0.2, 0.37, 0.52, 0.66],
  [0.84, [0.12, -0.32, -0.36], N3(0.2, -0.3, -0.93)]);
// ③ 兜割: raised overhead (the blade back over the head; the fist up and out to the right, 30 cm off, so the forearm
// does not wall off the right third), the lunge, straight down through the middle
const C_KABUTO = cutKeys([[0.19, 0.09, -0.32], N3(0.05, 0.72, 0.69)], [N3(0.02, 0.98, -0.2), N3(0.0, 0.32, -0.95), N3(0.0, -0.45, -0.89)], [[0.02, -0.3, -0.5], N3(0, -0.75, -0.66)], [0.16, 0.28, 0.42, 0.55, 0.7],
  [0.86, [0.08, -0.34, -0.4], N3(-0.2, -0.4, -0.9)]);
registerClip('yazi_kesa', (vm) => yClip(vm, { R: C_KESA, L: SAYA_HOLD(0.3, 0.7), events: [[0.17, 'trail', TRAIL()], [0.3, 'haptic', 'tick'], [0.62, 'trail', TROFF]] }));
registerClip('yazi_yoko', (vm) => yClip(vm, { R: C_YOKO, L: SAYA_HOLD(0.3, 0.7, -0.02), events: [[0.17, 'trail', TRAIL()], [0.3, 'haptic', 'tick'], [0.62, 'trail', TROFF]] }));
registerClip('yazi_kabuto', (vm) => yClip(vm, { R: C_KABUTO, L: SAYA_HOLD(0.3, 0.75), events: [[0.24, 'trail', TRAIL({ life: 0.17, k: 7 })], [0.4, 'haptic', 'thud'], [0.42, 'shake', 0.12], [0.66, 'trail', TROFF]] }));
// 收招: the blade lifted to the right and flicked down hard (血振り, the drops fly), back across the lower frame
const FLICK = (vm, rare) => yClip(vm, {
  R: [[0.14, [0.2, -0.12, -0.36], N3(-0.2, 0.95, -0.25), N3(0.9, 0.2, 0.3), 'out3'], [0.24, [0.24, -0.26, -0.38], N3(0.25, -0.55, -0.8), null, 'in3'], [0.5, [0.23, -0.27, -0.38], null, null, 'linear'], [0.62, [0.12, -0.24, -0.4], N3(-0.85, 0.1, -0.5), null, 'inOut']],
  L: SAYA_HOLD(0.2, 0.6), events: [[0.24, 'yz', { do: 'flick', rare }], [0.25, 'haptic', 'tick'], [0.55, 'snd', 'yazi_sheathe'], [0.56, 'snd', 'yazi_recover']],
});
registerClip('yazi_recover', (vm) => FLICK(vm, false));
registerClip('yazi_recover_rare', (vm) => FLICK(vm, true));
// 居合 stance: the scabbard comes up from the left and the blade slides home (0 -> 0.094 = 0.15 s of 1.6): the sheathed
// sword held across the lower frame, the scabbard reaching forward-left (its rune panels and the lit mouth in view), the
// hilt at the lower right, the edge up; trembles while held (loop)
const STANCE = [[0.06, -0.15, -0.38], N3(-0.9, 0.12, -0.42), N3(0.26, 0.92, -0.29)];
const tremble = (k, dx) => [k[0].map((v, i) => v + dx[i]), k[1], k[2]];
registerClip('yazi_stance', (vm) => yClip(vm, {
  R: [[0.094, ...STANCE, 'out3'], [0.35, ...tremble(STANCE, [0.0015, 0.0015, 0]), 'inOut'], [0.6, ...tremble(STANCE, [-0.0015, 0, 0.001]), 'inOut'], [0.85, ...STANCE, 'inOut']],
  L: [[0.04, null, null, null, 'out', { sh: 760 }], [0.094, null, null, null, 'out3', { sh: 0 }], [0.85, null, null, null, 'linear', { sh: 0 }]],
  loop: [0.12, 0.85], end: 'hold', events: [[0.02, 'snd', 'cloth'], [0.094, 'haptic', 'tick']],
}));
// 一閃: out of the stance the hilt drives forward and right, the blade leaving the mouth (the scabbard pulled back,
// saya-biki), one flat cut across the whole front left -> right, held a beat on the right, back
registerClip('yazi_issen', (vm) => yClip(vm, {
  R: [[0.05, [0.24, -0.17, -0.3], N3(-0.9, 0.12, -0.42), N3(0.26, 0.92, -0.29), 'in'], [0.1, [0.16, -0.16, -0.5], N3(-0.55, 0.05, -0.83), null, 'linear'], [0.17, [0.18, -0.16, -0.52], N3(0.1, 0.04, -1), null, 'linear'],
    [0.27, [0.28, -0.17, -0.38], N3(0.95, 0.0, -0.3), null, 'out'], [0.42, [0.3, -0.2, -0.32], N3(0.85, -0.25, 0.45), null, 'out3'], [0.62, null, null, null, 'linear']],
  L: [[0.03, null, null, null, 'linear', { sh: 260 }], [0.12, [IDLE.L.p[0] - 0.06, IDLE.L.p[1] - 0.04, IDLE.L.p[2] + 0.04], IDLE.L.d, IDLE.L.m, 'out3'], [0.6, null, null, null, 'linear']],
  events: [[0.05, 'trail', TRAIL({ life: 0.2, color1: '#ff4a3a' })], [0.06, 'haptic', 'thud'], [0.3, 'trail', TROFF]],
}));
// 睚眥必報 cast: the blade raised flat before the eyes, the edge up, the runes flare, a breath
registerClip('yazi_venge', (vm) => yClip(vm, {
  R: [[0.3, [0.1, -0.13, -0.42], N3(-0.96, 0.22, 0.12), N3(0, 1, 0.05), 'out3'], [0.6, [0.1, -0.135, -0.42], null, null, 'linear']],
  L: SAYA_HOLD(0.3, 0.7), events: [[0.22, 'yz', { do: 'runes', k: 1.6 }], [0.28, 'yz', { do: 'lightning', n: 10 }], [0.3, 'yz', { do: 'eyes', k: 1.5 }], [0.32, 'haptic', 'thud'], [0.4, 'yz', { do: 'lightning', n: 6 }]],
}));
// 裂魂 (1.9 s): the blade raised upright in the right third, leaning 15° out (0 -> 0.1; the seal, the puppets and the
// CARD own the middle), held through the puppets' cuts (red lightning on it), the draw through the middle at 0.53 (a
// huge flat cut left -> right), half home in the scabbard at 0.68 (the stance pose with the blade 3 cm out), back to rest
registerClip('yazi_ult_cast', (vm) => yClip(vm, {
  R: [[0.1, [0.15, -0.14, -0.38], N3(0.27, 1, 0.06), N3(-1, 0.27, -0.1), 'out3'], [0.5, [0.15, -0.135, -0.38], null, null, 'linear'],
    [0.53, [-0.1, -0.17, -0.42], N3(-0.85, 0.05, -0.5), null, 'in'], [0.58, [0.08, -0.16, -0.5], N3(0, 0.04, -1), null, 'linear'], [0.63, [0.28, -0.17, -0.36], N3(0.95, 0, -0.28), null, 'out'],
    [0.72, ...STANCE, 'inOut'], [0.88, ...STANCE, 'linear']],
  L: [[0.1, ...SAYA_HOLD(0.1, 0.2)[0].slice(1, 4), 'out3'], [0.62, null, null, null, 'linear'], [0.7, null, null, null, 'out', { sh: 200 }], [0.74, null, null, null, 'out3', { sh: 30 }], [0.88, null, null, null, 'linear', { sh: 30 }], [0.95, IDLE.L.p, IDLE.L.d, IDLE.L.m, 'inOut']],
  dur: ULT.end, events: [[0.02, 'haptic', 'thud'], [0.05, 'yz', 'lightning'], [0.1, 'yz', { do: 'eyes', k: 1 }], [0.52, 'trail', TRAIL({ life: 0.22, k: 6.5, color1: '#ff4a3a' })], [0.65, 'trail', TROFF],
    [0.74, 'haptic', 'tick']],
}));
// 怒目 (crisis): one full turn of the blade round the body, low
registerClip('yazi_crisis', (vm) => {
  const R1 = [];
  for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI * 2; R1.push([0.08 + i * 0.1, [Math.sin(a) * 0.22, -0.2, -0.3 + (1 - Math.cos(a)) * 0.05], [Math.sin(a + 1.4), 0.05, -Math.cos(a + 1.4)], null, i === 0 ? 'out' : 'linear']); }
  return yClip(vm, { R: R1, L: SAYA_HOLD(0.2, 0.8), events: [[0.06, 'trail', TRAIL({ life: 0.2 })], [0.72, 'trail', TROFF], [0.08, 'haptic', 'thud']] });
});
// first draw (1.2 s, once per match, fire cancels): the scabbard rises from the lower left with the blade home in it,
// the thumb breaks the mouth (喀), a 0.15 s draw with a full roll of the blade (a red trail), the 睚眥 eyes light, the
// runes run collar -> point, the blade laid across the lower frame point-left, a 0.2 s hold
const FD_STANCE = STANCE;
registerClip('yazi_first', (vm) => yClip(vm, {
  R: [[0.0, [-0.1, -0.5, -0.2], N3(-0.4, -0.4, 0.82), N3(0, 0.9, 0.4), 'snap'], [0.22, ...FD_STANCE, 'out3'], [0.3, ...tremble(FD_STANCE, [0.004, 0.003, -0.004]), 'outBack'],
    [0.33, [0.24, -0.17, -0.3], N3(-0.9, 0.12, -0.42), N3(0.26, 0.92, -0.29), 'in'], [0.36, [0.12, -0.16, -0.46], N3(-0.6, 0.1, -0.79), N3(0, 0.95, -0.3), 'linear'], [0.42, [0.16, -0.14, -0.42], N3(0.2, 0.95, -0.2), N3(1, -0.1, 0.1), 'linear'], [0.48, [0.14, -0.15, -0.42], N3(0.6, -0.7, -0.35), N3(0, -0.4, 0.9), 'linear'],
    [0.56, [0.08, -0.18, -0.4], N3(-0.9, -0.1, -0.4), N3(0, 0.6, -0.8), 'out'], [0.7, [0.08, -0.19, -0.39], IDLE.R.d, IDLE.R.m, 'inOut'], [0.86, null, null, null, 'linear']],
  L: [[0.0, null, null, null, 'snap', { sh: 0 }], [0.3, null, null, null, 'linear', { sh: 0 }], [0.33, null, null, null, 'linear', { sh: 30 }], [0.355, null, null, null, 'in', { sh: 300 }],
    [0.45, IDLE.L.p, IDLE.L.d, IDLE.L.m, 'out3'], [0.86, null, null, null, 'linear']],
  dur: 1.2, endEase: 'inOut',
  tracks: { R_fx_head: [[0, 0], [0.58, 0], [0.64, 1, 'out3'], [0.8, 1], [0.9, 0.3]], R_fx_jaw: [[0, 0], [0.6, 0], [0.65, 1, 'out3'], [0.75, 1], [0.82, 0]] },
  events: [[0.02, 'snd', 'yazi_draw_first'], [0.3, 'yz', 'koiguchi'], [0.3, 'snd', 'yazi_koiguchi'], [0.34, 'trail', TRAIL({ life: 0.2, color1: '#ff3020', k: 5 })], [0.35, 'snd', 'yazi_unsheathe'],
    [0.36, 'haptic', 'tick'], [0.55, 'trail', TROFF], [0.6, 'yz', { do: 'eyes', k: 1 }], [0.62, 'yz', 'runes'], [0.62, 'snd', 'yazi_growl'], [0.72, 'snd', 'yazi_first_sting']],
}));
// normal draw (0.35 s): out of the scabbard at the left hip, swung across to rest (the colour shift is §1.17's)
registerClip('yazi_draw', (vm) => yClip(vm, {
  R: [[0.0, [-0.05, -0.32, -0.3], N3(-0.5, -0.5, 0.7), N3(0, 0.9, 0.4), 'snap'], [0.45, [0.06, -0.2, -0.44], N3(-0.7, 0.05, -0.7), null, 'out']],
  L: [[0.0, null, null, null, 'snap', { sh: 400 }], [0.3, IDLE.L.p, IDLE.L.d, IDLE.L.m, 'out3']],
  endEase: 'out3', events: [[0.02, 'snd', 'yazi_draw'], [0.05, 'trail', TRAIL({ life: 0.12, k: 3 })], [0.45, 'trail', TROFF]],
}));
// inspect (4.4 s): the flat turned to the eye in a slow tilt so the light runs down the temper line (0.04 -> 0.18:
// held F loops it), the blade sent home (0.22 -> 0.3) and the thumb breaks the mouth an inch and back (0.32), drawn and
// spun once round in the fingers (0.5 -> 0.68), the point turned to the eye, the 睚眥 eyes light, held (0.82 -> 1)
const IN_FLAT = [[0.06, -0.15, -0.4], N3(-0.9, 0.42, 0.06), N3(0.42, 0.9, 0.0)];
// the fist low, the ring raised ~25 cm before the eye with its flat (the 睚眥's face) turned to it, the blade hanging
const IN_RING = [[0.015, -0.17, -0.3], N3(-0.25, -0.92, -0.3), N3(-0.92, 0.25, 0.05)];
function inspectClip(vm, rare) {
  const R1 = [[0.04, ...IN_FLAT, 'inOut'], [0.11, IN_FLAT[0], N3(-0.9, 0.38, -0.2), N3(0.1, 0.25, -0.96), 'inOut'], [0.18, ...IN_FLAT, 'inOut']];
  const L1 = [[0.04, ...SAYA_HOLD(0, 0)[0].slice(1, 4), 'inOut'], [0.2, null, null, null, 'linear']];
  if (!rare) {
    R1.push([0.26, ...STANCE, 'inOut'], [0.31, ...tremble(STANCE, [0.004, 0.002, -0.006]), 'out'], [0.36, ...STANCE, 'in'], [0.44, ...STANCE, 'linear'], [0.49, ...STANCE, 'linear']);
    L1.push([0.24, null, null, null, 'out', { sh: 600 }], [0.26, null, null, null, 'out3', { sh: 0 }], [0.31, null, null, null, 'out', { sh: 25 }], [0.36, null, null, null, 'in', { sh: 0 }], [0.44, null, null, null, 'linear', { sh: 0 }], [0.48, null, null, null, 'in', { sh: 560 }], [0.54, IDLE.L.p, IDLE.L.d, IDLE.L.m, 'out3']);
    // the spin: the blade turned once round in the fingers (flat to the eye)
    for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI * 2; R1.push([0.52 + i * 0.027, [0.08, -0.15, -0.4], [Math.sin(a) * 0.95, Math.cos(a), -0.25], [Math.cos(a), -Math.sin(a), 0.05], i === 0 ? 'out3' : 'linear']); }
  } else {
    // rare: tossed up 1.5 turns, the scabbard rises to meet it, it drops home with a click, drawn again
    for (let i = 0; i <= 6; i++) { const u = i / 6, a = u * Math.PI * 3, lift = Math.sin(Math.PI * u) * 0.2; R1.push([0.24 + u * 0.18, [0.02, -0.12 + lift, -0.42], [Math.sin(a) * 0.9, Math.cos(a), -0.3], null, i === 0 ? 'out' : 'linear']); }
    R1.push([0.46, ...STANCE, 'in3'], [0.52, ...STANCE, 'linear'], [0.575, ...STANCE, 'linear']);
    L1.push([0.4, [STANCE[0][0] - 0.05, STANCE[0][1] - 0.04, STANCE[0][2] + 0.1], STANCE[1], STANCE[2], 'out3'], [0.46, null, null, null, 'in3', { sh: 0 }], [0.52, null, null, null, 'linear', { sh: 0 }], [0.57, null, null, null, 'in', { sh: 560 }], [0.62, IDLE.L.p, IDLE.L.d, IDLE.L.m, 'out3']);
    R1.push([0.62, [0.1, -0.16, -0.44], N3(-0.6, 0.2, -0.77), null, 'out']);
  }
  // the point to the eye, the head turned to the camera, the eyes light, held
  // the ring raised before the face, the blade hanging down-left out of the frame: the 睚眥 looks at the player
  R1.push([0.8, ...IN_RING, 'inOut'], [0.88, ...tremble(IN_RING, [0.002, 0.004, 0]), 'inOut'], [0.95, ...IN_RING, 'linear']);
  L1.push([0.95, null, null, null, 'linear']);
  return yClip(vm, {
    R: R1, L: L1, dur: 4.4, loop: [0.04, 0.18],
    tracks: { env: [[0, 0], [0.1, 1], [0.9, 1], [1, 0]], R_fx_head: [[0, 0], [0.8, 0], [0.84, 1, 'out3'], [0.95, 1], [1, 0]], R_fx_jaw: [[0, 0], [0.82, 0], [0.86, 0.7, 'out3'], [0.94, 0.7], [0.98, 0]] },
    events: [[0.02, 'snd', 'cloth'], [0.04, 'yz', 'world'], [0.08, 'snd', 'yazi_inspect'], [0.26, 'snd', 'yazi_sheathe'], ...(rare ? [[0.24, 'anchorR', ['rest', 0.08]], [0.44, 'anchorR', ['grip_r', 0.06]], [0.46, 'snd', 'yazi_sheathe'], [0.47, 'haptic', 'tick'], [0.58, 'snd', 'yazi_unsheathe']]
      : [[0.31, 'yz', 'koiguchi'], [0.31, 'snd', 'yazi_koiguchi'], [0.36, 'snd', 'yazi_sheathe'], [0.5, 'snd', 'yazi_unsheathe'], [0.52, 'snd', 'cloth']]),
      [0.82, 'yz', { do: 'eyes', k: 1.6 }], [0.83, 'yz', 'runes'], [0.9, 'yz', { do: 'eyes', k: 0.8 }]],
  });
}
registerClip('yazi_inspect', (vm) => inspectClip(vm, false));
registerClip('yazi_inspect_rare', (vm) => inspectClip(vm, true));
// ready idle extra (§1.17 idle tiers): the blade lifted a hair, the head raises its eyes, the runes flare
registerClip('yazi_ready', (vm) => yClip(vm, {
  R: [[0.35, [0.08, -0.19, -0.4], N3(-0.94, 0.25, -0.22), null, 'out3'], [0.55, null, null, null, 'linear']],
  dur: 0.9, tracks: { R_fx_head: [[0, 0], [0.3, 1, 'out3'], [0.7, 1], [1, 0]], R_fx_jaw: [[0, 0], [0.35, 0.6, 'out3'], [0.6, 0], [1, 0]] },
  events: [[0.3, 'yz', { do: 'eyes', k: 0.6 }], [0.32, 'yz', 'runes']],
}));
// glint: a slow tilt so the light runs along the edge; flick: the rare idle -- the blade flicked down, a few drops
registerClip('yazi_glint', (vm) => yClip(vm, { R: [[0.5, [0.08, -0.2, -0.4], N3(-0.92, 0.14, -0.36), N3(0.15, 0.45, -0.88), 'inOut']], dur: 0.9 }));
registerClip('yazi_flick', (vm) => yClip(vm, {
  R: [[0.2, [0.16, -0.14, -0.38], N3(-0.4, 0.88, -0.25), N3(0.9, 0.3, 0.2), 'out3'], [0.32, [0.2, -0.28, -0.38], N3(0.2, -0.6, -0.78), null, 'in3'], [0.5, null, null, null, 'linear']],
  dur: 1.0, events: [[0.32, 'yz', 'flick'], [0.33, 'haptic', 'tick']],
}));

// ------------------------------------------------------------------------------------------ crosshair, kill mark, damage skin
// xh_blade: one horizontal sword scar broken by the hollow centre (tapered ends), two dots on the diagonal; the stance
// lights three ticks under it (the stages) and closes the scar in; the parry window flares it white; 睚眥必報 adds red
// corner brackets
const XH = { stage: 0, stance: false, parry: false, venge: false, flashT: 0, cutT: 0 };
registerCrosshair('xh_blade', {
  state: () => `${XH.stage}${XH.stance ? 's' : ''}${XH.parry ? 'p' : ''}${XH.venge ? 'v' : ''}${XH.flashT > 0 ? 'f' : ''}${XH.cutT > 0 ? 'c' : ''}`,
  draw(gap, c) {
    const k = XH.stance ? 1 - 0.12 * XH.stage : 1, R0 = (7 + gap * 0.5) * k, L = 13 * k + (XH.cutT > 0 ? 3 : 0);
    const col = XH.parry || XH.flashT > 0 ? '#ffffff' : c;
    // the scar: a thin lens, tapered both ends, a hair of tilt
    const scar = (s) => `M${s * R0} 0.4 Q${s * (R0 + L * 0.5)} ${-1.9} ${s * (R0 + L)} ${s > 0 ? -1.6 : 1.2} Q${s * (R0 + L * 0.5)} 1.6 ${s * R0} 0.4 Z`;
    const dots = `<circle class="a" cx="${-R0 * 0.7}" cy="${-R0 * 0.7 - 3}" r="1.5" fill="${col}"/><circle class="a" cx="${R0 * 0.7}" cy="${R0 * 0.7 + 3}" r="1.5" fill="${col}"/>`;
    const ticks = XH.stance ? [0, 1, 2].map((i) => `<path d="M${-8 + i * 8} ${R0 + 9} l2.4 -3.2 l2.4 3.2" fill="none" stroke="${i < XH.stage ? '#ff3a2a' : c}" stroke-width="${i < XH.stage ? 2.2 : 1.2}" opacity="${i < XH.stage ? 1 : 0.35}"/>`).join('') : '';
    const br = XH.venge ? [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => `<path d="M${sx * (R0 + L + 3)} ${sy * 6} V${sy * 11} H${sx * (R0 + L - 3)}" fill="none" stroke="#ff2a1a" stroke-width="1.6"/>`).join('') : '';
    const flare = XH.flashT > 0 ? `<path d="M0 -15 L1.6 -2 L15 0 L1.6 2 L0 15 L-1.6 2 L-15 0 L-1.6 -2 Z" fill="#ffd8b0" opacity="0.9"/>` : '';
    return `${flare}<path class="a" d="${scar(-1)} ${scar(1)}" fill="${col}" stroke="${col}" stroke-width="0.6"/>${dots}${ticks}${br}`;
  },
  nodes: 22,
});

// km_yazi: a sword cut slits a black field open (beat 1), the 睚眥 profile rises out of the slit in vermilion and red
// gold -- horn, flame brow, snarl, fangs (2), full glow (3), the ruby eye 點睛 with a ding (4); headshot: a cross-star
// and a ring off the eye
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const seg = (t, a, b) => ease((t - a) / (b - a));
registerKillMark('km_yazi', {
  draw(ctx, S, t, o) {
    const c = S / 2, R0 = S * 0.44, lw = S * 0.028, gold = o.gold ? '#ffd56a' : '#d9a548', k = R0 / 100;
    const p1 = seg(t, 0, 0.45), p2 = seg(t, 0.45, 0.8), p3 = seg(t, 0.8, 1.0), p4 = seg(t, 1.0, 1.15);
    ctx.clearRect(0, 0, S, S);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // the cut runs corner to corner and opens a black almond (beat 1)
    const ax = c - R0 * 0.95, ay = c + R0 * 0.62, bx = c + R0 * 0.95, by = c - R0 * 0.62, open = R0 * 1.15 * p1;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(c - open * 0.55, c - open * 0.85, bx, by);
    ctx.quadraticCurveTo(c + open * 0.55, c + open * 0.85, ax, ay);
    ctx.closePath();
    const bg = ctx.createRadialGradient(c, c, R0 * 0.1, c, c, R0);
    bg.addColorStop(0, '#2e0707'); bg.addColorStop(0.65, '#100303'); bg.addColorStop(1, '#000000');
    ctx.globalAlpha = 0.96; ctx.fillStyle = bg; ctx.fill();
    ctx.globalAlpha = 1; ctx.strokeStyle = 'rgba(255,60,40,' + (0.5 * p1) + ')'; ctx.lineWidth = lw * 0.35; ctx.stroke();
    ctx.clip();
    // the 睚眥 in profile (facing right) rises out of the slit (beat 2), in layers like the sculpted head: a gold flame
    // mane and the swept antler horn behind, the blackened-bronze skull (lit from above), a paler snout plate with the
    // snarl's ridges, the open jaw (a dark red throat, the ivory fang rows), a gold flame brow, a cheek scroll, a whisker;
    // a gold-leaf shimmer runs along the outline at t 0.9 -> 1.0
    if (p2 > 0) {
      ctx.save();
      ctx.translate(c + 4 * k, c + 6 * k + R0 * 0.45 * (1 - p2)); ctx.globalAlpha = Math.min(1, p2 * 1.4);
      const P = (pts) => { const pa = new Path2D(); pts.forEach(([x, y], i) => (i ? pa.lineTo(x * k, y * k) : pa.moveTo(x * k, y * k))); pa.closePath(); return pa; };
      const goldG = (y0, y1) => { const gg = ctx.createLinearGradient(0, y0 * k, 0, y1 * k); gg.addColorStop(0, o.gold ? '#fff4c2' : '#ffe39a'); gg.addColorStop(0.45, gold); gg.addColorStop(1, '#6e420e'); return gg; };
      const ink = (pa, w = 0.22) => { ctx.strokeStyle = '#1c0c04'; ctx.lineWidth = lw * w; ctx.stroke(pa); };
      // flame tongue: from a root (x, y) of half-width w sweeping by (dx, dy), a curl at the tip
      const flame = (x, y, dx, dy, w) => {
        const pa = new Path2D();
        pa.moveTo(x * k, (y - w) * k);
        pa.bezierCurveTo((x + dx * 0.35) * k, (y - w * 1.6 + dy * 0.2) * k, (x + dx * 0.8) * k, (y + dy * 0.6 - w) * k, (x + dx) * k, (y + dy) * k);
        pa.bezierCurveTo((x + dx * 0.75) * k, (y + dy * 0.75 + w * 0.2) * k, (x + dx * 0.4) * k, (y + dy * 0.2 + w * 1.2) * k, x * k, (y + w) * k);
        pa.closePath();
        return pa;
      };
      // mane (behind): five tongues off the back of the skull
      for (const [x, y, dx, dy, w] of [[-26, -24, -40, -18, 6], [-36, -12, -44, -6, 7], [-40, 2, -46, 6, 7], [-36, 14, -40, 16, 6], [-26, 22, -30, 22, 5]]) {
        const pa = flame(x, y, dx, dy, w);
        ctx.fillStyle = goldG(y - 14, y + 14); ctx.fill(pa); ink(pa, 0.2);
      }
      // the antler horn swept back over the mane: a tapered gold body, a tine, ridge rings
      const horn = new Path2D();
      horn.moveTo(-14 * k, -34 * k); horn.bezierCurveTo(-26 * k, -52 * k, -46 * k, -56 * k, -64 * k, -46 * k);
      horn.bezierCurveTo(-46 * k, -48 * k, -30 * k, -42 * k, -2 * k, -30 * k); horn.closePath();
      const tine = P([[-38, -50], [-35, -63], [-30, -49]]);
      ctx.fillStyle = goldG(-74, -30); ctx.fill(tine); ink(tine, 0.18); ctx.fill(horn); ink(horn, 0.22);
      ctx.strokeStyle = 'rgba(40,18,4,0.8)'; ctx.lineWidth = lw * 0.16;
      for (const [x, y] of [[-22, -42], [-31, -47], [-41, -49], [-51, -49]]) { ctx.beginPath(); ctx.moveTo(x * k, (y - 3.5) * k); ctx.lineTo((x + 2) * k, (y + 3.5) * k); ctx.stroke(); }
      // the skull: blackened bronze, rubbed warm on the crown and the snout
      const head = P([[-44, -14], [-30, -28], [-12, -34], [8, -31], [24, -25], [40, -21], [54, -17], [59, -10], [55, -4], [30, -4], [12, 0], [34, 8], [46, 12], [48, 20], [30, 24], [10, 24], [-12, 27], [-34, 22], [-48, 8]]);
      const br = ctx.createLinearGradient(0, -36 * k, 0, 28 * k); br.addColorStop(0, '#9a7448'); br.addColorStop(0.3, '#4e3a28'); br.addColorStop(0.75, '#22170f'); br.addColorStop(1, '#0d0806');
      ctx.fillStyle = br; ctx.fill(head);
      // the snout plate (paler bronze) with the snarl's ridges; the cheek scroll in gold
      const snout = P([[10, -28], [26, -24], [42, -20], [55, -16], [57, -9], [40, -10], [24, -12], [12, -16]]);
      const sg = ctx.createLinearGradient(0, -28 * k, 0, -8 * k); sg.addColorStop(0, '#c09060'); sg.addColorStop(1, '#5a4028');
      ctx.fillStyle = sg; ctx.fill(snout); ink(snout, 0.14);
      ctx.strokeStyle = '#2a1a0c'; ctx.lineWidth = lw * 0.22;
      for (const x of [30, 36, 42]) { ctx.beginPath(); ctx.moveTo(x * k, -22 * k); ctx.quadraticCurveTo((x + 2.5) * k, -17 * k, (x + 1) * k, -12 * k); ctx.stroke(); }
      ctx.strokeStyle = gold; ctx.lineWidth = lw * 0.3;
      ctx.beginPath(); ctx.moveTo(-6 * k, 6 * k); ctx.bezierCurveTo(-24 * k, 2 * k, -26 * k, 18 * k, -14 * k, 18 * k); ctx.bezierCurveTo(-6 * k, 18 * k, -8 * k, 10 * k, -14 * k, 11 * k); ctx.stroke();
      // the open jaw: a dark red throat, a tongue, the fang rows (ivory, inked)
      const mouth = P([[54, -4], [30, -4], [12, 0], [34, 8], [45, 11]]);
      const mg = ctx.createLinearGradient(12 * k, 0, 54 * k, 0); mg.addColorStop(0, '#120102'); mg.addColorStop(1, '#5a0610');
      ctx.fillStyle = mg; ctx.fill(mouth);
      ctx.strokeStyle = '#b8202a'; ctx.lineWidth = lw * 0.5; ctx.beginPath(); ctx.moveTo(18 * k, 2 * k); ctx.quadraticCurveTo(32 * k, 6 * k, 40 * k, 2 * k); ctx.stroke();
      const fang = (x, y, d, L, w = 2.4) => { const pa = P([[x - w, y], [x - w * 0.2, y + d * L], [x + w, y]]); ctx.fillStyle = '#f2e6c8'; ctx.fill(pa); ink(pa, 0.12); };
      for (const [x, L] of [[52, 10], [46, 5], [41, 4.5], [36, 4], [31, 3.5]]) fang(x, -4, 1, L, x === 52 ? 2.8 : 2);
      for (const [x, L] of [[43, 9], [37, 4.5], [32, 4], [27, 3.5]]) fang(x, x === 43 ? 10.5 : 7 + (x - 27) * 0.1, -1, L, x === 43 ? 2.6 : 1.9);
      // the comma nostril, the lip line
      ctx.fillStyle = '#120804'; ctx.beginPath(); ctx.ellipse(52 * k, -12.5 * k, 2.2 * k, 1.4 * k, -0.4, 0, Math.PI * 2); ctx.fill();
      // the gold flame brow over the eye, the whisker from the upper lip
      const brow = new Path2D();
      brow.moveTo(30 * k, -23 * k); brow.bezierCurveTo(22 * k, -32 * k, 6 * k, -34 * k, -10 * k, -44 * k); brow.lineTo(-2 * k, -36 * k); brow.lineTo(-12 * k, -36 * k);
      brow.bezierCurveTo(2 * k, -30 * k, 14 * k, -26 * k, 24 * k, -21 * k); brow.closePath();
      ctx.fillStyle = goldG(-44, -21); ctx.fill(brow); ink(brow, 0.18);
      ctx.strokeStyle = gold; ctx.lineWidth = lw * 0.28;
      ctx.beginPath(); ctx.moveTo(38 * k, -5 * k); ctx.bezierCurveTo(30 * k, 6 * k, 22 * k, 30 * k, 2 * k, 36 * k); ctx.stroke();
      ctx.strokeStyle = gold; ctx.lineWidth = lw * 0.42; ctx.stroke(head);
      // the eye socket (the ruby lights in it at beat 3)
      ctx.fillStyle = '#160a06'; ctx.beginPath(); ctx.ellipse(14 * k, -19 * k, 7.6 * k, 4.4 * k, -0.15, 0, Math.PI * 2); ctx.fill();
      // gold-leaf shimmer: a bright band runs along the outline, the horn and the brow (t 0.9 -> 1.0)
      const sh = t >= 0.9 && t <= 1.02 ? (t - 0.9) / 0.12 : -1;
      if (sh >= 0) {
        const x0 = (-80 + 140 * sh) * k, gg = ctx.createLinearGradient(x0 - 22 * k, -10 * k, x0 + 22 * k, 10 * k);
        gg.addColorStop(0, 'rgba(255,240,190,0)'); gg.addColorStop(0.5, 'rgba(255,248,220,0.95)'); gg.addColorStop(1, 'rgba(255,240,190,0)');
        ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = gg; ctx.lineWidth = lw * 0.7;
        ctx.stroke(head); ctx.stroke(horn); ctx.stroke(brow);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
    }
    ctx.restore();
    // the cut line itself (beat 1): a white core in a blood halo, fading as the head rises
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const L = p1, ex = ax + (bx - ax) * L, ey = ay + (by - ay) * L;
    ctx.strokeStyle = '#ff2a1a'; ctx.lineWidth = lw * 1.8; ctx.globalAlpha = 0.7 * (1 - p2 * 0.7);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = lw * 0.45; ctx.globalAlpha = 1 - p2 * 0.8; ctx.stroke();
    ctx.restore();
    // beats 3-4: the ruby eye lights and flares (點睛); headshot: a cross-star and a ring off it
    const eX = c + 4 * k + 14 * k, eY = c + 6 * k - 19 * k + R0 * 0.45 * (1 - p2);
    if (p2 > 0.4) {
      // the faceted ruby: a hot core to a deep rim, a slit pupil, a glint
      ctx.save(); ctx.globalAlpha = Math.min(1, (p2 - 0.4) * 2.5);
      const rg = ctx.createRadialGradient(eX + 1.2 * k, eY - 0.8 * k, 0.3 * k, eX, eY, 6.6 * k);
      rg.addColorStop(0, '#ffb070'); rg.addColorStop(0.3, '#ff2a1a'); rg.addColorStop(0.75, '#a0000e'); rg.addColorStop(1, '#3a0006');
      ctx.fillStyle = rg; ctx.shadowColor = '#ff2a1a'; ctx.shadowBlur = S * 0.02 + S * 0.05 * (p3 + Math.sin(Math.PI * p4));
      ctx.beginPath(); ctx.ellipse(eX, eY, 6.6 * k, 3.5 * k, -0.15, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = '#1a0002'; ctx.beginPath(); ctx.ellipse(eX + 0.6 * k, eY, 0.9 * k, 2.9 * k, -0.15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff2e0'; ctx.globalAlpha *= 0.5 + 0.5 * p3; ctx.beginPath(); ctx.ellipse(eX + 2.4 * k, eY - 1.3 * k, 1.5 * k, 0.9 * k, -0.3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    const fl = Math.sin(Math.PI * p4) + (o.head ? Math.max(0, 1 - Math.abs(t - 1.1) / 0.08) * 0.8 : 0);
    if (fl > 0.01) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = '#ffffff'; ctx.shadowColor = '#ff2a1a'; ctx.shadowBlur = S * 0.05; ctx.lineWidth = lw * 0.35; ctx.globalAlpha = Math.min(1, fl);
      const Lr = S * 0.03 * (1.6 + fl * (o.head ? 3.6 : 2));
      ctx.beginPath(); ctx.moveTo(eX - Lr, eY); ctx.lineTo(eX + Lr, eY); ctx.moveTo(eX, eY - Lr * 0.7); ctx.lineTo(eX, eY + Lr * 0.7);
      if (o.head) { const q = Lr * 0.45; ctx.moveTo(eX - q, eY - q); ctx.lineTo(eX + q, eY + q); ctx.moveTo(eX + q, eY - q); ctx.lineTo(eX - q, eY + q); }
      ctx.stroke(); ctx.restore();
    }
    if (o.head && t > 1.0) {
      const u = Math.min(1, (t - 1.0) / 0.17);
      ctx.save(); ctx.globalAlpha = 1 - u; ctx.strokeStyle = '#ff3a2a'; ctx.lineWidth = lw * 0.35;
      ctx.beginPath(); ctx.arc(eX, eY, S * 0.02 + S * 0.35 * u, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
  },
});
// KE_SOUL kill: a thin crimson rim over a darkened body (the soul leaving it), never a white or orange flash
SHELL.soulkill = { col: [2.2, 0.14, 0.08], amt: 0.42, fres: 1, exp: 4.6, char: 0.4, prio: 9, decay: true };
// soulrend skin (一閃 at full, the ult, the reflect): big white numbers bleeding to blood red on a dark-red edge
SKINS.soulrend = ['#ffffff', '#fff0ea', '#ff5a48', '#5a0008'];

// QA / pose tuning (dev): the rest poses, the stance, the orientation helper
const DEV = { IDLE, STANCE, bq, N3, ULT, setIdle(H, p, d, m) { IDLE[H] = { p, d: N3(...d), m: N3(...m) }; IDLE_Q[H] = bq(IDLE[H].d, IDLE[H].m); } };

export { SFX as YAZI_SFX };
