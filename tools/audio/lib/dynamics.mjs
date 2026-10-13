// Dynamics + non-linear processing: true-peak lookahead limiter, compressor, gate, (multiband) transient shaper,
// oversampled saturation / soft & hard clipping, psycho-acoustic bass enhancer and exciter.
//
// Gunshot recipe from research 03 §4.12: clip the transient FIRST (hard/soft clip, oversampled), THEN limit —
// it keeps the attack sharp instead of letting a limiter duck the whole crack.
import { Buf, db2lin, lin2db, clamp } from './buffer.mjs';
import { splitBands, eq, runBiquad, design } from './filters.mjs';
import { upsampleArray, downsampleArray } from './resample.mjs';
import { truePeakEnvelope, truePeak } from './loudness.mjs';

const coef = (sec, sr) => (sec > 0 ? Math.exp(-1 / (sec * sr)) : 0);

/** Sliding minimum over a forward window [i, i+L) (monotonic deque, O(n)). */
function forwardMin(x, L) {
  const n = x.length, out = new Float32Array(n), dq = new Int32Array(n + L + 1);
  let h = 0, t = 0;
  // process indices from the end so window [i, i+L) is available
  for (let i = n - 1; i >= 0; i--) {
    while (t > h && x[dq[t - 1]] >= x[i]) t--;
    dq[t++] = i;
    while (dq[h] >= i + L) h++;
    out[i] = x[dq[h]];
  }
  return out;
}

/**
 * Lookahead brickwall limiter (linked channels). ceiling in dBFS; truePeak=true detects inter-sample peaks
 * (4x oversampled) so the result stays below `ceiling` dBTP. attack = lookahead time (s), release (s).
 * Re-checks and tightens up to 3 times so the output is guaranteed under the ceiling.
 */
export function limit(buf, { ceiling = -1, attack = 0.0015, release = 0.06, truePeak: tp = true, knee = 0 } = {}) {
  const sr = buf.sampleRate, n = buf.length;
  const limitLin = db2lin(ceiling) * (1 + 1e-5); // pass/fail check always uses the requested ceiling
  let ceil = db2lin(ceiling);                     // processing target (tightened slightly on extra passes)
  let cur = buf;
  for (let pass = 0; pass < 4; pass++) {
    const env = tp ? truePeakEnvelope(cur) : (() => { const e = new Float32Array(n); for (const d of cur.data) for (let i = 0; i < n; i++) { const a = Math.abs(d[i]); if (a > e[i]) e[i] = a; } return e; })();
    let over = false;
    for (let i = 0; i < n; i++) if (env[i] > limitLin) { over = true; break; }
    if (!over) return cur;
    const L = Math.max(1, Math.round(attack * sr));
    const req = new Float32Array(n);
    const kneeLin = knee > 0 ? db2lin(-knee) * ceil : ceil;
    for (let i = 0; i < n; i++) {
      const e = env[i];
      req[i] = e > kneeLin ? Math.min(1, ceil / e) : 1;
    }
    const m0 = forwardMin(req, L + 1);
    // hold the reduction for the true-peak interpolator's reach after each peak, so the gain is flat across the
    // samples that shape an inter-sample peak (otherwise the release re-creates small overs)
    const H = tp ? 8 : 0, m = new Float32Array(n);
    for (let i = 0; i < n; i++) { let v = m0[i]; for (let j = Math.max(0, i - H); j < i; j++) if (m0[j] < v) v = m0[j]; m[i] = v; }
    // release smoothing (instant attack on the min-held curve)
    const rc = coef(release, sr);
    const r = new Float32Array(n);
    let g = 1;
    for (let i = 0; i < n; i++) { g = Math.min(m[i], 1 - (1 - g) * rc); r[i] = g; }
    // boxcar over L samples (backward) -> linear attack ramp that always reaches the required gain in time
    const s = new Float32Array(n);
    let acc = 0;
    for (let i = 0; i < n; i++) { acc += r[i]; if (i >= L) acc -= r[i - L]; s[i] = acc / Math.min(i + 1, L); }
    cur = new Buf(cur.data.map((d) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = d[i] * s[i]; return o; }), sr);
    ceil *= pass < 2 ? 0.998 : 0.99; // tighten slightly if another pass is needed
  }
  // last resort: static trim
  const p = tp ? truePeak(cur) : cur.data.reduce((m, d) => d.reduce((q, v) => Math.max(q, Math.abs(v)), m), 0);
  return p > db2lin(ceiling) ? new Buf(cur.data.map((d) => d.map((v) => v * db2lin(ceiling) / p)), sr) : cur;
}

/**
 * Feed-forward compressor (linked). threshold dBFS, ratio, attack/release (s), knee (dB), makeup (dB),
 * detector 'peak' | 'rms', lookahead (s), mix (0..1, parallel compression), sidechain (Buf to drive detection).
 */
export function compress(buf, { threshold = -18, ratio = 4, attack = 0.005, release = 0.08, knee = 6, makeup = 0, detector = 'peak', lookahead = 0, mix = 1, sidechain = null, rmsWindow = 0.01 } = {}) {
  const sr = buf.sampleRate, n = buf.length;
  const sc = sidechain || buf;
  const det = new Float32Array(n);
  if (detector === 'rms') {
    const a = coef(rmsWindow, sr);
    let s = 0;
    for (let i = 0; i < n; i++) { let x = 0; for (const d of sc.data) { const v = (d[i] || 0) * (d[i] || 0); if (v > x) x = v; } s = a * s + (1 - a) * x; det[i] = Math.sqrt(s); }
  } else for (let i = 0; i < n; i++) { let x = 0; for (const d of sc.data) { const v = Math.abs(d[i] || 0); if (v > x) x = v; } det[i] = x; }
  const ac = coef(attack, sr), rc = coef(release, sr);
  const la = Math.round(lookahead * sr);
  const gains = new Float32Array(n);
  let gs = 0; // smoothed gain reduction in dB (<= 0)
  for (let i = 0; i < n; i++) {
    const xi = det[Math.min(n - 1, i + la)];
    const x = lin2db(xi);
    let y;
    const over = x - threshold;
    if (2 * over < -knee) y = x;
    else if (knee > 0 && 2 * Math.abs(over) <= knee) y = x + (1 / ratio - 1) * (over + knee / 2) ** 2 / (2 * knee);
    else y = threshold + over / ratio;
    const gr = y - x; // <= 0
    gs = gr < gs ? ac * gs + (1 - ac) * gr : rc * gs + (1 - rc) * gr;
    gains[i] = db2lin(gs + makeup);
  }
  return new Buf(buf.data.map((d) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = d[i] * (mix * gains[i] + (1 - mix) * 1); return o; }), sr);
}

/** Noise gate / downward expander. range: attenuation (dB) when closed. */
export function gate(buf, { threshold = -50, attack = 0.001, hold = 0.02, release = 0.08, range = -80 } = {}) {
  const sr = buf.sampleRate, n = buf.length, th = db2lin(threshold), floor = db2lin(range);
  const ac = coef(attack, sr), rc = coef(release, sr), holdN = Math.round(hold * sr);
  let g = 0, h = 0;
  const gains = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let x = 0; for (const d of buf.data) { const v = Math.abs(d[i]); if (v > x) x = v; }
    let target;
    if (x > th) { target = 1; h = holdN; } else if (h > 0) { target = 1; h--; } else target = floor;
    g = target > g ? ac * g + (1 - ac) * target : rc * g + (1 - rc) * target;
    gains[i] = g;
  }
  return new Buf(buf.data.map((d) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = d[i] * gains[i]; return o; }), sr);
}

// ---------------------------------------------------------------------------------------------- transient shaper
function shapeGains(det, sr, { attack = 0, sustain = 0, fast = 0.0007, slow = 0.02, release = 0.12, sustainFast = 0.03, sustainSlow = 0.25, sensitivity = 1, maxDb = 18 }) {
  const n = det.length, g = new Float32Array(n);
  const af = coef(fast, sr), as = coef(slow, sr), r = coef(release, sr);
  const a1 = coef(0.0005, sr), rf = coef(sustainFast, sr), rs = coef(sustainSlow, sr);
  let ef = 0, es = 0, sf = 0, ss = 0, gs = 0;
  const sm = coef(0.0004, sr);
  for (let i = 0; i < n; i++) {
    const x = det[i];
    ef = x > ef ? af * ef + (1 - af) * x : r * ef + (1 - r) * x;
    es = x > es ? as * es + (1 - as) * x : r * es + (1 - r) * x;
    sf = x > sf ? a1 * sf + (1 - a1) * x : rf * sf + (1 - rf) * x;
    ss = x > ss ? a1 * ss + (1 - a1) * x : rs * ss + (1 - rs) * x;
    const tr = clamp((lin2db(ef + 1e-9) - lin2db(es + 1e-9)) * sensitivity / 12, 0, 1);
    const su = clamp((lin2db(ss + 1e-9) - lin2db(sf + 1e-9)) * sensitivity / 12, 0, 1);
    const gdb = clamp(attack * tr + sustain * su, -maxDb, maxDb);
    gs = sm * gs + (1 - sm) * gdb;
    g[i] = db2lin(gs);
  }
  return g;
}

/**
 * Transient shaper. attack / sustain in dB (+ = emphasise). Optional multiband:
 *   transientShaper(buf, { bands: [200, 3000], perBand: [{ attack: 2, sustain: -4 }, { attack: 6 }, { attack: 3, sustain: -6 }] })
 * Single band: transientShaper(buf, { attack: 6, sustain: -3 }).
 */
export function transientShaper(buf, opts = {}) {
  const sr = buf.sampleRate;
  const shapeOne = (b, p) => {
    const n = b.length, det = new Float32Array(n);
    for (const d of b.data) for (let i = 0; i < n; i++) { const a = Math.abs(d[i]); if (a > det[i]) det[i] = a; }
    const g = shapeGains(det, sr, { ...opts, ...p });
    return new Buf(b.data.map((d) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = d[i] * g[i]; return o; }), sr);
  };
  if (!opts.bands) return shapeOne(buf, {});
  const bands = splitBands(buf, opts.bands);
  const shaped = bands.map((b, k) => shapeOne(b, (opts.perBand || [])[k] || {}));
  const n = buf.length;
  return new Buf(buf.data.map((_, c) => { const o = new Float32Array(n); for (const b of shaped) { const d = b.data[c]; for (let i = 0; i < n; i++) o[i] += d[i]; } return o; }), sr);
}

// ---------------------------------------------------------------------------------------------- saturation
const SHAPERS = {
  tanh: Math.tanh,
  atan: (x) => (2 / Math.PI) * Math.atan(x * Math.PI / 2),
  soft: (x) => (x > 1 ? 1 : x < -1 ? -1 : 1.5 * x - 0.5 * x * x * x), // cubic soft clip
  hard: (x) => (x > 1 ? 1 : x < -1 ? -1 : x),
  tube: (x) => Math.tanh(x) + 0.18 * (x * x) / (1 + x * x),         // asymmetric -> even harmonics (DC removed after)
  fold: (x) => Math.sin(x * Math.PI / 2),                             // wavefolder
  diode: (x) => (x >= 0 ? 1 - Math.exp(-x) : -0.6 * (1 - Math.exp(x / 0.6))),
};

/**
 * Oversampled waveshaper. drive (dB), type: tanh|atan|soft|hard|tube|fold|diode, mix (0..1), bias (for asymmetry),
 * os: oversampling factor (1/2/4), compensate: rescale so a full-scale input keeps ~ full-scale output, outDb.
 */
export function saturate(buf, { drive = 6, type = 'tanh', mix = 1, bias = 0, os = 4, compensate = true, outDb = 0 } = {}) {
  const f = typeof type === 'function' ? type : SHAPERS[type];
  if (!f) throw new Error(`saturate: unknown type ${type}`);
  const k = db2lin(drive), off = f(bias);
  const norm = compensate ? 1 / Math.max(1e-6, Math.abs(f(k + bias) - off)) : 1;
  const out = db2lin(outDb);
  const dcNeeded = bias !== 0 || type === 'tube' || type === 'diode';
  const hpC = dcNeeded ? design('hp', 8, buf.sampleRate) : null;
  return new Buf(buf.data.map((d) => {
    const u = upsampleArray(d, os);
    for (let i = 0; i < u.length; i++) u[i] = (f(u[i] * k + bias) - off) * norm;
    let w = downsampleArray(u, os);
    if (w.length !== d.length) { const t = new Float32Array(d.length); t.set(w.subarray(0, d.length)); w = t; }
    if (hpC) w = runBiquad(w, hpC);
    const o = new Float32Array(d.length);
    for (let i = 0; i < d.length; i++) o[i] = (d[i] * (1 - mix) + w[i] * mix) * out;
    return o;
  }), buf.sampleRate);
}

/**
 * Oversampled hard clip at `ceiling` dBFS (shaves the very first transient spikes before limiting).
 * Band-limiting the clipped signal back to 48 kHz re-creates some overshoot (Gibbs; ~1-3 dB on full-band noise,
 * less on real recordings) — that is expected: the true-peak limiter in finalize()/normalizeLufs() takes it.
 * strict: true adds a final sample-domain clamp (guaranteed sample peak <= ceiling, a little aliasing on the residue).
 */
export function hardClip(buf, ceiling = -1, os = 4, { strict = false } = {}) {
  const c = db2lin(ceiling);
  return new Buf(buf.data.map((d) => {
    const u = upsampleArray(d, os);
    for (let i = 0; i < u.length; i++) u[i] = u[i] > c ? c : u[i] < -c ? -c : u[i];
    const w = downsampleArray(u, os);
    const o = new Float32Array(d.length); o.set(w.subarray(0, d.length));
    if (strict) for (let i = 0; i < o.length; i++) o[i] = o[i] > c ? c : o[i] < -c ? -c : o[i];
    return o;
  }), buf.sampleRate);
}

/** Soft clipper: linear below `threshold` dBFS, smooth knee up to `ceiling` dBFS (oversampled; see hardClip on overshoot). */
export function softClip(buf, { threshold = -6, ceiling = -0.3, os = 4, strict = false } = {}) {
  const t = db2lin(threshold), c = db2lin(ceiling), span = c - t;
  const fn = (x) => { const a = Math.abs(x); if (a <= t) return x; const y = t + span * Math.tanh((a - t) / span); return x < 0 ? -y : y; };
  return new Buf(buf.data.map((d) => {
    const u = upsampleArray(d, os);
    for (let i = 0; i < u.length; i++) u[i] = fn(u[i]);
    const w = downsampleArray(u, os);
    const o = new Float32Array(d.length); o.set(w.subarray(0, d.length));
    if (strict) for (let i = 0; i < o.length; i++) o[i] = fn(o[i]);
    return o;
  }), buf.sampleRate);
}

/**
 * Psycho-acoustic bass ("phone speakers can't play < 120 Hz — imply it with harmonics", research 03 §4.12).
 * Isolates the band below `freq`, saturates it hard to create 2nd/3rd/4th harmonics, keeps only the harmonics
 * (band-pass `hp`..`lp`) and mixes them back in at `amount` dB relative to the low band.
 */
export function psychoBass(buf, { freq = 110, drive = 18, amount = -4, hp, lp = 600, type = 'tube', keepSub = true } = {}) {
  const sr = buf.sampleRate;
  const low = eq(buf, [{ type: 'lp', f: freq, order: 4 }]);
  let h = saturate(low, { drive, type, os: 2 });
  h = eq(h, [{ type: 'hp', f: hp ?? freq * 1.15, order: 4 }, { type: 'lp', f: lp, order: 2 }]);
  // level harmonics relative to the low band's RMS
  const r = (b) => { let s = 0, n = 0; for (const d of b.data) { for (let i = 0; i < d.length; i++) s += d[i] * d[i]; n += d.length; } return Math.sqrt(s / Math.max(1, n)); };
  const k = r(low) > 0 && r(h) > 0 ? (r(low) / r(h)) * db2lin(amount) : 0;
  const base = keepSub ? buf : eq(buf, [{ type: 'hp', f: freq * 0.6, order: 2 }]);
  return new Buf(base.data.map((d, c) => { const o = new Float32Array(d.length); const hd = h.data[c]; for (let i = 0; i < d.length; i++) o[i] = d[i] + hd[i] * k; return o; }), sr);
}

/** High-frequency exciter: saturate the band above `freq` and blend it in (adds 'crack' / air). */
export function exciter(buf, { freq = 3000, drive = 12, amount = -10, type = 'tanh' } = {}) {
  const hi = eq(buf, [{ type: 'hp', f: freq, order: 2 }]);
  let h = saturate(hi, { drive, type, os: 4 });
  h = eq(h, [{ type: 'hp', f: freq, order: 2 }]);
  const k = db2lin(amount);
  return new Buf(buf.data.map((d, c) => { const o = new Float32Array(d.length); const hd = h.data[c]; for (let i = 0; i < d.length; i++) o[i] = d[i] + hd[i] * k; return o; }), buf.sampleRate);
}
