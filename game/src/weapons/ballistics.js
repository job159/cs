// Hitscan bullets with target penetration and range falloff, plus a small projectile system for
// rockets / grenades / bolts. Targets (zombies, bosses, destructibles) are provided by game.targets:
//   raycast(origin, dir, maxDist) -> [{ target, dist, point, normal, part, mult }] sorted by distance
//   (part: 'head' | 'chest' | 'body' | 'limb' | 'weak'; mult: hitbox damage multiplier override)
// and each target implements damage(info).
import * as THREE from 'three';
import { SURF } from '../world/collision.js';

const _o = new THREE.Vector3();
const _hit = {};

export const PART_MULT = { head: 1, chest: 1, body: 1, limb: 0.75, weak: 2 };

export function falloff(def, dist) {
  const [r0, r1, min] = def.range || [30, 80, 0.7];
  if (dist <= r0) return 1;
  if (dist >= r1) return min;
  return 1 - (1 - min) * ((dist - r0) / (r1 - r0));
}

/**
 * Fires one bullet. Returns { end: Vector3, hitWorld: boolean, kills, hits } for tracers & feedback.
 * opts: shooter (player id), dmgMul (levels/buffs), onHit(info) callback (hit markers),
 */
export function fireBullet(game, origin, dir, def, opts = {}) {
  const maxRange = def.maxRange ?? 400;
  const col = game.world.collision;
  const wh = col ? col.raycast(origin, dir, maxRange, _hit) : null;
  const wallDist = wh ? wh.dist : maxRange;
  const result = { end: _o.copy(origin).addScaledVector(dir, wallDist).clone(), hitWorld: !!wh, hits: 0, kills: 0, headshot: false };
  let power = 1;
  const pen = def.pen ?? 1;
  if (game.targets) {
    const list = game.targets.raycast(origin, dir, wallDist);
    for (const h of list) {
      const part = h.part || 'body';
      const partMul = part === 'head' ? (def.head ?? 4) : (h.mult ?? PART_MULT[part] ?? 1);
      const amount = def.dmg * falloff(def, h.dist) * partMul * power * (opts.dmgMul ?? 1);
      const info = {
        amount, part, point: h.point, normal: h.normal, dir, dist: h.dist,
        knock: (def.knock ?? 1) * power, stagger: (def.stagger ?? 0.2) * power, weapon: def.id, shooter: opts.shooter, headshot: part === 'head',
        pellets: def.pellets || 1,
      };
      const res = h.target.damage(info);
      result.hits++;
      if (part === 'head') result.headshot = true;
      if (res?.killed) result.kills++;
      opts.onHit?.(info, res, h.target);
      // penetration: each body eats power; armoured targets eat more
      power *= Math.max(0, Math.min(0.85, (pen - (h.target.armor ?? 0)) / (pen + 1.2)));
      if (power < 0.12) { result.end.copy(h.point); return result; }
    }
  }
  if (wh) {
    game.fx?.impact(wh.surf, wh.point, wh.normal, dir, { big: def.pellets ? 0.6 : (def.dmg > 100 ? 1.6 : 1) });
    if (Math.random() < (def.pellets ? 0.12 : 0.5)) game.audio?.play('impact_' + (SURF_SOUND[wh.surf] || 'concrete'), { pos: wh.point, volume: def.pellets ? 0.6 : 1 });
    game.noise?.(wh.point, 8); // zombies hear impacts
  }
  return result;
}

const SURF_SOUND = { [SURF.concrete]: 'concrete', [SURF.metal]: 'metal', [SURF.wood]: 'wood', [SURF.dirt]: 'dirt', [SURF.sand]: 'dirt', [SURF.glass]: 'glass', [SURF.water]: 'water', [SURF.tile]: 'concrete', [SURF.grate]: 'metal', [SURF.flesh]: 'flesh' };

/** Splash damage to every target within radius (linear falloff, line of sight from the centre). */
export function splash(game, center, radius, dmg, { knock = 8, shooter, weapon, selfDamage = 0, falloffMin = 0.2 } = {}) {
  if (!game.targets) return 0;
  let kills = 0;
  for (const t of game.targets.inRadius(center, radius)) {
    const d = t.distanceTo(center);
    const f = Math.max(falloffMin, 1 - d / radius);
    const dir = t.center().sub(center).normalize();
    const res = t.damage({ amount: dmg * f, part: 'body', point: t.center(), normal: dir.clone().negate(), dir, dist: d, knock: knock * f, stagger: 1, weapon, shooter, explosive: true });
    if (res?.killed) kills++;
  }
  return kills;
}

/** Simple projectiles (rockets, grenades, bolts). */
export class Projectiles {
  constructor(game) { this.game = game; this.list = []; }

  spawn(p) {
    // p: { pos, vel, gravity, radius, life, bounce, fuse, onHit(pos, normal, target), mesh?, trail?, drag }
    p.age = 0;
    if (p.mesh) this.game.scene.add(p.mesh);
    this.list.push(p);
    return p;
  }

  update(dt) {
    const col = this.game.world.collision;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.age += dt;
      const steps = Math.max(1, Math.ceil(p.vel.length() * dt / 0.5));
      const h = dt / steps;
      let done = false;
      for (let s = 0; s < steps && !done; s++) {
        p.vel.y -= (p.gravity ?? 0) * h;
        if (p.drag) p.vel.multiplyScalar(1 - p.drag * h);
        const len = p.vel.length() * h;
        if (len > 1e-5) {
          const dir = _o.copy(p.vel).normalize();
          // targets first (direct hits)
          if (p.hitTargets !== false && this.game.targets) {
            const th = this.game.targets.raycast(p.pos, dir, len + (p.radius || 0.05))[0];
            if (th && p.onHit) { p.pos.copy(th.point); done = p.onHit(p, th.point, th.normal, th.target) !== false; if (done) break; }
          }
          const wh = col.raycast(p.pos, dir, len + (p.radius || 0.05), _hit);
          if (wh) {
            if (p.bounce && (p.fuse ?? 0) > 0) {
              p.pos.copy(wh.point).addScaledVector(wh.normal, (p.radius || 0.05) + 0.01);
              const vn = p.vel.dot(wh.normal);
              p.vel.addScaledVector(wh.normal, -(1 + p.bounce) * vn).multiplyScalar(0.7);
              p.onBounce?.(p, wh);
              continue;
            }
            p.pos.copy(wh.point).addScaledVector(wh.normal, 0.05);
            done = p.onHit ? p.onHit(p, wh.point, wh.normal, null, wh) !== false : true;
            continue;
          }
          p.pos.addScaledVector(p.vel, h);
        }
      }
      if (!done && p.fuse !== undefined && p.age >= p.fuse) { p.onFuse?.(p); done = true; }
      if (!done && p.age > (p.life ?? 10)) done = true;
      p.onUpdate?.(p, dt);
      if (p.mesh) {
        p.mesh.position.copy(p.pos);
        if (p.vel.lengthSq() > 0.01 && p.faceVelocity !== false) p.mesh.lookAt(_o.copy(p.pos).add(p.vel));
      }
      if (done) { if (p.mesh) this.game.scene.remove(p.mesh); p.onEnd?.(p); this.list.splice(i, 1); }
    }
  }
}
