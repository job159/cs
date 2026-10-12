// Production web build: bundles game/src into dist/www (static, relative paths only).
import * as esbuild from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'game');
const out = path.join(root, 'dist', 'www');
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));

await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });

const result = await esbuild.build({
  entryPoints: [path.join(src, 'src', 'main.js')],
  bundle: true,
  format: 'iife',
  target: ['chrome87', 'safari15', 'firefox90'],
  minify: true,
  legalComments: 'none',
  define: { __DEV__: 'false', __VERSION__: JSON.stringify(pkg.version) },
  outfile: path.join(out, 'game.js'),
  metafile: true,
});

const css = await fs.readFile(path.join(src, 'style.css'), 'utf8');
const cssMin = await esbuild.transform(css, { loader: 'css', minify: true, target: ['chrome87', 'safari15'] });
await fs.writeFile(path.join(out, 'style.css'), cssMin.code);
await fs.copyFile(path.join(src, 'index.html'), path.join(out, 'index.html'));

// game assets (models, audio, textures, map packages). Test / scratch files are skipped.
const SKIP = /(^|[\/])(_test|test_|_kittest)|\.(md|log)$/i;
let assetBytes = 0, assetFiles = 0;
async function copyDir(from, to) {
  let entries;
  try { entries = await fs.readdir(from, { withFileTypes: true }); } catch { return; }
  await fs.mkdir(to, { recursive: true });
  for (const e of entries) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (SKIP.test(e.name)) continue;
    if (e.isDirectory()) await copyDir(a, b);
    else { await fs.copyFile(a, b); assetBytes += (await fs.stat(a)).size; assetFiles++; }
  }
}
await copyDir(path.join(src, 'assets'), path.join(out, 'assets'));
console.log(`assets -> ${assetFiles} files, ${(assetBytes / 1048576).toFixed(1)} MB`);

const bytes = Object.values(result.metafile.outputs).reduce((s, o) => s + o.bytes, 0);
console.log(`web build -> ${path.relative(root, out)}  (game.js ${(bytes / 1024).toFixed(0)} KB, v${pkg.version})`);
