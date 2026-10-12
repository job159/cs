// End-to-end multiplayer FRONT-END flow over the real public brokers, driven only through the UI (DOM
// clicks, like a player): one headless Edge, host window + guest window.
//   main menu -> 多人連線 -> 建立房間 -> lobby (room code)  |  guest: 多人連線 -> 輸入房號 keypad -> 加入
//   -> both in the lobby -> host 開始遊戲 -> 'start' -> both load the same map -> ready / go -> both in game
//   -> replication checks (remote players, zombies / puppets, guest kill credited) -> MP pause keeps running
//   -> forced victory -> results with the per-player table on both -> 返回大廳 -> second match -> host leaves
//   -> guest gets the 'host left' dialog.
//   node tools/mp-flow-test.mjs [--relay] [--quick]   (--quick stops after both are in game)
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = 'http://127.0.0.1:5190/?q=low&touch=0';
const quick = process.argv.includes('--quick');
const port = 9700 + Math.floor(Math.random() * 250);
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const lockDir = path.join(os.tmpdir(), 'cf-shot-locks');
fs.mkdirSync(lockDir, { recursive: true });
let lock = null;
while (!lock) {
  for (let k = 0; k < 2 && !lock; k++) {
    const f = path.join(lockDir, `slot${k}.lock`);
    try { if (Date.now() - fs.statSync(f).mtimeMs > 240000) fs.unlinkSync(f); } catch { /* free */ }
    try { fs.writeFileSync(f, String(process.pid), { flag: 'wx' }); lock = f; } catch { /* busy */ }
  }
  if (!lock) await new Promise((r) => setTimeout(r, 1000));
}
const child = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(os.tmpdir(), 'cf-mpflow-' + port)}`,
  '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', '--no-first-run', '--disable-extensions',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { execFileSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' }); } catch { /* gone */ } try { fs.unlinkSync(lock); } catch { /* gone */ } };
process.on('exit', cleanup);
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => process.exit(1));
setTimeout(() => { console.log('TIMEOUT'); report(); process.exit(2); }, 420000).unref();

const results = [];
const t0 = Date.now();
const sec = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(6);
function check(name, ok, detail = '') { results.push({ name, ok: !!ok, detail }); console.log(`${sec()}s ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); return ok; }
function report() {
  const fail = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fail.length}/${results.length} checks passed${fail.length ? '; failed: ' + fail.map((f) => f.name).join(', ') : ''}`);
}

const json = async (u, o) => (await fetch(u, o)).json();
for (let i = 0; i < 100; i++) { try { await json(`http://127.0.0.1:${port}/json/version`); break; } catch { await new Promise((r) => setTimeout(r, 200)); } }
const ver = await json(`http://127.0.0.1:${port}/json/version`);
const bws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((r) => { bws.onopen = r; });
let bid = 0; const bpend = new Map();
bws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && bpend.has(m.id)) { bpend.get(m.id)(m); bpend.delete(m.id); } };
const bsend = (method, params = {}) => new Promise((r) => { const i = ++bid; bpend.set(i, r); bws.send(JSON.stringify({ id: i, method, params })); });

async function tab(label, url) {
  const created = await bsend('Target.createTarget', { url: 'about:blank', newWindow: true });
  const list = await json(`http://127.0.0.1:${port}/json/list`);
  const t = list.find((x) => x.id === created.result.targetId);
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0; const pend = new Map(); const logs = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    else if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.type + ': ' + m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300));
    else if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true, timeout: 60000 });
    return r.result?.exceptionDetails ? 'EXC ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text) : r.result?.result?.value;
  };
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  return { label, ev, logs, send };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(t, expr, ms = 60000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await t.ev(`return (${expr})`);
    if (v && !String(v).startsWith('EXC')) return v;
    await sleep(400);
  }
  return null;
}
// DOM helpers evaluated in the page: click a selector, type into an input
const click = (t, sel) => t.ev(`const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return 'missing ${sel.replace(/'/g, '')}'; b.click(); return 'ok'`);
const typeName = (t, name) => t.ev(`const i = document.querySelector('.mp-name input'); i.value = ${JSON.stringify(name)}; i.dispatchEvent(new Event('change')); return __app.playerName`);
const diag = (t) => t.ev(`return JSON.stringify({ state: __app.state, loading: __app.loadingMatch, msg: document.querySelector('#boot .boot-msg')?.textContent, bar: document.querySelector('#boot .boot-bar i')?.style.width,
  mi: __app.matchInfo, game: !!__cf.game, player: !!__cf.game?.player, match: __cf.game?.match?.state, room: __app.room && { closed: __app.room.closed, status: __app.room.statusText, peers: [...__app.room.peers.values()].map((p) => p.name + ':' + p.transport + ':' + Math.round(p.rtt)) },
  coop: __app.coop && { n: __app.coop.n, loadingN: __app.coop.loadingN, goN: __app.coop.goN, ready: [...__app.coop.ready], attached: __app.coop.attached } })`);
async function shot(t, file) {
  const r = await t.send('Page.captureScreenshot', { format: 'png' });
  if (r.result?.data) fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
}

try {
  // ---------------------------------------------------------------- host creates a room
  const host = await tab('host', BASE);
  if (!check('host boots to the main menu', await waitFor(host, `window.__shotReady && __app.state === 'menu'`, 90000))) {
    console.log('state', await host.ev(`return JSON.stringify({ ready: window.__shotReady, state: window.__app?.state, href: location.href, boot: document.querySelector('#boot .boot-msg')?.textContent })`));
    console.log(host.logs.slice(-15).join(' || '));
    throw new Error('host did not boot');
  }
  await click(host, '.mm-nav [data-act=mp]');
  check('host opens 多人連線', await waitFor(host, `__app.state === 'mp'`, 5000));
  check('host name saved', (await typeName(host, 'HOST')) === 'HOST');
  await click(host, '.mp-side [data-act=create]');
  await waitFor(host, `document.querySelector('.cr-form')`, 5000);
  await click(host, '.cr-diff [data-v=hard]');
  await click(host, '.fe-dlg-btns .fe-btn.pri');
  const code = await waitFor(host, `__app.state === 'lobby' && document.querySelector('.lb-code b').textContent`, 45000);
  check('host is in the lobby with a room code', /^\d{5}$/.test(code || ''), `code ${code}`);
  if (!code) throw new Error('no room');
  check('lobby shows the host slot', await host.ev(`return document.querySelector('.slot.self .sl-name')?.textContent`) === 'HOST');

  // ---------------------------------------------------------------- guest joins by code on the keypad
  const guest = await tab('guest', BASE);
  check('guest boots to the main menu', await waitFor(guest, `window.__shotReady && __app.state === 'menu'`, 90000));
  await click(guest, '.mm-nav [data-act=mp]');
  await waitFor(guest, `__app.state === 'mp'`, 5000);
  check('guest name saved', (await typeName(guest, 'GUEST')) === 'GUEST');
  await click(guest, '.mp-side [data-act=code]');
  await waitFor(guest, `document.querySelector('.kp-pad')`, 5000);
  for (const d of code) await click(guest, `.kp-pad [data-k="${d}"]`);
  check('keypad shows the code', (await guest.ev(`return [...document.querySelectorAll('.kp-digits i')].map((i) => i.textContent).join('')`)) === code);
  await click(guest, '.kp-go');
  const tJoin = Date.now();
  check('guest joined and sees the lobby', await waitFor(guest, `__app.state === 'lobby' && __app.room && !__app.room.closed`, 45000), `${((Date.now() - tJoin) / 1000).toFixed(1)} s`);
  check('host lobby lists the guest', await waitFor(host, `[...document.querySelectorAll('.slot .sl-name')].map((n) => n.textContent).join(',') === 'HOST,GUEST'`, 15000));
  check('guest lobby lists both players', await waitFor(guest, `[...document.querySelectorAll('.slot .sl-name')].map((n) => n.textContent).join(',') === 'HOST,GUEST'`, 10000));
  check('guest sees difficulty 困難 and waits for the host', await guest.ev(`return document.querySelector('.lb-diff b')?.textContent === '困難' && !!document.querySelector('.lb-wait')`));
  const tr = await waitFor(guest, `(() => { const p = __app.room.players().find((x) => !x.self); return p && p.transport !== 'self' && (p.transport + ' ' + Math.round(p.rtt) + 'ms'); })()`, 10000);
  check('guest lobby shows transport / ping of the host', tr, tr || '');
  await shot(host, 'captures/mpflow_host_lobby.png');
  await shot(guest, 'captures/mpflow_guest_lobby.png');

  // ---------------------------------------------------------------- host starts (enabled once every player's link settled)
  check('host start button enabled', await waitFor(host, `document.querySelector('.lb-act [data-act=start]') && !document.querySelector('.lb-act [data-act=start]').disabled`, 15000));
  await click(host, '.lb-act [data-act=start]');
  const tStart = Date.now();
  if (!check('host enters the game', await waitFor(host, `__app.state === 'game' && !!__cf.game?.match`, 150000), `${((Date.now() - tStart) / 1000).toFixed(1)} s`)) {
    console.log('host', await diag(host)); console.log('guest', await diag(guest));
    console.log('host log:', host.logs.slice(-12).join(' || ')); console.log('guest log:', guest.logs.slice(-12).join(' || '));
  }
  if (!check('guest enters the game', await waitFor(guest, `__app.state === 'game' && !!__cf.game?.match`, 90000), `${((Date.now() - tStart) / 1000).toFixed(1)} s`)) {
    console.log('guest', await diag(guest)); console.log('guest log:', guest.logs.slice(-12).join(' || '));
    throw new Error('guest not in game');
  }
  const hMeta = await host.ev(`return JSON.stringify({ meta: __app.room.meta, map: __app.matchInfo.map, diff: __cf.game.match.diffId })`);
  const gInfo = await guest.ev(`return JSON.stringify({ map: __app.matchInfo.map, diff: __cf.game.match.diffId, mirror: !!__cf.game.match.isMirror })`);
  const hm = JSON.parse(hMeta), gm = JSON.parse(gInfo);
  check('room meta state is playing', hm.meta.state === 'playing');
  check('both loaded the same map + difficulty', hm.map === gm.map && hm.diff === gm.diff && gm.diff === 'hard', `${hm.map}/${hm.diff} vs ${gm.map}/${gm.diff}`);
  check('guest match mirrors the host', gm.mirror);
  check('host sees the guest as a remote player', await waitFor(host, `__cf.game.net && __cf.game.net.remotes.size === 1`, 15000));
  check('guest sees the host as a remote player', await waitFor(guest, `__cf.game.net && __cf.game.net.remotes.size === 1`, 15000));
  await shot(host, 'captures/mpflow_host_game.png');
  await shot(guest, 'captures/mpflow_guest_game.png');
  if (quick) throw new Error('quick: done');

  // ---------------------------------------------------------------- replication in play
  check('zombies spawn on the host after warmup', await waitFor(host, `__cf.game.zombies.list.filter((z) => z.alive).length > 0`, 30000));
  check('guest gets puppet zombies', await waitFor(guest, `__cf.game.zombies.list.filter((z) => z.puppet && z.alive).length > 0`, 15000));
  const kill = await guest.ev(`const g = __cf.game; const z = g.zombies.list.find((z) => z.alive); if (!z) return 'no zombie';
    for (let i = 0; i < 20 && z.alive; i++) z.damage({ amount: 60, part: 'chest', box: 'chest', dir: { x: 0, y: 0, z: 1 }, point: z.center(), knock: 1, stagger: 0.2, weapon: 'akm', shooter: g.localId });
    await new Promise((r) => setTimeout(r, 3500)); return JSON.stringify({ kills: g.match.stats.kills, money: g.match.money })`);
  check('guest kill confirmed by the host (reward)', /"kills":[1-9]/.test(kill || ''), kill);
  // pause in multiplayer: menu opens, simulation keeps running
  const before = await guest.ev(`__app.pause(); return __cf.game.time`);
  await sleep(1500);
  const pz = await guest.ev(`return JSON.stringify({ paused: __app.paused, overlay: __app.overlays.map((o) => o.el.className).join(), dt: __cf.game.time - ${before} })`);
  const pzv = JSON.parse(pz);
  check('MP pause opens the menu while the game keeps running', pzv.paused && /pause/.test(pzv.overlay) && pzv.dt > 1, pz);
  await guest.ev(`__app.resume(); return 1`);
  check('resume closes the pause menu', await guest.ev(`return !__app.paused && __app.overlays.length === 0 && __app.input.enabled`));
  check('host receives guest stats for the board', await waitFor(host, `(__app.coop.stats.get([...__app.room.peers.keys()][0])?.k || 0) >= 1`, 8000));

  // ---------------------------------------------------------------- results
  await host.ev(`__cf.game.match.victory(); return 1`);
  check('host shows results', await waitFor(host, `__app.state === 'results'`, 10000));
  check('guest shows results', await waitFor(guest, `__app.state === 'results'`, 12000));
  await sleep(2200);
  const hRows = await host.ev(`return [...document.querySelectorAll('.rt-r')].map((r) => r.querySelector('.rt-n').textContent + ':' + r.children[1].textContent).join(' | ')`);
  const gRows = await guest.ev(`return [...document.querySelectorAll('.rt-r')].map((r) => r.querySelector('.rt-n').textContent + ':' + r.children[1].textContent).join(' | ')`);
  check('host results table has both players', /HOST/.test(hRows) && /GUEST/.test(hRows), hRows);
  check('guest results table has both players', /HOST/.test(gRows) && /GUEST/.test(gRows), gRows);
  check('MVP is highlighted', await host.ev(`return !!document.querySelector('.rt-r.mvp .rt-mvp')`));
  await shot(host, 'captures/mpflow_host_results.png');
  await shot(guest, 'captures/mpflow_guest_results.png');

  // ---------------------------------------------------------------- back to the lobby and a second match
  await click(host, '.rs-btns [data-act=lobby]');
  check('host back in the lobby (meta lobby)', await waitFor(host, `__app.state === 'lobby' && __app.room.meta.state === 'lobby' && !__cf.game?.player`, 5000));
  await click(guest, '.rs-btns [data-act=lobby]');
  check('guest back in the lobby', await waitFor(guest, `__app.state === 'lobby'`, 5000));
  await click(host, '.lb-act [data-act=start]');
  check('second match: host in game', await waitFor(host, `__app.state === 'game' && __cf.game?.match?.state === 'warmup' && __app.matchInfo.n === 2`, 60000));
  check('second match: guest in game', await waitFor(guest, `__app.state === 'game' && !!__cf.game?.match && __app.matchInfo.n === 2`, 60000));
  check('second match: remotes rebuilt', await waitFor(guest, `__cf.game.net && __cf.game.net.remotes.size === 1`, 15000) && await waitFor(host, `__cf.game.net && __cf.game.net.remotes.size === 1`, 15000));

  // ---------------------------------------------------------------- host leaves mid-game
  await host.ev(`__app.pause(); return 1`);
  await click(host, '.pause [data-act=quit]');
  await waitFor(host, `document.querySelector('.fe-dlg .fe-btn.danger')`, 3000);
  await click(host, '.fe-dlg .fe-btn.danger');
  check('host left to the multiplayer screen', await waitFor(host, `__app.state === 'mp' && !__app.room && !__cf.game?.player`, 5000));
  check('guest is told the host left', await waitFor(guest, `__app.state === 'mp' && !__app.room && /房主已離開/.test(document.querySelector('.fe-dlg')?.textContent || '')`, 20000));
  await shot(guest, 'captures/mpflow_guest_hostleft.png');

  const errs = [...host.logs, ...guest.logs].filter((l) => /^EXC|^error/.test(l) && !/audio|favicon|404|Failed to load resource/i.test(l));
  check('no page exceptions', errs.length === 0, errs.slice(0, 4).join(' || '));
} catch (e) {
  if (!String(e.message).startsWith('quick')) check('flow aborted', false, e.message);
}
report();
process.exit(results.every((r) => r.ok) ? 0 : 1);
