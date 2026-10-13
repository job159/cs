// 反災 (anti-calamity) series presentation — docs/PREMIUM_WEAPONS.md §2.0.4, §1.4 (反災 column), §1.7.1, §1.9.
// The look-and-feel layer over the series mechanics in specials.js; registers the series' crosshair, kill mark,
// clips and the network replay skill. 雙相 DUALPHASE (雙相-R, the Phase-0 pipeline weapon, model
// tools/assets/weapons/dualphase_r.mjs):
//   idle       gimbal misaligned and wobbling, rotor bands turning slowly, LED cells fill with the phase charge,
//              glow kept low (premium.idle.charge)
//   ready      the two rings lock coaxial (click + cyan / amber ring flash), rotors spin up, amber phase cell lit;
//              鈴 bell, ready_double haptic, crosshair halves merge + 4 nodes, 2.5 s reminders (specials.js)
//   過相 (14 s) shells slide 8 mm apart over the amber core with a vent of steam, rotors race, FOV +3°, 0.2 s
//              chromatic kick, element border; every round splits into cyan / amber light rounds behind a
//              hexagonal light crown; the last 1.5 s the rings and LEDs flicker, then the shells close with a hiss
//   kill       km_phase: two half-ring phase marks swing into one ring inside the series hexagon and flash
// Teammates replay the start from the skill event ('overphase_fx'): a flare at the caster and split tracers.
import * as THREE from 'three';
import { registerClip } from '../player/clips.js';
import { registerCrosshair, injectCSS } from '../ui/crosshairs.js';
import { registerKillMark } from '../ui/killmarks.js';
import { FRAME } from '../fx/fx.js';
import { clipComfort } from './arsenal.js';

const CY = '#6fe3ff', AM = '#ffb43a';
const CYH = [1.2, 5.6, 8], AMH = [8, 4.2, 1.1];          // HDR cyan / amber (tracers, sparks)
const ROTORS = ['fx_rotor_a', 'fx_rotor_b'], SHELLS = ['fx_shell_l', 'fx_shell_r'];
const LEDS = ['fx_led1', 'fx_led2', 'fx_led3', 'fx_led4', 'fx_led5', 'fx_led6'];
const END_WARN = 1.5;                                      // flicker before overphase ends (§1.7.1 beat 10)
const Z3 = [0, 0, 0];
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _u = new THREE.Vector3(), _w = new THREE.Vector3();
const R = Math.random;

const ps = (vm, name) => vm.partState[name] || (vm.partState[name] = { v: 0 });
/** Game-time delayed beats (hitstop / stepped frames safe, unlike setTimeout); run by fxQueue from the special's tick. */
function later(ws, sec, fn) { (ws.sp.fxq ||= []).push([sec, fn]); }
export function fxQueue(ws, dt) {
  const q = ws.sp.fxq;
  if (!q?.length) return;
  for (let i = q.length - 1; i >= 0; i--) if ((q[i][0] -= dt) <= 0) { const f = q[i][1]; q.splice(i, 1); f(); }
}
const play = (g, name, fb, o) => (g.audio?.has?.(name) ? g.audio.play(name, o) : g.audio?.play(fb, o));

// ------------------------------------------------------------------------------------- viewmodel driver
/**
 * Per-frame first-person state of the 雙相 gun (called by the overphase handler while it is held): gimbal lock and
 * wobble, rotor / core spin, the LED phase meter, end-of-phase flicker. A model without the gimbal (stand-in
 * defs on another gun) is left alone.
 */
export function dualphaseView(ws, g, dt) {
  const vm = g.vm, w = vm?.weapon, s = ws.sp, p = ws.def.special;
  if (!w?.parts?.fx_gimbal_a || w.def !== ws.def) return;
  const v = s.view || (s.view = { w: null, t: 0, lock: 0 });
  const act = s.active > 0, ready = !act && s.charge >= p.hits, dur = p.duration ?? 14;
  if (v.w !== w) {
    // a fresh viewmodel (equip): parts start from rest, rotors spin up from still, shells match the state
    v.w = w; v.t = 0; v.lock = act || ready ? 1 : 0;
    for (const r of ROTORS) ps(vm, r).spinW = 0;
    for (const n of SHELLS) { const st = ps(vm, n); st.tw = null; st.v = act ? 1 : 0; }
    vm._glowMat.glow_gold = vm._glowMat.glow_ice = 1;
  }
  v.t += dt;
  const insp = !!g.arsenal?._inspecting;
  // gimbal: misaligned and slowly wobbling (tilt 14-24°) -> locked coaxial when ready / in overphase
  v.lock += ((act || ready ? 1 : 0) - v.lock) * (1 - Math.exp(-(act || ready ? 14 : 3) * dt));
  const wa = 0.2 + 0.17 * Math.sin(v.t * 0.83), wb = 0.2 + 0.18 * Math.sin(v.t * 1.21 + 1.9);
  ps(vm, 'fx_gimbal_a').v = v.lock + (1 - v.lock) * wa;
  ps(vm, 'fx_gimbal_b').v = v.lock + (1 - v.lock) * wb;
  // rotor bands (extras: -30 / +40 °/s) and the core sleeve
  const sp = act ? 20 : ready ? 11 : insp ? 6 : 1;
  for (const r of ROTORS) ps(vm, r).spinMul = sp;
  ps(vm, 'fx_core').spinMul = act ? 7 : insp ? 1.5 : 0.25;
  // LED phase meter: cyan cells fill with the charge (count down the overphase), amber cell = phase ready
  let lit = Math.floor(Math.min(1, s.charge / p.hits) * 6 + 1e-6), amber = false;
  const last = act && s.active < END_WARN, blink = (hz) => Math.sin(v.t * Math.PI * 2 * hz) > 0;
  if (ready) { lit = 6; amber = blink(1.25) || v.t % 2.5 < 0.4; }
  if (act) { lit = Math.ceil(s.active / dur * 6); amber = true; }
  if (last && !blink(6)) { lit = 0; amber = false; }
  LEDS.forEach((n, i) => { ps(vm, n).hidden = i >= lit; });
  ps(vm, 'fx_ledr').hidden = !amber;
  // the rings flicker over the last 1.5 s of overphase
  const fl = last ? (blink(5) ? 1.6 : 0.3) : 1;
  vm._glowMat.glow_gold = vm._glowMat.glow_ice = fl;
}

/** Ready: the gimbal snaps coaxial with a click and a cyan / amber ring flash round it. */
export function dualphaseReady(ws, g, remind = false) {
  const vm = g.vm;
  if (!vm?.weapon?.parts?.fx_gimbal_a) return;
  if (!remind) play(g, 'dp_lock', 'ui_click', { volume: 0.7 });
  gyroRing(g, CYH, remind ? 0.07 : 0.1, remind ? 0.25 : 0.35, remind ? 0.5 : 1);
  later(ws, 0.07, () => { if (g.arsenal?.current === ws) gyroRing(g, AMH, remind ? 0.085 : 0.12, 0.4, remind ? 0.5 : 1); });
}

/** A flat light ring round the gimbal, in the gimbal plane (viewmodel layer). */
function gyroRing(g, col, r1, life, k = 1) {
  const vm = g.vm, c = vm?.socketCam?.('gyro', _a);
  if (!c) return;
  const n = _b.set(0, 0, -1).applyQuaternion(vm.gunRoot.quaternion);
  g.fx?.particles.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, mode: 'flat', dir: [n.x, n.y, n.z], life, size: 0.07, size1: r1 * 2, sizePow: 0.5,
    color: [col[0] * k, col[1] * k, col[2] * k, 1], color1: [col[0] * 0.2, col[1] * 0.2, col[2] * 0.2, 0], frame: FRAME.thinRing });
}

/** Steam out of the opened shells (both sides, viewmodel layer). */
function vent(g, n = 10, k = 1) {
  const vm = g.vm, P = g.fx?.particles;
  if (!P || !vm?.weapon) return;
  for (const [sock, sd] of [['vent_l', -1], ['vent_r', 1]]) {
    const c = vm.socketCam(sock, _a);
    if (!c) continue;
    _w.set(sd, 0, 0).applyQuaternion(vm.gunRoot.quaternion);
    for (let i = 0; i < n; i++) {
      const sp = (0.25 + R() * 0.35) * k;
      P.spawn({ vm: true, x: c.x, y: c.y + (R() - 0.5) * 0.02, z: c.z + (R() - 0.5) * 0.03, vx: _w.x * sp, vy: _w.y * sp + 0.06 + R() * 0.08, vz: _w.z * sp, life: 0.45 + R() * 0.4,
        size: 0.016, size1: 0.08 + R() * 0.05, sizePow: 0.5, color: [0.86, 0.9, 0.95, 0.55 * k], color1: [0.8, 0.83, 0.88, 0], frame: FRAME.smoke + ((R() * 2) | 0), drag: 2.4, spin: (R() - 0.5) * 2, inertia: 0.5 });
    }
  }
}

/** 過相 starts (local, weapon in hand): shells open, steam, rings, FOV, chromatic kick, element border. */
export function dualphaseEngage(ws, g) {
  const vm = g.vm, ar = g.arsenal, dur = ws.def.special.duration ?? 14;
  play(g, 'dp_engage', 'special_activate');
  if (vm?.weapon?.parts?.fx_shell_l) {
    for (const n of SHELLS) vm.setPart(n, 1, 0.22);
    const held = () => ar?.current === ws && ws.sp.active > 0;
    later(ws, 0.12, () => { if (held()) { vent(g, 10, 1); play(g, 'dp_vent', 'cloth', { volume: 0.5 }); } });
    gyroRing(g, CYH, 0.11, 0.35);
    later(ws, 0.09, () => { if (held()) gyroRing(g, AMH, 0.15, 0.45); });
    vm.glowTo(2.2, 0.1); later(ws, 0.26, () => { if (held()) vm.glowTo(1, 0.45); });
  }
  // the gun bucks once as the reactor opens (only from idle: a clip would cut a reload's ammo event)
  if (ar && ar.state === 'idle' && !ar._inspecting) ar.playClip('dualphase_engage');
  // comfort switches (§1.14 #6) apply: shake / FOV / chromatic kick go through the arsenal's clip comfort flags
  ar?._clipEvent?.('haptic', 'thud');
  ar?.fovKick?.(3, 0.5);
  ar?._clipEvent?.('shake', 0.12);
  const post = g.renderer?.post;
  if (post && clipComfort.aberration !== false) { post.aberration = Math.max(post.aberration || 0, 0.25); later(ws, 0.2, () => { post.aberration = 0; }); }
  g.hud?.border?.(CY, 0.16, dur);
}

/** 過相 ends: the shells close with a hiss and a last breath of steam. */
export function dualphaseEnd(ws, g, held) {
  play(g, 'dp_end', 'special_end', { volume: 0.8 });
  g.hud?.border?.(CY, 0, 0.01);
  const vm = g.vm;
  if (!held || !vm?.weapon?.parts?.fx_shell_l) return;
  for (const n of SHELLS) vm.setPart(n, 0, 0.45);
  vent(g, 6, 0.6);
  vm._glowMat.glow_gold = vm._glowMat.glow_ice = 1;
}

/** Each overphase shot: a hexagonal light crown at the muzzle — six short rays round a hollow centre. */
export function phaseCrown(g, n = 0) {
  const vm = g.vm, P = g.fx?.particles, c = vm?.socketCam?.('muzzle', _a);
  if (!P || !c) return;
  const f = _b.set(0, 0, -1).applyQuaternion(vm.gunRoot.quaternion);
  _u.set(0, 1, 0).applyQuaternion(vm.gunRoot.quaternion);
  _w.crossVectors(f, _u).normalize();
  const rot = (n % 2) * 0.5236;     // alternate shots turn the star by 30°
  for (let i = 0; i < 6; i++) {
    const a = rot + i * 1.0472, col = i % 2 ? AMH : CYH;
    _c.copy(_u).multiplyScalar(Math.cos(a)).addScaledVector(_w, Math.sin(a));
    const r0 = 0.014, sp = 2.6;
    P.spawn({ additive: true, vm: true, x: c.x + _c.x * r0 + f.x * 0.01, y: c.y + _c.y * r0 + f.y * 0.01, z: c.z + _c.z * r0 + f.z * 0.01,
      vx: _c.x * sp + f.x * 0.4, vy: _c.y * sp + f.y * 0.4, vz: _c.z * sp + f.z * 0.4, life: 0.07, size: 0.005, stretch: 0.022,
      color: [col[0] * 1.6, col[1] * 1.6, col[2] * 1.6, 1], color1: [col[0] * 0.3, col[1] * 0.3, col[2] * 0.3, 0], frame: FRAME.spark, drag: 8 });
  }
  P.spawn({ additive: true, vm: true, x: c.x + f.x * 0.012, y: c.y + f.y * 0.012, z: c.z + f.z * 0.012, mode: 'flat', dir: [f.x, f.y, f.z], life: 0.07,
    size: 0.035, size1: 0.1, sizePow: 0.5, color: [CYH[0] * 0.8, CYH[1] * 0.8, CYH[2] * 0.8, 1], color1: [AMH[0] * 0.2, AMH[1] * 0.2, AMH[2] * 0.2, 0], frame: FRAME.thinRing, rot: rot });
}

/** World kill: a small cyan / amber phase burst where the zombie fell (one per kill, no damage). */
export function phaseKill(g, point) {
  if (!point || !g.fx) return;
  g.fx.sparkBurst(point, { color: CYH, color1: AMH, count: 7, speed: 3.5, glow: 0.22 });
  g.fx.shockwave(point, { r0: 0.05, r1: 0.45, life: 0.28, color: [CYH[0] * 0.6, CYH[1] * 0.6, CYH[2] * 0.6], thin: true });
}

/** Tracer colours of the split rounds (arsenal: one per pellet). */
export const PHASE_TRACERS = [CYH, AMH];

// ------------------------------------------------------------------------------------- network replay
/** 'overphase_fx' skill: teammates see the overphase start at the caster and split tracers for its duration. */
export const OVERPHASE_FX = {
  level: 'L1',
  start(k) {
    const g = k.game;
    k.dur = k.def.special?.duration ?? 14;
    if (k.local) return;                         // the caster's own presentation runs from the weapon
    const r = g.net?.remotes?.get?.(k.by);
    if (r) r.fxMode = { kind: 'overphase', until: g.time + k.dur, tracers: PHASE_TRACERS, n: 0 };
    const at = (r?.gun?.getObjectByName?.('S_gyro') || r?.gun)?.getWorldPosition?.(new THREE.Vector3()) || k.caster(new THREE.Vector3(), _b).addScaledVector(_b, 0.6);
    g.fx?.sparkBurst(at, { color: CYH, color1: AMH, count: 10, speed: 3, glow: 0.3 });
    g.fx?.shockwave(at, { r0: 0.05, r1: 0.5, life: 0.35, color: [CYH[0] * 0.5, CYH[1] * 0.5, CYH[2] * 0.5] });
    play(g, 'dp_engage', 'special_activate', { pos: at, volume: 0.7 });
  },
  end(k) {
    if (k.local) return;
    const r = k.game.net?.remotes?.get?.(k.by);
    if (r?.fxMode?.kind === 'overphase') r.fxMode = null;
  },
};

// ------------------------------------------------------------------------------------- clips
// 過相 engage: the gun bucks back and rolls out as the reactor opens (motion only; FX run from code)
registerClip('dualphase_engage', {
  duration: 0.62,
  tracks: {
    gunPos: [[0, Z3], [0.16, [0.004, 0.006, 0.022], 'out3'], [0.5, [0.0, 0.002, 0.006]], [1, Z3, 'inOut']],
    gunRot: [[0, Z3], [0.16, [-6, 5, 13], 'out3'], [0.5, [-1.5, 1.5, 3.5]], [1, Z3, 'inOut']],
  },
  events: [],
});

/**
 * Inspect (3.8 s, hold loops 0.17-0.4): CS2 slow tilt showing the left flank and the LED meter, then a roll
 * that presents the gimbal while it locks for a moment and the shells crack open over the glowing core, a 1 s
 * settle pose and back. Studio fill follows the `env` track.
 */
registerClip('dualphase_inspect', {
  duration: 3.8, loop: [0.17, 0.4],
  tracks: {
    gunPos: [[0, Z3], [0.17, [-0.03, 0.02, 0.03]], [0.28, [-0.045, 0.028, 0.022]], [0.4, [-0.03, 0.02, 0.03]],
      [0.5, [0.085, 0.03, -0.02], 'inOut'], [0.66, [0.09, 0.035, -0.024]], [0.8, [-0.01, 0.01, 0.01], 'inOut'], [0.9, [0, 0.004, 0.004]], [1, Z3]],
    gunRot: [[0, Z3], [0.17, [8, 30, -28]], [0.28, [11, 38, -36]], [0.4, [8, 30, -28]],
      [0.5, [13, 50, -24], 'inOut'], [0.66, [15, 53, -27]], [0.8, [3, -10, 18], 'inOut'], [0.9, [1, -3, 5]], [1, Z3]],
    fx_gimbal_a: [[0, 0], [0.47, 0], [0.53, 1, 'outBack'], [0.7, 1], [0.78, 0, 'inOut'], [1, 0]],
    fx_gimbal_b: [[0, 0], [0.48, 0], [0.54, 1, 'outBack'], [0.7, 1], [0.79, 0, 'inOut'], [1, 0]],
    fx_shell_l: [[0, 0], [0.54, 0], [0.59, 0.6, 'outBack'], [0.7, 0.6], [0.76, 0, 'in3'], [1, 0]],
    fx_shell_r: [[0, 0], [0.54, 0], [0.59, 0.6, 'outBack'], [0.7, 0.6], [0.76, 0, 'in3'], [1, 0]],
    env: [[0, 0], [0.15, 1], [0.85, 1], [1, 0]],
  },
  // the support hand lets go while the gun swings round to show the reactor face-on, then takes the handguard again
  events: [[0.1, 'snd', 'cloth'], [0.42, 'anchorL', ['rest', 0.22]], [0.45, 'snd', 'cloth'], [0.53, 'snd', 'dp_lock'], [0.53, 'haptic', 'tick'],
    [0.54, 'glow', { to: 2, sec: 0.12 }], [0.59, 'snd', 'dp_vent'], [0.72, 'glow', { to: 1, sec: 0.4 }], [0.76, 'haptic', 'tick'],
    [0.8, 'anchorL', ['grip_l', 0.2]], [0.84, 'poseL', 'cradle']],
});

// ------------------------------------------------------------------------------------- crosshair (§1.9 #2)
// xh_phase 雙半圓: a cyan left half and an amber right half, a phase apart (offset) until ready / overphase merges
// them; short inner ticks at 3 and 9 o'clock. Stroke only, hollow centre, hit-reactive (class "a").
const arc = (r, a0, a1) => { const p = (a) => `${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`; return `M${p(a0)} A${r} ${r} 0 0 1 ${p(a1)}`; };
registerCrosshair('xh_phase', {
  draw(gap, c, s, c2 = c) {
    const R = Math.min(19, 10 + gap * 0.55), D = Math.PI / 180;
    const half = (col, a0, a1, tick, cls) => `<g class="${cls}"><path class="a" d="${arc(R, a0 * D, a1 * D)}" fill="none" stroke="${col}" stroke-width="1.8" stroke-linecap="round"/>`
      + `<path class="a" d="M${(tick * R).toFixed(1)} 0 L${(tick * (R - 4.5)).toFixed(1)} 0" stroke="${col}" stroke-width="1.6"/></g>`;
    return half(c, 104, 256, -1, 'ph-l') + half(c2, -76, 76, 1, 'ph-r');
  },
  nodes: 28,
});
injectCSS('cf-xh-phase', `
.xh2 .ph-l, .xh2 .ph-r { transition: transform .22s cubic-bezier(.3,1.7,.5,1); }
.xh2 .ph-l { transform: translate(-1.2px, -2.6px); } .xh2 .ph-r { transform: translate(1.2px, 2.6px); }
.xh2.ready .ph-l, .xh2.ready .ph-r, .xh2.act .ph-l, .xh2.act .ph-r { transform: none; }
.xh2.act .ph-l path, .xh2.act .ph-r path { filter: drop-shadow(0 0 2px currentColor); }
`);

// ------------------------------------------------------------------------------------- kill mark (§1.9 #8)
// km_phase: (1) the two half rings draw in, a phase apart and turned; (2) they swing together and fill, the
// series hexagon draws round them; (3) the closed ring glows; (4) the two seams flash with the ding. Headshot:
// cross-star flare + element ring from the seams.
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const seg = (t, a, b) => ease((t - a) / (b - a));
function hexPath(ctx, c, R) { ctx.beginPath(); for (let i = 0; i <= 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; ctx[i ? 'lineTo' : 'moveTo'](c + Math.cos(a) * R, c + Math.sin(a) * R); } ctx.closePath(); }
registerKillMark('km_phase', {
  draw(ctx, S, t, o) {
    const c = S / 2, R = S * 0.25, lw = S * 0.07;
    const p1 = seg(t, 0, 0.45), p2 = seg(t, 0.4, 0.8), p3 = seg(t, 0.8, 1.0), p4 = seg(t, 1.0, 1.15);
    ctx.clearRect(0, 0, S, S);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // series hexagon (反災 frame): dark plate, cyan edge drawn in during beat 2
    const HR = S * 0.43, per = HR * 6;
    if (p2 > 0) {
      ctx.save(); hexPath(ctx, c, HR); ctx.globalAlpha = 0.85 * p2; ctx.fillStyle = '#0b1418'; ctx.fill(); ctx.restore();
    }
    ctx.save();
    ctx.shadowColor = CY; ctx.shadowBlur = S * 0.05 * p3;
    hexPath(ctx, c, HR); ctx.setLineDash([per * p2, per]); ctx.lineWidth = S * 0.022; ctx.strokeStyle = '#0a0d0f'; ctx.globalAlpha = 0.9; ctx.stroke();
    ctx.lineWidth = S * 0.012; ctx.strokeStyle = '#9ef2ff'; ctx.globalAlpha = 1; ctx.stroke();
    ctx.restore();
    // the two halves: apart and turned 90° (phase lag) -> one ring
    const k = 1 - p2;
    for (const side of [0, 1]) {
      const col = side ? AM : CY, sg = side ? 1 : -1;
      ctx.save();
      ctx.translate(c + sg * k * R * 0.42, c - sg * k * R * 0.42);
      ctx.rotate(sg * k * 1.5708);
      const a0 = side ? -Math.PI / 2 : Math.PI / 2, a1 = a0 + Math.PI * Math.max(0.02, p1);
      ctx.beginPath(); ctx.arc(0, 0, R, a0, a1);
      ctx.lineWidth = lw * 1.5; ctx.strokeStyle = '#06090b'; ctx.stroke();
      const gr = ctx.createLinearGradient(-R, -R, R, R);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, col); gr.addColorStop(1, side ? '#8a4a14' : '#0e6f86');
      ctx.shadowColor = col; ctx.shadowBlur = S * (0.03 + 0.06 * p3);
      ctx.lineWidth = lw * (0.35 + 0.65 * p2); ctx.strokeStyle = p2 > 0 ? gr : col; ctx.stroke();
      ctx.restore();
    }
    // the seams (top and bottom of the closed ring) flash: 點睛
    const fl = Math.sin(Math.PI * p4) + (o.head ? Math.max(0, 1 - Math.abs(t - 1.1) / 0.08) * 0.8 : 0);
    if (fl > 0.01 || p3 > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const y of [c - R, c + R]) {
        const g = ctx.createRadialGradient(c, y, 0, c, y, lw * (1.2 + fl * 1.6));
        g.addColorStop(0, `rgba(255,255,255,${(0.35 * p3 + 0.65 * Math.min(1, fl)).toFixed(3)})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(c - lw * 3, y - lw * 3, lw * 6, lw * 6);
        if (fl > 0.01) {
          const L = lw * (0.8 + fl * (o.head ? 2.6 : 1.3));
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = S * 0.01; ctx.globalAlpha = Math.min(1, fl);
          ctx.beginPath(); ctx.moveTo(c - L, y); ctx.lineTo(c + L, y); ctx.moveTo(c, y - L * 0.6); ctx.lineTo(c, y + L * 0.6); ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      ctx.restore();
    }
    if (o.head && t > 1.0) {
      const u = Math.min(1, (t - 1.0) / 0.17);
      ctx.save(); ctx.globalAlpha = 1 - u; ctx.strokeStyle = o.tint || CY; ctx.lineWidth = S * 0.012;
      ctx.beginPath(); ctx.arc(c, c, R + (HR * 1.05 - R) * u, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
  },
});
