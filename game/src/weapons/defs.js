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
// Released (shop, armory, bots; ?w=chiwen as before).
def({ id: 'chiwen', zh: '螭吻．吞潮', en: 'Chiwen Tidewarden', cat: 'rifle', tier: 'mythic', line: 'jiuzi', element: ['frost', 'jade'], model: 'chiwen',
  price: 6800, wear: 0.2, dmg: 46, head: 4, rpm: 450, mode: 'auto', mag: 40, reserve: Infinity, reload: 2.3, reloadEmpty: 2.7, pen: 1.5,
  range: [35, 90, 0.75], speed: 4.8, knock: 1.6, stagger: 0.34, splash: { r: 1.5, dmg: 20 }, assist: 1.2,
  // a horde mythic: the rounds climb ~0.35° a shot to a 2.2° cap (a held, uncorrected spray walks from the chest to
  // the head of a walker at 10-15 m); the spec's 2.5° per-shot kick is camera punch (premium/chiwen.js onFire)
  spread: [0.85, 0.1, 1.4, 6, 0.14, 1.9, 9], recoil: { up: 0.35, side: 0.25, upMax: 2.2, recover: 18, first: 1, pattern: [0, 0.1, -0.12, 0.16, -0.16, 0.2, -0.2] },
  // first person: further out, lower and pitched up 4.5° so the fish-tail stock drops out of frame and the head, the
  // ridge and the water tube (lower left) rise into it (the head ends ~130 px under / right of the crosshair at 900p)
  vm: { hip: [0.155, -0.22, -0.42, 4.5, 2, -8] },
  // sound: its own battle-rifle set with the §1.12 crystal sparkle (tools/audio/producers/premium_chiwen.mjs)
  kick: { back: 0.034, up: 4.2, side: 1.3, roll: 2.1 }, sound: 'chiwen', shell: '762', flash: 'rifle', tracer: 3,
  // the gun's own fireball stays small: the ice crown + water mist (premium/chiwen.js crown()) is the muzzle look;
  // 潮彈 每發拖一條細白尾 (a thin white water trail on every round)
  fx: { ramp: 3, flashScale: 0.45, tracer: { color: [3.6, 5.4, 6.6], glow: [0.45, 1.1, 1.9], width: 0.011, length: 2.4 }, tracerEvery: 1 },
  premium: {
    element: ['frost', 'jade'],
    palette: { base: '#e8f4ff', trim: '#b9c7d6', core: '#6fe3ff', rim: '#2f8bff', mote: '#ffffff', accent: '#2f8f4e', crackle: '#7d8884', twin: '#ff5a1f' },
    presets: { glow_ice: 'pv_energy', glaze_cobalt: 'pv_glaze', porcelain: 'pv_glaze', glaze_jade: 'pv_glaze', lacquer_red: 'pv_glaze', crystal: 'pv_crystal', gold: 'pv_metal', chrome: 'pv_metal' },
    // 開片 crackle: one colour per glaze (only the lines read), faint cool sheen. 金絲鐵線: "iron wire" cells of ~4.5 mm
    // (230 /m, 0.14 mm lines, low contrast: a surface read, the sculpt carries the detail) with a 2.6x finer amber
    // "gold thread" crackle between them (premium.js mono path); each glaze has its own grout (dark blue on cobalt)
    // tight rim on the glazes: the stock is mostly seen at grazing angles, a broad blue rim washes the cobalt to lavender
    pv: { pv_glaze: { shardScale: 230, groutW: 0.14, grout: '#8d9894', irid: 0.12, iridCool: 1, shine: 1.1, sweepT: 5, rimPower: 5.5 }, pv_metal: { shine: 1.6, sweepT: 5 }, pv_energy: { veinFreq: 14 } },
    pvKey: { porcelain: { shardPal: ['#dde5ea', '#dde5ea', '#dde5ea', '#dde5ea'], irid: 0.05 }, glaze_cobalt: { shardPal: ['#1d3c8f', '#1d3c8f', '#1d3c8f', '#1d3c8f'], grout: '#122660', irid: 0.035 },
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

// ---------------------------------------------------------------- 神兵 九子 M08 (docs/PREMIUM_WEAPONS.md M08, Appendix A)
// 蒲牢．鐘吼: an 870-class pump gun dressed as 蒲牢, the bell-knob dragon that loves to roar (presentation + mechanics:
// weapons/premium/pulao.js, the summoned bells pulao_fx.js). 9 pellets x 26 at 75 rpm (DPS ~292, §2.27), 8-round tube
// loaded a shell at a time (0.5 s), unlimited reserve. A trigger pull that hits anything counts once: every 8 load a
// 鐘彈 bell shell (up to 3: the three little bells on the rack light up in turn; while one is loaded the pump ends in a
// wrist flick that rings them). ◎ / RMB 鐘彈: a bronze bell spirit drops 6 m onto the impact and tolls three times
// (4.5 m, 140 + knockback each), then two sound pillars toss what stands there 4 m up. ★ / Q 警世: one 8 m toll round
// the caster (every zombie staggers 0.8 s, elites / bosses outlined 5 s for the whole team; 20 s). Hold Q 百八鐘 (鐘吼,
// ~45 s of damage): a 6 m bell with 蒲牢 on its crown slams over the aim point (3 m trapped 2.4 s; it drags what stands
// within 10 m into its ring between tolls), tolls nine times faster and louder (7 m, 200 each), then bursts into cast
// bronze slabs and 32 shard rays (50 each). Crisis 金鐘罩: a bell drops over the player. Aura 鐘聲護體: every toll gives teammates in its reach 5 armour.
// Feel (a mythic pump gun, not a rifle): a fixed centre-weighted pattern (pelletRings: one pellet on the aim, four on a
// ring at 0.4 of the 2.6° cone, four staggered at 0.84) keeps a volley on one body inside 6 m, so a chest volley kills a
// walker there and a head volley lands 3-5 on the head; the camera rise settles before the next pump (recoil.pause
// 0.36 x 0.8 s, recover 20); the weight is in the viewmodel kick and the view punch, not a lingering camera offset.
def({ id: 'pulao', zh: '蒲牢．鐘吼', en: 'Pulao Bellroar', cat: 'shotgun', tier: 'mythic', line: 'jiuzi', element: ['lunar', 'storm'], model: 'pulao', tpModel: 'pulao_tp',
  price: 7200, wear: 0.2, dmg: 26, head: 2, pellets: 9, pelletRings: [[0.4, 4], [0.84, 4]], rpm: 75, mode: 'pump',
  mag: 8, reserve: Infinity, reload: 0.5, reloadStart: 0.36, reloadEnd: 0.42, draw: 0.75, pen: 0.35, range: [10, 28, 0.35], speed: 4.9, knock: 3.4, stagger: 0.9,
  spread: [2.6, 2.1, 1.0, 2, 0, 4.4, 10], recoil: { up: 6, side: 1.1, upMax: 10, recover: 20, first: 1, pause: 0.36 }, kick: { back: 0.115, up: 9, side: 1.8, roll: 7 },
  // first person: the 蒲牢 on the receiver and the bell rack read best a little lower / further out than a rifle; the
  // gun sits low and points outward like a rifle (yaw -2.5) so the bell mouth and its crown stay well off the crosshair
  // and a struck body is never behind the barrel
  vm: { hip: [0.178, -0.252, -0.4, 1.5, -2.5, -6] },
  // sound: its own 12-gauge set with the §1.12 bronze bell overtone (tools/audio/producers/premium_pulao.mjs)
  sound: 'pulao', shell: '12g', flash: 'shotgun', tracer: 0,
  // the fireball stays small: the bronze / cyan sound-wave crown out of the bell mouth (premium/pulao.js crown()) is
  // the muzzle look; three pellets of a volley trace thin gold
  fx: { flashScale: 0.5, ramp: 7, tracer: { color: [5.2, 3.6, 1.4], glow: [0.9, 0.55, 0.16], width: 0.008, length: 1.6 }, tracerEvery: 1 },
  premium: {
    element: ['lunar', 'storm'],
    palette: { base: '#7a5a2e', trim: '#e3b04b', core: '#7fd8ff', rim: '#ffc74a', mote: '#c99a4b', accent: ['#9a1420', '#3f6a58', '#2c2d30'], twin: '#c8302a' },
    presets: { bronze_aged: 'pv_metal', bronze_cast: 'pv_metal', bronze_dark: 'pv_metal', gold: 'pv_metal', lacquer_red: 'pv_glaze', lacquer_carved: 'pv_glaze',
      glow_ice: 'pv_energy', glow_gold: 'pv_energy', crystal: 'pv_crystal' },
    // the sweep is a narrow gilt glint on the bronze (a pale wide band read as milky white on the rack and the tail)
    pv: { pv_metal: { shine: 0.8, sweepT: 5, shineTint: [1, 0.68, 0.28], shineW: 16000 }, pv_glaze: { shine: 0.6, sweepT: 4.5, shardScale: 0, irid: 0, shineTint: [1, 0.72, 0.4], shineW: 14000 },
      pv_energy: { veinFreq: 10, veinSpeed: 0.45 } },
    // the bell-mouth liner: VEIN round the bore axis (§1.5.3 pVeinAxis 1: 鐘口 / 環圈); the cast bronze glints a value
    // under the gilt so dragon, plinth and gold trim read apart
    pvKey: { glow_ice: { veinAxis: 1, veinFreq: 7, veinSpeed: 0.35 }, bronze_cast: { shine: 0.45 }, bronze_dark: { shine: 0.3 }, bronze_aged: { shine: 0.5 } },
    hero: 'fx_mouth', crosshair: 'xh_bell', meters: ['segments', 'ring'],
    ready: { sfx: 'ready_pulao', layer: { breathMul: 1.4, jitterHz: 0.5, jitterDeg: 0.5, glowMul: 1.5, idleExtra: 'pulao_ready' } },
    idleLayers: [null, { breathMul: 1.15, jitterHz: 0.4, jitterDeg: 0.2, glowMul: 1.15, idleExtra: 'pulao_sway', every: 6 }],   // §1.17 idle tiers
    firstDraw: 'pulao_first', drawClip: 'pulao_draw', inspect: ['pulao_inspect'], rareInspect: 'pulao_inspect_rare',
    // pump gun hooks (arsenal.js): the pump clip (ready version when a bell shell is loaded) and the shell clips; the
    // rare reload (1 in 8) thumbs the last shell in and rings all three bells, at the same 0.5 s a shell
    pump: 'pulao_pump', shellClips: { start: 'pulao_shell_start', insert: 'pulao_shell_insert', end: 'pulao_shell_end', rare: 'pulao_shell_rare' }, rareReloadEvery: 8,
    killFx: 'KE_BELL', killMark: 'km_pulao', dmgSkin: 'pulao',
    crisis: { name: '金鐘罩', kind: 'knock', r: 4, fx: 'pulao_crisis', sfx: 'pulao_crisis' },
    aura: { type: 'armor', amount: 5, when: 'skill', source: ['bellShell', 'knell', 'bell108'] },
    twin: 'pulao_dusk', phases: ['guqing', 'chijin'], kiln: { chance: 0.01, special: 'qinghua_mouth' },
    showcase: ['pulao_first', 'fire:3', 'alt', 'tap', 'ult', 'pulao_inspect'],
    // desktop controls for the hint card / help (the ★ dock reads special.skills)
    hints: [
      { key: 'LMB', zh: '鐘霰', desc: '泵動・9 顆彈丸・有命中的一槍算 1 次，8 次裝 1 枚鐘彈' }, { key: 'RMB', zh: '鐘彈', desc: '耗 1 枚鐘彈・銅鐘落下連響 3 次，最後音柱拋飛' },
      { key: 'Q', zh: '警世', desc: '8 m 鐘響：全體硬直・精英描邊（20 秒）' }, { key: 'hold Q', zh: '百八鐘', desc: '鐘吼 100%（或 Q 再按 F）' },
      { key: 'R', zh: '逐發裝填' }, { key: 'F', zh: '檢視', desc: '按住循環' },
    ],
  },
  special: {
    type: 'pulao',
    meters: {
      bell: { max: 3, start: 1, hud: 'segments', segments: 3, label: '鐘彈', color: '#ffc74a', src: '有命中的一槍算 1 次・每 8 次裝 1 枚' },
      ult: { max: 100, source: 'damage', per: 4500, skillFill: false, hud: 'ring', label: '鐘吼', src: '傷害累積（約 45 秒）' },
    },
    skills: {
      // key: desktop binding (◎ = right mouse, ★ = Q; the HUD dock / hint card read the live bindings)
      alt: { id: 'pulao_bellShell', key: 'RMB', zh: '鐘彈', desc: '銅鐘從 6 m 落下・連響 3 次各 140＋擊退・音柱拋飛 4 m', meter: 'bell', cost: 1, range: 40,
        drop: 6, rings: 3, every: 0.4, r: 4.5, dmg: 140, knock: 6, toss: 4, pillar: 1.3, pillarDmg: 40, level: 'L2' },
      tap: { id: 'pulao_knell', key: 'Q', zh: '警世', desc: '8 m 鐘響：殭屍硬直 0.8 秒・精英描邊 5 秒（全隊）', cd: 20, r: 8, stun: 0.8, mark: 5, level: 'L2' },
      ult: { id: 'pulao_108', key: 'hold Q', zh: '百八鐘', desc: '巨鐘罩下連響 9 聲各 200・10 m 內拖入鐘下困住 2.4 秒・碎成銅片 32 道各 50', meter: 'ult', range: 30,
        r: 7, dmg: 200, tolls: 9, trapR: 3, trap: 2.4, shards: 32, shardDmg: 50, sigil: 7, level: 'L3' },
    },
    passive: { per: 8, armor: 5 },
  } });

// ---------------------------------------------------------------- 神兵 光暗雙生 M03 (docs/PREMIUM_WEAPONS.md M03, §2.26, Appendix A)
// 畢方．焚翼 / 鬼車．晦翼 (presentation + mechanics: weapons/premium/bifang.js): an AA-12-pattern scatter cannon built
// as the one-legged crane. 8 feather light-pellets x 20 at 180 rpm (every hit stacks 灼羽: ≤ 5 x 8/s for 3 s), 50-cell
// feather magazine, unlimited reserve. 羽能 (+0.6 % a hit, not while spread): ◎ 焚翼 (≥ 40 %, 10 %/s, 6 s or ◎ again:
// 3 m burn 40/s, immune to slow / root / grab, +10 % speed, teammates within 4 m cleansed; folding after ≥ 40 % spent
// fires 焚天光 600 + 120/s for 1.2 s, 30 m x 1.4 m, piercing); ★ tap 羽落 (25 %): 12 burning feathers in 6 m, 60 + 2
// stacks each; ★ held 畢方降臨 (天火 from damage, ~50 s): one wing beat 300 + knock in a 10 m cone, a 25 m dive leaving
// a 4 s fire path (30/s). The twin keeps the numbers; names, colours, audio (-4 st + echo), a sky-falling beam and its
// own ultimate signature (九首夜啼: fear 1.5 s within 10 m, a 120 scream: the horde is seen to flee) differ.
// Feel (a cannon, not a rifle): 8 x 20 = 160 a point-blank volley (kills a walker), stagger 0.8 / knock 4 per pellet,
// a heavy view punch and viewmodel kick, but little aim drift (recoil settles between shots: recoil.pause); DPS 480
// = 0.67x the Squall-20's 720 (§2.27 1.3x rule).
const PYRE = { cat: 'heavy', tier: 'mythic', line: 'twin', price: 9500, wear: 0.15, dmg: 20, head: 2, pellets: 8, rpm: 180, mode: 'auto',
  mag: 50, reserve: Infinity, reload: 2.8, reloadEmpty: 2.8, draw: 0.7, pen: 0.3, range: [12, 30, 0.35], speed: 4.6, knock: 4, stagger: 0.8,
  spread: [4.4, 3.4, 1.0, 2, 0.3, 5.4, 10], recoil: { up: 1.4, side: 0.6, upMax: 5, recover: 18, first: 1, pause: 0.55, pattern: [0, 0.4, -0.5, 0.3] },
  kick: { back: 0.07, up: 10, side: 2.2, roll: 4 }, sound: 'bifang', shell: null, flash: 'shotgun', tracer: 0,   // guiche: its -4 st + echo set
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
  flap: { r: 10, cone: 60, dmg: 300, burn: 3, knock: 9, scream: 120 }, dive: { len: 25, dps: 30, life: 4, width: 2.6 },
  cleanse: { r: 4, every: 6 },                                        // 解縛 team aura while the wings are spread
});
// desktop controls for the hint card / help (premium.hints; the ★ dock reads special.skills)
const PYRE_HINTS = (n) => [
  { key: 'LMB', zh: n.fire, desc: '8 枚羽彈・每中一枚疊灼羽' }, { key: 'RMB', zh: n.alt, desc: `${n.feather} ≥40% 展翼；再按 RMB 收翼，這次耗 ≥40% 就放${n.beam}` },
  { key: 'Q', zh: n.tap, desc: `${n.feather} 25%` }, { key: 'hold Q', zh: n.ult, desc: `${n.ultMeter} 100%（或 Q 再按 F）` },
  { key: 'R', zh: '換彈' }, { key: 'F', zh: '檢視', desc: '按住循環' },
];
def({ ...PYRE, id: 'bifang', zh: '畢方．焚翼', en: 'Bifang Pyrewing', element: ['radiant', 'inferno'], model: 'bifang',
  fx: { flashScale: 1.1, ramp: 7, tracerEvery: 0 },
  premium: {
    element: ['radiant', 'inferno'], look: 'bifang',
    palette: { base: '#f3efe6', trim: '#e3b04b', core: '#fff2b0', rim: '#ffc74a', mote: '#fffbe0', accent: ['#6ec8ff'], twin: '#b54bff', feather: ['#1fb5a8', '#ff5a2a'] },
    shard: ['#1f8f8a', '#c8302a', '#f3efe6', '#1f8f8a'],                // cloisonné cells: 青釉 朱釉 白瓷 青釉, gold wire
    presets: { porcelain: 'pv_glaze', lacquer_red: 'pv_glaze', glaze_teal: 'pv_glaze', glaze_turquoise: 'pv_glaze', glaze_vermilion: 'pv_glaze', glaze_cobalt: 'pv_glaze', glaze_black: 'pv_glaze',
      gold: 'pv_metal', bronze_aged: 'pv_metal', glow_sun: 'pv_energy', glow_vermilion: 'pv_energy', crystal: 'pv_crystal', obsidian: 'pv_core' },
    pv: { pv_glaze: { shine: 2.1, sweepT: 4.5 }, pv_metal: { shine: 1.4, sweepT: 5 }, pv_energy: { veinFreq: 16, veinSpeed: 0.42 } },
    // 掐絲琺瑯 cloisonné is modelled (gold cloisons along the barbs, enamel recessed by row: glaze_teal / turquoise /
    // vermilion, white tips); the porcelain carries a fine 開片 crackle (one-colour SHARD: hairlines + gold threads).
    // Enamel cells: a fine SHARD of four close tones each (the colour jitter of fired glaze) over domed cell normals
    pvKey: { porcelain: { shardScale: 78, shardPal: ['#e2dccf', '#e2dccf', '#e2dccf', '#e2dccf'], grout: '#8f7f62', groutW: 0.16 },
      glaze_teal: { shardScale: 260, shardPal: ['#1f8f8a', '#23988f', '#1a8580', '#21928c'], grout: '#145e5a', groutW: 0.04 },
      glaze_turquoise: { shardScale: 260, shardPal: ['#2aa6a0', '#30b0a8', '#259a95', '#2ca9a2'], grout: '#1a6a66', groutW: 0.04 },
      glaze_vermilion: { shardScale: 260, shardPal: ['#c8302a', '#d23a2e', '#b92a26', '#cc342b'], grout: '#7a1814', groutW: 0.04 } },
    // first person the white porcelain blew out to a flat slab: a lower albedo (~0.8), less env, a faint orange-peel
    // micro-normal so the sweep and the crackle have a surface to run over
    mat: { porcelain: { color: '#ddd7cc', env: 1.1, rough: 0.2, detail: 'cast', dScale: 140, dStr: 0.05 },
      glaze_teal: { detail: 'cast', dScale: 220, dStr: 0.05 }, glaze_turquoise: { detail: 'cast', dScale: 220, dStr: 0.05 }, glaze_vermilion: { detail: 'cast', dScale: 220, dStr: 0.05 } },
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
def({ ...PYRE, id: 'guiche', zh: '鬼車．晦翼', en: 'Guiche Gloomwing', element: ['void'], model: 'guiche', sound: 'guiche',
  fx: { flashScale: 1.1, ramp: 5, tracerEvery: 0 },
  premium: {
    element: ['void'], look: 'guiche',
    palette: { base: '#121012', trim: '#9aa0a6', core: '#b54bff', rim: '#2a9f92', mote: '#d9b8ff', accent: ['#3fffe0'], twin: '#ffc74a', feather: ['#7a3cff', '#3fffe0'] },
    shard: ['#5b2b5e', '#1d3f4a', '#121012', '#5b2b5e'],                // 茄紫釉 墨青釉 黑漆, antique-silver wire
    presets: { lacquer_black: 'pv_glaze', glaze_aubergine: 'pv_glaze', glaze_inkteal: 'pv_glaze', glaze_coldteal: 'pv_glaze', glaze_black: 'pv_glaze',
      silver_aged: 'pv_metal', steel_bright: 'pv_metal', glow_purple: 'pv_energy', glow_vermilion: 'pv_energy', crystal: 'pv_crystal', obsidian: 'pv_core' },
    // black lacquer: a tight, dim cold-teal rim (少量 per the card) -- a broad one turns the whole gun teal at grazing angles
    pv: { pv_glaze: { shine: 1.0, sweepT: 5, rimPower: 6 }, pv_metal: { shine: 1.2, sweepT: 5, rimPower: 4.5 }, pv_energy: { veinFreq: 16, veinSpeed: 0.36 } },
    // modelled cloisonné in antique-silver wire; the black lacquer carries faint 斷紋 (aged-lacquer crackle): four
    // near-identical blacks (not mono, so no amber 金絲 second crackle; cells vary a little in depth) parted by thin
    // matte lines that only show where the gloss catches the light
    pvKey: { lacquer_black: { shardScale: 42, shardPal: ['#141016', '#17121a', '#120f14', '#161118'], grout: '#2a2230', groutW: 0.1 } },
    // black lacquer read grey-teal first person (the studio env on a 0.18-rough dielectric): half the env, a touch
    // rougher, so the base stays near #121012 and only the sweep and the rim catch it
    mat: { lacquer_black: { env: 0.35, rough: 0.28 } },
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

// ---------------------------------------------------------------- 神兵 星宿 X02 (docs/PREMIUM_WEAPONS.md §2.29, Appendix A)
// 星河．斬嶽: a two-handed energy greatsword (presentation + mechanics: weapons/premium/starsword.js). The special drives
// its own attacks (mode 'melee' -> special.melee): LMB taps chain 星流三式 (110 / 110 / 170, every target in the arc),
// LMB held 墜星 (3 charge stages: a ground slam + a 星痕 wave running along the street), RMB held 鎮河 guard (-70 %
// from the front; a hit in the first 0.25 s is a perfect guard -> 迴瀾 counter), Q 橫天 (40 星能: a 9 m projected
// blade sweeps 220°), hold Q 天劍 (a 14 m star sword falls from the sky). Released 2026-10-26 (shop + armory).
def({ id: 'starsword', zh: '星河．斬嶽', en: 'Xinghe Peakcleaver', cat: 'melee', tier: 'mythic', line: 'xingxiu', element: ['cosmic'], model: 'starsword',
  price: 7600, wear: 0.15, dmg: 110, head: 1.5, rpm: 100, mode: 'melee', mag: 0, reserve: 0, draw: 0.6,
  // shop card bars: the slam (to 450 + a 300 wave) and the 9 m 橫天 are what the derived melee bars missed
  shopStats: [['傷害', 0.62], ['攻速', 0.5], ['重擊', 0.95], ['範圍', 0.9], ['機動', 0.8]],
  icon: { roll: -90 },   // shop / HUD silhouette (ui/icons.js): laid along the strip, the point to the right (upright it was a hairline)
  range: [3.2, 3.2, 1], speed: 5.2, knock: 3, stagger: 0.6, spread: [0, 0, 0, 0, 0, 0, 0], recoil: { up: 0, side: 0, upMax: 0, recover: 10 },
  kick: { back: 0, up: 0, side: 0, roll: 0 }, sound: 'starsword', shell: null, flash: null, tracer: 0,
  // first person: the blade rises from the lower right, its flat half turned to the camera, the tip leaning left
  vm: { hip: [0.29, -0.27, -0.5, -9.2, -55.7, 29.2] },
  premium: {
    element: ['cosmic'], look: 'starsword',
    palette: { base: '#1d2129', trim: '#9aa0a6', core: '#bcd2ff', rim: '#c66bff', mote: '#fff6d8', accent: ['#ffcf6a'], twin: '#ffcf6a' },
    shard: ['#1d3c8f', '#244aa5', '#1a3478', '#2a52b0'],                 // cloisonné night-sky enamel, gold wire
    // model v2 zones: blued flats, a straw -> violet temper on the edge slope (brass / steel_bright keys), mirror edge
    // (chrome), dark mirror ricasso (black_chrome), ivory ray skin (leather_pebble), five designed enamels (glaze_* /
    // porcelain: one tone per cell, wires are geometry; the shader only adds a faint crackle under the glaze)
    presets: { glow_arc: 'pv_energy', glow_blue: 'pv_energy', glow_white: 'pv_energy', silver_aged: 'pv_metal', gold: 'pv_metal', gold_leaf: 'pv_metal', steel_bright: 'pv_metal', steel_blued: 'pv_metal',
      chrome: 'pv_metal', brass: 'pv_metal', black_chrome: 'pv_metal', leather_pebble: 'pv_metal', steel: 'pv_metal', glass: 'pv_crystal',
      glaze_cobalt: 'pv_glaze', glaze_inkteal: 'pv_glaze', glaze_turquoise: 'pv_glaze', glaze_aubergine: 'pv_glaze', porcelain: 'pv_glaze', crystal: 'pv_crystal', obsidian: 'pv_core' },
    pv: { pv_metal: { shine: 0.9, sweepT: 5 }, pv_glaze: { shine: 0.7, sweepT: 4.5, shardScale: 300, groutW: 0.03, grout: '#0c1634', groutMetal: 0 },
      pv_energy: { veinFreq: 10, veinSpeed: 0.6, veinAxis: 0 }, pv_core: { coreMode: 0, coreScale: 1.4 } },
    // the projected edge reads star-white-blue (glow_arc is violet-white)
    mat: {
      glow_arc: { emissive: '#bcd2ff', glow: 3.6 }, glow_blue: { emissive: '#6f8dff', glow: 2.4 },
      // night-blue flats: saturated, part diffuse and a low env so the sky reflection does not wash them silver-white
      steel_blued: { color: '#2c3f7a', rough: 0.38, metal: 0.55, env: 0.6, dStr: 0.1 },
      chrome: { color: '#e2e7ef', rough: 0.05, metal: 1, detail: 'brushed', dScale: 14, dStr: 0.03 },
      brass: { color: '#b09358', rough: 0.18, metal: 1, detail: 'brushed', dScale: 30, dStr: 0.05 },
      steel_bright: { color: '#5d4f9c', rough: 0.2, metal: 1, dStr: 0.05 },
      // 錯銀: the silver floor of the engraving -- satin, so it catches broad light against the blued plate in any
      // surroundings (a mirror finish reflected the same dark as the plate and the scrolls vanished)
      steel: { color: '#f2f4f8', rough: 0.3, metal: 1, detail: 'brushed', dScale: 60, dStr: 0.04, env: 1.5 },
      black_chrome: { color: '#222a3f', rough: 0.14, metal: 1, detail: 'brushed', dScale: 34, dStr: 0.06 },
      leather_pebble: { color: '#d3c9b0', rough: 0.5, metal: 0, detail: 'stipple', dScale: 120, dStr: 0.85 },
      glaze_cobalt: { color: '#2449a6' }, glaze_inkteal: { color: '#15255c' }, glaze_turquoise: { color: '#3d7fd2' }, glaze_aubergine: { color: '#3e2c78' }, porcelain: { color: '#eef0f6' },
      crystal: { color: '#a8c8ff', rough: 0.03, env: 1.7 },
      glass: { color: '#2f5ee0', rough: 0.03, metal: 0.2, env: 0.9 },   // the 天樞 sapphire (focal point: a deep blue fire, not a white disc)
    },
    // per key: the rim light (nebula violet) stays on the energy parts (metals / enamel only at grazing edges); the
    // blade's sheen a slow cool sweep; the galaxy floor deep blue with a violet second nebula, stars white
    pvKey: { steel_blued: { shine: 0.6, sweepT: 6, rimPower: 8 }, chrome: { rimPower: 12 }, brass: { rimPower: 12 }, steel_bright: { rimPower: 12 }, black_chrome: { rimPower: 12 },
      silver_aged: { rimPower: 12 }, gold: { rimPower: 10 }, gold_leaf: { rimPower: 10 }, leather_pebble: { shine: 0, rimPower: 40, flashMask: 0 },
      glaze_cobalt: { shardPal: ['#2449a6', '#2449a6', '#2449a6', '#2449a6'], rimPower: 10 }, glaze_inkteal: { shardPal: ['#15255c', '#15255c', '#15255c', '#15255c'], rimPower: 10 },
      glaze_turquoise: { shardPal: ['#3d7fd2', '#3d7fd2', '#3d7fd2', '#3d7fd2'], rimPower: 10 }, glaze_aubergine: { shardPal: ['#3e2c78', '#3e2c78', '#3e2c78', '#3e2c78'], rimPower: 10 },
      porcelain: { shardPal: ['#eef0f6', '#eef0f6', '#eef0f6', '#eef0f6'], rimPower: 10 },
      obsidian: { coreTint: '#2a3fb4', coreTint2: '#7048c8', coreScale: 1.6 }, crystal: { coreTint: '#9ec0ff' } },
    hero: 'fx_gem', crosshair: 'xh_star', meters: ['arc', 'segments', 'ring'],
    ready: { sfx: 'ready_starsword', layer: { breathMul: 1.4, jitterHz: 0.5, jitterDeg: 0.5, glowMul: 1.5, idleExtra: 'starsword_ready' } },
    idleLayers: [null, { breathMul: 1.15, jitterHz: 0.4, jitterDeg: 0.2, glowMul: 1.15, idleExtra: 'starsword_glint', every: 7 }],   // §1.17 idle tiers
    firstDraw: 'starsword_first', drawClip: 'starsword_draw', inspect: ['starsword_inspect'], rareInspect: 'starsword_inspect_rare',
    killFx: 'KE_STARCUT', killMark: 'km_starsword', dmgSkin: 'mythic', skillSkin: 'star',
    crisis: { name: '星屏', kind: 'knock', fx: 'starsword_crisis' },
    aura: { type: 'dmg', mul: 1.1, radius: 8, when: 'skill', source: ['starsword_heaven'] },
    twin: 'starsword_night', phases: ['xinghe', 'yedu'],
    showcase: ['starsword_first', 'fire:3', 'charge', 'alt', 'tap', 'ult', 'starsword_inspect'],
    // desktop controls for the hint card / help (the ★ dock reads special.skills)
    hints: [
      { key: 'LMB', zh: '星流三式', desc: '點按連斬：橫流 → 逆流 → 迴天（全弧命中）' }, { key: 'hold LMB', zh: '墜星', desc: '按住蓄力 3 階，放開砸地＋星痕' },
      { key: 'RMB', zh: '鎮河', desc: '按住格擋 −70%；舉劍瞬間被打＝完美格擋並反擊（迴瀾）' },
      { key: 'Q', zh: '橫天', desc: '星能 40：9 m 能量巨刃橫掃 220°' }, { key: 'hold Q', zh: '天劍', desc: '天劍 100%（或 Q 再按 F）' },
      { key: 'F', zh: '檢視', desc: '按住循環' },
    ],
  },
  special: {
    type: 'starsword',
    meters: {
      star: { max: 100, start: 40, onHit: 2, onKill: 4, onParry: 15, skillFill: false, hud: 'arc', label: '星能', src: '劍招每個命中 +2、擊殺 +4、完美格擋 +15（技能命中不回補）' },
      charge: { max: 3, hud: 'segments', segments: 3, label: '墜星', color: '#bcd2ff', src: '按住開火蓄力' },   // live stage (display only)
      ult: { max: 100, source: 'damage', per: 6000, skillFill: false, hud: 'ring', label: '天劍', src: '傷害累積（約 45 秒）' },
    },
    skills: {
      // key: desktop binding (◎ = right mouse, ★ = Q). 鎮河 is driven by the special itself (a held stance, not a cast)
      alt: { id: 'starsword_guard', key: 'RMB', zh: '鎮河', desc: '按住格擋・正面 −70%・完美格擋接迴瀾 260', hold: true, cost: 0, level: 'L1' },
      tap: { id: 'starsword_skyspan', key: 'Q', zh: '橫天', desc: '9 m 能量巨刃橫掃 220°・每目標 360', meter: 'star', cost: 40, r: 9, arc: 220, dmg: 360, knock: 7, level: 'L3' },
      ult: { id: 'starsword_heaven', key: 'hold Q', zh: '天劍', desc: '14 m 星光巨劍墜地 900，脈動 3 次各 220', meter: 'ult', range: 30, r: 7, dmg: 900, pulses: 3, pulseDmg: 220, pulseR: 8, level: 'L4' },
    },
    combo: [
      { id: 'flow', dur: 0.55, hit: 0.2, dmg: 110, r: 3.2, arc: 150, knock: 3, stagger: 0.6 },
      { id: 'counterflow', dur: 0.55, hit: 0.2, dmg: 110, r: 3.2, arc: 150, knock: 3, stagger: 0.6 },
      { id: 'heavenwheel', dur: 0.8, hit: 0.3, dmg: 170, r: 3.6, arc: 360, knock: 6, stagger: 1, heavy: true },
    ],
    chain: 0.45, recover: 1.2,
    slam: { hold: 0.17, stages: [0.6, 1.2, 1.8], max: 4, dmg: [160, 240, 330, 450], r: [2.2, 2.6, 3.0, 3.5], wave: { speed: 24, width: 2.4, len: [6, 10, 13, 16], dmg: [100, 160, 220, 300] } },
    guard: { raise: 0.15, cone: 140, mul: 0.3, speedMul: 0.65, perfect: 0.25, rearm: 0.4, counter: { r: 4, arc: 200, dmg: 260, knock: 8 } },
  } });

// ---------------------------------------------------------------- 神兵 射日 X03 (docs/PREMIUM_WEAPONS.md §2.30, Appendix A)
// 彤弓．落陽: a mythic great bow, the first non-gun ranged weapon (presentation + mechanics: weapons/premium/sunbow.js).
// The special runs the trigger (mode 'bow' -> special.trigger): LMB held draws in 3 stages (引 0.35 s / 滿 0.85 s /
// 貫日 1.45 s), release looses a real flying arrow (55 / 120 / 240 / 460, pierce 1 / 2 / 3 / 8, 日灼 burn from 滿, 貫日
// pins the survivors 1.2 s and hurls the dead). 九陽: 9 arrows that relight by themselves (R = 續陽 refill). RMB 分曦
// splits the drawn arrow into a 5-arrow fan (3 arrows), Q 懸日 (30 日精) hangs a small sun that burns, pulls and turns
// every arrow through it into 貫日, hold Q 落九陽 (4,500 damage) shoots nine suns out of the sky onto the crosshair.
// Released (shop / armory, mythic frame).
def({ id: 'sunbow', zh: '彤弓．落陽', en: 'Tonggong Sunfall', cat: 'heavy', tier: 'mythic', line: 'sheri', element: ['inferno', 'radiant'], model: 'sunbow',
  price: 8400, wear: 0.15, dmg: 460, head: 3, rpm: 40, mode: 'bow', mag: 9, reserve: Infinity, reload: 1.0, reloadEmpty: 1.0, draw: 0.7,
  pen: 8, range: [999, 999, 1], speed: 5.0, knock: 3.6, stagger: 1,
  // the spread is the draw's: hip 0 + a bloom the special sets every frame (2.2° undrawn -> 0° at 貫日); move / air add
  spread: [0, 0, 1.2, 4, 0, 9, 0], recoil: { up: 0, side: 0, upMax: 0, recover: 14 }, kick: { back: 0, up: 0, side: 0, roll: 0 },
  sound: 'sunbow', shell: null, flash: null, tracer: 0,
  // HUD / shop silhouette (ui/icons.js): the upright bow rolled to lie along the icon strip
  icon: { roll: 90, zoom: 1.08 },
  // first person: vm.hip = the aimed pose (bow hand left of the crosshair, canted right, the arrow rising to the centre);
  // vm.rest = undrawn (lowered to the lower left, more cant): premium/sunbow.js blends them with the draw
  vm: { hip: [-0.16, -0.13, -0.72, 10, 20, -6], rest: [-0.3, -0.2, -0.62, -2, 24, 12] },
  bow: {
    stages: [0.35, 0.85, 1.45], dmg: [55, 120, 240, 460], speed: [60, 85, 110, 150], pierce: [1, 2, 3, 8], burn: [0, 0, 1, 3],
    spread: [2.2, 0.9, 0.35, 0], gravity: [5, 3, 1.5, 0], knock: [0.8, 1.4, 2.4, 3.6], stagger: [0.3, 0.6, 0.9, 1], headMul: 3,
    renock: 0.32, tire: 3, tireRate: 0.4, tireMax: 1.5, regen: { delay: 0.6, every: 0.7 }, moveMul: 0.85, pin: 1.2,
    burnDps: 20, burnDur: 3, burnMax: 3, fan: { n: 5, deg: 18, mul: 0.55, cost: 3, cd: 0.7 },
  },
  premium: {
    element: ['inferno', 'radiant'], look: 'sunbow',
    palette: { base: '#9a1420', trim: '#e3b04b', core: '#ffd36b', rim: '#ff7a2f', mote: '#fff1b8', accent: ['#2f8f4e'], twin: '#cfe6ff', ember: '#ffb43a' },
    presets: { lacquer_red: 'pv_glaze', glaze_jade: 'pv_glaze', gold: 'pv_metal', gold_leaf: 'pv_metal', bronze_aged: 'pv_metal',
      glow_sun: 'pv_energy', glow_gold: 'pv_energy', glow_vermilion: 'pv_energy', crystal: 'pv_crystal' },
    // red lacquer: sweep + a tight warm rim, no shards; the 日珠 burns gold-orange from inside
    pv: { pv_glaze: { shine: 1.7, sweepT: 5, shardScale: 0, irid: 0, rimPower: 5 }, pv_metal: { shine: 1.4, sweepT: 5.5 }, pv_energy: { veinFreq: 12, veinSpeed: 0.5 } },
    // the red lacquer carries a fine 斷紋 crackle (one-colour shards = crackle under the glaze)
    // the 日珠 holds a sun (gemSun = the stone's radius about the rotor pivot): white-gold disc, slow ray corona, vermilion girdle
    pvKey: { crystal: { coreTint: '#e8902c', gemSun: 0.0142, irid: 0.12 }, glaze_jade: { irid: 0.08 },
      lacquer_red: { shardScale: 115, shardPal: ['#9a1420', '#9a1420', '#9a1420', '#9a1420'], grout: '#3a0c0e', groutW: 0.05 } },
    // the 日珠 burns from inside (emissive: clip glow events and the draw drive it with the gun's other glows)
    // bronze a shade lighter than the stock aged bronze (the cast relief must read under neutral light) with a fine,
    // quiet casting skin (the relief + baked cavity patina carry it, not noise); the nine sun cores rest at about half
    // the 日珠 (§2.30 ≤ 0.5x the focal) so the cup metalwork reads before the glow; the stone's own glow stays low
    // under its inner sun (no blown-out white disc)
    mat: { crystal: { color: '#c87a34', emissive: '#ff7a1e', glow: 0.35, env: 0.6, rough: 0.1 }, bronze_aged: { color: '#86663a', dScale: 130, dStr: 0.06 }, glow_gold: { glow: 2 } },
    hero: 'fx_sun', crosshair: 'xh_sunbow', meters: ['arc', 'ring'],
    ready: { sfx: 'ready_sunbow', layer: { breathMul: 1.4, jitterHz: 0.5, jitterDeg: 0.4, glowMul: 1.5, idleExtra: 'sunbow_ready' } },
    idleLayers: [null, { breathMul: 1.15, jitterHz: 0.4, jitterDeg: 0.15, glowMul: 1.15, idleExtra: 'sunbow_glint', every: 7 }],   // §1.17 idle tiers
    firstDraw: 'sunbow_first', drawClip: 'sunbow_drawn', inspect: ['sunbow_inspect'], rareInspect: 'sunbow_inspect_rare', reload: 'sunbow_rekindle', rareReload: 'sunbow_rekindle_rare',
    killFx: 'KE_SUNMARK', killMark: 'km_sunbow', dmgSkin: 'sunbow',
    crisis: { name: '扶桑甲', kind: 'knock', fx: 'sunbow_crisis' },
    aura: { type: 'dmg', mul: 1.15, radius: 5, when: 'source', source: ['sunbow_hang'] },
    twin: 'sunbow_eclipse', phases: ['tongyang', 'luori'],
    showcase: ['sunbow_first', 'fire:3', 'alt', 'tap', 'ult', 'sunbow_inspect'],
    // desktop controls for the hint card / help (the ★ dock reads special.skills)
    hints: [
      { key: 'hold LMB', zh: '拉弓', desc: '按住拉弦 3 段（引・滿・貫日），放開射出' }, { key: 'LMB', zh: '點射', desc: '輕點＝快射弱箭' },
      { key: 'RMB', zh: '分曦', desc: '把這一箭分成 5 支扇形齊射（耗 3 箭）' },
      { key: 'Q', zh: '懸日', desc: '日精 30：釘一顆小太陽，燒、吸，穿過它的箭變貫日' }, { key: 'hold Q', zh: '落九陽', desc: '落陽 100%（或 Q 再按 F）' },
      { key: 'R', zh: '續陽', desc: '九陽自己會回；R 一次補滿' }, { key: 'F', zh: '檢視', desc: '按住循環' },
    ],
  },
  special: {
    type: 'sunbow',
    meters: {
      sun: { max: 100, start: 40, onKill: 5, hud: 'arc', label: '日精', src: '「引」以上每中 +2、擊殺 +5、貫日擊殺 +8' },
      ult: { max: 100, source: 'damage', per: 4500, skillFill: false, hud: 'ring', label: '落陽', src: '傷害累積（約 45 秒）' },
    },
    skills: {
      // key: desktop binding (◎ = right mouse, ★ = Q; the HUD dock / hint card read the live bindings)
      alt: { id: 'sunbow_split', key: 'RMB', zh: '分曦', desc: '5 支扇形齊射・每支 55%・耗 3 箭', cd: 0.7, level: 'L1' },
      tap: { id: 'sunbow_hang', key: 'Q', zh: '懸日', desc: '小太陽懸 3.5 秒：每秒 45、往中心吸、穿過的箭變貫日、爆 320', meter: 'sun', cost: 30,
        speed: 60, gravity: 4, dur: 3.5, r: 3.5, dps: 45, pull: 7, pullSpeed: 1.2, empower: 1.2, burst: 320, burstR: 5, burstKnock: 7, aura: 5, level: 'L2' },
      ult: { id: 'sunbow_ult', key: 'hold Q', zh: '落九陽', desc: '九顆太陽從天射落：8×240＋正中 650', meter: 'ult', range: 35,
        ring: 4.5, dmg: 240, r: 3.5, burn: 2, knock: 5, final: 650, finalR: 6.5, finalKnock: 10, every: 0.22, level: 'L3' },
    },
  } });

// ---------------------------------------------------------------- 神兵 雷澤 X04 (docs/PREMIUM_WEAPONS.md §2.31, Appendix A)
// 應龍．御霆: a mythic magic staff (presentation + mechanics: weapons/premium/staff.js). Mana, not a magazine (ws.ammo of
// 100, refills by itself; R 引雷 tops it up). The special runs the trigger (mode 'staff' -> special.trigger): LMB held casts
// 雷矢 homing darts (400 rpm, 36, 4 mana) that leave 雷印 marks; RMB held channels 連霆, a chain of lightning from the
// 雷珠 jumping through five zombies (marked ones take more; three marks = 雷爆); Q 雷池 (35 霆勢) plants a thunder field that
// strikes, slows and throws back whatever tries to cross its edge; hold Q 應龍．震霄 (5,000 damage) calls the winged dragon
// out of a storm cloud, dives three times, drags the field's zombies into the middle and falls on them as a column.
def({ id: 'staff', zh: '應龍．御霆', en: 'Yinglong Stormherald', cat: 'staff', tier: 'mythic', line: 'leize', element: ['storm', 'jade'], model: 'staff',
  price: 9800, wear: 0.15, dmg: 36, head: 2, rpm: 400, mode: 'staff', mag: 100, reserve: Infinity, reload: 1.2, reloadEmpty: 1.2, draw: 0.65,
  resource: { kind: 'mana', max: 100, regen: 20, label: '法力', color: '#8fe6ff' },
  pen: 0, range: [42, 42, 1], speed: 5.1, knock: 0.6, stagger: 0.25,
  spread: [0.6, 0.6, 0.8, 2, 0, 1.5, 10], recoil: { up: 0, side: 0, upMax: 0, recover: 14 }, kick: { back: 0, up: 0, side: 0, roll: 0 },
  sound: 'staff', shell: null, flash: null, tracer: 0,
  shopStats: [['傷害', 0.55], ['射速', 0.7], ['追蹤', 1], ['範圍', 0.85], ['控場', 0.95]],
  icon: { roll: 90, zoom: 1.08 },   // HUD / shop silhouette (ui/icons.js): the upright staff laid along the strip
  // first person: the staff held high in the right hand, the head up right and clear of the crosshair lane (snout past
  // 62 % of the width, above the horizon band where zombies stand), turned so the dragon shows its face to the eye
  vm: { hip: [0.29, -0.17, -0.41, -61.6, 74.2, 13.4] },
  staff: {
    bolt: { cost: 4, dmg: 36, headMul: 2, speed: 40, speed1: 62, accel: 0.3, range: 42, cone: 12, turn: 600, delay: 0.08, knock: 0.6, stagger: 0.25 },
    regen: { delay: 0.5, rate: 20 },
    mark: { max: 3, dur: 4, mul: 0.2, burst: 120, burstR: 2.5, cd: 0.8 },
  },
  premium: {
    element: ['storm', 'jade'], look: 'staff',
    palette: { base: '#7a5a2e', trim: '#e3b04b', core: '#9fe8ff', rim: '#5fc8ff', mote: '#d8f6ff', accent: ['#2f8f6e', '#ffe27a'], twin: '#ffd36b' },
    presets: { bronze_aged: 'pv_metal', gold: 'pv_metal', gold_leaf: 'pv_metal', lacquer_black: 'pv_glaze', glaze_jade: 'pv_glaze', glaze_teal: 'pv_glaze', glaze_vermilion: 'pv_glaze',
      glaze_cobalt: 'pv_glaze', glaze_inkteal: 'pv_glaze', glaze_turquoise: 'pv_glaze', porcelain: 'pv_glaze', lacquer_red: 'pv_glaze', bone: 'pv_glaze', leather_black: 'pv_metal',
      glow_cyan: 'pv_energy', crystal: 'pv_crystal', glass: 'pv_crystal' },
    // black lacquer: a slow sweep and a quiet snake-belly 斷紋 (long cells along the shaft that only break up the
    // highlight); bronze a warm cast skin with verdigris in the recesses and polished high points; the cloisonné a faint
    // irid; ivory teeth; the 雷珠 holds a cold white-blue light, the dragon's eyes a dimmer one (≤ 0.4 x the focus)
    pv: { pv_metal: { shine: 0.55, sweepT: 6 }, pv_glaze: { shine: 0.45, sweepT: 5.5, shardScale: 0, irid: 0, rimPower: 6 }, pv_energy: { veinFreq: 14, veinSpeed: 0.7 } },
    pvKey: { lacquer_black: { shardScale: 95, shardStretch: [1, 0.38, 1], shardRough: 0.34, shardPal: ['#141114', '#1b161c', '#0c0a0c', '#171318'], grout: '#050405', groutW: 0.075 },
      glaze_jade: { irid: 0.1, rimPower: 8 }, glaze_teal: { irid: 0.12, rimPower: 8 }, bronze_aged: { rimPower: 14 }, gold: { rimPower: 12 }, gold_leaf: { rimPower: 12, leafScale: 600, leaf: 0.3 },
      bone: { shine: 0.25, rimPower: 12 }, lacquer_red: { shine: 0, rimPower: 40, flashMask: 0 }, glaze_vermilion: { rimPower: 16 }, porcelain: { rimPower: 10 }, leather_black: { shine: 0, rimPower: 40, flashMask: 0 },
      crystal: { coreTint: '#7fd8ff', irid: 0.15 }, glass: { coreTint: '#5fd0ff', gem: 1.2 } },
    mat: {
      crystal: { color: '#cdeeff', emissive: '#7fd8ff', glow: 0.55, env: 1.4, rough: 0.05 },
      glass: { color: '#1b3a52', emissive: '#4fc8ff', glow: 0.5, rough: 0.05, metal: 0.2, env: 1.0 },
      glow_cyan: { emissive: '#9fe8ff', glow: 2.2 },
      bronze_aged: { color: '#76552d', rough: 0.5, env: 0.8, dScale: 190, dStr: 0.22, cavity: 1.8, cavCol: '#2f8a62', cavMetal: 0.08, wear: { color: '#a97b44', metal: 1, rough: 0.26, amount: 0.55 } },
      lacquer_black: { env: 0.9 }, leather_black: { color: '#1a1518', rough: 0.52, metal: 0, detail: 'stipple', dScale: 230, dStr: 0.9 }, bone: { color: '#e6dabd', rough: 0.3, dStr: 0.04, env: 1.1 }, lacquer_red: { color: '#5e0d15', rough: 0.82, env: 0.25 },
      glaze_jade: { color: '#2f8f6e' }, glaze_teal: { color: '#1f7f86' }, glaze_vermilion: { color: '#b3202a' },
      glaze_cobalt: { color: '#1f4a8c' }, glaze_inkteal: { color: '#174a52' }, glaze_turquoise: { color: '#3fb0a0' },
    },
    hero: 'fx_pearl', crosshair: 'xh_staff', meters: ['arc', 'ring'],
    ready: { sfx: 'ready_staff', layer: { breathMul: 1.4, jitterHz: 0.5, jitterDeg: 0.4, glowMul: 1.5, idleExtra: 'staff_ready' } },
    idleLayers: [null, { breathMul: 1.15, jitterHz: 0.4, jitterDeg: 0.15, glowMul: 1.15, idleExtra: 'staff_glint', every: 7 }],   // §1.17 idle tiers
    firstDraw: 'staff_first', drawClip: 'staff_drawn', inspect: ['staff_inspect'], rareInspect: 'staff_inspect_rare', reload: 'staff_reload', rareReload: 'staff_reload_rare',
    killFx: 'KE_THUNDER', killMark: 'km_staff', dmgSkin: 'staff',
    crisis: { name: '雷鱗甲', kind: 'knock', fx: 'staff_crisis' },
    aura: { type: 'regen', mul: 6, radius: 9, when: 'source', source: ['staff_ult'] },
    twin: 'staff_hui', phases: ['yuting', 'huiting'],
    showcase: ['staff_first', 'fire:8', 'alt', 'tap', 'ult', 'staff_inspect'],
    // desktop controls for the hint card / help (the ★ dock reads special.skills)
    hints: [
      { key: 'hold LMB', zh: '雷矢', desc: '連發追蹤雷矢（每發 4 法力），命中留雷印' },
      { key: 'hold RMB', zh: '連霆', desc: '引導鏈狀閃電，跳 5 隻；打到 3 層雷印＝雷爆' },
      { key: 'Q', zh: '雷池', desc: '霆勢 35：雷池 5 秒，落雷、緩速，殭屍過不了池邊' }, { key: 'hold Q', zh: '應龍．震霄', desc: '震霄 100%（或 Q 再按 F）' },
      { key: 'R', zh: '引雷', desc: '法力自己會回；R 一次補滿' }, { key: 'F', zh: '檢視', desc: '按住循環' },
    ],
  },
  special: {
    type: 'staff',
    meters: {
      thunder: { max: 100, start: 40, onKill: 4, onBurst: 4, skillFill: false, hud: 'arc', label: '霆勢', src: '雷矢每中 +1.5、擊殺 +4、雷爆 +4（技能命中不回補）' },
      ult: { max: 100, source: 'damage', per: 5000, skillFill: false, hud: 'ring', label: '震霄', src: '傷害累積（約 45 秒）' },
    },
    skills: {
      // key: desktop binding (◎ = right mouse, ★ = Q; the HUD dock / hint card read the live bindings)
      alt: { id: 'staff_chain', key: 'RMB', zh: '連霆', desc: '按住引導・主目標每秒 150・跳 4 次 ×0.8・每秒 22 法力', hold: true, cost: 0,
        range: 22, cone: 8, jumps: 4, jumpR: 6, dps: 150, falloff: 0.8, slow: 0.45, mana: 22, tick: 0.1, level: 'L2' },
      tap: { id: 'staff_pool', key: 'Q', zh: '雷池', desc: '6.5 m 雷池 5 秒：開池 220、每秒 40、落雷 110、池邊彈開', meter: 'thunder', cost: 35,
        range: 30, r: 6.5, dur: 5, open: 220, openR: 3.5, dps: 40, slow: 0.5, strike: 110, strikeR: 1.5, every: 0.5, repel: 2.5, repelCd: 1.5, level: 'L2' },
      ult: { id: 'staff_ult', key: 'hold Q', zh: '震霄', desc: '應龍俯衝 3 次 160＋連鎖，把屍群拖進正中，再化雷柱 1000；之後甘霖回血', meter: 'ult', range: 35,
        r: 9, dive: 160, diveR: 3, chain: 60, chainN: 3, pullR: 10, pull: 5, final: 1000, finalR: 7, rain: 6, rainR: 9, rainDur: 5, level: 'L4' },
    },
  } });

// ---------------------------------------------------------------- 神兵 山海 X05 (docs/PREMIUM_WEAPONS.md §2.32, Appendix A)
// 刑天．舞戚: a mythic two-handed bronze great axe whose blade is Xingtian's face (presentation + mechanics:
// weapons/premium/greataxe.js). The special drives its own attacks (mode 'melee' -> special.melee): LMB taps chain 開山三劈
// (150 / 150 / 225, everything in the arc; the third cleaves the street and runs a fissure), LMB held 天墜 (2 stages: a
// leap to the marked ground and a smash, 220 -> 450, then three shockwave rings), RMB held 狂旋 (whirlwind: 60 every
// 0.28 s all round, pulls zombies in, drains 戰意), Q 迴戚 (35 戰意: the axe thrown spinning through the horde and back),
// hold Q 猛志 (a 14 m headless war spirit sweeps the street and cleaves the mark). Released (shop + armory; ?w=greataxe).
def({ id: 'greataxe', zh: '刑天．舞戚', en: 'Xingtian Wardancer', cat: 'melee', tier: 'mythic', line: 'shanhai', element: ['demonic'], model: 'greataxe',
  price: 7800, wear: 0.2, dmg: 150, head: 1.5, rpm: 90, mode: 'melee', mag: 0, reserve: 0, draw: 0.65,
  // shop card bars: the leap smash + rings and the whirlwind are what the derived melee bars miss
  shopStats: [['傷害', 0.72], ['攻速', 0.4], ['重擊', 1.0], ['範圍', 0.85], ['機動', 0.8]],
  icon: { roll: -90 },   // shop / HUD silhouette (ui/icons.js): the haft along the strip, the head to the right
  range: [3.0, 3.0, 1], speed: 5.0, knock: 3.5, stagger: 0.7, spread: [0, 0, 0, 0, 0, 0, 0], recoil: { up: 0, side: 0, upMax: 0, recover: 10 },
  kick: { back: 0, up: 0, side: 0, roll: 0 }, sound: 'greataxe', shell: null, flash: null, tracer: 0,
  // first person: the haft rises from the lower right hand, the head over the right of the frame with the mask at three
  // quarters to the eye, the edge forward-right, the turquoise tang and the tassel left of the haft
  vm: { hip: [0.29, -0.28, -0.6, -10, -60, 8] },
  premium: {
    element: ['demonic'], look: 'greataxe',
    palette: { base: '#8a6a3a', trim: '#e3b04b', core: '#ff3a2a', rim: '#ff8a3a', mote: '#ffb070', accent: ['#3aa99b'], twin: '#cfe8ff', ember: '#ffd27a' },
    // bronze (cast detail, cavity patina from the bake), gold, a forged iron edge; black lacquer with a fine 斷紋 crackle,
    // cinnabar bands; turquoise chips; crimson crystal eyes; molten glows
    presets: { bronze_aged: 'pv_metal', gold: 'pv_metal', gold_leaf: 'pv_metal', steel: 'pv_metal', steel_bright: 'pv_metal', chrome: 'pv_metal', steel_blued: 'pv_metal',
      lacquer_black: 'pv_glaze', lacquer_red: 'pv_glaze', glaze_turquoise: 'pv_glaze', glaze_teal: 'pv_glaze', glaze_jade: 'pv_glaze', crystal: 'pv_crystal', glass: 'pv_crystal',
      glow_red: 'pv_energy', glow_orange: 'pv_energy', glow_white: 'pv_energy' },
    pv: { pv_metal: { shine: 1.1, sweepT: 5.5 }, pv_glaze: { shine: 1.3, sweepT: 5, shardScale: 0, irid: 0, rimPower: 6 }, pv_energy: { veinFreq: 14, veinSpeed: 0.45, veinAxis: 0 } },
    pvKey: { lacquer_black: { shardScale: 140, shardPal: ['#121012', '#121012', '#121012', '#121012'], grout: '#2a1a12', groutW: 0.04, rimPower: 8 },
      lacquer_red: { shardScale: 120, shardPal: ['#9a1420', '#9a1420', '#9a1420', '#9a1420'], grout: '#3a0c0e', groutW: 0.04 },
      glaze_turquoise: { irid: 0.05, rimPower: 10 }, glaze_teal: { irid: 0.05, rimPower: 10 }, glaze_jade: { irid: 0.05, rimPower: 10 },
      bronze_aged: { rimPower: 10, shine: 0.55 }, gold: { rimPower: 10 }, gold_leaf: { rimPower: 10, leaf: 0.55, leafScale: 330 },   // fine, low-contrast leaf
      steel: { rimPower: 12 }, steel_bright: { rimPower: 12, shine: 1.6 }, chrome: { rimPower: 14 }, crystal: { coreTint: '#ff2a1a' }, glass: { coreTint: '#4a0408' } },
    // bronze a shade warmer and lighter than stock (the relief must read under neutral light), verdigris in the hollows
    // (the model bakes its recesses into the cavity channel) and gold-brown where hands polished the high points; the
    // iron in three grinds: a forged grey flat, a bright ground bevel, a mirror micro-bevel; the eyes a crimson stone
    // with a dark iris dish (glass) round an obsidian slit; three turquoise shades for the mosaic chips; molten glows
    mat: {
      // (rough 0.5, env 0.6 and a half-strength, darker polish: at 0.44 / 0.85 / 1 the face washed out cream under an
      // open sky or the studio ceiling whenever it turned up)
      bronze_aged: { color: '#80623a', rough: 0.5, env: 0.6, dScale: 110, dStr: 0.1, cavity: 2.0, cavCol: '#3a6a50', cavMetal: 0.2, wear: { color: '#b08a50', metal: 1, rough: 0.3, amount: 0.5 } },
      steel: { color: '#5d6168', rough: 0.6, metal: 0.8, detail: 'cast', dScale: 90, dStr: 0.16 },
      steel_bright: { color: '#c0c6cc', rough: 0.25, metal: 1, detail: 'brushed', dScale: 120, dStr: 0.05 }, chrome: { rough: 0.08 },
      steel_blued: { color: '#3a4a6a', rough: 0.3, dScale: 120, dStr: 0.05 },   // the temper line along the grind
      crystal: { color: '#b0141e', emissive: '#ff1e10', glow: 0.6, env: 0.9, rough: 0.04 }, glass: { color: '#3a0306', emissive: '#6a0806', glow: 0.25, env: 1.2, rough: 0.05 },
      glaze_turquoise: { color: '#3aa99b' }, glaze_teal: { color: '#2c8a86' }, glaze_jade: { color: '#5cc3b6', fres: 0 },
      glow_red: { emissive: '#ff3a1c', glow: 2.2 }, glow_orange: { emissive: '#ff4a14', glow: 2.6 }, glow_white: { emissive: '#ff6a48', glow: 3.2 },
    },
    hero: 'fx_eyes', crosshair: 'xh_axe', meters: ['arc', 'segments', 'ring'],
    ready: { sfx: 'ready_greataxe', layer: { breathMul: 1.4, jitterHz: 0.5, jitterDeg: 0.5, glowMul: 1.5, idleExtra: 'greataxe_ready' } },
    idleLayers: [null, { breathMul: 1.15, jitterHz: 0.4, jitterDeg: 0.2, glowMul: 1.15, idleExtra: 'greataxe_glint', every: 7 }],   // §1.17 idle tiers
    firstDraw: 'greataxe_first', drawClip: 'greataxe_draw', inspect: ['greataxe_inspect'], rareInspect: 'greataxe_inspect_rare',
    killFx: 'KE_CLEAVE', killMark: 'km_greataxe', dmgSkin: 'mythic', skillSkin: 'axe',
    crisis: { name: '干盾', kind: 'counter', fx: 'greataxe_crisis', sfx: 'greataxe_crisis', flash: [1.25, 0.42, 0.2] },   // a crimson-bronze flash, half strength
    aura: { type: 'dmg', mul: 1.12, radius: 8, when: 'skill', source: ['greataxe_ult'] },
    twin: 'greataxe_night', phases: ['wuqi', 'yewu'],
    showcase: ['greataxe_first', 'fire:3', 'charge', 'alt', 'tap', 'ult', 'greataxe_inspect'],
    // desktop controls for the hint card / help (the ★ dock reads special.skills)
    hints: [
      { key: 'LMB', zh: '開山三劈', desc: '點按連劈：斜劈 → 回掄 → 開山（劈地裂街）' }, { key: 'hold LMB', zh: '天墜', desc: '按住蓄力 2 階、瞄準落點，放開躍斬＋三重震波' },
      { key: 'RMB', zh: '狂旋', desc: '按住旋風斬，把殭屍吸進來（耗戰意）' },
      { key: 'Q', zh: '迴戚', desc: '戰意 35：擲斧穿過整排再飛回（飛行中再按 Q 召回）' }, { key: 'hold Q', zh: '猛志', desc: '猛志 100%（或 Q 再按 F）' },
      { key: 'F', zh: '檢視', desc: '按住循環' },
    ],
  },
  special: {
    type: 'greataxe',
    meters: {
      fury: { max: 100, start: 40, onHit: 3, onKill: 5, skillFill: false, hud: 'arc', label: '戰意', src: '劈砍每個命中 +3、擊殺 +5、天墜每中 +2（技能命中不回補）' },
      charge: { max: 2, hud: 'segments', segments: 2, label: '天墜', color: '#ff7a4a', src: '按住開火蓄力' },   // live stage (display only)
      ult: { max: 100, source: 'damage', per: 6000, skillFill: false, hud: 'ring', label: '猛志', src: '傷害累積（約 45 秒）' },
    },
    skills: {
      // key: desktop binding (◎ = right mouse, ★ = Q). 狂旋 drains 戰意 while held (needs 20 to start)
      alt: { id: 'greataxe_spin', key: 'RMB', zh: '狂旋', desc: '按住旋風斬・每 0.28 秒 60・7 m 內吸怪・每秒 16 戰意', meter: 'fury', hold: true, cost: 20, drain: 16,
        r: 3.4, every: 0.28, dmg: 60, pull: 7, pullSpeed: 2.4, speedMul: 0.85, burst: 120, burstR: 4, burstKnock: 7, level: 'L2' },
      tap: { id: 'greataxe_throw', key: 'Q', zh: '迴戚', desc: '擲斧 16 m 貫穿全部・去 180 回 140・再按 Q 召回', meter: 'fury', cost: 35,
        speed: 24, range: 16, r: 1.1, dmg: 180, back: 140, hang: 0.15, bulge: 3, level: 'L2' },
      ult: { id: 'greataxe_ult', key: 'hold Q', zh: '猛志', desc: '14 m 無首戰魂：橫掃 450、開山 900＋三重震波', meter: 'ult', range: 30,
        sweep: 450, sweepR: 11, sweepArc: 200, chop: 900, chopR: 7, ring: 80, ringR: 10, level: 'L4' },
    },
    combo: [
      { id: 'cleave', dur: 0.62, hit: 0.26, dmg: 150, r: 3.0, arc: 110, knock: 3.5, stagger: 0.7 },   // 150: a body blow drops a walker
      { id: 'backhand', dur: 0.62, hit: 0.24, dmg: 150, r: 3.0, arc: 120, knock: 3.5, stagger: 0.7 },
      { id: 'mountain', dur: 0.95, hit: 0.42, dmg: 225, r: 2.3, reach: 3.2, knock: 2, stagger: 1, heavy: true, fissure: { len: 4, width: 1.6, dmg: 50 } },   // single target ≈ 240 / s
    ],
    chain: 0.45, recover: 1.1,
    leap: { hold: 0.2, stages: [0.55, 1.1], max: 3, range: [5, 8, 11], dmg: [220, 320, 450], r: [3.0, 3.5, 4.0], rings: 3, ringEvery: 0.12,
      ringR: [5, 6.5, 8], ringDmg: [60, 80, 100], invuln: 0.25, cd: 2.5, flight: [0.45, 0.58, 0.7], apex: [1.6, 2.2, 2.8] },
  } });

// ---------------------------------------------------------------- 神兵 山海 X06 (docs/PREMIUM_WEAPONS.md §2.33, Appendix A)
// 虹霓．雙絕: mythic dual sabres, each one half of the two-headed rainbow dragon (presentation + mechanics:
// weapons/premium/twinblades.js). Dual grip: the weapon poses each sabre itself (camera-space blade + edge keys). The
// special drives its own attacks (mode 'melee' -> special.melee): LMB taps alternate 疾虹五連 right / left (60 / 60 / 70 / 70)
// into 交虹 (both blades crossed, 160) that throws the 虹橋 X wave (90 each, 9 m); keep LMB held after a cut = 虹貫 iai
// stance, release dashes 8 m through the horde (70 each) and 0.3 s later everything passed bursts (後斬 180); RMB held
// 交虹 cross guard (-70 % frontal; a hit within 0.3 s of raising it = parry -> 霓返 8-cut flurry); Q 虹輪 (40 刃氣: six
// spirit blades orbit 5 s, +10 % team damage within 4 m); hold Q 千刃蓮華 (twelve giant blades bloom out of a lotus,
// close through the centre, spin and burst 600). Released (shop + armory; ?w=twinblades).
def({ id: 'twinblades', zh: '虹霓．雙絕', en: 'Hongni Prismedge', cat: 'melee', tier: 'mythic', line: 'shanhai', element: ['radiant'], model: 'twinblades',
  price: 7900, wear: 0.15, dmg: 60, head: 1.5, rpm: 240, mode: 'melee', mag: 0, reserve: 0, draw: 0.45,
  // shop card bars: the fastest premium melee (two blades), the dash and the parry are what the derived melee bars miss
  shopStats: [['傷害', 0.6], ['攻速', 1.0], ['機動', 1.0], ['範圍', 0.62], ['控場', 0.72]],
  icon: { roll: -90 },   // shop / HUD silhouette (ui/icons.js): the pair laid along the strip
  range: [2.6, 2.6, 1], speed: 5.4, knock: 1.6, stagger: 0.45, spread: [0, 0, 0, 0, 0, 0, 0], recoil: { up: 0, side: 0, upMax: 0, recover: 10 },
  kick: { back: 0, up: 0, side: 0, roll: 0 }, sound: 'twinblades', shell: null, flash: null, tracer: 0,
  // first person: the pivot (midway between the grips) low in the middle; the sabres are posed by the weapon (twinblades.js)
  vm: { hip: [0, -0.24, -0.4, 0, 0, 0] },
  premium: {
    element: ['radiant'], look: 'twinblades',
    // 虹 warm (gold -> vermilion) on the right, 霓 cool (cyan -> violet) on the left; the skill colours read both
    palette: { base: '#1a1a1e', trim: '#e3b04b', core: '#ffc46a', rim: '#a86bff', mote: '#fff4e0', accent: ['#ff4a2a', '#7aa8ff'], twin: '#cfe8ff', hong: '#ff6a2a', ni: '#8a6bff' },
    presets: { bronze_aged: 'pv_metal', silver_aged: 'pv_metal', gold: 'pv_metal', gold_leaf: 'pv_metal', chrome: 'pv_metal', black_chrome: 'pv_metal', steel_bright: 'pv_metal',
      brass: 'pv_metal', steel_blued: 'pv_metal', pearl: 'pv_glaze', lacquer_red: 'pv_glaze', glaze_vermilion: 'pv_glaze', glaze_ochre: 'pv_glaze', glaze_jade: 'pv_glaze',
      glaze_aubergine: 'pv_glaze', glaze_cobalt: 'pv_glaze', glaze_teal: 'pv_glaze', crystal: 'pv_crystal', glass: 'pv_crystal', leather_pebble: 'pv_metal',
      glow_vermilion: 'pv_energy', glow_purple: 'pv_energy', glow_gold: 'pv_energy', glow_ice: 'pv_energy', glow_orange: 'pv_energy', glow_blue: 'pv_energy' },
    pv: { pv_metal: { shine: 1.2, sweepT: 4.5 }, pv_glaze: { shine: 1.1, sweepT: 5, shardScale: 0, irid: 0.06, rimPower: 6 }, pv_energy: { veinFreq: 16, veinSpeed: 0.6, veinAxis: 0 } },
    pvKey: { bronze_aged: { rimPower: 10, shine: 0.6 }, silver_aged: { rimPower: 10 }, gold: { rimPower: 10 }, gold_leaf: { rimPower: 10, leaf: 0.22, leafScale: 420 }, chrome: { rimPower: 14 },
      leather_pebble: { shine: 0, rimPower: 40, flashMask: 0 },
      black_chrome: { rimPower: 12, shine: 1.6 }, steel_bright: { rimPower: 12, shine: 1.4 }, brass: { rimPower: 12 }, steel_blued: { rimPower: 12 },
      pearl: { irid: 0.35, iridScale: 40, rimPower: 6 }, crystal: { coreTint: '#ff6a2a', irid: 0.35 }, glass: { coreTint: '#8a6bff', irid: 0.35 } },
    // blades: a dark mirror flat, a bright bevel, a mirror edge; the warm temper band straw-gold (brass), the cool one
    // blued violet; bronze warm with verdigris in the recesses, silver cool; ivory ray skin under the silk; the pearls a
    // cut crystal with a warm / cool core; glows: the fuller veins (vermilion / violet), the edges (white-gold / white-
    // violet), the projected blades (gold / violet)
    mat: {
      // the flats: dark mirror with a faint folded-steel (damascus) figure so the largest surface is never an empty slab
      // (lifted from #26282e / rough 0.12 / metal 1: the biggest surface rendered as a pure black slab in a dark room and
      // the figure never showed; a quarter dielectric lets the key light draw the folded-steel figure under any sky)
      black_chrome: { color: '#3a3e48', rough: 0.22, metal: 0.75, env: 1.15, wood: { dark: '#1e2128', light: '#7a8292', scale: 42, marble: 1 } }, steel_bright: { color: '#b8bcc2', rough: 0.22, dStr: 0.12 },
      // temper bands: a frosted fringe along the temper line (baked into the cavity channel, light cavCol = nioi)
      brass: { color: '#c79a4a', metal: 1, rough: 0.2, detail: 'brushed', dStr: 0.08, cavity: 1.2, cavCol: '#f2e2b8' }, steel_blued: { color: '#5a4a9a', rough: 0.22, dStr: 0.08, cavity: 1.2, cavCol: '#d6d0f0' },
      // cast metals: verdigris / tarnish pooled in the recesses (cavity from the bake), satin there, polished high points
      bronze_aged: { color: '#86663a', rough: 0.44, env: 0.75, dScale: 120, dStr: 0.12, cavity: 1.8, cavCol: '#3a6a50', cavMetal: 0.2, wear: { color: '#c79a58', metal: 1, rough: 0.22, amount: 0.9 } },
      silver_aged: { color: '#aab2ba', rough: 0.32, cavity: 1.5, cavCol: '#1a1c2a', cavMetal: 0.4, wear: { color: '#eef2f6', metal: 1, rough: 0.1, amount: 0.9 } },
      leather_pebble: { color: '#d9d0bc', rough: 0.55, metal: 0, detail: 'stipple', dScale: 170, dStr: 1.25 },   // ray skin: a coarse granule field
      lacquer_red: { color: '#7c0f1a', rough: 0.24, env: 1.1 }, pearl: { color: '#eae6ee', rough: 0.18 },
      // the pearls are the focus: brighter than the fuller veins (veins ≤ 0.5 x in luminance; they read by colour)
      crystal: { color: '#ffb08a', emissive: '#ff5a1a', glow: 1.15, env: 1.4, rough: 0.04 }, glass: { color: '#a890ff', emissive: '#7a4aff', glow: 1.2, env: 1.4, rough: 0.04, metal: 0.2 },
      obsidian: { color: '#0a0a0e', rough: 0.08 },
      glow_vermilion: { emissive: '#ff4a14', glow: 1.3 }, glow_purple: { emissive: '#8a4aff', glow: 1.45 },
      glow_gold: { emissive: '#ffd9a0', glow: 1.8 }, glow_ice: { emissive: '#d4c8ff', glow: 1.8 },
      // projected blades: saturated 虹 / 霓 bodies (at 3.0 they tone-mapped to white); the white is the fx_edge hairline
      glow_orange: { emissive: '#ff6a12', glow: 1.9 }, glow_blue: { emissive: '#6a34ff', glow: 2.1 },
    },
    hero: 'R_fx_pearl', crosshair: 'xh_twin', meters: ['arc', 'segments', 'ring'],
    ready: { sfx: 'ready_twinblades', layer: { breathMul: 1.4, jitterHz: 0.5, jitterDeg: 0.4, glowMul: 1.5, idleExtra: 'twinblades_ready' } },
    idleLayers: [null, { breathMul: 1.15, jitterHz: 0.4, jitterDeg: 0.15, glowMul: 1.15, idleExtra: 'twinblades_glint', every: 7 }],   // §1.17 idle tiers
    firstDraw: 'twinblades_first', drawClip: 'twinblades_draw', inspect: ['twinblades_inspect'], rareInspect: 'twinblades_inspect_rare',
    killFx: 'KE_PRISM', killMark: 'km_twinblades', dmgSkin: 'mythic', skillSkin: 'prism',
    crisis: { name: '虹障', kind: 'knock', fx: 'twinblades_crisis', sfx: 'twinblades_crisis', flash: [1.1, 0.95, 1.35] },   // a pale prism flash, not white
    aura: { type: 'dmg', mul: 1.1, radius: 4, when: 'skill', source: ['twinblades_storm'] },
    twin: 'twinblades_night', phases: ['shuangjue', 'yeyao'],
    showcase: ['twinblades_first', 'fire:5', 'charge', 'alt', 'tap', 'ult', 'twinblades_inspect'],
    // desktop controls for the hint card / help (the ★ dock reads special.skills)
    hints: [
      { key: 'LMB', zh: '疾虹五連', desc: '連點：左右交替四刀 → 交虹 X 斬（放出虹橋斬波）' }, { key: 'hold LMB', zh: '虹貫', desc: '出刀後繼續按住＝收刀蓄勢，放開衝刺 8 m，0.3 秒後整排後斬' },
      { key: 'RMB', zh: '交虹', desc: '按住雙刀交叉格擋；舉起 0.3 秒內被打＝完美格擋 → 霓返八連' },
      { key: 'Q', zh: '虹輪', desc: '刃氣 40：六柄幻刃環繞 5 秒（隊友傷害 +10%）' }, { key: 'hold Q', zh: '千刃蓮華', desc: '蓮華 100%（或 Q 再按 F）' },
      { key: 'F', zh: '檢視', desc: '按住循環' },
    ],
  },
  special: {
    type: 'twinblades',
    meters: {
      qi: { max: 100, start: 40, onHit: 2, onKill: 4, onParry: 15, skillFill: false, hud: 'arc', label: '刃氣', src: '疾虹每刀每個命中 +2、擊殺 +4、完美格擋 +15（技能命中不回補）' },
      combo: { max: 5, hud: 'segments', segments: 5, label: '連斬', color: '#ffd9a0', src: '疾虹五連的段數' },   // live step (display only)
      ult: { max: 100, source: 'damage', per: 5500, skillFill: false, hud: 'ring', label: '蓮華', src: '傷害累積（約 40 秒）' },
    },
    skills: {
      // key: desktop binding (◎ = right mouse, ★ = Q)
      alt: { id: 'twinblades_guard', key: 'RMB', zh: '交虹', desc: '按住交叉格擋・正面 −70%・舉起 0.3 秒內被打＝完美格擋→霓返 8×40', hold: true, cost: 0, level: 'L1' },
      tap: { id: 'twinblades_storm', key: 'Q', zh: '虹輪', desc: '六柄幻刃環繞 5 秒・每次掠斬 22・4 m 內隊友傷害 +10%', meter: 'qi', cost: 40,
        n: 6, r: 2.4, band: [1.0, 3.5], rate: 300, dur: 5, dmg: 22, push: 2.2, level: 'L2' },
      ult: { id: 'twinblades_ult', key: 'hold Q', zh: '千刃蓮華', desc: '十二柄巨刃成蓮：12 道斬道各 90・急旋 4×30・花心綻放 600', meter: 'ult', range: 25,
        r: 8, petals: 12, petal: 90, lane: 1.8, spin: 30, spinR: 6, pull: 2, bloom: 600, bloomR: 8, level: 'L4' },
    },
    combo: [
      { id: 'r1', hand: 'R', dur: 0.25, hit: 0.08, dmg: 60, r: 2.6, arc: 110, knock: 1.6, stagger: 0.45 },
      { id: 'l1', hand: 'L', dur: 0.25, hit: 0.08, dmg: 60, r: 2.6, arc: 110, knock: 1.6, stagger: 0.45 },
      { id: 'r2', hand: 'R', dur: 0.27, hit: 0.09, dmg: 70, r: 2.6, arc: 110, knock: 1.8, stagger: 0.5 },
      { id: 'l2', hand: 'L', dur: 0.27, hit: 0.09, dmg: 70, r: 2.6, arc: 110, knock: 1.8, stagger: 0.5 },
      { id: 'x', hand: 'X', dur: 0.6, hit: 0.22, dmg: 160, r: 3.0, arc: 150, knock: 4, stagger: 1, wave: { range: 9, width: 2.6, speed: 18, dmg: 90 } },   // single target ≈ 256 / s
    ],
    chain: 0.4, recover: 0.9,
    dash: { hold: 0.18, max: 1.5, range: 8, time: 0.2, width: 1.4, pass: 70, after: 180, delay: 0.3, cd: 1.6, invuln: 0.1 },
    guard: { cone: 150, mul: 0.3, speedMul: 0.6, raise: 0.12, perfect: 0.18, rearm: 0.4, flurry: { n: 8, dur: 0.5, r: 3.2, dmg: 40 } },
  } });

// ---------------------------------------------------------------- 神兵 九子 M02 (docs/PREMIUM_WEAPONS.md M02, Appendix A)
// 睚眥．裂魂: a ring-pommel long sabre with its cinnabar scabbard in the left hand (presentation + mechanics:
// weapons/premium/yazi.js). Dual grip in the model only: the sabre (R_gun) and the scabbard (L_gun) are posed by the
// weapon. The special drives its own attacks (mode 'melee' -> special.melee): LMB taps chain 三段斬 (95 / 95 / 160: a
// diagonal cut, a flat cut, a lunging cleave), every target in the arc; RMB held 居合 (the blade goes home in 0.15 s; a hit
// in the next 0.25 s = perfect parry -> a free full 一閃; else it charges 1.2 s in 3 rune stages, release = 一閃: a 6 m
// dash-cut through everything in the lane, 180 -> 520); Q 睚眥必報 (4 s: melee damage -50 %, 200 % reflected, 18 s
// cooldown); hold Q 裂魂 (怨氣 100 %: shadow-puppet swordsmen rise beside up to 6 targets, cut in turn, the 報 seal falls,
// one draw through the middle 600). Released: in the shop and the armory (mythic frame, 7,700).
def({ id: 'yazi', zh: '睚眥．裂魂', en: 'Yazi Soulrend', cat: 'melee', tier: 'mythic', line: 'jiuzi', element: ['demonic'], model: 'yazi', tpModel: 'yazi_tp',
  price: 7700, wear: 0.15, dmg: 95, head: 1.5, rpm: 158, mode: 'melee', mag: 0, reserve: 0, draw: 0.35,
  // shop card bars: the iai (to 520 through a lane), the parry and the dash are what the derived melee bars miss
  shopStats: [['傷害', 0.62], ['攻速', 0.72], ['重擊', 0.95], ['機動', 0.9], ['控場', 0.8]],
  icon: { roll: -90 },   // shop / HUD silhouette (ui/icons.js): laid along the strip, the point to the right
  range: [2.6, 2.6, 1], speed: 5.3, knock: 1.8, stagger: 0.5, spread: [0, 0, 0, 0, 0, 0, 0], recoil: { up: 0, side: 0, upMax: 0, recover: 10 },
  kick: { back: 0, up: 0, side: 0, roll: 0 }, sound: 'yazi', shell: null, flash: null, tracer: 0,
  // first person: the pivot (midway between the grip and the scabbard's mouth) low in the middle; both posed by yazi.js
  vm: { hip: [0, -0.24, -0.4, 0, 0, 0] },
  premium: {
    element: ['demonic'], look: 'yazi',
    // 睚眥: black lacquer and mirror steel, red gold (赤金), the cinnabar scabbard; crimson-crystal light, ember motes
    palette: { base: '#121012', trim: '#c8902e', core: '#ff2a3a', rim: '#ff4b2b', mote: '#ffb070', accent: ['#9a1420'], twin: '#dfe6f0' },
    rune: '#8c160c',   // (the rune shader lifts it x4: a deep red that stays red after tone mapping)
    presets: { gold: 'pv_metal', gold_leaf: 'pv_metal', bronze_aged: 'pv_metal', bronze_dark: 'pv_metal', chrome: 'pv_metal', black_chrome: 'pv_metal', steel_bright: 'pv_metal', steel: 'pv_metal',
      lacquer_red: 'pv_glaze', lacquer_black: 'pv_glaze', crystal: 'pv_crystal', glow_red: 'pv_energy', leather_pebble: 'pv_metal' },
    pv: { pv_metal: { shine: 1.1, sweepT: 5 }, pv_glaze: { shine: 0.55, sweepT: 6, shardScale: 0, irid: 0, rimPower: 8 }, pv_energy: { veinFreq: 14, veinSpeed: 0.5, veinAxis: 0 } },
    // per key: the lacquers carry a fine 斷紋 crackle (old lacquer), the blade's polish zones a slow cool sweep
    pvKey: { gold: { rimPower: 10 }, gold_leaf: { rimPower: 10, leaf: 0.4, leafScale: 360 }, bronze_dark: { rimPower: 10, shine: 0.5 }, bronze_aged: { rimPower: 10, shine: 0.6 },
      chrome: { rimPower: 14 }, black_chrome: { rimPower: 12, shine: 1.8, sweepT: 6 }, steel_bright: { rimPower: 12, shine: 1.2 }, steel: { rimPower: 12, shine: 0.8 }, leather_pebble: { shine: 0, rimPower: 40, flashMask: 0 },
      lacquer_red: { shardScale: 230, shardPal: ['#6a0a14', '#6a0a14', '#6a0a14', '#6a0a14'], grout: '#3a0610', groutW: 0.022, rimPower: 12 },
      lacquer_black: { shardScale: 140, shardPal: ['#121012', '#121012', '#121012', '#121012'], grout: '#2a1a12', groutW: 0.04, rimPower: 8 },
      crystal: { coreTint: '#ff2a1a' } },
    mat: {
      // red gold with dark recesses (cavity from the bake) and bright rubbed high points
      gold: { color: '#c8902e', rough: 0.26, metal: 1, detail: 'brushed', dScale: 70, dStr: 0.05, cavity: 1.4, cavCol: '#3a2410', wear: { color: '#f2c27a', metal: 1, rough: 0.14, amount: 0.75 } },
      gold_leaf: { color: '#d9a548', rough: 0.22 },
      // 烏銅 blackened bronze (the head, the guard): near-black, warm where hands polished it
      bronze_dark: { color: '#4a3a2c', rough: 0.36, dScale: 220, dStr: 0.12, cavity: 1.3, cavCol: '#0c0806', wear: { color: '#b08a56', metal: 1, rough: 0.24, amount: 0.8 } },
      bronze_aged: { color: '#7e5e32', rough: 0.44, env: 0.8, cavity: 1.6, cavCol: '#2e4a3c', cavMetal: 0.2 },
      // the blade's polish: burnished dark mirror shinogi-ji, grey satin ji with a frosted nioi fringe (cavity), a white
      // frosted temper band, a mirror edge
      black_chrome: { color: '#30343b', rough: 0.09, metal: 1, env: 1.05 },
      steel_bright: { color: '#a4a9b0', rough: 0.24, metal: 1, detail: 'brushed', dScale: 120, dStr: 0.04, cavity: 1.2, cavCol: '#eef1f5' },
      steel: { color: '#e4e7ec', rough: 0.34, metal: 1, detail: 'brushed', dScale: 160, dStr: 0.03, env: 1.2 },
      chrome: { color: '#eceff3', rough: 0.05, metal: 1 },
      // aged ivory ray skin: the nodules are geometry; the bake yellows the cavities between them and the tops polish pale
      leather_pebble: { color: '#b8a987', rough: 0.55, metal: 0, detail: 'stipple', dScale: 150, dStr: 0.9, cavity: 1.0, cavCol: '#6e5530', wear: { color: '#efe7d2', metal: 0, rough: 0.4, amount: 0.75 } },
      // cinnabar urushi: a deep red with a crisp but low reflection (at env 1.3 the overcast sky washed it to pink)
      lacquer_red: { color: '#6a0a14', rough: 0.28, env: 0.58 }, lacquer_black: { color: '#121012', rough: 0.3, env: 0.75 },
      glaze_black: { color: '#0d0a0b', rough: 0.22, metal: 0 },   // the rune strips' floor (the glyphs are pv_rune light)
      ceramic: { color: '#efebe2', rough: 0.78, metal: 0, detail: 'fabric', dScale: 260, dStr: 0.12 },   // the wrap's paper hishigami (washi)
      // the ruby eyes are the focus: brighter than any other glow at rest (the runes and the edge stay under half)
      crystal: { color: '#b4101c', emissive: '#ff1a10', glow: 0.9, env: 1.1, rough: 0.04 },
      glow_red: { emissive: '#ff2a18', glow: 2.4 },
    },
    hero: 'R_fx_eyes', crosshair: 'xh_blade', meters: ['ring', 'timing'],
    ready: { sfx: 'ready_yazi', layer: { breathMul: 1.4, jitterHz: 0.5, jitterDeg: 0.4, glowMul: 1.5, idleExtra: 'yazi_ready' } },
    // §1.17 idle tiers: below a third the rare idle (血振り, the blade flicked clean), then a glint run along the edge
    idleLayers: [{ breathMul: 1, jitterHz: 0, jitterDeg: 0, glowMul: 1, idleExtra: 'yazi_flick', every: 11 }, { breathMul: 1.15, jitterHz: 0.4, jitterDeg: 0.15, glowMul: 1.15, idleExtra: 'yazi_glint', every: 7 }],
    firstDraw: 'yazi_first', drawClip: 'yazi_draw', inspect: ['yazi_inspect'], rareInspect: 'yazi_inspect_rare',
    killFx: 'KE_SOUL', killMark: 'km_yazi', dmgSkin: 'mythic', skillSkin: 'soulrend',
    crisis: { name: '怒目', kind: 'counter', fx: 'yazi_crisis', sfx: 'yazi_crisis', flash: [1.3, 0.4, 0.34] },   // the blade draws itself, 360° (300)
    aura: { type: 'headDmg', mul: 1.1, when: 'skill', source: ['yazi_ult'] },   // 報仇: team headshots +10 % for 4 s after 裂魂
    twin: 'yazi_white', phases: ['liehun', 'bairen'],
    showcase: ['yazi_first', 'fire:3', 'alt', 'tap', 'ult', 'yazi_inspect'],
    // desktop controls for the hint card / help (the ★ dock reads special.skills)
    hints: [
      { key: 'LMB', zh: '三段斬', desc: '連點：斜斬 → 橫斬 → 突進劈（強擊退）' },
      { key: 'hold RMB', zh: '居合', desc: '按住收刀蓄力 3 段，放開一閃 6 m 貫穿；收刀瞬間被打＝完美彈反並自動一閃' },
      { key: 'Q', zh: '睚眥必報', desc: '4 秒內近戰傷害減半，反彈 200%（冷卻 18 秒）' }, { key: 'hold Q', zh: '裂魂', desc: '怨氣 100%（或 Q 再按 F）' },
      { key: 'F', zh: '檢視', desc: '按住循環' },
    ],
  },
  special: {
    type: 'yazi',
    meters: {
      ult: { max: 100, onHit: 1, onKill: 1, onParry: 15, skillFill: false, hud: 'ring', label: '怨氣', src: '命中 +1、擊殺 +3（靈光飛回刀身）、完美彈反 +15（約 35 秒）' },
      iai: { max: 100, hud: 'timing', label: '居合', color: '#ff4b2b', src: '按住右鍵收刀蓄力（白區＝彈反窗）' },   // live charge (display only; the stance's timing bar)
    },
    skills: {
      // key: desktop binding (◎ = right mouse, ★ = Q). 居合 is driven by the special itself (a held stance, not a cast)
      alt: { id: 'yazi_iai', key: 'RMB', zh: '居合', desc: '按住收刀蓄力・放開一閃 6 m 貫穿 180→520・收刀 0.25 秒內被打＝完美彈反', hold: true, cost: 0, level: 'L2' },
      tap: { id: 'yazi_vengeance', key: 'Q', zh: '睚眥必報', desc: '4 秒內近戰傷害 −50%・反彈 200%（Boss 50%）', cd: 18, dur: 4, mul: 0.5, reflect: 2, bossReflect: 0.5, level: 'L2' },
      ult: { id: 'yazi_ult', key: 'hold Q', zh: '裂魂', desc: '皮影刀客立於 6 個目標旁各斬 150・報印落下・一閃穿心 600', meter: 'ult', range: 10,
        cone: 70, max: 6, slash: 150, every: 0.1, pull: 3, final: 600, finalR: 6, invuln: 1.0, level: 'L4' },
    },
    combo: [
      { id: 'kesa', dur: 0.38, hit: 0.14, dmg: 95, r: 2.6, arc: 110, knock: 1.8, stagger: 0.5 },
      { id: 'yoko', dur: 0.38, hit: 0.14, dmg: 95, r: 2.6, arc: 110, knock: 1.8, stagger: 0.5 },
      { id: 'kabuto', dur: 0.6, hit: 0.25, dmg: 160, r: 2.6, arc: 110, knock: 5.5, stagger: 1, heavy: true, lunge: 1.5 },   // single target ≈ 257 / s
    ],
    chain: 0.4, recover: 1.6,
    // 居合: sheathe 0.15 s, perfect-parry window 0.25 s after it, charge to 1.2 s (stages 0.4 / 0.8 / 1.2), release = 一閃
    iai: { sheathe: 0.15, perfect: 0.25, stages: [0.4, 0.8, 1.2], dmg: [180, 520], range: 6, width: 1.7, time: 0.15, echoes: 3, stun: 1.5, rearm: 0.35, invuln: 0.12 },
  } });

// ---------------------------------------------------------------- 異能 啟明工坊 E01 (docs/PREMIUM_WEAPONS.md §2 E01, Appendix A)
// 春霆神戟．驚蟄: an industrial telescoping high-voltage halberd (presentation + mechanics: weapons/premium/chunting.js). It
// runs its own trigger (mode 'channel' -> special.trigger): LMB held 放電 (wind-up 0.23 s, then arcs leap to the 3
// nearest zombies within 7 m: 15 a tick, 10 ticks a second = 150/s each, 0.2 s stun; release crack 0.33 s); 雷能 is the
// magazine (120: 12/s while discharging, back at 20/s after 1 s; dry = an automatic 2 s battery swap, R swaps early);
// RMB tap 雷爆 (a thrust: a 3 m blast at 10 m or the first thing in the way, 260 + knock back 6, 15 雷能); RMB held 2 s
// and released 驚蟄落雷 (the halberd telescopes out, the crescent swings down, it is thrown as a javelin: 1.2 s after it
// lands a giant bolt falls on it — 1,600 in the middle, 400 to 6 m, 2 s stun — then it flies back; 60 雷能, 3.1 s lock);
// Q 雷樁 (a lightning rod at the crosshair for 8 s: shots from anyone into zombies within 6 m have a 20 % chance of a
// 40 arc; 20 s cooldown). Released (shop + armory, exotic frame); teammates see the third-person LOD chunting_tp.
def({ id: 'chunting', zh: '春霆神戟．驚蟄', en: 'Thunderclap Halberd', cat: 'heavy', tier: 'exotic', line: 'qiming', element: ['storm'], model: 'chunting', tpModel: 'chunting_tp',
  price: 7600, wear: 0.3, dmg: 15, head: 1, rpm: 600, mode: 'channel', mag: 120, reserve: Infinity, reload: 2.0, reloadEmpty: 2.0, draw: 0.8,
  resource: { kind: 'mana', max: 120, regen: 20, label: '雷能', color: '#c9b8ff' },
  range: [7, 7, 1], speed: 5.0, knock: 0.3, stagger: 0.3, spread: [0, 0, 0, 0, 0, 0, 0], recoil: { up: 0, side: 0, upMax: 0, recover: 12 },
  kick: { back: 0, up: 0, side: 0, roll: 0 }, sound: 'chunting', shell: null, flash: null, tracer: 0,
  // shop card bars: auto-targeting arcs at three zombies, a 1,600 thunderbolt, stuns everywhere
  shopStats: [['傷害', 0.62], ['射速', 0.9], ['範圍', 0.85], ['控場', 1.0], ['機動', 0.55]],
  // first person: carried one-handed on the pistol grip, rolled 28° out so the receiver's left face (the 雷能 LED bar, the
  // 高壓危險 plate) and the capacitor on top face the eye above the HUD block, the coils mid-right, the shaft rising
  // steeply to the upper right with sections 2-3 run in, so the head (and the crescent riding a little open) reads big in
  // the upper-right quarter, clear of the crosshair lane (chunting.js REST_EXT / BLADE_REST)
  vm: { hip: [0.125, -0.15, -0.29, 31, -19, -28] },
  chunting: {
    discharge: { windup: 0.23, release: 0.33, range: 7, targets: 3, tick: 0.1, dmg: 15, stun: 0.2, drain: 12, delay: 1, regen: 20 },
  },
  premium: {
    element: ['storm'], look: 'chunting',
    // gunmetal + insulation black (60), hazard yellow / porcelain / copper (30), violet-white arcs (§1.15.1 v1.2: not Gungnir's
    // carbon + gold line + cyan core); verdigris on the coil lugs
    palette: { base: '#2a2d33', trim: '#e0b21a', core: '#c4b2ff', rim: '#f4f0ff', mote: '#8a5cff', accent: ['#3f6a58', '#c77a52', '#f3efe6'], twin: '#ffb02e', arc: '#d6ccff' },
    // (premium.mat retunes only preset materials: the steels and the paint carry a quiet pv_metal / pv_glaze; the rubber and
    // the polymers take a pv_metal with no sweep and an invisible rim only so their values can be zoned here)
    presets: { steel: 'pv_metal', steel_bright: 'pv_metal', steel_dark: 'pv_metal', steel_blued: 'pv_metal', paint_yellow: 'pv_glaze', porcelain: 'pv_glaze', chrome: 'pv_metal', copper: 'pv_metal', glow_arc: 'pv_energy',
      rubber: 'pv_metal', polymer: 'pv_metal', polymer_grip: 'pv_metal' },
    pv: { pv_metal: { shine: 0.9, sweepT: 5 }, pv_glaze: { shine: 1.4, sweepT: 4.5, shardScale: 0, irid: 0.04, rimPower: 7 }, pv_energy: { veinFreq: 14, veinSpeed: 0.8, veinAxis: 0 } },
    pvKey: { copper: { rimPower: 14, shine: 0.5, shineTint: [1, 0.82, 0.7] }, chrome: { rimPower: 12, shine: 1.6 }, porcelain: { rimPower: 9 },
      steel: { rimPower: 16, shine: 0.45, shineTint: [0.9, 0.9, 1] }, steel_blued: { rimPower: 12, shine: 0.55, shineTint: [0.86, 0.84, 1] }, steel_dark: { rimPower: 18, shine: 0.3 }, steel_bright: { rimPower: 14, shine: 0.9 }, paint_yellow: { rimPower: 30, shine: 0.25, flashMask: 0 },
      rubber: { rimPower: 40, shine: 0, flashMask: 0 }, polymer: { rimPower: 40, shine: 0, flashMask: 0 }, polymer_grip: { rimPower: 40, shine: 0, flashMask: 0 } },
    // value zoning (refine pass): gunmetal receiver with bright edge wear, a cooler darker steel for the panels and fittings, a
    // satin spear (grind lines along it, a faint violet temper) instead of a mirror, dead-matte insulation rubber, a warmer grey
    // polymer for the grip and the cell; the hazard paint scuffs towards the rubber under it, not to bare metal
    mat: {
      steel: { color: '#565a62', rough: 0.46, metal: 0.64, detail: 'cast', dScale: 70, dStr: 0.14, env: 1.1, wear: { color: '#a9adb4', metal: 1, rough: 0.28, amount: 1 } },
      steel_dark: { color: '#33373f', rough: 0.52, metal: 0.6, detail: 'cast', dScale: 120, dStr: 0.1, wear: { color: '#8c9198', metal: 1, rough: 0.3, amount: 0.8 } },
      steel_bright: { color: '#c8ccd2', rough: 0.22, metal: 1 },
      steel_blued: { color: '#5c606e', rough: 0.42, metal: 0.78, detail: 'brushed', dScale: 90, dStr: 0.3, env: 1.0 },
      paint_yellow: { color: '#e0b21a', rough: 0.45, wear: { color: '#2a2622', metal: 0, rough: 0.8, amount: 1 } },
      rubber: { color: '#141414', rough: 0.93, metal: 0, env: 0.55, detail: 'stipple', dScale: 140, dStr: 0.32 },
      polymer_grip: { color: '#35322d', rough: 0.62, metal: 0, env: 0.8, detail: 'stipple', dScale: 160, dStr: 0.5 },
      polymer: { color: '#403d37', rough: 0.58, metal: 0, env: 0.85, detail: 'stipple', dScale: 90, dStr: 0.35 },
      patina_bronze: { color: '#3f6a58' },
      porcelain: { color: '#e9e3d6', rough: 0.2, env: 1.1 }, copper: { color: '#c77a52', rough: 0.3, cavity: 1.4, cavCol: '#3f6a58', cavMetal: 0.15 },
      obsidian: { color: '#0b0a12', rough: 0.1 },
      glow_arc: { emissive: '#c0acff', glow: 1.25 },   // ≤ HDR 3 at rest (§1.1 #2): the arcs and the charge multiply it up (chunting.js view)
      glow_white: { emissive: '#c0acff', glow: 0.55 },  // the coil cores: under half the arc glow at rest, so the capacitor stays the hero (view lifts them with the charge)
    },
    hero: 'fx_cap', crosshair: 'xh_bolt', meters: ['arc', 'segments'],
    // "ready" = 雷樁 off cooldown (no ultimate): the fanfare when it comes back, no 2.5 s nagging, a crackle every 8 s
    ready: { sfx: 'ready_chunting', remind: false, layer: { breathMul: 1.3, jitterHz: 0.5, jitterDeg: 0.3, glowMul: 1.3, idleExtra: 'chunting_ready', every: 8 } },
    idleLayers: [null, { breathMul: 1.15, jitterHz: 0.4, jitterDeg: 0.15, glowMul: 1.15, idleExtra: 'chunting_glint', every: 7 }],   // §1.17 idle tiers
    firstDraw: 'chunting_first', drawClip: 'chunting_draw', inspect: ['chunting_inspect'], rareInspect: 'chunting_inspect_rare', reload: 'chunting_reload',
    killFx: 'KE_CHAR', dmgSkin: 'chunting',   // exotic: the generic kill mark in the element colour (§1.9 #8)
    showcase: ['chunting_draw', 'fire:2', 'alt', 'throw', 'tap', 'chunting_inspect'],
    // desktop controls for the hint card / help (the ★ dock reads special.skills)
    hints: [
      { key: 'hold LMB', zh: '放電', desc: '電弧自動連到 7 m 內最多 3 隻（每隻每秒 150・暈眩）；耗雷能' },
      { key: 'RMB', zh: '雷爆', desc: '點按：往前一刺，10 m 處雷爆 260＋擊退（15 雷能）' },
      { key: 'hold RMB', zh: '驚蟄落雷', desc: '按住 2 秒（兩段）放開：擲戟，落點 1.2 秒後巨雷 1,600＋6 m 400（60 雷能）' },
      { key: 'Q', zh: '雷樁', desc: '準星處插避雷樁 8 秒：樁周 6 m 被射擊的殭屍 20% 追加電弧（冷卻 20 秒）' },
      { key: 'R', zh: '換電池', desc: '雷能停 1 秒後自己回；R 立即換滿（2 秒）' }, { key: 'F', zh: '檢視', desc: '按住循環' },
    ],
  },
  special: {
    type: 'chunting',
    meters: {
      // 雷能 is the magazine (ws.ammo): the meter only mirrors it for the arc gauge and the premium glow
      thunder: { max: 120, start: 120, hud: 'arc', label: '雷能', color: '#c9b8ff', skillFill: false, src: '放電每秒耗 12・停 1 秒後每秒回 20・耗盡自動換電池' },
      charge: { max: 2, hud: 'segments', segments: 2, label: '驚蟄', color: '#f4f0ff', src: '按住右鍵蓄力兩段' },   // live stage (display only)
    },
    skills: {
      // key: desktop binding (◎ = right mouse, ★ = Q). 雷能 costs come out of the magazine (energy), not the meters
      alt: { id: 'chunting_burst', key: 'RMB', zh: '雷爆', desc: '點按：10 m 處 3 m 雷爆 260＋擊退 6・耗 15 雷能（按住 2 秒＝驚蟄落雷）', cost: 0, energy: 15,
        range: 10, r: 3, dmg: 260, knock: 6, level: 'L2' },
      throw: { id: 'chunting_throw', key: 'hold RMB', zh: '驚蟄落雷', desc: '擲戟：落點 1.2 秒後巨雷・中心 1,600、6 m 400、暈眩 2 秒・耗 60 雷能', cost: 0, energy: 60,
        speed: 20, range: 26, delay: 1.2, back: 1.5, dmg: 1600, coreR: 2, ring: 400, ringR: 6, stun: 2, lock: 3.1, charge: 2.0, stages: [1.0, 2.0], level: 'L3' },   // (not `hold`: that makes a channel)
      tap: { id: 'chunting_rod', key: 'Q', zh: '雷樁', desc: '準星處插避雷樁 8 秒：隊友射擊樁周 6 m 的殭屍 20% 追加電弧 40', cd: 20, dur: 8, r: 6, chance: 0.2, dmg: 40, range: 25, level: 'L2' },
    },
  } });

// ---------------------------------------------------------------- 異能 暑期 E07 (docs/PREMIUM_WEAPONS.md E07, 05d §8.2, Appendix A)
// 颱風眼．斬浪: a two-handed weather-instrument greatsword (presentation + mechanics: weapons/premium/taifeng.js). The special
// drives its own attacks (mode 'melee' -> special.melee): LMB taps chain 三段斬 (橫斬 110 -> 反橫斬 110 -> 劈地 200 with a 3 m
// ring), LMB during the draw or 0.3 s after it = 破浪 (a 4 m water arc, 160); RMB held 三階蓄力 (stage 1 at 0.4 s, then one
// every 0.9 s; release: 1 = a 6 m wind blade 180, 2 = two crossed blades 180 each, 3 = 颱風眼 when 颱風能量 is full); Q 斬浪擲
// (a homing water-wind blade out to 25 m, 300, pierces, flies home; 1.5 s invulnerable; 15 s); hold Q 颱風眼 (the eye wall:
// r 5 m, 2.5 s, pulls in 3 m/s, a bolt 120 every 0.4 s, the wall collapses 700 in 8 m). WIP: hidden until refined.
def({ id: 'taifeng', zh: '颱風眼．斬浪', en: 'Typhoon-Eye Tidecleaver', cat: 'melee', tier: 'exotic', line: 'summer', element: ['storm'], model: 'taifeng', hidden: true,
  price: 7200, wear: 0.2, dmg: 110, head: 1.5, rpm: 110, mode: 'melee', mag: 0, reserve: 0, draw: 0.55,
  // shop card bars: the eye wall and the homing throw are the reach the derived melee bars miss
  shopStats: [['傷害', 0.6], ['攻速', 0.55], ['重擊', 0.85], ['範圍', 0.95], ['控場', 0.9]],
  icon: { roll: -90 },   // shop / HUD silhouette: laid along the strip, the point to the right
  range: [3.2, 3.2, 1], speed: 5.2, knock: 3, stagger: 0.6, spread: [0, 0, 0, 0, 0, 0, 0], recoil: { up: 0, side: 0, upMax: 0, recover: 10 },
  kick: { back: 0, up: 0, side: 0, roll: 0 }, sound: 'taifeng', shell: null, flash: null, tracer: 0,
  // first person: the blade rises from the lower right, its flat (the wind tunnel, the barometer) turned to the camera
  vm: { hip: [0.23, -0.23, -0.5, -8, -72, 30] },
  premium: {
    element: ['storm'], look: 'taifeng',
    // gunmetal blade + guard (60), brass instruments (30), cyan-white wind light (10); storm red only on the dial and the lamp
    palette: { base: '#4a5058', trim: '#c99a4b', core: '#bff4ff', rim: '#5fd8ff', mote: '#e8fbff', accent: ['#ff4a3a', '#c99a4b'], twin: '#ffcf6a' },
    // (premium.mat retunes only preset materials: the leathers take a pv_metal with no sweep and an invisible rim so their
    // values can be zoned here)
    presets: { glow_cyan: 'pv_energy', glow_red: 'pv_energy', brass: 'pv_metal', steel: 'pv_metal', steel_dark: 'pv_metal', steel_bright: 'pv_metal', steel_blued: 'pv_metal', alu: 'pv_metal', chrome: 'pv_metal', steel_stipple: 'pv_metal',
      porcelain: 'pv_glaze', glaze_cobalt: 'pv_glaze', glaze_vermilion: 'pv_glaze', crystal: 'pv_crystal', obsidian: 'pv_core', leather_black: 'pv_metal', leather_grain: 'pv_metal', glass_clear: 'pv_metal' },
    pv: { pv_metal: { shine: 1.0, sweepT: 5 }, pv_glaze: { shine: 1.2, sweepT: 4.5, shardScale: 0, irid: 0, rimPower: 9 },
      pv_energy: { veinFreq: 9, veinSpeed: 0.7, veinAxis: 2 }, pv_core: { coreMode: 5, coreAxis: 1, coreScale: 1 } },
    pvKey: { steel_dark: { rimPower: 16, shine: 0.6, shineTint: [0.86, 0.94, 1] }, steel: { rimPower: 16, shine: 0.45 }, steel_bright: { rimPower: 12, shine: 1.2, shineTint: [0.9, 0.97, 1] },
      alu: { rimPower: 14, shine: 0.8, shineTint: [0.88, 0.95, 1] }, chrome: { rimPower: 12, shine: 1.0, shineTint: [0.9, 0.97, 1] }, steel_stipple: { rimPower: 30, shine: 0.15 },
      steel_blued: { rimPower: 14, shine: 0.6 }, brass: { rimPower: 12, shine: 1.0 }, porcelain: { rimPower: 10 },
      leather_black: { rimPower: 40, shine: 0, flashMask: 0 }, leather_grain: { rimPower: 40, shine: 0, flashMask: 0 },
      obsidian: { coreTint: '#9fe8ff' }, glow_red: { veinAxis: 0, veinFreq: 0.01 }, glass_clear: { shine: 0.8, rimPower: 6, flashMask: 0 } },
    // value zoning: the blade steps in value edge -> spine (mirror edge bevel > polished hard steel under the lamination
    // line (chrome) > satin cladding up to the ridge (alu) > satin gunmetal flats > stippled fuller), so the face never reads
    // as one plane; a cast gunmetal guard / mast / vanes, warm satin brass (dark in its recesses), white enamel dial, oxblood
    // leather lace
    mat: {
      steel_dark: { color: '#545b64', rough: 0.32, metal: 0.92, detail: 'brushed', dScale: 22, dStr: 0.1, env: 1.0, wear: { color: '#b9bec5', metal: 1, rough: 0.2, amount: 0.7 } },
      alu: { color: '#717983', rough: 0.25, metal: 0.95, detail: 'brushed', dScale: 34, dStr: 0.06, env: 1.05, wear: { color: '#c3c8ce', metal: 1, rough: 0.18, amount: 0.5 } },
      chrome: { color: '#98a0a9', rough: 0.17, metal: 1, detail: 'brushed', dScale: 40, dStr: 0.05, env: 1.0, wear: { color: '#dde1e6', metal: 1, rough: 0.1, amount: 0.3 } },
      steel_stipple: { color: '#3b4048', rough: 0.5, metal: 0.88, detail: 'stipple', dScale: 260, dStr: 0.4, wear: { color: '#8a8d92', metal: 1, rough: 0.3, amount: 0.4 } },
      steel_bright: { color: '#d7dbe0', rough: 0.12, metal: 1, detail: 'brushed', dScale: 40, dStr: 0.04 },
      steel: { color: '#555d68', rough: 0.38, metal: 0.84, detail: 'cast', dScale: 90, dStr: 0.1, env: 1.05, wear: { color: '#b3b8c0', metal: 1, rough: 0.26, amount: 1 } },
      steel_blued: { color: '#1c2436', rough: 0.25, metal: 0.9, detail: 'flat' },
      brass: { color: '#c9a35a', rough: 0.24, metal: 1, detail: 'brushed', dScale: 50, dStr: 0.06, cavity: 1.25, cavCol: '#3a2a10', wear: { color: '#f0d49a', metal: 1, rough: 0.15, amount: 0.6 } },
      porcelain: { color: '#efece4', rough: 0.18, env: 1.2 }, glaze_cobalt: { color: '#2a56b8' }, glaze_vermilion: { color: '#c8302a' },
      leather_black: { color: '#17130f', rough: 0.6, metal: 0, env: 0.7 }, leather_grain: { color: '#3a2216', rough: 0.66, metal: 0, env: 0.75, dScale: 210, dStr: 0.8 },
      crystal: { color: '#3a0d0b', rough: 0.05, env: 1.4 },
      obsidian: { color: '#05080c', rough: 0.08 },
      glass_clear: { env: 1.0, opacity: 0.2 },   // the wind-tunnel panes: a faint sheen over the core, not a mirror
      glow_cyan: { emissive: '#8feaff', glow: 2.6 },   // ≤ HDR 3 at rest (§1.1 #2): the charge and skills multiply it up (taifeng.js view)
      glow_red: { emissive: '#ff3a26', glow: 6 },
    },
    hero: 'fx_core', crosshair: 'xh_typhoon', meters: ['dial', 'segments'],
    ready: { sfx: 'ready_taifeng', layer: { breathMul: 1.4, jitterHz: 0.5, jitterDeg: 0.6, glowMul: 1.5, idleExtra: 'taifeng_ready' } },
    idleLayers: [null, { breathMul: 1.15, jitterHz: 0.4, jitterDeg: 0.2, glowMul: 1.15, idleExtra: 'taifeng_gust', every: 7 }],   // §1.17 idle tiers
    firstDraw: 'taifeng_first', drawClip: 'taifeng_draw', inspect: ['taifeng_inspect'], rareInspect: 'taifeng_inspect_rare',
    killFx: 'KE_GALE', killMark: 'km_taifeng', dmgSkin: 'typhoon', skillSkin: 'typhoon',
    showcase: ['taifeng_first', 'fire:3', 'alt', 'tap', 'ult', 'taifeng_inspect'],
    // desktop controls for the hint card / help (the ★ dock reads special.skills)
    hints: [
      { key: 'LMB', zh: '三段斬', desc: '點按連斬：橫斬 → 反橫斬 → 劈地（3 m 震環）' }, { key: 'LMB', zh: '破浪', desc: '拔劍途中或拔出後 0.3 秒內按：4 m 拔出斬 160' },
      { key: 'hold RMB', zh: '三階蓄力', desc: '放開：1 階風刃 6 m／2 階交叉雙風刃／3 階（颱風能量滿）颱風眼' },
      { key: 'Q', zh: '斬浪擲', desc: '擲出追蹤水風之刃 25 m・300・貫穿・飛回；1.5 秒無敵（冷卻 15 秒）' },
      { key: 'hold Q', zh: '颱風眼', desc: '颱風能量 100%（或 Q 再按 F）：眼牆拉扯、落雷、崩落 700' }, { key: 'F', zh: '檢視', desc: '按住循環' },
    ],
  },
  special: {
    type: 'taifeng',
    meters: {
      ult: { max: 100, source: 'damage', per: 5200, skillFill: false, hud: 'dial', label: '颱風能量', color: '#5fd8ff', src: '命中累積（約 40 秒）' },
      charge: { max: 3, hud: 'segments', segments: 3, label: '蓄力', color: '#bff4ff', src: '按住右鍵蓄力' },   // live stage (display only)
    },
    skills: {
      // key: desktop binding (◎ = right mouse, ★ = Q). 三階蓄力 is a held channel driven by the special
      alt: { id: 'taifeng_gale', key: 'hold RMB', zh: '三階蓄力', desc: '放開：1 階風刃 6 m 180／2 階交叉雙風刃 各 180／3 階颱風眼', hold: true, cost: 0, level: 'L1' },
      tap: { id: 'taifeng_throw', key: 'Q', zh: '斬浪擲', desc: '追蹤水風之刃 25 m・300・貫穿・飛回・1.5 秒無敵', cd: 15, range: 25, speed: 26, dmg: 300, invuln: 1.5, level: 'L2' },
      ult: { id: 'taifeng_eye', key: 'hold Q', zh: '颱風眼', desc: '12 m 內升起眼牆：拉扯 3 m/s、每 0.4 秒落雷 120、崩落 8 m 700', meter: 'ult',
        range: 12, r: 5, h: 7, wall: 2.5, pull: 3, boltEvery: 0.4, boltDmg: 120, collapseR: 8, collapseDmg: 700, level: 'L4' },
    },
    combo: [
      { id: 'sweep', dur: 0.48, hit: 0.15, dmg: 110, r: 3.2, arc: 150, knock: 3, stagger: 0.6 },
      { id: 'backsweep', dur: 0.48, hit: 0.17, dmg: 110, r: 3.2, arc: 150, knock: 3, stagger: 0.6 },
      { id: 'cleave', dur: 0.8, hit: 0.33, dmg: 200, r: 3, reach: 1.7, knock: 6, stagger: 1, heavy: true },
    ],
    chain: 0.45, recover: 1.4,
    drawSlash: { window: 0.3, dur: 0.42, hit: 0.18, dmg: 160, r: 4, arc: 170, knock: 5 },
    gale: { stages: [0.4, 1.3, 2.2], range: 6, speed: 30, dmg: 180, width: 2.4, cross: 18 },
  } });

// ---------------------------------------------------------------- 神兵 啟明工坊旗艦 M04 (docs/PREMIUM_WEAPONS.md M04, Appendix A)
// 焰樞．破限 Pyrecore Unbound: a heavy bullpup forge-core cannon (presentation + mechanics: weapons/premium/yanshu.js, FX pieces
// yanshu_fx.js, models tools/assets/weapons/yanshu.mjs + yanshu_drone.mjs). LMB 樞彈: 300 rpm x 40, and 0.15 s after a hit
// the round bursts on the target (2.5 m, 35). RMB 爐環 (a 4 m 360° fire ring, 120 + knockback); RMB again within 1.2 s
// 吸爐震擊 (an 8 m 50° cone pulled 4 m in, then the ram strikes a 160 shock wave): both done = 超載 8 s (fins up into a heat
// tower, the doors open, the ram out 60 mm, the core white-hot): LMB is then a molten beam (300/s, pierces 2), RMB the 樞錘
// 衝撞 (an 8 m dash in 0.35 s, invulnerable to everything, 300 in 4 m where it lands). R R (or hold Q) at 樞能 100 % (fills
// in 40 s, +2 % a kill) = 破限: the seal flies off, 14 s of overload, the beam x1.5, the drones fire thin beams, and for the
// last 2 s both drones dock beside the ram for a 30 m triple beam (900/s). Passive: two falcon drones over the shoulders
// shoot the nearest zombie within 15 m (6 x 18 a second each, x1.6 when one is within 4 m). Crisis 爐壁護盾: the six fins
// form a hexagonal furnace wall that takes the killing blow and bursts (300 in 4 m). Aura 分機: during 破限 the two
// teammates nearest the caster get a mini drone for 10 s. WIP: hidden until the refine stage releases it.
def({ id: 'yanshu', zh: '焰樞．破限', en: 'Pyrecore Unbound', cat: 'heavy', tier: 'mythic', line: 'qiming', element: ['cyber'], model: 'yanshu', tpModel: 'yanshu_tp', hidden: true,
  price: 9400, wear: 0.25, dmg: 40, head: 3, rpm: 300, mode: 'auto', mag: 30, reserve: Infinity, reload: 2.4, reloadEmpty: 2.4, draw: 0.7,
  pen: 1.5, range: [40, 100, 0.8], speed: 4.6, knock: 2.4, stagger: 0.55,
  // a heavy single-shot rhythm: the aim climbs little (recoil.up) and settles between shots; the weight is the 2.5° view punch,
  // the viewmodel kick and the ram's recoil (premium/yanshu.js onFire)
  spread: [0.9, 0.3, 1.2, 5, 0.22, 2.2, 9], recoil: { up: 0.9, side: 0.3, upMax: 3.6, recover: 16, first: 1, pause: 0.7, pattern: [0, 0.25, -0.3, 0.2, -0.2] },
  kick: { back: 0.05, up: 5.5, side: 1.2, roll: 2.4 },
  shopStats: [['傷害', 0.7], ['射速', 0.45], ['範圍', 0.85], ['控場', 0.8], ['機動', 0.75]],
  // first person: further out and lower than a rifle, rolled 12° out so the furnace's left flank (the window, the gauge, the
  // hydraulic lines) faces the eye in the lower right; the fin stack mid right, the ram well right of the crosshair
  vm: { hip: [0.165, -0.222, -0.45, 2.2, -1.5, -12] },
  // sound: its own set (yanshu_close / _tail / _mech, a later audio stage); the stock .50 under the forge overtone until then
  sound: 'yanshu', shell: null, flash: 'rifle', tracer: 0,
  // the gun's own fireball stays small: the square forge crown out of the ram face (yanshu.js crown()) is the muzzle look; every
  // round traces a short orange-white streak
  fx: { flashScale: 0.35, ramp: 7, tracer: { color: [6, 3.4, 1.1], glow: [1.4, 0.55, 0.12], width: 0.012, length: 2.2 }, tracerEvery: 1 },
  premium: {
    element: ['cyber'], look: 'yanshu',
    // white ceramic armour + gunmetal (60), safety orange + brass (30), molten core (10); hologram cyan only on the drones' eyes
    // the rim is a warm molten edge on the gun (§1.6 cyber rim cyan is only the drones' eyes and the holograms: holo)
    palette: { base: '#e6e3dc', trim: '#e2571a', core: '#ffb02e', rim: '#ff9a3a', mote: '#ffcf7a', accent: ['#2a2d33', '#121316', '#c99a4b'], twin: '#6fe3ff', hot: '#fff1d0' }, holo: '#3fd8ff',
    // (premium.mat retunes only preset materials: the steels, the paint and the polymers carry a quiet pv_metal / pv_glaze)
    presets: { ceramic_armor: 'pv_metal', black_chrome: 'pv_metal', steel: 'pv_metal', steel_dark: 'pv_metal', steel_bright: 'pv_metal', brass: 'pv_metal',
      paint_safety: 'pv_glaze', paint_red: 'pv_glaze', polymer_grip: 'pv_metal', polymer: 'pv_metal', rubber: 'pv_metal',
      glow_orange: 'pv_energy', glow_vermilion: 'pv_energy', obsidian: 'pv_core' },
    pv: { pv_metal: { shine: 1.0, sweepT: 5, shineTint: [1, 0.95, 0.88] }, pv_glaze: { shine: 0.5, sweepT: 4.5, shardScale: 0, irid: 0, rimPower: 12 },
      pv_energy: { veinFreq: 10, veinSpeed: 0.55 }, pv_core: { coreMode: 3, coreScale: 1.5 } },
    // the white ceramic takes the §1.5.3 sweep as a soft satin glint; only the safety paint flashes (pFlash: the unbound
    // stripes); the dark parts keep a tight rim so they never read chrome-blue
    pvKey: { ceramic_armor: { rimPower: 7, shine: 0.75, shineW: 3000, flashMask: 0 }, black_chrome: { rimPower: 10, shine: 1.6, flashMask: 0 }, steel: { rimPower: 16, shine: 0.45, flashMask: 0 },
      steel_dark: { rimPower: 18, shine: 0.35, flashMask: 0 }, steel_bright: { rimPower: 12, shine: 1.1, flashMask: 0 }, brass: { rimPower: 12, shine: 0.9, shineTint: [1, 0.85, 0.55], flashMask: 0 },
      paint_safety: { flashMask: 1 }, paint_red: { flashMask: 0 }, polymer_grip: { rimPower: 40, shine: 0, flashMask: 0 }, polymer: { rimPower: 40, shine: 0, flashMask: 0 },
      rubber: { rimPower: 40, shine: 0, flashMask: 0 }, obsidian: { coreTint: '#ff7a1a', coreScale: 1.6, flashMask: 0 },
      glow_orange: { flashMask: 0 }, glow_vermilion: { veinFreq: 0.01, flashMask: 0 } },
    mat: {
      // glazed ceramic: a satin clear-coat sheen, not matte plastic
      ceramic_armor: { color: '#e2dfd7', rough: 0.3, env: 1.15, wear: { color: '#a9a499', metal: 0, rough: 0.6, amount: 0.5 } },
      steel: { color: '#4a4e55', rough: 0.44, metal: 0.7, detail: 'cast', dScale: 70, dStr: 0.14, env: 1.05, wear: { color: '#a9adb4', metal: 1, rough: 0.28, amount: 1 } },
      rubber: { color: '#45474c', rough: 0.82, detail: 'stipple', dScale: 120, dStr: 0.3 },   // grey: pads and ribs read against the black grips
      steel_dark: { color: '#2b2e34', rough: 0.5, metal: 0.66, detail: 'cast', dScale: 110, dStr: 0.1, wear: { color: '#8c9198', metal: 1, rough: 0.3, amount: 0.8 } },
      black_chrome: { color: '#141518', rough: 0.22, metal: 0.9, detail: 'brushed', dScale: 40, dStr: 0.08, wear: { color: '#9a9ca0', metal: 1, rough: 0.2, amount: 0.6 } },
      paint_safety: { color: '#e2571a', rough: 0.42, wear: { color: '#8f9296', metal: 1, rough: 0.3, amount: 1 } },
      obsidian: { color: '#070605', rough: 0.1 },
      glow_orange: { emissive: '#ff9a2e', glow: 2.2 },     // ≤ HDR 3 at rest (§1.1 #2): the core and the slits; skills multiply it (yanshu.js view)
      glow_vermilion: { emissive: '#ff5a24', glow: 3.0 },  // the fins' heat inserts: dimmed to ~0 at rest by the view, white-hot in overload
    },
    hero: 'fx_core', crosshair: 'xh_tri', meters: ['arc', 'ring'],
    ready: { sfx: 'ready_yanshu', layer: { breathMul: 1.4, jitterHz: 0.5, jitterDeg: 0.5, glowMul: 1.5, idleExtra: 'yanshu_ready' } },
    idleLayers: [null, { breathMul: 1.15, jitterHz: 0.4, jitterDeg: 0.2, glowMul: 1.15, idleExtra: 'yanshu_vent', every: 7 }],   // §1.17 idle tiers
    firstDraw: 'yanshu_first', drawClip: 'yanshu_draw', inspect: ['yanshu_inspect'], rareInspect: 'yanshu_inspect_rare',
    reload: 'yanshu_reload', rareReload: 'yanshu_reload_rare', rareReloadEvery: 8,
    killFx: 'KE_FORGE', killMark: 'km_yanshu', dmgSkin: 'yanshu',
    crisis: { name: '爐壁護盾', kind: 'counter', r: 4, fx: 'yanshu_crisis', sfx: 'yanshu_crisis', flash: [2.6, 1.5, 0.6] },
    aura: { type: 'drone', when: 'skill', radius: 30, source: ['yanshu_ult'] },
    twin: 'yanshu_zero', phases: ['duanhuo', 'lengduan'],
    showcase: ['yanshu_first', 'fire:3', 'alt', 'alt2', 'beam', 'ram', 'ult', 'yanshu_inspect'],
    // desktop controls for the hint card / help (the ★ dock reads special.skills)
    hints: [
      { key: 'LMB', zh: '樞彈', desc: '命中 0.15 秒後在目標處引爆 2.5 m・35；超載時改成熔流光束（每秒 300・貫穿 2）' },
      { key: 'RMB', zh: '爐環', desc: '360° 火環 4 m・120＋擊退' }, { key: 'RMB ×2', zh: '吸爐震擊', desc: '1.2 秒內再按：前方錐形拉近 4 m、震波 160；兩段完成＝超載 8 秒' },
      { key: 'RMB', zh: '樞錘衝撞', desc: '超載中：0.35 秒前衝 8 m、全程無敵、落點 4 m・300' },
      { key: 'R R', zh: '破限', desc: '樞能 100%：連點兩下 R（或長按 Q）・超載 14 秒・最後 2 秒三點巨光束' },
      { key: 'R', zh: '換彈' }, { key: 'F', zh: '檢視', desc: '按住循環' },
    ],
  },
  special: {
    type: 'yanshu',
    meters: {
      ult: { max: 100, regen: 2.5, onKill: 2, hud: 'arc', label: '樞能', color: '#ffb02e', src: '每 40 秒自然充滿・擊殺 +2%' },
      over: { max: 1, hud: 'ring', label: '超載', color: '#fff1d0', src: '爐環＋吸爐震擊（1.2 秒內）' },   // live overload time left (display only)
    },
    skills: {
      // key: desktop binding (◎ = right mouse, ★ = Q). The RMB press is routed by the special (ring -> inhale, or the ram in overload)
      alt: { id: 'yanshu_ring', key: 'RMB', zh: '爐環', desc: '360° 火環 4 m・120＋擊退（1.2 秒內再按＝吸爐震擊）', cd: 0.6, r: 4, dmg: 120, knock: 7, level: 'L2' },
      alt2: { id: 'yanshu_inhale', key: 'RMB ×2', zh: '吸爐震擊', desc: '前方 8 m 50° 拉近 4 m・震波 160・進入超載 8 秒', range: 8, cone: 50, pull: 4, dmg: 160, wave: 6, level: 'L2' },
      ram: { id: 'yanshu_ram', key: 'RMB（超載）', zh: '樞錘衝撞', desc: '0.35 秒前衝 8 m・全程無敵・落點 4 m 300', cd: 1.2, range: 8, time: 0.35, r: 4, dmg: 300, knock: 8, level: 'L2' },
      ult: { id: 'yanshu_ult', key: 'R R', zh: '破限', desc: '超載 14 秒・光束寬 ×1.5・僚機改射光束・最後 2 秒三點巨光束每秒 900', meter: 'ult', level: 'L3' },
    },
    passive: { drones: { range: 15, rate: 6, dmg: 18, near: 4, nearMul: 1.6 } },
  },
  // mechanics numbers the special reads (premium/yanshu.js) [建議值]
  yanshu: {
    burst: { delay: 0.15, r: 2.5, dmg: 35 },
    combo: 1.2, overload: 8, vent: 5,                              // ring -> inhale window, overload s, cooling lock after it (RMB)
    beam: { dps: 300, pierce: 2, range: 40, tick: 0.1, width: 0.2 },
    ult: { dur: 14, beamMul: 1.5, pierce: 3, giant: { dps: 900, range: 30, dur: 2, r: 0.9 }, droneDps: 108, mini: { dur: 10, n: 2 } },
  } });

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
