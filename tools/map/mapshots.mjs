// Multi-view screenshots of a map in the running game (one headless browser, several camera views).
//   node tools/map/mapshots.mjs <mapId> [--views views.json] [--out captures/map/<map>] [--q high] [--w 1280 --h 720]
// views.json: [{ "name": "corner", "pos": [x, y, z], "yaw": 0.5, "pitch": 0.05, "hideVm": true }, ...]
// Without --views it shoots the map's player spawns and spawners. Uses the dev server (http://127.0.0.1:5190)
// and the same system-wide browser slots as tools/shot.mjs (SHOT_MAX, default 3).
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const map = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--')));
const W = +opt('w', 1280), H = +opt('h', 720);
const outDir = opt('out', `captures/map/${map}`);
const q = opt('q', 'high');
const base = opt('url', 'http://127.0.0.1:5190/');
const port = 9400 + Math.floor(Math.random() * 500);
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));

let views = opt('views') ? JSON.parse(fs.readFileSync(opt('views'), 'utf8')) : null;

// ---- system-wide browser slot (same lock files as tools/shot.mjs)
const lockDir = path.join(os.tmpdir(), 'cf-shot-locks');
fs.mkdirSync(lockDir, { recursive: true });
let lockFile = null, child = null;
const MAX = +(process.env.SHOT_MAX || 3);
function cleanup() {
  if (child) { try { execFileSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' }); } catch { /* gone */ } child = null; }
  if (lockFile) { try { fs.unlinkSync(lockFile); } catch { /* gone */ } lockFile = null; }
}
process.on('exit', cleanup);
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { cleanup(); process.exit(1); });
const t0 = Date.now();
while (!lockFile) {
  for (let k = 0; k < MAX && !lockFile; k++) {
    const f = path.join(lockDir, `slot${k}.lock`);
    try { if (Date.now() - fs.statSync(f).mtimeMs > 240000) fs.unlinkSync(f); } catch { /* free */ }
    try { fs.writeFileSync(f, String(process.pid), { flag: 'wx' }); lockFile = f; } catch { /* taken */ }
  }
  if (!lockFile) { if (Date.now() - t0 > 600000) { console.error('no browser slot'); process.exit(3); } await new Promise((r) => setTimeout(r, 700)); }
}
const hard = setTimeout(() => { console.error('hard timeout'); cleanup(); process.exit(2); }, 600000);
hard.unref();

child = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(os.tmpdir(), 'cf-mapshot-' + port)}`,
  '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--no-first-run', '--mute-audio',
  '--disable-extensions', '--disable-background-networking', '--disable-component-update', `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });
const alive = async () => { try { await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); return true; } catch { return false; } };
for (let i = 0; i < 150 && !(await alive()); i++) await new Promise((r) => setTimeout(r, 200));
const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0;
const pending = new Map(), logs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  else if (m.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  else if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error')) logs.push('error: ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: 120000 });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `${base}?map=${map}&match=0&q=${q}` });
const tl = Date.now();
while (Date.now() - tl < 120000) {
  await new Promise((r) => setTimeout(r, 300));
  if (await ev('document.readyState === "complete" && window.__shotReady === true && !!(window.__cf && window.__cf.game && window.__cf.game.player)').catch(() => false)) break;
}
await new Promise((r) => setTimeout(r, 1500));
const info = await ev(`(() => { __cf.stop(); const g = __cf.game; const d = g.world.def || {};
  return { spawns: d.playerSpawns, spawners: (d.spawners || []).map((s) => [s.pos, s.facing]), stats: d.stats }; })()`);
if (!views) {
  views = [];
  (info.spawns || []).slice(0, 2).forEach((p, i) => views.push({ name: `spawn${i}`, pos: [p.x ?? p[0], p.y ?? p[1], p.z ?? p[2]], yaw: (p[3] ?? 0), pitch: 0.05 }));
  (info.spawners || []).slice(0, 4).forEach(([p, f], i) => views.push({ name: `spawner${i}`, pos: p, yaw: f, pitch: 0.05 }));
}
fs.mkdirSync(outDir, { recursive: true });
for (const v of views) {
  const r = await ev(`(() => { const g = __cf.game; g.player.pos.set(${v.pos.join(',')}); g.player.yaw = ${v.yaw}; g.player.pitch = ${v.pitch ?? 0};
    if (g.vm) g.vm.visible = ${v.hideVm === false ? 'true' : 'false'};
    if (g.hud && g.hud.root) g.hud.root.style.display = 'none';
    document.querySelectorAll('#hud, .fe-lockhint, #fe').forEach((e) => { e.style.display = 'none'; });
    for (let i = 0; i < 4; i++) g.frame(1 / 60);
    if (g.vm) g.vm.visible = ${v.hideVm === false ? 'true' : 'false'};
    g.player.pos.set(${v.pos.join(',')}); g.player.yaw = ${v.yaw}; g.player.pitch = ${v.pitch ?? 0};
    g.frame(1 / 60); if (g.vm) g.vm.visible = ${v.hideVm === false ? 'true' : 'false'}; g.render();
    const i = g.renderer.gl.info.render; return { calls: i.calls, tris: i.triangles }; })()`);
  await new Promise((res) => setTimeout(res, 120));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const file = path.join(outDir, `${v.name}.png`);
  fs.writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
  console.log(`saved ${file}  (${r.calls} draw calls, ${(r.tris / 1000).toFixed(0)}k tris incl. shadow pass)`);
}
if (logs.length) console.log('--- console ---\n' + logs.slice(-20).join('\n'));
console.log('stats', JSON.stringify(info.stats));
ws.close();
cleanup();
process.exit(0);
