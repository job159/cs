#!/usr/bin/env node
// Inspect sources and outputs (for producer authors — you cannot listen, so look at numbers + spectrograms).
//
//   node tools/audio/inspect.mjs find --pack ffsl --tags ak47            # query the inventory (also: --any a,b --text re --min-dur/--max-dur)
//   node tools/audio/inspect.mjs <inventory-id | file path> [--start 1.2 --end 2.0 | --event 3] [--png] [--events]
//        prints measure() (LUFS, true peak, crest, DC, band balance...), detected events/onsets, and with --png writes a
//        spectrogram to tools/audio/out/inspect/<name>.png (view it with your image reader)
//   node tools/audio/inspect.mjs game/assets/audio/manifest.weapons.json       # measure every file of a manifest
import fs from 'node:fs';
import path from 'node:path';
import { Sources } from './lib/sources.mjs';
import { readAudio } from './lib/io.mjs';
import { measure, formatMeasure, spectrogram } from './lib/analysis.mjs';
import { detectOnsets, splitOnSilence } from './lib/edit.mjs';
import { OUT, ROOT } from './lib/paths.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d; };
const flag = (n) => argv.includes(`--${n}`);
const target = argv[0];
if (!target) { console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 9).join('\n')); process.exit(64); }

const src = Sources.load();

if (target === 'find') {
  const q = {};
  if (opt('pack')) q.pack = opt('pack');
  if (opt('tags')) q.tags = opt('tags').split(',');
  if (opt('any')) q.anyTags = opt('any').split(',');
  if (opt('text')) q.text = new RegExp(opt('text'), 'i');
  if (opt('min-dur')) q.minDur = +opt('min-dur');
  if (opt('max-dur')) q.maxDur = +opt('max-dur');
  const rows = src.find(q);
  for (const f of rows) {
    const a = f.analysis || {};
    console.log(`${f.id.padEnd(58).slice(0, 58)} ${String(f.duration?.toFixed(2)).padStart(7)}s ${f.channels}ch ${String(f.sampleRate).padStart(6)}  ${String(a.lufs ?? '-').padStart(6)} LUFS  ev ${String(a.eventCount ?? '-').padStart(3)}  ${(f.title || '').slice(0, 50)}  [${f.tags.slice(0, 8).join(',')}]`);
  }
  console.log(`${rows.length} match(es)`);
  process.exit(0);
}

async function one(label, buf) {
  const m = measure(buf);
  console.log(`${label}\n  ${formatMeasure(m)}`);
  console.log(`  peak ${m.peakDb} dBFS  TP ${m.truePeakDb} dBTP  rms ${m.rmsDb}  LRA ${m.lra}  head ${m.headMs} ms  tail ${m.tailMs} ms  attack ${m.attackMs} ms  stereoCorr ${m.stereoCorr}  clipped ${m.clipped}`);
  if (m.bandsDb) console.log(`  bands dB: ${Object.entries(m.bandsDb).map(([k, v]) => `${k} ${v}`).join('  ')}`);
  if (flag('events')) {
    const ev = splitOnSilence(buf, { threshDb: -42, minSilence: 0.1 });
    console.log(`  events (${ev.length}): ${ev.slice(0, 60).map((e) => `${e.start.toFixed(3)}-${e.end.toFixed(3)}`).join(' ')}`);
    const on = detectOnsets(buf);
    console.log(`  onsets (${on.length}): ${on.slice(0, 80).map((t) => t.toFixed(3)).join(' ')}`);
  }
  if (flag('png')) {
    const f = path.join(OUT, 'inspect', label.replace(/[^a-zA-Z0-9_.-]+/g, '_').slice(-80) + '.png');
    spectrogram(buf, f, { title: label, measure: m });
    console.log(`  spectrogram: ${path.relative(ROOT, f)}`);
  }
}

if (/manifest\.[a-z0-9_]+\.json$/.test(target)) {
  const man = JSON.parse(fs.readFileSync(path.resolve(target), 'utf8'));
  const base = path.dirname(path.resolve(target)); // files are relative to the folder holding the manifest
  for (const [name, d] of Object.entries(man.sounds)) {
    console.log(`== ${name}  vol ${d.vol} pitch ${d.pitch} voices ${d.voices} bus ${d.bus} spatial ${d.spatial} range ${d.range} loop ${d.loop}`);
    for (const f of d.files) await one(f, await readAudio(path.join(base, f)));
  }
  process.exit(0);
}

let buf, label;
const range = { start: opt('start') !== undefined ? +opt('start') : undefined, end: opt('end') !== undefined ? +opt('end') : undefined };
if (src.has(target)) {
  const e = src.get(target);
  console.log(`${e.id}: ${e.title}  by ${e.author} (${e.licence})  ${e.url}\n  tags: ${e.tags.join(', ')}`);
  buf = await src.load(target, opt('event') !== undefined ? { event: +opt('event') } : range);
  label = target + (opt('event') !== undefined ? `#ev${opt('event')}` : range.start !== undefined ? `@${range.start}-${range.end ?? ''}` : '');
} else if (fs.existsSync(target)) {
  buf = await readAudio(target, { start: range.start ?? 0, end: range.end ?? Infinity });
  label = path.basename(target);
} else { console.error(`not an inventory id or file: ${target}`); process.exit(66); }
await one(label, buf);
