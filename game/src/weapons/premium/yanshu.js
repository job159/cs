// 焰樞．破限 Pyrecore Unbound — 神兵 M04, 啟明工坊 flagship (docs/PREMIUM_WEAPONS.md M04; the Appendix A def is in defs.js, the
// models tools/assets/weapons/yanshu.mjs + yanshu_drone.mjs, effect pieces and the drones yanshu_fx.js). Mechanics on the
// specials v2 engine (registerSpecial 'yanshu' + skills); the presentation (viewmodel driver, clips, crosshair, kill mark) here.
//   fire     樞彈 300 rpm x 40: the ram head kicks back 8 mm and springs home, a square forge crown out of its face (four
//            short orange-white tongues in a cross, the centre clear), a 2.5° view punch; 0.15 s after a round strikes a body
//            it bursts there (2.5 m, 35): orange-white sparks and a cyan holographic ring (yanshu_burst)
//   RMB      爐環 yanshu_ring: fire jets out of the door-side slits, the gun sways, a 4 m wall of fire races out round the
//            caster (120 + knockback); RMB again within 1.2 s = 吸爐震擊 yanshu_inhale: the doors gape and the furnace inhales
//            (streaks and dust pulled out of an 8 m 50° cone; the zombies in it dragged 4 m in), then the ram strikes a shock
//            wave (160 + knockback, 6 m cone) -> 超載 (overload, 8 s): the four-beat transformation (fins up 70° into a heat
//            tower — doors 22 mm apart — the ram out 60 mm — the core orange -> white-hot), an orange screen border
//   overload LMB = 熔流光束 yanshu_beam (held: 300/s, pierces 2; a white-hot molten beam out of the ram face, sparks and
//            scorch where it lands); RMB = 樞錘衝撞 yanshu_ram (8 m in 0.35 s, invulnerable to everything; a furnace-wall
//            heat ring round the screen, FOV +6, speed lines; 300 in 4 m where it lands, fire ring, debris, a cracked floor).
//            The last 1.5 s the fins flicker as a warning; then they fall back one by one, the doors close, steam, a hiss,
//            and RMB is locked 5 s while the furnace cools [建議值]
//   R R      破限 yanshu_ult (樞能 100 %: 40 s, +2 % a kill; hold Q works too): the seal strap tears off the spine and burns
//            out, the fins stand to 90°, an orange-white flash, CARD 焰樞．破限; 14 s of overload with a 1.5x beam (pierces
//            3), the drones fire thin beams, the safety stripes flash every 0.5 s; the last 2 s the drones dock beside the ram
//            and the three fire one 30 m beam (900/s) with a melted trail on the ground; then fins fall, doors close, steam
//   passive  隼翼僚機: two falcon drones over the shoulders (viewmodel layer) shoot the nearest zombie within 15 m, 6 x 18 a
//            second each (x1.6 when one is within 4 m); idle they bob out of phase and now and then turn to scan (a fan of
//            light); their eyes turn gold while 破限 is ready
//   aura     分機: at 破限 the two teammates nearest the caster each get a mini drone for 10 s (it shoots for them)
//   crisis   爐壁護盾 (crisis.js 'counter': 300 in 4 m): the six fins leave the gun and lock into a hexagonal furnace wall in
//            front of the player, glow red-hot and burst
//   kill     KE_FORGE: orange-white sparks and a cyan holographic ring; the wave's last kill (KE_FINAL): a forge strike there
// Teammates replay every skill from its network event (visuals; the host applies pulls). Sound cues: SFX (a later stage
// produces them; a missing one falls back to an existing sample or stays silent).
import * as THREE from 'three';
import { registerSpecial, registerSkill, startSkill, endSkill, castSkill, canCast, meterAdd } from '../specials.js';
import { registerClip, magReload } from '../../player/clips.js';
import { registerCrosshair, injectCSS } from '../../ui/crosshairs.js';
import { registerKillMark } from '../../ui/killmarks.js';
import { SKINS } from '../../ui/dmgnums.js';
import { FRAME, DECAL, DECAL_TINT } from '../../fx/fx.js';
import { clipComfort, haptic } from '../arsenal.js';
import { C, ek, camOf, apparent, Wing, MiniDrone, crown, burstFx, ringFire, inhaleLines, steam, slitJets, heatHaze, HoloGauge, SealFlight, HexWall, droneScene } from './yanshu_fx.js';

const ID = 'yanshu';
const UP = new THREE.Vector3(0, 1, 0);
const V3 = () => new THREE.Vector3();
const _a = V3(), _b = V3(), _c = V3(), _d = V3(), _e = V3(), _f = V3();
const R = Math.random, TAU = Math.PI * 2, D2R = Math.PI / 180;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const shake = (g, a) => { if (clipComfort.shake) g.addShake?.(a); };
const OR = '#ffb02e', HOTX = '#fff1d0', CY = '#3fd8ff';
const UNB = 1.3;       // finTo above 1 = 破限: every fin stands at 90° (view() turns it into each fin's own amount)

// sound cues: name -> fallback (an existing sample) | null
const SFX = {
  yanshu_fire: null, yanshu_burst: 'explosion_small', yanshu_hit: null, yanshu_kill: 'killmark_ding', yanshu_head: null,
  yanshu_draw_first: 'drawHeavy', yanshu_hydraulic: 'chunting_seg', yanshu_fin_click: 'ui_click', yanshu_vent: null, yanshu_drone_in: 'chunting_return_whoosh',
  yanshu_roar: 'staff_ult_cloud', yanshu_idle: null, yanshu_drone_idle: null, yanshu_beep: 'ui_click', yanshu_scan: null,
  yanshu_ring: 'explosion_small', yanshu_jets: 'swingHeavy', yanshu_inhale: 'staff_chain_start', yanshu_strike: 'impact_metal',
  yanshu_beat_click: 'ui_click', yanshu_beat_hiss: null, yanshu_beat_clang: 'impact_metal', yanshu_beat_hum: 'chunting_charge',
  yanshu_beam_start: 'chunting_zap_start', yanshu_beam_loop: 'chunting_zap_loop', yanshu_beam_end: 'chunting_zap_end',
  yanshu_ram_jet: 'rocket_close', yanshu_ram_slam: 'explosion_large', yanshu_ready_beep: 'ui_click', yanshu_warn: 'ui_deny',
  yanshu_seal_snap: 'impact_metal', yanshu_ult_chord: 'staff_ult_raise', yanshu_ult_dock: 'chunting_catch', yanshu_ult_giant: 'staff_ult_final',
  yanshu_ult_end: null, yanshu_cool: null, yanshu_drone_shot: null, yanshu_drone_beam: null,
  yanshu_reload_out: 'magOut', yanshu_reload_in: 'magIn', yanshu_reload_vent: null, yanshu_cell: 'ui_click', yanshu_forge: 'impact_metal',
  yanshu_inspect: 'cloth', yanshu_door: 'chunting_seg', yanshu_highfive: 'impact_metal', yanshu_crisis: 'crisis_break', yanshu_final: 'explosion_far', yanshu_mini: 'chunting_return_whoosh',
};
function sfx(g, name, o = {}) {
  const au = g.audio;
  if (!au) return null;
  if (au.has?.(name)) return au.play(name, o);
  const fb = SFX[name];
  return fb ? au.play(fb, { ...o, volume: (o.volume ?? 1) * 0.55 }) : null;
}
/** every cue name this weapon plays (for the audio stage): the SFX table, the gun set and the ready cue */
export const YANSHU_SOUNDS = [...Object.keys(SFX), 'yanshu_close', 'yanshu_tail', 'yanshu_mech', 'ready_yanshu'];

// ------------------------------------------------------------------------------------------ per-weapon state
function ysOf(ws) {
  return ws.sp.ys || (ws.sp.ys = {
    q: [], view: { w: null }, combo: 0, over: 0, overTotal: 8, unbound: null, vent: 0, beam: null, ramK: null, rr: 0, pend: [],
    shotHit: null, shotKills: 0, wing: null, holo: null, flights: [], minis: [], walls: [], beams: [null, null],
    readyN: false, readyT: 0, finalWave: -1, hum: null, droneHum: null,
    fins: [0, 0, 0, 0, 0, 0], finTo: 0, finAt: -9, door: 0, doorTo: 0, ram: 0, ramTo: 0, core: 0, coreTo: 0, needle: 0, kick: 0,
    idleT: 4, rareT: 12, scanT: [3.5, 6.2], fireT: [0, 0.08], dock: false, palm: 0, five: 0, dronesIn: -1, crisisT: 0, sealOff: false,
    warnT: 0, stripeT: 0, gunRest: null,
  });
}
/** game-time delayed calls (hitstop / stepped frames safe), run from the special's tick */
function later(ws, sec, fn) { ysOf(ws).q.push([sec, fn]); }
function runQueue(ys, dt) { const q = ys.q; for (let i = q.length - 1; i >= 0; i--) if ((q[i][0] -= dt) <= 0) { const f = q[i][1]; q.splice(i, 1); f(); } }
const P = (ws) => ws.def.yanshu;
const mine = (g, ws) => g.arsenal?.current === ws && g.vm?.weapon?.def === ws.def;

// ------------------------------------------------------------------------------------------ feedback helpers
/** heavy-hit feel: a short stop (rate-limited) + shake; big = a FOV punch too */
function heavy(ws, g, stop, trauma, big = false) {
  const ys = ysOf(ws);
  if (g.time - (ys.stopAt ?? -9) > (big ? 0.12 : 0.25)) {
    ys.stopAt = g.time;
    if (clipComfort.hitstop) g.hitStop?.(stop);
    if (big) g.arsenal?.fovKick?.(-2.2, 0.18);
  }
  shake(g, trauma);
}
/** a damage number with this weapon's skin and no hit marker (the drones' rounds: a marker per drone shot was a tick storm) */
function quietNumber(g, p, n, z) {
  const h = g.hud;
  if (!h?.nums || h.settings?.damageNumbers === false || !(n > 0.5)) return;
  h.nums.add(p, n, { skin: 'yanshu', target: z });
}

// KE_FORGE (§1.10): the body bursts into orange-white sparks with a cyan holographic ring and a digital ding. Skill kills
// in a crowd: one ring each, at most 4 a 0.15 s.
function killFx(ws, g, z, p, head = false, skill = false) {
  const ys = ysOf(ws), P2 = g.fx?.particles, fx = g.fx;
  const c = z.center ? z.center(V3()) : p.clone(), boss = !!z.def?.boss;
  const k = (boss ? 1.8 : 1) * clamp(g.camera.position.distanceTo(c) / 5, 0.45, 1);
  if (skill && !boss) {
    finalKill(ws, g, z);
    const now = g.time ?? 0;
    if (now - (ys.kwT ?? -9) > 0.15) { ys.kwT = now; ys.kwN = 0; }
    if (ys.kwN++ >= 4) return;
    burstFx(g, c, 0.8 * k);
    if (ys.kwN === 1) sfx(g, 'yanshu_kill', { pos: c, volume: 0.55 });
    return;
  }
  burstFx(g, c, 1.4 * k);
  const e = ek(g);
  // an upright holographic ring scanning round (ticks spinning) over the body
  P2?.spawn({ additive: true, x: c.x, y: c.y, z: c.z, life: 0.5, size: 0.6 * k, size1: 1.7 * k, sizePow: 0.4, color: [C.CYAN[0] * e, C.CYAN[1] * e, C.CYAN[2] * e, 1], color1: [0, 0, 0, 0], frame: FRAME.ring, rot: R() * 6, spin: 5, far: 'sqrt' });
  P2?.spawn({ additive: true, x: c.x, y: c.y, z: c.z, delay: 0.05, life: 0.4, size: 0.4 * k, size1: 2.4 * k, sizePow: 0.5, color: [C.CYAN[0] * 0.7 * e, C.CYAN[1] * 0.7 * e, C.CYAN[2] * 0.7 * e, 0.8], color1: [0, 0, 0, 0], frame: FRAME.thinRing, rot: R() * 6, far: 'sqrt' });
  for (let i = 0; i < 6; i++) {
    const a = R() * TAU;
    P2?.spawn({ additive: true, x: c.x, y: c.y, z: c.z, vx: Math.cos(a) * 3, vy: 2 + R() * 3, vz: Math.sin(a) * 3, life: 0.9 + R() * 0.4, size: 0.05, size1: 0.015, color: [...C.SPARK, 1], color1: [...C.DEEP, 0], frame: FRAME.spark, stretch: 0.03, gravity: 7, drag: 0.8, collide: true, bounce: 0.3 });
  }
  if (head) fx?.motes?.burst?.('ember', c, 8, { speed: 3, spread: 0.9, radius: 0.15 });
  sfx(g, 'yanshu_kill', { pos: c, volume: 0.8, pitch: head ? 2 : 1 });
  if (!skill) ys.shotKills++;
  finalKill(ws, g, z);
}
/** KE_FINAL (§1.10): the wave's last kill gets a small forge strike there (no damage, once a wave) */
function finalKill(ws, g, z) {
  const m = g.match, ys = ysOf(ws);
  if (m && m.state === 'round' && (m.queue?.length ?? 1) + (g.zombies?.alive ?? 1) <= 0 && ys.finalWave !== m.round) {
    ys.finalWave = m.round;
    const ev = { type: 'skill', id: 'yanshu_final', w: ID, slot: 'fx', seed: (R() * 2147483647) | 0, pos: [z.pos.x, z.pos.y, z.pos.z], dir: [0, 0, -1], by: g.localId, ph: 0 };
    startSkill(g, ev, { ws: null, local: true });
    g.net?.sendSkill?.(ev);
  }
}

// ------------------------------------------------------------------------------------------ zombie helpers (host)
/** drag a zombie towards p by about `dist` m (zombie gravity / friction eat the rest: a short burst of velocity) */
function drag(g, z, p, dist) {
  if (!g.zombies?.authority || !z.alive || !z.kvel || z.def?.boss) return;
  const dx = p.x - z.pos.x, dz = p.z - z.pos.z, d = Math.hypot(dx, dz) || 1, v = Math.min(dist, Math.max(0, d - 1.4)) * 4.2;
  z.kvel.x = dx / d * v; z.kvel.z = dz / d * v; z.kvel.y = Math.max(z.kvel.y || 0, 1.2);
  if (z.state === 'special') { z.state = 'stagger'; z.stateT = 0.2; }
}

// ------------------------------------------------------------------------------------------ overload state (caster)
/** 超載 starts (or is extended by 破限): the four-beat transformation, the border, the meter */
function enterOverload(ws, g, dur, { fast = false } = {}) {
  const ys = ysOf(ws), was = ys.over > 0;
  ys.over = dur; ys.overTotal = dur; ys.warnT = 0;
  if (ws.sp.m) ws.sp.m.over = 1;
  const beats = fast ? 0.08 : 0.12;
  if (!was) {
    // ① fins up (click) ② doors apart (hiss) ③ ram out (clang) ④ core white-hot (hum)
    const beat = (i) => {
      const hold = mine(g, ws);
      if (i === 0) { setFins(ws, g, ys.unbound ? UNB : 1); if (hold) steam(g, ['fin1', 'fin2', 'fin3', 'fin4', 'fin5', 'fin6'], 0.7); }
      if (i === 1) { ys.doorTo = 1; if (hold) steam(g, ['door'], 1); }
      if (i === 2) { ys.ramTo = 1; if (hold) sparksAt(g, 'ram', 10); }
      if (i === 3) { ys.coreTo = 1; if (hold) { g.vm?.glowTo?.(3, 0.08, { mat: 'glow_orange' }); later(ws, 0.15, () => g.vm?.glowTo?.(1, 0.3, { mat: 'glow_orange' })); } }
      sfx(g, ['yanshu_beat_click', 'yanshu_beat_hiss', 'yanshu_beat_clang', 'yanshu_beat_hum'][i], { volume: 0.8 });
      if (hold) { g.arsenal?._clipHaptic?.('tick'); if (i === 2) shake(g, 0.08); }
    };
    beat(0);
    for (let i = 1; i < 4; i++) later(ws, beats * i, () => beat(i));
    if (!fast && mine(g, ws) && g.arsenal?.state === 'idle') g.arsenal.playClip('yanshu_over', { duration: beats * 4 + 0.1 });
  } else if (ys.unbound) setFins(ws, g, UNB);
  if (clipComfort.overlay) { ys.borderH?.stop?.(0.1); ys.borderH = g.fx?.overlay?.border?.([1.0, 0.5, 0.12], ys.unbound ? 0.2 : 0.15, Infinity, { fadeIn: 0.15, fadeOut: 0.5 }); }
  else g.hud?.border?.(OR, ys.unbound ? 0.2 : 0.15, dur);
}
/** 超載 ends: the beam stops, fins fall one by one, the doors close, the ram returns, steam and a hiss; RMB cools */
function exitOverload(ws, g, quiet = false) {
  const ys = ysOf(ws);
  if (ys.over <= 0 && !ys.coreTo) return;
  ys.over = 0; ys.coreTo = 0; ys.doorTo = 0; ys.ramTo = 0;
  if (ws.sp.m) ws.sp.m.over = 0;
  setFins(ws, g, 0);
  if (ys.beam && !ys.beam.done) endSkill(ys.beam);
  ys.beam = null;
  ys.borderH?.stop?.(0.4); ys.borderH = null;
  if (quiet) return;
  ys.vent = P(ws).vent;
  if (mine(g, ws)) {
    for (let i = 0; i < 6; i++) later(ws, 0.06 + i * 0.07, () => { if (mine(g, ws)) steam(g, ['fin' + (i + 1)], 1.1); });
    later(ws, 0.3, () => { if (mine(g, ws)) steam(g, ['door', 'slitL', 'slitR'], 1.3); });
    sfx(g, 'yanshu_cool', { volume: 0.8 });
  }
}
function setFins(ws, g, to) { const ys = ysOf(ws); if (ys.finTo !== to) { ys.finTo = to; ys.finAt = g.time; } }
function sparksAt(g, sock, n = 8, col = C.SPARK) {
  const c = g.vm?.socketCam?.(sock, _a), P2 = g.fx?.particles;
  if (!c || !P2) return;
  for (let i = 0; i < n; i++) P2.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, vx: (R() - 0.5) * 1.2, vy: R() * 1, vz: (R() - 0.5) * 1.2, life: 0.25, size: 0.003, stretch: 0.012,
    color: [...col, 1], color1: [...C.DEEP, 0], frame: FRAME.spark, gravity: 3, drag: 3, inertia: 0.5 });
}

// ------------------------------------------------------------------------------------------ the drones (caster)
/** hover anchors in container space (upper left / upper right of the frame) */
const ANCHOR = [[-0.21, 0.065, -0.48], [0.24, 0.075, -0.5]];
const OFF = [[-0.85, 0.25, -0.75], [0.95, 0.3, -0.8]];
function wingOf(ws, g) {
  const ys = ysOf(ws);
  if (!ys.wing && g.vm?.container) { ys.wing = new Wing(g, ws.def); ys.holo = new HoloGauge(g); }
  return ys.wing;
}
/** targets for the two drones: the nearest (and second nearest) alive zombie within range, seen from the eye */
function droneTargets(g, range) {
  const eye = g.camera.position, list = g.targets?.list || g.zombies?.list || [], out = [];
  for (const z of list) {
    if (!z.alive || !z.center) continue;
    const c = z.center(_c), d = c.distanceTo(eye);
    if (d > range || d < 0.5) continue;
    out.push({ z, d });
  }
  out.sort((a, b) => a.d - b.d);
  const seen = [];
  for (const o of out) {
    _d.subVectors(o.z.center(_c), eye).normalize();
    const hit = g.world?.collision?.raycast(eye, _d, o.d);
    if (hit && hit.dist < o.d - 0.6) continue;
    seen.push(o);
    if (seen.length >= 2) break;
  }
  return seen;
}
function droneHit(ws, g, z, amount, from) {
  const p = z.center(V3()), dir = p.clone().sub(from).normalize();
  const info = { amount: amount * (g.arsenal?.dmgMul ?? 1), part: 'body', point: p, dir, knock: 0.25, stagger: 0.12, weapon: ID, shooter: g.localId, skill: 'yanshu_drone' };
  const res = z.damage(info);
  if (res?.killed) { g.hud?.onHit?.(info, res, z); meterAdd(ws, 'ult', ws.def.special.meters.ult.onKill ?? 2); killFx(ws, g, z, p, false, true); }
  else quietNumber(g, p, res?.damage ?? info.amount, z);
  return res;
}
/** per frame while held: place, aim and fire the drones */
function drones(ws, g, dt) {
  const ys = ysOf(ws), w = wingOf(ws, g), vm = g.vm, pp = ws.def.special.passive.drones;
  if (!w) return;
  const alive = !!g.status?.alive, ar = g.arsenal;
  w.visible = ys.dronesIn !== -2 && alive;
  // the gun's sway: the drones follow a third of it
  const gr = vm.gunRoot.position;
  if (!ys.gunRest) ys.gunRest = gr.clone();
  ys.gunRest.lerp(gr, 1 - Math.exp(-2 * dt));
  _f.subVectors(gr, ys.gunRest).multiplyScalar(0.35);
  const t = g.time, unb = ys.unbound, giant = !!unb?.data?.giant;
  const ready = canCast(ws, 'ult').ok;
  const tg = alive && !ar?._inspecting ? droneTargets(g, pp.range) : [];
  const want = (i, out) => {
    // docked beside the ram for the giant beam
    // (spread wider than the sockets, so the three muzzles read as a triangle from behind the gun)
    if (giant || ys.dock) { const s = vm.socketCam?.(i ? 'droneR' : 'droneL', _a); if (s) { out.copy(s).applyMatrix4(_m4.copy(vm.container.matrix).invert()); out.x += i ? 0.07 : -0.12; out.y += i ? 0.1 : 0.08; out.z += 0.12; return; } }
    // the inspect: drone L (or both, the rare high five) hovers over the left palm
    if (ys.palm > 0 && (i === 0 || ys.five > 0)) {
      const h = vm.handPos.L;
      out.set(h.x + (ys.five > 0 ? (i ? 0.035 : -0.035) * (1 - clamp(ys.fiveK || 0, 0, 1)) : 0), h.y + 0.075, h.z - 0.01);
      return;
    }
    const A = (w.anchor ||= ANCHOR.map((x) => x.slice()))[i];
    out.set(A[0], A[1] + Math.sin(t * 2.4 + i * 2.1) * 0.006, A[2]).add(_f);
    if (ys.dronesIn >= 0 && ys.dronesIn < 0.05) out.set(...OFF[i]);
  };
  // each drone takes the target on its own side (the left drone's beam crossing the crosshair to a zombie on the right hid it)
  if (tg.length === 2 && toSide(g, tg[0].z) > toSide(g, tg[1].z)) tg.reverse();
  const aims = [null, null];
  for (let i = 0; i < 2; i++) {
    const o = tg[i] || tg[0];
    if (o) aims[i] = o.z.center(V3());
  }
  if (ys.dronesIn >= 0) ys.dronesIn += dt;
  w.update(dt, want, aims, { eye: (i) => (ys.beams[i] || giant ? HOTX : ready ? '#ffcf4a' : CY), k: ys.palm > 0 ? 7 : 8 });
  // idle scans: every 4-7 s a drone sweeps its head across (a thin fan of light from its eye)
  for (let i = 0; i < 2; i++) {
    const d = w.d[i];
    if (!d) continue;
    if (!aims[i] && (ys.scanT[i] -= dt) <= 0) { ys.scanT[i] = 4 + R() * 3; d.scanK = 1; sfx(g, 'yanshu_scan', { volume: 0.25 }); }
    if (d.scanK > 0) { d.scanK = Math.max(0, d.scanK - dt / 1.4); d.scan = Math.sin((1 - d.scanK) * TAU) * 0.9; scanFan(g, w, d); } else d.scan = damp(d.scan || 0, 0, 4, dt);
  }
  // fire
  const near = tg.some((o) => o.d < pp.near);
  const rate = pp.rate * (near ? pp.nearMul : 1);
  for (let i = 0; i < 2; i++) {
    const o = tg[i] || tg[0];
    // (one target: only the drone on its side beams it; a beam from the far side lay across the crosshair)
    if (unb && !giant) { droneBeam(ws, g, i, tg.length === 1 && (toSide(g, tg[0].z) > 0 ? 1 : 0) !== i ? null : o, dt); continue; }
    if (ys.beams[i]) { ys.beams[i].stop(); ys.beams[i] = null; }
    if (!o || giant || ys.palm > 0 || !alive) { ys.fireT[i] = Math.max(ys.fireT[i], 0.05); continue; }
    if ((ys.fireT[i] -= dt) > 0) continue;
    ys.fireT[i] += 1 / rate;
    const from = w.muzzleWorld(i, V3());
    if (!from) continue;
    const to = o.z.center(V3()).add(_a.set((R() - 0.5) * 0.25, (R() - 0.2) * 0.3, (R() - 0.5) * 0.25));
    g.fx?.glowTracer?.(from, to, { color: [C.CYAN[0] * 1.6, C.CYAN[1] * 1.6, C.CYAN[2] * 1.6], glow: [0.25, 0.8, 1.3], width: 0.012, length: 1.4, speed: 260, start: 0 });
    w.flash(i, 1); w.recoil(i, 1);
    g.fx?.sparkBurst?.(to, { color: C.CYAN, color1: [0.2, 0.6, 1.2], count: 3, speed: 3, glow: 0.2 });
    sfx(g, 'yanshu_drone_shot', { volume: 0.22, pitch: 0.95 + R() * 0.1 });
    droneHit(ws, g, o.z, pp.dmg, from);
  }
}
const _m4 = new THREE.Matrix4();
/** how far right of the view a zombie stands (camera-space x / depth) */
function toSide(g, z) { const c = z.center(_e).sub(g.camera.position), cam = g.camera; cam.getWorldDirection(_d); const r = _b.crossVectors(_d, UP).normalize(); return c.dot(r) / Math.max(0.5, c.dot(_d)); }
/** 破限: the drones fire thin continuous beams at their targets (108/s each) */
function droneBeam(ws, g, i, o, dt) {
  const ys = ysOf(ws), w = ys.wing;
  const from = w?.muzzleWorld(i, V3());
  if (!o || !from || !g.status?.alive) { if (ys.beams[i]) { ys.beams[i].stop(); ys.beams[i] = null; } return; }
  const to = o.z.center(V3());
  if (!ys.beams[i]) ys.beams[i] = g.fx?.beam?.(from, to, { core: [C.HOT[0] * 0.5, C.HOT[1] * 0.5, C.HOT[2] * 0.6], glow: [C.CYAN[0] * 0.3, C.CYAN[1] * 0.3, C.CYAN[2] * 0.3], wCore: 0.007, wGlow: 0.03, life: Infinity, scroll: 2 });
  ys.beams[i]?.set(from, to);
  if (R() < 0.4) g.fx?.sparkBurst?.(to, { color: C.CYAN, color1: C.HOT, count: 2, speed: 3, glow: 0.2 });
  if ((ys.fireT[i] -= dt) <= 0) { ys.fireT[i] += 0.1; droneHit(ws, g, o.z, P(ws).ult.droneDps * 0.1, from); }
}
/** a scanning drone's fan of light (a few additive streaks off its eye) */
function scanFan(g, w, d) {
  if (R() > 0.5) return;
  const e = w.sockCam(d, 'eye', _a), P2 = g.fx?.particles;
  if (!e || !P2) return;
  _b.copy(d.look).applyAxisAngle(UP, (R() - 0.5) * 0.5);
  P2.spawn({ additive: true, vm: true, x: e.x, y: e.y, z: e.z, vx: _b.x * 0.35, vy: _b.y * 0.35, vz: _b.z * 0.35, life: 0.18, size: 0.002, stretch: 0.25,
    color: [C.CYAN[0] * 0.5, C.CYAN[1] * 0.5, C.CYAN[2] * 0.5, 0.6], color1: [0, 0, 0, 0], frame: FRAME.spark, inertia: 0.9 });
}

// ------------------------------------------------------------------------------------------ viewmodel driver
const ps = (vm, name) => vm.partState[name] || (vm.partState[name] = { v: 0 });
let _coreCol = new THREE.Color();
/** per frame while held: fins, doors, ram, needle, seal, core heat, idle life, ready beats, the drones */
function view(ws, g, dt) {
  const vm = g.vm, w = vm?.weapon, ys = ysOf(ws), ar = g.arsenal;
  if (!w?.parts?.fx_ram || w.def !== ws.def) return;
  const v = ys.view;
  if (v.w !== w) {
    Object.assign(v, { w, t: 0 });
    w.onParts = (vm2, dt2) => onParts(ws, vm2, dt2);
    ys.fins.fill(0); ys.door = 0; ys.ram = 0; ys.gunRest = null;
    if (!ar?.firstDrawing) ys.dronesIn = -1;
    ys.coreMat = null;
    w.root.traverse((o) => { if (o.isMesh && o.material?.userData?.pv === 'pv_core') ys.coreMat = o.material; });
  }
  v.t += dt;
  const t = g.time;
  if (!ys.hum && g.audio?.has?.('yanshu_idle')) ys.hum = sfx(g, 'yanshu_idle', { loop: true, volume: 0.1, fadeIn: 0.4 });
  // ---- fins: each eases to the target after its stagger (rising rear -> front 40 ms apart, falling 70 ms apart)
  const rising = ys.finTo > 0.5;
  const crisis = ys.crisisT > 0;
  for (let i = 0; i < 6; i++) {
    if (t - ys.finAt < i * (rising ? 0.04 : 0.07)) continue;
    const to = ys.finTo > 1.01 ? 90 / (54 + 4 * i) : ys.finTo;   // 破限: every fin upright (each has its own raised angle)
    ys.fins[i] = rising ? damp(ys.fins[i], to, 22, dt) : damp(ys.fins[i], to, 11, dt);
    const p = ps(vm, 'fx_fin' + (i + 1));
    p.v = ys.fins[i] + (ys.over > 0 && ys.over < 1.5 && Math.sin(t * 40 + i) > 0.6 ? -0.03 : 0);
    p.hidden = crisis;
  }
  // ---- doors, ram, core heat
  ys.door = damp(ys.door, ys.doorTo, 12, dt);
  ps(vm, 'fx_doorL').v = ys.door; ps(vm, 'fx_doorR').v = ys.door;
  ys.ram = damp(ys.ram, ys.ram0 ?? ys.ramTo, 16, dt);
  ps(vm, 'fx_ram').v = ys.ram;
  ys.core = damp(ys.core, ys.coreTo, 4, dt);
  // the molten core: orange lava turning white-hot in overload; the fin inserts heat with it, flicker as a warning
  const over = ys.over > 0, warn = over && ys.over < 1.5;
  if (ys.coreMat?.userData?.shader?.uniforms?.pCoreTint) {
    _coreCol.set('#ff7a1a').lerp(_c3.set(HOTX), ys.core * 0.85);
    ys.coreMat.userData.shader.uniforms.pCoreTint.value.copy(_coreCol).multiplyScalar(1 + ys.core * 0.8);
  }
  const fl = warn ? (Math.sin(t * 26) > 0 ? 1 : 0.35) : 1;
  vm._glowMat.glow_vermilion = (0.04 + 1.5 * ys.core) * fl * (ys.beam ? 1.25 : 1);
  if (!vm._glowTw.some((tw) => tw.mat === 'glow_orange')) vm._glowMat.glow_orange = (1 + 1.6 * ys.core) * (ys.beam ? 1.3 : 1);
  // ---- needle: 樞能 (overload: pinned in the red, trembling)
  const want = over ? 0.95 + Math.sin(t * 37) * 0.015 : (ws.sp.m?.ult ?? 0) / 100;
  ys.needle = damp(ys.needle, want, 6, dt);
  ps(vm, 'fx_needle').v = ys.needle;
  // ---- seal: off while unbound (it flew), back with a flash when the unbound ends
  ps(vm, 'fx_seal').hidden = ys.sealOff;
  // ---- overload: heat haze over the tower, the warning flicker beeps, stripes flash while unbound
  if (over) {
    heatHaze(g, ys.unbound ? 1.4 : 1);
    if (warn && (ys.warnT -= dt) <= 0) { ys.warnT = 0.5; sfx(g, 'yanshu_warn', { volume: 0.3, pitch: 1.4 }); }
    if (ys.unbound && (ys.stripeT -= dt) <= 0) { ys.stripeT = 0.5; w.premium?.fire?.(0.3, 0.25); }
  }
  // ---- ready (§1.7.1 beat 7): the core flashes, the drones' eyes turn gold (drones()), a two-tone; the HUD hint once
  const ready = canCast(ws, 'ult').ok && !ys.unbound;
  if (ready) {
    if (!ys.readyN) { ys.readyN = true; ys.readyT = 0; coreFlash(g, ws, 2.6); g.hud?.toast?.('樞能滿：連點兩下 R 破限（或長按 Q）', 1800); }
    else if ((ys.readyT += dt) >= 2.5) { ys.readyT = 0; if (g.hud?.settings?.readyReminder !== false) { coreFlash(g, ws, 1.8); sfx(g, 'yanshu_ready_beep', { volume: 0.25 }); } }
  } else ys.readyN = false;
  // ---- idle life: a vent puff now and then, the rare idle holo gauge every ~12 s at rest
  const idle = ar?.state === 'idle' && !vm.clip.active && (ar.sinceShot ?? 9) > 1.5 && !over;
  if (idle && (ys.idleT -= dt) <= 0) { ys.idleT = 5 + R() * 4; steam(g, ['door'], 0.5); if (R() < 0.5) sfx(g, 'yanshu_vent', { volume: 0.2 }); }
  if (idle && (ar.sinceShot ?? 9) > 3 && (ys.rareT -= dt) <= 0) { ys.rareT = 12; ys.holo?.show(2.2); sfx(g, 'yanshu_beep', { volume: 0.35, pitch: 1.6 }); later(ws, 0.4, () => sfx(g, 'yanshu_beep', { volume: 0.3, pitch: 2.1 })); }
  ys.holo?.update(dt);
  // ---- the drones
  drones(ws, g, dt);
  ys.palm = Math.max(0, ys.palm - dt); ys.five = Math.max(0, ys.five - dt);
  if (ys.fiveK != null && ys.five > 0) ys.fiveK += dt * 2.2;
}
const _c3 = new THREE.Color();
function coreFlash(g, ws, k = 2) {
  g.vm?.glowTo?.(k, 0.06, { mat: 'glow_orange' });
  later(ws, 0.1, () => g.vm?.glowTo?.(1, 0.45, { mat: 'glow_orange' }));
}
/** procedural part motions after the clip / tween pass: the ram's fire recoil (8 mm back, springs home) */
function onParts(ws, vm, dt) {
  const ys = ysOf(ws), r = vm.weapon.parts.fx_ram;
  if (r && ys.kick > 0.0005) { r.node.position.z += ys.kick * 0.008; ys.kick *= Math.exp(-14 * dt); }
}

// ------------------------------------------------------------------------------------------ input routing (caster)
function input(ws, g, dt) {
  const ys = ysOf(ws), ar = g.arsenal, inp = g.input?.state, alive = !!g.status?.alive;
  if (!inp) return;
  // RMB: ours (the engine would cast 'alt' on it): ring -> inhale, or the ram in overload; a first draw is cut by it
  if (inp.pressed.alt) {
    inp.pressed.alt = false;
    if (ar.state === 'draw' && ar.firstDrawing) { ar.firstDrawing = false; g.vm.stopClip(); g.vm.glowTo(1, 0.15); ar.timer = 0; }
    if (alive && (ar.state === 'idle' || ar.state === 'action' && ys.over > 0) && !ys.ramK) {
      if (ys.over > 0) castSkill(ws, 'ram');
      else if (ys.vent > 0) { g.audio?.play('ui_deny', { volume: 0.5 }); g.hud?.toast?.(`爐溫過高：${ys.vent.toFixed(1)} 秒`, 700); }
      else if (ys.combo > 0) { ys.combo = 0; castSkill(ws, 'alt2'); }
      else if (castSkill(ws, 'alt')) ys.combo = P(ws).combo;
    }
  }
  // R R = 破限 (when 樞能 is full a single R waits 0.3 s for the second); in overload R does nothing else
  if (inp.pressed.reload) {
    const ready = canCast(ws, 'ult').ok && !ys.unbound;
    if (ys.rr > 0) { inp.pressed.reload = false; ys.rr = 0; if (ready) castSkill(ws, 'ult'); }
    else if (ready) { inp.pressed.reload = false; ys.rr = 0.3; }
    else if (ys.over > 0) inp.pressed.reload = false;
  }
  if (ys.rr > 0 && (ys.rr -= dt) <= 0) { ys.rr = 0; if (ys.over <= 0) ar.reload(); }
  // overload: LMB holds the molten beam
  if (ys.over > 0 && alive && inp.held.fire && (ar.state === 'idle' || ar.state === 'action') && !ys.ramK && (!ys.beam || ys.beam.done)) startBeam(ws, g);
}
function startBeam(ws, g) {
  const ys = ysOf(ws), cam = g.camera;
  cam.getWorldDirection(_d);
  const ev = { type: 'skill', id: 'yanshu_beam', w: ws.def.id, slot: 'beam', seed: (R() * 2147483647) | 0, pos: [cam.position.x, cam.position.y, cam.position.z], dir: [_d.x, _d.y, _d.z], by: g.localId, ph: 0 };
  const k = startSkill(g, ev, { ws, local: true });
  if (!k) return;
  k.held = 'fire';
  ys.beam = k;
  g.net?.sendSkill?.(ev);
}

// ------------------------------------------------------------------------------------------ the special (engine overrides)
registerSpecial(ID, {
  init(ws) {
    ysOf(ws);
    const au = ws.game?.audio;
    if (au?.defs && !au._ysPre) { au._ysPre = true; au.preload?.(Object.keys(au.defs).filter((n) => /^(yanshu_|ready_yanshu$)/.test(n)))?.catch?.(() => {}); }
    droneScene();   // fetch the drone model with the gun
  },
  modifiers() { return {}; },
  // the gun trigger is ours only in overload (the beam); otherwise the Arsenal fires 樞彈 as a normal automatic
  trigger(ws) { return ysOf(ws).over > 0; },
  onFire(ws, ctx) {
    const g = ctx.game, ys = ysOf(ws), au = g.audio, held = g.arsenal?.current === ws;
    if (held) {
      crown(g, ws.shots);
      ys.kick = 1;
      g.vm?.glowTo?.(1.8, 0.03, { mat: 'glow_orange' }); later(ws, 0.06, () => g.vm?.glowTo?.(1, 0.2, { mat: 'glow_orange' }));
      // the card's 2.5° rise is a view punch (the aim itself only climbs recoil.up)
      g.punch?.impulse?.(-2.5 * D2R * 1.6, (R() - 0.5) * 0.01, (R() - 0.5) * 0.012);
      ys.wing?.d.forEach((d, i) => d.vel.y += 0.05 + i * 0.01);
    }
    // the gun's own set until the audio stage delivers it: the stock .50 under the forge overtone
    if (au && !au.has?.('yanshu_close')) { au.play('sniper50_close', { volume: 0.75 }); au.play('sniper50_tail', { volume: 0.7, delay: 0.015 }); }
    sfx(g, 'yanshu_fire', { volume: 0.35 });
    // 0.15 s after the round struck a body it bursts there (one burst a shot, on the first body)
    const h = ys.shotHit;
    if (h) {
      const ev = { type: 'skill', id: 'yanshu_burst', w: ID, slot: 'fx', seed: (R() * 2147483647) | 0, pos: [h.p.x, h.p.y, h.p.z], dir: [ctx.dir.x, ctx.dir.y, ctx.dir.z], by: g.localId, ph: 0 };
      startSkill(g, ev, { ws, local: true });
      sfx(g, h.head ? 'yanshu_head' : 'yanshu_hit', { volume: 0.3 });
    }
    if (ys.shotKills >= 2) heavy(ws, g, 0.06, 0.16, true);
    else if (ys.shotKills === 1) heavy(ws, g, 0.04, 0.1, !!h?.head);
    ys.shotHit = null; ys.shotKills = 0;
  },
  onHit(ws, info, res, target) {
    const g = ws.game, ys = ysOf(ws), z = target?.zombie || target;
    if (!z?.center) return;
    const p = info.point || z.center(V3());
    if (info.skill) { if (res?.killed) killFx(ws, g, z, p, !!info.headshot, true); return; }
    if (!ys.shotHit) ys.shotHit = { p: p.clone(), head: !!info.headshot };
    if (res?.killed) killFx(ws, g, z, p, !!info.headshot);
  },
  update(ws, dt, g) {
    if (!g._ysWarm && g.fx?.particles) { g._ysWarm = true; prewarm(g); }
    input(ws, g, dt);
    if (mine(g, ws)) view(ws, g, dt);
  },
  tick(ws, dt, g) {
    const ys = ysOf(ws), held = g.arsenal?.current === ws;
    runQueue(ys, dt);
    ys.combo = Math.max(0, ys.combo - dt);
    ys.vent = Math.max(0, ys.vent - dt);
    ys.crisisT = Math.max(0, ys.crisisT - dt);
    if (ys.over > 0) {
      ys.over -= dt;
      if (ws.sp.m) ws.sp.m.over = Math.max(0, ys.over / ys.overTotal);
      if (ys.over <= 0) exitOverload(ws, g);
    }
    if (ys.unbound && ws.sp.m) ws.sp.m.ult = 0;   // 樞能 does not refill while 破限 runs
    for (let i = ys.flights.length - 1; i >= 0; i--) if (!ys.flights[i].update(dt)) ys.flights.splice(i, 1);
    for (let i = ys.minis.length - 1; i >= 0; i--) if (!ys.minis[i].update(dt)) ys.minis.splice(i, 1);
    if (!held) {
      // put away: the overload / 破限 end, the drones hide, loops stop
      if (ys.unbound && !ys.unbound.done) endSkill(ys.unbound);
      if (ys.over > 0) exitOverload(ws, g, true);
      if (ys.wing) ys.wing.visible = false;
      for (let i = 0; i < 2; i++) if (ys.beams[i]) { ys.beams[i].stop(); ys.beams[i] = null; }
      ys.hum?.stop?.(0.2); ys.hum = null;
      ys.dronesIn = -1;
    }
  },
  dispose(ws) {
    const ys = ws.sp?.ys;
    if (!ys) return;
    ys.hum?.stop?.(0.1); ys.hum = null;
    ys.wing?.dispose(); ys.wing = null; ys.holo?.dispose(); ys.holo = null;
    for (const f of ys.flights) f.dispose();
    for (let i = 0; i < 2; i++) ys.beams[i]?.stop();
    ys.borderH?.stop?.(0.1);
    ys.q.length = 0;
  },
  meterInfo(ws, key, m) {
    const ys = ysOf(ws);
    if (key === 'over') return { ...m, value: ys.over > 0 ? ys.over / ys.overTotal : ys.combo > 0 ? ys.combo / P(ws).combo * 0.5 : 0, raw: Math.ceil(Math.max(0, ys.over)), ready: false, active: ys.over > 0, hidden: ys.over <= 0 && ys.combo <= 0 };
    return m;
  },
  onClipEvent(ws, name, arg, g) { if (name === 'ys') ysEvent(ws, g, typeof arg === 'string' ? { do: arg } : arg || {}); },
});

/** clip events ['ys', { do, ... }] */
function ysEvent(ws, g, a) {
  const ys = ysOf(ws), vm = g.vm;
  switch (a.do) {
    case 'snd': sfx(g, a.n, { volume: a.v ?? 0.8, pitch: a.p ?? 1 }); break;
    case 'click': sfx(g, 'yanshu_fin_click', { volume: 0.5, pitch: 1 + (a.i ?? 0) * 0.06 }); if (a.steam) steam(g, ['fin' + ((a.i ?? 0) + 1)], 0.5); break;
    case 'steam': steam(g, [].concat(a.s || 'door'), a.k ?? 1); break;
    case 'drones_in': ys.dronesIn = 0; if (ys.wing) for (const d of ys.wing.d) d.snap = true; sfx(g, 'yanshu_drone_in', { volume: 0.7 }); break;
    case 'drones_hide': ys.dronesIn = -2; break;
    case 'crack': sfx(g, 'yanshu_roar', { volume: 0.55, pitch: 0.7 }); coreFlash(g, ws, 2.4); doorLight(g, 0.7, 0.9); break;
    case 'jets': slitJets(g, a.k ?? 1); break;
    case 'vent': steam(g, ['door', 'slitL', 'slitR'], 1); sfx(g, 'yanshu_reload_vent', { volume: 0.6 }); break;
    case 'cell': {
      // the new cell's four charge windows light one after another
      for (let i = 0; i < 4; i++) later(ws, i * 0.06, () => { g.vm?.glowTo?.(2.2, 0.03, { mat: 'glow_orange' }); sfx(g, 'yanshu_cell', { volume: 0.3, pitch: 1.2 + i * 0.15 }); });
      later(ws, 0.3, () => g.vm?.glowTo?.(1, 0.3, { mat: 'glow_orange' }));
      break;
    }
    case 'forge': sparksAt(g, 'ram', 16, C.HOT); sfx(g, 'yanshu_forge', { volume: 0.9 }); shake(g, 0.06); g.arsenal?._clipHaptic?.('thud'); ys.kick = 1.6; break;
    case 'door': sfx(g, 'yanshu_door', { volume: 0.6 }); break;
    case 'doorlight': doorLight(g, a.k ?? 1, a.dur ?? 1); break;
    case 'palm': ys.palm = a.dur ?? 1.2; ys.five = 0; ys.fiveK = null; sfx(g, 'yanshu_drone_in', { volume: 0.4, pitch: 1.3 }); break;
    case 'five': ys.palm = a.dur ?? 1.2; ys.five = a.dur ?? 1.2; ys.fiveK = 0; break;
    case 'clap': {
      const h = vm?.handPos?.L;
      if (h) { camOf(g, _a.set(h.x, h.y + 0.075, h.z - 0.01), _b); for (let i = 0; i < 14; i++) g.fx?.particles?.spawn({ additive: true, vm: true, x: _b.x, y: _b.y, z: _b.z, vx: (R() - 0.5) * 0.9, vy: R() * 0.6, vz: (R() - 0.5) * 0.9, life: 0.3, size: 0.003, stretch: 0.01, color: [...C.SPARK, 1], color1: [...C.DEEP, 0], frame: FRAME.spark, gravity: 2, drag: 2 }); }
      sfx(g, 'yanshu_highfive', { volume: 0.7, pitch: 1.4 }); g.arsenal?._clipHaptic?.('tick');
      break;
    }
    case 'world': worldInspect(ws, g); sfx(g, 'yanshu_inspect', { volume: 0.6 }); break;
    case 'readyFlash': coreFlash(g, ws, 2.4); steam(g, ['door'], 0.6); break;
    case 'beat': sparksAt(g, a.s || 'ram', 6); break;
    default: break;
  }
}
/** the molten light out of the open doors (a held light just above them, a warm glow on the glove) */
function doorLight(g, k = 1, dur = 1) {
  const p = g.vm?.socketWorld?.('door', V3());
  if (!p) return;
  p.y += 0.04;
  g.fx?.lights?.flash?.(p, 0xff9a3a, 1.2 * k, 0.9, dur);
}
/** 改變世界的檢視 (mythic inspect): the world dims to a forge-lit dusk for 2.5 s (this screen only) */
function worldInspect(ws, g) {
  const post = g.renderer?.post, ys = ysOf(ws);
  if (!post || ys.dusk) return;
  const k = 0.72;
  post.exposure *= k; ys.dusk = true;
  if (clipComfort.overlay) g.fx?.overlay?.tint?.([1.0, 0.55, 0.22], 0.12, 2.5, { fadeIn: 0.4, fadeOut: 0.6 });
  later(ws, 2.5, () => { post.exposure /= k; ys.dusk = false; });
}

/** first big effects of a fresh match hitched: build the drone, a beam, a trail, a wall once, far under the map */
function prewarm(g) {
  const fx = g.fx, far = V3().set(0, -500, 0);
  try {
    fx.beam?.(far.clone(), V3().set(0, -499, 0), { core: [0, 0, 0], glow: [0, 0, 0], wCore: 0.001, wGlow: 0.001, life: 0.05, pattern: 'molten' });
    fx.overlay?.radial?.(0.0001, 0.05, { color: [0, 0, 0] });
    fx.overlay?.status?.('burn', 0.0001, 0.05);
    fx.zfx?.ground?.add?.('crack', far, { r: 0.1, life: 0.1, col: [1, 0.5, 0.2], alpha: 0.1 });
    fx.decals?.add?.(far, UP, { frame: DECAL.scorch, size: 0.05, tint: DECAL_TINT.scorch, life: 0.1 });
    fx.motes?.burst?.('shard', far, 2, { palette: [[0.9, 0.88, 0.84]], speed: 1, spread: 1, radius: 0.1 });
    fx.sigils?.pillar?.(far, { radius: 0.05, height: 0.1, life: 0.2, motes: 0, ring: false, light: 0 });
    const w = new HexWall(g, far, 0, { dist: 0, size: 0.05 });
    setTimeout(() => w.dispose(), 300);   // presentation only: wall clock is fine
  } catch (e) { console.warn('yanshu prewarm', e); }
}

// ------------------------------------------------------------------------------------------ skills
const ysK = (k) => (k.ws ? ysOf(k.ws) : null);

// 樞彈 burst (local only, never sent): 0.15 s after the hit, 2.5 m, 35
registerSkill('yanshu_burst', {
  level: 'L1', dur: 0.3, defaults: { delay: 0.15, r: 2.5, dmg: 35 },
  start(k) { Object.assign(k.p, k.def.yanshu?.burst || {}); },
  update(k) {
    if (k.data.done || k.t < k.p.delay) return;
    k.data.done = true;
    burstFx(k.game, k.pos, 1, k.rng);
    sfx(k.game, 'yanshu_burst', { pos: k.pos, volume: 0.45, pitch: 1.2 + k.rng() * 0.2 });
    k.hurt(k.pos, k.p.r, k.p.dmg, { knock: 1.5, stagger: 0.4, falloffMin: 0.55, explosive: false });
  },
});

// 爐環 (◎): fire jets out of the slits, a 4 m wall of fire round the caster, 120 + knockback
registerSkill('yanshu_ring', {
  level: 'L2', dur: 0.6, defaults: { r: 4, dmg: 120, knock: 7 },
  start(k) {
    const g = k.game, c = k.feet(V3()), p = k.p;
    ringFire(g, c, p.r, k.rng);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; g.fx?.knockDust?.(_b.set(c.x + Math.cos(a) * p.r * 0.85, c.y, c.z + Math.sin(a) * p.r * 0.85), _e.set(Math.cos(a) * 6, 0, Math.sin(a) * 6), 1); }
    g.fx?.decals?.add?.(c, UP, { frame: DECAL.scorch, size: p.r * 0.8, tint: DECAL_TINT.scorch, life: 4 });
    sfx(g, 'yanshu_ring', k.local ? { volume: 1 } : { pos: c, volume: 1 });
    if (!k.local) return;
    k.hurt(_a.set(c.x, c.y + 0.9, c.z), p.r, p.dmg, { knock: p.knock, stagger: 1, falloffMin: 0.6, explosive: false });
    shake(g, 0.15);
    sfx(g, 'yanshu_jets', { volume: 0.8 });
    const ar = g.arsenal;
    if (ar && k.ws && ar.current === k.ws) { slitJets(g, 1.2); if (ar.state === 'idle') ar.playClip('yanshu_ring'); }
    if (clipComfort.overlay) g.fx?.overlay?.border?.([1, 0.45, 0.1], 0.12, 0.35, { fadeIn: 0.03, fadeOut: 0.3 });
  },
});

// 吸爐震擊 (◎ again within 1.2 s): the furnace inhales an 8 m 50° cone (dragged 4 m in), the ram strikes a shock wave
// (160 + knockback, 6 m cone); done = 超載
registerSkill('yanshu_inhale', {
  level: 'L2', dur: 0.75, defaults: { range: 8, cone: 50, pull: 4, dmg: 160, wave: 6 },
  start(k) {
    const g = k.game, p = k.p, eye = k.caster(V3(), _d), dir = _d.clone();
    k.data.eye = eye.clone(); k.data.dir = dir.setY(dir.y * 0.4).normalize();
    inhaleLines(g, eye, k.data.dir, p.range, p.cone, k.rng);
    sfx(g, 'yanshu_inhale', k.local ? { volume: 1 } : { pos: eye, volume: 0.9 });
    // the pull (host): zombies in the cone
    const cc = Math.cos(p.cone / 2 * D2R);
    k.data.pulled = 0;
    for (const z of g.zombies?.list || []) {
      if (!z.alive) continue;
      _a.subVectors(z.center(_c), eye); const d = _a.length();
      if (d > p.range || _a.normalize().dot(k.data.dir) < cc) continue;
      drag(g, z, eye, p.pull); k.data.pulled++;
    }
    if (!k.local) return;
    const ar = g.arsenal, ys = ysK(k);
    if (ys) { ys.doorTo = 1.25; ys.ram0 = 0; }
    if (ar && k.ws && ar.current === k.ws && ar.state === 'idle') ar.playClip('yanshu_inhale', { duration: 0.62 });
    if (clipComfort.overlay) g.fx?.overlay?.radial?.(0.5, 0.35, { color: [1.6, 0.8, 0.3], r0: 0.34, density: 0.3, thin: 0.5 });
    g.arsenal?.fovKick?.(-2, 0.35);
  },
  update(k) {
    const g = k.game, p = k.p, d = k.data;
    if (!d.struck && k.t >= 0.42) {
      d.struck = true;
      // the ram strikes: a shock wave out of the face, a forge clang
      const eye = k.caster(V3(), _d), dir = d.dir;
      const c = eye.clone().addScaledVector(dir, 2.2); c.y = k.floorY(c);
      g.fx?.shockwave?.(_a.set(c.x, c.y + 0.06, c.z), { normal: UP, r0: 0.4, r1: p.wave, life: 0.4, color: [C.ORANGE[0] * ek(g), C.ORANGE[1] * ek(g), C.ORANGE[2] * ek(g)], thin: false });
      g.fx?.shockwave?.(_a.set(c.x, c.y + 1.1, c.z), { normal: dir.clone().negate(), r0: 0.3, r1: 2.6, life: 0.3, color: [C.HOT[0] * 0.5, C.HOT[1] * 0.5, C.HOT[2] * 0.5], thin: true });
      for (let i = 0; i < 8; i++) { const a = (i / 8 - 0.5) * 1.4; _e.copy(dir).applyAxisAngle(UP, a); g.fx?.knockDust?.(_b.copy(c).addScaledVector(_e, 1.5), _e.multiplyScalar(7), 1.2); }
      sfx(g, 'yanshu_strike', k.local ? { volume: 1 } : { pos: c, volume: 1 });
      if (!k.local) return;
      const ys = ysK(k);
      if (ys) { ys.ram0 = null; ys.ramTo = 1; later(k.ws, 0.12, () => { if (!(ys.over > 0)) ys.ramTo = 0; }); }
      sparksAt(g, 'ram', 14, C.HOT);
      // 160 in a 6 m cone in front, knockback out
      const cc = Math.cos(35 * D2R);
      for (const t of g.targets?.inRadius?.(eye, p.wave) || []) {
        _a.subVectors(t.center(_c), eye); const dd = _a.length();
        if (_a.normalize().dot(dir) < cc && dd > 1.2) continue;
        const info = { amount: p.dmg * Math.max(0.6, 1 - dd / p.wave) * (g.arsenal?.dmgMul ?? 1), part: 'body', point: t.center(V3()), dir: _a.clone(), knock: 6, stagger: 1, weapon: ID, shooter: g.localId, explosive: false, skill: k.id };
        k._feedback(info, t.damage(info), t);
      }
      shake(g, 0.22); heavy(k.ws, g, 0.05, 0.05);
      g.arsenal?._clipHaptic?.('thud');
    }
    if (k.local && !d.over && k.t >= 0.6) {
      d.over = true;
      if (k.ws) enterOverload(k.ws, g, P(k.ws).overload);
    }
  },
});

// 熔流光束 (LMB held in overload): 300/s, pierces 2 (破限: 1.5x wide, pierces 3); every client draws it
registerSkill('yanshu_beam', {
  level: 'L1', channel: true, defaults: { dps: 300, pierce: 2, range: 40, tick: 0.1, width: 0.11 },
  start(k) {
    const g = k.game, d = k.data;
    Object.assign(k.p, k.def.yanshu?.beam || {});
    d.acc = 0; d.fxT = 0; d.decT = 0;
    const ys = ysK(k), unb = !!ys?.unbound || !!k.ev.unb;
    d.k = unb ? k.def.yanshu?.ult?.beamMul ?? 1.5 : 1;
    if (k.local && ys?.unbound) k.ev.unb = 1;
    d.beam = g.fx?.beam?.(V3(), V3(), { core: [C.HOT[0] * 1.1, C.HOT[1] * 1.05, C.HOT[2]], glow: [C.ORANGE[0] * 0.6, C.ORANGE[1] * 0.55, C.ORANGE[2] * 0.5], wCore: k.p.width * 0.35 * d.k,
      wGlow: k.p.width * 2.2 * d.k, life: Infinity, scroll: 1.6, pattern: 'molten', wStart: 0.3, ramp: 2.5 });
    d.loop = sfx(g, 'yanshu_beam_loop', k.local ? { loop: true, volume: 0.7 } : { loop: true, pos: k.pos, volume: 0.6 });
    sfx(g, 'yanshu_beam_start', k.local ? { volume: 0.9 } : { pos: k.pos, volume: 0.8 });
    if (k.local) { g.arsenal?.fovKick?.(-1.5, 0.25); g.arsenal?._clipHaptic?.('thud'); }
  },
  update(k, dt) {
    const g = k.game, d = k.data, p = k.p;
    const ys = ysK(k);
    if (k.local && !(ys?.over > 0)) return false;
    const eye = k.caster(_c, _d), dir = _d;
    const hit = g.world?.collision?.raycast(eye, dir, p.range);
    const len = hit ? hit.dist : p.range;
    const end = _e.copy(eye).addScaledVector(dir, len);
    const from = k.local ? g.vm?.socketApparent?.('ram', _f) || k.muzzle(_f) : k.muzzle(_f);
    d.beam?.set(from, end);
    // the landing: sparks, molten drips, a scorch trail, a held light
    if ((d.fxT -= dt) <= 0) {
      d.fxT = 0.05;
      g.fx?.sparkBurst?.(end, { color: C.HOT, color1: C.ORANGE, count: 4, speed: 5, glow: 0.35, normal: hit?.normal });
      if (hit && k.rng() < 0.5) g.fx?.particles?.spawn({ additive: true, x: end.x, y: end.y, z: end.z, vx: (k.rng() - 0.5) * 2, vy: 1 + k.rng() * 2, vz: (k.rng() - 0.5) * 2, life: 0.8, size: 0.04, size1: 0.01,
        color: [...C.ORANGE, 1], color1: [...C.DEEP, 0], frame: FRAME.glow, gravity: 9, collide: true, bounce: 0.2 });
    }
    if (hit && (d.decT -= dt) <= 0) { d.decT = 0.12; g.fx?.decals?.add?.(end, hit.normal, { frame: DECAL.scorch, size: 0.35 * d.k, tint: DECAL_TINT.scorch, life: 3 }); }
    g.fx?.lights?.flash?.(end, 0xff9a3a, 3 * d.k, 3, 0.06);
    if (!k.local) return;
    shake(g, 0.012);
    if ((d.acc += dt) >= p.tick) {
      d.acc -= p.tick;
      const pierce = ys?.unbound ? k.def.yanshu?.ult?.pierce ?? 3 : p.pierce;
      k.hitRay(eye.clone(), dir.clone(), len, p.dps * p.tick, { pierce, knock: 0.5, stagger: 0.5, headMul: 1.2 });
      // 破限's wider beam also catches what stands just beside the line
      if (d.k > 1) for (const t of g.targets?.inRadius?.(_b.copy(eye).addScaledVector(dir, len / 2), len / 2 + 1) || []) {
        const tc = t.center(_a), u = clamp(_b.subVectors(tc, eye).dot(dir), 0, len), off = _b.copy(eye).addScaledVector(dir, u).distanceTo(tc);
        if (off > 0.5 * d.k + 0.25 || off < 0.35) continue;
        const info = { amount: p.dps * p.tick * 0.6 * (g.arsenal?.dmgMul ?? 1), part: 'body', point: tc.clone(), dir: dir.clone(), knock: 0.3, stagger: 0.3, weapon: ID, shooter: g.localId, skill: k.id };
        k._feedback(info, t.damage(info), t);
      }
    }
    if (ys?.wing) for (const dr of ys.wing.d) dr.vel.y += 0.002 * (k.rng() - 0.5);
  },
  end(k) {
    const g = k.game, d = k.data;
    d.beam?.stop?.(); d.loop?.stop?.(0.15);
    sfx(g, 'yanshu_beam_end', k.local ? { volume: 0.7 } : { pos: k.pos, volume: 0.6 });
    const ys = ysK(k);
    if (ys && ys.beam === k) ys.beam = null;
    if (k.local && ys && g.arsenal?.current === k.ws) steam(g, ['ram'], 0.8);
  },
});

// 樞錘衝撞 (RMB in overload): 8 m in 0.35 s, invulnerable to everything; 300 in 4 m where it lands
const G_PLAYER = 15.2;   // controller gravity (player/controller.js)
registerSkill('yanshu_ram', {
  level: 'L2', defaults: { range: 8, time: 0.35, r: 4, dmg: 300, knock: 8 },
  start(k) {
    const g = k.game, p = k.p, d = k.data;
    // the lane: along the (level) aim from the caster's feet, short of a wall; every client finds the same point
    const fwd = _d.copy(k.dir).setY(0);
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    const feet = k.local && g.player ? g.player.pos.clone() : V3().set(k.pos.x, k.floorY(k.pos), k.pos.z);
    const wh = g.world?.collision?.raycast(_a.set(feet.x, feet.y + 0.9, feet.z), fwd, p.range + 0.6);
    const len = wh ? Math.max(0.8, wh.dist - 0.6) : p.range;
    d.from = feet; d.to = feet.clone().addScaledVector(fwd, len); d.to.y = k.floorY(d.to);
    if (Math.abs(d.to.y - feet.y) > 1.6) d.to.y = feet.y;
    d.dir = fwd.clone(); d.T = p.time * Math.max(0.5, len / p.range); d.landed = false; d.shoved = new Set();
    k.dur = d.T + 0.5;
    d.trail = g.fx?.trail?.({ width: 0.5, life: 0.25, color: [C.ORANGE[0], C.ORANGE[1], C.ORANGE[2], 0.8], color1: [C.DEEP[0], C.DEEP[1], 0, 0], taper: 0.2, segs: 16 });
    sfx(g, 'yanshu_ram_jet', k.local ? { volume: 1 } : { pos: feet, volume: 1 });
    if (!k.local) return;
    const ys = ysK(k), ar = g.arsenal;
    if (ys) { ys.ramK = k; ys.ramTo = 1; }
    if (g.status) g.status.invuln = Math.max(g.status.invuln || 0, d.T + 0.15);
    if (g.player) g.player.onGround = false;
    if (ar && k.ws && ar.current === k.ws) ar.playClip('yanshu_ram', { duration: d.T + 0.15 });
    g.arsenal?.fovKick?.(6, d.T + 0.1);
    if (clipComfort.overlay) {
      g.fx?.overlay?.radial?.(0.75, 0.3, { color: [2.2, 1, 0.3], r0: 0.32, density: 0.45, thin: 0.6 });
      g.fx?.overlay?.status?.('burn', 0.45, d.T + 0.2);
      g.fx?.overlay?.border?.([1.0, 0.32, 0.08], 0.3, d.T + 0.15, { fadeIn: 0.03, fadeOut: 0.2 });
    }
    haptic(25);
  },
  update(k, dt) {
    const g = k.game, d = k.data, p = k.p;
    const u = clamp(k.t / d.T, 0, 1);
    _a.lerpVectors(d.from, d.to, u); _a.y += 1;
    d.trail?.push(_a.clone());
    if (k.local && !d.landed && g.player) {
      // steer the controller along the lane (walls still resolve)
      const pl = g.player, u2 = Math.min(1, (k.t + dt) / d.T), h = Math.max(dt, 1 / 240);
      const nx = d.from.x + (d.to.x - d.from.x) * u2, nz = d.from.z + (d.to.z - d.from.z) * u2, ny = d.from.y + (d.to.y - d.from.y) * u2;
      pl.vel.set((nx - pl.pos.x) / h, (ny - pl.pos.y) / h + G_PLAYER * h, (nz - pl.pos.z) / h);
      pl.onGround = false;
      // bodies in the lane are bowled aside (the damage comes with the landing)
      for (const z of g.zombies?.inRadius?.(pl.pos, 1.4) || []) {
        if (d.shoved.has(z)) continue;
        d.shoved.add(z);
        if (g.zombies.authority && z.kvel && !z.def?.boss) { const sx = z.pos.x - pl.pos.x, sz = z.pos.z - pl.pos.z, sl = Math.hypot(sx, sz) || 1; z.kvel.x += sx / sl * 7 + d.dir.x * 4; z.kvel.z += sz / sl * 7 + d.dir.z * 4; }
        g.fx?.sparkBurst?.(z.center(_b), { color: C.HOT, color1: C.ORANGE, count: 8, speed: 5, glow: 0.4 });
      }
      for (let i = 0; i < 2; i++) g.fx?.particles?.spawn({ additive: true, x: pl.pos.x + (k.rng() - 0.5) * 0.6, y: pl.pos.y + 0.3 + k.rng(), z: pl.pos.z + (k.rng() - 0.5) * 0.6, vx: -d.dir.x * 6, vz: -d.dir.z * 6, life: 0.25, size: 0.06, stretch: 0.05,
        color: [...C.ORANGE, 1], color1: [...C.DEEP, 0], frame: FRAME.spark });
    }
    if (!d.landed && k.t >= d.T) {
      d.landed = true;
      d.trail?.stop?.();
      const c = k.local && g.player ? g.player.pos.clone() : d.to.clone();
      ringFire(g, c, p.r, k.rng, 0.8);
      for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU + k.rng() * 0.3; g.fx?.knockDust?.(_b.set(c.x + Math.cos(a) * 1.4, c.y, c.z + Math.sin(a) * 1.4), _e.set(Math.cos(a) * 9, 0, Math.sin(a) * 9), 1.6); }
      g.fx?.motes?.burst?.('shard', _b.set(c.x, c.y + 0.2, c.z), 10, { palette: [[0.45, 0.43, 0.4], [0.32, 0.3, 0.28], [0.6, 0.55, 0.5]], speed: 5, spread: 1, radius: 0.8, seed: k.ev.seed });
      g.fx?.zfx?.ground?.add?.('crack', _b.set(c.x, c.y + 0.02, c.z), { r: 3.2, life: 3.5, col: [1.0, 0.45, 0.12], alpha: 0.7, fadeIn: 0.02, fadeOut: 1.4 });
      g.fx?.decals?.add?.(c, UP, { frame: DECAL.scorch, size: 3, tint: DECAL_TINT.scorch, life: 5 });
      sfx(g, 'yanshu_ram_slam', k.local ? { volume: 1 } : { pos: c, volume: 1 });
      if (!k.local) return;
      const pl = g.player;
      if (pl) { pl.vel.x *= 0.15; pl.vel.z *= 0.15; if (pl.vel.y > 0) pl.vel.y = 0; }
      k.hurt(_a.set(c.x, c.y + 0.9, c.z), p.r, p.dmg, { knock: p.knock, stagger: 1, falloffMin: 0.5, explosive: true });
      shake(g, 0.35); if (clipComfort.hitstop) g.hitStop?.(0.08);
      g.arsenal?._clipHaptic?.('thud');
      const ys = ysK(k);
      if (ys) { ys.ramK = null; if (!(ys.over > 0)) ys.ramTo = 0; }
    }
  },
  end(k) { k.data.trail?.stop?.(); const ys = ysK(k); if (ys && ys.ramK === k) ys.ramK = null; },
});

// 破限 (R R / hold Q, the ultimate): the seal tears off, 14 s of overload (beam 1.5x, drone beams), the last 2 s the
// drones dock beside the ram and the three fire a 30 m beam (900/s). Aura 分機: mini drones for the two nearest teammates.
registerSkill('yanshu_ult', {
  level: 'L3', defaults: { dur: 14, giant: { dps: 900, range: 30, dur: 2, r: 0.9 } },
  start(k) {
    const g = k.game, d = k.data;
    Object.assign(k.p, k.def.yanshu?.ult || {});
    k.dur = k.p.dur + 0.6;
    d.g0 = k.p.dur + 0.6 - k.p.giant.dur;   // the giant beam starts
    d.acc = 0; d.decT = 0;
    const c = k.feet(V3());
    sfx(g, 'yanshu_seal_snap', k.local ? { volume: 1 } : { pos: c, volume: 0.9 });
    sfx(g, 'yanshu_ult_chord', k.local ? { volume: 1, delay: 0.1 } : { pos: c, volume: 0.9, delay: 0.1 });
    miniDrones(k);
    if (!k.local) {
      // onlookers: a column of forge light over the caster and a ring
      g.fx?.sigils?.pillar?.(c, { radius: 0.7, height: 9, color: C.ORANGE, color1: C.HOT, life: 0.7, motes: 10 });
      g.fx?.shockwave?.(_a.set(c.x, c.y + 0.06, c.z), { normal: UP, r0: 0.3, r1: 4, life: 0.45, color: C.ORANGE });
      return;
    }
    const ws = k.ws, ys = ysK(k), ar = g.arsenal;
    if (!ys) return;
    ys.unbound = k;
    g.hud?.card?.(k.cardText(), { color: OR, sub: k.def.en });
    g.fx?.screen?.kick?.([2.6, 1.8, 1.0], 0.15);   // the full-screen orange-white flash (once)
    shake(g, 0.25);
    g.arsenal?.fovKick?.(3, 0.5);
    if (ar && ar.current === ws && (ar.state === 'idle' || ar.state === 'action')) { ar.vm.stopClip?.(); ar.state = 'idle'; ar.playClip('yanshu_ult'); }
    // the seal: torn off at 0.15 s, burns out in flight
    later(ws, 0.15, () => {
      const node = g.vm?.weapon?.parts?.fx_seal?.node;
      if (node && mine(g, ws)) ys.flights.push(new SealFlight(g, node));
      ys.sealOff = true;
      haptic(30);
    });
    later(ws, 0.25, () => enterOverload(ws, g, k.p.dur + 0.4, { fast: true }));
  },
  update(k, dt) {
    const g = k.game, d = k.data, p = k.p.giant;
    const ys = ysK(k);
    if (k.local && ys && !(ys.over > 0) && k.t > 1) return false;
    if (k.t < d.g0) return;
    // ---- the last 2 s: the three-point beam (every client; damage by the caster)
    if (!d.giant) {
      d.giant = true;
      if (ys) ys.dock = true;
      sfx(g, 'yanshu_ult_dock', k.local ? { volume: 1 } : { pos: k.pos, volume: 0.9 });
      sfx(g, 'yanshu_ult_giant', k.local ? { volume: 1, delay: 0.15 } : { pos: k.pos, volume: 1, delay: 0.15 });
      const mk = (w) => g.fx?.beam?.(V3(), V3(), { core: [C.HOT[0] * 1.2, C.HOT[1] * 1.15, C.HOT[2] * 1.1], glow: [C.ORANGE[0] * 0.7, C.ORANGE[1] * 0.6, C.ORANGE[2] * 0.5], wCore: 0.06 * w, wGlow: 0.5 * w,
        life: Infinity, scroll: 2.2, pattern: 'molten', wStart: 0.55, ramp: 4 });
      d.beams = [mk(2.2), mk(0.7), mk(0.7)];
      d.halo = g.fx?.beam?.(V3(), V3(), { core: [C.ORANGE[0] * 0.15, C.ORANGE[1] * 0.12, C.ORANGE[2] * 0.1], glow: [C.DEEP[0] * 0.45, C.DEEP[1] * 0.35, 0.01], wCore: 0.2, wGlow: 2.0, life: Infinity, scroll: 1, wStart: 0.35, ramp: 5 });
      if (k.local) { shake(g, 0.4); g.arsenal?._clipHaptic?.('thud'); g.arsenal?.fovKick?.(-3, 0.3); if (clipComfort.overlay) g.fx?.overlay?.radial?.(0.6, 2, { color: [2, 1.2, 0.5], r0: 0.36, density: 0.35, thin: 0.5 }); }
    }
    const eye = k.caster(_c, _d), dir = _d;
    const hit = g.world?.collision?.raycast(eye, dir, p.range), len = hit ? hit.dist : p.range;
    const end = _e.copy(eye).addScaledVector(dir, len);
    const from0 = k.local ? g.vm?.socketApparent?.('ram', V3()) || k.muzzle(V3()) : k.muzzle(V3());
    d.beams?.[0]?.set(from0, end);
    d.halo?.set(from0, end);
    for (let i = 0; i < 2; i++) {
      const fm = k.local && ys?.wing ? ys.wing.muzzleWorld(i, V3()) : from0.clone().add(_a.set(0, 0.25, 0).addScaledVector(_b.crossVectors(dir, UP).normalize(), i ? 0.35 : -0.35));
      d.beams?.[i + 1]?.set(fm || from0, end);
    }
    g.fx?.sparkBurst?.(end, { color: C.HOT, color1: C.ORANGE, count: 6, speed: 7, glow: 0.6, normal: hit?.normal });
    g.fx?.lights?.flash?.(end, 0xffb050, 10, 6, 0.06);
    if (hit && (d.decT -= dt) <= 0) {
      // the melted trail on the ground
      d.decT = 0.08;
      g.fx?.decals?.add?.(end, hit.normal, { frame: DECAL.scorch, size: 1.2, tint: DECAL_TINT.scorch, life: 5 });
      g.fx?.zfx?.ground?.add?.('glow', _b.copy(end).addScaledVector(hit.normal, 0.03), { r: 0.9, life: 2, col: [1.2, 0.45, 0.1], alpha: 0, fadeOut: 1.4 });
    }
    if (!k.local) return;
    shake(g, 0.05);
    if ((d.acc += dt) >= 0.1) {
      d.acc -= 0.1;
      const amt = p.dps * 0.1 * (g.arsenal?.dmgMul ?? 1);
      for (const t of g.targets?.inRadius?.(_b.copy(eye).addScaledVector(dir, len / 2), len / 2 + 1.5) || []) {
        const tc = t.center(_a), u = _b.subVectors(tc, eye).dot(dir);
        if (u < 0.5 || u > len + 0.6) continue;
        if (_b.copy(eye).addScaledVector(dir, u).distanceTo(tc) > p.r + (t.radius ?? 0.4)) continue;
        const info = { amount: amt, part: 'body', point: tc.clone(), dir: dir.clone(), knock: 1.2, stagger: 0.8, weapon: ID, shooter: g.localId, explosive: true, skill: k.id };
        k._feedback(info, t.damage(info), t);
      }
    }
  },
  end(k) {
    const g = k.game, d = k.data;
    for (const b of d.beams || []) b?.stop?.();
    d.halo?.stop?.();
    if (!k.local) return;
    const ys = ysK(k), ws = k.ws;
    if (!ys) return;
    ys.unbound = null; ys.dock = false;
    if (ys.over > 0) exitOverload(ws, g);
    sfx(g, 'yanshu_ult_end', { volume: 0.9 });
    // the seal re-forms on the spine with a flash
    later(ws, 0.5, () => { ys.sealOff = false; if (mine(g, ws)) { sparksAt(g, 'seal', 18, C.HOT); g.vm?.weapon?.premium?.fire?.(0.6, 0.3); } });
  },
});

/** 分機: each client gives the two players nearest the caster (not the caster) a mini drone for 10 s; a client's own
 *  player's drone (and bots' on the caster's machine) also shoots */
function miniDrones(k) {
  const g = k.game, c = k.feet(V3()), def = k.def, mp = (k.ws ? P(k.ws) : def.yanshu)?.ult?.mini || { dur: 10, n: 2 };
  const cand = [];
  if (!k.local && g.player && g.status?.alive) cand.push({ kind: 'me', pos: () => g.player.pos, d: g.player.pos.distanceTo(c) });
  for (const [id, r] of g.net?.remotes?.entries?.() || []) if (id !== k.by && r.alive !== false && r.pos) cand.push({ kind: 'remote', pos: () => r.pos, d: r.pos.distanceTo(c) });
  if (k.local) for (const b of g.bots?.bots || []) if (b.alive && !b.downed && b.pos) cand.push({ kind: 'bot', pos: () => (b.alive ? b.pos : null), d: b.pos.distanceTo(c) });
  cand.sort((a, b) => a.d - b.d);
  cand.slice(0, mp.n).filter((o) => o.d < 30).forEach((o, i) => {
    const m = new MiniDrone(g, def, (out) => { const p = o.pos(); return p ? out.copy(p) : null; }, { life: mp.dur, side: i ? -1 : 1 });
    m.shoots = o.kind === 'me' || o.kind === 'bot';
    m.def = def;
    miniSys(g).add(m);
  });
  if (cand.length) sfx(g, 'yanshu_mini', { pos: c, volume: 0.6 });
}
/** mini drones spawned by someone else's 破限 on this client (no weapon state here): a small system that ticks them */
function miniSys(g) {
  if (g._ysMini) return g._ysMini;
  const S = g._ysMini = { list: new Set(), add(m) { this.list.add(m); }, update(dt) { for (const m of this.list) { if (!m.update(dt)) { this.list.delete(m); continue; } miniFire(g, m, dt); } } };
  g.systems?.push(S);
  return S;
}
/** a mini drone that shoots (6 x 18 a second at the nearest zombie within 15 m of it) */
function miniFire(g, m, dt) {
  if (!m.shoots || !m.obj || (m.fireT -= dt) > 0) return;
  m.fireT += 1 / 6;
  let best = null, bd = 15;
  for (const z of g.zombies?.list || []) { if (!z.alive) continue; const d = z.center(_a).distanceTo(m.pos); if (d < bd) { bd = d; best = z; } }
  m.aim = best ? best.center(V3()) : null;
  if (!best) return;
  g.fx?.glowTracer?.(m.pos.clone(), m.aim.clone(), { color: [C.CYAN[0] * 1.4, C.CYAN[1] * 1.4, C.CYAN[2] * 1.4], glow: [0.2, 0.7, 1.1], width: 0.01, length: 1.2, speed: 240, start: 0 });
  const info = { amount: 18 * (g.arsenal?.dmgMul ?? 1), part: 'body', point: m.aim.clone(), dir: _b.subVectors(m.aim, m.pos).normalize().clone(), knock: 0.2, stagger: 0.1, weapon: ID, shooter: g.localId, skill: 'yanshu_mini' };
  const res = best.damage(info);
  if (res?.killed) g.hud?.onHit?.(info, res, best); else quietNumber(g, info.point, res?.damage ?? info.amount, best);
}

// 爐壁護盾 (crisis 'counter', crisis.js adds the 300 in 4 m): the six fins lock into a hex wall in front, glow, burst
registerSkill('yanshu_crisis', {
  level: 'L1',
  start(k) {
    const g = k.game, c = k.feet(V3());
    const yaw = Math.atan2(-k.dir.x, -k.dir.z);
    const wall = new HexWall(g, c, yaw, { dist: k.local ? 2.1 : 0.9, size: k.local ? 0.62 : 0.75, rand: k.rng });
    (g._ysWalls ||= miniWalls(g)).list.add(wall);
    sfx(g, 'yanshu_crisis', k.local ? { volume: 1 } : { pos: c, volume: 1 });
    if (!k.local || !k.ws) return;
    const ys = ysK(k);
    if (ys) { ys.crisisT = 1.0; later(k.ws, 1.0, () => { if (mine(g, k.ws)) { steam(g, ['fin1', 'fin3', 'fin5'], 1); sparksAt(g, 'fin3', 10); } }); }
    if (clipComfort.overlay) g.fx?.overlay?.border?.([1.0, 0.35, 0.08], 0.32, 1.0, { fadeIn: 0.03, fadeOut: 0.35 });
  },
});
function miniWalls(g) { const S = { list: new Set(), update(dt) { for (const w of this.list) if (!w.update(dt)) this.list.delete(w); } }; g.systems?.push(S); return S; }

// KE_FINAL: the wave's last kill (no damage): a small forge strike — a column of forge light, a ring, a burst
registerSkill('yanshu_final', {
  level: 'L2', dur: 1.2,
  start(k) {
    const g = k.game, c = k.pos.clone();
    c.y = k.floorY(c);
    g.fx?.sigils?.pillar?.(c, { radius: 0.5, height: 10, color: C.ORANGE, color1: C.HOT, life: 0.9, motes: 8 });
    g.fx?.shockwave?.(_a.set(c.x, c.y + 0.06, c.z), { normal: UP, r0: 0.3, r1: 3, life: 0.45, color: C.ORANGE, thin: false });
    burstFx(g, _a.set(c.x, c.y + 1, c.z), 1.8, k.rng);
    if (k.local) sfx(g, 'yanshu_final', { pos: c, volume: 0.9 });
  },
});

// ------------------------------------------------------------------------------------------ clips
const Z3 = [0, 0, 0];
const GL = (vm) => vm?.supportGrip?.pose || 'cradle';
/** fin flutter tracks: fin i lifts to `amt` (part amount) at t0 + i*dt and falls back */
function flutter(t0, dt, amt, hold = 0.035) {
  const tr = {};
  for (let i = 0; i < 6; i++) { const a = t0 + i * dt; tr['fx_fin' + (i + 1)] = [[0, 0], [a, 0], [a + hold * 0.5, amt, 'out3'], [a + hold, amt], [a + hold * 2.2, 0, 'in3'], [1, 0]]; }
  return tr;
}
/**
 * First draw (1.7 s, once a match, fire cancels): the cannon swings in from the lower right on hydraulics (0-0.4 s); the
 * six fins lift 20° and fall back one after another rear to front, each with a click and a breath of steam, the furnace
 * "changing air" (0.4-0.9); the two falcon drones fly in from the screen edges (0.9-1.3); hold — the doors part on a 6 mm
 * crack, the molten light falls on the hand, a low furnace roar (1.35).
 */
registerClip('yanshu_first', (vm) => {
  const D = 1.7, T = (s) => s / D;
  const ev = [[0, 'anchorL', ['rest', 0.05]], [0, 'glow', { to: 0.2, sec: 0 }], [0.01, 'ys', 'drones_hide'], [0.01, 'snd', 'drawHeavy'], [0.02, 'ys', { do: 'snd', n: 'yanshu_draw_first', v: 0.8 }],
    [T(0.05), 'ys', { do: 'snd', n: 'yanshu_hydraulic', v: 0.7 }], [T(0.36), 'anchorL', ['grip_l', 0.14]], [T(0.42), 'poseL', GL(vm)]];
  for (let i = 0; i < 6; i++) ev.push([T(0.42 + i * 0.05), 'ys', { do: 'click', i, steam: true }]);
  ev.push([T(0.43), 'haptic', 'tick'], [T(0.68), 'haptic', 'tick'], [T(0.72), 'ys', { do: 'steam', s: ['door', 'slitL', 'slitR'], k: 0.8 }], [T(0.9), 'ys', 'drones_in'],
    [T(1.35), 'ys', 'crack'], [T(1.35), 'glow', { to: 1.8, sec: 0.12 }], [T(1.55), 'glow', { to: 1, sec: 0.3 }]);
  return {
    duration: D,
    tracks: {
      gunPos: [[0, [0.15, -0.17, 0.08]], [T(0.4), [0.004, 0.004, 0], 'out3'], [T(0.5), [-0.006, 0.008, 0.004]], [T(0.9), [-0.012, 0.014, 0.008], 'inOut'], [T(1.3), [-0.004, 0.006, 0.002], 'inOut'], [1, Z3, 'inOut']],
      gunRot: [[0, [14, -36, 34]], [T(0.4), [1.5, 2, -4], 'out3'], [T(0.5), [0, 0, 0]], [T(0.9), [3, 10, -8], 'inOut'], [T(1.3), [1, 3, -3], 'inOut'], [1, Z3, 'inOut']],
      ...flutter(T(0.42), T(0.05), 20 / 70, T(0.05)),
      fx_doorL: [[0, 0], [T(1.33), 0], [T(1.4), 0.27, 'out3'], [T(1.62), 0.27], [1, 0.05]], fx_doorR: [[0, 0], [T(1.33), 0], [T(1.4), 0.27, 'out3'], [T(1.62), 0.27], [1, 0.05]],
      fx_ram: [[0, 0], [T(0.3), 0], [T(0.36), 0.12, 'out3'], [T(0.46), 0, 'inOut'], [1, 0]],
    },
    events: ev,
  };
});
// normal draw (0.7 s): drawHeavy from the lower right, a quick fin ripple, the drones already on station
registerClip('yanshu_draw', (vm) => ({
  duration: 0.7,
  tracks: {
    gunPos: [[0, [0.04, -0.16, 0.07]], [0.7, [0, 0.004, 0], 'out3'], [1, Z3, 'inOut']],
    gunRot: [[0, [-34, 12, 30]], [0.7, [2, -1, -3], 'out3'], [1, Z3, 'inOut']],
    ...flutter(0.6, 0.04, 8 / 70, 0.05),
  },
  events: [[0.03, 'snd', 'drawHeavy'], [0.6, 'ys', { do: 'snd', n: 'yanshu_fin_click', v: 0.35 }], [0.66, 'ys', { do: 'steam', s: ['door'], k: 0.5 }]],
}));

/** Reload (2.4 s): the cell drops out of the furnace (the core dims, the doors crack and vent steam), a fresh cell slides
 *  in and its four charge windows light one after another. rare (1 in 8): as the cell seats the ram knocks back once and
 *  "forges" it in (clang + sparks); the rounds land on the same frame. */
function reloadClip(vm, o, rare) {
  const c = magReload(vm, { empty: !!o.empty, style: 'mag' });
  const door = [[0, 0], [0.2, 0], [0.26, 0.35, 'out3'], [0.6, 0.35], [0.72, 0, 'inOut'], [1, 0]];
  const ev = [...c.events.filter((e) => e[1] !== 'snd'), [0.2, 'ys', { do: 'snd', n: 'yanshu_reload_out' }], [0.24, 'ys', 'vent'], [0.66, 'ys', { do: 'snd', n: 'yanshu_reload_in' }], [0.7, 'ys', 'cell']];
  // the bullpup's cell sits behind the grip at the bottom of the frame: the gun dips its muzzle, swings it left and rolls
  // its left flank up (the window stays in view) so the hand pulling the cell shows
  const R1 = [-9, 11, -26], P1 = [-0.035, 0.045, 0.03];
  const gunPos = [[0, Z3], [0.12, P1, 'inOut'], [0.62, [P1[0], P1[1] - 0.004, P1[2]]], [0.7, [P1[0], P1[1] + 0.01, P1[2]], 'out3'], [0.76, P1], [0.9, [-0.01, 0.01, 0.01], 'inOut'], [1, Z3]];
  const gunRot = [[0, Z3], [0.12, R1, 'inOut'], [0.62, [R1[0] - 1, R1[1], R1[2]]], [0.7, [R1[0] + (rare ? 5 : 2), R1[1], R1[2] + 2], 'out3'], [0.76, R1], [0.9, [-2, 3, -6], 'inOut'], [1, Z3]];
  const tracks = { ...c.tracks, gunPos, gunRot, fx_doorL: door, fx_doorR: door, ...flutter(0.25, 0.02, 6 / 70, 0.04) };
  if (rare) ev.push([0.7, 'ys', 'forge']);
  return { ...c, tracks, events: ev };
}
registerClip('yanshu_reload', (vm, o = {}) => reloadClip(vm, o, false));
registerClip('yanshu_reload_rare', (vm, o = {}) => ({ ...reloadClip(vm, o, true), extra: 0.1 }));

/**
 * Inspect (4.6 s; holding loops the opening turn): the gun turns its furnace to the camera so the light sweeps the ceramic
 * (0-0.8 s); the left hand slides the doors open, the molten light lands on the glove, the energy cell inside rises 3 cm
 * and sinks back (0.8-1.8); the hand turns palm up and a drone glides down to hover over it, turning (2.0-3.2); the fins
 * rise and the ram half extends, the pose holds (3.8-4.6). Mythic: the world dims to a forge-lit dusk.
 * rare (1/10): both drones come to the palm and knock wings together — a little burst of sparks — then return.
 */
function inspect(vm, rare) {
  const D = 4.6, T = (s) => s / D;
  const turn = [6, 34, -20], turnP = [-0.05, 0.03, 0.03];
  const ev = [[0.01, 'ys', 'world'], [0.02, 'snd', 'cloth'],
    [T(0.75), 'anchorL', ['door', 0.18]], [T(0.85), 'poseL', 'point'], [T(0.95), 'ys', 'door'], [T(1.0), 'ys', { do: 'doorlight', k: 1.2, dur: 1.0 }], [T(1.05), 'ys', { do: 'steam', s: ['door'], k: 0.8 }],
    [T(1.3), 'ys', { do: 'snd', n: 'yanshu_cell', v: 0.5 }], [T(1.75), 'ys', 'door'],
    [T(1.9), 'anchorL', ['palm', 0.2]], [T(2.0), 'ys', rare ? { do: 'five', dur: 1.3 } : { do: 'palm', dur: 1.25 }],
    [T(3.3), 'anchorL', ['grip_l', 0.25]], [T(3.4), 'poseL', GL(vm)],
    [T(3.8), 'ys', { do: 'snd', n: 'yanshu_hydraulic', v: 0.6 }], [T(3.85), 'ys', { do: 'steam', s: ['fin1', 'fin3', 'fin5'], k: 0.7 }], [T(3.9), 'haptic', 'tick']];
  if (rare) ev.push([T(2.75), 'ys', 'clap']);
  const finUp = {};
  for (let i = 0; i < 6; i++) finUp['fx_fin' + (i + 1)] = [[0, 0], [T(3.75 + i * 0.03), 0], [T(3.95 + i * 0.03), 0.85, 'outBack'], [T(4.45), 0.85], [1, 0, 'inOut']];
  return {
    duration: D, loop: [0.03, T(0.75)],
    tracks: {
      gunPos: [[0, Z3], [T(0.6), turnP, 'inOut'], [T(0.75), turnP], [T(1.0), [-0.06, 0.035, 0.02], 'inOut'], [T(1.8), [-0.06, 0.035, 0.02]], [T(2.1), [-0.02, 0.0, 0.02], 'inOut'],
        [T(3.3), [-0.02, 0.0, 0.02]], [T(3.7), [-0.03, 0.02, 0.0], 'inOut'], [T(4.45), [-0.03, 0.02, 0.0]], [1, Z3, 'inOut']],
      gunRot: [[0, Z3], [T(0.6), turn, 'inOut'], [T(0.75), [7, 36, -22]], [T(1.0), [14, 26, -12], 'inOut'], [T(1.8), [14, 26, -12]], [T(2.1), [4, 10, -6], 'inOut'],
        [T(3.3), [4, 10, -6]], [T(3.7), [8, 22, -14], 'inOut'], [T(4.45), [9, 24, -15]], [1, Z3, 'inOut']],
      fx_doorL: [[0, 0], [T(0.92), 0], [T(1.05), 1, 'out3'], [T(1.7), 1], [T(1.85), 0, 'inOut'], [1, 0]],
      fx_doorR: [[0, 0], [T(0.92), 0], [T(1.05), 1, 'out3'], [T(1.7), 1], [T(1.85), 0, 'inOut'], [1, 0]],
      'mag.pos': [[0, Z3], [T(1.1), Z3], [T(1.35), [0, 0.03, 0], 'out3'], [T(1.55), [0, 0.03, 0]], [T(1.75), Z3, 'inOut'], [1, Z3]],
      fx_ram: [[0, 0], [T(3.8), 0], [T(4.0), 0.5, 'outBack'], [T(4.45), 0.5], [1, 0, 'inOut']],
      ...finUp,
      env: [[0, 0], [0.08, 1], [0.9, 1], [1, 0]],
    },
    events: ev,
  };
}
registerClip('yanshu_inspect', (vm) => inspect(vm, false));
registerClip('yanshu_inspect_rare', (vm) => inspect(vm, true));

// ready layer idle extra (every 2.5 s while 破限 is ready): a wrist turn, the core flashes, the doors breathe
registerClip('yanshu_ready', {
  duration: 0.8,
  tracks: { gunRot: [[0, Z3], [0.25, [1.2, 1.5, -3], 'out3'], [0.6, [0.4, 0.5, -1]], [1, Z3]], fx_doorL: [[0, 0], [0.2, 0.18, 'out3'], [0.6, 0.12], [1, 0]], fx_doorR: [[0, 0], [0.2, 0.18, 'out3'], [0.6, 0.12], [1, 0]] },
  events: [[0.18, 'ys', 'readyFlash']],
});
// idle tier 34-99 % (§1.17): a lazy roll, the fins breathe once
registerClip('yanshu_vent', {
  duration: 1.0,
  tracks: { gunRot: [[0, Z3], [0.3, [0.4, 0.8, 2.6], 'out3'], [0.6, [-0.2, -0.3, -1.4]], [1, Z3]], ...flutter(0.2, 0.05, 6 / 70, 0.08) },
  events: [[0.3, 'ys', { do: 'steam', s: ['fin2', 'fin4'], k: 0.5 }]],
});
// 爐環 cast: the gun sways across as the slits jet
registerClip('yanshu_ring', {
  duration: 0.5,
  tracks: { gunPos: [[0, Z3], [0.25, [0.012, 0.008, 0.01], 'out3'], [0.6, [-0.008, 0.004, 0.004]], [1, Z3, 'inOut']], gunRot: [[0, Z3], [0.25, [3, 10, -16], 'out3'], [0.6, [1, -4, 6]], [1, Z3, 'inOut']] },
  events: [[0.02, 'haptic', 'thud']],
});
// 吸爐震擊 cast: the doors gape and the gun draws back as it inhales, then thrusts with the ram strike
registerClip('yanshu_inhale', {
  duration: 0.62,
  tracks: {
    gunPos: [[0, Z3], [0.55, [0, -0.006, 0.03], 'inOut'], [0.7, [0, 0.004, -0.035], 'out3'], [1, Z3, 'inOut']],
    gunRot: [[0, Z3], [0.55, [-3, 0, 2]], [0.7, [4, 0, -2], 'out3'], [1, Z3, 'inOut']],
    fx_ram: [[0, 0], [0.62, 0], [0.7, 1, 'out3'], [1, 0.6]],
  },
  events: [[0.05, 'ys', { do: 'steam', s: ['slitL', 'slitR'], k: 0.6 }], [0.68, 'ys', { do: 'beat', s: 'ram' }]],
});
// 超載 transformation: four small kicks on the beats
registerClip('yanshu_over', {
  duration: 0.6,
  tracks: {
    gunPos: [[0, Z3], [0.1, [0, 0.004, 0.006], 'out3'], [0.25, Z3], [0.35, [0, 0.003, 0.004], 'out3'], [0.5, Z3], [0.58, [0, 0, 0.012], 'out3'], [0.75, Z3], [0.85, [0, 0.005, 0.004], 'out3'], [1, Z3]],
    gunRot: [[0, Z3], [0.1, [1.5, 0, -1], 'out3'], [0.25, Z3], [0.35, [0, 1, 1.5], 'out3'], [0.5, Z3], [0.58, [2.5, 0, 0], 'out3'], [0.75, Z3], [0.85, [1, -1, 1], 'out3'], [1, Z3]],
  },
  events: [[0.02, 'ys', { do: 'beat', s: 'fin3' }], [0.27, 'ys', { do: 'beat', s: 'door' }], [0.52, 'ys', { do: 'beat', s: 'ram' }], [0.77, 'ys', { do: 'beat', s: 'core' }]],
});
// 樞錘衝撞: the gun levelled forward, the ram fully out
registerClip('yanshu_ram', {
  duration: 0.5,
  tracks: {
    gunPos: [[0, Z3], [0.18, [-0.035, 0.035, -0.06], 'out3'], [0.75, [-0.035, 0.035, -0.06]], [1, Z3, 'inOut']],
    gunRot: [[0, Z3], [0.18, [-4, 7, 3], 'out3'], [0.75, [-4, 7, 3]], [1, Z3, 'inOut']],
  },
  events: [[0.02, 'haptic', 'thud']],
});
// 破限 cast: the gun lifts and twists as the seal tears off, the fins stand up
registerClip('yanshu_ult', {
  duration: 0.7,
  tracks: {
    gunPos: [[0, Z3], [0.3, [-0.01, 0.03, 0.02], 'out3'], [0.6, [-0.01, 0.03, 0.02]], [1, Z3, 'inOut']],
    gunRot: [[0, Z3], [0.3, [14, -5, 12], 'out3'], [0.6, [15, -5, 13]], [1, Z3, 'inOut']],
  },
  events: [[0.05, 'haptic', 'thud'], [0.25, 'ys', { do: 'steam', s: ['fin1', 'fin2', 'fin3', 'fin4', 'fin5', 'fin6'], k: 1.2 }], [0.3, 'ys', { do: 'beat', s: 'seal' }]],
});

// ------------------------------------------------------------------------------------------ crosshair (§1.9 #2)
// xh_tri: three short arms on an inverted triangle (two up, one down) round a small square dot — the ram's face. Stroke only,
// hit-reactive (class "a"); the arms spread with the spread.
registerCrosshair('xh_tri', {
  draw(gap, c, s, c2 = c) {
    const r0 = Math.max(6, 5 + gap * 0.55), L = 8, lw = 1.8;
    let out = '';
    for (const a of [-150, -30, 90]) {
      const x = Math.cos(a * D2R), y = Math.sin(a * D2R);
      out += `<line class="a" x1="${(x * r0).toFixed(2)}" y1="${(y * r0).toFixed(2)}" x2="${(x * (r0 + L)).toFixed(2)}" y2="${(y * (r0 + L)).toFixed(2)}" stroke="${c}" stroke-width="${lw}" stroke-linecap="square"/>`;
      // a short cross-bar at each arm's outer end (the triangle's corners)
      const px = -y, py = x;
      out += `<line class="a" x1="${(x * (r0 + L) - px * 2.4).toFixed(2)}" y1="${(y * (r0 + L) - py * 2.4).toFixed(2)}" x2="${(x * (r0 + L) + px * 2.4).toFixed(2)}" y2="${(y * (r0 + L) + py * 2.4).toFixed(2)}" stroke="${c2}" stroke-width="1.2"/>`;
    }
    return out + `<rect class="a" x="-1.6" y="-1.6" width="3.2" height="3.2" fill="none" stroke="${c}" stroke-width="1.2"/>`;
  },
  nodes: 24,
});
injectCSS('cf-xh-tri', '.xh2.act .a { filter: drop-shadow(0 0 2px currentColor); }');

// ------------------------------------------------------------------------------------------ damage numbers (§1.9 #6)
// white-hot to molten orange with a black edge; big hits keep the heat with a cyan hologram edge
SKINS.yanshu = ['#fff1d0', '#ffb02e', '#e2571a', '#121316'];
SKINS.yanshu_crit = ['#ffffff', '#fff1d0', '#ffb02e', '#1b6f86'];

// ------------------------------------------------------------------------------------------ kill mark (§1.9 #8)
// km_yanshu: (1) a holographic scale ring scans round in cyan with a slight colour split, (2) the falcon drone's silhouette
// fills in white ceramic with safety-orange wing tips, (3) full glow — a molten rim, (4) 點睛: its lens eye lights with the
// ding. Headshot: a cross-star from the eye + a cyan ring. Original, procedural.
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const seg = (t, a, b) => ease((t - a) / (b - a));
function falcon(c, R2) {
  const X = (u) => c + u * R2, p = new Path2D();
  // body (nose up), wings swept back 30°, a fanned tail
  p.moveTo(X(0), X(-0.5));
  p.quadraticCurveTo(X(0.1), X(-0.42), X(0.1), X(-0.22));
  p.lineTo(X(0.86), X(0.12)); p.lineTo(X(0.9), X(0.22)); p.lineTo(X(0.66), X(0.2)); p.lineTo(X(0.7), X(0.28)); p.lineTo(X(0.46), X(0.24)); p.lineTo(X(0.48), X(0.32));
  p.lineTo(X(0.12), X(0.18));
  p.lineTo(X(0.08), X(0.36)); p.lineTo(X(0.2), X(0.58)); p.lineTo(X(0), X(0.5)); p.lineTo(X(-0.2), X(0.58)); p.lineTo(X(-0.08), X(0.36));
  p.lineTo(X(-0.12), X(0.18));
  p.lineTo(X(-0.48), X(0.32)); p.lineTo(X(-0.46), X(0.24)); p.lineTo(X(-0.7), X(0.28)); p.lineTo(X(-0.66), X(0.2)); p.lineTo(X(-0.9), X(0.22)); p.lineTo(X(-0.86), X(0.12));
  p.lineTo(X(-0.1), X(-0.22));
  p.quadraticCurveTo(X(-0.1), X(-0.42), X(0), X(-0.5));
  p.closePath();
  return p;
}
registerKillMark('km_yanshu', {
  draw(ctx, S, t, o) {
    const p1 = seg(t, 0, 0.45), p2 = seg(t, 0.45, 0.8), p3 = seg(t, 0.8, 1.0), p4 = seg(t, 1.0, 1.15);
    const c = S / 2, R2 = S * 0.42, X = (u) => c + u * R2;
    ctx.clearRect(0, 0, S, S);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // (1) the holo scale ring: ticks sweeping round, drawn three times with a slight colour split
    const ring = (dx, col, a) => {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.lineWidth = S * 0.012;
      const n = Math.floor(48 * p1);
      for (let i = 0; i < n; i++) {
        const an = -Math.PI / 2 + (i / 48) * Math.PI * 2, r1 = R2 * 0.96, r0 = R2 * (i % 4 ? 0.9 : 0.84);
        ctx.beginPath(); ctx.moveTo(c + dx + Math.cos(an) * r0, c + Math.sin(an) * r0); ctx.lineTo(c + dx + Math.cos(an) * r1, c + Math.sin(an) * r1); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(c + dx, c, R2 * 0.98, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p1); ctx.stroke();
      ctx.restore();
    };
    const split = (1 - p2) * S * 0.012;
    ring(-split, 'rgba(255,90,60,0.9)', 0.5); ring(split, 'rgba(60,140,255,0.9)', 0.5); ring(0, CY, 0.9);
    const body = falcon(c, R2 * 0.92);
    // (2) the silhouette fills: white ceramic from the nose down, the wing tips orange
    if (p2 > 0) {
      ctx.save(); ctx.clip(body);
      const gr = ctx.createLinearGradient(0, X(-0.5), 0, X(0.6));
      gr.addColorStop(0, '#f4f1ea'); gr.addColorStop(0.6, '#d8d4cb'); gr.addColorStop(1, '#a7a299');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, S, X(-0.5 + 1.15 * p2));
      ctx.fillStyle = '#e2571a';
      ctx.fillRect(X(0.62), 0, S, X(-0.5 + 1.15 * p2)); ctx.fillRect(0, 0, X(-0.62), X(-0.5 + 1.15 * p2));
      ctx.fillStyle = '#2a2d33'; ctx.fillRect(X(-0.06), X(-0.2), R2 * 0.12, R2 * 0.38 * p2);
      ctx.restore();
    }
    // the outline (dash-drawn), molten once filled
    ctx.save();
    const peri = S * 4.4;
    ctx.setLineDash([peri * Math.min(1, p1 * 1.15), peri]);
    ctx.lineWidth = S * 0.026; ctx.strokeStyle = p2 > 0.5 ? '#ffb02e' : 'rgba(63,216,255,0.95)'; ctx.stroke(body);
    ctx.restore();
    // (3) full glow: a molten rim
    if (p3 > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = OR; ctx.shadowBlur = S * 0.07 * p3; ctx.globalAlpha = 0.55 * p3; ctx.lineWidth = S * 0.014; ctx.strokeStyle = HOTX; ctx.stroke(body); ctx.restore(); }
    // (4) 點睛: the lens eye on the nose
    const ex = X(0), ey = X(-0.36);
    const fl = Math.sin(Math.PI * p4) + (o.head ? Math.max(0, 1 - Math.abs(t - 1.1) / 0.08) * 0.8 : 0);
    if (p2 > 0.6) { ctx.fillStyle = '#0b0c0e'; ctx.beginPath(); ctx.arc(ex, ey, S * 0.022, 0, TAU); ctx.fill(); }
    if (p3 > 0 || fl > 0.01) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const gw = ctx.createRadialGradient(ex, ey, 0, ex, ey, S * (0.03 + 0.08 * fl));
      gw.addColorStop(0, `rgba(255,255,255,${(0.5 * p3 + 0.5 * Math.min(1, fl)).toFixed(2)})`); gw.addColorStop(0.4, 'rgba(63,216,255,0.7)'); gw.addColorStop(1, 'rgba(63,216,255,0)');
      ctx.fillStyle = gw; ctx.fillRect(ex - S * 0.13, ey - S * 0.13, S * 0.26, S * 0.26);
      if (fl > 0.01) {
        const L = S * (0.05 + fl * (o.head ? 0.16 : 0.06));
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
      ctx.beginPath(); ctx.arc(ex, ey, S * (0.04 + 0.42 * u), 0, TAU); ctx.stroke(); ctx.restore();
    }
  },
});

export { SFX as YANSHU_SFX };
