// E01 春霆神戟．驚蟄 Thunderclap Halberd — 異能 (啟明工坊), docs/PREMIUM_WEAPONS.md §2 E01. Mechanics on the specials v2
// engine (registerSpecial 'chunting' + skills) and the whole presentation: the halberd's own trigger (雷能 = the magazine,
// the 放電 channel), the RMB tap / hold split, the viewmodel driver (LED bar, coils, capacitor, idle arcs), clips,
// crosshair, damage-number skin. Effect primitives: chunting_fx.js. Model: tools/assets/weapons/chunting.mjs.
//
//   LMB held   放電: wind-up 0.23 s (the head pushes forward, 「嗞」), then arcs leap from the electrode (S_arc) to the 3
//              zombies nearest the crosshair within 7 m (a 70° cone, in sight): 15 a tick, 10 ticks a second (150/s
//              each), knock 0.15, a 0.2 s stun kept up while they are held (locked in their hit pose, jerking with the
//              current: stun / jolt); release crack 0.33 s (「啪」). 12 雷能/s.
//   雷能       ws.ammo of 120 (HUD: the pool + the arc gauge + the LED bar on the receiver); back at 20/s 1 s after the
//              last use; dry = an automatic battery swap (the capacitor cell, 2 s); R swaps early.
//   RMB tap    雷爆 (15 雷能): a thrust; 0.1 s later a 3 m blast at 10 m along the crosshair (a zombie under it pins
//              it to its feet): 260 + knock back 6, a lightning lance from the spear to the point.
//   RMB held   驚蟄落雷 (60 雷能): two stages (1.0 s, 2.0 s: the shaft re-locks with a click, the crescent flips
//              out 90°; pitch rises, FOV -1° a stage, the screen edge darkens); released after 2 s the halberd is
//              thrown as a javelin (20 m/s, an arc) to the crosshair point (≤ 26 m); a cloud ring gathers over it,
//              an isobar sigil marks the ground, streamers climb off its crown; 1.2 s after it lands a giant bolt
//              falls on it (1,600 within 2 m, 400 to 6 m, 2 s stun), 0.3 s later it pulls free and flies home on a flat
//              arc in from the right of the view (never through the crosshair) into the catch clip (by 3.1 s).
//              Released early = the stage folds back, nothing spent.
//   Q          雷樁 (20 s cooldown): a bolt drives a lightning rod into the crosshair point for 8 s; every client's
//              hits on zombies within 6 m have a 20 % chance to draw an arc off its crown (40).
//   kill       KE_CHAR (charred under a violet rim, arcs crawl 0.5 s); the generic kill mark in violet (exotic).
// Sound cues (§1.12; each has a stock fallback until its bank is produced): SND below.
import * as THREE from 'three';
import { registerSpecial, registerSkill, startSkill, endSkill, castSkill, canCast, chargeState } from '../specials.js';
import { registerClip } from '../../player/clips.js';
import { registerCrosshair, injectCSS } from '../../ui/crosshairs.js';
import { SKINS } from '../../ui/dmgnums.js';
import { FRAME, DECAL, DECAL_TINT } from '../../fx/fx.js';
import { haptic, clipComfort } from '../arsenal.js';
import { instanceGLB } from '../../engine/assets.js';
import { applyHardSurface } from '../../gfx/materials.js';
import { WEAPONS } from '../defs.js';
import { COL, k3, sfx, gunAxes, vmArc, vmArcT, vmFlash, arc, Arcs, freeArc, burstFx, rubble, cloudRing, stormHeight, giantStrike, centreOf, javelinTrails, rodMesh, ROD_TIP, charKill, after, track, warmMeshes } from './chunting_fx.js';

const ID = 'chunting';
const D2R = Math.PI / 180, TAU = Math.PI * 2;
const V3 = () => new THREE.Vector3();
const UPV = new THREE.Vector3(0, 1, 0);
const _a = V3(), _b = V3(), _c = V3(), _d = V3(), _e = V3(), _dir = V3(), _q = new THREE.Quaternion();
const R = Math.random;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const mine = (g, ws) => !!g.vm?.weapon && g.vm.weapon.def === ws.def;
const TAP = 0.22;          // RMB shorter than this = 雷爆, longer = the 驚蟄 charge
// the shaft at rest: section 1 out, 2 and 3 run in (the head close enough to read in first person); the 驚蟄 charge runs
// them fully out stage by stage (伸縮柄全伸), the thrown halberd is the full length. The crescent rides a little open at
// rest (BLADE_REST of its 90°: its face shows past the shaft, the head reads as a halberd)
const REST_EXT = [0, 1, 1];
const BLADE_REST = 0.15;
const SEGS = ['fx_seg1', 'fx_seg2', 'fx_seg3'];
const RELEASE = 0.16;      // throw clip: the halberd leaves the hand (s)

// sound cues and their stock fallbacks (the 應龍 staff's thunder bank stands in for the electric ones)
const SND = {
  draw: ['chunting_draw', 'drawHeavy'], first: ['chunting_first', 'staff_first'], seg: ['chunting_seg', 'boltForward'], coil: ['chunting_coil', 'staff_ring'],
  zapStart: ['chunting_zap_start', 'staff_chain_start'], zapLoop: ['chunting_zap_loop', 'staff_chain_loop'], zapEnd: ['chunting_zap_end', 'staff_chain_end'], zapHit: ['chunting_zap_hit', 'staff_bolt_hit'],
  burst: ['chunting_burst', 'staff_burst'], thrust: ['chunting_thrust', 'swingHeavy'],
  charge: ['chunting_charge', 'staff_chain_loop'], stage: ['chunting_stage', 'staff_mark'], blade: ['chunting_blade', 'boltBack'],
  throw: ['chunting_throw', 'swingHeavy'], fly: ['chunting_fly', 'rocket_fly'], impact: ['chunting_impact', 'impact_metal'], roll: ['chunting_thunder_roll', 'staff_ult_cloud'],
  thunder: ['chunting_thunder', 'staff_ult_final'], streamer: ['chunting_streamer', 'staff_bolt'], ret: ['chunting_return', 'swing'], whoosh: ['chunting_return_whoosh', 'swingHeavy'], catch: ['chunting_catch', 'impact_metal'],
  rodPlant: ['chunting_rod_plant', 'staff_pool_strike'], rodLoop: ['chunting_rod_loop', 'staff_pool_loop'], rodArc: ['chunting_rod_arc', 'staff_bolt_hit'], rodEnd: ['chunting_rod_end', 'staff_pool_end'],
  out: ['chunting_reload_out', 'magOut'], in: ['chunting_reload_in', 'magIn'], hum: ['chunting_reload_hum', 'staff_ring'],
  inspect: ['chunting_inspect', 'cloth'], glove: ['chunting_glove_zap', 'staff_bolt_hit'], ding: ['chunting_porcelain', 'killmark_ding'],
  kill: ['chunting_kill', 'kill_confirm_thud'], dry: ['chunting_dry', 'dryfire'], idle: ['chunting_idle', null], crack: ['chunting_crack', 'staff_bolt'],
};
const play = (g, key, o = {}) => sfx(g, SND[key][0], SND[key][1], o);
/** every cue name this weapon plays (for the audio stage): the SND table + the def's ready cue */
export const CHUNTING_SOUNDS = [...Object.values(SND).map((v) => v[0]), 'ready_chunting'];

// what the held halberd shows on the crosshair (one local player)
const XS = { zap: false, n: 0, stage: 0, charging: false, thrown: false };

// ------------------------------------------------------------------------------------- the special (v2 overrides)
const stOf = (ws) => ws.sp.ch || (ws.sp.ch = { busy: 0, usedAt: -9, zap: null, rmb: null, thrown: null, view: null, snd: {}, idleT: 0, arcT: 3, capT: 0, tally: { hits: 0, kills: 0, at: null }, roll: new Map(), stuns: new Map() });
registerSpecial('chunting', {
  init(ws) {
    stOf(ws);
    ws.ammo = Math.min(ws.ammo ?? ws.def.mag, ws.def.mag);
    const au = ws.game?.audio;
    if (au?.defs && !au._chPre) { au._chPre = true; au.preload?.(Object.keys(au.defs).filter((n) => /^(chunting_|ready_chunting$)/.test(n)))?.catch?.(() => {}); }
  },
  modifiers() { return {}; },
  // the gun trigger is ours (Arsenal asks before its own logic): 放電 / 雷爆 / 驚蟄 run in update()
  trigger() { return true; },
  onHit(ws, info, res, target) {
    const g = ws.game, z = target?.zombie || target;
    if (!g || !res?.killed || !z || info.skill === 'crisis') return;
    killFx(g, z, info);
  },
  meterInfo(ws, key, m) {
    const s = stOf(ws);
    if (key === 'thunder') return { ...m, raw: ws.ammo, value: ws.ammo / ws.def.mag, ready: ws.ammo >= ws.def.special.skills.throw.energy };
    if (key === 'charge') { const st = s.rmb?.stage || 0; return { ...m, raw: st, value: st / 2, ready: st >= 2 }; }
    return m;
  },
  update(ws, dt, g) {
    const s = stOf(ws), ar = g.arsenal, inp = g.input?.state, alive = !!g.status?.alive;
    s.busy = Math.max(0, s.busy - dt);
    if (!inp) return;
    // while the halberd is out of the hand nothing else can use it (a reload / inspect would run on the hidden gun)
    if (s.thrown) { inp.pressed.reload = false; inp.pressed.inspect = false; }
    // the press is ours (the engine would cast 'alt' on it); a first draw is cut by it like by fire
    if (inp.pressed.alt) {
      inp.pressed.alt = false;
      if (ar.state === 'draw' && ar.firstDrawing) { ar.firstDrawing = false; g.vm.stopClip(); g.vm.glowTo(1, 0.15); ar.timer = 0; }
      if (alive && ar.state === 'idle' && s.busy <= 0 && !s.thrown) s.rmb = { t: 0, stage: 0, charging: false };
    }
    if (s.rmb) rmbStep(ws, g, dt, inp.held.alt && alive && ar.current === ws && !s.thrown);
    // 放電 while LMB is held (the channel skill ends itself on release)
    const zap = s.zap && !s.zap.done ? s.zap : null;
    if (!zap) s.zap = null;
    if (!zap && inp.held.fire && alive && ar.state === 'idle' && s.busy <= 0 && !s.rmb && !s.thrown) {
      if (ws.ammo >= 1) startZap(ws, g);
      else if (inp.pressed.fire) { play(g, 'dry', { volume: 0.7 }); ar.reload(); }
    }
    XS.zap = !!s.zap; XS.charging = !!s.rmb?.charging; XS.stage = s.rmb?.stage || 0; XS.thrown = !!s.thrown;
    if (mine(g, ws)) view(ws, g, dt);
  },
  tick(ws, dt, g) {
    const s = stOf(ws), ar = g.arsenal, held = ar?.current === ws, D = ws.def.chunting.discharge;
    // 雷能 comes back by itself 1 s after the last use (not while discharging, charging or swapping the cell)
    if (ws.ammo < ws.def.mag && !s.zap && !s.rmb?.charging && !(held && ar.state === 'reload') && g.time - s.usedAt > D.delay) {
      const was = Math.floor(ws.ammo);
      ws.ammo = Math.min(ws.def.mag, ws.ammo + D.regen * dt);
      if (Math.floor(ws.ammo) !== was) g.hud?.ammoChanged?.();
    }
    if (ws.sp.m) ws.sp.m.thunder = ws.ammo;   // the premium glow (chargeState) and the arc gauge follow 雷能
    stunTick(s, dt);
    weigh(ws, g);
    if (!held) {
      for (const k of ['hum', 'charge']) if (s.snd[k]) { s.snd[k].stop?.(0.2); s.snd[k] = null; }
      if (s.rmb) cancelCharge(ws, g);
      if (s.hid) { s.hid = false; g.vm?.hideFor?.(0); }   // switched away mid-throw: the new weapon shows
    }
  },
  dispose(ws, g) {
    const s = stOf(ws);
    for (const k of Object.keys(s.snd)) { s.snd[k]?.stop?.(0.1); s.snd[k] = null; }
    if (s.zap && !s.zap.done) endSkill(s.zap);
    for (const [z, e] of s.stuns) unstun(z, e);
    s.stuns.clear();
  },
  /** Clip events: ['ch', { coil: i | coils | tip | cap | seg | glove | ding | ring | sky | snd, vol }] */
  onClipEvent(ws, name, arg, g) {
    if (Array.isArray(name)) [name, arg] = name;
    if (name !== 'ch' || !arg) return;
    if (arg.coil != null) coilFlash(ws, g, arg.coil);
    if (arg.coils) for (let i = 0; i < 3; i++) later(g, i * 0.06, () => coilFlash(ws, g, i));
    if (arg.tip) tipArc(g, arg.tip);
    if (arg.cap) capArcs(g, arg.cap);
    if (arg.seg) play(g, 'seg', { volume: 0.55, pitch: 0.9 + arg.seg * 0.08 });
    if (arg.glove) gloveZap(ws, g);
    if (arg.ding) insulatorDing(ws, g);
    if (arg.ring) gloveRing(ws, g);
    if (arg.sky) skyBolt(g);
    if (arg.snd) play(g, arg.snd, { volume: arg.vol ?? 0.9 });
  },
});

// ------------------------------------------------------------------------------------- targets
/** The zombies the arcs take: in sight, within `range` of the eye and a `cone`° half-angle of the aim; the ones held
 *  last time first (no flicker between equals), then by angle off the crosshair and distance. */
function pickTargets(g, eye, dir, range, cone, n, keep = []) {
  const list = g.targets?.list || g.zombies?.list;
  if (!list) return [];
  const cc = Math.cos(cone * D2R), out = [];
  for (const z of list) {
    if (!z.alive || !z.center) continue;
    _e.subVectors(z.center(_c), eye);
    const d = _e.length();
    if (d < 0.3 || d > range) continue;
    const cs = _e.dot(dir) / d;
    if (cs < cc) continue;
    const hit = g.world?.collision?.raycast(eye, _e.multiplyScalar(1 / d), d);
    if (hit && hit.dist < d - 0.6) continue;
    out.push({ z, sc: Math.acos(Math.min(1, cs)) / (cone * D2R) * 1.4 + d / range - (keep.includes(z) ? 0.6 : 0) });
  }
  return out.sort((a, b) => a.sc - b.sc).slice(0, n).map((o) => o.z);
}

// ------------------------------------------------------------------------------------- 放電
function startZap(ws, g) {
  const s = stOf(ws), cam = g.camera;
  cam.getWorldDirection(_dir);
  const ev = { type: 'skill', id: 'chunting_discharge', w: ws.def.id, slot: 'zap', seed: (Math.random() * 2147483647) | 0,
    pos: [cam.position.x, cam.position.y, cam.position.z], dir: [_dir.x, _dir.y, _dir.z], by: g.localId, ph: 0 };
  const k = startSkill(g, ev, { ws, local: true });
  if (!k) return;
  k.held = 'fire';   // channel on the trigger, not the ★ key
  s.zap = k;
  g.net?.sendSkill?.(ev);
}
registerSkill('chunting_discharge', {
  level: 'L1', channel: true, defaults: { windup: 0.23, release: 0.33, range: 7, targets: 3, tick: 0.1, dmg: 15, stun: 0.2, drain: 12, cone: 70 },
  start(k) {
    const g = k.game, d = k.data;
    if (k.ws) Object.assign(k.p, k.ws.def.chunting.discharge);
    d.arcs = new Arcs(g); d.acc = 0; d.re = 0; d.list = []; d.free = 0; d.scorch = 0; d.on = false;
    play(g, 'zapStart', k.local ? { volume: 0.85 } : { pos: k.pos, volume: 0.8 });
    if (k.local && k.ws && mine(g, k.ws)) {
      g.arsenal.playClip('chunting_zap', { duration: 0.9 });
      g.vm.clip.hold = true;
      g.punch?.impulse(-0.008, 0, 0);
    }
  },
  update(k, dt) {
    const g = k.game, d = k.data, p = k.p, ws = k.ws;
    if (k.local && ws) {
      if (g.vm?.weapon?.def === ws.def && g.vm.clip.active) g.vm.clip.hold = true;
      ws.ammo -= p.drain * dt; stOf(ws).usedAt = g.time;
      if (R() < dt * 4) g.hud?.ammoChanged?.();
      if (ws.ammo <= 0) { ws.ammo = 0; g.hud?.ammoChanged?.(); stOf(ws).dry = true; return false; }
    }
    const eye = k.caster(_a, _dir).clone(), dir = _dir.clone(), from = k.local ? (g.vm?.socketApparent?.('arc', V3()) || k.muzzle(V3())) : k.muzzle(V3());
    // the wind-up: the electrode spits short sparks, the arcs reach out over 0.23 s
    if (k.t < p.windup) {
      if (R() < dt * 30) freeArc(g, from, dir, { len: 0.6 + k.t * 4 });
      if (k.local) g.addShake?.(0.1 * dt);
      return true;
    }
    if (!d.on) { d.on = true; if (k.local) d.loop = play(g, 'zapLoop', { loop: true, volume: 0.55 }); else d.loop = play(g, 'zapLoop', { loop: true, pos: k.pos, volume: 0.5 }); }
    if ((d.re -= dt) <= 0) {
      d.re = 0.1;
      d.list = pickTargets(g, eye, dir, p.range, p.cone, p.targets, d.list);
      if (!d.list.length) { const wh = g.world?.collision?.raycast(eye, dir, 3.2); d.wall = wh ? wh.point.clone() : null; }
    }
    d.list = d.list.filter((z) => z.alive);
    const links = d.list.map((z, i) => [from, z.center(V3()), i ? 0.8 : 1, z.pos]);
    d.arcs.set(links, dt);
    if (!d.list.length && (d.free -= dt) <= 0) { d.free = 0.05 + R() * 0.04; freeArc(g, from, dir, { wall: d.wall && R() < 0.3 ? d.wall : null }); }
    for (const z of d.list) { if (R() < dt * 8) g.fx?.zfx?.status?.(z, 'arcshock', 0.25); jolt(g, z, 0.2, 1); }
    if (k.local && ws) {
      g.addShake?.(0.04 * dt * 10);   // trauma 0.04 held (§ card)
      const s = stOf(ws);
      for (const z of d.list) stun(s, z, p.stun);
      if ((d.acc += dt) >= p.tick) {
        d.acc -= p.tick;
        const ar = g.arsenal;
        for (const z of d.list) {
          const c = z.center(V3());
          const info = { amount: p.dmg * (ar?.dmgMul ?? 1), part: 'body', point: c, dir: c.clone().sub(eye).normalize(), knock: 0.15 * (ar?.knockMul ?? 1), stagger: 0.3,
            weapon: ws.def.id, shooter: g.localId, elem: 'chunting', skill: 'chunting_discharge' };
          const res = z.damage(info);
          rollHit(g, s, z, info, res);
          ar?._special?.(ws, 'onHit', info, res, z);
          const T = s.tally; T.hits++; T.at = c; if (res?.killed) T.kills++;
        }
        if (d.list.length) haptic(6);
      }
      // the arc scorches the street under the first target
      const z0 = d.list[0];
      if (z0 && (d.scorch -= dt) <= 0) { d.scorch = 0.4; g.fx?.decals?.add(_c.set(z0.pos.x + (R() - 0.5) * 0.3, z0.pos.y + 0.02, z0.pos.z + (R() - 0.5) * 0.3), UPV, { frame: DECAL.scorch, size: 0.45 + R() * 0.3, tint: DECAL_TINT.scorch, life: 5 }); }
    }
    return true;
  },
  end(k) {
    const g = k.game, d = k.data;
    d.arcs?.stop(); d.loop?.stop?.(0.08);
    play(g, 'zapEnd', k.local ? { volume: 0.8 } : { pos: k.pos, volume: 0.7 });
    // the release crack: one bright arc off the electrode
    k.caster(_a, _dir);
    const from = k.local ? (g.vm?.socketApparent?.('arc', V3()) || k.muzzle(V3())) : k.muzzle(V3()), dir = _dir.clone();
    for (let i = 0; i < 2; i++) freeArc(g, from, dir, { len: 1.6 });
    if (k.local && k.ws) {
      const s = stOf(k.ws);
      if (s.zap === k) s.zap = null;
      s.busy = Math.max(s.busy, k.p.release ?? 0.33);
      if (mine(g, k.ws)) { g.vm.clip.hold = false; g.vm.kick?.({ back: 0.02, up: 1.5, side: 0, roll: 2 }); }
      g.hud?.ammoChanged?.();
      if (s.dry) { s.dry = false; later(g, k.p.release ?? 0.33, () => { if (g.arsenal?.current === k.ws && g.arsenal.state === 'idle') g.arsenal.reload(); }); }
    }
  },
});
/** a channel tick's damage number rolls into the one already rising off that zombie (staff's 連霆 technique) */
function rollHit(g, s, z, info, res) {
  const e = s.roll.get(z) || { sum: 0, at: -9 };
  s.roll.set(z, e);
  e.sum += res?.damage || 0;
  if (g.time - e.at < 0.25 && !res?.killed) return;
  const sum = e.sum;
  e.sum = 0; e.at = g.time;
  if (s.roll.size > 64) for (const [zz] of s.roll) if (!zz.alive) s.roll.delete(zz);
  if (g.hud?.nums?.bump?.(z, sum, 0.5)) { if (res?.killed) g.hud.onHit?.(info, { ...res, damage: 0 }, z); return; }
  g.hud?.onHit?.({ ...info, amount: sum }, { ...res, damage: sum }, z);
}
/** The frame's weight from what the arcs did (one sound / hit-stop per frame, not per target). */
function weigh(ws, g) {
  const T = stOf(ws).tally;
  if (!T.hits) return;
  if (T.kills) { hitStop(g, T.kills > 1 ? 70 : 45); g.addShake?.(T.kills > 1 ? 0.14 : 0.07); play(g, 'kill', { volume: 0.6 + 0.15 * Math.min(2, T.kills) }); }
  else if (R() < 0.35) play(g, 'zapHit', { pos: T.at, volume: 0.35 });
  T.hits = 0; T.kills = 0; T.at = null;
}
function hitStop(g, ms) { if (clipComfort.hitstop !== false) g.hitStop?.(ms / 1000); }

// ------------------------------------------------------------------------------------- stun (held in the current)
/**
 * Holds a zombie stunned for t s. On first contact the body locks in a hit pose (its stagger / hit clip started, then
 * held almost still: no walking on the spot while the arcs pin it), the electrocution twitch (jolt) rides on top; when
 * the current lets go the clip plays out as the stagger-out and the zombie walks again 0.55 s after. Bosses only twitch;
 * heavies (staggerRes >= 0.5) lock lighter (the clip crawls instead of freezing). The zombie leaves stagger 0.55 s after
 * stateT 0 (held at 0.25 while stunned).
 */
function stun(s, z, t, { amp = 1 } = {}) {
  if (!z?.alive) return;
  const e = s.stuns.get(z);
  if (e) { e.t = Math.max(e.t, t); return; }
  if (z.def?.boss) return;
  if (z.state !== 'chase' && z.state !== 'attack' && z.state !== 'stagger') return;
  const heavy = (z.def?.staggerRes ?? 0) >= 0.5;
  // a hit clip the damage itself just started is the lock pose; otherwise our own
  const own = z.state === 'stagger' && z.action && z.action !== z.loco && z.action.loop === THREE.LoopOnce ? z.action : null;
  z.state = 'stagger'; z.stateT = 0;
  const a = own || z.playOnce(lockClip(z), { fade: 0.06, speed: 1.4 });
  s.stuns.set(z, { t, age: 0, act: a || null, heavy, amp });
}
/** the clip a zombie locks into: its stagger / hit clip (unless its type overrides them away), else its idle */
function lockClip(z) {
  const over = z.def?.anim?.over || {};
  for (const n of ['hit_front', 'stagger']) if (z.actions?.[n] && over[n] !== null) return n;
  return z.def?.anim?.idle?.[0] || 'idle';
}
function unstun(z, e) {
  // the current lets go: the held hit clip plays out (the stagger-out), the zombie walks out of stagger by itself
  if (e?.act && z.action === e.act) e.act.timeScale = 1.1;
}
function stunTick(s, dt) {
  for (const [z, e] of s.stuns) {
    e.t -= dt; e.age += dt;
    if (!z.alive || e.t <= 0 || z.state !== 'stagger') { s.stuns.delete(z); if (z.alive) unstun(z, e); continue; }
    z.stateT = Math.min(z.stateT, 0.25);
    // the lock: the first 0.12 s of the hit plays (the jolt), then it is held nearly still
    if (e.act && z.action === e.act && e.age > 0.12) e.act.timeScale = e.heavy ? 0.18 : 0.04;
  }
}

/**
 * The electrocution twitch: spine, neck, head and arms jerked by small random rotations re-rolled at ~22 Hz (the
 * arcshock flicker's rate), applied after the zombie's own animation every frame it is held (bosses and heavies at
 * 40 %). The arm bones join the zombie's post-animation restore set (Zombie.restorePost) so our offsets never pile up;
 * on frames its animation LOD skips, we take ours back off first.
 */
const JOLT = [['spine_02', 0.07], ['spine_03', 0.08], ['neck_01', 0.1], ['head', 0.16], ['upperarm_l', 0.22], ['upperarm_r', 0.22], ['lowerarm_l', 0.3], ['lowerarm_r', 0.3]];
const _eu = new THREE.Euler();
function jolt(g, z, sec, amp = 1) {
  if (!z?.alive || !z.bones) return;
  const J = joltSys(g), e = J.get(z), k = amp * (z.def?.boss || (z.def?.staggerRes ?? 0) >= 0.5 ? 0.4 : 1);
  if (e) { e.until = Math.max(e.until, g.time + sec); e.amp = Math.max(e.amp, k); return; }
  const list = JOLT.filter(([n]) => z.bones[n]);
  if (!list.length) return;
  const P = z._post;
  if (P) for (const [n] of list) { const b = z.bones[n]; if (!P.bones.includes(b)) { P.bones.push(b); P.q.push(b.quaternion.clone()); } }
  J.set(z, { until: g.time + sec, amp: k, bones: list.map(([n]) => z.bones[n]), w: list.map(([, w]) => w), base: list.map(() => new THREE.Quaternion()), ax: list.map(() => new THREE.Vector3()), on: false, ph: 0, t0: g.time });
}
function joltSys(g) {
  if (g._chJolt) return g._chJolt.map;
  const map = new Map();
  const sys = {
    update(dt) {
      for (const [z, e] of map) {
        // the animation LOD skipped this zombie this frame: its bones still carry last frame's offsets
        if (e.on && z.animAcc > 0) e.bones.forEach((b, i) => b.quaternion.copy(e.base[i]));
        e.on = false;
        if (!z.alive || g.time >= e.until || !z.root?.visible) { if (!z.alive || g.time >= e.until) map.delete(z); continue; }
        e.bones.forEach((b, i) => e.base[i].copy(b.quaternion));
        if ((e.ph -= dt) <= 0) { e.ph = 0.045; for (const v of e.ax) v.set(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1); }
        // strongest at contact, a steady buzz after (a long stun settles down to a tremor)
        const a = e.amp * (0.65 + 0.35 * Math.max(0, 1 - (g.time - e.t0) / 0.4)) * Math.min(1, (e.until - g.time) / 0.08 + 0.3);
        e.bones.forEach((b, i) => { const v = e.ax[i], w = e.w[i] * a; b.quaternion.multiply(_q.setFromEuler(_eu.set(v.x * w, v.y * w * 0.5, v.z * w))); });
        e.on = true;
      }
    },
  };
  g._chJolt = { map, sys };
  g.systems?.push(sys);
  return map;
}

// ------------------------------------------------------------------------------------- RMB: 雷爆 tap / 驚蟄 charge
function rmbStep(ws, g, dt, held) {
  const s = stOf(ws), r = s.rmb, sk = ws.def.special.skills.throw;
  r.t += dt;
  if (held) {
    if (!r.charging && r.t >= TAP) {
      if (ws.ammo < sk.energy) { deny(ws, g, `雷能不足（需 ${sk.energy}）`); s.rmb = null; return; }
      startCharge(ws, g);
    }
    if (r.charging) chargeStep(ws, g, dt);
    return;
  }
  if (!r.charging) {
    const a = ws.def.special.skills.alt;
    if (ws.ammo < a.energy) deny(ws, g, `雷能不足（需 ${a.energy}）`);
    else if (canCast(ws, 'alt').ok) castSkill(ws, 'alt');
    s.rmb = null;
  } else if (r.stage >= 2) { s.rmb = null; endCharge(ws, g, false, r); castSkill(ws, 'throw'); }
  else cancelCharge(ws, g);
}
function deny(ws, g, text) { play(g, 'dry', { volume: 0.6 }); g.hud?.toast?.(text, 900); g.audio?.play('ui_deny', { volume: 0.4 }); }
function startCharge(ws, g) {
  const s = stOf(ws), r = s.rmb, vm = g.vm;
  r.charging = true;
  if (s.zap && !s.zap.done) endSkill(s.zap);   // the arcs stop while the halberd winds up
  if (mine(g, ws)) {
    g.arsenal.playClip('chunting_charge', { duration: 1.2 });
    vm.clip.hold = true;
    vm.setPart('fx_seg1', 0.12, 0.1);   // the handle section unlocks and settles back a hair before it re-locks
  }
  s.snd.charge = play(g, 'charge', { loop: true, volume: 0.5, pitch: 0.8 });
  g.arsenal?.fovHold?.(0, 0.2);
  if (clipComfort.overlay !== false) r.edge = g.fx?.overlay?.border?.([0.02, 0.01, 0.04], 0.14, Infinity);
  // where it will land: a faint isobar preview riding the aim point while the charge builds
  r.sig = g.fx?.sigils?.sigil?.(aimPoint(g, ws, V3()), { design: 'isobar', radius: ws.def.special.skills.throw.ringR, color: k3(COL.core, 0.05), color1: k3(COL.violet, 0.08), intensity: 0.1, life: Infinity, seed: 7 });
  r.handT = 0.2;
}
/** the 驚蟄 throw's landing point under the crosshair (the cast's own ray: the world, then the street under it) */
function aimPoint(g, ws, out) {
  const cam = g.camera, dir = cam.getWorldDirection(_d), range = ws.def.special.skills.throw.range;
  const hit = g.world?.collision?.raycast(cam.position, dir, range);
  out.copy(cam.position).addScaledVector(dir, hit ? Math.max(0, hit.dist - 0.05) : range);
  const y = g.world?.collision?.floorBelow?.(_e.set(out.x, out.y + 0.5, out.z), 0.2, 30);
  if (Number.isFinite(y)) out.y = y;
  return out.add(_e.set(0, 0.04, 0));
}
/** a charge stage locks in: a ring and a spray of arcs off the head, a thick arc wrapping the shaft, the coils flare */
function stageBurst(ws, g, st) {
  const vm = g.vm;
  vmFlash(g, sock(g, 'head'), { life: 0.26, size: [0.05, 0.16 + 0.04 * st], col: COL.rim, k: 0.45, ring: () => gunAxes(vm).f.clone() });
  for (let i = 0; i < 4 + 2 * st; i++) { const a = R() * TAU, L = 0.08 + R() * 0.08; vmArcT(g, sock(g, 'head'), sock(g, 'head', R() * 0.06, Math.cos(a) * L, Math.sin(a) * L), { w: 0.004, life: 0.1, k: 1.5, levels: 3 }); }
  for (let i = 0; i < 2; i++) later(g, i * 0.05, () => vmArcT(g, sock(g, 'coil'), sock(g, 'head'), { w: 0.006 + 0.002 * st, life: 0.12, k: 1.4, levels: 5, jitter: 0.18 }));
  vm.kick?.({ back: 0.012, up: 1.2, side: 0, roll: st === 2 ? -6 : 2 });
}
function chargeStep(ws, g, dt) {
  const s = stOf(ws), r = s.rmb, sk = ws.def.special.skills.throw, vm = g.vm, own = mine(g, ws);
  const ct = r.t - TAP, st = ct >= sk.stages[1] ? 2 : ct >= sk.stages[0] ? 1 : 0;
  // pitch 0.8 -> 1.25 over the charge (§1.12)
  s.snd.charge?.setRate?.(0.8 + 0.45 * clamp01(ct / sk.stages[1]));
  if (own && vm.clip.active) vm.clip.hold = true;
  if (st > r.stage) {
    r.stage = st;
    play(g, 'stage', { volume: 0.7, pitch: 1 + st * 0.18 });
    haptic(12);
    g.arsenal?.fovHold?.(-st, 0.15);
    r.edge?.set?.({ amt: 0.14 + 0.07 * st });
    r.sig?.set?.({ intensity: 0.14 + 0.08 * st, color: k3(COL.core, 0.06 + 0.04 * st), color1: k3(COL.violet, 0.1 + 0.06 * st) });
    if (st === 1 && own) { vm.setPart('fx_seg1', 0, 0.08); vm.setPart('fx_seg2', 0, 0.1); later(g, 0.02, () => play(g, 'seg', { volume: 0.7, pitch: 1.1 })); coilsAll(ws, g, 1.6); stageBurst(ws, g, 1); }
    if (st === 2) {
      // the crescent snaps out 90° (a hard detent, the head kicks, a flash off the blade's belly)
      if (own) { vm.setPart('fx_seg3', 0, 0.1); vm.setPart('fx_blade', 1, 0.11); coilsAll(ws, g, 2.4); later(g, 0.02, () => play(g, 'seg', { volume: 0.8, pitch: 1.25 })); stageBurst(ws, g, 2); later(g, 0.1, () => vmFlash(g, sock(g, 'moon'), { life: 0.18, size: [0.04, 0.12], col: COL.white, k: 0.3 })); }
      play(g, 'blade', { volume: 0.9 });
      g.addShake?.(0.08);
    }
  }
  r.sig?.mesh?.position?.copy?.(aimPoint(g, ws, _a));
  // arcs wrap the shaft (coil -> head), more and brighter each stage
  if (own && R() < dt * (6 + 10 * r.stage)) {
    const a = vm.socketCam?.('coil', V3()), b = vm.socketCam?.(R() < 0.5 ? 'base' : 'arc', V3());
    if (a && b) { const m = a.clone().lerp(b, 0.3 + R() * 0.5).add(_c.set((R() - 0.5) * 0.03, (R() - 0.5) * 0.03, (R() - 0.5) * 0.03)); vmArc(g, R() < 0.5 ? a : m, R() < 0.5 ? b : m, { w: 0.003 + 0.001 * r.stage, life: 0.06, k: 0.8 + 0.3 * r.stage, levels: 4 }); }
  }
  if (own && r.stage >= 2 && R() < dt * 10) tipArc(g, 1);
  // the open left hand: arcs jump between the fingers and to the head, more with each stage
  if (own && vm.handPos?.L && (r.handT -= dt) <= 0) {
    r.handT = 0.11 - 0.03 * r.stage + R() * 0.05;
    const L = vm.handPos.L, fin = (a) => () => L.clone().add(_e.set(Math.cos(a) * 0.03, 0.06 + Math.sin(a) * 0.02, -0.06));
    const a0 = R() * TAU;
    vmArcT(g, fin(a0), fin(a0 + 1 + R()), { w: 0.003, life: 0.07, k: 1.2, levels: 3 });
    if (r.stage || R() < 0.4) vmArcT(g, fin(a0), sock(g, R() < 0.5 ? 'head' : 'arc'), { w: 0.003 + 0.0015 * r.stage, life: 0.08, k: 1.1 + 0.2 * r.stage, levels: 5, jitter: 0.2 });
  }
}
function endCharge(ws, g, folded, r = stOf(ws).rmb) {
  const s = stOf(ws);
  s.snd.charge?.stop?.(0.15); s.snd.charge = null;
  g.arsenal?.fovHold?.(0, 0.2);
  r?.edge?.stop?.(0.2); r?.sig?.stop?.(folded ? 0.2 : 0.05);
  if (mine(g, ws)) {
    if (g.vm.clip.active) g.vm.clip.hold = false;
    if (folded) { g.vm.setPart('fx_blade', BLADE_REST, 0.2); g.vm.setPart('fx_seg1', 0, 0.12); g.vm.setPart('fx_seg2', REST_EXT[1], 0.15); g.vm.setPart('fx_seg3', REST_EXT[2], 0.18); }
  }
}
function cancelCharge(ws, g) {
  const s = stOf(ws), r = s.rmb;
  s.rmb = null;
  if (!r?.charging) return;
  endCharge(ws, g, true, r);
  if (r.stage >= 2) play(g, 'blade', { volume: 0.6, pitch: 0.85 });
}

// ------------------------------------------------------------------------------------- skills
// ◎ tap 雷爆: a thrust, a lightning lance to the point, a 3 m blast (260 + knock back 6).
registerSkill('chunting_burst', {
  level: 'L2', aim: 'target', dur: 0.25, defaults: { range: 10, r: 3, dmg: 260, knock: 6, energy: 15 },
  start(k) {
    const g = k.game;
    k.data.boom = false;
    if (k.local && k.ws) {
      const ws = k.ws, s = stOf(ws);
      ws.ammo = Math.max(0, ws.ammo - k.p.energy); s.usedAt = g.time; s.busy = Math.max(s.busy, 0.32);
      g.hud?.ammoChanged?.();
      if (mine(g, ws)) { g.arsenal.playClip('chunting_thrust', { duration: 0.4 }); }
      g.punch?.impulse(0.012, 0, 0);
    }
    play(g, 'thrust', k.local ? { volume: 0.8 } : { pos: k.pos, volume: 0.7 });
  },
  update(k) {
    const g = k.game, p = k.p, d = k.data;
    if (d.boom || k.t < 0.12) return true;   // (the lunge's full reach: chunting_thrust 0.3 x 0.4 s)
    d.boom = true;
    const c = k.at.clone(), from = k.local ? (g.vm?.socketApparent?.('muzzle', V3()) || k.muzzle(V3())) : k.muzzle(V3());
    // the lance: a fat bolt from the spear to the point (thin where it leaves the spear), a straight glow under it
    g.fx?.bolt?.(from.clone(), _c.set(c.x, c.y + 0.8, c.z).clone(), { col: k3(COL.white, 1.0), glow: k3(COL.violet, 0.55), width: 0.2, core: 0.3, levels: 5, jitter: 0.07, branches: 3, regen: 0.035, life: 0.17 });
    g.fx?.beam?.(from, _c.set(c.x, c.y + 0.8, c.z), { core: k3(COL.white, 0.35), glow: k3(COL.violet, 0.32), wCore: 0.05, wGlow: 0.5, life: 0.15, shrink: 0.3, wStart: 0.08, ramp: 4 });
    const near = clamp01(c.distanceTo(g.camera.position) / 8);
    burstFx(g, c, p.r, { near: 0.5 + 0.5 * near, seed: k.ev.seed });
    play(g, 'burst', { pos: c, volume: 1 });
    if (!k.local) return true;
    const n = k.hurt(_c.set(c.x, c.y + 0.9, c.z), p.r, p.dmg, { knock: p.knock, stagger: 1, falloffMin: 0.75 });
    g.addShake?.(0.2); hitStop(g, n ? 70 : 30); haptic(n ? 30 : 15);
    // the camera punches on the impact frame (the lunge carried the head into it)
    g.punch?.impulse(-0.035, (R() - 0.5) * 0.01, (R() - 0.5) * 0.03);
    if (mine(g, k.ws)) g.vm.kick?.({ back: 0.04, up: 3.5, side: 0, roll: 3 });
    return true;
  },
});

// ◎ held 2 s 驚蟄落雷: thrown halberd, cloud, giant bolt, the return.
let _jav = null, _javLoad = null;
function javelinProto() {
  if (_jav || _javLoad) return _jav;
  _javLoad = instanceGLB(`weapons/${WEAPONS[ID]?.model || ID}.glb`).then((root) => {
    applyHardSurface(root, { premium: WEAPONS[ID]?.premium, premiumKey: `p3:${ID}:throw`, world: true });
    // thrown the way the charge left it: the crescent flipped out (fx_blade open +90° about s) and every section out
    root.traverse((o) => { if (o.name === 'fx_blade') o.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, -1), Math.PI / 2)); if (o.name === 'fx_ding') o.visible = false; });
    _jav = root;
  }).catch((e) => console.warn('[chunting] javelin', e));
  return null;
}
const THROW = { lift: 0.08, sink: 0.2 };
// the javelin group (tip along -z, m): the GLB's grip sits JAV.grip behind the balance point; the spear tip (s 1,426 mm
// drawn), the trail point just behind it, the crown where the arcs leave mid-spear
const JAV = { grip: 0.52, tip: 0.9, trail: 0.86, crown: 0.7 };
registerSkill('chunting_throw', {
  level: 'L3', aim: 'target', dur: 6, defaults: { speed: 20, range: 26, delay: 1.2, back: 1.5, dmg: 1600, coreR: 2, ring: 400, ringR: 6, stun: 2, lock: 3.1, energy: 60 },
  start(k) {
    const g = k.game, d = k.data, p = k.p;
    Object.assign(d, { phase: 'wind', pos: null, P0: null, T: k.at.clone(), flight: 0, land: -1, mesh: null, trails: null, cloud: null, sig: null, struck: false, ret: null, streamT: 0 });
    // (a teammate's throw downgraded to L2 by the concurrent-L3 cap: no cloud ring, a lighter strike)
    // the storm hangs low enough to stay in view when aiming at the street under it (higher over far throws)
    d.h = stormHeight(g.camera.position, d.T);
    if (k.level >= 3) d.cloud = cloudRing(g, d.T, { h: d.h, r: 10, life: 5.2, lite: quality(g) !== 'high' });
    play(g, 'roll', { pos: d.T, volume: 0.8 });
    if (k.local && k.ws) {
      const ws = k.ws, s = stOf(ws);
      ws.ammo = Math.max(0, ws.ammo - p.energy); s.usedAt = g.time; s.thrown = k; s.busy = p.lock;
      g.hud?.ammoChanged?.();
      if (mine(g, ws)) g.arsenal.playClip('chunting_throw', { duration: 0.34 });
      g.arsenal?.fovKick?.(3, 0.35);
      play(g, 'throw', { volume: 1, delay: RELEASE * 0.6 });
    }
  },
  update(k, dt) {
    const g = k.game, d = k.data, p = k.p, t = k.t;
    if (d.phase === 'wind') { if (t < (k.local ? RELEASE : 0.12)) return true; launch(k); }
    const m = d.mesh;
    if (d.phase === 'fly') {
      d.flight += dt;
      const u = Math.min(1, d.flight / d.dur), prev = _e.copy(d.pos);
      d.pos.lerpVectors(d.P0, d.T1, u); d.pos.y += 4 * d.apex * u * (1 - u);
      orient(m, d.pos, _d.subVectors(d.pos, prev));
      d.trails.forEach((tr) => tr?.push(m.localToWorld(_c.set(0, 0, -JAV.trail))));
      if (R() < dt * 30) arc(g, m.localToWorld(_c.set(0, 0, -JAV.crown)), m.localToWorld(_a.set((R() - 0.5) * 0.5, (R() - 0.5) * 0.5, -0.2 + R() * 0.8)), { w: 0.03, life: 0.06, k: 0.8, levels: 3, jitter: 0.25, branches: 0 });
      d.cloud?.set?.(clamp01(t / (d.land0 + p.delay)) * 0.6);
      if (u >= 1) landed(k);
    } else if (d.phase === 'stuck') {
      const since = t - d.land;
      d.cloud?.set?.(0.6 + 0.4 * clamp01(since / p.delay));
      // streamers climb off the crown towards the cloud (faster as the strike nears)
      if ((d.streamT -= dt) <= 0) {
        d.streamT = Math.max(0.05, 0.3 - since * 0.2);
        const tip = m.localToWorld(_c.set(0, 0, -JAV.crown)).add(_a.set(0, 0.06, 0)).clone();
        arc(g, tip, tip.clone().add(_a.set((R() - 0.5) * 1.5, 1 + R() * (1 + since * 3), (R() - 0.5) * 1.5)), { w: 0.05, life: 0.08, k: 0.9, levels: 4, jitter: 0.2, branches: 1 });
        if (R() < 0.3) play(g, 'streamer', { pos: tip, volume: 0.35, pitch: 1 + since * 0.4 });
      }
      // stepped leaders feel their way down out of the cloud base, closer and closer to the crown
      if (!d.struck && (d.leadT = (d.leadT ?? 0.25) - dt) <= 0) {
        d.leadT = 0.18 - 0.1 * clamp01(since / p.delay);
        const top = _a.set(d.T.x + (k.rng() - 0.5) * 4, d.T.y + d.h - 1, d.T.z + (k.rng() - 0.5) * 4).clone(), reach = 0.3 + 0.6 * clamp01(since / p.delay);
        arc(g, top, top.clone().lerp(_b.set(d.T.x, d.T.y + 1.5, d.T.z), reach), { w: 0.11, life: 0.11, k: 1.15, levels: 5, jitter: 0.14, branches: 2 });
      }
      if (!d.struck && since >= p.delay) strike(k);
      if (since >= p.back) back(k, t);
    } else if (d.phase === 'back') {
      // home on a flat arc swinging in from the right of the view to beside the right hand (never through the
      // crosshair); within ~1.2 m of the eye the halberd and its trails go and the catch clip delivers the arrival
      const r = d.ret;
      r.t += dt;
      const u = Math.min(1, r.t / r.dur), e = u * u * (1.6 - 0.6 * u), hand = catchPoint(k, _a), prev = _e.copy(d.pos);
      const ctl = r.ctl;
      // quadratic bezier from -> ctl -> hand (ctl re-anchored to the moving hand), eased in: it accelerates home
      _b.lerpVectors(r.from, ctl, e); _c.lerpVectors(ctl, hand, e); d.pos.lerpVectors(_b, _c, e);
      _d.subVectors(d.pos, prev);
      if (_d.lengthSq() > 1e-8) { r.vel.copy(_d); }
      // the tip turns from its flight line to the way it is held (forward) as it arrives
      const fw = k.caster(_b, _c) && _c, w = clamp01((u - 0.45) / 0.45);
      orient(m, d.pos, _d.copy(r.vel).normalize().lerp(fw, w * w));
      d.whoosh?.setRate?.(0.85 + 0.5 * e);   // (doppler: the pitch climbs as it closes in)
      d.trails.forEach((tr) => tr?.push(m.localToWorld(_c.set(0, 0, -JAV.trail))));
      const eyeD = d.pos.distanceTo(k.caster(_c, _b));
      if (u >= 1 || (k.local && eyeD < 1.2)) { caught(k); return false; }
    }
    return true;
  },
  end(k) {
    const d = k.data, g = k.game;
    if (d.mesh) d.mesh.removeFromParent();
    d.trails?.forEach((tr) => tr?.stop());
    d.fly?.stop?.(0.1); d.sig?.stop?.(0.3); d.whoosh?.stop?.(0.05);
    if (k.local && k.ws) {
      const s = stOf(k.ws);
      if (s.thrown === k) { s.thrown = null; s.busy = Math.min(s.busy, 0.1); }
      g.vm?.hideFor?.(0);
      if (g.vm?.weapon?.def === k.def) { g.vm.setAnchor('R', 'grip_r', 0.08); g.vm.setAnchor('L', LH, 0.12); g.vm.setPart('fx_blade', BLADE_REST, 0.25); }
    }
  },
});
/** the javelin's group: the GLB centred on its balance point, tip along -z */
function javelinMesh(g) {
  const proto = javelinProto();
  const grp = new THREE.Group();
  if (proto) { const m = proto.clone(); m.position.set(0, 0, JAV.grip); grp.add(m); }
  else {   // (still loading: a stand-in streak)
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.3, 6).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(...k3(COL.core, 0.4)) }));
    grp.add(m);
  }
  g.scene.add(grp);
  return grp;
}
function orient(m, pos, vel) {
  m.position.copy(pos);
  if (vel.lengthSq() > 1e-8) { m.up.set(0, 1, 0); m.lookAt(_c.copy(pos).sub(vel)); }
}
function launch(k) {
  const g = k.game, d = k.data, p = k.p;
  d.phase = 'fly';
  d.P0 = (k.local ? g.vm?.socketApparent?.('head', V3()) : null) || k.muzzle(V3());
  // aim: tip into the ground short of the point (a javelin sticks at an angle)
  const dist = Math.min(p.range, d.P0.distanceTo(d.T));
  d.T1 = d.T.clone().add(_c.set(0, THROW.lift, 0));
  if (d.P0.distanceTo(d.T1) > p.range) d.T1.sub(d.P0).setLength(p.range).add(d.P0);
  d.dur = Math.max(0.2, d.P0.distanceTo(d.T1) / p.speed);
  d.apex = Math.min(2.6, Math.max(0.9, dist * 0.1));   // short throws arc higher: they come down steep enough to stick
  d.land0 = k.t + d.dur;
  d.pos = d.P0.clone();
  d.mesh = javelinMesh(g);
  orient(d.mesh, d.pos, _d.subVectors(d.T1, d.P0));
  d.trails = javelinTrails(g);
  d.fly = play(g, 'fly', k.local ? { volume: 0.6 } : { pos: d.P0, volume: 0.6 });
  if (k.local && k.ws && mine(g, k.ws)) {
    g.vm.hideFor(8, 1); stOf(k.ws).hid = true;
    g.vm.setAnchor('R', { pos: [0.1, -0.12, -0.42], F: [-0.15, 0.3, -1], N: [-0.4, -0.85, -0.3], pose: 'palm', palm: [0.02, 0.045] }, 0.08);
    g.vm.setAnchor('L', 'rest', 0.15);
  }
}
function landed(k) {
  const g = k.game, d = k.data, p = k.p;
  d.phase = 'stuck'; d.land = k.t;
  d.fly?.stop?.(0.05);
  // driven in: the tip into the aim point along the arrival line, at least 40° down, buried THROW.sink along the shaft
  const c = d.T, hz = _d.subVectors(d.T, d.P0).setY(0);
  if (hz.lengthSq() < 1e-6) hz.set(0, 0, -1);
  hz.normalize();
  const slope = Math.max(40 * D2R, Math.atan2(4 * d.apex / Math.max(0.5, d.P0.distanceTo(d.T1)) + Math.max(0, d.P0.y - d.T1.y) / Math.max(0.5, d.P0.distanceTo(d.T1)), 1));
  const dirW = hz.multiplyScalar(Math.cos(slope)).add(_e.set(0, -Math.sin(slope), 0)).normalize();
  const tip = c.clone().addScaledVector(dirW, THROW.sink), centre = tip.clone().addScaledVector(dirW, -JAV.tip);
  orient(d.mesh, centre, dirW);
  d.pos.copy(centre);
  g.fx?.sparkBurst?.(c.clone().add(_a.set(0, 0.15, 0)), { color: k3(COL.white, 0.6), color1: k3(COL.spark, 0.5), count: 18, speed: 7, glow: 0.6, normal: UPV });
  for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; g.fx?.knockDust?.(_a.set(c.x + Math.cos(a) * 0.3, c.y, c.z + Math.sin(a) * 0.3), _b.set(Math.cos(a) * 3, 0, Math.sin(a) * 3), 0.7); }
  rubble(g, c, 6, 4);
  g.fx?.decals?.add(c, UPV, { frame: DECAL.scorch, size: 0.5, tint: DECAL_TINT.scorch, life: 6 });
  // the 6 m reach telegraphed on the street (bright enough to step out of, not a floodlight)
  d.sig = g.fx?.sigils?.sigil?.(_a.set(c.x, c.y + 0.04, c.z), { design: 'isobar', radius: p.ringR, color: k3(COL.core, 0.16), color1: k3(COL.violet, 0.24), intensity: 0.32, life: p.delay + 0.5, seed: k.ev.seed });
  play(g, 'impact', { pos: c, volume: 1 });
  if (k.local) { const near = clamp01(1 - c.distanceTo(g.camera.position) / 25); g.addShake?.(0.08 * near); }
}
function strike(k) {
  const g = k.game, d = k.data, p = k.p, c = d.T;
  d.struck = true;
  d.cloud?.flash?.(1.6, c);
  const dist = c.distanceTo(g.camera.position), near = clamp01(1 - dist / 30), h = d.h || 8, q = quality(g);
  const centre = centreOf(g.camera, c, _a.set(c.x, c.y + h, c.z));
  if (k.level >= 3) giantStrike(g, c, { h, r: p.ringR, near: 0.55 + 0.45 * clamp01(dist / 10), seed: k.ev.seed, centre, lite: q !== 'high' });
  else { arc(g, _a.set(c.x, c.y + h, c.z), c, { w: 0.35, life: 0.2, k: 1.1, levels: 6, jitter: 0.07, branches: 3 }); burstFx(g, c, p.ringR * 0.6, { near: 0.8, seed: k.ev.seed }); }
  play(g, 'thunder', { pos: c, volume: 1.2 });
  // the white TINT (§ card α 0.25), held under the level where lit zombies wash out to white (lower on low quality,
  // whose tonemapping clips earlier)
  if (clipComfort.overlay !== false && dist < 30) g.fx?.overlay?.tint?.([1.12, 1.06, 1.35], (q === 'low' ? 0.1 : 0.18) * (0.4 + 0.6 * near), 0.14);
  d.sig?.stop?.(0.4);
  // everyone sees the bodies in the ring jerk with the current
  for (const t of g.targets?.inRadius?.(c, p.ringR) || []) { const z = t.zombie || t; if (z?.bones) jolt(g, z, Math.hypot(z.pos.x - c.x, z.pos.z - c.z) <= p.coreR ? 1.2 : 0.8, 0.9); }
  if (!k.local) return;
  g.addShake?.(0.5 * (0.35 + 0.65 * near)); hitStop(g, 110); haptic(40);
  const ar = g.arsenal, ws = k.ws, s = ws && stOf(ws);
  let n = 0;
  for (const t of g.targets?.inRadius?.(c, p.ringR) || []) {
    const pt = t.center(V3()), dd = Math.hypot(pt.x - c.x, pt.z - c.z), core = dd <= p.coreR;
    const dir = pt.clone().sub(c).setY(0);
    if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
    const info = { amount: (core ? p.dmg : p.ring) * (ar?.dmgMul ?? 1), part: 'body', point: pt, dir: dir.normalize(), knock: core ? 3 : 5, stagger: 1,
      weapon: k.def.id, shooter: g.localId, explosive: true, skill: 'chunting_throw', elem: 'chunting', big: core };
    k._feedback(info, t.damage(info), t);
    if (s) stun(s, t.zombie || t, p.stun);
    n++;
  }
  if (n) play(g, 'kill', { volume: 0.5 });
}
/** Pulled free: the flight home starts (a flat arc in from the right of the caster's view). */
function back(k, t) {
  const g = k.game, d = k.data, p = k.p;
  const from = d.pos.clone(), hand = catchPoint(k, V3()), dir = k.caster(_a, _b) && _b.clone();
  const right = _c.set(-dir.z, 0, dir.x).normalize(), dist = from.distanceTo(hand);
  const ctl = from.clone().lerp(hand, 0.55).addScaledVector(right, Math.min(7, dist * 0.42)).add(_e.set(0, 0.6 + dist * 0.04, 0));
  const dur = Math.max(0.3, Math.min(0.5, (k.local ? p.lock : p.lock + 0.5) - t));
  d.phase = 'back';
  d.ret = { t: 0, from, dur, ctl, vel: hand.clone().sub(from).normalize() };
  play(g, 'ret', { pos: d.pos, volume: 0.7 });
  // the whoosh coming at the caster, ending on the catch
  d.whoosh = k.local ? play(g, 'whoosh', { volume: 0.85, delay: Math.max(0, dur - 0.4), pitch: 0.85 }) : play(g, 'whoosh', { pos: hand, volume: 0.6, delay: Math.max(0, dur - 0.4) });
}
/** Where the halberd is caught: beside the right hand (0.4 m right, 0.3 m down of where the grip appears), world. */
function catchPoint(k, out) {
  const g = k.game, vm = g.vm;
  if (k.local && k.ws && vm?.weapon && mine(g, k.ws) && vm.socketApparent('grip_r', out)) {
    const q = g.camera.quaternion;
    return out.add(_d.set(0.4, -0.3, 0).applyQuaternion(q));
  }
  const pos = k.caster(out, _d);
  return pos.add(_e.set(-_d.z, 0, _d.x).normalize().multiplyScalar(0.35)).add(_d.set(0, -0.3, 0));
}
function caught(k) {
  const g = k.game;
  play(g, 'catch', k.local ? { volume: 0.9 } : { pos: k.data.pos, volume: 0.7 });
  if (k.local && k.ws) stOf(k.ws).hid = false;
  if (!k.local || !k.ws || !mine(g, k.ws)) return;
  g.vm.hideFor(0);
  g.vm.setPart('fx_blade', BLADE_REST, 0.3);
  // caught at full length: sections 2 and 3 slide back in with two clicks
  g.vm.partState.fx_seg2 = { v: 0 }; g.vm.partState.fx_seg3 = { v: 0 }; stOf(k.ws).extHold = 0.6;
  later(g, 0.25, () => { g.vm.setPart('fx_seg3', REST_EXT[2], 0.14); play(g, 'seg', { volume: 0.5, pitch: 0.95 }); });
  later(g, 0.36, () => { g.vm.setPart('fx_seg2', REST_EXT[1], 0.14); play(g, 'seg', { volume: 0.5, pitch: 0.85 }); });
  g.arsenal.playClip('chunting_catch', { duration: 0.42 });
  haptic(14);
}

// ★ 雷樁: a lightning rod driven into the crosshair point for 8 s.
registerSkill('chunting_rod', {
  level: 'L2', aim: 'target', dur: 8.6, defaults: { range: 25, dur: 8, r: 6, chance: 0.2, dmg: 40 },
  start(k) {
    const g = k.game, d = k.data, c = k.at.clone();
    d.c = c; d.mesh = rodMesh(); d.mesh.position.set(c.x, c.y + 7, c.z); g.scene.add(d.mesh); d.planted = false; d.crackle = 0.3;
    d.mesh.rotation.y = k.rng() * TAU;
    play(g, 'rodPlant', k.local ? { volume: 0.9 } : { pos: c, volume: 0.9 });
    if (k.local && k.ws && mine(g, k.ws) && !stOf(k.ws).thrown) { g.punch?.impulse(0.015, 0, 0); g.vm.kick?.({ back: 0.01, up: 2.5, side: 0, roll: 0 }); tipArc(g, 1.4); }
    rods(g).push(d.rod = { pos: c, tip: c.clone().add(_a.set(0, ROD_TIP, 0)), until: Infinity, p: k.p, by: k.by, k });
  },
  update(k, dt) {
    const g = k.game, d = k.data, c = d.c, p = k.p;
    if (!d.planted) {
      const u = Math.min(1, k.t / 0.12);
      d.mesh.position.y = c.y + 7 * (1 - u * u) - 0.2 * u;
      if (u >= 1) {
        d.planted = true;
        arc(g, _a.set(c.x + (R() - 0.5), c.y + 14, c.z + (R() - 0.5)), _b.set(c.x, c.y + ROD_TIP, c.z), { w: 0.2, life: 0.16, k: 1.2, levels: 6, jitter: 0.08, branches: 3 });
        burstFx(g, c, 1.6, { near: 0.7, seed: k.ev.seed });
        // the reach: a faint isobar under it (a marker, not a light show: the street has to stay readable)
        d.sig = g.fx?.sigils?.sigil?.(_a.set(c.x, c.y + 0.04, c.z), { design: 'isobar', radius: p.r, color: k3(COL.core, 0.07), color1: k3(COL.violet, 0.1), intensity: 0.16, life: p.dur, seed: k.ev.seed });
        d.loop = play(g, 'rodLoop', { pos: c, loop: true, volume: 0.45 });
        d.rod.until = g.time + p.dur;
        if (k.local) g.addShake?.(Math.max(0.03, 0.15 - c.distanceTo(g.camera.position) / 80));
      }
      return true;
    }
    // the crown: a corona glow breathing on the ball, crackle off the prongs (reads at 15 m), a beacon pulse a second
    const tip = d.rod.tip, P = g.fx?.particles;
    if ((d.glowT = (d.glowT ?? 0) - dt) <= 0) {
      d.glowT = 0.05;
      const br = 0.75 + 0.25 * Math.sin(k.t * 6);
      P?.spawn({ additive: true, x: tip.x, y: tip.y, z: tip.z, life: 0.09, size: 0.55 * br, size1: 0.7, color: [...k3(COL.rim, 0.16 * br), 1], color1: [...k3(COL.violet, 0.03), 0], frame: FRAME.glow });
    }
    if ((d.crackle -= dt) <= 0) {
      d.crackle = 0.18 + R() * 0.3;
      arc(g, tip, _a.copy(tip).add(_b.set((R() - 0.5) * 1.4, (R() - 0.2) * 0.9, (R() - 0.5) * 1.4)), { w: 0.05, life: 0.08, k: 0.85, levels: 4, jitter: 0.25, branches: R() < 0.3 ? 1 : 0 });
    }
    if ((d.beat = (d.beat ?? 0.6) - dt) <= 0) { d.beat = 1; if (quality(g) !== 'low') g.fx?.lights?.flash?.(tip, 0xb9a6ff, 8, 5, 0.25); }
    return k.t < p.dur + 0.12;
  },
  end(k) {
    const g = k.game, d = k.data;
    d.loop?.stop?.(0.3); d.sig?.stop?.(0.3);
    const list = rods(g), i = list.indexOf(d.rod);
    if (i >= 0) list.splice(i, 1);
    if (d.mesh) {
      // it sinks back into the street with a last spark
      const m = d.mesh;
      g.fx?.sparkBurst?.(m.position.clone().add(_a.set(0, 1.5, 0)), { color: k3(COL.white, 0.5), color1: k3(COL.violet, 0.4), count: 10, speed: 4, glow: 0.4 });
      play(g, 'rodEnd', { pos: m.position, volume: 0.6 });
      let t = 0;
      const sys = { update(dt) { t += dt; m.position.y -= dt * 3.2; if (t > 0.5) { m.removeFromParent(); g.systems.splice(g.systems.indexOf(sys), 1); } } };
      g.systems.push(sys);
    }
  },
});
/** live rods in this game (every client: the hits are each client's own) */
function rods(g) {
  if (!g._chRods) {
    g._chRods = [];
    // every damaging hit by us passes the HUD: a hit on a zombie within a rod's reach may draw its arc
    const hud = g.hud;
    if (hud && !hud._chRod) {
      hud._chRod = true;
      const base = hud.onHit.bind(hud);
      hud.onHit = (info, res, target) => { base(info, res, target); try { rodHit(g, info, res, target); } catch (e) { console.warn('[chunting] rod', e); } };
    }
  }
  return g._chRods;
}
function rodHit(g, info, res, target) {
  // shots only (bullets, pellets, darts, blades): skill ticks -- the halberd's own 放電 among them -- do not draw it
  if (!g._chRods?.length || info?.skill || !res || res.killed || !(res.damage > 0)) return;
  const z = target?.zombie || target;
  if (!z?.alive || !z.center) return;
  const cd = (g._chRodCd ||= new WeakMap());
  if (g.time - (cd.get(z) ?? -9) < 0.3) return;   // ≤ ~3 arcs a second on one zombie under an SMG
  for (const r of g._chRods) {
    if (g.time > r.until || r.until === Infinity) continue;
    if (Math.hypot(z.pos.x - r.pos.x, z.pos.z - r.pos.z) > r.p.r || R() >= r.p.chance) continue;
    cd.set(z, g.time); g._chRodN = (g._chRodN || 0) + 1;   // (dev stat: arcs drawn)
    const c = z.center(V3());
    arc(g, r.tip, c, { w: 0.07, life: 0.14, k: 1.1, levels: 5, jitter: 0.12, branches: 1 });
    g.fx?.particles?.spawn({ additive: true, x: c.x, y: c.y, z: c.z, life: 0.08, size: 0.5, size1: 0.8, color: [...k3(COL.white, 0.4), 1], color1: [...k3(COL.violet, 0.05), 0], frame: FRAME.glow });
    g.fx?.zfx?.status?.(z, 'arcshock', 0.3);
    play(g, 'rodArc', { pos: c, volume: 0.6 });
    const inf = { amount: r.p.dmg * (g.arsenal?.dmgMul ?? 1), part: 'body', point: c, dir: c.clone().sub(r.tip).normalize(), knock: 0.5, stagger: 0.6,
      weapon: ID, shooter: g.localId, skill: 'chunting_rod', elem: 'chunting' };
    const rr = z.damage(inf);
    g.hud?.onHit?.(inf, rr, z);
    if (rr?.killed) killFx(g, z, inf);
    return;
  }
}

// ------------------------------------------------------------------------------------- kills
let _keAt = [];
function killFx(g, z, info) {
  const now = g.time, p = info.point || z.center?.(V3()) || z.pos;
  _keAt = _keAt.filter((t) => now - t < 1.2);
  if (z.kvel) z.kvel.y = Math.max(z.kvel.y, 1.6);   // the jolt throws the body a little
  // a charred body under a violet rim, never the shared white death flash (a strike killing a pack turned it into a
  // crowd of white cut-outs)
  g.fx?.zfx?.clearStatus?.(z, 'kill');
  // ≤ 3 full KE_CHAR at a time per player (§1.10); the rest still flicker
  if (_keAt.length >= 3) { g.fx?.zfx?.status?.(z, 'charkill', 0.8); return; }
  _keAt.push(now);
  charKill(g, z, p, { big: !!info.big });
}

// ------------------------------------------------------------------------------------- viewmodel driver
function view(ws, g, dt) {
  const s = stOf(ws), vm = g.vm, w = vm.weapon, ar = g.arsenal;
  const v = s.view || (s.view = { w: null, t: 0, pk: 0, led: -1 });
  if (v.w !== w) { v.w = w; v.t = 0; prewarm(g); }
  v.t += dt; v.pk = Math.max(0, v.pk - dt * 4);
  if (!s.snd.hum && g.audio?.has?.(SND.idle[0])) s.snd.hum = g.audio.play(SND.idle[0], { loop: true, volume: 0.12, fadeIn: 0.4 });
  const cs = chargeState(ws, g), ready = !!cs?.ready, zap = !!s.zap, ch = s.rmb?.charging ? s.rmb.stage + 1 : 0, frac = ws.ammo / ws.def.mag;
  // glow: the coils, fuller, electrodes and LED cells breathe at 0.5 Hz; flare with the arcs, climb with the charge
  const G = vm._glowMat;
  if (G) {
    const br = 0.85 + 0.15 * Math.sin(v.t * TAU * (ready ? 1.2 : 0.5));
    G.glow_arc = br * (0.55 + 0.45 * frac) * (zap ? 2.3 + 0.9 * Math.abs(Math.sin(v.t * 41)) : ch ? 1 + ch * 0.7 : ready ? 1.25 : 1) * (1 + v.pk);
    // the coil cores (glow_white): a low ember at rest (~1.5 HDR, about a sixth of the arcs) so the capacitor stays the hero, level with the arcs while
    // discharging / charging. (The viewmodel scales MATS[key].glow -- 6 here, 8 for glow_arc -- not the def's mat.glow.)
    G.glow_white = G.glow_arc * (zap ? 1.33 : ch ? 0.9 + 0.2 * ch : 0.22) * (1 + 0.8 * v.pk);
  }
  // the shaft: rest extension (2 and 3 run out with the 驚蟄 stages; tweens and clips take over while they run)
  const st = s.rmb?.charging ? s.rmb.stage : 0;
  s.extHold = Math.max(0, (s.extHold || 0) - dt);
  // (clips flagged segFree -- draw, first draw, inspect -- drive the sections themselves: out to full and back to rest)
  const free = vm.clip.active && vm.clip.clip?.segFree;
  if (!s.extHold) SEGS.forEach((k, i) => { const ps = vm.partState[k] || (vm.partState[k] = { v: 0 }); if (!ps.tw) ps.v = free || (st > i - 1 && i) ? 0 : REST_EXT[i]; });
  { const ps = vm.partState.fx_blade || (vm.partState.fx_blade = { v: BLADE_REST }); if (!ps.tw && !s.rmb?.charging && !s.thrown) ps.v = BLADE_REST; }
  // the inspect's light-round-the-skirts part shows only when the clip shows it
  (vm.partState.fx_ding || (vm.partState.fx_ding = { v: 0 })).hidden = true;
  // the LED bar: one cell per sixth of 雷能, the last one blinks under 20 %
  const n = Math.ceil(frac * 6 - 1e-3), blink = frac < 0.2 && Math.sin(v.t * 18) < 0;
  for (let i = 0; i < 6; i++) { const ps = vm.partState[`fx_led${i + 1}`] || (vm.partState[`fx_led${i + 1}`] = { v: 0 }); ps.hidden = i >= n || (i === n - 1 && blink); }
  // the capacitor's own arcs between the electrodes (more while discharging / charging)
  if ((s.capT -= dt) <= 0) { s.capT = zap ? 0.04 : ch ? 0.08 : ready ? 0.5 + R() * 0.4 : 1 + R() * 1.5; capArcs(g, zap || ch ? 1.3 : 0.8); }
  // idle: every ~6 s a small arc from the spear tip to the ground (§ card)
  const quiet = ar.state === 'idle' && !zap && !s.rmb && !s.thrown;
  if (quiet && (s.arcT -= dt) <= 0) { s.arcT = 5 + R() * 2.5; groundArc(g); }
  // while the 驚蟄 charge holds: arcs between the coils
  if (ch && R() < dt * 8) coilArc(g, 0.8 + 0.3 * ch);
  // rare idle every 14 s of quiet: the crescent half-flips and snaps back
  if (quiet && !vm.clip.active && ar.sinceShot > 2) { if ((s.idleT += dt) >= 14) { s.idleT = 0; gunClip(g, ws, 'chunting_idle_rare'); } } else s.idleT = 0;
}
/**
 * First equip (once a game): everything the throw, the storm, the strike and the rod draw for the first time is built,
 * compiled and drawn once off-screen now (each first use hitched: the javelin's world material variant 535 ms
 * mid-flight, the storm and the strike ~90): the javelin clone (its own hard-surface world variant, premiumKey
 * p3:chunting:throw), the storm's materials, the rod, a sigil, the ground marks, the ribbons, a shockwave, the overlays.
 */
function prewarm(g) {
  if (g._chWarm) return;
  g._chWarm = true;
  try {
    const fx = g.fx, far = g.camera.position.clone().add(_a.set(0, -60, 0)), far2 = far.clone().add(_b.set(0, -1, 0));
    fx?.sigils?.preload?.(['isobar']);
    fx?.sigils?.sigil?.(far, { design: 'isobar', radius: 0.05, color: [0, 0, 0], color1: [0, 0, 0], intensity: 0, life: 0.1 });
    fx?.bolt?.(far, far2, { width: 0.001, life: 0.05 });
    fx?.bolt?.(_c.set(0, -0.3, -0.5), _e.set(0, -0.3, -0.6), { vm: true, width: 0.0001, life: 0.05 });
    fx?.beam?.(far, far2, { wGlow: 0.001, life: 0.05 });
    const tr = fx?.trail?.({ width: 0.001, life: 0.05, color: [0, 0, 0, 0], segs: 4 });
    if (tr) { tr.push(far); tr.push(far2); tr.stop(); }
    fx?.shockwave?.(far, { normal: UPV, r1: 0.05, life: 0.1, color: [0, 0, 0] });
    // the particle layers' first draws (world additive / alpha, the viewmodel's additive: a flat ring, a streak)
    const P = fx?.particles;
    P?.spawn({ additive: true, x: far.x, y: far.y, z: far.z, life: 0.05, size: 0.01, color: [0, 0, 0, 0], frame: FRAME.glow });
    P?.spawn({ additive: true, x: far.x, y: far.y, z: far.z, vx: 1, life: 0.05, size: 0.01, color: [0, 0, 0, 0], frame: FRAME.spark, stretch: 0.02 });
    P?.spawn({ x: far.x, y: far.y, z: far.z, life: 0.05, size: 0.01, color: [0, 0, 0, 0], frame: FRAME.puff, lit: true });
    P?.spawn({ additive: true, vm: true, x: 0, y: -0.3, z: 0.5, mode: 'flat', dir: [0, 0, 1], life: 0.05, size: 0.001, color: [0, 0, 0, 0], frame: FRAME.thinRing });
    for (const kind of ['glow', 'shock', 'crack']) fx?.zfx?.ground?.add?.(kind, far, { r: 0.05, life: 0.05, col: [0, 0, 0], alpha: 0 });
    fx?.decals?.add?.(far, UPV, { frame: DECAL.scorch, size: 0.01, tint: DECAL_TINT.scorch, life: 0.05 });
    fx?.overlay?.tint?.([1, 1, 1], 0.0001, 0.05);
    fx?.overlay?.border?.([0, 0, 0], 0.0001, 0.05);
    const grp = new THREE.Group();
    grp.name = 'chunting-warm';
    for (const m of warmMeshes()) { m.frustumCulled = false; grp.add(m); }
    grp.add(rodMesh());
    grp.position.copy(far);
    grp.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    const gl = g.renderer?.gl;
    const show = (obj, frames = 3) => {
      // compiled (in parallel where the driver can), then drawn for a few frames under the street: the programs' first
      // use and the buffer uploads happen here, not on the first throw
      g.scene.add(obj);
      const done = () => { let n = frames; const sys = { update() { if (--n > 0) return; g.systems.splice(g.systems.indexOf(sys), 1); obj.removeFromParent(); } }; g.systems.push(sys); };
      const c = gl?.compileAsync?.(obj, g.camera, g.scene);
      if (c?.then) c.then(done, done); else done();
    };
    show(grp);
    // the crosshair's other states (discharging, the charge, thrown) drawn once each, a frame apiece: their first
    // rebuild came with the first discharge
    let f = 0;
    const xs = { update() { f++; Object.assign(XS, f < 3 ? { zap: true } : f < 5 ? { charging: true, stage: 2 } : f < 7 ? { thrown: true } : {}); if (f >= 7) g.systems.splice(g.systems.indexOf(xs), 1); } };
    g.systems.push(xs);
    javelinProto();
    _javLoad?.then?.(() => { if (!_jav) return; const j = _jav.clone(); j.position.copy(far); j.traverse((o) => { if (o.isMesh) o.frustumCulled = false; }); show(j); });
  } catch (e) { console.warn('[chunting] prewarm', e); }
}
/** render quality bucket: 'high' (high / ultra), 'medium', 'low' */
function quality(g) { const n = g.renderer?.qualityName || 'high'; return n === 'low' ? 'low' : n === 'medium' ? 'medium' : 'high'; }
function later(g, sec, fn) { let t = 0; const sys = { update: (dt) => { if ((t += dt) >= sec) { g.systems.splice(g.systems.indexOf(sys), 1); fn(); } } }; g.systems.push(sys); }
function gunClip(g, ws, id) { const ar = g.arsenal; if (ar?.current === ws && ar.state === 'idle') ar.playClip(id); }

// Viewmodel effects ride their sockets (vmFlash / vmArcT re-read the socket every frame while they live): a clip moving
// the gun 15 cm in 0.1 s left one-shot particles hanging in the air beside it.
const sock = (g, name, f = 0, u = 0, r = 0) => () => {
  const vm = g.vm, c = vm?.weapon && vm.socketCam(name, V3());
  if (!c) return null;
  if (f || u || r) { const A = gunAxes(vm); c.addScaledVector(A.f, f).addScaledVector(A.u, u).addScaledVector(A.r, r); }
  return c;
};
/** a flash and a crackle at one coil (draw: they light one after another) */
function coilFlash(ws, g, i) {
  const vm = g.vm;
  if (!vm?.weapon) return;
  const P = sock(g, 'coil', (i - 1) * 0.04);
  vmFlash(g, P, { life: 0.2, size: [0.035, 0.08], col: COL.core, k: 0.32, ring: () => gunAxes(vm).f.clone() });
  for (let k = 0; k < 2; k++) { const ox = (R() - 0.5) * 0.02, oz = (R() - 0.5) * 0.02; vmArcT(g, sock(g, 'coil', (i - 1) * 0.04 + oz, -0.02, ox), sock(g, 'coil', (i - 1) * 0.04 + oz, 0.03, ox), { w: 0.003, life: 0.08, k: 1.1 }); }
  play(g, 'coil', { volume: 0.4, pitch: 1 + i * 0.12 });
  const v = stOf(ws).view; if (v) v.pk = Math.max(v.pk, 0.8);
}
function coilsAll(ws, g, k) { for (let i = 0; i < 3; i++) later(g, i * 0.04, () => coilFlash(ws, g, i)); const v = stOf(ws).view; if (v) v.pk = Math.max(v.pk, k); }
/** a camera-space arc between two coils */
function coilArc(g, k = 1) {
  const a = (R() - 0.5) * 2;
  vmArcT(g, sock(g, 'coil', -0.04, 0.026 * Math.cos(a), 0.026 * Math.sin(a)), sock(g, 'coil', 0.04, 0.026 * Math.cos(a + 0.6), 0.026 * Math.sin(a + 0.6)), { w: 0.0026, life: 0.06, k });
}
/** arcs jumping between the capacitor's electrode balls (seen through the glass) */
function capArcs(g, k = 1) {
  for (const sd of [-1, 1]) vmArcT(g, sock(g, 'cap', sd * 0.053), sock(g, 'cap', sd * 0.047), { w: 0.0016 * k, life: 0.05 + R() * 0.04, k, levels: 2, jitter: 0.5 });
}
/** a short arc off the spear: k < 1 a lick of the tip, else a fork to the electrode */
function tipArc(g, k = 1) {
  const ou = (R() - 0.3) * 0.03, orr = (R() - 0.5) * 0.03;
  vmArcT(g, sock(g, 'arc'), sock(g, 'tip', 0, ou, orr), { w: 0.003 * k, life: 0.08, k: 0.9 * k, levels: 4 });
  if (k > 1) vmArcT(g, sock(g, 'tip'), sock(g, 'tip', 0, 0.05 + R() * 0.05, (R() - 0.5) * 0.08), { w: 0.003, life: 0.08, k, levels: 4 });
}
/** idle: a small world arc from the spear tip to the ground in front */
function groundArc(g) {
  const vm = g.vm, tip = vm?.socketApparent?.('tip', V3());
  if (!tip) return;
  const fl = g.world?.collision?.floorBelow?.(_c.set(tip.x, tip.y, tip.z), 0.2, 4);
  const y = Number.isFinite(fl) ? fl : tip.y - 1.4;
  _a.set(tip.x + (R() - 0.5) * 0.6, y + 0.02, tip.z + (R() - 0.5) * 0.6);
  arc(g, tip, _a, { w: 0.025, life: 0.09, k: 0.75, levels: 5, jitter: 0.14, branches: 1 });
  g.fx?.sparkBurst?.(_a.clone(), { color: k3(COL.white, 0.4), color1: k3(COL.violet, 0.3), count: 4, speed: 2.5, glow: 0.2, normal: UPV });
  play(g, 'crack', { volume: 0.18, pitch: 1.4 + R() * 0.3 });
}
/** first draw: the crack to the sky -- a world bolt off the spear tip 9 m up, an edge flash, a rumble */
function skyBolt(g) {
  const tip = g.vm?.socketApparent?.('tip', V3());
  if (!tip) return;
  const top = tip.clone().add(_a.set((R() - 0.5) * 2, 9 + R(), (R() - 0.5) * 2));
  g.fx?.bolt?.(tip, top, { col: k3(COL.white, 1.0), glow: k3(COL.violet, 0.6), width: 0.24, core: 0.3, levels: 6, jitter: 0.08, branches: 3, regen: 0.04, life: 0.18 });
  after(g, 0.08, () => g.fx?.bolt?.(tip, top, { col: k3(COL.white, 0.8), glow: k3(COL.violet, 0.5), width: 0.18, core: 0.3, levels: 6, jitter: 0.09, branches: 2, regen: 0.04, life: 0.1 }));
  vmFlash(g, sock(g, 'tip'), { life: 0.2, size: [0.06, 0.16], col: COL.rim, k: 0.5 });
  g.fx?.lights?.flash?.(tip.clone().add(_a.set(0, 1.5, 0)), 0xc9b8ff, 25, 9, 0.15);
  if (clipComfort.overlay !== false) g.fx?.overlay?.border?.([0.75, 0.68, 1.0], 0.12, 0.22, { fadeIn: 0.01, fadeOut: 0.18 });
  play(g, 'crack', { volume: 0.7, pitch: 0.75 });
  play(g, 'streamer', { volume: 0.4, pitch: 0.8, delay: 0.05 });
}
/** inspect: the thumb flicks a coil, the arc jumps onto the glove (following the hand), the hand twitches */
function gloveZap(ws, g) {
  const vm = g.vm;
  if (!vm?.handPos?.L) return;
  // (on the glove's eye side: the wrist itself sits behind the glove and hid the arcs)
  const hand = (o) => () => vm.handPos.L.clone().add(_e.set(o[0], o[1], o[2]));
  const spots = [[0.01, 0.02, 0.03], [-0.02, 0.03, 0.035], [0.02, -0.01, 0.04], [-0.01, 0.0, 0.05]];
  for (let i = 0; i < 6; i++) later(g, i * 0.04, () => vmArcT(g, sock(g, 'flick'), hand(spots[i % 4]), { w: 0.006, life: 0.1, k: 1.5, levels: 4, jitter: 0.3 }));
  vmFlash(g, hand([0, 0.01, 0.04]), { life: 0.24, size: [0.04, 0.09], col: COL.rim, k: 0.45 });
  vmFlash(g, sock(g, 'flick'), { life: 0.12, size: [0.02, 0.05], col: COL.white, k: 0.35 });
  play(g, 'glove', { volume: 0.7 });
  haptic(12);
}
/** inspect: a knuckle taps an insulator: 「叮」 and a violet-white light runs round its skirts (the fx_ding part's arcs
 *  swept 360° by the clip; this is the sound and a faint glint on the porcelain) */
function insulatorDing(ws, g) {
  play(g, 'ding', { volume: 0.7, pitch: 1.5 });
  // the violet lights flare with the ring (the comets running round the skirts are glow_arc: x3.5, easing back)
  const v = stOf(ws).view; if (v) v.pk = Math.max(v.pk, 2.5);
  vmFlash(g, sock(g, 'knock'), { life: 0.1, size: [0.012, 0.02], col: COL.white, k: 0.2 });
}
/** rare inspect: arcs close into a little ring between the glove's fingers, then the fist snuffs it */
function gloveRing(ws, g) {
  const vm = g.vm;
  if (!vm?.handPos?.L) return;
  // (a hand's width in front of the palm, facing the eye; the fist closes on it at the end of the clip)
  const at = (a) => () => { const c = vm.handPos.L.clone().add(_c.set(0.0, 0.11, 0.02)); return c.add(_c.set(Math.cos(a) * 0.032, Math.sin(a) * 0.032, 0)); };
  for (let i = 0; i < 12; i++) later(g, i * 0.06, () => {
    const a0 = i / 6 * TAU, a1 = a0 + 1.15;
    vmArcT(g, at(a0), at(a1), { w: 0.003, life: 0.1, k: 1.6, levels: 3 });
    if (i % 3 === 0) play(g, 'glove', { volume: 0.25, pitch: 1.4 });
  });
}

// ------------------------------------------------------------------------------------- clips
// Positions m, rotations deg (x pitch, y yaw, z roll) about the right hand, relative to the hip pose.
const Z3 = [0, 0, 0];
const C = (o) => ['ch', o];
// the left hand's place between actions (carried one-handed: the support hand stays off the screen, model meta support 'none')
const LH = 'rest';
// a section shooting out of collapsed (1) at t0..t1; then (to < 1: the sections carried collapsed at rest) back to its
// rest length at to..to+0.08
const SEG = (i, t0, t1, to = 0.86) => { const r = REST_EXT[i]; return r > 0 ? [[0, 1], [t0, 1], [t1, 0, 'out3'], [to, 0], [to + 0.08, r, 'inOut'], [1, r]] : [[0, 1], [t0, 1], [t1, 0, 'out3'], [1, 0]]; };
// draw 0.8 s: the collapsed device comes up, the sections shoot out one after another (喀喀喀), the coils light in turn,
// a spark licks the spear tip
registerClip('chunting_draw', () => ({
  duration: 0.8, segFree: true,
  tracks: {
    gunPos: [[0, [0.04, -0.2, 0.08]], [0.45, [0.004, 0.006, 0.0], 'out3'], [0.7, [0, -0.004, 0.004]], [1, Z3, 'inOut']],
    gunRot: [[0, [-34, 14, 22]], [0.45, [3, -2, -2], 'out3'], [0.7, [-1, 0, 1]], [1, Z3, 'inOut']],
    fx_seg1: SEG(0, 0.3, 0.42, 0.82), fx_seg2: SEG(1, 0.4, 0.52, 0.86), fx_seg3: SEG(2, 0.5, 0.62, 0.8),
  },
  events: [[0, 'anchorL', ['rest', 0.04]], [0.04, C({ snd: 'draw', vol: 0.8 })], [0.38, C({ seg: 0 })], [0.48, C({ seg: 1 })], [0.58, C({ seg: 2 })], [0.6, 'haptic', 'tick'],
    [0.87, C({ seg: 1 })], [0.93, C({ seg: 0 })],
    [0.62, C({ coil: 0 })], [0.7, C({ coil: 1 })], [0.78, C({ coil: 2 })], [0.84, C({ tip: 1.2 })], [0.72, 'anchorL', [LH, 0.14]], [0.74, 'poseL', 'relaxed'],
    [0, 'glow', { to: 0.2, sec: 0 }], [0.6, 'glow', { to: 1, sec: 0.3 }]],
}));
// 首次登場 1.6 s: swung up from low right with a roll, the sections fire out, the crescent flips out and back, the coils
// light in a run, a crack of lightning off the tip to the sky, the capacitor flares; freeze; the 驚蟄 sting
registerClip('chunting_first', {
  duration: 1.6, segFree: true,
  tracks: {
    gunPos: [[0, [0.12, -0.26, 0.1]], [0.2, [0.0, 0.0, 0.03], 'out3'], [0.42, [-0.04, -0.02, 0.06]], [0.6, [-0.04, -0.02, 0.06]], [0.8, [0, 0.004, 0], 'inOut'], [1, Z3]],
    gunRot: [[0, [-30, 30, -60]], [0.2, [-4, -6, 6], 'out3'], [0.42, [-8, 16, 14], 'inOut'], [0.6, [-7, 17, 15]], [0.8, [1, -1, 0], 'inOut'], [1, Z3]],
    fx_seg1: SEG(0, 0.18, 0.26), fx_seg2: SEG(1, 0.24, 0.32, 0.8), fx_seg3: SEG(2, 0.3, 0.38, 0.76),
    fx_blade: [[0, 0], [0.4, 0], [0.47, 1, 'outBack'], [0.62, 1], [0.72, 0, 'in3'], [1, 0]],
    env: [[0, 0], [0.25, 1], [0.8, 1], [1, 0]],
  },
  events: [[0, 'anchorL', ['rest', 0.05]], [0.02, C({ snd: 'first', vol: 0.9 })], [0.04, 'glow', { to: 0.15, sec: 0 }], [0.2, 'haptic', 'tick'],
    [0.24, C({ seg: 0 })], [0.3, C({ seg: 1 })], [0.36, C({ seg: 2 })], [0.4, C({ coils: true })], [0.82, C({ seg: 1 })], [0.86, C({ seg: 0 })], [0.47, C({ snd: 'blade', vol: 0.8 })], [0.47, 'haptic', 'tick'],
    [0.56, C({ tip: 2 })], [0.56, C({ sky: true })], [0.56, C({ cap: 2 })], [0.56, 'glow', { to: 1.6, sec: 0.05 }], [0.58, 'shake', 0.08],
    [0.72, C({ snd: 'blade', vol: 0.5 })], [0.78, 'anchorL', [LH, 0.15]], [0.8, 'poseL', 'relaxed'], [0.84, 'glow', { to: 1, sec: 0.4 }], [0.86, 'haptic', 'tick']],
});
// ready reminder (雷樁 off cooldown, every 2.5 s): a flick of the head, a crackle through the coils
registerClip('chunting_ready', { duration: 0.7, tracks: { gunRot: [[0, Z3], [0.2, [-2, 0, 1.5], 'out3'], [0.5, [0.6, 0, -0.4]], [1, Z3]] },
  events: [[0.06, C({ coils: true })], [0.2, C({ tip: 1 })]] });
// 34-99 % idle tier (every 7 s): the coils light in a run
registerClip('chunting_glint', { duration: 0.5, tracks: {}, events: [[0, C({ coils: true })]] });
// rare idle: the crescent half-flips and snaps back with a spark
registerClip('chunting_idle_rare', { duration: 0.9, tracks: { fx_blade: [[0, 0], [0.2, 0.55, 'out3'], [0.32, 0.45], [0.42, 0, 'snap'], [1, 0]], gunRot: [[0, Z3], [0.2, [-1.5, 0, 2]], [0.5, Z3]] },
  events: [[0.18, C({ snd: 'blade', vol: 0.4 })], [0.42, C({ tip: 1 })]] });
// 放電 (0.9 s, the loop 0.256-0.633 holds while LMB is down): the head pushes forward 0.23 s, trembles, recoils 0.33 s
registerClip('chunting_zap', {
  duration: 0.9, loop: [0.256, 0.633],
  tracks: {
    gunPos: [[0, Z3], [0.256, [0.0, 0.006, -0.05], 'out3'], [0.35, [0.002, 0.004, -0.046]], [0.45, [-0.002, 0.007, -0.052]], [0.54, [0.0015, 0.005, -0.047]], [0.633, [0.0, 0.006, -0.05]],
      [0.72, [0, -0.004, 0.012], 'out3'], [1, Z3]],
    gunRot: [[0, Z3], [0.256, [2.5, 0, 0], 'out3'], [0.35, [2.9, 0.4, 0.8]], [0.45, [2.2, -0.4, -0.6]], [0.54, [2.8, 0.3, 0.5]], [0.633, [2.5, 0, 0]], [0.72, [-3, 0, 1], 'out3'], [1, Z3]],
  },
  events: [[0.05, C({ tip: 1 })], [0.2, C({ coils: true })], [0.66, 'haptic', 'tick']],
});
// 雷爆 thrust (0.4 s): drawn back a hand's width with a twist, a 25 cm lunge rolling into the stab (full reach at 0.3:
// the burst fires then), a hold, back
registerClip('chunting_thrust', { duration: 0.4, tracks: {
  gunPos: [[0, Z3], [0.15, [0.03, -0.016, 0.06], 'out'], [0.3, [-0.026, 0.02, -0.25], 'out3'], [0.55, [-0.022, 0.016, -0.22]], [1, Z3, 'inOut']],
  gunRot: [[0, Z3], [0.15, [-3, 4, 7], 'out'], [0.3, [4, -4, -11], 'out3'], [0.55, [3, -3, -8]], [1, Z3, 'inOut']] },
  events: [[0.08, C({ coils: true })], [0.28, C({ tip: 2 })], [0.3, 'haptic', 'tick']] });
// 驚蟄 charge (1.2 s, the loop 0.4-0.9 holds while RMB is down): drawn back a hand's width and lifted like a javelin at
// the shoulder, the head angled up into the upper-right quarter so the sections running out, the crescent snapping out
// and the lit coils all stay in view; the left hand opens towards the target (arcs crawl between its fingers and the
// head: chunting.js chargeStep)
const CH_POS = [0.02, 0.0, 0.06], CH_ROT = [-8, -4, 6];
const jit = (p, k) => p.map((v, i) => v + [0.002, -0.002, 0.003][i] * k);
registerClip('chunting_charge', {
  duration: 1.2, loop: [0.4, 0.9],
  tracks: {
    gunPos: [[0, Z3], [0.4, CH_POS, 'out3'], [0.55, jit(CH_POS, 1)], [0.7, jit(CH_POS, -1)], [0.9, CH_POS], [1, Z3, 'inOut']],
    gunRot: [[0, Z3], [0.4, CH_ROT, 'out3'], [0.55, jit(CH_ROT, 120)], [0.7, jit(CH_ROT, -120)], [0.9, CH_ROT], [1, Z3, 'inOut']],
  },
  events: [[0.05, 'anchorL', [{ pos: [-0.07, -0.085, -0.37], F: [0.1, 0.62, -0.78], N: [0.12, 0.2, -0.97], pose: 'palm', palm: [0.02, 0.05] }, 0.22]], [0.3, C({ coils: true })],
    [0.92, 'anchorL', [LH, 0.12]], [0.94, 'poseL', 'cradle']],
});
// throw (0.34 s): the cast forward out of the charge pose; the halberd leaves the hand at RELEASE
registerClip('chunting_throw', { duration: 0.34, tracks: {
  gunPos: [[0, CH_POS], [0.45, [-0.04, 0.03, -0.32], 'in3'], [1, [-0.06, 0.0, -0.55]]],
  gunRot: [[0, CH_ROT], [0.45, [-6, 6, 4], 'in3'], [1, [-14, 6, 10]]] },
  events: [[0.2, 'haptic', 'tick'], [0.35, 'shake', 0.06]] });
// catch (0.45 s): it swings in from the right where it came home and slaps into the palm, the hand gives under the weight
// (a dip, a jolt), arcs crack off the coils and the head
registerClip('chunting_catch', { duration: 0.45, tracks: {
  gunPos: [[0, [0.15, -0.13, 0.08]], [0.22, [-0.006, -0.02, 0.02], 'out3'], [0.36, [0.002, -0.026, 0.01], 'inOut'], [0.6, [0, 0.004, -0.004], 'inOut'], [1, Z3, 'inOut']],
  gunRot: [[0, [-8, -26, 32]], [0.22, [5, 3, -5], 'out3'], [0.36, [6, 1, -3], 'inOut'], [1, Z3, 'inOut']] },
  events: [[0, 'anchorL', ['rest', 0.02]], [0.2, 'shake', 0.09], [0.21, C({ coils: true })], [0.22, C({ tip: 2 })], [0.22, C({ cap: 2 })], [0.24, 'haptic', 'thud']] });
// 換電池 2.0 s: the head dips, the left hand presses the release, the spent cell drops, a fresh one is slapped in, the
// coils hum back up one by one; 雷能 in at 0.7
function reload(rare) {
  const tracks = {
    gunPos: [[0, Z3], [0.12, [-0.06, 0.08, 0.05]], [0.4, [-0.062, 0.083, 0.052]], [0.66, [-0.06, 0.08, 0.05]], [0.7, [-0.061, 0.09, 0.048], 'out3'], [0.76, [-0.06, 0.082, 0.05]], [0.9, [-0.02, 0.02, 0.012]], [1, Z3]],
    gunRot: [[0, Z3], [0.12, [-15, 25, -30]], [0.4, [-14, 26, -32]], [0.66, [-15, 25, -30]], [0.7, [-13, 25, -28], 'out3'], [0.76, [-15, 25, -30]], [0.9, [-4, 6, -8]], [1, Z3]],
    'mag.pos': [[0, Z3], [0.2, Z3], [0.27, [0, -0.06, 0], 'out3'], [0.38, [-0.05, -0.32, 0.06], 'in'], [0.48, [-0.05, -0.32, 0.06]], [0.62, [0, -0.06, 0], 'out3'], [0.7, Z3, 'outBack'], [1, Z3]],
    'mag.rot': [[0, Z3], [0.2, Z3], [0.27, [4, 0, 6]], [0.38, [10, 25, 40]], [0.48, [10, -15, 20]], [0.62, [3, 0, 4]], [0.7, Z3], [1, Z3]],
  };
  const events = [[0, 'glow', { u: 'pCharge', to: 0.2, sec: 0.15 }], [0.06, 'anchorL', ['magwell', 0.16]], [0.08, 'poseL', 'magGrab'], [0.18, C({ snd: 'out', vol: 0.9 })],
    [0.24, 'anchorL', ['mag', 0.06]], [0.38, 'magDrop'], [0.46, 'snd', 'pouch'], [0.66, C({ snd: 'in', vol: 0.95 })], [0.7, 'ammo'], [0.7, 'haptic', 'tick'],
    [0.74, 'anchorL', [LH, 0.16]], [0.76, 'poseL', 'relaxed'], [0.78, C({ coil: 0 })], [0.84, C({ coil: 1 })], [0.9, C({ coil: 2 })], [0.84, C({ snd: 'hum', vol: 0.6 })],
    [0.9, C({ cap: 1.5 })], [0.78, 'glow', { u: 'pCharge', to: 1, sec: 0.35 }]];
  return { duration: 2.0, tracks, events };
}
registerClip('chunting_reload', () => reload(false));
// inspect 4.0 s (hold loops 0.06-0.16): the sections collapse and shoot out again (0-1.2 s) -> the thumb flicks a coil, an
// arc jumps onto the glove, the hand twitches (1.6 s) -> a knuckle taps an insulator: 「叮」 and a ring of light round the
// skirt (2.4 s) -> the crescent swings out for show, freeze. Rare: the arc closes into a little ring between the glove's
// fingers and the fist snuffs it.
function inspect(rare) {
  const tracks = {
    gunPos: [[0, Z3], [0.06, [-0.04, 0.03, 0.04]], [0.11, [-0.042, 0.032, 0.042]], [0.16, [-0.04, 0.03, 0.04]], [0.3, [-0.045, 0.03, 0.045], 'inOut'], [0.55, [-0.045, 0.03, 0.045]],
      [0.68, [0, 0, 0.15], 'inOut'], [0.84, [0.002, 0.003, 0.152]], [0.94, [0, 0.004, 0.004], 'inOut'], [1, Z3]],
    gunRot: [[0, Z3], [0.06, [-8, 14, 22]], [0.11, [-9, 15, 24]], [0.16, [-8, 14, 22]], [0.3, [-10, 12, 26], 'inOut'], [0.55, [-10, 12, 26]],
      [0.68, [-35, 40, 50], 'inOut'], [0.84, [-36, 41, 51]], [0.94, [1, -1, 0], 'inOut'], [1, Z3]],
    // the sections run in and shoot out to full length (喀喀喀), click back to their carry length before the show (the
    // head close: the crescent and the capacitor both in the frame)
    fx_seg1: [[0, REST_EXT[0]], [0.04, REST_EXT[0]], [0.12, 1, 'in3'], [0.2, 1], [0.24, 0, 'out3'], [1, 0]],
    fx_seg2: [[0, REST_EXT[1]], [0.05, REST_EXT[1]], [0.13, 1, 'in3'], [0.2, 1], [0.26, 0, 'out3'], [0.55, 0], [0.6, REST_EXT[1], 'inOut'], [1, REST_EXT[1]]],
    fx_seg3: [[0, REST_EXT[2]], [0.06, REST_EXT[2]], [0.14, 1, 'in3'], [0.2, 1], [0.28, 0, 'out3'], [0.54, 0], [0.59, REST_EXT[2], 'inOut'], [1, REST_EXT[2]]],
    fx_blade: [[0, 0], [0.66, 0], [0.74, 1, 'outBack'], [0.9, 1], [0.95, 0, 'in3'], [1, 0]],
    // 「叮」: light runs once round the tapped insulator's skirts (0.3 s), then goes out
    'fx_ding.vis': [[0, 0], [0.599, 0], [0.6, 1], [0.672, 1], [0.674, 0], [1, 0]],
    'fx_ding.rot': [[0, Z3], [0.6, Z3], [0.674, [0, 0, -420], 'out']],
  };
  const events = [[0, 'anchorL', ['rest', 0.08]], [0.02, C({ snd: 'inspect', vol: 0.7 })], [0.12, C({ seg: 2 })], [0.24, C({ seg: 0 })], [0.26, C({ seg: 1 })], [0.28, C({ seg: 2 })],
    [0.59, C({ seg: 1 })], [0.6, C({ seg: 0 })],
    [0.3, 'anchorL', ['flick', 0.16]], [0.32, 'poseL', 'pinch']];
  if (rare) events.push([0.4, C({ glove: true })], [0.42, 'anchorL', [{ pos: [-0.02, -0.07, -0.34], F: [0.3, 0.75, -0.6], N: [0.9, -0.1, 0.4], pose: 'palm', palm: [0.02, 0.045] }, 0.14]], [0.46, C({ ring: true })],
    [0.6, 'poseL', 'grip'], [0.6, C({ snd: 'glove', vol: 0.3 })]);
  // (the twitch: the hand jerks 5 cm off the coil in 0.05 s, shaking out, then reaches for the insulator)
  else events.push([0.4, C({ glove: true })], [0.405, 'anchorL', [{ pos: [-0.075, -0.13, -0.3], F: [0.2, 0.7, -0.7], N: [0.9, -0.2, 0.4], pose: 'relaxed', palm: [0.02, 0.05] }, 0.05]],
    [0.43, 'anchorL', [{ pos: [-0.05, -0.11, -0.33], F: [0.3, 0.5, -0.8], N: [0.8, 0, 0.6], pose: 'relaxed', palm: [0.02, 0.05] }, 0.08]],
    [0.5, 'anchorL', ['knock', 0.16]], [0.52, 'poseL', 'grip'], [0.6, C({ ding: true })], [0.6, 'haptic', 'tick']);
  events.push([0.66, 'anchorL', [LH, 0.2]], [0.68, 'poseL', 'relaxed'], [0.74, C({ snd: 'blade', vol: 0.7 })], [0.76, C({ tip: 1.5 })], [0.76, C({ coils: true })], [0.95, C({ snd: 'blade', vol: 0.4 })]);
  return { duration: 4.0, loop: [0.06, 0.16], segFree: true, tracks, events };
}
registerClip('chunting_inspect', () => inspect(false));
registerClip('chunting_inspect_rare', () => inspect(true));

// ------------------------------------------------------------------------------------- crosshair (§1.9 #2)
// xh_bolt: three short zig-zag arms (at 12, 4 and 8 o'clock) round an open centre dot; discharging: the arms stretch and
// flicker, small ticks at their tips; the 驚蟄 charge: two arc segments fill round the arms; thrown: the arms pull in to
// a small triangle. Stroke only; the arms take the hit colour; ready = the shared 4 nodes.
registerCrosshair('xh_bolt', {
  state: () => `${XS.zap ? 1 : 0}|${XS.stage}|${XS.charging ? 1 : 0}|${XS.thrown ? 1 : 0}`,
  draw(gap, c, s, c2) {
    const Rr = (XS.thrown ? 6 : 9) + gap * 0.7 + (XS.zap ? 2 : 0), L = XS.thrown ? 5 : XS.zap ? 11.5 : 9.5;
    let o = `<circle cx="0" cy="0" r="1.3" fill="${c}"/>`;
    for (let k = 0; k < 3; k++) {
      const a = (k * 120) * D2R, ux = Math.sin(a), uy = -Math.cos(a), nx = -uy, ny = ux, z = 2;
      const P = (r, t) => `${(ux * r + nx * t).toFixed(2)} ${(uy * r + ny * t).toFixed(2)}`;
      // a lightning stroke: out, a kink across, out again
      o += `<path class="a" d="M${P(Rr, 0)} L${P(Rr + L * 0.45, z)} L${P(Rr + L * 0.55, -z)} L${P(Rr + L, 0)}" fill="none" stroke="${c}" stroke-width="1.8" stroke-linejoin="miter" stroke-linecap="square"/>`;
      if (XS.zap) o += `<path d="M${P(Rr + L + 1.5, -2.2)} L${P(Rr + L + 3, 0)} L${P(Rr + L + 1.5, 2.2)}" fill="none" stroke="${c2}" stroke-width="1" opacity="0.85"/>`;
    }
    if (XS.charging) {
      const r = Rr + L + 5;
      for (let k = 0; k < 2; k++) {
        const on = k < XS.stage, a0 = (k ? 30 : 210) * D2R, a1 = (k ? 150 : 330) * D2R;
        o += `<path d="M${(Math.sin(a0) * r).toFixed(1)} ${(-Math.cos(a0) * r).toFixed(1)} A${r} ${r} 0 0 1 ${(Math.sin(a1) * r).toFixed(1)} ${(-Math.cos(a1) * r).toFixed(1)}" fill="none" stroke="${on ? c2 : c}" stroke-width="${on ? 2 : 1}" opacity="${on ? 1 : 0.35}"/>`;
      }
    }
    return o;
  },
  nodes: 26,
});
injectCSS('cf-xh-bolt', `.xh2.act path.a { filter: drop-shadow(0 0 2px currentColor); }`);

// ------------------------------------------------------------------------------------- damage numbers (§1.9 #6)
// exotic: the element gradient — white top -> violet-white -> deep violet, gunmetal edge
SKINS.chunting = ['#ffffff', '#e2d9ff', '#8a5cff', '#1c1a26'];
// big hits (the giant bolt's 1,600 / 400, rolled discharge sums >= 120): the crit tier's size and burst star, but violet-
// white over deep violet instead of the generic gold (the weapon's colour on its biggest numbers)
SKINS.chunting_crit = ['#ffffff', '#cdb8ff', '#7a3dff', '#14082e'];

// dev QA handle (like window.__gfx): replay a teammate's skill event locally (visuals only, no damage); the rest
// extension, clip registration and crosshair state for pose / clip sweeps
if (typeof window !== 'undefined') (window.__cfDev ||= {}).chunting = { replay: (g, ev) => startSkill(g, ev, { local: false }), sounds: CHUNTING_SOUNDS, rest: REST_EXT, clip: registerClip, xs: XS };
