// AI teammates for solo / short-handed rooms (host only). Each bot follows the squad leader in a loose
// formation over the nav grid, keeps some distance from zombies, engages the closest visible threat with
// human-like reaction time and aim error, reloads, buys better guns between rounds, can be downed and
// revived. Rendered through RemotePlayer so they look exactly like human teammates.
import * as THREE from 'three';
import { RemotePlayer } from './remote.js';
import { WEAPONS } from '../weapons/defs.js';
import { fireBullet } from '../weapons/ballistics.js';
import { rand, angleDiff, clamp, gauss } from '../engine/util.js';

const NAMES = ['阿傑', '小雪', '老陳', '鐵牛'];
const LOADOUT = [['ump', 'mp5'], ['akm', 'm4', 'scar'], ['m249', 'aug'], ['mg42', 'awp', 'usas']]; // by round tier
const _v = new THREE.Vector3();
const _d = new THREE.Vector3();

let botId = 1000;

class Bot {
  constructor(game, slot) {
    this.game = game;
    this.id = botId++;
    this.slot = slot;
    this.name = '［AI］' + NAMES[(slot - 1) % NAMES.length];
    this.view = new RemotePlayer(game, { id: this.id, name: this.name, slot });
    this.pos = this.view.pos;
    this.pos.copy(game.player.pos).add(new THREE.Vector3(rand(-2, 2), 0, rand(-2, 2)));
    this.yaw = 0; this.pitch = 0;
    this.hp = 100; this.alive = true; this.downed = false; this.downT = 0;
    this.weapon = WEAPONS.ump; this.ammo = this.weapon.mag; this.reloadT = 0;
    this.fireCd = 0; this.reaction = 0; this.target = null; this.burst = 0;
    this.offset = new THREE.Vector3(Math.cos(slot * 2.1) * 3, 0, Math.sin(slot * 2.1) * 3);
    this.thinkT = 0;
    this.view.setWeapon(this.weapon.id);
  }

  damage(amount) {
    if (!this.alive || this.downed) return;
    this.hp -= amount * 0.8;
    if (this.hp <= 0) { this.hp = 0; this.downed = true; this.downT = 25; this.game.hud?.toast(`${this.name} 倒下了！靠近按 E 救援`, 2000); }
  }

  update(dt, mgr) {
    const g = this.game;
    this.fireCd -= dt;
    if (this.downed) {
      this.downT -= dt;
      // revive: the local player holds use nearby
      const near = g.player.pos.distanceTo(this.pos) < 2;
      if (near) { g.hud?.setPrompt(`按住 E 救援 ${this.name}`); if (g.input.state.held.use) { this.reviveT = (this.reviveT || 0) + dt; if (this.reviveT > 2.5) this.revive(); } else this.reviveT = 0; }
      if (this.downT <= 0) { this.downed = false; this.alive = false; }
      this._sync(dt, 0);
      return;
    }
    if (!this.alive) { this.view.alive = false; return; }
    // ---- think: pick target a few times per second
    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = 0.25;
      let best = null, bd = 42;
      for (const z of g.zombies.list) {
        if (!z.alive) continue;
        const d = z.pos.distanceTo(this.pos);
        if (d < bd && mgr.losFrom(this.pos, z)) { bd = d; best = z; }
      }
      if (best !== this.target) { this.target = best; this.reaction = rand(0.25, 0.55); }
    }
    // ---- move: formation around the leader, back off from close zombies
    const leader = g.player.pos;
    const goal = _v.copy(leader).add(this.offset);
    const t = this.target;
    let speed = 4.4;
    if (t) {
      const d = t.pos.distanceTo(this.pos);
      if (d < 5) { goal.copy(this.pos).add(_d.subVectors(this.pos, t.pos).setY(0).normalize().multiplyScalar(4)); speed = 4.8; }
    }
    _d.subVectors(goal, this.pos).setY(0);
    const dist = _d.length();
    let moved = 0;
    if (dist > 1.2) {
      let dir = _d.normalize();
      const nav = g.zombies.nav;
      if (nav && dist > 6) {
        // follow the shared flow field (it points at the nearest player = usually the leader)
        const f = nav.flowDir(this.pos.x, this.pos.z, new THREE.Vector3());
        if (f) dir = f;
      }
      const step = Math.min(dist - 1, speed * dt);
      const nx = this.pos.x + dir.x * step, nz = this.pos.z + dir.z * step;
      if (!nav || nav.walkable(nav.index(nx, nz))) { this.pos.x = nx; this.pos.z = nz; moved = step / dt; }
      if (nav) this.pos.y = nav.heightAt(this.pos.x, this.pos.z, this.pos.y);
      if (!t) this.yaw = Math.atan2(-dir.x, -dir.z);
    }
    // teleport back if hopelessly lost
    if (this.pos.distanceTo(leader) > 45) this.pos.copy(leader).add(this.offset);
    // ---- shoot
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) this.ammo = this.weapon.mag; }
    if (t && t.alive) {
      const aimP = t.center(new THREE.Vector3());
      aimP.y += t.height * (Math.random() < 0.25 ? 0.3 : 0.05);
      const eye = _v.copy(this.pos); eye.y += 1.55;
      const want = Math.atan2(-(aimP.x - eye.x), -(aimP.z - eye.z));
      this.yaw += angleDiff(this.yaw, want) * Math.min(1, dt * 8);
      this.pitch = -Math.atan2(aimP.y - eye.y, Math.hypot(aimP.x - eye.x, aimP.z - eye.z));
      this.reaction -= dt;
      if (this.reaction <= 0 && this.reloadT <= 0 && this.fireCd <= 0 && Math.abs(angleDiff(this.yaw, want)) < 0.15) {
        if (this.ammo <= 0) { this.reloadT = this.weapon.reload ?? 2.4; }
        else {
          this.ammo--;
          this.fireCd = 60 / this.weapon.rpm * (this.weapon.mode === 'auto' ? 1.15 : 1.6);
          const err = 0.035 + (moved > 0.5 ? 0.03 : 0);
          const dir = aimP.sub(eye).normalize();
          dir.x += gauss() * err; dir.y += gauss() * err * 0.6; dir.z += gauss() * err;
          dir.normalize();
          const pellets = this.weapon.pellets || 1;
          let end = null;
          for (let i = 0; i < pellets; i++) {
            const pd = pellets > 1 ? dir.clone().add(new THREE.Vector3(gauss() * 0.06, gauss() * 0.06, gauss() * 0.06)).normalize() : dir;
            const res = fireBullet(g, eye.clone(), pd, this.weapon, { shooter: this.id, dmgMul: 0.75 * (mgr.dmgMul || 1) });
            end = res.end;
          }
          this.view.fired(this.weapon.id, end ? [end.x, end.y, end.z] : null);
        }
      }
    }
    this._sync(dt, moved);
  }

  revive() { this.downed = false; this.hp = 50; this.reviveT = 0; this.game.hud?.toast(`${this.name} 已救起`); this.game.audio?.play('revive'); }

  rearm(round) {
    const tier = Math.min(LOADOUT.length - 1, Math.floor((round - 1) / 2.5));
    const pool = LOADOUT[tier].filter((id) => WEAPONS[id]);
    if (!pool.length) return;
    this.weapon = WEAPONS[pool[(this.slot + round) % pool.length]];
    this.ammo = this.weapon.mag;
    this.view.setWeapon(this.weapon.id);
    if (!this.alive || this.downed) { this.alive = true; this.downed = false; this.hp = 100; this.pos.copy(this.game.player.pos).add(this.offset); }
  }

  _sync(dt, moved) {
    const v = this.view;
    v.yaw = this.yaw; v.pitch = this.pitch; v.alive = this.alive; v.downed = this.downed; v.hp = this.hp;
    v.buf.length = 0; // driven directly, no interpolation
    v.update(dt, 0);
    if (v.loco) v.loco.timeScale = Math.min(1.6, moved / 3.5 + (moved > 0.1 ? 0.3 : 0));
  }
}

export class BotSquad {
  constructor(game, count) {
    this.game = game;
    this.bots = [];
    for (let i = 0; i < count; i++) this.bots.push(new Bot(game, i + 1));
    this.lastRound = 0;
  }

  /** LOS from a point to a zombie (cached per frame by the zombie manager's collision). */
  losFrom(p, z) {
    const col = this.game.world.collision;
    if (!col) return true;
    return !col.blocked(_v.set(p.x, p.y + 1.5, p.z), _d.set(z.pos.x, z.pos.y + z.height * 0.6, z.pos.z));
  }

  players() {
    return this.bots.map((b) => ({ id: b.id, pos: b.pos, alive: b.alive && !b.downed, downed: b.downed, bot: b }));
  }

  update(dt) {
    const g = this.game;
    const m = g.match;
    if (m && m.round !== this.lastRound && m.state === 'round') { this.lastRound = m.round; for (const b of this.bots) b.rearm(m.round); }
    this.dmgMul = g.zombies?.dmgMul || 1;
    for (const b of this.bots) b.update(dt, this);
  }

  damage(id, amount) { this.bots.find((b) => b.id === id)?.damage(amount); }
}
