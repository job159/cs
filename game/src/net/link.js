// One peer link (host <-> guest): a reliable and an unreliable message stream that ride on
// whichever transport currently works, a WebRTC DataChannel pair ('p2p') or the MQTT relay.
//
// The reliability layer is the same on both transports, so switching never loses or reorders:
//   r: [[seq, type, data], ...]  reliable. Cumulative ack `a`. On the relay, unacked messages are
//        resent after an RFC 6298-style timeout (app1's scheme); on p2p the 'rel' channel retransmits
//        by itself, so acks only trim the pending list. When the transport changes, everything still
//        unacked is sent again on the new one; the receiver drops duplicates by seq and buffers gaps.
//   u: [[useq, type, data], ...] unreliable, newest wins: anything older than the newest delivered
//        of its type is dropped. On the relay, queued messages of one type collapse to the newest.
//   pi / po + ph: ping timestamp, echoed pong + ms it was held back (rtt excludes the hold).
//   bye: the peer is leaving (p2p only; on the relay a bye is a control item, see session.js).
//
// Relay frames are assembled by the Room (session.js) from every link's relaySection(), so one
// MQTT publish carries data for all relay peers and the per-connection publish budget is shared.
import { RtcPeer, rtcSupported } from './rtc.js';

/** Largest message send() accepts: UTF-8 bytes of JSON.stringify([seq, type, data]). */
export const MAX_MESSAGE_BYTES = 12288;

const MAX_DC_BYTES = 16000; // one DataChannel message (every browser takes 16 KB)
const UNREL_PACK_BYTES = 1100; // unreliable DataChannel messages are packed below one UDP packet
const DC_HIGH_WATER = 1 << 20; // reliable channel backlog: hold further sends until it drains
const RIDE_MS = 100; // relay: acks and pongs wait this long for a data frame to ride on
const RESEND_MS = 1000; // relay resend timeout floor, adapts to rtt + jitter
const RESEND_FIRST_MS = 2000; // before the first rtt sample
const RESEND_MAX_MS = 4000;
const WINDOW_BYTES = 48000; // reliable bytes in flight on the relay
export const MAX_TRIES = 12;

const now = () => performance.now();
const ms1 = (t) => Math.round(t * 10) / 10; // timestamps with 0.1 ms resolution (p2p on a LAN is fast)

export function utf8Length(s) {
  let n = s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) continue;
    if (c < 0x800) n += 1;
    else if (c >= 0xd800 && c < 0xdc00) {
      n += 2; // surrogate pair: 4 bytes for 2 UTF-16 units
      i++;
    } else n += 2;
  }
  return n;
}

export class Link {
  /**
   * @param {object} room owner (session.js Room): _scheduleFlush, _linkDeliver, _linkInternal,
   *   _linkTransport, _linkRtcClosed, _linkBye
   * @param {string} id the peer's session id
   */
  constructor(room, id, { name = '', slot = 0 } = {}) {
    this.room = room;
    this.id = id;
    this.name = name;
    this.slot = slot;
    /** 'relay' | 'p2p': where data goes right now */
    this.transport = 'relay';
    /** 'off' | 'connecting' | 'open' | 'failed' */
    this.p2p = 'off';
    /** ms from the start of the WebRTC attempt until both channels opened (0 = never) */
    this.p2pMs = 0;
    /** round trip on the current transport, ms: median of the last 5 pings (0 until measured) */
    this.rtt = 0;
    this.joined = false;
    this.closed = false;
    this.lastHeard = now();
    this.byeHint = 0; // a last-will bye or an empty room info arrived at this time (see session.js)
    this.createdAt = now();
    this.stats = { msgsOut: 0, msgsIn: 0, resent: 0, dup: 0, stale: 0, coalesced: 0, p2pIn: 0, relayIn: 0, switches: 0 };
    this.rtc = null;
    this.rtcGen = 0;
    this.rtcTries = 0;
    this._txSeq = 0;
    this._pending = []; // reliable, unacked: {seq, json, bytes, sentAt, tries}
    this._rxNext = 1;
    this._rxBuf = new Map();
    this._ackDue = false;
    this._uSeq = 0;
    this._uOut = new Map(); // relay: newest unreliable per type, waiting for a frame
    this._uQ = []; // p2p: unreliable messages waiting for the end of the task
    this._uIn = new Map(); // newest delivered useq per type
    this._pingDue = false;
    this._pongDue = 0;
    this._pongAt = 0;
    this._pingAt = 0;
    this._srtt = 0; // smoothed rtt + variance: relay resend timeout only
    this._rttvar = 0;
    this._samples = [];
  }

  // ---------------------------------------------------------------- sending

  /**
   * Queues one message. `dataJson` is JSON.stringify(data) (computed once for broadcasts).
   * Returns false when the link is closed or an unreliable message is too big.
   */
  send(type, dataJson, reliable) {
    if (this.closed) return false;
    const tj = JSON.stringify(type);
    if (reliable) {
      const seq = this._txSeq + 1;
      const json = '[' + seq + ',' + tj + ',' + dataJson + ']';
      const bytes = utf8Length(json);
      if (bytes > MAX_MESSAGE_BYTES) throw new RangeError(`net message "${type}" is ${bytes} bytes (max ${MAX_MESSAGE_BYTES})`);
      this._txSeq = seq;
      this._pending.push({ seq, json, bytes, sentAt: 0, tries: 0 });
    } else {
      const json = '[' + (this._uSeq + 1) + ',' + tj + ',' + dataJson + ']';
      const bytes = utf8Length(json);
      if (bytes > MAX_MESSAGE_BYTES) return false;
      this._uSeq++;
      const u = { type, json, bytes };
      if (this.transport === 'p2p') this._uQ.push(u);
      else {
        if (this._uOut.delete(type)) this.stats.coalesced++;
        this._uOut.set(type, u);
      }
    }
    this.stats.msgsOut++;
    this.room._scheduleFlush(0);
    return true;
  }

  /** Internal (lobby / signaling) message: same reliable stream, type starts with '$'. */
  sendInternal(type, data, reliable = true) {
    return this.send(type, JSON.stringify(data === undefined ? null : data), reliable);
  }

  /** Called by the room's tick: a ping is due every second. */
  ping(t) {
    this._pingAt = t;
    this._pingDue = true;
    this.room._scheduleFlush(this.transport === 'p2p' ? 0 : RIDE_MS);
  }

  get pingAt() {
    return this._pingAt;
  }

  /** Oldest unacked reliable message has been resent this often (relay only). */
  get maxTries() {
    return this._pending.length ? this._pending[0].tries : 0;
  }

  get pendingCount() {
    return this._pending.length;
  }

  /** Best-effort immediate bye over the DataChannel (the relay bye is sent by the room). */
  sayByeP2P(reason) {
    if (this.rtc && this.rtc.open) this.rtc.send('rel', JSON.stringify({ bye: String(reason) }));
  }

  // ---------------------------------------------------------------- p2p output

  /** Sends everything due on the DataChannels. */
  flushP2P(t) {
    const rtc = this.rtc;
    if (this.closed || this.transport !== 'p2p' || !rtc || !rtc.open) return;
    const ctrl = () => {
      let s = '"a":' + (this._rxNext - 1);
      if (this._pingDue) s += ',"pi":' + Math.max(0.1, ms1(t));
      if (this._pongDue) s += ',"po":' + this._pongDue + ',"ph":' + ms1(t - this._pongAt);
      this._pingDue = false;
      this._pongDue = 0;
      this._ackDue = false;
      return s;
    };
    // Reliable: everything not yet sent on this transport, packed up to MAX_DC_BYTES per message.
    if (rtc.buffered < DC_HIGH_WATER) {
      let batch = [];
      let size = 0;
      const out = () => {
        const s = '{' + ctrl() + ',"r":[' + batch.map((p) => p.json).join(',') + ']}';
        for (const p of batch) {
          if (p.sentAt) this.stats.resent++;
          p.sentAt = t;
        }
        batch = [];
        size = 0;
        return rtc.send('rel', s);
      };
      for (const p of this._pending) {
        if (p.sentAt) continue;
        if (size + p.bytes > MAX_DC_BYTES && batch.length && !out()) return;
        batch.push(p);
        size += p.bytes + 1;
      }
      if (batch.length && !out()) return;
    }
    // Unreliable: packed below one UDP packet when small; a big one goes alone (fragmented).
    if (this._uQ.length) {
      const q = this._uQ;
      this._uQ = [];
      let batch = [];
      let size = 0;
      const out = () => {
        rtc.send('unrel', '{' + ctrl() + ',"u":[' + batch.join(',') + ']}');
        batch = [];
        size = 0;
      };
      for (const u of q) {
        if (size + u.bytes > UNREL_PACK_BYTES && batch.length) out();
        batch.push(u.json);
        size += u.bytes + 1;
      }
      if (batch.length) out();
    }
    if (this._pingDue || this._pongDue || this._ackDue) rtc.send('unrel', '{' + ctrl() + '}');
  }

  // ---------------------------------------------------------------- relay output

  _rto() {
    if (!this._srtt) return RESEND_FIRST_MS;
    return Math.min(RESEND_MAX_MS, Math.max(RESEND_MS, this._srtt + 4 * this._rttvar));
  }

  /** Reliable messages due on the relay (new, or past the resend timeout) within the window. */
  _relayDue(t, any = false) {
    const resendMs = this._rto();
    let inflight = 0;
    const out = [];
    for (const p of this._pending) {
      inflight += p.bytes;
      if (inflight > WINDOW_BYTES && p !== this._pending[0]) break;
      if (!p.sentAt || t - p.sentAt >= resendMs) {
        if (any) return true;
        out.push(p);
      }
    }
    return any ? false : out;
  }

  /** True when the next relay frame should carry something for this peer. */
  hasRelayWork(t) {
    if (this.closed || this.transport !== 'relay') return false;
    return this._pingDue || this._pongDue !== 0 || this._ackDue || this._uOut.size > 0 || this._relayDue(t, true);
  }

  /**
   * This peer's part of the next relay frame, at most `limit` UTF-8 bytes: {text, bytes} or null.
   * Called repeatedly (one frame after another) until hasRelayWork() turns false.
   */
  relaySection(t, limit) {
    if (!this.hasRelayWork(t)) return null;
    let head = '{"k":"d","to":"' + this.id + '","a":' + (this._rxNext - 1);
    if (this._pingDue) head += ',"pi":' + Math.max(0.1, ms1(t));
    if (this._pongDue) head += ',"po":' + this._pongDue + ',"ph":' + ms1(t - this._pongAt);
    let size = head.length + 1;
    if (size > limit) return null;
    const rel = [];
    for (const p of this._relayDue(t)) {
      const add = p.bytes + (rel.length ? 1 : 8); // ',"r":[' + ']' on the first one
      if (size + add > limit) break;
      rel.push(p);
      size += add;
    }
    const uni = [];
    for (const u of this._uOut.values()) {
      const add = u.bytes + (uni.length ? 1 : 8);
      if (size + add > limit) break;
      uni.push(u);
      size += add;
    }
    let s = head;
    if (rel.length) s += ',"r":[' + rel.map((p) => p.json).join(',') + ']';
    if (uni.length) s += ',"u":[' + uni.map((u) => u.json).join(',') + ']';
    s += '}';
    for (const p of rel) {
      if (p.sentAt) {
        this.stats.resent++;
        p.tries++;
      }
      p.sentAt = t;
    }
    for (const u of uni) this._uOut.delete(u.type);
    this._pingDue = false;
    this._pongDue = 0;
    this._ackDue = false;
    return { text: s, bytes: size };
  }

  /** The relay is down (reconnecting): unreliable data queued for it is worthless by the time it is back. */
  dropRelayUnreliable() {
    this._uOut.clear();
  }

  /** After a broker reconnect every unacked message is resent right away. */
  resetRelayTimers() {
    if (this.transport !== 'relay') return;
    for (const p of this._pending) p.sentAt = 0;
  }

  // ---------------------------------------------------------------- input

  /** A data item from either transport (`via` 'relay' | 'p2p'). */
  onData(m, via) {
    if (this.closed) return;
    const t = now();
    this.lastHeard = t;
    this.byeHint = 0;
    if (via === 'p2p') this.stats.p2pIn++;
    else this.stats.relayIn++;
    if (Number.isInteger(m.a)) {
      const p = this._pending;
      let i = 0;
      while (i < p.length && p[i].seq <= m.a) i++;
      if (i) p.splice(0, i);
    }
    if (typeof m.po === 'number' && via === this.transport) {
      const ms = t - m.po - (typeof m.ph === 'number' ? m.ph : 0);
      if (ms >= 0 && ms < 60000) this._rttSample(ms);
    }
    // Hidden browser tabs clamp timers to ~1 s, which would hold relay acks past the peer's resend
    // timeout; microtasks are not throttled, so answer right away there (and always on p2p).
    const delay = via === 'p2p' || globalThis.document?.hidden ? 0 : RIDE_MS;
    if (typeof m.pi === 'number') {
      this._pongDue = m.pi;
      this._pongAt = t;
      this.room._scheduleFlush(delay);
    }
    if (typeof m.bye === 'string') {
      this.room._linkBye(this, m.bye.slice(0, 40));
      return;
    }
    if (Array.isArray(m.r) && m.r.length) {
      this._ackDue = true;
      this.room._scheduleFlush(via === 'p2p' ? RIDE_MS : delay);
      for (const it of m.r) {
        if (!Array.isArray(it) || !Number.isInteger(it[0]) || typeof it[1] !== 'string') continue;
        const seq = it[0];
        if (seq < this._rxNext) {
          this.stats.dup++;
          continue;
        }
        if (seq > this._rxNext) {
          if (seq - this._rxNext < 10000 && this._rxBuf.size < 10000) this._rxBuf.set(seq, it);
          continue;
        }
        this._rxNext++;
        this._deliver(it[1], it[2], true);
        if (this.closed) return;
        while (this._rxBuf.has(this._rxNext)) {
          const next = this._rxBuf.get(this._rxNext);
          this._rxBuf.delete(this._rxNext);
          this._rxNext++;
          this._deliver(next[1], next[2], true);
          if (this.closed) return;
        }
      }
    }
    if (Array.isArray(m.u)) {
      for (const it of m.u) {
        if (!Array.isArray(it) || !Number.isInteger(it[0]) || typeof it[1] !== 'string') continue;
        const last = this._uIn.get(it[1]);
        if (last !== undefined && it[0] <= last) {
          this.stats.stale++;
          continue;
        }
        this._uIn.set(it[1], it[0]);
        this._deliver(it[1], it[2], false);
        if (this.closed) return;
      }
    }
  }

  _deliver(type, data, reliable) {
    this.stats.msgsIn++;
    if (type.charCodeAt(0) === 36) this.room._linkInternal(this, type, data); // '$'
    else this.room._linkDeliver(this, type, data, reliable);
  }

  _rttSample(ms) {
    if (!this._srtt) {
      this._srtt = ms;
      this._rttvar = ms / 2;
    } else {
      this._rttvar += (Math.abs(this._srtt - ms) - this._rttvar) * 0.25;
      this._srtt += (ms - this._srtt) * 0.2;
    }
    // Shown to players and used for lag compensation: a median reacts within a few pings and
    // ignores a single slow one (a GC pause, a resend).
    const s = this._samples;
    s.push(ms);
    if (s.length > 5) s.shift();
    const sorted = [...s].sort((a, b) => a - b);
    this.rtt = Math.round(sorted[sorted.length >> 1] * 10) / 10;
  }

  /** RTT seed from the hello -> welcome exchange (relay). */
  seedRtt(ms) {
    if (ms >= 0 && ms < 30000 && !this._srtt) this._rttSample(ms);
  }

  // ---------------------------------------------------------------- transport switching

  _setTransport(kind) {
    if (this.transport === kind || this.closed) return;
    this.transport = kind;
    this.stats.switches++;
    // Everything unacked goes out again on the new path; the receiver drops what it already has.
    for (const p of this._pending) p.sentAt = 0;
    if (kind === 'p2p') {
      for (const u of this._uOut.values()) this._uQ.push(u);
      this._uOut.clear();
    } else {
      for (const u of this._uQ) this._uOut.set(u.type, u);
      this._uQ = [];
    }
    // The rtt of the old path says nothing about the new one.
    this._srtt = 0;
    this._rttvar = 0;
    this._samples = [];
    this.rtt = 0;
    this._pingAt = 0;
    this.room._linkTransport(this);
    this.room._scheduleFlush(0);
  }

  // ---------------------------------------------------------------- WebRTC

  /** Host side: starts a new attempt (gen + 1) and sends the offer through the reliable stream. */
  startRtc() {
    this._closeRtc();
    if (!rtcSupported()) {
      this.p2p = 'failed';
      return false;
    }
    this.rtcGen++;
    this.rtcTries++;
    return this._newRtc(true);
  }

  /** Guest side: a signal from the host. A newer gen replaces the current attempt. */
  onSignal(d) {
    if (!d || typeof d !== 'object' || !Number.isInteger(d.g)) return;
    if (this.rtc && this.rtc.initiator) {
      if (d.g === this.rtcGen) this.rtc.signal(d);
      return;
    }
    if (d.g > this.rtcGen && d.sdp && d.sdp.type === 'offer') {
      this._closeRtc();
      this.rtcGen = d.g;
      if (!rtcSupported() || !this._newRtc(false)) return;
    }
    if (d.g === this.rtcGen && this.rtc) this.rtc.signal(d);
  }

  _newRtc(initiator) {
    const gen = this.rtcGen;
    const started = now();
    const rtc = new RtcPeer({
      initiator,
      onSignal: (s) => {
        if (this.rtc === rtc) this.sendInternal('$sig', { g: gen, ...s });
      },
      onOpen: () => {
        if (this.rtc !== rtc) return;
        this.p2p = 'open';
        this.p2pMs = Math.round(now() - started);
        this._setTransport('p2p');
      },
      onClose: (why, wasOpen) => {
        if (this.rtc !== rtc) return;
        this.rtc = null;
        this.p2p = 'failed';
        this._setTransport('relay');
        this.room._linkRtcClosed(this, why, wasOpen);
      },
      onMessage: (text) => {
        if (this.rtc !== rtc) return;
        let m;
        try {
          m = JSON.parse(text);
        } catch {
          return;
        }
        if (m && typeof m === 'object') this.onData(m, 'p2p');
      },
    });
    this.rtc = rtc;
    this.p2p = 'connecting';
    try {
      rtc.start();
      return true;
    } catch {
      this.rtc = null;
      this.p2p = 'failed';
      return false;
    }
  }

  _closeRtc() {
    const rtc = this.rtc;
    this.rtc = null;
    if (rtc) rtc.close();
    if (this.transport === 'p2p') this._setTransport('relay');
  }

  /** Test hook: kill the DataChannels as if the network path died (the peer notices on its own). */
  breakP2P() {
    const rtc = this.rtc;
    if (!rtc) return false;
    rtc._fail('debug');
    return true;
  }

  /** Stops the link. rtcDelayMs keeps the DataChannels alive a little so a bye just written goes out. */
  close(rtcDelayMs = 0) {
    if (this.closed) return;
    this.closed = true;
    const rtc = this.rtc;
    this.rtc = null; // from here on its callbacks are ignored
    if (rtc && rtcDelayMs > 0) setTimeout(() => rtc.close(), rtcDelayMs);
    else if (rtc) rtc.close();
    this._pending = [];
    this._uOut.clear();
    this._uQ = [];
  }
}
