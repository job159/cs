// Space: synthesized impulse responses + FFT convolution, an outdoor gun-tail generator, air absorption,
// distant ("_far") layer helper, feedback echo and an allpass diffuser.
//
//   const ir = makeIR('warehouse', { seed: 'wh' });       // stereo IR, unit energy per channel
//   const wet = convolve(dry, ir, { wet: 0.3 });           // dry + wet
//   const tail = gunTail(closeShot, { env: 'urban', length: 1.8, seed: 'ak_tail_1' });  // wet-only stereo tail
//   const far = farLayer(closeShot, { distance: 150, env: 'urban', seed: 'ak_far' });   // mono distant version
//
// Presets (ENVIRONMENTS): smallRoom, warehouse, alley, urban (street between buildings), field (open ground),
// harbor (containers + water), tunnel. Each is a parameter object you can spread and tweak.
import { Buf, rng as makeRng, db2lin, nextPow2 } from './buffer.mjs';
import { convolveArrays, fft } from './fft.mjs';
import { eq, runBiquad, design } from './filters.mjs';
import { toMono, fadeOut, sliceSamples, mix as mixBufs } from './edit.mjs';

// ---------------------------------------------------------------------------------------------- presets
// echoes: { count, t: [min, max] s, gain: [min, max], falloff (spreading-loss exponent vs delay, 0.6), lp: [Hz at first ..
// Hz at last], spread: [s, s] (diffusion burst length), pan: width 0..1 }; tail: { rt60 (mid), rtLow, rtHigh, gain, start (s), build (s), lp, hp }; flutter: periodic
// reflections { period, count, decay, lp }.
export const ENVIRONMENTS = {
  smallRoom: {
    length: 0.9, predelay: 0.002,
    echoes: { count: 18, t: [0.002, 0.03], gain: [0.25, 0.7], lp: [11000, 6000], spread: [0.0003, 0.002], pan: 1 },
    tail: { rt60: 0.38, rtLow: 0.45, rtHigh: 0.22, gain: 0.7, start: 0.01, build: 0.006, lp: 9000, hp: 90 },
  },
  warehouse: {
    length: 3.4, predelay: 0.01,
    echoes: { count: 26, t: [0.012, 0.11], gain: [0.15, 0.5], lp: [9000, 3500], spread: [0.001, 0.006], pan: 1 },
    flutter: { period: 0.052, count: 10, decay: 0.72, lp: 4000 },
    tail: { rt60: 2.3, rtLow: 2.9, rtHigh: 1.1, gain: 1, start: 0.03, build: 0.05, lp: 7000, hp: 55 },
  },
  alley: {
    length: 1.6, predelay: 0.004,
    echoes: { count: 8, t: [0.008, 0.06], gain: [0.3, 0.6], lp: [9000, 5000], spread: [0.0005, 0.003], pan: 1 },
    flutter: { period: 0.024, count: 22, decay: 0.8, lp: 5000 },
    tail: { rt60: 0.9, rtLow: 1.0, rtHigh: 0.45, gain: 0.45, start: 0.02, build: 0.03, lp: 5000, hp: 80 },
  },
  urban: {
    length: 2.2, predelay: 0.02,
    echoes: { count: 14, t: [0.03, 0.55], gain: [0.18, 0.55], lp: [6500, 1800], spread: [0.003, 0.03], pan: 1 },
    tail: { rt60: 1.5, rtLow: 1.9, rtHigh: 0.5, gain: 0.45, start: 0.06, build: 0.12, lp: 3200, hp: 60 },
  },
  field: {
    length: 2.4, predelay: 0.03,
    echoes: { count: 5, t: [0.18, 0.8], gain: [0.12, 0.35], lp: [3500, 1400], spread: [0.01, 0.05], pan: 1 },
    tail: { rt60: 1.1, rtLow: 1.6, rtHigh: 0.35, gain: 0.3, start: 0.08, build: 0.2, lp: 1800, hp: 50 },
  },
  harbor: {
    length: 2.8, predelay: 0.025,
    echoes: { count: 12, t: [0.06, 0.7], gain: [0.15, 0.5], lp: [5000, 1500], spread: [0.004, 0.035], pan: 1 },
    tail: { rt60: 1.9, rtLow: 2.5, rtHigh: 0.6, gain: 0.5, start: 0.08, build: 0.15, lp: 2600, hp: 45 },
  },
  tunnel: {
    length: 3.0, predelay: 0.006,
    echoes: { count: 10, t: [0.006, 0.05], gain: [0.3, 0.6], lp: [8000, 4000], spread: [0.001, 0.004], pan: 1 },
    flutter: { period: 0.035, count: 30, decay: 0.86, lp: 3000 },
    tail: { rt60: 2.6, rtLow: 3.2, rtHigh: 1.0, gain: 1.1, start: 0.02, build: 0.04, lp: 4500, hp: 50 },
  },
};

// ---------------------------------------------------------------------------------------------- IR synthesis
function onePoleLP(x, f, sr) {
  const a = Math.exp(-2 * Math.PI * Math.min(f, sr * 0.45) / sr);
  let y = 0;
  for (let i = 0; i < x.length; i++) { y = (1 - a) * x[i] + a * y; x[i] = y; }
  return x;
}

/** Decaying noise burst normalised to unit energy (diffused reflection). */
function burst(len, t60, sr, r) {
  const n = Math.max(1, len), o = new Float32Array(n);
  if (n === 1) { o[0] = 1; return o; }
  const k = 6.907755 / Math.max(t60 * sr, 1);
  let e = 0;
  for (let i = 0; i < n; i++) { o[i] = (r.next() * 2 - 1) * Math.exp(-k * i); e += o[i] * o[i]; }
  const g = 1 / Math.sqrt(e || 1);
  for (let i = 0; i < n; i++) o[i] *= g;
  return o;
}

/**
 * Build an impulse response. env: preset name or params object (see ENVIRONMENTS). opts: { seed, channels (1|2),
 * sampleRate, length (override) }. Returns a Buf normalised to unit energy per channel (no direct sound).
 */
export function makeIR(env = 'urban', { seed = 'ir', channels = 2, sampleRate = 48000, length } = {}) {
  const P = typeof env === 'string' ? ENVIRONMENTS[env] : env;
  if (!P) throw new Error(`makeIR: unknown environment ${env}`);
  const sr = sampleRate, len = Math.round((length ?? P.length) * sr);
  const r = makeRng(seed);
  const early = Array.from({ length: channels }, () => new Float32Array(len));
  // discrete echoes / early reflections
  const E = P.echoes;
  if (E) {
    const times = [];
    for (let k = 0; k < E.count; k++) times.push(E.t[0] + (E.t[1] - E.t[0]) * Math.pow(r.next(), 1.3));
    times.sort((a, b) => a - b);
    times.forEach((t, k) => {
      const frac = E.count > 1 ? k / (E.count - 1) : 0;
      // later reflections travel further: spreading loss (falloff exponent) on top of the random surface gain
      const g = (E.gain[0] + (E.gain[1] - E.gain[0]) * r.next()) * Math.pow(Math.max(E.t[0], 0.004) / Math.max(t, 0.004), E.falloff ?? 0.6);
      // surface colour (preset lp curve) and air absorption over the reflection's path length (343 m/s * t)
      const lp = Math.min(E.lp[0] * Math.pow(E.lp[1] / E.lp[0], frac), airCutoff(343 * (P.predelay + t), 8));
      // the last reflections of the window fade in level so the echo field hands over smoothly to the diffuse tail
      const taper = frac > 0.65 ? 0.35 + 0.65 * Math.cos(((frac - 0.65) / 0.35) * Math.PI / 2) ** 2 : 1;
      const spread = E.spread[0] + (E.spread[1] - E.spread[0]) * (0.5 * frac + 0.5 * r.next());
      const p = (k % 2 ? 1 : -1) * (0.15 + 0.85 * r.next()) * (E.pan ?? 1); // alternate sides so few-echo IRs stay balanced
      const a = (p + 1) * Math.PI / 4;
      const at = Math.round((P.predelay + t) * sr);
      for (let c = 0; c < channels; c++) {
        const pg = channels === 2 ? (c === 0 ? Math.cos(a) : Math.sin(a)) * Math.SQRT2 : 1;
        const b = onePoleLP(onePoleLP(burst(Math.round(spread * sr), spread * 0.6, sr, r), lp, sr), lp * 1.6, sr); // ~12 dB/oct air + surface loss
        for (let i = 0; i < b.length && at + i < len; i++) early[c][at + i] += b[i] * g * pg * taper;
      }
    });
  }
  // flutter echo (parallel walls)
  const F = P.flutter;
  if (F) {
    for (let k = 1; k <= F.count; k++) {
      const at = Math.round((P.predelay + F.period * k) * sr);
      if (at >= len) break;
      const g = Math.pow(F.decay, k) * 0.6;
      const lp = (F.lp || 4000) / Math.sqrt(k);
      for (let c = 0; c < channels; c++) {
        const b = onePoleLP(burst(Math.round(0.0015 * sr * (1 + k * 0.15)), 0.001, sr, r), Math.max(500, lp), sr);
        const pg = channels === 2 ? (k % 2 === c ? 1.2 : 0.8) : 1;
        for (let i = 0; i < b.length && at + i < len; i++) early[c][at + i] += b[i] * g * pg;
      }
    }
  }
  // diffuse tail with frequency-dependent decay (3 bands)
  const T = P.tail;
  const tail = Array.from({ length: channels }, () => new Float32Array(len));
  if (T) {
    const start = Math.round((P.predelay + (T.start || 0)) * sr);
    const bands = [[null, 300, T.rtLow ?? T.rt60], [300, 3000, T.rt60], [3000, null, T.rtHigh ?? T.rt60]];
    for (let c = 0; c < channels; c++) {
      for (const [lo, hi, rt] of bands) {
        const nz = new Float32Array(len);
        for (let i = start; i < len; i++) nz[i] = r.next() * 2 - 1;
        let y = nz;
        if (lo) { const cf = design('hp', lo, sr); y = runBiquad(runBiquad(y, cf), cf); }
        if (hi) { const cf = design('lp', hi, sr); y = runBiquad(runBiquad(y, cf), cf); }
        const k = 6.907755 / Math.max(rt, 0.01);
        for (let i = start; i < len; i++) {
          const t = (i - start) / sr;
          const build = T.build ? 1 - Math.exp(-t / T.build) : 1;
          tail[c][i] += y[i] * Math.exp(-k * t) * build;
        }
      }
      const specs = [];
      if (T.hp) specs.push({ type: 'hp', f: T.hp, order: 2 });
      if (T.lp) specs.push({ type: 'lp', f: T.lp, order: 2 });
      if (specs.length) tail[c] = eq(new Buf([tail[c]], sr), specs).data[0];
    }
  }
  // normalise early / tail separately, then blend and normalise to unit energy per channel
  const energy = (arrs) => arrs.reduce((s, a) => s + a.reduce((q, v) => q + v * v, 0), 0) / arrs.length;
  const eE = energy(early), eT = energy(tail);
  const ge = eE > 0 ? 1 / Math.sqrt(eE) : 0, gt = eT > 0 ? (T?.gain ?? 1) / Math.sqrt(eT) : 0;
  const out = early.map((e, c) => { const o = new Float32Array(len); for (let i = 0; i < len; i++) o[i] = e[i] * ge + tail[c][i] * gt; return o; });
  for (const o of out) { // unit energy per channel (keeps stereo tails centred)
    const eo = energy([o]), g = eo > 0 ? 1 / Math.sqrt(eo) : 1;
    for (let i = 0; i < len; i++) o[i] *= g;
  }
  // gentle end fade so truncated IRs never click
  const fl = Math.min(len, Math.round(0.05 * sr));
  for (const o of out) for (let i = 0; i < fl; i++) o[len - 1 - i] *= i / fl;
  return new Buf(out, sr);
}

// ---------------------------------------------------------------------------------------------- convolution
/**
 * Convolve with an IR. Mono input + stereo IR -> stereo; stereo input + stereo IR -> per-channel.
 * opts: wet (lin, default 0.3), dry (lin, default 1), wetOnly, predelay (s), length (s, crop output).
 */
export function convolve(buf, ir, { wet = 0.3, dry = 1, wetOnly = false, predelay = 0, length } = {}) {
  if (ir.sampleRate !== buf.sampleRate) throw new Error('convolve: IR sample rate differs (resample it)');
  const sr = buf.sampleRate;
  const ch = Math.max(buf.channels, ir.channels);
  const pd = Math.round(predelay * sr);
  const n = length !== undefined ? Math.round(length * sr) : buf.length + ir.length - 1 + pd;
  const out = Buf.alloc(n, ch, sr);
  for (let c = 0; c < ch; c++) {
    const x = buf.data[Math.min(c, buf.channels - 1)], h = ir.data[Math.min(c, ir.channels - 1)];
    const y = convolveArrays(x, h);
    const d = out.data[c];
    const w = wetOnly ? 1 : wet;
    for (let i = 0; i < y.length && i + pd < n; i++) d[i + pd] += y[i] * w;
    if (!wetOnly) for (let i = 0; i < x.length && i < n; i++) d[i] += x[i] * dry;
  }
  return out;
}

/** Convenience: reverb(buf, 'warehouse', { wet: 0.25, seed }). */
export function reverb(buf, env = 'smallRoom', { seed = 'reverb', wet = 0.25, dry = 1, length, channels = 2 } = {}) {
  const ir = makeIR(env, { seed, channels, sampleRate: buf.sampleRate, length });
  return convolve(buf, ir, { wet, dry });
}

// ---------------------------------------------------------------------------------------------- linear-phase FIR from a magnitude curve
/** Design a linear-phase FIR (odd length taps+1) from magFn(Hz) -> linear gain. Delay = taps/2 samples. */
export function firFromMagnitude(magFn, sampleRate, taps = 2048) {
  const N = nextPow2(taps);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let k = 0; k <= N / 2; k++) { const g = magFn(k * sampleRate / N); re[k] = g; if (k > 0 && k < N / 2) re[N - k] = g; }
  fft(re, im, true);
  const h = new Float32Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const j = (i - N / 2 + N) % N;
    const w = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / N) + 0.08 * Math.cos(4 * Math.PI * i / N); // Blackman
    h[i] = (re[j] / N) * w;
  }
  return h;
}

/** Zero-latency (delay-compensated) arbitrary magnitude filter. */
export function fftFilter(buf, magFn, { taps = 2048 } = {}) {
  const h = firFromMagnitude(magFn, buf.sampleRate, taps);
  const d = (h.length - 1) / 2;
  return new Buf(buf.data.map((x) => { const y = convolveArrays(x, h); return y.slice(d, d + x.length); }), buf.sampleRate);
}

// ISO 9613-1 style atmospheric absorption at ~20 °C / 60 % RH (dB per metre)
const AIR = [[63, 0.0001], [125, 0.0004], [250, 0.001], [500, 0.0019], [1000, 0.0037], [2000, 0.0097], [4000, 0.0328], [8000, 0.117], [16000, 0.39], [24000, 0.8]];
export function airAlpha(f) {
  if (f <= AIR[0][0]) return AIR[0][1];
  for (let i = 1; i < AIR.length; i++) if (f <= AIR[i][0]) {
    const [f0, a0] = AIR[i - 1], [f1, a1] = AIR[i];
    const t = Math.log(f / f0) / Math.log(f1 / f0);
    return Math.exp(Math.log(a0) + t * (Math.log(a1) - Math.log(a0)));
  }
  return AIR[AIR.length - 1][1];
}
/** Frequency (Hz) at which `meters` of air attenuate by `db` dB (inverse of airAlpha; capped at 20 kHz). */
export function airCutoff(meters, db = 6) {
  if (meters <= 0 || airAlpha(20000) * meters < db) return 20000;
  let lo = 20, hi = 20000;
  for (let k = 0; k < 30; k++) { const mid = Math.sqrt(lo * hi); if (airAlpha(mid) * meters > db) hi = mid; else lo = mid; }
  return lo;
}
/** High-frequency loss over `meters` of air (does NOT apply 1/r spreading loss). */
export const airAbsorption = (buf, meters) => fftFilter(buf, (f) => db2lin(-airAlpha(f) * meters));

// ---------------------------------------------------------------------------------------------- gun tails / distance
/**
 * Outdoor/indoor tail for a gunshot: convolves the shot's head (transient + body) with a reflections-only IR so the
 * result contains NO direct sound — it is meant to be played as the separate '_tail' layer (the game plays it
 * 15 ms after '_close').
 *   env: ENVIRONMENTS key or params; length (s); head (s of source used as excitation); seed; stereo (default true);
 *   lp / hp: post filters; darken: extra air absorption in metres (distance of reflecting surfaces).
 */
export function gunTail(src, { env = 'urban', length, head = 0.12, seed = 'tail', stereo = true, lp, hp = 70, darken = 40, fadeStart = 0.55 } = {}) {
  const P = typeof env === 'string' ? ENVIRONMENTS[env] : env;
  const L = length ?? P.length;
  const sr = src.sampleRate;
  let ex = toMono(sliceSamples(src, 0, Math.round(head * sr)));
  ex = fadeOut(ex, Math.min(head * 0.4, 0.04), 'sine');
  const ir = makeIR(P, { seed, channels: stereo ? 2 : 1, sampleRate: sr, length: L });
  let out = convolve(ex, ir, { wetOnly: true, length: L });
  const specs = [];
  if (hp) specs.push({ type: 'hp', f: hp, order: 2 });
  if (lp) specs.push({ type: 'lp', f: lp, order: 2 });
  if (specs.length) out = eq(out, specs);
  if (darken > 0) out = airAbsorption(out, darken);
  // smooth musical fade of the last part (avoids an audible cut at `length`)
  const n = out.length, f0 = Math.round(n * fadeStart);
  for (const d of out.data) for (let i = f0; i < n; i++) { const t = (i - f0) / (n - f0); d[i] *= Math.cos(t * Math.PI / 2) ** 2; }
  return out;
}

/**
 * Distant version of a sound ('_far' layers, teammates > 40 m): air absorption, 1/r level is NOT applied (the game's
 * panner does distance attenuation; normalise the result), more reflections relative to direct, slight smear.
 * Returns mono.
 */
export function farLayer(src, { distance = 120, env = 'urban', seed = 'far', length = 2.4, direct = 0.6, reflections = 1, lowBoost = 3 } = {}) {
  const sr = src.sampleRate;
  let d = airAbsorption(toMono(src), distance);
  d = eq(d, [{ type: 'lowshelf', f: 250, gain: lowBoost }, { type: 'hp', f: 45, order: 2 }]);
  const tail = toMono(gunTail(src, { env, seed, length, stereo: false, darken: distance * 0.6 }));
  const pd = Math.round(Math.min(0.04, distance / 343 * 0.05) * sr); // a hint of pre-smear
  return mixBufs([{ buf: d, gainLin: direct }, { buf: tail, gainLin: reflections, atSample: pd }], { length: Math.max(d.length, tail.length + pd) / sr });
}

// ---------------------------------------------------------------------------------------------- echo & diffusion
/** Feedback delay with filters in the loop. length: total output seconds (default input + 6 repeats). */
export function echo(buf, { time = 0.25, feedback = 0.35, lp = 3500, hp = 150, mix = 0.35, pingpong = false, length } = {}) {
  const sr = buf.sampleRate, D = Math.max(1, Math.round(time * sr));
  const n = length !== undefined ? Math.round(length * sr) : buf.length + D * 6;
  const src = pingpong && buf.channels === 1 ? new Buf([buf.data[0], new Float32Array(buf.length)], sr) : buf;
  const ch = pingpong ? 2 : src.channels;
  const lpC = design('lp', lp, sr), hpC = design('hp', hp, sr);
  const lines = Array.from({ length: ch }, () => new Float32Array(n));
  const out = Buf.alloc(n, ch, sr);
  const st = Array.from({ length: ch }, () => ({ l1: 0, l2: 0, h1: 0, h2: 0 }));
  const bq = (c, s, x, k) => { const y = c.b0 * x + s[k + '1']; s[k + '1'] = c.b1 * x - c.a1 * y + s[k + '2']; s[k + '2'] = c.b2 * x - c.a2 * y; return y; };
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const x = i < src.length ? src.data[Math.min(c, src.channels - 1)][i] : 0;
      const fbSrc = pingpong ? lines[1 - c] : lines[c];
      const delayed = i >= D ? fbSrc[i - D] : 0;
      let y = bq(lpC, st[c], delayed, 'l');
      y = bq(hpC, st[c], y, 'h');
      lines[c][i] = (pingpong && c === 1 ? 0 : x) + y * feedback;
      out.data[c][i] = x + y * mix;
    }
  }
  return out;
}

/**
 * Mono-compatible stereo from a mono (or narrow) source: side = high-passed, allpass-diffused copy of the mid at
 * `width` (0..1). L = mid + side, R = mid - side, so the side cancels in a mono downmix (no comb filtering there).
 * Typical use: widen the local player's '_close' gun layer built from mono recordings (width 0.2-0.4, hp ~300 Hz keeps
 * the low end centred and punchy).
 */
export function stereoize(buf, { width = 0.3, hp = 300, seed = 'stereoize', stages = 5, maxMs = 9 } = {}) {
  const mid = toMono(buf);
  let side = diffuse(mid, { stages, minMs: 0.8, maxMs, g: 0.55, seed });
  side = eq(side, [{ type: 'hp', f: hp, order: 2 }]);
  const m = mid.data[0], s = side.data[0], n = m.length, L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { const v = s[i] * width; L[i] = m[i] + v; R[i] = m[i] - v; }
  return new Buf([L, R], buf.sampleRate);
}

/** Series allpass diffuser: smears transients into a dense cloud (useful before a reverb or on debris). */
export function diffuse(buf, { stages = 6, minMs = 1.2, maxMs = 14, g = 0.62, seed = 'diffuse' } = {}) {
  const r = makeRng(seed), sr = buf.sampleRate;
  const delays = Array.from({ length: stages }, (_, k) => Math.max(1, Math.round((minMs + (maxMs - minMs) * (k + r.next()) / stages) / 1000 * sr)));
  return new Buf(buf.data.map((x) => {
    let y = Float32Array.from(x);
    for (const D of delays) {
      const o = new Float32Array(y.length);
      for (let i = 0; i < y.length; i++) { const xd = i >= D ? y[i - D] : 0, yd = i >= D ? o[i - D] : 0; o[i] = -g * y[i] + xd + g * yd; }
      y = o;
    }
    return y;
  }), sr);
}

