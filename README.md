# 災厄前線 CALAMITY FRONT

1–4 人合作的回合制殭屍防禦 FPS。玩法仿 CSO（絕對武力 Online）殭屍劇本「災厄之章」，畫面走 CS2／PUBG 寫實風，
武器加上近年 CSO「克金」武器的華麗機制與 CS2 式稀有塗裝。Android App（WebView 外殼）與瀏覽器都能玩。

> 所有名稱、造型、模型、材質與音效皆為原創或 CC0 素材，只借鏡原作的玩法與氛圍（不拆取任何遊戲檔案）。

## 直接在瀏覽器遊玩

**遊戲網址：https://job159.github.io/cs/**

手機或電腦開啟網址即可進入遊戲選單，不需要安裝 APK，也不需要與開發電腦連同一個 Wi-Fi。網站由 GitHub Pages 提供，開發電腦關機後仍可使用；需要可連上網站的網路及支援 WebGL 2 的瀏覽器。首次開啟會下載遊戲素材，請等待載入完成。

單人模式可直接開始；多人模式可建立房間，讓朋友使用相同網址並輸入房號。多人連線使用 WebRTC 與公共 MQTT 中繼，能否連線仍取決於雙方網路及中繼服務狀態。

推送到 `master` 後，GitHub Actions 會執行 `npm ci`、`npm run build:site`，將 `dist/site/` 發佈到 GitHub Pages。Pages 的來源需設為 **GitHub Actions**。也可在 Actions 手動執行 **Deploy browser game**。APK 下載頁保留在 [download.html](https://job159.github.io/cs/download.html)，舊的 `/play/` 網址會轉到遊戲首頁並保留網址參數。

## 特色

| | |
|---|---|
| 🧟 **寫實殭屍** | CC0 寫實人體（MakeHuman）＋殭屍皮膚、撕裂衣物；動作捕捉動畫；部位傷害、擊退與硬直、爆頭斷頭、斷肢、血跡貼花；遠距離自動切換低模 |
| 🔫 **武器手感** | 程序化寫實槍模（烘焙環境遮蔽與邊緣磨損）、IK 雙手、逐把換彈動作（彈匣、泵動、栓動、彈鏈、轉輪）、彈簧後座與噴射型態、槍口火光照明、曳光彈、拋殼、彈孔、觸覺回饋 |
| 💎 **克金武器機制** | 雙相（命中充能→過相）、熔爐（連射升溫→熔核爆裂）、迴刃（射出懸停鋸盤）、破疫（淨化標記）、節拍（完美換彈）|
| 🎨 **CS2 式塗裝**（原創命名） | 落日／極光／琥珀漸層、星渦（晚霞、夜紫、海淵、極光；硃砂／天青／翡翠／墨玉寶石相）、青嵐、三色釉、爐火淬（天青淬稀有圖樣）、赤網、朱砂斑紋／錘紋、金虎紋、雲豹、千層鋼、鏡面鉻與陽極、夜梟、藍白拖、碳纖、迷彩、鎏金雕花／回紋、銀雕；品相（凡→神）、磨損 float、種子、珠光／閃粉、斬數計 |
| 👹 **首領戰** | 屠宰者（衝撞、跳砸震波、投擲、暴怒）、災厄巨像→深淵之翼（變身飛行、吐酸掃射、俯衝）；地面預警、弱點、階段 |
| 🗺️ **失落之城** | 第一章（預設地圖）：重現第 1 季經典生存圖的十字街區與中央貨櫃堡壘；烘焙光照、6 個建造分區、28 個出怪點、兩場首領戰 |
| 🌐 **1–4 人連線** | 房號／公開房間列表；WebRTC 點對點＋MQTT 中繼備援；房主權威殭屍、命中由開火端判定 |
| 🤖 **AI 隊友** | 單人時可補滿小隊：跟隨、索敵、射擊、倒地救援 |
| 📱 **手機操作** | 浮動搖桿、拖曳視角、開火鍵可同時轉視角、瞄準切換、輔助瞄準與自動開火選項 |

## 操作

- **手機**：左半螢幕搖桿移動；右半螢幕拖曳轉視角；紅色鍵開火（按住時也能轉視角）；◎ 瞄準；↻ 換彈；⌃ 跳；⌄ 蹲；手雷；★ 武器特殊技；購買時間點「購買」。
- **電腦**：WASD 移動、滑鼠瞄準、左鍵開火、右鍵瞄準／特殊攻擊、R 換彈、空白跳、C 蹲、G 手雷、Q 特殊技、B 購買、E 互動、F 檢視武器、1–5 換武器。

## 開發

需要 Node.js 18+；打包 APK 另需 JDK 17 與 Android SDK（build-tools 35、platform 35），不需要 Gradle。

| 指令 | 用途 |
|---|---|
| `npm install` | 安裝相依套件 |
| `npm run dev` | 開發伺服器 http://127.0.0.1:5190 （改程式自動重建） |
| `npm run build:web` | 網頁版 → `dist/www/`（含所有遊戲資產） |
| `npm run build:site` | 建置網頁版及公開網站 → `dist/site/`（首頁直接遊玩） |
| `npm run build:apk` | 打包並簽署 `dist/CalamityFront.apk`（`-- -Debug` 可用 chrome://inspect 除錯） |
| `npm run build` | 以上兩者 |
| `npm run serve` | 區網下載頁＋QR Code |
| `node tools/assets/build-weapons.mjs [id]` | 重建槍械模型（`tools/assets/weapons/*.mjs`） |
| `node tools/assets/zombies/build.mjs <type>` | 重建殭屍模型 |
| `node tools/map/compile.mjs losttown` | 編譯地圖（含光照烘焙） |
| `node tools/shot.mjs <url>` | 無頭瀏覽器截圖（視覺 QA） |
| `node tools/mp-test.mjs` | 雙分頁連線實測 |

開發用網址參數：`?w=akm`（起始武器）、`?zombies=8`（生成測試殭屍）、`?map=losttown`、`?q=low|medium|high|ultra`、`?touch=1`、
`?host=1` / `?join=<房號>`、`?view=weapon&id=<槍>&grid=1`（槍械預覽）、`&finish=dusk_fade&seed=7&float=0.03`（塗裝預覽，另有 `&sfx=pearl:0.2,glitter:0.8`、`&counter=1234`、`&pv=auto`／`&remap=` 高階 shader 預覽）、`?view=zombie&id=walker_a`。

## 文件

- `docs/DESIGN.md` 設計總綱與需求審視
- `docs/research/` 調研（模式、殭屍與首領、武器與手感、素材來源、克金武器、CS2 塗裝、特效）
- `docs/WEAPON_MODELING.md` 槍械建模規範；`docs/ZOMBIE_PIPELINE.md`、`docs/ZOMBIE_ANIMS.md` 殭屍管線；`docs/MAP_LOSTTOWN.md`、`docs/MAP_KIT.md` 地圖
- `docs/NETWORK.md` 連線協定；`docs/CREDITS.md` 第三方素材與授權

## 簽署金鑰

`android/keystore/`（已排除在版本控制外）是 App 的簽署金鑰，**請備份**：之後的更新必須用同一把金鑰簽署才能覆蓋安裝。

## 授權

程式碼 MIT。第三方素材依 `docs/CREDITS.md`（CC0 為主；CMU 動作捕捉依其條款標註）。
