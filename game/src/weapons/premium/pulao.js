// 蒲牢．鐘吼 Pulao Bellroar — 神兵 M08 (docs/PREMIUM_WEAPONS.md M08 card; the Appendix A def is in defs.js, the model
// tools/assets/weapons/pulao.mjs). Mechanics on the specials v2 engine (registerSpecial 'pulao' + skills) and the
// presentation (viewmodel driver, clips, crosshair, kill mark, FX) live in this file; the summoned bells are
// pulao_fx.js.
//   fire     鐘霰 (pump, 9 x 26): out of the bell mouth a hollow bronze / cyan sound-wave crown (three concentric rings,
//            gilt streaks off the rim, centre clear) and a 40 ms gold light on the bronze; the bell mouth shivers, the 蒲牢
//            on the receiver flinches up, the bells swing with the kick. Each struck body shows a bronze sound ring
//            where the pellets landed (bigger for more pellets, a cyan second ring on a headshot); a volley that kills
//            two or more stops 70 ms with a FOV punch. A trigger pull that hit anything counts once: every 8 load a
//            鐘彈 (<= 3): the next bell on the rack rings, its clapper turns gilt, a ding (rising per bell)
//   pump     normal pump; with a bell shell loaded the pump ends in a wrist flick that rings all three bells
//   ◎ / RMB  鐘彈 bellShell (1 bell): a gilt slug with a sound-wave wake; over its impact a 3 m translucent bronze bell
//            drops 6 m and tolls three times 0.4 s apart (each a whole tone higher: 4.5 m, 140 + knockback, a ground
//            ring, dust, a faint screen ripple, shake), then two cyan sound pillars rise and toss what stands in them 4 m
//   ★ / Q    警世 knell (20 s): one 8 m toll round the caster: every zombie staggers 0.8 s, elites / bosses wear a gold
//            outline and ring marker 5 s (every client draws them), cloud sigil flash, three ground rings, the gun snaps up
//   hold Q   百八鐘 bell108 (鐘吼 from ~4,500 damage): the gun points at the sky (CARD) -> a 7 m cloud sigil at the crosshair
//            and a 6 m bell with 蒲牢 coiled on its crown appearing high above it -> it slams down (3 m trapped 2.4 s,
//            shake, dust, a cracked floor) -> nine tolls quickening 0.4 -> 0.2 s (7 m, 200 each; 蒲牢 roars on every third)
//            -> on the ninth it bursts into 32 bronze shards (50 each) with a 100 ms stop
//   crisis   金鐘罩: a translucent bronze bell drops over the player for 1 s, zombies within 4 m knocked back
//   aura     鐘聲護體: every toll (鐘彈, 警世, 百八鐘) gives each player in its reach 5 armour (each client its own player)
//   KE_BELL  a kill sends out concentric sound waves (upright, camera-facing) and a ground ring; the wave's last kill drops
//            a small bell that tolls once (KE_FINAL, no damage)
// Teammates replay every skill from its network event (visuals, their own armour; the host applies stagger / trap /
// toss). Sound cues (§1.12): see SFX (a later stage produces them; a missing one falls back to an existing sample or
// stays silent; the gun's own pulao_close / _tail fall back to the stock shotgun).
import * as THREE from 'three';
import { registerSpecial, registerSkill, startSkill, meterAdd, canCast } from '../specials.js';
import { registerClip, shellStart, shellInsert, shellEnd, pumpCycle } from '../../player/clips.js';
import { registerCrosshair, injectCSS } from '../../ui/crosshairs.js';
import { registerKillMark } from '../../ui/killmarks.js';
import { SKINS } from '../../ui/dmgnums.js';
import { FRAME, DECAL, DECAL_TINT } from '../../fx/fx.js';
import { SHELL } from '../../fx/zfx.js';
import { clipComfort } from '../arsenal.js';
import { bellSpirit, bellParts } from './pulao_fx.js';

const ID = 'pulao';
const GOLD = [3.4, 2.3, 0.75];      // HDR rim gold (#ffc74a)
const BRONZE = [1.5, 0.95, 0.42];   // lit bronze (#c99a4b)
const CYAN = [1.3, 3.2, 4.6];       // sound-wave cyan (#7fd8ff)
const WHITE = [4.6, 4.7, 4.4];
const DEEP = [0.8, 0.42, 0.12];
const GH = '#ffc74a', CY = '#7fd8ff';
const UP = new THREE.Vector3(0, 1, 0);
const V3 = () => new THREE.Vector3();
const _a = V3(), _b = V3(), _c = V3(), _d = V3(), _e = V3(), _f = V3();
const R = Math.random;
const TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const shake = (g, a) => { if (clipComfort.shake) g.addShake?.(a); };
const TONE = 1.1225;                // a whole tone
// 百八鐘: nine tolls on an original rising pentatonic line
const PENTA = [1, 1.125, 1.25, 1.5, 1.667, 2, 2.25, 2.5, 3];
// sound cues: name -> fallback (existing sample) | null
const SFX = {
  pulao_fire: null, pulao_hit: null, pulao_head: null, pulao_kill: 'bifang_bell', pulao_bell_load: 'bifang_bell', pulao_bells: 'bifang_bell',
  pulao_flick: 'bifang_bell', pulao_clink: null, pulao_roar: null, pulao_roar_low: null, pulao_draw_first: 'cloth', pulao_inspect: null,
  pulao_pump_flick: 'cloth', pulao_bellshot: 'shotgunHeavy_close', pulao_bell_whoosh: null, pulao_bell_land: 'debris_fall', pulao_toll: 'explosion_far',
  pulao_pillar: null, pulao_knell: 'explosion_far', pulao_mark: null, pulao_ult_inhale: null, pulao_ult_creak: null, pulao_ult_slam: 'explosion_large',
  pulao_ult_toll: 'explosion_far', pulao_ult_shatter: 'impact_glass', pulao_ult_tail: null, pulao_ult_bed: null, pulao_crisis: 'crisis_break',
  pulao_final: null, pulao_idle: null, pulao_ready_bell: 'bifang_bell', pulao_armor: null, pulao_bite: 'cloth',
};
function sfx(g, name, o = {}) {
  const au = g.audio;
  if (!au) return null;
  if (au.has?.(name)) return au.play(name, o);
  const fb = SFX[name];
  return fb ? au.play(fb, { ...o, volume: (o.volume ?? 1) * 0.6 }) : null;
}

// ------------------------------------------------------------------------------------------ per-weapon state
function plOf(ws) {
  return ws.sp.pl || (ws.sp.pl = { q: [], hits: 0, shotHit: false, vol: new Map(), shotKills: 0, view: { w: null }, readyN: false, readyT: 0, finalWave: -1, ult: null, bells: -1 });
}
/** Game-time delayed calls (hitstop / stepped frames safe), run from the special's tick. */
function later(ws, sec, fn) { plOf(ws).q.push([sec, fn]); }
function runQueue(pl, dt) { const q = pl.q; for (let i = q.length - 1; i >= 0; i--) if ((q[i][0] -= dt) <= 0) { const f = q[i][1]; q.splice(i, 1); f(); } }

// ------------------------------------------------------------------------------------------ zombie effects
// 警世 outline: a gold rim with a slow pulse, over the elite purple (prio 2) and under the kill flashes
SHELL.pulao_mark ??= { col: [2.6, 1.7, 0.45], amt: 0.55, hz: 1.6, depth: 0.25, fres: 1, exp: 2.4, prio: 4 };
// a body struck by a toll: a short bronze rim ring (the sound passing through it)
SHELL.pulao_toll ??= { col: [2.2, 1.4, 0.4], amt: 0.5, fres: 0.95, exp: 2.2, prio: 3, decay: true };
/** host: hold a zombie in a stagger for `dur` s (the state ends at stateT 0.55) */
function stagger(g, z, dur) {
  if (!g.zombies?.authority || !z.alive || z.puppet) return;
  if (z.state !== 'chase' && z.state !== 'attack' && z.state !== 'stagger' && z.state !== 'idle' && z.state !== 'wander') return;
  const d = z.def?.boss ? Math.min(0.35, dur) : dur;
  z.state = 'stagger'; z.stateT = 0.55 - d;
  z.playOnce?.(z.actions?.stagger ? 'stagger' : 'hit_front', { fade: 0.08, speed: 1.1 });
}
/** host: throw a zombie straight up to about h metres (zombie gravity 15 m/s²) */
function toss(g, z, h) { if (g.zombies?.authority && z.alive && z.kvel && !z.def?.boss) z.kvel.y = Math.max(z.kvel.y || 0, Math.sqrt(30 * h)); }
/** every client: an elite / boss in reach wears the gold outline and a spinning ring marker */
function markElite(g, z, dur) {
  if (!z.alive || !(z.elite || z.def?.boss || z.def?.elite)) return false;
  g.zombies?.status?.(z, 'pulao_mark', dur);
  g.fx?.zfx?.marks?.add('ring', { follow: z, oy: (z.height ?? 1.8) + 0.5, life: dur, size: 0.36, color: [3.2, 2.2, 0.7, 0.95], spin: 2.2, fadeIn: 0.15 });
  return true;
}
/** 鐘聲護體: this client's own player within r of c regains `n` armour (every client runs the toll) */
function armorAura(g, c, r, n = 5) {
  const p = g.player, st = g.status;
  if (!p || !st?.alive || st.downed || p.pos.distanceTo(c) > r) return;
  const max = st.maxArmor ?? 100, before = st.armor || 0;
  st.armor = Math.min(max, before + n);
  if (st.armor > before + 0.5) { sfx(g, 'pulao_armor', { volume: 0.35 }); if (clipComfort.overlay) g.fx?.overlay?.tint?.([1.0, 0.75, 0.3], 0.05, 0.25, { fadeIn: 0.03, fadeOut: 0.2 }); }
}

// ------------------------------------------------------------------------------------------ small FX
/**
 * Muzzle crown per shot (§1.7.1 beat 4: "古銅色加青色的同心聲波槍口焰，中心挖空"): three hollow rings punched out of
 * the bell mouth (gold 0.36 m, cyan 0.22, white 0.13), a dozen gilt streaks leaving the rim (never the centre), a breath
 * of bronze dust, and a 40 ms gold light just ahead of the mouth so the bronze flashes. Viewmodel layer; the gun's own
 * fireball is kept small (def.fx.flashScale). k > 1: the bell shell's bigger gold burst.
 */
function crown(g, n, k = 1) {
  const vm = g.vm, P = g.fx?.particles, c0 = vm?.socketCam?.('muzzle', _a);
  if (!P || !c0) return;
  const f = _b.set(0, 0, -1).applyQuaternion(vm.gunRoot.quaternion);
  const u = _c.set(0, 1, 0).applyQuaternion(vm.gunRoot.quaternion), w = _d.crossVectors(f, u).normalize();
  const c = _f.copy(c0).addScaledVector(f, 0.03);
  const rot = (n % 2) * 0.26;
  // the rings: outer gold, cyan, a thin white inner one; all hollow
  P.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, mode: 'flat', dir: [f.x, f.y, f.z], life: 0.13 * k, size: 0.07, size1: 0.36 * k, sizePow: 0.42, color: [GOLD[0], GOLD[1], GOLD[2], 1], color1: [DEEP[0] * 0.3, DEEP[1] * 0.3, DEEP[2] * 0.3, 0], frame: FRAME.thinRing, rot });
  P.spawn({ additive: true, vm: true, x: c.x + f.x * 0.02, y: c.y + f.y * 0.02, z: c.z + f.z * 0.02, mode: 'flat', dir: [f.x, f.y, f.z], life: 0.1 * k, delay: 0.012, size: 0.05, size1: 0.22 * k, sizePow: 0.5, color: [CYAN[0], CYAN[1], CYAN[2], 1], color1: [0, 0, 0, 0], frame: FRAME.thinRing, rot: rot + 0.5 });
  P.spawn({ additive: true, vm: true, x: c.x + f.x * 0.04, y: c.y + f.y * 0.04, z: c.z + f.z * 0.04, mode: 'flat', dir: [f.x, f.y, f.z], life: 0.07 * k, delay: 0.024, size: 0.03, size1: 0.13 * k, sizePow: 0.5, color: [WHITE[0] * 0.7, WHITE[1] * 0.7, WHITE[2] * 0.7, 1], color1: [0, 0, 0, 0], frame: FRAME.thinRing, rot: rot + 1.1 });
  // gilt streaks off the rim (radial, starting at the lip radius: the centre stays clear)
  const ns = Math.round(12 * k);
  for (let i = 0; i < ns; i++) {
    const a = rot + (i / ns) * TAU + R() * 0.2, col = i % 3 ? GOLD : CYAN, L = 0.8 + R() * 0.6;
    _e.copy(u).multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a));
    P.spawn({ additive: true, vm: true, x: c0.x + _e.x * 0.032, y: c0.y + _e.y * 0.032, z: c0.z + _e.z * 0.032,
      vx: (_e.x * 3.2 + f.x * 1.6) * L, vy: (_e.y * 3.2 + f.y * 1.6) * L, vz: (_e.z * 3.2 + f.z * 1.6) * L, life: 0.08, size: 0.006, stretch: 0.03 * L,
      color: [col[0] * 1.4, col[1] * 1.4, col[2] * 1.4, 1], color1: [col[0] * 0.15, col[1] * 0.15, col[2] * 0.15, 0], frame: FRAME.spark, drag: 8 });
  }
  // a breath of bronze dust and smoke rolling out of the bell
  for (let i = 0; i < 2; i++) P.spawn({ vm: true, x: c.x, y: c.y, z: c.z, vx: f.x * 0.6 + (R() - 0.5) * 0.15, vy: f.y * 0.6 + 0.06, vz: f.z * 0.6 + (R() - 0.5) * 0.15,
    life: 0.5, size: 0.04, size1: 0.14, sizePow: 0.5, color: [0.62, 0.55, 0.45, 0.22], color1: [0.62, 0.55, 0.45, 0], frame: FRAME.smoke + (i % 2), drag: 3, inertia: 0.6 });
  P.spawn({ additive: true, vm: true, x: c0.x, y: c0.y, z: c0.z, life: 0.04, size: 0.05, size1: 0.02, color: [5, 4, 2, 1], color1: [1, 0.6, 0.2, 0], frame: FRAME.glow });
  const mw = vm.socketWorld?.('muzzle', _e);
  if (mw && g.fx?.lights) { mw.addScaledVector(vm.socketDir?.('muzzle', _f) || _f.set(0, 0, -1), 0.12); mw.y += 0.04; g.fx.lights.flash(mw, k > 1 ? 0xffd27a : 0xffc070, 0.6 * k, 1.6, 0.04); }
}
/** Sound ring on a struck body (one a target a volley): bronze, cyan inside on a headshot, gilt sparks; n = pellets in it. */
function impactRing(g, p, n, head) {
  const P = g.fx?.particles;
  if (!P) return;
  const k = Math.min(1.6, 0.6 + n * 0.12) * (head ? 1.3 : 1);
  P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.16, size: 0.12 * k, size1: 0.75 * k, sizePow: 0.45, color: [GOLD[0] * 0.8, GOLD[1] * 0.8, GOLD[2] * 0.8, 0.9], color1: [DEEP[0] * 0.2, DEEP[1] * 0.2, DEEP[2] * 0.2, 0], frame: FRAME.thinRing, rot: R() * 6, far: 'sqrt' });
  P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, delay: 0.03, life: 0.14, size: 0.08 * k, size1: 0.45 * k, sizePow: 0.5, color: [BRONZE[0], BRONZE[1], BRONZE[2], 0.7], color1: [0, 0, 0, 0], frame: FRAME.thinRing, rot: R() * 6, far: 'sqrt' });
  if (head) P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.17, size: 0.16, size1: 0.95, sizePow: 0.4, color: [CYAN[0], CYAN[1], CYAN[2], 0.85], color1: [0, 0, 0, 0], frame: FRAME.thinRing, rot: R() * 6, far: 'sqrt' });
  P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.07, size: 0.26 * k, size1: 0.08, color: [WHITE[0] * 0.8, WHITE[1] * 0.7, WHITE[2] * 0.5, 1], color1: [...GOLD, 0], frame: FRAME.glint, rot: R() * 6 });
  g.fx?.sparkBurst?.(p, { color: GOLD, color1: DEEP, count: Math.round(3 + n * 0.6), speed: 4.5, glow: 0.3 });
}
/** a faint concentric screen ripple (viewmodel layer, centred, its middle clear): the toll passing the caster */
function ripple(g, k = 1) {
  if (!clipComfort.overlay) return;
  const P = g.fx?.particles;
  for (let i = 0; i < 2; i++) P?.spawn({ additive: true, vm: true, x: 0, y: 0, z: -0.45, mode: 'flat', dir: [0, 0, 1], delay: i * 0.07, life: 0.45, size: 0.18, size1: 0.95, sizePow: 0.6,
    color: [GOLD[0] * 0.05 * k, GOLD[1] * 0.05 * k, GOLD[2] * 0.06 * k, 1], color1: [0, 0, 0, 0], frame: FRAME.thinRing, rot: i });
}
/**
 * A bell toll on the ground at c (radius r): two expanding rings (gold, cyan), a fast faint fill, dust kicked out at the
 * edge, bronze sparks and a light. k scales the spectacle (the ultimate's bell: 1.4).
 */
function tollFx(g, c, r, k = 1, rand = R) {
  const fx = g.fx, P = fx?.particles;
  fx?.shockwave(_a.set(c.x, c.y + 0.06, c.z), { normal: UP, r0: 0.4, r1: r, life: 0.42, color: [GOLD[0] * 0.9, GOLD[1] * 0.9, GOLD[2] * 0.9], thin: false });
  fx?.shockwave(_a.set(c.x, c.y + 0.08, c.z), { normal: UP, r0: 0.3, r1: r * 0.78, life: 0.32, color: CYAN, thin: true });
  P?.spawn({ additive: true, x: c.x, y: c.y + 0.05, z: c.z, mode: 'flat', dir: [0, 1, 0], life: 0.22, size: r * 0.4, size1: r * 2.05, sizePow: 0.4, color: [0.9 * k, 0.6 * k, 0.2 * k, 0.5], color1: [0, 0, 0, 0], frame: FRAME.glow });
  const nd = Math.round(10 * k);
  for (let i = 0; i < nd; i++) {
    const a = (i / nd) * TAU + rand() * 0.4;
    fx?.knockDust?.(_b.set(c.x + Math.cos(a) * r * 0.82, c.y, c.z + Math.sin(a) * r * 0.82), _e.set(Math.cos(a) * 6, 0, Math.sin(a) * 6), 1.1 * k);
  }
  fx?.sparkBurst?.(_b.set(c.x, c.y + 0.5, c.z), { color: GOLD, color1: DEEP, count: Math.round(10 * k), speed: 7, glow: 0.6 });
  fx?.lights?.flash(_b.set(c.x, c.y + 1.4, c.z), 0xffc74a, 18 * k, r * 2.2, 0.16);
}
/** The bell's drop from the sky: a falling streak of light and the whoosh. */
function dropStreak(g, from, to) {
  g.fx?.beam?.(from.clone(), to.clone(), { core: [GOLD[0] * 0.3, GOLD[1] * 0.3, GOLD[2] * 0.3], glow: [0.3, 0.18, 0.05], wCore: 0.025, wGlow: 0.6, life: 0.2, shrink: 0.6 });
}
/** heavy-hit feel: a short stop (rate-limited) + shake; big = a FOV punch too */
function heavy(ws, g, stop, trauma, big = false) {
  const pl = plOf(ws);
  if (big ? g.time - (pl.bigAt ?? -9) > 0.12 : g.time - (pl.stopAt ?? -9) > 0.25) {
    pl.stopAt = g.time;
    if (big) pl.bigAt = g.time;
    if (clipComfort.hitstop) g.hitStop?.(stop);
    if (big) g.arsenal?.fovKick?.(-2.4, 0.18);
  }
  shake(g, trauma);
}

// KE_BELL (§1.10): concentric sound waves out of the body, upright and facing the camera (gold -> cyan), a ground ring,
// gilt sparks and the ding; bosses get it bigger. A guest's unconfirmed kill shows it too (it is only light).
SHELL.pulao_kill ??= { col: [2.6, 1.7, 0.5], amt: 0.6, fres: 0.9, exp: 1.9, prio: 9, decay: true };
function killFx(ws, g, z, p, head = false) {
  const P = g.fx?.particles, fx = g.fx;
  const c = z.center ? z.center(V3()) : p.clone(), boss = !!z.def?.boss, k = boss ? 2 : 1;
  g.zombies?.status?.(z, 'pulao_kill', 0.18);
  for (let i = 0; i < 3; i++) {
    const col = i === 1 ? CYAN : GOLD;
    P?.spawn({ additive: true, x: c.x, y: c.y, z: c.z, delay: i * 0.07, life: 0.38, size: 0.25 * k, size1: (1.5 + i * 0.6) * k, sizePow: 0.5, color: [col[0] * 0.9, col[1] * 0.9, col[2] * 0.9, 0.9], color1: [0, 0, 0, 0], frame: FRAME.thinRing, rot: R() * 6, far: 'sqrt' });
  }
  const fy = z.pos?.y ?? c.y - 0.9;
  fx?.shockwave(_a.set(c.x, fy + 0.06, c.z), { normal: UP, r0: 0.2, r1: 1.8 * k, life: 0.4, color: [GOLD[0] * 0.8, GOLD[1] * 0.8, GOLD[2] * 0.8], thin: true });
  P?.spawn({ additive: true, x: c.x, y: c.y, z: c.z, life: 0.12, size: 0.9 * k, size1: 0.3, color: [4, 3, 1.4, 1], color1: [...GOLD, 0], frame: FRAME.glow });
  fx?.sparkBurst?.(c, { color: GOLD, color1: DEEP, count: 12 * k, speed: 5.5, glow: 0.5 });
  if (head) fx?.motes?.burst?.('shard', c, 5, { palette: [[0.7, 0.5, 0.24], [0.95, 0.72, 0.3]], speed: 3.2, spread: 0.9, radius: 0.15, scale: 1.1 });
  sfx(g, 'pulao_kill', { pos: c, volume: 0.8, pitch: head ? 2 : 1 });
  // KE_FINAL (§1.10): the wave's last kill drops a small bell there that tolls once (no damage, once a wave)
  const m = g.match, pl = plOf(ws);
  pl.shotKills++;
  if (m && m.state === 'round' && (m.queue?.length ?? 1) + (g.zombies?.alive ?? 1) <= 0 && pl.finalWave !== m.round) {
    pl.finalWave = m.round;
    const ev = { type: 'skill', id: 'pulao_final', w: ID, slot: 'fx', seed: (R() * 2147483647) | 0, pos: [z.pos.x, z.pos.y, z.pos.z], dir: [0, 0, -1], by: g.localId, ph: 0 };
    startSkill(g, ev, { ws: null, local: true });
    g.net?.sendSkill?.(ev);
  }
}

// ------------------------------------------------------------------------------------------ viewmodel driver
const ps = (vm, name) => vm.partState[name] || (vm.partState[name] = { v: 0 });
/** strike bell i (1..3, 0 = all): a pendulum kick and a short ring (scale shiver), gilt glint */
function strike(g, ws, i = 0, k = 1, glint = true) {
  const w = g.vm?.weapon, pl = plOf(ws);
  if (!w?.parts?.fx_bell1) return;
  for (const n of i ? [i] : [1, 2, 3]) {
    const p = w.parts['fx_bell' + n], pe = p?.motion?.pend;
    if (pe) { pe.vx += (R() - 0.3) * 3.2 * k; pe.vz += (R() < 0.5 ? -1 : 1) * 4.2 * k; }
    (pl.ring ||= [0, 0, 0, 0])[n] = 1;
    if (glint) {
      const c = g.vm.socketCam('bell' + n, _a);
      if (c) g.fx?.particles.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, life: 0.3, size: 0.03, size1: 0.006, color: [...WHITE, 1], color1: [...GOLD, 0], frame: FRAME.glint, rot: R() * 6 });
    }
  }
}
/** a bell shell loads: bell n rings and its clapper turns gilt, a ding rising per bell */
function bellLoaded(ws, g, n) {
  if (g.arsenal?.current !== ws) return;
  strike(g, ws, n, 0.8);
  sfx(g, 'pulao_bell_load', { volume: 0.55, pitch: Math.pow(TONE, n - 1) * 1.5 });
  const c = g.vm?.socketCam?.('bell' + n, _a);
  if (c) for (let i = 0; i < 6; i++) g.fx?.particles.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, vx: (R() - 0.5) * 0.25, vy: 0.08 + R() * 0.2, vz: (R() - 0.5) * 0.25, life: 0.45, size: 0.004, size1: 0.001, color: [...GOLD, 1], color1: [...DEEP, 0], frame: FRAME.glow, inertia: 0.5 });
  g.vm?.glowTo?.(2.4, 0.06, { mat: 'glow_gold' });
  later(ws, 0.12, () => g.vm?.glowTo?.(1, 0.4, { mat: 'glow_gold' }));
  g.arsenal?._clipHaptic?.('tick');
}
/** the cyan sound-wave ring surfacing inside the bell mouth (first draw, ready, inspect) */
function mouthWave(g, k = 1) {
  const vm = g.vm, P = g.fx?.particles, c = vm?.socketCam?.('bellmouth', _a);
  if (!P || !c) return;
  const f = _b.set(0, 0, -1).applyQuaternion(vm.gunRoot.quaternion);
  for (let i = 0; i < 3; i++) P.spawn({ additive: true, vm: true, x: c.x + f.x * 0.01 * i, y: c.y + f.y * 0.01 * i, z: c.z + f.z * 0.01 * i, mode: 'flat', dir: [f.x, f.y, f.z], delay: i * 0.09, life: 0.5,
    size: 0.03, size1: 0.07 * k, sizePow: 0.6, color: [CYAN[0], CYAN[1], CYAN[2], 1], color1: [0, 0, 0, 0], frame: FRAME.thinRing, rot: i });
  vm.glowTo?.(2.2 * k, 0.1, { mat: 'glow_ice' });
  setTimeout(() => vm.glowTo?.(1, 0.6, { mat: 'glow_ice' }), 260);   // presentation only: wall clock is fine
}
/** the 蒲牢's eyes catch a glint (viewmodel layer) */
function eyes(g, k = 1) {
  const vm = g.vm, P = g.fx?.particles;
  for (const s of ['eye_r', 'eye_l']) {
    const c = vm?.socketCam?.(s, _a);
    if (c) P?.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, life: 0.36 * k, size: 0.013, size1: 0.004, color: [...WHITE, 1], color1: [...GOLD, 0], frame: FRAME.glint, rot: R() * 6 });
  }
}
/** a roar: the head rears, the jaw gapes, a breath of gold dust out of the mouth */
function roar(g, ws, k = 1) {
  const vm = g.vm, pl = plOf(ws), c = vm?.socketCam?.('mouth', _a);
  pl.view.roarT = 0.55 * k;
  eyes(g, k);
  sfx(g, 'pulao_roar', { volume: 0.55 * k });
  if (c) {
    const f = _b.set(0, 0.35, -1).normalize().applyQuaternion(vm.gunRoot.quaternion);
    for (let i = 0; i < 6; i++) g.fx?.particles.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, vx: f.x * 0.25 + (R() - 0.5) * 0.08, vy: f.y * 0.25 + R() * 0.08, vz: f.z * 0.25, life: 0.4, size: 0.003, size1: 0.009, color: [...GOLD, 1], color1: [...DEEP, 0], frame: FRAME.glow, inertia: 0.6 });
  }
}

/** Per frame while held: bell beads, head / jaw life, the loading shell, idle hum and life, ready beats. */
function view(ws, g, dt) {
  const vm = g.vm, w = vm?.weapon, pl = plOf(ws), ar = g.arsenal;
  if (!w?.parts?.fx_pulao || w.def !== ws.def) return;
  const v = pl.view;
  if (v.w !== w) {
    // fresh viewmodel (equip): procedural part motions after the clip / pendulum pass
    Object.assign(v, { w, t: 0, head: 0, jaw: 0, roarT: 0, glintT: 1, flickT: 14, clinkT: 0, mouth: 0, kickH: 0 });
    w.onParts = (vm2, dt2) => onParts(ws, vm2, dt2);
    pl.bells = -1;
  }
  v.t += dt;
  if (!pl.hum && g.audio?.has?.('pulao_idle')) pl.hum = sfx(g, 'pulao_idle', { loop: true, volume: 0.1, fadeIn: 0.4 });
  // ---- loaded bell shells: the gilt clapper beads, one per bell
  const n = Math.floor((ws.sp.m?.bell ?? 0) + 1e-6);
  for (let i = 1; i <= 3; i++) ps(vm, 'fx_lit' + i).hidden = i > n;
  pl.bells = n;
  // ---- the loading shell shows only in the shell clips
  ps(vm, 'shell').hidden = !(ar?.state === 'reload' && ar.shellReload);
  // ---- 蒲牢 head: breathes at rest, flinches up on each shot, rears for roars / ready, gapes when ready
  const ready = canCast(ws, 'ult').ok, act = !!pl.ult;
  v.kickH = Math.max(0, v.kickH - dt * 4);
  v.roarT = Math.max(0, v.roarT - dt);
  const want = act ? 0.9 : v.roarT > 0 ? 0.85 : ready ? 0.3 + 0.06 * Math.sin(v.t * 2.2) : 0.04 + 0.03 * Math.sin(v.t * 1.3);
  v.head = damp(v.head, want, v.roarT > 0 || act ? 14 : 6, dt);
  const hp = ps(vm, 'fx_pulao');
  hp.v = Math.min(1, v.head + v.kickH * 0.35);
  const jp = ps(vm, 'fx_jaw');
  v.jaw = damp(v.jaw, act || v.roarT > 0 ? 1 : ready ? 0.35 + 0.15 * Math.sin(v.t * 2.2 + 1) : 0.05, 10, dt);
  jp.v = v.jaw;
  // ---- ready (§1.7.1 beat 7): the head rears, roars once, the bells ring; again every 2.5 s
  if (ready && !act) {
    if (!pl.readyN) { pl.readyN = true; pl.readyT = 0; roar(g, ws, 1); strike(g, ws, 0, 0.8); mouthWave(g, 1.2); sfx(g, 'pulao_ready_bell', { volume: 0.4, pitch: 0.75 }); }
    else if ((pl.readyT += dt) >= 2.5) {
      pl.readyT = 0;
      // at rest the ready layer's 'pulao_ready' clip runs the gape; in a fight a softer beat here
      const calm = ar?.state === 'idle' && (ar.sinceShot ?? 9) > 1;
      if (g.hud?.settings?.readyReminder !== false && !calm) { eyes(g, 0.8); mouthWave(g, 0.8); sfx(g, 'pulao_ready_bell', { volume: 0.22, pitch: 0.75 }); }
    }
  } else pl.readyN = false;
  // ---- idle life: gold glints on the bronze, a bell flicked every ~14 s at rest (rare idle), a soft clink when they swing
  const idle = ar?.state === 'idle' && !vm.clip.active && (ar.sinceShot ?? 9) > 1.5 && !act;
  if (idle && (v.glintT -= dt) <= 0) {
    v.glintT = 0.7 + R() * 1.2;
    const c = vm.socketCam(['head', 'saddle', 'lip_top', 'bell2', 'ring_rear'][(R() * 5) | 0], _a);
    if (c) g.fx?.particles.spawn({ additive: true, vm: true, x: c.x + (R() - 0.5) * 0.04, y: c.y + (R() - 0.3) * 0.02, z: c.z + (R() - 0.5) * 0.04, life: 0.45, size: 0.005, size1: 0.001, color: [3.4, 2.6, 1.2, 1], color1: [1.4, 0.8, 0.2, 0], frame: FRAME.glint, rot: R() * 6, inertia: 0.6 });
  }
  if (idle && (ar.sinceShot ?? 9) > 3 && (v.flickT -= dt) <= 0) { v.flickT = 13 + R() * 4; ar.playClip('pulao_flick'); }
  // the bells knock together when they swing hard (a very soft clink, rate-limited)
  const b2 = w.parts.fx_bell2?.motion?.pend;
  if (b2 && (v.clinkT -= dt) <= 0 && Math.hypot(b2.vx, b2.vz) > 7) { v.clinkT = 0.35; sfx(g, 'pulao_clink', { volume: 0.12 }); }
}
/** procedural part motions (after the clip / pendulum pass): the bell mouth's ring shiver, struck bells humming */
function onParts(ws, vm, dt) {
  const pl = plOf(ws), w = vm.weapon, v = pl.view;
  const m = w.parts.fx_mouth;
  if (m && v.mouth > 0.001) {
    v.mouthT = (v.mouthT || 0) + dt;
    const k = v.mouth * Math.sin(v.mouthT * TAU * 34);
    m.node.scale.set(1 + k * 0.022, 1 + k * 0.022, 1 - k * 0.01);
    v.mouth *= Math.exp(-10 * dt);
  }
  const ring = pl.ring || [];
  for (let i = 1; i <= 3; i++) {
    if (!(ring[i] > 0.01)) continue;
    const p = w.parts['fx_bell' + i];
    if (p) { const k = ring[i] * Math.sin(vm.time * TAU * 26 + i); p.node.scale.multiplyScalar(1 + k * 0.035); }
    ring[i] *= Math.exp(-6 * dt);
  }
}
function ringMouth(ws, k = 1) { const v = plOf(ws).view; v.mouth = Math.max(v.mouth || 0, k); v.mouthT = 0; }

function plEvent(ws, g, a) {
  const vm = g.vm, pl = plOf(ws), what = typeof a === 'string' ? a : a?.do;
  if (what === 'light') { strike(g, ws, a.i, 0.8); sfx(g, 'pulao_bell_load', { volume: 0.6, pitch: Math.pow(TONE, a.i - 1) * 1.5 }); g.arsenal?._clipHaptic?.('tick'); }
  else if (what === 'strike') strike(g, ws, a?.i ?? 0, a?.k ?? 1);
  else if (what === 'ring3') { strike(g, ws, 0, 1); sfx(g, 'pulao_bells', { volume: 0.55, pitch: 1.5 }); later(ws, 0.06, () => sfx(g, 'pulao_bells', { volume: 0.4, pitch: 1.5 * TONE * TONE })); }
  else if (what === 'flick') { strike(g, ws, a.i, 1.2); sfx(g, 'pulao_flick', { volume: 0.6, pitch: [1.5, 1.5 * TONE, 1.5 * TONE * TONE, 2.4][(a.i || 1) - 1] }); }
  else if (what === 'roar') roar(g, ws, a?.k ?? 1);
  else if (what === 'mouthwave') mouthWave(g, a?.k ?? 1);
  else if (what === 'mouth') ringMouth(ws, a?.k ?? 1);
  else if (what === 'eyes') eyes(g, a?.k ?? 1);
  else if (what === 'first') sfx(g, 'pulao_draw_first', { volume: 0.8 });
  else if (what === 'world') { worldInspect(ws, g); sfx(g, 'pulao_inspect', { volume: 0.6 }); }
  else if (what === 'bite') { pl.view.roarT = 0.25; sfx(g, 'pulao_bite', { volume: 0.6 }); g.arsenal?._clipHaptic?.('tick'); }
  else if (what === 'flickpump') sfx(g, 'pulao_pump_flick', { volume: 0.5 });
}

/** 改變世界的檢視 (mythic inspect): the world dims to a bronze dusk with drifting gold dust for 2.5 s (this screen only). */
function worldInspect(ws, g) {
  const post = g.renderer?.post, pl = plOf(ws);
  if (!post || pl.dusk) return;
  const k = 0.82;
  post.exposure *= k;
  pl.dusk = true;
  if (clipComfort.overlay) g.fx?.overlay?.tint?.([1.0, 0.72, 0.36], 0.14, 2.5, { fadeIn: 0.4, fadeOut: 0.6 });
  const P = g.fx?.particles, cam = g.camera;
  for (let i = 0; i < 16; i++) {
    _a.set((R() - 0.5) * 5, (R() - 0.3) * 2.4, -1.5 - R() * 4).applyQuaternion(cam.quaternion).add(cam.position);
    P?.spawn({ additive: true, x: _a.x, y: _a.y, z: _a.z, vx: (R() - 0.5) * 0.1, vy: 0.04 + R() * 0.06, vz: (R() - 0.5) * 0.1, delay: R() * 0.8, life: 2.0, fadeIn: 0.3, size: 0.02, size1: 0.01, color: [2.2, 1.5, 0.5, 1], color1: [1.2, 0.7, 0.2, 0], frame: FRAME.glow, drag: 0.3 });
  }
  later(ws, 2.5, () => { post.exposure /= k; pl.dusk = false; });
}

/** First big bell drawn on a fresh match hitched: build the bell spirits, a sigil and a pillar once, far under the map. */
function prewarm(g) {
  g._plWarm = true;
  const fx = g.fx, far = V3().set(0, -500, 0);
  try {
    fx.sigils?.preload?.(['clouds']);
    fx.summons.ghost({ mesh: bellSpirit({ dragon: true }), pos: far, size: 0.02, appear: 0.01, life: 0.2, out: 0.01, big: false, opacity: 0.5 });
    fx.summons.ghost({ mesh: bellSpirit({ dragon: false }), pos: far, size: 0.02, appear: 0.01, life: 0.2, out: 0.01, big: false, opacity: 0.5 });
    fx.sigils?.sigil?.(far, { design: 'clouds', radius: 0.1, color: GOLD, color1: CYAN, life: 0.2 });
    fx.sigils?.pillar?.(far, { radius: 0.05, height: 0.1, life: 0.2, motes: 0, ring: false, light: 0 });
    fx.shockwave?.(far, { normal: UP, r1: 0.05, life: 0.1, thin: false });
  } catch (e) { console.warn('pulao prewarm', e); }
}

// ------------------------------------------------------------------------------------------ the special (engine overrides)
registerSpecial(ID, {
  init(ws) {
    plOf(ws);
    // decode the weapon's cues up front (samples are fetched on first play: the first toll would start late)
    const au = ws.game?.audio;
    if (au?.defs && !au._plPre) { au._plPre = true; au.preload?.(Object.keys(au.defs).filter((n) => /^(pulao_|ready_pulao)/.test(n)))?.catch?.(() => {}); }
  },
  onFire(ws, ctx) {
    const g = ctx.game, pl = plOf(ws), au = g.audio, held = g.arsenal?.current === ws;
    if (held) { crown(g, ws.shots); ringMouth(ws, 1); pl.view.kickH = 1; }
    // the gun's own set until the audio stage delivers it: the stock 12 gauge under the bell overtone
    if (au && !au.has?.('pulao_close')) { au.play('shotgun_close', { volume: 1 }); au.play('shotgun_tail', { volume: 0.9, delay: 0.015 }); }
    sfx(g, 'pulao_fire', { volume: 0.32 });   // bronze bell overtone ~10 dB under the shot (§1.12)
    // one count a trigger pull that hit anything; every `per` loads a bell shell (<= 3)
    if (pl.shotHit) {
      const per = ws.def.special.passive?.per ?? 8, m = ws.sp.m;
      if ((m.bell ?? 0) < 3) {
        pl.hits++;
        if (pl.hits >= per) { pl.hits = 0; meterAdd(ws, 'bell', 1); bellLoaded(ws, g, Math.floor(m.bell + 1e-6)); }
      }
      // one sound ring a struck body, sized by the pellets it took
      for (const [z, e] of pl.vol) impactRing(g, e.p, e.n, e.head);
      sfx(g, pl.anyHead ? 'pulao_head' : 'pulao_hit', { volume: 0.32 });
    }
    // a volley that dropped two or more: the multi-kill stop
    if (pl.shotKills >= 2) heavy(ws, g, 0.07, 0.16, true);
    else if (pl.shotKills === 1) heavy(ws, g, 0.045, 0.1, pl.anyHead);
    pl.vol.clear(); pl.shotHit = false; pl.anyHead = false; pl.shotKills = 0;
    // the spec's 6° camera rise is def.recoil; a little extra punch for the bronze
    g.punch?.impulse?.(-0.4 * 0.10472, (R() - 0.5) * 0.006, 0);
  },
  onHit(ws, info, res, target) {
    const g = ws.game, pl = plOf(ws), z = target?.zombie || target;
    if (!z?.center) return;
    const p = info.point || z.center(V3());
    if (info.skill || info.pl) { if (res?.killed) killFx(ws, g, z, p, false); return; }
    pl.shotHit = true;
    const e = pl.vol.get(z);
    if (e) { e.n++; e.head ||= !!info.headshot; } else pl.vol.set(z, { p: p.clone(), n: 1, head: !!info.headshot });
    if (info.headshot) pl.anyHead = true;
    if (res?.killed) killFx(ws, g, z, p, !!info.headshot);
  },
  update(ws, dt, g) { if (!g._plWarm && g.fx?.summons) prewarm(g); view(ws, g, dt); },
  tick(ws, dt, g) {
    const pl = plOf(ws);
    if (pl.hum && g.arsenal?.current !== ws) { pl.hum.stop?.(0.2); pl.hum = null; }
    runQueue(pl, dt);
  },
  dispose(ws) { const pl = ws.sp?.pl; if (!pl) return; pl.hum?.stop?.(0.1); pl.hum = null; pl.q.length = 0; },
  meterInfo(ws, key, m) {
    // the bell meter's progress towards the next shell (hits / 8) rides on its value; the segments light by raw
    if (key !== 'bell') return null;
    const per = ws.def.special.passive?.per ?? 8;
    return { ...m, value: Math.min(1, (m.raw + (m.raw < 3 ? plOf(ws).hits / per : 0)) / m.max), next: plOf(ws).hits / per };
  },
  onClipEvent(ws, name, arg, g) { if (name === 'pl') plEvent(ws, g, arg); },
});

// ------------------------------------------------------------------------------------------ skills
const plOfK = (k) => (k.ws ? plOf(k.ws) : null);
function later2(k, sec, fn) { (k.data.q ||= []).push([k.t + sec, fn]); }
function runLater2(k) { const q = k.data.q; if (!q) return; for (let i = q.length - 1; i >= 0; i--) if (k.t >= q[i][0]) { const f = q[i][1]; q.splice(i, 1); f(); } }
// translucent bronze: a warm body, a gold fresnel rim, the inner flow only a faint sound-cyan
const BELL_GHOST = { base: [0.5, 0.3, 0.11], core: [0.14, 0.3, 0.42], rim: [1.25, 0.72, 0.18], edge: [3.4, 2.2, 0.7], glaze: 1.5, rimPower: 2.6, flowSpeed: 0.3 };
/** distance from the caster's eye, scaled into a 0..1 shake */
const nearK = (k, c, r) => clamp(1 - k.game.camera.position.distanceTo(c) / r, 0, 1);
/** the n densest points (zombie positions) within r of c, at least sep apart (pillars, shards...) */
function densest(g, c, r, n, sep = 2) {
  const list = (g.zombies?.list || []).filter((z) => z.alive && z.pos.distanceTo(c) < r);
  const out = [];
  for (let k = 0; k < n; k++) {
    let best = null, bs = -1;
    for (const z of list) {
      if (out.some((p) => p.distanceTo(z.pos) < sep)) continue;
      let s = 0;
      for (const o of list) if (o.pos.distanceTo(z.pos) < 1.6) s++;
      if (s > bs) { bs = s; best = z; }
    }
    if (!best) break;
    out.push(best.pos.clone());
  }
  return out;
}

// 鐘彈 (◎): a gilt slug, then a bronze bell drops over the impact and tolls three times; two sound pillars toss.
registerSkill('pulao_bellShell', {
  level: 'L2', aim: 'target', defaults: { range: 40, drop: 6, rings: 3, every: 0.4, r: 4.5, dmg: 140, knock: 6, toss: 4, pillar: 1.3, pillarDmg: 40, zh: '鐘彈' },
  start(k) {
    const g = k.game, d = k.data, p = k.p;
    d.c = (k.at || k.feet()).clone();
    d.from = k.muzzle(V3());
    d.fly = clamp(d.from.distanceTo(d.c) / 160, 0.04, 0.24);
    d.beat = 0; d.toll = 0;
    k.dur = d.fly + 0.32 + p.every * p.rings + 0.9;
    d.trail = g.fx?.trail?.({ width: 0.09, life: 0.22, color: [GOLD[0] * 1.3, GOLD[1] * 1.3, GOLD[2] * 1.3, 1], color1: [CYAN[0] * 0.4, CYAN[1] * 0.4, CYAN[2] * 0.5, 0], taper: 0.1, segs: 18 });
    const cp = k.feet(V3());
    d.yaw = Math.atan2(cp.x - d.c.x, cp.z - d.c.z);
    sfx(g, 'pulao_bellshot', k.local ? { volume: 1 } : { pos: d.from, volume: 1 });
    if (!k.local) return;
    // the gun: a heavier kick, the gold burst out of the mouth, then the pump (the arsenal cycles it)
    const ar = g.arsenal, ws = k.ws;
    if (ar && ws && ar.current === ws) {
      if (ar.state === 'idle' || ar.state === 'cycle') { ar.vm.stopClip?.(); ar.state = 'idle'; ar.playClip('pulao_bellshot', { lock: true }); }
      ar.fireCd = Math.max(ar.fireCd, 60 / ws.def.rpm);
      ws.needsCycle = true; ar.sinceShot = 0;
      ar.vm.kick({ back: 0.11, up: 18, side: 2, roll: 6 });
      g.punch?.impulse?.(-9 * 0.0174, (R() - 0.5) * 0.02, 0);
      crown(g, 1, 1.6); ringMouth(ws, 1.4);
      shake(g, 0.28);
    }
  },
  update(k, dt) {
    runLater2(k);
    const g = k.game, d = k.data, p = k.p, fx = g.fx, t = k.t;
    // flight: a gilt slug, a sound-wave wake of thin rings behind it
    if (d.beat < 1) {
      const u = Math.min(1, t / d.fly), pos = _a.lerpVectors(d.from, d.c, u).add(_b.set(0, 0.3 * Math.sin(u * Math.PI) * 0.2, 0));
      d.trail?.push(pos);
      fx?.particles.spawn({ additive: true, x: pos.x, y: pos.y, z: pos.z, life: 0.05, size: 0.2, size1: 0.08, color: [...WHITE, 1], color1: [...GOLD, 0], frame: FRAME.glow });
      if ((d.wakeT = (d.wakeT ?? 0) - dt) <= 0) {
        d.wakeT = 0.02;
        _e.subVectors(d.c, d.from).normalize();
        fx?.particles.spawn({ additive: true, x: pos.x, y: pos.y, z: pos.z, mode: 'flat', dir: [_e.x, _e.y, _e.z], life: 0.22, size: 0.12, size1: 0.5, sizePow: 0.5, color: [GOLD[0] * 0.7, GOLD[1] * 0.7, GOLD[2] * 0.7, 0.8], color1: [0, 0, 0, 0], frame: FRAME.thinRing, rot: k.rng() * 6 });
      }
      if (u >= 1) {
        d.beat = 1; d.trail?.stop();
        // impact: a flash, sparks, then the bell drops from 6 m (a streak of light down to it)
        fx?.particles.spawn({ additive: true, x: d.c.x, y: d.c.y + 0.5, z: d.c.z, life: 0.14, size: 1.6, size1: 0.6, color: [4, 3.2, 1.6, 1], color1: [...GOLD, 0], frame: FRAME.glow });
        fx?.sparkBurst?.(_b.set(d.c.x, d.c.y + 0.3, d.c.z), { color: GOLD, color1: DEEP, count: 18, speed: 7, glow: 0.6 });
        const top = _b.set(d.c.x, d.c.y + p.drop + 3, d.c.z);
        dropStreak(g, top, d.c);
        d.ghost = fx?.summons?.ghost?.({ mesh: bellSpirit({ dragon: false }), pos: _e.set(d.c.x, d.c.y + p.drop, d.c.z), yaw: d.yaw, size: 3, motion: null, appear: 0.12, life: Infinity, out: 0.45, big: false,
          ...BELL_GHOST, opacity: 0.62, exit: { kind: 'shard', count: 26, palette: [[0.6, 0.42, 0.2], [0.9, 0.68, 0.3], [0.3, 0.5, 0.42]], speed: 3 }, seed: k.ev.seed });
        d.t0 = t;
        sfx(g, 'pulao_bell_whoosh', { pos: d.c, volume: 0.8 });
      }
      return;
    }
    const h = d.ghost, tt = t - d.t0;
    // the drop: 6 m in 0.3 s (eased in), a slam that kicks the dust out
    if (h?.alive) {
      const u = Math.min(1, tt / 0.3), y = d.c.y + p.drop * (1 - u * u);
      h.obj.position.set(d.c.x, y, d.c.z); h.base.copy(h.obj.position);
      // the tolls make it swing a little
      const sw = d.swing || 0;
      h.obj.rotation.set(Math.sin(tt * 18) * 0.06 * sw, d.yaw, Math.cos(tt * 15) * 0.05 * sw);
      d.swing = sw * Math.exp(-4 * dt);
    }
    if (d.beat < 2 && tt >= 0.3) {
      d.beat = 2;
      fx?.shockwave(_a.set(d.c.x, d.c.y + 0.05, d.c.z), { normal: UP, r0: 0.6, r1: 2.2, life: 0.3, color: BRONZE, thin: false });
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; fx?.knockDust?.(_b.set(d.c.x + Math.cos(a) * 1.2, d.c.y, d.c.z + Math.sin(a) * 1.2), _e.set(Math.cos(a) * 5, 0, Math.sin(a) * 5), 1); }
      sfx(g, 'pulao_bell_land', { pos: d.c, volume: 0.7 });
      if (k.local) shake(g, 0.15 * nearK(k, d.c, 25) + 0.05);
    }
    // three tolls, 0.4 s apart from the impact, each a whole tone higher
    while (d.toll < p.rings && tt >= p.every * (d.toll + 1)) {
      const i = d.toll++;
      d.swing = 1; h?.flash?.(0.45);
      tollFx(g, d.c, p.r, 1, k.rng);
      sfx(g, 'pulao_toll', { pos: d.c, volume: 1, pitch: Math.pow(TONE, i) });
      armorAura(g, d.c, p.r);
      if (k.local) {
        k.hurt(_a.set(d.c.x, d.c.y + 0.9, d.c.z), p.r, p.dmg, { knock: p.knock, stagger: 1, falloffMin: 0.6, explosive: false });
        shake(g, 0.25 * nearK(k, d.c, 30) + 0.06); ripple(g, 1);
        g.arsenal?._clipHaptic?.('thud');
      }
      for (const z of g.zombies?.inRadius?.(d.c, p.r) || []) g.zombies?.status?.(z, 'pulao_toll', 0.25);
      if (i === p.rings - 1) later2(k, 0.12, () => h?.dissolveOut?.(0.4));
    }
    // two cyan sound pillars rise on the densest groups (or either side of the impact) and toss them 4 m
    if (d.beat < 3 && tt >= 1.5) {
      d.beat = 3;
      let spots = densest(g, d.c, p.r + 0.5, 2, 2.2);
      const side = _e.set(Math.cos(d.yaw), 0, -Math.sin(d.yaw));
      while (spots.length < 2) spots.push(d.c.clone().addScaledVector(side, spots.length ? -1.6 : 1.6));
      for (const sp of spots) {
        sp.y = k.floorY(sp);
        fx?.sigils?.pillar?.(sp, { radius: p.pillar, height: 9, color: CYAN, color1: [0.5, 1.2, 2], life: 0.75, rise: true, motes: 10 });
        fx?.shockwave(_a.set(sp.x, sp.y + 0.05, sp.z), { normal: UP, r0: 0.2, r1: p.pillar * 1.6, life: 0.35, color: CYAN, thin: true });
        for (const z of g.zombies?.inRadius?.(sp, p.pillar) || []) toss(g, z, p.toss);
        if (k.local) k.hurt(_a.set(sp.x, sp.y + 0.9, sp.z), p.pillar, p.pillarDmg, { knock: 0.5, stagger: 1, falloffMin: 1, explosive: false });
      }
      sfx(g, 'pulao_pillar', { pos: d.c, volume: 0.9 });
    }
  },
  end(k) { k.data.trail?.stop?.(); k.data.ghost?.dissolveOut?.(0.3); },
});

// 警世 (★ tap): one 8 m toll round the caster: stagger 0.8 s, elites outlined 5 s (every client), armour.
registerSkill('pulao_knell', {
  level: 'L2', defaults: { r: 8, stun: 0.8, mark: 5, zh: '警世' },
  start(k) {
    const g = k.game, fx = g.fx, p = k.p, c = k.feet(V3());
    k.dur = 0.9;
    fx?.sigils?.sigil?.(c, { design: 'clouds', radius: p.r, color: [1.2, 0.7, 0.18], color1: [0.9, 0.55, 0.14], intensity: 0.42, life: 0.9, grow: 0.12, spin: 1.2, seed: k.ev.seed });
    tollFx(g, c, p.r, 1.3, k.rng);
    for (let i = 1; i <= 2; i++) later2(k, i * 0.12, () => fx?.shockwave(_a.set(c.x, c.y + 0.07, c.z), { normal: UP, r0: 0.5, r1: p.r * (1 - i * 0.12), life: 0.4, color: i === 1 ? CYAN : GOLD, thin: true }));
    // an upright sound wave round the caster for onlookers (and the caster's own screen ripple)
    if (!k.local) for (let i = 0; i < 3; i++) fx?.particles.spawn({ additive: true, x: c.x, y: c.y + 1.2, z: c.z, delay: i * 0.08, life: 0.5, size: 0.6, size1: p.r * 1.4, sizePow: 0.5, color: [...GOLD, 0.8], color1: [0, 0, 0, 0], frame: FRAME.thinRing, rot: i });
    sfx(g, 'pulao_knell', k.local ? { volume: 1 } : { pos: c, volume: 1 });
    sfx(g, 'pulao_roar_low', k.local ? { volume: 0.7 } : { pos: c, volume: 0.7 });
    armorAura(g, c, p.r);
    let marked = 0;
    for (const z of g.zombies?.inRadius?.(c, p.r) || []) {
      stagger(g, z, p.stun);
      g.zombies?.status?.(z, 'pulao_toll', 0.3);
      if (markElite(g, z, p.mark)) marked++;
    }
    if (marked) sfx(g, 'pulao_mark', { volume: 0.6 });
    if (!k.local) return;
    shake(g, 0.32); ripple(g, 1.6);
    g.arsenal?.fovKick?.(2.5, 0.35);
    g.hud?.border?.(GH, 0.18, 0.5);
    const ar = g.arsenal;
    if (ar?.state === 'idle' && !ar._inspecting) ar.playClip('pulao_knell');
    else if (k.ws) { roar(g, k.ws, 1); strike(g, k.ws, 0, 1.4); }
  },
  update(k) { runLater2(k); },
});

// 百八鐘 (★ held, ultimate): the 5-beat summon (§1.7.3) at the aimed floor point.
registerSkill('pulao_108', {
  // aim 'target': a zombie under the crosshair pins the bell to its feet (a plain world ray flew over a crowd to the street behind it)
  level: 'L3', aim: 'target', defaults: { range: 30, r: 7, dmg: 200, tolls: 9, trapR: 3, trap: 2.4, shards: 32, shardDmg: 50, sigil: 7, zh: '百八鐘' },
  start(k) {
    const g = k.game, d = k.data, p = k.p;
    d.c = (k.at || k.feet()).clone();
    const cp = k.feet(V3());
    d.yaw = Math.atan2(cp.x - d.c.x, cp.z - d.c.z) + Math.PI / 2;   // the knob's dragon in profile to the caster
    d.beat = 0; d.toll = 0; d.trapped = new Set();
    // toll times: 1.05 s, then intervals quickening 0.4 -> 0.2 s (nine tolls over 2.4 s)
    d.times = [1.05];
    for (let j = 0; j < p.tolls - 1; j++) d.times.push(d.times[j] + 0.4 - 0.2 * (j / Math.max(1, p.tolls - 2)));
    k.dur = d.times[p.tolls - 1] + 0.75;
    sfx(g, 'pulao_ult_inhale', k.local ? { volume: 1 } : { pos: d.c });
    sfx(g, 'pulao_ult_bed', k.local ? { volume: 0.8 } : { pos: d.c, volume: 0.8 });   // §1.12 layer 3, scored to this timeline
    if (!k.local) return;
    const pl = plOfK(k);
    if (pl) pl.ult = k;
    g.hud?.card?.(k.cardText(), { color: GH, sub: k.def.en });
    g.hud?.border?.(GH, 0.22, k.dur);
    g.arsenal?.fovKick?.(3, 0.6);
    if (g.arsenal?.state === 'idle' || g.arsenal?.state === 'cycle') { g.arsenal.state = 'idle'; g.arsenal.playClip('pulao_ult_cast'); }
  },
  update(k, dt) {
    runLater2(k);
    const g = k.game, fx = g.fx, d = k.data, p = k.p, t = k.t, c = d.c;
    // ② 0.3 the cloud sigil on the floor, ③ the bell appears high above it with 蒲牢 on the crown
    if (d.beat < 1 && t >= 0.3) {
      d.beat = 1;
      d.sigil = fx?.sigils?.sigil?.(c, { design: 'clouds', radius: p.sigil, color: [1.5, 0.9, 0.26], color1: [0.45, 1.1, 1.5], intensity: 0.8, life: k.dur - 0.2, grow: 0.3, spin: 0.9, seed: k.ev.seed });
      fx?.sigils?.ring?.(c, { r1: p.sigil, color: GOLD, life: 0.5 });
      // 6 m, but the crown with 蒲牢 is kept where the caster sees it: <= ~22° over eye level at that distance
      const big = k.level >= 3, eye = k.caster(V3(), _f), dist = Math.hypot(c.x - eye.x, c.z - eye.z);
      d.size = big ? clamp((eye.y - c.y + dist * 0.4) / 1.17, 3.6, 6) : 4;
      d.top = d.size * 1.35 + 2.5;
      d.ghost = fx?.summons?.ghost?.({ mesh: bellSpirit({ dragon: true }), pos: _a.set(c.x, c.y + d.top, c.z), yaw: d.yaw, size: d.size, motion: null, appear: 0.35, life: Infinity, out: 0.3, big: true,
        ...BELL_GHOST, opacity: 0.66, exit: { kind: 'shard', count: big ? 70 : 30, palette: [[0.6, 0.42, 0.2], [0.9, 0.68, 0.3], [0.35, 0.55, 0.45], [0.75, 0.55, 0.25]], speed: 6 }, seed: k.ev.seed });
      if (d.ghost) { d.ghost.obj.rotation.order = 'YXZ'; d.parts = bellParts(d.ghost); d.parts.setRoar(0); }
      sfx(g, 'pulao_ult_creak', { pos: c, volume: 0.9 });
      if (k.local) shake(g, 0.08);
    }
    const h = d.ghost;
    // ③-④ the drop (0.7 -> 1.0): eased in, a light streak down
    if (h?.alive) {
      const u = clamp((t - 0.7) / 0.28, 0, 1), y = c.y + (d.top ?? 10) * (1 - u * u) + (t < 0.7 ? Math.sin(t * 6) * 0.15 : 0);
      h.obj.position.set(c.x, y, c.z); h.base.copy(h.obj.position);
      const sw = d.swing || 0;
      h.obj.rotation.x = Math.sin(t * 16) * 0.035 * sw; h.obj.rotation.z = Math.cos(t * 13) * 0.03 * sw;
      d.swing = sw * Math.exp(-5 * dt);
      // 蒲牢 rears its head on every third toll
      if (d.parts) { d.roar = Math.max(0, (d.roar || 0) - dt * 2.2); d.parts.setRoar(0.12 + 0.55 * Math.sin(Math.min(1, d.roar) * Math.PI)); }
    }
    if (d.beat < 2 && t >= 0.7) { d.beat = 2; dropStreak(g, _a.set(c.x, c.y + 16, c.z), c); sfx(g, 'pulao_bell_whoosh', { pos: c, volume: 1 }); }
    // the slam (0.98): trap, dust, a cracked floor
    if (d.beat < 3 && t >= 0.98) {
      d.beat = 3;
      fx?.shockwave(_a.set(c.x, c.y + 0.05, c.z), { normal: UP, r0: 1, r1: p.r + 1, life: 0.5, color: BRONZE, thin: false });
      for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU + k.rng() * 0.3; fx?.knockDust?.(_b.set(c.x + Math.cos(a) * 2.5, c.y, c.z + Math.sin(a) * 2.5), _e.set(Math.cos(a) * 9, 0, Math.sin(a) * 9), 1.6); }
      fx?.zfx?.ground?.add?.('crack', _a.set(c.x, c.y + 0.02, c.z), { r: 3.6, life: 3.5, col: [0.95, 0.7, 0.32], alpha: 0.7, fadeIn: 0.02, fadeOut: 1.4 });
      fx?.decals?.add(c, UP, { frame: DECAL.scorch, size: 3.4, tint: DECAL_TINT.scorch, life: 4 });
      fx?.lights?.flash(_a.set(c.x, c.y + 2, c.z), 0xffc74a, 50, 14, 0.25);
      sfx(g, 'pulao_ult_slam', k.local ? { volume: 1 } : { pos: c, volume: 1 });
      for (const z of g.zombies?.inRadius?.(c, p.trapR) || []) d.trapped.add(z);
      if (k.local) { shake(g, 0.4 * nearK(k, c, 30) + 0.1); if (clipComfort.overlay) fx?.overlay?.radial?.(0.7, 0.45, { color: [2.2, 1.5, 0.5], r0: 0.3, density: 0.4, thin: 0.6 }); }
    }
    // the trap (host): rooted under the bell for 2.4 s from the slam
    if (d.beat >= 3 && t < 0.98 + p.trap && g.zombies?.authority) {
      for (const z of d.trapped) { if (!z.alive) continue; z.speedMul = 0; z.hasteT = 0.12; z.atkCd = Math.max(z.atkCd || 0, 0.2); if (z.kvel) { z.kvel.x = 0; z.kvel.z = 0; } }
    }
    // ④ nine tolls, quickening; 7 m, 200 each
    while (d.toll < p.tolls && t >= d.times[d.toll]) {
      const i = d.toll++;
      d.swing = 1; h?.flash?.(0.35);
      tollFx(g, c, p.r, 1.4, k.rng);
      if (i % 3 === 2) { d.roar = 1; sfx(g, 'pulao_roar', { pos: c, volume: 1 }); }
      sfx(g, 'pulao_ult_toll', k.local ? { volume: 1, pitch: PENTA[i] ?? 1 } : { pos: c, volume: 1, pitch: PENTA[i] ?? 1 });
      armorAura(g, c, p.r);
      for (const z of g.zombies?.inRadius?.(c, p.r) || []) g.zombies?.status?.(z, 'pulao_toll', 0.2);
      if (k.local) {
        // the trapped ones are held (no shove); the rest are pushed out a little each toll
        k.hurt(_a.set(c.x, c.y + 0.9, c.z), p.r, p.dmg, { knock: 2.2, stagger: 1, falloffMin: 0.55, explosive: false });
        if (g.zombies?.authority) for (const z of d.trapped) if (z.alive && z.kvel) { z.kvel.x = 0; z.kvel.z = 0; }
        shake(g, (0.1 + 0.012 * i) * (0.4 + 0.6 * nearK(k, c, 30))); ripple(g, 0.8);
        g.arsenal?._clipHaptic?.(i === p.tolls - 1 ? 'thud' : 'tick');
      }
      // ⑤ the ninth: the bell bursts into 32 bronze shards (50 each), a 100 ms stop
      if (i === p.tolls - 1) later2(k, 0.06, () => shatter(k));
    }
  },
  end(k) {
    const g = k.game, d = k.data;
    d.sigil?.stop?.(); d.ghost?.dissolveOut?.(0.25);
    if (!k.local) return;
    g.hud?.border?.(GH, 0, 0.01);
    const pl = plOfK(k);
    if (pl && pl.ult === k) pl.ult = null;
  },
});
/** 百八鐘 ⑤: 32 shards fly out flat and low from the bell's body (each a ray: 50, piercing 2), bronze motes, sparks */
function shatter(k) {
  const g = k.game, fx = g.fx, d = k.data, p = k.p, c = d.c, n = p.shards;
  const h = d.ghost, sz = d.size || 6;
  fx?.particles.spawn({ additive: true, x: c.x, y: c.y + sz * 0.45, z: c.z, life: 0.18, size: sz * 1.1, size1: sz * 0.4, color: [4, 3, 1.4, 1], color1: [...GOLD, 0], frame: FRAME.glow });
  fx?.shockwave(_a.set(c.x, c.y + sz * 0.4, c.z), { r0: 0.5, r1: p.r * 1.3, life: 0.4, color: GOLD, thin: false });
  fx?.lights?.flash(_a.set(c.x, c.y + 2.5, c.z), 0xffd27a, 60, 18, 0.3);
  h?.dissolveOut?.(0.28);
  sfx(g, 'pulao_ult_shatter', k.local ? { volume: 1 } : { pos: c, volume: 1 });
  sfx(g, 'pulao_ult_tail', k.local ? { volume: 0.8, delay: 0.1 } : { pos: c, volume: 0.8, delay: 0.1 });
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + k.rng() * 0.12, up = 0.05 + k.rng() * 0.25, hh = sz * (0.12 + 0.6 * k.rng());
    _e.set(Math.cos(a), up, Math.sin(a)).normalize();
    _b.set(c.x + Math.cos(a) * sz * 0.3, c.y + hh, c.z + Math.sin(a) * sz * 0.3);
    // a spinning bronze shard + its gilt streak
    fx?.particles.spawn({ x: _b.x, y: _b.y, z: _b.z, vx: _e.x * 16, vy: _e.y * 16 + 2, vz: _e.z * 16, life: 0.9 + k.rng() * 0.4, size: 0.22 + k.rng() * 0.14, color: [0.62, 0.44, 0.22, 1], color1: [0.5, 0.34, 0.16, 1],
      frame: FRAME.shard, rot: k.rng() * 6, spin: (k.rng() - 0.5) * 24, gravity: 9.8, drag: 0.6, collide: true, bounce: 0.3 });
    fx?.particles.spawn({ additive: true, x: _b.x, y: _b.y, z: _b.z, vx: _e.x * 22, vy: _e.y * 22, vz: _e.z * 22, life: 0.22, size: 0.05, stretch: 0.05, color: [...GOLD, 1], color1: [...DEEP, 0], frame: FRAME.spark, drag: 3 });
    if (k.local) k.hitRay(_b.clone(), _e.clone(), 10, p.shardDmg, { pierce: 2, knock: 3, stagger: 0.8, headMul: 1.2 });
  }
  fx?.motes?.burst?.('shard', _a.set(c.x, c.y + sz * 0.5, c.z), 18, { palette: [[0.62, 0.44, 0.22], [0.95, 0.72, 0.3], [0.32, 0.52, 0.44]], speed: 7, spread: 1, radius: sz * 0.25, scale: 2.2, seed: k.ev.seed });
  if (k.local) { if (clipComfort.hitstop) g.hitStop?.(0.1); shake(g, 0.45 * nearK(k, c, 30) + 0.12); g.arsenal?.fovKick?.(-2.5, 0.25); }
}

// 金鐘罩 (crisis, crisis.js 'knock'): a translucent bronze bell drops over the player for 1.0 s.
registerSkill('pulao_crisis', {
  level: 'L1',
  start(k) {
    const g = k.game, c = k.feet(V3());
    const h = g.fx?.summons?.ghost?.({ mesh: bellSpirit({ dragon: false }), pos: _a.set(c.x, c.y + 0.9, c.z), size: 2.6, motion: null, appear: 0.08, life: 1.0, out: 0.35, big: false,
      ...BELL_GHOST, opacity: k.local ? 0.22 : 0.5, exit: { kind: 'shard', count: 16, palette: [[0.6, 0.42, 0.2], [0.9, 0.68, 0.3]], speed: 3 }, seed: k.ev.seed });
    if (h) h.obj.position.set(c.x, c.y + 0.02, c.z);
    tollFx(g, c, k.p.r ?? 4, 1, k.rng);
    sfx(g, 'pulao_toll', k.local ? { volume: 0.9, pitch: 0.8 } : { pos: c, volume: 0.9, pitch: 0.8 });
    if (k.local) { g.hud?.border?.(GH, 0.3, 1.0); ripple(g, 2); }
  },
});

// KE_FINAL: the wave's last kill (no damage): a small bell drops there and tolls once; others see a gold column.
registerSkill('pulao_final', {
  level: 'L2', dur: 1.4,
  start(k) {
    const g = k.game, fx = g.fx, c = k.pos.clone();
    c.y = k.floorY(c);
    k.data.c = c;
    fx?.sigils?.pillar?.(c, { radius: 0.45, height: 10, color: GOLD, color1: CYAN, life: 0.9, motes: 8 });
    if (!k.local) return;
    k.data.h = fx?.summons?.ghost?.({ mesh: bellSpirit({ dragon: false }), pos: _a.set(c.x, c.y + 3, c.z), size: 1.6, motion: null, appear: 0.1, life: 1.1, out: 0.3, big: false, ...BELL_GHOST, opacity: 0.55,
      exit: { kind: 'shard', count: 10, palette: [[0.6, 0.42, 0.2], [0.9, 0.68, 0.3]], speed: 2 }, seed: k.ev.seed });
    sfx(g, 'pulao_final', { pos: c, volume: 0.9 });
  },
  update(k) {
    const d = k.data, h = d.h;
    if (!h?.alive) return;
    const u = clamp(k.t / 0.25, 0, 1);
    h.obj.position.set(d.c.x, d.c.y + 3 * (1 - u * u), d.c.z); h.base.copy(h.obj.position);
    if (!d.rung && k.t >= 0.32) { d.rung = true; h.flash(1); tollFx(k.game, d.c, 2.5, 0.7, k.rng); sfx(k.game, 'pulao_toll', { pos: d.c, volume: 0.6, pitch: 1.5 }); }
  },
});

// ------------------------------------------------------------------------------------------ clips
const Z3 = [0, 0, 0];
const GL = (vm) => vm?.supportGrip?.pose || 'wrap';
/**
 * First draw (1.4 s, once a match, fire cancels): the gun flips up from the lower right (0-0.3 s), one pump with the
 * three bells swinging and lighting in turn on a rising three-note figure (0.3-0.7), 蒲牢 rears its head as a cyan ring
 * surfaces in the bell mouth with a low roar (0.9), the pose holds as the bells ring out (1.3).
 */
registerClip('pulao_first', (vm) => ({
  duration: 1.4,
  tracks: {
    gunPos: [[0, [0.12, -0.14, 0.05]], [0.21, [0.004, 0.004, 0], 'out3'], [0.5, [-0.004, 0.006, 0.004]], [0.62, [-0.02, 0.018, 0.012], 'inOut'], [0.8, [-0.024, 0.02, 0.014]], [0.93, [0, 0.002, 0], 'out3'], [1, Z3]],
    gunRot: [[0, [12, -34, 140]], [0.21, [2, 2, -6], 'out3'], [0.5, [0, 0, 1]], [0.62, [6, 22, -18], 'inOut'], [0.8, [7, 24, -20]], [0.93, [1, -1, 1], 'out3'], [1, Z3]],
    pump: [[0, 0], [0.24, 0], [0.33, 1, 'out3'], [0.44, 0, 'in3'], [1, 0]],
    fx_pulao: [[0, 0], [0.6, 0], [0.66, 1, 'out3'], [0.86, 1], [0.97, 0.1, 'inOut'], [1, 0.05]],
    fx_jaw: [[0, 0], [0.62, 0], [0.67, 1, 'out3'], [0.82, 0.8], [0.92, 0.1], [1, 0]],
  },
  events: [
    [0, 'anchorL', ['rest', 0.05]], [0, 'glow', { to: 0.25, sec: 0 }], [0.02, 'pl', 'first'], [0.15, 'haptic', 'tick'],
    [0.17, 'anchorL', ['grip_l', 0.08]], [0.19, 'poseL', GL(vm)], [0.25, 'snd', 'pumpBack'], [0.27, 'shellOut'], [0.41, 'snd', 'pumpForward'],
    [0.3, 'pl', { do: 'light', i: 1 }], [0.38, 'pl', { do: 'light', i: 2 }], [0.46, 'pl', { do: 'light', i: 3 }],
    [0.4, 'glow', { to: 1.6, sec: 0.25 }], [0.64, 'pl', 'roar'], [0.65, 'pl', { do: 'mouthwave', k: 1.4 }], [0.65, 'pl', { do: 'mouth', k: 1.2 }], [0.66, 'haptic', 'thud'],
    [0.75, 'glow', { to: 1, sec: 0.5 }], [0.93, 'pl', { do: 'strike', k: 0.5 }],
  ],
}));
// normal draw (0.75 s): up from the right with a half roll, the bells jingle as it settles
registerClip('pulao_draw', (vm) => ({
  duration: 0.75,
  tracks: {
    gunPos: [[0, [0.05, -0.15, 0.06]], [0.7, [0, 0.004, 0], 'out3'], [1, Z3, 'inOut']],
    gunRot: [[0, [-34, 14, 40]], [0.7, [2, -1, -3], 'out3'], [1, Z3, 'inOut']],
  },
  events: [[0.04, 'snd', 'draw'], [0.62, 'pl', { do: 'strike', k: 0.5 }], [0.66, 'pl', { do: 'mouth', k: 0.4 }]],
}));

/** Pump (0.64 s): normal; with a bell shell loaded the pump is quicker and ends in a wrist flick that rings all three. */
registerClip('pulao_pump', (vm, o = {}) => {
  const ready = (o.ws?.sp?.m?.bell ?? 0) >= 1;
  if (!ready) {
    const c = pumpCycle();
    return { ...c, events: [...c.events, [0.75, 'pl', { do: 'strike', k: 0.25 }]] };
  }
  return {
    tracks: {
      pump: [[0, 0], [0.06, 0], [0.3, 1, 'out3'], [0.52, 0, 'in3'], [1, 0]],
      gunPos: [[0, Z3], [0.3, [0.004, -0.008, 0.012]], [0.52, [0, 0.002, -0.004]], [0.66, [-0.006, 0.01, 0.002], 'out3'], [0.84, [0.002, -0.002, 0]], [1, Z3]],
      gunRot: [[0, Z3], [0.3, [-2, 1, 3]], [0.52, [1, 0, -1]], [0.64, [3, -3, 24], 'out3'], [0.8, [-1, 1, -5], 'inOut'], [0.92, [0.5, 0, 1.5]], [1, Z3]],
    },
    events: [[0.1, 'snd', 'pumpBack'], [0.28, 'shellOut'], [0.46, 'snd', 'pumpForward'], [0.6, 'pl', 'flickpump'], [0.66, 'pl', 'ring3'], [0.66, 'haptic', 'tick']],
  };
});

// shell loading: the stock tube clips, the bells answering the hand; the rare one (1 in 8) thumbs the last shell home
// with a snap and all three bells ring (the shell still lands on the same frame: 'ammo1' at 0.72)
registerClip('pulao_shell_start', () => {
  const c = shellStart();
  return { ...c, events: [...c.events, [0.6, 'pl', { do: 'strike', k: 0.3 }]] };
});
registerClip('pulao_shell_insert', () => {
  const c = shellInsert();
  return { ...c, events: [...c.events, [0.74, 'pl', { do: 'strike', i: 1 + ((Math.random() * 3) | 0), k: 0.25 }]] };
});
registerClip('pulao_shell_rare', () => {
  const c = shellInsert();
  return {
    tracks: {
      ...c.tracks,
      'shell.pos': [[0, [0, -0.12, 0.02]], [0.3, [0, -0.12, 0.02]], [0.5, [0, -0.012, 0.004], 'out3'], [0.62, [0, -0.01, 0]], [0.7, [0, 0.005, -0.045], 'in3'], [1, [0, 0.005, -0.045]]],
      gunRot: [[0, [6, 6, -24]], [0.62, [6, 6, -24]], [0.72, [10, 4, -16], 'out3'], [0.86, [5, 6, -26]], [1, [6, 6, -24]]],
    },
    events: [...c.events.filter((e) => e[1] !== 'snd'), [0.66, 'snd', 'shellIn'], [0.72, 'pl', 'ring3'], [0.72, 'haptic', 'tick']],
  };
});
registerClip('pulao_shell_end', (vm, o = {}) => {
  const c = shellEnd(vm, { pump: !!o.pump });
  const loaded = (o.ws?.sp?.m?.bell ?? 0) >= 1;
  return { ...c, events: [...c.events, [o.pump && loaded ? 0.86 : 0.5, 'pl', o.pump && loaded ? 'ring3' : { do: 'strike', k: 0.3 }]] };
});

/**
 * Inspect (4.2 s; holding loops the opening tilt): the gun turns to its side so light sweeps the bronze bell mouth
 * (0-0.8 s), rolls its right flank up and the left fingers flick the three bells on a rising three-note scale
 * (1.2-2.2), lifts the 蒲牢 head to the camera (3.0), one pump, the pose holds. Mythic: the world dims to a bronze dusk.
 * rare (1/10): a fourth flick lands on 蒲牢, which snaps at the finger; the hand jerks back.
 */
const HEAD_P = [0.0, 0.058, 0.13], HEAD_R = [18, 58, 4];   // the head beat: brought in so 蒲牢 fills ~20 % of the frame
// the right flank (the bells) to the camera: the muzzle swings right about the grip, the gun shifted left to stay in view
const BELL_P = [-0.13, 0.065, 0.06], BELL_R = [6, -55, 10];
function inspect(vm, rare) {
  const ev = [
    [0.02, 'pl', 'world'], [0.04, 'snd', 'cloth'], [0.05, 'pl', { do: 'mouth', k: 0.5 }], [0.2, 'snd', 'cloth'],
    [0.26, 'anchorL', ['bells', 0.18]], [0.29, 'poseL', 'point'],
    [0.31, 'anchorL', ['bell1', 0.05]], [0.33, 'pl', { do: 'flick', i: 1 }], [0.37, 'anchorL', ['bell2', 0.05]], [0.39, 'pl', { do: 'flick', i: 2 }],
    [0.43, 'anchorL', ['bell3', 0.05]], [0.45, 'pl', { do: 'flick', i: 3 }],
    [0.55, 'anchorL', ['grip_l', 0.2]], [0.58, 'poseL', GL(vm)], [0.6, 'snd', 'cloth'],
    [0.7, 'pl', 'roar'], [0.71, 'pl', 'eyes'], [0.72, 'haptic', 'tick'],
    [0.86, 'snd', 'pumpBack'], [0.9, 'snd', 'pumpForward'], [0.92, 'pl', { do: 'strike', k: 0.4 }],
  ];
  if (rare) ev.push([0.49, 'anchorL', ['head', 0.06]], [0.51, 'pl', 'bite'], [0.515, 'anchorL', ['bells', 0.06]], [0.515, 'haptic', 'thud']);
  return {
    duration: 4.2, loop: [0.05, 0.17],
    tracks: {
      gunPos: [[0, Z3], [0.08, [-0.03, 0.022, 0.03]], [0.13, [-0.038, 0.026, 0.026]], [0.17, [-0.03, 0.022, 0.03]],
        [0.25, BELL_P, 'inOut'], [0.5, [BELL_P[0] - 0.003, BELL_P[1] + 0.003, BELL_P[2]]], [0.58, [-0.06, 0.05, 0.02], 'inOut'],
        [0.66, HEAD_P, 'inOut'], [0.8, [HEAD_P[0] + 0.004, HEAD_P[1] + 0.003, HEAD_P[2]]], [0.86, [-0.01, 0.006, 0.006], 'inOut'], [1, Z3]],
      gunRot: [[0, Z3], [0.08, [8, 30, -26]], [0.13, [11, 38, -33]], [0.17, [8, 30, -26]],
        [0.25, BELL_R, 'inOut'], [0.5, [BELL_R[0] + 1, BELL_R[1] - 3, BELL_R[2]]], [0.58, [8, 20, 4], 'inOut'],
        [0.66, HEAD_R, 'inOut'], [0.8, [HEAD_R[0] + 2, HEAD_R[1] + 3, HEAD_R[2]]], [0.86, [1, 2, -2], 'inOut'], [1, Z3]],
      fx_pulao: [[0, 0], [0.66, 0], [0.7, 1, 'out3'], [0.8, 0.85], [0.86, 0.1], [1, 0.05]],
      fx_jaw: rare ? [[0, 0], [0.48, 0], [0.5, 1, 'out3'], [0.52, 0, 'in3'], [0.66, 0], [0.7, 1, 'out3'], [0.8, 0.6], [0.86, 0], [1, 0]]
        : [[0, 0], [0.66, 0], [0.7, 1, 'out3'], [0.8, 0.6], [0.86, 0], [1, 0]],
      pump: [[0, 0], [0.86, 0], [0.89, 1, 'out3'], [0.92, 0, 'in3'], [1, 0]],
      env: [[0, 0], [0.1, 1], [0.88, 1], [1, 0]],
    },
    events: ev,
  };
}
registerClip('pulao_inspect', (vm) => inspect(vm, false));
registerClip('pulao_inspect_rare', (vm) => inspect(vm, true));

// ready layer idle extra (every 2.5 s while the ultimate is ready): 蒲牢張口 -- the head lifts, the jaw opens
registerClip('pulao_ready', {
  duration: 0.75,
  tracks: {
    gunRot: [[0, Z3], [0.2, [1.4, -0.4, 1.2], 'out3'], [0.5, [0.6, -0.2, 0.4]], [1, Z3]],
    fx_pulao: [[0, 0], [0.18, 0.75, 'out3'], [0.62, 0.65], [1, 0]],
    fx_jaw: [[0, 0], [0.2, 1, 'out3'], [0.55, 0.8], [0.85, 0], [1, 0]],
  },
  events: [[0.15, 'pl', { do: 'eyes', k: 0.8 }], [0.18, 'pl', { do: 'mouthwave', k: 0.8 }]],
});
// idle tier 34-99 % (§1.17): a lazy wrist roll that sets the bells swinging
registerClip('pulao_sway', {
  duration: 0.9,
  tracks: { gunRot: [[0, Z3], [0.25, [0.5, 0.6, 3.2], 'out3'], [0.55, [-0.3, -0.3, -2.0]], [1, Z3]] },
  events: [[0.3, 'pl', { do: 'strike', k: 0.25 }]],
});
// rare idle (every ~14 s at rest): the left fingers flick the middle bell
registerClip('pulao_flick', (vm) => ({
  duration: 1.2,
  tracks: { gunRot: [[0, Z3], [0.25, [-2, -4, 16], 'inOut'], [0.7, [-2, -4, 16]], [1, Z3, 'inOut']], gunPos: [[0, Z3], [0.25, [-0.01, 0.01, 0], 'inOut'], [0.7, [-0.01, 0.01, 0]], [1, Z3]] },
  events: [[0.12, 'anchorL', ['bell2', 0.18]], [0.2, 'poseL', 'point'], [0.42, 'pl', { do: 'flick', i: 2 }], [0.6, 'anchorL', ['grip_l', 0.22]], [0.66, 'poseL', GL(vm)]],
}));
// 鐘彈 fire: a heavy kick, the muzzle climbing, the bells thrown about
registerClip('pulao_bellshot', {
  duration: 0.42,
  tracks: { gunPos: [[0, Z3], [0.12, [0.004, 0.012, 0.05], 'out3'], [1, Z3, 'inOut']], gunRot: [[0, Z3], [0.12, [11, 1, 4], 'out3'], [1, Z3, 'inOut']], fx_pulao: [[0, 0], [0.1, 1, 'out3'], [0.6, 0.3], [1, 0]] },
  events: [[0.02, 'pl', { do: 'strike', k: 1.3 }], [0.03, 'haptic', 'thud'], [0.05, 'pl', 'eyes']],
});
// 警世 cast: the gun snaps up and twists, the bells and the head ring out
registerClip('pulao_knell', {
  duration: 0.6,
  tracks: { gunPos: [[0, Z3], [0.22, [0, 0.03, -0.02], 'out3'], [0.6, [0, 0.02, -0.01]], [1, Z3, 'inOut']], gunRot: [[0, Z3], [0.22, [14, 4, 18], 'out3'], [0.45, [10, 2, -8]], [1, Z3, 'inOut']] },
  events: [[0.18, 'pl', 'ring3'], [0.2, 'pl', 'roar'], [0.2, 'pl', { do: 'mouth', k: 1.5 }], [0.2, 'haptic', 'thud']],
});
// 百八鐘 cast: the muzzle to the sky, held as the bell appears, then down
registerClip('pulao_ult_cast', {
  duration: 1.05,
  tracks: {
    gunPos: [[0, Z3], [0.28, [0, 0.07, 0.02], 'out3'], [0.68, [0, 0.075, 0.02]], [1, Z3, 'inOut']],
    gunRot: [[0, Z3], [0.28, [52, 4, 6], 'out3'], [0.68, [55, 4, 6]], [1, Z3, 'inOut']],
    fx_pulao: [[0, 0], [0.2, 1, 'out3'], [0.9, 1], [1, 0.3]], fx_jaw: [[0, 0], [0.22, 1, 'out3'], [0.9, 1], [1, 0]],
  },
  events: [[0.05, 'haptic', 'thud'], [0.22, 'pl', 'roar'], [0.25, 'pl', { do: 'mouthwave', k: 1.6 }], [0.3, 'pl', 'ring3']],
});

// ------------------------------------------------------------------------------------------ crosshair (§1.9 #2)
// xh_bell: a bell outline drawn round the centre point -- the crown loop on top, shoulders, a waist and the flared lip
// below, broken at the bottom middle; stroke only, hit-reactive (class "a"); it widens with the pellet spread.
registerCrosshair('xh_bell', {
  draw(gap, c, s, c2 = c) {
    const R = Math.min(30, 14 + gap * 0.5), H = R * 1.05;
    const half = (sd) => {
      const P = (x, y) => `${(x * sd).toFixed(2)} ${y.toFixed(2)}`;
      return `M${P(R * 0.18, H * 0.86)} L${P(R * 0.62, H * 0.86)} Q${P(R * 0.98, H * 0.86)} ${P(R * 0.98, H * 0.66)} Q${P(R * 0.72, H * 0.42)} ${P(R * 0.7, H * 0.0)}`
        + ` Q${P(R * 0.7, -H * 0.62)} ${P(R * 0.36, -H * 0.74)} Q${P(R * 0.14, -H * 0.82)} ${P(0, -H * 0.82)}`;
    };
    const lw = 1.6;
    let out = `<path class="a" d="${half(1)}" fill="none" stroke="${c}" stroke-width="${lw}" stroke-linecap="round" stroke-linejoin="round"/>`;
    out += `<path class="a" d="${half(-1)}" fill="none" stroke="${c}" stroke-width="${lw}" stroke-linecap="round" stroke-linejoin="round"/>`;
    // the crown loop and two sound arcs either side of the lip
    out += `<path class="a" d="M${-R * 0.16} ${-H * 0.82} Q${-R * 0.16} ${-H * 1.08} 0 ${-H * 1.08} Q${R * 0.16} ${-H * 1.08} ${R * 0.16} ${-H * 0.82}" fill="none" stroke="${c2}" stroke-width="1.3"/>`;
    out += `<path class="a" d="M${-R * 1.22} ${H * 0.5} Q${-R * 1.34} ${H * 0.78} ${-R * 1.16} ${H * 1.02}" fill="none" stroke="${c2}" stroke-width="1.1" stroke-linecap="round"/>`;
    out += `<path class="a" d="M${R * 1.22} ${H * 0.5} Q${R * 1.34} ${H * 0.78} ${R * 1.16} ${H * 1.02}" fill="none" stroke="${c2}" stroke-width="1.1" stroke-linecap="round"/>`;
    return out + `<circle class="a" r="1.2" fill="${c}"/>`;
  },
  nodes: 30,
});
injectCSS('cf-xh-bell', '.xh2.act .a { filter: drop-shadow(0 0 2px currentColor); }');

// ------------------------------------------------------------------------------------------ damage numbers (§1.9 #6)
// bronze body, a gold edge (the bell): every hit of this weapon, its tolls included; crits swap to the gold tier
SKINS.pulao = ['#ffe8b0', '#d9a54a', '#7a5a2e', '#fff1b8'];

// ------------------------------------------------------------------------------------------ kill mark (§1.9 #8)
// km_pulao: (1) concentric sound rings spread from the centre and settle into a bell outline, (2) the bell takes its
// bronze (a gilt lip, three bands, 乳釘 bosses, a cloud belt), (3) full glow -- 蒲牢 rises arched on the crown knob,
// (4) 點睛: the dragon's eye flashes with the ding. Headshot: a cross-star from the eye + a cyan ring. Original, procedural.
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const seg = (t, a, b) => ease((t - a) / (b - a));
function bellPath(c, R) {
  const X = (u) => c + u * R, p = new Path2D();
  p.moveTo(X(-0.62), X(0.56));
  p.quadraticCurveTo(X(-0.66), X(0.42), X(-0.5), X(0.36));
  p.quadraticCurveTo(X(-0.42), X(0.0), X(-0.42), X(-0.18));
  p.quadraticCurveTo(X(-0.42), X(-0.5), X(-0.2), X(-0.54));
  p.lineTo(X(0.2), X(-0.54));
  p.quadraticCurveTo(X(0.42), X(-0.5), X(0.42), X(-0.18));
  p.quadraticCurveTo(X(0.42), X(0.0), X(0.5), X(0.36));
  p.quadraticCurveTo(X(0.66), X(0.42), X(0.62), X(0.56));
  for (let i = 0; i <= 8; i++) { const x = 0.62 - (i / 8) * 1.24; p.lineTo(X(x), X(0.56 + (i % 2 ? 0.035 : 0))); }
  p.closePath();
  return p;
}
registerKillMark('km_pulao', {
  draw(ctx, S, t, o) {
    const p1 = seg(t, 0, 0.45), p2 = seg(t, 0.45, 0.8), p3 = seg(t, 0.8, 1.0), p4 = seg(t, 1.0, 1.15);
    const c = S / 2, R = S * 0.42, X = (u) => c + u * R;
    ctx.clearRect(0, 0, S, S);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // (1) the sound rings spreading from the centre, fading as the bell outline draws over them
    for (let i = 0; i < 3; i++) {
      const u = seg(t, i * 0.08, 0.38 + i * 0.08);
      if (u <= 0 || u >= 1) continue;
      ctx.save(); ctx.globalAlpha = (1 - u) * 0.9; ctx.strokeStyle = i === 1 ? CY : GH; ctx.lineWidth = S * 0.016;
      ctx.beginPath(); ctx.arc(c, c + R * 0.05, R * (0.12 + 0.62 * u), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    const bell = bellPath(c, R);
    // (2) bronze fill rising from the lip, gilt bands, bosses, a cloud belt
    if (p2 > 0) {
      ctx.save(); ctx.clip(bell);
      const gr = ctx.createLinearGradient(X(-0.5), 0, X(0.5), 0);
      gr.addColorStop(0, '#4a3418'); gr.addColorStop(0.35, '#a87a3a'); gr.addColorStop(0.55, '#d9a54a'); gr.addColorStop(1, '#5a3e1c');
      ctx.fillStyle = gr;
      ctx.fillRect(0, X(0.6 - 1.2 * p2), S, S);
      ctx.fillStyle = '#e3b04b';
      for (const y of [0.42, -0.02, -0.36]) ctx.fillRect(X(-0.7), X(y) - S * 0.011, S, S * 0.022 * p2);
      ctx.fillStyle = '#ffd98a';
      for (let i = 0; i < 4; i++) for (let k = 0; k < 2; k++) { ctx.beginPath(); ctx.arc(X(-0.24 + i * 0.16), X(-0.28 + k * 0.12), S * 0.012 * p2, 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = 'rgba(255,217,138,0.75)'; ctx.lineWidth = S * 0.008;
      for (let i = 0; i < 4; i++) { const cx = X(-0.3 + i * 0.2), cy = X(0.2); ctx.beginPath(); ctx.arc(cx, cy, S * 0.035, Math.PI * (i % 2), Math.PI * (i % 2) + Math.PI * 1.6 * p2); ctx.stroke(); }
      ctx.restore();
    }
    // the outline (ink, dash-drawn), gilt once filled
    ctx.save();
    const peri = S * 3.2;
    ctx.setLineDash([peri * Math.min(1, p1 * 1.1), peri]);
    ctx.lineWidth = S * 0.035; ctx.strokeStyle = p2 > 0.5 ? '#e3b04b' : 'rgba(20,14,8,0.92)'; ctx.stroke(bell);
    ctx.restore();
    // (3) 蒲牢 on the crown: an arched dragon (body, legs, a raised head with an antler), glowing
    if (p3 > 0 || t > 0.8) {
      const u = Math.max(p3, t > 1.0 ? 1 : 0);
      ctx.save(); ctx.globalAlpha = u;
      ctx.translate(0, R * 0.08 * (1 - u));
      ctx.strokeStyle = '#d9a54a'; ctx.lineWidth = S * 0.045;
      ctx.beginPath(); ctx.moveTo(X(-0.24), X(-0.55)); ctx.bezierCurveTo(X(-0.22), X(-0.86), X(0.18), X(-0.86), X(0.2), X(-0.6)); ctx.stroke();
      ctx.lineWidth = S * 0.018;
      for (const x of [-0.16, 0.13]) { ctx.beginPath(); ctx.moveTo(X(x), X(-0.66)); ctx.lineTo(X(x + 0.02), X(-0.55)); ctx.stroke(); }
      // head at the right end, raised; an antler sweeping back; the tail flick at the left
      ctx.fillStyle = '#d9a54a';
      ctx.beginPath(); ctx.ellipse(X(0.27), X(-0.68), S * 0.055, S * 0.04, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(X(0.3), X(-0.66)); ctx.lineTo(X(0.42), X(-0.72)); ctx.lineTo(X(0.32), X(-0.6)); ctx.closePath(); ctx.fill();
      ctx.lineWidth = S * 0.012; ctx.beginPath(); ctx.moveTo(X(0.24), X(-0.74)); ctx.quadraticCurveTo(X(0.18), X(-0.88), X(0.06), X(-0.9)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X(-0.24), X(-0.6)); ctx.quadraticCurveTo(X(-0.36), X(-0.66), X(-0.34), X(-0.78)); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = GH; ctx.shadowBlur = S * 0.06 * p3;
      ctx.globalAlpha = 0.4 * p3; ctx.lineWidth = S * 0.012; ctx.strokeStyle = GH; ctx.stroke(bell);
      ctx.restore();
    }
    // (4) 點睛: the dragon's eye
    const ex = X(0.285), ey = X(-0.695);
    const fl = Math.sin(Math.PI * p4) + (o.head ? Math.max(0, 1 - Math.abs(t - 1.1) / 0.08) * 0.8 : 0);
    if (p3 > 0.5) { ctx.fillStyle = '#1a0e04'; ctx.beginPath(); ctx.arc(ex, ey, S * 0.011, 0, Math.PI * 2); ctx.fill(); }
    if (fl > 0.01 || p3 > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const gw = ctx.createRadialGradient(ex, ey, 0, ex, ey, S * (0.025 + 0.07 * fl));
      gw.addColorStop(0, `rgba(255,255,255,${(0.5 * p3 + 0.5 * Math.min(1, fl)).toFixed(2)})`); gw.addColorStop(0.4, 'rgba(127,216,255,0.6)'); gw.addColorStop(1, 'rgba(127,216,255,0)');
      ctx.fillStyle = gw; ctx.fillRect(ex - S * 0.12, ey - S * 0.12, S * 0.24, S * 0.24);
      if (fl > 0.01) {
        const L = S * (0.045 + fl * (o.head ? 0.15 : 0.06));
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = S * 0.008; ctx.globalAlpha = Math.min(1, fl);
        ctx.beginPath(); ctx.moveTo(ex - L, ey); ctx.lineTo(ex + L, ey); ctx.moveTo(ex, ey - L * 0.7); ctx.lineTo(ex, ey + L * 0.7);
        if (o.head) { const d = L * 0.4; ctx.moveTo(ex - d, ey - d); ctx.lineTo(ex + d, ey + d); ctx.moveTo(ex + d, ey - d); ctx.lineTo(ex - d, ey + d); }
        ctx.stroke();
      }
      ctx.restore();
    }
    if (o.head && t > 1.0) {
      const u = Math.min(1, (t - 1.0) / 0.17);
      ctx.save(); ctx.globalAlpha = 1 - u; ctx.strokeStyle = o.tint || CY; ctx.lineWidth = S * 0.012;
      ctx.beginPath(); ctx.arc(ex, ey, S * (0.04 + 0.42 * u), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
  },
});

export { SFX as PULAO_SFX };
