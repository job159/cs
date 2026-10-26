// The local player's weapons: inventory slots, switching, firing modes, spread, recoil, reloads and all
// first-person feedback (viewmodel kick, muzzle flash, casings, tracers, sounds, haptics).
import * as THREE from 'three';
import { WEAPONS, slotOf } from './defs.js';
import { fireBullet, splash } from './ballistics.js';
import { drawClip, holsterClip, inspectClip, dualInspectClip, reloadClipFor, shellStart, shellInsert, shellEnd, pumpCycle, boltCycle, knifeSlash, knifeStab, clipFor } from '../player/clips.js';
import { gauss, clamp, DEG } from '../engine/util.js';
import { hardSurface } from '../gfx/materials.js';
import { TRACER_EVERY, FRAME, RAMP } from '../fx/fx.js';
import { SPECIALS, specialOf, tickSpecial, disposeSpecial, chargeState } from './specials.js';

const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _o = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _ta = new THREE.Vector3(), _tb = new THREE.Vector3();
const _col = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

const DRAW_TIME = { pistol: 0.45, smg: 0.6, rifle: 0.75, shotgun: 0.75, mg: 1.1, sniper: 0.9, heavy: 1.2, melee: 0.4, grenade: 0.4 };
// §1.7.2 ready overlay layer used when a premium def has `ready` but no `ready.layer`
const READY_LAYER = { breathMul: 1.4, jitterHz: 0.5, jitterDeg: 0.6, glowMul: 1.5 };

export function haptic(ms) {
  if (haptic.enabled === false) return; // settings: 震動回饋 off
  try { window.NativeBridge?.vibrate?.(ms); } catch { /* not on Android */ }
  if (!window.NativeBridge && navigator.vibrate && matchMedia('(pointer: coarse)').matches) navigator.vibrate(ms);
}

// ------------------------------------------------------------------ premium clip events (spec §4.2 row 0.4, 05d §7.1)
// Clips fire these through Arsenal._clipEvent; visual ones are routed to the FX / HUD side through the small
// adapters below, so those tracks implement the looks and clips never change. Arguments:
//   fx       { id, at: 'socket' (default) | 'aim' | 'self', socket = 'muzzle', to: socket | 'aim' (BOLT / BEAM end),
//            range, ground, color ('#hex' x k, or HDR [r,g,b]), k (HDR scale, 3), vm, seed, ...component options }
//            -> the premium kit (fx/kit.js, table KIT_FX): RING / SIGIL / PILLAR -> fx.sigils, MOTE (kind, n) /
//            TRAIL_DROP (kind) -> fx.motes, GHOST / SHADOW / SWARM -> fx.summons, WING (open | close) -> fx.wings.vm;
//            else fx.component(id, opts); else a stand-in built from the base toolkit (RING SPRAY MOTE FLIP BOLT
//            BEAM PILLAR SIGIL); else a one-time warning. opts carry pos (world, as it appears), dir, vm, camPos
//            (camera space for viewmodel-layer effects) and seed.
//   trail    { on: true | false, id = 'blade', from = 'base', to = 'tip' | null (single-socket streak), color,
//            color1, width, life, profile, k, hitColor (melee: the trail turns this colour on a hit, §1.17), keep }
//            viewmodel ribbon pushed from the posed sockets every frame; ends with the clip unless `keep`
//   hitstop  ms                                   -> game.hitStop
//   shake    trauma 0..1                          -> game.addShake
//   fov      [deltaDeg, sec] punch | { to: deg, sec } held offset (charge stages)   -> game.fovKick if the game
//            has one, else this arsenal's own (camera.zoom, the viewmodel keeps its FOV)
//   tint     { rgb | color, a (<= 0.35), in, hold, out }        -> fx.overlay.tint (else an additive screen kick)
//   overlay  { id: 'RADIAL' | 'TUNNEL' | 'RIFT' | 'CLOUDSEA' | 'CURTAIN' | 'BORDER' | 'ink' | status..., dur, key,
//            off } -> fx.overlay.add(kind, opts); { key, off: true } stops a running one
//   haptic   'tick' | 'thud' | 'ready_double' | ms   (§1.13, 70 ms apart at least)
//   glow     { to, sec, u: 'emissive' | 'pCharge' | 'pRimStr' | 'pFlash', mat }   -> vm.glowTo
//   vmHide   true | false | 'all' | { on, mode: 'gun' | 'all', sec }   (clip-scoped unless sec is given)
//   summon   { id = 'GHOST', at = 'aim', range, ground, seed, ... }  -> fx.summons (ghost / shadow / swarm, as fx)
//   hud      { id, ... }                          -> game.hud.clipEvent(id, arg) (fallback: toast of arg.text)
// Unknown events go to the special: onClipEvent(ws, name, arg, game) (parry windows, custom hits...).
/** Comfort switches (§1.14 #6) for the clip-driven screen effects; settings may flip them. */
export const clipComfort = { shake: true, fov: true, overlay: true, hitstop: true, aberration: true };
// premium kit components: id -> [fx module, method, call(module, P, opts, arsenal)]; P = Arsenal._fxPlace()
const KIT_FX = {
  RING: ['sigils', 'ring', (m, P, o) => m.ring(P.pos, o)],
  SIGIL: ['sigils', 'sigil', (m, P, o) => m.sigil(P.pos, o)],
  PILLAR: ['sigils', 'pillar', (m, P, o) => m.pillar(P.pos, o)],
  // motes burst upward unless the clip asks for the barrel direction (forward: true) or gives a cone axis (cone: Vector3)
  MOTE: ['motes', 'burst', (m, P, o) => m.burst(o.kind || 'petal', P.pos, o.n ?? o.count ?? 8, { ...o, dir: o.cone || (o.forward ? P.dir : null) })],
  TRAIL_DROP: ['motes', 'trailDrop', (m, P, o, a) => m.trailDrop(P.pos, a._toPoint(o), o.kind || 'feather', o)],
  GHOST: ['summons', 'ghost', (m, P, o) => m.ghost({ ...o, pos: P.pos })],
  SHADOW: ['summons', 'shadow', (m, P, o) => m.shadow(P.pos, o)],
  SWARM: ['summons', 'swarm', (m, P, o) => m.swarm({ ...o, center: P.pos })],
  WING: ['wings', 'vm', (m, P, o, a) => a._wingEvent(m, o)],
};
const HAPTIC = { tick: [12], thud: [40], ready_double: [25, 80, 25], double: [25, 80, 25] };
const camel = (id) => id.toLowerCase().replace(/_(\w)/g, (m, c) => c.toUpperCase());
const _warned = new Set();
function warnOnce(key, msg) { if (!_warned.has(key)) { _warned.add(key); console.warn('[clip] ' + msg); } }
/** HDR linear colour: '#hex' (or 0xhex) × k, an [r, g, b] array as is, else `def`. */
function hdrOf(c, k = 1, def = [k, k, k]) {
  if (Array.isArray(c)) return c.slice(0, 3);
  if (typeof c === 'string' || typeof c === 'number') { _col.set(c); return [_col.r * k, _col.g * k, _col.b * k]; }
  return def;
}
const R = Math.random;

/**
 * Stand-ins for kit components, built from the base toolkit so every clip event shows something before (or
 * without) the premium kit. P = placement from Arsenal._fxPlace: { pos (world), dir, cam (camera space), cdir, vm }.
 */
const FX_FALLBACK = {
  RING(g, P, o, col) {
    const flat = !P.vm && (o.ground || o.at === 'self');
    g.fx.shockwave(P.vm ? P.cam : P.pos, { normal: flat ? UP : null, r0: o.r0 ?? (P.vm ? 0.01 : 0.2), r1: o.r1 ?? (P.vm ? 0.1 : 3), life: o.life ?? 0.4, color: col, thin: o.thin ?? true, vm: P.vm });
  },
  SPRAY(g, P, o, col) {
    const p = P.vm ? P.cam : P.pos, d = P.vm ? P.cdir : P.dir, n = Math.min(64, o.n ?? 12), sp = o.speed ?? (P.vm ? 1 : 6), s = P.vm ? 0.004 : 0.015;
    for (let i = 0; i < n; i++) {
      _ta.set(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(o.cone ?? 1.2).add(d).normalize().multiplyScalar(sp * (0.5 + R()));
      g.fx.particles.spawn({ additive: true, vm: P.vm, x: p.x, y: p.y, z: p.z, vx: _ta.x, vy: _ta.y, vz: _ta.z, life: 0.2 + R() * 0.3, size: s, stretch: P.vm ? 0.02 : 0.03,
        color: [...col, 1], color1: [col[0] * 0.3, col[1] * 0.3, col[2] * 0.3, 0], frame: FRAME.spark, gravity: P.vm ? 0.8 : 5, drag: 2 });
    }
  },
  MOTE(g, P, o, col) {
    const p = P.vm ? P.cam : P.pos, n = Math.min(48, o.n ?? 10), s = P.vm ? 0.006 : 0.05, sp = P.vm ? 0.12 : 1.2;
    for (let i = 0; i < n; i++) {
      g.fx.particles.spawn({ additive: true, vm: P.vm, x: p.x, y: p.y, z: p.z, vx: (R() - 0.5) * sp, vy: R() * sp * 0.8, vz: (R() - 0.5) * sp, life: 0.8 + R() * 0.8,
        size: s * (0.6 + R() * 0.8), color: [...col, 1], color1: [col[0] * 0.5, col[1] * 0.5, col[2] * 0.5, 0], frame: FRAME.glow, gravity: P.vm ? 0.15 : 1.2, drag: 3, spin: (R() - 0.5) * 6 });
    }
  },
  FLIP(g, P, o, col) {
    const p = P.vm ? P.cam : P.pos, s = o.size ?? (P.vm ? 0.05 : 0.4);
    g.fx.particles.spawn({ additive: true, vm: P.vm, x: p.x, y: p.y, z: p.z, life: o.life ?? 0.14, size: s, size1: s * 1.4, color: [...col, 1], color1: [0, 0, 0, 0], frame: FRAME.glint, rot: R() * 6.28 });
  },
  BOLT(g, P, o, col, a) { g.fx.bolt(P.pos, a._toPoint(o), { col, glow: col.map((c) => c * 0.35), width: o.width ?? 0.12, life: o.life ?? 0.3, levels: o.levels ?? 4 }); },
  BEAM(g, P, o, col, a) { g.fx.beam(P.pos, a._toPoint(o), { core: col, glow: col.map((c) => c * 0.3), wCore: o.wCore ?? 0.03, wGlow: o.wGlow ?? 0.18, life: o.life ?? 0.4 }); },
  PILLAR(g, P, o, col) { g.fx.beam(P.pos, _tb.copy(P.pos).addScaledVector(UP, o.h ?? 8), { core: col, glow: col.map((c) => c * 0.3), wCore: (o.radius ?? 0.6) * 0.3, wGlow: (o.radius ?? 0.6) * 2, life: o.life ?? 0.7, shrink: 0.2 }); },
  SIGIL(g, P, o, col) { g.fx.shockwave(P.pos, { normal: UP, r0: (o.radius ?? 3) * 0.95, r1: o.radius ?? 3, life: o.life ?? 1.5, color: col, thin: true }); },
};
// viewmodel-only events (handled in Viewmodel.play) that also pass through _clipEvent
const VM_EVENTS = new Set(['anchorL', 'anchorR', 'poseL', 'poseR']);

/**
 * Rare reload timing (§1.7.1): at most 0.2 s longer than the normal reload (`rare.extra`, default 0.2) and its
 * 'ammo' event moved so the rounds land at the same moment as in the normal clip. Returns { clip, total }.
 */
function retimeRare(rare, base, t) {
  const total = t + Math.min(0.2, Math.max(0, rare.extra ?? 0.2));
  const at = base.events?.find((e) => e[1] === 'ammo')?.[0];
  const events = (rare.events || []).filter((e) => e[1] !== 'ammo');
  if (at != null) events.push([at * t / total, 'ammo']);
  return { clip: { ...rare, events, _sorted: false }, total };
}

// summons without a summons module: a column of light, a ground ring and a burst where it lands
function summonStandIn(g, P, o, col) {
  FX_FALLBACK.PILLAR(g, P, { h: 10, radius: 0.9, life: 0.9 }, col);
  FX_FALLBACK.RING(g, P, { at: 'self', r1: 4, life: 0.5 }, col);
  g.fx.sparkBurst?.(_ta.copy(P.pos).addScaledVector(UP, 0.8), { color: col, color1: col.map((c) => c * 0.3), count: 24, speed: 8, glow: 1 });
}

// 技能充能 (match money upgrade): meter gain from our own hits / shots, scaled after the special added it. v2 meters
// live in ws.sp.m (cap: special.meters[k].max), the v1 series in ws.sp.charge / heat / blades.
const V1_METERS = { charge: (p) => p.hits ?? 60, heat: () => 1, blades: (p) => p.max ?? 12 };
function meterSnap(ws) {
  const s = ws.sp;
  if (!s) return null;
  if (s.v2) return { ...s.m };
  const o = {};
  for (const k in V1_METERS) if (typeof s[k] === 'number') o[k] = s[k];
  return o;
}
function meterBoost(ws, before, mul) {
  const s = ws.sp, p = ws.def.special || {}, tab = s?.v2 ? s.m : s;
  if (!tab) return;
  for (const k in before) {
    const d = tab[k] - before[k];
    if (!(d > 0)) continue;   // only gains (spending, drains and resets stay as they are)
    tab[k] = Math.min(s.v2 ? p.meters?.[k]?.max ?? 100 : V1_METERS[k](p), tab[k] + d * (mul - 1));
  }
}

class WeaponState {
  constructor(def) {
    this.def = def;
    this.ammo = def.mag;
    this.reserve = def.reserve;
    this.bloom = 0;
    this.shots = 0;          // shots in the current spray (recoil pattern index)
    this.burstMode = false;
    this.needsCycle = false; // pump / bolt
    this.spin = 0;           // minigun barrel spin 0..1
    this.slideLocked = false;
  }
}

export class Arsenal {
  constructor(game) {
    this.game = game;
    this.vm = game.vm;
    this.owned = {};          // slot -> WeaponState
    this.slot = 1;
    this.current = null;
    this.state = 'none';      // none | draw | idle | reload | cycle | holster | melee
    this.timer = 0;
    this.fireCd = 0;
    this.burstLeft = 0;
    this.recoilPitch = 0;     // degrees, applied to the camera
    this.recoilYaw = 0;
    this.sinceShot = 10;
    this.dmgMul = 1;
    this.reloadMul = 1;
    // match money upgrades / level traits (match.js _applyStats): headshot multiplier, reserve size, premium meter
    // gain, knockback, spread
    this.headMul = 1; this.reserveMul = 1; this.chargeMul = 1; this.knockMul = 1; this.spreadMul = 1;
    this.pendingSlot = null;
    this.reloadToken = 0;
    this.lastClick = 0;
    this.knifeDir = 1;
    this.spinSound = null;
    // premium clip layer (spec §4.2 rows 0.3 / 0.4)
    this.firstDrawn = new Set();   // weapon ids whose first draw played this match (Arsenal lives one match)
    this.firstDrawing = false;
    this.trails = new Map();       // clip `trail` ribbons by id
    this.overlays = new Map();     // clip overlays by key (stoppable)
    this._fovKicks = []; this._fovHold = null; this._fovDeg = 0;
    this._hapticAt = -1e9;
    this._inspecting = null;
    this._idleT = 0;
    this.vm.afterUpdate = (dt) => this._trailTick(dt);   // trails follow the posed sockets
  }

  /** Stat modifiers from the current weapon's signature mechanic. */
  _mods(ws) { return specialOf(ws)?.modifiers?.(ws) || {}; }

  /** A weapon's full reserve with the 彈藥容量 upgrade (unlimited / none / unset stay as the def has them). */
  maxReserve(ws) { const r = ws.def.reserve; return Number.isFinite(r) && r > 0 ? Math.round(r * this.reserveMul) : r; }

  /** special.onHit / onFire with the 技能充能 upgrade: what the call added to the weapon's meters is scaled by chargeMul. */
  _special(ws, hook, ...args) {
    const sp = specialOf(ws), f = sp?.[hook];
    if (!f) return;
    const before = this.chargeMul !== 1 ? meterSnap(ws) : null;
    f.call(sp, ws, ...args);
    if (before) meterBoost(ws, before, this.chargeMul);
  }

  /** Weapon jam (boss shockwaves): no firing for `t` seconds. */
  jam(t) {
    this.jamT = Math.max(this.jamT || 0, t);
    this.game.hud?.toast('武器卡彈！', 1000);
    this.game.audio?.play('dryfire');
    this.vm.kick({ back: 0.05, up: 10, side: 4, roll: 12 });
  }

  give(id, { select = true } = {}) {
    const def = WEAPONS[id];
    if (!def) return null;
    const ws = new WeaponState(def);
    ws.reserve = this.maxReserve(ws);
    ws.game = this.game;
    specialOf(ws)?.init(ws);
    const slot = slotOf(def);
    // the weapon this replaces leaves the inventory: its special releases discs, skills, world objects (once)
    const old = this.owned[slot];
    if (old && old !== ws) disposeSpecial(old, this.game);
    this.owned[slot] = ws;
    if (select) this.select(slot, true);
    return ws;
  }

  /**
   * Plays a clip (id registered in clips.js, a factory or a clip object) on the viewmodel with its events routed
   * through _clipEvent (specials, skills, tests). opts: duration (s; else clip.duration), lock (the weapon cannot
   * fire / reload until it ends), anything else goes to the clip factory. Returns the clip, or null.
   */
  playClip(id, { duration, lock = false, ...opts } = {}) {
    const clip = clipFor(id, this.vm, { def: this.current?.def, ...opts });
    if (!clip) { warnOnce('clip:' + id, `unknown clip '${id}'`); return null; }
    const dur = duration ?? clip.duration ?? 1;
    if (lock && (this.state === 'idle' || this.state === 'action')) { this.state = 'action'; this.timer = dur; }
    this._inspecting = null;
    this.vm.play(clip, { duration: dur, onEvent: (n, a) => this._clipEvent(n, a) });
    return clip;
  }

  /** FOV punch (deg, s) on the world camera; the viewmodel keeps its own FOV. Shared with other systems. */
  fovKick(deg, sec = 0.3) { if (clipComfort.fov) this._fovKicks.push({ deg, dur: Math.max(0.05, sec), t: 0 }); }
  /** Held FOV offset (charge stages: −1° a stage), eased over sec; fovHold(0) releases it. */
  fovHold(deg, sec = 0.2) { this._fovHold = { from: this._fovHold ? this._holdNow() : 0, to: clipComfort.fov ? deg : 0, t: 0, dur: Math.max(1e-3, sec) }; }
  _holdNow() { const h = this._fovHold; return h ? h.from + (h.to - h.from) * Math.min(1, h.t / h.dur) : 0; }

  get def() { return this.current?.def; }

  async select(slot, instant = false) {
    const ws = this.owned[slot];
    if (!ws || (ws === this.current && this.state !== 'holster')) return;
    this.reloadToken++;
    this.pendingSlot = slot;
    if (this.current && !instant) {
      this.state = 'holster';
      this.vm.stopClip();
      this.vm.play(holsterClip(), { duration: 0.18 });
      this.timer = 0.18;
      this._spinStop();
      return;
    }
    await this._equip(slot);
  }

  async _equip(slot) {
    const ws = this.owned[slot];
    this.pendingSlot = null;
    this.slot = slot;
    this.current = ws;
    this.state = 'loading';
    this.vm.aimTarget = 0;
    await this.vm.setWeapon(ws.def.model || ws.def.id, ws.def);
    if (this.current !== ws) return;
    this._clipReset();
    if ((ws.def.tier ?? ws.def.premium?.tier) === 'mythic') this.vm.weapon?.premium?.draw?.();   // §1.17 draw colour shift
    // premium first draw (§1.7.1 beat 1): once per match per weapon, fire cancels it (update)
    const fd = ws.def.premium?.firstDraw;
    const first = fd && !this.firstDrawn.has(ws.def.id) ? clipFor(fd, this.vm, { def: ws.def }) : null;
    if (first) this.firstDrawn.add(ws.def.id);
    this.firstDrawing = !!first;
    const t = first ? first.duration ?? 1.5 : (ws.def.draw ?? DRAW_TIME[ws.def.cat] ?? 0.7);
    this.state = 'draw';
    this.timer = t;
    // premium.drawClip: the weapon's own normal draw (a greatsword does not come up like a rifle)
    const own = !first && ws.def.premium?.drawClip ? clipFor(ws.def.premium.drawClip, this.vm, { def: ws.def }) : null;
    this.vm.play(first || own || drawClip(ws.def.cat === 'mg' || ws.def.cat === 'heavy'), { duration: t, onEvent: (n, a) => this._clipEvent(n, a) });
    if (ws.slideLocked) this.vm.partState.slide = { v: 1 };
    this.game.hud?.weaponChanged?.(ws);
  }

  // ------------------------------------------------------------------ frame

  update(dt, s) {
    const ws = this.current;
    this.sinceShot += dt;
    this.fireCd = Math.max(0, this.fireCd - dt);
    this._fxTick(dt);
    // every owned weapon's special runs each frame (holstered timers, thrown discs); update() only for the held one
    for (const o of Object.values(this.owned)) tickSpecial(o, dt, this.game, o === ws && this.state !== 'holster' && this.state !== 'loading');
    // recoil recovery once the spray pauses
    if (ws) {
      const r = ws.def.recoil || {};
      // recoil.pause: the gap (x shot interval) after which recovery starts; < 1 lets slow auto guns settle between shots
      const pause = this.sinceShot > Math.max(0.12, 60 / (ws.def.rpm || 600) * (r.pause ?? 1.6));
      if (pause) {
        const rec = (r.recover ?? 12) * dt;
        this.recoilPitch = Math.max(0, this.recoilPitch - rec * (1 + this.recoilPitch * 0.08));
        this.recoilYaw *= Math.max(0, 1 - 6 * dt);
        if (this.sinceShot > 0.35) ws.shots = 0; // spray pattern restarts after a pause (integer index)
      }
      ws.bloom = Math.max(0, ws.bloom - (ws.def.spread?.[6] ?? 8) * dt);
    }
    // slot switching
    for (let k = 1; k <= 5; k++) if (s.pressed['slot' + k] && this.owned[k]) this.select(k);
    if (s.pressed.next || s.pressed.prev) this._cycleSlot(s.pressed.next ? 1 : -1);
    if (this.state === 'holster') {
      this.timer -= dt;
      if (this.timer <= 0 && this.pendingSlot) this._equip(this.pendingSlot);
      return;
    }
    if (!ws || this.state === 'loading') return;
    const def = ws.def;

    const sp = specialOf(ws);
    this._premiumState(ws, dt);
    if (this.state === 'reload' && s.pressed.reload && sp?.onReloadInput) sp.onReloadInput(ws, this.game);
    // the premium first draw is a show, not a lockout: firing or a skill key cuts it (§1.7.1 beat 1); the press is then
    // handled below this frame
    if (this.state === 'draw' && this.firstDrawing && (s.pressed.fire || s.held.fire || s.pressed.special || s.pressed.alt)) { this.firstDrawing = false; this.vm.stopClip(); this.vm.glowTo(1, 0.15); this.timer = 0; }
    if (this.state === 'draw' || this.state === 'reload' || this.state === 'cycle' || this.state === 'melee' || this.state === 'action') {
      this.timer -= dt;
      if (this.state === 'reload' && def.reloadStyle === 'shell' || this.state === 'reload' && this.shellReload) {
        // tube reloads can be interrupted by firing once at least one shell is in
        if (s.pressed.fire && ws.ammo > 0 && !this.shellEnding) { this._endShellReload(ws, true); }
      }
      if (this.timer <= 0) this._finishState(ws);
      else { this._updateSpin(dt, s, ws); return; }
    }

    // ADS (sniper scopes + rifles). Desktop: hold; touch UI translates its toggle into held state.
    const altTaken = sp?.onAlt && (s.pressed.alt ? sp.onAlt(ws, this.game, true) : s.held.alt);
    this.vm.aimTarget = !altTaken && s.held.alt && def.cat !== 'melee' ? 1 : 0;
    if (s.pressed.special && sp?.onSpecial) sp.onSpecial(ws, this.game);
    if (s.pressed.reload) this.reload();
    if (s.pressed.inspect && this.state === 'idle') this._inspect(ws);
    if (this._inspecting) {
      // hold inspect = loop the fidget segment; firing, aiming or another clip ends it (CS2)
      const c = this.vm.clip;
      if (c.clip !== this._inspecting || !c.active) this._inspecting = null;
      else if (s.pressed.fire || s.held.fire || s.held.alt) { this.vm.stopClip(); this._inspecting = null; this.vm.glowTo(1, 0.2); }
      else c.hold = !!s.held.inspect;
    }
    if (!this._inspecting && this.vm.weapon?.premium?.inspect) this.vm.weapon.premium.setInspect(false);

    if (def.mode === 'melee') { this._melee(s, ws); return; }
    this._updateSpin(dt, s, ws);
    // a premium ranged weapon that runs its own trigger (bow draw / release): special.trigger() -> true
    if (sp?.trigger?.(ws, s, this.game)) return;

    // trigger logic
    if (s.pressed.special && def.alt === 'burst') { ws.burstMode = !ws.burstMode; this.game.audio?.play('ui_click'); this.game.hud?.toast?.(ws.burstMode ? '三連發' : '半自動'); }
    const wantsFire = def.mode === 'auto' ? s.held.fire : s.pressed.fire || (this.fireBuffer > 0);
    this.fireBuffer = Math.max(0, (this.fireBuffer || 0) - dt);
    if (s.pressed.fire && this.fireCd > 0) this.fireBuffer = 0.12; // buffer taps slightly early
    if (this.burstLeft > 0) {
      if (this.fireCd <= 0) { this._fire(ws); this.burstLeft--; this.fireCd = 60 / (def.burstRpm || 1000); if (this.burstLeft === 0) this.fireCd = 60 / def.rpm; }
      return;
    }
    if (this.jamT > 0) { this.jamT -= dt; return; }
    if (wantsFire && this.fireCd <= 0) {
      if (ws.needsCycle) return;
      if (ws.ammo <= 0) {
        if (s.pressed.fire || this.fireBuffer > 0) { this.game.audio?.play('dryfire'); this.fireBuffer = 0; }
        if (ws.reserve > 0) this.reload();
        return;
      }
      if (def.spinUp && ws.spin < 1) return;
      this.fireBuffer = 0;
      if (ws.burstMode && def.burst) { this.burstLeft = def.burst - 1; this._fire(ws); this.fireCd = 60 / (def.burstRpm || 1000); return; }
      this._fire(ws);
      this.fireCd = 60 / (def.rpm * (this._mods(ws).rpmMul || 1));
      if (def.mode === 'pump' || def.mode === 'bolt') ws.needsCycle = true;
    }
    if (ws.needsCycle && this.fireCd <= 60 / def.rpm - 0.12 && ws.ammo > 0 && this.state === 'idle') this._cycle(ws);
  }

  _cycleSlot(d) {
    const slots = Object.keys(this.owned).map(Number).sort();
    if (!slots.length) return;
    const i = slots.indexOf(this.slot);
    this.select(slots[(i + d + slots.length) % slots.length]);
  }

  _finishState(ws) {
    const prev = this.state;
    this.state = 'idle';
    this.firstDrawing = false;
    if (prev === 'reload' && this.shellReload) { this._shellStep(ws); return; }
    if (prev === 'cycle') ws.needsCycle = false;
  }

  _updateSpin(dt, s, ws) {
    const def = ws.def;
    if (!def.spinUp) return;
    const want = (s.held.fire || s.held.alt) && this.state === 'idle' && ws.ammo > 0;
    ws.spin = clamp(ws.spin + (want ? dt / def.spinUp : -dt / (def.spinUp * 1.6)), 0, 1);
    const ps = this.vm.partState.barrels || (this.vm.partState.barrels = { v: 0, spin: 0 });
    ps.spin = (ps.spin || 0) + ws.spin * dt * 60;
    if (ws.spin > 0.02 && !this.spinSound) this.spinSound = this.game.audio?.play('minigun_spin', { loop: true, volume: 0.6 });
    if (this.spinSound) { this.spinSound.setRate?.(0.6 + ws.spin * 0.5); this.spinSound.setVolume?.(0.3 + ws.spin * 0.5); if (ws.spin <= 0.02) this._spinStop(); }
  }
  _spinStop() { if (this.spinSound) { this.spinSound.stop(0.3); this.spinSound = null; this.game.audio?.play('minigun_spindown'); } }

  // ------------------------------------------------------------------ firing

  /** Current spread cone (degrees) for the HUD crosshair and shots. */
  spreadDeg() {
    const ws = this.current;
    if (!ws) return 0;
    const sp = ws.def.spread || [1, 0.2, 1, 4, 0.3, 4, 8];
    const p = this.game.player;
    const aim = this.vm.aim;
    let a = sp[0] + (sp[1] - sp[0]) * aim;
    const speedFrac = Math.min(1, p.horizontalSpeed / 5);
    a += sp[2] * speedFrac * (1 - aim * 0.6);
    if (!p.onGround) a += sp[3];
    if (p.crouching) a *= 0.75;
    a += ws.bloom * (1 - aim * 0.4);
    return a * this.spreadMul;
  }

  _fire(ws) {
    const def = ws.def;
    const g = this.game;
    const cam = g.camera;
    const mods = this._mods(ws);
    if (!mods.infinite) ws.ammo--;
    this.sinceShot = 0;
    ws.shots++;
    const spread = this.spreadDeg() * DEG;
    ws.bloom = Math.min(def.spread?.[5] ?? 5, ws.bloom + (def.spread?.[4] ?? 0.3));
    cam.getWorldDirection(_dir);
    _right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    _up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const origin = _o.copy(cam.position);
    const pellets = (def.pellets || 1) * (mods.split || 1);
    // (爆頭傷害 upgrade and 重擊 trait ride on the def's head / knock: ballistics keeps bosses' heads fixed)
    const fdef = mods.pierce || mods.dmgMul || this.headMul !== 1 || this.knockMul !== 1
      ? { ...def, pen: (def.pen ?? 1) + (mods.pierce || 0), head: (def.head ?? 4) * this.headMul, knock: (def.knock ?? 1) * this.knockMul } : def;
    let anyHit = false, kills = 0, head = false;
    const muzzleApparent = this.vm.socketApparent('muzzle', _p);
    // def.pelletRings [[k, n], ...]: a fixed centre-weighted pattern instead of the random disc: one pellet on the aim,
    // then n on a ring at k x the cone for each ring (alternate rings staggered), turned a random step each shot, a little
    // jitter; pellets past the rings join the centre (premium pump guns: the volley lands on one body)
    const rings = pellets > 1 ? def.pelletRings : null, ringRot = Math.random() * Math.PI * 2;
    for (let i = 0; i < pellets; i++) {
      // pellets: uniform-ish disc; single bullets: centre-weighted
      let r, a = Math.random() * Math.PI * 2;
      let ri = 0, j = i - 1;
      if (rings) while (ri < rings.length && j >= rings[ri][1]) j -= rings[ri++][1];
      if (rings && (i === 0 || ri >= rings.length)) r = Math.random() * 0.12 * spread;
      else if (rings) { const [k, n] = rings[ri]; r = k * (0.88 + Math.random() * 0.24) * spread; a = ringRot + (ri % 2) * (Math.PI / n) + (j / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.3; }
      else r = pellets > 1 ? Math.sqrt(Math.random()) * spread : Math.abs(gauss()) * spread;
      const d = new THREE.Vector3().copy(_dir).addScaledVector(_right, Math.cos(a) * Math.tan(r)).addScaledVector(_up, Math.sin(a) * Math.tan(r)).normalize();
      if (def.projectile) { this._launch(ws, origin, d); continue; }
      const res = fireBullet(g, origin, d, fdef, {
        shooter: g.localId, dmgMul: this.dmgMul * (mods.dmgMul || 1),
        onHit: (info, r2, target) => { g.hud?.onHit?.(info, r2, target); this._special(ws, 'onHit', info, r2, target); },
      });
      if (res.hits) anyHit = true;
      kills += res.kills;
      if (res.headshot) head = true;
      this._lastEnd = res.end;
      // CS2 tracer cadence (weapons.vdata): pistols / snipers / shotguns / MGs every shot, rifles / SMGs every
      // 3rd shot of a spray with the first one always traced, suppressed none; shotguns trace 3 pellets.
      // Special modes (mods.tracer = HDR colour) trace every shot with a glowing coloured tracer.
      if (muzzleApparent) {
        // def.fx (premium look, docs/FX.md): { tracer: glowTracer opts, tracerEvery, ramp, flashScale }
        const every = mods.tracer ? 1 : def.suppressed ? 0 : def.fx?.tracerEvery ?? TRACER_EVERY[def.cat] ?? (def.tracer ? 1 : 0);
        if (every > 0 && (ws.shots - 1) % every === 0 && (pellets === 1 || i < 3)) {
          // a list of colours: the split rounds cycle through it (雙相 cyan / amber)
          const tc = mods.tracer && (Array.isArray(mods.tracer[0]) ? mods.tracer[i % mods.tracer.length] : mods.tracer);
          if (tc) g.fx?.glowTracer(muzzleApparent, res.end, { color: tc, glow: tc.map((c) => c * 0.4) });
          else if (def.fx?.tracer) g.fx?.glowTracer(muzzleApparent, res.end, def.fx.tracer);
          else g.fx?.tracer(muzzleApparent, res.end, { cls: def.cat });
        }
      }
    }
    this._special(ws, 'onFire', { game: g, origin, dir: _dir, end: this._lastEnd });
    // ---- feedback
    const rc = def.recoil || {};
    const first = ws.shots <= 1 ? (rc.first ?? 1) : 1;
    const pat = rc.pattern ? (rc.pattern[(ws.shots - 1) % rc.pattern.length] ?? 0) : (Math.random() - 0.5) * 2;
    const upK = (rc.up ?? 1) * first * (1 - this.vm.aim * 0.25) * (0.85 + Math.random() * 0.3);
    this.recoilPitch = Math.min(rc.upMax ?? 10, this.recoilPitch + upK);
    this.recoilYaw += (rc.side ?? 0.5) * (pat * 0.8 + (Math.random() - 0.5) * 0.6);
    g.punch.impulse(-upK * DEG * 6, (Math.random() - 0.5) * (rc.side ?? 0.5) * DEG * 5, (Math.random() - 0.5) * DEG * 3 * upK);
    this.vm.kick(def.kick || {});
    if (def.premium?.fireFlash) this.vm.weapon?.premium?.fire(def.premium.fireFlash);   // §1.5.5 pFlash on fire (some weapons)
    if (this.vm.weapon?.parts.slide) { this.vm.cycle('slide', 0.065); if (ws.ammo === 0) { ws.slideLocked = true; setTimeout(() => { if (ws.slideLocked) this.vm.partState.slide = { v: 1 }; }, 80); } }
    else if (this.vm.weapon?.parts.bolt && def.mode === 'auto' && (this.vm.weapon.meta.chargeSide === 'right' || this.vm.weapon.meta.chargeSide === 'left')) this.vm.cycle('bolt', 60 / def.rpm * 0.8);
    if (this.vm.weapon?.parts.trigger) this.vm.cycle('trigger', 0.09);
    if (this.vm.weapon?.parts.hammer) this.vm.cycle('hammer', 0.12);
    const mz = this.vm.socketWorld('muzzle', _p);
    if (mz && def.flash) {
      const dirW = this.vm.socketDir('muzzle', new THREE.Vector3());
      // mz is the TRUE position of the first-person muzzle: the flash is drawn in viewmodel space and its light
      // sits at the real gun so the handguard / sights / glove flash orange (CS2). Special modes recolour it.
      g.fx?.muzzle(def.flash, mz, dirW, { vm: true, weapon: def.id, lightPos: mz, suppressed: !!def.suppressed, scale: (def.fx?.flashScale ?? 1) * (mods.flashScale ?? 1) * (this.vm.weapon?.dual && this.vm.weapon.side === 'l' ? 0.85 : 1),
        ramp: mods.flash === 'energy' ? RAMP.blue : mods.flash === 'magma' ? RAMP.red : def.fx?.ramp ?? null });
    }
    if (def.shell && def.mode !== 'pump' && def.mode !== 'bolt') this._ejectShell(def.shell);
    // audio: close layer (2D), tail, mechanics
    const au = g.audio;
    if (au) {
      au.play(def.sound + '_close', { volume: 1 });
      au.play(def.sound + '_tail', { volume: 0.9, delay: 0.015 });
      if (au.has(def.sound + '_mech')) au.play(def.sound + '_mech', { volume: 0.8 });
      if (ws.ammo <= Math.ceil(def.mag * 0.2) && ws.ammo > 0 && def.mag > 5) au.play('lowAmmo', { volume: 0.5 });
      au.duckFor(Math.min(0.7, 0.25 + (def.dmg * (def.pellets || 1)) / 400), 0.3);
    }
    haptic(def.cat === 'sniper' || def.cat === 'heavy' ? 45 : def.cat === 'shotgun' ? 35 : def.cat === 'pistol' ? 14 : 10);
    g.addShake(def.cat === 'shotgun' ? 0.22 : def.cat === 'sniper' || def.cat === 'heavy' ? 0.3 : def.cat === 'mg' ? 0.07 : 0.05);
    g.noise?.(g.camera.position, 30);
    g.net?.onLocalFire?.(def.id, origin, _dir, this._lastEnd);
    if (ws.ammo === 0 && ws.reserve > 0 && def.mode !== 'pump' && def.mode !== 'bolt') setTimeout(() => { if (this.current === ws && this.state === 'idle' && ws.ammo === 0) this.reload(); }, 220);
  }

  _ejectShell(type) {
    const g = this.game;
    const ep = this.vm.socketApparent('eject', _p);
    if (!ep) return;
    const data = this.vm.weapon.socket('eject')?.data || {};
    const d = data.dir ? new THREE.Vector3(data.dir[2] ?? 1, data.dir[1] ?? 0.6, -(data.dir[0] ?? 0.15)) : new THREE.Vector3(1, 0.6, 0.15);
    d.normalize().applyQuaternion(this.vm.gunRoot.getWorldQuaternion(_q));
    // CS2 ejection speeds: pistols 2.2-3.0 m/s, rifles 3-4, MGs 3.5 (+ belt link, a bit slower)
    const cat = this.current?.def.cat;
    const sp = cat === 'pistol' || cat === 'smg' ? 2.2 + Math.random() * 0.8 : cat === 'shotgun' ? 2.2 + Math.random() * 0.8 : 3 + Math.random();
    const v = d.multiplyScalar(sp).add(g.player.vel);
    v.y += 0.6;
    const floorY = g.world.collision.floorBelow(ep, 0.2, 5);
    const fy = isFinite(floorY) ? floorY : g.player.pos.y;
    // a 70 mm 12-gauge hull tumbling past the eye read as a big red stick across the frame: it leaves at 0.55 x and
    // grows to its true size as it falls away
    g.fx?.shells.spawn(type, ep.clone(), v, fy, type === '12g' ? { scale: 0.55 } : undefined);
    if (cat === 'mg' && type !== '12g') g.fx?.shells.spawn('link', ep.clone(), v.clone().multiplyScalar(0.8), fy);
  }

  _launch(ws, origin, dir) {
    const def = ws.def;
    const g = this.game;
    if (def.projectile === 'rocket') {
      const start = (this.vm.socketApparent('muzzle', new THREE.Vector3()) || origin.clone()).addScaledVector(dir, 0.3);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.5, 8).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4a5236, roughness: 0.6 }));
      let trailT = 0;
      const sound = g.audio?.play('rocket_fly', { pos: start, loop: true });
      g.projectiles.spawn({
        pos: start, vel: dir.clone().multiplyScalar(45), gravity: 1.2, life: 6, mesh, radius: 0.08,
        onUpdate: (p, dt) => {
          trailT += dt;
          sound?.setPos(p.pos);
          if (p.age > 0.08 && p.vel.length() < 140) p.vel.addScaledVector(p.vel.clone().normalize(), 70 * dt);
          while (trailT > 0.012) {
            trailT -= 0.012;
            g.fx?.particles.spawn({ x: p.pos.x, y: p.pos.y, z: p.pos.z, vx: (Math.random() - 0.5) * 0.6, vy: 0.3 + Math.random() * 0.3, vz: (Math.random() - 0.5) * 0.6, life: 1.6 + Math.random(), size: 0.15, size1: 1.2, sizePow: 0.5, color: [0.62, 0.6, 0.58, 0.5], color1: [0.65, 0.65, 0.65, 0], frame: FRAME.puff + ((Math.random() * 4) | 0), lit: true, drag: 1.2, spin: 1 });
            g.fx?.particles.spawn({ additive: true, x: p.pos.x, y: p.pos.y, z: p.pos.z, life: 0.06, size: 0.35, color: [8, 4, 1.5, 1], frame: FRAME.glow });
            g.fx?.particles.spawn({ additive: true, x: p.pos.x, y: p.pos.y, z: p.pos.z, mode: 'align', dir: [-p.vel.x, -p.vel.y, -p.vel.z], aspect: 2.5, anchor: 0.47, life: 0.04, size: 0.16, color: [1, 1, 1, 1], frame: FRAME.cone + ((Math.random() * 2) | 0), ramp: RAMP.gunfire, heat: 1, heat1: 0.3 });
          }
        },
        onHit: (p, point) => {
          g.fx?.explosion(point, { radius: def.splash, scale: 1.2 });
          g.audio?.play('explosion_large', { pos: point });
          splash(g, point, def.splash, def.dmg, { knock: def.knock, shooter: g.localId, weapon: def.id });
          const d = point.distanceTo(g.camera.position);
          g.addShake(Math.max(0, 0.9 - d / 30));
          if (d < def.splash) g.damagePlayer?.(def.dmg * 0.25 * (1 - d / def.splash), { explosive: true, from: point });
          return true;
        },
        onEnd: () => sound?.stop(0.1),
      });
      this.vm.partState.rocket = { v: 0 };
    }
  }

  // ------------------------------------------------------------------ cycling (pump / bolt)

  _cycle(ws) {
    const def = ws.def;
    this.state = 'cycle';
    const t = def.boltTime ?? (60 / def.rpm) * 0.8;
    this.timer = t;
    // premium.pump: the weapon's own pump clip (M08: a ready version that rings its bells)
    const own = def.mode !== 'bolt' && def.premium?.pump && clipFor(def.premium.pump, this.vm, { def, ws });
    const clip = def.mode === 'bolt' ? boltCycle() : own || pumpCycle();
    this.vm.play(clip, { duration: t, onEvent: (n, a) => this._clipEvent(n, a) });
  }

  // ------------------------------------------------------------------ reloads

  reload() {
    const ws = this.current;
    if (!ws || this.state !== 'idle' || ws.ammo >= ws.def.mag || ws.reserve <= 0 || ws.def.mode === 'melee') return;
    const def = ws.def;
    const empty = ws.ammo === 0;
    this.vm.aimTarget = 0;
    const style = def.reloadStyle === 'shell' ? 'shell' : (this.vm.weapon?.meta.reload || 'mag');
    if (style === 'shell_tube' || style === 'shell' || def.mode === 'pump' && style !== 'drum') {
      this.shellReload = true; this.shellEnding = false; this.shellNeedsPump = empty || ws.needsCycle;
      this.state = 'reload';
      this._reloadApplied = true;   // shells load in shellInsert only (_shellStep re-arms it per shell)
      this.vm.weapon?.premium?.reloadStart();
      const t = (def.reloadStart ?? 0.4) * this.reloadMul;
      this.timer = t;
      this.shellPhase = 'start';
      // premium.shellClips { start, insert, end, rare }: the weapon's own tube-loading clips; `rare` (1 in
      // premium.rareReloadEvery reloads, §2.25) replaces the insert of the shell that fills the tube, same duration
      const sc = def.premium?.shellClips;
      ws.reloads = (ws.reloads || 0) + 1;
      this.shellRare = !!sc?.rare && ws.reloads % (def.premium.rareReloadEvery ?? 8) === 0;
      this.vm.play((sc?.start && clipFor(sc.start, this.vm, { def, ws })) || shellStart(), { duration: t, onEvent: (n, a) => this._clipEvent(n, a) });
      return;
    }
    this.shellReload = false;
    const t = (empty ? def.reloadEmpty ?? def.reload : def.reload) * this.reloadMul;
    // premium.reload: the weapon's own reload clip (§1.7.1: a reload shows something not seen otherwise)
    const pr = def.premium;
    let clip = (pr?.reload && clipFor(pr.reload, this.vm, { def, empty, style })) || reloadClipFor(this.vm, style, empty), total = t;
    // rare reload (§1.7.1, §2.25): 1 in premium.rareReloadEvery (8), at most 0.2 s longer, ammo lands on the same frame
    ws.reloads = (ws.reloads || 0) + 1;
    if (pr?.rareReload && ws.reloads % (pr.rareReloadEvery ?? 8) === 0) {
      const rare = clipFor(pr.rareReload, this.vm, { def, empty, style });
      if (rare) ({ clip, total } = retimeRare(rare, clip, t));
    }
    this.reloadTotal = total;
    this.state = 'reload';
    this.timer = total;
    this._reloadApplied = false;
    this._inspecting = null;
    this.vm.weapon?.premium?.reloadStart();   // the premium glow "breathes out" while reloading (§1.5.5)
    this.vm.play(clip, { duration: total, onEvent: (n, a) => this._clipEvent(n, a) });
  }

  _shellStep(ws) {
    const def = ws.def;
    if (this.shellPhase === 'end') { this.shellReload = false; this.state = 'idle'; ws.needsCycle = false; return; }
    if (ws.ammo >= def.mag || ws.reserve <= 0 || this.shellEnding) { this._endShellReload(ws); return; }
    this.shellPhase = 'insert';
    this.state = 'reload';
    this._reloadApplied = false;   // one shell per insert clip
    const t = def.reload * this.reloadMul;
    this.timer = t;
    const sc = def.premium?.shellClips, last = ws.ammo + 1 >= def.mag || ws.reserve <= 1;
    const own = sc && clipFor(this.shellRare && last ? sc.rare : sc.insert, this.vm, { def, ws, last });
    this.vm.play(own || shellInsert(), { duration: t, onEvent: (n, a) => this._clipEvent(n, a) });
  }

  _endShellReload(ws, interrupted = false) {
    this.shellEnding = true;
    this.shellPhase = 'end';
    this.state = 'reload';
    this._reloadApplied = true;
    this.vm.weapon?.premium?.reloadEnd();
    const pump = this.shellNeedsPump;
    const t = (def(ws).reloadEnd ?? 0.45) * (pump ? 1.6 : 1) * this.reloadMul;
    this.timer = interrupted ? t * 0.6 : t;
    const sc = def(ws).premium?.shellClips;
    this.vm.play((sc?.end && clipFor(sc.end, this.vm, { def: def(ws), ws, pump })) || shellEnd(this.vm, { pump }), { duration: this.timer, onEvent: (n, a) => this._clipEvent(n, a) });
  }

  _clipEvent(name, arg) {
    const g = this.game;
    const ws = this.current;
    if (name === 'snd') g.audio?.play(arg, { volume: 0.9 });
    else if (name === 'ammo' || name === 'ammo1') {
      // a reload loads once: events from a stale, replayed or fast-forwarded clip (tempo perfect reload, rare
      // reloads, a clip still running after the state moved on) are no-ops
      if (!ws || this.state !== 'reload' || this._reloadApplied) return;
      this._reloadApplied = true;
      if (name === 'ammo1') {
        if (ws.reserve > 0 && ws.ammo < ws.def.mag) { ws.ammo++; ws.reserve--; g.hud?.ammoChanged?.(); }
        return;
      }
      const need = ws.def.mag - ws.ammo;
      const take = Math.min(need, ws.reserve);
      ws.ammo += take; ws.reserve -= take;
      ws.slideLocked = false;
      ws.needsCycle = false;
      if (this.vm.partState.slide) this.vm.partState.slide.v = 0;
      this.vm.weapon?.premium?.reloadEnd();
      g.hud?.ammoChanged?.();
    } else if (name === 'shellOut') {
      if (ws?.def.shell) for (let i = 0; i < (arg || 1); i++) this._ejectShell(ws.def.shell);
    } else if (name === 'magDrop') {
      // a real magazine falls to the floor (not for tactical reloads with ammo left)
      if (ws && ws.ammo === 0) this._dropMag();
    } else if (name === 'hit') this._meleeHit(arg);
    // ---- premium events (see the table at the top of this file)
    else if (name === 'fx') this._clipFx(typeof arg === 'string' ? { id: arg } : arg || {});
    else if (name === 'trail') this._clipTrail(arg || {});
    else if (name === 'hitstop') { if (clipComfort.hitstop) g.hitStop?.(Math.min(0.15, (typeof arg === 'number' ? arg : arg?.ms ?? 80) / 1000)); }
    else if (name === 'shake') { if (clipComfort.shake) g.addShake?.(Math.min(1, typeof arg === 'number' ? arg : arg?.trauma ?? 0.2)); }
    else if (name === 'fov') this._clipFov(arg);
    else if (name === 'tint') this._clipTint(arg || {});
    else if (name === 'overlay') this._clipOverlay(typeof arg === 'string' ? { id: arg } : arg || {});
    else if (name === 'haptic') this._clipHaptic(arg);
    else if (name === 'glow') this.vm.glowTo(arg?.to ?? 1, arg?.sec ?? 0.2, { u: arg?.u, mat: arg?.mat });
    else if (name === 'vmHide') this._clipHide(arg);
    else if (name === 'summon') this._clipSummon(typeof arg === 'string' ? { id: arg } : arg || {});
    else if (name === 'hud') this._clipHud(typeof arg === 'string' ? { id: arg } : arg || {});
    else if (!VM_EVENTS.has(name)) {
      const sp = specialOf(ws);
      if (sp?.onClipEvent) sp.onClipEvent(ws, name, arg, g);
      else warnOnce('ev:' + name, `event '${name}' has no handler (special.onClipEvent)`);
    }
  }

  // ------------------------------------------------------------------ premium clip layer

  /** Weapon switched: clip-scoped screen state ends. */
  _clipReset() {
    for (const t of this.trails.values()) t.r.stop();
    this.trails.clear();
    for (const o of this.overlays.values()) o.stop?.();
    this.overlays.clear();
    this._fovHold = null;
    this._inspecting = null;
    this._idleT = 0;
  }

  /** Ready layer, state-driven glow (§1.5.5) and the ready idle extra, from the special's charge state. */
  _premiumState(ws, dt) {
    const vm = this.vm, pr = ws.def.premium;
    if (!pr) return;
    const cs = specialOf(ws) ? chargeState(ws, this.game) : null;
    const ready = !!cs?.ready;
    // ready overlay (§1.7.2); premium.idleLayers [0-33 %, 34-99 %] are the §1.17 idle tiers below ready
    const tiers = pr.idleLayers;
    const layer = pr.ready && ready ? pr.ready.layer || READY_LAYER : tiers && cs ? tiers[cs.charge < 0.34 ? 0 : 1] || null : null;
    if (layer !== vm.readyLayer) vm.setReadyLayer(layer);
    // the premium shader's state (gfx/premium.js PremiumState, §1.5.5): reload dips are driven from reload / ammo
    const st = vm.weapon?.premium;
    if (st && cs) { st.setMeter(cs.charge || 0); st.setReady(ready); st.setSkill(!!cs.active); }
    const extra = vm.readyLayer?.idleExtra;
    if (extra && this.state === 'idle' && !vm.clip.active && this.sinceShot > 1) {
      if ((this._idleT += dt) >= (vm.readyLayer.every ?? 2.5)) { this._idleT = 0; this.playClip(extra); }
    } else this._idleT = 0;
  }

  _inspect(ws) {
    const pr = ws.def.premium;
    // 1 in 10 plays the rare inspect (§1.7.1 beat 11, §2.25)
    const rare = pr?.rareInspect && Math.random() < (pr.rareInspectChance ?? 0.1);
    const list = pr?.inspect ? [].concat(pr.inspect) : [];
    const id = rare ? pr.rareInspect : list.length ? list[(Math.random() * list.length) | 0] : null;
    const clip = (id && clipFor(id, this.vm, { def: ws.def, rare })) || (this.vm.weapon?.dual ? dualInspectClip() : inspectClip());
    this._inspecting = clip;
    if ((ws.def.tier ?? pr?.tier) === 'mythic') this.vm.weapon?.premium?.setInspect(true);   // rim x1.5 while inspecting
    this.vm.play(clip, { duration: clip.duration ?? 2.6, onEvent: (n, a) => this._clipEvent(n, a) });
  }

  /** Where a clip effect happens. at: 'socket' (muzzle by default) | 'aim' (crosshair ray) | 'self' (feet). */
  _fxPlace(o) {
    const g = this.game, vm = this.vm, cam = g.camera;
    const at = o.at || 'socket';
    const P = { pos: new THREE.Vector3(), dir: cam.getWorldDirection(new THREE.Vector3()), cam: null, cdir: null, vm: false, socket: null, at };
    if (at === 'aim') P.pos.copy(this._aimPoint(o));
    else if (at === 'self') P.pos.copy(g.player?.pos ?? cam.position);
    else {
      const name = o.socket || 'muzzle';
      P.socket = name;
      if (vm.socketApparent(name, P.pos)) {
        vm.socketDir(name, P.dir);
        P.vm = o.vm ?? true;
        P.cam = vm.socketCam(name);
        P.cdir = new THREE.Vector3(0, 0, -1).applyQuaternion(vm.gunRoot.quaternion);
      } else { warnOnce('sock:' + name, `socket '${name}' missing on ${vm.weapon?.id}`); P.pos.copy(cam.position).addScaledVector(P.dir, 0.6); }
    }
    return P;
  }
  _aimPoint(o, out = new THREE.Vector3()) {
    const g = this.game, cam = g.camera, d = cam.getWorldDirection(_tb), range = o.range ?? 30;
    const hit = g.world?.collision?.raycast(cam.position, d, range);
    out.copy(cam.position).addScaledVector(d, hit ? Math.max(0, hit.dist - 0.05) : range);
    if (o.ground) { const y = g.world?.collision?.floorBelow?.(_ta.set(out.x, out.y + 0.5, out.z), 0.2, 30); if (Number.isFinite(y)) out.y = y; }
    return out;
  }

  _clipFx(o) {
    const g = this.game, fx = g.fx, id = String(o.id || '').toUpperCase();
    if (!fx || !id) return null;
    const P = this._fxPlace(o);
    const col = hdrOf(o.color, o.k ?? 3, [3, 3, 3]);
    // components keep their own colours unless the clip names one
    const opts = { ...o, id, pos: P.pos, dir: P.dir, vm: P.vm, camPos: P.cam, seed: o.seed ?? ((Math.random() * 2147483647) | 0) };
    if (o.color != null) opts.color = col; else delete opts.color;
    // 1) a premium kit component (fx/kit.js); a ring on the viewmodel stays a stand-in (sigils.ring lies on the ground)
    const k = KIT_FX[id], host = k && fx[k[0]];
    if (typeof host?.[k[1]] === 'function' && !(id === 'RING' && P.vm)) return k[2](host, P, opts, this);
    // 2) a generic component hook on the FX side
    const r = fx.component?.(id, opts);
    if (r !== undefined && r !== false && r !== null) return r;
    // 3) stand-ins from the base toolkit
    if (FX_FALLBACK[id]) return FX_FALLBACK[id](g, P, o, col, this);
    warnOnce('fx:' + id, `fx '${id}': no handler (fx.${k ? k[0] + '.' + k[1] : 'component'})`);
    return null;
  }
  /** End point for BOLT / BEAM: another socket, or the crosshair ray ('aim', default). */
  _toPoint(o) { return o.to && o.to !== 'aim' ? this.vm.socketApparent(o.to, new THREE.Vector3()) || this._aimPoint(o) : this._aimPoint(o); }
  /** WING on the held gun: { open: dur } spreads (created on first use), { close: dur } folds, { off } detaches. */
  _wingEvent(wings, o) {
    if (this._wing && (this._wing.alive === false || this._wingGun !== this.vm.weapon)) this._wing = null;   // gun swapped
    const w = this._wing;
    if (o.off) { w?.detach(); this._wing = null; return null; }
    if (o.close != null) { w?.close(typeof o.close === 'number' ? o.close : 0.2); return w; }
    if (!w) {
      const { id, pos, dir, vm, camPos, color, seed, at, socket, open, ...opts } = o;
      this._wing = wings.vm({ ...opts, open: false });
      this._wingGun = this.vm.weapon;
    }
    this._wing?.openWing(typeof o.open === 'number' ? o.open : 0.25);
    return this._wing;
  }

  _clipSummon(o) {
    const g = this.game, fx = g.fx, id = String(o.id || 'GHOST').toUpperCase();
    if (!fx) return null;
    const P = this._fxPlace({ at: 'aim', ground: true, ...o });
    const col = hdrOf(o.color, o.k ?? 3, [3, 3, 3]);
    const opts = { ...o, id, pos: P.pos, dir: P.dir, seed: o.seed ?? ((Math.random() * 2147483647) | 0), caster: g.localId };
    if (o.color != null) opts.color = col; else delete opts.color;
    const k = KIT_FX[id];
    if (k?.[0] === 'summons' && typeof fx.summons?.[k[1]] === 'function') return k[2](fx.summons, P, opts, this);
    warnOnce('summon:' + id, `summon '${id}': no fx.summons.${k?.[1] || camel(id)}(), drawing a stand-in`);
    summonStandIn(g, P, o, col);
    return null;
  }

  _clipTrail(o) {
    const id = o.id || 'blade', cur = this.trails.get(id);
    if (o.on === false) { cur?.r.stop(); this.trails.delete(id); return; }
    cur?.r.stop();
    const fx = this.game.fx, w = this.vm.weapon;
    if (!fx?.trail || !w) return;
    const from = o.from || 'base', to = o.to === undefined ? 'tip' : o.to;
    if (!w.has(from)) { warnOnce('trail:' + from, `trail socket '${from}' missing on ${w.id}`); return; }
    const two = !!to && w.has(to);
    this.trails.set(id, { r: this._trailRibbon(o, two, o.color, o.color1), from, to: two ? to : null, o, clip: this.vm.clip.clip });
  }
  _trailRibbon(o, two, c0, c1) {
    const k = o.k ?? 3;
    return this.game.fx.trail({ vm: true, width: o.width ?? 0.02, life: o.life ?? 0.18, taper: o.taper ?? 0, segs: o.segs ?? 20, profile: o.profile ?? (two ? 'slash' : 'soft'),
      color: [...hdrOf(c0 ?? '#ffffff', k), 1], color1: c1 != null ? [...hdrOf(c1, k), 0] : null });
  }
  /** vm.afterUpdate: push the posed sockets (camera space) into the running trails. */
  _trailTick() {
    const vm = this.vm;
    for (const [id, t] of this.trails) {
      if (t.r.stopped || !t.o.keep && (!vm.clip.active || vm.clip.clip !== t.clip)) { t.r.stop(); this.trails.delete(id); continue; }
      const a = vm.socketCam(t.from, _ta);
      if (!a) continue;
      if (!t.to) { t.r.push(a); continue; }
      const b = vm.socketCam(t.to, _tb);
      if (t.o.ext && b) b.sub(a).multiplyScalar(t.o.ext).add(a);   // ext: the band reaches past the tip (a wider sweep)
      t.r.push(a, b);
    }
  }
  /** Melee hit during a trail with hitColor: the rest of the swing burns in the element colour (§1.17). */
  _trailHit() {
    for (const t of this.trails.values()) {
      if (!t.o.hitColor || t.hit) continue;
      t.r.stop();
      t.r = this._trailRibbon({ ...t.o, k: (t.o.k ?? 3) * 1.5 }, !!t.to, t.o.hitColor, t.o.hitColor1 ?? t.o.hitColor);
      t.hit = true;
    }
  }

  _clipFov(a) {
    if (Array.isArray(a)) a = { kick: a[0], sec: a[1] };
    else if (typeof a === 'number') a = { kick: a };
    if (!a) return;
    if (a.kick != null) { if (this.game.fovKick) this.game.fovKick(a.kick, a.sec ?? 0.3); else this.fovKick(a.kick, a.sec ?? 0.3); }
    else this.fovHold(a.to ?? a.deg ?? 0, a.sec ?? 0.2);
  }
  /** FOV envelopes -> camera.zoom (the game's _updateFov owns camera.fov; zoom survives its updates). */
  _fxTick(dt) {
    let deg = 0;
    const h = this._fovHold;
    if (h) { h.t += dt; deg += this._holdNow(); if (h.t >= h.dur && h.to === 0) this._fovHold = null; }
    for (let i = this._fovKicks.length - 1; i >= 0; i--) {
      const k = this._fovKicks[i];
      k.t += dt;
      const atk = Math.min(0.07, k.dur * 0.25);
      if (k.t >= k.dur) { this._fovKicks.splice(i, 1); continue; }
      const u = k.t < atk ? k.t / atk : 1 - (k.t - atk) / (k.dur - atk);
      deg += k.deg * (k.t < atk ? 1 - (1 - u) * (1 - u) : u * u * (3 - 2 * u));
    }
    const cam = this.game.camera;
    if (!cam || Math.abs(deg - this._fovDeg) < 1e-4) return;
    this._fovDeg = deg;
    const f = cam.fov * Math.PI / 360;
    cam.zoom = Math.tan(f) / Math.tan(Math.min(Math.PI * 0.45, Math.max(0.05, f + deg * Math.PI / 360)));
    cam.updateProjectionMatrix();
  }

  _clipTint(o) {
    if (!clipComfort.overlay) return;
    const col = hdrOf(o.rgb ?? o.color ?? '#ffffff', 1), a = Math.min(0.35, o.a ?? 0.16);
    const fi = o.in ?? 0.05, fo = o.out ?? 0.3, dur = fi + (o.hold ?? 0) + fo;
    const ov = this.game.fx?.overlay;
    if (ov?.tint) return ov.tint(col, a, dur, { fadeIn: fi, fadeOut: fo });
    warnOnce('tint', 'tint: no fx.overlay.tint(), using an additive screen kick');
    this.game.fx?.screen?.kick(col.map((c) => c * a * 1.5), dur);
    return null;
  }

  _clipOverlay(o) {
    const kind = String(o.id || '').toLowerCase(), key = o.key || kind;
    if (o.off) { this.overlays.get(key)?.stop?.(); this.overlays.delete(key); return; }
    if (!clipComfort.overlay || !kind) return;
    const ov = this.game.fx?.overlay;
    if (ov?.add) {
      const { id, key: _k, off, ...opts } = o;
      if (opts.color != null) opts.color = hdrOf(opts.color, 1);
      const e = ov.add(kind, opts);
      if (e) this.overlays.set(key, e);
      return e;
    }
    // no overlay module: speed lines read a little through chromatic aberration, the rest is skipped
    warnOnce('ov:' + kind, `overlay '${kind}': no fx.overlay`);
    if (kind === 'radial' && this.game.renderer?.post) {
      const post = this.game.renderer.post;
      post.aberration = Math.max(post.aberration, 0.3);
      setTimeout(() => { post.aberration = 0; }, (o.dur ?? 0.35) * 1000);
    }
  }

  _clipHaptic(a) {
    const pat = typeof a === 'number' ? [a] : HAPTIC[a];
    if (!pat) { warnOnce('hap:' + a, `haptic '${a}' unknown`); return; }
    const now = performance.now();
    if (now - this._hapticAt < 70) return;   // §1.13: 70 ms apart at least
    let t = 0;
    for (let i = 0; i < pat.length; i += 2) {
      const ms = pat[i];
      if (t === 0) haptic(ms); else setTimeout(() => haptic(ms), t);
      t += ms + (pat[i + 1] ?? 0);
    }
    this._hapticAt = now + t - pat[pat.length - 1];
  }

  _clipHide(a) {
    const obj = a && typeof a === 'object';
    const on = obj ? a.on ?? true : !!a;
    const mode = a === 'all' || obj && a.mode === 'all' ? 2 : 1;
    if (obj && a.sec) this.vm.hideFor(on ? a.sec : 0, mode);
    else this.vm.clipHide = on ? mode : 0;
  }

  _clipHud(o) {
    const h = this.game.hud;
    if (h?.clipEvent) return h.clipEvent(o.id, o);
    warnOnce('hud:' + o.id, `hud '${o.id}': no hud.clipEvent()${o.text ? ', showing a toast' : ''}`);
    if (o.text) h?.toast?.(o.sub ? `${o.text}　${o.sub}` : o.text, (o.dur ?? 1.6) * 1000);
  }

  _dropMag() {
    const g = this.game;
    const part = this.vm.weapon?.part('mag');   // dual: the gun that fired last ('R_mag' / 'L_mag')
    if (!part) return;
    const clone = part.node.clone(true);
    const wp = this.vm.socketApparent('magwell', new THREE.Vector3()) || g.camera.position.clone();
    clone.position.copy(wp);
    clone.quaternion.copy(this.vm.gunRoot.getWorldQuaternion(new THREE.Quaternion()));
    clone.scale.setScalar(0.85);
    // world materials: swap viewmodel materials for regular ones
    clone.traverse((o) => { if (o.isMesh) { o.material = hardSurface(o.material.userData.preset || 'steel'); o.frustumCulled = true; o.castShadow = true; } });
    g.scene.add(clone);
    const floorY = g.world.collision.floorBelow(wp, 0.2, 5);
    const vel = new THREE.Vector3((Math.random() - 0.5) * 0.4, -0.5, 0.2).applyQuaternion(g.camera.quaternion).add(g.player.vel);
    const spin = new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
    let t = 0, landed = false;
    const sys = { update: (dt) => {
      t += dt;
      if (!landed) {
        vel.y -= 15 * dt;
        clone.position.addScaledVector(vel, dt);
        clone.rotation.x += spin.x * dt; clone.rotation.y += spin.y * dt; clone.rotation.z += spin.z * dt;
        if (clone.position.y < floorY + 0.02) { clone.position.y = floorY + 0.02; landed = true; g.audio?.play('magDrop', { pos: clone.position }); }
      }
      if (t > 8) { g.scene.remove(clone); g.systems.splice(g.systems.indexOf(sys), 1); }
    } };
    g.systems.push(sys);
  }

  // ------------------------------------------------------------------ melee

  _melee(s, ws) {
    const def = ws.def;
    // a premium melee drives its own attacks (combos, charge, guard) from its special: special.melee() -> true
    if (specialOf(ws)?.melee?.(ws, s, this.game)) return;
    if (this.state !== 'idle') return;
    if (s.pressed.fire || (s.held.fire && this.fireCd <= 0)) {
      if (this.fireCd > 0) return;
      this.state = 'melee';
      const t = 60 / def.rpm;
      this.timer = t;
      this.fireCd = t;
      this.meleeHeavy = false;
      this.knifeDir = -this.knifeDir;
      this.vm.play(knifeSlash(this.knifeDir), { duration: t, onEvent: (n, a) => this._clipEvent(n, a) });
    } else if (s.pressed.alt) {
      this.state = 'melee';
      const t = def.heavy?.time ?? 0.9;
      this.timer = t;
      this.fireCd = t;
      this.meleeHeavy = true;
      this.vm.play(knifeStab(), { duration: t, onEvent: (n, a) => this._clipEvent(n, a) });
    }
  }

  /** Melee hit at the clip's `hit` event; arg { range, dmg, kb } (05d §7.1) overrides the def for this swing. */
  _meleeHit(arg) {
    const g = this.game;
    const ws = this.current;
    if (!ws) return;
    const def = ws.def;
    const heavy = this.meleeHeavy;
    const o = arg && typeof arg === 'object' ? arg : {};
    const range = o.range ?? (heavy ? def.heavy?.range ?? 2 : def.range?.[0] ?? 1.8);
    const dmg = o.dmg ?? (heavy ? def.heavy?.dmg ?? def.dmg * 2.5 : def.dmg);
    g.camera.getWorldDirection(_dir);
    // a short fan of rays so slashes are forgiving
    const hitTargets = new Set();
    let hitWorld = null;
    for (const yaw of heavy ? [0] : [-0.35, -0.17, 0, 0.17, 0.35]) {
      const d = _dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw * this.knifeDir);
      const wh = g.world.collision.raycast(g.camera.position, d, range);
      const maxD = wh ? wh.dist : range;
      const th = g.targets?.raycast(g.camera.position, d, maxD)[0];
      if (th && !hitTargets.has(th.target)) {
        hitTargets.add(th.target);
        const backstab = th.target.isBackTo?.(g.camera.position) ? 2 : 1;
        const res = th.target.damage({ amount: dmg * backstab * (th.part === 'head' ? (def.head ?? 2) * this.headMul : 1) * this.dmgMul, part: th.part, point: th.point, normal: th.normal, dir: d, dist: th.dist, knock: (o.kb ?? def.knock * (heavy ? 2 : 1)) * this.knockMul, stagger: heavy ? 1 : def.stagger, weapon: def.id, shooter: g.localId, melee: true, headshot: th.part === 'head' });
        if (hitTargets.size === 1) this._trailHit();
        g.hud?.onHit?.({ amount: dmg, part: th.part, headshot: th.part === 'head' }, res, th.target);
        g.audio?.play('knife_hit_flesh', { pos: th.point });
        g.hitStop?.(heavy ? 0.06 : 0.035);
        g.addShake(heavy ? 0.2 : 0.1);
        haptic(heavy ? 35 : 18);
      } else if (wh && !hitWorld) hitWorld = { wh: { ...wh, point: wh.point.clone(), normal: wh.normal.clone() }, d };
    }
    if (!hitTargets.size && hitWorld) {
      g.fx?.impact(hitWorld.wh.surf, hitWorld.wh.point, hitWorld.wh.normal, hitWorld.d, { big: 0.6 });
      g.audio?.play('knife_hit_wall', { pos: hitWorld.wh.point });
      haptic(12);
    }
  }
}

function def(ws) { return ws.def; }
