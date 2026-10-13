#!/usr/bin/env node
// Audio build: runs every producer tools/audio/producers/*.mjs (each `export async function produce(lib, ctx)` writes
// its own category files + manifest), one child process at a time (bounded memory), then validates every manifest,
// writes game/assets/audio/index.json, reports contract coverage (names the game plays) and refreshes the audio
// section of docs/CREDITS.md.
//
//   node --max-old-space-size=1536 tools/audio/build.mjs                    # all producers (files starting with '_' are skipped)
//   node tools/audio/build.mjs --only weapons,ui                           # just these producers
//   node tools/audio/build.mjs --only _example --out tools/audio/out/example-assets   # dry run into another folder
//   node tools/audio/build.mjs --check                                     # no producers: validate + coverage only
//   node tools/audio/build.mjs --clean <category>                          # delete a category's files + manifest
//   flags: --spectrograms first|all|none (default first), --strict (exit 1 on QA issues / missing names), --no-cache
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d; };
const flag = (n) => argv.includes(`--${n}`);
if (opt('out')) process.env.CF_AUDIO_OUT = opt('out'); // must be set before paths.mjs is evaluated

const { AUDIO, AUDIO_IS_DEFAULT, PRODUCERS, PROVENANCE, ROOT, OUT, rel } = await import('./lib/paths.mjs');
const { writeIndex } = await import('./lib/producer.mjs');
const { coverage } = await import('./lib/contract.mjs');
const { updateCredits } = await import('./lib/credits.mjs');
const { probe } = await import('./lib/io.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const BUSES = new Set(['sfx', 'ui', 'music', 'amb', 'voice']);

// ---------------------------------------------------------------------------------------------- clean
if (opt('clean')) {
  const cat = opt('clean');
  if (!/^[a-z0-9_]+$/.test(cat)) { console.error('bad category'); process.exit(64); }
  fs.rmSync(path.join(AUDIO, cat), { recursive: true, force: true });
  fs.rmSync(path.join(AUDIO, `manifest.${cat}.json`), { force: true });
  if (AUDIO_IS_DEFAULT) fs.rmSync(path.join(PROVENANCE, `${cat}.json`), { force: true });
  fs.rmSync(path.join(OUT, cat), { recursive: true, force: true });
  writeIndex();
  if (AUDIO_IS_DEFAULT) updateCredits();
  console.log(`removed category '${cat}' from ${rel(AUDIO)}`);
  process.exit(0);
}

// ---------------------------------------------------------------------------------------------- run producers
let failed = 0, ran = 0;
if (!flag('check')) {
  const only = opt('only') ? new Set(opt('only').split(',')) : null;
  const all = fs.existsSync(PRODUCERS) ? fs.readdirSync(PRODUCERS).filter((f) => f.endsWith('.mjs')).sort() : [];
  const list = all.filter((f) => { const n = f.replace(/\.mjs$/, ''); return only ? only.has(n) : !n.startsWith('_'); });
  if (only) for (const n of only) if (!all.includes(`${n}.mjs`)) { console.error(`producer '${n}' not found in ${rel(PRODUCERS)}`); failed++; }
  if (!list.length) console.log(`no producers to run (${rel(PRODUCERS)}/*.mjs; names starting with '_' run only via --only)`);
  for (const f of list) {
    const t0 = Date.now();
    const args = ['--max-old-space-size=1536', path.join(here, 'run-producer.mjs'), path.join(PRODUCERS, f), '--spectrograms', opt('spectrograms', 'first')];
    if (flag('no-cache')) args.push('--no-cache');
    if (flag('strict')) args.push('--strict');
    const r = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env, cwd: ROOT });
    ran++;
    if (r.status !== 0) { failed++; console.error(`!! producer ${f} exited with ${r.status ?? r.signal}`); }
    else console.log(`-- ${f} ok (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
}

// ---------------------------------------------------------------------------------------------- validate manifests
fs.mkdirSync(AUDIO, { recursive: true });
const manifests = writeIndex();
const defined = new Map(); // name -> manifest
const errors = [], warnings = [];
let fileCount = 0, bytes = 0;
for (const mf of manifests) {
  let m;
  try { m = JSON.parse(fs.readFileSync(path.join(AUDIO, mf), 'utf8')); } catch (e) { errors.push(`${mf}: invalid JSON (${e.message})`); continue; }
  if (!m.sounds || typeof m.sounds !== 'object') { errors.push(`${mf}: missing "sounds"`); continue; }
  for (const [name, d] of Object.entries(m.sounds)) {
    const where = `${mf}:${name}`;
    if (defined.has(name)) errors.push(`${where}: also defined in ${defined.get(name)} (one owner per name)`);
    defined.set(name, mf);
    if (!Array.isArray(d.files) || !d.files.length) { errors.push(`${where}: no files`); continue; }
    if (!(d.vol >= 0 && d.vol <= 1.5)) errors.push(`${where}: vol ${d.vol} outside 0..1.5`);
    if (!Array.isArray(d.pitch) || d.pitch.length !== 2 || !(d.pitch[0] > 0) || d.pitch[0] > d.pitch[1]) errors.push(`${where}: bad pitch ${JSON.stringify(d.pitch)}`);
    if (!Number.isInteger(d.voices) || d.voices < 1) errors.push(`${where}: voices must be an integer >= 1`);
    if (!BUSES.has(d.bus)) errors.push(`${where}: bus '${d.bus}'`);
    if (typeof d.spatial !== 'boolean') errors.push(`${where}: spatial must be boolean`);
    if (!Array.isArray(d.range) || d.range.length !== 2 || !(d.range[0] > 0) || d.range[0] > d.range[1]) errors.push(`${where}: bad range ${JSON.stringify(d.range)}`);
    if (typeof d.loop !== 'boolean') errors.push(`${where}: loop must be boolean`);
    for (const f of d.files) {
      const abs = path.join(AUDIO, f);
      if (!/^[a-z0-9_]+\/[A-Za-z0-9_]+\.ogg$/.test(f)) errors.push(`${where}: file name '${f}' not <category>/<name>[_<n>].ogg`);
      if (!fs.existsSync(abs)) { errors.push(`${where}: missing file ${f}`); continue; }
      fileCount++; bytes += fs.statSync(abs).size;
      try {
        const p = await probe(abs);
        if (p.format !== 'ogg') errors.push(`${where}: ${f} is not Ogg Vorbis`);
        if (p.sampleRate !== 48000) errors.push(`${where}: ${f} is ${p.sampleRate} Hz (must be 48000)`);
        if (p.channels > 2) errors.push(`${where}: ${f} has ${p.channels} channels`);
        if (d.spatial && p.channels !== 1) warnings.push(`${where}: ${f} is stereo but spatial (should be mono)`);
      } catch (e) { errors.push(`${where}: ${f} unreadable (${e.message})`); }
    }
  }
}
// orphan files (on disk but in no manifest)
const listed = new Set();
for (const mf of manifests) { try { for (const d of Object.values(JSON.parse(fs.readFileSync(path.join(AUDIO, mf), 'utf8')).sounds || {})) for (const f of d.files || []) listed.add(f); } catch { /* reported above */ } }
for (const e of fs.readdirSync(AUDIO, { withFileTypes: true })) if (e.isDirectory()) for (const f of fs.readdirSync(path.join(AUDIO, e.name))) if (f.endsWith('.ogg') && !listed.has(`${e.name}/${f}`)) warnings.push(`orphan file ${e.name}/${f} (not in any manifest)`);

// ---------------------------------------------------------------------------------------------- coverage + credits
const cov = coverage(new Set(defined.keys()));
if (AUDIO_IS_DEFAULT) updateCredits();

console.log(`\n=== audio build: ${ran} producer(s) run, ${failed} failed; ${manifests.length} manifest(s), ${defined.size} sounds, ${fileCount} files, ${(bytes / 1048576).toFixed(2)} MB -> ${rel(AUDIO)}/index.json`);
for (const w of warnings) console.log(`  warn: ${w}`);
for (const e of errors) console.log(`  ERROR: ${e}`);
console.log(`contract: ${cov.required.length - cov.missing.length}/${cov.required.length} required names present` + (cov.optionalPresent.length ? `, optional present: ${cov.optionalPresent.join(' ')}` : ''));
if (cov.missing.length) {
  const groups = {};
  for (const n of cov.missing) { const g = n.split('_')[0]; (groups[g] ||= []).push(n); }
  console.log(`  missing (${cov.missing.length}):`);
  for (const [g, ns] of Object.entries(groups).sort()) console.log(`    ${g.padEnd(14)} ${ns.join(' ')}`);
}
if (cov.extra.length) console.log(`  defined but not referenced by game code: ${cov.extra.join(' ')}`);
const summary = { time: new Date().toISOString(), producersRun: ran, failed, manifests, sounds: defined.size, files: fileCount, bytes, errors, warnings, missing: cov.missing, extra: cov.extra };
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'build-summary.json'), JSON.stringify(summary, null, 2));
if (failed || errors.length || (flag('strict') && cov.missing.length)) process.exit(1);
