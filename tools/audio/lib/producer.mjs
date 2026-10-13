// Producer runtime: the `ctx` object handed to every tools/audio/producers/*.mjs `produce(lib, ctx)`, and the
// Category writer that finalizes, QA-checks, encodes (Ogg Vorbis q0.5, 48 kHz) and writes
//   game/assets/audio/<category>/<name>[_<n>].ogg  +  game/assets/audio/manifest.<category>.json
// plus a QA report + spectrograms in tools/audio/out/<category>/ and provenance in tools/audio/provenance/.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { AUDIO, AUDIO_IS_DEFAULT, OUT, PROVENANCE, rel } from './paths.mjs';
import { rng as makeRng, hashSeed, Buf } from './buffer.mjs';
import { finalize } from './master.mjs';
import { encodeOgg, decodeBytes, writeWav, readAudio } from './io.mjs';
import { truePeak } from './loudness.mjs';
import { measure, checkTarget, spectrogram, formatMeasure } from './analysis.mjs';
import { scale } from './edit.mjs';
import { db2lin, lin2db } from './buffer.mjs';
import { Sources } from './sources.mjs';

/**
 * Loudness targets (integrated LUFS, true peak <= -1 dBTP). The first block is the project contract; the rest are
 * toolkit defaults for things the contract doesn't name (tune per sound with `lufs:`).
 */
export const TARGETS = {
  gunClose: -12, gunTail: -20, gunMech: -22, foley: -22, mech: -22, impact: -18, voice: -20, footstep: -26, ui: -22, amb: -30, music: -18,
  // toolkit defaults
  gunFar: -22, explosion: -14, explosionFar: -22, gore: -19, debris: -21, stinger: -18, loopSfx: -22, whoosh: -22,
};

/** QA: allowed leading silence (ms) per target — tails/far layers start with the reflection pre-delay by design. */
const HEAD_MS = { gunTail: 250, gunFar: 60, explosionFar: 80, amb: Infinity, music: Infinity };

/** Default manifest fields by bus. */
const BUS_DEFAULTS = {
  sfx: { vol: 1, pitch: [0.97, 1.03], voices: 4, spatial: true, range: [2, 60] },
  voice: { vol: 1, pitch: [0.95, 1.05], voices: 3, spatial: true, range: [2, 40] },
  ui: { vol: 1, pitch: [1, 1], voices: 2, spatial: false, range: [1, 1] },
  music: { vol: 1, pitch: [1, 1], voices: 1, spatial: false, range: [1, 1] },
  amb: { vol: 1, pitch: [1, 1], voices: 2, spatial: false, range: [1, 1] },
};

const NAME_RE = /^[a-z0-9]+[a-zA-Z0-9_]*$/;
const CAT_RE = /^[a-z0-9_]+$/;

function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

/** Rewrite game/assets/audio/index.json from the manifest files present on disk. */
export function writeIndex() {
  if (!fs.existsSync(AUDIO)) return [];
  const manifests = fs.readdirSync(AUDIO).filter((f) => /^manifest\.[a-z0-9_]+\.json$/.test(f)).sort();
  writeAtomic(path.join(AUDIO, 'index.json'), JSON.stringify({ manifests }, null, 2) + '\n');
  return manifests;
}

export class Category {
  constructor(ctx, name, defaults = {}) {
    if (!CAT_RE.test(name)) throw new Error(`category name '${name}' must match ${CAT_RE}`);
    this.ctx = ctx;
    this.name = name;
    this.defaults = defaults;
    this.dir = path.join(AUDIO, name);
    this.sounds = {};      // manifest entries
    this.reports = [];     // per-file QA
    this.written = new Set();
    this.sources = {};     // sound -> [source ids]
    this.notes = {};
    this.done = false;
  }

  /**
   * Add a sound with 1..N variants (Buf or Buf[]). opts:
   *   target: TARGETS key (e.g. 'gunClose') | lufs: number      — loudness target (required unless normalize:false)
   *   bus ('sfx'|'ui'|'music'|'amb'|'voice'), spatial, vol, pitch [min,max], voices, range [ref,max], loop, priority, rolloff
   *   channels: 1 | 2 (default: 1 when spatial, else keep up to 2)
   *   ceiling (-1 dBTP), tolerance (1 LU QA window), normalize (true), maxDuration (QA), sources: [ids], note
   */
  async add(sound, variants, opts = {}) {
    if (this.done) throw new Error(`category ${this.name} already written`);
    if (!NAME_RE.test(sound)) throw new Error(`sound name '${sound}' must match ${NAME_RE}`);
    if (this.sounds[sound]) throw new Error(`sound '${sound}' added twice in ${this.name}`);
    const o = { ...this.defaults, ...opts };
    const list = (Array.isArray(variants) ? variants : [variants]).filter(Boolean);
    if (!list.length) throw new Error(`${sound}: no variants`);
    const bus = o.bus || 'sfx';
    const bd = BUS_DEFAULTS[bus] || BUS_DEFAULTS.sfx;
    const spatial = o.spatial ?? bd.spatial;
    const loop = !!o.loop;
    const lufs = o.lufs ?? (o.target ? TARGETS[o.target] : undefined);
    if (o.target && TARGETS[o.target] === undefined) throw new Error(`${sound}: unknown target '${o.target}' (TARGETS: ${Object.keys(TARGETS).join(', ')})`);
    if (lufs === undefined && o.normalize !== false) throw new Error(`${sound}: give target or lufs (or normalize:false)`);
    const ceiling = o.ceiling ?? -1;
    const channels = o.channels ?? (spatial ? 1 : undefined);
    if (spatial && channels === 2) this.ctx.warn(`${this.name}/${sound}: stereo file on a spatial sound (PannerNode will downmix)`);
    const files = [];
    for (let k = 0; k < list.length; k++) {
      const fname = list.length === 1 ? `${sound}.ogg` : `${sound}_${k + 1}.ogg`;
      const relFile = `${this.name}/${fname}`;
      // master with a small codec margin under the ceiling: Vorbis adds a few tenths of a dB of inter-sample overshoot
      const margin = o.codecMargin ?? 0.4;
      let b = finalize(list[k], { lufs, ceiling: ceiling - margin, channels, loop, normalize: o.normalize !== false, limiter: o.limiter });
      const meta = b.meta || {};
      // encode, decode back and verify what actually ships: decoded true peak <= ceiling (rescale + re-encode if not)
      let bytes, dec, decTp = -Infinity;
      for (let attempt = 0; attempt < 4; attempt++) {
        bytes = await encodeOgg(b, { quality: o.quality ?? 0.5 });
        dec = await decodeBytes(bytes, fname);
        decTp = lin2db(truePeak(dec));
        if (decTp <= ceiling + 0.02) break;
        b = scale(b, db2lin(ceiling - 0.05 - decTp));
      }
      const file = path.join(this.dir, fname);
      writeAtomic(file, bytes);
      this.written.add(fname);
      files.push(relFile);
      // QA: loudness / true peak / clipping on the decoded file (= what the game plays); edges and leading silence on
      // the master (the codec smears a few ms of pre-echo onto sample 0 of a file that starts with its transient)
      const m = measure(dec);
      const mPre = measure(b, { spectrum: false });
      const issues = checkTarget({ ...m, startDb: mPre.startDb, endDb: mPre.endDb, headMs: mPre.headMs }, { lufs, tolerance: o.tolerance ?? 1, truePeak: ceiling + 0.02, loop, maxDuration: o.maxDuration, maxHeadMs: o.maxHeadMs ?? (loop ? Infinity : HEAD_MS[o.target] ?? 15) });
      const maxLimit = o.maxLimitDb ?? (o.target === 'gunClose' || o.target === 'explosion' ? 6 : 4);
      if (meta.limitedDb > maxLimit) issues.push(`limiter took ${meta.limitedDb.toFixed(1)} dB to hit ${lufs} LUFS (clip/shape transients first)`);
      const rep = { sound, file: relFile, bytes: bytes.length, target: lufs, ...m, decodedTruePeakDb: Math.round(decTp * 100) / 100, limitedDb: Math.round((meta.limitedDb || 0) * 100) / 100, issues };
      this.reports.push(rep);
      if (issues.length) this.ctx.warn(`${relFile}: ${issues.join('; ')}`);
      const png = this.ctx.options.spectrograms;
      if (png === 'all' || (png !== 'none' && k === 0)) {
        try { spectrogram(dec, path.join(OUT, this.name, 'png', fname.replace(/\.ogg$/, '.png')), { title: `${this.name}/${fname}`, measure: m }); } catch (e) { this.ctx.warn(`spectrogram ${fname}: ${e.message}`); }
      }
      this.ctx.log(`  ${relFile.padEnd(36)} ${formatMeasure(m)}  ${(bytes.length / 1024).toFixed(1)} KB`);
    }
    const entry = {
      files,
      vol: o.vol ?? bd.vol,
      pitch: o.pitch ?? bd.pitch,
      voices: o.voices ?? bd.voices,
      bus,
      spatial,
      range: o.range ?? bd.range,
      loop,
    };
    if (o.priority !== undefined) entry.priority = o.priority;
    if (o.rolloff !== undefined) entry.rolloff = o.rolloff;
    this.sounds[sound] = entry;
    this.sources[sound] = [...new Set(o.sources || [])];
    if (o.note) this.notes[sound] = o.note;
    return entry;
  }

  /** Write manifest.<category>.json, remove stale .ogg files, write QA report + provenance, refresh index.json. */
  async write() {
    if (this.done) return;
    this.done = true;
    fs.mkdirSync(this.dir, { recursive: true });
    // stale files from earlier runs of this category
    for (const f of fs.readdirSync(this.dir)) if (f.endsWith('.ogg') && !this.written.has(f)) { fs.unlinkSync(path.join(this.dir, f)); this.ctx.log(`  removed stale ${this.name}/${f}`); }
    const sorted = Object.fromEntries(Object.keys(this.sounds).sort().map((k) => [k, this.sounds[k]]));
    writeAtomic(path.join(AUDIO, `manifest.${this.name}.json`), JSON.stringify({ sounds: sorted }, null, 2) + '\n');
    // provenance: explicit per-sound sources + everything the producer loaded
    const used = [...this.ctx.sources.used].sort();
    const prov = { category: this.name, producer: this.ctx.name, sounds: {}, loaded: used, original: !used.length && !Object.values(this.sources).some((s) => s.length) };
    for (const k of Object.keys(sorted)) prov.sounds[k] = this.sources[k];
    // dry runs (build.mjs --out elsewhere) must not leak into the committed provenance / CREDITS
    writeAtomic(path.join(AUDIO_IS_DEFAULT ? PROVENANCE : path.join(OUT, 'dry-run-provenance'), `${this.name}.json`), JSON.stringify(prov, null, 2) + '\n');
    // QA report
    const rdir = path.join(OUT, this.name);
    fs.mkdirSync(rdir, { recursive: true });
    fs.writeFileSync(path.join(rdir, 'report.json'), JSON.stringify(this.reports, null, 2));
    const md = [`# ${this.name} — QA report (${new Date().toISOString()})`, '', '| file | dur s | LUFS | target | TP | crest | centroid | KB | issues |', '|---|---|---|---|---|---|---|---|---|'];
    for (const r of this.reports) md.push(`| ${r.file} | ${r.duration.toFixed(3)} | ${r.lufs} | ${r.target ?? '-'} | ${r.truePeakDb} | ${r.crestDb} | ${r.centroidHz} | ${(r.bytes / 1024).toFixed(1)} | ${r.issues.join('; ')} |`);
    fs.writeFileSync(path.join(rdir, 'report.md'), md.join('\n') + '\n');
    writeIndex();
    const nIssues = this.reports.filter((r) => r.issues.length).length;
    this.ctx.log(`[${this.name}] ${Object.keys(sorted).length} sounds, ${this.reports.length} files, ${nIssues} with QA issues -> ${rel(path.join(AUDIO, `manifest.${this.name}.json`))}`);
    this.ctx.issueCount += nIssues;
    return { sounds: Object.keys(sorted).length, files: this.reports.length, issues: nIssues };
  }
}

/** Build the ctx object for one producer run. */
export function createContext({ name, options = {}, sources } = {}) {
  const ctx = {
    name,
    options: { spectrograms: 'first', ...options },
    sources: sources || Sources.load(),
    categories: [],
    issueCount: 0,
    log: (...a) => console.log(...a),
    warn: (...a) => console.warn(`  ! ${a.join(' ')}`),
    /** Seeded RNG, stable per producer + label (builds are reproducible). */
    rng: (label = '') => makeRng(hashSeed(`${name}:${label}`)),
    /** Load an inventory source as a 48 kHz Buf (records provenance). */
    load: (id, opts) => ctx.sources.load(id, opts),
    /** Open a category writer. Call `await cat.write()` at the end (build.mjs also flushes unwritten ones). */
    category: (cat, defaults) => { const c = new Category(ctx, cat, defaults); ctx.categories.push(c); return c; },
    /** Write a preview WAV (+ spectrogram) to tools/audio/out/<producer>/preview/ — not shipped. */
    preview: (label, buf, { png = true } = {}) => {
      const base = path.join(OUT, name, 'preview', label.replace(/[^a-zA-Z0-9_.-]/g, '_'));
      writeWav(base + '.wav', buf, { bits: 24 });
      if (png) spectrogram(buf, base + '.png', { title: `${name}/${label}` });
      return base + '.wav';
    },
    /** Disk cache for expensive intermediates: await ctx.cached('ak_slices_v1', async () => buf). */
    cached: async (key, fn) => {
      const f = path.join(OUT, 'cache', name, crypto.createHash('sha1').update(String(key)).digest('hex').slice(0, 16) + '.wav');
      if (!ctx.options.noCache && fs.existsSync(f)) return readAudio(f);
      const b = await fn();
      if (!(b instanceof Buf)) throw new Error('ctx.cached: fn must return a Buf');
      writeWav(f, b, { bits: 32 });
      return b;
    },
  };
  return ctx;
}
