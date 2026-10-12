// Test harness for the network layer: bundled into game/net-test.js by tools/build-net-test.mjs.
// Open http://127.0.0.1:5190/net-test.html in 2+ tabs (or devices) to try it by hand; the
// automated test (tools/net-test.mjs) drives window.netTest in headless Edge tabs.
import * as session from './session.js';
import { MqttClient } from './mqtt.js';

const $ = (id) => document.getElementById(id);
const now = () => performance.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function quantiles(list) {
  const s = [...list].sort((a, b) => a - b);
  if (!s.length) return null;
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const r = (v) => Math.round(v * 10) / 10;
  return { n: s.length, min: r(s[0]), med: r(q(0.5)), p95: r(q(0.95)), max: r(s[s.length - 1]) };
}

const T = {
  session,
  room: null,
  events: [], // {t, ev, ...}
  recv: new Map(), // type -> [{from, i, t, sentAt, reliable}]
  closedReason: null,

  _log(ev, extra = {}) {
    const e = { t: Math.round(now()), ev, ...extra };
    T.events.push(e);
    const line = `${(e.t / 1000).toFixed(1)}s ${ev} ${JSON.stringify(extra)}`;
    const el = $('log');
    if (el) {
      el.textContent = (line + '\n' + el.textContent).slice(0, 20000);
    }
  },

  _wire(room) {
    T.room = room;
    T.closedReason = null;
    room.on('message', (m) => {
      if (m.type === 'echo') { // answer at once, same reliability
        room.send('echo-r', m.data, { reliable: m.reliable, to: room.isHost ? m.from : undefined });
        return;
      }
      if (!T.recv.has(m.type)) T.recv.set(m.type, []);
      const d = m.data || {};
      T.recv.get(m.type).push({ from: m.from, i: d.i, t: now(), sentAt: d.t, reliable: m.reliable, len: d.pad ? d.pad.length : 0 });
    });
    for (const ev of ['peer-join', 'peer-leave', 'peer-update']) {
      room.on(ev, (p) => T._log(ev, { id: p.id, name: p.name, slot: p.slot, transport: p.transport, reason: p.reason }));
    }
    room.on('meta', (m) => T._log('meta', { meta: m }));
    room.on('status', (s) => T._log('status', { text: s }));
    room.on('closed', (reason, detail) => {
      T.closedReason = reason;
      T._log('closed', { reason, detail });
    });
    T.render();
  },

  async host(opts = {}) {
    const t0 = now();
    const room = await session.hostRoom({ ...opts, onStatus: (s) => T._log('status', { text: s }) });
    T._wire(room);
    return { code: room.code, selfId: room.selfId, ms: Math.round(now() - t0), broker: room.broker };
  },

  async join(code, opts = {}) {
    const t0 = now();
    try {
      const room = await session.joinRoom(code, { ...opts, onStatus: (s) => T._log('status', { text: s }) });
      T._wire(room);
      const hp = room.peers.get(room.hostId);
      return { ok: true, code: room.code, selfId: room.selfId, slot: room.slot, hostId: room.hostId, transport: hp.transport, rtt: hp.rtt, ms: Math.round(now() - t0), meta: room.meta };
    } catch (e) {
      return { ok: false, code: e.code, message: e.message, ms: Math.round(now() - t0) };
    }
  },

  async list(opts = {}) {
    const t0 = now();
    const rooms = await session.listRooms(opts);
    return { ms: Math.round(now() - t0), rooms };
  },

  state() {
    const r = T.room;
    if (!r) return null;
    return {
      code: r.code, selfId: r.selfId, slot: r.slot, isHost: r.isHost, hostId: r.hostId, closed: r.closed,
      closedReason: T.closedReason, meta: r.meta, players: r.players(), peers: [...r.peers.values()], stats: r.stats(),
    };
  },

  /** Sends n messages {i, t, pad} of `type`, `perTick` per task, a task every `everyMs`. */
  async burst({ type = 'seq', n = 100, reliable = true, to, perTick = 1, everyMs = 0, pad = 0, broadcast = false } = {}) {
    const r = T.room;
    let sent = 0;
    for (let i = 0; i < n; i += perTick) {
      for (let k = i; k < Math.min(n, i + perTick); k++) {
        const data = { i: k, t: now(), pad: pad ? 'x'.repeat(pad) : undefined, zh: '災厄前線' };
        const ok = broadcast ? r.broadcast(type, data, { reliable }) : r.send(type, data, { reliable, to });
        if (ok) sent++;
      }
      if (everyMs) await sleep(everyMs);
    }
    return sent;
  },

  /** Per sender: count, order violations, duplicates, missing in 0..n-1, one-way delay quantiles. */
  got(type, n) {
    const list = T.recv.get(type) || [];
    const by = {};
    for (const m of list) (by[m.from] ||= []).push(m);
    const out = {};
    for (const [from, ms] of Object.entries(by)) {
      const seen = new Set();
      let disorder = 0;
      let dups = 0;
      for (let k = 0; k < ms.length; k++) {
        if (seen.has(ms[k].i)) dups++;
        seen.add(ms[k].i);
        if (k && ms[k].i <= ms[k - 1].i) disorder++;
      }
      let missing = 0;
      if (n) for (let i = 0; i < n; i++) if (!seen.has(i)) missing++;
      out[from] = { n: ms.length, disorder, dups, missing, last: ms.length ? ms[ms.length - 1].i : -1 };
    }
    return out;
  },

  clear(type) {
    if (type) T.recv.delete(type);
    else T.recv.clear();
  },

  /** Application-level round trips: `n` echo requests to `to` (host) / the host (guest). */
  async echo({ to, n = 20, reliable = true, everyMs = 100, timeoutMs = 15000 } = {}) {
    const r = T.room;
    const rtts = [];
    const sentAt = new Map();
    const onMsg = (m) => {
      if (m.type !== 'echo-r' || !m.data || m.data.k !== 'echo') return;
      const t0 = sentAt.get(m.data.i);
      if (t0 === undefined) return;
      sentAt.delete(m.data.i);
      rtts.push(now() - t0);
    };
    r.on('message', onMsg);
    try {
      for (let i = 0; i < n; i++) {
        sentAt.set(i, now());
        r.send('echo', { k: 'echo', i }, { reliable, to });
        await sleep(everyMs);
      }
      const t1 = now();
      while (rtts.length < n && now() - t1 < (reliable ? timeoutMs : 2000)) await sleep(20);
    } finally {
      r.off('message', onMsg);
    }
    return { ...quantiles(rtts), lost: n - rtts.length };
  },

  async close(reason) {
    if (!T.room) return null;
    await T.room.close(reason);
    return T.closedReason;
  },

  /** Per broker: `tries` connects (ms or error) and the publish -> own echo round trip. */
  async probeBrokers({ tries = 2 } = {}) {
    return Promise.all(session.BROKERS.map(async (url) => {
      const out = { url, connect: [], echo: [] };
      for (let i = 0; i < tries; i++) {
        const c = new MqttClient(url, { connectTimeout: 10000 });
        const t0 = now();
        try {
          await c.connect();
          out.connect.push(Math.round(now() - t0));
          const topic = 'cfz1/probe/' + c.clientId;
          await c.subscribe(topic);
          for (let k = 0; k < 3; k++) {
            const t1 = now();
            await new Promise((r) => {
              const f = () => { c.off('message', f); out.echo.push(Math.round(now() - t1)); r(); };
              c.on('message', f);
              c.publish(topic, 'x');
              setTimeout(r, 3000);
            });
          }
          await c.disconnect();
        } catch (e) {
          out.connect.push(`${e.code} ${Math.round(now() - t0)}`);
        }
      }
      return out;
    }));
  },

  // ---------------------------------------------------------------- manual UI

  render() {
    const el = $('peers');
    if (!el) return;
    const r = T.room;
    if (!r) {
      el.textContent = '（尚未加入房間）';
      return;
    }
    const rows = r.players().map((p) => `#${p.slot} ${p.name}${p.self ? '（你）' : ''}  ${p.self ? '' : `${p.transport}  ${p.rtt} ms`}`);
    el.textContent = `房間 ${r.code}  ${r.isHost ? '房主' : '玩家'}  ${r.closed ? '已關閉' : ''}\nmeta ${JSON.stringify(r.meta)}\n` + rows.join('\n');
  },
};

window.netTest = T;

function setupUi() {
  const name = $('name');
  const ver = $('ver');
  const relay = $('relay');
  const opts = () => ({ name: name.value, version: ver.value, forceRelay: relay.checked });
  $('host').onclick = async () => {
    try {
      const r = await T.host({ ...opts(), meta: { map: 'testArena', difficulty: 'normal', state: 'lobby' } });
      $('code').value = r.code;
    } catch (e) {
      T._log('error', { message: e.message });
    }
  };
  $('join').onclick = async () => {
    const r = await T.join($('code').value, opts());
    if (!r.ok) T._log('error', { message: r.message });
  };
  $('list').onclick = async () => {
    const r = await T.list({ version: ver.value });
    $('rooms').textContent = r.rooms.length
      ? r.rooms.map((x) => `${x.code}  ${x.name}（${x.host}） ${x.players}/${x.maxPlayers}  ${x.map} ${x.difficulty} ${x.state}  ${x.joinable ? '可加入' : x.reason}`).join('\n')
      : `沒有公開房間（${r.ms} ms）`;
  };
  $('say').onclick = () => T.room?.send('chat', { text: $('msg').value, t: now() });
  $('leave').onclick = () => T.close();
  setInterval(() => T.render(), 500);
  name.value = '玩家' + Math.floor(Math.random() * 100);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupUi);
else setupUi();
window.__netReady = true;
