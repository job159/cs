// 星河．斬嶽 Xinghe Peakcleaver — 神兵 X02 energy greatsword (docs/PREMIUM_WEAPONS.md §2.29; def in defs.js, model
// tools/assets/weapons/starsword.mjs, FX pieces starsword_fx.js). A premium melee: the special drives its own attacks
// (Arsenal._melee -> special.melee), the skills run on the specials v2 engine.
//   LMB tap   星流三式: 橫流 (right -> left sweep 110) -> 逆流 (rising diagonal 110) -> 迴天 (a whole-body wheel 170,
//             360°, knock 6); every target in the arc is hit; 0.45 s chain window; 收招 after the third (1 in 8 rare:
//             the tip planted in the street). A swing that connects: 50-90 ms hit-stop, shake, camera punch, the trail's
//             tail turns nebula violet (§1.17), sparks + a starlight slash on the body, heavy kills sever (SEVER).
//   LMB hold  墜星: the sword goes up overhead; 3 stages at 0.6 / 1.2 / 1.8 s (FOV -1° and a darker frame a stage,
//             the cloud-head guard spreads, at stage 3 the energy edge flares x1.4); release = a slam 2.2 m ahead
//             (160 -> 450, r 2.2 -> 3.5) and a 星痕 wave running along the ground (24 m/s, 2.4 m wide, 6 -> 16 m, 100 ->
//             300 piercing): the street splits behind it and the cracks glow with starlight; rubble, dust, decals
//   RMB held  鎮河 guard: -70 % from the front 140°, no shove, x0.65 speed; hit within 0.4 s of raising it = perfect
//             guard (0 damage, +15 星能, a bell) -> 迴瀾 counter slash 260 in 4 m / 200°
//   Q tap     橫天 (40 星能): the energy edge projects into a 9 m blade (drawn in the viewmodel layer) that sweeps 220°;
//             360 each, knock 7; a world arc ribbon for everyone
//   Q held    天劍 (ult, 6,000 damage): 5 beats -- the sword raised to the sky (CARD, a beam from the tip), a 北斗
//             star-map sigil, a starlight pillar and a 14 m glazed star sword falling tip-first, impact 900 in 7 m,
//             three pulses (220 in 8 m, pulling in) as the seven stars on it light in turn, it shatters into star dust;
//             星輝: +10 % team damage within 8 m for 6 s
//   kill      KE_STARCUT: a starlight cut line across the body, stars rising; the wave's last kill: a mini 天劍 (KE_FINAL)
//   crisis    星屏 (crisis.js): seven star shards orbit the player and burst
// Sound cues (§1.12, produced later): see SFX; a missing cue falls back to an existing sample or stays silent.
import * as THREE from 'three';
import { registerSpecial, registerSkill, startSkill, meterEvent, canCast, addAura, paletteOf } from '../specials.js';
import { registerClip } from '../../player/clips.js';
import { registerCrosshair } from '../../ui/crosshairs.js';
import { registerKillMark } from '../../ui/killmarks.js';
import { SKINS } from '../../ui/dmgnums.js';
import { FRAME, DECAL, DECAL_TINT } from '../../fx/fx.js';
import { clipComfort, haptic } from '../arsenal.js';
import { giantBlade, waveGeometry, waveMaterial, crackMesh, cutMesh, heavenSwordGeometry, arcBand } from './starsword_fx.js';

const ID = 'starsword';
const STARW = [5.4, 5.9, 7.0];      // white-hot starlight core
const BLUE = [0.9, 1.8, 4.6];       // star blue (#bcd2ff body)
const VIOLET = [2.4, 0.9, 3.6];     // nebula violet (#c66bff)
const GOLD = [3.4, 2.4, 0.9];
const MOTE = [3.2, 3.0, 2.4];       // #fff6d8 star points
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
  starsword_draw: 'draw', starsword_draw_first: 'drawHeavy', starsword_first_sting: null, starsword_star: 'xh_node',
  starsword_swing: 'swingHeavy', starsword_swing_light: 'swing', starsword_wheel: 'swingHeavy', starsword_hit: 'melee_heavy_hit',
  starsword_hit_flesh: 'knife_hit_flesh', starsword_hit_ring: null, starsword_hit_wall: 'knife_hit_wall', starsword_kill: null, starsword_sever: 'gib',
  starsword_charge: null, starsword_charge_stage: 'xh_node', starsword_charge_full: null, starsword_slam: 'explosion_small', starsword_crack: 'debris_fall',
  starsword_wave: null, starsword_guard_up: 'knife_hit_wall', starsword_block: 'impact_metal', starsword_parry: 'bifang_bell', starsword_counter: 'swingHeavy',
  starsword_skyspan_charge: null, starsword_skyspan: 'swingHeavy', starsword_skyspan_end: 'impact_glass',
  starsword_ult_rise: null, starsword_ult_sigil: 'bifang_bell', starsword_ult_fall: null, starsword_ult_impact: 'explosion_large',
  starsword_ult_pulse: 'explosion_far', starsword_ult_shatter: 'impact_glass', starsword_ult_bed: null, ready_starsword: null,
  starsword_idle: null, starsword_inspect: 'cloth', starsword_crisis: 'impact_glass', starsword_final: 'explosion_far', starsword_recover: 'cloth',
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
  return ws.sp.ss || (ws.sp.ss = {
    mode: 'idle', t: 0, cur: null, step: -1, hit: false, chainT: 0, buf: 0, pressing: false, pressT: 0, fresh: true,
    ct: 0, stage: 0, slamStage: 0, lockT: 0, recoverT: 0, combos: 0, guard: null, guardEnd: -9, counter: null,
    q: [], view: { w: null }, hum: null, chargeSnd: null, readyN: false, readyT: 0, chaseT: -1, finalWave: -1,
  });
}
function later(ws, sec, fn) { ssOf(ws).q.push([sec, fn]); }
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
// waves (星痕), crack meshes, kill cuts, the giant blade mesh, the guard damage filter
function sys(g) {
  if (g._ss) return g._ss;
  const S = g._ss = { waves: [], cracks: [], cuts: [], cutPool: [], arcs: [], gtrails: [], update: (dt) => sysUpdate(g, S, dt) };
  // the kill-cut pool (KE_STARCUT: at most 3 alive per player)
  for (let i = 0; i < 3; i++) { const m = cutMesh(); m.visible = false; g.scene.add(m); S.cutPool.push(m); }
  g.systems.push(S);
  return S;
}
/** a swept arc band (迴天 ring, 橫天 sweep): head 0 -> 1 between t0 and t1, then the wake fades out */
function sweepArc(g, pos, yaw, o, { t0 = 0, t1 = 0.3, span = 0.35, fade = 0.25, dur = null, amt = 0.6 } = {}) {
  const S = sys(g), mesh = arcBand(o);
  mesh.position.copy(pos); mesh.rotation.y = yaw;
  mesh.material.uniforms.uSpan.value = span;
  g.scene.add(mesh);
  const a = { mesh, t: 0, t0, t1, fade, amt, dur: dur ?? t1 + fade + span * (t1 - t0) };
  S.arcs.push(a);
  return a;
}
function sysUpdate(g, S, dt) {
  // giant-blade trails: the posed blade's points in camera space (socketCam's chain), root at `from`, tip at 0.97
  for (let i = S.gtrails.length - 1; i >= 0; i--) {
    const t = S.gtrails[i], vm = g.vm, gm = t.gm, w = vm?.weapon;
    if (t.r.stopped || !w || gm.parent !== w.root) { t.r.stop(); S.gtrails.splice(i, 1); continue; }
    const L = gm.material.uniforms.uLen.value, toCam = (v) => v.applyMatrix4(w.root.matrix).applyMatrix4(vm.gunRoot.matrix).applyMatrix4(vm.container.matrix);
    t.r.push(toCam(_e.set(0, gm.position.y + L * t.from, 0)), toCam(_f.set(0, gm.position.y + L * 0.97, 0)));
  }
  for (let i = S.arcs.length - 1; i >= 0; i--) {
    const a = S.arcs[i], u = a.mesh.material.uniforms;
    a.t += dt;
    const k = clamp((a.t - a.t0) / (a.t1 - a.t0), 0, 1);
    u.uHead.value = k * (1 + u.uSpan.value);          // runs on past the end so the wake drains away
    u.uAmt.value = a.amt * (a.t < a.t0 ? 0 : a.t > a.t1 ? Math.max(0, 1 - (a.t - a.t1) / a.fade) : 1);
    if (a.t >= a.dur) { a.mesh.removeFromParent(); a.mesh.geometry.dispose(); a.mesh.material.dispose(); S.arcs.splice(i, 1); }
  }
  // ---- cracks: lit as the wave front passes, then cool and fade
  for (let i = S.cracks.length - 1; i >= 0; i--) {
    const c = S.cracks[i];
    c.t += dt;
    const u = c.mesh.material.uniforms;
    if (c.wave) u.uFront.value = c.wave.dist + 0.2; else u.uFront.value = Math.min(c.len + 2, c.t * (c.speed || 40));
    const fade = c.t < c.life - 1.2 ? 1 : Math.max(0, (c.life - c.t) / 1.2);
    u.uFade.value = fade;
    if (c.t >= c.life) { c.mesh.removeFromParent(); c.mesh.geometry.dispose(); c.mesh.material.dispose(); S.cracks.splice(i, 1); }
  }
  // ---- kill cuts
  for (let i = S.cuts.length - 1; i >= 0; i--) {
    const c = S.cuts[i];
    c.t += dt;
    const u = c.mesh.material.uniforms;
    u.uT.value = Math.min(1, c.t / 0.1);
    u.uFade.value = c.t < 0.18 ? 1 : Math.max(0, 1 - (c.t - 0.18) / 0.24);
    if (c.z) c.mesh.position.copy(c.z.pos).add(c.off);
    if (c.t >= 0.42) { c.mesh.visible = false; S.cuts.splice(i, 1); }
  }
}

// ------------------------------------------------------------------------------------------ hits
const SEVER_HI = ['neck', 'neck', 'upperarm_l', 'upperarm_r'], SEVER_MID = ['upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r'], SEVER_ARM = ['upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r'];
/**
 * One blow on a zombie (local player): damage + HUD + meters; returns the result. `skill` tags a skill's own hits
 * (info.skill: the star damage skin, and they never refund 星能 -- the meter is earned by sword strokes, 每刀; the
 * ult meter still fills from their damage). `light`: a light swing that kills with > 60 % overkill takes an arm.
 */
function strike(ws, g, z, dmg, dir, { knock = 3, stagger = 0.6, sever = null, elem = null, point = null, tag = 'swing', head = false, skill = null, light = false } = {}) {
  const ar = g.arsenal;
  const p = point || z.center(V3());
  const amount = dmg * (ar?.dmgMul ?? 1) * (head ? ws.def.head ?? 1.5 : 1), hp0 = z.hp ?? 0;
  // dismemberment only where the blow would take the limb / head (zombies.js SEVER rules decide; a kill forces it)
  let box = sever && amount >= hp0 * 0.98 ? (head ? 'neck' : sever[(R() * sever.length) | 0]) : sever && amount > (z.maxHp ?? 999) * 0.45 && R() < 0.35 ? SEVER_MID[(R() * 4) | 0] : undefined;
  if (!box && head && amount >= hp0) box = 'neck';
  if (!box && light && hp0 > 0 && amount >= hp0 * 1.6) box = SEVER_ARM[(R() * 4) | 0];
  const info = { amount, part: head ? 'head' : 'body', headshot: head, point: p, normal: dir.clone().negate(), dir: dir.clone(), knock: knock * (ar?.knockMul ?? 1), stagger,
    weapon: ID, shooter: g.localId, melee: true, box, elem, ss: tag };
  if (skill) info.skill = skill;
  const star0 = skill ? ws.sp?.m?.star : undefined;
  const res = z.damage(info);
  g.hud?.onHit?.(info, res, z);
  ar?._special?.(ws, 'onHit', info, res, z);
  if (star0 !== undefined && ws.sp.m.star > star0) ws.sp.m.star = star0;
  if (res?.killed) {
    if (box) { z.sever?.(box, dir); sfx(g, 'starsword_sever', { pos: p, volume: 0.7 }); }
    launch(z, dir, tag);
  }
  return res;
}
/**
 * Greatsword kill weight: the body is thrown (up and along the blow, a horizontal cleave carries it sideways) and
 * starts to fall at once -- the death clip skips its upright first beat and plays fast (no standing corpses sliding).
 */
function launch(z, dir, tag) {
  if (!z.kvel || z.def?.boss) return;
  const heavy = tag !== 'flow' && tag !== 'counterflow', push = heavy ? 4.5 : 3, up = heavy ? 4.6 : 3.4;
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
    // a signed side: + = to the right of the view (the sweep order)
    const side = (fwd.x * dz - fwd.z * dx) < 0 ? 1 : -1;
    out.push({ z, d, ang, side, zc });
  }
  return out;
}

// where the blade crosses each target, relative to the eye: [height at the eye, rise per side (+ = higher on the
// right)]; at or above the neck the cut is a head hit (head damage, the decapitation, the headshot kill feedback)
const BLADE_Y = { flow: [-0.2, 0], counterflow: [-0.32, 0.38], heavenwheel: [-0.42, 0], counter: [-0.16, 0] };
/** a combo / counter swing connecting: everything in the arc; one swing sound, a flesh layer per body, a kill per kill */
function sweep(ws, g, c) {
  const eye = _d.copy(g.camera.position), fwd = eyeFwd(g, _e, V3());
  const list = inSector(g, eye, fwd, c.r, c.arc);
  const look = g.camera.getWorldDirection(V3()), tanP = Math.tan(Math.asin(clamp(look.y, -0.95, 0.95))), [by, rise] = BLADE_Y[c.id] || [-0.25, 0];
  let kills = 0, n = 0, heads = 0, first = null;
  list.sort((a, b) => a.ang - b.ang);   // the one nearest the crosshair first (its flash / sound lead)
  for (const { z, zc, side, d } of list) {
    // push away and along the sweep (right -> left swings carry them left)
    const dir = V3().subVectors(zc, eye).setY(0).normalize();
    const tan = V3().crossVectors(UP, dir).multiplyScalar(c.sweepDir ?? 0);
    dir.addScaledVector(tan, 0.6).normalize();
    const bladeY = eye.y + by + tanP * d + rise * side * Math.min(1, d / 2.2);
    const head = !z.def?.boss && bladeY >= z.pos.y + (z.height ?? 1.8) * 0.8;
    const res = strike(ws, g, z, c.dmg, dir, { knock: c.knock, stagger: c.stagger, sever: c.heavy ? SEVER_HI : null, tag: c.id, head, light: !c.heavy, elem: c.id === 'counter' ? 'star' : null });
    n++; if (head) heads++;
    if (res?.killed) {
      kills++;
      // a pack cut down together: one body flashes, the rest only take the star cut (no white crowd)
      if (kills > 1) z.zfx?.clearStatus?.(z, 'starkill');
    }
    if (!first) first = zc.clone();
    hitSpark(g, zc, dir, c.heavy ? 1.3 : 1);
    if (n <= 3) sfx(g, 'starsword_hit_flesh', { pos: zc, volume: 0.75 - n * 0.1, pitch: 0.9 + R() * 0.22, delay: (n - 1) * 0.015 });
    if (res?.killed && kills <= 2) sfx(g, 'starsword_kill', { pos: zc, volume: 0.6, delay: (kills - 1) * 0.04 });
  }
  const ar = g.arsenal;
  if (n) {
    ar?._trailHit?.();                                    // §1.17 the rest of the swing burns violet
    stop(g, kills >= 2 || (heads && kills) ? 0.1 : c.heavy ? 0.09 : 0.05);
    shake(g, (c.heavy ? 0.3 : 0.12) + Math.min(0.2, n * 0.03));
    g.punch?.impulse?.((c.heavy ? -1.6 : -0.9) * 0.0175, (c.sweepDir ?? 0) * 0.9 * 0.0175, (c.sweepDir ?? 0) * 1.2 * 0.0175);
    g.vm?.kick?.({ back: 0.02, up: c.heavy ? 3 : 1.8, side: 1.2, roll: 2 });
    ar?.fovKick?.(c.heavy ? -2 : -1, 0.16);
    sfx(g, 'starsword_hit', { pos: first, volume: 0.9 });
    sfx(g, 'starsword_hit_ring', { volume: 0.4 });
    haptic(c.heavy ? 40 : 20);
  } else wallClang(ws, g, eye, fwd, c.r);
  return n;
}
/** a swing that met no zombie but a wall within reach: sparks and a clang */
function wallClang(ws, g, eye, fwd, r) {
  const d = _c.copy(fwd); d.y = -0.15; d.normalize();
  const wh = g.world?.collision?.raycast(eye, d, r * 0.85);
  if (!wh) return;
  g.fx?.impact?.(wh.surf, wh.point, wh.normal, d, { big: 0.8 });
  g.fx?.sparkBurst?.(wh.point, { color: STARW, color1: BLUE, count: 12, speed: 5, glow: 0.4, normal: wh.normal });
  sfx(g, 'starsword_hit_wall', { pos: wh.point });
  shake(g, 0.08);
  haptic(14);
}
/** sparks + a starlight slash streak where the blade meets a body */
function hitSpark(g, p, dir, k = 1) {
  const P = g.fx?.particles;
  if (!P) return;
  for (let i = 0; i < 10 * k; i++) {
    _c.set(R() - 0.5, R() * 0.8 - 0.2, R() - 0.5).multiplyScalar(5).addScaledVector(dir, 3);
    P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, vx: _c.x, vy: _c.y, vz: _c.z, life: 0.25 + R() * 0.25, size: 0.025, stretch: 0.025, color: [...STARW, 1], color1: [...VIOLET, 0], frame: FRAME.spark, gravity: 6, drag: 2 });
  }
  P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.12, size: 0.35 * k, size1: 0.55 * k, color: [0.9, 1.3, 2.6, 1], color1: [0, 0, 0, 0], frame: FRAME.glint, rot: R() * 6 });
  P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.16, size: 0.25 * k, size1: 0.5 * k, color: [0.5, 0.6, 1.2, 0.6], color1: [0, 0, 0, 0], frame: FRAME.glow });
}

/** KE_STARCUT: a starlight cut across the body along the blow, star points rising (≤ 3 cuts alive) */
function starCut(g, z, dir) {
  const S = sys(g), cam = g.camera, c = z.center(V3());
  const m = S.cutPool.find((x) => !x.visible) || S.cuts.shift()?.mesh;
  if (m) {
    const L = 1.1 + R() * 0.4, ang = (R() - 0.5) * 1.2 + (dir.x * cam.matrixWorld.elements[0] + dir.z * cam.matrixWorld.elements[2] > 0 ? 0.35 : -0.35);
    m.quaternion.copy(cam.quaternion).multiply(_q.setFromAxisAngle(_d.set(0, 0, 1), ang));
    _e.set(1, 0, 0).applyQuaternion(m.quaternion);
    m.position.copy(c).addScaledVector(_e, -L / 2);
    m.scale.set(L, 0.16, 1);
    m.visible = true;
    S.cuts.push({ mesh: m, t: 0, z, off: m.position.clone().sub(z.pos) });   // rides on the body as it is thrown
  }
  const P = g.fx?.particles;
  for (let i = 0; i < 9; i++) {
    const a = R() * 6.28, r = R() * 0.35;
    P?.spawn({ additive: true, x: c.x + Math.cos(a) * r, y: c.y - 0.3 + R() * 0.8, z: c.z + Math.sin(a) * r, vx: (R() - 0.5) * 0.5, vy: 0.7 + R() * 1.3, vz: (R() - 0.5) * 0.5, delay: 0.12 + R() * 0.25,
      life: 0.7 + R() * 0.6, size: 0.05 + R() * 0.05, size1: 0.01, color: [...MOTE, 1], color1: [...VIOLET, 0], frame: i % 3 ? FRAME.glow : FRAME.glint, drag: 1.4, spin: (R() - 0.5) * 4 });
  }
  P?.spawn({ additive: true, x: c.x, y: c.y, z: c.z, life: 0.22, size: 1.4, size1: 2.2, color: [...BLUE, 0.9], color1: [0, 0, 0, 0], frame: FRAME.glint, rot: R() * 6 });
  g.fx?.lights?.flash?.(c, '#8fb0ff', 1.6, 2, 0.1);
}

// ------------------------------------------------------------------------------------------ the sword's life (view)
function view(ws, g, dt) {
  const vm = g.vm, w = vm?.weapon, ss = ssOf(ws), ar = g.arsenal;
  if (!w?.parts?.fx_edge || w.def !== ws.def) return;
  const v = ss.view;
  if (v.w !== w) {
    if (v.giant) { v.giant.removeFromParent(); v.giant.material.dispose(); }
    Object.assign(v, { w, t: 0, open: 0, edge: 1, edgeW: 1, glintT: 1.5, chase: -1, giant: null });
    // the giant blade rides on the gun (viewmodel layer): blade axis +Y from the collar, in the blade plane
    v.giant = giantBlade();
    v.giant.position.set(0, 0.092, 0);
    w.root.add(v.giant);
    for (let i = 1; i <= 7; i++) psOf(vm, 'fx_starglow' + i).hidden = false;
  }
  v.t += dt;
  if (!ss.hum && g.audio?.has?.('starsword_idle')) ss.hum = sfx(g, 'starsword_idle', { loop: true, volume: 0.08, fadeIn: 0.4 });
  const ready = canCast(ws, 'ult').ok, busy = ss.lockT > 0;
  const charging = ss.mode === 'charge', st = charging ? ss.stage : 0, readyIdle = ready && !busy && !charging && !ss.guard?.up;
  // ---- cloud-head guard: spreads a step with every charge stage (full at 3), breathes open while ready, full in skills
  let open = charging ? 0.3 + 0.234 * st : busy ? 1 : ready ? 0.4 + 0.12 * Math.sin(v.t * 2.4) : 0;
  if (ss.guard?.up) open = Math.max(open, 0.5);
  v.open = damp(v.open, open, 10, dt);
  for (const n of ['fx_guardR', 'fx_guardL']) { const p = psOf(vm, n); if (!p.tw) p.v = v.open; }
  // ---- the full energy blade (fx_flare) grows out of the collar at charge stage 3 and in the guard (skills / clips
  // drive their own); ready: it stays faintly lit along the whole edge, a slow white-blue pulse
  const fl = (charging && st >= 3) || ss.guard?.up || readyIdle ? 1 : 0;
  v.flare = damp(v.flare ?? 0, fl, fl ? 9 : 14, dt);
  psOf(vm, 'fx_flare').hidden = v.flare < 0.03;
  w.parts.fx_flare.scale.set(1, Math.max(0.03, v.flare), 1);
  XH.stage = st; XH.guard = !!ss.guard?.up;
  // ---- glow: the edge x1.3 a charge stage, stage 3 a pulsing white-hot core; ready: edge + flare breathe, stars x2
  const G = vm._glowMat;
  v.flashT = Math.max(0, (v.flashT ?? 0) - dt);
  XH.flash = v.flashT > 0.12;
  if (G) {
    const pulse = 0.5 + 0.5 * Math.sin(v.t * (st >= 3 ? 15 : 3.1));
    G.glow_arc = charging ? 1.3 ** st * (st >= 3 ? 1.25 + 0.5 * pulse : 1) : ready ? 1.3 + 0.25 * pulse : 1;
    G.glow_blue = charging || ss.guard?.up ? (st >= 3 ? 1.1 + 0.6 * pulse : 1) : readyIdle ? 0.1 + 0.22 * (0.5 + 0.5 * Math.sin(v.t * 2.2)) : 1;
    G.glow_white = ready ? 2 : charging ? 1 + 0.35 * st : 1;
    if (v.flashT > 0) { const f = v.flashT / 0.3; G.glow_blue *= 1 + 6 * f; G.glow_arc *= 1 + 3 * f; G.glow_white *= 1 + 2 * f; }   // 完美格擋: the whole blade flashes
  }
  if (charging) chargeLife(ws, g, v, st, dt);
  // ---- ready: star dust drifting off the tip, a faint edge light on the gloves (lights the hands from the blade)
  if (readyIdle) {
    if ((v.dustT = (v.dustT ?? 0) - dt) <= 0) {
      v.dustT = 0.22 + R() * 0.2;
      const c = vm.socketCam(R() < 0.6 ? 'tip' : 'mid', _a);
      if (c) g.fx?.particles.spawn({ additive: true, vm: true, x: c.x + (R() - 0.5) * 0.03, y: c.y, z: c.z + (R() - 0.5) * 0.03, vx: (R() - 0.5) * 0.04, vy: 0.05 + R() * 0.05, vz: (R() - 0.5) * 0.04,
        life: 1.1 + R() * 0.5, size: 0.007, size1: 0.001, color: [...MOTE, 1], color1: [...BLUE, 0], frame: FRAME.glint, rot: R() * 6, inertia: 0.5 });
    }
    if ((v.lightT = (v.lightT ?? 0) - dt) <= 0) { v.lightT = 0.11; const p = vm.socketWorld?.('base', _b); if (p) g.fx?.lights?.flash?.(p, '#9fb8ff', 0.9 + 0.5 * Math.sin(v.t * 2.2), 0.9, 0.14); }
  }
  // ---- seven stars: a chase on ready / reminders / first draw (one lights every 0.05 s), else all lit
  if (v.chase >= 0) {
    v.chase += dt;
    const lit = Math.floor(v.chase / 0.05);
    for (let i = 1; i <= 7; i++) psOf(vm, 'fx_starglow' + i).hidden = i > lit;
    if (lit >= 7) v.chase = -1;
  }
  // ---- ready (§1.7.1 beat 7): the stars chase, the guard flicks open, star dust off the tip
  if (ready && !busy) {
    if (!ss.readyN) { ss.readyN = true; ss.readyT = 0; chase(ws, g); dust(g, 10); }
    else if ((ss.readyT += dt) >= 2.5) { ss.readyT = 0; if (g.hud?.settings?.readyReminder !== false) { chase(ws, g); dust(g, 4); } }
  } else ss.readyN = false;
  // ---- idle life: up to 8 star glints drifting off the blade edges
  const idle = ss.mode === 'idle' && !vm.clip.active && !busy;
  if (idle && (v.glintT -= dt) <= 0) {
    v.glintT = 0.4 + R() * 0.8;
    const c = vm.socketCam(['edge_f', 'edge_b', 'mid', 'tip', 'star1', 'star5'][(R() * 6) | 0], _a);
    if (c) g.fx?.particles.spawn({ additive: true, vm: true, x: c.x + (R() - 0.5) * 0.04, y: c.y + (R() - 0.5) * 0.06, z: c.z + (R() - 0.5) * 0.04, vy: 0.03 + R() * 0.03,
      life: 0.9 + R() * 0.6, size: 0.004, size1: 0.001, color: [...MOTE, 1], color1: [...VIOLET, 0], frame: FRAME.glint, rot: R() * 6, inertia: 0.5 });
  }

}
/** the 7 stars light one by one (fx_starglow1..7) */
function chase(ws, g) { const v = ssOf(ws).view; v.chase = 0; for (let i = 1; i <= 7; i++) psOf(g.vm, 'fx_starglow' + i).hidden = true; sfx(g, 'starsword_star', { volume: 0.3 }); }
function dust(g, n) {
  const vm = g.vm;
  for (let i = 0; i < n; i++) {
    const c = vm.socketCam(i % 2 ? 'tip' : 'mid', _a);
    if (c) g.fx?.particles.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, vx: (R() - 0.5) * 0.08, vy: 0.04 + R() * 0.08, vz: (R() - 0.5) * 0.08, delay: i * 0.04,
      life: 0.8, size: 0.005, size1: 0.001, color: [...MOTE, 1], color1: [...BLUE, 0], frame: FRAME.glint, rot: R() * 6, inertia: 0.6 });
  }
}

// ------------------------------------------------------------------------------------------ combo / charge driver
const COMBO_CLIP = ['starsword_flow', 'starsword_counterflow', 'starsword_wheel'];
function startSwing(ws, g, step) {
  const ss = ssOf(ws), c = ws.def.special.combo[step], ar = g.arsenal;
  ss.mode = 'swing'; ss.step = step; ss.cur = c; ss.t = 0; ss.hit = false; ss.chainT = 0;
  ar.sinceShot = 0;
  ar.playClip(COMBO_CLIP[step], { duration: c.dur });
  sfx(g, step === 2 ? 'starsword_wheel' : 'starsword_swing', { volume: 0.9, delay: c.hit * 0.45 });
  g.noise?.(g.camera.position, 12);
}
function startCharge(ws, g) {
  const ss = ssOf(ws), ar = g.arsenal;
  ss.mode = 'charge'; ss.ct = 0; ss.stage = 0; ss.t = 0;
  ar.sinceShot = 0;
  ar.playClip('starsword_charge', { duration: 2.4 });
  g.vm.clip.hold = true;
  ss.chargeSnd = sfx(g, 'starsword_charge', { loop: true, volume: 0.5 });
  ss.chargeSnd?.setRate?.(0.8);
}
function releaseSlam(ws, g) {
  const ss = ssOf(ws), ar = g.arsenal;
  ss.slamStage = ss.stage;
  ss.mode = 'slam'; ss.t = 0; ss.hit = false; ss.fresh = false;
  ss.chargeSnd?.stop?.(0.1); ss.chargeSnd = null;
  ar.fovHold(0, 0.25);
  vignette(g, 0);
  ar.playClip('starsword_slam', { duration: 0.6, stage: ss.stage });
  sfx(g, 'starsword_swing', { volume: 1, pitch: 0.85 });   // (audio.play's playback-rate option is `pitch`)
}
function vignette(g, k) {
  const post = g.renderer?.post;
  if (!post) return;
  if (g._ssVig == null) g._ssVig = post.vignette ?? 0;
  post.vignette = g._ssVig + k;
  if (k === 0) g._ssVig = null;
}

function driver(ws, dt, g) {
  const ss = ssOf(ws), p = ws.def.special, ar = g.arsenal;
  runQueue(ss, dt);
  ss.buf = Math.max(0, ss.buf - dt);
  if (ss.pressing) ss.pressT += dt;
  ss.lockT = Math.max(0, ss.lockT - dt);
  if (ss.mode === 'swing') {
    ss.t += dt;
    const c = ss.cur;
    if (!ss.hit && ss.t >= c.hit) { ss.hit = true; sweep(ws, g, { ...c, sweepDir: ss.step === 1 ? -1 : 1 }); if (c.heavy) wheelRing(ws, g, c.r); }
    if (ss.t >= c.dur) {
      ss.mode = 'recover'; ss.t = 0; ss.chainT = p.chain;
      if (ss.step === 2) {
        // 收招 after the third: shoulder the sword (1 in 8: the tip planted in the street), any input cancels it
        ss.combos++;
        ar.playClip(ss.combos % 8 === 0 ? 'starsword_recover_rare' : 'starsword_recover', { duration: p.recover });
        ss.step = -1;
      }
    }
  } else if (ss.mode === 'recover') {
    ss.t += dt;
    if (ss.chainT > 0 && (ss.chainT -= dt) <= 0) ss.step = -1;
    if (ss.t >= p.recover) ss.mode = 'idle';
  } else if (ss.mode === 'charge') {
    ss.ct += dt;
    g.vm.clip.hold = true;
    const st = p.slam.stages.filter((x) => ss.ct >= x).length;
    if (st > ss.stage) {
      ss.stage = st;
      // stage 2 rings a whole tone up (B6/E7 -> C#7/F#7: the bells stay on the E pentatonic); the full flare unpitched
      sfx(g, st >= 3 ? 'starsword_charge_full' : 'starsword_charge_stage', { volume: 0.6, pitch: st === 2 ? 1.1225 : 1 });
      haptic(12);
      ar.fovHold(-st, 0.2);
      vignette(g, 0.07 * st);
      chargeFlare(g, st);
      g.vm?.weapon?.premium?.fire?.(0.45 + 0.2 * st, 0.3);   // the whole sword flashes a step brighter
    }
    ss.chargeSnd?.setRate?.(0.8 + 0.45 * Math.min(1, ss.ct / p.slam.stages[2]));
    if (!g.status?.alive) { releaseSlam(ws, g); }
  } else if (ss.mode === 'slam') {
    ss.t += dt;
    if (!ss.hit && ss.t >= 0.18) { ss.hit = true; slam(ws, g, ss.slamStage); }
    if (ss.t >= 0.6) { ss.mode = 'recover'; ss.t = p.recover - 0.3; ss.step = -1; }
  } else if (ss.mode === 'counter') {
    ss.t += dt;
    if (!ss.hit && ss.t >= 0.12) { ss.hit = true; const c = p.guard.counter; sweep(ws, g, { id: 'counter', dmg: c.dmg, r: c.r, arc: c.arc, knock: c.knock, stagger: 1, heavy: true, sweepDir: -1 }); }
    if (ss.t >= 0.5) { ss.mode = 'idle'; if (ss.guard) ss.guard.up = false; }
  }
}
/** stage-up flare at the blade tip (viewmodel): a star burst, a ring off the guard, a rush of motes up the blade */
function chargeFlare(g, st) {
  const c = g.vm.socketCam('tip', _a);
  if (!c) return;
  const P = g.fx?.particles;
  P?.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, life: 0.3, size: 0.1 + 0.06 * st, size1: 0.22 + 0.1 * st, color: [...STARW, 1], color1: [0, 0, 0, 0], frame: FRAME.glint, rot: R() * 6 });
  P?.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, life: 0.35, size: 0.08 + 0.04 * st, size1: 0.3 + 0.1 * st, color: [...BLUE, 0.8], color1: [0, 0, 0, 0], frame: FRAME.glow });
  const b = g.vm.socketCam('base', _c);
  if (b) g.fx?.shockwave?.(b, { r0: 0.02, r1: 0.1 + 0.04 * st, life: 0.3, color: BLUE, thin: true, vm: true });
  for (let i = 0; i < 10 + st * 6; i++) {
    const m = g.vm.socketCam(['mid', 'edge_f', 'edge_b', 'base'][i % 4], _b);
    if (m) P?.spawn({ additive: true, vm: true, x: m.x, y: m.y, z: m.z, vx: (c.x - m.x) * 3, vy: (c.y - m.y) * 3, vz: (c.z - m.z) * 3, life: 0.32, size: 0.012, stretch: 0.03, color: [...MOTE, 1], color1: [...BLUE, 0], frame: FRAME.spark });
  }
}
/** while charging: star motes converge on the tip (faster each stage), the tip star grows, stage 3 lights the hands */
function chargeLife(ws, g, v, st, dt) {
  const vm = g.vm, P = g.fx?.particles, tip = vm.socketCam('tip', _a);
  if (!tip || !P) return;
  v.moteT = (v.moteT ?? 0) - dt;
  while (v.moteT <= 0) {
    v.moteT += 1 / (18 + 22 * st);
    const m = vm.socketCam(['edge_f', 'edge_b', 'mid', 'base', 'star' + (1 + ((R() * 7) | 0))][(R() * 5) | 0], _b);
    if (!m) continue;
    m.x += (R() - 0.5) * 0.08; m.y += (R() - 0.5) * 0.08; m.z += (R() - 0.5) * 0.04;
    const k = 2.4 + st * 0.6;
    P.spawn({ additive: true, vm: true, x: m.x, y: m.y, z: m.z, vx: (tip.x - m.x) * k, vy: (tip.y - m.y) * k, vz: (tip.z - m.z) * k, life: 1 / k, size: 0.016 + 0.006 * st, size1: 0.005, stretch: 0.03,
      color: [...MOTE, 1], color1: [...BLUE, 0.3], frame: st >= 2 && R() < 0.4 ? FRAME.glint : FRAME.spark, rot: R() * 6 });
  }
  // the tip star: 0.1 -> 0.3, twinkling (one short-lived glint a frame)
  const tw = 0.85 + 0.15 * Math.sin(v.t * 23);
  P.spawn({ additive: true, vm: true, x: tip.x, y: tip.y, z: tip.z, life: 0.05, size: (0.1 + 0.067 * st) * tw, size1: (0.1 + 0.067 * st) * tw, color: [...STARW, st ? 0.9 : 0.5], color1: [...BLUE, 0], frame: FRAME.glint, rot: v.t * 0.8 });
  if (st >= 3) {
    P.spawn({ additive: true, vm: true, x: tip.x, y: tip.y, z: tip.z, life: 0.05, size: 0.16 * tw, size1: 0.16, color: [0.9, 1.3, 2.6, 0.8], color1: [0, 0, 0, 0], frame: FRAME.glow });
    // the blade lights the hands: a pulsing cold light at the blade root; the whole sword throbs
    if ((v.handT = (v.handT ?? 0) - dt) <= 0) { v.handT = 0.08; const p = vm.socketWorld?.('base', _c); if (p) g.fx?.lights?.flash?.(p, '#bcd2ff', 5 + 3 * Math.sin(v.t * 15), 1.6, 0.11); }
    if ((v.throbT = (v.throbT ?? 0) - dt) <= 0) { v.throbT = 0.42; vm.weapon?.premium?.fire?.(0.3, 0.2); }
  }
}
/** 迴天: a ring of starlight swept round the player at waist height (world, everyone near sees it) */
function wheelRing(ws, g, r) {
  const fx = g.fx, eye = g.camera.position, fwd = eyeFwd(g, _a, V3());
  const y = eye.y - 0.55, a0 = Math.atan2(fwd.x, fwd.z);
  void y;
  // from the right, round the front and the back to the right again (a tilted band: low and close -> high and far)
  sweepArc(g, eye, a0 - 1.2, { r0: r * 0.5, r1: r + 0.3, h0: -0.95, h1: -0.3, arc: Math.PI * 2 }, { t0: 0, t1: 0.32, span: 0.4, fade: 0.25 });
  fx?.shockwave?.(_c.set(eye.x, floorAt(g, eye) + 0.05, eye.z), { normal: UP, r0: 0.6, r1: r + 0.6, life: 0.4, color: BLUE, thin: true });
  for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; fx?.knockDust?.(_c.set(eye.x + Math.cos(a) * 2.2, floorAt(g, eye), eye.z + Math.sin(a) * 2.2), _d.set(Math.cos(a) * 4, 0, Math.sin(a) * 4), 0.8); }
}

// ------------------------------------------------------------------------------------------ 墜星 slam + 星痕 wave
function slam(ws, g, stage) {
  const p = ws.def.special.slam, eye = _a.copy(g.camera.position), fwd = eyeFwd(g, _e, V3());
  const at = V3().copy(eye).addScaledVector(fwd, 2.2);
  // a wall closer than 2.2 m: the blade strikes at the wall's foot
  const wh = g.world?.collision?.raycast(eye, fwd, 2.4);
  if (wh) at.copy(eye).addScaledVector(fwd, Math.max(0.6, wh.dist - 0.3));
  at.y = floorAt(g, at);
  const ev = { type: 'skill', id: 'starsword_wave', w: ID, slot: 'fx', seed: (R() * 2147483647) | 0, pos: [at.x, at.y, at.z], dir: [fwd.x, 0, fwd.z], by: g.localId, ph: 0, st: stage };
  const k = startSkill(g, ev, { ws, local: true });
  if (k) k.stage = stage;
  g.net?.sendSkill?.(ev);
  // the slam itself (caster: damage + feel)
  const r = p.r[stage], dmg = p.dmg[stage];
  let n = 0;
  for (const z of g.zombies?.list || []) {
    if (!z.alive) continue;
    const zc = z.center(V3()), d = Math.hypot(zc.x - at.x, zc.z - at.z);
    if (d > r + (z.radius ?? 0.4) || Math.abs(zc.y - at.y) > 2.5) continue;
    const dir = V3().set(zc.x - at.x, 0, zc.z - at.z);
    if (dir.lengthSq() < 1e-4) dir.copy(fwd);
    dir.normalize();
    strike(ws, g, z, dmg * Math.max(0.55, 1 - d / (r * 1.6)), dir, { knock: 5 + stage * 1.5, stagger: 1, sever: stage > 0 ? SEVER_HI : null, tag: 'slam', head: d < 1.2 && stage >= 2 });
    n++;
  }
  stop(g, 0.08 + stage * 0.014 + (n ? 0.02 : 0));
  shake(g, 0.25 + stage * 0.1);
  g.punch?.impulse?.(-(2.5 + stage) * 0.0175, 0, (R() - 0.5) * 0.02);
  g.arsenal?.fovKick?.(2 + stage, 0.3);
  if (stage >= 3 && clipComfort.overlay) g.fx?.overlay?.radial?.(0.55, 0.18, RADIAL_THIN);
  haptic(40);
  if (stage >= 2) setTimeout(() => haptic(40), 110);
}

registerSkill('starsword_wave', {
  level: 'L2', dur: 1.6,
  start(k) {
    const g = k.game, fx = g.fx, st = k.ev.st ?? k.stage ?? 0, p = k.def.special.slam;
    const at = k.pos.clone(), dir = k.dir.clone().setY(0).normalize();
    k.data = { st, at, dir, dist: 0, len: p.wave.len[st], speed: p.wave.speed, width: p.wave.width * (1 + st * 0.12), hitSet: new Set(), dustT: 0, decalD: 0, front: at.clone(), mesh: null, alive: true };
    // ---- the slam impact (everyone)
    const r = p.r[st], near = g.camera.position.distanceTo(at) < 6 ? 0.5 : 1;   // right on top of it: half the debris
    fx?.impact?.(0, _a.set(at.x, at.y + 0.02, at.z), UP, _b.set(dir.x, -1, dir.z).normalize(), { big: 1.6 + st * 0.4 });
    fx?.shockwave?.(_a.set(at.x, at.y + 0.06, at.z), { normal: UP, r0: 0.5, r1: r * 1.2, life: 0.4, color: [0.35, 0.7, 1.8], thin: true });
    fx?.shockwave?.(_a.set(at.x, at.y + 0.08, at.z), { normal: UP, r0: 0.2, r1: r * 0.7, life: 0.25, color: [1.2, 1.4, 2.0], thin: true });
    fx?.lights?.flash?.(_a.set(at.x, at.y + 0.8, at.z), '#7f9fff', 5 + st * 2.5, 6 + st * 1.5, 0.22);
    const nd = Math.round((10 + st * 3) * near);
    for (let i = 0; i < nd; i++) { const a = (i / nd) * 6.283 + k.rng() * 0.3; fx?.knockDust?.(_a.set(at.x + Math.cos(a) * r * 0.5, at.y, at.z + Math.sin(a) * r * 0.5), _b.set(Math.cos(a) * 6, 0, Math.sin(a) * 6), 1 + st * 0.3); }
    rubble(g, at, Math.round((10 + st * 6) * near), 4 + st * 1.5, k.rng);
    fx?.decals?.add?.(_a.set(at.x, at.y, at.z), UP, { frame: DECAL.concrete, size: 1.2 + st * 0.5, alpha: 1, life: 30 });
    fx?.decals?.add?.(_a.set(at.x, at.y, at.z), UP, { frame: DECAL.scorch, size: 1.6 + st * 0.6, tint: DECAL_TINT.scorch, alpha: 0.5, life: 12 });
    starBurst(g, at, 14 + st * 6, k.rng);
    sfx(g, 'starsword_slam', { pos: at, volume: 0.9 + st * 0.1 });
    // ---- the wave front (a fin of light) + the crack it opens behind it
    const S = sys(g);
    const mesh = new THREE.Mesh(waveGeometry(), waveMaterial());
    mesh.frustumCulled = false; mesh.renderOrder = 7;
    mesh.position.copy(at); mesh.lookAt(_a.copy(at).sub(dir));   // local -z faces forward
    mesh.scale.set(k.data.width, 0.5 + st * 0.12, 1.2);
    g.scene.add(mesh);
    k.data.mesh = mesh;
    const cm = crackMesh(k.rng, k.data.len + 0.5, k.data.width * 0.55);
    cm.position.set(at.x, at.y + 0.03, at.z); cm.lookAt(_a.set(at.x - dir.x, at.y + 0.03, at.z - dir.z));
    g.scene.add(cm);
    S.cracks.push({ mesh: cm, t: 0, life: st >= 3 ? 4.2 : 2.6, len: k.data.len, wave: k.data });
    sfx(g, 'starsword_wave', { pos: at, volume: 0.8 });
    sfx(g, 'starsword_crack', { pos: at, volume: 0.6 });
  },
  update(k, dt) {
    const d = k.data, g = k.game, fx = g.fx;
    if (!d.alive) { d.mesh.material.uniforms.uAmt.value = Math.max(0, d.mesh.material.uniforms.uAmt.value - dt * 5); return d.mesh.material.uniforms.uAmt.value > 0; }
    const step = d.speed * dt, prev = d.dist;
    d.dist = Math.min(d.len, d.dist + step);
    d.front.copy(d.at).addScaledVector(d.dir, d.dist);
    // follow the ground; a wall or a drop ends the wave with a burst
    const fy = floorAt(g, _a.set(d.front.x, d.front.y + 0.8, d.front.z));
    // knee-high cover (sandbags, kerbs) is climbed; a wall (a hit at 1.1 m) ends the wave
    const wall = g.world?.collision?.raycast(_b.set(d.front.x, d.front.y + 1.1, d.front.z), d.dir, step + 0.3);
    // it climbs up to 1.2 m (kerbs, low cover) and pours down off a ledge (a truck roof, steps) up to 4 m
    const dy = fy - d.front.y, ok = dy < 1.2 && dy > -4;
    if (ok) d.front.y = fy;
    const end = d.dist >= d.len || !!wall || !ok;
    d.mesh.position.copy(d.front);
    const u = d.mesh.material.uniforms;
    u.uAmt.value = Math.min(1, (d.dist / 1.5)) * (1 - Math.max(0, (d.dist - d.len * 0.8) / (d.len * 0.2)) * 0.6);
    // rubble, dust, decals along the path
    if ((d.dustT -= dt) <= 0) {
      d.dustT = 0.05;
      const side = (k.rng() - 0.5) * d.width * 0.8;
      _c.set(-d.dir.z, 0, d.dir.x);
      const p = _a.copy(d.front).addScaledVector(_c, side);
      fx?.knockDust?.(p, _b.copy(d.dir).multiplyScalar(3).addScaledVector(_c, Math.sign(side) * 3), 0.7);
      rubble(g, p, 3, 2.5, k.rng);
      g.fx?.particles?.spawn({ additive: true, x: p.x, y: p.y + 0.1, z: p.z, vx: (k.rng() - 0.5) * 0.6, vy: 1 + k.rng() * 2, vz: (k.rng() - 0.5) * 0.6, life: 0.6, size: 0.05, size1: 0.01, color: [...MOTE, 1], color1: [...VIOLET, 0], frame: FRAME.glint, drag: 1 });
    }
    if (d.dist - d.decalD >= 0.9) {
      d.decalD = d.dist;
      fx?.decals?.add?.(_a.copy(d.front), UP, { frame: DECAL.tile, size: 0.9 + k.rng() * 0.4, along: d.dir, alpha: 0.85, life: 20 });
    }
    // damage (caster): everything the front crosses within the width
    if (k.local) {
      const p = k.def.special.slam.wave, dmg = p.dmg[d.st];
      for (const z of g.zombies?.list || []) {
        if (!z.alive || d.hitSet.has(z)) continue;
        const zc = z.center(_a), rel = _b.set(zc.x - d.at.x, 0, zc.z - d.at.z);
        const along = rel.dot(d.dir), lat = Math.abs(rel.x * d.dir.z - rel.z * d.dir.x), zr = z.radius ?? 0.4;
        if (along < prev - zr - 0.3 || along > d.dist + zr || lat > d.width / 2 + zr || Math.abs(zc.y - d.front.y) > 2.2) continue;
        d.hitSet.add(z);
        const dir = V3().copy(d.dir).addScaledVector(_c.set(-d.dir.z, 0, d.dir.x), Math.sign(rel.x * d.dir.z - rel.z * d.dir.x) * -0.5).normalize();
        const ws = k.ws;
        if (ws) strike(ws, g, z, dmg, dir, { knock: 4 + d.st, stagger: 1, sever: d.st >= 2 ? SEVER_MID : null, elem: 'star', tag: 'wave', skill: 'starsword_wave' });
        hitSpark(g, zc, d.dir, 1.2);
        if (d.hitSet.size === 1) { shake(g, 0.08); sfx(g, 'starsword_hit', { pos: zc, volume: 0.6 }); }
      }
    }
    if (end) {
      d.alive = false;
      starBurst(g, d.front, 10, k.rng);
      fx?.shockwave?.(_a.set(d.front.x, d.front.y + 0.06, d.front.z), { normal: UP, r0: 0.2, r1: 1.6, life: 0.3, color: VIOLET, thin: true });
      if (wall) { fx?.impact?.(wall.surf, wall.point, wall.normal, d.dir, { big: 1.4 }); g.fx?.sparkBurst?.(wall.point, { color: STARW, color1: VIOLET, count: 18, speed: 6, glow: 0.6, normal: wall.normal }); }
    }
    return true;
  },
  end(k) { const m = k.data?.mesh; if (m) { m.removeFromParent(); m.material.dispose(); } },
});

/** chips of street flying off a strike (lit, gravity, bouncing) */
function rubble(g, p, n, speed, rng = R) {
  const P = g.fx?.particles;
  for (let i = 0; i < n; i++) {
    const a = rng() * 6.283, s = speed * (0.4 + rng() * 0.8);
    P?.spawn({ x: p.x, y: p.y + 0.05, z: p.z, vx: Math.cos(a) * s * 0.5, vy: s * (0.6 + rng() * 0.8), vz: Math.sin(a) * s * 0.5, life: 0.9 + rng() * 0.6, size: 0.035 + rng() * 0.05,
      color: [0.42, 0.4, 0.38, 1], color1: [0.36, 0.34, 0.32, 1], frame: FRAME.rock, lit: true, gravity: 12, spin: (rng() - 0.5) * 14, rot: rng() * 6, collide: true, bounce: 0.3 });
  }
}
/** a burst of star points and a glint (impacts, wave ends) */
function starBurst(g, p, n, rng = R) {
  const P = g.fx?.particles;
  for (let i = 0; i < n; i++) {
    const a = rng() * 6.283, s = 1.5 + rng() * 3.5;
    P?.spawn({ additive: true, x: p.x, y: p.y + 0.2, z: p.z, vx: Math.cos(a) * s, vy: 1.5 + rng() * 3.5, vz: Math.sin(a) * s, life: 0.6 + rng() * 0.6, size: 0.06, size1: 0.01, color: [...MOTE, 1], color1: [...VIOLET, 0], frame: i % 2 ? FRAME.glint : FRAME.glow, gravity: 2.5, drag: 1.2, rot: rng() * 6 });
  }
  P?.spawn({ additive: true, x: p.x, y: p.y + 0.4, z: p.z, life: 0.22, size: 1.0, size1: 1.6, color: [0.6, 0.9, 1.9, 0.8], color1: [0, 0, 0, 0], frame: FRAME.glint, rot: rng() * 6 });
}

// ------------------------------------------------------------------------------------------ 鎮河 guard (damage filter)
// PlayerStatus is not edited: the filter wraps its damage() once per status (like crisis.js). Frontal 140°: x0.3
// and no shove; inside the perfect window: blocked, the attacker staggers, 迴瀾 follows.
function installGuard(g) {
  const st = g.status;
  if (!st || st._ssGuard) return;
  st._ssGuard = true;
  const orig = st.damage;
  st.damage = (amount, opts = {}) => {
    const ws = g.arsenal?.current, ss = ws?.def?.id === ID ? ws.sp?.ss : null, gd = ss?.guard;
    if (!gd || !gd.up || opts.dot || !(amount > 0) || !st.alive || st.downed) return orig.call(st, amount, opts);
    const from = opts.from || opts.zombie?.pos;
    if (from) {
      const fwd = eyeFwd(g, _a, V3()), dx = from.x - g.camera.position.x, dz = from.z - g.camera.position.z, d = Math.hypot(dx, dz) || 1;
      const ang = Math.acos(clamp((dx * fwd.x + dz * fwd.z) / d, -1, 1)) * 180 / Math.PI;
      if (ang > ws.def.special.guard.cone / 2) return orig.call(st, amount, opts);
    }
    if (g.time <= gd.perfectUntil) { perfectGuard(ws, g, opts); return 0; }
    block(ws, g, amount);
    const o = { ...opts }; delete o.knock;
    return orig.call(st, amount * ws.def.special.guard.mul, o);
  };
}
function block(ws, g, amount) {
  const c = g.vm.socketCam('mid', _a);
  if (c) for (let i = 0; i < 8; i++) g.fx?.particles.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, vx: (R() - 0.5) * 0.6, vy: R() * 0.4, vz: R() * 0.3, life: 0.2, size: 0.003, stretch: 0.01, color: [...STARW, 1], color1: [...BLUE, 0], frame: FRAME.spark, gravity: 1 });
  sfx(g, 'starsword_block', { volume: 0.8 });
  shake(g, 0.12);
  g.vm.kick({ back: 0.03, up: 4, side: 2, roll: 3 });
  haptic(25);
}
function perfectGuard(ws, g, opts) {
  const ss = ssOf(ws), st = g.status;
  ss.guard.perfectUntil = -1;
  st.invuln = Math.max(st.invuln || 0, 0.3);
  meterEvent(ws, 'parry');
  // the skill moment spikes: a 0.1 s freeze with the colour drained, the whole blade flashing white, a starburst where
  // the blow met the steel, the crosshair flares, a ring bursts off the attacker and it reels
  stop(g, 0.1);
  shake(g, 0.2);
  sfx(g, 'starsword_parry', { volume: 1 });
  const post = g.renderer?.post;
  if (post && clipComfort.overlay && !ss.desat) { ss.desat = 0.7; post.saturation = (post.saturation ?? 1) - 0.7; setTimeout(() => { post.saturation += ss.desat; ss.desat = 0; }, 170); }
  if (clipComfort.overlay) g.fx?.overlay?.tint?.([0.85, 0.95, 1.4], 0.1, 0.3, { fadeIn: 0.02, fadeOut: 0.25 });
  haptic(12); setTimeout(() => haptic(40), 80);
  ss.view.flashT = 0.3;
  const P = g.fx?.particles, c = g.vm.socketCam('mid', _a);
  if (c && P) {
    P.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, life: 0.28, size: 0.3, size1: 0.12, color: [...STARW, 1], color1: [...BLUE, 0], frame: FRAME.glint, rot: R() * 6 });
    P.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, life: 0.2, size: 0.18, size1: 0.35, color: [1.6, 1.9, 3.2, 0.9], color1: [0, 0, 0, 0], frame: FRAME.glow });
    for (let i = 0; i < 16; i++) { const a = R() * 6.283, sp = 0.8 + R() * 1.2; P.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 0.2, life: 0.18 + R() * 0.12, size: 0.006, stretch: 0.04, color: [...STARW, 1], color1: [...BLUE, 0], frame: FRAME.spark, gravity: 1 }); }
  }
  // the attacker reels: shoved back, a real stagger (not just a flinch), a ring of starlight off it
  const z = opts.zombie;
  if (z?.alive) {
    z.flinchV?.set?.(0, 6, 0);
    if (z.kvel) { const dx = z.pos.x - g.camera.position.x, dz = z.pos.z - g.camera.position.z, l = Math.hypot(dx, dz) || 1; z.kvel.x += dx / l * 5; z.kvel.z += dz / l * 5; }
    if (!z.def?.boss) {
      if (!z.puppet) { z.state = 'stagger'; z.stateT = 0; }
      z.playOnce?.(z.actions?.stagger ? 'stagger' : 'hit_front', { fade: 0.06, speed: 1.1 });
    }
    const zc = z.center(V3()), n = _b.copy(g.camera.position).sub(zc).normalize();
    g.fx?.shockwave?.(zc, { normal: n, r0: 0.2, r1: 1.8, life: 0.3, color: STARW, thin: true });
    g.fx?.shockwave?.(_c.set(z.pos.x, z.pos.y + 0.05, z.pos.z), { normal: UP, r0: 0.3, r1: 2.2, life: 0.35, color: BLUE, thin: true });
    hitSpark(g, zc, n.negate(), 1.4);
  }
  // 迴瀾 a beat later
  later(ws, 0.08, () => {
    if (!held(g, ws)) return;
    ss.mode = 'counter'; ss.t = 0; ss.hit = false;
    if (ss.guard) ss.guard.up = false;
    ss.guardEnd = g.time + 10;   // (released by the next RMB press: guard end() stamps the real time)
    g.arsenal.playClip('starsword_counter', { duration: 0.5 });
    sfx(g, 'starsword_counter', { volume: 1 });
  });
}

registerSkill('starsword_guard', {
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
      // teammates: a faint starlight veil in front of the caster while the guard is up
      if ((k.data.ring -= dt) <= 0) { k.data.ring = 0.35; const p = k.caster(_a, _b); g.fx?.particles?.spawn({ additive: true, x: p.x + _b.x * 0.6, y: p.y - 0.4, z: p.z + _b.z * 0.6, life: 0.4, size: 0.9, size1: 1.2, color: [...BLUE, 0.4], color1: [0, 0, 0, 0], frame: FRAME.glint }); }
      return;
    }
    const ws = k.ws, ss = ssOf(ws), gd = ss.guard, ar = g.arsenal;
    if (!gd) return false;
    gd.t += dt;
    // raise once the sword is free (a swing in progress finishes first)
    const free = ss.mode === 'idle' || ss.mode === 'recover';
    if (!gd.up && free && ss.lockT <= 0 && ar.state === 'idle') {
      gd.up = true; gd.upAt = g.time;
      ss.mode = 'idle';
      if (g.time - ss.guardEnd >= ws.def.special.guard.rearm) gd.perfectUntil = g.time + ws.def.special.guard.raise + ws.def.special.guard.perfect;
      ar.playClip('starsword_guard', { duration: 1.2 });
      g.vm.clip.hold = true;
      sfx(g, 'starsword_guard_up', { volume: 0.7 });
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
    if (ss.guard?.up && ss.mode !== 'counter') g.vm.clip.hold = false;
    ss.guard = null;
    ss.guardEnd = g.time;
  },
});

// ------------------------------------------------------------------------------------------ 橫天 skyspan
registerSkill('starsword_skyspan', {
  level: 'L3', dur: 1.0, defaults: { r: 9, arc: 220, dmg: 360, knock: 7 },
  start(k) {
    const g = k.game, d = k.data;
    const fwd = _a.copy(k.dir).setY(0).normalize();
    d.a0 = Math.atan2(fwd.x, fwd.z);       // world yaw of the cast forward
    const half = (k.p.arc / 2) * Math.PI / 180, eye0 = k.caster(_c, _d);
    d.prev = d.a0 - half; d.hit = new Set(); d.done = false;   // from the very start of the arc (the first frame's band too)
    // the world arc: the outer third of the projected blade (6 -> 9.4 m) at chest height, a thin ring of light out by
    // the horizon (from 2 m out it filled the lower screen as a pale sheet); the viewmodel blade + its trail are the near
    d.arc = sweepArc(g, eye0, d.a0 - half, { r0: 6.0, r1: k.p.r + 0.4, h0: -0.55, h1: -0.32, arc: half * 2, seg: 80 }, { t0: 0.25, t1: 0.55, span: 0.3, fade: 0.25, amt: 0.6 });
    if (k.local) {
      const ws = k.ws, ss = ssOf(ws);
      ss.mode = 'idle'; ss.lockT = 1.0; ss.step = -1;
      g.vm.clip.hold = false;
      g.arsenal.playClip('starsword_skyspan', { duration: 1.0 });
      g.arsenal.fovKick(3, 0.5);
      sfx(g, 'starsword_skyspan_charge', { volume: 0.9 });
    } else sfx(g, 'starsword_skyspan', { pos: k.pos, volume: 0.8 });
  },
  update(k, dt) {
    const g = k.game, d = k.data, t = k.t, p = k.p;
    // the giant blade (caster's viewmodel)
    if (k.local) {
      const gm = ssOf(k.ws).view.giant;
      if (gm) {
        const grow = clamp((t - 0.08) / 0.17, 0, 1), fade = 1 - clamp((t - 0.55) / 0.25, 0, 1);
        gm.visible = grow > 0 && fade > 0;
        const u = gm.material.uniforms;
        u.uLen.value = 0.3 + (p.r - 0.3) * (1 - (1 - grow) ** 3);
        u.uWid.value = 0.26 + 0.1 * grow;
        u.uAmt.value = grow * fade * 0.85;
        u.uHit.value = Math.max(0, u.uHit.value - dt * 4);
        // the giant blade's own crescent trail across the screen (pushed after the viewmodel pose, sysUpdate)
        if (t >= 0.22 && !d.gtrail) d.gtrail = giantTrail(g, gm, 0.4);
        if (t >= 0.6 && d.gtrail) { d.gtrail.r.stop(); d.gtrail = null; }
      }
      g.status?.applySlow?.(0.08, 0.5);
    }
    // the sweep: 0.25 -> 0.55 s, from 110° right of the cast forward round to 110° left
    if (d.arc) d.arc.mesh.position.copy(k.caster(_c, _d));
    if (t < 0.25 || d.done) return;
    const u = clamp((t - 0.25) / 0.3, 0, 1), half = (p.arc / 2) * Math.PI / 180;
    if (u >= 1) d.done = true;                            // the last frame always reaches the end of the arc
    const ang = d.a0 - half + u * half * 2;               // world yaw now (sin / cos: x / z)
    const eye = k.caster(_a, _b), y = eye.y - 0.45;
    if (k.rng() < 0.7) g.fx?.knockDust?.(_c.set(eye.x + Math.sin(ang) * p.r * 0.8, k.floorY(eye), eye.z + Math.cos(ang) * p.r * 0.8), _d.set(Math.cos(ang) * -4, 0, Math.sin(ang) * 4), 0.6);
    if (!k.local) return;
    // hits: every zombie whose bearing the blade passed this frame
    const prev = d.prev;
    d.prev = ang;
    const ws = k.ws;
    let any = false;
    for (const z of g.zombies?.list || []) {
      if (!z.alive || d.hit.has(z)) continue;
      const zc = z.center(V3()), dx = zc.x - eye.x, dz = zc.z - eye.z, dist = Math.hypot(dx, dz);
      if (dist > p.r + (z.radius ?? 0.4) || Math.abs(zc.y - eye.y) > 4.5) continue;   // a 9 m blade reaches down off a roof
      let a = Math.atan2(dx, dz);
      while (a < prev - Math.PI) a += Math.PI * 2;
      while (a > prev + Math.PI) a -= Math.PI * 2;
      if (a < prev - 0.08 || a > ang + 0.08) continue;
      d.hit.add(z);
      const dir = V3().set(dx, 0, dz).normalize();
      dir.add(_c.set(Math.cos(ang), 0, -Math.sin(ang)).multiplyScalar(0.8)).normalize();   // carried along the sweep (to the left)
      strike(ws, g, z, p.dmg, dir, { knock: p.knock, stagger: 1, sever: SEVER_HI, elem: 'star', tag: 'skyspan', skill: 'starsword_skyspan' });
      hitSpark(g, zc, dir, 1.5);
      any = true;
    }
    if (any) {
      // one hit-stop for the sweep (one per frame kept the whole 220° in slow motion through a crowd)
      if (!d.stopped) { d.stopped = true; stop(g, 0.06); }
      shake(g, 0.35);
      const gm = ssOf(ws).view.giant; if (gm) gm.material.uniforms.uHit.value = 1;
      // speed lines only when it connects: brief, thin, the middle of the screen kept clear
      if (!d.radial && clipComfort.overlay) { d.radial = true; g.fx?.overlay?.radial?.(0.5, 0.15, RADIAL_THIN); }
      sfx(g, 'starsword_hit', { volume: 0.9 });
      haptic(30);
    }
  },
  end(k) {
    k.data.gtrail?.r.stop();
    if (k.local) { const gm = ssOf(k.ws).view.giant; if (gm) { gm.visible = false; gm.material.uniforms.uAmt.value = 0; } }
  },
});
/** RADIAL speed lines for the big beats only: thin, sparse, a clear quarter round the crosshair */
const RADIAL_THIN = { r0: 0.3, density: 0.3, thin: 0.5 };
/**
 * A crescent trail off the projected giant blade (viewmodel layer): `from` = where along the giant blade it starts
 * (0 collar .. 1 tip). The points are pushed by the world system after the viewmodel has posed this frame.
 */
function giantTrail(g, gm, from) {
  const r = g.fx?.trail?.({ vm: true, profile: 'crescent', life: 0.16, segs: 24, color: [5.2, 5.6, 6.4, 1], color1: [0.6, 0.9, 3.6, 0] });
  if (!r) return null;
  const t = { r, gm, from };
  sys(g).gtrails.push(t);
  return t;
}

// ------------------------------------------------------------------------------------------ 天劍 ultimate
// ③ is staged for the eye: the sword streaks in out of the sky like a hurled spear, its axis leaning 35° away from the
// caster, and stops short, HOVERING tip-first over the mark where each viewer sees the whole blade (the hover distance
// follows that viewer's own frame: the tip ~22° under the top edge, the guard at the top edge, the crosshair clear);
// it turns its flat round to the caster while star dust gathers at the point and the camera lifts 3°, then
// plunges in 0.32 s on a star-dust contrail, swinging upright to a 15° lean as it bites; the camera slams down with
// it. It plants 3.4 m deep (≈ 10.6 m stands, the hilt leaning away so it stays in frame from ~10 m). Close to the
// impact the flash is capped and the blast is a low dust ring, so the crosshair stays readable.
let _hsGeo = null;
const SINK = 3.4;   // how deep the 14 m spirit sword plants: the blade, the cloud-head guard and the hilt stand
const HS = 14, T_IN = 0.3, T_HOVER = 0.42, T_DROP = 0.58, T_HIT = 0.9, LEAN = 0.26, LEAN_AIR = 0.61, LIFT = 0.052;
const _qt2 = new THREE.Quaternion(), _ax = new THREE.Vector3();
const hsGeo = () => _hsGeo || (_hsGeo = heavenSwordGeometry());
/** the sword's axis (tip -> pommel) leaning `lean` away from the caster */
const axisOf = (d, lean, out = _ax) => out.set(-Math.sin(d.yaw) * Math.sin(lean), Math.cos(lean), -Math.cos(d.yaw) * Math.sin(lean));
/** distance along the in-flight axis at which a viewer sees the hovering tip ~22° under the top edge of the frame (the blade then spans the upper third, the guard at the top edge) */
function hoverDist(g, c) {
  const cam = g.camera, dir = cam.getWorldDirection(_e), D = Math.max(3, Math.hypot(c.x - cam.position.x, c.z - cam.position.z));
  const e = Math.tan(clamp(Math.asin(clamp(dir.y, -1, 1)) + (cam.fov / 2) * Math.PI / 180 + LIFT - 0.38, -1.2, 1.2));
  return clamp((e * D + cam.position.y - c.y) / Math.max(0.15, Math.cos(LEAN_AIR) - e * Math.sin(LEAN_AIR)), 3, 18);
}
registerSkill('starsword_heaven', {
  level: 'L4', aim: 'target', dur: 3.95, defaults: { range: 30, r: 7, dmg: 900, pulses: 3, pulseDmg: 220, pulseR: 8 },
  start(k) {
    const g = k.game, d = k.data, c = (k.at || k.feet()).clone();
    // a ray that found no surface (open ground the collision ray skips): land where it crosses the caster's floor
    const fy = k.floorY(_a.copy(k.pos).setY(k.pos.y - 1));
    if (k.dir.y < -0.02 && c.distanceTo(k.pos) > (k.pos.y - fy) / -k.dir.y + 0.5) c.copy(k.pos).addScaledVector(k.dir, (k.pos.y - fy) / -k.dir.y).setY(fy);
    d.c = c; d.beat = 0; d.pulse = 0;
    // the spirit ends facing the caster (its flat towards them); it arrives turned a third of a turn away, its axis
    // leaning away from the caster (d.axis: tip -> pommel)
    const to = k.caster(_a, _b);
    d.yaw = Math.atan2(to.x - c.x, to.z - c.z);
    d.axis = axisOf(d, LEAN, new THREE.Vector3());                   // planted
    d.tilt = new THREE.Quaternion().setFromUnitVectors(UP, d.axis);
    d.air = axisOf(d, LEAN_AIR, new THREE.Vector3());                // in flight / hovering
    d.near = g.camera.position.distanceTo(c) < 15;
    if (k.local) {
      const ws = k.ws, ss = ssOf(ws);
      ss.mode = 'idle'; ss.lockT = 1.05; ss.step = -1;
      g.vm.clip.hold = false;
      g.arsenal.playClip('starsword_ult_cast', { duration: 1.05 });
      g.hud?.card?.(k.cardText(), { color: k.hex.rim, sub: k.def.en });
      g.arsenal.fovKick(3, 0.6);
      if (g.status) g.status.invuln = Math.max(g.status.invuln || 0, 0.9);
      if (clipComfort.overlay) { g.hud?.border?.(k.hex.core, 0.22, 3.4); g.fx?.overlay?.tint?.([0.6, 0.75, 1.5], 0.08, 0.9, { fadeIn: 0.15, fadeOut: 0.4 }); }
      sfx(g, 'starsword_ult_rise', { volume: 1 });
      sfx(g, 'starsword_ult_bed', { volume: 0.8, delay: 0.3 });
      // ① a beam from the raised tip into the sky
      later(ws, 0.22, () => {
        const tip = g.vm.socketApparent('tip', V3());
        if (tip) g.fx?.beam?.(tip, tip.clone().add(_a.set(0, 60, 0)), { core: STARW, glow: BLUE, wCore: 0.04, wGlow: 0.35, life: 0.5, shrink: 0.5 });
        g.fx?.lights?.flash?.(g.camera.position, '#bcd2ff', 18, 6, 0.25);
      });
    } else sfx(g, 'starsword_ult_rise', { pos: c, volume: 0.8 });
  },
  update(k, dt) {
    const g = k.game, fx = g.fx, d = k.data, c = d.c, t = k.t, p = k.p;
    // ② the star-map sigil
    if (d.beat < 1 && t >= 0.2) {
      d.beat = 1;
      d.sigil = fx?.sigils?.sigil?.(c, { design: 'starmap', radius: p.r, color: [1.4, 2.0, 4.4], color1: VIOLET, life: 3.6, spin: 0.6, seed: k.ev.seed });
      sfx(g, 'starsword_ult_sigil', { pos: c, volume: 0.9 });
    }
    // ③ a thin starlight shaft marks the spot; the sword streaks in from the sky and stops, hovering, tip down
    if (d.beat < 2 && t >= T_IN) {
      d.beat = 2;
      d.hover = hoverDist(g, c);
      d.hoverTip = c.clone().addScaledVector(d.air, d.hover);
      d.plantTip = c.clone().addScaledVector(d.axis, -SINK);
      d.airTilt = new THREE.Quaternion().setFromUnitVectors(UP, d.air);
      fx?.sigils?.pillar?.(c, { radius: 0.38, height: 30, color: [0.9, 1.05, 1.5], color1: [0.3, 0.5, 1.3], life: 0.65, motes: 10, light: 20 });
      d.ghost = fx?.summons?.ghost?.({ geometry: hsGeo(), size: HS, pos: _a.copy(d.hoverTip).addScaledVector(d.air, 30), quat: _q.copy(d.airTilt).multiply(_qt2.setFromAxisAngle(UP, d.yaw + 1.4)), appear: 0.16, life: Infinity, out: 0.65, motion: 'none', big: true,
        base: [0.03, 0.055, 0.22], core: [0.25, 0.45, 1.3], rim: [0.8, 0.55, 2.2], edge: [3.6, 4.0, 5.2], opacity: 0.86, glaze: 0.8, rimPower: 2.8, flowSpeed: 0.6,
        exit: { kind: 'frost', count: 46, color: [3.0, 3.4, 5.0], speed: 4, up: 2, scale: 2.4 }, seed: k.ev.seed });
      sfx(g, 'starsword_ult_fall', { pos: c, volume: 1 });
    }
    if (d.ghost && t < T_HIT) {
      let yaw = d.yaw, ax = d.air;
      const tip = _c;
      if (t < T_HOVER) {                                                                                  // streaks in, brakes
        const u = clamp((t - T_IN) / (T_HOVER - T_IN), 0, 1);
        tip.copy(d.hoverTip).addScaledVector(ax, 30 * (1 - u) ** 3); yaw += 1.4 * (1 - u * 0.4);
        d.ghost.obj.quaternion.copy(d.airTilt);
      } else if (t < T_DROP) {                                                                            // hovers, turns its flat round
        const u = (t - T_HOVER) / (T_DROP - T_HOVER);
        tip.copy(d.hoverTip).addScaledVector(ax, 0.3 * Math.sin(u * Math.PI)); yaw += 1.4 * 0.6 * (1 - u * u * (3 - 2 * u));
        d.ghost.obj.quaternion.copy(d.airTilt);
      } else {                                                                                            // the plunge, swinging upright
        const u = clamp((t - T_DROP) / (T_HIT - T_DROP), 0, 1), e = u * u * u, l = u * u * (3 - 2 * u);
        tip.lerpVectors(d.hoverTip, d.plantTip, e);
        ax = axisOf(d, LEAN_AIR + (LEAN - LEAN_AIR) * l);
        d.ghost.obj.quaternion.setFromUnitVectors(UP, ax);
      }
      d.ghost.obj.position.copy(tip);
      d.ghost.obj.quaternion.multiply(_qt2.setFromAxisAngle(UP, yaw));
      // star dust: a contrail off the blade while it moves, gathering at the point while it hovers
      const moving = t < T_HOVER || t >= T_DROP;
      for (let i = 0; i < (moving ? 3 : 2); i++) {
        if (moving) {
          const p = _a.copy(tip).addScaledVector(ax, 1 + k.rng() * HS * 0.7);
          fx?.particles?.spawn({ additive: true, x: p.x + (k.rng() - 0.5) * 1.4, y: p.y, z: p.z + (k.rng() - 0.5) * 1.4, vx: ax.x * 4, vy: ax.y * 4, vz: ax.z * 4, life: 0.6 + k.rng() * 0.5, size: 0.3, size1: 0.06, stretch: 0.6,
            color: [...MOTE, 1], color1: [...BLUE, 0], frame: FRAME.glint, rot: k.rng() * 6 });
        } else {
          const a = k.rng() * 6.283, r = 1.5 + k.rng() * 2.5;
          fx?.particles?.spawn({ additive: true, x: tip.x + Math.cos(a) * r, y: tip.y + 1 + k.rng() * 3, z: tip.z + Math.sin(a) * r, vx: -Math.cos(a) * r * 3, vy: -3, vz: -Math.sin(a) * r * 3, life: 0.3, size: 0.18, size1: 0.04,
            color: [...STARW, 1], color1: [...BLUE, 0], frame: FRAME.glint, rot: k.rng() * 6 });
        }
      }
      if (k.local && t >= T_IN + 0.04 && t < T_DROP && g.punch) g.punch.target.x = LIFT;   // the eye lifts to it
    }
    if (d.beat < 3 && t >= T_DROP) {
      d.beat = 3;
      // the plunge: a contrail of light from where it hung down to the mark
      fx?.beam?.(_a.copy(d.hoverTip).addScaledVector(d.air, HS * 0.5), _b.copy(c), { core: [2.4, 2.6, 3.2], glow: [0.5, 0.8, 2.2], wCore: 0.12, wGlow: 1.0, life: 0.55, shrink: 0.2 });
      d.ghost?.flash?.(0.8);
    }
    // ④ impact
    if (d.beat < 4 && t >= T_HIT) {
      d.beat = 4;
      if (d.ghost) {
        d.ghost.obj.position.copy(c).addScaledVector(d.axis, -SINK); d.ghost.obj.quaternion.copy(d.tilt).multiply(_qt2.setFromAxisAngle(UP, d.yaw)); d.ghost.flash?.(0.6);
        // planted right in front of the viewer it stands on the crosshair: thinner glaze, the fight shows through
        if (d.near) for (const m of d.ghost.mats || []) if (m.u?.uLook) m.u.uLook.value.x = 0.5;
      }
      if (g.punch && k.local) { g.punch.target.x = 0; g.punch.impulse(-0.09, 0, 0); }
      impact(k, c);
    }
    // ④ the embedded sword pulses three times (each lights the seven stars in turn)
    const pulseAt = [1.6, 2.35, 3.1];
    while (d.pulse < p.pulses && t >= pulseAt[d.pulse]) { d.pulse++; pulse(k, c, d.pulse); }
    // ⑤ the sword shatters into star dust; the cracks keep glowing a while
    if (d.beat < 5 && t >= 3.25) {
      d.beat = 5;
      d.ghost?.dissolveOut?.(0.65);
      starBurst(g, _a.set(c.x, c.y + 4, c.z), d.near ? 16 : 26, k.rng);
      fx?.motes?.burst?.('frost', _a.set(c.x, c.y + 6, c.z), 30, { color: [3, 3.4, 5], speed: 4, spread: 1, radius: 3, seed: k.ev.seed });
      sfx(g, 'starsword_ult_shatter', { pos: c, volume: 1 });
    }
  },
  end(k) {
    k.data.sigil?.stop?.();
    if (k.data.ghost?.alive) k.data.ghost.dissolveOut?.(0.3);
    if (k.local && k.game.punch) k.game.punch.target.x = 0;
  },
});
function impact(k, c) {
  const g = k.game, fx = g.fx, p = k.p, near = k.data.near, cn = near ? 0.5 : 1;
  // the aura 星輝 (every client applies it to its own player)
  addAura(g, { type: 'dmg', mul: 1.1, radius: 8, pos: c, dur: 6, by: k.by });
  fx?.lights?.flash?.(_a.set(c.x, c.y + 3, c.z), '#dce8ff', near ? 8 : 22, 20, 0.35);
  // (close by, a filled white disc covered the whole floor of the frame: a thin blue ring instead)
  fx?.shockwave?.(_a.set(c.x, c.y + 0.08, c.z), { normal: UP, r0: 0.5, r1: p.r * 1.6, life: 0.55, color: near ? BLUE : STARW, thin: near });
  fx?.shockwave?.(_a.set(c.x, c.y + 0.1, c.z), { normal: UP, r0: 0.4, r1: p.r * 1.1, life: 0.4, color: VIOLET, thin: true });
  // far: a rubble blast; close: only a low dust ring (a smoke ball on the crosshair milked the whole screen)
  if (!near) fx?.explosion?.(_a.set(c.x, c.y + 0.3, c.z), { radius: 4, scale: 0.9, color: [0.45, 0.42, 0.4] });
  const nd = near ? 14 : 24;
  for (let i = 0; i < nd; i++) { const a = (i / nd) * 6.283; fx?.knockDust?.(_a.set(c.x + Math.cos(a) * 3.2, c.y, c.z + Math.sin(a) * 3.2), _b.set(Math.cos(a) * 9, 0, Math.sin(a) * 9), near ? 1.1 : 1.8); }
  rubble(g, c, Math.round(40 * cn), 7, k.rng);
  starBurst(g, _a.set(c.x, c.y + 0.5, c.z), Math.round(30 * cn), k.rng);
  fx?.decals?.add?.(_a.copy(c), UP, { frame: DECAL.concrete, size: 4.5, alpha: 1, life: 40 });
  fx?.decals?.add?.(_a.copy(c), UP, { frame: DECAL.scorch, size: 6, tint: DECAL_TINT.scorch, alpha: 0.6, life: 20 });
  // radial glowing cracks (6 fissures)
  const S = sys(g);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * 6.283 + k.rng() * 0.5, len = 4 + k.rng() * 4;
    const cm = crackMesh(k.rng, len, 1.0);
    cm.position.set(c.x, c.y + 0.03, c.z); cm.lookAt(_a.set(c.x - Math.sin(a), c.y + 0.03, c.z - Math.cos(a)));
    g.scene.add(cm);
    S.cracks.push({ mesh: cm, t: 0, life: 4.5, len, speed: 30 });
  }
  sfx(g, 'starsword_ult_impact', { pos: c, volume: 1.2 });
  if (k.local) {
    k.hurt(c, p.r, p.dmg, { knock: 9, stagger: 1, falloffMin: 0.4 });
    stop(g, 0.12); shake(g, 0.6);
    if (clipComfort.overlay) { g.fx?.overlay?.radial?.(0.6, 0.2, RADIAL_THIN); if (!near) g.fx?.screen?.kick?.([0.2, 0.26, 0.4], 0.05); }
    haptic(40); setTimeout(() => haptic(40), 110);
  } else if (g.camera.position.distanceTo(c) < 20) shake(g, 0.25);
}
function pulse(k, c, i) {
  const g = k.game, fx = g.fx, p = k.p;
  fx?.shockwave?.(_a.set(c.x, c.y + 0.1, c.z), { normal: UP, r0: 0.6, r1: p.pulseR, life: 0.5, color: BLUE, thin: true });
  fx?.shockwave?.(_a.set(c.x, c.y + 0.12, c.z), { normal: UP, r0: p.pulseR, r1: 0.8, life: 0.45, color: VIOLET, thin: true });   // collapsing ring: pulled in
  k.data.ghost?.flash?.(1.2);
  // the seven stars climbing the blade
  const ax = k.data.axis || UP;
  for (let s = 0; s < 7; s++) { const q = _b.copy(c).addScaledVector(ax, 0.4 + s * 0.9); fx?.particles?.spawn({ additive: true, x: q.x, y: q.y, z: q.z, delay: s * 0.05, life: 0.3, size: 1.2, size1: 0.4, color: [...STARW, 1], color1: [...BLUE, 0], frame: FRAME.glint, rot: s }); }
  fx?.lights?.flash?.(_a.set(c.x, c.y + 4, c.z), '#bcd2ff', k.data.near ? 14 : 40, 14, 0.3);
  sfx(g, 'starsword_ult_pulse', { pos: c, volume: 0.9 });
  if (k.local) {
    k.hurt(c, p.pulseR, p.pulseDmg, { knock: -1.5, stagger: 0.8, falloffMin: 0.6 });   // pulls inwards
    shake(g, 0.15);
  }
}

// ------------------------------------------------------------------------------------------ crisis + final kill
registerSkill('starsword_crisis', {
  level: 'L1', dur: 1.0,
  start(k) {
    const g = k.game, c = k.feet(V3()), P = g.fx?.particles;
    for (let i = 0; i < 7; i++) { const a = (i / 7) * 6.283; P?.spawn({ additive: true, x: c.x + Math.cos(a) * 0.8, y: c.y + 1.1, z: c.z + Math.sin(a) * 0.8, vx: Math.cos(a) * 6, vy: 0.5, vz: Math.sin(a) * 6, delay: 0.25, life: 0.4, size: 0.3, size1: 0.05, color: [...STARW, 1], color1: [...VIOLET, 0], frame: FRAME.glint }); }
    g.fx?.shockwave?.(_a.set(c.x, c.y + 0.1, c.z), { normal: UP, r0: 0.4, r1: 4.5, life: 0.4, color: BLUE, thin: false });
    sfx(g, 'starsword_crisis', { pos: c, volume: 1 });
  },
});
registerSkill('starsword_final', {
  level: 'L2', dur: 1.3,
  start(k) {
    const g = k.game, fx = g.fx, c = k.pos.clone();
    c.y = k.floorY(_a.set(c.x, c.y + 1, c.z));
    if (!k.local) { fx?.sigils?.pillar?.(c, { radius: 0.45, height: 7, color: BLUE, life: 0.7, motes: 4, ring: false }); return; }
    fx?.sigils?.sigil?.(c, { design: 'starmap', radius: 2.4, color: [1.4, 2.0, 4.4], color1: VIOLET, life: 1.3, spin: 0.8, seed: k.ev.seed });
    fx?.sigils?.pillar?.(c, { radius: 0.8, height: 18, color: STARW, color1: BLUE, life: 0.8, motes: 10 });
    const q = new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(g.camera.position.x - c.x, g.camera.position.z - c.z));
    const gh = fx?.summons?.ghost?.({ geometry: hsGeo(), size: 4, pos: _b.set(c.x, c.y + 14, c.z), quat: q, appear: 0.12, life: 0.9, out: 0.4, motion: 'none', big: false,
      base: [0.16, 0.22, 0.5], core: [1.6, 2.4, 5.2], rim: [2.6, 1.0, 4.0], edge: [4.6, 5.0, 6.4], opacity: 0.55, exit: { kind: 'frost', count: 16, color: [3, 3.4, 5], speed: 3 } });
    if (gh) { let t = 0; const S = sys(g); const dropper = { update: (dt) => { t += dt; const u = Math.min(1, t / 0.3); gh.obj.position.y = c.y + 14 * (1 - u * u) - 0.6 * u; if (t >= 0.3 && !dropper.hit) { dropper.hit = true; starBurst(g, c, 18, k.rng); fx?.shockwave?.(_a.set(c.x, c.y + 0.08, c.z), { normal: UP, r0: 0.3, r1: 3.5, life: 0.4, color: STARW, thin: false }); } if (t > 1 || !gh.alive) g.systems.splice(g.systems.indexOf(dropper), 1); } }; g.systems.push(dropper); void S; }
    sfx(g, 'starsword_final', { pos: c, volume: 0.9 });
  },
});

// ------------------------------------------------------------------------------------------ the special (engine overrides)
registerSpecial(ID, {
  init(ws) {
    ssOf(ws);
    const g = ws.game;
    if (g?.scene) { sys(g); warm(g); }
    // decode the weapon's cues up front (the first slam / ultimate would start late otherwise)
    const au = g?.audio;
    if (au?.defs && !au._ssPre) { au._ssPre = true; au.preload?.(Object.keys(au.defs).filter((n) => /^(starsword_|ready_starsword)/.test(n)))?.catch?.(() => {}); }
  },
  /** the attacks (Arsenal._melee asks every frame while the weapon is idle in hand) */
  melee(ws, s, g) {
    const ss = ssOf(ws), p = ws.def.special;
    if (!g.status?.alive) return true;
    if (s.pressed.fire) { ss.buf = 0.3; ss.pressT = 0; ss.pressing = true; ss.fresh = true; }
    if (!s.held.fire) { ss.pressing = false; ss.fresh = true; }
    if (ss.lockT > 0 || ss.guard?.up || ss.mode === 'counter') return true;
    // firing (or aiming) cuts an inspect (the Arsenal does) -- and a pressed F mid-fight is not an inspect
    if (ss.mode === 'charge') { if (!s.held.fire || ss.ct >= p.slam.max) releaseSlam(ws, g); return true; }
    if (ss.mode === 'slam') return true;
    // hold -> 墜星 (from rest, or out of a swing's wind-up before it lands)
    if (ss.pressing && ss.fresh && ss.pressT >= p.slam.hold && (ss.mode === 'idle' || ss.mode === 'recover' || (ss.mode === 'swing' && !ss.hit))) { startCharge(ws, g); return true; }
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
    if (zf) { zf.clearStatus?.(z, 'kill'); zf.status?.(z, 'starkill', 0.25); }   // a star rim, not the white body flash
    starCut(g, z, dir);
    if (info.melee || info.skill) stop(g, info.headshot ? 0.07 : 0.04);
    // the wave's last kill: a mini 天劍 (KE_FINAL, §1.10) -- once a wave
    const m = g.match, ss = ssOf(ws);
    if (m && m.state === 'round' && (m.queue?.length ?? 1) + (g.zombies?.alive ?? 1) <= 0 && ss.finalWave !== m.round) {
      ss.finalWave = m.round;
      const ev = { type: 'skill', id: 'starsword_final', w: ID, slot: 'fx', seed: (R() * 2147483647) | 0, pos: [z.pos.x, z.pos.y, z.pos.z], dir: [0, 0, -1], by: g.localId, ph: 0 };
      startSkill(g, ev, { ws, local: true });
      g.net?.sendSkill?.(ev);
    }
  },
  update(ws, dt, g) {
    const ss = ssOf(ws);
    // F mid-fight is not an inspect (this runs before the Arsenal reads the key; Q-then-F was read just before)
    if (ss.mode !== 'idle' || ss.guard?.up || ss.lockT > 0) { const inp = g.input?.state; if (inp) inp.pressed.inspect = false; }
    driver(ws, dt, g);
    view(ws, g, dt);
    // a stray inspect mid-attack never happens (melee() eats the key while busy)
    if (ss.mode === 'charge' || ss.guard?.up) g.arsenal.sinceShot = 0;
  },
  tick(ws, dt, g) {
    const ss = ssOf(ws);
    if (!held(g, ws)) {
      if (ss.hum) { ss.hum.stop?.(0.2); ss.hum = null; }
      if (ss.chargeSnd) { ss.chargeSnd.stop?.(0.1); ss.chargeSnd = null; }
      if (ss.mode !== 'idle') { ss.mode = 'idle'; ss.step = -1; ss.lockT = 0; g.arsenal?.fovHold?.(0, 0.2); vignette(g, 0); }
      ss.view.w = null;
    }
  },
  dispose(ws, g) {
    const ss = ws.sp?.ss;
    if (!ss) return;
    ss.hum?.stop?.(0.1); ss.chargeSnd?.stop?.(0.1);
    ss.view.giant?.removeFromParent();
  },
  meterInfo(ws, key, m) {
    if (key !== 'charge') return null;
    const ss = ssOf(ws), n = ss.mode === 'charge' ? ss.stage : 0;
    return { ...m, raw: n, value: n / 3, ready: n >= 3, hidden: ss.mode !== 'charge' };
  },
  onClipEvent(ws, name, arg, g) {
    if (name !== 'ss') return;
    const what = typeof arg === 'string' ? arg : arg?.do, vm = g.vm;
    if (what === 'stars') chase(ws, g);
    else if (what === 'dust') dust(g, arg?.n ?? 8);
    else if (what === 'gem') { const c = vm.socketCam('gem', _a); if (c) g.fx?.particles.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, life: 0.3, size: 0.03, size1: 0.07, color: [...STARW, 1], color1: [0, 0, 0, 0], frame: FRAME.glint, rot: R() }); }
    else if (what === 'world') worldInspect(ws, g);
    else if (what === 'plant') plant(ws, g);
    else if (what === 'ring') { const c = vm.socketCam('base', _a); if (c) g.fx?.shockwave?.(c, { r0: 0.02, r1: 0.12, life: 0.3, color: BLUE, thin: true, vm: true }); }
    else if (what === 'dipper') miniDipper(g);
  },
});

/**
 * First-use hitches (a 0.3 s / 2 s frame on the first slam / ult): every custom material of the weapon gets a hidden
 * instance in the scene (the load-time scene compile covers it; bought mid-match, compileAsync now), the spirit
 * sword geometry and the 星圖 sigil texture are built up front.
 */
function warm(g) {
  if (g._ssWarm) return;
  g._ssWarm = true;
  try {
    hsGeo();
    g.fx?.sigils?.preload?.(['starmap']);
    // upload the star-map atlas now (a 1024² texture upload on the first 天劍 frame)
    for (const t of g.fx?.sigils?.tex || []) if (t) g.renderer?.gl?.initTexture?.(t);
    const grp = new THREE.Group();
    grp.name = 'starsword-warmup';
    const wave = new THREE.Mesh(waveGeometry(), waveMaterial()), crack = crackMesh(R, 1, 1), arc = arcBand({ seg: 8 }), giant = giantBlade();
    for (const m of [wave, crack, arc, giant]) { m.visible = false; m.frustumCulled = false; grp.add(m); }
    g.scene.add(grp);
    g.renderer?.gl?.compileAsync?.(grp, g.camera, g.scene)?.catch?.(() => {});
  } catch (e) { console.warn('[starsword] warm-up', e); }
}
/** 改變世界的檢視: the world dims under a starry blue for 2.5 s (only this screen) */
function worldInspect(ws, g) {
  const post = g.renderer?.post, ss = ssOf(ws);
  if (!post || ss.dim) return;
  const k = 0.85;
  post.exposure *= k; ss.dim = true;
  if (clipComfort.overlay) g.fx?.overlay?.tint?.([0.55, 0.65, 1.2], 0.14, 2.5, { fadeIn: 0.4, fadeOut: 0.6 });
  const P = g.fx?.particles, cam = g.camera;
  for (let i = 0; i < 24; i++) {
    _a.set((R() - 0.5) * 8, R() * 3 - 0.5, -3 - R() * 6).applyQuaternion(cam.quaternion).add(cam.position);
    P?.spawn({ additive: true, x: _a.x, y: _a.y, z: _a.z, vy: 0.05, delay: R() * 0.8, life: 1.6, fadeIn: 0.3, size: 0.05 + R() * 0.05, size1: 0.02, color: [...MOTE, 1], color1: [...BLUE, 0], frame: FRAME.glint, rot: R() * 6 });
  }
  later(ws, 2.5, () => { post.exposure /= k; ss.dim = false; });
}
/** rare recovery: the tip planted in the street -- a star burst and dust where it bites */
function plant(ws, g) {
  const eye = g.camera.position, fwd = eyeFwd(g, _a, V3());
  const p = V3().copy(eye).addScaledVector(fwd, 1.1); p.y = floorAt(g, p);
  starBurst(g, p, 12);
  g.fx?.knockDust?.(p, _b.set(0, 0, 0), 0.8);
  g.fx?.decals?.add?.(p, UP, { frame: DECAL.concrete, size: 0.35, life: 15 });
  sfx(g, 'starsword_hit_wall', { pos: p, volume: 0.8 });
  chase(ws, g);
}
/** rare inspect: a 10 cm dipper of light over the blade for 0.6 s */
function miniDipper(g) {
  const vm = g.vm, base = vm.socketCam('mid', _a);
  if (!base) return;
  const pts = [[0, 0], [0.025, -0.012], [0.05, -0.008], [0.062, 0.012], [0.088, 0.02], [0.1, 0.045], [0.122, 0.06]];
  pts.forEach(([x, y], i) => g.fx?.particles.spawn({ additive: true, vm: true, x: base.x - 0.05 + x, y: base.y + 0.08 + y, z: base.z, delay: i * 0.05, life: 0.6, size: 0.01, size1: 0.006, color: [...STARW, 1], color1: [...BLUE, 0], frame: FRAME.glint, rot: i }));
}

// ------------------------------------------------------------------------------------------ clips
// Swings are authored as camera-space blade directions (d: where the blade points, m: where the cutting edge
// travels -- the edge leads the cut) and grip offsets (m from the hip pose); bladeRot() turns each into the clip's
// gunRot offset about the grip (Euler YXZ, unwrapped key to key so a cut never spins the short way round). Every
// swing starts from wherever the sword is now (chained cuts never pop) and ends below the frame before it comes
// back up to the guard, so no cut is seen unwinding. +x right, +y up, -z forward.
const Z3 = [0, 0, 0];
const D2R = Math.PI / 180;
const _qb = new THREE.Quaternion(), _qt = new THREE.Quaternion(), _m4 = new THREE.Matrix4(), _eu = new THREE.Euler(), _bx = V3(), _by = V3(), _bz = V3();
/** gunRot offset (deg) that turns the hip pose so the blade points along d with its edge leading along m */
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
/**
 * A clip from blade keys: [t, gripPos, d, m, ease] (d null = the pose of the previous key); starts at the current
 * pose, ends at rest. `hide` = index of the out-of-frame key: from there the angles are folded back into ±180 with
 * a snap, so the last blend to rest is short.
 */
function swingClip(vm, keys, { events = [], extra = {}, hide = -1, from = null, rest = 'out3', loop, dur } = {}) {
  // from: [grip, d, m] = a set start pose (draws), else wherever the sword is now
  const f = from ? { p: from[0], r: bladeRot(vm, from[1], from[2]) } : now(vm), gp = [[0, f.p]], gr = [[0, f.r]];
  let prev = f.r;
  keys.forEach(([t, p, d, m, e = 'inOut'], i) => {
    const r = d ? bladeRot(vm, d, m, prev) : prev.slice();
    gp.push([t, p, e]); gr.push([t, r, e]);
    if (i === hide) {
      const n = r.map((v) => ((v % 360) + 540) % 360 - 180);
      gr.push([t + 0.0005, n, 'snap']); gp.push([t + 0.0005, p, 'snap']);
      prev = n; return;
    }
    prev = r;
  });
  // rest: fold the last angles into ±180 first (a turn of the sword in the hand must not unwind on the way back)
  const last = gr[gr.length - 1][1], fold = last.map((v) => ((v % 360) + 540) % 360 - 180);
  if (fold.some((v, i) => Math.abs(v - last[i]) > 1e-3)) { const tl = gr[gr.length - 1][0] + 0.0005; gr.push([tl, fold, 'snap']); gp.push([tl, gp[gp.length - 1][1], 'snap']); }
  gp.push([1, Z3, rest]); gr.push([1, Z3, rest]);
  const c = { tracks: { gunPos: gp, gunRot: gr, ...extra }, events };
  if (loop) c.loop = loop;
  if (dur) c.duration = dur;
  return c;
}
// §1.17: a white-hot crescent off the outer half of the blade (mid -> tip: a sheet from the root read as a grey slab
// hanging behind the sword), star blue in the wake; the cut that lands burns violet and fades out (hitColor1)
const TRAIL = (id = 'blade', o = {}) => ({ on: true, id, from: 'mid', to: 'tip', profile: 'crescent', color: '#ffffff', color1: '#4f72ff', k: 4.5,
  hitColor: '#e0c8ff', hitColor1: '#4a2a9a', life: 0.13, ...o });
const TRAIL_OFF = (id = 'blade') => ({ on: false, id });
const LOW = [-0.04, -0.46, 0.04];   // below the frame: the sword comes back up from here
const tr3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
// 橫流: wind up high right, the blade flat across the front at chest height to the left, out of frame, back up
registerClip('starsword_flow', (vm) => swingClip(vm, [
  [0.28, [0.06, 0.1, 0.06], [0.75, 0.62, 0.2], [-0.2, 0.1, -1], 'out3'],
  [0.38, [-0.04, 0.08, -0.1], [0.25, 0.18, -1], [-1, -0.05, 0.1], 'in'],
  [0.5, [-0.24, 0.05, -0.12], [-0.95, 0.0, -0.32], [-0.25, -0.1, 1], 'out'],
  [0.64, [-0.34, -0.1, -0.04], [-0.8, -0.45, 0.35], [0.2, -1, 0.3], 'out3'],
  [0.8, LOW, null, null, 'inOut'],
], { hide: 4, events: [[0.24, 'trail', TRAIL()], [0.3, 'haptic', 'tick'], [0.66, 'trail', TRAIL_OFF()]] }));
// 逆流: from the lower left, a rising diagonal cut to the upper right
registerClip('starsword_counterflow', (vm) => swingClip(vm, [
  [0.26, [-0.3, -0.14, -0.02], [-0.92, -0.32, 0.15], [0.25, 0.45, -1], 'out3'],
  [0.38, [-0.06, 0.0, -0.14], [-0.15, 0.4, -1], [1, 0.55, 0.05], 'in'],
  [0.5, [0.12, 0.1, -0.1], [0.8, 0.55, -0.15], [0.3, 0.35, 1], 'out'],
  [0.66, [0.16, 0.14, 0.0], [0.55, 0.8, 0.35], [-0.2, 0.2, 1], 'out3'],
  [0.84, [0.12, -0.46, 0.06], null, null, 'inOut'],
], { hide: 4, events: [[0.22, 'trail', TRAIL()], [0.28, 'haptic', 'tick'], [0.68, 'trail', TRAIL_OFF()]] }));
// 迴天: the blade comes round from the right, across the front, round behind (out of sight) and over the top
registerClip('starsword_wheel', (vm) => swingClip(vm, [
  [0.2, [0.1, 0.06, 0.06], [0.95, 0.25, 0.25], [-0.3, 0, -1], 'out3'],
  [0.32, [0.0, 0.06, -0.12], [0.3, 0.12, -1], [-1, 0, -0.1], 'in'],
  [0.42, [-0.24, 0.04, -0.1], [-0.95, 0.05, -0.3], [-0.3, 0, 1], 'linear'],
  [0.54, [-0.3, 0.06, 0.04], [-0.4, 0.1, 1], [1, 0, 0.3], 'linear'],
  [0.66, [0.1, 0.1, 0.08], [0.85, 0.3, 0.5], [0.2, 0.2, -1], 'linear'],
  [0.78, [0.04, 0.16, -0.02], [0.2, 0.9, -0.3], [-1, 0.2, 0], 'out3'],
  [0.9, [0.02, 0.04, 0.02], null, null, 'inOut'],
], { hide: 6, events: [[0.18, 'trail', TRAIL('blade', { life: 0.14, k: 5 })], [0.24, 'haptic', 'tick'], [0.42, 'shake', 0.08], [0.8, 'trail', TRAIL_OFF()]],
  extra: { 'fx_flare.scale': [[0, [1, 0.05, 1]], [0.22, [1, 1, 1], 'out3'], [0.8, [1, 1, 1]], [1, [1, 0.05, 1]]], 'fx_flare.vis': [[0, 1], [0.95, 1], [0.96, 0, 'snap']] } }));
// 迴瀾: out of the guard (blade across, pointing left) a left -> right counter cut
registerClip('starsword_counter', (vm) => swingClip(vm, [
  [0.16, [-0.28, 0.02, -0.02], [-0.95, 0.12, 0.2], [0.2, 0, -1], 'out3'],
  [0.32, [-0.04, 0.06, -0.14], [-0.2, 0.15, -1], [1, 0, 0], 'in'],
  [0.46, [0.16, 0.06, -0.1], [0.95, 0.12, -0.25], [0.2, 0, 1], 'out'],
  [0.62, [0.2, -0.06, 0.0], [0.7, -0.4, 0.4], [-0.2, -1, 0.3], 'out3'],
  [0.82, [0.12, -0.46, 0.06], null, null, 'inOut'],
], { hide: 4, events: [[0.12, 'trail', TRAIL('blade', { color1: '#8f6bff', k: 5 })], [0.18, 'haptic', 'thud'], [0.64, 'trail', TRAIL_OFF()]] }));
// 橫天: raised up the right side of the frame, flat to the eye, while the edge projects into the 9 m blade above it
// (0 -> 0.25), then brought down flat (its leading edge tipped down so the flat shows) and swept across the whole
// frame right -> left (0.25 -> 0.55): from the hands the projected blade fans across the lower half like a wiper; out
// of frame low left, back up
registerClip('starsword_skyspan', (vm) => swingClip(vm, [
  [0.22, [0.04, -0.03, 0.0], [0.45, 0.86, 0.1], [0.86, -0.45, 0.1], 'out3'],
  [0.3, [0.1, -0.04, -0.02], [0.72, 0.06, -0.69], [-0.69, -0.55, -0.72], 'in'],
  [0.4, [0.0, -0.05, -0.1], [0.0, 0.05, -1], [-1, -0.55, 0], 'linear'],
  [0.5, [-0.14, -0.05, -0.08], [-0.78, 0.04, -0.62], [-0.62, -0.55, 0.78], 'linear'],
  [0.58, [-0.24, -0.06, -0.02], [-0.97, 0.02, 0.25], [0.25, -0.55, 0.97], 'out'],
  [0.7, [-0.3, -0.18, 0.02], [-0.6, -0.7, 0.3], [0.2, -1, 0.3], 'out3'],
  [0.86, LOW, null, null, 'inOut'],
], { hide: 5, extra: { 'fx_flare.scale': [[0, [1, 0.05, 1]], [0.2, [1, 1.08, 1], 'out3'], [0.6, [1, 1.08, 1]], [0.8, [1, 0.05, 1], 'inOut']], 'fx_flare.vis': [[0, 1], [0.8, 1], [0.81, 0, 'snap']] },
  events: [[0.02, 'ss', 'stars'], [0.05, 'haptic', 'tick'], [0.22, 'trail', TRAIL('blade', { life: 0.14, k: 5 })], [0.25, 'snd', 'starsword_skyspan'],
    [0.4, 'shake', 0.2], [0.6, 'trail', TRAIL_OFF()], [0.6, 'snd', 'starsword_skyspan_end'], [0.6, 'ss', 'dust']] }));
// 收招: the sword swung up onto the right shoulder, a flick of the wrist, back to the guard (any input cancels)
registerClip('starsword_recover', (vm) => swingClip(vm, [
  [0.25, [0.06, 0.04, 0.08], [0.35, 0.5, 0.8], [0, 1, 0], 'out3'],
  [0.55, [0.06, 0.045, 0.085], null, null, 'linear'],
  [0.7, [0.02, -0.01, 0.03], [-0.1, 0.95, 0.2], [-1, 0, 0], 'inOut'],
], { events: [[0.2, 'snd', 'cloth'], [0.62, 'ss', 'dust'], [0.64, 'snd', 'starsword_recover']] }));
// rare 收招: the tip planted in the street ahead, the seven stars flare, pulled out
registerClip('starsword_recover_rare', (vm) => swingClip(vm, [
  [0.22, [-0.06, 0.04, -0.12], [-0.1, 0.2, -1], [0, -1, 0], 'out3'],
  [0.3, [-0.1, -0.12, -0.2], [-0.1, -0.75, -0.65], [0, -1, 0], 'in3'],
  [0.62, [-0.1, -0.125, -0.2], null, null, 'linear'],
  [0.8, [0.02, 0.03, 0.02], [-0.2, 0.95, -0.2], [-1, 0, 0], 'out3'],
], { events: [[0.3, 'ss', 'plant'], [0.3, 'shake', 0.12], [0.31, 'haptic', 'thud'], [0.66, 'snd', 'cloth']] }));
// 墜星 charge: the sword raised high in a forward high guard, the blade up across the upper left of the frame with the
// flat square to the eye (the edge faces up-right) so the stage glow, the converging stars and the tip star read; the
// line of the blade passes above the crosshair (0.15 -> 0.85 loops while held: a faint tremble)
registerClip('starsword_charge', (vm) => {
  const f = now(vm), up = [-0.05, 0.2, -0.02], ur = bladeRot(vm, [-0.55, 0.6, -0.58], [0.6, 0.78, 0.2], f.r);
  return {
    loop: [0.15, 0.85],
    tracks: {
      gunPos: [[0, f.p], [0.15, up, 'out3'], [0.32, tr3(up, [0.002, 0.004, 0])], [0.5, tr3(up, [-0.002, 0.001, 0.002])], [0.68, tr3(up, [0.001, 0.004, -0.001])], [0.85, up], [1, Z3, 'inOut']],
      gunRot: [[0, f.r], [0.15, ur, 'out3'], [0.32, tr3(ur, [0.8, -0.5, 0.6])], [0.5, tr3(ur, [-0.6, 0.6, -0.4])], [0.68, tr3(ur, [0.5, 0.3, 0.7])], [0.85, ur], [1, Z3, 'inOut']],
    },
    events: [[0.05, 'snd', 'cloth'], [0.12, 'ss', 'ring']],
  };
});
// 墜星 slam: from overhead straight down onto the street ahead (lands at 0.18 s of 0.6), a beat on the ground, up
registerClip('starsword_slam', (vm, o = {}) => {
  const st = o.stage ?? 0;
  return swingClip(vm, [
    [0.12, [-0.06, 0.12, -0.12], [-0.12, 0.45, -1], [0, -1, -0.2], 'in'],
    [0.3, [-0.16, -0.13, -0.3], [-0.12, -0.62, -0.9], [0, -1, 0.3], 'in3'],
    [0.55, [-0.155, -0.14, -0.29], null, null, 'linear'],
    [0.82, LOW, null, null, 'inOut'],
  ], { hide: 3, extra: { 'fx_flare.scale': [[0, [1, st >= 3 ? 1 : 0.05, 1]], [0.3, [1, 1.1, 1], 'in3'], [0.6, [1, 1, 1]], [0.85, [1, 0.05, 1]]], 'fx_flare.vis': [[0, 1], [0.85, 1], [0.86, 0, 'snap']] },
    events: [[0.04, 'trail', TRAIL('blade', { life: 0.13, k: 5 })], [0.32, 'trail', TRAIL_OFF()]] });
});
// 鎮河: the blade laid across the chest pointing left, low, flat out (edge up) (0.13 s), held (0.15 -> 0.8 loops), lowered
registerClip('starsword_guard', (vm) => {
  const f = now(vm), gp = [-0.12, 0.02, 0.06], gr = bladeRot(vm, [-1, 0.12, -0.2], [0, 1, 0.1], f.r);
  return {
    loop: [0.15, 0.8],
    tracks: {
      gunPos: [[0, f.p], [0.12, gp, 'out3'], [0.4, tr3(gp, [0, 0.003, 0])], [0.8, gp], [1, Z3, 'inOut']],
      gunRot: [[0, f.r], [0.12, gr, 'out3'], [0.4, tr3(gr, [0.4, 0, 0.5])], [0.8, gr], [1, Z3, 'inOut']],
    },
    events: [[0.1, 'ss', 'ring'], [0.11, 'haptic', 'tick']],
  };
});
// 天劍 cast: the sword raised straight up to the sky (flat to the eye), held, lowered
registerClip('starsword_ult_cast', (vm) => {
  const f = now(vm), r = bladeRot(vm, [0.14, 1, 0.1], [-1, 0, -0.1], f.r);
  return {
    tracks: {
      gunPos: [[0, f.p], [0.22, [0.03, 0.18, 0.06], 'out3'], [0.7, [0.03, 0.19, 0.06]], [1, Z3, 'inOut']],
      gunRot: [[0, f.r], [0.22, r, 'out3'], [0.7, r], [1, Z3, 'inOut']],
      'fx_flare.scale': [[0, [1, 0.05, 1]], [0.22, [1, 1.15, 1], 'out3'], [0.7, [1, 1.15, 1]], [0.95, [1, 0.05, 1]]], 'fx_flare.vis': [[0, 1], [0.95, 1], [0.96, 0, 'snap']],
    },
    events: [[0.02, 'ss', 'stars'], [0.2, 'haptic', 'thud'], [0.21, 'ss', 'gem'], [0.22, 'shake', 0.1]],
  };
});
// first draw (1.6 s, once per match, fire cancels): tip first out of the lower right, upright with the flat to the
// eye, the stars light from 天樞 to 搖光, turned to the light while the guard spreads and the edge ignites root ->
// tip, raised in a salute (a 0.2 s freeze on it), the sting, down to the guard
const UPRIGHT = [[0.05, 1, 0.1], [1, 0, 0.15]];   // blade up, edge to the right: the flat faces the eye
registerClip('starsword_first', (vm) => swingClip(vm, [
  [0.2, [0.03, -0.05, 0.02], ...UPRIGHT, 'out3'],
  [0.42, [-0.03, 0.02, 0.04], [-0.12, 1, 0.05], [1, 0, 0.45], 'inOut'],
  [0.66, [-0.03, 0.025, 0.04], null, null, 'linear'],
  [0.78, [0.0, 0.05, 0.02], [-0.32, 1, -0.2], [1, 0.1, 0.35], 'outBack'],
  [0.92, [0.0, 0.05, 0.02], null, null, 'linear'],
], { from: [[0.12, -0.5, 0.1], [0.3, 0.4, -0.85], [0, 1, 0]], dur: 1.6,
  extra: {
    fx_guardR: [[0, 0], [0.47, 0], [0.62, 1, 'outBack'], [0.9, 1], [1, 0]], fx_guardL: [[0, 0], [0.49, 0], [0.64, 1, 'outBack'], [0.9, 1], [1, 0]],
    'fx_edge.scale': [[0, [1, 0.02, 1]], [0.46, [1, 0.02, 1]], [0.66, [1, 1, 1], 'out3']],
    'fx_flare.scale': [[0, [1, 0.02, 1]], [0.5, [1, 0.02, 1]], [0.7, [1, 1, 1], 'out3'], [0.86, [1, 1, 1]], [0.96, [1, 0.02, 1]]], 'fx_flare.vis': [[0, 0], [0.5, 1, 'snap'], [0.96, 1], [0.97, 0, 'snap']],
  },
  events: [[0.02, 'snd', 'starsword_draw_first'], [0.22, 'ss', 'stars'], [0.24, 'haptic', 'tick'], [0.47, 'fx', { id: 'RING', socket: 'base', r1: 0.12, life: 0.35, color: '#bcd2ff' }],
    [0.5, 'ss', 'dust'], [0.52, 'glow', { to: 2.2, sec: 0.2 }], [0.7, 'glow', { to: 1, sec: 0.4 }], [0.76, 'snd', 'cloth'], [0.8, 'snd', 'starsword_first_sting'], [0.8, 'ss', 'gem']] }));
// normal draw (0.6 s): up out of the lower right, the edge lights from the root (the colour shift is §1.17's)
registerClip('starsword_draw', (vm) => swingClip(vm, [
  [0.7, [0.0, 0.01, 0.0], [-0.25, 0.92, -0.35], [1, 0.1, 0.1], 'out3'],
], { from: [[0.1, -0.42, 0.1], [0.4, 0.6, -0.7], [0, 1, 0]], rest: 'inOut',
  extra: { 'fx_edge.scale': [[0, [1, 0.02, 1]], [0.4, [1, 0.05, 1]], [0.85, [1, 1, 1], 'out3']] },
  events: [[0.02, 'snd', 'starsword_draw'], [0.5, 'ss', 'stars']] }));
// inspect (4.4 s): the flat turned to the eye, a slow turn so the light runs over the star river (0.15 -> 0.42: held
// F loops it) while the stars light one by one, a full turn of the sword upright in the hand (0.48 -> 0.72), upright
// before the face, the 天樞 gem glints, the guard spreads (0.78 -> 0.95)
registerClip('starsword_inspect', (vm) => swingClip(vm, [
  [0.15, [-0.06, 0.04, 0.06], [-0.25, 0.95, 0.1], [1, 0, 0.2], 'inOut'],
  [0.28, [-0.07, 0.05, 0.06], [-0.18, 0.95, 0.2], [1, 0.05, 0.5], 'inOut'],
  [0.42, [-0.06, 0.04, 0.06], [-0.25, 0.95, 0.1], [1, 0, 0.2], 'inOut'],
  [0.48, [-0.09, 0.05, 0.06], [-0.05, 1, 0.05], [1, 0, 0], 'inOut'],
  [0.54, [-0.09, 0.05, 0.06], [-0.05, 1, 0.05], [0, 0, 1], 'linear'],
  [0.6, [-0.09, 0.05, 0.06], [-0.05, 1, 0.05], [-1, 0, 0], 'linear'],
  [0.66, [-0.09, 0.05, 0.06], [-0.05, 1, 0.05], [0, 0, -1], 'linear'],
  [0.72, [-0.09, 0.05, 0.06], [-0.05, 1, 0.05], [1, 0, 0], 'out3'],
  [0.8, [-0.13, 0.04, 0.08], [0.0, 1, 0.08], [1, 0, -0.3], 'inOut'],
  [0.95, [-0.13, 0.04, 0.08], null, null, 'linear'],
], { rest: 'inOut', loop: [0.15, 0.42], dur: 4.4,
  extra: {
    env: [[0, 0], [0.12, 1], [0.9, 1], [1, 0]],
    fx_guardR: [[0, 0], [0.76, 0], [0.82, 1, 'outBack'], [0.95, 1], [1, 0]], fx_guardL: [[0, 0], [0.77, 0], [0.83, 1, 'outBack'], [0.95, 1], [1, 0]],
  },
  events: [[0.04, 'snd', 'cloth'], [0.08, 'ss', 'world'], [0.12, 'snd', 'starsword_inspect'], [0.18, 'ss', 'stars'], [0.3, 'ss', 'dust'],
    [0.48, 'snd', 'cloth'], [0.73, 'haptic', 'tick'], [0.8, 'ss', 'gem'], [0.82, 'snd', 'starsword_star']] }));
// rare inspect (1 in 10): presented, let go and tossed up spinning twice in the plane of the screen (the tip draws a
// ring of light), caught, upright, a little dipper of light over the blade
registerClip('starsword_inspect_rare', (vm) => {
  const spin = [[0, 1, 0], [-1, 0, 0], [0, -1, 0], [1, 0, 0]];
  const keys = [[0.12, [-0.05, 0.03, 0.05], [-0.25, 0.95, 0.1], [1, 0, 0.2], 'inOut'], [0.26, [-0.05, 0.03, 0.05], null, null, 'linear'], [0.31, [-0.03, -0.02, 0.03], ...UPRIGHT, 'in']];
  for (let i = 1; i <= 8; i++) {
    const t = 0.31 + i * 0.035, u = i / 8, d = spin[i % 4], m = [-d[1], d[0], 0];
    keys.push([t, [-0.04, -0.02 + 0.34 * Math.sin(Math.PI * u), 0.03 - 0.05 * Math.sin(Math.PI * u)], [d[0], d[1], d[2] + 0.05], m, 'linear']);
  }
  keys.push([0.66, [-0.02, -0.03, 0.0], ...UPRIGHT, 'out3'], [0.78, [-0.12, 0.05, 0.07], [0.0, 1, 0.08], [1, 0, -0.3], 'outBack'], [0.94, [-0.12, 0.05, 0.07], null, null, 'linear']);
  return swingClip(vm, keys, { rest: 'inOut', loop: [0.12, 0.26], dur: 4.4, extra: { env: [[0, 0], [0.12, 1], [0.9, 1], [1, 0]] },
    events: [[0.06, 'snd', 'cloth'], [0.08, 'ss', 'world'], [0.3, 'anchorR', ['rest', 0.08]], [0.3, 'anchorL', ['rest', 0.1]], [0.32, 'trail', { on: true, id: 'toss', from: 'base', to: 'tip', color: '#dfe8ff', color1: '#c66bff', k: 1.8, life: 0.35 }],
      [0.58, 'anchorR', ['grip_r', 0.06]], [0.6, 'trail', TRAIL_OFF('toss')], [0.61, 'snd', 'starsword_hit_wall'], [0.62, 'haptic', 'tick'], [0.66, 'anchorL', ['grip_l', 0.15]],
      [0.8, 'ss', 'dipper'], [0.8, 'ss', 'stars'], [0.82, 'snd', 'starsword_star']] });
});
// ready idle extras (§1.17 idle tiers): a flick of the blade with the stars chasing / a glint running up the edge
registerClip('starsword_ready', {
  duration: 0.9,
  tracks: {
    gunPos: [[0, Z3], [0.3, [0.01, 0.015, 0.01], 'out3'], [1, Z3, 'inOut']],
    gunRot: [[0, Z3], [0.3, [-6, 4, -5], 'out3'], [0.55, [2, -1, 2], 'inOut'], [1, Z3, 'inOut']],
    fx_guardR: [[0, 0.3], [0.3, 0.8, 'outBack'], [1, 0.3]], fx_guardL: [[0, 0.3], [0.32, 0.8, 'outBack'], [1, 0.3]],
  },
  events: [[0.25, 'ss', 'stars'], [0.3, 'ss', 'dust']],
});
registerClip('starsword_glint', {
  duration: 0.8,
  tracks: { gunRot: [[0, Z3], [0.4, [2, -3, 1.5], 'inOut'], [1, Z3, 'inOut']], 'fx_flare.scale': [[0, [1, 0.02, 1]], [0.4, [1, 1, 1], 'out3'], [1, [1, 0.02, 1]]], 'fx_flare.vis': [[0, 1], [0.97, 1], [0.98, 0, 'snap']] },
  events: [[0.1, 'ss', 'dust']],
});

// ------------------------------------------------------------------------------------------ crosshair, kill mark, damage skin
// xh_star: two facing hairline arcs (upper left, lower right: two blade lights), a hollow diamond in the middle;
// 墜星 lights 3 ticks round it, 鎮河 folds the arcs into one flat bar (the guard)
const XH = { stage: 0, guard: false, flash: false };   // written by view() every frame; state() redraws the crosshair on a change
registerCrosshair('xh_star', {
  state: () => XH.stage + (XH.guard ? 'g' : '') + (XH.flash ? 'f' : ''),
  draw(gap, c, s) {
    const R0 = 11 + gap * 0.6;
    const arc = (a0, a1, r) => `M${(Math.sin(a0) * r).toFixed(1)} ${(-Math.cos(a0) * r).toFixed(1)} A${r} ${r} 0 0 1 ${(Math.sin(a1) * r).toFixed(1)} ${(-Math.cos(a1) * r).toFixed(1)}`;
    // 鎮河: the two blade lights fold into one flat bar under the centre (the guard)
    const d = XH.guard ? `M${-R0 - 4} ${R0 * 0.55} L${-5} ${R0 * 0.55} M5 ${R0 * 0.55} L${R0 + 4} ${R0 * 0.55} M${-R0 - 4} ${R0 * 0.55 - 4} L${-R0 - 4} ${R0 * 0.55 + 3} M${R0 + 4} ${R0 * 0.55 - 4} L${R0 + 4} ${R0 * 0.55 + 3}`
      : `${arc(-2.0, -0.55, R0)} ${arc(1.14, 2.59, R0)}`;
    const dia = `M0 -3.4 L2.4 0 L0 3.4 L-2.4 0 Z`;
    // 墜星: three ticks over the top light one a stage (dim until then)
    const ticks = [0, 1, 2].map((i) => { const a = -0.35 + i * 0.35; return `<path d="M${(Math.sin(a) * (R0 + 4)).toFixed(1)} ${(-Math.cos(a) * (R0 + 4)).toFixed(1)} L${(Math.sin(a) * (R0 + 9)).toFixed(1)} ${(-Math.cos(a) * (R0 + 9)).toFixed(1)}" stroke="${c}" stroke-width="${i < XH.stage ? 2.6 : 1.6}" stroke-linecap="round" opacity="${i < XH.stage ? 1 : XH.stage ? 0.3 : 0}"/>`; }).join('');
    // 完美格擋: a four-point star flares round the centre for a moment
    const flare = XH.flash ? `<path d="M0 ${-R0 - 10} L2.2 -4 L${R0 + 10} 0 L2.2 4 L0 ${R0 + 10} L-2.2 4 L${-R0 - 10} 0 L-2.2 -4 Z" fill="#ffffff" opacity="0.9"/>` : '';
    return `${flare}<path class="a" d="${d}" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/><path class="a" d="${dia}" fill="none" stroke="${c}" stroke-width="1.2"/>${ticks}`;
  },
  nodes: 22,
});

// km_starsword: a diagonal blade-light opens a night-blue field and draws the dipper (beat 1), the sword's silhouette
// fills, the star river runs up it (2), full glow (3), 天樞 flares with a cross-star and a ding (4)
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const seg = (t, a, b) => ease((t - a) / (b - a));
registerKillMark('km_starsword', {
  draw(ctx, S, t, o) {
    const c = S / 2, R0 = S * 0.42, lw = S * 0.035, col = '#bcd2ff', vio = '#c66bff', gold = o.gold ? '#ffd56a' : '#e3b04b';
    const p1 = seg(t, 0, 0.45), p2 = seg(t, 0.45, 0.8), p3 = seg(t, 0.8, 1.0), p4 = seg(t, 1.0, 1.15);
    ctx.clearRect(0, 0, S, S);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // the field: a night-blue lens opened along the diagonal cut
    ctx.save();
    const open = p1;
    ctx.beginPath();
    ctx.moveTo(c - R0 * 0.9, c + R0 * 0.9);
    ctx.quadraticCurveTo(c - R0 * 0.1 - R0 * 0.55 * open, c - R0 * 0.1 - R0 * 0.55 * open, c + R0 * 0.9, c - R0 * 0.9);
    ctx.quadraticCurveTo(c + R0 * 0.1 + R0 * 0.55 * open, c + R0 * 0.1 + R0 * 0.55 * open, c - R0 * 0.9, c + R0 * 0.9);
    ctx.closePath();
    const bg = ctx.createRadialGradient(c, c, R0 * 0.1, c, c, R0);
    bg.addColorStop(0, '#1d2a5c'); bg.addColorStop(0.7, '#0d1238'); bg.addColorStop(1, '#05060f');
    ctx.globalAlpha = 0.95; ctx.fillStyle = bg; ctx.fill();
    ctx.clip();
    // star dust in the field
    let s = 7;
    for (let i = 0; i < 40; i++) { s = (s * 16807) % 2147483647; const x = (s % 1000) / 1000 * S; s = (s * 16807) % 2147483647; const y = (s % 1000) / 1000 * S; ctx.globalAlpha = 0.3 + 0.5 * ((i * 37) % 10) / 10; ctx.fillStyle = '#e8eeff'; ctx.fillRect(x, y, 1.4, 1.4); }
    ctx.restore();
    // the cut line (beat 1): white core, violet halo
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = vio; ctx.lineWidth = lw * 1.8; ctx.globalAlpha = 0.6 * (1 - p2 * 0.6);
    const L = p1;
    ctx.beginPath(); ctx.moveTo(c - R0 * 0.95, c + R0 * 0.95); ctx.lineTo(c - R0 * 0.95 + R0 * 1.9 * L, c + R0 * 0.95 - R0 * 1.9 * L); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = lw * 0.5; ctx.globalAlpha = 1 - p2 * 0.7; ctx.stroke();
    ctx.restore();
    // the sword silhouette (beat 2): blade along the diagonal, cloud guard, star river up the middle
    if (p2 > 0) {
      ctx.save();
      ctx.translate(c, c); ctx.rotate(Math.PI / 4);
      const bl = R0 * 1.5, bw = R0 * 0.16;
      ctx.globalAlpha = p2;
      ctx.beginPath(); ctx.moveTo(-bw, R0 * 0.55); ctx.lineTo(-bw * 0.85, -bl * 0.62); ctx.lineTo(0, -bl * 0.78); ctx.lineTo(bw * 0.85, -bl * 0.62); ctx.lineTo(bw, R0 * 0.55); ctx.closePath();
      const gb = ctx.createLinearGradient(-bw, 0, bw, 0); gb.addColorStop(0, '#9aa6c8'); gb.addColorStop(0.5, '#f4f7ff'); gb.addColorStop(1, '#7c88aa');
      ctx.fillStyle = gb; ctx.fill(); ctx.lineWidth = lw * 0.35; ctx.strokeStyle = '#0b0d18'; ctx.stroke();
      // star river
      const rv = Math.min(1, p2 * 1.4);
      const gr = ctx.createLinearGradient(0, R0 * 0.5, 0, -bl * 0.6); gr.addColorStop(0, vio); gr.addColorStop(0.5, '#4f5dff'); gr.addColorStop(1, '#bcd2ff');
      ctx.fillStyle = gr; ctx.fillRect(-bw * 0.28, R0 * 0.5 - (R0 * 0.5 + bl * 0.55) * rv, bw * 0.56, (R0 * 0.5 + bl * 0.55) * rv);
      // guard + grip
      ctx.fillStyle = gold;
      ctx.beginPath(); ctx.ellipse(0, R0 * 0.6, bw * 2.6, bw * 0.55, 0, 0, Math.PI * 2); ctx.fill();
      for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * bw * 2.7, R0 * 0.52, bw * 0.55, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#20140c'; ctx.fillRect(-bw * 0.45, R0 * 0.66, bw * 0.9, R0 * 0.32);
      ctx.fillStyle = gold; ctx.beginPath(); ctx.arc(0, R0 * 1.02, bw * 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // the dipper drawn with the cut (beat 1), lit in beat 3
    const D = [[-0.62, 0.05], [-0.42, -0.1], [-0.18, -0.06], [-0.1, 0.14], [0.12, 0.2], [0.32, 0.32], [0.56, 0.36]].map(([x, y]) => [c + x * R0 * 0.95, c - R0 * 0.55 + y * R0 * 0.95]);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = gold; ctx.lineWidth = lw * 0.3; ctx.globalAlpha = 0.5 + 0.5 * p3;
    const nLink = Math.floor(p1 * 7.99);
    ctx.beginPath();
    [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]].slice(0, nLink).forEach(([a, b]) => { ctx.moveTo(...D[a]); ctx.lineTo(...D[b]); });
    ctx.stroke();
    D.forEach(([x, y], i) => { if (i >= nLink) return; ctx.globalAlpha = 0.6 + 0.4 * p3; ctx.fillStyle = i === 0 ? '#ffffff' : col; ctx.shadowColor = col; ctx.shadowBlur = S * 0.03 * (0.5 + p3); ctx.beginPath(); ctx.arc(x, y, S * (i === 0 ? 0.018 : 0.012), 0, Math.PI * 2); ctx.fill(); });
    ctx.restore();
    // beat 4: 天樞 (the first star) flares; headshot: a cross-star + a ring
    const fl = Math.sin(Math.PI * p4) + (o.head ? Math.max(0, 1 - Math.abs(t - 1.1) / 0.08) * 0.8 : 0);
    if (fl > 0.01) {
      const [x, y] = D[0];
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = '#ffffff'; ctx.shadowColor = col; ctx.shadowBlur = S * 0.05; ctx.lineWidth = lw * 0.35; ctx.globalAlpha = Math.min(1, fl);
      const Lr = S * 0.03 * (1.6 + fl * (o.head ? 3.6 : 2));
      ctx.beginPath(); ctx.moveTo(x - Lr, y); ctx.lineTo(x + Lr, y); ctx.moveTo(x, y - Lr); ctx.lineTo(x, y + Lr);
      if (o.head) { const q = Lr * 0.45; ctx.moveTo(x - q, y - q); ctx.lineTo(x + q, y + q); ctx.moveTo(x + q, y - q); ctx.lineTo(x - q, y + q); }
      ctx.stroke(); ctx.restore();
    }
    if (o.head && t > 1.0) {
      const u = Math.min(1, (t - 1.0) / 0.17), [x, y] = D[0];
      ctx.save(); ctx.globalAlpha = 1 - u; ctx.strokeStyle = col; ctx.lineWidth = lw * 0.35;
      ctx.beginPath(); ctx.arc(x, y, S * 0.02 + S * 0.35 * u, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
  },
});
// star skin for skill hits (星痕 / 橫天 / 天劍): white -> star blue -> nebula violet on a gold edge
SKINS.star = ['#ffffff', '#bcd2ff', '#9a7bff', '#e3b04b'];

export { SFX as STARSWORD_SFX };
