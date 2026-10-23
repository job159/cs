// Weapon definitions (realistic standard-issue arsenal). Special / premium weapons extend these in
// game/src/weapons/specials/*.js and register through registerWeapon(). Which ones this build offers: WIP / listed()
// at the end of the file.
//
// Units: damage per bullet vs a wave-1 zombie with 150 HP (head x4.5 => rifles one-tap heads);
// rpm rounds/min; spread degrees (cone half-angle); recoil degrees per shot; speed = move speed m/s.
//   spread: [hip, ads, move (added at full speed), air, perShot bloom, max bloom, bloom recovery /s]
//   recoil: { up, side, upMax, recover (deg/s), first (first-shot multiplier), pattern (yaw bias per shot, -1..1 cycle) }
//   kick:   viewmodel kick { back (m), up (deg), side, roll }
//   knock:  knockback impulse given to zombies (m/s, before resistance), stagger: flinch strength 0..1
export const CATS = {
  pistol: { zh: '手槍', slot: 2 }, smg: { zh: '衝鋒槍', slot: 1 }, rifle: { zh: '步槍', slot: 1 },
  shotgun: { zh: '霰彈槍', slot: 1 }, mg: { zh: '機槍', slot: 1 }, sniper: { zh: '狙擊槍', slot: 1 },
  heavy: { zh: '重型', slot: 1 }, melee: { zh: '近戰', slot: 3 }, grenade: { zh: '投擲物', slot: 4 },
};

const W = [];
function def(o) { W.push(o); return o; }

// ---------------------------------------------------------------- pistols
def({ id: 'glock', zh: '守夜人', en: 'Nightwatch-9', cat: 'pistol', price: 200, dmg: 22, head: 4, rpm: 400, mode: 'semi', alt: 'burst', burst: 3, burstRpm: 1100,
  mag: 20, reserve: 120, reload: 1.6, reloadEmpty: 1.9, pen: 0.4, range: [18, 45, 0.6], speed: 5.4, knock: 0.6, stagger: 0.15,
  spread: [1.0, 0.25, 1.2, 4, 0.55, 3.5, 7], recoil: { up: 1.6, side: 0.5, upMax: 9, recover: 22, first: 1 }, kick: { back: 0.035, up: 6, side: 1.2, roll: 2 },
  sound: 'pistol', shell: '9mm', flash: 'pistol', tracer: 0 });
def({ id: 'deagle', zh: '沙隼', en: 'Sandhawk .50', cat: 'pistol', price: 650, dmg: 78, head: 4, rpm: 220, mode: 'semi',
  mag: 7, reserve: 35, reload: 2.0, reloadEmpty: 2.3, pen: 1.2, range: [25, 60, 0.7], speed: 5.2, knock: 3.2, stagger: 0.7,
  spread: [0.9, 0.15, 2.5, 6, 2.6, 6, 6], recoil: { up: 7.5, side: 1.4, upMax: 18, recover: 20, first: 1 }, kick: { back: 0.08, up: 18, side: 3, roll: 6 },
  sound: 'magnum', shell: '50', flash: 'magnum', tracer: 1 });
def({ id: 'usp', zh: '執法者', en: 'Warden .45', cat: 'pistol', price: 300, dmg: 34, head: 4, rpm: 350, mode: 'semi',
  mag: 12, reserve: 72, reload: 1.7, reloadEmpty: 2.0, pen: 0.6, range: [20, 50, 0.65], speed: 5.4, knock: 1.0, stagger: 0.25,
  spread: [0.8, 0.2, 1.2, 4, 0.8, 3.5, 7], recoil: { up: 2.4, side: 0.6, upMax: 10, recover: 22, first: 1 }, kick: { back: 0.045, up: 8, side: 1.5, roll: 2.5 },
  sound: 'pistol45', shell: '45', flash: 'pistol', tracer: 0 });
def({ id: 'revolver', zh: '蝮蛇', en: 'Viper .44', cat: 'pistol', price: 800, dmg: 92, head: 4, rpm: 160, mode: 'semi',
  mag: 6, reserve: 36, reload: 2.8, reloadEmpty: 2.8, pen: 1.5, range: [25, 70, 0.75], speed: 5.2, knock: 4.0, stagger: 0.8,
  spread: [0.7, 0.1, 2.5, 6, 2.8, 6, 6], recoil: { up: 8.5, side: 1.2, upMax: 20, recover: 18, first: 1 }, kick: { back: 0.09, up: 22, side: 3, roll: 7 },
  sound: 'magnum', shell: null, flash: 'magnum', tracer: 1 });

// ---------------------------------------------------------------- SMGs
def({ id: 'mp5', zh: '黃蜂', en: 'Hornet-9', cat: 'smg', price: 1500, dmg: 24, head: 3.5, rpm: 800, mode: 'auto',
  mag: 30, reserve: 180, reload: 2.2, reloadEmpty: 2.7, pen: 0.4, range: [15, 40, 0.6], speed: 5.3, knock: 0.5, stagger: 0.12,
  spread: [1.8, 0.35, 1.0, 5, 0.28, 3.2, 9], recoil: { up: 0.75, side: 0.45, upMax: 7, recover: 16, first: 1.3, pattern: [0, 0.2, -0.3, 0.4, -0.2] }, kick: { back: 0.018, up: 2.4, side: 0.9, roll: 1.4 },
  sound: 'smg9', shell: '9mm', flash: 'smg', tracer: 3 });
def({ id: 'vector', zh: '毒刺', en: 'Stinger-45', cat: 'smg', price: 2100, dmg: 26, head: 3.5, rpm: 1100, mode: 'auto',
  mag: 25, reserve: 150, reload: 2.0, reloadEmpty: 2.4, pen: 0.5, range: [12, 35, 0.55], speed: 5.3, knock: 0.6, stagger: 0.14,
  spread: [1.9, 0.4, 1.0, 5, 0.22, 3.2, 10], recoil: { up: 0.55, side: 0.35, upMax: 6, recover: 18, first: 1.2, pattern: [0, -0.2, 0.3, -0.4, 0.2] }, kick: { back: 0.014, up: 1.8, side: 0.7, roll: 1.2 },
  sound: 'smg45', shell: '45', flash: 'smg', tracer: 3 });
def({ id: 'uzi', zh: '鐵鼠', en: 'Rattler-9', cat: 'smg', price: 1200, dmg: 22, head: 3.5, rpm: 950, mode: 'auto',
  mag: 32, reserve: 192, reload: 2.1, reloadEmpty: 2.5, pen: 0.35, range: [12, 32, 0.55], speed: 5.4, knock: 0.45, stagger: 0.1,
  spread: [2.2, 0.55, 1.0, 5, 0.3, 3.8, 9], recoil: { up: 0.7, side: 0.6, upMax: 7, recover: 16, first: 1.2, pattern: [0.2, -0.3, 0.4, -0.4] }, kick: { back: 0.016, up: 2.2, side: 1.2, roll: 1.6 },
  sound: 'smg9', shell: '9mm', flash: 'smg', tracer: 3 });
def({ id: 'ump', zh: '獵犬', en: 'Hound-45', cat: 'smg', price: 1700, dmg: 30, head: 3.5, rpm: 650, mode: 'auto',
  mag: 25, reserve: 150, reload: 2.3, reloadEmpty: 2.8, pen: 0.55, range: [16, 42, 0.62], speed: 5.3, knock: 0.7, stagger: 0.16,
  spread: [1.7, 0.32, 1.0, 5, 0.3, 3.2, 9], recoil: { up: 0.9, side: 0.4, upMax: 7.5, recover: 16, first: 1.3, pattern: [0, 0.3, -0.2, 0.3] }, kick: { back: 0.02, up: 2.6, side: 0.9, roll: 1.4 },
  sound: 'smg45', shell: '45', flash: 'smg', tracer: 3 });

// ---------------------------------------------------------------- rifles
def({ id: 'akm', zh: '草原', en: 'Steppe-47', cat: 'rifle', price: 2700, dmg: 38, head: 4.5, rpm: 600, mode: 'auto',
  mag: 30, reserve: 180, reload: 2.4, reloadEmpty: 3.0, pen: 1.4, range: [30, 80, 0.75], speed: 4.9, knock: 1.4, stagger: 0.32,
  spread: [1.6, 0.18, 1.8, 6, 0.42, 4.2, 7], recoil: { up: 1.35, side: 0.65, upMax: 11, recover: 13, first: 1.4, pattern: [0, 0.1, 0.4, 0.6, -0.4, -0.7, -0.3, 0.5, 0.8, -0.6] }, kick: { back: 0.03, up: 4, side: 1.4, roll: 2.2 },
  sound: 'rifle762', shell: '762', flash: 'rifle', tracer: 3 });
def({ id: 'm4', zh: '哨兵', en: 'Sentry-4', cat: 'rifle', price: 3100, dmg: 33, head: 4.5, rpm: 700, mode: 'auto',
  mag: 30, reserve: 180, reload: 2.2, reloadEmpty: 2.8, pen: 1.2, range: [30, 80, 0.75], speed: 5.0, knock: 1.1, stagger: 0.25,
  spread: [1.4, 0.12, 1.6, 6, 0.32, 3.4, 8], recoil: { up: 0.95, side: 0.45, upMax: 9, recover: 14, first: 1.3, pattern: [0, 0.2, -0.2, 0.4, -0.3, 0.3, -0.5] }, kick: { back: 0.024, up: 3, side: 1, roll: 1.6 },
  sound: 'rifle556', shell: '556', flash: 'rifle', tracer: 3 });
def({ id: 'scar', zh: '獵隼', en: 'Falcon-L', cat: 'rifle', price: 3300, dmg: 35, head: 4.5, rpm: 650, mode: 'auto',
  mag: 30, reserve: 180, reload: 2.3, reloadEmpty: 2.9, pen: 1.3, range: [32, 85, 0.75], speed: 5.0, knock: 1.2, stagger: 0.27,
  spread: [1.4, 0.12, 1.6, 6, 0.33, 3.5, 8], recoil: { up: 1.0, side: 0.5, upMax: 9.5, recover: 14, first: 1.3, pattern: [0, -0.2, 0.3, -0.4, 0.3] }, kick: { back: 0.026, up: 3.2, side: 1, roll: 1.8 },
  sound: 'rifle556', shell: '556', flash: 'rifle', tracer: 3 });
def({ id: 'aug', zh: '鷲眼', en: 'Aquila AUG', cat: 'rifle', price: 3500, dmg: 34, head: 4.5, rpm: 680, mode: 'auto',
  mag: 30, reserve: 180, reload: 2.6, reloadEmpty: 3.2, pen: 1.3, range: [40, 100, 0.8], speed: 4.9, knock: 1.1, stagger: 0.25,
  spread: [1.4, 0.06, 1.6, 6, 0.3, 3.3, 8], recoil: { up: 0.9, side: 0.4, upMax: 9, recover: 14, first: 1.3, pattern: [0, 0.2, -0.3, 0.3] }, kick: { back: 0.022, up: 2.8, side: 0.9, roll: 1.4 },
  ads: { zoom: 1.8 }, sound: 'rifle556', shell: '556', flash: 'rifle', tracer: 3 });

// ---------------------------------------------------------------- shotguns (dmg per pellet)
def({ id: 'm870', zh: '破門', en: 'Breacher-12', cat: 'shotgun', price: 1700, dmg: 24, head: 2, pellets: 9, rpm: 70, mode: 'pump',
  mag: 8, reserve: 48, reload: 0.55, reloadStart: 0.35, reloadEnd: 0.5, pen: 0.3, range: [8, 24, 0.3], speed: 5.0, knock: 5.5, stagger: 0.9,
  spread: [5.0, 4.0, 1.0, 2, 0, 5, 10], recoil: { up: 6, side: 1.5, upMax: 14, recover: 12, first: 1 }, kick: { back: 0.08, up: 12, side: 2.5, roll: 5 },
  sound: 'shotgun', shell: '12g', flash: 'shotgun', tracer: 0 });
def({ id: 'usas', zh: '暴雨', en: 'Squall-20', cat: 'shotgun', price: 3600, dmg: 18, head: 2, pellets: 8, rpm: 300, mode: 'auto',
  mag: 20, reserve: 60, reload: 3.0, reloadEmpty: 3.5, pen: 0.3, range: [7, 20, 0.3], speed: 4.8, knock: 3.2, stagger: 0.7,
  spread: [5.5, 4.5, 1.0, 2, 0.4, 7, 10], recoil: { up: 3.2, side: 1.4, upMax: 16, recover: 12, first: 1, pattern: [0, 0.5, -0.6, 0.4] }, kick: { back: 0.05, up: 7, side: 2.2, roll: 3.5 },
  sound: 'shotgunAuto', shell: '12g', flash: 'shotgun', tracer: 0 });
def({ id: 'db', zh: '雙雷', en: 'Twin Thunder', cat: 'shotgun', price: 1400, dmg: 30, head: 2, pellets: 10, rpm: 400, mode: 'semi',
  mag: 2, reserve: 40, reload: 2.2, reloadEmpty: 2.2, pen: 0.3, range: [9, 26, 0.3], speed: 5.1, knock: 7, stagger: 1,
  spread: [5.2, 4.2, 1.0, 2, 0, 5.2, 10], recoil: { up: 8, side: 2, upMax: 16, recover: 12, first: 1 }, kick: { back: 0.09, up: 15, side: 3, roll: 6 },
  sound: 'shotgunHeavy', shell: '12g', flash: 'shotgun', tracer: 0 });

// ---------------------------------------------------------------- machine guns
def({ id: 'm249', zh: '堡壘', en: 'Bulwark-249', cat: 'mg', price: 5200, dmg: 32, head: 4, rpm: 750, mode: 'auto',
  mag: 100, reserve: 300, reload: 4.6, reloadEmpty: 4.6, pen: 1.2, range: [30, 80, 0.7], speed: 4.4, knock: 1.1, stagger: 0.25,
  spread: [2.2, 0.6, 2.0, 6, 0.2, 4.2, 6], recoil: { up: 0.75, side: 0.6, upMax: 8, recover: 12, first: 1.3, pattern: [0, 0.4, -0.5, 0.3, -0.3] }, kick: { back: 0.022, up: 2.4, side: 1.2, roll: 1.6 },
  sound: 'mg556', shell: '556', flash: 'mg', tracer: 2 });
def({ id: 'mg42', zh: '鋸鳴', en: 'Buzzsaw-42', cat: 'mg', price: 5800, dmg: 36, head: 4, rpm: 1150, mode: 'auto',
  mag: 150, reserve: 300, reload: 5.0, reloadEmpty: 5.0, pen: 1.5, range: [35, 90, 0.7], speed: 4.2, knock: 1.3, stagger: 0.3,
  spread: [2.6, 0.8, 2.0, 6, 0.18, 4.8, 6], recoil: { up: 0.85, side: 0.8, upMax: 9, recover: 12, first: 1.3, pattern: [0.3, -0.5, 0.6, -0.4] }, kick: { back: 0.02, up: 2.2, side: 1.5, roll: 1.8 },
  sound: 'mg762', shell: '792', flash: 'mg', tracer: 2 });
def({ id: 'm134', zh: '旋風', en: 'Cyclone-134', cat: 'mg', price: 8800, dmg: 28, head: 3.5, rpm: 2400, mode: 'auto', spinUp: 0.55,
  mag: 400, reserve: 400, reload: 5.5, reloadEmpty: 5.5, pen: 1.2, range: [30, 70, 0.65], speed: 3.8, knock: 0.9, stagger: 0.25,
  spread: [3.2, 2.2, 1.0, 4, 0.05, 4.2, 6], recoil: { up: 0.22, side: 0.35, upMax: 5, recover: 10, first: 1 }, kick: { back: 0.008, up: 0.8, side: 0.8, roll: 0.8 },
  sound: 'minigun', shell: '762', flash: 'mg', tracer: 2 });

// ---------------------------------------------------------------- snipers
def({ id: 'awp', zh: '長弓', en: 'Longbow-338', cat: 'sniper', price: 4750, dmg: 260, head: 4, rpm: 41, mode: 'bolt', boltTime: 1.25,
  mag: 10, reserve: 30, reload: 3.4, reloadEmpty: 3.7, pen: 4, range: [100, 300, 0.9], speed: 4.4, knock: 6, stagger: 1,
  spread: [6, 0.0, 6, 12, 0, 6, 10], recoil: { up: 6, side: 1, upMax: 12, recover: 10, first: 1 }, kick: { back: 0.1, up: 16, side: 2, roll: 5 },
  ads: { zoom: 4, scope: 'sniper' }, sound: 'sniper338', shell: '338', flash: 'sniper', tracer: 1 });
def({ id: 'barrett', zh: '重錘', en: 'Anvil-50', cat: 'sniper', price: 6200, dmg: 320, head: 3.5, rpm: 90, mode: 'semi',
  mag: 10, reserve: 30, reload: 3.8, reloadEmpty: 4.2, pen: 6, range: [120, 400, 0.9], speed: 4.0, knock: 8, stagger: 1,
  spread: [6, 0.0, 6, 12, 1.5, 6, 8], recoil: { up: 9, side: 1.5, upMax: 18, recover: 9, first: 1 }, kick: { back: 0.12, up: 18, side: 2.5, roll: 6 },
  ads: { zoom: 5, scope: 'sniper' }, sound: 'sniper50', shell: '50', flash: 'sniper', tracer: 1 });
def({ id: 'kar98', zh: '獵人', en: 'Hunter-98', cat: 'sniper', price: 2200, dmg: 210, head: 4, rpm: 50, mode: 'bolt', boltTime: 1.0,
  mag: 5, reserve: 30, reload: 0.5, reloadStart: 0.4, reloadEnd: 0.5, reloadStyle: 'shell', pen: 3, range: [80, 250, 0.85], speed: 4.8, knock: 5, stagger: 1,
  spread: [3.5, 0.1, 4, 10, 0, 4, 10], recoil: { up: 5.5, side: 1, upMax: 12, recover: 10, first: 1 }, kick: { back: 0.09, up: 14, side: 2, roll: 5 },
  ads: { zoom: 1.6 }, sound: 'rifleBolt', shell: '792', flash: 'rifle', tracer: 1 });

// ---------------------------------------------------------------- heavy
def({ id: 'rpg', zh: '火鳥', en: 'Firebird-7', cat: 'heavy', price: 6000, dmg: 600, head: 1, rpm: 30, mode: 'semi', projectile: 'rocket', splash: 6.5,
  mag: 1, reserve: 6, reload: 2.8, reloadEmpty: 2.8, pen: 0, range: [999, 999, 1], speed: 4.1, knock: 12, stagger: 1,
  spread: [1.2, 0.3, 2, 6, 0, 1.2, 10], recoil: { up: 5, side: 1, upMax: 10, recover: 8, first: 1 }, kick: { back: 0.1, up: 8, side: 2, roll: 3 },
  sound: 'rocket', shell: null, flash: 'rocket', tracer: 0 });

// ---------------------------------------------------------------- 反災 premium series (docs/PREMIUM_WEAPONS.md §2.0.4, Appendix A)
// `special` = mechanics (specials.js), `premium` = look and presentation. 雙相-R: the Sentry-4 rebuilt round a
// dual-ring gimbal reactor; 60 hits (headshot 2) charge the phase, ★ / Q starts 14 s of 過相 Overphase (+30 % rpm,
// every round splits into 3 cyan / amber light rounds at 0.55 damage each, no ammo used). Base DPS = the M4's.
def({ id: 'dualphase_r', zh: '雙相-R', en: 'Dual-Phase R', cat: 'rifle', tier: 'anti', line: 'antical', price: 4200, wear: 0.35, dmg: 33, head: 4.5, rpm: 700, mode: 'auto',
  mag: 30, reserve: 180, reload: 2.2, reloadEmpty: 2.8, pen: 1.2, range: [30, 80, 0.75], speed: 4.95, knock: 1.15, stagger: 0.26,
  spread: [1.4, 0.12, 1.6, 6, 0.32, 3.4, 8], recoil: { up: 0.95, side: 0.45, upMax: 9, recover: 14, first: 1.3, pattern: [0, 0.2, -0.2, 0.4, -0.3, 0.3, -0.5] }, kick: { back: 0.024, up: 3, side: 1, roll: 1.6 },
  sound: 'rifle556', shell: '556', flash: 'rifle', tracer: 3,
  special: { type: 'overphase', hits: 60, duration: 14, rpmMul: 1.3, split: 3, dmgMul: 0.55, tracer: [[1.2, 5.6, 8], [8, 4.2, 1.1]], flashScale: 0.55,
    hint: { tap: { zh: '過相', desc: '14 秒：射速 +30%・分裂光彈・不耗彈' }, src: '命中 60（爆頭 ×2）' } },
  premium: {
    element: 'frost', palette: { base: '#1c1d1f', trim: '#d6d8db', core: '#6fe3ff', rim: '#ffb43a', mote: '#e8fbff', accent: '#ffb43a', twin: '#ff3fb4' },
    presets: { glow_ice: 'pv_energy', glow_gold: 'pv_energy', chrome: 'pv_metal' },
    pv: { pv_metal: { shine: 1.5, sweepT: 6 } },
    hero: 'fx_gimbal_a', crosshair: 'xh_phase', meters: ['ring'], idle: { charge: [0.12, 0.45] },
    ready: { sfx: 'ready_dualphase', layer: { breathMul: 1.3, jitterHz: 0.5, jitterDeg: 0.4, glowMul: 1.4 } },
    inspect: ['dualphase_inspect'], killMark: 'km_phase', dmgSkin: 'anti',
  } });

// ---------------------------------------------------------------- 神兵 九子 (docs/PREMIUM_WEAPONS.md M07, Appendix A)
// 螭吻．吞潮: a 7.62 battle rifle dressed as the roof-ridge 螭吻 (presentation + mechanics: weapons/premium/chiwen.js).
// 450 rpm x 46 (+20 splash within 1.5 m of the impact), 40-round water tank, unlimited reserve. A hit may mark
// 寒潮 (25 %, 10 s): the next hit on it bursts (80 in 2 m, +4 % tide); kills +4 % tide and 30 % loose a homing
// water bead (60). ◎ held 冰流光束 (20 % tide), ★ tap 潮球 (15 %), ★ held 吞潮 (ultimate, ~4,000 damage dealt);
// both skills shove back what stands within 3 m (水幕反衝). Teammates near the ice line / orb reload 20 % faster.
// hidden: playable through ?w=chiwen, kept out of the shop / armory / bots until the refine stage releases it (delete `hidden`)
def({ id: 'chiwen', zh: '螭吻．吞潮', en: 'Chiwen Tidewarden', cat: 'rifle', tier: 'mythic', line: 'jiuzi', element: ['frost', 'jade'], model: 'chiwen',
  price: 6800, hidden: true, wear: 0.2, dmg: 46, head: 4, rpm: 450, mode: 'auto', mag: 40, reserve: Infinity, reload: 2.3, reloadEmpty: 2.7, pen: 1.5,
  range: [35, 90, 0.75], speed: 4.8, knock: 1.6, stagger: 0.34, splash: { r: 1.5, dmg: 20 }, assist: 1.2,
  spread: [1.5, 0.12, 1.7, 6, 0.4, 3.8, 7.5], recoil: { up: 1.25, side: 0.5, upMax: 10, recover: 13, first: 1.3, pattern: [0, 0.2, -0.25, 0.35, -0.3, 0.4, -0.4] },
  kick: { back: 0.034, up: 4.2, side: 1.3, roll: 2.1 }, sound: 'rifle762', shell: '762', flash: 'rifle', tracer: 3,
  // the gun's own fireball stays small: the ice crown + water mist (premium/chiwen.js crown()) is the muzzle look;
  // 潮彈 每發拖一條細白尾 (a thin white water trail on every round)
  fx: { ramp: 3, flashScale: 0.45, tracer: { color: [3.6, 5.4, 6.6], glow: [0.45, 1.1, 1.9], width: 0.011, length: 2.4 }, tracerEvery: 1 },
  premium: {
    element: ['frost', 'jade'],
    palette: { base: '#e8f4ff', trim: '#b9c7d6', core: '#6fe3ff', rim: '#2f8bff', mote: '#ffffff', accent: '#2f8f4e', crackle: '#7d8884', twin: '#ff5a1f' },
    presets: { glow_ice: 'pv_energy', glaze_cobalt: 'pv_glaze', porcelain: 'pv_glaze', glaze_jade: 'pv_glaze', lacquer_red: 'pv_glaze', crystal: 'pv_crystal', gold: 'pv_metal', chrome: 'pv_metal' },
    // 開片 crackle: one colour per glaze (only the lines read), faint cool sheen. 金絲鐵線: "iron wire" cells of ~6.5 mm
    // (150 /m, 0.18 mm lines, low contrast: a surface read, the sculpt carries the detail) with a 2.6x finer amber
    // "gold thread" crackle between them (premium.js mono path); each glaze has its own grout (dark blue on cobalt)
    pv: { pv_glaze: { shardScale: 150, groutW: 0.17, grout: '#7d8884', irid: 0.12, iridCool: 1, shine: 1.1, sweepT: 5 }, pv_metal: { shine: 1.6, sweepT: 5 }, pv_energy: { veinFreq: 14 } },
    pvKey: { porcelain: { shardPal: ['#dde5ea', '#dde5ea', '#dde5ea', '#dde5ea'] }, glaze_cobalt: { shardPal: ['#1d3c8f', '#1d3c8f', '#1d3c8f', '#1d3c8f'], grout: '#122660' },
      glaze_jade: { shardPal: ['#2f8f4e', '#2f8f4e', '#2f8f4e', '#2f8f4e'], irid: 0.06, grout: '#1c4a2e' }, lacquer_red: { shardScale: 0, irid: 0 } },
    hero: 'fx_tube', crosshair: 'xh_wave', meters: ['arc', 'ring', 'stack'],
    ready: { sfx: 'ready_chiwen', layer: { breathMul: 1.4, jitterHz: 0.5, jitterDeg: 0.6, glowMul: 1.5, idleExtra: 'chiwen_shiver' } },
    idleLayers: [null, { breathMul: 1.15, jitterHz: 0.4, jitterDeg: 0.2, glowMul: 1.15, idleExtra: 'chiwen_flick', every: 7 }],   // §1.17 idle tiers
    firstDraw: 'chiwen_first', inspect: ['chiwen_inspect'], rareInspect: 'chiwen_bubble_mirror', rareReload: 'chiwen_vortex',
    killFx: 'KE_FROST', killMark: 'km_chiwen', dmgSkin: 'mythic',
    crisis: { name: '螭吻護甲', kind: 'knock', r: 6, fx: 'chiwen_crisis' },
    aura: { type: 'reloadSpeed', mul: 1.2, radius: 4, when: 'source', source: ['iceLine', 'orb'] },
    twin: 'chiwen_searing', phases: ['shuangchao', 'cuichao', 'mochao'], kiln: { chance: 0.01, special: 'jun_kiln' },
    showcase: ['chiwen_first', 'fire:3', 'tap', 'alt', 'ult', 'chiwen_inspect'],
    // desktop controls for the hint card / help (the ★ dock reads special.skills)
    hints: [
      { key: 'LMB', zh: '潮彈', desc: '全自動・命中 1.5 m 濺射・25% 掛寒潮，再中引爆' }, { key: 'RMB', zh: '冰流光束', desc: '潮能 20%・按住 2.5 秒・貫穿 3・留冰刺' },
      { key: 'Q', zh: '潮球', desc: '潮能 15%・水球 3 次脈衝往中心拉' }, { key: 'hold Q', zh: '吞潮', desc: '吞潮 100%（或 Q 再按 F）' },
      { key: 'R', zh: '換彈' }, { key: 'F', zh: '檢視', desc: '按住循環' },
    ],
  },
  special: {
    type: 'chiwen',
    meters: {
      tide: { max: 100, start: 40, onKill: 4, onDetonate: 4, hud: 'arc', label: '潮能', src: '擊殺／引爆寒潮 +4%' },
      ult: { max: 100, source: 'damage', per: 4000, skillFill: false, hud: 'ring', label: '吞潮', src: '傷害累積（約 50 秒）' },
      marks: { max: 5, hud: 'stack', label: '寒潮', color: '#bfe9ff', src: '命中 25% 掛寒潮' },   // live marks (display only)
    },
    skills: {
      // key: desktop binding (◎ = right mouse, ★ = Q; the HUD dock / hint card read the live bindings)
      alt: { id: 'frostRay', key: 'RMB', zh: '冰流光束', desc: '按住 2.5 秒・每秒 280・貫穿 3・冰刺緩速', meter: 'tide', hold: true, cost: 20, dps: 280, dur: 2.5, pierce: 3, level: 'L4',
        overlay: { fx: 'TUNNEL', look: 'wave_pipe' } },
      tap: { id: 'tideOrb', key: 'Q', zh: '潮球', desc: '慢速水球・3 次脈衝 120・往中心拉', meter: 'tide', cost: 15, pulses: 3, every: 0.6, r: 3, dmg: 120, pull: 1, speed: 6, range: 12, level: 'L2' },
      ult: { id: 'swallowTide', key: 'hold Q', zh: '吞潮', desc: '螭吻破地吞噬 500・吐出 3 道水柱各 400', meter: 'ult', script: 'chiwen_ult', level: 'L3' },
    },
    passive: { mark: { chance: 0.25, dur: 10, burst: 80, r: 2 }, barrier: { r: 3, knock: 4, dmg: 40 }, orb: { chance: 0.3, dmg: 60 } },
  } });

// ---------------------------------------------------------------- 神兵 光暗雙生 M03 (docs/PREMIUM_WEAPONS.md M03, §2.26, Appendix A)
// 畢方．焚翼 / 鬼車．晦翼 (presentation + mechanics: weapons/premium/bifang.js): an AA-12-pattern scatter cannon built
// as the one-legged crane. 8 feather light-pellets x 18 at 180 rpm (every hit stacks 灼羽: ≤ 5 x 8/s for 3 s), 50-cell
// feather magazine, unlimited reserve. 羽能 (+0.6 % a hit, not while spread): ◎ 焚翼 (≥ 40 %, 10 %/s, 6 s or ◎ again:
// 3 m burn 40/s, immune to slow / root / grab, +10 % speed, teammates within 4 m cleansed; folding after ≥ 40 % spent
// fires 焚天光 600 + 120/s for 1.2 s, 30 m x 1.4 m, piercing); ★ tap 羽落 (25 %): 12 burning feathers in 6 m, 60 + 2
// stacks each; ★ held 畢方降臨 (天火 from damage, ~50 s): one wing beat 300 + knock in a 10 m cone, a 25 m dive leaving
// a 4 s fire path (30/s). The twin keeps the numbers; names, colours, audio (-4 st + echo), a sky-falling beam and its
// own ultimate signature (九首夜啼: fear 1.5 s within 10 m) differ.
// hidden: built and playable through ?w=bifang / ?w=guiche, kept out of the shop / armory / bots until the refine
// stage releases it (delete `hidden`)
const PYRE = { cat: 'heavy', tier: 'mythic', line: 'twin', price: 9500, hidden: true, wear: 0.15, dmg: 18, head: 2, pellets: 8, rpm: 180, mode: 'auto',
  mag: 50, reserve: Infinity, reload: 2.8, reloadEmpty: 2.8, draw: 0.7, pen: 0.3, range: [12, 30, 0.35], speed: 4.6, knock: 2.2, stagger: 0.45,
  spread: [4.4, 3.4, 1.0, 2, 0.3, 5.4, 10], recoil: { up: 3.0, side: 1.0, upMax: 12, recover: 14, first: 1, pattern: [0, 0.4, -0.5, 0.3] },
  kick: { back: 0.045, up: 6, side: 1.4, roll: 2.2 }, sound: 'shotgunAuto', shell: null, flash: 'shotgun', tracer: 0,
  vm: { hip: [0.15, -0.215, -0.36, 1, -5, -2.5] } };   // the tall crane receiver sits lower / further than the heavy default
const PYRE_SPECIAL = (look, zh) => ({
  type: 'bifang', look,
  meters: {
    feather: { max: 100, start: 40, onHit: 0.6, hud: 'arc', label: zh.feather, src: '命中 +0.6%（展翼時不回充）' },
    ult: { max: 100, source: 'damage', per: 9000, skillFill: false, hud: 'ring', label: zh.ultMeter, src: '傷害累積（約 50 秒）' },
  },
  skills: {
    // key: desktop binding (◎ = right mouse, ★ = Q; the HUD dock / hint card read the live bindings)
    alt: { id: 'pyrewing', key: 'RMB', zh: zh.alt, desc: zh.altDesc, meter: 'feather', cost: 40, drain: 10, dur: 6, r: 3, dps: 40, speedMul: 1.1, beamMin: 40, level: 'L2' },
    tap: { id: 'featherfall', key: 'Q', zh: zh.tap, desc: '準星處 6 m 落下 12 根燃燒羽柱・各 60＋灼羽 2 層', meter: 'feather', cost: 25, n: 12, r: 6, dmg: 60, burn: 2, fall: 1.2, range: 30, level: 'L2' },
    ult: { id: 'bifang_descent', key: 'hold Q', zh: zh.ult, desc: zh.ultDesc, meter: 'ult', range: 25, level: 'L3' },
  },
  burn: { max: 5, dps: 8, dur: 3 },                                   // 灼羽 stacks
  beam: { len: 30, width: 1.4, dmg: 600, dps: 120, dur: 1.2 },        // 焚天光 / 晦天墜
  flap: { r: 10, cone: 60, dmg: 300, burn: 3, knock: 9 }, dive: { len: 25, dps: 30, life: 4, width: 2.6 },
  cleanse: { r: 4, every: 6 },                                        // 解縛 team aura while the wings are spread
});
// desktop controls for the hint card / help (premium.hints; the ★ dock reads special.skills)
const PYRE_HINTS = (n) => [
  { key: 'LMB', zh: n.fire, desc: '8 枚羽彈・每中一枚疊灼羽' }, { key: 'RMB', zh: n.alt, desc: `${n.feather} ≥40% 展翼；再按 RMB 收翼，這次耗 ≥40% 就放${n.beam}` },
  { key: 'Q', zh: n.tap, desc: `${n.feather} 25%` }, { key: 'hold Q', zh: n.ult, desc: `${n.ultMeter} 100%（或 Q 再按 F）` },
  { key: 'R', zh: '換彈' }, { key: 'F', zh: '檢視', desc: '按住循環' },
];
def({ ...PYRE, id: 'bifang', zh: '畢方．焚翼', en: 'Bifang Pyrewing', element: ['radiant', 'inferno'], model: 'bifang',
  fx: { flashScale: 0.62, ramp: 7, tracerEvery: 0 },
  premium: {
    element: ['radiant', 'inferno'], look: 'bifang',
    palette: { base: '#f3efe6', trim: '#e3b04b', core: '#fff2b0', rim: '#ffc74a', mote: '#fffbe0', accent: ['#6ec8ff'], twin: '#b54bff', feather: ['#1fb5a8', '#ff5a2a'] },
    shard: ['#1f8f8a', '#c8302a', '#f3efe6', '#1f8f8a'],                // cloisonné cells: 青釉 朱釉 白瓷 青釉, gold wire
    presets: { porcelain: 'pv_glaze', lacquer_red: 'pv_glaze', glaze_teal: 'pv_glaze', glaze_turquoise: 'pv_glaze', glaze_vermilion: 'pv_glaze', glaze_cobalt: 'pv_glaze', glaze_black: 'pv_glaze',
      gold: 'pv_metal', bronze_aged: 'pv_metal', glow_sun: 'pv_energy', glow_vermilion: 'pv_energy', crystal: 'pv_crystal', obsidian: 'pv_core' },
    pv: { pv_glaze: { shine: 1.5, sweepT: 5 }, pv_metal: { shine: 1.4, sweepT: 5 }, pv_energy: { veinFreq: 16, veinSpeed: 0.42 } },
    // 掐絲琺瑯 cloisonné is modelled (gold cloisons along the barbs, enamel recessed by row: glaze_teal / turquoise /
    // vermilion, white tips); the porcelain carries a fine 開片 crackle (one-colour SHARD: hairlines + gold threads)
    pvKey: { porcelain: { shardScale: 78, shardPal: ['#f3efe6', '#f3efe6', '#f3efe6', '#f3efe6'], grout: '#b4a68c', groutW: 0.12 } },
    hero: 'fx_pearl', crosshair: 'xh_feather', meters: ['arc', 'ring'],
    ready: { sfx: 'ready_bifang', layer: { breathMul: 1.4, jitterHz: 0.5, jitterDeg: 0.5, glowMul: 1.5, idleExtra: 'bifang_ready' } },
    idleLayers: [null, { breathMul: 1.15, jitterHz: 0.4, jitterDeg: 0.2, glowMul: 1.15 }],
    firstDraw: 'bifang_first', inspect: ['bifang_inspect'], rareInspect: 'bifang_inspect_rare', reload: 'bifang_reload', rareReload: 'bifang_reload_rare',
    killFx: 'KE_PLUME', killMark: 'km_bifang', dmgSkin: 'mythic',
    crisis: { name: '羽衣', kind: 'knock', fx: 'bifang_cocoon' },
    aura: { type: 'cleanse', radius: 4, when: 'skill', source: ['pyrewing'] },
    twin: 'guiche', phases: ['qingyu', 'chiyu'], kiln: { chance: 0.01, special: 'fengcai' },
    showcase: ['bifang_first', 'fire:3', 'alt', 'tap', 'ult', 'bifang_inspect'],
    hints: PYRE_HINTS({ fire: '焰羽散射', alt: '焚翼', tap: '羽落', ult: '畢方降臨', feather: '羽能', ultMeter: '天火', beam: '焚天光' }),
  },
  special: PYRE_SPECIAL('bifang', { feather: '羽能', ultMeter: '天火', alt: '焚翼', altDesc: '羽能 ≥40%・展翼 6 秒：灼燒、免控、收翼放焚天光',
    tap: '羽落', ult: '焚天', ultDesc: '畢方降臨：振翼 300＋擊退，俯衝 25 m 留下火徑' }) });
def({ ...PYRE, id: 'guiche', zh: '鬼車．晦翼', en: 'Guiche Gloomwing', element: ['void'], model: 'guiche',
  fx: { flashScale: 0.62, ramp: 5, tracerEvery: 0 },
  premium: {
    element: ['void'], look: 'guiche',
    palette: { base: '#121012', trim: '#9aa0a6', core: '#b54bff', rim: '#2a9f92', mote: '#d9b8ff', accent: ['#3fffe0'], twin: '#ffc74a', feather: ['#7a3cff', '#3fffe0'] },
    shard: ['#5b2b5e', '#1d3f4a', '#121012', '#5b2b5e'],                // 茄紫釉 墨青釉 黑漆, antique-silver wire
    presets: { lacquer_black: 'pv_glaze', glaze_aubergine: 'pv_glaze', glaze_inkteal: 'pv_glaze', glaze_coldteal: 'pv_glaze', glaze_black: 'pv_glaze',
      silver_aged: 'pv_metal', steel_bright: 'pv_metal', glow_purple: 'pv_energy', glow_vermilion: 'pv_energy', crystal: 'pv_crystal', obsidian: 'pv_core' },
    // black lacquer: a tight, dim cold-teal rim (少量 per the card) -- a broad one turns the whole gun teal at grazing angles
    pv: { pv_glaze: { shine: 1.7, sweepT: 5, rimPower: 6 }, pv_metal: { shine: 1.2, sweepT: 5, rimPower: 4.5 }, pv_energy: { veinFreq: 16, veinSpeed: 0.36 } },
    // modelled cloisonné in antique-silver wire; the black lacquer carries faint 斷紋 (aged-lacquer crackle, one-colour SHARD)
    pvKey: { lacquer_black: { shardScale: 55, shardPal: ['#141016', '#141016', '#141016', '#141016'], grout: '#3a2c40', groutW: 0.16 } },
    hero: 'fx_eye', crosshair: 'xh_feather', meters: ['arc', 'ring'],
    ready: { sfx: 'ready_guiche', layer: { breathMul: 1.4, jitterHz: 0.5, jitterDeg: 0.5, glowMul: 1.5, idleExtra: 'bifang_ready' } },
    idleLayers: [null, { breathMul: 1.15, jitterHz: 0.4, jitterDeg: 0.2, glowMul: 1.15 }],
    firstDraw: 'bifang_first', inspect: ['bifang_inspect'], rareInspect: 'bifang_inspect_rare', reload: 'bifang_reload', rareReload: 'bifang_reload_rare',
    killFx: 'KE_SOUL', killMark: 'km_guiche', dmgSkin: 'mythic',
    crisis: { name: '晦羽衣', kind: 'knock', fx: 'bifang_cocoon' },
    aura: { type: 'cleanse', radius: 4, when: 'skill', source: ['pyrewing'] },
    twin: 'bifang', phases: ['yeyu', 'shuangyu'],
    showcase: ['bifang_first', 'fire:3', 'alt', 'tap', 'ult', 'bifang_inspect'],
    hints: PYRE_HINTS({ fire: '晦羽散射', alt: '晦翼', tap: '晦羽落', ult: '鬼車夜啼', feather: '晦羽', ultMeter: '幽火', beam: '晦天墜' }),
  },
  special: PYRE_SPECIAL('guiche', { feather: '晦羽', ultMeter: '幽火', alt: '晦翼', altDesc: '晦羽 ≥40%・展翼 6 秒：灼燒、免控、收翼降晦天墜',
    tap: '晦羽落', ult: '夜啼', ultDesc: '九首鬼車盤旋夜啼：10 m 恐懼 1.5 秒，再俯衝 25 m' }) });

// ---------------------------------------------------------------- melee
def({ id: 'knife', zh: '戰術刀', en: 'Field Knife', cat: 'melee', price: 0, dmg: 55, head: 2, rpm: 140, mode: 'melee', heavy: { dmg: 140, time: 0.9, range: 2.0 },
  mag: 0, reserve: 0, range: [1.9, 1.9, 1], speed: 5.6, knock: 2.2, stagger: 0.5, spread: [0, 0, 0, 0, 0, 0, 0], recoil: { up: 0, side: 0, upMax: 0, recover: 10 },
  kick: { back: 0, up: 0, side: 0, roll: 0 }, sound: 'knife', shell: null, flash: null, tracer: 0 });

// ---------------------------------------------------------------- build roster
// Weapons this build does not offer yet stay registered (stats, specials, ?w=<id> for development) but carry
// `wip` = why, and listed() keeps them out of the shop, the armory, bot loadouts and any random pick. The full
// version enables a weapon by deleting it from WIP (and shipping its model).
//   premium  神兵 still in production (mechanics / presentation unfinished)
//   model    no first-person model yet (game/assets/weapons/<id>.glb): it would equip as an invisible gun
const WIP = {
  premium: [],
  model: ['scar', 'aug', 'm870', 'usas', 'db', 'm249', 'mg42', 'm134', 'awp', 'barrett', 'kar98', 'rpg', 'knife'],
};
for (const [why, ids] of Object.entries(WIP)) for (const id of ids) { const w = W.find((o) => o.id === id); if (w) w.wip = why; }

export const WEAPONS = Object.fromEntries(W.map((w) => [w.id, w]));
export function registerWeapon(w) { WEAPONS[w.id] = w; return w; }
export function slotOf(w) { return w.slot ?? CATS[w.cat]?.slot ?? 1; }
/** Offered in this build (shop, armory, bots, random picks); `wip` weapons only through ?w=<id>. */
export function isListed(w) { return !!w && !w.wip && !w.hidden; }
/** Listed weapons, optionally of one category, cheapest first. */
export function listed(cat) { return Object.values(WEAPONS).filter((w) => isListed(w) && (!cat || w.cat === cat)).sort((a, b) => a.price - b.price); }
/** Series tier for UI frames (ui/crosshairs.js TIERS): 'standard' for the plain arsenal. */
export function tierOf(w) { return w?.tier || (w?.special || w?.premium ? 'anti' : 'standard'); }
/** A premium weapon's signature skill as UI text { key: ★ / ◎, zh, desc, src }; null for standard issue. */
export function skillText(w) {
  const sp = w?.special;
  if (!sp) return null;
  const h = sp.hint || sp.skills || {};
  const slot = ['tap', 'alt', 'hold', 'ult'].find((k) => h[k]?.zh);
  if (!slot) return null;
  const src = sp.hint?.src || Object.values(sp.meters || {}).map((m) => m.src).filter(Boolean)[0] || '';
  return { key: slot === 'alt' ? '◎' : '★', zh: h[slot].zh, desc: h[slot].desc || '', src };
}
