# 網路連線（game/src/net/）

1–4 人合作、房主權威（host-authoritative）的星狀拓撲。沒有自己的伺服器：只用免費的公用 MQTT-over-WSS broker 做大廳、信令與備援中繼；能打通時遊戲資料走 WebRTC DataChannel 直連。

## 檔案

| 檔案 | 用途 |
|---|---|
| `game/src/net/session.js` | 對外 API：`listRooms` / `watchRooms` / `hostRoom` / `joinRoom` 與 `Room` |
| `game/src/net/link.js` | 每位 peer 一條連結：可靠／不可靠訊息、序號與 ack、P2P ⇄ 中繼切換、RTT |
| `game/src/net/rtc.js` | WebRTC：一個 PeerConnection＋兩條預先協商的 DataChannel |
| `game/src/net/mqtt.js` | 零依賴 MQTT 3.1.1 over WebSocket 客戶端（自 app1 移植，只改 client id 前綴） |
| `game/net-test.html`、`game/src/net/test-entry.js` | 測試頁：可多開分頁手動測，也給自動測試驅動 |
| `tools/build-net-test.mjs`、`tools/net-test.mjs` | 打包測試頁；headless Edge 多分頁端對端測試（真 broker、真 WebRTC） |

## API 摘要

```js
import { listRooms, watchRooms, hostRoom, joinRoom } from './net/session.js';

const rooms = await listRooms({ version });      // 一次掃描所有 broker（約 2–13 秒）
const w = watchRooms({ version, onChange });     // 大廳畫面用：房間陸續出現，w.stop() 結束
// RoomInfo: { code, name, host, players, maxPlayers, map, difficulty, state, version, age, joinable, reason }

const room = await hostRoom({ name, version, meta: { map, difficulty, state: 'lobby' } });
const room = await joinRoom(code, { name, version });   // 失敗：err.code + 中文 err.message
// 選項：forceRelay（不試 WebRTC）、hostRoom 另有 roomName / public / maxPlayers / allowLateJoin / onStatus

room.code; room.selfId; room.isHost; room.hostId; room.slot;   // 房主 slot 0，客人 1..3
room.peers;                     // Map id -> { id, name, slot, rtt, transport: 'p2p' | 'relay' }
room.send(type, data, { reliable = true, to });   // 客人一律送房主；房主可指定 to 或廣播
room.broadcast(type, data, { reliable, except });  // 房主
room.on('message', ({ from, type, data, reliable }) => {});
room.on('peer-join' | 'peer-leave' | 'peer-update' | 'meta' | 'status' | 'closed', fn);
room.setMeta({ state: 'playing' });  room.kick(id);  room.close();  room.stats();  room.players();
```

- `closed` 原因：`local`、`host-left`（房主離開或斷線）、`kicked`、`timeout`、`network`。`peer-leave` 原因：`left`、`kicked`、`lost`（遺囑／斷線）、`timeout`。
- `status` 事件是給 UI 的繁中文字（連線中…、P2P 直連成功、改用伺服器中繼…）。
- 加入被拒的 `err.code`：`bad-code`、`not-found`、`full`、`version`（`err.hostVersion`）、`playing`、`kicked`、`closed`、`network`、`timeout`。
- 每則訊息（`[seq,"type",data]` 的 JSON）上限 12 KB：可靠訊息超過會丟 `RangeError`，不可靠的直接丟棄並警告。`$` 開頭的 type 保留給內部。

## 傳輸與可靠層

- 每位客人與房主之間的連結一建立就能用 MQTT 中繼傳資料，同時用它傳 WebRTC 信令（offer / answer / trickle ICE，以內部可靠訊息 `$sig` 傳）。STUN：`stun.l.google.com:19302`、`stun1.l.google.com:19302`、`stun.cloudflare.com:3478`；沒有 TURN。
- 兩條 DataChannel 都用 `negotiated: true`：`rel`（有序可靠）與 `unrel`（`ordered: false, maxRetransmits: 0`）。兩條都 open 就切到 P2P。
- `joinRoom` 在 DataChannel 打通、或 6 秒還沒通（對稱型 NAT、不支援 WebRTC）時 resolve，後者就留在中繼；之後若晚一點打通仍會自動升級。房主那邊同樣在打通或 6 秒後才發 `peer-join`。
- P2P 中途斷掉（換網路等）立刻退回中繼，房主 2 秒後重新協商（每位客人最多 3 次）。
- 切換不丟不亂序：兩種傳輸共用同一套可靠序號與累積 ack。中繼上逾時重送（RTO 依 RTT 調整，1–4 秒）；P2P 上由 SCTP 重送，ack 只用來清掉待確認佇列。切換時把所有未確認訊息在新路徑重送，接收端依序號去重、補洞。
- 不可靠訊息「同 type 新的蓋舊的」：比已送達的同 type 舊的會被丟掉；走中繼時，同一 frame 內同 type 只留最新一則。
- RTT：每秒 ping/pong，扣掉對方的滯留時間；`rtt` 取最近 5 次的中位數。房主每 2 秒把每位客人的 rtt / 傳輸方式廣播給所有客人（`$net`）。

## MQTT 主題與 frame（前綴 `cfz1/`）

房間代碼 5 位數，第一位 = broker 編號＋1（`BROKERS`：EMQX、HiveMQ、Mosquitto）。

| 主題 | 內容 |
|---|---|
| `cfz1/r/<code>/i` | retained 房間資訊 `{v,t,n,h,p,m,map,d,s,pub,late}`：版本、時間戳、房名、房主名、人數、上限、地圖、難度、`lobby`/`playing`。房主每 15 秒（大廳變動時最快每秒）更新；關房與房主遺囑（last will）會清空 |
| `cfz1/r/<code>/h` | 給房主的 frame（所有客人都發到這裡；客人遺囑是一則 `bye lost`） |
| `cfz1/r/<code>/g` | 給客人的 frame（只有一個主題：一次 publish 就能帶給所有走中繼的客人） |

frame：`{"f": 發送者 id, "m": [item, ...]}`，item 用 `to`（某 id 或 `*`）定址：
`hello {n,v,ts,rtc}`、`welcome {slot,n,v,max,rn,meta,roster,rtc,ts}`、`reject {r,v}`、`bye {r}`、`d {a,r,u,pi,po,ph}`（某條連結的資料段）。
大廳狀態走各連結的可靠串流：`$roster`（成員表）、`$meta`（大廳 meta）、`$net`（ping 表，不可靠）。

- 節流：EMQX 每條連線超過 10 publish/秒會默默丟掉，所以每條連線最多 8 frame/秒（滑動視窗）；超過就等，並把資料合進下一個 frame。房主把所有中繼客人的資料段合在同一個 frame，預算共用。
- 房主建房時同時連所有 broker（每個用自己的新代碼，因為遺囑主題要在 CONNECT 時決定），以 SUBACK 往返時間挑最快的；死掉的 broker 不拖時間。
- 公開列表：訂閱 `cfz1/r/+/i`，忽略超過 60 秒沒更新的、`pub: 0` 的；超過 30 分鐘的殘留 retained 會順手清掉。

## 加入流程

1. 客人連到代碼指定的 broker，訂閱 `g` 與 `i`，讀 retained 資訊：版本不同、已滿、遊戲中（且房主沒開 `allowLateJoin`）就直接拒絕。讀不到資訊時仍會問房主 3 秒才回報 `not-found`。
2. 每秒送 `hello`，直到收到 `welcome`（含 slot、成員表、meta）或 `reject`（8 秒逾時）。
3. 房主分配最小的空 slot，立刻開始 WebRTC offer；DataChannel 打通或 6 秒後發 `peer-join` 並廣播成員表。

## 斷線偵測

- 任何傳輸上 10 秒沒收到對方任何東西就判定離線（房主：`peer-leave timeout`；客人：`closed timeout`）。
- 客人的 MQTT 遺囑是給房主的 `bye lost`；房主的遺囑會清空房間資訊，客人一直訂閱著 `i`，看到空資訊即視為房主可能已離開。這兩種提示之後若 2.5 秒（P2P）／8 秒（中繼，對方可能正在重連 broker）內都沒再收到對方的資料，就判定離開（`lost` / `host-left`）。
- 正常離開：先送出所有待送資料再送 `bye`（DataChannel 與中繼各送一次）；房主離開時客人收到 `closed host-left`。
- 自己的 broker 連線斷了會用同一個 client id 自動重連（1/2/4/8 秒退避）；期間 P2P 的連結照常運作。

## 測試

```
node tools/build-net-test.mjs     # 打包 game/net-test.js；開 http://127.0.0.1:5190/net-test.html 多分頁手動測
node tools/net-test.mjs           # 自動：probe / p2p / relay / mixed 四個情境（約 8–10 分鐘）
node tools/net-test.mjs --only relay
```

自動測試在一個 headless Edge 裡開最多 4 個分頁（1 房主＋3 客人），和 `tools/shot.mjs` 共用同一個瀏覽器數量上限（`cf-shot-locks`），結束（含失敗、Ctrl+C）一定 `taskkill /T` 整個瀏覽器行程樹。涵蓋：公開列表、3 人同時加入、滿房／版本不同／錯碼／找不到、可靠訊息順序（300 則 × 3 條串流 × 3 人）、60 Hz 不可靠串流、RTT、`setMeta`、P2P 中途斷線→中繼→恢復 P2P（訊息不丟不亂序）、客人離開、踢人、房主關房、強制中繼與發送頻率上限、混合傳輸、分頁直接被關（客人／房主當機）。
