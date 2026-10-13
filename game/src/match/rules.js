// Match tuning tables: difficulties, round compositions, economy and level-up perks.

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

export const ECONOMY = {
  startMoney: 1500, maxMoney: 32000, roundBonus: (r) => 800 + 200 * r, headshotMul: 1.5, assistMul: 0.35,
  ammoPrice: 0.12,   // fraction of the weapon price per magazine refill
  armorPrice: 650, helmetPrice: 350, kitPrice: 1000,
};

// XP: total needed to reach level L
export const xpFor = (level) => Math.round(90 * Math.pow(level - 1, 1.38));
export const MAX_LEVEL = 40;

export const PERKS = [
  { id: 'atk', zh: '攻擊強化', desc: '傷害 +8%', apply: (m) => { m.dmgMul += 0.08; } },
  { id: 'hp', zh: '生命強化', desc: '最大生命 +12', apply: (m, g) => { g.status.maxHp += 12; g.status.heal(12); } },
  { id: 'reload', zh: '快速裝填', desc: '換彈速度 +7%', apply: (m) => { m.reloadMul *= 0.93; } },
  { id: 'knock', zh: '擊退強化', desc: '擊退力 +12%', apply: (m) => { m.knockMul += 0.12; } },
  { id: 'speed', zh: '機動強化', desc: '移動速度 +3%', apply: (m) => { m.speedMul += 0.03; } },
];
