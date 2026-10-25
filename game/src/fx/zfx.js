// CSO zombie-mode effects (06b §5–§7, §9.3–§9.6) on top of the CS2 layer in fx.js: whole-body status shells,
// ground rings, the bloater's layered gas burst (deflates on a headshot kill), spitter acid + pools, screamer
// heal aura + scream wave, psycho smoke, brute charge, crawler / runner cues, elite markers, every boss move
// (Butcher, Colossus / Abyss Wing), supply-crate glow and the level-up flourish.
// Visual only: gameplay stays in zombies/* and match/*. Everything here runs on the host and on clients alike
// (driven by Zombie events the NetSync relays already replay there: spit / scream / explode, boss onFx, anim,
// loco and death events). Counts scale with fx.k (renderer.q.particles); colours are linear HDR.
// API (game.fx.zfx):
//   status(z, kind, dur) / clearStatus(z, kind) / killFlash(z)      whole-body shell, SHELL kinds below
//   overlay(kind, amt, dur, col)                                     local full-screen frame via fx.overlay (fxkit)
//   ground (GroundFX: add(kind, pos, opts)), marks (Marks: add(kind, opts)), pillars (Pillars: add(pos, opts))
//   zombies: bruteCharge, chargeImpact, leapCue, spitWarn, spitTrail, acidSplash, hazard / hazardTick,
//            bloaterBurst, bloaterDeflate, screamWave, healPulse, smokeBurst, shieldMark
//   bosses:  bossDeath, roar, quake, swipe, rockTrail, rockImpact, rageAura, stunned, wallSlam, sporeLaunch, sporeTrail,
//            sporeBurst, breathCharge, breath, wingGust, takeoff, metamorph, crash, tendril, screech, summonIn
//   match:   supplyGlow, supplyLand, supplyOpen, levelUp
// patchShell(root) (export): per-zombie status-shell material copies, called by ZombieManager.spawn.
import * as THREE from 'three';
import { FRAME, DECAL, RAMP } from './atlas.js';
import { DECAL_TINT } from './decals.js';
import { GroundFX, GROUND } from './groundfx.js';
import { Marks, Pillars, MARK } from './meshfx.js';

export { GROUND, MARK };

const R = Math.random;
const rr = (a, b) => a + (b - a) * R();
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _t = new THREE.Vector3();
const _h = new THREE.Vector3();

// ------------------------------------------------------------------ status shells (06b §9.3.3)
// col HDR, amt, pulse Hz / depth (flicker = random), fres 0 = CSO flat glow shell .. 1 = rim only, exp = rim
// sharpness (default 2; bosses 2.6), prio, decay (amount follows the remaining time: one-shot flashes).
// Bosses never wear a flat shell (fres >= 0.85) and their rims fade with distance (_rimFar): a 4-7 m model under a
// flat or wide HDR shell read as one pink blob past 20 m (QA: enraged Butcher, Colossus metamorphosis).
export const SHELL = {
  kill: { col: [1.2, 1.0, 0.9], amt: 1, fres: 0.6, prio: 9, decay: true },
  healed: { col: [0.4, 2.4, 0.6], amt: 1, fres: 0.8, prio: 8, decay: true },
  hardened: { col: [1.6, 0.2, 0.1], amt: 0.7, fres: 0, prio: 7 },
  // boss transitions (metamorphosis, crash landing): can't be hurt. A cool violet-white rim that breathes
  invuln: { col: [0.75, 0.62, 1.35], amt: 0.42, hz: 2.2, depth: 0.3, fres: 1, exp: 3.4, prio: 7 },
  // the moment a boss enrages: a hot rim flash that settles into `rage`
  rageFlash: { col: [2.0, 0.42, 0.1], amt: 0.85, fres: 1, exp: 2.2, prio: 7, decay: true },
  berserk: { col: [2.2, 0.15, 0.12], amt: 0.9, hz: 4, depth: 0.3, fres: 0, prio: 6 },
  burning: { col: [2.6, 0.9, 0.15], amt: 0.5, hz: 9, depth: 0.45, flicker: true, fres: 0.6, prio: 5 },
  // M03 灼羽 (畢方 featherburn, 鬼車 ghostfire, hit info.burnFx): a thin flickering rim only, under the elite rim
  // (prio 1): the burn reads through the body flames and rising feather licks, never a translucent orange body.
  // The amount scales with the stack count (status(z, kind, dur, mul))
  featherburn: { col: [2.4, 0.95, 0.2], amt: 0.3, hz: 8, depth: 0.35, flicker: true, fres: 0.97, exp: 2.6, prio: 1 },
  ghostfire: { col: [1.5, 0.45, 2.7], amt: 0.3, hz: 7, depth: 0.35, flicker: true, fres: 0.97, exp: 2.6, prio: 1 },
  // M03 kill: a warm rim flash instead of the white body flash (the corpse catches fire, it does not turn to glass)
  emberkill: { col: [2.8, 1.1, 0.25], amt: 0.6, fres: 0.95, exp: 1.8, prio: 9, decay: true },
  // X02 kill: a star-blue rim flash (a pack cut down at once must not turn into a crowd of white glass bodies)
  starkill: { col: [0.9, 1.5, 3.4], amt: 0.45, fres: 0.97, exp: 2.6, prio: 9, decay: true },
  // X05 kill (KE_CLEAVE): a molten crimson rim on the cut body (smouldering, not a white flash)
  cleavekill: { col: [2.8, 0.42, 0.16], amt: 0.55, fres: 0.95, exp: 2.0, prio: 9, decay: true },
  // X04 連霆 / KE_THUNDER: a flickering cold-white rim (electrocuted), never a solid blue body
  shocked: { col: [1.4, 2.6, 3.6], amt: 0.42, hz: 22, depth: 0.5, flicker: true, fres: 0.95, exp: 2.2, prio: 6 },
  frozen: { col: [0.8, 1.8, 2.6], amt: 0.5, fres: 1, prio: 5 },
  poisoned: { col: [0.6, 1.6, 0.2], amt: 0.4, hz: 2, depth: 0.3, fres: 0.7, prio: 4 },
  // enraged boss: a thin ember-red rim; the readable cue is the model's own vein glow + embers (_rageStep)
  rage: { col: [1.25, 0.2, 0.06], amt: 0.42, hz: 1.4, depth: 0.3, fres: 1, exp: 3.4, prio: 3 },
  elite: { col: [1.5, 0.45, 2.4], amt: 0.45, hz: 1.2, depth: 0.35, fres: 1, prio: 2 },
};

const SHELL_FRAG = /* glsl */`
#include <emissivemap_fragment>
{
  // zombie status shell (06b §9.1 #2): flat CSO glow (fres 0) .. rim light (fres 1)
  float zfr = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), uShellExp);
  totalEmissiveRadiance += uShellCol * uShellAmt * mix(1.0, zfr, uShellFres);
  diffuseColor.rgb *= 1.0 - min(uShellAmt, 1.0) * (1.0 - uShellFres) * 0.5;   // a flat shell reads as one colour
}`;

/**
 * Gives every lit material under `root` (LOD meshes included) a per-zombie copy carrying the status-shell term.
 * One shared program per material setup (customProgramCacheKey), uniforms per zombie: no extra shader variants
 * once the first zombie compiled. Returns the uniforms { col, amt, fres, exp } that ZFX drives.
 */
export function patchShell(root) {
  const U = { col: { value: new THREE.Color(0, 0, 0) }, amt: { value: 0 }, fres: { value: 0 }, exp: { value: 2 } };
  const done = new Map();
  const patch = (m) => {
    if (!m || !m.emissive || m.userData.zshell) return m;     // unlit / already patched
    if (done.has(m)) return done.get(m);
    const c = m.clone();
    c.userData = { ...m.userData, zshell: true };
    const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey();   // keep a patch the template may carry
    c.onBeforeCompile = (sh, r) => {
      prev.call(c, sh, r);
      sh.uniforms.uShellCol = U.col; sh.uniforms.uShellAmt = U.amt; sh.uniforms.uShellFres = U.fres; sh.uniforms.uShellExp = U.exp;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uShellCol;\nuniform float uShellAmt;\nuniform float uShellFres;\nuniform float uShellExp;')
        .replace('#include <emissivemap_fragment>', SHELL_FRAG);
    };
    c.customProgramCacheKey = () => 'zshell|' + prevKey;
    done.set(m, c);
    return c;
  };
  root.traverse((o) => { if (o.isMesh && o.material) o.material = Array.isArray(o.material) ? o.material.map(patch) : patch(o.material); });
  return U;
}

// default full-screen overlay colours for the fallback tint (until the fxkit overlay API exists)
const OV_COL = { poison: [0.25, 0.6, 0.05], fire: [1.2, 0.45, 0.08], frost: [0.4, 0.6, 0.8], electric: [0.8, 0.3, 1.4], edge: [1, 0.15, 0.1], tint: [0.5, 0.5, 0.5], zoomBlur: [0, 0, 0] };

export class ZFX {
  constructor(fx) {
    this.fx = fx;
    this.game = fx.game;
    this.P = fx.particles;
    const k = fx.k;
    this.k = k;
    this.ground = new GroundFX(fx.scene, { max: k < 0.5 ? 16 : k < 0.9 ? 32 : 48 });
    this.marks = new Marks(fx.scene, { max: k < 0.5 ? 64 : 128 });
    this.pillars = new Pillars(fx.scene, { max: 12 });
    this._zs = new WeakMap();
    this.time = 0;
    this.timers = [];
    this._ovWarned = false;
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    this.time += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t[0] -= dt;
      if (t[0] <= 0) { this.timers.splice(i, 1); t[1](); }
    }
    this._zombies(dt);
    this.ground.update(dt);
    this.marks.update(dt);
    this.pillars.update(dt);
  }

  /** Runs fn after `sec` seconds of game time (sequenced effects). */
  after(sec, fn) { this.timers.push([sec, fn]); }

  clear() { this.timers.length = 0; this.ground.clear(); this.marks.clear(); this.pillars.clear(); this._zs = new WeakMap(); }

  _n(c) { return this.fx._n(c); }

  /** Floor height under (x, z) near height y (nav grid first, then a short collision ray). */
  groundY(x, z, y) {
    const nav = this.game.zombies?.nav;
    if (nav) { const h = nav.heightAt(x, z, NaN); if (!Number.isNaN(h) && Math.abs(h - y) < 2.5) return h; }
    const col = this.game.world?.collision;
    const h = col ? col.floorBelow(_t.set(x, y + 1, z), 0, 30) : y;
    return Number.isFinite(h) ? h : y;
  }

  /** Distance from the local (living) player to p, or Infinity. */
  _local(p) {
    const pl = this.game.player, st = this.game.status;
    if (!pl || (st && !st.alive)) return Infinity;
    return Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z) + Math.max(0, Math.abs(pl.pos.y - p.y) - 2);
  }

  // ------------------------------------------------------------------ full-screen overlays (06b §9.8)
  /**
   * Full-screen status overlay on the LOCAL player's view: kind 'poison' | 'fire' | 'frost' | 'electric' | 'edge' |
   * 'tint' | 'zoomBlur', amt 0..1, dur s, col (HDR; edge / tint / electric). Adapter to the fxkit overlay API
   * (fx.overlay = fx/overlays.js: status() for the CSO element frames, tint(), border() for edges, radial() speed
   * lines standing in for a zoom blur). Without it: one console warning and a faint flashColor tint instead.
   */
  overlay(kind, amt, dur = 1, col = null) {
    const ov = this.fx.overlay;
    if (ov && typeof ov.status === 'function') {
      try {
        switch (kind) {
          case 'poison': case 'fire': case 'frost': case 'electric': return ov.status(kind, Math.min(1, amt), dur, col ? { color: col } : {});
          case 'tint': return ov.tint(col || [1, 1, 1], Math.min(0.35, amt), dur);
          case 'edge': return ov.border(col || [1, 0.15, 0.1], Math.min(0.35, amt * 0.6), dur, { fadeIn: 0.05, fadeOut: Math.min(0.4, dur * 0.6) });
          case 'zoomBlur': return ov.radial(Math.min(1, amt * 1.6), dur, { color: [0.7, 0.7, 0.75] });
        }
      } catch (e) { console.warn('[zfx] overlay', kind, e); }
    }
    if (!this._ovWarned) { this._ovWarned = true; console.warn('[zfx] fxkit overlay API (fx.overlay) not available: flashColor fallback for', kind); }
    const c = col || OV_COL[kind] || OV_COL.tint;
    const a = Math.min(1, amt) * (kind === 'tint' ? 0.25 : 0.12);
    if (a > 0.004) this.fx.screen.kick([c[0] * a, c[1] * a, c[2] * a], Math.min(1.2, dur));
  }

  // ------------------------------------------------------------------ status shells
  /** Whole-body status tint for a while: kind = SHELL key (kill, healed, hardened, berserk, burning, frozen, poisoned, rage, elite). Infinity = until cleared. */
  status(z, kind, dur = 1, mul) {
    if (!z || !SHELL[kind]) return;
    const s = this._state(z);
    const e = s.st[kind];
    if (e && mul !== undefined) e.mul = mul;            // mul: amount scale (stack counts)
    if (e && e.t >= dur && isFinite(e.dur)) return;
    s.st[kind] = { t: dur, dur, mul: mul ?? e?.mul ?? 1 };
  }
  clearStatus(z, kind) { const s = this._zs.get(z); if (s) delete s.st[kind]; }

  /** Killing-blow flash (06b §9.3.3): warm white, 70 ms. */
  killFlash(z) { this.status(z, 'kill', 0.07); const s = this._state(z); s.amt = 1; }

  _state(z) {
    let s = this._zs.get(z);
    if (!s) {
      s = { st: Object.create(null), px: z.pos.x, pz: z.pos.z, speed: 0, dustT: R() * 0.2, fxT: R() * 0.2, amt: 0, cur: null, leapT: -1, healT: 0, stunT: 0, rage: 0, gustT: 1 };
      this._zs.set(z, s);
      if (z.elite) this._eliteMark(z, s);
    }
    return s;
  }

  _shell(z, s, dt) {
    let best = null, u = 1, mul = 1;
    for (const k in s.st) {
      const e = s.st[k];
      e.t -= dt;
      if (e.t <= 0) { delete s.st[k]; continue; }
      const S = SHELL[k];
      if (!best || S.prio > best.prio) { best = S; u = isFinite(e.dur) ? e.t / e.dur : 1; mul = e.mul ?? 1; }
    }
    const der = z.alive ? this._derived(z, s) : null;
    if (der && (!best || SHELL[der].prio > best.prio)) { best = SHELL[der]; u = 1; mul = 1; }
    const U = z.shell;
    if (!U) return;
    let target = 0;
    if (best) {
      let p = 1;
      if (best.hz) p += best.depth * (best.flicker ? R() * 2 - 1 : Math.sin(this.time * best.hz * TAU));
      target = best.amt * mul * (best.decay ? u : 1) * p;
      if (best !== s.cur) {
        s.cur = best;
        U.col.value.setRGB(best.col[0], best.col[1], best.col[2]);
        // a boss-sized flat shell is one coloured blob: bosses only ever wear a rim, a thin one
        U.fres.value = z.def.boss ? Math.max(0.85, best.fres) : best.fres;
        if (U.exp) U.exp.value = best.exp ?? (z.def.boss ? 2.6 : 2);
        if (best.decay) s.amt = target;
      }
    }
    // the berserk ramp takes ~0.3 s (06b §9.5.3), releases are quicker
    s.amt += (target - s.amt) * Math.min(1, dt * (best?.decay ? 60 : target > s.amt ? 7 : 10));
    if (!best && s.amt < 0.004) { s.amt = 0; s.cur = null; }
    U.amt.value = s.amt * (z.def.boss && s.amt > 0 ? this._rimFar(z) : 1);
  }

  /**
   * Boss rim strength by distance: past ~14 m a model shrinks to a few hundred pixels and a fresnel rim covers most
   * of them (thin limbs are all rim), so it fades to 45 % by ~45 m and the model's albedo / own glow keep reading.
   */
  _rimFar(z) {
    const c = this.game.camera.position;
    const d = Math.hypot(z.pos.x - c.x, z.pos.y + z.height * 0.5 - c.y, z.pos.z - c.z) / Math.max(1, this.game.zoom || 1);
    return THREE.MathUtils.clamp(1 - (d - 14) / 34, 0.45, 1);
  }

  _derived(z, s) {
    if (this._charging(z)) return 'berserk';
    if (z.purgeT > 0) return 'poisoned';
    if (s.rage) return 'rage';
    if (z.elite) return 'elite';
    return null;
  }

  /** Brute / Butcher charge in progress (host: its state; clients: the run loco the host's 'zl' started). */
  _charging(z) {
    if (!z.alive) return false;
    if (z.def.charge) return z.puppet ? z.running && z.action === z.loco : z.state === 'special' && z.special === 'charge';
    return !!(z.def.boss && z.running);
  }

  // ------------------------------------------------------------------ per-zombie continuous cues
  _zombies(dt) {
    const list = this.game.zombies?.list;
    if (!list) return;
    const cam = this.game.camera.position;
    for (const z of list) {
      const s = this._state(z);
      const v = dt > 0 ? Math.hypot(z.pos.x - s.px, z.pos.z - s.pz) / dt : 0;
      s.speed += (Math.min(v, 40) - s.speed) * Math.min(1, dt * 10);
      s.px = z.pos.x; s.pz = z.pos.z;
      this._shell(z, s, dt);
      if (s.deflate >= 0) this._deflateStep(z, s, dt);
      const d2 = (z.pos.x - cam.x) ** 2 + (z.pos.z - cam.z) ** 2;
      const near = d2 < (z.def.boss ? 120 * 120 : 45 * 45);
      if (!z.alive) {
        // corpse starts sinking (manager: 5 s): a few dust puffs so it never reads as clipping through the floor
        if (!s.sunk && z.deathT > 5 && z.root.visible && near) { s.sunk = true; this._dust(z.pos.x, z.pos.y, z.pos.z, 3, { r: z.radius, size: 0.3, size1: 1.0, life: 1.2, speed: 0.5, col: [0.4, 0.38, 0.35], a: 0.3 }); }
        if (s.eyes) this._eyesOff(s);
        if (s.stars) { for (const m of s.stars) m.stop(); s.stars = null; }
        if (s.rageGlow) { s.rageGlow.stop(1); s.rageGlow = null; s.rage = 0; }
        continue;
      }
      if (s.leapT >= 0) this._leapStep(z, s, dt);     // timers run at any range
      if (s.stunT > 0) this._stunStep(z, s, dt);
      if (z.type === 'colossus') this._colossusStep(z, s, dt);
      if (!near) continue;
      s.dustT -= dt; s.fxT -= dt;
      const boss = z.def.boss;
      // charge: dust kicked up at the feet + a low dust wake (06b §9.5.3)
      if (this._charging(z) && s.speed > 3 && s.dustT <= 0) {
        const sc = boss ? 1.7 : 1;
        s.dustT = 0.1 / Math.max(0.5, this.k);
        const fx = Math.sin(z.yaw), fz = Math.cos(z.yaw);
        for (let i = 0; i < 2; i++) {
          const side = (i ? 1 : -1) * z.radius * 0.8;
          this.P.spawn({ x: z.pos.x + fz * side - fx * 0.3, y: z.pos.y + 0.12, z: z.pos.z - fx * side - fz * 0.3, vx: -fx * 1.5 + rr(-0.5, 0.5), vy: rr(0.3, 0.9), vz: -fz * 1.5 + rr(-0.5, 0.5),
            life: rr(0.7, 0.9), size: 0.3 * sc, size1: 1.2 * sc, sizePow: 0.5, color: [0.46, 0.43, 0.39, 0.42], color1: [0.48, 0.45, 0.41, 0], frame: FRAME.dusty + i, lit: true, drag: 2.2, ground: z.pos.y, soft: 0.2 });
        }
        if (boss && R() < 0.5) this._chunks(_v.set(z.pos.x, z.pos.y + 0.1, z.pos.z), 2, [0.3, 0.28, 0.25], 3, 0.03);
      }
      // runner: sprint dust (06b §5.2)
      if (z.type === 'runner' && s.speed > 3.5 && s.dustT <= 0 && d2 < 30 * 30) {
        s.dustT = 0.28 / Math.max(0.5, this.k);
        this.P.spawn({ x: z.pos.x - Math.sin(z.yaw) * 0.25, y: z.pos.y + 0.06, z: z.pos.z - Math.cos(z.yaw) * 0.25, vx: -Math.sin(z.yaw) * 0.8, vy: 0.35, vz: -Math.cos(z.yaw) * 0.8,
          life: 0.6, size: 0.15, size1: 0.55, sizePow: 0.5, color: [0.45, 0.42, 0.38, 0.28], color1: [0.45, 0.42, 0.38, 0], frame: FRAME.dusty, lit: true, drag: 2.5, ground: z.pos.y, soft: 0.15 });
      }
      // element statuses: flames licking the body, frost glints, plague bubbles
      if (s.fxT <= 0) {
        if (s.st.burning || s.st.ghostfire || s.st.featherburn) { s.fxT = 0.07 / Math.max(0.5, this.k); this._bodyFlame(z, !s.st.burning && !s.st.featherburn); }
        else if (s.st.frozen) { s.fxT = 0.25; this._bodyPoint(z, _v); this.marks.add('glint', { x: _v.x, y: _v.y, z: _v.z, life: 0.35, size: 0.08, size1: 0.02, color: [1.6, 2.6, 3.4, 1], rot: R() * 6 }); }
        else if (z.purgeT > 0 || s.st.poisoned) { s.fxT = 0.35; this._bodyPoint(z, _v); this.marks.add('bubble', { x: _v.x, y: _v.y, z: _v.z, vy: 0.5, life: 0.8, size: 0.07, size1: 0.13, color: [0.6, 1.4, 0.2, 0.9] }); }
        else s.fxT = 0.2;
      }
      // healed (screamer haste): a cross over the head every 1.5 s while it lasts
      if (s.healT > 0) {
        s.healT -= dt;
        s.healP = (s.healP ?? 1.5) - dt;
        if (s.healP <= 0) { s.healP = 1.5; this._cross(z); this.status(z, 'healed', 0.25); }
      }
      if (s.rage) this._rageStep(z, s, dt);
    }
  }

  _bodyPoint(z, out) {
    const h = z.height * (z.def.crawl ? 0.9 : 1);
    return out.set(z.pos.x + rr(-1, 1) * z.radius * 0.8, z.pos.y + rr(0.15, 0.9) * h, z.pos.z + rr(-1, 1) * z.radius * 0.8);
  }

  _bodyFlame(z, ghost = false) {
    const p = this._bodyPoint(z, _v);
    const s = (z.def.boss ? 0.8 : 0.32) * rr(0.8, 1.2);
    this.P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, vy: rr(0.6, 1.2), life: rr(0.3, 0.45), size: s, size1: s * 1.4, frame: FRAME.fire, frames: 8, fps: 18, frameOffset: R() * 7,
      ramp: ghost ? RAMP.purple : RAMP.flame, heat: 1.0, heat1: 0.2, mode: 'align', dir: UP, aspect: 1.3, anchor: 0.3, mirror: R() < 0.5, color: [1, 1, 1, 0.85], color1: [1, 1, 1, 0], drag: 1 });
    if (R() < 0.35) this.P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, vx: rr(-0.5, 0.5), vy: rr(1, 2.5), vz: rr(-0.5, 0.5), life: rr(0.5, 0.9), size: 0.012, stretch: 0.02,
      color: ghost ? [0.6, 3.6, 3.4, 1] : [5, 2.2, 0.6, 1], color1: ghost ? [1.6, 0.3, 2.6, 1] : [2, 0.4, 0.05, 1], frame: FRAME.spark, gravity: -0.5, drag: 1 });
  }

  // ------------------------------------------------------------------ shared particle recipes
  /** n lit dust puffs around (x, y, z) pushed outward (speed) and up. */
  _dust(x, y, z, n, { r = 0.5, size = 0.4, size1 = 1.6, life = 1.0, speed = 3, up = 0.4, col = [0.5, 0.47, 0.42], a = 0.5, ring = false } = {}) {
    for (let i = 0; i < n; i++) {
      const ang = ring ? (i / n) * TAU + R() * 0.3 : R() * TAU;
      const c = Math.cos(ang), s = Math.sin(ang), sp = speed * rr(0.6, 1.2);
      this.P.spawn({ x: x + c * r * rr(0.5, 1), y: y + 0.2, z: z + s * r * rr(0.5, 1), vx: c * sp, vy: up * rr(0.5, 1.5), vz: s * sp,
        life: life * rr(0.8, 1.2), size, size1: size1 * rr(0.8, 1.2), sizePow: 0.45, color: [col[0], col[1], col[2], a], color1: [col[0], col[1], col[2], 0], colorPow: 0.8,
        frame: FRAME.dusty + (i & 1), lit: true, drag: 2.6, spin: (R() - 0.5) * 1.2, ground: y, soft: 0.25 });
    }
  }

  _chunks(p, n, col, speed = 5, size = 0.05) {
    for (let i = 0; i < n; i++) {
      const a = R() * TAU, sp = speed * rr(0.5, 1.2);
      this.P.spawn({ x: p.x, y: p.y + 0.1, z: p.z, vx: Math.cos(a) * sp * 0.6, vy: rr(0.5, 1.2) * sp, vz: Math.sin(a) * sp * 0.6, life: rr(0.9, 1.5), size: size * rr(0.6, 1.4),
        color: [col[0], col[1], col[2], 1], color1: [col[0], col[1], col[2], 1], frame: FRAME.rock, gravity: 9.8, spin: (R() - 0.5) * 20, collide: true, bounce: 0.25 });
    }
  }

  /** Green-yellow gas cloud (bloater, spores, breath splash): n alpha puffs bursting out of p. */
  _gas(p, n, { size = 0.6, size1 = 3.2, speed = 5, up = 1.5, life = 1.6, col = [0.35, 0.55, 0.08, 0.75], col1 = [0.25, 0.35, 0.06, 0], ground = null } = {}) {
    for (let i = 0; i < n; i++) {
      _t.set(R() - 0.5, R() * 0.6 - 0.1, R() - 0.5).normalize();
      const sp = speed * rr(0.6, 1.4);
      this.P.spawn({ x: p.x + _t.x * 0.3, y: p.y + _t.y * 0.3, z: p.z + _t.z * 0.3, vx: _t.x * sp, vy: _t.y * sp + up * rr(0.5, 1.2), vz: _t.z * sp,
        life: life * rr(0.75, 1.25), size, size1: size1 * rr(0.8, 1.2), sizePow: 0.35, fadeIn: 0.02, color: col, color1: col1, colorPow: 0.9,
        frame: FRAME.smoke + (i & 1), drag: 2.5, gravity: -0.15, spin: (R() - 0.5) * 0.8, ground: ground ?? p.y - 1, soft: 0.3 });
    }
  }

  _cross(z, k = 1) {
    this.marks.add('cross', { x: z.pos.x, y: z.pos.y + z.height + 0.35, z: z.pos.z, vy: 0.5, life: 1.0, size: 0.42 * k, size1: 0.48 * k, color: [0.6, 3.4, 0.8, 1], color1: [0.2, 1.2, 0.3, 0] });
  }

  // ------------------------------------------------------------------ elite (06b §9.5.7)
  /** Elite marker: purple rim shell (derived) + a diamond floating over the head. */
  _eliteMark(z, s) {
    s.eliteMark = this.marks.add('diamond', { follow: z, oy: z.height + 0.45, life: Infinity, size: 0.2, color: [1.4, 0.4, 2.2, 0.9], fadeIn: 0.3 });
  }

  // ------------------------------------------------------------------ brute (06b §9.5.3)
  /** Charge wind-up: chevron strip along the charge line (scrolling forward) + the berserk shell ramps up. dir null = facing. */
  bruteCharge(z, dir = null, { windup = 0.6, len = 14, boss = false } = {}) {
    const yaw = dir ? Math.atan2(dir.x, dir.z) : z.yaw;
    const col = this.game.world?.collision;
    let L = len;
    if (col) {
      _w.set(Math.sin(yaw), 0, Math.cos(yaw));
      const hit = col.raycast(_v.set(z.pos.x, z.pos.y + 0.9, z.pos.z), _w, len);
      if (hit) L = Math.max(2, hit.dist);
    }
    const w = boss ? 1.8 : 0.7;
    this.ground.add('arrow', _v.set(z.pos.x, z.pos.y + 0.03, z.pos.z), { r: w, len: L, rot: yaw, life: windup + 0.3, fill: [0, 1.4], col: [2.6, 0.22, 0.1], alpha: 0.75, fadeOut: 0.3 });
    this.roar(z, boss ? 1.6 : 0.6);
    this._state(z).charging = true;
  }

  /** End of a charge: dust burst, shock ring and debris where it stopped (wall slams: scale up). */
  chargeImpact(pos, scale = 1) {
    const y = pos.y;
    this.ground.add('shock', _v.set(pos.x, y + 0.03, pos.z), { r: 0.5, r1: 3 * scale, life: 0.4, col: [1.6, 1.2, 0.8], width: 0.25 * scale });
    this._dust(pos.x, y, pos.z, this._n(12 * scale) + 3, { r: 0.6 * scale, size: 0.4 * scale, size1: 1.6 * scale, speed: 4 * scale, life: 1.1 });
    this._chunks(pos, Math.round(8 * scale), [0.32, 0.3, 0.27], 4.5, 0.045);
    if (scale > 1.2) this.ground.add('crack', _v.set(pos.x, y + 0.02, pos.z), { r: 1.6 * scale, life: 6, col: [0.04, 0.035, 0.03], alpha: 0.8, fadeOut: 2 });
  }

  // ------------------------------------------------------------------ crawler (06b §9.5.5)
  /** Pounce cue: eyes flare, then a dust wake while it flies, dust where it lands. */
  leapCue(z) {
    const s = this._state(z);
    s.leapT = 0;
    if (!s.eyes) {
      const e = { color: [3, 0.6, 0.3, 1], life: 1.2, fadeIn: 0.04 };
      s.eyes = [this.marks.add('dot', { ...e, size: 0.07 }), this.marks.add('dot', { ...e, size: 0.07 }), this.marks.add('dot', { ...e, size: 0.26, color: [1.2, 0.2, 0.08, 0.6] })];
    }
  }

  _eyesOff(s) { for (const m of s.eyes) m.stop(); s.eyes = null; }

  _leapStep(z, s, dt) {
    s.leapT += dt;
    const head = z.bones.head;
    if (s.eyes && head) {
      head.getWorldPosition(_h);
      const fx = Math.sin(z.yaw), fz = Math.cos(z.yaw);
      for (let i = 0; i < 3; i++) {
        const side = i === 2 ? 0 : i ? 0.035 : -0.035;
        const m = s.eyes[i];
        m.x = _h.x + fx * 0.09 + fz * side; m.y = _h.y + 0.03; m.z = _h.z + fz * 0.09 - fx * side;
      }
    }
    if (s.leapT > 0.12 && s.leapT < 0.75) {
      s.trailT = (s.trailT ?? 0) - dt;
      if (s.trailT <= 0) {
        s.trailT = 0.05;
        this.P.spawn({ x: z.pos.x, y: z.pos.y + z.height * 0.5, z: z.pos.z, vx: rr(-0.2, 0.2), vy: 0.1, vz: rr(-0.2, 0.2), life: 0.35, size: 0.25, size1: 0.5, color: [0.35, 0.33, 0.3, 0.3], color1: [0.35, 0.33, 0.3, 0], frame: FRAME.dusty, lit: true, drag: 3 });
      }
    }
    if (s.leapT >= 0.75) {
      s.leapT = -1;
      this._dust(z.pos.x, z.pos.y, z.pos.z, 3, { r: 0.3, size: 0.25, size1: 0.9, speed: 1.6, life: 0.8, a: 0.4 });
      if (s.eyes) this._eyesOff(s);
    }
  }

  // ------------------------------------------------------------------ spitter (06b §9.5.4)
  /** Landing warning: green countdown sweep at the target for the flight time. Returns the ground handle. */
  spitWarn(pos, r, t) {
    return this.ground.add('telegraph', _v.set(pos.x, pos.y + 0.03, pos.z), { r, life: t, fill: [0, 1], col: [0.55, 1.4, 0.18], alpha: 0.85, width: 0.07, fadeOut: 0.12 });
  }

  /** Acid glob in flight: glowing ribbon tail + drips. Returns { tick(pos), stop() }. */
  spitTrail() {
    const tr = this.fx.trail({ width: 0.12, life: 0.25, color: [0.6, 1.8, 0.2, 1], color1: [0.2, 0.6, 0.05, 0], taper: 0.2 });
    let dripT = 0;
    return {
      tick: (p, dt = 1 / 60) => {
        tr.push(p);
        dripT -= dt;
        if (dripT <= 0) { dripT = 0.05; this.P.spawn({ x: p.x, y: p.y, z: p.z, vy: -0.3, life: 0.5, size: 0.03, stretch: 0.015, color: [0.4, 0.8, 0.08, 0.9], color1: [0.3, 0.6, 0.05, 0.6], frame: FRAME.drop, gravity: 9.8, collide: true, bounce: 0.05 }); }
        this.P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.03, size: 0.22, color: [0.9, 2.6, 0.3, 1], color1: [0.9, 2.6, 0.3, 0], frame: FRAME.glow });
      },
      stop: () => tr.stop(),
    };
  }

  /** Acid glob splash: bright droplets, a splash crown and the acid pool decal (the hazard draws the pool itself). */
  acidSplash(point, normal, r = 1.6, dur = 3) {
    for (let i = 0; i < this._n(12) + 4; i++) {
      _t.set(R() - 0.5, R() * 0.8 + 0.3, R() - 0.5).normalize();
      const sp = rr(2, 5);
      this.P.spawn({ additive: true, x: point.x, y: point.y + 0.05, z: point.z, vx: _t.x * sp, vy: _t.y * sp, vz: _t.z * sp, life: rr(0.3, 0.6), size: 0.014, stretch: 0.02,
        color: [1.2, 3, 0.4, 1], color1: [0.3, 0.8, 0.1, 1], frame: FRAME.spark, gravity: 9.8, drag: 1, collide: true, bounce: 0.1 });
    }
    this.P.spawn({ x: point.x, y: point.y, z: point.z, mode: 'align', dir: [0, 1, 0], aspect: 1.5, anchor: 0.45, life: 0.35, size: 0.2, size1: 0.6, sizePow: 0.5, color: [0.35, 0.7, 0.08, 0.8], color1: [0.3, 0.6, 0.06, 0], frame: FRAME.splash, mirror: R() < 0.5 });
    this.P.spawn({ additive: true, x: point.x, y: point.y + 0.2, z: point.z, life: 0.12, size: 0.6, size1: 1.2, color: [1.0, 2.6, 0.4, 1], color1: [0.2, 0.6, 0.05, 0], frame: FRAME.glow });
    const col = this.game.world?.collision;
    const down = normal && normal.y > 0.6 ? { point, normal } : col?.raycast(_v.set(point.x, point.y + 0.3, point.z), DOWN, 3);
    if (down) this.fx.decals.add(down.point, down.normal, { frame: DECAL.acid, size: r * 2, tint: DECAL_TINT.acid, alpha: 0.9, life: Math.max(8, dur * 2), fade: 3, fit: false });
  }

  // ------------------------------------------------------------------ hazards (acid / poison pools)
  /** Ground visuals for a hazard { pos, r, t, kind } (manager / boss pools). Returns a handle with stop(). */
  hazard(h) {
    const acid = h.kind === 'acid';
    const p = _v.set(h.pos.x, this.groundY(h.pos.x, h.pos.z, h.pos.y) + 0.02, h.pos.z);
    const spot = this.ground.add('spot', p, { r: h.r * 1.05, life: Infinity, col: acid ? [0.16, 0.36, 0.03] : [0.2, 0.3, 0.05], alpha: acid ? 0.6 : 0.5, variant: acid ? 1 : 0.5, fadeIn: 0.25, fadeOut: 0.8 });
    const glow = this.ground.add('glow', p, { r: h.r * 1.2, life: Infinity, col: acid ? [0.08, 0.3, 0.02] : [0.06, 0.2, 0.02], fadeIn: 0.3, fadeOut: 0.8 });
    return { stop: () => { spot?.stop(); glow?.stop(); }, mist: 0, bub: 0 };
  }

  /** Per-frame hazard life: low poison mist rolling off the pool + bubbles (06b §9.4.2 lingering cloud). */
  hazardTick(h, dt) {
    const v = h.vis;
    if (!v) return;
    const acid = h.kind === 'acid';
    const area = Math.max(1, h.r * h.r / 2.56);
    v.mist -= dt;
    if (v.mist <= 0) {
      v.mist = 0.8 / area / Math.max(0.4, this.k);
      for (let i = 0; i < 2; i++) {
        const a = R() * TAU, r = Math.sqrt(R()) * h.r;
        const c = acid ? [0.3, 0.55, 0.07, 0.3] : [0.3, 0.48, 0.06, 0.32];
        this.P.spawn({ x: h.pos.x + Math.cos(a) * r, y: h.pos.y + 0.15, z: h.pos.z + Math.sin(a) * r, vx: rr(-0.2, 0.2), vy: 0.15, vz: rr(-0.2, 0.2), life: 3.5, size: 1.2, size1: 2.6, sizePow: 0.5, fadeIn: 0.2,
          color: c, color1: [c[0], c[1], c[2], 0], frame: FRAME.smoke + ((R() * 2) | 0), drag: 0.8, ground: h.pos.y, soft: 0.5 });
      }
    }
    // standing in it: CSO's lime poison frame on our screen (refreshed, never stacked; a light dose that keeps to the
    // edges: the boss's pools lie where the fight is)
    v.ov = (v.ov ?? 0) - dt;
    if (v.ov <= 0) { v.ov = 0.3; if (this._local(h.pos) < h.r) this.overlay('poison', acid ? 0.3 : 0.35, 0.5); }
    v.bub -= dt;
    if (v.bub <= 0) {
      v.bub = 0.3 / area;
      const a = R() * TAU, r = Math.sqrt(R()) * h.r * 0.85;
      this.marks.add('bubble', { x: h.pos.x + Math.cos(a) * r, y: h.pos.y + 0.05, z: h.pos.z + Math.sin(a) * r, vy: 0.4, life: 0.8, size: 0.08, size1: 0.15, color: [0.6, 1.4, 0.2, 0.9] });
    }
  }

  // ------------------------------------------------------------------ bloater (06b §9.4.2)
  /** Layered venom-guard style gas burst at the bloater's belly p (feet y = gy). */
  bloaterBurst(p, radius = 4.5, gy = p.y - 0.9) {
    const P = this.P;
    P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.15, size: 1.0, size1: 3.5, color: [2.4, 5.0, 1.0, 1], color1: [0, 0, 0, 0], frame: FRAME.glow });
    P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.2, size: 0.5, size1: radius * 1.6, sizePow: 0.5, color: [0.5, 0.9, 0.25, 1], color1: [0, 0, 0, 0], frame: FRAME.thinRing });
    this.ground.add('shock', _v.set(p.x, gy + 0.03, p.z), { r: 0.3, r1: radius, life: 0.35, col: [0.6, 1.4, 0.25], alpha: 0.8, width: 0.22 });
    // soft see-through gas, low and wide (lit billowy puffs read as green shrubs)
    this._gas(p, this._n(16) + 4, { size: 0.6, size1: 3.4, speed: 6.5, up: 0.7, life: 1.6, col: [0.33, 0.45, 0.1, 0.5], col1: [0.28, 0.36, 0.08, 0], ground: gy });
    // chunks: 60 % flesh, 40 % pus sacs
    this.fx.gibs(p, UP, Math.round(8 * Math.min(1, this.k + 0.3)), [0.30, 0.06, 0.05], 1.3);
    this.fx.gibs(p, UP, Math.round(6 * Math.min(1, this.k + 0.3)), [0.55, 0.60, 0.15], 1.3);
    this.fx.blood(p, UP, UP, 4, { acid: true });
    const col = this.game.world?.collision;
    const down = col?.raycast(_v.set(p.x, p.y + 0.3, p.z), DOWN, 4);
    if (down) this.fx.decals.add(down.point, down.normal, { frame: DECAL.acid, size: rr(2.5, 3.5), tint: DECAL_TINT.acid, alpha: 0.95, life: 20, fade: 4, fit: false });
    this.fx.lights.flash(_v.set(p.x, p.y + 0.5, p.z), 0x9aff60, 120, radius * 2.2, 0.3);
    this.fx.smokes?.blast?.(p, radius * 0.5, 1);
    const d = this._local(p);
    if (d < radius) { this.overlay('poison', 0.8, 1.5); this.game.addShake?.(0.35 * (1 - d / radius) + 0.1); }
  }

  /** Headshot kill (CSO: no blast): six small puffs out of the belly, the body sags to 90 % over 0.4 s. */
  bloaterDeflate(z) {
    const p = z.center(_v);
    for (let i = 0; i < 6; i++) {
      _t.set(R() - 0.5, R() * 0.5, R() - 0.5).normalize();
      this.P.spawn({ x: p.x + _t.x * 0.25, y: p.y + _t.y * 0.2, z: p.z + _t.z * 0.25, vx: _t.x * 1.2, vy: _t.y + 0.3, vz: _t.z * 1.2, life: 0.8, size: 0.2, size1: 0.8, sizePow: 0.5,
        color: [0.35, 0.55, 0.08, 0.6], color1: [0.3, 0.45, 0.06, 0], frame: FRAME.smoke + (i & 1), drag: 2 });
    }
    this.game.audio?.play('bloater_pop', { pos: p, volume: 0.35, pitch: 1.7 });
    const s = this._state(z);
    s.deflate = 0; s.scale0 = z.root.scale.x;
  }

  _deflateStep(z, s, dt) {
    s.deflate = Math.min(0.4, s.deflate + dt);
    const u = s.deflate / 0.4;
    z.root.scale.set(s.scale0 * (1 - 0.06 * u), s.scale0 * (1 - 0.1 * u), s.scale0 * (1 - 0.06 * u));
    if (u >= 1) s.deflate = -1;
  }

  // ------------------------------------------------------------------ screamer (06b §9.5.1, §9.5.2)
  /** Scream: three ground shock rings 0.12 s apart + air rings; the local player inside gets the dizzy overlay. */
  screamWave(z, radius = 16, slowTime = 2) {
    const p = _w.set(z.pos.x, z.pos.y + 0.03, z.pos.z).clone();
    for (let i = 0; i < 3; i++) this.after(i * 0.12, () => {
      this.ground.add('shock', p, { r: 0.5, r1: radius, life: 0.7, col: [0.36, 0.42, 0.6], alpha: 0.55 - i * 0.12, width: 0.2, ease: 0.6 });
      this.fx.shockwave(_v.set(p.x, p.y + z.height * 0.85, p.z), { r0: 0.25, r1: 3, life: 0.5, color: [0.4, 0.45, 0.6], thin: true });
    });
    const d = this._local(p);
    if (d < radius) {
      this.overlay('zoomBlur', 0.35, 0.25);
      this.overlay('tint', 0.18, slowTime * (1 - d / radius * 0.5), [0.5, 0.3, 0.8]);
    }
  }

  /** Voodoo-style heal: a green ring rolls out, crosses pop over every healed zombie and float in the area. */
  healPulse(z, radius = 8, healed = null, haste = 5) {
    const p = _w.set(z.pos.x, z.pos.y + 0.03, z.pos.z).clone();
    this.ground.add('heal', p, { r: 0.5, r1: radius, life: 0.6, col: [0.4, 2.2, 0.6], width: 0.35, ease: 0.6 });
    this.ground.add('glow', p, { r: radius * 1.2, life: 2.5, col: [0.05, 0.25, 0.07], fadeIn: 0.15, fadeOut: 1.2 });
    const list = healed || (this.game.zombies?.list || []).filter((o) => o.alive && o !== z && o.pos.distanceTo(z.pos) < radius);
    for (const o of list) {
      this._cross(o);
      this.status(o, 'healed', 0.25);
      const s = this._state(o);
      s.healT = haste; s.healP = 1.5;
    }
    for (let i = 0; i < this._n(8) + 3; i++) {
      const a = R() * TAU, r = Math.sqrt(R()) * radius;
      this.marks.add('cross', { x: p.x + Math.cos(a) * r, y: p.y + rr(0.5, 2.2), z: p.z + Math.sin(a) * r, vy: 0.3, life: 1.2, delay: R() * 0.3, size: rr(0.25, 0.4), color: [0.6, 3.2, 0.8, 0.9], color1: [0.2, 1.2, 0.3, 0] });
    }
  }

  // ------------------------------------------------------------------ psycho smoke (06b §9.5.6, P2)
  /** Near-black smoke: `bursts` puffs of 12 (phone low: 6, bigger) every `every` s; zombies inside wear a shield mark. */
  smokeBurst(pos, { bursts = 4, every = 2, radius = 5, follow = null } = {}) {
    const lo = this.k < 0.5;
    const n = lo ? 6 : this.k < 0.9 ? 9 : 12, sz = lo ? 1.3 : 1;
    for (let b = 0; b < bursts; b++) this.after(b * every, () => {
      const c = follow?.alive ? follow.pos : pos;
      for (let i = 0; i < n; i++) {
        const a = R() * TAU, sp = rr(0.3, 0.9) * radius / 5;
        this.P.spawn({ x: c.x + Math.cos(a) * 0.4, y: c.y + rr(0.4, 1.4), z: c.z + Math.sin(a) * 0.4, vx: Math.cos(a) * sp, vy: 0.1, vz: Math.sin(a) * sp,
          life: rr(7, 9), size: 1.5 * sz, size1: 4.5 * sz, sizePow: 0.4, fadeIn: 0.05, color: [0.055, 0.055, 0.06, 0.85], color1: [0.07, 0.07, 0.075, 0], colorPow: 1.6,
          frame: FRAME.puff + (i & 3), drag: 1.0, spin: (R() - 0.5) * 0.5, ground: c.y, soft: 0.4 });
      }
    });
  }

  /** Damage-reduction shield icon over a zombie (smoke / armour buffs, readable on phones). */
  shieldMark(z, dur = 2) { return this.marks.add('shield', { follow: z, oy: z.height + 0.4, life: dur, size: 0.24, color: [0.7, 0.85, 1.4, 0.9] }); }

  // ------------------------------------------------------------------ bosses (06b §9.6)
  /** Roar: two air rings at head height and a dust skirt. */
  roar(z, scale = 1) {
    const y = z.pos.y + z.height * 0.8;
    for (let i = 0; i < 2; i++) this.after(i * 0.15, () => this.fx.shockwave(_v.set(z.pos.x, y, z.pos.z), { r0: 0.4 * scale, r1: 4 * scale, life: 0.45, color: [0.5, 0.45, 0.4], thin: true }));
    this._dust(z.pos.x, z.pos.y, z.pos.z, this._n(6 * scale) + 2, { r: z.radius, size: 0.3 * scale, size1: 1.2 * scale, speed: 3 * scale, life: 0.9, a: 0.35, ring: true });
  }

  /** Slam / stomp / dive landing: shock ring, radial dust, debris, cracks; the local player inside feels it. */
  quake(pos, r, { col = [2.2, 1.5, 0.9], scale = 1, crack = true } = {}) {
    const y = pos.y;
    this.ground.add('shock', _v.set(pos.x, y + 0.03, pos.z), { r: 0.5, r1: r * 1.2, life: 0.38, col, width: Math.min(1.2, r * 0.08), ease: 0.4 });
    this.ground.add('glow', _v.set(pos.x, y + 0.03, pos.z), { r: Math.min(5, r * 0.5), life: 0.6, col: [col[0] * 0.25, col[1] * 0.2, col[2] * 0.15], fadeIn: 0.01, fadeOut: 0.5 });
    const n = this._n(24 * Math.min(1.5, scale)) + 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + R() * 0.2, sp = rr(6, 9) * Math.min(1.4, r / 7);
      this.P.spawn({ x: pos.x + Math.cos(a) * 1.2, y: y + 0.25, z: pos.z + Math.sin(a) * 1.2, vx: Math.cos(a) * sp, vy: rr(0.4, 1.0), vz: Math.sin(a) * sp, life: rr(1.0, 1.5),
        size: 0.5 * scale, size1: rr(1.8, 2.6) * scale, sizePow: 0.45, color: [0.5, 0.47, 0.42, 0.55], color1: [0.5, 0.47, 0.42, 0], colorPow: 0.8, frame: FRAME.dusty + (i & 1), lit: true, drag: 2.6, ground: y, soft: 0.3 });
    }
    this._chunks(_v.set(pos.x, y, pos.z), Math.round(12 * Math.min(1.5, scale) * Math.min(1, this.k + 0.4)), [0.3, 0.28, 0.25], 6, 0.06 * scale);
    if (crack) this.ground.add('crack', _v.set(pos.x, y + 0.02, pos.z), { r: Math.min(5, r * 0.45), life: 7, col: [0.04, 0.035, 0.03], alpha: 0.85, fadeIn: 0.02, fadeOut: 2.5 });
    this.fx.lights.flash(_v.set(pos.x, y + 1, pos.z), 0xffc890, 60 * scale, r * 1.5, 0.15);
    const d = this._local(pos);
    if (d < r * 1.1) this.overlay('zoomBlur', 0.25, 0.3);
  }

  /** Thrown rock in flight: dust wake + shed grit. Returns { tick(pos, dt), stop() }. */
  rockTrail() {
    let t = 0;
    return {
      tick: (p, dt = 1 / 60) => {
        t -= dt;
        if (t > 0) return;
        t = 0.035 / Math.max(0.5, this.k);
        this.P.spawn({ x: p.x + rr(-0.2, 0.2), y: p.y + rr(-0.2, 0.2), z: p.z + rr(-0.2, 0.2), vy: 0.2, life: 0.8, size: 0.35, size1: 1.1, sizePow: 0.5, color: [0.42, 0.39, 0.35, 0.5], color1: [0.45, 0.42, 0.38, 0], frame: FRAME.dusty + ((R() * 2) | 0), lit: true, drag: 1.5 });
        if (R() < 0.4) this.P.spawn({ x: p.x, y: p.y, z: p.z, vx: rr(-1, 1), vy: rr(-0.5, 1), vz: rr(-1, 1), life: 1.0, size: rr(0.02, 0.045), color: [0.3, 0.28, 0.25, 1], color1: [0.3, 0.28, 0.25, 1], frame: FRAME.rock, gravity: 9.8, spin: (R() - 0.5) * 20, collide: true, bounce: 0.2 });
      },
      stop: () => {},
    };
  }

  /** Rock lands: rubble blast + small quake ring + cracks. */
  rockImpact(point, r = 3.4) {
    this.fx.explosion(point, { radius: r, scale: 0.7, color: [0.6, 0.5, 0.4] });
    const gy = this.groundY(point.x, point.z, point.y);
    this.quake(_t.set(point.x, gy, point.z), r, { scale: 0.7 });
  }

  /**
   * Boss rage: a hot rim flash that settles into a thin ember rim (SHELL.rage), steam and rising embers off the
   * shoulders from now on, a red pulse on the ground; level 2 = frenzy (denser embers, dark heat smoke). The body
   * itself never washes out: the model's own vein / weak-point glow (brain enrageLook) carries the look up close,
   * the embers (drawn larger with distance) carry it at range.
   */
  rageAura(z, level = 1) {
    const s = this._state(z);
    s.rage = level;
    this.status(z, 'rageFlash', level === 1 ? 1.2 : 0.5);
    const p = _w.set(z.pos.x, z.pos.y + 0.03, z.pos.z).clone();
    for (let i = 0; i < 2; i++) this.after(i * 0.2, () => this.ground.add('shock', p, { r: 1, r1: 9, life: 0.6, col: [2.4, 0.3, 0.15], width: 0.5 }));
    if (!s.rageGlow) s.rageGlow = this.ground.add('glow', p, { r: z.radius * 3, life: Infinity, col: [0.42, 0.05, 0.02], follow: z, fadeIn: 0.5 });
    this.roar(z, 1.6);
    // a burst of embers off the whole body: the moment reads even from across the map
    for (let i = 0; i < this._n(26) + 8; i++) {
      const q = this._bodyPoint(z, _v);
      _t.set(q.x - z.pos.x, 0, q.z - z.pos.z).normalize();
      this.P.spawn({ additive: true, x: q.x, y: q.y, z: q.z, vx: _t.x * rr(1, 3), vy: rr(1.5, 4.5), vz: _t.z * rr(1, 3), delay: R() * 0.25, life: rr(0.8, 1.4), size: 0.026, stretch: 0.03,
        color: [7, 2, 0.5, 1], color1: [2.4, 0.3, 0.05, 1], frame: FRAME.spark, drag: 0.9, gravity: -0.4, far: true });
    }
    if (this._local(p) < 14) this.overlay('edge', 0.5, 0.6, [1, 0.12, 0.08]);
  }

  _rageStep(z, s, dt) {
    s.steamT = (s.steamT ?? 0) - dt;
    if (s.steamT > 0) return;
    const fr = s.rage > 1;
    s.steamT = (fr ? 0.09 : 0.14) / Math.max(0.5, this.k);
    const p = this._bodyPoint(z, _v);
    p.y = z.pos.y + z.height * rr(0.55, 0.85);
    // heat steam off the back
    if (R() < 0.6) this.P.spawn({ x: p.x, y: p.y, z: p.z, vx: rr(-0.2, 0.2), vy: rr(0.6, 1.1), vz: rr(-0.2, 0.2), life: rr(1.0, 1.4), size: 0.4 * (z.height / 4), size1: 1.4 * (z.height / 4), sizePow: 0.5, fadeIn: 0.1,
      color: fr ? [0.32, 0.2, 0.18, 0.3] : [0.7, 0.7, 0.72, 0.22], color1: [0.72, 0.7, 0.7, 0], frame: FRAME.smoke + ((R() * 2) | 0), drag: 1 });
    // embers rising off the shoulders and back (larger with distance: the rage cue that survives 30 m+)
    for (let i = fr ? 3 : 2; i > 0; i--) {
      const q = i > 1 ? this._bodyPoint(z, _t) : p;
      if (i > 1) q.y = z.pos.y + z.height * rr(0.5, 0.9);
      this.P.spawn({ additive: true, x: q.x, y: q.y, z: q.z, vx: rr(-0.5, 0.5), vy: rr(1.2, 2.6), vz: rr(-0.5, 0.5), life: rr(0.7, 1.2), size: 0.035, stretch: 0.035,
        color: [6, 1.7, 0.45, 1], color1: [2.2, 0.25, 0.05, 1], frame: FRAME.spark, drag: 0.8, gravity: -0.5, far: true });
    }
    // a soft ember glow drifting up off the back now and then (reads as heat at range, never covers the body)
    if (R() < 0.35) this.P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, vx: rr(-0.2, 0.2), vy: rr(0.8, 1.4), vz: rr(-0.2, 0.2), life: rr(0.5, 0.8), size: 0.32, size1: 0.12,
      color: [1.4, 0.3, 0.06, 0.55], color1: [0.6, 0.08, 0.02, 0], frame: FRAME.glow, drag: 0.6, far: 'sqrt' });
  }

  /** Stunned (wall slam): stars circling the head for t seconds. */
  stunned(z, t = 2.2) {
    const s = this._state(z);
    s.stunT = t;
    if (!s.stars) s.stars = [0, 1, 2].map(() => this.marks.add('stun', { life: Infinity, size: z.def.boss ? 0.45 : 0.2, color: [2.2, 1.6, 0.25, 1], spin: 3 }));
  }

  _stunStep(z, s, dt) {
    s.stunT -= dt;
    const y = z.pos.y + z.height * 1.02, r = z.radius * 0.9 + 0.2;
    s.stars.forEach((m, i) => { const a = this.time * 4 + i * TAU / 3; m.x = z.pos.x + Math.cos(a) * r; m.y = y + Math.sin(a * 2) * 0.08; m.z = z.pos.z + Math.sin(a) * r; });
    if (s.stunT <= 0 || !z.alive) { for (const m of s.stars) m.stop(); s.stars = null; s.stunT = 0; }
  }

  /** Butcher wall slam: big charge impact + stun stars. */
  wallSlam(z, stun = 2.2) { this.chargeImpact(z.pos, 1.8); this.stunned(z, stun); }

  /** Cleaver swipe: a fan of dust kicked along the arc. */
  swipe(pos, yaw, r = 5, half = 0.85) {
    const n = this._n(8) + 3;
    for (let i = 0; i < n; i++) {
      const a = yaw - half + (i / (n - 1)) * half * 2, d = r * rr(0.55, 0.95);
      const x = pos.x + Math.sin(a) * d, z = pos.z + Math.cos(a) * d;
      this.P.spawn({ x, y: pos.y + 0.15, z, vx: Math.cos(a) * 2, vy: 0.4, vz: -Math.sin(a) * 2, delay: i * 0.015, life: 0.7, size: 0.35, size1: 1.3, sizePow: 0.5, color: [0.48, 0.45, 0.4, 0.4], color1: [0.48, 0.45, 0.4, 0], frame: FRAME.dusty + (i & 1), lit: true, drag: 2.5, ground: pos.y, soft: 0.2 });
    }
  }

  // ---- colossus / abyss wing
  /** Spore mortar launch: a green gas puff at the launcher. */
  sporeLaunch(from) {
    this._gas(from, this._n(5) + 2, { size: 0.5, size1: 1.8, speed: 2, up: 1.5, life: 1.2, col: [0.35, 0.6, 0.1, 0.6], col1: [0.3, 0.5, 0.08, 0] });
    this.P.spawn({ additive: true, x: from.x, y: from.y, z: from.z, life: 0.12, size: 1.2, size1: 2, color: [1.2, 3, 0.4, 1], color1: [0, 0, 0, 0], frame: FRAME.glow });
  }

  /** Spore shell in flight: green ribbon tail + smoke puffs. Returns { tick(pos, dt), stop() }. */
  sporeTrail() {
    const tr = this.fx.trail({ width: 0.3, life: 0.3, color: [0.9, 2.4, 0.3, 1], color1: [0.2, 0.6, 0.05, 0], taper: 0.1 });
    let t = 0;
    return {
      tick: (p, dt = 1 / 60) => {
        tr.push(p);
        t -= dt;
        if (t > 0) return;
        t = 0.04 / Math.max(0.5, this.k);
        this.P.spawn({ x: p.x, y: p.y, z: p.z, vx: rr(-0.2, 0.2), vy: 0.2, vz: rr(-0.2, 0.2), life: 0.9, size: 0.3, size1: 1.1, sizePow: 0.5, color: [0.35, 0.6, 0.1, 0.5], color1: [0.3, 0.5, 0.1, 0], frame: FRAME.smoke + ((R() * 2) | 0), drag: 1 });
      },
      stop: () => tr.stop(),
    };
  }

  /** Spore shell lands: green flash, gas burst, droplets, acid splat, shock ring (the pools fx adds the hazard). */
  sporeBurst(point, r = 3.2) {
    const gy = this.groundY(point.x, point.z, point.y);
    const p = _w.set(point.x, gy + 0.4, point.z).clone();
    this.P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.12, size: 1.2, size1: 3, color: [2.4, 5, 1, 1], color1: [0, 0, 0, 0], frame: FRAME.glow });
    this.ground.add('shock', _v.set(p.x, gy + 0.03, p.z), { r: 0.3, r1: r, life: 0.3, col: [1.0, 2.0, 0.4], width: 0.3 });
    // landing on us: a thinner, lower, faster cloud (it would fill the lens), the splash on screen stays at the edges
    // (QA: the old cloud + 0.7 / 1.2 s overlay covered ~60 % of the screen in the boss's busiest phase)
    const d = this._local(p), onUs = d < r;
    this._gas(p, onUs ? this._n(5) + 2 : this._n(10) + 3, onUs ? { size: 0.4, size1: 1.6, speed: 3, up: 0.5, life: 0.9, col: [0.35, 0.55, 0.08, 0.45], ground: gy }
      : { size: 0.5, size1: 2.6, speed: 4, up: 1.2, life: 1.4, ground: gy });
    this.acidSplash(_v.set(p.x, gy, p.z), UP, r * 0.6, 6);
    this.fx.lights.flash(_v.set(p.x, gy + 0.8, p.z), 0x9aff60, 60, r * 2.5, 0.2);
    if (onUs) this.overlay('poison', 0.35, 0.6);
  }

  /** Breath wind-up: green motes sucked into the mouth + a growing glow there for t seconds. */
  breathCharge(z, t = 1.3) {
    const m = this._mouth(z, _h);
    const n = this._n(24) + 6;
    for (let i = 0; i < n; i++) {
      _t.set(R() - 0.5, R() - 0.5, R() - 0.5).normalize().multiplyScalar(rr(2.2, 3.4));
      const life = rr(0.45, 0.6);
      this.P.spawn({ additive: true, x: m.x + _t.x, y: m.y + _t.y, z: m.z + _t.z, vx: -_t.x / life, vy: -_t.y / life, vz: -_t.z / life, delay: (i / n) * (t - 0.4), life, size: 0.08, size1: 0.03, stretch: 0.05,
        color: [0.8, 2.0, 0.3, 1], color1: [1.2, 3, 0.5, 1], frame: FRAME.spark });
    }
    const fx = Math.sin(z.yaw), fz = Math.cos(z.yaw);
    this.marks.add('dot', { follow: z, ox: fx * z.radius * 0.8, oy: m.y - z.pos.y, oz: fz * z.radius * 0.8, life: t, size: 0.3, size1: 1.6, color: [0.8, 2.2, 0.35, 0.5], color1: [1.2, 3, 0.5, 1] });
  }

  _mouth(z, out) {
    const head = z.bones.head;
    if (head) { head.getWorldPosition(out); return out; }
    return out.set(z.pos.x + Math.sin(z.yaw) * z.radius, z.pos.y + z.height * 0.8, z.pos.z + Math.cos(z.yaw) * z.radius);
  }

  /** Acid breath strip from the mouth down onto the ground line (start p, yaw, length L, half width w). */
  breath(z, p, yaw, L = 34, w = 2.6, dur = 1.2) {
    const from = this._mouth(z, _h).clone();
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const n = Math.round((this.k < 0.5 ? 20 : this.k < 0.9 ? 30 : 40) * dur);
    for (let i = 0; i < n; i++) {
      const Ld = rr(0.05, 1) * L, side = rr(-1, 1) * w * 0.7;
      _t.set(p.x + fx * Ld + fz * side, p.y + 0.4, p.z + fz * Ld - fx * side);
      const dist = _t.distanceTo(from);
      _v.subVectors(_t, from).normalize();
      const drag = 0.9, sp = dist * drag * 1.1;
      this.P.spawn({ x: from.x, y: from.y, z: from.z, vx: _v.x * sp, vy: _v.y * sp, vz: _v.z * sp, delay: (i / n) * dur, life: rr(1.6, 2.4), size: 0.8, size1: 5, sizePow: 0.4, fadeIn: 0.03,
        color: [0.55, 0.75, 0.35, 0.6], color1: [0.45, 0.6, 0.3, 0], colorPow: 1.2, frame: FRAME.smoke + (i & 1), drag, spin: (R() - 0.5) * 0.6, ground: p.y, soft: 0.6 });
    }
    // bright core streamlines (the "wash" of the cone)
    for (let i = 0; i < 6; i++) {
      const Ld = rr(0.2, 1) * L;
      _t.set(p.x + fx * Ld, p.y + 0.3, p.z + fz * Ld);
      _v.subVectors(_t, from);
      const life = 0.35;
      this.P.spawn({ additive: true, x: from.x, y: from.y, z: from.z, vx: _v.x / life, vy: _v.y / life, vz: _v.z / life, delay: i * 0.12, life, size: 0.12, stretch: 0.06, color: [1.5, 2.6, 1.0, 1], color1: [0.8, 1.6, 0.4, 0.5], frame: FRAME.spark });
    }
    this.ground.add('arrow', _v.set(p.x, p.y + 0.03, p.z), { r: w, len: L, rot: yaw, life: dur + 0.6, fill: [0, 1], col: [0.5, 1.4, 0.25], alpha: 0.5, fadeIn: 0.15, fadeOut: 0.6 });
    // local player inside the strip: CSO's breath washes the screen out
    const pl = this.game.player;
    if (pl && this._local(p) < Infinity) {
      const dx = pl.pos.x - p.x, dz = pl.pos.z - p.z, along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
      if (along > -1 && along < L + 1 && side < w + 0.8) { this.overlay('poison', 0.7, 1.1); this.overlay('tint', 0.16, 0.6, [0.85, 1.0, 0.8]); }
    }
  }

  /** Wings beat while airborne: a dust ring blown out on the ground under the boss (strength by altitude). */
  wingGust(pos, alt) {
    const f = THREE.MathUtils.clamp(1 - (alt - 4) / 18, 0.25, 1);
    const n = Math.round((this.k < 0.5 ? 6 : 12) * f) + 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + R() * 0.3, sp = rr(5, 8) * f;
      this.P.spawn({ x: pos.x + Math.cos(a) * 1.5, y: pos.y + 0.2, z: pos.z + Math.sin(a) * 1.5, vx: Math.cos(a) * sp, vy: 0.3, vz: Math.sin(a) * sp, life: rr(1.0, 1.4), size: 0.5, size1: 2.2, sizePow: 0.5,
        color: [0.52, 0.49, 0.44, 0.3 * f + 0.1], color1: [0.52, 0.49, 0.44, 0], frame: FRAME.dusty + (i & 1), lit: true, drag: 2.2, ground: pos.y, soft: 0.3 });
    }
    this.ground.add('shock', _v.set(pos.x, pos.y + 0.03, pos.z), { r: 1.5, r1: 8 * f + 2, life: 0.6, col: [0.5, 0.48, 0.45], alpha: 0.6 * f, width: 0.6 });
  }

  /** Take-off / fly-in: down-blast of dust, ground shock, rising dust column. */
  takeoff(z) {
    const gy = this.groundY(z.pos.x, z.pos.z, z.pos.y);
    const p = _w.set(z.pos.x, gy, z.pos.z).clone();
    this.ground.add('shock', _v.set(p.x, gy + 0.03, p.z), { r: 1, r1: 13, life: 0.8, col: [0.8, 0.75, 0.7], width: 0.8 });
    this._dust(p.x, gy, p.z, this._n(24) + 6, { r: 2, size: 0.8, size1: 3.2, speed: 9, up: 0.6, life: 1.6, a: 0.5, ring: true });
    for (let i = 0; i < this._n(8) + 2; i++) this.P.spawn({ x: p.x + rr(-1.5, 1.5), y: gy + 0.5, z: p.z + rr(-1.5, 1.5), vx: rr(-0.5, 0.5), vy: rr(3, 6), vz: rr(-0.5, 0.5), life: rr(1.4, 2), size: 1, size1: 3.5, sizePow: 0.5,
      color: [0.5, 0.47, 0.42, 0.4], color1: [0.5, 0.47, 0.42, 0], frame: FRAME.puff + (i & 3), lit: true, drag: 1.4 });
    this.game.addShake?.(Math.max(0, 0.45 - this._local(p) / 60));
    this._state(z).gustT = 0.6;
  }

  /**
   * Metamorphosis (invulnerable, wings unfold): the invulnerable rim (SHELL.invuln), a violet glyph turning under
   * it, four thin light columns in a ring well outside the body, violet motes swirling up around it, dark chrysalis
   * smoke rolling at its feet; a shock ring and a roar as it ends. Nothing additive covers the body: one enveloping
   * column plus a flat red shell turned the boss (and the crawlers it summons behind it) into pink translucent blobs.
   */
  metamorph(z, t = 4.5) {
    this.status(z, 'invuln', t);
    const p = _w.set(z.pos.x, z.pos.y + 0.03, z.pos.z).clone();
    const R0 = Math.max(4.2, z.radius * 2.6);
    this.ground.add('glyph', p, { r: R0 + 1.6, life: t, col: [1.0, 0.28, 1.8], alpha: 0.85, rotV: 2, fadeIn: 0.6, fadeOut: 0.6 });
    // (Pillars holds 12: supply-crate columns must never be pushed out)
    for (let i = 0; i < 4 && this.pillars.items.length < this.pillars.max - 2; i++) {
      const a = (i / 4) * TAU + 0.4;
      this.pillars.add(_v.set(p.x + Math.cos(a) * R0, p.y, p.z + Math.sin(a) * R0), { r: 0.22, h: z.height * 1.4, col: [0.5, 0.15, 0.95], life: t, taper: 0.2, fadeIn: 0.4 + i * 0.12 });
    }
    // motes drawn in along the ring and up (a slow swirl), larger with distance so the transformation reads far away
    const n = Math.round((t - 0.8) / 0.04 * Math.min(1, this.k + 0.2));
    for (let i = 0; i < n; i++) {
      const a = R() * TAU, r0 = R0 * rr(0.8, 1.1), life = rr(1.1, 1.7), sp = rr(1.6, 2.6);
      const c = Math.cos(a), sn = Math.sin(a);
      this.P.spawn({ additive: true, x: p.x + c * r0, y: p.y + rr(0.1, 1.2), z: p.z + sn * r0, vx: -sn * sp - c * 1.1, vy: rr(1.8, 3.6), vz: c * sp - sn * 1.1, delay: (i / n) * (t - 0.8), life,
        size: 0.2, size1: 0.07, color: [1.5, 0.55, 3.0, 1], color1: [0.5, 0.12, 1.2, 0], frame: FRAME.glow, drag: 0.3, far: true });
    }
    // dark chrysalis smoke rolling round the feet (kept low: it never hides the body)
    for (let i = 0; i < this._n(14) + 4; i++) {
      const a = R() * TAU, r0 = rr(0.5, 1) * z.radius * 1.4;
      this.P.spawn({ x: p.x + Math.cos(a) * r0, y: p.y + 0.3, z: p.z + Math.sin(a) * r0, vx: -Math.sin(a) * 1.2 + Math.cos(a) * 0.6, vy: rr(0.1, 0.4), vz: Math.cos(a) * 1.2 + Math.sin(a) * 0.6,
        delay: R() * (t - 1.5), life: rr(1.8, 2.6), size: 1.0, size1: 2.6, sizePow: 0.5, fadeIn: 0.15, color: [0.09, 0.06, 0.12, 0.55], color1: [0.12, 0.09, 0.15, 0], colorPow: 1.3,
        frame: FRAME.puff + (i & 3), drag: 1.2, spin: (R() - 0.5) * 0.6, ground: p.y, soft: 0.4 });
    }
    this.after(t - 0.3, () => {
      this.ground.add('shock', p, { r: 1, r1: 16, life: 0.6, col: [1.4, 0.4, 2.2], width: 0.6 });
      this.fx.shockwave(_v.set(p.x, p.y + z.height * 0.6, p.z), { r0: 1, r1: 9, life: 0.5, color: [1.2, 0.5, 2.2], thin: true });
      this.roar(z, 2);
    });
    if (this._local(p) < 25) this.overlay('tint', 0.15, 1.2, [0.6, 0.35, 0.9]);
  }

  /** Adds clawing out of the ground where a boss summons them: a dark burst, dirt clods, a violet ring and cracks. */
  summonIn(pos, col = [0.9, 0.3, 1.5]) {
    const gy = this.groundY(pos.x, pos.z, pos.y);
    this.ground.add('shock', _v.set(pos.x, gy + 0.03, pos.z), { r: 0.5, r1: 1.7, life: 0.4, col: [col[0] * 0.7, col[1] * 0.7, col[2] * 0.7], width: 0.07 });
    this.ground.add('crack', _v.set(pos.x, gy + 0.02, pos.z), { r: 1.1, life: 5, col: [0.04, 0.035, 0.03], alpha: 0.8, fadeIn: 0.02, fadeOut: 2 });
    this._dust(pos.x, gy, pos.z, this._n(5) + 2, { r: 0.4, size: 0.35, size1: 1.3, speed: 1.6, up: 0.8, life: 1.1, col: [0.16, 0.13, 0.17], a: 0.55 });
    this._chunks(_v.set(pos.x, gy, pos.z), 6, [0.28, 0.25, 0.22], 3.5, 0.045);
    this.P.spawn({ additive: true, x: pos.x, y: gy + 0.4, z: pos.z, life: 0.25, size: 0.8, size1: 1.8, color: [col[0], col[1], col[2], 1], color1: [0, 0, 0, 0], frame: FRAME.glow, far: 'sqrt' });
  }

  /** Wings shredded: smoke trails off the body while it falls, then the crash-landing blast when it hits the ground. */
  crash(z) {
    const s = this._state(z);
    s.crashing = true; s.crashT = 0;
    this.status(z, 'invuln', 2.5);
    this._gas(z.center(_v), this._n(8) + 3, { size: 1, size1: 3, speed: 3, up: 0, life: 1.5, col: [0.18, 0.16, 0.15, 0.8], col1: [0.25, 0.24, 0.23, 0] });
  }

  _colossusStep(z, s, dt) {
    const gy = this.groundY(z.pos.x, z.pos.z, s.gy ?? z.pos.y);
    s.gy = gy;
    const alt = z.pos.y - gy;
    if (s.crashing) {
      s.crashT += dt;
      if (R() < dt * 30) this.P.spawn({ x: z.pos.x + rr(-1, 1), y: z.pos.y + z.height * 0.6, z: z.pos.z + rr(-1, 1), vy: 1, life: 1.4, size: 1, size1: 2.6, color: [0.15, 0.14, 0.13, 0.6], color1: [0.2, 0.19, 0.18, 0], frame: FRAME.puff + ((R() * 4) | 0), lit: true, drag: 1 });
      if (alt < 0.8 || s.crashT > 3) {
        s.crashing = false;
        const p = _w.set(z.pos.x, gy, z.pos.z).clone();
        this.quake(p, 10, { scale: 1.5 });
        this.fx.explosion(p, { radius: 8, scale: 1.4, color: [0.6, 0.5, 0.4] });
        const d = this._local(p);
        if (d < 16) { this.overlay('zoomBlur', 0.35, 0.4); this.game.addShake?.(0.3); }
        this.rageAura(z, 2);   // phase C frenzy: red rim, steam and embers from here on
      }
      return;
    }
    if (alt > 3.5) {
      s.gustT -= dt;
      if (s.gustT <= 0) { s.gustT = 1.15; this.wingGust(_v.set(z.pos.x, gy, z.pos.z), alt); }
    }
  }

  /** Boss down (06b §9.6.2): a big dust ring, debris and a shock where it fell. */
  bossDeath(z) {
    const gy = this.groundY(z.pos.x, z.pos.z, z.pos.y);
    this.quake(_w.set(z.pos.x, gy, z.pos.z).clone(), Math.max(6, z.radius * 5), { col: [1.6, 1.2, 0.8], scale: 1.4 });
  }

  /** Tendril pull: dark vortex under the boss, dust streaming in from all around; pulled players see a zoom blur. */
  tendril(z, t = 2.6) {
    const p = _w.set(z.pos.x, z.pos.y + 0.03, z.pos.z).clone();
    this.ground.add('glyph', p, { r: 9, life: t, col: [0.9, 0.3, 1.4], alpha: 0.85, rotV: 2.5, fadeIn: 0.3, fadeOut: 0.4 });
    const n = Math.round(t / 0.05 * Math.min(1, this.k + 0.2));
    for (let i = 0; i < n; i++) {
      const a = R() * TAU, r0 = rr(12, 22), life = rr(1.2, 1.6), sp = (r0 - 3) / life;
      this.P.spawn({ x: p.x + Math.cos(a) * r0, y: p.y + rr(0.2, 0.8), z: p.z + Math.sin(a) * r0, vx: -Math.cos(a) * sp, vy: 0, vz: -Math.sin(a) * sp, delay: (i / n) * (t - 1.2), life,
        size: 0.4, size1: 1.0, color: [0.45, 0.42, 0.38, 0.35], color1: [0.45, 0.42, 0.38, 0], frame: FRAME.dusty + (i & 1), lit: true, ground: p.y, soft: 0.2 });
    }
    const d = this._local(p);
    if (d < 24 && d > 3) this.overlay('zoomBlur', 0.15, t);
  }

  /** Screech: big air rings, small dizzy overlay nearby. */
  screech(z) {
    for (let i = 0; i < 3; i++) this.after(i * 0.12, () => this.fx.shockwave(_v.set(z.pos.x, z.pos.y + z.height * 0.8, z.pos.z), { r0: 0.6, r1: 6, life: 0.55, color: [0.45, 0.5, 0.65], thin: true }));
    if (this._local(z.pos) < 20) this.overlay('zoomBlur', 0.2, 0.25);
  }

  // ------------------------------------------------------------------ supply crates (06b §9.6.4) & level-up (§9.6.5)
  /**
   * Crate glow: light column + cyan gear ring. col: seam colour (killer-only blue (0.3, 0.9, 2.4), open-to-all
   * white-blue (0.6, 0.9, 1.6), boss / rare gold (4, 2.6, 0.8)). Returns { setColor(col), stop() }.
   */
  supplyGlow(pos, col = [0.3, 0.9, 2.4]) {
    const pc = (c) => [c[0] * 0.5, c[1] * 0.5, c[2] * 0.5];
    const pillar = this.pillars.add(_v.set(pos.x, pos.y, pos.z), { r: 0.35, h: 2.5, col: pc(col), taper: 0.7 });
    const gear = this.ground.add('gear', _v.set(pos.x, pos.y + 0.02, pos.z), { r: 0.75, life: Infinity, rotV: 0.6, col: [col[0] * 0.5, col[1] * 0.9, col[2] * 0.7], fadeIn: 0.4, fadeOut: 0.4 });
    return {
      setColor: (c) => { pillar.col = pc(c); if (gear) gear.col = [c[0] * 0.5, c[1] * 0.9, c[2] * 0.7]; },
      stop: () => { pillar.stop(0.4); gear?.stop(0.4); },
    };
  }

  /** Crate touch-down: dust puffs + a small shock ring. */
  supplyLand(pos) {
    this._dust(pos.x, pos.y, pos.z, 3, { r: 0.3, size: 0.25, size1: 0.9, speed: 1.6, life: 0.9, a: 0.4 });
    this.ground.add('shock', _v.set(pos.x, pos.y + 0.03, pos.z), { r: 0.2, r1: 1.4, life: 0.3, col: [0.6, 0.7, 0.9], width: 0.12 });
  }

  /** Crate opened: 12 sparkles shoot up out of the lid. */
  supplyOpen(pos, col = [1.2, 2.2, 4.0]) {
    for (let i = 0; i < 12; i++) {
      const a = R() * TAU;
      this.marks.add('star', { x: pos.x + Math.cos(a) * 0.2, y: pos.y + 0.55, z: pos.z + Math.sin(a) * 0.2, vx: Math.cos(a) * rr(0.3, 0.8), vy: rr(2, 3), vz: Math.sin(a) * rr(0.3, 0.8), gravity: 2.5, life: 0.6, size: rr(0.1, 0.18), color: [col[0], col[1], col[2], 1], color1: [col[0] * 0.5, col[1] * 0.5, col[2] * 0.5, 0], rot: R() * 6 });
    }
    this.P.spawn({ additive: true, x: pos.x, y: pos.y + 0.5, z: pos.z, life: 0.15, size: 0.6, size1: 1.2, color: [col[0], col[1], col[2], 1], color1: [0, 0, 0, 0], frame: FRAME.glow });
  }

  /** Level-up flourish at the player's feet (own view only): gold ring + rising gold sparks. */
  levelUp(pos) {
    this.ground.add('shock', _v.set(pos.x, pos.y + 0.03, pos.z), { r: 0.3, r1: 1.4, life: 0.5, col: [1.5, 1.1, 0.35], alpha: 0.7, width: 0.06 });
    for (let i = 0; i < 10; i++) {
      const a = R() * TAU, r = rr(0.35, 0.7);
      this.marks.add('glint', { x: pos.x + Math.cos(a) * r, y: pos.y + rr(0.1, 0.5), z: pos.z + Math.sin(a) * r, vy: rr(1.5, 2.5), drag: 0.8, delay: R() * 0.15, life: 0.8, size: 0.06, color: [3, 2.2, 0.7, 1], color1: [1.5, 0.9, 0.2, 0], rot: Math.PI / 4 });
    }
  }
}
