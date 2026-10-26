// X04 應龍．御霆 Yinglong Stormherald — 神兵 magic staff (docs/PREMIUM_WEAPONS.md §2.31). Mechanics on the specials v2
// engine (registerSpecial 'staff' + skills) and the whole presentation: the staff's own trigger (mana, homing darts), the
// 雷印 marks, the viewmodel driver (armillary spin, wings, the 雷珠's plasma, the casting hand), clips, crosshair, kill
// mark, damage-number skin. Effect primitives: staff_fx.js. Model: tools/assets/weapons/staff.mjs.
//
//   LMB held   雷矢: a dart every 0.15 s (4 mana, 36, head x2) flung out of the armillary's flank; the crosshair on a
//              zombie = that one and the very hitbox under it (aim at the head, home to the head); else it locks the
//              nearest zombie in a 12° cone (in sight) and bends into its chest (600°/s after 0.08 s), else flies to the
//              crosshair point. Each hit leaves a 雷印 (≤ 3, 4 s): seal rings on the chest (small, gone up close).
//   mana       ws.ammo of 100 (HUD: mana pool); back at 20/s 0.5 s after the last cast; R 引雷 (1.2 s) tops it up with a
//              bolt from the sky into the 雷珠; dry = automatic 引雷.
//   RMB held   連霆: a lightning chain from the 雷珠 to the zombie under the crosshair (8° cone, 22 m) and on through four
//              more within 6 m of each other: 150/s on the first, x0.8 a jump, +20 % a mark, 45 % slow, flinch; 22 mana/s.
//              A link reaching a 3-mark target = 雷爆 (2.5 m, 120, marks cleared, 霆勢 +4).
//   Q          雷池 (35 霆勢): a 6.5 m thunder field for 5 s at the crosshair (a zombie under it pins it to its feet): an
//              opening strike 220, 40/s and 50 % slow inside, a strike on someone inside every 0.5 s (110), and the
//              electric fence: whoever tries to cross the rim from outside is thrown back 2.5 m (「不敢越雷池一步」).
//   hold Q     應龍．震霄 (5,000 damage): the 5-beat summon — thunder sigil, a storm cloud, a bolt and the winged dragon
//              dissolving out of it; it circles across the caster's view, dives three times (160 in 3 m + chain 3 x 60),
//              rises while the field's zombies are dragged into the middle, and comes down on them as a lightning
//              column (1,000, 7 m); then 甘霖, 5 s of rain healing teammates 6 HP/s under the storm.
//   crisis     雷鱗甲: the default knock-back block with a lightning ring and jade scale chips.
//   kill       KE_THUNDER (a bolt from above, arcs crawling over the corpse, a branching scorch); km_staff; skin 'staff'.
// Sound cues (§1.12, tools/audio/producers/premium_staff.mjs; each has a stock fallback): SND below and the card's list.
import * as THREE from 'three';
import { registerSpecial, registerSkill, meterAdd, meterEvent, canCast, chargeState, addAura } from '../specials.js';
import { registerClip, drawClip } from '../../player/clips.js';
import { registerCrosshair, injectCSS } from '../../ui/crosshairs.js';
import { registerKillMark } from '../../ui/killmarks.js';
import { SKINS } from '../../ui/dmgnums.js';
import { HAND_POSES } from '../../player/ik.js';
import { FRAME, DECAL, DECAL_TINT } from '../../fx/fx.js';
import { haptic, clipComfort } from '../arsenal.js';
import { COL, k3, sfx, gunAxes, dartMesh, freeDart, dartTrails, dartSpark, castFlash, dartImpact, MarkLayer, Chain, skyStrike, rubble, vmArc, Fence, stormCloud, rain, dragonGeometry, thunderKill, warmMeshes } from './staff_fx.js';

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
  // 劍指 held up beside the line of fire (fingers up and forward, palm turned in): a casting hand, not a finger gun
  point: { pos: [0.19, -0.16, -0.52], F: [-0.18, 0.92, -0.45], N: [-0.95, -0.05, -0.25], pose: 'swordFingers', palm: [0.02, 0.05] },
  slap: { pos: [0.16, -0.24, -0.54], F: [-0.25, -0.2, -1], N: [0, -1, 0.1], pose: 'sealPalm', palm: [0.015, 0.045] },
  sky: { pos: [0.24, -0.08, -0.58], F: [-0.1, 1, -0.45], N: [-0.85, 0, -0.3], pose: 'swordFingers', palm: [0.02, 0.05] },
  claw: { pos: [0.2, -0.2, -0.56], F: [-0.2, 0.3, -1], N: [-0.3, -0.2, -0.9], pose: 'dragonClaw', palm: [0.02, 0.05] },
  // 引雷 seal: the palm raised right of the crosshair lane, below the 雷珠 (which stays in sight over the fingertips), turned to it
  seal: { pos: [-0.06, -0.165, -0.47], F: [-0.22, 0.93, -0.3], N: [-0.85, 0.15, -0.5], pose: 'sealPalm', palm: [0.015, 0.045] },
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
      else { if (inp.pressed.fire) play(g, 'dry', { volume: 0.7 }); ar.reload(); }   // dry: 引雷 by itself
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
    if (s.fingerArc && !(held && mine(g, ws))) { s.fingerArc.stop(); s.fingerArc = null; }
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
    s.fingerArc?.stop(); s.fingerArc = null;
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
    if (arg.pearl) { flashPearl(ws, arg.pearl - 1); pearlFlare(g, arg.pearl, arg.still === false ? { ring: false, life: 0.5 } : undefined); }
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
  const wh = g.world?.collision?.raycast(cam.position, _dir, B.range);
  // aimed: the crosshair is on a zombie -> that one, and the dart homes to the very hitbox under it (a head stays a head)
  const rh = g.targets?.raycast?.(cam.position, _dir, B.range)?.find((h) => !wh || h.dist < wh.dist + 0.05);
  const rz = rh ? rh.target.zombie || rh.target : null;
  const tgt = rz?.alive ? rz : s.lock && s.lock.alive ? s.lock : pickTarget(g, cam.position, _dir, B.cone, B.range);
  const aim = cam.position.clone().addScaledVector(_dir, wh ? Math.max(1, wh.dist - 0.05) : B.range);
  _rgt.set(1, 0, 0).applyQuaternion(cam.quaternion); _upc.set(0, 1, 0).applyQuaternion(cam.quaternion);
  // flung out of the armillary's flank: launched outward and up, it bends back into the line (a homing arc you see)
  // (flare toward the side the dart leaves from; up only when the target is not below the line)
  const tc = tgt ? tgt.center(V3()).sub(cam.position) : null, tdist = tc ? tc.length() : 99;
  const flare = !tgt ? 0.06 : tdist < 5 ? 0.02 : tdist < 9 ? 0.1 : 0.17, below = tc ? Math.min(0, tc.normalize().dot(_upc)) : 0;
  const v0 = _dir.clone().addScaledVector(_rgt, s.side * flare).addScaledVector(_upc, flare * 0.5 + below * 0.6).normalize();
  const from = own ? vm.socketApparent?.(s.side > 0 ? 'boltR' : 'boltL', V3()) : null;
  const d = { ws, pos: cam.position.clone(), dir: v0, t: 0, tgt, aim, dist: 0, mesh: dartMesh(g.scene), trails: dartTrails(g), side: s.side, vis: V3(), spin: R() * TAU,
    off: from ? from.sub(cam.position) : new THREE.Vector3(0, -0.12, 0), seen: new Set(), box: rz === tgt ? rh.box : null, part: rz === tgt ? rh.part : 'body', last: null, trav: 0 };
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
/** where a dart steers: the hitbox it was aimed at (its middle), else the target's chest */
function aimPoint(d, out) {
  const z = d.tgt;
  if (d.box && z.hitboxes) {
    if (z.mgr && z.hbFrame !== z.mgr.frame) z.updateHitboxes?.();
    const h = z.hitboxes.find((b) => b.name === d.box);
    if (h) return out.copy(h.p0).add(h.p1).multiplyScalar(0.5);
  }
  return z.center(out);
}
const PITCH = 1.15;   // m of flight per turn of the double helix
function place(d, g) {
  const u = Math.max(0, 1 - d.t / 0.14);
  d.vis.copy(d.pos).addScaledVector(d.off, u * u);
  d.mesh.position.copy(d.vis);
  // flicker; near the eye the seed shrinks (a dart leaving the staff must not bloom over the crosshair)
  const dc = d.vis.distanceTo(g.camera.position), near = Math.max(0.12, Math.min(1, (dc - 0.4) / 4));
  d.mesh.scale.setScalar((1 + 0.25 * Math.sin(d.t * 60 + d.spin)) * near);
  // two strands spiralling round the flight line, one turn per PITCH m: sampled every ~8 cm along this frame's
  // flight (a frame covers 0.7-1 m, one point a frame would alias the helix into a straight line)
  _rgt.set(0, 1, 0).cross(d.dir); if (_rgt.lengthSq() < 1e-4) _rgt.set(1, 0, 0); _rgt.normalize();
  _upc.copy(d.dir).cross(_rgt);
  const L = d.last ? d.last.distanceTo(d.vis) : 0, n = d.last ? Math.min(16, Math.max(1, Math.ceil(L / 0.08))) : 1;
  for (let i = 1; i <= n; i++) {
    const k = i / n, tr = d.trav + L * k, a = d.spin + tr / PITCH * TAU, r = 0.06 * smooth(tr / 2.5);   // tight by the eye, full 2.5 m out
    if (d.last) _b.lerpVectors(d.last, d.vis, k); else _b.copy(d.vis);
    d.trails[0]?.push(_a.copy(_b).addScaledVector(_rgt, Math.cos(a) * r).addScaledVector(_upc, Math.sin(a) * r));
    d.trails[1]?.push(_a.copy(_b).addScaledVector(_rgt, -Math.cos(a) * r).addScaledVector(_upc, -Math.sin(a) * r));
  }
  d.trav += L;
  (d.last ||= V3()).copy(d.vis);
  d.trails[2]?.push(d.vis);
}
function endDart(d) { for (const t of d.trails) t?.stop(); freeDart(d.mesh); }
function stepDart(g, d, dt) {
  const B = d.ws.def.staff.bolt, col = g.world?.collision;
  d.t += dt;
  const sp = lerp(B.speed, B.speed1, clamp01(d.t / B.accel));
  // steer: into the locked zombie's chest (or the crosshair point), at most `turn` deg/s after `delay`
  // the locked zombie died under it: carry straight on
  if (d.tgt && !d.tgt.alive) { d.tgt = null; d.aim = d.pos.clone().addScaledVector(d.dir, 30); }
  // a magic dart does not graze past its mark: within 0.55 m of the aimed point it strikes (point blank included); the
  // part it was aimed at is the part it hits (a head-aimed dart that homed in is a headshot)
  if (d.tgt && aimPoint(d, _c).distanceTo(d.pos) < (d.box === 'head' ? 0.32 : 0.55)) { dartHit(g, d, { target: d.tgt, point: _c.clone(), normal: null, part: d.part || 'body', box: d.box, dist: d.dist }); return false; }
  if (d.t > B.delay) {
    const tp = d.tgt ? aimPoint(d, _c) : d.aim;
    _d.subVectors(tp, d.pos);
    const L = _d.length();
    if (L > 1e-3) {
      _d.multiplyScalar(1 / L);
      // the turn rate eases in over 0.2 s (a smooth bend into the target, not a kink)
      const ease = smooth((d.t - B.delay) / 0.2), ang = Math.acos(Math.max(-1, Math.min(1, d.dir.dot(_d)))), mx = B.turn * D2R * dt * (0.25 + 0.75 * ease) * (L < 3 ? 2 : 1);
      if (ang <= mx) d.dir.copy(_d); else d.dir.lerp(_d, mx / ang).normalize();
    }
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
  else play(g, 'mark', { volume: 0.22, pitch: 0.92 + m.n * 0.12 });   // a seal clicks on: a step up a layer
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
  // channelling: a live arc from the pearl down to the casting fingertips every frame (+ a stray one now and then)
  const c = channel ? vm.socketCam?.('pearl', _a) : null, hL = vm.handPos?.L;
  if (c && hL) {
    _b.copy(hL).add(_c.set(0.02, 0.03, -0.09));
    if (!s.fingerArc) s.fingerArc = g.fx?.bolt?.(c, _b, { vm: true, col: k3(COL.white, 0.42), glow: k3(COL.core, 0.42), width: 0.006, core: 0.3, levels: 4, jitter: 0.1, branches: 0, regen: 0.035, life: Infinity });
    s.fingerArc?.set(c, _b);
    if (R() < dt * 6) vmArc(g, c, _b, { w: 0.004, life: 0.06, k: 0.7, levels: 4 });
  } else if (s.fingerArc) { s.fingerArc.stop(); s.fingerArc = null; }
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
/** a flare at the 雷珠 (camera space particles: they stay where they spawned, so a moving clip asks for no ring and a short life) */
function pearlFlare(g, k = 1, { ring = true, life = 1 } = {}) {
  const vm = g.vm, P = g.fx?.particles, c = vm?.socketCam?.('pearl', _a);
  if (!P || !c) return;
  const { f } = gunAxes(vm);
  const kk = Math.min(3, k);
  P.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, life: 0.2 * life, size: 0.03, size1: 0.05 * Math.min(2, kk), color: [...k3(COL.rim, 0.3 * kk), 1], color1: [0, 0, 0, 0], frame: FRAME.glow });
  if (ring) P.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, mode: 'flat', dir: [f.x, f.y, f.z], life: 0.24 * life, size: 0.025, size1: 0.065 * Math.min(1.6, kk), sizePow: 0.5, color: [...k3(COL.rim, 0.35), 1], color1: [0, 0, 0, 0], frame: FRAME.thinRing });
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
  g.fx?.bolt?.(top, c.clone(), { vm: true, col: k3(COL.white, 0.9), glow: k3(COL.core, 0.55), width: 0.02, core: 0.26, levels: 5, jitter: 0.1, branches: 2, regen: 0.04, life: 0.17 });
  g.fx?.beam?.(top, c, { vm: true, core: k3(COL.white, 0.3), glow: k3(COL.core, 0.3), wCore: 0.006, wGlow: 0.06, life: 0.15, shrink: 0.4 });
  pearlFlare(g, 3);
  pearlArcs(g, 5, 1.7);
  flashPearl(ws, 2);
  g.fx?.lights?.flash?.(g.camera.position.clone().add(_b.set(0, 1, 0)), 0xbfe8ff, 22, 4, 0.12);
  if (clipComfort.overlay !== false) g.fx?.overlay?.tint?.([0.75, 0.98, 1.4], 0.12, 0.08);
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
    fx?.beam?.(far, far2, { wGlow: 0.001, life: 0.05 });
    // the staff's own programs (dart sprites, fence wall, storm disc, the mark layer) compiled in parallel now
    const gl = g.renderer?.gl;
    if (g.scene && gl?.compileAsync) {
      const grp = new THREE.Group();
      grp.name = 'staff-warmup';
      for (const o of warmMeshes(g.scene)) grp.add(o);
      g.scene.add(grp);
      // with the scene's lights and into the HDR target the frame renders to: even unlit programs are keyed on the
      // light counts, shadows and tone mapping, so a bare compile builds a twin the first dart does not use
      const prev = gl.getRenderTarget();
      try {
        if (g.renderer.rt) gl.setRenderTarget(g.renderer.rt);
        gl.compileAsync(grp, g.camera, g.scene).catch(() => {}).finally(() => grp.removeFromParent());
        for (const m of [g._sfMarks?.seal, g._sfMarks?.lock]) if (m) gl.compileAsync(m, g.camera, g.scene).catch(() => {});
      } finally { gl.setRenderTarget(prev); }
    }
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
    d.chain = new Chain(g); d.acc = 0; d.re = 0; d.list = []; d.scorchT = 0; d.roll = new Map();
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
          rollHit(g, d, z, info, res);
          ar?._special?.(ws, 'onHit', info, res, z);
          if (!res?.killed && marks >= ws.def.staff.mark.max) burst(ws, g, z);
        });
      }
      // the arc scorches the street under the first target
      const z0 = d.list[0];
      if (z0 && (d.scorchT -= dt) <= 0) { d.scorchT = 0.35; g.fx?.decals?.add(_c.set(z0.pos.x + (R() - 0.5) * 0.3, z0.pos.y + 0.02, z0.pos.z + (R() - 0.5) * 0.3), UPV, { frame: DECAL.scorch, size: 0.5 + R() * 0.3, tint: DECAL_TINT.scorch, life: 5 }); }
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

/**
 * A channel tick's damage number: ticks on a target are summed and every 0.25 s added into the number already rising
 * off it (one rolling total with a pop), instead of ten small numbers a second stacking over the horde.
 */
function rollHit(g, d, z, info, res) {
  const e = d.roll.get(z) || { sum: 0, at: -9 };
  d.roll.set(z, e);
  e.sum += res?.damage || 0;
  if (g.time - e.at < 0.25 && !res?.killed) return;
  const sum = e.sum;
  e.sum = 0; e.at = g.time;
  if (g.hud?.nums?.bump?.(z, sum, 0.5)) { if (res?.killed) g.hud.onHit?.(info, { ...res, damage: 0 }, z); return; }
  g.hud?.onHit?.({ ...info, amount: sum }, { ...res, damage: sum }, z);
}

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
      skyStrike(g, c, { size: 1.8, near: 0.45 + 0.55 * near, tint: clipComfort.overlay !== false });
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
    d.sig?.stop?.(); d.loop?.stop?.(0.3); d.fence?.dispose();
    if (d.on) play(k.game, 'poolEnd', { pos: d.c, volume: 0.6 });
  },
});

// ★ held 應龍．震霄: sigil -> storm cloud -> a bolt and the dragon -> three dives -> the pull -> the lightning column -> 甘霖.
const ULT = { cloud: 0.3, descend: 0.7, dives: [1.4, 2.2, 3.0], rise: 3.55, fall: 3.85, impact: 4.15, rain: 4.3 };
registerSkill('staff_ult', {
  level: 'L4', aim: 'target', dur: 4.8, defaults: { range: 35, r: 9, dive: 160, diveR: 3, chain: 60, chainN: 3, final: 1000, finalR: 7, pullR: 10, pull: 5, rain: 6, rainR: 9, rainDur: 5 },
  start(k) {
    const g = k.game, d = k.data, c = k.at.clone();
    d.c = c; d.beat = 0; d.dive = 0; d.cloudH = 12;
    const eye = d.eye = k.caster(V3(), _b).clone();
    d.side = new THREE.Vector3(c.x - eye.x, 0, c.z - eye.z);
    if (d.side.lengthSq() < 1e-4) d.side.set(_b.x, 0, _b.z);
    d.side.normalize();
    // the dragon circles in front of the caster's view, across the line of sight and low (10-14 deg over the eye line,
    // never nearer than ~10 m): an orbit centred a little short of the field, not high over it off the top of the screen
    const D = Math.hypot(c.x - eye.x, c.z - eye.z);
    d.oc = new THREE.Vector3(eye.x, c.y, eye.z).addScaledVector(d.side, Math.max(D - 2, 14));
    d.phase0 = Math.PI * (k.rng() < 0.5 ? 0.5 : -0.5);   // it leaves the cloud swinging to one side, then across
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
    const g = k.game, d = k.data, p = k.p, t = k.t, c = d.c, fx = g.fx, tint = k.local && clipComfort.overlay !== false;
    if (d.beat < 1 && t >= ULT.cloud) {
      d.beat = 1;
      d.sig = fx?.sigils?.sigil?.(_a.set(c.x, c.y + 0.04, c.z), { design: 'thunder', radius: p.r, color: k3(COL.core, 0.42), color1: k3(COL.deep, 0.5), intensity: 0.8, life: 4.6, seed: k.ev.seed });
      // the storm hangs on over 甘霖 (its own system)
      d.cloud = stormCloud(g, c, { h: d.cloudH, r: 11, life: ULT.rain + p.rainDur + 0.3 - ULT.cloud, storm: ULT.impact - ULT.cloud + 0.2 });
      play(g, 'ultCloud', { pos: c, volume: 0.9 });
    }
    if (d.cloud && t < ULT.impact && R() < dt * 2.5) d.cloud.flash(0.8);
    if (d.beat < 2 && t >= ULT.descend) {
      d.beat = 2;
      fx?.sigils?.pillar?.(c, { radius: 1.6, height: d.cloudH + 2, color: k3(COL.core, 0.7), color1: k3(COL.deep, 0.5), life: 0.55 });
      skyStrike(g, c, { size: 2.4, height: d.cloudH, near: nearK(g, c), tint });
      d.cloud?.flash(1.4, c);
      _dragonGeo ||= dragonGeometry();
      d.pos = new THREE.Vector3(c.x, c.y + d.cloudH - 2, c.z);
      d.dragon = fx?.summons?.ghost?.({ geometry: _dragonGeo, pos: d.pos, size: 12, base: [0.16, 0.46, 0.4], core: [0.5, 1.9, 2.4], rim: [0.45, 1.7, 1.6], edge: k3(COL.white, 0.6), opacity: 0.68, glaze: 0.7,
        appear: 0.5, life: Infinity, out: 0.6, motion: 'free', flap: { amp: 0.5, hz: 1.3 }, wave: { amp: 0.07, hz: 0.9, axis: [1, 0, 0], len: 1.3 }, exit: { kind: 'goldpaper', count: 40, speed: 5 }, big: true, seed: k.ev.seed });
      // a lightning ribbon streaming off its tail
      d.trail = fx?.trail?.({ width: 1.4, life: 0.45, color: [...k3(COL.core, 0.42), 1], color1: [...k3(COL.deep, 0.25), 0], taper: 0.05, segs: 32, profile: 'soft' });
      play(g, 'roar', { pos: c, volume: 1 });
      if (k.local) g.addShake?.(0.3);
    }
    if (d.dragon) fly(k, dt);
    // the climb: the field's zombies are dragged into the middle under the dragon, for the column to take together
    if (t >= ULT.rise && t < ULT.impact) pull(k, dt);
    if (d.beat < 3 && t >= ULT.impact) {
      d.beat = 3;
      fx?.sigils?.pillar?.(c, { radius: 2.4, height: 22, color: k3(COL.white, 0.6), color1: k3(COL.core, 0.7), life: 0.6 });
      skyStrike(g, c, { size: 3.4, height: 20, near: nearK(g, c), tint });
      d.cloud?.flash(2, c);
      fx?.zfx?.quake?.(c, p.finalR, { col: k3(COL.core, 0.5), scale: 1.3, crack: true });
      fx?.zfx?.ground?.add?.('crack', _a.set(c.x, c.y + 0.03, c.z), { r: p.finalR * 0.8, life: 3, col: k3(COL.core, 0.6), alpha: 0, fadeIn: 0.01, fadeOut: 2 });
      rubble(g, c, 22, 10);
      fx?.motes?.burst?.('goldpaper', _a.set(c.x, c.y + 1.5, c.z), 30, { seed: k.ev.seed + 7, speed: 5, radius: 2 });
      d.dragon?.flash?.(2); d.dragon?.dissolveOut?.(0.6); d.trail?.stop(); d.trail = null;
      play(g, 'ultFinal', { pos: c, volume: 1 });
      if (k.local) {
        const n = k.hurt(c, p.finalR, p.final, { knock: 10, stagger: 1, falloffMin: 0.4 });
        g.addShake?.(0.55 * (0.4 + 0.6 * nearK(g, c)));
        // the stop belongs to a hit: a column into an empty street keeps the frame moving
        if (n) { stop(g, 110); haptic(60); setTimeout(() => haptic(40), 110); }
        if (clipComfort.overlay !== false) g.fx?.overlay?.radial?.(0.8, 0.3, { color: [0.8, 1.2, 1.7], r0: 0.34 });
      }
    }
    if (d.beat < 4 && t >= ULT.rain) {
      d.beat = 4;
      // 甘霖 outlives the skill (its own system): each client heals its own player inside it
      const r = rain(g, c, p.rainR, p.rainDur), snd = play(g, 'ultRain', { pos: c, loop: true, volume: 0.6 });
      const sys = { update: (dt2) => { if (!r.update(dt2)) { r.stop(); snd?.stop?.(0.6); g.systems.splice(g.systems.indexOf(sys), 1); } } };
      g.systems.push(sys);
      addAura(g, { type: 'regen', mul: p.rain, radius: p.rainR, pos: c, dur: p.rainDur, by: k.by });
      fx?.motes?.burst?.('ember', _a.set(c.x, c.y + 1, c.z), 16, { seed: k.ev.seed + 3, speed: 2, radius: 3, color: k3(COL.core, 0.4) });
    }
    return t < ULT.rain + 0.3;
  },
  end(k) {
    const d = k.data;
    d.sig?.stop?.(); d.border?.stop?.(0.4); d.trail?.stop();
    if (d.dragon?.alive) d.dragon.dissolveOut?.(0.3);
  },
});
const nearK = (g, c) => Math.min(1, 0.35 + c.distanceTo(g.camera.position) / 14);
/** the rise beat: zombies within pullR slide into the middle, staggered; dust and sparks dragged in along the ground */
function pull(k, dt) {
  const g = k.game, d = k.data, p = k.p, c = d.c, fx = g.fx;
  if (R() < dt * 30) {
    const a = R() * TAU, r = p.pullR * (0.6 + R() * 0.4);
    _a.set(c.x + Math.cos(a) * r, c.y + 0.05, c.z + Math.sin(a) * r);
    fx?.knockDust?.(_a, _b.set(-Math.cos(a) * 6 - Math.sin(a) * 2, 0, -Math.sin(a) * 6 + Math.cos(a) * 2), 0.9);
    fx?.particles?.spawn({ additive: true, x: _a.x, y: c.y + 0.3 + R() * 1.2, z: _a.z, vx: -Math.cos(a) * 9 - Math.sin(a) * 4, vy: 0.5, vz: -Math.sin(a) * 9 + Math.cos(a) * 4, life: 0.35, size: 0.02, color: [...k3(COL.rim, 0.7), 1], color1: [...k3(COL.core, 0.2), 0], frame: FRAME.spark, stretch: 0.06 });
  }
  if (!k.local) return;
  for (const z of g.targets?.inRadius?.(c, p.pullR) || []) {
    if (!z.alive || z.def?.boss || !z.kvel || !z.pos) continue;
    const dx = c.x - z.pos.x, dz = c.z - z.pos.z, dd = Math.hypot(dx, dz);
    if (dd < 0.8) continue;
    const sp = Math.min(p.pull, dd * 1.4);
    z.kvel.x = dx / dd * sp; z.kvel.z = dz / dd * sp;
    if (z.state === 'chase' || z.state === 'attack') { z.state = 'stagger'; z.stateT = 0; }
    if (R() < dt * 3) g.fx?.zfx?.status?.(z, 'shocked', 0.3);
  }
}
/**
 * The dragon's flight: out of the cloud into an orbit across the caster's view (about 11 deg above the eye line), three
 * dives (the first at the zombie nearest the caster: it swoops through the foreground), a climb, the fall into the column.
 */
function fly(k, dt) {
  const g = k.game, d = k.data, p = k.p, t = k.t, c = d.c, h = d.dragon;
  if (!h?.alive) return;
  const prev = d.pos.clone(), eye = d.eye, f = d.side, rt = new THREE.Vector3(-f.z, 0, f.x);
  const orbit = (tt) => {
    const a = (tt - ULT.descend) * 1.6 + d.phase0;
    const P = V3().copy(d.oc).addScaledVector(f, Math.sin(a) * 4).addScaledVector(rt, Math.cos(a) * 9);
    P.y = Math.max(c.y + 5, eye.y + Math.hypot(P.x - eye.x, P.z - eye.z) * 0.24) + Math.sin(tt * 2.1) * 0.5;
    return P;
  };
  let pos;
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
        if (k.local) {
          const zs = (g.targets?.inRadius?.(c, p.r + 3) || []).filter((z) => z.alive);
          // (never at the caster's feet: a 12 m dragon diving within arm's reach would wash the whole screen)
          const far = zs.filter((z) => Math.hypot(z.pos.x - eye.x, z.pos.z - eye.z) > 9);
          if (far.length) tg = i ? far[(R() * far.length) | 0] : far.reduce((a, z) => (z.pos.distanceTo(eye) < a.pos.distanceTo(eye) ? z : a));
        }
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
  } else if (t < ULT.fall) pos = orbit(ULT.rise).lerp(V3().set(c.x, c.y + 9, c.z), smooth((t - ULT.rise) / (ULT.fall - ULT.rise)));   // the climb stays in frame
  else pos = V3().set(c.x, c.y + lerp(9, 1.5, smooth((t - ULT.fall) / (ULT.impact - ULT.fall))), c.z);
  // keep the body clear of the camera (it is 12 m long, the wings 10 m across)
  _a.subVectors(pos, eye);
  if (_a.length() < 8.5) pos.copy(eye).addScaledVector(_a.normalize(), 8.5);
  d.pos.copy(pos);
  h.obj.position.copy(pos);
  const vel = _e.subVectors(pos, prev);
  if (vel.lengthSq() > 1e-6) { h.obj.up.set(0, 1, 0); h.obj.lookAt(_a.copy(pos).sub(vel)); }
  // the tail streams a lightning ribbon; arcs crawl off the body, gold and cyan sparks shed behind it
  h.obj.updateMatrixWorld();
  d.trail?.push(h.obj.localToWorld(V3().set(0, 0, 0.52)));
  if ((d.arcT = (d.arcT ?? 0) - dt) <= 0) {
    d.arcT = 0.07 + R() * 0.06;
    const a = h.obj.localToWorld(V3().set((R() - 0.5) * 0.05, 0.02, -0.3 + R() * 0.7)), b = a.clone().add(_b.set((R() - 0.5) * 3, (R() - 0.5) * 2.5, (R() - 0.5) * 3));
    g.fx?.bolt?.(a, b, { col: k3(COL.white, 0.6), glow: k3(COL.core, 0.4), width: 0.12, core: 0.22, levels: 4, jitter: 0.2, branches: 1, regen: 0.04, life: 0.1 });
  }
  const P = g.fx?.particles;
  if (P && R() < dt * 40) {
    const b = h.obj.localToWorld(V3().set((R() - 0.5) * 0.08, (R() - 0.5) * 0.05, -0.2 + R() * 0.75)), gold = R() < 0.4, iv = 1 / Math.max(dt, 1e-3);
    P.spawn({ additive: true, x: b.x, y: b.y, z: b.z, vx: (R() - 0.5) * 2 - vel.x * iv * 0.15, vy: (R() - 0.5) * 2 - 1, vz: (R() - 0.5) * 2 - vel.z * iv * 0.15, life: 0.5 + R() * 0.4, size: gold ? 0.06 : 0.04, color: [...k3(gold ? COL.gold : COL.rim, 0.6), 1], color1: [...k3(gold ? COL.gold : COL.core, 0.15), 0], frame: FRAME.spark, stretch: 0.05, gravity: 2 });
  }
}
/** a dive's breath: a fat bolt from the dragon's mouth to the ground, then arcs to the nearest few */
function breath(k, at) {
  const g = k.game, d = k.data, p = k.p, h = d.dragon, fx = g.fx;
  const mouth = h.obj.localToWorld(V3().set(0, 0.02, -0.62));
  fx?.bolt?.(mouth, at.clone().add(_b.set(0, 0.05, 0)), { col: k3(COL.white, 0.9), glow: k3(COL.core, 0.55), width: 0.4, core: 0.24, levels: 6, jitter: 0.06, branches: 3, regen: 0.04, life: 0.3 });
  fx?.beam?.(mouth, at, { core: k3(COL.white, 0.3), glow: k3(COL.core, 0.35), wCore: 0.08, wGlow: 1.0, life: 0.25, shrink: 0.3 });
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
    fx?.bolt?.(from.clone(), c.clone(), { col: k3(COL.white, 0.7), glow: k3(COL.core, 0.45), width: 0.16, core: 0.22, levels: 5, jitter: 0.09, branches: 1, regen: 0.04, life: 0.25 });
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
  gunPos: [[0, Z3], [0.25, [0, 0.04, 0.02], 'out3'], [0.45, [0, -0.02, -0.01]], [1, Z3]], gunRot: [[0, Z3], [0.25, [12, 0, -3], 'out3'], [0.45, [-5, 0, 2]], [1, Z3]] },
  events: [[0.02, 'anchorL', [HAND.slap, 0.1]], [0.05, 'poseL', 'sealPalm'], [0.3, 'haptic', 'tick'], [0.3, S({ pearl: 2, still: false, arcs: 3 })], [0.3, 'shake', 0.06], [0.7, 'anchorL', ['grip_l', 0.18]]] });
// ★ held 震霄: the staff raised to the sky, sword fingers up, then back down as the dragon comes
registerClip('staff_cast_ult', { duration: 1.25, tracks: {
  gunPos: [[0, Z3], [0.22, [0.0, 0.07, 0.03], 'out3'], [0.6, [0.0, 0.075, 0.03]], [1, Z3, 'inOut']],
  gunRot: [[0, Z3], [0.22, [30, -4, -6], 'out3'], [0.6, [32, -4, -6]], [1, Z3, 'inOut']],
  fx_wingL: [[0, 0], [0.2, 1, 'outBack'], [0.85, 1], [1, 1]], fx_wingR: [[0, 0], [0.22, 1, 'outBack'], [0.85, 1], [1, 1]], fx_jaw: [[0, 0], [0.2, 1, 'out3'], [0.7, 1], [1, 0.3]] },
  events: [[0, 'anchorL', [HAND.sky, 0.12]], [0.05, 'poseL', 'swordFingers'], [0.15, 'haptic', 'tick'], [0.2, S({ spin: 6, pearl: 2.4, arcs: 4 })], [0.22, 'shake', 0.1],
    [0.62, 'anchorL', [HAND.claw, 0.15]], [0.86, 'anchorL', ['grip_l', 0.2]]] });
// 引雷 reload 1.2 s: the staff head tilted up, the left hand forms a seal before the 雷珠, a bolt from the sky strikes it,
// the rings stop dead then race; mana in at 0.85 s
function reload(rare) {
  const tracks = {
    gunPos: [[0, Z3], [0.18, [-0.012, 0.03, 0.03]], [0.75, [-0.015, 0.035, 0.03]], [1, Z3]],
    gunRot: [[0, Z3], [0.18, [-10, 6, 4]], [0.75, [-11, 7, 4]], [1, Z3]],
    fx_jaw: rare ? [[0, 0], [0.3, 1, 'out3'], [0.5, 1], [0.56, 0.2, 'snap'], [0.7, 0], [1, 0]] : [[0, 0], [1, 0]],
  };
  const events = [[0, 'glow', { u: 'pCharge', to: 0.2, sec: 0.15 }], [0.04, 'anchorL', [HAND.seal, 0.15]],
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
    gunPos: [[0, Z3], [0.04, [-0.05, 0.03, 0.04]], [0.11, [-0.055, 0.035, 0.045]], [0.18, [-0.05, 0.03, 0.04]], [0.24, [-0.07, 0.01, 0.03], 'inOut'], [0.46, [-0.07, 0.01, 0.03]],
      [0.56, [-0.09, -0.025, 0.03], 'inOut'], [0.72, [-0.095, -0.025, 0.03]], [0.82, [0, 0.01, 0.01], 'inOut'], [0.96, [0, 0.01, 0.01]], [1, Z3]],
    gunRot: [[0, Z3], [0.04, [10, 18, -10]], [0.11, [12, 24, -12]], [0.18, [10, 18, -10]], [0.24, [-4, 14, 4], 'inOut'], [0.46, [-5, 16, 4]],
      [0.56, [26, 22, -8], 'inOut'], [0.72, [28, 26, -9]], [0.82, [2, 6, -2], 'inOut'], [0.96, [1, 4, -1]], [1, Z3]],
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
      const a = (45 + k * 90 + rot) * D2R, ux = Math.sin(a), uy = -Math.cos(a), nx = -uy, ny = ux, u = 3.4;
      const P = (r, t) => `${(ux * (Rr + r) + nx * t).toFixed(2)} ${(uy * (Rr + r) + ny * t).toFixed(2)}`;
      // a hook (one square-spiral turn of 雲雷紋): across the radius, out, back across, in, a short inner tick
      o += `<path class="a" d="M${P(0, -u)} L${P(0, u)} L${P(u * 1.7, u)} L${P(u * 1.7, -u * 0.5)} L${P(u * 0.75, -u * 0.5)} L${P(u * 0.75, u * 0.3)}" fill="none" stroke="${c}" stroke-width="1.6" stroke-linejoin="miter" stroke-linecap="square"/>`;
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
// km_staff: a dark roundel in a gold 雲雷紋 border; the 應龍 head in profile (brow ridge, 臣字目 eye, the jaws apart with
// fangs, a tined antler, flame-curl mane, a jade wing behind) under an armillary of three crossing rings round the 雷珠.
// Beats: (1) gold strokes draw the roundel, the meander and the head (0-0.45 s); (2) the head fills with bronze, the wing
// with jade, the teeth bone (0.45-0.8); (3) a soft halo round the rim (0.8-1.0); (4) 點睛: a bolt strikes down into the
// pearl, the dragon's eye flashes (1.0-1.15). Headshot: a cross flare and a cyan burst ring off the pearl.
// All paths in a 100-unit box (built once); the context is scaled per draw.
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const seg = (t, a, b) => ease((t - a) / (b - a));
let KM = null;
function kmPaths() {
  if (KM || typeof Path2D === 'undefined') return KM;
  const P = (fn) => { const p = new Path2D(); fn(p); return p; };
  KM = {
    // skull + upper jaw: neck, brow ridge, the brow boss, nose bridge, the bulb of the nose, the upper lip back to the
    // corner of the mouth, cheek and jowl
    head: P((p) => {
      p.moveTo(28, 54); p.bezierCurveTo(29, 46, 35, 41, 43, 41.5); p.bezierCurveTo(46, 37, 53, 37, 56.5, 42.5);
      p.bezierCurveTo(63, 43.5, 69, 43.5, 74.5, 44.5); p.bezierCurveTo(78, 41.5, 84.5, 43.5, 84, 48.5); p.bezierCurveTo(83.5, 51.5, 80.5, 53, 77.5, 53);
      p.bezierCurveTo(71, 53.6, 65, 55, 60, 57.2); p.bezierCurveTo(57, 59.5, 55.5, 62.5, 54, 65); p.bezierCurveTo(48, 70.5, 40, 74, 32, 76.5);
      p.bezierCurveTo(28.5, 69, 27, 61, 28, 54); p.closePath();
    }),
    // the lower jaw dropped open, a hooked chin
    jaw: P((p) => {
      p.moveTo(58.5, 60.2); p.bezierCurveTo(64, 61.5, 70, 62.6, 75.5, 63.2); p.bezierCurveTo(79, 63.4, 80.6, 65.2, 79.4, 67.6);
      p.bezierCurveTo(73, 69.6, 65, 70.4, 58.5, 69.6); p.bezierCurveTo(55.5, 69, 53.8, 67, 54.2, 64.8); p.closePath();
    }),
    // a tongue curling out between the jaws
    tongue: P((p) => { p.moveTo(60, 60.8); p.bezierCurveTo(68, 59.5, 74, 61.5, 78.5, 58.6); p.bezierCurveTo(80.5, 57.4, 81.5, 59.4, 79.6, 60.6); p.bezierCurveTo(74, 64, 67, 63, 60, 63); p.closePath(); }),
    fangsUp: P((p) => { for (const [x, l] of [[78.6, 4.6], [73.5, 3], [69.5, 2.6], [65.5, 2.3], [62, 2]]) { const y = 53.4 + (79 - x) * 0.14; p.moveTo(x - 1.25, y - 0.4); p.lineTo(x + 1.25, y - 0.2); p.lineTo(x - 0.1, y + l); p.closePath(); } }),
    fangsDn: P((p) => { for (const [x, l] of [[76.8, 4], [72, 2.6], [67.5, 2.3], [63, 2]]) { const y = 63.3 - (77 - x) * 0.05; p.moveTo(x - 1.2, y + 0.3); p.lineTo(x + 1.2, y + 0.2); p.lineTo(x + 0.1, y - l); p.closePath(); } }),
    // brow ridge over the eye, the nostril curl, the jowl line
    brow: P((p) => { p.moveTo(44, 44.2); p.bezierCurveTo(48, 40.8, 54, 41, 58.5, 45); }),
    nostril: P((p) => { p.moveTo(80.5, 46.2); p.bezierCurveTo(78.5, 45, 77, 47, 78.6, 48.4); }),
    jowl: P((p) => { p.moveTo(56.5, 51); p.bezierCurveTo(52, 55, 48, 60.5, 41, 64); p.moveTo(52.5, 59); p.bezierCurveTo(50, 62, 46.5, 65.5, 42, 68); }),
    // 臣字目: an almond eye with a long hooked inner corner
    eye: P((p) => { p.moveTo(47.5, 48.8); p.bezierCurveTo(50, 45.3, 55, 45.2, 58, 47.8); p.bezierCurveTo(55, 50.4, 50.5, 50.6, 47.5, 48.8); p.closePath(); }),
    eyeHook: P((p) => { p.moveTo(47.6, 48.8); p.lineTo(43.6, 49.2); p.lineTo(42.2, 46.8); p.moveTo(58, 47.8); p.lineTo(60.4, 47.2); }),
    // antler: a trunk sweeping back with two tines
    antler: P((p) => { p.moveTo(41, 43); p.bezierCurveTo(38, 36, 34, 30, 26.5, 24.5); p.moveTo(36.2, 33.2); p.bezierCurveTo(37.5, 29, 40, 26.5, 41.2, 23.4); p.moveTo(31, 28.6); p.bezierCurveTo(27.5, 29.4, 25.4, 31.6, 23.2, 33.2); }),
    // flame-curl mane off the back of the head, each tongue ending in a curl
    mane: P((p) => {
      for (const [x, y, dx, dy, r] of [[31, 49, -11, -5, 2.6], [29.5, 57, -13, 0.5, 2.8], [29.5, 65, -12, 5.5, 2.6], [31.5, 72.5, -9, 9.5, 2.2]]) {
        const ex = x + dx, ey = y + dy;
        p.moveTo(x + 1, y - 3); p.bezierCurveTo(x - 3, y - 5, ex + 4, ey - 4 - r, ex, ey - r);
        p.arc(ex, ey, r, -Math.PI / 2, Math.PI * 0.75, true);
        p.bezierCurveTo(ex - 1, ey + r + 2, x - 4, y + 3, x + 1, y + 3); p.closePath();
      }
    }),
    // the whisker sweeping down and back from the nose, curling at the end
    whisker: P((p) => { p.moveTo(82.5, 51.5); p.bezierCurveTo(88, 55.5, 87.5, 63.5, 83, 68.5); p.bezierCurveTo(79.5, 72.5, 80.5, 78, 84, 77.2); }),
    // the wing behind the head: four feather lobes (jade cells, gold wire)
    wing: P((p) => {
      p.moveTo(38, 60); p.bezierCurveTo(30, 50, 22, 40, 19.5, 27); p.bezierCurveTo(24, 31, 26.5, 33, 28, 36.5); p.bezierCurveTo(28.5, 30, 30, 26, 33, 23);
      p.bezierCurveTo(34.5, 29, 35, 33, 34.5, 37); p.bezierCurveTo(36, 33, 38.5, 30.5, 41.5, 29); p.bezierCurveTo(41, 35, 41.5, 39, 43, 42); p.closePath();
    }),
    wingRibs: P((p) => { p.moveTo(37, 57); p.lineTo(22.5, 31); p.moveTo(36, 52); p.lineTo(31.5, 27); p.moveTo(37.5, 49); p.lineTo(39, 33); }),
  };
  return KM;
}
const AX = 64.5, AY = 32, AR = 10.5;   // armillary centre / radius (100 units)
registerKillMark('km_staff', {
  scale: 1.6,
  draw(ctx, Sz, t, o) {
    const M = kmPaths();
    if (!M) return;
    const U = Sz / 100, p1 = seg(t, 0, 0.45), p2 = seg(t, 0.45, 0.8), p3 = seg(t, 0.8, 1.0), p4 = seg(t, 1.0, 1.15);
    const cx = 50, cy = 55, RR = 38;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, Sz, Sz);
    ctx.save(); ctx.scale(U, U); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const draw = (path, L, w, col) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.setLineDash([L, L]); ctx.lineDashOffset = L * (1 - p1); ctx.stroke(path); ctx.setLineDash([]); };
    // roundel
    ctx.globalAlpha = 0.92 * Math.max(p1, 0.0001); ctx.fillStyle = '#0a1016'; ctx.beginPath(); ctx.arc(cx, cy, RR, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    // beat 3: a soft halo outside the rim (radial gradient band, not a line)
    if (p3 > 0) {
      const gh = ctx.createRadialGradient(cx, cy, RR - 2, cx, cy, RR + 7);
      gh.addColorStop(0, 'rgba(150,230,255,0)'); gh.addColorStop(0.3, `rgba(150,230,255,${0.55 * p3 * (1 - p4 * 0.4)})`); gh.addColorStop(1, 'rgba(60,140,255,0)');
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = gh; ctx.beginPath(); ctx.arc(cx, cy, RR + 7, 0, TAU); ctx.arc(cx, cy, RR - 2, 0, TAU, true); ctx.fill(); ctx.restore();
    }
    // gold rim (double line) + a fine square-spiral meander between the lines
    const rim = new Path2D(); rim.arc(cx, cy, RR, -Math.PI / 2, Math.PI * 1.5);
    const rim2 = new Path2D(); rim2.arc(cx, cy, RR - 6.2, -Math.PI / 2, Math.PI * 1.5);
    draw(rim, 260, 1.7, '#e8b54a'); draw(rim2, 230, 0.7, '#c99a3c');
    ctx.strokeStyle = '#d9a845'; ctx.lineWidth = 0.75; ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
    const nM = 22, rM = RR - 3.1;
    for (let k = 0; k < Math.floor(nM * p1); k++) {
      const a = (k + 0.5) / nM * TAU - Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a), tx = -sa, ty = ca, q = 1.75;
      const Q = (r, tt) => [cx + ca * (rM + r) + tx * tt, cy + sa * (rM + r) + ty * tt];
      // one 雷紋 square spiral: out, across, in, back, a short inward hook
      ctx.beginPath(); ctx.moveTo(...Q(-q, -q * 1.4)); ctx.lineTo(...Q(q, -q * 1.4)); ctx.lineTo(...Q(q, q * 1.4)); ctx.lineTo(...Q(-q, q * 1.4)); ctx.lineTo(...Q(-q, -q * 0.4)); ctx.lineTo(...Q(q * 0.35, -q * 0.4)); ctx.lineTo(...Q(q * 0.35, q * 0.45)); ctx.stroke();
    }
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // the dragon a touch smaller than the box, inside the meander
    ctx.translate(49, 56); ctx.scale(0.93, 0.93); ctx.translate(-50, -56);
    // wing (jade cells behind gold wire)
    if (p2 > 0) { ctx.globalAlpha = p2 * 0.95; const gr = ctx.createLinearGradient(20, 25, 40, 60); gr.addColorStop(0, '#1f8f8a'); gr.addColorStop(0.55, '#2f8f6e'); gr.addColorStop(1, '#1d5f4c'); ctx.fillStyle = gr; ctx.fill(M.wing); ctx.globalAlpha = 1; }
    draw(M.wing, 200, 1.0, '#e8b54a'); draw(M.wingRibs, 120, 0.6, '#d9a845');
    // mane, then the head over it, the jaw, tongue, teeth
    if (p2 > 0) {
      ctx.globalAlpha = p2;
      const gm = ctx.createLinearGradient(16, 45, 34, 75); gm.addColorStop(0, '#c8995a'); gm.addColorStop(1, '#6a4a22'); ctx.fillStyle = gm; ctx.fill(M.mane);
      const gh = ctx.createLinearGradient(30, 40, 78, 72); gh.addColorStop(0, '#4e3518'); gh.addColorStop(0.45, '#8e6a38'); gh.addColorStop(0.8, '#c39556'); gh.addColorStop(1, '#a37a40');
      ctx.fillStyle = gh; ctx.fill(M.head); ctx.fill(M.jaw);
      ctx.fillStyle = '#20080c'; ctx.beginPath(); ctx.moveTo(60, 57.2); ctx.lineTo(77.5, 53.4); ctx.lineTo(76, 63.2); ctx.lineTo(58.5, 60.2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#b3202a'; ctx.fill(M.tongue);
      ctx.fillStyle = '#efe6d2'; ctx.fill(M.fangsUp); ctx.fill(M.fangsDn);
      ctx.globalAlpha = 1;
    }
    draw(M.mane, 260, 1.1, '#ffd36b'); draw(M.head, 300, 1.5, '#ffd36b'); draw(M.jaw, 120, 1.3, '#ffd36b');
    draw(M.brow, 60, 1.6, '#ffd36b'); draw(M.nostril, 30, 1.0, '#ffd36b'); draw(M.jowl, 80, 0.8, '#e8b54a');
    draw(M.antler, 140, 1.9, '#ffd36b'); draw(M.whisker, 120, 0.9, '#ffd36b');
    // the eye: gold almond, a dark iris; 點睛 flashes it white
    ctx.fillStyle = p4 > 0 ? `rgba(225,250,255,${0.7 + 0.3 * Math.sin(p4 * Math.PI)})` : p2 > 0 ? '#2a1606' : 'rgba(0,0,0,0)'; ctx.fill(M.eye);
    draw(M.eye, 40, 0.9, '#ffd36b'); draw(M.eyeHook, 30, 0.8, '#ffd36b');
    if (p2 > 0) { ctx.fillStyle = p4 > 0 ? '#ffffff' : '#ffd36b'; ctx.beginPath(); ctx.arc(53.2, 47.9, 1.15, 0, TAU); ctx.fill(); }
    // armillary: three crossing rings round the pearl
    const ring = (rx, ry, rot, w, col, L) => { const r = new Path2D(); r.ellipse(AX, AY, rx, ry, rot, 0, TAU); draw(r, L, w, col); };
    ring(AR, AR, 0, 1.3, '#ffd36b', 80); ring(AR, AR * 0.36, -0.42, 1.0, '#e8b54a', 70); ring(AR * 0.36, AR, -0.42, 1.0, '#c99a3c', 70);
    if (p1 > 0.5) { ctx.fillStyle = '#ffd36b'; for (const a of [0.3, 2.0, 3.6, 5.2]) { ctx.beginPath(); ctx.arc(AX + Math.cos(a) * AR, AY + Math.sin(a) * AR, 0.8, 0, TAU); ctx.fill(); } }
    // pearl
    const pr = 4.6;
    if (p2 > 0) { ctx.globalAlpha = p2; const gg = ctx.createRadialGradient(AX - 1.2, AY - 1.4, 0, AX, AY, pr); gg.addColorStop(0, '#ffffff'); gg.addColorStop(0.45, '#bff0ff'); gg.addColorStop(1, '#2f8fe0'); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(AX, AY, pr, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
    // beat 3: the pearl glows
    if (p3 > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55 * p3 * (1 - p4 * 0.4); const gg = ctx.createRadialGradient(AX, AY, 1, AX, AY, 15); gg.addColorStop(0, 'rgba(170,240,255,0.9)'); gg.addColorStop(1, 'rgba(40,110,220,0)'); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(AX, AY, 15, 0, TAU); ctx.fill(); ctx.restore(); }
    // beat 4: the bolt from the top of the roundel into the pearl
    if (p4 > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const fl = Math.sin(p4 * Math.PI), pts = [[AX - 5, 15], [AX + 1.5, 19.5], [AX - 2, 22.5], [AX + 1, 25.9]];
      ctx.strokeStyle = `rgba(150,225,255,${fl * 0.6})`; ctx.lineWidth = 3.4; ctx.beginPath(); pts.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x, y)); ctx.stroke();
      ctx.strokeStyle = `rgba(240,252,255,${fl})`; ctx.lineWidth = 1.3; ctx.stroke();
      ctx.fillStyle = `rgba(200,245,255,${fl * 0.9})`; ctx.beginPath(); ctx.arc(AX, AY, pr * (1 + 1.6 * fl), 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(240,252,255,${fl})`; ctx.lineWidth = 1.0;
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 4 + 0.39, L = (k % 2 ? 8 : 13) * fl; ctx.beginPath(); ctx.moveTo(AX - Math.cos(a) * L, AY - Math.sin(a) * L); ctx.lineTo(AX + Math.cos(a) * L, AY + Math.sin(a) * L); ctx.stroke(); }
      if (o.head) {
        ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(AX - 18 * fl, AY); ctx.lineTo(AX + 18 * fl, AY); ctx.moveTo(AX, AY - 18 * fl); ctx.lineTo(AX, AY + 18 * fl); ctx.stroke();
        ctx.strokeStyle = `rgba(110,220,255,${Math.max(0, 1 - p4 * 0.5)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(AX, AY, pr * (1.6 + 3.2 * p4), 0, TAU); ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  },
});
