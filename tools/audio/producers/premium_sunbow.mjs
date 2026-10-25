// X03 彤弓．落陽 Tonggong Sunfall (神兵 great bow, docs/PREMIUM_WEAPONS.md §2.30 + §1.12) — category 'premium_sunbow':
// every cue game/src/weapons/premium/sunbow.js plays (its SND table, clip 'snd' events, the idle hum, the def's ready cue)
// plus the def.sound contract (sunbow_close / _tail / _far: what teammates hear when a bow is loosed). CC0 recordings
// from the shared inventory (knife stabs / thrusts for the arrow striking, wood and rock-on-wood knocks, a ship's
// creaking timbers for the limbs, fire whooshes / combustion / crackle / sizzle, explosions and rubble, a subsonic
// fly-by whiz, VSCO timpani / gong / cymbals / F horn, taiko, a choir, porcelain and glass, breath, cloth) plus
// synthesis: the bowstring itself (Karplus-Strong with a pick-position comb and the tension-release glide), stick-slip
// creak, bronze bells / 磬 bowl / jade chimes, a sun "scream" whistle, the stuck shaft's thrum, a 嗩吶-like double reed.
// Palette: horn-and-bamboo bow, bronze, gold and fire. Key E (宮 pentatonic E F# G# B C#) for every tuned part.
//
//   bow       sunbow_release (點射 / 引: string 錚 + bracer slap + limbs knocking home + the arrow leaving + a bronze
//             theme ring + the §1.12 30 ms 6-10 kHz luxury tick), sunbow_release_heavy (滿 / 貫日 / 分曦: deeper string,
//             fire 呼, sub), sunbow_whiz (貫日 only: the sun arrow screaming off + the low 轟), sunbow_split (five
//             whistles fanning out)
//   draw      sunbow_creak (loop, setRate 0.85 -> 1.2: stick-slip 吱 + timber creaks + the forming arrow's sizzle),
//             sunbow_stage1/2/3 (引 low bell, 滿 mid bell + flame 呼, 貫日 high bell + lock thud + shimmer; the code plays
//             them at pitch 1 / 1.12 / 1.26, so they are rendered a semitone-exact step lower: they land on B4 E5 B5),
//             sunbow_full (loop: the white-hot head's ember scream), sunbow_nock (a new arrow burns onto the string),
//             sunbow_dry
//   hits      sunbow_hit (into flesh 噗 + fire), sunbow_hit_world (into a wall 篤 + the shaft's thrum), sunbow_ignite,
//             sunbow_pin (貫日 pin), sunbow_kill (the 「日」 bell), sunbow_empower (an arrow through 懸日: 錚)
//   skills    sunbow_hang (a sun blooms), sunbow_hang_loop, sunbow_hang_burst (blast + bronze bell tail; also the
//             ult's exit at pitch 0.7)
//   ult       §1.12 three layers: sunbow_ult_raise = rise (inhale, cymbal roll, a tone 0.8 -> 1.25) 0.42 s -> 40-60 Hz
//             impact (timpani + taiko + sub + gong) -> bed (nine bells as the nine suns ignite, horns + choir in E);
//             each sun: sunbow_ult_shot (錚 + pop) -> sunbow_ult_fall (the falling sun) -> sunbow_ult_impact; the ninth:
//             sunbow_ult_final (40-60 Hz boom, gong and bronze bell tail, the deflate 洩氣 and embers)
//   other     ready_sunbow (unique ready: a bronze 磬 bowl stroke + a bowstring harmonic + a sun glint),
//             ready_sunbow_eclipse (the reserved twin 彤弓．月蝕: the ready -4 st with an echo, baked because
//             specials.js plays the def's ready cue directly; not referenced until the twin is built), sunbow_crisis
//             (lacquer / porcelain shatter, gold leaves, the flame tail), sunbow_draw, sunbow_first (first draw: swing
//             in, nine rising chimes, the 日珠 flare, the 射日 sting: drum + a 嗩吶-like rising line), sunbow_idle
//             (§1.12 hum loop), sunbow_pluck, sunbow_inspect (2-3 s phrase), sunbow_rekindle, sunbow_regen (one 磬
//             chime per relit core: five pentatonic variants, any run of them is in key)
//   gun       sunbow_close (teammates' bow, positional), sunbow_tail / sunbow_far (def.sound contract)
//
//   node --max-old-space-size=1536 tools/audio/build.mjs --only premium_sunbow
//   dev subset (never into the game folder: a subset run deletes the other files of the category):
//   CF_AUDIO_OUT=tools/audio/out/sb-dev SB_ONLY=bow,draw node --max-old-space-size=1536 tools/audio/run-producer.mjs \
//     tools/audio/producers/premium_sunbow.mjs --spectrograms all
import { makeKit } from './weapons.mjs';

const SR = 48000;
let L, ctx, K;

const S = {
  // flight / striking
  whiz: 'fs:789222', swoosh: 'fs:507466', swing: 'fs:268227', slap: 'fs:390462',
  wall: 'fs:504618', stab: 'fs:411743', stab2: 'fs:179222', meaty: 'fs:779805', wet: 'fs:626405', sticks: 'fs:319214',
  rockWood: 'fs:319227', woodH: (k) => `kenney_impact/Audio/impactWood_heavy_00${k}`, woodM: (k) => `kenney_impact/Audio/impactWood_medium_00${k}`,
  clang: 'fs:201094', creak: 'fs:31574',
  // fire
  combust: 'fs:412558', fireA: 'fs:260554', fireB: 'fs:260555', crackle: 'fs:363092', sizzle: 'fs:382313',
  // blasts / debris
  grenade: 'fs:609587', blast: 'fs:516914', expl: 'fs:398283', deep: 'fs:258195', huge: 'fs:366086', rubble: 'fs:758580', rubble2: 'fs:569510',
  // music / ritual
  timpE3: 'fs:373921', taiko: 'fs:486140', taiko2: 'fs:486141', gong: 'fs:375532', gongHard: 'fs:375531', gongSmack: 'fs:375553',
  opera: 'fs:452400', cymRoll: 'fs:375519', crash: 'fs:375497', hornD3: 'fs:373257', hornA3: 'fs:373253', hornD5: 'fs:373248',
  hornStacD5: 'fs:373231', choirA: 'fs:764329', choirB: 'fs:764330',
  // porcelain / cloth / breath
  plate: 'fs:565642', glassSmash: 'fs:244238', cloth: 'fs:334219', cape: 'fs:494797', fabric: 'fs:789038', breath: 'fs:163383',
};
const midi = (m) => 440 * 2 ** ((m - 69) / 12);
// 宮 pentatonic on E, E4 .. E7:  0 E4  1 F#4  2 G#4  3 B4  4 C#5  5 E5  6 F#5  7 G#5  8 B5  9 C#6  10 E6  11 F#6  12 G#6  13 B6  14 C#7  15 E7
const PENTA = [64, 66, 68, 71, 73, 76, 78, 80, 83, 85, 88, 90, 92, 95, 97, 100].map(midi);
const E2 = midi(40), B2 = midi(47), E3 = midi(52), B3 = midi(59), E4 = midi(64);
const TW = -4;                                    // the twin: semitones (§1.12 降 3-5 個半音)
// the code plays the stage cues at these rates: render them that much lower so they land on B4 / E5 / B5
const STAGE_RATE = [1, 1.12, 1.26];

// ------------------------------------------------------------------------------------------------ small helpers
const at = (buf, t = 0, gain = 0, pan) => (pan === undefined ? { buf, at: t, gain } : { buf, at: t, gain, pan });
const nrm = (b, db = -1) => L.normalizePeak(b, db);
let USED = new Set();                             // sources loaded since the last add() (per-sound credits)
/** A smooth random wobble in [-1, 1] (three detuned sines), seeded. */
function wobble(seed, hz = [3.7, 7.3, 12.9]) {
  const r = L.rng(L.hashSeed(seed)), ph = hz.map(() => r.next() * 6.283), w = hz.map((_, i) => 1 / (i + 1));
  const sum = w.reduce((a, b) => a + b, 0);
  return (t) => hz.reduce((a, f, i) => a + Math.sin(6.283 * f * t + ph[i]) * w[i], 0) / sum;
}
/** Peaks shaved by the soft clipper until the peak-to-loudness ratio lets the loudness stage reach `lufs` without the
 *  limiter (the premium_bifang recipe: on dense, bass-heavy material the limiter's release costs 2-3 LU). */
function dense(b, lufs, extra = -0.2) {
  const want = (-1.4 - lufs) + extra, plr = (x) => L.truePeakDb(x) - L.lufs(x);
  let o = K.clipToPLR(b, want, { min: 0, max: 16, threshold: -6 }), got = plr(o);
  if (got > want + 0.3) {
    const c = L.compress(L.pad(L.normalizePeak(b, -1), 0.004, 0), { threshold: -20, ratio: 3, attack: 0.001, release: 0.05, knee: 6, lookahead: 0.003 });
    const o2 = K.clipToPLR(L.slice(c, 0.004), want, { min: 0, max: 16, threshold: -6 }), g2 = plr(o2);
    if (g2 < got) { o = o2; got = g2; }
  }
  if (got > want + 0.5) ctx.log(`    (clipper reached PLR ${got.toFixed(1)} of ${want.toFixed(1)})`);
  return o;
}
// band-share targets (weapons.mjs balance() bands): weighty but present
const BAL = {
  big: { sub: -13, low: -7, lowMid: -5, mid: -4.5, high: -9, air: -14 },
  hit: { sub: -15, low: -8, lowMid: -5, mid: -4.5, high: -8, air: -13 },
  bow: { sub: -16, low: -8, lowMid: -5.5, mid: -4.5, high: -7.5, air: -12 },
};
const tone = (b, t, amount = 0.7) => K.balance(b, BAL[t] || t, amount);
/** Load a source slice (mono unless ch = 2), high-passed, peak-normalised. */
async function src(id, start, end, { ch = 1, hp = 60, lp, semis = 0, rate } = {}) {
  USED.add(id);
  let b = await ctx.load(id, { start, end, ...(ch === 1 ? { channels: 1 } : {}) });
  if (ch === 2 && b.channels === 1) b = L.toStereo(b);
  if (semis) b = L.varispeedSemis(b, semis);
  if (rate) b = L.varispeed(b, rate);
  b = L.eq(b, [{ type: 'hp', f: hp, order: 2 }, ...(lp ? [{ type: 'lp', f: lp, order: 2 }] : [])]);
  return nrm(L.fadeOut(L.fadeIn(b, 0.002), Math.min(0.05, b.duration * 0.2), 'exp'));
}
/** weapons.mjs grab() (cut around the loudest hit / first onset), credited. */
const grab = (id, a, z, o) => { USED.add(id); return K.grab(id, a, z, o); };

// an open stone plaza under the sky: wide, bright, a long low tail (the suns and the bells hang in it)
const PLAZA = {
  length: 3.2, predelay: 0.025,
  echoes: { count: 10, t: [0.05, 0.55], gain: [0.15, 0.42], lp: [8000, 2800], spread: [0.004, 0.03], pan: 1 },
  tail: { rt60: 2.3, rtLow: 2.6, rtHigh: 1.2, gain: 0.55, start: 0.05, build: 0.15, lp: 7000, hp: 100 },
};
/** Dry + plaza (+ an octave-up "shimmer" of the send: the sun's halo). */
function space(b, { wet = 0.3, seed = 'sp', shimmer = -18, env = PLAZA, ch = 1, length } = {}) {
  const ir = L.makeIR(env, { seed, channels: ch, length });
  const out = L.convolve(b, ir, { wet, dry: 1 });
  if (shimmer == null) return out;
  const up = L.varispeed(L.toMono(b), 2);
  const sh = L.convolve(L.eq(up, [{ type: 'hp', f: 1500, order: 2 }]), L.makeIR(env, { seed: seed + 'h', channels: ch, length }), { wetOnly: true });
  return L.mix([at(out), at(sh, 0.02, shimmer + 20 * Math.log10(L.peak(out) / Math.max(1e-9, L.peak(sh))))], { channels: ch });
}

// ------------------------------------------------------------------------------------------------ seamless loops
// An equal-power crossfade only suits uncorrelated material: a tone crossfaded onto a phase-shifted copy of itself dips
// (or swells +3 dB in phase) and smears once per period. So a loop of period P is built in two parts: `noisy` (rendered
// P + X) is crossfaded onto its own head; `tonal` (every component periodic in P: frequencies on the 1/P grid, LFOs
// with whole cycles in P) is rendered W + P and cut [W, W + P] after its filters have settled -- seamless by itself.
const onGrid = (f, P) => Math.round(f * P) / P;
function seamless(P, X, noisy, tonal, W = 0.5) {
  const a = L.loopCrossfade(L.fitLength(noisy, P + X), X);
  return tonal ? L.mix([at(a), at(L.slice(tonal, W, W + P))], { length: P }) : a;
}
/** A periodic tone (sine + `oct` dB of octave) with vibrato, every rate snapped to the 1/P grid. */
function ptone(dur, f, P, { vib = 0, vibHz = 5, oct = -40, seed = 'pt', type = 'sine' } = {}) {
  const F = onGrid(f, P), h = Math.max(1, Math.round(vibHz * P)) / P, ph = L.rng(L.hashSeed(seed)).next() * 6.283;
  const fq = (t) => F * (1 + vib * Math.sin(6.283 * h * t + ph));
  return L.mix([at(L.tone(dur, { type, freq: fq })), at(L.tone(dur, { type: 'sine', freq: (t) => 2 * fq(t) }), 0, oct)]);
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

// ------------------------------------------------------------------------------------------------ instruments
// partial sets [ratio, amp, t60 scale]
const BELL = {
  // bronze bell: hum, prime, tierce, quint, nominal ... warm and long
  bronze: [[0.5, 0.22, 1.6], [1, 1, 1], [1.2, 0.4, 0.7], [1.5, 0.26, 0.55], [2, 0.6, 0.5], [2.52, 0.2, 0.3], [3.01, 0.15, 0.22], [4.1, 0.08, 0.14], [5.3, 0.05, 0.09]],
  // 磬 / bronze bowl: a strong fundamental, the bowl's widely spaced modes, long and slowly beating
  bowl: [[1, 1, 1], [2.71, 0.5, 0.62], [5.15, 0.28, 0.38], [8.21, 0.12, 0.22], [11.9, 0.05, 0.12]],
  // jade chime stone: pure, sparse inharmonic overtones that die fast
  jade: [[1, 1, 1], [2.76, 0.32, 0.38], [5.4, 0.15, 0.16], [8.93, 0.06, 0.08]],
  // small gold bell: dense, short, bright
  tiny: [[1, 1, 1], [1.59, 0.65, 0.7], [2.14, 0.5, 0.5], [2.65, 0.35, 0.35], [3.17, 0.25, 0.25], [4.3, 0.12, 0.15]],
};
/** A struck bell: partials + a slow-beating twin of each (the warble of a real cast bell) + a filtered strike tick. */
function bell(f, { kind = 'bronze', t60 = 1.2, dur, seed = 'bell', beat = 0.0018, strike = -16, tilt = 0 } = {}) {
  const list = [];
  for (const [r, a, k] of BELL[kind]) {
    if (f * r > 18500) continue;
    const amp = a * 10 ** ((tilt * Math.log2(r)) / 20);
    list.push([r, amp, t60 * k]);
    if (beat && r >= 1) list.push([r * (1 + beat), amp * 0.5, t60 * k * 0.85]);
  }
  dur = dur ?? Math.min(6, t60 * 1.4 + 0.05);
  const p = L.partials(dur, { base: f, list, seed });
  const s = L.noiseBurst({ dur: 0.014, decay: 0.004, hp: Math.min(8000, f * 1.2), lp: 15000, seed: seed + 's' });
  return L.mix([at(nrm(p)), at(nrm(s), 0, strike)]);
}
/**
 * A plucked string (Karplus-Strong, fractional delay): `pick` = the plucking point (a comb on the excitation: near the
 * nock -> thin and bright), `glide` = the tension-release pitch drop of a bowstring snapping home (+glide -> 0 in 60 ms),
 * `body` = horn-and-bamboo limb resonances.
 */
function string(f, dur, { t60 = 1.2, bright = 0.7, pick = 0.13, seed = 'str', glide = 0, lp = 9000, body = true } = {}) {
  const n = Math.round(dur * SR), y = new Float32Array(n), r = L.rng(L.hashSeed(seed));
  const D = SR / f - 0.5, damp = Math.exp(-6.9078 / (t60 * f)), exc = Math.round(D);
  const ex = new Float32Array(exc);
  let lpx = 0;
  for (let i = 0; i < exc; i++) { lpx = bright * (r.next() * 2 - 1) + (1 - bright) * lpx; ex[i] = lpx; }
  const pk = Math.max(1, Math.round(exc * pick));
  for (let i = 0; i < n; i++) {
    const x = i < exc ? ex[i] - (i >= pk ? ex[i - pk] : 0) : 0;
    const di = i - D;
    let fb = 0;
    if (di >= 1) { const k = Math.floor(di), fr = di - k; fb = damp * 0.5 * ((y[k] * (1 - fr) + y[k + 1] * fr) + (y[k - 1] * (1 - fr) + y[k] * fr)); }
    y[i] = x + fb;
  }
  let b = new L.Buf([y], SR);
  if (glide) b = L.fitLength(L.varispeedCurve(b, [[0, 1 + glide], [0.06, 1], [dur + 1, 1]]), dur);
  b = L.eq(b, [{ type: 'hp', f: f * 0.55, order: 2 }, ...(body ? [{ type: 'peak', f: 240, gain: 2.5, q: 1 }, { type: 'peak', f: 2700, gain: 3, q: 1.1 }] : []), { type: 'lp', f: lp, order: 2 }]);
  return nrm(L.fadeOut(b, Math.min(0.15, dur * 0.3), 'exp'));
}
/** Flame roar / "呼": a swept band of pink noise with a flicker and a little crackle. */
function roar(dur, { f0 = 400, f1 = 1000, f2, q = 0.9, flicker = 0.4, crack = -18, seed = 'roar', env } = {}) {
  const fr = f2 ? (t) => (t < dur / 2 ? f0 * (f1 / f0) ** (t / (dur / 2)) : f1 * (f2 / f1) ** ((t - dur / 2) / (dur / 2))) : (t) => f0 * (f1 / f0) ** (t / dur);
  let b = L.sweep(L.noise(dur, { color: 'pink', seed }), 'bp', fr, { q });
  const j = wobble(seed + 'f', [7, 13, 21]);
  b = L.automate(b, (t) => Math.max(0, 1 + flicker * j(t)));
  b = L.mix([at(nrm(b)), at(nrm(L.crackle(dur, { density: 70, decay: 0.003, hp: 2200, seed: seed + 'c' })), 0, crack)]);
  const E = env ? L.toFn(env) : L.toFn([[0, 0], [dur * 0.3, 1], [dur, 0]]);
  return L.automate(b, (t) => Math.max(0, E(t)) ** 1.5);
}
/** The sun's scream: a vibrato whistle (sine + octave) riding a narrow band of noise on the same pitch. */
function whistle(dur, fq, { vib = 0.012, vibHz = 7, air = -8, seed = 'wh', env } = {}) {
  const F = L.toFn(fq), w = wobble(seed, [vibHz, vibHz * 1.31]);
  const f = (t) => F(t) * (1 + vib * w(t));
  const s = L.mix([at(L.tone(dur, { type: 'sine', freq: f })), at(L.tone(dur, { type: 'sine', freq: (t) => 2 * f(t) }), 0, -12)]);
  const nz = L.sweep(L.noise(dur, { color: 'pink', seed: seed + 'n' }), 'bp', F, { q: 5 });
  const b = L.mix([at(nrm(s)), at(nrm(nz), 0, air)]);
  const E = L.toFn(env || [[0, 0], [0.02, 1], [dur * 0.6, 0.7], [dur, 0]]);
  return L.automate(b, (t) => Math.max(0, E(t)));
}
/** The stuck shaft's thrum ("thrrum" of an arrow quivering in a wall): a buzzy low tone, pulsed at the flex rate. */
function thrum(dur = 0.5, { f = 150, rate = 24, seed = 'qv' } = {}) {
  const r = L.rng(L.hashSeed(seed)), ff = f * (1 + r.range(-0.06, 0.06)), rr = rate * (1 + r.range(-0.1, 0.1));
  let b = L.tone(dur, { type: 'saw', freq: (t) => ff * (1 - 0.06 * t) });
  b = L.eq(b, [{ type: 'hp', f: 90, order: 2 }, { type: 'peak', f: 420, gain: 5, q: 1.5 }, { type: 'lp', f: 1500, order: 2 }]);
  return nrm(L.automate(b, (t) => Math.exp(-t * 7) * (0.3 + 0.7 * Math.abs(Math.sin(Math.PI * rr * t)))));
}
/** A 嗩吶-like double reed (original synthesis): pulse + saw on a pitch contour, nasal formants, breath, tube grit. */
function reed(dur, pts, { seed = 'rd', vib = 0.016, vibHz = 5.8, env } = {}) {
  const P = L.toFn(pts), w = wobble(seed, [vibHz, vibHz * 1.05]), j = wobble(seed + 'j', [11, 17]);
  const fq = (t) => P(t) * (1 + vib * Math.min(1, t / 0.3) * w(t) + 0.003 * j(t));
  const v = L.mix([at(L.tone(dur, { type: 'pulse', pulseWidth: 0.32, freq: fq })), at(L.tone(dur, { type: 'saw', freq: fq }), 0, -4)]);
  let b = L.eq(v, [{ type: 'hp', f: 320, order: 2 }, { type: 'peak', f: 1250, gain: 9, q: 1.4 }, { type: 'peak', f: 2600, gain: 7, q: 2 }, { type: 'peak', f: 3700, gain: 5, q: 2.5 }, { type: 'lp', f: 7500, order: 2 }]);
  const br = L.eq(L.noise(dur, { color: 'pink', seed: seed + 'b' }), [{ type: 'bp', f: 2600, q: 1 }]);
  b = L.saturate(L.mix([at(nrm(b)), at(nrm(br), 0, -24)]), { drive: 6, type: 'tube', mix: 0.5 });
  const E = L.toFn(env || [[0, 0], [0.04, 1], [dur * 0.8, 0.9], [dur, 0]]);
  return L.automate(b, (t) => Math.max(0, E(t)));
}
/** §1.12 "貴氣瞬態": 30 ms of 6-10 kHz (a filtered tick + two short high partials). */
function lux(seed, f = 7600) {
  return L.mix([at(nrm(L.noiseBurst({ dur: 0.03, decay: 0.01, bp: 8000, q: 1.3, seed }))),
    at(nrm(L.partials(0.035, { base: f, list: [[1, 1, 0.02], [1.29, 0.6, 0.015]], seed: seed + 'p' })), 0, -4)]);
}
/** A flare: a reversed bell bloom swelling into t = dur (the sun catching), for layering before an accent. */
function swell(f, dur, { seed = 'sw', kind = 'bronze' } = {}) {
  const b = bell(f, { kind, t60: 1.2, seed });
  const w = L.convolve(b, L.makeIR(PLAZA, { seed: seed + 'r', channels: 1, length: 1.4 }), { wet: 1, dry: 0.3 });
  return L.fadeIn(L.reverse(L.slice(w, 0, dur)), dur * 0.5, 'sine');
}
/** Creak bursts from the ship's timbers (fs:31574: one every ~2.5 s between 20 and 50 s), cut above the sea rumble. */
const CREAKS = [21.65, 23.95, 27.15, 29.45, 36.45, 41.45, 46.0];
async function creakAt(k, { semis = -3, len = 0.55, hp = 450 } = {}) {
  const t = CREAKS[k % CREAKS.length];
  return src(S.creak, t, t + len, { hp, semis, lp: 9000 });
}
/** Stick-slip creak (synthesized): a pulse train at the slip rate through two resonances -- the "吱" of a string and
 *  limbs under load. The code moves its playback rate with the draw, so it climbs as the bow bends. */
function stickSlip(dur, { rate = 46, res = [1350, 2650], seed = 'ss' } = {}) {
  const w = wobble(seed, [0.9, 2.3, 5.1]), j = L.rng(L.hashSeed(seed + 'j'));
  const n = Math.round(dur * SR), o = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += rate * (1 + 0.18 * w(t)) / SR;
    if (ph >= 1) { ph -= 1; o[i] = 0.6 + 0.4 * j.next(); }
  }
  const b = new L.Buf([o], SR);
  return nrm(L.mix([at(L.eq(b, [{ type: 'bp', f: res[0], q: 9 }])), at(L.eq(b, [{ type: 'bp', f: res[1], q: 7 }]), 0, -5)]));
}

// ------------------------------------------------------------------------------------------------ the bow loosing
/**
 * The bow loosing (heavy 0 = 點射 / 引, 1 = 滿 / 貫日 / 分曦): the string's 錚 (E3 light, B2 heavy + its octave, a 6 %
 * tension-release glide), the bracer slap, the limbs knocking home (thump + a pitched-down wood knock), the arrow leaving
 * (a recorded swoosh sped up / the subsonic whiz), for the heavy shot the fire 呼 and a sub, and the theme layer ~12 dB
 * down: a bronze 錚 ring (E6) + a string harmonic + the 30 ms luxury tick.
 */
async function loose(k, heavy, { seed = 'ls', len } = {}) {
  const r = ctx.rng(`${seed}${k}${heavy}`), sd = `${seed}${k}${heavy}`, j = 1 + r.range(-0.012, 0.012);
  len = len ?? (heavy ? 0.75 : 0.5);
  const f0 = (heavy ? B2 : E3) * j;
  const str = string(f0, len, { t60: heavy ? 0.6 : 0.42, bright: 0.88, pick: 0.11, glide: 0.06, seed: sd + 's' });
  const oct = string(f0 * 2.004, len, { t60: 0.32, bright: 0.92, pick: 0.21, glide: 0.05, seed: sd + 'o' });
  const slap = await src(S.slap, 0.0, 0.2, { hp: 450, semis: heavy ? -2 : 0 });
  const knock = await grab(S.woodH(k % 5), 0, 0.31, { mode: 'peak', post: 0.12, semis: heavy ? -7 : -4, hp: 90 });
  const limbs = L.thump({ f0: heavy ? 190 : 230, f1: heavy ? 62 : 85, sweep: 0.012, decay: heavy ? 0.12 : 0.07, click: 0, drive: 3, seed: sd + 't' });
  const flick = L.eq(L.noiseBurst({ dur: 0.02, decay: 0.006, bp: 1900, q: 0.8, seed: sd + 'k' }), [{ type: 'hp', f: 600, order: 2 }]);
  // the arrow leaving: the swoosh's rise (0.23-0.6 s) sped x1.7 -> a 0.2 s "fft"; heavy: the whiz's fly-by
  const sw = L.varispeed(await src(S.swoosh, 0.3 + (k % 3) * 0.02, 0.62, { hp: 700 }), 1.7 + r.range(-0.1, 0.1));
  const layers = [at(str, 0, 0), at(oct, 0, -7), at(slap, 0.001, -7), at(nrm(limbs), 0.002, heavy ? -2 : -4), at(knock, 0.003, heavy ? -8 : -10),
    at(nrm(flick), 0, -10), at(sw, 0.004, heavy ? -9 : -7)];
  if (heavy) {
    const wz = await src(S.whiz, 0.05, 0.45, { hp: 300, semis: -2 });
    layers.push(at(wz, 0.0, -9));
    const fire = L.fadeOut(await src(S.combust, 0.0, 0.5, { hp: 250, lp: 8000 }), 0.25, 'exp');
    layers.push(at(string(E3 * j, len, { t60: 0.45, bright: 0.85, pick: 0.14, glide: 0.05, seed: sd + 'e' }), 0.001, -5));
    layers.push(at(fire, 0.008, -10), at(nrm(roar(0.45, { f0: 600, f1: 1600, f2: 700, q: 1, flicker: 0.3, crack: -16, seed: sd + 'r', env: [[0, 0], [0.025, 1], [0.15, 0.55], [0.45, 0]] })), 0.006, -12));
    layers.push(at(nrm(L.thump({ f0: 95, f1: 46, sweep: 0.03, decay: 0.2, click: 0, drive: 1.5, seed: sd + 'sub' })), 0.002, -6));
  }
  // theme: the bronze 錚 (E6) + a harmonic of the string a fifth up, the luxury tick
  const ring = L.mix([at(bell(PENTA[10] * j, { kind: 'bronze', t60: heavy ? 0.7 : 0.45, seed: sd + 'b', strike: -12, tilt: -1 })),
    at(string(PENTA[8] * j, len, { t60: 0.6, bright: 0.4, pick: 0.5, seed: sd + 'h', body: false }), 0.002, -6)]);
  layers.push(at(nrm(ring), 0.002, heavy ? -12 : -13), at(nrm(lux(sd + 'x', 7400 + (k % 3) * 400)), 0.001, -14));
  let m = L.mix(layers, { length: len });
  const pre = 0.004;
  const crushed = L.slice(L.compress(L.pad(nrm(m, 0), pre, 0), { threshold: -26, ratio: 5, attack: 0.0008, release: 0.02, knee: 6, makeup: 14, lookahead: 0.002 }), pre);
  m = L.mix([{ buf: nrm(m, 0), gainLin: 0.75 }, { buf: crushed, gainLin: 0.45 }]);
  m = L.psychoBass(m, { freq: 110, amount: heavy ? -7 : -10 });
  m = L.saturate(m, { drive: 3, type: 'tube', mix: 0.25 });
  m = L.automate(m, (t) => (t < len * 0.35 ? 1 : Math.pow(1 - (t - len * 0.35) / (len * 0.65), 1.8)));
  return L.pad(tone(m, 'bow', 0.6), 0.003, 0);
}

async function bowSet(add, SP, D2) {
  const rel = [], relH = [];
  for (let k = 0; k < 4; k++) rel.push(dense(await loose(k, 0), -14));
  await add('sunbow_release', rel, SP([10, 70], { lufs: -14, voices: 4, pitch: [0.97, 1.03], priority: 3, note: 'local 點射 / 引 (vol 0.7-0.8) and remote 懸日 casts' }));
  for (let k = 0; k < 4; k++) {
    const m = await loose(k + 4, 1);
    relH.push(dense(L.stereoize(m, { width: 0.32, hp: 400, seed: `rh${k}` }), -13));
  }
  await add('sunbow_release_heavy', relH, D2({ lufs: -13, channels: 2, voices: 3, pitch: [0.97, 1.03], priority: 3, note: '滿 / 貫日 / 分曦 / the ult loose (vol 0.9-1)' }));

  // 貫日 whiz: the sun arrow screams off (whistle falling 2.9 -> 1.5 kHz as it leaves, the recorded subsonic fly-by),
  // the jet of fire it drags (a roar band falling and fading), the low 轟 (60 -> 38 Hz with tube harmonics), heat air
  const wzRec = await src(S.whiz, 0.0, 0.9, { hp: 200, semis: -3 });
  const whiz = [];
  for (let k = 0; k < 3; k++) {
    const r = ctx.rng(`wz${k}`), D = 1.15, f = 1 + r.range(-0.04, 0.04);
    const scream = whistle(D, (t) => (2900 - 1400 * Math.min(1, t / 0.9) ** 0.7) * f, { vib: 0.02, vibHz: 9, air: -4, seed: `wzs${k}`, env: [[0, 0], [0.012, 1], [0.25, 0.55], [D, 0]] });
    const jet = roar(D, { f0: 2400 * f, f1: 450, q: 0.8, flicker: 0.45, crack: -12, seed: `wzj${k}`, env: [[0, 0], [0.01, 1], [0.35, 0.45], [D, 0]] });
    const boom = L.saturate(L.thump({ f0: 66, f1: 38, sweep: 0.05, decay: 0.45, dur: 0.7, click: 0, drive: 1.5, seed: `wzb${k}` }), { drive: 4, type: 'tube', mix: 0.45 });
    const air = L.applyEnv(L.eq(L.noise(0.6, { color: 'pink', seed: `wza${k}` }), [{ type: 'lp', f: 900, order: 2 }, { type: 'hp', f: 70, order: 2 }]), L.envCurve(0.6, [[0, 0], [0.015, 1], [0.12, 0.4], [0.6, 0]]));
    let m = L.mix([at(nrm(scream), 0.01, -6, -0.1), at(L.toStereo(nrm(jet)), 0, -4), at(L.toStereo(nrm(boom)), 0, -5), at(L.toStereo(nrm(air)), 0, -9),
      at(L.toStereo(wzRec), 0.0, -6)], { channels: 2, length: D });
    m = tone(L.psychoBass(m, { freq: 100, amount: -5 }), 'big', 0.5);
    m = L.reverb(m, 'urban', { wet: 0.16, seed: `wzr${k}`, length: 1.2 });
    whiz.push(dense(L.fadeOut(L.slice(L.stereoize(m, { width: 0.4, hp: 500, seed: `wzst${k}` }), 0, D), 0.4, 'exp'), -15));
  }
  await add('sunbow_whiz', whiz, D2({ lufs: -15, channels: 2, voices: 2, pitch: [0.98, 1.02], priority: 3, note: '貫日 only, with release_heavy (vol 0.8)' }));

  // 分曦: five arrows fanning out -- five short whistles leaving 15 ms apart at spread pitches (centre highest), a quick
  // gold fan of five tiny bells upward, a light air whoosh (mono: teammates hear it positioned)
  const split = [];
  for (let k = 0; k < 2; k++) {
    const r = ctx.rng(`sp${k}`), arrows = [];
    for (let i = 0; i < 5; i++) {
      const f = [1900, 2500, 3400, 2750, 2150][i] * (1 + r.range(-0.03, 0.03)), D = 0.42;
      const w = whistle(D, (t) => f * (1 - 0.35 * Math.min(1, t / D)), { vib: 0.015, vibHz: 11, air: -2, seed: `spw${k}${i}`, env: [[0, 0], [0.008, 1], [0.12, 0.4], [D, 0]] });
      arrows.push(at(nrm(w), i * 0.026 + r.range(0, 0.006), -3 - Math.abs(i - 2) * 1.5));
      arrows.push(at(nrm(L.whoosh({ dur: 0.18, f0: 5000, f1: 1600, q: 1.6, seed: `spa${k}${i}` })), i * 0.026, -8));
    }
    const fan = L.mix([0, 1, 2, 3, 4].map((i) => at(bell(PENTA[10 + i], { kind: 'tiny', t60: 0.3, seed: `spb${k}${i}`, strike: -12 }), 0.02 + i * 0.022, -6 - i)));
    let m = L.mix([...arrows, at(nrm(fan), 0, -10)], { length: 0.6 });
    m = L.reverb(m, 'urban', { wet: 0.12, seed: `spr${k}`, length: 0.6, channels: 1 });
    split.push(dense(L.fadeOut(L.slice(m, 0, 0.6), 0.2, 'exp'), -16));
  }
  await add('sunbow_split', split, SP([8, 60], { lufs: -16, voices: 2, pitch: [0.98, 1.02] }));

  // the def.sound contract. sunbow_close: what teammates hear when a bow is loosed (remote.js plays <sound>_close at the
  // shooter, _far past 40 m): a full loose, mono. _tail: street reflections only (the bow's own trigger never plays it
  // locally; kept for the contract). _far: the twang and the whoosh across the street, mono.
  const closes = [], tails = [], fars = [];
  for (let k = 0; k < 4; k++) closes.push(dense(await loose(k + 8, 1, { seed: 'cl', len: 0.6 }), -14));
  for (let k = 0; k < 2; k++) {
    const head = L.toMono(await loose(k + 12, 1, { seed: 'tl', len: 0.45 }));
    tails.push(K.trimEnd(L.fadeOut(L.gunTail(head, { env: 'urban', length: 1.4, head: 0.1, seed: `tl${k}`, darken: 30, hp: 120 }), 0.5, 'exp')));
    const far = L.farLayer(L.slice(head, 0, 0.3), { distance: 110, env: 'urban', seed: `fr${k}`, length: 1.4 });
    fars.push(L.pad(K.trimEnd(L.fadeOut(far, 0.5, 'exp')), 0.005, 0));
  }
  {
    const head = L.toMono(await loose(14, 0, { seed: 'fl', len: 0.4 }));
    fars.push(L.pad(K.trimEnd(L.fadeOut(L.farLayer(L.slice(head, 0, 0.3), { distance: 90, env: 'urban', seed: 'fr2', length: 1.3 }), 0.5, 'exp')), 0.005, 0));
  }
  await add('sunbow_close', closes, SP([12, 70], { lufs: -14, voices: 4, pitch: [0.97, 1.03], priority: 2 }));
  await add('sunbow_tail', tails, D2({ target: 'gunTail', channels: 2, voices: 2, pitch: [0.98, 1.02] }));
  await add('sunbow_far', fars, SP([40, 320], { target: 'gunFar', voices: 3, pitch: [0.95, 1.04] }));
}

// ------------------------------------------------------------------------------------------------ the draw
async function drawSet(add, SP, D2) {
  // 拉弦 loop (the code: loop, setRate 0.85 -> 1.2 over the draw): the 吱 of the string and limbs under load (stick-slip
  // through two resonances, slowly varying), timber creaks from the ship recording (horn and bamboo bending), the white
  // silk forming into a shaft (a faint sizzle), a low strain under it all. 3.4 s rendered, crossfaded to a 3.0 s loop.
  {
    const P = 3.0, X = 0.4, D = P + X, W = 0.5;
    const slip = L.automate(stickSlip(D, { rate: 44, res: [1300, 2600], seed: 'ck' }), (t) => 0.55 + 0.45 * Math.max(0, Math.sin(6.283 * t / 1.5 + 0.4)) ** 2);
    const slip2 = stickSlip(D, { rate: 71, res: [950, 3300], seed: 'ck2' });
    const parts = [at(slip, 0, -4), at(slip2, 0, -15)];
    for (const [i, t, g] of [[0, 0.15, -2], [2, 1.2, -5], [4, 2.15, -3], [5, 2.9, -7]]) parts.push(at(L.fadeOut(await creakAt(i, { semis: -4, len: 0.5 }), 0.15, 'exp'), t, g));
    const siz = L.fadeIn(await src(S.sizzle, 30, 30 + D, { hp: 3500 }), 0.1);
    // the low strain: two saws (92 Hz with a slow 2/3 Hz waver, a fifth up), periodic in P
    const strain = L.eq(L.mix([at(ptone(W + P, 92, P, { type: 'saw', vib: 0.01, vibHz: 0.7, seed: 'cks' })), at(ptone(W + P, 138.5, P, { type: 'saw' }), 0, -6)]),
      [{ type: 'lp', f: 700, order: 2 }, { type: 'hp', f: 70, order: 2 }, { type: 'lp', f: 500, order: 2 }, { type: 'hp', f: 80, order: 2 }]);
    const noisy = L.eq(L.mix([...parts, at(siz, 0, -22)], { length: D }), [{ type: 'hp', f: 80, order: 2 }]);
    const m = seamless(P, X, noisy, L.gain(nrm(L.slice(strain, W)), -28), 0);
    seamCheck('sunbow_creak', m);
    await add('sunbow_creak', m, D2({ lufs: -21, loop: true, channels: 1, voices: 1, pitch: [1, 1] }));
  }

  // the three stages (the code plays them at pitch 1 / 1.12 / 1.26 and vol 0.67 / 0.79 / 0.91): 引 a low bronze bell and
  // a ring of air, 滿 a mid bell + the flame 呼, 貫日 a high bell, the lock thud, a run of tiny bells up and a flare
  const tgt = [PENTA[3], PENTA[5], PENTA[8]];                 // B4 E5 B5 as heard
  const stages = [[], [], []];
  for (let k = 0; k < 2; k++) {
    for (let s = 0; s < 3; s++) {
      const f = tgt[s] / STAGE_RATE[s], sd = `st${s}${k}`, len = [1.1, 1.3, 1.7][s];
      const b1 = bell(f, { kind: 'bronze', t60: [0.9, 1.0, 1.3][s], seed: sd + 'b', strike: -12, tilt: -1 });
      const b2 = bell(f * 2.003, { kind: 'jade', t60: 0.5, seed: sd + 'j', strike: -18 });
      const ring = L.whoosh({ dur: 0.22, f0: 900 / STAGE_RATE[s], f1: 4200 / STAGE_RATE[s], q: 2.2, seed: sd + 'w' });
      const tick = L.thump({ f0: 320, f1: 150, sweep: 0.008, decay: 0.035, click: 0.3, drive: 2, seed: sd + 't' });
      const parts = [at(b1, 0, 0, -0.1), at(b2, 0.004, -9, 0.15), at(L.toStereo(nrm(ring)), 0, -14), at(L.toStereo(nrm(tick)), 0, -14)];
      if (s >= 1) parts.push(at(L.toStereo(nrm(roar(0.42, { f0: 480, f1: 1300, f2: 650, q: 1, flicker: 0.35, crack: -18, seed: sd + 'r', env: [[0, 0], [0.04, 1], [0.15, 0.6], [0.42, 0]] }))), 0.01, s === 1 ? -7 : -9));
      if (s === 2) {
        parts.push(at(L.toStereo(nrm(L.thump({ f0: 110, f1: 46, sweep: 0.025, decay: 0.22, click: 0, drive: 2, seed: sd + 'th' }))), 0, -5));
        for (let i = 0; i < 4; i++) parts.push(at(bell(PENTA[11 + i] / STAGE_RATE[s], { kind: 'tiny', t60: 0.35, seed: sd + 'tb' + i, strike: -14 }), 0.03 + i * 0.03, -11 - i, (i - 1.5) * 0.3));
        parts.push(at(L.toStereo(nrm(lux(sd + 'x', 7800))), 0, -14));
      }
      let m = L.mix(parts, { channels: 2, length: len });
      m = L.reverb(m, 'smallRoom', { wet: 0.16, seed: sd + 'rv', length: 0.8 });
      stages[s].push(L.fadeOut(L.slice(m, 0, len), 0.4, 'exp'));
    }
  }
  for (let s = 0; s < 3; s++) await add(`sunbow_stage${s + 1}`, stages[s], D2({ lufs: [-19, -18, -17][s], channels: 2, voices: 2, pitch: [1, 1], note: `rendered x1/${STAGE_RATE[s]}: the code plays it at pitch ${STAGE_RATE[s]}` }));

  // 貫日 held (loop, vol 0.5): the white-hot head -- a flame roar band that breathes, a sun "scream" (B6 / E7 whistles
  // with slow vibrato, far down), crackle and sizzle. A 3.0 s loop: the noise crossfaded, the tones periodic in it.
  {
    const P = 3.0, X = 0.4, D = P + X;
    // the flame band breathes (its centre swings 700 -> 950 -> 700 Hz once per loop instead of sweeping across it)
    const fj = wobble('fuf', [7, 13, 21]);
    const band = L.automate(L.sweep(L.noise(D, { color: 'pink', seed: 'fu' }), 'bp', (t) => 820 * 1.16 ** Math.sin(6.283 * t / P), { q: 0.8 }), (t) => Math.max(0, 1 + 0.45 * fj(t)));
    const fl = L.mix([at(nrm(band)), at(nrm(L.crackle(D, { density: 70, decay: 0.003, hp: 2200, seed: 'fuk' })), 0, -12)]);
    // the scream: B6 + E7 (the E a few cents sharp: a slow beat) -- the tones periodic in P, their breath of noise crossfaded
    const sc = L.mix([at(nrm(ptone(D, PENTA[13], P, { vib: 0.006, vibHz: 4.3, oct: -12, seed: 'fus1' }))), at(nrm(ptone(D, PENTA[15] * 1.003, P, { vib: 0.005, vibHz: 3.1, oct: -12, seed: 'fus2' })), 0, -6)]);
    const air = L.mix([at(nrm(L.eq(L.noise(D, { color: 'pink', seed: 'fusn1' }), [{ type: 'bp', f: PENTA[13], q: 5 }]))), at(nrm(L.eq(L.noise(D, { color: 'pink', seed: 'fusn2' }), [{ type: 'bp', f: PENTA[15], q: 5 }])), 0, -6)]);
    const cr = L.crackle(D, { density: 45, decay: 0.003, hp: 1800, seed: 'fuc' });
    const siz = await src(S.sizzle, 60, 60 + D, { hp: 2500 });
    const low = L.eq(L.noise(D, { color: 'brown', seed: 'ful' }), [{ type: 'lp', f: 300, order: 2 }, { type: 'hp', f: 60, order: 2 }]);
    const noisy = L.mix([at(nrm(fl), 0, 0), at(nrm(air), 0, -19), at(nrm(cr), 0, -13), at(siz, 0, -16), at(nrm(low), 0, -12)], { length: D });
    const m = seamless(P, X, noisy, L.gain(nrm(sc), -14), 0);
    seamCheck('sunbow_full', m);
    await add('sunbow_full', m, D2({ lufs: -21, loop: true, channels: 1, voices: 1, pitch: [1, 1] }));
  }

  // a new arrow burns onto the string (vol 0.5): a rising "fsss" of white silk catching, a soft flame "pf", the nock
  // seating with a tiny click and a jade tick
  const nock = [];
  for (let k = 0; k < 3; k++) {
    const r = ctx.rng(`nk${k}`);
    const rise = L.whoosh({ dur: 0.3, f0: 1400, f1: 6000, q: 1.4, seed: `nkw${k}` });
    const siz = L.fadeOut(L.fadeIn(await src(S.sizzle, 90 + k * 2, 90.35 + k * 2, { hp: 3000 }), 0.12), 0.08);
    const pf = roar(0.25, { f0: 700, f1: 1800, q: 1.1, flicker: 0.3, crack: -20, seed: `nkr${k}`, env: [[0, 0], [0.12, 1], [0.25, 0]] });
    const click = L.noiseBurst({ dur: 0.012, decay: 0.002, bp: 3400, q: 2.5, seed: `nkc${k}` });
    const tick = bell(PENTA[14 + (k % 2)] * (1 + r.range(-0.005, 0.005)), { kind: 'jade', t60: 0.18, seed: `nkt${k}`, strike: -16 });
    const m = L.mix([at(nrm(rise), 0, -4), at(siz, 0, -8), at(nrm(pf), 0.02, -7), at(nrm(click), 0.26, -6), at(nrm(tick), 0.262, -12)], { length: 0.48 });
    nock.push(L.fadeOut(m, 0.12, 'exp'));
  }
  await add('sunbow_nock', nock, D2({ lufs: -22, channels: 1, voices: 2, pitch: [0.97, 1.03] }));

  // dry (no arrows / 分曦 short): a damped string thup, a muffled limb knock, a flame fizzling out
  const dry = [];
  for (let k = 0; k < 2; k++) {
    const st = string(E3 * (1 + k * 0.02), 0.3, { t60: 0.07, bright: 0.3, pick: 0.2, seed: `dr${k}`, body: false, lp: 2000 });
    const th = L.thump({ f0: 210, f1: 100, sweep: 0.01, decay: 0.05, click: 0, drive: 2, seed: `drt${k}` });
    const fz = L.noiseBurst({ dur: 0.22, attack: 0.01, decay: 0.12, bp: 1500, q: 0.8, color: 'pink', seed: `drf${k}` });
    dry.push(L.pad(L.fadeOut(L.mix([at(st, 0, 0), at(nrm(th), 0, -5), at(nrm(fz), 0.02, -14)], { length: 0.3 }), 0.1, 'exp'), 0.003, 0));
  }
  await add('sunbow_dry', dry, D2({ lufs: -22, channels: 1, voices: 2, pitch: [0.97, 1.03] }));
}

// ------------------------------------------------------------------------------------------------ hits
async function hitSet(add, SP, D2) {
  // into flesh (positional, once per frame of hits): a knife-into-melon stab (the take holds a stab every ~0.22 s), a
  // meaty body thud, the arrow's thock, the burning head flaring on the wound, a jade tick (the weapon's voice)
  const stabs = [0.26, 0.47, 0.69, 0.91, 1.12];
  const meaty = await src(S.meaty, 0.0, 0.32, { hp: 80 });
  const hits = [];
  for (let k = 0; k < 5; k++) {
    const r = ctx.rng(`ht${k}`);
    const stab = await grab(S.stab, stabs[k] - 0.04, stabs[k] + 0.2, { mode: 'peak', pre: 0.004, post: 0.18, hp: 140 });
    const thock = L.thump({ f0: 170, f1: 70, sweep: 0.012, decay: 0.09, click: 0.2, drive: 3, seed: `htt${k}` });
    const fire = L.fadeOut(await src(S.combust, 0.02 + k * 0.03, 0.3 + k * 0.03, { hp: 500 }), 0.15, 'exp');
    const tick = bell(PENTA[13 + (k % 3)], { kind: 'jade', t60: 0.14, seed: `htj${k}`, strike: -12 });
    let m = L.mix([at(stab, 0, 0), at(L.slice(meaty, 0.004 * k, 0.3), 0.002, -6 + r.range(-1, 1)), at(nrm(thock), 0, -5), at(fire, 0.02, -11), at(nrm(tick), 0.003, -18)], { length: 0.45 });
    m = tone(L.psychoBass(m, { freq: 120, amount: -8 }), 'hit');
    hits.push(L.pad(dense(L.fadeOut(m, 0.15, 'exp'), -16), 0.003, 0));
  }
  await add('sunbow_hit', hits, SP([12, 90], { lufs: -16, vol: 1.3, voices: 6, pitch: [0.94, 1.06] }));

  // into a wall (positional): the knife-into-wall thrust (its rumble cut), a wood knock and a rock on wood (the head
  // biting in), the shaft quivering ("thrrum"), a few grains, a flick of fire
  const wall = await grab(S.wall, 0.28, 0.8, { mode: 'peak', pre: 0.004, post: 0.3, hp: 110 });
  const worlds = [];
  for (let k = 0; k < 5; k++) {
    const r = ctx.rng(`hw${k}`);
    const wood = await grab(S.woodH(k), 0, 0.31, { mode: 'peak', post: 0.18, semis: -2 + r.range(-1, 1), hp: 100 });
    const rock = await grab(S.rockWood, 0.0, 0.5, { mode: 'peak', post: 0.15, hp: 200 });
    const grains = await grab(S.sticks, [0.2, 2.0, 3.7, 5.4, 6.95][k], [0.5, 2.3, 4.05, 5.7, 7.25][k], { mode: 'peak', post: 0.2, hp: 400 });
    const fire = L.fadeOut(await src(S.combust, 0.05 + k * 0.04, 0.3 + k * 0.04, { hp: 600 }), 0.12, 'exp');
    let m = L.mix([at(L.varispeedSemis(wall, r.range(-1.5, 1.5)), 0, -1), at(wood, 0.001, -4), at(rock, 0.002, -9), at(thrum(0.5, { f: 140 + k * 9, rate: 22 + k, seed: `hwq${k}` }), 0.012, -10.5),
      at(grains, 0.01, -14), at(fire, 0.015, -14)], { length: 0.6 });
    m = tone(L.psychoBass(m, { freq: 120, amount: -9 }), 'hit');
    worlds.push(L.pad(dense(L.fadeOut(m, 0.18, 'exp'), -17), 0.003, 0));
  }
  await add('sunbow_hit_world', worlds, SP([8, 80], { lufs: -17, vol: 1.2, voices: 6, pitch: [0.94, 1.06] }));

  // ignite (positional, and 2D at 滿): the fire catching -- a combustion burst, a fire whoosh, a roar band and crackle
  const ign = [];
  for (let k = 0; k < 4; k++) {
    const r = ctx.rng(`ig${k}`);
    const comb = await src(S.combust, 0.0 + k * 0.02, 0.6, { hp: 200 });
    const wh = await src(S.fireB, 0.05 + k * 0.1, 0.85 + k * 0.1, { hp: 160 });
    const rr = roar(0.7, { f0: 380, f1: 1500, f2: 700, q: 0.9, flicker: 0.4, crack: -14, seed: `igr${k}`, env: [[0, 0], [0.05, 1], [0.25, 0.55], [0.7, 0]] });
    const cr = L.crackle(0.7, { density: 60, decay: 0.003, hp: 2000, seed: `igc${k}` });
    let m = L.mix([at(comb, 0, -1), at(L.fadeOut(wh, 0.3, 'exp'), 0.01, -4 + r.range(-1, 1)), at(nrm(rr), 0, -5), at(nrm(cr), 0.05, -14)], { length: 0.75 });
    m = tone(m, 'hit', 0.5);
    ign.push(dense(L.fadeOut(m, 0.3, 'exp'), -19));
  }
  await add('sunbow_ignite', ign, SP([6, 60], { lufs: -19, voices: 6, pitch: [0.93, 1.07] }));

  // 貫日 pin (positional): a deep thunk, the wall bite, a deep metal clang (bronze head into bone), a short bronze E5,
  // and the gold shock ring's "zing"
  const clang = await grab(S.clang, 0, 0.6, { mode: 'peak', post: 0.35, hp: 70 });
  const pins = [];
  for (let k = 0; k < 3; k++) {
    const th = L.saturate(L.thump({ f0: 130, f1: 48, sweep: 0.02, decay: 0.2, click: 0.15, drive: 3, seed: `pn${k}` }), { drive: 3, type: 'tube', mix: 0.4 });
    const zing = L.whoosh({ dur: 0.2, f0: 1800, f1: 7500, q: 3, seed: `pnz${k}` });
    const b = bell(PENTA[5] * (1 + k * 0.004), { kind: 'bronze', t60: 0.7, seed: `pnb${k}`, strike: -10 });
    let m = L.mix([at(nrm(th), 0, 0), at(wall, 0.001, -4), at(L.varispeedSemis(clang, -2 + k), 0.002, -9), at(b, 0.004, -10), at(nrm(zing), 0.01, -12)], { length: 0.85 });
    m = tone(L.psychoBass(m, { freq: 110, amount: -6 }), 'hit');
    pins.push(L.pad(dense(L.fadeOut(m, 0.3, 'exp'), -16), 0.003, 0));
  }
  await add('sunbow_pin', pins, SP([14, 110], { lufs: -16, vol: 1.2, voices: 3, pitch: [0.97, 1.03] }));

  // the kill sting (2D, vol 0.7-0.85): the 「日」 bell -- a bronze E6 strike with a jade B6 a breath later, a quick
  // shimmer of three gold bells (E7 G#7 B7), the sun disc's flare "fwoom", a low punch
  const kills = [];
  for (let k = 0; k < 3; k++) {
    const r = ctx.rng(`kl${k}`);
    const b1 = bell(PENTA[10], { kind: 'bronze', t60: 1.0, seed: `klb${k}`, strike: -10, tilt: -1 });
    const b2 = bell(PENTA[13] * (1 + r.range(-0.002, 0.002)), { kind: 'jade', t60: 0.7, seed: `klj${k}`, strike: -14 });
    const sh = L.mix([15, 17, 18].map((n, i) => at(bell(midi([100, 104, 107][i]) * (1 + r.range(-0.004, 0.004)), { kind: 'tiny', t60: 0.2, seed: `kls${k}${i}`, strike: -10 }), 0.03 + i * 0.022, -i * 2)));
    const fl = roar(0.5, { f0: 500, f1: 2400, f2: 900, q: 1, flicker: 0.3, seed: `klf${k}`, env: [[0, 0], [0.05, 1], [0.2, 0.5], [0.5, 0]] });
    const punch = L.thump({ f0: 200, f1: 80, sweep: 0.02, decay: 0.11, drive: 3, seed: `klp${k}` });
    let m = L.mix([at(b1, 0, 0, 0.12), at(b2, 0.035, -5, -0.2), at(nrm(sh), 0, -11, 0.25), at(L.toStereo(nrm(fl)), 0.005, -9), at(L.toStereo(nrm(punch)), 0, -8)], { channels: 2, length: 1.0 });
    m = L.reverb(m, 'smallRoom', { wet: 0.14, seed: `klr${k}`, length: 0.5 });
    kills.push(L.fadeOut(L.slice(m, 0, 1.0), 0.35, 'exp'));
  }
  await add('sunbow_kill', kills, D2({ lufs: -17, channels: 2, voices: 3, pitch: [0.99, 1.01], priority: 3 }));

  // empower (positional at the hanging sun): an arrow through it turns 貫日 -- a high bowstring 錚 (E6, glide), a jade
  // E7, a flare whoosh up, a pop
  const emp = [];
  for (let k = 0; k < 2; k++) {
    const st = string(PENTA[10] * (1 + k * 0.01), 0.7, { t60: 0.5, bright: 0.95, pick: 0.09, glide: 0.08, seed: `em${k}` });
    const j = bell(PENTA[15], { kind: 'jade', t60: 0.6, seed: `emj${k}`, strike: -10 });
    const up = L.whoosh({ dur: 0.3, f0: 1200, f1: 6500, q: 2, seed: `emw${k}` });
    const fl = roar(0.45, { f0: 700, f1: 2600, f2: 1100, q: 1, flicker: 0.3, seed: `emf${k}`, env: [[0, 0], [0.03, 1], [0.15, 0.5], [0.45, 0]] });
    const pop = L.thump({ f0: 300, f1: 120, sweep: 0.01, decay: 0.06, click: 0.2, drive: 3, seed: `emp${k}` });
    const m = L.mix([at(st, 0, 0), at(j, 0.004, -6), at(nrm(up), 0, -8), at(nrm(fl), 0.01, -6), at(nrm(pop), 0, -7)], { length: 0.8 });
    emp.push(L.pad(dense(L.fadeOut(m, 0.25, 'exp'), -16), 0.003, 0));
  }
  await add('sunbow_empower', emp, SP([10, 100], { lufs: -16, vol: 1.2, voices: 3, pitch: [0.98, 1.02] }));
}

// ------------------------------------------------------------------------------------------------ 懸日
async function skillSet(add, SP) {
  // a sun blooms where the arrow struck: the thud, a big fire whoosh, the roar opening up, a reversed bronze swell into
  // a low bronze E4 + jade B5, a sub swell; in the plaza
  const hang = [];
  for (let k = 0; k < 2; k++) {
    const fw = await src(S.fireA, 0.0 + k * 0.1, 1.4 + k * 0.1, { hp: 110 });
    const th = L.thump({ f0: 140, f1: 55, sweep: 0.02, decay: 0.2, click: 0.15, drive: 3, seed: `hg${k}` });
    const wl = await grab(S.wall, 0.28, 0.8, { mode: 'peak', pre: 0.004, post: 0.25, hp: 110 });
    const rr = roar(1.3, { f0: 300, f1: 1500, f2: 800, q: 0.8, flicker: 0.4, crack: -14, seed: `hgr${k}`, env: [[0, 0], [0.08, 1], [0.5, 0.6], [1.3, 0]] });
    const sw = swell(PENTA[8], 0.25, { seed: `hgs${k}`, kind: 'jade' });
    const b = L.mix([at(bell(E4, { kind: 'bronze', t60: 2.0, seed: `hgb${k}`, strike: -12 })), at(bell(PENTA[8], { kind: 'jade', t60: 1.2, seed: `hgj${k}`, strike: -16 }), 0.03, -8)]);
    const sub = L.thump({ f0: 75, f1: 44, sweep: 0.08, decay: 0.6, click: 0, drive: 1, seed: `hgu${k}` });
    let m = L.mix([at(nrm(th), 0.25, -2), at(wl, 0.25, -5), at(sw, 0, -12), at(L.fadeOut(fw, 0.6, 'exp'), 0.25, -2), at(nrm(rr), 0.26, -6), at(nrm(b), 0.26, -7), at(nrm(sub), 0.25, -7)], { length: 1.9 });
    m = tone(L.psychoBass(m, { freq: 110, amount: -6 }), 'big', 0.6);
    m = space(m, { wet: 0.22, seed: `hgsp${k}`, shimmer: -20, length: 1.6 });
    // the reversed swell leads by 0.25 s: cut that lead so the bloom lands on the play call (the swell's tail stays)
    hang.push(dense(L.fadeOut(L.slice(m, 0.2, 2.0), 0.6, 'exp'), -15));
  }
  await add('sunbow_hang', hang, SP([10, 120], { lufs: -15, voices: 2, pitch: [0.98, 1.02], priority: 3 }));

  // the hanging sun (positional loop, 3.5 s): a low flame roar, an E2/B2/E3 hum throbbing at 1.25 Hz (the pull), a
  // high shimmer beating slowly (0.5 Hz), crackle. The tones sit on the 1/4 Hz grid: a 4 s loop with no crossfade dip.
  {
    const P = 4.0, X = 0.4, D = P + X, W = 0.5;
    const rr = roar(D, { f0: 300, f1: 420, f2: 300, q: 0.7, flicker: 0.5, crack: -14, seed: 'hl', env: [[0, 1], [D, 1]] });
    const pt = (f, type = 'sine') => L.tone(W + P, { type, freq: onGrid(f, P) });
    const hum = L.automate(L.mix([at(pt(E2)), at(pt(B2), 0, -5), at(pt(E3, 'triangle'), 0, -9)]), (t) => 0.65 + 0.35 * Math.sin(6.283 * 1.25 * (t - W)));
    const sh = L.mix([at(pt(PENTA[10])), at(L.tone(W + P, { type: 'sine', freq: onGrid(PENTA[10], P) + 0.5 }), 0, -1), at(pt(PENTA[13]), 0, -6)]);
    const cr = L.crackle(D, { density: 50, decay: 0.003, hp: 1800, seed: 'hlc' });
    const fire = await src(S.crackle, 5, 5 + D, { hp: 300 });
    const noisy = L.mix([at(nrm(rr), 0, 0), at(nrm(cr), 0, -15), at(fire, 0, -9)], { length: D });
    // the hum's psycho-bass harmonics (filters) settle during W before the cut
    const tonal = L.mix([at(L.psychoBass(nrm(hum), { freq: 90, amount: -6 }), 0, -6), at(nrm(sh), 0, -22)], { length: W + P });
    const m = seamless(P, X, noisy, tonal, W);
    seamCheck('sunbow_hang_loop', m);
    await add('sunbow_hang_loop', m, SP([6, 45], { lufs: -19, loop: true, voices: 2, pitch: [1, 1] }));
  }

  // the burst (positional; also the ult's exit at pitch 0.7, vol 0.4): a meaty blast + a fire whoosh + sub, then a
  // bronze E4 bell and the gong's long shimmer (爆炸 + 銅鐘尾音), embers
  const gong = await src(S.gong, 0.12, 3.2, { hp: 70 });
  const bursts = [];
  for (let k = 0; k < 2; k++) {
    const bl = await src(k ? S.expl : S.grenade, 0.0, 2.0, { hp: 45 });
    const fw = await src(S.fireB, 0.0, 1.5, { hp: 120 });
    const sub = L.saturate(L.thump({ f0: 90, f1: 40, sweep: 0.05, decay: 0.45, dur: 0.7, click: 0, drive: 1.5, seed: `hb${k}` }), { drive: 3, type: 'tube', mix: 0.4 });
    const b = bell(E4 * (1 + k * 0.003), { kind: 'bronze', t60: 2.4, seed: `hbb${k}`, strike: -12 });
    const cr = L.crackle(2.2, { density: 40, decay: 0.004, hp: 1500, seed: `hbc${k}` });
    let m = L.mix([at(bl, 0, 0), at(L.fadeOut(fw, 0.6, 'exp'), 0, -5), at(nrm(sub), 0, -3), at(b, 0.04, -9), at(gong, 0.05, -13), at(L.automate(nrm(cr), (t) => Math.exp(-t * 1.5)), 0.2, -18)], { length: 2.8 });
    m = tone(L.psychoBass(m, { freq: 100, amount: -5 }), 'big', 0.6);
    m = L.reverb(m, 'urban', { wet: 0.16, seed: `hbr${k}`, length: 1.4, channels: 1 });
    bursts.push(dense(L.fadeOut(L.slice(m, 0, 2.8), 0.9, 'exp'), -14));
  }
  await add('sunbow_hang_burst', bursts, SP([12, 180], { lufs: -14, voices: 3, pitch: [0.97, 1.03], priority: 3 }));
}

// ------------------------------------------------------------------------------------------------ 落九陽
async function ultSet(add, SP) {
  // ① rise (0 -> 0.42 s): a reversed crash and the loud end of a cymbal roll swelling, a breath drawn in, a tone rising
  // 0.8 -> 1.25 of E3 (§1.12 charge rule) -- cut on the downbeat. ② 40-60 Hz impact (t = 0.42, the arrow loosed into
  // the sky): timpani E3, taiko, a 58 -> 41 Hz sub with harmonics, the hard gong, an opera cymbal (鑼鼓). ③ bed: nine
  // bells rising (E5 .. B6) as the nine suns ignite (t = 0.35 + i x 0.05 in the code), F-horns on E3 / B3 / E5 (pitched
  // +2 st from D / A) and the choir on E (-1 st from F), swelling and fading by ~3.8 s, under the falling suns.
  const crash = await src(S.crash, 0.0, 1.4, { hp: 300 });
  const roll = await src(S.cymRoll, 5.6, 6.4, { hp: 400 });
  const inhale = await src(S.breath, 0.88, 1.22, { hp: 250 });
  const timp = await src(S.timpE3, 0.0, 2.6, { hp: 40 });
  const taiko = await src(S.taiko, 0.0, 0.7, { hp: 40 });
  const gongH = await src(S.gongHard, 0.09, 3.6, { hp: 50 });
  const opera = await src(S.opera, 0.0, 1.0, { hp: 300 });
  const hornE3 = L.fadeIn(await src(S.hornD3, 0.3, 3.5, { hp: 80, semis: 2 }), 0.25, 'sine');
  const hornB3 = L.fadeIn(await src(S.hornA3, 0.3, 3.5, { hp: 100, semis: 2 }), 0.3, 'sine');
  const hornE5 = L.fadeIn(await src(S.hornD5, 0.3, 3.3, { hp: 200, semis: 2 }), 0.35, 'sine');
  const choir = L.fadeIn(await src(S.choirA, 1.0, 4.4, { hp: 160, semis: -1 }), 0.4, 'sine');
  const choir2 = L.fadeIn(await src(S.choirB, 1.4, 4.0, { hp: 200, semis: -6 }), 0.5, 'sine');     // B below (the fifth)
  const raises = [];
  for (let k = 0; k < 2; k++) {
    const D = 0.42, T = 3.9;
    const rev = L.slice(L.reverse(L.slice(crash, 0.005 + k * 0.01, 0.95)), 0.95 - D - 0.005, 0.95);
    const cym = L.mix([at(nrm(rev)), at(L.automate(L.slice(roll, 0, D), (t) => (t / D) ** 2.2), 0, -6)]);
    const breath = L.mix([at(L.applyEnv(L.sweep(L.noise(D, { color: 'pink', seed: `ub${k}` }), 'bp', (t) => 400 * (3200 / 400) ** (t / D), { q: 1.4 }), L.envCurve(D, [[0, 0], [D * 0.85, 1], [D, 0.6]]))),
      at(L.fitLength(inhale, D), 0, -2)]);
    const rise = L.automate(L.saturate(L.mix([at(L.tone(D, { type: 'saw', freq: (t) => E3 * (0.8 + 0.45 * (t / D) ** 1.5) })), at(L.tone(D, { type: 'sine', freq: (t) => 2 * E3 * (0.8 + 0.45 * (t / D) ** 1.5) }), 0, -3)]), { drive: 6 }), (t) => (t / D) ** 1.8);
    const one = L.automate(L.fadeOut(L.mix([at(nrm(cym), 0, -2), at(nrm(breath), 0, -5), at(L.lp(nrm(rise), 2500), 0, -9)], { length: D + 0.02 }), 0.02, 'sine'), (t) => 0.12 + 0.88 * Math.min(1, t / D) ** 2);
    const sub = L.saturate(L.thump({ f0: 58, f1: 41, sweep: 0.06, decay: 0.32, dur: 0.5, click: 0, drive: 1.5, seed: `us${k}` }), { drive: 3, type: 'tube', mix: 0.4 });
    const crk = L.mix([at(nrm(L.noiseBurst({ dur: 0.07, decay: 0.02, hp: 900, lp: 12000, seed: `uc${k}` }))), at(nrm(L.thump({ f0: 220, f1: 75, sweep: 0.02, decay: 0.12, drive: 3, seed: `uct${k}` })), 0, -2)]);
    const two = L.mix([at(nrm(sub), 0, 0), at(crk, 0, -6), at(timp, 0, -2), at(taiko, 0.005, -4), at(gongH, 0.01, -8), at(opera, 0.0, -11)], { length: T - D });
    const nine = L.mix([5, 6, 7, 8, 9, 10, 11, 12, 13].map((n, i) => at(L.mix([at(bell(PENTA[n], { kind: 'jade', t60: 1.1, seed: `un${k}${i}`, strike: -12 })), at(bell(PENTA[n] / 2, { kind: 'bronze', t60: 1.3, seed: `unb${k}${i}`, strike: -14 }), 0, -9)]), i * 0.05, -2 - i * 0.3)));
    const bed = L.mix([at(hornE3, 0, -2), at(hornB3, 0.05, -4), at(hornE5, 0.1, -9), at(choir, 0.15, -5), at(choir2, 0.3, -12)], { length: T - D });
    const bedE = L.automate(nrm(bed), (t) => (t < 0.3 ? t / 0.3 : t < 2.2 ? 1 : Math.max(0, 1 - (t - 2.2) / 1.2)) ** 1.2);
    let m = L.mix([at(one, 0, -9), at(nrm(two), D, 0), at(nrm(nine), D - 0.07, -9), at(bedE, D, -15)], { length: T });
    m = tone(L.psychoBass(m, { freq: 100, amount: -5 }), 'big', 0.55);
    m = space(m, { wet: 0.24, seed: `usp${k}`, shimmer: -20, length: 2.2 });
    raises.push(dense(L.fadeOut(L.slice(m, 0, T), 0.9, 'exp'), -14, 1.5));
  }
  await add('sunbow_ult_raise', raises, SP([12, 220], { lufs: -14, vol: 0.85, voices: 2, pitch: [1, 1], priority: 4, maxHeadMs: 600 }));

  // each sun struck out of the sky (positional, and once as the nine ignite): a high string 錚 with a glide, a short
  // whistle, a "tsing", the sun's pop (a flare roar + thump) and a jade B6
  const shots = [];
  for (let k = 0; k < 3; k++) {
    const r = ctx.rng(`ush${k}`), f = 1 + r.range(-0.03, 0.03);
    const st = string(PENTA[10] * f, 0.6, { t60: 0.35, bright: 0.95, pick: 0.08, glide: 0.08, seed: `ushs${k}` });
    const wh = whistle(0.16, (t) => 3300 * f * (1 - t), { vib: 0.01, air: -4, seed: `ushw${k}`, env: [[0, 0], [0.01, 1], [0.16, 0]] });
    const ts = L.noiseBurst({ dur: 0.12, decay: 0.05, bp: 6200, q: 2, seed: `usht${k}` });
    const pop = roar(0.55, { f0: 500, f1: 2300, f2: 800, q: 1, flicker: 0.35, crack: -14, seed: `ushp${k}`, env: [[0, 0], [0.02, 1], [0.15, 0.5], [0.55, 0]] });
    const th = L.thump({ f0: 240, f1: 100, sweep: 0.012, decay: 0.09, click: 0.2, drive: 3, seed: `ushh${k}` });
    const j = bell(PENTA[13] * f, { kind: 'jade', t60: 0.6, seed: `ushj${k}`, strike: -12 });
    const m = L.mix([at(st, 0, -1), at(nrm(wh), 0, -9), at(nrm(ts), 0, -12), at(nrm(pop), 0.02, -4), at(nrm(th), 0.02, -6), at(j, 0.025, -9)], { length: 0.9 });
    shots.push(L.pad(dense(L.fadeOut(m, 0.3, 'exp'), -15), 0.003, 0));
  }
  await add('sunbow_ult_shot', shots, SP([12, 200], { lufs: -15, vol: 0.8, voices: 4, pitch: [0.96, 1.04] }));

  // a sun falling (positional at the impact point, starts 0.05 s after the shot; it lands ~0.31 s in -- 0.40 for the
  // ninth): a whistle diving 2.6 -> 0.7 kHz, the fire rush building (a roar band diving), a jet of recorded fire, crackle;
  // it peaks at 0.3 s and drops out fast under the impact
  const jet = await src(S.fireA, 0.0, 1.2, { hp: 150 });
  const falls = [];
  for (let k = 0; k < 3; k++) {
    const D = 0.62, r = ctx.rng(`uf${k}`), f = 1 + r.range(-0.05, 0.05);
    const env = (t) => (t < 0.3 ? (0.15 + 0.85 * (t / 0.3) ** 1.6) : Math.exp(-(t - 0.3) * 14));
    const wh = whistle(D, (t) => (2600 - 1900 * Math.min(1, t / 0.34)) * f, { vib: 0.02, vibHz: 10, air: -3, seed: `ufw${k}`, env: [[0, 1], [D, 1]] });
    const rush = L.sweep(L.noise(D, { color: 'pink', seed: `ufr${k}` }), 'bp', (t) => 2200 * f * (500 / 2200) ** Math.min(1, t / 0.34), { q: 0.9 });
    const cr = L.crackle(D, { density: 80, decay: 0.003, hp: 2000, seed: `ufc${k}` });
    let m = L.mix([at(nrm(wh), 0, -6), at(nrm(rush), 0, 0), at(L.slice(jet, 0.05 + k * 0.1, 0.05 + k * 0.1 + D), 0, -4), at(nrm(cr), 0, -14)], { length: D });
    m = L.automate(m, env);
    falls.push(L.pad(dense(L.fadeOut(m, 0.1, 'exp'), -15), 0.003, 0));
  }
  await add('sunbow_ult_fall', falls, SP([12, 200], { lufs: -15, vol: 0.8, voices: 4, pitch: [0.96, 1.04], maxHeadMs: 30 }));

  // a sun striking the street (positional, 8 of them 0.22 s apart): a blast (four recordings), taiko, a 75 -> 42 Hz
  // sub, rubble, the fire whoosh, a short bronze E5 ping (the weapon in every hit)
  const rubble = await src(S.rubble, 0.0, 1.0, { hp: 90 });
  const rubble2 = await src(S.rubble2, 0.0, 0.6, { hp: 150 });
  const taiko2 = await src(S.taiko2, 0.0, 0.6, { hp: 40 });
  const fwI = await src(S.fireB, 0.0, 1.3, { hp: 120 });
  const imps = [];
  const blasts = [[S.grenade, 0, -1], [S.expl, 0, 0], [S.blast, 0.2, 0], [S.deep, 0, 1]];
  for (let k = 0; k < 4; k++) {
    const [id, t0, semis] = blasts[k];
    const bl = await src(id, t0, t0 + 1.8, { hp: 40, semis });
    const sub = L.saturate(L.thump({ f0: 75, f1: 42, sweep: 0.05, decay: 0.35, dur: 0.6, click: 0, drive: 1.5, seed: `ui${k}` }), { drive: 3, type: 'tube', mix: 0.4 });
    const b = bell(PENTA[5] * (1 + k * 0.004), { kind: 'bronze', t60: 0.6, seed: `uib${k}`, strike: -10 });
    let m = L.mix([at(bl, 0, 0), at(taiko2, 0.003, -6), at(nrm(sub), 0, -2), at(rubble, 0.03, -8), at(rubble2, 0.12, -12), at(L.fadeOut(fwI, 0.5, 'exp'), 0, -8), at(b, 0.005, -15)], { length: 1.9 });
    m = tone(L.psychoBass(m, { freq: 100, amount: -5 }), 'big', 0.6);
    m = L.reverb(m, 'urban', { wet: 0.16, seed: `uir${k}`, length: 1.2, channels: 1 });
    m = L.automate(m, (t) => (t < 0.1 ? 1 : Math.exp(-(t - 0.1) * 2)));
    imps.push(dense(L.fadeOut(L.slice(m, 0, 1.9), 0.7, 'exp'), -13, 1));
  }
  await add('sunbow_ult_impact', imps, SP([15, 240], { lufs: -13, vol: 0.7, voices: 4, pitch: [0.95, 1.05], priority: 4 }));

  // the ninth sun (positional): the 40-60 Hz boom (62 -> 40 Hz, tube harmonics), the long crash of a huge blast and a
  // deep one, timpani, the hard gong and a bronze E3 / E4 pair ringing long, the choir swelling briefly, the fire pillar's
  // roar; then the deflate (洩氣: breath let go, 3 kHz -> 400 Hz) and embers settling
  const huge = await src(S.huge, 0.0, 3.2, { hp: 35 });
  const deep = await src(S.deep, 0.0, 2.0, { hp: 35 });
  const choirF = L.fadeIn(await src(S.choirA, 2.2, 5.0, { hp: 160, semis: -1 }), 0.15, 'sine');
  const finals = [];
  for (let k = 0; k < 2; k++) {
    const T = 4.4;
    const boom = L.saturate(L.thump({ f0: 62, f1: 40, sweep: 0.06, decay: 0.55, dur: 0.9, click: 0, drive: 1.5, seed: `uF${k}` }), { drive: 4, type: 'tube', mix: 0.45 });
    const crk = L.mix([at(nrm(L.noiseBurst({ dur: 0.09, decay: 0.025, hp: 700, lp: 12000, seed: `uFc${k}` }))), at(nrm(L.thump({ f0: 200, f1: 70, sweep: 0.02, decay: 0.14, drive: 3, seed: `uFt${k}` })), 0, -2)]);
    const bells = L.mix([at(bell(E3, { kind: 'bronze', t60: 3.2, seed: `uFb${k}`, strike: -10 })), at(bell(E4 * 1.002, { kind: 'bronze', t60: 2.6, seed: `uFb2${k}`, strike: -12 }), 0.03, -4), at(bell(PENTA[8], { kind: 'jade', t60: 1.8, seed: `uFj${k}`, strike: -14 }), 0.06, -9)]);
    const pillar = roar(2.2, { f0: 250, f1: 1600, f2: 450, q: 0.7, flicker: 0.45, crack: -12, seed: `uFp${k}`, env: [[0, 0], [0.05, 1], [0.8, 0.6], [2.2, 0]] });
    const deflate = L.applyEnv(L.sweep(L.noise(1.3, { color: 'pink', seed: `uFd${k}` }), 'bp', (t) => 3000 * (400 / 3000) ** (t / 1.3), { q: 1.2 }), L.envCurve(1.3, [[0, 0], [0.08, 1], [0.6, 0.5], [1.3, 0]]));
    const embers = L.automate(L.crackle(2.6, { density: 35, decay: 0.004, hp: 1600, seed: `uFe${k}` }), (t) => Math.min(1, t / 0.3) * Math.exp(-t * 0.9));
    let m = L.mix([at(nrm(boom), 0, 0), at(crk, 0, -5), at(L.automate(huge, (t) => (t < 0.25 ? 1 : Math.exp(-(t - 0.25) * 1.6))), 0, -3), at(L.automate(deep, (t) => (t < 0.2 ? 1 : Math.exp(-(t - 0.2) * 2))), 0.004, -5), at(timp, 0, -5), at(gongH, 0.01, -7), at(nrm(bells), 0.02, -6),
      at(choirF, 0.1, -16), at(nrm(pillar), 0.03, -12), at(nrm(deflate), 1.5, -13), at(nrm(embers), 1.4, -18)], { length: T });
    m = tone(L.psychoBass(m, { freq: 100, amount: -4 }), 'big', 0.6);
    m = space(m, { wet: 0.28, seed: `uFs${k}`, shimmer: -20, length: 2.4 });
    finals.push(dense(L.fadeOut(L.slice(m, 0, T), 1.3, 'exp'), -12, 1.5));
  }
  await add('sunbow_ult_final', finals, SP([20, 320], { lufs: -12, vol: 0.9, voices: 2, pitch: [0.99, 1.01], priority: 5 }));
}

// ------------------------------------------------------------------------------------------------ ready (unique per §1.12)
async function readySet(add) {
  // 就緒: a bronze 磬 bowl struck on E5 (its slow beating = the sun's breath), a bowstring harmonic (B6, flageolet: the
  // string touched at its node and plucked), three gold glints rising, a breath of flame; in the plaza. No other ready
  // in the game is a bowl + string harmonic.
  const make = (k) => {
    const bowl = bell(PENTA[5], { kind: 'bowl', t60: 2.2, seed: `rb${k}`, strike: -12, beat: 0.0025 });
    const harm = string(PENTA[13] * (1 + k * 0.002), 1.6, { t60: 1.3, bright: 0.3, pick: 0.5, seed: `rh${k}`, body: false });
    const gl = L.mix([0, 1, 2].map((i) => at(bell(midi([100, 104, 107][i]), { kind: 'tiny', t60: 0.3, seed: `rg${k}${i}`, strike: -14 }), 0.1 + i * 0.045, -i * 2)));
    const fl = roar(0.6, { f0: 600, f1: 1800, f2: 900, q: 1, flicker: 0.3, crack: -20, seed: `rf${k}`, env: [[0, 0], [0.12, 1], [0.6, 0]] });
    let m = L.mix([at(bowl, 0, 0, -0.15), at(harm, 0.07, -7, 0.25), at(nrm(gl), 0, -12, 0.1), at(L.toStereo(nrm(fl)), 0.02, -18)], { channels: 2 });
    m = space(m, { wet: 0.26, seed: `rs${k}`, shimmer: -20, ch: 2, length: 1.8 });
    return L.fadeOut(L.slice(m, 0, 2.2), 0.7, 'exp');
  };
  const vars = [make(0), make(1)];
  await add('ready_sunbow', vars, { lufs: -18, bus: 'ui', spatial: false, channels: 2, voices: 2, pitch: [1, 1], priority: 3 });
  // the reserved twin 彤弓．月蝕: the same cue 4 st down with a 0.17 / 0.34 s echo (specials.js plays the def's ready cue
  // directly, so the handler's runtime twin treatment cannot reach it)
  const tw = vars.map((v) => {
    const d = L.varispeedSemis(v, TW);
    return L.mix([at(d), at(L.eq(d, [{ type: 'lp', f: 3500, order: 2 }]), 0.17, -9.4), at(L.eq(d, [{ type: 'lp', f: 2200, order: 2 }]), 0.34, -16)], { channels: 2 });
  });
  await add('ready_sunbow_eclipse', tw, { lufs: -18, bus: 'ui', spatial: false, channels: 2, voices: 2, pitch: [1, 1], priority: 3, note: 'twin 彤弓．月蝕 (reserved, not referenced yet)' });
}

// ------------------------------------------------------------------------------------------------ crisis + foley
/** Nine jade chimes rising (E5 .. B6) at `t0` + i * `dt`, panned left -> right. */
function nineChimes(t0, dt, { seed = 'nc', t60 = 0.9, gain = 0 } = {}) {
  return [5, 6, 7, 8, 9, 10, 11, 12, 13].map((n, i) => at(L.mix([at(bell(PENTA[n], { kind: 'jade', t60, seed: `${seed}${i}`, strike: -14 })), at(bell(PENTA[n] * 2.003, { kind: 'tiny', t60: 0.2, seed: `${seed}t${i}`, strike: -16 }), 0.002, -14)]),
    t0 + i * dt, gain - 4 + i * 0.25, -0.6 + i * 0.15));
}

async function foleySet(add, SP, D2) {
  // 扶桑甲 crisis armour: the red lacquer and porcelain shattering (a plate break + a glass smash + jade shards), gold
  // leaves bursting off (a dense metallic flutter + a jingle), the knock-back thump, then the element's tail: a flame
  // whoosh up and a bronze E5 (§1.12 危機護甲)
  const plate = await src(S.plate, 0.0, 1.1, { hp: 300 });
  const smash = await src(S.glassSmash, 0.18, 1.2, { hp: 400 });
  const crisis = [];
  for (let k = 0; k < 2; k++) {
    const shards = L.mix([0, 1, 2, 3, 4, 5].map((i) => at(bell(2600 * 2 ** (i / 5 + k * 0.1), { kind: 'jade', t60: 0.25, seed: `cs${k}${i}`, strike: -6, beat: 0 }), i * 0.018, -6 - i)));
    const leaves = L.applyEnv(L.eq(L.crackle(0.8, { density: 1200, decay: 0.0012, hp: 2500, seed: `cl${k}` }), [{ type: 'bp', f: 5200, q: 0.6 }]), L.envCurve(0.8, [[0, 0], [0.03, 1], [0.3, 0.4], [0.8, 0]]));
    const tail = roar(0.9, { f0: 300, f1: 1800, f2: 600, q: 0.8, seed: `ct${k}`, env: [[0, 0], [0.08, 1], [0.9, 0]] });
    let m = L.mix([at(k ? smash : plate, 0, -1), at(k ? plate : smash, 0.025, -7), at(nrm(shards), 0, -7), at(nrm(leaves), 0.01, -9), at(nrm(K.jingle(0.5, 9, `cj${k}`)), 0.02, -11),
      at(nrm(L.thump({ f0: 150, f1: 55, decay: 0.2, drive: 3, seed: `cth${k}` })), 0, -5), at(nrm(tail), 0.28, -6), at(bell(PENTA[5], { kind: 'bronze', t60: 1.2, seed: `cb${k}` }), 0.3, -9)], { length: 1.6 });
    m = tone(L.psychoBass(m, { freq: 120, amount: -8 }), 'hit');
    crisis.push(dense(L.fadeOut(m, 0.5, 'exp'), -15));
  }
  await add('sunbow_crisis', crisis, SP([4, 50], { lufs: -15, voices: 3, pitch: [0.98, 1.02], priority: 3 }));

  // 待機 hum (§1.12, the code plays it at vol 0.18 with a 0.4 s fade-in: ~26 dB under a loose): E2 sine + B2 / E3, a
  // band of noise 400-1200 Hz swept by a 0.2 Hz LFO, the 日珠's embers -- a soft flame breathing at 0.4 Hz and sparse pops
  // (the first version clicked at the wrap -- a 0.05 step every 5 s -- and swelled 3 dB at the head: the sines are now
  // on the 0.2 Hz grid and every LFO has whole cycles in the 5 s loop; only the noise is crossfaded)
  {
    const P = 5.0, X = 0.5, D = P + X;
    const pt = (f) => L.tone(P, { type: 'sine', freq: onGrid(f, P) });
    const sine = L.mix([at(pt(E2)), at(pt(B2), 0, -10), at(pt(E3), 0, -14)]);
    const band = L.sweep(L.noise(D, { color: 'pink', seed: 'ih' }), 'bp', (t) => 700 * 1.7 ** Math.sin(6.283 * 0.2 * t), { q: 1.6 });
    const breathE = (t) => 0.35 + 0.65 * Math.max(0, Math.sin(6.283 * 0.4 * t)) ** 2;
    const flame = L.automate(roar(D, { f0: 580, f1: 580, q: 0.8, flicker: 0.25, crack: -10, seed: 'ifl', env: [[0, 1], [D, 1]] }), breathE);
    const pops = L.crackle(D, { density: 5, decay: 0.006, hp: 1400, seed: 'ipp' });
    const noisy = L.mix([at(nrm(band), 0, -9), at(nrm(flame), 0, -12), at(nrm(pops), 0, -16)], { length: D });
    const m = seamless(P, X, noisy, L.gain(nrm(sine), -3), 0);
    seamCheck('sunbow_idle', m);
    await add('sunbow_idle', m, D2({ lufs: -26, loop: true, channels: 1, voices: 1, pitch: [1, 1] }));
  }

  // the bow coming up (the card's 弓臂低響): a big object's air, a timber creak low (horn and bamboo), the grip seating
  // with a wood knock, a few gold bead jingles
  const draws = [];
  for (let k = 0; k < 2; k++) {
    const air = await src(S.swing, 0.0, 0.8, { hp: 150, semis: -5 });
    const cape = await src(S.cape, 0, 0.335, { hp: 120, semis: -2 });
    const cr = await creakAt(k + 1, { semis: -6, len: 0.45 });
    const kn = await grab(S.woodM(k + 1), 0, 0.33, { mode: 'peak', post: 0.12, semis: -4, hp: 90 });
    let m = L.mix([at(air, 0, -4), at(cape, 0.02, -3), at(L.fadeOut(cr, 0.15, 'exp'), 0.1, -6), at(kn, 0.36, -8), at(nrm(K.jingle(0.3, 5, `dj${k}`)), 0.38, -15)], { length: 0.8 });
    draws.push(L.fadeOut(m, 0.25, 'exp'));
  }
  await add('sunbow_draw', draws, D2({ lufs: -21, channels: 1, voices: 2, pitch: [0.97, 1.03] }));

  // first draw (1.6 s clip; this plays at clip t = 0.032 s): the bow swings up (air, a low timber groan, a soft
  // whomp), the nine cores light bottom to top (nine rising jade chimes at 0.40 + i x 0.048 s, matching the clip's
  // events), the 日珠 flares (a reversed swell into a bronze E6 at 0.85 s + flame), then the 射日 sting at 1.30 s:
  // timpani + taiko + sub, a 嗩吶-like line rising B5 -> C#6 -> E6 and lifting off, a horn stab on E5, a gong shimmer
  {
    const air = await src(S.swing, 0.0, 0.8, { hp: 150, semis: -6 });
    const cr = await creakAt(3, { semis: -7, len: 0.6 });
    const timp = await src(S.timpE3, 0.0, 2.2, { hp: 40 });
    const taiko = await src(S.taiko, 0.0, 0.7, { hp: 40 });
    const horn = await src(S.hornStacD5, 0.0, 1.2, { hp: 200, semis: 2 });
    const smack = await src(S.gongSmack, 0.02, 2.0, { hp: 400 });
    const T = 2.9;
    const whomp = L.thump({ f0: 95, f1: 50, sweep: 0.04, decay: 0.3, click: 0, drive: 1, seed: 'fdw' });
    const sun = L.mix([at(swell(PENTA[10], 0.22, { seed: 'fds' }), 0, -6), at(bell(PENTA[10], { kind: 'bronze', t60: 1.3, seed: 'fdb', strike: -10 }), 0.22, 0),
      at(nrm(roar(0.5, { f0: 600, f1: 2200, f2: 900, q: 1, flicker: 0.3, seed: 'fdf', env: [[0, 0], [0.05, 1], [0.5, 0]] })), 0.23, -10)]);
    const line = reed(1.05, [[0, PENTA[8] * 0.94], [0.05, PENTA[8]], [0.22, PENTA[8]], [0.26, PENTA[9]], [0.36, PENTA[9]], [0.4, PENTA[10]], [0.82, PENTA[10]], [0.9, PENTA[10] * 1.06], [1.05, PENTA[11] * 1.02]],
      { seed: 'fdr', env: [[0, 0], [0.03, 1], [0.8, 0.95], [1.05, 0]] });
    const sub = L.saturate(L.thump({ f0: 80, f1: 44, sweep: 0.05, decay: 0.4, dur: 0.6, click: 0, drive: 1.5, seed: 'fdu' }), { drive: 3, type: 'tube', mix: 0.4 });
    let m = L.mix([at(L.toStereo(air), 0, -6), at(L.toStereo(L.fadeOut(cr, 0.2, 'exp')), 0.04, -8), at(L.toStereo(nrm(whomp)), 0.1, -10),
      ...nineChimes(0.40, 0.048, { seed: 'fdc', gain: -6 }),
      at(L.toStereo(nrm(sun)), 0.63, -3),
      at(L.toStereo(timp), 1.3, -2), at(L.toStereo(taiko), 1.305, -5), at(L.toStereo(nrm(sub)), 1.3, -5), at(L.toStereo(nrm(line)), 1.33, -9), at(L.toStereo(horn), 1.33, -9), at(L.toStereo(smack), 1.32, -16)],
      { channels: 2, length: T });
    m = L.psychoBass(m, { freq: 100, amount: -7 });
    m = space(m, { wet: 0.2, seed: 'fdsp', shimmer: -22, ch: 2, length: 1.8 });
    await add('sunbow_first', L.fadeOut(L.slice(m, 0, T), 0.7, 'exp'), D2({ lufs: -16, channels: 2, voices: 1, pitch: [1, 1], note: 'baked to the sunbow_first clip timeline (1.6 s)' }));
  }

  // the thumb pluck (vol 0.8 / 0.5): the string's long "嗡——" (E3 with its octave), a bronze bowl overtone, gold dust
  const plucks = [];
  for (let k = 0; k < 3; k++) {
    const f = E3 * (1 + (k - 1) * 0.008);
    const st = string(f, 1.5, { t60: 1.3, bright: 0.7, pick: 0.16, glide: 0.015, seed: `pk${k}` });
    const o = string(f * 2.002, 1.2, { t60: 0.8, bright: 0.6, pick: 0.3, seed: `pko${k}` });
    const ov = bell(PENTA[10], { kind: 'bowl', t60: 1.0, seed: `pkb${k}`, strike: -24 });
    const dust = K.jingle(0.4, 6, `pkd${k}`);
    let m = L.mix([at(st, 0, 0, -0.1), at(o, 0.001, -8, 0.15), at(ov, 0.01, -15, 0.2), at(nrm(dust), 0.05, -22, -0.2)], { channels: 2, length: 1.5 });
    m = L.reverb(m, 'smallRoom', { wet: 0.15, seed: `pkr${k}`, length: 0.8 });
    plucks.push(L.fadeOut(L.slice(m, 0, 1.5), 0.5, 'exp'));
  }
  await add('sunbow_pluck', plucks, D2({ lufs: -20, channels: 2, voices: 2, pitch: [0.99, 1.01] }));

  // inspect (4.6 s clip, this plays at 0.092 s): the bow turning (a low timber groan, cloth), the thumb stroking up past
  // the cores (nine rising jade chimes at 1.06 + i x 0.11 s, matching the clip's glints), the 日珠's flash (bronze E6 +
  // flame at 2.12 s), a two-note answer on a low plucked string (B3 -> E3, 琴-like); in the plaza
  const insp = [];
  for (let k = 0; k < 2; k++) {
    const cr = await creakAt(k + 5, { semis: -7, len: 0.6 });
    const cl = await src(S.cloth, 0.2, 0.8, { hp: 200 });
    const hum = string(E2, 1.6, { t60: 1.8, bright: 0.25, pick: 0.3, seed: `ish${k}` });
    const flash = L.mix([at(bell(PENTA[10], { kind: 'bronze', t60: 1.5, seed: `isb${k}`, strike: -12 })), at(nrm(roar(0.5, { f0: 600, f1: 1800, f2: 800, q: 1, flicker: 0.3, seed: `isf${k}`, env: [[0, 0], [0.05, 1], [0.5, 0]] })), 0.01, -14)]);
    const ans = [[B3, 2.45], [E3, 2.85]].map(([f, t], i) => at(string(f * (1 + k * 0.003), 1.4, { t60: 1.6, bright: 0.35, pick: 0.18, glide: 0.01, seed: `isa${k}${i}` }), t, -5 - i, (i - 0.5) * 0.4));
    let m = L.mix([at(L.toStereo(L.fadeOut(cr, 0.2, 'exp')), 0, -8), at(L.toStereo(cl), 0.05, -14), at(L.toStereo(hum), 0.02, -18),
      ...nineChimes(1.06, 0.11, { seed: `isc${k}`, t60: 1.0, gain: -3 }), at(L.toStereo(nrm(flash)), 2.12, -4), ...ans], { channels: 2, length: 3.9 });
    m = space(m, { wet: 0.22, seed: `isp${k}`, shimmer: -22, ch: 2, length: 1.6 });
    insp.push(L.fadeOut(L.slice(m, 0, 3.9), 0.8, 'exp'));
  }
  await add('sunbow_inspect', insp, D2({ lufs: -21, channels: 2, voices: 1, pitch: [1, 1] }));

  // 續陽 (reload, this plays at 0.18 s; the nine relights each play sunbow_regen): the hand leaving the string and
  // stroking up the riser (cloth + a palm swipe), a breath (the rare reload blows on the 日珠), the fire taking (a soft
  // roar + combustion), a warm low swell
  const breath = await src(S.breath, 1.25, 1.65, { hp: 280 });
  const rek = [];
  for (let k = 0; k < 2; k++) {
    const fab = await src(S.fabric, 0.0, 0.48, { hp: 200, semis: k });
    const swipe = L.applyEnv(L.eq(L.noise(0.55, { color: 'pink', seed: `rk${k}` }), [{ type: 'bp', f: 2600, q: 0.7 }]), L.envCurve(0.55, [[0, 0], [0.08, 1], [0.4, 0.7], [0.55, 0]]));
    const rr = roar(0.6, { f0: 300, f1: 1200, f2: 600, q: 0.9, flicker: 0.35, crack: -18, seed: `rkr${k}`, env: [[0, 0], [0.15, 1], [0.6, 0]] });
    const comb = L.fadeOut(await src(S.combust, 0.02, 0.4, { hp: 300 }), 0.2, 'exp');
    const low = L.thump({ f0: 95, f1: 62, sweep: 0.1, decay: 0.5, click: 0, drive: 0.5, seed: `rkl${k}` });
    const m = L.mix([at(fab, 0, -6), at(nrm(swipe), 0.02, -10), at(breath, 0.12, -7), at(nrm(rr), 0.28, -6), at(comb, 0.32, -11), at(nrm(low), 0.3, -14)], { length: 0.95 });
    rek.push(L.fadeOut(m, 0.3, 'exp'));
  }
  await add('sunbow_rekindle', rek, D2({ lufs: -21, channels: 1, voices: 2, pitch: [0.98, 1.02] }));

  // one core relit (one per regenerated arrow, nine in a reload run): a jade 磬 chime on the pentatonic (five variants,
  // E6 F#6 G#6 B6 C#7: any run of them is in key, like wind chimes), a small gold bell an octave up, a flame "pft"
  const regen = [];
  for (let k = 0; k < 5; k++) {
    const f = PENTA[10 + k];
    const j = bell(f, { kind: 'jade', t60: 0.7, seed: `rg${k}`, strike: -12 });
    const t = bell(f * 2.002, { kind: 'tiny', t60: 0.18, seed: `rgt${k}`, strike: -16 });
    const pft = L.eq(L.noiseBurst({ dur: 0.12, attack: 0.004, decay: 0.07, color: 'pink', seed: `rgp${k}` }), [{ type: 'bp', f: 1300, q: 0.9 }]);
    regen.push(L.fadeOut(L.mix([at(j, 0, 0), at(t, 0.002, -12), at(nrm(pft), 0, -15)], { length: 0.8 }), 0.25, 'exp'));
  }
  await add('sunbow_regen', regen, D2({ lufs: -22, channels: 1, voices: 5, pitch: [1, 1] }));
}

// ------------------------------------------------------------------------------------------------ produce
export async function produce(lib, c) {
  L = lib; ctx = c; K = makeKit(lib, ctx);
  const only = process.env.SB_ONLY ? new Set(process.env.SB_ONLY.split(',').map((s) => s.trim())) : null;
  if (only && !process.env.CF_AUDIO_OUT) throw new Error('SB_ONLY writes a partial category: set CF_AUDIO_OUT to a scratch folder');
  const want = (g) => !only || only.has(g);
  const cat = ctx.category('premium_sunbow', { bus: 'sfx' });
  // the premium_bifang mastering wrapper: short one-shots lose 0.5-1.5 dB of loudness in Vorbis (pre-compensated);
  // longer ones get the codec-aware pre-master (weapons.mjs codecSafe); EPERM retry for a file the dev server is reading
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
  const SP = (range, o = {}) => ({ spatial: true, channels: 1, range, ...o });       // positional (mono)
  const D2 = (o = {}) => ({ spatial: false, ...o });                                   // 2D (local only)

  if (want('bow')) await bowSet(add, SP, D2);
  if (want('draw')) await drawSet(add, SP, D2);
  if (want('hits')) await hitSet(add, SP, D2);
  if (want('skills')) await skillSet(add, SP);
  if (want('ult')) await ultSet(add, SP);
  if (want('ready')) await readySet(add);
  if (want('foley')) await foleySet(add, SP, D2);
  await cat.write();
}
