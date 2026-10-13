// End-to-end multiplayer smoke test: one headless Edge, host tab (?host=1) + guest tab (?join=<code>)
// over the real public brokers. Verifies zombie replication, remote players and client hit -> host kill.
//   node tools/mp-test.mjs [--relay]
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = 'http://127.0.0.1:5190/';
const port = 9600 + Math.floor(Math.random() * 300);
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const lockDir = path.join(os.tmpdir(), 'cf-shot-locks');
fs.mkdirSync(lockDir, { recursive: true });
let lock = null;
while (!lock) {
  for (let k = 0; k < 2 && !lock; k++) { const f = path.join(lockDir, `slot${k}.lock`); try { fs.writeFileSync(f, String(process.pid), { flag: 'wx' }); lock = f; } catch { /* busy */ } }
  if (!lock) await new Promise((r) => setTimeout(r, 1000));
}
const child = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(os.tmpdir(), 'cf-mp-' + port)}`,
  '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', '--no-first-run', '--disable-extensions',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { execFileSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' }); } catch { /* gone */ } try { fs.unlinkSync(lock); } catch { /* gone */ } };
process.on('exit', cleanup);
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 600000).unref();   // loads are slow while other agents share the machine

const json = async (u, o) => (await fetch(u, o)).json();
for (let i = 0; i < 100; i++) { try { await json(`http://127.0.0.1:${port}/json/version`); break; } catch { await new Promise((r) => setTimeout(r, 200)); } }

// every tab gets its own (visible) window: background tabs pause requestAnimationFrame
const ver = await json(`http://127.0.0.1:${port}/json/version`);
const bws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((r) => { bws.onopen = r; });
let bid = 0; const bpend = new Map();
bws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && bpend.has(m.id)) { bpend.get(m.id)(m); bpend.delete(m.id); } };
const bsend = (method, params = {}) => new Promise((r) => { const i = ++bid; bpend.set(i, r); bws.send(JSON.stringify({ id: i, method, params })); });
async function tab(url) {
  const created = await bsend('Target.createTarget', { url: 'about:blank', newWindow: true });
  const list = await json(`http://127.0.0.1:${port}/json/list`);
  const t = list.find((x) => x.id === created.result.targetId);
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0; const pend = new Map(); const logs = [];
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } else if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.args.map((a) => a.value ?? a.description).join(' ')); else if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (m.params.exceptionDetails.exception?.description || '')); };
  ws.onclose = () => { for (const r of pend.values()) r({ result: { exceptionDetails: { exception: { description: 'tab closed' } } } }); pend.clear(); };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); if (ws.readyState !== 1) return r({ result: { exceptionDetails: { exception: { description: 'tab closed' } } } }); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result?.exceptionDetails ? 'EXC ' + r.result.exceptionDetails.exception?.description : r.result?.result?.value; };
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 640, height: 360, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  return { ev, logs, send };
}
const waitFor = async (t, expr, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await t.ev(expr); if (v && !String(v).startsWith('EXC')) return v; await new Promise((r) => setTimeout(r, 500)); } return null; };

const relay = process.argv.includes('--relay');
const host = await tab(BASE + '?w=akm&host=1&name=HOST&q=low');
const code = await waitFor(host, 'window.__room && window.__room.code', 200000);
console.log('room code', code);
if (!code) { console.log(host.logs.slice(-20).join('\n')); process.exit(1); }
const guest = await tab(BASE + `?w=akm&join=${code}&name=GUEST&q=low${relay ? '&relay=1' : ''}`);
const joined = await waitFor(guest, 'window.__room && window.__room.code', 200000);
console.log('guest joined', joined);
// --skill [weaponId]: a premium skill cast on one client replays on the other (NetSync 'sk' event, specials v2).
// Without an id a mock mythic (nova tap + summon ult) is registered on both tabs.
const si = process.argv.indexOf('--skill');
async function skillCheck() {
  const arg = process.argv[si + 1];
  const wid = arg && !arg.startsWith('--') ? arg : 'mock_px';
  const MOCK = `(() => { const D = __cf.game.debug; if (!D.WEAPONS.mock_px) D.registerWeapon({ ...D.WEAPONS.m4, id: 'mock_px', model: 'm4', zh: '試作．天降', en: 'Prototype Skyfall', tier: 'mythic', element: ['radiant'], price: 0,
    premium: { killMark: 'km_generic' }, special: { type: 'mock_px', meters: { tide: { max: 100, onHit: 3 }, ult: { max: 100, source: 'damage', per: 1500 } }, skills: { tap: { id: 'nova', cost: 30, zh: '震爆' }, ult: { id: 'summon', zh: '天降' } } } }); return 'ok'; })()`;
  for (const t of [host, guest]) await waitFor(t, 'window.__cf?.game?.arsenal?.current ? 1 : 0', 120000), await t.ev(MOCK);
  // give the weapon, fill every meter, cast `slot` straight through the engine (same path as the ★ button)
  const cast = (t, slot) => t.ev(`(async () => { for (let i = 0; i < 600 && !window.__cf?.game?.arsenal?.current; i++) await new Promise((r) => setTimeout(r, 200));
    const g = __cf.game, SP = g.debug.specials; const ws = g.arsenal.give('${wid}');
    for (let i = 0; i < 150 && g.arsenal.state !== 'idle'; i++) await new Promise((r) => setTimeout(r, 100));
    for (const k of Object.keys(ws.sp?.m || {})) SP.meterAdd(ws, k, 1e9);
    const z = g.zombies.list.find((z) => z.alive); if (z) { const e = g.camera.position, p = z.center(); g.player.yaw = Math.atan2(-(p.x - e.x), -(p.z - e.z)); g.player.pitch = 0.15; }
    await new Promise((r) => setTimeout(r, 100));
    // v1 series specials (雙相 overphase...) send their replay event from onSpecial: record it to compare
    let sent = null, k = null; const ss = g.net.sendSkill.bind(g.net); g.net.sendSkill = (e) => { sent = e; return ss(e); };
    if (ws.sp?.v2) k = SP.castSkill(ws, '${slot}'); else { ws.sp.charge = ws.def.special.hits ?? 0; SP.specialOf(ws).onSpecial(ws, g); }
    g.net.sendSkill = ss;
    return JSON.stringify({ by: g.localId, id: k?.id ?? sent?.id, slot: k?.slot ?? sent?.slot, seed: k?.ev.seed ?? sent?.seed, level: k?.level }); })()`);
  const seen = (t) => t.ev(`JSON.stringify((__cf.game._skills?.list || []).filter((k) => !k.local).map((k) => ({ key: k.key, id: k.id, slot: k.slot, level: k.level, t: +k.t.toFixed(2) })))`);
  const pj = (v, d) => { try { return JSON.parse(v); } catch { console.log('  !', v); return d; } };
  const gc = pj(await cast(guest, 'ult'), {});
  console.log('guest cast', JSON.stringify(gc));
  await new Promise((r) => setTimeout(r, 1200));
  const onHost = pj(await seen(host), []);
  console.log('host replays', JSON.stringify(onHost));
  const hc = pj(await cast(host, 'tap'), {});
  console.log('host cast', JSON.stringify(hc));
  await new Promise((r) => setTimeout(r, 900));
  const onGuest = pj(await seen(guest), []);
  console.log('guest replays', JSON.stringify(onGuest));
  const okG = onHost.some((k) => k.key === `${gc.by}:${gc.seed}` && k.id === gc.id);
  const okH = onGuest.some((k) => k.key === `${hc.by}:${hc.seed}` && k.id === hc.id);
  console.log(okG && okH ? 'SKILL MIRROR OK' : `SKILL MIRROR FAILED (guest->host ${okG}, host->guest ${okH})`);
}
// run first: two full games are heavy and the machine is shared (old headless browsers get reaped)
if (si > 0) await skillCheck();
// let the host's warmup end and zombies spawn
await new Promise((r) => setTimeout(r, 14000));
const hs = await host.ev(`JSON.stringify({ state: __cf.game.match.state, round: __cf.game.match.round, zombies: __cf.game.zombies.list.length, remotes: __cf.game.net.remotes.size, peers: [...__room.peers.values()].map(p => p.transport + ':' + p.rtt) })`);
const gs = await guest.ev(`JSON.stringify({ state: __cf.game.match.state, round: __cf.game.match.round, zombies: __cf.game.zombies.list.length, puppets: __cf.game.zombies.list.filter(z => z.puppet).length, remotes: __cf.game.net.remotes.size })`);
console.log('host ', hs);
console.log('guest', gs);
// guest kills one zombie with direct hits through the real hit path
const kill = await guest.ev(`(async () => { const g = __cf.game; const z = g.zombies.list.find(z => z.alive); if (!z) return 'no zombie'; const id = z.id;
  for (let i = 0; i < 12 && z.alive; i++) z.damage({ amount: 40, part: 'chest', box: 'chest', dir: { x: 0, y: 0, z: 1 }, point: z.center(), knock: 1, stagger: 0.2, weapon: 'akm', shooter: g.localId });
  await new Promise(r => setTimeout(r, 3000)); return JSON.stringify({ id, money: g.match.money, kills: g.match.stats.kills }); })()`);
console.log('guest kill', kill);
const hk = await host.ev(`(() => { const ids = [...__cf.game.zombies.byId.keys()]; return JSON.stringify({ alive: __cf.game.zombies.alive, ids: ids.length }); })()`);
console.log('host after', hk);
console.log('--- host log ---\n' + host.logs.slice(-8).join('\n'));
console.log('--- guest log ---\n' + guest.logs.slice(-8).join('\n'));
process.exit(0);
