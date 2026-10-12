// Boss brain framework. A boss is a Zombie (so it reuses hitboxes, damage, animation, networking)
// whose behaviour is delegated to a brain:
//   - phases by HP fraction with transition hooks (rage, metamorphosis...)
//   - weighted attack picker with ranges, cooldowns, phase gates and line-of-sight requirements
//   - attacks are small timelines: start() then events at times, update() per frame, done after `dur`
//   - area damage helpers (circle / cone / line) that hit any player (local or remote)
//   - fx(kind, data): visuals replicated to clients (onFx runs everywhere, damage only on the host)
import * as THREE from 'three';
import { angleDiff, rand, pick } from '../../engine/util.js';

const _v = new THREE.Vector3();

export class BossBrain {
  constructor(z, mgr) {
    this.z = z;
    this.mgr = mgr;
    this.g = mgr.game;
    this.phase = 0;
    this.attack = null;
    this.cool = Object.create(null);
    this.globalCd = 2;
    this.flying = false;
    this.invuln = 0;
    this.stunT = 0;
    this.speedMul = 1;
    this.phases = [];          // [{ at: 0.6, enter() }] sorted high -> low
    this.attacks = [];         // see pickAttack()
    this.summonT = 25;
  }

  get hpFrac() { return Math.max(0, this.z.hp / this.z.maxHp); }
  get tele() { return this.mgr.telegraphs; }

  /** Damage multiplier for incoming hits (stun windows, invulnerable transitions, weak points). */
  damageMul(info) {
    if (this.invuln > 0) return 0;
    let m = this.stunT > 0 ? 1.5 : 1;
    if (info.box && this.weakBoxes?.includes(info.box)) m *= this.weakMul ?? 2;
    return m;
  }

  // ---------------------------------------------------------------- frame (host only)
  update(dt, target, tdist) {
    const z = this.z;
    this.invuln = Math.max(0, this.invuln - dt);
    this.stunT = Math.max(0, this.stunT - dt);
    this.globalCd -= dt;
    for (const k in this.cool) this.cool[k] -= dt;
    // phase transitions
    while (this.phase < this.phases.length && this.hpFrac <= this.phases[this.phase].at) {
      const ph = this.phases[this.phase++];
      if (this.attack) { this.attack.abort?.(); this.attack = null; }
      ph.enter?.call(this);
    }
    if (this.stunT > 0) return 0;
    // running attack
    if (this.attack) {
      const a = this.attack;
      a.t += dt;
      while (a.ev < a.events.length && a.events[a.ev][0] <= a.t) a.events[a.ev++][1].call(this, a);
      const sp = a.update ? a.update.call(this, dt, a, target) : 0;
      if (a.t >= a.dur) { this.attack = null; this.globalCd = a.recover ?? 0.6; }
      return sp || 0;
    }
    // summons on a timer
    this.summonT -= dt;
    if (this.summonT <= 0 && this.onSummon) { this.summonT = this.summonEvery ?? 30; this.onSummon(); }
    if (!target) return 0;
    if (this.globalCd <= 0) {
      const a = this.pickAttack(target, tdist);
      if (a) { this.start(a, target); return 0; }
    }
    return this.chase(dt, target, tdist);
  }

  pickAttack(target, tdist) {
    const opts = this.attacks.filter((a) => (a.phase ?? 0) <= this.phase && (a.until ?? 99) > this.phase && (this.cool[a.id] ?? 0) <= 0
      && tdist >= (a.min ?? 0) && tdist <= (a.max ?? 999) && (!a.los || this.mgr.losCheck(this.z, target)) && (!a.when || a.when.call(this, target, tdist)));
    if (!opts.length) return null;
    let sum = 0;
    for (const a of opts) sum += a.w ?? 1;
    let r = Math.random() * sum;
    for (const a of opts) { r -= a.w ?? 1; if (r <= 0) return a; }
    return opts[0];
  }

  start(def, target) {
    const a = { def, t: 0, ev: 0, dur: def.dur, events: [...(def.events || [])].sort((x, y) => x[0] - y[0]), update: def.update, recover: def.recover, abort: def.abort, target, data: {} };
    this.cool[def.id] = def.cd ?? 5;
    this.attack = a;
    def.start?.call(this, a, target);
  }

  chase(dt, target, tdist) {
    const z = this.z;
    if (tdist < (this.keepDist ?? 2.5)) { this.face(target.pos, dt, 3); return 0; }
    const dir = z._steer(target, tdist, this.mgr, false);
    if (!dir) return 0;
    this.face(_v.copy(z.pos).add(dir), dt, 2.2);
    const sp = (this.walkSpeed ?? 2.2) * this.speedMul;
    const fx = Math.sin(z.yaw), fz = Math.cos(z.yaw);
    z._move(fx * sp * dt, fz * sp * dt, this.mgr);
    return sp;
  }

  face(p, dt, rate = 4) {
    if (!p) return;
    const want = Math.atan2(p.x - this.z.pos.x, p.z - this.z.pos.z);
    this.z.yaw += angleDiff(this.z.yaw, want) * Math.min(1, rate * dt);
  }

  // ---------------------------------------------------------------- damage helpers (host)
  players() { return this.mgr.players(); }

  hurtCircle(center, r, dmg, opts = {}) {
    for (const p of this.players()) {
      const d = Math.hypot(p.pos.x - center.x, p.pos.z - center.z);
      if (d > r || Math.abs(p.pos.y - center.y) > (opts.height ?? 2.5)) continue;
      if (opts.jumpable && p.local && !this.g.player.onGround && this.g.player.pos.y > center.y + 0.35) continue;
      const k = opts.knock ? _v.set(p.pos.x - center.x, 0, p.pos.z - center.z).normalize().multiplyScalar(opts.knock).setY(opts.lift ?? 3).clone() : null;
      this.g.damagePlayer(dmg * (this.mgr.dmgMul || 1) * (opts.falloff ? 1 - (d / r) * 0.5 : 1), { from: center, player: p, knock: k, explosive: opts.explosive });
      opts.onHit?.(p);
    }
  }

  hurtCone(origin, yaw, r, half, dmg, opts = {}) {
    for (const p of this.players()) {
      const dx = p.pos.x - origin.x, dz = p.pos.z - origin.z;
      const d = Math.hypot(dx, dz);
      if (d > r) continue;
      const a = Math.abs(angleDiff(yaw, Math.atan2(dx, dz)));
      if (a > half) continue;
      const k = opts.knock ? new THREE.Vector3(dx / (d || 1) * opts.knock, opts.lift ?? 2.5, dz / (d || 1) * opts.knock) : null;
      this.g.damagePlayer(dmg * (this.mgr.dmgMul || 1), { from: origin, player: p, knock: k });
      opts.onHit?.(p);
    }
  }

  hurtLine(origin, yaw, L, w, dmg, opts = {}) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    for (const p of this.players()) {
      const dx = p.pos.x - origin.x, dz = p.pos.z - origin.z;
      const along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
      if (along < 0 || along > L || side > w) continue;
      const k = opts.knock ? new THREE.Vector3(fz * Math.sign(dx * fz - dz * fx) * opts.knock, opts.lift ?? 2.5, -fx * Math.sign(dx * fz - dz * fx) * opts.knock) : null;
      this.g.damagePlayer(dmg * (this.mgr.dmgMul || 1), { from: origin, player: p, knock: k });
      opts.onHit?.(p);
    }
  }

  /** Visual effect replicated to every client (and played locally). */
  fx(kind, data = {}) {
    this.mgr.net?.fx('boss', { id: this.z.id, k: kind, d: data });
    this.onFx(kind, data);
  }
  onFx() {}

  summon(type, n, radius = 6) {
    const z = this.z;
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      this.mgr.spawn(type, new THREE.Vector3(z.pos.x + Math.cos(a) * radius, z.pos.y, z.pos.z + Math.sin(a) * radius));
    }
  }

  ground(p) { return this.mgr.nav ? this.mgr.nav.heightAt(p.x, p.z, p.y) : p.y; }
  randomPlayer() { const ps = this.players(); return ps.length ? pick(ps) : null; }
}
