// Core audio buffer type + small helpers shared by every module.
//
// A Buf is { sampleRate, data: Float32Array[] } (one Float32Array per channel, all the same length).
// Every processing function in this toolkit is NON-MUTATING: it takes a Buf and returns a new Buf.

export const SR = 48000;              // project-wide output rate
export const EPS = 1e-12;

export class Buf {
  constructor(data, sampleRate = SR) {
    if (!Array.isArray(data) || !data.length) throw new Error('Buf: data must be a non-empty array of Float32Array');
    const n = data[0].length;
    for (const d of data) {
      if (!(d instanceof Float32Array)) throw new Error('Buf: channel data must be Float32Array');
      if (d.length !== n) throw new Error('Buf: channel length mismatch');
    }
    this.data = data;
    this.sampleRate = sampleRate;
  }
  get channels() { return this.data.length; }
  get length() { return this.data[0].length; }
  get duration() { return this.length / this.sampleRate; }
  clone() { return new Buf(this.data.map((d) => d.slice()), this.sampleRate); }
  /** Seconds -> sample index (rounded). */
  s(t) { return Math.round(t * this.sampleRate); }

  static alloc(length, channels = 1, sampleRate = SR) {
    length = Math.max(0, Math.round(length));
    return new Buf(Array.from({ length: channels }, () => new Float32Array(length)), sampleRate);
  }
  static seconds(sec, channels = 1, sampleRate = SR) { return Buf.alloc(sec * sampleRate, channels, sampleRate); }
  /** From Float32Array | number[] | array of those (one per channel). */
  static from(arr, sampleRate = SR) {
    const chans = (Array.isArray(arr) && (arr[0] instanceof Float32Array || Array.isArray(arr[0]))) ? arr : [arr];
    return new Buf(chans.map((c) => (c instanceof Float32Array ? c : Float32Array.from(c))), sampleRate);
  }
}

export const isBuf = (x) => x instanceof Buf;

export const db2lin = (db) => Math.pow(10, db / 20);
export const lin2db = (x) => 20 * Math.log10(Math.max(Math.abs(x), EPS));
export const pow2db = (p) => 10 * Math.log10(Math.max(p, EPS));
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const semitonesToRatio = (st) => Math.pow(2, st / 12);
export const ratioToSemitones = (r) => 12 * Math.log2(r);
export const nextPow2 = (n) => { let p = 1; while (p < n) p <<= 1; return p; };

/** Apply fn(sampleValue, index, channel) per sample, returning a new Buf. */
export function mapSamples(buf, fn) {
  return new Buf(buf.data.map((d, c) => {
    const o = new Float32Array(d.length);
    for (let i = 0; i < d.length; i++) o[i] = fn(d[i], i, c);
    return o;
  }), buf.sampleRate);
}

/** Apply fn(Float32Array channel, channelIndex) -> Float32Array per channel. */
export function mapChannels(buf, fn) {
  return new Buf(buf.data.map((d, c) => fn(d, c)), buf.sampleRate);
}

/** Peak absolute sample value across all channels (linear). */
export function peak(buf) {
  let p = 0;
  for (const d of buf.data) for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > p) p = a; }
  return p;
}

/** RMS across all channels (linear). */
export function rms(buf) {
  let s = 0, n = 0;
  for (const d of buf.data) { for (let i = 0; i < d.length; i++) s += d[i] * d[i]; n += d.length; }
  return n ? Math.sqrt(s / n) : 0;
}

/** Throws when two buffers have different sample rates. */
export function assertSameRate(...bufs) {
  const r = bufs[0].sampleRate;
  for (const b of bufs) if (b.sampleRate !== r) throw new Error(`sample rate mismatch ${b.sampleRate} vs ${r} (resample first)`);
  return r;
}

// ---------------------------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) with convenience helpers. Producers MUST use seeded randomness
// so builds are reproducible: rng(seed) or ctx.rng('name').
export function hashSeed(s) {
  if (typeof s === 'number') return s >>> 0;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < String(s).length; i++) { h ^= String(s).charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

export function rng(seed = 1) {
  let a = hashSeed(seed) || 0x9e3779b9;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare = null;
  const r = {
    next,
    /** uniform [a, b) */
    range: (lo = 0, hi = 1) => lo + (hi - lo) * next(),
    /** integer in [lo, hi] */
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    sign: () => (next() < 0.5 ? -1 : 1),
    chance: (p) => next() < p,
    /** standard normal */
    gauss: () => {
      if (spare !== null) { const s = spare; spare = null; return s; }
      let u = 0, v = 0;
      while (u === 0) u = next();
      v = next();
      const m = Math.sqrt(-2 * Math.log(u));
      spare = m * Math.sin(2 * Math.PI * v);
      return m * Math.cos(2 * Math.PI * v);
    },
    shuffle: (arr) => { const a2 = arr.slice(); for (let i = a2.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a2[i], a2[j]] = [a2[j], a2[i]]; } return a2; },
    /** derive an independent child generator */
    fork: (label = '') => rng(hashSeed(`${a}:${label}`)),
  };
  return r;
}
