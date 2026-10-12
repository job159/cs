# 05b｜克金武器的視覺與演出語言：CSO 頂級武器拆解 → 《災厄前線》可實作配方

> 研究目的：使用者要求「再多調研近年 CS 各種新的、絢麗的武器（克金武器），盡可能模仿該類型風格」。本文**只談「看起來、聽起來、拿起來為什麼這麼貴」**：輪廓、材質、配色、待機動態、拔槍／檢視／變形、開火演出、畫面效果、準星與 HUD、擊殺標記、音效，以及商店與轉蛋的包裝。機制與數值請看 `03-weapons-feel.md`（2.x 武器機制、4.x 手感、5.x 原創武器庫）。本文不重複那些內容。
> 研究日期：2026-10-12。對象：CSO（絕對武力 Online，Nexon 開發，台港由遊戲橘子代理）2019–2026 的 Epic／Legend／Transcendent 級武器，兼看 CrossFire（穿越火線，含手遊《槍戰王者》）的 VVIP／英雄級／王者級，以及 CS2 高價皮膚。
> 可信度標記（沿用 03 號文件，另加三種）：
> - **[Wiki]**：CSO 英文 Wiki（cso.fandom.com，用 MediaWiki API 取得原始碼）。
> - **[namu]**：namu.wiki 韓文條目（以內建瀏覽器讀取）。
> - **[CF Wiki]**：crossfirefps.fandom.com。
> - **[新聞]**：中國手遊媒體的體驗服爆料，正式服可能不同。
> - **[截圖觀察]**：本文作者親自檢視 CSO Wiki 上的遊戲截圖、商店預覽 GIF 與擊殺標記 GIF（已逐格拆開）後的描述。屬於第一手觀察，但只代表那一張圖或那一段動畫。
> - **[推論]**：根據多個例子歸納出來的規律，不是官方說法。
> - **[建議值]**：給我們遊戲的起始參數，需要實機調整。
> - **[不確定]**：來源不足或互相矛盾。
>
> **模仿的尺度**：我們模仿的是「**風格的文法**」，例如金屬配色比例、自發光節奏、演出順序、UI 包裝方式。不模仿「**具體的表現**」，例如 CSO 的武器名、Janus 雙面神頭像、Balrog 魔像、特定龍形擊殺標記、角色名與 Aegis 研究所世界觀。這一點與 `docs/WEAPON_MODELING.md` 第 7 條一致。

---

## 0. 重點摘要（TL;DR）

1. **克金感來自七個層次疊在一起**（本文稱為「克金七層」）：
   - ① 誇張的輪廓
   - ② 貴金屬加異材質
   - ③ 會呼吸、會流動的自發光
   - ④ 待機時也在動的零件與粒子
   - ⑤ 儀式化的拔槍、檢視、變形
   - ⑥ 專屬的開火、命中、擊殺回饋（含準星、HUD、擊殺標記）
   - ⑦ **社交可見度**：別人看得到、聽得到、在聊天室被廣播

   普通武器大多只做到 ①②。頂級武器七層全做。
2. **材質公式** [截圖觀察]：
   - 「**深色或白色底材 60%**＋**金色飾邊 25–30%**＋**單一主題色的自發光 8–12%**＋**一個英雄焦點**」。英雄焦點是寶珠、獸眼、核心或透明彈匣。
   - 近年出現的新材質：
     - 2025 Frost Viper 的「**虹彩菱格晶簇**」。
     - 2021 Divine Blaster 的「**白瓷加金箔碎紋加蜂巢發光**」。
     - Space Arbalest 的「**透明彈匣裡有金色銀河**」[Wiki]。
     - 2026 Divine Beast 的「**青綠鱗片瑞獸鑄金像**」。
3. **「夜光」是頂級的標誌**：
   - Transcendent 級全系列（只有一把例外）在黑暗中發光，並帶**鍍鉻反光**。轉動視角時，反光會在槍身上滑動 [Wiki]。
   - Magnum Drill Gold 在第三人稱也發光，因此「容易被別人盯上」[Wiki]。
   - 這是刻意的炫耀設計：**頂級武器不受地圖照明影響**。
4. **頂級武器的開火不是一閃就沒**：
   - Divine Blaster 的槍口焰是 45 格的序列：金色光束，加上**放射狀尖刺光冠**，再加上多層細圓環與金粒子 [截圖觀察]。
   - X-TRACKER 是第一把有**彩虹槍口焰**的武器 [Wiki]。
   - 我們的作法是讓頂級武器的槍口光暈停留 0.2–0.3 s，但**畫面中央必須保持乾淨**。
5. **全螢幕演出是近年主流**：
   - Frost Viper 的冰霜光線會把畫面變成**螺旋冰隧道** [截圖觀察]。
   - Sandalphon 會在螢幕上疊一個**巨大的符文法陣圈**，手掌上另有一個小法陣 [截圖觀察]。
   - Lycaon 發動時，畫面邊框泛藍光 [截圖觀察]。
   - Arcana VI 變形後有半夜視效果 [Wiki]。
6. **HUD 也是皮膚**：
   - 頂級武器**一律有「命中時準星提示」**[Wiki 多條]。
   - 每把武器的準星與計量條都是專屬設計：
     - Sandalphon：金色圓環加四顆青色寶石節點。
     - Death Cue：粉青雙色細準星加側邊弧形計量條。
     - Giga Break：槍旁浮著**六角形全息面板**，用箭頭圖示顯示狀態 [截圖觀察]。
7. **擊殺標記是「微型動畫」，不是圖示**：
   - CSO 超越級角色的專屬擊殺標記是 256×256、40 格的動畫 [截圖觀察]：
     - 例一：**火焰先畫出龍的輪廓**，接著身體填色、雲紋淡入，最後龍眼閃紅光。
     - 例二：霓虹貓臉帶**故障雜訊與色差**，最後雙眼變成星芒。
   - CrossFire 的作法：
     - VVIP 武器有專屬的擊殺、刀殺、爆頭標記。
     - **集滿整套才解鎖專屬擊殺標記與載入邊框** [CF Wiki]。
     - 手遊另有「**最終消滅**」特效：最後一殺時天降巨劍與光環 [新聞]。
8. **聲音是一半的價值**：
   - 頂級武器有**待機嗡鳴**；就緒時有**獸吼、笑聲、鈴聲**；搭配特定角色時有專屬語音 [Wiki]。
   - Psychic Harmonium 的待機動畫甚至會彈奏 Bach 的賦格 [Wiki]。
9. **包裝與變體的經濟學**：
   - **EX 對偶版**：光與暗、冰與火互為鏡像，例如梵天聖翼．迦樓羅 ↔ 墮天闇翼．薩麥爾。
   - **LE 限定版**：透明彈匣等細節差異。
   - **強化或覺醒換色**：Premium 強化滿級轉為紅、橙、黃、黑；Red Dragon Cannon 滿強化後火焰變冰藍 [Wiki]。CF 的「覺醒」改為**鎏金**外觀 [新聞]。
   - **套裝進度看得見**：西遊套裝的槍身燈色會隨裝備件數改變 [Wiki]。
10. **CS2 是另一種克金**：靠的不是特效，而是**材質抽獎與單件唯一性**。
   - Doppler 有 Ruby、Sapphire、Black Pearl 等相位。
   - Case Hardened 的藍寶石紋取決於圖樣種子。
   - 另有 StatTrak 計數器、可擺動的吊飾、貼紙的 Holo／Foil／Lenticular 材質。
   - 我們可以借「**每把神兵的釉紋種子都不同**」，搭配台灣剪黏與交趾陶美學。
11. **three.js 落地**：本專案已有自訂的 bloom 金字塔、合成著色器（`game/src/engine/renderer.js`），以及 `onBeforeCompile` 材質管線（`game/src/gfx/materials.js`，已有 `vObjPos` 與 `glowPulse`）。第 8 節提供可以直接接上的 GLSL 片段：
    - Fresnel 邊緣光
    - 物件空間流動紋路
    - 掃光
    - 全息投影
    - 虹彩
    - 假寶石
    - 視差銀河
    - 溶解
    - 光翼
    - 法陣
    - 合成層的元素邊框與徑向模糊

    第 8.14 節另附手機畫質分級。

---

## 1. 研究範圍與方法

| 來源 | 做了什麼 |
|---|---|
| CSO Wiki（MediaWiki API） | 抓取 Epic（28 把）、Legend（11 把）、Transcendent（約 100 把）分類清單，讀取約 80 個武器頁的 Overview、Trivia、Gallery。另讀 Transcendent Weapons、Kill FX、Paint、Weapon Enhancement、Weapon Modification、Epic Edition、各類 Decoder、Template:Grade，以及多個角色頁 |
| CSO Wiki 圖檔 | 下載並逐張檢視 22 張遊戲截圖或視角模型圖，並把 9 個 GIF（商店預覽、槍口焰、擊殺標記、頂級解碼器演出）**逐格拆成聯絡表**觀察 |
| namu.wiki | 讀「카운터 스트라이크 온라인/무기」「…/무기/에픽」「…/무기/에픽/2025년」（等級、販售年表、大廳標誌、翅膀造型、EX、LE） |
| CrossFire Wiki | VVIP System、Killmark、Weapon Customization、M4A1-S G Spirit、AK47-Beast Noble Gold |
| 中國 CF 手遊媒體 | 小米遊戲中心（火線論壇助手）2026-06、2026-07 體驗服爆料；17173（2026-03-28）CF 王者武器鑑賞 |
| CS2 | SteamDB 的 Doppler 相位說明、CSDB 貼紙等級、Armory 更新報導（2024-10）、檢視動畫更新報導（2024-12） |

**做不到的部分**：
- 台服（beanfun）2025–2026 的新武器中文公告沒有搜到，所以近年台服譯名只能取自 Wiki 的 altername 欄位。
- YouTube 影片沒有逐支擷取。
- 動畫時長以 GIF 格數推算，原始 fps [不確定]。

---

## 2. CSO 頂級武器的「包裝系統」

### 2.1 等級階梯與框色

namu 列出的收藏等級共 7 級，由低到高：
> 一般 → 高級 → 稀有 → 獨特 → 超越 → 傳說 → 史詩

史詩（Epic）是目前的最高級 [namu]。

CSO Wiki 的等級模板用「**上亮、下暗、左右中間調**」的斜角邊框，模仿遊戲內的道具格。各級配色如下 [Wiki：Template:Grade]：

| 等級 | 底色 | 邊框（左右／上／下） | 給人的感覺 |
|---|---|---|---|
| Rare 稀有 | `#2e363a` | `#1b6388` 單色 | 冷靜藍 |
| Unique 獨特 | `#392e2e` | `#7e3838` 單色 | 暗紅褐 |
| Transcendent 超越 | `#453f33` | `#cb8f0f` ／ 亮 `#fffbbf` ／ 暗 `#e4c75e` | **金** |
| Legend 傳說 | `#160923` | `#4c237f`、`#623a8c` ／ 亮 `#beb4d1` ／ 暗 `#988cb4` | **暗紫加淡紫光** |
| Epic 史詩 | `#462d3e` | `#ff1cc4` ／ 亮 `#ffb5ea` ／ 暗 `#930066` | **螢光桃紅** |

> 觀察：越高級的框，**上緣越亮、色相越飽和**，而且多了「高光邊」這一層。低階框是單色邊。這是一種很便宜但非常有效的「稀有度＝光澤度」語言。

### 2.2 推出節奏與變體（對收藏心理很重要）

- **一年兩把史詩**。「新年（근하신년）」款在 1–3 月販售，「夏季」款在 7–9 月販售 [namu]。
  - 新年款偏**東方題材**：火龍砲、冰蟒、2026 的瑞獸金幣。
  - 夏季款偏**西方神話與科幻**：Brionac（光之槍）、Lycaon（狼）、Naberius。這是 [推論]。
- **EX 對偶版**：原版推出約一年後，推出同骨架、配色或主題相反的版本 [namu、Wiki]。例子：
  - Divine Blaster（白金聖翼）↔ Doom Blaster（暗黑魔翼）
  - Twin Shadow Axes ↔ Twin Light Axes
  - Frost Viper（冰）↔ Demonic Viper（火紅加金加符文）
  - Gungnir ↔ Dark Star（台服名「霸雷槍．**血月**天誅」，只是重新上色）
  - Heaven Splitter（火）↔ Asura Hell Splitter（冰）
- **LE 限定版**（2026 起用「合成」取得）。外觀只有細節差異：
  - Giga Break 開發期是透明彈匣，正式版改成實心，2026-03 起**只有 LE 版恢復透明**[Wiki]。
- **Epic Edition 搭售**：與史詩同期的超越級，後來升為傳說級 [namu]。
- **重新上色的稱呼**：韓國玩家把「同模型、不同塗裝」的 EX 戲稱為「색칠놀이」（塗色遊戲）[namu]。玩家看得出只是換色，但仍然會買單，前提是**色相夠戲劇化**，例如冰變火、聖變魔。

### 2.3 命名也是包裝（台服譯名的固定句型）

台服的史詩名大多是「**四字稱號．一字或人名**」[Wiki altername]：

| 原名 | 台服 | 中國服 |
|---|---|---|
| Gungnir | 霸雷槍．天誅 | 斷域雷魂 |
| Divine Blaster | 梵天聖翼．迦樓羅 | 曙光輝翼 |
| Doom Blaster | 墮天闇翼．薩麥爾 | 暗黑魔翼 |
| Naberius | 噬魂狂嘯．終焉 | 碧魄蒼龍 |
| Quantum Horizon | 永恆極光．閃 | 逆界星輪 |
| Brionac | 曙光戰戟．燄 | 萬鈞神威 |
| Arbalest | 紫炫流光．無盡 | 破滅晶凰 |
| Gravity／Abyss Repulsor | 天穹破曉．銳／天裂蒼穹．緋 | 次元裁決／星淵裁決 |
| Twin Shadow／Light Axes | 天地之懼．荒／裂空之怒．燼 | 神鬼開天／魔神開天 |
| Dark Star（EX） | 霸雷槍．血月天誅 | 暗獄雷魂 |

- **規律**：
  - 前四字是「氣勢加元素」。
  - 後綴是一個字（閃、燼、燄、銳、緋、荒），或者一個神話名（迦樓羅、薩麥爾）。
  - EX 版沿用前綴，改後綴或加修飾詞（血月、赤）。
- **中國服的其他手法**：用【】前綴標主題，例如【青鸞】迅風輪、【命運】寂靜之音；也用★分隔，例如神罰★暴風眼、燼滅★覆域者。
- **我們可以用同一個句型，換成原創詞**：例如「鎮瀾神砲．蒲牢」「焚香獅吼．狻猊」。

### 2.4 社交可見度：讓別人知道你有

| 手法 | 實例 | 來源 |
|---|---|---|
| 暱稱旁的圖示 | 持有超越級主武器或角色時，**暱稱與房間名旁顯示 Buff 圖示**，滑鼠移上去可看持有清單 | [Wiki：Transcendent Weapons] |
| 第三人稱發光 | Magnum Drill Gold 與 Red Dragon Cannon Gold 在第三人稱也會夜光，鍍鉻效果其他玩家看得到 | [Wiki] |
| 大廳標誌 | 新年史詩的大廳標誌 2022 年起**加入動態效果** | [namu] |
| 翅膀造型 | 史詩碎片商店有**翅膀造型**，2023 年起翅膀帶特效 | [namu] |
| 全服廣播 | 從解碼器抽到東西時，聊天室會出現「○○ 從暗號解碼器獲得『××』」 | [截圖觀察：多張截圖的左下聊天欄] |
| 擊殺訊息圖示 | 每把武器都有專屬的擊殺訊息（kill feed）圖示。Sylphid 的圖示曾經方向畫反，Wiki 還特別記錄 | [Wiki] |
| 隊伍增益 | 超越級給全房間少量經驗或屬性加成，讓「別人也受惠」 | [Wiki；03 號 1.2 節] |

### 2.5 演進趨勢（2019 → 2026）[推論]

1. **從「真槍加裝飾」走向「只是勉強像槍的奇幻物件」**：
   - Lycaon 是狼頭圖騰。
   - Divine Beast 是瑞獸雕像加古錢。
   - Sandalphon 是手掌上的法陣。
2. **特效範圍越來越大**：從槍身發光，擴大到命中點的光柱，再擴大到全螢幕隧道或法陣。
3. **UI 被整合進武器**：浮空的全息面板、專屬準星、技能提示面板（Divine Blaster 的右側面板列出各技能與按鍵）[截圖觀察]。
4. **材質越來越多樣**：
   - 2019–2020 以金加黑加紅為主。
   - 2021 起出現白瓷金箔、霓虹機甲。
   - 2025 起出現虹彩晶簇、青鱗鑄金。
5. **召喚物越來越多**：從靈獸，到暗影士兵（Umbra 系列擊殺時出現影子特種兵）、狼群、天使與惡魔。

---

## 3. 視覺語言拆解

### 3.1 輪廓誇張：六種原型

| 原型 | CSO 實例（截圖觀察） | 設計手法 |
|---|---|---|
| **獸首或龍首** | Demonic Viper：金色龍或蛇頭，帶尖刺，**紅水晶眼**。Divine Beast：青鱗瑞獸雕像坐在槍管上，嘴含金幣。Lycaon：暗色狼頭，**洋紅發光紋與眼睛** | 把「臉」放在畫面右下視角模型的**上緣**，視線剛好掃得到。眼睛是**狀態燈**，就緒時發光 |
| **翼或刃翼** | Divine Blaster：淨化光翼。Brionac：充能時側面長出**半透明黃光刃翼**。Luminous Brionac：**藍色像素化全息翼**。Genocider VI：**太陽能板式機翼**展開 | 翼是「**形態切換**」的最佳視覺：平時收著，開大時展開。翼用**加算混合的半透明卡片**，不用實體模型 |
| **光環或法陣** | Sandalphon：手掌小法陣加全螢幕大法陣。鎖定標記是金色圓環加四顆青色寶石 | 法陣是「**範圍**」與「**神聖或魔法**」的通用語言。用旋轉的符文環表示持續中 |
| **晶簇** | Frost Viper：整把槍被**冰晶簇**包住，表面是**虹彩菱格紋** | 用尖晶體打破長方形輪廓。尖端**朝前**，帶出速度感 |
| **機甲裝甲** | Giga Break：紅色裝甲層層外翻，綠色自發光面板 | 用「**層疊外翻**」表現 Overflow 過載狀態 |
| **展開構件** | Genocider VI：兩側面板展開，中央是**三角剖分的黃色能量罩** | 變形的「前／後」差距越大越好 |

**輪廓規則** [建議值]：
- 頂級武器在視角模型中的**視覺體積**約是同類寫實槍的 1.3–1.6 倍。
- 主要的誇張量放在**畫面右側上緣**（機匣上方與前方）。
- 槍口前方 0.3 m 與準星周圍保持淨空。
- 尖刺與刃翼一律**朝前或朝外**，不朝玩家。

### 3.2 材質調色盤（實例）

| 武器（年） | 底材 | 飾邊 | 自發光 | 焦點 | 備註 |
|---|---|---|---|---|---|
| Divine Blaster（2021） | **白色陶瓷感烤漆** | **金箔碎紋**、金邊 | **蜂巢六角**黃白光 | 槍口金色光束 | 開火時金色電弧纏繞槍身，命中點有**金色光雨柱** [截圖觀察] |
| Naberius（2024） | **黑曜石或黑鉻**，帶紋理反光 | 粗金邊 | 藍、紫、綠**三色靈魂火焰飄帶** | 槍身中段的魂焰 | 飄帶不是附在槍上，而是圍繞槍身的**緞帶狀粒子** [截圖觀察] |
| Frost Viper（2025） | **虹彩菱格**（粉、藍、白會隨角度變色） | 銀灰機構 | 冰藍晶簇內光 | 雪花閃爍粒子 | 拔槍與換彈時白色鱗片會**變暗**，是由狀態驅動的材質變化 [Wiki] |
| Demonic Viper（2025 EX） | 黑 | **金** | **紅色符文文字沿槍身排列發光** | 紅水晶眼 | Wiki 記載設計來源：紅水晶與黑金細節來自 Umbra 系列，惡魔符文來自 Belial 的法環；瞄具內部是**真正的透明**而不是平面貼圖 [Wiki] |
| Giga Break（2026） | 紅色裝甲 | 槍鐵灰 | **萊姆綠**面板與線條 | 浮空全息六角面板 | 開火時綠色能量絲帶向前甩出 [截圖觀察] |
| Brionac（2024） | 黑鉻 | 金 | 橘色寶珠核心 | 黃光刃翼 | 技能是金綠色光之龍捲，帶環狀光帶 [截圖觀察] |
| Luminous Brionac（2026 EX） | **白銀裝甲** | 金環 | 紫色細線 | 藍色**全息格紋翼** | Wiki 記載配色與 Sylphid、Arcana V 同系 |
| Lycaon（2025） | 暗灰狼頭 | **放射狀金色日芒框** | 洋紅血管紋 | 中央**藍色寶珠**，外圍藍色全息圓環 | 發動 Phantom Rush 時有橘色火環，暗影狼影衝刺 [截圖觀察] |
| Divine Beast（2026） | 黑色槍管，帶**金色雲紋** | 鑄金 | （以實體材質為主） | 青綠鱗片瑞獸加方孔金幣 | 新年題材，用**實體貴材質**而不是發光取勝 [截圖觀察] |
| Space Arbalest（2024 EX） | — | — | — | **透明彈匣內是金色銀河紋理** | [Wiki] |
| Arbalest（2023） | 深藍黑 | 銀 | **紫色電路線** | **透明玻璃管彈匣發出洋紅光** | 洋紅雷射加粉色速度線，畫面上有兩片傾斜的半透明「瞄準括號」[截圖觀察] |
| Supreme Sentinel（EX） | — | 金色鍍鉻 | 青 | — | 金色鍍鉻的反射讓青色在遊戲中**變成土耳其藍** [Wiki]。**教訓：環境反射會改變色相，配色要在實際光照下驗** |
| Umbra 系列 | 黑 | 金 | **紅水晶** | — | 系列識別色。擊殺時出現**暗影特種兵**並開槍 [Wiki] |

**材質比例規則** [建議值，由上表歸納]：
- **60／30／10**：底材 60%（深色或白色），金屬飾邊 25–30%，自發光 8–12%。
- 自發光超過 15% 就會變成「玩具感」，因為 bloom 會吃掉所有細節。
- **只要一個英雄焦點**：一顆寶珠、一對獸眼、一根透明管，三選一。焦點的亮度比其他自發光高 1.5–2 倍。
- 金色分兩種：**亮金**（拋光，粗糙度 0.12–0.2）用在邊與浮雕；**暗金或古銅**（0.3–0.45）用在大面積。兩者並用才有層次。
- 「異材質」是近年的賣點：白瓷、晶體、透明彈匣、鱗片、黑曜石。**每把頂級武器至少要有一種寫實槍上不會出現的材質。**

### 3.3 元素與配色（觀察到的 CSO 慣例）

| 元素 | CSO 實例 | 觀察到的主色 |
|---|---|---|
| 雷 | Gungnir、JANUS-7、Thunderbolt、USAS-12 Thunderfall | 藍白電弧；Thunderbolt 是藍色尾跡；JANUS-7 B 模式的雷是**紅**而不是黃 [Wiki] |
| 聖光 | Divine Blaster、Sandalphon、Brionac、Eclipse Shifter（Wiki 記載是第 4 把「聖光」概念武器） | 白、金、淡黃，加青色寶石點綴 |
| 墮落或暗 | Doom Blaster、Belial、Twin Shadow Axes | 黑、紫、暗紅 |
| 冰 | Frost Viper、Asura Hell Splitter、強化版 Red Dragon Cannon（滿強化後砲火變**冰藍**） | 冰藍、白，加粉紫虹彩 |
| 火 | Heaven Splitter、OICW Hellfire、Fire Fox、M3 Azhi Dahaka | 橙紅、金、黑 |
| 靈魂 | Naberius | 藍紫綠三色 |
| 宇宙 | Arbalest、Space Arbalest、Star Chaser | 紫、洋紅、金銀河；Star Chaser 的**半透明槍身**加星形尾跡 [Wiki] |
| 隱身或幽靈 | Thunder Ghost Walker | 隱身時彈道與命中點**轉紫** [Wiki] |
| 風 | Sylphid | 青綠（與 Arbalest 同色系）[Wiki] |
| 血 | DE Crimson Hunter | 命中時**紫光**提示，血被吸入榴彈 [Wiki] |

### 3.4 待機動態（Idle）：武器自己在「活著」

| 手法 | 實例 | 來源 |
|---|---|---|
| **待機嗡鳴** | 超越級幾乎都有待機音；Python Desperado 是少數例外（Wiki 特別記錄）。Abyss Repulsor 的待機音是 Genocider 充能待機音放慢 | [Wiki] |
| **待機動畫反映能量狀態** | Stun Rifle 有三種待機動畫：無能量、充能中、滿能量 | [Wiki] |
| **材質隨能量變化** | SKULL-T9 充能後貼圖改變，伴隨提示音與額外準星 | [Wiki] |
| **移動的粒子** | Divine Blaster 是「第二把有移動粒子特效的武器」，第一把是 X-TRACKER。Star Chaser SR 有移動精靈圖 | [Wiki] |
| **浮空分離零件** | Pulse Reactor 與 Gravity Repulsor 的視角模型零件是分離的 | [Wiki] |
| **待機時演奏音樂** | Psychic Harmonium 待機時彈奏 Bach《小賦格》G 小調 BWV 578 | [Wiki] |
| **角色化待機** | Ruyi Stick 待機時像孫悟空一樣甩棍 | [Wiki] |
| **套裝燈號** | Ruyi Stick、Zhu Bajie Minigun 等西遊套裝的槍身**燈號顏色隨裝備件數改變**，攻擊波顏色也一起變 | [Wiki] |
| **浮空靈體** | CF 王者滄神（未覺醒）：槍上方飄著**水母虛影**，光影流轉 | [新聞：17173] |

[建議值] 我們的待機參數：
- 呼吸光 0.4–0.8 Hz，振幅 ±25%。
- 流動紋路速度 0.3–0.8 m/s，沿槍管由後往前。
- 浮空零件上下 2–4 mm，週期 2–3 s，不同零件的相位錯開。
- 旋轉環 20–40°/s。
- 待機粒子同時最多 6–12 顆。
- 待機音量比槍聲低 24–30 dB，並且**只在持有時播放**，切走就停。

### 3.5 拔槍、檢視、變形：儀式感

| 手法 | 實例 |
|---|---|
| **拔槍即攻擊** | Warhammer Storm Giant [Wiki] |
| **拔槍或切槍時改變光色** | CF 王者滄神：切槍時藍光轉**螢光粉**。M200 幻影．犬：槍口冷藍光在切槍時轉**火紅**，形容為「如雄獅衝出」[新聞：17173] |
| **檢視改變世界** | CF 手遊王者白虎．白月魁：檢視時**天空驟暗**，槍側的「鐳切之眼」飛起，在周圍盤旋並發射死光；切槍時眼睛飛回、鎖回槍身 [新聞：小米 2026-06-16] |
| **多款換彈動畫** | 同一把武器有三種換彈：彩虹流光沿槍身跑過，彈匣抽出時拖出殘影 [新聞：同上] |
| **換彈時展示刻字** | BALROG-XI 換彈時看得到「BALROG XI」；THANATOS 系列的符文與死神刻印 [Wiki，見 03 號 1.2 節] |
| **變形前後差距** | Genocider VI 太陽板展開；Brionac 長出側翼；Giga Break Overflow 裝甲外翻 [截圖觀察] |

[建議值] 時間表：
- 一般拔槍 0.4–0.7 s。
- 頂級武器**首次拔出**播 1.2–1.8 s 的登場動畫，可以用開火取消。
- 檢視 3–6 s，其中最後 1 s 是「招牌姿勢」定格。
- 「**改變世界的檢視**」只用在最高稀有度：環境光壓暗 30–50%、霧加深、武器自發光提高 1.5 倍。只影響自己的畫面，持續 2–3 s。

### 3.6 開火演出

| 元素 | 實例 | 要點 |
|---|---|---|
| **長序列槍口焰** | Divine Blaster：45 格序列。依序是金色光束，然後**尖刺放射光冠環**（像日冕），然後 2–3 圈細圓環擴散，最後金粒子 [截圖觀察：Muzzleflash171.gif] | 一般槍口焰 1–2 格；頂級的「光冠」可停留 0.2–0.3 s，但**中央要透明** |
| **彩虹槍口焰** | X-TRACKER 首創 [Wiki] | 色相旋轉也是一種「貴」 |
| **CF 手遊三角射線** | 白月魁：槍口焰換成**科幻三角射線** [新聞] | 用幾何形狀取代火焰 |
| **專屬尾跡** | Thunderbolt 藍、Cyclone 綠、Gáe Bolg 青、Compound Bow 光軌、Star Chaser 星形 [Wiki]。CF 手遊「狙擊槍線．光與夜」：**金色光痕加沿途飄落的紅色羽毛** [新聞] | 尾跡加「沿途掉落物」（羽毛、花瓣、符文） |
| **自動電弧** | Death Eater 普攻有紅色閃電自動打附近敵人 [Wiki]。Divine Blaster 開火時金色電弧纏繞槍身 [截圖觀察] | 電弧要**同時連到槍身與目標**，讓玩家看出是武器在放電 |
| **命中光柱** | Divine Blaster 命中區域上方落下**金色光雨柱** [截圖觀察]。Murasame VI 斬擊處有**紫色光柱爆發加地面洋紅光圈** [截圖觀察] | 地面光圈加垂直光柱，讓命中點從遠處也看得到 |
| **花瓣** | Dual Sword Phantom Slayer 命中時噴出玫瑰與櫻花瓣 [Wiki] | 主題粒子 |
| **傷害數字** | Divine Blaster 截圖中是大號**桃紅描邊數字** [截圖觀察]。CF 手遊「鐳切之印」：**放大的淡青傷害數字**，是可以單獨購買的「命中數字皮膚」[新聞] | **傷害數字字型與顏色本身就是商品** |
| **命中特效皮膚** | CF 手遊「鐳切之殤」：深紅命中特效，爆頭與身體分開設計 [新聞] | 爆頭要有獨立特效 |

**反例**（Wiki 列為缺點，等於是設計警告）：
- TURBULENT-7「槍口焰太大，開火時擋住瞄準」。
- Star Chaser SR「大星形尾跡在開鏡時干擾瞄準」。
- Ripper「血液粒子太多，看不清敵人距離」。
- Thunderbolt 與 Compound Bow 的光軌會暴露位置（PvP 的缺點，PvE 無妨）。

### 3.7 全螢幕與畫面效果

| 效果 | 實例 [截圖觀察，除非另註] |
|---|---|
| **螺旋隧道** | Frost Viper 冰霜光線：整個畫面是向中心收縮的冰藍環狀隧道，加上雪花粒子 |
| **螢幕級法陣** | Sandalphon：紅金符文圓圈框住幾乎整個畫面，手掌另有一個橘紅小法陣 |
| **畫面邊框染色** | Lycaon 模式中畫面四周泛藍光。Arbalest 的 Cosmic Armor 有「光輝畫面效果」[Wiki] |
| **視覺模式** | Arcana VI 變形後有半夜視效果 [Wiki] |
| **速度線** | Arbalest 開火時場景中出現粉紅斜向速度線 |
| **天色改變** | CF 手遊檢視時天空變暗 [新聞]；最終消滅時天空轉紅、地面龜裂 [新聞] |

### 3.8 準星與 HUD

- **命中準星提示**：Transcendent、Epic、Legend 的武器頁幾乎都寫著「Notification in the crosshair when hit is successful」或「Crosshairs will light up when you hit your target」[Wiki 二十多條]。命中標記是頂級武器的標準配備：一般武器在多數模式沒有，Basic 模式例外 [Wiki]。
- **專屬瞄準圖** [截圖觀察]：
  - Sandalphon Aim FX：金色細線圓環，四個方位各一顆**青色菱形寶石**，外圍有柔光。
  - Death Cue 的瞄準背景：很淡的**粉、青雙色**刻度準星，左側有一條**弧形計量條**。
  - Frost Viper：2024 年加入「瞄準輔助準星」[Wiki]。
  - Destroyer：鎖定時準星旋轉 90° 並轉紅，同時顯示距離 [Wiki]。
- **浮空全息面板**：Giga Break 在槍右上方浮著一個**六角形描邊全息框**，裡面是綠色箭頭狀態圖示 [截圖觀察]。
- **技能提示面板**：Divine Blaster 的右側半透明面板列出技能名、說明與按鍵圖 [截圖觀察]。
- **能量百分比**：HUD 右下直接顯示能量 %，例如 Lycaon 4%、Naberius 22% [截圖觀察]。
- **傷害顯示**：超越級角色會在下方 HUD 顯示**目前傷害**，並在殭屍血量低於 20% 時標示 [Wiki：Hyeonrin、Mirage]。截圖中還有隊伍傷害排行面板（第 1 名 982.0K、39%）[截圖觀察]。
- **CF 手遊的按鈕皮膚**：白月魁的「鐳切之觸」把武器按鈕改成深紅，開火鍵中央有鐳切圖示 [新聞]。這是**手機獨有的克金點**。我們是手機遊戲，可以直接採用。

### 3.9 擊殺回饋與擊殺標記

**CSO Kill FX**（[Wiki：Kill FX]）：
- 多殺語音一路升級：Double → Triple → Multi。Human Scenario 再延伸到 Monster Kill、Mega Kill、Rampage、Godlike、Oh God，**第 10 殺以上是「Out of This World!」**。
- Zombie Scenario 改版後有 **10／20／30 連殺** 的 Combo 圖示。

**超越級角色的專屬擊殺標記**（GIF，256×256，40 格）[截圖觀察]：

| 角色 | 逐格內容 |
|---|---|
| Hyeonrin | ① 一道火焰筆觸在黑底上「**畫出**」龍身。② 龍的黑底金鱗身體浮現，火焰沿著輪廓燒。③ 祥雲淡入。④ 全身亮起，**龍眼閃紅**，收尾 |
| Mirage | ① 貓臉圖示帶**掃描線雜訊與 RGB 色差**。② **水平撕裂的故障效果**。③ 霓虹青色外框亮起並發光。④ 雙眼變成**黃色四芒星**，收尾 |

> 結構：**出現（筆觸或故障）→ 成形 → 加亮 → 眼睛點睛**。「點睛」是最後一拍，非常重要。

**CrossFire 擊殺標記**（[CF Wiki：Killmark、VVIP System]）：
- 擊殺標記顯示在畫面**下方中央**，約 1 秒後淡出。連殺時有一顆六角星，從上方那一角開始**順時針逐角填滿**。
- 完成特定徽章會讓預設擊殺標記**兩側長出翅膀**（等級標記）。
- **VVIP 武器的爆頭標記**換成更精緻的徽章。
- **集滿整套 VVIP**（從關羽套裝開始）後，擊殺標記換成套裝專屬，還有**專屬載入邊框**。
- 每把 VVIP 有多張擊殺標記：一般、切換模式、刀殺，例如 M4A1-S G Spirit [CF Wiki]。
- CF 手遊「最終消滅．墮落天使」[新聞 2026-07-23]，在**最後一殺**時觸發：
  1. 金色光環從地面擴散。
  2. 一把**被巨大翅膀包覆的巨劍從天而降**，刺入擊殺點。
  3. 落地瞬間光環轉為深紅，捲起血紅龍捲，天空轉紅，地面裂成深紅坑洞。
  4. 整段是「聖光轉暗怒」的情緒反轉。

### 3.10 聲音

- **待機嗡鳴**：多數超越級武器都有，而且彼此會共用或改音高。例如 Dual Beretta Gunslinger 的待機音就是 M4A1 Dark Knight 的低音高版 [Wiki]。
- **就緒提示**：
  - JANUS 雙面神像的笑聲。
  - BALROG 魔像咆哮並閃紅光。
  - White Tiger 虎吼。
  - Blood Dripper 掛到頭上時龍口的珠子發紅光並發出聲音 [Wiki]。
- **角色專屬語音**：Hyeonrin 發射 Black Dragon Cannon 時有專屬台詞；Gladius 投擲 Cousteau 時有專屬語音 [Wiki]。
- **音樂性**：Psychic Harmonium 的待機會彈 Bach [Wiki]。
- **CF**：
  - 可購買「**Reality**」替代音效包 [CF Wiki]。
  - 巴西服與俄羅斯服為所有 VVIP 角色做在地語音，中國服後來也跟進 [CF Wiki]。

### 3.11 商店、預覽與轉蛋演出

| 環節 | CSO | 觀察 |
|---|---|---|
| **商店預覽影片** | 每把頂級武器都有「Store preview」或「Encyclopedia preview」短片（Wiki 存成 160×147 的 GIF，262–342 格）[Wiki、截圖觀察] | 內容固定：在測試房對假人示範**每一個技能**，約 10 s。Lycaon 的預覽依序是藍色狼爪斬、畫面邊框泛藍、橘色火環加狼影 |
| **解碼器（轉蛋）** | 超越解碼器 1,500 cash 一次；機率依群組約 0.15%–0.45%，Premium 版 1%–3%。史詩解碼器 1,900 cash 一次，100 連 152,000（八折），新史詩約 0.35% [Wiki、namu] | 使用後必得「里程點數」作為保底貨幣 |
| **頂級解碼演出** | Top Decoder：深青色星空背景，物品從一團**強光爆閃**中出現，接著是**金框銘牌**，下方地面有**倒影** [截圖觀察：Topdecoderepic.gif，119 格] | 爆閃 → 金框 → 倒影 → 停留 |
| **全服廣播** | 聊天欄顯示「○○ 從暗號解碼器獲得××」 | [截圖觀察] |
| **CF 預覽視窗** | CrossFire 3.0 起可在商店開「HUD 預覽視窗」，試看拔槍、射擊、換彈、檢視、近戰 [CF Wiki] | 我們可以做「**試玩靶場**」 |

---

## 4. CrossFire（穿越火線）比較：同一種克金文化，不同的重點

| 面向 | CSO | CrossFire（PC） | CF 手遊 | 給我們的啟示 |
|---|---|---|---|---|
| 頂級稱呼 | Transcendent／Legend／Epic | VVIP（Victor、Noble、Iris、Destiny）、Infinity、SVIP；Noble Gold 是全金版 [CF Wiki] | 英雄級 → 王者級 → 傳說皮膚、覺醒 | 多一層「金版」作為頂點 |
| 核心價值 | **機制**：大招、召喚、PvE 爆傷 | **經驗加成**（本人最高 +200%，同房 +30%）加外觀加特殊攻擊方式 [CF Wiki] | 外觀加特效模組 | CF 證明「**給同房玩家好處**」能讓昂貴武器被歡迎 |
| 擊殺標記 | 綁角色（超越角色專屬） | **綁武器**：每種擊殺都有專屬圖；**集滿整套**才換套裝擊殺標記與載入邊框 [CF Wiki] | 擊殺圖示角落有四顆小眼睛（白月魁）；最終消滅特效 [新聞] | 擊殺標記可以綁武器，也可以綁套裝 |
| 自訂外觀 | Paint 系統（Wiki 認為受 CS:GO 啟發）；半透明塗裝會讓武器半隱形 [Wiki] | **千變**部位改色（20 色）、替代皮膚（可換模型與動畫）、**VFX 顏色道具**（獸眼、閃電、閃光、光環可換單色或雙色，例如橙紫、紅綠）、**掛件**（小模型，第三人稱可見）、**Infinity 刻字**（4 字元，顯示在暱稱旁）[CF Wiki] | 印花、槍線、拋物線、命中數字、按鈕皮膚 [新聞] | **把特效拆成可以替換的模組**：特效色、尾跡、擊殺標記、傷害數字、按鈕，每一項都可以收藏 |
| 升級外觀 | Premium 強化滿級換色；Weapon Modification IV→V→VI（2026 改成 T1→T2→T3）[Wiki] | Weapon Growth：升級經驗與 GP 加成，滿級得特殊能力，例如**連殺判定時間 +1 秒** [CF Wiki] | **覺醒**：外觀轉為**鎏金**，屬性提升 [新聞] | 「覺醒變鎏金」很適合台灣廟宇的金箔美學 |
| 特殊攻擊方式 | 多技能、能量條 | M4A1-S G Spirit：槍托近戰、換彈時**把舊彈匣丟出去**當攻擊、側掛副手槍可以切換 [CF Wiki] | — | 「換彈也能攻擊」與 03 號的 Stun Rifle 觀點一致 |
| 命名主題 | 西方神話加科幻（Gungnir、Brionac、Naberius）＋東方新年 | **獸**系列（Beast、Born Beast、Fury Beast）、**中國英雄**（關羽：M4A1-武聖）、Infernal Dragon、Transformers [CF Wiki] | 王者之心、王者之魄、白虎 | 「**歷史或神話人物加武器**」在華語市場辨識度很高 |

**一句話對比** [推論]：
- **CSO 的克金是「功能的煙火」**：大招越誇張越貴。
- **CF 的克金是「身分的徽章」**：擊殺標記、套裝、經驗加成、全金版本。
- **CS2 的克金是「稀有材質的收藏」**：見下一節。

《災厄前線》是合作 PvE，最適合「**CSO 的煙火**＋**CF 的可替換特效模組**＋**CS2 的單件唯一紋樣**」。

---

## 5. CS2 高價皮膚：不靠特效的克金

| 元素 | 內容 | 可以借的部分 |
|---|---|---|
| **Doppler 相位** | Phase 1–4 加三個特殊相位：Ruby（深紅）、Sapphire（深藍）、Black Pearl（近黑帶珠光漩渦）。相位在開箱時決定；**圖樣種子只影響紋理位置** [SteamDB] | 「**同一把武器的稀有變色版**」，可以做成神兵的特殊釉色 |
| **Gamma Doppler** | 綠色系，特殊相位是 Emerald 純綠 [SteamDB] | — |
| **Case Hardened** | 藍色含量由圖樣種子決定，所以有「藍寶石紋（blue gem）」的傳說 [SteamDB 提及] | **每件都獨一無二的紋樣種子** → 交趾陶「窯變」 |
| **磨損度** | Factory New 到 Battle-Scarred；Doppler 刀限定 0.00–0.08 [SteamDB] | 我們的材質已有 wear 參數（`materials.js` 的 `wearAmount`），可以做「越用越有光澤」的反向磨損 |
| **StatTrak** | 槍上有一塊**擊殺計數小螢幕**（一般認知） | 神兵上的「功德計數」或「鎮煞計數」 |
| **貼紙材質** | Paper、Glitter、Holo、Foil、Gold、Lenticular（光柵）六種材質，分四級 [CSDB] | 光柵或全息材質可以用在神兵符令 |
| **吊飾（Charms）** | 2024-10 Armory 更新加入，可以掛在任何皮膚上，位置自由 [GGRecon、Esports.net]；會隨槍晃動（一般認知） | **掛件物理晃動**是很便宜的待機動態 |
| **檢視動畫** | 2024-12 更新改善了檢視動畫，主要是 AK-47 [dust2.us] | 檢視是「欣賞皮膚」的主舞台 |
| **稀有度色**（社群常用色碼）| Consumer `#b0c3d9`、Industrial `#5e98d9`、Mil-Spec `#4b69ff`、Restricted `#8847ff`、Classified `#d32ce6`、Covert `#eb4b4b`、刀與手套的稀有特殊物品是金 `#e4ae39`（一般認知，[不確定]：以官方資源為準） | 藍 → 紫 → 粉 → 紅 → 金的階梯已經被玩家普遍內化 |
| **開箱轉盤** | 水平捲動的物品條，逐漸減速，停在中央指針；每格下方有稀有度色條（一般認知） | 「**減速加色條預告**」是製造期待的關鍵 |

---

## 6. 風格公式：克金七層 × 稀有度預算

### 6.1 克金七層（每把頂級武器的檢核表）

| 層 | 內容 | 檢核 |
|---|---|---|
| ① 輪廓 | 六種原型選一種加一個「臉」或焦點 | 遮住顏色只看剪影，能不能一眼認出？ |
| ② 材質 | 60／30／10，至少一種異材質 | 在暗圖與亮圖都好看嗎？鍍鉻有沒有把主色反射偏掉？ |
| ③ 自發光 | 呼吸加流動，狀態驅動（充能時變亮或換色） | 沒有計量條時，玩家看槍身就知道大招好了嗎？ |
| ④ 待機 | 浮空零件、旋轉環、粒子、待機音 | 靜止 5 秒，武器還「活著」嗎？ |
| ⑤ 儀式 | 登場、檢視、變形 | 檢視時有沒有「定格姿勢」？ |
| ⑥ 回饋 | 槍口光冠、尾跡、命中光柱、傷害數字、準星提示、擊殺標記 | 畫面中央 20% 有沒有被擋住？ |
| ⑦ 社交 | 第三人稱可見、暱稱徽章、廣播、隊友受惠 | 隊友看得到你的神兵嗎？他們有沒有因此得到好處？ |

### 6.2 依稀有度分配的層數

這裡沿用 03 號 5.2 節的稀有度。

| 稀有度 | 框色 | 啟用的層 | 自發光面積 | 特效預算（同時存在的粒子） |
|---|---|---|---|---|
| 制式 Standard | 灰白 | ①② | 0% | 槍口焰加彈殼 |
| 反災 Anti-Calamity | 青藍 | ①②③（就緒時亮），⑥ 準星提示 | ≤5% | +30 |
| 異能 Exotic | 紫 | ①–⑥，含專屬尾跡與命中色 | 5–10% | +80 |
| 神兵 Mythic（九子） | 金朱 | ①–⑦ 全開，加上改變世界的檢視、擊殺標記、全螢幕大招 | 8–12% | +150（大招期間上限 300） |

---

## 7. 元素色票（原創，可直接寫進 `materials.js` 或特效設定）

每個元素有六個欄位：底材、飾邊、核心自發光（最亮，觸發 bloom）、邊緣光（次亮，fresnel 與尾跡外圈）、粒子點、對比色（少量點綴，製造貴氣）。[建議值]

| 元素 | 底材 | 飾邊 | 核心光 | 邊緣光 | 粒子 | 對比點綴 | 備註 |
|---|---|---|---|---|---|---|---|
| **烈焰 Inferno** | 焦黑鋼 `#1b1414` | 赤金 `#c8902e` | `#ffb43a` | `#ff5a1f` | 餘燼 `#ffd27a` | 灰煙 `#3a2a26` | 熱霧扭曲；裂紋自發光沿槍身流動 |
| **霜晶 Frost** | 珍珠冰白 `#e8f4ff` | 銀 `#b9c7d6` | `#6fe3ff` | `#2f8bff` | 白閃 `#ffffff` | 虹彩粉 `#ff9ad5` | 菱格虹彩加尖晶簇；粉色虹彩是「貴」的關鍵 |
| **雷霆 Storm** | 鐵藍黑 `#141a26` | 鎢銀 `#9aa6b8` | `#7fd8ff` | `#e8f6ff` | 紫電 `#8a5cff` | 金火花 `#ffe27a` | 電弧兩層：白芯加色暈 |
| **聖輝 Radiant** | 白瓷 `#f3efe6` | 亮金 `#e3b04b` | `#fff2b0` | `#ffc74a` | 光塵 `#fffbe0` | 天青寶石 `#6ec8ff` | 金箔碎紋、蜂巢光、光翼 |
| **深淵 Void** | 黑鉻 `#0c0b10` | 暗金 `#8c6a2a` | `#b54bff` | `#ff3fb4` | `#6a3cff` | 冷青 `#3fffe0`（極少量） | 聖輝的 EX 對偶 |
| **魂焰 Soul** | 黑曜石 `#15161c` | 金 `#d1a542` | `#3a6dff` | `#b54bff` | `#49ff9a` | — | 三色飄帶，顏色依序流轉 |
| **煞血 Demonic** | 黑 `#120a0a` | 金 `#c9a24a` | 紅晶 `#ff2a3a` | 符文 `#ff4b2b` | 火星 `#ffb070` | — | 紅色符文文字沿槍身流動 |
| **星穹 Cosmic** | 深藍 `#0d1238` | 銀 `#cfd6e6` | `#7aa8ff` | 星雲紫 `#c66bff` | 星點 `#fff6d8` | 金銀河 `#ffcf6a` | 透明匣加視差銀河 |
| **電馭 Cyber** | 朱紅裝甲 `#c8202f` | 槍鐵 `#2a2d33` | 萊姆 `#7dff4a` | 青 `#3fd8ff` | 全息 `#9effe8` | 白 | 全息面板、掃描線 |
| **翠靈 Jade** | 白瓷 `#f1efe7` | 金 `#d9a948` | 翠綠釉 `#1fa37a` | `#7dffb8` | 葉光 `#c8ffe0` | 珊瑚 `#ff7a5c` | 交趾陶翠綠 |
| **吉慶 Lunar（台灣在地）** | 朱紅漆 `#b3122a` | 金箔 `#f2c14e` | 暖金 `#ffd36b` | 朱橙 `#ff7a2f` | 金紙光點 `#fff1b8` | 剪黏青綠 `#19a59a`、交趾陶鈷藍 `#2350b5`、赭黃 `#c88a2a` | 九子神兵主色，見 9.2 節 |

**本專案的稀有度框**（原創，避開 CSO 的金與桃紅邊框組合）[建議值]：

| 稀有度 | 底 | 主邊 | 上緣高光 | 下緣暗邊 | 動態 |
|---|---|---|---|---|---|
| 制式 | `#2a2c30` | `#8b9099` | `#c7cbd2` | `#5a5e66` | 無 |
| 反災 | `#14262e` | `#1fb5d6` | `#9ef2ff` | `#0e6f86` | 每 6 s 一次掃光 |
| 異能 | `#1d1430` | `#9b5cff` | `#e2cbff` | `#5a2fb0` | 掃光，加 2–3 顆漂浮光點 |
| 神兵 | `#2a1410` | 金 `#e8b54a` ＋ 朱 `#c8102e` 雙線 | `#fff1b8` | `#8a4a14` | 掃光、邊框流光、背景放射光、金紙粒子 |

---

## 8. three.js 實作配方（對齊本專案現有架構）

### 8.0 整合點

- **材質**：`game/src/gfx/materials.js` 的 `patch(shader, def, opts)` 已經改寫了 `color_fragment`、`roughnessmap_fragment`、`normal_fragment_maps`、`emissivemap_fragment`（已有 `glowPulse`）。片段著色器裡已有 `vObjPos` 與 `vObjNor`（物件空間位置與法線）以及烘焙屬性 `vBake`（ao、edge、cavity、partR）。
  - 建議新增一個 `premium` 選項：`hardSurface(key, { viewmodel, premium: {...} })`。
  - 在 `patch()` 裡用 `#define PREMIUM_*` 切換以下片段，並把 `customProgramCacheKey` 加上 premium 的特徵字串，避免不同組合共用同一個程式。
- **全域時間**：所有 premium 材質共用同一個 `{ value: 0 }` 物件當 `uTime`，每幀更新一次。
- **合成**：`game/src/engine/renderer.js` 的 `COMPOSITE_FRAG` 已有 `aberration`、`flashColor`、`vignette`、`damage`。在這裡加「元素邊框」與「徑向模糊」，成本最低（見 8.11）。
- **bloom**：渲染器已有降採樣與升採樣金字塔。premium 自發光的強度要**刻意跨過 bloom 門檻**：核心光 6–8、邊緣光 2–3。現有 `glow_*` 預設的 7–8 是合適的參考。
- **特效**：`game/src/fx/particles.js`、`fx.js`、`lights.js`。依 03 號 4.5 節，光源只用池化的 1–2 盞 PointLight。premium 的「光」**一律用自發光加 bloom 加加算卡片**，不要新增光源。

### 8.1 Fresnel 邊緣光（所有 premium 的底層）

```glsl
// 插在 #include <emissivemap_fragment> 之後（此時 normal 已計算）
uniform float uTime; uniform vec3 uRimColor; uniform float uRimPower; uniform float uRimStrength;
...
vec3 Vv = normalize(vViewPosition);
float ndv = clamp(dot(normal, Vv), 0.0, 1.0);
float fres = pow(1.0 - ndv, uRimPower);                       // uRimPower 2.5–4
float breathe = 0.75 + 0.25 * sin(uTime * 6.2832 * 0.6);       // 0.6 Hz 呼吸
totalEmissiveRadiance += uRimColor * fres * uRimStrength * breathe;  // 強度 0.6–1.5
```

- 視角模型和攝影機的相對角度幾乎固定，所以邊緣光會「黏」在輪廓上。這正好就是 CSO 頂級武器的「描邊光」。
- 就緒時把 `uRimStrength` 從 0.6 拉到 2.0，**就緒提示就做完了**，不需要另外的模型。

### 8.2 流動自發光紋路與符文（③ 層）

```glsl
// 只作用在 emissive 預設的零件（glow_* 系列），沿槍管 z 軸由後往前流動
uniform float uVeinFreq;   // 每公尺幾條脈衝，8–20
uniform float uVeinSpeed;  // 0.3–0.8（m/s）× uVeinFreq
uniform float uCharge;     // 0..1 充能，由遊戲邏輯驅動
float ph = fract(vObjPos.z * uVeinFreq - uTime * uVeinSpeed);
float pulse = smoothstep(0.0, 0.12, ph) * (1.0 - smoothstep(0.12, 0.55, ph));   // 前陡後緩的光脈
float base = mix(0.35, 1.0, uCharge);                                          // 充能越滿底光越亮
totalEmissiveRadiance *= base + pulse * (0.6 + 1.4 * uCharge);
```

- **符文文字條**（Demonic Viper 式）：做一條有 UV 的細長平面，貼一張 1024×64 的原創符文圖集，然後：
  ```glsl
  vec2 uv = vec2(vUv.x * 6.0 - uTime * 0.15, vUv.y);
  float g = texture2D(tRunes, uv).r;
  float flick = 0.8 + 0.2 * step(0.35, fract(sin(floor(uv.x) * 91.7 + floor(uTime * 6.0)) * 43758.5));
  gl_FragColor = vec4(uRuneColor * g * flick * uIntensity, 1.0);   // 加算混合
  ```
- **狀態驅動的材質**（Frost Viper 拔槍與換彈時白鱗變暗、SKULL-T9 充能換貼圖）：換彈期間把 `uCharge` 暫降到 0.2，換完再用 0.3 s 拉回。武器看起來就「會喘氣」。

### 8.3 鍍金、黑鉻與掃光（② 層）

- **參數** [建議值]：
  - 亮金：`color #e3b04b, metalness 1, roughness 0.14–0.2`。專案預設 `gold` 是 0.20。
  - 古銅：`#9a6a2a, 0.35–0.45`。
  - 黑鉻：`#1a1a1e, metalness 1, roughness 0.08–0.12`。
  - 白瓷：`#f3efe6, metalness 0, roughness 0.25`，搭配 clearcoat 或較強的 env。
- **環境貼圖**：視角模型用一張**專屬的攝影棚環境**（`RoomEnvironment` 經 PMREM），和地圖光照分開。CSO 頂級武器「在黑暗地圖仍然好看」，靠的就是這一點。
- **鍍鉻反光會隨轉動滑動**（CSO 鍍鉻的招牌）：three r162 起材質有 `envMapRotation`。把它綁在攝影機 yaw 的變化量上並放大 1.5–2 倍，玩家轉頭時反光就會在槍身上滑過。
- **掃光**（商店卡與檢視都能用）：
  ```glsl
  float sweep = fract(uTime / 4.0);                        // 每 4 秒一次
  float d = (vObjPos.z * 0.8 + vObjPos.y * 0.5) - (sweep * 3.0 - 1.2);
  float shine = exp(-d * d * 160.0) * step(sweep, 0.8);    // 最後 20% 時間休息
  totalEmissiveRadiance += vec3(1.0, 0.93, 0.75) * shine * uShine;   // uShine 1.5–3，只套金屬零件
  ```

### 8.4 全息投影（Giga Break 面板、Luminous 式全息翼）

```glsl
// ShaderMaterial：transparent, blending: AdditiveBlending, depthWrite: false
uniform float uTime, uOpacity, uDpr; uniform vec3 uColor;
varying vec3 vN, vV, vObj;
void main(){
  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
  float scan = 0.6 + 0.4 * sin(gl_FragCoord.y / uDpr * 1.4 - uTime * 14.0);   // 依 DPR 修正，避免手機上疊紋
  float sweep = 1.0 - smoothstep(0.0, 0.03, abs(fract(vObj.y * 1.2 - uTime * 0.4) - 0.5));
  float flicker = 0.88 + 0.12 * step(0.5, fract(sin(floor(uTime * 20.0)) * 43758.5453));
  float a = (0.12 + 0.88 * fres) * scan * flicker * uOpacity;
  gl_FragColor = vec4(uColor * (1.0 + sweep * 2.0), a + sweep * 0.4);
}
```

- **六角面板**：`ShapeGeometry` 描邊用細 `LineSegments`，或一張帶 alpha 的面板貼圖。內部圖示用 `CanvasTexture` 畫，狀態變化時才更新。
- **出現動畫**：縱向 scale 0 → 1.08 → 1.0（0.18 s），同時 flicker 加強。消失時用 scanline 往上收起。

### 8.5 薄膜虹彩（Frost Viper 式菱格晶面）

**選項 A，物理正確**：只給晶簇零件用 `MeshPhysicalMaterial({ iridescence: 1, iridescenceIOR: 1.3, iridescenceThicknessRange: [120, 420], metalness: 0.2, roughness: 0.15 })`。成本是 Physical 光照，**限 1–2 個零件**。

**選項 B，便宜**：沿用 hardSurface，插在 `#include <normal_fragment_maps>` 之後。這時修改 `diffuseColor` 仍然會影響金屬的高光色：
```glsl
vec3 Vv = normalize(vViewPosition);
float ndv = clamp(dot(normal, Vv), 0.0, 1.0);
// 菱格：物件空間 45° 方格
vec2 q = vObjPos.zy * uDiamondScale;                    // 30–60
vec2 cell = floor(vec2(q.x + q.y, q.x - q.y));
float cellRnd = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
// IQ 餘弦調色盤：色相隨視角與每格隨機值偏移
vec3 irid = 0.5 + 0.5 * cos(6.2832 * (vec3(0.0, 0.33, 0.67) + (1.0 - ndv) * 1.1 + cellRnd * 0.35));
diffuseColor.rgb = mix(diffuseColor.rgb, irid, uIrid);          // uIrid 0.35–0.6
// 每格偶發閃光（glint）
float glint = step(0.985, fract(cellRnd * 37.0 + floor(uTime * 3.0) * 0.137));
totalEmissiveRadiance += vec3(1.0) * glint * 3.0;               // 寫在 emissive 段
```
- **原創轉換**：同一招換成「**剪黏碎瓷**」。把菱格改成 Voronoi 碎片，每片取交趾陶色票裡的一個顏色，再加 0.2 的虹彩。這就是九子神兵的招牌材質，見 9.2 節。

### 8.6 假寶石與「透明匣裡的銀河」

**寶石**（獸眼、寶珠、法陣節點）：
- `flatShading: true` 呈現切面。
- 環境強度 2–3。
- 內光：`totalEmissiveRadiance += uGem * pow(ndv, 3.0) * 1.2;`，正面越亮，像光從內部透出。
- 切面閃光：`floor(normal * 6.0)` 雜湊加時間，與 8.5 相同。
- 外加一張**加算的星芒精靈圖**（4 芒，40–60 px），每 2–4 s 隨機閃一次。

> 不要用 `transmission`，它會多一次場景渲染，手機上很貴。

**視差銀河**（Space Arbalest 式透明彈匣）：
- 外殼是半透明玻璃材質，內層用自訂著色器做 2–3 層視差取樣。
- JS 每幀算好攝影機在物件空間的位置 `uCamObj = mesh.worldToLocal(camera.position.clone())`，避免在 GLSL 裡呼叫 `inverse()`。
```glsl
vec3 dir = normalize(vObjPos - uCamObj);
vec3 col = vec3(0.0);
for (int i = 0; i < 3; i++) {
  float depth = 0.004 + 0.006 * float(i);                       // 4–16 mm 的假深度
  vec2 uv = vObjPos.zy * (18.0 - 4.0 * float(i)) + dir.zy * depth * 60.0 + vec2(uTime * 0.01 * float(i + 1), 0.0);
  col += texture2D(tStars, uv).rgb * (1.0 - 0.3 * float(i));
}
gl_FragColor = vec4(col * uTint, 1.0);
```

### 8.7 溶解（召喚物出場或退場、變形零件、解鎖展示）

```glsl
// 透過 #define USE_DISSOLVE 才編譯；只在轉場期間換成這個變體（discard 會關掉 early-z）
float n = texture2D(tGrunge, vObjPos.zy * 3.0).g * 0.6 + texture2D(tGrunge, vObjPos.xz * 7.0).r * 0.4;
float e = n - uDissolve;            // uDissolve 0→1 消失；1→0 出現
if (e < 0.0) discard;
totalEmissiveRadiance += uEdgeColor * (1.0 - smoothstep(0.0, 0.06, e)) * 8.0;
```
- 本專案已有 `tGrunge` 三平面貼圖可以重用。
- **召喚靈獸**（釉瓷狻猊）：0.35 s 由下往上溶解出現，邊緣用該元素的核心光色。退場則從四肢開始溶解 0.5 s，同時噴出碎瓷粒子。

### 8.8 光翼與刃翼

- **組成**：每側 5–7 張加算平面卡片，扇形排列，相鄰間隔 12–18°。
  - 卡片貼圖 256×64：靠近根部的核心最亮，往翼尖淡出，邊緣帶羽狀鋸齒。
  - 用 `depthWrite: false`、`side: DoubleSide`。
- **展開**：0.25 s，`easeOutBack`（overshoot 1.15），卡片依序延遲 20 ms。
- **待機**：`rotation.z += sin(t * 2.2 + i * 0.6) * 0.04`；UV 捲動一張雜訊圖，讓光「往外流」。
- **顏色**：聖輝用核心 `#fff2b0` 到邊 `#ffc74a`；深淵用 `#ff3fb4` 到 `#6a3cff`。全息翼（電馭）把貼圖換成像素格紋，再疊 8.4 的掃描線。
- **手機成本**：14 張卡片在畫面右下約占 15% 面積，額外重繪約 0.3–0.5 個螢幕。可以接受，但**不要和全螢幕大招同時開**。

### 8.9 法陣與光環

- **地面法陣**：`PlaneGeometry` 貼原創符文環圖（1024²，含 3 圈）。用 `polygonOffset` 避免 z-fighting。
  - 內圈 +35°/s，外圈 −20°/s。
  - 出現時 scale 0.6 → 1.0，加 0.15 s 閃白。
- **螢幕級法陣**（Sandalphon 式）：放在 HUD 正交層，不放在 3D 場景，避免透視變形。
  - 半徑約為螢幕短邊的 0.48，透明度 0.35–0.5，只描線、不填色，**中央 35% 保持全透明**。
- **寶石節點**：法陣四個方位各放一顆 8.6 的寶石精靈圖，就緒時依序點亮，每顆間隔 80 ms，並配 4 個上升音（見 8.13）。

### 8.10 粒子、拖尾、電弧、序列幀

- **GPU 粒子**：`InstancedBufferGeometry`，每實例屬性為 `aStart, aVel, aBirth, aLife, aSeed`。
  - 頂點著色器計算 `p = start + vel*t + 0.5*g*t²`，尺寸與顏色隨生命週期查一張 ramp 貼圖。
  - 生成時只更新環形緩衝區的一段（r186 用 `attribute.addUpdateRange(start, count)`），**CPU 不逐顆計算**。
  - 每個系統 1,024–2,048 個實例。
- **緞帶拖尾**（刀光、靈魂飄帶、投射物）：
  - 每幀把刀尖或投射物位置推進一個 16–24 點的環形緩衝區，建立面向攝影機的條帶。
  - UV.x 沿長度方向，alpha 淡出，用加算混合。
  - Naberius 式飄帶是 3 條不同顏色的緞帶，以不同相位繞槍身螺旋：`r = 0.06 m`，`ω = 2–3 rad/s`。
- **電弧**：從槍口到目標的折線，用中點位移法遞迴 3 層，抖動幅度是長度的 8–12%。每 33–50 ms 重新生成一次。
  - 渲染成兩層粗線條帶：白芯 2 px 加色暈 8 px。
  - 一端固定在**槍身上的放電點**（Divine Blaster 式），讓玩家看出是武器在放電。
- **光冠槍口焰**（3.6 節）：
  - ① 核心閃光 1–2 幀。
  - ② 尖刺光冠卡片 scale 0.6 → 1.25、alpha 1 → 0，持續 220 ms。
  - ③ 2 圈細環由 0.5 擴到 1.6，交錯 40 ms。
  - ④ 8–16 顆金粒子。
  - 卡片放在槍口前 0.25 m，**中心挖空**（貼圖中央 alpha = 0），避免擋住準星。
- **序列幀**：4×4 或 8×8 圖集，`frame = floor(t * fps)`，在著色器裡換算 UV 偏移。適合命中光柱、爆炸、Divine Blaster 式金色光雨。

### 8.11 畫面效果（擴充 `COMPOSITE_FRAG`）

```glsl
uniform vec3 uEdgeColor; uniform float uEdge;   // 元素色畫面框（Lycaon 式），0..1
uniform float uZoomBlur;                       // 大招觸發瞬間的徑向模糊，0..1，200 ms 內衰減
...
// 放在 col += texture2D(tBloom, uv) 之前
if (uZoomBlur > 0.001) {
  vec3 acc = col;
  for (int i = 1; i < 6; i++) acc += texture2D(tScene, uv - cc * uZoomBlur * 0.03 * float(i)).rgb;
  col = acc / 6.0;
}
col += uEdgeColor * uEdge * smoothstep(0.10, 0.45, r2);   // r2 = dot(cc, cc)，現有變數
```

- **冰霜隧道**（Frost Viper 式）：不用後處理。改用一支掛在攝影機上的**開口圓柱網格**（`side: BackSide`，長 30 m，半徑 2.5 m），貼條紋或冰片貼圖，UV.v 以每秒 2–4 捲動，加算混合，0.15 s 淡入。只有一層全螢幕重繪，中階手機負擔得起。
- **改變世界的檢視**：0.3 s 內把天光、環境光乘上 0.6、霧加濃 30%，武器的 `uRimStrength` 提高 1.5 倍；2.5 s 後還原。只作用在本機畫面。
- **閃光安全**：全螢幕閃光（`flashColor`）每秒不超過 3 次。這是參考 WCAG 2.3.1 的三次閃光原則，避免誘發光敏性癲癇。

### 8.12 準星、HUD、擊殺標記

- **命中準星提示**（頂級標配）：命中當幀，準星四臂轉成元素色、scale 1.15，90 ms 後回復。不同於 03 號 4.9 節的命中 X 標記，兩者並存。
- **就緒提示**：準星外圈出現 4 個寶石節點並依序點亮（8.9 節），加上 8.1 的邊緣光。
- **計量條**：SVG `stroke-dasharray` 弧形條，放在準星左側（Death Cue 式）。滿格時閃 2 次。
- **擊殺標記**（微型動畫）[建議值]：
  - 格式：256×256，24–30 格，WebP 圖集（約 1536×1280）。一個 DOM 元素或一個 quad 播放，**不要用 CSS filter**（手機 WebView 很貴）。
  - 節拍（總長 1.4–1.8 s）：
    1. 0–0.45 s 筆觸畫出輪廓（stroke reveal）或故障出現。
    2. 0.45–0.8 s 填色。
    3. 0.8–1.0 s 全亮並加光暈。
    4. 1.0–1.15 s **點睛**（眼、寶石或符印閃光）加一聲「叮」。
    5. 停留，然後 0.3 s 淡出。
  - 連殺：沿用 CF 的「逐角填滿」概念，改成原創造型，例如**八卦八格依序點亮**、**鞭炮串逐顆點燃**。連殺計時條畫在擊殺標記下方。
- **傷害數字**：數字 0–9 預先畫成元素風格圖集（描邊加漸層），用 instanced quad 顯示。
  - 出現時 scale 1.4 → 1.0（80 ms），600 ms 內上飄 0.6 m 並淡出。
  - 爆擊放大 1.3 倍、換色。
  - 同一目標 0.3 s 內合併（03 號 4.9 節）。
- **手機按鈕皮膚**（CF 手遊式）：開火鍵、技能鍵換成武器主題框（SVG）。技能就緒時按鈕外圈流光，按下時噴出 6–10 顆 UI 粒子。

### 8.13 聲音配方（WebAudio）[建議值]

| 層 | 做法 |
|---|---|
| 待機嗡鳴 | 55–110 Hz 正弦，加上帶通雜訊（中心 400–1,200 Hz，Q 4），濾波中心用 0.2 Hz LFO 掃動。音量比槍聲低 24–30 dB；持有時淡入 0.4 s |
| 就緒提示 | **鐘聲**：非諧波泛音比 1 : 2.76 : 5.40 : 8.93，衰減 1.2 s。或者用元素主題音：獸吼、鈸聲、廟鐘、合唱和弦 |
| 頂級開火 | 在原槍聲上**疊一層「貴氣瞬態」**：6–10 kHz 高架雜訊爆音 30 ms，加 1 個短鈴音（元素調性），音量 −12 dB |
| 大招 | 上升音（0.4 s，200 → 800 Hz）→ 低頻衝擊（40–60 Hz，0.3 s）→ 合唱或鐘樂墊底 → 收尾的洩氣聲 |
| 擊殺確認 | 點睛「叮」。連殺時每殺升半音，第 5 殺以上加和弦。播報語音用原創台詞，台語或華語，見 9.3 節 |
| 檢視 | 一段 2–3 s 的主題旋律（Psychic Harmonium 的啟示）。九子神兵可以用北管或南管的短樂句 |

### 8.14 效能預算與畫質分級（手機）

| 項目 | 低 | 中 | 高 |
|---|---|---|---|
| bloom | 關，改用加算光暈卡片模擬 | 1/4 解析度金字塔 3 層 | 1/2 解析度 5 層 |
| 虹彩、寶石 | 改用貼圖烘焙的固定虹彩 | 8.5 選項 B | 選項 A，限 1 個零件 |
| 全息掃描線 | 關（只保留 fresnel） | 開 | 開 |
| 光翼卡片 | 每側 3 張 | 5 張 | 7 張 |
| 粒子上限（單一武器） | 60 | 150 | 300 |
| 全螢幕效果 | 只用邊框染色 | 隧道網格 | 隧道網格加徑向模糊 |
| 擊殺標記 | 12 格 | 24 格 | 30 格 |
| 改變世界的檢視 | 只壓暗 | 壓暗加霧 | 全開 |

- **手機的頭號殺手是加算重繪（fill-rate），不是頂點數。**
  - 同一像素上疊的加算層 ≤ 4。
  - 單張特效卡在畫面上的面積 ≤ 25%。
  - 大招期間關閉待機粒子。
- **著色器變體數**要控制。premium 的 define 組合限定為 6–8 種預設（例如 `RIM|VEIN`、`RIM|VEIN|IRID`、`RIM|HOLO`…），在載入畫面就預熱編譯（`renderer.compile`），避免第一次拔槍時卡頓。

---

## 9. 套回《災厄前線》：原創風格表

### 9.1 「反災改造」五系列（03 號 5.3 節）的克金規格

| 系列 | 輪廓焦點 | 材質（60／30／10） | 自發光節奏 | 就緒提示 | 開火招牌 | 擊殺標記（原創） |
|---|---|---|---|---|---|---|
| 雙相 DUALPHASE | 機匣雙環陀螺儀 | 霧黑鋼／亮銀／冷青加琥珀 | 雙環錯位慢轉，就緒時同軸鎖定並急轉 | 「鈴」加雙環對齊閃光 | 冷青與琥珀交錯的三分裂光彈，加六角光冠 | 兩個半圓相位符號旋轉合體，然後閃光 |
| 迴刃 GYRE | 彈鼓裡的折扇鋸盤 | 槍鐵灰／黑鉻／萊姆綠刃光 | 鋸盤縫隙的綠光沿圓周流動 | 鋸盤空轉一圈並發出高頻聲 | 綠色螺旋光環尾跡 | 扇形鋸片展開成圓 |
| 熔爐 CRUCIBLE | 外露的爐心窗口 | 焦黑鋼／赤金／熔岩橘裂紋 | 爐溫越高，裂紋越亮越快（8.2 的 `uCharge`） | 爐門噴火星，並發出「轟」 | 熔核彈前一發槍口轉亮橘（預告） | 熔岩滴落凝成印記 |
| 破疫 PLAGUEBANE | 安瓿瓶彈匣（透明） | 白陶瓷／銀／紫外線紫符紋 | 安瓿內液體發光並緩慢對流（8.6 視差改成液體） | 符紋逐條點亮 | 紫色淨化標記環 | 封印符從中央展開 |
| 節拍 TEMPO | 槍側節拍器螢幕 | 霧黑／鉻／霓虹洋紅 | 隨換彈節拍閃動 | 完美換彈時爆出洋紅環 | 三連拍貫穿彈的洋紅尾跡 | 節拍器指針擺三下並定格 |

### 9.2 九子神兵：台灣廟宇版克金（招牌差異化）

> 對應 CSO 的「新年東方題材」，但用**台灣在地**的剪黏、交趾陶、金箔、香煙、鞭炮與北管，和 CSO 的龍、瑞獸金幣明確區隔。

- **材質三寶**：
  1. **剪黏碎瓷**：8.5 的 Voronoi 碎片加虹彩，取代 Frost Viper 的菱格。
  2. **交趾陶釉**：鈷藍、翠綠、赭黃、朱紅，roughness 0.18，再加一層 clearcoat 感的 env。
  3. **金箔**：8.3 掃光加上**破碎金箔貼圖**。這也呼應 Divine Blaster 的金箔碎紋，但我們的版本是貼在朱漆上的廟宇金箔。
- **單件唯一的「窯變種子」**（借 CS2）：
  - 每把神兵在取得時擲一個 seed，決定碎瓷排列、釉色偏移 ±8°、金箔破碎形狀。
  - 約 1% 的機率出現「**窯變**」特殊色：例如全青花，或天目黑釉加金兔毫。這是外觀限定，不影響數值。
- **鎏金覺醒**（借 CF 的覺醒）：神兵達到成就後覺醒。同一個模型加上：
  - 金箔覆蓋率從 25% 提高到 55%。
  - 待機時浮出「靈獸釉瓷虛影」（8.7 溶解出場）。
  - 擊殺標記升級為帶翅版本。
- **EX 日夜對偶**（借 CSO 的 EX）：每隻九子有「日巡」與「夜巡」兩版。
  - 日巡是朱金加青綠。
  - 夜巡是黑漆加銀箔加冷青火。
  - 機制相同、演出相反。
- **狻猊．焚香 完整克金套組**（補充 03 號 5.5 節的機制腳本）：

| 層 | 內容 |
|---|---|
| ① 輪廓 | 香爐式機匣、獸首砲口。獸首放在畫面右上，是唯一的「臉」 |
| ② 材質 | 朱漆 60%，金箔加古銅 30%，香火橘自發光 10%。獸眼是寶石（8.6） |
| ③ 自發光 | 香爐鏤空紋的光沿紋路流動（8.2）；蓄力時由暗金轉朱紅 |
| ④ 待機 | 獸耳飄出 1–2 條線香細煙（緞帶粒子，往上飄 0.4 m）；爐蓋每 3 s 輕震一次並發出「叩」 |
| ⑤ 儀式 | 首次拔出時獸首**甩頭睜眼**（舞獅動作），配一聲鈸。檢視時天色壓暗，香煙繞槍一圈後凝成「火」字篆印，再散去 |
| ⑥ 回饋 | 蓄滿時的光冠是**香爐煙圈造型**；火獅撲出時在地面留下金紙灰粒子；傷害數字是朱底金邊 |
| ⑦ 社交 | 隊友在第三人稱看得到持有者身邊的香煙；擊殺標記是**剪黏碎片從四方飛來，拼成獅頭**，最後點睛（雙眼亮金）；全隊在火獅吐息期間攻擊力 +5% |

### 9.3 播報與命名

- **台服式稱號**（2.3 節句型）：
  - 「焚香獅吼．狻猊」
  - 「鎮瀾三響．蒲牢」
  - 「負碑鎮煞．贔屓」
  - EX 夜巡版：「焚香獅吼．夜狻猊」
- **連殺播報**（原創，避免 CSO 或 CF 的英文播報）：
  - 雙殺「好兆頭！」→ 三殺「旺旺來！」→ 五殺「鞭炮響！」→ 十殺「神明附體！」（華語版）。
  - 也可以做台語版，作為語音包商品，概念類似 CF 的在地語音。

---

## 10. 避雷與可讀性守則

1. **不能抄**：
   - CSO、CF 的武器名、系列名與研究所名。
   - Janus 雙面神頭像、Balrog 魔像、Thanatos 死神翼這類**具體造型**。
   - Hyeonrin 擊殺標記這種**具體構圖**（黑金龍加祥雲）。
   - CF 的六角星連殺標記。

   通用母題（龍、翼、光環、晶體）可以用，但造型要原創。Haechi（獬豸）、狻猊等神話生物是公共文化，可以用；但不要仿 Divine Beast 的「青鱗瑞獸坐在槍上咬古錢」這種具體組合。
2. **畫面中央 20% 永遠乾淨**：TURBULENT-7、Star Chaser SR、Ripper 的教訓見 3.6 節。所有槍口光冠、尾跡起點、法陣都要挖空中央。
3. **PvE 也要能辨識敵人**：
   - 全螢幕效果的透明度上限 0.5。
   - 精英與 Boss 的描邊要永遠蓋在玩家特效之上。可以用單獨一層的描邊 pass，或讓敵人的受擊閃光不受 bloom 影響。
4. **色盲友善**：就緒提示不能只靠顏色（CSO 的 JANUS 只靠「準星轉紫」）。要搭配形狀（節點點亮）、聲音和觸覺。
5. **閃光安全**：全螢幕閃光每秒最多 3 次（8.11 節）。
6. **鍍鉻會偏色**：Supreme Sentinel 的青色變土耳其藍。配色要在最終的環境貼圖與色彩分級下驗收，不能只看貼圖。
7. **合作遊戲的克金觀感**：
   - 參考 CF 的「同房經驗加成」與 CSO 的「隊伍光環」，讓頂級武器**讓隊友也受惠**。
   - 外觀模組（特效色、擊殺標記、傷害數字、按鈕皮膚）盡量做成**純外觀**的收藏線。
8. **若做轉蛋**：台灣的網路遊戲定型化契約規範要求公開付費隨機商品的機率 [不確定：條文名稱與生效日請法務確認]。CSO 與 CS2 也都有公開機率頁。解碼器保底點數（CSO 里程）是降低挫折感的好做法。

---

## 11. 來源

**CSO Wiki（cso.fandom.com，皆經 `api.php?action=parse&prop=wikitext` 讀取）**
- 分類清單：https://cso.fandom.com/wiki/Category:Epic_(Grade) ・ https://cso.fandom.com/wiki/Category:Legend_(Grade) ・ https://cso.fandom.com/wiki/Category:Transcendent_(Grade)
- 系統頁：
  - https://cso.fandom.com/wiki/Transcendent_Weapons
  - https://cso.fandom.com/wiki/Kill_FX
  - https://cso.fandom.com/wiki/Paint
  - https://cso.fandom.com/wiki/Weapon_Enhancement
  - https://cso.fandom.com/wiki/Weapon_Modification
  - https://cso.fandom.com/wiki/Legend
  - https://cso.fandom.com/wiki/Epic_Edition_weapon
  - https://cso.fandom.com/wiki/Transcendent_Decoder
  - https://cso.fandom.com/wiki/Epic_Decoder
  - https://cso.fandom.com/wiki/Transcendent_Welfares
  - https://cso.fandom.com/wiki/Star_Fragment
  - https://cso.fandom.com/wiki/Dragon_firearms
  - https://cso.fandom.com/wiki/Template:Grade
- 武器頁（節錄）：
  - https://cso.fandom.com/wiki/Divine_Beast
  - https://cso.fandom.com/wiki/Divine_Blaster
  - https://cso.fandom.com/wiki/Doom_Blaster
  - https://cso.fandom.com/wiki/Frost_Viper
  - https://cso.fandom.com/wiki/Demonic_Viper
  - https://cso.fandom.com/wiki/Naberius
  - https://cso.fandom.com/wiki/Brionac
  - https://cso.fandom.com/wiki/Luminous_Brionac
  - https://cso.fandom.com/wiki/Lycaon
  - https://cso.fandom.com/wiki/Sandalphon
  - https://cso.fandom.com/wiki/Giga_Break
  - https://cso.fandom.com/wiki/Genocider_VI
  - https://cso.fandom.com/wiki/Murasame_VI
  - https://cso.fandom.com/wiki/Death_Cue
  - https://cso.fandom.com/wiki/Arbalest
  - https://cso.fandom.com/wiki/Space_Arbalest
  - https://cso.fandom.com/wiki/Supreme_Sentinel
  - https://cso.fandom.com/wiki/Hecate_II_Umbra
  - https://cso.fandom.com/wiki/Transcendent_Magnum_Drill_Gold
  - https://cso.fandom.com/wiki/X-TRACKER
  - https://cso.fandom.com/wiki/Star_Chaser_SR
  - https://cso.fandom.com/wiki/Psychic_Harmonium
  - https://cso.fandom.com/wiki/Stun_Rifle
  - https://cso.fandom.com/wiki/SKULL-T9
  - https://cso.fandom.com/wiki/Ruyi_Stick
  - https://cso.fandom.com/wiki/TURBULENT-7
  - https://cso.fandom.com/wiki/Ripper
  - https://cso.fandom.com/wiki/Gungnir
  - https://cso.fandom.com/wiki/Dark_Star
- 角色頁（專屬擊殺標記）：https://cso.fandom.com/wiki/Hyeonrin ・ https://cso.fandom.com/wiki/Mirage_(Character) ・ https://cso.fandom.com/wiki/Blood_Witch_Bloody
- 檢視過的圖檔（[截圖觀察] 的依據）：
  - https://cso.fandom.com/wiki/File:Muzzleflash171.gif
  - https://cso.fandom.com/wiki/File:Topdecoderepic.gif
  - https://cso.fandom.com/wiki/File:Killmark_25s5CT.gif
  - https://cso.fandom.com/wiki/File:Killmark_21s2CT.gif
  - https://cso.fandom.com/wiki/File:Divinetitan_aim_on.png
  - https://cso.fandom.com/wiki/File:Deathcue_aim_bg.png
  - https://cso.fandom.com/wiki/File:Winggun_bink.gif
  - https://cso.fandom.com/wiki/File:Wolfpack.gif
  - https://cso.fandom.com/wiki/File:Soulreaper_desc.gif
  - https://cso.fandom.com/wiki/File:Frostbiteex_bink.gif
  - https://cso.fandom.com/wiki/File:V_coindart.png
  - https://cso.fandom.com/wiki/File:Demonic_Viper_view.png
  - Divine Blaster、Naberius、Brionac、Luminous Brionac、Lycaon、Frost Viper（Frost Barrier／Frost Ray）、Giga Break（Overflow）、Genocider VI、Murasame VI、Sandalphon、Arbalest 各武器頁 Gallery 內的遊戲截圖

**namu.wiki（內建瀏覽器讀取）**
- https://namu.wiki/w/카운터%20스트라이크%20온라인/무기
- https://namu.wiki/w/카운터%20스트라이크%20온라인/무기/에픽
- https://namu.wiki/w/카운터%20스트라이크%20온라인/무기/에픽/2025년

**CrossFire**
- https://crossfirefps.fandom.com/wiki/VVIP_System
- https://crossfirefps.fandom.com/wiki/Killmark
- https://crossfirefps.fandom.com/wiki/Weapon_Customization
- https://crossfirefps.fandom.com/wiki/M4A1-S_G_Spirit
- https://crossfirefps.fandom.com/wiki/AK47-Beast_Noble_Gold
- 小米遊戲中心（火線論壇助手，CF 手遊體驗服爆料）：
  - 王者白虎．白月魁（2026-06-16）：https://game.xiaomi.com/viewpoint/1342551196_1781600011288_16
  - 最終消滅．墮落天使、狙擊槍線、拋物線、印花（2026-07-23）：https://game.xiaomi.com/viewpoint/1342551196_1784809979821_16
- 17173，CF 王者滄神、幻影．犬鑑賞（2026-03-28）：https://news.17173.com/content/03282026/000619692.shtml
- 前瞻網，CF 英雄級武器（火麒麟為首把英雄級，2012 年起；僅取背景）：https://www.qianzhan.com/game/detail/381/170123-eb69b24b.html

**CS2**
- SteamDB，Doppler 相位：https://steamdb.com/en/articles/cs2-doppler-phases-guide
- CSDB，貼紙等級與材質：https://csdb.gg/cs2-sticker-grades/
- GGRecon，Armory 更新（2024-10-03）：https://www.ggrecon.com/guides/cs2-november-2024-armory-update/
- Esports.net，吊飾：https://www.esports.net/news/counter-strike/new-cs2-update-weapon-charms-the-armory/
- dust2.us，檢視動畫改善（2024-12）：https://dust2.us/news/56325/valve-add-champion-stickers-new-ak-animation-in-latest-update
- Skinbase，Doppler 買家注意事項：https://skinbase.io/blog/cs2-doppler-phases-buyer-checks

**本專案程式（整合點）**
- `game/src/engine/renderer.js`（bloom 金字塔、`COMPOSITE_FRAG`）
- `game/src/gfx/materials.js`（`MATS`、`patch()`、`hardSurface()`）
- `game/src/fx/*`
- `docs/WEAPON_MODELING.md`
- `docs/research/03-weapons-feel.md`
