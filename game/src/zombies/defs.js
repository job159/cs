// Zombie archetypes. HP values are wave-1 Normal difficulty for ONE player; the match scales them by
// round, difficulty and player count. Speeds in m/s. knockRes: 0 = full knockback, 1 = immune.
// anim: clip names from game/assets/zombies/anims.glb (see docs/ZOMBIE_ANIMS.md); locomotion plays at the clip's own
// treadmill speed (anims.glb userData.clips[name].speed x the model's leg length, Zombie._locoRate), `nominal` = the
// fallback ground speed (m/s) at timeScale 1 for clips without one; idle: played while the zombie stands still.
// anim.loco (optional): { min: lowest playback rate of the locomotion clip (default 0.45), still: below this ground
// speed (m/s, default 0.12) for stillT s (default 0.35) the idle clip takes over }.
// anim.over: per-type overrides of one-shot clips (Zombie.playOnce): 'other' plays another clip, null none,
// { from (s), speed, fade } tweaks it.
export const ZOMBIES = {
  walker: {
    zh: '行屍', models: ['walker_a', 'walker_b', 'walker_c'], hp: 150, walk: [0.9, 1.4], run: 3.4, runChance: 0.15,
    dmg: 12, atkRange: 1.45, atkTime: 1.15, atkHit: 0.45, knockRes: 0, staggerRes: 0, radius: 0.32, height: 1.75,
    anim: { walk: ['walk_a', 'walk_b', 'walk_c', 'walk_limp'], run: 'run', attack: ['attack_a', 'attack_b'], idle: ['idle', 'idle_b'] },
    nominal: { walk: 1.0, run: 3.6 }, money: 100, xp: 10, voice: 'zombie',
  },
  runner: {
    zh: '狂奔者', models: ['runner'], hp: 110, walk: [4.6, 5.4], run: 5.4, runChance: 1,
    dmg: 9, atkRange: 1.4, atkTime: 0.8, atkHit: 0.35, knockRes: 0.1, staggerRes: 0, radius: 0.3, height: 1.75,
    anim: { walk: ['sprint'], run: 'sprint', attack: ['attack_lunge', 'attack_a'], idle: ['idle'] },
    nominal: { walk: 5.0, run: 5.0 }, money: 150, xp: 14, voice: 'runner',
  },
  brute: {
    zh: '重裝屠夫', models: ['brute'], hp: 1400, walk: [1.7, 2.1], run: 2.4, runChance: 0, charge: { speed: 7.5, range: [6, 18], cd: 7, dmg: 35, knock: 9 },
    dmg: 32, atkRange: 2.1, atkTime: 1.6, atkHit: 0.55, knockRes: 0.85, staggerRes: 0.7, radius: 0.6, height: 2.3, scale: 1,
    anim: { walk: ['walk_a'], run: 'run', attack: ['attack_b'], idle: ['idle'] }, nominal: { walk: 1.1, run: 3.6 },
    money: 600, xp: 60, voice: 'brute', armor: 0.5,
  },
  spitter: {
    zh: '酸液噴吐者', models: ['spitter'], hp: 160, walk: [1.5, 1.9], run: 3.2, runChance: 0, keepAway: [9, 16], spit: { cd: 3.2, dmg: 14, speed: 16, pool: 3 },
    dmg: 10, atkRange: 1.4, atkTime: 1.1, atkHit: 0.45, knockRes: 0, staggerRes: 0, radius: 0.3, height: 1.7,
    // walk_hurry: walk_a's lurch quickened for 1.5-1.9 m/s (walk_b quickened that far read as a deep-kneed speed-walk)
    anim: { walk: ['walk_hurry'], run: 'run', attack: ['attack_a'], idle: ['idle'], spit: 'spit' }, nominal: { walk: 1.0, run: 3.6 },
    money: 250, xp: 20, voice: 'spitter',
  },
  bloater: {
    zh: '爆裂者', models: ['bloater'], hp: 260, walk: [0.9, 1.1], run: 1.6, runChance: 0, explode: { radius: 4.5, dmg: 40, poison: 6, fuseNear: 2.2 },
    dmg: 8, atkRange: 1.5, atkTime: 1.4, atkHit: 0.5, knockRes: 0.4, staggerRes: 0.3, radius: 0.5, height: 1.8,
    anim: { walk: ['walk_limp'], run: 'walk_a', attack: ['attack_b'], idle: ['idle'] }, nominal: { walk: 0.8, run: 1.0 },
    money: 250, xp: 20, voice: 'bloater',
  },
  crawler: {
    // leap.windup: the crouch-load before the jump (s; the pounce clip's 0-0.2 s at x0.88) -- CSO-style telegraph
    zh: '爬牆者', models: ['crawler'], hp: 140, walk: [3.8, 4.4], run: 4.6, runChance: 1, leap: { range: [3, 8], speed: 9, cd: 4, dmg: 14, windup: 0.23 },
    dmg: 10, atkRange: 1.3, atkTime: 0.9, atkHit: 0.4, knockRes: 0.1, staggerRes: 0, radius: 0.32, height: 0.8, crawl: true,
    anim: {
      // its own quadruped set (docs/ZOMBIE_ANIMS.md): gallop on hands and feet, lunging swipe, pounce, face-down death
      walk: ['crawl_quad'], run: 'crawl_quad', attack: ['crawl_quad_attack'], idle: ['idle_quad'], leap: 'pounce',
      // one gait (a 4.6 m/s gallop): it never drops below x0.6 (slower read as a slow-motion gallop) and settles into
      // the crouched idle soon after it slows under 0.6 m/s
      loco: { min: 0.6, still: 0.6, stillT: 0.12 },
      // on all fours: the library's hit / stagger / knockdown clips are upright (the flinch spring still plays on top),
      // every death is the collapse from all fours, and the pounce plays whole at x0.88: its crouch-load is the
      // leap's wind-up (leap.windup), the brain launches at its takeoff and the claws strike the floor (events.land)
      // as the 0.56 s jump arc lands
      over: {
        stagger: null, hit_front: null, hit_back: null, hit_left: null, hit_right: null, knockdown: null, get_up: null,
        death_back: 'death_quad', death_front: 'death_quad', leap: 'pounce', pounce: { speed: 0.88, fade: 0.1 },
      },
    },
    nominal: { walk: 4.6, run: 4.6 },
    money: 200, xp: 16, voice: 'crawler',
  },
  screamer: {
    zh: '尖嘯者', models: ['screamer'], hp: 300, walk: [1.2, 1.4], run: 2.6, runChance: 0, keepAway: [10, 18],
    scream: { cd: 11, radius: 16, slow: 0.45, slowTime: 2.2 }, heal: { radius: 8, perSec: 18, haste: 1.3 },
    dmg: 10, atkRange: 1.4, atkTime: 1.2, atkHit: 0.45, knockRes: 0.2, staggerRes: 0, radius: 0.3, height: 1.8,
    anim: { walk: ['walk_stalk'], run: 'run', attack: ['attack_a'], idle: ['idle_b'], scream: 'scream' }, nominal: { walk: 1.1, run: 3.6 },
    money: 400, xp: 30, voice: 'screamer',
  },
  riot: {
    zh: '防暴屍', models: ['riot'], hp: 450, walk: [1.3, 1.6], run: 3.0, runChance: 0.2, frontArmor: { reduce: 0.8, cone: 0.55, headReduce: 0.5 },
    dmg: 20, atkRange: 1.5, atkTime: 1.25, atkHit: 0.5, knockRes: 0.5, staggerRes: 0.4, radius: 0.36, height: 1.82,
    anim: { walk: ['walk_a', 'walk_hurry'], run: 'run', attack: ['attack_a', 'attack_b'], idle: ['idle'] }, nominal: { walk: 1.0, run: 3.6 },
    money: 350, xp: 26, voice: 'zombie', armor: 1.5,
  },
};

// ---- bosses (Zombie subclasses with a brain; see game/src/zombies/brains/)
ZOMBIES.butcher = {
  zh: '屠宰者', boss: true, brain: 'butcher', models: ['boss_butcher', 'brute'], fallbackScale: 1.85, hp: 12000,
  walk: [2.4, 2.6], run: 3.6, runChance: 0, dmg: 30, atkRange: 3, atkTime: 1.4, atkHit: 0.5, knockRes: 1, staggerRes: 1,
  radius: 1.0, height: 4.0, anim: { walk: ['walk_a'], run: 'run', attack: ['attack_b'], idle: ['idle'] }, nominal: { walk: 1.1, run: 3.6 },
  money: 3000, xp: 400, voice: 'brute',
};
ZOMBIES.colossus = {
  zh: '災厄巨像', boss: true, brain: 'colossus', models: ['boss_colossus', 'brute'], fallbackScale: 3.2, hp: 20000,
  walk: [1.6, 1.9], run: 3.0, runChance: 0, dmg: 34, atkRange: 5, atkTime: 1.7, atkHit: 0.5, knockRes: 1, staggerRes: 1,
  radius: 1.8, height: 7.0, anim: { walk: ['walk_a'], run: 'run', attack: ['attack_b'], idle: ['idle'] }, nominal: { walk: 1.0, run: 3.6 },
  money: 8000, xp: 1200, voice: 'brute',
};

/** Default hitboxes for the game_engine skeleton if a model doesn't provide its own extras. */
export const DEFAULT_HITBOXES = {
  head: ['head', 0.13, null],
  neck: ['neck_01', 0.07, 'head'],
  chest: ['spine_03', 0.2, 'neck_01'],
  belly: ['spine_01', 0.19, 'spine_03'],
  pelvis: ['pelvis', 0.18, 'spine_01'],
  upperarm_l: ['upperarm_l', 0.07, 'lowerarm_l'], lowerarm_l: ['lowerarm_l', 0.06, 'hand_l'],
  upperarm_r: ['upperarm_r', 0.07, 'lowerarm_r'], lowerarm_r: ['lowerarm_r', 0.06, 'hand_r'],
  thigh_l: ['thigh_l', 0.09, 'calf_l'], calf_l: ['calf_l', 0.07, 'foot_l'],
  thigh_r: ['thigh_r', 0.09, 'calf_r'], calf_r: ['calf_r', 0.07, 'foot_r'],
};

export const PART_OF = {
  head: 'head', neck: 'head', chest: 'chest', belly: 'body', pelvis: 'body',
  upperarm_l: 'limb', lowerarm_l: 'limb', upperarm_r: 'limb', lowerarm_r: 'limb',
  thigh_l: 'limb', calf_l: 'limb', thigh_r: 'limb', calf_r: 'limb',
  hand_l: 'limb', hand_r: 'limb', foot_l: 'limb', foot_r: 'limb',
  cleaver: 'limb',   // the butcher's bone blade (its brain further reduces it and plays bone chips instead of blood)
};

// dismemberment: hitbox -> bone to collapse (its whole subtree disappears) and the attachment bone for the stump
export const SEVER = {
  head: { bone: 'head', stump: 'neck_01' }, neck: { bone: 'head', stump: 'neck_01' },
  lowerarm_l: { bone: 'lowerarm_l', stump: 'upperarm_l' }, upperarm_l: { bone: 'lowerarm_l', stump: 'upperarm_l' },
  lowerarm_r: { bone: 'lowerarm_r', stump: 'upperarm_r' }, upperarm_r: { bone: 'lowerarm_r', stump: 'upperarm_r' },
  calf_l: { bone: 'calf_l', stump: 'thigh_l' }, calf_r: { bone: 'calf_r', stump: 'thigh_r' },
};
