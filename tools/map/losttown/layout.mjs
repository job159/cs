// 失落之城 LOST TOWN — level-design source of truth (blockout data) for the zone builders, the nav baker,
// the blockout renderer and map.json. Recreation (own geometry, own names) of the layout of CSO Zombie Scenario
// Season-1 survival map "Lost City" (zs_lostcity): an inverted cross of downtown street canyons with a container
// fort in the central intersection. Research, sources and intent: docs/MAP_LOSTTOWN.md.
// Pure data + small helpers (no three.js import) so build scripts, the runtime and tools can share it.
//
// FRAME (metres)
//   Origin = centre of the central intersection (fort centre) at street level. +X = east, +Y = up, +Z = south;
//   north = -Z. 2D points are [x, z]; 3D points are [x, y, z].
//   Yaw (player / spawner facing) follows the game: forward = (-sin(yaw), 0, -cos(yaw)); 0 = N, -PI/2 = E, PI = S,
//   PI/2 = W. yawTo(from, to) aims. `rot` = three.js rotation.y (radians; positive = counter-clockwise on a
//   north-up map). Boxes: { x, z } = centre on the ground, w = size along local X, d = along local Z, h = height,
//   y = base height. Faces: N (min z), S (max z), E (max x), W (min x), C (chamfer). `along` = [from, to] in world
//   x for N/S faces, world z for E/W faces, 0..1 from the chamfer's first point for C.
//   Scale: the reference minimap gives ~0.16 m/px for the original; we build at 1.25x that (streets 16-18 m
//   building-to-building, a realistic downtown right-of-way) so 4 players + 40 zombies + a 7 m boss fit.

export const PI = Math.PI;
export const YAW = { N: 0, E: -PI / 2, S: PI, W: PI / 2 };
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
/** Game yaw that looks from [x,z] `from` towards [x,z] `to`. */
export const yawTo = (from, to) => r3(Math.atan2(-(to[0] - from[0]), -(to[1] - from[1])));
/** Axis-aligned rectangle polygon [x0,z0]-[x1,z1] (x0<x1, z0<z1). */
export const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
/** three.js rotation.y applied to a local [x,z] offset. */
export const rotXZ = (x, z, rot) => [x * Math.cos(rot) + z * Math.sin(rot), -x * Math.sin(rot) + z * Math.cos(rot)];
/** Quarter-circle curb return: points from a to b around centre c (n segments). */
function arc(c, rad, a0, a1, n = 4) {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push([r2(c[0] + Math.cos(a) * rad), r2(c[1] + Math.sin(a) * rad)]); }
  return out;
}

export const LEVEL = { street: 0, curb: 0.15, fortDeck: 2.59, killY: -10 };
const G = LEVEL.street, SW = LEVEL.curb;

export const META = {
  id: 'losttown',
  name: '失落之城',
  nameEn: 'LOST TOWN',
  chapter: '第一章：失落之城',
  inspiredBy: 'CSO Zombie Scenario S1-1 "Lost City" (zs_lostcity) — layout/landmarks/mood recreated from public reference footage; all geometry, names, signage, textures and lighting are original',
  size: [142, 152],
  // [minx, miny, minz, maxx, maxy, maxz]: playable/nav bounds (facades, backdrop and sky extend beyond)
  bounds: [-76, -2, -76, 68, 45, 76],
  killY: LEVEL.killY,
  axes: '+X east, +Y up, +Z south; north = -Z',
  yawConvention: 'forward = (-sin(yaw), 0, -cos(yaw)); 0 = N, -PI/2 = E, PI = S, PI/2 = W',
  player: { height: 1.8, eye: 1.64, crouchEye: 1.1, radius: 0.34, jump: 0.96, step: 0.45, runSpeed: 5.0, maxRampDeg: 40 },
  bosses: { butcher: { radius: 1.0, height: 4.0, designFor: 6.0 }, colossus: { radius: 1.8, height: 7.0, designFor: 8.0 } },
  coverClasses: { low: '<= 1.0 m (crouch cover; players jump it, zombies vault)', chest: '1.0-1.5 m (shoot over standing)', full: '> 1.5 m (blocks sight)' },
  storey: { ground: 4.5, upper: 3.4, note: '1900-1930 North-American downtown: tall shop floor, 3.4 m upper floors' },
  navFlags: { WALK: 1, WATER: 2, CLIMB: 4, BLOCK: 8, NOBOSS: 16, note: 'NOBOSS (proposed): cells bosses must not enter — fort deck, ramps, zombie gaps, alleys, tunnel pocket' },
};

// ---------------------------------------------------------------------------------------------------------------
// ENVIRONMENT — stormy overcast late afternoon over a sealed-off downtown. Sickly green-grey cloud deck (the
// reference sky), the sun breaks through low in the WSW: upper floors and the fort roof catch warm light, the
// street canyons stay in cool shadow. Damp asphalt, drifting ash/paper, distant sirens and thunder.
// ---------------------------------------------------------------------------------------------------------------
function sunDir(bearingDeg, elevDeg) {
  const b = (bearingDeg * PI) / 180, e = (elevDeg * PI) / 180;
  return [r3(Math.sin(b) * Math.cos(e)), r3(Math.sin(e)), r3(-Math.cos(b) * Math.cos(e))]; // towards the sun
}
export const ENV = {
  timeOfDay: '17:10, early autumn, storm front rolling in; sun breaking through a gap in the cloud deck',
  sun: {
    bearingDeg: 242, elevationDeg: 30, dir: sunDir(242, 30), color: '#ffdcb4', intensity: 2.0,
    shadow: { mapSize: 2048, extent: 40, followPlayer: true, texelSnap: true, near: 1, far: 220, bias: -0.0004, normalBias: 0.03 },
    note: 'low WSW sun: lights the W arm lengthwise (silhouettes the LED gantry), rakes the fort roof, leaves N/S canyons in shadow',
  },
  sky: {
    hdri: 'overcast_soil_puresky', res: '1k', alt: ['kloppenheim_01_puresky', 'kloppenheim_07_puresky'],
    rotationDeg: 0, envIntensity: 0.55, backgroundIntensity: 0.7,
    tint: '#9fae94', note: 'tint the background towards green-grey (reference: dark olive storm clouds); optional cloud dome layer with slow scroll + lightning flashes (round 10)',
  },
  fog: { color: '#5b6459', density: 0.0105, note: 'FogExp2: ~50% at 80 m — the ends of the arms (60-75 m) dissolve; skyline towers are silhouettes' },
  exposure: 1.0,
  grade: 'desaturated (-15%), green-grey midtones, cool shadows (#6f7d86), warm sun highlights (#ffd3a0); emissive signs read saturated amber/red',
  ambient: { hemiSky: '#8e9a8a', hemiGround: '#3d3a33', hemiIntensity: 0.35, note: 'only if the HDRI env is disabled at low quality' },
  wind: { dirDeg: 60, strength: 0.3, note: 'newspapers and ash drift NE; awnings and banners flutter; smoke columns lean NE' },
  ambientFx: ['ash flakes + paper scraps blowing down the arms', 'smoke columns from the burning car (E cross) and behind the skyline', 'distant thunder + sirens', 'flies over dumpsters', 'dripping water under the rail bridge', 'flickering signage'],
};

// ---------------------------------------------------------------------------------------------------------------
// STREETS — right-of-way (building line to building line). carriageway = asphalt between the curbs; sidewalks
// are raised 0.15 m. Ends marked `pocket` are zombie spawn pockets behind a barricade (outside player reach).
// ---------------------------------------------------------------------------------------------------------------
export const STREETS = [
  { id: 'X_CORE', name: '中央十字路口', nameEn: 'Central Intersection', zone: 'center', row: rect(-9, -9, 9, 9), chamfers: 'corner buildings are cut at 45 deg (6-7 m legs) -> an octagonal plaza ~30 m across',
    note: 'the container fort (LM_FORT) sits in the middle, rotated 20 deg; crosswalks at each arm mouth' },
  { id: 'ST_N', name: '北大道', nameEn: 'North Avenue', zone: ['center', 'north'], axis: 'z', centerline: [[0, -9], [0, -62]], width: 18, carriageway: 11, sidewalk: 3.5,
    row: rect(-9, -62, 9, -9), note: 'the long arm (53 m) of the inverted cross; ends at the rail bridge LM_BRIDGE; longest sightline; final-boss runway' },
  { id: 'ST_N_TUNNEL', name: '鐵橋下通道', nameEn: 'Bridge Underpass', zone: 'north', axis: 'z', centerline: [[0, -62], [0, -76]], width: 14, carriageway: 11, sidewalk: 1.5,
    row: rect(-7, -76, 7, -62), pocket: rect(-7, -76, 7, -64.6), note: 'dark 12 m underpass; barricade at the mouth (z -64.6..-62.1); spawn pocket behind' },
  { id: 'ST_W', name: '西街', nameEn: 'West Street', zone: ['center', 'west'], axis: 'x', centerline: [[-9, 0], [-54, 0]], width: 18, carriageway: 11, sidewalk: 3.5,
    row: rect(-54, -9, -9, 9), note: 'box truck parked mid-street (22-30 m out); at its end the LED gantry is seen over the cross street' },
  { id: 'ST_WX', name: '西橫街', nameEn: 'West Cross Street', zone: 'west', axis: 'z', centerline: [[-60, -34], [-60, 38]], width: 12, carriageway: 7, sidewalk: 2.5,
    row: rect(-66, -34, -54, 38), pockets: [rect(-66, -34, -54, -26.4), rect(-66, 30.4, -54, 38)], note: 'T at the west end; zombies pour in from both ends (barricades at z -26 and +30)' },
  { id: 'ST_W_STUB', name: '西街盡頭（LED 路障）', nameEn: 'West Street stub', zone: 'west', axis: 'x', centerline: [[-66, 0], [-76, 0]], width: 18, carriageway: 11, sidewalk: 3.5,
    row: rect(-76, -9, -66, 9), pocket: rect(-76, -9, -71.1, 9), note: 'continuation of West Street sealed by the LED gantry barricade at x -71..-68.6' },
  { id: 'ST_E', name: '東街', nameEn: 'East Street', zone: ['center', 'east'], axis: 'x', centerline: [[9, 0], [52, 0]], width: 18, carriageway: 11, sidewalk: 3.5,
    row: rect(9, -9, 52, 9), note: 'abandoned army truck slewed across the lanes near the T' },
  { id: 'ST_EX', name: '東橫街', nameEn: 'East Cross Street', zone: 'east', axis: 'z', centerline: [[59, -34], [59, 34]], width: 14, carriageway: 8, sidewalk: 3,
    row: rect(52, -34, 66, 34), pockets: [rect(52, -34, 66, -26.4), rect(52, 26.4, 66, 34)], note: 'T at the east end facing the moving-and-storage warehouse; barricades at z -26 (police cars) and +26 (bus)' },
  { id: 'ST_S', name: '南大道', nameEn: 'South Avenue', zone: ['center', 'south'], axis: 'z', centerline: [[0, 9], [0, 48]], width: 16, carriageway: 10, sidewalk: 3,
    row: rect(-8, 9, 8, 48), note: 'red/white awnings both sides; mid-boss lane' },
  { id: 'ST_SX', name: '南橫街', nameEn: 'South Cross Street', zone: 'south', axis: 'x', centerline: [[-38, 53], [38, 53]], width: 10, carriageway: 6, sidewalk: 2,
    row: rect(-38, 48, 38, 58), pockets: [rect(-38, 48, -30.4, 58), rect(30.4, 48, 38, 58)], note: 'narrow cross street; barricades at x -30 and +30' },
  { id: 'ST_S_EXT', name: '南巷', nameEn: 'South Lane', zone: 'south', axis: 'z', centerline: [[0, 58], [0, 76]], width: 16, carriageway: 10, sidewalk: 3,
    row: rect(-8, 58, 8, 76), pocket: rect(-8, 70.6, 8, 76), note: 'continuation of South Avenue; jack-knifed box truck barricade at z 68-70.5 (mid-boss smashes through)' },
  { id: 'AL_NE', name: '北段東側後巷', nameEn: 'North-east service alley', zone: 'north', axis: 'x', width: 3, row: rect(9, -53, 24, -50), pocket: rect(13.6, -53, 24, -50),
    note: 'alley between N_E2 and N_E3; 2.4 m chain-link fence at x 13.5 with a torn gap (zombie gap)' },
  { id: 'AL_SE', name: '東段南側後巷', nameEn: 'South-east service alley', zone: 'east', axis: 'z', width: 3, row: rect(40, 9, 43, 24), pocket: rect(40, 17.1, 43, 24),
    note: 'alley between E_S1 and E_S2; fence at z 17 with a torn gap' },
];

// Curb lines (carriageway edges) per street; sidewalks fill row minus carriageway. The four curb returns at the
// central intersection are quarter circles of radius 3 m.
export const CURBS = {
  ST_N: { x: [-5.5, 5.5] }, ST_N_TUNNEL: { x: [-5.5, 5.5] }, ST_W: { z: [-5.5, 5.5] }, ST_W_STUB: { z: [-5.5, 5.5] }, ST_WX: { x: [-63.5, -56.5] },
  ST_E: { z: [-5.5, 5.5] }, ST_EX: { x: [55, 63] }, ST_S: { x: [-5, 5] }, ST_S_EXT: { x: [-5, 5] }, ST_SX: { z: [50, 56] },
  returns: [
    { corner: 'NW', center: [-8.5, -8.5], radius: 3, pts: arc([-8.5, -8.5], 3, 0, PI / 2) },
    { corner: 'NE', center: [8.5, -8.5], radius: 3, pts: arc([8.5, -8.5], 3, PI / 2, PI) },
    { corner: 'SE', center: [8, 8.5], radius: 3, pts: arc([8, 8.5], 3, PI, 1.5 * PI) },
    { corner: 'SW', center: [-8, 8.5], radius: 3, pts: arc([-8, 8.5], 3, 1.5 * PI, 2 * PI) },
  ],
  height: SW, material: 'granite curb 0.3 wide, worn, with a 0.4 m concrete gutter strip on the road side',
};

// Ground surfaces in paint order (later covers earlier). y = top height. mat = preferred CC0 texture (common set
// id in game/assets/maps/common/textures.json first, Poly Haven id second).
export const SURFACES = [
  { id: 'ROAD_ALL', kind: 'asphalt', y: G, mat: 'asphalt_cracked (asphalt_02) + asphalt (asphalt_04) blend; patches + potholes (decals)', surf: 'concrete',
    polys: ['carriageways of every street + the intersection core rect(-5.5,-5.5,5.5,5.5)'] },
  { id: 'SIDEWALKS', kind: 'sidewalk', y: SW, mat: 'concrete_floor (concrete_floor_worn_001) cut into 1.5 m flagstones; granite curbs', surf: 'concrete',
    polys: ['row minus carriageway for every street; corner plazas at the chamfers'] },
  { id: 'CROSSWALKS', kind: 'paint', y: G + 0.005, mat: 'road_paint white, worn 40%', surf: 'concrete',
    polys: [rect(-5.5, -14.5, 5.5, -11), rect(-5, 11, 5, 14.5), rect(-14.5, -5.5, -11, 5.5), rect(11, -5.5, 14.5, 5.5)], note: 'zebra bars 0.5 m / gaps 0.5 m along the walking direction' },
  { id: 'LANE_LINES', kind: 'paint', y: G + 0.005, mat: 'road_paint: white dashed centre line (3 m dash / 6 m gap), solid yellow 0.12 m edge lines 0.4 m off each curb', surf: 'concrete' },
  { id: 'TUNNEL_FLOOR', kind: 'asphalt', y: G, mat: 'asphalt_cracked, wet (roughness 0.35, puddles)', surf: 'concrete', polys: [rect(-5.5, -76, 5.5, -62)] },
  { id: 'FORT_DECK', kind: 'steel', y: LEVEL.fortDeck, mat: 'container roofs (corrugated container_side / corrugated) + plank boards (wood_planks) + perforated ramps (grate)', surf: 'metal' },
];

// ---------------------------------------------------------------------------------------------------------------
// FACADE STYLES — what the building builder generates. Bays and windows in metres. Textures: common set id first,
// Poly Haven id second. Every building gets dirt/leak streak decals, broken panes (25-40%), boarded ground windows.
// ---------------------------------------------------------------------------------------------------------------
export const FACADES = {
  limestone_grand: {
    walls: ['plaster tinted #b9b4a6 + procedural ashlar joints', 'concrete_wall_008'], base: 'rusticated stone 2 storeys (deep joints), granite plinth 0.6 m',
    bay: 3.2, window: [1.3, 2.0], sill: 0.85, arch: 'top-floor windows round-arched; 3F + 8F balustraded balconettes; heavy cornice + frieze at the parapet',
    ground: 'tall arched openings (hotel lobby on the chamfer, shops on the flanks)', extras: 'sooty streaks under sills, copper flashing (verdigris), flag pole stubs',
  },
  brick_commercial: {
    walls: ['brick_red (red_brick)', 'factory_brick'], base: 'cast-iron storefront (painted blue/green), stone lintels and sills',
    bay: 3.0, window: [1.2, 1.9], sill: 0.9, arch: 'segmental brick arches; stone string course every floor; pressed-metal cornice',
    ground: 'shopfronts 4.5 m tall: transom band + sign fascia (0.9 m) + display windows; recessed doors', extras: 'awnings, blade signs, hand-painted window ads, posters',
  },
  brick_dark: {
    walls: ['brick_painted tinted #5a3a2c (dark_brick_wall)', 'brick_red darkened'], base: 'stone ground floor (concrete_wall)',
    bay: 2.8, window: [1.1, 1.7], sill: 0.9, arch: 'flat stone lintels, 1-over-1 sashes, some boarded; black iron fire escapes on the street face',
    ground: 'narrow shops + apartment entrance with steel door', extras: 'fire escape (landings each floor, drop ladder), window AC units, laundry lines',
  },
  stone_office: {
    walls: ['concrete_wall (beige tint #a99f8a)', 'plastered_wall'], base: 'polished granite 1 storey',
    bay: 3.6, window: [2.6, 1.8], sill: 0.8, arch: 'Chicago windows (fixed centre + two sashes), pilasters every 2 bays, flat cornice',
    ground: 'large plate-glass shopfronts / bank doors', extras: 'rooftop billboards on steel frames (C_NE), bronze lettering',
  },
  painted_brick: {
    walls: ['brick_painted tinted (cream #c9c0a5 / pale green #9fae96)'], base: 'painted brick, peeling to red underneath',
    bay: 3.0, window: [1.2, 1.7], sill: 0.9, arch: 'simple', ground: 'roller shutters + steel doors', extras: 'faded painted wall ads (ghost signs), drain pipes',
  },
  industrial_brick: {
    walls: ['brick_red (factory_brick)'], base: 'concrete loading dock 1.1 m high, steel bumpers',
    bay: 6.0, window: [3.0, 2.4], sill: 1.2, arch: 'large steel-sash windows (many panes broken)', ground: 'roller doors 5 m wide, personnel doors',
    extras: 'painted company name across the parapet, hoist beam, gutter downpipes',
  },
  diner_lowrise: {
    walls: ['plaster tinted #c8beae', 'metal_painted (stainless trim)'], base: 'tile skirt (tiles)',
    bay: 2.4, window: [2.0, 1.4], sill: 0.9, arch: 'ribbon windows, rounded corner', ground: 'diner booths visible through broken glass',
    extras: 'rooftop neon sign frame "DINER" (dead), HVAC boxes, roof hatch',
  },
};

// ---------------------------------------------------------------------------------------------------------------
// BUILDINGS (playable edge). floors = storey heights bottom-up (sum = roof height); parapet on top.
// openings: unlisted windows/doors are generated from the facade rhythm and are BLOCKED (glass/boards/shutter in
// collision). state: enterable | blocked | spawn (a spawner uses it) | breakable.
// ---------------------------------------------------------------------------------------------------------------
const F = (ground, n, upper = 3.4) => [ground, ...Array(n - 1).fill(upper)];
export const BUILDINGS = [
  // ===================== CENTER: the four hero corner buildings around the intersection
  {
    id: 'C_NW', zone: 'center', name: '艾許福大飯店（失落之城字牌）', nameEn: 'Hotel Ashford (LOST TOWN letter boards)',
    footprint: [[-26, -26], [-9, -26], [-9, -15], [-15, -9], [-26, -9]], baseY: G, floors: F(5.0, 9, 3.3), parapet: 1.5, roof: 'flat',
    facade: 'limestone_grand', faces: ['E', 'C', 'S'], chamfer: [[-9, -15], [-15, -9]],
    openings: [
      { face: 'C', along: [0.3, 0.7], floor: 0, type: 'lobby_doors', state: 'blocked', note: 'revolving door + side doors boarded with plywood, sandbags in front' },
      { face: 'E', along: [-24, -17], floor: 0, type: 'shopfront', state: 'blocked', note: 'tailor shop, steel shutter down, posters' },
      { face: 'S', along: [-24, -17], floor: 0, type: 'shopfront', state: 'blocked', note: 'blue shopfront, smashed glass behind a scissor gate' },
    ],
    signs: [
      { type: 'letter_boards', text: 'LOST / TOWN', face: 'C', y: [10.5, 16.8], note: 'HERO SIGN: 8 individual weathered cream boards (1.6 x 2.1 m) with black-brown serif letters on steel brackets, two rows, slightly tilted / mis-hung, one board hanging by a chain; readable from the fort roof' },
      { type: 'blade', text: 'HOTEL ASHFORD', face: 'E', along: [-24.5, -23.5], y: [7, 19], note: 'vertical enamel sign, dead bulbs' },
    ],
    roofItems: ['wooden water tower on steel legs (3.5 m dia, top at roof+7)', 'elevator penthouse', 'antenna'],
    note: 'tallest corner (32.9 m). The LOST TOWN boards face the fort diagonally (normal points to the origin). Bike-signal mast stands in front of the chamfer.',
  },
  {
    id: 'C_NE', zone: 'center', name: '可樂廣告大樓', nameEn: 'Billboard Building',
    footprint: [[9, -26], [26, -26], [26, -9], [15, -9], [9, -15]], baseY: G, floors: F(4.5, 6), parapet: 1.0, roof: 'flat',
    facade: 'stone_office', faces: ['W', 'C', 'S'], chamfer: [[9, -15], [15, -9]],
    openings: [
      { face: 'C', along: [0.25, 0.75], floor: 0, type: 'shopfront', state: 'blocked', note: 'cafe, red/white striped awning (torn), chairs stacked inside' },
      { face: 'C', along: [0.4, 0.6], floor: 1, type: 'window', state: 'spawn', spawner: 'SP_C_WIN_NE', note: 'smashed 2F window: elites leap out onto the plaza (R6+)' },
      { face: 'S', along: [17, 24], floor: 0, type: 'shopfront', state: 'blocked', note: 'blue shopfront, roller shutter half down (0.9 m gap, collision closed)' },
      { face: 'W', along: [-24, -17], floor: 0, type: 'shopfront', state: 'blocked', note: 'shoe repair, poster-covered glass' },
    ],
    signs: [
      { type: 'billboard', text: 'FIZZ COLA — "ICE COLD"', face: 'W', y: [22.5, 27], along: [-24, -15], note: 'vintage red cola billboard on a steel catwalk frame (our own brand + artwork), peeling paper' },
      { type: 'billboard', text: '(faded movie poster)', face: 'C', y: [22.5, 27], note: 'torn paper poster, sepia' },
      { type: 'billboard', text: 'FIZZ COLA — "DELICIOUS AND REFRESHING"', face: 'S', y: [22.5, 27], along: [15, 24] },
    ],
    note: 'reference "cola billboard corner": 3 rooftop billboards wrap the chamfer; traffic signal on the chamfer corner',
  },
  {
    id: 'C_SE', zone: 'center', name: '楓糖果行大樓', nameEn: 'Maple Sweets Building',
    footprint: [[15, 9], [26, 9], [26, 26], [8, 26], [8, 16]], baseY: G, floors: F(4.5, 7), parapet: 0.9, roof: 'flat',
    facade: 'brick_commercial', faces: ['N', 'C', 'W'], chamfer: [[8, 16], [15, 9]],
    openings: [
      { face: 'C', along: [0.15, 0.85], floor: 0, type: 'shopfront', state: 'enterable', sill: 0.55, note: 'candy shop: door smashed open, display window vaultable (0.55 sill)' },
      { face: 'W', along: [17, 24], floor: 0, type: 'shopfront', state: 'blocked', note: 'SALE 75% / 50% posters, yellow sign band' },
      { face: 'N', along: [17, 24], floor: 0, type: 'shopfront', state: 'blocked', note: 'barber, shutter' },
    ],
    interior: { poly: [[15.4, 9.6], [21, 9.6], [21, 15], [14.5, 21], [8.6, 21], [8.6, 16.4]], floorY: SW, ceiling: 4.2, exits: 'only the chamfer front',
      contents: 'candy shelves (1.6 m) along the walls, glass counter (1.0 m) across the back, jars and boxes spilled, a ceiling fan, a supply point (SUP_C_SHOP)' },
    signs: [
      { type: 'fascia', text: 'MAPLE SWEETS 楓糖果行', face: 'C', y: [3.4, 4.3] },
      { type: 'awning', face: 'C', y: [2.7, 3.4], depth: 1.6, color: 'green/white stripes', note: 'reference: green striped awning at the candy corner' },
      { type: 'blade', text: 'SWEETS', face: 'W', along: [24.5, 25.5], y: [6, 15], note: 'dead neon tubes' },
    ],
    note: 'enterable shallow shop = risky hideout on the plaza edge (one entrance, gets swarmed)',
  },
  {
    id: 'C_SW', zone: 'center', name: '馬里諾餐館大樓', nameEn: "Marino's Building",
    footprint: [[-15, 9], [-8, 16], [-8, 26], [-26, 26], [-26, 9]], baseY: G, floors: F(4.5, 8), parapet: 1.0, roof: 'flat',
    facade: 'brick_dark', faces: ['N', 'C', 'E'], chamfer: [[-8, 16], [-15, 9]],
    openings: [
      { face: 'C', along: [0.2, 0.8], floor: 0, type: 'shopfront', state: 'blocked', note: 'restaurant, windows boarded, chairs and tables piled against them' },
      { face: 'C', along: [0.4, 0.6], floor: 1, type: 'window', state: 'spawn', spawner: 'SP_C_WIN_SW' },
      { face: 'E', along: [17, 25], floor: 0, type: 'wall', state: 'blocked', note: 'poster wall (blue shopfront frame), bill posters layered' },
      { face: 'N', along: [-25, -17], floor: 0, type: 'shopfront', state: 'blocked', note: 'yellow sign band "SALE"' },
    ],
    signs: [
      { type: 'fascia', text: "MARINO'S 馬里諾餐館", face: 'C', y: [3.3, 4.3], color: 'red board, cream script' },
      { type: 'blade', text: 'RESTAURANT', face: 'N', along: [-15.8, -15.2], y: [5, 12] },
    ],
    fireEscape: { face: 'E', along: [18, 24], floors: [1, 7], note: 'black iron, drop ladder raised' },
  },

  // ===================== NORTH: North Avenue, both sides
  {
    id: 'N_W1', zone: 'north', name: '熟食店大樓', nameEn: 'Delicatessen Building',
    footprint: rect(-24, -40, -9, -26), baseY: G, floors: F(4.5, 7), parapet: 0.9, roof: 'flat', facade: 'brick_commercial', faces: ['E'],
    openings: [
      { face: 'E', along: [-38.6, -31.2], floor: 0, type: 'shopfront', state: 'enterable', sill: 0.6, note: 'deli window smashed (vault 0.6) + open door at z -31.2..-29.8' },
      { face: 'E', along: [-31.2, -29.8], floor: 0, type: 'door', state: 'enterable' },
      { face: 'E', along: [-28.6, -27.4], floor: 0, type: 'door', state: 'blocked', note: 'apartment entrance' },
      { face: 'E', along: [-33.6, -32.4], floor: 1, type: 'window', state: 'spawn', spawner: 'SP_N_WIN_W' },
    ],
    interior: { poly: rect(-17, -39.4, -9.3, -26.6), floorY: SW, ceiling: 4.2, exits: 'front only (back door to the kitchen is blocked)',
      contents: 'deli counter with glass cases (1.1 m) along x -15, meat slicer, fridge wall (2.2 m) at the back, 2 shelf rows (1.5 m), flickering fluorescent tubes (L_DELI)' },
    signs: [
      { type: 'blade', text: 'DELICATESSEN', face: 'E', along: [-26.8, -26.2], y: [6.5, 19], note: 'reference landmark: tall cream vertical sign, black letters, readable from the fort' },
      { type: 'fascia', text: 'DELI · 熟食', face: 'E', y: [3.4, 4.3] },
      { type: 'awning', face: 'E', along: [-38.6, -29.8], y: [2.8, 3.4], depth: 1.5, color: 'red/white stripes', note: 'the famous striped awning' },
    ],
  },
  {
    id: 'N_W2', zone: 'north', name: '魚舖公寓', nameEn: 'Fish Market Flats',
    footprint: rect(-24, -50, -9, -40), baseY: G, floors: F(4.5, 5), parapet: 0.8, roof: 'flat', facade: 'brick_dark', faces: ['E'],
    openings: [{ face: 'E', along: [-49, -41], floor: 0, type: 'shopfront', state: 'blocked', note: 'fish shop: blue fascia "FISH", roller shutter with graffiti' }],
    signs: [{ type: 'fascia', text: 'FRESH FISH 鮮魚', face: 'E', y: [3.3, 4.2], color: 'blue' }, { type: 'awning', face: 'E', along: [-49, -41], y: [2.8, 3.4], depth: 1.4, color: 'red/white stripes' }],
    fireEscape: { face: 'E', along: [-47, -43], floors: [1, 4] },
  },
  {
    id: 'N_W3', zone: 'north', name: '第一國民銀行', nameEn: 'First National Bank',
    footprint: rect(-24, -62, -9, -50), baseY: G, floors: F(5.0, 8), parapet: 1.2, roof: 'flat', facade: 'stone_office', faces: ['E'],
    openings: [{ face: 'E', along: [-58, -54], floor: 0, type: 'doors', state: 'blocked', note: 'bronze bank doors chained, granite steps' }],
    signs: [{ type: 'letters', text: 'FIRST NATIONAL BANK', face: 'E', y: [4.0, 4.6], note: 'bronze letters, some missing' }],
    note: 'abuts the rail bridge abutment at z -62',
  },
  {
    id: 'N_E1', zone: 'north', name: '防火梯公寓', nameEn: 'Fire-escape Apartments',
    footprint: rect(9, -40, 24, -26), baseY: G, floors: F(4.5, 8), parapet: 0.9, roof: 'flat', facade: 'brick_dark', faces: ['W'],
    openings: [
      { face: 'W', along: [-39, -33], floor: 0, type: 'shopfront', state: 'blocked', note: 'news & tobacco, shutter' },
      { face: 'W', along: [-36.6, -35.4], floor: 1, type: 'window', state: 'spawn', spawner: 'SP_N_WIN_E' },
    ],
    fireEscape: { face: 'W', along: [-37, -31], floors: [1, 8] },
    signs: [{ type: 'fascia', text: 'NEWS · TOBACCO', face: 'W', y: [3.3, 4.2] }],
  },
  {
    id: 'N_E2', zone: 'north', name: '麵包坊', nameEn: 'Bakery',
    footprint: rect(9, -50, 24, -40), baseY: G, floors: F(4.5, 4), parapet: 0.8, roof: 'flat', facade: 'brick_commercial', faces: ['W', 'N'],
    openings: [{ face: 'W', along: [-49, -41], floor: 0, type: 'shopfront', state: 'blocked', note: 'bakery, boarded' }],
    signs: [{ type: 'awning', face: 'W', along: [-49, -41], y: [2.8, 3.4], depth: 1.4, color: 'red/white stripes' }, { type: 'fascia', text: 'BAKERY 麵包坊', face: 'W', y: [3.3, 4.2] }],
  },
  {
    id: 'N_E3', zone: 'north', name: '倉儲辦公樓', nameEn: 'Warehouse Offices',
    footprint: rect(9, -62, 24, -53), baseY: G, floors: F(4.5, 6), parapet: 0.9, roof: 'flat', facade: 'painted_brick', faces: ['W', 'S'],
    openings: [{ face: 'W', along: [-61, -54], floor: 0, type: 'shutters', state: 'blocked' }],
    signs: [{ type: 'ghost_sign', text: 'faded painted wall ad (our own: "ROYAL OATS")', face: 'S', y: [6, 18], note: 'on the side wall above the alley' }],
  },

  // ===================== WEST: West Street + West Cross Street
  {
    id: 'W_N1', zone: 'west', name: '藥局公寓', nameEn: 'Pharmacy Flats',
    footprint: rect(-40, -24, -26, -9), baseY: G, floors: F(4.5, 6), parapet: 0.9, roof: 'flat', facade: 'brick_commercial', faces: ['S'],
    openings: [{ face: 'S', along: [-39, -31], floor: 0, type: 'shopfront', state: 'blocked', note: 'pharmacy, green cross (dead neon), shutter' }],
    fireEscape: { face: 'S', along: [-36, -30], floors: [1, 6], note: 'SP_W_ROOF: zombies climb down from the 3F landing (drop ladder lowered)' },
    signs: [{ type: 'blade', text: 'PHARMACY +', face: 'S', along: [-31.2, -30.6], y: [4.8, 9] }],
  },
  {
    id: 'W_N2', zone: 'west', name: '轉角五金行', nameEn: 'Corner Hardware',
    footprint: rect(-54, -34, -40, -9), baseY: G, floors: F(4.5, 5), parapet: 0.8, roof: 'flat', facade: 'painted_brick', faces: ['S', 'W'],
    openings: [{ face: 'S', along: [-53, -41], floor: 0, type: 'shutters', state: 'blocked' }, { face: 'W', along: [-24, -12], floor: 0, type: 'shutters', state: 'blocked' }],
    signs: [{ type: 'fascia', text: 'HARDWARE 五金', face: 'S', y: [3.3, 4.2] }],
  },
  {
    id: 'W_S1', zone: 'west', name: '黃招牌特賣店', nameEn: 'Sale Store',
    footprint: rect(-40, 9, -26, 24), baseY: G, floors: F(4.5, 6), parapet: 0.9, roof: 'flat', facade: 'stone_office', faces: ['N'],
    openings: [
      { face: 'N', along: [-39, -27], floor: 0, type: 'shopfront', state: 'blocked', note: 'yellow sign band, SALE posters in every pane (reference)' },
      { face: 'N', along: [-33.6, -32.4], floor: 1, type: 'window', state: 'spawn', spawner: 'SP_W_WIN' },
    ],
    signs: [{ type: 'fascia', text: 'BIG SALE 大特賣', face: 'N', y: [3.3, 4.3], color: 'yellow' }],
  },
  {
    id: 'W_S2', zone: 'west', name: '轉角公寓', nameEn: 'Corner Flats',
    footprint: rect(-54, 9, -40, 38), baseY: G, floors: F(4.5, 7), parapet: 0.9, roof: 'flat', facade: 'brick_dark', faces: ['N', 'W'],
    openings: [{ face: 'N', along: [-53, -41], floor: 0, type: 'shopfront', state: 'blocked' }, { face: 'W', along: [12, 28], floor: 0, type: 'shutters', state: 'blocked' }],
    fireEscape: { face: 'W', along: [14, 20], floors: [1, 7] },
  },
  {
    id: 'X_W1', zone: 'west', name: '西側公寓', nameEn: 'West Row Flats',
    footprint: rect(-82, -34, -66, -9), baseY: G, floors: F(4.5, 6), parapet: 0.9, roof: 'flat', facade: 'brick_commercial', faces: ['E', 'S'],
    openings: [{ face: 'E', along: [-32, -12], floor: 0, type: 'shopfront', state: 'blocked' }],
  },
  {
    id: 'X_W2', zone: 'west', name: '西側舊旅館', nameEn: 'Old Commercial Hotel',
    footprint: rect(-82, 9, -66, 38), baseY: G, floors: F(4.5, 8), parapet: 1.2, roof: 'flat', facade: 'limestone_grand', faces: ['E', 'N'],
    openings: [{ face: 'E', along: [12, 34], floor: 0, type: 'shopfront', state: 'blocked' }],
  },

  // ===================== EAST: East Street + East Cross Street
  {
    id: 'E_N1', zone: 'east', name: '東街公寓', nameEn: 'East Street Flats',
    footprint: rect(26, -24, 40, -9), baseY: G, floors: F(4.5, 7), parapet: 0.9, roof: 'flat', facade: 'brick_dark', faces: ['S'],
    openings: [
      { face: 'S', along: [27, 39], floor: 0, type: 'shopfront', state: 'blocked' },
      { face: 'S', along: [32.4, 33.6], floor: 1, type: 'window', state: 'spawn', spawner: 'SP_E_WIN' },
    ],
  },
  {
    id: 'E_N2', zone: 'east', name: '自助洗衣店', nameEn: 'Laundromat Corner',
    footprint: rect(40, -34, 52, -9), baseY: G, floors: F(4.5, 5), parapet: 0.8, roof: 'flat', facade: 'painted_brick', faces: ['S', 'E'],
    openings: [{ face: 'S', along: [41, 51], floor: 0, type: 'shopfront', state: 'blocked', note: 'laundromat, washers visible' }],
    signs: [{ type: 'fascia', text: 'LAUNDROMAT 自助洗衣', face: 'S', y: [3.3, 4.2] }],
  },
  {
    id: 'E_S1', zone: 'east', name: '理髮店公寓', nameEn: 'Barber Flats',
    footprint: rect(26, 9, 40, 24), baseY: G, floors: F(4.5, 4), parapet: 0.8, roof: 'flat', facade: 'brick_commercial', faces: ['N'],
    openings: [{ face: 'N', along: [27, 39], floor: 0, type: 'shopfront', state: 'blocked', note: 'barber shop + barber pole' }],
    fireEscape: { face: 'N', along: [28, 34], floors: [1, 4], note: 'SP_E_ROOF climbs down here' },
  },
  {
    id: 'E_S2', zone: 'east', name: '東南轉角大樓', nameEn: 'East Corner Offices',
    footprint: rect(43, 9, 52, 34), baseY: G, floors: F(4.5, 6), parapet: 1.0, roof: 'flat', facade: 'stone_office', faces: ['N', 'E'],
    openings: [{ face: 'N', along: [44, 51], floor: 0, type: 'shopfront', state: 'blocked' }],
  },
  {
    id: 'X_E1', zone: 'east', name: '北方搬家倉儲', nameEn: 'Northern Moving & Storage',
    footprint: rect(66, -12, 84, 12), baseY: G, floors: [5.5, 4.5, 4.5, 4.5], parapet: 1.4, roof: 'flat', facade: 'industrial_brick', faces: ['W'],
    openings: [
      { face: 'W', along: [-5.5, -0.5], floor: 0, type: 'roller_door', state: 'spawn', spawner: 'SP_E_DOCK', note: 'bursts open from R6 (gate spawner); dock apron 1.1 m -> ramp' },
      { face: 'W', along: [0.5, 5.5], floor: 0, type: 'roller_door', state: 'blocked' },
    ],
    signs: [{ type: 'parapet_letters', text: 'NORTHERN MOVING & STORAGE 北方搬家倉儲', face: 'W', y: [17.5, 19.2] }],
    note: 'closes the view down East Street (the T); dock apron x 64.6..66 is a 1.1 m loading platform with steps',
  },
  { id: 'X_E2', zone: 'east', name: '東側公寓', nameEn: 'East Row Flats', footprint: rect(66, -34, 84, -12), baseY: G, floors: F(4.5, 6), parapet: 0.9, roof: 'flat', facade: 'brick_dark', faces: ['W'], openings: [] },
  { id: 'X_E3', zone: 'east', name: '東側商舖', nameEn: 'East Row Shops', footprint: rect(66, 12, 84, 34), baseY: G, floors: F(4.5, 5), parapet: 0.9, roof: 'flat', facade: 'brick_commercial', faces: ['W'], openings: [] },

  // ===================== SOUTH: South Avenue, South Cross Street, South Lane
  {
    id: 'S_W1', zone: 'south', name: '當舖', nameEn: 'Pawn Shop',
    footprint: rect(-24, 26, -8, 38), baseY: G, floors: F(4.5, 5), parapet: 0.8, roof: 'flat', facade: 'brick_commercial', faces: ['E'],
    openings: [{ face: 'E', along: [27, 37], floor: 0, type: 'shopfront', state: 'blocked', note: 'blue shopfront + layered bill posters (reference)' }],
    signs: [{ type: 'fascia', text: 'PAWN · LOANS 當舖', face: 'E', y: [3.3, 4.2] }, { type: 'awning', face: 'E', along: [28, 36], y: [2.8, 3.4], depth: 1.3, color: 'red/white stripes' }],
  },
  {
    id: 'S_W2', zone: 'south', name: '南大道公寓', nameEn: 'South Avenue Flats',
    footprint: rect(-24, 38, -8, 48), baseY: G, floors: F(4.5, 7), parapet: 0.9, roof: 'flat', facade: 'brick_dark', faces: ['E', 'S'],
    openings: [{ face: 'E', along: [41.4, 42.6], floor: 1, type: 'window', state: 'spawn', spawner: 'SP_S_WIN' }],
    fireEscape: { face: 'E', along: [39, 45], floors: [1, 7] },
  },
  { id: 'S_W3', zone: 'south', name: '南橫街西段', nameEn: 'South Cross West', footprint: rect(-38, 40, -24, 48), baseY: G, floors: F(4.5, 4), parapet: 0.8, roof: 'flat', facade: 'painted_brick', faces: ['S'], openings: [] },
  {
    id: 'S_E1', zone: 'south', name: '紅白棚雜貨', nameEn: 'Grocery',
    footprint: rect(8, 26, 24, 38), baseY: G, floors: F(4.5, 6), parapet: 0.9, roof: 'flat', facade: 'stone_office', faces: ['W'],
    openings: [{ face: 'W', along: [27, 37], floor: 0, type: 'shopfront', state: 'blocked', note: 'grocery, crates of rotten produce on the sidewalk' }],
    signs: [{ type: 'awning', face: 'W', along: [27, 37], y: [2.8, 3.4], depth: 1.6, color: 'red/white stripes' }, { type: 'fascia', text: 'GROCERY 雜貨', face: 'W', y: [3.3, 4.2] }],
  },
  {
    id: 'S_E2', zone: 'south', name: '銀星餐館', nameEn: 'Silver Star Diner',
    footprint: rect(8, 38, 24, 48), baseY: G, floors: [4.5, 3.4], parapet: 0.9, roof: 'flat', facade: 'diner_lowrise', faces: ['W', 'S'],
    openings: [{ face: 'W', along: [39, 47], floor: 0, type: 'shopfront', state: 'blocked', note: 'booths behind broken ribbon windows, boarded at sill height' }],
    signs: [{ type: 'roof_neon', text: 'DINER', face: 'W', y: [8.8, 10.6], note: 'dead neon on a rooftop frame; flickers once at R5' }],
    roofItems: ['HVAC boxes', 'roof hatch', 'parapet 0.9'],
    note: 'low roof (7.9 m) next to taller blocks: SP_S_ROOF zombies appear on the parapet and drop to the sidewalk',
  },
  { id: 'S_E3', zone: 'south', name: '南橫街東段', nameEn: 'South Cross East', footprint: rect(24, 40, 38, 48), baseY: G, floors: F(4.5, 5), parapet: 0.8, roof: 'flat', facade: 'brick_commercial', faces: ['S'], openings: [] },
  { id: 'X_S1', zone: 'south', name: '南側公寓（西）', nameEn: 'South Row West', footprint: rect(-38, 58, -8, 72), baseY: G, floors: F(4.5, 6), parapet: 0.9, roof: 'flat', facade: 'brick_dark', faces: ['N', 'E'], openings: [] },
  { id: 'X_S2', zone: 'south', name: '南側公寓（東）', nameEn: 'South Row East', footprint: rect(8, 58, 38, 72), baseY: G, floors: F(4.5, 5), parapet: 0.9, roof: 'flat', facade: 'painted_brick', faces: ['N', 'W'], openings: [] },
];
for (const b of BUILDINGS) b.height = r2(b.floors.reduce((a, v) => a + v, 0));

// Low-detail masses that close the view (no interiors, merged per block). poly + height (top of roofline).
export const BACKDROP = [
  { id: 'BD_NW', poly: rect(-82, -80, -24, -34), heights: [18, 26, 22], note: 'block interior + far side; roof clutter: water towers, AC, antennas' },
  { id: 'BD_NE', poly: rect(24, -80, 84, -34), heights: [20, 24, 30] },
  { id: 'BD_SE', poly: [[24, 24], [52, 24], [52, 34], [84, 34], [84, 84], [38, 84], [38, 40], [24, 40]], heights: [16, 22, 26] },
  { id: 'BD_SW', poly: [[-52, 24], [-24, 24], [-24, 40], [-38, 40], [-38, 84], [-84, 84], [-84, 38], [-52, 38]], heights: [18, 24] },
  { id: 'BD_RAIL', poly: rect(-84, -74, 84, -62), heights: [6.6], note: 'railway embankment/viaduct continuing both ways beyond the bridge (LM_BRIDGE owns x -26..26)' },
  { id: 'BD_POCKETS', note: 'facades closing each spawn pocket: tunnel end wall (z -76, dark, sodium lamp), W stub (x -76), WX ends (z -34 / 38), EX ends (z -34 / 34), SX ends (x -38 / 38), S lane (z 76)' },
  {
    id: 'BD_SKYLINE', note: 'distant towers, silhouettes in fog. Ring 100-260 m: 1920s setback skyscrapers + 1960s concrete grid towers; signature: a gothic tower with a gilded spire NNW (x -70, z -190, 140 m) seen above the bridge; burning tower with smoke column ENE',
    towers: [[-70, -190, 140, 'gothic_spire'], [40, -160, 95, 'setback'], [120, -110, 80, 'grid'], [160, 20, 70, 'grid'], [110, 140, 85, 'setback'], [-20, 170, 75, 'grid'],
      [-130, 110, 90, 'setback'], [-170, -30, 65, 'grid'], [-120, -120, 110, 'setback'], [0, -230, 120, 'setback'], [200, -60, 100, 'grid_burning'], [-200, 60, 80, 'grid']],
  },
];

// ---------------------------------------------------------------------------------------------------------------
// LANDMARKS — hero pieces. Coordinates are final; builders own the modelling detail.
// ---------------------------------------------------------------------------------------------------------------
const FORT_ROT = 0.349; // 20 deg CCW on a north-up map
const CL = 6.06, CW = 2.44, CH = 2.59; // ISO 20 ft container
const GAP = 2.0;                        // pinwheel joint gap, filled by a crate stack under a steel plate
const H = r2((CL + CW + GAP) / 2);      // 5.25: half the outer deck size (10.5 m)
const IN = r2(H - CW);                  // 2.81: half the covered core
/** Fort-local [u,v] -> world [x,z]. */
export const fortToWorld = (u, v) => { const [x, z] = rotXZ(u, v, FORT_ROT); return [r2(x), r2(z)]; };
const fortRect = (u0, v0, u1, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => fortToWorld(u, v));
// The fort has 4-fold rotational symmetry: every piece is defined once for the NORTH side and turned 90 deg at a
// time (local (u,v) -> (-v,u) maps north -> east -> south -> west).
const q90 = ([u, v], k) => { let a = [u, v]; for (let i = 0; i < k; i++) a = [-a[1], a[0]]; return a; };
const qRect = (u0, v0, u1, v1, k) => { const a = q90([u0, v0], k), b = q90([u1, v1], k); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])].map(r2); };
const RAMP_L = 6.0, RAMP_W = 2.2, RAMP_U0 = -1.4; // north ramp spans u -1.4..0.8 on container A's outer face
const SIDES = ['north', 'east', 'south', 'west'], LETTER = ['A', 'B', 'C', 'D'], ARM = ['N', 'E', 'S', 'W'];
const CCOL = ['#cfc6a8', '#d8d2bd', '#c9c09f', '#d3cbb0'];
const fortPieces = SIDES.map((side, k) => {
  const cont = qRect(-H, -H, -H + CL, -H + CW, k);          // container along the outer edge, starting at the corner
  const notch = qRect(-H + CL, -H, -H + CL + GAP, -H + CW, k); // joint gap -> crate stack + plate
  const ramp = qRect(RAMP_U0, -H - RAMP_L, RAMP_U0 + RAMP_W, -H, k);
  const top = q90([RAMP_U0 + RAMP_W / 2, -H], k), foot = q90([RAMP_U0 + RAMP_W / 2, -H - RAMP_L], k);
  const sb = qRect(-H + 0.35, -H + 0.05, -H + 3.35, -H + 0.55, k); // sandbag row on the free outer edge
  const c = [(cont[0] + cont[2]) / 2, (cont[1] + cont[3]) / 2];
  return {
    container: { id: 'FORT_' + LETTER[k], side, local: { u: r2(c[0]), v: r2(c[1]) }, pos: fortToWorld(c[0], c[1]), rot: r3(FORT_ROT + (k % 2 ? PI / 2 : 0)), len: CL, wid: CW, h: CH, color: CCOL[k],
      rect: cont, poly: fortRect(...cont), note: k === 0 ? 'doors at the west end, chained' : undefined },
    notch: { id: 'FORT_NOTCH_' + ARM[k], local: notch, poly: fortRect(...notch), h: CH, note: '2 x 2 stack of 1.3 m crates + 4 mm checker plate on top (walkable, flush)' },
    ramp: { id: 'RAMP_' + ARM[k], arm: side, local: ramp, poly: fortRect(...ramp), top: fortToWorld(...top), foot: fortToWorld(...foot), downhill: SIDES[k] },
    sandbag: { id: 'FORT_SB_' + ARM[k], kind: 'sandbag', local: sb, poly: fortRect(...sb), h: 0.55, note: 'crouch cover on the free outer edge (left of the ramp top)' },
  };
});
export const LANDMARKS = {
  fort: {
    id: 'LM_FORT', zone: 'center', name: '貨櫃堡壘（出生點）', nameEn: 'Container Fort (spawn base)', center: [0, 0], rot: FORT_ROT, deckY: CH,
    concept: 'reference: 20 ft containers in a pinwheel around a covered core, roofed with corrugated sheets + loose plank boards, four perforated steel ramps leaning up from the street (one per arm, pinwheel order). Players spawn and hold on the roof; zombies come up the ramps or (climbers) the walls.',
    outer: fortRect(-H, -H, H, H), inner: fortRect(-IN, -IN, IN, IN), half: H, coreHalf: IN,
    containers: fortPieces.map((p) => p.container),
    notches: fortPieces.map((p) => p.notch),
    core: { local: [-IN, -IN, IN, IN], poly: fortRect(-IN, -IN, IN, IN), y: CH, note: '5.6 m core: I-beams on the container tops + corrugated sheets (walkable, solid below — nothing enterable inside)' },
    deck: { poly: fortRect(-H, -H, H, H), y: CH, size: 2 * H, surf: 'metal', note: `${2 * H} x ${2 * H} m walkable roof: container roofs + core sheets + notch plates; loose rusty sheets (3 cm proud) and 6 plank boards across the seams (wood)` },
    ramps: fortPieces.map((p) => p.ramp),
    rampSpec: { length: RAMP_L, width: RAMP_W, rise: CH, slopeDeg: r2((Math.atan2(CH, RAMP_L) * 180) / PI), surf: 'grate', note: 'perforated 8 mm steel plate on angle-iron stringers + 2 lips; solid wedge in collision (nothing under it); NOBOSS' },
    roofCover: fortPieces.map((p) => p.sandbag),
    hatches: [
      { id: 'FORT_HATCH_1', local: { u: -1.1, v: 1.1 }, pos: fortToWorld(-1.1, 1.1), size: [1.1, 0.8], h: 0.12, note: 'steel supply hatch (SUP_FORT_1), amber strobe when a supply is ready' },
      { id: 'FORT_HATCH_2', local: { u: 1.1, v: -1.1 }, pos: fortToWorld(1.1, -1.1), size: [1.1, 0.8], h: 0.12, note: 'SUP_FORT_2' },
    ],
    extras: 'container doors chained shut; our own stencils ("LTX 204511 4", "MAX GROSS 30,480 KG"); a field radio crate + spent brass on the roof; ropes and tarps hanging over the edges; CLIMB nav bit on all outer walls',
  },
  bridge: {
    id: 'LM_BRIDGE', zone: 'north', name: '鐵路高架橋（LOST TOWN 字牌）', nameEn: 'Rail Bridge with LOST TOWN sign',
    span: [-26, 26], z: [-74, -62], deckUnderY: 5.2, deckTopY: 6.6, parapetTopY: 7.8,
    abutments: [rect(-9, -74, -7, -62), rect(7, -74, 9, -62)], portalFace: 'S (z -62), facing the fort 62 m away',
    structure: 'riveted steel plate girders (painted green-grey, rust streaks) on concrete abutments with a stone-faced portal; rail tracks + catenary masts on the deck (silhouette only)',
    letters: { text: 'LOST TOWN', y: [7.8, 10.0], x: [-12, 12], board: [2.0, 2.2], note: 'HERO SIGN: 8 tilted cream boards on a steel frame along the parapet (town welcome sign), one letter askew; visible down the whole North Avenue' },
    roadSign: { text: '↑ N QUARRY ST · 採石場街', y: [4.0, 4.9], x: [-1.6, 1.6], color: 'green highway sign hanging from the girder, one bracket broken' },
    lights: 'two caged sodium lamps under the girder (one dead), dripping water',
    barricade: {
      z: [-64.6, -62.1],
      parts: [
        { kind: 'container20', x: 0.0, z: -63.35, w: CL, d: CW, h: CH, rot: 0, color: '#d9d6cc', note: 'white container lying across the lanes' },
        { kind: 'crates', x: -5.7, z: -63.35, w: 2.6, d: 2.5, h: 2.6, note: '2 x 2 stack of 1.3 m crates' },
        { kind: 'crates', x: 5.0, z: -63.35, w: 4.0, d: 2.5, h: 2.6, note: '3 wide x 2 high' },
      ],
      zombieGap: { x: [-4.4, -3.03], z: [-64.6, -62.1], note: 'torn tarp between crates and container; player_clip BLK_N_GAP' },
    },
  },
  ledGantry: {
    id: 'LM_LED', zone: 'west', name: 'LED 撤離告示門架', nameEn: 'LED evacuation gantry',
    x: -69.5, posts: [[-69.5, -8.0], [-69.5, 8.0]], postSize: 1.2, postH: 13.0, beamY: [11.6, 12.4],
    panel: { z: [-4.5, 4.5], y: [7.8, 11.4], faceX: -69.0, facing: 'E', pixel: 'amber dot-matrix (emissive, 2 px dots, scanlines)', cycle: ['LEAVE TOWN NOW!!', '封城中　立即撤離', 'QUARANTINE ZONE', 'NO ENTRY'] },
    roadSign: { text: 'HARBOR RD → · 港口路', y: [6.2, 7.2], z: [-1.5, 1.5] },
    barricade: {
      x: [-71.1, -68.6],
      parts: [
        { kind: 'container20', x: -69.57, z: 0.0, w: CL, d: CW, h: CH, rot: PI / 2, note: 'container end-on (doors facing the fort), olive-grey; long axis along x' },
        { kind: 'crates', x: -69.85, z: -6.1, w: 2.5, d: 5.8, h: 2.6, note: 'crates 2 high from the north building line to the lane' },
        { kind: 'crates', x: -69.85, z: 5.1, w: 2.5, d: 7.8, h: 2.6 },
      ],
      zombieGap: { x: [-71.1, -68.6], z: [-3.2, -1.22], note: 'gap behind a fallen crate; player_clip BLK_W_GAP' },
    },
    note: 'reference "LEAVE THIS CITY NOW!!" gantry: our wording; visible from the fort roof straight down West Street; lit by L_LED_W',
  },
  truckBarricade: {
    id: 'LM_TRUCK_BARRICADE', zone: 'south', name: '南巷貨車路障', nameEn: 'South Lane truck barricade',
    parts: [
      { kind: 'box_truck', x: 1.1, z: 69.2, w: 8.2, d: 2.5, h: 3.4, rot: 0.06, note: 'white box truck jack-knifed across the lane, cab to the east, box doors open' },
      { kind: 'crates', x: -6.2, z: 69.3, w: 3.6, d: 2.4, h: 2.6 },
      { kind: 'crates', x: 6.6, z: 69.3, w: 2.8, d: 2.4, h: 2.6 },
    ],
    zombieGap: { x: [-4.4, -3.0], z: [68, 70.6], note: 'between the crates and the truck box; player_clip BLK_S_TRUCK' },
    bossBreak: 'R5: the butcher bursts through (truck shoved 3 m, crates scattered) — pre-fractured crates + a truck rig with a "shoved" pose',
  },
  signalMasts: {
    id: 'LM_SIGNALS', zone: 'center', name: '自行車號誌桅桿', note: 'reference: oversized yellow signal heads with green bicycle lenses on mast arms. Pole 0.3 m dia at each chamfer corner, arm 7 m long at y 6.2 over the carriageway, 2 heads per arm. Arms are bossBreakable (bend/fall when a boss walks through).',
    poles: [{ id: 'SIG_NW', base: [-11.2, -11.2], armTo: [-4.5, -12.5] }, { id: 'SIG_NE', base: [11.2, -11.2], armTo: [12.5, -4.5] }, { id: 'SIG_SE', base: [10.7, 11.2], armTo: [4.5, 12.5] }, { id: 'SIG_SW', base: [-10.7, 11.2], armTo: [-12.5, 4.5] }],
  },
};

// ---------------------------------------------------------------------------------------------------------------
// PROPS / COVER (boxes). kind drives the model; cover class is derived from h. y defaults to the street (0) or the
// sidewalk (0.15) when `sw` is set. rot = three.js rotation.y.
// ---------------------------------------------------------------------------------------------------------------
const box = (zone, kind, id, x, z, w, d, h, o = {}) => ({ zone, kind, id, x, z, w, d, h, y: o.y ?? (o.sw ? SW : G), rot: o.rot ?? 0, surf: o.surf ?? 'metal', ...o });
export const PROPS = [
  // ===== CENTER
  box('center', 'sedan_burnt', 'C_CAR_NE', 18.0, -3.4, 4.6, 1.8, 1.45, { rot: 0.32, note: 'burnt-out sedan at the East Street mouth (north lane)' }),
  box('center', 'container20', 'C_BOX_SE', 20.5, 6.9, 6.06, 2.44, 2.59, { color: '#5f6b5a', note: 'green container parked along the south curb of East Street (reference)' }),
  box('center', 'crates', 'C_CRATES_SE', 16.6, 6.5, 1.3, 1.3, 1.3, { surf: 'wood', note: 'crate at the container end (chest cover)' }),
  box('center', 'crates', 'C_CRATES_W', -15.2, -3.4, 2.6, 1.3, 1.3, { surf: 'wood', rot: 0.2, note: 'two crates in the West Street mouth' }),
  box('center', 'newspaper_box', 'C_NEWS_1', -8.6, -16.8, 0.5, 0.45, 1.1, { sw: true, color: 'red' }),
  box('center', 'newspaper_box', 'C_NEWS_2', -8.6, -17.5, 0.5, 0.45, 1.1, { sw: true, color: 'blue' }),
  box('center', 'hydrant', 'C_HYD_NE', 8.4, -17.0, 0.4, 0.4, 0.8, { sw: true }),
  box('center', 'hydrant', 'C_HYD_SW', -7.5, 18.0, 0.4, 0.4, 0.8, { sw: true }),
  box('center', 'mailbox', 'C_MAIL', 16.5, -8.5, 0.55, 0.55, 1.3, { sw: true }),
  box('center', 'trash_can', 'C_TRASH_SE', 7.5, 18.5, 0.6, 0.6, 0.95, { sw: true }),
  box('center', 'barrel_fire', 'C_FIRE_SW', -10.5, 11.0, 0.6, 0.6, 0.9, { sw: true, note: 'burning barrel (L_FIRE_C)' }),
  box('center', 'phone_booth', 'C_PHONE', -16.8, 8.1, 0.9, 0.9, 2.3, { sw: true }),
  box('center', 'rubble', 'C_RUBBLE_NW', -11.0, -11.0, 1.6, 1.2, 0.6, { sw: true, rot: PI / 4, surf: 'concrete', note: 'fallen cornice pieces from C_NW' }),
  // ===== NORTH
  box('north', 'taxi_wreck', 'N_TAXI', 3.2, -29.5, 4.7, 1.9, 1.5, { rot: PI / 2 - 0.12, note: 'yellow cab, doors open' }),
  box('north', 'sedan_burnt', 'N_CAR', -2.8, -46.5, 4.6, 1.8, 1.45, { rot: PI / 2 + 0.2 }),
  box('north', 'newspaper_box', 'N_NEWS_1', -8.5, -33.6, 0.5, 0.45, 1.1, { sw: true, color: 'red' }),
  box('north', 'newspaper_box', 'N_NEWS_2', -8.5, -34.3, 0.5, 0.45, 1.1, { sw: true, color: 'red' }),
  box('north', 'newspaper_box', 'N_NEWS_3', 8.5, -55.0, 0.5, 0.45, 1.1, { sw: true, color: 'red', note: 'red boxes seen on the reference minimap' }),
  box('north', 'phone_booth', 'N_PHONE', 8.4, -44.0, 0.9, 0.9, 2.3, { sw: true }),
  box('north', 'hydrant', 'N_HYD', -8.3, -52.0, 0.4, 0.4, 0.8, { sw: true }),
  box('north', 'dumpster', 'N_DUMP_AL', 11.0, -51.5, 1.9, 1.2, 1.3, { note: 'in the NE alley mouth' }),
  box('north', 'chainlink_fence', 'N_FENCE_AL_1', 13.5, -52.45, 0.08, 1.1, 2.4, { note: 'alley fence, torn 1.2 m gap at z -51.9..-50.7 (zombie gap, player_clip BLK_N_AL)' }),
  box('north', 'chainlink_fence', 'N_FENCE_AL_2', 13.5, -50.35, 0.08, 0.7, 2.4),
  box('north', 'crates', 'N_CRATES_DELI', -7.5, -37.6, 1.3, 1.3, 1.3, { sw: true, surf: 'wood', note: 'produce crates outside the deli' }),
  box('north', 'pothole', 'N_POTHOLE', 1.0, -40.0, 1.6, 1.2, 0.0, { note: 'decal + 6 cm dip (visual only)' }),
  // ===== WEST
  box('west', 'box_truck', 'W_TRUCK', -30.2, 1.4, 8.0, 2.5, 3.4, { rot: 0.05, color: 'white', note: 'reference: white box truck parked mid-street (26-34 m out) facing the fort; full cover, roof not reachable' }),
  box('west', 'sedan_burnt', 'W_CAR', -44.0, -3.3, 4.6, 1.8, 1.45, { rot: -0.3 }),
  box('west', 'bus_shelter', 'W_SHELTER', -46.5, 7.4, 3.6, 1.4, 2.5, { sw: true, surf: 'glass' }),
  box('west', 'van_burnt', 'W_VAN_X', -59.2, -16.0, 5.2, 2.0, 2.1, { rot: PI / 2 + 0.25, note: 'West Cross Street, north half' }),
  box('west', 'dumpster', 'W_DUMP_X', -64.7, 18.0, 1.2, 1.9, 1.3, { sw: true }),
  box('west', 'chainlink_fence', 'W_BARR_XN_1', -61.1, -26.2, 9.8, 0.3, 2.4, { note: 'north end: fence panels on sawhorse feet + a burnt car behind (in the pocket); zombie gap x -56.2..-54.8 (BLK_WX_N)' }),
  box('west', 'chainlink_fence', 'W_BARR_XN_2', -54.4, -26.2, 0.8, 0.3, 2.4),
  box('west', 'sedan_burnt', 'W_BARR_XN_CAR', -61.5, -29.0, 4.6, 1.8, 1.45, { rot: 0.4, note: 'inside the pocket, seen through the fence' }),
  box('west', 'rubble_pile', 'W_BARR_XS_1', -65.6, 30.6, 0.8, 1.0, 2.0, { surf: 'concrete' }),
  box('west', 'rubble_pile', 'W_BARR_XS_2', -58.9, 30.6, 9.8, 1.0, 2.0, { surf: 'concrete', note: 'south end: collapsed facade rubble + fence; zombie gap x -65.2..-63.8 (BLK_WX_S)' }),
  box('west', 'hydrant', 'W_HYD', -36.0, 8.6, 0.4, 0.4, 0.8, { sw: true }),
  // ===== EAST
  box('east', 'army_truck', 'E_TRUCK', 41.5, -2.6, 8.6, 2.5, 3.2, { rot: -0.5, color: 'olive', note: 'abandoned 6x6 cargo truck slewed across the lanes, canvas torn; amber beacon still turning (L_BEACON_E)' }),
  box('east', 'sedan_burnt', 'E_CAR_X', 58.5, -18.0, 4.6, 1.8, 1.45, { rot: PI / 2 + 0.4, note: 'burning (L_FIRE_E)' }),
  box('east', 'police_car', 'E_BARR_XN_1', 56.5, -26.6, 4.9, 1.9, 1.5, { rot: 0.15 }),
  box('east', 'police_car', 'E_BARR_XN_2', 62.6, -26.4, 4.9, 1.9, 1.5, { rot: -0.1, note: 'police cars + sawhorses; zombie gap x 58.9..60.2 between the cars (BLK_EX_N)' }),
  box('east', 'sawhorse', 'E_BARR_XN_3', 53.0, -26.4, 2.0, 0.5, 1.1, { surf: 'wood' }),
  box('east', 'sawhorse', 'E_BARR_XN_4', 65.55, -26.4, 0.9, 0.5, 1.1, { surf: 'wood' }),
  box('east', 'bus_wreck', 'E_BARR_XS', 58.0, 27.4, 11.5, 2.55, 3.1, { rot: 0.0, note: 'burnt city bus across the street; zombie gap at its rear x 63.75..65.2 (BLK_EX_S)' }),
  box('east', 'sawhorse', 'E_BARR_XS_2', 65.6, 27.4, 0.8, 0.5, 1.1, { surf: 'wood' }),
  box('east', 'dock_apron', 'E_DOCK', 65.3, 3.5, 1.4, 6.0, 1.1, { surf: 'concrete', note: 'loading dock in front of the north roller door only; the spawn door (z -5.5..-0.5) is a drive-in door at street level' }),
  box('east', 'chainlink_fence', 'E_FENCE_AL_1', 40.45, 17.0, 0.9, 0.08, 2.4, { note: 'SE alley fence, torn gap x 40.9..42.1 (BLK_E_AL)' }),
  box('east', 'chainlink_fence', 'E_FENCE_AL_2', 42.55, 17.0, 0.9, 0.08, 2.4),
  box('east', 'pallet_stack', 'E_PALLETS', 63.2, 7.5, 1.2, 1.0, 1.2, { surf: 'wood' }),
  box('east', 'trash_can', 'E_TRASH', 30.0, 8.6, 0.6, 0.6, 0.95, { sw: true }),
  // ===== SOUTH
  box('south', 'sedan_burnt', 'S_CAR', -2.8, 36.5, 4.6, 1.8, 1.45, { rot: PI / 2 + 0.15 }),
  box('south', 'bus_shelter', 'S_SHELTER', 6.4, 33.0, 1.4, 3.6, 2.5, { sw: true, surf: 'glass' }),
  box('south', 'crates', 'S_PRODUCE', 6.6, 29.2, 1.3, 2.6, 1.0, { sw: true, surf: 'wood', note: 'grocery produce crates' }),
  box('south', 'hydrant', 'S_HYD', -6.3, 40.0, 0.4, 0.4, 0.8, { sw: true }),
  box('south', 'dumpster', 'S_DUMP_X', -22.0, 49.0, 1.9, 1.2, 1.3, { sw: true }),
  box('south', 'chainlink_fence', 'S_BARR_XW_1', -30.2, 49.3, 0.3, 2.6, 2.4, { note: 'west end fence + dumpsters; zombie gap z 50.6..52.0 (BLK_SX_W)' }),
  box('south', 'chainlink_fence', 'S_BARR_XW_2', -30.2, 55.0, 0.3, 6.0, 2.4),
  box('south', 'chainlink_fence', 'S_BARR_XE_1', 30.2, 51.0, 0.3, 6.0, 2.4, { note: 'east end fence + burnt car; zombie gap z 54.0..55.4 (BLK_SX_E)' }),
  box('south', 'chainlink_fence', 'S_BARR_XE_2', 30.2, 56.7, 0.3, 2.6, 2.4),
  box('south', 'sedan_burnt', 'S_CAR_XE', 27.4, 54.4, 4.6, 1.8, 1.45, { rot: 0.2 }),
];
// Street lamps (cobra-head, 7.5 m) staggered along the arms; working ones are baked emissive, one flickers (L_LAMP_S).
export const STREET_LAMPS = [
  [-8.6, -30], [8.6, -40], [-8.6, -52], [8.6, -58],
  [-34, -8.6], [-48, 8.6], [34, 8.6], [46, -8.6],
  [-7.6, 36], [7.6, 44], [7.6, 22],
  [-64.5, -12], [-55.5, 22], [64.7, -18], [53.4, 16],
].map(([x, z], i) => ({ id: 'LAMP_' + i, x, z, y: SW, h: 7.5, state: i === 9 ? 'flicker' : i % 3 === 2 ? 'dead' : 'on' }));
// Manholes (decal + rim); `spawner` marks the ones that open.
export const MANHOLES = [
  { id: 'MH_N', x: 2.5, z: -38, spawner: 'SP_N_MH' }, { id: 'MH_W', x: -40, z: 2, spawner: 'SP_W_MH' }, { id: 'MH_S', x: -2, z: 30, spawner: 'SP_S_MH' },
  { id: 'MH_C', x: 1.5, z: -9.6, spawner: 'SP_C_MH' }, { id: 'MH_E', x: 30, z: -2 }, { id: 'MH_N2', x: -1.5, z: -56 }, { id: 'MH_SX', x: 15, z: 53 },
];

// ---------------------------------------------------------------------------------------------------------------
// NAV RULES for the nav baker (2.5D grid, 0.5 m cells, nav.bin/nav.json). Overhead geometry must NOT be baked, or
// the ground under it disappears from the single-layer grid -- exactly the original map's famous bug where zombies
// could not reach players standing under the red/white awning. Bake from "nav collision" = ground + buildings +
// props + fort, EXCLUDING the items below; player_clip blockers go into the player collision only, never into nav.
// ---------------------------------------------------------------------------------------------------------------
export const NAV_RULES = {
  cell: 0.5, origin: [META.bounds[0], META.bounds[2]], agentHeight: 1.7, agentRadius: 0.3, maxSlope: 0.65, step: 0.55,
  ignore: ['LM_BRIDGE deck/girders/letters/road sign (the underpass floor must be baked)', 'awnings (all)', 'fire escapes (all levels)',
    'signal mast arms + signal heads', 'LED gantry beam + panel + road sign', 'street-lamp heads', 'blade signs, billboards, roof items', 'bus-shelter roofs (bake the shelter as a solid block instead)'],
  flags: {
    WALK: 'streets, sidewalks, pockets, fort deck + ramps, shop interiors',
    CLIMB: 'outer walls of the 4 fort containers + notch stacks (climbers scale them), barricade crates',
    NOBOSS: 'fort deck, ramps, zombie gaps, alleys, underpass pocket, shop interiors',
    BLOCK: 'vehicle tops, crate tops, dumpster tops (isolated islands the flow field must never target)',
  },
  islands: 'after baking keep only the component connected to the fort deck; clear WALK on every other island (vehicle roofs, a bridge deck that slipped in)',
};

// ---------------------------------------------------------------------------------------------------------------
// BLOCKERS — collision-only volumes. player_clip blocks players (and bullets? no: bullets pass) but is NOT baked
// into nav, so zombies stream through barricade gaps. `all` blocks everyone (invisible walls at pocket ends).
// ---------------------------------------------------------------------------------------------------------------
export const BLOCKERS = [
  { id: 'BLK_N_GAP', type: 'player_clip', box: { x: -3.7, z: -63.35, w: 1.4, d: 2.5, h: 5.2 } },
  { id: 'BLK_N_TOP', type: 'player_clip', box: { x: 0, z: -63.35, w: 14, d: 2.5, h: 2.6, y: 2.6 }, note: 'over the barricade up to the bridge underside' },
  { id: 'BLK_W_GAP', type: 'player_clip', box: { x: -69.85, z: -2.2, w: 2.5, d: 2.0, h: 6 } },
  { id: 'BLK_W_TOP', type: 'player_clip', box: { x: -69.85, z: 0, w: 2.5, d: 18, h: 6, y: 2.6 } },
  { id: 'BLK_WX_N', type: 'player_clip', box: { x: -60, z: -26.2, w: 12, d: 0.6, h: 8 }, note: 'whole fence line incl. its zombie gap' },
  { id: 'BLK_WX_S', type: 'player_clip', box: { x: -60, z: 30.6, w: 12, d: 1.2, h: 8 } },
  { id: 'BLK_EX_N', type: 'player_clip', box: { x: 59, z: -26.5, w: 14, d: 2.4, h: 8 } },
  { id: 'BLK_EX_S', type: 'player_clip', box: { x: 59, z: 27.4, w: 14, d: 2.8, h: 8 } },
  { id: 'BLK_SX_W', type: 'player_clip', box: { x: -30.2, z: 53, w: 0.6, d: 10, h: 8 } },
  { id: 'BLK_SX_E', type: 'player_clip', box: { x: 30.2, z: 53, w: 0.6, d: 10, h: 8 } },
  { id: 'BLK_S_TRUCK', type: 'player_clip', box: { x: 0, z: 69.3, w: 16, d: 2.6, h: 8 } },
  { id: 'BLK_N_AL', type: 'player_clip', box: { x: 13.5, z: -51.5, w: 0.4, d: 3.0, h: 8 } },
  { id: 'BLK_E_AL', type: 'player_clip', box: { x: 41.5, z: 17, w: 3.0, d: 0.4, h: 8 } },
  { id: 'BLK_DOCK', type: 'player_clip', box: { x: 66.3, z: -3, w: 0.6, d: 5, h: 5 }, note: 'roller door SP_E_DOCK (zombies come out of the warehouse)' },
  { id: 'BLK_CEIL', type: 'all', note: 'flat clip ceiling at y 45 over the whole map; roofs are never reachable (no ledges at <= 1 m from walkable ground)' },
  { id: 'BLK_POCKET_ENDS', type: 'all', note: 'solid walls closing each pocket end (BD_POCKETS facades)' },
];

// ---------------------------------------------------------------------------------------------------------------
// GAMEPLAY ZONES (map.json `zones`) — spawner grouping / director. Polygons cover the walkable ground.
// ---------------------------------------------------------------------------------------------------------------
export const ZONES = [
  { id: 'center', name: '中央路口', polygon: [[-15, -9], [-9, -15], [9, -15], [15, -9], [15, 9], [8, 16], [-8, 16], [-15, 9]] },
  { id: 'north', name: '北大道／鐵橋', polygon: [[-9, -76], [9, -76], [9, -53], [24, -53], [24, -50], [9, -50], [9, -15], [-9, -15]] },
  { id: 'west', name: '西街／西橫街', polygon: [[-76, -9], [-66, -9], [-66, -34], [-54, -34], [-54, -9], [-15, -9], [-15, 9], [-54, 9], [-54, 38], [-66, 38], [-66, 9], [-76, 9]] },
  { id: 'east', name: '東街／東橫街', polygon: [[15, -9], [52, -9], [52, -34], [66, -34], [66, 34], [52, 34], [52, 9], [43, 9], [43, 24], [40, 24], [40, 9], [15, 9]] },
  { id: 'south', name: '南大道／南橫街', polygon: [[-8, 16], [8, 16], [8, 48], [38, 48], [38, 58], [8, 58], [8, 76], [-8, 76], [-8, 58], [-38, 58], [-38, 48], [-8, 48]] },
];

// ---------------------------------------------------------------------------------------------------------------
// SPAWNERS — kinds: street (pocket at a street end) | alley | window (2F window, drops to the sidewalk) |
// roof (roof edge / fire escape) | manhole | fence (climb over a barricade) | gate (door/barricade bursts).
// pos = where zombies materialise (on nav ground); exit = first point on the main nav; rounds = [from, to].
// ---------------------------------------------------------------------------------------------------------------
const FORT = [0, 0];
const sp = (id, zone, kind, pos, o = {}) => ({ id, zone, kind, pos, facing: yawTo([pos[0], pos[2]], o.aim || FORT), rounds: o.rounds || [1, 10], ...o });
export const SPAWNERS = [
  // north
  sp('SP_N_TUN_A', 'north', 'gate', [-4.5, G, -70], { exit: [-3.7, G, -60.5], note: 'out of the dark underpass through the barricade gap' }),
  sp('SP_N_TUN_B', 'north', 'gate', [3.0, G, -71], { exit: [-3.7, G, -60.5], rounds: [2, 10] }),
  sp('SP_N_MH', 'north', 'manhole', [2.5, G, -38], { rounds: [3, 10] }),
  sp('SP_N_AL', 'north', 'alley', [19, G, -51.5], { exit: [10.5, G, -51.3], rounds: [4, 10] }),
  sp('SP_N_WIN_W', 'north', 'window', [-9.4, 4.9, -33], { exit: [-7.6, SW, -33], rounds: [6, 10] }),
  sp('SP_N_WIN_E', 'north', 'window', [9.4, 4.9, -36], { exit: [7.6, SW, -36], rounds: [6, 10] }),
  sp('SP_N_BRIDGE', 'north', 'roof', [-3, 6.6, -62.6], { exit: [-3, G, -59], rounds: [7, 10], note: 'leap down from the bridge parapet (6.6 m)' }),
  // west
  sp('SP_W_XN', 'west', 'street', [-60, G, -31], { exit: [-55.5, G, -24], note: 'through the north fence gap' }),
  sp('SP_W_XS', 'west', 'street', [-60, G, 35], { exit: [-64.5, G, 28], rounds: [1, 10] }),
  sp('SP_W_LED', 'west', 'fence', [-74, G, -2.2], { exit: [-67.5, G, -2.2], rounds: [2, 10], note: 'squeeze past the fallen crate under the LED gantry' }),
  sp('SP_W_MH', 'west', 'manhole', [-40, G, 2], { rounds: [3, 10] }),
  sp('SP_W_WIN', 'west', 'window', [-33, 4.9, 9.4], { exit: [-33, SW, 7.6], rounds: [6, 10] }),
  sp('SP_W_ROOF', 'west', 'roof', [-33, 8.6, -9.6], { exit: [-33, SW, -7.6], rounds: [6, 10], note: 'fire-escape climb-down on W_N1' }),
  // east
  sp('SP_E_XN', 'east', 'street', [59, G, -31], { exit: [60, G, -24] }),
  sp('SP_E_XS', 'east', 'street', [59, G, 31], { exit: [64.5, G, 25], rounds: [1, 10] }),
  sp('SP_E_DOCK', 'east', 'gate', [69, G, -3], { exit: [63.5, G, -3], rounds: [6, 10], note: 'warehouse roller door bursts open' }),
  sp('SP_E_AL', 'east', 'alley', [41.5, G, 21.5], { exit: [41.5, G, 10.5], rounds: [4, 10] }),
  sp('SP_E_WIN', 'east', 'window', [33, 4.9, -9.4], { exit: [33, SW, -7.6], rounds: [6, 10] }),
  sp('SP_E_ROOF', 'east', 'roof', [31, 8.6, 9.6], { exit: [31, SW, 7.6], rounds: [6, 10], note: 'fire-escape climb-down on E_S1' }),
  // south
  sp('SP_S_XW', 'south', 'street', [-34, G, 53], { exit: [-28, G, 51.3] }),
  sp('SP_S_XE', 'south', 'street', [34, G, 53], { exit: [28, G, 54.7] }),
  sp('SP_S_EXT', 'south', 'gate', [0, G, 73.5], { exit: [-4, G, 66], rounds: [2, 10], note: 'under the jack-knifed truck' }),
  sp('SP_S_MH', 'south', 'manhole', [-2, G, 30], { rounds: [3, 10] }),
  sp('SP_S_WIN', 'south', 'window', [-8.4, 4.9, 42], { exit: [-6.6, SW, 42], rounds: [6, 10] }),
  sp('SP_S_ROOF', 'south', 'roof', [12, 8.8, 38.4], { exit: [7.4, SW, 38.4], rounds: [6, 10], note: 'diner roof parapet, drop 7.9 m' }),
  // center (late-round flanks right at the fort)
  sp('SP_C_WIN_NE', 'center', 'window', [12.3, 4.9, -12.3], { exit: [11.2, SW, -11.2], rounds: [7, 10] }),
  sp('SP_C_WIN_SW', 'center', 'window', [-11.8, 4.9, 12.8], { exit: [-10.9, SW, 11.9], rounds: [7, 10] }),
  sp('SP_C_MH', 'center', 'manhole', [1.5, G, -9.6], { rounds: [8, 10], note: 'sewer surprise next to the north ramp' }),
];

// ---------------------------------------------------------------------------------------------------------------
// PLAYERS — spawn on the fort roof (reference: everyone starts on the container roof and buys there).
// ---------------------------------------------------------------------------------------------------------------
export const PLAYER_SPAWNS = [[-2.0, -2.0], [2.0, -2.0], [2.0, 2.0], [-2.0, 2.0], [0.4, -3.9], [3.9, 0.4], [-0.4, 3.9], [-3.9, -0.4]].map(([u, v]) => {
  const [x, z] = fortToWorld(u, v);
  const yaw = yawTo([0, 0], [x * 10, z * 10]); // face outwards
  return [x, CH, z, yaw];
});
export const BUY = [[0, CH, 0, 7.6]]; // fort roof (+ ramp tops); 20 s buy phase between rounds
export const SUPPLY = [
  { id: 'SUP_FORT_1', pos: [LANDMARKS.fort.hatches[0].pos[0], r2(CH + 0.12), LANDMARKS.fort.hatches[0].pos[1]], kind: 'fort', note: 'roof hatch' },
  { id: 'SUP_FORT_2', pos: [LANDMARKS.fort.hatches[1].pos[0], r2(CH + 0.12), LANDMARKS.fort.hatches[1].pos[1]], kind: 'fort' },
  { id: 'SUP_N', pos: [-6.6, SW, -35.2], kind: 'street', note: 'by the red newspaper boxes outside the deli (24-35 m run)' },
  { id: 'SUP_W', pos: [-36.0, G, 1.4], kind: 'street', note: 'behind the box truck (rear doors)' },
  { id: 'SUP_E', pos: [36.5, G, 3.8], kind: 'street', note: 'beside the army truck tailgate' },
  { id: 'SUP_S', pos: [5.2, G, 31.0], kind: 'street', note: 'by the bus shelter' },
  { id: 'SUP_C_SHOP', pos: [14.0, SW, 15.2], kind: 'interior', note: 'inside the candy shop (C_SE)' },
  { id: 'SUP_WX', pos: [-60.0, G, 4.0], kind: 'far', note: 'West Cross Street, under the LED glow — high risk' },
  { id: 'SUP_EX', pos: [59.0, G, -4.0], kind: 'far', note: 'East Cross Street at the dock' },
  { id: 'SUP_SX', pos: [0.0, G, 53.0], kind: 'far', note: 'South Cross crossing' },
];

// ---------------------------------------------------------------------------------------------------------------
// BOSS ARENAS — center = where the boss enters the playable nav (the runtime spawns it there; must be walkable and
// >= 25 m from the fort); radius = leash / fight area (covers the fort so it can reach the roof edge with its 3-5 m
// attacks). Vertical clearance >= 9 m everywhere inside except the signal-mast arms (bossBreakable).
// ---------------------------------------------------------------------------------------------------------------
export const BOSS_ARENAS = {
  mid: {
    boss: 'butcher', round: 5, center: [0, G, 30], radius: 26, entry: 'smashes through LM_TRUCK_BARRICADE (z 69) and charges up the South Lane / South Avenue',
    intro: { from: [0, G, 72], to: [0, G, 30], seconds: 4.5 }, lane: rect(-5, 9, 5, 70),
    clearance: 'South Avenue carriageway 10 m wide, open sky; awnings only over sidewalks (y 2.8-3.4); SIG_SE/SIG_SW arms at y 6.2 are bossBreakable',
    mechanics: ['propane tanks in the grocery produce stack (shoot -> stagger)', 'the boss rams the fort: camera shake + containers dent (no breach)'],
  },
  final: {
    boss: 'colossus', round: 10, center: [0, G, -40], radius: 34, entry: 'climbs onto the rail bridge (behind the LOST TOWN boards), smashes 3 letter boards and drops 6.6 m into North Avenue',
    intro: { from: [0, 6.6, -68], to: [0, G, -40], seconds: 6 }, lane: rect(-5.5, -62, 5.5, -9),
    clearance: 'North Avenue 18 m wide, 53 m long, open sky (no overhead items) — the long arm is the runway; fort reached at z -9',
    mechanics: ['phase 2: rips the bike-signal masts off and throws them', 'phase 3: storm — lightning lights the canyon, zombie waves from every gate'],
  },
};

// ---------------------------------------------------------------------------------------------------------------
// LIGHTS — realtime: true (<= 6, the runtime budget) or baked into the lightmap.
// ---------------------------------------------------------------------------------------------------------------
export const LIGHTS = [
  { id: 'L_FIRE_E', type: 'point', realtime: true, pos: [58.5, 1.1, -18.0], color: '#ff8a3a', intensity: 30, range: 13, flicker: { kind: 'fire', speed: 1.0, amount: 0.35 }, note: 'burning car, East Cross' },
  { id: 'L_FIRE_C', type: 'point', realtime: true, pos: [-10.5, 1.4, 11.0], color: '#ff9442', intensity: 14, range: 8, flicker: { kind: 'fire', speed: 1.4, amount: 0.4 }, note: 'barrel fire at the SW plaza corner' },
  { id: 'L_LED_W', type: 'point', realtime: true, pos: [-67.0, 9.2, 0.0], color: '#ffae2e', intensity: 22, range: 20, flicker: { kind: 'scroll', speed: 0.25, amount: 0.15 }, note: 'LED gantry wash on the barricade' },
  { id: 'L_DELI', type: 'point', realtime: true, pos: [-12.5, 3.9, -33.0], color: '#dff2ff', intensity: 9, range: 9, flicker: { kind: 'fluorescent', speed: 3.0, amount: 0.8 }, note: 'failing tubes inside the deli' },
  { id: 'L_BEACON_E', type: 'spot', realtime: true, pos: [41.3, 3.5, -2.0], color: '#ffa22a', intensity: 14, range: 12, flicker: { kind: 'rotate', speed: 1.4, amount: 1.0 }, note: 'rotating beacon on the army truck cab' },
  { id: 'L_LAMP_S', type: 'point', realtime: true, pos: [7.0, 7.2, 44.0], color: '#ffb46b', intensity: 10, range: 15, flicker: { kind: 'sodium', speed: 0.6, amount: 0.9 }, note: 'failing sodium streetlamp (LAMP_9)' },
  // baked
  { id: 'LB_LED_PANEL', type: 'area', realtime: false, pos: [-69.0, 9.6, 0.0], size: [9, 3.6], color: '#ffae2e', intensity: 6, note: 'LED panel emissive' },
  { id: 'LB_BRIDGE_1', type: 'point', realtime: false, pos: [-3.5, 4.9, -63.0], color: '#ffb066', intensity: 8, range: 10 },
  { id: 'LB_TUNNEL_END', type: 'point', realtime: false, pos: [0, 4.5, -75], color: '#ff9f50', intensity: 6, range: 9, note: 'distant lamp at the far end of the underpass (silhouettes zombies)' },
  { id: 'LB_SIGNALS', type: 'emissive', realtime: false, note: 'bike signal lenses (amber + green) on the 4 masts, blinking amber (emissive animation only)' },
  { id: 'LB_LAMPS', type: 'point', realtime: false, note: 'STREET_LAMPS with state "on": warm sodium 2200 K, range 12, baked' },
  { id: 'LB_SHOPS', type: 'area', realtime: false, note: 'a few lit shop interiors (candy shop dim, laundromat cold) + 2F apartment windows (3-4 warm)' },
  { id: 'LB_FIRES_FAR', type: 'emissive', realtime: false, note: 'fire glow in 2 upper windows of BD_NE + the burning tower in the skyline' },
];

// ---------------------------------------------------------------------------------------------------------------
// ROUND FLOW on this map (rules.js ROUNDS) — which spawner kinds the director may use.
// ---------------------------------------------------------------------------------------------------------------
export const ROUND_PLAN = [
  { r: 1, use: ['street', 'gate:SP_N_TUN_A'], note: 'four directions from the street ends (classic opening)' },
  { r: 2, use: ['street', 'gate', 'fence'], note: '+ tunnel B, LED gap, South Lane' },
  { r: 3, use: ['street', 'gate', 'fence', 'manhole'], note: '+ manholes inside the arms' },
  { r: 4, use: ['street', 'gate', 'fence', 'manhole', 'alley'], note: '+ service alleys (side approaches)' },
  { r: 5, use: ['street', 'gate'], boss: 'mid', note: 'butcher from the south; light escort' },
  { r: 6, use: ['all but center'], note: 'windows/roofs/dock open: flanks onto the sidewalks near the fort' },
  { r: 7, use: ['all'], note: '+ bridge leapers, center windows' },
  { r: 8, use: ['all'], note: '+ center manhole' },
  { r: 9, use: ['all'], note: 'everything' },
  { r: 10, use: ['street', 'gate', 'roof:SP_N_BRIDGE'], boss: 'final', note: 'colossus from the bridge' },
];

// ---------------------------------------------------------------------------------------------------------------
// BUILD ZONES — 6 zones of similar effort. Each owns everything (ground, curbs, buildings, props, blockers,
// spawn pockets) whose footprint lies inside its polygon; borders run through open street at |x| or |z| = 26 so
// ground seams are straight cuts across the carriageway (same materials, lane lines, curb lines on both sides).
// ---------------------------------------------------------------------------------------------------------------
export const BUILD_ZONES = [
  { id: 'center', name: '中央路口與貨櫃堡壘', polygon: rect(-26, -26, 26, 26) },
  { id: 'north', name: '北大道與鐵路橋', polygon: rect(-26, -80, 26, -26) },
  { id: 'west', name: '西街、西橫街與 LED 門架', polygon: rect(-84, -40, -26, 40) },
  { id: 'east', name: '東街、東橫街與倉儲', polygon: rect(26, -40, 84, 40) },
  { id: 'south', name: '南大道、南橫街與南巷', polygon: [[-26, 26], [26, 26], [26, 40], [38, 40], [38, 84], [-38, 84], [-38, 40], [-26, 40]] },
  { id: 'skyline', name: '街廓背面、外圍與天際線', polygon: 'everything outside the five zones above: block interiors (BACKDROP BD_*), rail embankment beyond |x| > 26, pocket-end facades, distant towers, sky dome' },
];

// ---------------------------------------------------------------------------------------------------------------
// map.json (contract fields). The integration step writes this to game/assets/maps/losttown/map.json.
// ---------------------------------------------------------------------------------------------------------------
export function toMapJson() {
  return {
    name: META.name, nameEn: META.nameEn, id: META.id,
    bounds: META.bounds,
    sun: { dir: ENV.sun.dir, color: ENV.sun.color, intensity: ENV.sun.intensity },
    env: { hdri: ENV.sky.hdri, envIntensity: ENV.sky.envIntensity, backgroundIntensity: ENV.sky.backgroundIntensity, tint: ENV.sky.tint },
    fog: { color: ENV.fog.color, density: ENV.fog.density },
    exposure: ENV.exposure,
    playerSpawns: PLAYER_SPAWNS,
    zones: ZONES.map(({ id, name, polygon }) => ({ id, name, polygon })),
    spawners: SPAWNERS.map(({ id, zone, pos, kind, facing, rounds, exit }) => ({ id, zone, pos, kind, facing, rounds, exit })),
    buy: BUY,
    supply: SUPPLY.map((s) => s.pos),
    bossArenas: { mid: { center: BOSS_ARENAS.mid.center, radius: BOSS_ARENAS.mid.radius }, final: { center: BOSS_ARENAS.final.center, radius: BOSS_ARENAS.final.radius } },
    lights: LIGHTS.filter((l) => l.realtime).map(({ type, pos, color, intensity, range, flicker }) => ({ type, pos, color, intensity, range, flicker })),
    objectives: [],
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Self-checks (run: node tools/map/losttown/layout.mjs). Pure geometry, no rendering.
// ---------------------------------------------------------------------------------------------------------------
export function pointInPoly(p, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > p[1]) !== (zj > p[1]) && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
const strictlyInside = (p, poly) => pointInPoly(p, poly) && !poly.some(([x, z], i) => { const [x2, z2] = poly[(i + 1) % poly.length]; const cross = (x2 - x) * (p[1] - z) - (z2 - z) * (p[0] - x); const dot = (p[0] - x) * (x2 - x) + (p[1] - z) * (z2 - z); return Math.abs(cross) < 1e-6 && dot >= 0 && dot <= (x2 - x) ** 2 + (z2 - z) ** 2; });
export function boxCorners(b) { const hw = b.w / 2, hd = b.d / 2; return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([u, v]) => { const [x, z] = rotXZ(u, v, b.rot || 0); return [b.x + x, b.z + z]; }); }
export function validate() {
  const errs = [], warns = [];
  const bpolys = BUILDINGS.map((b) => [b.id, b.footprint]);
  const rows = STREETS.map((s) => [s.id, s.row]);
  // 1. no building corner strictly inside a street row and vice versa (cheap overlap test on a sample grid)
  for (const [bid, fp] of bpolys) {
    const xs = fp.map((p) => p[0]), zs = fp.map((p) => p[1]);
    for (let x = Math.min(...xs) + 0.25; x < Math.max(...xs); x += 0.5) for (let z = Math.min(...zs) + 0.25; z < Math.max(...zs); z += 0.5) {
      if (!pointInPoly([x, z], fp)) continue;
      for (const [sid, row] of rows) if (strictlyInside([x, z], row)) { errs.push(`building ${bid} overlaps street ${sid} at ${x},${z}`); break; }
      for (const [oid, ofp] of bpolys) if (oid !== bid && pointInPoly([x, z], ofp)) { errs.push(`building ${bid} overlaps ${oid} at ${x},${z}`); break; }
    }
  }
  // 2. spawners / supply / player spawns not inside buildings; spawner zone matches its gameplay zone polygon (or a pocket)
  const inBuilding = (p) => bpolys.find(([, fp]) => strictlyInside(p, fp));
  for (const s of SPAWNERS) {
    const p = [s.pos[0], s.pos[2]];
    const b = inBuilding(p); if (b && s.kind !== 'window' && s.kind !== 'roof' && s.kind !== 'gate') errs.push(`spawner ${s.id} inside building ${b[0]}`);
    const ex = s.exit ? [s.exit[0], s.exit[2]] : p; const be = inBuilding(ex); if (be) errs.push(`spawner ${s.id} exit inside ${be[0]}`);
    const z = ZONES.find((zz) => zz.id === s.zone); if (!pointInPoly(ex, z.polygon) && !pointInPoly(p, z.polygon)) warns.push(`spawner ${s.id} (and exit) outside gameplay zone ${s.zone}`);
    const d = Math.hypot(ex[0], ex[1]); if (d < 9 && s.zone !== 'center') warns.push(`spawner ${s.id} exit only ${d.toFixed(1)} m from the fort`);
  }
  for (const s of SUPPLY) { const b = inBuilding([s.pos[0], s.pos[2]]); if (b && s.kind !== 'interior') errs.push(`supply ${s.id} inside ${b[0]}`); }
  for (const p of PLAYER_SPAWNS) if (!pointInPoly([p[0], p[2]], LANDMARKS.fort.deck.poly)) errs.push(`player spawn ${p} off the fort deck`);
  // 3. props not inside buildings
  for (const pr of PROPS) for (const c of boxCorners(pr)) { const b = inBuilding(c); if (b && pr.kind !== 'dock_apron') { errs.push(`prop ${pr.id} corner inside ${b[0]}`); break; } }
  // 4. fort ramps stay inside the open intersection/arms and leave >= 2.5 m to buildings
  for (const r of LANDMARKS.fort.ramps) for (const c of r.poly) { const b = inBuilding(c); if (b) errs.push(`ramp ${r.id} inside ${b[0]}`); }
  // 5. boss arena centres walkable + far from the fort
  for (const [k, a] of Object.entries(BOSS_ARENAS)) { const d = Math.hypot(a.center[0], a.center[2]); if (d < 25) errs.push(`boss arena ${k} centre only ${d} m from the fort`); if (inBuilding([a.center[0], a.center[2]])) errs.push(`boss arena ${k} centre inside a building`); }
  // 6. build zones: every building / prop belongs to exactly one zone polygon and its declared zone matches
  const zpoly = Object.fromEntries(BUILD_ZONES.filter((z) => Array.isArray(z.polygon)).map((z) => [z.id, z.polygon]));
  const zoneOf = (p) => Object.entries(zpoly).filter(([, poly]) => pointInPoly(p, poly)).map(([id]) => id);
  for (const b of BUILDINGS) {
    const cx = b.footprint.reduce((a, p) => a + p[0], 0) / b.footprint.length, cz = b.footprint.reduce((a, p) => a + p[1], 0) / b.footprint.length;
    const zs = zoneOf([cx, cz]); if (zs.length !== 1 || zs[0] !== b.zone) errs.push(`building ${b.id} centroid in zones [${zs}] but declared ${b.zone}`);
    for (const c of b.footprint) { const zc = zoneOf([c[0] - Math.sign(c[0] - cx) * 0.01, c[1] - Math.sign(c[1] - cz) * 0.01]); if (!zc.includes(b.zone)) { errs.push(`building ${b.id} corner ${c} outside its zone ${b.zone}`); break; } }
  }
  for (const pr of PROPS) { const zs = zoneOf([pr.x, pr.z]); if (!zs.includes(pr.zone)) errs.push(`prop ${pr.id} at ${pr.x},${pr.z} in [${zs}] but declared ${pr.zone}`); }
  for (const s of SPAWNERS) { const zs = zoneOf([s.pos[0], s.pos[2]]); if (!zs.includes(s.zone)) errs.push(`spawner ${s.id} pos in build zones [${zs}] but declared ${s.zone}`); }
  const rt = LIGHTS.filter((l) => l.realtime).length; if (rt > 6) errs.push(`${rt} realtime lights > 6`);
  return { errs, warns };
}

if (typeof process !== 'undefined' && process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/map/losttown/layout.mjs')) {
  const { errs, warns } = validate();
  console.log(`buildings ${BUILDINGS.length}, props ${PROPS.length}, spawners ${SPAWNERS.length}, supply ${SUPPLY.length}, lights ${LIGHTS.filter((l) => l.realtime).length} realtime`);
  for (const w of warns) console.log('warn:', w);
  for (const e of errs) console.log('ERROR:', e);
  console.log(errs.length ? `${errs.length} errors` : 'layout OK');
  if (process.argv.includes('--json')) console.log(JSON.stringify(toMapJson(), null, 1));
  process.exitCode = errs.length ? 1 : 0;
}
