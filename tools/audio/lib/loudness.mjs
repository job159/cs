// ITU-R BS.1770-4 / EBU R128 loudness metering and true-peak measurement.
//
//   lufs(buf)            integrated loudness (LUFS) with the -70 LUFS absolute and -10 LU relative gates.
//                        Sounds shorter than one 400 ms block are measured as ONE block over their actual duration
//                        ("integrated over the sound" — the right definition for one-shots like gunshots).
//   loudness(buf)        { integrated, momentaryMax, shortTermMax, lra }
//   truePeak(buf)        4x oversampled peak (linear); truePeakDb(buf) in dBTP
//
// Mono files are measured as a single channel (no +3 dB "dual mono" adjustment): WebAudio's equal-power panner
// plays a centred mono source at -3 dB per side, which lands at the same loudness as the mono measurement.
import { lin2db } from './buffer.mjs';

/** K-weighting filter coefficients for any sample rate (libebur128 formulation). */
export function kWeightCoefs(sr) {
  // stage 1: high shelf (+4 dB above ~1.7 kHz, head acoustics)
  let f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  let K = Math.tan(Math.PI * f0 / sr);
  const Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const s1 = { b0: (Vh + Vb * K / Q + K * K) / a0, b1: 2 * (K * K - Vh) / a0, b2: (Vh - Vb * K / Q + K * K) / a0, a1: 2 * (K * K - 1) / a0, a2: (1 - K / Q + K * K) / a0 };
  // stage 2: RLB high-pass (~38 Hz)
  f0 = 38.13547087602444; Q = 0.5003270373238773;
  K = Math.tan(Math.PI * f0 / sr);
  a0 = 1 + K / Q + K * K;
  const s2 = { b0: 1, b1: -2, b2: 1, a1: 2 * (K * K - 1) / a0, a2: (1 - K / Q + K * K) / a0 };
  return [s1, s2];
}

function biquadInto(x, c, out) {
  let z1 = 0, z2 = 0;
  const { b0, b1, b2, a1, a2 } = c;
  for (let i = 0; i < x.length; i++) { const xi = x[i], y = b0 * xi + z1; z1 = b1 * xi - a1 * y + z2; z2 = b2 * xi - a2 * y; out[i] = y; }
  return out;
}

const channelWeight = (c, n) => (n === 6 ? (c === 3 ? 0 : c >= 4 ? 1.41 : 1) : 1); // 5.1 (WAV order): LFE 0, surrounds 1.41
const maxOf = (a) => { let m = -Infinity; for (const v of a) if (v > m) m = v; return m; };

/**
 * Per-segment (10 ms) channel-weighted K-weighted energy sums. Memory-light: one filtered channel at a time.
 * Returns { seg: Float64Array (sum of squares per segment), segLen, n, sr, total }.
 */
function segmentEnergies(buf, segSec = 0.01) {
  const sr = buf.sampleRate, n = buf.length, segLen = Math.max(1, Math.round(segSec * sr));
  const nSeg = Math.ceil(n / segLen);
  const seg = new Float64Array(nSeg);
  const [s1, s2] = kWeightCoefs(sr);
  const tmp = new Float32Array(n);
  let total = 0;
  buf.data.forEach((d, c) => {
    const w = channelWeight(c, buf.channels);
    if (!w) return;
    biquadInto(d, s1, tmp);
    biquadInto(tmp, s2, tmp);
    for (let i = 0; i < n; i++) { const e = tmp[i] * tmp[i] * w; seg[(i / segLen) | 0] += e; total += e; }
  });
  return { seg, segLen, n, sr, total };
}

const toLufs = (meanSquare) => (meanSquare > 0 ? -0.691 + 10 * Math.log10(meanSquare) : -Infinity);

/** Full loudness report: integrated (gated), momentary max (400 ms), short-term max (3 s), LRA. */
export function loudness(buf) {
  if (!buf.length) return { integrated: -Infinity, momentaryMax: -Infinity, shortTermMax: -Infinity, lra: 0 };
  const { seg, segLen, n, sr, total } = segmentEnergies(buf);
  const blockSegs = Math.round(0.4 * sr / segLen); // 40 segments
  const nSeg = seg.length;
  // sliding sums over 400 ms windows with 10 ms hop
  const win = (len) => {
    const out = [];
    if (nSeg < len) return out;
    let s = 0;
    for (let i = 0; i < len; i++) s += seg[i];
    out.push(s);
    for (let i = len; i < nSeg; i++) { s += seg[i] - seg[i - len]; out.push(s); }
    return out;
  };
  const m = win(blockSegs);
  const blockSamples = blockSegs * segLen;
  let momentaryMax, integrated;
  if (!m.length) {
    // shorter than one block: whole-sound mean square for "integrated", zero-padded 400 ms window for momentary
    integrated = toLufs(total / n);
    momentaryMax = toLufs(total / Math.round(0.4 * sr));
  } else {
    momentaryMax = toLufs(maxOf(m) / blockSamples);
    // gated integrated: blocks with 75 % overlap (hop 100 ms = every 10th 10 ms window)
    const hop = Math.round(0.1 * sr / segLen);
    const blocks = [];
    for (let i = 0; i < m.length; i += hop) blocks.push(m[i] / blockSamples);
    const absG = blocks.filter((z) => toLufs(z) > -70);
    if (!absG.length) integrated = -Infinity;
    else {
      const rel = toLufs(absG.reduce((a, b) => a + b, 0) / absG.length) - 10;
      const g = absG.filter((z) => toLufs(z) > rel);
      integrated = toLufs(g.reduce((a, b) => a + b, 0) / g.length);
    }
  }
  // short-term (3 s) + LRA
  const stSegs = Math.round(3 * sr / segLen);
  const st = win(stSegs).map((s) => s / (stSegs * segLen));
  const shortTermMax = st.length ? toLufs(maxOf(st)) : momentaryMax;
  let lra = 0;
  if (st.length > 10) {
    const stHop = Math.round(0.1 * sr / segLen);
    const vals = [];
    for (let i = 0; i < st.length; i += stHop) vals.push(st[i]);
    const absG = vals.filter((z) => toLufs(z) > -70);
    if (absG.length) {
      const rel = toLufs(absG.reduce((a, b) => a + b, 0) / absG.length) - 20;
      const g = absG.filter((z) => toLufs(z) > rel).map(toLufs).sort((a, b) => a - b);
      if (g.length > 1) lra = g[Math.floor(0.95 * (g.length - 1))] - g[Math.floor(0.1 * (g.length - 1))];
    }
  }
  return { integrated, momentaryMax, shortTermMax, lra };
}

export const lufs = (buf) => loudness(buf).integrated;

// ---------------------------------------------------------------------------------------------- true peak
const TP_H = 8;            // taps each side
const TP_L = 4;            // oversampling factor
let tpCoefs = null;
function tpTable() {
  if (tpCoefs) return tpCoefs;
  const I0 = (x) => { let s = 1, t = 1; for (let k = 1; k < 40; k++) { t *= (x / (2 * k)) ** 2; s += t; } return s; };
  const beta = 7, i0b = I0(beta);
  tpCoefs = [];
  for (let p = 1; p < TP_L; p++) {
    const f = p / TP_L, c = new Float64Array(2 * TP_H);
    for (let j = -TP_H + 1; j <= TP_H; j++) {
      const u = j - f;
      const sinc = Math.sin(Math.PI * u) / (Math.PI * u);
      const r = u / (TP_H + 0.5);
      c[j + TP_H - 1] = sinc * I0(beta * Math.sqrt(Math.max(0, 1 - r * r))) / i0b;
    }
    tpCoefs.push(c);
  }
  return tpCoefs;
}

/**
 * Per-sample true-peak envelope: e[i] = max over channels of |x[i]| and the 3 interpolated points between i and i+1.
 * Used by the true-peak limiter.
 */
export function truePeakEnvelope(buf) {
  const C = tpTable(), n = buf.length, e = new Float32Array(n);
  for (const x of buf.data) {
    for (let i = 0; i < n; i++) {
      let m = Math.abs(x[i]);
      if (i + 1 < n) {
        for (let p = 0; p < C.length; p++) {
          const c = C[p];
          let acc = 0;
          const j0 = i - TP_H + 1;
          if (j0 >= 0 && i + TP_H < n) for (let k = 0; k < 2 * TP_H; k++) acc += x[j0 + k] * c[k];
          else for (let k = 0; k < 2 * TP_H; k++) { const j = j0 + k; if (j >= 0 && j < n) acc += x[j] * c[k]; }
          const a = Math.abs(acc);
          if (a > m) m = a;
        }
      }
      if (m > e[i]) e[i] = m;
    }
  }
  return e;
}

/** True peak (linear, 4x oversampled). */
export function truePeak(buf) {
  const e = truePeakEnvelope(buf);
  let m = 0;
  for (let i = 0; i < e.length; i++) if (e[i] > m) m = e[i];
  return m;
}
export const truePeakDb = (buf) => lin2db(truePeak(buf));
