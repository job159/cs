// CS2-style weapon finishes (塗裝) as procedural object-space shaders — docs/PREMIUM_WEAPONS.md §3
// (research: docs/research/05c-cs2-premium-skins.md). No UVs: every pattern samples the rest weapon-root
// position `aRest` (§1.5.8) with a fixed projection per style (§3.2.1):
//   side   (s, t) = (-z, y), normalised by the paint box       1 airbrush, 5 web, 11 meander SDF
//   vol3d  64³ 3D noise (tNoise3D) — no projection seams       2 marble, 3, 4 case-hard, 6 stripes, 7, 8, 10, 11 scroll
//   tri2d  triplanar 2D marble: fallback until tNoise3D is generated (Web Worker)
//   bi2d   biplanar Voronoi                                     6 hammer pits, 7 rosettes, 8 raindrops
//   grid3d hashed object-space cells                            FINISH_GLITTER flakes
// Scale: 'rel' = normalised to the paint box (a design looks the same on a pistol and a sniper),
// 'abs' = cells per metre (material grain: hammer pits, damascus layers, glitter).
// Each style compiles to its own program (#define FTYPE n, FWEAR n); SFX overlays PEARL / GLITTER are defines.
// Wear: float 0..1 -> fWear (§3.4), multi-layer peel per style (anodized -> chrome -> substrate, paint ->
// substrate, patina: scratches to raw steel). Seeds: mulberry32(seed x 7919 + kit.salt), fixed draw order
// offsetX -> offsetY -> rotation -> extra (§3.5).
import * as THREE from 'three';

const C = (h) => new THREE.Color(h);

/** 品相 (finish grade, §3.1). Colours deliberately off Valve's. */
export const GRADES = {
  common: { zh: '凡品', en: 'Common', color: '#a3adb8' },
  fine: { zh: '良品', en: 'Fine', color: '#4f86e8' },
  superior: { zh: '精品', en: 'Superior', color: '#7d5cff' },
  precious: { zh: '珍品', en: 'Precious', color: '#d03fb8' },
  exquisite: { zh: '極品', en: 'Exquisite', color: '#e0463a' },
  divine: { zh: '神品', en: 'Divine', color: '#e8b23a', prefix: '◆' },
};
/** Old RARITY keys -> grade (migration table §3.1). */
export const RARITY = { common: GRADES.common, industrial: GRADES.common, milspec: GRADES.fine, restricted: GRADES.superior,
  classified: GRADES.precious, covert: GRADES.exquisite, rare: GRADES.divine, ...GRADES };

/** Exterior grades by float (§3.4). */
export const WEAR_GRADES = [
  { key: 'fn', zh: '新鑄', en: 'Factory New', min: 0, max: 0.07 },
  { key: 'mw', zh: '微磨', en: 'Minimal Wear', min: 0.07, max: 0.15 },
  { key: 'ft', zh: '歷戰', en: 'Field-Tested', min: 0.15, max: 0.37 },
  { key: 'ww', zh: '斑駁', en: 'Well-Worn', min: 0.37, max: 0.44 },
  { key: 'bs', zh: '殘破', en: 'Battle-Scarred', min: 0.44, max: 1 },
];
const BUCKET_P = [0.12, 0.23, 0.40, 0.12, 0.13];

/** Styles (fType): projection, scale unit and wear model (0 direct / 1 anodized / 2 patina / 3 spray). */
export const STYLES = {
  1: { key: 'airbrush', proj: 'side', scale: 'rel', wear: 1 },
  2: { key: 'marble', proj: 'vol3d', scale: 'rel', wear: 1 },
  3: { key: 'marbleFade', proj: 'vol3d', scale: 'rel', wear: 1 },
  4: { key: 'caseHard', proj: 'vol3d', scale: 'rel', wear: 2 },
  5: { key: 'web', proj: 'side', scale: 'rel', wear: 0 },
  6: { key: 'twoGloss', proj: 'vol3d', scale: 'rel', wear: 1 },     // fPat 1 hammer: bi2d, abs
  7: { key: 'etched', proj: 'vol3d', scale: 'rel', wear: 1 },
  8: { key: 'damascus', proj: 'vol3d', scale: 'abs', wear: 2 },
  9: { key: 'solid', proj: 'none', scale: 'rel', wear: 1 },         // paint splits (metal 0) peel like paint
  10: { key: 'camo', proj: 'vol3d', scale: 'rel', wear: 0 },
  11: { key: 'engraved', proj: 'vol3d', scale: 'rel', wear: 0 },    // fPat 1 meander: side SDF
};

const KIT_FREE = { offX: [0, 1], offY: [0, 1], rot: [0, 360] };
const FADE_KIT = (salt) => ({ offX: [-0.7, -0.7], offY: [-0.7, -0.7], rot: [-55, -65], salt });

// Finish definitions (§3.2, §3.10). Colours are sRGB hex; c: up to 4 colours used by the style.
// grade = 品相; knife = grade on knives; float = [min, max]; kit = seed ranges; sfx = overlays; chase = rare
// pattern titles (thresholds come from tools/finish-chase.mjs, §3.5).
export const FINISHES = {
  // 1 airbrush
  dusk_fade: { zh: '落日漸層', en: 'Dusk Fade', type: 1, grade: 'exquisite', collection: 'qiming_s1', c: ['#e9b949', '#ff4f8b', '#5a46ff'], rough: 0.1, metal: 1,
    float: [0, 0.08], kit: FADE_KIT(11), chase: { metric: 'fadeAngle', titles: [{ id: 'quanxia', zh: '全霞', top: 0.01 }] } },
  aurora_fade: { zh: '極光漸層', en: 'Aurora Fade', type: 1, grade: 'exquisite', collection: 'qiming_s1', c: ['#19e3b1', '#7dff6a', '#6f4dff'], rough: 0.1, metal: 1,
    float: [0, 0.08], kit: FADE_KIT(12), chase: { metric: 'fadeAngle', titles: [{ id: 'quanjiguang', zh: '全極光', top: 0.01 }] } },
  amber_fade: { zh: '琥珀漸層', en: 'Amber Fade', type: 1, grade: 'exquisite', collection: 'qiming_s1', c: ['#ffb43a', '#c8102e', '#3a1a12'], rough: 0.1, metal: 1,
    float: [0, 0.08], kit: FADE_KIT(13) },
  // 2 marble (星渦) — gem phases are the rare outcome of a 星渦 drop (5 %)
  nebula_dusk: { zh: '星渦．晚霞', en: 'Nebula Dusk', type: 2, grade: 'exquisite', knife: 'divine', collection: 'qiming_s1', c: ['#ff3fa4', '#9b3ae8', '#ff6fd1'], rough: 0.08, metal: 1, float: [0, 0.08], kit: { ...KIT_FREE, salt: 21 } },
  nebula_violet: { zh: '星渦．夜紫', en: 'Nebula Violet', type: 2, grade: 'exquisite', knife: 'divine', collection: 'qiming_s1', c: ['#5a2b9e', '#2a2f8a', '#7d3cc4'], rough: 0.1, metal: 1, float: [0, 0.08], kit: { ...KIT_FREE, salt: 22 } },
  nebula_abyss: { zh: '星渦．海淵', en: 'Nebula Abyss', type: 2, grade: 'exquisite', knife: 'divine', collection: 'qiming_s1', c: ['#1f3c8a', '#1c6d6a', '#2a2f8a'], rough: 0.1, metal: 1, float: [0, 0.08], kit: { ...KIT_FREE, salt: 23 } },
  nebula_aurora: { zh: '星渦．極光', en: 'Nebula Aurora', type: 2, grade: 'exquisite', knife: 'divine', collection: 'qiming_s1', c: ['#2e5cff', '#3b8bff', '#7a4bff'], rough: 0.08, metal: 1, float: [0, 0.08], kit: { ...KIT_FREE, salt: 24 } },
  gem_cinnabar: { zh: '星渦．硃砂', en: 'Nebula Cinnabar', type: 2, grade: 'divine', collection: 'qiming_s1', c: ['#e0102a', '#ff3355', '#b0081e'], rough: 0.06, metal: 1, gem: 1, float: [0, 0.08], kit: { ...KIT_FREE, salt: 25 } },
  gem_azure: { zh: '星渦．天青', en: 'Nebula Azure', type: 2, grade: 'divine', collection: 'qiming_s1', c: ['#1a5bff', '#3d7dff', '#0f3fd4'], rough: 0.06, metal: 1, gem: 1, float: [0, 0.08], kit: { ...KIT_FREE, salt: 26 } },
  gem_jadeite: { zh: '星渦．翡翠', en: 'Nebula Jadeite', type: 2, grade: 'divine', collection: 'qiming_s1', c: ['#0fa84a', '#16d46a', '#0b7a38'], rough: 0.06, metal: 1, gem: 1, float: [0, 0.08], kit: { ...KIT_FREE, salt: 27 } },
  gem_inkjade: { zh: '星渦．墨玉', en: 'Nebula Ink Jade', type: 2, grade: 'divine', collection: 'qiming_s1', c: ['#2b1a4a', '#3a2a7a', '#1a1a3a'], rough: 0.08, metal: 1, gem: 0.6, irid: 1, float: [0, 0.08], kit: { ...KIT_FREE, salt: 28 } },
  qinglan: { zh: '青嵐．一相', en: 'Qinglan I', type: 2, grade: 'exquisite', knife: 'divine', collection: 'qiming_s1', c: ['#1fd36a', '#0e8a6f', '#3bd4b0'], rough: 0.08, metal: 1, float: [0, 0.08], kit: { ...KIT_FREE, salt: 31 } },
  qinglan_2: { zh: '青嵐．二相', en: 'Qinglan II', type: 2, grade: 'exquisite', knife: 'divine', collection: 'qiming_s1', c: ['#0fbf8a', '#1f8f5f', '#56e0c0'], rough: 0.08, metal: 1, float: [0, 0.08], kit: { ...KIT_FREE, salt: 32 } },
  qinglan_3: { zh: '青嵐．三相', en: 'Qinglan III', type: 2, grade: 'exquisite', knife: 'divine', collection: 'qiming_s1', c: ['#2ad49a', '#13706a', '#7ae8d0'], rough: 0.08, metal: 1, float: [0, 0.08], kit: { ...KIT_FREE, salt: 33 } },
  qinglan_4: { zh: '青嵐．四相', en: 'Qinglan IV', type: 2, grade: 'exquisite', knife: 'divine', collection: 'qiming_s1', c: ['#16b85a', '#0b5f4a', '#2fd0a0'], rough: 0.08, metal: 1, float: [0, 0.08], kit: { ...KIT_FREE, salt: 34 } },
  // 3 marble + fade
  tri_glaze: { zh: '三色釉', en: 'Tri-Glaze', type: 3, grade: 'exquisite', knife: 'divine', collection: 'newyear', c: ['#e0301e', '#f2b632', '#1e4fd8'], rough: 0.08, metal: 1, float: [0, 0.08],
    kit: { ...KIT_FREE, salt: 41 }, chase: { metric: 'redBlue', titles: [{ id: 'shuihuo', zh: '水火', top: 0.02 }, { id: 'sancai', zh: '三彩', top: 0.05 }] } },
  // 4 case hardened — extra draw picks the ramp row: gold 47 %, balanced 45 %, blue 8 %
  forge_bloom: { zh: '爐火淬', en: 'Forge Bloom', type: 4, grade: 'precious', collection: 'qiming_s1', c: ['#9a9ea4'], rough: 0.26, metal: 1, float: [0, 1],
    kit: { ...KIT_FREE, salt: 51, rows: [0.47, 0.45, 0.08] },
    chase: { metric: 'bluePct', titles: [{ id: 'tianqing1', zh: '天青淬．壹等', top: 0.008 }, { id: 'tianqing2', zh: '天青淬．貳等', top: 0.03 }, { id: 'jincui', zh: '金淬', top: 0.05 }] } },
  // 5 web — extra draw: 1-3 web centres
  scarlet_snare: { zh: '赤網', en: 'Scarlet Snare', type: 5, grade: 'exquisite', collection: 'thunder', c: ['#8e1018', '#0e0e10'], rough: 0.38, metal: 0, float: [0.06, 0.8],
    kit: { ...KIT_FREE, salt: 61, webs: [0.7, 0.25, 0.05] }, chase: { metric: 'webCentre', titles: [{ id: 'wangxin', zh: '網心', top: 0.04 }, { id: 'sanwang', zh: '三網', top: 0.01 }] } },
  night_snare: { zh: '夜網', en: 'Night Snare', type: 5, grade: 'precious', collection: 'thunder', c: ['#1a1d24', '#c9ccd1'], rough: 0.4, metal: 0, float: [0.06, 0.8], kit: { ...KIT_FREE, salt: 62, webs: [0.7, 0.25, 0.05] } },
  // 6 two glosses
  cinnabar_stripe: { zh: '朱砂斑紋', en: 'Cinnabar Stripe', type: 6, pat: 0, grade: 'exquisite', collection: 'newyear', c: ['#c4161c'], rough: 0.2, metal: 1, float: [0.01, 0.26], kit: { ...KIT_FREE, salt: 71 } },
  cinnabar_hammer: { zh: '朱砂錘紋', en: 'Cinnabar Hammer', type: 6, pat: 1, grade: 'exquisite', collection: 'newyear', c: ['#c4161c'], rough: 0.16, metal: 1, float: [0.01, 0.26], kit: { ...KIT_FREE, salt: 72 } },
  // 7 etched anodized
  gold_stripe: { zh: '金虎紋', en: 'Gold Stripe', type: 7, pat: 0, grade: 'exquisite', collection: 'qiming_s1', c: ['#e3b04b', '#f6ecd8'], rough: 0.08, metal: 1, float: [0, 0.08], kit: { ...KIT_FREE, salt: 81 } },
  cloud_leopard: { zh: '雲豹', en: 'Clouded Leopard', type: 7, pat: 1, grade: 'precious', collection: 'autumn', c: ['#e9a13b', '#f3e7cf'], rough: 0.1, metal: 1, float: [0, 0.08],
    kit: { ...KIT_FREE, salt: 82 }, chase: { metric: 'centredSpot', titles: [{ id: 'zhongyunban', zh: '置中雲斑', top: 0.02 }] } },
  // 8 damascus — extra draw: flow 70 %, ladder 25 %, raindrop 5 %
  thousand_fold: { zh: '千層鋼', en: 'Thousand-Fold Steel', type: 8, grade: 'precious', collection: 'thunder', c: ['#2c2e31', '#a8abb0'], rough: 0.25, metal: 1, float: [0, 0.5],
    kit: { ...KIT_FREE, salt: 91, pats: [0.7, 0.25, 0.05] }, chase: { metric: 'raindrop', titles: [{ id: 'yudi', zh: '雨滴紋', top: 0.03 }] } },
  // 9 solid / anodized / split
  mirror_chrome: { zh: '鏡面鉻', en: 'Mirror Chrome', type: 9, grade: 'superior', collection: 'qiming_s1', c: ['#e8eaee'], rough: 0.05, metal: 1, float: [0, 0.5], kit: { ...KIT_FREE, salt: 101 } },
  candy_red: { zh: '糖果紅', en: 'Candy Red', type: 9, grade: 'superior', collection: 'qiming_s1', c: ['#c4161c'], rough: 0.14, metal: 1, float: [0, 0.5], kit: { ...KIT_FREE, salt: 102 } },
  glacier_blue: { zh: '冰川藍', en: 'Glacier Blue', type: 9, grade: 'superior', collection: 'qiming_s1', c: ['#2a7fff'], rough: 0.16, metal: 1, float: [0, 0.5], kit: { ...KIT_FREE, salt: 103 } },
  emerald_anod: { zh: '翡翠綠', en: 'Emerald Anodized', type: 9, grade: 'superior', collection: 'qiming_s1', c: ['#0f9a5a'], rough: 0.16, metal: 1, float: [0, 0.5], kit: { ...KIT_FREE, salt: 104 } },
  amethyst: { zh: '紫晶', en: 'Amethyst', type: 9, grade: 'superior', collection: 'qiming_s1', c: ['#6a3cff'], rough: 0.16, metal: 1, float: [0, 0.5], kit: { ...KIT_FREE, salt: 105 } },
  rose_gold: { zh: '玫瑰金', en: 'Rose Gold', type: 9, grade: 'superior', collection: 'qiming_s1', c: ['#d99a8a'], rough: 0.14, metal: 1, float: [0, 0.5], kit: { ...KIT_FREE, salt: 106 }, sfx: { pearl: 0.08 } },
  titanium_gold: { zh: '鈦金', en: 'Titanium Gold', type: 9, grade: 'superior', collection: 'qiming_s1', c: ['#c9b48a'], rough: 0.2, metal: 1, float: [0, 0.5], kit: { ...KIT_FREE, salt: 107 } },
  night_owl: { zh: '夜梟', en: 'Night Owl', type: 9, pat: 1, grade: 'fine', collection: 'qiming_s1', c: ['#464a52', '#151517', '#4a3060', '#4a3060'], rough: 0.5, metal: 0.6, float: [0, 0.8], wear: 3, kit: { ...KIT_FREE, salt: 108 } },
  blue_white: { zh: '藍白拖', en: 'Blue & White', type: 9, pat: 1, grade: 'fine', collection: 'summer', c: ['#e9ecef', '#2f5fae', '#e9ecef', '#2f5fae'], rough: 0.45, metal: 0.1, float: [0, 0.8], wear: 3, kit: { ...KIT_FREE, salt: 109 } },
  carbon: { zh: '碳纖', en: 'Carbon Fiber', type: 9, grade: 'fine', collection: 'thunder', c: ['#24262b'], rough: 0.22, metal: 0.2, detail: 'carbon', float: [0, 0.5], wear: 0, kit: { ...KIT_FREE, salt: 110 } },
  // 10 camo
  bamboo: { zh: '竹影', en: 'Bamboo Shade', type: 10, pat: 1, grade: 'common', collection: 'qiming_s1', c: ['#3d5a32', '#22331d', '#6f8a4a'], rough: 0.6, metal: 0, float: [0, 1], kit: { ...KIT_FREE, salt: 121 } },
  kuroshio: { zh: '黑潮', en: 'Kuroshio', type: 10, pat: 2, grade: 'common', collection: 'qiming_s1', c: ['#0d1a2c', '#1f4a78', '#3d8fb8'], rough: 0.5, metal: 0, float: [0, 1], kit: { ...KIT_FREE, salt: 122 } },
  urban_grid: { zh: '城市灰域', en: 'Urban Grid', type: 10, pat: 0, grade: 'common', collection: 'qiming_s1', c: ['#5a5d61', '#8d9196', '#2f3236'], rough: 0.6, metal: 0, float: [0, 1], kit: { ...KIT_FREE, salt: 123 } },
  rainforest: { zh: '雨林', en: 'Rainforest', type: 10, pat: 0, grade: 'common', collection: 'qiming_s1', c: ['#4a5236', '#2e3324', '#7a6e4e'], rough: 0.62, metal: 0, float: [0, 1], kit: { ...KIT_FREE, salt: 124 } },
  gobi: { zh: '戈壁', en: 'Gobi', type: 10, pat: 0, grade: 'common', collection: 'qiming_s1', c: ['#b49a6e', '#8a7350', '#d2c09a'], rough: 0.6, metal: 0, float: [0, 1], kit: { ...KIT_FREE, salt: 125 } },
  // 11 engraved
  gilded_scroll: { zh: '鎏金雕花', en: 'Gilded Scroll', type: 11, pat: 0, grade: 'exquisite', collection: 'newyear', c: ['#e3b04b', '#5a3a10'], rough: 0.14, metal: 1, float: [0, 0.7], kit: { ...KIT_FREE, salt: 131 } },
  gilded_meander: { zh: '鎏金回紋', en: 'Gilded Meander', type: 11, pat: 1, grade: 'exquisite', collection: 'newyear', c: ['#8a0f16', '#e6b85c'], rough: 0.2, metal: 0, float: [0, 0.7], kit: { ...KIT_FREE, salt: 132 }, sfx: { pearl: 0.06 } },
  silver_engrave: { zh: '銀雕', en: 'Silver Engraving', type: 11, pat: 0, grade: 'precious', collection: 'newyear', c: ['#c9ccd1', '#3a3d42'], rough: 0.16, metal: 1, float: [0, 0.7], kit: { ...KIT_FREE, salt: 133 } },
  // SFX showcase (glitter): 藍眼淚-style teal flake over deep blue anodizing
  tearglow: { zh: '藍眼淚', en: 'Blue Tears', type: 9, grade: 'exquisite', collection: 'summer', c: ['#0a1530'], rough: 0.2, metal: 1, float: [0, 0.3],
    kit: { ...KIT_FREE, salt: 141 }, sfx: { glitter: { amt: 0.9, scale: 1100, rainbow: 0.15, tint: '#3fe8ff' }, pearl: 0.12 } },
};

/** Old keys -> new ids (§3.10); old viewer URLs / saves keep working. `blue_gem` is now a 爐火淬 rare pattern. */
export const FINISH_ALIAS = {
  fade: 'dusk_fade', doppler_p1: 'nebula_violet', doppler_p2: 'nebula_dusk', doppler_p3: 'nebula_abyss', doppler_p4: 'nebula_aurora',
  ruby: 'gem_cinnabar', sapphire: 'gem_azure', black_pearl: 'gem_inkjade', emerald: 'gem_jadeite', gamma_p2: 'qinglan',
  marble_fade: 'tri_glaze', case_hardened: 'forge_bloom', blue_gem: 'forge_bloom', crimson_web: 'scarlet_snare', slaughter: 'cinnabar_stripe',
  tiger_tooth: 'gold_stripe', damascus: 'thousand_fold', gold: 'gilded_scroll', chrome: 'mirror_chrome', anodized_red: 'candy_red',
  anodized_navy: 'glacier_blue', urban_camo: 'urban_grid', forest_camo: 'rainforest', desert_camo: 'gobi',
};
export function finishDef(id) { return FINISHES[id] || FINISHES[FINISH_ALIAS[id]] || null; }
export function finishId(id) { return FINISHES[id] ? id : FINISH_ALIAS[id] || null; }

// Material keys that receive the finish, and their region (§3.2.1 #7): 0 metal, 1 furniture, 2 barrel, 3 grip.
export const REGION = {
  steel: 0, steel_dark: 0, steel_blued: 0, alu: 0, alu_tan: 0, chrome: 0, gold: 0, steel_bright: 0,
  polymer: 1, polymer_tan: 1, polymer_od: 1, paint_od: 1, paint_red: 1, paint_yellow: 1, paint_white: 1, bakelite: 1, bakelite_plum: 1,
  carbon: 1, wood: 1, wood_light: 1, polymer_grip: 3, rubber: 3,
};
export const PAINTABLE = new Set(['steel', 'steel_dark', 'steel_blued', 'alu', 'alu_tan', 'polymer', 'polymer_tan', 'polymer_od', 'polymer_grip',
  'paint_od', 'paint_red', 'paint_yellow', 'paint_white', 'bakelite', 'bakelite_plum', 'carbon', 'gold', 'wood', 'wood_light']);
export const PAINTABLE_MELEE = new Set([...PAINTABLE, 'steel_bright']);
/** Wood is only painted when the finish defines regions[1] (AK furniture keeps its grain by default). */
export const WOOD = new Set(['wood', 'wood_light']);

// ------------------------------------------------------------------ seeds, float, wear

/** mulberry32 PRNG (§3.5). */
export function mulberry32(a) {
  return () => {
    a |= 0; a = a + 0x6d2b79f5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const pick = (w, x) => { let acc = 0; for (let i = 0; i < w.length; i++) { acc += w[i]; if (x < acc) return i; } return w.length - 1; };

/** Seed -> pattern draws, fixed order offsetX -> offsetY -> rotation -> extra. */
export function finishRoll(id, seed = 0) {
  const f = finishDef(id);
  const kit = { ...KIT_FREE, ...(f?.kit || {}) };
  const r = mulberry32((seed | 0) * 7919 + (kit.salt | 0));
  const lerp = ([a, b], t) => a + (b - a) * t;
  return { offX: lerp(kit.offX, r()), offY: lerp(kit.offY, r()), rot: lerp(kit.rot, r()), extra: r(), kit };
}

/** float (0..1) -> shader wear amount fWear (§3.4): 0.04 + 1.6 float^0.9, max 1.3. */
export function floatToWear(float) { return Math.min(1.3, 0.04 + 1.6 * Math.pow(Math.max(0, float), 0.9)); }
/** Exterior grade of a float. */
export function wearGrade(float) { return WEAR_GRADES.find((g) => float < g.max) || WEAR_GRADES[4]; }
/** Drop float (§3.4): bucket FN 12 / MW 23 / FT 40 / WW 12 / BS 13 %, uniform inside, mapped onto the finish range. */
export function rollFloat(id, rnd = Math.random) {
  const f = finishDef(id);
  const b = WEAR_GRADES[pick(BUCKET_P, rnd())];
  const u = b.min + rnd() * (b.max - b.min);
  const [lo, hi] = f?.float || [0, 1];
  return lo + u * (hi - lo);
}
/** Display grade of a finish on a weapon (knives use `knife` when set). */
export function finishGrade(id, melee = false) { const f = finishDef(id); return GRADES[(melee && f?.knife) || f?.grade] || GRADES.common; }
/** Display name: 「◆」 prefix for divine, rare-pattern suffix 「．稱號」 when given. */
export function finishName(id, { melee = false, chase = null } = {}) {
  const f = finishDef(id); if (!f) return '';
  const g = finishGrade(id, melee);
  return (g.prefix || '') + f.zh + (chase ? '．' + chase : '');
}

// SFX overlays enabled by quality (glitter needs highp and is off on low, §3.2 / §3.2.1 #6)
const sfxOn = { pearl: true, glitter: true };
export function setFinishQuality({ glitter = true, pearl = true } = {}) { sfxOn.glitter = glitter; sfxOn.pearl = pearl; }

/** Uniform values + program flags for a finish, seed and float (sfx: per-instance overlay override). */
export function finishUniforms(id, seed = 0, float = null, sfxOverride = null) {
  const f = finishDef(id);
  if (!f) return null;
  const st = STYLES[f.type];
  const roll = finishRoll(id, seed);
  const cols = (f.c || []).map(C);
  while (cols.length < 4) cols.push((cols[cols.length - 1] || C('#888')).clone());
  const fl = float ?? (f.float ? f.float[0] + (f.float[1] - f.float[0]) * 0.25 : 0.1);
  const wear = floatToWear(fl);
  const D = Math.PI / 180;
  let row = f.row ?? 1, pat = f.pat ?? 0, webs = 1;
  if (f.kit?.rows) row = pick(f.kit.rows, roll.extra);
  if (f.kit?.pats) pat = pick(f.kit.pats, roll.extra);
  if (f.kit?.webs) webs = 1 + pick(f.kit.webs, roll.extra);
  const sfx = sfxOverride || f.sfx || {};
  const pearl = sfxOn.pearl ? sfx.pearl || 0 : 0;
  const glit = sfxOn.glitter && sfx.glitter ? sfx.glitter : null;
  const wearStyle = f.wear ?? (st.wear === 1 && f.metal < 0.5 ? 3 : st.wear);
  return {
    id: finishId(id), type: f.type, pat, wearStyle, sfxMask: (pearl > 0 ? 1 : 0) | (glit ? 2 : 0), detail: f.detail,
    c0: cols[0], c1: cols[1], c2: cols[2], c3: cols[3], rough: f.rough, metal: f.metal,
    seedOff: new THREE.Vector3(roll.offX * 10, roll.offY * 10, ((roll.offX * 7.3 + roll.offY * 3.1) % 1) * 10),
    seedRot: roll.rot * D, fadeAng: (f.type === 1 ? roll.rot : -55 - roll.extra * 10) * D, gem: f.gem || 0, irid: f.irid || 0, row, webs,
    float: fl, wear, scratch: Math.min(1, Math.max(0, (wear - 0.05) / 1.15)), grime: Math.min(0.85, 0.12 + 0.6 * wear),
    dur: new THREE.Vector4(...(f.dur || [0, 0, 0, 0])), pearl,
    glit: glit?.amt ?? 0, glitScale: glit?.scale ?? 1000, rainbow: glit?.rainbow ?? 0, glitTint: C(glit?.tint || '#ffffff'),
  };
}

// ------------------------------------------------------------------ textures

function hash2(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(N, P, seed) {
  const o = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = (x / N) * P, fy = (y / N) * P, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = hash2(ix % P, iy % P, seed), b = hash2((ix + 1) % P, iy % P, seed), c = hash2(ix % P, (iy + 1) % P, seed), d = hash2((ix + 1) % P, (iy + 1) % P, seed);
    o[y * N + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  return o;
}
function fbm(N, P, oct, seed) {
  const o = new Float32Array(N * N); let amp = 1, tot = 0;
  for (let k = 0; k < oct; k++) { const n = vnoise(N, P << k, seed + k * 13); for (let i = 0; i < o.length; i++) o[i] += n[i] * amp; tot += amp; amp *= 0.5; }
  for (let i = 0; i < o.length; i++) o[i] /= tot;
  return o;
}
function sample(arr, N, x, y) { // wrapped bilinear
  x = ((x % N) + N) % N; y = ((y % N) + N) % N;
  const ix = Math.floor(x), iy = Math.floor(y), tx = x - ix, ty = y - iy, ix1 = (ix + 1) % N, iy1 = (iy + 1) % N;
  return arr[iy * N + ix] * (1 - tx) * (1 - ty) + arr[iy * N + ix1] * tx * (1 - ty) + arr[iy1 * N + ix] * (1 - tx) * ty + arr[iy1 * N + ix1] * tx * ty;
}

let cache = null;
/** 2D marble (tri2d fallback) + tempering ramp. */
export function finishTextures() {
  if (cache) return cache;
  const N = 256;
  // domain-warped marble (iq): R = silver mask, G = colour selector k, B = secondary field, A = warped height
  const w1 = fbm(N, 3, 5, 31), w2 = fbm(N, 3, 5, 57), w3 = fbm(N, 4, 4, 83);
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    const m = sample(w3, N, x + w1[i] * 2.4 * N * 0.3, y + w2[i] * 2.4 * N * 0.3);
    const silver = Math.pow(0.5 + 0.5 * Math.sin(38 * m + 9 * w1[i]), 0.35);
    data[i * 4] = Math.max(0, Math.min(255, silver * 255));
    data[i * 4 + 1] = w2[i] * 255;
    data[i * 4 + 2] = w3[i] * 255;
    data[i * 4 + 3] = m * 255;
  }
  const marble = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  marble.wrapS = marble.wrapT = THREE.RepeatWrapping;
  marble.minFilter = THREE.LinearMipmapLinearFilter; marble.magFilter = THREE.LinearFilter; marble.generateMipmaps = true;
  marble.needsUpdate = true;
  cache = { marble };
  return cache;
}

/**
 * 64³ RGBA8 periodic noise volume (§3.2.1 #5), same channels as the 2D marble. Self-contained so it can run
 * in a Blob Web Worker (no closures, no imports).
 */
function genNoise3D(N) {
  const hash = (x, y, z, s) => { let h = (x * 374761393 + y * 668265263 + z * 1440662683 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const vn = (P, seed) => {
    const L = new Float32Array(P * P * P);
    for (let z = 0; z < P; z++) for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) L[(z * P + y) * P + x] = hash(x, y, z, seed);
    const o = new Float32Array(N * N * N);
    const sx = new Float32Array(N), ix0 = new Int32Array(N), ix1 = new Int32Array(N);
    for (let i = 0; i < N; i++) { const f = i / N * P, a = Math.floor(f), t = f - a; sx[i] = t * t * (3 - 2 * t); ix0[i] = a % P; ix1[i] = (a + 1) % P; }
    let k = 0;
    for (let z = 0; z < N; z++) {
      const z0 = ix0[z] * P * P, z1 = ix1[z] * P * P, tz = sx[z];
      for (let y = 0; y < N; y++) {
        const y0 = ix0[y] * P, y1 = ix1[y] * P, ty = sx[y];
        for (let x = 0; x < N; x++, k++) {
          const x0 = ix0[x], x1 = ix1[x], tx = sx[x];
          const a = L[z0 + y0 + x0] + (L[z0 + y0 + x1] - L[z0 + y0 + x0]) * tx, b = L[z0 + y1 + x0] + (L[z0 + y1 + x1] - L[z0 + y1 + x0]) * tx;
          const c = L[z1 + y0 + x0] + (L[z1 + y0 + x1] - L[z1 + y0 + x0]) * tx, d = L[z1 + y1 + x0] + (L[z1 + y1 + x1] - L[z1 + y1 + x0]) * tx;
          const e = a + (b - a) * ty, f = c + (d - c) * ty;
          o[k] = e + (f - e) * tz;
        }
      }
    }
    return o;
  };
  const fb = (P, oct, seed) => {
    const o = new Float32Array(N * N * N); let amp = 1, tot = 0;
    for (let i = 0; i < oct; i++) { const n = vn(P << i, seed + i * 13); for (let j = 0; j < o.length; j++) o[j] += n[j] * amp; tot += amp; amp *= 0.5; }
    for (let j = 0; j < o.length; j++) o[j] /= tot;
    return o;
  };
  const w1 = fb(3, 4, 31), w2 = fb(3, 4, 57), w3 = fb(4, 4, 83);
  const smp = (arr, x, y, z) => {
    x = ((x % N) + N) % N; y = ((y % N) + N) % N; z = ((z % N) + N) % N;
    const ax = Math.floor(x), ay = Math.floor(y), az = Math.floor(z), tx = x - ax, ty = y - ay, tz = z - az;
    const bx = (ax + 1) % N, by = (ay + 1) % N, bz = (az + 1) % N;
    const g = (i, j, l) => arr[(l * N + j) * N + i];
    const c00 = g(ax, ay, az) * (1 - tx) + g(bx, ay, az) * tx, c10 = g(ax, by, az) * (1 - tx) + g(bx, by, az) * tx;
    const c01 = g(ax, ay, bz) * (1 - tx) + g(bx, ay, bz) * tx, c11 = g(ax, by, bz) * (1 - tx) + g(bx, by, bz) * tx;
    return (c00 * (1 - ty) + c10 * ty) * (1 - tz) + (c01 * (1 - ty) + c11 * ty) * tz;
  };
  const out = new Uint8Array(N * N * N * 4);
  const W = 2.4 * N * 0.3;
  for (let i = 0, z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++, i++) {
    const m = smp(w3, x + w1[i] * W, y + w2[i] * W, z + (w1[i] - w2[i]) * W);
    const silver = Math.pow(0.5 + 0.5 * Math.sin(38 * m + 9 * w1[i]), 0.35);
    out[i * 4] = Math.max(0, Math.min(255, silver * 255)); out[i * 4 + 1] = w2[i] * 255; out[i * 4 + 2] = w3[i] * 255; out[i * 4 + 3] = Math.min(255, m * 255);
  }
  return out;
}

/** Shared finish uniforms: the 3D noise volume and whether it is ready (tri2d until then). */
export const finishShared = {
  tNoise3D: { value: null },
  fVol: { value: 0 },
};
let noiseStarted = false;
function upload3D(data, N) {
  const t = new THREE.Data3DTexture(data, N, N, N);
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}
/** Starts the 64³ noise generation (Web Worker; stays on tri2d if workers are unavailable). */
export function ensureNoise3D() {
  if (noiseStarted) return;
  noiseStarted = true;
  const N = 64;
  if (!finishShared.tNoise3D.value) finishShared.tNoise3D.value = upload3D(new Uint8Array(4).fill(128), 1);
  try {
    const src = `const gen = ${genNoise3D.toString()};\nonmessage = (e) => { const d = gen(e.data); postMessage(d, [d.buffer]); };`;
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const w = new Worker(url);
    w.onmessage = (e) => {
      finishShared.tNoise3D.value = upload3D(e.data, N);
      finishShared.fVol.value = 1;
      w.terminate(); URL.revokeObjectURL(url);
    };
    w.onerror = () => { w.terminate(); URL.revokeObjectURL(url); };
    w.postMessage(N);
  } catch (e) { /* tri2d fallback */ }
}

// ------------------------------------------------------------------ GLSL

/** Fragment declarations (needs the shared noise helpers from premium.js). */
export const FINISH_PARS = /* glsl */`
#ifdef FINISH
uniform vec3 fC0, fC1, fC2, fC3;
uniform float fRough, fMetal, fSeedRot, fFadeAng, fGem, fIrid, fRow, fPat, fWebs, fKnife, fPlay, uRegion;
uniform float fWear, fScratch;
uniform vec4 fDur;
uniform vec3 fSeedOff;
uniform vec3 fBoxMin, fBoxMax;
uniform sampler2D tMarble;
uniform highp sampler3D tNoise3D;
uniform float fVol;
#ifdef FINISH_PEARL
uniform float fPearl;
#endif
#ifdef FINISH_GLITTER
uniform float fGlit, fGlitScale, fRainbow;
uniform vec3 fGlitTint;
#endif
vec3 fS2L(vec3 c) { return pow(c, vec3(2.2)); }
vec3 temperRamp(float h, float row) {
  vec3 r0[8]; vec3 r1[8]; vec3 r2[8];
  r0[0]=vec3(.604,.620,.643); r0[1]=vec3(.847,.773,.541); r0[2]=vec3(.788,.604,.310); r0[3]=vec3(.690,.478,.227); r0[4]=vec3(.549,.353,.180); r0[5]=vec3(.416,.239,.478); r0[6]=vec3(.290,.247,.549); r0[7]=vec3(.478,.557,.639);
  r1[0]=vec3(.604,.620,.643); r1[1]=vec3(.847,.773,.541); r1[2]=vec3(.788,.604,.310); r1[3]=vec3(.549,.353,.180); r1[4]=vec3(.416,.239,.478); r1[5]=vec3(.169,.247,.549); r1[6]=vec3(.310,.525,.776); r1[7]=vec3(.478,.557,.639);
  r2[0]=vec3(.604,.620,.643); r2[1]=vec3(.541,.627,.784); r2[2]=vec3(.310,.525,.776); r2[3]=vec3(.169,.247,.549); r2[4]=vec3(.118,.227,.604); r2[5]=vec3(.169,.310,.690); r2[6]=vec3(.310,.525,.776); r2[7]=vec3(.416,.494,.659);
  float x = clamp(h, 0.0, 0.9999) * 7.0;
  int i = int(floor(x)); float f = fract(x);
  vec3 a, b;
  if (row < 0.5) { a = r0[i]; b = r0[min(i + 1, 7)]; } else if (row < 1.5) { a = r1[i]; b = r1[min(i + 1, 7)]; } else { a = r2[i]; b = r2[min(i + 1, 7)]; }
  return fS2L(mix(a, b, f));
}
vec4 fTri(sampler2D t, vec3 p, vec3 w) { return texture2D(t, p.zy) * w.x + texture2D(t, p.xz) * w.y + texture2D(t, p.xy) * w.z; }
// vol3d: one fetch, no projection seams; tri2d until the volume is generated
vec4 fNoise(vec3 q, vec3 w) { return fVol > 0.5 ? texture(tNoise3D, q) : fTri(tMarble, q, w); }
float fSegD(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
#endif
`;

/** Map stage (inside the hard-surface base block, after wood / tint). Sets diffuse + finR / finM, fLost. */
export const FINISH_MAIN = /* glsl */`
float fLost = 0.0, fBumpH = 0.0;
#ifdef FINISH
{
  vec3 fp = vRest;                                       // rest weapon space (§1.5.8)
  vec3 fn = vObjNor;                                     // rest normal (gunkit parts are not rotated at rest)
  vec3 boxS = fBoxMax - fBoxMin;
  float gscale = 0.45 / max(0.12, max(boxS.z, boxS.y)) * fKnife;
  float cs = cos(fSeedRot), sn = sin(fSeedRot);
  vec3 q = vec3(fp.x * cs - fp.z * sn, fp.y, fp.x * sn + fp.z * cs) * gscale + fSeedOff * 0.1;
  vec3 fw = triW(fn);
  vec2 side = vec2(-fp.z, fp.y);                         // side-view plane (s, t)
  float wSide = smoothstep(0.35, 0.65, abs(fn.x));
  bool playFace = fn.x * fPlay > 0.0;
  vec3 fcol = diffuseColor.rgb; float fr = fRough, fm = fMetal;
#if FTYPE == 1
  // airbrushed candy gradient along the side plane at the seeded angle
  vec2 dir = vec2(cos(fFadeAng), sin(fFadeAng));
  float d1 = dot(vec2(-fBoxMax.z, fBoxMin.y), dir), d2 = dot(vec2(-fBoxMin.z, fBoxMax.y), dir);
  float d3 = dot(vec2(-fBoxMax.z, fBoxMax.y), dir), d4 = dot(vec2(-fBoxMin.z, fBoxMin.y), dir);
  float lo = min(min(d1, d2), min(d3, d4)), hi = max(max(d1, d2), max(d3, d4));
  float g = clamp((dot(side, dir) - lo) / max(1e-4, hi - lo) + (grunge.r - 0.5) * 0.06, 0.0, 1.0);
  fcol = mix(mix(fC0, fC1, smoothstep(0.12, 0.38, g)), fC2, smoothstep(0.58, 0.9, g));
#elif FTYPE == 2 || FTYPE == 3
  // black / silver marble under candy colours (星渦), or marble + three-colour fade (三色釉)
  vec4 mb = fNoise(q * 5.0, fw);
  float silver = smoothstep(0.12, 0.55, mb.r);
  silver = mix(silver, 0.65 + 0.35 * silver, fGem);
  vec3 candy;
#if FTYPE == 2
  float k = smoothstep(0.3, 0.7, mb.g);
  candy = mix(mix(fC0, fC1, k), fC2, smoothstep(0.65, 0.9, mb.b));
#else
  vec2 dir = vec2(cos(fFadeAng + 1.2), sin(fFadeAng + 1.2));
  float g = fract(dot(side, dir) * 2.2 + mb.g * 0.35 + fSeedOff.x * 0.07);
  candy = mix(mix(fC0, fC1, smoothstep(0.0, 0.5, g)), fC2, smoothstep(0.5, 1.0, g));
#endif
  if (fIrid > 0.5) { float nv = abs(normalize(fn).x); candy = mix(candy, vec3(0.2, 0.6, 0.55), (1.0 - nv) * 0.45); }
  fcol = mix(vec3(0.07, 0.065, 0.09), candy * (0.85 + 0.3 * mb.b), silver);
  fr = mix(0.3, fRough, silver); fm = mix(0.75, 1.0, silver);
#elif FTYPE == 4
  // case hardening: oxide colour clouds from the seeded volume, bent by the geometry (AO)
  vec4 mb = fNoise(q * 2.6 + vec3(fSeedOff.y), fw);
  vec4 mb2 = fNoise(q * 9.0, fw);
  float h = clamp((mb.a - 0.5) * 2.8 + 0.4 + (mb2.b - 0.5) * 0.3 + (vBake.r - 0.8) * 0.3, 0.0, 1.0);
  float tempered = smoothstep(0.1, 0.24, h);
  fcol = mix(fS2L(vec3(0.70, 0.72, 0.75)), temperRamp(h, fRow) * 1.35, tempered);
  fr = mix(0.22, fRough, tempered); fm = 1.0;
#elif FTYPE == 5
  // hydrographic web on the flanks; 1-3 seeded centres, the non-playside flank gets its own layout
  float web = 0.0;
  float best = 1e9; vec2 c = vec2(0.0);
  for (int i = 0; i < 3; i++) {
    if (float(i) >= fWebs) break;
    float fi = float(i);
    float sx = fract((playFace ? fSeedOff.x : fSeedOff.z) * 0.1 + fi * 0.37);
    vec2 ci = vec2(-mix(fBoxMin.z, fBoxMax.z, fWebs > 1.5 ? 0.15 + 0.7 * (fi + sx * 0.5) / fWebs : 0.35 + 0.3 * sx), mix(fBoxMin.y, fBoxMax.y, 0.4 + 0.2 * fract(sx * 7.0)));
    float dd = length(side - ci);
    if (dd < best) { best = dd; c = ci; }
  }
  vec2 d = (side - c) * (6.0 / max(0.05, boxS.z));
  float rr = length(d), a = atan(d.y, d.x);
  float sector = 6.2831853 / 13.0;
  float f = fract(a / sector) - 0.5;
  float spoke = abs(sin(f * sector)) * rr;
  float poly = rr * cos(f * sector) - 0.22 * 0.6 * (0.25 - f * f) * 4.0;
  float ring = abs(fract(poly / 0.6 + 0.5) - 0.5) * 0.6;
  float wdt = 0.012 + 0.008 * rr;
  web = (1.0 - smoothstep(wdt, wdt * 1.8, min(spoke, ring))) * wSide;   // tops / ends keep the base colour
  fcol = mix(fC0, fC1, web); fr = mix(fRough, 0.5, web); fm = 0.0;
#elif FTYPE == 6
  if (fPat < 0.5) {
    // two glosses: candy over a chrome zebra
    vec4 mb = fNoise(q * 4.0, fw);
    float z = sin(q.x * 40.0 + 6.0 * mb.g) + 0.6 * sin(q.y * 22.0 + 5.0 * mb.b);
    float ch = smoothstep(-0.15, 0.15, z);
    fcol = fC0 * mix(0.72, 1.0, ch); fr = mix(0.42, 0.07, ch); fm = 1.0;
  } else {
    // hammered candy: biplanar Voronoi dimples, 70 per metre (absolute)
    vec3 hv = pBiVor(fp * 70.0 + fSeedOff, fn);
    fBumpH = hv.x * hv.x * 0.0045;
    fcol = fC0 * (0.9 + 0.14 * smoothstep(0.1, 0.75, hv.x)); fr = mix(0.07, 0.16, smoothstep(0.5, 0.0, hv.y * 2.0)); fm = 1.0;
  }
#elif FTYPE == 7
  if (fPat < 0.5) {
    // etched stripes on candy anodizing
    vec4 mb = fNoise(vec3(q.x * 3.0, q.y * 2.2, q.z * 16.0) + vec3(0.0, 0.0, fNoise(q * 3.0, fw).b * 0.8), fw);
    float stripe = smoothstep(0.7, 0.75, mb.g * 0.75 + mb.b * 0.45);
    fcol = mix(fC0, fC1, stripe); fr = mix(fRough, 0.3, stripe);
  } else {
    // clouded-leopard rosettes: etched rings around darker cloud blotches
    vec3 lv = pBiVor(fp * 32.0 + fSeedOff * 0.3, fn);
    vec4 mb = fNoise(q * 6.0, fw);
    float rr = lv.x + (mb.g - 0.5) * 0.35;
    float ring = 1.0 - smoothstep(0.03, 0.08, abs(rr - 0.42));
    float inner = 1.0 - smoothstep(0.3, 0.44, rr);
    fcol = mix(fC0, fC0 * vec3(0.62, 0.5, 0.4), inner * 0.8);
    fcol = mix(fcol, fC1, ring); fr = mix(fRough, 0.3, ring);
  }
  fm = 1.0;
#elif FTYPE == 8
  // forged layers (absolute: ~90 layers per metre); 0 flow, 1 ladder, 2 raindrops
  vec4 mb = fNoise(fp * 2.2 + fSeedOff * 0.1, fw), mb2 = fNoise(fp * 7.0 + fSeedOff * 0.1, fw);
  float warp = (mb.g - 0.5) * 16.0 + (mb2.b - 0.5) * 4.0;
  float lay;
  if (fPat < 0.5) lay = fp.y * 150.0 + warp + 1.2 * sin(-fp.z * 40.0 + mb.b * 6.0);
  else if (fPat < 1.5) lay = fp.y * 150.0 + warp * 0.5 + 3.0 * abs(fract(-fp.z * 16.0) - 0.5);
  else { vec3 rv = pBiVor(fp * 18.0 + fSeedOff, fn); lay = rv.x * 7.0 + warp * 0.35 + fp.y * 40.0; }
  float br = smoothstep(-0.25, 0.25, sin(6.2831853 * lay));
  fcol = mix(fC0, fC1, br); fr = mix(0.46, 0.2, br); fm = 1.0;
#elif FTYPE == 9
  if (fPat > 0.5) {
    // split colours by region (metal / furniture / barrel / grip)
    fcol = uRegion < 0.5 ? fC0 : uRegion < 1.5 ? fC1 : uRegion < 2.5 ? fC2 : fC3;
    fm = (uRegion < 0.5 || (uRegion > 1.5 && uRegion < 2.5)) ? fMetal : 0.05;
  } else fcol = fC0;
#elif FTYPE == 10
  // hydro-dipped camo: 0 blotches, 1 bamboo (stretched along the gun, node bands), 2 waves
  vec4 mb;
  if (fPat < 0.5) mb = fNoise(q * 3.5, fw);
  else if (fPat < 1.5) { mb = fNoise(q * vec3(3.5, 3.5, 0.8), fw); mb.b = max(mb.b, step(0.955, fract(q.z * 4.0 + mb.r * 0.4)) * 0.9); }
  else { mb = fNoise(q * 2.0, fw); mb.g = 0.5 + 0.5 * sin(q.y * 70.0 + q.z * 12.0 + mb.g * 9.0); mb.b = 0.5 + 0.5 * sin(q.y * 45.0 - q.z * 8.0 + mb.b * 7.0); }
  float a1 = step(0.55, mb.g), a2 = step(0.6, mb.b);
  fcol = mix(mix(fC0, fC1, a1), fC2, a2 * (1.0 - a1 * 0.5));
#elif FTYPE == 11
  if (fPat < 0.5) {
    // engraved scrollwork
    vec4 mb = fNoise(q * 10.0, fw);
    float scroll = abs(sin(mb.a * 40.0 + q.y * 120.0));
    float engr = (1.0 - smoothstep(0.0, 0.18, scroll)) * smoothstep(0.35, 0.6, mb.g);
    fcol = mix(fC0, fC1, engr); fr = mix(fRough, 0.5, engr); fm = mix(fMetal, 0.6, engr);
  } else {
    // 回紋 meander (side SDF): gold lines over lacquer; tops / ends keep the lacquer
    vec2 st = side * gscale * 64.0 + fSeedOff.xy;
    vec2 cl = fract(st);
    float d = fSegD(cl, vec2(0.0, 0.1), vec2(1.0, 0.1));
    d = min(d, fSegD(cl, vec2(0.92, 0.1), vec2(0.92, 0.9)));
    d = min(d, fSegD(cl, vec2(0.92, 0.9), vec2(0.1, 0.9)));
    d = min(d, fSegD(cl, vec2(0.1, 0.9), vec2(0.1, 0.3)));
    d = min(d, fSegD(cl, vec2(0.1, 0.3), vec2(0.72, 0.3)));
    d = min(d, fSegD(cl, vec2(0.72, 0.3), vec2(0.72, 0.7)));
    d = min(d, fSegD(cl, vec2(0.72, 0.7), vec2(0.3, 0.7)));
    d = min(d, fSegD(cl, vec2(0.3, 0.7), vec2(0.3, 0.5)));
    float aa = fwidth(st.x) * 1.2 + 1e-4;
    float line = (1.0 - smoothstep(0.042 - aa, 0.042 + aa, d)) * wSide * (1.0 - smoothstep(0.25, 0.5, fwidth(st.x)));
    fcol = mix(fC0, fC1, line); fr = mix(fRough, 0.18, line); fm = mix(fMetal, 1.0, line);
  }
#endif
  // multi-layer wear (§3.4): wf = how exposed a point is (convex edges, chips, scratches)
  float wf = vBake.g * 1.2 + (grunge.a - 0.5) * 0.65 + grunge.g * 0.3 * fScratch;
  float T = 1.42 - fWear;
  float lostTop = smoothstep(T - 0.05, T, wf - fDur.w);
  float lostMid = smoothstep(T - 0.05, T, wf - 0.18 - fDur.z);
  float lostBase = smoothstep(T - 0.05, T, wf - 0.36 - fDur.x);
  vec3 subC = wearColor; float subR = wearRough, subM = wearMetal;   // the part's bare substrate
#if FWEAR == 1
  // anodized / candy: the colour goes first, then the chrome under it
  vec3 chromeC = vec3(0.67, 0.68, 0.70);
  fcol = mix(mix(fcol, chromeC, lostTop), subC, lostBase);
  fr = mix(mix(fr, 0.08, lostTop), subR, lostBase); fm = mix(mix(fm, 1.0, lostTop), subM, lostBase);
  fLost = lostTop;
#elif FWEAR == 2
  // patina: no paint to lose; scratches show raw steel, the oxide fades a little with wear
  float scr = smoothstep(0.35, 0.6, grunge.g * fScratch + (vBake.g - 0.6) * fWear * 0.6);
  fcol = mix(fcol, fS2L(vec3(0.68, 0.69, 0.71)), fWear * 0.12);
  fcol = mix(fcol, fS2L(vec3(0.78, 0.79, 0.8)), scr); fr = mix(fr, 0.32, scr);
  fLost = scr;
#elif FWEAR == 3
  // spray / paint split: top coat -> primer -> substrate
  vec3 primer = vec3(0.07, 0.075, 0.07);
  fcol = mix(mix(fcol, primer, lostTop), subC, lostBase);
  fr = mix(mix(fr, 0.6, lostTop), subR, lostBase); fm = mix(mix(fm, 0.0, lostTop), subM, lostBase);
  fLost = lostTop;
#else
  // hydro / custom / engraved plating: straight to the substrate
  fcol = mix(fcol, subC, lostTop); fr = mix(fr, subR, lostTop); fm = mix(fm, subM, lostTop);
  fLost = lostTop;
#endif
  diffuseColor.rgb = fcol; finR = fr; finM = fm;
}
#endif
`;

/** After normal_fragment_maps: hammer dimples, pearlescence, glitter flakes. */
export const FINISH_NORMAL = /* glsl */`
#ifdef FINISH
#if FTYPE == 6
  if (fPat > 0.5) {
    // bump from the dimple height (metres), screen-space derivative normal perturbation
    vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
    vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
    float det = dot(sx, r1);
    vec3 grad = sign(det) * (dFdx(fBumpH) * r1 + dFdy(fBumpH) * r2);
    normal = normalize(abs(det) * normal - grad * (1.0 - fLost));
  }
#endif
#ifdef FINISH_PEARL
  {
    // pearlescence: hue turns with the facing ratio (no effect on greys, so whites carry a faint tint)
    float facing = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
    vec3 hsv = fRgb2hsv(diffuseColor.rgb);
    hsv.x = fract(hsv.x + fPearl * facing * (1.0 - fLost));
    diffuseColor.rgb = fHsv2rgb(hsv);
  }
#endif
#ifdef FINISH_GLITTER
  {
    // metal flake: one tiny randomly tilted mirror per object-space cell, faded out below ~2 px
    vec3 gp = vRest * fGlitScale;
    vec3 gr = pH33(floor(gp));
    // ~65 % of the cells hold one flake of random size and offset (no visible lattice)
    float flake = step(length(fract(gp) - 0.5 - (gr - 0.5) * 0.6), 0.14 + 0.16 * gr.z) * step(0.35, fract(gr.x * 7.13 + gr.y));
    float aa = 1.0 - smoothstep(0.35, 0.9, length(fwidth(gp)));
    float k = flake * aa * fGlit * (1.0 - fLost);
    normal = normalize(normal + mat3(viewMatrix) * (mat3(modelMatrix) * (normalize(gr * 2.0 - 1.0) * 0.6 * k)));
    roughnessFactor = mix(roughnessFactor, 0.06, k);
    metalnessFactor = mix(metalnessFactor, 1.0, k);
    vec3 hue = 0.5 + 0.5 * cos(6.2831853 * (gr.x + vec3(0.0, 0.33, 0.67)));
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(fGlitTint, hue, fRainbow), k);
  }
#endif
#endif
`;
