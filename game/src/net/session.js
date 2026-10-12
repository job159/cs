// 災厄前線 online sessions: 1 host + up to 3 guests in a host-authoritative star. No server of our
// own: free public MQTT-over-WSS brokers carry the lobby, the WebRTC signaling and, when a direct
// DataChannel cannot be opened (symmetric NAT, no WebRTC), the game traffic itself.
//
// The room code's first digit says which broker the room lives on (BROKERS index + 1). Topics:
//   cfz1/r/<code>/i   retained room info (public list entry + join pre-check), refreshed every 15 s,
//                     cleared on close and by the host's last will
//   cfz1/r/<code>/h   frames to the host (every guest publishes here; a guest's will is a bye)
//   cfz1/r/<code>/g   frames to the guests (one topic: a single publish serves all relay guests)
// A frame is {"f": senderId, "m": [item, ...]}; items addressed with `to` (a session id or '*'):
//   hello {n, v, ts, rtc}  welcome {slot, n, v, max, rn, meta, roster, rtc, ts}  reject {r, v}
//   bye {r}  d {a, r, u, pi, po, ph}  (a link's data section, see link.js)
// Everything else (WebRTC offer/answer/ICE as '$sig', roster '$roster', lobby meta '$meta', the
// ping table '$net') travels as internal messages on each peer link's reliable stream, which starts
// on the relay and moves to the DataChannels once they open (link.js).
//
// broker.emqx.io silently drops publishes above 10/s per connection, so every connection spends at
// most FRAMES_PER_SEC publishes per sliding second; due data waits and merges into the next frame.
//
//   const rooms = await listRooms({ version });
//   const room = await hostRoom({ name, version, meta: { map, difficulty } });  // room.code
//   const room = await joinRoom(code, { name, version });
//   room.on('message', ({ from, type, data }) => ...); room.send('input', {...}, { reliable: false });
//   room.on('peer-join' | 'peer-leave' | 'peer-update' | 'meta' | 'status' | 'closed', fn);
import { MqttClient, randomString } from './mqtt.js';
import { Link, MAX_MESSAGE_BYTES, MAX_TRIES, utf8Length } from './link.js';
import { rtcSupported } from './rtc.js';

export { MAX_MESSAGE_BYTES };

/** Brokers in fallback order. The room code's first digit is the index + 1 (max 9 entries). */
export const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
];

export const MAX_PLAYERS = 4;

const PREFIX = 'cfz1/';
const LIST_TOPIC = PREFIX + 'r/+/i';
const MAX_FRAME_BYTES = 16000; // one MQTT payload
const MAX_META_BYTES = 4000;
const FRAMES_PER_SEC = 8; // publish budget per sliding second (EMQX drops above 10/s)
// One connect attempt. HiveMQ often needs 2-8 s: its IPv6 addresses refuse port 8884 only after
// ~3.6 s of SYN retries, and browsers do not always fall back to IPv4 quickly.
const CONNECT_MS = 10000;
const HOST_BROKER_MS = 16000; // host: give up on a broker after this long (brokers are raced)
const JOIN_CONNECT_MS = 20000; // guest: the code fixes the broker, so keep trying longer
const LIST_CONNECT_MS = 12000;
const CODE_CHECK_MS = 1000; // host: wait after SUBACK for a retained info on a candidate code
const PICK_WINDOW_MS = 2500; // host: after the first usable broker, slower ones may still win on rtt
const INFO_WAIT_MS = 6000; // guest: wait for the room's retained info...
const INFO_AFTER_SUBACK_MS = 2500; // ...but no longer than this past the SUBACK
const WELCOME_MS = 8000;
const STALE_WELCOME_MS = 3000; // info missing / stale (dead room, skewed clocks, slow broker): ask briefly anyway
const HELLO_EVERY_MS = 1000;
const INFO_EVERY_MS = 15000;
const INFO_MIN_GAP_MS = 1000; // lobby changes republish the info at most this often
const INFO_FRESH_MS = 60000;
const INFO_GC_MS = 30 * 60000; // list scans clear retained entries this old (a will that never fired)
const LIST_AFTER_SUBACK_MS = 1500;
const LIST_TOTAL_MS = 13000; // one-shot listRooms worst case; watchRooms shows rooms as they arrive
const P2P_WAIT_MS = 6000; // DataChannels not open by then: the peer starts on the relay
const P2P_RETRY_MS = 2000; // an open DataChannel died: renegotiate after this long
const P2P_MAX_TRIES = 3;
const PING_EVERY_MS = 1000;
const NET_EVERY_MS = 2000; // host -> guests: everyone's rtt / transport
const LOST_MS = 10000; // no traffic at all from a peer this long: gone
const HINT_P2P_MS = 2500; // after a will / cleared info: silence this long on p2p means gone...
const HINT_RELAY_MS = 8000; // ...and this long on the relay (its broker link may be reconnecting)
const PROBE_MS = 3000; // relay peer silent this long: make sure our own broker link still answers
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000];
const TICK_MS = 250;
const BASE36 = '0123456789abcdefghijklmnopqrstuvwxyz';
const SESSION_ID = /^[0-9A-Za-z]{1,32}$/;

const now = () => performance.now();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ERROR_TEXT = {
  'bad-code': '房間代碼不正確（應為 5 位數字）',
  'not-found': '找不到這個房間',
  full: '房間已滿',
  version: '遊戲版本不同，無法加入',
  playing: '遊戲已經開始，無法加入',
  kicked: '你已被房主請出房間',
  closed: '房間已關閉',
  network: '無法連線到伺服器',
  timeout: '房主沒有回應',
};

function roomError(code, extra, message) {
  return Object.assign(new Error(message || ERROR_TEXT[code] || code), { code }, extra);
}

function versionError(hostVersion, version) {
  return roomError('version', { hostVersion }, `遊戲版本不同（房主 ${hostVersion}，你 ${version}），請更新後再加入`);
}

function fullError(max) {
  return roomError('full', undefined, `房間已滿（${max}/${max} 人）`);
}

function makeCode(brokerIndex) {
  const r = new Uint16Array(1);
  do crypto.getRandomValues(r); while (r[0] >= 60000); // unbiased 0..9999
  return String(brokerIndex + 1) + String(r[0] % 10000).padStart(4, '0');
}

const roomBase = (code) => PREFIX + 'r/' + code + '/';
const cleanName = (n, max = 24) => (typeof n === 'string' ? Array.from(n.trim()).slice(0, max).join('') : '');
const str = (v, max = 40) => (typeof v === 'string' || typeof v === 'number' ? cleanName(String(v), max) : '');

/** Retained room info -> normalized object, or null if it is not ours / empty. */
function parseInfo(text) {
  if (!text) return null;
  try {
    const o = JSON.parse(text);
    if (!o || typeof o !== 'object' || typeof o.t !== 'number') return null;
    const max = Number.isInteger(o.m) && o.m >= 2 && o.m <= MAX_PLAYERS ? o.m : MAX_PLAYERS;
    return {
      v: String(o.v ?? ''),
      t: o.t,
      n: str(o.n, 32),
      h: str(o.h, 24),
      p: Number.isInteger(o.p) ? Math.max(0, Math.min(max, o.p)) : 0,
      m: max,
      map: str(o.map),
      d: str(o.d),
      s: o.s === 'playing' ? 'playing' : 'lobby',
      pub: o.pub !== 0,
      late: o.late === 1,
    };
  } catch {
    return null;
  }
}

// Phone clocks can disagree. A timestamp from the future counts as fresh; a live room whose info
// looks stale is still asked briefly before joinRoom reports not-found.
const isFresh = (info) => Date.now() - info.t < INFO_FRESH_MS;

function statusReporter(onStatus) {
  return (text) => {
    try {
      onStatus?.(text);
    } catch (e) {
      console.error(e);
    }
  };
}

/**
 * Connects, retrying failures until `budgetMs` is spent: test.mosquitto.org resets about half of all
 * TLS / WebSocket handshakes, sometimes 4 in a row; HiveMQ sometimes takes 8 s; EMQX answers
 * 'server unavailable' while overloaded. Unless `stubborn`, a timeout or a refused CONNACK is final
 * (a host would rather try the next broker); an offline device fails its DNS lookups instantly, so
 * it runs out of attempts quickly either way.
 */
async function connectClient(url, opts, { budgetMs = CONNECT_MS + 4000, stubborn = false } = {}) {
  const t0 = now();
  for (let attempt = 1; ; attempt++) {
    const left = budgetMs - (now() - t0);
    const client = new MqttClient(url, { connectTimeout: Math.max(2000, Math.min(CONNECT_MS, left)), ...opts });
    try {
      await client.connect();
      return client;
    } catch (e) {
      if (attempt >= 10 || (e.code !== 'network' && !stubborn) || now() - t0 + 1500 > budgetMs) throw e;
      await sleep(e.code === 'network' ? 250 : 1000);
    }
  }
}

/**
 * Subscribes to `topics`; resolves with the first info seen on infoTopic (null if empty), or null
 * after totalMs (or afterSubackMs past the SUBACK, if sooner: retained messages follow it).
 * onSuback(ms) gets the SUBSCRIBE -> SUBACK time: one round trip to the broker.
 */
function readInfo(client, topics, infoTopic, totalMs, afterSubackMs, onSuback) {
  return new Promise((resolve, reject) => {
    const deadline = now() + totalMs;
    let done = false;
    let timer = setTimeout(() => finish(null), totalMs);
    const finish = (info, err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      client.off('message', onMessage);
      client.off('close', onClose);
      if (err) reject(err);
      else resolve(info);
    };
    const onMessage = (topic, text) => {
      if (topic === infoTopic) finish(parseInfo(text));
    };
    const onClose = () => finish(null, roomError('network'));
    client.on('message', onMessage);
    client.on('close', onClose);
    const t0 = now();
    client.subscribe(topics).then(() => {
      onSuback?.(now() - t0);
      if (done) return;
      clearTimeout(timer);
      timer = setTimeout(() => finish(null), Math.max(0, Math.min(deadline - now(), afterSubackMs)));
    }, () => finish(null, roomError('network')));
  });
}

function sanitizeMeta(meta) {
  if (meta == null) return {};
  if (typeof meta !== 'object' || Array.isArray(meta)) throw new TypeError('room meta must be a plain object');
  const json = JSON.stringify(meta);
  if (utf8Length(json) > MAX_META_BYTES) throw new RangeError(`room meta is too big (max ${MAX_META_BYTES} bytes)`);
  return JSON.parse(json);
}

class Room {
  constructor(o) {
    /** 5-digit room code (first digit = broker). */
    this.code = o.code;
    this.isHost = o.isHost;
    /** This client's session id (random per room). */
    this.selfId = o.sid;
    /** The host's session id (null on a guest until it is accepted). */
    this.hostId = o.isHost ? o.sid : null;
    /** This player's slot: host 0, guests 1..3 (-1 until accepted). */
    this.slot = o.isHost ? 0 : -1;
    this.name = cleanName(o.name) || (o.isHost ? '房主' : '玩家');
    this.version = o.version;
    this.roomName = o.roomName || '';
    this.maxPlayers = o.maxPlayers || MAX_PLAYERS;
    this.isPublic = o.isPublic !== false;
    this.allowLateJoin = !!o.allowLateJoin;
    /** Lobby meta (map, difficulty, state 'lobby' | 'playing', ...), set by the host, synced to guests. */
    this.meta = o.meta || {};
    /** Other players: id -> {id, name, slot, rtt, transport}. On a guest, rtt / transport of another
     *  guest describe that guest's own link to the host. */
    this.peers = new Map();
    /** Broker URL this room lives on. */
    this.broker = o.url;
    this.forceRelay = !!o.forceRelay;
    this.closed = false;
    this.statusText = '';
    this._rtcOk = !this.forceRelay && rtcSupported();
    this._clientId = o.clientId;
    this._will = o.will || null;
    const base = roomBase(o.code);
    this._tInfo = base + 'i';
    this._tIn = base + (o.isHost ? 'h' : 'g');
    this._tOut = base + (o.isHost ? 'g' : 'h');
    this._client = null;
    this._links = new Map(); // peer id -> Link (host: every accepted guest; guest: the host)
    this._ev = new Map();
    this._inbox = []; // messages that arrived before anyone listened
    this._ctrlQ = []; // control items for the next relay frame: {text, bytes}
    this._tailQ = []; // control items that go after the data (a bye must not overtake it)
    this._sent = []; // publish times within the last second (pacing)
    this._rr = 0;
    this._timer = 0;
    this._flushQueued = false;
    this._flushTimer = 0;
    this._flushAt = 0;
    this._joining = null;
    this._settled = o.isHost;
    this._expectRtc = false;
    this._helloSent = false;
    this._reconnecting = false;
    this._closing = null;
    this._infoAt = 0;
    this._infoDue = false;
    this._netAt = 0;
    this._probeAt = 0;
    this._kicked = new Set();
    this._throttled = new Map();
    this._lossRate = 0; // test hook: share of outgoing relay frames silently dropped
    this._stats = { framesOut: 0, framesIn: 0, deferred: 0, reconnects: 0 };
    this._onMessage = (topic, text) => this._onMqtt(topic, text);
    this._onClose = () => this._onClientClose();
    this._say = statusReporter(o.onStatus);
  }

  // ---------------------------------------------------------------- public API

  on(event, fn) {
    if (!this._ev.has(event)) this._ev.set(event, new Set());
    this._ev.get(event).add(fn);
    if (event === 'message' && this._inbox.length) queueMicrotask(() => this._drainInbox());
    return this;
  }

  off(event, fn) {
    this._ev.get(event)?.delete(fn);
    return this;
  }

  /**
   * Sends a JSON message. Guest: always to the host. Host: to `to` (an id or a list of ids), else to
   * every joined guest except `except` (id or list).
   * reliable (default): delivered once, in order (per sender), across transport switches.
   * unreliable: may be lost; a message older than the newest delivered of its type is dropped, and
   * on the relay queued messages of one type collapse to the newest.
   * Returns false when nobody got it. A reliable message above MAX_MESSAGE_BYTES throws RangeError
   * (dropping it would desync the game); an unreliable one is dropped with a warning.
   */
  send(type, data, { reliable = true, to, except } = {}) {
    if (this.closed) return false;
    type = String(type);
    if (!type || type[0] === '$') throw new TypeError(`bad message type "${type}" (empty or starting with "$")`);
    const dataJson = JSON.stringify(data === undefined ? null : data);
    const bytes = utf8Length(dataJson) + utf8Length(JSON.stringify(type)) + 13; // [seq,"type",data]
    if (bytes > MAX_MESSAGE_BYTES) {
      if (reliable) throw new RangeError(`net message "${type}" is ${bytes} bytes (max ${MAX_MESSAGE_BYTES})`);
      if (this._throttle('big:' + type, 10000)) console.warn(`net: unreliable "${type}" dropped: ${bytes} bytes (max ${MAX_MESSAGE_BYTES})`);
      return false;
    }
    let targets;
    if (!this.isHost) {
      const l = this._links.get(this.hostId);
      targets = l && this._settled ? [l] : [];
    } else if (to !== undefined && to !== null) {
      targets = [].concat(to).map((id) => this._links.get(id)).filter((l) => l && l.joined);
    } else {
      const skip = new Set([].concat(except ?? []));
      targets = [...this._links.values()].filter((l) => l.joined && !skip.has(l.id));
    }
    let ok = false;
    for (const l of targets) ok = l.send(type, dataJson, reliable) || ok;
    return ok;
  }

  /** Host: send() to every joined guest (opts.except skips some). On a guest: same as send(). */
  broadcast(type, data, opts = {}) {
    if (!this.isHost) return this.send(type, data, opts);
    const { to, ...rest } = opts;
    return this.send(type, data, rest);
  }

  /** Host: merges `patch` into the lobby meta, syncs it to the guests and the public room list. */
  setMeta(patch) {
    if (!this.isHost) throw new Error('setMeta: host only');
    if (this.closed) return;
    const next = { ...this.meta, ...sanitizeMeta(patch) };
    for (const k of Object.keys(next)) if (next[k] === null || next[k] === undefined) delete next[k];
    this.meta = sanitizeMeta(next);
    for (const l of this._links.values()) l.sendInternal('$meta', this.meta);
    this._infoDue = true; // the tick republishes the list entry
  }

  /** Host: removes a guest (its room closes with reason 'kicked'). */
  kick(id) {
    if (!this.isHost || this.closed) return false;
    const l = this._links.get(id);
    if (!l) return false;
    this._kicked.add(id);
    this._flush(true);
    l.sayByeP2P('kicked');
    this._ctrl({ k: 'bye', to: id, r: 'kicked' });
    this._dropLink(l, 'kicked');
    return true;
  }

  /** Every player including this one, by slot: {id, name, slot, rtt, transport, self}. */
  players() {
    const list = [{ id: this.selfId, name: this.name, slot: this.slot, rtt: 0, transport: 'self', self: true }];
    for (const p of this.peers.values()) list.push({ ...p, self: false });
    return list.sort((a, b) => a.slot - b.slot);
  }

  /**
   * Leaves the room. Queued messages are flushed first, then a bye: a host's guests close with
   * 'host-left', a guest leaves the host's room ('peer-leave' reason 'left'). A host also clears its
   * public list entry. Emits 'closed' 'local'. Resolves when the broker connection is closed.
   */
  close(reason = 'left') {
    if (this.closed) return this._closing || Promise.resolve();
    const c = this._client;
    const r = this.isHost ? 'host-left' : 'left';
    for (const l of this._links.values()) l.flushP2P(now());
    for (const l of this._links.values()) l.sayByeP2P(r);
    if (c && c.connected) {
      if (this.isHost) {
        this._publish(this._tInfo, '', true);
        if (this._links.size) this._ctrl({ k: 'bye', to: '*', r }, true);
      } else if (this.hostId) this._ctrl({ k: 'bye', to: this.hostId, r }, true);
      // Queued data and the bye usually share one last frame (sent past the budget: we are leaving).
      this._flushRelay(now(), true);
    }
    this._finish('local', reason);
    this._closing = c ? c.disconnect() : Promise.resolve();
    return this._closing;
  }

  /** Counters for debugging / an on-screen network panel. */
  stats() {
    const c = this._client;
    return {
      code: this.code,
      isHost: this.isHost,
      selfId: this.selfId,
      slot: this.slot,
      broker: this.broker,
      mqtt: {
        connected: !!c && c.connected && !this._reconnecting,
        pingRtt: c ? Math.round(c.pingRtt) : 0,
        publishesLastSec: this._sent.filter((t) => now() - t < 1000).length,
        ...this._stats,
      },
      peers: [...this._links.values()].map((l) => ({
        id: l.id,
        name: l.name,
        slot: l.slot,
        joined: l.joined,
        transport: l.transport,
        p2p: l.p2p,
        p2pMs: l.p2pMs,
        rtt: l.rtt,
        pending: l.pendingCount,
        ...l.stats,
      })),
    };
  }

  // ---------------------------------------------------------------- events

  _emit(event, ...args) {
    const set = this._ev.get(event);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(...args);
      } catch (e) {
        console.error(e);
      }
    }
  }

  _status(text) {
    this.statusText = text;
    this._say(text);
    this._emit('status', text);
  }

  _deliver(msg) {
    const listening = this._ev.get('message')?.size > 0;
    if (this._inbox.length || !listening) {
      if (this._inbox.length < 5000) this._inbox.push(msg);
      if (listening) queueMicrotask(() => this._drainInbox());
      return;
    }
    this._emit('message', msg);
  }

  _drainInbox() {
    while (this._inbox.length && !this.closed && this._ev.get('message')?.size > 0) {
      this._emit('message', this._inbox.shift());
    }
  }

  _throttle(key, ms) {
    const t = now();
    const last = this._throttled.get(key);
    if (last !== undefined && t - last < ms) return false;
    if (this._throttled.size > 100) this._throttled.clear();
    this._throttled.set(key, t);
    return true;
  }

  // ---------------------------------------------------------------- callbacks from links

  _linkDeliver(link, type, data, reliable) {
    if (this.isHost && !link.joined) this._announce(link); // a guest that settled before we did
    this._deliver({ from: link.id, type, data, reliable });
  }

  _linkInternal(link, type, data) {
    if (type === '$sig') {
      if (this.isHost ? link.rtc : this._rtcOk) link.onSignal(data);
      return;
    }
    if (this.isHost || link.id !== this.hostId) return;
    if (type === '$roster') this._applyRoster(data, this._settled);
    else if (type === '$meta') {
      if (!data || typeof data !== 'object') return;
      this.meta = data;
      if (this._settled) this._emit('meta', this.meta);
    } else if (type === '$net') this._applyNet(data);
  }

  _linkTransport(link) {
    if (link.closed || this.closed) return;
    const p = this.peers.get(link.id);
    if (p) {
      p.transport = link.transport;
      p.rtt = link.rtt;
    }
    const who = this.isHost ? `「${link.name}」` : '與房主';
    if (link.transport === 'p2p') this._status(`${who} P2P 直連成功`);
    else if (link.joined || this._settled) this._status(`${who} P2P 中斷，改用伺服器中繼`);
    if (p && (this.isHost ? link.joined : this._settled)) this._emit('peer-update', p);
    if (this.isHost) this._maybeAnnounce(link);
  }

  _linkRtcClosed(link, why, wasOpen) {
    if (this.closed || link.closed || !this.isHost) return;
    // An open path that died (Wi-Fi <-> mobile switch...) is worth renegotiating; one that never
    // opened (symmetric NAT) would fail the same way again.
    if (wasOpen && link.rtcTries < P2P_MAX_TRIES) {
      setTimeout(() => {
        if (!this.closed && !link.closed && !link.rtc) link.startRtc();
      }, P2P_RETRY_MS);
    }
    this._maybeAnnounce(link);
  }

  _linkBye(link, r) {
    if (this.isHost) this._dropLink(link, 'left');
    else this._hostBye(r);
  }

  _scheduleFlush(delay) {
    if (delay <= 0) {
      if (this._flushQueued) return;
      this._flushQueued = true;
      queueMicrotask(() => {
        this._flushQueued = false;
        this._flush();
      });
      return;
    }
    const at = now() + delay;
    if (this._flushTimer && this._flushAt <= at) return;
    clearTimeout(this._flushTimer);
    this._flushAt = at;
    this._flushTimer = setTimeout(() => {
      this._flushTimer = 0;
      this._flush();
    }, delay);
  }

  // ---------------------------------------------------------------- output

  _flush(force = false) {
    if (this.closed) return;
    const t = now();
    for (const l of this._links.values()) if (l.transport === 'p2p') l.flushP2P(t);
    this._flushRelay(t, force);
  }

  _budget(t) {
    const s = this._sent;
    while (s.length && t - s[0] >= 1000) s.shift();
    return FRAMES_PER_SEC - s.length;
  }

  _publish(topic, text, retain = false) {
    const c = this._client;
    if (!c || !c.connected) return false;
    this._sent.push(now());
    return c.publish(topic, text, { retain });
  }

  /** Queues a control item for the next relay frame; `last`: after this frame's data sections. */
  _ctrl(obj, last = false) {
    const text = JSON.stringify(obj);
    const bytes = utf8Length(text);
    if (bytes > MAX_FRAME_BYTES - 64) return;
    (last ? this._tailQ : this._ctrlQ).push({ text, bytes });
    this._scheduleFlush(0);
  }

  /**
   * One relay "multiplexer" per broker connection: control items first, then each relay peer's
   * data section (round robin), packed into as few frames as the publish budget allows.
   */
  _flushRelay(t, force) {
    const c = this._client;
    const links = [];
    for (const l of this._links.values()) if (l.transport === 'relay' && !l.closed) links.push(l);
    if (!c || !c.connected || this._reconnecting) {
      for (const l of links) l.dropRelayUnreliable();
      this._ctrlQ.length = 0;
      this._tailQ.length = 0;
      return;
    }
    if (links.length > 1) links.push(...links.splice(0, this._rr++ % links.length));
    const work = () => this._ctrlQ.length > 0 || this._tailQ.length > 0 || links.some((l) => l.hasRelayWork(t));
    if (!work()) return;
    const budget = force ? Infinity : this._budget(t);
    if (budget < 1) {
      this._deferFlush(t);
      return;
    }
    const head = '{"f":"' + this.selfId + '","m":[';
    let frames = 0;
    while (frames < budget && work()) {
      const items = [];
      let size = head.length + 2;
      while (this._ctrlQ.length && size + this._ctrlQ[0].bytes + 1 <= MAX_FRAME_BYTES) {
        const it = this._ctrlQ.shift();
        items.push(it.text);
        size += it.bytes + 1;
      }
      for (const l of links) {
        const sec = l.relaySection(t, MAX_FRAME_BYTES - size - 1);
        if (!sec) continue;
        items.push(sec.text);
        size += sec.bytes + 1;
      }
      if (!links.some((l) => l.hasRelayWork(t))) {
        while (this._tailQ.length && size + this._tailQ[0].bytes + 1 <= MAX_FRAME_BYTES) {
          const it = this._tailQ.shift();
          items.push(it.text);
          size += it.bytes + 1;
        }
      }
      if (!items.length) break;
      frames++;
      this._stats.framesOut++;
      if (this._lossRate && Math.random() < this._lossRate) {
        this._sent.push(now()); // a lost frame still spent its budget
        continue;
      }
      this._publish(this._tOut, head + items.join(',') + ']}');
    }
    if (work()) this._deferFlush(now());
  }

  _deferFlush(t) {
    const s = this._sent;
    const k = s.length - FRAMES_PER_SEC; // entries that must expire before one frame fits
    const wait = k >= 0 ? s[k] + 1000 - t : 0;
    this._stats.deferred++;
    this._scheduleFlush(Math.max(5, wait + 2));
  }

  _publishInfo() {
    this._infoAt = now();
    this._infoDue = false;
    const m = this.meta;
    this._publish(this._tInfo, JSON.stringify({
      v: this.version,
      t: Date.now(),
      n: this.roomName,
      h: this.name,
      p: 1 + this._links.size,
      m: this.maxPlayers,
      map: str(m.map),
      d: str(m.difficulty),
      s: m.state === 'playing' ? 'playing' : 'lobby',
      pub: this.isPublic ? 1 : 0,
      late: this.allowLateJoin ? 1 : 0,
    }), true);
  }

  // ---------------------------------------------------------------- input

  _attach(client) {
    this._client = client;
    client.on('message', this._onMessage);
    client.on('close', this._onClose);
  }

  _onMqtt(topic, text) {
    if (this.closed) return;
    if (topic === this._tInfo) {
      // The host's will (or a close) cleared the room info: the host is probably gone. Its link
      // decides: any traffic from it within the grace period cancels the hint.
      const l = this._links.get(this.hostId);
      if (!this.isHost && l && !text && !l.byeHint) l.byeHint = now();
      return;
    }
    if (topic !== this._tIn) return;
    let m;
    try {
      m = JSON.parse(text);
    } catch {
      return;
    }
    // Anyone can publish on a public broker: only well-formed frames from plain ids get through.
    if (!m || typeof m !== 'object' || typeof m.f !== 'string' || !SESSION_ID.test(m.f) || m.f === this.selfId || !Array.isArray(m.m)) return;
    this._stats.framesIn++;
    for (const it of m.m) {
      if (this.closed) return;
      if (!it || typeof it !== 'object' || typeof it.k !== 'string') continue;
      if (it.to !== undefined && it.to !== this.selfId && it.to !== '*') continue;
      if (this.isHost) this._hostItem(m.f, it);
      else this._guestItem(m.f, it);
    }
  }

  _hostItem(f, it) {
    const l = this._links.get(f);
    if (it.k === 'hello') this._onHello(f, it);
    else if (it.k === 'd') {
      if (l) l.onData(it, 'relay');
      else if (this._throttle('gone:' + f, 2000)) this._ctrl({ k: 'bye', to: f, r: this._kicked.has(f) ? 'kicked' : 'dropped' });
    } else if (it.k === 'bye' && l) {
      // 'lost' is a guest's last will: its broker link died, but its DataChannel may be fine.
      if (it.r === 'lost') l.byeHint ||= now();
      else this._dropLink(l, 'left');
    }
  }

  _guestItem(f, it) {
    if (this._joining) {
      if (it.to !== this.selfId) return;
      if (it.k === 'welcome') this._onWelcome(f, it);
      else if (it.k === 'reject') {
        const r = it.r;
        this._joinDone(r === 'version' ? versionError(String(it.v), this.version) : r === 'full' ? fullError(this.maxPlayers) : roomError(ERROR_TEXT[r] ? r : 'closed'));
      }
      return;
    }
    if (f !== this.hostId) return;
    if (it.k === 'd') this._links.get(f)?.onData(it, 'relay');
    else if (it.k === 'bye') this._hostBye(it.r);
  }

  // ---------------------------------------------------------------- host: guests joining / leaving

  _onHello(gid, it) {
    const ts = typeof it.ts === 'number' ? it.ts : undefined;
    const known = this._links.get(gid);
    if (known) { // our welcome got lost: repeat it
      this._sendWelcome(known, ts);
      return;
    }
    if (!this._throttle('hello:' + gid, 400)) return;
    const reject = (r) => this._ctrl({ k: 'reject', to: gid, r, v: this.version });
    if (this._kicked.has(gid)) return reject('kicked');
    if (String(it.v) !== this.version) return reject('version');
    if (this._links.size + 1 >= this.maxPlayers) return reject('full');
    if (this.meta.state === 'playing' && !this.allowLateJoin) return reject('playing');
    const used = new Set([...this._links.values()].map((l) => l.slot));
    let slot = 1;
    while (used.has(slot)) slot++;
    const link = new Link(this, gid, { name: cleanName(it.n) || `玩家 ${slot + 1}`, slot });
    this._links.set(gid, link);
    const p2p = this._rtcOk && it.rtc === 1;
    this._sendWelcome(link, ts, p2p);
    this._status(`「${link.name}」加入中…`);
    if (p2p) link.startRtc();
    this._infoDue = true;
    this._maybeAnnounce(link);
  }

  _sendWelcome(link, ts, p2p = link.p2p !== 'off') {
    this._ctrl({
      k: 'welcome', to: link.id, slot: link.slot, n: this.name, v: this.version, max: this.maxPlayers,
      rn: this.roomName, meta: this.meta, roster: this._roster(), rtc: p2p ? 1 : 0, ts,
    });
  }

  /** Host: a pending guest joins once its DataChannels opened or P2P_WAIT_MS passed. */
  _maybeAnnounce(link) {
    if (link.joined || link.closed || !this.isHost) return;
    if (link.p2p === 'connecting' && link.transport !== 'p2p' && now() - link.createdAt < P2P_WAIT_MS) return;
    this._announce(link);
  }

  _announce(link) {
    if (link.joined || link.closed) return;
    link.joined = true;
    const peer = { id: link.id, name: link.name, slot: link.slot, rtt: link.rtt, transport: link.transport };
    this.peers.set(link.id, peer);
    this._sendRoster();
    this._infoDue = true;
    this._status(`「${link.name}」已加入（${link.transport === 'p2p' ? 'P2P 直連' : '伺服器中繼'}）`);
    this._emit('peer-join', peer);
  }

  _roster() {
    const list = [{ id: this.selfId, name: this.name, slot: 0 }];
    for (const l of this._links.values()) if (l.joined) list.push({ id: l.id, name: l.name, slot: l.slot });
    return list;
  }

  _sendRoster(left) {
    const data = { list: this._roster() };
    if (left) data.left = left;
    for (const l of this._links.values()) l.sendInternal('$roster', data);
  }

  _dropLink(link, reason) {
    if (this._links.get(link.id) !== link) return;
    this._links.delete(link.id);
    link.close(300); // a DataChannel bye written just now still goes out
    const peer = this.peers.get(link.id);
    this.peers.delete(link.id);
    this._infoDue = true;
    if (!link.joined) return;
    this._sendRoster([link.id, reason]);
    this._status(`「${link.name}」${reason === 'kicked' ? '已被請出房間' : '離開了'}`);
    this._emit('peer-leave', { ...peer, reason });
  }

  // ---------------------------------------------------------------- guest: roster from the host

  _applyRoster(data, emit) {
    if (!data || !Array.isArray(data.list)) return;
    const seen = new Set();
    for (const r of data.list) {
      if (!r || typeof r.id !== 'string' || !SESSION_ID.test(r.id) || !Number.isInteger(r.slot)) continue;
      if (r.id === this.selfId) {
        this.slot = r.slot;
        continue;
      }
      seen.add(r.id);
      const p = this.peers.get(r.id);
      if (p) {
        p.name = cleanName(r.name);
        p.slot = r.slot;
        continue;
      }
      const host = this._links.get(r.id);
      const peer = { id: r.id, name: cleanName(r.name), slot: r.slot, rtt: host ? host.rtt : 0, transport: host ? host.transport : 'relay' };
      this.peers.set(r.id, peer);
      if (emit) this._emit('peer-join', peer);
    }
    for (const [id, p] of [...this.peers]) {
      if (seen.has(id) || id === this.hostId) continue;
      this.peers.delete(id);
      const reason = Array.isArray(data.left) && data.left[0] === id ? String(data.left[1]) : 'left';
      if (emit) this._emit('peer-leave', { ...p, reason });
    }
  }

  _applyNet(data) {
    if (!data || typeof data !== 'object') return;
    for (const [id, v] of Object.entries(data)) {
      const p = this.peers.get(id);
      if (!p || id === this.hostId || !Array.isArray(v)) continue;
      if (typeof v[0] === 'number') p.rtt = v[0];
      p.transport = v[1] === 1 ? 'p2p' : 'relay';
    }
  }

  _hostBye(r) {
    const reason = r === 'kicked' ? 'kicked' : r === 'dropped' ? 'timeout' : 'host-left';
    this._shutdown(reason, typeof r === 'string' ? r.slice(0, 40) : undefined);
  }

  // ---------------------------------------------------------------- liveness, reconnect, closing

  _startTimer() {
    if (!this._timer && !this.closed) this._timer = setInterval(() => this._tick(), TICK_MS);
  }

  _tick() {
    if (this.closed) return;
    const t = now();
    const c = this._client;
    const online = !!c && c.connected && !this._reconnecting;
    if (this.isHost && online && (t - this._infoAt >= INFO_EVERY_MS || (this._infoDue && t - this._infoAt >= INFO_MIN_GAP_MS))) this._publishInfo();
    if (this.isHost && t - this._netAt >= NET_EVERY_MS) {
      this._netAt = t;
      const net = {};
      for (const l of this._links.values()) if (l.joined) net[l.id] = [l.rtt, l.transport === 'p2p' ? 1 : 0];
      for (const l of this._links.values()) if (l.joined) l.sendInternal('$net', net, false);
    }
    for (const l of [...this._links.values()]) {
      if (l.closed) continue;
      const silent = t - l.lastHeard;
      const hinted = l.byeHint && t - l.byeHint >= (l.transport === 'p2p' ? HINT_P2P_MS : HINT_RELAY_MS);
      if (silent >= LOST_MS || hinted || l.maxTries >= MAX_TRIES) {
        // A will / cleared info is positive evidence that the peer's side died; plain silence is not.
        const reason = l.byeHint ? (this.isHost ? 'lost' : 'host-left') : silent >= LOST_MS ? 'timeout' : 'network';
        if (this.isHost) this._dropLink(l, reason);
        else this._shutdown(reason);
        if (this.closed) return;
        continue;
      }
      if (this.isHost) this._maybeAnnounce(l);
      if (t - l.pingAt >= PING_EVERY_MS) l.ping(t);
      if (l.transport === 'relay' && silent >= PROBE_MS && online && t - this._probeAt >= PROBE_MS) {
        this._probeAt = t;
        c.probe(); // a dead link of our own fails the probe and triggers a reconnect
      }
      const p = this.peers.get(l.id);
      if (p) {
        p.rtt = l.rtt;
        p.transport = l.transport;
      }
    }
    this._flush(); // relay resends that are due
  }

  _onClientClose() {
    if (this.closed) return;
    const c = this._client;
    if (c) {
      c.off('message', this._onMessage);
      c.off('close', this._onClose);
    }
    this._client = null;
    if (this._joining) {
      this._joinDone(roomError('network'));
      return;
    }
    if (this._reconnecting) return;
    this._reconnecting = true;
    this._status('與伺服器斷線，重新連線中…');
    this._reconnect();
  }

  /**
   * Same broker, same client id (takes over a half-dead session), backoff 1/2/4/8 s, until the room
   * closes: p2p peers keep playing meanwhile; relay peers time out after LOST_MS if it never returns.
   */
  async _reconnect() {
    for (let i = 0; !this.closed; i++) {
      await sleep(RECONNECT_DELAYS[Math.min(i, RECONNECT_DELAYS.length - 1)]);
      if (this.closed) return;
      let client;
      try {
        client = await connectClient(this.broker, { clientId: this._clientId, will: this._will }, { budgetMs: JOIN_CONNECT_MS, stubborn: true });
      } catch {
        continue;
      }
      try {
        client.on('message', this._onMessage);
        await client.subscribe(this.isHost ? this._tIn : [this._tIn, this._tInfo]);
      } catch {
        client.off('message', this._onMessage);
        client.disconnect();
        continue;
      }
      if (this.closed) {
        client.off('message', this._onMessage);
        client.disconnect();
        return;
      }
      client.off('message', this._onMessage);
      this._attach(client);
      this._reconnecting = false;
      this._stats.reconnects++;
      for (const l of this._links.values()) {
        l.resetRelayTimers();
        l.lastHeard = Math.max(l.lastHeard, now() - LOST_MS / 2); // relay peers get time to answer
      }
      if (this.isHost) this._publishInfo();
      this._status('已重新連線');
      this._tick();
      return;
    }
  }

  /** Ends the room for a non-local reason: best-effort cleanup, then disconnect. */
  _shutdown(reason, detail) {
    if (this.closed) return;
    const c = this._client;
    if (c && c.connected && this.isHost) this._publish(this._tInfo, '', true);
    this._finish(reason, detail);
    if (c) this._closing = c.disconnect();
  }

  _finish(reason, detail) {
    this.closed = true;
    this._reconnecting = false;
    clearInterval(this._timer);
    this._timer = 0;
    clearTimeout(this._flushTimer);
    this._flushTimer = 0;
    const c = this._client;
    if (c) {
      c.off('message', this._onMessage);
      c.off('close', this._onClose);
    }
    for (const l of this._links.values()) l.close(300);
    this._joinDone(roomError('closed'));
    const text = { local: '已離開房間', 'host-left': '房主已關閉房間', kicked: ERROR_TEXT.kicked, timeout: '與房主失去聯繫' }[reason] || '連線中斷';
    this._status(text);
    this._emit('closed', reason, detail);
  }

  // ---------------------------------------------------------------- guest handshake

  _handshake(ms, timeoutCode) {
    return new Promise((resolve, reject) => {
      const hello = () => {
        this._helloSent = true;
        this._ctrl({ k: 'hello', n: this.name, v: this.version, ts: Math.round(now() * 10) / 10, rtc: this._rtcOk ? 1 : 0 });
      };
      this._joining = {
        resolve,
        reject,
        hello: setInterval(hello, HELLO_EVERY_MS),
        timer: setTimeout(() => this._joinDone(roomError(timeoutCode)), ms),
      };
      hello();
    });
  }

  _joinDone(err) {
    const j = this._joining;
    if (!j) return;
    this._joining = null;
    clearInterval(j.hello);
    clearTimeout(j.timer);
    if (err) j.reject(err);
    else j.resolve();
  }

  _onWelcome(f, it) {
    if (!SESSION_ID.test(f) || !Number.isInteger(it.slot)) return;
    this.hostId = f;
    this.slot = it.slot;
    if (Number.isInteger(it.max)) this.maxPlayers = it.max;
    this.roomName = str(it.rn, 32);
    this.meta = it.meta && typeof it.meta === 'object' ? it.meta : {};
    const link = new Link(this, f, { name: cleanName(it.n) || '房主', slot: 0 });
    this._links.set(f, link);
    if (typeof it.ts === 'number') link.seedRtt(now() - it.ts);
    this._expectRtc = this._rtcOk && it.rtc === 1;
    if (this._expectRtc) link.p2p = 'connecting'; // the host's offer is on its way
    this._applyRoster({ list: it.roster }, false);
    this._joinDone(null);
    this._startTimer();
  }

  /** Guest: waits until the DataChannels are open, P2P failed, or `ms` passed. */
  _waitSettle(ms) {
    const l = this._links.get(this.hostId);
    if (!l || !this._expectRtc) return Promise.resolve();
    return new Promise((resolve) => {
      const t0 = now();
      const iv = setInterval(() => {
        if (this.closed || l.p2p !== 'connecting' || now() - t0 >= ms) {
          clearInterval(iv);
          resolve();
        }
      }, 25);
    });
  }

  /** A join that failed: no events, just let go (and tell the host in case it did accept us). */
  _abort() {
    const c = this._client;
    if (c && c.connected && this._helloSent) {
      this._ctrlQ.length = 0;
      this._ctrl({ k: 'bye', r: 'left' }, true);
      this._flushRelay(now(), true);
    }
    this._joining = null;
    this.closed = true;
    clearInterval(this._timer);
    clearTimeout(this._flushTimer);
    for (const l of this._links.values()) l.close();
    if (c) {
      c.off('message', this._onMessage);
      c.off('close', this._onClose);
    }
    this._client = null;
  }

  // ---------------------------------------------------------------- test hooks

  /** Kills the DataChannels to `id` (default: every peer) as if the direct path died. */
  _debugBreakP2P(id) {
    let n = 0;
    for (const l of this._links.values()) if ((id === undefined || l.id === id) && l.breakP2P()) n++;
    return n;
  }

  /** Drops the broker connection without DISCONNECT (the broker publishes our will). */
  _debugDropMqtt() {
    this._client?.terminate();
  }
}

/**
 * Hosts a new room on the quickest reachable broker (see raceBrokers), publishes the retained room
 * info and waits for guests. Rejects with err.code 'network' if no broker works.
 * @param {object} o
 * @param {string} o.version game version; guests must match exactly
 * @param {string} [o.name] the host player's name
 * @param {object} [o.meta] lobby meta, e.g. {map, difficulty, state: 'lobby'}
 * @param {string} [o.roomName] shown in the public list (default "<name>的房間")
 * @param {boolean} [o.public=true] false: not shown by listRooms (join by code only)
 * @param {number} [o.maxPlayers=4] 2..4, host included
 * @param {boolean} [o.allowLateJoin=false] accept joins while meta.state === 'playing'
 * @param {boolean} [o.forceRelay=false] never try WebRTC (testing, or a network that blocks UDP)
 * @param {number} [o.broker] BROKERS index to use (default: the quickest that works)
 * @param {(text: string) => void} [o.onStatus] progress text (Traditional Chinese)
 * @returns {Promise<Room>}
 */
export async function hostRoom(o = {}) {
  const version = String(o.version ?? '');
  const meta = sanitizeMeta(o.meta);
  const say = statusReporter(o.onStatus);
  const name = cleanName(o.name) || '房主';
  const maxPlayers = Math.max(2, Math.min(MAX_PLAYERS, Math.floor(o.maxPlayers) || MAX_PLAYERS));
  const order = Number.isInteger(o.broker) ? [o.broker] : BROKERS.map((_, i) => i);
  say('連線中…');
  const best = await raceBrokers(order, say);
  if (!best) throw roomError('network');
  const { client, code, will, b } = best;
  const room = new Room({
    code, isHost: true, sid: randomString(10, BASE36), version, name, url: BROKERS[b], clientId: client.clientId, will,
    meta, maxPlayers, roomName: cleanName(o.roomName, 32) || `${name}的房間`, isPublic: o.public !== false,
    allowLateJoin: o.allowLateJoin, forceRelay: o.forceRelay, onStatus: o.onStatus,
  });
  client.unsubscribe(room._tInfo).catch(() => {});
  room._attach(client);
  room._publishInfo();
  room._startTimer();
  room._status(`已建立房間 ${code}`);
  return room;
}

/**
 * Host: connects to every candidate broker at once, each with its own fresh code (the will names
 * the code, so it is drawn before CONNECT), subscribes to that room's topics and checks that no
 * live room uses the code. The SUBACK time is one round trip to the broker; a relayed message
 * costs about two of them, so the lowest one wins. After the first usable broker the others get
 * PICK_WINDOW_MS to finish; dead brokers cost nothing. The losers are disconnected.
 * Resolves with {client, code, will, b, rtt} or null when no broker works.
 */
async function raceBrokers(order, say) {
  const cands = order.map((b) => {
    const code = makeCode(b);
    const base = roomBase(code);
    const c = { b, code, will: { topic: base + 'i', payload: '', retain: true }, client: null, rtt: Infinity, ok: false };
    c.done = (async () => {
      c.client = await connectClient(BROKERS[b], { will: c.will }, { budgetMs: HOST_BROKER_MS, stubborn: true });
      // One SUBSCRIBE for the inbox and the code check; nobody knows the code yet, so no hello is missed.
      const info = await readInfo(c.client, [base + 'h', base + 'i'], base + 'i', CONNECT_MS, CODE_CHECK_MS, (ms) => (c.rtt = ms));
      c.ok = !(info && isFresh(info)) && c.client.connected;
    })().catch(() => {});
    return c;
  });
  const all = Promise.all(cands.map((c) => c.done));
  await new Promise((resolve) => {
    all.then(resolve);
    for (const c of cands) c.done.then(() => c.ok && resolve());
  });
  await Promise.race([all, sleep(PICK_WINDOW_MS)]);
  const ok = cands.filter((c) => c.ok && c.client.connected).sort((x, y) => x.rtt - y.rtt);
  const best = ok[0] || null;
  for (const c of cands) if (c !== best) c.done.then(() => c.client?.disconnect());
  if (!best) say('無法連線到伺服器');
  else if (cands.length > 1) say('建立房間中…');
  return best;
}

/**
 * Joins a room by code. Resolves once the host accepted us and the transport settled (DataChannels
 * open, or the relay after ~6 s). Rejects with err.code 'bad-code' | 'not-found' | 'full' |
 * 'version' (err.hostVersion) | 'playing' | 'kicked' | 'closed' | 'network' | 'timeout'; err.message
 * is a Traditional Chinese text for the UI.
 * @param {string} code 5 digits
 * @param {{version: string, name?: string, forceRelay?: boolean, onStatus?: (text: string) => void}} o
 * @returns {Promise<Room>}
 */
export async function joinRoom(code, o = {}) {
  const version = String(o.version ?? '');
  const say = statusReporter(o.onStatus);
  const clean = String(code ?? '').replace(/\s+/g, '');
  const b = /^\d{5}$/.test(clean) ? clean.charCodeAt(0) - 49 : -1;
  if (b < 0 || b >= BROKERS.length) throw roomError('bad-code');
  const url = BROKERS[b];
  const sid = randomString(10, BASE36);
  // The will tells the host at once when our connection dies (tab closed, app killed).
  const will = { topic: roomBase(clean) + 'h', payload: JSON.stringify({ f: sid, m: [{ k: 'bye', r: 'lost' }] }) };
  say('連線中…');
  let client;
  try {
    client = await connectClient(url, { will }, { budgetMs: JOIN_CONNECT_MS, stubborn: true });
  } catch {
    throw roomError('network');
  }
  const room = new Room({
    code: clean, isHost: false, sid, version, name: o.name, url, clientId: client.clientId, will,
    forceRelay: o.forceRelay, onStatus: o.onStatus,
  });
  try {
    say('尋找房間…');
    const info = await readInfo(client, [room._tIn, room._tInfo], room._tInfo, INFO_WAIT_MS, INFO_AFTER_SUBACK_MS);
    // No info: most likely a wrong code, but a slow broker can miss the retained message, so the
    // host is still asked briefly before 'not-found'.
    const fresh = !!info && isFresh(info);
    if (info) room.maxPlayers = info.m;
    if (fresh && info.v !== version) throw versionError(info.v, version);
    if (fresh && info.p >= info.m) throw fullError(info.m);
    if (fresh && info.s === 'playing' && !info.late) throw roomError('playing');
    room._attach(client); // stays subscribed to the info: an emptied info means the host is gone
    say('加入房間中…');
    await room._handshake(fresh ? WELCOME_MS : STALE_WELCOME_MS, fresh ? 'timeout' : 'not-found');
    if (room._expectRtc) say('建立 P2P 直連中…');
    await room._waitSettle(P2P_WAIT_MS);
    if (room.closed) throw roomError('closed');
    room._settled = true;
    const host = room._links.get(room.hostId);
    host.joined = true;
    const hp = room.peers.get(room.hostId);
    if (hp) {
      hp.transport = host.transport;
      hp.rtt = host.rtt;
    }
    room._status(host.transport === 'p2p' ? '已加入房間（P2P 直連）' : room._expectRtc ? 'P2P 無法連線，改用伺服器中繼' : '已加入房間（伺服器中繼）');
    return room;
  } catch (e) {
    room._abort();
    client.disconnect();
    throw e && e.code && ERROR_TEXT[e.code] ? e : roomError('network');
  }
}

/**
 * Live view of the public room lists of every broker (one connection each, in parallel).
 * onChange(rooms) fires whenever an entry appears, changes or disappears. Entries older than 60 s
 * are left out. Call stop() when the lobby screen closes.
 * @returns {{ rooms: () => RoomInfo[], ready: Promise<void>, stop: () => void }}
 */
export function watchRooms({ version, onChange } = {}) {
  const entries = new Map(); // code -> {info, broker, at}
  const clients = [];
  let stopped = false;
  let pruneTimer = 0;
  const changed = () => {
    if (!stopped && onChange) {
      try {
        onChange(rooms());
      } catch (e) {
        console.error(e);
      }
    }
  };
  const rooms = () => {
    const out = [];
    for (const [code, e] of entries) {
      const age = Date.now() - e.info.t;
      if (age >= INFO_FRESH_MS || !e.info.pub) continue;
      const i = e.info;
      const compatible = version === undefined || i.v === String(version);
      const reason = !compatible ? `版本不同（${i.v}）` : i.p >= i.m ? '房間已滿' : i.s === 'playing' && !i.late ? '遊戲進行中' : '';
      out.push({
        code, name: i.n, host: i.h, players: i.p, maxPlayers: i.m, map: i.map, difficulty: i.d, state: i.s,
        version: i.v, timestamp: i.t, age: Math.max(0, Math.round(age / 1000)), broker: e.broker,
        compatible, joinable: !reason, reason,
      });
    }
    return out.sort((a, b) => (b.joinable - a.joinable) || (b.timestamp - a.timestamp));
  };
  const scan = async (b) => {
    const client = await connectClient(BROKERS[b], undefined, { budgetMs: LIST_CONNECT_MS });
    if (stopped) {
      client.disconnect();
      return;
    }
    clients.push(client);
    let cleared = 0;
    client.on('message', (topic, text) => {
      const code = topic.slice(PREFIX.length + 2, -2);
      if (!/^\d{5}$/.test(code) || code.charCodeAt(0) - 49 !== b || topic !== roomBase(code) + 'i') return;
      const info = parseInfo(text);
      if (!info) {
        if (entries.delete(code)) changed();
        return;
      }
      // Leftovers whose will never fired (broker restarts): clean them up for everyone.
      if (Date.now() - info.t > INFO_GC_MS && cleared < 10) {
        cleared++;
        client.publish(topic, '', { retain: true });
        return;
      }
      entries.set(code, { info, broker: b, at: now() });
      changed();
    });
    await client.subscribe(LIST_TOPIC);
    await sleep(LIST_AFTER_SUBACK_MS); // retained entries follow the SUBACK
  };
  const ready = Promise.race([
    Promise.allSettled(BROKERS.map((_, b) => scan(b))),
    sleep(LIST_TOTAL_MS),
  ]).then(() => {});
  pruneTimer = setInterval(() => {
    for (const [code, e] of entries) if (Date.now() - e.info.t >= INFO_FRESH_MS) entries.delete(code) && changed();
  }, 5000);
  return {
    rooms,
    ready,
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(pruneTimer);
      for (const c of clients) c.disconnect();
    },
  };
}

/**
 * One-shot scan of the public room lists of every broker (~2-3 s).
 * @param {{version?: string}} [o] rooms with another version come back with joinable false
 * @returns {Promise<Array<{code, name, host, players, maxPlayers, map, difficulty, state, version,
 *   timestamp, age, broker, compatible, joinable, reason}>>} joinable rooms first, newest first
 */
export async function listRooms({ version } = {}) {
  const w = watchRooms({ version });
  try {
    await w.ready;
    return w.rooms();
  } finally {
    w.stop();
  }
}
