// Editing utilities: slicing, padding, gain, fades, silence trimming, DC removal, channel tools, envelopes,
// onset detection / splitting multi-take recordings, sample-accurate layering and loop crossfades.
// All functions are non-mutating (return a new Buf). Times are in seconds unless the name says "Samples".
import { Buf, SR, db2lin, lin2db, peak, assertSameRate, clamp } from './buffer.mjs';
import { runBiquad, design1, toFn } from './filters.mjs';

// ---------------------------------------------------------------------------------------------- basic
export function sliceSamples(buf, i0 = 0, i1 = buf.length) {
  i0 = clamp(Math.round(i0), 0, buf.length); i1 = clamp(Math.round(i1), i0, buf.length);
  return new Buf(buf.data.map((d) => d.slice(i0, i1)), buf.sampleRate);
}
export const slice = (buf, t0 = 0, t1 = buf.duration) => sliceSamples(buf, t0 * buf.sampleRate, t1 * buf.sampleRate);

/** Add silence before/after (seconds). */
export function pad(buf, pre = 0, post = 0) {
  const a = Math.round(pre * buf.sampleRate), b = Math.round(post * buf.sampleRate);
  return new Buf(buf.data.map((d) => { const o = new Float32Array(a + d.length + b); o.set(d, a); return o; }), buf.sampleRate);
}
/** Pad or cut to exactly `sec` seconds. */
export function fitLength(buf, sec) {
  const n = Math.round(sec * buf.sampleRate);
  return new Buf(buf.data.map((d) => { const o = new Float32Array(n); o.set(d.subarray(0, n)); return o; }), buf.sampleRate);
}
export function concat(bufs, { gap = 0 } = {}) {
  const sr = assertSameRate(...bufs);
  const ch = Math.max(...bufs.map((b) => b.channels));
  const g = Math.round(gap * sr);
  const len = bufs.reduce((s, b) => s + b.length, 0) + g * (bufs.length - 1);
  const out = Buf.alloc(len, ch, sr);
  let o = 0;
  for (const b of bufs) { for (let c = 0; c < ch; c++) out.data[c].set(b.data[Math.min(c, b.channels - 1)], o); o += b.length + g; }
  return out;
}
export const reverse = (buf) => new Buf(buf.data.map((d) => d.slice().reverse()), buf.sampleRate);
export const invert = (buf) => scale(buf, -1);
export function scale(buf, k) { return new Buf(buf.data.map((d) => { const o = new Float32Array(d.length); for (let i = 0; i < d.length; i++) o[i] = d[i] * k; return o; }), buf.sampleRate); }
export const gain = (buf, db) => scale(buf, db2lin(db));
/** Scale so the sample peak hits `db` dBFS (use loudness.normalizeLufs for loudness targets). */
export function normalizePeak(buf, db = -1) { const p = peak(buf); return p > 0 ? scale(buf, db2lin(db) / p) : buf.clone(); }

/** Sum of several buffers (same length not required). */
export function add(...bufs) { return mix(bufs.map((b) => ({ buf: b }))); }

// ---------------------------------------------------------------------------------------------- channels
/** Downmix to mono. mode: 'avg' (default, equal weight), 'sum', 'left', 'right', 'mid' (=avg). */
export function toMono(buf, mode = 'avg') {
  if (buf.channels === 1) return buf.clone();
  if (mode === 'left') return new Buf([buf.data[0].slice()], buf.sampleRate);
  if (mode === 'right') return new Buf([buf.data[1].slice()], buf.sampleRate);
  const n = buf.length, o = new Float32Array(n), k = mode === 'sum' ? 1 : 1 / buf.channels;
  for (const d of buf.data) for (let i = 0; i < n; i++) o[i] += d[i] * k;
  return new Buf([o], buf.sampleRate);
}
export function toStereo(buf) {
  if (buf.channels === 2) return buf.clone();
  if (buf.channels === 1) return new Buf([buf.data[0].slice(), buf.data[0].slice()], buf.sampleRate);
  return new Buf([buf.data[0].slice(), buf.data[1].slice()], buf.sampleRate);
}
export const setChannels = (buf, n) => (n === 1 ? toMono(buf) : n === 2 ? toStereo(buf) : buf.clone());

/** Equal-power pan of a mono (or downmixed) signal into stereo. p in [-1, 1]. */
export function pan(buf, p = 0) {
  const m = buf.channels === 1 ? buf.data[0] : toMono(buf).data[0];
  const a = (clamp(p, -1, 1) + 1) * Math.PI / 4;
  const gl = Math.cos(a) * Math.SQRT2, gr = Math.sin(a) * Math.SQRT2; // centre = unity on both sides
  const l = new Float32Array(m.length), r = new Float32Array(m.length);
  for (let i = 0; i < m.length; i++) { l[i] = m[i] * gl; r[i] = m[i] * gr; }
  return new Buf([l, r], buf.sampleRate);
}
/** Mid/side width: 0 = mono, 1 = unchanged, >1 = wider. */
export function width(buf, w = 1) {
  if (buf.channels !== 2) return buf.clone();
  const [L, R] = buf.data, n = buf.length, l = new Float32Array(n), r = new Float32Array(n);
  for (let i = 0; i < n; i++) { const m = (L[i] + R[i]) * 0.5, s = (L[i] - R[i]) * 0.5 * w; l[i] = m + s; r[i] = m - s; }
  return new Buf([l, r], buf.sampleRate);
}
/** Haas widening: delays one side by `ms` (keep < 25 ms). Mono input becomes stereo. */
export function haas(buf, ms = 12, side = 'right', level = 1) {
  const s = toStereo(buf), d = Math.round(ms / 1000 * s.sampleRate), ci = side === 'left' ? 0 : 1;
  const src = s.data[ci], o = new Float32Array(src.length);
  for (let i = d; i < o.length; i++) o[i] = src[i - d] * level;
  s.data[ci] = o;
  return s;
}
/** Stereo correlation coefficient (-1..1); 1 = mono-compatible. */
export function stereoCorrelation(buf) {
  if (buf.channels < 2) return 1;
  const [L, R] = buf.data; let lr = 0, ll = 0, rr = 0;
  for (let i = 0; i < L.length; i++) { lr += L[i] * R[i]; ll += L[i] * L[i]; rr += R[i] * R[i]; }
  return ll && rr ? lr / Math.sqrt(ll * rr) : 1;
}

// ---------------------------------------------------------------------------------------------- DC / fades
/**
 * Remove DC: mode 'hp' (1st-order 5 Hz high-pass: removes DC completely with only ~6° of phase shift at 50 Hz, so the
 * peaks of a finished, clipped one-shot barely move) or 'mean' (subtract the mean; loop-safe).
 */
export function removeDC(buf, { mode = 'hp', hz = 5 } = {}) {
  if (mode === 'mean') return new Buf(buf.data.map((d) => { let m = 0; for (let i = 0; i < d.length; i++) m += d[i]; m /= d.length || 1; const o = new Float32Array(d.length); for (let i = 0; i < d.length; i++) o[i] = d[i] - m; return o; }), buf.sampleRate);
  const c = design1('hp1', hz, buf.sampleRate);
  return new Buf(buf.data.map((d) => runBiquad(d, c)), buf.sampleRate);
}

// Fade curves map x in [0, 1] (0 = silent edge) to gain. fadeIn uses x = time since start, fadeOut x = time before end:
//   fadeIn 'exp'  = slow swell;  fadeOut 'exp' = natural exponential-looking decay (drops fast, then a long soft end)
//   fadeIn 'log'  = fast attack;  fadeOut 'log' = holds level then cuts steeply near the end
const CURVES = {
  linear: (x) => x,
  sine: (x) => Math.sin(x * Math.PI / 2),          // equal power (default, click-free micro fades)
  exp: (x) => (Math.exp(4 * x) - 1) / (Math.exp(4) - 1),
  log: (x) => Math.log1p(x * 54.6) / Math.log(55.6),
  scurve: (x) => 0.5 - 0.5 * Math.cos(Math.PI * x),
};
export const fadeCurve = (name) => (typeof name === 'function' ? name : CURVES[name] || CURVES.sine);

export function fadeIn(buf, sec = 0.005, curve = 'sine') {
  const n = Math.min(buf.length, Math.round(sec * buf.sampleRate)), f = fadeCurve(curve);
  const out = buf.clone();
  for (const d of out.data) for (let i = 0; i < n; i++) d[i] *= f(i / n);
  return out;
}
export function fadeOut(buf, sec = 0.02, curve = 'sine') {
  const n = Math.min(buf.length, Math.round(sec * buf.sampleRate)), f = fadeCurve(curve), L = buf.length;
  const out = buf.clone();
  for (const d of out.data) for (let i = 0; i < n; i++) d[L - 1 - i] *= f(i / n);
  return out;
}
export const fade = (buf, inSec = 0.002, outSec = 0.02, curve = 'sine') => fadeOut(fadeIn(buf, inSec, curve), outSec, curve);

/** Gain automation: points [[t, dB], ...] (linear interpolation in dB) or fn(t) -> linear gain. */
export function automate(buf, points) {
  const sr = buf.sampleRate;
  const g = typeof points === 'function' ? points : ((f) => (t) => db2lin(f(t)))(toFn(points));
  const n = buf.length, gains = new Float32Array(n);
  for (let i = 0; i < n; i++) gains[i] = g(i / sr);
  return new Buf(buf.data.map((d) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = d[i] * gains[i]; return o; }), sr);
}

/** Exponential decay envelope applied from `start` s: amplitude falls 60 dB over `t60` s. */
export function decay(buf, t60, start = 0) {
  const k = 6.907755 / Math.max(t60, 1e-4);
  return automate(buf, (t) => (t < start ? 1 : Math.exp(-k * (t - start))));
}

// ---------------------------------------------------------------------------------------------- envelopes & detection
/** Peak (or RMS) envelope follower over all channels (max), attack/release in seconds. */
export function envelope(buf, { attack = 0.001, release = 0.05, rms = false } = {}) {
  const sr = buf.sampleRate, n = buf.length;
  const a = attack > 0 ? Math.exp(-1 / (attack * sr)) : 0, r = release > 0 ? Math.exp(-1 / (release * sr)) : 0;
  const e = new Float32Array(n);
  let s = 0;
  for (let i = 0; i < n; i++) {
    let x = 0;
    for (const d of buf.data) { const v = rms ? d[i] * d[i] : Math.abs(d[i]); if (v > x) x = v; }
    s = x > s ? a * s + (1 - a) * x : r * s + (1 - r) * x;
    e[i] = rms ? Math.sqrt(s) : s;
  }
  return e;
}

/** First/last sample index whose level exceeds the threshold (dBFS absolute, or relative to peak). */
export function findActive(buf, { threshDb = -60, relative = true } = {}) {
  const p = peak(buf);
  if (p === 0) return { start: 0, end: 0 };
  const th = relative ? p * db2lin(threshDb) : db2lin(threshDb);
  let start = buf.length, end = 0;
  for (const d of buf.data) {
    for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > th) { if (i < start) start = i; break; }
    for (let i = d.length - 1; i >= 0; i--) if (Math.abs(d[i]) > th) { if (i + 1 > end) end = i + 1; break; }
  }
  return start >= end ? { start: 0, end: 0 } : { start, end };
}

/**
 * Trim leading/trailing silence and apply click-free micro fades.
 * threshDb is relative to the peak by default (-60 dB below peak). pre/post: keep this much around the active region.
 */
export function trimSilence(buf, { threshDb = -60, relative = true, pre = 0.002, post = 0.03, fadeInSec = 0.0015, fadeOutSec = 0.02, start = true, end = true } = {}) {
  const act = findActive(buf, { threshDb, relative });
  if (act.end === 0) return sliceSamples(buf, 0, 0);
  const sr = buf.sampleRate;
  const i0 = start ? Math.max(0, act.start - Math.round(pre * sr)) : 0;
  const i1 = end ? Math.min(buf.length, act.end + Math.round(post * sr)) : buf.length;
  let out = sliceSamples(buf, i0, i1);
  if (start && i0 > 0 && fadeInSec > 0) out = fadeIn(out, Math.min(fadeInSec, pre || fadeInSec), 'sine');
  if (end && fadeOutSec > 0) out = fadeOut(out, Math.min(fadeOutSec, out.duration / 2), 'sine');
  return out;
}

/**
 * Onset detection on a multi-take recording (gunshots, impacts, footsteps).
 * Uses a fast/slow envelope ratio + absolute floor. Returns onset times in seconds.
 *   threshold: dB the fast envelope must exceed the slow one (default 9)
 *   floorDb:   ignore events quieter than this relative to the file peak (default -40)
 *   minGap:    minimum spacing between onsets (s)
 */
export function detectOnsets(buf, { threshold = 9, floorDb = -40, minGap = 0.06, fast = 0.0005, slow = 0.03 } = {}) {
  const sr = buf.sampleRate;
  const ef = envelope(buf, { attack: fast, release: 0.01 });
  const es = envelope(buf, { attack: slow, release: slow * 4 });
  const p = peak(buf), floor = p * db2lin(floorDb), k = db2lin(threshold);
  const out = [];
  let last = -Infinity;
  for (let i = 1; i < buf.length; i++) {
    if (ef[i] > floor && ef[i] > es[i] * k && (i - last) / sr >= minGap) {
      // walk back to the start of the rise (where fast env was ~ -24 dB of the current value)
      let j = i;
      const lim = Math.max(0, i - Math.round(0.01 * sr));
      while (j > lim && ef[j - 1] > ef[i] * 0.06) j--;
      out.push(j / sr);
      last = i;
    }
  }
  return out;
}

/**
 * Split a recording into events separated by silence. Returns [{ start, end }] in seconds.
 *   threshDb: relative to the file peak; minSilence: gap length that separates events; minLength: drop shorter events
 */
export function splitOnSilence(buf, { threshDb = -45, minSilence = 0.12, minLength = 0.03, pre = 0.004, post = 0.05, release = 0.02 } = {}) {
  const sr = buf.sampleRate;
  const e = envelope(buf, { attack: 0.0005, release });
  const th = peak(buf) * db2lin(threshDb);
  const gap = Math.round(minSilence * sr);
  const events = [];
  let inEv = false, s = 0, quiet = 0;
  for (let i = 0; i < e.length; i++) {
    if (e[i] > th) { if (!inEv) { inEv = true; s = i; } quiet = 0; }
    else if (inEv && ++quiet >= gap) { events.push([s, i - quiet + 1]); inEv = false; }
  }
  if (inEv) events.push([s, e.length]);
  return events
    .map(([a, b]) => ({ start: Math.max(0, a / sr - pre), end: Math.min(buf.duration, b / sr + post) }))
    .filter((ev) => ev.end - ev.start >= minLength);
}

/** Convenience: split + slice + trim; returns Buf[] (one per take). */
export function takes(buf, opts = {}) {
  return splitOnSilence(buf, opts).map((ev) => trimSilence(slice(buf, ev.start, ev.end), { threshDb: opts.trimDb ?? -50, pre: 0.001, post: 0.02 }));
}

// ---------------------------------------------------------------------------------------------- layering
/**
 * Sample-accurate layering. layers: Buf | { buf, at = 0 (s), atSample, gain = 0 (dB), gainLin, pan (-1..1, stereo out) }.
 * Output channels: opts.channels or the max of the inputs (2 if any layer is panned). Output length: opts.length (s)
 * or long enough for every layer.
 */
export function mix(layers, { length, channels, sampleRate } = {}) {
  const L = layers.filter(Boolean).map((l) => (l instanceof Buf ? { buf: l } : l));
  if (!L.length) return Buf.alloc(Math.round((length || 0) * (sampleRate || SR)), channels || 1, sampleRate || SR);
  const sr = sampleRate || L[0].buf.sampleRate;
  for (const l of L) if (l.buf.sampleRate !== sr) throw new Error(`mix: sample rate mismatch ${l.buf.sampleRate} vs ${sr} (resample first)`);
  const ch = channels || Math.max(...L.map((l) => (l.pan !== undefined ? 2 : l.buf.channels)));
  const offs = L.map((l) => (l.atSample !== undefined ? Math.round(l.atSample) : Math.round((l.at || 0) * sr)));
  const n = length !== undefined ? Math.round(length * sr) : Math.max(...L.map((l, i) => offs[i] + l.buf.length));
  const out = Buf.alloc(n, ch, sr);
  L.forEach((l, li) => {
    const g = l.gainLin ?? db2lin(l.gain || 0);
    let src = l.buf;
    if (l.pan !== undefined && ch === 2) src = pan(src, l.pan);
    const o = offs[li];
    for (let c = 0; c < ch; c++) {
      const s = src.channels === 1 ? src.data[0] : src.data[Math.min(c, src.channels - 1)];
      const d = out.data[c];
      // stereo -> mono layer: average
      if (ch === 1 && src.channels > 1) {
        for (let i = Math.max(0, -o); i < src.length && i + o < n; i++) { let v = 0; for (const sd of src.data) v += sd[i]; d[i + o] += v / src.channels * g; }
      } else for (let i = Math.max(0, -o); i < s.length && i + o < n; i++) d[i + o] += s[i] * g;
    }
  });
  return out;
}
export const layer = mix;

/** Sequential crossfade: a then b, overlapping by `sec` with an equal-power curve. */
export function crossfade(a, b, sec = 0.05) {
  const sr = assertSameRate(a, b), x = Math.min(Math.round(sec * sr), a.length, b.length), ch = Math.max(a.channels, b.channels);
  const n = a.length + b.length - x, out = Buf.alloc(n, ch, sr);
  for (let c = 0; c < ch; c++) {
    const A = a.data[Math.min(c, a.channels - 1)], B = b.data[Math.min(c, b.channels - 1)], d = out.data[c];
    for (let i = 0; i < a.length; i++) { const k = i - (a.length - x); d[i] = A[i] * (k >= 0 ? Math.cos((k / x) * Math.PI / 2) : 1); }
    for (let i = 0; i < b.length; i++) { const o = a.length - x + i; d[o] += B[i] * (i < x ? Math.sin((i / x) * Math.PI / 2) : 1); }
  }
  return out;
}

/**
 * Make a seamless loop: the last `sec` seconds are crossfaded (equal power) into the beginning.
 * Output length = input length - sec. Loop point continuity is exact (out[end] flows into out[0]).
 */
export function loopCrossfade(buf, sec = 1) {
  const x = Math.min(Math.round(sec * buf.sampleRate), Math.floor(buf.length / 2));
  const n = buf.length - x;
  return new Buf(buf.data.map((d) => {
    const o = d.slice(0, n);
    for (let i = 0; i < x; i++) {
      const t = i / x;
      o[i] = d[i] * Math.sin(t * Math.PI / 2) + d[n + i] * Math.cos(t * Math.PI / 2);
    }
    return o;
  }), buf.sampleRate);
}

/** Level (dB) of the first/last sample relative to full scale — used for click checks. */
export function edgeLevels(buf) {
  let a = 0, b = 0;
  for (const d of buf.data) { a = Math.max(a, Math.abs(d[0] || 0)); b = Math.max(b, Math.abs(d[d.length - 1] || 0)); }
  return { startDb: lin2db(a), endDb: lin2db(b) };
}
