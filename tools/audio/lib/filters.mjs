// Biquad EQ (RBJ cookbook), Butterworth cascades, Linkwitz-Riley band splitting, one-pole filters,
// time-varying (swept) filters and zero-phase filtering.
//
//   eq(buf, [{ type: 'hp', f: 40, order: 4 }, { type: 'peak', f: 180, gain: 3, q: 1 }, { type: 'highshelf', f: 6000, gain: -4 }])
//   splitBands(buf, [150, 2500]) -> [low, mid, high]   (LR4, sums back to an allpass of the input)
import { Buf } from './buffer.mjs';

const TAU = 2 * Math.PI;

/** RBJ biquad coefficient design. Returns normalized { b0, b1, b2, a1, a2 }. */
export function design(type, f, sampleRate, { q = Math.SQRT1_2, gain = 0, slope } = {}) {
  const nyq = sampleRate / 2;
  f = Math.min(Math.max(f, 1), nyq * 0.999);
  const w0 = TAU * f / sampleRate;
  const cw = Math.cos(w0), sw = Math.sin(w0);
  const A = Math.pow(10, gain / 40);
  let alpha = sw / (2 * q);
  if (slope !== undefined && (type === 'lowshelf' || type === 'highshelf')) {
    alpha = sw / 2 * Math.sqrt((A + 1 / A) * (1 / slope - 1) + 2);
  }
  let b0, b1, b2, a0, a1, a2;
  switch (type) {
    case 'lp': case 'lowpass':
      b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'hp': case 'highpass':
      b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'bp': case 'bandpass': // constant 0 dB peak gain
      b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'notch':
      b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'ap': case 'allpass':
      b0 = 1 - alpha; b1 = -2 * cw; b2 = 1 + alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'peak': case 'peaking': case 'bell':
      b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A; break;
    case 'lowshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) - (A - 1) * cw + s); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - s);
      a0 = (A + 1) + (A - 1) * cw + s; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - s; break;
    }
    case 'highshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) + (A - 1) * cw + s); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - s);
      a0 = (A + 1) - (A - 1) * cw + s; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - s; break;
    }
    default: throw new Error(`unknown biquad type '${type}'`);
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/** First-order sections (6 dB/oct) via bilinear transform. */
export function design1(type, f, sampleRate) {
  const k = Math.tan(Math.PI * Math.min(f, sampleRate * 0.4999) / sampleRate);
  if (type === 'lp1') return { b0: k / (1 + k), b1: k / (1 + k), b2: 0, a1: (k - 1) / (1 + k), a2: 0 };
  if (type === 'hp1') return { b0: 1 / (1 + k), b1: -1 / (1 + k), b2: 0, a1: (k - 1) / (1 + k), a2: 0 };
  throw new Error(`unknown first-order type ${type}`);
}

/** Run one biquad over a Float32Array (transposed direct form II, double precision state). */
export function runBiquad(x, c, out = new Float32Array(x.length)) {
  const { b0, b1, b2, a1, a2 } = c;
  let z1 = 0, z2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i];
    const y = b0 * xi + z1;
    z1 = b1 * xi - a1 * y + z2;
    z2 = b2 * xi - a2 * y;
    out[i] = y;
  }
  return out;
}

/** Butterworth Q values for an order-N cascade (N even -> N/2 biquads; odd -> plus one first-order). */
export function butterworthQs(order) {
  const qs = [];
  for (let k = 0; k < Math.floor(order / 2); k++) qs.push(1 / (2 * Math.cos(Math.PI * (2 * k + 1) / (2 * order))));
  return qs;
}

/** Expand a band spec into a list of coefficient sets. */
export function sections(spec, sampleRate) {
  const t = spec.type;
  if ((t === 'hp' || t === 'lp' || t === 'highpass' || t === 'lowpass') && spec.order && spec.order !== 2) {
    const base = t.startsWith('h') ? 'hp' : 'lp';
    const out = butterworthQs(spec.order).map((q) => design(base, spec.f, sampleRate, { q }));
    if (spec.order % 2) out.push(design1(base + '1', spec.f, sampleRate));
    return out;
  }
  if (t === 'hp1' || t === 'lp1') return [design1(t, spec.f, sampleRate)];
  if (t === 'lr4lp' || t === 'lr4hp') {
    const c = design(t === 'lr4lp' ? 'lp' : 'hp', spec.f, sampleRate, { q: Math.SQRT1_2 });
    return [c, c];
  }
  if (t === 'tilt') { // +gain/2 above f, -gain/2 below f (first-order-ish shelves)
    const g = spec.gain || 0;
    return [design('lowshelf', spec.f, sampleRate, { gain: -g / 2, slope: 0.5 }), design('highshelf', spec.f, sampleRate, { gain: g / 2, slope: 0.5 })];
  }
  return [design(t, spec.f, sampleRate, { q: spec.q ?? Math.SQRT1_2, gain: spec.gain ?? 0, slope: spec.slope })];
}

/**
 * Apply an EQ chain. specs: single spec or array. Spec fields:
 *   type: hp|lp|bp|notch|ap|peak|lowshelf|highshelf|hp1|lp1|lr4lp|lr4hp|tilt
 *   f (Hz), q, gain (dB), order (Butterworth order for hp/lp; default 2), slope (shelves), mix (0..1 wet)
 */
export function eq(buf, specs, { zeroPhase = false } = {}) {
  specs = Array.isArray(specs) ? specs : [specs];
  const secs = [];
  for (const s of specs) secs.push({ list: sections(s, buf.sampleRate), mix: s.mix ?? 1 });
  return new Buf(buf.data.map((d) => {
    let cur = d;
    for (const { list, mix } of secs) {
      let y = cur;
      for (const c of list) y = zeroPhase ? filtfiltArr(y, c) : runBiquad(y, c);
      if (mix < 1) { const m = new Float32Array(y.length); for (let i = 0; i < y.length; i++) m[i] = cur[i] + (y[i] - cur[i]) * mix; y = m; }
      cur = y;
    }
    return cur === d ? d.slice() : cur;
  }), buf.sampleRate);
}

export const hp = (buf, f, order = 2) => eq(buf, { type: 'hp', f, order });
export const lp = (buf, f, order = 2) => eq(buf, { type: 'lp', f, order });
export const bp = (buf, f, q = 1) => eq(buf, { type: 'bp', f, q });
export const peakEq = (buf, f, gain, q = 1) => eq(buf, { type: 'peak', f, gain, q });
export const lowShelf = (buf, f, gain, q = Math.SQRT1_2) => eq(buf, { type: 'lowshelf', f, gain, q });
export const highShelf = (buf, f, gain, q = Math.SQRT1_2) => eq(buf, { type: 'highshelf', f, gain, q });

function filtfiltArr(x, c) {
  const y = runBiquad(x, c);
  y.reverse();
  const z = runBiquad(y, c);
  return z.reverse();
}

/** Zero-phase (forward-backward) EQ: doubles the slope, no phase shift. Good for envelopes and pre-ringing-free tone shaping. */
export function filtfilt(buf, specs) { return eq(buf, specs, { zeroPhase: true }); }

/**
 * Linkwitz-Riley (LR4) multi-band split. Returns bands low->high; summing them gives the input through
 * a cascade of 2nd-order allpasses (flat magnitude), so per-band processing can be recombined cleanly.
 */
export function splitBands(buf, crossovers) {
  const xs = [...crossovers].sort((a, b) => a - b);
  const sr = buf.sampleRate;
  const bands = [];
  let rest = buf.data;
  for (let k = 0; k < xs.length; k++) {
    const lpc = design('lp', xs[k], sr, { q: Math.SQRT1_2 });
    const hpc = design('hp', xs[k], sr, { q: Math.SQRT1_2 });
    let low = rest.map((d) => runBiquad(runBiquad(d, lpc), lpc));
    const high = rest.map((d) => runBiquad(runBiquad(d, hpc), hpc));
    // phase-compensate the low band for the higher crossovers still to come
    for (let j = k + 1; j < xs.length; j++) {
      const apc = design('ap', xs[j], sr, { q: Math.SQRT1_2 });
      low = low.map((d) => runBiquad(d, apc));
    }
    bands.push(new Buf(low, sr));
    rest = high;
  }
  bands.push(new Buf(rest.map((d) => d.slice()), sr));
  return bands;
}

/** One-pole smoother coefficient for a time constant in seconds. */
export const onePoleCoef = (tau, sampleRate) => (tau <= 0 ? 0 : Math.exp(-1 / (tau * sampleRate)));

/**
 * Time-varying biquad: freq(t) and optional q(t)/gain(t) as numbers or functions of time (s) or breakpoint
 * arrays [[t, value], ...]. Coefficients are recomputed every `block` samples. Great for synth sweeps and whooshes.
 */
export function sweep(buf, type, freq, { q = Math.SQRT1_2, gain = 0, block = 16 } = {}) {
  const sr = buf.sampleRate;
  const F = toFn(freq), Q = toFn(q), G = toFn(gain);
  return new Buf(buf.data.map((x) => {
    const out = new Float32Array(x.length);
    let z1 = 0, z2 = 0, c = null;
    for (let i = 0; i < x.length; i++) {
      if (i % block === 0) { const t = i / sr; c = design(type, F(t), sr, { q: Q(t), gain: G(t) }); }
      const xi = x[i];
      const y = c.b0 * xi + z1;
      z1 = c.b1 * xi - c.a1 * y + z2;
      z2 = c.b2 * xi - c.a2 * y;
      out[i] = y;
    }
    return out;
  }), sr);
}

/** Turn a number | fn(t) | [[t, v], ...] breakpoints (linear interpolation) into fn(t). */
export function toFn(v) {
  if (typeof v === 'function') return v;
  if (Array.isArray(v)) {
    const pts = v;
    return (t) => {
      if (t <= pts[0][0]) return pts[0][1];
      for (let i = 1; i < pts.length; i++) {
        if (t <= pts[i][0]) { const [t0, v0] = pts[i - 1], [t1, v1] = pts[i]; return v0 + (v1 - v0) * (t - t0) / Math.max(t1 - t0, 1e-12); }
      }
      return pts[pts.length - 1][1];
    };
  }
  return () => v;
}

/** Magnitude response (dB) of a spec chain at frequency f — handy for tests and docs. */
export function responseDb(specs, f, sampleRate) {
  specs = Array.isArray(specs) ? specs : [specs];
  const w = TAU * f / sampleRate;
  let mag = 1;
  for (const s of specs) for (const c of sections(s, sampleRate)) {
    const nr = c.b0 + c.b1 * Math.cos(w) + c.b2 * Math.cos(2 * w), ni = -(c.b1 * Math.sin(w) + c.b2 * Math.sin(2 * w));
    const dr = 1 + c.a1 * Math.cos(w) + c.a2 * Math.cos(2 * w), di = -(c.a1 * Math.sin(w) + c.a2 * Math.sin(2 * w));
    mag *= Math.hypot(nr, ni) / Math.hypot(dr, di);
  }
  return 20 * Math.log10(mag);
}
