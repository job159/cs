// In-game replication on top of net/session.js rooms (host-authoritative star):
//
// host -> clients
//   'sn' (unreliable, ~12/s P2P, ~7/s relay)  { t, z: [[id, x, y, z, yaw, st, hp, run]...] (cm / centi-rad / %),
//                                               p: [[id, x, y, z, yaw, pitch, flags, hp, weapon]...], m: [state, round, timer, left, bossFrac, bossName] }
//   'ev' (reliable, batched per tick)          [[kind, ...args], ...]  zs spawn, za anim, zd death, zc clear all, sv sever, fx, sh shot
//   'pd' (reliable, to one player)             { a: amount, f: [x, z], k: [x,y,z]?, o: flags }  damage taken
//   'rw' (reliable, to one player)             { m: money, x: xp, n: victim name, h: headshot, w: weapon }
// clients -> host
//   'ps' (unreliable ~15/s)                    { x, y, z, yaw, pitch, w, hp, f: flags }
//   'hits' (reliable, batched)                 [[zid, amount, part, box, dx, dy, dz, knock, stagger, head, weapon, explosive], ...]
//   'sh' (unreliable)                          { w: weapon, n: shots, e: [x,y,z] last bullet end }
import * as THREE from 'three';
import { RemotePlayer } from '../player/remote.js';
import { ZOMBIES } from '../zombies/defs.js';

const ST = { chase: 0, attack: 1, stagger: 2, special: 3, dead: 4 };
const now = () => performance.now() / 1000;
const r2 = (v) => Math.round(v * 100);

export class NetSync {
  constructor(game, room) {
    this.game = game;
    this.room = room;
    this.host = room.isHost;
    this.remotes = new Map();
    this.events = [];
    this.hits = [];
    this.dmgOut = new Map();   // player id -> { a, f, k, o }
    this.shots = null;
    this.tick = 0;
    this.offset = 0;           // host clock - local clock (clients)
    this.offsetInit = false;
    game.localId = room.selfId;
    game.net = this;
    game.zombies.net = this;
    game.zombies.authority = this.host;
    // game.playerList() merges our list with AI bots
    if (!this.host && game.match) game.match.isMirror = true;
    for (const p of room.players ? room.players() : []) if (p.id !== room.selfId) this._addRemote(p);
    this._h = { join: (p) => this._addRemote(p), leave: (p) => this._removeRemote(p.id ?? p), msg: (m) => this._onMessage(m) };
    room.on('peer-join', this._h.join);
    room.on('peer-leave', this._h.leave);
    room.on('message', this._h.msg);
  }

  /** Detaches from the room (the room itself stays open: back to the lobby / next match). */
  dispose() {
    const room = this.room;
    room.off('peer-join', this._h.join);
    room.off('peer-leave', this._h.leave);
    room.off('message', this._h.msg);
    for (const r of this.remotes.values()) r.dispose();
    this.remotes.clear();
    if (this.game.net === this) this.game.net = null;
  }

  _addRemote(p) {
    if (!p || this.remotes.has(p.id) || p.id === this.room.selfId) return;
    // a newcomer needs every zombie that already exists
    if (this.host) for (const z of this.game.zombies.list) if (z.alive) this.zombieSpawned(z, { elite: z.elite });
    this.remotes.set(p.id, new RemotePlayer(this.game, { id: p.id, name: p.name || '隊友', slot: p.slot ?? this.remotes.size + 1 }));
    this.game.hud?.toast(`${p.name || '隊友'} 加入了戰鬥`);
  }
  _removeRemote(id) {
    const r = this.remotes.get(id);
    if (!r) return;
    r.dispose();
    this.remotes.delete(id);
    this.game.hud?.toast(`${r.name} 離開了`);
  }

  playerList() {
    const g = this.game, st = g.status;
    const list = [{ id: g.localId, pos: g.player.pos, alive: !!st?.alive && !st.downed, downed: !!st?.downed, local: true }];
    for (const r of this.remotes.values()) list.push({ id: r.id, pos: r.pos, alive: r.alive && !r.downed, downed: r.downed });
    return list;
  }

  get relay() { for (const p of this.room.peers?.values?.() || []) if (p.transport === 'relay') return true; return false; }

  // ---------------------------------------------------------------- hooks called by game systems (host)
  zombieSpawned(z, opts) {
    this.events.push(['zs', z.id, z.type, z.modelId, r2(z.pos.x), r2(z.pos.y), r2(z.pos.z), opts.elite ? 1 : 0, z.running ? 1 : 0, Math.round(z.maxHp)]);
  }
  zombieAnim(z, clip, speed) { this.events.push(['za', z.id, clip, +speed.toFixed(2)]); }
  zombieSever(z, box, dir) { this.events.push(['sv', z.id, box, r2(dir.x), r2(dir.z)]); }
  zombieKilled(z, info) {
    const dir = info.dir || { x: 0, z: 1 };
    this.events.push(['zd', z.id, r2(dir.x), r2(dir.z), info.headshot ? 1 : 0, info.explosive ? 1 : 0, info.shooter ?? -1, info.weapon || '']);
    // rewards for remote killers (the local host player is credited by Match.onKill directly)
    if (info.shooter !== undefined && info.shooter !== this.game.localId && this.remotes.has(info.shooter)) {
      const d = z.def;
      this.room.send('rw', { m: d.money * (info.headshot ? 1.5 : 1) * (z.elite ? 2 : 1), x: d.xp * (info.headshot ? 1.5 : 1) * (z.elite ? 2.5 : 1), n: d.zh, h: info.headshot ? 1 : 0, w: info.weapon || 'knife' }, { to: info.shooter });
    }
  }
  fx(kind, data) { this.events.push(['fx', kind, data]); }
  zombiesCleared() { this.events.push(['zc']); }
  sendPlayerPush(id, v) {
    if (!this.pushOut) this.pushOut = new Map();
    const e = this.pushOut.get(id) || [0, 0, 0];
    e[0] += v.x; e[1] += v.y; e[2] += v.z;
    this.pushOut.set(id, e);
  }
  sendPlayerDamage(id, amount, opts) {
    const e = this.dmgOut.get(id) || { a: 0, f: null, k: null, o: 0 };
    e.a += amount;
    if (opts.from) e.f = [r2(opts.from.x), r2(opts.from.z)];
    if (opts.knock) e.k = [r2(opts.knock.x), r2(opts.knock.y), r2(opts.knock.z)];
    e.o |= (opts.dot ? 1 : 0) | (opts.acid ? 2 : 0) | (opts.explosive ? 4 : 0);
    this.dmgOut.set(id, e);
  }
  broadcastMatch() { /* state rides on every snapshot */ }

  // ---------------------------------------------------------------- hooks (clients)
  sendHit(z, info, amount) {
    const d = info.dir || { x: 0, y: 0, z: 1 };
    this.hits.push([z.id, +amount.toFixed(1), info.part || 'body', info.box || '', r2(d.x), r2(d.y), r2(d.z), +(info.knock || 0).toFixed(2), +(info.stagger || 0).toFixed(2), info.headshot ? 1 : 0, info.weapon || '', info.explosive ? 1 : 0, info.pellets || 1]);
  }
  onLocalFire(weaponId, origin, dir, end) {
    if (!this.shots || this.shots.w !== weaponId) this.shots = { w: weaponId, n: 0, e: null };
    this.shots.n++;
    if (end) this.shots.e = [r2(end.x), r2(end.y), r2(end.z)];
  }

  // ---------------------------------------------------------------- frame
  update(dt) {
    const g = this.game;
    this.tick += dt;
    const rate = this.host ? (this.relay ? 1 / 7 : 1 / 12) : (this.relay ? 1 / 7 : 1 / 15);
    // client clock: interpolate remote entities a little in the past
    const delay = this.relay ? 0.38 : 0.12;
    const rt = now() + this.offset - delay;
    g.zombies.renderTime = rt;
    for (const r of this.remotes.values()) r.update(dt, rt);
    if (this.tick < rate) return;
    this.tick = 0;
    if (this.host) this._hostSend(); else this._clientSend();
  }

  _hostSend() {
    const g = this.game, room = this.room;
    const zs = [];
    for (const z of g.zombies.list) {
      if (!z.alive && z.deathT > 0.5) continue;
      zs.push([z.id, r2(z.pos.x), r2(z.pos.y), r2(z.pos.z), r2(z.yaw), z.alive ? (ST[z.state] ?? 0) : 4, Math.max(0, Math.round((z.hp / z.maxHp) * 100)), z.running ? 1 : 0]);
    }
    const ps = [this._localRow()];
    for (const r of this.remotes.values()) ps.push([r.id, r2(r.pos.x), r2(r.pos.y), r2(r.pos.z), r2(r.yaw), r2(r.pitch), (r.alive ? 1 : 0) | (r.downed ? 2 : 0), Math.round(r.hp), r.weaponId || '']);
    const m = g.match;
    const boss = m?.boss;
    const snap = { t: +now().toFixed(3), z: zs, p: ps, m: m ? [m.state, m.round, +m.timer.toFixed(1), m.queue.length + g.zombies.alive, boss ? +(boss.hp / boss.maxHp).toFixed(3) : -1, boss?.name || ''] : null };
    room.broadcast('sn', snap, { reliable: false });
    if (this.events.length) { room.broadcast('ev', this.events.splice(0, 200)); }
    for (const [id, e] of this.dmgOut) room.send('pd', { a: +e.a.toFixed(1), f: e.f, k: e.k, o: e.o }, { to: id });
    this.dmgOut.clear();
    if (this.pushOut) { for (const [id, v] of this.pushOut) room.send('pp', v.map((x) => +x.toFixed(2)), { to: id, reliable: false }); this.pushOut.clear(); }
  }

  _localRow() {
    const g = this.game, p = g.player, st = g.status;
    return [g.localId, r2(p.pos.x), r2(p.pos.y), r2(p.pos.z), r2(p.yaw), r2(p.pitch), (st.alive ? 1 : 0) | (st.downed ? 2 : 0), Math.round(st.hp), g.arsenal?.def?.id || ''];
  }

  _clientSend() {
    const g = this.game, room = this.room, p = g.player, st = g.status;
    room.send('ps', { x: r2(p.pos.x), y: r2(p.pos.y), z: r2(p.pos.z), yaw: r2(p.yaw), pitch: r2(p.pitch), w: g.arsenal?.def?.id || '', hp: Math.round(st.hp), f: (st.alive ? 1 : 0) | (st.downed ? 2 : 0) }, { reliable: false });
    if (this.hits.length) room.send('hits', this.hits.splice(0, 120));
    if (this.shots) { room.send('sh', this.shots, { reliable: false }); this.shots = null; }
  }

  // ---------------------------------------------------------------- receive
  _onMessage({ from, type, data }) {
    const g = this.game;
    if (this.host) {
      if (type === 'ps') {
        const r = this.remotes.get(from);
        if (r) r.push({ x: data.x / 100, y: data.y / 100, z: data.z / 100, yaw: data.yaw / 100, pitch: data.pitch / 100, weapon: data.w, hp: data.hp, alive: !!(data.f & 1), downed: !!(data.f & 2) }, now());
      } else if (type === 'hits') {
        for (const h of data) {
          const z = g.zombies.byId.get(h[0]);
          if (!z || !z.alive) continue;
          const dir = new THREE.Vector3(h[4] / 100, h[5] / 100, h[6] / 100);
          z.damage({ amount: h[1], part: h[2], box: h[3] || undefined, dir, point: z.center(new THREE.Vector3()), knock: h[7], stagger: h[8], headshot: !!h[9], weapon: h[10], explosive: !!h[11], pellets: h[12], shooter: from, remote: true });
        }
      } else if (type === 'sh') {
        const r = this.remotes.get(from);
        r?.fired(data.w, data.e && data.e.map((v) => v / 100));
        this.events.push(['sh', from, data.w, data.e]);
      }
      return;
    }
    // ---- client side
    if (type === 'sn') {
      const t = data.t;
      const off = t - now();
      if (!this.offsetInit) { this.offset = off; this.offsetInit = true; } else this.offset += (off - this.offset) * 0.05;
      for (const row of data.z) g.zombies.pushSnapshot({ id: row[0], x: row[1] / 100, y: row[2] / 100, z: row[3] / 100, yaw: row[4] / 100, st: row[5], hp: row[6] / 100, run: row[7] }, t);
      for (const row of data.p) {
        if (row[0] === g.localId) continue;
        let r = this.remotes.get(row[0]);
        if (!r) { this._addRemote({ id: row[0], name: this.room.peers?.get?.(row[0])?.name || '隊友', slot: this.room.peers?.get?.(row[0])?.slot ?? 0 }); r = this.remotes.get(row[0]); }
        r?.push({ x: row[1] / 100, y: row[2] / 100, z: row[3] / 100, yaw: row[4] / 100, pitch: row[5] / 100, alive: !!(row[6] & 1), downed: !!(row[6] & 2), hp: row[7], weapon: row[8] }, t);
      }
      if (data.m) g.match?.mirror(data.m);
    } else if (type === 'ev') {
      for (const e of data) this._event(e);
    } else if (type === 'pd') {
      const from = data.f ? new THREE.Vector3(data.f[0] / 100, g.player.pos.y, data.f[1] / 100) : null;
      g.status?.damage(data.a, { from, knock: data.k ? new THREE.Vector3(data.k[0] / 100, data.k[1] / 100, data.k[2] / 100) : null, dot: !!(data.o & 1), acid: !!(data.o & 2), explosive: !!(data.o & 4) });
    } else if (type === 'pp') {
      g.player.addImpulse(data[0], data[1], data[2]);
    } else if (type === 'rw') {
      g.match?.applyReward(data);
    }
  }

  _event(e) {
    const g = this.game, zm = g.zombies;
    const [kind] = e;
    if (kind === 'zs') {
      const [, id, type, model, x, y, z, elite, run, maxHp] = e;
      if (zm.byId.has(id) || !ZOMBIES[type]) return;
      const zb = zm.spawn(type, new THREE.Vector3(x / 100, y / 100, z / 100), { id, puppet: true, model, elite: !!elite, running: !!run });
      if (zb) { zb.maxHp = maxHp; zb.hp = maxHp; zb.pos.set(x / 100, y / 100, z / 100); }
    } else if (kind === 'za') {
      const z = zm.byId.get(e[1]);
      if (z && z.alive) { z.playOnce(e[2], { net: false, speed: e[3] }); z.state = e[2].startsWith('attack') || e[2] === 'bite' ? 'attack' : z.state; }
    } else if (kind === 'zd') {
      const [, id, dx, dz, head, ex] = e;
      zm.netDeath(id, { dir: new THREE.Vector3(dx / 100, 0, dz / 100), headshot: !!head, explosive: !!ex, knock: 2 });
    } else if (kind === 'zc') {
      zm.clear();
    } else if (kind === 'sv') {
      const z = zm.byId.get(e[1]);
      if (z) z.sever(e[2], new THREE.Vector3(e[3] / 100, 0, e[4] / 100));
    } else if (kind === 'fx') {
      const [, fx, d] = e;
      const z = zm.byId.get(d.id);
      if (!z) return;
      if (fx === 'boss') { z.brain?.onFx(d.k, d.d); return; }
      if (fx === 'explode') zm.explode(z);
      else if (fx === 'scream') zm.scream(z);
      else if (fx === 'spit') zm.spit(z, { pos: new THREE.Vector3(...d.to) });
    } else if (kind === 'sh') {
      const [, id, w, end] = e;
      if (id === g.localId) return;
      this.remotes.get(id)?.fired(w, end && end.map((v) => v / 100));
    }
  }
}
