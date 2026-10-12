// One WebRTC peer connection with two pre-negotiated DataChannels, signaled through callbacks
// (session.js carries the signals as reliable '$sig' messages over the MQTT relay).
//
//   rel    id 0, ordered + reliable (SCTP retransmits)          game commands, lobby state
//   unrel  id 1, unordered, maxRetransmits 0 (lost = gone)      snapshots, pings, acks
//
// Both channels are created with `negotiated: true` on both sides, so no ondatachannel round trip
// is needed and the offer already carries the SCTP section. ICE is trickled: candidates are batched
// for a few ms and handed to onSignal({ c: [...] }); descriptions go out as onSignal({ sdp }).
// There is no TURN server: behind symmetric NATs ICE fails and the caller keeps using the relay.
//
//   const p = new RtcPeer({ initiator, onSignal, onOpen, onClose, onMessage });
//   p.start(); p.signal(remoteSignal); p.send('unrel', text); p.close();

export const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

const CANDIDATE_BATCH_MS = 40;
const GIVE_UP_MS = 20000; // never opened: stop trying (the caller already fell back to the relay)
const DISCONNECTED_MS = 4000; // ICE 'disconnected' often recovers; after this long it counts as lost

export const rtcSupported = () => typeof RTCPeerConnection === 'function';

export class RtcPeer {
  /**
   * @param {object} o
   * @param {boolean} o.initiator creates the offer
   * @param {(signal: object) => void} o.onSignal description / candidates for the remote side
   * @param {() => void} o.onOpen both channels open
   * @param {(why: string, wasOpen: boolean) => void} o.onClose once, unless close() was called
   * @param {(text: string, reliable: boolean) => void} o.onMessage
   */
  constructor({ initiator, onSignal, onOpen, onClose, onMessage }) {
    this.initiator = initiator;
    /** 'new' | 'connecting' | 'open' | 'closed' */
    this.state = 'new';
    this.pc = null;
    this.rel = null;
    this.unrel = null;
    this._cb = { onSignal, onOpen, onClose, onMessage };
    this._outCands = [];
    this._candTimer = 0;
    this._inCands = []; // remote candidates that arrived before the remote description
    this._chain = Promise.resolve(); // remote signals are applied strictly in order
    this._giveUp = 0;
    this._discTimer = 0;
  }

  get open() {
    return this.state === 'open';
  }

  /** Creates the connection (and, as initiator, the offer). Throws if WebRTC is unavailable. */
  start() {
    if (this.state !== 'new') return;
    this.state = 'connecting';
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc = pc;
    this.rel = pc.createDataChannel('rel', { negotiated: true, id: 0, ordered: true });
    this.unrel = pc.createDataChannel('unrel', { negotiated: true, id: 1, ordered: false, maxRetransmits: 0 });
    for (const ch of [this.rel, this.unrel]) {
      const reliable = ch === this.rel;
      ch.onopen = () => this._checkOpen();
      ch.onclose = () => this._fail('channel closed');
      ch.onerror = () => this._fail('channel error');
      ch.onmessage = (e) => {
        if (this.state === 'open' && typeof e.data === 'string') this._cb.onMessage(e.data, reliable);
      };
    }
    pc.onicecandidate = (e) => {
      if (!e.candidate || !e.candidate.candidate) return; // end of gathering: nothing to tell
      this._outCands.push(e.candidate.toJSON());
      if (!this._candTimer) this._candTimer = setTimeout(() => this._sendCands(), CANDIDATE_BATCH_MS);
    };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'failed' || s === 'closed') this._fail('ice ' + s);
      else if (s === 'disconnected') {
        if (!this._discTimer) this._discTimer = setTimeout(() => this._fail('ice disconnected'), DISCONNECTED_MS);
      } else if (this._discTimer) {
        clearTimeout(this._discTimer);
        this._discTimer = 0;
      }
    };
    this._giveUp = setTimeout(() => {
      if (this.state === 'connecting') this._fail('timeout');
    }, GIVE_UP_MS);
    if (this.initiator) {
      this._enqueue(async () => {
        await pc.setLocalDescription(await pc.createOffer());
        this._sendDescription();
      });
    }
  }

  /** Applies a signal from the remote side: { sdp?: {type, sdp}, c?: candidate[] }. */
  signal(d) {
    if (!d || typeof d !== 'object') return;
    this._enqueue(async () => {
      const pc = this.pc;
      if (d.sdp && typeof d.sdp.sdp === 'string' && (d.sdp.type === 'offer' || d.sdp.type === 'answer')) {
        if (d.sdp.type === 'answer' && pc.signalingState !== 'have-local-offer') return; // duplicate
        if (d.sdp.type === 'offer' && pc.signalingState !== 'stable') return;
        await pc.setRemoteDescription({ type: d.sdp.type, sdp: d.sdp.sdp });
        if (d.sdp.type === 'offer') {
          await pc.setLocalDescription(await pc.createAnswer());
          this._sendDescription();
        }
        const queued = this._inCands;
        this._inCands = [];
        for (const c of queued) await this._addCand(c);
      }
      if (Array.isArray(d.c)) {
        for (const c of d.c) {
          if (!c || typeof c.candidate !== 'string') continue;
          if (pc.remoteDescription) await this._addCand(c);
          else if (this._inCands.length < 64) this._inCands.push(c);
        }
      }
    });
  }

  /** Sends text on 'rel' or 'unrel'; false if that channel is not open. */
  send(channel, text) {
    const ch = channel === 'rel' ? this.rel : this.unrel;
    if (this.state !== 'open' || !ch || ch.readyState !== 'open') return false;
    try {
      ch.send(text);
      return true;
    } catch (e) {
      this._fail('send failed: ' + ((e && e.message) || e));
      return false;
    }
  }

  /** Bytes queued on the reliable channel (backpressure). */
  get buffered() {
    return this.rel ? this.rel.bufferedAmount : 0;
  }

  /** Local close: no onClose callback. */
  close() {
    if (this.state === 'closed') return;
    this.state = 'closed';
    clearTimeout(this._candTimer);
    clearTimeout(this._giveUp);
    clearTimeout(this._discTimer);
    for (const ch of [this.rel, this.unrel]) {
      if (!ch) continue;
      ch.onopen = ch.onclose = ch.onerror = ch.onmessage = null;
      try {
        ch.close();
      } catch {
        // already closed
      }
    }
    const pc = this.pc;
    if (pc) {
      pc.onicecandidate = pc.onconnectionstatechange = null;
      try {
        pc.close();
      } catch {
        // already closed
      }
    }
  }

  // ---------------------------------------------------------------- internals

  _enqueue(fn) {
    this._chain = this._chain.then(() => (this.state === 'closed' ? undefined : fn())).catch((e) => {
      this._fail('signaling: ' + ((e && e.message) || e));
    });
  }

  async _addCand(c) {
    try {
      await this.pc.addIceCandidate(c);
    } catch {
      // a candidate this browser cannot use (e.g. an mDNS name it cannot resolve): skip it
    }
  }

  _sendDescription() {
    const d = this.pc.localDescription;
    if (d && this.state !== 'closed') this._cb.onSignal({ sdp: { type: d.type, sdp: d.sdp } });
  }

  _sendCands() {
    this._candTimer = 0;
    if (this.state === 'closed' || !this._outCands.length) return;
    const c = this._outCands;
    this._outCands = [];
    this._cb.onSignal({ c });
  }

  _checkOpen() {
    if (this.state !== 'connecting') return;
    if (this.rel.readyState !== 'open' || this.unrel.readyState !== 'open') return;
    this.state = 'open';
    clearTimeout(this._giveUp);
    this._cb.onOpen();
  }

  _fail(why) {
    if (this.state === 'closed') return;
    const wasOpen = this.state === 'open';
    this.close();
    this._cb.onClose(why, wasOpen);
  }
}
