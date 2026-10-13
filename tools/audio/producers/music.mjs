// Adaptive music — category 'music' (game/assets/audio/music/ + manifest.music.json), owned by this producer.
//
// Everything is composed in code and rendered offline. A small step sequencer drives:
//   - a sampler built on the VSCO-2 Community Edition orchestral samples (Sam Gossner / Versilian Studios, CC0, uploaded
//     to Freesound by sgossner): cello / viola / violin sections (sustain, spiccato, tremolo), solo contrabass, F horn,
//     tenor trombone, tuba, timpani, gran cassa, orchestral snare, cymbals, gong, tubular bells, upright piano;
//   - a CC0 crowd choir (GameSoundCon 2024 crowd singing vowels, Freesound ShangusBurger), CC0 taiko and hi-hat hits;
//   - synth voices for what an orchestra cannot do: sub, distorted bass, supersaw pads, formant choir, pulses, risers,
//     impacts, braams, heartbeat.
// Stems are balanced by loudness, processed (EQ / compression / saturation), ducked by the kick where needed, sent to a
// synthetic hall, summed, then FOLDED: the release + reverb tail that runs past the loop end is added back onto the loop
// start, so the file loops sample-accurately (AudioBufferSourceNode.loop). The master bus (EQ, a tonal-balance stage
// fitted to a per-cue target curve, glue compression, true-peak limiter) is processed CIRCULARLY (pre-rolled with the
// loop's own end) so the dynamics see an endless loop and there is no level jump at the seam. Delivered at -18 LUFS /
// <= -1 dBTP (stingers at the stinger target).
//
// Tuning is measured, not trusted from tags: every pitched zone was checked with a YIN / partial analysis; zones more than
// ~9 cents off get a fractional root (TUNE), the timpani (which sit 50-75 cents above their labels) use their measured
// (1,1) mode, one unstable tuba take is excluded, and the crowd-choir takes are trimmed to the part where the crowd has
// settled on the note (the first 1-1.75 s scatter by up to +-4 semitones).
//
// Pitch shifts are formant-corrected: VSCO-2 CE is sparsely sampled (no horn sustain between C4 and D5, violin sustains
// only at B3 D4 C5 D6, one crowd-choir pitch), so the theme notes are often 4-7 semitones off a zone. Plain varispeed
// moves the instrument's resonances with the pitch (the "cheap sampler" timbre); formantFix() pulls the timbre toward
// the real zones either side of the note (harmonic envelopes interpolated by pitch) with a static linear-phase EQ.
// Validated leave-one-out (48 real zones hidden and rebuilt from their neighbours): envelope error vs the hidden
// recording 5.1 -> 4.2 dB mean; along the theme lines the worst note-to-note timbre jump drops from 7.5 to 6.6 dB
// (horns), 14.9 to 8.4 (trombones an octave down) and 7.9 to 4.7 (violins an octave up).
// The master monos the side signal below 90 Hz.
//
// Tracks (all in D minor; bpm / bars / loop points are also written into the manifest entries as extra fields):
//   calm, combat_low, combat_high  140 BPM, 32 bars = 54.857 s. One shared chord progression and grid, so the three
//                                  intensity levels are phase-compatible ("sync": "d140") for synced cross-fades.
//   boss                           140 BPM, 32 bars: taiko ensemble, choir, brass, braams.
//   menu_theme                     80 BPM, 24 bars = 72 s: the main theme.
//   wave_start, victory, defeat    stingers (one-shots on the music bus).
//
// Dev loop: node tools/audio/producers/music.mjs --dev <track> renders one track to tools/audio/out/music/preview/ (WAV +
// spectrogram + per-stem loudness) without touching the game folder.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SR = 48000;
const HERE = fileURLToPath(import.meta.url);

// ================================================================================================ theory
const PCN = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** 'D3' -> 50, 'Bb2' -> 46, 'C#5' -> 73; numbers pass through. */
export function M(n) {
  if (typeof n === 'number') return n;
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(n);
  if (!m) throw new Error(`music: bad note '${n}'`);
  return 12 * (+m[3] + 1) + PCN[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
const hz = (m) => 440 * Math.pow(2, (M(m) - 69) / 12);
const db2lin = (d) => Math.pow(10, d / 20);
const mod = (a, n) => ((a % n) + n) % n;

/** Pitch classes, root first. */
const CHORDS = {
  Dm: [2, 5, 9], D: [2, 6, 9], Bb: [10, 2, 5], Gm: [7, 10, 2], A: [9, 1, 4], Eb: [3, 7, 10], C: [0, 4, 7], F: [5, 9, 0],
  Bbm: [10, 1, 5],
};
const pcAbove = (pc, lo) => lo + mod(pc - lo, 12);
/** Chord tone k (0 root, 1 third, 2 fifth, 3 octave, ...) with the root placed at or above `lo`. */
function ctone(ch, k, lo) {
  const pcs = CHORDS[ch], r = pcAbove(pcs[0], lo);
  return pcAbove(pcs[k % pcs.length], r) + 12 * Math.floor(k / pcs.length);
}
/** All chord tones in [lo, hi]. */
const voicing = (ch, lo, hi) => { const o = []; for (let m = lo; m <= hi; m++) if (CHORDS[ch].includes(mod(m, 12))) o.push(m); return o; };
const TONE_OF = { r: 0, t: 1, f: 2, o: 3, T: 4, F: 5 };
/** Pattern string -> [[step, char]] ('.', '-' and ' ' are rests). */
const pat = (s) => { const o = []; for (let i = 0; i < s.length; i++) if (!'.- '.includes(s[i])) o.push([i, s[i]]); return o; };
const VEL = { X: 1, x: 0.8, o: 0.6, g: 0.4, '.': 0 };

// Shared 32-bar progression of calm / combat_low / combat_high (2 bars per chord): cycles A, B, C, D.
const PROG = ['Dm', 'Dm', 'Bb', 'Bb', 'Gm', 'Gm', 'A', 'A', 'Dm', 'Dm', 'Bb', 'Bb', 'Eb', 'Eb', 'A', 'A',
  'Bb', 'Bb', 'C', 'C', 'Dm', 'Dm', 'A', 'A', 'Bb', 'Bb', 'Gm', 'Gm', 'Eb', 'Eb', 'A', 'A'];
const BOSS_PROG = ['Dm', 'Dm', 'Eb', 'Eb', 'C', 'C', 'A', 'A', 'Dm', 'Dm', 'Eb', 'Eb', 'C', 'C', 'A', 'A',
  'Bb', 'Bb', 'Gm', 'Gm', 'Eb', 'Eb', 'A', 'A', 'Dm', 'Eb', 'Dm', 'Eb', 'C', 'Bb', 'A', 'A'];
const MENU_PROG = ['Dm', 'Dm', 'Bb', 'A', 'Dm', 'Dm', 'Bb', 'Bb', 'Gm', 'Gm', 'A', 'A', 'Dm', 'Dm', 'Bb', 'Bb', 'Eb', 'Eb', 'A', 'A', 'Bb', 'Gm', 'A', 'Dm'];

// The "Calamity" theme: four 8-bar phrases, one per chord cycle ([note, beats]; null = rest).
const THEME = {
  A: [['D5', 2], ['A4', 1], ['F4', 1], ['E4', 1.5], ['F4', 0.5], ['D4', 2], ['F4', 1], ['G4', 1], ['A4', 1], ['Bb4', 1], ['D5', 3], ['C5', 1],
    ['Bb4', 2], ['A4', 1], ['G4', 1], ['D5', 2], ['Bb4', 2], ['E5', 1.5], ['D5', 0.5], ['C#5', 2], ['A4', 4]],
  B: [['D5', 2], ['A4', 1], ['F4', 1], ['G4', 1.5], ['F4', 0.5], ['E4', 1], ['D4', 1], ['F4', 1], ['G4', 1], ['A4', 1], ['Bb4', 1], ['F5', 3], ['D5', 1],
    ['Eb5', 2], ['D5', 1], ['Bb4', 1], ['G4', 2], ['Bb4', 2], ['A4', 1], ['Bb4', 1], ['C#5', 1], ['E5', 1], ['D5', 1], ['C#5', 1], ['A4', 2]],
  C: [['D5', 2], ['Bb4', 1], ['C5', 1], ['D5', 2], ['F5', 2], ['E5', 2], ['C5', 1], ['D5', 1], ['E5', 2], ['G5', 2],
    ['F5', 3], ['E5', 0.5], ['D5', 0.5], ['D5', 2], ['A4', 2], ['C#5', 1.5], ['D5', 0.5], ['E5', 2], ['A4', 2], ['C#5', 2]],
  D: [['F5', 2], ['D5', 1], ['Bb4', 1], ['C5', 1.5], ['D5', 0.5], ['F5', 2], ['G5', 2], ['F5', 1], ['D5', 1], ['Bb4', 3], ['A4', 1],
    ['G4', 1], ['Bb4', 1], ['Eb5', 2], ['D5', 1.5], ['C5', 0.5], ['Bb4', 2], ['A4', 1], ['C#5', 1], ['E5', 2], ['E5', 1], ['D5', 1], ['C#5', 2]],
};
// Boss motif (over Dm Dm Eb Eb C C A A): chromatic, low, menacing.
const BOSS_MOTIF = [['D4', 1], ['D4', 0.5], ['Eb4', 0.5], ['D4', 1], ['A3', 1], ['Bb3', 1.5], ['A3', 0.5], ['G#3', 1], ['A3', 1],
  ['D4', 1], ['F4', 1], ['Eb4', 1], ['D4', 1], ['G4', 3], ['F4', 0.5], ['Eb4', 0.5],
  ['E4', 1.5], ['F4', 0.5], ['G4', 2], ['C4', 2], ['Bb3', 1], ['C4', 1], ['C#4', 2], ['E4', 1], ['G4', 1], ['A4', 4]];

// ================================================================================================ sources
// Pitched multisample instruments: inventory tags (fetched with --to music) + articulation behaviour.
//   kind: sus (sustains: extended by crossfading when a note outlasts the sample) | short | decay
//   lead: seconds the note starts early so the (slow) attack lands on the beat
//   formant: 0..1 — how far (in dB) a varispeeded zone's spectral envelope is pulled toward the target timbre at the new
//   pitch (see formantFix / targetEnvelope). Why: on adjacent real zones (harmonic-peak envelopes, 250 Hz-8 kHz) an
//   envelope fixed in absolute frequency predicts the neighbouring zone better than plain varispeed for every family
//   (mean RMS error: trombone 6.9 -> 5.3 dB, +7 semitones 10.4 -> 5.6; tuba 4.7 -> 3.6; cello 3.9 -> 3.3; violin tremolo
//   4.7 -> 3.9; violin sustain 5.8 -> 4.0). The horn gets less (0.6): its brightness also tracks the dynamic layer, and
//   a partial correction fits it best (6.6 -> 5.6 dB). Voices (crowd choir): vowel formants, 0.9.
const INSTR = {
  celloSus: { q: ['cello', 'sustain'], kind: 'sus', lead: 0.07, max: 12, formant: 0.8 },
  celloSpic: { q: ['cello', 'spiccato'], kind: 'short', lead: 0.008, max: 2.5 },
  celloTrem: { q: ['cello', 'tremolo'], kind: 'sus', lead: 0.03, max: 9, formant: 0.8 },
  cbSpic: { q: ['contrabass', 'spiccato'], kind: 'short', lead: 0.01, max: 2.5 },
  cbSus: { q: ['contrabass', 'sustain'], kind: 'sus', lead: 0.08, max: 12, formant: 0.8 },
  violaSpic: { q: ['viola', 'spiccato'], kind: 'short', lead: 0.008, max: 2 },
  // the spiccato violins have no zone between E5 and D6: the A5 / A#5 arpeggio notes are E5 + 4..5 semitones
  vlnSpic: { q: ['violin', 'spiccato'], kind: 'short', lead: 0.008, max: 2, formant: 0.8 },
  vlnTrem: { q: ['violin', 'tremolo'], kind: 'sus', lead: 0.03, max: 10, formant: 0.8 },
  // sustain violins: only B3 D4 C5 D6 exist (the menu's high harmony and octave melody are up to 7 semitones off a zone)
  vlnSus: { q: ['violin', 'sustain'], kind: 'sus', lead: 0.08, max: 12, formant: 0.8 },
  // VSCO-2 CE has NO horn sustain between C4 and D5 (verified on the Freesound pack, all 29 takes): every theme note from
  // E4 to C#5 is 4-7 semitones off a zone, which is where plain varispeed sounded like a cheap sampler
  hornSus: { q: ['horn', 'sustain'], kind: 'sus', lead: 0.05, max: 12, formant: 0.6 },
  hornStac: { q: ['horn', 'staccato'], kind: 'short', lead: 0.012, max: 2, formant: 0.6 },
  tbnSus: { q: ['trombone', 'sustain'], kind: 'sus', lead: 0.04, max: 12, formant: 0.8 },
  tubaSus: { q: ['tuba', 'sustain'], kind: 'sus', lead: 0.05, max: 12, formant: 0.8 },
  // the A#1 staccato take (fs:374225) has no stable pitch (YIN ~56 Hz, inharmonic partials): left out
  tubaStac: { q: ['tuba', 'staccato'], kind: 'short', lead: 0.012, max: 1.5, exclude: ['fs:374225'], formant: 0.8 },
  piano: { q: ['piano'], kind: 'decay', lead: 0.002, max: 9 },
  // timpani: neither the tags nor the titles match the drums' actual tuning. Measured principal (1,1) mode, confirmed by
  // the (2,1) / (3,1) partials at ~1.48x / ~1.98x: Timpani1 89.8 Hz, Timpani2 121.8 Hz, Timpani3 142.7 Hz, Timpani4
  // 169.6 Hz, Timpani5 ~193 Hz (glides 196 -> 192) — i.e. every drum sits ~50-75 cents above its label.
  timp: { q: ['timpani', 'hit'], kind: 'decay', lead: 0.004, max: 6, roots: { 'fs:373928': 41.49, 'fs:373910': 46.76, 'fs:373919': 46.76, 'fs:373911': 49.5, 'fs:373920': 49.5, 'fs:373921': 52.52, 'fs:373922': 54.75 } },
  // crowd singing vowels "near F": the crowd needs 1-1.75 s to find the note (pitch trace in 0.25 s steps scatters over
  // -380..+220 cents), then holds F3 +5..+21 cents. 'trims' keep only the settled part ([start, end] s into the file) and
  // the entry is re-made with a 0.3 s swell; roots are the settled means (harmonic-sum pitch trace).
  // every take sits near F3, so chord tones are up to +-5 semitones off: the vowel formants are restored (formant 0.9)
  choir: {
    q: ['choir', 'crowd'], kind: 'sus', lead: 0.15, max: 8, attack: 0.3, formant: 0.9,
    roots: { 'fs:764329': 53.14, 'fs:764330': 53.14, 'fs:764339': 53.08, 'fs:764341': 53.21, 'fs:764343': 53.05 },
    trims: { 'fs:764329': [1.6], 'fs:764330': [1.75, 7.2], 'fs:764339': [1.75], 'fs:764341': [1.5], 'fs:764343': [1.0] },
  },
};
// Measured fine tuning (YIN on the steady part; only zones >= 9 cents off their midi-note tag): fractional roots.
const TUNE = {
  'fs:372765': 36.13, 'fs:372769': 40.09, 'fs:372773': 43.09,   // cello spiccato C2 E2 G1-file
  'fs:372847': 40.15, 'fs:372856': 35.88,                       // cello tremolo E2 C2
  'fs:373080': 44.91, 'fs:374430': 48.1, 'fs:374549': 61.91,   // contrabass spic A2, viola spic C3, violin spic D4 (rr v2)
  'fs:373230': 50.09, 'fs:374229': 49.9, 'fs:374231': 41.12,   // horn stac D3, tuba stac D3 / F2
};
// Unpitched one-shots (round-robin sets) and FX recordings.
const SHOTS = {
  bd: { ids: ['fs:375260', 'fs:375261', 'fs:375259'], max: 6 },          // gran cassa fff / ff
  bdMuted: { ids: ['fs:375265', 'fs:375266', 'fs:375264'], max: 2.5 },   // gran cassa muted
  bdRoll: { ids: ['fs:375282'], max: 10 },
  snare: { ids: ['fs:375368', 'fs:375369', 'fs:375404'], max: 0.8 },
  rim: { ids: ['fs:375433'], max: 0.6 },
  crash: { ids: ['fs:375497', 'fs:375506'], max: 7 },
  cymSwell: { ids: ['fs:375519'], max: 10 },                             // suspended cymbal roll, crescendo
  cymMetal: { ids: ['fs:375512'], max: 4 },
  gong: { ids: ['fs:375532', 'fs:375531'], max: 9 },
  gongSmack: { ids: ['fs:375553'], max: 7 },
  gongScrape: { ids: ['fs:375550'], max: 6.3 },
  tbell: { ids: ['fs:374273', 'fs:374274'], max: 9, roots: [60, 72] },   // tubular bells C4 / C5
  hat: { ids: ['fs:45664', 'fs:674296'], max: 0.3 },
  taiko: { ids: ['fs:486140', 'fs:486141'], max: 1.9 },
  timpRoll: { ids: ['fs:373943', 'fs:373944'], max: 12, roots: [42.0, 46.8] },   // measured (labels say F2 / A#2)
  tbnFx: { ids: ['fs:374731', 'fs:374752'], max: 3 },                    // trombone buzz / fall
  metal: { ids: ['fs:201094', 'fs:406562'], max: 1.2 },                  // deep metal clang, metallic hit
};

// ================================================================================================ synth voices
function adEnv(n, a, d, sr = SR) { // attack (s) then hold; d = release start (s) — returns gains for a sustain
  const e = new Float32Array(n), na = Math.max(1, Math.round(a * sr)), nd = Math.round(d * sr);
  for (let i = 0; i < n; i++) e[i] = i < na ? Math.sin((i / na) * Math.PI / 2) ** 2 : 1;
  for (let i = nd; i < n; i++) { const x = (i - nd) / Math.max(1, n - nd); e[i] *= Math.pow(1 - x, 2.4); }
  return e;
}
function stereoOf(lib, mono, spread = 0) {
  if (!spread) return new lib.Buf([mono, mono.slice()]);
  return lib.stereoize(new lib.Buf([mono]), { width: spread, hp: 250 });
}

/** Detuned saw stack, low-passed, slow envelope (dark pads, braam layers). Stereo. */
function superSaw(lib, m, dur, { voices = 7, spread = 22, cutoff = 1800, q = 0.7, att = 0.6, rel = 1.2, seed = 'ss', type = 'saw', sweep } = {}) {
  const r = lib.rng(seed), f0 = hz(m), total = dur + rel, n = Math.round(total * SR);
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let v = 0; v < voices; v++) {
    const k = voices > 1 ? v / (voices - 1) - 0.5 : 0;
    const t = lib.tone(total, { type, freq: f0 * Math.pow(2, (k * 2 * spread + r.range(-3, 3)) / 1200), phase: r.next() }).data[0];
    const a = (k * 1.4 + 1) * Math.PI / 4, gl = Math.cos(a), gr = Math.sin(a);
    for (let i = 0; i < n; i++) { L[i] += t[i] * gl; R[i] += t[i] * gr; }
  }
  let b = new lib.Buf([L, R]);
  b = sweep ? lib.sweep(b, 'lp', sweep, { q }) : lib.eq(b, [{ type: 'lp', f: cutoff, q }]);
  b = lib.eq(b, [{ type: 'hp', f: 35, order: 2 }]);
  const e = adEnv(n, att, dur), g = 1 / Math.sqrt(voices);
  for (const d of b.data) for (let i = 0; i < n; i++) d[i] *= e[i] * g;
  return b;
}

/** Distorted bass note (2 detuned saws + square sub-octave, enveloped low-pass, tube drive, cab-ish EQ) + clean sub. */
function distBass(lib, m, dur, { drive = 14, cut = 700, envAmt = 3, decay = 0.08, sub = 0.55, rel = 0.04 } = {}) {
  const f = hz(m), total = dur + rel;
  const a = lib.tone(total, { type: 'saw', freq: f * 1.0035 }).data[0];
  const b = lib.tone(total, { type: 'saw', freq: f / 1.0035, phase: 0.37 }).data[0];
  const s = lib.tone(total, { type: 'square', freq: f / 2, phase: 0.11 }).data[0];
  const n = a.length, o = new Float32Array(n);
  for (let i = 0; i < n; i++) o[i] = 0.45 * a[i] + 0.45 * b[i] + 0.3 * s[i];
  let x = lib.sweep(new lib.Buf([o]), 'lp', (t) => cut * (1 + envAmt * Math.exp(-t / decay)), { q: 1.2 });
  x = lib.saturate(x, { drive, type: 'tube', os: 2 });
  x = lib.eq(x, [{ type: 'lp', f: 3600, order: 2 }, { type: 'hp', f: 38, order: 2 }, { type: 'peak', f: 850, gain: -3, q: 0.9 }, { type: 'peak', f: 160, gain: 2, q: 0.9 }]);
  const sn = lib.tone(total, { type: 'sine', freq: f }).data[0], d = x.data[0];
  for (let i = 0; i < n; i++) d[i] = d[i] * 0.55 + sn[i] * sub;
  const e = adEnv(n, 0.003, dur);
  for (let i = 0; i < n; i++) d[i] *= e[i];
  return new lib.Buf([d, d.slice()]);
}

/** Short plucky synth pulse (16th arps). */
function pulseNote(lib, m, { len = 0.16, cut = 1600, seed = 'pl' } = {}) {
  const f = hz(m), n = Math.round(len * SR);
  const a = lib.tone(len, { type: 'saw', freq: f * 1.002 }).data[0], b = lib.tone(len, { type: 'pulse', pulseWidth: 0.3, freq: f / 1.002, phase: 0.2 }).data[0];
  const o = new Float32Array(n);
  for (let i = 0; i < n; i++) o[i] = (a[i] + 0.7 * b[i]) * Math.exp(-i / (0.05 * SR)) * Math.min(1, i / 40);
  let x = lib.sweep(new lib.Buf([o]), 'lp', (t) => cut * (1 + 2.5 * Math.exp(-t / 0.03)), { q: 2.2 });
  x = lib.eq(x, [{ type: 'hp', f: 120, order: 2 }]);
  return lib.fadeOut(new lib.Buf([x.data[0], x.data[0].slice()]), 0.01);
}

const VOWELS = {
  a: [[730, 1, 80], [1090, 0.55, 100], [2440, 0.3, 130], [3400, 0.12, 180]],
  o: [[570, 1, 70], [840, 0.5, 80], [2410, 0.16, 120], [3300, 0.06, 180]],
  u: [[320, 1, 60], [870, 0.28, 80], [2240, 0.08, 110]],
};
/** Formant "choir" (ensemble of vibrato saws through vowel formants) — supports the crowd-choir recordings. */
function synthChoir(lib, m, dur, { vowel = 'a', voices = 6, att = 0.6, rel = 1.4, seed = 'ch' } = {}) {
  const f0 = hz(m), total = dur + rel, n = Math.round(total * SR), r = lib.rng(seed);
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let v = 0; v < voices; v++) {
    const det = Math.pow(2, r.range(-16, 16) / 1200), rate = r.range(4.6, 5.8), ph = r.next() * 6.28, dep = r.range(0.004, 0.008);
    const t = lib.tone(total, { type: 'saw', freq: (tt) => f0 * det * (1 + dep * Math.min(1, tt / 0.5) * Math.sin(6.283 * rate * tt + ph)), phase: r.next() }).data[0];
    const p = (v % 2 ? 1 : -1) * (0.2 + 0.6 * v / voices), a = (p + 1) * Math.PI / 4;
    for (let i = 0; i < n; i++) { L[i] += t[i] * Math.cos(a); R[i] += t[i] * Math.sin(a); }
  }
  const src = new lib.Buf([L, R]);
  const out = lib.Buf.alloc(n, 2);
  for (const [f, g, bw] of VOWELS[vowel]) {
    const y = lib.eq(src, [{ type: 'bp', f, q: f / bw }, { type: 'bp', f, q: f / (bw * 1.6) }]);
    for (let c = 0; c < 2; c++) for (let i = 0; i < n; i++) out.data[c][i] += y.data[c][i] * g;
  }
  const breath = lib.eq(lib.noise(total, { color: 'pink', channels: 2, seed: seed + 'b' }), [{ type: 'bp', f: 2600, q: 0.8 }]);
  const e = adEnv(n, att, dur);
  for (let c = 0; c < 2; c++) for (let i = 0; i < n; i++) out.data[c][i] = (out.data[c][i] * 2.2 + breath.data[c][i] * 0.04) * e[i] / Math.sqrt(voices);
  return lib.eq(out, [{ type: 'hp', f: 90, order: 2 }]);
}

/** Exponential noise riser + rising saw, `dur` long, peaking at the end (lands on the next downbeat). */
function riser(lib, dur, { seed = 'rs', f0 = 300, f1 = 9000, pitch = true } = {}) {
  const n = Math.round(dur * SR);
  const nz = lib.noise(dur, { color: 'white', channels: 2, seed });
  let x = lib.sweep(nz, 'bp', (t) => f0 * Math.pow(f1 / f0, Math.pow(t / dur, 1.6)), { q: 1.4 });
  for (const d of x.data) for (let i = 0; i < n; i++) d[i] *= Math.pow(i / n, 2.4);
  if (pitch) {
    const s = lib.tone(dur, { type: 'saw', freq: (t) => 110 * Math.pow(4, Math.pow(t / dur, 1.3)) }).data[0];
    for (let i = 0; i < n; i++) { const v = s[i] * Math.pow(i / n, 3) * 0.12; x.data[0][i] += v; x.data[1][i] += v; }
  }
  return lib.fadeOut(x, 0.01);
}

/** Sub drop + boom. */
function subBoom(lib, { f0 = 110, f1 = 30, sweep = 0.12, decay = 1.8, drive = 2.2, seed = 'boom' } = {}) {
  const t = lib.thump({ f0, f1, sweep, decay, click: 0.08, drive, seed });
  return lib.toStereo(t);
}

// ================================================================================================ formant-corrected shifts
/**
 * Harmonic-peak spectral envelope of a pitched sample: [[f, dB], ...] at the harmonics of f0 up to ~10 kHz, from the
 * steady part (sustains) or the body (shorts). Harmonic peaks rather than a smoothed spectrum, so the gaps between
 * partials (40-60 dB down on a low note) do not drag the envelope down.
 */
export function harmonicEnvelope(lib, buf, f0, kind = 'sus') {
  const d = buf.duration;
  const a = kind === 'sus' ? Math.min(0.35, d * 0.2) : 0.01;
  const b = kind === 'sus' ? Math.min(d - 0.4, 2.8) : Math.min(d, 0.6);
  const size = kind === 'sus' ? 8192 : 4096;
  const i0 = Math.round(a * SR), i1 = Math.min(buf.length, Math.max(i0 + size, Math.round(b * SR)));
  const { freqs, power } = lib.averageSpectrum(lib.sliceSamples(buf, i0, i1), { size, maxFrames: 200 });
  const df = freqs[1], out = [];
  for (let h = 1; h * f0 < 10000; h++) {
    const f = h * f0, lo = Math.max(1, Math.floor(f * 0.97 / df)), hi = Math.ceil(f * 1.03 / df);
    let m = 0;
    for (let k = lo; k <= hi && k < power.length; k++) m = Math.max(m, power[k]);
    out.push([f, 10 * Math.log10(m + 1e-20)]);
  }
  return out;
}

/** Envelope value at f (linear in log-frequency between harmonics, held flat outside the measured range). */
function envAt(env, f) {
  if (f <= env[0][0]) return env[0][1];
  const last = env[env.length - 1];
  if (f >= last[0]) return last[1];
  let lo = 0, hi = env.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (env[mid][0] <= f) lo = mid; else hi = mid; }
  const [fa, da] = env[lo], [fb, db] = env[hi];
  return da + (db - da) * Math.log(f / fa) / Math.log(fb / fa);
}

const FIX_TAPS = 1024;
/**
 * Pull a varispeeded zone's timbre back toward a real instrument at the new pitch. After varispeed by `semis` the
 * spectral envelope is E(f / r); the target is `target(f)` (dB, absolute frequency) — by default the zone's own E(f),
 * i.e. resonances fixed like a real body / bell / vocal tract — and `amount` (0..1) of the difference is applied, as a
 * static, smooth, linear-phase EQ (1024 taps, latency compensated, response smoothed over 1/4 octave and clamped to
 * -12..+9 dB, so no phase-vocoder artifacts), then loudness-matched to the plain shift.
 */
export function formantFix(lib, b, env, semis, amount, target = (f) => envAt(env, f)) {
  const r = Math.pow(2, semis / 12), N = FIX_TAPS;
  const nb = N / 2 + 1, df = SR / N, fLo = env[0][0] * r;
  // correction in dB per bin, then 1/4-octave smoothing in log frequency
  const raw = new Float64Array(nb);
  for (let k = 0; k < nb; k++) {
    const f = Math.max(k * df, fLo);
    raw[k] = Math.max(-12, Math.min(9, amount * (target(f) - envAt(env, f / r))));
  }
  const sm = new Float64Array(nb);
  for (let k = 0; k < nb; k++) {
    const f = Math.max(k * df, fLo), a = Math.max(0, Math.floor(f * Math.pow(2, -1 / 8) / df)), z = Math.min(nb - 1, Math.ceil(f * Math.pow(2, 1 / 8) / df));
    let s = 0; for (let j = a; j <= z; j++) s += raw[j];
    sm[k] = s / (z - a + 1);
  }
  // zero-phase magnitude -> symmetric impulse (centred, Hann-windowed)
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let k = 0; k < nb; k++) { const g = Math.pow(10, sm[k] / 20); re[k] = g; if (k > 0 && k < N / 2) re[N - k] = g; }
  lib.fft(re, im, true);
  const h = new Float32Array(N), w = lib.hann(N, false);
  for (let i = 0; i < N; i++) h[i] = (re[(i - N / 2 + N) % N] / N) * w[i];
  const y = new lib.Buf(b.data.map((d) => lib.convolveArrays(d, h).slice(N / 2, N / 2 + d.length)), b.sampleRate);
  // keep the note's loudness (the zones are matched by momentary loudness; an EQ must not re-balance the section)
  const l0 = b.duration >= 0.45 ? lib.loudness(b).momentaryMax : NaN, l1 = b.duration >= 0.45 ? lib.loudness(y).momentaryMax : NaN;
  return Number.isFinite(l0) && Number.isFinite(l1) ? lib.gain(y, l0 - l1) : lib.scale(y, lib.peak(b) / Math.max(1e-9, lib.peak(y)));
}

/**
 * Target envelope for note `m` played from zone `z`: inside a gap between two real zones, their envelopes interpolated by
 * pitch (so the timbre is continuous across a zone boundary even where VSCO's neighbouring zones are different dynamic
 * layers, e.g. horn C4 v2 / D5 v1); outside the sampled range, or at a single-pitch set (choir), the zone's own.
 */
export function targetEnvelope(z, zones, m, envOf) {
  let lo = null, hi = null;
  for (const q of zones) {
    if (q.root < m && (!lo || q.root > lo.root || (q.root === lo.root && q === z))) lo = q;
    if (q.root > m && (!hi || q.root < hi.root || (q.root === hi.root && q === z))) hi = q;
  }
  const own = envOf(z);
  if (!lo || !hi || hi.root - lo.root < 1.5) return (f) => envAt(own, f);
  const el = envOf(lo), eh = envOf(hi), w = (m - lo.root) / (hi.root - lo.root);
  return (f) => (1 - w) * envAt(el, f) + w * envAt(eh, f);
}

// ================================================================================================ kit (samples + caches)
export class Kit {
  constructor(lib, ctx) {
    this.lib = lib; this.ctx = ctx;
    this.inst = new Map(); this.shots = new Map(); this.pitched = new Map(); this.synth = new Map(); this.rr = new Map(); this.irs = new Map();
  }

  /** Inventory ids an instrument / shot set uses (for provenance, no loading). */
  ids(name) {
    if (INSTR[name]) return this.ctx.sources.find({ tags: ['music', ...INSTR[name].q] }).map((e) => e.id).filter((id) => !INSTR[name].exclude?.includes(id));
    if (SHOTS[name]) return SHOTS[name].ids.slice();
    return [];
  }

  async ensure(names) { for (const n of names) { if (INSTR[n]) await this.instrument(n); else if (SHOTS[n]) await this.shotSet(n); } }

  async prep(id, { kind, max, trim, attack }) {
    const L = this.lib;
    let b = await this.ctx.load(id, trim ? { start: trim[0], end: trim[1] } : undefined);
    if (b.channels === 1) b = L.toStereo(b);
    b = L.removeDC(b);
    const act = L.findActive(b, { threshDb: kind === 'sus' ? -48 : -38 });
    const i0 = Math.max(0, act.start - Math.round(0.002 * SR));
    const i1 = Math.min(b.length, act.end + Math.round(0.05 * SR), i0 + Math.round(max * SR));
    b = L.sliceSamples(b, i0, i1);
    b = L.fadeIn(b, attack ?? 0.0015, attack ? 'sine' : undefined);
    b = L.fadeOut(b, Math.min(0.35, b.duration * 0.2));
    const lm = b.duration >= 0.45 ? L.loudness(b).momentaryMax : NaN;
    b = Number.isFinite(lm) ? L.gain(b, -14 - lm) : L.normalizePeak(b, -3); // hits shorter than a 400 ms block: by peak
    return b;
  }

  async instrument(name) {
    if (this.inst.has(name)) return this.inst.get(name);
    const cfg = INSTR[name];
    const zones = [];
    for (const e of this.ctx.sources.find({ tags: ['music', ...cfg.q] })) {
      const tag = e.tags.find((t) => /^midi-note-\d+$/.test(t));
      if (cfg.exclude?.includes(e.id)) continue;
      const root = cfg.roots?.[e.id] ?? TUNE[e.id] ?? (tag ? +tag.slice(10) : null);
      if (root == null) { this.ctx.warn(`music: no root note for ${e.id}`); continue; }
      zones.push({ id: e.id, root, tags: e.tags, buf: await this.prep(e.id, { ...cfg, trim: cfg.trims?.[e.id] }) });
    }
    if (!zones.length) throw new Error(`music: instrument ${name} has no samples (run fetch.mjs)`);
    zones.sort((a, b) => a.root - b.root);
    this.inst.set(name, zones);
    return zones;
  }

  async shotSet(name) {
    if (this.shots.has(name)) return this.shots.get(name);
    const cfg = SHOTS[name], list = [];
    for (const id of cfg.ids) list.push(await this.prep(id, { kind: 'shot', max: cfg.max }));
    this.shots.set(name, list);
    return list;
  }

  /** One-shot k (round robin when k is undefined). Optional semitone shift (relative) or target note (with roots). */
  shot(name, { k, semis = 0, note, vel = 1 } = {}) {
    const list = this.shots.get(name);
    if (!list) throw new Error(`music: shot set ${name} not loaded`);
    const i = Math.floor(Math.abs(k ?? this.next(`shot:${name}`)));
    let idx = i % list.length;
    if (note !== undefined && SHOTS[name].roots) {
      const roots = SHOTS[name].roots; let best = 0;
      roots.forEach((r, j) => { if (Math.abs(r - M(note)) < Math.abs(roots[best] - M(note))) best = j; });
      idx = best; semis = M(note) - roots[best];
    }
    let b = list[idx];
    if (Math.abs(semis) > 0.004) {
      const key = `shot:${name}:${idx}:${semis.toFixed(2)}`;
      b = this.pitched.get(key) ?? this.pitched.set(key, this.lib.varispeedSemis(b, semis)).get(key);
    }
    return vel === 1 ? b : this.vel(b, vel);
  }

  next(key) { const v = (this.rr.get(key) ?? -1) + 1; this.rr.set(key, v); return v; }

  vel(b, vel, tone = true) {
    let x = b;
    // softer = darker, but gently: the samples already are one real dynamic layer (a first-order low-pass at ~3.7 kHz for
    // vel 0.42 used to double-darken them: the menu theme measured -30 dB at 8 kHz re the 500 Hz octave)
    if (tone && vel < 0.93) x = this.lib.eq(x, [{ type: 'highshelf', f: 2500, gain: -9 * (0.93 - vel), q: 0.6 }]);
    return this.lib.scale(x, Math.pow(Math.max(vel, 0.02), 1.5));
  }

  /**
   * Sampled note. m: note name or midi (fractional allowed). opts: vel 0..1, dur (s, held length; omit = natural
   * length), rel (s release after dur), filter (zone => bool), rr (round-robin index), tone (velocity low-pass).
   */
  note(name, m, { vel = 0.8, dur, rel = 0.3, filter, rr, tone = true } = {}) {
    const zones = this.inst.get(name);
    if (!zones) throw new Error(`music: instrument ${name} not loaded`);
    const mm = M(m);
    const cand = filter ? zones.filter(filter) : zones;
    let best = Infinity;
    for (const z of cand) best = Math.min(best, Math.abs(z.root - mm));
    const near = cand.filter((z) => Math.abs(z.root - mm) <= best + 0.7);
    const z = near[(rr ?? this.next(`${name}:${Math.round(mm)}`)) % near.length];
    const semis = Math.round((mm - z.root) * 100) / 100;
    const key = `${z.id}:${semis}`;
    let b = this.pitched.get(key);
    if (!b) {
      const cfg = INSTR[name];
      b = Math.abs(semis) < 0.01 ? z.buf : this.lib.varispeedSemis(z.buf, semis);
      // shifts of 1.5+ semitones on sustained / melodic zones: restore the resonances (formantFix)
      if (cfg.formant && Math.abs(semis) >= 1.5 && z.buf.duration >= 0.25) {
        const envOf = (q) => (q.env ??= harmonicEnvelope(this.lib, q.buf, hz(q.root), cfg.kind));
        b = formantFix(this.lib, b, envOf(z), semis, cfg.formant, targetEnvelope(z, cand, mm, envOf));
      }
      this.pitched.set(key, b);
    }
    if (dur !== undefined) {
      const need = dur + rel;
      if (b.duration < need && INSTR[name].kind === 'sus') b = this.extend(b, need, key);
      if (b.duration > need) b = this.lib.sliceSamples(b, 0, Math.round(need * SR));
      b = release(this.lib, b, dur, rel);
    }
    return this.vel(b, vel, tone);
  }

  /** Lengthen a sustain by equal-power overlap-adding segments of its steady part (seeded), single pass. */
  extend(b, need, key) {
    const r = this.lib.rng(`ext:${key}`);
    const seg = Math.min(2.6, Math.max(0.8, b.duration * 0.45)), xf = Math.min(0.7, seg * 0.35);
    const lo = Math.min(1.0, b.duration * 0.25), hi = Math.max(lo + 0.05, b.duration - 0.45 - seg);
    const ns = Math.round(seg * SR), nx = Math.round(xf * SR);
    const head = Math.round(Math.max(seg, b.duration - 0.4) * SR);
    const n = Math.round((need + 0.1) * SR) + ns;
    const out = b.data.map(() => new Float32Array(n));
    // head: the original attack + body, faded out over the crossfade
    for (let c = 0; c < b.channels; c++) for (let i = 0; i < head; i++) out[c][i] = b.data[c][i] * (i >= head - nx ? Math.cos(((i - head + nx) / nx) * Math.PI / 2) : 1);
    let pos = head - nx;
    while (pos < n - ns) {
      const s0 = Math.round((lo + r.next() * (hi - lo)) * SR);
      for (let c = 0; c < b.channels; c++) {
        const d = b.data[c], o = out[c];
        for (let i = 0; i < ns && s0 + i < d.length; i++) {
          const w = i < nx ? Math.sin((i / nx) * Math.PI / 2) : i >= ns - nx ? Math.cos(((i - ns + nx) / nx) * Math.PI / 2) : 1;
          o[pos + i] += d[s0 + i] * w;
        }
      }
      pos += ns - nx;
    }
    return new this.lib.Buf(out.map((o) => o.subarray(0, Math.min(n, pos + nx)).slice()), SR);
  }

  /** Memoised synth voice: kit.cache(key, () => buf). */
  cache(key, fn) { let b = this.synth.get(key); if (!b) { b = fn(); this.synth.set(key, b); } return b; }

  // ---------------------------------------------------------------- drums (hybrid: synth + real hits), cached variants
  kick(v = 0, { tune = 1, decay = 0.34, big = false } = {}) {
    return this.cache(`kick:${v % 4}:${tune}:${decay}:${big}`, () => {
      const L = this.lib, s = `kick${v % 4}`;
      const body = L.thump({ f0: 175 * tune, f1: 47 * tune, sweep: 0.032, decay, click: 0, drive: 2.4, seed: s });
      const click = L.noiseBurst({ dur: 0.025, decay: 0.007, hp: 2200, lp: 9000, seed: s + 'c' });
      const gc = L.eq(L.toMono(this.shot(big ? 'bd' : 'bdMuted', { k: v })), [{ type: 'lp', f: big ? 900 : 1600, order: 2 }]);
      let k = L.mix([{ buf: body }, { buf: click, gain: -15 }, { buf: L.normalizePeak(gc, 0), gain: big ? -3 : -7 }]);
      k = L.softClip(L.normalizePeak(k, 0), { threshold: -9, ceiling: -1 });
      return L.toStereo(L.fadeOut(k, 0.05));
    });
  }

  snare(v = 0, { big = false } = {}) {
    return this.cache(`snare:${v % 3}:${big}`, () => {
      const L = this.lib, s = `sn${v % 3}`;
      const smp = L.normalizePeak(this.shot('snare', { k: v }), 0);
      const body = L.applyEnv(L.tone(0.3, { type: 'sine', freq: [[0, 235], [0.04, 188], [0.3, 180]] }), L.expEnv(0.3, { t60: 0.13 }));
      const nz = L.noiseBurst({ dur: 0.35, decay: big ? 0.26 : 0.17, hp: 1700, lp: 10500, seed: s, channels: 2 });
      let x = L.mix([{ buf: smp }, { buf: L.toStereo(body), gain: -7 }, { buf: nz, gain: -9 }], { channels: 2 });
      if (big) x = L.mix([{ buf: x }, { buf: L.normalizePeak(this.shot('metal', { k: v }), 0), gain: -15 }], { channels: 2 });
      x = L.saturate(L.normalizePeak(x, -1), { drive: 7, type: 'tanh', mix: 0.45 });
      return L.fadeOut(L.normalizePeak(x, -1), 0.04);
    });
  }

  hat(v = 0, { open = false } = {}) {
    return this.cache(`hat:${v % 2}:${open}`, () => {
      const L = this.lib;
      if (open) return L.fadeOut(L.slice(L.eq(this.shot('crash', { k: 1 }), [{ type: 'hp', f: 5000, order: 2 }]), 0, 0.42), 0.25, 'exp');
      return L.eq(this.shot('hat', { k: v }), [{ type: 'hp', f: 4200, order: 2 }]);
    });
  }

  tom(m, v = 0) {
    return this.cache(`tom:${m}:${v % 2}`, () => {
      const L = this.lib, f = hz(m);
      const t = L.thump({ f0: f * 1.7, f1: f, sweep: 0.03, decay: 0.55, click: 0.12, drive: 1.6, seed: `tom${m}${v}` });
      const tk = L.toMono(this.shot('taiko', { k: v, semis: 12 * Math.log2(f / 110) }));
      return L.toStereo(L.normalizePeak(L.mix([{ buf: t }, { buf: L.normalizePeak(tk, 0), gain: -5 }]), -1));
    });
  }

  taiko(v = 0, { semis = 0, deep = false } = {}) {
    v = Math.floor(Math.abs(v));
    return this.cache(`taiko:${v % 2}:${semis}:${deep}`, () => {
      const L = this.lib;
      let x = L.normalizePeak(this.shot('taiko', { k: v, semis }), -1);
      if (deep) x = L.mix([{ buf: x }, { buf: L.normalizePeak(this.shot('bd', { k: v }), -1), gain: -4 }, { buf: subBoom(L, { f0: 90, f1: 42, decay: 0.7, sweep: 0.05, seed: `tk${v}` }), gain: -8 }], { channels: 2 });
      return L.normalizePeak(L.fadeOut(x, 0.08), -1);
    });
  }

  heartbeat(v = 0) {
    return this.cache(`hb:${v % 2}`, () => {
      const L = this.lib;
      // sub thump + the muted gran cassa's own 100-1500 Hz "knock" (audible on phone speakers) + implied harmonics
      const t = L.thump({ f0: 85, f1: 46, sweep: 0.045, decay: 0.3, click: 0.015, drive: 2.2, seed: `hb${v}` });
      const m = L.eq(L.toMono(this.shot('bdMuted', { k: v })), [{ type: 'hp', f: 55, order: 2 }, { type: 'peak', f: 190, gain: 3, q: 1 }, { type: 'lp', f: 2200, order: 2 }]);
      let x = L.mix([{ buf: t }, { buf: L.normalizePeak(m, 0), gain: -3 }]);
      x = L.psychoBass(x, { freq: 100, amount: -5, lp: 700 });
      return L.toStereo(L.normalizePeak(L.eq(x, [{ type: 'lp', f: 2600, order: 2 }]), -1));
    });
  }

  impact(v = 0, { gong = true, size = 1 } = {}) {
    return this.cache(`impact:${v}:${gong}:${size}`, () => {
      const L = this.lib;
      const layers = [
        { buf: subBoom(L, { f0: 120, f1: 29, sweep: 0.1, decay: 2.2 * size, seed: `imp${v}` }) },
        { buf: L.normalizePeak(this.shot('bd', { k: v }), 0), gain: -2 },
        { buf: L.normalizePeak(this.taiko(v, { semis: -3 }), 0), gain: -4 },
        { buf: L.noiseBurst({ dur: 1.6, decay: 0.8, color: 'pink', lp: 2600, hp: 40, seed: `impn${v}`, channels: 2 }), gain: -15 },
      ];
      if (gong) layers.push({ buf: L.normalizePeak(this.shot('gongSmack'), 0), gain: -9 });
      return L.normalizePeak(L.mix(layers, { channels: 2 }), -1);
    });
  }

  reverseCymbal(dur, v = 0) {
    return this.cache(`rcym:${dur}:${v}`, () => {
      const L = this.lib, c = this.shot('crash', { k: v });
      const x = L.reverse(L.slice(c, 0, Math.min(dur, c.duration)));
      return L.fadeIn(x, Math.min(0.4, dur * 0.5));
    });
  }

  /** Stereo synthetic hall (and a short drum room). */
  ir(name) {
    let b = this.irs.get(name);
    if (b) return b;
    const P = IRS[name];
    b = this.lib.makeIR(P, { seed: `music-${name}`, channels: 2 });
    this.irs.set(name, b);
    return b;
  }

  flush() { this.pitched.clear(); this.synth.clear(); this.rr.clear(); }
}

const IRS = {
  hall: {
    length: 4.4, predelay: 0.022,
    echoes: { count: 36, t: [0.008, 0.11], gain: [0.15, 0.45], lp: [9500, 4200], spread: [0.002, 0.012], pan: 1 },
    tail: { rt60: 2.7, rtLow: 3.1, rtHigh: 1.5, gain: 1.5, start: 0.03, build: 0.08, lp: 8000, hp: 70 },
  },
  cathedral: {
    length: 6.5, predelay: 0.035,
    echoes: { count: 30, t: [0.015, 0.16], gain: [0.15, 0.4], lp: [8000, 3500], spread: [0.003, 0.016], pan: 1 },
    tail: { rt60: 4.4, rtLow: 5.0, rtHigh: 2.2, gain: 1.8, start: 0.05, build: 0.12, lp: 7000, hp: 60 },
  },
};

/** Hold to `dur`, then a smooth release over `rel` (to zero). */
function release(lib, b, dur, rel) {
  const n = b.length, i0 = Math.min(n, Math.round(dur * SR)), nr = Math.max(1, Math.round(rel * SR));
  return new lib.Buf(b.data.map((d) => {
    const o = d.slice();
    for (let i = i0; i < n; i++) { const x = (i - i0) / nr; o[i] *= x >= 1 ? 0 : Math.pow(1 - x, 2.2); }
    return o;
  }), b.sampleRate);
}

// ================================================================================================ timeline
export class Track {
  constructor(lib, def) {
    this.lib = lib; this.def = def; this.name = def.name;
    this.bpm = def.bpm; this.beats = def.beats ?? 4; this.bars = def.bars;
    this.spb = 60 / def.bpm; this.barSec = this.spb * this.beats;
    this.loop = def.loop !== false;
    this.len = this.loop ? this.bars * this.barSec : def.length;
    this.L = Math.round(this.len * SR);
    this.N = this.L + Math.round((def.tail ?? 9) * SR);
    this.stems = new Map();
    this.kicks = [];
  }
  /** Time of bar (1-based) + beat (0-based, fractional). */
  t(bar, beat = 0) { return ((bar - 1) * this.beats + beat) * this.spb; }
  s16(bar, step) { return this.t(bar, step / 4); }
  stem(name) { let s = this.stems.get(name); if (!s) { s = [new Float32Array(this.N), new Float32Array(this.N)]; this.stems.set(name, s); } return s; }

  /** Accumulate a Buf into a stem at time `at` (s). gain (lin) or db, pan -1..1 (balance, equal power), width. */
  add(stem, buf, at, { db = 0, gain = 1, pan = 0, width = 1 } = {}) {
    if (!buf || !buf.length) return;
    if (this.loop) at = mod(at, this.len);
    else if (at < 0) { buf = this.lib.sliceSamples(buf, Math.round(-at * SR), buf.length); at = 0; }
    const [L, R] = this.stem(stem);
    const g = gain * db2lin(db), a = (pan + 1) * Math.PI / 4, gl = Math.cos(a) * Math.SQRT2 * g, gr = Math.sin(a) * Math.SQRT2 * g;
    const l = buf.data[0], r = buf.data[1] ?? buf.data[0];
    const o = Math.round(at * SR), N = this.N;
    for (let i = 0; i < buf.length; i++) {
      let p = o + i;
      if (p >= N) { if (!this.loop) break; while (p >= N) p -= this.L; }
      let x = l[i], y = r[i];
      if (width !== 1) { const m = (x + y) * 0.5, s = (x - y) * 0.5 * width; x = m + s; y = m - s; }
      L[p] += x * gl; R[p] += y * gr;
    }
  }

  /** Kick-driven gain curve for sidechain-style ducking (wraps around the loop). */
  duckCurve(depthDb, release = 0.16, attack = 0.004) {
    const env = new Float32Array(this.N).fill(1), dl = db2lin(-depthDb);
    const ts = [];
    for (const k of this.kicks) { ts.push(k); if (this.loop) ts.push(k + this.len, k - this.len); }
    const na = Math.max(1, Math.round(attack * SR)), nr = Math.round(release * 5 * SR), rs = release * SR;
    for (const t of ts) {
      const i0 = Math.round(t * SR);
      for (let i = Math.max(0, i0 - na); i < Math.min(this.N, i0 + nr); i++) {
        const red = i < i0 ? 1 - (i0 - i) / na : Math.exp(-(i - i0) / rs);
        const g = 1 - (1 - dl) * red;
        if (g < env[i]) env[i] = g;
      }
    }
    return env;
  }
}

// ================================================================================================ mixing
const CHAINS = {
  drums: (L, b) => {
    let x = L.eq(b, [{ type: 'hp', f: 30, order: 2 }, { type: 'peak', f: 380, gain: -2.5, q: 1 }, { type: 'peak', f: 4500, gain: 1.5, q: 0.8 }, { type: 'highshelf', f: 9000, gain: 1 }]);
    x = L.compress(x, { threshold: -17, ratio: 6, attack: 0.004, release: 0.09, knee: 6, mix: 0.45, makeup: 4 });
    return L.saturate(x, { drive: 3, type: 'tanh', mix: 0.3 });
  },
  perc: (L, b) => {
    const x = L.eq(b, [{ type: 'hp', f: 28, order: 2 }, { type: 'peak', f: 300, gain: -1.5, q: 0.9 }, { type: 'peak', f: 2500, gain: 1, q: 0.8 }]);
    return L.compress(x, { threshold: -15, ratio: 2.5, attack: 0.012, release: 0.2, knee: 6, makeup: 1.5 });
  },
  bass: (L, b) => {
    let x = L.eq(b, [{ type: 'hp', f: 30, order: 2 }, { type: 'lp', f: 5000, order: 2 }]);
    x = L.compress(x, { threshold: -22, ratio: 4, attack: 0.005, release: 0.08, knee: 6, makeup: 3 });
    return L.psychoBass(x, { freq: 95, amount: -9, lp: 500 });
  },
  low: (L, b) => {
    const x = L.eq(b, [{ type: 'hp', f: 34, order: 2 }, { type: 'peak', f: 260, gain: -1.5, q: 0.8 }, { type: 'peak', f: 1800, gain: 1, q: 0.9 }, { type: 'highshelf', f: 6000, gain: 1 }]);
    return L.compress(x, { threshold: -18, ratio: 2, attack: 0.015, release: 0.15, knee: 6, makeup: 1 });
  },
  high: (L, b) => L.eq(b, [{ type: 'hp', f: 140, order: 2 }, { type: 'peak', f: 3300, gain: -1.5, q: 1 }, { type: 'highshelf', f: 9500, gain: 1.5 }]),
  brass: (L, b) => {
    const x = L.eq(b, [{ type: 'hp', f: 50, order: 2 }, { type: 'peak', f: 1300, gain: 1.2, q: 0.9 }, { type: 'peak', f: 300, gain: -1, q: 0.9 }]);
    return L.compress(x, { threshold: -18, ratio: 2, attack: 0.02, release: 0.2, knee: 8, makeup: 1 });
  },
  choir: (L, b) => L.eq(b, [{ type: 'hp', f: 100, order: 2 }, { type: 'peak', f: 2800, gain: -2, q: 1 }, { type: 'highshelf', f: 9000, gain: 1 }]),
  pad: (L, b) => L.eq(b, [{ type: 'hp', f: 45, order: 2 }, { type: 'lp', f: 7500, order: 2 }]),
  keys: (L, b) => L.eq(b, [{ type: 'hp', f: 60, order: 2 }, { type: 'peak', f: 2500, gain: -1, q: 1 }]),
  synth: (L, b) => L.eq(b, [{ type: 'hp', f: 90, order: 2 }, { type: 'lp', f: 9000, order: 2 }]),
  fx: (L, b) => L.eq(b, [{ type: 'hp', f: 24, order: 2 }]),
};

function circular(lib, b, pre, post) {
  const L = b.length;
  return new lib.Buf(b.data.map((d) => {
    const o = new Float32Array(pre + L + post);
    for (let i = 0; i < pre; i++) o[i] = d[mod(L - pre + i, L)];
    o.set(d, pre);
    for (let i = 0; i < post; i++) o[pre + L + i] = d[i % L];
    return o;
  }), b.sampleRate);
}

// Tonal balance targets: octave-band energy relative to the 250-1000 Hz octaves, in dB re pink noise (0 = equal energy per
// octave). Sample-based orchestral stems come out dark (2-8 kHz 4-9 dB under a typical mastered score, measured), which
// reads as muffled / cheap — especially on phone speakers that only play ~300 Hz-5 kHz. The 2-4 kHz targets stay a little
// under a typical score so gunfire (which lives there) keeps its space. The shelves are clamped (low -4..+2, presence
// -2..+5, air -3..+3 dB): a cue whose content is simply not there (calm has no 4 kHz instruments) stays as composed.
const OCT = [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const TILTS = {
  bright: { 63: 4.5, 2000: -4.5, 4000: -7, 8000: -9.5 },       // hybrid combat / boss: big low end, present
  orchestral: { 63: 1.5, 2000: -5, 4000: -8, 8000: -11.5 },    // menu theme, victory
  dark: { 63: 4, 2000: -6.5, 4000: -10, 8000: -12 },           // calm drone, defeat
};
/** Octave-band levels (dB, energy per octave = pink-referenced) relative to the mean of the 250 / 500 / 1000 Hz octaves. */
export function octaveBands(lib, b) {
  const { freqs, power } = lib.averageSpectrum(b, { size: 8192, maxFrames: 500 });
  const o = {};
  for (const c of OCT) { let s = 0; for (let k = 1; k < freqs.length; k++) if (freqs[k] >= c / Math.SQRT2 && freqs[k] < c * Math.SQRT2) s += power[k]; o[c] = 10 * Math.log10(s + 1e-30); }
  const ref = (o[250] + o[500] + o[1000]) / 3;
  for (const c of OCT) o[c] = Math.round((o[c] - ref) * 10) / 10;
  return o;
}
/** Three broad shelves (low 80 Hz, presence 2.2 kHz, air 8 kHz) fitted iteratively to a TILTS target. */
function tonalBalance(lib, b, measureOn, tilt, info) {
  const T = TILTS[tilt];
  if (!T) return b;
  const clamp = (v, a, z) => Math.max(a, Math.min(z, v));
  let gLow = 0, gPres = 0, gAir = 0, y = b;
  for (let it = 0; it < 4; it++) {
    const o = octaveBands(lib, measureOn(y));
    const eLow = T[63] - o[63], ePres = ((T[2000] - o[2000]) + (T[4000] - o[4000])) / 2, eAir = T[8000] - o[8000];
    if (Math.abs(eLow) < 0.3 && Math.abs(ePres) < 0.3 && Math.abs(eAir - ePres) < 0.3) break;
    gLow = clamp(gLow + eLow, -4, 2);
    gPres = clamp(gPres + ePres, -2, 5);
    gAir = clamp(gAir + eAir - ePres, -3, 3);
    y = lib.eq(b, [{ type: 'lowshelf', f: 80, gain: gLow, q: 0.6 }, { type: 'highshelf', f: 2200, gain: gPres, q: 0.55 }, { type: 'highshelf', f: 8000, gain: gAir, q: 0.6 }]);
  }
  if (info) info.tonal = { tilt, lowDb: +gLow.toFixed(1), presenceDb: +gPres.toFixed(1), airDb: +gAir.toFixed(1) };
  return y;
}

/**
 * Mono low end ("elliptical EQ"): the side signal is high-passed at `f`. The halls' low reverb tail is decorrelated and
 * the basses / tuba are panned, which left the side channel only 6.6-7.5 dB under the mid below 120 Hz (menu, defeat):
 * a wide, phasey sub on headphones and wasted headroom on a mono phone speaker.
 */
function monoBass(lib, b, f = 90) {
  if (b.channels < 2) return b;
  const [L, R] = b.data, n = b.length, S = new Float32Array(n);
  for (let i = 0; i < n; i++) S[i] = (L[i] - R[i]) * 0.5;
  const s = lib.eq(new lib.Buf([S], b.sampleRate), [{ type: 'hp', f, order: 2 }]).data[0];
  const oL = new Float32Array(n), oR = new Float32Array(n);
  for (let i = 0; i < n; i++) { const m = (L[i] + R[i]) * 0.5; oL[i] = m + s[i]; oR[i] = m - s[i]; }
  return new lib.Buf([oL, oR], b.sampleRate);
}

/** Master bus: EQ (fixed + tonal balance), glue compression, loudness + true-peak limiter. Loops are processed circularly. */
function master(lib, x, loop, { target = -18, ceiling = -1.8, glue = -12, tilt = 'bright' } = {}, info) {
  const P = loop ? Math.min(x.length, 4 * SR) : 0, Q = loop ? Math.round(0.3 * SR) : 0;
  let b = loop ? circular(lib, x, P, Q) : x;
  const core = (y) => (loop ? lib.sliceSamples(y, P, P + x.length) : y);
  b = monoBass(lib, b, 90);
  b = lib.eq(b, [{ type: 'hp', f: 24, order: 2 }, { type: 'lowshelf', f: 110, gain: 1 }, { type: 'peak', f: 320, gain: -1, q: 0.7 }, { type: 'highshelf', f: 10000, gain: 1.5 }]);
  b = tonalBalance(lib, b, core, tilt, info);
  b = lib.scale(b, db2lin(target - lib.lufs(core(b))));
  b = lib.compress(b, { threshold: glue, ratio: 2, attack: 0.02, release: 0.25, knee: 8 });
  let g = target - lib.lufs(core(b)), out = b;
  for (let it = 0; it < 5; it++) {
    out = lib.limit(lib.scale(b, db2lin(g)), { ceiling, attack: 0.002, release: 0.12 });
    const l = lib.lufs(core(out));
    if (Math.abs(l - target) < 0.05) break;
    g += target - l;
  }
  return core(out);
}

/** Stems -> processed, balanced, reverberated, folded, mastered stereo Buf. info collects per-stem loudness. */
function mixdown(lib, kit, T, def, info = {}) {
  const N = T.N, bus = [new Float32Array(N), new Float32Array(N)], send = [new Float32Array(N), new Float32Array(N)];
  let sends = 0;
  info.stems = {};
  for (const [name, data] of T.stems) {
    const spec = def.stems[name];
    if (!spec) throw new Error(`music/${def.name}: stem '${name}' has no mix spec`);
    let b = new lib.Buf(data);
    const l0 = lib.lufs(b);
    if (!Number.isFinite(l0)) continue;
    b = lib.scale(b, db2lin(-20 - l0));
    b = (CHAINS[spec.chain ?? name] || ((L, y) => y))(lib, b);
    if (spec.duck) { const e = T.duckCurve(spec.duck, spec.duckRelease ?? 0.16); for (const d of b.data) for (let i = 0; i < N; i++) d[i] *= e[i]; }
    const g = db2lin(spec.lufs - lib.lufs(b)), s = g * (spec.send ?? 0);
    for (let c = 0; c < 2; c++) {
      const d = b.data[c], o = bus[c], w = send[c];
      for (let i = 0; i < N; i++) { o[i] += d[i] * g; if (s) w[i] += d[i] * s; }
    }
    if (s) sends++;
    info.stems[name] = { lufs: spec.lufs, send: spec.send ?? 0, raw: Math.round(l0 * 10) / 10 };
    if (info.onStem) info.onStem(name, lib.scale(b, g));
  }
  if (sends) {
    const wet = lib.convolve(new lib.Buf(send), kit.ir(def.hall ?? 'hall'), { wetOnly: true, length: N / SR });
    const wg = db2lin(def.verbDb ?? 0);
    for (let c = 0; c < 2; c++) { const d = wet.data[c], o = bus[c]; for (let i = 0; i < N; i++) o[i] += d[i] * wg; }
  }
  let out = new lib.Buf(bus);
  if (T.loop) out = new lib.Buf(bus.map((d) => { const o = new Float32Array(T.L); for (let i = 0; i < N; i++) o[i % T.L] += d[i]; return o; }));
  out = master(lib, out, T.loop, def.master, info);
  if (!T.loop) {
    out = lib.trimSilence(out, { threshDb: -66, pre: 0, post: 0.05, start: false, fadeOutSec: 0.3 });
  }
  return out;
}

// ================================================================================================ composition helpers
const H = {
  /** Play a melody [[note, beats]...] starting at bar `bar` on `inst`, legato (each note overlaps into the next). */
  melody(T, kit, stem, inst, phrase, bar, { vel = 0.8, oct = 0, pan = 0, db = 0, legato = 0.12, rel = 0.35, accent = 0.08, R, velCurve } = {}) {
    let beat = 0;
    const lead = INSTR[inst].lead || 0;
    phrase.forEach(([n, beats], i) => {
      if (n) {
        const dur = beats * T.spb + legato;
        let v = vel + (Math.abs(beat % 4) < 1e-6 ? accent : 0) + (R ? R.range(-0.03, 0.03) : 0);
        if (velCurve) v *= velCurve(i / phrase.length);
        T.add(stem, kit.note(inst, M(n) + 12 * oct, { vel: Math.min(1, v), dur, rel }), T.t(bar, beat) - lead + (R ? R.range(-0.006, 0.006) : 0), { pan, db });
      }
      beat += beats;
    });
  },
  /** Sustained chord: notes on one instrument (spread pan slightly). */
  chord(T, kit, stem, inst, notes, at, dur, { vel = 0.7, pan = 0, db = 0, rel = 0.6, spread = 0.15 } = {}) {
    const lead = INSTR[inst]?.lead || 0;
    notes.forEach((n, i) => {
      const p = pan + (notes.length > 1 ? (i / (notes.length - 1) - 0.5) * 2 * spread : 0);
      T.add(stem, kit.note(inst, n, { vel, dur, rel }), at - lead, { pan: p, db });
    });
  },
  /** 16-step pattern over a bar range calling fn(bar, step, char, chord). */
  steps(T, bars, prog, str, fn) {
    const P = typeof str === 'function' ? null : pat(str);
    for (const bar of bars) {
      const ch = prog[(bar - 1) % prog.length];
      const list = P ?? pat(str(bar, ch));
      for (const [i, c] of list) fn(bar, i, c, ch);
    }
  },
  range: (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i),
  /** Chord runs over bars [from, to]: [{ bar, ch, len }], len = bars the chord lasts (capped at max). Sustained parts
   *  iterate these instead of a fixed 2-bar stride, so a held note never rings over a chord change. */
  runs(prog, from, to, max = 2) {
    const out = [];
    for (let b = from; b <= to;) {
      const ch = prog[(b - 1) % prog.length];
      let len = 1;
      while (len < max && b + len <= to && prog[(b + len - 1) % prog.length] === ch) len++;
      out.push({ bar: b, ch, len });
      b += len;
    }
    return out;
  },
};

/** Ostinato on a sampled short instrument: chars r/t/f/o (+ upper-case = accent). */
function ostinato(T, kit, stem, inst, bars, prog, str, lo, { vel = 0.75, acc = 0.18, pan = 0, db = 0, R, swing = 0 } = {}) {
  const lead = INSTR[inst].lead || 0;
  H.steps(T, bars, prog, str, (bar, i, c, ch) => {
    const lc = c.toLowerCase();
    const m = ctone(ch, TONE_OF[lc] ?? 0, lo);
    const v = Math.min(1, vel + (c !== lc ? acc : 0) + (R ? R.range(-0.04, 0.04) : 0));
    const sw = i % 2 ? swing : 0;
    T.add(stem, kit.note(inst, m, { vel: v }), T.s16(bar, i + sw) - lead + (R ? R.range(-0.004, 0.004) : 0), { pan, db });
  });
}

/** Distorted synth bass line (one note per step char; '_' extends the previous note). */
function bassLine(T, kit, lib, bars, prog, str, lo, { len = 0.9, drive = 14, cut = 700, db = 0, sub = 0.55 } = {}) {
  H.steps(T, bars, prog, str, (bar, i, c, ch) => {
    const m = ctone(ch, TONE_OF[c.toLowerCase()] ?? 0, lo);
    const dur = Math.round((T.spb / 4) * len * 1000) / 1000;
    const b = kit.cache(`db:${m}:${dur}:${drive}:${cut}:${sub}`, () => distBass(lib, m, dur, { drive, cut, sub }));
    T.add('bass', b, T.s16(bar, i), { db: db + (c === c.toUpperCase() ? 1.5 : 0) });
  });
}

/** Drum kit pattern for a bar: { k, s, h, H (open hat) } strings (X x o g velocities). */
function drumBar(T, kit, bar, P, { R, kickOpts = {}, snareOpts = {}, hatDb = 0, kickDb = 0, snareDb = 0 } = {}) {
  for (const [i, c] of pat(P.k || '')) { const t = T.s16(bar, i); T.add('drums', kit.kick(kit.next('k'), kickOpts), t, { gain: VEL[c], db: kickDb }); T.kicks.push(t); }
  for (const [i, c] of pat(P.s || '')) T.add('drums', kit.snare(kit.next('s'), snareOpts), T.s16(bar, i), { gain: VEL[c], db: snareDb });
  for (const [i, c] of pat(P.h || '')) T.add('drums', kit.hat(kit.next('h')), T.s16(bar, i) + (R ? R.range(-0.003, 0.003) : 0), { gain: VEL[c] * (R ? R.range(0.85, 1) : 1), db: hatDb - 3, pan: 0.25 });
  for (const [i, c] of pat(P.H || '')) T.add('drums', kit.hat(0, { open: true }), T.s16(bar, i), { gain: VEL[c], db: hatDb - 5, pan: 0.2 });
}

/** Tom fill over the last `steps` 16ths of a bar, descending. */
function tomFill(T, kit, bar, str, { db = 0 } = {}) {
  const toms = ['A3', 'F3', 'D3', 'A2', 'F2'];
  const list = pat(str);
  list.forEach(([i, c], j) => T.add('perc', kit.tom(toms[Math.min(toms.length - 1, Math.floor(j / Math.max(1, list.length) * toms.length))], j), T.s16(bar, i), { gain: VEL[c], db, pan: 0.3 - 0.6 * j / Math.max(1, list.length - 1) }));
}

/** Sample-based swell envelope applied to a Buf (fade in over `a`, out over the last `r` seconds). */
function swell(lib, b, a, r) { return lib.fadeOut(lib.fadeIn(b, a, 'sine'), r, 'sine'); }

// ================================================================================================ tracks
const ALL_BARS = H.range(1, 32);

export const TRACKS = [
  // ------------------------------------------------------------------------------------------ calm
  {
    name: 'calm', bpm: 140, bars: 32, vol: 0.8, intensity: 0, sync: 'd140', priority: 10, master: { tilt: 'dark' },
    uses: ['cbSus', 'celloSus', 'vlnTrem', 'piano', 'choir', 'bdMuted', 'hat', 'tbell', 'gongScrape', 'taiko', 'bd'],
    stems: {
      low: { lufs: -22.5, send: 0.2 }, pad: { lufs: -27.5, send: 0.25 }, perc: { lufs: -25.5, send: 0.08 }, keys: { lufs: -25.5, send: 0.55 },
      high: { lufs: -27.5, send: 0.4 }, choir: { lufs: -28, send: 0.5 }, fx: { lufs: -29, send: 0.4 }, drums: { lufs: -32, send: 0.15 },
    },
    compose(T, kit, lib, R) {
      // drone: contrabass D2 for the whole loop (its release folds into the start) + cellos on the slow harmony
      T.add('low', kit.note('cbSus', 'D2', { vel: 0.62, dur: T.len - 0.4, rel: 2.2 }), 0, { pan: 0.3 });
      for (let b = 1; b <= 32; b += 2) {
        const ch = PROG[b - 1];
        // legato: the old note releases as the new one speaks (it used to ring ~1 s, full level, over the next chord)
        T.add('low', kit.note('celloSus', ctone(ch, 0, M('G2')), { vel: 0.42, dur: 2 * T.barSec + 0.05, rel: 0.6 }), T.t(b) - 0.07, { pan: 0.15 });
      }
      // dark pad (filtered supersaw) + sub; chords cross-fade around the bar line (old -14 dB by then, new -8 dB)
      for (let b = 1; b <= 32; b += 2) {
        const ch = PROG[b - 1];
        for (const m of voicing(ch, M('A3'), M('F4'))) T.add('pad', kit.cache(`calmpad:${m}`, () => superSaw(lib, m, 2 * T.barSec - 0.2, { cutoff: 650, att: 1.4, rel: 1.2, voices: 6, spread: 18, seed: `cp${m}` })), T.t(b) - 0.6, { db: -2 });
      }
      // sub: an exactly loop-periodic sine (whole number of cycles per loop) so it never phase-cancels at the seam
      T.add('pad', kit.cache('calmsub', () => lib.toStereo(lib.tone(T.len, { type: 'sine', freq: Math.round(hz('D1') * T.len) / T.len }))), 0, { db: -9 });
      // heartbeat pulse (lub-dub every half note) — the "tension clock" of the buy phase
      for (let b = 1; b <= 32; b++) for (const beat of [0, 2]) {
        T.add('perc', kit.heartbeat(0), T.t(b, beat), { db: 0 });
        T.add('perc', kit.heartbeat(1), T.t(b, beat + 0.42), { db: -5 });
      }
      // ticking: soft hats on the beat from bar 3 (accent on 1), more urgent 8ths in bars 25-32
      for (let b = 3; b <= 32; b++) for (let s = 0; s < 16; s += b >= 25 ? 2 : 4) T.add('drums', kit.hat(s / 2), T.s16(b, s), { gain: s === 0 ? 1 : s % 4 ? 0.45 : 0.7, pan: s % 8 ? 0.45 : -0.45 });
      // bell toll + piano motif (high, sparse) + low piano cluster
      T.add('keys', kit.shot('tbell', { note: 'D5', vel: 0.6 }), 0, { db: -3, pan: -0.2 });
      T.add('keys', kit.shot('tbell', { note: 'D5', vel: 0.5 }), T.t(17), { db: -5, pan: -0.2 });
      const motif = [['A5', 0], ['F5', 2], ['D5', 4], ['E5', 6]];
      for (const b of [3, 7, 11, 19, 23, 27]) for (const [n, beat] of motif) T.add('keys', kit.note('piano', n, { vel: 0.42 + R.range(-0.04, 0.04) }), T.t(b, beat), { pan: 0.25 });
      for (const b of [9, 25]) for (const n of ['D2', 'A2', 'Eb3']) T.add('keys', kit.note('piano', n, { vel: 0.5 }), T.t(b), { db: -4, pan: -0.1 });
      // high violin tremolo swells (eerie: 9th over the root) and choir "ooh"
      for (const [b, notes] of [[5, ['A4', 'E5']], [13, ['G4', 'D5']], [21, ['A4', 'F5']], [29, ['G4', 'D5']]]) {
        for (const n of notes) T.add('high', swell(lib, kit.note('vlnTrem', n, { vel: 0.5, dur: 4 * T.barSec, rel: 1 }), 2.5, 3), T.t(b), { pan: -0.35 });
      }
      // one swell per chord (a 4-bar hold rang Eb + Bb over the A chord of bars 31-32)
      for (const { bar, ch, len } of H.runs(PROG, 17, 32)) {
        for (const m of [ctone(ch, 0, M('D3')), ctone(ch, 2, M('D3'))]) T.add('choir', swell(lib, kit.note('choir', m, { vel: 0.5, dur: len * T.barSec - 0.2, rel: 1.0, filter: (z) => z.tags.includes('ooh') || z.tags.includes('uh') }), 1.2, 1.2), T.t(bar) - 0.15, { db: -2 });
      }
      // distant drums hinting the next wave + a metal scrape before the loop restarts
      for (const b of [13, 15, 29, 31]) T.add('perc', kit.taiko(b, { deep: true }), T.t(b), { db: -9 });
      T.add('fx', kit.shot('gongScrape'), T.t(15), { db: -2, pan: 0.3 });
      T.add('fx', kit.shot('gongScrape'), T.t(30, 2), { db: 0, pan: -0.3 });
    },
  },

  // ------------------------------------------------------------------------------------------ combat_low
  {
    name: 'combat_low', bpm: 140, bars: 32, vol: 0.9, intensity: 1, sync: 'd140', priority: 10,
    uses: ['celloSpic', 'cbSpic', 'violaSpic', 'vlnTrem', 'celloSus', 'hornSus', 'hornStac', 'tubaStac', 'timp', 'bd', 'bdMuted', 'snare', 'hat', 'crash', 'taiko', 'metal', 'cymSwell', 'gongSmack'],
    stems: {
      drums: { lufs: -21, send: 0.06 }, perc: { lufs: -23.5, send: 0.18 }, low: { lufs: -22.5, send: 0.14, duck: 1.5 },
      high: { lufs: -27, send: 0.3 }, brass: { lufs: -23, send: 0.26 }, bass: { lufs: -24, duck: 5 }, pad: { lufs: -29, send: 0.2, duck: 3 },
      synth: { lufs: -29, send: 0.12, duck: 4 }, fx: { lufs: -27, send: 0.3 },
    },
    compose(T, kit, lib, R) {
      // drums: half-time groove
      const K = ['X.....x...X.....', 'X.....x...X..x..', 'X.....x...X.....', 'X..x..x...X..x.x'];
      for (let b = 1; b <= 32; b++) {
        const fill = b % 8 === 0;
        drumBar(T, kit, b, { k: fill ? 'X.....x.........' : K[(b - 1) % 4], s: fill ? '........X.......' : '........X.......', h: b <= 4 ? 'x...x...x...x...' : 'x.o.x.o.x.o.x.o.' }, { R, hatDb: -2 });
        if (fill) tomFill(T, kit, b, '..........xxXxXX');
      }
      for (const b of [1, 9, 17, 25]) { T.add('drums', kit.shot('crash', { k: b }), T.t(b), { db: -4, pan: -0.3 }); T.add('fx', kit.impact(b % 2, { gong: b === 1 || b === 17 }), T.t(b), { db: 0 }); }
      // taiko accents + timpani on the chord roots
      H.steps(T, ALL_BARS, PROG, (b) => (b > 16 ? 'X..x..x...X..x..' : 'X.........x.....'), (b, i, c) => T.add('perc', kit.taiko(i + b, { deep: c === 'X', semis: c === 'X' ? -2 : 1 }), T.s16(b, i), { gain: VEL[c], pan: i % 2 ? 0.2 : -0.2 }));
      for (let b = 1; b <= 32; b += 2) T.add('perc', kit.note('timp', ctone(PROG[b - 1], 0, M('F2')), { vel: 0.8 }), T.t(b), { db: -3 });
      // strings: galloping cellos + basses (8ths), violas 3-3-2 from bar 9, violin tremolo pads from bar 17
      ostinato(T, kit, 'low', 'celloSpic', ALL_BARS, PROG, 'R.rrR.rrR.rrR.rr', M('G2'), { vel: 0.66, acc: 0.2, pan: 0.25, R });
      ostinato(T, kit, 'low', 'cbSpic', ALL_BARS, PROG, (b) => (b <= 8 ? 'R.......r.......' : 'R...r...R...r...'), M('G1'), { vel: 0.72, pan: 0.4, R, db: -1 });
      ostinato(T, kit, 'high', 'violaSpic', H.range(9, 32), PROG, 'O..o..o.O..o..o.', M('G3'), { vel: 0.62, pan: 0.1, R });
      for (let b = 17; b <= 32; b += 2) H.chord(T, kit, 'high', 'vlnTrem', voicing(PROG[b - 1], M('A4'), M('F5')).slice(-2), T.t(b), 2 * T.barSec - 0.05, { vel: 0.55, pan: -0.35, rel: 0.5 });
      // sustained cellos (harmony bed) bars 9-16
      for (let b = 9; b <= 16; b += 2) H.chord(T, kit, 'low', 'celloSus', [ctone(PROG[b - 1], 0, M('C3')), ctone(PROG[b - 1], 2, M('C3'))], T.t(b), 2 * T.barSec, { vel: 0.5, pan: 0.2, db: -4 });
      // brass: low stabs on chord changes (from bar 9), horn theme C/D in bars 17-32
      for (let b = 9; b <= 32; b += 2) {
        const ch = PROG[b - 1];
        H.chord(T, kit, 'brass', 'hornStac', voicing(ch, M('D3'), M('Bb3')), T.t(b), undefined, { vel: 0.78, pan: -0.25 });
        T.add('brass', kit.note('tubaStac', ctone(ch, 0, M('A#1')), { vel: 0.85 }), T.t(b) - 0.012, { pan: 0.3, db: -1 });
      }
      H.melody(T, kit, 'brass', 'hornSus', THEME.C, 17, { vel: 0.72, pan: -0.2, R });
      H.melody(T, kit, 'brass', 'hornSus', THEME.D, 25, { vel: 0.78, pan: -0.2, R });
      H.melody(T, kit, 'brass', 'hornSus', THEME.D, 25, { vel: 0.6, pan: -0.1, oct: -1, R, db: -3 });
      // distorted bass (sidechained) + sub pad
      bassLine(T, kit, lib, H.range(1, 32), PROG, (b) => (b <= 8 ? 'R.......r.....r.' : 'R.r.r.r.R.r.r.r.'), M('G1'), { len: 1.6, drive: 11, cut: 520 });
      for (let b = 1; b <= 32; b += 2) for (const m of voicing(PROG[b - 1], M('D3'), M('D4'))) T.add('pad', kit.cache(`clpad:${m}`, () => superSaw(lib, m, 2 * T.barSec, { cutoff: 1100, att: 0.4, rel: 0.6, voices: 5, seed: `cl${m}` })), T.t(b), { db: -3 });
      // synth pulse 16ths in bars 9-16 and 25-32
      H.steps(T, [...H.range(9, 16), ...H.range(25, 32)], PROG, 'roforoforofoforo', (b, i, c, ch) => {
        const m = ctone(ch, TONE_OF[c], M('D4'));
        T.add('synth', kit.cache(`pl:${m}`, () => pulseNote(lib, m, { cut: 1400 })), T.s16(b, i), { gain: i % 4 === 0 ? 1 : 0.6, pan: i % 2 ? 0.4 : -0.4 });
      });
      // builds into bar 17 and back into bar 1
      for (const b of [17, 1]) {
        T.add('fx', kit.cache('rise2', () => riser(lib, 2 * T.barSec, { seed: 'cl-rise' })), T.t(b) - 2 * T.barSec, { db: -3 });
        T.add('fx', kit.reverseCymbal(1.6, 0), T.t(b) - 1.6, { db: -2 });
      }
      T.add('fx', kit.shot('cymSwell'), T.t(29), { db: -6 });
    },
  },

  // ------------------------------------------------------------------------------------------ combat_high
  {
    name: 'combat_high', bpm: 140, bars: 32, vol: 1, intensity: 2, sync: 'd140', priority: 10,
    uses: ['celloSpic', 'cbSpic', 'violaSpic', 'vlnSpic', 'vlnTrem', 'hornSus', 'hornStac', 'tbnSus', 'tubaSus', 'tubaStac', 'timp', 'bd', 'bdMuted', 'snare', 'hat', 'crash', 'cymMetal', 'taiko', 'metal', 'gongSmack', 'cymSwell'],
    stems: {
      drums: { lufs: -20, send: 0.05 }, perc: { lufs: -23, send: 0.16 }, low: { lufs: -22, send: 0.12, duck: 1.5 },
      high: { lufs: -26, send: 0.28 }, brass: { lufs: -22, send: 0.24 }, bass: { lufs: -23, duck: 6 }, synth: { lufs: -29, send: 0.1, duck: 4 },
      fx: { lufs: -26, send: 0.3 },
    },
    compose(T, kit, lib, R) {
      const K = ['X..x..X...X..x..', 'X..x..X...X.xx.x', 'X..x..X.x.X..x..', 'X..x..X...X..xxx'];
      for (let b = 1; b <= 32; b++) {
        const fill = b % 8 === 0, build = b >= 31;
        const P = { k: K[(b - 1) % 4], s: '....X.......X...', h: 'XxoxXxoxXxoxXxox', H: b % 2 ? '' : '..............x.' };
        if (fill) Object.assign(P, { k: 'X..x..X...X.....', s: '....X.......X.xx', H: '' });
        if (build) Object.assign(P, { s: b === 31 ? 'X.x.X.x.X.x.X.x.' : 'XxxxXxxxXxXxXXXX', h: 'x.x.x.x.x.x.x.x.' });
        drumBar(T, kit, b, P, { R, snareOpts: { big: b > 16 }, hatDb: -1 });
        if (fill && !build) tomFill(T, kit, b, '........XxXxXXXX');
      }
      for (let b = 1; b <= 32; b += 4) T.add('drums', kit.shot('crash', { k: b }), T.t(b), { db: -3, pan: b % 8 === 1 ? -0.3 : 0.3 });
      for (let b = 3; b <= 32; b += 4) T.add('drums', kit.shot('cymMetal'), T.t(b, 2), { db: -9, pan: 0.4 });
      for (const b of [1, 9, 17, 25]) T.add('fx', kit.impact(b % 2, { gong: b === 1 || b === 17 }), T.t(b));
      // taiko ensemble: low on 1 / 3-3-2, mid 16th rolls in fills
      H.steps(T, ALL_BARS, PROG, (b) => (b % 4 === 0 ? 'X..X..X.x.x.xxxx' : 'X..x..x.X..x..x.'), (b, i, c) => T.add('perc', kit.taiko(i + b, { deep: c === 'X', semis: c === 'X' ? -2 : 2 }), T.s16(b, i), { gain: VEL[c], pan: i % 2 ? 0.25 : -0.25 }));
      for (let b = 1; b <= 32; b += 2) T.add('perc', kit.note('timp', ctone(PROG[b - 1], 0, M('F2')), { vel: 0.92 }), T.t(b), { db: -2 });
      // strings: 16th 3-3-2 ostinato in cellos, 8th basses, violas offbeats, violins arps / tremolo
      ostinato(T, kit, 'low', 'celloSpic', ALL_BARS, PROG, 'RrrRrrRrRrrRrrfr', M('G2'), { vel: 0.64, acc: 0.24, pan: 0.25, R });
      ostinato(T, kit, 'low', 'cbSpic', ALL_BARS, PROG, 'R.r.r.r.R.r.r.r.', M('G1'), { vel: 0.74, pan: 0.42, R });
      ostinato(T, kit, 'high', 'violaSpic', ALL_BARS, PROG, '.o.o.O.o.o.O.o.o', M('G3'), { vel: 0.6, pan: 0.12, R });
      ostinato(T, kit, 'high', 'vlnSpic', H.range(9, 16), PROG, 'OtfoOtfoOtfoOtfo', M('D4'), { vel: 0.56, pan: -0.38, R });
      for (let b = 25; b <= 32; b += 2) H.chord(T, kit, 'high', 'vlnTrem', voicing(PROG[b - 1], M('D5'), M('A5')).slice(-2), T.t(b), 2 * T.barSec - 0.05, { vel: 0.66, pan: -0.38, rel: 0.4 });
      // brass: stabs in 1-8, theme B (9-16), C an octave up with violins (17-24), D with full low brass (25-32)
      for (let b = 1; b <= 8; b++) {
        const ch = PROG[b - 1];
        for (const i of [0, 3, 6]) {
          H.chord(T, kit, 'brass', 'hornStac', voicing(ch, M('D3'), M('Bb3')), T.s16(b, i), undefined, { vel: i ? 0.72 : 0.9, pan: -0.25 });
          T.add('brass', kit.note('tubaStac', ctone(ch, 0, M('A#1')), { vel: i ? 0.75 : 0.9 }), T.s16(b, i) - 0.012, { pan: 0.3 });
        }
      }
      H.melody(T, kit, 'brass', 'hornSus', THEME.B, 9, { vel: 0.82, pan: -0.25, R });
      H.melody(T, kit, 'brass', 'tbnSus', THEME.B, 9, { vel: 0.7, pan: 0.25, oct: -1, R, db: -2 });
      H.melody(T, kit, 'brass', 'hornSus', THEME.C, 17, { vel: 0.88, pan: -0.25, R });
      H.melody(T, kit, 'high', 'vlnTrem', THEME.C, 17, { vel: 0.7, pan: -0.38, R, legato: 0.05 });
      H.melody(T, kit, 'brass', 'tbnSus', THEME.C, 17, { vel: 0.72, pan: 0.25, oct: -1, R, db: -2 });
      H.melody(T, kit, 'brass', 'hornSus', THEME.D, 25, { vel: 0.92, pan: -0.25, R });
      H.melody(T, kit, 'brass', 'tbnSus', THEME.D, 25, { vel: 0.8, pan: 0.25, oct: -1, R });
      for (let b = 17; b <= 32; b += 2) T.add('brass', kit.note('tubaSus', ctone(PROG[b - 1], 0, M('A#1')), { vel: 0.8, dur: 2 * T.barSec - 0.1, rel: 0.3 }), T.t(b) - 0.05, { pan: 0.3, db: -1 });
      // distorted bass: 16ths, accents with the cellos
      bassLine(T, kit, lib, ALL_BARS, PROG, 'RrrRrrRrRrrRrrrr', M('G1'), { len: 0.85, drive: 16, cut: 650 });
      // pulse arp layer in 17-32
      H.steps(T, H.range(17, 32), PROG, 'rofTrofTrofTrofT', (b, i, c, ch) => {
        const m = ctone(ch, TONE_OF[c.toLowerCase()] ?? 0, M('D4')) + (c === 'T' ? 12 : 0);
        T.add('synth', kit.cache(`pl:${m}`, () => pulseNote(lib, m, { cut: 1700 })), T.s16(b, i), { gain: i % 4 === 0 ? 1 : 0.65, pan: i % 2 ? 0.45 : -0.45 });
      });
      for (const b of [9, 17, 25, 1]) T.add('fx', kit.reverseCymbal(1.2, b % 2), T.t(b) - 1.2, { db: -3 });
      T.add('fx', kit.cache('rise4', () => riser(lib, 4 * T.barSec, { seed: 'ch-rise' })), T.t(29), { db: -2 });
      T.add('fx', kit.shot('cymSwell'), T.t(13), { db: -6 });
    },
  },

  // ------------------------------------------------------------------------------------------ boss
  {
    name: 'boss', bpm: 140, bars: 32, vol: 1, intensity: 3, priority: 10,
    uses: ['celloSpic', 'cbSpic', 'violaSpic', 'vlnTrem', 'hornSus', 'hornStac', 'tbnSus', 'tubaSus', 'tubaStac', 'timp', 'choir', 'bd', 'bdMuted', 'snare', 'hat', 'crash', 'cymMetal', 'taiko', 'metal', 'gong', 'gongSmack', 'tbnFx', 'cymSwell', 'bdRoll'],
    stems: {
      drums: { lufs: -21.5, send: 0.06 }, perc: { lufs: -21.5, send: 0.2 }, low: { lufs: -22.5, send: 0.12, duck: 1 },
      high: { lufs: -26, send: 0.3 }, brass: { lufs: -21.5, send: 0.26 }, choir: { lufs: -23, send: 0.42 }, bass: { lufs: -23.5, duck: 5 },
      pad: { lufs: -27, send: 0.25, duck: 2 }, fx: { lufs: -25, send: 0.3 },
    },
    master: { glue: -11 },
    compose(T, kit, lib, R) {
      const P = BOSS_PROG;
      // taiko ensemble (half-time epic in 1-16, driving in 17-32)
      const low = (b) => (b <= 16 ? 'X.....X...X.....' : b <= 24 ? 'X..x..X...X..x..' : 'X..X..X.X..X..X.');
      const mid = (b) => (b <= 16 ? '..x.x...x...x.xx' : 'xxx.x.xx.xx.x.xx');
      H.steps(T, ALL_BARS, P, low, (b, i, c) => { T.add('perc', kit.taiko(b + i, { deep: true, semis: -3 }), T.s16(b, i), { gain: VEL[c] }); T.kicks.push(T.s16(b, i)); });
      H.steps(T, ALL_BARS, P, mid, (b, i, c) => T.add('perc', kit.taiko(i, { semis: 3 }), T.s16(b, i), { gain: VEL[c] * 0.7, pan: i % 2 ? 0.35 : -0.35 }));
      for (let b = 1; b <= 32; b++) T.add('perc', kit.note('timp', ctone(P[b - 1], 0, M('F2')), { vel: b % 2 ? 0.95 : 0.7 }), T.t(b), { db: -2 });
      // hybrid kit: snare on 3 (half-time) then 2&4, hats
      for (let b = 1; b <= 32; b++) {
        const half = b <= 16;
        drumBar(T, kit, b, { k: half ? 'X.........X.....' : 'X..x..X...X..x..', s: half ? '........X.......' : (b >= 31 ? 'X.x.X.x.XxxxXXXX' : '....X.......X...'), h: half ? 'x.x.x.x.x.x.x.x.' : 'xoxoxoxoxoxoxoxo' }, { R, snareOpts: { big: true } });
      }
      for (let b = 1; b <= 32; b += 4) T.add('drums', kit.shot('crash', { k: b }), T.t(b), { db: -3, pan: -0.3 });
      for (const b of [1, 17]) T.add('fx', kit.shot('gong', { k: b === 1 ? 0 : 1 }), T.t(b), { db: -2 });
      for (const b of [1, 9, 17, 25]) T.add('fx', kit.impact(b % 2, { gong: false, size: 1.2 }), T.t(b));
      for (let b = 5; b <= 32; b += 8) T.add('fx', kit.shot('metal', { k: b }), T.t(b, 2), { db: -10, pan: 0.5 });
      // braams at section starts: brass cluster + distorted saw stack
      for (const b of [1, 9, 17, 25]) {
        const ch = P[b - 1], r = ctone(ch, 0, M('A1'));
        for (const [inst, m, v] of [['tubaSus', r, 1], ['tbnSus', r + 12, 1], ['tbnSus', r + 19, 0.95], ['hornSus', r + 24, 0.95], ['hornSus', r + 27 + (ch === 'A' ? 1 : 0), 0.9]]) T.add('brass', swell(lib, kit.note(inst, m, { vel: v, dur: 1.4, rel: 1.1 }), 0.02, 0.8), T.t(b) - 0.04, { db: 1 });
        T.add('pad', kit.cache(`braam:${r}`, () => lib.saturate(superSaw(lib, r + 12, 1.6, { voices: 7, spread: 30, att: 0.02, rel: 1.4, seed: `br${r}`, sweep: (t) => 300 + 2600 * Math.exp(-t / 0.5), q: 1.2 }), { drive: 14, type: 'tube' })), T.t(b), { db: 0 });
      }
      // strings: 16th ostinato on chord roots, violin tremolo shrieks in 17-32
      ostinato(T, kit, 'low', 'celloSpic', ALL_BARS, P, 'RrrRrrRrRrrRrrfr', M('G2'), { vel: 0.66, acc: 0.24, pan: 0.25, R });
      ostinato(T, kit, 'low', 'cbSpic', ALL_BARS, P, 'R.r.r.r.R.r.r.r.', M('G1'), { vel: 0.76, pan: 0.42, R });
      ostinato(T, kit, 'high', 'violaSpic', H.range(9, 32), P, '.o.o.O.o.o.O.o.o', M('G3'), { vel: 0.6, pan: 0.12, R });
      for (const { bar, ch, len } of H.runs(P, 17, 32)) H.chord(T, kit, 'high', 'vlnTrem', voicing(ch, M('C5'), M('A5')).slice(-3), T.t(bar), len * T.barSec - 0.05, { vel: 0.7, pan: -0.38, rel: 0.4 });
      // brass: boss motif (low horns + trombones) 9-16, theme D (heroic, menacing context) 17-24, stabs 25-32
      H.melody(T, kit, 'brass', 'hornSus', BOSS_MOTIF, 9, { vel: 0.88, pan: -0.25, R });
      H.melody(T, kit, 'brass', 'tbnSus', BOSS_MOTIF, 9, { vel: 0.84, pan: 0.25, oct: -1, R });
      H.melody(T, kit, 'brass', 'hornSus', THEME.D, 17, { vel: 0.92, pan: -0.25, R });
      H.melody(T, kit, 'brass', 'tbnSus', THEME.D, 17, { vel: 0.85, pan: 0.25, oct: -1, R });
      for (let b = 25; b <= 32; b++) for (const i of [0, 3, 6, 10]) {
        const ch = P[b - 1];
        H.chord(T, kit, 'brass', 'hornStac', voicing(ch, M('D3'), M('Bb3')), T.s16(b, i), undefined, { vel: i ? 0.8 : 0.95, pan: -0.25 });
        T.add('brass', kit.note('tubaStac', ctone(ch, 0, M('A#1')), { vel: 0.9 }), T.s16(b, i) - 0.012, { pan: 0.3 });
      }
      // sustained parts follow the chord runs: bars 25-30 change chord every bar (a 2-bar hold put D under Eb)
      for (const { bar, ch, len } of H.runs(P, 1, 32)) T.add('brass', kit.note('tubaSus', ctone(ch, 0, M('A#1')), { vel: 0.75, dur: len * T.barSec - 0.1, rel: 0.3 }), T.t(bar) - 0.05, { pan: 0.3, db: -3 });
      // choir: crowd vowels + formant synth, one chord per run ("ah" / "oh"), stronger in 17-32
      for (const { bar, ch, len } of H.runs(P, 1, 32)) {
        const vowel = bar % 4 === 1 ? 'aah' : 'o', v = bar > 16 ? 0.85 : 0.65;
        for (const m of voicing(ch, M('C3'), M('A3'))) {
          T.add('choir', kit.note('choir', m, { vel: v, dur: len * T.barSec - 0.2, rel: 0.8, filter: (z) => z.tags.includes(vowel) }), T.t(bar) - 0.15, { pan: (m % 3 - 1) * 0.3 });
          T.add('choir', kit.cache(`sch:${m}:${vowel}:${len}`, () => synthChoir(lib, m + 12, len * T.barSec - 0.2, { vowel: vowel === 'o' ? 'o' : 'a', seed: `bc${m}${vowel}` })), T.t(bar) - 0.1, { db: -5 });
        }
      }
      // distorted bass + low drone
      bassLine(T, kit, lib, ALL_BARS, P, (b) => (b <= 16 ? 'R.....r...R.....' : 'RrrRrrRrRrrRrrrr'), M('G1'), { len: 0.9, drive: 18, cut: 600 });
      // builds / fx
      T.add('fx', kit.shot('bdRoll'), T.t(15), { db: -4 });
      T.add('fx', kit.cache('rise4b', () => riser(lib, 4 * T.barSec, { seed: 'boss-rise' })), T.t(29), { db: -2 });
      T.add('fx', kit.shot('tbnFx', { k: 1 }), T.t(8, 2), { db: -6, pan: 0.3 });
      T.add('fx', kit.shot('cymSwell'), T.t(13), { db: -5 });
    },
  },

  // ------------------------------------------------------------------------------------------ menu_theme
  {
    name: 'menu_theme', bpm: 80, bars: 24, vol: 0.9, intensity: 1, priority: 10, hall: 'hall', master: { tilt: 'orchestral' },
    uses: ['piano', 'cbSus', 'celloSus', 'celloSpic', 'cbSpic', 'vlnSus', 'vlnTrem', 'hornSus', 'tbnSus', 'tubaSus', 'hornStac', 'timp', 'choir', 'taiko', 'bd', 'tbell', 'gong', 'crash', 'cymSwell', 'timpRoll'],
    stems: {
      keys: { lufs: -24, send: 0.42 }, low: { lufs: -22, send: 0.22 }, high: { lufs: -26, send: 0.35 }, brass: { lufs: -21.5, send: 0.3 },
      choir: { lufs: -25, send: 0.45 }, perc: { lufs: -22.5, send: 0.25 }, pad: { lufs: -27, send: 0.3 }, fx: { lufs: -27, send: 0.4 },
    },
    compose(T, kit, lib, R) {
      const P = MENU_PROG;
      // piano arpeggio (8ths): bars 1-12 and 21-24 (thinner in 13-20)
      const arp = { Dm: ['D4', 'A4', 'D5', 'A4', 'F5', 'A4', 'E5', 'A4'], Bb: ['D4', 'Bb4', 'D5', 'Bb4', 'F5', 'Bb4', 'D5', 'Bb4'], Gm: ['D4', 'G4', 'D5', 'G4', 'Bb4', 'G4', 'D5', 'G4'],
        A: ['C#4', 'A4', 'C#5', 'A4', 'E5', 'A4', 'C#5', 'A4'], Eb: ['Eb4', 'Bb4', 'Eb5', 'Bb4', 'G5', 'Bb4', 'Eb5', 'Bb4'] };
      for (let b = 1; b <= 24; b++) {
        const v = b <= 4 ? 0.5 : b <= 12 ? 0.42 : b <= 20 ? 0.3 : b === 24 ? 0.46 : 0.4;
        arp[P[b - 1]].forEach((n, i) => T.add('keys', kit.note('piano', n, { vel: v + (i % 2 ? -0.06 : 0.03) + R.range(-0.03, 0.03) }), T.t(b, i / 2) + R.range(-0.004, 0.004), { pan: 0.2 }));
      }
      for (const b of [1, 13]) T.add('keys', kit.shot('tbell', { note: 'D5' }), T.t(b), { db: -6, pan: -0.25 });
      // drone + low strings
      T.add('low', kit.note('cbSus', 'D2', { vel: 0.6, dur: 4 * T.barSec, rel: 2 }), 0, { pan: 0.3 });
      for (let b = 5; b <= 24; b++) {
        const ch = P[b - 1];
        if (b > 5 && P[b - 2] === ch) continue;
        let len = 1; while (b - 1 + len < 24 && P[b - 1 + len] === ch && len < 2) len++;
        H.chord(T, kit, 'low', 'celloSus', [ctone(ch, 0, M('C3')), ctone(ch, 2, M('C3'))], T.t(b), len * T.barSec, { vel: b >= 13 && b <= 20 ? 0.75 : 0.55, pan: 0.2, rel: 0.8 });
        T.add('low', kit.note('cbSus', ctone(ch, 0, M('A1')), { vel: 0.65, dur: len * T.barSec, rel: 0.8 }), T.t(b) - 0.08, { pan: 0.35 });
      }
      // violins: high sustained harmony from bar 9, tremolo tension in 23
      for (let b = 9; b <= 22; b++) {
        const ch = P[b - 1];
        if (b > 9 && P[b - 2] === ch) continue;
        H.chord(T, kit, 'high', 'vlnSus', voicing(ch, M('A4'), M('F5')).slice(-2), T.t(b), (P[b] === ch ? 2 : 1) * T.barSec, { vel: b >= 13 ? 0.68 : 0.5, pan: -0.35, rel: 0.7 });
      }
      H.chord(T, kit, 'high', 'vlnTrem', ['A4', 'E5'], T.t(23), T.barSec, { vel: 0.6, pan: -0.35, rel: 0.8 });
      // theme: horn solo (A, 5-12), tutti (B, 13-20): horns + trombones + cellos in octaves, then outro chords
      H.melody(T, kit, 'brass', 'hornSus', THEME.A, 5, { vel: 0.62, pan: -0.2, R, legato: 0.18 });
      H.melody(T, kit, 'brass', 'hornSus', THEME.B, 13, { vel: 0.86, pan: -0.25, R, legato: 0.18 });
      H.melody(T, kit, 'brass', 'tbnSus', THEME.B, 13, { vel: 0.74, pan: 0.25, oct: -1, R, legato: 0.18 });
      H.melody(T, kit, 'high', 'vlnSus', THEME.B, 13, { vel: 0.6, pan: -0.35, oct: 1, R, legato: 0.15, db: -3 });
      for (let b = 13; b <= 20; b += 2) T.add('brass', kit.note('tubaSus', ctone(P[b - 1], 0, M('A#1')), { vel: 0.7, dur: 2 * T.barSec - 0.1, rel: 0.4 }), T.t(b) - 0.05, { pan: 0.3, db: -3 });
      for (const [b, ch, v] of [[21, 'Bb', 0.75], [22, 'Gm', 0.7], [23, 'A', 0.68]]) {
        H.chord(T, kit, 'brass', 'hornSus', voicing(ch, M('D4'), M('A4')), T.t(b), T.barSec, { vel: v, pan: -0.2, rel: 0.7 });
        H.chord(T, kit, 'brass', 'tbnSus', [ctone(ch, 0, M('A#2')), ctone(ch, 2, M('A#2'))], T.t(b), T.barSec, { vel: v - 0.08, pan: 0.25, rel: 0.7 });
      }
      // choir in the tutti and the outro
      for (let b = 13; b <= 23; b += (b >= 21 ? 1 : 2)) {
        const ch = P[b - 1], len = b >= 21 ? 1 : 2;
        for (const m of voicing(ch, M('C3'), M('A3'))) T.add('choir', kit.note('choir', m, { vel: b >= 21 ? 0.6 : 0.75, dur: len * T.barSec - 0.15, rel: 0.9, filter: (z) => z.tags.includes(b % 4 === 1 ? 'aah' : 'o') }), T.t(b) - 0.15, { pan: (m % 3 - 1) * 0.3 });
      }
      // percussion: soft taiko from 9, full pattern 13-20, timpani roll into 13 and 23
      for (let b = 9; b <= 12; b++) for (const beat of [0, 2.5]) T.add('perc', kit.taiko(b + beat, { deep: beat === 0, semis: -2 }), T.t(b, beat), { db: beat ? -9 : -5 });
      const tk = ['X..x..x.X...x.x.', 'X..x..x.X..x.xxx'];
      for (let b = 13; b <= 20; b++) for (const [i, c] of pat(tk[b % 2])) T.add('perc', kit.taiko(b + i, { deep: c === 'X', semis: c === 'X' ? -2 : 2 }), T.s16(b, i), { gain: VEL[c], pan: i % 2 ? 0.2 : -0.2 });
      for (let b = 13; b <= 20; b += 2) T.add('perc', kit.note('timp', ctone(P[b - 1], 0, M('F2')), { vel: 0.85 }), T.t(b), { db: -2 });
      T.add('perc', lib.fadeIn(kit.shot('timpRoll', { note: 'D3' }), 2.5, 'exp'), T.t(11), { db: -4 });
      T.add('perc', kit.shot('crash', { k: 0 }), T.t(13), { db: -5, pan: -0.3 });
      T.add('perc', kit.shot('bd', { k: 0 }), T.t(13), { db: -2 });
      T.add('fx', kit.shot('cymSwell'), T.t(11) + 0.4, { db: -4 });
      T.add('fx', kit.shot('gong', { k: 0 }), T.t(13), { db: -6 });
      T.add('fx', kit.shot('gong', { k: 1 }), T.t(21), { db: -10 });
      // low pulse under the tutti (spiccato 8ths) + sub
      ostinato(T, kit, 'low', 'celloSpic', H.range(13, 20), P, 'R.r.r.r.R.r.r.r.', M('G2'), { vel: 0.6, pan: 0.25, R, db: -4 });
      ostinato(T, kit, 'low', 'cbSpic', H.range(13, 20), P, 'R.......R...r...', M('G1'), { vel: 0.7, pan: 0.4, R, db: -3 });
      for (let b = 1; b <= 24; b++) T.add('pad', kit.cache(`mpad:${P[b - 1]}`, () => superSaw(lib, ctone(P[b - 1], 0, M('A2')), T.barSec, { cutoff: 520, att: 1.2, rel: 1.6, voices: 6, spread: 16, seed: `mp${b}` })), T.t(b), { db: -4 });
    },
  },

  // ------------------------------------------------------------------------------------------ stingers
  {
    name: 'wave_start', bpm: 140, bars: 2, loop: false, length: 3.2, tail: 4, vol: 1, priority: 6, maxHeadMs: 900,
    uses: ['hornStac', 'tubaStac', 'celloSpic', 'cbSpic', 'violaSpic', 'vlnSpic', 'timp', 'bd', 'taiko', 'crash', 'gongSmack', 'celloTrem', 'cbSus', 'cymSwell'],
    stems: { perc: { lufs: -20, send: 0.25 }, brass: { lufs: -20, send: 0.3 }, low: { lufs: -21, send: 0.25 }, high: { lufs: -24, send: 0.3 }, fx: { lufs: -22, send: 0.3 } },
    compose(T, kit, lib) {
      const hit1 = 0.86, hit2 = hit1 + T.spb * 0.75;
      T.add('fx', kit.reverseCymbal(hit1, 1), 0, { db: -2 });
      T.add('fx', riser(lib, hit1, { seed: 'ws-rise', f0: 600 }), 0, { db: -6 });
      for (const [t, ch, big] of [[hit1, 'Dm', true], [hit2, 'Dm', false]]) {
        T.add('perc', kit.impact(big ? 0 : 1, { gong: big }), t, { db: big ? 0 : -3 });
        T.add('perc', kit.note('timp', 'D3', { vel: 0.95 }), t, { db: -2 });
        H.chord(T, kit, 'brass', 'hornStac', ['D3', 'F3', 'A3', 'D4'], t, undefined, { vel: 0.95, pan: -0.2 });
        T.add('brass', kit.note('tubaStac', 'D2', { vel: 1 }), t - 0.01, { pan: 0.25 });
        for (const [inst, n, p] of [['cbSpic', 'D2', 0.4], ['celloSpic', 'D3', 0.25], ['violaSpic', 'A3', 0.1], ['vlnSpic', 'D4', -0.3], ['vlnSpic', 'A4', -0.4]]) T.add(inst.startsWith('vln') || inst.startsWith('viola') ? 'high' : 'low', kit.note(inst, n, { vel: big ? 1 : 0.85 }), t - 0.008, { pan: p });
      }
      T.add('perc', kit.shot('crash', { k: 0 }), hit1, { db: -4 });
      T.add('low', swell(lib, kit.note('celloTrem', 'D3', { vel: 0.8, dur: 2.2, rel: 1 }), 0.05, 1.5), hit2, { pan: 0.25, db: -3 });
      T.add('low', kit.note('cbSus', 'D2', { vel: 0.75, dur: 2, rel: 1.2 }), hit2, { pan: 0.35, db: -4 });
    },
  },
  {
    name: 'victory', bpm: 100, bars: 3, loop: false, length: 6.8, tail: 4, vol: 1, priority: 6, master: { tilt: 'orchestral' },
    uses: ['hornSus', 'hornStac', 'tbnSus', 'tubaSus', 'tubaStac', 'celloSus', 'cbSus', 'vlnTrem', 'celloSpic', 'vlnSpic', 'timp', 'timpRoll', 'choir', 'crash', 'gong', 'bd', 'taiko'],
    stems: { brass: { lufs: -19.5, send: 0.3 }, low: { lufs: -22, send: 0.25 }, high: { lufs: -24, send: 0.32 }, choir: { lufs: -24, send: 0.45 }, perc: { lufs: -21, send: 0.25 } },
    compose(T, kit, lib) {
      const b = T.spb; // 0.6 s
      // two pickup chords Bb -> C, then a long D major (picardy) with timpani roll, crash and gong
      for (const [t, notes, bass] of [[0, ['D3', 'F3', 'Bb3', 'D4'], 'Bb1'], [b, ['E3', 'G3', 'C4', 'E4'], 'C2']]) {
        H.chord(T, kit, 'brass', 'hornStac', notes, t, undefined, { vel: 0.92, pan: -0.2 });
        T.add('brass', kit.note('tubaStac', bass, { vel: 0.95 }), t - 0.01, { pan: 0.3 });
        T.add('perc', kit.taiko(t > 0 ? 1 : 0, { deep: true }), t, { db: -3 });
        T.add('perc', kit.note('timp', t > 0 ? 'C3' : 'A#2', { vel: 0.9 }), t, { db: -3 });
        for (const n of notes.slice(0, 2)) T.add('low', kit.note('celloSpic', n, { vel: 0.9 }), t - 0.008, { pan: 0.25 });
        T.add('high', kit.note('vlnSpic', M(notes[3]) + 12, { vel: 0.85 }), t - 0.008, { pan: -0.35 });
      }
      const t2 = 2 * b, hold = 4.2;
      T.add('perc', lib.fadeIn(lib.slice(kit.shot('timpRoll', { note: 'A2' }), 0, 1.25), 1.1, 'exp'), b, { db: -6 });
      H.chord(T, kit, 'brass', 'hornSus', ['D4', 'F#4', 'A4', 'D5'], t2, hold, { vel: 0.95, pan: -0.2, rel: 1.4 });
      H.chord(T, kit, 'brass', 'tbnSus', ['D3', 'A3', 'F#3'], t2, hold, { vel: 0.9, pan: 0.25, rel: 1.4 });
      T.add('brass', kit.note('tubaSus', 'D2', { vel: 0.95, dur: hold, rel: 1.4 }), t2 - 0.05, { pan: 0.3 });
      H.chord(T, kit, 'low', 'celloSus', ['D3', 'A3'], t2, hold, { vel: 0.85, pan: 0.2, rel: 1.4 });
      T.add('low', kit.note('cbSus', 'D2', { vel: 0.8, dur: hold, rel: 1.4 }), t2 - 0.08, { pan: 0.35 });
      H.chord(T, kit, 'high', 'vlnTrem', ['A4', 'D5', 'F#5', 'A5'], t2, hold, { vel: 0.8, pan: -0.35, rel: 1.4 });
      for (const n of ['D3', 'F#3', 'A3']) T.add('choir', kit.note('choir', n, { vel: 0.85, dur: hold - 0.3, rel: 1.4, filter: (z) => z.tags.includes('aah') }), t2 - 0.15);
      T.add('perc', kit.impact(0, { gong: false }), t2, { db: -2 });
      T.add('perc', kit.note('timp', 'D3', { vel: 1 }), t2, { db: -1 });
      T.add('perc', kit.shot('crash', { k: 0 }), t2, { db: -2, pan: -0.3 });
      T.add('perc', kit.shot('crash', { k: 1 }), t2, { db: -5, pan: 0.3 });
      T.add('perc', kit.shot('gong', { k: 1 }), t2, { db: -7 });
    },
  },
  {
    name: 'defeat', bpm: 60, bars: 2, loop: false, length: 7.2, tail: 6, vol: 1, priority: 6, hall: 'cathedral', master: { tilt: 'dark' },
    uses: ['tubaSus', 'tbnSus', 'hornSus', 'celloTrem', 'cbSus', 'piano', 'choir', 'gong', 'bd', 'bdMuted', 'taiko', 'tbnFx', 'vlnTrem'],
    stems: { brass: { lufs: -20.5, send: 0.35 }, low: { lufs: -21.5, send: 0.3 }, keys: { lufs: -24, send: 0.45 }, choir: { lufs: -25, send: 0.5 }, perc: { lufs: -21, send: 0.3 }, high: { lufs: -28, send: 0.45 } },
    compose(T, kit, lib) {
      // low piano cluster + gong, dissonant low brass swelling then sagging, strings sliding down, a dying heartbeat
      for (const n of ['D2', 'A2', 'Eb3', 'D1']) T.add('keys', kit.note('piano', n, { vel: 0.85 }), 0, { pan: -0.1 });
      T.add('perc', kit.shot('gong', { k: 0 }), 0, { db: -2 });
      T.add('perc', kit.impact(1, { gong: false, size: 1.4 }), 0, { db: -3 });
      const sag = (b, from, to) => lib.varispeedCurve(b, [[0, 1], [from, 1], [to, Math.pow(2, -1 / 12)], [99, Math.pow(2, -1 / 12)]]);
      T.add('brass', sag(swell(lib, kit.note('tubaSus', 'D2', { vel: 0.9, dur: 4.6, rel: 1.6 }), 0.6, 1.8), 2.2, 3.4), 0.05, { pan: 0.3 });
      T.add('brass', sag(swell(lib, kit.note('tbnSus', 'Eb3', { vel: 0.85, dur: 4.4, rel: 1.6 }), 0.8, 1.8), 2.2, 3.4), 0.1, { pan: 0.2 });
      T.add('brass', swell(lib, kit.note('hornSus', 'A3', { vel: 0.8, dur: 2.2, rel: 0.6 }), 0.8, 0.6), 0.15, { pan: -0.2 });
      T.add('brass', swell(lib, kit.note('hornSus', 'G#3', { vel: 0.75, dur: 2.6, rel: 1.6 }), 0.4, 1.8), 2.5, { pan: -0.2 });
      T.add('low', lib.varispeedCurve(kit.note('celloTrem', 'D3', { vel: 0.85, dur: 5.5, rel: 1.5 }), [[0, 1], [1.2, 1], [5, Math.pow(2, -7 / 12)], [99, Math.pow(2, -7 / 12)]]), 0.1, { pan: 0.25 });
      T.add('low', kit.note('cbSus', 'D2', { vel: 0.75, dur: 5.5, rel: 1.8 }), 0, { pan: 0.35 });
      T.add('high', swell(lib, kit.note('vlnTrem', 'D6', { vel: 0.5, dur: 3, rel: 1.5 }), 0.3, 2.5), 0.3, { pan: -0.4, db: -2 });
      for (const n of ['D3', 'F3', 'A3']) T.add('choir', swell(lib, kit.note('choir', n, { vel: 0.7, dur: 4.5, rel: 1.5, filter: (z) => z.tags.includes('ooh') || z.tags.includes('uh') }), 1.2, 2.5), 0.4);
      T.add('perc', kit.shot('tbnFx', { k: 1 }), 3.6, { db: -9, pan: 0.3 });
      for (const [t, v] of [[0.9, 1], [1.95, 0.85], [3.4, 0.7], [5.4, 0.5]]) { T.add('perc', kit.heartbeat(0), t, { gain: v, db: -3 }); T.add('perc', kit.heartbeat(1), t + 0.24 + (t > 3 ? 0.08 : 0), { gain: v * 0.6, db: -3 }); }
    },
  },
];

// ================================================================================================ render + produce
const SELF_HASH = crypto.createHash('sha1').update(fs.readFileSync(HERE)).digest('hex').slice(0, 12);

export async function renderTrack(lib, kit, def, ctx, info = {}) {
  await kit.ensure(def.uses);
  const T = new Track(lib, def);
  const R = ctx.rng(`track:${def.name}`);
  def.compose(T, kit, lib, R);
  const out = mixdown(lib, kit, T, def, info);
  info.len = T.len; info.loop = T.loop;
  kit.flush();
  return out;
}

/** Sample-to-sample jump across the loop seam relative to the 99.9th percentile of in-loop jumps. */
function seamCheck(b) {
  let worst = 0;
  for (const d of b.data) {
    const n = d.length, jumps = new Float32Array(Math.floor(n / 7));
    for (let i = 1, k = 0; k < jumps.length; i += 7, k++) jumps[k] = Math.abs(d[i] - d[i - 1]);
    jumps.sort();
    const p = jumps[Math.floor(jumps.length * 0.999)] || 1e-9;
    worst = Math.max(worst, Math.abs(d[0] - d[n - 1]) / p);
  }
  return worst;
}

export async function produce(lib, ctx) {
  const cat = ctx.category('music', { bus: 'music', spatial: false, channels: 2 });
  const kit = new Kit(lib, ctx);
  for (const def of TRACKS) {
    const t0 = Date.now();
    const buf = await ctx.cached(`music:${def.name}:${SELF_HASH}`, () => renderTrack(lib, kit, def, ctx));
    const loop = def.loop !== false;
    if (loop) ctx.log(`  music/${def.name}: rendered/loaded in ${((Date.now() - t0) / 1000).toFixed(1)} s, seam jump ${seamCheck(buf).toFixed(2)}x of p99.9`);
    const sources = [...new Set(def.uses.flatMap((u) => kit.ids(u)))];
    const entry = await cat.add(def.name, buf, {
      target: loop ? 'music' : 'stinger', loop, vol: def.vol, voices: 1, priority: def.priority, sources, maxHeadMs: def.maxHeadMs,
      note: loop ? `${def.bpm} BPM, ${def.bars} bars` : 'stinger',
    });
    Object.assign(entry, { bpm: def.bpm, beatsPerBar: def.beats ?? 4, bars: def.bars, key: 'D minor' });
    if (loop) Object.assign(entry, { loopStart: 0, loopEnd: Math.round((def.bars * (def.beats ?? 4) * 60 / def.bpm) * 1e6) / 1e6, intensity: def.intensity });
    if (def.sync) entry.sync = def.sync;
  }
  kit.flush();
  await cat.write();
}

// ------------------------------------------------------------------------------------------------ dev entry point
if (process.argv[1] && path.resolve(process.argv[1]) === HERE && process.argv.includes('--dev')) {
  const lib = await import(pathToFileURL(path.join(path.dirname(HERE), '..', 'lib', 'index.mjs')).href);
  const { createContext } = await import(pathToFileURL(path.join(path.dirname(HERE), '..', 'lib', 'producer.mjs')).href);
  const ctx = createContext({ name: 'music' });
  const kit = new Kit(lib, ctx);
  const want = process.argv[process.argv.indexOf('--dev') + 1];
  const stems = process.argv.includes('--stems');
  for (const def of TRACKS.filter((d) => !want || want === 'all' || d.name === want)) {
    const t0 = Date.now();
    const info = {
      onStem: (n, b) => {
        const m = lib.measure(b);
        console.log(`   stem ${n.padEnd(6)} ${m.lufs.toFixed(1)} LUFS  M ${m.momentaryMaxLufs.toFixed(1)}  centroid ${m.centroidHz}  ${JSON.stringify(m.bandsDb)}`);
        if (stems) ctx.preview(`${def.name}__${n}`, lib.sliceSamples(b, 0, Math.min(b.length, 30 * SR)));
      },
    };
    await kit.ensure(def.uses);
    console.log(`   samples loaded in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    const b = await renderTrack(lib, kit, def, ctx, info);
    const m = lib.measure(b);
    console.log(`${def.name}: ${((Date.now() - t0) / 1000).toFixed(1)} s render, ${lib.formatMeasure(m)} LRA ${m.lra} corr ${m.stereoCorr}${def.loop !== false ? ` seam ${seamCheck(b).toFixed(2)}x` : ''}`);
    console.log('   bands', JSON.stringify(m.bandsDb), ' octaves', JSON.stringify(octaveBands(lib, b)), ' tonal', JSON.stringify(info.tonal));
    console.log('   stems', JSON.stringify(info.stems));
    ctx.preview(def.name, b);
    console.log(`   rss ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB`);
  }
}
