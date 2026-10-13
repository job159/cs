// Inventory access for producers: query the downloaded CC0 sources (tools/audio/src/inventory.json, built by
// tools/audio/fetch.mjs) and load them as 48 kHz Bufs. Every load is recorded so the build can write provenance
// and docs/CREDITS.md.
//
//   const shots = ctx.sources.find({ pack: 'ffsl', tags: ['ak47', 'near'] });
//   const b = await ctx.load(shots[0], { start: 1.2, end: 1.9 });            // seconds
//   const ev = await ctx.load(shots[0], { event: 3 });                        // 4th detected event (analysis.events)
//   const fs1 = await ctx.load('fs:427596');                                  // Freesound id
import fs from 'node:fs';
import path from 'node:path';
import { INVENTORY, SRC } from './paths.mjs';
import { readAudio } from './io.mjs';
import { Buf } from './buffer.mjs';

export class Sources {
  constructor(inv) {
    this.inv = inv || { packs: {}, files: [] };
    this.byId = new Map(this.inv.files.map((f) => [f.id, f]));
    this.used = new Set();
    this.cache = new Map(); // id -> Buf (full file at 48 kHz), LRU by insertion
    this.cacheSamples = 0;
    this.cacheBudget = 24e6; // ~96 MB of float samples
  }

  static load(file = INVENTORY) {
    if (!fs.existsSync(file)) {
      console.warn(`[audio] ${path.relative(process.cwd(), file)} missing - run: node tools/audio/fetch.mjs`);
      return new Sources();
    }
    return new Sources(JSON.parse(fs.readFileSync(file, 'utf8')));
  }

  get files() { return this.inv.files; }
  get packs() { return this.inv.packs; }

  get(id) {
    const e = typeof id === 'string' ? this.byId.get(id) : id;
    if (!e) throw new Error(`unknown source '${id}' (see tools/audio/src/inventory.json)`);
    return e;
  }
  has(id) { return this.byId.has(id); }

  /**
   * Query. q: { pack, tags: [...all], anyTags: [...], text: 'substring' | RegExp (id/title/tags), minDur, maxDur,
   * channels, minRate }. Returns inventory entries sorted by id.
   */
  find(q = {}) {
    const re = q.text instanceof RegExp ? q.text : q.text ? new RegExp(q.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
    return this.inv.files.filter((f) => {
      if (f.suspicious && !q.includeSuspicious) return false;
      if (q.pack && f.pack !== q.pack) return false;
      if (q.tags && !q.tags.every((t) => f.tags.includes(t))) return false;
      if (q.anyTags && !q.anyTags.some((t) => f.tags.includes(t))) return false;
      if (re && !re.test(`${f.id} ${f.title || ''} ${f.tags.join(' ')}`)) return false;
      if (q.minDur !== undefined && f.duration < q.minDur) return false;
      if (q.maxDur !== undefined && f.duration > q.maxDur) return false;
      if (q.channels !== undefined && f.channels !== q.channels) return false;
      if (q.minRate !== undefined && f.sampleRate < q.minRate) return false;
      return true;
    }).sort((a, b) => a.id.localeCompare(b.id));
  }

  path(id) { return path.join(SRC, this.get(id).path); }

  _cacheGet(id) { const b = this.cache.get(id); if (b) { this.cache.delete(id); this.cache.set(id, b); } return b; }
  _cachePut(id, b) {
    const n = b.length * b.channels;
    if (n > this.cacheBudget / 2) return;
    this.cache.set(id, b); this.cacheSamples += n;
    while (this.cacheSamples > this.cacheBudget && this.cache.size) {
      const [k, v] = this.cache.entries().next().value;
      this.cache.delete(k); this.cacheSamples -= v.length * v.channels;
    }
  }

  /**
   * Load a source as a Buf. opts: { start, end (s), event (index into analysis.events), pad (s around event, 0.01),
   * channels (1|2), sampleRate (48000) }. WAV ranges are read from disk without loading the whole file.
   */
  async load(id, { start, end, event, pad = 0.01, channels, sampleRate = 48000 } = {}) {
    const e = this.get(id);
    if (e.suspicious) throw new Error(`${e.id} is flagged suspicious (title/description mentions film/game material) — review it and add it to REVIEWED in tools/audio/sources.mjs, or use another source`);
    if (e.licence !== 'CC0-1.0') throw new Error(`${e.id}: licence ${e.licence} is not CC0`);
    this.used.add(e.id);
    if (event !== undefined) {
      const ev = e.analysis?.events?.[event];
      if (!ev) throw new Error(`${e.id}: no event #${event} (has ${e.analysis?.events?.length || 0})`);
      start = Math.max(0, ev[0] - pad); end = ev[1] + pad;
    }
    const file = path.join(SRC, e.path);
    if (/\.wav$/i.test(file)) return readAudio(file, { start: start ?? 0, end: end ?? Infinity, channels, sampleRate });
    let full = this._cacheGet(e.id);
    if (!full) { full = await readAudio(file, { sampleRate }); this._cachePut(e.id, full); }
    let b = full;
    if (start !== undefined || end !== undefined) {
      const a = Math.max(0, Math.round((start ?? 0) * b.sampleRate)), z = Math.min(b.length, Math.round((end ?? b.duration) * b.sampleRate));
      b = new Buf(b.data.map((d) => d.slice(a, Math.max(a, z))), b.sampleRate);
    } else b = b.clone();
    if (channels === 1 && b.channels > 1) { const m = new Float32Array(b.length); for (const d of b.data) for (let i = 0; i < m.length; i++) m[i] += d[i] / b.channels; b = new Buf([m], b.sampleRate); }
    else if (channels === 2 && b.channels === 1) b = new Buf([b.data[0], b.data[0].slice()], b.sampleRate);
    return b;
  }

  /** Credit line for an entry: "<title> by <author> (<licence>) <url>". */
  credit(id) { const e = this.get(id); return `${e.title || e.id} by ${e.author} (${e.licence}) ${e.url}`; }
}
