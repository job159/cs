// Measurement + inspection: measure() report (peak, true peak, LUFS, duration, DC, crest factor, spectrum balance,
// edge/click levels...), checkTarget() QA against a loudness target, spectrogram PNG renderer (pngjs) with a
// waveform strip and a tiny built-in pixel font so the PNG is self-describing.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { lin2db, db2lin, peak as peakLin } from './buffer.mjs';
import { fft, hann } from './fft.mjs';
import { loudness, truePeak } from './loudness.mjs';
import { stereoCorrelation } from './edit.mjs';

const round = (x, d = 2) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : x === -Infinity ? -999 : x);

function monoOf(buf) {
  if (buf.channels === 1) return buf.data[0];
  const n = buf.length, o = new Float32Array(n), k = 1 / buf.channels;
  for (const d of buf.data) for (let i = 0; i < n; i++) o[i] += d[i] * k;
  return o;
}

/** Average power spectrum (Welch). Returns { freqs, power } with at most maxFrames frames analysed. */
export function averageSpectrum(buf, { size = 4096, maxFrames = 400 } = {}) {
  const x = monoOf(buf), n = x.length, w = hann(size);
  const p = new Float64Array(size / 2 + 1);
  const hop = size / 2;
  const total = Math.max(1, Math.floor((n - size) / hop) + 1);
  const step = Math.max(1, Math.ceil(total / maxFrames));
  const re = new Float64Array(size), im = new Float64Array(size);
  let frames = 0;
  for (let f = 0; f < total; f += step) {
    const o = f * hop;
    for (let i = 0; i < size; i++) { re[i] = (x[o + i] || 0) * w[i]; im[i] = 0; }
    fft(re, im);
    for (let k = 0; k <= size / 2; k++) p[k] += re[k] * re[k] + im[k] * im[k];
    frames++;
  }
  for (let k = 0; k < p.length; k++) p[k] /= Math.max(1, frames);
  const freqs = Float64Array.from({ length: p.length }, (_, k) => k * buf.sampleRate / size);
  return { freqs, power: p };
}

const BANDS = [['sub', 20, 60], ['low', 60, 150], ['lowMid', 150, 600], ['mid', 600, 3000], ['high', 3000, 8000], ['air', 8000, 24000]];

/**
 * Measure a buffer. Returns:
 *   duration, channels, sampleRate, peakDb, truePeakDb, lufs, momentaryMaxLufs, shortTermMaxLufs, lra, rmsDb, crestDb,
 *   dcDb (largest channel mean), clipped (samples >= 0.9999), startDb / endDb (first/last sample level -> clicks),
 *   headMs / tailMs (silence before/after the -60 dB-below-peak region), attackMs (first -40 dB point to peak),
 *   centroidHz, bandsDb { sub, low, lowMid, mid, high, air } (share of energy in dB), stereoCorr
 */
export function measure(buf, { spectrum = true } = {}) {
  const sr = buf.sampleRate, n = buf.length;
  const pk = peakLin(buf);
  let sumSq = 0, clipped = 0, dcMax = 0, peakIdx = 0, pv = 0;
  for (const d of buf.data) {
    let s = 0;
    for (let i = 0; i < n; i++) { const v = d[i]; s += v; sumSq += v * v; const a = Math.abs(v); if (a >= 0.9999) clipped++; if (a > pv) { pv = a; peakIdx = i; } }
    dcMax = Math.max(dcMax, Math.abs(s / Math.max(1, n)));
  }
  const rmsLin = Math.sqrt(sumSq / Math.max(1, n * buf.channels));
  const L = loudness(buf);
  const tp = truePeak(buf);
  // edges / silence
  let a0 = 0, a1 = 0;
  for (const d of buf.data) { a0 = Math.max(a0, Math.abs(d[0] || 0)); a1 = Math.max(a1, Math.abs(d[n - 1] || 0)); }
  const th60 = pk * db2lin(-60), th40 = pk * db2lin(-40);
  let first60 = n, last60 = 0, first40 = n;
  for (const d of buf.data) {
    for (let i = 0; i < n; i++) if (Math.abs(d[i]) > th60) { first60 = Math.min(first60, i); break; }
    for (let i = 0; i < n; i++) if (Math.abs(d[i]) > th40) { first40 = Math.min(first40, i); break; }
    for (let i = n - 1; i >= 0; i--) if (Math.abs(d[i]) > th60) { last60 = Math.max(last60, i); break; }
  }
  const out = {
    duration: round(n / sr, 4), channels: buf.channels, sampleRate: sr,
    peakDb: round(lin2db(pk)), truePeakDb: round(lin2db(tp)),
    lufs: round(L.integrated), momentaryMaxLufs: round(L.momentaryMax), shortTermMaxLufs: round(L.shortTermMax), lra: round(L.lra, 1),
    rmsDb: round(lin2db(rmsLin)), crestDb: round(lin2db(pk) - lin2db(rmsLin)),
    dcDb: round(lin2db(dcMax)), clipped,
    startDb: round(lin2db(a0)), endDb: round(lin2db(a1)),
    headMs: pk > 0 ? round(first60 / sr * 1000, 1) : 0, tailMs: pk > 0 ? round((n - 1 - last60) / sr * 1000, 1) : 0,
    attackMs: pk > 0 ? round(Math.max(0, peakIdx - first40) / sr * 1000, 2) : 0,
    stereoCorr: round(stereoCorrelation(buf), 3),
  };
  if (spectrum && n > 0) {
    const { freqs, power } = averageSpectrum(buf);
    let num = 0, den = 0;
    const bands = Object.fromEntries(BANDS.map(([k]) => [k, 0]));
    for (let k = 1; k < power.length; k++) {
      num += freqs[k] * power[k]; den += power[k];
      for (const [name, lo, hi] of BANDS) if (freqs[k] >= lo && freqs[k] < hi) bands[name] += power[k];
    }
    out.centroidHz = den > 0 ? Math.round(num / den) : 0;
    out.bandsDb = Object.fromEntries(Object.entries(bands).map(([k, v]) => [k, round(10 * Math.log10(den > 0 ? Math.max(v / den, 1e-12) : 1e-12), 1)]));
  }
  return out;
}

/** One-line human summary of a measure() result. */
export function formatMeasure(m) {
  return `${m.duration.toFixed(3)}s ${m.channels}ch  ${m.lufs.toFixed(1)} LUFS (M ${m.momentaryMaxLufs.toFixed(1)})  TP ${m.truePeakDb.toFixed(1)}  crest ${m.crestDb.toFixed(1)}  DC ${m.dcDb.toFixed(0)}  centroid ${m.centroidHz ?? '-'}Hz`;
}

/**
 * QA a measurement. target: { lufs, tolerance = 1, truePeak = -1, loop = false, maxDcDb = -50, edgeDb = -45,
 * maxHeadMs = 15 (one-shots must start promptly), maxDuration }. Returns an array of issue strings (empty = OK).
 */
export function checkTarget(m, { lufs, tolerance = 1, truePeak = -1, loop = false, maxDcDb = -50, edgeDb = -45, maxHeadMs = 15, maxDuration } = {}) {
  const issues = [];
  if (lufs !== undefined && Math.abs(m.lufs - lufs) > tolerance) issues.push(`loudness ${m.lufs} LUFS (target ${lufs} ±${tolerance})`);
  if (m.truePeakDb > truePeak + 0.05) issues.push(`true peak ${m.truePeakDb} dBTP > ${truePeak}`);
  if (m.clipped > 0) issues.push(`${m.clipped} clipped samples`);
  if (m.dcDb > maxDcDb) issues.push(`DC offset ${m.dcDb} dB`);
  if (!loop) {
    if (m.startDb > edgeDb) issues.push(`starts at ${m.startDb} dBFS (click risk: fade in)`);
    if (m.endDb > edgeDb) issues.push(`ends at ${m.endDb} dBFS (click risk: fade out)`);
    if (m.headMs > maxHeadMs) issues.push(`${m.headMs} ms of leading silence (trim)`);
  }
  if (maxDuration && m.duration > maxDuration) issues.push(`duration ${m.duration}s > ${maxDuration}s`);
  return issues;
}

// ---------------------------------------------------------------------------------------------- tiny pixel font (3x5)
const GLYPHS = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001',
  '5': '111100111001111', '6': '111100111101111', '7': '111001001001001', '8': '111101111101111', '9': '111101111001111',
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', '-': '000000111000000', '.': '000000000000010', ':': '000010000010000', '/': '001001010100100',
  _: '000000000000111', '+': '000010111010000', '(': '010100100100010', ')': '010001001001010', '%': '101001010100101',
  ' ': '000000000000000', '=': '000111000111000', ',': '000000000010100', '[': '110100100100110', ']': '011001001001011',
  '|': '010010010010010', '#': '101111101111101', '>': '100010001010100', '<': '001010100010001', '~': '000011110000000',
};

function drawText(png, x, y, text, rgb = [230, 230, 230], scale = 2) {
  let cx = x;
  for (const ch of String(text).toUpperCase()) {
    const g = GLYPHS[ch] ?? GLYPHS['#'];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g[r * 3 + c] === '1') {
      for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) setPx(png, cx + c * scale + sx, y + r * scale + sy, rgb);
    }
    cx += 4 * scale;
  }
  return cx;
}
function setPx(png, x, y, [r, g, b], a = 255) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const i = (y * png.width + x) << 2;
  png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = a;
}

// inferno-like colour map
const CMAP = [[0, 0, 0, 4], [0.15, 31, 12, 72], [0.3, 85, 15, 109], [0.45, 136, 34, 106], [0.6, 186, 54, 85], [0.72, 227, 89, 51], [0.85, 249, 140, 10], [0.95, 249, 201, 50], [1, 252, 255, 164]];
function cmap(t) {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  for (let i = 1; i < CMAP.length; i++) if (t <= CMAP[i][0]) {
    const [t0, r0, g0, b0] = CMAP[i - 1], [t1, r1, g1, b1] = CMAP[i], k = (t - t0) / (t1 - t0);
    return [r0 + (r1 - r0) * k, g0 + (g1 - g0) * k, b0 + (b1 - b0) * k];
  }
  return CMAP[CMAP.length - 1].slice(1);
}

/**
 * Render a spectrogram + waveform PNG.
 * opts: { title, width (px, default scales with duration 600..1600), height (spectrogram px, 260), fftSize (2048),
 *         minDb (-100), maxDb (0), minHz (20), maxHz (sr/2), measure (precomputed measure() to print) }
 */
export function spectrogram(buf, file, { title = path.basename(file, '.png'), width, height = 260, fftSize = 2048, minDb = -100, maxDb = 0, minHz = 20, maxHz, measure: m } = {}) {
  const sr = buf.sampleRate, x = monoOf(buf), n = x.length;
  maxHz = maxHz ?? sr / 2;
  const W = width ?? Math.round(Math.max(600, Math.min(1600, buf.duration * 600)));
  const HEAD = 30, WAVE = 90, AXIS = 16, H = HEAD + WAVE + height + AXIS;
  const LEFT = 40;
  const png = new PNG({ width: W + LEFT, height: H });
  for (let i = 0; i < png.data.length; i += 4) { png.data[i] = 14; png.data[i + 1] = 15; png.data[i + 2] = 18; png.data[i + 3] = 255; }
  // header
  m = m ?? measure(buf, { spectrum: false });
  drawText(png, 6, 4, title.slice(0, Math.floor((W + LEFT - 12) / 8)), [240, 240, 240]);
  drawText(png, 6, 17, `${m.duration.toFixed(3)}S ${m.channels}CH  LUFS ${m.lufs.toFixed(1)}  M ${m.momentaryMaxLufs.toFixed(1)}  TP ${m.truePeakDb.toFixed(1)}  PK ${m.peakDb.toFixed(1)}  CREST ${m.crestDb.toFixed(1)}`, [150, 200, 255]);
  // waveform strip (min/max per column) + -6/-12 dB guides
  const wy0 = HEAD, mid = wy0 + WAVE / 2;
  for (const g of [1, 0.5, 0.25]) { const dy = Math.round(g * (WAVE / 2 - 2)); for (let c = 0; c < W; c += 3) { setPx(png, LEFT + c, mid - dy, [45, 45, 55]); setPx(png, LEFT + c, mid + dy, [45, 45, 55]); } }
  for (let c = 0; c < W; c++) {
    const a = Math.floor(c * n / W), b = Math.max(a + 1, Math.floor((c + 1) * n / W));
    let lo = 0, hi = 0;
    for (let i = a; i < b && i < n; i++) { if (x[i] < lo) lo = x[i]; if (x[i] > hi) hi = x[i]; }
    const y0 = Math.round(mid - hi * (WAVE / 2 - 2)), y1 = Math.round(mid - lo * (WAVE / 2 - 2));
    const hot = Math.max(-lo, hi) > 0.89;
    for (let y = y0; y <= y1; y++) setPx(png, LEFT + c, y, hot ? [255, 120, 90] : [120, 210, 160]);
  }
  // spectrogram
  const sy0 = HEAD + WAVE;
  const win = hann(fftSize), wsum = win.reduce((s, v) => s + v, 0);
  const re = new Float64Array(fftSize), im = new Float64Array(fftSize);
  const lfMin = Math.log(minHz), lfMax = Math.log(maxHz);
  const rowLo = new Int32Array(height), rowHi = new Int32Array(height);
  for (let r = 0; r < height; r++) {
    const f1 = Math.exp(lfMin + (lfMax - lfMin) * (height - r) / height), f0 = Math.exp(lfMin + (lfMax - lfMin) * (height - r - 1) / height);
    rowLo[r] = Math.max(1, Math.floor(f0 * fftSize / sr)); rowHi[r] = Math.max(rowLo[r], Math.min(fftSize / 2, Math.ceil(f1 * fftSize / sr)));
  }
  for (let c = 0; c < W; c++) {
    const centre = Math.floor((c + 0.5) * n / W), o = centre - fftSize / 2;
    for (let i = 0; i < fftSize; i++) { const j = o + i; re[i] = (j >= 0 && j < n ? x[j] : 0) * win[i]; im[i] = 0; }
    fft(re, im);
    for (let r = 0; r < height; r++) {
      let pmax = 0;
      for (let k = rowLo[r]; k <= rowHi[r]; k++) { const p = re[k] * re[k] + im[k] * im[k]; if (p > pmax) pmax = p; }
      const db = 10 * Math.log10(pmax / ((wsum / 2) ** 2) + 1e-20);
      const [R, G, B] = cmap((db - minDb) / (maxDb - minDb));
      setPx(png, LEFT + c, sy0 + r, [R, G, B]);
    }
  }
  // frequency grid + labels
  for (const [f, label] of [[50, '50'], [100, '100'], [200, '200'], [500, '500'], [1000, '1K'], [2000, '2K'], [5000, '5K'], [10000, '10K'], [20000, '20K']]) {
    if (f < minHz || f > maxHz) continue;
    const r = Math.round(height - (Math.log(f) - lfMin) / (lfMax - lfMin) * height);
    for (let c = 0; c < W; c += 4) setPx(png, LEFT + c, sy0 + r, [90, 90, 110]);
    drawText(png, 2, sy0 + r - 5, label, [170, 170, 190], 2);
  }
  // time axis
  const dur = buf.duration;
  const step = dur <= 0.6 ? 0.05 : dur <= 2 ? 0.1 : dur <= 6 ? 0.5 : dur <= 20 ? 1 : dur <= 120 ? 10 : 30;
  for (let t = 0; t <= dur + 1e-9; t += step) {
    const c = Math.round(t / dur * (W - 1));
    for (let y = HEAD; y < sy0 + height; y += 6) setPx(png, LEFT + c, y, [70, 70, 80]);
    const lbl = step < 1 ? t.toFixed(step < 0.1 ? 2 : 1) : String(Math.round(t));
    if (c < W - 20) drawText(png, LEFT + c + 2, sy0 + height + 3, lbl, [170, 170, 190], 2);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
  return file;
}
