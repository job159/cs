// E01 春霆神戟．驚蟄 Thunderclap Halberd (異能 telescoping high-voltage halberd, docs/PREMIUM_WEAPONS.md §2 E01 + §1.12) —
// category 'premium_chunting': every cue game/src/weapons/premium/chunting.js plays (its SND table, the clips' 'ch' snd
// events, the idle hum, the def's ready cue) plus the def.sound contract (chunting_close / _tail / _far: what a teammate
// hears if a shot is ever reported for it). No twin set: E01 is 異能 and §2.26 gives twins to 神兵 only.
//
// Palette: an industrial high-voltage device, not a myth. Everything electric locks to the grid: the arcs re-strike twice
// a mains cycle and buzz on B2 (123.5 Hz, about 2 x 60 Hz), the transformer hum sits on B1 / B2 with its even
// harmonics, the corona hisses in 123.5 Hz pulses. The weapon's own voice is a singing Tesla coil (spark trains fired at
// a musical rate: a raspy, sizzling, square-ish tone) doubled by the white porcelain insulators (ceramic modes over a
// real porcelain strike); every tuned part sits in E 宮 (E F# G# B C#) and the 驚蟄 call is E5 -> B5 -> E6.
// The CC0 inventory holds no thunder or arc recordings, so lightning is built from parts: the split (one big N-wave + a
// tearing train of small ones), the rip, the boom, recorded blasts and rolling explosions slowed into the roll. The
// coils' electromagnetic whine is an HDD motor recorded on an inductor mic (spin-up / seek clicks / spin-down); the
// mechanics are recorded metal (helmet hinges and clanks, a deep clang, gun cocking, a pistol slide), concrete, rubble,
// a punch and a wet hit; the 驚蟄 chord under the giant bolt is VSCO 2 tuba / trombone / horn / choir / timpani / cello
// moved onto E.
//
//   discharge chunting_zap_start (the contactor + 嗞 wind-up 0.23 s -> the ignition), _zap_loop (the held arc, a 3 s
//             seamless loop), _zap_end (收尾「啪」), _zap_hit (into a body), _kill (KE_CHAR), _close / _tail / _far
//   RMB       _thrust (the stab + the lance leaving the spear), _burst (雷爆), _charge (loop; the code rides its rate
//             0.8 -> 1.25), _stage (rendered on C#: the code's pitch 1.18 / 1.36 lands it on E / F#), _blade (the
//             crescent's hinge: swish, detent, ring)
//   驚蟄落雷  §1.12 ultimate in three layers: ① rise = _thunder_roll (遠雷: the cloud gathering, a crescendo into the
//             strike) + _streamer (pitched up by the code as the strike nears); ② the 40-60 Hz impact and ③ the 驚蟄
//             chord bed + the power-down release are both in _thunder. Beats: _throw, _fly (receding), _impact (stuck:
//             the shaft judders), _return, _catch
//   雷樁      _rod_plant (whistle down, the bolt, the clang), _rod_loop (the rod's corona hum), _rod_arc, _rod_end
//   view      _idle (§1.12 hum loop), _draw (電容充電上揚), _first (baked to the 1.6 s clip: the sting at 0.864 s), _seg
//             (伸縮柄「喀」), _coil (an E5 blip: the code's pitch 1 / 1.12 / 1.24 runs it E F# G#), _crack (the idle
//             ground arc), _reload_out / _in / _hum (換電池), _inspect (§1.12: the 3.8 s 驚蟄 phrase), _glove_zap,
//             _porcelain (礙子「叮」, rendered on E6: the code's pitch 1.5 rings it on B6), _dry
//   ready     ready_chunting (unique in the game: a contactor slam and the singing Tesla coil calling the 驚蟄 motif)
//
//   node --max-old-space-size=1536 tools/audio/build.mjs --only premium_chunting
//   dev subset (never into the game folder: a subset run deletes the other files of the category):
//   CF_AUDIO_OUT=tools/audio/out/ch-dev CH_ONLY=zap,hits node --max-old-space-size=1536 tools/audio/run-producer.mjs \
//     tools/audio/producers/premium_chunting.mjs --spectrograms all
//   groups: zap hits rmb throw rod view ready contract ref (ref = the sequences as the player hears them -> preview/)
import { makeKit } from './weapons.mjs';

const SR = 48000;
let L, ctx, K;

const S = {
  // thunder and blasts: rolling explosions (the roll), blasts (a strike's body), a metallic bang (a transformer blowing)
  roll: 'fs:264031', rollSub: 'fs:275196', crash: 'fs:366086', grenade: 'fs:609587', expl: 'fs:398283', deep: 'fs:258195', medium: 'fs:516914', metalBang: 'fs:244394',
  // the street: rubble, debris, concrete, a heavy metal thud on the ground
  rubble: 'fs:758580', rubble2: 'fs:569510', debris: 'fs:703247', concSmash: 'fs:522099', concHit: 'fs:321478', metalThud: 'fs:640204',
  // electricity's texture: an acid sizzle (the plasma's hiss), fire crackle (sparks), an HDD motor on an inductor mic
  // (electromagnetic whine: spin-up 0.5-2.5 s, seek clicks 2.9-4.9 s, steady 12-17 s, spin-down 17-19.5 s)
  sizzle: 'fs:382313', crackle: 'fs:363092', inductor: 'fs:594042',
  // metal: helmet hinges and clanks, a deep clang, a metal hit, gun cocking, a pistol slide
  hinge: 'fs:675817', clang: 'fs:201094', metalHit: 'fs:406562', cock: 'fs:632822', glock: 'fs:393734',
  // porcelain: a mug struck (two clean single strikes at 1.07 s and 3.80 s), a tea cup
  mug: 'fs:530233', cup: 'fs:389432',
  // the body and the hand
  wet: 'fs:626405', punch: 'fs:390462', cloth: 'fs:334219', cape: 'fs:494797', swing: 'fs:268227', swoosh: 'fs:507466',
  wind: 'fs:405601',
  // the 驚蟄 chord (VSCO 2: the F samples down 1 st, the timpani on E3)
  tubaF1: 'fs:374255', tbnF2: 'fs:374021', hornF3: 'fs:373258', choirO: 'fs:764339', timpE3: 'fs:373921', timpRollF2: 'fs:373943', celloTremE2: 'fs:372847', bdrum: 'fs:375260',
};
const midi = (m) => 440 * 2 ** ((m - 69) / 12);
const MAINS = midi(47);                                // B2 123.47 Hz: the grid's buzz, every hum and arc locks to it
const B0 = midi(23), B1 = midi(35), B2 = midi(47), E2 = midi(40), E3 = midi(52), B3 = midi(59), E4 = midi(64), Gs4 = midi(68), B4 = midi(71);
const Cs5 = midi(73), E5 = midi(76), B5 = midi(83), Cs6 = midi(85), E6 = midi(88), B6 = midi(95), E7 = midi(100);

// ------------------------------------------------------------------------------------------------ small helpers
const at = (buf, t = 0, gain = 0, pan) => (pan === undefined ? { buf, at: t, gain } : { buf, at: t, gain, pan });
const nrm = (b, db = -1) => L.normalizePeak(b, db);
/** linear breakpoints [[t, v]...] -> fn(t) (automate() reads a points array as dB) */
const ev = (pts) => { const f = L.toFn(pts); return (t) => Math.max(0, f(t)); };
const ramp = (D, p = 2) => (t) => Math.min(1, Math.max(0, t / D)) ** p;
/** Level-flattened copy (a slow RMS follower divided out): a recorded roll that decays can then be shaped at will. */
function flatten(b, tau = 0.3) {
  const e = L.envelope(b, { attack: 0.05, release: tau, rms: true });
  let mx = 0; for (const v of e) if (v > mx) mx = v;
  const fl = mx * 0.06;
  return nrm(new L.Buf(b.data.map((d) => d.map((v, i) => v / Math.max(fl, e[i]))), b.sampleRate));
}
let USED = new Set();                                  // sources loaded since the last add() (per-sound credits)
/** A smooth random wobble in [-1, 1] (three detuned sines), seeded. */
function wobble(seed, hz = [3.7, 7.3, 12.9]) {
  const r = L.rng(L.hashSeed(seed)), ph = hz.map(() => r.next() * 6.283), w = hz.map((_, i) => 1 / (i + 1));
  const sum = w.reduce((a, b) => a + b, 0);
  return (t) => hz.reduce((a, f, i) => a + Math.sin(6.283 * f * t + ph[i]) * w[i], 0) / sum;
}
/** Peaks shaved by the soft clipper until the peak-to-loudness ratio lets the loudness stage reach `lufs` without the
 *  limiter (premium_sunbow / premium_staff recipe). */
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
  zap: { sub: -16, low: -8.5, lowMid: -5.5, mid: -4.5, high: -7, air: -11.5 },
};
const shape = (b, t, amount = 0.7) => K.balance(b, BAL[t] || t, amount);
/** Parallel crush under the open mix (density without losing the transient). */
function thicken(m, { pre = 0.004, crush = 0.42 } = {}) {
  const c = L.slice(L.compress(L.pad(nrm(m, 0), pre, 0), { threshold: -26, ratio: 5, attack: 0.0008, release: 0.02, knee: 6, makeup: 14, lookahead: 0.002 }), pre);
  return L.mix([{ buf: nrm(m, 0), gainLin: 0.75 }, { buf: c, gainLin: crush }]);
}
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
const memo = new Map();
const once = async (key, fn) => { if (!memo.has(key)) memo.set(key, await fn()); return memo.get(key); };

// open sky over the streets: the roll hangs long and dark
const SKY = {
  length: 3.2, predelay: 0.03,
  echoes: { count: 12, t: [0.07, 0.8], gain: [0.15, 0.4], lp: [4800, 1500], spread: [0.004, 0.04], pan: 1 },
  tail: { rt60: 2.4, rtLow: 3.0, rtHigh: 0.9, gain: 0.5, start: 0.06, build: 0.2, lp: 3400, hp: 45 },
};
// a substation: a tall concrete-and-steel hall, bright early slaps and a short flutter (ready, inspect, the first draw)
const SUBSTATION = {
  length: 2.2, predelay: 0.012,
  echoes: { count: 18, t: [0.012, 0.16], gain: [0.2, 0.45], lp: [9000, 4000], spread: [0.001, 0.008], pan: 1 },
  flutter: { period: 0.031, count: 8, decay: 0.7, lp: 6000 },
  tail: { rt60: 1.5, rtLow: 1.7, rtHigh: 0.9, gain: 0.55, start: 0.02, build: 0.05, lp: 7500, hp: 90 },
};
/** Dry + a space. */
const space = (b, { wet = 0.25, seed = 'sp', env = SKY, ch = 1, length } = {}) => L.convolve(b, L.makeIR(env, { seed, channels: ch, length }), { wet, dry: 1 });

// ------------------------------------------------------------------------------------------------ seamless loops
// (premium_sunbow / premium_staff): `noisy` (rendered P + X) is crossfaded onto its own head; `tonal` (every component
// periodic in P) is rendered W + P and cut [W, W + P] after its filters have settled -- seamless by itself.
const onGrid = (f, P) => Math.round(f * P) / P;
function seamless(P, X, noisy, tonal, W = 0.5) {
  const a = L.loopCrossfade(L.fitLength(noisy, P + X), X);
  return tonal ? L.mix([at(a), at(L.slice(tonal, W, W + P))], { length: P }) : a;
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
/** The arc's rasp for a loop (the buzz() rasp is a steady tone: crossfaded onto itself it swells or dips at the seam):
 *  the same tube-driven saw on the grid, its drift, flicker and sputtering dropouts all periodic in P; rendered W + P. */
function raspLoop(P, W, { f = MAINS, drops = 6, seed = 'rl' } = {}) {
  const f0 = onGrid(f, P), D = W + P, fl = pRand(P, 30, seed + 'f'), r = L.rng(L.hashSeed(seed));
  const gaps = Array.from({ length: drops }, () => { const a = r.range(0.1, P - 0.1); return [a, a + r.range(0.008, 0.025)]; });
  const gate = (t) => { const x = ((t - W) % P + P) % P; let g = 1; for (const [a, z] of gaps) { const e = Math.min(x - a, z - x); if (e > -0.002) g = Math.min(g, Math.max(0, -e / 0.002)); } return g; };
  let s = L.saturate(L.tone(D, { type: 'saw', freq: (t) => f0 * (1 + 0.004 * Math.sin(2 * Math.PI * (3 / P) * t)) }), { drive: 10, type: 'tube' });
  s = L.eq(s, [{ type: 'hp', f: 170, order: 2 }, { type: 'lp', f: 3200, order: 2 }, { type: 'peak', f: 900, gain: 4, q: 0.9 }]);
  return nrm(L.automate(s, (t) => gate(t) * (0.65 + 0.35 * Math.abs(fl(t - W)))));
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

// ------------------------------------------------------------------------------------------------ the lightning kit
/**
 * The split of a close stroke: one big N-wave (the return stroke's shock) with a smaller echo a millisecond on, then a
 * tearing train of `n` small N-waves over `spread` s (branches arriving one after another), 0.15-1.6 ms each (shorter =
 * brighter), random polarity, decaying.
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
  return nrm(L.eq(new L.Buf([o], SR), [{ type: 'hp', f: hp, order: 2 }, { type: 'lp', f: 15000, order: 2 }, { type: 'peak', f: 2800, gain: 2, q: 0.8 }]));
}
/** The tearing hiss under the split: dense crackle under a fast decay. */
function rip(dur, { density = 1400, hp = 1500, t = 0.05, seed = 'rp' } = {}) {
  const c = L.crackle(dur, { density, decay: 0.0008, hp, minAmp: 0.1, seed });
  return nrm(L.automate(c, (x) => Math.min(1, x / 0.002) * Math.exp(-x / t)));
}
/** The boom: a falling 40-110 Hz thump and a burst of dark brown noise, tube-saturated (small speakers hear the harmonics). */
function boom({ f0 = 92, f1 = 36, sweep = 0.05, decay = 0.6, dur, seed = 'bm', drive = 4 } = {}) {
  dur = dur ?? decay * 1.2 + 0.05;
  const th = L.thump({ f0, f1, sweep, decay, dur, click: 0, drive: 1.5, seed });
  const body = L.applyEnv(L.eq(L.noise(dur, { color: 'brown', seed: seed + 'n' }), [{ type: 'lp', f: 260, order: 2 }, { type: 'hp', f: 30, order: 2 }]), L.expEnv(dur, { attack: 0.006, t60: decay * 0.8 }));
  return nrm(L.saturate(L.mix([at(nrm(th)), at(nrm(body), 0, -4)]), { drive, type: 'tube', mix: 0.45 }));
}
/** Rolling thunder: brown noise under a darkening low-pass, swelling in `peaks` random rolls that die away, with a slow flutter. */
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
 * The high-voltage arc, locked to the grid: a discharge train re-striking at `f` (default MAINS: twice a 60 Hz cycle),
 * its interval jittered (`jit`) and its strength random, rung through two plasma resonances; the rasp -- a tube-driven
 * saw on the same rate, the Jacob's-ladder BZZZ that makes it read as mains and not static -- gated by the same
 * sputtering dropouts (`drop`), a low body and a little air; flickering in level (`flick`). f: Hz or fn(t).
 */
function buzz(dur, { f = MAINS, jit = 0.15, res = [1600, 3800], q = [3, 2.5], body = -5, rasp = -7, air = -12, flick = 0.45, drop = 0.06, seed = 'bz' } = {}) {
  const r = L.rng(L.hashSeed(seed)), N = Math.round(dur * SR), o = new Float32Array(N), gate = new Float32Array(N).fill(1), F = L.toFn(f), w = wobble(seed + 'w', [3.1, 8.7, 19.3]);
  let t = 0, off = false, offT = 0;
  while (t < dur) {
    const i = Math.round(t * SR);
    if (t >= offT) {
      off = r.chance(drop); offT = t + (off ? r.range(0.006, 0.025) : r.range(0.03, 0.15));
      if (off) for (let j = i; j < Math.min(N, Math.round(offT * SR)); j++) gate[j] = 0;
    }
    if (!off && i < N) o[i] += 0.45 + 0.55 * r.next();
    t += (1 / Math.max(5, F(t))) * (1 + jit * (r.next() * 2 - 1));
  }
  // 2 ms one-pole smoothing of the gate, forward then backward (the rasp must not click on a dropout)
  const k1 = Math.exp(-1 / (0.002 * SR));
  let y = 1;
  for (let i = 0; i < N; i++) { y = gate[i] + (y - gate[i]) * k1; gate[i] = y; }
  for (let i = N - 1; i >= 0; i--) { y = gate[i] + (y - gate[i]) * k1; gate[i] = y; }
  const imp = new L.Buf([o], SR);
  const a = L.eq(imp, [{ type: 'bp', f: res[0], q: q[0] }]), b = L.eq(imp, [{ type: 'bp', f: res[1], q: q[1] }]);
  const lo = L.eq(imp, [{ type: 'lp', f: 1100, order: 2 }, { type: 'hp', f: 60, order: 2 }]);
  const hi = L.eq(imp, [{ type: 'hp', f: 6500, order: 2 }]);
  let rs = L.saturate(L.tone(dur, { type: 'saw', freq: F }), { drive: 10, type: 'tube' });
  rs = L.eq(rs, [{ type: 'hp', f: 170, order: 2 }, { type: 'lp', f: 3200, order: 2 }, { type: 'peak', f: 900, gain: 4, q: 0.9 }]);
  rs = new L.Buf([rs.data[0].map((v, i) => v * gate[i])], SR);
  const m = L.mix([at(nrm(a)), at(nrm(b), 0, -3), at(nrm(lo), 0, body), at(nrm(rs), 0, rasp), at(nrm(hi), 0, air)]);
  return nrm(L.automate(m, (tt) => Math.max(0, 1 - flick + flick * Math.abs(w(tt)))));
}
/**
 * The singing Tesla coil (the weapon's voice): sparks fired at a musical rate `freq` (Hz or fn(t)) with a hair of jitter
 * -- a bright, raspy, square-ish buzz on a pitch -- one broad resonance, a driven saw on the pitch for body, a fine spark
 * sizzle; optional vibrato (after `vibDelay`) and a linear envelope `env` [[t, v]...].
 */
function tesla(dur, freq, { jit = 0.01, vib = 0, vibHz = 5.6, vibDelay = 0.12, seed = 'ts', env = null, sizz = -20, body = -9, bright = 11000 } = {}) {
  const r = L.rng(L.hashSeed(seed)), N = Math.round(dur * SR), o = new Float32Array(N), F0 = L.toFn(freq), w = wobble(seed + 'v', [vibHz, vibHz * 1.07]);
  const F = (t) => F0(t) * (1 + vib * Math.min(1, Math.max(0, (t - vibDelay) / 0.25)) * w(t));
  let t = 0;
  while (t < dur) { const i = Math.round(t * SR); if (i < N) o[i] += 0.8 + 0.2 * r.next(); t += (1 / Math.max(20, F(t))) * (1 + jit * (r.next() * 2 - 1)); }
  const imp = new L.Buf([o], SR);
  const raw = L.eq(imp, [{ type: 'hp', f: 220, order: 2 }, { type: 'lp', f: bright, order: 2 }]);
  const res = L.eq(imp, [{ type: 'bp', f: 2300, q: 1.1 }]);
  const saw = L.eq(L.saturate(L.tone(dur, { type: 'saw', freq: F }), { drive: 6, type: 'tube' }), [{ type: 'lp', f: 3200, order: 2 }, { type: 'hp', f: 120, order: 2 }]);
  const sz = L.crackle(dur, { density: 1600, decay: 0.0006, hp: 5000, minAmp: 0.05, seed: seed + 's' });
  let m = L.mix([at(nrm(raw)), at(nrm(res), 0, -5), at(nrm(saw), 0, body), at(nrm(sz), 0, sizz)]);
  if (env) m = L.automate(m, ev(env));
  return nrm(m);
}
// porcelain insulator skirts (a thick-walled bowl): sparse inharmonic modes, the higher ones dying fast
const CER = [[1, 1, 1], [2.32, 0.55, 0.6], [3.87, 0.32, 0.38], [5.61, 0.17, 0.24], [7.9, 0.08, 0.14], [10.6, 0.04, 0.09]];
/** A porcelain insulator struck: the modes + a slow-beating twin of each, the knuckle's knock (a filtered tick + a "tok"). */
function porcelain(f, { t60 = 0.8, seed = 'pc', knock = -12, beat = 0.0016, dur } = {}) {
  const list = [];
  for (const [r, a, k] of CER) { if (f * r > 18000) continue; list.push([r, a, t60 * k]); if (beat) list.push([r * (1 + beat * (1 + r * 0.1)), a * 0.45, t60 * k * 0.8]); }
  dur = dur ?? Math.min(4, t60 * 1.3 + 0.05);
  const p = L.partials(dur, { base: f, list, seed });
  const kn = L.mix([at(nrm(L.noiseBurst({ dur: 0.012, decay: 0.0025, bp: Math.min(9000, f * 2.2), q: 1.5, seed: seed + 'k' }))), at(nrm(L.thump({ f0: 520, f1: 260, sweep: 0.004, decay: 0.018, click: 0, seed: seed + 't' })), 0, -6)]);
  return L.fadeOut(L.mix([at(nrm(p)), at(nrm(kn), 0, knock)]), Math.min(0.3, dur * 0.25), 'sine');
}
// struck steel: a free-free bar (the shaft, the rod) and a thick plate (the crescent: dense)
const STEEL = {
  bar: [[1, 1, 1], [2.756, 0.55, 0.55], [5.404, 0.32, 0.3], [8.933, 0.16, 0.18], [13.34, 0.07, 0.1]],
  blade: [[1, 0.6, 0.8], [1.48, 1, 1], [2.13, 0.6, 0.6], [2.71, 0.42, 0.45], [3.62, 0.3, 0.3], [4.88, 0.18, 0.2], [6.1, 0.1, 0.12]],
};
function steel(f, { kind = 'bar', t60 = 0.8, seed = 'st', dur, beat = 0.0022, strike = -14 } = {}) {
  const list = [];
  for (const [r, a, k] of STEEL[kind]) { if (f * r > 18000) continue; list.push([r, a, t60 * k]); if (beat) list.push([r * (1 + beat), a * 0.5, t60 * k * 0.85]); }
  dur = dur ?? Math.min(5, t60 * 1.3 + 0.05);
  const p = L.partials(dur, { base: f, list, seed });
  const s = L.noiseBurst({ dur: 0.01, decay: 0.003, hp: Math.min(7000, f * 2), lp: 15000, seed: seed + 's' });
  return L.fadeOut(L.mix([at(nrm(p)), at(nrm(s), 0, strike)]), Math.min(0.3, dur * 0.25), 'sine');
}
// the transformer hum: harmonics of B1 (the magnetostriction sits on 2x: B2 is the loudest), as multiples of f / 2
const HUM = [[1, 0.3], [2, 1], [3, 0.28], [4, 0.42], [6, 0.18], [8, 0.1], [10, 0.06], [12, 0.05]];
/** Transformer hum on `f` (Hz or fn(t)); with P (a loop length) every partial sits on the 1/P grid. Tube-driven. */
function hum(dur, { f = MAINS, P = 0, sat = 5, seed = 'hm' } = {}) {
  const F = L.toFn(f), half = P ? onGrid(F(0) / 2, P) : null;
  const parts = HUM.map(([h, a]) => at(L.tone(dur, { type: 'sine', freq: half ? half * h : (t) => F(t) / 2 * h }), 0, 20 * Math.log10(a)));
  return nrm(L.eq(L.saturate(L.mix(parts), { drive: sat, type: 'tube', mix: 0.6 }), [{ type: 'hp', f: 40, order: 2 }, { type: 'lp', f: 3000, order: 2 }]));
}
/** The capacitor's charging whine (a flyback converter): a sine + 2nd / 3rd harmonics on `f` and a narrow hiss on it. */
function whine(dur, f, { seed = 'wn', h2 = -10, h3 = -16, air = -24 } = {}) {
  const F = L.toFn(f);
  return nrm(L.mix([at(L.tone(dur, { type: 'sine', freq: F })), at(L.tone(dur, { type: 'sine', freq: (t) => 2 * F(t) }), 0, h2), at(L.tone(dur, { type: 'sine', freq: (t) => 3 * F(t) }), 0, h3),
    at(nrm(L.sweep(L.noise(dur, { color: 'pink', seed }), 'bp', F, { q: 6 })), 0, air)]));
}
/** Power-line corona: a bright hiss and a dense crackle in pulses at the grid's rate (discharges at the AC peaks). */
function corona(dur, { f = MAINS, seed = 'cr', depth = 0.7 } = {}) {
  const hiss = L.eq(L.noise(dur, { color: 'pink', seed }), [{ type: 'hp', f: 2500, order: 2 }, { type: 'peak', f: 6000, gain: 4, q: 0.7 }, { type: 'lp', f: 14000, order: 2 }]);
  const cr = L.crackle(dur, { density: 2600, decay: 0.0005, hp: 3500, minAmp: 0.05, seed: seed + 'c' });
  return nrm(L.automate(L.mix([at(nrm(hiss)), at(nrm(cr), 0, -4)]), (t) => 1 - depth + depth * Math.abs(Math.sin(Math.PI * f * t)) ** 6));
}
/** Spark shower: very dense, very short ticks above 3.5 kHz. */
const sizzle = (dur, { density = 2200, hp = 3500, seed = 'sz', decay = 0.0007 } = {}) => nrm(L.crackle(dur, { density, decay, hp, minAmp: 0.05, seed }));
/** Recorded sizzle (an acid burn, 168 s: any stretch) high-passed into the plasma's hiss. */
const recSizzle = async (t0, dur, hp = 3000) => src(S.sizzle, t0, t0 + dur, { hp });
/** §1.12 "貴氣瞬態": 30 ms of 6-10 kHz (a filtered tick + two short high partials). */
function lux(seed, f = 7600) {
  return L.mix([at(nrm(L.noiseBurst({ dur: 0.03, decay: 0.01, bp: 8000, q: 1.3, seed }))),
    at(nrm(L.partials(0.035, { base: f, list: [[1, 1, 0.02], [1.29, 0.6, 0.015]], seed: seed + 'p' })), 0, -4)]);
}
/**
 * A contactor closing (the circuit made): the armature's tick, the slam (a recorded gun-cocking clack + a metallic
 * thump with a short ring), the coil's 30 ms grid buzz as it pulls in. `big` > 1 = a heavier frame.
 */
async function contactor(seed, { big = 1, buzzDb = -12, which = 0 } = {}) {
  const clack = await once(`cock${which % 2}`, () => grab(S.cock, which % 2 ? 0.22 : 0, which % 2 ? 0.5 : 0.2, { mode: 'peak', pre: 0.002, post: 0.06, hp: 300 }));
  USED.add(S.cock);
  const tick = L.noiseBurst({ dur: 0.008, decay: 0.0015, hp: 3500, lp: 12000, seed: seed + 'a' });
  const slam = L.thump({ f0: 280 / big, f1: 110 / big, sweep: 0.008, decay: 0.05 * big, click: 0.3, drive: 3, seed: seed + 't' });
  const ring = L.partials(0.15, { base: 1250 / big, list: [[1, 1, 0.05], [2.37, 0.6, 0.035], [3.91, 0.35, 0.02], [5.3, 0.2, 0.012]], seed: seed + 'p' });
  const bz = L.automate(buzz(0.07, { jit: 0.05, drop: 0, flick: 0.1, seed: seed + 'b' }), (t) => Math.min(1, t / 0.002) * Math.exp(-t / 0.015));
  const cl = big !== 1 ? L.varispeed(clack, 1 / big) : clack;
  return L.mix([at(nrm(tick), 0, -6), at(cl, 0.004, -2), at(nrm(slam), 0.006, -3), at(nrm(ring), 0.006, -10), at(bz, 0.008, buzzDb)], { length: 0.2 });
}
/** A metal clank from the helmet-hinge take (14 big ones; `i` picks), cut on its peak. */
const HINGE = [[1.3, 2.2], [4.3, 5.2], [7.6, 8.4], [10.4, 11.1], [13.0, 13.8], [23.7, 24.5], [28.7, 29.5], [38.2, 39.0]];
const clank = (i, o = {}) => { const [a, z] = HINGE[i % HINGE.length]; return grab(S.hinge, a, z, { mode: 'peak', pre: 0.003, post: 0.12, hp: 200, ...o }); };
/** A porcelain strike from the mug take (two clean single strikes), high-passed past the room. */
const MUG = [[0.95, 1.6], [3.7, 4.35]];
const mugStrike = (i, o = {}) => { const [a, z] = MUG[i % 2]; return grab(S.mug, a, z, { mode: 'peak', pre: 0.002, post: 0.35, hp: 1200, ...o }); };

// ------------------------------------------------------------------------------------------------ 放電
async function zapSet(add, SP, keep) {
  // the wind-up 「嗞」 (0.23 s: the contactor closing the circuit, the capacitor's whine racing up, the electrode spitting
  // sparks thicker and thicker, the arc sputtering into life, the hum swelling), then the ignition at 0.23 s as the arcs
  // leap to their targets: the split, the rip, the boom, the fat grid-locked arc (holding into the loop's level), the
  // weapon's voice ~12 dB down (the Tesla coil on E5 + a porcelain B6) and the luxury tick
  const W = 0.23, starts = [];
  for (let k = 0; k < 3; k++) {
    const r = ctx.rng(`zs${k}`), sd = `zs${k}`;
    const ct = await contactor(sd + 'c', { big: 1.1, which: k });
    const wn = L.automate(whine(W + 0.06, (t) => 1700 * (5600 / 1700) ** (Math.min(1, t / W) ** 1.4), { seed: sd + 'w' }), (t) => (t < W ? 0.15 + 0.85 * (t / W) ** 1.6 : Math.exp(-(t - W) / 0.015)));
    const pre = L.automate(buzz(W + 0.02, { f: (t) => MAINS * (0.4 + 1.6 * Math.min(1, t / W)), jit: 0.55, drop: 0.25, flick: 0.6, res: [2400, 5600], body: -10, rasp: -12, seed: sd + 'p' }), (t) => 0.1 + 0.9 * Math.min(1, t / W) ** 2);
    const spits = [];
    for (let i = 0; i < 9; i++) {
      const u = (i + r.next() * 0.6) / 9, t0 = W * (1 - (1 - u) ** 1.7);
      spits.push(at(crack(0.04, { n: 4, spread: 0.008, big: 0.4 + 0.6 * u, seed: `${sd}s${i}`, hp: 600 }), Math.min(W - 0.01, t0), -15 + 9 * u));
    }
    const hm = L.automate(hum(0.95, { seed: sd + 'h' }), (t) => Math.min(1, t / W) ** 2 * (t < W ? 1 : 0.45 + 0.55 * Math.exp(-(t - W) / 0.15)));
    const ck = crack(0.3, { n: 32, spread: 0.07, big: 2.3 + r.range(0, 0.5), seed: sd + 'k' });
    const rp = rip(0.2, { density: 1500, t: 0.05, seed: sd + 'r' });
    const bm = boom({ f0: 115, f1: 44, sweep: 0.03, decay: 0.28, seed: sd + 'b' });
    const ig = L.automate(buzz(0.7, { jit: 0.15, body: -8, rasp: -5, air: -9, flick: 0.35, drop: 0.03, seed: sd + 'i' }), (t) => Math.min(1, t / 0.003) * (t < 0.1 ? 1 : 0.45 + 0.55 * Math.exp(-(t - 0.1) / 0.1)));
    const ts = tesla(0.32, E5 * (1 + r.range(-0.003, 0.003)), { seed: sd + 't', env: [[0, 0], [0.003, 1], [0.07, 0.55], [0.32, 0]] });
    const pc = porcelain(B6, { t60: 0.45, seed: sd + 'o', knock: -20 });
    const sz = L.automate(await recSizzle(15 + k * 9, 0.6), (t) => Math.min(1, t / 0.01) * Math.exp(-t / 0.2));
    let m = L.mix([at(nrm(ct), 0, -5), at(pre, 0, -9), ...spits, at(wn, 0, -13), at(hm, 0, -19),
      at(ck, W, 0), at(rp, W + 0.002, -8), at(bm, W + 0.002, -3), at(ig, W + 0.001, -5), at(ts, W + 0.002, -12), at(pc, W + 0.004, -17), at(lux(sd + 'x', 7400), W, -13), at(sz, W + 0.005, -15)], { length: 0.95 });
    m = shape(L.psychoBass(thicken(m), { freq: 110, amount: -8 }), 'zap', 0.55);
    starts.push(L.pad(dense(L.fadeOut(m, 0.25, 'exp'), -15), 0.002, 0));
  }
  keep.zap_start = { buf: starts[0], lufs: -15, vol: 1.15 };
  await add('chunting_zap_start', starts, SP([8, 70], { lufs: -15, vol: 1.15, voices: 3, pitch: [0.98, 1.02], priority: 3, note: '放電 wind-up 0.23 s + ignition (code: vol 0.85 local / 0.8 teammates)' }));

  // the held arc (loop 3 s; local 2D at vol 0.55, teammates positional at 0.5): the grid-locked arc's BZZZ (a slow 0.9 Hz
  // drift), a thinner arc on 3x mains sputtering over it, 18 劈啪 snaps (some re-striking down the same channel), corona
  // pulses, recorded sizzle and fire-crackle sparks; the transformer hum under it on the 1/3 Hz grid. The whole surges
  // (the arcs lengthening and shortening) on a P-periodic curve.
  {
    const P = 3.0, X = 0.35, D = P + X, W2 = 0.5;
    const surge = (t) => 0.8 + 0.2 * Math.sin(2 * Math.PI * (2 / P) * t) * Math.sin(2 * Math.PI * (3 / P) * t + 1);
    // (the rasps -- steady tones -- go in the tonal path: raspLoop)
    const a1 = buzz(D, { f: (t) => MAINS * (1 + 0.004 * Math.sin(2 * Math.PI * 0.9 * t)), jit: 0.16, body: -9, rasp: -90, air: -9, flick: 0.35, drop: 0.035, seed: 'zl1' });
    const a2 = buzz(D, { f: MAINS * 3, jit: 0.4, res: [3400, 7400], q: [4, 3], body: -16, rasp: -90, flick: 0.6, drop: 0.14, seed: 'zl2' });
    const r = ctx.rng('zlsn'), snaps = [];
    for (let i = 0; i < 18; i++) {
      // (none within 0.25 s of the seam: the loop's two ends stay level)
      const t0 = r.range(0.25, P - 0.35), g = -5 - r.next() * 9;
      snaps.push(at(crack(0.07, { n: 7, spread: 0.018, big: 0.7 + r.next() * 0.9, seed: `zls${i}`, hp: 350 }), t0, g));
      if (r.chance(0.35)) snaps.push(at(crack(0.05, { n: 5, spread: 0.012, big: 0.5, seed: `zlt${i}`, hp: 450 }), t0 + r.range(0.025, 0.06), g - 4));
    }
    const cor = corona(D, { seed: 'zlc' });
    const sz = await recSizzle(52, D, 3200);
    const fire = await src(S.crackle, 4, 4 + D, { hp: 2600 });
    let noisy = L.automate(L.mix([at(a1, 0, 0), at(a2, 0, -7), ...snaps, at(cor, 0, -11), at(sz, 0, -13), at(fire, 0, -14)], { length: D }), surge);
    noisy = shape(L.psychoBass(noisy, { freq: 110, amount: -11 }), 'zap', 0.6);
    const hm = L.automate(hum(W2 + P, { P, seed: 'zlh' }), (t) => 0.85 + 0.15 * Math.sin(2 * Math.PI * (2 / P) * (t - W2)));
    const rs = L.mix([at(raspLoop(P, W2, { seed: 'zlr1' }), 0, 0), at(raspLoop(P, W2, { f: MAINS * 3, drops: 14, seed: 'zlr3' }), 0, -12)]);
    const tonal = L.psychoBass(L.automate(L.mix([at(L.eq(nrm(rs), [{ type: 'hp', f: 230, order: 2 }]), 0, -7), at(hm, 0, -17)]), (t) => surge(t - W2)), { freq: 110, amount: -14 });
    const m = seamless(P, X, noisy, tonal, W2);
    seamCheck('chunting_zap_loop', m);
    keep.zap_loop = { buf: m, lufs: -15, vol: 1.3 };
    await add('chunting_zap_loop', m, SP([8, 55], { lufs: -15, vol: 1.3, loop: true, voices: 2, pitch: [1, 1], note: 'held 放電 (code: loop, vol 0.55 local / 0.5 teammates)' }));
  }

  // 收尾「啪」 (the release crack): a hard snap, a small boom, the arc collapsing (its rate falling 123 -> 15 Hz and
  // sputtering out), the contactor opening, the hum winding down an octave, sparks dying, a porcelain E6 (resolve)
  const ends = [];
  for (let k = 0; k < 2; k++) {
    const sd = `ze${k}`;
    const ck = crack(0.2, { n: 16, spread: 0.04, big: 2.0, seed: sd + 'c', hp: 200 });
    const bm = boom({ f0: 125, f1: 50, sweep: 0.025, decay: 0.2, seed: sd + 'b' });
    const fall = L.fadeOut(L.automate(buzz(0.65, { f: (t) => MAINS * Math.max(0.12, 1 - t / 0.4) ** 1.3, jit: 0.5, drop: 0.2, flick: 0.5, seed: sd + 'a' }), (t) => Math.exp(-t / 0.13)), 0.2, 'sine');
    const ct = await contactor(sd + 'o', { big: 0.85, buzzDb: -30, which: k + 1 });
    const down = L.fadeOut(L.automate(hum(0.7, { f: (t) => MAINS * 0.5 ** Math.min(1, t / 0.4), seed: sd + 'h' }), (t) => Math.min(1, t / 0.005) * Math.exp(-t / 0.15)), 0.2, 'sine');
    const sz = L.automate(sizzle(0.5, { density: 1400, seed: sd + 's' }), (t) => Math.exp(-t / 0.1));
    const pc = porcelain(E6 * (1 + k * 0.004), { t60: 0.4, seed: sd + 'p', knock: -24 });
    const m = L.mix([at(ck, 0, 0), at(bm, 0.002, -5), at(fall, 0.003, -3), at(nrm(ct), 0.03, -9), at(down, 0, -12), at(sz, 0.005, -14), at(pc, 0.02, -18)], { length: 0.75 });
    ends.push(L.pad(dense(L.fadeOut(shape(L.psychoBass(thicken(m), { freq: 110, amount: -9 }), 'zap', 0.5), 0.25, 'exp'), -16), 0.002, 0));
  }
  keep.zap_end = { buf: ends[0], lufs: -16, vol: 1.1 };
  await add('chunting_zap_end', ends, SP([8, 60], { lufs: -16, vol: 1.1, voices: 2, pitch: [0.97, 1.03], note: 'code: vol 0.8 local / 0.7 teammates' }));
}

// ------------------------------------------------------------------------------------------------ hits, kill
async function hitSet(add, SP, LOC, keep) {
  // an arc biting a body (positional; ~1 frame in 3 while arcs land, vol 0.35): a small split, a 0.1 s BZZT on 2x mains,
  // the meat taking it (a wet hit + a thump), the burn searing off (sizzle + a hiss)
  const hits = [];
  for (let k = 0; k < 6; k++) {
    const r = ctx.rng(`zh${k}`), sd = `zh${k}`, j = 1 + r.range(-0.06, 0.06);
    const ck = crack(0.06, { n: 6, spread: 0.012, big: 1.1 + r.range(0, 0.6), seed: sd + 'c', hp: 300 });
    const zz = L.automate(buzz(0.13, { f: MAINS * 2 * j, jit: 0.2, res: [2000 * j, 4600 * j], body: -8, rasp: -8, flick: 0.2, drop: 0, seed: sd + 'a' }), (t) => Math.min(1, t / 0.002) * Math.exp(-t / 0.035));
    const wet = await once(`wet${k % 2}`, () => grab(S.wet, 0, 0.54, { mode: 'peak', pre: 0.002, post: 0.12, hp: 120, semis: k % 2 ? -3 : -1 }));
    USED.add(S.wet);
    const th = L.thump({ f0: 175 * j, f1: 65, sweep: 0.015, decay: 0.08, click: 0, drive: 3, seed: sd + 't' });
    const burn = L.automate(sizzle(0.28, { density: 1800, seed: sd + 's' }), (t) => Math.min(1, t / 0.01) * Math.exp(-t / 0.07));
    const sear = L.applyEnv(L.eq(L.noise(0.3, { color: 'pink', seed: sd + 'h' }), [{ type: 'bp', f: 3200, q: 0.8 }]), L.expEnv(0.3, { attack: 0.01, t60: 0.22 }));
    let m = L.mix([at(ck, 0, 0), at(zz, 0.001, -3), at(wet, 0.002, -8), at(nrm(th), 0.001, -6), at(burn, 0.01, -14), at(nrm(sear), 0.01, -17)], { length: 0.32 });
    m = shape(L.psychoBass(m, { freq: 120, amount: -9 }), 'hit', 0.6);
    hits.push(L.pad(dense(L.fadeOut(m, 0.1, 'exp'), -17), 0.002, 0));
  }
  keep.zap_hit = { buf: hits[0], lufs: -17, vol: 1.2 };
  await add('chunting_zap_hit', hits, SP([6, 50], { lufs: -17, vol: 1.2, voices: 5, pitch: [0.94, 1.06], note: 'code: positional, vol 0.35, about one frame in three while the arcs land' }));

  // the kill (KE_CHAR, 2D, vol 0.6-0.9; also under the giant bolt at 0.5): a fat electric 「PAK」 (the split, the rip, a
  // 115 -> 44 Hz boom), the body jolted (a punch + a wet hit), the burn (recorded sizzle + a sear), the arcs crawling over
  // the charred body for 0.5 s (a sputtering 2x-mains arc), and the sting: the Tesla coil B5 -> E6 with a porcelain E6
  const punch = await grab(S.punch, 0, 0.67, { mode: 'peak', pre: 0.002, post: 0.2, hp: 90 });
  const kills = [];
  for (let k = 0; k < 3; k++) {
    const r = ctx.rng(`kl${k}`), sd = `kl${k}`;
    const ck = crack(0.3, { n: 34, spread: 0.06, big: 2.4 + r.range(0, 0.5), seed: sd + 'c', hp: 160 });
    const rp = rip(0.2, { density: 1500, t: 0.045, seed: sd + 'r' });
    const bm = boom({ f0: 115, f1: 44, sweep: 0.03, decay: 0.32, seed: sd + 'b' });
    const wet = await grab(S.wet, 0, 0.54, { mode: 'peak', pre: 0.002, post: 0.15, hp: 110, semis: -2 - k });
    const crawl = L.automate(buzz(0.62, { f: MAINS * 2, jit: 0.5, res: [2600, 5800], body: -12, rasp: -10, flick: 0.75, drop: 0.3, seed: sd + 'a' }), (t) => Math.min(1, t / 0.02) * (t < 0.42 ? 1 : Math.max(0, 1 - (t - 0.42) / 0.2)));
    const burn = L.automate(await recSizzle(80 + k * 11, 0.9, 2500), (t) => Math.min(1, t / 0.02) * Math.exp(-t / 0.3));
    const sting = L.mix([at(tesla(0.09, B5, { seed: sd + 't1', env: [[0, 0], [0.003, 1], [0.09, 0.6]] })), at(tesla(0.4, E6, { seed: sd + 't2', vib: 0.008, vibDelay: 0.05, env: [[0, 0.7], [0.01, 1], [0.12, 0.6], [0.4, 0]] }), 0.075),
      at(porcelain(E6, { t60: 0.6, seed: sd + 'p', knock: -20 }), 0.078, -5)]);
    let m = L.mix([at(ck, 0, 0), at(rp, 0.002, -8), at(bm, 0.002, -3), at(punch, 0.001, -9), at(wet, 0.003, -10), at(crawl, 0.03, -12), at(burn, 0.01, -14),
      at(nrm(sting), 0.025, -11), at(lux(sd + 'x', 7800), 0, -14)], { length: 1.1 });
    m = shape(L.psychoBass(thicken(m), { freq: 110, amount: -7 }), 'hit', 0.55);
    m = L.reverb(m, 'urban', { wet: 0.1, seed: sd + 'v', length: 1.0, channels: 1 });
    kills.push(L.pad(dense(L.fadeOut(L.slice(L.stereoize(m, { width: 0.35, hp: 400, seed: sd + 'w' }), 0, 1.1), 0.4, 'exp'), -15), 0.002, 0));
  }
  keep.kill = { buf: kills[0], lufs: -15, vol: 1 };
  await add('chunting_kill', kills, LOC({ lufs: -15, channels: 2, voices: 3, pitch: [0.98, 1.02], priority: 3, note: 'KE_CHAR (code: 2D, vol 0.6-0.9; 0.5 under the giant bolt)' }));
}

// ------------------------------------------------------------------------------------------------ RMB: 雷爆 / 驚蟄 charge
async function rmbSet(add, SP, LOC, keep) {
  // ◎ tap: the stab (the pole driven forward: a low, short whoosh and the sections rattling), then at 0.1 s the lance
  // leaving the spear: a split, a 2x-mains BZZT, the 「咻」 of the bolt pulling away (a band falling 6 -> 1.4 kHz), a sub kick
  const air = await src(S.swing, 0.0, 0.6, { hp: 120, semis: -5 });
  const thrusts = [];
  for (let k = 0; k < 3; k++) {
    const r = ctx.rng(`th${k}`), sd = `th${k}`, T = 0.1;
    const rat = await clank(k + 2, { semis: 4, hp: 500 });
    const sw = K.swish(0.2, 300, 1500, sd + 'w');
    const ck = crack(0.12, { n: 12, spread: 0.025, big: 1.6 + r.range(0, 0.4), seed: sd + 'c', hp: 250 });
    const zz = L.automate(buzz(0.18, { f: MAINS * 2, jit: 0.2, flick: 0.2, drop: 0, seed: sd + 'a' }), (t) => Math.min(1, t / 0.002) * Math.exp(-t / 0.05));
    const pew = L.applyEnv(L.sweep(L.noise(0.24, { color: 'pink', seed: sd + 'p' }), 'bp', (t) => 6000 * (1400 / 6000) ** (t / 0.24), { q: 2.2 }), L.envCurve(0.24, [[0, 0], [0.008, 1], [0.24, 0]]));
    const th = L.thump({ f0: 140, f1: 55, sweep: 0.02, decay: 0.12, click: 0, drive: 3, seed: sd + 't' });
    let m = L.mix([at(air, 0, -5), at(nrm(sw), 0, -8), at(rat, 0.02, -15), at(ck, T, 0), at(zz, T + 0.002, -5), at(nrm(pew), T + 0.004, -8), at(nrm(th), T + 0.002, -5), at(lux(sd + 'x'), T, -14)], { length: 0.5 });
    m = shape(L.psychoBass(m, { freq: 110, amount: -8 }), 'zap', 0.5);
    thrusts.push(L.pad(dense(L.fadeOut(m, 0.15, 'exp'), -16), 0.002, 0));
  }
  keep.thrust = { buf: thrusts[0], lufs: -16, vol: 1 };
  await add('chunting_thrust', thrusts, SP([6, 50], { lufs: -16, voices: 3, pitch: [0.97, 1.03], note: '雷爆 stab + lance (code: vol 0.8 local / 0.7 teammates; the blast is chunting_burst at the point 0.1 s later)' }));

  // 雷爆 (the blast at the point, positional, vol 1): a transformer blowing -- the split, the rip, a 0.12 s grid BZZT
  // under it, the boom (88 -> 36 Hz), a recorded blast (the metallic bang / a grenade / a medium blast), the arc shell
  // crackling off it, rubble, a short roll, and the weapon's voice in the flash: a Tesla E4 + B4 power chord stab
  const blasts = [[S.metalBang, 0.0, -6], [S.grenade, 0, -4], [S.medium, 0.2, -4]];
  const bursts = [];
  for (let k = 0; k < 3; k++) {
    const [id, t0, g] = blasts[k], r = ctx.rng(`bu${k}`), sd = `bu${k}`;
    const ck = crack(0.45, { n: 44, spread: 0.1, big: 2.8 + r.range(0, 0.5), seed: sd + 'c' });
    const rp = rip(0.3, { density: 1600, t: 0.07, seed: sd + 'r' });
    const hv = L.automate(buzz(0.2, { jit: 0.08, body: -2, rasp: -2, flick: 0.2, drop: 0, seed: sd + 'h' }), (t) => (t < 0.1 ? Math.min(1, t / 0.002) : Math.exp(-(t - 0.1) / 0.03)));
    const bm = boom({ f0: 88, f1: 36, sweep: 0.05, decay: 0.6, seed: sd + 'b' });
    const bl = await src(id, t0, t0 + 1.7, { hp: 40, semis: r.range(-2, 0) });
    const shell = L.automate(buzz(0.7, { f: (t) => MAINS * 2 * (1 - 0.5 * t), jit: 0.5, res: [2400, 5600], body: -10, flick: 0.5, drop: 0.1, seed: sd + 'a' }), (t) => Math.min(1, t / 0.01) * Math.exp(-t / 0.2));
    const db = await src(k % 2 ? S.rubble2 : S.rubble, 0, 0.8, { hp: 150 });
    const rl = rumble(1.7, { peaks: 3, lp0: 800, lp1: 180, seed: sd + 'u' });
    const stab = L.mix([at(tesla(0.35, E4, { seed: sd + 't1', env: [[0, 0], [0.004, 1], [0.35, 0]] })), at(tesla(0.35, B4, { seed: sd + 't2', env: [[0, 0], [0.004, 1], [0.35, 0]] }), 0, -2)]);
    let m = L.mix([at(ck, 0, 0), at(rp, 0.002, -6), at(hv, 0, -5), at(bm, 0.003, -1), at(bl, 0.004, g), at(shell, 0.02, -9), at(db, 0.03, -13), at(rl, 0.03, -7), at(nrm(stab), 0.002, -15)], { length: 1.7 });
    m = shape(L.psychoBass(m, { freq: 100, amount: -5 }), 'big', 0.6);
    m = L.reverb(m, 'urban', { wet: 0.14, seed: sd + 'v', length: 1.4, channels: 1 });
    bursts.push(L.pad(dense(L.fadeOut(L.slice(m, 0, 1.7), 0.65, 'exp'), -14), 0.002, 0));
  }
  keep.burst = { buf: bursts[0], lufs: -14, vol: 1 };
  await add('chunting_burst', bursts, SP([12, 160], { lufs: -14, voices: 3, pitch: [0.97, 1.03], priority: 3, note: '雷爆 at the point (code: positional, vol 1)' }));

  // 驚蟄 charge (loop 2 s, 2D; the code plays it at rate 0.8 and rides it up to 1.25 over the 2 s charge, §1.12 蓄力): the
  // transformer hum + the coils singing a low B3 (a jitter-free Tesla train) + the capacitor's whine on E7, pumping twice a
  // second (the capacitor bank filling); arcs wrapping the shaft (a sputtering 2x-mains arc), corona, snaps, the coils'
  // electromagnetic grit (the inductor take's steady stretch). Tonal parts on the 0.5 Hz grid.
  {
    const P = 2.0, X = 0.3, D = P + X, W = 0.5;
    const pump = (t) => 0.6 + 0.4 * (0.5 + 0.5 * Math.cos(2 * Math.PI * (4 / P) * (t - W))) ** 2;
    const tonal = L.automate(L.mix([at(hum(W + P, { P, seed: 'cgh' }), 0, -13), at(tesla(W + P, onGrid(B3, P), { jit: 0, seed: 'cgt', sizz: -40, body: -6, bright: 7000 }), 0, -5),
      at(tesla(W + P, onGrid(E4, P), { jit: 0, seed: 'cgu', sizz: -40, body: -6, bright: 7000 }), 0, -11),
      at(whine(W + P, onGrid(E7, P), { seed: 'cgw', air: -40 }), 0, -13), at(whine(W + P, onGrid(B6, P), { seed: 'cgv', air: -40 }), 0, -17)]), pump);
    const arcs = buzz(D, { f: MAINS * 2, jit: 0.4, res: [2600, 6000], body: -14, rasp: -8, flick: 0.7, drop: 0.35, seed: 'cga' });
    const r = ctx.rng('cgsn'), snaps = [];
    for (let i = 0; i < 9; i++) snaps.push(at(crack(0.06, { n: 6, spread: 0.015, big: 0.5 + r.next() * 0.8, seed: `cgs${i}`, hp: 500 }), r.range(0.25, P - 0.3), -8 - r.next() * 6));
    const em = await src(S.inductor, 12.5, 12.5 + D, { hp: 300 });
    const noisy = L.mix([at(arcs, 0, -8), at(corona(D, { seed: 'cgc' }), 0, -13), ...snaps, at(em, 0, -14), at(await recSizzle(120, D, 3500), 0, -16)], { length: D });
    const m = seamless(P, X, L.psychoBass(noisy, { freq: 110, amount: -11 }), L.psychoBass(nrm(tonal), { freq: 110, amount: -12 }), W);
    seamCheck('chunting_charge', m);
    keep.charge = { buf: m, lufs: -16, vol: 1.2 };
    await add('chunting_charge', m, LOC({ lufs: -16, vol: 1.2, loop: true, channels: 1, voices: 1, pitch: [1, 1], note: '驚蟄 charge (code: loop, vol 0.5, rate 0.8 -> 1.25)' }));
  }

  // a charge stage locking in (2D, vol 0.7; the code plays stage 1 at pitch 1.18 and stage 2 at 1.36): the contactor
  // slamming, the coils' kick (a sub thump), the Tesla coil on C#5 and a porcelain C#6 (-> E5 / E6 at 1.18, ~F#5 at
  // 1.36), a short grid BZZT, a spark burst, the luxury tick
  const stages = [];
  for (let k = 0; k < 2; k++) {
    const sd = `sg${k}`;
    const ct = await contactor(sd + 'c', { big: 1.35, which: k });
    const th = L.thump({ f0: 120, f1: 48, sweep: 0.03, decay: 0.18, click: 0, drive: 3, seed: sd + 't' });
    const ts = tesla(0.48, Cs5 * (1 + k * 0.003), { seed: sd + 's', vib: 0.006, vibDelay: 0.1, env: [[0, 0], [0.004, 1], [0.15, 0.7], [0.48, 0]] });
    const pc = porcelain(Cs6, { t60: 0.6, seed: sd + 'p', knock: -16 });
    const zz = L.automate(buzz(0.2, { f: MAINS * 2, jit: 0.2, flick: 0.2, drop: 0, seed: sd + 'a' }), (t) => Math.exp(-t / 0.05));
    const sp = L.automate(sizzle(0.3, { density: 1600, seed: sd + 'z' }), (t) => Math.exp(-t / 0.08));
    let m = L.mix([at(nrm(ct), 0, -2), at(nrm(th), 0.006, -4), at(ts, 0.01, -8), at(pc, 0.012, -12), at(zz, 0.008, -10), at(sp, 0.01, -15), at(lux(sd + 'x', 8200), 0.006, -14)], { length: 0.7 });
    m = L.psychoBass(m, { freq: 110, amount: -8 });
    stages.push(L.pad(dense(L.fadeOut(m, 0.25, 'exp'), -17), 0.002, 0));
  }
  keep.stage = { buf: stages[0], lufs: -17, vol: 1 };
  await add('chunting_stage', stages, LOC({ lufs: -17, channels: 1, voices: 2, pitch: [1, 1], note: 'rendered on C#: code pitch 1.18 / 1.36 (vol 0.7)' }));

  // the crescent swinging out on its hinge (vol 0.4-0.9; folding back at pitch 0.85): the hinge's dry scrape and a swish
  // (0-0.09 s), the spring detent slamming it home (a recorded helmet clank + a thump), the thick plate ringing on G#5
  // (dense plate modes), a lick of arc off the edge
  const blades = [];
  for (let k = 0; k < 3; k++) {
    const sd = `bl${k}`, T = 0.085;
    const cl = await clank(k, { semis: 2, hp: 250 });
    const sw = K.swish(0.1, 900, 3200, sd + 'w');
    const scr = K.scrape(0.09, 1800, 3800, sd + 's');
    const th = L.thump({ f0: 260, f1: 110, sweep: 0.008, decay: 0.06, click: 0.2, drive: 2, seed: sd + 't' });
    const ring = steel(midi(80) * (1 + k * 0.004), { kind: 'blade', t60: 0.75, seed: sd + 'r' });
    const zz = L.automate(buzz(0.07, { f: MAINS * 3, jit: 0.3, res: [3400, 7000], flick: 0.2, drop: 0, seed: sd + 'a' }), (t) => Math.exp(-t / 0.02));
    const m = L.mix([at(nrm(sw), 0, -9), at(nrm(scr), 0, -12), at(cl, T, 0), at(nrm(th), T + 0.002, -6), at(ring, T + 0.003, -9), at(zz, T + 0.01, -17), at(lux(sd + 'x', 6900), T, -16)], { length: 0.8 });
    blades.push(L.pad(dense(L.fadeOut(m, 0.3, 'exp'), -18), 0.003, 0));
  }
  keep.blade = { buf: blades[0], lufs: -18, vol: 1 };
  await add('chunting_blade', blades, LOC({ lufs: -18, channels: 1, voices: 2, pitch: [0.98, 1.02], note: 'crescent out (code: vol 0.4-0.9; folded back at pitch 0.85)' }));
}

// ------------------------------------------------------------------------------------------------ 驚蟄落雷
async function throwSet(add, SP, LOC, keep) {
  // the cast (2D, vol 1, the code starts it 0.1 s into the throw: the halberd leaves the hand ~0.06 s in): the body's heave
  // (a deep, long whoosh), the halberd's mass tearing the air (a recorded swing 6 st down), the release crack + a sub kick,
  // the coils' arcs ripped away with it (a 2x-mains arc whose band falls 6 kHz -> 900 Hz), sparks; panned across
  const swing = await src(S.swing, 0.0, 1.1, { hp: 150, semis: -4 });
  const swoosh = await src(S.swoosh, 0.2, 0.75, { hp: 300, semis: -2 });
  const throws = [];
  for (let k = 0; k < 2; k++) {
    const sd = `tw${k}`, T = 0.06;
    const deep = L.whoosh({ dur: 0.42, f0: 260, f1: 1500, q: 1.3, seed: sd + 'd' });
    const tear = K.swish(0.3, 1400, 4200, sd + 'h');
    const ck = crack(0.12, { n: 14, spread: 0.025, big: 1.6, seed: sd + 'c', hp: 300 });
    const th = L.thump({ f0: 120, f1: 50, sweep: 0.03, decay: 0.14, click: 0, drive: 3, seed: sd + 't' });
    const zh = L.automate(L.sweep(buzz(0.55, { f: (t) => MAINS * 2 * (1 - 0.35 * t), jit: 0.3, body: -10, rasp: -5, air: -8, flick: 0.4, drop: 0.05, seed: sd + 'a' }), 'lp', (t) => 7000 * (1200 / 7000) ** Math.min(1, t / 0.5), { q: 0.9 }), (t) => Math.min(1, t / 0.01) * Math.exp(-t / 0.2));
    const sz = L.automate(sizzle(0.4, { density: 1800, seed: sd + 's' }), (t) => Math.exp(-t / 0.12));
    let m = L.mix([at(L.toStereo(nrm(deep)), 0, -5), at(L.toStereo(swing), 0.0, -4), at(L.stereoize(swoosh, { width: 0.4, hp: 600, seed: sd + 'o' }), 0.03, -6), at(L.stereoize(nrm(tear), { width: 0.5, hp: 800, seed: sd + 'e' }), 0.04, -7),
      at(L.toStereo(ck), T, -3), at(L.toStereo(nrm(th)), T, -9), at(L.stereoize(zh, { width: 0.5, hp: 300, seed: sd + 'z' }), T + 0.004, -3), at(L.toStereo(sz), T + 0.01, -13), at(L.toStereo(lux(sd + 'x', 7000)), T, -14)], { channels: 2, length: 0.75 });
    m = shape(L.psychoBass(m, { freq: 100, amount: -10 }), 'zap', 0.5);
    throws.push(L.pad(dense(L.fadeOut(m, 0.25, 'exp'), -15), 0.002, 0));
  }
  keep.throw = { buf: throws[0], lufs: -15, vol: 1 };
  await add('chunting_throw', throws, LOC({ lufs: -15, channels: 2, voices: 1, pitch: [0.98, 1.02], note: 'code: 2D, vol 1, delay 0.096 s' }));

  // in flight (local 2D / teammates at the launch point, vol 0.6; stopped on landing, up to 1.3 s): its arcs buzzing (a
  // 2x-mains arc, doppler 1 -> 0.95), the air roaring over the shaft, a faint shaft whistle, crackle; receding (the local
  // player threw it): level 1 -> 0.35, low-pass 9 -> 2.5 kHz
  const flies = [];
  for (let k = 0; k < 2; k++) {
    const sd = `fl${k}`, T = 1.5;
    const arcs = buzz(T, { f: (t) => MAINS * 2 * (1 - 0.05 * t / T), jit: 0.3, flick: 0.5, drop: 0.08, seed: sd + 'a' });
    const roar = L.sweep(L.noise(T, { color: 'pink', seed: sd + 'r' }), 'bp', (t) => 1300 - 450 * t / T, { q: 0.8 });
    const wh = L.tone(T, { type: 'sine', freq: (t) => 1850 * (1 - 0.05 * t / T) });
    const cr = L.crackle(T, { density: 120, decay: 0.002, hp: 2500, seed: sd + 'c' });
    let m = L.mix([at(arcs, 0, -3), at(nrm(roar), 0, -6), at(nrm(wh), 0, -24), at(nrm(cr), 0, -14)], { length: T });
    m = L.sweep(m, 'lp', (t) => 9000 * (2500 / 9000) ** (t / T), { q: 0.7 });
    m = L.automate(m, (t) => Math.min(1, t / 0.03) * (1 - 0.65 * (t / T) ** 0.8));
    flies.push(L.pad(dense(L.fadeOut(L.psychoBass(m, { freq: 110, amount: -9 }), 0.2, 'exp'), -18), 0.002, 0));
  }
  keep.fly = { buf: flies[0], lufs: -18, vol: 1 };
  await add('chunting_fly', flies, SP([10, 120], { lufs: -18, voices: 2, pitch: [0.98, 1.02], note: 'javelin flight (code: vol 0.6, stopped on landing)' }));

  // driven into the street (positional, vol 1): the concrete cracking (a smash + a hit), the spear's heavy thud, an arc
  // grounding (a split + a BZZT), a boom, rubble, and the shaft juddering: steel-bar modes on E3 wobbling at ~14 Hz
  // (the stuck javelin's 「嗡」)
  const smash = await src(S.concSmash, 0, 1.28, { hp: 70 });
  const hit = L.fadeOut(await src(S.concHit, 0, 0.4, { hp: 90 }), 0.12, 'exp');   // (its debris bounce at 0.45 s read as a second hit)
  const thud = await src(S.metalThud, 0.15, 0.75, { hp: 50 });
  const impacts = [];
  for (let k = 0; k < 3; k++) {
    const r = ctx.rng(`im${k}`), sd = `im${k}`;
    const f = E3 * (1 + r.range(-0.01, 0.01)), wob = 13 + k * 1.5;
    const jd = L.automate(L.mix([at(steel(f, { kind: 'bar', t60: 1.5, seed: sd + 's', strike: -30 })), at(steel(f * 2.02, { kind: 'bar', t60: 0.9, seed: sd + 'q', strike: -30 }), 0, -5)]),
      (t) => (0.3 + 0.7 * (0.5 + 0.5 * Math.cos(2 * Math.PI * wob * (1 - 0.15 * t) * t))) * Math.min(1, t / 0.01));
    const ck = crack(0.15, { n: 14, spread: 0.03, big: 1.8, seed: sd + 'c', hp: 250 });
    const gz = L.automate(buzz(0.14, { f: MAINS * 2, jit: 0.3, flick: 0.3, drop: 0, seed: sd + 'a' }), (t) => Math.exp(-t / 0.04));
    const bm = boom({ f0: 100, f1: 40, sweep: 0.03, decay: 0.3, seed: sd + 'b' });
    const db = await src(k % 2 ? S.rubble : S.rubble2, 0, 0.8, { hp: 160 });
    let m = L.mix([at(smash, 0, -2), at(hit, 0.002, -8), at(thud, 0, -4), at(ck, 0.003, -5), at(gz, 0.005, -9), at(bm, 0.002, -3), at(db, 0.02, -12), at(nrm(jd), 0.004, -5)], { length: 1.4 });
    m = shape(L.psychoBass(m, { freq: 100, amount: -6 }), 'big', 0.55);
    m = L.reverb(m, 'urban', { wet: 0.12, seed: sd + 'v', length: 1.2, channels: 1 });
    impacts.push(L.pad(dense(L.fadeOut(L.slice(m, 0, 1.4), 0.5, 'exp'), -15), 0.002, 0));
  }
  keep.impact = { buf: impacts[0], lufs: -15, vol: 1 };
  await add('chunting_impact', impacts, SP([10, 150], { lufs: -15, voices: 2, pitch: [0.97, 1.03], priority: 3, note: 'stuck in the street (code: positional, vol 1)' }));

  // ① rise: 遠雷滾動 (positional at the landing point, vol 0.8, from the throw on; the strike lands 1.4-2.5 s in): far
  // thunder rolling in (the recorded roll slowed, a sub roll, a synthesized rumble of five rolls), wind swirling up, far
  // splits flickering in the cloud, the cello section's tremolo on E2 swelling under it; one crescendo peaking ~2.4 s
  const wind = await src(S.wind, 20, 24, { hp: 120 });
  const trem = await src(S.celloTremE2, 0.3, 3.8, { hp: 60 });
  const rolls = [];
  for (let k = 0; k < 2; k++) {
    const sd = `tr${k}`, T = 3.4;
    // the recorded rolls decay by themselves: flattened first, so the crescendo is ours
    const rl = flatten(L.lp(await src(S.roll, 0.0, 4.2, { hp: 35, rate: 0.72 + k * 0.05 }), 1100));
    const sr = flatten(L.lp(await src(S.rollSub, 0.2 + k * 0.3, 4.6, { hp: 30 }), 700));
    const rb = rumble(T, { peaks: 7, lp0: 500, lp1: 900, seed: sd + 'u', first: 0.05, spanEnd: 0.85 });
    const sw = L.automate(L.sweep(L.slice(wind, k * 0.4, k * 0.4 + T), 'bp', (t) => 250 * 2.8 ** Math.min(1, t / 2.4), { q: 0.9 }), (t) => Math.min(1, t / 0.6) * (t < 2.5 ? 1 : Math.max(0, 1 - (t - 2.5) / 0.9)));
    const far = (i, t0, g) => at(L.airAbsorption(crack(0.22, { n: 16, spread: 0.06, big: 1.6, seed: `${sd}f${i}` }), 350), t0, g);
    const tr = L.automate(trem, (t) => Math.min(1, t / 2.2) ** 1.6 * (t < 2.6 ? 1 : Math.max(0, 1 - (t - 2.6) / 0.8)));
    let m = L.mix([at(L.automate(rl, (t) => Math.min(1, t / 0.15))), at(sr, 0.05, -5), at(rb, 0, -4), at(nrm(sw), 0, -7), far(0, 0.7 + k * 0.15, -13), far(1, 1.45, -10), far(2, 2.05 - k * 0.1, -8), far(3, 2.35, -7), at(tr, 0.1, -12)], { length: T });
    m = L.automate(m, (t) => (0.12 + 0.88 * Math.min(1, t / 2.4) ** 1.8) * (t < 2.6 ? 1 : Math.max(0.15, 1 - (t - 2.6) / 0.8)));
    m = L.psychoBass(m, { freq: 90, amount: -5 });
    m = space(m, { wet: 0.25, seed: sd + 'v', length: 2.4 });
    rolls.push(L.pad(dense(L.fadeOut(L.slice(m, 0, T), 0.8, 'exp'), -16), 0.003, 0));
  }
  keep.roll = { buf: rolls[0], lufs: -16, vol: 1 };
  await add('chunting_thunder_roll', rolls, SP([25, 400], { lufs: -16, voices: 2, pitch: [0.97, 1.03], maxHeadMs: 30, note: '§1.12 ult layer 1 (rise): the cloud gathering (code: positional at the target, vol 0.8)' }));

  // a streamer climbing off the crown (positional, vol 0.35, pitch 1 -> 1.48 as the strike nears): a reversed spark
  // shower swelling, an arc chirp rising (300 -> 1000 Hz), a tiny snap
  const streams = [];
  for (let k = 0; k < 4; k++) {
    const sd = `sm${k}`, T = 0.17;
    const rs = L.automate(L.reverse(sizzle(T, { density: 2200, seed: sd + 's' })), ramp(T, 2.5));
    const chp = L.automate(buzz(T + 0.01, { f: (t) => 300 * (1000 / 300) ** (t / T), jit: 0.3, res: [3000, 7000], body: -14, rasp: -12, flick: 0.3, drop: 0, seed: sd + 'a' }), ramp(T, 1.5));
    const sn = crack(0.05, { n: 4, spread: 0.008, big: 0.7, seed: sd + 'c', hp: 600 });
    streams.push(L.pad(L.fadeOut(L.mix([at(rs, 0, -4), at(chp, 0, -4), at(sn, T, -2)], { length: 0.24 }), 0.05, 'exp'), 0.002, 0));
  }
  keep.streamer = { buf: streams[0], lufs: -19, vol: 1 };
  await add('chunting_streamer', streams, SP([8, 70], { lufs: -19, voices: 4, pitch: [0.95, 1.05], maxHeadMs: 25, note: 'code: positional, vol 0.35, pitch 1 -> 1.48' }));

  // ② + ③ the giant bolt (positional, vol 1.2):
  //   impact: the biggest split, the rip, a 60 -> 40 Hz sub with tube harmonics, the huge blast's long crash, a deep one,
  //   a bass drum; the halberd itself struck (steel-bar modes on E2 and B3 ringing long, the porcelain on E6 / B6)
  //   the roll: the recorded roll slowed, the sub roll, a six-roll rumble
  //   bed: the 驚蟄 chord on E -- tuba E1, trombone E2, horn E3, the choir's O, the timpani rolling on E2, the cellos'
  //   tremolo -- and the halberd's own voice over it: the Tesla coil singing E3 B3 E4 G#4 with a slow vibrato
  //   release: the transformer powering down (the inductor take's spin-down + the hum sliding B2 -> B0), an ozone hiss,
  //   embers
  const huge = await src(S.crash, 0.0, 3.6, { hp: 35 });
  const deep = await src(S.deep, 0.0, 2.2, { hp: 35 });
  const bd = await src(S.bdrum, 0.08, 2.6, { hp: 30 });
  const tuba = L.fadeIn(await src(S.tubaF1, 0.05, 3.6, { hp: 30, semis: -1 }), 0.2, 'sine');
  const tbn = L.fadeIn(await src(S.tbnF2, 0.2, 4.2, { hp: 45, semis: -1 }), 0.2, 'sine');
  const horn = L.fadeIn(await src(S.hornF3, 0.3, 4.4, { hp: 80, semis: -1 }), 0.25, 'sine');
  const choir = L.fadeIn(await src(S.choirO, 1.4, 5.2, { hp: 140, semis: -1 }), 0.3, 'sine');
  const troll = L.fadeIn(await src(S.timpRollF2, 1.0, 5.0, { hp: 30, semis: -1 }), 0.1, 'sine');
  const spin = L.lp(await src(S.inductor, 16.9, 19.6, { hp: 150 }), 6000);
  const thunders = [];
  for (let k = 0; k < 2; k++) {
    const sd = `ut${k}`, T = 5.0;
    const ck = crack(0.5, { n: 70, spread: 0.16, big: 3.6, seed: sd + 'c' });
    const rp = rip(0.45, { density: 1800, t: 0.1, seed: sd + 'r' });
    const sub = L.saturate(L.thump({ f0: 60, f1: 40, sweep: 0.06, decay: 0.9, dur: 1.3, click: 0, drive: 1.5, seed: sd + 'b' }), { drive: 4, type: 'tube', mix: 0.45 });
    const rl = L.lp(await src(S.roll, 0.0, 5.0, { hp: 35, rate: 0.76 + k * 0.04 }), 1300);
    const sr = L.lp(await src(S.rollSub, 0.15, 5.0, { hp: 30 }), 800);
    const rb = rumble(4.2, { peaks: 6, lp0: 700, lp1: 130, seed: sd + 'u', first: 0.1, spanEnd: 0.6 });
    const struck = L.mix([at(steel(E2, { kind: 'bar', t60: 2.4, seed: sd + 'sa', strike: -20 })), at(steel(B3, { kind: 'bar', t60: 1.6, seed: sd + 'sb', strike: -24 }), 0.004, -4),
      at(porcelain(E6, { t60: 1.4, seed: sd + 'pa', knock: -30 }), 0.01, -8), at(porcelain(B6 * 1.002, { t60: 1.1, seed: sd + 'pb', knock: -30 }), 0.02, -11)]);
    const voice = L.mix([E3, B3, E4, Gs4].map((f, i) => at(tesla(3.4, f * (1 + (k ? 0.002 : -0.001) * (i + 1)), { seed: `${sd}t${i}`, vib: 0.006, vibHz: 4.6 + i * 0.4, vibDelay: 0.3, sizz: -26, body: -5, bright: 7000,
      env: [[0, 0], [0.25, 1], [1.9, 0.85], [3.4, 0]] }), 0, -2 - i * 1.5)));
    const bed = L.mix([at(tuba, 0, -3), at(tbn, 0.03, -3), at(horn, 0.06, -4), at(choir, 0.12, -5), at(troll, 0, -5), at(trem, 0, -9), at(L.lp(nrm(voice), 5000), 0.05, -4)], { length: T });
    const bedE = L.automate(nrm(bed), (t) => (t < 0.35 ? t / 0.35 : t < 2.3 ? 1 : Math.max(0, 1 - (t - 2.3) / 1.4)) ** 1.2);
    if (!k) ctx.preview('thunder_bed', bedE);   // (QA: the chord alone)
    const fallHum = L.fadeOut(L.automate(hum(2.0, { f: (t) => B2 * (B0 / B2) ** Math.min(1, t / 1.5), seed: sd + 'h' }), (t) => Math.min(1, t / 0.08) * Math.exp(-t / 0.7)), 0.4, 'sine');
    const ozone = L.applyEnv(L.sweep(L.noise(1.6, { color: 'pink', seed: sd + 'o' }), 'bp', (t) => 4500 * (700 / 4500) ** (t / 1.6), { q: 1.1 }), L.envCurve(1.6, [[0, 0], [0.15, 1], [0.7, 0.5], [1.6, 0]]));
    const embers = L.automate(L.crackle(2.6, { density: 30, decay: 0.003, hp: 1800, seed: sd + 'e' }), (t) => Math.min(1, t / 0.3) * Math.exp(-t * 0.9));
    // the strike and its roll fall away from the split (loudest in the first 0.5 s, half by 2 s), the chord and the
    // halberd's ring stay up over them, the power-down comes through as the roll thins
    const hit = L.automate(L.mix([at(ck, 0, 0), at(rp, 0.002, -5), at(nrm(sub), 0.002, 0), at(L.automate(huge, (t) => (t < 0.25 ? 1 : Math.exp(-(t - 0.25) * 1.3))), 0.004, -4),
      at(L.automate(deep, (t) => (t < 0.2 ? 1 : Math.exp(-(t - 0.2) * 2))), 0.004, -6), at(bd, 0.003, -6),
      at(L.automate(rl, (t) => Math.min(1, t / 0.08)), 0.05, -5), at(sr, 0.04, -7), at(rb, 0.06, -6)], { length: T }), (t) => (t < 0.45 ? 1 : 0.45 + 0.55 * Math.exp(-(t - 0.45) / 0.9)));
    let m = L.mix([at(hit), at(nrm(struck), 0.005, -10), at(bedE, 0.12, -8), at(nrm(L.automate(spin, (t) => Math.min(1, t / 0.2))), 2.2, -15), at(nrm(fallHum), 2.1, -15), at(nrm(ozone), 1.9, -15), at(nrm(embers), 1.4, -20)], { length: T });
    m = shape(L.psychoBass(m, { freq: 100, amount: -5 }), 'big', 0.5);
    m = space(m, { wet: 0.24, seed: sd + 'v', length: 2.6 });
    thunders.push(L.pad(dense(L.fadeOut(L.slice(m, 0, T), 1.2, 'exp'), -12, 1.5), 0.002, 0));
  }
  keep.thunder = { buf: thunders[0], lufs: -12, vol: 1 };
  await add('chunting_thunder', thunders, SP([25, 450], { lufs: -12, voices: 2, pitch: [0.99, 1.01], priority: 5, note: '§1.12 ult layers 2 + 3: impact, the 驚蟄 chord, the power-down (code: positional, vol 1.2)' }));

  // pulled free and flying home (positional at the landing point, vol 0.8; 0.22-0.5 s back): the spear wrenched out of
  // the concrete (a crunch + grit), a metal scrape, the arcs re-lighting (a split + a BZZT), the whoosh coming at you (a
  // band rising 600 Hz -> 3.5 kHz, swelling), a short sub
  const returns = [];
  for (let k = 0; k < 2; k++) {
    const sd = `rt${k}`, T = 0.7;
    const crunch = await src(k ? S.rubble2 : S.rubble, 0, 0.5, { hp: 200 });
    const scr = K.scrape(0.18, 2200, 900, sd + 's');
    const ck = crack(0.08, { n: 8, spread: 0.02, big: 1.2, seed: sd + 'c', hp: 300 });
    const zz = L.automate(buzz(0.6, { f: MAINS * 2, jit: 0.3, flick: 0.5, drop: 0.05, seed: sd + 'a' }), (t) => Math.min(1, t / 0.4) ** 1.5 * (t < 0.55 ? 1 : 0.2));
    const wh = L.automate(L.sweep(L.noise(0.6, { color: 'pink', seed: sd + 'w' }), 'bp', (t) => 600 * (3500 / 600) ** (t / 0.6), { q: 1.6 }), (t) => (Math.min(1, t / 0.55) ** 2) * (t < 0.56 ? 1 : Math.exp(-(t - 0.56) / 0.03)));
    const th = L.thump({ f0: 120, f1: 50, sweep: 0.02, decay: 0.12, click: 0, drive: 3, seed: sd + 't' });
    const m = L.mix([at(crunch, 0, -3), at(nrm(scr), 0.01, -10), at(ck, 0.02, -5), at(nrm(th), 0.005, -6), at(zz, 0.05, -10), at(nrm(wh), 0.08, -5)], { length: T });
    returns.push(L.pad(dense(L.fadeOut(L.psychoBass(m, { freq: 110, amount: -9 }), 0.08, 'exp'), -17), 0.002, 0));
  }
  keep.ret = { buf: returns[0], lufs: -17, vol: 1 };
  await add('chunting_return', returns, SP([8, 80], { lufs: -17, voices: 2, pitch: [0.97, 1.03], note: 'code: positional at the landing point, vol 0.7' }));

  // coming home (2D for the thrower, vol 0.85, started so it ends on the catch; the code rides its rate 0.85 -> 1.35 as
  // it closes in: a doppler rise; teammates positional at their hand): a band of air sweeping 380 Hz -> 3.2 kHz and
  // swelling, the shaft's whistle gliding up a fifth, its arcs buzzing (2x mains, rising), a flutter (the halberd turning
  // over at ~16 Hz); cut sharp at 0.42 s (the catch takes over)
  const whooshes = [];
  for (let k = 0; k < 2; k++) {
    const sd = `rw${k}`, T = 0.44;
    const band = L.automate(L.sweep(L.noise(T, { color: 'pink', seed: sd + 'n' }), 'bp', (t) => 380 * (3200 / 380) ** Math.min(1, t / 0.42), { q: 1.4 }), (t) => (Math.min(1, t / 0.42) ** 2.2) * (1 + 0.35 * Math.sin(t * Math.PI * 32)));
    const deep = L.whoosh({ dur: 0.42, f0: 160, f1: 900, q: 1.2, seed: sd + 'd' });
    const wh = L.automate(L.tone(T, { type: 'sine', freq: (t) => 1240 * (1 + 0.5 * Math.min(1, t / 0.42) ** 2) }), (t) => Math.min(1, t / 0.42) ** 3);
    const zz = L.automate(buzz(T, { f: (t) => MAINS * 2 * (1 + 0.25 * t / T), jit: 0.3, flick: 0.5, drop: 0.05, seed: sd + 'a' }), (t) => Math.min(1, t / 0.42) ** 2.5);
    let m = L.mix([at(nrm(band), 0, -3), at(nrm(deep), 0, -8), at(nrm(wh), 0, -22), at(zz, 0, -11)], { length: T });
    m = L.automate(m, (t) => (t < 0.42 ? 1 : Math.exp(-(t - 0.42) / 0.006)));
    whooshes.push(L.pad(dense(L.psychoBass(m, { freq: 110, amount: -9 }), -16), 0.002, 0));
  }
  await add('chunting_return_whoosh', whooshes, SP([6, 60], { lufs: -16, voices: 2, pitch: [0.98, 1.02], note: 'code: 2D for the thrower (vol 0.85, delayed to end on the catch, rate 0.85 -> 1.35) / teammates positional 0.6' }));

  // caught (2D, vol 0.9; teammates positional 0.7): the glove slapping onto the rubber (a punch), the steel sections
  // rattling (a helmet clank, a small pitch up), a coil jolt (a split + a 0.1 s BZZT), a sub kick, a porcelain tick
  const punch = await grab(S.punch, 0, 0.67, { mode: 'peak', pre: 0.002, post: 0.15, hp: 120, semis: -2 });
  const catches = [];
  for (let k = 0; k < 3; k++) {
    const sd = `cc${k}`;
    const rat = await clank(k + 4, { semis: 3, hp: 300 });
    const ck = crack(0.08, { n: 8, spread: 0.02, big: 1.3, seed: sd + 'c', hp: 300 });
    const zz = L.automate(buzz(0.14, { f: MAINS * 2, jit: 0.2, flick: 0.2, drop: 0, seed: sd + 'a' }), (t) => Math.exp(-t / 0.04));
    const th = L.thump({ f0: 140, f1: 55, sweep: 0.02, decay: 0.1, click: 0, drive: 3, seed: sd + 't' });
    const pc = porcelain(B6 * (1 + k * 0.003), { t60: 0.3, seed: sd + 'p', knock: -14 });
    const m = L.mix([at(punch, 0, -1), at(rat, 0.012, -5), at(nrm(th), 0.002, -4), at(ck, 0.02, -6), at(zz, 0.022, -9), at(pc, 0.03, -18)], { length: 0.55 });
    catches.push(L.pad(dense(L.fadeOut(L.psychoBass(m, { freq: 110, amount: -9 }), 0.2, 'exp'), -17), 0.002, 0));
  }
  keep.catch = { buf: catches[0], lufs: -17, vol: 1 };
  await add('chunting_catch', catches, SP([4, 40], { lufs: -17, voices: 2, pitch: [0.97, 1.03], note: 'code: 2D vol 0.9 / teammates positional 0.7' }));
}

// ------------------------------------------------------------------------------------------------ 雷樁
async function rodSet(add, SP) {
  // planted (local 2D / teammates positional, vol 0.9; the rod lands 0.12 s in): the rod falling 7 m (a whistle diving
  // 3 kHz -> 1.1 kHz over a falling band), the bolt striking it as it lands (the split, the rip, the boom), the steel
  // driven into the street (concrete + the deep clang), the rod ringing (bar modes on B3) with its porcelain cap (E6),
  // the hum coming on (the loop takes over)
  const smash = await src(S.concSmash, 0, 1.28, { hp: 80 });
  const clang = await src(S.clang, 0, 1.12, { hp: 60 });
  const plants = [];
  for (let k = 0; k < 2; k++) {
    const sd = `rp${k}`, T0 = 0.12, T = 1.6;
    const fallB = L.applyEnv(L.sweep(L.noise(T0 + 0.02, { color: 'pink', seed: sd + 'f' }), 'bp', (t) => 4200 * (1200 / 4200) ** Math.min(1, t / T0), { q: 2 }), L.envCurve(T0 + 0.02, [[0, 0.2], [T0, 1], [T0 + 0.02, 0]]));
    const whis = L.applyEnv(L.tone(T0 + 0.02, { type: 'sine', freq: (t) => 3000 * (1100 / 3000) ** Math.min(1, t / T0) }), L.envCurve(T0 + 0.02, [[0, 0.1], [T0, 1], [T0 + 0.02, 0]]));
    const ck = crack(0.4, { n: 40, spread: 0.09, big: 2.6, seed: sd + 'c' });
    const rp = rip(0.3, { density: 1500, t: 0.06, seed: sd + 'r' });
    const bm = boom({ f0: 95, f1: 38, sweep: 0.04, decay: 0.5, seed: sd + 'b' });
    const ring = L.mix([at(steel(B3 * (1 + k * 0.003), { kind: 'bar', t60: 1.4, seed: sd + 's', strike: -18 })), at(porcelain(E6, { t60: 0.9, seed: sd + 'p', knock: -24 }), 0.004, -7)]);
    const hm = L.automate(hum(T - T0, { seed: sd + 'h' }), (t) => Math.min(1, t / 0.4) * 0.6);
    const rb = rumble(1.4, { peaks: 2, lp0: 700, lp1: 180, seed: sd + 'u' });
    let m = L.mix([at(nrm(fallB), 0, -10), at(nrm(whis), 0, -18), at(ck, T0, 0), at(rp, T0 + 0.002, -7), at(bm, T0 + 0.002, -2), at(smash, T0 + 0.002, -5), at(clang, T0 + 0.003, -6),
      at(nrm(ring), T0 + 0.005, -11), at(rb, T0 + 0.03, -9), at(hm, T0 + 0.1, -17), at(lux(sd + 'x'), T0, -14)], { length: T });
    m = shape(L.psychoBass(m, { freq: 100, amount: -5 }), 'big', 0.55);
    m = L.reverb(m, 'urban', { wet: 0.14, seed: sd + 'v', length: 1.3, channels: 1 });
    plants.push(L.pad(dense(L.fadeOut(L.slice(m, 0, T), 0.6, 'exp'), -14), 0.002, 0));
  }
  await add('chunting_rod_plant', plants, SP([12, 200], { lufs: -14, voices: 2, pitch: [0.98, 1.02], priority: 3, note: '雷樁 (code: vol 0.9; the rod lands 0.12 s in)' }));

  // the rod standing (loop 4 s, positional, vol 0.45, 8 s): a lightning rod under a charged sky -- the transformer hum (on
  // the 1/4 Hz grid) pulsing slowly like a beacon, power-line corona in grid pulses, a faint sputtering arc, seven crown
  // snaps (one every ~0.6 s: the visual crackle), recorded sizzle
  {
    const P = 4.0, X = 0.4, D = P + X, W = 0.5;
    const tonal = L.automate(hum(W + P, { P, seed: 'rlh' }), (t) => 0.75 + 0.25 * Math.cos(2 * Math.PI * (2 / P) * (t - W)));
    const r = ctx.rng('rlsn'), snaps = [];
    for (let i = 0; i < 7; i++) snaps.push(at(crack(0.08, { n: 7, spread: 0.02, big: 0.6 + r.next() * 0.8, seed: `rls${i}`, hp: 450 }), (i + r.range(0.1, 0.8)) * (D / 7.3), -6 - r.next() * 6));
    const noisy = L.mix([at(corona(D, { seed: 'rlc', f: onGrid(MAINS, P) }), 0, -3), at(buzz(D, { jit: 0.5, flick: 0.8, drop: 0.5, body: -10, rasp: -90, seed: 'rla' }), 0, -11), ...snaps, at(await recSizzle(140, D, 3200), 0, -14)], { length: D });
    const m = seamless(P, X, L.psychoBass(noisy, { freq: 110, amount: -10 }), L.gain(L.psychoBass(nrm(tonal), { freq: 110, amount: -12 }), -8), W);
    seamCheck('chunting_rod_loop', m);
    await add('chunting_rod_loop', m, SP([5, 40], { lufs: -19, loop: true, voices: 3, pitch: [1, 1], note: 'code: positional loop, vol 0.45, 8 s' }));
  }

  // the rod drawing an arc into a zombie (positional, vol 0.6): a hard split, a 0.1 s BZZT on 2x mains, the body taking
  // it (a wet hit + a thump), a burn, the rod's faint ring (B3)
  const arcs = [];
  for (let k = 0; k < 4; k++) {
    const r = ctx.rng(`ra${k}`), sd = `ra${k}`, j = 1 + r.range(-0.05, 0.05);
    const ck = crack(0.1, { n: 12, spread: 0.02, big: 1.8 + r.range(0, 0.5), seed: sd + 'c', hp: 220 });
    const zz = L.automate(buzz(0.16, { f: MAINS * 2 * j, jit: 0.2, flick: 0.25, drop: 0, seed: sd + 'a' }), (t) => (t < 0.08 ? 1 : Math.exp(-(t - 0.08) / 0.03)));
    const wet = await grab(S.wet, 0, 0.54, { mode: 'peak', pre: 0.002, post: 0.1, hp: 130, semis: -1 - (k % 3) });
    const th = L.thump({ f0: 160, f1: 60, sweep: 0.015, decay: 0.09, click: 0, drive: 3, seed: sd + 't' });
    const burn = L.automate(sizzle(0.3, { density: 1700, seed: sd + 's' }), (t) => Math.exp(-t / 0.08));
    const ring = steel(B3 * j, { kind: 'bar', t60: 0.5, seed: sd + 'r', strike: -30 });
    const m = L.mix([at(ck, 0, 0), at(zz, 0.001, -4), at(wet, 0.004, -9), at(nrm(th), 0.003, -6), at(burn, 0.01, -14), at(ring, 0.002, -18)], { length: 0.4 });
    arcs.push(L.pad(dense(L.fadeOut(shape(L.psychoBass(m, { freq: 120, amount: -9 }), 'hit', 0.55), 0.12, 'exp'), -16), 0.002, 0));
  }
  await add('chunting_rod_arc', arcs, SP([8, 70], { lufs: -16, voices: 4, pitch: [0.95, 1.05], note: 'code: positional, vol 0.6' }));

  // the rod powering down and sinking (positional, vol 0.6): a last spark, the hum sliding B2 -> B0 and out, the rod
  // grinding down into the street (a scrape falling 1.2 kHz -> 300 Hz + gravel), an ozone hiss
  const ends = [];
  for (let k = 0; k < 2; k++) {
    const sd = `re${k}`, T = 1.1;
    const ck = crack(0.1, { n: 10, spread: 0.02, big: 1.4, seed: sd + 'c', hp: 300 });
    const dn = L.fadeOut(L.automate(hum(T, { f: (t) => B2 * (B0 / B2) ** Math.min(1, t / 0.7), seed: sd + 'h' }), (t) => Math.min(1, t / 0.01) * Math.exp(-t / 0.3)), 0.3, 'sine');
    const scr = K.scrape(0.55, 1200, 300, sd + 's');
    const gr = await src(k ? S.rubble : S.rubble2, 0.1, 0.7, { hp: 250 });
    const hs = L.applyEnv(L.eq(L.noise(0.8, { color: 'pink', seed: sd + 'o' }), [{ type: 'hp', f: 2500, order: 2 }]), L.envCurve(0.8, [[0, 0], [0.05, 1], [0.8, 0]]));
    const m = L.mix([at(ck, 0, 0), at(nrm(dn), 0, -6), at(nrm(scr), 0.05, -9), at(gr, 0.08, -13), at(nrm(hs), 0.02, -15)], { length: T });
    ends.push(L.pad(L.fadeOut(m, 0.3, 'exp'), 0.002, 0));
  }
  await add('chunting_rod_end', ends, SP([6, 50], { lufs: -19, voices: 2, pitch: [0.98, 1.02], note: 'code: positional, vol 0.6' }));
}

// ------------------------------------------------------------------------------------------------ view / foley
async function viewSet(add, LOC, keep) {
  // §1.12 待機嗡鳴 (loop 5 s, 2D, the code plays it at vol 0.12 with a 0.4 s fade-in: ~28 dB under a gunshot): sines on
  // B1 and B2 (straddling 55-110 Hz) with a hint of the hum's 3rd, a band of noise 400-1200 Hz whose centre an 0.2 Hz LFO
  // sweeps, the capacitor tube's tiny arcs (three ticks a loop), a whisper of corona. Sines on the 0.2 Hz grid.
  {
    const P = 5.0, X = 0.5, D = P + X;
    const pt = (f) => L.tone(P, { type: 'sine', freq: onGrid(f, P) });
    const sine = L.mix([at(pt(B1)), at(pt(B2), 0, -3), at(pt(B1 * 3), 0, -16)]);
    const band = L.sweep(L.noise(D, { color: 'pink', seed: 'ih' }), 'bp', (t) => 700 * 1.7 ** Math.sin(2 * Math.PI * 0.2 * t), { q: 1.6 });
    const ticks = [0.7, 2.3, 3.9].map((t0, i) => at(L.automate(buzz(0.05, { f: MAINS * 4, jit: 0.4, res: [4200, 8000], flick: 0.3, drop: 0, seed: `it${i}` }), (t) => Math.exp(-t / 0.012)), t0, -12 - i * 2));
    const noisy = L.mix([at(nrm(band), 0, -9), ...ticks, at(corona(D, { seed: 'ic', f: onGrid(MAINS, P) }), 0, -24)], { length: D });
    const m = seamless(P, X, noisy, L.gain(nrm(sine), -3), 0);
    seamCheck('chunting_idle', m);
    await add('chunting_idle', m, LOC({ lufs: -22, loop: true, channels: 1, voices: 1, pitch: [1, 1], note: '§1.12 hum (code: loop, vol 0.12, fadeIn 0.4)' }));
  }

  // drawn (2D, vol 0.8, 0.032 s into the 0.8 s clip; its 喀喀喀 are chunting_seg, its coils chunting_coil): the cloth, the
  // heavy tool's air (a swing 5 st down), a soft metal rattle, then 電容充電上揚 -- the capacitor's whine climbing 900 Hz
  // -> 4.8 kHz over the inductor take's spin-up sped 3x (the coils' electromagnetic rise), the hum swelling under it
  const cloth = await src(S.cloth, 0.0, 0.6, { hp: 150 });
  const air = await src(S.swing, 0.0, 0.8, { hp: 140, semis: -5 });
  const spinUp = L.varispeed(await src(S.inductor, 0.55, 2.5, { hp: 200 }), 3);
  const draws = [];
  for (let k = 0; k < 2; k++) {
    const sd = `dr${k}`, c0 = 0.12, C = 0.62;
    const rat = await clank(k + 6, { semis: 5, hp: 500 });
    const wn = L.automate(whine(C, (t) => 900 * (4800 / 900) ** ((t / C) ** 1.3), { seed: sd + 'w' }), (t) => (0.2 + 0.8 * (t / C) ** 1.5) * (t > C - 0.05 ? Math.max(0, (C - t) / 0.05) : 1));
    const su = L.automate(L.fitLength(spinUp, C), (t) => (t / C) ** 1.2 * (t > C - 0.05 ? Math.max(0, (C - t) / 0.05) : 1));
    const hm = L.automate(hum(0.85, { seed: sd + 'h' }), (t) => Math.min(1, t / 0.6) ** 2 * (t > 0.6 ? Math.max(0.3, 1 - (t - 0.6) / 0.25) : 1));
    const m = L.mix([at(L.toStereo(cloth), 0, -6), at(L.toStereo(air), 0.01, -6), at(L.toStereo(rat), 0.2, -18), at(L.stereoize(wn, { width: 0.2, hp: 800, seed: sd + 's' }), c0, -16),
      at(L.toStereo(nrm(su)), c0, -17), at(L.toStereo(hm), 0.05, -17)], { channels: 2, length: 0.95 });
    draws.push(L.fadeOut(L.psychoBass(m, { freq: 110, amount: -10 }), 0.2, 'exp'));
  }
  await add('chunting_draw', draws, LOC({ lufs: -19, channels: 2, voices: 1, pitch: [0.98, 1.02], note: 'code: clip event at 0.04 (vol 0.8)' }));

  // first draw (2D, once a game; baked to the 1.6 s clip: file t = clip t - 0.032): swung up from low right with a roll
  // (a deep whoosh, the cloth, a rattle) -> the charge-up (0.35-0.86 s: the whine 700 Hz -> 5 kHz, the inductor's spin-up,
  // the hum swelling, sparks thickening; its 喀 / coils / blade are their own cues) -> 0.864 s THE STING (the arc to the
  // sky): a close stroke's split + rip + a 70 -> 38 Hz boom, the spring thunder rolling away over the town, the Tesla
  // coil singing E4 B4 E5 (the 驚蟄 chord) with a slow vibrato, the timpani's E3, the horn's E3 swelling, the porcelain
  // E6 / B6 ringing; in the substation
  {
    const T = 3.4, S0 = 0.864;
    const deep = L.whoosh({ dur: 0.45, f0: 140, f1: 800, q: 1.3, seed: 'fdd' });
    const rat = await clank(1, { semis: 3, hp: 400 });
    const wn = L.automate(whine(0.52, (t) => 700 * (5000 / 700) ** ((t / 0.52) ** 1.4), { seed: 'fdw' }), (t) => (0.15 + 0.85 * (t / 0.52) ** 1.8) * (t > 0.49 ? Math.max(0, (0.52 - t) / 0.03) : 1));
    const su = L.automate(L.fitLength(spinUp, 0.52), (t) => (t / 0.52) ** 1.4 * (t > 0.49 ? Math.max(0, (0.52 - t) / 0.03) : 1));
    const hm = L.automate(hum(1.4, { seed: 'fdh' }), (t) => Math.min(1, t / 0.5) ** 2 * (t < 0.55 ? 1 : 0.4 + 0.6 * Math.exp(-(t - 0.55) / 0.3)));
    const spits = [];
    const r = ctx.rng('fdsp');
    for (let i = 0; i < 8; i++) { const u = i / 8; spits.push(at(L.toStereo(crack(0.04, { n: 4, spread: 0.008, big: 0.4 + 0.5 * u, seed: `fds${i}`, hp: 600 })), 0.4 + 0.45 * (1 - (1 - u) ** 1.6) + r.range(0, 0.02), -20 + 8 * u, r.range(-0.4, 0.4))); }
    const ck = crack(0.45, { n: 50, spread: 0.12, big: 3.0, seed: 'fdc' });
    const rp = rip(0.35, { density: 1600, t: 0.08, seed: 'fdr' });
    const bm = boom({ f0: 70, f1: 38, sweep: 0.05, decay: 0.7, seed: 'fdb' });
    const rl = L.lp(await src(S.roll, 0.0, 3.0, { hp: 35, rate: 0.78 }), 1200);
    const rb = rumble(2.4, { peaks: 4, lp0: 700, lp1: 150, seed: 'fdu' });
    const timp = await src(S.timpE3, 0.0, 2.4, { hp: 40 });
    const horn = L.automate(L.fadeIn(await src(S.hornF3, 0.3, 2.6, { hp: 80, semis: -1 }), 0.2, 'sine'), (t) => (t < 1.2 ? 1 : Math.max(0, 1 - (t - 1.2) / 1.0)));
    const chord = [[E4, -0.45], [B4, 0.45], [E5, 0]].map(([f, p], i) => at(L.toStereo(tesla(1.9, f, { seed: `fdt${i}`, vib: 0.007, vibHz: 5 + i * 0.5, vibDelay: 0.25, body: -6, sizz: -24, bright: 8000,
      env: [[0, 0], [0.004, 1], [0.2, 0.7], [1.2, 0.5], [1.9, 0]] })), 0, -4 - i * 1.5, p));
    const pcs = L.mix([at(porcelain(E6, { t60: 1.2, seed: 'fdp1', knock: -20 }), 0, 0, -0.3), at(porcelain(B6, { t60: 1.0, seed: 'fdp2', knock: -20 }), 0.03, -3, 0.3)], { channels: 2 });
    let m = L.mix([at(L.toStereo(nrm(deep)), 0, -4), at(L.toStereo(cloth), 0.0, -9), at(L.toStereo(air), 0.02, -7), at(L.toStereo(rat), 0.18, -15),
      at(L.stereoize(wn, { width: 0.25, hp: 800, seed: 'fdws' }), 0.35, -15), at(L.toStereo(nrm(su)), 0.35, -16), at(L.toStereo(hm), 0.3, -15), ...spits,
      at(L.toStereo(ck), S0, 0), at(L.toStereo(rp), S0 + 0.002, -7), at(L.toStereo(bm), S0 + 0.002, -2), at(L.stereoize(L.automate(rl, (t) => Math.min(1, t / 0.1)), { width: 0.6, hp: 150, seed: 'fdrs' }), S0 + 0.03, -6),
      at(L.stereoize(rb, { width: 0.5, hp: 100, seed: 'fdus' }), S0 + 0.05, -8), at(L.toStereo(timp), S0 + 0.004, -5), at(L.toStereo(horn), S0 + 0.05, -11), at(L.mix(chord, { channels: 2 }), S0 + 0.004, -9),
      at(pcs, S0 + 0.006, -11), at(L.toStereo(lux('fdx', 7600)), S0, -12)], { channels: 2, length: T });
    m = L.psychoBass(m, { freq: 100, amount: -6 });
    m = space(m, { wet: 0.2, seed: 'fdsp', env: SUBSTATION, ch: 2, length: 1.8 });
    await add('chunting_first', dense(L.fadeOut(L.slice(m, 0, T), 0.9, 'exp'), -15), LOC({ lufs: -15, channels: 2, voices: 1, pitch: [1, 1], note: 'baked to the chunting_first clip (1.6 s); plays at clip 0.02 (vol 0.9)' }));
  }

  // a telescoping section running out and locking 「喀」 (2D, vol 0.5-0.8, pitch 0.85-1.25): the tube's slide (a short
  // rising scrape), the detent's CLACK (a recorded pistol-slide click or a helmet clank, pitched up), the tube's short
  // ring (bar modes ~1.5 kHz), the rubber sleeve's thud
  const GL = [0.29, 2.25, 3.66, 3.85, 5.88];
  const segs = [];
  for (let k = 0; k < 5; k++) {
    const r = ctx.rng(`sg${k}`), sd = `sq${k}`;
    const cl = k % 2 ? await clank(k, { semis: 6, hp: 600 }) : await grab(S.glock, GL[k] - 0.02, GL[k] + 0.2, { mode: 'peak', pre: 0.002, post: 0.06, hp: 400, semis: -2 });
    const sl = K.scrape(0.03, 1600, 4200, sd + 's');
    const ring = steel(1500 * (1 + r.range(-0.05, 0.05)), { kind: 'bar', t60: 0.12, seed: sd + 'r', strike: -30 });
    const th = L.thump({ f0: 300, f1: 140, sweep: 0.006, decay: 0.03, click: 0.2, drive: 2, seed: sd + 't' });
    const m = L.mix([at(nrm(sl), 0, -14), at(cl, 0.025, 0), at(ring, 0.027, -12), at(nrm(th), 0.026, -6)], { length: 0.25 });
    segs.push(L.pad(dense(L.fadeOut(m, 0.08, 'exp'), -19), 0.003, 0));
  }
  keep.seg = { buf: segs[0], lufs: -19, vol: 1 };
  await add('chunting_seg', segs, LOC({ lufs: -19, channels: 1, voices: 3, pitch: [0.97, 1.03], note: 'code: vol 0.5-0.8, pitch 0.85-1.25' }));

  // a coil energising (2D, vol 0.4; the draw / charge light them in a run at pitch 1, 1.12, 1.24 = E F# ~G#): the
  // inductor's soft thunk, a spark tick, a short arc blip, the Tesla coil's E5 for 60 ms
  const coils = [];
  for (let k = 0; k < 3; k++) {
    const sd = `co${k}`;
    const th = L.thump({ f0: 150, f1: 70, sweep: 0.01, decay: 0.06, click: 0, drive: 2, seed: sd + 't' });
    const tk = L.noiseBurst({ dur: 0.01, decay: 0.002, hp: 4000, seed: sd + 'k' });
    const zz = L.automate(buzz(0.07, { f: MAINS * 2, jit: 0.25, res: [2800, 6200], flick: 0.2, drop: 0, seed: sd + 'a' }), (t) => Math.exp(-t / 0.02));
    const ts = tesla(0.12, E5 * (1 + k * 0.002), { seed: sd + 's', env: [[0, 0], [0.003, 1], [0.06, 0.6], [0.12, 0]] });
    const m = L.mix([at(nrm(th), 0, -6), at(nrm(tk), 0, -8), at(zz, 0.003, -8), at(ts, 0.004, -5)], { length: 0.3 });
    coils.push(L.pad(dense(L.fadeOut(m, 0.1, 'exp'), -21), 0.002, 0));
  }
  await add('chunting_coil', coils, LOC({ lufs: -21, channels: 1, voices: 3, pitch: [1, 1], note: 'E5 blip: code pitch 1 / 1.12 / 1.24 (vol 0.4)' }));

  // the idle ground arc (2D, vol 0.18, pitch 1.4-1.7): a small split, a 50 ms buzz, three spark ticks
  const cracks = [];
  for (let k = 0; k < 4; k++) {
    const sd = `ga${k}`;
    const ck = crack(0.06, { n: 6, spread: 0.012, big: 1.0, seed: sd + 'c', hp: 300 });
    const zz = L.automate(buzz(0.07, { f: MAINS * 1.5, jit: 0.3, flick: 0.3, drop: 0, seed: sd + 'a' }), (t) => Math.exp(-t / 0.02));
    const sp = L.automate(sizzle(0.15, { density: 900, seed: sd + 's' }), (t) => Math.exp(-t / 0.04));
    const m = L.mix([at(ck, 0, 0), at(zz, 0.002, -5), at(sp, 0.01, -12)], { length: 0.22 });
    cracks.push(L.pad(dense(L.fadeOut(m, 0.06, 'exp'), -18), 0.002, 0));
  }
  await add('chunting_crack', cracks, LOC({ lufs: -18, channels: 1, voices: 2, pitch: [1, 1], note: 'code: vol 0.18, pitch 1.4-1.7' }));

  // 換電池 out (2D, vol 0.9, 0.36 s into the 2 s clip): the release latch (a small contactor click), the spent cell venting
  // (a 「噗嘶」 hiss), the cell sliding out of its well (a polymer scrape), its whine dying 2.4 kHz -> 600 Hz
  const outs = [];
  for (let k = 0; k < 2; k++) {
    const sd = `ro${k}`;
    const ct = await contactor(sd + 'c', { big: 0.8, buzzDb: -40, which: k });
    const vent = L.applyEnv(L.eq(L.noise(0.3, { color: 'white', seed: sd + 'v' }), [{ type: 'hp', f: 1600, order: 2 }, { type: 'peak', f: 5000, gain: 5, q: 0.8 }, { type: 'lp', f: 11000, order: 2 }]), L.envCurve(0.3, [[0, 0], [0.012, 1], [0.08, 0.5], [0.3, 0]]));
    const sl = K.scrape(0.14, 900, 600, sd + 's');
    const dn = L.automate(whine(0.35, (t) => 2400 * (600 / 2400) ** (t / 0.35), { seed: sd + 'w' }), (t) => Math.exp(-t / 0.1));
    const m = L.mix([at(nrm(ct), 0, -1), at(nrm(vent), 0.02, -9), at(nrm(sl), 0.06, -10), at(dn, 0.02, -18)], { length: 0.5 });
    outs.push(L.pad(dense(L.fadeOut(m, 0.12, 'exp'), -20), 0.002, 0));
  }
  await add('chunting_reload_out', outs, LOC({ lufs: -20, channels: 1, voices: 1, pitch: [0.98, 1.02], note: 'code: clip 0.18 (vol 0.9)' }));

  // 換電池 in (2D, vol 0.95, at 1.32 s): the palm's slap, the cell's CLACK home (a recorded gun-cocking clack + a helmet
  // clank), the contacts biting (a 40 ms grid BZZT + sparks), the contactor engaging
  const pslap = await grab(S.punch, 0, 0.67, { mode: 'peak', pre: 0.002, post: 0.08, hp: 200, semis: 2 });
  const ins = [];
  for (let k = 0; k < 2; k++) {
    const sd = `ri${k}`;
    const cl = await clank(k + 3, { semis: 1, hp: 250 });
    const ct = await contactor(sd + 'c', { big: 1.2, buzzDb: -9, which: k + 1 });
    const zz = L.automate(buzz(0.08, { jit: 0.1, flick: 0.2, drop: 0, seed: sd + 'a' }), (t) => Math.exp(-t / 0.025));
    const sp = L.automate(sizzle(0.2, { density: 1500, seed: sd + 's' }), (t) => Math.exp(-t / 0.05));
    const m = L.mix([at(pslap, 0, -6), at(cl, 0.004, -1), at(zz, 0.012, -9), at(sp, 0.014, -16), at(nrm(ct), 0.05, -5)], { length: 0.45 });
    ins.push(L.pad(dense(L.fadeOut(L.psychoBass(m, { freq: 120, amount: -10 }), 0.12, 'exp'), -19), 0.002, 0));
  }
  await add('chunting_reload_in', ins, LOC({ lufs: -19, channels: 1, voices: 1, pitch: [0.98, 1.02], note: 'code: clip 0.66 (vol 0.95)' }));

  // the coils humming back up (2D, vol 0.6, at 1.68 s): the hum swelling in (pitch 0.85 -> 1), the whine climbing 1.2 ->
  // 3.3 kHz and settling, the coils' crackle, a porcelain E6 tick when it is full (0.55 s)
  const hums = [];
  for (let k = 0; k < 2; k++) {
    const sd = `rh${k}`, T = 1.0;
    const hm = L.automate(hum(T, { f: (t) => MAINS * (0.85 + 0.15 * Math.min(1, t / 0.5)), seed: sd + 'h' }), (t) => Math.min(1, t / 0.4) * (t > 0.6 ? Math.max(0.25, 1 - (t - 0.6) / 0.4) : 1));
    const wn = L.automate(whine(T, (t) => 1200 * (3300 / 1200) ** Math.min(1, t / 0.5), { seed: sd + 'w' }), (t) => Math.min(1, t / 0.05) * (t < 0.5 ? 1 : Math.exp(-(t - 0.5) / 0.15)));
    const cr = L.automate(L.crackle(T, { density: 80, decay: 0.002, hp: 2500, seed: sd + 'c' }), (t) => Math.exp(-t / 0.5));
    const pc = porcelain(E6 * (1 + k * 0.003), { t60: 0.5, seed: sd + 'p', knock: -20 });
    const m = L.mix([at(hm, 0, -3), at(wn, 0, -14), at(nrm(cr), 0, -16), at(pc, 0.55, -12)], { length: T });
    hums.push(L.pad(L.fadeOut(L.psychoBass(m, { freq: 110, amount: -10 }), 0.25, 'exp'), 0.002, 0));
  }
  await add('chunting_reload_hum', hums, LOC({ lufs: -21, channels: 1, voices: 1, pitch: [1, 1], note: 'code: clip 0.84 (vol 0.6)' }));

  // inspect (2D, vol 0.7, 0.08 s into the 4 s clip; file t = clip t - 0.08): the hum swelling, a cloth rustle, then the
  // 驚蟄 phrase on the Tesla coil (soft, low-passed) doubled by porcelain an octave up: E4 B4 E5 (the call) .. C#5 B4
  // (the arc onto the glove, 1.52 s, and the 「叮」 at 2.32 s are their own cues), the answer E5 + B5 held with vibrato
  // from 2.55 s, a far spring thunder rolling under it; the crescent's show (2.88 s) is chunting_blade
  {
    const T = 3.9;
    const hm = L.automate(hum(1.3, { seed: 'inh' }), (t) => Math.min(1, t / 0.4) * (t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.6)));
    const note = (f, t0, d, pan, g = 0, i = 0) => at(L.mix([at(L.eq(tesla(d, f, { seed: `in${i}`, vib: 0.004, vibHz: 5.2, vibDelay: 0.1, body: -4, sizz: -28, bright: 6000,
      env: [[0, 0], [0.02, 1], [d * 0.5, 0.7], [d, 0]] }), [{ type: 'lp', f: 4200, order: 2 }])), at(porcelain(f * 2, { t60: Math.min(0.8, d * 1.5), seed: `inp${i}`, knock: -26 }), 0, -9)], { channels: 2 }), t0, g, pan);
    const phrase = [[E4, 0.55, 0.32, -0.35], [B4, 0.85, 0.32, -0.15], [E5, 1.15, 0.38, 0.05], [Cs5, 1.78, 0.26, 0.15], [B4, 2.02, 0.26, 0]].map(([f, t0, d, p], i) => note(f, t0, d, p, -2 * (i % 2), i));
    const answer = L.mix([at(tesla(1.2, E5, { seed: 'ina1', vib: 0.007, vibHz: 5, vibDelay: 0.2, body: -4, sizz: -28, bright: 6000, env: [[0, 0], [0.04, 1], [0.6, 0.75], [1.2, 0]] }), 0, 0, -0.25),
      at(tesla(1.2, B5, { seed: 'ina2', vib: 0.007, vibHz: 5.5, vibDelay: 0.2, body: -4, sizz: -28, bright: 6000, env: [[0, 0], [0.04, 1], [0.6, 0.75], [1.2, 0]] }), 0, -3, 0.25)], { channels: 2 });
    const rb = rumble(1.4, { peaks: 3, lp0: 500, lp1: 140, seed: 'inu' });
    let m = L.mix([at(L.toStereo(hm), 0, -12), at(L.toStereo(cloth), 0.02, -12), ...phrase, at(L.eq(answer, [{ type: 'lp', f: 4500, order: 2 }]), 2.55, -2), at(L.stereoize(rb, { width: 0.6, hp: 100, seed: 'inus' }), 2.6, -13)], { channels: 2, length: T });
    m = L.psychoBass(m, { freq: 100, amount: -9 });
    m = space(m, { wet: 0.24, seed: 'inv', env: SUBSTATION, ch: 2, length: 1.6 });
    await add('chunting_inspect', L.fadeOut(L.slice(m, 0, T), 0.5, 'exp'), LOC({ lufs: -21, channels: 2, voices: 1, pitch: [1, 1], note: '§1.12 檢視 phrase (code: clip 0.02, vol 0.7)' }));
  }

  // an arc jumping onto the glove (2D, vol 0.7; the rare ring's arcs at vol 0.25, pitch 1.4): a small sharp split, a
  // 0.08 s BZZT on 3x mains, the glove twitching (a cloth snap), sparks
  const cape = await src(S.cape, 0, 0.335, { hp: 200, semis: 2 });
  const gloves = [];
  for (let k = 0; k < 3; k++) {
    const sd = `gz${k}`;
    const ck = crack(0.06, { n: 6, spread: 0.012, big: 1.2, seed: sd + 'c', hp: 350 });
    const zz = L.automate(buzz(0.1, { f: MAINS * 3, jit: 0.25, res: [2600, 6000], flick: 0.2, drop: 0, seed: sd + 'a' }), (t) => (t < 0.06 ? 1 : Math.exp(-(t - 0.06) / 0.02)));
    const sp = L.automate(sizzle(0.2, { density: 1400, seed: sd + 's' }), (t) => Math.exp(-t / 0.05));
    const m = L.mix([at(ck, 0, 0), at(zz, 0.002, -4), at(L.slice(cape, 0, 0.2), 0.03, -10), at(sp, 0.01, -14)], { length: 0.3 });
    gloves.push(L.pad(dense(L.fadeOut(m, 0.08, 'exp'), -18), 0.002, 0));
  }
  await add('chunting_glove_zap', gloves, LOC({ lufs: -18, channels: 1, voices: 3, pitch: [0.97, 1.03], note: 'code: vol 0.7 (0.25 at pitch 1.4 in the rare ring)' }));

  // a knuckle on the insulator 「叮」 (2D, vol 0.7; the code plays it at pitch 1.5, so it is rendered on E6 to ring on B6):
  // the knuckle (a soft knock), a real porcelain strike under it (the mug, 7 st down), the skirts ringing (porcelain modes
  // on E6, 1 s), and the violet-white ring running round the skirt: a tiny arc chirp on 4x mains
  const dings = [];
  for (let k = 0; k < 2; k++) {
    const sd = `pd${k}`;
    const mug = await mugStrike(k, { semis: -7 });
    const pc = porcelain(E6 * (1 + k * 0.002), { t60: 1.0, seed: sd + 'p', knock: -10 });
    const kn = L.thump({ f0: 380, f1: 200, sweep: 0.005, decay: 0.025, click: 0, drive: 1, seed: sd + 't' });
    const ch = L.automate(buzz(0.14, { f: MAINS * 4, jit: 0.2, res: [4000, 8000], body: -20, rasp: -14, flick: 0.3, drop: 0, seed: sd + 'a' }), (t) => Math.min(1, t / 0.02) * Math.exp(-t / 0.05));
    const m = L.mix([at(nrm(kn), 0, -6), at(mug, 0.001, -6), at(pc, 0.001, 0), at(ch, 0.05, -20)], { length: 1.1 });
    dings.push(L.pad(L.fadeOut(m, 0.3, 'exp'), 0.002, 0));
  }
  await add('chunting_porcelain', dings, LOC({ lufs: -19, channels: 1, voices: 2, pitch: [1, 1], note: 'rendered on E6: code pitch 1.5 -> B6 (vol 0.7)' }));

  // out of 雷能 (2D, vol 0.6-0.7): the contactor clicking on a dead circuit, the arc trying and failing (a sputter falling
  // 120 -> 40 Hz full of dropouts), a dull 「thup」, a couple of sparks
  const drys = [];
  for (let k = 0; k < 3; k++) {
    const sd = `dy${k}`;
    const ct = await contactor(sd + 'c', { big: 0.9, buzzDb: -40, which: k });
    const sp = L.automate(buzz(0.28, { f: (t) => 120 - 280 * t, jit: 0.7, res: [1500, 3600], body: -6, flick: 0.6, drop: 0.4, seed: sd + 'a' }), (t) => Math.exp(-t / 0.08));
    const th = L.thump({ f0: 200, f1: 90, sweep: 0.01, decay: 0.05, click: 0, drive: 2, seed: sd + 't' });
    const sz = L.automate(sizzle(0.2, { density: 400, seed: sd + 's' }), (t) => Math.exp(-t / 0.05));
    const m = L.mix([at(nrm(ct), 0, -2), at(sp, 0.012, -4), at(nrm(th), 0.006, -8), at(sz, 0.02, -15)], { length: 0.35 });
    drys.push(L.pad(dense(L.fadeOut(m, 0.1, 'exp'), -21), 0.003, 0));
  }
  await add('chunting_dry', drys, LOC({ lufs: -21, channels: 1, voices: 2, pitch: [0.96, 1.04], note: 'code: vol 0.6-0.7' }));
}

// ------------------------------------------------------------------------------------------------ ready (unique per §1.12)
async function readySet(add) {
  // 就緒 (雷樁 off cooldown; fanfare only, vol 1): the contactor slamming shut (a heavy frame, its grid buzz), then the
  // singing Tesla coil calls the 驚蟄 motif -- E5, B5, E6, 70 ms apart, the E6 held 0.55 s under a widening vibrato --
  // panned left to right, the porcelain ringing E6 and B6 under it, sparks, a far roll of spring thunder; in the
  // substation. No other ready in the game is an electric voice.
  const make = (k) => {
    const call = [[E5, 0.0, 0.09, -0.35], [B5, 0.07, 0.09, 0], [E6, 0.14, 0.62, 0.35]].map(([f, t0, d, p], i) => at(L.toStereo(tesla(d + 0.02, f * (1 + k * 0.002), { seed: `rd${k}${i}`, vib: i === 2 ? 0.012 : 0, vibHz: 6, vibDelay: 0.08, body: -6, sizz: -22,
      env: i === 2 ? [[0, 0], [0.003, 1], [0.25, 0.8], [d + 0.02, 0]] : [[0, 0], [0.003, 1], [d, 0.7], [d + 0.02, 0]] })), t0, -1 - i, p));
    const pcs = L.mix([at(porcelain(E6, { t60: 1.0, seed: `rdp${k}`, knock: -18 }), 0, 0, -0.2), at(porcelain(B6, { t60: 0.8, seed: `rdq${k}`, knock: -18 }), 0.06, -3, 0.3)], { channels: 2 });
    const rb = L.toStereo(rumble(1.4, { peaks: 2, lp0: 450, lp1: 130, seed: `rdr${k}` }));
    const sp = L.automate(sizzle(0.6, { density: 1200, seed: `rds${k}` }), (t) => Math.exp(-t / 0.15));
    return { call, pcs, rb, sp };
  };
  const vars = [];
  for (let k = 0; k < 2; k++) {
    const { call, pcs, rb, sp } = make(k);
    const ct = await contactor(`rdc${k}`, { big: 1.4, buzzDb: -8, which: k });
    let m = L.mix([at(L.toStereo(nrm(ct)), 0, -3), ...call.map((c) => ({ ...c, at: c.at + 0.05 })), at(pcs, 0.19, -9), at(L.eq(rb, [{ type: 'hp', f: 70, order: 2 }]), 0.1, -22), at(L.stereoize(sp, { width: 0.6, hp: 2000, seed: `rdz${k}` }), 0.05, -20),
      at(L.toStereo(lux(`rdx${k}`, 8000)), 0.05, -12)], { channels: 2, length: 1.6 });
    m = L.eq(m, [{ type: 'hp', f: 90, order: 2 }, { type: 'lowshelf', f: 250, gain: -3 }]);
    m = space(m, { wet: 0.22, seed: `rdv${k}`, env: SUBSTATION, ch: 2, length: 1.5 });
    vars.push(L.fadeOut(L.slice(m, 0, 1.6), 0.5, 'exp'));
  }
  await add('ready_chunting', vars, { lufs: -18, bus: 'ui', spatial: false, channels: 2, voices: 2, pitch: [1, 1], priority: 3, note: 'unique ready (specials.js readyFanfare, vol 1)' });
}

// ------------------------------------------------------------------------------------------------ def.sound contract
async function contractSet(add, SP, LOC) {
  // chunting_close (a teammate's reported shot, < 40 m): one discharge -- the split, the ignition BZZT, a small boom, the
  // Tesla E5 blip ~13 dB down, the luxury tick; _tail: the street's reflections of it + a short roll; _far: the crack and
  // roll from 110 m
  const head = (k, seed) => {
    const r = ctx.rng(`${seed}${k}`), sd = `${seed}${k}`;
    const ck = crack(0.2, { n: 22, spread: 0.05, big: 2.0 + r.range(0, 0.5), seed: sd + 'c' });
    const zz = L.automate(buzz(0.25, { jit: 0.15, flick: 0.3, drop: 0, seed: sd + 'a' }), (t) => Math.min(1, t / 0.002) * (t < 0.08 ? 1 : Math.exp(-(t - 0.08) / 0.05)));
    const bm = boom({ f0: 120, f1: 46, sweep: 0.03, decay: 0.22, seed: sd + 'b' });
    const ts = tesla(0.2, E5, { seed: sd + 't', env: [[0, 0], [0.003, 1], [0.2, 0]] });
    const m = L.mix([at(ck, 0, 0), at(zz, 0.001, -4), at(bm, 0.002, -3), at(ts, 0.002, -13), at(lux(sd + 'x'), 0, -14)], { length: 0.4 });
    return L.psychoBass(thicken(m), { freq: 110, amount: -8 });
  };
  const closes = [];
  for (let k = 0; k < 4; k++) closes.push(L.pad(dense(L.fadeOut(shape(head(k, 'cl'), 'zap', 0.5), 0.15, 'exp'), -14), 0.002, 0));
  await add('chunting_close', closes, SP([12, 70], { lufs: -14, voices: 4, pitch: [0.97, 1.03], priority: 2, note: 'def.sound contract: a teammate\'s reported shot (remote.js, < 40 m)' }));
  const tails = [], fars = [];
  for (let k = 0; k < 2; k++) {
    const h = L.toMono(head(k + 4, 'tl'));
    const tl = L.gunTail(h, { env: 'urban', length: 1.4, head: 0.1, seed: `tl${k}`, darken: 30, hp: 120 });
    const rb = L.stereoize(rumble(1.4, { peaks: 2, lp0: 500, lp1: 140, seed: `tlr${k}` }), { width: 0.5, hp: 80, seed: `tlrs${k}` });
    tails.push(K.trimEnd(L.fadeOut(L.mix([at(tl), at(rb, 0.06, -12)], { channels: 2 }), 0.5, 'exp')));
  }
  for (let k = 0; k < 3; k++) {
    const h = L.toMono(head(k + 8, 'fr'));
    const far = L.farLayer(L.slice(h, 0, 0.25), { distance: 100 + k * 15, env: 'urban', seed: `fr${k}`, length: 1.3 });
    const frb = L.airAbsorption(rumble(1.3, { peaks: 2, lp0: 400, lp1: 120, seed: `frr${k}` }), 200);
    fars.push(L.pad(K.trimEnd(L.fadeOut(L.mix([at(far), at(frb, 0.04, -8)]), 0.5, 'exp')), 0.005, 0));
  }
  await add('chunting_tail', tails, LOC({ target: 'gunTail', channels: 2, voices: 2, pitch: [0.98, 1.02], note: 'def.sound contract (the halberd\'s own trigger never plays it)' }));
  await add('chunting_far', fars, SP([40, 320], { target: 'gunFar', voices: 3, pitch: [0.95, 1.04] }));
}

// ------------------------------------------------------------------------------------------------ references
/** The sequences as the player hears them (pre-codec, each cue at its target x the manifest vol x the code's volume):
 *  preview WAV + spectrogram in tools/audio/out/premium_chunting/preview/ (not shipped). */
function references(keep) {
  const lv = (key, codeVol = 1, rate = 1) => {
    const e = keep[key];
    if (!e) return null;
    let b = L.normalizeLufs(L.toMono(e.buf), e.lufs, { ceiling: 0 });
    if (rate !== 1) b = L.varispeed(b, rate);
    return L.scale(b, (e.vol ?? 1) * codeVol);
  };
  const loopFor = (key, dur, codeVol, rate = 1) => { const b = lv(key, codeVol, rate); if (!b) return null; const n = Math.ceil(dur / b.duration) + 1; return L.fadeOut(L.slice(L.concat(Array(n).fill(b)), 0, dur), 0.05); };
  const put = (buf, t) => (buf ? [{ buf, at: t }] : []);
  // 放電 held 2.5 s: wind-up + ignition, the loop, arcs landing (zap_hit ~ every 3rd frame, a kill at 1.2 s), the release
  if (keep.zap_start && keep.zap_loop) {
    const parts = [...put(lv('zap_start', 0.85), 0), ...put(loopFor('zap_loop', 2.3, 0.55), 0.23)];
    for (const t of [0.35, 0.5, 0.7, 0.85, 1.05, 1.4, 1.6, 1.9, 2.2]) parts.push(...put(lv('zap_hit', 0.35), t));
    parts.push(...put(lv('kill', 0.75), 1.2), ...put(lv('zap_end', 0.8), 2.53));
    ctx.preview('ref_discharge', L.mix(parts, { length: 3.6 }));
  }
  // ◎ tap: the thrust, the blast at 10 m 0.1 s later
  if (keep.thrust && keep.burst) ctx.preview('ref_burst', L.mix([...put(lv('thrust', 0.8), 0), ...put(lv('burst', 0.7), 0.1)], { length: 2.0 }));
  // ◎ held 2 s -> released: the charge (rate 0.8 -> 1.25), the stages (pitch 1.18 / 1.36), the seg clicks and the blade,
  // the throw, the roll at the target, the flight (1 s at 20 m), the landing, streamers, the bolt 1.2 s after landing,
  // the return 0.3 s later, the catch, the sections sliding back
  if (keep.charge && keep.thunder) {
    const c0 = 0.22, ch = lv('charge', 0.5), n = Math.ceil(2.1 / ch.duration) + 1;
    const chg = L.fadeOut(L.slice(L.varispeedCurve(L.concat(Array(n).fill(ch)), [[0, 0.8], [2.0, 1.25], [2.6, 1.25]]), 0, 2.05), 0.1);
    const T0 = c0 + 2.05, land = T0 + 0.16 + 1.0;
    const parts = [...put(chg, c0), ...put(lv('stage', 0.7, 1.18), c0 + 1.0), ...put(lv('seg', 0.7, 1.1), c0 + 1.02), ...put(lv('stage', 0.7, 1.36), c0 + 2.0), ...put(lv('blade', 0.9), c0 + 2.0),
      ...put(lv('seg', 0.8, 1.25), c0 + 2.02), ...put(lv('throw', 1), T0 + 0.096), ...put(lv('roll', 0.8 * 0.77), T0), ...put(L.fadeOut(L.slice(lv('fly', 0.6), 0, 1.0), 0.05), T0 + 0.16),
      ...put(lv('impact', 0.7), land)];
    for (const [t, p] of [[0.3, 1.1], [0.6, 1.2], [0.85, 1.35], [1.05, 1.45]]) parts.push(...put(lv('streamer', 0.35 * 0.6, p), land + t));
    parts.push(...put(lv('thunder', 1.2 * 0.7), land + 1.2), ...put(lv('kill', 0.5), land + 1.2), ...put(lv('ret', 0.8 * 0.7), land + 1.5), ...put(lv('catch', 0.9), land + 1.92),
      ...put(lv('seg', 0.5, 0.95), land + 2.17), ...put(lv('seg', 0.5, 0.85), land + 2.28));
    ctx.preview('ref_throw', L.mix(parts, { length: land + 5.5 }));
  }
}

// ------------------------------------------------------------------------------------------------ produce
export async function produce(lib, c) {
  L = lib; ctx = c; K = makeKit(lib, ctx);
  const only = process.env.CH_ONLY ? new Set(process.env.CH_ONLY.split(',').map((s) => s.trim())) : null;
  if (only && !process.env.CF_AUDIO_OUT) throw new Error('CH_ONLY writes a partial category: set CF_AUDIO_OUT to a scratch folder');
  const want = (g) => !only || only.has(g);
  const cat = ctx.category('premium_chunting', { bus: 'sfx' });
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
  const keep = {};

  if (want('zap')) await zapSet(add, SP, keep);
  if (want('hits')) await hitSet(add, SP, LOC, keep);
  if (want('rmb')) await rmbSet(add, SP, LOC, keep);
  if (want('throw')) await throwSet(add, SP, LOC, keep);
  if (want('rod')) await rodSet(add, SP);
  if (want('view')) await viewSet(add, LOC, keep);
  if (want('ready')) await readySet(add);
  if (want('contract')) await contractSet(add, SP, LOC);
  if (!only || want('ref')) references(keep);
  await cat.write();
}
