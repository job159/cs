// Evaluate JavaScript inside the app's Android WebView (debuggable APK) via Chrome DevTools Protocol.
//   adb forward tcp:9229 localabstract:webview_devtools_remote_<pid>
//   node tools/cdp.mjs "document.title"            (expression; await allowed)
//   node tools/cdp.mjs --file script.js
import fs from 'node:fs';

const port = process.env.CDP_PORT || 9229;
const arg = process.argv[2] === '--file' ? fs.readFileSync(process.argv[3], 'utf8') : process.argv.slice(2).join(' ');
const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = list.find((p) => p.type === 'page') || list[0];
if (!page) { console.error('no page'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const res = await send('Runtime.evaluate', { expression: `(async () => { ${arg.includes('return') ? arg : 'return (' + arg + ')'} })()`, awaitPromise: true, returnByValue: true, timeout: 60000 });
if (res.result && res.result.exceptionDetails) console.log('EXCEPTION', JSON.stringify(res.result.exceptionDetails.exception || res.result.exceptionDetails).slice(0, 800));
else console.log(typeof res.result.result.value === 'string' ? res.result.result.value : JSON.stringify(res.result.result.value));
ws.close();
process.exit(0);
