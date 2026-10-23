// Match tuning tables: difficulties, round compositions, the economy (rewards, prices, money upgrades) and the
// level-up traits. Pure data + small helpers (the menus import it before any game exists). docs/DESIGN.md §5.
import { tierOf } from '../weapons/defs.js';

export const DIFFICULTY = {
  normal: { zh: '普通', hpMul: 1.0, dmgMul: 1.0, countMul: 1.0, retries: 3, elite: 0.0, moneyMul: 1.0 },
  hard: { zh: '困難', hpMul: 1.6, dmgMul: 1.4, countMul: 1.15, retries: 2, elite: 0.05, moneyMul: 1.1 },
  hell: { zh: '地獄', hpMul: 2.6, dmgMul: 1.9, countMul: 1.3, retries: 1, elite: 0.1, moneyMul: 1.25 },
  calamity: { zh: '災厄', hpMul: 4.0, dmgMul: 2.6, countMul: 1.45, retries: 0, elite: 0.18, moneyMul: 1.5 },
};

// Per round: zombie counts for ONE player on Normal (scaled by players and difficulty), spawn pacing,
// optional boss. `mix` lists [type, count].
export const ROUNDS = [
  { title: '第 1 回合', mix: [['walker', 22]], burst: [2, 3], interval: 1.6, intro: '感染者正從四面八方逼近' },
  { title: '第 2 回合', mix: [['walker', 26], ['runner', 6]], burst: [2, 4], interval: 1.4 },
  { title: '第 3 回合', mix: [['walker', 30], ['runner', 8], ['spitter', 3], ['bloater', 2]], burst: [3, 4], interval: 1.3, intro: '注意酸液噴吐者與爆裂者' },
  { title: '第 4 回合', mix: [['walker', 32], ['runner', 10], ['spitter', 4], ['bloater', 3], ['crawler', 5], ['screamer', 1]], burst: [3, 5], interval: 1.2 },
  { title: '第 5 回合　首領', mix: [['walker', 18], ['runner', 6]], burst: [2, 3], interval: 2.2, boss: 'butcher', intro: '巨大的反應正在接近……' },
  { title: '第 6 回合', mix: [['walker', 36], ['runner', 12], ['spitter', 5], ['bloater', 4], ['crawler', 6], ['screamer', 2], ['riot', 3], ['brute', 1]], burst: [3, 5], interval: 1.1 },
  { title: '第 7 回合', mix: [['walker', 40], ['runner', 14], ['spitter', 6], ['bloater', 4], ['crawler', 8], ['screamer', 2], ['riot', 5], ['brute', 2]], burst: [4, 6], interval: 1.0, elite: 0.06 },
  { title: '第 8 回合', mix: [['walker', 42], ['runner', 18], ['spitter', 6], ['bloater', 5], ['crawler', 10], ['screamer', 3], ['riot', 6], ['brute', 2]], burst: [4, 6], interval: 0.95, elite: 0.08 },
  { title: '第 9 回合', mix: [['walker', 50], ['runner', 22], ['spitter', 6], ['bloater', 6], ['crawler', 12], ['screamer', 3], ['riot', 6], ['brute', 2]], burst: [4, 6], interval: 0.9, elite: 0.1, intro: '最後的防線' },
  { title: '最終回合　災厄', mix: [['walker', 24], ['runner', 10], ['crawler', 6]], burst: [3, 4], interval: 1.8, boss: 'colossus', intro: '它來了。' },
];

// ------------------------------------------------------------------------------------------------ economy
// Money is per player. Solo Normal earns about $70k up to round 9 (kills ~60 %, round bonuses ~40 %; teammates and
// AI bots share the kills, the bonuses are everyone's): the first SMG in the warmup, a rifle after round 1, the
// first 反災 weapon around rounds 3-5, a 神兵 around 6-8, and the money upgrades (~$63k for all of them) stay the
// sink to the end, so the $32k cap is never in reach.
// Ammunition is not a money sink (QA: late rounds need ~700 body hits, more than a maxed reserve, and the old
// 12 %-of-the-weapon refills ate a quarter of the income): every cleared round and every wipe retry refills the
// reserves (彈藥容量 included), supply crates refill them mid-round, and the shop's refill is a cheap flat price.
// Damage on a zombie someone else finishes pays an assist (with AI teammates in solo the bots finish most of them).
export const ECONOMY = {
  startMoney: 2400, maxMoney: 32000,
  // kills: zombie def.money x killMul (x headshotMul, x eliteMul); bosses pay bossBounty to everyone instead
  killMul: 0.5, headshotMul: 1.5, eliteMul: 2,
  // assist: our damage share of its health (from `min`) x `share` of the kill's money and XP
  assist: { min: 0.15, share: 0.7 },
  roundBonus: (r) => 1400 + 100 * r + (ROUNDS[r - 1]?.boss ? ECONOMY.bossBounty[ROUNDS[r - 1].boss] ?? 0 : 0),
  bossBounty: { butcher: 2500, colossus: 0 },   // (the last round's bounty would only arrive with the results)
  // two magazines (or quivers) of the held weapon: a small cut of its price, within ammoMin..ammoMax
  ammoPrice: 0.035, ammoMin: 80, ammoMax: 200,
  armorPrice: 650, helmetPrice: 350,
  warmup: 15,        // s before round 1 (the first buy), 20 s between rounds
  buyTime: 20,
};

// Starting kit: the sidearm only, so the warmup is the first buy (an SMG + kevlar, or saving for a rifle).
// Match sets game.startWeapon from it unless a dev ?w=<id> chose one.
export const LOADOUT = { sidearm: 'glock', primary: null };

/** Money for a kill (before the difficulty's moneyMul and the 賞金獵人 trait): 0 for bosses (bounty). */
export function killMoney(zdef, head, elite) {
  if (!zdef || zdef.boss) return 0;
  return Math.round((zdef.money || 0) * ECONOMY.killMul * (head ? ECONOMY.headshotMul : 1) * (elite ? ECONOMY.eliteMul : 1));
}
export function killXp(zdef, head, elite) { return (zdef?.xp || 0) * (head ? 1.5 : 1) * (elite ? 2.5 : 1); }
/**
 * Assist factor for player `id` on a zombie someone else killed: its damage share of the zombie's health
 * (Zombie.dmgBy, kept by whoever runs the zombie: the host) x ECONOMY.assist.share, 0 under ECONOMY.assist.min.
 */
export function assistShare(z, id) {
  const f = Math.min(1, (z?.dmgBy?.get(id) || 0) / Math.max(1, z?.maxHp || 1));
  return f >= ECONOMY.assist.min ? f * ECONOMY.assist.share : 0;
}

// Shop price bands per series (docs/PREMIUM_WEAPONS.md §1.2 tiers, §2.27 balance): a def's own `price` places it
// inside its band (DPS, convenience, skills), the band keeps the economy's order: 制式 basics, 反災 the first
// premium buy, 異能 / 傳承 mid game, 神兵 the late-game prize.
export const TIER_PRICE = {
  standard: null,
  anti: { min: 4000, max: 6000, base: 4500 },
  exotic: { min: 6500, max: 9000, base: 7500 },
  legacy: { min: 5500, max: 8500, base: 6500 },
  mythic: { min: 9000, max: 13000, base: 10500 },
};
/**
 * What a weapon spends (the HUD's resource contract, ui/hud.js header): def.resource 'ammo' | 'arrows' | 'mana' |
 * 'charges' | 'none' (or { kind }), else by the cat (melee none, bows arrows, staffs / wands mana). The shop sells
 * ammo and arrows; mana and charges refill themselves, melee spends nothing.
 */
const RES_BY_CAT = { melee: 'none', bow: 'arrows', crossbow: 'arrows', staff: 'mana', wand: 'mana' };
export function resourceKind(def) {
  if (!def) return 'none';
  const r = def.resource;
  return (typeof r === 'string' ? r : r?.kind) || RES_BY_CAT[def.cat] || (def.mode === 'melee' ? 'none' : 'ammo');
}

/** What the shop charges for a weapon def. */
export function priceOf(w) {
  if (!w) return 0;
  const band = TIER_PRICE[tierOf(w)];
  if (!band) return w.price ?? 0;
  return Math.min(band.max, Math.max(band.min, Math.round((w.price ?? band.base) / 50) * 50));
}

// ------------------------------------------------------------------------------------- money upgrades (強化)
// 「錢也能升級基礎面板」: base stats bought with money in the buy time (shop 強化 tab), per match and per player.
// prices[i] buys level i + 1. value(l) is the stat at level l (match.js _applyStats), show(l) its readout.
// Levels replicate as one base-36 char per upgrade in this order (net/sync.js 'u'); never reorder, only append.
export const UPGRADES = [
  { id: 'atk', zh: '攻擊力', en: 'DAMAGE', desc: '全部傷害：槍械、近戰、技能、投擲物', max: 10,
    prices: [500, 750, 1050, 1400, 1800, 2300, 2900, 3600, 4400, 5300], value: (l) => 1 + 0.08 * l, show: (l) => `+${8 * l}%` },
  { id: 'hp', zh: '生命上限', en: 'VITALITY', desc: '最大生命（購買時立即回復同等生命）', max: 6,
    prices: [400, 650, 950, 1300, 1700, 2200], value: (l) => 100 + 20 * l, show: (l) => `${100 + 20 * l}` },
  { id: 'armor', zh: '護甲', en: 'PLATING', desc: '防彈衣耐久上限；脫戰 4 秒後自動修復（每級 +3/秒）', max: 5,
    prices: [500, 800, 1150, 1550, 2000], value: (l) => ({ max: 100 + 25 * l, regen: 3 * l }), show: (l) => `${100 + 25 * l}` },
  { id: 'speed', zh: '移動速度', en: 'MOBILITY', desc: '移動與衝刺速度', max: 4,
    prices: [500, 850, 1300, 1850], value: (l) => 1 + 0.03 * l, show: (l) => `+${3 * l}%` },
  { id: 'reload', zh: '換彈速度', en: 'RELOAD', desc: '換彈與裝填時間縮短', max: 5,
    prices: [350, 600, 900, 1250, 1650], value: (l) => 1 - 0.06 * l, show: (l) => (l ? `-${6 * l}%` : '±0%') },
  { id: 'ammo', zh: '彈藥容量', en: 'AMMO', desc: '備彈與箭矢上限（法力、無限備彈除外）', max: 5,
    prices: [250, 450, 700, 1000, 1350], value: (l) => 1 + 0.2 * l, show: (l) => `+${20 * l}%` },
  { id: 'head', zh: '爆頭傷害', en: 'HEADSHOT', desc: '爆頭倍率（首領頭部固定，不受影響）', max: 5,
    prices: [450, 750, 1100, 1500, 2000], value: (l) => 1 + 0.12 * l, show: (l) => `+${12 * l}%` },
  { id: 'charge', zh: '技能充能', en: 'CHARGE', desc: '克金武器計量的累積速度', max: 5,
    prices: [600, 950, 1350, 1800, 2300], value: (l) => 1 + 0.1 * l, show: (l) => `+${10 * l}%` },
];
export const UPGRADE = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));
/** Price of the next level (Infinity when maxed). */
export function upgradePrice(id, level) { const u = UPGRADE[id]; return u && level < u.max ? u.prices[level] : Infinity; }
export function upgradeLevels() { return Object.fromEntries(UPGRADES.map((u) => [u.id, 0])); }
/** { atk: 3, ... } <-> 'a3...' (net). */
export function encodeUpgrades(lv) { return UPGRADES.map((u) => Math.min(35, lv?.[u.id] | 0).toString(36)).join(''); }
export function decodeUpgrades(code) {
  const lv = upgradeLevels();
  if (typeof code === 'string') UPGRADES.forEach((u, i) => { const n = parseInt(code[i] || '0', 36); lv[u.id] = Number.isFinite(n) ? Math.min(u.max, n) : 0; });
  return lv;
}

// ------------------------------------------------------------------------------------------ XP + level traits
// XP: total needed to reach level L
export const xpFor = (level) => Math.round(90 * Math.pow(level - 1, 1.38));
export const MAX_LEVEL = 40;

// Level-ups grant 戰技 (traits): behaviours, not base stats (those are the money upgrades above), 3 ranks each.
// A level offers three of the traits not maxed yet (F1-F3, or click; the shop's 強化 tab too); when they are
// all maxed a level pays 戰場津貼 instead. rank = the rank after the pick.
export const PERKS = [
  { id: 'knock', zh: '重擊', desc: (r) => `擊退力 +${15 * r}%`, max: 3 },
  { id: 'steady', zh: '穩定射擊', desc: (r) => `散布 -${8 * r}%`, max: 3 },
  { id: 'leech', zh: '嗜血', desc: (r) => `擊殺回復 ${2 * r} 生命（爆頭 ×2）`, max: 3 },
  { id: 'bounty', zh: '賞金獵人', desc: (r) => `擊殺金錢 +${10 * r}%`, max: 3 },
  { id: 'scavenge', zh: '戰場回收', desc: (r) => `擊殺時 ${r} 發子彈直接入膛`, max: 3 },
  { id: 'adrenaline', zh: '腎上腺素', desc: (r) => `擊殺後 2.5 秒移速 +${6 * r}%`, max: 3 },
  { id: 'grit', zh: '堅毅', desc: (r) => `倒地時間 +${5 * r} 秒・被救起多 ${15 * r} 生命`, max: 3 },
  { id: 'medic', zh: '戰地急救', desc: (r) => `回合結束回復 ${15 * r} 生命與護甲`, max: 3 },
];
export const PERK_CASH = { id: 'cash', zh: '戰場津貼', desc: () => `立即獲得 $${PERK_CASH.money}`, max: Infinity, money: 400 };
export const PERK = Object.fromEntries([...PERKS, PERK_CASH].map((p) => [p.id, p]));
