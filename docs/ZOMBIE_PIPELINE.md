# 殭屍角色轉檔管線 ZOMBIE PIPELINE

MakeHuman / MPFB2 的 CC0 資產 → 寫實殭屍 `game/assets/zombies/<type>.glb`（+ `<type>_lod1.glb`）。
全部是自己寫的 Node ES module（不使用 MakeHuman AGPL / MPFB2 GPL 程式碼），只讀它們的開放資料格式。
動作庫 `anims.glb` 由另一條管線（`tools/assets/zombies/anim/`）產生，兩者只透過下面的「執行期合約」溝通。

```
node tools/assets/zombies/build.mjs walker_a        # 建一種（LOD0 + LOD1，約 1.5–3 分鐘，RAM < 600 MB）
node tools/assets/zombies/build.mjs --all           # types/ 底下全部（檔名以 _ 開頭的略過）
node tools/assets/zombies/build.mjs walker_a --nolod
node tools/assets/zombies/build.mjs walker_a --preview   # 貼圖半解析度（調外觀用，約快 3–4 倍；別拿去出貨）
node tools/assets/zombies/inspect.mjs game/assets/zombies/walker_a.glb --extras   # 網格/材質/貼圖大小/extras
node tools/assets/zombies/validate.mjs game/assets/zombies/walker_a.glb game/assets/zombies/walker_a_lod1.glb
                                                    # Khronos glTF validator + 合約檢查（骨名、_SEG、角色材質名、三角形上限、extras）
node tools/assets/zombies/albedo.mjs game/assets/zombies/walker_*.glb      # 每個材質 baseColor 的 sRGB 平均（只算實際有畫到的 texel）+ ORM AO 平均
                                                    # （--uv u0,v0,u1,v1 只量一塊，例如頭部島 0.62,0.12,1,0.86）
ZOMBIE_ALBEDO_TRACE=1 node tools/assets/zombies/build.mjs walker_a --preview --nolod   # 印出每個上色階段後的 albedo 平均
```

下載的原始資料快取在 `tools/assets/zombies/src/`（git-ignore，約 170 MB；第一次 build 自動抓）。每次 build 會把用到的
資產資料夾併入 `tools/assets/zombies/credits.json` 並重寫 `docs/CREDITS.md` 的 zombie 區塊。

QA 檢視器（dev server `node scripts/dev.mjs` → http://127.0.0.1:5190）：

| URL 參數（`index.html?view=zombie&id=walker_a…`） | 用途 |
|---|---|
| `grid=1` | 2×2：正面、3/4、側面、背面 |
| `cam=face` / `upper` / `feet`，`yaw=`、`pitch=` | 特寫與角度 |
| `lod=1` | 看 `_lod1.glb` |
| `anim=walk_a&t=0.25`（`play=1` 連續播放） | 從 `anims.glb` 取 clip，經 `game/src/zombies/retarget.js` 對齊後擺到該時間點 |
| `wpose=test` | 蒙皮壓力測試姿勢（舉手、彎肘、抬腿深蹲、轉身）；`wpose=bone:x,y,z;…` 以**世界軸**旋轉（度） |
| `pose=bone:x,y,z;…` | 以骨骼**區域軸**旋轉（Blender 慣例：Y 沿骨頭） |
| `noOffsets=1` | 不套用 `extras.poseOffsets`（例如駝背） |
| `seg=1`、`bones=1`、`wire=1` | 斷肢分段著色、骨架、線框 |

截圖：`node tools/shot.mjs "http://127.0.0.1:5190/index.html?view=zombie&id=walker_a&grid=1" --w 1280 --h 1280 --out captures/z.png --wait 1500`

---

## 1. 執行期合約（遊戲端只依賴這些）

- **骨架**：MPFB2 `game_engine` 53 骨（UE Mannequin 命名：`Root`, `pelvis`, `spine_01..03`, `neck_01`, `head`,
  `clavicle_*`, `upperarm_*`, `lowerarm_*`, `hand_*`, 手指 `thumb/index/middle/ring/pinky_01..03_*`, `thigh_*`, `calf_*`,
  `foot_*`, `ball_*`）。公尺、+Y 上、角色面向 +Z，原點在兩腳之間的地面。
  - `Root`：原點、**單位旋轉**（與 `anims.glb` 相同）。其餘骨頭的 rest frame 依 Blender 慣例：區域 +Y 由 head 指向 tail，
    X/Z 由 rig JSON 的 roll 決定；位置在**變形後**的 base mesh 上重新計算（每種體型骨長不同）。
  - 動作 clip 直接套用即可（`anims.glb` 用同一慣例，只是預設體型）；要精確貼合（腳不穿地、骨長差異）就用
    `game/src/zombies/retarget.js` 的 `retargetClips(clips, animsScene, characterScene)`——它依兩邊 rest pose 對每根骨頭做
    共軛修正，並把 pelvis 位移按骨盆高度比例縮放。
- **檔案**：`<type>.glb` 一個 skin、所有網格都綁同一副骨架；LOD0 ≤ 9k 三角形；`<type>_lod1.glb` ≤ 2.5k（同 UV 佈局，
  可共用 LOD0 材質）。
- **網格**（節點名＝部位）：`body`、衣物（例：`worksuit`、`shoes`）、`eyes`、`teeth`、`eyebrows`、`hair`…
  屬性：`POSITION, NORMAL, TEXCOORD_0, JOINTS_0 (u8), WEIGHTS_0, _SEG`。
- **材質名＝角色**：`skin`、`cloth`、`eye`、`teeth`、`hair`、`gear`、`gore`（同名可重複，`material.userData.role` 也有）。
  貼圖嵌入：albedo（JPEG；有挖洞的布料/頭髮是 PNG + `alphaMode: MASK`）、normal（OpenGL/glTF 慣例）、
  ORM（R=AO, G=roughness, B=metal）。布料 `doubleSided`。
- **`_seg`**（three.js 屬性名 `_seg`，glTF `_SEG` unsigned byte，依 glTF 對齊規則 4-byte stride → 讀取請用
  `geometry.getAttribute('_seg').getX(i)`）：該頂點主導骨頭所屬斷肢段
  `0 軀幹/骨盆/脊椎/鎖骨, 1 頭+頸, 2 upperarm_l, 3 lowerarm_l+hand_l(+手指), 4 upperarm_r, 5 lowerarm_r+hand_r, 6 thigh_l, 7 calf_l+foot_l+ball_l, 8 thigh_r, 9 calf_r+foot_r+ball_r`。
  （分段取「各段權重總和最大者」，不是單一最大骨頭。）
- **root extras**（`gltf.scene.userData`，根節點 `userData` 也有同一份）：
  ```js
  { type: 'walker_a', height: 1.812,                    // 頭頂高度（公尺）
    hitboxes: { head: ['head', 0.107], neck: ['neck_01', r], chest: ['spine_03', r], spine: ['spine_01', r], pelvis: [...],
                upperarm_l, lowerarm_l, hand_l, upperarm_r, lowerarm_r, hand_r, thigh_l, calf_l, foot_l, thigh_r, calf_r, foot_r },
    capsules: { head: { bone, radius, length }, ... }   // 同上，加上骨頭長度（膠囊 = 骨頭 head→tail 線段 + 半徑）
    segments: ['torso','head',...],                     // _seg 編號對照
    poseOffsets: { spine_02: [7,0,0], ... },            // 選用：每幀在 mixer 之後疊加的區域 euler（度，XYZ）
    archetype, gender, tris, lod }
  ```
  半徑 = 該骨主導頂點到骨頭線段距離的 80 百分位（含衣服）。
  **遊戲端怎麼用**（`game/src/zombies/manager.js`）：`[bone, r, toBone]` 有 `toBone` → 膠囊 bone→toBone；沒有時，
  `chest`/`neck`/`pelvis`/`belly` 用預設終點骨（`defs.js DEFAULT_HITBOXES`：chest = spine_03→**neck_01**，所以 chest 半徑
  太大時頂端球會蓋住駝背姿勢的臉——walker_a 0.213 時從正面打眼睛 100% 算胸口，已壓到 0.15；建議 ≤ 0.16）；
  其餘（`head`、`spine`、`hand_*`、`foot_*`）沿**骨頭自身 +Y 軸**、長度取 `capsules[name].length`（隨骨頭轉，不再是
  世界 +Y 的短樁），`head` 另外在載入時貼合頭骨：從頭關節上方 2 cm 到「頭頂皮膚最高點 − 半徑」，並往眼睛方向偏移
  30 %（頭關節在顱骨後下方，原本臉和鼻子在頭部膠囊外）。新角色若自己加 `head_top` 之類終點骨（brute / riot /
  bloater / boss），就照 `toBone` 走。

## 2. 新增一種殭屍：`tools/assets/zombies/types/<type>.mjs`

匯出 `async function build(lib)`，回傳 `{ human, parts, budget?, partBudget?, extras?, lod1? }`。範本就是
`types/walker_a.mjs`。最小骨架：

```js
export async function build(lib) {
  const opts = lib.merge('bloated', {                        // 體型預設 + 覆寫
    macro: { gender: 1, age: 0.7, race: { african: 1 } },    // MakeHuman 巨集（0..1）
    modifiers: { 'stomach-pregnant-decr-incr': 0.3 },        // MPFB2 target.json 的 modifier 名（-1..1）
    expression: { 'mouth-open': 0.4 },                       // 表情單元，直接烘進 rest mesh（下巴無骨頭）
  });
  const h = await lib.Human.create(opts);
  const body = await h.proxyBody('male1591');                // 或 'female1605'、'proxy741'
  const shirt = await h.fit('clothes/male_casualsuit02', { name: 'shirt', role: 'cloth' });
  const eyes = await h.fit('eyes/low-poly', { name: 'eyes', role: 'eye', hide: false });
  const teeth = await h.fit('teeth/teeth_base', { name: 'teeth', role: 'teeth', hide: false });

  const skin = lib.paintSkin(h, { base: await lib.texture('system', 'skins/old_african_male/old_darkskinned_male_diffuse.png', 2048),
    pallor: 0.4, veins: 0.6, socket: 0.8, blood: { mouth: 1 }, wounds: [{ bone: 'spine_03', t: 0.5, dir: [0, 0, 1], r: 0.05 }] });
  body.material = lib.material('skin', skin);
  const cloth = lib.paintCloth(shirt, { human: h, base: await lib.texture(shirt.asset.textures.diffuse, 2048),
    normal: shirt.asset.textures.normal && await lib.texture(shirt.asset.textures.normal, 1024),
    grime: 0.7, fade: 0.4, blood: { collar: 0.8, splatter: 0.4 }, tear: { amount: 0.4 } });
  shirt.material = lib.material('cloth', { ...cloth, alpha: cloth.alpha, doubleSided: true, pngBits: 6 });
  h.hideCovered(body, (p) => cloth.holeAt(p));               // 衣服蓋住的皮膚刪掉，破洞下的留著
  eyes.material = lib.material('eye', lib.paintEyes(await lib.texture('system', 'eyes/materials/brown_eye.png', 512), { style: 'glow', color: [1, 0.5, 0.1] }));
  teeth.material = lib.material('teeth', { albedo: lib.grungeTexture(await lib.texture(teeth.asset.textures.diffuse, 512), { blood: 0.5 }) });
  return { human: h, parts: [body, shirt, eyes, teeth], partBudget: { shirt: 4000, teeth: 400 },
           extras: { poseOffsets: opts.poseOffsets }, lod1: { budget: 2500, drop: ['teeth', 'eyes'] } };
}
```

### 2.1 `lib` 一覽

| 名稱 | 說明 |
|---|---|
| `Human.create({macro, modifiers, expression})` | 變形 hm08 base mesh（macro：gender/age/muscle/weight/height/proportions/race；modifier 名照 MPFB2 `targets/target.json`，`l-`/`r-` 前綴指定單側，沒前綴的左右成對 category 會兩側一起套；直接寫 `'stomach/stomach-pregnant-incr'` 也可）、建骨架、算權重 |
| `h.proxyBody(name)` | 低模身體 proxy（`male1591` ≈3.1k 三角、`female1605`、`proxy741` ≈1.5k）。`h.basePart()` = 高模 base mesh（≈27k，只建議拿來畫貼圖） |
| `h.fit(folder, {name, role, hide})` | 任何 `.mhclo`/`.proxy` 資產（system pack 內資料夾：`clothes/*`、`hair/*`、`eyebrows/*`、`eyelashes/*`、`eyes/*`、`teeth/*`、`tongue/*`）。`hide:true` 把它的 `delete_verts` 記入 `h.hidden` |
| `h.hideCovered(body, keepFn)` | 刪除被衣服完全蓋住的身體面；`keepFn(p)` 回 true 的位置保留（破洞） |
| `h.jointPos('joint-l-eye')`、`h.skeleton.byName` | 錨點 |
| `merge(...presets)` / `PRESETS` | `average`、`gaunt`、`bloated`、`muscular`、`hunched`（駝背 = `poseOffsets`，不改 rest pose，動作仍共用） |
| `texture(pack, path, size)` / `texture(localFile, size)` | 讀貼圖並縮放（縮好的版本快取在 `src/cache/`，4096² 原檔只解一次） |
| `paintSkin(h, o)` | 皮膚：`pallor`+`tint`（屍色）、`mottle`、`veins`、`bruises`、`socket`（眼窩發黑）、`lips`、`grime`、`blood{mouth,hands,splatter}`、`wounds[{bone,t,dir,r,kind:'bite'|'gash',depth}]`、`coveredDarken`（衣服下的皮膚：擦傷/瘀青色素＋陰影，陰影一律寫進 ORM AO；`coveredShade` 決定陰影有多少也乘進 albedo，預設 0.62＝舊行為，有輸出 AO 的角色請給 ~0.2）、`bump`（灰階高度，例 sohh 殭屍皮膚）、`extra(P,N,c,state)` 自訂 → `{albedo, normal, orm}` |
| `paintCloth(part, o)` | 布料：`fade`、`yellow`（白布泛黃）、`weave`、`grime`、`blood{collar,hands,splatter,edges}`、`tear{amount,scale,stretch,fray,where(P,N),threadColor}` → `{albedo, normal, orm, alpha, holeAt(p), removedFaces}`；完全撕掉的面直接刪除 |
| `paintEyes(img, {style:'milky'|'dead'|'glow'|'bloodshot', color})` | 混濁／死灰／發光（附 `emissiveMap`，material 要給 `emissive:[1,1,1]`） |
| `grungeTexture(img, o)`、`thinHair(part, img, {amount})` | UV 空間髒污/血跡/染色；頭髮禿塊（alpha 挖洞） |
| `material(role, {albedo, normal, orm, alpha, doubleSided, emissive, emissiveMap, roughness, pngBits})` | GLB 材質描述；`pngBits:6` 讓大張 RGBA PNG 小 40% |

所有程序化遮罩都在**3D rest 表面**上取樣（每個 texel 經 UV raster 找到所在三角形與重心座標），所以跨 UV 接縫連續，
而且皮膚與衣服在同一個位置得到同一個值（`holeAt` 才能讓破洞下的皮膚剛好被保留）。

### 2.2 預算與 LOD

- `budget`（預設 9000）＝LOD0 總三角形；`partBudget` 先把指定部位用 meshoptimizer `simplifyWithAttributes`
  （保留法線/UV 接縫）減到目標，剩下超出的再按比例壓（`extras.noSimplify` 的部位不動）。
- LOD1：`lod1.drop` 的部位拿掉（預設 teeth、eyebrows），`lod1.partBudget`、總 `budget` 2500，貼圖縮 `texScale`（0.5）。
- walker_a 參考：LOD0 8.8k（body 2.6k、worksuit 4.0k、shoes 0.65k、hair 0.75k、teeth 0.5k、eyes/brows 0.36k），4.8 MB；
  LOD1 2.4k，1.4 MB。檔案大小大頭是挖洞布料的 2048² PNG（≈2.3 MB）。

### 2.3 Albedo 數值（遊戲內可讀性，必看）

遊戲用太陽＋天空＋環境光照角色，而且 `occlusionTexture`（ORM 的 R）會再壓一次環境光。walker_a 第一版在調整時把
AO／污垢／腐敗色一層層乘進 baseColor（皮膚只剩 sRGB ≈ 40、丹寧布 0.2 倍），在遊戲裡變成全黑剪影。規則：

- **AO 二選一**：有匯出 ORM（`occlusionTexture`）就**不要**再把 AO／接觸陰影／衣服下陰影乘進 albedo。射線 AO、
  布料投影都寫進 ORM 的 R（walker_a/c 的 `applyOcclusion`、walker_b 的 `occlusionPass`）；頭髮下的頭皮（髮根）、
  血、污垢、瘀青這些「顏色」才留在 albedo，而且只當局部細節。
- **數值目標**（`albedo.mjs` 量，sRGB、R/G/B 平均、只算有畫到的 texel）：蒼白／灰／蠟黃屍膚 95–140；衣物 55–120
  （依布料顏色，黑色緊身褲取深灰 ~55–70，不要純黑）；血／污垢只能是局部。
- 每次改完都要在**遊戲裡**看：測試場 `?w=akm&zombies=0&match=0&map=test`（不加 `map` 會進 Lost Town），用
  `__cf.game.zombies.spawn('walker', pos, { model: 'walker_a', puppet: true })` 擺在 (2, 0, 8.8) 那疊木箱旁，5 m 與 15 m、
  順光與背光都要看得出膚色和衣服顏色，不能是剪影；再到 Lost Town 實際地圖看一次（zviewer 的燈光比遊戲亮很多）。

修正前後（`albedo.mjs`，LOD0；括號內是臉部正面 / 身體島 `--uv 0.80,0.30,0.95,0.70` / `0,0,0.62,0.8`）：

| 類型 | 皮膚 | 衣物 | 鞋 |
|---|---|---|---|
| walker_a | 39.8 (58 / 34) → **97.6** (109 / 114) | 工作服 61.7 → **87.1** | 42.3 → **58.7** |
| walker_b | 81.3 (98 / 76) → **100.9** (112 / 104) | 66.7 → **69.2** | （赤腳） |
| walker_c | 41.0 (50 / 45) → **95.9** (97 / 114) | 53.1 → **71.9**（玫瑰色上衣 ~89、炭灰緊身褲 ~64） | 54.1 → **68.9** |
| runner | 48.2 → **99.8** (103 / 108) | 59.0 → **119.3**（冷淺灰背心 ~149、褪色藍丹寧短褲 ~88） | （赤腳） |

（皮膚整體平均被頭髮蓋住的皮膚拉低：walker_a 的頭皮、walker_c 長髮簾下的耳朵／臉側／後頸都刻意塗成髮色，
否則會從頭髮的破洞透出白色；臉與身體才是遊戲裡看得到的部分。）

尚未依此規則檢查的類型（2026-10-13 量測）：boss_butcher 靴子 25.1 / 圍裙 46.7 —— 新增或修改角色時先跑 `albedo.mjs`。

## 3. 內部流程（`tools/assets/zombies/lib/`）

| 模組 | 內容 |
|---|---|
| `fetch.mjs` | 下載快取到 `src/`（git-ignore）。MPFB2 檔案走 raw GitHub；asset pack zip 讀 central directory 後用 HTTP Range 只抽需要的檔案（不下載 268 MB 整包）。記錄 `usage` 供 CREDITS |
| `obj.mjs` | OBJ（保留原始頂點編號 + 每角 UV 編號 + group） |
| `targets.mjs` | `.target.gz` 稀疏 delta；macro 權重 = 各變數分段線性權重的乘積（規則見 MPFB2 `macro.json`） |
| `proxy.mjs` | `.proxy`/`.mhclo`：`pos = Σ wᵢ·V[refᵢ] + offset·scale`（scale 由 x/y/z_scale 參考頂點距離比得出）、`delete_verts` |
| `rig.mjs` | 骨架：CUBE（joint 方塊重心）/MEAN 策略算關節，Blender `vec_roll_to_mat3` 數學求骨頭座標系，轉 glTF 軸；權重表；`boneSegment()` |
| `mesh.mjs` | `Part`：權重/分段透過重心綁定從 base mesh 插值（取前 4 骨、正規化）；切 UV 接縫產生 GPU buffer |
| `raster.mjs` | UV 空間光柵化（含 6–8 texel gutter），texel → 3D 位置/法線 |
| `zombify.mjs`、`noise.mjs` | 上面那些 painter；Perlin/fBm/ridged/Worley |
| `image.mjs` | pngjs + jpeg-js（純 JS）、面積縮放、高度圖→法線圖（Sobel，OpenGL 慣例） |
| `export.mjs`、`glb.mjs` | 預算/減面、hitbox、自寫 GLB writer（JOINTS u8、_SEG stride 4、JPEG/PNG 內嵌） |
| `credits.mjs` | 把 `usage` 合併進 `tools/assets/zombies/credits.json`，重寫 `docs/CREDITS.md` 的 zombie 區塊 |
| `albedoTrace.mjs` | 除錯用：`ZOMBIE_ALBEDO_TRACE=1` 時 type 可在各上色階段 `snap()`，最後印出每階段的 albedo 平均（找出是哪一步把貼圖壓暗）；不影響輸出 |

座標：MakeHuman 檔案是 decimeter、Y 上、面向 +Z；×0.1 並以 `joint-ground` 方塊重心為原點 → glTF。

## 4. 已知限制 / 注意

- 體型差異大的 type（bloated、muscular）直接套 `anims.glb` 會有輕微穿模/滑步；用 `retargetClips` 可校正骨長與骨盆高度，
  但 IK 腳貼地要遊戲端做。
- 嘴巴靠 expression target 烘進 rest mesh（game_engine 沒有下巴骨）；張太大會看到 proxy 頭內部，建議 `mouth-open` ≤ 0.6。
- 挖洞布料是 alpha MASK（手機上比 blend 便宜，可以投影）；破洞邊緣的纖維細節在 2048 才看得出來。
- sohh 殭屍皮膚原本是女性皮膚改的，男性角色臉部稍顯陰柔；換 `skins/*_male/*.png` 當 `base` 再加大 `pallor`/`mottle` 也能做出殭屍膚色。

## 5. 全陣容整合 QA（2026-10-26，遊戲內實測）

腳本 = 在遊戲裡跑的 `tools/shot.mjs --eval`（測試場 `?map=test&match=0`、Lost Town 預設地圖）。

- **模型**：walker_a/b/c、runner、brute、spitter、bloater、crawler、screamer、riot（+ 兩隻 boss）全部用自己的 GLB 生成
  （非 stand-in、非 mannequin），root scale 1，`_seg` 每個網格都有，LOD0 7.3k–9.0k / LOD1 2.3k–2.5k 三角形，
  每種該用的 clip 都在。stand-in 仍可用（GLB 讀不到時的保險，已實測 riot / crawler / spitter 改用 stand-in 正常）。
- **命中判定**（從 6 / 15 m、1.62 m 眼高對眼睛、頭骨、胸口開槍，每種 6–14 個姿勢）：修正前 walker_a 打眼睛 100 % 算胸口、
  walker_b 30 %；修正後（walker_a chest 0.213→0.15、遊戲端頭部膠囊貼合頭骨 / 無終點骨的盒沿骨軸）全部 10 型打眼睛 = 爆頭。
  對臉部頂點的射線算爆頭：walker_a 10→85 %、walker_b 24→65 %、spitter 81→84 %、screamer 79→93 %、runner 85→95 %，
  其餘 88–100 %；打軀幹頂點誤判爆頭 0–6 %。粗篩圓柱 0.45→0.8 m（runner 撲擊手 0.96、brute 1.26、crawler 1.07 m 原本打不到）。
- **斷肢**：10 型手肘 / 小腿 / 頭都能斷（肉塊蓋、噴血、斷後動畫正常、無 NaN）；riot 正面護甲讓同一發不夠斷（設計如此）。
- **特殊行為**：brute 衝鋒（run→命中 35 / 撞牆 stagger）、spitter 保持 9–16 m 吐酸 + 酸池、bloater 身體擊殺爆炸（毒雲、
  鄰近殭屍受傷）/ 爆頭只洩氣、crawler 撲擊（離地 0.57 m）+ crawl_attack、screamer 尖叫（玩家緩速、8 m 內同伴回血 + 加速）、
  riot 正面減傷 80 %（頭 50 %、背後 / 爆炸全傷）。75 s 第 8 回合實戰 soak：無錯誤、無 NaN、無卡死。
- **狀態殼 / 菁英**：burning / frozen / poisoned / berserk / healed / hardened / shocked 與菁英紫邊 + 菱形標記在 10 型上都正常，
  所有 LOD0 / LOD1 材質都有 patch。**LOD**：22 m 換 LOD1，24 m 並排比較幾乎看不出差。
- **Lost Town 37 隻混合屍潮**：在街上 6–34 m 都讀得出輪廓與衣服顏色；`ZombieManager.update` CPU 中位 0.5–1 ms、p95 2.6–3.6 ms。
  這台機器（Intel Core 5 210H 內顯、同時有其他工作）1600×900 high 空場景就要 32–40 ms / 幀，37 隻多 0–9 ms（量測雜訊內）。
- **修掉的整合問題**：bloater 爆炸後屍體又出現 0.1 s；畫面剔除用上一幀相機（快速轉身時屍潮晚一幀才出現）→ 改在
  `scene.onBeforeRender` 用本幀相機剔除；crawler 的死亡 / 受擊 / 撲擊會「彈成站姿」→ `defs.js anim.over`。
- **仍待處理**：crawler 有腿卻用無腿拖行的 `crawl`（需要四足爬行 / 撲擊 / 死亡新 clip）；screamer 的 walk_c 仍有一點垂頭；
  walker_b / spitter 駝背時下巴附近 15–34 % 的射線先打到胸口膠囊頂端（眼睛 / 頭頂都正常）。
