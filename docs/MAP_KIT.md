# 地圖套件 MAP KIT — 編譯器、套件 API、執行期載入

> 地圖由程式產生：`tools/map/<map>/zones/*.mjs` 用套件（kit）描述街道、建築、車輛與道具，
> `tools/map/compile.mjs` 把它們合併、烘焙光照貼圖、產生碰撞與導航，輸出 `game/assets/maps/<map>/` 地圖包，
> 遊戲用 `game/src/world/mapPackage.js` 載入。所有素材皆為 CC0（見 `docs/CREDITS.md`）。

## 1. 流程總覽

```
tools/map/fetch.mjs            Poly Haven / ambientCG CC0 材質、HDRI、道具 -> game/assets/maps/common/
tools/map/<map>/layout.mjs     地圖資料（META、ENV、ZONES、出生點…；純資料，可選）
tools/map/<map>/zones/*.mjs    各區塊：export function build(kit, layout) { ... }
        │
        ▼  node tools/map/compile.mjs <map> [--only zoneA,zoneB] [--nobake] [--fast] [--meshopt]
game/assets/maps/<map>/
  map.json        定義：材質、天空、太陽、霧、出生點、出怪點、區域、購買區、補給、BOSS 場地、燈光、統計
  static.glb      視覺網格（依「材質 × 區塊」合併）：POSITION、NORMAL、TEXCOORD_0（世界座標公尺 UV）、
                  TEXCOORD_1（光照貼圖 UV）、COLOR_0（頂點色調）；mesh extras { mat, lm, chunk }
  collision.glb   簡化碰撞：POSITION + _SURF（每頂點的 SURF id，見 game/src/world/collision.js）
  nav.json/.bin   NavGrid（game/src/world/nav.js）：Float32 高度 w*h + Uint8 旗標 w*h（1 可走 2 水 4 攀爬 8 禁止）
  lm_<i>.png      光照貼圖（RGBM-sqrt：E = range * (rgb*a)^2）；lm_<i>_sun.png 太陽可見度遮罩
        │
        ▼  game/src/world/maps/<map>.js:  export const build = (ctx) => buildPackageMap('<dir>', ctx)
World.load()  （registry: game/src/world/maps/index.js；開發中的地圖用 ?map=<id> 開啟）
```

常用指令：

| 指令 | 用途 |
|---|---|
| `node tools/map/fetch.mjs` | 下載並處理全部 CC0 素材（已是最新的會跳過）；`--textures` / `--hdris` / `--props`、`--only id,id`、`--force`、`--list` |
| `TEXTURES[]` 選項 | `ph` / `acg` 來源、`hero`（2k）、`tile`（公尺）、`grey: true`（去飽和、供逐物件染色）、`gain`（線性反照率倍率）、`alpha` |
| `node tools/map/fetch.mjs --variants` | 補寫 `common/` 每張貼圖的 `@1k` / `@512` 尺寸版本（抓取與程序化貼圖產生時會自動寫；`--force` 全部重寫） |
| `node tools/map/compile.mjs losttown --only center --nobake` | 快速迭代單一區塊（不烘焙；執行期以 IBL + 太陽照明） |
| `node tools/map/compile.mjs losttown --fast` | 預覽品質烘焙（4 texel/m、16 samples） |
| `node tools/map/compile.mjs losttown` | 正式烘焙（META.lightmapResolution，預設 8 texel/m、64 samples、≤ 6 執行緒） |
| `node tools/map/mapshots.mjs <registry id> --views views.json` | 一個瀏覽器拍多個視角（需 dev server），輸出 `captures/map/<id>/`；視角可帶 `js`（先在頁面執行，例如改曝光、畫質），`pitch` > 0 往下看 |
| `node tools/map/losttown/navverify.mjs --png` | 檢查**編譯後**的導航格：從堡壘泛洪（與執行期相同規則），驗證出生點、出怪點（與 exit）、補給、購買區、BOSS 落點都連通，列出孤島；`captures/map/losttown/nav.png` 俯視圖 |
| `node tools/map/mapshots.mjs <id> --eval tools/map/walktest.js` | 真的用玩家控制器沿導航路徑從出生點走到每個出怪點 exit／補給／BOSS 落點，回報卡住（隱形牆、爬不上的台階）與掉落的位置 |
| `http://127.0.0.1:5190/?map=kittest&match=0` | 在遊戲中自由走動 |

套件驗證場景：`tools/map/_kittest/`（街角：兩棟完整建築、車庫、圍籬空地、各型車輛、路燈、電線桿、號誌、拒馬…）。

## 2. 座標與慣例

- 單位公尺；**+X 東、+Y 上、+Z 南**（北 = −Z）。2D 地面點 `[x, z]`，3D 點 `[x, y, z]`。
- `rot` = three.js `rotation.y`（由上往下看逆時針，弧度）：區域座標 +X → 世界 `(cos, 0, −sin)`。
- 玩家／出怪點 `yaw`：前方 = `(−sin yaw, 0, −cos yaw)`；0 = 北、−π/2 = 東、π = 南、π/2 = 西。
- 面以「從正面看逆時針」定義；`kit.face()` 自動處理凹多邊形與洞。
- 貼圖 UV 以公尺計，投影在面上（牆：u 沿 `cross(up, n)`、v = 高度；地面：u = x、v = −z），再除以材質的實際尺寸
  `tile`，所以紋理比例正確且在相鄰物件間連續。`uvs`（公尺）、`uvOffset`、`uvRot`、`uvScale`、`uvLocal` 可覆寫。
- 頂點色調 `tint`（sRGB hex，乘在貼圖上）、`grime: { y, h, k }`（牆腳變暗）、`shade`（純量）讓同一材質的不同建築
  合併成同一個 draw call 仍有變化。

## 3. 區塊模組

```js
// tools/map/losttown/zones/center.mjs
export function build(kit, layout) {
  kit.ground([[-40, -6], [40, -6], [40, 6], [-40, 6]], { mat: 'asphalt' });
  kit.slab([[6, -40], [40, -40], [40, -6], [6, -6]], { mat: 'sidewalk', y1: 0.15 });
  kit.at({ y: 0.15 }, () => kit.building({ rect: { x: 20, z: -20, w: 18, d: 13 }, floors: 3, mat: 'brick_red',
    sides: [{ ground: 'shop', awning: {}, sign: { lit: true }, fireEscape: 2 }, {}, { type: 'blank' }, {}] }));
  kit.vehicle({ type: 'police', at: [-3, 14], rot: Math.PI / 2, state: 'wrecked' });
  kit.spawner({ pos: [0, 0.05, -38], kind: 'street', lookAt: [0, 0] });
  return {};   // 可選：{ playerSpawns, spawners, buy, supply, zones, bossArenas, lights, objectives }
}
```

每個區塊有自己的 kit（隨機種子由區塊名決定，結果可重現）。`kit.rnd(a,b) / irnd / pick / chance` 是有種子的亂數。
`layout.mjs` 可匯出（皆可選）：

| 匯出 | 內容 |
|---|---|
| `META` | `{ id, name, nameEn, bounds:[minx,miny,minz,maxx,maxy,maxz], killY, chunk (合併格 m，預設 40), lightmapResolution (texel/m), maxAtlases, lightmapSamples (pass B 上限，預設 64), navCell, preview }` |
| `ENV` | `{ sun:{ dir (指向太陽), color, intensity, angle (度), shadow:{ mapSize, extent } }, sky:{ hdri, rotationDeg, envIntensity, backgroundIntensity, backgroundBlur, tint }, fog:{ color ('auto' = 天空地平線色), density }, exposure, grade }` |
| `toMapJson()` | 若有匯出，優先採用它的 `playerSpawns spawners buy supply zones bossArenas objectives`（地圖合約欄位） |
| `ZONES` | `[{ id, name, nameEn, polygon:[[x,z]...], floorY? }]` |
| `PLAYER_SPAWNS` `SPAWNERS` `BUY` `SUPPLY` `BOSS_ARENAS` `OBJECTIVES` | 沒有 `toMapJson()` 時使用；與 map.json 同格式（`SUPPLY` 可為 `{ pos }` 物件） |
| `LIGHTS` | 有 `pos` 的燈全部收進 map.json：`realtime: true` 進執行期燈池，其餘烘焙（`type: 'area'` 以點光源近似）。`flicker` 可為字串或 `{ kind, speed, amount }`（fire / buzz / fluorescent / sodium / strobe / pulse / rotate / scroll） |

## 4. 套件 API（`tools/map/lib/kit.mjs`）

### 4.1 變換與低階幾何

| 方法 | 說明 |
|---|---|
| `kit.at({ x, y, z, rot, rx, rz, scale }, fn)` / `push()` / `pop()` | 區域座標框架（可巢狀）；所有幾何、碰撞、燈光、標記都套用目前框架 |
| `kit.face(pts, mat, o)` / `kit.quad(a, b, c, d, mat, o)` | 平面多邊形（逆時針朝正面）；`o.holes`、`o.collide`、UV / 色調選項 |
| `kit.upFace(pts, mat, uvs?, o)` | 水平面，自動翻成朝上 |
| `kit.box({ x, y, z, w, h, d, rot, mat, faces:{top,bottom,px,nx,pz,nz}, collide })` | 盒子（`y` = 底面）；`faces` 可換材質或 `false` 省略 |
| `kit.bbox({ ..., bevel, taper:{ top:[sx,sz], shift:[dx,dz] } })` | 倒角盒（車身、機械、家具） |
| `kit.hull(points, mat, o)` | 點集合凸包 |
| `kit.prism(pts2, y0, y1, { side, top, bottom, continuousUV, collide })` | 垂直柱體 |
| `kit.sweep(profile2, path3, mat, { closed, smooth, caps, up, collide })` | 截面沿折線掃掠（簷口、管線、欄杆、電線） |
| `kit.cyl({ x, y, z, r, r2, h, seg, caps, top, bottom, rx, rz })` / `kit.lathe(profile, o)` | 圓柱 / 圓錐台、旋轉體 |
| `kit.mesh(bufferGeometry, mat, { uv: 'keep' | 'world', collide })` | 任意 three.js 幾何 |
| `kit.emit(mat, P, N, UV, C, I)` | 最低階：世界座標頂點陣列 |

### 4.2 碰撞與導航

| 方法 | 說明 |
|---|---|
| `kit.colBox({ x, y, z, w, h, d, rot }, surf)` `colQuad` `colPoly(pts, surf, holes)` `colPrism` `colHex(8 角點)` `colMesh` `colTris` | 碰撞（不可見）；`surf` = `concrete metal wood dirt glass flesh water tile sand grate` |
| `kit.colRamp(from, to, width, surf)` | 樓梯用的斜坡碰撞 |
| `kit.nav(flag, poly, { y0, y1 })` | `'block'`（殭屍不走）、`'climb'`（可攀爬）、`'water'`、`'walk'` |

高階函式會自動加簡化碰撞（建築 = 外框柱體 + 女兒牆；車 = 車身盒；圍籬 = 薄牆…），`collide: false` 可關閉。
導航格由碰撞網格產生：每格收集所有可走表面（屋頂、樓層、遮雨棚下的街道），從出生點與出怪點泛洪，選最低的可達層。

### 4.3 地面（`kit/ground.mjs`）

| 方法 | 說明 |
|---|---|
| `kit.ground(poly, { y, mat, holes, heightAt(x,z), collide })` | 地面區域，依合併格切開（光照貼圖、視錐剔除） |
| `kit.slab(poly, { y0, y1 (0.15), mat, edge, curb (0.18), curbMat, edges:[邊索引] })` | 抬高的人行道 / 平台 / 卸貨台，含路緣石 |
| `kit.markLine(path2, { width, mat: 'paint_white' | 'paint_yellow', dash:[on,off], double:gap, y })` | 道路標線（磨損油漆貼花） |
| `kit.crosswalk({ at, dir, across, length, stripe, gap })` | 斑馬線 |
| `kit.patch(poly, { mat: 'asphalt_patch', lift })` | 補丁貼花（世界座標 UV） |
| `kit.decal({ at, size, rot, mat, y })` | 單張貼花（UV 0..1）：`decal_stain` 油漬、`decal_puddle` 積水（反射天空）、`decal_cracks` 裂縫、`decal_dirt` 泥污 |
| `kit.scatterDecals(poly, { count, mats:{ mat: 權重 }, size:[min,max], y, avoid:[[x,z,r]] })` | 在區域內隨機撒貼花 |
| `kit.manhole([x,z])` `kit.drain([x,z], rot)` | 人孔蓋、排水溝蓋 |

### 4.4 建築（`kit/arch.mjs`）

| 方法 | 說明 |
|---|---|
| `kit.wall({ a, b, y0, h, t, mat, inner, cap, ends, openings, bands, grime, tint, room, interior, collide })` | 直牆（外側在 a→b 右手邊），開口自動做窗洞側面 |
| `opening`：`{ x | cx, w, y, h, type, state, ... }` | `type`：`window`（`state`: glass / dark / broken / boarded / shutter）、`door`（closed / open，`walk:true` 可通行）、`shop`（櫥窗）、`garage`（捲門，`shutter` 0..1）、`vent`、`hole`；非可進入樓層的窗後自動加「假房間」 |
| `kit.building({ poly | rect:{x,z,w,d,rot}, floors, floorH, groundH, mat, tint, trim, plinth, belt, cornice, quoins, roof, windows, sides, enter, wallT, grime, streaks })` | 完整建築外殼，回傳 `{ height, roofY, edges, doors, windows }`（世界座標，可用來放出怪點）。`floors` 可為層數或各層高度陣列（例 `[5.0, 3.3, 3.3]`）；`streaks` = 窗台下黑色雨痕機率（0.45）；建築足跡下的地面自動挖掉 |
| `sides[i]`（足跡第 i 邊，逆時針；矩形：0 南、1 東、2 北、3 西） | `{ type: 'facade' | 'blank' | 'hidden', ground: 'shop' | 'doors' | 'windows' | 'garage' | 'blank', groundBays:[...], doorBay, openings:[...], awning:{...}, sign:{ lit, mat }, fireEscape: bay, blankFloors:[...], pipes }` |
| `roof` | `{ type: 'flat', parapet: 0.9, mat: 'roof_tar', coping, clutter }` 或 `{ type: 'gable', pitch: 30, overhang, mat: 'roof_shingles' }`（矩形） |
| `windows` | `{ w, h, sill, bay, states:{ glass, dark, broken, boarded }, lintel, ac (窗型冷氣機率) }` |
| `enter: { ground: true }` | 一樓可進入：內牆、地板、天花板、門與破櫥窗可通行。地板 `interiorFloor`（預設：有 `shop` 立面 → `interior_tiles`，否則 `interior_floor` 水泥）；每 ~6 m 一顆吊燈泡（`interiorLights: false` 關閉，約 30 % 壞掉）；每 ~6 m 一顆柔和冷色烘焙補光（`interiorFill` 0..2，預設 1，`decay: 1`、半徑 1.2 m，代替單次反彈烘焙缺少的多次反射；`name: 'fill'`，未烘焙時不進即時燈池） |
| `kit.awning` `kit.facadeSign` `kit.bladeSign({ x, y, w, h, lit })` `kit.fireEscape` `kit.downpipe` `kit.windowAC` | 立面細節（牆的區域座標：x 沿牆、外側 +z） |
| `kit.beam(a, b, { kind: 'I' | 'box' | 'L' | 'C', h, w, t, mat, up, collide })` | 型鋼（鐵橋、門架、貓道骨架）；搭配 `grate` 材質做格柵走道 |
| `kit.solid(poly, y0, y1)` | 宣告實心體足跡：其下方的地面在 `finalize()` 時被挖掉（`building()` 自動呼叫） |
| `kit.stairs({ at, rot, rise, run, width, rail })` | 樓梯（視覺階梯 + 斜坡碰撞） |
| `kit.ramp({ from, to, width, mat })` | 斜坡 |

### 4.5 街道設施（`kit/street.mjs`）

| 方法 | 說明 |
|---|---|
| `kit.fence(path2, { kind: 'chainlink' | 'wood' | 'metal' | 'concrete', h, barbed, gaps:[[s0,s1]], y })` | 圍籬（鐵絲網有 alpha） |
| `kit.gate({ at, rot, w, h, open })` | 鐵絲網大門 |
| `kit.jersey({ at, rot, length, stripes })` `kit.sandbags(path2, { rows })` `kit.plankBarricade({ at, rot, w })` `kit.tape(points3)` `kit.cone([x,z], { fallen })` | 拒馬、沙包、木製路障、封鎖線、交通錐 |
| `kit.streetLight({ at, rot, h, arm, on, color, intensity, range, realtime, flicker })` | 眼鏡蛇頭路燈（回傳燈光紀錄） |
| `kit.utilityPole({ at, h, arms, transformer, lean })` → 掛線點；`kit.wires(ptsA, ptsB, { sag })` `kit.wire(a, b)` | 木電線桿與電線 |
| `kit.trafficLight({ at, rot, arm, state })` `kit.roadSign({ at, rot, shape, size })` `kit.billboard({ at, rot, w, h, elev, lit })` | 號誌、路牌、廣告看板 |
| `kit.waterTower({ at, h, r })` `kit.container({ at, rot, size: 20 | 40, tint, doors })` | 水塔、貨櫃 |
| `kit.debris([x,z], { r, count, kinds })` `kit.rubblePile([x,z], { r, h })` `kit.trash([x,z])` | 碎磚、瓦礫堆、垃圾 |
| `kit.wallLamp({ x, y })` `kit.bulb([x,y,z])` | 壁燈、吊燈泡（含烘焙光源） |
| `kit.prop(id, { at, y, rot, rx, rz, scale, collide, tint })` | Poly Haven 道具（`game/assets/maps/common/props.json`），一併合併到靜態網格 |

### 4.6 車輛（`kit/vehicles.mjs`）

`kit.vehicle({ type, at, rot, color, state, tilt, roll, y })`：`type` = `sedan` `police` `taxi` `van` `pickup` `truck` `bus`；
`state` = `intact`（乾淨烤漆、玻璃）、`wrecked`（磨損烤漆、碎玻璃）、`burnt`（燒焦、只剩輪圈）。車頭朝區域 +X。

### 4.7 遊戲資料

| 方法 | 寫入 map.json |
|---|---|
| `kit.light({ type: 'point' | 'spot', pos, color, intensity, range, radius, decay, dir, angle, penumbra, flicker, realtime, bake, name })` | `lights`：預設烘焙進光照貼圖；`realtime: true` 為執行期點光源（每局 ≤ 6 個同時啟用，`flicker`: fire / buzz / strobe / pulse），即時燈請 `bake: false` |
| `kit.playerSpawn([x,y,z], yaw)` | `playerSpawns: [[x,y,z,yaw]]` |
| `kit.spawner({ id, pos, kind, facing | lookAt:[x,z], zone, weight, rounds })` | `spawners`；`kind`: street / alley / window / roof / manhole / fence / gate |
| `kit.buy([x,y,z], r)` `kit.supply([x,y,z])` | `buy: [[x,y,z,r]]`、`supply: [[x,y,z]]` |
| `kit.zoneDef({ id, name, polygon })` `kit.bossArena('mid' | 'final', { center, radius })` `kit.objective({...})` | `zones`、`bossArenas`、`objectives` |

## 5. 材質（`tools/map/lib/materials.mjs`）

材質名稱對應 `game/assets/maps/common/textures.json` 的貼圖組（Poly Haven / ambientCG CC0，或程序化備用），欄位：
`set tile color rough metal normal surf lm alphaTest opacity side emissive emissiveIntensity env decal cast uvRot lmBump`。

| 類別 | 材質 |
|---|---|
| 地面 | `asphalt` `asphalt_cracked` `asphalt_patch`（貼花）`asphalt_dark` `sidewalk` `curb` `concrete_floor` `concrete_cracked` `gravel` `dirt` `grass` `rubble` `paint_white` `paint_yellow` `paint_red` |
| 貼花 | `decal_stain` `decal_puddle` `decal_cracks` `decal_dirt` `decal_streak`（程序化 CC0，alpha 混合） |
| 立面 | `brick_red` `brick_dark` `brick_painted` `plaster` `concrete_wall` `concrete_dirty` `wood_siding` `corrugated` `corrugated_rusty` `metal_container`（去飽和，可染色）`metal_painted` `metal_shutter` `metal_rusty` `metal_worn` `paint_metal`（乾淨烤漆，可染色）`wood_planks` `roof_tar` `roof_shingles` |
| 收邊 | `trim_stone` `trim_concrete` `trim_metal` `trim_wood` `frame_dark` `frame_white` `steel` `steel_dark` `awning_fabric` |
| 室內 | `interior_wall` `interior_ceiling` `interior_hidden`（窗後假房間）`interior_floor`（車庫水泥）`interior_tiles`（髒污店面地磚）`interior_quarry`（深紅缸磚） |
| 玻璃 / 燈 | `glass` `glass_dirty` `glass_shop` `lamp_warm` `lamp_cold` `lamp_red` `lamp_amber` `lamp_green` `lamp_off` |
| 街道 / 車 | `chainlink` `grate` `perf_plate`（沖孔鋼板，圓孔不透明，下面要有深色底板）`pole_wood` `wire` `rubber` `sandbag` `tape_police` `cone_orange` `reflective_white` `sign_*` `billboard` `car_paint` `car_paint_worn` `car_burnt` `car_chrome` `car_plastic` `car_glass` `car_interior` `car_light` `car_taillight` |

道具材質自動命名為 `prop_<id>_<n>`。新增材質：在 `MATERIALS` 加一筆；需要新貼圖時在 `tools/map/fetch.mjs` 的 `TEXTURES` 加一筆並重新抓取。

## 6. 執行期（`game/src/world/mapPackage.js`）

- `buildPackageMap(dir, ctx)` 載入 map.json、static.glb（含 EXT_meshopt_compression 解碼）、collision.glb、nav、光照貼圖、HDRI，
  回傳 World 需要的 `{ root, collisionGeometry, playerSpawns, zombieSpawns, bounds, killY, update }`，
  另外把 map.json 欄位攤平在結果上（`world.def.spawners`、`bossArenas`、`buy`、`supply`…）並附 `def`、`nav`（同時設定 `world.nav`）。
- 光照：靜態面 = 光照貼圖（天空 + 反彈 + 烘焙燈）× 反照率 + 即時太陽 × 烘焙太陽遮罩 × 即時陰影；IBL 漫射被光照貼圖取代，
  IBL 鏡面以光照貼圖亮度遮蔽；法線貼圖會調制烘焙光（`lmBump`）。動態物件（玩家、殭屍）用 IBL + 太陽 + 陰影。
- 太陽陰影：2048（高）陰影貼圖跟隨玩家，於光源空間對齊 texel，邊緣不閃爍；範圍 `sun.shadow.extent`。
- 即時點光源：`realtime` 燈光池（低 2 / 中 4 / 高與極致 6），每 0.25 s 挑最近的燈，含閃爍。
- 貼圖依畫質選檔與縮小（`TEX_LIMITS`：低 512/256、中 1024/512、高 1024（arm 512）、極致 2048）：每張貼圖另有較小的尺寸版本
  （`x_diff.jpg` → `x_diff@1k.jpg`、`x_diff@512.jpg`，map.json `materials[].variants`），載入器 `variantFile()` 下載「仍 ≥ 上限的最小檔」，
  不足的部分在解碼時（createImageBitmap）縮小；同一檔案的貼圖共用快取。
- 霧色 `'auto'` 取 HDRI 地平線色；`env.tint` 只染背景天空（例如綠灰色暴風雲）。
- 調色：map.json `grade`（layout `ENV.grade` 物件：`saturation contrast shadowTint highlightTint lift gamma gain`，向量用線性倍率 `[r,g,b]`）與
  `exposure` 由 `World.load` 呼叫 `Renderer.setGrade(grade, exposure)` 套用；沒有 grade 的地圖（演習場）會回到中性值。
- 環境特效：map.json `fx`（layout `ENV.fx`）由 `game/src/world/mapAmbient.js` 繪製：`smoke`（會上升、擴散、隨風飄的柔和煙柱，
  `fire` > 0 時底部加上加法混色的火焰）、`ash`（鏡頭周圍隨風飄的灰燼與紙屑）。每層一個 draw call（instanced 面向鏡頭的四邊形，
  程序化貼圖，不需圖檔）；畫質低／中時粒子數 ×0.5／×0.75。
- 新地圖：`game/src/world/maps/<id>.js` 呼叫 `buildPackageMap`，並在 `game/src/world/maps/index.js` 登記
  （`CATALOG` 一筆：`kind: 'chapter'`＋章節號 `no`、`objective`、可選 `thumb` 縮圖（16:9，沒有時選單畫出 `plan` 戰術平面圖）、
  選單背景鏡頭 `preview.path`。`status: 'wip'` 在選擇章節裡顯示「建置中」、不能選，`?map=<id>` 仍可直接載入；
  改成 `'ready'` 就開放，最新一章自動成為選單背景與預設地圖）。

## 7. 編譯器做的最佳化

1. **材質折疊**：只差顏色 / 貼圖比例 / surf 的材質共用一個 GPU 材質（顏色移到頂點色、比例已烘進 UV）。
2. **自適應合併格**：三角形少的材質（道具、招牌、燈）改用 2×、4×… 的大格合併，直到每個 mesh ≥ `META.minTrisPerMesh`（2500）；
   設了 `META.trisPerMesh`（失落之城 12000）時，全圖 < `META.mergeBelow`（150k）三角形的材質還要合併到最多 ceil(總數 ÷ trisPerMesh) 個 mesh
   （消防栓、窗框、招牌、電線這類散布在每個 40 m 格裡的材質，原本每格一個 draw call）。失落之城：254 → 118 個 mesh。
3. **隱藏面剔除**：建築足跡下與被上層地面覆蓋（≤ 6 cm）的地面在 `kit.finalize()` 被挖掉；貼地的朝下面（箱底、道具底）被刪除；
   `dropCoveredFaces` 再刪掉「緊貼另一個不透明面、而且前方是封閉實體」的三角形（背靠背的牆、貼牆的板子背面…；7 個取樣點都要成立，
   完全共面的一對面還要從前方 3 cm 射線確認是在實體內，避免把一片零厚度隔板的兩面都刪掉），之後壓縮頂點。`--keepHidden` 關閉。
4. 碰撞網格以 1 mm 焊接、依 SURF 分開頂點；導航格從出生點與出怪點泛洪，只標記可達的最低層。

## 8. 效能預算與檢查

- 合併：每個「材質 × 40 m 區塊」一個 mesh；編譯時印出「最壞視角」估計（100 m 內的區塊總和，未計視錐剔除）。
  目標：高畫質任一視角 < 250 draw calls、< 1.2 M 可見三角形。
- 光照貼圖：2048 atlas；`META.maxAtlases` 可限制張數（自動降解析度）。室內 / 假房間材質用較低的 `lm` 倍率。
- 道具簡化到 `PROPS[].maxTris`（meshoptimizer），貼圖 1k、依畫質縮小。
- 即時太陽陰影：有光照貼圖的地圖，道具、窗框、招牌、車輛小零件、托架、沙包、電線不畫進陰影貼圖（`mapPackage.js` `RT_CAST_SKIP`，map.json `materials[].rtCast` 可個別覆寫）——靜態對靜態的影子已在烘焙的太陽遮罩裡，即時陰影只需要讓大型遮擋物遮住玩家與殭屍。
- 量測：`node tools/map/mapshots.mjs <id> --q high --eval tools/map/perfprobe.js`（各視角主畫面／含陰影的 draw calls、三角形、GPU 同步的影格時間，以及最後一個視角依群組拆分的可見物件數）。
- 手機記憶體：高畫質約 25 組 1k 材質；中畫質法線 / arm 512、低畫質全部 ≤ 512（直接下載 `@512` 檔，不解碼 2k 原圖）；KTX2 壓縮貼圖是之後的優化項目。

## 9. 光照貼圖 Lightmaps（`tools/map/lib/lightmap*.mjs`）

烘焙器是純 JS（three-mesh-bvh 的 BVH + `worker_threads`），不依賴 GPU。`compile.mjs` 會自動呼叫；也可以單獨使用：

```js
import { bakeLightmaps } from './lib/lightmap.mjs';
const res = await bakeLightmaps(staticMeshes, {
  sun: { dir: [-0.765, 0.5, 0.407], color: '#ffdcb4', intensity: 2.0, angle: 1.0 }, // dir 指向太陽
  skyHdr: 'game/assets/maps/common/hdri/overcast_soil_puresky_1k.hdr', skyIntensity: 0.55, // = scene.environmentIntensity
  resolution: 8, maxAtlas: 2048, samples: 64, bounces: 1, denoise: true, workers: 6,
  lights: [{ pos: [x, y, z], color: '#ffb36b', intensity: 6, range: 7, radius: 0.08 }],     // 只放「烘焙」燈
  occluders: [...],                     // 只投影、不收光照貼圖的網格（InstancedMesh 也可）
});
const meta = res.write('game/assets/maps/<map>', 'lm');  // lm_<i>.png (RGBM) + lm_<i>_sun.png，回傳 { range, mode, atlases }
```

回傳 `{ atlases: [{ index, width, height, rgbm|png (PNG Buffer), sun, file, sunFile }], meshes: [{ mesh, atlas }], range, mode,
encoding: 'rgbm-sqrt', uv: 'uv1', sun, sky, stats }`；網格的 geometry 會被換成帶 `uv1`（glTF `TEXCOORD_1`）的新 geometry，
`mesh.userData.lightmapAtlas` = atlas 編號（compile.mjs 寫成 mesh extras `lm`）。一個網格只會在一張 atlas 裡；太大的網格會被拆成
`<name>_lm<n>` 幾個網格（加在同一個 parent 底下，`compile.mjs` 會重新收集）。

### 9.1 流程

1. **UV2 圖表**：相連、法線差 < `chartAngle`（40°）的面長成一個圖表，投影到平均平面、旋轉成最小面積矩形；
   彎曲圖表攤平後若重疊就拆回單面。大小 = 世界面積 × `resolution` × `mesh.userData.lightmap.scale`，四周 `padding`（2 texel），
   skyline 打包到 ≤ `maxAtlas` 的 atlas；超過 atlas 的圖表沿長軸切開。`maxAtlases` > 0 時自動降低解析度塞進指定張數。
2. **Pass A**（每 texel）：8–24 條半球射線（天空估計 + 判斷是否在幾何體內），太陽軟陰影（`sunSamples` 條，抖動在 texel 覆蓋範圍與
   太陽圓盤內；全亮或全暗時 4 條就停），烘焙點光源 / 聚光燈（球形光源軟陰影）。
   **texel 中心在幾何體內**（牆腳、物件底下）時，會在 texel 覆蓋範圍內找可見的取樣點，並選「看到天空最少」的那一個：
   跨在牆上的 texel 代表室內那一側，光不會從牆腳漏進來。完全被埋住的 texel 標為無效，之後由「最暗」的鄰居填補。
3. **Pass B**：天空 + 一次反彈（`bounces` 可設 2）。命中點的入射光從 Pass A 結果建成的半解析度 RGB9E5 atlas 查表（整個城鎮
   只佔數 MB，留在 CPU 快取裡）× 材質反照率 + 自發光。自適應取樣：至少 `minSamples`（預設 samples/4，最少 16）條，
   標準誤差 < `adaptiveError`（3 %）就停。
4. **後處理**：無效 texel 暗偏好填補 → 邊緣保持的 à-trous 去噪（圖表邊界 / 法線 / 依每 texel 雜訊估計的亮度差停止；
   太陽遮罩只在半影處過濾）→ 擴張到 padding → **縫合平滑接縫**（同網格、不同圖表、頂點法線相同的共用邊：兩側的雙線性取樣拉到一致）
   → 編碼。

### 9.2 輸出格式（執行期契約）

| 檔案 | 內容 |
|---|---|
| `lm_<i>.png` | RGBA8，RGBM-sqrt：`E = range * (rgb * a)^2`，E 為 three.js 單位的輻照度（天空 + 反彈 + 烘焙燈；`mode: 'full'` 時再加太陽）。`range` 是 2 的冪（4–64），自動取 99.9 % texel 的上界，寫在 map.json `lightmap.range`。 |
| `lm_<i>_sun.png` | 8-bit 灰階，太陽可見度 0..1（軟陰影）。執行期即時太陽 × 遮罩 × 即時陰影貼圖（殭屍 / 玩家的影子）。 |

取樣：`uv1`、`flipY = false`、線性（NoColorSpace）、ClampToEdge；mipmap 可開（padding 2 texel）。著色：
`diffuse = albedo/π × E`（與 three.js 的直接光同一單位，所以烘焙與即時光可以混用），環境貼圖的漫射 IBL 由光照貼圖取代、只保留鏡面
（並以光照貼圖亮度做鏡面遮蔽）。執行期實作在 `game/src/world/mapPackage.js`；開發檢視器 `game/src/tools/lmviewer.js` 用同樣的解碼。

### 9.3 每個網格 / 材質的控制

| 欄位 | 作用 |
|---|---|
| `mesh.userData.lightmap = false` | 完全不參與（不收、不擋） |
| `mesh.userData.lightmap.scale` | texel 密度倍率（`materials.mjs` 的 `lm`）：地面 / 立面 1、柏油 0.55、屋頂 0.5、遠景量體 0.25 |
| `mesh.userData.lightmap.receive = false` | 只投影、不收（= `occluders`）；InstancedMesh 一律當遮擋物 |
| `mesh.userData.lightmap.castShadow = false` | 收光照但不擋光（小裝飾、貼花） |
| `albedo` / `emissive` / `transmission` / `doubleSided` | 放在 `mesh.userData.lightmap` 或 `material.userData.lightmap`；反照率預設 = `material.color` × 貼圖平均色（Node 端讀不到貼圖時要給 `albedo`，否則用 0.3 並警告）；`transmission` 讓陰影射線以該機率穿過（鐵絲網、樹葉）；單面平面兩側都看得到時設 `doubleSided`（否則背面會被當成「在幾何體內」） |

燈光：`lights` 只放烘焙燈（`bake !== false && !realtime`）。即時燈（≤ 6）不要同時烘焙，否則會重複計算。

### 9.4 製圖規則（避免瑕疵）

- **牆至少 1.5 texel 厚**（8 texel/m 時 ≥ 0.2 m），或室內地板做成獨立的面（不要讓街道地面直接穿過牆當室內地板）；兩者都做到就完全不漏光。
- **不要產生看不到的面**：物件底面、埋進其他盒子的面、建築底下的地面。它們會變成「幾何體內」的無效 texel，浪費 atlas 與時間
  （log 會印出比例；> 15 % 時提示）。
- 單面平面（招牌、圍籬）兩側都可見時要 `doubleSided`。
- 只有小窗的室內在物理上很暗（約室外的 1/10）；遊戲沒有自動曝光，ACES 的趾部又會把 < 0.01 的亮度壓成全黑，所以室內要放烘焙補光燈
  （成本為零；`building({ enter })` 自動加），或 `bounces: 2`。目標：室內地面輻照度 E ≈ 0.8–1.2（室外陰影 ≈ 1.8），反照率 ≥ 0.12
  （Poly Haven 掃描常偏暗：`fetch.mjs` 的 `gain` 在線性空間提亮漫反射，例 `tiles_worn` ×2.2）。
- 自發光材質會在 Pass B 被當成面光源（LED 招牌、燈箱），面積太小的強光源會有雜訊 —— 改用烘焙點光源。
- HDRI 的太陽盤會被自動切掉（`skyClamp: 'auto'` = 8 × 中位數），直射光只來自 `sun`，不會重複。`skyIntensity` 要等於執行期的
  `scene.environmentIntensity`，`skyRotation` 等於 HDRI 的旋轉。

### 9.5 測試與預覽

```
node tools/map/test-lightmap.mjs                 # 測試場景（房間 + 窗、薄牆小屋、木箱、圓柱、球、室內燈）+ 13 項檢查
node tools/map/test-lightmap.mjs --hdr <file.hdr> | --synth-hdr | --mode full | --bounces 2 | --res 10 --samples 64
node tools/map/test-lightmap.mjs --town 200 --res 6   # 200 x 200 m 合成城鎮：效能 / 記憶體基準
```

檢查項目：開放地面全亮、窗戶光斑、室內陰影、三面牆腳不漏光、薄牆（地面穿過牆）不漏光、向陽牆腳沒有暗邊、木箱影子、
烘焙點光源、圓柱接縫（< 12 %）、陰影牆面雜訊（< 4 %）。失敗時 exit code 1。輸出：`game/assets/maps/_test/lm/`
（scene.glb + atlas + lightmap.json），`captures/lightmap/atlas_<i>.png`（左：色調映射後的輻照度，右：太陽遮罩）。

檢視器（dev server 要開著）：

```
http://127.0.0.1:5190/?view=lightmap&cam=1            # cam 0–5 預設視角；或 &pos=x,y,z&look=x,y,z&fov=70
  &lm=0          關掉光照貼圖（即時太陽 + 陰影 + IBL，對照用）
  &show=lm       白色材質只看光；&show=mask 只看太陽遮罩；&show=albedo 不打光
  &exp=4         曝光（看暗部）；&src=maps/<map> 換成其他有 scene.glb + lightmap.json 的資料夾
node tools/shot.mjs "http://127.0.0.1:5190/?view=lightmap&cam=1&show=lm" --w 1280 --h 720 --out captures/lightmap/cam1.png --wait 1500
```

### 9.6 效能與記憶體

基準（`--town 200 --res 6`：64 棟建築、每街廓 1 棟可進入、6.4 萬三角形 → 886 萬 texel、3 張 2048² atlas）：
500 M 射線、**1540 CPU 秒 ≈ 6 個空閒核心 4.5 分鐘**（與其他工作共用的機器上實測 10.3 分鐘），峰值 RSS 1.09 GB。
測試場景（20 萬 texel）約 30 CPU 秒。log 會印出每個 pass 的牆鐘時間、CPU 秒與「每 CPU 秒射線數」，可以判斷是演算法慢還是機器忙。

- 時間 ≈ texel 數：`resolution`（texel/m）平方成長，6 → 8 約 1.8 倍。省時間的順序：拿掉看不到的面 → 降低 `lm` 倍率
  （屋頂、遠景、柏油）→ `--fast`（4 texel/m、16 samples）迭代、正式版才 8 texel/m / 64 samples。
- 記憶體：每 texel 約 62 bytes（per-texel 結果）＋每張 2048² atlas 的後處理工作區約 350 MB（只配置一份、重複使用）＋BVH。
  886 萬 texel ≈ 1.1 GB。`workers` ≤ 6；每個 worker 只用共享記憶體（SharedArrayBuffer），自身 heap 很小。
- 品質旋鈕：`samples`（Pass B 上限，預設 64）、`adaptiveError`（0.03；0 = 固定取樣數）、`sunSamples`（32，只有陰影邊緣的 texel 會用滿）、
  `sunFilter`（1 texel 的 tent 濾波，陰影邊緣在雙線性取樣下平滑）、`denoiseIterations` / `denoiseSigma`、`bounces`、`stitch`。
- 執行期請維持「即時太陽 × 烘焙遮罩 × 即時陰影」相乘：只用即時陰影貼圖（近處不乘遮罩）會在牆腳、屋簷接縫看到陰影貼圖的漏光線。
