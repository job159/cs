// X04 應龍．御霆 Yinglong Stormherald — 神兵 magic staff (docs/PREMIUM_WEAPONS.md §2.31). Mechanics on the specials v2
// engine (registerSpecial 'staff' + skills) and the whole presentation: the staff's own trigger (mana, homing darts), the
// 雷印 marks, the viewmodel driver (armillary spin, wings, the 雷珠's plasma, the casting hand), clips, crosshair, kill
// mark, damage-number skin. Effect primitives: staff_fx.js. Model: tools/assets/weapons/staff.mjs.
//
//   LMB held   雷矢: a dart every 0.15 s (4 mana, 36, head x2) flung out of the armillary's flank; it locks the nearest
//              zombie in a 12° cone (in sight) at the cast and bends into it (600°/s after 0.08 s), else flies to the
//              crosshair point. Each hit leaves a 雷印 (≤ 3, 4 s): seal rings round the chest.
//   mana       ws.ammo of 100 (HUD: mana pool); back at 20/s 0.5 s after the last cast; R 引雷 (1.2 s) tops it up with a
//              bolt from the sky into the 雷珠; dry = automatic 引雷.
//   RMB held   連霆: a lightning chain from the 雷珠 to the zombie under the crosshair (8° cone, 22 m) and on through four
//              more within 6 m of each other: 150/s on the first, x0.8 a jump, +20 % a mark, 45 % slow, flinch; 22 mana/s.
//              A link reaching a 3-mark target = 雷爆 (2.5 m, 120, marks cleared, 霆勢 +4).
//   Q          雷池 (35 霆勢): a 6.5 m thunder field for 5 s at the crosshair (a zombie under it pins it to its feet): an
//              opening strike 220, 40/s and 50 % slow inside, a strike on someone inside every 0.5 s (110), and the
//              electric fence: whoever tries to cross the rim from outside is thrown back 2.5 m (「不敢越雷池一步」).
//   hold Q     應龍．震霄 (5,000 damage): the 5-beat summon — thunder sigil, a storm cloud, a bolt and the winged dragon
//              dissolving out of it; it circles, dives three times (260 + chain 3 x 100), rises and comes down as a
//              lightning column (650, 7 m); then 甘霖, 5 s of rain healing teammates 6 HP/s.
//   crisis     雷鱗甲: the default knock-back block with a lightning ring and jade scale chips.
//   kill       KE_THUNDER (a bolt from above, arcs crawling over the corpse, a branching scorch); km_staff; skin 'staff'.
// Sound cues (§1.12, produced later; each has a stock fallback): SND below and the card's list.
import * as THREE from 'three';
import { registerSpecial, registerSkill, meterAdd, meterEvent, canCast, chargeState, addAura } from '../specials.js';
import { registerClip, drawClip } from '../../player/clips.js';
import { registerCrosshair, injectCSS } from '../../ui/crosshairs.js';
import { registerKillMark } from '../../ui/killmarks.js';
import { SKINS } from '../../ui/dmgnums.js';
import { HAND_POSES } from '../../player/ik.js';
import { FRAME } from '../../fx/fx.js';
import { haptic, clipComfort } from '../arsenal.js';
import { COL, k3, sfx, gunAxes, dartMesh, freeDart, dartTrails, dartSpark, castFlash, dartImpact, MarkLayer, Chain, skyStrike, rubble, vmArc, Fence, stormCloud, rain, dragonGeometry, thunderKill } from './staff_fx.js';

const D2R = Math.PI / 180, TAU = Math.PI * 2;
const V3 = () => new THREE.Vector3();
const UPV = new THREE.Vector3(0, 1, 0);
const _a = V3(), _b = V3(), _c = V3(), _d = V3(), _e = V3(), _dir = V3(), _rgt = V3(), _upc = V3();
const R = Math.random;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, u) => a + (b - a) * u;
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const mine = (g, ws) => !!g.vm?.weapon && g.vm.weapon.def === ws.def;

// sound cues and their stock fallbacks
const SND = {
  draw: ['staff_draw', 'drawHeavy'], first: ['staff_first', 'drawHeavy'], bolt: ['staff_bolt', 'xh_node'], boltHit: ['staff_bolt_hit', 'hit_flesh'], mark: ['staff_mark', null],
  markFull: ['staff_mark_full', 'killmark_ding'], chainStart: ['staff_chain_start', 'special_activate'], chainLoop: ['staff_chain_loop', 'beam_loop'], chainEnd: ['staff_chain_end', null],
  burst: ['staff_burst', 'explosion_small'], poolCast: ['staff_pool_cast', 'special_activate'], poolStrike: ['staff_pool_strike', 'explosion_small'], poolLoop: ['staff_pool_loop', null],
  repel: ['staff_pool_repel', 'melee_heavy_hit'], poolEnd: ['staff_pool_end', 'special_end'], ultRaise: ['staff_ult_raise', 'boss_warning'], ultCloud: ['staff_ult_cloud', null],
  roar: ['staff_ult_roar', 'boss_warning'], dive: ['staff_ult_dive', 'explosion_small'], ultFinal: ['staff_ult_final', 'explosion_large'], ultRain: ['staff_ult_rain', null],
  reload: ['staff_reload', 'magIn'], reloadRare: ['staff_reload_rare', 'magIn'], kill: ['staff_kill', 'kill_confirm_thud'], inspect: ['staff_inspect', 'cloth'], ring: ['staff_ring', 'xh_node'],
  crisis: ['staff_crisis', 'glass'], dry: ['staff_dry', 'dryfire'], idle: ['staff_idle', null],
};
const play = (g, key, o = {}) => sfx(g, SND[key][0], SND[key][1], o);

// what the held staff shows on the crosshair (one local player)
const XS = { lock: false, marks: 0, chain: false, flash: 0 };

// casting hand poses (ik.js owns the table; these only add names)
Object.assign(HAND_POSES, {
  // 劍指: index and middle straight together, ring and little finger curled under the thumb
  swordFingers: { index: [2, 2, 0], middle: [3, 3, 1], ring: [84, 96, 56], pinky: [86, 94, 56], spread: [2, -2, 0, 0], thumb: [42, 28, 70, 38, 26] },
  // 掌立 seal: a flat upright palm, fingers together
  sealPalm: { index: [3, 3, 2], middle: [3, 3, 2], ring: [4, 4, 3], pinky: [6, 6, 4], spread: [2, 0, -1, -3], thumb: [8, 22, 18, 8, 4] },
  // dragon claw (calling the dragon down)
  dragonClaw: { index: [30, 48, 34], middle: [32, 50, 36], ring: [36, 52, 38], pinky: [40, 54, 40], spread: [10, 3, -4, -12], thumb: [20, 40, 40, 30, 20] },
});
// free left-hand anchors (camera space, written for the right hand: the left mirrors x)
const HAND = {
  point: { pos: [0.15, -0.17, -0.44], F: [-0.3, 0.22, -1], N: [-0.55, -0.8, -0.1], pose: 'swordFingers', palm: [0.02, 0.05] },
  slap: { pos: [0.1, -0.2, -0.42], F: [-0.25, -0.15, -1], N: [0, -1, 0.1], pose: 'sealPalm', palm: [0.015, 0.045] },
  sky: { pos: [0.16, 0.02, -0.4], F: [-0.15, 1, -0.35], N: [-0.85, 0, -0.3], pose: 'swordFingers', palm: [0.02, 0.05] },
  claw: { pos: [0.12, -0.12, -0.46], F: [-0.2, 0.3, -1], N: [-0.3, -0.2, -0.9], pose: 'dragonClaw', palm: [0.02, 0.05] },
};

// ------------------------------------------------------------------------------------- the special (v2 overrides)
registerSpecial('staff', {
  init(ws) {
    Object.assign(ws.sp, { fireCd: 0, side: 1, darts: [], marks: new Map(), burstCd: new Map(), slows: new Map(), lock: null, lockT: 0, castAt: -9, busy: 0, chain: null,
      tally: { hits: 0, kills: 0, head: false, at: null }, view: null, snd: {}, idleT: 0, arcT: 0, wc: null });
    ws.ammo = Math.min(ws.ammo ?? ws.def.mag, ws.def.mag);
    // decode the staff's cues up front (samples are fetched on first play)
    const au = ws.game?.audio;
    if (au?.defs && !au._sfPre) { au._sfPre = true; au.preload?.(Object.keys(au.defs).filter((n) => /^(staff_|ready_staff$)/.test(n)))?.catch?.(() => {}); }
  },
  modifiers() { return {}; },
  // the gun trigger is ours (Arsenal asks before its own logic): casting runs in update()
  trigger() { return true; },
  onHit(ws, info, res, target) {
    const g = ws.game, z = target?.zombie || target;
    if (!g || !res || info.skill === 'crisis') return;
    if (info.sfDart) { meterAdd(ws, 'thunder', 1.5); if (z && !res.killed) addMark(ws, g, z); }
    if (res.killed && z) killFx(ws, g, z, info);
  },
  update(ws, dt, g) {
    const s = ws.sp, B = ws.def.staff.bolt, ar = g.arsenal, inp = g.input?.state;
    s.busy = Math.max(0, s.busy - dt);
    s.fireCd = Math.max(-0.05, s.fireCd - dt);
    // RMB 連霆 needs mana: the press is ours then (the engine would cast it anyway)
    if (inp?.pressed?.alt && ws.ammo < 6 && canCast(ws, 'alt').ok) {
      inp.pressed.alt = false;
      play(g, 'dry', { volume: 0.6 }); g.hud?.toast?.('法力不足（R 引雷）', 900);
      if (ar?.state === 'idle') ar.reload();
    }
    const alive = !!g.status?.alive, idle = ar?.state === 'idle', channel = !!s.chain && !s.chain.done;
    if (idle && alive && inp?.held?.fire && s.busy <= 0 && !channel) {
      if (ws.ammo >= B.cost) { if (s.fireCd <= 0) { castDart(ws, g); s.fireCd += 60 / ws.def.rpm; } }
      else if (inp.pressed.fire) { play(g, 'dry', { volume: 0.7 }); ar.reload(); }
    } else if (s.fireCd < 0) s.fireCd = 0;
    // the homing lock (crosshair + bracket on the target), refreshed 10x a second
    if ((s.lockT -= dt) <= 0) {
      s.lockT = 0.1;
      g.camera.getWorldDirection(_dir);
      s.lock = alive ? pickTarget(g, g.camera.position, _dir, B.cone, B.range) : null;
    }
    XS.lock = !!s.lock; XS.marks = s.lock ? s.marks.get(s.lock)?.n || 0 : 0; XS.chain = channel;
    if (mine(g, ws)) view(ws, g, dt);
  },
  tick(ws, dt, g) {
    const s = ws.sp, ar = g.arsenal, held = ar?.current === ws;
    for (let i = s.darts.length - 1; i >= 0; i--) { const d = s.darts[i]; if (!stepDart(g, d, dt)) { endDart(d); s.darts.splice(i, 1); } }
    weigh(ws, g);
    markTick(ws, g, dt);
    slowTick(ws, dt);
    // mana comes back by itself (not while casting, channelling or in the 引雷 clip)
    const rg = ws.def.staff.regen, channel = !!s.chain && !s.chain.done;
    if (ws.ammo < ws.def.mag && !channel && !(held && ar.state === 'reload') && g.time - s.castAt > rg.delay) {
      const was = Math.floor(ws.ammo);
      ws.ammo = Math.min(ws.def.mag, ws.ammo + rg.rate * dt);
      if (Math.floor(ws.ammo) !== was) g.hud?.ammoChanged?.();
    }
    if (s.snd.hum && !held) { s.snd.hum.stop?.(0.2); s.snd.hum = null; }
    if (!held && s.wc) worldInspect(ws, g, 0, true);
  },
  dispose(ws, g) {
    const s = ws.sp;
    for (const d of s.darts) endDart(d);
    s.darts.length = 0;
    for (const [z] of s.slows) unslow(z);
    s.slows.clear(); s.marks.clear();
    g._sfMarks?.update([], g.camera, 0);
    for (const k of Object.keys(s.snd)) { s.snd[k]?.stop?.(0.1); s.snd[k] = null; }
  },
  /** Clip events: ['sf', { arcs | strike: 'pearl' | spin: mul | wings: v | jaw: v | pearl: glow | ring | lift | snd, vol | hand: 'grip' }] */
  onClipEvent(ws, name, arg, g) {
    if (Array.isArray(name)) [name, arg] = name;
    if (name !== 'sf' || !arg) return;
    const vm = g.vm;
    if (arg.arcs) pearlArcs(g, arg.arcs, arg.k ?? 1.2);
    if (arg.strike) pearlStrike(ws, g, arg.strike);
    if (arg.spin != null) for (const n of ['fx_ring1', 'fx_ring2', 'fx_ring3']) vm?.setSpin(n, arg.spin);
    if (arg.wings != null) vm?.setPart('fx_wing*', arg.wings, arg.sec ?? 0.2, 0.04);
    if (arg.jaw != null) vm?.setPart('fx_jaw', arg.jaw, arg.sec ?? 0.12);
    if (arg.pearl) { flashPearl(ws, arg.pearl - 1); pearlFlare(g, arg.pearl); }
    if (arg.ring) { play(g, 'ring', { volume: 0.5, pitch: 0.9 + R() * 0.2 }); ringArc(g); }
    if (arg.lift != null) { const p = vm?.partState; if (p) (p.fx_pearl || (p.fx_pearl = { v: 0 })).liftT = arg.lift; }
    if (arg.world) worldInspect(ws, g, 0);
    if (arg.snd) play(g, arg.snd, { volume: arg.vol ?? 0.9 });
  },
});

// ------------------------------------------------------------------------------------- targets
/** Nearest zombie in sight within `cone` degrees of dir (angle first, then distance). */
function pickTarget(g, eye, dir, cone, range, skip = null) {
  const list = g.targets?.list || g.zombies?.list;
  if (!list) return null;
  let best = null, bs = Infinity;
  const cc = Math.cos(cone * D2R);
  for (const z of list) {
    if (!z.alive || !z.center || (skip && skip.has(z))) continue;
    _e.subVectors(z.center(_c), eye);
    const d = _e.length();
    if (d < 0.5 || d > range) continue;
    const cs = _e.dot(dir) / d;
    if (cs < cc) continue;
    const sc = Math.acos(Math.min(1, cs)) / (cone * D2R) * 2 + d / range;
    if (sc >= bs) continue;
    const hit = g.world?.collision?.raycast(eye, _e.multiplyScalar(1 / d), d);
    if (hit && hit.dist < d - 0.6) continue;
    bs = sc; best = z;
  }
  return best;
}
/** Nearest live zombie within r of p not in `skip` (chain jumps). */
function nearest(g, p, r, skip) {
  let best = null, bd = r;
  for (const z of g.targets?.inRadius?.(p, r) || []) {
    if (!z.alive || skip.has(z) || !z.center) continue;
    const d = z.center(_c).distanceTo(p);
    if (d < bd) { bd = d; best = z; }
  }
  return best;
}

// ------------------------------------------------------------------------------------- 雷矢 darts
function castDart(ws, g) {
  const s = ws.sp, B = ws.def.staff.bolt, cam = g.camera, own = mine(g, ws), vm = g.vm;
  s.side = -s.side;
  ws.ammo = Math.max(0, ws.ammo - B.cost);
  s.castAt = g.time;
  g.hud?.ammoChanged?.();
  cam.getWorldDirection(_dir);
  const tgt = s.lock && s.lock.alive ? s.lock : pickTarget(g, cam.position, _dir, B.cone, B.range);
  const wh = g.world?.collision?.raycast(cam.position, _dir, B.range);
  const aim = cam.position.clone().addScaledVector(_dir, wh ? Math.max(1, wh.dist - 0.05) : B.range);
  _rgt.set(1, 0, 0).applyQuaternion(cam.quaternion); _upc.set(0, 1, 0).applyQuaternion(cam.quaternion);
  // flung out of the armillary's flank: launched outward and up, it bends back into the line (a homing arc you see)
  const flare = tgt ? 0.26 : 0.1;
  const v0 = _dir.clone().addScaledVector(_rgt, s.side * flare).addScaledVector(_upc, flare * 0.55).normalize();
  const from = own ? vm.socketApparent?.(s.side > 0 ? 'boltR' : 'boltL', V3()) : null;
  const d = { ws, pos: cam.position.clone(), dir: v0, t: 0, tgt, aim, dist: 0, mesh: dartMesh(g.scene), trails: dartTrails(g), side: s.side, vis: V3(), spin: R() * TAU,
    off: from ? from.sub(cam.position) : new THREE.Vector3(0, -0.12, 0), seen: new Set() };
  place(d, g);
  s.darts.push(d);
  g.arsenal.sinceShot = 0;
  // ---- feel: a light jab of the staff head, punch, a crackle, the flank of the armillary flashes
  g.punch?.impulse(-0.010, s.side * 0.004, (R() - 0.5) * 0.01);
  g.addShake?.(0.018);
  haptic(8);
  play(g, 'bolt', { volume: 0.55, pitch: 0.94 + R() * 0.12 });
  g.net?.onLocalFire?.(ws.def.id, cam.position, _dir, aim);
  if (own) {
    vm.kick({ back: -0.012, up: -1.4, side: s.side * 1.2, roll: s.side * 2 });
    const c = vm.socketCam?.(s.side > 0 ? 'boltR' : 'boltL', _a);
    if (c) castFlash(g, c, gunAxes(vm).f);
    flashPearl(ws, 0.4);
    if (R() < 0.5) pearlArcs(g, 1, 1);
  }
}
function place(d, g) {
  const u = Math.max(0, 1 - d.t / 0.14);
  d.vis.copy(d.pos).addScaledVector(d.off, u * u);
  d.mesh.position.copy(d.vis);
  const sk = 1 + 0.25 * Math.sin(d.t * 60 + d.spin);
  d.mesh.scale.setScalar(sk);
  // two strands spiralling round the flight line
  _rgt.set(0, 1, 0).cross(d.dir); if (_rgt.lengthSq() < 1e-4) _rgt.set(1, 0, 0); _rgt.normalize();
  _upc.copy(d.dir).cross(_rgt);
  const a = d.spin + d.t * 38, r = 0.07 * Math.min(1, d.t * 8);
  d.trails[0]?.push(_a.copy(d.vis).addScaledVector(_rgt, Math.cos(a) * r).addScaledVector(_upc, Math.sin(a) * r).clone());
  d.trails[1]?.push(_a.copy(d.vis).addScaledVector(_rgt, -Math.cos(a) * r).addScaledVector(_upc, -Math.sin(a) * r).clone());
}
function endDart(d) { for (const t of d.trails) t?.stop(); freeDart(d.mesh); }
function stepDart(g, d, dt) {
  const B = d.ws.def.staff.bolt, col = g.world?.collision;
  d.t += dt;
  const sp = lerp(B.speed, B.speed1, clamp01(d.t / B.accel));
  // steer: into the locked zombie's chest (or the crosshair point), at most `turn` deg/s after `delay`
  // the locked zombie died under it: carry straight on
  if (d.tgt && !d.tgt.alive) { d.tgt = null; d.aim = d.pos.clone().addScaledVector(d.dir, 30); }
  if (d.t > B.delay) {
    const tp = d.tgt ? d.tgt.center(_c) : d.aim;
    _d.subVectors(tp, d.pos);
    const L = _d.length();
    if (L > 1e-3) {
      _d.multiplyScalar(1 / L);
      const ang = Math.acos(Math.max(-1, Math.min(1, d.dir.dot(_d)))), mx = B.turn * D2R * dt * (L < 3 ? 2 : 1);
      if (ang <= mx) d.dir.copy(_d); else d.dir.lerp(_d, mx / ang).normalize();
    }
    // a magic dart does not graze past its mark: within 0.45 m of the locked chest it strikes
    if (d.tgt && d.tgt.alive && L < 0.45) { const h = { target: d.tgt, point: d.tgt.center(V3()), normal: null, part: 'body', dist: d.dist }; dartHit(g, d, h); return false; }
  }
  const len = sp * dt, steps = Math.max(1, Math.ceil(len / 0.6)), h = len / steps;
  for (let i = 0; i < steps; i++) {
    const wh = col?.raycast(d.pos, d.dir, h + 0.05), reach = wh ? wh.dist : h;
    if (g.targets) for (const hit of g.targets.raycast(d.pos, d.dir, reach)) {
      const z = hit.target.zombie || hit.target;
      if (d.seen.has(z)) continue;
      dartHit(g, d, hit); return false;
    }
    if (wh) {
      d.pos.copy(wh.point);
      g.fx?.impact?.(wh.surf, wh.point, wh.normal, d.dir, { big: 0.5 });
      dartImpact(g, wh.point, wh.normal, d.dir, { flesh: false });
      play(g, 'boltHit', { pos: wh.point, volume: 0.35 });
      return false;
    }
    d.pos.addScaledVector(d.dir, h);
    d.dist += h;
  }
  if (d.t > 1.6 || d.dist > B.range + 8) { g.fx?.sparkBurst?.(d.vis.clone(), { color: k3(COL.rim, 0.4), color1: k3(COL.core, 0.2), count: 5, speed: 3, glow: 0.2 }); return false; }
  place(d, g);
  dartSpark(g, d.vis, d.dir, dt);
  return true;
}
function dartHit(g, d, h) {
  const ws = d.ws, B = ws.def.staff.bolt, ar = g.arsenal, z = h.target.zombie || h.target;
  const head = h.part === 'head', boss = !!z.def?.boss;
  const partMul = head ? (boss ? 1.6 : B.headMul) * (ar?.headMul ?? 1) : h.part === 'limb' ? 0.8 : h.part === 'weak' ? 2 : 1;
  const info = { amount: B.dmg * partMul * (ar?.dmgMul ?? 1), part: h.part, box: h.box, point: h.point, normal: h.normal, dir: d.dir.clone(), dist: h.dist,
    knock: B.knock * (ar?.knockMul ?? 1), stagger: B.stagger, weapon: ws.def.id, shooter: g.localId, headshot: head, sfDart: true };
  const res = h.target.damage(info);
  g.hud?.onHit?.(info, res, h.target);
  ar?._special?.(ws, 'onHit', info, res, h.target);
  dartImpact(g, h.point, h.normal, d.dir, { head });
  const T = ws.sp.tally;
  T.hits++; T.at = h.point.clone(); if (head) T.head = true;
  if (res?.killed) T.kills++;
}
/** The frame's weight from what the darts did (one sound / stop per frame, not per dart). */
function weigh(ws, g) {
  const T = ws.sp.tally;
  if (!T.hits) return;
  if (T.kills) { stop(g, T.kills > 1 ? 60 : 40); g.addShake?.(T.kills > 1 ? 0.12 : 0.06); play(g, 'kill', { volume: 0.6 + 0.15 * Math.min(2, T.kills) }); }
  play(g, 'boltHit', { pos: T.at, volume: 0.5 + (T.head ? 0.2 : 0) });
  T.hits = 0; T.kills = 0; T.head = false; T.at = null;
}
function stop(g, ms) { if (clipComfort.hitstop !== false) g.hitStop?.(ms / 1000); }

// ------------------------------------------------------------------------------------- 雷印 marks, 雷爆, slows
function addMark(ws, g, z) {
  const M = ws.def.staff.mark, s = ws.sp, m = s.marks.get(z) || { n: 0, t: 0, fresh: 0 };
  m.n = Math.min(M.max, m.n + 1); m.t = M.dur; m.fresh = 1;
  s.marks.set(z, m);
  if (m.n >= M.max) play(g, 'markFull', { volume: 0.4, pitch: 1.3 });
}
function markTick(ws, g, dt) {
  const s = ws.sp, list = [];
  for (const [z, m] of s.marks) {
    m.t -= dt; m.fresh = Math.max(0, m.fresh - dt * 6);
    if (!z.alive || m.t <= 0) { s.marks.delete(z); continue; }
    list.push({ pos: z.center(V3()), n: m.n, fresh: m.fresh, lock: z === s.lock });
  }
  for (const [z, t] of s.burstCd) if ((t - dt) <= 0) s.burstCd.delete(z); else s.burstCd.set(z, t - dt);
  if (s.lock && s.lock.alive && !s.marks.has(s.lock) && g.arsenal?.current === ws) list.push({ pos: s.lock.center(V3()), n: 0, lock: true });
  if (list.length || g._sfMarks) (g._sfMarks ||= new MarkLayer(g.scene)).update(list, g.camera, dt);
}
/** 雷爆: a marked-out zombie bursts (connected by the chain): 2.5 m, 120, its marks gone, 霆勢 +4 */
function burst(ws, g, z) {
  const M = ws.def.staff.mark, s = ws.sp;
  if (s.burstCd.has(z)) return;
  s.burstCd.set(z, M.cd); s.marks.delete(z);
  const c = z.center(V3());
  g.fx?.particles?.spawn({ additive: true, x: c.x, y: c.y, z: c.z, life: 0.14, size: 1.6, size1: 2.6, color: [...k3(COL.white, 0.45), 1], color1: [...k3(COL.core, 0.06), 0], frame: FRAME.glow });
  g.fx?.shockwave?.(_a.set(c.x, (z.pos?.y ?? c.y - 1) + 0.06, c.z), { normal: UPV, r0: 0.2, r1: M.burstR * 1.1, life: 0.3, color: k3(COL.rim, 0.7), thin: true });
  g.fx?.sparkBurst?.(c.clone(), { color: k3(COL.white, 0.7), color1: k3(COL.core, 0.4), count: 20, speed: 8, glow: 0.8 });
  for (let i = 0; i < 5; i++) { _a.set(c.x + (R() - 0.5) * 3, c.y + (R() - 0.3) * 1.4, c.z + (R() - 0.5) * 3); g.fx?.bolt?.(c.clone(), _a.clone(), { col: k3(COL.white, 0.6), glow: k3(COL.core, 0.4), width: 0.05, core: 0.22, levels: 4, jitter: 0.2, branches: 1, regen: 0.04, life: 0.14 }); }
  g.fx?.lights?.flash?.(c, 0xbfe8ff, 30, 6, 0.12);
  play(g, 'burst', { pos: c, volume: 0.8 });
  const ar = g.arsenal;
  for (const t of g.targets?.inRadius?.(c, M.burstR) || []) {
    const p = t.center(V3()), f = Math.max(0.4, 1 - p.distanceTo(c) / M.burstR), dir = p.clone().sub(c).setY(0);
    if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
    const info = { amount: M.burst * f * (ar?.dmgMul ?? 1), part: 'body', point: p, dir: dir.normalize(), knock: 3 * f, stagger: 0.8, weapon: ws.def.id, shooter: g.localId, explosive: true, skill: 'staff_burst', elem: 'staff' };
    const res = t.damage(info);
    g.hud?.onHit?.(info, res, t);
    if (res?.killed) killFx(ws, g, t.zombie || t, info);
  }
  meterEvent(ws, 'burst');
  stop(g, 40); g.addShake?.(0.12); haptic(20);
}
function slow(ws, z, k, t) {
  if (!z || z.def?.boss) return;
  const e = ws.sp.slows.get(z);
  if (!e) { ws.sp.slows.set(z, { t, base: z.speedMul ?? 1, k }); z.speedMul = (z.speedMul ?? 1) * (1 - k); }
  else { e.t = Math.max(e.t, t); if (k > e.k) { e.k = k; z.speedMul = e.base * (1 - k); } }
}
function unslow(z, e) { if (e && z.speedMul != null) z.speedMul = e.base; }
function slowTick(ws, dt) {
  for (const [z, e] of ws.sp.slows) { e.t -= dt; if (e.t <= 0 || !z.alive) { unslow(z, e); ws.sp.slows.delete(z); } }
}
let _keAt = [];
function killFx(ws, g, z, info) {
  const now = g.time, p = info.point || z.center?.(V3()) || z.pos;
  _keAt = _keAt.filter((t) => now - t < 1.2);
  if (z.kvel) z.kvel.y = Math.max(z.kvel.y, 2.2);   // the jolt of the strike throws the body up a little
  // ≤ 3 full KE_THUNDER at a time per player (§1.10); the rest of a multi-kill still crackle
  if (_keAt.length >= 3) { g.fx?.zfx?.status?.(z, 'shocked', 0.5); return; }
  _keAt.push(now);
  thunderKill(g, z, p, { big: !!info.skill });
}

// ------------------------------------------------------------------------------------- viewmodel driver
function view(ws, g, dt) {
  const s = ws.sp, vm = g.vm, w = vm.weapon, ar = g.arsenal;
  const v = s.view || (s.view = { w: null, t: 0, wings: 0, pk: 0 });
  if (v.w !== w) { v.w = w; v.t = 0; w.onParts = (vm2) => partsHook(ws, vm2); prewarm(g); }
  v.pk = Math.max(0, v.pk - dt * 5);
  v.t += dt;
  if (!s.snd.hum && g.audio?.has?.(SND.idle[0])) s.snd.hum = g.audio.play(SND.idle[0], { loop: true, volume: 0.12, fadeIn: 0.4 });
  const cs = chargeState(ws, g), ready = !!cs?.ready, channel = !!s.chain && !s.chain.done, ult = !!cs?.ult, firing = g.time - s.castAt < 0.25;
  // armillary: slow idle spin, faster casting / ready, flat out channelling or calling the dragon
  const spin = ult ? 6 : channel ? 4 : firing ? 2.4 : ready ? 1.8 : 1;
  for (const n of ['fx_ring1', 'fx_ring2', 'fx_ring3']) vm.setSpin(n, spin);
  // wings: folded at rest, half spread while ready breathes, spread channelling / in the ultimate
  const want = ult ? 1 : channel ? 0.75 : ready ? 0.22 + 0.12 * Math.sin(v.t * 2.4) : 0;
  v.wings += (want - v.wings) * Math.min(1, dt * 8);
  for (const n of ['fx_wingL', 'fx_wingR']) { const p = vm.partState[n] || (vm.partState[n] = { v: 0 }); if (!p.tw) p.v = v.wings; }
  // glow: the 雷珠 breathes, swells while casting; the seams and ring lines follow; eyes ≤ 0.4 x the pearl
  const G = vm._glowMat;
  if (G) {
    const br = 0.85 + 0.15 * Math.sin(v.t * TAU * (ready ? 1.2 : 0.6));
    G.crystal = br * (channel ? 1.7 : firing ? 1.2 : ready ? 1.3 : 1) * (1 + v.pk);
    G.glow_cyan = channel ? 2 + 0.6 * Math.sin(v.t * 30) : ready ? 1.4 : 1;
    G.glass = channel || ult ? 1.6 : 1;
  }
  // the pearl's plasma: a few arcs crawling inside it; more while ready / channelling
  if ((s.arcT -= dt) <= 0) { s.arcT = channel ? 0.05 : ready ? 0.3 + R() * 0.3 : 0.6 + R() * 0.6; pearlArcs(g, channel ? 2 : 1, channel ? 1.4 : 1); }
  // channelling: arcs run from the pearl down to the casting fingers
  if (channel && R() < dt * 14) { const c = vm.socketCam?.('pearl', _a), hL = vm.handPos?.L; if (c && hL) vmArc(g, c, _b.copy(hL).add(_c.set(0.02, 0.03, -0.09)), { w: 0.005, life: 0.07, k: 0.9, levels: 4 }); }
  // rare idle every 12 s of quiet
  if (ar.state === 'idle' && !vm.clip.active && ar.sinceShot > 2 && !channel) { if ((s.idleT += dt) >= 12) { s.idleT = 0; gunClip(g, ws, 'staff_idle_rare'); } } else s.idleT = 0;
  // rare inspect: the pearl lifts out of the rings (liftT seconds), then drops back with a click (posed in partsHook)
  const pp = vm.partState.fx_pearl;
  if (pp?.liftT != null) {
    pp.liftT -= dt;
    pp.lift = pp.liftT > 0 ? Math.min(1, (pp.lift ?? 0) + dt * 4) : Math.max(0, (pp.lift ?? 0) - dt * 9);
    pp.liftA = (pp.liftA || 0) + dt * 9 * pp.lift;
    if (pp.liftT <= 0 && pp.lift <= 0) { pp.liftT = null; play(g, 'ring', { volume: 0.6, pitch: 1.3 }); pearlFlare(g, 1.6); flashPearl(ws, 1); }
    else if (pp.lift > 0.5 && R() < dt * 20) pearlArcs(g, 1, 1.4);
  }
  worldInspect(ws, g, dt);
}
/** after the viewmodel posed the GLB parts: the rare-inspect pearl lift */
function partsHook(ws, vm) {
  const pp = vm.partState.fx_pearl, part = vm.weapon?.parts?.fx_pearl;
  if (!pp?.lift || !part) return;
  part.node.position.y += 0.06 * smooth(pp.lift);
  part.node.rotateY(pp.liftA || 0);
}
function flashPearl(ws, k) { const v = ws.sp.view; if (v) v.pk = Math.max(v.pk || 0, k); }

/** Camera-space plasma arcs inside the 雷珠 (from its heart to its skin). */
function pearlArcs(g, n = 1, k = 1) {
  const vm = g.vm, c = vm?.socketCam?.('pearl', V3());
  if (!c) return;
  for (let i = 0; i < n; i++) {
    _b.set(R() - 0.5, R() - 0.5, R() - 0.5).normalize().multiplyScalar(0.0195);
    vmArc(g, c, c.clone().add(_b), { w: 0.0022 * k, life: 0.06 + R() * 0.06, k: 0.7 * k, levels: 3 });
  }
}
function pearlFlare(g, k = 1) {
  const vm = g.vm, P = g.fx?.particles, c = vm?.socketCam?.('pearl', _a);
  if (!P || !c) return;
  const { f } = gunAxes(vm);
  P.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, life: 0.22, size: 0.03, size1: 0.08 * k, color: [...k3(COL.rim, 0.35 * k), 1], color1: [0, 0, 0, 0], frame: FRAME.glow });
  P.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, mode: 'flat', dir: [f.x, f.y, f.z], life: 0.28, size: 0.03, size1: 0.12 * k, sizePow: 0.5, color: [...k3(COL.rim, 0.4), 1], color1: [0, 0, 0, 0], frame: FRAME.thinRing });
}
/** An arc running once round the outer ring (ready / glint tier). */
function ringArc(g) {
  const vm = g.vm, c = vm?.socketCam?.('pearl', V3()), top = vm?.socketCam?.('top', V3());
  if (!c || !top) return;
  const r = top.distanceTo(c), { r: rt, u } = gunAxes(vm), rr = rt.clone(), uu = u.clone();
  for (let i = 0; i < 6; i++) later(g, i * 0.035, () => {
    const a0 = i / 6 * TAU, a1 = (i + 1) / 6 * TAU;
    const p0 = c.clone().addScaledVector(rr, Math.cos(a0) * r * 0.62).addScaledVector(uu, Math.sin(a0) * r * 0.62), p1 = c.clone().addScaledVector(rr, Math.cos(a1) * r * 0.62).addScaledVector(uu, Math.sin(a1) * r * 0.62);
    vmArc(g, p0, p1, { w: 0.003, life: 0.09, k: 0.9 });
  });
}
/** 引雷 / first draw: a bolt from above the frame strikes the 雷珠 (camera space), a white flash, the rings jolt. */
function pearlStrike(ws, g, kind) {
  const vm = g.vm, c = vm?.socketCam?.('pearl', V3());
  if (!c) return;
  const top = c.clone().add(_a.set(0.05 + R() * 0.04, 0.9, -0.25));
  g.fx?.bolt?.(top, c.clone(), { vm: true, col: k3(COL.white, 0.85), glow: k3(COL.core, 0.5), width: 0.012, core: 0.25, levels: 5, jitter: 0.1, branches: 2, regen: 0.04, life: 0.16 });
  pearlFlare(g, 2.2);
  pearlArcs(g, 4, 1.6);
  flashPearl(ws, 1.8);
  g.fx?.lights?.flash?.(g.camera.position.clone().add(_b.set(0, 1, 0)), 0xbfe8ff, 18, 4, 0.12);
  if (clipComfort.overlay !== false) g.fx?.overlay?.tint?.([0.8, 1.0, 1.3], 0.05, 0.18);
  play(g, kind === 'rare' ? 'reloadRare' : 'reload', { volume: 0.9 });
  g.addShake?.(0.06);
  haptic(18);
}
/** 改變世界的檢視 (§1.7.1 beat 11): own screen only, exposure x0.75, fog +30 %, a far flash of lightning, 2.5 s. */
function worldInspect(ws, g, dt, stopNow = false) {
  const s = ws.sp, post = g.renderer?.post, fog = g.scene?.fog;
  const on = !stopNow && !!g.arsenal?._inspecting && g.arsenal.current === ws;
  if (on && !s.wc) s.wc = { t: 0, exp: post?.exposure ?? 1, fog: fog?.density ?? 0, flash: false };
  const wc = s.wc;
  if (!wc) return;
  wc.t += dt;
  if (!on && wc.t < 2.15) wc.t = 2.15;
  const e = smooth(wc.t / 0.35) * (1 - smooth((wc.t - 2.15) / 0.35));
  if (post) post.exposure = wc.exp * (1 - 0.25 * e);
  if (fog && wc.fog) fog.density = wc.fog * (1 + 0.3 * e);
  if (!wc.flash && wc.t > 0.9) {
    wc.flash = true;
    const cam = g.camera, far = cam.position.clone().add(_a.set((R() - 0.5) * 40, 0, -50).applyQuaternion(cam.quaternion));
    far.y = cam.position.y + 30;
    g.fx?.bolt?.(far, far.clone().add(_b.set((R() - 0.5) * 8, -32, (R() - 0.5) * 8)), { col: k3(COL.white, 0.5), glow: k3(COL.core, 0.3), width: 0.6, core: 0.2, levels: 6, jitter: 0.08, branches: 3, regen: 0.06, life: 0.18 });
    play(g, 'ultCloud', { volume: 0.35 });
  }
  if (stopNow || wc.t >= 2.5) { if (post) post.exposure = wc.exp; if (fog && wc.fog) fog.density = wc.fog; if (!on || stopNow) s.wc = null; else wc.t = 2.5; }
}

/**
 * First equip (once a game): the thunder sigil design, the dragon geometry, the mark layer, and one tiny draw of the
 * ribbons / ghost / overlays the first 連霆 / 雷池 / 震霄 would otherwise compile on the spot.
 */
function prewarm(g) {
  if (g._sfWarm) return;
  g._sfWarm = true;
  const fx = g.fx;
  try {
    fx?.sigils?.preload?.(['thunder']);
    for (const t of fx?.sigils?.tex || []) if (t) g.renderer?.gl?.initTexture?.(t);
    g._sfMarks ||= new MarkLayer(g.scene);
    const far = g.camera.position.clone().add(_a.set(0, -80, 0)), far2 = far.clone().add(_b.set(0, -1, 0));
    _dragonGeo ||= dragonGeometry();
    fx?.summons?.ghost?.({ geometry: _dragonGeo, pos: far, size: 0.01, life: 0.1, appear: 0.01, out: 0.01 });
    fx?.bolt?.(far, far2, { width: 0.001, life: 0.05 });
    fx?.bolt?.(_c.set(0, -0.3, -0.5), _e.set(0, -0.3, -0.6), { vm: true, width: 0.0001, life: 0.05 });
    fx?.sigils?.sigil?.(far, { design: 'thunder', radius: 0.05, intensity: 0, life: 0.2 });
    fx?.sigils?.pillar?.(far, { radius: 0.01, height: 0.01, life: 0.2, motes: 0, ring: false, light: 0 });
    fx?.overlay?.radial?.(0.0005, 0.05, { r0: 0.9 });
    fx?.overlay?.tint?.([1, 1, 1], 0.0001, 0.05);
    fx?.overlay?.border?.([0, 0, 0], 0.0001, 0.05);
  } catch (e) { console.warn('[staff] prewarm', e); }
}
let _dragonGeo = null;
function later(g, sec, fn) { let t = 0; const sys = { update: (dt) => { if ((t += dt) >= sec) { g.systems.splice(g.systems.indexOf(sys), 1); fn(); } } }; g.systems.push(sys); }
function gunClip(g, ws, id) { const ar = g.arsenal; if (ar?.current === ws && ar.state === 'idle') ar.playClip(id); }
/** the casting hand: a free anchor (HAND key) or back on the shaft */
function hand(g, which, blend = 0.12) {
  const vm = g.vm;
  if (!vm?.weapon) return;
  if (which === 'grip') { vm.setAnchor('L', vm.defaultLeft(), blend); vm.arms?.setPose('L', vm.supportGrip?.pose || 'wrap', blend); return; }
  const h = HAND[which];
  vm.setAnchor('L', h, blend);
  vm.arms?.setPose('L', h.pose, blend * 0.8);
}

// ------------------------------------------------------------------------------------- skills
// ◎ held 連霆: the lightning chain (caster: targets, damage, mana; everyone: the arcs).
registerSkill('staff_chain', {
  level: 'L2', channel: true, defaults: { range: 22, cone: 8, jumps: 4, jumpR: 6, dps: 150, falloff: 0.8, slow: 0.45, mana: 22, tick: 0.1 },
  start(k) {
    const g = k.game, d = k.data;
    d.chain = new Chain(g); d.acc = 0; d.re = 0; d.list = [];
    d.loop = play(g, 'chainLoop', k.local ? { loop: true, volume: 0.55 } : { loop: true, pos: k.pos, volume: 0.55 });
    play(g, 'chainStart', k.local ? { volume: 0.8 } : { pos: k.pos, volume: 0.8 });
    if (k.local && k.ws) {
      k.ws.sp.chain = k;
      if (mine(g, k.ws)) { hand(g, 'point', 0.1); g.arsenal?.fovHold?.(-1, 0.15); }
    }
  },
  update(k, dt) {
    const g = k.game, d = k.data, p = k.p, ws = k.ws;
    if (k.local && ws) {
      ws.ammo -= p.mana * dt; ws.sp.castAt = g.time;
      if (ws.ammo <= 0) { ws.ammo = 0; g.hud?.ammoChanged?.(); return false; }
      if (R() < dt * 4) g.hud?.ammoChanged?.();
    }
    const eye = k.caster(_a, _dir).clone(), dir = _dir.clone();
    // who the chain holds: the target under the crosshair, then the nearest unchained within jumpR, 10x a second
    if ((d.re -= dt) <= 0) {
      d.re = 0.1;
      const skip = new Set(), list = [];
      let z = pickTarget(g, eye, dir, p.cone, p.range);
      while (z && list.length <= p.jumps) { list.push(z); skip.add(z); z = nearest(g, z.center(V3()), p.jumpR, skip); }
      d.list = list;
      if (!list.length) { const wh = g.world?.collision?.raycast(eye, dir, p.range); d.end = eye.clone().addScaledVector(dir, wh ? wh.dist : Math.min(8, p.range)); d.endHit = !!wh; }
    }
    const from = k.muzzle(V3()), links = [];
    let prev = from;
    d.list = d.list.filter((z) => z.alive);
    d.list.forEach((z, i) => { const c = z.center(V3()); links.push([prev, c, i ? 0.75 : 1]); prev = c; });
    if (!d.list.length && d.end) {
      links.push([from, d.end, 0.8]);
      if (d.endHit && R() < dt * 20) g.fx?.sparkBurst?.(d.end.clone(), { color: k3(COL.white, 0.5), color1: k3(COL.core, 0.3), count: 3, speed: 4, glow: 0.3 });
    }
    d.chain.set(links, dt);
    for (const z of d.list) if (R() < dt * 6) g.fx?.zfx?.status?.(z, 'shocked', 0.3);
    if (k.local) {
      g.addShake?.(0.25 * dt);
      for (const z of d.list) slow(ws, z, p.slow, 0.35);
      if ((d.acc += dt) >= p.tick) {
        d.acc -= p.tick;
        const ar = g.arsenal;
        d.list.forEach((z, i) => {
          if (!z.alive) return;
          const marks = ws.sp.marks.get(z)?.n || 0, c = z.center(V3());
          const info = { amount: p.dps * p.tick * Math.pow(p.falloff, i) * (1 + marks * ws.def.staff.mark.mul) * (ar?.dmgMul ?? 1), part: 'body', point: c, dir: c.clone().sub(eye).normalize(),
            knock: 0.15, stagger: 0.35, weapon: ws.def.id, shooter: g.localId, skill: 'staff_chain', elem: 'staff' };
          const res = z.damage(info);
          g.hud?.onHit?.(info, res, z);
          ar?._special?.(ws, 'onHit', info, res, z);
          if (!res?.killed && marks >= ws.def.staff.mark.max) burst(ws, g, z);
        });
      }
    }
  },
  end(k) {
    const g = k.game, d = k.data;
    d.chain?.stop(); d.loop?.stop?.(0.12);
    play(g, 'chainEnd', k.local ? { volume: 0.6 } : { pos: k.pos, volume: 0.6 });
    if (k.local && k.ws) {
      if (k.ws.sp.chain === k) k.ws.sp.chain = null;
      if (mine(g, k.ws)) { hand(g, 'grip', 0.18); g.arsenal?.fovHold?.(0, 0.15); }
      g.hud?.ammoChanged?.();
    }
  },
});

// ★ 雷池: a thunder field that strikes, slows and throws back whatever tries to cross its rim.
registerSkill('staff_pool', {
  level: 'L2', aim: 'target', dur: 5.8, defaults: { range: 30, r: 6.5, dur: 5, open: 220, openR: 3.5, dps: 40, slow: 0.5, strike: 110, strikeR: 1.5, every: 0.5, repel: 2.5, repelCd: 1.5 },
  start(k) {
    const g = k.game, d = k.data;
    d.c = k.at.clone(); d.on = false; d.acc = 0; d.next = 0; d.inside = new Set(); d.repelT = new Map();
    play(g, 'poolCast', k.local ? { volume: 0.8 } : { pos: d.c, volume: 0.8 });
    if (k.local && k.ws) {
      k.ws.sp.busy = 0.45;
      if (mine(g, k.ws)) g.arsenal?.playClip?.('staff_cast_tap');
      g.punch?.impulse(0.03, 0, 0);
    }
    // the cast: a bolt from the 雷珠 to the sky
    const m = k.muzzle(_a);
    g.fx?.bolt?.(m.clone(), m.clone().add(_b.set(0, 14, 0)), { col: k3(COL.white, 0.6), glow: k3(COL.core, 0.35), width: 0.06, core: 0.22, levels: 5, jitter: 0.08, branches: 1, regen: 0.04, life: 0.2 });
  },
  update(k, dt) {
    const g = k.game, d = k.data, p = k.p, c = d.c, t = k.t, end = 0.3 + p.dur;
    if (!d.on && t >= 0.3) {
      d.on = true;
      d.sig = g.fx?.sigils?.sigil?.(_a.set(c.x, c.y + 0.04, c.z), { design: 'thunder', radius: p.r, color: k3(COL.core, 0.45), color1: k3(COL.deep, 0.5), intensity: 0.75, life: p.dur + 0.3, seed: k.ev.seed });
      d.fence = new Fence(g, c, p.r);
      d.loop = play(g, 'poolLoop', { pos: c, loop: true, volume: 0.6 });
      const near = Math.min(1, c.distanceTo(g.camera.position) / 8);
      skyStrike(g, c, { size: 1.8, near: 0.45 + 0.55 * near });
      play(g, 'poolStrike', { pos: c, volume: 1 });
      if (k.local) {
        k.hurt(c, p.openR, p.open, { knock: 4, stagger: 1 });
        for (const z of g.targets?.inRadius?.(c, p.r - 0.3) || []) d.inside.add(z);
        g.addShake?.(Math.max(0.05, 0.25 - c.distanceTo(g.camera.position) / 60)); stop(g, 60);
      }
    }
    if (!d.on) return true;
    if (t < end) {
      d.fence.update(dt, t > end - 0.6 ? (end - t) / 0.6 : 1);
      // a strike on someone inside every `every` s (teammates: a seeded spot in the field)
      if ((d.next -= dt) <= 0) {
        d.next = p.every;
        let at = null, z = null;
        if (k.local) { const ins = (g.targets?.inRadius?.(c, p.r) || []).filter((o) => o.alive); if (ins.length) { z = ins[(R() * ins.length) | 0]; at = V3().set(z.pos.x, z.pos.y, z.pos.z); } }
        if (!at && k.rng() < 0.6) { const a = k.rng() * TAU, r = Math.sqrt(k.rng()) * p.r * 0.85; at = V3().set(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r); at.y = k.floorY(at); }
        if (at) {
          skyStrike(g, at, { size: 0.85, near: Math.min(1, 0.4 + at.distanceTo(g.camera.position) / 10), dust: !!z });
          play(g, 'poolStrike', { pos: at, volume: 0.7, pitch: 0.95 + R() * 0.1 });
          if (k.local && z) k.hurt(at, p.strikeR, p.strike, { knock: 1.5, stagger: 1 });
        }
      }
      if (k.local) {
        // 40/s inside (every 0.5 s), slowed; the fence throws back anyone crossing in from outside
        if ((d.acc += dt) >= 0.5) { d.acc -= 0.5; k.hurt(c, p.r, p.dps * 0.5, { knock: 0, stagger: 0.2, falloffMin: 1, explosive: false }); }
        const ws = k.ws;
        for (const z of g.targets?.inRadius?.(c, p.r + 1.2) || []) {
          if (!z.alive) continue;
          const dx = z.pos.x - c.x, dz = z.pos.z - c.z, dd = Math.hypot(dx, dz);
          if (dd < p.r) { if (ws) slow(ws, z, p.slow, 0.3); }
          if (d.inside.has(z) || dd < p.r - 0.6 || dd > p.r + 0.9) continue;
          const last = d.repelT.get(z) ?? -9;
          if (k.t - last < p.repelCd) continue;
          d.repelT.set(z, k.t);
          const nx = dx / (dd || 1), nz = dz / (dd || 1);
          if (z.kvel && !z.def?.boss) { z.kvel.x += nx * 7.5; z.kvel.z += nz * 7.5; z.kvel.y = Math.max(z.kvel.y, 2); }
          if (z.state === 'chase' || z.state === 'attack') { z.state = 'stagger'; z.stateT = 0; }
          d.fence.flash(z.pos);
          play(g, 'repel', { pos: z.pos, volume: 0.7 });
          const pt = z.center(V3()), info = { amount: 20 * (g.arsenal?.dmgMul ?? 1), part: 'body', point: pt, dir: new THREE.Vector3(nx, 0, nz), knock: 0, stagger: 1, weapon: k.def.id, shooter: g.localId, skill: 'staff_pool', elem: 'staff' };
          k._feedback(info, z.damage(info), z);
        }
      }
      return true;
    }
    return t < end + 0.3;
  },
  end(k) {
    const d = k.data;
    d.sig?.stop?.(); d.loop?.stop?.(0.3);
    if (d.on) play(k.game, 'poolEnd', { pos: d.c, volume: 0.6 });
  },
});

// ★ held 應龍．震霄: sigil -> storm cloud -> a bolt and the dragon -> three dives -> the lightning column -> 甘霖.
const ULT = { cloud: 0.3, descend: 0.7, dives: [1.4, 2.2, 3.0], rise: 3.55, fall: 3.85, impact: 4.15, rain: 4.3 };
registerSkill('staff_ult', {
  level: 'L4', aim: 'target', dur: 5.2, defaults: { range: 35, r: 9, dive: 260, diveR: 5, chain: 100, chainN: 3, final: 650, finalR: 7, rain: 6, rainR: 9, rainDur: 5 },
  start(k) {
    const g = k.game, d = k.data, c = k.at.clone();
    d.c = c; d.beat = 0; d.dive = 0; d.cloudH = 15;
    const eye = k.caster(_a, _b);
    d.side = new THREE.Vector3(c.x - eye.x, 0, c.z - eye.z).normalize();
    if (k.local) {
      g.hud?.card?.(k.cardText(), { color: k.hex.rim, sub: k.def.en });
      if (k.ws) { k.ws.sp.busy = 1.2; if (mine(g, k.ws)) g.arsenal?.playClip?.('staff_cast_ult'); }
      g.arsenal?.fovKick?.(3, 0.5);
      if (k.level >= 4 && clipComfort.overlay !== false) { d.border = g.fx?.overlay?.border?.([0.55, 1.1, 1.6], 0.1, 4.6); g.fx?.overlay?.tint?.([0.6, 0.85, 1.25], 0.05, 1.2); }
    }
    play(g, 'ultRaise', k.local ? { volume: 1 } : { pos: c, volume: 1 });
    const m = k.muzzle(_a);
    g.fx?.bolt?.(m.clone(), m.clone().add(_b.set(0, 30, 0)), { col: k3(COL.white, 0.8), glow: k3(COL.core, 0.45), width: 0.1, core: 0.22, levels: 6, jitter: 0.06, branches: 2, regen: 0.04, life: 0.4 });
  },
  update(k, dt) {
    const g = k.game, d = k.data, p = k.p, t = k.t, c = d.c, fx = g.fx;
    if (d.beat < 1 && t >= ULT.cloud) {
      d.beat = 1;
      d.sig = fx?.sigils?.sigil?.(_a.set(c.x, c.y + 0.04, c.z), { design: 'thunder', radius: p.r, color: k3(COL.core, 0.42), color1: k3(COL.deep, 0.5), intensity: 0.8, life: 4.6, seed: k.ev.seed });
      d.cloud = stormCloud(g, c, { h: d.cloudH, r: 7, life: 4.9 });
      play(g, 'ultCloud', { pos: c, volume: 0.9 });
    }
    if (d.cloud && R() < dt * 4) d.cloud.flash(0.8);
    if (d.beat < 2 && t >= ULT.descend) {
      d.beat = 2;
      fx?.sigils?.pillar?.(c, { radius: 1.6, height: d.cloudH + 2, color: k3(COL.core, 0.7), color1: k3(COL.deep, 0.5), life: 0.55 });
      skyStrike(g, c, { size: 2.4, height: d.cloudH, near: nearK(g, c) });
      _dragonGeo ||= dragonGeometry();
      d.pos = new THREE.Vector3(c.x, c.y + d.cloudH - 2, c.z);
      d.dragon = fx?.summons?.ghost?.({ geometry: _dragonGeo, pos: d.pos, size: 9, base: [0.25, 0.62, 0.52], core: k3(COL.core, 0.6), rim: k3(COL.rim, 0.5), edge: k3(COL.white, 0.6), opacity: 0.55, glaze: 0.8,
        appear: 0.5, life: Infinity, out: 0.6, motion: null, flap: { amp: 0.5, hz: 1.3 }, wave: { amp: 0.07, hz: 0.9, axis: [1, 0, 0], len: 1.3 }, exit: { kind: 'goldpaper', count: 30, speed: 4 }, big: true, seed: k.ev.seed });
      play(g, 'roar', { pos: c, volume: 1 });
      if (k.local) g.addShake?.(0.3);
    }
    if (d.dragon) fly(k, dt);
    if (d.beat < 3 && t >= ULT.impact) {
      d.beat = 3;
      fx?.sigils?.pillar?.(c, { radius: 2.4, height: 22, color: k3(COL.white, 0.6), color1: k3(COL.core, 0.7), life: 0.6 });
      skyStrike(g, c, { size: 3.4, height: 20, near: nearK(g, c) });
      fx?.zfx?.quake?.(c, p.finalR, { col: k3(COL.core, 0.5), scale: 1.3, crack: true });
      fx?.zfx?.ground?.add?.('crack', _a.set(c.x, c.y + 0.03, c.z), { r: p.finalR * 0.8, life: 3, col: k3(COL.core, 0.6), alpha: 0, fadeIn: 0.01, fadeOut: 2 });
      rubble(g, c, 22, 10);
      fx?.motes?.burst?.('goldpaper', _a.set(c.x, c.y + 1.5, c.z), 30, { seed: k.ev.seed + 7, speed: 5, radius: 2 });
      d.dragon?.flash?.(2); d.dragon?.dissolveOut?.(0.6);
      play(g, 'ultFinal', { pos: c, volume: 1 });
      if (k.local) {
        k.hurt(c, p.finalR, p.final, { knock: 10, stagger: 1, falloffMin: 0.4 });
        g.addShake?.(0.55 * (0.4 + 0.6 * nearK(g, c))); stop(g, 110); haptic(60); setTimeout(() => haptic(40), 110);
        if (clipComfort.overlay !== false) g.fx?.overlay?.radial?.(0.8, 0.3, { color: [0.8, 1.2, 1.7], r0: 0.34 });
      }
    }
    if (d.beat < 4 && t >= ULT.rain) {
      d.beat = 4;
      d.rain = rain(g, c, p.rainR, p.rainDur);
      d.rainSnd = play(g, 'ultRain', { pos: c, loop: true, volume: 0.6 });
      // 甘霖: each client heals its own player inside it
      addAura(g, { type: 'regen', mul: p.rain, radius: p.rainR, pos: c, dur: p.rainDur, by: k.by });
      fx?.motes?.burst?.('ember', _a.set(c.x, c.y + 1, c.z), 16, { seed: k.ev.seed + 3, speed: 2, radius: 3, color: k3(COL.core, 0.4) });
    }
    if (d.rain && !d.rain.update(dt)) { d.rain.stop(); d.rain = null; d.rainSnd?.stop?.(0.6); }
    return t < ULT.rain + p.rainDur || !!d.rain;
  },
  end(k) {
    const d = k.data;
    d.sig?.stop?.(); d.border?.stop?.(0.4); d.rain?.stop(); d.rainSnd?.stop?.(0.4);
    if (d.dragon?.alive) d.dragon.dissolveOut?.(0.3);
  },
});
const nearK = (g, c) => Math.min(1, 0.35 + c.distanceTo(g.camera.position) / 14);
/** the dragon's flight: circling the field, three dives (breath bolt + chain), a climb, the fall into the column */
function fly(k, dt) {
  const g = k.game, d = k.data, p = k.p, t = k.t, c = d.c, h = d.dragon;
  if (!h?.alive) return;
  const prev = d.pos.clone();
  const R0 = 8.5, base = 8.5;
  let pos;
  const orbit = (tt) => { const a = (tt - ULT.descend) * 1.7 + Math.atan2(d.side.z, d.side.x) + Math.PI; return V3().set(c.x + Math.cos(a) * R0, c.y + base + Math.sin(tt * 2.1) * 1.2, c.z + Math.sin(a) * R0); };
  if (t < ULT.descend + 0.4) pos = V3().lerpVectors(V3().set(c.x, c.y + d.cloudH - 2, c.z), orbit(ULT.descend + 0.4), smooth((t - ULT.descend) / 0.4));
  else if (t < ULT.rise) {
    pos = orbit(t);
    // dives: swoop down to a target (a zombie near the field for the caster; a seeded spot for everyone else)
    for (let i = 0; i < ULT.dives.length; i++) {
      const t0 = ULT.dives[i] - 0.25, t1 = ULT.dives[i] + 0.3;
      if (t < t0 || t > t1) continue;
      if (d.dive <= i && t >= t0) {
        d.dive = i + 1;
        let tg = null;
        if (k.local) { const zs = (g.targets?.inRadius?.(c, p.r + 3) || []).filter((z) => z.alive); if (zs.length) tg = zs[(R() * zs.length) | 0]; }
        const a = k.rng() * TAU, r = k.rng() * p.r * 0.7;
        d.diveAt = tg ? V3().set(tg.pos.x, tg.pos.y, tg.pos.z) : V3().set(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r);
        d.diveAt.y = k.floorY(d.diveAt);
        d.breathed = false;
        play(g, 'roar', { pos: d.diveAt, volume: 0.8, pitch: 1.05 + i * 0.05 });
      }
      const u = (t - t0) / (t1 - t0), dip = Math.sin(Math.PI * u);
      pos.lerp(_a.copy(d.diveAt).add(_b.set(0, 3.2, 0)), dip * 0.85);
      if (!d.breathed && u >= 0.48) { d.breathed = true; breath(k, d.diveAt); }
    }
  } else if (t < ULT.fall) pos = orbit(ULT.rise).lerp(V3().set(c.x, c.y + d.cloudH + 2, c.z), smooth((t - ULT.rise) / (ULT.fall - ULT.rise)));
  else pos = V3().set(c.x, c.y + lerp(d.cloudH + 2, 1.5, smooth((t - ULT.fall) / (ULT.impact - ULT.fall))), c.z);
  d.pos.copy(pos);
  h.obj.position.copy(pos);
  const vel = _e.subVectors(pos, prev);
  if (vel.lengthSq() > 1e-6) { h.obj.up.set(0, 1, 0); h.obj.lookAt(_a.copy(pos).sub(vel)); }
}
/** a dive's breath: a fat bolt from the dragon's mouth to the ground, then arcs to the nearest few */
function breath(k, at) {
  const g = k.game, d = k.data, p = k.p, h = d.dragon, fx = g.fx;
  const mouth = h.obj.localToWorld(V3().set(0, 0.02, -0.62));
  fx?.bolt?.(mouth, at.clone().add(_b.set(0, 0.05, 0)), { col: k3(COL.white, 0.9), glow: k3(COL.core, 0.55), width: 0.32, core: 0.24, levels: 6, jitter: 0.06, branches: 3, regen: 0.04, life: 0.3 });
  skyStrike(g, at, { size: 1.6, height: 0.1, near: nearK(g, at), light: true });
  fx?.zfx?.quake?.(at, p.diveR, { col: k3(COL.core, 0.4), scale: 0.8, crack: false });
  h.flash?.(1);
  play(g, 'dive', { pos: at, volume: 1 });
  if (!k.local) return;
  k.hurt(at, p.diveR, p.dive, { knock: 6, stagger: 1 });
  const skip = new Set();
  let from = at.clone().add(_b.set(0, 1, 0));
  for (let i = 0; i < p.chainN; i++) {
    const z = nearest(g, from, 8, skip);
    if (!z) break;
    skip.add(z);
    const c = z.center(V3());
    fx?.bolt?.(from.clone(), c.clone(), { col: k3(COL.white, 0.7), glow: k3(COL.core, 0.45), width: 0.12, core: 0.22, levels: 5, jitter: 0.09, branches: 1, regen: 0.04, life: 0.25 });
    const info = { amount: p.chain * (g.arsenal?.dmgMul ?? 1), part: 'body', point: c, dir: c.clone().sub(from).normalize(), knock: 2, stagger: 1, weapon: k.def.id, shooter: g.localId, skill: 'staff_ult', elem: 'staff' };
    k._feedback(info, z.damage(info), z);
    from = c;
  }
  g.addShake?.(0.2 * nearK(g, at)); stop(g, 50); haptic(30);
}

// crisis 雷鱗甲: a lightning ring and jade scale chips burst off the player (crisis.js does the blocking)
registerSkill('staff_crisis', {
  level: 'L1', dur: 0.6,
  start(k) {
    const g = k.game, c = k.feet(_a).add(_b.set(0, 1.1, 0)), P = g.fx?.particles;
    g.fx?.shockwave?.(k.feet(_c).add(_b.set(0, 0.06, 0)), { normal: UPV, r0: 0.3, r1: 4.2, life: 0.4, color: k3(COL.rim, 0.8), thin: true });
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; g.fx?.bolt?.(c.clone(), c.clone().add(_b.set(Math.cos(a) * 3.5, (R() - 0.4) * 1.5, Math.sin(a) * 3.5)), { col: k3(COL.white, 0.6), glow: k3(COL.core, 0.4), width: 0.06, core: 0.22, levels: 4, jitter: 0.15, branches: 1, regen: 0.04, life: 0.25 }); }
    for (let i = 0; i < 12 && P; i++) {
      const a = i / 12 * TAU;
      P.spawn({ x: c.x, y: c.y, z: c.z, vx: Math.cos(a) * 5, vy: 1 + R() * 2, vz: Math.sin(a) * 5, life: 0.9, size: 0.05, color: [0.18, 0.55, 0.42, 1], color1: [0.15, 0.45, 0.35, 1], frame: FRAME.shard, gravity: 9.8, spin: (R() - 0.5) * 16, collide: true, bounce: 0.3, lit: true });
    }
    play(g, 'crisis', k.local ? { volume: 1 } : { pos: c, volume: 1 });
  },
});

// ------------------------------------------------------------------------------------- clips
// Positions m, rotations deg (x pitch, y yaw, z roll) about the right hand, relative to the hip pose.
const Z3 = [0, 0, 0];
const S = (o) => ['sf', o];
registerClip('staff_drawn', () => ({ ...drawClip(true), events: [[0.05, 'snd', 'staff_draw'], [0.4, S({ arcs: 2 })]] }));
// 首次登場 1.6 s: swung up from the lower right, the dragon turned to the eye; the rings spin up, the wings open; a bolt
// from the sky strikes the 雷珠; freeze; the 御霆 sting
registerClip('staff_first', {
  duration: 1.6,
  tracks: {
    gunPos: [[0, [0.14, -0.3, 0.1]], [0.22, [0.01, 0.02, 0.02], 'out3'], [0.4, [-0.02, 0.03, 0.04]], [0.58, [-0.02, 0.03, 0.04]], [0.8, [0, 0.005, 0], 'inOut'], [1, Z3]],
    gunRot: [[0, [-30, 40, -50]], [0.22, [6, -8, 4], 'out3'], [0.4, [10, 38, 8], 'inOut'], [0.58, [10, 40, 8]], [0.8, [1, -1, 0], 'inOut'], [1, Z3]],
    fx_wingL: [[0, 0], [0.28, 0], [0.45, 1, 'outBack'], [0.75, 1], [0.9, 0, 'inOut'], [1, 0]],
    fx_wingR: [[0, 0], [0.3, 0], [0.47, 1, 'outBack'], [0.75, 1], [0.9, 0, 'inOut'], [1, 0]],
    fx_jaw: [[0, 0], [0.55, 0], [0.6, 1, 'out3'], [0.75, 1], [0.85, 0], [1, 0]],
    env: [[0, 0], [0.25, 1], [0.8, 1], [1, 0]],
  },
  events: [[0, 'anchorL', ['rest', 0.05]], [0.02, S({ snd: 'first', vol: 0.9 })], [0.04, 'glow', { to: 0.2, sec: 0 }], [0.2, 'haptic', 'tick'], [0.27, S({ spin: 0.2 })],
    [0.3, S({ spin: 3, ring: true })], [0.36, S({ ring: true })], [0.42, S({ ring: true, arcs: 2 })], [0.45, 'haptic', 'tick'], [0.58, S({ strike: 'first' })], [0.58, 'glow', { to: 1.4, sec: 0.05 }],
    [0.62, 'shake', 0.08], [0.78, 'anchorL', ['grip_l', 0.15]], [0.8, S({ spin: 1 })], [0.84, 'glow', { to: 1, sec: 0.4 }], [0.86, 'haptic', 'tick']],
});
// ready reminder (震霄 full, every 2.5 s): the dragon lifts its head (jaw), the wings beat once, an arc round the ring
registerClip('staff_ready', { duration: 0.9, tracks: {
  gunRot: [[0, Z3], [0.2, [-2.5, 0, 1.5], 'out3'], [0.45, [0.8, 0, -0.5]], [0.7, Z3]],
  fx_jaw: [[0, 0], [0.2, 0.8, 'out3'], [0.5, 0], [1, 0]], fx_wingL: [[0, 0], [0.18, 0.8, 'out3'], [0.55, 0.1], [1, 0]], fx_wingR: [[0, 0], [0.2, 0.8, 'out3'], [0.57, 0.1], [1, 0]] },
  events: [[0.05, S({ ring: true })], [0.25, S({ pearl: 1.8, arcs: 2 })], [0.25, 'glow', { to: 1.5, sec: 0.06 }], [0.6, 'glow', { to: 1, sec: 0.3 }]] });
// 34-99 % idle tier (every 7 s): an arc runs round the outer ring
registerClip('staff_glint', { duration: 0.6, tracks: {}, events: [[0, S({ ring: true })]] });
// rare idle: the jaw snaps once and the pearl spits an arc
registerClip('staff_idle_rare', { duration: 1.0, tracks: { fx_jaw: [[0, 0], [0.12, 1, 'out3'], [0.22, 0, 'snap'], [0.4, 0.6], [0.5, 0], [1, 0]], gunRot: [[0, Z3], [0.2, [-1.5, 0, 1]], [0.5, Z3]] },
  events: [[0.12, S({ arcs: 3, pearl: 1.4 })], [0.22, S({ snd: 'ring', vol: 0.4 })]] });
// ★ 雷池: the staff lifted, the left palm slaps down
registerClip('staff_cast_tap', { duration: 0.6, tracks: {
  gunPos: [[0, Z3], [0.25, [0, 0.05, 0.02], 'out3'], [0.45, [0, -0.02, -0.01]], [1, Z3]], gunRot: [[0, Z3], [0.25, [14, 0, -4], 'out3'], [0.45, [-6, 0, 2]], [1, Z3]] },
  events: [[0.02, 'anchorL', [HAND.slap, 0.1]], [0.05, 'poseL', 'sealPalm'], [0.3, 'haptic', 'tick'], [0.3, S({ pearl: 2, arcs: 3 })], [0.3, 'shake', 0.06], [0.7, 'anchorL', ['grip_l', 0.18]]] });
// ★ held 震霄: the staff raised to the sky, sword fingers up, then back down as the dragon comes
registerClip('staff_cast_ult', { duration: 1.25, tracks: {
  gunPos: [[0, Z3], [0.22, [-0.03, 0.12, 0.04], 'out3'], [0.6, [-0.03, 0.125, 0.04]], [1, Z3, 'inOut']],
  gunRot: [[0, Z3], [0.22, [-24, 10, 12], 'out3'], [0.6, [-25, 10, 12]], [1, Z3, 'inOut']],
  fx_wingL: [[0, 0], [0.2, 1, 'outBack'], [0.85, 1], [1, 1]], fx_wingR: [[0, 0], [0.22, 1, 'outBack'], [0.85, 1], [1, 1]], fx_jaw: [[0, 0], [0.2, 1, 'out3'], [0.7, 1], [1, 0.3]] },
  events: [[0, 'anchorL', [HAND.sky, 0.12]], [0.05, 'poseL', 'swordFingers'], [0.15, 'haptic', 'tick'], [0.2, S({ spin: 6, pearl: 2.4, arcs: 4 })], [0.22, 'shake', 0.1],
    [0.62, 'anchorL', [HAND.claw, 0.15]], [0.86, 'anchorL', ['grip_l', 0.2]]] });
// 引雷 reload 1.2 s: the staff head tilted up, the left hand forms a seal before the 雷珠, a bolt from the sky strikes it,
// the rings stop dead then race; mana in at 0.85 s
function reload(rare) {
  const tracks = {
    gunPos: [[0, Z3], [0.18, [-0.04, 0.03, 0.03]], [0.75, [-0.045, 0.035, 0.03]], [1, Z3]],
    gunRot: [[0, Z3], [0.18, [-10, 12, 6]], [0.75, [-11, 14, 6]], [1, Z3]],
    fx_jaw: rare ? [[0, 0], [0.3, 1, 'out3'], [0.5, 1], [0.56, 0.2, 'snap'], [0.7, 0], [1, 0]] : [[0, 0], [1, 0]],
  };
  const events = [[0, 'glow', { u: 'pCharge', to: 0.2, sec: 0.15 }], [0.04, 'anchorL', [{ pos: [0.03, -0.1, -0.36], F: [0.1, 1, -0.2], N: [-0.95, 0.05, -0.3], pose: 'sealPalm', palm: [0.015, 0.045] }, 0.15]],
    [0.08, 'poseL', 'sealPalm'], [0.2, S({ spin: 0 })], [0.42, S({ strike: rare ? 'rare' : 'normal', spin: 5 })], [0.44, 'shake', 0.06], [0.44, 'haptic', 'tick'],
    [0.7, 'ammo'], [0.7, 'glow', { u: 'pCharge', to: 1, sec: 0.3 }], [0.78, S({ spin: 1 })], [0.8, 'anchorL', ['grip_l', 0.18]]];
  if (rare) events.push([0.3, S({ arcs: 3 })], [0.56, S({ pearl: 2.2 })]);
  return { duration: rare ? 1.3 : 1.2, tracks, events, extra: rare ? 0.1 : 0 };
}
registerClip('staff_reload', () => reload(false));
registerClip('staff_reload_rare', () => reload(true));
// inspect 4.6 s (hold loops 0.04-0.18): a CS2 slow turn so the bronze and lacquer take the light -> a finger flicks the
// outer ring (it races, clicks) -> the staff turned to show the dragon's profile, wings opening -> upright, the pearl
// flashes, freeze
function inspect(rare) {
  const tracks = {
    gunPos: [[0, Z3], [0.04, [-0.06, 0.04, 0.06]], [0.11, [-0.065, 0.045, 0.065]], [0.18, [-0.06, 0.04, 0.06]], [0.24, [-0.08, 0.02, 0.05], 'inOut'], [0.46, [-0.08, 0.02, 0.05]],
      [0.56, [-0.04, 0.03, 0.05], 'inOut'], [0.72, [-0.04, 0.03, 0.05]], [0.82, [0, 0.01, 0.01], 'inOut'], [0.96, [0, 0.01, 0.01]], [1, Z3]],
    gunRot: [[0, Z3], [0.04, [6, 30, -12]], [0.11, [8, 38, -14]], [0.18, [6, 30, -12]], [0.24, [-4, 18, 4], 'inOut'], [0.46, [-5, 20, 4]],
      [0.56, [4, 95, -6], 'inOut'], [0.72, [5, 102, -6]], [0.82, [2, 6, -2], 'inOut'], [0.96, [1, 4, -1]], [1, Z3]],
    fx_wingL: [[0, 0], [0.5, 0], [0.58, 1, 'outBack'], [0.76, 1], [0.84, 0], [1, 0]], fx_wingR: [[0, 0], [0.52, 0], [0.6, 1, 'outBack'], [0.76, 1], [0.84, 0], [1, 0]],
    env: [[0, 0], [0.05, 1], [0.95, 1], [1, 0]],
  };
  const events = [[0.02, S({ snd: 'inspect', vol: 0.7, world: true })], [0.03, 'snd', 'cloth']];
  if (rare) events.push([0.22, S({ lift: 1.8, pearl: 1.8 })], [0.22, 'haptic', 'tick']);
  else events.push([0.2, 'anchorL', [{ pos: [0.02, -0.03, -0.42], F: [0.2, 0.7, -0.7], N: [-0.9, 0.2, -0.3], pose: 'point', palm: [0.02, 0.05] }, 0.18]], [0.21, 'poseL', 'point'],
    [0.28, S({ spin: 8, ring: true })], [0.31, S({ ring: true })], [0.34, S({ ring: true })], [0.38, S({ ring: true, arcs: 2 })], [0.46, 'anchorL', ['grip_l', 0.25]], [0.5, S({ spin: 1 })]);
  events.push([0.56, 'snd', 'cloth'], [0.6, S({ arcs: 2 })], [0.88, S({ pearl: 2.2, arcs: 3 })], [0.88, 'haptic', 'tick']);
  return { duration: 4.6, loop: [0.04, 0.18], tracks, events };
}
registerClip('staff_inspect', () => inspect(false));
registerClip('staff_inspect_rare', () => inspect(true));

// ------------------------------------------------------------------------------------- crosshair (§1.9 #2)
// xh_staff: four inward square-spiral hooks (雲雷紋) on the diagonals, the centre empty; locked: the hooks close in and turn
// 45° onto the axes; under them three small pips = the 雷印 on the locked target; channelling: the hooks join into a broken
// lightning ring. Stroke only; the hooks take the hit colour; ready = the shared 4 nodes.
registerCrosshair('xh_staff', {
  state: () => `${XS.lock ? 1 : 0}|${XS.marks}|${XS.chain ? 1 : 0}`,
  draw(gap, c, s, c2) {
    const Rr = (XS.lock ? 9 : 12) + gap * 0.6, rot = XS.lock ? 45 : 0;
    let o = '';
    for (let k = 0; k < 4; k++) {
      const a = (45 + k * 90 + rot) * D2R, ux = Math.sin(a), uy = -Math.cos(a), nx = -uy, ny = ux, u = 2.2;
      const P = (r, t) => `${(ux * (Rr + r) + nx * t).toFixed(2)} ${(uy * (Rr + r) + ny * t).toFixed(2)}`;
      // a hook: out along the radius, across, back in, a small inner turn (square spiral)
      o += `<path class="a" d="M${P(0, -u)} L${P(0, u)} L${P(2.6 * u / 2.2 * 1.6, u)} L${P(2.6 * u / 2.2 * 1.6, -u * 0.4)} L${P(1.2, -u * 0.4)}" fill="none" stroke="${c}" stroke-width="1.5" stroke-linejoin="miter"/>`;
    }
    if (XS.chain) {
      const r = Rr + 7;
      for (let k = 0; k < 8; k++) { const a0 = (k * 45 + 8) * D2R, a1 = (k * 45 + 37) * D2R, am = (a0 + a1) / 2; o += `<path d="M${(Math.sin(a0) * r).toFixed(1)} ${(-Math.cos(a0) * r).toFixed(1)} L${(Math.sin(am) * (r + 2)).toFixed(1)} ${(-Math.cos(am) * (r + 2)).toFixed(1)} L${(Math.sin(a1) * r).toFixed(1)} ${(-Math.cos(a1) * r).toFixed(1)}" fill="none" stroke="${c2}" stroke-width="1.1" opacity="0.9"/>`; }
    }
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 4.2, y = Rr + 8.5, on = i < XS.marks;
      o += `<rect x="${(x - 1.3).toFixed(2)}" y="${(y - 1.3).toFixed(2)}" width="2.6" height="2.6" transform="rotate(45 ${x.toFixed(2)} ${y.toFixed(2)})" fill="${on ? c2 : 'none'}" stroke="${on ? c2 : c}" stroke-width="${on ? 0.4 : 0.7}" opacity="${on ? 1 : XS.lock ? 0.55 : 0.25}"/>`;
    }
    return o;
  },
  nodes: 30,
});
injectCSS('cf-xh-staff', `.xh2.act path.a { filter: drop-shadow(0 0 2px currentColor); }`);

// ------------------------------------------------------------------------------------- damage numbers (§1.9 #6)
// the mythic skin as thunder: white-cyan top -> sky -> indigo, gold edge
SKINS.staff = ['#f0fcff', '#8fe6ff', '#2a5fc8', '#e8b54a'];

// ------------------------------------------------------------------------------------- kill mark (§1.9 #8)
// km_staff: a dark roundel in a gold 雲雷紋 border; the 應龍 head in profile (open jaws, antler, flame mane) under an
// armillary ring holding the 雷珠. Beats: (1) gold strokes draw the roundel, the meander and the head (0-0.45 s); (2) the
// head fills with bronze, the wing with jade (0.45-0.8); (3) glow (0.8-1.0); (4) 點睛: a bolt strikes down into the pearl,
// the dragon's eye flashes (1.0-1.15). Headshot: a cross flare and a cyan burst ring off the pearl.
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const seg = (t, a, b) => ease((t - a) / (b - a));
// the head in profile (facing right), units of S/100
const HEAD = [[30, 70], [34, 60], [40, 54], [48, 50], [56, 50], [64, 47], [72, 46], [78, 43], [80, 47], [76, 50], [70, 52], [62, 55], [70, 58], [76, 60], [72, 64], [62, 63], [52, 66], [44, 72], [36, 76]];
const MANE = [[30, 70], [22, 64], [26, 62], [18, 56], [24, 55], [16, 48], [26, 50], [34, 60]];
const ANTLER = [[40, 53], [36, 44], [30, 36], [26, 30]];
registerKillMark('km_staff', {
  scale: 1.6,
  draw(ctx, Sz, t, o) {
    const U = Sz / 100, p1 = seg(t, 0, 0.45), p2 = seg(t, 0.45, 0.8), p3 = seg(t, 0.8, 1.0), p4 = seg(t, 1.0, 1.15);
    const X = (x) => x * U, cx = 50, cy = 55, RR = 38;
    ctx.clearRect(0, 0, Sz, Sz);
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.globalAlpha = 0.9 * Math.max(p1, 0.0001); ctx.fillStyle = '#0a1016'; ctx.beginPath(); ctx.arc(X(cx), X(cy), X(RR), 0, TAU); ctx.fill();
    // gold rim + square-spiral meander inside it
    ctx.globalAlpha = 1; ctx.strokeStyle = '#e8b54a'; ctx.lineWidth = 1.8 * U; ctx.setLineDash([240 * U]); ctx.lineDashOffset = 240 * U * (1 - p1);
    ctx.beginPath(); ctx.arc(X(cx), X(cy), X(RR), 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.lineWidth = 0.8 * U;
    const nM = 16;
    for (let k = 0; k < Math.floor(nM * p1); k++) {
      const a = k / nM * TAU, r0 = RR - 3.2, ca = Math.cos(a), sa = Math.sin(a), tx = -sa, ty = ca, q = 1.6;
      const P = (r, tt) => [X(cx + ca * r + tx * tt), X(cy + sa * r + ty * tt)];
      ctx.beginPath(); ctx.moveTo(...P(r0 + q, -q)); ctx.lineTo(...P(r0 - q, -q)); ctx.lineTo(...P(r0 - q, q)); ctx.lineTo(...P(r0 + q * 0.4, q)); ctx.lineTo(...P(r0 + q * 0.4, -q * 0.2)); ctx.stroke();
    }
    // armillary ring + pearl over the open mouth
    const ax = 64, ay = 33;
    ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = 1.3 * U; ctx.setLineDash([80 * U]); ctx.lineDashOffset = 80 * U * (1 - p1);
    ctx.beginPath(); ctx.arc(X(ax), X(ay), X(11), 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(X(ax), X(ay), X(11), X(4), 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    // wing behind the head (jade cells)
    const wing = new Path2D(); wing.moveTo(X(36), X(62)); wing.quadraticCurveTo(X(16), X(40), X(20), X(22)); wing.quadraticCurveTo(X(30), X(36), X(34), X(40)); wing.quadraticCurveTo(X(36), X(30), X(42), X(24)); wing.quadraticCurveTo(X(42), X(42), X(44), X(56)); wing.closePath();
    if (p2 > 0) { ctx.globalAlpha = p2 * 0.95; const gr = ctx.createLinearGradient(X(20), X(22), X(40), X(60)); gr.addColorStop(0, '#1f7f86'); gr.addColorStop(1, '#2f8f6e'); ctx.fillStyle = gr; ctx.fill(wing); ctx.globalAlpha = 1; }
    ctx.strokeStyle = '#e8b54a'; ctx.lineWidth = 1.0 * U; ctx.setLineDash([120 * U]); ctx.lineDashOffset = 120 * U * (1 - p1); ctx.stroke(wing); ctx.setLineDash([]);
    // head + mane
    const head = new Path2D(); HEAD.forEach(([x, y], i) => head[i ? 'lineTo' : 'moveTo'](X(x), X(y))); head.closePath();
    const mane = new Path2D(); MANE.forEach(([x, y], i) => mane[i ? 'lineTo' : 'moveTo'](X(x), X(y))); mane.closePath();
    if (p2 > 0) { ctx.globalAlpha = p2; const gr = ctx.createLinearGradient(X(30), X(46), X(80), X(70)); gr.addColorStop(0, '#5a3e1c'); gr.addColorStop(0.6, '#9a7440'); gr.addColorStop(1, '#c8995a'); ctx.fillStyle = gr; ctx.fill(head); ctx.fill(mane); ctx.globalAlpha = 1; }
    ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = 1.4 * U; ctx.setLineDash([260 * U]); ctx.lineDashOffset = 260 * U * (1 - p1); ctx.stroke(head); ctx.stroke(mane); ctx.setLineDash([]);
    ctx.lineWidth = 1.6 * U; ctx.beginPath(); ANTLER.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](X(x), X(y))); ctx.stroke();
    ctx.lineWidth = 1.1 * U; ctx.beginPath(); ctx.moveTo(X(34), X(41)); ctx.lineTo(X(28), X(40)); ctx.moveTo(X(31), X(35)); ctx.lineTo(X(36), X(30)); ctx.stroke();
    // whisker
    ctx.lineWidth = 0.8 * U; ctx.beginPath(); ctx.moveTo(X(78), X(48)); ctx.quadraticCurveTo(X(90), X(56), X(80), X(70)); ctx.quadraticCurveTo(X(74), X(78), X(82), X(82)); ctx.stroke();
    // pearl
    const pr = 4.6 * U, px = X(ax), py = X(ay);
    if (p2 > 0) { ctx.globalAlpha = p2; const gg = ctx.createRadialGradient(px, py, 0, px, py, pr); gg.addColorStop(0, '#ffffff'); gg.addColorStop(0.5, '#bff0ff'); gg.addColorStop(1, '#3f9fe0'); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
    // eye
    const ex = X(52), ey = X(55);
    ctx.fillStyle = p4 > 0 ? `rgba(220,250,255,${0.6 + 0.4 * Math.sin(p4 * Math.PI)})` : '#ffd36b'; ctx.beginPath(); ctx.arc(ex, ey, 1.3 * U, 0, TAU); ctx.fill();
    // beat 3 glow
    if (p3 > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.3 * p3 * (1 - p4 * 0.5); const gg = ctx.createRadialGradient(px, py, 2 * U, X(cx), X(cy), X(RR + 4)); gg.addColorStop(0, 'rgba(150,230,255,0.7)'); gg.addColorStop(1, 'rgba(40,90,200,0)'); ctx.fillStyle = gg; ctx.fillRect(0, 0, Sz, Sz); ctx.restore(); }
    // beat 4: the bolt from the top of the roundel into the pearl
    if (p4 > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const fl = Math.sin(p4 * Math.PI), pts = [[ax - 4, 14], [ax + 2, 19], [ax - 2, 23], [ax + 1, 27], [ax, ay - 4.6]];
      ctx.strokeStyle = `rgba(230,250,255,${fl})`; ctx.lineWidth = 1.6 * U; ctx.beginPath(); pts.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](X(x), X(y))); ctx.stroke();
      ctx.fillStyle = `rgba(200,245,255,${fl * 0.9})`; ctx.beginPath(); ctx.arc(px, py, pr * (1 + 1.8 * fl), 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(240,252,255,${fl})`; ctx.lineWidth = 1.1 * U;
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 4 + 0.39, L = (k % 2 ? 8 : 13) * U * fl; ctx.beginPath(); ctx.moveTo(px - Math.cos(a) * L, py - Math.sin(a) * L); ctx.lineTo(px + Math.cos(a) * L, py + Math.sin(a) * L); ctx.stroke(); }
      if (o.head) {
        ctx.lineWidth = 1.5 * U; ctx.beginPath(); ctx.moveTo(px - 18 * U * fl, py); ctx.lineTo(px + 18 * U * fl, py); ctx.moveTo(px, py - 18 * U * fl); ctx.lineTo(px, py + 18 * U * fl); ctx.stroke();
        ctx.strokeStyle = `rgba(110,220,255,${Math.max(0, 1 - p4 * 0.5)})`; ctx.lineWidth = 2 * U; ctx.beginPath(); ctx.arc(px, py, pr * (1.6 + 3.2 * p4), 0, TAU); ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  },
});
