// Map registry: every playable map with its UI text and a lazy loader. The menus, the lobby, the
// multiplayer 'start' message (map id) and the ?map=<id> dev param all pick maps from this list.
//   load()   -> the map module (exports build(ctx), see world/world.js)
//   preview  -> menu backdrop orbit: target [x, y, z], radius, height, speed (rad/s); optional
//               (falls back to the map's own def.preview, then to the first player spawn)
export const MAPS = [
  {
    id: 'test', zh: '測試場', en: 'TEST ARENA', chapter: '開發測試',
    desc: '開放場地、木箱與高台，用來測試武器手感與殭屍行為。',
    rounds: 10, boss: true,
    load: () => import('./testArena.js'),
    preview: { target: [0, 1.4, 0], radius: 16, height: 4.5, speed: 0.05 },
  },
];

// Compiled map packages still under construction (tools/map/compile.mjs -> assets/maps/<id>/): reachable
// with ?map=<id> only, not listed in the menus yet. Moving an entry into MAPS (last) makes it the default.
const DEV_MAPS = [
  {
    id: 'losttown', zh: '失落之城', en: 'LOST TOWN', chapter: '第一章：失落之城',
    desc: '被病毒封鎖的北美工業小鎮，十字形街區，在中央路口擋住從四面八方湧入的屍潮。',
    rounds: 10, boss: true,
    load: () => import('./losttown.js'),
  },
  {
    id: 'kittest', zh: '套件測試街角', en: 'KIT TEST CORNER', chapter: '開發測試',
    desc: '地圖套件、編譯器與光照貼圖的驗證場景。',
    rounds: 10, boss: true,
    load: () => import('./kittest.js'),
    preview: { target: [0, 2, 0], radius: 18, height: 6, speed: 0.05 },
  },
];
{
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('map') : null;
  for (const m of DEV_MAPS) if (q === m.id) MAPS.unshift(m);
}

/** Map shown by default (menu backdrop, solo setup, new rooms): the newest real map when there is one. */
export const DEFAULT_MAP = MAPS.find((m) => m.default)?.id || MAPS[MAPS.length - 1].id;

export function mapInfo(id) {
  return MAPS.find((m) => m.id === id) || MAPS.find((m) => m.id === DEFAULT_MAP) || MAPS[0];
}

export function hasMap(id) { return MAPS.some((m) => m.id === id); }
