#!/usr/bin/env node
// Runs ONE producer in its own process (build.mjs spawns this per producer so memory is released between them).
//   node --max-old-space-size=1536 tools/audio/run-producer.mjs tools/audio/producers/weapons.mjs [--spectrograms first|all|none] [--no-cache]
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as lib from './lib/index.mjs';
import { createContext } from './lib/producer.mjs';
import { freeDecoders } from './lib/io.mjs';

const argv = process.argv.slice(2);
const file = argv.find((a) => !a.startsWith('--'));
if (!file) { console.error('usage: run-producer.mjs <producer.mjs> [--spectrograms first|all|none] [--no-cache]'); process.exit(64); }
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d; };
const name = path.basename(file, '.mjs');

const t0 = Date.now();
const mod = await import(pathToFileURL(path.resolve(file)).href);
if (typeof mod.produce !== 'function') { console.error(`${file}: must export async function produce(lib, ctx)`); process.exit(65); }
const ctx = createContext({ name, options: { spectrograms: opt('spectrograms', 'first'), noCache: argv.includes('--no-cache') } });
console.log(`[${name}] producing...`);
await mod.produce(lib, ctx);
for (const c of ctx.categories) if (!c.done) await c.write(); // flush categories the producer forgot to write
freeDecoders();
const mem = process.memoryUsage();
console.log(`[${name}] done in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${ctx.categories.length} categories, ${ctx.issueCount} files with QA issues, peak rss ~${(mem.rss / 1e6).toFixed(0)} MB`);
if (argv.includes('--strict') && ctx.issueCount) process.exit(2);
