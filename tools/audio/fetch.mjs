#!/usr/bin/env node
// Downloads the CC0 audio sources listed in tools/audio/sources.mjs (+ tools/audio/sources.d/*.json) into
// tools/audio/src/ (gitignored), verifies each licence on its source page, extracts archives (7z via 7z-wasm, zip via
// fflate - pure WASM/JS), analyses every file ONE AT A TIME (duration, loudness, peaks, spectrum balance, onsets,
// events) and writes tools/audio/src/inventory.json + the audio section of docs/CREDITS.md.
//
//   node --max-old-space-size=1536 tools/audio/fetch.mjs                 # everything (idempotent, cached)
//   node tools/audio/fetch.mjs --only ffsl,kenney_impact,fs              # subset (pack ids, 'fs' = Freesound)
//   node tools/audio/fetch.mjs --search "bone crunch" [--sort downloads] [--pages 2] [--min-dur 0.2 --max-dur 5]
//   node tools/audio/fetch.mjs --add-fs 123,456 --to weapons --tags metal,impact   # verify + add + fetch
//   flags: --reverify (re-check licences), --reanalyze, --no-analysis
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { unzipSync } from 'fflate';
import { SRC, DL, INVENTORY, TOOL, rel } from './lib/paths.mjs';
import { PACKS, FREESOUND, REVIEWED } from './sources.mjs';
import { search, verifyCC0, politeFetch, UA } from './lib/freesound.mjs';
import { readAudio, probe, freeDecoders } from './lib/io.mjs';
import { measure } from './lib/analysis.mjs';
import { detectOnsets, splitOnSilence } from './lib/edit.mjs';
import { updateCredits } from './lib/credits.mjs';

// ---------------------------------------------------------------------------------------------- args
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d; };
const AUDIO_EXT = /\.(wav|ogg|oga|flac|mp3|aif|aiff)$/i;
const TODAY = new Date().toISOString().slice(0, 10);
const LICENCES = path.join(SRC, 'licences.json');
const SOURCES_D = path.join(TOOL, 'sources.d');
const SNAPSHOT = path.join(TOOL, 'licence-snapshot.json');

const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'x';

// ---------------------------------------------------------------------------------------------- search / add modes
if (opt('search')) {
  const q = opt('search'), pages = +opt('pages', 1);
  for (let p = 1; p <= pages; p++) {
    const r = await search(q, { page: p, sort: opt('sort', 'score'), minDur: opt('min-dur') && +opt('min-dur'), maxDur: opt('max-dur') && +opt('max-dur') });
    if (!r.length) break;
    for (const s of r) console.log(`${String(s.id).padEnd(8)} ${s.duration.toFixed(1).padStart(7)}s ${String(s.sampleRate).padStart(6)} ${String(s.downloads).padStart(7)}dl  ${s.user.padEnd(22).slice(0, 22)} ${s.title}`);
  }
  console.log('\n(CC0 filter applied by Freesound; fetch.mjs re-verifies each page before download)');
  process.exit(0);
}
if (opt('add-fs')) {
  const to = opt('to', 'extra').replace(/[^a-z0-9_-]/gi, '_');
  const tags = (opt('tags', '') || '').split(',').map((t) => t.trim()).filter(Boolean);
  const ids = opt('add-fs').split(',').map((x) => +x.trim()).filter(Boolean);
  fs.mkdirSync(SOURCES_D, { recursive: true });
  const f = path.join(SOURCES_D, `${to}.json`);
  const list = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : [];
  for (const id of ids) if (!list.some((e) => e.id === id)) list.push({ id, tags });
  fs.writeFileSync(f, JSON.stringify(list, null, 2) + '\n');
  console.log(`added ${ids.join(', ')} to ${rel(f)}`);
  if (!argv.includes('--only')) argv.push('--only', 'fs');
}

// ---------------------------------------------------------------------------------------------- helpers
const only = opt('only') ? new Set(opt('only').split(',')) : null;
const want = (id) => !only || only.has(id);
const licences = fs.existsSync(LICENCES) ? JSON.parse(fs.readFileSync(LICENCES, 'utf8')) : {};
const saveLicences = () => { fs.mkdirSync(SRC, { recursive: true }); fs.writeFileSync(LICENCES, JSON.stringify(licences, null, 2)); };
const fresh = (rec) => rec && rec.via !== 'snapshot' && !flag('reverify') && (Date.now() - Date.parse(rec.verified)) < 45 * 864e5;
const log = (...a) => console.log(...a);
const problems = [];

async function download(url, file, expectSize) {
  if (fs.existsSync(file) && (!expectSize || fs.statSync(file).size === expectSize)) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const part = file + '.part';
      await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(part));
      const size = fs.statSync(part).size;
      if (expectSize && size !== expectSize) throw new Error(`size ${size} != ${expectSize}`);
      fs.renameSync(part, file);
      return true;
    } catch (e) {
      if (attempt >= 3) throw new Error(`download ${url}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

let lastPage = 0;
async function getText(url) {
  for (let attempt = 1; ; attempt++) {
    const wait = 1500 - (Date.now() - lastPage); // be gentle with opengameart.org / kenney.nl
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastPage = Date.now();
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (attempt >= 2) throw e;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

/** Verify a pack's licence on its page. Returns the cached/new record or throws. */
async function verifyPack(p) {
  const key = `pack:${p.id}`;
  if (fresh(licences[key])) return licences[key];
  let html;
  try { html = await getText(p.page); } catch (e) {
    // page unreachable (site down / 5xx): fall back to the committed snapshot of an earlier successful check
    const snap = fs.existsSync(SNAPSHOT) ? JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'))[key] : null;
    if (!snap) throw e;
    log(`  ${p.id}: licence page unreachable (${e.message}); using recorded check from ${snap.verified} (${snap.shown})`);
    licences[key] = { ...snap, via: 'snapshot' }; saveLicences();
    return licences[key];
  }
  let shown;
  if (p.check === 'oga') {
    const names = [...html.matchAll(/class='license-name'>([^<]+)</g)].map((m) => m[1].trim());
    if (!names.includes('CC0')) throw new Error(`${p.id}: page licence is [${names.join(', ')}], not CC0`);
    shown = names.join(' / ');
  } else if (p.check === 'kenney') {
    if (!/Creative Commons CC0|CC0 licensed/i.test(html)) throw new Error(`${p.id}: CC0 not stated on page`);
    shown = 'Creative Commons CC0';
  } else throw new Error(`${p.id}: unknown licence check ${p.check}`);
  const rec = { licence: 'CC0-1.0', shown, page: p.page, verified: TODAY };
  if (p.urlFromPage) { const m = html.match(p.urlFromPage); if (!m) throw new Error(`${p.id}: download link not found on page`); rec.url = m[1]; }
  licences[key] = rec; saveLicences();
  return rec;
}

/** Make sure `dir` contains only regular files below it (defence against hostile archives). */
function assertContained(dir) {
  const root = fs.realpathSync(dir);
  const walkC = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isSymbolicLink()) { fs.unlinkSync(p); continue; } const rp = fs.realpathSync(p); if (!rp.startsWith(root)) throw new Error(`archive escaped target dir: ${p}`); if (e.isDirectory()) walkC(p); } };
  walkC(root);
}

async function extract7z(archive, outDir) {
  const { default: SevenZip } = await import('7z-wasm');
  const lines = [];
  const sz = await SevenZip({ print: (s) => lines.push(s), printErr: (s) => lines.push(s) });
  fs.mkdirSync(outDir, { recursive: true });
  sz.FS.mkdir('/arc'); sz.FS.mount(sz.NODEFS, { root: path.dirname(archive) }, '/arc');
  sz.FS.mkdir('/out'); sz.FS.mount(sz.NODEFS, { root: outDir }, '/out');
  sz.FS.chdir('/out');
  const rc = sz.callMain(['x', `/arc/${path.basename(archive)}`, '-y', '-xr!.DS_Store', '-xr!desktop.ini', '-xr!__MACOSX', '-xr!Thumbs.db']);
  if (rc) throw new Error(`7z exit ${rc}: ${lines.slice(-5).join(' | ')}`);
  assertContained(outDir);
}

function extractZip(archive, outDir) {
  const data = new Uint8Array(fs.readFileSync(archive));
  const files = unzipSync(data, { filter: (f) => !/(^|\/)(__MACOSX|\.DS_Store|desktop\.ini|Thumbs\.db)(\/|$)/i.test(f.name) && !f.name.endsWith('/') });
  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, bytes] of Object.entries(files)) {
    const parts = name.replace(/\\/g, '/').split('/').filter((s) => s && s !== '.' && s !== '..' && !/^[a-z]:$/i.test(s));
    if (!parts.length) continue;
    const dst = path.join(outDir, ...parts);
    if (!path.resolve(dst).startsWith(path.resolve(outDir) + path.sep)) throw new Error(`zip entry escapes: ${name}`);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, bytes);
  }
  assertContained(outDir);
}

function listFiles(dir, base = dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(p, base, out); else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- packs
async function fetchPack(p) {
  const dir = path.join(SRC, p.id);
  const lic = await verifyPack(p);
  const marker = path.join(dir, '.complete');
  if (fs.existsSync(marker) && !flag('refetch')) { log(`  ${p.id}: ok (cached)`); return; }
  if (p.kind === 'files') {
    for (const u of p.urls) {
      const name = decodeURIComponent(u.split('/').pop());
      const got = await download(u, path.join(dir, name));
      log(`  ${p.id}: ${got ? 'downloaded' : 'have'} ${name}`);
    }
  } else {
    const url = p.url || lic.url;
    const file = path.join(DL, p.file || `${p.id}${p.kind === '7z' ? '.7z' : '.zip'}`);
    const got = await download(url, file, p.size);
    log(`  ${p.id}: ${got ? 'downloaded' : 'have'} ${path.basename(file)} (${(fs.statSync(file).size / 1e6).toFixed(1)} MB) - extracting`);
    fs.rmSync(dir, { recursive: true, force: true });
    if (p.kind === '7z') await extract7z(file, dir); else extractZip(file, dir);
    if (p.stripPrefix) {
      const inner = path.join(dir, p.stripPrefix);
      if (fs.existsSync(inner)) {
        for (const e of fs.readdirSync(inner)) fs.renameSync(path.join(inner, e), path.join(dir, e));
        fs.rmSync(inner, { recursive: true, force: true });
      }
    }
  }
  fs.writeFileSync(marker, TODAY);
}

// FFSL: tags from "Prepared Master Sheet.csv"
function ffslMeta(dir) {
  const f = path.join(dir, 'Prepared Master Sheet.csv');
  const meta = new Map();
  if (!fs.existsSync(f)) return meta;
  const rows = fs.readFileSync(f, 'utf8').split(/\r\n|\r|\n/).filter(Boolean).slice(1);
  for (const row of rows) {
    const m = row.match(/^([^,]+),([^,]*),[^,]*,[^,]*,[^,]*,"?(.*?)"?$/);
    if (!m) continue;
    const desc = m[3];
    const t = desc.toLowerCase();
    const tags = new Set();
    for (const [re, tag] of [[/handgun|pistol/, 'pistol'], [/revolver/, 'revolver'], [/shotgun/, 'shotgun'], [/sub machine gun/, 'smg'], [/assault rifle/, 'assault-rifle'],
      [/\brifle\b/, 'rifle'], [/carbine/, 'carbine'], [/machine gun/, 'machine-gun'], [/bolt action/, 'bolt-action'], [/pump action/, 'pump-action'], [/lever action/, 'lever-action'],
      [/fully automatic/, 'full-auto'], [/semi automatic/, 'semi-auto'], [/single action/, 'single-action'], [/double action/, 'double-action'],
      [/near distance/, 'near'], [/mid distance/, 'mid'], [/short burst/, 'burst-short'], [/long burst/, 'burst-long'], [/last round/, 'last-round'], [/stereo/, 'stereo']]) if (re.test(t)) tags.add(tag);
    if (!tags.has('burst-short') && !tags.has('burst-long')) tags.add('single');
    const cal = t.match(/(\.\d{2,3}(?: [a-z]+)*|\d+mm|\d\.\d+x\d+|12 gauge|\.30-06|\.30-30|7\.62x\d+)/g);
    if (cal) for (const c of cal) tags.add('cal-' + slug(c));
    meta.set(m[1].trim(), { title: desc.split(',')[0].trim() + ' - ' + desc.split(',').slice(1).join(',').trim(), tags: [...tags] });
  }
  return meta;
}

// ---------------------------------------------------------------------------------------------- freesound
function freesoundList() {
  const list = new Map(FREESOUND.map(([id, tags]) => [id, { id, tags }]));
  if (fs.existsSync(SOURCES_D)) for (const f of fs.readdirSync(SOURCES_D).filter((x) => x.endsWith('.json'))) {
    for (const e of JSON.parse(fs.readFileSync(path.join(SOURCES_D, f), 'utf8'))) {
      const prev = list.get(e.id);
      list.set(e.id, { id: e.id, tags: [...new Set([...(prev?.tags || []), ...(e.tags || [])])], from: f });
    }
  }
  return [...list.values()];
}

async function fetchFreesound() {
  const dir = path.join(SRC, 'fs');
  fs.mkdirSync(dir, { recursive: true });
  const list = freesoundList();
  let n = 0;
  for (const e of list) {
    const key = `fs:${e.id}`;
    let rec = licences[key];
    if (!fresh(rec)) {
      try {
        const info = await verifyCC0(e.id);
        rec = { cc0: info.cc0, licence: info.licence, licenceUrl: info.licenceUrl, title: info.title, user: info.user, userId: info.userId, page: info.page, preview: info.preview, fsTags: info.tags.slice(0, 16), description: info.description.slice(0, 300), suspicious: info.suspicious, verified: TODAY };
        licences[key] = rec; saveLicences();
      } catch (err) { problems.push(`${key}: ${err.message}`); log(`  ${key}: page check failed (${err.message})`); continue; }
    }
    if (!rec.cc0) { problems.push(`${key}: licence is '${rec.licence}', skipped`); log(`  ${key}: NOT CC0 (${rec.licence}) - skipped`); continue; }
    if (rec.suspicious && !REVIEWED[e.id]) log(`  ${key}: note - title/description mentions film/game material: review it, then add it to REVIEWED in sources.mjs (or drop it)`);
    const file = path.join(dir, `${e.id}_${slug(rec.title)}.ogg`);
    try {
      const got = await download(rec.preview, file);
      if (got) { n++; log(`  ${key}: downloaded ${path.basename(file)} (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`); }
    } catch (err) { problems.push(`${key}: ${err.message}`); log(`  ${key}: download failed (${err.message})`); }
  }
  log(`  freesound: ${list.length} listed, ${n} new downloads`);
}

// ---------------------------------------------------------------------------------------------- inventory
async function analyse(file) {
  const b = await readAudio(file);
  const m = measure(b);
  const out = {
    peakDb: m.peakDb, truePeakDb: m.truePeakDb, lufs: m.lufs, momentaryMaxLufs: m.momentaryMaxLufs, crestDb: m.crestDb,
    centroidHz: m.centroidHz, bandsDb: m.bandsDb, dcDb: m.dcDb, stereoCorr: m.stereoCorr,
  };
  if (b.duration <= 150) {
    const r3 = (x) => Math.round(x * 1000) / 1000;
    const on = detectOnsets(b);
    out.onsetCount = on.length; out.onsets = on.slice(0, 400).map(r3);
    const ev = splitOnSilence(b, { threshDb: -42, minSilence: 0.1 });
    out.eventCount = ev.length; out.events = ev.slice(0, 300).map((e) => [r3(e.start), r3(e.end)]);
  }
  return out;
}

async function buildInventory() {
  const old = fs.existsSync(INVENTORY) ? JSON.parse(fs.readFileSync(INVENTORY, 'utf8')) : { files: [] };
  const prev = new Map(old.files.map((f) => [f.path, f]));
  const inv = { version: 1, generated: new Date().toISOString(), note: 'Generated by tools/audio/fetch.mjs. Paths are relative to tools/audio/src/. All entries are CC0 1.0.', packs: {}, files: [] };
  const entries = [];
  for (const p of PACKS) {
    const dir = path.join(SRC, p.id);
    if (!fs.existsSync(path.join(dir, '.complete'))) continue;
    const lic = licences[`pack:${p.id}`] || {};
    inv.packs[p.id] = { title: p.title, author: p.author, page: p.page, download: p.url || lic.url || p.urls?.join(' '), licence: 'CC0-1.0', shown: lic.shown, verified: lic.verified, via: lic.via, note: p.note };
    const meta = p.id === 'ffsl' ? ffslMeta(dir) : new Map();
    for (const f of listFiles(dir).filter((x) => AUDIO_EXT.test(x)).sort()) {
      const segs = f.split('/');
      const base = segs[segs.length - 1];
      const m = meta.get(base);
      const tags = new Set([...p.tags, ...segs.slice(0, -1).map((s) => slug(s).replace(/-/g, '')), ...(m?.tags || [])]);
      for (const tok of base.replace(/\.[^.]+$/, '').split(/[^a-zA-Z]+/)) if (tok.length > 2 && !/^\d+$/.test(tok)) tags.add(tok.toLowerCase());
      entries.push({ id: `${p.id}/${f.replace(/\.[^.]+$/, '')}`, path: `${p.id}/${f}`, pack: p.id, title: m?.title || base.replace(/\.[^.]+$/, ''), author: p.author, licence: 'CC0-1.0', url: p.page, tags: [...tags] });
    }
  }
  // freesound
  inv.packs.fs = { title: 'Freesound (individual CC0 sounds)', author: 'various', page: 'https://freesound.org', licence: 'CC0-1.0' };
  const fsDir = path.join(SRC, 'fs');
  const fsList = new Map(freesoundList().map((e) => [e.id, e]));
  if (fs.existsSync(fsDir)) for (const f of fs.readdirSync(fsDir).filter((x) => AUDIO_EXT.test(x)).sort()) {
    const id = +f.split('_')[0];
    const rec = licences[`fs:${id}`];
    if (!rec?.cc0 || !fsList.has(id)) continue; // only verified + still-listed sounds
    entries.push({ id: `fs:${id}`, path: `fs/${f}`, pack: 'fs', title: rec.title, author: rec.user, licence: 'CC0-1.0', url: rec.page, tags: [...new Set([...fsList.get(id).tags, ...rec.fsTags.map((t) => t.toLowerCase())])], suspicious: (rec.suspicious && !REVIEWED[id]) || undefined, reviewed: REVIEWED[id] });
  }
  // probe + analyse one file at a time (bounded memory)
  let k = 0;
  for (const e of entries) {
    k++;
    const abs = path.join(SRC, e.path);
    const st = fs.statSync(abs);
    const p = prev.get(e.path);
    if (p && p.bytes === st.size && p.mtime === Math.round(st.mtimeMs) && (p.analysis || flag('no-analysis')) && !flag('reanalyze')) {
      inv.files.push({ ...e, format: p.format, duration: p.duration, channels: p.channels, sampleRate: p.sampleRate, bits: p.bits, bytes: p.bytes, mtime: p.mtime, analysis: p.analysis });
      continue;
    }
    try {
      const pr = await probe(abs);
      const rec = { ...e, format: pr.format, duration: Math.round(pr.duration * 1000) / 1000, channels: pr.channels, sampleRate: pr.sampleRate, bits: pr.bits, bytes: st.size, mtime: Math.round(st.mtimeMs) };
      if (!flag('no-analysis')) rec.analysis = await analyse(abs);
      inv.files.push(rec);
      const a = rec.analysis;
      log(`  [${k}/${entries.length}] ${e.id.padEnd(48).slice(0, 48)} ${rec.duration.toFixed(2).padStart(7)}s ${rec.channels}ch ${rec.sampleRate} ${a ? `${a.lufs} LUFS pk ${a.peakDb} ev ${a.eventCount ?? '-'}` : ''}`);
    } catch (err) {
      problems.push(`${e.id}: ${err.message}`);
      log(`  [${k}/${entries.length}] ${e.id}: FAILED ${err.message}`);
    }
  }
  freeDecoders();
  fs.writeFileSync(INVENTORY, JSON.stringify(inv, null, 1));
  return inv;
}

// ---------------------------------------------------------------------------------------------- main
async function main() {
  fs.mkdirSync(DL, { recursive: true });
  log('packs:');
  for (const p of PACKS) {
    if (!want(p.id)) continue;
    try { await fetchPack(p); } catch (e) { problems.push(`${p.id}: ${e.message}`); log(`  ${p.id}: FAILED ${e.message}`); }
  }
  if (want('fs')) { log('freesound:'); await fetchFreesound(); }
  log('inventory:');
  const inv = await buildInventory();
  updateCredits();
  const dur = inv.files.reduce((s, f) => s + (f.duration || 0), 0);
  log(`\ninventory: ${inv.files.length} files (${(dur / 60).toFixed(1)} min) from ${Object.keys(inv.packs).length} packs -> ${rel(INVENTORY)}`);
  log(`credits: ${rel(path.join(TOOL, '../../docs/CREDITS.md'))} (audio-sources section)`);
  if (problems.length) { log(`\n${problems.length} problem(s):`); for (const p of problems) log('  - ' + p); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
