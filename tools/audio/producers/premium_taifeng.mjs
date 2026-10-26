// E07 颱風眼．斬浪 Typhoon-Eye Tidecleaver (異能 weather-instrument greatsword, docs/PREMIUM_WEAPONS.md E07, 05d §8.2,
// §1.12) — category 'premium_taifeng': every cue game/src/weapons/premium/taifeng.js plays (its SFX table, the clips'
// 'snd' events, the idle hum, the def's ready cue) plus the def.sound contract (taifeng_close / _tail / _far: what a
// teammate hears if a swing is ever reported as a shot). No twin set: E07 is 異能 and §2.26 gives twins to 神兵 only.
//
// Palette: a 1.4 m gunmetal greatsword that is also a weather station. Its own voice is the wind-tunnel slot singing
// (aeolian whistles: band-passed air on a pitch, a sine under it, breath and flutter), tuned to G 宮 pentatonic
// (G A B D E) like every other tuned part; the brass instruments (barometer needle detents and hairspring, the dial's
// glass, a small brass bell, the anemometer's three cups whupping at their pass rate and its bearing), the steel blade
// (free-free bar modes as beating doublets: the 嗡 after a bite) and the storm itself: recorded gusts, howls, rain,
// surf, splashes and spray, synthesized droplets and rain, and lightning built from parts (the CC0 inventory holds no
// thunder: an N-wave split + a tearing rip + a falling boom + recorded blasts and rolling explosions slowed into the
// roll, premium_chunting / premium_staff recipe). The ultimate's bed is the eye wall roaring with a choir and a cello /
// contrabass drone moved onto G / D (VSCO 2 + a CC0 crowd choir).
//
//   combo    taifeng_swing / _swing2 (橫斬 right -> left, 反橫斬 left -> right; the code starts them 45 % of the way to
//            the hit, so the whoosh peaks 0.085 s in), _cleave_up (吸氣), _cleave (the chop, peak 0.13 s in), _recover
//            (收招), _flick (甩水)
//   hits     _hit (the bite: cut + meat + mass + a water slap + the blade's 嗡), _hit_flesh (per body), _hit_splash,
//            _hit_wall (wet clang), _kill (KE_GALE: a wind cut, a spiral of spray rising up the pentatonic, a ting),
//            _sever, _slam (劈地: 水拍 + 低頻「轟」), _slam_water (the crown of water)
//   draw     _drawslash (破浪: the draw-cut), _drawslash_wave (2D: the water arc sweeping right -> left)
//   charge   _charge (loop: 氣壓低鳴 + the slot breathing + the anemometer at 20 rad/s; the code rides its rate 0.8 ->
//            1.25), _charge_stage (rendered on G: the code's pitch 1 / 1.1225 rings G / A), _charge_full (on G:
//            pitch 1.26 lands it on B; thunder on the blade), _needle, _vane_out, _vane_in
//   gale     _gale (風刃聲), _gale_fly (the crescent leaving, doppler down), _gale_hit
//   throw    _throw (風嘯), _throw_fly (loop: the spinning water-wind blade, its rate rides the doppler), _throw_hit,
//            _throw_turn, _catch (「鏘」: the copy merging back into the blade)
//   颱風眼   §1.12 three layers: ① rise = _eye_rise (the pressure dropping: wind sucked inward, whistles and a cymbal /
//            timpani swell rising 0.8 -> 1.25) into ② its 40-60 Hz impact 0.5 s in (the wall up); ③ the bed = _eye_loop
//            (the eye wall's roar, rain, choir and strings on G / D); the release = _eye_after (the storm exhaling, rain
//            thinning to drips, the clouds breaking on a glass chord). Beats: _eye_cast (the slash + the 8 m water arc),
//            _eye_sigil (等壓線 低頻嗡), _eye_rain (2D loop, L4), _thunder (x7, one every 0.4 s), _collapse (巨浪拍岸 +
//            雷 + 40-60 Hz), _collapse_wave (the ring of water rushing out)
//   view     _idle (§1.12 hum loop), _draw, _draw_first (baked to the 1.6 s clip), _catch_grip, _first_sting,
//            _thunder_far (遠雷 of the first draw), _inspect (§1.12: an original 2.6 s phrase), _glass_tap,
//            _rotor_flick, _wipe, _gust_blow (the rare inspect's squall)
//   ready    ready_taifeng (unique in the game: the slot's thin storm whistle D6 -> G6, the anemometer kicking, a brass
//            ting, the storm lamp's relay)
//
//   node --max-old-space-size=2048 tools/audio/build.mjs --only premium_taifeng
//   dev subset (never into the game folder: a subset run deletes the other files of the category):
//   CF_AUDIO_OUT=tools/audio/out/tf-dev TF_ONLY=combo,hits node --max-old-space-size=2048 tools/audio/run-producer.mjs \
//     tools/audio/producers/premium_taifeng.mjs --spectrograms all
//   groups: combo hits draw charge gale throw ult view ready contract ref (ref = the sequences as the player hears them)
import { fileURLToPath } from 'node:url';
import { makeKit } from './weapons.mjs';

const SR = 48000;
let L, ctx, K;

const S = {
  // air: a 1.1 m sword's whoom, four katana passes, a clean fast swoosh
  whoom: 'fs:60024', katana: 'fs:263595', swoosh: 'fs:507466',
  // wind: isolated strong gusts (peaks ~3.85 / 15.3 / 28.0 s), a gusty stereo howl, a polar gale, a low roaring storm
  gusts: 'fs:459981', howl: 'fs:117611', polar: 'fs:521820', roar: 'fs:405601',
  // rain: strong rain and wind (heaviest 8-11 s), light rural rain (mono)
  rain: 'fs:265627', rainLight: 'fs:200273',
  // water: splashes, wet splats, a droplet hit, a bright squish, a hose (spray hiss), surf (crashes ~0.9 / 5.7 / 19.2 s),
  // waves on a breakwater (3 / 15.5 s), an ocean wash
  bigSplash: 'fs:442773', deepSplash: 'fs:212143', rockSplash: 'fs:583348', splash: 'fs:398032', wetA: 'fs:495117', wetB: 'fs:495118',
  waterBullet: 'fs:672574', squish: 'fs:737232', hose: 'fs:754321', waves: 'fs:376799', breakwater: 'fs:384360', surf: 'fs:482855',
  // metal and mechanics: a deep clang, a metal hit, a heavy bullet ping (bright steel ring), a metal thud on the
  // ground, gear friction (a rail sliding), revolver clicks (detents), gun cocking, Kenney metal + glass, a tea cup
  clang: 'fs:201094', metalHit: 'fs:406562', ping: 'fs:351371', groundThud: 'fs:640204', friction: 'fs:517150', clicks: 'fs:677159', cock: 'fs:632822', cup: 'fs:389432',
  metalH: (k) => `kenney_impact/Audio/impactMetal_heavy_00${k % 5}`, metalL: (k) => `kenney_impact/Audio/impactMetal_light_00${k % 5}`, glassL: (k) => `kenney_impact/Audio/impactGlass_light_00${k % 5}`,
  // leather and cloth
  holster: 'fs:388819', cloth: 'fs:334219',
  // flesh and bone
  gash: 'fs:420674', slice: 'fs:504615', meaty: 'fs:779805', wet: 'fs:626405', gross: 'fs:641040', gore: 'fs:641046', splat: 'fs:414296', bone: 'fs:355052', neck: 'fs:134025',
  // the street
  concSmash: 'fs:522099', concHit: 'fs:321477', rubble: 'fs:758580', stone: 'fs:569510', debris: 'fs:703247',
  // thunder bodies (blasts) and the roll (rolling explosions, slowed)
  blast: 'fs:398283', medium: 'fs:516914', deep: 'fs:258195', roll: 'fs:264031', rollSub: 'fs:275196',
  // VSCO 2: gongs, a soft-mallet cymbal roll (crescendo peaks ~3.5 s), a timpani roll (~F2 +0.5 st), tubular bells;
  // the crowd choir (O / U vowels, F3 +18 c); cello tremolo D3, contrabass D2
  gong: 'fs:375532', gongHard: 'fs:375531', cymRoll: 'fs:375519', timpRoll: 'fs:373943', tbC4: 'fs:374273', tbC5: 'fs:374274',
  choirO: 'fs:764339', choirU: 'fs:764341', celloTrem: 'fs:372845', bassD2: 'fs:373133',
};
const midi = (m) => 440 * 2 ** ((m - 69) / 12);
// G 宮 pentatonic (G A B D E)
const N = {
  G1: midi(31), D2: midi(38), G2: midi(43), B2: midi(47), D3: midi(50), G3: midi(55), A3: midi(57), B3: midi(59), D4: midi(62), E4: midi(64),
  G4: midi(67), A4: midi(69), B4: midi(71), D5: midi(74), E5: midi(76), G5: midi(79), A5: midi(81), B5: midi(83), D6: midi(86), E6: midi(88),
  G6: midi(91), A6: midi(93), B6: midi(95), D7: midi(98), E7: midi(100), G7: midi(103),
};
const PENTA = [N.G5, N.A5, N.B5, N.D6, N.E6, N.G6, N.A6, N.B6, N.D7];
const CHOIR_F = 176.4;   // the crowd choir sings F3 +18 c

// ------------------------------------------------------------------------------------------------ small helpers
const at = (buf, t = 0, gain = 0, pan) => (pan === undefined ? { buf, at: t, gain } : { buf, at: t, gain, pan });
const nrm = (b, db = -1) => L.normalizePeak(b, db);
const mono = (b) => (b.channels === 1 ? b : L.toMono(b));
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const rng = (s) => L.rng(L.hashSeed(s));
/** linear breakpoints [[t, v]...] -> fn(t) (automate() reads a points array as dB) */
const ev = (pts) => { const f = L.toFn(pts); return (t) => Math.max(0, f(t)); };
const tight = (b, t60) => L.decay(b, t60, 0.02);
const cut = (b, len, fade = 0.3) => L.fadeOut(L.slice(b, 0, Math.min(len, b.duration)), Math.min(len, b.duration) * fade, 'exp');
let USED = new Set();                                  // sources loaded since the last add() (per-sound credits)
/** A smooth random wobble in [-1, 1] (detuned sines), seeded. */
function wobble(seed, hz = [3.7, 7.3, 12.9]) {
  const r = rng(seed), ph = hz.map(() => r.next() * 6.283), w = hz.map((_, i) => 1 / (i + 1));
  const sum = w.reduce((a, b) => a + b, 0);
  return (t) => hz.reduce((a, f, i) => a + Math.sin(6.283 * f * t + ph[i]) * w[i], 0) / sum;
}
/** Peaks shaved by the soft clipper until the peak-to-loudness ratio lets the loudness stage reach `lufs` without the
 *  limiter (premium_sunbow / premium_chunting recipe). */
function dense(b, lufs, extra = -0.2, max = 12) {
  const want = (-1.4 - lufs) + extra, plr = (x) => L.truePeakDb(x) - L.lufs(x);
  let o = K.clipToPLR(b, want, { min: 0, max, threshold: -6 }), got = plr(o);
  if (got > want + 0.3) {
    const c = L.compress(L.pad(L.normalizePeak(b, -1), 0.004, 0), { threshold: -20, ratio: 3, attack: 0.001, release: 0.05, knee: 6, lookahead: 0.003 });
    const o2 = K.clipToPLR(L.slice(c, 0.004), want, { min: 0, max, threshold: -6 }), g2 = plr(o2);
    if (g2 < got) { o = o2; got = g2; }
  }
  if (got > want + 0.5) ctx.log(`    (clipper reached PLR ${got.toFixed(1)} of ${want.toFixed(1)})`);
  return o;
}
// band-share targets (weapons.mjs balance() bands)
const BAL = {
  big: { sub: -12, low: -7, lowMid: -5, mid: -4.5, high: -9, air: -14 },
  hit: { sub: -15, low: -8, lowMid: -5, mid: -4.5, high: -8, air: -13 },
  air: { sub: -18, low: -11, lowMid: -6, mid: -4.5, high: -7, air: -11 },
  water: { sub: -18, low: -10, lowMid: -6, mid: -4.5, high: -6.5, air: -10 },
};
const shape = (b, t, amount = 0.6) => K.balance(b, BAL[t] || t, amount);
/** Parallel crush under the open mix (density without losing the transient). */
function thicken(m, { pre = 0.004, crush = 0.42 } = {}) {
  const c = L.slice(L.compress(L.pad(nrm(m, 0), pre, 0), { threshold: -26, ratio: 5, attack: 0.0008, release: 0.02, knee: 6, makeup: 14, lookahead: 0.002 }), pre);
  return L.mix([{ buf: nrm(m, 0), gainLin: 0.75 }, { buf: c, gainLin: crush }]);
}
/** Load a source slice (mono unless ch = 2), high-passed, faded, peak-normalised. */
async function src(id, start, end, { ch = 1, hp = 60, lp, semis = 0, rate, fade = 0.05 } = {}) {
  USED.add(id);
  let b = await ctx.load(id, { start, end, ...(ch === 1 ? { channels: 1 } : {}) });
  if (ch === 2 && b.channels === 1) b = L.toStereo(b);
  if (semis) b = L.varispeedSemis(b, semis);
  if (rate) b = L.varispeed(b, rate);
  b = L.eq(b, [{ type: 'hp', f: hp, order: 2 }, ...(lp ? [{ type: 'lp', f: lp, order: 2 }] : [])]);
  return nrm(L.fadeOut(L.fadeIn(b, 0.002), Math.min(fade, b.duration * 0.2), 'exp'));
}
/** weapons.mjs grab() (cut around the loudest hit / first onset), credited. */
const grab = (id, a, z, o) => { USED.add(id); return K.grab(id, a, z, o); };
const memo = new Map();
const once = async (key, fn) => { if (!memo.has(key)) memo.set(key, await fn()); return memo.get(key); };
/** Start a slice at its transient (first sample within `rel` dB of its peak, walked back to the rise). */
function onset(b, rel = -20) {
  const th = L.peak(b) * L.db2lin(rel);
  let i = 0;
  outer: for (; i < b.length; i++) for (const d of b.data) if (Math.abs(d[i]) > th) break outer;
  const lim = Math.max(0, i - Math.round(0.004 * SR));
  let j = i;
  while (j > lim && b.data.some((d) => Math.abs(d[j - 1]) > th * 0.08)) j--;
  return L.fadeIn(L.sliceSamples(b, j, b.length), 0.0008, 'sine');
}
/** Time (s) of the loudest `win` of a buffer. */
function peakTime(b, win = 0.01) {
  const m = mono(b).data[0], w = Math.max(1, Math.round(win * SR));
  let best = 0, bi = 0, s = 0;
  for (let i = 0; i < m.length; i++) { s += m[i] * m[i]; if (i >= w) s -= m[i - w] * m[i - w]; if (s > best) { best = s; bi = i - w / 2; } }
  return Math.max(0, bi) / SR;
}
/** A mix layer placed so the source's loudest 10 ms lands at time T (a head that would start before 0 is trimmed). */
function alignAt(b, T, gain = 0, win = 0.01) {
  const p = peakTime(b, win);
  if (p <= T) return { buf: b, at: T - p, gain };
  return { buf: L.fadeIn(L.slice(b, p - T, b.duration), Math.min(0.03, Math.max(0.004, T * 0.5)), 'sine'), at: 0, gain };
}
/** Equal-power pan that moves: p(t) in [-1, 1] (mono-safe: the centre sums to the source). */
function panMove(b, p) {
  const m = mono(b).data[0], n = m.length, l = new Float32Array(n), r = new Float32Array(n);
  for (let i = 0; i < n; i++) { const a = (clamp(p(i / SR), -1, 1) + 1) * Math.PI / 4; l[i] = m[i] * Math.cos(a) * Math.SQRT2; r[i] = m[i] * Math.sin(a) * Math.SQRT2; }
  return new L.Buf([l, r], SR);
}

// Lost Town's street for the skills (a little longer than 'urban': the shopfronts trade echoes)
const STREET = {
  length: 2.4, predelay: 0.02,
  echoes: { count: 16, t: [0.03, 0.7], gain: [0.16, 0.5], lp: [6000, 1700], spread: [0.003, 0.035], pan: 1 },
  tail: { rt60: 1.7, rtLow: 2.1, rtHigh: 0.55, gain: 0.48, start: 0.06, build: 0.14, lp: 3000, hp: 55 },
};
// open sky over the streets: thunder hangs long and dark
const SKY = {
  length: 3.2, predelay: 0.03,
  echoes: { count: 12, t: [0.07, 0.8], gain: [0.15, 0.4], lp: [4800, 1500], spread: [0.004, 0.04], pan: 1 },
  tail: { rt60: 2.4, rtLow: 3.0, rtHigh: 0.9, gain: 0.5, start: 0.06, build: 0.2, lp: 3400, hp: 45 },
};
// close air around the player's own sword (2D cues): a short, bright early field
const NEAR = {
  length: 0.9, predelay: 0.004,
  echoes: { count: 10, t: [0.006, 0.07], gain: [0.15, 0.4], lp: [10000, 5000], spread: [0.0005, 0.004], pan: 1 },
  tail: { rt60: 0.6, rtLow: 0.7, rtHigh: 0.35, gain: 0.35, start: 0.01, build: 0.02, lp: 8000, hp: 120 },
};
/** Dry + a space whose send is high-passed (`hp` Hz): booms stay tight, the room carries the body and the air. */
function verb(b, env, wet, { seed = 'vb', ch = 2, length, hp = 160 } = {}) {
  const w = L.convolve(L.eq(b, [{ type: 'hp', f: hp, order: 2 }]), L.makeIR(env, { seed, channels: ch, length }), { wet: 1, dry: 0 });
  return L.mix([{ buf: ch === 2 && b.channels === 1 ? L.toStereo(b) : b }, { buf: w, gainLin: wet }], { channels: ch });
}

// ------------------------------------------------------------------------------------------------ seamless loops
// (premium_sunbow / premium_chunting): `noisy` (rendered P + X) is crossfaded onto its own head; `tonal` (every
// component periodic in P) is rendered W + P and cut [W, W + P] after its filters have settled.
const onGrid = (f, P) => Math.max(1, Math.round(f * P)) / P;
function seamless(P, X, noisy, tonal, W = 0.5) {
  const a = L.loopCrossfade(L.fitLength(noisy, P + X), X);
  if (!tonal) return a;
  const t = L.slice(tonal, W, W + P), ch = Math.max(a.channels, t.channels);
  return L.mix([at(L.setChannels(a, ch)), at(L.setChannels(t, ch))], { length: P, channels: ch });
}
/** A smooth random function periodic in P (Catmull-Rom through `n` seeded points that wrap). */
function pRand(P, n, seed) {
  const r = rng(seed), v = Array.from({ length: n }, () => r.next() * 2 - 1);
  return (t) => {
    const x = ((((t / P) * n) % n) + n) % n, i = Math.floor(x), f = x - i;
    const a = v[(i - 1 + n) % n], b = v[i], c = v[(i + 1) % n], d = v[(i + 2) % n];
    return 0.5 * (2 * b + (c - a) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (3 * b - a - 3 * c + d) * f * f * f);
  };
}
/** Loop QA: the wrap step against the file's typical sample step, and the level either side of the seam. */
function seamCheck(name, b) {
  const d = L.toMono(b).data[0], n = d.length, w = Math.round(0.2 * SR);
  let step = 0; for (let i = 1; i < n; i++) step += Math.abs(d[i] - d[i - 1]); step /= n - 1;
  const r = (a, z) => { let s = 0; for (let i = a; i < z; i++) s += d[i] * d[i]; return 10 * Math.log10(s / (z - a) + 1e-20); };
  const jump = Math.abs(d[0] - d[n - 1]) / Math.max(1e-9, step), lv = r(n - w, n) - r(0, w);
  ctx.log(`  loop ${name}: wrap step x${jump.toFixed(1)}, level across the seam ${lv.toFixed(1)} dB`);
  if (jump > 4 || Math.abs(lv) > 2.5) ctx.warn(`${name}: loop seam (step x${jump.toFixed(1)}, ${lv.toFixed(1)} dB)`);
}

// ------------------------------------------------------------------------------------------------ the air kit
/** Swept band-noise whoosh peaking at `peak`: centre f0 -> fp (at the peak) -> f1. */
function swoosh(dur, peak, [f0, fp, f1], { q = 1.6, color = 'pink', seed = 'sw', rise = 2, fall = 6 } = {}) {
  const F = (t) => (t < peak ? f0 * (fp / f0) ** (t / peak) : fp * (f1 / fp) ** ((t - peak) / Math.max(1e-3, dur - peak)));
  const s = L.sweep(L.noise(dur, { color, seed }), 'bp', F, { q });
  return nrm(L.automate(s, (t) => (t < peak ? (t / peak) ** rise : Math.exp(-(t - peak) * fall / Math.max(1e-3, dur - peak)))));
}
/**
 * The slot singing: an aeolian whistle on f (Hz or fn(t)) — white noise through narrow band-passes on the harmonics
 * `h` (air rushing past an edge locks to a pitch but keeps its breath), a sine on the pitch for the core, a broad
 * breath band, a flutter in level and a hair of pitch wander. Raw: callers envelope it.
 */
function aeolian(dur, f, { q = 50, h = [1, 0.3, 0.1], tone = -7, breath = -20, flutter = 0.3, vib = 0.004, seed = 'ae' } = {}) {
  const F = L.toFn(f), w = wobble(seed + 'w', [4.3, 7.9, 13.1]), fl = wobble(seed + 'a', [2.1, 5.7, 11.3]);
  const layers = [];
  h.forEach((a, i) => {
    if (a <= 0) return;
    const b = L.sweep(L.noise(dur, { seed: `${seed}n${i}` }), 'bp', (t) => Math.min(16000, F(t) * (i + 1) * (1 + vib * w(t))), { q: q * (1 + i * 0.3) });
    layers.push(at(nrm(b), 0, 20 * Math.log10(a)));
  });
  layers.push(at(nrm(L.tone(dur, { type: 'sine', freq: (t) => F(t) * (1 + vib * w(t)) })), 0, tone));
  layers.push(at(nrm(L.sweep(L.noise(dur, { color: 'pink', seed: seed + 'b' }), 'bp', (t) => Math.min(12000, F(t) * 1.4), { q: 1.1 })), 0, breath));
  return nrm(L.automate(L.mix(layers), (t) => 1 - flutter + flutter * (0.5 + 0.5 * fl(t))));
}
/** A whistle passing: pitch rises `up` st to the pass at `peak` and falls `down` st after (doppler), level bell-shaped. */
function whistlePass(dur, peak, f0, { up = 1.5, down = -4, sharp = 2.2, fall = 6, q = 45, seed = 'wp', h } = {}) {
  const f = (t) => f0 * 2 ** ((t < peak ? -1 + (up + 1) * (t / peak) : up + (down - up) * Math.min(1, (t - peak) / (dur - peak))) / 12);
  return nrm(L.automate(aeolian(dur, f, { q, seed, ...(h ? { h } : {}) }), (t) => (t < peak ? (t / peak) ** sharp : Math.exp(-(t - peak) * fall / (dur - peak)))));
}
/** One recorded storm gust (fs:459981, three isolated gusts), high-passed out of the mic rumble, peak at its centre. */
const GUSTS = [[2.6, 5.4], [13.9, 16.9], [26.5, 29.6]];
const gust = (k, o = {}) => once(`gust${k % 3}`, () => src(S.gusts, GUSTS[k % 3][0], GUSTS[k % 3][1], { hp: 140, fade: 0.4, ...o }));
/** The howl (fs:117611, gusty stereo howl 3-31 s): a slice, stereo kept. */
const howl = (a, d, o = {}) => src(S.howl, a, a + d, { ch: 2, hp: 90, fade: 0.2, ...o });

// ------------------------------------------------------------------------------------------------ the water kit
/** One droplet: a bubble resonance whose pitch rises as it closes (f0 -> f0 x rise), a tiny tick on the surface. */
function droplet(f0, { rise = 1.6, tr = 0.008, t60 = 0.05, seed = 'dp', tick = -14 } = {}) {
  const dur = t60 + 0.02;
  const s = L.tone(dur, { type: 'sine', freq: (t) => f0 * (1 + (rise - 1) * (1 - Math.exp(-t / tr))) });
  const tk = L.noiseBurst({ dur: 0.005, decay: 0.0015, hp: 2500, lp: 12000, seed: seed + 't' });
  return L.mix([at(L.applyEnv(s, L.expEnv(dur, { attack: 0.0004, t60 }))), at(tk, 0, tick)]);
}
/** Drops falling over `dur`: a Poisson patter at rate(t) per second, pitches log-uniform in [lo, hi]. */
function patter(dur, rate, { lo = 900, hi = 4200, t60 = [0.02, 0.06], seed = 'pt', tick = -12, notes = null } = {}) {
  const r = rng(seed), R = L.toFn(rate), out = [];
  let t = 0;
  for (let guard = 0; guard < 4000; guard++) {
    t += -Math.log(1 - r.next() * 0.999) / Math.max(1e-3, R(t));
    if (t >= dur) break;
    const f = notes ? notes[r.int(0, notes.length - 1)] * (1 + r.range(-0.004, 0.004)) : lo * (hi / lo) ** r.next();
    out.push(at(droplet(f, { rise: r.range(1.25, 2.1), tr: r.range(0.004, 0.012), t60: r.range(t60[0], t60[1]), seed: `${seed}${guard}`, tick: tick + r.range(-6, 6) }), t, -r.next() * 12));
  }
  return out.length ? nrm(L.mix(out, { length: dur })) : L.Buf.seconds(dur, 1);
}
/** Synthesized rain on a hard surface: a hiss band, dense small ticks, a patter of drops; level wobbling (gusts). */
function rainSynth(dur, { seed = 'rn', drops = 90, gustHz = [0.31, 0.73] } = {}) {
  const hiss = L.eq(L.noise(dur, { color: 'pink', seed }), [{ type: 'hp', f: 1400, order: 2 }, { type: 'peak', f: 4800, gain: 4, q: 0.7 }, { type: 'lp', f: 12000, order: 2 }]);
  const ticks = L.crackle(dur, { density: 1800, decay: 0.0006, hp: 2600, minAmp: 0.05, seed: seed + 'c' });
  const dr = patter(dur, drops, { lo: 1200, hi: 5200, t60: [0.012, 0.035], seed: seed + 'p', tick: -6 });
  const w = wobble(seed + 'g', gustHz);
  return nrm(L.automate(L.mix([at(nrm(hiss)), at(nrm(ticks), 0, -5), at(dr, 0, -9)]), (t) => 0.75 + 0.25 * w(t)));
}
/** Spray hiss from the hose recording (fs:754321, 0.05-10 s): `d` s from `a`, high-passed. */
const spray = (a, d, hp = 2200) => src(S.hose, a, a + d, { hp, fade: Math.min(0.2, d * 0.3) });
/** A surf crash (fs:376799 crashes at ~0.9 / 5.7 / 19.2 s; fs:384360 at ~3 / 15.5 s), a slice starting before it. */
const CRASH = [[S.waves, 0.3, 3.3], [S.waves, 18.5, 21.5], [S.breakwater, 2.0, 5.0], [S.breakwater, 14.6, 17.6], [S.waves, 5.0, 8.0]];
const crash = (k, o = {}) => once(`crash${k % CRASH.length}`, () => src(CRASH[k % CRASH.length][0], CRASH[k % CRASH.length][1], CRASH[k % CRASH.length][2], { ch: 2, hp: 50, fade: 0.4, ...o }));

// ------------------------------------------------------------------------------------------------ the instrument kit
/** 劍鳴: free-free bar modes as close doublets (the blade's two bending planes beat: the 「嗡」), higher modes die first. */
function bladeRing(f0, dur, { t60 = 1.2, bright = 1, beat = 0.0035, seed = 'br' } = {}) {
  const modes = [1, 2.756, 5.404, 8.933, 13.34], amp = [1, 0.55, 0.32, 0.18, 0.1], list = [];
  modes.forEach((r, i) => { if (f0 * r > 17000) return; const a = amp[i] * (i ? bright : 1), t = t60 / (1 + i * 0.8); list.push([r, a, t], [r * (1 + beat * (i + 1)), a * 0.65, t * 0.85]); });
  return nrm(L.partials(dur, { base: f0, list, seed }));
}
/** A struck glass (the dial's crystal, the slot's panes): wine-glass modes as slow doublets + a tick. */
function glass(f, dur, { t60 = 1.4, bright = 1, tick = -16, seed = 'gl' } = {}) {
  const R = [[1, 1, 1], [2.32, 0.38, 0.5], [4.25, 0.18, 0.28], [6.63, 0.08, 0.16], [9.4, 0.04, 0.1]], list = [];
  for (const [r, a, k] of R) { if (f * r > 17000) continue; const amp = r === 1 ? a : a * bright; list.push([r, amp, t60 * k], [r * 1.0025, amp * 0.5, t60 * k * 0.8]); }
  const tk = L.noiseBurst({ dur: 0.015, decay: 0.003, hp: Math.min(9000, f * 3), lp: 16000, seed: seed + 't' });
  return nrm(L.mix([at(nrm(L.partials(dur, { base: f, list, seed }))), at(nrm(tk), 0, tick)]));
}
/** A small brass bell (the barometer's): a handbell's modes (prime, a minor-third tierce, quint, nominal...) as
 *  doublets, a bright strike; `t60` for the prime, higher modes shorter. */
const BRASS = [[1, 1, 1], [1.19, 0.35, 0.7], [1.5, 0.3, 0.6], [2.0, 0.55, 0.55], [2.52, 0.25, 0.4], [3.01, 0.22, 0.32], [4.1, 0.12, 0.22], [5.4, 0.07, 0.15]];
function brass(f, dur, { t60 = 1.6, seed = 'bs', strike = -14, bright = 1 } = {}) {
  const list = [];
  for (const [r, a, k] of BRASS) { if (f * r > 17000) continue; const amp = r === 1 ? a : a * bright; list.push([r, amp, t60 * k], [r * 1.0018, amp * 0.45, t60 * k * 0.85]); }
  const s = L.noiseBurst({ dur: 0.012, decay: 0.003, hp: Math.min(8000, f * 2), lp: 15000, seed: seed + 's' });
  return nrm(L.mix([at(nrm(L.partials(dur, { base: f, list, seed }))), at(nrm(s), 0, strike)]));
}
/** §1.12 "貴氣瞬態": 30 ms of 6-10 kHz (a filtered tick + two short high partials). */
function lux(seed, f = 7800) {
  return L.mix([at(nrm(L.noiseBurst({ dur: 0.03, decay: 0.01, bp: 8000, q: 1.3, seed }))),
    at(nrm(L.partials(0.035, { base: f, list: [[1, 1, 0.02], [1.29, 0.6, 0.015]], seed: seed + 'p' })), 0, -4)]);
}
/** Tubular bell (VSCO 2, C4 / C5 takes) retuned to `hz`, cut to `len` s with a decay. */
async function tubular(hz, len = 2.2, { t60 = 2.4, hp = 120 } = {}) {
  const base = hz < 400 ? [S.tbC4, 261.63] : [S.tbC5, 523.25];
  const b = await once(`tb${base[0]}`, async () => onset(await src(base[0], 0, 6, { ch: 2, hp: 60, fade: 0.5 })));
  USED.add(base[0]);
  return L.decay(L.eq(cut(L.varispeed(b, hz / base[1]), len, 0.3), [{ type: 'hp', f: hp, order: 2 }]), t60, 0.05);
}
/** The barometer needle snapping onto a mark: a brass detent tick, the hairspring's quiver (a high ring wobbling out). */
function needleTick(seed, { f = 3150, ring = -8 } = {}) {
  const r = rng(seed), w = wobble(seed + 'q', [23, 31]);
  const tk = L.mix([at(nrm(L.noiseBurst({ dur: 0.01, decay: 0.002, bp: 4200, q: 2.5, seed: seed + 'a' }))), at(nrm(L.thump({ f0: 1400, f1: 900, sweep: 0.002, decay: 0.012, click: 0, seed: seed + 'b' })), 0, -6)]);
  const q = L.automate(L.tone(0.4, { type: 'sine', freq: (t) => f * (1 + 0.012 * w(t) * Math.exp(-t / 0.08)) }), (t) => Math.exp(-t / 0.07) * (0.6 + 0.4 * Math.abs(w(t))));
  const g = glass(f * r.range(1.48, 1.52), 0.35, { t60: 0.2, tick: -30, seed: seed + 'g' });
  return nrm(L.mix([at(tk), at(nrm(q), 0.001, ring), at(g, 0.001, ring - 6)]));
}
/** The anemometer: three cups whupping past at 3 x rev(t) per second (a soft air band), the bearing's faint tick
 *  per cup and its whine (rev(t) in rev/s, fn or number). */
function rotor(dur, rev, { seed = 'rt', band = 900, tick = -16, whine = -24 } = {}) {
  const R = L.toFn(rev), N = Math.round(dur * SR), ph = new Float32Array(N);
  let p = 0;
  for (let i = 0; i < N; i++) { p += 3 * R(i / SR) / SR; ph[i] = p; }
  const air = L.sweep(L.noise(dur, { color: 'pink', seed }), 'bp', (t) => band * (0.8 + 0.25 * Math.min(1, R(t) / 4)), { q: 1.3 });
  const am = L.automate(air, (t) => { const x = ph[Math.min(N - 1, Math.round(t * SR))] % 1; return 0.25 + 0.75 * Math.exp(-((x - 0.5) ** 2) / 0.02); });
  const ticks = [];
  let last = 0;
  for (let i = 0; i < N; i++) if (Math.floor(ph[i]) > last) { last = Math.floor(ph[i]); ticks.push(at(L.noiseBurst({ dur: 0.006, decay: 0.0015, bp: 5200, q: 3, seed: `${seed}t${last}` }), i / SR, -rng(`${seed}${last}`).next() * 4)); }
  const tk = ticks.length ? nrm(L.mix(ticks, { length: dur })) : L.Buf.seconds(dur, 1);
  const wh = L.tone(dur, { type: 'sine', freq: (t) => 420 + 260 * R(t) });
  return nrm(L.mix([at(nrm(am)), at(tk, 0, tick), at(nrm(wh), 0, whine)]));
}

// ------------------------------------------------------------------------------------------------ the lightning kit
// (premium_chunting): the split, the rip, the boom, the roll
function crack(dur, { n = 26, spread = 0.09, big = 2.2, seed = 'ck', hp = 140, tear = 0.55 } = {}) {
  const r = rng(seed), Nn = Math.round(dur * SR), o = new Float32Array(Nn);
  const put = (t0, ms, a) => { const len = Math.max(3, Math.round(ms / 1000 * SR)), i0 = Math.round(t0 * SR); for (let i = 0; i < len && i0 + i < Nn; i++) o[i0 + i] += a * (1 - 2 * i / (len - 1)); };
  put(0, big, 1);
  put(big / 1000 * 0.7, big * 0.5, -0.55);
  for (let k = 0; k < n; k++) {
    const t = spread * r.next() ** 1.7;
    put(t, 0.15 + 1.45 * r.next() ** 2, r.sign() * tear * (0.25 + 0.75 * r.next()) * Math.exp(-2.2 * t / spread));
  }
  return nrm(L.eq(new L.Buf([o], SR), [{ type: 'hp', f: hp, order: 2 }, { type: 'lp', f: 15000, order: 2 }, { type: 'peak', f: 2800, gain: 2, q: 0.8 }]));
}
function rip(dur, { density = 1400, hp = 1500, t = 0.05, seed = 'rp' } = {}) {
  return nrm(L.automate(L.crackle(dur, { density, decay: 0.0008, hp, minAmp: 0.1, seed }), (x) => Math.min(1, x / 0.002) * Math.exp(-x / t)));
}
function boom({ f0 = 92, f1 = 36, sweep = 0.05, decay = 0.6, dur, seed = 'bm', drive = 4 } = {}) {
  dur = dur ?? decay * 1.2 + 0.05;
  const th = L.thump({ f0, f1, sweep, decay, dur, click: 0, drive: 1.5, seed });
  const body = L.applyEnv(L.eq(L.noise(dur, { color: 'brown', seed: seed + 'n' }), [{ type: 'lp', f: 260, order: 2 }, { type: 'hp', f: 30, order: 2 }]), L.expEnv(dur, { attack: 0.006, t60: decay * 0.8 }));
  return nrm(L.saturate(L.mix([at(nrm(th)), at(nrm(body), 0, -4)]), { drive, type: 'tube', mix: 0.45 }));
}
function rumble(dur, { peaks = 4, lp0 = 900, lp1 = 160, seed = 'rb', first = 0.02, spanEnd = 0.65 } = {}) {
  const r = rng(seed), bumps = [];
  for (let i = 0; i < peaks; i++) {
    const t0 = i === 0 ? first : r.range(first + 0.12, dur * spanEnd);
    bumps.push([t0, (i === 0 ? 1 : r.range(0.35, 0.8)) * Math.exp(-i * 0.2), r.range(0.25, 0.7) * (1 + t0 / dur), i === 0 ? 0.02 : r.range(0.06, 0.16)]);
  }
  const fl = wobble(seed + 'f', [2.3, 5.1, 9.7]);
  const env = (t) => { let e = 0; for (const [t0, a, w, rise] of bumps) { const x = t - t0; e += x < 0 ? a * Math.exp(-((x / rise) ** 2)) : a * Math.exp(-x / w); } return e * (0.75 + 0.25 * fl(t)) * Math.min(1, t / 0.01); };
  let b = L.noise(dur, { color: 'brown', seed: seed + 'n' });
  b = L.sweep(b, 'lp', (t) => lp0 * (lp1 / lp0) ** Math.min(1, t / dur), { q: 0.7 });
  b = L.eq(b, [{ type: 'hp', f: 28, order: 2 }]);
  return nrm(L.fadeOut(L.automate(nrm(b), (t) => Math.max(0, env(t))), Math.min(0.3, dur * 0.2), 'exp'));
}
const sizzle = (dur, { density = 2000, hp = 3500, seed = 'sz' } = {}) => nrm(L.crackle(dur, { density, decay: 0.0007, hp, minAmp: 0.05, seed }));
/** A recorded roll (rolling explosions slowed), cached. */
const recRoll = (k) => once(`roll${k % 2}`, () => src(k % 2 ? S.rollSub : S.roll, 0.15, 4.6, { hp: 30, lp: 1600, rate: 0.82, fade: 0.8 }));
/** A recorded blast's first 0.9 s (a strike's body), low-passed. */
const BLASTS = [[S.blast, 0, 1.0], [S.medium, 0.18, 1.2], [S.deep, 0, 1.0]];
const blastBody = (k) => once(`blast${k % 3}`, async () => tight(await src(BLASTS[k % 3][0], BLASTS[k % 3][1], BLASTS[k % 3][2], { hp: 35, lp: 2600, fade: 0.2 }), 0.75));
/**
 * A lightning strike (mono, raw): the split + rip on top, a falling boom, a recorded blast for the body, the roll
 * (synthesized rolls + a recorded roll slowed), sparks. `near` scales the top end (the split) against the roll.
 */
async function thunderStrike(seed, k, { len = 1.9, big = 2.4, near = 1, roll = -5, sub = 0 } = {}) {
  const r = rng(seed);
  const ck = crack(0.36, { n: 30, spread: 0.11, big: big + r.range(0, 0.6), seed: seed + 'c' });
  const rp = rip(0.3, { density: 1500, t: 0.06, seed: seed + 'r' });
  const bm = boom({ f0: 92 + r.range(-10, 8), f1: 38, sweep: 0.05, decay: 0.6, seed: seed + 'b' });
  const bd = await blastBody(k);
  const rl = rumble(len, { peaks: 4, lp0: 1100, lp1: 170, seed: seed + 'u', first: 0.04 });
  const rr = L.slice(await recRoll(k), r.range(0, 0.3));
  const sz = L.automate(sizzle(0.5, { seed: seed + 's' }), (t) => Math.exp(-t / 0.08));
  const g = 20 * Math.log10(near);
  return L.mix([at(ck, 0, g), at(rp, 0.002, -7 + g), at(bm, 0.003, -2 + sub), at(bd, 0.004, -5), at(rl, 0.03, roll), at(rr, 0.05, roll - 2), at(sz, 0.003, -16 + g)], { length: len });
}

// ------------------------------------------------------------------------------------------------ combo
/** One horizontal greatsword swing (stereo): P = where the blade passes, dir +1 = right -> left. The theme layer is the
 *  slot's whistle dopplering past on `note`, ~10 dB under the air (§1.12: 20-30 %), spray flung after the pass. */
async function swingVariant(k, { P = 0.085, D = 0.7, dir = 1, mass = -2.5, heavy = 1, note = N.D5, seed = 'sw' } = {}) {
  const r = rng(`${seed}${k}`);
  const whoom = await once('whoom', () => src(S.whoom, 0, 0.557, { hp: 60, fade: 0.05 }));
  const airs = await once('airs', async () => {
    const out = [];
    for (const [a, z] of [[0.001, 0.3], [0.521, 0.81], [1.053, 1.35], [1.507, 1.831]]) out.push(await src(S.katana, a, z, { hp: 380, fade: 0.04 }));
    out.push(await src(S.swoosh, 0.2, 0.72, { hp: 320, fade: 0.05 }));
    return out;
  });
  USED.add(S.whoom); USED.add(S.katana); USED.add(S.swoosh);
  const mw = L.varispeedSemis(whoom, mass + r.range(-1, 1));
  const air = airs[k % airs.length];
  const body = swoosh(D, P, [200, 600 + 60 * heavy, 180], { q: 1.0, seed: `${seed}b${k}`, rise: 2.2, fall: 5 });
  const hiss = swoosh(D, P + 0.008, [1900, 5400, 2400], { q: 1.2, color: 'white', seed: `${seed}h${k}`, rise: 3, fall: 9 });
  const wh = whistlePass(D, P + 0.004, note * r.range(0.995, 1.005), { up: 1.5, down: -5, seed: `${seed}w${k}`, fall: 7 });
  // droplets flung off the edge after the pass (they leave on the exit side), a breath of spray
  const drops = patter(0.36, (t) => 220 * Math.exp(-t / 0.12), { lo: 1500, hi: 5200, t60: [0.015, 0.04], seed: `${seed}d${k}` });
  const sp = L.automate(await spray(1 + k * 0.7, 0.4, 3000), (t) => Math.min(1, t / 0.02) * Math.exp(-t / 0.09));
  const push = L.thump({ f0: 105, f1: 60, sweep: 0.05, decay: 0.15, click: 0, drive: 1.4, seed: `${seed}p${k}` });
  const p = (t) => dir * (0.5 - 1.0 * smooth((t - P + 0.09) / 0.2));
  const moving = panMove(L.mix([alignAt(air, P + 0.004, 0), at(hiss, 0, -6), at(wh, 0, -9)], { length: D }), p);
  const exit = panMove(L.mix([at(drops, 0, -6), at(nrm(sp), 0, -9)], { length: D }), () => -dir * 0.55);
  const centre = L.mix([alignAt(nrm(mw), P, -4), at(body, 0, -7), at(push, P - 0.035, -19 + heavy * 2)], { length: D });
  let v = L.mix([at(L.stereoize(centre, { width: 0.18, hp: 400, seed: `${seed}c${k}` })), at(moving), { buf: exit, at: P + 0.02, gain: -14 },
    at(L.toStereo(lux(`${seed}x${k}`)), P, -17)], { channels: 2, length: D });
  v = L.eq(v, [{ type: 'hp', f: 55, order: 2 }, { type: 'peak', f: 260, gain: -2, q: 0.9 }, { type: 'peak', f: 2600, gain: 2, q: 0.8 }, { type: 'highshelf', f: 7000, gain: 1.5 }]);
  return cut(verb(v, NEAR, 0.12, { seed: `${seed}v${k}` }), D + 0.05, 0.35);
}

async function comboSet(add, SP, LOC, keep) {
  // 橫斬 (right -> left; whistle on D5) and 反橫斬 (left -> right; whistle on E5 / 1.05: the code plays it at pitch 1.05)
  const sw = [], sw2 = [];
  for (let k = 0; k < 6; k++) sw.push(dense(await swingVariant(k, { dir: 1, note: N.D5 }), -15, -0.2, 6));
  keep.swing = { buf: sw[0], lufs: -15, vol: 1 };
  await add('taifeng_swing', sw, LOC({ lufs: -15, channels: 2, voices: 3, pitch: [0.97, 1.03], note: '橫斬 (code: 2D, vol 0.9, delay 0.0675: the whoosh peaks on the hit)' }));
  for (let k = 0; k < 6; k++) sw2.push(dense(await swingVariant(k + 6, { dir: -1, note: N.E5 / 1.05, mass: -2.2, seed: 'sx' }), -15, -0.2, 6));
  keep.swing2 = { buf: sw2[0], lufs: -15, vol: 1 };
  await add('taifeng_swing2', sw2, LOC({ lufs: -15, channels: 2, voices: 3, pitch: [0.97, 1.03], note: '反橫斬 (code: 2D, vol 0.9, pitch 1.05)' }));

  // 劈地 ①: the blade raised overhead, the vanes flaring: an inhale (air sucked up the blade, a whistle gliding up
  // G4 -> D5), the grip's leather creaking; it peaks as the chop begins (0.25 s) and gets out of the way
  const ups = [];
  for (let k = 0; k < 3; k++) {
    const D = 0.42, T = 0.27;
    const inh = L.automate(L.reverse(swoosh(0.4, 0.05, [5200, 2600, 900], { q: 0.9, color: 'white', seed: `cu${k}`, fall: 3 })), (t) => (t < T + 0.1 ? 1 : 0));
    const wh = L.automate(aeolian(D, (t) => N.G4 * (N.D5 / N.G4) ** smooth(t / T), { q: 40, seed: `cuw${k}` }), (t) => smooth(t / T) * (t < T ? 1 : Math.exp(-(t - T) / 0.04)));
    const lea = await grab(S.holster, 0.04, 0.75, { mode: 'peak', pre: 0.02, post: 0.2, hp: 300 });
    let m = L.mix([at(L.stereoize(nrm(inh), { width: 0.5, hp: 600, seed: `cus${k}` })), at(L.toStereo(wh), 0, -8), at(L.toStereo(lea), 0.03, -14)], { channels: 2, length: D });
    m = L.automate(m, (t) => (t < T + 0.02 ? 1 : Math.exp(-(t - T - 0.02) / 0.05)));
    ups.push(L.fadeOut(m, 0.08, 'exp'));
  }
  await add('taifeng_cleave_up', ups, LOC({ lufs: -18, channels: 2, voices: 1, pitch: [0.97, 1.03], note: '劈地 raise (code: 2D, vol 0.6)' }));

  // 劈地 ②: the chop (the code starts it at 0.198 s; the blade bites at 0.33 s -> the whoosh peaks 0.132 s in): the
  // biggest mass, the whistle falling D5 -> G4 through the pass, the air shoved down ahead of the blade
  const cl = [];
  for (let k = 0; k < 4; k++) {
    const P = 0.132, D = 0.55, r = rng(`cl${k}`);
    const whoom = L.varispeedSemis(await once('whoom', () => src(S.whoom, 0, 0.557, { hp: 60, fade: 0.05 })), -4.5 + r.range(-0.8, 0.8));
    USED.add(S.whoom);
    const body = swoosh(D, P, [150, 480, 120], { q: 0.9, seed: `clb${k}`, rise: 2.6, fall: 6 });
    const hiss = swoosh(D, P + 0.006, [1500, 4600, 1800], { q: 1.1, color: 'white', seed: `clh${k}`, rise: 3.2, fall: 10 });
    const wh = L.automate(aeolian(D, (t) => N.D5 * (N.G4 / N.D5) ** smooth((t - 0.05) / 0.15), { q: 40, seed: `clw${k}` }), (t) => (t < P ? (t / P) ** 2.4 : Math.exp(-(t - P) / 0.05)));
    const push = L.thump({ f0: 90, f1: 48, sweep: 0.04, decay: 0.2, click: 0, drive: 2, seed: `clp${k}` });
    // (the edge's air on top of the mass: a katana pass + the hiss keep the chop a blade, not a drum)
    const airs = await once('airs', () => null);
    const air = airs ? airs[(k + 1) % airs.length] : null;
    const centre = L.mix([alignAt(nrm(whoom), P, -3), at(body, 0, -6), at(hiss, 0, -4), air && alignAt(air, P + 0.004, -3), at(wh, 0, -9), at(push, P - 0.03, -12), at(lux(`clx${k}`, 7200), P, -15)], { length: D });
    let v = L.stereoize(shape(centre, 'air', 0.45), { width: 0.22, hp: 500, seed: `cls${k}` });
    v = L.eq(v, [{ type: 'hp', f: 45, order: 2 }, { type: 'peak', f: 2400, gain: 1.5, q: 0.8 }]);
    cl.push(dense(cut(verb(v, NEAR, 0.1, { seed: `clv${k}` }), D, 0.4), -14.5, -0.2, 6));
  }
  keep.cleave = { buf: cl[0], lufs: -14.5, vol: 1 };
  await add('taifeng_cleave', cl, LOC({ lufs: -14.5, channels: 2, voices: 2, pitch: [0.97, 1.03], note: '劈地 chop (code: 2D, vol 1, delay 0.198: the whoosh peaks on the bite)' }));

  // 收招 (clip 0.55 of 1.4 s): the sword settling onto the shoulder: leather, the guard's steel clank, a short 嗡, a drip
  const rec = [];
  for (let k = 0; k < 3; k++) {
    const lea = await grab(S.holster, k % 2 ? 0.8 : 0.04, k % 2 ? 1.1 : 0.75, { mode: 'peak', pre: 0.01, post: 0.25, hp: 250 });
    const clk = await grab(S.metalL(k + 1), 0, 0.4, { mode: 'peak', pre: 0.003, post: 0.2, hp: 400 });
    const ring = L.automate(bladeRing(N.G3 * (1 + k * 0.003), 0.7, { t60: 0.6, bright: 0.7, seed: `rcr${k}` }), (t) => Math.min(1, t / 0.004));
    const dp = patter(0.6, (t) => (t > 0.15 ? 9 : 0), { lo: 1500, hi: 3500, t60: [0.03, 0.06], seed: `rcd${k}` });
    let m = L.mix([at(lea, 0, -2), at(clk, 0.03, -3), at(ring, 0.032, -12), at(dp, 0, -14)], { length: 0.7 });
    m = L.stereoize(L.eq(m, [{ type: 'hp', f: 120, order: 2 }]), { width: 0.3, hp: 500, seed: `rcs${k}` });
    rec.push(L.pad(L.fadeOut(m, 0.2, 'exp'), 0.004, 0));
  }
  await add('taifeng_recover', rec, LOC({ lufs: -21, vol: 1.2, channels: 2, voices: 1, pitch: [0.97, 1.03], note: '收招 clip event (vol 0.9)' }));

  // 甩水: a wrist flick: a short whip of air, droplets thrown off the blade landing on the street a beat later, the
  // instruments rattling in their mounts
  const fl = [];
  for (let k = 0; k < 4; k++) {
    const r = rng(`fl${k}`);
    const whip = swoosh(0.22, 0.06, [900, 3600, 1600], { q: 1.4, color: 'white', seed: `flw${k}`, rise: 2, fall: 7 });
    const off = patter(0.25, (t) => 160 * Math.exp(-t / 0.08), { lo: 1800, hi: 5200, t60: [0.012, 0.03], seed: `flo${k}` });
    const land = patter(0.4, (t) => 70 * Math.exp(-t / 0.15), { lo: 700, hi: 2600, t60: [0.02, 0.05], seed: `fll${k}`, tick: -4 });
    const rat = L.mix(Array.from({ length: 3 }, (_, i) => at(L.noiseBurst({ dur: 0.008, decay: 0.002, bp: 3800 + i * 600, q: 3, seed: `flr${k}${i}` }), 0.04 + i * 0.022 + r.range(0, 0.008), -i * 3)));
    const m = L.mix([at(panMove(whip, (t) => 0.3 - 0.6 * smooth(t / 0.15)), 0, -1), at(L.stereoize(off, { width: 0.6, hp: 800, seed: `flq${k}` }), 0.05, -8), at(L.stereoize(land, { width: 0.7, hp: 500, seed: `flz${k}` }), 0.3, -14),
      at(L.toStereo(nrm(rat)), 0, -14)], { channels: 2, length: 0.75 });
    fl.push(L.pad(L.fadeOut(m, 0.15, 'exp'), 0.003, 0));
  }
  await add('taifeng_flick', fl, LOC({ lufs: -21, vol: 1.2, channels: 2, voices: 2, pitch: [0.96, 1.04], note: '甩水 clip events (recover / idle tier extra, vol 0.9)' }));
}

// ------------------------------------------------------------------------------------------------ hits
async function hitSet(add, SP, LOC, keep) {
  const cuts = [await src(S.gash, 0.01, 0.37, { hp: 300 }), await src(S.slice, 0.05, 0.62, { hp: 250 }), await src(S.gash, 0.01, 0.37, { hp: 220, semis: -4 })];
  const meats = [await src(S.meaty, 0, 0.48, { hp: 80 }), await src(S.wet, 0.07, 0.54, { hp: 70 }), await src(S.gross, 0, 0.62, { hp: 80 })];
  const slaps = [await src(S.wetA, 0.01, 0.4, { hp: 150 }), await src(S.wetB, 0.05, 0.49, { hp: 150 }), await src(S.waterBullet, 0, 0.3, { hp: 200 })];
  // taifeng_hit (the swing connecting; positional at the first body / the cleave's point): the cut, the meat, the
  // mass, a water slap (the wet blade), the blade's 嗡 as it bites, a spray tail, the luxury tick
  const hit = [];
  for (let k = 0; k < 6; k++) {
    const r = rng(`hit${k}`);
    const ring = L.automate(bladeRing([N.G3, N.D4, N.B3][k % 3] * r.range(0.997, 1.003), 0.6, { t60: 0.5, bright: 0.8, seed: `hr${k}` }), (t) => Math.min(1, t / 0.003));
    const mass = L.psychoBass(L.thump({ f0: 120, f1: 55, sweep: 0.03, decay: 0.18, click: 0.2, drive: 2, seed: `hm${k}` }), { freq: 110, amount: -4 });
    const tail = patter(0.3, (t) => 140 * Math.exp(-t / 0.08), { lo: 1300, hi: 4800, t60: [0.015, 0.04], seed: `hd${k}` });
    let m = L.mix([at(onset(L.varispeedSemis(cuts[k % 3], r.range(-2, 0.5))), 0, -1), at(onset(meats[(k + 1) % 3]), 0.004, -3), at(mass, 0.002, -5),
      at(onset(slaps[k % 3]), 0.006, -6), at(ring, 0.003, -15), at(tail, 0.03, -14), at(lux(`hx${k}`), 0, -16)], { length: 0.6 });
    m = L.decay(L.psychoBass(thicken(shape(m, 'hit', 0.55)), { freq: 110, amount: -8 }), 0.5, 0.07);
    hit.push(L.pad(dense(L.fadeOut(m, 0.25, 'exp'), -13.5), 0.002, 0));
  }
  keep.hit = { buf: hit[0], lufs: -13.5, vol: 1 };
  await add('taifeng_hit', hit, SP([4, 60], { lufs: -13.5, voices: 4, pitch: [0.95, 1.05], priority: 2, note: 'one per connecting swing (code: positional, vol 0.9-1)' }));

  // taifeng_hit_flesh (each body in the arc, up to 3, 15 ms apart; code pitch 0.9-1.12): cut + meat, lighter
  const hf = [];
  for (let k = 0; k < 6; k++) {
    const r = rng(`hf${k}`);
    let m = L.mix([at(onset(L.varispeedSemis(cuts[(k + 2) % 3], r.range(-1.5, 1))), 0, -1), at(onset(meats[k % 3]), 0.003, -4), at(onset(slaps[(k + 1) % 3]), 0.005, -10)], { length: 0.42 });
    m = L.decay(thicken(shape(m, 'hit', 0.5), { crush: 0.3 }), 0.4, 0.05);
    hf.push(L.pad(dense(L.fadeOut(m, 0.15, 'exp'), -16), 0.002, 0));
  }
  await add('taifeng_hit_flesh', hf, SP([3, 45], { lufs: -16, voices: 4, pitch: [0.96, 1.04], note: 'per body (code: positional, vol 0.65-0.45, pitch 0.9-1.12)' }));

  // taifeng_hit_splash (vol 0.5): the water thrown off the blow: a splash, droplets raining off it
  const hs = [];
  const splashes = [[S.rockSplash, 0, 0.7], [S.bigSplash, 0, 0.8], [S.splash, 0.02, 0.7], [S.deepSplash, 0, 0.7]];
  for (let k = 0; k < 5; k++) {
    const [id, a, z] = splashes[k % 4];
    const sp = onset(await src(id, a, z, { hp: 180 }));
    const dp = patter(0.6, (t) => 120 * Math.exp(-t / 0.18), { lo: 1100, hi: 4500, t60: [0.02, 0.05], seed: `hsd${k}` });
    let m = L.mix([at(sp, 0, 0), at(dp, 0.05, -7)], { length: 0.65 });
    m = shape(m, 'water', 0.5);
    hs.push(L.pad(L.fadeOut(m, 0.2, 'exp'), 0.002, 0));
  }
  await add('taifeng_hit_splash', hs, SP([3, 40], { lufs: -17, vol: 1.2, voices: 3, pitch: [0.94, 1.06], note: 'water off a connecting swing (code: positional, vol 0.5)' }));

  // taifeng_hit_wall (a swing into a wall / the thrown blade into a wall): the blade's clang on concrete (a metal hit,
  // a concrete hit, the 嗡 ringing on), sparks, chips, a wet slap
  const hw = [];
  for (let k = 0; k < 5; k++) {
    const r = rng(`hw${k}`);
    const met = await grab(k % 2 ? S.metalH(k) : S.metalHit, 0, 0.5, { mode: 'peak', pre: 0.003, post: 0.3, hp: 200 });
    const conc = await grab(k % 2 ? S.concHit : S.stone, 0, 0.45, { mode: 'peak', pre: 0.003, post: 0.3, hp: 120 });
    const ring = L.automate(bladeRing([N.G4, N.B4, N.D5][k % 3] * r.range(0.995, 1.005), 0.9, { t60: 0.8, bright: 1.2, seed: `hwr${k}` }), (t) => Math.min(1, t / 0.002));
    const sp = L.automate(sizzle(0.2, { density: 1500, seed: `hws${k}` }), (t) => Math.exp(-t / 0.04));
    const chips = await grab(S.rubble, 0.0, 0.6, { mode: 'peak', pre: 0.002, post: 0.25, hp: 300 });
    let m = L.mix([at(met, 0, 0), at(conc, 0.002, -3), at(ring, 0.002, -12), at(sp, 0.002, -14), at(chips, 0.02, -12), at(onset(slaps[k % 3]), 0.004, -11)], { length: 0.9 });
    m = L.decay(thicken(shape(m, 'hit', 0.5), { crush: 0.3 }), 0.7, 0.06);
    hw.push(L.pad(dense(L.fadeOut(m, 0.3, 'exp'), -15.5, -0.2, 6), 0.002, 0));
  }
  await add('taifeng_hit_wall', hw, SP([3, 50], { lufs: -15.5, vol: 1.2, voices: 3, pitch: [0.95, 1.05], note: 'swing / throw into a wall (code: positional, vol 0.9-1)' }));

  // taifeng_kill (KE_GALE; positional, vol 0.6, up to 2 per swing 40 ms apart): a wind cut across the body (a fast
  // shwip and a whistle zipping up G5 -> G6), a little spiral of spray rising (droplets climbing the pentatonic), a
  // ting at the top (brass G6 + glass D7), the body's thump under it
  const kills = [];
  for (let k = 0; k < 4; k++) {
    const r = rng(`kl${k}`), D = 0.95;
    const shwip = swoosh(0.32, 0.05, [1600, 6200, 3000], { q: 1.2, color: 'white', seed: `klw${k}`, rise: 2, fall: 8 });
    const zip = L.automate(aeolian(0.25, (t) => N.G5 * 2 ** smooth(t / 0.1), { q: 45, seed: `klz${k}` }), (t) => smooth(t / 0.05) * Math.exp(-Math.max(0, t - 0.08) / 0.05));
    const spiral = [];
    const notes = PENTA.slice(k % 2, (k % 2) + 6);
    notes.forEach((f, i) => spiral.push(at(droplet(f * r.range(0.998, 1.002), { rise: 1.25, tr: 0.006, t60: 0.09, seed: `kld${k}${i}`, tick: -18 }), 0.06 + i * 0.028 + r.range(-0.004, 0.004), -i * 0.6)));
    const ting = L.mix([at(brass(N.G6, 0.8, { t60: 0.6, seed: `klb${k}`, strike: -18 })), at(glass(N.D7, 0.7, { t60: 0.5, seed: `klg${k}`, tick: -24 }), 0.01, -4)]);
    const cutL = onset(cuts[k % 3]);
    const thud = L.thump({ f0: 110, f1: 55, sweep: 0.03, decay: 0.15, click: 0.1, drive: 2, seed: `klt${k}` });
    const mist = L.automate(await spray(4 + k, 0.5, 2800), (t) => Math.min(1, t / 0.03) * Math.exp(-t / 0.12));
    let m = L.mix([at(shwip, 0, -2), at(zip, 0.01, -8), at(cutL, 0.004, -5), at(thud, 0.003, -9), at(nrm(L.mix(spiral)), 0, -8), at(ting, 0.23, -9), at(nrm(mist), 0.05, -16)], { length: D });
    m = thicken(m, { crush: 0.25 });
    kills.push(L.pad(L.fadeOut(dense(m, -15, -0.2, 8), 0.3, 'exp'), 0.002, 0));
  }
  keep.kill = { buf: kills[0], lufs: -15, vol: 1.4 };
  await add('taifeng_kill', kills, SP([3, 50], { lufs: -15, vol: 1.4, voices: 3, pitch: [0.98, 1.02], priority: 2, note: 'KE_GALE (code: positional, vol 0.6)' }));

  // taifeng_sever (positional, vol 0.7): a wet chop through, the bone giving, a gout of spray
  const sv = [];
  const bones = [await src(S.bone, 0, 0.5, { hp: 200 }), await src(S.neck, 0.54, 1.1, { hp: 250 })];
  const gores = [await src(S.splat, 0, 0.8, { hp: 120 }), await src(S.gore, 0, 0.8, { hp: 100 })];
  for (let k = 0; k < 4; k++) {
    const dp = patter(0.5, (t) => 90 * Math.exp(-t / 0.15), { lo: 700, hi: 2400, t60: [0.03, 0.06], seed: `svd${k}`, tick: -2 });
    let m = L.mix([at(onset(cuts[k % 3]), 0, -1), at(onset(bones[k % 2]), 0.012, -4), at(onset(gores[(k + 1) % 2]), 0.006, -3), at(dp, 0.08, -12)], { length: 0.75 });
    m = L.decay(thicken(shape(m, 'hit', 0.5), { crush: 0.3 }), 0.6, 0.08);
    sv.push(L.pad(dense(L.fadeOut(m, 0.25, 'exp'), -15), 0.002, 0));
  }
  await add('taifeng_sever', sv, SP([4, 50], { lufs: -15, voices: 3, pitch: [0.95, 1.05], note: 'dismember (code: positional, vol 0.7)' }));

  // 劈地 lands (taifeng_splash skill, positional 1.7 m ahead): _slam = 水拍 + 低頻「轟」: the blade into the street (a
  // heavy metal thud on the ground, a concrete smash), a 40-60 Hz boom, rubble thrown, the blade's deep 嗡 standing in
  // the ground
  const slams = [];
  for (let k = 0; k < 4; k++) {
    const r = rng(`sl${k}`);
    const thud = await once('gthud', () => grab(S.groundThud, 0.1, 0.75, { mode: 'peak', pre: 0.004, post: 0.45, hp: 40 }));
    const smash = await once('csmash', () => grab(S.concSmash, 0, 1.28, { mode: 'peak', pre: 0.004, post: 0.9, hp: 50 }));
    USED.add(S.groundThud); USED.add(S.concSmash);
    const bm = boom({ f0: 62 + r.range(-4, 4), f1: 40, sweep: 0.06, decay: 0.55, seed: `slb${k}`, drive: 3 });
    const rub = await src(k % 2 ? S.rubble : S.debris, 0, k % 2 ? 1.0 : 1.4, { hp: 150, fade: 0.3 });
    const stone = await grab(S.stone, 0, 0.4, { mode: 'peak', pre: 0.002, post: 0.25, hp: 400 });
    const ring = L.automate(bladeRing(N.G2 * 2 * r.range(0.997, 1.003), 1.3, { t60: 1.1, bright: 0.6, seed: `slr${k}` }), (t) => Math.min(1, t / 0.004));
    let m = L.mix([at(onset(thud), 0, -1), at(onset(smash), 0.003, -3), at(bm, 0.002, -2), at(rub, 0.03, -12), at(stone, 0.12 + r.range(0, 0.1), -14), at(ring, 0.004, -13)], { length: 1.3 });
    m = L.decay(L.psychoBass(thicken(shape(m, 'big', 0.55), { crush: 0.3 }), { freq: 110, amount: -7 }), 1.3, 0.12);
    m = L.slice(verb(m, STREET, 0.16, { seed: `slv${k}`, ch: 1, length: 1.2 }), 0, 1.8);
    slams.push(L.pad(dense(L.fadeOut(m, 0.5, 'exp'), -14, -0.2, 6), 0.002, 0));
  }
  keep.slam = { buf: slams[0], lufs: -14, vol: 1.25 };
  await add('taifeng_slam', slams, SP([6, 80], { lufs: -14, vol: 1.25, voices: 2, pitch: [0.96, 1.04], priority: 3, note: '劈地 (code: positional at the strike, vol 0.9)' }));

  // _slam_water: the crown of water: a big splash and a deep one, droplets thrown up and falling back over a second
  const sw = [];
  for (let k = 0; k < 4; k++) {
    const big = onset(await src(S.bigSplash, 0, 2.17, { hp: 90, fade: 0.4 }));
    const deep = onset(await src(k % 2 ? S.deepSplash : S.rockSplash, 0, k % 2 ? 1.63 : 1.95, { hp: 80, fade: 0.3 }));
    const crown = patter(1.4, (t) => (t < 0.25 ? 60 : 260 * Math.exp(-((t - 0.45) ** 2) / 0.08) + 30), { lo: 900, hi: 4200, t60: [0.02, 0.06], seed: `swc${k}`, tick: -4 });
    const sp = L.automate(await spray(2 + k * 1.1, 0.9, 2000), (t) => Math.min(1, t / 0.01) * Math.exp(-t / 0.25));
    let m = L.mix([at(big, 0, -1), at(deep, 0.004, -3), at(crown, 0.08, -8), at(nrm(sp), 0.01, -13)], { length: 1.5 });
    m = shape(m, 'water', 0.5);
    sw.push(L.pad(dense(L.fadeOut(m, 0.4, 'exp'), -15, -0.2, 6), 0.002, 0));
  }
  keep.slam_water = { buf: sw[0], lufs: -15, vol: 1 };
  await add('taifeng_slam_water', sw, SP([5, 60], { lufs: -15, voices: 2, pitch: [0.95, 1.05], note: '劈地 water crown (code: positional, vol 0.8)' }));
}

// ------------------------------------------------------------------------------------------------ 破浪 draw slash
async function drawSet(add, SP, LOC, keep) {
  // taifeng_drawslash (2D local at the start, positional for teammates: mono): the blade leaving the lower right with a
  // steel rasp, straight into a wide cut that bites at 0.18 s (whoosh, whistle on B5, a short surf curl: 浪聲＋斬擊)
  const ds = [];
  for (let k = 0; k < 4; k++) {
    const r = rng(`ds${k}`), P = 0.18, D = 0.8;
    const rasp = L.automate(L.sweep(L.noise(0.16, { seed: `dsr${k}` }), 'bp', (t) => 2400 * 2 ** (t / 0.12), { q: 5 }), (t) => Math.min(1, t / 0.02) * Math.exp(-Math.max(0, t - 0.06) / 0.03));
    const ring = L.automate(bladeRing(N.D5 * r.range(0.997, 1.003), 0.6, { t60: 0.5, bright: 1, seed: `dsg${k}` }), (t) => Math.min(1, t / 0.03));
    const sw = await swingVariant(k + 20, { P, D, dir: 1, mass: -3, heavy: 1.4, note: N.B5, seed: 'dsw' });
    const sf = L.toMono(await crash(k));
    const surf = alignAt(L.eq(L.fadeOut(L.slice(sf, Math.max(0, peakTime(sf, 0.05) - 0.25), peakTime(sf, 0.05) + 0.35), 0.15, 'exp'), [{ type: 'hp', f: 200, order: 2 }]), P + 0.02, -7, 0.05);
    let m = L.mix([at(mono(sw)), at(nrm(rasp), 0, -14), at(ring, 0.01, -18), surf], { length: D });
    m = L.psychoBass(thicken(m, { crush: 0.3 }), { freq: 110, amount: -10 });
    ds.push(L.pad(dense(L.fadeOut(m, 0.25, 'exp'), -14, -0.2, 6), 0.002, 0));
  }
  keep.drawslash = { buf: ds[0], lufs: -14, vol: 0.8 };
  await add('taifeng_drawslash', ds, SP([4, 50], { lufs: -14, vol: 0.8, voices: 2, pitch: [0.97, 1.03], note: '破浪 (code: 2D vol 1 for the caster, positional vol 0.8 for teammates)' }));

  // taifeng_drawslash_wave (2D, caster only, at the bite): the water arc — a breaking wave sheet sweeping right -> left
  // across 170° in 0.45 s, a deep water whomp, spray hiss, droplets falling back
  const dw = [];
  for (let k = 0; k < 3; k++) {
    const sf = await crash(k + 1), pk = peakTime(sf, 0.05);
    const sheet = L.eq(L.fadeOut(L.slice(L.toMono(sf), Math.max(0, pk - 0.2), pk + 0.9), 0.4, 'exp'), [{ type: 'hp', f: 150, order: 2 }, { type: 'peak', f: 2500, gain: 2, q: 0.8 }]);
    const moving = panMove(sheet, (t) => 0.75 - 1.5 * smooth((t - 0.05) / 0.45));
    const whomp = L.eq(L.mix([at(nrm(L.thump({ f0: 85, f1: 45, sweep: 0.05, decay: 0.3, click: 0, drive: 2, seed: `dwt${k}` }))), at(onset(await src(S.deepSplash, 0, 1.0, { hp: 60 })), 0, -4)]), [{ type: 'lp', f: 1600, order: 2 }]);
    const sp = panMove(L.automate(await spray(5 + k, 1.0, 2400), (t) => Math.min(1, t / 0.05) * Math.exp(-t / 0.35)), (t) => 0.6 - 1.2 * smooth(t / 0.6));
    const fall = L.stereoize(patter(0.9, (t) => 180 * Math.exp(-((t - 0.35) ** 2) / 0.06), { lo: 900, hi: 3800, t60: [0.02, 0.05], seed: `dwf${k}` }), { width: 0.8, hp: 600, seed: `dwz${k}` });
    let m = L.mix([at(moving, 0, 0), at(L.toStereo(nrm(whomp)), 0, -4), at(sp, 0.02, -10), at(fall, 0.15, -10)], { channels: 2, length: 1.3 });
    m = shape(m, 'water', 0.5);
    dw.push(L.pad(dense(L.fadeOut(L.slice(verb(m, STREET, 0.12, { seed: `dwv${k}`, length: 1.3 }), 0, 1.7), 0.5, 'exp'), -15, -0.2, 6), 0.002, 0));
  }
  keep.drawslash_wave = { buf: dw[0], lufs: -15, vol: 1 };
  await add('taifeng_drawslash_wave', dw, LOC({ lufs: -15, channels: 2, voices: 1, pitch: [0.98, 1.02], note: '破浪 water arc (code: 2D, vol 0.9, caster only)' }));
}

// ------------------------------------------------------------------------------------------------ 三階蓄力
async function chargeSet(add, SP, LOC, keep) {
  // taifeng_charge (loop 3 s; 2D, vol 0.5, rate 0.8 -> 1.25): 氣壓低鳴 — a barometric drone on G1 / G2 / D3 (tonal,
  // every partial on the 1/3 Hz grid, slow beats), the slot breathing a G4 + D5 whistle chord (breaths with whole
  // cycles in P), the anemometer at 20 rad/s (9.33 cup passes a second, on the grid), rain gathering on the blade
  // (a patter swirling inward), a faint cello tremolo on D3 under it
  {
    const P = 3.0, X = 0.4, D = P + X, W = 0.5;
    const br = (t) => 0.7 + 0.3 * Math.sin(2 * Math.PI * (2 / P) * t) * Math.sin(2 * Math.PI * (1 / P) * t + 0.7);
    const wA = L.automate(aeolian(D, N.G4, { q: 70, seed: 'cgA', flutter: 0.2, tone: -60 }), br);
    const wB = L.automate(aeolian(D, N.D5, { q: 70, seed: 'cgB', flutter: 0.2, tone: -60 }), (t) => 0.7 + 0.3 * Math.sin(2 * Math.PI * (3 / P) * t + 2));
    const rt = rotor(D, onGrid(9.5 / 3, P), { seed: 'cgR', band: 1000 });
    const rn = L.automate(patter(D, 70, { lo: 1500, hi: 5000, t60: [0.015, 0.035], seed: 'cgP' }), (t) => 0.8 + 0.2 * Math.sin(2 * Math.PI * (1 / P) * t));
    const swirl = L.sweep(L.noise(D, { color: 'pink', seed: 'cgS' }), 'bp', (t) => 900 * 2 ** Math.sin(2 * Math.PI * (2 / P) * t), { q: 2 });
    const cello = await src(S.celloTrem, 0.8, 0.8 + D + 0.2, { hp: 80, fade: 0.01 });
    let noisy = L.mix([at(L.stereoize(wA, { width: 0.4, hp: 300, seed: 'cgs1' }), 0, -6), at(L.stereoize(wB, { width: 0.4, hp: 300, seed: 'cgs2' }), 0, -9),
      at(L.stereoize(rt, { width: 0.3, hp: 300, seed: 'cgs3' }), 0, -9), at(L.stereoize(rn, { width: 0.8, hp: 800, seed: 'cgs4' }), 0, -14),
      at(L.stereoize(nrm(swirl), { width: 0.6, hp: 400, seed: 'cgs5' }), 0, -14), at(L.toStereo(cello), 0, -15)], { channels: 2, length: D });
    // the drone: G1 / G2 / D3 / G3 sines with a slow beat each (whole cycles in P), tube-warmed
    const g = (f) => onGrid(f, P);
    const hum = L.saturate(L.mix([[g(N.G1), 0, 0], [g(N.G1) + 1 / P, 0, -3], [g(N.G2), 0, -2], [g(N.G2) + 2 / P, 0, -6], [g(N.D3), 0, -8], [g(N.G3), 0, -12]].map(([f, , gn]) => at(L.tone(W + P, { type: 'sine', freq: f }), 0, gn))), { drive: 4, type: 'tube', mix: 0.5 });
    const tonal = L.toStereo(L.eq(nrm(hum), [{ type: 'hp', f: 35, order: 2 }, { type: 'lp', f: 1800, order: 2 }]));
    let m = seamless(P, X, noisy, L.scale(tonal, L.db2lin(-14)), W);
    m = L.psychoBass(m, { freq: 100, amount: -14 });
    seamCheck('taifeng_charge', m);
    keep.charge = { buf: m, lufs: -16, vol: 1.2 };
    await add('taifeng_charge', m, LOC({ lufs: -16, vol: 1.2, loop: true, channels: 2, voices: 1, pitch: [1, 1], note: '三階蓄力 hold (code: loop, vol 0.5, rate 0.8 -> 1.25)' }));
  }

  // taifeng_charge_stage (2D, vol 0.6, pitch 1 / 1.1225 -> G / A): the needle dropping a mark (detent + hairspring), the
  // dial's brass bell and the slot's whistle on G5 (glass G6 over it), a gust pulled in (ffwump), a soft sub as the
  // frame darkens
  const st = [];
  for (let k = 0; k < 2; k++) {
    const D = 1.3;
    const nd = needleTick(`cs${k}n`);
    const bell = brass(N.G5, D, { t60: 1.1, seed: `csb${k}` });
    const gl = glass(N.G6, D, { t60: 0.9, seed: `csg${k}`, tick: -22 });
    const wh = L.automate(aeolian(D, N.G5, { q: 60, seed: `csw${k}` }), ev([[0, 0], [0.04, 1], [0.35, 0.5], [1.1, 0]]));
    const ff = swoosh(0.45, 0.12, [350, 1300, 500], { q: 1.1, seed: `csf${k}`, rise: 1.6, fall: 5 });
    const sub = L.psychoBass(L.thump({ f0: 80, f1: 48, sweep: 0.05, decay: 0.3, click: 0, drive: 1.5, seed: `css${k}` }), { freq: 100, amount: -5 });
    let m = L.mix([at(L.toStereo(nd), 0, -3), at(L.stereoize(bell, { width: 0.3, hp: 500, seed: `csx${k}` }), 0.004, -4), at(L.stereoize(gl, { width: 0.5, hp: 800, seed: `csy${k}` }), 0.006, -12),
      at(L.stereoize(wh, { width: 0.4, hp: 400, seed: `csz${k}` }), 0, -10), at(panMove(ff, (t) => 0.6 - 1.2 * smooth(t / 0.3)), 0, -9), at(L.toStereo(sub), 0.01, -9)], { channels: 2, length: D });
    st.push(L.pad(L.fadeOut(L.slice(verb(m, NEAR, 0.15, { seed: `csv${k}` }), 0, 1.5), 0.5, 'exp'), 0.003, 0));
  }
  keep.stage = { buf: st[0], lufs: -16, vol: 1.4 };
  await add('taifeng_charge_stage', st, LOC({ lufs: -16, vol: 1.4, channels: 2, voices: 2, pitch: [1, 1], note: 'stages 1 / 2 (code: vol 0.6, pitch 1 / 1.1225 -> G / A)' }));

  // taifeng_charge_full (stage 3 with 颱風能量 full; 2D, vol 0.6, pitch 1.26 -> B): two bolts jump on the blade (splits,
  // sparks), thunder booms and rolls, the core goes white (a glass swell + the whistle on G6), the bell chord G5 + D6
  const fu = [];
  for (let k = 0; k < 2; k++) {
    const D = 1.9;
    const c1 = crack(0.2, { n: 14, spread: 0.04, big: 1.4, seed: `cfa${k}`, hp: 300 }), c2 = crack(0.2, { n: 12, spread: 0.035, big: 1.1, seed: `cfb${k}`, hp: 350 });
    const sz = L.automate(sizzle(0.6, { seed: `cfz${k}` }), (t) => Math.exp(-t / 0.15));
    const th = await thunderStrike(`cft${k}`, k, { len: D, big: 1.6, near: 0.5, roll: -4 });
    const chord = L.mix([at(brass(N.G5, D, { t60: 1.4, seed: `cfg${k}` })), at(brass(N.D6, D, { t60: 1.2, seed: `cfd${k}` }), 0.03, -3), at(glass(N.G6, D, { t60: 1.2, seed: `cfh${k}`, tick: -20 }), 0.05, -8)]);
    const wh = L.automate(aeolian(D, (t) => N.G6 * (1 - 0.02 * Math.exp(-t / 0.1)), { q: 55, seed: `cfw${k}` }), ev([[0, 0], [0.12, 1], [0.6, 0.6], [1.6, 0]]));
    let m = L.mix([at(L.toStereo(c1), 0, -2, -0.3), at(L.toStereo(c2), 0.09, -4, 0.3), at(L.stereoize(sz, { width: 0.6, hp: 2000, seed: `cfs${k}` }), 0, -12),
      at(L.stereoize(L.eq(th, [{ type: 'hp', f: 40, order: 2 }]), { width: 0.4, hp: 300, seed: `cft${k}s` }), 0.02, -3),
      at(L.stereoize(chord, { width: 0.4, hp: 500, seed: `cfc${k}` }), 0.01, -7), at(L.stereoize(wh, { width: 0.5, hp: 500, seed: `cfq${k}` }), 0, -11)], { channels: 2, length: D });
    m = L.psychoBass(thicken(m, { crush: 0.3 }), { freq: 100, amount: -9 });
    fu.push(L.pad(dense(L.fadeOut(m, 0.6, 'exp'), -14, -0.2, 6), 0.002, 0));
  }
  keep.full = { buf: fu[0], lufs: -14, vol: 1.3 };
  await add('taifeng_charge_full', fu, LOC({ lufs: -14, vol: 1.3, channels: 2, voices: 1, pitch: [1, 1], note: 'stage 3 (code: vol 0.6, pitch 1.26 -> B)' }));

  // taifeng_needle (charge stages: vol 0.45, pitch 1.4-1.6; clips: vol 0.9, pitch 1): the needle snapping a mark
  const nd = [];
  for (let k = 0; k < 3; k++) {
    const cl = await grab(S.clicks, 0.08, 0.65, { mode: 'peak', pre: 0.002, post: 0.05, hp: 800 });
    const m = L.mix([at(needleTick(`nd${k}`, { f: 2900 + k * 140 }), 0, 0), at(cl, 0, -10)], { length: 0.45 });
    nd.push(L.pad(L.fadeOut(m, 0.15, 'exp'), 0.003, 0));
  }
  await add('taifeng_needle', nd, LOC({ lufs: -21, vol: 1.2, channels: 1, voices: 2, pitch: [0.98, 1.02], note: 'barometer needle (code: vol 0.45 pitch 1.4-1.6 on a stage; clips vol 0.9)' }));

  // taifeng_vane_out (clips vol 0.9 / code vol 0.6): the two vanes slide 18 mm out on their rails and hinge 12°: a
  // steel-on-steel slide, two detents, the hinge's clack, a puff as they catch the wind
  const vo = [], vi = [];
  for (let k = 0; k < 3; k++) {
    const r = rng(`vo${k}`);
    const slide = L.automate(L.mix([at(nrm(K.scrape(0.09, 2600, 4800, `vos${k}`))), at(await grab(S.friction, 11.18, 11.36, { hp: 900 }), 0, -6)]), (t) => Math.min(1, t / 0.01));
    const det = [0.07, 0.1].map((t, i) => at(K.tick(`vod${k}${i}`, 3600 + i * 500), t + r.range(-0.004, 0.004), -4 - i * 2));
    const hinge = await grab(S.metalL(k + 2), 0, 0.3, { mode: 'peak', pre: 0.002, post: 0.12, hp: 900 });
    const puff = swoosh(0.18, 0.05, [600, 1800, 900], { q: 1.2, seed: `vop${k}` });
    const m = L.mix([at(L.stereoize(slide, { width: 0.6, hp: 1000, seed: `vow${k}` }), 0, -2), ...det.map((d) => ({ ...d, buf: L.toStereo(nrm(d.buf)) })), at(L.toStereo(hinge), 0.13, -5), at(L.stereoize(puff, { width: 0.5, hp: 400, seed: `voq${k}` }), 0.13, -12)], { channels: 2, length: 0.38 });
    vo.push(L.pad(L.fadeOut(m, 0.1, 'exp'), 0.003, 0));
  }
  await add('taifeng_vane_out', vo, LOC({ lufs: -20, channels: 2, voices: 2, pitch: [0.96, 1.04], note: 'vanes out (clips vol 0.9, code vol 0.6)' }));
  for (let k = 0; k < 2; k++) {
    const hinge = await grab(S.metalL(k + 3), 0, 0.3, { mode: 'peak', pre: 0.002, post: 0.12, hp: 700 });
    const slide = L.automate(nrm(K.scrape(0.08, 4200, 2400, `vis${k}`)), (t) => Math.min(1, t / 0.01));
    const thunk = L.thump({ f0: 420, f1: 230, sweep: 0.006, decay: 0.05, click: 0.3, drive: 2, seed: `vit${k}` });
    const m = L.mix([at(L.toStereo(hinge), 0, -3), at(L.stereoize(slide, { width: 0.6, hp: 1000, seed: `viw${k}` }), 0.04, -4), at(L.toStereo(nrm(thunk)), 0.12, -6), at(L.toStereo(K.tick(`vik${k}`, 3200)), 0.125, -6)], { channels: 2, length: 0.32 });
    vi.push(L.pad(L.fadeOut(m, 0.1, 'exp'), 0.003, 0));
  }
  await add('taifeng_vane_in', vi, LOC({ lufs: -20, channels: 2, voices: 1, pitch: [0.96, 1.04], note: 'vanes in (code vol 0.5)' }));
}

// ------------------------------------------------------------------------------------------------ 風刃
async function galeSet(add, SP, LOC, keep) {
  // taifeng_gale (the release slash; 2D vol 1 pitch 0.92 for the caster, positional vol 0.8 for teammates: mono): the
  // heaviest whoosh peaking 0.1 s in, a steel "shing", the whistle shrieking B5 -> G5, a recorded gust's burst (the
  // pressure let go), a deep whump under the camera punch
  const ga = [];
  for (let k = 0; k < 4; k++) {
    const P = 0.1, D = 0.9;
    const sw = mono(await swingVariant(k + 30, { P, D: 0.7, dir: k % 2 ? -1 : 1, mass: -3.5, heavy: 1.6, note: N.B5, seed: 'gs' }));
    const shing = L.automate(L.mix([at(nrm(K.scrape(0.12, 3000, 6500, `gsh${k}`))), at(bladeRing(N.B4, 0.5, { t60: 0.4, seed: `gsr${k}` }), 0.01, -6)]), (t) => Math.min(1, t / 0.01));
    const shriek = L.automate(aeolian(0.6, (t) => N.B5 * (N.G5 / N.B5) ** smooth((t - P) / 0.3), { q: 40, seed: `gsk${k}` }), (t) => (t < P ? (t / P) ** 2 : Math.exp(-(t - P) / 0.18)));
    const gs = await gust(k);
    const g = alignAt(L.eq(L.toMono(gs), [{ type: 'hp', f: 180, order: 2 }]), P + 0.06, -6, 0.05);
    const whump = L.psychoBass(L.thump({ f0: 75, f1: 44, sweep: 0.05, decay: 0.3, click: 0, drive: 2.5, seed: `gsw${k}` }), { freq: 100, amount: -4 });
    let m = L.mix([at(sw), at(shing, P - 0.03, -12), at(shriek, 0, -10), { ...g, buf: L.fadeOut(cut(g.buf, 0.75, 0.5), 0.2, 'exp') }, at(whump, P - 0.02, -7)], { length: D });
    m = L.psychoBass(thicken(shape(m, 'air', 0.5), { crush: 0.3 }), { freq: 110, amount: -10 });
    ga.push(L.pad(dense(L.fadeOut(m, 0.3, 'exp'), -13.5, -0.2, 6), 0.002, 0));
  }
  keep.gale = { buf: ga[0], lufs: -13.5, vol: 0.8 };
  await add('taifeng_gale', ga, SP([5, 60], { lufs: -13.5, vol: 0.8, voices: 2, pitch: [0.97, 1.03], priority: 2, note: '風刃 release (code: 2D vol 1 pitch 0.92 / teammates positional 0.8)' }));

  // taifeng_gale_fly (one per blade; 2D vol 0.8 for the caster, positional for teammates): the crescent leaving at
  // 30 m/s: its whistle on D6 receding (doppler down 5 st), a tearing hiss, mist trailing, a fwoom as it forms
  const gf = [];
  for (let k = 0; k < 4; k++) {
    const D = 0.75, r = rng(`gf${k}`);
    const wh = L.automate(aeolian(D, (t) => N.D6 * r.range(0.997, 1.003) * 2 ** (-5 * smooth(t / 0.35) / 12), { q: 50, seed: `gfw${k}` }), (t) => Math.min(1, t / 0.015) * Math.exp(-t / 0.2));
    const tear = swoosh(D, 0.03, [7000, 6000, 2200], { q: 1.0, color: 'white', seed: `gft${k}`, rise: 1, fall: 6 });
    const mist = L.automate(await spray(3 + k * 1.3, D, 2500), (t) => Math.min(1, t / 0.02) * Math.exp(-t / 0.25));
    const fwoom = swoosh(0.3, 0.04, [250, 700, 300], { q: 1, seed: `gfo${k}`, rise: 1.5, fall: 5 });
    let m = L.mix([at(wh, 0, -2), at(tear, 0, -5), at(nrm(mist), 0, -13), at(fwoom, 0, -7)], { length: D });
    m = L.eq(m, [{ type: 'hp', f: 120, order: 2 }]);
    gf.push(L.pad(dense(L.fadeOut(m, 0.3, 'exp'), -15, -0.2, 6), 0.002, 0));
  }
  keep.gale_fly = { buf: gf[0], lufs: -15, vol: 0.8 };
  await add('taifeng_gale_fly', gf, SP([5, 60], { lufs: -15, vol: 0.8, voices: 3, pitch: [0.97, 1.03], note: 'a wind blade flying (code: 2D vol 0.8 / teammates positional)' }));

  // taifeng_gale_hit (the blade's first body; positional, vol 0.9): a gust slicing through, a wet cut, a spray burst
  const gh = [];
  for (let k = 0; k < 4; k++) {
    const cutA = onset(await src([S.gash, S.slice][k % 2], k % 2 ? 0.05 : 0.01, k % 2 ? 0.62 : 0.37, { hp: 250 }));
    const meat = onset(await src([S.meaty, S.wet][k % 2], k % 2 ? 0.07 : 0, k % 2 ? 0.54 : 0.48, { hp: 80 }));
    const slash = swoosh(0.3, 0.02, [2500, 5500, 2000], { q: 1.1, color: 'white', seed: `ghs${k}`, rise: 1, fall: 7 });
    const sp = onset(await src(S.rockSplash, 0, 0.6, { hp: 300 }));
    const dp = patter(0.45, (t) => 160 * Math.exp(-t / 0.12), { lo: 1500, hi: 5000, t60: [0.015, 0.04], seed: `ghd${k}` });
    let m = L.mix([at(slash, 0, -3), at(cutA, 0.002, -2), at(meat, 0.004, -4), at(sp, 0.006, -7), at(dp, 0.03, -12), at(lux(`ghx${k}`), 0, -16)], { length: 0.55 });
    m = L.decay(thicken(shape(m, 'hit', 0.5)), 0.5, 0.06);
    gh.push(L.pad(dense(L.fadeOut(m, 0.2, 'exp'), -14), 0.002, 0));
  }
  keep.gale_hit = { buf: gh[0], lufs: -14, vol: 1 };
  await add('taifeng_gale_hit', gh, SP([4, 60], { lufs: -14, voices: 3, pitch: [0.95, 1.05], note: 'wind blade into a body (code: positional, vol 0.9)' }));
}

// ------------------------------------------------------------------------------------------------ 斬浪擲
async function throwSet(add, SP, LOC, keep) {
  // taifeng_throw (2D, caster only, delay 0.154: the copy leaves at 0.22 s -> 0.066 s in): 風嘯 — the sling's whoosh,
  // the whistle shrieking up D5 -> A5 as the ghost tears away (narrowing to the centre), water peeling off the blade,
  // the brass fins fluttering, a release whomp
  const th = [];
  for (let k = 0; k < 3; k++) {
    const P = 0.07, D = 1.0;
    const sw = await swingVariant(k + 40, { P, D: 0.7, dir: 1, mass: -3, heavy: 1.2, note: N.D5, seed: 'th' });
    const shriek = L.automate(aeolian(D, (t) => N.D5 * (N.A5 / N.D5) ** smooth((t - 0.02) / 0.25) * 2 ** (-2 * smooth((t - 0.4) / 0.5) / 12), { q: 45, seed: `thk${k}` }), (t) => smooth(t / P) * Math.exp(-Math.max(0, t - P) / 0.3));
    const peel = L.automate(await spray(6 + k, 0.8, 2200), (t) => Math.min(1, t / 0.02) * Math.exp(-t / 0.2));
    const fins = L.mix(Array.from({ length: 6 }, (_, i) => at(L.noiseBurst({ dur: 0.008, decay: 0.002, bp: 4200 + (i % 3) * 400, q: 3, seed: `thf${k}${i}` }), 0.0 + i * 0.016, -i * 1.5)));
    const whomp = L.psychoBass(L.thump({ f0: 90, f1: 50, sweep: 0.04, decay: 0.22, click: 0, drive: 2, seed: `thw${k}` }), { freq: 100, amount: -5 });
    let m = L.mix([at(sw), at(panMove(shriek, (t) => 0.4 * Math.exp(-t / 0.2)), 0, -6), at(L.stereoize(nrm(peel), { width: 0.6, hp: 1500, seed: `thp${k}` }), 0.05, -12),
      at(L.toStereo(nrm(fins)), 0, -15), at(L.toStereo(whomp), P - 0.02, -9)], { channels: 2, length: D });
    m = thicken(m, { crush: 0.25 });
    th.push(L.pad(dense(L.fadeOut(m, 0.4, 'exp'), -14, -0.2, 6), 0.002, 0));
  }
  keep.throw = { buf: th[0], lufs: -14, vol: 1 };
  await add('taifeng_throw', th, LOC({ lufs: -14, channels: 2, voices: 1, pitch: [0.98, 1.02], note: '斬浪擲 (code: 2D, vol 1, delay 0.154)' }));

  // taifeng_throw_fly (positional loop 2.1 s, vol 0.65; the code rides its rate 0.75-1.3 with the closing speed): the
  // spinning water-wind blade — its whistle on A5 (+ E6 faint) pulsing as the flats flash past (2.86 Hz, six whole
  // cycles in P) with a hair of spin doppler, the flat slapping air (a whum band on the same pulse), spray hissing off
  {
    const P = 2.1, X = 0.35, D = P + X, W = 0.5;
    const fw = onGrid(2.86, P), puls = (t) => 0.3 + 0.7 * Math.abs(Math.sin(Math.PI * fw * t)) ** 2;
    const whA = L.automate(aeolian(D, (t) => N.A5 * (1 + 0.006 * Math.sin(2 * Math.PI * fw * t)), { q: 55, seed: 'tfA', tone: -60, flutter: 0.15 }), puls);
    const whB = L.automate(aeolian(D, (t) => N.E6 * (1 + 0.006 * Math.sin(2 * Math.PI * fw * t)), { q: 60, seed: 'tfB', tone: -60, flutter: 0.15 }), puls);
    const whum = L.automate(L.eq(L.noise(D, { color: 'pink', seed: 'tfW' }), [{ type: 'bp', f: 650, q: 1.3 }]), (t) => 0.2 + 0.8 * Math.abs(Math.sin(Math.PI * fw * t + 0.4)) ** 3);
    const sp = await spray(1.5, D, 2600);
    const noisy = L.mix([at(whA, 0, -4), at(whB, 0, -14), at(nrm(whum), 0, -5), at(sp, 0, -13)], { length: D });
    // the whistle's core sines (tonal path: on the grid, the doppler wobble periodic in P)
    // (rendered from -W: its pulse lines up with the air's after the [W, W + P] cut)
    const core = L.automate(L.tone(W + P, { type: 'sine', freq: (t) => onGrid(N.A5, P) * (1 + 0.006 * Math.sin(2 * Math.PI * fw * (t - W))) }), (t) => puls(t - W));
    let m = seamless(P, X, noisy, L.scale(nrm(core), L.db2lin(-12)), W);
    m = L.eq(m, [{ type: 'hp', f: 150, order: 2 }]);
    seamCheck('taifeng_throw_fly', m);
    keep.throw_fly = { buf: m, lufs: -16, vol: 1.2 };
    await add('taifeng_throw_fly', m, SP([4, 50], { lufs: -16, vol: 1.2, loop: true, voices: 2, pitch: [1, 1], note: 'the thrown blade in flight (code: positional loop, vol 0.65, rate 0.75-1.3 doppler)' }));
  }

  // taifeng_throw_hit (each body pierced; positional, vol 0.9, code pitch 0.9-1.1): the water blade through: a wet
  // slap, the cut, a splash burst, the whistle zinging through, a thump
  const thh = [];
  for (let k = 0; k < 5; k++) {
    const r = rng(`thh${k}`);
    const cutA = onset(await src([S.slice, S.gash][k % 2], k % 2 ? 0.01 : 0.05, k % 2 ? 0.37 : 0.62, { hp: 250 }));
    const slap = onset(await src([S.wetA, S.wetB, S.waterBullet][k % 3], [0.01, 0.05, 0][k % 3], [0.4, 0.49, 0.3][k % 3], { hp: 150 }));
    const sp = onset(await src([S.bigSplash, S.rockSplash][k % 2], 0, 0.7, { hp: 200 }));
    const zing = whistlePass(0.4, 0.03, N.A5 * r.range(0.99, 1.01), { up: 1, down: -6, seed: `thz${k}`, fall: 8 });
    const thump = L.thump({ f0: 110, f1: 55, sweep: 0.03, decay: 0.15, click: 0.1, drive: 2, seed: `tht${k}` });
    let m = L.mix([at(slap, 0, -2), at(cutA, 0.003, -3), at(sp, 0.006, -5), at(zing, 0, -10), at(thump, 0.002, -8)], { length: 0.55 });
    m = L.decay(thicken(shape(m, 'hit', 0.5)), 0.5, 0.06);
    thh.push(L.pad(dense(L.fadeOut(m, 0.2, 'exp'), -14.5), 0.002, 0));
  }
  keep.throw_hit = { buf: thh[0], lufs: -14.5, vol: 1 };
  await add('taifeng_throw_hit', thh, SP([4, 60], { lufs: -14.5, voices: 4, pitch: [0.97, 1.03], note: 'thrown blade pierces (code: positional, vol 0.9, pitch 0.9-1.1)' }));

  // taifeng_throw_turn (positional, vol 0.8): the blade wheeling round for home: the whistle bending down and back up
  // (whoo-oop), a swirl of air, spray thrown off the turn
  const tt = [];
  for (let k = 0; k < 3; k++) {
    const D = 0.6;
    const wh = L.automate(aeolian(D, (t) => N.A5 * 2 ** ((-4 * Math.sin(Math.PI * clamp(t / 0.4, 0, 1))) / 12), { q: 45, seed: `ttw${k}` }), ev([[0, 0], [0.05, 1], [0.35, 0.8], [0.6, 0]]));
    const sw = swoosh(D, 0.2, [500, 1600, 700], { q: 1.1, seed: `tts${k}`, rise: 1.5, fall: 5 });
    const sp = L.automate(await spray(7 + k, D, 2600), ev([[0, 0], [0.15, 1], [0.6, 0]]));
    const m = L.mix([at(wh, 0, -3), at(sw, 0, -6), at(nrm(sp), 0, -12)], { length: D });
    tt.push(L.pad(dense(L.fadeOut(m, 0.2, 'exp'), -16), 0.002, 0));
  }
  await add('taifeng_throw_turn', tt, SP([4, 50], { lufs: -16, voices: 2, pitch: [0.97, 1.03], note: 'thrown blade turns home (code: positional, vol 0.8)' }));

  // taifeng_catch (2D, caster): 「鏘」 — the copy merging into the blade: a bright steel ping and the blade ringing long
  // on G4 (beating doublets), the brass G5 + D6 shimmer, the slot drinking the water back (droplets rising up the
  // pentatonic, fast), the grip's jolt
  const ca = [];
  for (let k = 0; k < 3; k++) {
    const D = 1.3, r = rng(`ca${k}`);
    const ping = await grab(k % 2 ? S.ping : S.metalL(k), 0, 0.42, { mode: 'peak', pre: 0.002, post: 0.3, hp: 600 });
    const ring = bladeRing(N.G4 * r.range(0.998, 1.002), D, { t60: 1.3, bright: 1.1, beat: 0.004, seed: `car${k}` });
    const sh = L.mix([at(brass(N.G5, D, { t60: 1.0, seed: `cab${k}`, strike: -20 })), at(glass(N.D6, D, { t60: 0.9, seed: `cag${k}`, tick: -24 }), 0.02, -4)]);
    const drink = L.mix(PENTA.slice(0, 5).map((f, i) => at(droplet(f, { rise: 1.2, t60: 0.06, seed: `cad${k}${i}`, tick: -20 }), i * 0.018, -i)));
    const jolt = L.psychoBass(L.thump({ f0: 130, f1: 65, sweep: 0.02, decay: 0.12, click: 0.25, drive: 2, seed: `caj${k}` }), { freq: 110, amount: -4 });
    let m = L.mix([at(L.toStereo(ping), 0, -2), at(L.stereoize(ring, { width: 0.3, hp: 500, seed: `cas${k}` }), 0.001, -5), at(L.stereoize(sh, { width: 0.5, hp: 700, seed: `cat${k}` }), 0.01, -11),
      at(L.stereoize(nrm(drink), { width: 0.4, hp: 800, seed: `cau${k}` }), 0, -13), at(L.toStereo(jolt), 0, -7), at(L.toStereo(lux(`cax${k}`)), 0, -15)], { channels: 2, length: D });
    m = verb(m, NEAR, 0.18, { seed: `cav${k}` });
    ca.push(L.pad(dense(L.fadeOut(L.slice(m, 0, D), 0.6, 'exp'), -14.5, -0.2, 6), 0.002, 0));
  }
  keep.catch = { buf: ca[0], lufs: -14.5, vol: 1 };
  await add('taifeng_catch', ca, LOC({ lufs: -14.5, channels: 2, voices: 1, pitch: [0.99, 1.01], note: '「鏘」 the copy merges (code: 2D, vol 1)' }));
}

// ------------------------------------------------------------------------------------------------ 颱風眼
async function ultSet(add, SP, LOC, keep) {
  // taifeng_eye_cast (2D, caster, t = 0): the forward step and the wide slash (the blade crosses at ~0.15 s) pushing an
  // 8 m water arc out (a breaking wave sweeping right -> left), a storm gust blasting out, a deep pressure whump under
  // FOV +4, the vanes' brass rattling as they flare (0.35 s), the anemometer racing (0.5 s)
  const ec = [];
  for (let k = 0; k < 2; k++) {
    const D = 1.6, P = 0.15;
    const sw = await swingVariant(k + 50, { P, D: 0.8, dir: 1, mass: -4, heavy: 2, note: N.G5, seed: 'ec' });
    const sf = await crash(k + 2), pk = peakTime(sf, 0.05);
    const wave = panMove(L.eq(L.fadeOut(L.slice(L.toMono(sf), Math.max(0, pk - 0.15), pk + 1.2), 0.5, 'exp'), [{ type: 'hp', f: 120, order: 2 }]), (t) => 0.7 - 1.4 * smooth((t - 0.05) / 0.5));
    const g = await gust(k + 1), gp = peakTime(g, 0.05);
    const blast = L.stereoize(L.eq(L.fadeOut(L.slice(g, Math.max(0, gp - 0.12), gp + 1.2), 0.6, 'exp'), [{ type: 'hp', f: 150, order: 2 }, { type: 'peak', f: 900, gain: 3, q: 0.7 }]), { width: 0.6, hp: 300, seed: `ecg${k}` });
    const whump = L.psychoBass(boom({ f0: 62, f1: 38, sweep: 0.06, decay: 0.5, seed: `ecb${k}`, drive: 3 }), { freq: 100, amount: -4 });
    const rat = L.mix(Array.from({ length: 8 }, (_, i) => at(L.noiseBurst({ dur: 0.008, decay: 0.002, bp: 3600 + (i % 4) * 500, q: 3, seed: `ecr${k}${i}` }), i * 0.014, -i)));
    const rot = L.automate(rotor(0.9, (t) => 1 + 4 * Math.min(1, t / 0.1) * Math.exp(-t / 0.6), { seed: `ecq${k}`, band: 1100 }), (t) => Math.min(1, t / 0.02));
    let m = L.mix([at(sw, 0, 0), at(wave, 0.04, -4), at(blast, 0.06, -5), at(L.toStereo(whump), P - 0.02, -4), at(L.toStereo(nrm(rat)), 0.35, -16), at(L.stereoize(rot, { width: 0.4, hp: 400, seed: `ecs${k}` }), 0.5, -15)], { channels: 2, length: D });
    m = L.psychoBass(thicken(m, { crush: 0.3 }), { freq: 110, amount: -10 });
    m = L.decay(m, 1.6, 0.35);
    ec.push(L.pad(dense(L.fadeOut(L.slice(verb(m, STREET, 0.15, { seed: `ecv${k}`, length: 1.2 }), 0, D), 0.5, 'exp'), -13.5, -0.2, 6), 0.002, 0));
  }
  keep.eye_cast = { buf: ec[0], lufs: -13.5, vol: 1 };
  await add('taifeng_eye_cast', ec, LOC({ lufs: -13.5, channels: 2, voices: 1, pitch: [0.99, 1.01], priority: 4, note: '颱風眼 slash (code: 2D, vol 1, t 0)' }));

  // taifeng_eye_rise (2D vol 0.9 at 0.3 s for the caster; positional at the mark for teammates: mono): §1.12 ① the rise
  // (0-0.5 s: the pressure dropping — air sucked inward, the whistles' G4 / D5 / G5 chord rising x0.8 -> x1.25, a
  // cymbal roll and a timpani roll on G2 swelling) into ② the 40-60 Hz impact at 0.5 s (the wall standing up: a boom
  // 58 -> 40 Hz, a water column erupting, a low gong, a thunder split), then the gong and the roar settling
  const er = [];
  for (let k = 0; k < 2; k++) {
    const D = 2.6, T = 0.5, ratio = (t) => 0.8 * (1.25 / 0.8) ** smooth(t / T);
    const chord = L.mix([N.G4, N.D5, N.G5].map((f, i) => at(aeolian(D, (t) => f * ratio(Math.min(t, T)), { q: 45, seed: `erw${k}${i}` }), 0, -i * 2)));
    const chordE = L.automate(nrm(chord), (t) => (t < T ? 0.15 + 0.85 * (t / T) ** 1.6 : Math.exp(-(t - T) / 0.12)));
    const inhale = L.reverse(await gust(k + 2));
    const ih = alignAt(L.eq(L.toMono(inhale), [{ type: 'hp', f: 200, order: 2 }]), T - 0.02, 0, 0.05);
    const cym = await once('cymcresc', async () => L.toMono(await src(S.cymRoll, 1.2, 3.75, { ch: 2, hp: 300, fade: 0.01 })));
    USED.add(S.cymRoll);
    const timp = await once('timproll', async () => L.toMono(await src(S.timpRoll, 1.0, 4.0, { ch: 2, hp: 40, semis: 1.5, fade: 0.01 })));
    USED.add(S.timpRoll);
    const timpE = L.automate(L.slice(timp, 0, T + 0.02), (t) => (0.1 + 0.9 * (t / T) ** 2));
    const cymE = L.slice(cym, Math.max(0, cym.duration - T - 0.02));
    const bm = boom({ f0: 58, f1: 40, sweep: 0.08, decay: 0.9, seed: `erb${k}`, drive: 4 });
    const col = onset(await src(S.bigSplash, 0, 2.17, { hp: 80, fade: 0.5 }));
    const gong = await once('gonglow', async () => L.toMono(await src(S.gong, 0.1, 4.5, { ch: 2, hp: 40, semis: -7, fade: 1.2 })));
    USED.add(S.gong);
    const ck = crack(0.3, { n: 24, spread: 0.08, big: 2.2, seed: `erc${k}` });
    const rl = rumble(2.0, { peaks: 3, lp0: 700, lp1: 150, seed: `erl${k}` });
    const rise = L.automate(L.mix([at(chordE, 0, -6), ih, at(cymE, 0, -10), at(timpE, 0, -8)], { length: T + 0.05 }), (t) => 0.12 + 0.88 * smooth(t / T) ** 1.4);
    const hitL = L.decay(L.mix([at(bm, 0, -1), at(col, 0.005, -5), at(gong, 0, -8), at(ck, 0, -7), at(rl, 0.02, -10)], { length: D - T }), 1.9, 0.2);
    let m = L.mix([at(rise), at(hitL, T)], { length: D });
    m = L.psychoBass(thicken(m, { crush: 0.25 }), { freq: 100, amount: -8 });
    m = verb(m, SKY, 0.2, { seed: `erv${k}`, ch: 1, length: 2.4 });
    er.push(L.pad(dense(L.fadeOut(L.slice(m, 0, D), 0.8, 'exp'), -14, -0.2, 6), 0.002, 0));
  }
  keep.eye_rise = { buf: er[0], lufs: -14, vol: 1 };
  await add('taifeng_eye_rise', er, SP([12, 140], { lufs: -14, vol: 1, voices: 2, pitch: [0.99, 1.01], priority: 4, note: '§1.12 ult ① rise + ② 40-60 Hz impact (code: 2D vol 0.9 at 0.3 s / teammates positional)' }));

  // taifeng_eye_sigil (positional at the mark, vol 0.9, t 0.35): 等壓線 法陣 — 低頻嗡: a drone on G1 / G2 / D3 swelling
  // and dying, a pressure whomp, a tubular bell on G3 struck softly, wind circling (a band sweeping round, anticlockwise)
  const sg = [];
  for (let k = 0; k < 2; k++) {
    const D = 2.6;
    const hum = L.saturate(L.mix([[N.G1, 0], [N.G1 * 1.004, -3], [N.G2, -2], [N.D3, -8], [N.G3, -14]].map(([f, g]) => at(L.tone(D, { type: 'sine', freq: f }), 0, g))), { drive: 4, type: 'tube', mix: 0.5 });
    const humE = L.automate(nrm(hum), ev([[0, 0], [0.25, 1], [0.8, 0.8], [2.6, 0]]));
    const whomp = boom({ f0: 55, f1: 40, sweep: 0.06, decay: 0.6, seed: `sgw${k}`, drive: 3 });
    const bell = L.toMono(await tubular(N.G3, D, { t60: 2.2, hp: 90 }));
    const circ = L.automate(L.sweep(L.noise(D, { color: 'pink', seed: `sgc${k}` }), 'bp', (t) => 700 * 2 ** Math.sin(2 * Math.PI * 0.6 * t), { q: 2.2 }), ev([[0, 0], [0.3, 1], [1.6, 0.6], [2.6, 0]]));
    let m = L.mix([at(humE, 0, -7), at(whomp, 0.01, -5), at(bell, 0.02, -3), at(nrm(circ), 0, -9)], { length: D });
    m = L.psychoBass(m, { freq: 100, amount: -6 });
    sg.push(L.pad(dense(L.fadeOut(m, 0.6, 'exp'), -15, -0.2, 6), 0.002, 0));
  }
  keep.eye_sigil = { buf: sg[0], lufs: -15, vol: 1.2 };
  await add('taifeng_eye_sigil', sg, SP([10, 100], { lufs: -15, vol: 1.2, voices: 2, pitch: [0.99, 1.01], note: '等壓線 sigil (code: positional, vol 0.9, t 0.35)' }));

  // taifeng_eye_loop (positional loop 4 s, vol 1, 0.45 -> 3.8 s: one pass, never wrapping in a normal cast): §1.12 ③
  // the bed — the eye wall roaring (a gusty howl, a polar gale and a low storm roar, their level turning with the wall
  // at 0.5 Hz), rain driving on the wall, a deep rumble, the wall singing (whistles on G5 / D6 drifting), and under it
  // the choir (O on G3, U on D3) with a cello tremolo D3 and a contrabass D2
  {
    const P = 4.0, X = 0.5, D = P + X, W = 0.5;
    const rot = (t) => 0.75 + 0.25 * Math.sin(2 * Math.PI * (2 / P) * t);
    const hw = L.toMono(await howl(6.0, D + 0.1, { hp: 100 }));
    const pol = await src(S.polar, 16.8, 16.8 + D + 0.1, { hp: 90, fade: 0.05 });
    const roar = await src(S.roar, 5.5, 5.5 + D + 0.1, { hp: 45, fade: 0.05 });
    const rain = await src(S.rain, 8.0, 8.0 + D + 0.1, { hp: 400, fade: 0.05 });
    const rs = rainSynth(D, { seed: 'elr', drops: 120 });
    const rb = L.eq(L.noise(D, { color: 'brown', seed: 'elb' }), [{ type: 'lp', f: 130, order: 2 }, { type: 'hp', f: 28, order: 2 }]);
    const wA = aeolian(D, (t) => N.G5 * 2 ** (0.3 * Math.sin(2 * Math.PI * (1 / P) * t) / 12), { q: 40, seed: 'elwA', tone: -60, flutter: 0.5 });
    const wB = aeolian(D, (t) => N.D6 * 2 ** (0.4 * Math.sin(2 * Math.PI * (1 / P) * t + 2) / 12), { q: 45, seed: 'elwB', tone: -60, flutter: 0.5 });
    const choirO = await src(S.choirO, 1.0, 1.0 + (D + 0.1) * 1.11, { hp: 90, semis: 12 * Math.log2(N.G3 / CHOIR_F), fade: 0.05 });
    const choirU = await src(S.choirU, 1.0, 1.0 + (D + 0.1) * 0.84, { hp: 70, semis: 12 * Math.log2(N.D3 / CHOIR_F), fade: 0.05 });
    const cello = await src(S.celloTrem, 0.6, 0.6 + D + 0.1, { hp: 70, fade: 0.05 });
    const bass = await src(S.bassD2, 1.5, 1.5 + D + 0.1, { hp: 35, fade: 0.05 });
    const storm = L.automate(L.mix([at(nrm(hw), 0, 0), at(pol, 0, -3), at(roar, 0, -4), at(rain, 0, -6), at(rs, 0, -9), at(nrm(rb), 0, -10), at(wA, 0, -13), at(wB, 0, -16)], { length: D }), rot);
    const music = L.mix([at(choirO, 0, 0), at(choirU, 0, -2), at(cello, 0, -4), at(bass, 0, -5)], { length: D });
    let noisy = L.mix([at(storm, 0, 0), at(L.eq(music, [{ type: 'peak', f: 350, gain: 2.5, q: 0.8 }]), 0, -6)], { length: D });
    noisy = L.psychoBass(shape(noisy, 'big', 0.4), { freq: 100, amount: -10 });
    const m = seamless(P, X, noisy, null, W);
    seamCheck('taifeng_eye_loop', m);
    keep.eye_loop = { buf: m, lufs: -14, vol: 1 };
    await add('taifeng_eye_loop', m, SP([12, 120], { lufs: -14, vol: 1, loop: true, voices: 2, pitch: [1, 1], priority: 3, note: '§1.12 ult ③ bed (code: positional loop, vol 1, 0.45 -> 3.8 s)' }));
  }

  // taifeng_eye_rain (2D loop 4 s, caster at L4, vol 0.6): rain lashing the screen — the recorded rain and wind
  // (stereo), drops hitting close to the ears (a stereo patter, plinks and ticks), gusts swelling it
  {
    const P = 4.0, X = 0.5, D = P + X;
    const rec = await src(S.rain, 8.2, 8.2 + D + 0.1, { ch: 2, hp: 250, fade: 0.05 });
    const l = rainSynth(D, { seed: 'errL', drops: 140 }), r = rainSynth(D, { seed: 'errR', drops: 140 });
    const close = new L.Buf([l.data[0], r.data[0]], SR);
    const near = L.mix([at(patter(D, 22, { lo: 600, hi: 2400, t60: [0.03, 0.07], seed: 'erpL', tick: 0 }), 0, 0, -0.6), at(patter(D, 22, { lo: 600, hi: 2400, t60: [0.03, 0.07], seed: 'erpR', tick: 0 }), 0, 0, 0.6)], { channels: 2, length: D });
    const gw = L.stereoize(L.toMono(await howl(19.0, D + 0.1, { hp: 200 })), { width: 0.5, hp: 300, seed: 'ergw' });
    const gustE = (t) => 0.8 + 0.2 * Math.sin(2 * Math.PI * (1 / P) * t) * Math.sin(2 * Math.PI * (3 / P) * t + 1);
    let noisy = L.automate(L.mix([at(rec, 0, 0), at(close, 0, -5), at(near, 0, -9), at(gw, 0, -12)], { channels: 2, length: D }), gustE);
    noisy = shape(noisy, 'water', 0.4);
    const m = seamless(P, X, noisy, null);
    seamCheck('taifeng_eye_rain', m);
    keep.eye_rain = { buf: m, lufs: -18, vol: 1 };
    await add('taifeng_eye_rain', m, LOC({ lufs: -18, loop: true, channels: 2, voices: 1, pitch: [1, 1], note: 'the caster\'s screen rain (code: 2D loop, vol 0.6, L4)' }));
  }

  // taifeng_thunder (positional at each bolt, vol 0.9, 7 strikes 0.4 s apart inside the wall): a close strike — the
  // split and the rip, a boom, a recorded blast for the body, the roll; 6 variants, 4 voices (they overlap)
  const tn = [];
  for (let k = 0; k < 6; k++) {
    const D = 1.9;
    let m = await thunderStrike(`tn${k}`, k, { len: D, big: 2.3 + (k % 3) * 0.2, roll: -9 });
    m = L.decay(L.psychoBass(thicken(shape(m, 'big', 0.45), { crush: 0.2 }), { freq: 100, amount: -8 }), 1.5, 0.12);
    m = verb(m, SKY, 0.22, { seed: `tnv${k}`, ch: 1, length: 2.2 });
    tn.push(L.pad(dense(L.fadeOut(L.slice(m, 0, D), 0.7, 'exp'), -14, -0.2, 6), 0.002, 0));
  }
  keep.thunder = { buf: tn[0], lufs: -14, vol: 1 };
  await add('taifeng_thunder', tn, SP([15, 200], { lufs: -14, voices: 4, pitch: [0.94, 1.06], priority: 3, note: 'a bolt in the eye wall (code: positional, vol 0.9, every 0.4 s x7)' }));

  // taifeng_collapse (positional at the eye, vol 1.2, t 3.35; the damage lands 0.2 s later): the wall falling in — a
  // roar sucked inward and the whistles rising for 0.2 s, then ② the big impact: a 40-60 Hz boom, a giant wave
  // crashing (two surf crashes stacked on their peaks), the big splash, a thunder split, a hard gong taken down, debris;
  // the roll and the gong carrying it away
  const co = [];
  for (let k = 0; k < 2; k++) {
    const D = 3.4, T = 0.2;
    const inrush = L.reverse(L.toMono(await gust(k + 1)));
    const ir = alignAt(L.eq(inrush, [{ type: 'hp', f: 200, order: 2 }]), T, -2, 0.05);
    const wh = L.automate(L.mix([N.G4, N.D5, N.G5].map((f, i) => at(aeolian(T + 0.1, (t) => f * 2 ** (5 * smooth(t / T) / 12), { q: 40, seed: `cow${k}${i}` }), 0, -i * 2))), (t) => (t < T ? (t / T) ** 2 : Math.exp(-(t - T) / 0.03)));
    const bm = boom({ f0: 60, f1: 38, sweep: 0.08, decay: 1.0, seed: `cob${k}`, drive: 5 });
    const c1 = await crash(k), c2 = await crash(k + 3);
    const cr1 = alignAt(L.toMono(c1), T + 0.04, -2, 0.05), cr2 = alignAt(L.toMono(c2), T + 0.08, -4, 0.05);
    const sp = onset(await src(S.bigSplash, 0, 2.17, { hp: 80, fade: 0.5 }));
    const th = await thunderStrike(`cot${k}`, k + 1, { len: 2.8, big: 2.6, roll: -3 });
    const gong = await once('gonghard', async () => L.toMono(await src(S.gongHard, 0.05, 5.0, { ch: 2, hp: 40, semis: -5, fade: 1.5 })));
    USED.add(S.gongHard);
    const deb = await src(S.debris, 0, 3.5, { hp: 100, fade: 0.6 });
    const pre = L.automate(L.mix([ir, at(wh, 0, -10)], { length: T + 0.06 }), (t) => 0.15 + 0.85 * smooth(t / T) ** 1.5);
    const post = L.decay(L.mix([at(bm, T, 0), cr1, cr2, at(sp, T + 0.01, -4), at(th, T + 0.005, -4), at(onset(gong), T + 0.01, -9), at(deb, T + 0.06, -13)], { length: D }), 2.4, T + 0.3);
    let m = L.mix([at(pre), at(post)], { length: D });
    m = L.psychoBass(thicken(shape(m, 'big', 0.45), { crush: 0.25 }), { freq: 100, amount: -7 });
    m = verb(m, SKY, 0.2, { seed: `cov${k}`, ch: 1, length: 2.8 });
    co.push(L.pad(dense(L.fadeOut(L.slice(m, 0, D), 1.2, 'exp'), -14, -0.2, 6), 0.002, 0));
  }
  keep.collapse = { buf: co[0], lufs: -14, vol: 1.15 };
  await add('taifeng_collapse', co, SP([15, 180], { lufs: -14, vol: 1.15, voices: 2, pitch: [0.99, 1.01], priority: 5, note: '眼牆崩落 (code: positional, vol 1.2, t 3.35; damage at 3.55)' }));

  // taifeng_collapse_wave (positional, vol 1): the ring of water rushing out over the street: a surf wash, spray, the
  // water thrown up raining back down 0.6-2.5 s, a backwash gurgle
  const cw = [];
  for (let k = 0; k < 2; k++) {
    const D = 3.0;
    const wash = L.toMono(await crash(k + 1));
    const w = alignAt(L.eq(wash, [{ type: 'hp', f: 90, order: 2 }]), 0.25, 0, 0.05);
    const surf = await src(S.surf, 9.5 + k * 3, 9.5 + k * 3 + D, { hp: 120, fade: 0.6 });
    const sp = L.automate(await spray(2 + k * 2.5, D, 1800), ev([[0, 0], [0.08, 1], [0.8, 0.5], [3, 0]]));
    const fall = patter(D, (t) => (t < 0.5 ? 40 : 300 * Math.exp(-((t - 1.1) ** 2) / 0.35) + 25), { lo: 800, hi: 3600, t60: [0.02, 0.06], seed: `cwf${k}`, tick: -4 });
    let m = L.mix([w, at(surf, 0.05, -5), at(nrm(sp), 0, -10), at(fall, 0, -8)], { length: D });
    m = shape(m, 'water', 0.45);
    cw.push(L.pad(dense(L.fadeOut(m, 0.9, 'exp'), -15, -0.2, 6), 0.002, 0));
  }
  keep.collapse_wave = { buf: cw[0], lufs: -15, vol: 1 };
  await add('taifeng_collapse_wave', cw, SP([12, 120], { lufs: -15, voices: 2, pitch: [0.98, 1.02], priority: 3, note: 'the ring of water (code: positional, vol 1, t 3.35)' }));

  // taifeng_eye_after (positional, vol 0.8, t 3.8): the release — the storm exhaling (a falling breath of wind, the
  // whistles sinking G5 -> D5 and fading: 洩氣), the rain thinning to drips from the eaves, the thunder rolling away,
  // and the clouds breaking on a soft glass-and-brass chord (G5 B5 D6, then E6)
  const af = [];
  for (let k = 0; k < 2; k++) {
    const D = 3.6;
    const sigh = swoosh(1.8, 0.12, [1400, 1100, 260], { q: 0.8, seed: `afs${k}`, rise: 1.4, fall: 4 });
    const sink = L.automate(L.mix([N.G5, N.D6].map((f, i) => at(aeolian(1.6, (t) => f * 2 ** (-5 * smooth(t / 1.2) / 12), { q: 40, seed: `afw${k}${i}` }), 0, -i * 3))), ev([[0, 0], [0.06, 1], [1.4, 0]]));
    const thin = L.automate(rainSynth(2.2, { seed: `afr${k}`, drops: 80 }), (t) => Math.exp(-t / 0.5));
    const drips = patter(D, (t) => 4 + 10 * Math.exp(-t / 0.8), { lo: 700, hi: 2600, t60: [0.04, 0.09], seed: `afd${k}`, tick: -6 });
    const roll = L.airAbsorption(rumble(2.8, { peaks: 3, lp0: 380, lp1: 110, seed: `afl${k}` }), 300);
    const chord = L.mix([[N.G5, 0.6, 0], [N.B5, 0.75, -2], [N.D6, 0.9, -3], [N.E6, 1.35, -5]].map(([f, t0, g], i) => at(i % 2 ? brass(f, 2.2, { t60: 1.8, seed: `afb${k}${i}`, strike: -24 }) : glass(f, 2.2, { t60: 2.0, seed: `afg${k}${i}`, tick: -26 }), t0, g)));
    let m = L.mix([at(sigh, 0, -3), at(sink, 0, -9), at(thin, 0, -10), at(drips, 0.2, -11), at(roll, 0.1, -12), at(nrm(chord), 0, -9)], { length: D });
    m = verb(m, STREET, 0.2, { seed: `afv${k}`, ch: 1, length: 2.2 });
    af.push(L.pad(L.fadeOut(L.slice(m, 0, D), 1.0, 'exp'), 0.002, 0));
  }
  keep.eye_after = { buf: af[0], lufs: -18, vol: 1.3 };
  await add('taifeng_eye_after', af, SP([10, 90], { lufs: -18, vol: 1.3, voices: 1, pitch: [1, 1], note: '§1.12 release: the storm exhales, the clouds break (code: positional, vol 0.8, t 3.8)' }));
}

// ------------------------------------------------------------------------------------------------ the sword's life
async function viewSet(add, SP, LOC, keep) {
  // taifeng_idle (2D loop 5 s, vol 0.08, fade-in 0.4): §1.12 — a 73 / 98 Hz hum (D2 / G2, sines with slow beats on the
  // grid), a 400-1200 Hz band of air swept by a 0.2 Hz LFO (the slot breathing: one cycle per loop), a faint whistle on
  // G5 breathing with it, the anemometer's bearing ticking at 1.4 cup passes a second
  {
    const P = 5.0, X = 0.5, D = P + X, W = 0.5;
    const lfo = (t) => Math.sin(2 * Math.PI * (1 / P) * t);
    const air = L.sweep(L.noise(D, { color: 'pink', seed: 'idA' }), 'bp', (t) => 700 * (1200 / 400) ** (0.5 * lfo(t)), { q: 1.6 });
    const wh = L.automate(aeolian(D, N.G5, { q: 80, seed: 'idW', tone: -60, flutter: 0.2 }), (t) => 0.4 + 0.6 * (0.5 + 0.5 * lfo(t + 0.4)));
    const rt = rotor(D, onGrid(1.4, P) / 3, { seed: 'idR', band: 800, tick: -10, whine: -40 });
    const noisy = L.mix([at(L.stereoize(nrm(air), { width: 0.5, hp: 300, seed: 'ids1' }), 0, 0), at(L.stereoize(wh, { width: 0.4, hp: 300, seed: 'ids2' }), 0, -12), at(L.toStereo(rt), 0, -18)], { channels: 2, length: D });
    const hum = L.mix([[onGrid(N.G2, P), 0], [onGrid(N.G2, P) + 1 / P, -4], [onGrid(N.D2, P), -3], [onGrid(N.G2 * 2, P), -12]].map(([f, g]) => at(L.tone(W + P, { type: 'sine', freq: f }), 0, g)));
    const tonal = L.toStereo(L.scale(nrm(L.saturate(hum, { drive: 3, type: 'tube', mix: 0.4 })), L.db2lin(-3)));
    const m = seamless(P, X, noisy, tonal, W);
    seamCheck('taifeng_idle', m);
    await add('taifeng_idle', m, LOC({ lufs: -18, loop: true, channels: 2, voices: 1, pitch: [1, 1], note: '§1.12 idle hum (code: loop, vol 0.08, fadeIn 0.4: ~-40 LUFS in play)' }));
  }

  // taifeng_draw (clip 0.02 of 0.55 s, vol 0.9): up out of the lower right — the leather grip, the blade's steel rasp
  // and a short ring on D4, the anemometer turning once (0.17 s), the brass rattling
  const dr = [];
  for (let k = 0; k < 3; k++) {
    const r = rng(`dr${k}`), D = 0.8;
    const lea = await grab(S.holster, 0.04, 0.75, { mode: 'peak', pre: 0.01, post: 0.3, hp: 250 });
    const rasp = L.automate(L.sweep(L.noise(0.22, { seed: `drr${k}` }), 'bp', (t) => 1600 * 2 ** (t / 0.12), { q: 5 }), ev([[0, 0], [0.04, 1], [0.16, 0.4], [0.22, 0]]));
    const ring = L.automate(bladeRing(N.D4 * r.range(0.997, 1.003), 0.7, { t60: 0.55, bright: 1, seed: `drg${k}` }), (t) => Math.min(1, t / 0.04));
    const rot = L.automate(rotor(0.5, (t) => 1.6 * Math.exp(-t / 0.25), { seed: `dro${k}`, band: 1000 }), (t) => Math.min(1, t / 0.01) * Math.exp(-t / 0.2));
    const sw = swoosh(0.4, 0.15, [400, 1500, 600], { q: 1.2, seed: `drw${k}`, rise: 2, fall: 6 });
    const m = L.mix([at(L.toStereo(lea), 0, -4), at(L.stereoize(nrm(rasp), { width: 0.4, hp: 1000, seed: `drs${k}` }), 0.02, -6), at(L.stereoize(ring, { width: 0.3, hp: 500, seed: `drt${k}` }), 0.05, -12),
      at(L.stereoize(rot, { width: 0.3, hp: 400, seed: `dru${k}` }), 0.15, -12), at(panMove(sw, (t) => 0.5 - 0.6 * smooth(t / 0.3)), 0, -9)], { channels: 2, length: D });
    dr.push(L.pad(L.fadeOut(L.slice(verb(m, NEAR, 0.1, { seed: `drv${k}` }), 0, D), 0.3, 'exp'), 0.003, 0));
  }
  await add('taifeng_draw', dr, LOC({ lufs: -17, channels: 2, voices: 1, pitch: [0.98, 1.02], note: 'draw clip (vol 0.9)' }));

  // taifeng_draw_first (clip 0.02 of 1.6 s = 0.032 s, vol 0.9; baked to the clip): falling into frame turning (the
  // wind rising, a whistle gliding G4 -> D5, two turning passes), [0.256 _catch_grip], the long horizontal swing round
  // onto the shoulder (peak ~0.55 s), [0.72 _needle, 0.75 _thunder_far, 0.91 _vane_out], a gust of rain sweeping past
  // with the screen's rain (0.87-1.3 s)
  const df = [];
  for (let k = 0; k < 2; k++) {
    const D = 1.55;
    const rise = swoosh(0.35, 0.22, [500, 2400, 1200], { q: 0.9, seed: `dfr${k}`, rise: 1.5, fall: 4 });
    const glide = L.automate(aeolian(0.4, (t) => N.G4 * (N.D5 / N.G4) ** smooth(t / 0.22), { q: 40, seed: `dfg${k}` }), (t) => smooth(t / 0.2) * Math.exp(-Math.max(0, t - 0.22) / 0.05));
    const turns = L.mix([0.06, 0.15].map((t0, i) => at(swoosh(0.16, 0.05, [600, 2200, 900], { q: 1.3, seed: `dft${k}${i}`, rise: 2, fall: 6 }), t0, -i * 2)));
    const long = await swingVariant(k + 60, { P: 0.32, D: 0.85, dir: 1, mass: -3, heavy: 1.2, note: N.D5, seed: 'df' });
    const rain = L.automate(rainSynth(0.6, { seed: `dfn${k}`, drops: 160 }), ev([[0, 0], [0.1, 1], [0.35, 0.7], [0.6, 0]]));
    const rainR = await src(S.rain, 9.0 + k, 9.6 + k, { ch: 2, hp: 300, fade: 0.1 });
    const rg = L.automate(L.mix([at(L.stereoize(rain, { width: 0.8, hp: 800, seed: `dfq${k}` })), at(rainR, 0, -3)], { channels: 2 }), ev([[0, 0], [0.1, 1], [0.35, 0.7], [0.6, 0]]));
    const m = L.mix([at(panMove(rise, (t) => 0.7 - 0.5 * t), 0, -4), at(L.toStereo(glide), 0, -12), at(panMove(turns, () => 0.5), 0, -10), at(long, 0.22, -1), at(rg, 0.85, -9)], { channels: 2, length: D });
    df.push(L.pad(dense(L.fadeOut(m, 0.3, 'exp'), -15, -0.2, 6), 0.002, 0));
  }
  await add('taifeng_draw_first', df, LOC({ lufs: -15, channels: 2, voices: 1, pitch: [1, 1], note: 'baked to the taifeng_first clip (1.6 s): plays at 0.032 s (vol 0.9)' }));

  // taifeng_catch_grip (clip 0.256 s): 金屬握持聲 — the palm slapping the leather, the guard's brass rattling, the
  // anemometer spinning up 0 -> 12 rad/s
  const cg = [];
  for (let k = 0; k < 2; k++) {
    const D = 0.75;
    const slap = await grab(S.holster, 0.04, 0.75, { mode: 'peak', pre: 0.003, post: 0.15, hp: 200 });
    const thud = L.thump({ f0: 160, f1: 90, sweep: 0.01, decay: 0.07, click: 0.3, drive: 2, seed: `cgt${k}` });
    const clk = await grab(S.metalL(k + 3), 0, 0.3, { mode: 'peak', pre: 0.002, post: 0.12, hp: 900 });
    const rot = L.automate(rotor(D, (t) => 1.9 * smooth(t / 0.45), { seed: `cgr${k}`, band: 1000 }), ev([[0, 0], [0.1, 1], [0.6, 0.8], [0.75, 0]]));
    const m = L.mix([at(L.toStereo(slap), 0, -1), at(L.toStereo(nrm(thud)), 0, -6), at(L.toStereo(clk), 0.012, -8), at(L.stereoize(rot, { width: 0.3, hp: 400, seed: `cgs${k}` }), 0.02, -12)], { channels: 2, length: D });
    cg.push(L.pad(L.fadeOut(m, 0.15, 'exp'), 0.003, 0));
  }
  await add('taifeng_catch_grip', cg, LOC({ lufs: -18, channels: 2, voices: 1, pitch: [0.98, 1.02], note: 'first draw grab (clip 0.256 s, vol 0.9)' }));

  // taifeng_first_sting (clip 1.28 s, as the glow pulses): the signature — the slot's whistle chord G4 / D5 / G5
  // blooming, the brass bell on G5 with glass D6, a gust exhaling (the vanes closing like a breath), a far roll
  const fs = [];
  for (let k = 0; k < 2; k++) {
    const D = 1.6;
    const chord = L.mix([N.G4, N.D5, N.G5].map((f, i) => at(aeolian(D, f, { q: 55, seed: `fsw${k}${i}` }), i * 0.03, -i * 2, [-0.3, 0.3, 0][i])), { channels: 2 });
    const chE = L.automate(chord, ev([[0, 0], [0.12, 1], [0.6, 0.55], [1.5, 0]]));
    const bell = L.mix([at(brass(N.G5, D, { t60: 1.4, seed: `fsb${k}` })), at(glass(N.D6, D, { t60: 1.2, seed: `fsg${k}`, tick: -22 }), 0.04, -4)]);
    const ex = swoosh(1.0, 0.1, [1800, 1200, 300], { q: 0.9, seed: `fse${k}`, rise: 1.5, fall: 4 });
    const roll = L.airAbsorption(rumble(1.6, { peaks: 2, lp0: 400, lp1: 120, seed: `fsr${k}` }), 250);
    let m = L.mix([at(chE, 0, -6), at(L.stereoize(bell, { width: 0.4, hp: 500, seed: `fsx${k}` }), 0.02, -5), at(panMove(ex, (t) => -0.2 + 0.4 * t), 0, -10), at(L.toStereo(roll), 0.1, -14), at(L.toStereo(lux(`fsl${k}`)), 0.02, -16)], { channels: 2, length: D });
    m = verb(m, STREET, 0.18, { seed: `fsv${k}`, length: 1.6 });
    fs.push(L.pad(L.fadeOut(L.slice(m, 0, D), 0.5, 'exp'), 0.002, 0));
  }
  keep.first_sting = { buf: fs[0], lufs: -16, vol: 1.2 };
  await add('taifeng_first_sting', fs, LOC({ lufs: -16, vol: 1.2, channels: 2, voices: 1, pitch: [1, 1], note: 'first draw sting (clip 1.28 s, vol 0.9)' }));

  // taifeng_thunder_far (the first draw's 遠雷, clip 0.75 s, vol 0.9 — 2D): a strike a kilometre off: the split
  // darkened by the air, a long roll
  const tf = [];
  for (let k = 0; k < 2; k++) {
    const D = 2.6;
    const s = await thunderStrike(`tf${k}`, k, { len: D, big: 2.0, near: 0.6, roll: -2 });
    const far = L.airAbsorption(L.eq(s, [{ type: 'lp', f: 3200, order: 2 }]), 500);
    const rl = rumble(D, { peaks: 4, lp0: 850, lp1: 160, seed: `tfr${k}`, first: 0.08 });
    let m = L.mix([at(far, 0.02, 0), at(rl, 0, -2)], { length: D });
    m = L.psychoBass(L.eq(m, [{ type: 'peak', f: 420, gain: 4, q: 0.7 }]), { freq: 110, amount: -3 });
    m = L.stereoize(verb(m, SKY, 0.3, { seed: `tfv${k}`, ch: 1, length: D }), { width: 0.5, hp: 150, seed: `tfw${k}` });
    tf.push(L.pad(L.fadeOut(L.slice(m, 0, D), 0.9, 'exp'), 0.004, 0));
  }
  await add('taifeng_thunder_far', tf, LOC({ lufs: -19, channels: 2, voices: 1, pitch: [0.97, 1.03], maxHeadMs: 40, note: '遠雷 of the first draw (clip 0.75 s, vol 0.9)' }));

  // taifeng_inspect (clip 0.1 of 4.2 s = 0.42 s, vol 0.9): §1.12 — an original 2.6 s phrase in G 宮 on the dial's brass
  // bell and glass, the slot's whistle doubling the long notes, over a soft wind wash; spaced around the foley that
  // lands on it (the glass tap 1.34 s in, the anemometer flick 1.76 s, the wipe 2.35 s)
  {
    const D = 3.2;
    const phrase = [[N.D5, 0.0, 0.3], [N.E5, 0.15, 0.3], [N.G5, 0.3, 0.6], [N.A5, 0.82, 0.25], [N.B5, 0.96, 0.25], [N.D6, 1.1, 0.7], [N.B5, 1.95, 0.2], [N.A5, 2.1, 0.2], [N.G5, 2.26, 0.9]];
    const notes = [], whs = [];
    phrase.forEach(([f, t0, d], i) => {
      const pan = Math.sin(i * 1.3) * 0.35;
      notes.push(at(L.mix([at(brass(f, 1.8, { t60: 1.3, seed: `ipb${i}`, strike: -20 })), at(glass(f * 2, 1.4, { t60: 0.9, seed: `ipg${i}`, tick: -26 }), 0.005, -9)]), t0, i === 5 || i === 8 ? 0 : -2, pan));
      if (d >= 0.6) whs.push(at(L.automate(aeolian(d + 0.4, f, { q: 65, seed: `ipw${i}` }), ev([[0, 0], [0.08, 1], [d, 0.6], [d + 0.4, 0]])), t0, 0, pan * 0.5));
    });
    const wash = L.automate(L.toMono(await howl(23.0, D, { hp: 300 })), ev([[0, 0], [0.4, 1], [2.4, 0.8], [3.2, 0]]));
    let m = L.mix([at(nrm(L.mix(notes, { channels: 2 })), 0, -4), at(nrm(L.mix(whs, { channels: 2 })), 0, -12), at(L.stereoize(wash, { width: 0.5, hp: 300, seed: 'ipws' }), 0, -18)], { channels: 2, length: D });
    m = verb(m, STREET, 0.22, { seed: 'ipv', length: 2.0 });
    keep.inspect = { buf: m, lufs: -19, vol: 1 };
    await add('taifeng_inspect', L.pad(L.fadeOut(L.slice(m, 0, D), 0.6, 'exp'), 0.002, 0), LOC({ lufs: -19, channels: 2, voices: 1, pitch: [1, 1], note: '§1.12 檢視 phrase (clip 0.42 s, vol 0.9)' }));
  }

  // taifeng_glass_tap (vol 0.5: the inspect's thumb on the dial, the ready / idle-tier needle twitches): a fingertip
  // on glass, the needle's hairspring quivering (subtle: it repeats every 2.5 s while ready)
  const gt = [];
  for (let k = 0; k < 4; k++) {
    const tap = await grab(k % 2 ? S.glassL(k) : S.cup, k % 2 ? 0 : 0.12, k % 2 ? 0.2 : 0.24, { mode: 'peak', pre: 0.002, post: 0.08, hp: 1200 });
    const skin = L.noiseBurst({ dur: 0.02, decay: 0.006, bp: 1800, q: 1, seed: `gts${k}` });
    const m = L.mix([at(tap, 0, 0), at(nrm(skin), 0, -10), at(needleTick(`gtn${k}`, { f: 3300 + k * 110, ring: -10 }), 0.004, -6)], { length: 0.35 });
    gt.push(L.pad(L.fadeOut(m, 0.12, 'exp'), 0.003, 0));
  }
  await add('taifeng_glass_tap', gt, LOC({ lufs: -22, vol: 1.2, channels: 1, voices: 2, pitch: [0.97, 1.03], note: 'dial glass tap (code: vol 0.5; repeats while ready)' }));

  // taifeng_rotor_flick (clip 2.18 s, vol 0.9): a finger flicks the anemometer to 30 rad/s: the flick, the cups
  // whupping 14 -> 2 times a second as it spins down, the bearing's whine falling
  const rf = [];
  for (let k = 0; k < 2; k++) {
    const D = 1.7;
    const flick = L.mix([at(nrm(L.noiseBurst({ dur: 0.015, decay: 0.004, bp: 2600, q: 1.5, seed: `rff${k}` }))), at(K.tick(`rfk${k}`, 3800), 0.002, -4)]);
    const rot = L.automate(rotor(D, (t) => 4.8 * Math.exp(-t / 0.75), { seed: `rfr${k}`, band: 1050, tick: -12, whine: -20 }), (t) => Math.min(1, t / 0.01) * (0.4 + 0.6 * Math.exp(-t / 0.6)));
    const m = L.mix([at(L.toStereo(flick), 0, -2), at(L.stereoize(rot, { width: 0.3, hp: 400, seed: `rfs${k}` }), 0.005, -3)], { channels: 2, length: D });
    rf.push(L.pad(L.fadeOut(m, 0.4, 'exp'), 0.003, 0));
  }
  await add('taifeng_rotor_flick', rf, LOC({ lufs: -19, channels: 2, voices: 1, pitch: [0.98, 1.02], note: 'inspect: anemometer flick (clip 2.18 s, vol 0.9)' }));

  // taifeng_wipe (code 2D, vol 0.6): the palm along the wet flat: a stick-slip squeak on wet steel, a wet smear, the
  // water pushed off in a patter, the steel shimmering faintly
  const wp = [];
  for (let k = 0; k < 2; k++) {
    const D = 0.85, r = rng(`wp${k}`);
    const ss = L.Buf.seconds(D, 1), d = ss.data[0];
    let t = 0.03;
    while (t < 0.6) { const i = Math.round(t * SR); for (let j = 0; j < 90 && i + j < d.length; j++) d[i + j] += (r.next() * 2 - 1) * Math.exp(-j / 18); t += 1 / r.range(45, 75); }
    const squeak = L.automate(L.eq(ss, [{ type: 'bp', f: 1700 + k * 200, q: 2.2 }, { type: 'peak', f: 3400, gain: 4, q: 2 }]), ev([[0, 0], [0.06, 1], [0.5, 0.8], [0.62, 0]]));
    const smear = L.automate(L.eq(L.noise(D, { color: 'pink', seed: `wps${k}` }), [{ type: 'bp', f: 900, q: 0.9 }]), ev([[0, 0], [0.05, 1], [0.55, 0.7], [0.65, 0]]));
    const sq = await src(S.squish, 0, 0.6, { hp: 600 });
    const off = patter(0.5, (t) => 120 * Math.exp(-((t - 0.25) ** 2) / 0.02), { lo: 1500, hi: 4500, t60: [0.015, 0.035], seed: `wpd${k}` });
    const shim = L.automate(bladeRing(N.B4, D, { t60: 0.8, bright: 0.6, seed: `wpr${k}` }), ev([[0, 0], [0.2, 1], [0.6, 0.5], [0.85, 0]]));
    const m = L.mix([at(panMove(nrm(squeak), (t) => -0.3 + 0.6 * t / 0.6), 0, -4), at(L.stereoize(nrm(smear), { width: 0.3, hp: 400, seed: `wpm${k}` }), 0, -8), at(L.toStereo(sq), 0.05, -12),
      at(L.stereoize(off, { width: 0.6, hp: 900, seed: `wpo${k}` }), 0.25, -10), at(L.stereoize(shim, { width: 0.3, hp: 500, seed: `wpt${k}` }), 0, -22)], { channels: 2, length: D });
    wp.push(L.pad(L.fadeOut(m, 0.2, 'exp'), 0.003, 0));
  }
  await add('taifeng_wipe', wp, LOC({ lufs: -20, channels: 2, voices: 1, pitch: [0.98, 1.02], note: 'inspect: palm wipes the wet flat (code: 2D, vol 0.6)' }));

  // taifeng_gust_blow (rare inspect, clip 0.29 of 4.2 s = 1.22 s, the shove 0.08 s later): a squall slamming into the
  // sword — a recorded gust peaking at 0.15 s, a howl, rain lashing the screen, the anemometer racing, a low rumble
  const gb = [];
  for (let k = 0; k < 2; k++) {
    const D = 2.4;
    const g = await gust(k), gp = peakTime(g, 0.05);
    const gs = L.stereoize(L.eq(L.fadeOut(L.slice(g, Math.max(0, gp - 0.15), gp + 2.0), 0.8, 'exp'), [{ type: 'hp', f: 150, order: 2 }, { type: 'peak', f: 800, gain: 3, q: 0.7 }]), { width: 0.6, hp: 300, seed: `gbg${k}` });
    const hw = L.automate(await howl(12 + k * 7, D), ev([[0, 0.2], [0.15, 1], [1.2, 0.6], [2.4, 0]]));
    const rain = L.automate(L.mix([at(await src(S.rain, 9.2, 9.2 + D, { ch: 2, hp: 300, fade: 0.2 })), at(L.stereoize(rainSynth(D, { seed: `gbr${k}`, drops: 160 }), { width: 0.8, hp: 600, seed: `gbs${k}` }), 0, -4)], { channels: 2 }), ev([[0, 0], [0.12, 1], [1.2, 0.6], [2.4, 0]]));
    const rot = L.automate(rotor(D, (t) => 1 + 5.4 * smooth(t / 0.3) * Math.exp(-Math.max(0, t - 0.5) / 1.2), { seed: `gbq${k}`, band: 1200 }), ev([[0, 0], [0.1, 1], [1.8, 0.6], [2.4, 0]]));
    const rb = rumble(D, { peaks: 2, lp0: 400, lp1: 110, seed: `gbl${k}` });
    const m = L.mix([at(gs, 0, 0), at(hw, 0, -6), at(rain, 0, -7), at(L.stereoize(rot, { width: 0.3, hp: 400, seed: `gbt${k}` }), 0, -14), at(L.toStereo(rb), 0.05, -12)], { channels: 2, length: D });
    gb.push(L.pad(dense(L.fadeOut(m, 0.6, 'exp'), -15, -0.2, 6), 0.002, 0));
  }
  await add('taifeng_gust_blow', gb, LOC({ lufs: -15, channels: 2, voices: 1, pitch: [1, 1], note: 'rare inspect squall (clip 1.22 s, vol 0.9)' }));
}

// ------------------------------------------------------------------------------------------------ ready
async function readySet(add) {
  // 就緒 (颱風能量 full; fanfare vol 1, reminders vol 0.25): the storm lamp's relay clacking on, then the slot's thin
  // storm whistle — a breathy call gliding D6 -> G6 and held with a flutter, a quick B6 lift at the end — the
  // anemometer kicking up, a brass ting on G6, a far roll. No other ready in the game is a wind whistle.
  const vars = [];
  for (let k = 0; k < 2; k++) {
    const D = 1.5;
    const relay = L.mix([at(K.tick(`rdk${k}`, 3000)), at(nrm(L.thump({ f0: 600, f1: 350, sweep: 0.004, decay: 0.03, click: 0.4, drive: 2, seed: `rdt${k}` })), 0.002, -6)]);
    const fcall = (t) => (t < 0.09 ? N.D6 * (N.G6 / N.D6) ** smooth(t / 0.09) : t < 0.62 ? N.G6 : N.G6 * (N.B6 / N.G6) ** smooth((t - 0.62) / 0.05));
    const call = L.automate(aeolian(0.95, fcall, { q: 38, h: [1, 0.25, 0.08], tone: -4, breath: -14, flutter: 0.35, vib: 0.006, seed: `rdw${k}` }), ev([[0, 0], [0.03, 0.8], [0.12, 1], [0.6, 0.85], [0.66, 1], [0.95, 0]]));
    const call2 = L.automate(aeolian(0.95, (t) => fcall(t) * 1.5, { q: 45, seed: `rdv${k}` }), ev([[0, 0], [0.1, 1], [0.6, 0.6], [0.95, 0]]));
    const rot = L.automate(rotor(0.8, (t) => 1 + 3 * Math.exp(-t / 0.3), { seed: `rdr${k}`, band: 1100 }), (t) => Math.min(1, t / 0.01) * Math.exp(-t / 0.35));
    const ting = brass(N.G6, 1.2, { t60: 0.9, seed: `rdb${k}`, strike: -18 });
    const roll = L.airAbsorption(rumble(1.4, { peaks: 2, lp0: 400, lp1: 120, seed: `rdl${k}` }), 300);
    let m = L.mix([at(L.toStereo(relay), 0, -6), at(panMove(call, (t) => -0.25 + 0.5 * smooth(t / 0.9)), 0.02, -1), at(panMove(call2, (t) => 0.25 - 0.5 * smooth(t / 0.9)), 0.03, -16),
      at(L.stereoize(rot, { width: 0.4, hp: 400, seed: `rds${k}` }), 0.02, -14), at(L.stereoize(ting, { width: 0.3, hp: 800, seed: `rdz${k}` }), 0.1, -6), at(L.toStereo(roll), 0.15, -20)], { channels: 2, length: D });
    m = L.eq(m, [{ type: 'hp', f: 100, order: 2 }]);
    m = verb(m, STREET, 0.2, { seed: `rdq${k}`, length: 1.4 });
    vars.push(L.pad(L.fadeOut(L.slice(m, 0, D), 0.5, 'exp'), 0.002, 0));
  }
  await add('ready_taifeng', vars, { lufs: -18, bus: 'ui', spatial: false, channels: 2, voices: 2, pitch: [1, 1], priority: 3, note: 'unique ready (specials.js readyFanfare vol 1, reminders 0.25)' });
}

// ------------------------------------------------------------------------------------------------ def.sound contract
async function contractSet(add, SP, LOC) {
  // a teammate's swing reported as a shot (remote.js: <sound>_close < 40 m, _far beyond; a melee special never sends
  // one, so these are a safety net): the swing, mono; its street reflections; the far version
  const sw = [];
  for (let k = 0; k < 3; k++) sw.push(mono(await swingVariant(k + 70, { dir: k % 2 ? -1 : 1, note: N.D5, seed: 'ct' })));
  await add('taifeng_close', sw.map((b) => cut(b, 0.6, 0.3)), SP([3, 40], { lufs: -18, voices: 3, pitch: [0.95, 1.05], note: 'def.sound contract: a teammate\'s swing (safety net)' }));
  const tails = sw.slice(0, 2).map((b, k) => L.fadeIn(mono(L.convolve(L.slice(b, 0, 0.3), L.makeIR('alley', { seed: `ctt${k}`, channels: 1, length: 0.7 }), { wet: 1, dry: 0 })), 0.02));
  await add('taifeng_tail', tails, LOC({ target: 'gunTail', vol: 0.25, channels: 1, voices: 2, pitch: [0.95, 1.05], maxHeadMs: 40, note: 'def.sound contract (never played by the sword itself)' }));
  const fars = sw.slice(0, 2).map((b) => L.eq(b, [{ type: 'lp', f: 2400, order: 2 }, { type: 'hp', f: 180, order: 2 }]));
  await add('taifeng_far', fars, SP([10, 40], { target: 'gunFar', vol: 0.4, voices: 2, pitch: [0.94, 1.06] }));
}

// ------------------------------------------------------------------------------------------------ references
/** The sequences as the player hears them (pre-codec, each cue at its target x the manifest vol x the code's volume):
 *  preview WAV + spectrogram in tools/audio/out/premium_taifeng/preview/ (not shipped), loudness logged. */
async function references(keep) {
  // stereo, as heard: a stereo file plays as is (2D); a mono file plays on both speakers when 2D (the engine's up-mix:
  // +3 dB over its one-channel measure) or through the equal-power panner when positional (here: centred, at full
  // level inside its reference distance)
  const lv = (key, codeVol = 1, rate = 1, mode = '2d') => {
    const e = keep[key];
    if (!e) return null;
    let b = L.normalizeLufs(e.buf, e.lufs, { ceiling: 0 });
    if (rate !== 1) b = L.varispeed(b, rate);
    if (b.channels === 1) b = mode === 'pos' ? L.scale(L.toStereo(b), Math.SQRT1_2) : L.toStereo(b);
    return L.scale(b, (e.vol ?? 1) * codeVol);
  };
  const pos = (key, codeVol, rate = 1) => lv(key, codeVol, rate, 'pos');
  const loopFor = (key, dur, codeVol, mode) => { const b = lv(key, codeVol, 1, mode); if (!b) return null; const n = Math.ceil(dur / b.duration) + 1; return L.fadeOut(L.slice(L.concat(Array(n).fill(b)), 0, dur), 0.3); };
  const put = (buf, t) => (buf ? [{ buf, at: t }] : []);
  const report = (label, b) => { const m = L.loudness(b); ctx.log(`  ref ${label}: integrated ${m.integrated.toFixed(1)} LUFS, momentary max ${m.momentaryMax.toFixed(1)}, short-term max ${m.shortTermMax.toFixed(1)}`); };
  // guns for scale (rifle556_close, stereo, -12 LUFS): one shot, and a 1.5 s burst at 750 rpm with its tails
  try {
    const dir = fileURLToPath(new URL('../../../game/assets/audio/weapons/', import.meta.url));
    const shots = [], tails = [];
    for (let i = 1; i <= 3; i++) { shots.push(await L.readAudio(`${dir}rifle556_close_${i}.ogg`)); tails.push(await L.readAudio(`${dir}rifle556_tail_${i}.ogg`)); }
    report('gun: one rifle556_close', shots[0]);
    const burst = [];
    for (let i = 0; i < 19; i++) burst.push(at(L.setChannels(shots[i % 3], 2), i * 0.08), at(L.scale(L.setChannels(tails[i % 3], 2), 0.9), i * 0.08 + 0.015));
    report('gun: 1.5 s rifle556 burst', L.mix(burst, { channels: 2 }));
  } catch { /* the weapons category may be absent in a dry run */ }
  // 三段斬 into a crowd: swing (hit 0.15) -> swing2 (0.48 + 0.17) -> cleave (0.96 + 0.33), a hit + flesh each time, a
  // kill on the second, the slam + crown at the third
  if (keep.swing && keep.hit) {
    const t2 = 0.48, t3 = 0.96;
    const parts = [...put(lv('swing', 0.9), 0.0675), ...put(pos('hit', 0.9), 0.15), ...put(lv('swing2', 0.9, 1.05), t2 + 0.0765), ...put(pos('hit', 0.9), t2 + 0.17), ...put(pos('kill', 0.6), t2 + 0.17),
      ...put(lv('cleave', 1), t3 + 0.198), ...put(pos('slam', 0.9), t3 + 0.33), ...put(pos('slam_water', 0.8), t3 + 0.33), ...put(pos('hit', 1), t3 + 0.33)];
    const b = L.mix(parts, { length: 3.0, channels: 2 });
    report('combo (三段斬)', b);
    ctx.preview('ref_combo', b);
  }
  // 三階蓄力 to stage 2 -> release: the charge (rate 0.8 -> 1.25), stage cues at 0.4 / 1.3, the gale + two blades
  if (keep.charge && keep.gale) {
    const ch = lv('charge', 0.5), n = Math.ceil(1.6 / ch.duration) + 1;
    const chg = L.fadeOut(L.slice(L.varispeedCurve(L.concat(Array(n).fill(ch)), [[0, 0.8], [2.2, 1.25], [3, 1.25]]), 0, 1.5), 0.1);
    const parts = [...put(chg, 0), ...put(lv('stage', 0.6), 0.4), ...put(lv('stage', 0.6, 1.1225), 1.3), ...put(lv('gale', 1, 0.92), 1.5), ...put(lv('gale_fly', 0.8), 1.6), ...put(lv('gale_fly', 0.8), 1.8), ...put(pos('gale_hit', 0.9), 1.75)];
    const b = L.mix(parts, { length: 3.2, channels: 2 });
    report('charge -> 2-stage release', b);
    ctx.preview('ref_charge', b);
  }
  // 斬浪擲: the throw, the flight (loop, 1.6 s), two pierces, the turn, the catch
  if (keep.throw && keep.throw_fly) {
    const parts = [...put(lv('throw', 1), 0.154), ...put(loopFor('throw_fly', 1.8, 0.65, 'pos'), 0.22), ...put(pos('throw_hit', 0.9), 0.6), ...put(pos('throw_hit', 0.9), 0.85), ...put(lv('catch', 1), 2.1)];
    const b = L.mix(parts, { length: 3.6, channels: 2 });
    report('throw', b);
    ctx.preview('ref_throw', b);
  }
  // 颱風眼 at ~8 m (positional cues at full level inside their reference distance): cast, rise (0.3 s), sigil (0.35),
  // the bed (0.45 -> 3.8), rain (L4), 7 bolts, the collapse + wave (3.35), the release (3.8)
  if (keep.eye_cast && keep.collapse) {
    const parts = [...put(lv('eye_cast', 1), 0), ...put(lv('eye_rise', 0.9), 0.3), ...put(pos('eye_sigil', 0.9), 0.35), ...put(loopFor('eye_loop', 3.75, 1, 'pos'), 0.45), ...put(loopFor('eye_rain', 4.5, 0.6), 0.45)];
    for (let i = 0; i < 7; i++) parts.push(...put(pos('thunder', 0.9, [1, 0.97, 1.03, 0.95, 1.05, 0.98, 1.02][i]), 0.85 + i * 0.4));
    parts.push(...put(pos('collapse', 1.2), 3.35), ...put(pos('collapse_wave', 1), 3.35), ...put(pos('kill', 0.6), 3.57), ...put(pos('eye_after', 0.8), 3.8));
    const b = L.mix(parts, { length: 7.5, channels: 2 });
    report('颱風眼 ultimate', b);
    ctx.preview('ref_ult', b);
  }
}

// ------------------------------------------------------------------------------------------------ produce
export async function produce(lib, c) {
  L = lib; ctx = c; K = makeKit(lib, ctx);
  const only = process.env.TF_ONLY ? new Set(process.env.TF_ONLY.split(',').map((s) => s.trim())) : null;
  if (only && !process.env.CF_AUDIO_OUT) throw new Error('TF_ONLY writes a partial category: set CF_AUDIO_OUT to a scratch folder');
  const want = (g) => !only || only.has(g);
  const cat = ctx.category('premium_taifeng', { bus: 'sfx' });
  // the premium_sunbow / premium_chunting mastering wrapper: short one-shots lose 0.5-1.5 dB of loudness in Vorbis
  // (pre-compensated); longer ones get the codec-aware pre-master (weapons.mjs codecSafe); EPERM retry for a file the
  // dev server is reading
  const add = async (name, bufs, opts) => {
    bufs = (Array.isArray(bufs) ? bufs : [bufs]).filter(Boolean);
    opts = { sources: [...USED], ...opts };
    USED = new Set();
    const lufs = opts.lufs ?? L.TARGETS[opts.target];
    if (!opts.loop && lufs !== undefined && bufs.every((b) => b.duration < 0.35)) {
      const ch = opts.channels ?? ((opts.spatial ?? true) ? 1 : undefined), out = [];
      for (const b of bufs) {
        let m = L.finalize(b, { lufs, ceiling: -1.4, channels: ch });
        const loss = lufs - L.lufs(await L.decodeBytes(await L.encodeOgg(m, { quality: 0.5 }), 'trim.ogg'));
        if (Math.abs(loss) > 0.1) { m = L.gain(m, loss); if (L.truePeakDb(m) > -1.4) m = L.limit(m, { ceiling: -1.4 }); }
        out.push(m);
      }
      bufs = out; opts = { ...opts, lufs, normalize: false };
    } else if (!opts.loop && lufs !== undefined) {
      const ch = opts.channels ?? ((opts.spatial ?? true) ? 1 : undefined), out = [];
      K.codecLog.length = 0;
      for (const b of bufs) out.push(await K.codecSafe(ch ? L.setChannels(b, ch) : b, lufs, { quality: opts.quality ?? 0.5, release: 0.015 }));
      const lim = K.codecLog.map((x) => x.limitedDb);
      if (Math.max(...lim) > 0.5) ctx.log(`  pre-master ${name}: limiter ${lim.join(' / ')} dB`);
      bufs = out;
    }
    if (!opts.loop) opts = { limiter: { release: 0.015 }, ...opts };
    for (let attempt = 1; ; attempt++) {
      try { return await cat.add(name, bufs, opts); } catch (e) {
        if (!/EPERM|EBUSY|EACCES/.test(e.code || '') || attempt >= 6) throw e;
        ctx.warn(`${name}: ${e.code} writing a file, retry ${attempt}/5`);
        cat.reports = cat.reports.filter((r) => r.sound !== name);
        await new Promise((res) => setTimeout(res, 1500 * attempt));
      }
    }
  };
  const SP = (range, o = {}) => ({ spatial: true, channels: 1, range, ...o });      // positional (mono)
  const LOC = (o = {}) => ({ spatial: false, ...o });                                   // 2D (local only)
  const keep = {};

  if (want('combo')) await comboSet(add, SP, LOC, keep);
  if (want('hits')) await hitSet(add, SP, LOC, keep);
  if (want('draw')) await drawSet(add, SP, LOC, keep);
  if (want('charge')) await chargeSet(add, SP, LOC, keep);
  if (want('gale')) await galeSet(add, SP, LOC, keep);
  if (want('throw')) await throwSet(add, SP, LOC, keep);
  if (want('ult')) await ultSet(add, SP, LOC, keep);
  if (want('view')) await viewSet(add, SP, LOC, keep);
  if (want('ready')) await readySet(add);
  if (want('contract')) await contractSet(add, SP, LOC);
  if (!only || want('ref')) await references(keep);
  await cat.write();
}
