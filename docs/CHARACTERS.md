# 隊友角色 CHARACTERS（soldier）

第三人稱隊友（遠端玩家、AI 隊友）的模型與動作：`game/assets/characters/soldier.glb`（+ `soldier_lod1.glb`）。
沿用殭屍管線的 CC0 MakeHuman 資產與 `game_engine` 骨架（`tools/assets/zombies/lib`、`anim/` 只讀），角色自己的程式在
`tools/assets/characters/`。遊戲端：`game/src/player/remote.js`。

```
node --max-old-space-size=2048 tools/assets/characters/build.mjs soldier          # 完整（貼圖 + 動作 + LOD1，2–9 分鐘，視機器負載）
node --max-old-space-size=2048 tools/assets/characters/build.mjs soldier --fast   # 不畫貼圖（8×8 佔位），輸出到 build/soldier/fast/
node --max-old-space-size=2048 tools/assets/characters/build.mjs soldier --animonly  # 只重做動作（幾何沒改時；需要 build/soldier/animbase.json）
SOLDIER_ONLY=aim_rifle,fire_rifle SOLDIER_CHECK=warn …  --fast --nolod            # 只建部分 clip、碰撞檢查只警告（調參用）
node tools/assets/zombies/validate.mjs game/assets/characters/soldier.glb game/assets/characters/soldier_lod1.glb
```

輸出先寫到 `build/soldier/out/`，最後才複製進 `game/assets/characters/`（被 dev server / 瀏覽器開著的檔案不會寫到一半失敗）。

## 檔案

| 檔案 | 內容 |
|---|---|
| `soldier.mjs` | 身體（成年男性、手臂比例改成 0.30 / 0.275 m）、制服（CC0 male_casualsuit02 重畫：ripstop 依世界尺寸 5.5 mm）、裝備（防彈背心、彈匣包、腰帶、槍套、頭盔＋護目鏡＋耳機、手套、護膝）、皮膚（曬黑、平頭鬍渣、畫上的眉毛）、隊伍標記帶 |
| `boots.mjs` | 程序化高筒戰鬥靴：依 base mesh 腳／小腿逐高度環形放樣（鞋底凸緣＋鞋跟、腳尖空間、離腳踝 14.5 cm 的靴筒、軟墊靴口）、鞋帶／鞋眼／快速鉤、鞋頭護片、後跟片、鞋底紋 |
| `soldier_anims.mjs` | 動作（直接做在本角色骨架上）＋ 槍托碰撞解算 ＋ 建置時碰撞檢查 |
| `collide.mjs` | CPU 蒙皮的姿勢網格（可 refit 的 BVH）、武器 GLB 讀取（以 S_grip_r 為原點的武器空間） |
| `kit.mjs` | 網格工具（面板、帶子、圓柱、atlas 繪製）、GLB 動作附加 / extras 修補 |
| `dev/` | QA：`qa_remote.js`（遊戲內擺 clip＋武器）、`qa_states.js`（狀態機）、`qa_butt.js`（遊戲內槍托穿模量測）、`stock_profile.mjs`、`montage.cjs` |

## 執行期合約（root extras）

- `height`、`hitboxes`、`capsules`（同殭屍合約）。
- `handSocket`：武器座標系（原點 S_grip_r）在 `hand_r` 空間：`gun.quaternion = q; gun.position = p - S_grip_r.position·q`。
- `sling`：同樣慣例、父骨 `spine_03`；`revive` 播放時武器掛到背上（雙手救人），結束回到手上。
- `aimWeld`：`{ chain, eyeY, perMetre, minAngle, maxAngle, perWeapon: {id: rad} }`。aim / fire 以最高的步槍瞄準線（M4）製作；
  每把武器的點頭角度在建置時對該武器的槍托解出（眼睛到瞄準線上方 4 mm，頭不進槍托 > 9 mm）；未知武器用
  `(eyeY - 瞄準線高) × perMetre`。remote.js 在 aim / fire 時把角度加在 `chain`（neck_01 0.55、head 0.45）。
- `clips`：每個 clip 的 duration / loop / speed / events（`fire_*`: shots、`reload_*`: magOut / magIn / charge、`death`: ground）。
- 標記帶材質 `extras.slotTint`：remote.js 用 `SLOT_COLORS[slot]`（提高飽和度）上色。

## 動作（16 個，含別名 `run`）

`idle_rifle`、`walk_rifle`、`run_rifle`（= `run`）、`crouch_idle`、`crouch_walk`、`aim_rifle`、`fire_rifle`、`reload_rifle`、
`idle_pistol`、`aim_pistol`、`fire_pistol`、`reload_pistol`、`downed`、`revive`、`death`。

步槍持槍姿勢不是固定偏移：每格先把軀幹（身體＋制服＋背心，胸段）蒙皮，槍托從肩窩沿胸前方向推出到離表面 1.4 cm
（AK + M4 槍托取樣點），再看雙手搆不搆得到；搆不到時把槍口往下／往內轉（`dir2`）、支撐手沿護木往後滑（-0.30 → -0.19 m）。
最終（本版）：idle / walk / crouch / run 都不需要後備方向，槍口俯角 idle −41..−43°、walk −41°、run −33..−36°、crouch −22°。
aim 的槍托以接觸方式定位（往後拉再沿槍管推到剛好貼著肩帶）。

## 建置時碰撞檢查（超過 1 cm 建置失敗，`SOLDIER_CHECK=warn` 只警告）

每個步槍 clip 每一格：AK / M4 槍托取樣點在軀幹＋背心內的深度（前後兩方向都穿出才算在內）；aim / fire 的頭 / 頭盔頂點在
槍內、以及槍托點在頭頸內（套用該武器的 aimWeld 角度）；revive 背負的武器 vs 全身。MP5 / UMP / Vector / Uzi 也列出（僅參考）。
本版結果（cm，AK / M4）：所有持槍 clip 槍托 0.0–0.7；aim / fire 頭與槍 0.0 / ≤0.9；revive 背負 0.0。
遊戲內 `qa_butt.js`（three 蒙皮頂點、沿面向射線）：AK 七個 clip 全部 0.0 cm；M4 crouch_walk 單格 1.3 cm（貼著彈匣包）、
aim / fire 3 cm（M4 直托的後上緣擦過右下顎側面；橫向深度 ≤ 0.9 cm）。

## 數字（本版）

LOD0 8,915 tris（body 933、uniform 2,428、boots 710、gear 4,432、marker 240、eyes 172），2.34 MB，16 clips；
LOD1 2,494 tris（body 460、uniform 639、boots 180、gear 999、marker 120、eyes 96），0.63 MB（眼睛用 LOD0 貼圖）。
validate：兩個檔 glTF 0 errors、contract ok。
