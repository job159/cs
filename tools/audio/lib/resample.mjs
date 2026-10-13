// Band-limited resampling (Kaiser-windowed sinc, arbitrary ratio), varispeed pitch/time variation (tape style),
// time-varying varispeed (spin-ups, doppler), integer oversampling helpers and a WSOLA time-stretch.
//
//   resample(buf, 48000)            -> new rate, same pitch/duration
//   varispeed(buf, 1.05)            -> +5% pitch, 5% shorter (like a faster tape)  — the classic variant generator
//   varispeedSemis(buf, -2)         -> two semitones down (and longer)
//   varispeedCurve(buf, [[0, 0.5], [1.2, 1.0]])  -> rate ramps 0.5 -> 1.0 over 1.2 s (motor spin-up)
//   timeStretch(buf, 1.3)           -> 30% longer, same pitch (WSOLA; good for tails/ambience, not transients)
import { Buf, semitonesToRatio } from './buffer.mjs';
import { toFn } from './filters.mjs';

const OS = 512; // table points per zero crossing
const tables = new Map();

function besselI0(x) {
  let s = 1, t = 1;
  for (let k = 1; k < 50; k++) { t *= (x / (2 * k)) * (x / (2 * k)); s += t; if (t < 1e-12 * s) break; }
  return s;
}

/** Half windowed-sinc table h(u) for u in [0, zc] (u in zero-crossing units), OS points per unit. */
function sincTable(zc, beta) {
  const key = `${zc}:${beta}`;
  let t = tables.get(key);
  if (t) return t;
  const n = zc * OS;
  t = new Float64Array(n + 2);
  const i0b = besselI0(beta);
  for (let i = 0; i <= n; i++) {
    const u = i / OS;
    const sinc = i === 0 ? 1 : Math.sin(Math.PI * u) / (Math.PI * u);
    const r = u / zc;
    t[i] = sinc * besselI0(beta * Math.sqrt(Math.max(0, 1 - r * r))) / i0b;
  }
  t[n + 1] = 0;
  tables.set(key, t);
  return t;
}

const QUALITY = { fast: { zc: 8, beta: 6 }, good: { zc: 16, beta: 8 }, high: { zc: 32, beta: 9.5 } };

/**
 * Resample a Float32Array by `ratio` (= outRate / inRate). Optional outLength.
 * cutoff: fraction of the lower Nyquist kept (0.9-0.97).
 */
export function resampleArray(x, ratio, { quality = 'good', cutoff = 0.95, outLength } = {}) {
  const { zc, beta } = QUALITY[quality] || QUALITY.good;
  const tab = sincTable(zc, beta);
  const n = x.length;
  const m = outLength ?? Math.max(0, Math.round(n * ratio));
  const out = new Float32Array(m);
  const fc = Math.min(1, ratio) * cutoff;   // normalized cutoff relative to input Nyquist
  const hw = zc / fc;                       // kernel half width in input samples
  const scale = fc * OS;
  const tmax = zc * OS;
  for (let j = 0; j < m; j++) {
    const t = j / ratio;
    let i0 = Math.ceil(t - hw), i1 = Math.floor(t + hw);
    if (i0 < 0) i0 = 0;
    if (i1 > n - 1) i1 = n - 1;
    let acc = 0;
    for (let i = i0; i <= i1; i++) {
      const u = Math.abs(t - i) * scale;
      const k = u | 0;
      if (k >= tmax) continue;
      const f = u - k;
      acc += x[i] * (tab[k] + (tab[k + 1] - tab[k]) * f);
    }
    out[j] = acc * fc;
  }
  return out;
}

/** Resample a Buf to a new sample rate (pitch and duration preserved). */
export function resample(buf, toRate, opts = {}) {
  if (toRate === buf.sampleRate) return buf.clone();
  const ratio = toRate / buf.sampleRate;
  const outLength = Math.round(buf.length * ratio);
  return new Buf(buf.data.map((d) => resampleArray(d, ratio, { ...opts, outLength })), toRate);
}

/** Tape-style speed change: rate > 1 = higher pitch and shorter. Keeps the sample rate. */
export function varispeed(buf, rate, opts = {}) {
  if (Math.abs(rate - 1) < 1e-9) return buf.clone();
  const ratio = 1 / rate;
  const outLength = Math.max(1, Math.round(buf.length * ratio));
  return new Buf(buf.data.map((d) => resampleArray(d, ratio, { ...opts, outLength })), buf.sampleRate);
}

export const varispeedSemis = (buf, semis, opts) => varispeed(buf, semitonesToRatio(semis), opts);
export const varispeedCents = (buf, cents, opts) => varispeed(buf, semitonesToRatio(cents / 100), opts);

/**
 * Time-varying varispeed. rate: number | fn(tOut seconds) | [[t, rate], ...]. Output ends when the input is consumed
 * (or at maxSeconds). Anti-aliasing uses the maximum rate (pass maxRate if rate is a function).
 */
export function varispeedCurve(buf, rate, { maxRate, quality = 'good', cutoff = 0.95, maxSeconds = 600 } = {}) {
  const R = toFn(rate);
  if (maxRate === undefined) {
    if (Array.isArray(rate)) maxRate = Math.max(...rate.map((p) => p[1]));
    else if (typeof rate === 'number') maxRate = rate;
    else { maxRate = 0; for (let t = 0; t < buf.duration * 4; t += 0.01) maxRate = Math.max(maxRate, R(t)); }
  }
  const { zc, beta } = QUALITY[quality] || QUALITY.good;
  const tab = sincTable(zc, beta);
  const sr = buf.sampleRate, n = buf.length;
  const fc = Math.min(1, 1 / Math.max(maxRate, 1e-6)) * cutoff;
  const hw = zc / fc, scale = fc * OS, tmax = zc * OS;
  // first pass: positions
  const pos = [];
  let p = 0;
  for (let j = 0; p < n && j < maxSeconds * sr; j++) { pos.push(p); p += Math.max(0, R(j / sr)); }
  const m = pos.length;
  return new Buf(buf.data.map((x) => {
    const out = new Float32Array(m);
    for (let j = 0; j < m; j++) {
      const t = pos[j];
      let i0 = Math.ceil(t - hw), i1 = Math.floor(t + hw);
      if (i0 < 0) i0 = 0;
      if (i1 > n - 1) i1 = n - 1;
      let acc = 0;
      for (let i = i0; i <= i1; i++) {
        const u = Math.abs(t - i) * scale, k = u | 0;
        if (k >= tmax) continue;
        acc += x[i] * (tab[k] + (tab[k + 1] - tab[k]) * (u - k));
      }
      out[j] = acc * fc;
    }
    return out;
  }), sr);
}

/** Integer-factor oversampling of a Float32Array (for non-linear processing). */
export function upsampleArray(x, factor, quality = 'fast') {
  return factor === 1 ? x.slice() : resampleArray(x, factor, { quality, cutoff: 0.97, outLength: x.length * factor });
}
/** Inverse of upsampleArray (band-limits then decimates). */
export function downsampleArray(x, factor, quality = 'fast') {
  return factor === 1 ? x.slice() : resampleArray(x, 1 / factor, { quality, cutoff: 0.97, outLength: Math.round(x.length / factor) });
}

/**
 * WSOLA time stretch: factor > 1 = longer. Pitch is preserved. Channels share the same alignment.
 * frame (s): analysis window; tolerance (s): search range. Smears sharp transients a little — use it on tails,
 * ambience, voices; use varispeed() for one-shots.
 */
export function timeStretch(buf, factor, { frame = 0.046, tolerance = 0.012 } = {}) {
  if (Math.abs(factor - 1) < 1e-6) return buf.clone();
  const sr = buf.sampleRate, n = buf.length;
  const N = Math.max(64, Math.round(frame * sr) & ~1);
  const Hs = N >> 1;
  const Ha = Hs / factor;
  const tol = Math.round(tolerance * sr);
  const outLen = Math.round(n * factor);
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  // mono guide signal for alignment
  const mono = new Float32Array(n);
  for (const d of buf.data) for (let i = 0; i < n; i++) mono[i] += d[i];
  const at = (i) => (i >= 0 && i < n ? mono[i] : 0);
  const outs = buf.data.map(() => new Float32Array(outLen + N));
  const norm = new Float32Array(outLen + N);
  let prev = 0;
  for (let k = 0; k * Hs < outLen; k++) {
    const target = Math.round(k * Ha);
    let best = target;
    if (k > 0) {
      const nat = prev + Hs; // natural continuation of the previous frame
      let bestC = -Infinity;
      // coarse search (step 4) then refine
      const corr = (cand) => { let c = 0; for (let i = 0; i < N; i += 4) c += at(cand + i) * at(nat + i); return c; };
      for (let d = -tol; d <= tol; d += 4) { const c = corr(target + d); if (c > bestC) { bestC = c; best = target + d; } }
      const b0 = best;
      for (let d = -3; d <= 3; d++) { let c = 0; for (let i = 0; i < N; i += 2) c += at(b0 + d + i) * at(nat + i); if (c > bestC) { bestC = c; best = b0 + d; } }
    }
    const o = k * Hs;
    for (let c = 0; c < buf.channels; c++) {
      const src = buf.data[c], dst = outs[c];
      for (let i = 0; i < N; i++) { const si = best + i; if (si >= 0 && si < n) dst[o + i] += src[si] * win[i]; }
    }
    for (let i = 0; i < N; i++) norm[o + i] += win[i];
    prev = best;
  }
  return new Buf(outs.map((d) => {
    const r = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) r[i] = norm[i] > 1e-3 ? d[i] / norm[i] : d[i];
    return r;
  }), sr);
}
