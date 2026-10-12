# 04 — 第三方素材來源調查（寫實風喪屍 FPS，CC0 優先）

> 調查日期：2026-10-12　｜　目標：three.js（WebGL2 / Android WebView），MIT 開源 + 公開 Web Build
> 原則：**只收 CC0 / Public Domain**；CC-BY 僅在清楚標示並附署名時使用；其他「免費但禁止再散布」的授權一律不進 repo。
> 本文所有標註「✔ 已驗證」的 URL，皆於調查當日以 `curl -sI`（HEAD）或小型 JSON API 查詢確認可**免登入**取得（HTTP 200 或 302→200）。大型 zip 只用 HTTP Range 讀取尾端的 central directory 來列出內容，未整包下載。

---

## 0. 結論速覽（推薦組合）

| 需求 | 首選來源 | 授權 | 腳本化 | 備註 |
|---|---|---|---|---|
| 寫實人體（喪屍基底） | MakeHuman / MPFB2 資產（base mesh、targets、game_engine 骨架與權重）+ MakeHuman asset pack zip（皮膚、衣服、眼睛、牙齒、低模 proxy） | CC0（資產） | ✔ GitHub raw + 官方 zip（支援 Range） | `skins03` 內有 **2 套 CC0 喪屍皮膚**；`male1591` / `female1605` proxy 約 3.1k 三角形，適合手機 |
| PBR 貼圖 | Poly Haven（主）＋ ambientCG（補） | CC0 | ✔ 公開 JSON API、免 key | Poly Haven 有打包好的 `arm`（AO/Rough/Metal）貼圖，可直接給 three.js 用 |
| HDRI | Poly Haven `kloppenheim_01_puresky`、`overcast_soil_puresky`、`industrial_sunset_puresky` | CC0 | ✔ | 1k `.hdr` 約 0.9–1.2 MB |
| 3D 道具 | Poly Haven（`hidden_alley`、`industrial` 系列）＋ OpenGameArt CC0 補缺（棧板、沙包、廢墟） | CC0 | ✔ | Poly Haven 沒有棧板、沙包、車輛殘骸 |
| 音效 | Freesound（只篩 CC0）＋ OpenGameArt「The Free Firearm Sound Library」＋ Kenney Impact Sounds | CC0 | Freesound 預覽檔免登入可下載；搜尋 API 需免費 API key | Sonniss GDC、BBC **不可**放進公開 repo |
| 動作 | Quaternius Universal Animation Library 1/2（CC0，含 Zombie 走路/待機/抓）＋ CMU mocap BVH（自訂寬鬆授權）＋ 100STYLE `Zombie` 風格（CC BY 4.0） | CC0 / CMU 條款 / CC BY | ✔ | UAL2 骨骼命名 = UE Mannequin = MPFB2 `game_engine` rig；CMU BVH 骨骼命名 = MPFB2 `cmu_mb` rig |
| 寫實槍械 | Poly Haven `bolt_action_rifle_7_62`、`service_pistol`（僅此兩把有完整 PBR） | CC0 | ✔ | 其他寫實槍（AK/M4/霰彈/狙擊）只有 OGA 上無貼圖的 CC0 網格，需自行上材質 |

---

## 1. 寫實人體（喪屍用）

### 1.1 授權確認

- MakeHuman 主 repo 的 `LICENSE.md` 把專案分成「程式」與「資產」兩部分：**程式 AGPL-3.0**；**資產 CC0 1.0**。資產明確包含 base mesh 與 proxies、targets 與 modifiers、textures、衣物（所有 MHCLO 類資產）、poses 與 expressions。全文見 `LICENSE.ASSETS.md`（CC0 1.0 全文）。
  - https://github.com/makehumancommunity/makehuman/blob/master/LICENSE.md
- MPFB2（Blender 外掛，MakeHuman 的後繼者）採同樣的分法：**程式 GPL-3.0**；**資產 CC0**，而且明文把 *rigs、poses、expressions、mesh 資訊 JSON* 也列為 CC0 資產。
  - https://github.com/makehumancommunity/mpfb2/blob/master/LICENSE.md
- 兩份 LICENSE 的 D 節都聲明：匯出的模型（FBX/OBJ/glTF 等）屬於使用者，專案不主張任何權利。
- 個別檔案頭也有 CC0 聲明（例如 `base.obj` 開頭寫明 2020 年 9 月明確釋出為 CC0；`weights.game_engine.json` 內有 `"license": "CC0"`；`sohh_female_zombie_skin.mhmat` 內有 `license CC0`）。
- 官方 asset pack 頁面逐項列出授權：`makehuman_system_assets`、`skins01/02/03`、`shoes01`、`pants01`、`shirts01`、`system_eye_materials01` 這幾包經檢查**全部標示 CC0**（zip 檔名也都是 `*_cc0.zip`）。
  - https://static.makehumancommunity.org/assets/assetpacks/index.html

**對 MIT 專案的影響**：資產（CC0）可以直接放進 repo；**不要把 MakeHuman（AGPL）或 MPFB2（GPL）的 Python 程式碼複製進 MIT repo**。自己寫 loader 讀這些開放格式沒有問題；把 MPFB2 當成「外部 Blender 工具」產生 glTF 也沒有問題，因為輸出不受程式授權約束。

### 1.2 取得位置（raw URL、格式、大小）

| 資產 | 位置 / raw URL | 格式 | 大小 | 狀態 |
|---|---|---|---|---|
| Base mesh hm08 | https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/3dobjs/base.obj （mpfb2 也有同一份：`.../mpfb2/master/src/mpfb/data/3dobjs/base.obj`） | Wavefront OBJ（四邊形） | 1,749,303 B | ✔ 已驗證 |
| 預設骨架（163 骨） | `.../makehuman/master/makehuman/data/rigs/default.mhskel` | JSON | 117,790 B | ✔ |
| 預設骨架權重 | `.../makehuman/master/makehuman/data/rigs/default_weights.mhw` | JSON | 897,521 B | ✔（同目錄） |
| **遊戲骨架（53 骨，UE 命名）** | https://raw.githubusercontent.com/makehumancommunity/mpfb2/master/src/mpfb/data/rigs/standard/rig.game_engine.json ＋ `weights.game_engine.json` | JSON | 40,936 B ＋ 3,026,778 B | ✔ |
| CMU 相容骨架（31 骨） | `.../rigs/standard/rig.cmu_mb.json` ＋ `weights.cmu_mb.json` | JSON | 23,803 B ＋ 3,024,572 B | 已列目錄 |
| 其他骨架 | 同目錄：`rig.mixamo.json`、`rig.mixamo_unity.json`、`rig.game_engine_with_breast.json`、`rig.default_no_toes.json`、`rig.openpose.json`（各附 `weights.*.json`） | JSON | 2.3–5 MB（權重） | 已列目錄 |
| 體型 targets（MakeHuman 版） | `.../makehuman/master/makehuman/data/targets/<群組>/<名稱>.target`（群組：armslegs、asym、bodyshapes、breast、buttocks、cheek、chin、ears、expression、eyebrows、eyes、forehead、genitals、head、hip、macrodetails、measure、mouth、neck、nose、pelvis、stomach、torso） | 純文字 `.target` | `macrodetails` 98 檔，每檔約 400–460 KB | ✔ |
| 體型 targets（MPFB2 版） | `.../mpfb2/master/src/mpfb/data/targets/<群組>/<名稱>.target.gz` ＋ 索引 `targets/target.json`（160,626 B） | gzip 文字 | `macrodetails` 99 檔，每檔約 120–155 KB | ✔ |
| 額外 targets | https://github.com/makehumancommunity/extra-targets （repo 授權標 CC0-1.0） | `.target` | 1 MB | 只看了 repo metadata |
| **System assets**（皮膚、眼睛、牙齒、舌頭、眉毛、睫毛、頭髮、衣服、proxy） | https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip （鏡像：`files2.makehumancommunity.org/...`） | zip（517 個項目） | 280,737,770 B（約 268 MB） | ✔ HEAD 200，支援 Range |
| 額外皮膚（含喪屍） | https://files.makehumancommunity.org/asset_packs/skins03/skins03_cc0.zip | zip（94 個項目） | 136,827,522 B | ✔ |
| 額外皮膚 | `.../asset_packs/skins01/skins01_cc0.zip`、`.../skins02/skins02_cc0.zip` | zip | skins01 為 104,227,958 B | ✔ |

**System assets zip 內容**（用 Range 讀 central directory 列出）：

- `skins/`：20 套 young/middleage/old × african/asian/caucasian × male/female，以及 `*_special_suit`。**只有 diffuse PNG，2048×2048**，沒有法線圖（例如 `skins/young_caucasian_male/young_lightskinned_male_diffuse.png`，3.7 MB）。另有 `.mhmat` 材質描述與 `.thumb` 縮圖。
- `proxymeshes/`（重新拓樸的身體網格，可取代 base mesh）：
  - `male1591.obj`：1,591 頂點、3,140 三角形（`.proxy` 108 KB）
  - `female1605.obj`：1,605 頂點、3,168 三角形
  - `proxy741.obj`：741 頂點、1,460 三角形
  - `male_generic` / `female_generic`：約 27k 三角形
  - `male_muscle_13290` / `female_muscle_13442`
- `clothes/`：`male_worksuit01`（6,986 三角形，附 2048² diffuse、normal、ao）、`male_casualsuit01..06`、`female_casualsuit01/02`、`female_sportsuit01`、`male_elegantsuit01`、`female_elegantsuit01`、`shoes01..06`、`fedora01`。每件都有 `.obj` ＋ `.mhclo` ＋ `.mhmat` ＋ PNG。
- `eyes/high-poly`、`eyes/low-poly` 與眼睛材質（blue、brown、green 等）；`teeth/teeth_base`、`teeth_shape01..05`（`teeth.png` 2048² RGBA）；`tongue/tongue01`；`eyebrows/eyebrow001..012`；`eyelashes/eyelashes01..04`；`hair/`（afro01、bob01/02、braid01、long01、ponytail01、short01..04）。

**CC0 喪屍皮膚（`skins03`）**：

| 皮膚 | 檔案 | 解析度 |
|---|---|---|
| `sohh_female_zombie_skin` | `sohh_Zombie_Female_diffuse.png`（18.3 MB）＋ `sohh_Zombie_Female_bump.png`（5.9 MB） | 4096² diffuse ＋ 4096² 灰階 bump |
| `naim_abbassi_zombie_skin` | `Zombie.png`（5.4 MB） | 2048² RGBA |
| `reizibarrientos_white_walker_skin` | `WhiteWalker.png`（4.8 MB） | 蒼白屍體風 |
| `bobby_03_grey_skinned_person` | `greyskinned_person.png` ＋ `greyskinned_person_map.png` | 灰膚 |

這些皮膚都使用 MakeHuman 標準 UV，所以 base mesh、proxy 和衣服都可以共用。

### 1.3 檔案格式重點（寫 loader 或轉檔時要知道）

- **`base.obj`（hm08）**：共 19,158 頂點、18,486 面、139 個群組。
  - 真正的身體只有 `body` 群組，13,378 個四邊形（約 26.8k 三角形）。
  - 其餘是 13 個 `helper-*` 群組（tights、skirt、hair、eyes、teeth、tongue、eyelashes、genital，用來貼合衣物與配件），以及 125 個 `joint-*` 小立方體。
  - 執行時要刪掉 helper 和 joint 群組。
  - 單位是 decimeter，匯入時乘以 0.1 換成公尺。
- **`.target` / `.target.gz`**：每行一筆 `頂點索引 dx dy dz`，是稀疏的 morph delta，可以直接轉成 three.js 的 `morphAttributes.position`，但要先展開成完整長度的陣列。macrodetails（性別、年齡、肌肉、體重、身高、族裔）是多個 target 的混合權重，規則在 MPFB2 的 `target.json` 和 MakeHuman 的 `data/modifiers/*.json`。
- **`.npz`**：MakeHuman 打包發行時由 `compile_targets.py` 產生的二進位快取，**不在 git 內**，也不需要。
- **骨架**：`.mhskel` 和 MPFB2 的 `rig.*.json` 都**不存絕對座標**，而是用 `joint-*` 立方體群組（策略為 `CUBE`，取立方體頂點平均值）或特定頂點來算出骨頭的 head/tail。所以換體型之後要重新算關節位置（MPFB2 / MakeHuman 都這樣做）。最省事的方式是先在 Blender 定型，再匯出 glTF。
- **權重**：`weights.<rig>.json` 的格式是 `{"weights": {骨名: [[頂點索引, 權重], ...]}}`，對應 base mesh 的頂點。
- **`.proxy` / `.mhclo`**：proxy 或衣物的每個頂點，記錄 3 個 base mesh 頂點索引、3 個重心權重，再加一個 offset。所以 proxy 和衣服的 morph 與骨架權重都可以從 base mesh **插值**出來，這是 MakeHuman 生態「一套權重餵全部」的關鍵。`.mhclo` 還有 `delete_verts`，用來隱藏被衣服蓋住的身體頂點，可以減少穿模並省面數。
- **`.mhmat`**：純文字材質，欄位包括 `diffuseTexture`、`normalmapTexture`、`bumpmapTexture` 等。

### 1.4 Git LFS 與下載陷阱

- 舊的 **`makehumancommunity/makehuman-assets`（Git LFS）repo 已不存在**（GitHub API 回 404）。MakeHuman 原始碼中的 `download_assets_git.py` 仍然指向它，而且要求 LFS，**照舊教學會失敗**。
- 目前 **`makehuman` 與 `mpfb2` 兩個 repo 根目錄都沒有 `.gitattributes`**，base mesh、targets、rigs 都是普通 git 檔案，`raw.githubusercontent.com` 會直接回傳實體內容，不會是 LFS pointer（已驗證 `base.obj` 開頭是 OBJ 文字）。
  - 如果日後遇到 LFS 檔：`raw.githubusercontent.com` 只會給 pointer，要改用 `https://media.githubusercontent.com/media/<owner>/<repo>/<branch>/<path>`。
- 皮膚、衣服、眼睛、proxy **只在官方 zip**。zip 伺服器支援 `Range`，所以可以只抓需要的檔案，不必下載 268 MB：先讀 central directory，再依 local header 的 offset 抓單一檔案並 inflate。本次調查就是用這個方法讀出 PNG 尺寸與 OBJ 面數（腳本草稿見附錄 B）。

### 1.5 骨架選擇與動畫相容性（重要）

- **MPFB2 `game_engine`（53 骨）**：骨名是 `Root`、`pelvis`、`spine_01..03`、`neck_01`、`head`、`clavicle_l`、`upperarm_l`、`lowerarm_l`、`hand_l`、手指 `*_01..03_l`、`thigh_l`、`calf_l`、`foot_l`、`ball_l` 等，也就是 **UE4 Mannequin 命名**。
  - **Quaternius Universal Animation Library 2** 的 GLB 骨架用的正是同一套命名（pelvis、spine_01..03、thigh_l、calf_l、ball_l……，見 §4.3）。
  - 所以 **UAL2 的動畫幾乎可以 1:1 重定向到 MakeHuman 身體**；只剩 rest pose 和 bone roll 的差異，需要用重定向工具處理。
- **MPFB2 `cmu_mb`（31 骨）**：骨名是 `Hips`、`LHipJoint`、`LeftUpLeg`、`LeftLeg`、`LeftFoot`、`LeftToeBase`、`LowerBack`、`Spine`、`Spine1`、`Neck`、`Neck1`、`Head`、`LeftShoulder`、`LeftArm`、`LeftForeArm`、`LeftHand`……，和 **cgspeed 版 CMU BVH 完全同名**（§4.1）。
- **MPFB2 `mixamo`**：如果要用 Mixamo 命名的工具鏈，可以用這個。但 Mixamo 動畫本身不能放進開源 repo（§4.4）。
- 建議：遊戲 runtime 統一用 **`game_engine` 53 骨**（手機蒙皮成本低），CMU 或 100STYLE 的資料離線重定向到這套骨架。

### 1.6 替代方案比較

| 方案 | 授權 | 寫實度 | 遊戲骨架 | 可腳本取得 | 評語 |
|---|---|---|---|---|---|
| **MakeHuman 資產（經 MPFB2 / 自製 loader）** | 資產 CC0；程式 AGPL/GPL（不入 repo） | 高：寫實比例、2k 膚色貼圖、可 morph 出瘦、胖、老、肌肉型 | ✔ game_engine / cmu_mb / mixamo / default | ✔ | **最適合**。缺點是皮膚只有 diffuse（喪屍皮膚 `sohh` 有 bump），需要自己補法線、血污、傷口 decal |
| MPFB2 | 同上（就是 MakeHuman 資產的 Blender 版） | 同上 | 同上 | ✔（Blender 無頭模式 + Python） | 建議當**離線烘焙工具**：在 Blender 用 MPFB2 生 5–10 種體型，套 proxy、衣服、喪屍皮膚，匯出 glTF |
| MB-Lab | 依官方文件：程式 GPL-3；資料、網格、貼圖 AGPL-3；**生成的角色預設也是 AGPL-3** | 高 | 有 | 中 | ✗ AGPL 會傳染到模型，不適合 MIT repo |
| CharMorph（MB-Lab 後繼） | 模組化，報導指出有 CC-BY 和 CC0 兩種基礎模型 | 高 | 有 | 中 | 未逐一驗證，列為備選 |
| Quaternius（角色包） | CC0 | 低：卡通低模 | 自家 humanoid 骨架 | ✔ | 外觀不符寫實定位；但**動畫庫 UAL 非常有用**（§4.3） |
| Kenney Animated Characters 1/2/3 | CC0 | 低：方塊人 | 簡易 | ✔ | ✗ 不符風格 |
| OGA「Male City Zombie」（Rikindle3D）<br>https://opengameart.org/content/male-city-zombie-ready-for-use-in-game-engines | CC0 | 中：寫實貼圖，作者自承 UV 怪 | 有骨架和 11 段動畫（走 ×2、攻擊 ×3、死亡、待機 ×2、受擊、跑、嘶吼） | 4.4 MB .7z | 可當 **placeholder**。動畫來源未說明，可能來自 Mixamo，**不建議當正式資產** |
| OGA「Mobile Ready Zombie」（Lucian Pavel）<br>https://opengameart.org/content/mobile-ready-zombie | CC0 | 中低：1,938 三角形、512² diffuse | ✗ 無骨架 | ✔（`Zombie.zip` 767 KB） | 只適合遠景 |

**結論**：最寫實、又有遊戲骨架與完整 CC0 鏈的是 **MakeHuman 資產**。建議組合如下：

- 身體用 `male1591` / `female1605` proxy（約 3.1k 三角形，主力 LOD），或把 base mesh 減面到 6–8k 作為近景 LOD。
- 加上 `male_worksuit01`、`male_casualsuit*` 等衣物；刪掉被遮住的身體頂點。
- 皮膚用 `sohh_female_zombie_skin`、`naim_abbassi_zombie_skin`，或把一般膚色貼圖在 shader 中做去飽和、偏綠灰、加血污 decal。
- 骨架用 MPFB2 `game_engine`。
- 動畫取 Quaternius UAL2 的 Zombie 系列與 CMU BVH，重定向到這套骨架。

---

## 2. Poly Haven 與 ambientCG

### 2.1 Poly Haven API（https://api.polyhaven.com）

- **免 API key、免登入**，所有回應都帶 `Access-Control-Allow-Origin: *`（✔ 已驗證）。
- API ToS 規定：
  - **必須帶自訂的 `User-Agent` 或 `Referer`**，例如 `cs-zombie-asset-fetcher/1.0`。
  - 只有在「程式執行時即時呼叫 live API 來呈現內容」時，才要求顯示 Poly Haven 出處。
  - 我們是**建置時下載後自行託管**，資產本身 CC0，不需要署名（但建議在 CREDITS 註明）。
  - https://github.com/Poly-Haven/Public-API/blob/master/ToS.md

**端點**：
- `GET /types` → `["hdris","textures","models"]`
- `GET /categories/{type}` → 各分類與數量（目前 textures 868、models 521、hdris 997）
- `GET /assets?t=textures&c=<分類>` → `{id: {name, categories, tags, dimensions(mm), max_resolution, polycount, download_count, ...}}`
- `GET /info/{id}` → 單一資產資訊
- `GET /files/{id}` → **所有可下載檔案的 URL、大小與 md5**

**貼圖（`/files/{id}` 結構）**：
- 頂層 key 是貼圖種類：`Diffuse`、`nor_gl`、`nor_dx`、`Rough`、`AO`、`arm`、`Displacement`，部分金屬材質另有 `Metal`、`Bump`、`spec`。另外還有 `blend`、`gltf`、`mtlx` 三種包裝格式。
- 解析度有 `1k`、`2k`、`4k`、`8k`、`16k`；格式有 `jpg`、`png`、`exr`。
- URL 規則：
  `https://dl.polyhaven.org/file/ph-assets/Textures/{jpg|png|exr}/{res}/{id}/{id}_{map}_{res}.{ext}`
  其中 `map` 是 `diff`、`nor_gl`、`nor_dx`、`rough`、`arm`、`ao`、`disp`，部分有 `metal`。
- 建議只抓 **`diff` ＋ `nor_gl` ＋ `arm` 的 1k 或 2k JPG**：
  - `arm` 是 R=AO、G=Roughness、B=Metalness 的打包圖，和 glTF 與 three.js 的 ORM 通道一致。同一張圖可以同時指定給 `aoMap`、`roughnessMap`、`metalnessMap`。
  - three.js 和 glTF 都採用 OpenGL 法線慣例，所以用 **`nor_gl`**，不要用 `nor_dx`。
  - `disp` 在手機上通常不用（不做 tessellation），頂多拿來做 parallax。
  - 大小參考：`rusty_corrugated_iron` 的 2k jpg 中，diff 2.55 MB、nor_gl 2.84 MB、arm 1.68 MB；1k 中 diff 0.62 MB、arm 0.43 MB。

**模型**：
- `/files/{id}` 的 `gltf.{1k|2k|4k}.gltf` 物件包含主 `.gltf` 的 URL，以及 `include` 對照表（相對路徑 → 實際 URL），內容是 `.bin` 和 `textures/*.jpg`。**下載器必須依照 `include` 的相對路徑重建目錄**。
- `.gltf` 位於 `Models/gltf/{res}/{id}/{id}_{res}.gltf`；貼圖位於 `Models/jpg/{res}/{id}/{id}_{map}_{res}.jpg`。
- 例：`bolt_action_rifle_7_62` 的 1k glTF 連同 6 張貼圖與 bin，總計約 6.0 MB。
- 也提供 `fbx`、`blend`、`usd` 格式。

**HDRI**：
- `https://dl.polyhaven.org/file/ph-assets/HDRIs/{hdr|exr}/{res}/{id}_{res}.{hdr|exr}`
- 另有色調映射後的 JPG：`HDRIs/extra/Tonemapped%20JPG/{id}.jpg`，可當低成本天空盒背景。

**範例**（bash + jq；PowerShell 或 Node 可照同樣邏輯改寫）：

```bash
UA="cs-zombie-asset-fetcher/1.0 (+https://github.com/<you>/<repo>)"
id=rusty_corrugated_iron; res=1k
curl -sA "$UA" https://api.polyhaven.com/files/$id \
 | jq -r --arg r $res '.Diffuse[$r].jpg.url, .nor_gl[$r].jpg.url, .arm[$r].jpg.url' \
 | xargs -n1 curl -sA "$UA" -O
# 模型：抓 gltf，再依 include 對照表下載到對應的相對路徑
curl -sA "$UA" https://api.polyhaven.com/files/old_tyre \
 | jq -r '.gltf["1k"].gltf as $g | ($g.url), ($g.include|to_entries[]|"\(.key) \(.value.url)")'
```

### 2.2 ambientCG API（https://ambientcg.com/api/v3/assets）

- **授權**：全部 CC0。官方授權頁明說可以把原始檔放進遊戲專案，署名可選。https://docs.ambientcg.com/license/
- 官方提醒網站由一人營運，API 不保證企業級穩定，所以**要在建置時抓下來快取，不要在執行時打 API**。
- 也有 v2 API（`/api/v2/full_json`），但 v3 的參數比較乾淨。

**v3 參數**：
- `type`：`material`、`hdri`、`decal`、`atlas`、`3d-model`、`substance`……
- `q`：關鍵字（多個字為 AND）
- `id`：逗號分隔的資產 ID
- `sort`：`popular`、`latest`、`downloads`……
- `limit`：1–500
- `offset`
- `include`：例如 `downloads,maps,tags,dimensions,technique`

範例：`https://ambientcg.com/api/v3/assets?type=material&q=rust&limit=50&include=downloads,maps,tags`

**下載**：
- 格式：`https://ambientcg.com/get?file={ID}_{1K|2K|4K|8K}-{JPG|PNG}.zip`。這會 **302 轉址**到 `https://acg-download.struffelproductions.com/file/ambientCG-Web/download/{ID}_{亂碼}/{ID}_1K-JPG.zip`，所以 `curl` 要加 `-L`（✔ 已驗證 5 個 ID）。
- 材質 zip 內容（例：`Fence006_1K-JPG.zip`）：`_Color.jpg`、`_NormalGL.jpg`、`_NormalDX.jpg`、`_Roughness.jpg`、`_Displacement.jpg`，部分有 `_Metalness`、`_AmbientOcclusion`、`_Opacity`。另外還有 `.mtlx`、`.usdc`、`.blend`（約 1 MB）、`.tres` 和預覽 PNG。
- **沒有打包的 ARM 圖**，需要自己合成。
- 1K-JPG zip 約 7–10 MB，其中 `.blend` 和置換圖占了不少；可以用 Range 只抽需要的圖（附錄 B）。
- HDRI 格式：`{ID}_{1K..16K}.zip`，內含 `_HDR.exr` 與 `_TONEMAPPED.jpg`。例：`EveningSkyHDRI047A_1K.zip` 為 3.57 MB，其中 exr 1.72 MB。
- ambientCG 的 `3d-model` 只有 34 個，而且都是食物、樹樁之類，**不適合當場景道具來源**。
- ambientCG 的強項在：
  - **Decal**：`Leaking*`（鏽水、漏水痕跡）、`RoadLines*`、`ManholeCover*`、`TireTracks001`
  - **Atlas**：`AsphaltDamageSet001/002`（坑洞、裂縫）、`GraffitiSet001`、`CardboardSet001`、`Tape00*`
  - **帶 Opacity 的鐵絲網**：`Fence001–006`

### 2.3 隔離區材質候選清單（ID 皆經 API 確認存在）

| 類別 | Poly Haven（主） | ambientCG（補 / 替代） |
|---|---|---|
| 柏油路 | `asphalt_02`（龜裂，下載量最高）、`asphalt_04`、`road_damaged`、`road_damaged_2`、`worn_asphalt`、`tarred_gravel` | `Asphalt026C`（cracked、damaged）、`Road012A`、`Asphalt025C`（濕）＋ decal `AsphaltDamageSet001`、`RoadLines022A`、`ManholeCover011` |
| 龜裂混凝土地面 | `concrete_floor_damaged_01`、`damaged_concrete_floor_02`（工業）、`cracked_concrete`、`dirty_concrete`、`garage_floor`、`concrete_floor_worn_001` | `Concrete044D`（damaged）、`Concrete042C`（破損、露出鏽蝕鋼筋網） |
| 混凝土牆 | `concrete_wall_008`、`concrete_wall_006`、`cracked_concrete_wall`、`rebar_reinforced_concrete`、`precast_concrete_wall` | `Concrete031`（碉堡）、`Concrete034` |
| 磚牆 | `factory_brick`、`red_brick`、`broken_brick_wall`、`brick_wall_001`、`dark_brick_wall`、`painted_worn_brick` | `Bricks085`（工廠紅磚）、`Bricks075A` |
| 灰泥 / 抹灰 | `damaged_plaster`（灰泥剝落露磚）、`peeling_painted_wall`、`red_plaster_weathered`、`worn_plaster_wall`、`plastered_wall` | `PaintedPlaster017`、`Plaster003` |
| 鏽蝕金屬 | `rusty_metal_02`、`rust_coarse_01`、`rusty_metal_sheet`、`rusty_painted_metal`、`green_metal_rust`、`container_side`（貨櫃）、`metal_plate`、`metal_grate_rusty`、`rusted_shutter`、`painted_metal_shutter` | `Metal021`、`Rust009`、`MetalPlates013`、`PaintedMetal017`（警告標誌）、`DiamondPlate008C`（花紋鋼板）、`MetalWalkway014`（鏽格柵，帶 opacity） |
| 浪板 | `rusty_corrugated_iron`、`corrugated_iron_02`、`worn_corrugated_iron`、`box_profile_metal_sheet` | `CorrugatedSteel005`、`CorrugatedSteel007A`（藍漆帶鏽） |
| 木板 | `weathered_planks`、`wood_planks_dirt`、`old_planks_02`、`raw_plank_wall`、`weathered_brown_planks`、`plywood` | `Planks037A`、`Planks023A`、`WoodSiding008`（髒舊外牆板） |
| 磁磚（室內） | `dirty_tiles`、`worn_tile_floor`、`interior_tiles`、`old_linoleum_flooring_01` | `Tiles107`、`Tiles074` |
| 泥土 / 碎石 / 瓦礫 | `gravel_floor_02`、`gravel_road`、`dirt`、`brown_mud_dry`、`muddy_tracks`、`burned_ground_01`（焦土）、`concrete_debris`、`rubble` | `Gravel023`、`Gravel040`、`Ground054` |
| 鐵絲網 | （用 §2.4 的 `modular_chainlink_fence` 模型） | `Fence006`、`Fence003`（wire mesh，含 Opacity 與 Metalness） |
| 沙包布 / 帆布 | `hessian_230`、`hessian_380`、`rough_linen` | `Fabric062` |
| 汙漬 / 塗鴉 | — | `Leaking012A` 等 `Leaking*` 系列、`GraffitiSet001` |

> Poly Haven 的 `dimensions` 欄位是材質對應的真實尺寸（mm），例如 `asphalt_02` 是 3000 mm，可以拿來設定 UV 比例，避免磚塊太大或太小。

### 2.4 3D 道具候選（Poly Haven，CC0，glTF 1k/2k/4k）

polycount 欄位直接取自 API，數值高者在手機上需要用 `gltfpack -si` 或 meshoptimizer 減面。

| 類別 | ID（polycount） |
|---|---|
| 油桶 | `Barrel_01`（紅色油桶，2,682）、`barrel_03`（藍色燃料桶，1,473）、`Barrel_02`（塑膠桶，2,688）、`barrel_stove`（燒火桶，11,404） |
| 箱子 | `wooden_crate_02`（5,176）、`wooden_military_crate`（22,986）、`old_military_crate`（10,476）、`ammo_box`（4,382）、`medical_box`（3,718）、`cardboard_box_01`（16,952）、`plastic_crate_03`（21,740）、`industrial_pastic_container`（7,118） |
| 輪胎 / 輪框 | `old_tyre`（2,880）、`rusted_wheel_rim_01`、`rusted_wheel_rim_02`（16,440） |
| 混凝土路障 | `concrete_road_barrier`（80,776，需減面）、`concrete_road_barrier_02`（42,578） |
| 垃圾 / 子母車 | `metal_trash_can`（1.85 m 大型垃圾箱，tag 含 dumpster，13,960）、`trashbag`（4,482）、`can_rusted`、`plastic_bottle_gallon`、`cement_bag`（844） |
| 路燈 / 照明 | `street_lamp_01`（3.9 m，30,610）、`street_lamp_02`、`security_light`、`caged_hanging_light` |
| 車輛 | `covered_car`（帆布罩車，12,592）。**Poly Haven 沒有車輛殘骸** |
| 圍欄 / 門 | `modular_chainlink_fence`（模組化鐵絲網圍欄，89,232）、`large_iron_gate`、`rollershutter_door`（1,104）、`rollershutter_window_01..03` |
| 建築模組 | `modular_factory_facade`、`modular_urban_apartments_facade`、`modular_fire_escape`、`modular_metal_gutter`、`modular_airduct_circular_01`、`exterior_aircon_unit`、`utility_box_02`、`modular_electricity_poles`、`water_manhole_cover`、`fire_hydrant`（86k，需減面） |
| 雜項 | `metal_jerrycan`、`propane_tank`、`portable_generator`、`hand_truck`、`worn_metal_rack`、`old_gas_mask`、`WetFloorSign_01`、`spray_paint_bottles_02`、`street_rat`（老鼠，14k）、`dead_tree_trunk`（101k，需減面） |
| 近戰武器 | `machete`、`hatchet`、`baseball_bat`、`crowbar_01`、`sledgehammer_01` |

`hidden_alley` collection（39 件，城市暗巷主題）幾乎全部適用，可以用 `GET /assets?t=models&c=collection:%20hidden_alley` 取得整份清單。

**Poly Haven 缺的品項，改用 OpenGameArt CC0 補**（各頁授權欄已確認為 CC0）：
- 棧板：
  - Wood Pallet v1 Pack（yughues/Nobiax）https://opengameart.org/content/wood-pallet-v1-pack
  - EUR_pallet（118 面，附 normal、AO、spec）https://opengameart.org/content/eurpallet
  - Cc0 crates + wooden pallet https://opengameart.org/content/cc0-crates-wooden-pallet
- 沙包：Simple Sandbags（256² 貼圖，偏簡陋）https://opengameart.org/content/simple-sandbags。建議改用 Poly Haven `hessian_230` 材質自建沙包網格。
- 廢墟：Destroyed City Assets（3 棟毀損建築、2 段毀損道路、6 塊岩石，非低模）https://opengameart.org/content/destroyed-city-assets
- 紐澤西護欄：3D Concrete Barrier（284 三角形）https://opengameart.org/content/3d-concrete-barrier
- 車輛殘骸：**找不到寫實 CC0 且可免登入下載的版本**。Sketchfab 上有 CC0 車輛，但下載需要登入或 OAuth，不符合腳本化需求。建議以 `covered_car` 加上自製燒焦材質，或自行建模。

### 2.5 HDRI 建議（陰天 / 黃昏）

| 用途 | ID | 類別 | 1k 大小 |
|---|---|---|---|
| **主天空：黃昏陰天** | `kloppenheim_01_puresky` | pure skies、overcast、sunrise-sunset、low contrast | 861,984 B ✔ |
| **主天空：白天陰天** | `overcast_soil_puresky` | pure skies、overcast、morning-afternoon | 1,195,816 B ✔ |
| **黃昏帶雲** | `industrial_sunset_puresky` | pure skies、sunrise-sunset、partly cloudy | 2k：4,344,656 B ✔ |
| 備選：工業廢墟陰天（帶地景） | `abandoned_slipway` | outdoor、urban、overcast；tag 有 industrial、abandoned | 1,662,646 B ✔ |
| 備選：霧中停車場黃昏 | `beach_parking` | urban、sunrise-sunset、overcast；tag 有 fog | 1,383,300 B ✔ |
| 備選：夜晚陰天 | `kloppenheim_07_puresky`、`winter_evening` | night、overcast | — |
| ambientCG 備選 | `EveningSkyHDRI047A`（tag：evening、overcast） | — | zip 3.57 MB |

`*_puresky` 系列已移除地面，最適合遊戲：可同時當天空盒，也可經 PMREM 產生 IBL。手機上建議用 1k `.hdr` 做 IBL，天空背景改用 tonemapped JPG 或低解析 cubemap，以節省記憶體。

### 2.6 已驗證 URL（HEAD → 200，`Access-Control-Allow-Origin: *`）

```
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/rusty_corrugated_iron/rusty_corrugated_iron_diff_2k.jpg   2,552,964 B
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/asphalt_02/asphalt_02_nor_gl_1k.jpg                       1,240,122 B
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/cracked_concrete_wall/cracked_concrete_wall_arm_1k.jpg      677,204 B
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/worn_corrugated_iron/worn_corrugated_iron_diff_1k.jpg        868,207 B
https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/brick_wall_001/brick_wall_001_rough_1k.jpg                  211,093 B
https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/rusty_metal_02/rusty_metal_02_nor_gl_1k.png               1,336,485 B
https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/old_tyre/old_tyre_1k.gltf
https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/concrete_road_barrier/concrete_road_barrier_1k.gltf
https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/modular_chainlink_fence/modular_chainlink_fence_1k.gltf
https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/metal_trash_can/metal_trash_can_1k.gltf
https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/Barrel_01/Barrel_01_1k.gltf
https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/bolt_action_rifle_7_62/bolt_action_rifle_7_62_1k.gltf
https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/service_pistol/service_pistol_1k.gltf
https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloppenheim_01_puresky_1k.hdr
https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/overcast_soil_puresky_1k.hdr
https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/industrial_sunset_puresky_2k.hdr
https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/abandoned_slipway_2k.hdr                                       6,644,324 B
https://ambientcg.com/get?file=Fence006_1K-JPG.zip            (302 → acg-download.struffelproductions.com)
https://ambientcg.com/get?file=CorrugatedSteel005_1K-JPG.zip  (302)
https://ambientcg.com/get?file=Concrete034_1K-JPG.zip         (302)
https://ambientcg.com/get?file=AsphaltDamageSet001_1K-JPG.zip (302)
https://ambientcg.com/get?file=Leaking012A_1K-JPG.zip         (302)
https://acg-download.struffelproductions.com/file/ambientCG-Web/download/Asphalt015_EybiADcF/Asphalt015_1K-JPG.zip   200, 8,574,862 B
```

**手機最佳化建議**：
- 下載後用 `gltf-transform` 或 `toktx`，把 JPG 轉成 **KTX2（ETC1S 或 UASTC）**。一張 1k RGBA 未壓縮貼圖在 GPU 約占 4 MB（含 mipmap 約 5.3 MB）。
- 用 `gltfpack -si 0.3` 這類參數為高面數道具減面。

---

## 3. 寫實音效

### 3.1 來源比較

| 來源 | 授權 | 免登入腳本下載 | 適合放進 MIT 公開 repo？ | 評語 |
|---|---|---|---|---|
| **Freesound**（只篩 CC0） | 逐檔授權：CC0、CC BY 4.0、CC BY-NC（另有舊版 3.0 與 Sampling+） | **預覽檔可以**：`cdn.freesound.org` 免登入、CORS `*`（✔）。**原檔不行**：下載連結會 302 到登入頁（✔）。**搜尋 API** 需要 token：未帶 token 回 401（✔），免費申請 https://freesound.org/apiv2/apply | CC0 檔 ✔ | 量最大。預覽 hq：mp3 約 128 kbps，Vorbis 約 160–190 kbps（實測 120 秒的檔案為 2.48 MB）。遊戲 SFX 通常夠用，建議用 OGG 以避免 MP3 的 encoder delay |
| **OpenGameArt CC0 包** | 逐包標示 | ✔ `opengameart.org/sites/default/files/...` | CC0 ✔ | 有現成的槍聲與喪屍聲音包 |
| **The Free Firearm Sound Library**（OGA 鏡像） | **CC0** | ✔ 194 MB `.7z` | ✔ | 真槍錄音（步槍、霰彈槍、手槍、左輪、卡賓槍；auto/semi/pump/bolt）。建議署名：Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney |
| **Kenney Impact Sounds** | CC0 | ✔ 800 KB zip | ✔ | 腳步聲（concrete、wood、grass、snow、carpet 各 5 個）、金屬、木頭、玻璃、拳擊撞擊。偏乾淨，可當 UI 或補充層 |
| Sonniss GameAudioGDC | 免版稅、可商用、不需署名，**但禁止把音效「當作音效檔」提供給他人**（包含放進 asset pack 或素材庫）。條文沒有提到開源 repo；另禁止 AI 訓練 | 下載為大型分卷 zip 或 torrent，無 API | **✗**：放進公開 repo 等於散布原始檔。成品遊戲內使用雖然允許，但風險高，不建議 | — |
| BBC Sound Effects | RemArc 授權：僅限個人、教育、研究；商用需另向 Pro Sound Effects 購買 | — | ✗ | — |
| Pixabay、Zapsplat、Mixkit | 自訂授權，禁止單獨再散布 | 需登入或有限制 | ✗ | — |

> **Freesound 的風險**：少數使用者會把影視或遊戲擷取的音效誤標成 CC0，例如「...SFX.mp3」這類檔名，或來源不明的「電影槍聲」。建議優先採用明確寫「自己錄製」的作者，例如 michorvath、jackthemurray、GrayJoy、florianreichelt、qubodup、TRP。每個檔都要保存頁面網址、作者與授權（見 §6 manifest）。

### 3.2 Freesound 腳本化做法

1. 用 API token 搜尋，URL 參數 `token=<KEY>` 即可，不需要 OAuth：
   `https://freesound.org/apiv2/search/text/?query=rifle%20gunshot&filter=license:%22Creative%20Commons%200%22&fields=id,name,username,license,duration,previews,url&token=KEY`
2. 回應中的 `previews["preview-hq-ogg"]` 就是可直接下載的 CDN 連結。
3. 如果沒有 API key、只有清單：預覽 URL 的格式是 `https://cdn.freesound.org/previews/{id//1000}/{id}_{uploaderUserId}-hq.ogg`，uploader 的 userId 要從頁面或 API 取得。下表已經全部算好，並逐一開頁確認授權為 CC0。
4. 短連結：`https://freesound.org/s/{id}/`，會轉址到作者頁。

### 3.3 Freesound CC0 候選清單（授權已逐頁確認為 Creative Commons 0）

**槍聲**

| ID | 作者 | 內容 | 預覽（hq ogg） |
|---|---|---|---|
| 427596 | michorvath | AR15 rifle shot（真槍） | https://cdn.freesound.org/previews/427/427596_3094998-hq.ogg ✔ |
| 427597 | michorvath | AR15 shot from 50 yards（遠距） | https://cdn.freesound.org/previews/427/427597_3094998-hq.ogg |
| 427592 | michorvath | 9mm pistol shot | https://cdn.freesound.org/previews/427/427592_3094998-hq.ogg |
| 427594 | michorvath | 22 magnum pistol shot | https://cdn.freesound.org/previews/427/427594_3094998-hq.ogg |
| 427595 | michorvath | 20 gauge shotgun | https://cdn.freesound.org/previews/427/427595_3094998-hq.ogg |
| 259758 | mnslugger20 | M4 assault rifle firing（11.6 s 連發） | https://cdn.freesound.org/previews/259/259758_4121395-hq.ogg |
| 238916 | qubodup | Rifle Shooting | https://cdn.freesound.org/previews/238/238916_71257-hq.ogg |
| 165394 | ShawnyBoy | Heavy Machine Gun | https://cdn.freesound.org/previews/165/165394_2989529-hq.ogg |
| 396324 | SuperPhat | HeavyMachineGun（36 s） | https://cdn.freesound.org/previews/396/396324_7542558-hq.ogg |
| 514228 | SuperPhat | Sniper Rifle | https://cdn.freesound.org/previews/514/514228_7542558-hq.ogg |
| 410442 | SuperPhat | Enfield rifle（栓動） | https://cdn.freesound.org/previews/410/410442_7542558-hq.ogg |
| 205588 | qubodup | Gunfire（73 s，遠方交火氛圍） | https://cdn.freesound.org/previews/205/205588_71257-hq.ogg |

**爆炸**

| ID | 作者 | 內容 | 預覽 |
|---|---|---|---|
| 235968 | tommccann | Explosion_01 | https://cdn.freesound.org/previews/235/235968_4265427-hq.ogg |
| 244394 | Werra | Bang/Explosion Metallic | https://cdn.freesound.org/previews/244/244394_525427-hq.ogg |
| 523365 | LilMati | Bomb Explosion | https://cdn.freesound.org/previews/523/523365_6142149-hq.ogg |
| 262436 | The_Sound_Side | Real explosions, real gunshots（43 s） | https://cdn.freesound.org/previews/262/262436_989468-hq.ogg |

**槍械 foley（彈匣、槍機、滑套、彈殼）**

| ID | 作者 | 內容 | 預覽 |
|---|---|---|---|
| 393732 | jackthemurray | AR15/M4 彈匣與機件動作（20 s，可切多段） | https://cdn.freesound.org/previews/393/393732_5618682-hq.ogg |
| 393734 | jackthemurray | Glock 19 滑套上膛（28 s） | https://cdn.freesound.org/previews/393/393734_5618682-hq.ogg |
| 396331 | nioczkus | 1911 Reload | https://cdn.freesound.org/previews/396/396331_932959-hq.ogg |
| 432141 | MaximBomba | Rifle or shotgun reload | https://cdn.freesound.org/previews/432/432141_7549712-hq.ogg |
| 432139 | MaximBomba | Pistol reload | https://cdn.freesound.org/previews/432/432139_7549712-hq.ogg |
| 370345 | Zott820 | Mosin Nagant 栓動循環（CC0，作者表示希望署名） | https://cdn.freesound.org/previews/370/370345_2558531-hq.ogg |
| 674744 | serøutōnin--deprivəd | Browning Hi-Power 上膛 ×5 | https://cdn.freesound.org/previews/674/674744_7157894-hq.ogg |
| 318964 | GryffDavid | 彈殼彈跳（多種尺寸） | https://cdn.freesound.org/previews/318/318964_5421667-hq.ogg |
| 210102 | GrayJoy | 黃銅彈殼掉在混凝土上 | https://cdn.freesound.org/previews/210/210102_3278936-hq.ogg |
| 147261 | JohnDelayniKIng | 霰彈殼退出 | https://cdn.freesound.org/previews/147/147261_2631402-hq.ogg |
| 620929 | Metrolynn | 霰彈殼落地彈跳 | https://cdn.freesound.org/previews/620/620929_6493174-hq.ogg |

**彈著與命中**

| ID | 作者 | 內容 | 預覽 |
|---|---|---|---|
| 423301 | u1769092 | Visceral bullet impacts（肉體） | https://cdn.freesound.org/previews/423/423301_8202639-hq.ogg |
| 511194 | Pablobd | Headshot | https://cdn.freesound.org/previews/511/511194_5701403-hq.ogg |
| 144444 | pushkin | bullet impacts | https://cdn.freesound.org/previews/144/144444_336074-hq.ogg |
| 148840 | cedarstudios | ricochet | https://cdn.freesound.org/previews/148/148840_2676248-hq.ogg |
| 392975 | morganpurkis | Ricochet 2 | https://cdn.freesound.org/previews/392/392975_5937039-hq.ogg |
| 675951 | craigsmith | 打靶場子彈擊中金屬靶 | https://cdn.freesound.org/previews/675/675951_2524442-hq.ogg |
| 855248 | qubodup | Real bullet flyby | https://cdn.freesound.org/previews/855/855248_71257-hq.ogg |

彈著混凝土、木頭可以搭配 Kenney `impactPlate*`、`impactWood*`，或以碎石、木頭音效分層合成。

**刀與近戰、倒地**

| ID | 作者 | 內容 | 預覽 |
|---|---|---|---|
| 179222 | Mixedupmoviestuff | Knife Stab | https://cdn.freesound.org/previews/179/179222_3337554-hq.ogg |
| 411742 | neilsher | Knife Stab Pull | https://cdn.freesound.org/previews/411/411742_921610-hq.ogg |
| 411743 | neilsher | Knife Stab | https://cdn.freesound.org/previews/411/411743_921610-hq.ogg |
| 35213 | Abyssmal | slashkut | https://cdn.freesound.org/previews/35/35213_307822-hq.ogg |
| 420674 | SypherZent | Deep Cut / Slash / Gash | https://cdn.freesound.org/previews/420/420674_6544098-hq.ogg |
| 471097 | spycrah | Knife/sword swing（揮刀風切） | https://cdn.freesound.org/previews/471/471097_9856191-hq.ogg |
| 264062 | Paul368 | 鈍器命中＋男聲呻吟＋倒地 | https://cdn.freesound.org/previews/264/264062_2971294-hq.ogg |
| 417994 | DylanTheFish | Body fall | https://cdn.freesound.org/previews/417/417994_7482766-hq.ogg |
| 504626 | leonelmail | Body fall，very heavy，dirt | https://cdn.freesound.org/previews/504/504626_4437257-hq.ogg |

**喪屍聲**

| ID | 作者 | 內容 | 預覽 |
|---|---|---|---|
| 213509 | soykevin | Zombie Attack | https://cdn.freesound.org/previews/213/213509_3997324-hq.ogg |
| 111044 | GaryQ | Zombie group（120 s 群體低吼，可當遠景環境音） | https://cdn.freesound.org/previews/111/111044_1931452-hq.ogg ✔ |
| 58626 | kathol | A Moaning Zombie（32 s） | https://cdn.freesound.org/previews/58/58626_211893-hq.ogg |
| 133974 | MrPokephile | Horrific Zombie Growl | https://cdn.freesound.org/previews/133/133974_2449149-hq.ogg |
| 125405 | jasonLON | Monster groans, grunts, slobbers（42 s） | https://cdn.freesound.org/previews/125/125405_2279655-hq.ogg |
| 435651 | Wakerone | Zombie Demon Scream | https://cdn.freesound.org/previews/435/435651_7399650-hq.ogg |
| 179345 | lolamadeus | Monster Zombie Scream | https://cdn.freesound.org/previews/179/179345_544580-hq.ogg |
| 245223 | Thanra | zombie roar | https://cdn.freesound.org/previews/245/245223_2534855-hq.ogg |
| 426637 | mrh4hn | Zombie Choking | https://cdn.freesound.org/previews/426/426637_8238671-hq.ogg |
| 555412 | tonsil5 | Zombie Death 1 | https://cdn.freesound.org/previews/555/555412_8247784-hq.ogg |
| 534602 | JollyGreenZ | ZombieDeath | https://cdn.freesound.org/previews/534/534602_7178828-hq.ogg |
| 234237 | ProductionNow | Eating Juicy Meat（啃食） | https://cdn.freesound.org/previews/234/234237_3646900-hq.ogg |

**腳步聲**

| ID | 作者 | 內容 | 預覽 |
|---|---|---|---|
| 459964 | florianreichelt | Footsteps on concrete | https://cdn.freesound.org/previews/459/459964_6253486-hq.ogg |
| 244310 | JohnsonBrandEditing | Walking on pavement（53 s） | https://cdn.freesound.org/previews/244/244310_3229685-hq.ogg |
| 155858 | RutgerMuller | 工廠大廳裡的木頭與混凝土腳步聲 | https://cdn.freesound.org/previews/155/155858_179538-hq.ogg |
| 352870 | PotatokingXII | Footsteps dirt gravel | https://cdn.freesound.org/previews/352/352870_4187409-hq.ogg |
| 274832 | rempen | Gravel road walk | https://cdn.freesound.org/previews/274/274832_5239381-hq.ogg |
| 376809 | Alex_hears_things | Muddy and wet footsteps | https://cdn.freesound.org/previews/376/376809_2309965-hq.ogg |

**環境音**

| ID | 作者 | 內容 | 預覽 |
|---|---|---|---|
| 117136 | cobratronik | Wind, arctic, cold（59 s） | https://cdn.freesound.org/previews/117/117136_732072-hq.ogg |
| 459981 | florianreichelt | Strong Wind | https://cdn.freesound.org/previews/459/459981_6253486-hq.ogg |
| 577312 | TRP | 城市遠近警笛（Calgary 2011，104 s） | https://cdn.freesound.org/previews/577/577312_97550-hq.ogg |
| 469363 | brunoboselli | Distant Ambulance Siren | https://cdn.freesound.org/previews/469/469363_300738-hq.ogg |
| 363092 | TheWoodlandNomad | Fire crackle and flames | https://cdn.freesound.org/previews/363/363092_6612464-hq.ogg |
| 563765 | florianreichelt | 汽車燃燒 | https://cdn.freesound.org/previews/563/563765_6253486-hq.ogg |
| 686762 | cyntrix | 廢棄建築外部環境（301 s） | https://cdn.freesound.org/previews/686/686762_3983735-hq.ogg |
| 155142 | burning-mir | terror ambience（121 s） | https://cdn.freesound.org/previews/155/155142_2098884-hq.ogg |

### 3.4 OpenGameArt 與 Kenney 包（已確認 CC0）

- **The Free Firearm Sound Library**（Ben Jaszczak 等）https://opengameart.org/content/the-free-firearm-sound-library
  檔案：`https://opengameart.org/sites/default/files/Prepared%20SFX%20Library.7z`（193,954,738 B ✔）
- **Zombies Sound Pack**（artisticdude，24 個 wav）https://opengameart.org/content/zombies-sound-pack
  檔案：`https://opengameart.org/sites/default/files/zombies.zip`（4,667,201 B ✔）
- **Voice Effects: Zombie / Skeleton / Monster / Human Male**（ArcadeParty）https://opengameart.org/content/zombie-skeleton-monster-voice-effects
  檔案：`https://opengameart.org/sites/default/files/Voice%20Effects%20Zombie-Skeleton-Monster%20Human%20Male.zip`（2,047,881 B ✔，23 個 wav）
- 其他候選（OGA 的 CC0 篩選結果，**授權尚未逐頁確認**）：`zombie-moans`、`zombie-pain`、`undead-moans`、`hungry-ghoul`、`gun-reload-sounds`、`shotgun-reload-sound-effects`、`muffled-distant-explosion`、`42-snow-and-gravel-footsteps`、`metal-footsteps-on-concrete`、`fire-crackling`（網址皆為 `https://opengameart.org/content/<slug>`）
- **Kenney Impact Sounds** https://kenney.nl/assets/impact-sounds
  檔案：`https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip`（800,850 B ✔）。路徑中的 hash 可能會變，腳本應先抓資產頁再解析 `.zip` 連結。

---

## 4. 動作捕捉（喪屍動畫）

### 4.1 CMU Graphics Lab Motion Capture Database

- **授權**（mocap.cs.cmu.edu 首頁與 FAQ）：
  - 資料可自由使用，可以複製、修改、再散布，無須許可。
  - 可以用在商業產品中，但**不得直接販售這份資料本身（含轉檔後的版本）**。
  - 官方希望在致謝中註明資料來自 mocap.cs.cmu.edu，並提及 NSF EIA-0196217 資助。
  - 這**不是 CC0**，是自訂的寬鬆授權。放進 MIT repo 可行，但應放在獨立資料夾，附上 CMU 條款，並在 CREDITS 致謝；也不要把它當成可販售的動作庫。
- **BVH 轉檔**：Bruce Hahne（cgspeed）的 2010「MotionBuilder-friendly」版。他在 READMEFIRST 中聲明不額外加任何限制。
  - GitHub 鏡像：https://github.com/una-dinosauria/cmu-mocap（約 1 GB，**不要 clone**，逐檔抓 raw）。
  - raw URL 規則：`https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/master/data/{三位數受試者資料夾}/{受試者號}_{動作號}.bvh`
  - 例：`data/104/104_41.bvh`、`data/020/20_08.bvh`。注意資料夾名補零，檔名不補零（✔ 已驗證 104_41、120_22、20_08、140_01）。
  - 索引：同 repo 的 `cmu-mocap-index-text.txt`。
  - 格式：120 fps（Frame Time .0083333），單位為英吋。骨名是 `Hips`、`LHipJoint`、`LeftUpLeg`……，**和 MPFB2 `rig.cmu_mb.json` 一致**。
  - 下表是調查時以 CMU 官網關鍵字搜尋核對過的動作編號。

| 用途 | Trial | 描述（CMU 原標） | 幀數 |
|---|---|---|---|
| 喪屍走 | **104_41** | ZombieWalk | 1,559（約 13 s） |
| 喪屍走 | **104_42** | ZombieWalk8 | — |
| 喪屍轉向 | **104_43** | ZombieWalkRightAngleTurns | — |
| 喪屍走（第二演員） | **120_22** | Zombie | 1,325 |
| 科學怪人步態 | 104_03 | Frankenstein male walk | — |
| 喪屍行進（雙人） | 20_08、21_08 | zombie march（subject A / B） | 215 |
| 踉蹌 | 104_13 StumbleWalk、91_59 / 105_59 360 smallStumble、22_12 / 23_12 A stumbles into B | — | — |
| 醉步、跛行、受傷 | 91_09、105_09、137_16 DrunkWalk；91_16、105_16 Limp；91_24 HurtLegWalk；91_26 HurtStomachWalk；77_19–24 limping；139_19–24 Walk Wounded Leg；137_33 Old Man Walk | — | 91_09 為 5,403 幀 |
| 潛行 / 蹲走 | 77_14、77_15、77_29、77_30 creeping；77_33 creeping with limp；136_09–16 Walk Crouched | — | — |
| 爬行 | 111_03 Crawling；133_01、133_02 Walk Crawl | — | 111_03 為 1,525 幀 |
| 倒地（死亡素材） | 90_16 fall on face；90_18 RugPullFall；90_17 BannanaPeelSlip；85_15 90TwistsFall | — | 90_16 為 725 幀 |
| 起身（倒放即倒下；也可做喪屍爬起） | 140_01–09（俯臥、側臥、仰臥起身）；139_16–18；111_06–08；77_16–18；113_08 | — | 140_01 為 831 幀 |
| 撲抓 / 攻擊 / 獸性動作 | 49_02、49_03、49_07（angrily grab、smash against wall，需裁切）；76_01、76_02（後退後出拳）；120_02 Gorilla；80_49 gorilla；141_14 Punch and Kick | — | — |

> CMU 沒有「被槍擊死亡」的專門動作。死亡建議組合使用 90_16 / 90_18 倒地、Quaternius 的 `Death01`，以及 ragdoll 物理。

### 4.2 100STYLE（CC BY 4.0，含 **Zombie** 風格）

- Zenodo record 8127870，API 回傳的授權為 `cc-by-4.0`（✔）。
- 檔案：`100STYLE.zip`，1,468,515,354 B，內含原始 BVH，`https://zenodo.org/api/records/8127870/files/100STYLE.zip/content`。
- 伺服器支援 Range，可以只抽單一 BVH（附錄 B 的方法）。
- 共 100 種風格，與喪屍相關的有：`Zombie`、`Drunk`、`DragLeftLeg`、`DragRightLeg`、`LimpLeft`、`LimpRight`、`Old`、`BentForward`、`Lunge`、`Crouched`、`Stiff`、`WildArms`。
- 每種風格的檔案：`_FW`（前走）、`_FR`（前跑）、`_BW`、`_BR`、`_SW`、`_SR`（側移）、`_ID`（待機）、`_TR1`（轉換）。
  - 例：`100STYLE/Zombie/Zombie_FW.bvh` 為 7.3 MB；`Zombie_ID.bvh` 為 1.5 MB；`Zombie_FR.bvh` 為 3.5 MB（**可以做「快跑型喪屍」**）。
- **必須署名**：I. Mason, S. Starke, T. Komura, *Real-Time Style Modelling of Human Locomotion via Feature-Wise Transformations and Local Motion Phases*（2022）。
- 骨架命名本次未驗證，需要自行重定向。

### 4.3 Quaternius Universal Animation Library（**CC0**）

- **UAL2 Standard**：https://opengameart.org/content/universal-animation-library-2
  - 檔案：`https://opengameart.org/sites/default/files/universal_animation_library_2standard.zip`（10,257,419 B ✔）
  - 內含 `Unreal-Godot/UAL2_Standard.glb`（8.06 MB）、`Unity/UAL2_Standard.fbx`、`Mannequin_F.glb`。
  - 以 Range 讀取 GLB JSON 後，確認有 43 段動畫，包括：**`Zombie_Idle_Loop`、`Zombie_Walk_Fwd_Loop`、`Zombie_Scratch`**、`Hit_Knockback`、`Melee_Hook`、`Consume`、`LayToIdle`、`Slide_*`、`Walk_Carry_Loop` 等。
  - **骨骼是 UE Mannequin 命名**（`root`、`pelvis`、`spine_01..03`、`neck_01`、`Head`、`clavicle_l`、`upperarm_l`、`lowerarm_l`、`hand_l`、`thigh_l`、`calf_l`、`foot_l`、`ball_l`……），等同 MPFB2 `game_engine`。
- **UAL1 Standard**：https://opengameart.org/node/174563
  - 檔案：`https://opengameart.org/sites/default/files/universal_animation_librarystandard.zip`（14.5 MB）
  - Godot GLB 內有 46 段動畫，包括 `Death01`、`Hit_Chest`、`Hit_Head`、`Crouch_Fwd_Loop`、`Walk_Loop`、`Jog_Fwd_Loop`、`Sprint_Loop`、`Pistol_*`、`Punch_*`。
  - 骨骼是 Rigify `DEF-*` 命名。
- Quaternius 官網提供完整版（UAL2 Source 為付費版），預覽：https://quaternius.com/animviewer.html
- 這兩套是**唯一確認為 CC0、又直接含喪屍動作的動作庫**，非常適合作為 runtime 主力動畫。CMU 和 100STYLE 則用來補足多樣性。

### 4.4 其他（排除或待驗證）

- **Bandai Namco Research Motion Dataset**：CC BY-NC 4.0，✗ 禁止商用，與 MIT 下游不相容。
- **Ubisoft LAFAN1**：CC BY-NC-ND 4.0，✗。
- **Mixamo**：Adobe 條款不允許散布原始動畫或角色檔，✗ 不可進 repo。
- **AMASS**：研究用途限定，✗。
- **ACCAD、SFU mocap**：本次查不到明確授權條文，未驗證，暫不使用。

---

## 5. CC0 寫實槍械 3D 模型（確實稀少）

| 模型 | 來源 | 授權 | 狀態 / 規格 |
|---|---|---|---|
| **`bolt_action_rifle_7_62`**（栓動步槍，類莫辛納甘） | Poly Haven https://polyhaven.com/a/bolt_action_rifle_7_62 | CC0 | ✔ 完整 PBR，19,985 polys，最高 8k 貼圖；1k glTF 總計約 6.0 MB（含 accessories 材質）。**可當狙擊槍** |
| **`service_pistol`**（冷戰時期半自動手槍） | Poly Haven https://polyhaven.com/a/service_pistol | CC0 | ✔ 完整 PBR，27,548 polys（需減面），最高 4k |
| `stick_grenade`（德式柄式手榴彈） | Poly Haven | CC0 | 6,250 polys |
| 近戰：`machete`、`hatchet`、`baseball_bat`、`crowbar_01`、`sledgehammer_01` | Poly Haven | CC0 | 2.3k–5.3k polys，全 PBR |
| High-poly AK-47（Lamoot） | https://opengameart.org/content/high-poly-ak-47 | CC0 | `.blend` / `.obj`，**無貼圖**，高模（可烘焙法線） |
| Soviet Assault Rifle 3D、Soviet Special Sniper Rifle 3D（GGBotNet） | https://opengameart.org/content/soviet-assault-rifle-3d 、https://opengameart.org/content/soviet-special-sniper-rifle-3d | CC0 | FBX / OBJ / BLEND，約 2.3–2.4k 三角形，**無貼圖** |
| M4A1 Assault Rifle（nisu）、M16（DeadDog）、AKM（LonesomeDucky） | `/content/m4a1-assault-rifle`、`/content/m16-assualt-rifle`、`/content/akm` | CC0 | 品質參差，需檢查 |
| Benelli M1、Double Barrel Shotgun（Jean PFP） | `/content/benelli-m1`、`/content/double-barrel-shotgun` | CC0 | Benelli 無貼圖 |
| High Poly Glock-18（locarem） | `/content/high-poly-glock-18-no-textures` | CC0 | OBJ，無貼圖 |
| Hunting Rifle、Lee Enfield（Lucian Pavel） | `/content/hunting-rifle`、`/content/bolt-action-rifle-lee-enfield` | CC0 | — |
| Low Poly FPS Rifle and Hands（Robin Lamb）、**fps arms (rigged only)**（para） | `/content/low-poly-fps-rifle-and-hands`、`/content/fps-arms-rigged-only` | CC0 | 第一人稱手臂骨架可參考 |
| Various Small Arms（Tabasco） | `/content/various-small-arms-assault-rifles-sniper-pistol` | 頁面同時列 CC-BY 3.0 與 CC0 → 選擇以 CC0 使用 | `smallarms.zip` |

（OGA 網址前綴為 `https://opengameart.org`）

**結論**：完整 PBR 且 CC0 的寫實槍械只有 Poly Haven 的兩把，可以涵蓋狙擊槍與手槍。步槍、衝鋒槍、霰彈槍、機槍有兩條路：
- 拿 OGA 的 CC0 網格重新拓樸、展 UV，套 ambientCG 或 Poly Haven 的 CC0 金屬、木頭、塑膠材質（例如 `Metal021`、`Planks023A`）。
- 在 Blender 自行建模。

Sketchfab 雖然有不少 CC0 槍械，但下載需要登入或 OAuth token，不符合免登入腳本化需求；如果要用，必須手動下載，並逐一保存授權截圖。

---

## 6. 授權注意事項與 repo 規劃

1. **建立 `assets/manifest.json`**：每筆記錄 `source`（頁面 URL）、`download_url`、`author`、`license`（CC0、CC-BY-4.0、CMU-mocap）、`sha256`、`retrieved`（日期），然後由腳本自動產生 `CREDITS.md` 和 `THIRD_PARTY_NOTICES.md`。
2. **分級存放**：
   - `assets/cc0/`：Poly Haven、ambientCG、MakeHuman、Quaternius、Kenney、Freesound CC0、OGA CC0。
   - `assets/cc-by/`：100STYLE 等，必須署名。
   - `assets/cmu-mocap/`：附 CMU 條款與致謝。
   - 在 repo 的 `LICENSE` 註明：**「程式碼為 MIT；`assets/` 依各子目錄授權」**，避免讓人誤以為 CC-BY 或 CMU 的檔案也是 MIT。
3. **不得進 repo**：Sonniss GDC、BBC、Mixamo、MB-Lab（AGPL）、Bandai Namco 與 LAFAN1（NC）、Pixabay、Zapsplat、Mixkit、Sketchfab 上非 CC0 的模型。
4. **MakeHuman 與 MPFB2 程式碼**是 AGPL / GPL，不要複製進 MIT repo；只取 CC0 資產，或把 MPFB2 當外部工具使用。
5. **Freesound**：只收 CC0；留存頁面 URL；避開可疑的影視或遊戲擷取音效。CC0 雖然不要求署名，但建議仍在 CREDITS 列出作者，這也是社群慣例。
6. **Poly Haven API**：請求時帶自訂 User-Agent；建置期下載後自行託管，runtime 不打 API。

---

## 附錄 A：關鍵查詢指令（皆免登入）

```bash
# Poly Haven
curl -s https://api.polyhaven.com/assets?t=models | jq 'with_entries(select(.value.categories|index("collection: hidden_alley")))|keys'
curl -s https://api.polyhaven.com/files/kloppenheim_01_puresky | jq -r '.hdri["1k"].hdr.url'
# ambientCG
curl -s "https://ambientcg.com/api/v3/assets?type=material&q=corrugated&include=downloads,maps&limit=20"
curl -sL -o Fence006_1K-JPG.zip "https://ambientcg.com/get?file=Fence006_1K-JPG.zip"
# Freesound（需 token）
curl -s "https://freesound.org/apiv2/search/text/?query=zombie&filter=license:%22Creative%20Commons%200%22&fields=id,name,username,license,previews&token=$FS_KEY"
# CMU BVH
curl -sO https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/master/data/104/104_41.bvh
```

## 附錄 B：HTTP Range 抽取 zip 內單一檔案（避免下載整包 268 MB / 1.4 GB）

```python
# 用法：python -I zipget.py <zip_url> <檔名結尾> <輸出檔>
import sys, struct, urllib.request, zlib
url, want, out = sys.argv[1:4]
def rng(a, b=None):
    r = 'bytes=%d' % a if a < 0 else 'bytes=%d-%s' % (a, '' if b is None else b)
    return urllib.request.urlopen(urllib.request.Request(url, headers={'Range': r, 'User-Agent': 'cs-asset-fetcher/1.0'})).read()
tail = rng(-65557); i = tail.rfind(b'PK\x05\x06')
cd_size, cd_off = struct.unpack('<II', tail[i+12:i+20])   # ZIP64（>4GB）需另讀 PK\x06\x06 記錄
cd = rng(cd_off, cd_off + cd_size - 1); p = 0
while cd[p:p+4] == b'PK\x01\x02':
    meth, = struct.unpack('<H', cd[p+10:p+12]); csz, = struct.unpack('<I', cd[p+20:p+24])
    n, e, c = struct.unpack('<HHH', cd[p+28:p+34]); lho, = struct.unpack('<I', cd[p+42:p+46])
    name = cd[p+46:p+46+n].decode('utf-8', 'replace')
    if name.endswith(want):
        ln, le = struct.unpack('<HH', rng(lho, lho+29)[26:30]); s = lho + 30 + ln + le
        data = rng(s, s + csz - 1)
        open(out, 'wb').write(zlib.decompress(data, -15) if meth == 8 else data); break
    p += 46 + n + e + c
```

已實測可用的 zip 主機（皆支援 Range）：`files.makehumancommunity.org`、`opengameart.org`、`zenodo.org`、`kenney.nl`、`acg-download.struffelproductions.com`（ambientCG）。
