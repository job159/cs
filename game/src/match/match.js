// One chapter run on a map: rounds, the spawn director, economy, XP levels + perks, supply drops,
// downed / defeat / retry and victory. Host-authoritative in multiplayer (clients mirror state).
import * as THREE from 'three';
import { ROUNDS, DIFFICULTY, ECONOMY, xpFor, MAX_LEVEL, PERKS } from './rules.js';
import { ZOMBIES } from '../zombies/defs.js';
import { WEAPONS } from '../weapons/defs.js';
import { pick, rand } from '../engine/util.js';

const _v = new THREE.Vector3();

export class Match {
  constructor(game, { difficulty = 'normal', players = 1 } = {}) {
    this.game = game;
    this.diff = DIFFICULTY[difficulty] || DIFFICULTY.normal;
    this.diffId = difficulty;
    this.players = players;
    this.state = 'warmup';     // warmup | buy | round | victory | defeat
    this.round = 0;            // 1-based while playing
    this.timer = 6;
    this.money = ECONOMY.startMoney;
    this.xp = 0; this.level = 1; this.xpFrac = 0; this.pendingPerks = 0;
    this.dmgMul = 1; this.reloadMul = 1; this.knockMul = 1; this.speedMul = 1;
    this.retries = this.diff.retries;
    this.stats = { kills: 0, headshots: 0, damage: 0, bossDamage: 0, deaths: 0, money: 0 };
    this.queue = [];           // zombie types left to spawn this round
    this.spawnT = 0;
    this.boss = null;
    this.supplies = [];
    this.selfRevives = 2;
  }

  get maxAlive() {
    const q = this.game.renderer.qualityName;
    return { low: 18, medium: 24, high: 32, ultra: 40 }[q] || 28;
  }

  start() {
    this.state = 'warmup';
    this.timer = 8;
    this.game.hud?.setRound('準備作戰', '購買裝備');
    this.game.hud?.toast('購買時間：按 B 或點擊購買', 2600);
    this.game.audio?.playMusic?.('calm');
  }

  // ---------------------------------------------------------------- flow
  update(dt) {
    const g = this.game;
    this.timer -= dt;
    if (this.isMirror) { this._mirrorUpdate(); this._updateSupplies(dt); return; }
    if (this.state === 'warmup' || this.state === 'buy') {
      g.hud?.setRound(this.state === 'warmup' ? '準備作戰' : `${ROUNDS[this.round]?.title || ''} 即將開始`, `${Math.max(0, Math.ceil(this.timer))}`);
      if (this.timer <= 0) this.beginRound(this.round + 1);
      this._updateSupplies(dt);   // crates dropped at round end open during the buy time too (and the prompt refreshes)
      return;
    }
    if (this.state === 'round') {
      this._spawnDirector(dt);
      const left = this.queue.length + (g.zombies?.alive || 0);
      const R = ROUNDS[Math.max(0, this.round - 1)];
      g.hud?.setRound(R.title, `剩餘感染者 ${left}`);
      if (this.boss) g.hud?.setBoss(this.boss.name, Math.max(0, this.boss.hp / this.boss.maxHp));
      if (left <= 0 && (!this.boss || this.boss.hp <= 0)) this.endRound();
      this._checkDefeat();
    }
    this._updateSupplies(dt);
  }

  beginRound(n) {
    const g = this.game;
    if (n > ROUNDS.length) { this.victory(); return; }
    this.round = n;
    const R = ROUNDS[n - 1];
    this.state = 'round';
    const scale = (1 + 0.5 * (this.players - 1)) * this.diff.countMul;
    this.queue = [];
    for (const [type, count] of R.mix) for (let i = 0; i < Math.round(count * scale); i++) this.queue.push(type);
    // shuffle, but keep heavies away from the very start of the round
    for (let i = this.queue.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]]; }
    this.queue.sort((a, b) => (ZOMBIES[a].hp > 400 ? 1 : 0) - (ZOMBIES[b].hp > 400 ? 1 : 0) || 0);
    this.spawnT = 2.5;
    const zm = g.zombies;
    zm.hpMul = this.diff.hpMul * (1 + 0.1 * (n - 1)) * (1 + 0.35 * (this.players - 1));
    zm.dmgMul = this.diff.dmgMul * (1 + 0.05 * (n - 1));
    zm.runBias = 1 + n * 0.12;
    if (R.boss) this._spawnBoss(R.boss);
    g.hud?.setRound(R.title, '');
    g.hud?.toast(R.intro || R.title, 2400);
    g.audio?.play('round_start');
    g.audio?.playMusic?.(R.boss ? 'boss' : n >= 7 ? 'combat_high' : 'combat_low');
    g.net?.broadcastMatch?.(this.snapshot());
  }

  endRound() {
    const g = this.game;
    const bonus = ECONOMY.roundBonus(this.round);
    this.addMoney(bonus);
    g.hud?.setBoss(null);
    this.boss = null;
    g.audio?.play('round_win');
    g.hud?.toast(`回合完成　+$${bonus}`, 2400);
    // everyone back on their feet, a little health and armour back
    if (g.status) { if (g.status.downed || !g.status.alive) { g.status.alive = true; g.status.revive(50); } g.status.heal(30); }
    this._dropSupplies(2);
    if (this.round >= ROUNDS.length) { this.victory(); return; }
    this.state = 'buy';
    this.timer = 20;
    g.audio?.playMusic?.('calm');
  }

  victory() {
    this.state = 'victory';
    this.game.hud?.setRound('任務完成', '');
    this.game.audio?.play('victory');
    this.game.onMatchEnd?.(true, this.stats);
  }

  _checkDefeat() {
    const g = this.game;
    const allDown = g.playerList ? g.playerList().every((p) => !p.alive || p.downed) : (!g.status.alive || g.status.downed && g.status.downT <= 0);
    if (!allDown || g.status?.alive) return;
    // wipe: retry the round if we still can
    this.stats.deaths++;
    if (this.retries > 0) {
      this.retries--;
      g.hud?.toast(`全員陣亡　重試本回合（剩餘 ${this.retries} 次）`, 3000);
      g.zombies.clear();   // clients drop their puppets too
      this.boss = null;
      g.hud?.setBoss(null);
      this._respawn();
      this.state = 'buy'; this.timer = 12; this.round -= 1;
      for (const b of g.bots?.bots || []) b.rearm(this.round + 1); // revives fallen AI bots at our side
      g.audio?.playMusic?.('calm');
    } else {
      this.state = 'defeat';
      g.hud?.setRound('任務失敗', '');
      g.audio?.play('defeat');
      g.onMatchEnd?.(false, this.stats);
    }
  }

  /** Wipe retry: back on our feet at full health on our own spawn point. */
  _respawn() {
    const g = this.game, sp = g.world.playerSpawns;
    g.status.alive = true; g.status.revive(g.status.maxHp);
    const p = sp[(g.spawnIndex | 0) % sp.length] || sp[0];
    if (p) { g.player.pos.copy(p); g.player.vel.set(0, 0, 0); }
  }

  // ---------------------------------------------------------------- spawning
  _spawnDirector(dt) {
    const g = this.game, zm = g.zombies;
    if (!this.queue.length) return;
    this.spawnT -= dt;
    if (this.spawnT > 0 || zm.alive >= this.maxAlive) return;
    const R = ROUNDS[this.round - 1];
    this.spawnT = R.interval * rand(0.8, 1.25) * (zm.alive > this.maxAlive * 0.7 ? 1.6 : 1);
    const n = Math.min(this.queue.length, this.maxAlive - zm.alive, Math.round(rand(R.burst[0], R.burst[1])));
    const sp = this._pickSpawner();
    if (!sp) return;
    const eliteChance = (R.elite || 0) + this.diff.elite;
    for (let i = 0; i < n; i++) {
      const type = this.queue.pop();
      const a = Math.random() * Math.PI * 2, r = Math.random() * 2.5;
      zm.spawn(type, _v.set(sp.x + Math.cos(a) * r, sp.y, sp.z + Math.sin(a) * r), { elite: Math.random() < eliteChance });
    }
  }

  _pickSpawner() {
    const g = this.game;
    const def = g.world.def || {};
    const list = (def.spawners?.length ? def.spawners.map((s) => (s.pos ? new THREE.Vector3(...s.pos) : s)) : g.world.zombieSpawns) || [];
    if (!list.length) return null;
    const players = g.zombies.players();
    const cam = g.camera;
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    // score: distance in a comfortable band, out of view preferred, random jitter
    let best = null, bs = -1e9;
    for (const s of list) {
      let dmin = 1e9;
      for (const p of players) dmin = Math.min(dmin, s.distanceTo(p.pos));
      if (dmin < 12) continue;
      const toS = _v.copy(s).sub(cam.position).normalize();
      const inView = toS.dot(fwd) > 0.55 ? 1 : 0;
      const score = -Math.abs(dmin - 30) * 0.1 - inView * 2.5 + Math.random() * 2.2;
      if (score > bs) { bs = score; best = s; }
    }
    return best || pick(list);
  }

  _spawnBoss(kind) {
    const g = this.game;
    const arenas = g.world.def?.bossArenas || {};
    const ar = kind === 'colossus' ? arenas.final : arenas.mid;
    const sp = ar ? new THREE.Vector3(...ar.center) : (this._pickSpawner() || new THREE.Vector3(0, 0, 25));
    const z = g.zombies.spawn(kind, sp, {});
    if (!z) return;
    const name = ZOMBIES[kind]?.zh || '首領';
    this.boss = { name, get hp() { return z.hp; }, get maxHp() { return z.maxHp; }, zombie: z };
    g.audio?.play('boss_warning');
    g.hud?.toast('⚠ ' + name + ' 出現了', 3000);
  }

  // ---------------------------------------------------------------- economy / XP
  addMoney(n) { this.money = Math.min(ECONOMY.maxMoney, this.money + Math.round(n * this.diff.moneyMul)); this.stats.money += n; }

  onKill(zombie, info) {
    const g = this.game;
    if (info?.shooter !== g.localId) return;
    const d = zombie.def;
    const head = info.headshot;
    this.stats.kills++;
    if (head) this.stats.headshots++;
    this.addMoney(d.money * (head ? ECONOMY.headshotMul : 1) * (zombie.elite ? 2 : 1));
    this.addXp(d.xp * (head ? 1.5 : 1) * (zombie.elite ? 2.5 : 1));
    g.hud?.killFeed('你', info.weapon || 'knife', d.zh + (zombie.elite ? '（精英）' : ''), head);
  }

  addXp(n) {
    if (this.level >= MAX_LEVEL) return;
    this.xp += n;
    while (this.level < MAX_LEVEL && this.xp >= xpFor(this.level + 1)) {
      this.level++;
      this.pendingPerks++;
      this.game.audio?.play('level_up');
      this.game.status?.heal(25);
      this.game.hud?.toast(`等級提升　Lv ${this.level}`, 1600);
      this.game.onLevelUp?.(this.level);
    }
    const a = xpFor(this.level), b = xpFor(this.level + 1);
    this.xpFrac = this.level >= MAX_LEVEL ? 1 : (this.xp - a) / (b - a);
  }

  /** Spends a pending perk point; id one of PERKS[].id (auto: alternate attack / health). */
  choosePerk(id) {
    if (this.pendingPerks <= 0) return;
    const perk = PERKS.find((p) => p.id === id) || PERKS[(this.level % 2)];
    perk.apply(this, this.game);
    this.pendingPerks--;
    this.game.arsenal.dmgMul = this.dmgMul;
    this.game.arsenal.reloadMul = this.reloadMul;
  }

  // ---------------------------------------------------------------- shop
  price(id) { return WEAPONS[id]?.price ?? 0; }

  buy(id) {
    const g = this.game;
    const w = WEAPONS[id];
    if (!w) return false;
    if (!this.canBuy()) { g.hud?.toast('現在不能購買'); return false; }
    if (this.money < w.price) { g.audio?.play('ui_deny'); g.hud?.toast('金錢不足'); return false; }
    this.money -= w.price;
    g.arsenal.give(id);
    g.audio?.play('ui_buy');
    return true;
  }

  buyArmor(kind) {
    const g = this.game, st = g.status;
    const price = kind === 'helmet' ? ECONOMY.helmetPrice : ECONOMY.armorPrice;
    if (!this.canBuy() || this.money < price) { g.audio?.play('ui_deny'); return false; }
    if (kind === 'helmet') { if (st.helmet) return false; st.helmet = true; } else { if (st.armor >= 100) return false; st.armor = 100; }
    this.money -= price;
    g.audio?.play('ui_buy');
    return true;
  }

  buyAmmo() {
    const g = this.game, ws = g.arsenal.current;
    if (!ws || !this.canBuy()) return false;
    const price = Math.max(50, Math.round(ws.def.price * ECONOMY.ammoPrice));
    if (this.money < price || ws.reserve >= ws.def.reserve * 2) { g.audio?.play('ui_deny'); return false; }
    this.money -= price;
    ws.reserve = Math.min(ws.def.reserve * 2, ws.reserve + ws.def.mag * 2);
    g.audio?.play('ui_buy');
    return true;
  }

  canBuy() {
    const st = this.game.status;
    if (st && (!st.alive || st.downed)) return false;   // downed / bled out: no shopping until revived (buy / buyArmor / buyAmmo / grenades)
    if (this.state === 'warmup' || this.state === 'buy') return true;
    const def = this.game.world.def || {};
    const p = this.game.player.pos;
    return (def.buy || []).some((b) => Math.hypot(p.x - b[0], p.z - b[2]) < (b[3] || 4));
  }

  // ---------------------------------------------------------------- supplies
  _dropSupplies(n) {
    const g = this.game;
    const pts = (g.world.def?.supply || []).map((p) => new THREE.Vector3(...p));
    if (!pts.length) return;
    for (let i = 0; i < n; i++) {
      const p = pick(pts);
      if (this.supplies.some((s) => s.pos.distanceTo(p) < 1)) continue;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.6), new THREE.MeshStandardMaterial({ color: 0x4f5a3a, roughness: 0.7, emissive: 0x16304a, emissiveIntensity: 0.6 }));
      mesh.position.copy(p).setY(p.y + 0.28);
      mesh.castShadow = true;
      g.scene.add(mesh);
      this.supplies.push({ pos: p, mesh, t: 0 });
      g.audio?.play('supply_drop', { pos: p });
    }
  }

  _updateSupplies(dt) {
    const g = this.game;
    let near = null;
    const up = !g.status || g.status.alive && !g.status.downed; // downed / dead players can't open crates
    for (const s of this.supplies) {
      s.t += dt;
      s.mesh.material.emissiveIntensity = 0.4 + Math.sin(s.t * 4) * 0.3;
      if (up && s.pos.distanceTo(g.player.pos) < 1.8) near = s;
    }
    g.hud?.setPrompt(near ? '按 E 開啟補給箱' : '');
    if (near && g.input.state.pressed.use) {
      const ws = g.arsenal.current;
      for (const w of Object.values(g.arsenal.owned)) w.reserve = Math.max(w.reserve, w.def.reserve);
      g.status.armor = Math.max(g.status.armor, 60);
      g.status.heal(25);
      g.audio?.play('ui_buy');
      g.hud?.toast('補給：彈藥、護甲、生命');
      void ws;
      g.scene.remove(near.mesh);
      this.supplies.splice(this.supplies.indexOf(near), 1);
    }
  }

  snapshot() { return { state: this.state, round: this.round, timer: this.timer }; }

  // ---------------------------------------------------------------- network client mirror
  /** Applies the host's match row [state, round, timer, left, bossFrac, bossName, retries]. */
  mirror(m) {
    const [state, round, timer, left, bossFrac, bossName, retries] = m;
    const prev = this.state, prevRound = this.round;
    this.round = round; this.timer = timer; this.left = left;
    this.bossFrac = bossFrac; this.bossName = bossName;
    if (retries !== undefined) this.retries = retries;
    if (state === prev) return;
    this.state = state;
    const g = this.game;
    if (state === 'round') {
      const R = ROUNDS[round - 1];
      g.hud?.toast(R?.intro || R?.title || '', 2400);
      g.audio?.play('round_start');
      g.audio?.playMusic?.(R?.boss ? 'boss' : round >= 7 ? 'combat_high' : 'combat_low');
    } else if (state === 'buy' && prev === 'round' && round < prevRound) {
      // wipe: the host steps the round back to retry it (a cleared round keeps its number): no bonus, full revive
      this.stats.deaths++;
      g.hud?.toast(`全員陣亡　重試本回合（剩餘 ${this.retries} 次）`, 3000);
      g.zombies?.clear();
      this._respawn();
      g.audio?.playMusic?.('calm');
    } else if (state === 'buy' && prev === 'round') {
      const bonus = ECONOMY.roundBonus(round);
      this.addMoney(bonus);
      g.audio?.play('round_win');
      g.hud?.toast(`回合完成　+$${bonus}`, 2400);
      if (g.status) { if (g.status.downed || !g.status.alive) { g.status.alive = true; g.status.revive(50); } g.status.heal(30); }
      this._dropSupplies(1);
      g.audio?.playMusic?.('calm');
    } else if (state === 'victory') { g.audio?.play('victory'); g.onMatchEnd?.(true, this.stats); }
    else if (state === 'defeat') { this.stats.deaths++; g.audio?.play('defeat'); g.onMatchEnd?.(false, this.stats); }
  }

  _mirrorUpdate() {
    const g = this.game;
    const R = ROUNDS[Math.max(0, this.round - 1)];
    if (this.state === 'warmup' || this.state === 'buy') g.hud?.setRound(this.state === 'warmup' ? '準備作戰' : `${ROUNDS[this.round]?.title || ''} 即將開始`, `${Math.max(0, Math.ceil(this.timer))}`);
    else if (this.state === 'round') g.hud?.setRound(R?.title || '', `剩餘感染者 ${this.left ?? 0}`);
    else if (this.state === 'victory') g.hud?.setRound('任務完成', '');
    else if (this.state === 'defeat') g.hud?.setRound('任務失敗', '');
    g.hud?.setBoss(this.bossFrac >= 0 && this.state === 'round' ? this.bossName : null, Math.max(0, this.bossFrac));
  }

  /** Host credited us with a kill. */
  applyReward(r) {
    this.stats.kills++;
    if (r.h) this.stats.headshots++;
    this.addMoney(r.m);
    this.addXp(r.x);
    this.game.hud?.killFeed('你', r.w, r.n, !!r.h);
  }
}
