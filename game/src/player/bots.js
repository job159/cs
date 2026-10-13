// AI teammates for solo / short-handed rooms (host only). Each bot follows the squad leader in a loose
// formation over the nav grid, keeps some distance from zombies, engages the closest visible threat with
// human-like reaction time and aim error, reloads, buys better guns between rounds, can be downed and
// revived, and goes to get a downed human teammate back up. Rendered through RemotePlayer so they look
// exactly like human teammates.
import * as THREE from 'three';
import { RemotePlayer } from './remote.js';
import { WEAPONS, isListed, listed } from '../weapons/defs.js';
import { fireBullet } from '../weapons/ballistics.js';
import { NAV } from '../world/nav.js';
import { rand, angleDiff, clamp, gauss } from '../engine/util.js';

const NAMES = ['阿傑', '小雪', '老陳', '鐵牛'];
// by round tier (rounds 1-3, 4-5, 6+); only weapons this build offers (defs.js listed(): a bot with an unlisted gun
// would show empty hands), standard issue only (premium specials run on the player's arsenal)
const LOADOUT = [['ump', 'mp5'], ['akm', 'm4', 'vector'], ['m4', 'akm']];
const RESCUE_TIME = 3;      // s a bot kneels next to a downed teammate to get them up
const STEP = 0.55;          // = world/nav.js STEP (max height step between linked cells)
const INF = 0x7fffffff;
const N8 = [[1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10], [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14]];
const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const _f = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _e = new THREE.Vector3();

let botId = 1000;

/**
 * Distance field over the nav grid from ONE point (the leader, or a downed teammate). The shared zombie
 * field can't steer bots: every alive bot is one of its sources, so near a bot it points back at the bot.
 * Same 8-neighbour Dial BFS / edge rules as NavGrid.computeField; rebuilt when the source changes cell.
 */
class Field {
  constructor(nav) { this.nav = nav; this.dist = new Int32Array(nav.w * nav.h).fill(INF); this.src = -2; this.t = -1e9; this.buckets = Array.from({ length: 15 }, () => []); }

  seed(p, time) {
    const nav = this.nav, k0 = nav.nearestWalkable(p.x, p.z, 8);
    if (k0 === this.src || time - this.t < 0.25) return this;
    this.src = k0; this.t = time;
    const { w, h, heights, flags } = nav, dist = this.dist, buckets = this.buckets;
    dist.fill(INF);
    for (const b of buckets) b.length = 0;
    if (k0 < 0) return this;
    dist[k0] = 0; buckets[0].push(k0);
    let pending = 1, cur = 0;
    while (pending > 0) {
      const bucket = buckets[cur % 15];
      if (!bucket.length) { cur++; continue; }
      const k = bucket.pop(); pending--;
      if (dist[k] !== cur) continue;
      const i = k % w, j = (k / w) | 0, hk = heights[k];
      for (const [di, dj, c] of N8) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
        const nk = nj * w + ni;
        if (!(flags[nk] & NAV.WALK) || Math.abs(heights[nk] - hk) > STEP) continue;
        if (c === 14 && (!(flags[j * w + ni] & NAV.WALK) || !(flags[nj * w + i] & NAV.WALK))) continue; // no corner cutting
        const nd = cur + c;
        if (nd < dist[nk]) { dist[nk] = nd; buckets[nd % 15].push(nk); pending++; }
      }
    }
    return this;
  }

  /** Walking distance (m) from cell k to the source; Infinity if not connected. */
  meters(k) { return k >= 0 && this.dist[k] < INF ? this.dist[k] * this.nav.cell / 10 : Infinity; }

  /** Unit xz step down the field (only along edges the BFS links); null at the source / unreachable. */
  dir(x, z, y, out) {
    const nav = this.nav, k = nav.index(x, z);
    if (k < 0) return null;
    const { w, h, heights, flags } = nav, dist = this.dist;
    const walk = nav.walkable(k), hk = walk ? heights[k] : y;
    let best = walk ? dist[k] : INF, bk = -1;
    const i = k % w, j = (k / w) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
      const nk = nj * w + ni;
      if (dist[nk] >= best || !(flags[nk] & NAV.WALK) || Math.abs(heights[nk] - hk) > STEP) continue;
      if (di && dj && (!(flags[j * w + ni] & NAV.WALK) || !(flags[nj * w + i] & NAV.WALK))) continue;
      best = dist[nk]; bk = nk;
    }
    if (bk < 0) return null;
    nav.cellCenter(bk, out);
    out.x -= x; out.z -= z; out.y = 0;
    const l = Math.hypot(out.x, out.z);
    return l < 1e-4 ? null : out.multiplyScalar(1 / l);
  }
}

class Bot {
  constructor(game, slot, squad) {
    this.game = game;
    this.squad = squad;
    this.id = botId++;
    this.slot = slot;
    this.name = '［AI］' + NAMES[(slot - 1) % NAMES.length];
    this.view = new RemotePlayer(game, { id: this.id, name: this.name, slot });
    this.pos = this.view.pos;
    this.yaw = 0; this.pitch = 0;
    this.hp = 100; this.alive = true; this.downed = false; this.downT = 0;
    this.weapon = WEAPONS.ump; this.ammo = this.weapon.mag; this.reloadT = 0;
    this.fireCd = 0; this.reaction = 0; this.target = null; this.burst = 0;
    this.offset = new THREE.Vector3(Math.cos(slot * 2.1) * 3, 0, Math.sin(slot * 2.1) * 3);
    this.thinkT = 0;
    this.rescue = null; this.rescueT = 0;     // downed human (playerList entry) this bot is getting up
    this.stuckP = new THREE.Vector3(); this.stuckT = 0; this.tryT = 0;
    this._placeNear(game.player.pos);
    this.slotGoal = this.pos.clone();          // formation spot, re-validated a few times per second
    this.view.setWeapon(this.weapon.id);
  }

  damage(amount) {
    if (!this.alive) return;
    if (this.downed) { this.downT -= amount * 0.15; return; } // hits on a downed bot shorten its bleed-out
    this.hp -= amount * 0.8;
    this.rescueT = 0; // a hit breaks a revive in progress
    if (this.hp <= 0) { this.hp = 0; this.downed = true; this.downT = 25; this.rescue = null; this.game.hud?.toast(`${this.name} 倒下了！靠近按 E 救援`, 2000); }
  }

  update(dt, mgr) {
    const g = this.game;
    this.fireCd -= dt;
    if (this.downed) {
      // bleeding out; a teammate holding use next to us gets us up (Game._botRevive)
      this.downT -= dt;
      if (this.downT <= 0) { this.downed = false; this.alive = false; }
      this._sync(dt, 0);
      return;
    }
    if (!this.alive) { this._sync(dt, 0); return; } // the view plays the death clip and keeps the body
    const leader = g.player.pos;
    // ---- think: pick target a few times per second
    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = 0.25;
      let best = null, bd = 42;
      for (const z of g.zombies.list) {
        if (!z.alive) continue;
        // ranged specials (acid spitters, screamers) first, like a player would: they hang back and wear the squad down
        const d = z.pos.distanceTo(this.pos) - (z.def.spit || z.def.scream ? 10 : 0);
        if (d < bd && mgr.losFrom(this.pos, z)) { bd = d; best = z; }
      }
      if (best !== this.target) { this.target = best; this.reaction = rand(0.25, 0.55); }
      this._spot(leader, this.slotGoal);
    }
    // ---- move: formation around the leader (or straight to a downed teammate), back off from close zombies
    const r = this.rescue;
    const goal = _v.copy(r ? r.pos : this.slotGoal);
    const t = this.target;
    let speed = 4.4, backoff = false;
    if (t) {
      const d = t.pos.distanceTo(this.pos);
      if (d < (r ? 3 : 5)) { goal.copy(this.pos).add(_d.subVectors(this.pos, t.pos).setY(0).normalize().multiplyScalar(4)); speed = 4.8; backoff = true; }
    }
    // a boss telegraph under our feet: dive clear of it first (a rescue waits)
    const out = this.squad.escape(this.pos, _e);
    if (out) { goal.copy(this.pos).addScaledVector(out, 4); speed = 5.2; backoff = true; }
    // ---- revive: kneel next to the downed teammate, no shooting; a hit or a zombie in our face starts it over
    if (r && !backoff && Math.hypot(r.pos.x - this.pos.x, r.pos.z - this.pos.z) < 1.5) {
      this.rescueT += dt;
      this.yaw = Math.atan2(-(r.pos.x - this.pos.x), -(r.pos.z - this.pos.z)); this.pitch = 0.6;
      if (r.local) g.hud?.setPrompt(`${this.name} 正在救援你 ${Math.min(99, Math.floor((this.rescueT / RESCUE_TIME) * 100))}%`, false);
      if (this.rescueT >= RESCUE_TIME) {
        g.hud?.toast(`${this.name} 救起了${r.local ? '你' : ' ' + (g.net?.remotes.get(r.id)?.name || '隊友')}`, 2000);
        g.revivePlayer(r, this.id);
        this.rescue = null; this.rescueT = 0; this.pitch = 0;
      }
      this._sync(dt, 0);
      return;
    }
    this.rescueT = 0;
    _d.subVectors(goal, this.pos).setY(0);
    const dist = _d.length();
    const nav = g.zombies.nav;
    let moved = 0;
    if (dist > 1.2) {
      let dir = _d.normalize();
      if (nav && dist > 6 && !backoff) {
        // the squad's own field toward the leader / downed teammate (the zombie field has every bot as a goal)
        const f = mgr.fieldFor(r ? r.pos : leader)?.dir(this.pos.x, this.pos.z, this.pos.y, _f);
        if (f) dir = f;
      }
      const step = Math.min(dist - 1, speed * dt);
      moved = this._step(dir.x * step, dir.z * step, nav) / dt;
      if (!t) this.yaw = Math.atan2(-dir.x, -dir.z);
    }
    // wedged (in geometry, a pocket the direct steer can't leave): re-place next to whoever we're heading for
    if (dist > 3 && !backoff) this.tryT += dt;
    this.stuckT += dt;
    if (this.stuckT > 2.5) {
      if (this.tryT > 2 && this.pos.distanceTo(this.stuckP) < 1) this._placeNear(r ? r.pos : leader);
      this.stuckT = 0; this.tryT = 0; this.stuckP.copy(this.pos);
    }
    // teleport back if hopelessly lost
    if (!r && this.pos.distanceTo(leader) > 45) this._placeNear(leader);
    // ---- shoot
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) this.ammo = this.weapon.mag; }
    if (t && t.alive) {
      const aimP = t.center(new THREE.Vector3());
      // a riot shield stops body shots from the front: go for the head
      aimP.y += t.height * (t.def.frontArmor ? 0.37 : Math.random() < 0.25 ? 0.3 : 0.05);
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

  /** Moves by (dx, dz) over the nav grid, sliding along walls axis by axis like Zombie._move; returns the distance covered. */
  _step(dx, dz, nav) {
    const p = this.pos;
    if (!nav) { p.x += dx; p.z += dz; return Math.hypot(dx, dz); }
    const x0 = p.x, z0 = p.z;
    const ok = (x, z) => { const k = nav.index(x, z); return nav.walkable(k) && Math.abs(nav.heights[k] - p.y) < 0.75; };
    if (ok(x0 + dx, z0 + dz)) { p.x += dx; p.z += dz; }
    else if (ok(x0 + dx, z0)) p.x += dx;
    else if (ok(x0, z0 + dz)) p.z += dz;
    p.y = nav.heightAt(p.x, p.z, p.y);
    return Math.hypot(p.x - x0, p.z - z0);
  }

  /**
   * A standing spot near `a`: our formation slot, else another slot / closer in, else `a`'s own cell. On the
   * nav grid, level with `a`, in its line of sight and a short walk from it (a bare a + offset is often on
   * the far side of a wall, outside the map or inside a building). Skips a squadmate's spot (`key`: their
   * pos when placing, their slotGoal for the formation).
   */
  _spot(a, out, key = 'slotGoal') {
    const g = this.game, nav = g.zombies?.nav, col = g.world.collision;
    if (!nav) return out.copy(a).add(this.offset);
    const f = this.squad.fieldFor(a);
    const ay = nav.heightAt(a.x, a.z, a.y), base = this.slot * 2.1;
    _a.set(a.x, ay + 1.5, a.z);
    for (let n = 0; n < 12; n++) {
      const rad = n < 6 ? 3 : 1.5, ang = base + (n % 6) * Math.PI / 3;
      const k = nav.nearestWalkable(a.x + Math.cos(ang) * rad, a.z + Math.sin(ang) * rad, 3);
      if (k < 0 || Math.abs(nav.heights[k] - ay) > 1 || f.meters(k) > rad * 2.5 + 2) continue;
      nav.cellCenter(k, out);
      if (this.squad.bots.some((o) => o !== this && o[key] && Math.hypot(o[key].x - out.x, o[key].z - out.z) < 0.9)) continue;
      if (col && col.blocked(_a, _b.set(out.x, out.y + 1.5, out.z))) continue;
      return out;
    }
    const k = nav.nearestWalkable(a.x, a.z, 4);
    return k >= 0 && Math.abs(nav.heights[k] - ay) < 1 ? nav.cellCenter(k, out) : out.copy(a);
  }

  _placeNear(a) {
    this._spot(a, this.pos, 'pos');
    this.target = null;
    this.stuckP.copy(this.pos); this.stuckT = 0; this.tryT = 0;
  }

  revive() { this.downed = false; this.hp = 50; this.downT = 0; this.game.hud?.toast(`${this.name} 已救起`); this.game.audio?.play('revive'); }

  rearm(round) {
    const tier = Math.min(LOADOUT.length - 1, Math.floor((round - 1) / 2.5));
    let pool = LOADOUT[tier].filter((id) => isListed(WEAPONS[id]));
    if (!pool.length) pool = listed().filter((w) => (w.cat === 'rifle' || w.cat === 'smg') && !w.special && !w.premium).map((w) => w.id);
    if (pool.length) {
      this.weapon = WEAPONS[pool[(this.slot + round) % pool.length]];
      this.ammo = this.weapon.mag;
      this.view.setWeapon(this.weapon.id);
    }
    if (!this.alive || this.downed) { this.alive = true; this.downed = false; this.downT = 0; this.hp = 100; this._placeNear(this.game.player.pos); }
  }

  /** Round over: the fallen get up next to the leader on 50 + 30, the rest heal 30 (wipe retry: all full). */
  restore(full) {
    const lost = !this.alive || this.downed;
    this.hp = full ? 100 : Math.min(100, (lost ? 50 : this.hp) + 30);
    this.alive = true; this.downed = false; this.downT = 0;
    this.rescue = null; this.rescueT = 0;
    if (lost || full) this._placeNear(this.game.player.pos);
  }

  _sync(dt, moved) {
    const v = this.view;
    v.yaw = this.yaw; v.pitch = this.pitch; v.alive = this.alive; v.downed = this.downed; v.hp = this.hp;
    // clip state for the view (remote.js picks idle / walk / run by speed, aim / reload / revive overlays)
    v.moveSpeed = moved; v.reloading = this.reloadT > 0; v.reviving = this.rescueT > 0; v.aiming = !!(this.target && this.target.alive);
    v.buf.length = 0; // driven directly, no interpolation
    v.update(dt, 0);
  }
}

export class BotSquad {
  constructor(game, count) {
    this.game = game;
    this.fields = new Map();   // source pos (leader / downed teammate Vector3) -> Field
    this.bots = [];
    for (let i = 0; i < count; i++) this.bots.push(new Bot(game, i + 1, this));
    this.lastRound = 0;
    this.lastState = undefined;
  }

  /** LOS from a point to a zombie (cached per frame by the zombie manager's collision). */
  losFrom(p, z) {
    const col = this.game.world.collision;
    if (!col) return true;
    return !col.blocked(_v.set(p.x, p.y + 1.5, p.z), _d.set(z.pos.x, z.pos.y + z.height * 0.6, z.pos.z));
  }

  /** The squad's distance field toward a moving point (keyed by its live Vector3), refreshed on demand. */
  fieldFor(p) {
    const nav = this.game.zombies?.nav;
    if (!nav) return null;
    let f = this.fields.get(p);
    if (!f || f.nav !== nav) { if (this.fields.size >= 4) this.fields.clear(); f = new Field(nav); this.fields.set(p, f); }
    return f.seed(p, this.game.time);
  }

  players() {
    return this.bots.map((b) => ({ id: b.id, pos: b.pos, alive: b.alive && !b.downed, downed: b.downed, bot: b }));
  }

  /**
   * Unit xz direction out of a boss telegraph that `p` stands in (ZombieManager.dangers, pushed by BossBrain.fx;
   * same shapes as its hurtCircle / hurtCone / hurtLine), or null: circles radially, cones and lines sideways.
   */
  escape(p, out) {
    const zm = this.game.zombies, list = zm?.dangers;
    // acid / poison pools (spitters, bloaters, the colossus) too
    for (const h of zm?.hazards || []) {
      const dx = p.x - h.pos.x, dz = p.z - h.pos.z, dist = Math.hypot(dx, dz);
      if (h.dps > 0 && dist < h.r + 0.6 && Math.abs(p.y - h.pos.y) < 1.5) return dist > 0.1 ? out.set(dx / dist, 0, dz / dist) : out.set(1, 0, 0);
    }
    if (!list?.length) return null;
    for (let i = list.length - 1; i >= 0; i--) if (list[i].until < zm.time) list.splice(i, 1);
    for (const { k, d } of list) {
      const dx = p.x - d.p[0], dz = p.z - d.p[2], dist = Math.hypot(dx, dz);
      if (Math.abs(p.y - d.p[1]) > 3) continue;
      if (k === 'teleCircle') {
        if (dist > d.r + 1) continue;
        return dist > 0.1 ? out.set(dx / dist, 0, dz / dist) : out.set(1, 0, 0);
      }
      const fx = Math.sin(d.yaw), fz = Math.cos(d.yaw);
      const side = dx * fz - dz * fx, s = side < 0 ? -1 : 1;
      if (k === 'teleCone') {
        if (dist > d.r + 1 || Math.abs(angleDiff(d.yaw, Math.atan2(dx, dz))) > d.h + 0.25) continue;
        // out past the rim when that is closer than the cone's edge
        if (d.r + 1 - dist < dist * Math.sin(Math.min(1.5, d.h + 0.25))) return out.set(dx / (dist || 1), 0, dz / (dist || 1));
        return out.set(fz * s, 0, -fx * s);
      }
      const along = dx * fx + dz * fz;
      if (along < -1 || along > d.l + 1 || Math.abs(side) > d.w + 1) continue;
      return out.set(fz * s, 0, -fx * s);
    }
    return null;
  }

  /** One bot per downed human goes to get them up (zombies still pick at the downed; nobody else revives them). */
  _assignRescues() {
    const down = this.game.playerList().filter((p) => p.downed && !p.bot);
    for (const b of this.bots) {
      const e = b.rescue && b.alive && !b.downed ? down.find((p) => p.id === b.rescue.id) : null;
      if (!e) b.rescueT = 0;
      b.rescue = e || null;
    }
    for (const p of down) {
      if (this.bots.some((b) => b.rescue === p)) continue;
      let best = null, bd = Infinity;
      for (const b of this.bots) {
        if (!b.alive || b.downed || b.rescue) continue;
        const d = b.pos.distanceTo(p.pos);
        if (d < bd) { bd = d; best = b; }
      }
      if (best) { best.rescue = p; best.rescueT = 0; }
    }
  }

  update(dt) {
    const g = this.game;
    const m = g.match, st = m?.state;
    if (st !== this.lastState) {
      // every round start rearms (a wipe retries the SAME round number); a round's end gets everyone back up
      if (st === 'round') { this.lastRound = m.round; for (const b of this.bots) b.rearm(m.round); }
      else if (st === 'buy' && this.lastState === 'round') { const wipe = m.round < this.lastRound; for (const b of this.bots) b.restore(wipe); }
      this.lastState = st;
    }
    this.dmgMul = g.zombies?.dmgMul || 1;
    this._assignRescues();
    for (const b of this.bots) b.update(dt, this);
  }

  damage(id, amount) { this.bots.find((b) => b.id === id)?.damage(amount); }
}
