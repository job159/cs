// Live end-to-end test of game/src/net/ (session.js) against the REAL public MQTT brokers, with
// real WebRTC: 1 host tab + 3 guest tabs in ONE headless Edge process, driven over the Chrome
// DevTools Protocol (Node 24 global WebSocket; see tools/shot.mjs, whose browser semaphore it shares).
// List scans and joins that are meant to be rejected run from the host tab (own MQTT connections).
//   node tools/net-test.mjs                  every scenario: probe, p2p, relay, mixed (incl. crashes)
//   node tools/net-test.mjs --only relay     some scenarios (comma list: probe,p2p,relay,mixed)
//   node tools/net-test.mjs --url http://127.0.0.1:5190/net-test.html   (default; if the dev server
//                                            is not running, game/ is served on :5191 by this script)
//   node tools/net-test.mjs --broker 0       put every room on BROKERS[0] (default: the host picks)
//   node tools/net-test.mjs --headed --keep  visible browser, left running afterwards
// Builds game/net-test.js first. Exit code 0 when everything passed.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNetTest } from './build-net-test.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  return i < 0 ? def : args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
};
const ONLY = String(opt('only', 'probe,p2p,relay,mixed')).split(',');
const CDP_PORT = +opt('port', 0) || 9900 + Math.floor(Math.random() * 90); // own port per run
const VERSION = 'nt-' + Date.now().toString(36);
const BROKER = opt('broker', null); // --broker N: every room on BROKERS[N] (default: the host picks)
const pin = BROKER === null ? {} : { broker: +BROKER };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => performance.now();

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ---------------------------------------------------------------- page server + browser

async function pageUrl() {
  const want = opt('url', 'http://127.0.0.1:5190/net-test.html');
  try {
    const r = await fetch(want);
    if (r.ok) return want;
  } catch {
    // dev server not running
  }
  const dir = path.join(root, 'game');
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' };
  const server = http.createServer((req, res) => {
    const p = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!p.startsWith(dir) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader('content-type', types[path.extname(p)] || 'application/octet-stream');
    fs.createReadStream(p).pipe(res);
  });
  await new Promise((r) => server.listen(5191, '127.0.0.1', r));
  server.unref();
  console.log('dev server not reachable: serving game/ on :5191');
  return 'http://127.0.0.1:5191/net-test.html';
}

const exe = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => fs.existsSync(p));

async function getJson(u, init) {
  const r = await fetch(u, init);
  return r.json();
}

// One browser process for the whole run (at most 4 tabs at a time). Whatever happens (exception,
// Ctrl+C, hard timeout) its whole process tree is killed and the profile removed: many agents share
// this machine and orphaned headless browsers once exhausted its RAM.
let child = null;
let profile = null;
function killBrowser() {
  if (child && !opt('keep', false)) {
    try {
      execFileSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' });
    } catch {
      // already gone
    }
    child = null;
  }
  if (profile && !opt('keep', false)) {
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch {
      // files still locked for a moment: the OS temp cleanup gets them
    }
    profile = null;
  }
}

// Same system-wide semaphore as tools/shot.mjs: at most SHOT_MAX (3) headless browsers at once.
// shot.mjs reclaims slots older than 4 min, so this longer run keeps touching its lock file.
const MAX_BROWSERS = +(process.env.SHOT_MAX || 3);
const lockDir = path.join(os.tmpdir(), 'cf-shot-locks');
let lockFile = null;
let lockTouch = 0;
function releaseLock() {
  clearInterval(lockTouch);
  if (lockFile) {
    try {
      fs.unlinkSync(lockFile);
    } catch {
      // gone
    }
    lockFile = null;
  }
}

async function acquireSlot() {
  fs.mkdirSync(lockDir, { recursive: true });
  const t0 = Date.now();
  while (!lockFile) {
    for (let k = 0; k < MAX_BROWSERS && !lockFile; k++) {
      const f = path.join(lockDir, `slot${k}.lock`);
      try {
        if (Date.now() - fs.statSync(f).mtimeMs > 240000) fs.unlinkSync(f);
      } catch {
        // free
      }
      try {
        fs.writeFileSync(f, String(process.pid), { flag: 'wx' });
        lockFile = f;
      } catch {
        // taken
      }
    }
    if (lockFile) break;
    if (Date.now() - t0 > 600000) throw new Error('no free browser slot after 10 min');
    if (Date.now() - t0 < 1000) console.log('waiting for a free browser slot (tools/shot.mjs semaphore)...');
    await sleep(1000 + Math.random() * 1000);
  }
  lockTouch = setInterval(() => {
    try {
      const t = new Date();
      fs.utimesSync(lockFile, t, t);
    } catch {
      // released
    }
  }, 30000);
}

process.on('exit', () => {
  killBrowser();
  releaseLock();
});
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    killBrowser();
    releaseLock();
    process.exit(130);
  });
}
process.on('uncaughtException', (e) => {
  console.error('net-test failed:', e);
  process.exit(1); // the exit handler kills the browser
});
process.on('unhandledRejection', (e) => {
  console.error('net-test failed:', e);
  process.exit(1);
});
const hardTimeout = setTimeout(() => {
  console.error('net-test: hard timeout (25 min)');
  process.exit(2);
}, 25 * 60000);
hardTimeout.unref();

async function launchBrowser() {
  await acquireSlot();
  profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-net-test-'));
  child = spawn(exe, [
    ...(opt('headed', false) ? [] : ['--headless=new']),
    `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--mute-audio', '--disable-gpu',
    '--disable-extensions', '--disable-background-networking', '--disable-component-update',
    // Several tabs must keep running at full speed, like several phones would.
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling',
    'about:blank',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 300; i++) { // up to 60 s on a loaded machine
    try {
      return await getJson(`http://127.0.0.1:${CDP_PORT}/json/version`);
    } catch {
      await sleep(200);
    }
  }
  throw new Error('browser did not start');
}

/** Browser-level CDP session (creates targets). */
let browserWs = null; // Promise<WebSocket>, shared by concurrent callers
let browserId = 0;
const browserPending = new Map();
async function browserCmd(method, params = {}) {
  browserWs ||= (async () => {
    const v = await getJson(`http://127.0.0.1:${CDP_PORT}/json/version`);
    const ws = new WebSocket(v.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && browserPending.has(m.id)) {
        browserPending.get(m.id)(m);
        browserPending.delete(m.id);
      }
    };
    return ws;
  })();
  const ws = await browserWs;
  return new Promise((resolve, reject) => {
    const id = ++browserId;
    browserPending.set(id, (m) => (m.error ? reject(new Error(m.error.message)) : resolve(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
}

class Tab {
  static async open(url, label) {
    // Each tab in its own window: tabs sharing a window are hidden (all but one), and hidden pages
    // get coarse timers, which would slow the relay pacing far beyond what a phone in hand sees.
    const { targetId } = await browserCmd('Target.createTarget', { url: 'about:blank', newWindow: true });
    let target = null;
    for (let i = 0; i < 50 && !target; i++) {
      target = (await getJson(`http://127.0.0.1:${CDP_PORT}/json/list`)).find((t) => t.id === targetId);
      if (!target) await sleep(100);
    }
    if (!target) throw new Error(`${label}: no target`);
    const tab = new Tab(target, label);
    await tab._connect();
    await tab.cmd('Runtime.enable');
    await tab.cmd('Page.enable');
    await tab.cmd('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
    await tab.cmd('Page.navigate', { url });
    const t0 = now();
    while (now() - t0 < 45000) { // a loaded machine can take a while
      await sleep(100);
      if ((await tab.eval('window.__netReady === true').catch(() => false)) === true) {
        tab.visibility = await tab.eval('document.visibilityState');
        return tab;
      }
    }
    throw new Error(`${label}: test page did not load`);
  }

  constructor(target, label) {
    this.target = target;
    this.label = label;
    this.logs = [];
    this._id = 0;
    this._pending = new Map();
    this.closed = false;
  }

  async _connect() {
    const ws = new WebSocket(this.target.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this._pending.has(m.id)) {
        this._pending.get(m.id)(m);
        this._pending.delete(m.id);
      } else if (m.method === 'Runtime.consoleAPICalled') {
        this.logs.push(m.params.type + ': ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      } else if (m.method === 'Runtime.exceptionThrown') {
        this.logs.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
      }
    };
    ws.onclose = () => {
      for (const fn of this._pending.values()) fn({ error: { message: 'tab closed' } });
      this._pending.clear();
    };
    this.ws = ws;
  }

  cmd(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (this.ws.readyState !== 1) {
        reject(new Error(`${this.label}: tab closed`));
        return;
      }
      const id = ++this._id;
      this._pending.set(id, (m) => (m.error ? reject(new Error(`${this.label}: ${m.error.message}`)) : resolve(m.result)));
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /** Evaluates an expression in the page (promises awaited); throws on a page exception. */
  async eval(expr) {
    const res = await this.cmd('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: 120000 });
    if (res.exceptionDetails) throw new Error(`${this.label}: ${res.exceptionDetails.exception?.description || res.exceptionDetails.text}`);
    return res.result.value;
  }

  /** Abrupt close, like a killed app: no bye, no MQTT DISCONNECT (the broker publishes the will). */
  async crash() {
    this.closed = true;
    await getJson(`http://127.0.0.1:${CDP_PORT}/json/close/${this.target.id}`).catch(() => {});
    this.ws.close();
  }
}

// ---------------------------------------------------------------- runner

const results = [];
const metrics = {};
let group = '';

function section(name) {
  group = name;
  console.log(`\n== ${name}`);
}

/** A step that cannot run because an earlier one failed (e.g. a guest never joined). */
class Skip extends Error {}
const skip = (why) => {
  throw new Skip(why);
};

async function test(name, fn, ms = 60000) {
  const t0 = now();
  let ok = false;
  let skipped = false;
  let note = '';
  let timer;
  try {
    const r = await Promise.race([fn(), new Promise((_, rej) => (timer = setTimeout(() => rej(new Error(`test timed out after ${ms} ms`)), ms)))]);
    ok = true;
    if (typeof r === 'string') note = r;
  } catch (e) {
    skipped = e instanceof Skip;
    note = (e && e.message) || String(e);
  }
  clearTimeout(timer);
  const t = Math.round(now() - t0);
  results.push({ group, name, ok, skipped, ms: t, note });
  console.log(`  ${ok ? 'PASS' : skipped ? 'SKIP' : 'FAIL'}  ${name.padEnd(46)} ${String(t).padStart(6)} ms  ${note}`);
  if (!ok && !skipped) await diagnose();
  return ok;
}

/** Tabs of the running scenario: on a failure, their network counters are printed. */
let diagTabs = [];
async function diagnose() {
  for (const T of diagTabs) {
    if (T.closed) continue;
    const d = await Promise.race([
      T.eval(`(() => { const r = netTest.room; if (!r) return 'no room'; const s = r.stats(); return JSON.stringify({ closed: r.closed, why: netTest.closedReason, mqtt: s.mqtt, peers: s.peers.map((p) => ({ n: p.name, j: p.joined, tr: p.transport, p2p: p.p2p, rtt: p.rtt, pend: p.pending, out: p.msgsOut, in: p.msgsIn, rs: p.resent, rin: p.relayIn })) }); })()`),
      sleep(5000).then(() => 'no answer in 5 s'),
    ]).catch((e) => e.message);
    console.log(`        [${T.label}] ${d}`);
  }
}

async function until(pred, ms, what) {
  const t0 = now();
  for (;;) {
    const v = await pred();
    if (v) return v;
    if (now() - t0 > ms) throw new Error('timed out waiting for ' + (typeof what === 'function' ? await what() : what));
    await sleep(100);
  }
}

const state = (tab) => tab.eval('netTest.state()');
const retries = [];

/**
 * Joins; a 'network' / 'timeout' failure (broker handshake or a starved tab on a loaded machine) is
 * retried once, as a player would tap "join" again. Protocol rejections are never retried.
 */
async function joinTab(G, code, opts) {
  let j = await G.eval(`netTest.join(${js(code)}, ${js(opts)})`);
  if (!j.ok && (j.code === 'network' || j.code === 'timeout')) {
    retries.push(`${G.label} join: ${j.code} after ${j.ms} ms`);
    j = await G.eval(`netTest.join(${js(code)}, ${js(opts)})`);
  }
  return j;
}

/** A join that should be rejected, from a tab that keeps its own room (see netTest.tryJoin). */
async function tryJoinTab(T, code, opts) {
  let j = await T.eval(`netTest.tryJoin(${js(code)}, ${js(opts)})`);
  if (!j.ok && (j.code === 'network' || j.code === 'timeout')) {
    retries.push(`${T.label} tryJoin: ${j.code} after ${j.ms} ms`);
    j = await T.eval(`netTest.tryJoin(${js(code)}, ${js(opts)})`);
  }
  return j;
}

async function hostTab(H, opts) {
  try {
    return await H.eval(`netTest.host(${js(opts)})`);
  } catch (e) {
    retries.push(`${H.label} host: ${e.message.split('\n')[0]}`);
    return H.eval(`netTest.host(${js(opts)})`);
  }
}
const events = (tab, ev) => tab.eval(`netTest.events.filter((e) => e.ev === ${JSON.stringify(ev)})`);
const js = (v) => JSON.stringify(v);
const fmtQ = (q) => (q && q.n ? `${q.min}/${q.med}/${q.p95}/${q.max}` : '-');

// ---------------------------------------------------------------- scenario building blocks

async function hostAndJoin(H, guests, { hostOpts = {}, guestOpts = [] } = {}) {
  const roomName = 'net-test ' + Math.random().toString(36).slice(2, 6);
  const h = await hostTab(H, { name: '房主', version: VERSION, roomName, meta: { map: 'testArena', difficulty: 'normal', state: 'lobby' }, ...pin, ...hostOpts });
  const joins = await Promise.all(guests.map((G, i) => joinTab(G, h.code, { name: '玩家' + (i + 1), version: VERSION, ...(guestOpts[i] || {}) })));
  return { ...h, roomName, joins };
}

/** Every peer view converged: host sees all guests joined, every guest sees everyone. */
async function converged(H, guests, transports) {
  await until(async () => {
    const hs = await state(H);
    if (hs.peers.length !== guests.length) return false;
    for (let i = 0; i < guests.length; i++) {
      const gs = await state(guests[i]);
      if (gs.peers.length !== guests.length) return false;
      const hp = hs.peers.find((p) => p.id === gs.selfId);
      if (!hp || (transports && hp.transport !== transports[i])) return false;
    }
    return true;
  }, 25000, async () => 'converged views: ' + js((await state(H)).peers.map((p) => [p.name, p.transport])));
}

/** Reliable streams both ways (guests -> host, host -> each guest, host broadcast), order checked. */
async function reliableExchange(H, guests, n, perTick = 10, everyMs = 20) {
  for (const T of [H, ...guests]) await T.eval('netTest.clear()');
  const ids = await Promise.all(guests.map(async (G) => (await state(G)).selfId));
  const hostId = (await state(H)).selfId;
  const t0 = now();
  await Promise.all([
    ...guests.map((G) => G.eval(`netTest.burst(${js({ type: 'rel', n, perTick, everyMs })})`)),
    ...ids.map((id) => H.eval(`netTest.burst(${js({ type: 'rel1', n, perTick, everyMs, to: id })})`)),
    H.eval(`netTest.burst(${js({ type: 'relb', n, perTick, everyMs, broadcast: true, pad: 200 })})`),
  ]);
  const check = (g, from, what) => {
    const s = g[from];
    assert(s, `${what}: nothing received`);
    assert(s.disorder === 0 && s.dups === 0 && s.missing === 0 && s.n === n, `${what}: ${js(s)}`);
  };
  await until(async () => {
    const hg = await H.eval(`netTest.got('rel', ${n})`);
    if (!ids.every((id) => hg[id] && hg[id].n >= n)) return false;
    for (const G of guests) {
      const a = await G.eval(`netTest.got('rel1', ${n})`);
      const b = await G.eval(`netTest.got('relb', ${n})`);
      if (!a[hostId] || a[hostId].n < n || !b[hostId] || b[hostId].n < n) return false;
    }
    return true;
  }, 60000, async () => 'all reliable messages: host got ' + js(await H.eval(`netTest.got('rel', ${n})`)));
  const ms = Math.round(now() - t0);
  await sleep(500); // late duplicates would show up here
  const hg = await H.eval(`netTest.got('rel', ${n})`);
  ids.forEach((id, i) => check(hg, id, `guest ${i + 1} -> host`));
  for (let i = 0; i < guests.length; i++) {
    check(await guests[i].eval(`netTest.got('rel1', ${n})`), hostId, `host -> guest ${i + 1}`);
    check(await guests[i].eval(`netTest.got('relb', ${n})`), hostId, `host broadcast -> guest ${i + 1}`);
  }
  return `${n} x 3 streams per guest, in order, no dups, ${ms} ms`;
}

/** Unreliable: host snapshots at 60 Hz, guest inputs at 30 Hz; no older-after-newer deliveries. */
async function unreliableExchange(H, guests, seconds = 2) {
  for (const T of [H, ...guests]) await T.eval('netTest.clear()');
  const hostId = (await state(H)).selfId;
  const nSnap = Math.round(seconds * 60);
  const nInp = Math.round(seconds * 30);
  await Promise.all([
    H.eval(`netTest.burst(${js({ type: 'snap', n: nSnap, reliable: false, everyMs: 16, broadcast: true, pad: 600 })})`),
    ...guests.map((G) => G.eval(`netTest.burst(${js({ type: 'inp', n: nInp, reliable: false, everyMs: 33, pad: 40 })})`)),
  ]);
  await sleep(1500);
  const parts = [];
  for (let i = 0; i < guests.length; i++) {
    const s = (await guests[i].eval(`netTest.got('snap', ${nSnap})`))[hostId];
    assert(s && s.disorder === 0 && s.dups === 0, `snap -> guest ${i + 1}: ${js(s)}`);
    parts.push(`${s.n}/${nSnap}`);
  }
  const hg = await H.eval(`netTest.got('inp', ${nInp})`);
  const ins = Object.values(hg);
  assert(ins.length === guests.length && ins.every((s) => s.disorder === 0 && s.dups === 0), 'inputs: ' + js(hg));
  return `snapshots delivered ${parts.join(', ')}; inputs ${ins.map((s) => `${s.n}/${nInp}`).join(', ')}`;
}

async function rttReport(H, guests, label) {
  await sleep(3500); // a few 1 s pings on the settled transport
  const hs = await state(H);
  const peerRtt = hs.peers.map((p) => `${p.name}:${p.transport}:${p.rtt}`);
  const echoes = [];
  for (const p of hs.peers) {
    const rel = await H.eval(`netTest.echo(${js({ to: p.id, n: 15, reliable: true, everyMs: 80 })})`);
    const unrel = await H.eval(`netTest.echo(${js({ to: p.id, n: 15, reliable: false, everyMs: 80 })})`);
    echoes.push({ name: p.name, transport: p.transport, ping: p.rtt, rel, unrel });
  }
  const gs = await state(guests[0]);
  const gEcho = await guests[0].eval(`netTest.echo(${js({ n: 15, reliable: true, everyMs: 80 })})`);
  metrics[label] = { peers: echoes, guestToHost: gEcho, guestPing: gs.peers.find((p) => p.id === gs.hostId).rtt };
  return 'link ping ' + peerRtt.join(' ') + '; echo rel med ' + echoes.map((e) => Math.round(e.rel.med)).join('/') + ' ms';
}

/** Guest i leaves cleanly: host and the other guests see peer-leave 'left'. */
async function guestLeaves(H, guests, i) {
  const G = guests[i];
  const id = (await state(G)).selfId;
  const t0 = now();
  await G.eval('netTest.close()');
  await until(async () => (await events(H, 'peer-leave')).some((e) => e.id === id && e.reason === 'left'), 20000, 'host peer-leave');
  const ms = Math.round(now() - t0);
  for (const O of guests) {
    if (O === G) continue;
    await until(async () => (await events(O, 'peer-leave')).some((e) => e.id === id), 20000, 'other guest peer-leave');
  }
  return `host saw it after ${ms} ms`;
}

async function hostCloses(H, guests, X, code) {
  const t0 = now();
  await H.eval('netTest.close()');
  for (const G of guests) await until(async () => (await state(G)).closedReason === 'host-left', 20000, 'guest closed host-left');
  const ms = Math.round(now() - t0);
  await sleep(300);
  const l = await X.eval(`netTest.list(${js({ version: VERSION })})`);
  assert(!l.rooms.some((r) => r.code === code), 'room still listed after close');
  return `guests closed 'host-left' after ${ms} ms; gone from the list`;
}

async function freshTabs(url, labels) {
  return Promise.all(labels.map((l) => Tab.open(url, l)));
}

// ---------------------------------------------------------------- scenarios

async function scenarioProbe(url) {
  section('brokers: connect time and publish -> echo round trip, from the browser');
  const [P] = await freshTabs(url, ['probe']);
  await test('test tabs are visible (no background timer throttling)', async () => {
    const [A, B] = await freshTabs(url, ['vis-a', 'vis-b']);
    const v = [P.visibility, A.visibility, B.visibility];
    await finishTabs([A, B]);
    assert(v.every((x) => x === 'visible'), 'visibilityState ' + js(v));
    return v.join(', ');
  });
  await test('probe every broker', async () => {
    const r = await P.eval('netTest.probeBrokers({ tries: 3 })');
    metrics.brokers = r;
    for (const b of r) console.log(`        ${b.url.padEnd(38)} connect ${b.connect.join(', ')} ms; echo ${b.echo.join(', ') || '-'} ms`);
    const up = r.filter((b) => b.echo.length);
    assert(up.length, 'no broker reachable');
    return `${up.length}/${r.length} brokers reachable`;
  }, 120000);
  await finishTabs([P]);
}

async function scenarioP2P(url) {
  section('p2p: 1 host + 3 guests over WebRTC DataChannels');
  const tabs = await freshTabs(url, ['host', 'g1', 'g2', 'g3']);
  diagTabs = tabs;
  const [H, G1, G2, G3] = tabs;
  const X = H; // list scans and joins that must be rejected run from the host tab (own connections)
  let live = []; // guests that are in the room right now
  let room;
  await test('host room', async () => {
    const roomName = 'net-test ' + Math.random().toString(36).slice(2, 6);
    room = await hostTab(H, { name: '房主', version: VERSION, roomName, meta: { map: 'testArena', difficulty: 'normal', state: 'lobby' }, ...pin });
    room.roomName = roomName;
    return `code ${room.code} on ${room.broker} in ${room.ms} ms`;
  });
  if (!room) return finishTabs(tabs);
  await test('public list shows the room (1/4, lobby)', async () => {
    const l = await X.eval(`netTest.list(${js({ version: VERSION })})`);
    const r = l.rooms.find((x) => x.code === room.code);
    assert(r, 'not listed: ' + js(l.rooms.map((x) => x.code)));
    assert(r.players === 1 && r.maxPlayers === 4 && r.state === 'lobby' && r.joinable && r.name === room.roomName && r.host === '房主' && r.map === 'testArena' && r.difficulty === 'normal', js(r));
    metrics.listMs = l.ms;
    return `${l.rooms.length} room(s) listed in ${l.ms} ms`;
  });
  await test('3 guests join at once (p2p)', async () => {
    const all = [G1, G2, G3];
    const joins = await Promise.all(all.map((G, i) => joinTab(G, room.code, { name: '玩家' + (i + 1), version: VERSION })));
    live = all.filter((_, i) => joins[i].ok);
    // Normally p2p at once; a peer whose DataChannels took > 6 s starts on the relay and upgrades.
    await converged(H, live, live.map(() => 'p2p'));
    for (const j of joins) assert(j.ok, 'join failed: ' + js(j));
    const slots = joins.map((j) => j.slot).sort();
    assert(js(slots) === '[1,2,3]', 'slots ' + js(slots));
    assert(joins.every((j) => j.meta.map === 'testArena'), 'meta not synced');
    metrics.p2pJoinMs = joins.map((j) => j.ms);
    const late = joins.filter((j) => j.transport !== 'p2p').length;
    const hs = await state(H);
    return `join ${joins.map((j) => j.ms).join('/')} ms, p2p open after ${hs.stats.peers.map((p) => p.p2pMs).join('/')} ms` + (late ? ` (${late} upgraded from relay later)` : '');
  }, 120000);
  if (!live.length) return finishTabs(tabs);
  await test('5th player rejected: room full', async () => {
    if (live.length < 3) skip(`only ${live.length} guests joined`);
    const j = await tryJoinTab(X, room.code, { name: '第五人', version: VERSION });
    assert(!j.ok && j.code === 'full', js(j));
    return j.message;
  });
  await test('version mismatch rejected', async () => {
    const j = await tryJoinTab(X, room.code, { name: '舊版', version: 'old-version' });
    assert(!j.ok && j.code === 'version', js(j));
    return j.message;
  });
  await test('bad code / unknown room rejected', async () => {
    const a = await X.eval(`netTest.tryJoin('12a45', ${js({ version: VERSION })})`);
    assert(!a.ok && a.code === 'bad-code', js(a));
    const b = await X.eval(`netTest.tryJoin(${js(room.code[0])} + String(Math.floor(Math.random() * 10000)).padStart(4, '0'), ${js({ version: VERSION })})`);
    assert(!b.ok && b.code === 'not-found', js(b));
    return `${a.message} / ${b.message} (${b.ms} ms)`;
  });
  await test('public list shows 4/4, not joinable', async () => {
    if (live.length < 3) skip(`only ${live.length} guests joined`);
    const l = await X.eval(`netTest.list(${js({ version: VERSION })})`);
    const r = l.rooms.find((x) => x.code === room.code);
    assert(r && r.players === 4 && !r.joinable, js(r));
    return r.reason;
  });
  await test('reliable ordering (300 msgs x 3 streams per guest)', () => reliableExchange(H, live, 300), 90000);
  await test('unreliable streams (60 Hz snapshots, 30 Hz inputs)', () => unreliableExchange(H, live));
  await test('rtt over p2p', () => rttReport(H, live, 'p2p'), 90000);
  await test('setMeta reaches guests and the list', async () => {
    await H.eval(`netTest.room.setMeta(${js({ state: 'playing', map: 'harbor', difficulty: 'hard' })})`);
    for (const G of live) await until(async () => (await events(G, 'meta')).some((e) => e.meta.state === 'playing' && e.meta.map === 'harbor'), 20000, 'meta event');
    await sleep(1500);
    const l = await X.eval(`netTest.list(${js({ version: VERSION })})`);
    const r = l.rooms.find((x) => x.code === room.code);
    assert(r && r.state === 'playing' && r.map === 'harbor' && r.difficulty === 'hard', js(r));
    return 'state playing / harbor / hard';
  });
  await test('p2p dies mid-stream: relay takes over, then p2p again', async () => {
    const G = live[0];
    const gid = (await state(G)).selfId;
    await H.eval('netTest.clear()');
    await G.eval('netTest.clear()');
    const n = 150;
    const streams = Promise.all([
      H.eval(`netTest.burst(${js({ type: 'sw', n, everyMs: 20, to: gid })})`),
      G.eval(`netTest.burst(${js({ type: 'sw', n, everyMs: 20 })})`),
    ]);
    await sleep(1000);
    const broke = await H.eval(`netTest.room._debugBreakP2P(${js(gid)})`);
    assert(broke === 1, 'nothing to break');
    await streams;
    const hostId = (await state(H)).selfId;
    await until(async () => ((await G.eval(`netTest.got('sw', ${n})`))[hostId]?.n ?? 0) >= n && ((await H.eval(`netTest.got('sw', ${n})`))[gid]?.n ?? 0) >= n, 45000,
      async () => 'all messages across the switch: ' + js(await G.eval(`netTest.got('sw', ${n})`)));
    const a = (await G.eval(`netTest.got('sw', ${n})`))[hostId];
    const b = (await H.eval(`netTest.got('sw', ${n})`))[gid];
    assert(a.disorder === 0 && a.dups === 0 && a.missing === 0 && b.disorder === 0 && b.dups === 0 && b.missing === 0, js({ a, b }));
    const ups = await events(H, 'peer-update');
    assert(ups.some((e) => e.id === gid && e.transport === 'relay'), 'no switch to relay seen');
    await until(async () => (await state(H)).peers.find((p) => p.id === gid).transport === 'p2p', 30000, 'p2p again');
    const t = (await state(H)).stats.peers.find((p) => p.id === gid);
    return `${n} each way in order across the switch; back on p2p (${t.switches} switches, ${t.resent} resent)`;
  }, 90000);
  await test('guest leaves: host + others see peer-leave', async () => {
    if (live.length < 2) skip('needs 2 guests');
    const r = await guestLeaves(H, live, live.length - 1);
    live.pop();
    return r;
  });
  await test('host kicks a guest', async () => {
    if (live.length < 2) skip('needs 2 guests');
    const [other, G] = live;
    const id = (await state(G)).selfId;
    await H.eval(`netTest.room.kick(${js(id)})`);
    live.splice(1, 1);
    await until(async () => (await state(G)).closedReason === 'kicked', 20000, 'guest closed kicked');
    await until(async () => (await events(other, 'peer-leave')).some((e) => e.id === id && e.reason === 'kicked'), 20000, 'other guest sees kick');
    return 'kicked guest closed, the other one saw peer-leave kicked';
  });
  await test('host closes: guests closed host-left, list cleared', () => hostCloses(H, live, X, room.code));
  await finishTabs(tabs);
}

async function scenarioRelay(url) {
  section('relay: forceRelay host, everything through the MQTT broker');
  const tabs = await freshTabs(url, ['host', 'g1', 'g2', 'g3']);
  diagTabs = tabs;
  const [H, G1, G2, G3] = tabs;
  const X = H;
  let live = [];
  let room;
  await test('host (forceRelay) + 3 guests join', async () => {
    room = await hostAndJoin(H, [G1, G2, G3], { hostOpts: { forceRelay: true } });
    live = [G1, G2, G3].filter((_, i) => room.joins[i].ok);
    await converged(H, live, live.map(() => 'relay'));
    // Watch the publish rate of every tab from here on (EMQX drops above 10/s per connection).
    for (const T of [H, ...live]) {
      await T.eval(`(() => { const c = netTest.room._client; const orig = c.publish.bind(c); netTest.pubs = []; c.publish = (...a) => { netTest.pubs.push(performance.now()); return orig(...a); }; return true; })()`);
    }
    for (const j of room.joins) assert(j.ok && j.transport === 'relay', 'join: ' + js(j));
    metrics.relayJoinMs = room.joins.map((j) => j.ms);
    return `code ${room.code} on ${room.broker}, join ${room.joins.map((j) => j.ms).join('/')} ms`;
  }, 120000);
  if (!room || !live.length) return finishTabs(tabs);
  await test('reliable ordering (100 msgs x 3 streams per guest)', () => reliableExchange(H, live, 100, 10, 30), 90000);
  await test('unreliable streams coalesce, never reorder', () => unreliableExchange(H, live));
  await test('rtt over the relay', () => rttReport(H, live, 'relay'), 90000);
  await test('publish rate stays within the broker limit', async () => {
    const rates = [];
    for (const T of [H, ...live]) {
      rates.push(await T.eval(`(() => { const l = netTest.pubs || []; let best = 0; for (let i = 0, j = 0; i < l.length; i++) { while (l[i] - l[j] >= 1000) j++; best = Math.max(best, i - j + 1); } return best; })()`));
    }
    assert(rates.every((r) => r <= 9), 'publishes per second: ' + js(rates));
    return 'max publishes/s host ' + rates[0] + ', guests ' + rates.slice(1).join('/');
  });
  await test('guest leaves: host + others see peer-leave', async () => {
    if (live.length < 2) skip('needs 2 guests');
    const r = await guestLeaves(H, live, live.length - 1);
    live.pop();
    return r;
  });
  await test('host closes: guests closed host-left, list cleared', () => hostCloses(H, live, X, room.code));
  await finishTabs(tabs);
}

async function scenarioMixed(url) {
  section('mixed transports + crashes (tab killed without goodbye)');
  const tabs = await freshTabs(url, ['host', 'g1', 'g2']);
  diagTabs = tabs;
  const [H, G1, G2] = tabs;
  let room;
  let ok1 = false;
  let ok2 = false;
  await test('one p2p guest + one forceRelay guest', async () => {
    room = await hostAndJoin(H, [G1, G2], { guestOpts: [{}, { forceRelay: true }] });
    [ok1, ok2] = room.joins.map((j) => j.ok);
    await converged(H, [G1, G2].filter((_, i) => room.joins[i].ok), [ok1 && 'p2p', ok2 && 'relay'].filter(Boolean));
    assert(ok1 && ok2, 'join failed: ' + js(room.joins));
    assert(room.joins[1].transport === 'relay', js(room.joins[1]));
    await until(async () => (await state(G1)).peers.find((p) => p.id === room.joins[1].selfId)?.transport === 'relay', 10000, 'ping table');
    return `code ${room.code}; g1 sees g2 on the relay via the host's ping table`;
  }, 120000);
  if (!room || !(ok1 && ok2)) return finishTabs(tabs);
  await test('reliable ordering across mixed transports', () => reliableExchange(H, [G1, G2], 100, 10, 30), 90000);
  await test('rtt p2p vs relay side by side', () => rttReport(H, [G1, G2], 'mixed'), 90000);
  await test('relay guest crashes: host notices (last will)', async () => {
    const id = room.joins[1].selfId;
    assert(!(await events(H, 'peer-leave')).some((e) => e.id === id), 'already gone before the crash');
    const t0 = now();
    await G2.crash();
    await until(async () => (await events(H, 'peer-leave')).some((e) => e.id === id), 20000, 'peer-leave after crash');
    const e = (await events(H, 'peer-leave')).find((x) => x.id === id);
    await until(async () => (await events(G1, 'peer-leave')).some((x) => x.id === id), 10000, 'other guest peer-leave');
    return `peer-leave '${e.reason}' after ${Math.round(now() - t0)} ms`;
  });
  await test('p2p guest crashes: host notices', async () => {
    const id = room.joins[0].selfId;
    assert(!(await events(H, 'peer-leave')).some((e) => e.id === id), 'already gone before the crash');
    const t0 = now();
    await G1.crash();
    await until(async () => (await events(H, 'peer-leave')).some((e) => e.id === id), 20000, 'peer-leave after crash');
    const e = (await events(H, 'peer-leave')).find((x) => x.id === id);
    return `peer-leave '${e.reason}' after ${Math.round(now() - t0)} ms`;
  });
  await test('host crashes: guest closes host-left, list cleared', async () => {
    const [G3] = await freshTabs(url, ['g3']);
    tabs.push(G3);
    const j = await joinTab(G3, room.code, { name: '玩家3', version: VERSION });
    assert(j.ok, js(j));
    await sleep(1500);
    const t0 = now();
    await H.crash();
    await until(async () => (await state(G3)).closedReason, 25000, 'guest closed');
    const reason = (await state(G3)).closedReason;
    const ms = Math.round(now() - t0);
    assert(reason === 'host-left', 'closed: ' + reason);
    const l = await G3.eval(`netTest.list(${js({ version: VERSION })})`);
    assert(!l.rooms.some((r) => r.code === room.code), 'still listed');
    return `guest (${j.transport}) closed '${reason}' after ${ms} ms; the will cleared the list entry`;
  }, 90000);
  await finishTabs(tabs);
}

async function finishTabs(tabs) {
  for (const T of tabs) {
    const errs = T.logs.filter((l) => /^(error|EXCEPTION)/.test(l));
    if (errs.length) console.log(`  [${T.label}] console errors:\n    ` + errs.slice(-10).join('\n    '));
    if (T.closed) continue;
    await T.eval('netTest.close()').catch(() => {});
    await T.crash();
  }
}

// ---------------------------------------------------------------- main

await buildNetTest();
const url = await pageUrl();
const version = await launchBrowser();
console.log(`${version.Browser} | page ${url} | version tag ${VERSION}`);
const t0 = now();
try {
  const scenarios = { probe: scenarioProbe, p2p: scenarioP2P, relay: scenarioRelay, mixed: scenarioMixed };
  for (const [name, fn] of Object.entries(scenarios)) {
    if (!ONLY.includes(name)) continue;
    try {
      await fn(url);
    } catch (e) { // e.g. a tab that never loaded: the scenario fails, the run goes on
      results.push({ group: name, name: 'scenario aborted', ok: false, ms: 0, note: e.message });
      console.log(`  FAIL  scenario aborted: ${e.message}`);
    }
  }
} finally {
  const dir = profile;
  killBrowser();
  releaseLock();
  // The profile stays locked for a moment after the kill: retry before giving up on it.
  for (let i = 0; dir && i < 20 && fs.existsSync(dir); i++) {
    await sleep(500);
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // still locked
    }
  }
}

console.log('\n== summary');
const failed = results.filter((r) => !r.ok && !r.skipped);
const skippedN = results.filter((r) => r.skipped).length;
console.log(`${results.length - failed.length - skippedN}/${results.length} passed${skippedN ? `, ${skippedN} skipped` : ''} in ${Math.round((now() - t0) / 1000)} s`);
for (const r of failed) console.log(`  FAIL [${r.group}] ${r.name}: ${r.note}`);
if (retries.length) console.log('  retried (environment): ' + retries.join('; '));
for (const [label, m] of Object.entries(metrics)) {
  if (!m || !m.peers) continue;
  console.log(`  rtt ${label}:`);
  for (const p of m.peers) console.log(`    host<->${p.name} ${p.transport}: link ping ${p.ping} ms, echo reliable ${fmtQ(p.rel)} ms, unreliable ${fmtQ(p.unrel)} ms (min/med/p95/max, lost ${p.unrel.lost})`);
  console.log(`    guest1->host echo reliable ${fmtQ(m.guestToHost)} ms`);
}
if (metrics.p2pJoinMs) console.log(`  join time p2p ${metrics.p2pJoinMs.join('/')} ms, relay ${metrics.relayJoinMs ? metrics.relayJoinMs.join('/') : '-'} ms; list scan ${metrics.listMs} ms`);
process.exit(failed.length ? 1 : 0);
