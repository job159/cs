#!/usr/bin/env node
// Self-test of the audio toolkit (tools/audio/lib). Fast (~20 s), light on memory, no network.
//   node --max-old-space-size=1536 tools/audio/selftest.mjs
// Checks the loudness meter against EBU Tech 3341 reference cases, true-peak detection, the limiter ceiling,
// LUFS normalisation, codec round-trips (WAV / Ogg Vorbis / FLAC decode / MP3 decode when a sample is present),
// resampling, filters, band splitting, convolution, reverb/tail generators, dynamics, editing and the PNG renderer.
import fs from 'node:fs';
import path from 'node:path';
import * as lib from './lib/index.mjs';
import { OUT } from './lib/paths.mjs';

const { Buf, SR } = lib;
const dir = path.join(OUT, 'selftest');
fs.mkdirSync(dir, { recursive: true });
let pass = 0, fail = 0;
const ok = (cond, what, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${what}${detail ? `  (${detail})` : ''}`); }
  else { fail++; console.log(`  FAIL ${what}${detail ? `  (${detail})` : ''}`); }
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : String(x));
const finite = (b) => b.data.every((d) => d.every(Number.isFinite));

const sine = (sec, freq, db, { channels = 1, sr = SR, phase = 0 } = {}) => {
  const n = Math.round(sec * sr), a = lib.db2lin(db), d = new Float32Array(n);
  for (let i = 0; i < n; i++) d[i] = a * Math.sin(2 * Math.PI * freq * i / sr + phase);
  return new Buf(Array.from({ length: channels }, () => d.slice()), sr);
};

console.log('loudness (EBU Tech 3341 / BS.1770-4)');
{
  const s = sine(20, 1000, -23, { channels: 2 });
  ok(near(lib.lufs(s), -23, 0.1), 'case 1: stereo 1 kHz @ -23 dBFS = -23 LUFS', f2(lib.lufs(s)));
  const s2 = sine(20, 1000, -33, { channels: 2 });
  ok(near(lib.lufs(s2), -33, 0.1), 'case 2: stereo 1 kHz @ -33 dBFS = -33 LUFS', f2(lib.lufs(s2)));
  const g = lib.concat([sine(10, 1000, -36, { channels: 2 }), sine(60, 1000, -23, { channels: 2 }), sine(10, 1000, -36, { channels: 2 })]);
  ok(near(lib.lufs(g), -23, 0.1), 'case 3: relative gate (-36/-23/-36) = -23 LUFS', f2(lib.lufs(g)));
  const g2 = lib.concat([sine(10, 1000, -72, { channels: 2 }), sine(10, 1000, -36, { channels: 2 }), sine(60, 1000, -23, { channels: 2 }), sine(10, 1000, -36, { channels: 2 }), sine(10, 1000, -72, { channels: 2 })]);
  ok(near(lib.lufs(g2), -23, 0.1), 'case 4: absolute + relative gate = -23 LUFS', f2(lib.lufs(g2)));
  const g3 = lib.concat([sine(20, 1000, -26, { channels: 2 }), sine(20.1, 1000, -20, { channels: 2 }), sine(20, 1000, -26, { channels: 2 })]);
  ok(near(lib.lufs(g3), -23, 0.1), 'case 5: -26/-20/-26 = -23 LUFS', f2(lib.lufs(g3)));
  const m = sine(5, 1000, -20);
  ok(near(lib.lufs(m), -23, 0.1), 'mono 1 kHz @ -20 dBFS = -23 LUFS (single channel, no dual-mono bonus)', f2(lib.lufs(m)));
  const short = sine(0.1, 1000, -20, { channels: 2 });
  ok(near(lib.lufs(short), -20, 0.15), 'one-shot shorter than 400 ms measured over its own duration', f2(lib.lufs(short)));
  const L = lib.loudness(sine(10, 1000, -23, { channels: 2 }));
  ok(near(L.momentaryMax, -23, 0.1) && near(L.shortTermMax, -23, 0.1), 'momentary / short-term max', `${f2(L.momentaryMax)} / ${f2(L.shortTermMax)}`);
}

console.log('true peak');
{
  // fs/4 sine with 45 deg phase: every sample sits at 0.707 of the real peak
  const s = sine(0.5, SR / 4, -0.5, { phase: Math.PI / 4 });
  const sp = lib.lin2db(lib.peak(s)), tp = lib.truePeakDb(s);
  ok(near(sp, -3.51, 0.05) && near(tp, -0.5, 0.25), 'inter-sample peak recovered', `sample ${f2(sp)} dBFS, true ${f2(tp)} dBTP`);
}

console.log('limiter / normalisation');
{
  const n = lib.noise(1, { seed: 'lim' });
  const hot = lib.gain(n, 12);
  const l = lib.limit(hot, { ceiling: -1 });
  ok(lib.truePeakDb(l) <= -0.99, 'limit(): output <= -1 dBTP', f2(lib.truePeakDb(l)));
  // a dense gunshot-like body (shaped + clipped, as a producer would) pushed to the -12 LUFS 'close' target
  const body = lib.mix([lib.noiseBurst({ dur: 0.45, decay: 0.3, hp: 250, lp: 9000, seed: 'shot' }), lib.thump({ f0: 140, f1: 50, decay: 0.3, drive: 1 })]);
  const dense = lib.softClip(lib.gain(lib.normalizePeak(body, 0), 9), { threshold: -12, ceiling: -1 }); // drive 9 dB into the clipper
  const nm = lib.normalizeLufs(dense, -12);
  ok(near(nm.meta.lufs, -12, 0.2) && nm.meta.truePeakDb <= -0.99 && nm.meta.limitedDb < 6, 'normalizeLufs(): dense shot to -12 LUFS, TP <= -1', `${f2(nm.meta.lufs)} LUFS, ${f2(nm.meta.truePeakDb)} dBTP, limited ${f2(nm.meta.limitedDb)} dB`);
  // raw, very peaky material cannot reach -12 cleanly: the limit is enforced and the overload is reported
  const shot = lib.mix([lib.noiseBurst({ dur: 0.4, decay: 0.12, hp: 300, seed: 'shot' }), lib.thump({ f0: 140, f1: 50, decay: 0.2 })]);
  const pk = lib.normalizeLufs(shot, -12);
  ok(pk.meta.truePeakDb <= -0.99 && pk.meta.limitedDb > 6, 'normalizeLufs(): peaky material stays under the ceiling and reports limitedDb', `${f2(pk.meta.lufs)} LUFS, limited ${f2(pk.meta.limitedDb)} dB`);
  const fin = lib.finalize(lib.pad(shot, 0, 0), { lufs: -18, channels: 1 });
  const m = lib.measure(fin);
  ok(lib.checkTarget(m, { lufs: -18 }).length === 0, 'finalize() passes checkTarget', lib.checkTarget(m, { lufs: -18 }).join('; ') || lib.formatMeasure(m));
}

console.log('codecs');
{
  const s = lib.mix([sine(1.5, 220, -6), lib.scale(lib.noiseBurst({ dur: 1.5, decay: 1, seed: 'c' }), 0.4)]);
  const wav = lib.decodeWav(lib.encodeWav(s, { bits: 24 }));
  let err = 0; for (let i = 0; i < s.length; i++) err = Math.max(err, Math.abs(wav.data[0][i] - s.data[0][i]));
  ok(wav.length === s.length && err < 1e-6, 'WAV 24-bit round trip', `max err ${err.toExponential(1)}`);
  const f = path.join(dir, 'rt.wav');
  lib.writeWav(f, lib.toStereo(s), { bits: 16 });
  const part = lib.readWavRange(f, 0.5, 1.0);
  ok(part.length === SR / 2 && part.channels === 2, 'readWavRange() reads a slice without loading the file', `${part.length} frames`);
  const st = lib.width(lib.mix([{ buf: s, pan: -0.5 }, { buf: lib.varispeed(s, 1.01), pan: 0.5 }], { channels: 2 }), 1);
  for (const [b, label] of [[s, 'mono'], [st, 'stereo']]) {
    const bytes = await lib.encodeOgg(b, { quality: 0.5 });
    const d = await lib.decodeBytes(bytes, 'x.ogg');
    const of = path.join(dir, `rt_${label}.ogg`);
    fs.writeFileSync(of, bytes);
    const p = await lib.probe(of);
    ok(d.sampleRate === 48000 && d.channels === b.channels && Math.abs(d.length - b.length) < 64 && p.format === 'ogg' && p.channels === b.channels && Math.abs(p.duration - b.duration) < 0.01,
      `Ogg Vorbis ${label} encode -> decode -> probe`, `${(bytes.length / 1024).toFixed(1)} KB, ${d.length} vs ${b.length} frames, probe ${p.duration.toFixed(3)} s`);
    ok(near(lib.lufs(d), lib.lufs(b), 0.3), `Ogg ${label} keeps loudness`, `${f2(lib.lufs(b))} -> ${f2(lib.lufs(d))}`);
  }
  // FLAC: build a tiny verbatim FLAC stream and decode it with the WASM decoder
  const flac = verbatimFlac(lib.toStereo(sine(0.25, 440, -6)), 16);
  const fd = await lib.decodeBytes(flac, 'x.flac');
  let ferr = 0; const ref = sine(0.25, 440, -6).data[0];
  for (let i = 0; i < ref.length; i++) ferr = Math.max(ferr, Math.abs(fd.data[1][i] - ref[i]));
  ok(fd.channels === 2 && fd.length === ref.length && ferr < 1e-4, 'FLAC decode', `max err ${ferr.toExponential(1)}`);
  // MP3: decode a sample if one is present (fetch.mjs does not need MP3s; drop any .mp3 into tools/audio/out/selftest/)
  const mp3 = fs.readdirSync(dir).find((x) => x.endsWith('.mp3'));
  if (mp3) {
    const b = await lib.readAudio(path.join(dir, mp3), { sampleRate: 48000 });
    ok(b.length > 0 && finite(b), `MP3 decode (${mp3})`, `${b.duration.toFixed(2)} s ${b.channels} ch`);
  } else console.log('  skip MP3 decode (no .mp3 sample in tools/audio/out/selftest/)');
  lib.freeDecoders();
}

console.log('resampling / varispeed / stretch');
{
  const s = sine(1, 1000, -6, { sr: 44100 });
  const r = lib.resample(s, 48000);
  let zc = 0; const d = r.data[0];
  for (let i = 1000; i < d.length - 1000; i++) if (d[i - 1] < 0 && d[i] >= 0) zc++;
  const hz = zc / ((d.length - 2000) / 48000);
  ok(r.length === 48000 && near(hz, 1000, 2) && near(lib.lin2db(lib.peak(lib.slice(r, 0.1, 0.9))), -6, 0.1), '44.1k -> 48k keeps pitch and level', `${hz.toFixed(1)} Hz`);
  const v = lib.varispeed(sine(1, 500, -6), 2);
  ok(Math.abs(v.length - 24000) <= 1, 'varispeed(2) halves the length', `${v.length}`);
  const t = lib.timeStretch(lib.noise(1, { seed: 'ts' }), 1.5);
  ok(t.length === 72000 && finite(t), 'timeStretch(1.5)', `${t.length}`);
  const c = lib.varispeedCurve(sine(1, 500, -6), [[0, 0.5], [0.5, 1.5]]);
  ok(c.length > 0 && finite(c), 'varispeedCurve() ramp', `${c.duration.toFixed(3)} s`);
}

console.log('filters');
{
  ok(near(lib.responseDb({ type: 'hp', f: 100, order: 4 }, 100, SR), -3.01, 0.05), 'Butterworth HP4 is -3 dB at fc', f2(lib.responseDb({ type: 'hp', f: 100, order: 4 }, 100, SR)));
  ok(near(lib.responseDb({ type: 'peak', f: 2000, gain: 6, q: 1 }, 2000, SR), 6, 0.01), 'peaking EQ +6 dB at f');
  ok(near(lib.responseDb({ type: 'highshelf', f: 5000, gain: -4 }, 20000, SR), -4, 0.3), 'high shelf -4 dB');
  const n = lib.noise(2, { seed: 'bands' });
  const bands = lib.splitBands(n, [150, 2500]);
  const sum = lib.add(...bands);
  ok(near(lib.lin2db(lib.rms(sum)), lib.lin2db(lib.rms(n)), 0.1), 'LR4 band split sums back flat', `${f2(lib.lin2db(lib.rms(sum)))} vs ${f2(lib.lin2db(lib.rms(n)))} dB`);
  const sw = lib.sweep(n, 'bp', [[0, 200], [2, 4000]], { q: 4 });
  ok(finite(sw), 'swept band-pass');
  const zp = lib.filtfilt(n, { type: 'lp', f: 1000 });
  ok(finite(zp) && zp.length === n.length, 'zero-phase filtfilt');
}

console.log('convolution / space');
{
  const imp = Buf.alloc(4800); imp.data[0][0] = 1;
  const x = lib.noise(0.3, { seed: 'cv' });
  const y = lib.convolve(x, imp, { wetOnly: true });
  let e = 0; for (let i = 0; i < x.length; i++) e = Math.max(e, Math.abs(y.data[0][i] - x.data[0][i]));
  ok(e < 1e-5, 'FFT convolution with a unit impulse is identity', e.toExponential(1));
  for (const env of Object.keys(lib.ENVIRONMENTS)) {
    const ir = lib.makeIR(env, { seed: env });
    const en = ir.data.map((d) => d.reduce((s, v) => s + v * v, 0));
    ok(finite(ir) && en.every((v) => near(v, 1, 0.25)), `makeIR('${env}')`, `${ir.duration.toFixed(2)} s, energy ${en.map((v) => v.toFixed(2)).join('/')}`);
  }
  const shot = lib.mix([lib.noiseBurst({ dur: 0.3, decay: 0.08, seed: 'g' }), lib.thump({ decay: 0.2 })]);
  const tail = lib.gunTail(shot, { env: 'urban', length: 1.6, seed: 't' });
  ok(tail.channels === 2 && finite(tail) && lib.edgeLevels(tail).endDb < -60, 'gunTail(): stereo, fades out', `${tail.duration.toFixed(2)} s`);
  const far = lib.farLayer(shot, { distance: 150 });
  const mc = lib.measure(shot), mf = lib.measure(far);
  ok(far.channels === 1 && mf.centroidHz < mc.centroidHz, 'farLayer(): mono, darker', `centroid ${mc.centroidHz} -> ${mf.centroidHz} Hz`);
  const ech = lib.echo(shot, { time: 0.2, feedback: 0.4 });
  ok(finite(ech), 'echo()');
  ok(finite(lib.diffuse(shot)), 'diffuse()');
  const wide = lib.stereoize(shot, { width: 0.35 });
  const back = lib.toMono(wide);
  let werr = 0; for (let i = 0; i < shot.length; i++) werr = Math.max(werr, Math.abs(back.data[0][i] - shot.data[0][i]));
  ok(wide.channels === 2 && lib.stereoCorrelation(wide) < 0.99 && werr < 1e-5, 'stereoize(): wider, folds back to the mono original', `corr ${lib.stereoCorrelation(wide).toFixed(3)}`);
  ok(finite(lib.reverb(shot, 'smallRoom', { wet: 0.2 })), 'reverb()');
  ok(finite(lib.airAbsorption(shot, 200)), 'airAbsorption()');
}

console.log('dynamics / saturation');
{
  const shot = lib.mix([lib.noiseBurst({ dur: 0.5, decay: 0.25, seed: 'd' }), lib.thump({ decay: 0.3 })]);
  const ts = lib.transientShaper(shot, { attack: 6, sustain: -6 });
  const tsm = lib.transientShaper(shot, { bands: [200, 3000], perBand: [{ attack: 2, sustain: -4 }, { attack: 6 }, { attack: 3, sustain: -6 }] });
  ok(finite(ts) && finite(tsm) && lib.measure(ts).crestDb > lib.measure(shot).crestDb, 'transientShaper() single + multiband raise crest', `${lib.measure(shot).crestDb} -> ${lib.measure(ts).crestDb} dB`);
  const c = lib.compress(lib.gain(shot, 10), { threshold: -20, ratio: 4 });
  ok(finite(c) && lib.peak(c) < lib.peak(lib.gain(shot, 10)), 'compress()');
  ok(finite(lib.gate(shot, { threshold: -40 })), 'gate()');
  for (const type of ['tanh', 'atan', 'soft', 'hard', 'tube', 'fold', 'diode']) ok(finite(lib.saturate(shot, { drive: 12, type })), `saturate(${type})`);
  const hot = lib.gain(lib.lp(shot, 8000), 12), hotPk = lib.lin2db(lib.peak(hot));
  const hc = lib.hardClip(hot, -1), hcs = lib.hardClip(hot, -1, 4, { strict: true });
  ok(lib.lin2db(lib.peak(hc)) < 1.5 && lib.peak(hcs) <= lib.db2lin(-1) + 1e-6, 'hardClip() oversampled (+ strict)', `in ${f2(hotPk)} -> ${f2(lib.lin2db(lib.peak(hc)))} / strict ${f2(lib.lin2db(lib.peak(hcs)))} dBFS`);
  const sc = lib.softClip(hot, { threshold: -6, ceiling: -0.3 }), scs = lib.softClip(hot, { threshold: -6, ceiling: -0.3, strict: true });
  ok(lib.lin2db(lib.peak(sc)) < 2 && lib.peak(scs) <= lib.db2lin(-0.3), 'softClip() oversampled (+ strict)', `${f2(lib.lin2db(lib.peak(sc)))} / strict ${f2(lib.lin2db(lib.peak(scs)))} dBFS`);
  const pb = lib.psychoBass(lib.thump({ f0: 90, f1: 45, decay: 0.4 }), { freq: 110 });
  const b0 = lib.measure(lib.thump({ f0: 90, f1: 45, decay: 0.4 })).bandsDb, b1 = lib.measure(pb).bandsDb;
  ok(b1.lowMid > b0.lowMid + 3, 'psychoBass() adds audible harmonics', `lowMid ${b0.lowMid} -> ${b1.lowMid} dB`);
  ok(finite(lib.exciter(shot)), 'exciter()');
}

console.log('editing / analysis');
{
  const clicks = Buf.alloc(SR * 2);
  for (const t of [0.3, 0.9, 1.5]) { const b = lib.noiseBurst({ dur: 0.1, decay: 0.03, seed: 'k' + t }); clicks.data[0].set(b.data[0], Math.round(t * SR)); }
  const on = lib.detectOnsets(clicks);
  ok(on.length === 3 && on.every((t, i) => near(t, [0.3, 0.9, 1.5][i], 0.003)), 'detectOnsets()', on.map((t) => t.toFixed(3)).join(' '));
  const ev = lib.splitOnSilence(clicks);
  ok(ev.length === 3, 'splitOnSilence()', `${ev.length} events`);
  const tk = lib.takes(clicks);
  ok(tk.length === 3 && tk.every((b) => b.duration < 0.2), 'takes()', tk.map((b) => b.duration.toFixed(3)).join(' '));
  const tr = lib.trimSilence(lib.pad(lib.noiseBurst({ dur: 0.2, decay: 0.05, seed: 'tr' }), 0.5, 0.5));
  ok(tr.duration < 0.3 && lib.edgeLevels(tr).endDb < -60, 'trimSilence() + click-free edges', `${tr.duration.toFixed(3)} s`);
  const a = Buf.alloc(10); a.data[0][0] = 1;
  const mx = lib.mix([{ buf: a, atSample: 3 }, { buf: a, at: 7 / SR, gain: -6 }]);
  ok(mx.data[0][3] === 1 && near(mx.data[0][7], 0.501, 0.001), 'mix(): sample-accurate offsets + gain');
  const lp = lib.loopCrossfade(lib.noise(2, { color: 'pink', seed: 'loop' }), 0.5);
  ok(lp.duration === 1.5 && near(lp.data[0][lp.length - 1], lp.data[0][0], 0.5), 'loopCrossfade()');
  ok(lib.pan(lib.noise(0.1), -1).data[1].every((v) => Math.abs(v) < 1e-6), 'pan(-1) is hard left');
  ok(lib.toMono(lib.toStereo(lib.noise(0.1))).channels === 1 && lib.haas(lib.noise(0.1), 10).channels === 2, 'toMono / toStereo / haas');
  const rv = lib.rng('a'), rv2 = lib.rng('a');
  ok(rv.next() === rv2.next() && lib.rng('b').next() !== lib.rng('a').next(), 'seeded rng is deterministic');
  const vs = lib.variations(lib.noiseBurst({ dur: 0.2, seed: 'v' }), 4, { seed: 'var' });
  ok(vs.length === 4 && new Set(vs.map((b) => b.length)).size > 1, 'variations()', vs.map((b) => b.length).join(' '));
  const m = lib.measure(lib.toStereo(sine(1, 1000, -10)));
  ok(near(m.peakDb, -10, 0.01) && near(m.rmsDb, -13.01, 0.05) && near(m.crestDb, 3.01, 0.05) && m.dcDb < -60 && m.clipped === 0, 'measure()', lib.formatMeasure(m));
  const png = lib.spectrogram(lib.mix([sine(1, 440, -12), lib.noiseBurst({ dur: 1, decay: 0.4, seed: 'png' })]), path.join(dir, 'spectrogram.png'));
  ok(fs.statSync(png).size > 2000, 'spectrogram() PNG', path.relative(process.cwd(), png));
}

console.log('synth');
{
  for (const color of ['white', 'pink', 'brown', 'blue', 'violet', 'velvet']) ok(finite(lib.noise(0.2, { color, seed: color })), `noise(${color})`);
  for (const type of ['sine', 'saw', 'square', 'pulse', 'triangle']) ok(finite(lib.tone(0.1, { type, freq: [[0, 200], [0.1, 2000]] })), `tone(${type}) glide`);
  ok(finite(lib.whoosh()) && finite(lib.crackle(1)) && finite(lib.fm(0.2)) && finite(lib.partials(0.3)) && lib.adsr().length > 0, 'whoosh / crackle / fm / partials / adsr');
}

console.log(`\n${pass} passed, ${fail} failed  (memory rss ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB)`);
process.exit(fail ? 1 : 0);

// ---------------------------------------------------------------------------------------------- helpers
/** Minimal FLAC writer (VERBATIM subframes, fixed 4096 block size) used only to test the decoder. */
function verbatimFlac(buf, bits = 16) {
  const crc8 = (a) => { let c = 0; for (const b of a) { c ^= b; for (let k = 0; k < 8; k++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 255 : (c << 1) & 255; } return c; };
  const crc16 = (a) => { let c = 0; for (const b of a) { c ^= b << 8; for (let k = 0; k < 8; k++) c = c & 0x8000 ? ((c << 1) ^ 0x8005) & 0xffff : (c << 1) & 0xffff; } return c; };
  class Bits { constructor() { this.bytes = []; this.acc = 0; this.n = 0; } put(v, w) { for (let i = w - 1; i >= 0; i--) { this.acc = (this.acc << 1) | ((v / 2 ** i) & 1); if (++this.n === 8) { this.bytes.push(this.acc); this.acc = 0; this.n = 0; } } } align() { while (this.n) this.put(0, 1); } }
  const ch = buf.channels, N = buf.length, BS = 4096, sr = buf.sampleRate;
  const out = [0x66, 0x4c, 0x61, 0x43]; // fLaC
  const si = new Bits();
  si.put(BS, 16); si.put(BS, 16); si.put(0, 24); si.put(0, 24); si.put(sr, 20); si.put(ch - 1, 3); si.put(bits - 1, 5);
  si.put(Math.floor(N / 2 ** 32), 4); si.put(N >>> 0, 32); for (let i = 0; i < 16; i++) si.put(0, 8);
  out.push(0x80, 0, 0, 34, ...si.bytes); // last-metadata-block flag + STREAMINFO length 34
  const srCode = { 44100: 9, 48000: 10, 96000: 11 }[sr];
  for (let f = 0, s0 = 0; s0 < N; f++, s0 += BS) {
    const n = Math.min(BS, N - s0);
    const h = new Bits();
    h.put(0x3ffe, 14); h.put(0, 1); h.put(0, 1);           // sync, reserved, fixed block size
    h.put(n === BS ? 12 : n <= 256 ? 6 : 7, 4); h.put(srCode, 4); // block size code (12 = 4096; 6/7 = 8/16-bit n-1 follows), rate
    h.put(ch - 1, 4); h.put(bits === 16 ? 4 : 6, 3); h.put(0, 1);
    if (f < 128) h.put(f, 8); else { h.put(0xc0 | (f >> 6), 8); h.put(0x80 | (f & 63), 8); } // UTF-8 frame number
    if (n !== BS) h.put(n - 1, n <= 256 ? 8 : 16);
    h.bytes.push(crc8(h.bytes));
    const b = new Bits(); b.bytes = h.bytes.slice();
    const full = 2 ** (bits - 1);
    for (let c = 0; c < ch; c++) {
      b.put(0, 1); b.put(1, 6); b.put(0, 1);                // VERBATIM subframe
      for (let i = 0; i < n; i++) { let v = Math.round(Math.max(-1, Math.min(1, buf.data[c][s0 + i])) * (full - 1)); if (v < 0) v += 2 ** bits; b.put(v, bits); }
    }
    b.align();
    const c16 = crc16(b.bytes);
    out.push(...b.bytes, c16 >> 8, c16 & 255);
  }
  return new Uint8Array(out);
}
