// Bundles the network test page: game/src/net/test-entry.js -> game/net-test.js
// (the dev server serves game/, so the page is http://127.0.0.1:5190/net-test.html).
//   node tools/build-net-test.mjs
import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function buildNetTest() {
  await esbuild.build({
    entryPoints: [path.join(root, 'game', 'src', 'net', 'test-entry.js')],
    bundle: true,
    format: 'iife',
    target: ['chrome87', 'safari15'],
    sourcemap: 'inline',
    outfile: path.join(root, 'game', 'net-test.js'),
    logLevel: 'warning',
  });
  return path.join(root, 'game', 'net-test.js');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('built', path.relative(root, await buildNetTest()));
}
