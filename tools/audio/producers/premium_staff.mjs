// X04 應龍．御霆 Yinglong Stormherald (神兵 magic staff, docs/PREMIUM_WEAPONS.md §2.31 + §1.12) — category 'premium_staff':
// every cue game/src/weapons/premium/staff.js plays (its SND table, the clip 'snd' events, the idle hum, the def's ready
// cue) plus the def.sound contract (staff_close / _tail / _far: what teammates hear when a 雷矢 is cast). Palette: bronze
// and thunder, key D (宮 pentatonic D E F# A B) for every tuned part.
//
// The CC0 inventory holds no thunder or electric-arc recordings, so the lightning is built from parts: the 霹 split of a
// close stroke (one big N-wave + a tearing train of small ones), the rip (dense crackle), the boom (a 40-100 Hz thump and
// brown noise), the roll (recorded rolling explosions -- a distant mortar, a sub boom -- slowed and darkened, under a
// synthesized rumble that swells in random rolls); arcs are jittered discharge trains rung through two resonances (the
// raspy, unstable buzz of a real arc) with recorded sizzle and high-passed fire crackle for the sparks. Recorded layers:
// blasts and debris, a tiger's roar + an F horn bellow + a didgeridoo roar for the dragon, VSCO gong / timpani / bass
// drum / cymbal roll / horns / cello tremolo, a choir, rain, wind, a motor whir (the armillary), revolver clicks, plate /
// glass / tea cup (jade scales), cloth and swings. Synthesis: bronze bells, 磬 chime stones, jade pings, the 30 ms
// luxury tick, a Shepard-Risset rising hum (the channel's 上升嗡鳴, exactly periodic), the dragon's sung 吟.
//
//   bolt     staff_bolt (local 雷矢: 嗞 + a small thunder + a jade ping on the pentatonic + the §1.12 luxury tick),
//            staff_close / _tail / _far (teammates' casts), staff_bolt_hit (電擊「啪」 into a body), staff_mark /
//            staff_mark_full (「叮」, rendered so the code's pitch 1.3 lands on A6), staff_kill (擊殺「霹」)
//   chain    staff_chain_start (劈 + the arc lighting), staff_chain_loop (劈啪 + a Shepard hum that rises for ever),
//            staff_chain_end, staff_burst (雷爆 轟啪)
//   pool     staff_pool_cast (吸氣式電流聲 + the palm), staff_pool_strike (雷鳴, every 0.5 s), staff_pool_loop (the field's
//            crackle and hum), staff_pool_repel (the fence's 「啪」), staff_pool_end
//   ult      §1.12 three layers in staff_ult_raise (inhale + thunder roll rising 0.8 -> 1.25 -> a 40-60 Hz impact ->
//            horns, choir, bronze bells, cello tremolo on D), staff_ult_cloud (遠雷; also the inspect's far lightning),
//            staff_ult_roar (龍吟), staff_ult_dive (霹靂), staff_ult_final (the column: 40-60 Hz boom, the long roll,
//            bronze bells, the gold scales scattering, the deflate), staff_ult_rain (甘霖 loop: rain + a bronze bell)
//   ready    ready_staff (unique: a 磬 stone + a crackling D chord), ready_staff_hui (the reserved twin 應龍．晦霆:
//            -4 st + echo, baked because specials.js plays the def's ready cue directly)
//   foley    staff_crisis (jade scales shattering + the thunder tail), staff_idle (§1.12 hum loop), staff_draw,
//            staff_first (baked to the 1.6 s clip), staff_reload / _rare (引雷), staff_inspect (the 2-3 s phrase),
//            staff_ring (the armillary's 「喀」), staff_dry
//
//   node --max-old-space-size=1536 tools/audio/build.mjs --only premium_staff
//   dev subset (never into the game folder: a subset run deletes the other files of the category):
//   CF_AUDIO_OUT=tools/audio/out/st-dev ST_ONLY=bolt,chain node --max-old-space-size=1536 tools/audio/run-producer.mjs \
//     tools/audio/producers/premium_staff.mjs --spectrograms all
import { makeKit } from './weapons.mjs';

const SR = 48000;
let L, ctx, K;

const S = {
  // thunder: rolling explosions (the roll), blasts (a strike's body), tree cracks (the split), debris
  roll: 'fs:264031', rollSub: 'fs:275196', crash: 'fs:366086', grenade: 'fs:609587', expl: 'fs:398283', deep: 'fs:258195', medium: 'fs:516914',
  woodA: 'fs:183451', woodB: 'fs:183453', rubble: 'fs:758580', rubble2: 'fs:569510', debris: 'fs:703247',
  // electricity's texture: an acid sizzle, fire crackle (high-passed: sparks)
  sizzle: 'fs:382313', crackle: 'fs:363092',
  // weather
  rainPat: 'fs:200273', rainHiss: 'fs:265627', wind: 'fs:405601',
  // the dragon
  tiger: 'fs:263115', didg: 'fs:204912', hornD3: 'fs:373257', hornA3: 'fs:373253',
  // ritual / music (D)
  gong: 'fs:375532', gongHard: 'fs:375531', gongScrape: 'fs:375550', timpF2: 'fs:373928', bdrum: 'fs:375260', cymRoll: 'fs:375519',
  choirA: 'fs:764329', choirO: 'fs:764339', celloTrem: 'fs:372845',
  // mechanism / foley
  whir: 'fs:125401', clicks: 'fs:677159', clang: 'fs:201094', swing: 'fs:268227', cape: 'fs:494797', cloth: 'fs:334219', slap: 'fs:390462', wet: 'fs:626405', breath: 'fs:163383',
  // porcelain / jade
  plate: 'fs:565642', glassSmash: 'fs:244238', teaCup: 'fs:389432',
};
const midi = (m) => 440 * 2 ** ((m - 69) / 12);
// 宮 pentatonic on D:  0 D4  1 E4  2 F#4  3 A4  4 B4  5 D5  6 E5  7 F#5  8 A5  9 B5  10 D6  11 E6  12 F#6  13 A6  14 B6  15 D7
const PENTA = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86, 88, 90, 93, 95, 98].map(midi);
const D2 = midi(38), A2 = midi(45), D3 = midi(50), D4 = midi(62);
const TW = -4;                                    // the twin: semitones (§1.12 降 3-5 個半音)

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
 *  limiter (premium_sunbow / premium_bifang recipe). */
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
// band-share targets (weapons.mjs balance() bands)
const BAL = {
  big: { sub: -13, low: -7, lowMid: -5, mid: -4.5, high: -9, air: -14 },
  hit: { sub: -15, low: -8, lowMid: -5, mid: -4.5, high: -8, air: -13 },
  zap: { sub: -17, low: -9, lowMid: -6, mid: -4.5, high: -6.5, air: -11 },
};
const shape = (b, t, amount = 0.7) => K.balance(b, BAL[t] || t, amount);
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
const ramp = (D, p = 2) => (t) => Math.min(1, Math.max(0, t / D)) ** p;

// open sky over the streets: the roll hangs long and dark
const SKY = {
  length: 3.2, predelay: 0.03,
  echoes: { count: 12, t: [0.07, 0.8], gain: [0.15, 0.4], lp: [4800, 1500], spread: [0.004, 0.04], pan: 1 },
  tail: { rt60: 2.5, rtLow: 3.1, rtHigh: 0.9, gain: 0.5, start: 0.06, build: 0.2, lp: 3400, hp: 45 },
};
// a bronze hall for the ritual cues (ready, inspect, the first draw)
const HALL = {
  length: 2.6, predelay: 0.018,
  echoes: { count: 16, t: [0.02, 0.32], gain: [0.18, 0.42], lp: [7500, 3000], spread: [0.002, 0.02], pan: 1 },
  tail: { rt60: 2.0, rtLow: 2.3, rtHigh: 1.1, gain: 0.55, start: 0.03, build: 0.1, lp: 6500, hp: 90 },
};
/** Dry + a space (+ optionally an octave-up "shimmer" of the send). */
function space(b, { wet = 0.25, seed = 'sp', env = SKY, ch = 1, length, shimmer = null } = {}) {
  const out = L.convolve(b, L.makeIR(env, { seed, channels: ch, length }), { wet, dry: 1 });
  if (shimmer == null) return out;
  const up = L.varispeed(L.toMono(b), 2);
  const sh = L.convolve(L.eq(up, [{ type: 'hp', f: 1500, order: 2 }]), L.makeIR(env, { seed: seed + 'h', channels: ch, length }), { wetOnly: true });
  return L.mix([at(out), at(sh, 0.02, shimmer + 20 * Math.log10(L.peak(out) / Math.max(1e-9, L.peak(sh))))], { channels: ch });
}

// ------------------------------------------------------------------------------------------------ seamless loops
// (premium_sunbow): `noisy` (rendered P + X) is crossfaded onto its own head; `tonal` (every component periodic in P) is
// rendered W + P and cut [W, W + P] after its filters have settled -- seamless by itself.
const onGrid = (f, P) => Math.round(f * P) / P;
function seamless(P, X, noisy, tonal, W = 0.5) {
  const a = L.loopCrossfade(L.fitLength(noisy, P + X), X);
  return tonal ? L.mix([at(a), at(L.slice(tonal, W, W + P))], { length: P }) : a;
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
/** A smooth random function periodic in P (Catmull-Rom through `n` seeded points that wrap): flickers that loop. */
function pRand(P, n, seed) {
  const r = L.rng(L.hashSeed(seed)), v = Array.from({ length: n }, () => r.next() * 2 - 1);
  return (t) => {
    const x = ((((t / P) * n) % n) + n) % n, i = Math.floor(x), f = x - i;
    const a = v[(i - 1 + n) % n], b = v[i], c = v[(i + 1) % n], d = v[(i + 2) % n];
    return 0.5 * (2 * b + (c - a) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (3 * b - a - 3 * c + d) * f * f * f);
  };
}
/** Fold everything past P back onto the head: a one-shot laid into a loop of length P rings across the seam. */
function wrap(buf, P) {
  const n = Math.round(P * SR);
  return new L.Buf(buf.data.map((d) => { const o = new Float32Array(n); for (let i = 0; i < d.length; i++) o[i % n] += d[i]; return o; }), SR);
}

// ------------------------------------------------------------------------------------------------ instruments
// partial sets [ratio, amp, t60 scale]
const BELL = {
  // bronze bell: hum, prime, tierce, quint, nominal ... warm and long
  bronze: [[0.5, 0.22, 1.6], [1, 1, 1], [1.2, 0.4, 0.7], [1.5, 0.26, 0.55], [2, 0.6, 0.5], [2.52, 0.2, 0.3], [3.01, 0.15, 0.22], [4.1, 0.08, 0.14], [5.3, 0.05, 0.09]],
  // 磬 chime stone (an L-shaped slab): a firm fundamental and sparse, stony inharmonic modes that die fast
  qing: [[1, 1, 1], [2.33, 0.42, 0.5], [3.78, 0.28, 0.32], [5.62, 0.14, 0.2], [8.1, 0.06, 0.12]],
  // jade ping: pure, sparse overtones
  jade: [[1, 1, 1], [2.76, 0.32, 0.38], [5.4, 0.15, 0.16], [8.93, 0.06, 0.08]],
  // small gold bell: dense, short, bright
  tiny: [[1, 1, 1], [1.59, 0.65, 0.7], [2.14, 0.5, 0.5], [2.65, 0.35, 0.35], [3.17, 0.25, 0.25], [4.3, 0.12, 0.15]],
  // bronze bowl: a strong fundamental, widely spaced modes, slowly beating
  bowl: [[1, 1, 1], [2.71, 0.5, 0.62], [5.15, 0.28, 0.38], [8.21, 0.12, 0.22], [11.9, 0.05, 0.12]],
};
/** A struck bell: partials + a slow-beating twin of each (the warble of a cast bell) + a filtered strike tick. */
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
  // a bell cut short (dur < its ring) must not stop dead
  return L.fadeOut(L.mix([at(nrm(p)), at(nrm(s), 0, strike)]), Math.min(0.4, dur * 0.3), 'sine');
}
/** A bowed / swelling bell: the same partials under a slow attack (bronze "低鳴"), released over the last 40 %. */
function hum(f, dur, { kind = 'bronze', attack = 0.25, t60 = 2, seed = 'hm' } = {}) {
  const b = bell(f, { kind, t60, dur, seed, strike: -60 });
  return L.fadeOut(L.automate(b, (t) => Math.min(1, t / attack) ** 2), dur * 0.4, 'sine');
}
/** §1.12 "貴氣瞬態": 30 ms of 6-10 kHz (a filtered tick + two short high partials). */
function lux(seed, f = 7600) {
  return L.mix([at(nrm(L.noiseBurst({ dur: 0.03, decay: 0.01, bp: 8000, q: 1.3, seed }))),
    at(nrm(L.partials(0.035, { base: f, list: [[1, 1, 0.02], [1.29, 0.6, 0.015]], seed: seed + 'p' })), 0, -4)]);
}
/** A reversed bell bloom swelling into t = dur (for layering before an accent). */
function swell(f, dur, { seed = 'sw', kind = 'bronze', env = HALL } = {}) {
  const b = bell(f, { kind, t60: 1.2, seed });
  const w = L.convolve(b, L.makeIR(env, { seed: seed + 'r', channels: 1, length: 1.4 }), { wet: 1, dry: 0.3 });
  return L.fadeIn(L.reverse(L.slice(w, 0, dur)), dur * 0.5, 'sine');
}
/** A sung cry (the dragon's 吟 / a whistle): a vibrato sine + octave riding a narrow noise band on the same pitch. */
function keen(dur, fq, { vib = 0.012, vibHz = 6, air = -8, seed = 'kn', env } = {}) {
  const F = L.toFn(fq), w = wobble(seed, [vibHz, vibHz * 1.31]);
  const f = (t) => F(t) * (1 + vib * Math.min(1, t / 0.15) * w(t));
  const s = L.mix([at(L.tone(dur, { type: 'sine', freq: f })), at(L.tone(dur, { type: 'sine', freq: (t) => 2 * f(t) }), 0, -12), at(L.tone(dur, { type: 'sine', freq: (t) => 3 * f(t) }), 0, -20)]);
  const nz = L.sweep(L.noise(dur, { color: 'pink', seed: seed + 'n' }), 'bp', F, { q: 5 });
  const b = L.mix([at(nrm(s)), at(nrm(nz), 0, air)]);
  const E = L.toFn(env || [[0, 0], [0.04, 1], [dur * 0.6, 0.7], [dur, 0]]);
  return L.automate(b, (t) => Math.max(0, E(t)));
}

// ------------------------------------------------------------------------------------------------ the lightning kit
/**
 * The split of a close stroke (霹): one big N-wave (the return stroke's shock) with a smaller echo a millisecond on, then
 * a tearing train of `n` small N-waves over `spread` s (branches arriving one after another), each 0.15-1.6 ms long
 * (shorter = brighter), random polarity, decaying.
 */
function crack(dur, { n = 26, spread = 0.09, big = 2.2, seed = 'ck', hp = 140, tear = 0.55 } = {}) {
  const r = L.rng(L.hashSeed(seed)), N = Math.round(dur * SR), o = new Float32Array(N);
  const put = (t0, ms, a) => { const len = Math.max(3, Math.round(ms / 1000 * SR)), i0 = Math.round(t0 * SR); for (let i = 0; i < len && i0 + i < N; i++) o[i0 + i] += a * (1 - 2 * i / (len - 1)); };
  put(0, big, 1);
  put(big / 1000 * 0.7, big * 0.5, -0.55);
  for (let k = 0; k < n; k++) {
    const t = spread * r.next() ** 1.7;
    put(t, 0.15 + 1.45 * r.next() ** 2, r.sign() * tear * (0.25 + 0.75 * r.next()) * Math.exp(-2.2 * t / spread));
  }
  return nrm(L.eq(new L.Buf([o], SR), [{ type: 'hp', f: hp, order: 2 }, { type: 'lp', f: 15000, order: 2 }, { type: 'peak', f: 3000, gain: 2, q: 0.8 }]));
}
/** The tearing hiss under the split: dense crackle under a fast decay. */
function rip(dur, { density = 1400, hp = 1500, t = 0.05, seed = 'rp' } = {}) {
  const c = L.crackle(dur, { density, decay: 0.0008, hp, minAmp: 0.1, seed });
  return nrm(L.automate(c, (x) => Math.min(1, x / 0.002) * Math.exp(-x / t)));
}
/** The boom: a falling 40-100 Hz thump and a burst of dark brown noise, tube-saturated (phones hear the harmonics). */
function boom({ f0 = 92, f1 = 36, sweep = 0.05, decay = 0.6, dur, seed = 'bm', drive = 4 } = {}) {
  dur = dur ?? decay * 1.2 + 0.05;
  const th = L.thump({ f0, f1, sweep, decay, dur, click: 0, drive: 1.5, seed });
  const body = L.applyEnv(L.eq(L.noise(dur, { color: 'brown', seed: seed + 'n' }), [{ type: 'lp', f: 260, order: 2 }, { type: 'hp', f: 30, order: 2 }]), L.expEnv(dur, { attack: 0.006, t60: decay * 0.8 }));
  return nrm(L.saturate(L.mix([at(nrm(th)), at(nrm(body), 0, -4)]), { drive, type: 'tube', mix: 0.45 }));
}
/**
 * Rolling thunder: brown noise under a darkening low-pass, swelling in `peaks` random rolls that die away (each stretch
 * of the channel heard later and farther), with a slow flutter.
 */
function rumble(dur, { peaks = 4, lp0 = 900, lp1 = 160, seed = 'rb', first = 0.02, spanEnd = 0.65 } = {}) {
  const r = L.rng(L.hashSeed(seed)), bumps = [];
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
/**
 * An arc (雷弧): a train of discharges whose interval jitters (`jit`) round 1/rate -- raspy, unstable -- each impulse rung
 * through two resonances (the plasma's whine), a low buzz body and a little air; flickering, sputtering (`drop`: share of
 * short dropouts). rate: Hz or fn(t). Peak-normalised mono.
 */
function arc(dur, { rate = 180, jit = 0.4, res = [2400, 5600], q = [4, 3], body = -6, air = -9, flick = 0.5, drop = 0.08, seed = 'arc' } = {}) {
  const r = L.rng(L.hashSeed(seed)), N = Math.round(dur * SR), o = new Float32Array(N), Rt = L.toFn(rate), w = wobble(seed + 'w', [4.3, 11.1, 23.7]);
  let t = 0, off = false, offT = 0;
  while (t < dur) {
    const i = Math.round(t * SR);
    if (t >= offT) { off = r.chance(drop); offT = t + (off ? r.range(0.008, 0.03) : r.range(0.02, 0.12)); }
    if (!off && i < N) o[i] += (0.55 + 0.45 * r.next()) * (r.chance(0.85) ? 1 : -1);
    t += (1 / Math.max(5, Rt(t))) * (1 + jit * (r.next() * 2 - 1));
  }
  const imp = new L.Buf([o], SR);
  const a = L.eq(imp, [{ type: 'bp', f: res[0], q: q[0] }]), b = L.eq(imp, [{ type: 'bp', f: res[1], q: q[1] }]);
  const lo = L.eq(imp, [{ type: 'lp', f: 900, order: 2 }, { type: 'hp', f: 70, order: 2 }]);
  const hi = L.eq(imp, [{ type: 'hp', f: 7000, order: 2 }]);
  const m = L.mix([at(nrm(a)), at(nrm(b), 0, -3), at(nrm(lo), 0, body), at(nrm(hi), 0, air)]);
  return nrm(L.automate(m, (tt) => Math.max(0, 1 - flick + flick * Math.abs(w(tt)))));
}
/** Spark shower: very dense, very short ticks above 3.5 kHz. */
const sizzle = (dur, { density = 2200, hp = 3500, seed = 'sz', decay = 0.0007 } = {}) => nrm(L.crackle(dur, { density, decay, hp, minAmp: 0.05, seed }));
/** Recorded sizzle (an acid burn, 168 s: any stretch) high-passed into the plasma's hiss. */
const recSizzle = async (t0, dur, hp = 3000) => src(S.sizzle, t0, t0 + dur, { hp });
/**
 * A Shepard-Risset glissando: `oct` sine partials an octave apart sliding up an octave every T s under a fixed window on
 * log-frequency -- a hum that rises for ever. Each partial's phase is a function of its frequency alone (phi = 2 pi T f /
 * ln 2), so after T every partial sits exactly where its upper neighbour started: the sum is periodic in T.
 */
function shepard(dur, { f0 = 55, T = 3.2, oct = 7, centre = 3.2, width = 1.3 } = {}) {
  const N = Math.round(dur * SR), o = new Float32Array(N), K2 = T / Math.LN2;
  for (let k = 0; k < oct; k++) for (let i = 0; i < N; i++) {
    const t = i / SR, u = (k + t / T) % oct, f = f0 * 2 ** u;
    const a = Math.exp(-(((u - centre) / width) ** 2)) * Math.sin(Math.PI * u / oct) ** 2;
    o[i] += a * Math.sin(2 * Math.PI * ((K2 * f) % 1e6));
  }
  return nrm(new L.Buf([o], SR));
}
/** The rising charge tone (§1.12 蓄力: pitch 0.8 -> 1.25): a saw + sine on f, driven, low-passed. */
function charge(dur, f, { lp = 2600, curve = 1.5, seed = 'chg' } = {}) {
  const F = (t) => f * (0.8 + 0.45 * (t / dur) ** curve);
  const b = L.saturate(L.mix([at(L.tone(dur, { type: 'saw', freq: F })), at(L.tone(dur, { type: 'sine', freq: (t) => 2 * F(t) }), 0, -4)]), { drive: 6, type: 'tube' });
  return nrm(L.eq(b, [{ type: 'lp', f: lp, order: 2 }, { type: 'hp', f: f * 0.5, order: 2 }]));
}
/** Parallel crush under the open mix (density without losing the transient). */
function thicken(m, { pre = 0.004, crush = 0.42 } = {}) {
  const c = L.slice(L.compress(L.pad(nrm(m, 0), pre, 0), { threshold: -26, ratio: 5, attack: 0.0008, release: 0.02, knee: 6, makeup: 14, lookahead: 0.002 }), pre);
  return L.mix([{ buf: nrm(m, 0), gainLin: 0.75 }, { buf: c, gainLin: crush }]);
}

/**
 * A full lightning strike: the split + rip on top, the boom, a recorded blast for the body, the roll (a recorded rolling
 * explosion slowed and darkened + a synthesized rumble), debris, a spark sizzle. Mono, `len` s.
 */
async function strike(k, { len = 1.7, seed = 'sk', big = 2.6, blast = S.expl, blast0 = 0, blastGain = -4, roll = -5, debris = -14, sub = 0, boomF = [95, 36], spread = 0.11 } = {}) {
  const r = ctx.rng(`${seed}${k}`), sd = `${seed}${k}`;
  const ck = crack(0.45, { n: 40, spread, big: big + r.range(0, 0.6), seed: sd + 'c' });
  const rp = rip(0.35, { density: 1500, t: 0.07, seed: sd + 'r' });
  const bm = boom({ f0: boomF[0] * (1 + r.range(-0.05, 0.05)), f1: boomF[1], decay: 0.7, seed: sd + 'b' });
  const bl = await src(blast, blast0, blast0 + len, { hp: 40, semis: r.range(-2, 0) });
  const rl = L.lp(await src(S.roll, 0.0, 3.0, { hp: 35, rate: 0.82 + r.range(-0.04, 0.04) }), 1600);
  const rb = rumble(len, { peaks: 3, lp0: 800, lp1: 170, seed: sd + 'u' });
  const db = await src(k % 2 ? S.rubble : S.rubble2, 0, 0.6, { hp: 150 });
  const sz = L.automate(sizzle(0.6, { density: 1600, seed: sd + 's' }), (t) => Math.exp(-t / 0.15));
  return L.mix([at(ck, 0, 0), at(rp, 0.002, -6), at(bm, 0.003, sub), at(bl, 0.004, blastGain), at(L.automate(rl, (t) => Math.min(1, t / 0.05)), 0.03, roll), at(rb, 0.02, roll - 1),
    at(db, 0.03, debris), at(sz, 0.01, -14)], { length: len });
}

// ------------------------------------------------------------------------------------------------ 雷矢
/**
 * One 雷矢 cast: the split (a small N-wave cluster), the 嗞 (a 0.18 s discharge falling 520 -> 270 Hz), sparks, the dart
 * pulling away (a band falling 6 -> 1.3 kHz), the 輕雷響 (a thump + a short low roll), the theme ~13 dB down: a jade ping
 * on the high pentatonic (any run of casts is in key) + the 30 ms luxury tick.
 */
function bolt(k, { len = 0.34, seed = 'bt' } = {}) {
  const r = ctx.rng(`${seed}${k}`), sd = `${seed}${k}`, j = 1 + r.range(-0.03, 0.03);
  const ck = crack(0.1, { n: 12, spread: 0.03, big: 0.8 + r.range(0, 0.5), seed: sd + 'c', hp: 350, tear: 0.5 });
  const zz = L.automate(arc(0.18, { rate: (t) => (520 - 1400 * t) * j, jit: 0.45, res: [3000 * j, 6400 * j], q: [5, 3], body: -8, flick: 0.3, drop: 0, seed: sd + 'a' }),
    (t) => Math.min(1, t / 0.002) * Math.exp(-t / 0.05));
  const sz = L.automate(sizzle(0.25, { density: 2400, seed: sd + 's' }), (t) => Math.exp(-t / 0.06));
  const fly = L.applyEnv(L.sweep(L.noise(0.22, { color: 'pink', seed: sd + 'f' }), 'bp', (t) => 6000 * (1300 / 6000) ** (t / 0.22), { q: 2 }), L.envCurve(0.22, [[0, 0], [0.01, 1], [0.22, 0]]));
  const th = L.thump({ f0: 150, f1: 55, sweep: 0.022, decay: 0.15, click: 0, drive: 3, seed: sd + 't' });
  const rl = L.automate(L.eq(L.noise(len, { color: 'brown', seed: sd + 'r' }), [{ type: 'lp', f: 380, order: 2 }, { type: 'hp', f: 45, order: 2 }]), (t) => Math.min(1, t / 0.015) * Math.exp(-t / 0.085));
  const ping = bell(PENTA[[13, 14, 15, 12, 13, 15][k % 6]] * j, { kind: 'jade', t60: 0.22, seed: sd + 'b', strike: -10 });
  let m = L.mix([at(ck, 0, 0), at(zz, 0.0015, -4), at(sz, 0.003, -15), at(nrm(fly), 0.002, -11), at(nrm(th), 0.001, -3), at(nrm(rl), 0.002, -9),
    at(nrm(ping), 0.002, -13), at(nrm(lux(sd + 'x', 7200 + (k % 3) * 600)), 0.001, -13)], { length: len });
  m = L.psychoBass(thicken(m), { freq: 110, amount: -8 });
  m = L.automate(m, (t) => (t < len * 0.3 ? 1 : Math.pow(1 - (t - len * 0.3) / (len * 0.7), 1.8)));
  return L.pad(shape(m, 'zap', 0.6), 0.002, 0);
}

async function boltSet(add, SP, LOC) {
  const bolts = [];
  for (let k = 0; k < 6; k++) bolts.push(dense(L.stereoize(bolt(k), { width: 0.3, hp: 500, seed: `bts${k}` }), -13));
  await add('staff_bolt', bolts, LOC({ lufs: -13, channels: 2, vol: 1.3, voices: 5, pitch: [0.98, 1.02], priority: 3, note: 'local 雷矢 (code: vol 0.55, pitch 0.94-1.06, 400 rpm)' }));

  // def.sound contract: teammates' casts (positional), the street's reflections, the far crack and roll
  const closes = [], tails = [], fars = [];
  for (let k = 0; k < 4; k++) closes.push(dense(bolt(k + 6, { seed: 'cl' }), -14));
  for (let k = 0; k < 2; k++) {
    const head = L.toMono(bolt(k + 10, { seed: 'tl', len: 0.3 }));
    const tl = L.gunTail(head, { env: 'urban', length: 1.4, head: 0.1, seed: `tl${k}`, darken: 30, hp: 120 });
    const rb = L.stereoize(rumble(1.4, { peaks: 2, lp0: 500, lp1: 140, seed: `tlr${k}` }), { width: 0.5, hp: 80, seed: `tlrs${k}` });
    tails.push(K.trimEnd(L.fadeOut(L.mix([at(tl), at(rb, 0.06, -12)], { channels: 2 }), 0.5, 'exp')));
    const far = L.farLayer(L.slice(head, 0, 0.25), { distance: 110, env: 'urban', seed: `fr${k}`, length: 1.4 });
    const frb = L.airAbsorption(rumble(1.4, { peaks: 2, lp0: 400, lp1: 120, seed: `frr${k}` }), 200);
    fars.push(L.pad(K.trimEnd(L.fadeOut(L.mix([at(far), at(frb, 0.04, -8)]), 0.5, 'exp')), 0.005, 0));
  }
  {
    const head = L.toMono(bolt(14, { seed: 'fl', len: 0.3 }));
    fars.push(L.pad(K.trimEnd(L.fadeOut(L.farLayer(L.slice(head, 0, 0.25), { distance: 90, env: 'urban', seed: 'fr2', length: 1.3 }), 0.5, 'exp')), 0.005, 0));
  }
  await add('staff_close', closes, SP([12, 70], { lufs: -14, voices: 4, pitch: [0.97, 1.03], priority: 2, note: 'teammates\' 雷矢 (remote.js: < 40 m)' }));
  await add('staff_tail', tails, LOC({ target: 'gunTail', channels: 2, voices: 2, pitch: [0.98, 1.02], note: 'def.sound contract (the staff\'s own trigger never plays it)' }));
  await add('staff_far', fars, SP([40, 320], { target: 'gunFar', voices: 3, pitch: [0.95, 1.04] }));
}

// ------------------------------------------------------------------------------------------------ hits, marks, kill
async function hitSet(add, SP, LOC) {
  // 雷矢 into a body (positional, once per frame of hits): the electric 「啪」 (a snap + a 0.09 s discharge diving
  // 1.1 kHz -> 470 Hz), the meat taking it (a wet hit + a thump), a burn sizzling off
  const hits = [];
  for (let k = 0; k < 5; k++) {
    const r = ctx.rng(`ht${k}`), sd = `ht${k}`, j = 1 + r.range(-0.04, 0.04);
    const ck = crack(0.06, { n: 6, spread: 0.012, big: 1.0 + r.range(0, 0.6), seed: sd + 'c', hp: 300 });
    const zap = L.automate(arc(0.09, { rate: (t) => (1100 - 7000 * t) * j, jit: 0.35, res: [2600 * j, 5600 * j], q: [6, 4], body: -10, flick: 0.2, drop: 0, seed: sd + 'a' }), (t) => Math.exp(-t / 0.025));
    const wet = await grab(S.wet, 0, 0.5, { mode: 'peak', pre: 0.002, post: 0.12, hp: 120, semis: -2 + r.range(-1, 1) });
    const th = L.thump({ f0: 190, f1: 70, sweep: 0.015, decay: 0.09, click: 0, drive: 3, seed: sd + 't' });
    const burn = L.automate(sizzle(0.3, { density: 1800, seed: sd + 's' }), (t) => Math.min(1, t / 0.01) * Math.exp(-t / 0.08));
    let m = L.mix([at(ck, 0, 0), at(zap, 0.001, -4), at(wet, 0.002, -6), at(nrm(th), 0.001, -5), at(burn, 0.01, -15)], { length: 0.32 });
    m = shape(L.psychoBass(m, { freq: 120, amount: -9 }), 'hit', 0.6);
    hits.push(L.pad(dense(L.fadeOut(m, 0.1, 'exp'), -16), 0.002, 0));
  }
  await add('staff_bolt_hit', hits, SP([10, 80], { lufs: -16, vol: 1.3, voices: 6, pitch: [0.94, 1.06] }));

  // 雷印 (one more seal on a target; SND.mark, not played yet): a seal pressed -- a soft stone tick, a jade ping, a tiny arc
  const marks = [];
  for (let k = 0; k < 2; k++) {
    const p = bell(PENTA[11 + k], { kind: 'jade', t60: 0.3, seed: `mk${k}`, strike: -8 });
    const tk = L.thump({ f0: 520, f1: 260, sweep: 0.006, decay: 0.03, click: 0.3, seed: `mkt${k}` });
    const z = L.automate(arc(0.05, { rate: 900, jit: 0.3, res: [3600, 7200], flick: 0, drop: 0, seed: `mka${k}` }), (t) => Math.exp(-t / 0.012));
    marks.push(L.pad(L.fadeOut(L.mix([at(nrm(tk), 0, -4), at(p, 0.002, 0), at(z, 0, -12)], { length: 0.4 }), 0.15, 'exp'), 0.002, 0));
  }
  await add('staff_mark', marks, LOC({ lufs: -22, channels: 1, voices: 3, pitch: [0.98, 1.02] }));

  // 雷印 full (3 seals) 「叮」: a small gold bell + a jade an octave up + a bright electric "tsing"; the code plays it at
  // pitch 1.3, so it is rendered 1/1.3 low and lands on A6
  const fulls = [];
  for (let k = 0; k < 2; k++) {
    const f = PENTA[13] / 1.3 * (1 + k * 0.003);
    const b = L.mix([at(bell(f, { kind: 'tiny', t60: 0.8, seed: `mf${k}`, strike: -10 })), at(bell(f * 2, { kind: 'jade', t60: 0.5, seed: `mfj${k}`, strike: -14 }), 0.002, -7)]);
    const ts = L.automate(arc(0.12, { rate: 1400, jit: 0.25, res: [5200, 8800], q: [6, 4], body: -20, flick: 0.2, drop: 0, seed: `mfa${k}` }), (t) => Math.exp(-t / 0.03));
    fulls.push(L.pad(L.fadeOut(L.mix([at(nrm(b)), at(ts, 0, -12)], { length: 1.0 }), 0.35, 'exp'), 0.002, 0));
  }
  await add('staff_mark_full', fulls, LOC({ lufs: -16, channels: 1, vol: 1.3, voices: 2, pitch: [1, 1], note: 'rendered at A6 / 1.3 (code: pitch 1.3, vol 0.4)' }));

  // the kill 「霹」 (2D, vol 0.6-0.9): the split of a close stroke and a tree's crack under it, the boom, a short roll,
  // and the sting: a bronze D6 with a jade A6 over it, sparks
  const kills = [];
  for (let k = 0; k < 3; k++) {
    const r = ctx.rng(`kl${k}`), sd = `kl${k}`;
    const ck = crack(0.3, { n: 30, spread: 0.07, big: 2.0 + r.range(0, 0.5), seed: sd + 'c', hp: 160 });
    const rp = rip(0.2, { density: 1500, t: 0.045, seed: sd + 'r' });
    const wood = await grab(k % 2 ? S.woodA : S.woodB, 0, 0.9, { mode: 'peak', pre: 0.003, post: 0.3, semis: -3 - k, hp: 200 });
    const bm = boom({ f0: 110, f1: 42, sweep: 0.03, decay: 0.35, seed: sd + 'b' });
    const rb = rumble(1.0, { peaks: 2, lp0: 700, lp1: 180, seed: sd + 'u' });
    const sting = L.mix([at(bell(PENTA[10], { kind: 'bronze', t60: 0.9, seed: sd + 'g', strike: -10 })), at(bell(PENTA[13], { kind: 'jade', t60: 0.6, seed: sd + 'j', strike: -14 }), 0.008, -6)]);
    const sz = L.automate(sizzle(0.5, { density: 1500, seed: sd + 's' }), (t) => Math.exp(-t / 0.12));
    let m = L.mix([at(ck, 0, 0), at(rp, 0.002, -8), at(wood, 0.001, -8), at(bm, 0.002, -3), at(rb, 0.03, -9), at(nrm(sting), 0.004, -9), at(sz, 0.01, -16)], { length: 1.0 });
    m = shape(L.psychoBass(thicken(m), { freq: 110, amount: -7 }), 'hit', 0.55);
    m = L.reverb(m, 'urban', { wet: 0.12, seed: sd + 'v', length: 1.0 });
    kills.push(L.pad(dense(L.fadeOut(L.slice(L.stereoize(m, { width: 0.35, hp: 400, seed: sd + 'w' }), 0, 1.0), 0.4, 'exp'), -16), 0.002, 0));
  }
  await add('staff_kill', kills, LOC({ lufs: -16, channels: 2, voices: 3, pitch: [0.98, 1.02], priority: 3 }));
}

// ------------------------------------------------------------------------------------------------ 連霆 / 雷爆
async function chainSet(add, SP) {
  // the arc lighting (vol 0.8; local 2D, teammates positional): the 劈 of a stroke, the rip, a small boom, the arc
  // swelling up 140 -> 290 Hz, sparks, a bronze D5 under it (the weapon's voice)
  const starts = [];
  for (let k = 0; k < 3; k++) {
    const r = ctx.rng(`cs${k}`), sd = `cs${k}`;
    const ck = crack(0.3, { n: 34, spread: 0.08, big: 2.2 + r.range(0, 0.5), seed: sd + 'c' });
    const rp = rip(0.25, { density: 1500, t: 0.06, seed: sd + 'r' });
    const bm = boom({ f0: 120, f1: 45, sweep: 0.03, decay: 0.25, seed: sd + 'b' });
    // the arc swells in under the split (the crack and boom read first), holds, then hands over to the loop
    const ig = L.fadeOut(L.automate(arc(0.8, { rate: (t) => 140 + 250 * t, jit: 0.45, res: [2300, 5200], body: -4, flick: 0.3, drop: 0.03, seed: sd + 'a' }),
      (t) => Math.min(1, t / 0.08) ** 1.5 * (t < 0.3 ? 1 : Math.exp(-(t - 0.3) / 0.12))), 0.25, 'sine');
    const sz = L.automate(await recSizzle(20 + k * 7, 0.6), (t) => Math.min(1, t / 0.02) * Math.exp(-t / 0.25));
    const g = bell(D4 * 2, { kind: 'bronze', t60: 0.7, seed: sd + 'g', strike: -12 });
    let m = L.mix([at(ck, 0, 0), at(rp, 0.002, -7), at(bm, 0.002, -4), at(ig, 0.01, -6), at(sz, 0.01, -12), at(g, 0.004, -14)], { length: 0.8 });
    m = shape(L.psychoBass(thicken(m), { freq: 110, amount: -8 }), 'zap', 0.55);
    starts.push(L.pad(dense(L.fadeOut(m, 0.2, 'exp'), -15), 0.002, 0));
  }
  await add('staff_chain_start', starts, SP([10, 80], { lufs: -15, voices: 3, pitch: [0.97, 1.03], priority: 3 }));

  // 連霆 channel (loop 3.2 s, positional for teammates): 劈啪 -- a 150 Hz arc with a 520 Hz thin one over it, sputtering,
  // random snaps, recorded sizzle -- and the 上升嗡鳴: a Shepard hum rising an octave per loop for ever (periodic in P,
  // see shepard()), tube-driven so the arc's buzz rides in it
  {
    const P = 3.2, X = 0.4, D = P + X, W = 0.5;
    const a1 = arc(D, { rate: (t) => 150 * (1 + 0.08 * Math.sin(6.283 * 0.9 * t)), jit: 0.35, res: [2200, 5000], body: -4, flick: 0.35, drop: 0.04, seed: 'cl1' });
    const a2 = arc(D, { rate: 520, jit: 0.6, res: [3800, 7600], body: -14, flick: 0.6, drop: 0.12, seed: 'cl2' });
    const cr = L.crackle(D, { density: 60, decay: 0.003, hp: 1800, seed: 'clc' });
    // 劈啪: 16 snaps, some in quick pairs (a discharge re-striking down the same channel)
    const r = ctx.rng('clsn'), snaps = [];
    for (let i = 0; i < 16; i++) {
      const t0 = r.range(0.05, D - 0.12), g = -5 - r.next() * 8;
      snaps.push(at(crack(0.08, { n: 8, spread: 0.02, big: 0.6 + r.next() * 0.9, seed: `cls${i}`, hp: 400 }), t0, g));
      if (r.chance(0.35)) snaps.push(at(crack(0.06, { n: 5, spread: 0.015, big: 0.5, seed: `clt${i}`, hp: 500 }), t0 + r.range(0.03, 0.07), g - 4));
    }
    const sz = await recSizzle(60, D, 3200);
    const fire = await src(S.crackle, 6, 6 + D, { hp: 2500 });
    const noisy = L.mix([at(a1, 0, 0), at(a2, 0, -8), at(nrm(cr), 0, -9), ...snaps, at(sz, 0, -16), at(fire, 0, -14)], { length: D });
    // tonal: the Shepard hum + the channel's weight (a D2 saw drone with an A2, its level flickering periodically)
    const sh = L.saturate(shepard(W + P, { f0: 55, T: P, oct: 7, centre: 3.3, width: 1.3 }), { drive: 5, type: 'tube', mix: 0.6 });
    const fl = pRand(P, 10, 'cldf');
    const drone = L.automate(L.eq(L.saturate(L.mix([at(L.tone(W + P, { type: 'saw', freq: onGrid(D2, P) })), at(L.tone(W + P, { type: 'saw', freq: onGrid(A2, P) }), 0, -7)]), { drive: 5, type: 'tube' }),
      [{ type: 'lp', f: 700, order: 2 }, { type: 'hp', f: 45, order: 2 }]), (t) => 0.75 + 0.25 * fl(t - W));
    const tonal = L.mix([at(L.gain(nrm(L.eq(sh, [{ type: 'hp', f: 70, order: 2 }])), -3)), at(nrm(drone), 0, -6)]);
    let m = seamless(P, X, noisy, L.gain(nrm(tonal), -6), W);
    m = L.psychoBass(m, { freq: 120, amount: -9 });
    seamCheck('staff_chain_loop', m);
    await add('staff_chain_loop', m, SP([8, 50], { lufs: -16, loop: true, voices: 2, pitch: [1, 1], note: 'held 連霆 (code: loop, vol 0.55)' }));
  }

  // the arc letting go: a last snap, the discharge falling 300 -> 30 Hz and sputtering out, the hum collapsing
  // (420 -> 90 Hz), sparks dying, a jade D6 (resolve)
  const ends = [];
  for (let k = 0; k < 2; k++) {
    const sd = `ce${k}`;
    const ck = crack(0.15, { n: 12, spread: 0.04, big: 1.6, seed: sd + 'c', hp: 300 });
    const fa = L.fadeOut(L.automate(arc(0.65, { rate: (t) => 300 * Math.max(0, 1 - t / 0.5) ** 1.5 + 30, jit: 0.5, res: [2000, 4800], body: -5, flick: 0.4, drop: 0.15, seed: sd + 'a' }), (t) => Math.exp(-t / 0.12)), 0.2, 'sine');
    const down = L.fadeOut(L.automate(L.saturate(L.tone(0.65, { type: 'saw', freq: (t) => 420 * (90 / 420) ** Math.min(1, t / 0.35) }), { drive: 5, type: 'tube' }), (t) => Math.min(1, t / 0.01) * Math.exp(-t / 0.11)), 0.25, 'sine');
    const sz = L.automate(sizzle(0.5, { density: 1400, seed: sd + 's' }), (t) => Math.exp(-t / 0.12));
    const p = bell(PENTA[10] * (1 + k * 0.004), { kind: 'jade', t60: 0.5, seed: sd + 'p', strike: -12 });
    const m = L.mix([at(ck, 0, 0), at(fa, 0.004, -3), at(L.lp(nrm(down), 2400), 0.003, -11), at(sz, 0.006, -13), at(p, 0.02, -15)], { length: 0.7 });
    ends.push(L.pad(dense(L.fadeOut(m, 0.25, 'exp'), -18), 0.002, 0));
  }
  await add('staff_chain_end', ends, SP([8, 60], { lufs: -18, voices: 2, pitch: [0.97, 1.03] }));

  // 雷爆 「轟啪」 (a 3-seal target bursts): a close stroke's split, a real blast, the boom and roll, the arc shell
  // crackling off it, debris, a bronze D4 (the weapon in the blast)
  const bursts = [];
  const blasts = [[S.grenade, 0], [S.medium, 0.2], [S.deep, 0]];
  for (let k = 0; k < 3; k++) {
    const [id, t0] = blasts[k], sd = `cb${k}`;
    const s = await strike(k, { seed: 'cb', len: 1.8, big: 2.8, blast: id, blast0: t0, blastGain: -3, roll: -6, spread: 0.1 });
    const shell = L.automate(arc(0.6, { rate: (t) => 260 - 280 * t, jit: 0.5, res: [2400, 5600], body: -6, flick: 0.5, drop: 0.08, seed: sd + 'a' }), (t) => Math.min(1, t / 0.01) * Math.exp(-t / 0.18));
    const g = bell(D4 * (1 + k * 0.003), { kind: 'bronze', t60: 1.4, seed: sd + 'g', strike: -10 });
    let m = L.mix([at(s), at(shell, 0.01, -8), at(g, 0.006, -13)], { length: 1.8 });
    m = shape(L.psychoBass(m, { freq: 100, amount: -5 }), 'big', 0.6);
    m = L.reverb(m, 'urban', { wet: 0.14, seed: sd + 'v', length: 1.4, channels: 1 });
    bursts.push(L.pad(dense(L.fadeOut(L.slice(m, 0, 1.8), 0.7, 'exp'), -14), 0.002, 0));
  }
  await add('staff_burst', bursts, SP([12, 160], { lufs: -14, voices: 3, pitch: [0.97, 1.03], priority: 3 }));
}

// ------------------------------------------------------------------------------------------------ 雷池
async function poolSet(add, SP) {
  // the cast (vol 0.8; the strike lands 0.3 s later as staff_pool_strike): 吸氣式電流聲 -- a reversed spark shower and a
  // discharge rising 60 -> 420 Hz into 0.3 s, a breath drawn in, a reversed split swelling; the palm slapping down at
  // 0.18 s (clip staff_cast_tap); cut on the strike with a short release
  const inhale = await src(S.breath, 0.88, 1.22, { hp: 300 });
  const slap = await src(S.slap, 0.0, 0.2, { hp: 300 });
  const casts = [];
  for (let k = 0; k < 2; k++) {
    const sd = `pc${k}`, T = 0.3;
    // the suck: a band of noise sweeping up 400 Hz -> 5.5 kHz as it swells (air drawn into the 雷珠), sparks gathering
    // (a reversed shower), the discharge climbing, a breath, a reversed split; one crescendo, cut on the strike
    const suck = L.sweep(L.noise(T + 0.02, { color: 'pink', seed: sd + 'k' }), 'bp', (t) => 400 * (5500 / 400) ** Math.min(1, t / T), { q: 1.3 });
    const rs = L.automate(L.reverse(sizzle(T, { density: 2000, seed: sd + 's' })), ramp(T, 3));
    const up = L.automate(arc(T + 0.02, { rate: (t) => 60 * (420 / 60) ** Math.min(1, t / T), jit: 0.4, res: [2000, 4800], body: -6, flick: 0.3, drop: 0, seed: sd + 'a' }), ramp(T, 1.6));
    const rc = L.reverse(L.reverb(crack(0.2, { n: 20, spread: 0.06, big: 1.6, seed: sd + 'c' }), 'urban', { wet: 0.6, seed: sd + 'r', length: 0.6, channels: 1 }));
    const rcs = L.automate(L.slice(rc, Math.max(0, rc.duration - T), rc.duration), ramp(T, 2));
    const palm = L.mix([at(slap), at(nrm(L.thump({ f0: 170, f1: 70, sweep: 0.01, decay: 0.08, click: 0.2, drive: 2, seed: sd + 't' })), 0, -4)]);
    let m = L.mix([at(nrm(suck), 0, -2), at(rs, 0, -5), at(up, 0, -6), at(L.fitLength(inhale, T), 0, -10), at(L.toMono(rcs), 0, -6)], { length: 0.45 });
    m = L.automate(m, (t) => (t < T ? 0.08 + 0.92 * (t / T) ** 1.8 : Math.exp(-(t - T) / 0.04)));
    m = L.mix([at(m), at(nrm(palm), 0.18, -9)]);
    casts.push(L.pad(L.fadeOut(m, 0.06, 'exp'), 0.003, 0));
  }
  await add('staff_pool_cast', casts, SP([8, 70], { lufs: -16, voices: 2, pitch: [0.98, 1.02], maxHeadMs: 30 }));

  // 雷鳴 (the opening stroke, vol 1, then one every 0.5 s at vol 0.7, pitch 0.95-1.05): a close strike -- split, rip,
  // boom, a real blast, the roll, debris, sparks -- in the street
  const strikes = [];
  const blasts = [[S.expl, 0, -4], [S.deep, 0, -5], [S.medium, 0.2, -4], [S.grenade, 0, -3]];
  for (let k = 0; k < 4; k++) {
    const [id, t0, g] = blasts[k];
    let m = await strike(k, { seed: 'ps', len: 1.6, big: 2.5, blast: id, blast0: t0, blastGain: g, roll: -5 });
    m = shape(L.psychoBass(m, { freq: 100, amount: -5 }), 'big', 0.6);
    m = L.reverb(m, 'urban', { wet: 0.15, seed: `psv${k}`, length: 1.4, channels: 1 });
    strikes.push(L.pad(dense(L.fadeOut(L.slice(m, 0, 1.6), 0.6, 'exp'), -14), 0.002, 0));
  }
  await add('staff_pool_strike', strikes, SP([15, 220], { lufs: -14, voices: 4, pitch: [0.97, 1.03], priority: 3 }));

  // the field (loop 4 s, positional): the electric fence's hum (D2 saw + A2 + D3 on the 1/4 Hz grid, its level wandering
  // periodically), sputtering ground arcs, snaps, sizzle, a low ground murmur
  {
    const P = 4.0, X = 0.4, D = P + X, W = 0.5;
    const fl = pRand(P, 12, 'plf');
    const pt = (f, type) => L.tone(W + P, { type, freq: onGrid(f, P) });
    const humT = L.eq(L.saturate(L.mix([at(pt(D2, 'saw')), at(pt(A2, 'saw'), 0, -8), at(pt(D3, 'square'), 0, -12)]), { drive: 4, type: 'tube' }), [{ type: 'lp', f: 900, order: 2 }, { type: 'hp', f: 50, order: 2 }]);
    const tonal = L.automate(nrm(humT), (t) => 0.7 + 0.3 * fl(t - W));
    const ga = arc(D, { rate: 110, jit: 0.5, res: [1800, 4200], body: -8, flick: 0.7, drop: 0.25, seed: 'pla' });
    const gb = arc(D, { rate: 340, jit: 0.6, res: [3300, 7000], body: -16, flick: 0.6, drop: 0.35, seed: 'plb' });
    const r = ctx.rng('plsn'), snaps = [];
    for (let i = 0; i < 7; i++) snaps.push(at(crack(0.08, { n: 7, spread: 0.02, big: 0.5 + r.next() * 0.8, seed: `pls${i}`, hp: 500 }), r.range(0.05, D - 0.1), -8 - r.next() * 6));
    const sz = await recSizzle(95, D, 3000);
    const gr = L.eq(L.noise(D, { color: 'brown', seed: 'plg' }), [{ type: 'lp', f: 200, order: 2 }, { type: 'hp', f: 35, order: 2 }]);
    const noisy = L.mix([at(ga, 0, -2), at(gb, 0, -9), ...snaps, at(sz, 0, -14), at(nrm(gr), 0, -16)], { length: D });
    let m = seamless(P, X, noisy, L.gain(tonal, -6), W);
    m = L.psychoBass(m, { freq: 110, amount: -8 });
    seamCheck('staff_pool_loop', m);
    await add('staff_pool_loop', m, SP([6, 45], { lufs: -19, loop: true, voices: 2, pitch: [1, 1] }));
  }

  // the fence throwing a zombie back 「啪」: a 0.14 s BZZT (650 Hz discharge), a snap, the body knocked back (a thump + a
  // gust of air falling away), sparks
  const repels = [];
  for (let k = 0; k < 3; k++) {
    const sd = `pr${k}`;
    const bz = L.automate(arc(0.16, { rate: 600 + k * 60, jit: 0.3, res: [2600, 6400], body: -6, flick: 0.2, drop: 0, seed: sd + 'a' }), (t) => (t < 0.09 ? Math.min(1, t / 0.003) : Math.exp(-(t - 0.09) / 0.02)));
    const ck = crack(0.1, { n: 8, spread: 0.02, big: 1.6, seed: sd + 'c', hp: 300 });
    const th = L.thump({ f0: 150, f1: 60, sweep: 0.015, decay: 0.12, click: 0, drive: 3, seed: sd + 't' });
    const sz = L.automate(sizzle(0.35, { density: 1600, seed: sd + 's' }), (t) => Math.exp(-t / 0.09));
    const gust = L.applyEnv(L.sweep(L.noise(0.3, { color: 'pink', seed: sd + 'w' }), 'bp', (t) => 1800 * (350 / 1800) ** (t / 0.3), { q: 1.4 }), L.envCurve(0.3, [[0, 0], [0.04, 1], [0.3, 0]]));
    let m = L.mix([at(bz, 0, 0), at(ck, 0, -2), at(nrm(th), 0.02, -4), at(nrm(gust), 0.03, -13), at(sz, 0.02, -13)], { length: 0.5 });
    m = shape(L.psychoBass(m, { freq: 120, amount: -9 }), 'zap', 0.5);
    repels.push(L.pad(dense(L.fadeOut(m, 0.15, 'exp'), -16), 0.002, 0));
  }
  await add('staff_pool_repel', repels, SP([6, 60], { lufs: -16, voices: 4, pitch: [0.95, 1.05] }));

  // the field closing: the ground arc falling 200 -> 20 Hz and sputtering out, the hum sliding D3 -> D2, last crackles,
  // a soft bronze D4 (a temple bell's sigh), the air settling
  const ends = [];
  for (let k = 0; k < 2; k++) {
    const sd = `pe${k}`;
    const fa = L.fadeOut(L.automate(arc(1.35, { rate: (t) => 200 * Math.max(0, 1 - t) ** 2 + 20, jit: 0.5, res: [1800, 4200], body: -5, flick: 0.5, drop: 0.2, seed: sd + 'a' }), (t) => Math.exp(-t / 0.3)), 0.4, 'sine');
    const sl = L.fadeOut(L.automate(L.eq(L.saturate(L.tone(1.35, { type: 'saw', freq: (t) => D3 * (D2 / D3) ** Math.min(1, t / 0.7) }), { drive: 4, type: 'tube' }), [{ type: 'lp', f: 800, order: 2 }]), (t) => Math.min(1, t / 0.02) * Math.exp(-t / 0.35)), 0.45, 'sine');
    const cr = L.fadeOut(L.automate(L.crackle(1.35, { density: 40, decay: 0.003, hp: 1800, seed: sd + 'c' }), (t) => Math.exp(-t / 0.3)), 0.3, 'sine');
    const g = bell(D4 * (1 + k * 0.004), { kind: 'bronze', t60: 1.6, seed: sd + 'g', strike: -22 });
    const air = L.applyEnv(L.sweep(L.noise(0.8, { color: 'pink', seed: sd + 'w' }), 'bp', (t) => 2000 * (300 / 2000) ** (t / 0.8), { q: 1 }), L.envCurve(0.8, [[0, 0], [0.1, 1], [0.8, 0]]));
    const m = L.mix([at(fa, 0, -2), at(nrm(sl), 0, -7), at(nrm(cr), 0, -12), at(g, 0.12, -10), at(nrm(air), 0, -15)], { length: 1.4 });
    ends.push(L.pad(L.fadeOut(m, 0.4, 'exp'), 0.003, 0));
  }
  await add('staff_pool_end', ends, SP([8, 70], { lufs: -19, voices: 2, pitch: [0.98, 1.02] }));
}

// ------------------------------------------------------------------------------------------------ 應龍．震霄
async function ultSet(add, SP) {
  // ① rise (0 -> 0.42 s): a cymbal roll's loud end, the gong's scrape, a breath drawn in, the arc and a tone rising 0.8 ->
  // 1.25 of D3 (§1.12), a reversed split swelling. ② 40-60 Hz impact (0.42 s): a 58 -> 40 Hz sub with tube harmonics, a
  // stroke's split, timpani (F2 -3 st = D2), bass drum, the hard gong. ③ bed: F horns on D3 / A3, the choir on D (F
  // -3 st), cello tremolo on D3 (the storm's tension), a bronze D3 / D4 pair, a thunder roll under it; swelling to 0.3 s
  // after the impact and fading by ~3.8 s, under the cloud (0.3 s), the dragon (0.7 s) and the dives
  const roll = await src(S.cymRoll, 5.6, 6.4, { hp: 400 });
  const scrape = await src(S.gongScrape, 0.07, 1.2, { hp: 200 });
  const inhale = await src(S.breath, 0.88, 1.22, { hp: 250 });
  const timp = await src(S.timpF2, 0.0, 3.0, { hp: 30, semis: -3 });
  const bd = await src(S.bdrum, 0.08, 2.5, { hp: 30 });
  const gongH = await src(S.gongHard, 0.09, 3.6, { hp: 50 });
  const hornD = L.fadeIn(await src(S.hornD3, 0.3, 3.6, { hp: 70 }), 0.25, 'sine');
  const hornA = L.fadeIn(await src(S.hornA3, 0.3, 3.6, { hp: 90 }), 0.3, 'sine');
  const choir = L.fadeIn(await src(S.choirA, 1.0, 4.4, { hp: 150, semis: -3 }), 0.4, 'sine');
  const trem = L.fadeIn(await src(S.celloTrem, 0.3, 3.8, { hp: 80 }), 0.2, 'sine');
  const subRoll = L.lp(await src(S.rollSub, 0.15, 4.0, { hp: 30 }), 900);
  const raises = [];
  for (let k = 0; k < 2; k++) {
    const D = 0.42, T = 3.9, sd = `ur${k}`;
    const rc = L.reverse(L.reverb(crack(0.3, { n: 30, spread: 0.08, big: 2, seed: sd + 'c' }), 'urban', { wet: 0.7, seed: sd + 'cr', length: 0.8, channels: 1 }));
    const rcs = L.slice(rc, rc.duration - D, rc.duration);
    const up = arc(D, { rate: (t) => 70 * (360 / 70) ** (t / D), jit: 0.4, res: [2000, 4800], body: -6, flick: 0.3, drop: 0, seed: sd + 'a' });
    const one = L.automate(L.mix([at(nrm(L.automate(L.slice(roll, 0, D), ramp(D, 2.2))), 0, -2), at(L.slice(scrape, 0.1 * k, 0.1 * k + D), 0, -8), at(L.fitLength(inhale, D), 0, -6),
      at(up, 0, -8), at(L.lp(charge(D, D3, { seed: sd + 'h' }), 2500), 0, -9), at(L.toMono(rcs), 0, -6)], { length: D + 0.02 }), (t) => 0.12 + 0.88 * Math.min(1, t / D) ** 2);
    const sub = L.saturate(L.thump({ f0: 58, f1: 40, sweep: 0.06, decay: 0.5, dur: 0.7, click: 0, drive: 1.5, seed: sd + 's' }), { drive: 3, type: 'tube', mix: 0.4 });
    const two = L.mix([at(nrm(sub), 0, 0), at(crack(0.3, { n: 30, spread: 0.09, big: 2.6, seed: sd + 'k' }), 0, -6), at(rip(0.25, { seed: sd + 'p' }), 0.002, -14),
      at(timp, 0, -3), at(bd, 0.003, -5), at(gongH, 0.01, -9)], { length: T - D });
    const bells = L.mix([at(bell(D3, { kind: 'bronze', t60: 3, seed: sd + 'b', strike: -12 })), at(bell(D4 * 1.002, { kind: 'bronze', t60: 2.4, seed: sd + 'b2', strike: -14 }), 0.04, -5)]);
    const bed = L.mix([at(hornD, 0, -2), at(hornA, 0.05, -5), at(choir, 0.15, -6), at(trem, 0, -9), at(nrm(bells), 0, -6)], { length: T - D });
    const bedE = L.automate(nrm(bed), (t) => (t < 0.3 ? t / 0.3 : t < 2.3 ? 1 : Math.max(0, 1 - (t - 2.3) / 1.1)) ** 1.2);
    const rb = L.mix([at(L.automate(subRoll, (t) => Math.exp(-t * 0.5))), at(rumble(T - D, { peaks: 4, lp0: 600, lp1: 150, seed: sd + 'u' }), 0, -2)]);
    let m = L.mix([at(one, 0, -8), at(nrm(two), D, 0), at(bedE, D, -13), at(nrm(rb), D + 0.02, -10)], { length: T });
    m = shape(L.psychoBass(m, { freq: 100, amount: -5 }), 'big', 0.5);
    m = space(m, { wet: 0.22, seed: sd + 'v', length: 2.4 });
    raises.push(dense(L.fadeOut(L.slice(m, 0, T), 0.9, 'exp'), -14, 1.5));
  }
  await add('staff_ult_raise', raises, SP([12, 220], { lufs: -14, vol: 0.85, voices: 2, pitch: [1, 1], priority: 4, maxHeadMs: 600 }));

  // 遠雷 (the storm cloud gathering, positional; also the inspect's far flash at vol 0.35): a distant mortar's roll slowed
  // to a thunder's length, a sub roll, a synthesized rumble with several rolls, wind swirling up, faint far splits
  const wind = await src(S.wind, 12, 16, { hp: 120 });
  const clouds = [];
  for (let k = 0; k < 2; k++) {
    const sd = `uc${k}`, T = 3.2;
    const rl = L.lp(await src(S.roll, 0.0, 4.0, { hp: 35, rate: 0.72 + k * 0.05 }), 1100);
    const sr = L.lp(await src(S.rollSub, 0.15 + k * 0.3, 4.5, { hp: 30 }), 700);
    const rb = rumble(T, { peaks: 5, lp0: 600, lp1: 140, seed: sd + 'u', first: 0.05, spanEnd: 0.75 });
    const sw = L.automate(L.sweep(L.slice(wind, k * 0.5, k * 0.5 + T), 'bp', (t) => 300 * 3 ** Math.sin(Math.PI * Math.min(1, t / T)), { q: 0.9 }), (t) => Math.min(1, t / 0.6) * Math.max(0, 1 - t / T) ** 0.7);
    const far = (i, t0) => at(L.airAbsorption(crack(0.2, { n: 14, spread: 0.06, big: 1.6, seed: `${sd}f${i}` }), 400), t0, -16);
    let m = L.mix([at(L.automate(rl, (t) => Math.min(1, t / 0.15))), at(sr, 0.05, -4), at(rb, 0, -3), at(nrm(sw), 0, -9), far(0, 0.9 + k * 0.2), far(1, 1.9 - k * 0.15)], { length: T });
    m = L.psychoBass(m, { freq: 90, amount: -5 });
    m = space(m, { wet: 0.25, seed: sd + 'v', length: 2.4 });
    clouds.push(L.pad(dense(L.fadeOut(L.slice(m, 0, T), 1.0, 'exp'), -16), 0.003, 0));
  }
  await add('staff_ult_cloud', clouds, SP([15, 260], { lufs: -16, voices: 2, pitch: [0.97, 1.03], note: 'the storm cloud (vol 0.9) and the inspect\'s far lightning (2D, vol 0.35)' }));

  // 龍吟 (the dragon dissolving out of the cloud at vol 1, and before each dive at vol 0.8, pitch 1.05-1.15): a tiger's
  // roar 5 st down through a bronze throat (a 6 ms comb), an F horn bellowing (rising then falling, a 34 Hz growl, tube),
  // a didgeridoo roar's drone, the sung 吟 (A5 -> D6 -> A5 with vibrato: the dragon's chant over the roar), sparks on its
  // body, a sub swell; in the open sky
  const tiger = await src(S.tiger, 0.95, 2.15, { hp: 80, semis: -5 });
  const didg = await src(S.didg, 0.1, 1.9, { hp: 60, semis: -3 });
  const horn = await src(S.hornD3, 0.25, 2.2, { hp: 70 });
  const roars = [];
  for (let k = 0; k < 2; k++) {
    const sd = `uo${k}`, T = 1.7;
    const throat = L.echo(tiger, { time: 0.006 + k * 0.0007, feedback: 0.55, lp: 5200, hp: 120, mix: 0.6, length: tiger.duration + 0.05 });
    const contour = k ? [[0, 0.82], [0.2, 1.08], [0.85, 1.0], [1.6, 0.78]] : [[0, 0.86], [0.25, 1.12], [0.9, 1.02], [1.6, 0.8]];
    const bel = L.saturate(L.automate(L.varispeedCurve(horn, contour), (t) => (1 - 0.45 * (0.5 + 0.5 * Math.sin(6.283 * 34 * t))) * Math.min(1, t / 0.08)), { drive: 8, type: 'tube', mix: 0.7 });
    const cry = keen(1.4, [[0, PENTA[8] * 0.97], [0.12, PENTA[8]], [0.45, PENTA[10]], [0.95, PENTA[10] * 1.01], [1.25, PENTA[8]], [1.4, PENTA[8] * 0.94]], { vib: 0.016, vibHz: 6.2, air: -6, seed: sd + 'k', env: [[0, 0], [0.08, 0.6], [0.45, 1], [1.0, 0.7], [1.4, 0]] });
    const zz = L.automate(arc(T, { rate: 240, jit: 0.6, res: [3000, 6800], body: -14, flick: 0.7, drop: 0.3, seed: sd + 'a' }), (t) => Math.min(1, t / 0.2) * Math.max(0, 1 - t / T));
    const sub = L.thump({ f0: 70, f1: 45, sweep: 0.15, decay: 0.9, dur: 1.2, click: 0, drive: 1, seed: sd + 's' });
    const env = (t) => Math.min(1, t / 0.05) * (t < 1.2 ? 1 : Math.max(0, 1 - (t - 1.2) / 0.5));
    let m = L.mix([at(nrm(throat), 0, 0), at(nrm(bel), 0.02, -4), at(L.automate(didg, env), 0.04, -9), at(nrm(cry), 0.12, -13), at(zz, 0.05, -17), at(nrm(sub), 0.03, -8)], { length: T });
    m = shape(L.psychoBass(m, { freq: 100, amount: -6 }), 'big', 0.5);
    m = space(m, { wet: 0.24, seed: sd + 'v', length: 2.2 });
    roars.push(L.pad(dense(L.fadeOut(L.slice(m, 0, T + 0.4), 0.5, 'exp'), -14), 0.003, 0));
  }
  await add('staff_ult_roar', roars, SP([20, 300], { lufs: -14, voices: 3, pitch: [0.98, 1.02], priority: 4 }));

  // 霹靂 (each dive's breath bolt striking the street, vol 1): a big close strike, the breath held 0.3 s as a fat arc,
  // falling debris, the roll
  const debris = await src(S.debris, 0.0, 1.6, { hp: 90 });
  const dives = [];
  const blasts = [[S.medium, 0.2, -3], [S.deep, 0, -3], [S.grenade, 0, -2]];
  for (let k = 0; k < 3; k++) {
    const [id, t0, g] = blasts[k], sd = `ud${k}`;
    const s = await strike(k + 4, { seed: 'ud', len: 1.8, big: 3.0, blast: id, blast0: t0, blastGain: g, roll: -5, spread: 0.12, boomF: [90, 34] });
    const br = L.automate(arc(0.4, { rate: 220, jit: 0.45, res: [2200, 5200], body: -4, flick: 0.4, drop: 0.05, seed: sd + 'a' }), (t) => (t < 0.3 ? 1 : Math.exp(-(t - 0.3) / 0.03)));
    let m = L.mix([at(s), at(br, 0, -8), at(debris, 0.08, -13)], { length: 1.8 });
    m = shape(L.psychoBass(m, { freq: 100, amount: -5 }), 'big', 0.6);
    m = L.reverb(m, 'urban', { wet: 0.16, seed: sd + 'v', length: 1.4, channels: 1 });
    dives.push(L.pad(dense(L.fadeOut(L.slice(m, 0, 1.8), 0.7, 'exp'), -13, 1), 0.002, 0));
  }
  await add('staff_ult_dive', dives, SP([15, 250], { lufs: -13, voices: 3, pitch: [0.96, 1.04], priority: 4 }));

  // the column (the dragon falling as one bolt, vol 1): the biggest split, a 60 -> 40 Hz boom with tube harmonics, a huge
  // blast's long crash and a deep one, the long roll (the mortar slowed, the sub roll, a 6-roll rumble), the hard gong, a
  // bronze D3 / D4 pair ringing long with a jade A5; the dragon scattering into gold scales (a cascade of small bells up
  // the pentatonic), then the deflate (洩氣: 3 kHz -> 400 Hz) and the last crackles
  const huge = await src(S.crash, 0.0, 3.4, { hp: 35 });
  const deep = await src(S.deep, 0.0, 2.0, { hp: 35 });
  const choirF = L.fadeIn(await src(S.choirO, 1.5, 4.5, { hp: 160, semis: -3 }), 0.15, 'sine');
  const finals = [];
  for (let k = 0; k < 2; k++) {
    const sd = `uf${k}`, T = 4.6;
    const ck = crack(0.5, { n: 60, spread: 0.15, big: 3.5, seed: sd + 'c' });
    const rp = rip(0.45, { density: 1800, t: 0.1, seed: sd + 'r' });
    const bm = L.saturate(L.thump({ f0: 60, f1: 40, sweep: 0.06, decay: 0.9, dur: 1.3, click: 0, drive: 1.5, seed: sd + 'b' }), { drive: 4, type: 'tube', mix: 0.45 });
    const rl = L.lp(await src(S.roll, 0.0, 5.0, { hp: 35, rate: 0.78 + k * 0.04 }), 1300);
    const sr = L.lp(await src(S.rollSub, 0.15, 5.0, { hp: 30 }), 800);
    const rb = rumble(4.2, { peaks: 6, lp0: 700, lp1: 130, seed: sd + 'u', first: 0.1, spanEnd: 0.6 });
    const bells = L.mix([at(bell(D3, { kind: 'bronze', t60: 3.4, seed: sd + 'g', strike: -10 })), at(bell(D4 * 1.002, { kind: 'bronze', t60: 2.6, seed: sd + 'g2', strike: -12 }), 0.03, -4),
      at(bell(PENTA[8], { kind: 'jade', t60: 1.8, seed: sd + 'j', strike: -14 }), 0.06, -9)]);
    const r = ctx.rng(sd + 'sc'), scales = [];
    for (let i = 0; i < 16; i++) scales.push(at(bell(PENTA[7 + Math.min(8, Math.floor(i / 2 + r.next() * 1.5))], { kind: 'tiny', t60: 0.35, seed: `${sd}s${i}`, strike: -14 }), 0.3 + i * 0.055 + r.range(0, 0.02), -4 - r.next() * 5));
    const deflate = L.applyEnv(L.sweep(L.noise(1.3, { color: 'pink', seed: sd + 'd' }), 'bp', (t) => 3000 * (400 / 3000) ** (t / 1.3), { q: 1.2 }), L.envCurve(1.3, [[0, 0], [0.08, 1], [0.6, 0.5], [1.3, 0]]));
    const embers = L.automate(L.crackle(2.6, { density: 30, decay: 0.003, hp: 1800, seed: sd + 'e' }), (t) => Math.min(1, t / 0.3) * Math.exp(-t * 0.9));
    let m = L.mix([at(ck, 0, 0), at(rp, 0.002, -5), at(nrm(bm), 0.002, 0), at(L.automate(huge, (t) => (t < 0.25 ? 1 : Math.exp(-(t - 0.25) * 1.4))), 0.004, -4),
      at(L.automate(deep, (t) => (t < 0.2 ? 1 : Math.exp(-(t - 0.2) * 2))), 0.004, -6), at(gongH, 0.01, -9), at(L.automate(rl, (t) => Math.min(1, t / 0.08)), 0.05, -5), at(sr, 0.04, -7), at(rb, 0.06, -6),
      at(nrm(bells), 0.02, -7), at(nrm(L.mix(scales)), 0, -15), at(choirF, 0.2, -18), at(nrm(deflate), 1.6, -13), at(nrm(embers), 1.4, -19)], { length: T });
    m = shape(L.psychoBass(m, { freq: 100, amount: -4 }), 'big', 0.6);
    m = space(m, { wet: 0.26, seed: sd + 'v', length: 2.6 });
    finals.push(L.pad(dense(L.fadeOut(L.slice(m, 0, T), 1.3, 'exp'), -12, 1.5), 0.002, 0));
  }
  await add('staff_ult_final', finals, SP([20, 350], { lufs: -12, voices: 2, pitch: [0.99, 1.01], priority: 5 }));

  // 甘霖 (loop 5 s, positional, for the 5 s of healing rain): light rain pattering + a steady hiss of heavier rain, a
  // bronze D3 bell struck once (0.3 s in: the loop plays about once) with jade chimes A5 / D6 / F#6 drifting down after
  // it, a breath of wind. The bell and chimes are laid in circularly (wrap): their tails ring across the seam.
  {
    const P = 5.0, X = 0.5, D = P + X;
    const pat = await src(S.rainPat, 30, 30 + D, { hp: 180 });
    const hiss = await src(S.rainHiss, 8, 8 + D, { hp: 400, lp: 9000 });
    const wd = L.automate(L.slice(wind, 0, D), (t) => 0.6 + 0.4 * Math.sin(6.283 * t / P));
    const noisy = L.mix([at(pat, 0, 0), at(hiss, 0, -7), at(L.lp(wd, 700), 0, -18)], { length: D });
    const ring1 = L.mix([at(bell(D3, { kind: 'bronze', t60: 3.4, seed: 'rnb', strike: -16 }), 0.3, 0), at(bell(D4, { kind: 'bowl', t60: 2.4, seed: 'rnw', strike: -24 }), 0.32, -10),
      at(bell(PENTA[8], { kind: 'jade', t60: 1.2, seed: 'rn1', strike: -16 }), 1.7, -10), at(bell(PENTA[10], { kind: 'jade', t60: 1.2, seed: 'rn2', strike: -16 }), 2.6, -12),
      at(bell(PENTA[12], { kind: 'jade', t60: 1.0, seed: 'rn3', strike: -16 }), 3.7, -13)], { length: P + 4 });
    const ring = wrap(L.convolve(ring1, L.makeIR(HALL, { seed: 'rnv', channels: 1, length: 1.5 }), { wet: 0.25, dry: 1 }), P);
    const out = L.mix([at(seamless(P, X, noisy, null)), at(L.gain(nrm(ring), -1))], { length: P });
    seamCheck('staff_ult_rain', out);
    await add('staff_ult_rain', out, SP([8, 60], { lufs: -20, loop: true, voices: 2, pitch: [1, 1] }));
  }
}

// ------------------------------------------------------------------------------------------------ ready (unique per §1.12)
async function readySet(add) {
  // 就緒: a 磬 chime stone struck on D5 (stone, not metal: no other ready in the game is a stone) over a bronze D4
  // bowl's hum, then the 雷和弦: D5 F#5 A5 D6 rising fast as electric bells (FM with a crackle on each onset), panned
  // left to right; a soft roll of thunder under it, a spark sparkle; in the bronze hall
  const make = (k) => {
    const qing = bell(PENTA[5], { kind: 'qing', t60: 2.0, seed: `rq${k}`, strike: -8, beat: 0.0012 });
    const bowl = hum(D4, 2.2, { kind: 'bowl', attack: 0.05, t60: 2.0, seed: `rbw${k}` });
    const chord = [5, 7, 8, 10].map((n, i) => {
      const f = PENTA[n] * (1 + k * 0.002);
      const fmTone = L.applyEnv(L.fm(1.4, { carrier: f, ratio: 3.5, index: 2.2, indexDecay: 0.18 }), L.expEnv(1.4, { attack: 0.002, t60: 1.2 }));
      const zap = L.automate(arc(0.05, { rate: 1100, jit: 0.3, res: [4200, 8200], body: -20, flick: 0, drop: 0, seed: `rz${k}${i}` }), (t) => Math.exp(-t / 0.012));
      return at(L.mix([at(nrm(fmTone)), at(bell(f, { kind: 'jade', t60: 1.0, seed: `rj${k}${i}`, strike: -14 }), 0, -6), at(zap, 0, -14)]), 0.12 + i * 0.06, -6 - i * 0.5, -0.5 + i * 0.33);
    });
    const rb = L.toStereo(rumble(1.8, { peaks: 2, lp0: 400, lp1: 120, seed: `rr${k}` }));
    const sp = L.automate(sizzle(0.8, { density: 900, seed: `rs${k}` }), (t) => Math.exp(-t / 0.25));
    let m = L.mix([at(qing, 0, 0, -0.1), at(bowl, 0, -10, 0.1), ...chord, at(rb, 0.1, -17), at(L.toStereo(sp), 0.12, -22)], { channels: 2, length: 2.4 });
    m = space(m, { wet: 0.26, seed: `rv${k}`, env: HALL, ch: 2, length: 1.8, shimmer: -22 });
    return L.fadeOut(L.slice(m, 0, 2.4), 0.7, 'exp');
  };
  const vars = [make(0), make(1)];
  await add('ready_staff', vars, { lufs: -18, bus: 'ui', spatial: false, channels: 2, voices: 2, pitch: [1, 1], priority: 3 });
  // the reserved twin 應龍．晦霆: 4 st down with a 0.17 / 0.34 s echo
  const tw = vars.map((v) => {
    const d = L.varispeedSemis(v, TW);
    return L.mix([at(d), at(L.eq(d, [{ type: 'lp', f: 3500, order: 2 }]), 0.17, -9.4), at(L.eq(d, [{ type: 'lp', f: 2200, order: 2 }]), 0.34, -16)], { channels: 2 });
  });
  await add('ready_staff_hui', tw, { lufs: -18, bus: 'ui', spatial: false, channels: 2, voices: 2, pitch: [1, 1], priority: 3, note: 'twin 應龍．晦霆 (reserved, not referenced yet)' });
}

// ------------------------------------------------------------------------------------------------ crisis + foley
async function foleySet(add, SP, LOC) {
  // 雷鱗甲 crisis armour: the jade-glaze scales shattering (a plate break + a glass smash + 12 jade chips), the lightning
  // ring's split and a short discharge, the knock-back thump, then the element's tail: a roll of thunder and a bronze D5
  const plate = await src(S.plate, 0.0, 1.1, { hp: 300 });
  const smash = await src(S.glassSmash, 0.18, 1.2, { hp: 400 });
  const cup = await grab(S.teaCup, 0.28, 0.78, { mode: 'peak', pre: 0.003, post: 0.3, hp: 400 });
  const crisis = [];
  for (let k = 0; k < 2; k++) {
    const sd = `cr${k}`;
    const chips = L.mix(Array.from({ length: 12 }, (_, i) => at(bell(2400 * 2 ** (i / 7 + k * 0.08), { kind: 'jade', t60: 0.2, seed: `${sd}${i}`, strike: -6, beat: 0 }), i * 0.014, -5 - i * 0.6)));
    const ck = crack(0.2, { n: 20, spread: 0.05, big: 1.8, seed: sd + 'c' });
    const zz = L.automate(arc(0.25, { rate: 420, jit: 0.4, res: [2600, 6000], body: -8, flick: 0.3, drop: 0, seed: sd + 'a' }), (t) => Math.exp(-t / 0.07));
    const th = L.thump({ f0: 150, f1: 55, decay: 0.2, drive: 3, seed: sd + 't' });
    const rb = rumble(1.2, { peaks: 2, lp0: 600, lp1: 150, seed: sd + 'u' });
    let m = L.mix([at(k ? smash : plate, 0, -1), at(k ? plate : smash, 0.02, -7), at(cup, 0.01, -10), at(nrm(chips), 0, -7), at(ck, 0, -3), at(zz, 0.003, -8), at(nrm(th), 0, -5),
      at(rb, 0.15, -7), at(bell(PENTA[5], { kind: 'bronze', t60: 1.2, seed: sd + 'g' }), 0.28, -10), at(sizzle(0.6, { density: 1200, seed: sd + 's' }), 0.02, -18)], { length: 1.6 });
    m = shape(L.psychoBass(m, { freq: 120, amount: -8 }), 'hit');
    crisis.push(L.pad(dense(L.fadeOut(m, 0.5, 'exp'), -15), 0.002, 0));
  }
  await add('staff_crisis', crisis, SP([4, 50], { lufs: -15, voices: 3, pitch: [0.98, 1.02], priority: 3 }));

  // 待機 hum (§1.12; the code plays it at vol 0.12 with a 0.4 s fade-in, so it is mastered at -24 LUFS: ~26 dB under the
  // 雷矢): D2 sine + A2 / D3 (55-110 Hz), a band of noise 400-1200 Hz swept by a 0.2 Hz LFO, the 雷珠's 細碎電流聲 -- sparse
  // crackle and a faint sputtering arc. Sines on the 0.2 Hz grid, every LFO whole cycles in the 5 s loop.
  {
    const P = 5.0, X = 0.5, D = P + X;
    const pt = (f) => L.tone(P, { type: 'sine', freq: onGrid(f, P) });
    const sine = L.mix([at(pt(D2)), at(pt(A2), 0, -10), at(pt(D3), 0, -14)]);
    const band = L.sweep(L.noise(D, { color: 'pink', seed: 'ih' }), 'bp', (t) => 700 * 1.7 ** Math.sin(6.283 * 0.2 * t), { q: 1.6 });
    const pops = L.crackle(D, { density: 7, decay: 0.002, hp: 2500, seed: 'ipp' });
    const fz = arc(D, { rate: 90, jit: 0.6, res: [3200, 6800], body: -20, flick: 0.8, drop: 0.85, seed: 'ifz' });
    const noisy = L.mix([at(nrm(band), 0, -9), at(nrm(pops), 0, -15), at(fz, 0, -22)], { length: D });
    const m = seamless(P, X, noisy, L.gain(nrm(sine), -3), 0);
    seamCheck('staff_idle', m);
    await add('staff_idle', m, LOC({ lufs: -24, loop: true, channels: 1, voices: 1, pitch: [1, 1], note: 'code: vol 0.12, fadeIn 0.4' }));
  }

  // the staff drawn (青銅低鳴): a long object's air, the cloth, a bronze D3 swelling (bowed), the rings' small jingle, the
  // grip seating, the 雷珠 waking with a crackle
  const air = await src(S.swing, 0.0, 0.8, { hp: 150, semis: -5 });
  const cape = await src(S.cape, 0, 0.335, { hp: 120, semis: -2 });
  const draws = [];
  for (let k = 0; k < 2; k++) {
    const sd = `dr${k}`;
    const h = hum(D3 * (1 + k * 0.004), 0.9, { attack: 0.22, t60: 1.6, seed: sd + 'h' });
    const seat = L.thump({ f0: 190, f1: 90, sweep: 0.01, decay: 0.06, click: 0.2, drive: 2, seed: sd + 't' });
    const wake = L.mix([at(L.automate(arc(0.12, { rate: 700, jit: 0.4, res: [3600, 7000], flick: 0.2, drop: 0, seed: sd + 'a' }), (t) => Math.exp(-t / 0.03))), at(sizzle(0.3, { density: 900, seed: sd + 's' }), 0, -6)]);
    let m = L.mix([at(air, 0, -4, -0.2), at(cape, 0.02, -3, 0.15), at(nrm(h), 0.04, -8), at(nrm(K.jingle(0.3, 5, `${sd}j`)), 0.32, -16, 0.3), at(nrm(seat), 0.36, -12), at(nrm(wake), 0.24, -16, 0.25)],
      { channels: 2, length: 0.9 });
    draws.push(L.fadeOut(m, 0.3, 'exp'));
  }
  await add('staff_draw', draws, LOC({ lufs: -21, channels: 2, voices: 2, pitch: [0.97, 1.03] }));

  // first draw (1.6 s clip; this plays at clip t = 0.032 s): swung up (air, cloth, a bronze D3 swelling), the rings
  // spinning up 0.45-0.9 s (the motor's whir rising + a tone rising 0.8 -> 1.25; their clicks are staff_ring), a reversed
  // bloom into the strike at 0.9 s (staff_reload plays the strike itself), then the 「御霆」 theme at 1.25 s: a big
  // bronze D3 / D4 bell with timpani on D2 and a thunder roll (§2.31: 青銅鐘一聲加雷滾), a jade A5 shimmer over it
  {
    const T = 3.4;
    const whir = await src(S.whir, 5, 6.2, { hp: 300 });
    const timp = await src(S.timpF2, 0.0, 2.6, { hp: 30, semis: -3 });
    const rl = L.lp(await src(S.roll, 0.0, 3.0, { hp: 35, rate: 0.75 }), 1200);
    const sp = L.automate(L.eq(L.varispeedCurve(whir, [[0, 0.45], [0.45, 1.5], [0.7, 1.4]]), [{ type: 'bp', f: 1400, q: 0.7 }]), (t) => Math.min(1, t / 0.15) * Math.max(0, 1 - t / 0.7) ** 1.5);
    const ch = L.automate(charge(0.45, D4, { seed: 'fch' }), ramp(0.45, 1.5));
    const big = L.mix([at(bell(D3, { kind: 'bronze', t60: 3.2, seed: 'fdb', strike: -10 })), at(bell(D4 * 1.002, { kind: 'bronze', t60: 2.4, seed: 'fdb2', strike: -12 }), 0.02, -5)]);
    const rb = rumble(2.0, { peaks: 3, lp0: 600, lp1: 140, seed: 'fdu' });
    let m = L.mix([at(L.toStereo(air), 0, -6), at(L.toStereo(cape), 0.03, -8), at(L.toStereo(nrm(hum(D3, 1.25, { attack: 0.18, t60: 1.6, seed: 'fdh' }))), 0.02, -9),
      at(L.toStereo(nrm(sp)), 0.43, -14), at(L.toStereo(nrm(ch)), 0.45, -13), at(L.toStereo(swell(PENTA[10], 0.3, { seed: 'fds' })), 0.6, -16),
      at(L.toStereo(nrm(big)), 1.25, 0), at(L.toStereo(timp), 1.25, -4), at(L.toStereo(L.automate(rl, (t) => Math.min(1, t / 0.1))), 1.27, -8), at(L.toStereo(rb), 1.3, -9),
      at(bell(PENTA[8], { kind: 'jade', t60: 1.2, seed: 'fdj', strike: -14 }), 1.29, -14, 0.3)], { channels: 2, length: T });
    m = L.psychoBass(m, { freq: 100, amount: -7 });
    m = space(m, { wet: 0.2, seed: 'fdsp', env: HALL, ch: 2, length: 1.8, shimmer: -22 });
    await add('staff_first', L.fadeOut(L.slice(m, 0, T), 0.8, 'exp'), LOC({ lufs: -16, channels: 2, voices: 1, pitch: [1, 1], note: 'baked to the staff_first clip timeline (1.6 s); the strike at 0.93 s is staff_reload' }));
  }

  // 引雷 (the reload: this plays at the strike, 0.5 s into the clip; mana lands 0.34 s later): a small stroke into the
  // 雷珠 (split, rip, a small boom, a short roll), the rings racing (the whir rising), the mana filling (a tone rising 0.8
  // -> 1.25 of D4 + a discharge climbing 120 -> 600 Hz), the 「full」 ping at 0.34 s (jade D6 + a gold D7)
  const whir = await src(S.whir, 8, 9.2, { hp: 300 });
  const reloadVar = (k, rare) => {
    const sd = `rl${rare ? 'r' : ''}${k}`, full = rare ? 0.36 : 0.34, T = rare ? 1.2 : 1.0;
    const ck = crack(0.2, { n: 18, spread: 0.05, big: 1.6, seed: sd + 'c' });
    const rp = rip(0.12, { density: 1300, t: 0.03, seed: sd + 'r' });
    const bm = boom({ f0: 130, f1: 50, sweep: 0.025, decay: 0.25, seed: sd + 'b' });
    const rb = rumble(0.8, { peaks: 2, lp0: 600, lp1: 200, seed: sd + 'u' });
    const c0 = rare ? 0.22 : 0.05;
    const ch = L.automate(charge(full - c0, D4, { seed: sd + 'h', lp: 3200 }), ramp(full - c0, 1.3));
    const up = L.automate(arc(full - c0, { rate: (t) => 120 * 5 ** (t / (full - c0)), jit: 0.4, res: [2600, 6000], body: -10, flick: 0.2, drop: 0, seed: sd + 'a' }), ramp(full - c0, 1.5));
    const sp = L.automate(L.eq(L.varispeedCurve(whir, [[0, 0.5], [0.15, 1.6], [0.6, 1.2]]), [{ type: 'bp', f: 1500, q: 0.7 }]), (t) => Math.min(1, t / 0.08) * Math.max(0, 1 - t / 0.6));
    const ping = L.mix([at(bell(PENTA[10], { kind: 'jade', t60: 0.7, seed: sd + 'p', strike: -10 })), at(bell(PENTA[15], { kind: 'tiny', t60: 0.25, seed: sd + 't', strike: -16 }), 0.002, -10)]);
    const parts = [at(ck, 0, 0), at(rp, 0.002, -8), at(bm, 0.002, -5), at(rb, 0.02, -11), at(nrm(sp), 0.02, -16), at(ch, c0, -11), at(up, c0, -12), at(nrm(ping), full, -7),
      at(L.automate(sizzle(0.4, { density: 1000, seed: sd + 's' }), (t) => Math.exp(-t / 0.1)), full, -18)];
    if (rare) {
      // the dragon swallows the bolt: the jaw's bronze clack (0.18 s), a gulp, a low pleased growl
      parts.push(at(jaw, 0.18, -6), at(nrm(L.thump({ f0: 95, f1: 45, sweep: 0.03, decay: 0.3, click: 0, drive: 2, seed: sd + 'g' })), 0.2, -5), at(growl, 0.22, -11));
    }
    let m = L.mix(parts, { length: T });
    m = L.psychoBass(m, { freq: 110, amount: -8 });
    m = L.reverb(m, 'smallRoom', { wet: 0.12, seed: sd + 'v', length: 0.8 });
    return L.pad(L.fadeOut(L.slice(m, 0, T), 0.35, 'exp'), 0.002, 0);
  };
  const jaw = await grab(S.clang, 0, 1.0, { mode: 'peak', pre: 0.002, post: 0.25, semis: 4, hp: 250 });
  const growl = L.fadeOut(L.lp(await src(S.tiger, 1.55, 2.05, { hp: 60, semis: -9 }), 900), 0.35, 'sine');
  await add('staff_reload', [reloadVar(0, false), reloadVar(1, false)], LOC({ lufs: -19, channels: 2, voices: 2, pitch: [0.98, 1.02] }));
  await add('staff_reload_rare', reloadVar(0, true), LOC({ lufs: -19, channels: 2, voices: 1, pitch: [1, 1] }));

  // inspect (4.6 s clip; this plays at 0.092 s): the bronze turning in the light (a bowed D3), the flicked outer ring
  // racing (the whir, flicked fast then slowing; the clicks are staff_ring), the wings opening (the cloisonné's small
  // jingle, a soft air), then the phrase on 編磬 chime stones over a low bronze bell -- A4 D5 E5 A5 . B5 A5 | D6 on the
  // 雷珠's flash (3.96 s) with a crackle. The far lightning of the world inspect is staff_ult_cloud.
  const insp = [];
  for (let k = 0; k < 2; k++) {
    const sd = `in${k}`;
    const turn = hum(D3, 2.4, { attack: 0.35, t60: 2.2, seed: sd + 'h' });
    const sp = L.automate(L.eq(L.varispeedCurve(whir, [[0, 1.7], [0.3, 1.5], [1.2, 0.6]]), [{ type: 'bp', f: 1700, q: 0.8 }]), (t) => Math.min(1, t / 0.03) * Math.max(0, 1 - t / 1.2) ** 1.3);
    const wing = L.mix([at(nrm(K.jingle(0.35, 7, `${sd}w`))), at(nrm(L.whoosh({ dur: 0.45, f0: 500, f1: 2400, q: 1.2, seed: sd + 'o' })), 0, -6)]);
    const notes = [[PENTA[3], 1.95], [PENTA[5], 2.25], [PENTA[6], 2.55], [PENTA[8], 2.85], [PENTA[9], 3.35], [PENTA[8], 3.6]];
    const phrase = notes.map(([f, t], i) => at(bell(f * (1 + k * 0.002), { kind: 'qing', t60: 1.5, seed: `${sd}q${i}`, strike: -12 }), t, -4 - (i % 2) * 1.5, -0.35 + i * 0.14));
    const flash = L.mix([at(bell(PENTA[10], { kind: 'qing', t60: 1.8, seed: sd + 'f', strike: -10 })), at(bell(D4, { kind: 'bronze', t60: 2.0, seed: sd + 'g', strike: -14 }), 0, -5),
      at(L.automate(arc(0.25, { rate: 500, jit: 0.4, res: [3200, 6800], flick: 0.3, drop: 0, seed: sd + 'a' }), (t) => Math.exp(-t / 0.06)), 0, -12)]);
    let m = L.mix([at(L.toStereo(nrm(turn)), 0, -13), at(L.toStereo(nrm(sp)), 1.18, -15), at(L.toStereo(wing), 2.25, -14), ...phrase, at(L.toStereo(nrm(flash)), 3.956, -2)], { channels: 2, length: 4.6 });
    m = space(m, { wet: 0.22, seed: sd + 'v', env: HALL, ch: 2, length: 1.8, shimmer: -22 });
    insp.push(L.fadeOut(L.slice(m, 0, 4.6), 0.5, 'exp'));
  }
  await add('staff_inspect', insp, LOC({ lufs: -21, channels: 2, voices: 1, pitch: [1, 1] }));

  // the armillary's 「喀」 (code: vol 0.4-0.6, pitch 0.9-1.3): a detent click (a revolver's handling click + a small
  // synthesized latch with a bronze body), the gold ring ringing on (a small bell on the high pentatonic + a bronze ring
  // an octave + a fifth below), a micro arc; clipped to a dense click so it reaches its level without the limiter
  const rings = [];
  for (let k = 0; k < 4; k++) {
    const sd = `rg${k}`, f = PENTA[[13, 14, 15, 12][k]];
    const cl = await grab(S.clicks, 0.08 + k * 0.12, 0.08 + k * 0.12 + 0.15, { mode: 'peak', pre: 0.002, post: 0.05, hp: 400 });
    const latch = L.thump({ f0: 620, f1: 260, sweep: 0.006, decay: 0.035, click: 0.4, drive: 2, seed: sd + 't' });
    const p = L.mix([at(bell(f, { kind: 'tiny', t60: 0.3, seed: sd + 'p', strike: -10 })), at(bell(f / 3, { kind: 'bronze', t60: 0.25, seed: sd + 'b', strike: -20 }), 0.001, -6)]);
    const z = L.automate(arc(0.03, { rate: 1200, jit: 0.3, res: [4200, 8000], flick: 0, drop: 0, seed: sd + 'a' }), (t) => Math.exp(-t / 0.008));
    const m = L.mix([at(cl, 0, 0), at(nrm(latch), 0, -5), at(nrm(p), 0.003, -6), at(z, 0.002, -16)], { length: 0.34 });
    rings.push(L.pad(dense(L.fadeOut(m, 0.12, 'exp'), -20), 0.003, 0));
  }
  await add('staff_ring', rings, LOC({ lufs: -20, channels: 1, voices: 4, pitch: [0.97, 1.03] }));

  // dry (not enough mana): a weak sputter -- a dying arc, a dull ring click, a low "thup", a few sparks
  const drys = [];
  for (let k = 0; k < 3; k++) {
    const sd = `dy${k}`;
    const sp = L.automate(arc(0.28, { rate: (t) => 120 - 200 * t, jit: 0.7, res: [1600, 3800], body: -6, flick: 0.6, drop: 0.4, seed: sd + 'a' }), (t) => Math.exp(-t / 0.08));
    const cl = await grab(S.clicks, 0.1 + k * 0.15, 0.1 + k * 0.15 + 0.15, { mode: 'peak', pre: 0.002, post: 0.05, hp: 300, semis: -5 });
    const th = L.thump({ f0: 200, f1: 90, sweep: 0.01, decay: 0.05, click: 0, drive: 2, seed: sd + 't' });
    const m = L.mix([at(cl, 0, -2), at(sp, 0.01, -3), at(nrm(th), 0, -8), at(L.automate(sizzle(0.2, { density: 400, seed: sd + 's' }), (t) => Math.exp(-t / 0.05)), 0.02, -14)], { length: 0.35 });
    drys.push(L.pad(dense(L.fadeOut(m, 0.12, 'exp'), -21), 0.003, 0));
  }
  await add('staff_dry', drys, LOC({ lufs: -21, channels: 1, voices: 2, pitch: [0.96, 1.04] }));
}

// ------------------------------------------------------------------------------------------------ produce
export async function produce(lib, c) {
  L = lib; ctx = c; K = makeKit(lib, ctx);
  const only = process.env.ST_ONLY ? new Set(process.env.ST_ONLY.split(',').map((s) => s.trim())) : null;
  if (only && !process.env.CF_AUDIO_OUT) throw new Error('ST_ONLY writes a partial category: set CF_AUDIO_OUT to a scratch folder');
  const want = (g) => !only || only.has(g);
  const cat = ctx.category('premium_staff', { bus: 'sfx' });
  // the premium_sunbow mastering wrapper: short one-shots lose 0.5-1.5 dB of loudness in Vorbis (pre-compensated);
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
  const SP = (range, o = {}) => ({ spatial: true, channels: 1, range, ...o });      // positional (mono)
  const LOC = (o = {}) => ({ spatial: false, ...o });                                   // 2D (local only)

  if (want('bolt')) await boltSet(add, SP, LOC);
  if (want('hits')) await hitSet(add, SP, LOC);
  if (want('chain')) await chainSet(add, SP);
  if (want('pool')) await poolSet(add, SP);
  if (want('ult')) await ultSet(add, SP);
  if (want('ready')) await readySet(add);
  if (want('foley')) await foleySet(add, SP, LOC);
  await cat.write();
}
