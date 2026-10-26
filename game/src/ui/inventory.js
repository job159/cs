// Player collection (docs/PREMIUM_WEAPONS.md §3.9, §3.10): finish items for the standard guns, premium weapon records
// (相 / 窯變 / 熟練度), what is equipped, and the free supply crates earned by playing -- all play-earned, nothing is
// ever bought with money. Persisted in localStorage 'cf.armory' as a versioned document; data and game hooks only
// (no DOM): the armory screen (armory.js), the crate opening (crate.js) and the match (game.js, weapons/arsenal.js,
// net/sync.js) all read this one store.
//
//   inventory.items / get(uid) / equippedItem(weapon) / equip(uid) / unequip(weapon)
//   inventory.premiumRec(weapon) / ensurePremium(weapon) / setPhase(weapon, phase) / phaseUnlocked(weapon, phase)
//   inventory.crates { owned, points, opened, pity } / addPoints(n, why) / openCrate(id) -> { item, grade, ... }
//   inventory.skinDef(def)      the weapon def a match gives: + finish (standard) or the phase's premium config
//   inventory.countKill(weapon, { boss })   斬數計 + premium mastery (phase unlocks)
//   inventory.dye / salvage(uids) / tradeUp(uids)   色料 from 分解, 合成 (5 of a grade -> 1 of the next, §3.9)
//   inventory.on(fn) -> off     change listeners ('items' | 'equip' | 'crates' | 'premium')
//   MatchRewards (game.js)      crate points from the match flow: rounds cleared, bosses, victory (a match left early
//                               still pays the rounds and bosses it cleared)
//   tryout                      the armory's 試用: the test range with that weapon and look (game.js takes it)
import { WEAPONS, listed, tierOf, isListed } from '../weapons/defs.js';
import { finishDef, finishId, finishName, rollFloat, chaseTitle, phaseConfig, phasesOf, kilnOf, PHASE_UNLOCK, GRADES, WEAR_GRADES, wearGrade } from '../gfx/finishes.js';
import { ROUNDS } from '../match/rules.js';

const KEY = 'cf.armory';
const VERSION = 1;
export const GRADE_ORDER = ['common', 'fine', 'superior', 'precious', 'exquisite', 'divine'];
export const gradeRank = (g) => GRADE_ORDER.indexOf(g);

/**
 * Free supply crates (§3.9): published grade odds, pity (at least that grade within N crates), the 斬數計 chance.
 * Pool entries starting with '*' are groups that roll their phase at the drop.
 */
export const CRATES = {
  qiming_s1: {
    zh: '啟明補給箱．壹', en: 'QIMING SUPPLY CRATE I', collection: 'qiming_s1',
    desc: '首發收藏：啟明工坊．壹，以及開春、驚雷、盛夏、秋山系列。只能用於制式槍械。',
    odds: { common: 0.55, fine: 0.25, superior: 0.12, precious: 0.055, exquisite: 0.022, divine: 0.003 },
    pity: [['superior', 10], ['precious', 30], ['exquisite', 60], ['divine', 150]],
    counter: 0.1,
    pool: {
      common: ['bamboo', 'kuroshio', 'urban_grid', 'rainforest', 'gobi'],
      fine: ['night_owl', 'blue_white', 'carbon'],
      superior: ['mirror_chrome', 'candy_red', 'glacier_blue', 'emerald_anod', 'amethyst', 'rose_gold', 'titanium_gold'],
      precious: ['forge_bloom', 'night_snare', 'cloud_leopard', 'thousand_fold', 'silver_engrave'],
      exquisite: ['dusk_fade', 'aurora_fade', 'amber_fade', '*nebula', '*qinglan', 'tri_glaze', 'scarlet_snare', 'cinnabar_stripe', 'cinnabar_hammer', 'gold_stripe', 'gilded_scroll', 'gilded_meander', 'tearglow'],
      divine: ['gem_cinnabar', 'gem_azure', 'gem_jadeite', 'gem_inkjade'],
    },
  },
};
export const DEFAULT_CRATE = 'qiming_s1';
/** Pool groups: 星渦 rolls one of four phases, 5 % of drops become a gem phase (1.25 % each, 神品); 青嵐 four phases. */
export const GROUPS = {
  nebula: { zh: '星渦', phases: ['nebula_dusk', 'nebula_violet', 'nebula_abyss', 'nebula_aurora'], gems: ['gem_cinnabar', 'gem_azure', 'gem_jadeite', 'gem_inkjade'], gemChance: 0.05 },
  qinglan: { zh: '青嵐', phases: ['qinglan', 'qinglan_2', 'qinglan_3', 'qinglan_4'] },
};

/**
 * Crate points (one crate per 100): a normal match earns one -- 10 rounds x 10, two bosses x 25 and the victory 25 make
 * 175 (a loss at the final boss still 115); harder difficulties pay more. Progress past a crate carries over.
 */
export const EARN = { round: 10, boss: 25, victory: 25, perCrate: 100, starter: 2, diff: { normal: 1, hard: 1.25, hell: 1.5, calamity: 2 } };

/** Standard guns a crate item can be for (listed, with a model; melee waits for the knife). */
export function dropWeapons() { return listed().filter((w) => tierOf(w) === 'standard' && w.cat !== 'melee' && w.cat !== 'grenade'); }
/** Premium weapons with a phase set (§3.8). */
export function premiumWeapons() { return listed().filter((w) => w.premium && (phasesOf(w).length > 1 || kilnOf(w))); }

/** Rolls one crate (pity: { grade: crates since one at least that good }). Pure; the caller applies the pity update. */
export function rollCrate(crate, pity = {}, rnd = Math.random) {
  let min = 0;
  for (const [g, n] of crate.pity) if ((pity[g] | 0) >= n - 1) min = Math.max(min, gradeRank(g));
  const gs = GRADE_ORDER.filter((g) => gradeRank(g) >= min && crate.odds[g] > 0);
  const tot = gs.reduce((a, g) => a + crate.odds[g], 0);
  let x = rnd() * tot, grade = gs[gs.length - 1];
  for (const g of gs) { if ((x -= crate.odds[g]) < 0) { grade = g; break; } }
  const pool = crate.pool[grade];
  const entry = pool[Math.floor(rnd() * pool.length) % pool.length];
  let finish = entry;
  if (entry.startsWith('*')) {
    const G = GROUPS[entry.slice(1)];
    finish = G.gems && rnd() < G.gemChance ? G.gems[Math.floor(rnd() * G.gems.length) % G.gems.length] : G.phases[Math.floor(rnd() * G.phases.length) % G.phases.length];
  }
  const ws = dropWeapons();
  const item = ws[Math.floor(rnd() * ws.length) % ws.length]?.id || 'akm';
  const seed = Math.floor(rnd() * 1000) % 1000;
  const float = +rollFloat(finish, rnd).toFixed(6);
  const counter = rnd() < crate.counter ? { on: true, kills: 0, boss: 0 } : null;
  const title = chaseTitle(finish, seed)?.id || null;
  return { item, finish, seed, float, counter, title, grade: finishDef(finish)?.grade || grade, pityGrade: min > 0 ? GRADE_ORDER[min] : null };
}

/**
 * Odds of every finish of a crate (for the published table and the reel fillers): [{ finish, grade, p, gemP }], one
 * row per finish -- a finish reachable two ways (a 星渦 gem phase: the 神品 pool and the 星渦 group) sums both, gemP
 * being the group's share.
 */
export function crateContents(crate) {
  const rows = new Map();
  const add = (finish, grade, p, gem = false) => {
    const r = rows.get(finish) || { finish, grade: finishDef(finish)?.grade || grade, p: 0, gemP: 0 };
    r.p += p; if (gem) r.gemP += p;
    rows.set(finish, r);
  };
  for (const g of GRADE_ORDER) {
    const pool = crate.pool[g] || [], pg = crate.odds[g] || 0;
    for (const e of pool) {
      const pe = pg / pool.length;
      if (!e.startsWith('*')) { add(e, g, pe); continue; }
      const G = GROUPS[e.slice(1)], gem = G.gems ? G.gemChance : 0;
      for (const f of G.phases) add(f, g, pe * (1 - gem) / G.phases.length);
      for (const f of G.gems || []) add(f, 'divine', pe * gem / G.gems.length, true);
    }
  }
  return [...rows.values()];
}
/** Chance of a grade from one crate, the 星渦 gem path included: { p, gemP } (the odds table shows both parts). */
export function gradeChance(crate, grade) {
  let p = 0, gemP = 0;
  for (const r of crateContents(crate)) if (r.grade === grade) { p += r.p; gemP += r.gemP; }
  return { p, gemP };
}

// ---------------------------------------------------------------- 分解 / 合成 (§3.9)

/** 色料 from 分解 one item of a grade; the 色料 fee of a 合成 of DYE.n items of a grade. */
export const DYE = {
  salvage: { common: 2, fine: 4, superior: 10, precious: 20, exquisite: 50, divine: 150 },
  trade: { common: 5, fine: 10, superior: 20, precious: 40, exquisite: 80 },
  n: 5,
};
/**
 * What a 合成 of these items can give: [{ finish, grade, p }]. Each input stands for 1/n of the odds, spread over the
 * next grade's finishes of its own collection in the crate (CS2-style); a collection without that grade spreads its
 * share over the crate's whole next grade.
 */
export function tradeOutcomes(items, crate = CRATES[DEFAULT_CRATE]) {
  if (!items.length) return [];
  const g = finishDef(items[0].finish)?.grade, next = GRADE_ORDER[gradeRank(g) + 1];
  if (!next) return [];
  const pool = crateContents(crate).filter((r) => r.grade === next).map((r) => r.finish);
  const out = new Map();
  for (const it of items) {
    const col = finishDef(it.finish)?.collection;
    const own = pool.filter((f) => finishDef(f)?.collection === col);
    const set = own.length ? own : pool;
    for (const f of set) out.set(f, (out.get(f) || 0) + 1 / items.length / set.length);
  }
  return [...out].map(([finish, p]) => ({ finish, grade: next, p })).sort((a, b) => b.p - a.p);
}
/** Copies of one look: items of the same weapon and finish. */
export const stackKey = (it) => it.item + '|' + it.finish;
/** The copy worth keeping first: a rare pattern, a 斬數計, then the lowest float. */
export const bestFirst = (a, b) => (b.title ? 1 : 0) - (a.title ? 1 : 0) || (b.counter?.on ? 1 : 0) - (a.counter?.on ? 1 : 0) || a.float - b.float || a.uid - b.uid;

// ---------------------------------------------------------------- names

/** Display names of an item: { weapon, finish (with ◆ / 稱號), full: '草原｜落日漸層' }. */
export function itemNames(it) {
  const w = WEAPONS[it.item];
  const title = it.title ? finishDef(it.finish)?.chase?.titles.find((t) => t.id === it.title)?.zh : null;
  const finish = finishName(it.finish, { chase: title });
  return { weapon: w?.zh || it.item, weaponEn: w?.en || '', finish, title, full: `${w?.zh || it.item}｜${finish}` };
}
export const gradeOf = (it) => GRADES[finishDef(it.finish)?.grade] || GRADES.common;
export { wearGrade, WEAR_GRADES };

// ---------------------------------------------------------------- store

const store = {
  get() { try { return localStorage.getItem(KEY); } catch { return null; } },
  set(v) { try { localStorage.setItem(KEY, v); return true; } catch { return false; } },
};

function blank() {
  return { v: VERSION, uid: 1, items: [], premium: {}, equipped: {}, crates: { owned: EARN.starter, points: 0, opened: 0, pity: {}, earned: 0 }, log: [], seen: 0, dye: 0 };
}

/** Validates / migrates a stored document (unknown finishes and weapons are dropped, renamed finish ids follow). */
function migrate(d) {
  if (!d || typeof d !== 'object' || !(d.v >= 1)) return blank();
  const out = blank();
  out.uid = Math.max(1, d.uid | 0);
  for (const it of Array.isArray(d.items) ? d.items : []) {
    const id = finishId(it?.finish);
    if (!id || !WEAPONS[it.item] || !(it.uid > 0)) continue;
    out.items.push({ uid: it.uid | 0, item: it.item, finish: id, seed: Math.max(0, Math.min(999, it.seed | 0)), float: Math.max(0, Math.min(1, +it.float || 0)),
      counter: it.counter?.on ? { on: true, kills: Math.max(0, it.counter.kills | 0), boss: Math.max(0, it.counter.boss | 0) } : null,
      title: typeof it.title === 'string' ? it.title : null, src: it.src || 'crate', at: +it.at || 0, fresh: !!it.fresh });
    out.uid = Math.max(out.uid, (it.uid | 0) + 1);
  }
  for (const [w, r] of Object.entries(d.premium || {})) {
    if (!WEAPONS[w]?.premium || !r) continue;
    out.premium[w] = { phase: r.phase === 'kiln' ? 'kiln' : Math.max(0, r.phase | 0), kiln: { seed: Math.max(0, Math.min(999, r.kiln?.seed | 0)), special: !!r.kiln?.special },
      mastery: { kills: Math.max(0, r.mastery?.kills | 0), boss: Math.max(0, r.mastery?.boss | 0) }, at: +r.at || 0 };
  }
  for (const [w, uid] of Object.entries(d.equipped || {})) if (out.items.some((it) => it.uid === uid && it.item === w)) out.equipped[w] = uid;
  const c = d.crates || {};
  out.crates = { owned: Math.max(0, c.owned | 0), points: Math.max(0, +c.points || 0), opened: Math.max(0, c.opened | 0), earned: Math.max(0, c.earned | 0), pity: {} };
  for (const g of GRADE_ORDER) if (c.pity?.[g] > 0) out.crates.pity[g] = c.pity[g] | 0;
  out.log = (Array.isArray(d.log) ? d.log : []).slice(-12).filter((e) => e && typeof e.why === 'string');
  out.seen = d.seen | 0;
  out.dye = Math.max(0, d.dye | 0);
  return out;
}

class Inventory {
  constructor() {
    let d = null;
    try { d = JSON.parse(store.get() || 'null'); } catch { d = null; }
    this.d = migrate(d);
    this.fresh = !d;               // first run: the starter crates are waiting
    this.listeners = new Set();
    this._skin = new Map();        // skinned defs of this session (identity matters: premium code compares ws.def)
    this._saveT = 0;
    this.tryout = null;
    this.returnTo = null;
    this.lastMatch = null;
    if (!d) this.save(true);
    if (typeof window !== 'undefined') window.addEventListener('pagehide', () => this.flush());
  }

  // ------------------------------------------------------------ persistence / events
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit(kind) { for (const f of [...this.listeners]) { try { f(kind); } catch (e) { console.warn(e); } } }
  /** Writes now (now = true) or within 1.5 s (kill counters tick many times a second). */
  save(now = false) {
    if (now) { clearTimeout(this._saveT); this._saveT = 0; store.set(JSON.stringify(this.d)); return; }
    if (!this._saveT) this._saveT = setTimeout(() => { this._saveT = 0; store.set(JSON.stringify(this.d)); }, 1500);
  }
  flush() { if (this._saveT) this.save(true); }

  // ------------------------------------------------------------ items
  get items() { return this.d.items; }
  get(uid) { return this.d.items.find((it) => it.uid === uid) || null; }
  itemsFor(weapon) { return this.d.items.filter((it) => it.item === weapon); }
  get newCount() { return this.d.items.filter((it) => it.fresh).length; }
  /** The 新 mark goes once the item was looked at (quiet: the caller updates its own view). */
  markSeen(uid, quiet = false) { const it = this.get(uid); if (it?.fresh) { it.fresh = false; this.save(); if (!quiet) this._emit('items'); } }
  add(it) {
    const item = { uid: this.d.uid++, item: it.item, finish: it.finish, seed: it.seed, float: it.float, counter: it.counter || null, title: it.title || null, src: it.src || 'crate', at: Date.now(), fresh: true };
    this.d.items.push(item);
    this.save(true);
    this._emit('items');
    return item;
  }

  // ------------------------------------------------------------ 分解 / 合成
  get dye() { return this.d.dye | 0; }
  /** 分解: the items go (never an equipped one) and their 色料 is added. Returns the 色料 gained. */
  salvage(uids) {
    let got = 0;
    for (const uid of uids) {
      const it = this.get(uid);
      if (!it || this.isEquipped(it)) continue;
      got += DYE.salvage[finishDef(it.finish)?.grade] || 1;
      this.d.items.splice(this.d.items.indexOf(it), 1);
    }
    if (!got) return 0;
    this.d.dye = (this.d.dye | 0) + got;
    this.save(true); this._emit('items');
    return got;
  }
  /**
   * 合成: DYE.n unequipped items of one grade (below 神品) and the 色料 fee -> one item of the next grade
   * (tradeOutcomes), its wear at the inputs' mean place in their wear ranges, a 斬數計 when any input had one, the
   * gun one of the inputs'. Returns the new item, or null when the inputs do not qualify.
   */
  tradeUp(uids, rnd = Math.random) {
    const items = [...new Set(uids)].map((u) => this.get(u)).filter((it) => it && !this.isEquipped(it));
    const g = items[0] && finishDef(items[0].finish)?.grade;
    if (items.length !== DYE.n || !items.every((it) => finishDef(it.finish)?.grade === g)) return null;
    const fee = DYE.trade[g];
    if (fee == null || this.dye < fee) return null;
    const outs = tradeOutcomes(items);
    if (!outs.length) return null;
    let x = rnd(), finish = outs[outs.length - 1].finish;
    for (const o of outs) { if ((x -= o.p) < 0) { finish = o.finish; break; } }
    const norm = items.reduce((a, it) => { const [lo, hi] = finishDef(it.finish)?.float || [0, 1]; return a + (it.float - lo) / Math.max(1e-6, hi - lo); }, 0) / items.length;
    const [lo, hi] = finishDef(finish)?.float || [0, 1];
    const seed = Math.floor(rnd() * 1000) % 1000;
    const weapon = items[Math.floor(rnd() * items.length) % items.length].item;
    this.d.dye -= fee;
    for (const it of items) this.d.items.splice(this.d.items.indexOf(it), 1);
    return this.add({ item: weapon, finish, seed, float: +(lo + (hi - lo) * Math.max(0, Math.min(1, norm))).toFixed(6),
      counter: items.some((it) => it.counter?.on) ? { on: true, kills: 0, boss: 0 } : null, title: chaseTitle(finish, seed)?.id || null, src: 'trade' });
  }

  // ------------------------------------------------------------ equip
  equippedUid(weapon) { return this.d.equipped[weapon] ?? null; }
  equippedItem(weapon) { const u = this.d.equipped[weapon]; return u != null ? this.get(u) : null; }
  isEquipped(it) { return !!it && this.d.equipped[it.item] === it.uid; }
  equip(uid) {
    const it = this.get(uid);
    if (!it) return false;
    this.d.equipped[it.item] = uid;
    this._skin.clear();
    this.save(true); this._emit('equip');
    return true;
  }
  unequip(weapon) {
    if (!(weapon in this.d.equipped)) return;
    delete this.d.equipped[weapon];
    this._skin.clear();
    this.save(true); this._emit('equip');
  }

  // ------------------------------------------------------------ premium records (相 / 窯變 / 熟練度)
  premiumRec(weapon) { return this.d.premium[weapon] || null; }
  /** The record of a premium weapon, created (kiln seed rolled, §3.8) the first time it is acquired. */
  ensurePremium(weapon) {
    const def = WEAPONS[weapon];
    if (!def?.premium || !(phasesOf(def).length > 1 || kilnOf(def))) return { rec: null, fresh: false };
    let rec = this.d.premium[weapon];
    if (rec) return { rec, fresh: false };
    const k = kilnOf(def);
    rec = this.d.premium[weapon] = { phase: 0, kiln: { seed: Math.floor(Math.random() * 1000), special: !!k && Math.random() < (def.premium.kiln.chance ?? 0.01) }, mastery: { kills: 0, boss: 0 }, at: Date.now() };
    if (rec.kiln.special) rec.phase = 'kiln';
    this._skin.clear();
    this.save(true); this._emit('premium');
    return { rec, fresh: true };
  }
  /** Phase index (or 'kiln') unlocked for this weapon: 本相 always, 相 by mastery kills, 窯變 when rolled. */
  phaseUnlocked(weapon, phase) {
    if (phase === 'kiln') return !!this.d.premium[weapon]?.kiln?.special;
    if (!(phase > 0)) return true;
    return (this.d.premium[weapon]?.mastery.kills || 0) >= (PHASE_UNLOCK[phase] ?? Infinity);
  }
  setPhase(weapon, phase) {
    if (!this.phaseUnlocked(weapon, phase)) return false;
    const { rec } = this.ensurePremium(weapon);
    if (!rec) return false;
    rec.phase = phase;
    this._skin.clear();
    this.save(true); this._emit('premium');
    return true;
  }
  /** The look (phase + kiln seed) a premium weapon shows: the record's, else 本相 with seed 0. */
  phaseOf(weapon) { const r = this.d.premium[weapon]; return { phase: r?.phase ?? 0, seed: r?.kiln?.seed ?? null }; }

  // ------------------------------------------------------------ match hooks
  /**
   * The def a match hands the arsenal for this weapon: + `finish` { id, seed, float, counter } for a standard gun with
   * an equipped item (the 試用 item first), the phase's premium config for a premium weapon. Cached for the session
   * so a weapon keeps one def identity (premium code compares ws.def with the viewmodel's def).
   */
  skinDef(def) {
    if (!def) return def;
    const t = this.tryout?.active && this.tryout.weapon === def.id ? this.tryout : null;
    if (tierOf(def) === 'standard') {
      const it = (t?.uid != null ? this.get(t.uid) : null) || (t ? null : this.equippedItem(def.id));
      if (!it) return def;
      const key = def.id + '#' + it.uid;
      let s = this._skin.get(key);
      if (!s || s._src !== def) {
        s = { ...def, finish: { id: it.finish, seed: it.seed, float: it.float, counter: it.counter?.on ? it.counter : undefined, uid: it.uid }, _src: def };
        this._skin.set(key, s);
      }
      return s;
    }
    // premium: only weapons with 相 / 窯變 (§3.8); the kiln seed (pSeed) is a 神兵 thing
    if (!def.premium || !(phasesOf(def).length > 1 || kilnOf(def))) return def;
    if (!t) this.ensurePremium(def.id);
    const rec = this.d.premium[def.id];
    const phase = t?.phase ?? rec?.phase ?? 0;
    const cfg = phaseConfig(def, phase, tierOf(def) === 'mythic' ? rec?.kiln?.seed ?? null : null);
    if (cfg === def.premium) return def;
    const key = def.id + '@' + phase + ':' + (rec?.kiln?.seed ?? '');
    let s = this._skin.get(key);
    if (!s || s._src !== def) { s = { ...def, premium: cfg, _src: def }; this._skin.set(key, s); }
    return s;
  }
  /** Finish ids a match will draw in first person (loading-screen warm-up of their programs). */
  equippedFinishes() { return [...new Set(Object.values(this.d.equipped).map((u) => this.get(u)?.finish).filter(Boolean))]; }

  /**
   * One of our kills with `weapon`: the equipped item's 斬數計 (§3.6: never reset, the display caps at 999999) and a
   * premium weapon's mastery. Returns { counter: bool, unlocked: phase | null } or null.
   */
  countKill(weapon, { boss = false } = {}) {
    const def = WEAPONS[weapon];
    if (!def) return null;
    if (tierOf(def) === 'standard') {
      const t = this.tryout?.active && this.tryout.weapon === weapon ? this.tryout : null;
      const it = t?.uid != null ? this.get(t.uid) : this.equippedItem(weapon);
      if (!it?.counter?.on) return null;
      it.counter.kills++;
      if (boss) it.counter.boss++;
      this.save();
      return { counter: true, unlocked: null };
    }
    const rec = def.premium ? this.d.premium[weapon] : null;
    if (!rec) return null;
    const before = rec.mastery.kills;
    rec.mastery.kills++;
    if (boss) rec.mastery.boss++;
    this.save();
    const n = phasesOf(def).length;
    const unlocked = PHASE_UNLOCK.findIndex((k, i) => i > 0 && i < n && before < k && rec.mastery.kills >= k);
    if (unlocked > 0) this._emit('premium');
    return { counter: false, unlocked: unlocked > 0 ? unlocked : null };
  }

  // ------------------------------------------------------------ crates
  get crates() { return this.d.crates; }
  get log() { return this.d.log; }
  /** Adds crate points (`why` shows in the crate panel's 最近獲得); returns the crates this completed. */
  addPoints(n, why) {
    n = Math.max(0, Math.round(n));
    if (!n) return 0;
    const c = this.d.crates;
    c.points += n;
    const got = Math.floor(c.points / EARN.perCrate);
    c.points -= got * EARN.perCrate;
    c.owned += got; c.earned += got;
    this.d.log.push({ at: Date.now(), pts: n, why, got });
    if (this.d.log.length > 12) this.d.log.splice(0, this.d.log.length - 12);
    this.save(true); this._emit('crates');
    return got;
  }
  /** Opens one crate: the roll (pity applied), the item added; null without a crate. */
  openCrate(id = DEFAULT_CRATE) {
    const crate = CRATES[id], c = this.d.crates;
    if (!crate || c.owned <= 0) return null;
    const r = rollCrate(crate, c.pity);
    c.owned--; c.opened++;
    const rank = gradeRank(r.grade);
    for (const [g] of crate.pity) c.pity[g] = rank >= gradeRank(g) ? 0 : (c.pity[g] | 0) + 1;
    const item = this.add({ ...r, src: id });
    this._emit('crates');
    return { ...r, item };
  }
  /** Crates opened since the last one at least `grade` (pity counter), and the guarantee size. */
  pityOf(id, grade) { const p = CRATES[id]?.pity.find(([g]) => g === grade); return p ? { n: this.d.crates.pity[grade] | 0, of: p[1] } : null; }

  // ------------------------------------------------------------ 試用 (test range)
  /** Starts a tryout: game.js gives `weapon` with this look in the test range, then the menu returns to the armory. */
  setTryout(t) { this.tryout = t ? { ...t, active: true } : null; this._skin.clear(); }
  /** What a tryout shows: 草原｜極光漸層, or 鴟吻．鎮潮｜本相. */
  tryoutLabel(t) {
    const it = t?.uid != null ? this.get(t.uid) : null;
    if (it) return itemNames(it).full;
    const def = WEAPONS[t?.weapon];
    if (!def) return '';
    const ph = t.phase === 'kiln' ? kilnOf(def)?.zh : phasesOf(def)[t.phase | 0]?.zh;
    return `${def.zh}｜${ph || '本相'}`;
  }
  /** The pending tryout for a match being loaded (once). */
  takeTryout() { const t = this.tryout; if (t && !t.taken) { t.taken = true; t.restore?.(); return t; } return null; }
  /** Back in the menus: the tryout is over (also when its load failed / was cancelled). */
  endTryout() {
    const t = this.tryout;
    if (!t) return null;
    t.restore?.();
    this.tryout = null;
    this._skin.clear();
    return t;
  }
}

export const inventory = new Inventory();
if (typeof window !== 'undefined') window.__inventory = inventory;   // QA hook

// ---------------------------------------------------------------- match rewards

/**
 * Crate points from a match (host, guest and solo alike: each client earns its own): watches the match state --
 * a round cleared (state round -> buy / victory with the same number; a wipe retry steps the number back), its boss
 * when it was a boss round, the victory -- and tells the player at the end. No match (test range): nothing.
 */
export class MatchRewards {
  constructor(game) {
    this.game = game;
    this.state = null; this.round = 0;
    this.pts = 0; this.parts = { round: 0, boss: 0, victory: 0 };
    this.done = false;
    const d = game.matchOptions?.difficulty;
    this.mul = EARN.diff[d] ?? 1;
  }
  update() {
    const m = this.game.match;
    if (!m || this.done) return;
    const st = m.state, r = m.round;
    if (this.state === 'round' && (st === 'buy' || st === 'victory') && r === this.round && r > 0) {
      this._add('round', EARN.round);
      if (ROUNDS[r - 1]?.boss) this._add('boss', EARN.boss);
    }
    if (st === 'victory' && this.state !== 'victory') this._add('victory', EARN.victory);
    if ((st === 'victory' || st === 'defeat') && this.state !== st) this._finish(st === 'victory');
    this.state = st; this.round = r;
  }
  _add(k, n) { const v = n * this.mul; this.parts[k] += v; this.pts += v; }
  _finish(victory) {
    this.done = true;
    const pts = Math.round(this.pts);
    const before = inventory.crates.points;
    const got = pts > 0 ? inventory.addPoints(pts, victory ? '任務完成' : '作戰結算') : 0;
    // (the results screen's 補給 strip reads this: the split, the bar from before to after, the crates it made)
    this.result = inventory.lastMatch = { pts, got, parts: { ...this.parts }, mul: this.mul, before, after: inventory.crates.points, owned: inventory.crates.owned, victory, at: Date.now() };
    if (pts > 0) this.game.hud?.toast(got ? `補給點數 +${pts}　獲得補給箱 ×${got}（武器庫開啟）` : `補給點數 +${pts}　下一個補給箱 ${inventory.crates.points} / ${EARN.perCrate}`, 4200);
  }
  /**
   * The match is left before its end (quit, the room closed, the host gone): the rounds and bosses already cleared
   * still pay, only the victory part is lost. Returns the points paid.
   */
  leave() {
    if (this.done) return 0;
    this.done = true;
    const pts = Math.round(this.pts);
    if (!(pts > 0)) return 0;
    const got = inventory.addPoints(pts, '中途離開');
    this.game.app?.toast?.(got ? `已結算清除的回合：補給點數 +${pts}　獲得補給箱 ×${got}` : `已結算清除的回合：補給點數 +${pts}　下一個補給箱 ${inventory.crates.points} / ${EARN.perCrate}`, 4200);
    return pts;
  }
}

/** True when `def` is something the armory can dress: a standard gun with a model, or a premium weapon with phases. */
export function dressable(def) { return !!def && isListed(def) && (tierOf(def) === 'standard' ? def.cat !== 'melee' : !!(def.premium && (phasesOf(def).length > 1 || kilnOf(def)))); }
