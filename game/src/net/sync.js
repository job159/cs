// In-game replication on top of net/session.js rooms (host-authoritative star):
//
// host -> clients
//   'sn' (unreliable, ~12/s P2P, ~7/s relay)  { t, z: [[id, x, y, z, yaw, st, hp, run]...] (cm / centi-rad / %),
//                                               p: [[id, x, y, z, yaw, pitch, flags, hp, weapon]...], m: [state, round, timer, left, bossFrac, bossName, retries] }
//   'ev' (reliable, batched per tick)          [[kind, ...args], ...]  zs spawn, za anim, zl back to loco, zd death, zc clear all,
//                                               sv sever, fx, sh shot (guests' and the host's own), rv revive [rv, by, target],
//                                               sk skill event [sk, by, ...encSkill] (premium skills: every client replays the
//                                               visuals from the seed; damage stays on the caster's normal hit path)
//   'pd' (reliable, to one player)             { a: direct, d: dot (hazards), f: [x, z], k: [x,y,z]?, o: flags 2 acid 4 explosive,
//                                               j: [amount, ring y, knock?]? jumpable shockwave: the guest drops it if airborne }
//   'rw' (reliable, to one player)             { m: money, x: xp, n: victim name, h: headshot, w: weapon }
// clients -> host
//   'ps' (unreliable ~15/s)                    { x, y, z, yaw, pitch, w, hp, f: flags }  (a guest counts as playing only while these arrive)
//                                               flags (also in 'sn' p rows): 1 alive, 2 downed, 4 crouched, 8 reloading, 16 reviving
//   'hits' (reliable, batched)                 [[zid, amount, part, box, dx, dy, dz, knock, stagger, head, weapon, explosive, pellets], ...]
//                                               amount is raw: the host applies the zombie-side multipliers (brain, armour, purge)
//   'sh' (unreliable)                          { w: weapon, n: shots, e: [x,y,z] last bullet end }
//   'rv' (reliable)                            { t: target id }  held E on a downed teammate; the host checks and broadcasts 'rv'
//   'sk' (reliable)                            encSkill(ev): a skill this guest cast; the host replays it and relays it as 'sk'
import * as THREE from 'three';
import { RemotePlayer } from '../player/remote.js';
import { ZOMBIES } from '../zombies/defs.js';
import { WEAPONS } from '../weapons/defs.js';
import { replaySkill } from '../weapons/specials.js';

const ST = { chase: 0, attack: 1, stagger: 2, special: 3, dead: 4 };
const now = () => performance.now() / 1000;
const r2 = (v) => Math.round(v * 100);
const LIVE = 5;          // s without a guest's 'ps' (still loading, load failed, app in background): not in play
const REVIVE = 2.5;      // s holding E on a downed teammate (same as the AI bots)
// skill event { type: 'skill', id, seed, pos, dir, w, slot, ph } <-> [w, id, slot, seed, x, y, z (cm), dx, dy, dz (x1000), ph]
const encSkill = (e) => [e.w, e.id, e.slot, e.seed, r2(e.pos[0]), r2(e.pos[1]), r2(e.pos[2]), Math.round(e.dir[0] * 1000), Math.round(e.dir[1] * 1000), Math.round(e.dir[2] * 1000), e.ph | 0];
const decSkill = (a, by) => ({ type: 'skill', by, w: a[0], id: a[1], slot: a[2], seed: a[3], pos: [a[4] / 100, a[5] / 100, a[6] / 100], dir: [a[7] / 1000, a[8] / 1000, a[9] / 1000], ph: a[10] | 0 });

export class NetSync {
  constructor(game, room) {
    this.game = game;
    this.room = room;
    this.host = room.isHost;
    this.remotes = new Map();
    this.events = [];
    this.hits = [];
    this.dmgOut = new Map();   // player id -> { a, d, f, k, o, j }
    this.shots = null;
    this.rvTarget = null; this.rvT = 0; this.rvSent = 0; this.rvSentTo = null;   // teammate revive hold
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
    const r = new RemotePlayer(this.game, { id: p.id, name: p.name || '隊友', slot: p.slot ?? this.remotes.size + 1 });
    r.alive = false; r.seenAt = 0;   // hidden / untargetable at the origin until its first state arrives
    this.remotes.set(p.id, r);
    this.game.hud?.toast(`${p.name || '隊友'} 加入了戰鬥`);
  }
  /** A teammate that reports its state: one still loading (or whose load failed) is not targeted, not counted. */
  _live(r) { return !!r && r.seenAt > 0 && now() - r.seenAt < LIVE; }
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
    for (const r of this.remotes.values()) { const live = this._live(r); list.push({ id: r.id, pos: r.pos, alive: live && r.alive && !r.downed, downed: live && r.downed }); }
    return list;
  }

  get relay() { for (const p of this.room.peers?.values?.() || []) if (p.transport === 'relay') return true; return false; }

  // ---------------------------------------------------------------- hooks called by game systems (host)
  zombieSpawned(z, opts) {
    this.events.push(['zs', z.id, z.type, z.modelId, r2(z.pos.x), r2(z.pos.y), r2(z.pos.z), opts.elite ? 1 : 0, z.running ? 1 : 0, Math.round(z.maxHp)]);
  }
  zombieAnim(z, clip, speed) { this.events.push(['za', z.id, clip, +speed.toFixed(2)]); }
  zombieLoco(z, run) { this.events.push(['zl', z.id, run ? 1 : 0]); }
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
    if (!this._live(this.remotes.get(id))) return;
    if (!this.pushOut) this.pushOut = new Map();
    const e = this.pushOut.get(id) || [0, 0, 0];
    e[0] += v.x; e[1] += v.y; e[2] += v.z;
    this.pushOut.set(id, e);
  }
  sendPlayerDamage(id, amount, opts) {
    if (!this._live(this.remotes.get(id))) return;
    const e = this.dmgOut.get(id) || { a: 0, d: 0, f: null, k: null, o: 0 };
    // hazard ticks stay apart: merged into a claw / slam they would skip kevlar and the hit feedback, and a pool's
    // centre would replace the attacker's direction
    if (opts.dot) e.d += amount;
    else if (opts.jumpY !== undefined) {
      // jumpable shockwave: the guest drops it if it's airborne above the ring when this arrives (base.js hurtCircle)
      const j = e.j || (e.j = [0, 0, null]);
      j[0] += amount; j[1] = r2(opts.jumpY);
      if (opts.knock) j[2] = [r2(opts.knock.x), r2(opts.knock.y), r2(opts.knock.z)];
      if (opts.from) e.f = [r2(opts.from.x), r2(opts.from.z)];
    } else {
      e.a += amount;
      if (opts.from) e.f = [r2(opts.from.x), r2(opts.from.z)];
      if (opts.knock) { const k = e.k || (e.k = [0, 0, 0]); k[0] += r2(opts.knock.x); k[1] += r2(opts.knock.y); k[2] += r2(opts.knock.z); }
      e.o |= (opts.acid ? 2 : 0) | (opts.explosive ? 4 : 0);
    }
    this.dmgOut.set(id, e);
  }
  broadcastMatch() { /* state rides on every snapshot */ }

  // ---------------------------------------------------------------- hooks (clients)
  sendHit(z, info, amount) {
    const d = info.dir || { x: 0, y: 0, z: 1 };
    this.hits.push([z.id, +amount.toFixed(1), info.part || 'body', info.box || '', r2(d.x), r2(d.y), r2(d.z), +(info.knock || 0).toFixed(2), +(info.stagger || 0).toFixed(2), info.headshot ? 1 : 0, info.weapon || '', info.explosive ? 1 : 0, info.pellets || 1]);
  }
  /** A premium skill we cast (weapons/specials.js castSkill / endSkill): everyone else replays its visuals. */
  sendSkill(ev) {
    if (this.host) this.events.push(['sk', this.game.localId, ...encSkill(ev)]);
    else this.room.send('sk', encSkill(ev));
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
    this._reviveUpdate(dt);
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
    for (const r of this.remotes.values()) ps.push([r.id, r2(r.pos.x), r2(r.pos.y), r2(r.pos.z), r2(r.yaw), r2(r.pitch), this._live(r) ? (r.alive ? 1 : 0) | (r.downed ? 2 : 0) | (r.crouch ? 4 : 0) | (r.reloading ? 8 : 0) | (r.reviving ? 16 : 0) : 0, Math.round(r.hp), r.weaponId || '']);
    const m = g.match;
    const boss = m?.boss;
    const snap = { t: +now().toFixed(3), z: zs, p: ps, m: m ? [m.state, m.round, +m.timer.toFixed(1), m.queue.length + g.zombies.alive, boss ? +(boss.hp / boss.maxHp).toFixed(3) : -1, boss?.name || '', m.retries] : null };
    room.broadcast('sn', snap, { reliable: false });
    if (this.shots) { this.events.push(['sh', g.localId, this.shots.w, this.shots.e]); this.shots = null; } // our own gunfire
    if (this.events.length) { room.broadcast('ev', this.events.splice(0, 200)); }
    for (const [id, e] of this.dmgOut) if (e.a > 0 || e.d > 0 || e.j) room.send('pd', { a: +e.a.toFixed(1), d: +e.d.toFixed(2), f: e.f, k: e.k, o: e.o, ...(e.j && { j: [+e.j[0].toFixed(1), e.j[1], e.j[2]] }) }, { to: id });
    this.dmgOut.clear();
    if (this.pushOut) { for (const [id, v] of this.pushOut) room.send('pp', v.map((x) => +x.toFixed(2)), { to: id, reliable: false }); this.pushOut.clear(); }
  }

  _localRow() {
    const g = this.game, p = g.player, st = g.status;
    return [g.localId, r2(p.pos.x), r2(p.pos.y), r2(p.pos.z), r2(p.yaw), r2(p.pitch), this._flags(), Math.round(st.hp), g.arsenal?.def?.id || ''];
  }

  /** Our player-state bits for 'ps' / 'sn' rows: 1 alive, 2 downed, 4 crouched, 8 reloading, 16 reviving a teammate. */
  _flags() {
    const g = this.game, st = g.status;
    return (st.alive ? 1 : 0) | (st.downed ? 2 : 0) | (g.player?.crouching ? 4 : 0) | (g.arsenal?.state === 'reload' ? 8 : 0) | (this.rvTarget && this.rvT > 0 ? 16 : 0);
  }

  _clientSend() {
    const g = this.game, room = this.room, p = g.player, st = g.status;
    room.send('ps', { x: r2(p.pos.x), y: r2(p.pos.y), z: r2(p.pos.z), yaw: r2(p.yaw), pitch: r2(p.pitch), w: g.arsenal?.def?.id || '', hp: Math.round(st.hp), f: this._flags() }, { reliable: false });
    if (this.hits.length) room.send('hits', this.hits.splice(0, 120));
    if (this.shots) { room.send('sh', this.shots, { reliable: false }); this.shots = null; }
  }

  // ---------------------------------------------------------------- receive
  _onMessage({ from, type, data }) {
    const g = this.game;
    if (this.host) {
      if (type === 'ps') {
        const r = this.remotes.get(from);
        if (r) { r.seenAt = now(); r.push({ x: data.x / 100, y: data.y / 100, z: data.z / 100, yaw: data.yaw / 100, pitch: data.pitch / 100, weapon: data.w, hp: data.hp, alive: !!(data.f & 1), downed: !!(data.f & 2), crouch: !!(data.f & 4), reload: !!(data.f & 8), revive: !!(data.f & 16) }, now()); }
      } else if (type === 'rv') {
        this._revive(from, data?.t);
      } else if (type === 'sk') {
        // the sender's id comes from the link, not the payload; relayed to the other guests (the caster skips its echo)
        if (!Array.isArray(data) || !this.remotes.has(from)) return;
        replaySkill(g, decSkill(data, from));
        this.events.push(['sk', from, ...data]);
      } else if (type === 'hits') {
        const dead = this.remotes.get(from)?.alive === false;
        for (const h of data) {
          const z = g.zombies.byId.get(h[0]);
          if (!z || !z.alive) continue;
          if (dead && !h[11] && h[10] !== 'fire') continue; // a bled-out player can't shoot (grenades / fire thrown before still count)
          const dir = new THREE.Vector3(h[4] / 100, h[5] / 100, h[6] / 100);
          z.damage({ amount: h[1], part: h[2], box: h[3] || undefined, dir, point: z.center(new THREE.Vector3()), knock: h[7], stagger: h[8], headshot: !!h[9], weapon: h[10], explosive: !!h[11], pellets: h[12], shooter: from, remote: true });
          // a guest's plaguebane mark only exists on its puppet: mark the real zombie (+10 % for the whole team)
          const sp = WEAPONS[h[10]]?.special;
          if (sp?.type === 'plaguebane' && z.alive) { z.purgeT = 3; z.purgeMul = 1 + (sp.mark ?? 0.1); }
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
        if (r) r.seenAt = now();
        r?.push({ x: row[1] / 100, y: row[2] / 100, z: row[3] / 100, yaw: row[4] / 100, pitch: row[5] / 100, alive: !!(row[6] & 1), downed: !!(row[6] & 2), crouch: !!(row[6] & 4), reload: !!(row[6] & 8), revive: !!(row[6] & 16), hp: row[7], weapon: row[8] }, t);
      }
      if (data.m) g.match?.mirror(data.m);
    } else if (type === 'ev') {
      for (const e of data) this._event(e);
    } else if (type === 'pd') {
      const from = data.f ? new THREE.Vector3(data.f[0] / 100, g.player.pos.y, data.f[1] / 100) : null;
      // the direct part first: kevlar, knockback and the hit indicator act on it before a hazard tick can down us
      if (data.a > 0) g.status?.damage(data.a, { from, knock: data.k ? new THREE.Vector3(data.k[0] / 100, data.k[1] / 100, data.k[2] / 100) : null, acid: !!(data.o & 2), explosive: !!(data.o & 4) });
      // jumpable shockwave [amount, ring y, knock]: in the air above it as it reaches us (with the quake) = jumped it
      const j = data.j, p = g.player;
      if (j && (p.onGround || p.pos.y <= j[1] / 100 + 0.35)) g.status?.damage(j[0], { from, knock: j[2] ? new THREE.Vector3(j[2][0] / 100, j[2][1] / 100, j[2][2] / 100) : null, explosive: !!(data.o & 4) });
      if (data.d > 0) g.status?.damage(data.d, { dot: true, acid: true });
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
      if (z && z.alive) { const c = e[2]; z.playOnce(c, { net: false, speed: e[3] }); z.state = /attack|bite/.test(c) ? 'attack' : c === 'stagger' || c.startsWith('hit_') ? 'stagger' : z.state; }
    } else if (kind === 'zl') {
      // the host went back to walking / running (one-shots the host cuts short or holds); Zombie._puppetUpdate
      // also returns a finished one-shot to loco on its own
      const z = zm.byId.get(e[1]);
      if (z && z.alive) { z.running = !!e[2]; z.state = 'chase'; z.setLoco(z.running); }
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
    } else if (kind === 'sk') {
      replaySkill(g, decSkill(e.slice(2), e[1]));
    } else if (kind === 'rv') {
      const [, by, t] = e, st = g.status;
      const name = (id) => this.remotes.get(id)?.name || '隊友';
      if (t === g.localId && st?.alive && st.downed) { st.revive(50); g.hud?.toast(`${name(by)} 救起了你`, 2000); }
      else if (by === g.localId) g.hud?.toast(`已救起 ${name(t)}`, 1600);
    }
  }

  // ---------------------------------------------------------------- teammate revive
  /** Hold E next to a downed teammate (every peer runs its own hold; each player owns its PlayerStatus). */
  _reviveUpdate(dt) {
    const g = this.game, st = g.status, p = g.player;
    let best = null;
    if (st?.alive && !st.downed && p && !g.shop?.open) {
      let bd = 2;
      for (const r of this.remotes.values()) {
        if (!r.alive || !r.downed || !this._live(r) || (r.id === this.rvSentTo && now() - this.rvSent < 2)) continue;
        const d = r.pos.distanceTo(p.pos);
        if (d < bd) { bd = d; best = r; }
      }
    }
    if (best !== this.rvTarget) { if (!best) g.hud?.setPrompt(''); this.rvTarget = best; this.rvT = 0; }
    if (!best) return;
    const held = !!g.input?.state.held.use;
    this.rvT = held ? this.rvT + dt : 0;
    g.hud?.setPrompt(held ? `救援 ${best.name}… ${Math.min(99, Math.floor((this.rvT / REVIVE) * 100))}%` : `按住 E 救援 ${best.name}`);
    if (this.rvT < REVIVE) return;
    this.rvT = 0; this.rvSent = now(); this.rvSentTo = best.id;
    if (this.host) this._revive(g.localId, best.id); else this.room.send('rv', { t: best.id });
  }

  /** Host: validates a revive (reviver up, target still downed, close enough on our interpolated view) and broadcasts it. */
  _revive(by, t) {
    const g = this.game, st = g.status;
    const who = (id) => (id === g.localId ? { pos: g.player?.pos, alive: !!st?.alive, downed: !!st?.downed } : this._live(this.remotes.get(id)) ? this.remotes.get(id) : null);
    const a = who(by), b = who(t);
    if (by === t || !a?.alive || a.downed || !b?.alive || !b.downed || !a.pos || !b.pos) return false;
    if (a.pos.distanceTo(b.pos) > 3.5) return false;   // remotes are drawn 0.12-0.38 s in the past
    const e = ['rv', by, t];
    this.events.push(e);
    this._event(e);   // the host's own player (target or reviver)
    return true;
  }
}
