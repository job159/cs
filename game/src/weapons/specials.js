// Signature mechanics for premium weapons. A weapon def opts in with `special: { type, ...params }`.
//
// v1: the five original "Anti-Calamity" series (docs/research/03-weapons-feel.md §5.3) implement the hooks
// directly. v2 (docs/PREMIUM_WEAPONS.md §4.2 row 0.6, Appendix A): a def with `special.meters` / `special.skills`
// runs on the shared engine below (multiple meters, skills { alt, tap, hold, ult }, crisis armour, team
// auras, the network skill event); `type` then names optional per-weapon overrides (registerSpecial) and every
// skill id an implementation (registerSkill). See "v2 engine" for the data format and the skill API.
//
// Handler hooks (what the Arsenal calls; `specialOf(ws)` returns the handler or null):
//   init(ws)                         per-weapon state on ws.sp
//   modifiers(ws) -> { rpmMul, dmgMul, infinite, split, tracer, flash, pierce, knockMul }
//   onFire(ws, ctx)                  after a shot (ctx: { game, origin, dir, muzzle })
//   onHit(ws, info, res, target)     every damaging hit
//   onSpecial(ws, game)              special button pressed (Q / touch ★)
//   onAlt(ws, game, pressed)         alt button when the weapon uses it (returns true if consumed); only present
//                                    on handlers that take alt over (a v2 def without skills.alt keeps ADS)
//   onReloadInput(ws, game) -> true  reload pressed during a reload (active reload)
//   update(ws, dt, game)             while held -- runs only for the equipped weapon whoever calls it
//   tick(ws, dt, game)               every frame while owned, held or not -- at most once per frame
//   dispose(ws, game)                once the weapon has left the inventory -- at most once
//   meter(ws, game) -> { value 0..1, ready, label, color, hud?, window? }   primary meter (old HUD bar)
//
// Arsenal contract (safe to adopt incrementally; every entry point is idempotent):
//   tickSpecial(ws, dt, game, equipped)   call for every owned weapon each frame (update if equipped, then tick)
//   disposeSpecial(ws, game)              call when give() replaces a slot / the arsenal is dropped
//   Until the Arsenal ticks owned weapons itself, attach() runs tick/dispose from a game system; both paths
//   share the per-frame guard, so nothing runs twice.
// HUD / render queries: hudInfo(ws, game), chargeState(ws, game), auraMul(game, type), crisisState(game).
import * as THREE from 'three';
import { splash } from './ballistics.js';
import { haptic } from './arsenal.js';
import { WEAPONS } from './defs.js';
import { FRAME, DECAL, DECAL_TINT } from '../fx/fx.js';
import { armCrisis, crisisState, CRISIS_SKILL } from './crisis.js';
import { dualphaseView, dualphaseReady, dualphaseEngage, dualphaseEnd, phaseCrown, phaseKill, fxQueue, OVERPHASE_FX } from './antical.js';
export { crisisState };

const _v = new THREE.Vector3();
const PERFECT_FIN = 0.12;   // tempo: a perfect reload fast-forwards the rest of the clip over this many seconds
// gyre discs share one material and one torus per blade level (no per-throw GPU allocations)
const DISC_MAT = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 3.2, 0.6) });
const _discGeo = [];
function dropDisc(ws, g) { const s = ws.sp; if (s.disc) { g.scene.remove(s.disc.mesh); s.disc = null; } }

/** Runs tick/dispose from a game system so holstered weapons keep their timers / discs moving. */
function attach(ws) {
  const g = ws.game, sp = specialOf(ws);
  if (!g?.systems || !sp?.tick && !sp?.dispose) return;
  const sys = { update: (dt) => {
    const ar = g.arsenal;
    if (ws._spGone || !ar || ar.current !== ws && !Object.values(ar.owned).includes(ws)) { sp.dispose?.(ws, g); g.systems.splice(g.systems.indexOf(sys), 1); return; }
    tickSpecial(ws, dt, g, false);
  } };
  g.systems.push(sys);
}

/** Per-frame entry for one owned weapon: update() while equipped, tick() always (guard() dedupes both). */
export function tickSpecial(ws, dt, g = ws?.game, equipped = g?.arsenal?.current === ws) {
  const sp = specialOf(ws);
  if (!sp || !g) return;
  if (equipped) sp.update?.(ws, dt, g);
  sp.tick?.(ws, dt, g);
}

/** The weapon left the inventory: release its world objects / running skills (once). */
export function disposeSpecial(ws, g = ws?.game) { if (ws) specialOf(ws)?.dispose?.(ws, g); }

/**
 * Makes a handler safe whoever drives it (the Arsenal directly, tickSpecial, attach()): update() only for the
 * equipped weapon and once per frame, tick() once per frame, dispose() once.
 */
function guard(h) {
  if (!h || h._guarded) return h;
  const { update, tick, dispose } = h;
  if (update) h.update = (ws, dt, g) => { if (ws._spGone || g?.arsenal?.current !== ws || ws._spU === g.time) return; ws._spU = g.time; update.call(h, ws, dt, g); };
  if (tick) h.tick = (ws, dt, g) => { if (ws._spGone || ws._spT === g.time) return; ws._spT = g.time; tick.call(h, ws, dt, g); };
  h.dispose = (ws, g) => { if (ws._spGone) return; ws._spGone = true; dispose?.call(h, ws, g); };
  h._guarded = true;
  return h;
}

export const SPECIALS = {
  // ------------------------------------------------------------------ 雙相 DUALPHASE
  // Hits charge the phase (headshot x2); ★ / Q starts 過相 Overphase: +rpm, split light rounds, no ammo used.
  // Presentation (gimbal, LED meter, shells, crown, ready / end beats, teammates' replay): antical.js.
  overphase: {
    init(ws) { ws.sp = { charge: 0, active: 0, stored: 0, readyN: false, readyT: 0 }; attach(ws); },
    modifiers(ws) {
      const s = ws.sp, p = ws.def.special;
      // p.tracer: one HDR colour, or a list the split rounds cycle through (cyan / amber)
      return s.active > 0 ? { rpmMul: p.rpmMul ?? 1.3, infinite: true, split: p.split ?? 1, tracer: p.tracer ?? [3, 8, 9, 1], flash: 'energy', flashScale: p.flashScale ?? 1, dmgMul: p.dmgMul ?? 1.15 } : {};
    },
    onHit(ws, info, res) {
      const s = ws.sp, p = ws.def.special, g = ws.game;
      if (res?.killed && g?.arsenal?.current === ws) phaseKill(g, info.point);
      if (s.active > 0) return;
      s.charge = Math.min(p.hits, s.charge + (info.headshot ? 2 : 1));
    },
    onFire(ws, ctx) { if (ws.sp.active > 0) phaseCrown(ctx.game, ws.shots); },
    onSpecial(ws, g) {
      const s = ws.sp, p = ws.def.special;
      if (s.active > 0) return;
      if (s.charge < p.hits) { deny(ws, 'tap', { ok: false, why: 'meter', need: 1 - s.charge / p.hits }); return; }
      s.active = p.duration ?? 14; s.charge = 0; s.readyN = false;
      dualphaseEngage(ws, g);
      haptic(15);
      g.hud?.onSkillCast?.(ws, 'tap', { id: 'overphase', zh: '過相' });
      // teammates replay the start from the skill event (antical.js OVERPHASE_FX); mechanics stay local
      const cam = g.camera;
      cam.getWorldDirection(_v);
      g.net?.sendSkill?.({ type: 'skill', id: 'overphase_fx', w: ws.def.id, slot: 'tap', seed: (Math.random() * 2147483647) | 0,
        pos: [cam.position.x, cam.position.y, cam.position.z], dir: [_v.x, _v.y, _v.z], by: g.localId, ph: 0 });
    },
    update(ws, dt, g) { dualphaseView(ws, g, dt); },
    tick(ws, dt, g) {
      const s = ws.sp, p = ws.def.special, held = g.arsenal?.current === ws;
      fxQueue(ws, dt);
      if (s.active > 0) { s.active -= dt; ws.ammo = Math.max(ws.ammo, 1); if (s.active <= 0) { s.active = 0; dualphaseEnd(ws, g, held); } }
      // ready (§1.7.1 beat 7): lock + bell + nodes + haptic once while held, then a soft reminder every 2.5 s
      if (!(s.active <= 0 && s.charge >= p.hits)) { s.readyN = false; s.readyT = 0; return; }
      if (!held) return;
      if (!s.readyN) { s.readyN = true; s.readyT = 0; readyFanfare(ws, g); dualphaseReady(ws, g); }
      else if ((s.readyT += dt) >= READY_EVERY) {
        s.readyT = 0;
        if (g.hud?.settings?.readyReminder !== false) { g.audio?.play(ws.def.premium?.ready?.sfx || 'special_ready', { volume: 0.25 }); g.hud?.readyPulse?.(ws); dualphaseReady(ws, g, true); }
      }
    },
    meter(ws) { const s = ws.sp, p = ws.def.special; return s.active > 0 ? { value: s.active / (p.duration ?? 14), ready: false, label: '過相', color: '#5fe0ff', hud: 'ring', active: true } : { value: s.charge / p.hits, ready: s.charge >= p.hits, label: '相位', color: '#ffb84a', hud: 'ring' }; },
  },

  // ------------------------------------------------------------------ 熔爐 CRUCIBLE
  crucible: {
    init(ws) { ws.sp = { heat: 0, primed: false, hitAt: null }; attach(ws); },
    modifiers(ws) { return ws.sp.primed ? { flash: 'magma', tracer: [9, 3, 0.6, 1] } : {}; },
    // first body the magma round strikes (hits arrive nearest first, before onFire)
    onHit(ws, info) { const s = ws.sp; if (s.primed && !s.hitAt && info.point) s.hitAt = info.point.clone(); },
    onFire(ws, ctx) {
      const s = ws.sp, p = ws.def.special, g = ctx.game;
      const hitAt = s.hitAt; s.hitAt = null;
      if (s.primed) {
        // the magma round already fired this shot: detonate on the first body it struck (ctx.end lies past
        // penetrated targets), else where it hit the world; a round lost to open sky just burns out
        s.primed = false;
        s.heat = p.keep ?? 0.5;
        if (!hitAt && ctx.end && ctx.end.distanceTo(ctx.origin) >= (ws.def.maxRange ?? 400) - 0.5) return;
        const at = hitAt ? hitAt.addScaledVector(ctx.dir, -0.1) : ctx.end || _v.copy(ctx.origin).addScaledVector(ctx.dir, 20);
        g.fx?.explosion(at, { radius: p.radius ?? 3, scale: 0.6, color: [1, 0.4, 0.1] });
        g.audio?.play('explosion_small', { pos: at, volume: 0.8 });
        splash(g, at, p.radius ?? 3, (p.blast ?? 120) * (g.arsenal?.dmgMul ?? 1), { knock: 6, shooter: g.localId, weapon: ws.def.id });
        return;
      }
      s.heat = Math.min(1, s.heat + 1 / (p.shots ?? 12));
      if (s.heat >= 1) { s.primed = true; g.audio?.play('special_ready', { volume: 0.6 }); }
    },
    // cools while not firing it (holstered included)
    tick(ws, dt, g) { const s = ws.sp, ar = g.arsenal; if (!s.primed && (ar.current !== ws || ar.sinceShot > 0.4)) s.heat = Math.max(0, s.heat - dt * 0.12); },
    meter(ws) { const s = ws.sp; return { value: s.heat, ready: s.primed, label: '爐溫', color: s.primed ? '#ff5a1e' : '#ff9a3a', hud: 'arc' }; },
  },

  // ------------------------------------------------------------------ 破疫 PLAGUEBANE
  plaguebane: {
    init(ws) { ws.sp = {}; },
    onHit(ws, info, res, target) {
      const z = target?.zombie;
      if (!z || !z.alive) return;
      z.purgeT = 3;      // read by Zombie.damage via mgr.dmgTakenMul hook (team damage +10 %)
      z.purgeMul = 1 + (ws.def.special.mark ?? 0.1);
    },
    meter() { return null; },
  },

  // ------------------------------------------------------------------ 節拍 TEMPO (active reload)
  tempo: {
    init(ws) { ws.sp = { needle: 0, tried: false, perfects: 0, buff: 0, pierceLeft: 0, inReload: false }; attach(ws); },
    modifiers(ws) { const s = ws.sp; return { dmgMul: s.buff > 0 ? 1.15 : 1, pierce: s.pierceLeft > 0 ? 3 : 0 }; },
    onReloadInput(ws, g) {
      const s = ws.sp, ar = g.arsenal;
      if (ar.state !== 'reload' || s.tried) return false;
      s.tried = true;
      const t = 1 - ar.timer / Math.max(0.01, ar.reloadTotal || 1);
      const win = ws.def.special.window ?? [0.42, 0.56];
      if (t >= win[0] && t <= win[1]) {
        // perfect: load now, buff, chain toward a piercing magazine. The rest of the reload clip is fast-forwarded
        // with its own 'ammo' event swallowed (it would top the magazine up again after the reload has ended).
        ar._clipEvent('ammo');
        const c = g.vm?.clip;
        if (c?.active) {
          const on = c.onEvent;
          c.onEvent = (n, a) => { if (n !== 'ammo' && n !== 'ammo1') on?.(n, a); };
          c.speed = Math.max(1, c.duration * (1 - c.t) / PERFECT_FIN);
        }
        ar.timer = PERFECT_FIN;
        s.buff = 4; s.perfects++;
        if (s.perfects >= 3) { s.perfects = 0; s.pierceLeft = ws.ammo; g.hud?.toast('三連拍！貫穿彈匣', 1500); }
        else g.hud?.toast('完美換彈！', 900);
        g.audio?.play('perfect_reload');
        haptic(20);
      } else { s.perfects = 0; ar.timer += 0.6; g.audio?.play('dryfire'); }
      return true;
    },
    // the piercing magazine lasts its rounds, or until the next reload swaps it out
    onFire(ws) { const s = ws.sp; if (s.pierceLeft > 0) s.pierceLeft--; },
    update(ws, dt, g) {
      const s = ws.sp, r = g.arsenal.state === 'reload';
      if (!r) s.tried = false;
      if (r && !s.inReload) s.pierceLeft = 0;
      s.inReload = r;
    },
    tick(ws, dt) { ws.sp.buff = Math.max(0, ws.sp.buff - dt); },
    meter(ws, g) {
      const ar = g.arsenal;
      if (ar.state === 'reload') return { value: 1 - ar.timer / Math.max(0.01, ar.reloadTotal || 1), ready: false, label: '節拍', color: '#ff3fb4', window: ws.def.special.window ?? [0.42, 0.56], hud: 'timing' };
      return ws.sp.buff > 0 ? { value: ws.sp.buff / 4, ready: true, label: '強化', color: '#ff3fb4' } : null;
    },
  },

  // ------------------------------------------------------------------ 迴刃 GYRE (saw disc)
  gyre: {
    init(ws) { ws.sp = { blades: 0, disc: null }; attach(ws); },
    onFire(ws) { const s = ws.sp, p = ws.def.special; if (!s.disc) s.blades = Math.min(p.max ?? 12, s.blades + 1 / (p.per ?? 6)); },
    onAlt(ws, g, pressed) {
      if (!pressed) return true;
      const s = ws.sp, p = ws.def.special;
      if (s.disc) { s.disc.recall = true; return true; }
      if (s.blades < 1) { g.hud?.toast('刃片不足'); return true; }
      const cam = g.camera;
      const dir = cam.getWorldDirection(new THREE.Vector3());
      const pos = (g.vm.socketApparent('muzzle', new THREE.Vector3()) || cam.position.clone()).addScaledVector(dir, 0.3);
      const level = Math.floor(s.blades);
      s.blades = 0;
      const mesh = new THREE.Mesh(_discGeo[level] ||= new THREE.TorusGeometry(0.22 + level * 0.03, 0.03, 6, 24), DISC_MAT);
      const disc = { pos: pos.clone(), vel: dir.multiplyScalar(p.speed ?? 30), mesh, t: 0, hover: 0, recall: false, tick: 0, level };
      g.scene.add(mesh);
      s.disc = disc;
      g.audio?.play('saw_launch');
      return true;
    },
    // the disc flies, hovers, cuts and comes back whichever weapon is held
    tick(ws, dt, g) {
      const s = ws.sp, d = s.disc, p = ws.def.special;
      if (!d) return;
      d.t += dt; d.tick -= dt;
      const col = g.world.collision;
      if (d.recall) {
        const to = _v.copy(g.camera.position);
        const dir = to.sub(d.pos);
        const dist = dir.length();
        d.pos.addScaledVector(dir.normalize(), Math.min(dist, 38 * dt));
        if (dist < 1) { dropDisc(ws, g); g.audio?.play('saw_catch'); return; }
      } else if (d.hover <= 0) {
        const step = d.vel.length() * dt;
        const hit = col?.raycast(d.pos, _v.copy(d.vel).normalize(), step + 0.2);
        if (hit || d.t > 0.9) { d.hover = p.hover ?? 4; if (hit) d.pos.copy(hit.point).addScaledVector(hit.normal, 0.3); }
        else d.pos.addScaledVector(d.vel, dt);
      } else {
        d.hover -= dt;
        if (d.hover <= 0) d.recall = true;
      }
      d.mesh.position.copy(d.pos);
      d.mesh.rotation.y += dt * 30;
      if (Math.random() < 0.7) g.fx?.particles.spawn({ additive: true, x: d.pos.x, y: d.pos.y, z: d.pos.z, vx: (Math.random() - 0.5) * 6, vy: Math.random() * 3, vz: (Math.random() - 0.5) * 6, life: 0.25, size: 0.012, color: [2, 6, 1, 1], color1: [1, 3, 0.3, 0], frame: 3, stretch: 0.02, gravity: 6 });
      if (d.tick <= 0) {
        d.tick = 0.25;
        for (const z of g.zombies?.inRadius(d.pos, 1.4 + d.level * 0.1) || []) {
          const dir = z.center(new THREE.Vector3()).sub(d.pos).normalize();
          const info = { amount: (p.dps ?? 120) * 0.25 * (1 + d.level * 0.15) * (g.arsenal?.dmgMul ?? 1), part: 'body', dir, point: z.center(new THREE.Vector3()), knock: 0.4, stagger: 0.7, weapon: ws.def.id, shooter: g.localId };
          g.hud?.onHit?.(info, z.damage(info), z);
        }
      }
    },
    dispose(ws, g) { dropDisc(ws, g); },
    meter(ws) { const s = ws.sp, p = ws.def.special; return { value: Math.min(1, s.blades / (p.max ?? 12)), ready: s.blades >= 1 || !!s.disc, label: s.disc ? '召回' : '刃片', color: '#8dff4a', hud: 'segments', segments: p.max ?? 12 }; },
  },
};

// =================================================================================================== v2 engine
//
// Def (Appendix A; `premium` = look and presentation, `special` = mechanics):
//   special: {
//     type: 'chiwen',             // per-weapon overrides: registerSpecial('chiwen', { onHit, onFire, modifiers, update,
//                                 //   tick, dispose, meterInfo(ws, key, m, game) }) -- run after the engine (optional)
//     meters: { <key>: { max = 100, start = 0, hud: 'arc'|'ring'|'segments'|'timing'|'dial'|'stack'|'lock'|'dual'|'bar',
//               label, color, segments, onHit, onHead, onKill, on<Evt> (meterEvent(ws, '<evt>')), source: 'damage',
//               per (damage for a full meter), regen /s, decay /s, decayDelay s, skillFill: false } },
//               // key 'ult' feeds the ultimate; other skills spend `meter` (default: the first non-ult meter)
//     skills: { alt, tap, hold, ult: { id, zh, cost, meter, cd, hold: true (channel while the button is held),
//               drain /s, dur, level: 'L0'..'L4', ...params for the implementation } },
//     crisis: { kind: 'knock'|'counter'|'blink'|'heal', name, fx }   (or premium.crisis; see crisis.js)
//   }
//   premium.aura: { type: 'dmg'|'reloadSpeed'|'regen'|<any>, mul, radius = 4, when: 'held'|'ready'|<other: the weapon’s own addAura> } (team aura, §1.4)
// Input (§1.8): ◎ / right mouse = skills.alt; ★ / Q tap = skills.tap; ★ held 0.35 s = skills.ult when its meter is full,
// else skills.hold; desktop also Q then F within 0.3 s = ult. Nothing to long-press for -> the tap casts on press.
//
// Skill implementation: registerSkill(id, { level: 'L0'..'L4', dur, channel, aim, defaults, start(k), update(k, dt)
// -> false ends, end(k) }). Every client runs it: the caster with k.local = true (gameplay: k.hurt / k.hitRay use the
// normal hit path, so a guest's damage still reaches the host as hits), everyone else from the network event
// { type: 'skill', id, seed, pos, dir, w, by, slot, ph } with k.local = false (visuals, plus effects on their own
// player such as heals). Random visuals use k.rng() (seeded, identical everywhere). k.level is the §1.7.4 level
// after the downgrade (others' L4 -> L3, a third concurrent L3 -> L2, a player's third L2 -> L1, low quality).
// k: { id, slot, p (impl.defaults + the def's skill entry), def, ws (caster only), game, local, by, level, t, dur,
//      pos/dir (cast eye + aim), at (world aim point when impl.aim), hex/col (palette hex / HDR arrays core rim mote
//      accent trim base), data, rng(), caster(pos, dir), feet(), muzzle(out), floorY(p), hurt(c, r, dmg, o),
//      hitRay(from, dir, len, dmg, o), cardText(), done }
const HOLD_T = 0.35;       // ★ long-press for the ultimate (§1.8)
const QF_T = 0.3;          // desktop: Q then F
const READY_EVERY = 2.5;   // ready reminder period (§1.7.1 beat 7)
const LV = { L0: 0, L1: 1, L2: 2, L3: 3, L4: 4 };
const UP = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3(), _c = new THREE.Vector3(), _e = new THREE.Vector3(), _f = new THREE.Vector3(), _col = new THREE.Color();
const nowS = () => performance.now() / 1000;

export const SKILLS = {};
export function registerSkill(id, impl) { SKILLS[id] = impl; return impl; }
/** Per-weapon overrides for v2 defs whose special.type is `type` (engine hooks run first, modifiers merge). */
export function registerSpecial(type, handler) { SPECIALS[type] = handler; return handler; }

/** Seeded PRNG (skill visuals replay identically on every client). */
export function mulberry32(a) {
  return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// element palettes (§1.6); a def's premium.palette wins key by key
export const ELEMENTS = {
  inferno: { base: '#1b1414', trim: '#c8902e', core: '#ffb43a', rim: '#ff5a1f', mote: '#ffd27a', accent: '#3a2a26' },
  frost: { base: '#e8f4ff', trim: '#b9c7d6', core: '#6fe3ff', rim: '#2f8bff', mote: '#ffffff', accent: '#bfe9ff' },
  storm: { base: '#141a26', trim: '#9aa6b8', core: '#7fd8ff', rim: '#e8f6ff', mote: '#8a5cff', accent: '#ffe27a' },
  radiant: { base: '#f3efe6', trim: '#e3b04b', core: '#fff2b0', rim: '#ffc74a', mote: '#fffbe0', accent: '#6ec8ff' },
  void: { base: '#0c0b10', trim: '#8c6a2a', core: '#b54bff', rim: '#ff3fb4', mote: '#6a3cff', accent: '#3fffe0' },
  soul: { base: '#15161c', trim: '#d1a542', core: '#3a6dff', rim: '#b54bff', mote: '#49ff9a', accent: '#d1a542' },
  demonic: { base: '#120a0a', trim: '#c9a24a', core: '#ff2a3a', rim: '#ff4b2b', mote: '#ffb070', accent: '#c9a24a' },
  cosmic: { base: '#0d1238', trim: '#cfd6e6', core: '#7aa8ff', rim: '#c66bff', mote: '#fff6d8', accent: '#ffcf6a' },
  cyber: { base: '#e6e3dc', trim: '#e2571a', core: '#ffb02e', rim: '#3fd8ff', mote: '#ffcf7a', accent: '#121316' },
  jade: { base: '#f1efe7', trim: '#d9a948', core: '#1fa37a', rim: '#7dffb8', mote: '#c8ffe0', accent: '#ff7a5c' },
  lunar: { base: '#b3122a', trim: '#f2c14e', core: '#ffd36b', rim: '#ff7a2f', mote: '#fff1b8', accent: '#19a59a' },
};
export function elementOf(def) { return [].concat(def?.premium?.element ?? def?.element ?? [])[0] || null; }
export function paletteOf(def) { return { ...(ELEMENTS[elementOf(def)] || ELEMENTS.radiant), ...(def?.premium?.palette || {}) }; }
function hdr(hex, k = 1) { _col.set(hex); return [_col.r * k, _col.g * k, _col.b * k]; }

function skillDef(def, slot) {
  if (slot === 'crisis') return { id: 'crisis', level: 'L1', ...def?.special?.crisis, ...def?.premium?.crisis };
  return def?.special?.skills?.[slot] || null;
}
function costKey(ws, slot) {
  const sk = skillDef(ws.def, slot), ms = ws.def.special.meters || {};
  if (!sk) return null;
  if (sk.meter) return ms[sk.meter] ? sk.meter : null;
  if (slot === 'ult') return ms.ult ? 'ult' : null;
  return Object.keys(ms).find((k) => k !== 'ult') || null;
}
function costOf(ws, slot) {
  const sk = skillDef(ws.def, slot), key = costKey(ws, slot);
  if (!sk || !key) return 0;
  return sk.cost ?? (slot === 'ult' ? ws.def.special.meters[key].max ?? 100 : 0);
}

/** { ok, why: 'none'|'cd'|'active'|'meter'|'dead', need: 0..1 still missing } */
export function canCast(ws, slot) {
  const s = ws?.sp, sk = ws && skillDef(ws.def, slot);
  if (!s?.v2 || !sk || !SKILLS[sk.id]) return { ok: false, why: 'none', need: 1 };
  if ((s.cd[slot] || 0) > 0) return { ok: false, why: 'cd', need: s.cd[slot] / (sk.cd || 1) };
  if (!sk.stack) for (const k of s.run) if (k.slot === slot && !k.done) return { ok: false, why: 'active', need: 0 };
  const key = costKey(ws, slot), cost = costOf(ws, slot);
  if (key && cost > 0 && s.m[key] < cost - 1e-6) return { ok: false, why: 'meter', need: 1 - s.m[key] / cost };
  return { ok: true, why: '', need: 0 };
}

export function meterAdd(ws, key, n, quiet = false) {
  const s = ws?.sp, c = ws?.def.special.meters?.[key];
  if (!s?.v2 || !c) return;
  s.m[key] = Math.max(0, Math.min(c.max ?? 100, s.m[key] + n));
  if (n > 0 && !quiet) s.gainAt[key] = ws.game?.time ?? 0;
}
/** Named meter source: adds every meter's `on<Name>` (e.g. meterEvent(ws, 'detonate') -> onDetonate). */
export function meterEvent(ws, name, k = 1) {
  const on = 'on' + name[0].toUpperCase() + name.slice(1);
  for (const [key, c] of Object.entries(ws?.def.special.meters || {})) if (c[on]) meterAdd(ws, key, c[on] * k);
}
export function meterFrac(ws, key) { const c = ws?.def.special.meters?.[key]; return c && ws.sp?.v2 ? ws.sp.m[key] / (c.max ?? 100) : 0; }

function v2Init(ws) {
  const p = ws.def.special, m = {};
  for (const [k, c] of Object.entries(p.meters || {})) m[k] = c.start ?? 0;
  ws.sp = { v2: true, m, gainAt: {}, cd: {}, run: new Set(), star: null, waitF: 0, heldT: 0, hits: 0, readyN: false, readyT: 0, denyAt: -9 };
  if (p.crisis || ws.def.premium?.crisis) armCrisis(ws);
}

function v2Hit(ws, info, res, fromSkill = false) {
  const s = ws.sp, p = ws.def.special;
  if (!s?.v2 || !res || !(res.damage > 0 || res.killed)) return;
  s.hits++;
  for (const [k, c] of Object.entries(p.meters || {})) {
    if (fromSkill && c.skillFill === false) continue;
    // the ultimate does not refill its own meter while it runs
    if (k === costKey(ws, 'ult') && [...s.run].some((r) => r.slot === 'ult' && !r.done)) continue;
    let add = 0;
    if (c.onHit) add += c.onHit;
    if (info.headshot && c.onHead) add += c.onHead;
    if (res.killed && c.onKill) add += c.onKill;
    if (c.source === 'damage' && c.per) add += (res.damage || 0) / c.per * (c.max ?? 100);
    if (add) meterAdd(ws, k, add);
  }
}

function isReady(ws) {
  const sk = ws.def.special.skills || {};
  if (sk.ult) return canCast(ws, 'ult').ok;
  return !!sk.tap && (costOf(ws, 'tap') > 0 || sk.tap.cd > 0) && canCast(ws, 'tap').ok;
}

function v2Tick(ws, dt, g) {
  const s = ws.sp, p = ws.def.special;
  for (const k in s.cd) if (s.cd[k] > 0) s.cd[k] = Math.max(0, s.cd[k] - dt);
  for (const [k, c] of Object.entries(p.meters || {})) {
    if (c.regen) meterAdd(ws, k, c.regen * dt, true);
    if (c.decay && g.time - (s.gainAt[k] ?? -99) > (c.decayDelay ?? 2)) s.m[k] = Math.max(0, s.m[k] - c.decay * dt);
  }
  // ready (§1.7.1 beat 7): fanfare once, then a soft reminder every 2.5 s while held
  if (!isReady(ws)) { s.readyN = false; s.readyT = 0; return; }
  if (g.arsenal?.current !== ws) return;
  if (!s.readyN) { s.readyN = true; s.readyT = 0; readyFanfare(ws, g); }
  else if ((s.readyT += dt) >= READY_EVERY) { s.readyT = 0; if (g.hud?.settings?.readyReminder !== false) { g.audio?.play(ws.def.premium?.ready?.sfx || 'special_ready', { volume: 0.25 }); g.hud?.readyPulse?.(ws); } }
}

function readyFanfare(ws, g) {
  g.audio?.play(ws.def.premium?.ready?.sfx || 'special_ready');
  haptic(25); setTimeout(() => haptic(25), 105);   // ready_double (§1.13)
  g.hud?.onSkillReady?.(ws);
}

function v2Update(ws, dt, g) {
  const s = ws.sp, inp = g.input?.state;
  s.heldT += dt;
  if (!inp || !g.status?.alive) { s.star = null; s.waitF = 0; return; }
  if (s.star) {
    const t = nowS() - s.star.t0;
    if (!inp.held.special || t >= HOLD_T) {
      s.star = null;
      if (inp.held.special) longPress(ws);
      else if (ws.def.special.skills?.ult && canCast(ws, 'ult').ok && !g.touch) s.waitF = QF_T;
      else castSkill(ws, 'tap');
    }
  }
  if (s.waitF > 0) {
    // desktop "Q then F": the F is ours, not an inspect (the Arsenal reads it after this update)
    if (inp.pressed.inspect) { inp.pressed.inspect = false; s.waitF = 0; castSkill(ws, 'ult'); }
    else if ((s.waitF -= dt) <= 0) { s.waitF = 0; castSkill(ws, 'tap'); }
  }
}

function starDown(ws) {
  const s = ws.sp, sk = ws.def.special.skills || {};
  if (s.star || s.waitF > 0) return;
  if (!sk.hold && !(sk.ult && canCast(ws, 'ult').ok)) { castSkill(ws, 'tap'); return; }
  s.star = { t0: nowS() };
}
function longPress(ws) {
  const sk = ws.def.special.skills;
  if (sk.ult && canCast(ws, 'ult').ok) castSkill(ws, 'ult');
  else if (sk.hold) castSkill(ws, 'hold');
  else castSkill(ws, 'tap');
}

function deny(ws, slot, c) {
  const g = ws.game, s = ws.sp;
  if (c.why === 'none' && slot === 'tap' && ws.def.special.skills?.ult) c = { ...c, why: 'hold' };   // ult-only: hint the long-press
  if (g.time - (s.denyAt ?? -9) > 0.25) { s.denyAt = g.time; g.audio?.play('ui_deny', { volume: 0.5 }); }
  g.hud?.onSkillDenied?.(ws, slot, c);
}

/**
 * Casts the weapon's skill in `slot` locally (cost, cooldown, start, network event). opts.free skips cost and
 * cooldown (crisis armour, passives). Returns the running instance or null.
 */
export function castSkill(ws, slot, opts = {}) {
  const g = ws?.game, sk = ws && skillDef(ws.def, slot);
  if (!g || !ws.sp?.v2) return null;
  if (!opts.free) {
    const c = canCast(ws, slot);
    if (!c.ok || !g.status?.alive) { deny(ws, slot, c.ok ? { ok: false, why: 'dead', need: 1 } : c); return null; }
    const key = costKey(ws, slot), cost = costOf(ws, slot);
    if (key && cost > 0) ws.sp.m[key] -= cost;
    if (sk.cd) ws.sp.cd[slot] = sk.cd;
  }
  if (!sk || !(SKILLS[sk.id] || sk.id === 'crisis')) return null;
  const cam = g.camera;
  cam.getWorldDirection(_d);
  const ev = { type: 'skill', id: sk.id, w: ws.def.id, slot, seed: (Math.random() * 2147483647) | 0,
    pos: [cam.position.x, cam.position.y, cam.position.z], dir: [_d.x, _d.y, _d.z], by: g.localId, ph: 0 };
  const k = startSkill(g, ev, { ws, local: true });
  if (!k) return null;
  if (sk.hold || k.impl.channel) k.held = slot === 'alt' ? 'alt' : 'special';
  g.net?.sendSkill?.(ev);
  g.hud?.onSkillCast?.(ws, slot, sk, k);
  if (slot !== 'crisis') haptic(slot === 'ult' ? 40 : 15);   // thud for the ultimate (§1.13)
  return k;
}

class SkillInst {
  constructor(g, ev, impl, def, ws, local) {
    const sk = skillDef(def, ev.slot) || Object.values(def.special.skills || {}).find((x) => x.id === ev.id) || {};
    this.game = g; this.ev = ev; this.id = ev.id; this.slot = ev.slot; this.impl = impl; this.def = def; this.ws = ws;
    this.local = local; this.by = ev.by; this.key = ev.by + ':' + ev.seed;
    this.p = { ...impl.defaults, ...sk };
    this.rng = mulberry32(ev.seed);
    this.pos = new THREE.Vector3().fromArray(ev.pos);
    this.dir = new THREE.Vector3().fromArray(ev.dir).normalize();
    this.hex = paletteOf(def);
    this.col = { core: hdr(this.hex.core, 4), rim: hdr(this.hex.rim, 3), mote: hdr(this.hex.mote, 2.5), accent: hdr(this.hex.accent, 2), trim: hdr(this.hex.trim, 1.5), base: hdr(this.hex.base, 1) };
    this.at = null;
    if (impl.aim) {
      // the world is static and identical on every client: the same ray finds the same point
      const range = this.p.range ?? 40;
      const hit = g.world?.collision?.raycast(this.pos, this.dir, range);
      this.at = this.pos.clone().addScaledVector(this.dir, hit ? Math.max(0, hit.dist - 0.05) : range);
      this.at.y = this.floorY(this.at);
    }
    this.t = 0; this.data = {}; this.done = false; this.held = null; this.level = 1;
    this.dur = this.p.dur ?? impl.dur ?? (impl.channel || sk.hold ? (local ? Infinity : 8) : 0.8);
  }
  /** Caster eye position and aim (live: the local camera / the teammate's replicated pose). */
  caster(pos = new THREE.Vector3(), dir = new THREE.Vector3()) {
    const g = this.game;
    if (this.local) { pos.copy(g.camera.position); g.camera.getWorldDirection(dir); return pos; }
    const r = g.net?.remotes?.get(this.by);
    if (!r) { pos.copy(this.pos); dir.copy(this.dir); return pos; }
    pos.set(r.pos.x, r.pos.y + 1.6, r.pos.z);
    const cp = Math.cos(r.pitch || 0);
    dir.set(-Math.sin(r.yaw) * cp, -Math.sin(r.pitch || 0), -Math.cos(r.yaw) * cp);
    return pos;
  }
  feet(out = new THREE.Vector3()) {
    const g = this.game;
    if (this.local && g.player) return out.copy(g.player.pos);
    const r = g.net?.remotes?.get(this.by);
    return r ? out.copy(r.pos) : out.set(this.pos.x, this.floorY(this.pos), this.pos.z);
  }
  /** Where first-person effects start: the viewmodel muzzle for the caster, a hand position for the others. */
  muzzle(out = new THREE.Vector3()) {
    const g = this.game;
    if (this.local && g.vm?.socketApparent?.('muzzle', out)) return out;
    this.caster(out, _f);
    return out.addScaledVector(_f, 0.6).add(_c.set(0, -0.25, 0));
  }
  floorY(p) { const y = this.game.world?.collision?.floorBelow?.(_c.set(p.x, p.y + 0.5, p.z), 0.2, 30); return Number.isFinite(y) ? y : p.y; }
  cardText() { return `${(this.def.zh || '').split('．')[0]}．${this.p.zh || this.id}`; }
  _feedback(info, res, t) {
    const g = this.game;
    g.hud?.onHit?.(info, res, t);
    if (this.ws) v2Hit(this.ws, info, res, true);
    if (this.ws) SPECIALS[this.def.special.type]?.onHit?.(this.ws, info, res, t);
  }
  /** Area damage (caster only): falloff toward the edge, knockback away from `c`. Returns the targets hit. */
  hurt(c, r, dmg, { knock = 4, stagger = 1, falloffMin = 0.35, explosive = true, head = false } = {}) {
    const g = this.game;
    if (!this.local || !g.targets) return 0;
    let n = 0;
    for (const t of g.targets.inRadius(c, r)) {
      const f = Math.max(falloffMin, 1 - t.distanceTo(c) / r);
      const point = t.center(new THREE.Vector3());
      const dir = point.clone().sub(c).setY(0);
      if (dir.lengthSq() < 1e-6) dir.set(this.dir.x, 0, this.dir.z);
      dir.normalize();
      const info = { amount: dmg * f * (g.arsenal?.dmgMul ?? 1), part: head ? 'head' : 'body', headshot: head, point, dir, knock: knock * f, stagger, weapon: this.def.id, shooter: g.localId, explosive, skill: this.id };
      this._feedback(info, t.damage(info), t);
      n++;
    }
    return n;
  }
  /** Piercing ray damage (caster only): the first `pierce` targets along the ray. */
  hitRay(from, dir, len, dmg, { pierce = 1, knock = 0.5, stagger = 0.3, headMul = 1.5 } = {}) {
    const g = this.game;
    if (!this.local || !g.targets) return 0;
    const seen = new Set();
    for (const h of g.targets.raycast(from, dir, len)) {
      const z = h.target.zombie || h.target;
      if (seen.has(z)) continue;
      seen.add(z);
      const head = h.part === 'head';
      const info = { amount: dmg * (head ? headMul : 1) * (g.arsenal?.dmgMul ?? 1), part: h.part, box: h.box, headshot: head, point: h.point, normal: h.normal, dir: dir.clone(), dist: h.dist, knock, stagger, weapon: this.def.id, shooter: g.localId, skill: this.id };
      this._feedback(info, h.target.damage(info), h.target);
      if (seen.size >= pierce) break;
    }
    return seen.size;
  }
}

function runner(g) {
  if (g._skills) return g._skills;
  const R = g._skills = { list: [], auras: [], aura: {}, dm: 1, rl: 1, update: (dt) => runSkills(g, R, dt) };
  g.systems.push(R);
  return R;
}

function lowQ(g) { return (g.renderer?.q?.particles ?? 3000) < 1500; }
function levelFor(R, k) {
  let L = LV[k.p.level ?? k.impl.level] ?? 1;
  const live = R.list.filter((i) => !i.done);
  if (!k.local && L === 4) L = 3;                                                  // teammates see the world version
  if (!k.local && L === 3 && (live.filter((i) => i.level === 3).length >= 2 || lowQ(k.game))) L = 2;
  if (L === 2 && live.filter((i) => i.level === 2 && i.by === k.by).length >= 2) L = 1;
  return L;
}

/** Starts a skill instance from an event (local cast or network replay). ev.ph = 1 ends a channelled one. */
export function startSkill(g, ev, { ws = null, local = false } = {}) {
  const R = runner(g);
  if (ev.ph === 1) { const k = R.list.find((i) => i.key === ev.by + ':' + ev.seed); if (k) endSkill(k); return null; }
  // (crisis.js sits in an import cycle with this module: its skill is looked up lazily)
  const impl = SKILLS[ev.id] || (ev.id === 'crisis' ? CRISIS_SKILL : null), def = ws?.def || WEAPONS[ev.w];
  if (!impl || !def?.special) return null;
  const k = new SkillInst(g, ev, impl, def, ws, local);
  k.level = levelFor(R, k);
  R.list.push(k);
  ws?.sp?.run?.add(k);
  try { impl.start?.(k); } catch (e) { console.warn('skill start', ev.id, e); }
  return k;
}
/** A teammate's skill event (NetSync): visuals + own-player effects, never the caster's own echo. */
export function replaySkill(g, ev) { return ev.by === g.localId ? null : startSkill(g, ev, { local: false }); }

export function endSkill(k) {
  if (k.done) return;
  k.done = true;
  try { k.impl.end?.(k); } catch (e) { console.warn('skill end', k.id, e); }
  if (k.local && k.held) k.game.net?.sendSkill?.({ ...k.ev, ph: 1 });
  k.ws?.sp?.run?.delete(k);
}

function runSkills(g, R, dt) {
  for (let i = R.list.length - 1; i >= 0; i--) {
    const k = R.list[i];
    if (k.done) { R.list.splice(i, 1); continue; }
    k.t += dt;
    let alive = true;
    if (k.held && k.local) {
      // channel: while the button is held, the weapon in hand and the meter lasts
      if (!g.input?.state.held[k.held] || !g.status?.alive || g.arsenal?.current !== k.ws) alive = false;
      const key = k.p.drain && k.ws && costKey(k.ws, k.slot);
      if (key) { const m = k.ws.sp.m; m[key] -= k.p.drain * dt; if (m[key] <= 0) { m[key] = 0; alive = false; } }
    }
    try { if (alive && k.impl.update?.(k, dt) === false) alive = false; } catch (e) { console.warn('skill update', k.id, e); alive = false; }
    if (k.t >= k.dur) alive = false;
    if (!alive) endSkill(k);
  }
  auraUpdate(g, R, dt);
}

// ------------------------------------------------------------------------------------------- team auras (§1.4)
/** Timed aura at a point (skills call it on every client; each applies it to its own player when in range). */
export function addAura(g, { type, mul = 1, radius = 6, pos, dur = 6, by = g.localId, follow = false }) {
  runner(g).auras.push({ type, mul, radius, pos: pos ? new THREE.Vector3().copy(pos) : null, t: dur, by, follow });
}
/** Product of the auras on the local player for `type` ('regen' sums HP/s). */
export function auraMul(g, type) { return g?._skills?.aura?.[type] ?? (type === 'regen' ? 0 : 1); }
export function auraState(g) { return g?._skills?.aura || {}; }

function auraUpdate(g, R, dt) {
  const me = g.player?.pos, acc = {};
  const add = (a) => { if (a.type === 'regen') acc.regen = (acc.regen || 0) + a.mul; else acc[a.type] = (acc[a.type] ?? 1) * a.mul; };
  if (me && g.status?.alive) {
    const cur = g.arsenal?.current, a0 = cur?.def.premium?.aura;
    // 'held' / 'ready' are applied here; any other `when` (M07 'source': ice line / orb, 'skill'...) is the
    // weapon's own business through addAura()
    if (a0 && ((a0.when ?? 'held') === 'held' || a0.when === 'ready' && cur.sp?.v2 && isReady(cur))) add(a0);
    for (const r of g.net?.remotes?.values?.() || []) {
      const a = WEAPONS[r.weaponId]?.premium?.aura;
      if (a && (a.when ?? 'held') === 'held' && r.alive && r.pos.distanceTo(me) <= (a.radius ?? 4)) add(a);
    }
    for (const a of R.auras) {
      if (a.follow) { const r = a.by === g.localId ? g.player : g.net?.remotes?.get(a.by); if (r) a.pos = (a.pos || new THREE.Vector3()).copy(r.pos); }
      if (!a.pos || a.pos.distanceTo(me) <= a.radius) add(a);
    }
  }
  for (let i = R.auras.length - 1; i >= 0; i--) if ((R.auras[i].t -= dt) <= 0) R.auras.splice(i, 1);
  R.aura = acc;
  // damage / reload auras ride on the Arsenal multipliers (the match level-ups are the base); written only while
  // an aura is or was active so nothing else that sets them is overridden
  const ar = g.arsenal, dm = acc.dmg ?? 1, rl = acc.reloadSpeed ?? 1;
  if (ar && (dm !== 1 || rl !== 1 || dm !== R.dm || rl !== R.rl)) {
    ar.dmgMul = (g.match?.dmgMul ?? 1) * dm;
    ar.reloadMul = (g.match?.reloadMul ?? 1) / rl;
  }
  R.dm = dm; R.rl = rl;
  if (acc.regen && g.status?.alive) g.status.heal(acc.regen * dt);
}

// ---------------------------------------------------------------------------------------------- the v2 handler
const _v2 = new WeakMap(), _warnedEv = new Set();
function makeV2(p) {
  const ov = () => SPECIALS[p.type] || {};
  const h = {
    v2: true,
    init(ws) { v2Init(ws); ov().init?.(ws); attach(ws); },
    modifiers(ws) { return ov().modifiers?.(ws) || {}; },
    onFire(ws, ctx) { ov().onFire?.(ws, ctx); },
    onHit(ws, info, res, target) { v2Hit(ws, info, res); ov().onHit?.(ws, info, res, target); },
    onSpecial(ws) { starDown(ws); },
    onReloadInput(ws, g) { return ov().onReloadInput?.(ws, g) || false; },
    update(ws, dt, g) { v2Update(ws, dt, g); ov().update?.(ws, dt, g); },
    tick(ws, dt, g) { v2Tick(ws, dt, g); ov().tick?.(ws, dt, g); },
    dispose(ws, g) { for (const k of [...ws.sp.run]) if (k.held) endSkill(k); ov().dispose?.(ws, g); },
    meter(ws, g) { const m = v2Meters(ws, g)[0]; return m ? { ...m, hud: m.type } : null; },
    // clip events the Arsenal does not know (parry windows, custom hits...) go to the weapon's overrides
    onClipEvent(ws, name, arg, g) { const f = ov().onClipEvent; if (f) return f(ws, name, arg, g); if (!_warnedEv.has(name)) { _warnedEv.add(name); console.warn(`[special ${p.type}] clip event '${name}' has no onClipEvent`); } },
  };
  // ◎ stays the scope / ADS unless the weapon has an alt skill
  if (p.skills?.alt) h.onAlt = (ws, g, pressed) => { if (pressed) castSkill(ws, 'alt'); return true; };
  return guard(h);
}

function v2Meters(ws, g) {
  const p = ws.def.special, s = ws.sp, hex = paletteOf(ws.def), types = ws.def.premium?.meters || [], ov = SPECIALS[p.type];
  return Object.entries(p.meters || {}).map(([key, c], i) => {
    const max = c.max ?? 100, raw = s.m[key];
    const skill = Object.keys(p.skills || {}).find((sl) => costKey(ws, sl) === key);
    const m = { key, type: c.hud || types[i] || 'bar', value: raw / max, raw, max, label: c.label || c.zh || key,
      color: c.color || (key === 'ult' ? hex.rim : hex.core), segments: c.segments ?? (c.hud === 'segments' || types[i] === 'segments' ? max : 0),
      window: c.window, ready: skill ? canCast(ws, skill).ok : raw >= max, ult: key === costKey(ws, 'ult') };
    return ov?.meterInfo?.(ws, key, m, g) || m;
  });
}

/**
 * Everything the HUD / touch controls need about the held weapon's special:
 *   { v1?, tier, element, hex (palette), crosshair, skin, killMark, meters: [{ key, type, value, raw, max, label,
 *     color, ready, segments, window, ... }], star: { has, tap, ult, ultFrac, holdFrac, need, cd, active, why } | null,
 *     alt: { has, ok, active } | null, crisis }
 */
export function hudInfo(ws, g = ws?.game) {
  const h = specialOf(ws);
  if (!h || !ws.sp) return null;
  // HUD and touch both ask every frame: one build per frame
  if (ws._hiT === g?.time && ws._hi) return ws._hi;
  ws._hiT = g?.time;
  return (ws._hi = buildHud(h, ws, g));
}
function buildHud(h, ws, g) {
  const def = ws.def, pr = def.premium || {};
  const base = { tier: def.tier || pr.tier || 'anti', element: elementOf(def), hex: paletteOf(def), crosshair: pr.crosshair || null,
    skin: pr.dmgSkin || null, killMark: pr.killMark || null, crisis: crisisState(g) };
  if (!ws.sp.v2) {
    const m = h.meter?.(ws, g);
    const star = h.onSpecial ? { has: true, tap: !!m?.ready, ult: false, ultFrac: m?.value ?? 0, holdFrac: 0, need: m?.ready ? 0 : 1 - (m?.value ?? 0), cd: 0, active: !!m?.active } : null;
    if (m && !pr.palette) base.hex = { ...base.hex, core: m.color, rim: m.color };
    return { ...base, v1: true, meters: m ? [{ key: 'm', type: m.hud || 'bar', raw: m.value, max: 1, ...m }] : [], star, alt: h.onAlt ? { has: true, ok: true, active: false } : null };
  }
  const s = ws.sp, sk = def.special.skills || {};
  const tap = canCast(ws, 'tap'), ult = canCast(ws, 'ult');
  const uk = costKey(ws, 'ult');
  const running = [...s.run].filter((k) => !k.done);
  const star = sk.tap || sk.hold || sk.ult ? {
    has: true, tap: tap.ok, ult: ult.ok, ultFrac: uk ? meterFrac(ws, uk) : ult.ok ? 1 : 0,
    holdFrac: s.star ? Math.min(1, (nowS() - s.star.t0) / HOLD_T) : 0, need: sk.tap ? tap.need : ult.need,
    cd: sk.tap?.cd ? (s.cd.tap || 0) / sk.tap.cd : 0, why: sk.tap ? tap.why : ult.why,
    active: running.some((k) => k.slot !== 'alt'), ultActive: running.some((k) => k.slot === 'ult'),
  } : null;
  const alt = sk.alt ? { has: true, ok: canCast(ws, 'alt').ok, active: running.some((k) => k.slot === 'alt') } : null;
  return { ...base, meters: v2Meters(ws, g), star, alt, ready: isReady(ws) };
}

/** Weapon state for the premium shader / ready layer (§1.5.5): charge 0..1, ready, active, ult, reloading. */
export function chargeState(ws, g = ws?.game) {
  const h = specialOf(ws);
  if (!h || !ws.sp) return null;
  const reloading = g?.arsenal?.current === ws && g.arsenal.state === 'reload';
  if (!ws.sp.v2) { const m = h.meter?.(ws, g); return { charge: m?.value ?? 0, ready: !!m?.ready, active: !!m?.active, ult: false, reloading }; }
  const sk = ws.def.special.skills || {}, key = costKey(ws, sk.ult ? 'ult' : 'tap');
  const run = [...ws.sp.run].filter((k) => !k.done);
  return { charge: key ? meterFrac(ws, key) : 0, ready: isReady(ws), active: run.length > 0, ult: run.some((k) => k.slot === 'ult'), reloading };
}

const _v1 = new Set();
export function specialOf(ws) {
  const p = ws?.def?.special;
  if (!p) return null;
  if (p.skills || p.meters) {
    let h = _v2.get(p);
    if (!h) _v2.set(p, h = makeV2(p));
    return h;
  }
  const h = SPECIALS[p.type];
  if (h && !_v1.has(h)) { _v1.add(h); guard(h); }
  return h || null;
}

// ---------------------------------------------------------------------------------------- generic skills
// Reusable building blocks (also the templates for weapon-specific skills): the premium FX kit (fx.sigils,
// fx.motes, fx.summons, fx.beam) when present, stand-ins built from the base effects otherwise.

const _w = new THREE.Vector3();
function ringBurst(k, c, r, { life = 0.45, thin = true, color = k.col.rim } = {}) {
  k.game.fx?.shockwave(_w.set(c.x, c.y + 0.06, c.z), { normal: UP, r0: 0.2, r1: r, life, color, thin });
}
function groundDust(k, c, r, n = 8) {
  const fx = k.game.fx;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.283 + k.rng() * 0.5;
    fx?.knockDust(_w.set(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r), _e.set(-Math.cos(a) * 5, 0, -Math.sin(a) * 5), 1);
  }
}
function motes(k, c, n, { r = 1, up = 2.5, life = 1.2, color = k.col.mote, size = 0.05 } = {}) {
  const P = k.game.fx?.particles;
  for (let i = 0; i < n; i++) {
    const a = k.rng() * 6.283, d = Math.sqrt(k.rng()) * r;
    P?.spawn({ additive: true, x: c.x + Math.cos(a) * d, y: c.y + 0.2 + k.rng() * 0.6, z: c.z + Math.sin(a) * d, vx: (k.rng() - 0.5) * 0.6, vy: up * (0.5 + k.rng()), vz: (k.rng() - 0.5) * 0.6,
      life: life * (0.6 + k.rng() * 0.6), size, size1: size * 0.3, color: [...color, 1], color1: [color[0] * 0.4, color[1] * 0.4, color[2] * 0.4, 0], frame: FRAME.glow, drag: 1.2 });
  }
}

// 新星 radial blast around the caster (or at the aim point with p.at = 'aim'). L2.
registerSkill('nova', {
  level: 'L2', aim: true, defaults: { r: 4.5, dmg: 180, knock: 7, zh: '震爆' },
  start(k) {
    const g = k.game, fx = g.fx, p = k.p;
    const c = p.at === 'aim' && k.at ? k.at.clone() : k.feet();
    ringBurst(k, c, p.r, { life: 0.5 });
    ringBurst(k, c, p.r * 0.65, { life: 0.32, thin: false, color: k.col.core });
    fx?.sparkBurst(_e.set(c.x, c.y + 0.7, c.z), { color: k.col.core, color1: k.col.rim, count: k.level >= 2 ? 26 : 10, speed: 9, glow: 0.9 });
    fx?.lights?.flash(_e.set(c.x, c.y + 1.2, c.z), k.hex.core, 40, p.r * 2.5, 0.3);
    if (k.level >= 2) { groundDust(k, c, p.r * 0.55, 10); motes(k, c, 14, { r: p.r * 0.6 }); fx?.decals?.add(c, UP, { frame: DECAL.scorch, size: p.r * 0.7, tint: DECAL_TINT.scorch, life: 4 }); }
    g.audio?.play(p.sfx || 'explosion_small', { pos: c, volume: 0.8 });
    if (k.local) { k.hurt(c, p.r, p.dmg, { knock: p.knock }); g.addShake(0.3); g.hitStop?.(0.05); }
  },
});

// 反災 series replays (antical.js): teammates see a 雙相 overphase start and its split tracers.
registerSkill('overphase_fx', OVERPHASE_FX);

// 光束 channelled beam from the muzzle (◎ held). L1. Uses fx.beam when the FX kit provides it.
registerSkill('beam', {
  level: 'L1', channel: true, defaults: { dps: 260, range: 40, pierce: 3, width: 0.05, tick: 0.1, zh: '光束' },
  start(k) { k.data.acc = 0; k.data.fxT = 0; k.game.audio?.play(k.p.sfx || 'special_activate', { volume: 0.6 }); k.data.loop = k.game.audio?.play(k.p.loop || 'beam_loop', { loop: true, volume: 0.5 }); },
  update(k, dt) {
    const g = k.game, eye = k.caster(_c, _d);
    const hit = g.world?.collision?.raycast(eye, _d, k.p.range);
    const len = hit ? hit.dist : k.p.range;
    const end = _e.copy(eye).addScaledVector(_d, len), m = k.muzzle(_f);
    if (typeof g.fx?.beam === 'function') {
      if (!k.data.beam) k.data.beam = g.fx.beam(m.clone(), end.clone(), { core: k.col.core, glow: k.col.rim, wCore: k.p.width * 0.4, wGlow: k.p.width * 2, life: Infinity });
      k.data.beam?.set?.(m, end);
    } else if ((k.data.fxT -= dt) <= 0) {
      k.data.fxT = 1 / 30;
      g.fx?.glowTracer(m.clone(), end.clone(), { color: k.col.core, glow: k.col.rim, width: k.p.width, length: Math.max(1, len), speed: 1200, start: 0 });
    }
    if (k.rng() < 0.5) g.fx?.sparkBurst(end.clone(), { color: k.col.core, color1: k.col.rim, count: 2, speed: 4, glow: 0.2 });
    if (k.local && (k.data.acc += dt) >= k.p.tick) { k.data.acc -= k.p.tick; k.hitRay(eye, _d, len, k.p.dps * k.p.tick, { pierce: k.p.pierce, knock: 0.3, stagger: 0.4 }); }
  },
  end(k) { k.data.loop?.stop?.(0.15); k.data.beam?.stop?.(); k.data.beam?.dispose?.(); },
});

// 光環 timed team aura around the caster (every client applies it to its own player). L1.
registerSkill('aura', {
  level: 'L1', defaults: { type: 'dmg', mul: 1.15, radius: 6, dur: 8, zh: '護陣' },
  start(k) {
    const c = k.feet(), p = k.p;
    addAura(k.game, { type: p.type, mul: p.mul, radius: p.radius, pos: c, dur: p.dur, by: k.by, follow: true });
    ringBurst(k, c, p.radius, { life: 0.7 });
    motes(k, c, 18, { r: p.radius * 0.5, up: 1.5 });
    k.game.audio?.play(p.sfx || 'special_activate', { pos: c });
  },
});

// 召喚 generic 5-beat summon ultimate (§1.7.3): cast -> sigil -> descent -> body (hits) -> exit. L3 (L4 for the caster
// with p.screen). The FX kit's summon / sigil / pillar components replace the particle stand-ins when present.
registerSkill('summon', {
  level: 'L3', aim: true, defaults: { r: 5.5, dmg: 260, hits: 3, dur: 3.4, range: 30, zh: '天降' },
  start(k) {
    const g = k.game, c = (k.at || k.feet()).clone();
    k.data.c = c; k.data.beat = 0; k.data.hit = 0;
    if (k.local) { g.hud?.card?.(k.cardText(), { color: k.hex.rim, sub: k.def.en }); g.addShake(0.12); }
    if (k.local && k.level >= 4) g.hud?.border?.(k.hex.rim, 0.32, k.dur);
    g.audio?.play(k.p.sfxRise || 'special_activate', k.local ? {} : { pos: c });
  },
  update(k) {
    const g = k.game, fx = g.fx, c = k.data.c, t = k.t, T = k.dur, p = k.p, d = k.data;
    if (d.beat < 1 && t >= 0.2) {          // ② sigil
      d.beat = 1;
      if (fx?.sigils?.sigil) d.sigil = fx.sigils.sigil(c, { design: p.sigil || 'clouds', radius: p.r, color: k.col.core, color1: k.col.rim, life: T - 0.1, seed: k.ev.seed });
      else { ringBurst(k, c, p.r, { life: 1.2 }); ringBurst(k, c, p.r * 0.7, { life: 1.6, color: k.col.core }); motes(k, c, 20, { r: p.r, up: 0.8, life: 1.6, size: 0.04 }); }
    }
    if (d.beat < 2 && t >= 0.35 && k.level >= 3) {   // ③ descent
      d.beat = 2;
      if (fx?.sigils?.pillar) fx.sigils.pillar(c, { radius: p.r * 0.3, height: 14, color: k.col.core, life: 0.8 });
      else for (let i = 0; i < 9; i++) fx?.particles?.spawn({ additive: true, x: c.x, y: c.y + i * 1.1, z: c.z, life: 0.5 + i * 0.03, size: 2.2 - i * 0.12, size1: 0.6, color: [...k.col.core, 1], color1: [...k.col.rim, 0], frame: FRAME.glow });
      fx?.lights?.flash(_e.set(c.x, c.y + 2, c.z), k.hex.core, 80, p.r * 3, 0.5);
      if (k.local) g.addShake(0.25);
      if (typeof fx?.summons?.ghost === 'function') d.ghost = fx.summons.ghost(c, { kind: p.ghost, color: k.col.rim, life: T - 0.8, seed: k.ev.seed });
    }
    // ④ body: `hits` pulses spread over 0.8 s .. T - 0.6 s
    const b0 = 0.8, b1 = Math.max(b0 + 0.1, T - 0.6), due = t < b0 ? 0 : Math.min(p.hits, Math.floor((t - b0) / ((b1 - b0) / p.hits)) + 1);
    while (d.hit < due) {
      d.hit++;
      ringBurst(k, c, p.r, { life: 0.4, thin: false });
      groundDust(k, c, p.r * 0.5, k.level >= 3 ? 8 : 4);
      fx?.sparkBurst(_e.set(c.x, c.y + 1, c.z), { color: k.col.core, color1: k.col.rim, count: 14, speed: 8, glow: 1.2 });
      g.audio?.play(p.sfxHit || 'explosion_small', { pos: c, volume: 0.7 });
      if (k.local) { k.hurt(c, p.r, p.dmg, { knock: 5 }); g.addShake(0.2); g.hitStop?.(0.06); }
    }
    if (k.level >= 3 && !d.ghost && t > 0.5 && t < b1 && k.rng() < 0.6) {   // stand-in body: a slow spiral of light
      const a = t * 4 + k.rng() * 0.4, rr = p.r * 0.45;
      fx?.particles?.spawn({ additive: true, x: c.x + Math.cos(a) * rr, y: c.y + 0.5 + (t % 1) * 3, z: c.z + Math.sin(a) * rr, vy: 1.2, life: 0.7, size: 0.35, size1: 0.1, color: [...k.col.mote, 1], color1: [...k.col.rim, 0], frame: FRAME.glow });
    }
    if (d.beat < 3 && t >= b1) {           // ⑤ exit
      d.beat = 3;
      ringBurst(k, c, p.r * 1.4, { life: 0.6 });
      motes(k, c, k.level >= 3 ? 30 : 12, { r: p.r * 0.7, up: 3, life: 1.6 });
      fx?.motes?.burst?.(p.mote || 'goldpaper', _e.set(c.x, c.y + 1.6, c.z), k.level >= 3 ? 22 : 8, { seed: k.ev.seed, speed: 3, spread: 1, radius: p.r * 0.4 });
      fx?.decals?.add(c, UP, { frame: DECAL.scorch, size: p.r, tint: DECAL_TINT.scorch, life: 3 });
      g.audio?.play(p.sfxEnd || 'special_end', { pos: c });
    }
  },
  end(k) { k.data.sigil?.stop?.(); k.data.ghost?.stop?.(); },
});
