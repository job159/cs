// X03 彤弓．落陽 Tonggong Sunfall — 神兵 great bow (docs/PREMIUM_WEAPONS.md §2.30). Mechanics on the specials v2 engine
// (registerSpecial 'sunbow' + skills) and the whole presentation: the bow's own trigger (draw / release), real flying
// arrows, the viewmodel driver (the bow pose follows the draw, limbs flex, the string re-aims every frame, the arrow
// burns into being), clips, crosshair, kill mark, damage-number skin. Effect primitives: sunbow_fx.js. Model:
// tools/assets/weapons/sunbow.mjs.
//
//   LMB held   拉弓: 點射 < 0.35 s (55, 60 m/s, pierce 1) / 引 (120, 85 m/s, pierce 2) / 滿 0.85 s (240, 110 m/s, pierce 3,
//              日灼 1) / 貫日 1.45 s (460, 150 m/s, no drop, pierce 8, 日灼 3, survivors pinned 1.2 s, the dead hurled).
//              Each stage: a rising chime, a ring off the head, FOV -1°, the edges darken, the limbs bend further; 貫日
//              opens the three crown leaves (蓄滿變形) and turns the head white-hot. The spread converges 2.2° -> 0°
//              (the crosshair closes with it); a full draw held past 3 s starts to shake. Release: the string snaps
//              and wobbles, the limbs spring back past rest, the hand flies off the string, the bow thrusts; view punch
//              / shake / FOV punch scale with the stage. 0.32 s later a new arrow burns onto the string.
//   九陽       9 arrows = the nine sun cores on the riser (one goes dark per arrow); they relight by themselves (0.6 s
//              after the last shot, one every 0.7 s); R 續陽 relights all (1 s); empty = automatic.
//   RMB 分曦   the drawn arrow (at least 引) splits into a 5-arrow fan (±18°, 55 % each, a gold fan off the bow),
//              3 arrows, 0.7 s cooldown.
//   Q 懸日     (30 日精) a quick shot plants a small sun (on a wall / floor / a zombie) for 3.5 s: 45/s + 日灼 within 3.5 m,
//              pulls the horde in (7 m), teammates within 5 m +15 % damage (曦照), every arrow through it turns 貫日,
//              then it bursts (320, 5 m).
//   hold Q     落九陽 (4,500 damage): a sigil, nine suns ignite in a ring 22 m up, golden arrows shoot them down one by
//              one: eight 240 strikes round the ring, the ninth 650 in the middle (quake rings, rubble, scorched cracks).
//   crisis     扶桑甲: the default knock-back block with a burst of gold 扶桑 leaves and lacquer chips.
//   kill       KE_SUNMARK (sun disc flash, the corpse catches fire, a sun-ring scorch); km_sunbow; damage skin 'sunbow'.
// Sound cues (§1.12, produced later; each has a stock fallback): see SND below and the card's sound list.
import * as THREE from 'three';
import { registerSpecial, registerSkill, meterAdd, canCast, chargeState, addAura } from '../specials.js';
import { registerClip, drawClip } from '../../player/clips.js';
import { registerCrosshair, injectCSS } from '../../ui/crosshairs.js';
import { registerKillMark } from '../../ui/killmarks.js';
import { SKINS } from '../../ui/dmgnums.js';
import { FRAME, DECAL, DECAL_TINT } from '../../fx/fx.js';
import { haptic, clipComfort } from '../arsenal.js';
import { COL, sfx, SunOrb, arrowMesh, arrowTrail, arrowSpark, formSparks, headFire, drawRibbon, dropRibbon, gatherMotes, stagePulse, releaseFx, sunEmber, rayGlint, stringDust, impact, sunMark, lick, rubble,
  gunAxes, burnLine, pierceTag, warmTags, fanFlare, sunImpact, fireWave } from './sunbow_fx.js';

const D2R = Math.PI / 180, TAU = Math.PI * 2;
const UPV = new THREE.Vector3(0, 1, 0), DOWNV = new THREE.Vector3(0, -1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Quaternion();
const R = Math.random;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, u) => a + (b - a) * u;
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const mine = (g, ws) => !!g.vm?.weapon && g.vm.weapon.def === ws.def;
const ps = (vm, name) => vm.partState[name] || (vm.partState[name] = { v: 0 });
const k3 = (c, m) => [c[0] * m, c[1] * m, c[2] * m];

// sound cues and their stock fallbacks
const SND = {
  draw: ['sunbow_draw', 'drawHeavy'], creak: ['sunbow_creak', null], stage1: ['sunbow_stage1', 'xh_node'], stage2: ['sunbow_stage2', 'magIn'], stage3: ['sunbow_stage3', 'killmark_ding'],
  full: ['sunbow_full', null], release: ['sunbow_release', 'swing'], releaseHeavy: ['sunbow_release_heavy', 'swingHeavy'], whiz: ['sunbow_whiz', 'bullet_whiz'],
  hit: ['sunbow_hit', 'knife_hit_flesh'], hitWorld: ['sunbow_hit_world', 'knife_hit_wall'], ignite: ['sunbow_ignite', 'fire_burst'], pin: ['sunbow_pin', 'melee_heavy_hit'],
  kill: ['sunbow_kill', 'kill_confirm_thud'], split: ['sunbow_split', 'swingHeavy'], nock: ['sunbow_nock', null], hang: ['sunbow_hang', 'fire_burst'], hangLoop: ['sunbow_hang_loop', 'amb_fire'],
  hangBurst: ['sunbow_hang_burst', 'explosion_small'], empower: ['sunbow_empower', 'killmark_ding'], rekindle: ['sunbow_rekindle', 'magIn'], regen: ['sunbow_regen', null],
  ultRaise: ['sunbow_ult_raise', 'boss_warning'], ultShot: ['sunbow_ult_shot', 'swing'], ultFall: ['sunbow_ult_fall', 'rocket_fly'], ultImpact: ['sunbow_ult_impact', 'explosion_small'],
  ultFinal: ['sunbow_ult_final', 'explosion_large'], inspect: ['sunbow_inspect', 'cloth'], pluck: ['sunbow_pluck', 'xh_node'], first: ['sunbow_first', 'drawHeavy'], crisis: ['sunbow_crisis', 'glass'],
  dry: ['sunbow_dry', 'dryfire'],
};
const play = (g, key, o = {}) => sfx(g, SND[key][0], SND[key][1], o);

// what the held bow shows on the crosshair (one local player)
const XS = { drawing: false, stage: 0, ammo: 9 };
// live hanging suns (every arrow checks them), stuck arrows (≤ 24, oldest goes first)
const SUNS = new Set();
const STUCK = [];
let _arrowSys = null;

// ------------------------------------------------------------------------------------- the special (v2 overrides)
registerSpecial('sunbow', {
  init(ws) {
    // per-instance def: the draw slows the walk (game.js reads arsenal.def.speed); everything else reads through
    ws.def = Object.create(ws.def);
    Object.assign(ws.sp, { drawing: false, drawT: 0, stage: 0, tireT: 0, nockV: 0, nockVel: 0, aimW: 0, aimHold: 0, nockT: 0, formU: 1, arrowOn: true, vib: 0, vibT: 0,
      busy: 0, regenWait: 0, regenT: 0, burn: new Map(), pins: new Map(), arrows: [], tally: { hits: 0, kills: 0, stage: 0, head: false, at: null },
      rayShow: 9, rayUntil: -1, view: null, snd: {}, idleT: 0, emberT: 0, vig: null, crown: false });
    // decode the bow's cues up front (samples are fetched on first play: the first draw, loose and hit would start late)
    const au = ws.game?.audio;
    if (au?.defs && !au._sbPre) { au._sbPre = true; au.preload?.(Object.keys(au.defs).filter((n) => /^(sunbow_|ready_sunbow$)/.test(n)))?.catch?.(() => {}); }
  },
  modifiers() { return {}; },
  // the gun trigger is ours (Arsenal asks before its own logic): draw / release run in update()
  trigger() { return true; },
  onHit(ws, info, res, target) {
    const g = ws.game, s = ws.sp, B = ws.def.bow, z = target?.zombie || target;
    if (!g || !res || info.skill === 'sb_dot' || info.skill === 'crisis') return;
    if (info.sbArrow != null) {
      if (info.sbArrow >= 1) meterAdd(ws, 'sun', 2);
      if (z && !res.killed && info.sbBurn) addBurn(ws, z, info.sbBurn);
      if (z && !res.killed && info.sbArrow === 3) pin(ws, g, z, B.pin);
      if (res.killed && info.sbArrow === 3) { meterAdd(ws, 'sun', 3); if (z) hurl(g, z, info); }
    } else if (z && !res.killed && (info.skill === 'sunbow_ult' || info.skill === 'sunbow_hang')) addBurn(ws, z, info.skill === 'sunbow_ult' ? 2 : 1);
    if (res.killed && z) killFx(ws, g, z, info);
  },
  update(ws, dt, g) {
    const s = ws.sp, B = ws.def.bow, ar = g.arsenal, inp = g.input?.state;
    s.busy = Math.max(0, s.busy - dt);
    // RMB 分曦 needs 3 arrows: the press is ours then (the engine would cast it anyway)
    if (inp?.pressed?.alt && ws.ammo < B.fan.cost && canCast(ws, 'alt').ok) {
      inp.pressed.alt = false;
      play(g, 'dry', { volume: 0.6 }); g.hud?.toast?.('九陽不足（分曦要 3 箭）', 900);
    }
    const alive = !!g.status?.alive, idle = ar?.state === 'idle';
    if (s.drawing) {
      if (!idle || !alive || s.busy > 0) cancelDraw(ws, g);
      else if (!inp?.held?.fire) release(ws, g);
      else tickDraw(ws, g, dt);
    } else if (idle && alive && inp?.held?.fire && s.busy <= 0 && s.nockT <= 0) {
      if (ws.ammo > 0) startDraw(ws, g);
      else if (inp.pressed.fire) { play(g, 'dry', { volume: 0.7 }); ar.reload(); }
    }
    // the HUD crosshair gap follows the draw's spread (the arrows use their own)
    ws.bloom = spreadNow(ws);
    XS.drawing = s.drawing; XS.stage = s.stage; XS.ammo = ws.ammo;
    if (mine(g, ws)) view(ws, g, dt);
  },
  tick(ws, dt, g) {
    const s = ws.sp, B = ws.def.bow, ar = g.arsenal, held = ar?.current === ws;
    // arrows keep flying (and burns keep ticking) whichever weapon is in hand
    for (let i = s.arrows.length - 1; i >= 0; i--) {
      const a = s.arrows[i], on = stepArrow(g, a, dt);
      if (a.kills >= 3 && !a.tagged && (!on || a.t - a.killT > 0.1)) pierceBeat(g, a);
      if (!on) { endArrow(g, a); s.arrows.splice(i, 1); }
    }
    weigh(ws, g);
    burnTick(ws, g, dt);
    pinTick(ws, dt);
    stuckTick(g, dt);
    pinnedTick(g, dt);
    // renock: a new arrow burns onto the string
    if (s.nockT > 0) {
      s.nockT -= dt;
      if (s.nockT <= 0.25 && !s.arrowOn && ws.ammo > 0) { s.arrowOn = true; s.formU = 0; if (held && mine(g, ws)) play(g, 'nock', { volume: 0.5 }); }
    }
    if (s.arrowOn && s.formU < 1) s.formU = Math.min(1, s.formU + dt / 0.25);
    if (!s.arrowOn && ws.ammo > 0 && s.nockT <= 0) { s.arrowOn = true; s.formU = 0; }
    // 九陽 relight by themselves
    if (ws.ammo < ws.def.mag && !s.drawing && !(held && ar.state === 'reload')) {
      if ((s.regenWait -= dt) <= 0 && (s.regenT += dt) >= B.regen.every) {
        s.regenT = 0; ws.ammo++; g.hud?.ammoChanged?.();
        if (held && mine(g, ws)) { rayGlint(g, 10 - ws.ammo, 0.8); play(g, 'regen', { volume: 0.35 }); }
      }
    } else s.regenT = 0;
    if (!held || !mine(g, ws)) stopDrawLook(ws, g);
    const ready = canCast(ws, 'ult').ok;
    if (ready && !s.wasReady && held && g.audio?.has && !g.audio.has('ready_sunbow')) sfx(g, 'ready_sunbow', 'killmark_ding', { volume: 0.8, pitch: 0.84 });
    s.wasReady = ready;
    // idle hum (§1.12) only while held
    if (s.snd.hum && !held) { s.snd.hum.stop?.(0.2); s.snd.hum = null; }
  },
  dispose(ws, g) {
    const s = ws.sp;
    stopDrawLook(ws, g);
    for (const a of s.arrows) endArrow(g, a);
    s.arrows.length = 0;
    for (const k of Object.keys(s.snd)) { s.snd[k]?.stop?.(0.1); s.snd[k] = null; }
  },
  /** Clip events: ['sb', { show: count, hold | glint: ray | relight: ray | rays: 'run' | 'all' | sun | pluck | dust | snd, vol | crown | roll | hand: 'string' }] (ray 9 = lowest core) */
  onClipEvent(ws, name, arg, g) {
    // the clips write [t, S(o)] = [t, ['sb', o]]: the clip player hands that pair over as the event name
    if (Array.isArray(name)) [name, arg] = name;
    if (name !== 'sb' || !arg) return;
    const s = ws.sp, vm = g.vm;
    if (arg.show != null) { s.rayShow = arg.show; s.rayUntil = g.time + (arg.hold ?? 1.2); if (arg.show > 0) rayGlint(g, 10 - arg.show, 1.2); }
    if (arg.glint != null) rayGlint(g, arg.glint, 1);
    if (arg.relight != null) { s.rayShow = Math.max(ws.ammo, 10 - arg.relight); s.rayUntil = g.time + 0.6; rayGlint(g, arg.relight, 1.1); play(g, 'regen', { volume: 0.5 }); }
    if (arg.rays === 'run') runRays(ws, g, arg.dt ?? 0.045);
    if (arg.rays === 'all') { for (let i = 1; i <= 9; i++) rayGlint(g, i, 1.3); s.rayShow = 9; s.rayUntil = g.time + 0.5; }
    if (arg.sun) { vm?.glowTo(arg.sun, 0.06); later(ws, 0.12, () => g.vm?.glowTo(1, 0.4)); sunFlare(g); }
    if (arg.pluck) { s.vib = Math.max(s.vib, arg.pluck); s.vibT = 0; play(g, 'pluck', { volume: 0.8 }); stringDust(g); }
    if (arg.dust) stringDust(g);
    if (arg.crown != null) vm?.setPart('fx_leaf*', arg.crown, 0.25, 0.04);
    if (arg.roll) rollSun(ws, g, arg.roll);
    if (arg.hand === 'string') handToString(g, arg.blend ?? 0.2);
    if (arg.snd) play(g, arg.snd, { volume: arg.vol ?? 0.9 });
  },
});

// ------------------------------------------------------------------------------------- draw / release
const stageOf = (B, t) => (t >= B.stages[2] ? 3 : t >= B.stages[1] ? 2 : t >= B.stages[0] ? 1 : 0);
/** Nock travel (0..1) after t s of drawing: a strong first pull that slows into the full draw. */
const drawCurve = (B, t) => { const u = clamp01(t / B.stages[2]); return 1 - (1 - u) * (1 - u); };
function spreadNow(ws) {
  const s = ws.sp, B = ws.def.bow;
  if (!s.drawing) return B.spread[0];
  const st = s.stage;
  let sp = st === 3 ? 0 : lerp(B.spread[st], B.spread[st + 1], clamp01((s.drawT - (st ? B.stages[st - 1] : 0)) / (B.stages[st] - (st ? B.stages[st - 1] : 0))));
  if (st === 3 && s.tireT > B.tire) sp = Math.min(B.tireMax, (s.tireT - B.tire) * B.tireRate);
  return sp;
}

function startDraw(ws, g) {
  const s = ws.sp, ar = g.arsenal;
  s.drawing = true; s.drawT = 0; s.stage = 0; s.tireT = 0; s.regenWait = ws.def.bow.regen.delay;
  if (mine(g, ws)) handToString(g, 0.09);
  ws.def.speed = Object.getPrototypeOf(ws.def).speed * ws.def.bow.moveMul;
  if (mine(g, ws)) {
    s.snd.creak = play(g, 'creak', { volume: 0.55, loop: true });
    const post = g.renderer?.post;
    if (post && s.vig == null) s.vig = post.vignette;
  }
  ar.sinceShot = 0;
}
function tickDraw(ws, g, dt) {
  const s = ws.sp, B = ws.def.bow;
  s.drawT += dt;
  const st = stageOf(B, s.drawT);
  if (st > s.stage) stageUp(ws, g, st);
  if (s.stage === 3) s.tireT += dt;
  s.snd.creak?.setRate?.(0.85 + 0.35 * clamp01(s.drawT / B.stages[2]));
  s.regenWait = B.regen.delay;
}
function stageUp(ws, g, st) {
  const s = ws.sp, vm = g.vm, ar = g.arsenal;
  s.stage = st;
  play(g, 'stage' + st, { volume: 0.55 + st * 0.12, pitch: [1, 1.12, 1.26][st - 1] });
  haptic(st === 3 ? 30 : 12);
  ar?.fovHold?.(-st, 0.15);
  const post = g.renderer?.post;
  if (post && s.vig != null && clipComfort.overlay !== false) post.vignette = s.vig + [0, 0.05, 0.08, 0.11][st];
  if (!mine(g, ws)) return;
  stagePulse(g, st);
  if (st === 2) play(g, 'ignite', { volume: 0.35 });
  if (st === 3) {
    vm.setPart('fx_leaf*', 1, 0.22, 0.04); s.crown = true;
    vm.glowTo(2.1, 0.05); later(ws, 0.1, () => g.vm?.glowTo(1.35, 0.3));
    runRays(ws, g, 0.025);
    s.snd.full = play(g, 'full', { volume: 0.5, loop: true });
    g.addShake?.(0.04);
  }
}
/** Ends the draw's look and sound (release, cancel, holster). */
function endDraw(ws, g) {
  const s = ws.sp;
  s.drawing = false;
  s.snd.creak?.stop?.(0.08); s.snd.creak = null;
  s.snd.full?.stop?.(0.15); s.snd.full = null;
  ws.def.speed = Object.getPrototypeOf(ws.def).speed;
  g.arsenal?.fovHold?.(0, 0.12);
  const post = g.renderer?.post;
  if (post && s.vig != null) { post.vignette = s.vig; s.vig = null; }
  if (s.crown && g.vm) { g.vm.setPart('fx_leaf*', 0, 0.3, 0.03); s.crown = false; }
  dropRibbon(s);
}
function cancelDraw(ws, g) { endDraw(ws, g); ws.sp.stage = 0; }
function stopDrawLook(ws, g) { if (ws.sp.drawing) cancelDraw(ws, g); }

const _dir = new THREE.Vector3(), _rgt = new THREE.Vector3(), _upc = new THREE.Vector3();
/** Looses the drawn arrow (fan: 分曦, the arrow split into five). */
function release(ws, g, { fan = false } = {}) {
  const s = ws.sp, B = ws.def.bow, vm = g.vm, cam = g.camera, own = mine(g, ws);
  const st = fan ? Math.max(1, s.drawing ? s.stage : 1) : s.stage;
  const spread = spreadNow(ws) * D2R;
  endDraw(ws, g);
  s.stage = 0;
  cam.getWorldDirection(_dir);
  _rgt.set(1, 0, 0).applyQuaternion(cam.quaternion); _upc.set(0, 1, 0).applyQuaternion(cam.quaternion);
  const from = vm?.socketApparent?.('muzzle', new THREE.Vector3());
  const dirs = [];
  if (fan) {
    const n = B.fan.n;
    for (let i = 0; i < n; i++) dirs.push(_dir.clone().applyAxisAngle(_upc, (i - (n - 1) / 2) / ((n - 1) / 2) * B.fan.deg * D2R));
  } else {
    const r = Math.abs(gauss()) * spread, a = R() * TAU;
    dirs.push(_dir.clone().addScaledVector(_rgt, Math.cos(a) * Math.tan(r)).addScaledVector(_upc, Math.sin(a) * Math.tan(r)).normalize());
  }
  for (const d of dirs) spawnArrow(ws, g, d, st, { mul: fan ? B.fan.mul : 1, fan, from: from?.clone() });
  ws.ammo = Math.max(0, ws.ammo - (fan ? B.fan.cost : 1));
  g.hud?.ammoChanged?.();
  s.regenWait = B.regen.delay; s.regenT = 0;
  s.nockT = B.renock; s.arrowOn = false; s.formU = 0;
  s.aimHold = 0.55;
  g.arsenal.sinceShot = 0;
  // ---- feel: punch, shake, FOV punch, haptic, sound (scaled by the stage)
  const kk = [0.45, 0.65, 0.9, 1.25][st] * (fan ? 1.15 : 1);
  g.punch?.impulse(-(0.05 + 0.055 * st) * (fan ? 1.3 : 1), (R() - 0.5) * 0.03, (R() - 0.5) * 0.05 * kk);
  g.addShake?.([0.03, 0.05, 0.12, 0.26][st] + (fan ? 0.06 : 0));
  if (st >= 2) g.arsenal?.fovKick?.(1 + st, 0.28);
  haptic([14, 20, 35, 55][st]);
  play(g, st >= 2 || fan ? 'releaseHeavy' : 'release', { volume: 0.7 + st * 0.1 });
  if (fan) play(g, 'split', { volume: 0.8 });
  if (st === 3) play(g, 'whiz', { volume: 0.8 });
  g.audio?.duckFor?.(0.25 + st * 0.12, 0.3);
  g.net?.onLocalFire?.(ws.def.id, cam.position, _dir, cam.position.clone().addScaledVector(_dir, 40));
  if (!own) return;
  // string snap + wobble, limbs spring back past rest (nockVel), the bow thrusts forward and rolls, the hand lets go
  s.nockVel = -(4 + st * 2.2); s.vib = 0.6 + st * 0.15; s.vibT = 0;
  vm.kick({ back: -0.012 * kk, up: -(2 + st * 1.5), side: 1.5 * kk, roll: 4 * kk });
  releaseFx(g, st);
  if (fan) fanFlare(g, B.fan.deg);
  handOff(g);
  if (st === 3) {
    vm.glowTo(2.4, 0.03); later(ws, 0.08, () => g.vm?.glowTo(1, 0.35));
    // 貫日 RADIAL 0.15 s (§2.30 放箭), the centre left clear
    if (clipComfort.overlay !== false) g.fx?.overlay?.radial?.(0.16, 0.15, { color: [1.3, 0.95, 0.5], r0: 0.45 });
  }
}
function gauss() { let u = 0, v = 0; while (u === 0) u = R(); while (v === 0) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); }

/**
 * Release follow-through: the draw hand springs off the string back and out to the lower right, fingers open, and is
 * out of the frame within ~0.17 s (it comes back up to the string with the next draw).
 */
function handOff(g) {
  const vm = g.vm, w = vm?.weapon;
  if (!w) return;
  const p = vm.socketCam('grip_r');
  if (!p) return;
  const q = vm.gunRoot.quaternion, G = vm.rightGrip;
  const F = G.F.clone().applyQuaternion(q), N = G.N.clone().applyQuaternion(q);
  // a short snap back off the string, then away under the bottom-right edge
  p.add(_a.set(0.05, -0.025, 0.07));
  vm.setAnchor('R', { pos: [p.x, p.y, p.z], F: [F.x, F.y, F.z], N: [N.x, N.y, N.z], pose: 'open', palm: G.palm }, 0.05);
  later2(g, 0.05, () => {
    const v = g.vm;
    if (!v?.weapon || v.anchors.R.name === 'grip_r' || v.clip.active) return;
    v.setAnchor('R', { pos: [0.3, -0.46, -0.16], F: [0.25, -0.35, -0.9], N: [-0.85, -0.2, -0.2], pose: 'open', palm: G.palm }, 0.13);
  });
}
/** The draw hand comes back to the string (the new arrow is on). */
function handToString(g, blend = 0.22) {
  const vm = g.vm;
  if (!vm?.weapon) return;
  vm.setAnchor('R', 'grip_r', blend);
  vm.arms?.setPose('R', 'thumbDraw', Math.max(0.1, blend * 0.8));
}

// ------------------------------------------------------------------------------------- arrows
function spawnArrow(ws, g, dir, stage, { mul = 1, fan = false, from = null } = {}) {
  const B = ws.def.bow, cam = g.camera;
  const a = { ws, pos: cam.position.clone(), vel: dir.clone().multiplyScalar(B.speed[stage]), grav: B.gravity[stage], stage, dmg: B.dmg[stage] * mul, pierce: B.pierce[stage],
    burn: B.burn[stage], knock: B.knock[stage], stagger: B.stagger[stage], hit: new Set(), t: 0, life: 4, fan, emp: false, vis: new THREE.Vector3(), mesh: arrowMesh(stage), trail: arrowTrail(g, stage, fan),
    kills: 0, killT: 0, tagged: false, lastKill: null };
  // seen from the bow: the visible arrow leaves the drawn arrow's point and merges into the true line within 0.3 s
  a.off = from ? from.sub(a.pos) : new THREE.Vector3(0, -0.1, 0);
  g.scene.add(a.mesh);
  place(a);
  // the trail starts at the bow (the first step is metres out at 150 m/s)
  a.start = a.vis.clone();
  a.trail.push(a.start);
  ws.sp.arrows.push(a);
  return a;
}
function place(a) {
  // the shooter sees it leave the bow and run into the crosshair line (an arrow down the line of sight is a dot)
  const u = Math.max(0, 1 - a.t / 0.3);
  a.vis.copy(a.pos).addScaledVector(a.off, u * u);
  a.mesh.position.copy(a.vis);
  a.mesh.lookAt(_e.copy(a.vis).sub(a.vel));
}
function endArrow(g, a) {
  a.trail.stop();
  if (a.mesh.parent && !a.stuck) a.mesh.removeFromParent();
  // 貫日: the line it burnt through the horde lingers (bow -> where it stopped)
  if (a.stage === 3 && g && (a.lastHit || a.stuck)) burnLine(g, a.start, a.stuck ? a.pos : a.lastHit);
}
/** A 貫日 arrow that killed 3+: one more beat at the last victim (gold flare, "貫 ×N", a heavier kill sting). */
function pierceBeat(g, a) {
  a.tagged = true;
  const p = a.lastKill || a.pos;
  const sys = pierceTag(g, p, a.kills);
  if (sys) { const w = { update: (dt) => { if (!sys.update(dt)) g.systems.splice(g.systems.indexOf(w), 1); } }; g.systems.push(w); }
  play(g, 'kill', { volume: 1, pitch: 0.85 });
  play(g, 'stage3', { volume: 0.7, pitch: 1.5 });
  play(g, 'ultImpact', { pos: p, volume: 0.5 });
  g.addShake?.(0.18);
  stop(g, 70);
  haptic(45);
}
/** distance from p to the segment o + d * [0, len] */
function segDist(p, o, d, len) { const t = Math.max(0, Math.min(len, _c.subVectors(p, o).dot(d))); return _c.copy(o).addScaledVector(d, t).distanceTo(p); }

function stepArrow(g, a, dt) {
  a.t += dt;
  const col = g.world?.collision, steps = Math.max(1, Math.ceil(a.vel.length() * dt / 0.6)), h = dt / steps;
  for (let i = 0; i < steps; i++) {
    a.vel.y -= a.grav * h;
    const v = a.vel.length(), len = v * h, dir = _d.copy(a.vel).divideScalar(v);
    if (!a.emp && SUNS.size) for (const s of SUNS) if (s.live && segDist(s.pos, a.pos, dir, len) < s.empower) empower(g, a, s, dir);
    const wh = col?.raycast(a.pos, dir, len + 0.05);
    const reach = wh ? wh.dist : len;
    if (g.targets) {
      for (const hit of g.targets.raycast(a.pos, dir, reach)) {
        const z = hit.target.zombie || hit.target;
        if (a.hit.has(z)) continue;
        a.hit.add(z);
        arrowHit(g, a, hit, dir);
        if (--a.pierce <= 0) { a.pos.copy(hit.point); stick(g, a, hit.point, dir, z); return false; }
      }
    }
    if (wh) { a.pos.copy(wh.point); worldHit(g, a, wh, dir); return false; }
    a.pos.addScaledVector(dir, len);
  }
  if (a.t > a.life || a.pos.y < -60) return false;
  place(a);
  a.trail.push(a.vis);
  arrowSpark(g, a.vis, _d.copy(a.vel).normalize(), a.stage, dt);
  return true;
}
/** 懸日: the arrow flew through a hanging sun: it is a 貫日 arrow now (damage, pierce, burn, no drop, white-hot). */
function empower(g, a, s, dir) {
  const B = a.ws.def.bow, m = a.fan ? B.fan.mul : 1;
  a.emp = true;
  if (a.stage < 3) {
    a.stage = 3; a.dmg = Math.max(a.dmg, B.dmg[3] * m); a.pierce = Math.max(a.pierce, B.pierce[3]); a.burn = B.burn[3]; a.knock = B.knock[3]; a.stagger = 1; a.grav = 0;
    a.vel.copy(dir).multiplyScalar(Math.max(a.vel.length(), B.speed[3]));
    a.trail.stop(); a.trail = arrowTrail(g, 3, a.fan);
    a.mesh.removeFromParent(); a.mesh = arrowMesh(3); g.scene.add(a.mesh);
  }
  s.flash?.();
  play(g, 'empower', { pos: s.pos, volume: 0.9 });
  g.fx?.sparkBurst?.(s.pos.clone(), { color: k3(COL.white, 0.6), color1: k3(COL.flame, 0.4), count: 14, speed: 7, glow: 0.8 });
}

function arrowHit(g, a, h, dir) {
  const ws = a.ws, B = ws.def.bow, ar = g.arsenal, z = h.target.zombie || h.target;
  const head = h.part === 'head', boss = !!z.def?.boss;
  const partMul = head ? (boss ? 2.5 : B.headMul) * (ar?.headMul ?? 1) : h.part === 'limb' ? 0.75 : h.part === 'weak' ? 2 : 1;
  const info = { amount: a.dmg * partMul * (ar?.dmgMul ?? 1), part: h.part, point: h.point, normal: h.normal, dir: dir.clone(), dist: h.dist, knock: a.knock * (ar?.knockMul ?? 1),
    stagger: a.stagger, weapon: ws.def.id, shooter: g.localId, headshot: head, sbArrow: a.stage, sbBurn: a.burn,
    // a 貫日 headshot can take the head off (the zombie's SEVER rules decide)
    box: a.stage === 3 && head ? h.box : undefined };
  const res = h.target.damage(info);
  g.hud?.onHit?.(info, res, h.target);
  if (ar?._special) ar._special(ws, 'onHit', info, res, h.target);
  impact(g, h.point, h.normal, dir, a.stage, true);
  const T = ws.sp.tally;
  T.hits++; T.stage = Math.max(T.stage, a.stage); T.at = h.point.clone(); a.lastHit = T.at;
  if (res?.killed) { T.kills++; a.kills++; a.killT = a.t; a.lastKill = (z.center ? z.center(new THREE.Vector3()) : h.point.clone()); }
  if (head) T.head = true;
}
function worldHit(g, a, wh, dir) {
  g.fx?.impact?.(wh.surf, wh.point, wh.normal, dir, { big: 0.7 + a.stage * 0.3 });
  impact(g, wh.point, wh.normal, dir, a.stage, false);
  play(g, 'hitWorld', { pos: wh.point, volume: 0.7 + a.stage * 0.1 });
  if (a.stage >= 2) play(g, 'ignite', { pos: wh.point, volume: 0.4 });
  g.noise?.(wh.point, 8);
  stick(g, a, wh.point, dir, null);
}
/** The arrow stays where it struck (a body: rides it; the world: 4 s); burning arrows keep burning for a while. */
function stick(g, a, p, dir, z) {
  a.trail.stop();
  const m = a.mesh;
  m.position.copy(p).addScaledVector(dir, -(0.69 - (z ? 0.16 : 0.1)));
  m.lookAt(_e.copy(m.position).sub(dir));
  a.stuck = true;
  if (z?.root && z.alive !== undefined) { m.updateMatrixWorld(); z.root.attach(m); }
  STUCK.push({ m, t: z ? 6 : 4, burn: a.stage >= 2 ? 1.6 : 0, z });
  while (STUCK.length > 24) STUCK.shift().m.removeFromParent();
}
function stuckTick(g, dt) {
  for (let i = STUCK.length - 1; i >= 0; i--) {
    const s = STUCK[i];
    s.t -= dt;
    if (s.burn > 0) { s.burn -= dt; if (R() < dt * 14) { s.m.getWorldPosition(_a); s.m.getWorldDirection(_b); lick(g, _a.addScaledVector(_b, -0.5), 0.6); } }
    if (s.t <= 0 || !s.m.parent || (s.z && s.z.root && !s.z.root.parent)) { s.m.removeFromParent(); STUCK.splice(i, 1); }
  }
}
/** The frame's weight from what our arrows did: hit-stop, shake and the kill sting (one per frame, not per arrow). */
function weigh(ws, g) {
  const T = ws.sp.tally;
  if (!T.hits) return;
  const st = T.stage, at = T.at;
  if (T.kills >= 2) { stop(g, 90); g.addShake?.(0.22); play(g, 'kill', { volume: 0.85 }); }
  else if (T.kills) { stop(g, st === 3 ? 90 : 60); g.addShake?.(st === 3 ? 0.14 : 0.08); play(g, 'kill', { volume: 0.7 }); }
  else if (st === 3) { stop(g, 60); g.addShake?.(0.1); play(g, 'pin', { pos: at, volume: 0.7 }); }
  else if (st === 2) stop(g, 30);
  play(g, 'hit', { pos: at, volume: 0.6 + st * 0.1 });
  if (st >= 2 && T.hits) play(g, 'ignite', { pos: at, volume: 0.35 });
  T.hits = 0; T.kills = 0; T.stage = 0; T.head = false; T.at = null;
}
function stop(g, ms) { if (clipComfort.hitstop !== false) g.hitStop?.(ms / 1000); }

// ------------------------------------------------------------------------------------- 日灼 burn, 貫日 pin
function addBurn(ws, z, n) {
  const B = ws.def.bow, s = ws.sp, b = s.burn.get(z);
  if (b) { b.n = Math.min(B.burnMax, b.n + n); b.t = B.burnDur; }
  else s.burn.set(z, { n: Math.min(B.burnMax, n), t: B.burnDur, acc: 0, lick: 0 });
}
function burnTick(ws, g, dt) {
  const s = ws.sp, B = ws.def.bow;
  for (const [z, b] of s.burn) {
    if (!z.alive) { s.burn.delete(z); continue; }
    b.t -= dt; b.acc += dt; b.lick -= dt;
    if (b.lick <= 0) { b.lick = 0.12 / b.n; lick(g, z.center ? z.center(_a).add(_b.set((R() - 0.5) * 0.3, (R() - 0.3) * 0.6, (R() - 0.5) * 0.3)) : z.pos, 0.8 + b.n * 0.15); }
    if (b.acc >= 0.5) {
      b.acc -= 0.5;
      const p = z.center ? z.center(new THREE.Vector3()) : z.pos.clone();
      const info = { amount: B.burnDps * b.n * 0.5 * (g.arsenal?.dmgMul ?? 1), part: 'body', point: p, dir: UPV.clone(), knock: 0, stagger: 0, weapon: ws.def.id, shooter: g.localId, burn: true, burnFx: 'featherburn', elem: 'fire', skill: 'sb_dot' };
      const res = z.damage(info);
      g.hud?.onHit?.(info, res, z);
      if (res?.killed) { s.burn.delete(z); killFx(ws, g, z, info); continue; }
    }
    if (b.t <= 0) s.burn.delete(z);
  }
}
function pin(ws, g, z, t) {
  if (z.brain || z.def?.boss) return;
  ws.sp.pins.set(z, t);
  const fy = z.pos?.y ?? 0;
  g.fx?.zfx?.ground?.add?.('shock', _a.set(z.pos.x, fy + 0.04, z.pos.z), { r: 0.15, r1: 0.9, life: 0.3, col: k3(COL.gold, 0.6), width: 0.1, ease: 0.4 });
}
function pinTick(ws, dt) {
  for (const [z, t] of ws.sp.pins) {
    if (!z.alive || t <= 0) { ws.sp.pins.delete(z); continue; }
    ws.sp.pins.set(z, t - dt);
    // held in its stagger (it ends when stateT passes 0.55) and stopped where it stands
    if (z.state === 'stagger' || z.state === 'chase' || z.state === 'attack') { z.state = 'stagger'; z.stateT = 0; }
    z.kvel?.set(0, z.kvel.y, 0);
  }
}
let _keAt = [];
function killFx(ws, g, z, info) {
  const now = g.time, p = info.point || z.center?.(new THREE.Vector3()) || z.pos;
  _keAt = _keAt.filter((t) => now - t < 1.2);
  // ≤ 3 full KE_SUNMARK at a time per player (§1.10); the rest of a multi-kill still flash and catch fire
  if (_keAt.length >= 3) {
    g.fx?.particles?.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.25, size: 0.5, size1: 0.9, color: [...k3(COL.sun, 0.45), 1], color1: [0, 0, 0, 0], frame: FRAME.glow });
    g.fx?.zfx?.status?.(z, 'burning', 1.2);
    return;
  }
  _keAt.push(now);
  sunMark(g, z, p, info.sbArrow === 3 || info.skill === 'sunbow_ult');
}
/**
 * 貫日 kill: the corpse is hurled along the arrow (9 m/s, a little lift); a wall within 3 m behind it pins it there
 * with a burning arrow through the chest a moment before it slumps (§2.30 擊殺把屍體沿箭路擊飛).
 */
const PINNED = [];
function hurl(g, z, info) {
  if (!z.kvel || z.def?.boss || z.brain) return;
  const d = _a.set(info.dir?.x ?? 0, 0, info.dir?.z ?? 0);
  if (d.lengthSq() < 1e-6) return;
  d.normalize();
  z.kvel.x = d.x * 9; z.kvel.z = d.z * 9; z.kvel.y = 3.4;
  const col = g.world?.collision, c = z.center ? z.center(new THREE.Vector3()) : z.pos.clone().add(_b.set(0, 1.2, 0));
  const wh = col?.raycast(c, d, 3.2);
  if (!wh || Math.abs(wh.normal?.y ?? 0) > 0.5 || wh.dist < 0.25) return;
  PINNED.push({ z, d: d.clone(), wall: wh.point.clone(), n: wh.normal.clone(), y: c.y, t: 0, hit: false, hold: 0, arrow: null });
}
function pinnedTick(g, dt) {
  for (let i = PINNED.length - 1; i >= 0; i--) {
    const p = PINNED[i], z = p.z;
    p.t += dt;
    if (!z.root?.parent || p.t > 8) { p.arrow?.removeFromParent(); if (p.hold > 0 && z.action) z.action.paused = false; PINNED.splice(i, 1); continue; }
    if (!p.hit) {
      // flying back: stop where the back meets the wall (feet ~0.3 m off it)
      const gap = (p.wall.x - z.pos.x) * p.d.x + (p.wall.z - z.pos.z) * p.d.z;
      if (gap < 0.32 || p.t > 0.6) {
        p.hit = true; p.hold = 1.9;
        z.kvel.set(0, 0, 0);
        z.pos.x = p.wall.x - p.d.x * 0.3; z.pos.z = p.wall.z - p.d.z * 0.3;
        if (z.action) z.action.paused = true;                        // nailed upright in its first recoil
        // the burning arrow through the chest into the wall
        const m = arrowMesh(3), at = _c.set(p.wall.x, Math.max(p.y, (z.pos.y ?? 0) + 1.15), p.wall.z);
        m.position.copy(at).addScaledVector(p.d, -0.5);
        m.lookAt(_e.copy(m.position).sub(p.d));
        g.scene.add(m); p.arrow = m;
        g.fx?.decals?.add(at, p.n, { frame: DECAL.scorch, size: 0.55, tint: DECAL_TINT.scorch, life: 7 });
        impact(g, at, p.n, p.d, 3, false);
        g.fx?.sparkBurst?.(at.clone(), { color: k3(COL.gold, 0.8), color1: k3(COL.verm, 0.3), count: 16, speed: 5, glow: 0.8, normal: p.n });
        play(g, 'pin', { pos: at, volume: 0.9 });
        play(g, 'hitWorld', { pos: at, volume: 0.8 });
      }
    } else if (p.hold > 0) {
      p.hold -= dt;
      z.kvel.set(0, 0, 0);
      if (p.arrow && R() < dt * 12) { p.arrow.getWorldPosition(_a); p.arrow.getWorldDirection(_b); lick(g, _a.addScaledVector(_b, -0.45), 0.7); }
      if (p.hold <= 0 && z.action) { z.action.paused = false; z.action.timeScale = 0.7; }   // ... then slumps down the wall
    } else if (p.arrow && R() < dt * 5) { p.arrow.getWorldPosition(_a); p.arrow.getWorldDirection(_b); lick(g, _a.addScaledVector(_b, -0.45), 0.5); }
  }
}

// ------------------------------------------------------------------------------------- viewmodel driver
function view(ws, g, dt) {
  const s = ws.sp, vm = g.vm, w = vm.weapon, B = ws.def.bow, ar = g.arsenal;
  const v = s.view || (s.view = { w: null, t: 0 });
  if (v.w !== w) {
    v.w = w; v.t = 0; s.nockV = 0; s.nockVel = 0; s.aimW = 0;
    w.onParts = (vm2) => stringHook(ws, vm2);
    prewarm(g);
  }
  v.t += dt;
  // 待機嗡鳴 (§1.12): a low ember hum ~26 dB under the release, 0.4 s fade-in, stopped in tick() when put away
  if (!s.snd.hum && g.audio?.has?.('sunbow_idle')) s.snd.hum = g.audio.play('sunbow_idle', { loop: true, volume: 0.18, fadeIn: 0.4 });
  // the draw hand rests out of view unless it is drawing, following through or a clip has it
  const aR = vm.anchors.R;
  if (!s.drawing && !vm.clip.active && aR.t >= 1 && s.aimHold <= 0.2 && (aR.name === 'grip_r' || typeof aR.name === 'object')) vm.setAnchor('R', 'rest', 0.3);
  // ---- base pose: undrawn (lowered, more cant) <-> aimed, by the draw (+ a short hold after the release)
  s.aimHold = Math.max(0, s.aimHold - dt);
  const want = s.drawing || s.aimHold > 0 ? 1 : 0;
  s.aimW += (want - s.aimW) * Math.min(1, dt * (want > s.aimW ? 9 : 2.6));
  const H = ws.def.vm.hip, Rp = ws.def.vm.rest || H, u = smooth(s.aimW);
  vm.hip.pos.set(lerp(Rp[0], H[0], u), lerp(Rp[1], H[1], u), lerp(Rp[2], H[2], u));
  vm.hip.rot.set(lerp(Rp[3], H[3], u) * D2R, lerp(Rp[4], H[4], u) * D2R, lerp(Rp[5], H[5], u) * D2R);
  // full draw held too long: the bow arm shakes
  if (s.drawing && s.stage === 3 && s.tireT > B.tire) { const k = Math.min(1, (s.tireT - B.tire) * 0.5); vm.hip.rot.x += Math.sin(v.t * 23) * 0.004 * k; vm.hip.rot.y += Math.sin(v.t * 17 + 1) * 0.004 * k; }
  // ---- string / limbs: the nock follows the draw; on release a stiff spring snaps it forward past rest and back
  if (s.drawing) {
    const tgt = drawCurve(B, s.drawT) + (s.stage === 3 ? 0.012 * Math.sin(v.t * 31) : 0);
    s.nockV += (tgt - s.nockV) * Math.min(1, dt * 18); s.nockVel = 0;
  } else {
    const acc = -900 * s.nockV - 26 * s.nockVel;
    s.nockVel += acc * dt; s.nockV += s.nockVel * dt;
    if (Math.abs(s.nockV) < 1e-4 && Math.abs(s.nockVel) < 1e-3) { s.nockV = 0; s.nockVel = 0; }
  }
  s.vib = Math.max(0, s.vib - dt * 3.2); s.vibT += dt;
  ps(vm, 'fx_nock').v = s.nockV;
  const lv = Math.max(-0.12, s.nockV);
  ps(vm, 'fx_limbU').v = lv; ps(vm, 'fx_limbL').v = lv;
  const full = s.drawing && s.stage === 3 ? 0.33 : 0;
  ps(vm, 'fx_earU').v = lv * (1 + full); ps(vm, 'fx_earL').v = lv * (1 + full);
  // ---- glow: the 日珠 spins faster with the draw; the arrow's silk lights with the draw, its head with the stage
  vm.setSpin('fx_sun', s.drawing ? 1 + s.stage * 1.6 : chargeState(ws, g)?.ready ? 2.2 : 1);
  const st = s.drawing ? s.stage : 0, flick = 0.85 + 0.15 * Math.sin(v.t * 19) * Math.sin(v.t * 7.3);
  vm._glowMat.glow_vermilion = [0.12, 0.35, 1.3, 2.4][st] * (st >= 2 ? flick : 1);
  vm._glowMat.glow_sun = 0.25 + 1.4 * clamp01(s.drawing ? s.nockV : 0) + (s.formU < 1 ? 1.2 * (1 - s.formU) : 0);
  vm._glowMat.crystal = (s.drawing ? 1 + s.stage * 0.22 : 1) * (0.9 + 0.1 * Math.sin(v.t * 3.8));
  // ---- first-person particles: the forming arrow, the burning head, idle embers off the 日珠
  if (s.arrowOn && s.formU < 1) formSparks(g, s.formU);
  // the draw build-up reads on the arrow itself: the shaft lights up nock -> head, heat gathers off the lit sun cores
  // into the head, the head grows into a sun (all of it left-below the crosshair)
  if (s.drawing && s.arrowOn) {
    drawRibbon(g, s, s.nockV, s.stage);
    gatherMotes(g, s.stage, ws.ammo, dt);
    headFire(g, s.stage, v.t, s.nockV);
  } else dropRibbon(s);
  if (!s.drawing && ar.sinceShot > 0.8 && (s.emberT -= dt) <= 0) { s.emberT = 0.45 + R() * 0.3; sunEmber(g); }
  // rare idle every 12 s of quiet: a thumb pluck on the string
  if (ar.state === 'idle' && !vm.clip.active && ar.sinceShot > 2 && !s.drawing) { if ((s.idleT += dt) >= 12) { s.idleT = 0; gunClip(g, ws, 'sunbow_idle_rare'); } } else s.idleT = 0;
  worldInspect(ws, g, dt);
}

/** Poses the procedural parts after the viewmodel has posed the GLB parts (before the hands are solved). */
function stringHook(ws, vm) {
  const s = ws.sp, w = vm.weapon, P = w.parts;
  if (!P.fx_nock) return;
  _n.copy(P.fx_nock.node.position);
  if (s.vib > 0.001) { const ph = s.vibT * TAU * 24; _n.x += Math.sin(ph) * s.vib * 0.008; _n.z += Math.sin(ph * 0.7 + 1) * s.vib * 0.005; }
  for (const [name, sock, down] of [['fx_strU', 'bridgeU', false], ['fx_strL', 'bridgeL', true]]) {
    const p = P[name], so = w.sockets[sock];
    if (!p || !so) continue;
    vm._socketGun(so, _b);
    _d.subVectors(_b, _n);
    const L = _d.length();
    p.node.position.copy(_n);
    p.node.quaternion.setFromUnitVectors(down ? DOWNV : UPV, _d.multiplyScalar(1 / Math.max(1e-6, L)));
    const th = 1 - 0.55 * clamp01(s.nockV);
    p.node.scale.set(th, L / (p.extras.len || 0.65), th);
  }
  // the arrow's nock on the string, its shaft passing the riser on the right (w = arrowW at s = 0)
  const ap = P.fx_arrow;
  if (ap) {
    const aw = w.meta.arrowW ?? 0.012, nz = Math.max(0.05, P.fx_nock.node.position.z);
    ap.node.position.set(0, 0, 0);
    ap.node.quaternion.setFromAxisAngle(UPV, -Math.atan2(aw, nz));
    ap.node.visible = s.arrowOn;
    ap.node.scale.set(1, 1, Math.max(0.02, smooth(s.formU)));
  }
  const hp = P.fx_head;
  if (hp) {
    hp.node.visible = s.formU > 0.88;
    const sw = s.drawing && s.stage === 3 ? 1.08 + 0.04 * Math.sin(vm.time * 14) : 1;
    hp.node.scale.setScalar(sw);
  }
  // 九陽: a sun core per loaded arrow
  const shown = vm.game?.time < s.rayUntil ? s.rayShow : ws.ammo;
  for (let i = 1; i <= 9; i++) { const r = P['fx_ray' + i]; if (r) r.node.visible = i > 9 - shown; }
}

/**
 * First equip (once a game), under the draw animation: the sigil design, the sun sprite textures, the arrow geometry,
 * and one tiny draw of everything the first 貫日 / 懸日 / 落九陽 would otherwise compile on the spot (sigil + pillar,
 * world and viewmodel ribbons, the explosion, ground rings / cracks, the radial / border / tint overlays).
 */
function prewarm(g) {
  if (g._sbWarm) return;
  g._sbWarm = true;
  const fx = g.fx;
  try {
    fx?.sigils?.preload?.(['flame']);
    const far = g.camera.position.clone().add(_a.set(0, -80, 0)), far2 = far.clone().add(_b.set(0, -1, 0));
    const o = new SunOrb(g.scene, far, 0.01);
    later2(g, 0.3, () => o.remove());
    const m = arrowMesh(3); m.position.copy(far); g.scene.add(m); later2(g, 0.3, () => m.removeFromParent());
    fx?.sigils?.sigil?.(far, { design: 'flame', radius: 0.05, intensity: 0, life: 0.2, color: k3(COL.gold, 0.1), color1: k3(COL.verm, 0.1) });
    fx?.sigils?.pillar?.(far, { radius: 0.01, height: 0.01, life: 0.2, motes: 0, ring: false, light: 0 });
    fx?.beam?.(far, far2, { core: [0.01, 0.01, 0.01], glow: [0, 0, 0], wCore: 0.001, wGlow: 0.001, life: 0.1 });
    fx?.beam?.(_c.set(0, -0.3, -0.5), _e.set(0, -0.3, -0.6), { vm: true, core: [0, 0, 0], glow: [0, 0, 0], wCore: 0.0001, wGlow: 0.0001, life: 0.1 });
    fx?.trail?.({ width: 0.001, life: 0.05, color: [0, 0, 0, 0] })?.push(far).push(far2).stop();
    fx?.explosion?.(far, { radius: 0.01, scale: 0.01 });
    fx?.zfx?.ground?.add?.('crack', far, { r: 0.01, life: 0.05, alpha: 0 });
    fx?.overlay?.radial?.(0.0005, 0.05, { r0: 0.9 });
    fx?.overlay?.tint?.([1, 1, 1], 0.0001, 0.05);
    fx?.overlay?.border?.([0, 0, 0], 0.0001, 0.05);
    warmTags();
  } catch (e) { console.warn('[sunbow] prewarm', e); }
}
function later(ws, sec, fn) { later2(ws.game, sec, fn); }
function later2(g, sec, fn) { let t = 0; const sys = { update: (dt) => { if ((t += dt) >= sec) { g.systems.splice(g.systems.indexOf(sys), 1); fn(); } } }; g.systems.push(sys); }
function gunClip(g, ws, id) { const ar = g.arsenal; if (ar?.current === ws && ar.state === 'idle') ar.playClip(id); }
/** Light runs up the nine sun cores (ready, stage 3, glint tier). */
function runRays(ws, g, dt = 0.045) { for (let i = 9; i >= 1; i--) later(ws, (9 - i) * dt, () => { if (mine(g, ws) && i > 9 - ws.ammo) rayGlint(g, i, 1); }); }
function sunFlare(g) {
  const vm = g.vm, P = g.fx?.particles, c = vm?.socketCam?.('sun', _a);
  if (!P || !c) return;
  const { f } = gunAxes(vm);
  P.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, life: 0.25, size: 0.03, size1: 0.09, color: [...k3(COL.gold, 0.4), 1], color1: [0, 0, 0, 0], frame: FRAME.glow });
  P.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, mode: 'flat', dir: [f.x, f.y, f.z], life: 0.3, size: 0.02, size1: 0.11, sizePow: 0.5, color: [...k3(COL.gold, 0.4), 1], color1: [0, 0, 0, 0], frame: FRAME.thinRing });
}
/** Rare inspect: a 2 cm sun rolls along the nine cores and hops back into the 日珠. */
function rollSun(ws, g, dur) {
  const n = 24;
  for (let i = 0; i <= n; i++) later(ws, (i / n) * dur, () => {
    const vm = g.vm, P = g.fx?.particles;
    const u = i / n, k = Math.min(8, Math.floor(u * 9)), a = vm?.socketCam?.('ray' + (9 - k), _a), b = vm?.socketCam?.('ray' + Math.max(1, 8 - k), _b);
    if (!P || !a || !b) return;
    const f = u * 9 - k, p = _c.lerpVectors(a, b, f);
    P.spawn({ additive: true, vm: true, x: p.x, y: p.y + 0.004 * Math.sin(f * Math.PI), z: p.z, life: 0.12, size: 0.012, size1: 0.008, color: [...k3(COL.white, 0.35), 1], color1: [...k3(COL.flame, 0.1), 0], frame: FRAME.glow });
    if (f < 0.15) rayGlint(g, 9 - k, 0.9);
  });
}
/** 改變世界的檢視 (§1.7.1 beat 11): own screen only, exposure x0.7, fog +30 %, 2.5 s. */
function worldInspect(ws, g, dt, stopNow = false) {
  const s = ws.sp, post = g.renderer?.post, fog = g.scene?.fog;
  const on = !stopNow && !!g.arsenal?._inspecting && g.arsenal.current === ws;
  if (on && !s.wc) s.wc = { t: 0, exp: post?.exposure ?? 1, fog: fog?.density ?? 0 };
  const wc = s.wc;
  if (!wc) return;
  wc.t += dt;
  if (!on && wc.t < 2.15) wc.t = 2.15;
  const e = smooth(wc.t / 0.35) * (1 - smooth((wc.t - 2.15) / 0.35));
  if (post) post.exposure = wc.exp * (1 - 0.3 * e);
  if (fog && wc.fog) fog.density = wc.fog * (1 + 0.3 * e);
  if (stopNow || wc.t >= 2.5) { if (post) post.exposure = wc.exp; if (fog && wc.fog) fog.density = wc.fog; if (!on || stopNow) s.wc = null; else wc.t = 2.5; }
}

// ------------------------------------------------------------------------------------- skills
// ◎ 分曦: the drawn arrow split into a fan (an undrawn bow snaps a quick 引 draw first). Teammates see five streaks.
registerSkill('sunbow_split', {
  level: 'L1', dur: 0.4,
  start(k) {
    const g = k.game;
    if (k.local && k.ws) {
      const ws = k.ws;
      if (!ws.sp.drawing && mine(g, ws)) g.arsenal?.playClip?.('sunbow_flick');
      release(ws, g, { fan: true });
      return;
    }
    const eye = k.caster(_a, _b), m = k.muzzle(_c), up = _e.set(0, 1, 0);
    for (let i = 0; i < 5; i++) {
      const d = _b.clone().applyAxisAngle(up, (i - 2) / 2 * (k.def.bow?.fan?.deg ?? 18) * D2R);
      g.fx?.glowTracer?.(m.clone(), eye.clone().addScaledVector(d, 30), { color: k3(COL.gold, 0.8), glow: k3(COL.verm, 0.3), width: 0.035, length: 3.5, speed: 110 });
    }
    play(g, 'split', { pos: eye, volume: 0.8 });
  },
});

// ★ 懸日: a quick shot that plants a small sun (world or a zombie) for 3.5 s, then bursts.
registerSkill('sunbow_hang', {
  level: 'L2', dur: 7, defaults: { speed: 60, gravity: 4, hang: 3.5, r: 3.5, dps: 45, pull: 7, pullSpeed: 1.2, empower: 1.2, burst: 320, burstR: 5, burstKnock: 7, aura: 5 },
  start(k) {
    const g = k.game, d = k.data;
    const eye = k.caster(_a, _b);
    d.pos = eye.clone(); d.vel = _b.clone().multiplyScalar(k.p.speed); d.vis = k.muzzle(new THREE.Vector3()); d.off = d.vis.clone().sub(d.pos); d.t = 0; d.phase = 'fly';
    d.mesh = arrowMesh(2); g.scene.add(d.mesh);
    d.trail = arrowTrail(g, 2);
    d.spiral = g.fx?.trail?.({ width: 0.04, life: 0.3, color: [...k3(COL.gold, 0.9), 1], color1: [...k3(COL.verm, 0.2), 0], taper: 0.2, segs: 18 });
    play(g, 'release', k.local ? { volume: 0.8 } : { pos: eye, volume: 0.8 });
    if (k.local && k.ws) {
      const ws = k.ws;
      if (ws.sp.drawing) cancelDraw(ws, g);
      ws.sp.busy = 0.45;
      if (mine(g, ws)) { g.arsenal?.playClip?.('sunbow_cast_tap'); releaseFx(g, 2); }
      g.punch?.impulse(-0.08, 0, 0.02);
    }
  },
  update(k, dt) {
    const g = k.game, d = k.data, p = k.p;
    d.t += dt;
    if (d.phase === 'fly') {
      const col = g.world?.collision;
      d.vel.y -= p.gravity * dt;
      const v = d.vel.length(), len = v * dt, dir = _d.copy(d.vel).divideScalar(v);
      const wh = col?.raycast(d.pos, dir, len + 0.05);
      const zh = k.local && g.targets ? g.targets.raycast(d.pos, dir, wh ? wh.dist : len)[0] : null;
      if (zh) land(k, zh.point, dir, zh.target.zombie || zh.target);
      else if (wh) land(k, wh.point.clone().addScaledVector(wh.normal, 0.5), dir, null, wh);
      else if (d.t > 3) land(k, d.pos.clone(), dir, null);
      else {
        d.pos.addScaledVector(dir, len);
        const u = Math.max(0, 1 - d.t / 0.12);
        const vis = _e.copy(d.pos).addScaledVector(d.off, u * u);
        d.mesh.position.copy(vis); d.mesh.lookAt(_c.copy(vis).sub(d.vel));
        d.trail.push(vis);
        const r = _c.set(1, 0, 0).applyAxisAngle(dir, d.t * 40).multiplyScalar(0.08);
        d.spiral?.push(vis.clone().add(r));
        arrowSpark(g, vis, dir, 2, dt);
      }
      return true;
    }
    // ---- the hanging sun
    const h = d.h;
    h.t += dt;
    if (h.z) { if (h.z.alive && h.z.center) h.z.center(h.pos); else h.z = null; }
    // a sun riding a zombie that reaches the caster stays where it was (it must not burst in the caster's face)
    if (h.z && h.pos.distanceTo(k.caster(_a, _b)) < 4) h.z = null;
    const grow = smooth(h.t / 0.3), end = p.hang;
    h.orb.group.position.copy(h.pos);
    // dimmed up close to this client's eye (to ~40 % under 3 m): the crosshair must not drown in it
    const dc = h.pos.distanceTo(g.camera.position), dim = dc < 6 ? 0.4 + 0.6 * smooth((dc - 1.5) / 4.5) : 1;
    h.orb.set(1.05 * grow * (1 + 0.08 * Math.sin(h.t * 6)) + (h.t > end - 0.35 ? (h.t - end + 0.35) * 0.9 : 0), dim * (1 + (h.flashT > 0 ? h.flashT * 4 : 0)));
    h.flashT = Math.max(0, (h.flashT || 0) - dt);
    h.orb.update(dt);
    h.entry.pos.copy(h.pos);
    // heat drawn in: motes spiralling into the sun; the flicker light
    const P = g.fx?.particles;
    if (P && R() < dt * 40) {
      const a = R() * TAU, rr = 1.8 + R() * 1.5, q = _c.set(h.pos.x + Math.cos(a) * rr, h.pos.y + (R() - 0.5) * 1.6, h.pos.z + Math.sin(a) * rr);
      P.spawn({ additive: true, x: q.x, y: q.y, z: q.z, vx: (h.pos.x - q.x) * 1.6, vy: (h.pos.y - q.y) * 1.6, vz: (h.pos.z - q.z) * 1.6, life: 0.6, size: 0.05, size1: 0.01, color: [...k3(COL.gold, 0.6), 1], color1: [...k3(COL.verm, 0.2), 0], frame: FRAME.spark, stretch: 0.05 });
    }
    if ((h.lt -= dt) <= 0) { h.lt = 0.1; g.fx?.lights?.flash?.(h.pos, 0xffa040, 24 * grow, 9, 0.12); }
    if (k.local) {
      // burn within r (45/s, every 0.25 s) + 日灼 (onHit); the horde pulled towards the sun
      if ((h.acc += dt) >= 0.5) { h.acc -= 0.5; k.hurt(h.pos, p.r, p.dps * 0.5, { knock: 0, stagger: 0.15, falloffMin: 1, explosive: false }); }
      for (const z of g.targets?.inRadius?.(h.pos, p.pull) || []) {
        if (z.def?.boss || !z.kvel) continue;
        const dx = h.pos.x - z.pos.x, dz = h.pos.z - z.pos.z, L = Math.hypot(dx, dz);
        if (L > 0.6) { z.kvel.x += dx / L * p.pullSpeed * 7 * dt; z.kvel.z += dz / L * p.pullSpeed * 7 * dt; }
      }
    }
    if (h.t >= end) { burst(k); return false; }
    return true;
  },
  end(k) {
    const d = k.data;
    d.trail?.stop(); d.spiral?.stop?.(); d.mesh?.removeFromParent();
    if (d.h) { d.h.orb.remove(); d.h.sig?.stop?.(); SUNS.delete(d.h.entry); d.h.loop?.stop?.(0.2); }
  },
});
function land(k, at, dir, z, wh = null) {
  const g = k.game, d = k.data, p = k.p;
  d.phase = 'hang';
  d.trail.stop(); d.spiral?.stop?.();
  if (wh) { g.fx?.impact?.(wh.surf, wh.point, wh.normal, dir, { big: 1.2 }); d.mesh.position.copy(wh.point).addScaledVector(dir, -0.55); }
  else d.mesh.removeFromParent();
  const pos = at.clone();
  const orb = new SunOrb(g.scene, pos, 0.05);
  const entry = { pos: pos.clone(), empower: p.empower, live: true, flash: () => { d.h.flashT = 0.12; } };
  SUNS.add(entry);
  const fy = k.floorY(pos);
  const sig = g.fx?.sigils?.sigil?.(_a.set(pos.x, fy + 0.03, pos.z), { design: 'flame', radius: p.r, color: k3(COL.gold, 0.5), color1: k3(COL.verm, 0.4), life: p.hang + 0.2, seed: k.ev.seed, intensity: 0.7 });
  d.h = { pos, orb, entry, sig, t: 0, acc: 0, lt: 0, z: z || null, flashT: 0.2 };
  d.h.loop = play(g, 'hangLoop', { pos, loop: true, volume: 0.7 });
  play(g, 'hang', { pos, volume: 1 });
  g.fx?.sparkBurst?.(pos.clone(), { color: k3(COL.white, 0.6), color1: k3(COL.flame, 0.4), count: 24, speed: 8, glow: 1 });
  g.fx?.lights?.flash?.(pos, 0xffc070, 60, 10, 0.25);
  // 曦照: teammates (and the caster) within reach deal +15 % while it burns (each client applies it to its own player)
  addAura(g, { type: 'dmg', mul: k.def.premium?.aura?.mul ?? 1.15, radius: p.aura, pos, dur: p.hang, by: k.by });
}
function burst(k) {
  const g = k.game, h = k.data.h, p = k.p;
  h.entry.live = false;
  const c = h.pos.clone(), fy = k.floorY(c), dc = c.distanceTo(g.camera.position);
  g.fx?.explosion?.(c, { radius: p.burstR * 0.7, scale: dc < 5 ? 0.45 : 0.75 });
  g.fx?.zfx?.quake?.(_a.set(c.x, fy, c.z), p.burstR, { col: k3(COL.flame, 0.6), scale: 0.8 });
  g.fx?.sparkBurst?.(c.clone(), { color: k3(COL.white, 0.7), color1: k3(COL.flame, 0.5), count: 40, speed: 12, glow: 1.4 });
  g.fx?.motes?.burst?.('ember', c, 18, { seed: k.ev.seed, speed: 4 });
  play(g, 'hangBurst', { pos: c, volume: 1 });
  if (k.local) {
    k.hurt(c, p.burstR, p.burst, { knock: p.burstKnock, stagger: 1 });
    const d = c.distanceTo(g.camera.position);
    g.addShake?.(Math.max(0, 0.35 - d / 40));
  }
}

// ★ held 落九陽: sigil, nine suns 22 m up, shot down one by one onto the crosshair point.
registerSkill('sunbow_ult', {
  level: 'L3', aim: 'target', dur: 4.6, defaults: { range: 35, ring: 4.5, dmg: 240, r: 3.5, knock: 5, final: 650, finalR: 6.5, finalKnock: 10, every: 0.22 },
  start(k) {
    const g = k.game, d = k.data, c = k.at.clone();
    d.c = c; d.beat = 0; d.suns = []; d.next = 0;
    const L4 = k.local && k.level >= 3;
    if (k.local) {
      g.hud?.card?.(k.cardText(), { color: k.hex.rim, sub: k.def.en });
      if (k.ws) { const ws = k.ws; if (ws.sp.drawing) cancelDraw(ws, g); ws.sp.busy = 1.1; if (mine(g, ws)) g.arsenal?.playClip?.('sunbow_cast_ult'); }
      g.arsenal?.fovKick?.(3, 0.5);
      // L4 warm tint + border, kept light: the street has to stay readable under nine suns
      if (L4 && clipComfort.overlay !== false) { d.border = g.fx?.overlay?.border?.([1.6, 0.8, 0.25], 0.08, 4.2); g.fx?.overlay?.tint?.([1.4, 0.8, 0.35], 0.035, 1.0); }
    }
    play(g, 'ultRaise', k.local ? { volume: 1 } : { pos: c, volume: 1 });
    // the arrow shot at the sky
    const m = k.muzzle(_a);
    g.fx?.beam?.(m.clone(), m.clone().add(_b.set(0, 40, 0)), { core: k3(COL.gold, 0.8), glow: k3(COL.flame, 0.35), wCore: 0.025, wGlow: 0.14, life: 0.5, shrink: 0.6, wStart: 0.3, ramp: 3 });
  },
  update(k, dt) {
    const g = k.game, d = k.data, p = k.p, t = k.t, c = d.c, fx = g.fx;
    if (d.beat < 1 && t >= 0.3) {
      d.beat = 1;
      d.sig = fx?.sigils?.sigil?.(_a.set(c.x, c.y + 0.04, c.z), { design: 'flame', radius: p.ring + 2.5, color: k3(COL.gold, 0.42), color1: k3(COL.verm, 0.38), intensity: 0.75, life: 4.0, seed: k.ev.seed });
    }
    if (d.beat < 2 && t >= 0.35) {
      d.beat = 2;
      // the nine suns stand as a wheel in the sky beyond the target, facing the caster, sized and lifted by the range so
      // the wheel fills the top third of the caster's view (eight round the rim, the ninth and biggest in the hub)
      const eye = k.caster(_a, _b).clone(), fl = _c.set(c.x - eye.x, 0, c.z - eye.z);
      const D = Math.max(4, fl.length());
      fl.multiplyScalar(1 / Math.max(1e-3, fl.length()));
      const fov = ((k.local ? g.camera.fov : 0) || 72) * D2R, Dw = D + 6;
      const e0 = Math.atan2(c.y - eye.y, D), eC = e0 + 0.32 * fov, Rw = Dw * Math.tan(0.14 * fov);
      const W = new THREE.Vector3(eye.x + fl.x * Dw, eye.y + Dw * Math.tan(eC), eye.z + fl.z * Dw);
      W.y = Math.max(c.y + Rw + 2.5, Math.min(c.y + 34, W.y));
      const side = new THREE.Vector3(fl.z, 0, -fl.x);
      const a0 = Math.PI / 2;
      for (let i = 0; i < 9; i++) {
        const last = i === 8, a = a0 + i / 8 * TAU;
        const sky = last ? W.clone() : W.clone().addScaledVector(side, Math.cos(a) * Rw).add(_e.set(0, Math.sin(a) * Rw, 0));
        // each falls onto the ring round the target on its own side (the wheel's top -> the far side)
        const hx = side.x * Math.cos(a) + fl.x * Math.sin(a), hz = side.z * Math.cos(a) + fl.z * Math.sin(a);
        const hit = last ? c.clone() : new THREE.Vector3(c.x + hx * p.ring, c.y, c.z + hz * p.ring);
        hit.y = k.floorY(hit);
        d.suns.push({ sky, hit, orb: new SunOrb(g.scene, sky, 0.01, { glow: 1.2 }), born: 0.35 + i * 0.05, size: (last ? 0.62 : 0.34) * Rw, fall: -1, done: false, last, trail: null });
      }
      d.Rw = Rw;
      play(g, 'ultShot', { pos: c, volume: 0.7 });
    }
    for (let i = 0; i < d.suns.length; i++) {
      const s = d.suns[i];
      if (s.done) continue;
      const shotAt = s.last ? 0.9 + 8 * p.every + 0.3 : 0.9 + i * p.every;
      const fallDur = s.last ? 0.45 : 0.36;
      if (s.fall < 0) {
        s.orb.set(s.size * smooth((t - s.born) / 0.3) * (1 + 0.05 * Math.sin(t * 5 + i)), 1);
        if (t >= shotAt) {
          s.fall = 0;
          // a golden arrow strikes it out of the sky
          const m = k.muzzle(_a);
          fx?.beam?.(m.clone(), s.sky.clone(), { core: k3(COL.white, 0.7), glow: k3(COL.gold, 0.35), wCore: 0.02, wGlow: 0.14, life: 0.18, shrink: 0.5 });
          fx?.sparkBurst?.(s.sky.clone(), { color: k3(COL.white, 0.8), color1: k3(COL.flame, 0.5), count: 18, speed: 10, glow: 1.2 });
          play(g, 'ultShot', { pos: s.sky, volume: 0.6 });
          play(g, 'ultFall', { pos: s.hit, volume: 0.6, delay: 0.05 });
          s.trail = fx?.trail?.({ width: s.size * 1.1, life: 0.45, color: [...k3(COL.flame, 0.7), 1], color1: [...k3(COL.verm, 0.12), 0], taper: 0.25, segs: 24 });
          s.trail2 = fx?.trail?.({ width: s.size * 0.38, life: 0.3, color: [...k3(COL.white, 0.8), 1], color1: [...k3(COL.gold, 0.2), 0], taper: 0.2, segs: 18, profile: 'beam' });
        }
      } else {
        s.fall += dt / fallDur;
        const u = Math.min(1, s.fall), e = u * u;
        const pos = _b.lerpVectors(s.sky, s.hit, e);
        pos.y += (1 - u) * u * 3;
        s.orb.group.position.copy(pos); s.orb.set(s.size * (1 - 0.25 * u), 1.2);
        s.trail?.push(pos); s.trail2?.push(pos);
        if (R() < 0.8) fx?.particles?.spawn?.({ additive: true, x: pos.x, y: pos.y, z: pos.z, vx: (R() - 0.5) * 3, vy: (R() - 0.5) * 3, vz: (R() - 0.5) * 3, life: 0.5, size: 0.4, size1: 0.1, color: [...k3(COL.flame, 0.5), 1], color1: [...k3(COL.verm, 0.1), 0], frame: FRAME.glow });
        if (R() < 0.7) fx?.particles?.spawn?.({ additive: true, x: pos.x, y: pos.y, z: pos.z, vx: (R() - 0.5) * 2, vy: 1 + R() * 2, vz: (R() - 0.5) * 2, life: 0.6 + R() * 0.4, size: 0.05, size1: 0.01, color: [...k3(COL.gold, 0.8), 1], color1: [...k3(COL.verm, 0.2), 0], frame: FRAME.spark, stretch: 0.05, gravity: 6 });
        if (u >= 1) { s.done = true; strike(k, s); }
      }
      s.orb.update(dt);
    }
    // ⑤ exit: ash and embers rise off the scorched ring
    if (d.beat < 3 && t >= 0.9 + 8 * p.every + 0.3 + 0.6) {
      d.beat = 3;
      fx?.motes?.burst?.('ember', _a.set(c.x, c.y + 1.2, c.z), 30, { seed: k.ev.seed, speed: 3, radius: p.ring });
      play(g, 'hangBurst', { pos: c, volume: 0.4, pitch: 0.7 });
    }
  },
  end(k) { for (const s of k.data.suns || []) { s.orb.remove(); s.trail?.stop(); s.trail2?.stop(); } k.data.sig?.stop?.(); k.data.border?.stop?.(0.4); },
});
function strike(k, s) {
  const g = k.game, fx = g.fx, p = k.p, h = s.hit;
  s.orb.remove(); s.trail?.stop(); s.trail2?.stop();
  const r = s.last ? p.finalR : p.r, dmg = s.last ? p.final : p.dmg;
  // a sun hitting the street, not a grenade: white-gold flash, corona ring, flame petals, ember fountain, cracks
  // (glare eased off when it lands right in front of this client's eye)
  const near = h.distanceTo(g.camera.position);
  sunImpact(g, h, r, s.last, near < 6 ? 0.45 + 0.55 * near / 6 : 1);
  if (s.last) {
    fx?.zfx?.quake?.(h, r * 1.1, { col: k3(COL.flame, 0.6), scale: 1.2, crack: false });
    fireWave(g, h, p.finalR);
    fx?.sigils?.pillar?.(h, { radius: 1.8, height: 16, color: k3(COL.gold, 0.8), color1: k3(COL.verm, 0.6), life: 0.5 });
    fx?.motes?.burst?.('ember', _a.copy(h).add(_b.set(0, 1, 0)), 40, { seed: k.ev.seed + 9, speed: 7, radius: 2 });
  }
  rubble(g, h, s.last ? 18 : 9, s.last ? 9 : 6);
  play(k.game, s.last ? 'ultFinal' : 'ultImpact', { pos: h, volume: 1 });
  if (k.local) {
    k.hurt(h, r, dmg, { knock: s.last ? p.finalKnock : p.knock, stagger: 1, falloffMin: s.last ? 0.4 : 0.5 });
    const d = h.distanceTo(g.camera.position), near = Math.max(0, 1 - d / 40);
    g.addShake?.((s.last ? 0.55 : 0.12) * (0.4 + 0.6 * near));
    stop(g, s.last ? 110 : 40);
    if (s.last && clipComfort.overlay !== false) g.fx?.overlay?.radial?.(0.8, 0.3, { color: [1.6, 1.0, 0.45], r0: 0.34 });
    haptic(s.last ? 60 : 25);
  }
}

// crisis 扶桑甲: gold 扶桑 leaves and red lacquer chips burst off the player (crisis.js does the blocking)
registerSkill('sunbow_crisis', {
  level: 'L1', dur: 0.6,
  start(k) {
    const g = k.game, c = k.feet(_a).add(_b.set(0, 1.1, 0)), P = g.fx?.particles;
    g.fx?.motes?.burst?.('goldpaper', c, 16, { seed: k.ev.seed, speed: 5, spread: 1 });
    g.fx?.motes?.burst?.('ember', c, 14, { seed: k.ev.seed + 3, speed: 4 });
    g.fx?.shockwave?.(k.feet(_c).add(_b.set(0, 0.06, 0)), { normal: UPV, r0: 0.3, r1: 4.2, life: 0.4, color: k3(COL.gold, 0.8), thin: true });
    for (let i = 0; i < 12 && P; i++) {
      const a = i / 12 * TAU;
      P.spawn({ x: c.x, y: c.y, z: c.z, vx: Math.cos(a) * 5, vy: 1 + R() * 2, vz: Math.sin(a) * 5, life: 0.9, size: 0.05, color: [0.55, 0.06, 0.08, 1], color1: [0.4, 0.05, 0.05, 1], frame: FRAME.shard, gravity: 9.8, spin: (R() - 0.5) * 16, collide: true, bounce: 0.3, lit: true });
    }
    play(g, 'crisis', k.local ? { volume: 1 } : { pos: c, volume: 1 });
  },
});

// ------------------------------------------------------------------------------------- clips
// The bow turns about the bow hand (grip_l). Positions m, rotations deg (x pitch, y yaw, z roll), relative to the base
// pose (undrawn unless the clip runs during a draw). fx_nock tracks max() with the live draw.
const Z3 = [0, 0, 0];
const S = (o) => ['sb', o];
// normal draw (def.premium.drawClip): the stock heavy draw motion with the bow's own 弓臂低響 instead of the gun foley
registerClip('sunbow_drawn', () => ({ ...drawClip(true), events: [[0.05, 'snd', 'sunbow_draw']] }));
// 首次登場 1.6 s: the bow swings up from the lower right, lies flat a moment (the lacquer catches the light), stands
// up; the nine suns light from the bottom, the 日珠 flares, the thumb plucks the string, freeze, the 射日 sting
registerClip('sunbow_first', {
  duration: 1.6,
  tracks: {
    gunPos: [[0, [0.12, -0.26, 0.08]], [0.22, [0.02, 0.02, 0.04], 'out3'], [0.42, [0.01, 0.035, 0.05]], [0.6, [0, 0.01, 0.01], 'inOut'], [0.86, [0, 0.004, 0]], [1, Z3]],
    gunRot: [[0, [-24, -30, -78]], [0.22, [6, 10, -52], 'out3'], [0.42, [8, 14, -48]], [0.6, [2, 2, -4], 'inOut'], [0.86, [0.5, 0.5, -1]], [1, Z3]],
    fx_nock: [[0, 0], [0.66, 0], [0.71, 0.09, 'out3'], [0.73, 0, 'snap'], [1, 0]],
    env: [[0, 0], [0.25, 1], [0.8, 1], [1, 0]],
  },
  events: [[0, 'anchorR', ['rest', 0.05]], [0, S({ show: 0, hold: 1.5 })], [0.02, S({ snd: 'first', vol: 0.9 })], [0.2, 'haptic', 'tick'], [0.04, 'glow', { to: 0.2, sec: 0 }],
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n, i) => [0.27 + i * 0.03, S({ show: n, hold: 1.4 - i * 0.05 })]),
    [0.27, S({ snd: 'regen', vol: 0.4 })], [0.55, S({ sun: 2.2 })], [0.55, 'glow', { to: 1, sec: 0.5 }], [0.56, 'haptic', 'tick'],
    [0.6, 'anchorR', ['grip_r', 0.14]], [0.63, 'poseR', 'thumbDraw'], [0.71, S({ pluck: 1.4 })], [0.86, S({ snd: 'pluck', vol: 0.5 })], [0.86, 'haptic', 'tick'], [0.9, 'anchorR', ['rest', 0.25]]],
});
// ready reminder (落陽 full, every 2.5 s): the bow gives a shiver, light runs up the nine suns, the 日珠 flares
registerClip('sunbow_ready', { duration: 0.8, tracks: { gunRot: [[0, Z3], [0.15, [-1.2, 0, 1.5], 'out3'], [0.3, [0.6, 0, -0.8]], [0.5, Z3]] },
  events: [[0.05, S({ rays: 'run', dt: 0.035 })], [0.3, S({ sun: 1.8 })], [0.3, 'glow', { to: 1.6, sec: 0.06 }], [0.55, 'glow', { to: 1, sec: 0.3 }]] });
// 34-99 % idle tier (every 7 s): light runs up the suns, nothing moves
registerClip('sunbow_glint', { duration: 0.6, tracks: {}, events: [[0, S({ rays: 'run', dt: 0.05 })]] });
// rare idle: the thumb plucks the string; gold dust
registerClip('sunbow_idle_rare', { duration: 1.0, tracks: { fx_nock: [[0, 0], [0.18, 0.07, 'out3'], [0.22, 0, 'snap'], [1, 0]], gunRot: [[0, Z3], [0.24, [0.8, 0, -1]], [0.5, Z3]] },
  events: [[0.22, S({ pluck: 1 })]] });
// ★ 懸日 cast: a quick half draw and loose
registerClip('sunbow_cast_tap', { duration: 0.5, tracks: { fx_nock: [[0, 0.3], [0.4, 0, 'out3'], [1, 0]], gunRot: [[0, [2, 0, 0]], [0.15, [-4, 0, 2], 'out3'], [1, Z3]] }, events: [[0.02, 'haptic', 'tick']] });
// ◎ 分曦 from an undrawn bow: a flick of the string
registerClip('sunbow_flick', { duration: 0.4, tracks: { gunRot: [[0, Z3], [0.12, [-3, -4, 3], 'out3'], [1, Z3]] }, events: [] });
// ★ held 落九陽: the bow raised to the sky, an arrow loosed straight up, back down as the suns ignite
registerClip('sunbow_cast_ult', { duration: 1.2, tracks: {
  gunPos: [[0, Z3], [0.2, [0.03, 0.08, 0.05], 'out3'], [0.55, [0.03, 0.085, 0.05]], [1, Z3, 'inOut']],
  gunRot: [[0, Z3], [0.2, [48, -6, -10], 'out3'], [0.55, [50, -6, -10]], [1, Z3, 'inOut']],
  fx_nock: [[0, 0], [0.18, 0.75, 'out3'], [0.26, 0.75], [0.29, 0, 'snap'], [1, 0]] },
  events: [[0.15, 'haptic', 'tick'], [0.28, S({ snd: 'releaseHeavy', vol: 0.9 })], [0.28, S({ rays: 'all' })], [0.28, 'shake', 0.12], [0.3, S({ sun: 2.4 })]] });

// 續陽 reload 1.0 s: the bow turns a little towards the eye, the hand leaves the string and strokes up the riser past
// the nine cores (they relight one by one: the cores are what a reload shows, §1.7.1), back to the string
function rekindle(rare) {
  const tracks = {
    // the riser comes down and in towards the middle-bottom, upright: the stroking hand works low, its forearm under the
    // centre of the screen
    gunPos: [[0, Z3], [0.16, [0.15, -0.11, 0.07]], [0.8, [0.15, -0.105, 0.07]], [1, Z3]],
    gunRot: [[0, Z3], [0.16, [-6, 16, -6]], [0.8, [-5, 18, -5]], [1, Z3]],
  };
  const events = [[0, 'glow', { u: 'pCharge', to: 0.2, sec: 0.15 }], [0.04, 'anchorR', [{ pos: [-0.05, -0.12, -0.38], F: [-0.2, 0.6, -0.7], N: [-0.8, 0.1, 0.4], pose: 'palm' }, 0.14]]];
  if (rare) {
    // §2.25: no stroke -- a breath on the 日珠 and all nine light at once
    events.push([0.2, 'anchorR', ['sun', 0.18]], [0.24, 'poseR', 'palm'], [0.45, S({ snd: 'rekindle', vol: 0.6 })], [0.5, S({ rays: 'all' })], [0.5, S({ sun: 2.4 })], [0.5, 'haptic', 'tick']);
    for (let i = 9; i >= 1; i--) events.push([0.5, S({ relight: i })]);
  } else {
    const order = [9, 8, 7, 6, 5, 4, 3, 2, 1];
    order.forEach((n, i) => { events.push([0.2 + i * 0.055, 'anchorR', ['ray' + n, 0.06]], [0.22 + i * 0.055, S({ relight: n })]); });
    events.push([0.2, 'poseR', 'palm'], [0.18, S({ snd: 'rekindle', vol: 0.7 })]);
  }
  events.push([0.8, 'ammo'], [0.8, 'glow', { u: 'pCharge', to: 1, sec: 0.3 }], [0.84, 'anchorR', ['rest', 0.2]], [0.86, 'haptic', 'tick']);
  return { duration: rare ? 1.15 : 1.0, tracks, events, extra: rare ? 0.15 : 0 };
}
registerClip('sunbow_rekindle', () => rekindle(false));
registerClip('sunbow_rekindle_rare', () => rekindle(true));

// inspect 4.6 s (hold loops 0.04-0.16): CS2 slow tilt so the lacquer and horn take the light -> the thumb strokes up
// the riser, the cores flare as it passes -> the bow rolls to show its back (gold-leaf clouds) -> upright, a pluck,
// the 日珠 flashes, freeze
function inspect(rare) {
  const tracks = {
    // first beat further right (the 日珠 whole in frame); the stroke beat low and upright (the forearm stays under the
    // centre of the screen)
    gunPos: [[0, Z3], [0.04, [0.12, 0.05, 0.08]], [0.1, [0.125, 0.055, 0.085]], [0.16, [0.12, 0.05, 0.08]], [0.22, [0.15, -0.11, 0.08], 'inOut'], [0.48, [0.15, -0.105, 0.08]],
      [0.58, [0.02, 0.06, 0.06], 'inOut'], [0.72, [0.02, 0.06, 0.06]], [0.82, [0.01, 0.02, 0.02], 'inOut'], [0.96, [0.01, 0.02, 0.02]], [1, Z3]],
    gunRot: [[0, Z3], [0.04, [8, 26, 40]], [0.1, [10, 32, 46]], [0.16, [8, 26, 40]], [0.22, [-5, 20, -5], 'inOut'], [0.48, [-4, 22, -6]],
      [0.58, [4, -140, 12], 'inOut'], [0.72, [6, -150, 14]], [0.82, [2, 8, -4], 'inOut'], [0.96, [1, 6, -3]], [1, Z3]],
    env: [[0, 0], [0.05, 1], [0.95, 1], [1, 0]],
  };
  const events = [[0.02, S({ snd: 'inspect', vol: 0.7 })], [0.03, 'snd', 'cloth'], [0.2, 'anchorR', [{ pos: [-0.04, -0.13, -0.36], F: [-0.2, 0.6, -0.7], N: [-0.8, 0.1, 0.4], pose: 'palm' }, 0.18]]];
  if (rare) events.push([0.22, S({ pluck: 1.2 })], [0.25, S({ roll: 1.1 })], [0.25, 'haptic', 'tick']);
  else [9, 8, 7, 6, 5, 4, 3, 2, 1].forEach((n, i) => { events.push([0.24 + i * 0.024, 'anchorR', ['ray' + n, 0.08]], [0.25 + i * 0.024, S({ glint: n })]); });
  events.push([0.48, S({ sun: 1.8 })], [0.5, 'anchorR', ['rest', 0.25]], [0.56, 'snd', 'cloth'], [0.78, 'anchorR', ['grip_r', 0.2]], [0.8, 'poseR', 'thumbDraw'],
    [0.86, S({ pluck: 1.1 })], [0.93, 'anchorR', ['rest', 0.25]], [0.88, S({ sun: 2.2 })], [0.88, 'haptic', 'tick']);
  return { duration: 4.6, loop: rare ? [0.02, 0.12] : [0.04, 0.16], tracks, events };
}
registerClip('sunbow_inspect', () => inspect(false));
registerClip('sunbow_inspect_rare', () => inspect(true));

// ------------------------------------------------------------------------------------- crosshair (§1.9 #2)
// xh_sunbow: a thin bow-shaped arc open at the bottom, three inward chevrons that close in with the draw (the gap is
// the draw's spread), a small inner ring that snaps shut at 貫日, and the nine arrows as dots under the opening
// (filled = loaded). Stroke only; the chevrons take the hit colour; ready = the shared 4 nodes.
const arcD = (r, a0, a1) => { const p = (a) => `${(Math.sin(a) * r).toFixed(2)} ${(-Math.cos(a) * r).toFixed(2)}`; return `M${p(a0)} A${r} ${r} 0 ${Math.abs(a1 - a0) > Math.PI ? 1 : 0} 1 ${p(a1)}`; };
registerCrosshair('xh_sunbow', {
  state: () => `${XS.drawing ? XS.stage : -1}|${XS.ammo}`,
  draw(gap, c, s, c2) {
    const Rr = 9 + gap * 0.62, drawn = XS.drawing, st = XS.stage;
    let o = `<path d="${arcD(Rr + 4, -125 * D2R, 125 * D2R)}" fill="none" stroke="${c}" stroke-width="1.2" opacity="0.85"/>`;
    for (const a of [-90, 0, 90]) {
      const r = Rr, ar = a * D2R, ux = Math.sin(ar), uy = -Math.cos(ar), nx = -uy, ny = ux, L = 3.4;
      const P = (s1, o1) => `${(ux * s1 + nx * o1).toFixed(2)} ${(uy * s1 + ny * o1).toFixed(2)}`;
      o += `<path class="a" d="M${P(r + L, -L * 0.8)} L${P(r, 0)} L${P(r + L, L * 0.8)}" fill="none" stroke="${c}" stroke-width="1.5" stroke-linejoin="round"/>`;
    }
    if (drawn && st >= 1) for (let i = 0; i < st; i++) { const a = (-12 + i * 12) * D2R; o += `<circle cx="${(Math.sin(a) * (Rr + 7.5)).toFixed(2)}" cy="${(-Math.cos(a) * (Rr + 7.5)).toFixed(2)}" r="1.3" fill="${c2}"/>`; }
    if (drawn && st === 3) o += `<circle r="5" fill="none" stroke="${c2}" stroke-width="1.3"/>`;
    for (let i = 0; i < 9; i++) {
      const a = (180 + (i - 4) * 7.5) * D2R, x = Math.sin(a) * (Rr + 10), y = -Math.cos(a) * (Rr + 10), on = i < XS.ammo;
      o += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="1.25" fill="${on ? c : 'none'}" stroke="${c}" stroke-width="${on ? 0.4 : 0.8}" opacity="${on ? 1 : 0.5}"/>`;
    }
    return o;
  },
  nodes: 30,
});
injectCSS('cf-xh-sunbow', `.xh2.act path.a { filter: drop-shadow(0 0 2px currentColor); }`);

// ------------------------------------------------------------------------------------- damage numbers (§1.9 #6)
// the mythic vermilion-with-a-gold-edge, warmed to the sun: gold top -> vermilion -> deep red, gold edge
SKINS.sunbow = ['#ffe08a', '#ff8a3a', '#c8202a', '#e8b54a'];

// ------------------------------------------------------------------------------------- kill mark (§1.9 #8)
// km_sunbow: a drawn great bow canted up-right in the lower left of a dark roundel -- a thick red lacquer body with a
// gold edge, gold grip band and the 日珠, recurved ears, the string drawn back into a V -- its arrow aimed at the
// highest of nine gold suns rising in an arc across the upper right. Beats: (1) gold strokes draw the roundel, the bow,
// the string and the sun rings (0-0.45 s); (2) the bow fills with lacquer, the suns with gold, their rays come out
// (0.45-0.8); (3) glow (0.8-1.0); (4) 點睛: the arrow flies up the line with a gold glint trail, the highest sun bursts
// into a star and drops (1.0-1.15). Headshot: a cross flare and a vermilion burst ring off the struck sun.
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const seg = (t, a, b) => ease((t - a) / (b - a));
// nine suns on a rising arc (units of S/100), the last = the highest, the target
const KM_SUNS = Array.from({ length: 9 }, (_, i) => { const u = i / 8; return [22 * (1 - u) ** 2 + 2 * 36 * u * (1 - u) + 66 * u * u, 48 * (1 - u) ** 2 + 2 * 26 * u * (1 - u) + 27 * u * u, i === 8 ? 5.5 : 3.0 + u * 0.8]; });
registerKillMark('km_sunbow', {
  scale: 1.6,
  draw(ctx, Sz, t, o) {
    const U = Sz / 100, p1 = seg(t, 0, 0.45), p2 = seg(t, 0.45, 0.8), p3 = seg(t, 0.8, 1.0), p4 = seg(t, 1.0, 1.15);
    const X = (x) => x * U, cx = 50, cy = 55, RR = 38;
    ctx.clearRect(0, 0, Sz, Sz);
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // dark roundel + gold rim
    ctx.globalAlpha = 0.88 * Math.max(p1, 0.0001); ctx.fillStyle = '#170a08'; ctx.beginPath(); ctx.arc(X(cx), X(cy), X(RR), 0, TAU); ctx.fill();
    ctx.globalAlpha = 1; ctx.strokeStyle = '#e8b54a'; ctx.lineWidth = 1.8 * U; ctx.setLineDash([240 * U]); ctx.lineDashOffset = 240 * U * (1 - p1);
    ctx.beginPath(); ctx.arc(X(cx), X(cy), X(RR), 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    // the bow aims at the struck (highest) sun
    const [tx, ty] = KM_SUNS[8];
    const gx = 40, gy = 66, ang = Math.atan2(ty - gy, tx - gx), ca = Math.cos(ang), sa = Math.sin(ang);
    // bow frame: +x along the arrow, +y = the lower limb; scaled 0.6
    const B = (x, y) => [X(gx + (x * ca - y * sa) * 0.6), X(gy + (x * sa + y * ca) * 0.6)];
    const quad = (P, c2, b) => { const [qx, qy] = B(...c2), [bx, by] = B(...b); P.quadraticCurveTo(qx, qy, bx, by); };
    // limbs: back (target side) and belly curves, recurved ears flicking forward
    const body = new Path2D();
    body.moveTo(...B(-2, -40)); quad(body, [-10, -37], [-10, -29]); quad(body, [17, 0], [-10, 29]); quad(body, [-10, 37], [-2, 40]);
    body.lineTo(...B(-6, 42)); quad(body, [-16, 38], [-16, 28]); quad(body, [7, 0], [-16, -28]); quad(body, [-16, -38], [-6, -42]); body.closePath();
    if (p2 > 0) {
      ctx.globalAlpha = p2; const gr = ctx.createLinearGradient(...B(-16, 0), ...B(8, 0)); gr.addColorStop(0, '#5a0a10'); gr.addColorStop(0.55, '#b0141e'); gr.addColorStop(1, '#e0362e');
      ctx.fillStyle = gr; ctx.fill(body);
    }
    ctx.globalAlpha = 1; ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = 1.5 * U; ctx.setLineDash([200 * U]); ctx.lineDashOffset = 200 * U * (1 - p1); ctx.stroke(body); ctx.setLineDash([]);
    // grip band + the 日珠 on the riser
    if (p1 > 0.5) {
      ctx.globalAlpha = Math.min(1, (p1 - 0.5) * 2);
      const band = new Path2D(); [[-12, -6], [8, -6], [8, 6], [-12, 6]].forEach(([x, y], i) => band[i ? 'lineTo' : 'moveTo'](...B(x, y))); band.closePath();
      ctx.fillStyle = '#e8b54a'; ctx.fill(band);
      const [sx, sy] = B(4, -14);
      ctx.fillStyle = p2 > 0 ? '#fff1b8' : 'rgba(0,0,0,0)'; ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = 1 * U;
      ctx.beginPath(); ctx.arc(sx, sy, 2.4 * U, 0, TAU); ctx.fill(); ctx.stroke();
    }
    // string drawn back into a V to the nock
    ctx.globalAlpha = p1; ctx.strokeStyle = '#fff0c8'; ctx.lineWidth = 1.0 * U;
    ctx.beginPath(); ctx.moveTo(...B(-3, -40)); ctx.lineTo(...B(-24, 0)); ctx.lineTo(...B(-3, 40)); ctx.stroke();
    // the arrow: nocked (head at x = 22) -> 點睛 flight to the highest sun; a gold glint trail behind it
    const fly = p4, h0 = B(24, 0), hx = h0[0] + (X(tx) - h0[0]) * fly, hy = h0[1] + (X(ty) - h0[1]) * fly;
    const tlx = hx - ca * 48 * 0.6 * U, tly = hy - sa * 48 * 0.6 * U;
    if (fly > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const tg = ctx.createLinearGradient(h0[0], h0[1], hx + 0.01, hy); tg.addColorStop(0, 'rgba(255,180,60,0)'); tg.addColorStop(1, `rgba(255,236,170,${0.9 * (1 - fly * 0.4)})`);
      ctx.strokeStyle = tg; ctx.lineWidth = 3.2 * U; ctx.beginPath(); ctx.moveTo(...h0); ctx.lineTo(hx, hy); ctx.stroke(); ctx.restore();
    }
    if (p1 > 0.3 && fly < 1) {
      ctx.globalAlpha = Math.min(1, (p1 - 0.3) / 0.4);
      ctx.strokeStyle = '#e8cf98'; ctx.lineWidth = 2.0 * U; ctx.beginPath(); ctx.moveTo(tlx, tly); ctx.lineTo(hx, hy); ctx.stroke();
      // red fletching at the tail, the head a gold leaf
      const fx2 = tlx + ca * 5 * U, fy2 = tly + sa * 5 * U, nx = -sa, ny = ca;
      ctx.strokeStyle = '#c8202a'; ctx.lineWidth = 1.6 * U; ctx.beginPath();
      ctx.moveTo(tlx + nx * 2.4 * U, tly + ny * 2.4 * U); ctx.lineTo(fx2, fy2); ctx.lineTo(tlx - nx * 2.4 * U, tly - ny * 2.4 * U); ctx.stroke();
      ctx.fillStyle = p2 > 0 ? '#fff1b8' : '#ffd36b'; ctx.beginPath();
      ctx.moveTo(hx + ca * 5.5 * U, hy + sa * 5.5 * U); ctx.lineTo(hx + nx * 2.4 * U, hy + ny * 2.4 * U); ctx.lineTo(hx - nx * 2.4 * U, hy - ny * 2.4 * U); ctx.closePath(); ctx.fill();
    }
    // nine suns: gold rings drawn in (beat 1), gold discs with short rays (beat 2); the highest struck on beat 4
    ctx.globalAlpha = 1;
    KM_SUNS.forEach(([x, y, r0], i) => {
      const struck = i === 8 && p4 > 0, fall = struck ? p4 * p4 * 14 : 0, px = X(x), py = X(y + fall), r = r0 * U;
      ctx.lineWidth = 1.1 * U; ctx.strokeStyle = '#ffd36b'; ctx.setLineDash([32 * U]); ctx.lineDashOffset = 32 * U * (1 - seg(t, i * 0.03, 0.3 + i * 0.03));
      ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      if (p2 > 0) {
        ctx.globalAlpha = p2 * (struck ? 1 - p4 * 0.7 : 1);
        const sg = ctx.createRadialGradient(px, py, 0, px, py, r); sg.addColorStop(0, '#fff6d0'); sg.addColorStop(0.55, i === 8 ? '#ffd36b' : '#ffb43a'); sg.addColorStop(1, '#e0661a');
        ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(px, py, r * 0.86, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#ffc84a'; ctx.lineWidth = 0.8 * U;
        for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + i * 0.3, L0 = r * 1.25, L1 = r * (1.25 + 0.55 * p2); ctx.beginPath(); ctx.moveTo(px + Math.cos(a) * L0, py + Math.sin(a) * L0); ctx.lineTo(px + Math.cos(a) * L1, py + Math.sin(a) * L1); ctx.stroke(); }
        ctx.globalAlpha = 1;
      }
      if (struck) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(X(x), X(y));
        const fl = Math.sin(p4 * Math.PI);
        ctx.fillStyle = `rgba(255,236,170,${fl})`; ctx.beginPath(); ctx.arc(0, 0, r * (1 + 2.6 * fl), 0, TAU); ctx.fill();
        ctx.strokeStyle = `rgba(255,246,210,${fl})`; ctx.lineWidth = 1.2 * U;
        for (let k = 0; k < 4; k++) { const a = k * Math.PI / 4 + 0.39, L = (k % 2 ? 9 : 15) * U * fl; ctx.beginPath(); ctx.moveTo(-Math.cos(a) * L, -Math.sin(a) * L); ctx.lineTo(Math.cos(a) * L, Math.sin(a) * L); ctx.stroke(); }
        if (o.head) {
          ctx.strokeStyle = `rgba(255,250,220,${fl})`; ctx.lineWidth = 1.5 * U; ctx.beginPath(); ctx.moveTo(-19 * U * fl, 0); ctx.lineTo(19 * U * fl, 0); ctx.moveTo(0, -19 * U * fl); ctx.lineTo(0, 19 * U * fl); ctx.stroke();
          ctx.strokeStyle = `rgba(255,96,40,${Math.max(0, 1 - p4 * 0.5)})`; ctx.lineWidth = 2 * U; ctx.beginPath(); ctx.arc(0, 0, r * (1.6 + 3.4 * p4), 0, TAU); ctx.stroke();
        }
        ctx.restore();
      }
    });
    // beat 3: glow on the whole emblem
    if (p3 > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.32 * p3 * (1 - p4 * 0.5); const gg = ctx.createRadialGradient(X(cx), X(cy), 4 * U, X(cx), X(cy), X(RR + 4)); gg.addColorStop(0, 'rgba(255,200,110,0.6)'); gg.addColorStop(1, 'rgba(255,90,30,0)'); ctx.fillStyle = gg; ctx.fillRect(0, 0, Sz, Sz); }
    ctx.restore();
  },
});
