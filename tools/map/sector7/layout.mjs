// 第七封鎖區 SECTOR 7 — level-design source of truth (blockout data) for the zone builders.
// Design intent, sightlines and round flow: docs/MAP_SECTOR7.md. This module is pure data plus a few helpers
// (no three.js import) so build scripts, the nav baker, the blockout renderer and the runtime can all share it.
//
// FRAME (metres)
//   +X = east, +Y = up, +Z = south (towards the sea); north = -Z. 2D points are [x, z]; 3D points are [x, y, z].
//   Yaw (player / spawner facing) follows the game: forward = (-sin(yaw), 0, -cos(yaw)),
//   so yaw 0 = north, -PI/2 = east, PI = south, +PI/2 = west. Use yawTo(from, to) to aim.
//   Boxes: { x, z } = centre on the ground, w = size along local X, d = along local Z, h = height,
//   y = base height, rot = three.js rotation.y (radians, counter-clockwise seen from above).
//   Ground levels: the town terrace (zones A B C) is 2.5 m above the port (zones D E F); sea surface is -2.4.

export const LEVEL = { town: 2.5, port: 0, water: -2.4, seabed: -9, curb: 0.15 };
const T = LEVEL.town, P = LEVEL.port, W = LEVEL.water, CURB = LEVEL.curb;
const S = +(T + CURB).toFixed(2); // town sidewalk / plaza paving top = 2.65

export const PI = Math.PI;
export const YAW = { N: 0, E: -PI / 2, S: PI, W: PI / 2 };
/** Game yaw that looks from [x,z] `from` towards [x,z] `to`. */
export const yawTo = (from, to) => +Math.atan2(-(to[0] - from[0]), -(to[1] - from[1])).toFixed(4);
/** Axis-aligned rectangle polygon [x0,z0]-[x1,z1]. */
export const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const r2 = (v) => Math.round(v * 100) / 100;

// Standard ISO container (CS2/PUBG yards use the same): 40 ft and 20 ft, 8'6" tall.
export const CONTAINER = { 40: { l: 12.19, w: 2.44, h: 2.59 }, 20: { l: 6.06, w: 2.44, h: 2.59 } };
// Muted, de-branded paint palette (index -> sRGB). Builders tint one container_side texture set.
export const CONTAINER_COLORS = ['#7d3326', '#3a5876', '#3d6347', '#8a8a84', '#a85a28', '#c4c0b6', '#2d6566', '#62452f'];

export const META = {
  id: 'sector7',
  name: '第七封鎖區',
  nameEn: 'SECTOR 7',
  chapter: '第七封鎖區：港灣隔離區',
  size: [220, 160],
  // [minx, miny, minz, maxx, maxy, maxz]: playable/nav bounds (the ship and backdrop may extend past them visually)
  bounds: [-110, -12, -80, 110, 45, 80],
  killY: -6, // below the sea surface: anything that falls in the water is returned to a safe point
  axes: '+X east, +Y up, +Z south (sea); north = -Z',
  yawConvention: 'forward = (-sin(yaw), 0, -cos(yaw)); 0 = N, -PI/2 = E, PI = S, PI/2 = W',
  // CS-style player movement from game/src/player/controller.js; every height below is designed against these.
  player: { height: 1.8, eye: 1.64, crouchEye: 1.1, radius: 0.34, jumpClear: 0.9, step: 0.45, runSpeed: 5.0, maxRampDeg: 40 },
  coverClasses: { low: '<= 1.0 m (crouch cover, players can jump it, zombies vault)', chest: '1.0-1.5 m (stand and shoot over, zombies vault)', full: '> 1.5 m (blocks sight, zombies need a climb point)' },
};

// ---------------------------------------------------------------------------------------------------------------
// ENVIRONMENT — late-afternoon overcast dusk. Sun is low in the WSW behind the cloud deck: weak warm key, cool fill.
// ---------------------------------------------------------------------------------------------------------------
function sunDir(bearingDeg, elevDeg) {
  const b = (bearingDeg * PI) / 180, e = (elevDeg * PI) / 180;
  // direction FROM the scene TOWARDS the sun (north = -Z, east = +X)
  return [r2(Math.sin(b) * Math.cos(e) * 1000) / 1000, r2(Math.sin(e) * 1000) / 1000, r2(-Math.cos(b) * Math.cos(e) * 1000) / 1000];
}
export const ENV = {
  timeOfDay: '17:40, late October, overcast dusk with a thin bright band on the WSW horizon',
  sun: {
    bearingDeg: 250, elevationDeg: 14,
    dir: sunDir(250, 14), // towards the sun; a DirectionalLight sits at player + dir * 80
    color: '#ffb27a', intensity: 1.6,
    shadow: { mapSize: 2048, extent: 45, followPlayer: true, near: 1, far: 180, bias: -0.0004, normalBias: 0.03 },
  },
  sky: {
    hdri: 'kloppenheim_01_puresky', res: '1k', alt: ['industrial_sunset_puresky', 'overcast_soil_puresky'],
    // rotate the HDRI so its brightest horizon glow sits at the sun bearing (measure once in the viewer)
    rotationDeg: 0, envIntensity: 0.55, backgroundIntensity: 0.85,
  },
  fog: { color: '#8e8985', density: 0.0072, note: 'FogExp2; ~50% at 115 m. Over the sea add a height fog layer below y 1 (#7e8487).' },
  exposure: 1.0,
  grade: 'slightly desaturated (-12%), cool shadows (#7f8a96), warm highlights (#ffc79a); sodium lamps read orange, floodlights cold white',
  ambient: { hemiSky: '#9aa4b0', hemiGround: '#4a4239', hemiIntensity: 0.35, note: 'only if the HDRI env is disabled at low quality' },
  wind: { dirDeg: 235, strength: 0.35, note: 'smoke columns lean NE; flags, tarps and tents flutter' },
  ambientFx: ['ash flakes drifting (low density)', 'smoke columns from fires (see LIGHTS type fire)', 'seagulls over F', 'distant siren loop from the west (behind the checkpoint)', 'surf and hull creak in F'],
};

// ---------------------------------------------------------------------------------------------------------------
// ZONES — unlock order A -> F. Polygons are generous footprints (include buildings); walkability comes from nav.
// ---------------------------------------------------------------------------------------------------------------
export const ZONES = [
  {
    id: 'A', name: '檢疫檢查站', nameEn: 'Quarantine Checkpoint', floorY: T, unlockRound: 1, rounds: [1, 2],
    polygon: rect(-108, -64, -72, -16),
    summary: 'Military checkpoint at the western town entrance; HESCO line facing east down the main street.',
  },
  {
    id: 'B', name: '港前主街', nameEn: 'Harbour Main Street', floorY: T, unlockRound: 1, rounds: [3],
    polygon: rect(-72, -58, -22, -21),
    summary: '50 m street canyon of 2-4 floor shophouses; zombie approach lane in R1-2, the push in R3; barricade at the east end.',
  },
  {
    id: 'C', name: '中央廣場', nameEn: 'Central Plaza', floorY: T, unlockRound: 3, rounds: [4],
    polygon: rect(-22, -70, 38, -10),
    summary: '44 x 44 m paved square with fountain and obelisk, ring roads, town hall; Butcher arena; port gate on the east edge.',
  },
  {
    id: 'D', name: '貨櫃堆場', nameEn: 'Container Yard', floorY: P, unlockRound: 5, rounds: [5, 6],
    polygon: [[40, -66], [106, -66], [106, 26], [42.44, 26], [42.44, -10], [40, -10]],
    summary: 'Port-level container maze below the plaza, rail-mounted gantry crane over the SW block; entered by the ramp from the plaza.',
  },
  {
    id: 'E', name: '三號倉庫', nameEn: 'Warehouse No.3', floorY: P, unlockRound: 7, rounds: [7, 8],
    polygon: [[-32, -10], [40, -10], [40, 26], [28, 26], [28, 30], [-32, 30]],
    summary: '60 x 32 m transit shed with catwalks at 5 m, pallet racks and the generator cage; east loading apron and north service road.',
  },
  {
    id: 'F', name: '二號碼頭', nameEn: 'Pier 2 Quay', floorY: P, unlockRound: 9, rounds: [9, 10],
    polygon: [[-44, 30], [28, 30], [28, 26], [106, 26], [106, 48], [62, 48], [62, 64.7], [34, 64.7], [34, 48], [16, 48], [16, 66],
      [-4, 66], [-4, 48], [-37, 48], [-37, 56], [-43, 56], [-43, 48], [-44, 48]],
    summary: 'Quay apron along the sea, fishing pier, moored cargo ship (bow deck accessible), quay crane; dock gate defence and Leviathan arena.',
  },
];

// ---------------------------------------------------------------------------------------------------------------
// GROUND SURFACES — listed in paint order (later entries cover earlier ones). mat = Poly Haven / ambientCG id.
// slope: linear height ramp { axis, from, to, y0, y1 } (y0 at `from`).
// ---------------------------------------------------------------------------------------------------------------
export const SURFACES = [
  // A
  { id: 'A_gravel', zone: 'A', kind: 'gravel', poly: rect(-108, -64, -72, -16), y: T, mat: 'gravel_road', surf: 'dirt' },
  { id: 'A_road', zone: 'A', kind: 'asphalt', poly: rect(-108, -45, -72, -35), y: T, mat: 'asphalt_02', surf: 'concrete' },
  { id: 'A_sw_n', zone: 'A', kind: 'sidewalk', poly: rect(-84, -48.5, -72, -45), y: S, mat: 'concrete_floor_worn_001', surf: 'concrete' },
  { id: 'A_sw_s', zone: 'A', kind: 'sidewalk', poly: rect(-84, -35, -72, -31.5), y: S, mat: 'concrete_floor_worn_001', surf: 'concrete' },
  // B
  { id: 'B_road', zone: 'B', kind: 'asphalt', poly: rect(-72, -45, -22, -35), y: T, mat: 'asphalt_02', surf: 'concrete' },
  { id: 'B_sw_n', zone: 'B', kind: 'sidewalk', poly: rect(-72, -48.5, -22, -45), y: S, mat: 'concrete_floor_worn_001', surf: 'concrete' },
  { id: 'B_sw_s', zone: 'B', kind: 'sidewalk', poly: rect(-72, -35, -22, -31.5), y: S, mat: 'concrete_floor_worn_001', surf: 'concrete' },
  { id: 'B_arcade_1', zone: 'B', kind: 'arcade', poly: rect(-62, -31.5, -48, -28), y: S, mat: 'worn_tile_floor', surf: 'tile', covered: true },
  { id: 'B_arcade_2', zone: 'B', kind: 'arcade', poly: rect(-44, -31.5, -32, -28), y: S, mat: 'worn_tile_floor', surf: 'tile', covered: true },
  { id: 'B_alley_Na', zone: 'B', kind: 'alley', poly: rect(-60, -58, -56, -48.5), y: T, mat: 'dirty_concrete', surf: 'concrete' },
  { id: 'B_alley_Nb', zone: 'B', kind: 'alley', poly: rect(-34, -56, -31, -48.5), y: T, mat: 'dirty_concrete', surf: 'concrete' },
  { id: 'B_alley_Sa', zone: 'B', kind: 'alley', poly: rect(-48, -31.5, -44, -21), y: T, mat: 'dirty_concrete', surf: 'concrete' },
  // C
  { id: 'C_road_w', zone: 'C', kind: 'asphalt', poly: rect(-22, -70, -14, -18), y: T, mat: 'asphalt_04', surf: 'concrete' },
  { id: 'C_road_n', zone: 'C', kind: 'asphalt', poly: rect(-14, -70, 38, -62), y: T, mat: 'asphalt_04', surf: 'concrete' },
  { id: 'C_road_e', zone: 'C', kind: 'asphalt', poly: rect(30, -62, 38, -18), y: T, mat: 'asphalt_04', surf: 'concrete' },
  { id: 'C_square', zone: 'C', kind: 'paving', poly: rect(-14, -62, 30, -18), y: S, mat: 'cobblestone_floor_08 / ambientCG PavingStones', surf: 'concrete' },
  { id: 'C_promenade', zone: 'C', kind: 'paving', poly: rect(-22, -18, 38, -10), y: S, mat: 'concrete_floor_worn_001', surf: 'concrete' },
  // D
  { id: 'D_yard', zone: 'D', kind: 'concrete', poly: [[40, -66], [106, -66], [106, 26], [42.44, 26], [42.44, -10], [40, -10]], y: P, mat: 'concrete_floor_damaged_01', surf: 'concrete' },
  { id: 'D_ramp', zone: 'D', kind: 'asphalt', poly: rect(40, -45, 70, -35), y: T, slope: { axis: 'x', from: 40, to: 70, y0: T, y1: P }, mat: 'asphalt_02', surf: 'concrete', note: 'harbour road ramp 8.3%, solid embankment underneath' },
  // E
  { id: 'E_service', zone: 'E', kind: 'asphalt', poly: rect(-32, -10, 28, -2), y: P, mat: 'road_damaged', surf: 'concrete' },
  { id: 'E_apron', zone: 'E', kind: 'concrete', poly: rect(28, -10, 40, 26), y: P, mat: 'dirty_concrete', surf: 'concrete' },
  { id: 'E_floor', zone: 'E', kind: 'floor', poly: rect(-31.7, -1.7, 27.7, 29.7), y: P, mat: 'garage_floor', surf: 'concrete', covered: true },
  // F
  { id: 'F_quay', zone: 'F', kind: 'concrete', poly: [[-44, 30], [28, 30], [28, 26], [106, 26], [106, 48], [-44, 48]], y: P, mat: 'concrete_floor_worn_001', surf: 'concrete' },
  { id: 'F_pier', zone: 'F', kind: 'concrete', poly: rect(-4, 48, 16, 66), y: P, mat: 'dirty_concrete', surf: 'concrete' },
  { id: 'F_slipway', zone: 'F', kind: 'concrete', poly: rect(-43, 40, -37, 56), y: P, slope: { axis: 'z', from: 40, to: 52, y0: P, y1: W }, mat: 'concrete_floor_damaged_01', surf: 'concrete', note: 'continues under water to the seabed' },
  { id: 'SEA', zone: null, kind: 'water', poly: rect(-160, 48, 160, 260), y: W, mat: 'ocean shader (Gerstner, dark green-grey #2b3a3c)', surf: 'water' },
];

// ---------------------------------------------------------------------------------------------------------------
// FACADE STYLES — what the building builder generates for each style (texture ids from docs/research/04).
// ---------------------------------------------------------------------------------------------------------------
export const FACADES = {
  plaster_shop: { walls: ['peeling_painted_wall', 'damaged_plaster'], ground: 'rusted_shutter (roller shutters) + shopfront glass', bay: 3.0, window: [1.4, 1.5], sill: 0.9, extras: 'AC units (exterior_aircon_unit), vertical shop signboards, rusty window grilles, drain pipes' },
  brick_2f: { walls: ['red_brick', 'factory_brick'], ground: 'big shopfront windows, painted timber frames', bay: 3.5, window: [1.2, 1.8], sill: 0.9, extras: 'stone lintels, cornice band, awning frames' },
  arcade_3f: { walls: ['painted_worn_brick', 'dirty_tiles (mosaic cladding)'], ground: 'qilou arcade 3.5 m deep, 0.5 m square columns every 3.5 m, shop shutters at the back', bay: 3.5, window: [1.5, 1.4], sill: 1.0, extras: 'iron window cages, laundry poles, vertical neon signs (dead)' },
  concrete_apt: { walls: ['concrete_wall_008', 'worn_plaster_wall'], ground: 'steel doors, closed shutters', bay: 3.2, window: [1.2, 1.4], sill: 0.9, extras: 'balconies 1.2 m deep with grilles, satellite dishes' },
  hotel_4f: { walls: ['painted_worn_brick', 'worn_plaster_wall'], ground: 'glass lobby (boarded up)', bay: 3.0, window: [1.2, 1.6], sill: 0.8, extras: 'vertical sign 海景旅社 with dead neon tubes, 2F balcony rail' },
  civic_stone: { walls: ['plastered_wall', 'concrete_wall_006 (rusticated base)'], ground: 'tall doors and steps', bay: 4.0, window: [1.6, 2.6], sill: 1.0, extras: 'pilasters, cornice, flag poles, clock' },
  industrial_shed: { walls: ['concrete_wall_006 (3 m plinth)', 'rusty_corrugated_iron', 'corrugated_iron_02'], ground: 'roller doors, personnel doors', bay: 6.0, window: [6.0, 1.5], sill: 7.5, extras: 'clerestory polycarbonate strip, gutters (modular_metal_gutter), downpipes, stencilled bay numbers' },
  portacabin: { walls: ['painted_metal_shutter', 'container_side'], ground: 'steel doors', bay: 3.0, window: [1.0, 1.0], sill: 1.0, extras: 'external steel stair, AC unit' },
};

// ---------------------------------------------------------------------------------------------------------------
// BUILDINGS (playable edge). floors = storey heights bottom-up; height excludes parapet.
// openings: face N/S/E/W, along = [from,to] along the face (x for N/S faces, z for E/W), floor 0 = ground.
// state: enterable | blocked | spawn (a zombie spawner uses it) | breakable. Unlisted windows are generated
// from the facade rhythm and are blocked (glass/boarded collision).
// ---------------------------------------------------------------------------------------------------------------
export const BUILDINGS = [
  // ---- B north side (fronts face south onto the street at z = -48.5)
  {
    id: 'B_N1', zone: 'B', name: '便利商店＋公寓', footprint: rect(-72, -62, -60, -48.5), baseY: T, floors: [4.2, 3.2, 3.2], parapet: 0.8,
    roof: 'flat', facade: 'plaster_shop', front: 'S',
    openings: [
      { face: 'S', along: [-70.5, -62.5], floor: 0, type: 'shopfront', state: 'enterable', note: 'shutter half up (1.9 m clear), glass smashed' },
      { face: 'S', along: [-68.7, -67.3], floor: 1, type: 'window', state: 'spawn', spawner: 'SP_B_W1' },
      { face: 'N', along: [-66.6, -65.4], floor: 0, type: 'door', state: 'spawn', spawner: 'SP_B_D1', note: 'store back door' },
    ],
    interior: { poly: rect(-71.6, -54.5, -60.4, -48.8), floorY: T, ceiling: 3.9, contents: 'shelf rows (1.6 m) E-W, counter, fridges along the north wall; flickering fluorescent' },
  },
  {
    id: 'B_N2', zone: 'B', name: '海鮮餐廳', footprint: rect(-56, -62, -42, -48.5), baseY: T, floors: [4.5, 3.5], parapet: 0.6,
    roof: 'flat', facade: 'brick_2f', front: 'S',
    openings: [
      { face: 'S', along: [-55, -50], floor: 0, type: 'window', state: 'enterable', sill: 0.6, note: 'smashed picture window, vaultable 0.6 m sill' },
      { face: 'S', along: [-48.6, -47.2], floor: 0, type: 'door', state: 'enterable' },
      { face: 'S', along: [-46, -43], floor: 0, type: 'window', state: 'blocked', note: 'boarded' },
      { face: 'S', along: [-49.6, -48.4], floor: 1, type: 'window', state: 'spawn', spawner: 'SP_B_W2' },
      { face: 'N', along: [-49.6, -48.4], floor: 0, type: 'door', state: 'spawn', spawner: 'SP_B_D2', note: 'kitchen back door' },
    ],
    interior: { poly: rect(-55.6, -58, -42.4, -48.8), floorY: T, ceiling: 4.1, contents: 'overturned tables (0.75 m), bar counter (1.1 m) along x = -45, fish tanks (broken), kitchen pass at the back' },
  },
  {
    id: 'B_N3', zone: 'B', name: '窄公寓', footprint: rect(-42, -62, -34, -48.5), baseY: T, floors: [3.6, 3.0, 3.0], parapet: 0.9,
    roof: 'flat', facade: 'concrete_apt', front: 'S', openings: [{ face: 'S', along: [-40, -36], floor: 0, type: 'shutter', state: 'blocked' }],
  },
  {
    id: 'B_N4', zone: 'B', name: '轉角藥局', footprint: rect(-31, -62, -22, -48.5), baseY: T, floors: [4.4, 3.6], parapet: 0.6,
    roof: 'flat', facade: 'brick_2f', front: 'S', chamfer: { corner: [-22, -48.5], size: 2.5 },
    openings: [{ face: 'S', along: [-30, -24], floor: 0, type: 'shutter', state: 'blocked' }],
    note: 'roof edge is a zombie drop point (SP_B_R1); green pharmacy cross sign on the chamfer, dead',
  },
  // ---- B south side (fronts face north at z = -31.5)
  {
    id: 'B_S1', zone: 'B', name: '五金行', footprint: rect(-72, -31.5, -62, -18), baseY: T, floors: [4.2, 3.4], parapet: 0.8,
    roof: 'flat', facade: 'plaster_shop', front: 'N',
    openings: [{ face: 'N', along: [-71, -63], floor: 0, type: 'shutter', state: 'blocked' }],
    note: 'roof edge drop point SP_B_R2; west wall faces the checkpoint forecourt (blank wall with faded mural)',
  },
  {
    id: 'B_S2', zone: 'B', name: '騎樓茶行公寓', footprint: rect(-62, -31.5, -48, -18), baseY: T, floors: [4.2, 3.2, 3.2], parapet: 0.8,
    roof: 'flat', facade: 'arcade_3f', front: 'N', arcade: { depth: 3.5, columnsAt: 'z = -31.25, x every 3.5 m from -61.75', clear: 4.2 },
    openings: [
      { face: 'N', along: [-61, -55.5], floor: 0, type: 'shopfront', state: 'enterable', setback: 3.5, note: 'tea shop, shutter torn off' },
      { face: 'N', along: [-55.7, -54.3], floor: 1, type: 'window', state: 'spawn', spawner: 'SP_B_W3' },
    ],
    interior: { poly: rect(-61.6, -28, -55.2, -21), floorY: T, ceiling: 3.9, contents: 'tea crates (1.0 m), counter, back room blocked' },
  },
  {
    id: 'B_S3', zone: 'B', name: '騎樓當舖', footprint: rect(-44, -31.5, -32, -18), baseY: T, floors: [4.2, 3.2, 3.2], parapet: 0.8,
    roof: 'flat', facade: 'arcade_3f', front: 'N', arcade: { depth: 3.5, columnsAt: 'z = -31.25, x every 3.5 m from -43.75', clear: 4.2 },
    openings: [{ face: 'N', along: [-43, -33], floor: 0, type: 'shutter', state: 'blocked', setback: 3.5 }],
  },
  {
    id: 'B_S4', zone: 'B', name: '海景旅社', footprint: rect(-32, -31.5, -22, -18), baseY: T, floors: [4.2, 3.1, 3.1, 3.1], parapet: 0.9,
    roof: 'flat', facade: 'hotel_4f', front: 'N',
    openings: [
      { face: 'N', along: [-30, -25], floor: 0, type: 'shopfront', state: 'blocked', note: 'boarded lobby' },
      { face: 'N', along: [-27.7, -26.3], floor: 1, type: 'window', state: 'spawn', spawner: 'SP_B_W4' },
    ],
    note: 'tallest building on the street (16.4 m incl. parapet): frames the plaza entrance, vertical sign readable from A',
  },
  // ---- C plaza edge
  {
    id: 'C_TOWNHALL', zone: 'C', name: '市政廳', footprint: rect(-12, -82, 28, -71), baseY: T, floors: [5.2, 4.4, 4.4], parapet: 1.5,
    roof: 'flat', facade: 'civic_stone', front: 'S',
    openings: [
      { face: 'S', along: [4, 8], floor: 0, type: 'door', state: 'breakable', note: 'Butcher bursts out here at R4 start' },
      { face: 'S', along: [1.4, 2.6], floor: 1, type: 'window', state: 'spawn', spawner: 'SP_C_N1' },
      { face: 'S', along: [13.4, 14.6], floor: 1, type: 'window', state: 'spawn', spawner: 'SP_C_N2' },
    ],
    note: 'clock tower 6 x 6 m at x 3..9, z -80..-74 rising to y 29.5 (see LANDMARKS); front steps on the north road',
  },
  {
    id: 'C_POST', zone: 'C', name: '郵局', footprint: rect(-36, -78, -22, -62), baseY: T, floors: [4.6, 4.0], parapet: 0.8,
    roof: 'flat', facade: 'civic_stone', front: 'E',
    openings: [{ face: 'E', along: [-66.6, -65.4], floor: 1, type: 'window', state: 'spawn', spawner: 'SP_C_NW' }],
    note: 'closes the NW corner of the ring road',
  },
  {
    id: 'C_CUSTOMS', zone: 'C', name: '海關大樓', footprint: rect(28, -86, 46, -71), baseY: T, floors: [4.6, 3.8, 3.8], parapet: 1.0,
    roof: 'flat', facade: 'civic_stone', front: 'S', openings: [], note: 'NE corner; its east flank drops to the yard (port level) with a blank wall',
  },
  // ---- D
  {
    id: 'D_OFFICE', zone: 'D', name: '堆場辦公室', footprint: rect(92, -64, 104, -56), baseY: P, floors: [2.7, 2.7], parapet: 0,
    roof: 'flat', facade: 'portacabin', front: 'S',
    openings: [{ face: 'S', along: [96, 97], floor: 1, type: 'door', state: 'blocked', note: 'external steel stair on the south face (visual, collision ramp blocked by a gate)' }],
    note: 'two stacked rows of portacabins; roof is the drop point SP_D_RF',
  },
  // ---- F
  {
    id: 'F_HARBOUR', zone: 'F', name: '港務站', footprint: rect(-42, 31, -32, 39), baseY: P, floors: [3.6, 3.2], parapet: 0.6,
    roof: 'flat', facade: 'concrete_apt', front: 'E',
    openings: [
      { face: 'E', along: [34.4, 35.6], floor: 0, type: 'door', state: 'blocked', note: 'buy station BUY_F stands at this door' },
      { face: 'S', along: [-37.6, -36.4], floor: 1, type: 'window', state: 'spawn', spawner: 'SP_F_HO' },
    ],
    note: 'harbour master office, radio mast on the roof (12 m, red obstruction light)',
  },
];

// Low-detail facades that close the view (no interiors, merged per block, no collision beyond a single box).
export const BACKDROP = [
  { id: 'BD_gas', name: '加油站', poly: rect(-104, -80, -78, -66), height: 5.2, note: 'canopy 16 x 10 at 5.2 m with 4 pumps, shop x -104..-92 (4.2 m); burnt sedan at the pumps' },
  { id: 'BD_north_1', name: '山坡公寓', poly: rect(-76, -84, -58, -64), height: 16, note: '5F, stepped up the hillside (base +1.5)' },
  { id: 'BD_north_2', name: '公寓', poly: rect(-56, -84, -40, -64), height: 13, note: '4F' },
  { id: 'BD_north_3', name: '公寓', poly: rect(-40, -84, -36, -64), height: 10, note: '3F sliver' },
  { id: 'BD_admin', name: '港務大樓', poly: rect(50, -90, 90, -70), height: 18, note: 'port admin, 5F concrete, roof antenna; rail sidings in front (z -70..-66)' },
  { id: 'BD_east_stacks', name: '外圍貨櫃牆', poly: rect(106, -66, 120, 26), height: 13, note: '5-high container stacks (non-climbable) closing the east edge' },
  { id: 'BD_depot', name: '公車調度站', poly: rect(-108, -16, -72, 2), height: 7, note: 'bus depot behind a 2.4 m brick wall; burnt buses visible through the breaches' },
  { id: 'BD_fishmarket', name: '魚市場', poly: rect(-70, -6, -36, 26), height: 9, note: 'port level, sawtooth roof shed; fence along x = -32..-36 closes it from E/F' },
  { id: 'BD_fishing', name: '漁港', poly: rect(-110, 26, -44, 48), height: 3, note: 'small fishing quay with moored boats, nets, a capsized trawler' },
  { id: 'BD_convoy', name: '軍方車隊', poly: rect(-122, -50, -108, -30), height: 3.5, note: 'APC + trucks + concertina behind the closed outer gate (the way out the players cannot take)' },
  { id: 'BD_breakwater', name: '防波堤與燈塔', poly: rect(-60, 140, 120, 150), height: 4, note: 'far breakwater, red/white lighthouse at (70, 150) with a slow sweeping beam' },
];

// ---------------------------------------------------------------------------------------------------------------
// LANDMARKS — hero pieces. Coordinates are final; builders own the modelling detail.
// ---------------------------------------------------------------------------------------------------------------
export const LANDMARKS = {
  fountain: {
    id: 'LM_FOUNTAIN', zone: 'C', name: '海鷗噴泉', center: [2, S, -40], outerRadius: 6.5, rimHeight: 0.55, rimWidth: 0.45,
    basinFloorY: S - 0.2, waterY: S + 0.32, column: { radius: 1.1, height: 3.6 }, bowl: { radius: 2.4, y: S + 1.8, thickness: 0.25 },
    top: 'bronze seagull group 2.2 m (verdigris)', collision: 'rim ring + column cylinder; basin floor walkable (surf water, slows 15%)',
    cover: 'rim = low cover all round; column = full cover; kite loop radius 8-10 m around it',
  },
  obelisk: {
    id: 'LM_OBELISK', zone: 'C', name: '港灣守望紀念碑', center: [21, S, -40],
    steps: [{ size: 7, h: 0.4 }, { size: 5.4, h: 0.4 }], pedestal: { size: 3, h: 2.4 }, shaft: { base: 1.7, top: 0.9, h: 13 },
    topY: +(S + 0.8 + 2.4 + 13).toFixed(2),
    note: 'sits on the A->D axis: breaks the 140 m sightline from the checkpoint to the port gate; bronze plaques, wreaths, candles',
  },
  clockTower: { id: 'LM_CLOCK', zone: 'C', name: '市政廳鐘樓', rect: rect(3, -80, 9, -74), baseY: T, topY: 29.5, clockY: 24, note: 'clock stopped at 5:47; visible from the whole town' },
  portGate: {
    id: 'LM_PORTGATE', zone: 'C', name: '港區管制門', pos: [39, T, -40], gate: 'G_CD',
    signGantry: { posts: [[39, -46], [39, -34]], beamY: [T + 5.8, T + 7.2], text: '第七港區 SECTOR 7 PORT ／ 管制區 RESTRICTED AREA' },
    note: 'sliding palisade gate 10 x 2.6 m; amber beacons on both posts; visible down the whole main street from A',
  },
  rmg: {
    id: 'LM_RMG', zone: 'D', name: '軌道式龍門吊 RMG-2', railsX: [36, 68], runwayZ: [-8, 26], centerZ: 14.4,
    legs: [[36, 7.4], [36, 21.4], [68, 7.4], [68, 21.4]], legSize: 1.4,
    bogies: [rect(35.2, 5.4, 36.8, 9.4), rect(35.2, 19.4, 36.8, 23.4), rect(67.2, 5.4, 68.8, 9.4), rect(67.2, 19.4, 68.8, 23.4)], bogieH: 1.6,
    sillBeams: { y: [4.5, 5.5], width: 1.2, note: 'side beams between the legs at 4.5 m: walk under them' },
    girders: { x: [28, 76], z: [7.4, 21.4], y: [24, 26.2], width: 1.8 },
    trolley: { rect: rect(39, 6.5, 43, 22.3), y: [26.2, 28.4] }, cab: { rect: rect(39.8, 8.6, 42.2, 11), y: [21.4, 24] },
    spreader: { pos: [41.22, 18.2, 14.35], size: [12.2, 0.8, 2.5], note: 'hangs over the container wall section G_DE; in R6 it lifts the 3 boxes away one by one' },
    machineryHouse: { rect: rect(29, 7.4, 35, 21.4), y: [26.2, 29.5] },
    platform: { rect: rect(66, 7.4, 70, 21.4), landing: rect(70, 7.4, 71.6, 9.0), y: 7.0, rail: 1.1, surf: 'grate', cabinets: { rect: rect(66, 11, 67.4, 18), h: 2.4 } },
    stair: { rect: rect(70, -2.6, 71.6, 7.4), bottom: [70.8, P, -2.6], top: [70.8, 7.0, 7.4], deg: 35 },
    cableReel: { rect: rect(66, 9.4, 70, 19.4), h: 3.2, note: 'fills the ground under the platform (keeps nav single-layer)' },
    controlStation: { rect: rect(70.6, 12.5, 72.6, 16.5), h: 1.8, note: 'R5 device / R6 defend target; amber beacon on top' },
    topY: 29.5, paint: 'faded yellow with rust, black-yellow hazard stripes on legs, cold LED floodlights under the girders',
  },
  warehouse: {
    id: 'LM_WAREHOUSE', zone: 'E', name: '三號倉庫', footprint: rect(-32, -2, 28, 30), wall: 0.3, eaveY: 10.5, ridgeY: 13.0, ridgeZ: 14,
    frames: { axis: 'x', from: -32, to: 28, every: 6, note: 'steel portal frames, clear span 32 m (no internal columns)' }, facade: 'industrial_shed',
    doors: [
      { id: 'WD_EAST', face: 'E', along: [10, 18], h: 5.5, type: 'sliding', gate: 'G_E_DOOR' },
      { id: 'WD_SEA', face: 'S', along: [-8, 0], h: 4.5, type: 'roller', gate: 'G_EF' },
      { id: 'WD_SEA2', face: 'S', along: [12, 20], h: 4.5, type: 'roller', state: 'blocked', note: 'jammed 0.5 m open: light leaks in' },
      { id: 'WD_N1', face: 'N', along: [-12.6, -11.4], h: 2.1, type: 'personnel', state: 'spawn', spawner: 'SP_E_N1' },
      { id: 'WD_N2', face: 'N', along: [13.4, 14.6], h: 2.1, type: 'personnel', state: 'spawn', spawner: 'SP_E_N2' },
      { id: 'WD_E2', face: 'E', along: [3.4, 4.6], h: 2.1, type: 'personnel', state: 'blocked' },
    ],
    clerestory: { y: [7.5, 9.5], faces: ['N', 'S'], note: 'broken polycarbonate strip; window spawners drop in through it' },
    skylights: [[-8, 13.9], [16, 20]],
    catwalks: {
      y: 5.0, width: 1.8, rail: 1.1, surf: 'grate',
      segments: [
        { id: 'CW_N', rect: rect(-31.7, -1.7, 27.7, 0.1) },
        { id: 'CW_S', rect: rect(-31.7, 27.9, 27.7, 29.7) },
        { id: 'CW_X1', rect: rect(-18.2, 0.1, -16.4, 27.9) },
        { id: 'CW_X2', rect: rect(19.1, 0.1, 20.9, 27.9) },
        { id: 'CW_MEZZ', rect: rect(-31.7, -1.7, -22, 8) },
      ],
    },
    stairs: [
      { id: 'WS_1', rect: rect(-20.2, 0.1, -18.4, 9.0), bottom: [-19.3, P, 9.0], top: [-19.3, 5.0, 0.1], note: 'floor -> north catwalk, next to the office' },
      { id: 'WS_2', rect: rect(23, 19.0, 24.8, 27.9), bottom: [23.9, P, 19.0], top: [23.9, 5.0, 27.9], note: 'floor -> south catwalk, east end' },
    ],
    ladders: [{ id: 'WL_NE', base: [26.6, P, 1.0], top: [26.6, 5.0, -0.2] }, { id: 'WL_SW', base: [-21, P, 27.2], top: [-21, 5.0, 28.6] }],
    office: { rect: rect(-31.7, -1.7, -22, 8), door: { face: 'E', along: [4.5, 5.7] }, ceiling: 4.6, note: 'ground office (buy station at the door), mezzanine deck on its roof at 5.0' },
    racks: { rows: [rect(-16, 10.0, 0.2, 12.2), rect(-16, 15.6, 0.2, 17.8), rect(-16, 21.2, 0.2, 23.4)], h: 5.5, bay: 2.7, beamLevels: [0.15, 1.6, 3.05, 4.5], note: 'double-deep selective racking, half-loaded with shrink-wrapped pallets; solid in collision' },
    generatorCage: { rect: rect(-31.7, 19.5, -22, 29.7), fenceH: 2.4, gate: { face: 'E', along: [20.5, 23.5] } },
    lighting: '8 high-bay LED lamps at y 10 (off until the R7 generator runs), 4 red emergency lamps over doors',
  },
  ship: {
    id: 'LM_SHIP', zone: 'F', name: '隼灣號 MV KESTREL BAY', type: 'general cargo feeder, ~96 m',
    hull: { x: [34, 130], z: [50, 65], keelY: -7.5, deckY: 5.5, bulwarkH: 1.1, bowX: 34 },
    forecastle: { poly: [[34.6, 57.5], [38, 52.2], [44, 50.6], [44, 64.4], [38, 62.8]], y: 7.6 },
    hatches: [
      { id: 'H1', rect: rect(47, 53.5, 59, 61.5), topY: 7.1, walkable: true },
      { id: 'H2', rect: rect(63, 53, 80, 62), topY: 7.3, walkable: false, cargo: 'two-high 20 ft containers lashed on top' },
      { id: 'H3', rect: rect(84, 53, 101, 62), topY: 7.3, walkable: false },
    ],
    superstructure: { rect: rect(106, 51, 120, 64), topY: 19.5, funnel: { x: 115, z: 57.5, topY: 24 } },
    deckCranes: [{ x: 61.5, z: 57.5, h: 18 }, { x: 82, z: 57.5, h: 18 }], foremast: { x: 39.5, z: 57.5, h: 14 },
    playerDeck: { rect: rect(44, 50.3, 62.5, 64.7), y: 5.5, note: 'east of x 62.5 is blocked by hold 2 coaming + deck cargo' },
    gangway: { from: [37.5, P, 49.25], to: [50, 5.5, 49.25], width: 1.4, landing: rect(50, 48.6, 52.5, 51), deg: 24 },
    stairs: [
      { id: 'SH_ST1', from: [47.5, 5.5, 51.7], to: [44, 7.6, 51.7], width: 1.4, note: 'main deck -> forecastle' },
      { id: 'SH_ST2', from: [61.5, 5.5, 57.5], to: [59, 7.1, 57.5], width: 2.0, note: 'cargo stair onto hatch 1' },
    ],
    paint: 'black hull, red-oxide boot-top, white name boards 隼灣號 / KESTREL BAY, rust streaks under hawse pipes, draught marks',
    mooring: 'lines to bollards at x 35, 50, 95 and beyond the map edge',
  },
  quayCrane: {
    id: 'LM_QUAYCRANE', zone: 'F', name: '門座式起重機（舊）', railsZ: [36, 44], railsX: [-42, 26],
    portal: { legs: [[-22, 36], [-14, 36], [-22, 44], [-14, 44]], legSize: 1.2, clearance: 6.5 },
    slewingHouse: { center: [-18, 40], size: [7, 6], y: [9.5, 15] },
    boom: { pivot: [-18, 13, 40], dir: [-0.5, 0.866], length: 32, luffDeg: 55, tip: [-27.2, 39.2, 55.9] },
    hook: { pos: [-27.2, 10.6, 55.9], load: 'rusty 20 ft container on chains' },
    console: { pos: [-17.2, P, 36.8], note: 'Leviathan mechanism: drop the load when the boss surfaces in the drop circle' },
    dropPoint: { pos: [-27.2, W, 55.9], radius: 6 },
  },
};
// ---------------------------------------------------------------------------------------------------------------
// PROPS / COVER (boxes). kind drives the model; cover class is derived from h. Ramps use { from, to, width }.
// ---------------------------------------------------------------------------------------------------------------
const box = (zone, kind, x, z, w, d, h, o = {}) => ({
  zone, kind, x, z, w, d, h, y: o.y ?? (zone === 'A' || zone === 'B' || zone === 'C' ? T : P), rot: o.rot ?? 0, surf: o.surf ?? 'metal', ...o,
});
export const PROPS = [
  // ===== A checkpoint
  box('A', 'hesco', -83.55, -56.5, 1.1, 14, 1.37, { surf: 'sand', id: 'A_HESCO_N', note: 'bastion line, zombies vault it' }),
  box('A', 'hesco', -83.55, -23.5, 1.1, 14, 1.37, { surf: 'sand', id: 'A_HESCO_S' }),
  box('A', 'jersey', -78, -47.9, 0.6, 3, 0.81, { surf: 'concrete', id: 'A_J1a' }),
  box('A', 'jersey', -78, -44.7, 0.6, 3, 0.81, { surf: 'concrete', id: 'A_J1b' }),
  box('A', 'jersey', -78, -41.5, 0.6, 3, 0.81, { surf: 'concrete', id: 'A_J1c' }),
  box('A', 'jersey', -88, -38.5, 0.6, 3, 0.81, { surf: 'concrete', id: 'A_J2a' }),
  box('A', 'jersey', -88, -35.3, 0.6, 3, 0.81, { surf: 'concrete', id: 'A_J2b' }),
  box('A', 'jersey', -88, -32.1, 0.6, 3, 0.81, { surf: 'concrete', id: 'A_J2c' }),
  box('A', 'sandbag', -86, -49.1, 3, 0.8, 1.1, { surf: 'sand', id: 'A_SB_N' }),
  box('A', 'sandbag', -86, -30.9, 3, 0.8, 1.1, { surf: 'sand', id: 'A_SB_S' }),
  { zone: 'A', kind: 'ramp', id: 'A_CP_STAIR', from: [-106.5, T, -57.75], to: [-102, T + 2.59, -57.75], width: 1.5, surf: 'metal', note: 'steel steps to the command-post roof' },
  box('A', 'sandbag', -99, -59.2, 6, 0.6, 0.6, { y: T + 2.59, surf: 'sand', id: 'A_CP_PARAPET_N' }),
  box('A', 'sandbag', -96.3, -57, 0.6, 4.4, 0.6, { y: T + 2.59, surf: 'sand', id: 'A_CP_PARAPET_E' }),
  box('A', 'tent', -91, -60.25, 6, 5.5, 3.2, { surf: 'wood', id: 'A_TENT_MED', note: 'medical tent, red cross, lit inside; solid' }),
  box('A', 'tent', -99.5, -24.5, 9, 5, 3.2, { surf: 'wood', id: 'A_TENT_BARRACKS' }),
  box('A', 'tower', -86.5, -28.5, 3, 3, 4.0, { id: 'A_TOWER', parapet: 1.0, note: 'scaffold watchtower, plywood + sandbag parapet, platform at T+4.0' }),
  { zone: 'A', kind: 'ramp', id: 'A_TOWER_STAIR', from: [-94, T, -28.5], to: [-88, T + 4.0, -28.5], width: 1.4, surf: 'metal' },
  box('A', 'truck', -99.75, -42.75, 8.5, 2.5, 3.2, { id: 'A_TRUCK', note: 'olive 6x6 cargo truck, tarp torn, amber beacon' }),
  box('A', 'humvee', -93.5, -36.5, 4.9, 2.2, 1.9, { rot: 0.25, id: 'A_HUMVEE' }),
  box('A', 'floodlight', -86.6, -52.5, 1.8, 3.2, 1.5, { id: 'A_FL1', mast: 7 }),
  box('A', 'floodlight', -86.6, -19.5, 1.8, 3.2, 1.5, { id: 'A_FL2', mast: 7 }),
  box('A', 'generator', -89.5, -51, 2.0, 1.1, 1.3, { id: 'A_GEN' }),
  box('A', 'crates', -93.5, -46.6, 2.4, 1.2, 1.0, { surf: 'wood', id: 'A_AMMO', note: 'supply point' }),
  box('A', 'barrel_fire', -91.5, -31, 0.6, 0.6, 0.9, { id: 'A_FIRE' }),
  box('A', 'ibc_tank', -104, -46.5, 1.2, 1.0, 1.15, { id: 'A_IBC' }),
  box('A', 'toilet', -106.5, -27, 1.2, 1.2, 2.3, { id: 'A_WC1' }),
  box('A', 'toilet', -106.5, -25.6, 1.2, 1.2, 2.3, { id: 'A_WC2' }),
  // ===== B main street
  box('B', 'car_burnt', -66, -42.5, 4.6, 1.8, 1.45, { rot: 0.35, id: 'B_CAR1', note: 'burning (fire light)' }),
  box('B', 'taxi', -57, -37.2, 4.7, 1.8, 1.5, { rot: -0.15, id: 'B_TAXI' }),
  box('B', 'van', -50.5, -46.4, 5.2, 2.0, 2.1, { rot: 1.35, id: 'B_VAN', note: 'nose crashed into the restaurant front' }),
  box('B', 'bus', -38, -40, 12, 2.55, 3.1, { rot: 0.42, id: 'B_BUS', note: 'jackknifed city bus, roof = high ground (5.6)' }),
  { zone: 'B', kind: 'ramp', id: 'B_BILLBOARD', from: [-48.18, T, -35.45], to: [-43.48, T + 3.1, -37.55], width: 2.2, surf: 'metal', note: 'fallen billboard frame leaning on the bus: walkable ramp to the roof' },
  box('B', 'police_car', -28.5, -37, 4.9, 1.9, 1.5, { rot: -0.6, id: 'B_POLICE' }),
  box('B', 'sedan', -60, -33.2, 4.6, 1.8, 1.45, { rot: 0.05, y: S, id: 'B_SEDAN2', note: 'parked half on the sidewalk' }),
  box('B', 'rubble', -39.5, -46.8, 4, 2.4, 1.2, { y: S, surf: 'concrete', id: 'B_RUBBLE', note: 'collapsed balcony of B_N3' }),
  box('B', 'bus_shelter', -69, -33.3, 3.6, 1.5, 2.5, { y: S, surf: 'glass', id: 'B_SHELTER' }),
  box('B', 'kiosk', -35, -47, 2, 1.6, 2.4, { y: S, id: 'B_KIOSK' }),
  box('B', 'planter', -64.5, -46, 1.2, 0.6, 0.7, { y: S, surf: 'concrete', id: 'B_PLANTER1' }),
  box('B', 'scooters', -53, -32.8, 1.8, 0.8, 1.1, { y: S, id: 'B_SCOOT1' }),
  box('B', 'scooters', -36.5, -47.4, 1.8, 0.8, 1.1, { y: S, id: 'B_SCOOT2' }),
  box('B', 'dumpster', -56.7, -52, 1.2, 1.9, 1.3, { id: 'B_DUMP1' }),
  box('B', 'dumpster', -45, -23.5, 1.9, 1.2, 1.3, { id: 'B_DUMP2' }),
  // B -> C barricade (G_BC / R3 objective): welded plates, stacked wrecks, sandbags, a dump truck
  box('B', 'barricade_cars', -23.3, -45.6, 2.2, 4.6, 2.9, { id: 'BR_CARS', gate: 'G_BC' }),
  box('B', 'barricade_steel', -23.0, -40, 0.6, 6.8, 3.2, { id: 'BR_STEEL', gate: 'G_BC' }),
  box('B', 'sandbag', -24.3, -40, 1.2, 6.8, 1.2, { surf: 'sand', id: 'BR_SAND', gate: 'G_BC' }),
  box('B', 'barricade_truck', -23.4, -34.4, 2.4, 5.8, 3.0, { id: 'BR_TRUCK', gate: 'G_BC' }),
  box('B', 'sandbag', -23.2, -48.2, 1.2, 0.6, 2.0, { surf: 'sand', id: 'BR_FILL', gate: 'G_BC' }),
  // ===== C plaza
  box('C', 'planter_tree', -11.5, -59.5, 1.6, 1.6, 0.55, { y: S, surf: 'concrete', id: 'C_TREE1' }),
  box('C', 'planter_tree', -11.5, -20.5, 1.6, 1.6, 0.55, { y: S, surf: 'concrete', id: 'C_TREE2' }),
  box('C', 'planter_tree', 27.5, -59.5, 1.6, 1.6, 0.55, { y: S, surf: 'concrete', id: 'C_TREE3' }),
  box('C', 'planter_tree', 27.5, -20.5, 1.6, 1.6, 0.55, { y: S, surf: 'concrete', id: 'C_TREE4' }),
  box('C', 'planter_tree', -11.5, -40, 1.6, 1.6, 0.55, { y: S, surf: 'concrete', id: 'C_TREE5' }),
  box('C', 'bench', 8.72, -46.72, 1.8, 0.6, 0.45, { y: S, rot: PI / 4, surf: 'wood', id: 'C_BENCH1' }),
  box('C', 'bench', -4.72, -46.72, 1.8, 0.6, 0.45, { y: S, rot: -PI / 4, surf: 'wood', id: 'C_BENCH2' }),
  box('C', 'bench', -4.72, -33.28, 1.8, 0.6, 0.45, { y: S, rot: PI / 4, surf: 'wood', id: 'C_BENCH3' }),
  box('C', 'bench', 8.72, -33.28, 1.8, 0.6, 0.45, { y: S, rot: -PI / 4, surf: 'wood', id: 'C_BENCH4' }),
  box('C', 'kiosk', -11, -50, 2.2, 1.8, 2.5, { y: S, id: 'C_KIOSK' }),
  box('C', 'stall', -9, -27, 2.6, 2.0, 2.3, { y: S, surf: 'wood', id: 'C_STALL1' }),
  box('C', 'stall', -4.5, -24.5, 2.6, 2.0, 2.3, { y: S, surf: 'wood', id: 'C_STALL2' }),
  box('C', 'stall', -9.5, -22.2, 2.6, 2.0, 2.3, { y: S, surf: 'wood', id: 'C_STALL3' }),
  box('C', 'propane', -6.3, -21.2, 1.2, 0.8, 1.3, { y: S, id: 'C_PROPANE', explosive: { radius: 4, dmg: 'medium' } }),
  box('C', 'tent_collapsed', 20, -24.5, 6, 4, 1.5, { y: S, surf: 'wood', id: 'C_EVAC_TENT1' }),
  box('C', 'tent_collapsed', 26.5, -28, 4, 5, 1.4, { y: S, surf: 'wood', id: 'C_EVAC_TENT2' }),
  { zone: 'C', kind: 'sandbag_ring', id: 'C_SB_RING', x: 12, z: -26, r: 2.2, h: 1.0, y: S, gapDeg: [200, 250], surf: 'sand', note: 'low ring, opening towards the SW' },
  box('C', 'crates', 24.5, -20.5, 2.4, 1.2, 1.4, { y: S, surf: 'wood', id: 'C_EVAC_PALLET' }),
  box('C', 'tanker', 24, -66, 12, 2.5, 3.3, { id: 'C_TANKER', explosive: { radius: 8, dmg: 'boss', once: true }, note: 'Butcher mechanism: shoot the valve (red tag) to blow it' }),
  box('C', 'apc_burnt', -8, -66.5, 6.8, 2.9, 2.4, { rot: -0.3, id: 'C_APC', note: 'burning hulk (fire light)' }),
  box('C', 'booth', 35, -48.5, 2.4, 3, 2.6, { id: 'C_BOOTH', note: 'port gate guard booth' }),
  box('C', 'sedan', -18, -27, 4.6, 1.8, 1.45, { rot: 1.2, id: 'C_CAR1' }),
  box('C', 'taxi', -17, -55, 4.7, 1.8, 1.5, { rot: 1.5, id: 'C_CAR2' }),
  box('C', 'police_car', 33.5, -28, 4.9, 1.9, 1.5, { rot: 1.4, id: 'C_CAR3' }),
  box('C', 'barricade_cars', -17, -70.8, 8, 1.6, 2.2, { id: 'C_N_BLOCK', note: 'burnt cars + fence closing the north side street (spawner SP_C_N0 climbs over)' }),
  box('C', 'steps', 6, -70.25, 12, 1.5, 0.6, { surf: 'concrete', id: 'C_TH_STEPS' }),
  // ===== D container yard
  box('D', 'booth', 72.8, -50.5, 2.0, 3.0, 2.6, { id: 'D_BOOTH' }),
  box('D', 'semi_container', 88.25, -49.75, 16.5, 2.5, 4.0, { id: 'D_SEMI1', note: 'tractor + 40 ft on a chassis' }),
  box('D', 'container20_loose', 90, -38, 6.06, 2.44, 2.59, { rot: 0.2, id: 'D_LOOSE1' }),
  box('D', 'container20_loose', 98, -33, 6.06, 2.44, 5.18, { rot: -0.1, id: 'D_LOOSE2', note: '2 high' }),
  box('D', 'truck_scale', 79, -29.5, 10, 3, 0.15, { id: 'D_SCALE' }),
  box('D', 'straddle_wreck', 74.45, -11, 8.9, 6, 4.5, { id: 'D_STRADDLE', note: 'straddle carrier on its side, burning engine bay; blocks the central lane except a 1.6 m squeeze at x 79-80.5' }),
  box('D', 'container20_loose', 73, -4, 6.06, 2.44, 2.59, { rot: 0.9, id: 'D_SPILL1', note: 'dropped box, dented' }),
  box('D', 'reach_stacker', 78, 20.5, 11, 4.2, 4.5, { id: 'D_REACH' }),
  box('D', 'chassis', 99, 20, 12, 2.5, 1.4, { id: 'D_CHASSIS1' }),
  box('D', 'mast', 86, -46, 1.2, 1.2, 25, { id: 'D_MAST1' }),
  box('D', 'mast', 75, 2, 1.2, 1.2, 25, { id: 'D_MAST2' }),
  box('D', 'mast', 103, 14, 1.2, 1.2, 25, { id: 'D_MAST3' }),
  // ===== E warehouse + apron + service road
  box('E', 'genset', -27.47, 25.72, 6.06, 2.44, 2.59, { id: 'E_GENSET', note: 'R7 device: 20 ft diesel genset, console on the east end' }),
  box('E', 'trailer_box', 10.8, 7.25, 13.6, 2.5, 4.0, { id: 'E_TRAILER', note: 'skirted semi-trailer; roof (4.0) is high ground' }),
  { zone: 'E', kind: 'ramp', id: 'E_YARD_RAMP', from: [-2.9, P, 7.25], to: [4, 4.0, 7.25], width: 2.1, surf: 'metal', note: 'mobile yard ramp up to the trailer roof' },
  box('E', 'forklift', 8, 20, 1.2, 3.6, 2.2, { rot: 0.6, id: 'E_FORK1' }),
  box('E', 'forklift', 22, 4, 1.2, 3.6, 2.2, { rot: -1.2, id: 'E_FORK2' }),
  box('E', 'pallets', 6, 14, 1.2, 1.0, 1.4, { surf: 'wood', id: 'E_PAL1' }),
  box('E', 'pallets', 14, 13, 1.2, 1.0, 2.2, { surf: 'wood', id: 'E_PAL2' }),
  box('E', 'pallets', 24.5, 16, 1.2, 1.0, 1.2, { surf: 'wood', id: 'E_PAL3' }),
  box('E', 'pallets', 2, 25, 1.2, 1.0, 1.6, { surf: 'wood', id: 'E_PAL4' }),
  box('E', 'pallets', 12, 26.5, 1.2, 1.0, 1.2, { surf: 'wood', id: 'E_PAL5' }),
  box('E', 'pallets', -4, 25.5, 1.2, 1.0, 2.0, { surf: 'wood', id: 'E_PAL6' }),
  box('E', 'pallets', 26.5, 22, 1.2, 1.0, 1.8, { surf: 'wood', id: 'E_PAL7' }),
  box('E', 'drums', 17.5, 2.5, 1.8, 1.2, 0.9, { id: 'E_DRUMS' }),
  box('E', 'spool', 12, 20.5, 1.8, 1.8, 1.8, { surf: 'wood', id: 'E_SPOOL' }),
  box('E', 'truck_cab', 32.5, 2, 2.5, 6, 3.2, { id: 'E_CAB' }),
  box('E', 'pallets', 38, -6, 2.4, 1.2, 1.2, { surf: 'wood', id: 'E_AP_PAL' }),
  box('E', 'dumpster', -26, -8.6, 1.9, 1.2, 1.3, { id: 'E_DUMP' }),
  box('E', 'van', -4, -6, 5.2, 2.0, 2.1, { rot: 0.05, id: 'E_VAN' }),
  box('E', 'skip', 16, -8.7, 4, 1.8, 1.2, { id: 'E_SKIP' }),
  // ===== F quay
  box('F', 'pallets', -2, 36, 1.2, 1.0, 1.2, { surf: 'wood', id: 'F_PAL1' }),
  box('F', 'pallets', 6, 41, 1.2, 1.0, 1.6, { surf: 'wood', id: 'F_PAL2' }),
  box('F', 'pallets', 12, 34.5, 1.2, 1.0, 1.2, { surf: 'wood', id: 'F_PAL3' }),
  box('F', 'pallets', -8, 44.5, 1.2, 1.0, 1.4, { surf: 'wood', id: 'F_PAL4' }),
  box('F', 'tanker_trailer', 26, 33.75, 12, 2.5, 3.6, { id: 'F_TANKER', explosive: { radius: 9, dmg: 'boss', once: true }, note: 'Leviathan mechanism #2' }),
  box('F', 'forklift', 8, 37.5, 1.2, 3.6, 2.2, { rot: 0.5, id: 'F_FORK' }),
  box('F', 'light_tower', -1, 45.5, 1.5, 3, 2, { id: 'F_LIGHTTOWER', mast: 9 }),
  box('F', 'nets', 4, 46.5, 2, 1.5, 0.6, { surf: 'dirt', id: 'F_NETS1' }),
  box('F', 'nets', -30, 44, 2.4, 1.6, 0.7, { surf: 'dirt', id: 'F_NETS2' }),
  box('F', 'jersey', 46, 31, 3, 0.6, 0.81, { surf: 'concrete', id: 'F_J1' }),
  box('F', 'jersey', 50, 31, 3, 0.6, 0.81, { surf: 'concrete', id: 'F_J2' }),
  box('F', 'jersey', 54, 31, 3, 0.6, 0.81, { surf: 'concrete', id: 'F_J3' }),
  box('F', 'jersey', 58, 31, 3, 0.6, 0.81, { surf: 'concrete', id: 'F_J4' }),
  box('F', 'car_burnt', 72, 41.5, 4.6, 1.8, 1.45, { rot: 0.4, id: 'F_CAR', note: 'burning' }),
  ...[-40, -25, -10, 20, 35, 50, 65, 80, 95].map((x) => box('F', 'bollard', x, 47.4, 0.5, 0.5, 0.6, { id: 'F_BOL_' + x })),
  box('F', 'bollard', -3.4, 65.4, 0.5, 0.5, 0.6, { id: 'F_BOL_P1' }),
  box('F', 'bollard', 15.4, 65.4, 0.5, 0.5, 0.6, { id: 'F_BOL_P2' }),
];

// ---------------------------------------------------------------------------------------------------------------
// CONTAINERS — every ISO box in the yard and on the quay. rot 0 = long axis along X, PI/2 = along Z.
// tiers = stacked count. y = base of the lowest box. Colours are deterministic per id.
// ---------------------------------------------------------------------------------------------------------------
const GAP = 0.41;
function colorFor(id) { let h = 7; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % CONTAINER_COLORS.length; }
function cont(zone, id, len, x, z, rot, tiers, extra = {}) {
  return { zone, id, len, x: r2(x), z: r2(z), rot, tiers, y: extra.y ?? P, color: extra.color ?? colorFor(id), ...extra };
}
/** E-W row: boxes end to end from x0 (west end), centred on z. A null tier leaves a gap. */
function rowX(zone, prefix, z, x0, lens, tiers, extra) {
  const out = []; let x = x0;
  lens.forEach((len, i) => { const l = CONTAINER[len].l; if (tiers[i]) out.push(cont(zone, `${prefix}${i}`, len, x + l / 2, z, 0, tiers[i], extra)); x += l + GAP; });
  return out;
}
/** N-S row: boxes end to end from z0 (north end), centred on x. */
function rowZ(zone, prefix, x, z0, lens, tiers, extra) {
  const out = []; let z = z0;
  lens.forEach((len, i) => { const l = CONTAINER[len].l; if (tiers[i]) out.push(cont(zone, `${prefix}${i}`, len, x, z + l / 2, PI / 2, tiers[i], extra)); z += l + GAP; });
  return out;
}
export const CONTAINER_BLOCKS = {
  D_NW: 'north of the ramp; 1-4 high; aisle z -56..-53.5 opens east to spawner SP_D_C1',
  D_REEFER: 'reefer rows with a plug rack (emissive status LEDs)',
  D_C1: 'west-central block south of the ramp; E-W aisles at z -27.8..-24.8 and -16.9..-14.9; wall alley x 40-43 along the plaza retaining wall',
  D_CRANE: 'under the RMG runway: 6 N-S rows with a 5.3 m truck lane (x 51.1-56.4)',
  D_WALL: 'military container wall (3 high, non-climbable) sealing the warehouse apron; D_WALL2 is gate G_DE',
  D_E2: 'east block: 12 E-W rows in 5 groups, 3 m aisles out to the 6.5 m east lane (x 99.5-106)',
  D_CLIMB: 'stack pushed against the dock fence: zombie climb point in R9',
  F_BERTH: 'cargo waiting on the berth apron: R9 east flank cover',
};
export const CONTAINERS = [
  ...[[-62.6, [3, 2]], [-59.86, [4, 4]], [-57.12, [2, 3]], [-52.3, [2, 1]], [-49.56, [3, 2]]]
    .flatMap(([z, t], i) => rowX('D', `D_NW${i}_`, z, 43.2, [40, 40], t, { block: 'D_NW' })),
  ...rowX('D', 'D_RF0_', -62.6, 71.5, [40, 20], [2, 2], { block: 'D_REEFER', reefer: true, color: 5 }),
  ...rowX('D', 'D_RF1_', -59.86, 71.5, [40, 20], [2, 1], { block: 'D_REEFER', reefer: true, color: 5 }),
  ...[[-31.8, [2, 3]], [-29.06, [3, 1]], [-23.6, [4, 2]], [-20.86, [null, 3]], [-18.12, [2, 2]], [-13.66, [3, 4]], [-10.92, [2, 1]]]
    .flatMap(([z, t], i) => rowX('D', `D_C1${i}_`, z, 43.2, [40, 40], t, { block: 'D_C1' })),
  ...[[44.22, [2, 3]], [47.06, [3, 1]], [49.9, [1, null]], [57.62, [2, 2]], [60.46, [4, 3]], [63.3, [1, 2]]]
    .flatMap(([x, t], i) => rowZ('D', `D_CR${i}_`, x, -8.0, [40, 40], t, { block: 'D_CRANE' })),
  ...rowZ('D', 'D_WALL', 41.22, -10.0, [40, 20, 40, 20], [3, 3, 3, 3], { block: 'D_WALL', color: 2, climbable: false }),
  ...[[-26.6, [3, 2]], [-23.86, [2, 4]], [-18.4, [1, 2]], [-15.66, [3, 3]], [-12.92, [2, 1]], [-7.5, [4, 3]], [-4.76, [2, 2]], [-2.02, [3, 1]],
    [3.4, [2, 3]], [6.14, [1, 2]], [8.88, [3, 4]], [13.8, [2, 1]]]
    .flatMap(([z, t], i) => rowX('D', `D_E2${String(i).padStart(2, '0')}_`, z, 80.6, [40, 20], t, { block: 'D_E2' })),
  cont('D', 'D_CLIMB_A', 40, 86 + 6.095, 24.42, 0, 1, { block: 'D_CLIMB' }),
  cont('D', 'D_CLIMB_B', 20, 89 + 3.03, 24.42, 0, 1, { block: 'D_CLIMB', y: 2.59 }),
  cont('A', 'A_CP_0', 20, -99, -58.28, 0, 1, { y: T, color: 2, role: 'command post: radio inside (R2 target), buy station at the east door' }),
  cont('A', 'A_CP_1', 20, -99, -55.84, 0, 1, { y: T, color: 2 }),
  ...rowX('F', 'F_BERTH0_', 33.5, 70, [40, 40], [1, 1], { block: 'F_BERTH' }),
  ...rowX('F', 'F_BERTH1_', 36.24, 70, [40, 40], [2, 1], { block: 'F_BERTH' }),
  cont('F', 'F_BOX_W', 20, -21, 32.22, 0, 1, { note: 'open doors, cover in front of the warehouse wall' }),
  cont('F', 'F_BOX_E', 20, 64, 30.5, PI / 2, 1, { note: 'east flank cover for the dock gate' }),
];
//@@REST@@
