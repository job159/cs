// Local player vitals: health, armour (kevlar absorbs part of every hit and wears down), helmet
// (reduces hit flinch), status effects (slow), damage feedback (screen, punch, sound, haptics, hit
// direction for the HUD) and the downed state.
import { clamp } from '../engine/util.js';
import { haptic } from '../weapons/arsenal.js';

export class PlayerStatus {
  constructor(game) {
    this.game = game;
    this.maxHp = 100;
    this.hp = 100;
    this.armor = 0;           // 0..100
    this.helmet = false;
    this.alive = true;
    this.downed = false;
    this.downT = 0;
    this.slowT = 0;
    this.slowMul = 1;
    this.lastHitAt = -10;
    this.painAt = -10;
    this.damageFx = 0;
    this.hitDirs = [];        // [{ angle, t }] for the HUD damage indicator
    this.invuln = 0;
  }

  reset() {
    this.hp = this.maxHp; this.alive = true; this.downed = false; this.slowT = 0; this.slowMul = 1; this.damageFx = 0; this.invuln = 1.5;
  }

  /** opts: { from: Vector3, knock: Vector3, explosive, dot, acid, zombie } */
  damage(amount, opts = {}) {
    const g = this.game;
    if (!this.alive || this.invuln > 0 || amount <= 0) return 0;
    // downed: hits eat into the bleed-out instead (zombies finish off a player nobody covers)
    if (this.downed) { this.downT -= amount * 0.15; this.damageFx = Math.min(1, this.damageFx + 0.2); return 0; }
    let dmg = amount;
    // kevlar takes half of the hit and loses durability
    if (this.armor > 0 && !opts.dot) {
      const absorbed = Math.min(this.armor, dmg * 0.5);
      this.armor = Math.max(0, this.armor - absorbed * 0.7);
      dmg -= absorbed;
      g.audio?.play('armor_hit', { volume: 0.6 });
    }
    this.hp -= dmg;
    this.lastHitAt = g.time;
    if (!opts.dot) {
      const helm = this.helmet ? 0.45 : 1;
      this.damageFx = Math.min(1, this.damageFx + 0.25 + dmg / 45);
      // flinch away from the hit
      if (opts.from) {
        const p = g.player.pos;
        const ang = Math.atan2(opts.from.x - p.x, opts.from.z - p.z);
        const rel = ang - g.player.yaw - Math.PI; // 0 = in front
        this.hitDirs.push({ angle: rel, t: 1.2 });
        const side = Math.sin(rel);
        g.punch.impulse(0.12 * helm * Math.min(2, dmg / 15), -side * 0.1 * helm, side * 0.18 * helm);
      } else g.punch.impulse(0.1 * helm, 0, 0);
      if (opts.knock) g.player.addImpulse(opts.knock.x, opts.knock.y, opts.knock.z);
      g.addShake(Math.min(0.5, dmg / 60) * helm);
      haptic(Math.min(80, 20 + dmg * 2));
      if (g.time - this.painAt > 0.45) { this.painAt = g.time; g.audio?.play('player_pain', { volume: 0.9 }); }
      g.audio?.play('impact_flesh', { volume: 0.7 });
    } else this.damageFx = Math.min(1, this.damageFx + dmg * 0.02);
    if (this.hp <= 0) this._down();
    return dmg;
  }

  heal(n) { if (this.alive && !this.downed) this.hp = Math.min(this.maxHp, this.hp + n); }

  applySlow(time, mul) { this.slowT = Math.max(this.slowT, time); this.slowMul = Math.min(this.slowMul, mul); }

  _down() {
    this.hp = 0;
    this.downed = true;
    this.downT = 20;
    this.game.audio?.play('player_downed');
    this.game.onPlayerDowned?.();
  }

  revive(hp = 30) { this.downed = false; this.hp = hp; this.invuln = 2; this.game.audio?.play('revive'); }

  update(dt) {
    const r = this.game.renderer.post;
    this.invuln = Math.max(0, this.invuln - dt);
    this.damageFx = Math.max(0, this.damageFx - dt * 1.8);
    if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.slowMul = 1; }
    for (let i = this.hitDirs.length - 1; i >= 0; i--) { this.hitDirs[i].t -= dt; if (this.hitDirs[i].t <= 0) this.hitDirs.splice(i, 1); }
    if (this.downed) {
      this.downT -= dt;
      if (this.downT <= 0) { this.downed = false; this.alive = false; this.game.onPlayerDied?.(); }
    }
    r.damage = this.damageFx;
    const low = !this.alive ? 0.3 : this.downed ? 1 : clamp((35 - this.hp) / 35, 0, 1); // dead: spectating, keep the view clear
    r.lowHealth = low;
    r.aberration = this.damageFx * 0.02;
  }

  /** Bled out: no control at all until a revive (round end / wipe retry); Game spectates meanwhile. */
  get speedMul() { return this.alive ? (this.downed ? 0.25 : 1) * this.slowMul : 0; }
}
