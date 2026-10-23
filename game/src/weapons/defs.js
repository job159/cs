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
  // held back from the shop: holding fire switches it to the sidearm after a few shots (2026-10-24 release check);
  // its twin guiche (same handler) works — unhide once fixed
  hidden: true,
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
// blade sweeps 220°), hold Q 天劍 (a 14 m star sword falls from the sky). Hidden until the refine stage releases it.
def({ id: 'starsword', zh: '星河．斬嶽', en: 'Xinghe Peakcleaver', cat: 'melee', tier: 'mythic', line: 'xingxiu', element: ['cosmic'], model: 'starsword',
  hidden: true, price: 7600, wear: 0.15, dmg: 110, head: 1.5, rpm: 100, mode: 'melee', mag: 0, reserve: 0, draw: 0.6,
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
      chrome: 'pv_metal', brass: 'pv_metal', black_chrome: 'pv_metal', leather_pebble: 'pv_metal',
      glaze_cobalt: 'pv_glaze', glaze_inkteal: 'pv_glaze', glaze_turquoise: 'pv_glaze', glaze_aubergine: 'pv_glaze', porcelain: 'pv_glaze', crystal: 'pv_crystal', obsidian: 'pv_core' },
    pv: { pv_metal: { shine: 0.9, sweepT: 5 }, pv_glaze: { shine: 0.7, sweepT: 4.5, shardScale: 300, groutW: 0.03, grout: '#0c1634', groutMetal: 0 },
      pv_energy: { veinFreq: 10, veinSpeed: 0.6, veinAxis: 0 }, pv_core: { coreMode: 0, coreScale: 1.4 } },
    // the projected edge reads star-white-blue (glow_arc is violet-white)
    mat: {
      glow_arc: { emissive: '#bcd2ff', glow: 3.6 }, glow_blue: { emissive: '#6f8dff', glow: 2.4 },
      steel_blued: { color: '#34405f', rough: 0.36, metal: 0.85, env: 1.0, dStr: 0.1 },
      chrome: { color: '#c9ced6', rough: 0.08, metal: 1, detail: 'brushed', dScale: 14, dStr: 0.03 },
      brass: { color: '#8d8167', rough: 0.2, metal: 1, detail: 'brushed', dScale: 30, dStr: 0.05 },
      steel_bright: { color: '#4c5071', rough: 0.22, metal: 1, dStr: 0.05 },
      black_chrome: { color: '#222a3f', rough: 0.14, metal: 1, detail: 'brushed', dScale: 34, dStr: 0.06 },
      leather_pebble: { color: '#d3c9b0', rough: 0.5, metal: 0, detail: 'stipple', dScale: 120, dStr: 0.85 },
      glaze_cobalt: { color: '#2449a6' }, glaze_inkteal: { color: '#15255c' }, glaze_turquoise: { color: '#3d7fd2' }, glaze_aubergine: { color: '#3e2c78' }, porcelain: { color: '#eef0f6' },
      crystal: { color: '#86aef0', env: 1.3 },
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
      star: { max: 100, start: 40, onHit: 2, onKill: 4, onParry: 15, skillFill: false, hud: 'arc', label: '星能', src: '每刀每個命中 +2、擊殺 +4、完美格擋 +15' },
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
// Hidden until the refine stage releases it.
def({ id: 'sunbow', zh: '彤弓．落陽', en: 'Tonggong Sunfall', cat: 'heavy', tier: 'mythic', line: 'sheri', element: ['inferno', 'radiant'], model: 'sunbow',
  hidden: true, price: 8400, wear: 0.15, dmg: 460, head: 3, rpm: 40, mode: 'bow', mag: 9, reserve: Infinity, reload: 1.0, reloadEmpty: 1.0, draw: 0.7,
  pen: 8, range: [999, 999, 1], speed: 5.0, knock: 3.6, stagger: 1,
  // the spread is the draw's: hip 0 + a bloom the special sets every frame (2.2° undrawn -> 0° at 貫日); move / air add
  spread: [0, 0, 1.2, 4, 0, 9, 0], recoil: { up: 0, side: 0, upMax: 0, recover: 14 }, kick: { back: 0, up: 0, side: 0, roll: 0 },
  sound: 'sunbow', shell: null, flash: null, tracer: 0,
  // first person: vm.hip = the aimed pose (bow hand left of the crosshair, canted right, the arrow rising to the centre);
  // vm.rest = undrawn (lowered to the lower left, more cant): premium/sunbow.js blends them with the draw
  vm: { hip: [-0.16, -0.13, -0.72, 10, 20, -6], rest: [-0.3, -0.2, -0.62, -2, 24, 12] },
  bow: {
    stages: [0.35, 0.85, 1.45], dmg: [55, 120, 240, 460], speed: [60, 85, 110, 150], pierce: [1, 2, 3, 8], burn: [0, 0, 1, 3],
    spread: [2.2, 0.9, 0.35, 0], gravity: [5, 3, 1.5, 0], knock: [0.8, 1.4, 2.4, 3.6], stagger: [0.3, 0.6, 0.9, 1], headMul: 3,
    renock: 0.32, tire: 3, tireRate: 0.4, tireMax: 1.5, regen: { delay: 0.6, every: 0.7 }, moveMul: 0.85, pin: 1.2,
    burnDps: 20, burnDur: 3, burnMax: 3, fan: { n: 5, deg: 14, mul: 0.55, cost: 3, cd: 0.7 },
  },
  premium: {
    element: ['inferno', 'radiant'], look: 'sunbow',
    palette: { base: '#9a1420', trim: '#e3b04b', core: '#ffd36b', rim: '#ff7a2f', mote: '#fff1b8', accent: ['#2f8f4e'], twin: '#cfe6ff', ember: '#ffb43a' },
    presets: { lacquer_red: 'pv_glaze', glaze_jade: 'pv_glaze', gold: 'pv_metal', gold_leaf: 'pv_metal', bronze_aged: 'pv_metal',
      glow_sun: 'pv_energy', glow_gold: 'pv_energy', glow_vermilion: 'pv_energy', crystal: 'pv_crystal' },
    // red lacquer: sweep + a tight warm rim, no shards; the 日珠 burns gold-orange from inside
    pv: { pv_glaze: { shine: 1.7, sweepT: 5, shardScale: 0, irid: 0, rimPower: 5 }, pv_metal: { shine: 1.4, sweepT: 5.5 }, pv_energy: { veinFreq: 12, veinSpeed: 0.5 } },
    // the red lacquer carries a fine 斷紋 crackle (one-colour shards = crackle under the glaze)
    pvKey: { crystal: { coreTint: '#ffb43a' }, glaze_jade: { irid: 0.08 },
      lacquer_red: { shardScale: 115, shardPal: ['#9a1420', '#9a1420', '#9a1420', '#9a1420'], grout: '#3a0c0e', groutW: 0.05 } },
    // the 日珠 burns from inside (emissive: clip glow events and the draw drive it with the gun's other glows)
    // bronze a shade lighter than the stock aged bronze (the cast relief must read under neutral light); the nine sun
    // cores rest dimmer so the cup metalwork reads before the glow
    mat: { crystal: { color: '#ffcf7a', emissive: '#ff8a1e', glow: 0.75 }, bronze_aged: { color: '#86663a', dScale: 78, dStr: 0.13 }, glow_gold: { glow: 4.5 } },
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
