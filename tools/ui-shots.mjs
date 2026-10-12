// Front-end screen gallery: ONE headless Edge, walks every menu screen (driving window.__app) and saves
// a screenshot of each at phone landscape and/or desktop size. Shares the browser semaphore with shot.mjs.
//   node tools/ui-shots.mjs [--sizes 844x390@2,1280x720@1] [--only menu,solo,...] [--url http://127.0.0.1:5190/?touch=1]
// Output: captures/ui_<step>_<w>.png
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const sizes = opt('sizes', '844x390@2,1280x720@1').split(',').map((s) => { const [wh, dpr] = s.split('@'); const [w, h] = wh.split('x').map(Number); return { w, h, dpr: +(dpr || 1) }; });
const only = opt('only', '') ? opt('only').split(',') : null;
const BASE = opt('url', 'http://127.0.0.1:5190/?touch=1');
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));
const port = 9300 + Math.floor(Math.random() * 90);

// mock room for lobby / multiplayer-results layouts (the real flow is covered by tools/mp-flow-test.mjs)
const MOCK = `(() => {
  const peers = new Map([['g1', { id: 'g1', name: '夜鷹', slot: 1, rtt: 38, transport: 'p2p' }], ['g2', { id: 'g2', name: 'Raven_TW', slot: 2, rtt: 412, transport: 'relay' }]]);
  return { code: '24817', isHost: true, selfId: 'h0', slot: 0, name: '玩家554', roomName: '玩家554的房間', isPublic: true, maxPlayers: 4,
    meta: { map: __app.mapId, difficulty: 'hard', state: 'lobby' }, statusText: '「夜鷹」 P2P 直連成功', peers, closed: false,
    players() { return [{ id: 'h0', name: this.name, slot: 0, rtt: 0, transport: 'self', self: true }, ...[...peers.values()].map((p) => ({ ...p, self: false }))]; },
    on() { return this; }, off() { return this; }, setMeta(p) { Object.assign(this.meta, p); }, send() {}, broadcast() {}, close() {}, kick() {} };
})()`;

const STEPS = [
  ['menu', `__app.closeOverlays(); __app.dialogs.closeAll(); __app.show('menu')`, 900],
  ['solo', `__app.show('solo')`, 700],
  ['mp', `__app.show('mp')`, 2500],
  ['create', `__app.screens.mp.createDialog()`, 500],
  ['keypad', `__app.dialogs.closeAll(); __app.screens.mp.keypad(); for (const k of '248') document.querySelector('.kp-pad [data-k="' + k + '"]').click()`, 500],
  ['armory', `__app.dialogs.closeAll(); __app.show('armory')`, 2500],
  ['settings', `__app.show('menu'); __app.openOverlay('settings')`, 600],
  ['settings_xh', `__app.screens.settings.tab = 'xh'; __app.screens.settings.render()`, 400],
  ['settings_gfx', `__app.screens.settings.tab = 'gfx'; __app.screens.settings.render()`, 400],
  ['lobby', `__app.closeOverlays(); __app.room = ${MOCK}; __app.show('lobby')`, 700],
  ['lobby_guest', `__app.room.isHost = false; __app.room.selfId = 'g1'; __app.room.players = function () { return [{ id: 'h0', name: '老王', slot: 0, rtt: 41, transport: 'p2p', self: false }, { id: 'g1', name: '玩家554', slot: 1, rtt: 0, transport: 'self', self: true }]; }; __app.screens.lobby.render()`, 400],
  ['loading', `__app.screens.lobby.leave(); __app.room = null; __app.show('loading'); __app.loading.show({ title: '失落之城', sub: 'LOST TOWN', msg: '準備武器與感染者…', tip: true }); __app.loading.progress(0.62)`, 500],
  ['results', `__app.loading.hide(); __app.showResults({ victory: true, stats: { kills: 57, headshots: 21, money: 8450 }, round: 10, map: __app.mapId, difficulty: 'hard', time: 754, mp: false })`, 600],
  ['results_mp', `__app.room = ${MOCK}; __app.coop = { boardRows: () => [
      { id: 'h0', name: '玩家554', slot: 0, k: 41, h: 12, m: 6100, self: true, host: true },
      { id: 'g1', name: '夜鷹', slot: 1, k: 63, h: 30, m: 8800 }, { id: 'g2', name: 'Raven_TW', slot: 2, k: 22, h: 4, m: 3350 }], update() {} };
    __app.showResults({ victory: false, stats: { kills: 41, headshots: 12, money: 6100 }, round: 7, map: __app.mapId, difficulty: 'hell', time: 1302, mp: true })`, 600],
  ['game', `__app.room = null; __app.coop = null; __app.closeOverlays(); await __app.startSolo({ map: __app.mapId, difficulty: 'normal' }); await new Promise((r) => setTimeout(r, 1500))`, 800],
  ['pause', `__app.pause()`, 500],
  ['quit', `document.querySelector('.pause [data-act=quit]').click()`, 400],
];

// browser slot (same semaphore as tools/shot.mjs)
const lockDir = path.join(os.tmpdir(), 'cf-shot-locks');
fs.mkdirSync(lockDir, { recursive: true });
let lock = null;
while (!lock) {
  for (let k = 0; k < 2 && !lock; k++) {
    const f = path.join(lockDir, `slot${k}.lock`);
    try { if (Date.now() - fs.statSync(f).mtimeMs > 240000) fs.unlinkSync(f); } catch { /* free */ }
    try { fs.writeFileSync(f, String(process.pid), { flag: 'wx' }); lock = f; } catch { /* busy */ }
  }
  if (!lock) await new Promise((r) => setTimeout(r, 800));
}
const child = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(os.tmpdir(), 'cf-ui-' + port)}`,
  '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', '--no-first-run', '--disable-extensions',
  '--autoplay-policy=no-user-gesture-required', `--window-size=${sizes[0].w},${sizes[0].h}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { execFileSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' }); } catch { /* gone */ } try { fs.unlinkSync(lock); } catch { /* gone */ } };
process.on('exit', cleanup);
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => process.exit(1));
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 420000).unref();

const json = async (u, o) => (await fetch(u, o)).json();
for (let i = 0; i < 100; i++) { try { await json(`http://127.0.0.1:${port}/json/version`); break; } catch { await new Promise((r) => setTimeout(r, 200)); } }
const target = await json(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0;
const pend = new Map();
const logs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  else if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) logs.push(m.params.type + ': ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
  else if (m.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true, timeout: 90000 });
  if (r.result?.exceptionDetails) return 'EXC ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: sizes[0].w, height: sizes[0].h, deviceScaleFactor: sizes[0].dpr, mobile: false });
await send('Page.navigate', { url: BASE });
for (let t = 0; t < 120; t++) {
  await new Promise((r) => setTimeout(r, 500));
  if (await ev('return window.__shotReady === true') === true) break;
}
await new Promise((r) => setTimeout(r, 1500));
fs.mkdirSync('captures', { recursive: true });
for (const [name, js, wait] of STEPS) {
  const r = await ev(js + '; return "ok"');
  if (r !== 'ok') console.log(name, '->', r);
  if (only && !only.includes(name)) { await new Promise((res) => setTimeout(res, 200)); continue; }
  for (const s of sizes) {
    await send('Emulation.setDeviceMetricsOverride', { width: s.w, height: s.h, deviceScaleFactor: s.dpr, mobile: false });
    await new Promise((res) => setTimeout(res, wait));
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const file = `captures/ui_${name}_${s.w}.png`;
    fs.writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
    console.log('saved', file);
  }
}
if (logs.length) console.log('--- console (errors/warnings) ---\n' + logs.filter((l) => !/X4122|X3577|audio manifest|Program Info/.test(l)).slice(-30).join('\n'));
process.exit(0);
