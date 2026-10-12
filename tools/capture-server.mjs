// Dev helper: receives canvas captures from the browser (POST /save?name=foo, body = data URL or raw image)
// and writes them to disk, so animation film strips can be inspected at full resolution.
//   node tools/capture-server.mjs [outDir]   (port 5181)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const out = path.resolve(process.argv[2] || 'captures');
fs.mkdirSync(out, { recursive: true });
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.end(); return; }
  const url = new URL(req.url, 'http://x');
  if (req.method !== 'POST' || url.pathname !== '/save') { res.statusCode = 404; res.end(); return; }
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    let buf = Buffer.concat(chunks);
    const text = buf.subarray(0, 40).toString();
    let ext = 'jpg';
    if (text.startsWith('data:')) {
      const s = buf.toString();
      ext = s.startsWith('data:image/png') ? 'png' : 'jpg';
      buf = Buffer.from(s.slice(s.indexOf(',') + 1), 'base64');
    }
    const name = (url.searchParams.get('name') || 'capture').replace(/[^\w.-]/g, '_');
    const file = path.join(out, `${name}.${ext}`);
    fs.writeFileSync(file, buf);
    res.end(file);
    console.log('saved', file, buf.length);
  });
}).listen(5181, () => console.log('capture server on :5181 ->', out));
