// Weapon definitions (realistic standard-issue arsenal). Special / premium weapons extend these in
// game/src/weapons/specials/*.js and register through registerWeapon().
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

// ---------------------------------------------------------------- melee
def({ id: 'knife', zh: '戰術刀', en: 'Field Knife', cat: 'melee', price: 0, dmg: 55, head: 2, rpm: 140, mode: 'melee', heavy: { dmg: 140, time: 0.9, range: 2.0 },
  mag: 0, reserve: 0, range: [1.9, 1.9, 1], speed: 5.6, knock: 2.2, stagger: 0.5, spread: [0, 0, 0, 0, 0, 0, 0], recoil: { up: 0, side: 0, upMax: 0, recover: 10 },
  kick: { back: 0, up: 0, side: 0, roll: 0 }, sound: 'knife', shell: null, flash: null, tracer: 0 });

export const WEAPONS = Object.fromEntries(W.map((w) => [w.id, w]));
export function registerWeapon(w) { WEAPONS[w.id] = w; return w; }
export function slotOf(w) { return w.slot ?? CATS[w.cat]?.slot ?? 1; }
