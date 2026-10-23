// One chapter run on a map: rounds, the spawn director, the economy (kill / round money, the shop, money
// upgrades), XP levels + traits, supply drops, downed / defeat / retry and victory. Host-authoritative in
// multiplayer (clients mirror the flow); money, upgrades and traits are every player's own (rules.js, DESIGN §5).
import * as THREE from 'three';
import { ROUNDS, DIFFICULTY, ECONOMY, LOADOUT, xpFor, MAX_LEVEL, PERKS, PERK, PERK_CASH, UPGRADES, UPGRADE, upgradeLevels, upgradePrice, killMoney, killXp, assistShare, priceOf, resourceKind } from './rules.js';
import { ZOMBIES } from '../zombies/defs.js';
import { WEAPONS, isListed, slotOf } from '../weapons/defs.js';
import { pick, rand } from '../engine/util.js';

const _v = new THREE.Vector3();

// Supply crate (06b §7.1, §9.6.4): steel crate whose lid seam glows blue — only for the killer for 60 s (CSO), then
// white-blue for everyone; boss / rare crates gold. Glow column + gear ring from fx/zfx.js.
const CRATE = { killer: [0.3, 0.9, 2.4], open: [0.6, 0.9, 1.6], gold: [4, 2.6, 0.8] };
let crateKit = null;
function crateParts() {
  if (crateKit) return crateKit;
  crateKit = {
    body: new THREE.BoxGeometry(0.9, 0.42, 0.6), lid: new THREE.BoxGeometry(0.94, 0.1, 0.64), seam: new THREE.BoxGeometry(0.952, 0.024, 0.652),
    strap: new THREE.BoxGeometry(0.07, 0.56, 0.665), latch: new THREE.BoxGeometry(0.1, 0.07, 0.03),
    steel: new THREE.MeshStandardMaterial({ color: 0x6b7a52, roughness: 0.7, metalness: 0.15 }),
    lidMat: new THREE.MeshStandardMaterial({ color: 0x4f5b3c, roughness: 0.62, metalness: 0.2 }),
    strapMat: new THREE.MeshStandardMaterial({ color: 0x17191b, roughness: 0.8, metalness: 0.2 }),
    latchMat: new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 0.35, metalness: 0.9 }),
  };
  return crateKit;
}

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
    this.upgrades = upgradeLevels();   // money upgrades 強化 { atk: level, ... } (rules.js UPGRADES)
    this.traits = {};                  // level traits 戰技 { id: rank } (rules.js PERKS)
    this.perkChoices = null;           // the traits offered for the pending point (rolled once per point)
    this.dmgMul = 1; this.reloadMul = 1; this.moveMul = 1; this.adrenT = 0;
    this.retries = this.diff.retries;
    // deaths: team wipes; downs: our own (player/status.js)
    this.stats = { kills: 0, headshots: 0, assists: 0, damage: 0, bossDamage: 0, deaths: 0, downs: 0, money: 0, spent: 0 };
    this.queue = [];           // zombie types left to spawn this round
    this.spawnT = 0;
    this.boss = null;
    this.supplies = [];
    this.selfRevives = 2;
    // starting kit (rules.js LOADOUT): game.js hands out the sidearm, then game.startWeapon (a dev ?w= keeps its own)
    if (!game.startWeapon) game.startWeapon = LOADOUT.primary || LOADOUT.sidearm;
  }

  /** Movement multiplier read by game.js: the 移動速度 upgrade, x 腎上腺素 for a moment after a kill. */
  get speedMul() { return this.moveMul * (this.adrenT > 0 ? 1 + 0.06 * (this.traits.adrenaline || 0) : 1); }

  get maxAlive() {
    const q = this.game.renderer.qualityName;
    return { low: 18, medium: 24, high: 32, ultra: 40 }[q] || 28;
  }

  start() {
    this.state = 'warmup';
    this.timer = ECONOMY.warmup;
    this.game.hud?.setRound('準備作戰', '購買裝備');
    this.game.hud?.toast('購買時間：按 B 購買武器與強化', 2600);
    this.game.audio?.playMusic?.('calm');
    this.game.audio?.preload?.(['combat_low', 'combat_high']);   // decoded before round 1: the switch stays phase-locked
  }

  // ---------------------------------------------------------------- flow
  update(dt) {
    const g = this.game;
    this.timer -= dt;
    this.adrenT = Math.max(0, this.adrenT - dt);
    if (!this._statsOn && g.arsenal) { this._statsOn = true; this._applyStats(); }   // (the arsenal comes after the match)
    if (!this._intro) this._shopIntro();
    this._emptySwitch();
    if (this.isMirror) { this._mirrorUpdate(); this._updateSupplies(dt); return; }
    if (this.state === 'warmup' || this.state === 'buy') {
      g.hud?.setRound(this.state === 'warmup' ? '準備作戰' : `${ROUNDS[this.round]?.title || ''} 即將開始`, `${Math.max(0, Math.ceil(this.timer))}`);
      this._countdownTick();
      if (this.timer <= 0) this.beginRound(this.round + 1);
      this._updateSupplies(dt);   // crates dropped at round end open during the buy time too (and the prompt refreshes)
      return;
    }
    if (this.state === 'round') {
      this._spawnDirector(dt);
      const left = this.queue.length + (g.zombies?.alive || 0);
      const R = ROUNDS[Math.max(0, this.round - 1)];
      g.hud?.setRound(R.title, `剩餘感染者 ${left}`);
      this._midSupply(left);
      if (this.boss) { const f = Math.max(0, this.boss.hp / this.boss.maxHp); g.hud?.setBoss(this.boss.name, f); this._bossSupply(f); }
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
    this._bossCrateRound = 0; this._midRound = 0;   // (a wipe retry gets its boss / mid-round crate again)
    const scale = (1 + 0.5 * (this.players - 1)) * this.diff.countMul;
    this.queue = [];
    for (const [type, count] of R.mix) for (let i = 0; i < Math.round(count * scale); i++) this.queue.push(type);
    // shuffled, but no heavies in the first quarter of the round. _spawnDirector pop()s from the END of the queue: the
    // old sort put every heavy last, so the whole round's riots and brutes stormed in together at the very start
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const light = shuffle(this.queue.filter((t) => ZOMBIES[t].hp <= 400)), lead = Math.floor(this.queue.length * 0.25);
    this.queue = [...light.slice(0, lead), ...shuffle([...light.slice(lead), ...this.queue.filter((t) => ZOMBIES[t].hp > 400)])].reverse();
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
    g.hud?.setBoss(null);
    this.boss = null;
    if (this.round < ROUNDS.length) g.audio?.play('round_win');   // the last one gets the victory cue alone
    this._roundReward(this.round);
    this._dropSupplies(2);
    if (this.round >= ROUNDS.length) { this.victory(); return; }
    this.state = 'buy';
    this.timer = ECONOMY.buyTime;
    g.audio?.playMusic?.('calm');
    if (ROUNDS[this.round]?.boss) g.audio?.prepareMusic?.('boss');   // decoded during the buy time, on cue at the boss
  }

  /** A cleared round (host and guests alike): the bonus (+ a boss round's bounty), everyone up, a little health back. */
  _roundReward(round) {
    const g = this.game, st = g.status;
    const bonus = ECONOMY.roundBonus(round), bounty = ECONOMY.bossBounty[ROUNDS[round - 1]?.boss] || 0;
    if (round < ROUNDS.length) {
      this.addMoney(bonus);
      // the reserves come back full for the next round (彈藥容量 included; rules.js ECONOMY)
      const resupplied = this.resupply();
      g.hud?.toast(`回合完成　+$${Math.round(bonus * this.diff.moneyMul).toLocaleString('en-US')}${bounty ? '（含首領賞金）' : ''}${resupplied ? '　彈藥已補給' : ''}`, 2400);
    }
    if (!st) return;
    if (st.downed || !st.alive) { st.alive = true; st.revive(50); }
    const medic = 15 * (this.traits.medic || 0);
    st.heal(30 + medic);
    if (medic && st.kevlar) st.armor = Math.min(st.maxArmor, st.armor + medic);
  }

  victory() {
    this.state = 'victory';
    this.game.hud?.setRound('任務完成', '');
    this._endCue('victory');
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
      g.audio?.play('round_lose');
      g.audio?.playMusic?.('calm');
    } else {
      this.state = 'defeat';
      g.hud?.setRound('任務失敗', '');
      this._endCue('defeat');
      g.onMatchEnd?.(false, this.stats);
    }
  }

  /** Wipe retry: back on our feet at full health on our own spawn point, reserves and magazines full (like the bots). */
  _respawn() {
    const g = this.game, sp = g.world.playerSpawns;
    g.status.alive = true; g.status.revive(g.status.maxHp);
    const p = sp[(g.spawnIndex | 0) % sp.length] || sp[0];
    if (p) { g.player.pos.copy(p); g.player.vel.set(0, 0, 0); }
    this.resupply(true);
  }

  /**
   * Tops every owned weapon's finite reserve (magazine guns, bows) up to its maximum (彈藥容量 included; overstock
   * bought in the shop is kept); full: the magazines too (wipe retry). Mana / charges / unlimited reserves and melee
   * are left alone. Returns whether anything was added.
   */
  resupply(full = false) {
    const ar = this.game.arsenal;
    let added = false;
    for (const ws of Object.values(ar?.owned || {})) {
      const d = ws.def, kind = resourceKind(d);
      if (kind !== 'ammo' && kind !== 'arrows') continue;
      if (Number.isFinite(d.reserve) && d.reserve > 0) {
        const max = ar.maxReserve?.(ws) ?? d.reserve;
        if (ws.reserve < max) { ws.reserve = max; added = true; }
      }
      if (full && d.mag > 0 && ws.ammo < d.mag) { ws.ammo = d.mag; ws.needsCycle = false; added = true; }
    }
    if (added) this.game.hud?.ammoChanged?.();
    return added;
  }

  /**
   * CS-style auto switch: pulling the trigger on a weapon that is completely dry mid-round (nothing in the magazine,
   * nothing in reserve) draws the next weapon that still has something to shoot -- the sidearm first. The HUD shows
   * the same move as a "[2] 副武器" chip before (ui/hud.js).
   */
  _emptySwitch() {
    const g = this.game, ar = g.arsenal, st = g.status, s = g.input?.state;
    if (this.state !== 'round' || !ar?.current || !s?.pressed.fire || ar.state !== 'idle' || ar.pendingSlot != null) return;
    if (st && (!st.alive || st.downed)) return;
    const slot = this.fallbackSlot();
    if (slot != null && this.dry(ar.current)) ar.select(slot);
  }

  /** Is this weapon state out of everything it shoots (finite magazine + reserve both empty, no unlimited buff)? */
  dry(ws) {
    const d = ws?.def, kind = resourceKind(d);
    if (!d || (kind !== 'ammo' && kind !== 'arrows') || !(d.mag > 0)) return false;
    if (this.game.arsenal?._mods?.(ws).infinite) return false;
    return ws.ammo <= 0 && Number.isFinite(ws.reserve) && ws.reserve <= 0;
  }

  /** The slot to fall back on when the held weapon is dry: the sidearm, then the others that are not dry; or null. */
  fallbackSlot() {
    const ar = this.game.arsenal, cur = ar?.current;
    if (!cur) return null;
    const slots = Object.keys(ar.owned).map(Number).sort((a, b) => (a === 2 ? -1 : b === 2 ? 1 : a - b));
    return slots.find((k) => ar.owned[k] !== cur && k <= 3 && !this.dry(ar.owned[k])) ?? null;
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
    // AI teammates shoot like players: the boss gets their share of the squad health scaling too
    const bots = g.bots?.bots.length || 0;
    if (bots) { z.maxHp *= (1 + 0.35 * (this.players - 1 + bots * 0.5)) / (1 + 0.35 * (this.players - 1)); z.hp = z.maxHp; }
    const name = ZOMBIES[kind]?.zh || '首領';
    this.boss = { name, get hp() { return z.hp; }, get maxHp() { return z.maxHp; }, zombie: z };
    g.audio?.play('boss_warning');
    g.hud?.toast('⚠ ' + name + ' 出現了', 3000);
  }

  // ---------------------------------------------------------------- economy / XP
  /** Earned money (difficulty moneyMul applied here, once); the HUD shows the gain by the money counter. */
  addMoney(n) {
    const add = Math.round(n * this.diff.moneyMul);
    if (add <= 0) return;
    const before = this.money;
    this.money = Math.min(ECONOMY.maxMoney, this.money + add);
    this.stats.money += add;
    if (this.money > before) this.game.shop?.moneyGain?.(this.money - before);
  }
  /** Spends money (purchases): false and a deny sound when short. */
  spend(n) {
    if (this.money < n) { this.game.audio?.play('ui_deny'); this.game.hud?.toast('金錢不足'); return false; }
    this.money -= n;
    this.stats.spent += n;
    return true;
  }

  onKill(zombie, info) {
    const g = this.game;
    const d = zombie.def, head = !!info?.headshot, elite = !!zombie.elite;
    if (info?.shooter !== g.localId) {
      g.bots?.onKill?.(info?.shooter, head);
      // finished by someone else (an AI teammate, a guest): our damage share pays an assist
      const share = assistShare(zombie, g.localId);
      if (share > 0) this._assist(killMoney(d, head, elite) * share, killXp(d, head, elite) * share);
      return;
    }
    this._reward(killMoney(d, head, elite), killXp(d, head, elite), head);
    g.hud?.killFeed('你', info.weapon || 'knife', d.zh + (elite ? '（精英）' : ''), head);
  }

  /** An assist (host: onKill; guests: the host's 'rw' row with a): money (+ 賞金獵人) and XP, no kill traits. */
  _assist(money, xp) {
    this.stats.assists++;
    if (money > 0) this.addMoney(money * (1 + 0.1 * (this.traits.bounty || 0)));
    if (xp > 0) this.addXp(xp);
  }

  /**
   * Every damaging hit on a zombie (zombies/manager.js Zombie.damage, after its multipliers; dealt = what came off
   * its health): our damage / boss damage for the results, the AI teammates' tallies.
   */
  onDamage(zombie, dealt, shooter) {
    if (!(dealt > 0)) return;
    const g = this.game;
    if (shooter === g.localId) {
      this.stats.damage += dealt;
      if (zombie.def?.boss) this.stats.bossDamage += dealt;
    } else g.bots?.onDamage?.(shooter, dealt, zombie);
  }

  /** Our kill (host: onKill; guests: the host's 'rw' row): money (+ 賞金獵人), XP and the on-kill traits. */
  _reward(money, xp, head) {
    const g = this.game, t = this.traits, st = g.status;
    this.stats.kills++;
    if (head) this.stats.headshots++;
    if (money > 0) this.addMoney(money * (1 + 0.1 * (t.bounty || 0)));
    this.addXp(xp);
    if (t.leech && st) st.heal(2 * t.leech * (head ? 2 : 1));
    if (t.adrenaline) this.adrenT = 2.5;
    // 戰場回收: rounds straight into the magazine of a gun (not a melee weapon, nothing past a full magazine)
    const ws = g.arsenal?.current, d = ws?.def;
    if (t.scavenge && d && d.mag > 0 && d.mode !== 'melee' && ws.ammo < d.mag) { ws.ammo = Math.min(d.mag, ws.ammo + t.scavenge); g.hud?.ammoChanged?.(); }
  }

  addXp(n) {
    if (this.level >= MAX_LEVEL) return;
    this.xp += n;
    const lv0 = this.level;
    while (this.level < MAX_LEVEL && this.xp >= xpFor(this.level + 1)) {
      this.level++;
      this.pendingPerks++;
      this.game.audio?.play('level_up');
      this.game.status?.heal(25);
      this.game.onLevelUp?.(this.level);
    }
    if (this.level > lv0) this._levelUpFx();
    const a = xpFor(this.level), b = xpFor(this.level + 1);
    this.xpFrac = this.level >= MAX_LEVEL ? 1 : (this.xp - a) / (b - a);
  }

  /** CSO level-up (06b §7.2, §9.6.5): a dark text band low in the middle + a gold ring at our feet (own view only). */
  _levelUpFx() {
    const g = this.game;
    if (g.player) g.fx?.zfx?.levelUp(g.player.pos);
    let el = this._lvlEl;
    if (!el) {
      el = this._lvlEl = document.createElement('div');
      el.className = 'cf-lvlup';
      el.style.cssText = 'position:fixed;left:50%;top:74%;width:44%;min-width:260px;padding:.35em 0;text-align:center;pointer-events:none;opacity:0;'
        + 'font:600 20px/1.2 "Barlow Condensed","Noto Sans TC","Microsoft JhengHei",sans-serif;color:#fff;letter-spacing:.06em;text-shadow:0 1px 2px #000;'
        + 'background:linear-gradient(90deg,transparent,rgba(0,0,0,.45) 18%,rgba(0,0,0,.45) 82%,transparent);transform:translate(-50%,8px)';
      (g.hud?.root || document.body).appendChild(el);
    }
    // gold 4-point sparkle on the left end, then the text
    el.innerHTML = '<svg width="22" height="22" viewBox="-11 -11 22 22" style="vertical-align:-4px;margin-right:.5em;filter:drop-shadow(0 0 4px #ffcc44)">'
      + '<path d="M0-11L2-2L11 0L2 2L0 11L-2 2L-11 0L-2-2Z" fill="#ffe08a"/></svg>等級提升！<b style="color:#ffd35a;margin-left:.4em">Lv.' + this.level + '</b>';
    el.style.transition = 'none'; el.style.opacity = '0'; el.style.transform = 'translate(-50%,8px)';
    void el.offsetWidth;
    el.style.transition = 'opacity .2s, transform .2s'; el.style.opacity = '1'; el.style.transform = 'translate(-50%,0)';
    clearTimeout(this._lvlTimer);
    this._lvlTimer = setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; }, 2500);
  }

  // ---------------------------------------------------------------- level traits (戰技)
  /** The traits offered for the pending point: three not maxed yet (戰場津貼 fills in once they run out). */
  perkOptions() {
    if (this.pendingPerks <= 0) return [];
    if (!this.perkChoices) {
      const open = PERKS.filter((p) => (this.traits[p.id] || 0) < p.max).map((p) => p.id);
      for (let i = open.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [open[i], open[j]] = [open[j], open[i]]; }
      this.perkChoices = open.slice(0, 3);
      if (this.perkChoices.length < 3) this.perkChoices.push(PERK_CASH.id);
    }
    return this.perkChoices;
  }

  /** Spends a pending trait point on `id` (one of perkOptions(); anything else takes the first). Returns the perk. */
  choosePerk(id) {
    if (this.pendingPerks <= 0) return null;
    const opts = this.perkOptions();
    const perk = PERK[opts.includes(id) ? id : opts[0]];
    if (perk === PERK_CASH) this.addMoney(PERK_CASH.money / this.diff.moneyMul);
    else this.traits[perk.id] = (this.traits[perk.id] || 0) + 1;
    this.pendingPerks--;
    this.perkChoices = null;
    this._applyStats();
    this.game.shop?.refresh?.();
    return perk;
  }

  // ---------------------------------------------------------------- money upgrades (強化)
  /** Upgrades sell in the buy time only (warmup / between rounds): never mid-round, not even in a buy zone. */
  canUpgrade() { return (this.state === 'warmup' || this.state === 'buy') && this.canBuy(); }

  /** Why a money upgrade would do nothing yet ('' when it applies): 護甲 needs kevlar, 技能充能 a 克金 weapon. */
  upgradeNote(id) {
    const g = this.game;
    if (id === 'armor' && !g.status?.kevlar) return '需穿戴防彈衣';
    if (id === 'charge' && !Object.values(g.arsenal?.owned || {}).some((ws) => ws.def.special)) return '需持有克金武器';
    return '';
  }

  /** Something waits in the 強化 tab (the HUD's gold dot on [B] 商店): a trait point, or an affordable upgrade that applies. */
  upgradeWaiting() {
    if (this.pendingPerks > 0) return true;
    if (!this.canUpgrade()) return false;
    return UPGRADES.some((u) => !this.upgradeNote(u.id) && upgradePrice(u.id, this.upgrades[u.id] | 0) <= this.money);
  }

  /** Buys the next level of a money upgrade (rules.js UPGRADES). */
  buyUpgrade(id) {
    const g = this.game, u = UPGRADE[id];
    if (!u) return false;
    const lv = this.upgrades[id] | 0;
    if (!this.canUpgrade()) { g.audio?.play('ui_deny'); g.hud?.toast('強化只在購買時間開放'); return false; }
    if (lv >= u.max || !this.spend(upgradePrice(id, lv))) { if (lv >= u.max) g.audio?.play('ui_deny'); return false; }
    this.upgrades[id] = lv + 1;
    this._applyStats();
    if (id === 'hp') g.status?.heal(UPGRADE.hp.value(lv + 1) - UPGRADE.hp.value(lv));
    if (id === 'ammo') {
      // the extra capacity arrives filled (finite reserves only: arrows, magazines; mana / unlimited stay as they are)
      const add = u.value(lv + 1) - u.value(lv);
      for (const ws of Object.values(g.arsenal?.owned || {})) { const r = ws.def.reserve; if (Number.isFinite(r) && r > 0) ws.reserve += Math.round(r * add); }
    }
    g.audio?.play('ui_buy');
    return true;
  }

  /**
   * Pushes the money upgrades and the traits into the arsenal (damage, reload, headshot, reserve, meter gain,
   * knockback, spread) and the player status (health, armour, bleed-out); on every change and once the arsenal
   * exists. Damage is applied on the shooter's client only (its hits travel to the host as final amounts).
   */
  _applyStats() {
    const g = this.game, t = this.traits, val = (id) => UPGRADE[id].value(this.upgrades[id] | 0);
    this.dmgMul = val('atk');
    this.reloadMul = val('reload');
    this.moveMul = val('speed');
    const ar = g.arsenal;
    if (ar) {
      ar.dmgMul = this.dmgMul; ar.reloadMul = this.reloadMul;   // (premium team auras multiply onto these: specials.js)
      ar.headMul = val('head'); ar.reserveMul = val('ammo'); ar.chargeMul = val('charge');
      ar.knockMul = 1 + 0.15 * (t.knock || 0); ar.spreadMul = 1 - 0.08 * (t.steady || 0);
    }
    const st = g.status;
    if (st) {
      st.maxHp = val('hp'); st.hp = Math.min(st.hp, st.maxHp);
      const a = val('armor');
      st.maxArmor = a.max; st.armorRegen = a.regen;
      st.bleedOut = 20 + 5 * (t.grit || 0); st.reviveBonus = 15 * (t.grit || 0);
    }
    g.shop?.badges?.refresh();   // HUD level badges by the vitals
  }

  /** First two matches: the buy menu opens by itself in the warmup (the starting kit is a sidearm). */
  _shopIntro() {
    this._intro = true;
    const g = this.game;
    if (this.state !== 'warmup' || !g.shop) return;
    let n = 9;
    try { n = +(localStorage.getItem('cf.shopIntro') || 0); localStorage.setItem('cf.shopIntro', String(n + 1)); } catch { /* private mode */ }
    if (n < 2) setTimeout(() => { if (!g.disposed && this.state === 'warmup' && !g.shop.open) g.shop.show(); }, 900);
  }

  // ---------------------------------------------------------------- shop
  /** What the shop charges for a weapon (rules.js priceOf: series price bands). */
  price(id) { return priceOf(WEAPONS[id]); }
  /** Whether we carry this weapon (it sits in the slot its def takes). */
  owns(id) { const w = WEAPONS[id], o = w && this.game.arsenal?.owned[slotOf(w)]; return !!o && o.def.id === id; }

  buy(id) {
    const g = this.game;
    const w = WEAPONS[id];
    if (!w || !isListed(w) || this.owns(id)) { g.audio?.play('ui_deny'); return false; }
    if (!this.canBuy()) { g.audio?.play('ui_deny'); g.hud?.toast('現在不能購買'); return false; }
    if (!this.spend(this.price(id))) return false;
    g.arsenal.give(id);
    g.audio?.play('ui_buy');
    return true;
  }

  buyArmor(kind) {
    const g = this.game, st = g.status;
    const price = kind === 'helmet' ? ECONOMY.helmetPrice : ECONOMY.armorPrice;
    const full = kind === 'helmet' ? st.helmet : st.armor >= st.maxArmor;
    if (!this.canBuy() || full) { g.audio?.play('ui_deny'); return false; }
    if (!this.spend(price)) return false;
    if (kind === 'helmet') st.helmet = true; else { st.armor = st.maxArmor; st.kevlar = true; }
    g.audio?.play('ui_buy');
    return true;
  }

  /**
   * Ammo for one weapon state: { kind, label, price, add, why } (why = why there is nothing to buy, else ''). Not every
   * weapon is a gun (rules.js resourceKind): bows buy arrows, mana / charges refill themselves, melee spends nothing.
   */
  ammoOffer(ws) {
    const d = ws?.def, ar = this.game.arsenal, kind = resourceKind(d);
    const label = { arrows: '補充箭矢', mana: '法力', charges: '充能' }[kind] || '補充彈藥';
    if (!d) return { kind, label, why: '沒有武器' };
    if (kind === 'none') return { kind, label, why: '近戰武器' };
    if (kind === 'mana' || kind === 'charges') return { kind, label, why: '自動回復' };
    if (!Number.isFinite(d.reserve)) return { kind, label, why: '無限備彈' };
    if (!(d.reserve > 0) || !(d.mag > 0)) return { kind, label, why: '無備彈' };
    // two magazines, at least a third of the base reserve (a 1-arrow bow refills a quiver, not 2 arrows); stock up
    // to twice the maximum reserve
    const max = ar?.maxReserve?.(ws) ?? d.reserve, cap = Math.round(max * 2);
    const add = Math.min(cap - ws.reserve, Math.max(Math.max(1, d.mag) * 2, Math.ceil(d.reserve / 3)));
    const price = Math.min(ECONOMY.ammoMax, Math.max(ECONOMY.ammoMin, Math.round(priceOf(d) * ECONOMY.ammoPrice / 10) * 10));
    return { kind, label, price, add: Math.max(0, add), why: add > 0 ? '' : '備彈已滿' };
  }

  buyAmmo() {
    const g = this.game, ws = g.arsenal.current, o = this.ammoOffer(ws);
    if (!this.canBuy() || o.why) { g.audio?.play('ui_deny'); return false; }
    if (!this.spend(o.price)) return false;
    ws.reserve += o.add;
    g.hud?.ammoChanged?.();
    g.audio?.play('ui_buy');
    return true;
  }

  /** Grenades (weapons/throwables.js prices and limits) through the match purse. */
  buyThrowable(kind) {
    const m0 = this.money;
    if (!this.game.throwables?.buy(kind)) return false;
    this.stats.spent += m0 - this.money;
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
      this.dropSupply(p, { owner: g.localId });
    }
  }

  /**
   * Halfway through a boss: a gold crate drops at the supply point nearest us (CSO rare crate; long boss fights ran
   * the guns dry). Every client drops its own (crates are local), on the host's boss health fraction.
   */
  _bossSupply(frac) {
    if (frac > 0.5 || frac <= 0 || this._bossCrateRound === this.round) return;
    this._bossCrateRound = this.round;
    this._nearCrate({ rare: true });
  }

  /**
   * Halfway through a long round (round 3 on, no boss): one crate at the supply point nearest us -- the late rounds
   * outlast a full reserve (QA: ~700 body hits in round 8). `left` = infected left (host: queue + alive; guests: the
   * host's count); half of the most seen this round. Local, like every crate.
   */
  _midSupply(left) {
    if (this._midRound !== this.round) { this._midRound = this.round; this._midMax = 0; this._midDone = false; }
    this._midMax = Math.max(this._midMax, left);
    if (this._midDone || this.round < 3 || ROUNDS[this.round - 1]?.boss || this._midMax < 20 || left > this._midMax / 2) return;
    this._midDone = true;
    this._nearCrate();
  }

  /** A crate at the free supply point nearest us, with the airdrop toast. */
  _nearCrate(opts = {}) {
    const g = this.game, pts = (g.world.def?.supply || []).map((p) => new THREE.Vector3(...p));
    const me = g.player?.pos;
    if (!pts.length || !me) return;
    pts.sort((a, b) => a.distanceTo(me) - b.distanceTo(me));
    this.dropSupply(pts.find((p) => !this.supplies.some((s) => s.pos.distanceTo(p) < 1)) || pts[0], opts);
    g.hud?.toast('補給箱空投！', 2000);
  }

  /**
   * Drops one crate at p (floor). owner: the player id whose glow it is for the first 60 s (null = everyone's; CSO:
   * a zombie's crate glows only for its killer), rare: gold boss / rare crate. Crates live on this client only.
   */
  dropSupply(p, { owner = null, rare = false } = {}) {
    const g = this.game, K = crateParts();
    const mesh = new THREE.Group();
    const part = (geo, mat, x, y, z, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; mesh.add(m); return m; };
    part(K.body, K.steel, 0, 0.21, 0);
    const seamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0) });
    part(K.seam, seamMat, 0, 0.432, 0, false);
    const lid = part(K.lid, K.lidMat, 0, 0.494, 0);
    for (const x of [-0.3, 0.3]) part(K.strap, K.strapMat, x, 0.27, 0);
    for (const z of [-0.33, 0.33]) part(K.latch, K.latchMat, 0, 0.43, z, false);
    mesh.rotation.y = Math.random() * Math.PI;
    mesh.position.copy(p).setY(p.y + 3);          // falls in, bounces once
    g.scene.add(mesh);
    this.supplies.push({ pos: p.clone(), mesh, lid, seamMat, t: 0, vy: 0, landed: false, owner, rare, glow: null, phase: '' });
    g.audio?.play('supply_drop', { pos: p });
  }

  /** Crate drop-in, seam glow (killer-only 60 s, then everyone's), column + gear ring, lid pop when opened. */
  _crateFx(s, dt) {
    const g = this.game, zfx = g.fx?.zfx, m = s.mesh;
    if (!s.landed) {
      s.vy -= 14 * dt;
      m.position.y += s.vy * dt;
      if (m.position.y <= s.pos.y) {
        m.position.y = s.pos.y;
        if (s.vy < -3) { s.vy *= -0.25; if (!s.thud) { s.thud = true; zfx?.supplyLand(s.pos); } } else { s.vy = 0; s.landed = true; }
      }
    }
    if (s.opened !== undefined) {
      // lid swings open on its back edge (hinge at z = -0.32) in 0.15 s
      const a = Math.min(1, s.opened / 0.15) * 1.9;
      s.lid.position.set(0, 0.494 + 0.32 * Math.sin(a), -0.32 + 0.32 * Math.cos(a));
      s.lid.rotation.x = -a;
      return;
    }
    const mine = s.owner == null || s.owner === g.localId, shared = s.t > 60;
    const phase = !mine && !shared ? 'hidden' : s.rare ? 'gold' : shared ? 'open' : 'killer';
    const col = CRATE[phase] || null;
    if (phase !== s.phase && (s.landed || !col)) {
      s.phase = phase;
      if (!col) { s.glow?.stop(); s.glow = null; }
      else if (s.glow) s.glow.setColor(col);
      else s.glow = zfx?.supplyGlow(s.pos, col) || null;
    }
    const k = col ? 0.65 + 0.35 * Math.sin(s.t * 1.2 * Math.PI * 2) : 0;   // 1.2 Hz breathing, ±35 %
    if (col) s.seamMat.color.setRGB(col[0] * k, col[1] * k, col[2] * k); else s.seamMat.color.setRGB(0.02, 0.025, 0.03);
  }

  _updateSupplies(dt) {
    const g = this.game;
    let near = null;
    const up = !g.status || g.status.alive && !g.status.downed; // downed / dead players can't open crates
    for (let i = this.supplies.length - 1; i >= 0; i--) {
      const s = this.supplies[i];
      s.t += dt;
      this._crateFx(s, dt);
      if (s.opened !== undefined) { s.opened += dt; if (s.opened > 0.7) { g.scene.remove(s.mesh); s.seamMat.dispose(); this.supplies.splice(i, 1); } continue; }
      if (up && s.pos.distanceTo(g.player.pos) < 1.8) near = s;
    }
    g.hud?.setPrompt(near ? '按 E 開啟補給箱' : '');
    if (near && g.input.state.pressed.use) {
      // a full reserve (with the 彈藥容量 upgrade) for every weapon that has a finite one
      for (const w of Object.values(g.arsenal.owned)) if (Number.isFinite(w.def.reserve)) w.reserve = Math.max(w.reserve, g.arsenal.maxReserve?.(w) ?? w.def.reserve);
      g.status.armor = Math.max(g.status.armor, Math.min(g.status.maxArmor ?? 100, 60));
      g.status.kevlar = true;
      g.status.heal(25);
      g.audio?.play('ui_buy');
      g.hud?.toast('補給：彈藥、護甲、生命');
      near.opened = 0;     // lid pops, sparkles, removed after 0.7 s
      near.glow?.stop(); near.glow = null;
      g.fx?.zfx?.supplyOpen(near.pos, near.rare ? CRATE.gold : [1.2, 2.2, 4.0]);
    }
  }

  // ---------------------------------------------------------------- music / stingers
  /** Victory / defeat: the loop fades out under the stinger, the menu theme fades in after it (results screen). */
  _endCue(name) {
    const a = this.game.audio;
    if (a?.stinger) a.stinger(name, { then: 'menu_theme' }); else a?.play(name);
  }

  /** Last five seconds of the buy / warmup countdown tick once per second. */
  _countdownTick() {
    const s = Math.ceil(this.timer);
    if (s !== this._tickS && s >= 1 && s <= 5) this.game.audio?.play('countdown_tick', { volume: s === 1 ? 0.9 : 0.7 });
    this._tickS = s;
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
      this._bossCrateRound = 0; this._midRound = 0;
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
      g.audio?.play('round_lose');
      g.audio?.playMusic?.('calm');
    } else if (state === 'buy' && prev === 'round') {
      g.audio?.play('round_win');
      this._roundReward(round);
      this._dropSupplies(1);
      g.audio?.playMusic?.('calm');
      if (ROUNDS[round]?.boss) g.audio?.prepareMusic?.('boss');
    } else if (state === 'victory') { this._endCue('victory'); g.onMatchEnd?.(true, this.stats); }
    else if (state === 'defeat') { this.stats.deaths++; this._endCue('defeat'); g.onMatchEnd?.(false, this.stats); }
  }

  _mirrorUpdate() {
    const g = this.game;
    const R = ROUNDS[Math.max(0, this.round - 1)];
    if (this.state === 'warmup' || this.state === 'buy') { g.hud?.setRound(this.state === 'warmup' ? '準備作戰' : `${ROUNDS[this.round]?.title || ''} 即將開始`, `${Math.max(0, Math.ceil(this.timer))}`); this._countdownTick(); }
    else if (this.state === 'round') { g.hud?.setRound(R?.title || '', `剩餘感染者 ${this.left ?? 0}`); if (this.left != null) this._midSupply(this.left); }
    else if (this.state === 'victory') g.hud?.setRound('任務完成', '');
    else if (this.state === 'defeat') g.hud?.setRound('任務失敗', '');
    g.hud?.setBoss(this.bossFrac >= 0 && this.state === 'round' ? this.bossName : null, Math.max(0, this.bossFrac));
    if (this.bossFrac >= 0 && this.state === 'round') this._bossSupply(this.bossFrac);
  }

  /** Host credited us with a kill: { m: killMoney (before our moneyMul / traits), x: XP, n, h, w }; a: an assist ({ m, x }). */
  applyReward(r) {
    if (r.a) { this._assist(r.m, r.x); return; }
    this._reward(r.m, r.x, !!r.h);
    this.game.hud?.killFeed('你', r.w, r.n, !!r.h);
  }
}
