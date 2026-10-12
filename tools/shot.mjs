// Headless Edge/Chrome driver for visual QA (real GPU via ANGLE/D3D11).
//   node tools/shot.mjs <url> [--w 1280 --h 720] [--wait 3000] [--eval file.js] [--out shot.png]
//                         [--shots N --every ms] [--timeout ms] [--keep --port N] (--keep leaves the browser running)
// The page may expose window.__shotReady (bool) to signal when to start capturing.
// --eval runs a script (await allowed, `return` value printed) after the page is ready.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const flag = (name) => args.includes('--' + name);
const url = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--')));
const W = +opt('w', 1280), H = +opt('h', 720);
const out = opt('out', 'captures/shot.png');
const shots = +opt('shots', 1), every = +opt('every', 500);
// Each run gets its own browser (port + profile) unless --port is given, so parallel agents never collide.
const port = +opt('port', 0) || 9400 + Math.floor(Math.random() * 500);

const browsers = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];
const exe = browsers.find((p) => fs.existsSync(p));

async function getJson(u) { const r = await fetch(u); return r.json(); }
async function alive() { try { await getJson(`http://127.0.0.1:${port}/json/version`); return true; } catch { return false; } }

// Whatever happens (exception, timeout, Ctrl+C), the browser this run started is killed with its whole
// process tree: orphaned headless browsers pile up fast when many agents take screenshots in parallel.
let child = null;
function killBrowser() {
  if (!child || flag('keep')) return;
  try { execFileSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' }); } catch { /* already gone */ }
  child = null;
}
process.on('exit', killBrowser);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { killBrowser(); process.exit(1); });
process.on('uncaughtException', (e) => { console.error('shot failed:', e.message); killBrowser(); process.exit(1); });
process.on('unhandledRejection', (e) => { console.error('shot failed:', e?.message || e); killBrowser(); process.exit(1); });
const hardTimeout = setTimeout(() => { console.error('shot: hard timeout'); killBrowser(); releaseLock(); process.exit(2); }, +opt('timeout', 150000) + 600000);
hardTimeout.unref?.();

// System-wide semaphore: at most MAX_BROWSERS headless browsers at once (many agents share this
// machine; unbounded browsers exhausted the RAM once). Stale locks (> 4 min) are reclaimed.
const MAX_BROWSERS = +(process.env.SHOT_MAX || 2);
const lockDir = path.join(os.tmpdir(), 'cf-shot-locks');
fs.mkdirSync(lockDir, { recursive: true });
let lockFile = null;
function releaseLock() { if (lockFile) { try { fs.unlinkSync(lockFile); } catch { /* gone */ } lockFile = null; } }
process.on('exit', releaseLock);
if (!flag('keep')) {
  const waitStart = Date.now();
  while (!lockFile) {
    for (let k = 0; k < MAX_BROWSERS && !lockFile; k++) {
      const f = path.join(lockDir, `slot${k}.lock`);
      try {
        const st = fs.statSync(f);
        if (Date.now() - st.mtimeMs > 240000) fs.unlinkSync(f);
      } catch { /* free */ }
      try { fs.writeFileSync(f, String(process.pid), { flag: 'wx' }); lockFile = f; } catch { /* taken */ }
    }
    if (!lockFile) {
      if (Date.now() - waitStart > 600000) { console.error('shot: no free browser slot after 10 min'); process.exit(3); }
      await new Promise((r) => setTimeout(r, 500 + Math.random() * 500));
    }
  }
}

if (!(await alive())) {
  const profile = path.join(os.tmpdir(), 'cf-shot-' + port);
  child = spawn(exe, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl',
    '--autoplay-policy=no-user-gesture-required', '--no-first-run', '--mute-audio',
    '--disable-extensions', '--disable-background-networking', '--disable-component-update', '--renderer-process-limit=2',
    `--window-size=${W},${H}`, 'about:blank',
  ], { detached: false, stdio: 'ignore' });
  for (let i = 0; i < 150 && !(await alive()); i++) await new Promise((r) => setTimeout(r, 200));
}

const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0;
const pending = new Map();
const logs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  else if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.type + ': ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  else if (m.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => {
  const res = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: 120000 });
  if (res.result?.exceptionDetails) return 'EXCEPTION ' + (res.result.exceptionDetails.exception?.description || res.result.exceptionDetails.text);
  return res.result?.result?.value;
};

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: +opt('dpr', 1), mobile: false });
await send('Page.navigate', { url });
const t0 = Date.now();
const wait = +opt('wait', 2000);
while (Date.now() - t0 < 60000) {
  await new Promise((r) => setTimeout(r, 200));
  const ready = await evaluate('document.readyState === "complete" && (window.__shotReady === undefined || window.__shotReady === true)');
  if (ready === true) break;
}
await new Promise((r) => setTimeout(r, wait));
const evalFile = opt('eval');
if (evalFile) {
  const code = fs.readFileSync(evalFile, 'utf8');
  const v = await evaluate(`(async () => { ${code} })()`);
  console.log('eval ->', typeof v === 'string' ? v : JSON.stringify(v));
}
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
for (let i = 0; i < shots; i++) {
  if (i) await new Promise((r) => setTimeout(r, every));
  const r = await send('Page.captureScreenshot', { format: out.endsWith('.jpg') ? 'jpeg' : 'png', quality: 90 });
  const file = shots > 1 ? out.replace(/(\.\w+)$/, `_${i}$1`) : out;
  fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
  console.log('saved', file);
}
if (logs.length) console.log('--- console ---\n' + logs.slice(-40).join('\n'));
await send('Target.closeTarget', { targetId: target.id }).catch(() => {});
ws.close();
killBrowser();
process.exit(0);
