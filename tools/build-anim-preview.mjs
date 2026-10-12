// Bundles the zombie animation film-strip preview: game/src/tools/anim-preview.js -> game/anim-preview.js
//   node tools/build-anim-preview.mjs   then open http://127.0.0.1:5190/anim-preview.html?clips=walk_a&n=8
import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await esbuild.build({
  entryPoints: [path.join(root, 'game', 'src', 'tools', 'anim-preview.js')],
  bundle: true,
  format: 'iife',
  target: ['chrome87'],
  outfile: path.join(root, 'game', 'anim-preview.js'),
  logLevel: 'warning',
});
console.log('built game/anim-preview.js');
