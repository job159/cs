// Map registry: every map the game knows, with its UI text and a lazy loader. The menus (chapter select,
// solo, lobby), the loading screen, the multiplayer 'start' message (map id) and the ?map=<id> dev param
// all read this list, so adding or unlocking a map is a data change here.
//   kind      'chapter' (numbered story chapters, CSO-style 10 rounds + boss) | 'training' (practice grounds)
//   no        chapter number (chapters only)
//   status    'ready' playable | 'wip' listed in chapter select with a 建置中 badge, not selectable |
//             'dev' never listed. ?map=<id> makes any entry playable for that session (map / QA work).
//   objective one-line mission goal (chapter select, solo card, loading screen)
//   thumb     optional image URL for the chapter cards (e.g. 'assets/maps/<id>/thumb.jpg', 16:9); without
//             one the UI draws a stylised tactical plan of the map (`plan`: 'cross' | 'arena' | 'corner')
//   preview   menu backdrop camera: a curated dolly { path: [[x, y, z, tx, ty, tz], ...], period: s } or an
//             orbit { target, radius, height, speed }; falls back to the map's own def.preview, then to an
//             orbit of the first player spawn
// The newest ready chapter is the default map (menu backdrop, solo, new rooms): flipping a chapter's
// status to 'ready' makes it the default automatically.
const CATALOG = [
  {
    id: 'losttown', kind: 'chapter', no: 1, status: 'ready',
    zh: '失落之城', en: 'LOST TOWN',
    desc: '被病毒封鎖的北美工業小鎮。十字形街區的中央路口築起貨櫃堡壘，屍潮從四條大街同時湧入。',
    objective: '死守中央路口，撐過 10 波屍潮並擊敗首領',
    rounds: 10, boss: true, plan: 'cross', thumb: 'assets/maps/losttown/thumb.jpg',
    load: () => import('./losttown.js'),
    // north avenue looking down at the central fort
    preview: { path: [[7, 4.2, -38, 0, 2.5, 0], [-5, 5.5, -27, 0, 2, 2], [6, 3.6, -19, -2, 2.5, 0]], period: 48 },
  },
  {
    id: 'test', kind: 'training', status: 'ready',
    zh: '演習場', en: 'PROVING GROUND',
    desc: '開放場地、木箱與高台，熟悉武器手感、彈道與各種感染者的行為。',
    objective: '熟悉武器與感染者，撐過 10 波屍潮',
    rounds: 10, boss: true, plan: 'arena',
    load: () => import('./testArena.js'),
    preview: { path: [[-14, 1.7, 13, 2, 1.2, -2], [-4, 2.3, 16, 3, 1.3, -1], [9, 3.2, 12, -1, 1.4, 0], [15, 2.4, 1, 0, 1.2, -3]], period: 64 },
  },
  {
    id: 'kittest', kind: 'training', status: 'dev',
    zh: '套件測試街角', en: 'KIT TEST CORNER',
    desc: '地圖套件、編譯器與光照貼圖的驗證場景。',
    objective: '開發測試用場景',
    rounds: 10, boss: true, plan: 'corner',
    load: () => import('./kittest.js'),
    preview: { target: [0, 2, 0], radius: 18, height: 6, speed: 0.05 },
  },
];

const devMap = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('map') : null;
const playable = (m) => m.status === 'ready' || m.id === devMap;

/** Every entry, chapters first (by number), then training grounds. */
export const ALL_MAPS = CATALOG;
/** Playable maps (ready, plus the ?map=<id> override). */
export const MAPS = CATALOG.filter(playable);
/** Chapters shown in chapter select (ready and wip), by chapter number. */
export const CHAPTERS = CATALOG.filter((m) => m.kind === 'chapter' && (m.status !== 'dev' || m.id === devMap)).sort((a, b) => a.no - b.no);
/** Training grounds shown in chapter select. */
export const TRAINING = CATALOG.filter((m) => m.kind === 'training' && (m.status !== 'dev' || m.id === devMap));

/** Map shown by default (menu backdrop, solo setup, new rooms): the newest playable chapter, else training. */
export const DEFAULT_MAP = [...CHAPTERS].reverse().find(playable)?.id || MAPS.find((m) => m.kind === 'training')?.id || MAPS[0].id;

/** Info of any known map (also wip ones: a guest must load whatever the host picked). */
export function mapInfo(id) {
  return CATALOG.find((m) => m.id === id) || CATALOG.find((m) => m.id === DEFAULT_MAP);
}

/** True when the map can be picked / started. */
export function hasMap(id) { return MAPS.some((m) => m.id === id); }

/** Short label: '第一章' for chapters, '訓練場' for training grounds. */
export function mapKicker(info) {
  if (info.kind !== 'chapter') return '訓練場';
  const zh = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  return `第${zh[info.no] || info.no}章`;
}

export const isPlayable = (id) => hasMap(id);
