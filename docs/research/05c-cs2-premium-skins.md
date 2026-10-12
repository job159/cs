# 05c｜CS2／CS:GO 頂級造型（Skins）研究：絢麗塗裝與刀檢視 → UV-less 程序化 Shader 復刻指南

> 研究目的：使用者要求「調研近年 CS 各種新的、絢麗的武器（克金武器），盡可能模仿該類型風格」。本篇負責 **CS2／CS:GO 的付費造型（skins）**：最貴、最好看的槍皮與刀皮、手套、StatTrak 計數器、貼紙、吊飾、刀的檢視動畫。重點是把「**為什麼看起來貴**」拆成可以在《災厄前線》引擎（Three.js r186、無 UV 網格、物件空間 triplanar、烘焙 `_bake` 頂點屬性）裡**程序化重現**的配方。
> CSO（絕對武力 Online）的炫砲機制請見 `03-weapons-feel.md` 第 2 與第 5 節，本文不重複。本文偏「**材質與外觀**」，03 偏「**機制與手感**」。
> 研究日期：2026-10-12。
>
> 可信度標記：
> - **[官方]**：Valve 文件（counter-strike.net Workshop 頁、CS2 Workshop Item Editor 說明文字、Valve Developer Wiki）。
> - **[資料]**：從遊戲物品資料推得，例如社群鏡像的 `items_game` JSON（ByMykel/CSGO-API）、開源計算器原始碼。
> - **[社群]**：交易網站、社群 Wiki、攻略文章。常有商業立場，數字要保守看。
> - **[推論]**：本文依資料推導，沒有官方明說。
> - **[不確定]**：來源互相矛盾。
> - **[建議值]**：本文提出的起始參數，需要實機調整。
>
> 名稱：英文為主。中文名稱標「簡中官方譯名（轉繁）」者，來自完美世界國服的官方本地化（透過 CSGO-API 的 zh-CN 資料），台灣玩家多半也這樣稱呼。
> 法律提醒：本文**只模仿風格與技法**（漸層陽極、大理石糖果漆、淬火色、珠光、閃粉等通用工藝），**不抄**任何具體圖稿、名稱或標誌。第 12 節有 M4A4 | Howl 因盜用圖稿被改成 Contraband 的前例。

---

## 0. 重點摘要（TL;DR）

1. **CS2 的「貴」不靠發光，靠「材質＋彩票＋展示」**。CSO 頂級武器靠自發光、變形、特效（見 03）。CS2 造型**幾乎沒有自發光**，華麗感來自：
   - **金屬糖果漆（candy over chrome）**：漸層、大理石紋、淬火色。這類材質會隨環境反射流動。
   - **珠光（pearlescent）、閃粉（glitter）、虹彩（iridescent）**：CS2 在 2023–2025 年陸續加進工具。2025 年 12 月新增 *Custom Paint Job Extended*，帶有 iridescence 選項。[官方]
   - **隨機彩票**：每把造型有磨損值 float（0–1）與圖樣種子 pattern seed（0–1000）。同名造型因此有「藍寶（Blue Gem）」「全漸層（100% Fade）」「水火（Fire & Ice）」「網心（centered web）」等天價個體。[資料][社群]
   - **展示舞台**：刀的檢視動畫（蝴蝶刀翻轉、爪刀轉環）、StatTrak 橘色 LED 計數器、可自由擺放的 5 張貼紙、吊飾的晃動物理。
2. **Valve 官方把塗裝分成 9 種 Finish Style**：Solid Color、Hydrographic、Spray-Paint、Anodized、Anodized Multicolored、Anodized Airbrushed、Patina、Custom Paint Job、Gunsmith。每種都規定了「顏色怎麼疊」「圖樣怎麼投影（UV 或 triplanar）」「磨損露出哪一層」。CS2 編輯器另外加了 *Extended* 版本、*Case Hardening*、*Spray Paint Halftone* 等類型。[官方]（第 3 節）
3. **四色分層公式是一切的骨架**：底色 Color0，再依圖樣的 R、G、B 三個通道，依序疊上 Color1、Color2、Color3，**越後面的層優先權越高**。我們可以用程序化雜訊**直接算出 R/G/B 遮罩**，就能套用 Valve 全部 9 種風格。[官方]
4. **種子 → 圖樣的方法很單純**：用 seed 初始化亂數產生器，依序抽 `offsetX → offsetY → rotation`，在該造型設定的範圍內取值，再對圖樣座標做平移、縮放、旋轉。舉例：Fade 的旋轉範圍是 −55°～−65°，偏移固定 −0.7。「Fade 百分比」只是把旋轉角重新映射到 80–100%。[資料]
5. **刀面名品幾乎都是「金屬底＋糖果色＋一種程序紋理」**：
   - Fade：沿著刀身的三色漸層。
   - Doppler／Gamma Doppler：黑銀大理石，再罩糖果色。依配色分 Phase 1–4 與寶石版本：Ruby、Sapphire、Black Pearl、Emerald。
   - Marble Fade：大理石紋，再罩三色漸層。
   - Case Hardened：淬火氧化膜色譜（金、褐、紫、藍）。
   - Crimson Web：紅底，加上黑色蛛網的水轉印。
   - Slaughter：紅色糖果漆，罩在兩種反射率交錯的斑紋上。
   - Tiger Tooth：橘金陽極，加上蝕刻虎紋。
   - Damascus：鍛造層紋。
   - Lore：金色繩結紋。
   - Autotronic：紅色陽極，加上鋼網。

   這些都能用**物件空間座標＋domain warp 雜訊、Voronoi、極座標、色帶貼圖**重現（第 5 節、第 9 節附 GLSL 草稿）。
6. **2024–2026 年的新趨勢（從 CS2 新收藏品歸納）**：
   - **奢華材質**：瓷器、珍珠母貝、金繕、羽絨外套、鏡面鍍鉻。
   - **東方題材**：蓮、鶴、青花瓷、金繕。
   - **金色點綴**：到處都有。
   - **珠光、虹彩、閃粉、半色調（halftone）**。

   這和 03 的「九子神兵＋台灣廟宇美學」方向**高度相容**，可以做成交趾陶、剪黏、景泰藍、回紋鎏金等原創造型（第 10 節）。
7. **磨損是第二層美術**：
   - Factory New（0–0.07）幾乎無瑕。Battle-Scarred（0.44–1.0）露出底材。[官方]
   - 磨損方式依風格不同：
     - 噴漆一層一層往下磨。
     - 陽極先磨到鍍鉻層，再到底材。
     - Patina 的刮痕露出原金屬，凹處積垢。
   - 我們現有的 `_bake.g`（凸邊）、`_bake.b`（凹處）、grunge 貼圖，已經具備 Valve 磨損系統的所有輸入。
8. **刀檢視的爽感有五個來源**：
   - 刀面在主光下「掃過一道反光」。
   - 快—停—快的節奏，加上「喀」一聲的定格。
   - 音效對拍（開刀卡榫、環轉風聲）。
   - 偶發的稀有版本（拋接、指間翻）。
   - 按住可以一直轉（Talon 式 fidget），而且隨時可以開火取消。（第 8 節）
9. **手機實作建議**：
   - 只有**第一人稱槍模**跑完整的 finish shader，包含珠光、閃粉與多層磨損。世界中的槍與第三人稱用簡化版。
   - 重度雜訊（大理石、淬火、鍛紋）在啟動時**預烘成可平鋪的 2D 圖樣貼圖**，做法和現有的 `detail.js` 一樣。漸層、網紋、六角網這類解析式圖樣就直接在 shader 裡算。
   - 用 `#define FINISH_STYLE` 編譯成不同變體，不要在 shader 裡動態分支。
10. **我們的原創化**：
    - 稀有度梯：凡品、良品、精品、珍品、極品，刀與手套另設「神品」。
    - 計數器改成 **VFD 青綠螢光管「斬數計」**，避開 StatTrak 的橘色 LED。
    - 吊飾做成平安符、香火袋、風獅爺、珍奶。
    - 貼紙七種材質：紙、亮膜、閃粉、鐳射、燙金、金箔、光柵。
    - 26 款原創塗裝配方（第 10 節）。

---

## 1. 為什麼 CS2 造型「看起來貴」：五個價值槓桿

| 槓桿 | CS2 的做法 | 對《災厄前線》的意義 |
|---|---|---|
| **稀有度顏色梯** | 灰白（Consumer）→淺藍（Industrial）→藍（Mil-Spec）→紫（Restricted）→粉紫（Classified）→紅（Covert）→金（★ 刀與手套）。另有絕版的 Contraband（玫瑰金，只有 Howl）。[官方][資料] | 玩家一眼就懂價值。我們沿用「冷色到暖色、越暖越稀有」的類型慣例，但換成自己的色值與命名（第 10.1 節）。 |
| **材質而非特效** | 所有造型都要符合 PBR 反照率範圍：金屬約 sRGB 180–250，非金屬 55–220。Valve 不鼓勵用太亮的顏色冒充光源。[官方] | 「寫實外觀（CS2／PUBG）」的定位，正適合用**材質華麗度**表現價值。真正的自發光留給 03 的神兵與能量武器。 |
| **彩票（float＋seed）** | 掉落時隨機給磨損值與圖樣種子，兩者都不能改。同名造型的價差可達千倍，例如 AK-47 Case Hardened 的 seed 661 曾以超過 100 萬美元成交。[社群] | PvE 合作遊戲不一定要交易，但「**每把都不一樣、某些特別稀有**」本身就有收藏驅動力。也可以只當成就或稱號，不做市場（第 10.6 節）。 |
| **客製化層** | StatTrak 計數器、Souvenir 金色標籤加比賽貼紙、最多 5 張貼紙（2024 年 2 月起可自由擺放與旋轉）、吊飾（2024 年 10 月起）、命名牌。[社群][官方] | 讓玩家把武器「變成自己的」。計數器與吊飾在第一人稱一直看得到，CP 值最高。 |
| **展示舞台** | 檢視（inspect）動畫是造型的伸展台。Valve 審稿要求必附 inspect、手持、側面三種截圖。[官方] | 檢視動畫要為「讓反光掃過刀面」而設計，不只是轉一下（第 8 節）。 |

**和 CSO 的差異**（給美術定調）：

- CSO 頂級武器的「貴」＝**機制**（變形、大招）＋**自發光**（夜光、圖騰亮起）＋**粒子**。
- CS2 的「貴」＝**金屬漆工藝**＋**隨機個體差**＋**拿在手上把玩**。
- 《災厄前線》可以兩者疊加：所有武器都能套 CS2 式塗裝層。03 的「神兵」再額外加 CSO 式的能量層（第 11 節）。

---

## 2. 稀有度、外觀等級、圖樣種子：硬資料

### 2.1 稀有度與邊框顏色

| 稀有度（武器） | 貼紙／手套對應名 | 顏色（Steam 物品資料） | 備註 |
|---|---|---|---|
| Consumer Grade | — | `#b0c3d9` | 地圖收藏品才有 |
| Industrial Grade | — | `#5e98d9` | |
| Mil-Spec Grade | High Grade | `#4b69ff` | 武器箱最低階 |
| Restricted | Remarkable | `#8847ff` | |
| Classified | Exotic | `#d32ce6` | |
| Covert | Extraordinary | `#eb4b4b` | 槍的最高階。刀與手套在資料中也標成 Covert／Extraordinary，物品名前加 ★ |
| Contraband | — | `#e4ae39` | 只有 M4A4 \| Howl（因侵權改版後停產） |
| Rare Special ★（刀、手套） | — | 庫存框為紫色；開箱動畫顯示為金色 | 社群通稱「金」[社群] |

- 色碼來自 ByMykel/CSGO-API 的 `skins.json`，它鏡像了遊戲的 `items_game`。[資料]
- **品質邊框**：StatTrak 為**橘色**，Souvenir 為**黃色**，★ 刀與手套為**紫色**。[社群：counterstrike.fandom Skins 條目]
- **開箱機率**（標準武器箱，社群整理）：Mil-Spec 79.92%、Restricted 15.98%、Classified 3.20%、Covert 0.64%、刀或手套 0.26%。[社群]
- **2025-10-23 經濟改版**：新增「**5 把 Covert 合成 1 把刀或手套**」的 Trade-Up。刀價 48 小時內下跌 20–50%，Blue Gem 等「圖樣稀有」的個體幾乎不受影響。這也證明「**圖樣彩票**」比「**物品本身**」更能保值。[社群]

### 2.2 磨損值（float）與外觀等級

| 外觀 | Valve 官方範圍（Workshop、Item Editor） | 社群常用範圍 |
|---|---|---|
| Factory New | 0.00–0.07 | 0.00–0.07 |
| Minimal Wear | 0.07–0.15 | 0.07–0.15 |
| Field-Tested | 0.15–0.37 | 0.15–0.38 |
| Well-Worn | 0.37–0.44 | 0.38–0.45 |
| Battle-Scarred | 0.44–1.00 | 0.45–1.00 |

- 官方文件與 Item Editor 說明都寫 0.37／0.44。交易站多寫 0.38／0.45。[不確定：兩者並存，我們自訂即可]
- **每款造型有自己的 float 上下限**：
  - Fade、Doppler、Marble Fade、Tiger Tooth：0–0.08，只有 FN／MW。
  - Slaughter：0.01–0.26。
  - AWP \| Asiimov：0.18–1.0，**沒有 FN 和 MW**。
  - Case Hardened：0–1。
  - Rust Coat：0.40–1.0，生來就是舊的。

  [資料]
- **用 float 範圍控制「好看的造型不能太新」或「髒造型不能太乾淨」**：Asiimov 的白色面板只有在磨損後才露出黑色底；Battle-Scarred 的 AWP \| Hyper Beast 只剩怪獸圖案。[社群 Wiki 冷知識]
- float 的分布接近**鐘形**：極低值與極高值都最稀有。出處是 Valve 在 GDC 談 CS:GO 經濟內容的演講，經 Wiki 轉述。[社群]
- 官方說法：**磨損越高，表面刮痕越多、越髒**。成品圖稿**不要**自己畫髒污、刮痕、AO，合成系統會依 float 自動加上。[官方]

### 2.3 圖樣種子（Pattern Template／Paint Seed）的實際運作

1. 每把造型有一個 0–1000 的種子，掉落時隨機決定，不能更改。seed 0 與 seed 1 的結果相同。[社群：pattern.wiki]
2. **亂數產生器**：開源的 Fade 計算器重寫了 Valve 的 uniform random stream。演算法是 Park–Miller 最小標準 LCG（`IA=16807, IM=2^31−1`）加上 32 格 Bays–Durham 洗牌（相當於 *Numerical Recipes* 的 `ran1`）。`RandomFloat(lo,hi) = lo + (hi−lo) × (AM × next())`，其中 `AM=1/IM`，結果上限截在 `1−1.2e−7`。[資料：chescos/csgo-fade-percentage-calculator]
3. **抽取順序固定**：`offsetX = RandomFloat(x_start, x_end)` → `offsetY = RandomFloat(y_start, y_end)` → `rotation = RandomFloat(rot_start, rot_end)`。範圍由各造型的 paint kit 定義：

   | 造型 | 偏移 X | 偏移 Y | 旋轉 |
   |---|---|---|---|
   | Fade（預設） | −0.7 | −0.7 | −55°～−65° |
   | M4A1-S Fade | −0.14～0.05 | — | 固定 −45° |
   | MP7 Fade | −0.9～−0.3 | −0.7～−0.5 | 旋轉與偏移都變 |

   Case Hardened 的旋轉範圍是 0–360°。Karambit Marble Fade 是 −70°～−50°。[資料][社群]
4. **圖樣變換鏈**（pattern.wiki 逆向整理）：
   1. 平移 `(offsetX−0.5, offsetY−0.5)`，讓原點置中。
   2. 縮放：比例依武器與造型而定。
   3. 以圖樣左上角為軸旋轉。
   4. 再補一段由 `0.5/scale` 經反向旋轉得到的偏移。

   網頁上第 4 步的公式和標準旋轉不完全一致，可能是筆誤。[不確定]
5. **Fade 百分比**＝把每個 seed 的旋轉值線性映射到 80%–100%。最好的旋轉角是 100%，最差的是 80%。部分武器方向相反（AWP、Karambit、MP7、Talon）。[資料]
6. **圖樣尺度**：大多數風格以 **36 英吋（約 0.91 m）圖樣紙**為基準，triplanar 風格以 **18 英吋（約 0.46 m）**為基準，並依武器大小再修正。勾選 `ignore_weapon_size_scale` 時不修正。[官方]
7. **Valve 鼓勵「彩蛋圖樣」**：圖樣中藏一些只有在特定旋轉或偏移才會出現的元素，讓同一張圖樣能對應不同稀有度。這就是「稀有圖樣」經濟刻意設計的來源。[官方 Style Guide]

> **對我們的啟示**：
> - 不必沿用 Valve 的 LCG，用 `mulberry32` 之類的簡單 PRNG 即可。
> - 但要**固定抽取順序**（offsetX、offsetY、rotation，必要時再抽 hue 或第二組參數），之後才能**離線預算整張「稀有圖樣表」**（第 9.9 節）。

---

## 3. Valve 九種塗裝風格（＋CS2 擴充）拆解與程序化做法

### 3.0 共通規則（全部風格適用）[官方]

- **四色分層**：
  - 依序為 `Color0`（底漆）、`Color1`（R 遮罩）、`Color2`（G 遮罩）、`Color3`（B 遮罩）。
  - 計算是巢狀的 `mix`：`c = C0; c = mix(c, C1, R); c = mix(c, C2, G); c = mix(c, C3, B)`。**藍色通道的優先權最高**。
  - Solid Color 用武器預設的 paint-by-number 遮罩，其他風格用圖樣 RGB。[社群：pattern.wiki 色彩頁，與官方說明一致]
- **Paint-by-number**：每把可塗裝的武器被切成幾個區域，決定哪裡能陽極或 patina、哪裡是圖樣、哪裡是單色。彈殼、槍管內壁、擊發桿等部位**永遠不塗**。[官方]
- **耐久（durability）與遮罩**：存在圖樣的 alpha 通道。
  - 約 196：從可塗區域扣除。
  - 128 或 255：無作用。
  - 低於 128：越暗越耐磨。
  - CS2 另有 `Paint Durability X/Y/Z/W`，可以**為每個顏色層分別設定耐久**。[官方]
- **CS2 共用的 PBR 參數**：Pearlescent Scale（＋遮罩）、Paint Roughness（單值、貼圖或每色一值）、Paint Metalness（每色一值或遮罩）、自訂 Normal、自訂 AO。[官方]
- **CS2 Extended 系列額外參數**（適用 Solid、Hydro、Spray、Custom、Gunsmith、Case Hardening 的 Extended 版本）。[官方]
  - 年份：2025 年的 Valve 自製造型已經用上 `hye_`、`soe_`、`cue_` 前綴。Workshop 則在 2025-12 開放 Custom Paint Job Extended。推測是 Valve 先內部使用，再開放給社群。[推論]
  - **Glitter**：`Intensity`、`Scale`（越大越細）、`Rainbow Balance`（彩虹與底色比例）、`Rainbow Spread`（曲面上的彩虹光束擴散，越大越不雜亂）。
  - **Iridescent**：`Strength`、`Scale`（換色頻率）、`Hue Shift`（色譜起點）。
  - **Overlay**：第二張圖疊在上層。混合模式有 Translucent、Color、Multiply、Add、Layer，可以只套在某個顏色層，並有自己的耐久、金屬度、粗糙度、SFX 強度，還能選擇跟隨圖樣的隨機偏移。
  - **SFX Mask**：取代原本的 Pearlescence Mask，同時控制珠光、閃粉、虹彩出現的位置。

#### 圖樣 ID 前綴 → 風格（從 items_game 推論）

`items_game` 的 pattern id 前綴和描述文字一一對應。用這張表可以反查任何造型屬於哪種風格。[資料][推論]

| 前綴 | 風格 | 數量（含各相位或武器變體） | 例子 |
|---|---|---|---|
| `so_` | Solid Color | 110 | Karambit Night、Ultraviolet |
| `hy_` | Hydrographic | 268 | Crimson Web `hy_webs`、Bright Water |
| `sp_` | Spray-Paint | 206 | Urban Masked、Safari Mesh、Scorched |
| `an_` | Anodized | 38 | M4A1-S Hot Rod、Tiger Tooth `an_tiger_orange` |
| `am_` | Anodized Multicolored | 363 | Doppler `am_ruby_marbleized`、Marble Fade、Slaughter `am_zebra`、Lightning Strike |
| `aa_` | Anodized Airbrushed | 58 | Fade `aa_fade`、Desert Eagle Blaze `aa_flames` |
| `aq_` | Patina | 161 | Case Hardened `aq_oiled`、Damascus `aq_damascus`、Blue Steel `aq_blued`、Stained `aq_forced` |
| `cu_` | Custom Paint Job | 369 | Dragon Lore、Howl、Asiimov、Printstream、Lore |
| `gs_` | Gunsmith | 189 | Gungnir、The Prince、Gold Arabesque、Autotronic、Bloodsport |
| `soe_`、`hye_`、`spe_`、`cue_` | 各風格的 Extended 版（CS2） | — | AK-47 Midnight Laminate（`soe_iridescent_purple`）、AWP Green Energy（`cue_`） |
| `gsch_`、`soch_` | Gunsmith／Solid Color＋Case Hardening（CS2） | — | AK-47 Aphrodite（`gsch_`）、M4A1-S Solitude（`soch_`） |
| `ht_` | Spray Paint Halftone（CS2）[推論] | 17 | Glock-18 Trace Lock、USP-S Bleeding Edge |

2024 年之後的新造型，pattern id 多半不再帶前綴（例如 `ak47_autoexec_camo`），無法從名稱判斷風格。

### 3.1 Solid Color（單色分件）

- **真實工藝**：拆開武器，每個零件各噴一種顏色後再組回去。最多 4 色。
- **外觀**：乾淨、軍規、低調。例：Karambit \| Night（夜戰配色）、Karambit \| Ultraviolet（黑＋紫）。
- **磨損**：直接磨到底材。
- **程序化做法**：
  - 我們的網格每個零件都有材質鍵（`"<part>:<preset>"`），**零件本身就是 paint-by-number 區域**。
  - 依零件類別給 4 個槽位：主體金屬、護木與槍托、握把、小零件。
  - 每個槽位對應一個顏色、一個粗糙度、一個金屬度。
- **成本**：最低，幾乎免費。

### 3.2 Hydrographic（水轉印）

- **真實工藝**：零件浸過水面上的印花薄膜。
- **Valve 定義**：
  - 圖樣**沿著武器原本的 UV 平鋪**，好比每個零件各自浸一次。
  - 4 色加圖樣，alpha 存耐久與遮罩。
  - 部分區域維持單色（G、B 遮罩）。
  - 直接磨到底材。
- **代表**：Crimson Web（紅底加蛛網水轉印，再上半光面漆）、Boreal Forest、Forest DDPAT、Bright Water、AK-47 Redline（碳纖水轉印加紅色細線轉印貼）。
- **程序化做法（無 UV）**：
  - 用**側投影**：沿 X 軸（槍的左右）投影到 (s, t) 側視平面。正好就是 `tools/assets` 作者建模時用的側視毫米座標系，所以「側投影」幾乎等於「作者畫側視圖時的 UV」。
  - 頂面、底面用低權重的 triplanar 補上。
  - 每個零件可以加上 `_bake.a`（零件亂數）當作額外偏移，模擬「各零件分別浸染、花紋不連續」的特徵。

### 3.3 Spray-Paint（噴漆模板）與 Halftone（半色調）

- **真實工藝**：用模板（膠帶、網子、紙板）多次噴漆。
- **Valve 定義**：
  - 4 色加圖樣，**triplanar** 投影。
  - **每層漆先磨到下一層，最後才露出底材**。
  - CS2 新增 `Bias Spray`：三個投影面互相有一點「過噴（overspray）」。並可個別調整槍背與槍頂的過噴量。
- **代表**：Urban Masked（膠帶模板）、Safari Mesh（網子加紙板）、Scorched（日光斑駁）、M4A4 Sheet Lightning。
- **Halftone 變體**（CS2）：
  - 網點密度由**武器凹處（cavity）圖**加上圖樣共同決定。
  - 可以選擇網點集中在凹處，或略過凹處。
  - R、G、B 三層網點可以各自旋轉角度，像印刷的分色網角。[官方]
- **程序化做法**：
  - triplanar 加 3 張閾值雜訊遮罩，對應三層。
  - 模板邊緣用 `smoothstep(t−w, t+w, n)`，w 取小值才有硬邊。
  - 過噴是在邊緣外側加一圈低頻雜訊的半透明帶。
  - Halftone 網點：`d = length(fract(R·p·freq) − 0.5)`，以 `d < radius(density)` 判定是否落在網點內。density 來自 `_bake.b` 加雜訊。
- **磨損**：多層閾值。上層的耐久最低，先被磨掉（第 9.6 節）。

### 3.4 Anodized（陽極、糖果漆）

- **真實工藝**：鋁陽極著色。槍用鋼材多半不能陽極，所以改在**鍍鉻底上罩一層透明糖果色**模擬。
- **Valve 定義**：1 色。paint-by-number 決定哪些區域陽極。**先磨到鍍鉻層，再磨到底材**。
- **代表**：M4A1-S Hot Rod（鍍鉻加透明紅）、Emerald 系列（鍍鉻加祖母綠糖果色）。
- **外觀關鍵**：本質是**有顏色的鏡子**。顏色飽和度高、粗糙度低（0.05–0.15），環境反射帶著色相流過。**非常依賴環境貼圖**。
- **程序化做法**：
  - `metalness=1`，`roughness≈0.1`，`baseColor = candy`。在 PBR 裡，金屬的 baseColor 就是 F0 反射色，等於「彩色鏡面」。
  - 磨損時先把 baseColor 換回鍍鉻 `#d6d8db`，第二段閾值才換成底材。

### 3.5 Anodized Multicolored（多色陽極）

- **Valve 定義**：
  - 4 色加圖樣，**沿 UV 平鋪**。
  - alpha 存粗糙度（0–127，數值反轉）與遮罩。
  - 直接磨到底材。
  - 金屬色建議落在 sRGB 180–250。
- **代表**：**Doppler 全系列**（黑銀大理石紋加糖果色）、**Marble Fade**（同一種大理石紋，改罩三色）、**Slaughter**（斑馬紋的鋁與鉻，罩番茄紅糖果漆）、AWP Lightning Strike、Desert Eagle Golden Koi（金屬箔鱗片）、M4A1-S Knight（黃銅鑲嵌）、Karambit Freehand（黑紫底加金屬麥克筆塗鴉）。
- **程序化做法**：見第 5 節各刀面配方。共通結構：
  1. 一個「金屬圖樣」決定**兩種反射率**的分布：黑金屬與銀金屬，或高光鉻與霧面鋁。
  2. 一層糖果色乘上去。
  3. 粗糙度隨圖樣變化，兩種反射率交錯，才有「貴」的感覺。

### 3.6 Anodized Airbrushed（噴筆糖果漆）

- **Valve 定義**：
  - 4 色加圖樣，**triplanar**（像隔著模板對前後左右上下噴）。
  - 部分區域維持單色。
  - **先磨到鍍鉻，再到底材**。
- **代表**：**Fade**（透明漆在鍍鉻底上互相漸變）、Amber Fade、Acid Fade、Desert Eagle Blaze（噴筆火焰）。
- **程序化做法**：漸層直接用**解析式**計算，沿刀身或槍身的旋轉軸方向（第 5.2 節）。邊緣用 fbm 抖動模擬噴筆的不均勻。

### 3.7 Patina（化學氧化）與 Case Hardening（淬火）

- **真實工藝**：
  - 化學反應在金屬表面形成硬化氧化殼，例如**滲碳淬火（case hardening）**、**冷藍（cold bluing）**、**酸蝕強制氧化**。
  - 淬火色來自**氧化薄膜干涉**：膜越厚，顏色依序從淡黃、稻草黃、褐、紫、深藍、淺藍，最後到灰藍。約 176–371 °C。[Wikipedia：Tempering]
- **Valve 定義**：4 色有固定語意。[官方]
  - `Base Metal`：被刮痕露出的原金屬。
  - `Patina Tint`：新的氧化色。
  - `Patina Wear`：老化後的氧化色。
  - `Grime`：凹處的油污與氧化物。

  再加一張全彩圖，沿 UV 平鋪，並支援法線。
- **CS2 新的 Case Hardening 類型**：[官方]
  - `Case Hardening Color Ramp`：**二維色帶**。X 軸是一個變體的色譜，Y 軸提供更多變體，增加隨機結果。
  - `Pattern Influence`：圖樣對色帶取樣的影響程度。
  - `Geometric Influence`：**武器幾何**對色帶取樣的影響程度。
  - `Ramp Offset`：Y 軸的隨機範圍。
  - `Case Hardening X/Y/Z/W`：可以讓淬火只作用在某些顏色層。
- **代表**：Case Hardened（木炭高溫淬火，藍、紫、金三色）、Blue Steel（冷藍）、Stained（用檸檬與芥末滴出的強制氧化斑）、Rust Coat（全面生鏽）、Damascus Steel、2026 年的 Desert Eagle Heat Treated（新版淬火）。
- **程序化做法**：
  - `h = PI·warpedNoise(p) + GI·geo + offset`，`color = ramp(h, row)`。
  - `geo` 可以用 `_bake.r`（AO）或 `_bake.g`（凸邊），或沿零件的高度。CS2 的 Geometric Influence 很可能就是這類量。[推論]
  - 詳見第 5.6 節。

### 3.8 Custom Paint Job（全彩手繪）與 Extended

- **Valve 定義**：
  - 全彩圖沿 UV 貼上，支援法線（浮雕）。
  - alpha 存耐久與遮罩，直接磨到底材。
  - 非金屬反照率 55–220。
  - **Extended 版**（2025-12-06 的 Workshop 更新）再加上 iridescence、glitter、overlay、金屬度遮罩。[官方：Valve 公告經 devtrackers 轉載]
- **代表**：Dragon Lore、Howl、Medusa、Asiimov、Hyper Beast、Neo-Noir、Printstream、Wild Lotus、Lore 刀、以及近年的 Inheritance、Head Shot、Temukau、Nightwish 等。
- **程序化做法（無 UV）**：
  - 手繪圖稿**沒辦法完全程序化**，但可以用「**側視圖投影＋向量圖形**」解決。
  - 作者在側視毫米座標（s, t）畫 SVG 或 Canvas 圖，轉成貼圖後沿 X 軸投影。左右兩側可以用不同圖：玩家看到的那一側（playside）放主圖，另一側放副圖。
  - 槍頂與槍底用延伸色或 triplanar 圖樣補上。
  - 幾何式的圖稿（Asiimov 的面板分割、Printstream 的黑白條帶）可以用 **SDF 在側視平面直接算**，完全不需要貼圖（第 10 節的「墨白」）。

### 3.9 Gunsmith（槍匠：Patina＋Custom Paint）

- **Valve 定義**：Patina 與 Custom Paint Job 的組合。一張「材質遮罩」決定哪裡是氧化金屬、哪裡是手繪漆。用來做**金屬雕花、槍托換木或換漆**等過去做不到的效果。[官方]
- **代表**：AWP Gungnir（珍珠光澤的藍與象牙白，奧丁之矛沿槍身延伸）、AWP The Prince（紅底加金色細絲雕花）、AK-47 Gold Arabesque（金色金屬加阿拉伯藤蔓手繪）、AK-47 Bloodsport、Karambit Autotronic（紅色陽極加減重鋼網）、AWP Desert Hydra（金蛇爬向槍口，槍管與槍托漆白）。
- **程序化做法**：
  - **區域二分**：金屬零件走 Patina 或雕花，護木與槍托走手繪或漆面。
  - 我們的零件材質鍵本身就能分出這兩區。
  - 雕花用「側投影的線稿 SDF」：線內是凹痕（法線擾動，加上 `_bake.b` 一樣的積垢色），線上是金。

### 3.10 CS2 的 SFX 三件套：珠光、閃粉、虹彩

| 效果 | Valve 描述 | 視覺 | 我們的作法 |
|---|---|---|---|
| **Pearlescent** | 表面顏色依「面向觀者的程度」沿色譜偏移色相，偏移量由 Pearlescent Scale 控制。對灰色、低飽和色**無效**。[官方] | Printstream 白底的粉、藍、紫流光；Gungnir 的藍與象牙白 | 在法線算完後（`normal_fragment_maps` 之後）做 HSV 色相旋轉：`h += scale·(1−N·V)`。白色要先帶極淡的色調，才看得出效果。成本很低。 |
| **Glitter** | 強度、尺寸、彩虹平衡、彩虹擴散（曲面上降低雜訊）。[官方] | Glock Fully Tuned 的金屬閃粉；M4A4 Hellish 的黑閃粉底 | 物件空間 3D 格子，每格一片「隨機法線的小鏡片」。只有片法線接近半角向量時才亮。彩虹＝每片給一個色相。遠處用 `fwidth` 淡出，避免閃爍（第 9.7 節）。 |
| **Iridescent** | 強度、頻率、色相起點。[官方] | 油膜、甲蟲殼。AK-47 Midnight Laminate「虹彩紫」、USP-S Spiral Glitch | 方案 A：`MeshPhysicalMaterial.iridescence`（薄膜干涉），再自己注入程序化的 `iridescenceThickness`。方案 B：低成本版，`hue = hueShift + scale·(1−N·V) + noise`，接著做 cosine palette。 |

---

## 4. 名品拆解：槍（含近年 CS2 新品）

> 「風格」欄依 pattern id 前綴判斷。描述是改寫自遊戲內說明文字的重點。中文為簡中官方譯名（轉繁）。

### 4.1 經典天價槍皮

| 造型 | 中文 | 風格 | 稀有度／float | 外觀重點 | 可借鏡的原則 |
|---|---|---|---|---|---|
| AWP \| Dragon Lore | 巨龍傳說 | cu | Covert／0–0.7 | 米褐底，**繩結紋巨龍**橫跨全槍，中世紀手抄本風格 | **一把槍、一隻巨獸、一種古典裝飾語言**。主體佔滿 playside |
| M4A4 \| Howl | 咆哮 | cu | **Contraband**／0–0.4 | 紅橘底加咆哮狼頭 | （反例）圖稿盜用後被重繪並停產（第 12 節） |
| AK-47 \| Fire Serpent | 火蛇 | cu | Covert／0.06–0.76 | 綠褐底，羽蛇神式火蛇纏繞 | **神話生物纏繞槍身**，沿著槍的長軸走 |
| AWP \| Medusa | 美杜莎 | cu | Covert／0–1 | 蛇髮女妖的畫像 | 神話題材的系列化（Gods and Monsters 收藏品） |
| AWP \| Gungnir | 永恆之槍 | gs | Covert／0–0.6 | **珍珠光的藍與象牙白**，奧丁之矛沿槍身延伸 | **珠光＋淺色＋金屬細節**＝高級瓷器感 |
| AWP \| The Prince | 王子 | gs | Covert／0–0.6 | **紅底加金色細絲雕花** | 「單一飽和底色＋金色細絲」是最便宜的奢華公式 |
| AK-47 \| Gold Arabesque | 黃金藤蔓 | gs | Covert／0–0.7 | 金屬部位全金，護木與槍托手繪阿拉伯藤蔓 | **金屬區與木質區分開處理**（Gunsmith 的本質） |
| AK-47 \| Wild Lotus | 野荷 | cu | Covert／0–1 | 綠底加手繪橘色蓮花 | 互補色（綠與橘）加花卉 |
| AK-47 \| Case Hardened | 表面淬火 | aq | Classified／0–1 | 金、藍、紫淬火斑 | **圖樣彩票的代表**：seed 661 是傳說級藍寶 |
| AWP \| Asiimov | 二西莫夫 | cu | Covert／**0.18–1** | 白、橘、黑的科幻面板 | **幾何面板分割**＋一個亮色點綴。磨損後露出黑色，反而更有味道 |
| AWP \| Hyper Beast | 暴怒野獸 | cu | Covert／0–1 | 迷幻配色的怪獸 | 高飽和互補色，像「黑光燈海報」 |
| M4A4 等 \| Neo-Noir | 黑色魅影 | cu | Covert | **灰階背景加上藍、洋紅雙色的人物** | **雙色調（duotone）＋灰階**，在任何光線下都好讀 |
| M4A1-S、Desert Eagle、USP-S、AWP \| Printstream | 印花集 | cu | Covert | **黑白強對比圖形加珍珠光高光** | 黑白已經夠貴；珠光讓白色在轉動時泛彩 |

### 4.2 CS2 近年新品（2024–2026）透露的趨勢

| 年份與收藏品 | 代表 | 外觀重點 |
|---|---|---|
| 2024 Kilowatt | AK-47 \| Inheritance（傳承） | **中國青花瓷＋台夫特藍陶**風格 |
| 2024 Kilowatt | AWP \| Chrome Cannon（鍍鉻大炮） | **鏡面鍍鉻漆**加多彩點綴，碳纖瞄具 |
| 2024 Kilowatt | M4A1-S \| Black Lotus | 藍紫底加黑蓮 |
| 2023 Revolution | AK-47 \| Head Shot | 塗鴉字加**珠光塗層** |
| 2023 Revolution | M4A4 \| Temukau | 日系動畫風 |
| 2024 Gallery | M4A1-S \| Vaporwave | 蒸汽波希臘雕像 |
| 2024 Gallery | Glock-18 \| Gold Toof | 粉紅握把加「金牙」 |
| 2025 Fever | AWP \| Printstream | 黑白加珠光 |
| 2025 Fever | AK-47 \| Searing Rage | 原生藝術（art brut）塗鴉 |
| 2025 Genesis | AK-47 \| The Oligarch | **奢侈品羽絨外套**質感加金色點綴 |
| 2025 Genesis | Glock-18 \| Mirror Mosaic | **鏡面馬賽克** |
| 2025 Genesis | M4A4 \| Full Throttle | 螢光綠甩尾改裝文化 |
| 2025 Boreal | AWP \| Green Energy | **綠色金屬閃片漆**加黃色條紋（CPJ Extended） |
| 2025 Radiant | AK-47 \| Nouveau Rouge | 酒紅與白底加金色點綴（Hydro Extended） |
| 2026 Dead Hand | AWP \| Queen's Gambit | 皇家藍與金，槍托前手繪皇后 |
| 2026 Dead Hand | Glock-18 \| Fully Tuned | 霓虹加**金屬閃粉** |
| 2026 Dead Hand | P250 \| Kintsugi | 象牙白底、橘色鳥加金繕 |
| 2026 Dead Hand | AK-47 \| Crane Flight | 黑白底、鶴加金色點綴 |
| 2026 Dead Hand | P90 \| Deathgaze | 卡拉拉大理石底加塗鴉梅杜莎 |
| 2026 Arabesque | AK-47 \| Consequence of the Jinn | 橘底加**高光澤金色火焰**與精靈 |
| 2026 Arabesque | AWP \| Sovereign Flame | 金色瞄具加全長火焰 |
| 2026 Arabesque | M4A4 \| Falak | 赤蛇加棕褐底 |
| 2026 Spy Tech | AK-47 \| AUTOEXEC | **高光澤藍粉漸層**加圖形 |
| 2026 Spy Tech | Glock-18 \| Ghost Protocol | 同一種紅色、**不同光澤度** |
| 2026 Spy Tech | USP-S \| Spiral Glitch | 珠光面漆 |
| 2026 限定 | AK-47 \| Aphrodite | 金屬漆機匣加**珍珠母貝**護木與槍托（Gunsmith＋Case Hardening） |

[資料：ByMykel/CSGO-API skins.json 的英文說明文字]
- 年份來源：
  - Revolution（2023-02）、Kilowatt（2024-02）、Gallery（2024-10）、Fever（2025-03）、Genesis（2025-09）、Dead Hand（2026-03）有社群報導。
  - Boreal、Radiant、限定款 Aphrodite、Arabesque、Spy Tech 的年份，是依資料中 paint index 的順序推估。[不確定]

**歸納出的「近年絢麗公式」**：

1. **一個主題，一種貴金屬點綴**。金色點綴幾乎無所不在。
2. **一種「特殊材質效果」當作賣點**：珠光、閃粉、虹彩、鏡面鉻、珍珠母貝、大理石、瓷器。
3. **用光澤差表現圖案**：例如 Ghost Protocol「同一種紅色、不同光澤度」。只靠粗糙度對比也能做出圖案，**轉動時才看得見**，非常高級。
4. **東方奢華題材增加**：青花、金繕、鶴、蓮。這直接支持我們走台灣廟宇工藝（交趾陶、剪黏、景泰藍、漆器）路線。
5. **漸層與高光澤面漆**（AUTOEXEC、Ice Coaled）延續了 Fade 的人氣，但改用霓虹配色。

---

## 5. 刀面名品詳解＋程序化配方

> 座標約定：沿用 `docs/WEAPON_MODELING.md`。物件空間中槍口或刀尖朝 **−Z**，上方 **+Y**，右側（拋殼側）**+X**。側視座標 `s = −z`（往前）、`t = y`（往上）。
> 依 `viewmodel.js` 的 `hip.pos.x = +0.11` 推算，第一人稱主要看到槍的**左側（−X 面）與頂面**，也就是我們的 playside。[推論：請用實機截圖確認]
> 以下色碼除非標 [官方]，都是 **[建議值]**，只用來描述風格，不是 Valve 的實際數值。

### 5.1 Vanilla（原鋼，無塗裝）

- **是什麼**：刀的出廠原色，沒有 float 和 seed。許多玩家偏好「像真刀」的樸素不鏽鋼。蝴蝶刀 Vanilla 價格不低。[社群]
- **為何好看**：好的金屬著色本身就夠美。緞面拋光的磨痕方向（沿刀刃）、刃口斜面（bevel）的亮線、刃根的細字刻印。
- **配方**：
  - 用現有的 `steel_bright`（brushed detail）。刃面與刃口斜面分成兩個零件：刃口 `roughness 0.12`，刃面 `0.28`。
  - 刷紋方向沿 −Z。現有的 triplanar 刷紋要依刀身方向旋轉。
  - **刃口斜面加一條極細的高光帶**：`_bake.g` 高的位置粗糙度再降 0.08。

### 5.2 Fade（漸層之色）

- **Valve 說明重點**：在鍍鉻底漆上，用噴筆噴透明漆，彼此漸變。只有 FN 和 MW（0–0.08）。
- **配色**：黃（金）→ 粉（洋紅）→ 紫（藍紫），斜向漸變。例如 Karambit「70/29/1」代表 70% 粉、29% 紫、1% 黃。玩家追求**粉紫多、黃少**的「全漸層」。[資料]
- **seed 規則**：偏移固定 −0.7，旋轉在 −55°～−65° 之間抽取。旋轉角決定刀面上看到多少黃，進而換算成 80–100%。[資料]
- **配方（解析式，非常便宜）**：

  ```glsl
  // 側視平面上的漸層方向：θ 來自 seed（例如 -55..-65°），範圍用刀身包圍盒算
  vec2 sp = vec2(-vObjPos.z, vObjPos.y);                    // (s, t)
  float g = (dot(sp, uFadeDir) - uFadeMin) / (uFadeMax - uFadeMin);
  g += (vnoise(vObjPos * 22.0) - 0.5) * 0.05;               // 噴筆不均
  g = clamp(g, 0.0, 1.0);
  vec3 candy = mix(uC0, uC1, smoothstep(0.00, 0.55, g));    // 金 -> 粉
  candy      = mix(candy, uC2, smoothstep(0.45, 1.00, g));  // -> 紫
  // anodized airbrushed：metalness=1, roughness≈0.10, baseColor=candy
  ```

- **色值建議**：金 `#e9b949`、洋紅 `#ff3fa4`、藍紫 `#6a4bff`。底材磨損時露出鍍鉻 `#d6d8db`。
- **我們的「100% 個體」**：讓 θ 在 seed 範圍內最極端的 1% 對應「全霞」稱號（第 10 節）。

### 5.3 Doppler（多普勒）＋ Phase 1–4 ＋寶石版

- **Valve 說明重點**：用大理石化介質畫上黑色與銀色金屬漆，再罩糖果色。Anodized Multicolored，只有 FN 和 MW。[資料]
- **相位是不同的 paint kit，不是 seed**。以 Karambit 為例：[資料]

  | 相位 | paint index | pattern |
  |---|---|---|
  | Ruby | 415 | `am_ruby_marbleized` |
  | Sapphire | 416 | `am_sapphire_marbleized` |
  | Black Pearl | 417 | `am_blackpearl_marbleized` |
  | Phase 1–4 | 418–421 | `am_doppler_phase1..4` |

  seed 只改變紋路的位置。
- **各相位外觀**（社群描述，彼此有出入）：[社群][不確定]

  | 相位 | 外觀 |
  |---|---|
  | Phase 1 | 偏暗，黑底加紫藍條紋，兩者大致均衡 |
  | Phase 2 | 粉、紫主導，最搶眼（社群稱 pink galaxy 的個體多在此相位） |
  | Phase 3 | 深藍與黑，帶綠色調。有些來源說它最暗 |
  | Phase 4 | 藍主導，帶少量紫 |
  | **Ruby** | 純紅加粉色調渦紋 |
  | **Sapphire** | 均勻的亮藍，最貴 |
  | **Black Pearl** | 深紫黑，帶**油膜般的虹彩光**。可能和 Phase 4 混淆 |

- **為何好看**：
  - 「黑」與「銀」兩種反射率交錯，再罩糖果色。轉動時，銀色區的顏色會隨環境反射**亮起又熄滅**，黑色區保持深邃。
  - 紋路是**流體大理石**，沒有方向性，任何角度都好看。
- **配方**：

  ```glsl
  // q：物件空間座標經 seed 變換（偏移＋旋轉）後的取樣點
  vec3 q = uSeedRot * (vObjPos * uPatScale) + uSeedOff;
  vec3 w = vec3(fbm(q), fbm(q + vec3(5.2, 1.3, 2.8)), fbm(q + vec3(1.7, 9.2, 3.1)));
  float m = fbm(q + 2.4 * w);                       // iq 的 domain warping
  float silver = smoothstep(0.42, 0.62, 0.5 + 0.5 * sin(9.0 * m + 3.0 * w.x));  // 黑/銀 大理石
  // 多色相位：用第二個低頻場在 2–3 個糖果色之間選擇
  float k = smoothstep(0.3, 0.7, w.y);
  vec3 candy = mix(uCandyA, uCandyB, k);
  candy = mix(candy, uCandyC, smoothstep(0.65, 0.9, w.z));
  vec3  base  = mix(uBlackMetal, candy, silver);     // 黑金屬 vs 上色的銀金屬
  float rough = mix(0.30, 0.08, silver);
  float metal = mix(0.75, 1.0, silver);
  ```

  - 黑色區不要用純黑。Valve 規定金屬反照率不得過暗，深灰 `#1c1a24` 搭配 metal 0.75 比較自然。
  - 「寶石版」＝ `uCandyA=B=C` 同一色，提高 silver 的覆蓋率，並減少黑色。
  - Black Pearl 類＝深色糖果，加上虹彩（第 3.10 節）。
- **效能**：三次加一次 fbm 太貴。**建議預烘**：啟動時用 JS 或 GPU 產生 512² 的平鋪 2D 貼圖，存 `R=silver`、`G=k`、`B=w.z`，片元著色器只需取樣 3 次（triplanar）。

### 5.4 Gamma Doppler（伽瑪多普勒）＋ Emerald

- 同樣是大理石糖果漆，把紫藍換成**綠、青綠、黑**。Phase 1–4 加上 **Emerald**（整面均勻深綠，沒有黑）。Phase 2 最綠。[社群]
- 2021 年起，Glock-18 也有 Gamma Doppler（含 Emerald）。**刀面工藝下放到槍**是一種常見的「讓槍皮也變貴」手法。AWP、M4A1-S 也有 Fade。[資料]
- **配方**：直接重用 5.3，只換調色盤。

### 5.5 Marble Fade（漸變大理石）

- **Valve 說明重點**：黑色與銀色金屬漆，用大理石化介質塗上，再罩**三色**糖果。[資料]
- **配色**：紅、黃、藍。
- **稀有圖樣**：
  - **Fire & Ice**：playside 上紅與藍直接相接、幾乎沒有黃。只看 playside。
  - **Tricolor**：三色都很明顯，但沒有紅藍相接。
  - 沒有「百分比」，靠目視分級。[社群]
- **配方**：5.3 的 silver 遮罩，加上 5.2 的漸層當糖果色。`g` 的偏移與旋轉由 seed 決定。「Fire & Ice」就是 `g` 的黃色區落在 playside 之外的那些 seed，可以離線算出來（第 9.9 節）。

### 5.6 Case Hardened（表面淬火）與 Blue Gem（藍寶）

- **Valve 說明重點**：用木炭在高溫下進行彩色滲碳淬火。屬於 Patina，float 0–1，旋轉 0–360。[資料]
- **外觀**：銀鋼底上浮著**金黃、藍、紫**的雲狀斑。藍色最稀有，所以「藍覆蓋率」決定價值。
- **為何天價**：
  - AK-47 seed 661 在 playside 幾乎全藍，2024 年 6 月以 StatTrak FN 的形式成交，據報導超過 100 萬美元。
  - Karambit seed 387 是刀類的傳說級個體。
  - 收藏者先看 playside，再看背面。[社群：csdb 指南；價格屬報導，[不確定]]
- **社群如何算「藍%」**：把模型全部塗綠，得到基準像素數。再把每個 seed 的藍色區遮罩起來，數像素比例。例：seed 661 約 64%。刀被手擋住的部分要扣除。[社群：pattern.wiki]
- **配方（我們版）**：

  ```glsl
  // 二維色帶 tRamp：X = 淬火色譜（鋼→淡黃→稻草→褐→紫→深藍→淺藍→灰藍），Y = 變體列
  vec3 q = uSeedRot * (vObjPos * uPatScale) + uSeedOff;
  float n = fbm(q * 0.7 + 1.6 * vec3(fbm(q * 0.45), fbm(q * 0.45 + 4.1), 0.0));
  float geo = (vBake.r - 0.5);                          // AO 當作「幾何影響」[推論]
  float h = uPatInf * n + uGeoInf * geo + uRampBias;
  vec3 temper = texture2D(tRamp, vec2(clamp(h, 0.0, 1.0), uRampRow)).rgb;
  float colored = smoothstep(0.18, 0.32, h);            // 低 h 保留原鋼色
  vec3 base = mix(uSteel, temper, colored);
  // metalness = 1, roughness ≈ 0.22～0.30, 磨損：刮痕露出 uSteel（Patina 規則）
  ```

- **色帶建議（依 Wikipedia 的回火色順序）**：鋼 `#9a9ea4` → 淡黃 `#d8c58a` → 稻草 `#c99a4f` → 褐 `#8c5a2e` → 紫 `#6a3d7a` → 深藍 `#2b3f8c` → 淺藍 `#4f86c6` → 灰藍 `#7a8ea3`。
- **多列色帶**：第 0 列偏金，第 1 列均衡，第 2 列偏藍（稀有）。`uRampRow` 由 seed 決定，並設權重。藍列的機率越低，「藍寶」越稀有。
- **重點**：淬火斑要**大塊、雲狀、邊緣有細碎飛白**。不要做成均勻雜訊。低頻 domain warp，再在邊界加一點高頻。

### 5.7 Crimson Web（深紅之網）

- **Valve 說明重點**：紅色底漆上做蛛網水轉印，再上半光面漆。Hydrographic，float 0.06–0.8。[資料]
- **稀有圖樣**：網心位置與數量。「**完整網心落在 playside 正中**」最值錢。
  - 三網心最稀有。M9 Bayonet 在 1000 個 seed 中約 45 個有三網。
  - Karambit 刀面短，1000 個 seed 裡沒有三網，單一置中網心就夠。[社群：SteamDB]
- **配方（解析式，側視平面）**：

  ```glsl
  float webLines(vec2 p, vec2 c, float spokes, float ringStep) {
    vec2 d = p - c;
    float r = length(d), a = atan(d.y, d.x);
    float sector = 6.2831853 / spokes;
    float f = fract(a / sector) - 0.5;                   // 扇區內位置 -0.5..0.5
    float spoke = abs(sin(f * sector)) * r;              // 到最近輻線的距離
    float poly = r * cos(f * sector);                    // 多邊形環（直弦）
    poly -= ringStep * 0.22 * (0.25 - f * f) * 4.0;      // 弦往中心下垂 -> 蛛網弧
    float ring = abs(fract(poly / ringStep + 0.5) - 0.5) * ringStep;
    float w = 0.0025 + 0.004 * r;                        // 越外圈線越粗
    return 1.0 - smoothstep(w, w * 1.7, min(spoke, ring));
  }
  // 1～3 個網心 c_i 由 seed 決定；顏色：紅 #8e1018 (metal 0, rough 0.38)，網 #0e0e10
  ```

  - 輻線角度加上每條獨立的抖動（`hash(i)·0.15`），才不會太工整。
  - 網只在側投影權重高的面（刀身兩側）出現，刀背用純紅。

### 5.8 Slaughter（屠夫）

- **Valve 說明重點**：用不同反射率的鋁漆與鉻漆畫成斑馬紋，再罩番茄紅糖果漆。Anodized Multicolored，float 0.01–0.26。[資料]
- **稀有圖樣**：斑紋偶然形成「**鑽石**」「**愛心**」形狀，越靠近刀面中央越值錢。[社群]
- **為何好看**：**全紅，但兩種光澤**。轉動時，高光區與霧面區交替亮起，看起來像流動的血。
- **配方**：

  ```glsl
  vec3 q = uSeedRot * (vObjPos * uPatScale) + uSeedOff;
  float z = sin(q.x * 6.0 + 2.5 * fbm(q * 0.8)) + 0.6 * sin(q.y * 3.0 + 3.0 * fbm(q * 1.3));
  float chrome = smoothstep(-0.15, 0.15, z);            // 斑馬：鉻 vs 鋁
  vec3 base = uCandyRed * mix(0.72, 1.0, chrome);       // #c4161c 一類
  float rough = mix(0.42, 0.07, chrome);                // metal = 1
  ```

### 5.9 Tiger Tooth（虎牙）

- **Valve 說明重點**：陽極成橘色，再手工蝕刻虎斑。Anodized，0–0.08。[資料]
- **外觀**：很亮、近乎鏡面的**橘金**，上面有細長的虎紋。虎紋呈淺色、偏霧，是蝕刻掉陽極層後露出的金屬。
- **配方**：
  - 底：`metal 1, rough 0.08, color #e9a13b`。
  - 虎紋：`stripe = smoothstep(.55,.6, fbm(vec3(q.x*0.6, q.y*5.0, q.z*0.6)))`，在垂直刀長方向拉伸。
  - 紋內：`color #f3e7cf, rough 0.30`。

### 5.10 Damascus Steel（大馬士革鋼）

- **Valve 說明**：「部分零件是大馬士革鋼」。Patina，0–0.5。CS2 改版後社群對它的觀感兩極，有人嫌 FN 偏暗偏髒。[資料][社群]
- **外觀**：深淺鋼層交錯的流水紋。真實鍛造紋有**流水、梯紋（ladder）、雨滴（raindrop）**等變化。
- **配方**：

  ```glsl
  float n = fbm(vObjPos * vec3(5.0, 5.0, 1.5) + uSeedOff);
  float ladder = 0.25 * sin(-vObjPos.z * uLadderFreq);       // 梯紋（可設 0）
  float b = sin(6.2831853 * (vObjPos.y * uBandFreq + n * uWarp + ladder));
  float bright = smoothstep(-0.25, 0.25, b);
  vec3  base  = mix(vec3(0.17, 0.18, 0.19), vec3(0.66, 0.67, 0.69), bright);
  float rough = mix(0.46, 0.20, bright);                      // metal = 1
  ```

- **教訓**：CS2 版本被嫌暗髒。所以**亮層要夠亮，暗層要夠光滑**，而不是一律加暗、加粗糙。粗糙度對比比顏色對比更重要。

### 5.11 Lore（傳說）

- **Valve 說明**：繩結紋手繪。Custom Paint，2016 年隨 Gamma Case 推出。[資料][社群]
- **外觀**：**金色凱爾特繩結**鋪滿刀身，底色依刀型不同（深色或象牙色）。磨損時金色剝落，露出深色鋼。
- **我們的原創替代**：用**回紋、雲雷紋、纏枝紋**取代凱爾特繩結。技法相同：
  - 以 Truchet 磚，或「側視平面的直角折線 SDF」產生連續回紋。
  - 線條部分：金 `#e6b85c`，`metal 1`，`rough 0.18`。
  - 底：朱漆 `#7a0e12`，`metal 0`，`rough 0.25`，加 clearcoat。
  - 對應第 10 節的「鎏金回紋」。

### 5.12 Autotronic（自動化）

- **Valve 說明**：陽極成紅色，並用鋼網減重。Gunsmith。[資料]
- **外觀**：亮紅陽極加上黑色六角或菱形網格，像碳纖或沖孔鋼板。紅黑配色。
- **配方**：
  - 六角格：`hexDist(p)`，標準 hex grid 距離函數。
  - 網孔內：黑 `#121214`，`rough .5`，再乘 `_bake.b` 加深。
  - 網條：紅色陽極 `#c8102e`，`metal 1`，`rough .1`。
  - 法線沿網條邊緣做小斜面，用 `dFdx/dFdy` 求高度場梯度即可。

### 5.13 其他經典刀面（速查）

| 刀面 | 風格 | 一句話外觀 | 程序化要點 |
|---|---|---|---|
| Ultraviolet | so | 黑加紫分件單色 | 零件分色 |
| Night | so | 夜戰灰黑 | 零件分色，低飽和 |
| Blue Steel | aq | 冷藍，帶藍紫光澤 | 回火色帶取「藍段」，加低頻雜訊 |
| Stained | aq | 檸檬加芥末滴出的氧化斑 | 滴流狀 Voronoi 斑，邊緣暗 |
| Rust Coat | aq | 全面生鏽，只有 BS 等級（0.40–1.0） | 鏽色 fbm，凸邊露出亮鋼 |
| Black Laminate | cu | 石洗刀身加黑色層壓握把 | 刀身用 stonewash（細碎 Voronoi 粗糙度），握把用層紋 |
| Freehand | am | 黑紫底加金屬麥克筆手繪 | 低頻曲線筆觸 SDF，筆觸處金屬度 1 |
| Bright Water | hy | 藍色迷彩水轉印 | 側投影迷彩 |
| Boreal Forest、Forest DDPAT | hy | 森林迷彩、數位迷彩 | 側投影迷彩、像素化 |
| Urban Masked | sp | 膠帶模板噴漆 | 三層閾值，硬邊 |
| Safari Mesh | sp | 網子加紙板模板 | 網格遮罩乘上大塊遮罩 |
| Scorched | sp | 日光斑駁 | 圓斑 Voronoi |

---

## 6. 手套（Gloves）

| 手套 | 中文 | 外觀 | 對我們手臂材質的套用方式 |
|---|---|---|---|
| Sport Gloves \| Pandora's Box | 潘朵拉之盒 | **黑加紫**運動手套，掌心印細紋 | `glove` 改黑、`glove_tip` 和 `glove_cuff` 改紫，掌心 `glove_palm` 用細紋 triplanar |
| Sport Gloves \| Vice | 邁阿密風雲 | **粉紅加青藍**技術布料，1980 年代邁阿密風 | 雙色撞色，cuff 粉紅、本體青藍 |
| Sport Gloves \| Hedge Maze | — | 綠加白 | — |
| Specialist Gloves \| Crimson Kimono | — | 黑底加紅色菱紋 | 菱格 SDF |
| Driver Gloves \| King Snake | — | 白皮加蛇皮 | Voronoi 鱗片 |
| Moto Gloves \| Spearmint | — | 白皮加紅縫線 | 縫線用細虛線 SDF |
| Specialist Gloves \| Fade | — | 多彩加金屬點綴 | 漸層加金屬片 |
| Hand Wraps \| Cobalt Skulls | — | 藍色斜紋帶加骷髏 | 側投影印花 |

[資料：skins.json 說明文字；中文為簡中官方譯名]

- **重點**：手套在第一人稱**永遠在畫面裡**，CP 值比槍皮還高。CS:GO 加入手套後，最熱門的都是**高對比撞色**：黑紫、粉藍、綠白。
- **我們的手臂**：已經拆成 `glove`、`glove_cuff`、`glove_tip`、`glove_pad`、`glove_palm`、`knuckle`、`sleeve` 等材質。等於現成的 paint-by-number 區域。手套造型只要提供「每個區域的顏色、粗糙度，加上一種圖樣」即可。

---

## 7. StatTrak、Souvenir、貼紙、吊飾、命名牌

### 7.1 StatTrak™（擊殺計數器）

- **外觀**：
  - 槍上裝一個**橘色 LED 數字顯示模組**，6 位數。超過 999,999 會看起來歸零，但庫存仍保留實際數字。
  - **刀的擊殺數則蝕刻在刀身上**。
  - 庫存框為橘色。
  - 不是原持有者使用時，LED 會在「擊殺數 / ERROR / UNKNWN USER」之間輪播閃爍。
  - 庫存展示時，若還沒有擊殺，會輪播 0–9。[社群：counterstrike.fandom StatTrak 條目]
- **為何有效**：
  - 數字在第一人稱一直看得到。
  - **每次擊殺數字跳一下**，是很強的微回饋。
  - 自己的戰績刻在武器上。
- **我們的版本「斬數計」**：
  - **VFD 真空螢光管，青綠色 `#4dffd2`**。和 StatTrak 的橘色 LED 區隔，也符合災變後拾荒科技的感覺。
  - 7 段顯示直接用 shader 畫：在側投影平面內用 SDF 畫段，`emissive` 強度約 3–4，進 HDR 後會有 bloom。
  - 跳號時亮度先衝到 6，再在 120 ms 內回到 3。數字滾動用 80 ms 的「翻牌」效果。
  - 統計「淨化數」（殭屍擊殺），Boss 擊殺另顯示一顆小圖示。
  - 近戰武器改成**刻字**：側投影的字形 SDF，凹刻處加上積垢色。
  - 計數器要做成**實體零件**，裝在 socket 上，例如槍身左側（playside）的護木前段。

### 7.2 Souvenir（紀念品）

- 從錦標賽紀念包取得，**金色標籤**，附帶該場比賽的隊伍與選手貼紙。Souvenir 和 StatTrak 互斥。[社群]
- **我們的版本「戰役紀念」**：
  - 在高難度 Boss 戰掉落。武器帶金色名牌，並固定貼上「該季 Boss 擊破紀念」貼紙。
  - 只在 PvE 合作通關時取得，強化共同記憶，例如「與某某一起擊破第 3 季魔像王」。

### 7.3 貼紙（Stickers）

| 類型 | 外觀（Wiki 描述） | 程序化做法 |
|---|---|---|
| **Paper** | 標準亮面貼紙，有紙背。刮除時先露出紙背 | 貼花加一層紙白色磨損層 |
| **Glossy** | 標準亮面，無背。刮除時直接露出底下的塗裝 | 貼花，磨損時直接透出 |
| **Glitter** | 碎裂紋理，產生局部的全像閃光 | 閃粉片（第 3.10 節）限定在貼紙內 |
| **Holo** | 多層紋理形成全像效果，不同區域可以用不同的全像圖樣 | 依 `N·V` 加位置產生彩虹（cosine palette），乘上「全像遮罩」 |
| **Foil** | 額外的法線貼圖，呈現浮雕與金屬感 | 貼花加法線浮雕，`metal 1` |
| **Gold** | Foil 的金色版 | 同上，色 `#e3b04b` |
| **Lenticular** | 光柵效果，隨視角**換圖**或產生深度錯覺 | 依 `dot(V, tangentX)` 在 2–4 張子圖之間切換或混合 |

- **規則與歷史**：
  - 一把槍最多 **5 張**。
  - 2024-02-06 的「A Call to Arms」更新後，可以**自由選擇位置與旋轉角**，放置時能縮放檢視。但只能貼在顯示出來的那一側，貼上後不能移動。[社群：Primagames、Beebom]
  - 刮除（scrape）會逐步磨損貼紙，有些貼紙刮到底會出現**彩蛋字**。
  - 2024 年 10 月起，貼上前可以預覽刮除程度。[社群]
- **反例**：自由擺放上線後，有玩家用貼紙拼出歧視字眼。**開放自由擺放就要準備檢舉機制**。若只在本機顯示，風險較低。[社群]
- **我們的實作**：
  - 物件空間「**盒狀投影貼花**」：每張貼紙存一個 `mat4`（位置、旋轉、尺寸）。shader 把 `vObjPos` 變換到貼紙空間，`|x|,|y| < 0.5` 且法線大致朝向投影方向時才取樣。
  - 5 張貼紙可以打包成一張 atlas，用 5 個 uniform 矩陣。只在 viewmodel 啟用。
  - 我們的貼紙題材：廟會、夜市、在地生物（台灣藍鵲、石虎）、災厄前線各季 Boss。

### 7.4 吊飾（Charms／Keychains）

- 2024-10-02 的「The Armory」更新加入。
  - 一把武器掛 **1 個**，可以拖曳到任意位置。卸下要用 Charm Detachment。
  - 吊飾用**自己的布偶（ragdoll）物理**擺動。10 月 8 日的修正讓物理更貼合武器動畫。
  - 腳步聲響起時，吊飾也會輕輕一震。[社群：彙整 Valve 更新說明]
- **為何有效**：
  - 物理擺動讓第一人稱畫面「活起來」。
  - 檢視、開火、奔跑時都會晃，是**最便宜的動態裝飾**。
- **我們的版本**：
  - **平安符**、**香火袋**（紅布金字）、**風獅爺**（金門，呼應 03 的民俗主題）、**珍珠奶茶**、**小籠包**、**台灣黑熊**。
  - 物理用 2–3 節 Verlet 繩，加上末端剛體。輸入是 viewmodel 的加速度（後座力、bob、轉向）。每幀約 10 次運算。
  - 開火時給一個衝量。換彈插匣時給一下脈衝。腳步聲時給一個小衝量（學 Valve）。

### 7.5 命名牌（Name Tag）

- 改名並加上描述。在 UI 顯示為「"自訂名" (原名)」。PvE 合作時可以顯示在隊友的擊殺通知裡，例如「阿明的『外婆的菜刀』擊殺了 Boss」。

---

## 8. 檢視動畫（Inspect）：為什麼爽，以及我們怎麼做

### 8.1 CS2 各刀型的拔刀與檢視動畫（社群整理）

| 刀 | 拔刀（Draw） | 檢視（Inspect） | 稀有或特殊版本 | 評價重點 |
|---|---|---|---|---|
| **Butterfly**（蝴蝶刀） | 兩片握柄繞刀身分段翻轉後入手 | 持續翻轉 | 3 種檢視、2 種拔刀 | 公認第一。翻轉本身就是常態，不是稀有事件 |
| **Karambit**（爪刀） | 轉進反手握，弧刃朝下 | **食指套環旋轉** | 可延長旋轉 | 比蝴蝶刀「收斂」，弧刃一直在視野內，有催眠感 |
| **Talon**（錫爪刀） | 與 Karambit 相同 | 繞指旋轉，**按住可以一直轉** | 2025-08 起改得更跟手 | 「持續轉」的 fidget 感 |
| **Kukri**（廓爾喀刀，2024-02 加入） | **兩種拋接式拔刀**，寬刃可見 | 較簡單 | 第二種拔刀 | 拔刀就是表演 |
| **Skeleton** | 一般拔刀很安靜；稀有拔刀會旋轉 | 刀從握柄鏤空處繞指轉 | 稀有繞指轉 | 稀有版本很強 |
| **Stiletto** | 彈簧刀「啪」一下彈開 | — | **稀有拋接** | 小刀配大動作 |
| **Ursus** | 拋起後空中接住 | — | 稀有的拋接雜耍 | 拔刀是最大賣點 |
| **Classic** | 致敬 1.6 | 閒置時用刀背敲手 | **稀有：拋向空中再接住** | 懷舊 |
| **Falchion** | 普通 | **稀有：刀平衡在掌心** | — | 被低估 |
| **Nomad** | 稀有拔刀：接住、手一縮、再恢復 | 稀有：指間撥轉小刃 | — | 有「人味」的失誤感 |
| **Paracord** | 普通；稀有拋接拔刀 | 兩種獨有檢視 | — | 便宜又有變化 |
| **Bowie** | 寬刃往下轉入手 | 大刃塞滿畫面 | — | 「巨大」本身就是表演 |
| **M9 Bayonet、Bayonet** | 樸實 | 安靜 | — | 適合「純看塗裝」 |
| **Flip、Navaja** | 折刀快速彈開 | 簡短 | — | 開刀聲很療癒 |
| **Shadow Daggers** | 雙刃展開 | — | — | 雙持的辨識度 |
| **Huntsman、Gut、Survival** | 快速轉入手 | 較少動作 | Survival 有大幅度縱向轉的另一種拔刀 | — |

[社群：Hotspawn、Tradeit；兩篇的排名與細節略有出入]

- 2025-07-28：CS2 把所有第一人稱動畫改到 **AnimGraph2**，包括拔槍、換彈、射擊、檢視。8 月的更新又修了 Classic 的檢視、Stiletto 與 Butterfly 的拔刀、Talon 的 fidget 反應。可見刀的動畫是 Valve 持續維護的重點。[社群：Gfinity、Sportskeeda]
- 社群文章提到，CS2 的 bug 曾讓某些刀「**稀有拔刀變成每次都出現**」，玩家反而抱怨。**稀有就要稀有**。[社群，來源品質偏低][不確定]

### 8.2 蝴蝶刀（balisong）動作詞彙（給動畫師）

| 術語 | 動作 |
|---|---|
| Basic open／close | 基本開合 |
| Fan | 繞拇指或食指連續旋轉 |
| Y2K／Zen rollover | 刀繞手背翻滾。兩者的定義社群說法不一 |
| Chaplin | 繞單一手指旋轉，手指夾在刀背與安全握柄之間 |
| Aerial | 放手讓刀在空中轉一圈後接住 |
| Ricochet | 擺動方向急轉 |
| Twirl | 握柄在手指間交替穿過 |
| Knuckleduster | 繞手的快速空翻 |

[社群：knifepivotlube 等。這些是現實的通用術語，不涉及 Valve 的設計]

### 8.3 爽感的五個來源（設計原則）

1. **反光掃過刀面（specular sweep）**：
   - 檢視的核心目的是讓**環境反射帶狀地滑過金屬面**。漸層、多普勒、陽極這類「彩色鏡子」只有在反射移動時才會發光。
   - 動畫要包含一段**慢速傾轉**，約 0.4–0.8 s，刀面相對相機轉 15–25°。
2. **快—停—快的節奏，加上「定格」**：
   - 旋轉用 ease-out 收在一個停格（80–150 ms），同時配一聲金屬「喀」。
   - 停格時刀面正對鏡頭：**招牌畫面（money shot）**。
3. **音效對拍**：
   - 開刀卡榫的 2–3 個清脆瞬態、握柄互碰聲、套環轉動的「咻—」、刀刃的金屬餘音（3–5 kHz 帶）、手套摩擦的布料聲。
   - 每個關鍵影格都要有聲音。
4. **變化與稀有**：
   - 2–3 種一般檢視，加一種**稀有檢視**（拋接、指間翻、掌心平衡），機率約 1/10。[建議值；Valve 的實際機率未公開][不確定]
   - 稀有版本不要因為 bug 而變成常態。
5. **掌控感**：
   - 開火、瞄準、換彈、切換武器都能**立即取消**檢視，不影響戰鬥。
   - **按住檢視就一直轉（fidget loop）**，放開後接上收尾動作。
   - 手機上可以做成「長按檢視鍵」。
   - 動畫中**不要**有相機震動或 FOV 變化，觀看要穩定。

### 8.4 用我們的 clip 系統寫刀檢視（關鍵影格草稿）

`game/src/player/clips.js` 已經有正規化時間軸的 track 系統，包括 `gunPos`、`gunRot`、零件 `.rot` 與事件 `snd`。以下是**爪刀式套環旋轉檢視**的草稿，約 3.4 s，需要新增一個 `ring` socket 當作旋轉樞紐。[建議值]

```js
export function knifeRingInspect() {
  return {
    tracks: {
      // 1) 0.00-0.14 舉起，刀面朝鏡頭  2) 0.14-0.34 慢速傾轉讓反光掃過
      // 3) 0.34-0.58 套環轉兩圈（720°）ease-out，0.58 定格「喀」
      // 4) 0.62-0.84 翻到背面展示       5) 0.84-1.00 收回
      gunPos: [[0, Z3], [0.14, [-0.06, 0.05, 0.05], 'out3'], [0.34, [-0.065, 0.055, 0.05]],
               [0.58, [-0.06, 0.05, 0.05]], [0.84, [-0.05, 0.04, 0.04]], [1, Z3, 'inOut']],
      gunRot: [[0, Z3], [0.14, [10, 35, -22], 'out3'], [0.34, [-6, 50, -18], 'inOut'],
               [0.62, [-4, 45, -20]], [0.84, [6, -140, 20], 'inOut'], [1, Z3, 'inOut']],
      'ring.rot': [[0, Z3], [0.34, Z3], [0.58, [0, 0, 720], 'out3'], [1, [0, 0, 720]]],
    },
    events: [[0.10, 'snd', 'cloth'], [0.36, 'snd', 'ringWhirr'], [0.58, 'snd', 'bladeClick'],
             [0.70, 'snd', 'bladeRing'], [0.86, 'snd', 'cloth']],
    loop: [0.34, 0.58],   // 長按檢視時重複這段（fidget）。放開後從 0.58 接收尾
    rare: { chance: 0.1, clip: 'knifeTossCatch' },
  };
}
```

- **蝴蝶刀**需要兩片握柄零件（`handleA.rot`、`handleB.rot`）繞刀根樞紐轉 0–180°。檢視流程建議：Basic open → Fan ×2 → 定格 → Chaplin → 稀有時插入 Aerial → close。
- **檢視補光**：檢視期間把 viewmodel 材質的 `envMapIntensity` 從 1.0 拉到約 1.35。或對 viewmodel 材質個別設定 `envMap` 與 `envMapRotation`，緩慢轉動 Y 軸 20–40°，讓反射「流過」刀面。[建議值]
  - 依 r186 的 `WebGLRenderer.js`：材質的 `envMap` 為 null 而使用 `scene.environment` 時，three 會改用 `scene.environmentRotation`，也就是整個場景一起轉。所以 viewmodel 材質要**明確指定** `material.envMap = scene.environment`，`envMapRotation` 才會只作用在槍模上。（已查證 node_modules）
- **槍的檢視**：
  - 依序展示 playside、頂面（看貼紙與吊飾晃動）、斬數計跳一下亮度。
  - 現有的 `inspectClip()` 可以在中段加一段 0.3 s 的慢傾轉，讓珠光與虹彩流動。

---

## 9. 實作藍圖：在《災厄前線》的引擎裡做 CS2 式塗裝

### 9.1 架構

```
FinishDef（資料）  ──► uniforms + #define FINISH_STYLE
ItemInstance       ──► seed, float, counter, stickers[5], charm, nameTag
materials.js patch ──► map_fragment 之後：算塗裝層（albedo/metal/rough/層遮罩）
                   ──► normal_fragment_maps 之後：珠光色相旋轉、閃粉法線
                   ──► roughness/metalness：套用塗裝與多層磨損
                   ──►（Physical 變體）lights_physical_fragment 之後：注入 iridescenceThickness
```

- **材質快取鍵**：目前 `hardSurface()` 依 `key:vm:wear:tint` 快取，`customProgramCacheKey()` 只回傳 `'hs'` 或 `'hsvm'`。
  - 塗裝需要依風格**編成不同程式**：程式快取鍵改成 `'hs' + style`。
  - 同風格不同參數（seed、float、顏色）共用程式，只換 uniform。
  - 每把武器實例要**複製材質**（或用 `onBeforeRender` 換 uniform），因為 seed 與 float 是實例屬性。
- **Paint-by-number 區域**：從零件材質鍵推導。[建議值]
  - `steel*`、`alu*`、`chrome` → 金屬區。
  - `polymer*`、`wood*`、`bakelite*`、`paint_*` → 護木與槍托區。
  - `rubber`、`fabric*`、`glass`、`lens`、`glow_*`、`tritium`、`reticle_*` → **不塗**。
  - `brass`、`copper`、`gold` → 點綴區，維持原色或套 Color3。
  - 每個材質實例帶一個 `uRegion` uniform（0–3）。
- **playside**：塗裝定義可以指定 `playside: '-x'`。側投影時依 `sign(vObjNor.x)` 選主圖或副圖。

### 9.2 座標與尺度

- **側投影平面**：`sp = vec2(-vObjPos.z, vObjPos.y)`，單位是公尺。權重 `wx = triW(vObjNor).x`，頂面與底面用 triplanar 的 Y 投影補上。
- **正規化**：每把武器提供 `uBounds`（物件空間 AABB）。漸層與網心以「槍長的比例」定義，換到不同槍時看起來一致。
- **尺度**：
  - 依 Valve 的慣例，非 triplanar 圖樣以 0.91 m 為一張，triplanar 以 0.46 m 為一張。
  - 再乘上 `weaponScale = clamp(槍長 / 0.9 m, 0.35, 1.4)`。勾選 `ignoreWeaponSize` 時不乘。[建議值]
- **seed 變換**（CPU 端，每把武器算一次）：

  ```js
  function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  export function patternXform(seed, kit) {
    const r = mulberry32(seed * 7919 + kit.salt);
    const lerp = (a, b) => a + (b - a) * r();
    const ox = lerp(...kit.offX), oy = lerp(...kit.offY), rot = lerp(...kit.rot) * Math.PI / 180;  // 固定順序
    const extra = kit.extra ? lerp(...kit.extra) : 0;   // 例如淬火色帶的列、網心數
    return { ox, oy, rot, extra };
  }
  ```

  shader 端：側投影用 2×2 旋轉，triplanar 圖樣用繞 X 軸（槍的左右軸）的 3×3 旋轉，加上偏移。

### 9.3 雜訊工具箱

- 雜湊：Dave Hoskins 的〈Hash without Sine〉（Shadertoy 4djSRW），不依賴 `sin`，手機 GPU 上精度穩定。
- 值雜訊或 simplex，加 fbm（4–5 octave）。
- **Domain warping**：Inigo Quilez 的 `fbm(p + k·fbm(p))`，用於大理石、多普勒、淬火。
- **Voronoi**：F1（斑點、鱗片、剪黏碎片），F2−F1 或邊界距離（冰裂紋、景泰藍金線、龜裂）。
- **調色**：cosine palette `a + b·cos(2π(c·t + d))`，用於虹彩與全像；或 **1D/2D 色帶 DataTexture**，例如 256×4 的淬火色帶。
- **可濾波**：高頻圖樣（閃粉、網點、細紋）依 `fwidth()` 在遠處淡出，避免手機上閃爍（iq〈filterable procedurals〉）。

> **預烘或即時的判斷**：
> - 解析式（漸層、蛛網、六角網、回紋、7 段顯示）→ **即時計算**。
> - 多層 fbm 或 warp（大理石、淬火、鍛紋）→ 啟動時**預烘** 512² 的平鋪 RGBA8（像 `detail.js` 一樣產生），再用 triplanar 或側投影取樣。
>
> 這樣 viewmodel 的每個片元只多 3–6 次取樣，加上一些 ALU。

### 9.4 材質分層模型（以 CS2 為準）

```
底材 substrate（零件原本的 preset：鋼、鋁、聚合物）
  └─ 鍍鉻底 chrome base（僅 anodized 系）
      └─ 顏色層 C0..C3（paint 為非金屬；candy 為上色的金屬）
          └─ SFX：珠光、閃粉、虹彩（SFX 遮罩）
              └─ 可選 clearcoat（漆器、交趾陶、高光澤漆：AUTOEXEC 類）
```

- **Candy（糖果漆）**：`metalness 1`、`roughness 0.06–0.14`、`baseColor = candy`。依 Valve 指南，金屬色的亮度（最大通道）最好落在 sRGB 180–250。飽和色可以低到約 90。
- **Paint（漆）**：`metalness 0–0.1`、`roughness 0.25–0.6`，反照率 sRGB 55–220。
- **建議加一條 lint 規則**：在 `tools/assets` 檢查塗裝色值是否落在上述範圍，學 Valve 的 `mat_fullbright 10` 標紅標藍。過暗顯示藍色，過亮顯示紅色。
- **Clearcoat**：MeshStandardMaterial 沒有 clearcoat。高級造型（漆器、瓷器、高光澤）可以只在 viewmodel 改用 MeshPhysicalMaterial，開 `clearcoat 1`、`clearcoatRoughness 0.05`。three.js 官方文件說 Physical 的每像素成本較高，**只在 viewmodel、只在神品或極品使用**。

### 9.5 珠光、虹彩、閃粉的注入點（three r186）

- **珠光**：要在法線算完之後才做，因為需要 `N·V`。three 的 physical 片元著色器依序是 `map_fragment`、`roughnessmap`、`metalnessmap`、`normal_fragment_begin`、`normal_fragment_maps`，最後才是 `lights_physical_fragment`。`diffuseColor` 在 `lights_physical_fragment` 才被讀取，所以可以接在 `normal_fragment_maps` 後面修改：

  ```glsl
  // 接在 #include <normal_fragment_maps> 之後
  #ifdef FINISH_PEARL
    float facing = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0); // three 的視線向量
    vec3 hsv = rgb2hsv(diffuseColor.rgb);
    hsv.x = fract(hsv.x + uPearl * facing * pearlMask);
    diffuseColor.rgb = hsv2rgb(hsv);
  #endif
  ```

  three 的頂點著色器寫的是 `vViewPosition = -mvPosition.xyz`，也就是「從表面指向相機」的向量，正面時 `dot ≈ 1`。光照 chunk 裡的 `geometryViewDir` 也是同樣定義。（已查證 node_modules r186）
- **虹彩（Physical 版）**：
  - 設 `material.iridescence = 1`，讓 `USE_IRIDESCENCE` 被定義。
  - 再把 `#include <lights_physical_fragment>` 替換成「原 chunk 加一行」：`material.iridescenceThickness = mix(uIriMin, uIriMax, iriNoise);`。
  - 原本的 thickness map 需要 UV，我們改用程序化雜訊。r186 的 chunk 內確實是在這裡設定 `material.iridescenceThickness`（已查證 node_modules）。
- **閃粉**：

  ```glsl
  #ifdef FINISH_GLITTER
    vec3 gp = vObjPos * uGlitterScale;                    // 每公尺約 600–1500 格
    vec3 gi = floor(gp); vec3 gr = hash33(gi);
    float flake = step(length(fract(gp) - 0.5 - (gr - 0.5) * 0.35), 0.30);
    float aa = 1.0 - smoothstep(0.35, 0.9, length(fwidth(gp)));  // 太小就淡出
    vec3 tilt = normalize(gr * 2.0 - 1.0) * uGlitterTilt * flake * aa;
    normal = normalize(normal + mat3(viewMatrix) * (mat3(modelMatrix) * tilt));
    roughnessFactor = mix(roughnessFactor, 0.05, flake * aa);
    // 彩虹：Rainbow Balance 越低，flake 的 baseColor 越朝 hue(gr.x) 偏
  #endif
  ```

  我們的 HDR、ACES、雙濾波 bloom 管線（見 `engine/renderer.js`）會讓高光閃片自然泛光，這就是「bling」的來源。

### 9.6 磨損（float → 多層剝落）

- **輸入**：已經都有。
  - `_bake.g`：凸邊。
  - `_bake.b`：凹處。
  - `_bake.r`：AO。
  - `tGrunge`：R 汙漬、G 刮痕、B 鏽斑、A 崩漆。
- **float 對應**：[建議值]

  | 外觀 | float 範例 | wearAmount | 刮痕密度 | 凹處積垢 |
  |---|---|---|---|---|
  | FN | 0.02 | 0.05 | 0 | 0.15 |
  | MW | 0.10 | 0.25 | 0.2 | 0.25 |
  | FT | 0.25 | 0.55 | 0.5 | 0.45 |
  | WW | 0.40 | 0.8 | 0.7 | 0.6 |
  | BS | 0.70 | 1.2 | 1.0 | 0.85 |

  公式：`wearAmount ≈ 0.04 + 1.6·float^0.9`（上限 1.3）。
- **多層剝落**：

  ```glsl
  // wf：該點「容易被磨」的程度（凸邊＋崩漆雜訊＋刮痕）
  float wf = vBake.g * 1.2 + (grunge.a - 0.5) * 0.65 + grunge.g * 0.3 * uScratch;
  float T  = 1.35 - uWear;                                   // 磨損越高，門檻越低
  float lostTop  = smoothstep(T - 0.05, T, wf - uDur.w);     // 最上層（B）先掉
  float lostMid  = smoothstep(T - 0.05, T, wf - 0.18 - uDur.z);
  float lostBase = smoothstep(T - 0.05, T, wf - 0.36 - uDur.x); // 最後露出底材
  ```

  依風格決定掉落後露出什麼：[官方規則]
  - **Spray**：B 掉了露出 G，G 掉了露出 R，最後露出底材。
  - **Anodized 系**：糖果漆掉了先露出**鍍鉻**，再露出底材。
  - **Patina**：沒有「漆」可掉。刮痕處露出 `Base Metal`，凹處用 `Grime` 色，`Patina Wear` 隨 float 混入。
  - **Custom 與 Hydro**：直接露出底材。
- **耐久遮罩**：重要圖案（例如主題圖騰、斬數計周圍）的 `uDur` 調高，相當於 Valve 的 alpha 低於 128。
- **彩蛋**：Valve 有些造型在高 float 時會露出藏在刮痕裡的圖案，像 Asiimov 的黑、Hyper Beast 的怪獸。我們可以讓「底材」本身也帶一層圖樣，例如在鋼上蝕刻曙光工坊的徽記，**只有磨損時才看得到**。

### 9.7 效能預算（手機）

| 項目 | viewmodel（全功能） | 世界中的槍與第三人稱 |
|---|---|---|
| 塗裝層 | 預烘圖樣 3–6 次取樣，加解析式 | 平均色加 1 張低解析度 triplanar，或只用零件平均色 |
| 珠光 | 開 | 關 |
| 閃粉 | 開，依 `fwidth` 淡出 | 關 |
| 虹彩 | 低成本版（cosine palette）。神品才用 Physical | 關 |
| 多層磨損 | 開 | 只保留單層（現有 wearMask） |
| 貼紙 | 5 張盒狀投影 | 關（或 1 張） |
| 程式變體 | 每種 style 一個（9–12 個），**開場預熱編譯** | 共用 |

- 「低」畫質（`dpr 1.0`）時關閉閃粉，珠光保留。珠光幾乎不耗效能，而且最能撐起質感。
- **預熱**：所有塗裝風格的 program 在載入畫面就編譯好，避免第一次切槍時卡頓。03 第 4.15 節也提到光源數量變化會觸發重新編譯，原理相同。

### 9.8 資料結構（建議）

```js
// game/src/gfx/finishes.js（草稿）
export const FINISHES = {
  dusk_fade: {
    name: { zh: '落日漸層', en: 'Dusk Fade' }, style: 'airbrush', grade: 'exquisite',
    float: [0, 0.08], kit: { offX: [-0.7, -0.7], offY: [-0.7, -0.7], rot: [-55, -65], salt: 11 },
    colors: ['#d6d8db', '#e9b949', '#ff4f8b', '#5a46ff'], metal: [1, 1, 1, 1], rough: 0.1,
    sfx: { pearl: 0.0 }, chase: { type: 'fadePct', top: 0.01, title: '全霞' },
  },
  // ...
};
// 物品實例（存檔）
// { weapon: 'akm', finish: 'dusk_fade', seed: 412, float: 0.0213, kills: 0, stickers: [], charm: 'pingan_fu', tag: null }
```

### 9.9 稀有圖樣表：離線預算（我們的「藍寶、全霞、冰心」）

- 專案已經有 headless 渲染腳本，例如 `build/t/kittest.mjs`、`glbtest.mjs`。可以照 pattern.wiki 的方法：
  1. 對每把武器、每種有 chase 的塗裝，渲染 seed 0–1000 的 **playside 正視圖**（固定光照、固定 float=0）。
  2. 計算指標，例如：
     - 淬火：藍色像素佔比。
     - 漸層：旋轉角換算的百分比。
     - 三色釉：紅藍是否相接、黃色佔比。
     - 冰裂：中央最大格的面積。
     - 網：完整網心數與距離中心的距離。
  3. 輸出 JSON 排名表，前 1% 給**稱號與特效名牌**（例如「天青淬・壹等」）。
- 這也能拿來**驗證 seed 範圍設計**：例如調整淬火藍色列的權重，讓「全藍」約佔 0.5–1%。

---

## 10. 原創造型提案（模仿 CS2 風格，不抄設計）

### 10.1 品相（稀有度）梯

| 品相 | 對應的類型慣例 | 色碼 [建議值] | 典型風格 |
|---|---|---|---|
| 凡品 Common | 灰白 | `#a3adb8` | Solid、Hydro 迷彩 |
| 良品 Fine | 藍 | `#4f86e8` | Spray、Hydro |
| 精品 Superior | 紫 | `#7d5cff` | Anodized、Patina |
| 珍品 Precious | 洋紅 | `#d03fb8` | Multicolored、Gunsmith、Custom |
| 極品 Exquisite | 紅 | `#e0463a` | 招牌 Custom 或 Gunsmith，加 SFX |
| 神品 Divine（刀、手套專屬，名稱前加「◆」） | 金 | `#e8b23a` | 刀面名品系列 |

- 品相是「**造型**」的稀有度，和 03 第 5.2 節的「**武器**」稀有度（制式、反災、異能、神兵）是兩條獨立的軸。UI 上，武器稀有度放名稱左側的徽章，造型品相放卡片邊框，避免混淆。
- 色值刻意和 Valve 的 `#4b69ff`、`#8847ff`、`#d32ce6`、`#eb4b4b` 等錯開，但保留玩家熟悉的順序。

### 10.2 原創塗裝 26 款

| # | 名稱 | 風格 | 模仿的 CS2 風格原則 | 配色 [建議值] | 程序配方 | 品相 | 稀有圖樣（chase） |
|---|---|---|---|---|---|---|---|
| 1 | 夜梟 Night Owl | Solid | 分件單色（Night 類） | 霧黑 `#1c1d21`、槍鐵 `#3a3d42`、暗紫 `#3b2a4f` | 區域上色 | 凡 | — |
| 2 | 藍白拖 Blue-White | Solid | 撞色分件 | 藍 `#2f5fae`、白 `#e9ecef` | 區域上色，握把藍、本體白 | 凡 | — |
| 3 | 竹影 Bamboo Shade | Hydro | 森林迷彩水轉印 | `#4a5a3a` `#2f3b26` `#7d8f5a` `#c2b78a` | 側投影，竹節拉伸雜訊 | 良 | — |
| 4 | 黑潮 Kuroshio | Hydro | Bright Water 類的海洋迷彩 | 深藍 `#0f2a4a`、青 `#1d8fa8`、浪白 `#cfe8ef` | 側投影波紋 warp | 良 | — |
| 5 | 工地警戒 Hazard | Spray | 模板噴漆，層層磨損 | 黃 `#d9b21c`、黑 `#151515` | 斜紋模板，triplanar，過噴 | 良 | — |
| 6 | 西門網點 Ximen Halftone | Spray Halftone | CS2 半色調 | 洋紅 `#e2338f`、青 `#18b6d9`、黑 | 三層網點各自旋轉，凹處較濃 | 精 | — |
| 7 | 糖果紅 Candy Red | Anodized | 鍍鉻加糖果漆（Hot Rod 類） | `#c4161c` | 單色糖果，先磨到鉻 | 精 | — |
| 8 | 冰川藍 Glacier | Anodized | 同上 | `#2a7fff` | 同上 | 精 | — |
| 9 | 冷藍 Cold Blue | Patina | 冷藍（Blue Steel 類） | 藍黑 `#1d2740` 至紫藍 `#3b3f8f` | 回火色帶「藍段」加雜訊 | 精 | — |
| 10 | 海風鏽 Sea-Salt Rust | Patina | 只有 BS 的生鏽（Rust Coat 類） | 鏽 `#7a3b1c`、鋼 `#9a9ea4` | 鏽 fbm，凸邊露亮鋼 | 良 | — |
| 11 | 爐火淬 Forge Bloom | Patina＋CH | 淬火（Case Hardened 類） | 回火色帶（第 5.6 節） | 二維色帶，PI 與 GI | 珍 | **天青淬**：playside 藍覆蓋 ≥ 60% |
| 12 | 千層鋼 Thousand-Fold | Patina | 鍛造紋（Damascus 類） | 暗 `#2b2d31`、亮 `#a9adb3` | 帶狀 warp，可選流水、梯紋、雨滴 | 珍 | **雨滴紋**：特定 seed 出現圓斑 |
| 13 | 落日漸層 Dusk Fade | Airbrush | 三色漸層（Fade 類） | 金 `#e9b949`、珊瑚 `#ff4f8b`、靛 `#5a46ff` | 解析式斜向漸層 | 極 | **全霞**：最佳 1% 的旋轉角 |
| 14 | 極光漸層 Aurora Fade | Airbrush | 同上，冷色 | 青綠 `#19e3b1`、萊姆 `#7dff6a`、紫 `#6f4dff` | 同上 | 極 | 全極光 |
| 15 | 雷火 Thunderfire | Airbrush | 噴筆火焰或閃電（Blaze、Lightning 類） | 橘 `#ff7a1a` 至黃 `#ffd84a`，鉻底 | 火舌 SDF 沿槍管方向，加 fbm | 珍 | — |
| 16 | 星渦 Nebula Swirl | Multicolor | 黑銀大理石加糖果（Doppler 類） | 4 個相位：晚霞、極光、海淵、熔金 | 預烘大理石，糖果色選擇場 | 神（刀）／極（槍） | 寶石相（見下） |
| 17 | 星渦·寶石 Nebula Gem | Multicolor | 單色寶石相（Ruby、Sapphire、Emerald、Black Pearl 類） | **硃砂** `#d4202a`、**天青** `#2aa7ff`、**翡翠** `#10c060`、**墨玉**（深色加油膜虹彩） | 單一糖果，提高銀覆蓋率 | 神 | 本身就是 chase（掉落時約 5% 為寶石相）[建議值] |
| 18 | 三色釉 Tri-Glaze | Multicolor | 大理石加三色漸層（Marble Fade 類） | 朱 `#e0301e`、金 `#f2b632`、鈷 `#1e4fd8` | 星渦大理石乘上漸層 | 神（刀） | **水火**：朱鈷相接、金 < 5% |
| 19 | 朱砂錘紋 Cinnabar Hammer | Multicolor | 兩種反射率加紅糖果（Slaughter 類） | `#c4161c` | 錘紋（tsuchime）Voronoi 凹點：高光 vs 霧面 | 神（刀） | 心形或菱形錘斑 |
| 20 | 雲豹 Clouded Leopard | Anodized＋蝕刻 | 橘金陽極加蝕刻（Tiger Tooth 類） | 金橘 `#e9a13b`、蝕刻 `#f3e7cf` | Voronoi 環狀雲紋 | 神（刀） | 置中大雲斑 |
| 21 | 冰裂 Ice Crackle | Hydro 式 | 網心彩票（Crimson Web 類），改成汝窯開片 | 天青釉 `#9fc0b2`、裂線 `#3a4a44` | Voronoi 邊界加次級細裂，線寬隨格大小變化 | 神（刀）／珍（槍） | **冰心**：大格置中 |
| 22 | 墨白 Ink & Pearl | Custom | 黑白加珠光（Printstream 類） | 珍珠白 `#ece8e2`（帶淡紫 `#f1e9f5`）、墨 `#141416` | 側視 SDF 書法筆觸帶，加珠光 0.18 | 極 | — |
| 23 | 霓虹西門 Neon Noir | Custom | 灰階加雙色調（Neo-Noir 類） | 灰階、洋紅 `#ff2fa0`、青 `#22d3ff` | 灰階城市剪影 SDF，加 duotone 色帶 | 極 | — |
| 24 | 鎏金回紋 Gilded Meander | Gunsmith | 單色底加金細絲（Prince、Lore、Gold Arabesque 類） | 朱漆 `#7a0e12`、金 `#e6b85c` | 回紋 SDF。金屬區雕花，木區上漆，加 clearcoat | 極 | — |
| 25 | 景泰藍 Cloisonné | Gunsmith＋Extended | 奢華材質（Inheritance、Kintsugi 類趨勢） | 金線 `#d9a441`、松石 `#2fb5a8`、鈷 `#1f3fa8`、珊瑚 `#e0573f` | Voronoi 金線分格，格內琺瑯（高光澤加 clearcoat） | 極 | — |
| 26 | 交趾陶 Koji Glaze | Custom Extended | 東方瓷器風，結合廟宇工藝（呼應 03 九子神兵） | 赭黃 `#c98a1b`、翠綠 `#2f8f4e`、鈷藍 `#244aa5`、茄紫 `#5b2b5e` | 釉色色塊，加流釉 warp、細開片、clearcoat | 極 | — |

**Extended SFX 加碼款**（可以併入上表，或做成季節限定）：

- **藍眼淚 Blue Tears**：深海軍藍 `#0a1530` 底，加**青色閃粉** `#4dfff0`，Glitter Scale 高、Rainbow Balance 高（少彩虹）。神品刀限定時，閃粉帶極淡的自發光呼吸（0.3 Hz）。致敬馬祖藍眼淚。
- **寬尾鳳蝶 Swallowtail**：黑底，加**虹彩**青綠到紫的翅鱗。Iridescent Scale 中、Hue Shift 從青開始。
- **珍珠奶茶 Boba**：奶茶色珠光 `#c8a27a`，加黑色亮面圓點（Voronoi 圓），Clearcoat。做成限時活動造型。
- **剪黏 Jiannian**：Voronoi 碎瓷片，各片取廟宇釉色與不同法線，片間灰泥，片緣閃粉。

> **原創性檢查**：
> - 以上都是「**通用工藝或在地題材**」配上 CS2 的「**風格公式**」。不使用 Valve 的名稱（Doppler、Fade、Marble Fade、Slaughter、Tiger Tooth、Lore、Crimson Web、Printstream、Neo-Noir 等），也不仿製任何具體圖稿。
> - 「Case Hardening」「Damascus」「Anodized」是現實工藝名詞，可以使用，但我們一律用中文命名。

### 10.3 刀型（近戰）建議與檢視動畫

| 刀型（現實通用名） | 定位 | 檢視重點 | 稀有版本 |
|---|---|---|---|
| 蝴蝶刀 Balisong | 招牌、最貴 | Basic open → Fan → 定格 → Chaplin | Aerial 空翻 |
| 爪刀 Karambit | 次招牌 | 套環轉兩圈加定格 | 雙向急轉（Ricochet） |
| 山刀 Machete | 台灣在地感、寬刃 | 寬刃慢轉，讓反光掃過整片刃面 | 拋起後反手接 |
| 八斬刀 Butterfly Swords（雙持） | 雙持辨識度 | 雙刀交叉摩擦（金屬聲），再分開 | 雙刀同時翻轉 |
| 彈簧刀 Switchblade | 便宜但爽 | 「啪」彈開，加一聲 | 拋接 |

刀型清單與數值請以 03 第 5.4 節的近戰清單為準。這裡只補充外觀與檢視。

### 10.4 手套

| 手套 | 配色 | 說明 |
|---|---|---|
| **夜市霓虹** | 黑底，洋紅與青指尖，cuff 霓虹條 | 呼應 Vice 和 Pandora 的撞色 |
| **藍白拖** | 藍白撞色 | 搞笑但辨識度極高 |
| **廟會刺繡** | 紅底，金色刺繡雲紋 | 刺繡用凸起法線加金線 |
| **雲豹皮** | 皮革加雲豹斑 | — |
| **防疫工作手套** | 橘色丁腈，加白色反光條 | 末日題材 |

### 10.5 計數器、貼紙、吊飾

這三項已在第 7 節說明：
- 斬數計：VFD 青綠。
- 貼紙：七種材質，題材是在地元素加各季 Boss。
- 吊飾：平安符、香火袋、風獅爺、珍奶、小籠包、台灣黑熊。

### 10.6 取得方式與「彩票」的分寸

- 造型、float、seed 的隨機性可以保留收藏樂趣。但**付費開箱在台灣涉及機率型商品的資訊揭露規範**，屬於法務議題，上線前務必確認。[需法務確認]
- PvE 合作遊戲建議：
  - 造型主要從**成就、季票、Boss 首殺、合作任務**取得。
  - float 與 seed 在**取得時隨機**。稀有圖樣只換來「稱號、展示框」，**不影響數值**。
  - 可以考慮「**同款造型重複取得時，自動保留較稀有的那個個體**」，降低挫折。

---

## 11. 與 CSO 炫砲語言的融合（給 03 的神兵與異能）

1. **所有武器都有「塗裝槽」**：制式槍、反災系列都能套第 10 節的塗裝，這是 CS2 式的「材質層」。
2. **神兵（Mythic）有「本相」**：九子神兵出廠就帶固定的高級塗裝。例如狻猊用交趾陶加鎏金回紋，蒲牢用景泰藍加青銅淬火。每把另有 2–3 個「相」可解鎖（像 Doppler 的相位，但改成神獸的不同形態或配色）。
3. **自發光只放在能量部件**：符紋、核心、刀刃光，沿用 CSO 的就緒提示（03 第 1.2 節）。**槍身大面積交給材質**：糖果漆、珠光、淬火。兩者疊加後，靜止時像 CS2 的名品，開大招時像 CSO 的炫砲。
4. **檢視動畫兼顧兩者**：先慢傾轉讓材質反光流動（CS2），再讓能量部件亮起或變形一次（CSO），最後定格。
5. **計數器與吊飾不分稀有度**：所有槍都能裝，讓低稀有度武器也有個人化空間，降低「課金獨樂」的負面觀感（呼應 03 第 1.2 節的團隊光環思路）。

---

## 12. 風險與注意

1. **圖稿侵權有前例**：
   - 2014 年，M4A4 \| Howl 被發現使用了他人的畫作。Valve 重繪圖案、停止產出，把它改成唯一的 Contraband 稀有度，並封禁投稿者。
   - 同年 M4A4 Griffin 也重繪過。後來 AWP Doodle Lore 也因版權被替換。
   - 對我們的教訓：**委外或社群投稿的圖稿必須有原創聲明與檢核流程**。[社群：PC Gamer、Esports.net 等]
2. **名稱與商標**：
   - StatTrak™、Souvenir，以及 Doppler、Marble Fade、Printstream 等造型名，都屬於 Valve 的命名。我們一律不用。
   - 現實工藝詞（淬火、大馬士革、陽極、水轉印）可以用。
   - 本文不是法律意見。
3. **閃爍與鋸齒**：閃粉、網點、細紋在手機小螢幕上很容易閃爍（shimmer）。一定要用 `fwidth` 淡出，並在「低」畫質關閉。
4. **可讀性**：
   - Valve 指南提醒：純黑會比遊戲裡的陰影還黑，看起來像「壞掉」。過亮、過飽和的顏色會被誤認成光源。
   - 我們的殭屍場景偏暗，槍模不能太亮，否則會搶走畫面焦點。神品的自發光也要控制在 HDR 3–4 以下。
5. **效能**：Physical 材質、虹彩、clearcoat 只在 viewmodel 的頂級造型使用。所有變體都要預編譯。
6. **社群可信度**：
   - 價格（例如 Blue Gem 超過 100 萬美元）多為交易站或媒體報導，成交價與掛價常被混淆。
   - Doppler 各相位的描述，在不同來源之間互相矛盾。
   - 本文已標註 [社群] 或 [不確定]。
7. **稀有圖樣的「人工製造」感**：如果稀有圖樣能被精準計算，玩家會覺得是行銷操作。建議保持「**自然出現、事後才發現**」：先做規則，再用離線統計決定稱號門檻，不要反過來先決定機率再硬塞。

---

## 13. 來源

**Valve 官方**

- Counter-Strike Workshop – Weapon Finishes（各風格定義、隨機化、磨損範圍、尺度）：https://www.counter-strike.net/workshop/workshopfinishes
- Counter-Strike Workshop – Style Guide（可讀性、稀有度與顯眼度、第一人稱優先）：https://www.counter-strike.net/workshop/workshopstyleguide
- Counter-Strike Workshop – Resources：https://www.counter-strike.net/workshop/workshopresources
- CS2 Workshop Item Editor 說明文字 `toolhelp_cs2_item_editor_english.txt`（Paint Kit 參數：Pearlescent、Glitter、Iridescent、Overlay、Case Hardening Color Ramp、Halftone、Durability、Wear Range、PBR 反照率範圍），經 SteamDatabase 的遊戲檔追蹤庫取得：https://github.com/SteamDatabase/GameTracking-CS2/blob/master/game/csgo/pak01_dir/resource/toolhelp_cs2_item_editor_english.txt
- Valve Developer Community – CS2 Workshop Tools／Weapon Finishes（頁面回傳 403，內容經搜尋摘要取得）：https://developer.valvesoftware.com/wiki/Counter-Strike_2_Workshop_Tools/Weapon_Finishes
- CS2 Workshop 更新（2025-12，新增 Custom Paint Job Extended 與 iridescence，以及授權費制度）：https://devtrackers.gg/cs2/p/2e9adf15-cs2-workshop-update ；https://profilerr.net/workshop-update-for-cs2/

**物品資料與演算法**

- ByMykel/CSGO-API（items_game 的 JSON 鏡像：說明文字、pattern id、float 範圍、稀有度色碼、paint index）：https://github.com/ByMykel/CSGO-API （`public/api/en/skins.json`、`public/api/zh-CN/skins.json`）
- chescos/csgo-fade-percentage-calculator（Valve uniform random 的 TS 移植、Fade 與 Amber 與 Acid 的 paint kit 參數、抽取順序）：https://github.com/chescos/csgo-fade-percentage-calculator
- pattern.wiki：Pattern Colorization https://pattern.wiki/wiki/pattern_colors/ ；Pattern Offsets & Rotation https://pattern.wiki/wiki/pattern_offsets/ ；Template Transforms https://pattern.wiki/wiki/pattern_offsets/transforms ；Case Hardened Sorting https://pattern.wiki/wiki/case_hardened/ ；Skin Wear https://pattern.wiki/wiki/wear/ ；Skin Seeds https://pattern.wiki/wiki/skin_seeds/

**社群 Wiki 與攻略**

- Counter-Strike Wiki（Fandom，經 MediaWiki API）：Skins https://counterstrike.fandom.com/wiki/Skins ；StatTrak™ https://counterstrike.fandom.com/wiki/StatTrak™ ；Stickers https://counterstrike.fandom.com/wiki/Stickers ；Knife https://counterstrike.fandom.com/wiki/Knife ；Gloves https://counterstrike.fandom.com/wiki/Gloves ；Fade https://counterstrike.fandom.com/wiki/Fade ；Asiimov https://counterstrike.fandom.com/wiki/Asiimov ；Hyper Beast https://counterstrike.fandom.com/wiki/Hyper_Beast ；Skins/List https://counterstrike.fandom.com/wiki/Skins/List
- SteamDB – CS2 Doppler Phases Guide：https://steamdb.com/en/articles/cs2-doppler-phases-guide
- SteamDB – Crimson Web Patterns & Web Counts：https://steamdb.com/en/skins/cs2/patterns/crimson-web
- csdb.gg – Case Hardened & Blue Gem Guide：https://csdb.gg/guides/case-hardened-guide ；Most Expensive CS2 Skins：https://csdb.gg/guides/most-expensive-cs2-skins/ ；Cases：https://csdb.gg/cases/
- profilerr – Slaughter patterns：https://profilerr.net/cs2-slaughter-patterns-guide/ ；Crimson Web patterns：https://profilerr.net/cs2-crimson-web-patterns/
- SteamAnalyst – Marble Fade Fire & Ice：https://www.steamanalyst.com/guides/marble-fade-fire-ice ；Sticker types：https://www.steamanalyst.com/guides/sticker-types-explained
- cs.money – Finish styles：https://cs.money/blog/cs-go-skins/cs-go-skins-finish-styles/
- wecoach – Most expensive CS2 skins 2026（含 2025-10 Trade-Up 改版的影響）：https://wecoach.gg/blog/article/top-10-most-expensive-cs2-skins-in-2026
- Dexerto – Most expensive CS2 skins：https://www.dexerto.com/csgo/most-expensive-csgo-skins-1340162/
- Gfinity – CS2 cases in 2026（開箱機率、Fever、Gallery、Kilowatt）：https://www.gfinityesports.com/article/cs2-cases-in-2026-what-they-cost-what-you-can-win-and-whether-its-worth-it
- Hotspawn – All CS2 knife animations：https://www.hotspawn.com/counter-strike/news/all-cs2-knife-animations
- Tradeit – Best CS2 knife animations：https://tradeit.gg/blog/best-cs2-knife-animations/
- Gfinity – CS2 replaces all first-person animations（AnimGraph2, 2025-07）：https://www.gfinityesports.com/article/a-new-cs2-update-replaces-all-first-person-animations-makes-several-map-changes-
- Sportskeeda – CS2 patch notes 2025-08-27（刀動畫修正、Talon fidget）：https://www.sportskeeda.com/esports/cs2-patch-notes-august-27-2025-ancient-lineup-updates-animation-fixes
- Sportskeeda – Kukri Knife 與 Kilowatt Case（2024-02）：https://sportskeeda.com/esports/cs2-patch-notes-february-7-introducing-kukri-knife-kilowatt-case
- Beebom – 貼紙自由擺放更新：https://beebom.com/cs2-update-gun-stickers-arms-race-kilowatt/amp ；AFK Gaming – 貼紙濫用事件：https://afkgaming.com/csgo/news/cs2-players-are-exploiting-new-sticker-update-to-write-slurs-on-weapons
- GGRecon、Esports.net – The Armory 更新與吊飾：https://www.ggrecon.com/guides/cs2-november-2024-armory-update/ ；https://www.esports.net/news/counter-strike/new-cs2-update-weapon-charms-the-armory/
- PC Gamer – How a stolen skin became CS:GO's most legendary gun（Howl）：https://www.pcgamer.com/uk/csgo-howl-skin/2
- Escorenews – AWP Doodle Lore 因版權被替換：https://escorenews.com/en/csgo/news/43966-valve-replaces-awp-doodle-lore-in-game-due-to-copyright-issues-awp-duality-appears-in-user-inventories-instead
- knifepivotlube – Balisong 動作名稱：https://knifepivotlube.com/blogs/knife-pivot-lube/common-butterfly-knife-tricks-and-their-names

**渲染技術**

- three.js MeshPhysicalMaterial（iridescence、clearcoat 等參數與成本）：https://threejs.org/docs/pages/MeshPhysicalMaterial.html
- Inigo Quilez – Domain warping：https://iquilezles.org/articles/warp/ ；Voronoi edges：https://iquilezles.org/articles/voronoilines/ ；Cosine palettes：https://iquilezles.org/articles/palettes/ ；Filterable procedurals：https://iquilezles.org/articles/filterableprocedurals/ ；fBM：https://iquilezles.org/articles/fbm/
- Dave Hoskins – Hash without Sine（Shadertoy 4djSRW）：https://www.shadertoy.com/view/4djSRW
- Godot Shaders – Automotive Paint（Fresnel 雙色、閃片、clearcoat 結構）：https://godotshaders.com/shader/automotive-paint/
- Maxon Redshift – Flakes Shader（閃片法線隨機化原理）：https://help.maxon.net/r3d/maya/en-us/Content/html/Shader+Flakes.html
- Wikipedia – Tempering (metallurgy)（回火色與氧化膜干涉）：https://en.wikipedia.org/wiki/Tempering_(metallurgy)

**專案內部**

- `docs/research/03-weapons-feel.md`（CSO 炫砲機制、稀有度、九子神兵）
- `docs/WEAPON_MODELING.md`（座標約定、材質鍵）
- `game/src/gfx/materials.js`、`game/src/gfx/detail.js`（`_bake` 屬性、triplanar、grunge）
- `game/src/player/clips.js`、`game/src/player/viewmodel.js`（動畫 clip 格式、viewmodel 位置）
- `game/src/engine/renderer.js`（HDR、MSAA、bloom、ACES）
