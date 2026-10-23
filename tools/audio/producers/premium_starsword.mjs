// 星河．斬嶽 Xinghe Peakcleaver (神兵 X02 energy greatsword, docs/PREMIUM_WEAPONS.md §2.29 + §1.12) — category
// 'premium_starsword': every cue game/src/weapons/premium/starsword.js plays (its SFX table + the clips' 'snd' events),
// the def.sound contract layers (starsword_close / _tail / _far) and the reserved twin 星河．夜渡 (`<cue>_night`).
// CC0 recordings from the shared inventory (VSCO 2 tubular bells / gongs / cymbals / timpani / cello section, crowd
// choir, sword whooshes, metal clangs, gong scrape, Kenney metal + glass, concrete / rubble / debris, explosions,
// glass breaks, flesh / bone) and synthesis. Palette: a 1.1 m steel blade (free-free bar modes as beating doublets:
// 劍鳴 / 嗡), the projected energy edge (a chorused harmonic buzz whose pitch dopplers past the camera), crystal-glass
// star bells, the street (concrete, rubble, sub booms) and bells / choir for the ultimate. Every tuned part sits in E
// 宮 pentatonic (E F# G# B C#); the seven stars of the Dipper are the run B5 C#6 E6 F#6 G#6 B6 C#7.
//
//   swing    starsword_swing (星流 ① ②, played 0.09 s into the swing: the whoosh peaks 0.11 s in, where the blade
//            lands), _swing_light, _wheel (迴天: a whole-body ring, two passes circling the head + a low boom on the
//            hit), _counter (迴瀾), starsword_close / _tail / _far (def.sound contract, a remote "shot" = a swing)
//   hits     _hit (blade into flesh: cut + meat + mass + a starlight zap), _hit_ring (金屬共鳴「嗡」 2D under every
//            connecting swing), _hit_flesh, _hit_wall (clang + concrete + sparks), _kill (星鈴), _sever (斷肢)
//   charge   _charge (loop, pitch 0.8 -> 1.25 by the handler), _charge_stage (鈴 + the guard's detent),
//            _charge_full (蓄滿變形), _slam (重劈 into the street), _wave (星痕 tearing away along the ground), _crack
//   guard    _guard_up (舉劍「鏘」), _block, _parry (清亮「叮」＋鐘)
//   skyspan  _skyspan_charge (能量充填), _skyspan (9 m blade, 220° right -> left + 共鳴), _skyspan_end (星塵消散)
//   ult      §1.12 three layers: rise (_ult_rise: an inhaled swell into a bell, the beam) -> 40-60 Hz impact
//            (_ult_impact) -> bells + choir bed (_ult_bed, scored to the 天劍 timeline) + release (_ult_shatter: a long
//            glass tail and a deflating sigh). Beats: _ult_sigil (星鈴一串), _ult_fall (下墜的長嘯), _ult_pulse x3 (大鐘)
//   view     starsword_idle (loop: 82 / 123 / 165 Hz hum + a 400-1200 Hz noise band swept at 0.2 Hz + the star river's
//            glints, §1.12), _draw, _draw_first, _first_sting (主題「星河」), _star (七星上行玻璃鈴), _inspect
//            (§1.12: an original 3 s phrase on glass bells over a palm sliding on the blade), _recover (半聲劍鳴)
//   other    ready_starsword (unique: the blade sings + a rolled glass-bell chord), _crisis (星屏: 瓷器碎裂 + the star
//            tail), _final (KE_FINAL mini 天劍)
//   twin     <cue>_night for 星河．夜渡 (ready, swing, ult rise / impact / bed / shatter): the originals -4 semitones,
//            darker, with an echo (§1.12). Not played yet (the twin is reserved).
//
// Mastering: every file within 1 LU of its target at <= -1 dBTP (decoded). Pre-shaping soft-clips at most ~6 dB of
// drive (logged "natural -> shaped PLR"); ringing cues (bells, chimes) are mastered lower and lifted with the manifest
// vol instead of being crushed. Logged references: the combo / charge-slam / ultimate timelines as the player hears
// them at the handler's volumes.
//
//   node --max-old-space-size=2048 tools/audio/build.mjs --only premium_starsword
//   dev subset (never into the game folder: a subset run removes the other files of the category it writes):
//   CF_AUDIO_OUT=tools/audio/out/ss-dev SS_ONLY=swing,hits node --max-old-space-size=2048 \
//     tools/audio/run-producer.mjs tools/audio/producers/premium_starsword.mjs --spectrograms all
import { makeKit } from './weapons.mjs';

const SR = 48000;
const NYQ = 17000;                 // partials above this are dropped (Vorbis q0.5 cuts there anyway; no aliasing)
const midi = (m) => 440 * 2 ** ((m - 69) / 12);
// E 宮 pentatonic
const N = {
  E1: midi(28), E2: midi(40), B2: midi(47), E3: midi(52), B3: midi(59), E4: midi(64), Fs4: midi(66), Gs4: midi(68), B4: midi(71), Cs5: midi(73),
  E5: midi(76), Fs5: midi(78), Gs5: midi(80), B5: midi(83), Cs6: midi(85), E6: midi(88), Fs6: midi(90), Gs6: midi(92), B6: midi(95), Cs7: midi(97),
  E7: midi(100), Fs7: midi(102), Gs7: midi(104),
};
const DIPPER = [N.B5, N.Cs6, N.E6, N.Fs6, N.Gs6, N.B6, N.Cs7];   // 天樞 .. 搖光

// ---------------------------------------------------------------------------------------------- sources
const X = {
  // air / blades
  whoom: 'fs:60024', katana: 'fs:263595', swoosh: 'fs:507466', swing: 'fs:268227',
  // metal
  clangDeep: 'fs:201094', metalHit: 'fs:406562', gongScrape: 'fs:375550',
  metalH: (k) => `kenney_impact/Audio/impactMetal_heavy_00${k % 5}`, metalL: (k) => `kenney_impact/Audio/impactMetal_light_00${k % 5}`,
  // VSCO 2 orchestra + choir
  tbC4: 'fs:374273', tbC5: 'fs:374274', gong: 'fs:375532', gongHard: 'fs:375531', crash: 'fs:375497',
  timpRoll: 'fs:373944', timp: 'fs:373919', celloE2: 'fs:372835', celloB2: 'fs:372829', choirA: 'fs:764329', choirO: 'fs:764339', choirU: 'fs:764341',
  // glass
  glassL: (k) => `kenney_impact/Audio/impactGlass_light_00${k % 5}`, glassH: (k) => `kenney_impact/Audio/impactGlass_heavy_00${k % 5}`,
  shard: 'fs:203381', glassBreak: 'fs:221528', glassSmash: 'fs:244238', glassBreak2: 'fs:249549', bottle: 'fs:202093', plate: 'fs:565642', iceCrack: 'fs:342546',
  // stone / debris / blast
  concSmash: 'fs:522099', concHit: 'fs:321477', rubbleScrape: 'fs:758580', stoneDebris: 'fs:569510', rockFall: 'fs:232137', debrisBig: 'fs:703247', debris: 'fs:703248', dirt: 'fs:386799',
  deepBoom: 'fs:258195', blast: 'fs:523089', longCrash: 'fs:366086',
  // flesh / bone
  gash: 'fs:420674', slice: 'fs:504615', chop: 'fs:269483', meaty: 'fs:779805', wet: 'fs:626405', gross: 'fs:641040', gore: 'fs:641046', bone: 'fs:355052', fracture: 'fs:488659', neck: 'fs:134025', splat: 'fs:414296',
  // cloth
  cloth: 'fs:494797', clothHeavy: 'fs:163164',
};
// the four katana passes in fs:263595 and where each source's action is
const KATANA = [[0.001, 0.3], [0.521, 0.81], [1.053, 1.35], [1.507, 1.831]];

// ---------------------------------------------------------------------------------------------- toolkit
function kit(lib, ctx) {
  const { Buf } = lib;
  const K = makeKit(lib, ctx);
  const rng = (s) => ctx.rng(s);
  const norm = (b, db = -1) => lib.normalizePeak(b, db);
  const mono = (b) => (b.channels === 1 ? b : lib.toMono(b));
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  /** A source slice: one channel (ch) or the mono fold (or stereo kept), pitched, filtered, faded, peak -1 dBFS. */
  async function ld(id, s, e, { ch, stereo = false, hp = 30, lp, semis = 0, fadeIn = 0.002, fadeOut = 0.012, eq = [] } = {}) {
    let b = await ctx.load(id, { start: s, end: e });
    if (ch != null) b = new Buf([b.data[Math.min(ch, b.channels - 1)].slice()], b.sampleRate);
    else if (!stereo) b = mono(b);
    if (semis) b = lib.varispeedSemis(b, semis);
    b = lib.eq(b, [{ type: 'hp', f: hp, order: 2 }, ...(lp ? [{ type: 'lp', f: lp, order: 2 }] : []), ...eq]);
    return norm(lib.fade(b, fadeIn, Math.min(fadeOut, b.duration / 3), 'sine'));
  }
  /** Start a slice at its transient (first sample within `rel` dB of its peak, walked back to the rise). */
  function strike(b, rel = -20) {
    const th = lib.peak(b) * lib.db2lin(rel);
    let i = 0;
    outer: for (; i < b.length; i++) for (const d of b.data) if (Math.abs(d[i]) > th) break outer;
    const lim = Math.max(0, i - Math.round(0.004 * SR));
    let j = i;
    while (j > lim && b.data.some((d) => Math.abs(d[j - 1]) > th * 0.08)) j--;
    return lib.fadeIn(lib.sliceSamples(b, j, b.length), 0.0008, 'sine');
  }
  /** Time (s) of the loudest 10 ms of a buffer. */
  function peakTime(b, win = 0.01) {
    const m = mono(b).data[0], w = Math.max(1, Math.round(win * SR));
    let best = 0, bi = 0, s = 0;
    for (let i = 0; i < m.length; i++) { s += m[i] * m[i]; if (i >= w) s -= m[i - w] * m[i - w]; if (s > best) { best = s; bi = i - w / 2; } }
    return Math.max(0, bi) / SR;
  }
  /** A mix layer placed so the source's loudest 10 ms lands at time T (a head that would start before 0 is trimmed). */
  function alignAt(b, T, gain = 0) {
    const p = peakTime(b);
    if (p <= T) return { buf: b, at: T - p, gain };
    return { buf: lib.fadeIn(lib.slice(b, p - T, b.duration), Math.min(0.03, Math.max(0.004, T * 0.5)), 'sine'), at: 0, gain };
  }
  const cut = (b, len, fade = 0.3) => lib.fadeOut(lib.slice(b, 0, Math.min(len, b.duration)), Math.min(len, b.duration) * fade, 'exp');
  const env = (b, pts) => lib.automate(b, pts);   // [[t, dB]...] or fn(t) -> linear
  /** Dry + a room whose send is high-passed (`hp` Hz): booms stay tight, the space carries the body and the air. */
  const verb = (b, room, wet, len, seed, ch = 2, hp = 170) => {
    const w = lib.reverb(lib.eq(b, [{ type: 'hp', f: hp, order: 2 }]), room, { wet: 1, dry: 0, seed, length: len, channels: ch });
    return lib.mix([{ buf: b }, { buf: w, gainLin: wet }], { channels: ch });
  };
  /**
   * Pre-shape for the loudness stage: soft-clip to the peak-to-loudness ratio the target needs (<= ~1 dB limiting),
   * at most `max` dB of drive (deeper clipping squares the booms and buries the transients). A cue whose natural PLR
   * needs more is mastered lower and lifted with the manifest `vol` instead.
   */
  const shapeLog = [];
  const shape = (b, lufs, o = {}) => {
    const plr0 = lib.truePeakDb(b) - lib.lufs(b), want = -2.3 - lufs;
    const out = plr0 <= want ? b : K.clipToPLR(b, want, { min: 0, max: 6, threshold: -6, ...o });
    shapeLog.push([lufs, Math.round(plr0 * 10) / 10, Math.round((lib.truePeakDb(out) - lib.lufs(out)) * 10) / 10]);
    return out;
  };
  const atLufs = (b, l) => lib.normalizeLufs(b, l, { ceiling: -1 });
  /** A sub-heavy source shortened: it decays with t60 from 20 ms in (booms stay punchy, not a sustained block). */
  const tight = (b, t60) => lib.decay(b, t60, 0.02);
  /** Equal-power pan that moves: p(t) in [-1, 1] (mono-safe: the centre sums to the source). */
  function panMove(b, p) {
    const m = mono(b).data[0], n = m.length, L = new Float32Array(n), R = new Float32Array(n);
    for (let i = 0; i < n; i++) { const a = (clamp(p(i / SR), -1, 1) + 1) * Math.PI / 4; L[i] = m[i] * Math.cos(a) * Math.SQRT2; R[i] = m[i] * Math.sin(a) * Math.SQRT2; }
    return new Buf([L, R], SR);
  }
  const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

  // ---- synthesis
  /** Additive partials [[ratio, amp, t60]...], partials over NYQ dropped. */
  const parts = (dur, base, list, seed) => lib.partials(dur, { base, list: list.filter(([r]) => base * r < NYQ), seed });
  /**
   * 劍鳴: a steel blade's ring — free-free bar modes (1 : 2.756 : 5.404 : 8.933 : 13.34), each a close doublet (the
   * blade's two bending planes), so the ring beats slowly (the 「嗡」); higher modes die first.
   */
  function bladeRing(f0, dur, { seed = 'br', t60 = 1.2, bright = 1, beat = 0.0035, attack = 0 } = {}) {
    const modes = [1, 2.756, 5.404, 8.933, 13.34], amp = [1, 0.55, 0.32, 0.18, 0.1], list = [];
    modes.forEach((r, i) => { const a = amp[i] * (i ? bright : 1), t = t60 / (1 + i * 0.8); list.push([r, a, t], [r * (1 + beat * (i + 1)), a * 0.65, t * 0.85]); });
    let b = parts(dur, f0, list, seed);
    if (attack > 0) b = lib.applyEnv(b, lib.envCurve(dur, [[0, 0], [attack, 1], [dur, 1]]));
    return b;
  }
  /** A struck crystal-glass bell: wine-glass modes (1 : 2.32 : 4.25 : 6.63 : 9.4) as doublets (a slow shimmer) + a tick. */
  function glass(f, dur, { seed = 'gl', t60 = 1.6, bright = 1, tick = -16 } = {}) {
    const R = [[1, 1, 1], [2.32, 0.38, 0.5], [4.25, 0.18, 0.28], [6.63, 0.08, 0.16], [9.4, 0.04, 0.1]], list = [];
    for (const [r, a, k] of R) { const amp = r === 1 ? a : a * bright; list.push([r, amp, t60 * k], [r * 1.0025, amp * 0.5, t60 * k * 0.8]); }
    const t = lib.noiseBurst({ dur: 0.015, decay: 0.003, hp: Math.min(9000, f * 3), lp: 16000, seed: seed + 't' });
    return lib.mix([{ buf: parts(dur, f, list, seed) }, { buf: t, gain: tick }]);
  }
  /** Glass bells in sequence: notes at i * step (s), gains per note, optional pan per note. */
  function run(notes, step, { seed = 'run', t60 = 1.2, dur = 1.6, gains = [], pans = null, tick = -16, bright = 1, jitter = 0 } = {}) {
    const r = rng(seed);
    return lib.mix(notes.map((f, i) => ({ buf: glass(f, dur, { seed: `${seed}${i}`, t60, tick, bright }), at: Math.max(0, i * step + (jitter ? r.range(-jitter, jitter) : 0)), gain: gains[i] ?? 0, ...(pans ? { pan: pans[i] } : {}) })), pans ? { channels: 2 } : {});
  }
  /**
   * The projected energy edge: a chorused harmonic buzz (two detuned saws + a fifth + an octave triangle + a faint
   * FM glass overtone) at f(t). Raw: callers filter and envelope it.
   */
  function energy(dur, f, { det = 0.007, fm = -16 } = {}) {
    const fn = lib.toFn(f);
    return lib.mix([
      { buf: lib.tone(dur, { type: 'saw', freq: (t) => fn(t) }) },
      { buf: lib.tone(dur, { type: 'saw', freq: (t) => fn(t) * (1 + det) }), gain: -2 },
      { buf: lib.tone(dur, { type: 'saw', freq: (t) => fn(t) * 1.5 * (1 - det * 0.5) }), gain: -8 },
      { buf: lib.tone(dur, { type: 'triangle', freq: (t) => fn(t) * 2 }), gain: -7 },
      { buf: lib.fm(dur, { carrier: (t) => Math.min(9000, fn(t) * 4), ratio: 1.003, index: 1.4, indexDecay: 99 }), gain: fm },
    ]);
  }
  /**
   * The energy edge sweeping past the camera: pitch rises to the closest point (`peak`) and falls away (doppler) while
   * a band opens and closes with the level.
   */
  function zing(dur, peak, f0, { up = 3, down = -6, band = [900, 3200], q = 1.1, sharp = 2, fall = 7, fm = -16 } = {}) {
    const f = (t) => f0 * 2 ** ((t < peak ? -1 + (up + 1) * (t / peak) : up + (down - up) * Math.min(1, (t - peak) / (dur - peak))) / 12);
    const e = (t) => (t < peak ? (t / peak) ** sharp : Math.exp(-(t - peak) * fall / (dur - peak)));
    const s = lib.sweep(energy(dur, f, { fm }), 'bp', (t) => band[0] + (band[1] - band[0]) * e(t), { q });
    return lib.automate(s, e);
  }
  /** Swept band-noise whoosh peaking at `peak`: centre f0 -> fp (at the peak) -> f1. */
  function swoosh(dur, peak, [f0, fp, f1], { q = 1.6, color = 'pink', seed = 'sw', rise = 2, fall = 6 } = {}) {
    const F = (t) => (t < peak ? f0 * (fp / f0) ** (t / peak) : fp * (f1 / fp) ** ((t - peak) / (dur - peak)));
    const s = lib.sweep(lib.noise(dur, { color, seed }), 'bp', F, { q });
    return lib.automate(s, (t) => (t < peak ? (t / peak) ** rise : Math.exp(-(t - peak) * fall / (dur - peak))));
  }
  /** Low impact: pitched-down thump with harmonics so laptop speakers carry it. */
  const boom = (seed, { f0 = 75, f1 = 42, sweep = 0.06, decay = 0.5, drive = 2.5, amount = -3.5 } = {}) => lib.psychoBass(lib.thump({ f0, f1, sweep, decay, click: 0.1, drive, seed }), { freq: 110, amount });
  /** Scattered crystal pings (star dust, glass glitter). */
  function tinkles(dur, n, { lo = 2500, hi = 7000, t60 = 0.12, seed = 't', fall = 8, skew = 1.6 } = {}) {
    const r = rng(seed), out = [];
    for (let i = 0; i < n; i++) {
      const base = lo * Math.pow(hi / lo, r.next()), at = Math.pow(r.next(), skew) * dur;
      out.push({ buf: parts(t60 * 3, base, [[1, 1, t60], [2.41, 0.35, t60 * 0.6], [3.87, 0.18, t60 * 0.4]], `${seed}${i}`), at, gain: -r.next() * 9 - (at / dur) * fall });
    }
    return lib.mix(out);
  }
  /** Tubular bell (VSCO 2, C4 / C5 takes) retuned to `hz`, cut to `len` s with a decay. */
  const bellCache = new Map();
  async function tubular(hz, len = 2.2, { t60 = 2.4, hp = 120 } = {}) {
    const base = hz < 400 ? [X.tbC4, 261.63] : [X.tbC5, 523.25];
    const key = base[0];
    if (!bellCache.has(key)) bellCache.set(key, strike(await ld(key, 0, 6, { stereo: true, hp: 60, fadeOut: 0.5 })));
    const b = lib.varispeed(bellCache.get(key), hz / base[1]);
    return lib.decay(lib.eq(cut(b, len, 0.3), [{ type: 'hp', f: hp, order: 2 }]), t60, 0.05);
  }
  /** Twin (夜渡) version: -4 st, darker, a dotted echo (§1.12 雙生版). */
  const twin = (b) => {
    let o = lib.varispeedSemis(b, -4);
    o = lib.eq(o, [{ type: 'lp', f: 7000, order: 2 }, { type: 'peak', f: 380, gain: 1.5, q: 0.8 }]);
    o = lib.saturate(o, { drive: 3, type: 'tube', mix: 0.35 });
    return lib.echo(o, { time: 0.21, feedback: 0.36, lp: 2600, hp: 180, mix: 0.4, pingpong: o.channels === 2, length: o.duration + 0.9 });
  };
  return { K, rng, norm, mono, clamp, ld, strike, peakTime, alignAt, cut, env, verb, shape, shapeLog, atLufs, tight, panMove, smooth,
    parts, bladeRing, glass, run, energy, zing, swoosh, boom, tinkles, tubular, twin };
}

// ---------------------------------------------------------------------------------------------- swings
/** One heavy swing: P = where the blade passes (the swing lands), D = length. */
async function swingVariant(lib, H, src, k, { P = 0.11, D = 0.7, f0 = N.E3, mass = -2.5, heavy = 1, dir = 1, seed = 'sw' } = {}) {
  const r = H.rng(`${seed}${k}`);
  // the blade's mass: the 200-400 Hz sword whoom taken down 1.5-3.5 st (a 1.1 m blade moves a lot of air)
  const whoom = lib.varispeedSemis(src.whoom, mass + r.range(-1, 1));
  // the cutting edge: a katana pass or the clean fast swoosh, high-passed
  const air = src.air[k % src.air.length];
  const body = H.swoosh(D, P, [220, 640 + 60 * heavy, 200], { q: 1.0, seed: `${seed}b${k}`, rise: 2.2, fall: 5 });
  const hiss = H.swoosh(D, P + 0.008, [1900, 5600, 2500], { q: 1.2, color: 'white', seed: `${seed}h${k}`, rise: 3, fall: 9 });
  // the energy edge passing: the harmonic buzz dopplering up to the pass and away, and its glassy sizzle up top
  const z = H.zing(D, P + 0.004, f0 * r.range(0.985, 1.015), { up: 3 + heavy, down: -7, band: [800, 3600], seed: `${seed}z${k}` });
  const sizzle = H.swoosh(D, P + 0.01, [6500, 9500, 7000], { q: 2.2, color: 'white', seed: `${seed}q${k}`, rise: 4, fall: 12 });
  // star sparks thrown off the edge after the pass
  const sparks = H.tinkles(0.42, 7, { lo: 3600, hi: 9500, t60: 0.07, seed: `${seed}s${k}`, fall: 12, skew: 1.3 });
  const push = lib.thump({ f0: 105, f1: 62, sweep: 0.05, decay: 0.14, click: 0, drive: 1.4, seed: `${seed}p${k}` });
  // moving layers pan across the screen (alternating direction: both combo steps share the name), body centred
  const p = (t) => dir * (0.45 - 0.9 * H.smooth((t - P + 0.09) / 0.2));
  const moving = H.panMove(lib.mix([H.alignAt(air, P + 0.004, 0), { buf: H.norm(hiss), gain: -6 }, { buf: H.norm(z), gain: -2 }, { buf: H.norm(sizzle), gain: -15 }], { length: D }), p);
  const centre = lib.mix([H.alignAt(H.norm(whoom), P, -4), { buf: H.norm(body), gain: -7 }, { buf: push, at: P - 0.035, gain: -19 + heavy * 2 }], { length: D });
  let v = lib.mix([{ buf: lib.stereoize(centre, { width: 0.18, hp: 400, seed: `${seed}w${k}` }) }, { buf: moving }, { buf: lib.stereoize(sparks, { width: 0.5, hp: 2000, seed: `${seed}x${k}` }), at: P + 0.02, gain: -19 }], { channels: 2, length: D });
  v = lib.eq(v, [{ type: 'hp', f: 55, order: 2 }, { type: 'peak', f: 260, gain: -2, q: 0.9 }, { type: 'peak', f: 2600, gain: 2, q: 0.8 }, { type: 'highshelf', f: 7000, gain: 2 }]);
  return H.cut(H.verb(v, 'urban', 0.1, 0.9, `${seed}v${k}`), D + 0.1, 0.35);
}

async function swings(lib, ctx, cat, H, keep) {
  const src = { whoom: await H.ld(X.whoom, 0, 0.557, { hp: 60 }), air: [] };
  for (const [a, z] of KATANA) src.air.push(await H.ld(X.katana, a, z, { hp: 380 }));   // (one decode at a time)
  src.air.push(await H.ld(X.swoosh, 0.2, 0.72, { hp: 320 }));
  // 星流 ① ② (the handler starts it 0.09 s into the clip; the blade lands at 0.2 s -> the whoosh peaks 0.11 s in)
  const sw = [];
  for (let k = 0; k < 6; k++) sw.push(H.shape(await swingVariant(lib, H, src, k, { dir: k % 2 ? -1 : 1, f0: k % 3 === 2 ? N.B2 : N.E3 }), -15));
  await cat.add('starsword_swing', sw, { lufs: -15, spatial: false, channels: 2, voices: 3, pitch: [0.97, 1.03], sources: [X.whoom, X.katana, X.swoosh] });
  keep.swing = sw;
  const light = [];
  for (let k = 0; k < 4; k++) light.push(H.shape(await swingVariant(lib, H, src, k + 7, { D: 0.5, P: 0.08, mass: -1.5, heavy: 0, f0: N.B3, dir: k % 2 ? -1 : 1, seed: 'swl' }), -17));
  await cat.add('starsword_swing_light', light, { lufs: -17, spatial: false, channels: 2, voices: 3, pitch: [0.96, 1.04], sources: [X.whoom, X.katana, X.swoosh] });

  // 迴天: the sword wheels round the body once (0.8 s clip, hit 0.3 s; the cue starts 0.135 s in -> the hit at
  // 0.165 s): two passes circling the head (front -> left -> behind, darker -> right -> front), a low boom on the hit
  const wheel = [];
  for (let k = 0; k < 3; k++) {
    const r = H.rng(`wh${k}`), D = 1.05, P1 = 0.16, P2 = 0.52;
    const a1 = await swingVariant(lib, H, src, k + 2, { D: 0.6, P: P1, heavy: 1.5, mass: -3.5, f0: N.E3, seed: 'wa' });
    const a2 = await swingVariant(lib, H, src, k + 4, { D: 0.6, P: 0.1, heavy: 0.5, mass: -2.5, f0: N.B2, seed: 'wb' });
    // the second pass is behind the head for most of its travel: darker, a little quieter
    const behind = lib.eq(H.mono(a2), [{ type: 'lp', f: 2600, order: 2 }]);
    const circ = H.panMove(behind, (t) => Math.sin(2 * Math.PI * (t / 0.42)) * 0.8);
    const z = H.zing(D, P1, N.E3 * r.range(0.99, 1.01), { up: 4, down: -3, band: [600, 2600], fall: 4 });
    const z2 = H.zing(0.6, 0.12, N.B2, { up: 4, down: -8, band: [500, 2200] });
    const v = lib.mix([
      { buf: a1 }, { buf: circ, at: P2 - 0.1, gain: -3 },
      { buf: H.panMove(H.norm(z), (t) => Math.sin(2 * Math.PI * (t - P1) / 0.75) * 0.7), gain: -6 },
      { buf: H.panMove(H.norm(z2), (t) => -Math.sin(2 * Math.PI * t / 0.6) * 0.6), at: P2 - 0.12, gain: -13 },
      { buf: H.boom(`whb${k}`, { f0: 92, f1: 46, sweep: 0.04, decay: 0.36, drive: 2.5 }), at: P1 - 0.005, gain: -8 },
      { buf: lib.noiseBurst({ dur: 0.05, decay: 0.012, hp: 900, lp: 9000, seed: `whn${k}` }), at: P1, gain: -14 },
    ], { channels: 2, length: D + 0.2 });
    wheel.push(H.shape(H.cut(v, D + 0.2, 0.35), -14.5));
  }
  await cat.add('starsword_wheel', wheel, { lufs: -14.5, spatial: false, channels: 2, voices: 2, pitch: [0.98, 1.02], sources: [X.whoom, X.katana, X.swoosh] });

  // 迴瀾: the counter slash a beat after a perfect guard (hit 0.12 s in): a short inhale, a fast heavy slash, the
  // energy edge flaring (brighter, up a fourth), a wash of starlight after it
  const counter = [];
  for (let k = 0; k < 3; k++) {
    const s = await swingVariant(lib, H, src, k + 1, { D: 0.72, P: 0.11, heavy: 1.8, mass: -3, f0: N.B3, dir: -1, seed: 'ct' });
    const inhale = lib.reverse(H.swoosh(0.1, 0.02, [5000, 3000, 1200], { q: 0.9, color: 'white', seed: `cti${k}`, fall: 3 }));
    const surge = H.swoosh(0.6, 0.13, [500, 2400, 900], { q: 0.8, seed: `cts${k}`, fall: 4 });
    const glint = H.run([N.E6, N.B6, N.E7], 0.03, { seed: `ctg${k}`, t60: 0.45, dur: 0.6, gains: [0, -3, -6] });
    const v = lib.mix([{ buf: s }, { buf: H.norm(inhale), gain: -16 }, { buf: lib.stereoize(H.norm(surge), { width: 0.4, hp: 500, seed: `ctw${k}` }), gain: -10 },
      { buf: lib.stereoize(H.norm(glint), { width: 0.4, hp: 1500, seed: `ctx${k}` }), at: 0.12, gain: -19 }], { channels: 2 });
    counter.push(H.shape(H.cut(v, 0.85, 0.35), -14.5));
  }
  await cat.add('starsword_counter', counter, { lufs: -14.5, vol: 1.1, spatial: false, channels: 2, voices: 2, pitch: [0.98, 1.02], sources: [X.whoom, X.katana, X.swoosh] });

  // def.sound contract (Arsenal / remote.js play <sound>_close / _tail / _far for a networked "shot"; a melee special
  // never sends one, so these are a safety net): a swing, mono, as a teammate hears it
  const close = sw.slice(0, 3).map((b) => H.cut(H.mono(b), 0.6, 0.3));
  await cat.add('starsword_close', close, { lufs: -18, spatial: true, channels: 1, range: [3, 40], voices: 3, pitch: [0.95, 1.05], sources: [X.whoom, X.katana] });
  const tail = sw.slice(0, 2).map((b, k) => lib.fadeIn(H.mono(lib.reverb(lib.slice(b, 0, 0.3), 'alley', { wet: 1, dry: 0, seed: `sst${k}`, length: 0.7, channels: 1 })), 0.02));
  await cat.add('starsword_tail', tail, { target: 'gunTail', vol: 0.25, spatial: false, channels: 1, voices: 2, pitch: [0.95, 1.05], maxHeadMs: 40, sources: [X.whoom, X.katana] });
  const far = sw.slice(0, 2).map((b) => lib.eq(H.mono(b), [{ type: 'lp', f: 2400, order: 2 }, { type: 'hp', f: 180, order: 2 }]));
  await cat.add('starsword_far', far, { target: 'gunFar', vol: 0.4, spatial: true, channels: 1, range: [10, 40], voices: 2, pitch: [0.94, 1.06], sources: [X.whoom, X.katana] });
}

// ---------------------------------------------------------------------------------------------- hits
async function hits(lib, ctx, cat, H, keep) {
  // (fs:269483's chop is a flam of clicks: the two clean cuts, one taken down for a third colour)
  const cuts = [await H.ld(X.gash, 0.01, 0.37, { hp: 300 }), await H.ld(X.slice, 0.05, 0.62, { hp: 250 }), await H.ld(X.gash, 0.01, 0.37, { hp: 220, semis: -4 })];
  const meats = [await H.ld(X.meaty, 0, 0.48, { hp: 80 }), await H.ld(X.wet, 0.07, 0.54, { hp: 70 }), await H.ld(X.gross, 0.0, 0.62, { hp: 80 })];
  // starsword_hit: the blade bites — a cut, the meat, the mass behind it, a starlight zap and a glint of star dust
  const hit = [];
  for (let k = 0; k < 6; k++) {
    const r = H.rng(`hit${k}`);
    const zap = lib.applyEnv(lib.fm(0.2, { carrier: [[0, r.range(2400, 3000)], [0.2, 800]], ratio: 1.41, index: 3, indexDecay: 0.05 }), lib.expEnv(0.2, { attack: 0.001, t60: 0.12 }));
    const v = lib.mix([
      { buf: H.strike(lib.varispeedSemis(cuts[k % 3], r.range(-2, 0.5))), gain: -1 },
      { buf: H.strike(lib.varispeedSemis(meats[(k + 1) % 3], r.range(-2.5, 0))), at: 0.003, gain: -2 },
      { buf: H.boom(`hb${k}`, { f0: 160, f1: 66, sweep: 0.025, decay: 0.13, drive: 2.2 }), gain: -9 },
      // the blade biting: a short steel ring on the cut
      { buf: H.norm(H.bladeRing([N.E5, N.Gs5, N.B5][k % 3], 0.3, { t60: 0.16, bright: 1.2, seed: `hr${k}` })), gain: -15 },
      { buf: H.K.crack(`hc${k}`, { dur: 0.012, decay: 0.003, hp: 2200 }), gain: -9 },
      { buf: H.norm(zap), at: 0.002, gain: -15 },
      { buf: H.norm(H.glass([N.E7, N.Fs7, N.B6][k % 3], 0.5, { seed: `hg${k}`, t60: 0.3, tick: -30 })), at: 0.006, gain: -20 },
      { buf: H.tinkles(0.3, 5, { lo: 4500, hi: 9500, t60: 0.06, seed: `ht${k}` }), at: 0.01, gain: -19 },
    ]);
    hit.push(H.shape(H.cut(H.verb(v, 'smallRoom', 0.1, 0.4, `hv${k}`, 1), 0.6, 0.45), -15));
  }
  await cat.add('starsword_hit', hit, { lufs: -15, spatial: true, range: [4, 60], voices: 4, pitch: [0.95, 1.05], priority: 2, sources: [X.gash, X.slice, X.meaty, X.wet, X.gross] });

  // starsword_hit_ring: 命中時金屬共鳴「嗡」 — the blade rings on contact: a beating steel ring around E4, its bright
  // shing near E6, the energy edge humming E2 / B2 and dying with it
  const ring = [];
  for (let k = 0; k < 3; k++) {
    const r = H.rng(`ring${k}`), D = 1.4;
    const hum = lib.automate(lib.eq(H.energy(D, (t) => N.E2 * (1 + 0.004 * Math.sin(2 * Math.PI * 5.5 * t)), { fm: -30 }), [{ type: 'hp', f: 100, order: 2 }, { type: 'lp', f: 900, order: 2 }, { type: 'peak', f: 330, gain: 3, q: 1 }]),
      (t) => Math.min(1, t / 0.012) * Math.exp(-t * 4.2));
    const v = lib.mix([
      { buf: H.norm(H.bladeRing(N.E4 * r.range(0.995, 1.005), D, { t60: 1.1, bright: 0.8, seed: `rg${k}`, beat: 0.005 })) },
      { buf: H.norm(H.bladeRing([N.E6, N.Fs6, N.B5][k] * r.range(0.997, 1.003), D, { t60: 0.6, bright: 0.5, seed: `rh${k}` })), gain: -9 },
      { buf: H.norm(hum), gain: -10 },
    ]);
    ring.push(H.cut(H.verb(lib.stereoize(v, { width: 0.35, hp: 500, seed: `rs${k}` }), 'warehouse', 0.14, 1.2, `rv${k}`), 1.4, 0.4));
  }
  // a pure ring (PLR ~17): mastered at -20 and lifted; handler 0.4 -> ~-24 LUFS under the hit
  await cat.add('starsword_hit_ring', ring, { lufs: -20, vol: 1.5, spatial: false, channels: 2, voices: 3, pitch: [0.98, 1.02] });

  // starsword_hit_flesh: the flesh layer alone (spare; the SFX table lists it)
  const flesh = [];
  for (let k = 0; k < 4; k++) {
    const v = lib.mix([{ buf: H.strike(cuts[k % 3]) }, { buf: H.strike(meats[k % 3]), at: 0.003, gain: -2 }, { buf: H.boom(`hf${k}`, { f0: 140, f1: 60, sweep: 0.02, decay: 0.12, drive: 2 }), gain: -7 }]);
    flesh.push(H.shape(H.cut(v, 0.5, 0.45), -17));
  }
  await cat.add('starsword_hit_flesh', flesh, { lufs: -17, spatial: true, range: [3, 45], voices: 3, pitch: [0.94, 1.06], sources: [X.gash, X.slice, X.meaty, X.wet, X.gross] });

  // starsword_hit_wall: the blade meets the street / a wall — a heavy clang, concrete, sparks, a stone chip, the ring
  const wall = [];
  const deep = await H.ld(X.clangDeep, 0, 0.6, { hp: 70, semis: -2 });
  const metal = await H.ld(X.metalHit, 0, 0.25, { hp: 120 });
  const conc = await H.ld(X.concHit, 0, 0.47, { hp: 90 });
  const chips = await H.ld(X.stoneDebris, 0, 0.39, { hp: 300 });
  for (let k = 0; k < 5; k++) {
    const r = H.rng(`wall${k}`);
    const sparks = lib.automate(lib.crackle(0.3, { density: 160, decay: 0.002, hp: 3500, seed: `wsp${k}` }), (t) => Math.exp(-t * 12));
    const v = lib.mix([
      { buf: H.strike(await H.ld(X.metalH(k), 0, 0.4, { hp: 150, semis: r.range(-3, -1) })) },
      { buf: H.strike(deep), gain: -5 },
      ...(k % 2 ? [{ buf: H.strike(metal), gain: -10 }] : []),   // (fs:406562 is a needle: a touch of it only)
      { buf: H.strike(conc), gain: -4 },
      { buf: H.norm(sparks), at: 0.004, gain: -13 },
      { buf: H.norm(H.bladeRing([N.E5, N.Fs5, N.Gs5, N.B5, N.E5][k] * r.range(0.99, 1.01), 0.9, { t60: 0.55, bright: 1.1, seed: `wr${k}` })), at: 0.002, gain: -12 },
      { buf: H.strike(chips), at: 0.02, gain: -11 },
    ]);
    wall.push(H.shape(H.cut(H.verb(v, 'alley', 0.14, 0.7, `wv${k}`, 1), 0.85, 0.45), -18, { max: 8 }));
  }
  // metal clangs are peaky (natural PLR ~24): mastered at -18 and lifted, rather than limited flat
  await cat.add('starsword_hit_wall', wall, { lufs: -18, vol: 1.3, spatial: true, range: [3, 50], voices: 3, pitch: [0.95, 1.05], sources: [X.metalH(0), X.metalHit, X.clangDeep, X.concHit, X.stoneDebris] });

  // starsword_kill: 星鈴 — a bright glass-bell pair on the pentatonic, a lift of star dust, weight under it
  const kill = [];
  const pairs = [[N.E6, N.B6], [N.Fs6, N.Cs7], [N.Gs6, N.E7], [N.B6, N.Fs7]];
  for (let k = 0; k < 4; k++) {
    const [a, b] = pairs[k];
    const lift = lib.applyEnv(lib.fm(0.35, { carrier: [[0, a * 2], [0.35, a * 4]], ratio: 2.01, index: 0.8, indexDecay: 0.2 }), lib.expEnv(0.35, { attack: 0.01, t60: 0.3 }));
    const v = lib.mix([
      { buf: H.norm(H.glass(a, 1.2, { seed: `ka${k}`, t60: 1.0, bright: 1.2, tick: -12 })) },
      { buf: H.norm(H.glass(b, 1.1, { seed: `kb${k}`, t60: 0.8, tick: -14 })), at: 0.018, gain: -4 },
      { buf: H.tinkles(0.5, 9, { lo: 4500, hi: 10500, t60: 0.08, seed: `kt${k}`, skew: 1.1 }), at: 0.02, gain: -12 },
      { buf: H.norm(lift), at: 0.015, gain: -20 },
    ]);
    const wet = H.verb(lib.stereoize(v, { width: 0.4, hp: 900, seed: `ks${k}` }), 'warehouse', 0.2, 1.2, `kv${k}`, 2, 400);
    // weight under the bell, kept out of the room (a dry, short low thump)
    kill.push(H.cut(lib.mix([{ buf: wet }, { buf: lib.thump({ f0: 110, f1: 60, sweep: 0.03, decay: 0.12, click: 0, drive: 1.5, seed: `kth${k}` }), gain: -15 }], { channels: 2 }), 1.3, 0.4));
  }
  await cat.add('starsword_kill', kill, { lufs: -19, vol: 1.5, spatial: false, channels: 2, voices: 3, pitch: [1, 1] });

  // starsword_sever: 斷肢 — a clean heavy cut through bone, the wet part, a starlight shing on the cut line
  const bones = [await H.ld(X.bone, 0, 0.6, { hp: 150 }), await H.ld(X.fracture, 0, 0.32, { hp: 150 }), await H.ld(X.neck, 0.53, 1.14, { hp: 150 })];
  const gores = [await H.ld(X.splat, 0, 0.7, { hp: 90 }), await H.ld(X.gore, 0, 0.7, { hp: 90 })];
  const sev = [];
  for (let k = 0; k < 4; k++) {
    const r = H.rng(`sev${k}`);
    const v = lib.mix([
      { buf: H.strike(lib.varispeedSemis(cuts[(k + 1) % 2], r.range(-3, -1))) },
      { buf: H.strike(bones[k % 3]), at: 0.006, gain: -3 },
      { buf: H.strike(gores[k % 2]), at: 0.012, gain: -5 },
      { buf: H.boom(`svb${k}`, { f0: 130, f1: 55, sweep: 0.03, decay: 0.2, drive: 2 }), gain: -7 },
      { buf: H.norm(H.bladeRing(N.B6 * r.range(0.99, 1.01), 0.6, { t60: 0.35, bright: 0.6, seed: `svr${k}` })), at: 0.004, gain: -17 },
      { buf: H.tinkles(0.5, 7, { lo: 4000, hi: 9000, t60: 0.08, seed: `svt${k}` }), at: 0.03, gain: -17 },
    ]);
    sev.push(H.shape(H.cut(H.verb(v, 'alley', 0.1, 0.6, `svv${k}`, 1), 0.85, 0.45), -17));
  }
  await cat.add('starsword_sever', sev, { lufs: -17, spatial: true, range: [4, 50], voices: 3, pitch: [0.95, 1.05], sources: [X.gash, X.slice, X.bone, X.fracture, X.neck, X.splat, X.gore] });
}

// ---------------------------------------------------------------------------------------------- 墜星 charge, slam, 星痕 wave
async function charge(lib, ctx, cat, H, keep) {
  // starsword_charge: the rising hum (loop; the handler plays it at 0.5 and rate 0.8 -> 1.25 over the 1.8 s charge,
  // §1.12 蓄力 pitch 0.8 -> 1.25). Periodic in P = 3 s: every tone is a whole number of cycles (chorus pairs at +-1/3
  // Hz), every modulation too (2 Hz throb, 6 Hz shimmer, the 1/3 Hz vowel sweep); only the noise / crackle textures
  // go through the loop crossfade (a coherent tone through an equal-power crossfade swells +3 dB at the seam).
  {
    const P = 3, L = 4, q = (f) => Math.round(f * P) / P;
    const pair = (f, g, type = 'saw') => [{ buf: lib.tone(P, { type, freq: q(f) + 1 / 3 }), gain: g, pan: -0.35 }, { buf: lib.tone(P, { type, freq: q(f) - 1 / 3 }), gain: g, pan: 0.35 }];
    let drone = lib.mix([...pair(N.E2, -4), ...pair(N.B2, -5), ...pair(N.E3, -5), ...pair(N.E4, -14, 'triangle')], { channels: 2 });
    drone = lib.saturate(lib.eq(drone, [{ type: 'lp', f: 1600, order: 2 }]), { drive: 3, type: 'tube' });
    const vowel = lib.sweep(drone, 'bp', (t) => 520 + 260 * Math.sin(2 * Math.PI * t / P), { q: 1.3 });
    const throb = (t) => 0.82 + 0.18 * Math.sin(2 * Math.PI * 2 * t);
    const body = H.env(lib.mix([{ buf: H.norm(drone), gain: -4 }, { buf: H.norm(vowel), gain: -3 }], { channels: 2 }), throb);
    const shimmer = H.env(lib.mix([{ buf: lib.tone(P, { freq: q(N.E6) }), pan: -0.4 }, { buf: lib.tone(P, { freq: q(N.B6) }), gain: -3, pan: 0.4 }, { buf: lib.tone(P, { freq: q(N.Fs7) }), gain: -9 }], { channels: 2 }),
      (t) => 0.55 + 0.45 * Math.sin(2 * Math.PI * 6 * t));
    const wind = H.env(lib.eq(lib.noise(L, { color: 'pink', seed: 'chw', channels: 2 }), [{ type: 'bp', f: 2600, q: 0.8 }]), (t) => 0.6 + 0.4 * Math.sin(2 * Math.PI * 4 * t));
    const spark = lib.crackle(L, { density: 22, decay: 0.003, hp: 5000, minAmp: 0.2, seed: 'chs' });
    const rg = H.rng('chg'), glim = [];
    for (let i = 0; i < 14; i++) glim.push({ buf: H.glass(DIPPER[rg.int(0, 6)] * 2, 0.5, { seed: `chg${i}`, t60: 0.3, tick: -30 }), at: i * 0.28 + rg.range(0, 0.15), gain: -rg.range(0, 6), pan: rg.range(-0.8, 0.8) });
    const texture = lib.loopCrossfade(lib.mix([{ buf: H.norm(wind), gain: -11 }, { buf: lib.stereoize(H.norm(spark), { width: 0.6, hp: 3000, seed: 'chst' }), gain: -18 },
      { buf: H.norm(lib.mix(glim, { channels: 2, length: L })), gain: -20 }], { channels: 2 }), L - P);
    const v = lib.mix([{ buf: body }, { buf: H.norm(shimmer), gain: -22 }, { buf: texture }], { channels: 2, length: P });
    await cat.add('starsword_charge', v, { lufs: -17, loop: true, spatial: false, channels: 2, voices: 1, pitch: [1, 1] });
    keep.charge = v;
  }

  // starsword_charge_stage: 每階一聲鈴 — the cloud-head guard ratchets open 6° (a detent clack) and a glass bell
  // rings over a short surge (the handler raises the pitch a step per stage)
  const stage = [];
  for (let k = 0; k < 2; k++) {
    const surge = lib.sweep(H.energy(0.45, [[0, N.E3], [0.35, N.B3]]), 'lp', (t) => 500 + 4000 * Math.min(1, t / 0.3), { q: 1.4 });
    const v = lib.mix([
      { buf: H.strike(await H.ld(X.metalL(k + 1), 0, 0.3, { hp: 600, semis: 3 })), gain: -6 },
      { buf: H.K.tick(`cst${k}`, 2600), gain: -9 },
      { buf: H.norm(H.glass(N.B6, 1.3, { seed: `csa${k}`, t60: 1.1, tick: -14 })), at: 0.012 },
      { buf: H.norm(H.glass(N.E7, 1.1, { seed: `csb${k}`, t60: 0.8, tick: -18 })), at: 0.03, gain: -6 },
      { buf: lib.automate(H.norm(surge), (t) => (t < 0.3 ? (t / 0.3) ** 2 : Math.exp(-(t - 0.3) * 18))), gain: -15 },
    ]);
    stage.push(H.cut(H.verb(lib.stereoize(v, { width: 0.35, hp: 800, seed: `css${k}` }), 'smallRoom', 0.16, 0.8, `csv${k}`), 1.2, 0.4));
  }
  await cat.add('starsword_charge_stage', stage, { lufs: -20, vol: 1.5, spatial: false, channels: 2, voices: 2, pitch: [1, 1], sources: [X.metalL(1)] });

  // starsword_charge_full: 蓄滿變形 — the guard snaps fully open (a heavy clack and slide), the energy blade flares to
  // 1.4x with a VWOOM and crackle, a star flares at the tip (a glass chord + star dust)
  {
    const D = 1.5;
    const flare = lib.automate(lib.sweep(H.energy(D, [[0, N.B2], [0.12, N.E3], [D, N.E3]]), 'lp', (t) => 400 + 6000 * Math.min(1, t / 0.18), { q: 1.6 }), (t) => Math.min(1, (t / 0.06)) * Math.exp(-t * 2.6));
    const crack = lib.automate(lib.crackle(0.8, { density: 140, decay: 0.002, hp: 3000, seed: 'cfc' }), (t) => Math.exp(-t * 5));
    const v = lib.mix([
      { buf: H.strike(await H.ld(X.metalH(2), 0, 0.4, { hp: 200, semis: -1 })), gain: -4 },
      { buf: H.norm(H.K.scrape(0.16, 1400, 3200, 'cfs')), gain: -12 },
      { buf: H.norm(flare), at: 0.02, gain: -2 },
      { buf: H.boom('cfb', { f0: 80, f1: 44, decay: 0.45, drive: 2 }), at: 0.02, gain: -7 },
      { buf: H.norm(H.run([N.E6, N.B6, N.E7], 0.012, { seed: 'cfg', t60: 1.3, dur: 1.4, gains: [0, -3, -5] })), at: 0.06, gain: -5 },
      { buf: H.tinkles(0.9, 14, { lo: 3500, hi: 9500, t60: 0.1, seed: 'cft', skew: 1.2 }), at: 0.08, gain: -13 },
      { buf: H.norm(crack), at: 0.03, gain: -17 },
    ]);
    const out = H.shape(H.cut(H.verb(lib.stereoize(v, { width: 0.4, hp: 600, seed: 'cfst' }), 'warehouse', 0.2, 1.4, 'cfv'), D, 0.4), -17);
    await cat.add('starsword_charge_full', out, { lufs: -17, vol: 1.3, spatial: false, channels: 2, voices: 1, pitch: [1, 1], sources: [X.metalH(2)] });
    keep.chargeFull = out;
  }

  // starsword_slam: 重劈 — the sword strikes the street 2.2 m ahead: steel on concrete, a 40-80 Hz boom, the street
  // breaking (smash + rubble), a starlight stab in the impact and star dust thrown up
  // (transient-led; every low layer is enveloped short: a sustained sub eats the loudness budget and gets crushed)
  const slam = [];
  const smash = H.tight(await H.ld(X.concSmash, 0, 1.27, { hp: 55 }), 0.45);
  const blast = H.tight(await H.ld(X.blast, 0, 1.24, { hp: 70 }), 0.5);
  const deepB = H.tight(await H.ld(X.deepBoom, 0, 1.6, { hp: 35 }), 0.7);
  const clang = H.tight(await H.ld(X.clangDeep, 0, 1.0, { hp: 90, semis: -3 }), 0.6);
  for (let k = 0; k < 4; k++) {
    const r = H.rng(`slam${k}`), D = 2.0;
    const debris = await H.ld(X.debrisBig, 0.05 + k * 0.25, 2.2 + k * 0.25, { hp: 160 });
    const dwoom = lib.applyEnv(lib.eq(H.energy(0.6, [[0, 260], [0.5, 70]], { fm: -30 }), [{ type: 'hp', f: 90, order: 2 }, { type: 'lp', f: 1600, order: 2 }]), lib.expEnv(0.6, { attack: 0.002, t60: 0.4 }));
    const v = lib.mix([
      { buf: H.K.crack(`slc${k}`, { dur: 0.018, decay: 0.005, hp: 1200 }), gain: -1 },
      { buf: H.strike(await H.ld(X.metalH(k), 0, 0.4, { hp: 200, semis: r.range(-5, -3) })), gain: -3 },
      { buf: H.strike(lib.varispeedSemis(clang, r.range(-1, 1))), gain: -5 },
      { buf: H.strike(smash), gain: -2 },
      { buf: H.strike(blast), gain: -7 },
      { buf: lib.psychoBass(lib.thump({ f0: 135, f1: 56, sweep: 0.03, decay: 0.3, click: 0.3, drive: 3, seed: `slb${k}` }), { freq: 110, amount: -3 }), gain: -3 },
      { buf: H.strike(deepB), gain: -12 },
      { buf: H.strike(await H.ld(X.stoneDebris, 0, 0.39, { hp: 250, semis: r.range(-3, 0) })), at: 0.012, gain: -6 },
      { buf: H.strike(debris), at: 0.06, gain: -7 },
      { buf: H.norm(H.run([N.E5, N.B5, N.E6], 0.004, { seed: `slg${k}`, t60: 0.9, dur: 1.2, gains: [0, -2, -4] })), at: 0.004, gain: -10 },
      { buf: H.tinkles(1.1, 16, { lo: 2500, hi: 8000, t60: 0.14, seed: `slt${k}`, skew: 1.3 }), at: 0.05, gain: -12 },
      { buf: H.norm(dwoom), gain: -12 },
    ]);
    const e = lib.eq(v, [{ type: 'hp', f: 35, order: 2 }, { type: 'lowshelf', f: 90, gain: -2 }, { type: 'peak', f: 1400, gain: 2, q: 0.7 }]);
    slam.push(H.shape(H.cut(H.verb(e, 'urban', 0.2, 1.6, `slv${k}`, 1), D, 0.4), -14, { max: 6 }));
  }
  // (a transient-led blow: mastered a dB under the explosion target and lifted, so the limiter leaves the crack)
  await cat.add('starsword_slam', slam, { lufs: -14, vol: 1.12, maxLimitDb: 6, spatial: true, range: [8, 100], voices: 2, pitch: [0.97, 1.03], priority: 3, sources: [X.concSmash, X.blast, X.deepBoom, X.clangDeep, X.stoneDebris, X.debrisBig] });
  keep.slam = slam;

  // starsword_wave: 星痕 — the wave tears away along the street (24 m/s, 0.25-0.67 s): a tearing crackle and rubble
  // receding (the band falls, the highs die with distance), a ground rumble, a star shimmer riding on it, a small
  // burst where it ends
  const wave = [];
  const scrape = await H.ld(X.rubbleScrape, 0, 1.0, { hp: 60 });
  for (let k = 0; k < 3; k++) {
    const r = H.rng(`wave${k}`), D = 1.9, T = [0.42, 0.55, 0.66][k];
    const tear = lib.eq(lib.crackle(1.0, { density: 320, decay: 0.004, hp: 500, minAmp: 0.2, seed: `wvt${k}` }), [{ type: 'lp', f: 7000, order: 2 }]);
    const rumble = lib.eq(lib.noise(D, { color: 'brown', seed: `wvr${k}` }), [{ type: 'lp', f: 320, order: 2 }, { type: 'hp', f: 55, order: 2 }]);
    const rush = H.swoosh(1.0, 0.06, [3200, 2000, 280], { q: 0.9, seed: `wvs${k}`, rise: 1.5, fall: 3.5 });
    const z = H.zing(1.0, 0.05, N.E4, { up: 2, down: -12, band: [1800, 3500], fall: 3, fm: -10 });
    const fade = (t) => (t < 0.02 ? t / 0.02 : 1) / (1 + Math.max(0, t) * 3.5) * (t < T ? 1 : Math.exp(-(t - T) * 9));
    const travel = lib.mix([
      { buf: H.env(H.norm(tear), fade) },
      { buf: H.env(H.strike(lib.varispeedSemis(lib.eq(scrape, [{ type: 'hp', f: 160, order: 2 }]), r.range(-2, 1))), fade), gain: -4 },
      { buf: H.norm(rush), gain: -5 },
      { buf: H.env(H.tinkles(1.0, 16, { lo: 2600, hi: 8500, t60: 0.1, seed: `wvk${k}`, skew: 1.0 }), fade), gain: -12 },
      { buf: H.norm(z), gain: -12 },
    ], { length: D });
    // distance: the band closes as the front runs away
    const far = lib.sweep(travel, 'lp', (t) => 900 + 11000 / (1 + t * 6), { q: 0.7 });
    const v = lib.mix([
      { buf: far },
      { buf: H.env(H.norm(rumble), (t) => Math.min(1, t / 0.03) * Math.exp(-t * 3)), gain: -15 },
      { buf: H.boom(`wvb${k}`, { f0: 90, f1: 48, decay: 0.45, drive: 2 }), gain: -14 },
      { buf: H.strike(await H.ld(X.debris, 0.05 + k * 0.4, 1.6 + k * 0.4, { hp: 180, lp: 5000 })), at: 0.12, gain: -8 },
      // the end burst (the front climbs a kerb or hits a wall)
      { buf: lib.eq(lib.mix([{ buf: H.K.crack(`wve${k}`, { hp: 900 }) }, { buf: lib.thump({ f0: 120, f1: 55, decay: 0.22, click: 0.2, drive: 2, seed: `wvd${k}` }), gain: -2 }, { buf: H.norm(H.glass(N.E6, 0.6, { seed: `wvg${k}`, t60: 0.45 })), gain: -10 }]), [{ type: 'lp', f: 3500, order: 2 }]), at: T, gain: -12 },
    ]);
    wave.push(H.shape(H.cut(H.verb(v, 'urban', 0.22, 1.4, `wvv${k}`, 1), D, 0.4), -15));
  }
  await cat.add('starsword_wave', wave, { lufs: -15, spatial: true, range: [8, 90], voices: 2, pitch: [0.96, 1.04], priority: 2, sources: [X.rubbleScrape, X.debris] });

  // starsword_crack: 地面崩裂 — the street splits behind the wave: sharp stone fractures (ice cracks taken down an octave
  // and more), crumbling, falling chunks, the starlight hissing out of the fissures
  const crack = [];
  const ice = await H.ld(X.iceCrack, 0.45, 3.45, { hp: 200 });
  for (let k = 0; k < 3; k++) {
    const r = H.rng(`crk${k}`), D = 1.9;
    const cracks = lib.eq(lib.varispeedSemis(lib.slice(ice, k * 0.7, k * 0.7 + 1.6), -10 + r.range(-1, 1)), [{ type: 'lp', f: 6500, order: 2 }, { type: 'peak', f: 900, gain: 3, q: 0.9 }]);
    const glow = lib.automate(lib.eq(lib.noise(D, { seed: `crg${k}` }), [{ type: 'bp', f: 6500, q: 1.2 }]), (t) => H.smooth((t - 0.1) / 0.4) * Math.exp(-Math.max(0, t - 0.5) * 2.2));
    const v = lib.mix([
      { buf: H.strike(await H.ld(X.concHit, 0, 0.47, { hp: 60, semis: -4 })), gain: -2 },
      { buf: H.norm(cracks), at: 0.01, gain: -1 },
      { buf: H.strike(await H.ld(X.rockFall, 0, 0.72, { hp: 60 })), at: 0.22 + r.range(0, 0.1), gain: -5 },
      { buf: H.strike(await H.ld(X.dirt, 0, 1.6, { hp: 30 })), at: 0.05, gain: -6 },
      { buf: H.strike(await H.ld(X.stoneDebris, 0, 0.39, { hp: 300, semis: -2 })), at: 0.5 + r.range(0, 0.15), gain: -9 },
      { buf: H.norm(glow), gain: -22 },
      { buf: H.tinkles(1.4, 8, { lo: 3000, hi: 7500, t60: 0.14, seed: `crt${k}`, skew: 0.9, fall: 4 }), at: 0.2, gain: -19 },
    ]);
    crack.push(H.shape(H.cut(H.verb(v, 'urban', 0.14, 1.2, `crv${k}`, 1), D, 0.4), -16));
  }
  await cat.add('starsword_crack', crack, { lufs: -16, spatial: true, range: [6, 70], voices: 2, pitch: [0.95, 1.05], sources: [X.iceCrack, X.concHit, X.rockFall, X.dirt, X.stoneDebris] });
}

// ---------------------------------------------------------------------------------------------- 鎮河 guard
async function guard(lib, ctx, cat, H, keep) {
  // starsword_guard_up: 舉劍「鏘」 — the blade swung across the chest: a short lift whoosh and cloth, a steel 「鏘」 with
  // its ring, the starlight veil forming on the flat (a soft energy swell)
  const up = [];
  const scrapeSrc = await H.ld(X.gongScrape, 0.07, 0.42, { stereo: false, hp: 2200 });
  for (let k = 0; k < 2; k++) {
    const D = 0.95;
    const veil = lib.automate(lib.eq(H.energy(D, N.E3 * (k ? 1.003 : 1), { fm: -20 }), [{ type: 'lp', f: 1500, order: 2 }]), (t) => H.smooth((t - 0.06) / 0.3) * Math.exp(-Math.max(0, t - 0.4) * 3));
    const v = lib.mix([
      { buf: H.norm(H.swoosh(0.35, 0.12, [220, 700, 300], { seed: `gw${k}`, q: 1.2 })), gain: -7 },
      { buf: await H.ld(X.cloth, 0, 0.34, { hp: 150 }), gain: -12 },
      { buf: H.strike(await H.ld(X.metalL(k + 2), 0, 0.3, { hp: 400, semis: -2 })), at: 0.1, gain: -2 },
      { buf: H.norm(lib.varispeedSemis(scrapeSrc, 2 + k)), at: 0.085, gain: -14 },
      { buf: H.norm(H.bladeRing(k ? N.B5 : N.Gs5, 0.85, { t60: 0.6, seed: `gr${k}` })), at: 0.1, gain: -6 },
      { buf: H.norm(veil), gain: -12 },
      { buf: H.norm(H.glass(N.E6, 0.8, { seed: `gg${k}`, t60: 0.6, tick: -30 })), at: 0.14, gain: -19 },
    ]);
    up.push(H.cut(H.verb(lib.stereoize(v, { width: 0.3, hp: 600, seed: `gs${k}` }), 'smallRoom', 0.15, 0.7, `gv${k}`), D, 0.4));
  }
  await cat.add('starsword_guard_up', up, { lufs: -18, vol: 1.3, spatial: false, channels: 2, voices: 1, pitch: [0.98, 1.02], sources: [X.cloth, X.metalL(2), X.gongScrape] });

  // starsword_block: a blow taken on the flat — clang, a dull thud through the arms, the veil absorbing it (a low
  // "thoom" and a zap), sparks, a short ring
  const block = [];
  const deep = await H.ld(X.clangDeep, 0, 0.5, { hp: 80, semis: -4 });
  const metal = await H.ld(X.metalHit, 0, 0.25, { hp: 150 });
  for (let k = 0; k < 5; k++) {
    const r = H.rng(`blk${k}`);
    const zap = lib.applyEnv(lib.fm(0.15, { carrier: [[0, 900], [0.15, 380]], ratio: 1.5, index: 4, indexDecay: 0.04 }), lib.expEnv(0.15, { t60: 0.1 }));
    const sparks = lib.automate(lib.crackle(0.25, { density: 150, decay: 0.002, hp: 3200, seed: `bks${k}` }), (t) => Math.exp(-t * 14));
    const v = lib.mix([
      { buf: H.strike(await H.ld(X.metalH(k + 1), 0, 0.4, { hp: 150, semis: r.range(-4, -2) })) },
      { buf: H.strike(k % 2 ? metal : deep), gain: -4 },
      { buf: lib.thump({ f0: 140, f1: 70, sweep: 0.02, decay: 0.12, click: 0.2, drive: 2, seed: `bkt${k}` }), gain: -8 },
      { buf: lib.noiseBurst({ dur: 0.18, decay: 0.07, lp: 900, seed: `bkn${k}` }), gain: -9 },
      { buf: H.norm(zap), gain: -14 },
      { buf: H.norm(sparks), at: 0.003, gain: -15 },
      { buf: H.norm(H.bladeRing(N.E5 * r.range(0.99, 1.01), 0.6, { t60: 0.35, seed: `bkr${k}` })), gain: -13 },
    ]);
    block.push(H.shape(H.cut(H.verb(lib.stereoize(v, { width: 0.25, hp: 600, seed: `bkw${k}` }), 'smallRoom', 0.12, 0.6, `bkv${k}`), 0.65, 0.45), -16));
  }
  await cat.add('starsword_block', block, { lufs: -16, vol: 1.2, spatial: false, channels: 2, voices: 3, pitch: [0.95, 1.05], sources: [X.metalH(1), X.metalHit, X.clangDeep] });

  // starsword_parry: 清亮「叮」＋鐘 — a perfect guard: a clear, bright steel-and-glass 「叮」 on E7, a bell (E5 with E4
  // under it) a moment later, the hit itself, a burst of star dust and the air rushing back in
  const parry = [];
  const bellHi = await H.tubular(N.E5, 2.2, { t60: 2.0 });
  const bellLo = await H.tubular(N.E4, 2.2, { t60: 2.2 });
  for (let k = 0; k < 2; k++) {
    const D = 2.1;
    const v = lib.mix([
      { buf: H.norm(H.glass(N.E7, D, { seed: `pd${k}`, t60: 1.4, bright: 1.3, tick: -8 })) },
      { buf: H.norm(H.bladeRing(N.E6 * (k ? 1.004 : 1), D, { t60: 1.2, bright: 0.9, seed: `pr${k}` })), gain: -5 },
      { buf: H.norm(bellHi), at: 0.025, gain: 0 },
      { buf: H.norm(bellLo), at: 0.03, gain: -5 },
      { buf: H.strike(await H.ld(X.metalH(k + 3), 0, 0.4, { hp: 200, semis: -1 })), gain: -6 },
      { buf: lib.thump({ f0: 110, f1: 52, sweep: 0.025, decay: 0.22, click: 0.2, drive: 2, seed: `pt${k}` }), gain: -8 },
      { buf: H.tinkles(1.0, 14, { lo: 3000, hi: 9500, t60: 0.1, seed: `pk${k}`, skew: 1.2 }), at: 0.02, gain: -10 },
      { buf: H.norm(H.swoosh(0.4, 0.05, [5000, 3500, 500], { q: 0.9, seed: `ps${k}`, fall: 3 })), at: 0.05, gain: -16 },
    ], { channels: 2 });
    parry.push(H.shape(H.cut(H.verb(lib.stereoize(v, { width: 0.4, hp: 700, seed: `pw${k}` }), 'warehouse', 0.24, 2.0, `pv${k}`), D, 0.4), -16, { max: 4 }));
  }
  await cat.add('starsword_parry', parry, { lufs: -16, vol: 1.4, spatial: false, channels: 2, voices: 1, pitch: [0.99, 1.01], sources: [X.tbC5, X.tbC4, X.metalH(3)] });
}

// ---------------------------------------------------------------------------------------------- 橫天 skyspan
async function skyspan(lib, ctx, cat, H, keep) {
  // starsword_skyspan_charge: 能量充填的上升音 (0 -> 0.25 s, the blade projects out to 9 m): a rising buzz, a rising
  // rush, crackle building, four glass notes climbing out along the blade
  const ch = [];
  for (let k = 0; k < 2; k++) {
    const D = 0.55;
    const rise = lib.automate(lib.sweep(H.energy(D, [[0, N.E2], [0.25, N.B3], [D, N.E4 * 0.97]]), 'lp', (t) => 300 + 5200 * Math.min(1, t / 0.25), { q: 1.5 }),
      (t) => (t < 0.24 ? (t / 0.24) ** 1.6 : Math.exp(-(t - 0.24) * 9)));
    const crackle = lib.automate(lib.crackle(D, { density: 160, decay: 0.002, hp: 3000, seed: `skc${k}` }), (t) => Math.min(1, t / 0.25) ** 2 * (t < 0.27 ? 1 : Math.exp(-(t - 0.27) * 14)));
    const v = lib.mix([
      { buf: H.norm(rise) },
      { buf: H.norm(H.swoosh(D, 0.24, [400, 4200, 3000], { q: 1.2, seed: `skw${k}`, rise: 2.5, fall: 8 })), gain: -7 },
      { buf: H.norm(crackle), gain: -16 },
      { buf: H.run([N.E5, N.B5, N.E6, N.B6], 0.055, { seed: `skg${k}`, t60: 0.5, dur: 0.8, gains: [-6, -5, -4, -3], tick: -24 }), at: 0.04, gain: -16 },
    ], { channels: 2 });
    ch.push(H.cut(lib.stereoize(v, { width: 0.35, hp: 600, seed: `sks${k}` }), D + 0.1, 0.25));
  }
  await cat.add('starsword_skyspan_charge', ch, { lufs: -16, vol: 1.2, spatial: false, channels: 2, voices: 1, pitch: [0.99, 1.01], maxHeadMs: 60 });

  // starsword_skyspan: 巨大風切＋共鳴 — the 9 m blade sweeps 220° right -> left (0 -> 0.3 s here): a huge low roar of air,
  // the sword mass far below a normal swing, the cutting air, the giant energy edge passing; then the 共鳴: the blade
  // and the energy ringing low (E2 / E3, beating) as it dissolves. Stereo (2D for the caster, a teammate hears it
  // positioned)
  const sk = [];
  const whoom = await H.ld(X.whoom, 0, 0.557, { hp: 40 });
  for (let k = 0; k < 2; k++) {
    const r = H.rng(`sk${k}`), D = 1.5, P = 0.16;
    const air = await H.ld(X.katana, ...KATANA[k * 2], { hp: 380 });
    const roar = H.swoosh(0.8, P, [90, 330, 110], { q: 0.8, seed: `skr${k}`, rise: 1.5, fall: 4 });
    const z = H.zing(0.9, P, N.E2 * r.range(0.99, 1.01), { up: 5, down: -7, band: [500, 3200], q: 0.9, fall: 4, fm: -12 });
    const z2 = H.zing(0.9, P + 0.01, N.E3 * r.range(0.99, 1.01), { up: 5, down: -9, band: [1200, 4200], q: 1.1, fall: 5 });   // the blade's far end, an octave up
    const sizzle = H.swoosh(0.7, P + 0.015, [6000, 9500, 6500], { q: 2, color: 'white', seed: `skz${k}`, rise: 3, fall: 10 });
    const hiss = H.swoosh(0.7, P + 0.01, [1500, 6000, 2400], { q: 1.2, color: 'white', seed: `skh${k}`, rise: 2.5, fall: 7 });
    const moving = H.panMove(lib.mix([
      H.alignAt(H.norm(lib.varispeedSemis(whoom, -6)), P, -5), { buf: H.norm(roar), gain: -7 }, H.alignAt(air, P + 0.01, -2),
      { buf: H.norm(z), gain: 0 }, { buf: H.norm(z2), gain: -6 }, { buf: H.norm(hiss), gain: -6 }, { buf: H.norm(sizzle), gain: -14 },
    ], { length: 0.95 }), (t) => 0.92 - 1.84 * H.smooth(t / 0.32));
    const resHum = lib.automate(lib.eq(H.energy(1.3, (t) => N.E2 * (1 + 0.005 * Math.sin(2 * Math.PI * 4.5 * t)), { fm: -26 }), [{ type: 'lp', f: 1100, order: 2 }]), (t) => Math.min(1, t / 0.05) * Math.exp(-t * 2.8));
    const res = lib.stereoize(lib.mix([
      { buf: H.norm(H.bladeRing(N.E3, 1.3, { t60: 1.1, bright: 0.9, seed: `skb${k}`, beat: 0.006 })) },
      { buf: H.norm(resHum), gain: -3 },
      { buf: H.norm(H.bladeRing(N.B4, 1.0, { t60: 0.6, bright: 0.5, seed: `skc${k}` })), gain: -10 },
    ]), { width: 0.4, hp: 400, seed: `skst${k}` });
    const dust = lib.stereoize(H.swoosh(0.8, 0.3, [600, 1300, 400], { q: 0.7, color: 'white', seed: `skd${k}`, fall: 4 }), { width: 0.6, hp: 400, seed: `skdw${k}` });
    const v = lib.mix([{ buf: moving }, { buf: res, at: 0.24, gain: -8 }, { buf: H.norm(dust), gain: -17 },
      { buf: H.boom(`skbm${k}`, { f0: 90, f1: 48, decay: 0.35, drive: 2 }), at: P - 0.02, gain: -14 }], { channels: 2, length: D });
    sk.push(H.shape(H.cut(H.verb(lib.eq(v, [{ type: 'hp', f: 50, order: 2 }, { type: 'lowshelf', f: 120, gain: -2 }, { type: 'peak', f: 2200, gain: 2, q: 0.8 }]), 'urban', 0.18, 1.6, `skv${k}`), D, 0.4), -13.5));
  }
  await cat.add('starsword_skyspan', sk, { lufs: -13.5, vol: 1.1, spatial: true, channels: 2, range: [8, 90], voices: 2, pitch: [0.98, 1.02], priority: 2, sources: [X.whoom, X.katana] });

  // starsword_skyspan_end: 消散的玻璃細響 — the giant blade crumbles into star dust: a fine fall of glass pings, a slow
  // falling arpeggio, an airy exhale
  const end = [];
  for (let k = 0; k < 2; k++) {
    const D = 1.4;
    const ex = lib.automate(lib.sweep(lib.noise(D, { color: 'pink', seed: `sex${k}` }), 'bp', (t) => 6000 * Math.pow(0.25, t / D), { q: 1.1 }), (t) => Math.min(1, t / 0.05) * Math.exp(-t * 2.4));
    const v = lib.mix([
      { buf: H.tinkles(1.1, 28, { lo: 3000, hi: 10000, t60: 0.11, seed: `set${k}`, skew: 1.15, fall: 14 }) },
      { buf: H.run([N.Cs7, N.B6, N.Gs6, N.Fs6, N.E6], 0.075, { seed: `ser${k}`, t60: 0.6, dur: 1.0, gains: [0, -1, -2, -3, -4], tick: -26 }), at: 0.04, gain: -4 },
      { buf: H.norm(ex), gain: -10 },
      { buf: H.strike(await H.ld(X.glassL(k + 1), 0, 0.21, { hp: 1500, semis: 5 })), at: 0.02, gain: -10 },
    ]);
    end.push(H.cut(H.verb(lib.stereoize(v, { width: 0.5, hp: 1200, seed: `ses${k}` }), 'warehouse', 0.28, 1.4, `sev${k}`), D + 0.2, 0.45));
  }
  await cat.add('starsword_skyspan_end', end, { lufs: -20, vol: 1.2, spatial: false, channels: 2, voices: 1, pitch: [0.98, 1.02], sources: [X.glassL(1)] });
}

// ---------------------------------------------------------------------------------------------- 天劍 ultimate
// Timeline (premium/starsword.js starsword_heaven): 0 rise (the sword raised, the beam at 0.22) | 0.2 sigil | 0.3
// pillar + the 14 m sword falls from 40 m (accelerating) | 0.9 impact (hit-stop 0.12) | 1.6 / 2.35 / 3.1 pulses |
// 3.25 it shatters | 3.95 end. The bed (2D, the caster only) starts at 0.3 and is scored to that grid.
async function ult(lib, ctx, cat, H, keep) {
  // ① rise (§1.12 layer 1, 0.4 s): an inhaled swell — a reversed cymbal sucked in, a rising driven tone under a
  // closing / opening filter — into a bell on the beam (0.22 s) with the beam zapping up
  {
    const D = 1.8, B = 0.22;
    const cym = lib.reverse(await H.ld(X.crash, 0.04, 0.04 + B, { stereo: true, hp: 300, fadeIn: 0.001, fadeOut: 0.03 }));
    const riseT = lib.applyEnv(lib.saturate(lib.mix([{ buf: lib.tone(B, { type: 'saw', freq: [[0, N.E2], [B, N.E3]] }) }, { buf: lib.tone(B, { freq: [[0, N.E3], [B, N.E4]] }), gain: -3 }]), { drive: 6, type: 'tube' }), lib.envCurve(B, [[0, 0], [B * 0.7, 0.6], [B - 0.004, 1], [B, 0]]));
    const breath = lib.applyEnv(lib.sweep(lib.noise(B, { color: 'pink', seed: 'urb' }), 'bp', (t) => 500 * Math.pow(8, t / B), { q: 1.6 }), lib.envCurve(B, [[0, 0], [B - 0.01, 1], [B, 0]]));
    const zap = lib.applyEnv(lib.fm(0.6, { carrier: [[0, 600], [0.4, 3400], [0.6, 3600]], ratio: 2, index: 3, indexDecay: 0.3 }), lib.expEnv(0.6, { attack: 0.005, t60: 0.5 }));
    const v = lib.mix([
      { buf: cym, gain: -4 },
      { buf: H.norm(lib.sweep(riseT, 'lp', (t) => 400 * Math.pow(10, t / B), { q: 1.2 })), gain: -6 },
      { buf: H.norm(breath), gain: -8 },
      { buf: H.norm(await H.tubular(N.E5, 1.6, { t60: 1.8 })), at: B, gain: -1 },
      { buf: H.norm(H.glass(N.B6, 1.4, { seed: 'urg', t60: 1.2 })), at: B + 0.005, gain: -9 },
      { buf: H.norm(zap), at: B, gain: -11 },
      { buf: H.norm(H.swoosh(0.6, 0.15, [800, 6000, 7000], { q: 1.2, color: 'white', seed: 'urs', fall: 5 })), at: B, gain: -10 },
      { buf: H.boom('urbm', { f0: 72, f1: 44, decay: 0.5, drive: 2 }), at: B, gain: -10 },
    ], { channels: 2 });
    const out = H.shape(H.cut(H.verb(lib.stereoize(v, { width: 0.35, hp: 500, seed: 'urst' }), 'warehouse', 0.24, 1.6, 'urv'), D, 0.4), -15);
    await cat.add('starsword_ult_rise', out, { lufs: -15, vol: 1.1, spatial: true, channels: 2, range: [10, 120], voices: 2, pitch: [1, 1], maxHeadMs: 250, sources: [X.crash, X.tbC5] });
    keep.rise = out;
  }

  // ② the sigil (0.2): 星鈴一串 — the star map draws itself: a fast cascade of glass bells round the 二十八宿 ring and the
  // Dipper, the seal pressing into the street (a soft deep thump and a gong wash), a glass chord hanging over it
  const sigil = [];
  const gongWash = await H.ld(X.gongHard, 0.09, 2.6, { hp: 90, lp: 1600, fadeOut: 0.6 });
  for (let k = 0; k < 2; k++) {
    const r = H.rng(`sg${k}`), D = 2.0;
    const ring = [N.E7, N.Cs7, N.B6, N.Gs6, N.Fs6, N.E6, N.Cs6, N.B5, N.Cs6, N.E6, N.Fs6, N.Gs6, N.B6, N.E7];
    const pad = lib.automate(lib.mix([{ buf: lib.tone(D, { freq: N.E5 }) }, { buf: lib.tone(D, { freq: N.B5 }), gain: -3 }, { buf: lib.tone(D, { freq: N.Fs6 }), gain: -8 }]), (t) => H.smooth(t / 0.6) * Math.exp(-Math.max(0, t - 0.8) * 2.5) * (0.85 + 0.15 * Math.sin(2 * Math.PI * 5 * t)));
    const v = lib.mix([
      { buf: H.run(ring, 0.04, { seed: `sgr${k}`, t60: 0.7, dur: 1.0, gains: ring.map((_, i) => -i * 0.25 - (i % 2) * 1.5), jitter: 0.006, tick: -20 }) },
      { buf: lib.thump({ f0: 68, f1: 42, sweep: 0.05, decay: 0.6, click: 0, drive: 1.5, seed: `sgt${k}` }), gain: -6 },
      { buf: H.norm(lib.varispeedSemis(gongWash, -2 + r.range(-0.3, 0.3))), gain: -14 },
      { buf: H.norm(pad), at: 0.1, gain: -14 },
    ]);
    sigil.push(H.cut(H.verb(v, 'warehouse', 0.26, 1.8, `sgv${k}`, 1), D, 0.4));
  }
  await cat.add('starsword_ult_sigil', sigil, { lufs: -18, vol: 1.4, spatial: true, range: [12, 140], voices: 2, pitch: [0.99, 1.01], sources: [X.gongHard] });

  // ③ the fall (0.3 -> 0.9): 下墜的長嘯 — the spirit sword screams down: a falling whistle with the air pressure
  // roaring up under it and the sword's energy hum rising; it ends hard where the impact takes over
  const fall = [];
  for (let k = 0; k < 2; k++) {
    const r = H.rng(`fl${k}`), D = 0.64;
    const f = (t) => (2500 + r.range(-100, 100)) * Math.pow(0.36, t / D) * (1 + 0.006 * Math.sin(2 * Math.PI * 7 * t));
    const whistle = lib.mix([{ buf: lib.tone(D, { freq: f }) }, { buf: lib.sweep(lib.noise(D, { seed: `flw${k}` }), 'bp', f, { q: 6 }), gain: -6 }, { buf: lib.tone(D, { freq: (t) => f(t) * 2.01 }), gain: -18 }]);
    const roar = lib.sweep(lib.noise(D, { color: 'pink', seed: `flr${k}` }), 'lp', (t) => 300 + 3200 * (t / D) ** 1.5, { q: 0.8 });
    const hum = lib.eq(H.energy(D, [[0, N.E1], [D, N.E2]], { fm: -24 }), [{ type: 'lp', f: 1400, order: 2 }]);
    const cresc = (t) => (t / D) ** 1.7 * (t > D - 0.025 ? Math.max(0, (D - t) / 0.025) : 1);
    const v = lib.automate(lib.mix([{ buf: H.norm(whistle), gain: -3 }, { buf: H.norm(roar), gain: -2 }, { buf: H.norm(hum), gain: -7 },
      { buf: H.tinkles(D, 12, { lo: 3500, hi: 9000, t60: 0.08, seed: `flt${k}`, skew: 0.8, fall: 0 }), gain: -17 }]), cresc);
    fall.push(lib.fadeIn(v, 0.01));
  }
  await cat.add('starsword_ult_fall', fall, { lufs: -15, vol: 1.2, spatial: true, range: [12, 140], voices: 2, pitch: [0.99, 1.01], maxHeadMs: 400 });

  // ④ the impact (0.9, §1.12 layer 2): the 40-60 Hz blow — a long boom, a deep explosion and a blast, concrete, a
  // giant steel TANG (the sword plants; its ring beats on E2), the glazed blade ringing (E4 / B4 / E5), debris rain,
  // star dust thrown up
  const impact = [];
  {
    const deepB = await H.ld(X.deepBoom, 0, 2.6, { hp: 25 });
    const blast = await H.ld(X.blast, 0, 1.24, { hp: 30 });
    const smash = await H.ld(X.concSmash, 0, 1.27, { hp: 30 });
    const clang = await H.ld(X.clangDeep, 0, 1.12, { hp: 40, semis: -5 });
    for (let k = 0; k < 2; k++) {
      const D = 3.4;
      const debris = await H.ld(X.debrisBig, 0.05 + k * 0.4, 3.3, { hp: 60 });
      const crash = await H.ld(X.longCrash, 0.3 + k * 1.5, 3.4 + k * 1.5, { hp: 60 });
      const v = lib.mix([
        { buf: H.boom(`uib${k}`, { f0: 64, f1: 40, sweep: 0.08, decay: 1.1, drive: 3, amount: -3 }) },
        { buf: H.strike(deepB), gain: -3 },
        { buf: H.strike(blast), gain: -5 },
        { buf: H.strike(smash), gain: -4 },
        { buf: H.K.crack(`uic${k}`, { dur: 0.02, decay: 0.005, hp: 1200 }), gain: -4 },
        { buf: H.strike(clang), gain: -6 },
        { buf: H.norm(H.bladeRing(N.E2 * (k ? 1.004 : 1), D, { t60: 2.4, bright: 1.2, seed: `uir${k}`, beat: 0.006 })), gain: -9 },
        { buf: H.norm(H.run([N.E4, N.B4, N.E5], 0.006, { seed: `uig${k}`, t60: 2.2, dur: D, gains: [0, -2, -4], tick: -30 })), at: 0.01, gain: -13 },
        { buf: H.strike(debris), at: 0.1, gain: -6 },
        { buf: H.strike(crash), at: 0.25, gain: -10 },
        { buf: H.tinkles(1.8, 28, { lo: 2500, hi: 8500, t60: 0.15, seed: `uit${k}`, skew: 1.3 }), at: 0.05, gain: -13 },
      ]);
      impact.push(H.shape(H.cut(H.verb(v, 'urban', 0.22, 2.4, `uiv${k}`, 1), D, 0.4), -12.5, { max: 7 }));
    }
    await cat.add('starsword_ult_impact', impact, { lufs: -12.5, maxLimitDb: 6, spatial: true, range: [15, 160], voices: 2, pitch: [0.99, 1.01], priority: 3, sources: [X.deepBoom, X.blast, X.concSmash, X.clangDeep, X.debrisBig, X.longCrash] });
    keep.impact = impact[0];
  }

  // ④ pulses (1.6 / 2.35 / 3.1): 每次脈動一聲大鐘 — a gong taken down to E-ish with a tubular bell on E4 inside it, a
  // pulse thump, the air pulled in towards the sword, the seven stars climbing the blade (seven glass pings rising)
  const pulse = [];
  {
    const gong = await H.ld(X.gong, 0.12, 3.0, { hp: 50, fadeOut: 0.4 });
    for (let k = 0; k < 3; k++) {
      const D = 1.9;
      const v = lib.mix([
        { buf: lib.decay(H.strike(lib.varispeedSemis(gong, -3 - k * 0.5)), 1.5, 0.05), gain: -3 },
        { buf: H.norm(await H.tubular(N.E4, 1.9, { t60: 1.8 })), gain: -2 },
        { buf: H.boom(`upb${k}`, { f0: 84, f1: 46, decay: 0.38, drive: 2 }), gain: -5 },
        { buf: H.norm(H.swoosh(0.55, 0.05, [5000, 2800, 350], { q: 0.9, seed: `upw${k}`, fall: 3 })), gain: -13 },
        { buf: H.run(DIPPER, 0.05, { seed: `ups${k}`, t60: 0.35, dur: 0.6, gains: DIPPER.map((_, i) => -i * 0.3), tick: -24 }), at: 0.02, gain: -14 },
      ]);
      pulse.push(H.shape(H.cut(H.verb(v, 'urban', 0.2, 1.6, `upv${k}`, 1), D, 0.4), -16, { max: 4 }));
    }
    await cat.add('starsword_ult_pulse', pulse, { lufs: -16, vol: 1.3, spatial: true, range: [12, 140], voices: 3, pitch: [0.99, 1.01], priority: 2, sources: [X.gong, X.tbC4] });
  }

  // ⑤ shatter (3.25) + release (§1.12 收尾的洩氣聲): the glazed sword bursts — glass and porcelain breaking (taken down
  // for size), a long rain of glass, then the deflating sigh (a falling hiss, a low exhale, a tone falling E3 -> E2)
  // and one last bell
  const shatter = [];
  {
    const gb2 = await H.ld(X.glassBreak2, 0.003, 0.74, { hp: 200 });
    const gsm = await H.ld(X.glassSmash, 0.18, 1.6, { hp: 200 });
    const plate = await H.ld(X.plate, 0.02, 1.08, { hp: 200 });
    const bottle = await H.ld(X.bottle, 0, 1.5, { hp: 200 });
    for (let k = 0; k < 2; k++) {
      const r = H.rng(`sh${k}`), D = 3.0;
      const hits = [];
      for (let i = 0; i < 9; i++) hits.push({ buf: H.strike(await H.ld(X.glassL(i + k), 0, 0.21, { hp: 1200, semis: r.range(-4, 3) })), at: 0.15 + Math.pow(r.next(), 1.4) * 1.8, gain: -12 - r.range(0, 8) });
      const hiss = lib.automate(lib.sweep(lib.noise(2.2, { seed: `shh${k}` }), 'bp', (t) => 4200 * Math.pow(0.08, t / 2.2), { q: 1.0 }), (t) => Math.min(1, t / 0.12) * Math.exp(-t * 1.5));
      const exhale = lib.automate(lib.eq(lib.noise(2.0, { color: 'pink', seed: `she${k}` }), [{ type: 'lp', f: 500, order: 2 }, { type: 'hp', f: 50, order: 2 }]), (t) => Math.min(1, t / 0.2) * Math.exp(-t * 1.6));
      const fallT = lib.applyEnv(lib.tone(2.0, { type: 'triangle', freq: [[0, N.E3], [2.0, N.E2]] }), lib.expEnv(2.0, { attack: 0.03, t60: 1.6 }));
      const v = lib.mix([
        { buf: H.strike(lib.varispeedSemis(gb2, -3)) },
        { buf: H.strike(lib.varispeedSemis(gsm, -2)), at: 0.01, gain: -3 },
        { buf: H.strike(plate), at: 0.02, gain: -5 },
        { buf: H.strike(lib.varispeedSemis(bottle, -4)), at: 0.04, gain: -7 },
        { buf: lib.thump({ f0: 75, f1: 40, sweep: 0.05, decay: 0.5, click: 0, drive: 2, seed: `sht${k}` }), gain: -8 },
        { buf: H.tinkles(2.4, 44, { lo: 2400, hi: 9000, t60: 0.16, seed: `shk${k}`, skew: 1.05, fall: 12 }), at: 0.08, gain: -7 },
        ...hits,
        { buf: H.norm(hiss), at: 0.45, gain: -12 },
        { buf: H.norm(exhale), at: 0.5, gain: -11 },
        { buf: H.norm(fallT), at: 0.55, gain: -17 },
        { buf: H.norm(H.glass(N.E6, 1.2, { seed: `shg${k}`, t60: 1.0 })), at: 1.55, gain: -15 },
      ]);
      shatter.push(H.shape(H.cut(H.verb(v, 'urban', 0.2, 1.8, `shv${k}`, 1), D, 0.35), -15));
    }
    await cat.add('starsword_ult_shatter', shatter, { lufs: -15, vol: 1.2, spatial: true, range: [12, 140], voices: 2, pitch: [0.99, 1.01], sources: [X.glassBreak2, X.glassSmash, X.plate, X.bottle, X.glassL(0)] });
    keep.shatter = shatter[0];
  }

  // ③ the bed (§1.12 layer 3; 2D for the caster, starts at 0.3 = the fall): a timpani roll rising into the impact
  // (0.6), timpani + crash + the choir and cellos opening on E on the impact, a tubular bell on each pulse climbing the
  // chord (E5 / G#5 / B5 at 1.3 / 2.05 / 2.8), a glass shimmer over it, the chord blooming on the shatter (2.95)
  let bed;
  {
    const D = 4.6, parts = [];
    const roll = await H.ld(X.timpRoll, 1.0, 2.2, { stereo: true, hp: 35, semis: -6 });
    parts.push({ buf: H.env(roll, [[0, -30], [0.45, -6], [0.6, 0], [0.62, -60]]), gain: -6 });
    const timp = H.strike(await H.ld(X.timp, 0, 2.6, { stereo: true, hp: 30, semis: -6 }));
    parts.push({ buf: timp, at: 0.6, gain: -1 }, { buf: H.strike(await H.ld(X.crash, 0.04, 2.3, { stereo: true, hp: 200 })), at: 0.6, gain: -9 });
    for (const at of [1.3, 2.05, 2.8]) parts.push({ buf: lib.decay(timp, 1.0), at, gain: -10 });
    const choir = lib.mix([{ buf: await H.ld(X.choirA, 0.4, 5.2, { stereo: true, hp: 160, semis: -1, lp: 5000 }) }, { buf: await H.ld(X.choirO, 0.4, 5.2, { stereo: true, hp: 180, semis: -1, lp: 4500 }), at: 0.03, gain: -3 }], { channels: 2 });
    parts.push({ buf: H.env(choir, [[0, -40], [0.12, -8], [0.5, 0], [2.3, -2], [2.45, 1.5], [3.2, -2], [3.8, -40]]), at: 0.55, gain: -5 });
    const cello = lib.mix([{ buf: await H.ld(X.celloE2, 0.3, 4.6, { stereo: true, hp: 40 }) }, { buf: await H.ld(X.celloB2, 0.3, 4.6, { stereo: true, hp: 50 }), gain: -5 }], { channels: 2 });
    parts.push({ buf: H.env(cello, [[0, -30], [0.1, -4], [0.4, 0], [3.0, -1], [3.8, -40]]), at: 0.6, gain: -8 });
    for (const [i, hz] of [N.E5, N.Gs5, N.B5].entries()) parts.push({ buf: H.norm(await H.tubular(hz, 1.6, { t60: 1.6 })), at: 1.3 + i * 0.75, gain: -10 });
    const shimmer = lib.automate(lib.mix([{ buf: lib.tone(D, { freq: N.E6 }), pan: -0.5 }, { buf: lib.tone(D, { freq: N.B6 }), gain: -3, pan: 0.5 }, { buf: lib.tone(D, { freq: N.Fs7 }), gain: -8 }], { channels: 2 }),
      (t) => H.smooth((t - 0.7) / 0.8) * (t < 3.0 ? 1 : Math.exp(-(t - 3.0) * 2.5)) * (0.7 + 0.3 * Math.sin(2 * Math.PI * 5 * t)));
    parts.push({ buf: H.norm(shimmer), gain: -22 });
    parts.push({ buf: H.norm(await H.ld(X.gongHard, 0.09, 2.0, { stereo: true, hp: 80, lp: 2500, fadeOut: 0.5 })), at: 2.95, gain: -14 });
    parts.push({ buf: H.norm(H.run([N.E5, N.B5, N.E6, N.Gs6], 0.03, { seed: 'bedg', t60: 1.6, dur: 1.6, gains: [0, -2, -3, -5], tick: -26 })), at: 2.96, gain: -14 });
    let v = lib.mix(parts, { channels: 2, length: D });
    v = H.verb(v, 'warehouse', 0.18, 2.2, 'bedv');
    bed = H.shape(lib.fadeOut(lib.slice(v, 0, D), 0.6, 'exp'), -18);
    await cat.add('starsword_ult_bed', bed, { lufs: -18, spatial: false, channels: 2, voices: 1, pitch: [1, 1], sources: [X.timpRoll, X.timp, X.crash, X.choirA, X.choirO, X.celloE2, X.celloB2, X.tbC5, X.gongHard] });
    keep.bed = bed;
  }

  // the whole ultimate as the caster hears it at the handler's volumes (spatial layers ~10 m away, no attenuation
  // inside their ref distance) — logged and previewed (compare with the combo reference)
  const at = (b, l, t, vol = 1) => ({ buf: H.atLufs(b, l), at: t, gainLin: vol });
  const tl = lib.mix([at(keep.rise, -15, 0, 1.1), at(bed, -18, 0.3, 0.8), at(sigil[0], -18, 0.2, 1.4 * 0.9), at(fall[0], -15, 0.3, 1.2), at(impact[0], -12.5, 0.9, 1.2),
    at(pulse[0], -16, 1.6, 1.3 * 0.9), at(pulse[1], -16, 2.35, 1.3 * 0.9), at(pulse[2], -16, 3.1, 1.3 * 0.9), at(shatter[0], -15, 3.25, 1.2)], { channels: 2 });
  const L = lib.loudness(tl);
  ctx.log(`  ult timeline: ${L.integrated.toFixed(1)} LUFS integrated, momentary max ${L.momentaryMax.toFixed(1)}, short-term max ${L.shortTermMax.toFixed(1)}, peak ${lib.lin2db(lib.peak(tl)).toFixed(1)} dBFS`);
  ctx.preview('ult_timeline', tl);
}

// ---------------------------------------------------------------------------------------------- the sword's life
async function view(lib, ctx, cat, H, keep) {
  // starsword_idle: §1.12 idle hum — 82 / 123 / 165 Hz (E2 B2 E3), a 400-1200 Hz band of noise swept by a 0.2 Hz LFO,
  // the star river glinting (sparse glass pings) and a faint high shimmer. Periodic in 10 s (every partial a whole
  // number of cycles); only the random textures go through the loop crossfade.
  {
    const P = 10, L = 11, q = (f) => Math.round(f * P) / P, lfo = (t) => 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.2 * t);
    const hum = lib.saturate(lib.mix([{ buf: lib.tone(P, { freq: q(N.E2) }) }, { buf: lib.tone(P, { freq: q(N.B2) }), gain: -7 }, { buf: lib.tone(P, { freq: q(N.E3) }), gain: -6 }, { buf: lib.tone(P, { freq: q(N.B3) }), gain: -16 }]), { drive: 3, type: 'tube' });
    const shimmer = lib.automate(lib.mix([{ buf: lib.tone(P, { freq: q(N.E6) }) }, { buf: lib.tone(P, { freq: q(N.B6) }), gain: -4 }]), (t) => 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.3 * t));
    const band = lib.sweep(lib.noise(L, { color: 'pink', seed: 'idle_n' }), 'bp', (t) => 400 * Math.pow(3, lfo(t)), { q: 1.6 });
    const r = H.rng('idle_g'), glints = [];
    for (let i = 0; i < 9; i++) glints.push({ buf: H.glass(DIPPER[r.int(0, 6)] * (r.chance(0.3) ? 2 : 1), 1.2, { seed: `ig${i}`, t60: 0.9, tick: -30 }), at: i * 1.15 + r.range(0, 0.6), gain: -r.range(0, 8), pan: r.range(-0.7, 0.7) });
    const texture = lib.loopCrossfade(lib.mix([{ buf: lib.stereoize(H.norm(band), { width: 0.35, hp: 250, seed: 'idle_st' }), gain: -6 }, { buf: H.norm(lib.mix(glints, { channels: 2, length: L })), gain: -24 }], { channels: 2 }), L - P);
    const v = lib.mix([{ buf: H.norm(hum), gain: -4 }, { buf: H.norm(shimmer), gain: -32 }, { buf: texture }], { length: P, channels: 2 });
    await cat.add('starsword_idle', v, { lufs: -20, loop: true, spatial: false, channels: 2, voices: 1, pitch: [1, 1] });
  }

  // starsword_star: 七星依序 — seven glass bells climbing the Dipper 50 ms apart (the stars light 天樞 -> 搖光 along the
  // blade, left to right), a glint at the top
  {
    const out = [];
    for (let k = 0; k < 2; k++) {
      const v = lib.mix([
        { buf: H.run(DIPPER, 0.05, { seed: `st${k}`, t60: 0.75, dur: 1.0, gains: DIPPER.map((_, i) => -3 + i * 0.4), pans: DIPPER.map((_, i) => -0.45 + i * 0.15), tick: -18 }) },
        { buf: H.tinkles(0.4, 5, { lo: 6000, hi: 11000, t60: 0.06, seed: `stt${k}` }), at: 0.33, gain: -14 },
      ], { channels: 2 });
      out.push(H.cut(H.verb(v, 'warehouse', 0.2, 1.0, `stv${k}`), 1.25, 0.4));
    }
    await cat.add('starsword_star', out, { lufs: -21, vol: 1.5, spatial: false, channels: 2, voices: 2, pitch: [1, 1] });
  }

  // starsword_draw: 出鞘聲 — the blade drawn: a long steel scrape (gong scrape + a synthesized scrape), the guard
  // leaving the scabbard (a tick), the blade ringing free, the energy edge lighting (a soft rising buzz + star dust)
  const scr = await H.ld(X.gongScrape, 0.075, 0.6, { hp: 1500 });
  {
    const out = [];
    for (let k = 0; k < 2; k++) {
      const D = 0.9;
      const scrape = lib.automate(lib.mix([{ buf: H.norm(lib.varispeedSemis(scr, 3 + k)) }, { buf: H.norm(H.K.scrape(0.3, 2400, 5200, `drs${k}`)), gain: -8 }]), (t) => H.smooth(t / 0.04) * (t < 0.26 ? 0.6 + 0.4 * (t / 0.26) : Math.exp(-(t - 0.26) * 30)));
      const edge = lib.automate(lib.sweep(H.energy(0.45, [[0, N.E3], [0.45, N.E4]]), 'lp', (t) => 600 + 3600 * (t / 0.45), { q: 1.2 }), (t) => H.smooth(t / 0.25) * Math.exp(-Math.max(0, t - 0.25) * 9));
      const v = lib.mix([
        { buf: await H.ld(X.cloth, 0, 0.34, { hp: 150 }), gain: -12 },
        { buf: H.strike(await H.ld(X.metalL(k), 0, 0.3, { hp: 800, semis: 4 })), gain: -12 },
        { buf: scrape, at: 0.01, gain: -3 },
        { buf: H.norm(H.bladeRing(k ? N.Cs6 : N.B5, 0.8, { t60: 0.7, seed: `drr${k}` })), at: 0.27, gain: -5 },
        { buf: H.norm(H.bladeRing(N.B4, 0.8, { t60: 0.6, bright: 0.6, seed: `drl${k}` })), at: 0.27, gain: -13 },
        { buf: H.norm(edge), at: 0.3, gain: -14 },
        { buf: H.tinkles(0.4, 5, { lo: 4000, hi: 9000, t60: 0.08, seed: `drt${k}` }), at: 0.32, gain: -19 },
      ]);
      out.push(H.cut(H.verb(lib.stereoize(v, { width: 0.3, hp: 600, seed: `drw${k}` }), 'smallRoom', 0.12, 0.6, `drv${k}`), D, 0.4));
    }
    await cat.add('starsword_draw', out, { lufs: -19, vol: 1.1, spatial: false, channels: 2, voices: 1, pitch: [0.98, 1.02], sources: [X.gongScrape, X.cloth, X.metalL(0)] });
  }

  // starsword_draw_first: 低沉金屬出鞘聲 (0-0.35 s of the 1.6 s clip), then (with the stars chasing at 0.35) the
  // energy edge lighting from the root to the tip: a low hum rising (0.75-1.15), fading under the theme at 1.28
  {
    const D = 1.55;
    const scrape = lib.automate(lib.mix([{ buf: H.norm(lib.varispeedSemis(scr, -4)) }, { buf: H.norm(H.K.scrape(0.4, 900, 2600, 'dfs')), gain: -7 }]), (t) => H.smooth(t / 0.05) * (t < 0.34 ? 0.5 + 0.5 * (t / 0.34) : Math.exp(-(t - 0.34) * 22)));
    const hum = lib.automate(lib.sweep(H.energy(0.9, [[0, N.E1], [0.5, N.E2], [0.9, N.E2]], { fm: -22 }), 'lp', (t) => 160 + 2600 * H.smooth(t / 0.55), { q: 1.4 }), (t) => H.smooth(t / 0.55) * (t < 0.62 ? 1 : Math.exp(-(t - 0.62) * 5)));
    const riser = lib.automate(lib.sweep(lib.noise(0.7, { color: 'pink', seed: 'dfr' }), 'bp', (t) => 400 * Math.pow(8, t / 0.6), { q: 1.4 }), (t) => H.smooth(t / 0.55) * (t < 0.58 ? 1 : Math.exp(-(t - 0.58) * 14)));
    const v = lib.mix([
      { buf: await H.ld(X.clothHeavy, 0, 0.5, { hp: 80 }), gain: -9 },
      { buf: scrape, at: 0.01, gain: -2 },
      { buf: H.strike(await H.ld(X.metalL(3), 0, 0.3, { hp: 300, semis: -3 })), at: 0.36, gain: -9 },
      { buf: H.norm(H.bladeRing(N.B3, 1.2, { t60: 1.0, seed: 'dfb' })), at: 0.36, gain: -5 },
      { buf: H.norm(H.bladeRing(N.E5, 1.0, { t60: 0.7, bright: 0.7, seed: 'dfh' })), at: 0.365, gain: -12 },
      { buf: H.norm(hum), at: 0.62, gain: -5 },
      { buf: H.norm(riser), at: 0.66, gain: -15 },
      { buf: H.tinkles(0.6, 9, { lo: 3000, hi: 8000, t60: 0.08, seed: 'dft', skew: 0.7, fall: -4 }), at: 0.72, gain: -19 },
    ]);
    const out = H.cut(H.verb(lib.stereoize(v, { width: 0.3, hp: 500, seed: 'dfw' }), 'warehouse', 0.14, 1.2, 'dfv'), D, 0.3);
    await cat.add('starsword_draw_first', out, { lufs: -19, vol: 1.1, spatial: false, channels: 2, voices: 1, pitch: [1, 1], sources: [X.gongScrape, X.clothHeavy, X.metalL(3)] });
  }

  // starsword_first_sting: 主題「星河」 — one long bell (E4, E5 in it) and the chord: glass E5 B5 F#6 G#6, the choir on
  // E, cellos on E2, a gong wash under it
  {
    const D = 3.0;
    const choir = await H.ld(X.choirA, 0.5, 3.6, { stereo: true, hp: 180, semis: -1, lp: 5000 });
    const v = lib.mix([
      { buf: H.norm(await H.tubular(N.E4, D, { t60: 2.6 })) },
      { buf: H.norm(await H.tubular(N.E5, 2.4, { t60: 2.0 })), at: 0.004, gain: -6 },
      { buf: H.norm(H.run([N.E5, N.B5, N.Fs6, N.Gs6], 0.014, { seed: 'fsg', t60: 2.2, dur: D, gains: [0, -2, -3, -4], tick: -24 })), at: 0.01, gain: -8 },
      { buf: H.env(choir, [[0, -40], [0.18, -2], [1.8, -4], [2.8, -40]]), gain: -10 },
      { buf: H.env(await H.ld(X.celloE2, 0.3, 3.3, { stereo: true, hp: 40 }), [[0, -40], [0.2, -4], [2.0, -6], [2.9, -40]]), gain: -13 },
      { buf: H.norm(await H.ld(X.gongHard, 0.09, 2.8, { stereo: true, hp: 70, lp: 1500, fadeOut: 0.6 })), gain: -16 },
      { buf: H.tinkles(0.8, 10, { lo: 4000, hi: 10000, t60: 0.1, seed: 'fst' }), at: 0.02, gain: -16 },
    ], { channels: 2 });
    const out = H.cut(H.verb(v, 'warehouse', 0.28, 2.4, 'fsv'), D, 0.35);
    await cat.add('starsword_first_sting', out, { lufs: -19, vol: 1.3, spatial: false, channels: 2, voices: 1, pitch: [1, 1], sources: [X.tbC4, X.tbC5, X.choirA, X.celloE2, X.gongHard] });
  }

  // starsword_inspect (§1.12: a 2-3 s theme phrase; the cue starts 0.53 s into the 4.4 s inspect): the blade tilts (a
  // soft ring swells, the reflection sweeps) | 0.27-1.47 the palm slides up the flat (a fine glass-rub squeak) while
  // the phrase plays on glass bells over a choir 'ooh' | 1.47-2.67 the sword turns upright in the hand (two light
  // whooshes) | 2.99 the 天樞 gem flashes
  {
    const D = 3.4;
    const r = H.rng('insp');
    const rub = lib.automate(lib.sweep(lib.noise(1.25, { seed: 'insr' }), 'bp', (t) => 2300 * Math.pow(1.5, t / 1.25) * (1 + 0.02 * Math.sin(2 * Math.PI * 37 * t)), { q: 9 }),
      (t) => H.smooth(t / 0.15) * H.smooth((1.25 - t) / 0.2) * (0.6 + 0.4 * Math.abs(Math.sin(2 * Math.PI * 11 * t + r.next()))));
    const phrase = [[N.B4, 0.3, 0], [N.E5, 0.55, -1], [N.Fs5, 0.78, -2], [N.B5, 1.02, -1], [N.Gs5, 1.42, -2], [N.E5, 1.72, -1]];
    const notes = phrase.map(([f, at, g], i) => ({ buf: H.glass(f, 1.6, { seed: `inp${i}`, t60: 1.5, bright: 0.8, tick: -26 }), at, gain: g, pan: -0.3 + i * 0.12 }));
    const spin = lib.mix([{ buf: H.swoosh(0.45, 0.2, [300, 1100, 400], { q: 1.1, seed: 'insw1' }) }, { buf: H.swoosh(0.45, 0.2, [280, 1000, 380], { q: 1.1, seed: 'insw2' }), at: 0.5, gain: -2 }]);
    const v = lib.mix([
      { buf: H.norm(H.bladeRing(N.B5, 1.6, { t60: 1.4, bright: 0.6, attack: 0.06, seed: 'insb' })), gain: -10 },
      { buf: H.norm(H.swoosh(0.7, 0.35, [3000, 7000, 8000], { q: 2, color: 'white', seed: 'insl', rise: 1.5, fall: 4 })), gain: -24 },
      { buf: H.norm(rub), at: 0.27, gain: -18 },
      { buf: lib.mix(notes, { channels: 2 }), gain: -4 },
      { buf: H.norm(H.glass(N.E4, 2.0, { seed: 'inpl', t60: 2.0, bright: 0.5, tick: -40 })), at: 0.3, gain: -12 },
      { buf: H.env(await H.ld(X.choirU, 0.5, 3.5, { stereo: true, hp: 200, semis: -1, lp: 4500 }), [[0, -40], [0.4, -3], [2.2, -4], [2.9, -40]]), at: 0.2, gain: -17 },
      { buf: H.norm(spin), at: 1.5, gain: -15 },
      { buf: await H.ld(X.cloth, 0, 0.34, { hp: 150 }), at: 1.55, gain: -20 },
      { buf: H.norm(H.glass(N.E7, 1.0, { seed: 'insgem', t60: 0.8, bright: 1.2, tick: -10 })), at: 2.99, gain: -9 },
      { buf: H.tinkles(0.35, 5, { lo: 6000, hi: 11000, t60: 0.06, seed: 'insgt' }), at: 3.0, gain: -16 },
    ], { channels: 2 });
    const out = H.cut(H.verb(v, 'warehouse', 0.24, 2.0, 'insv'), D, 0.12);
    await cat.add('starsword_inspect', out, { lufs: -20, vol: 1.2, spatial: false, channels: 2, voices: 1, pitch: [1, 1], sources: [X.choirU, X.cloth] });
  }

  // starsword_recover: 收招 — the sword swung onto the shoulder (a low whoosh, cloth) with half a ring (cut short by the
  // hand) and a trail of star points falling
  {
    const out = [];
    for (let k = 0; k < 2; k++) {
      const ringB = lib.automate(H.bladeRing(k ? N.Gs5 : N.Fs5, 0.8, { t60: 0.6, seed: `rcr${k}` }), (t) => (t < 0.28 ? 1 : Math.exp(-(t - 0.28) * 18)));
      const v = lib.mix([
        { buf: H.norm(H.swoosh(0.4, 0.15, [240, 820, 300], { q: 1.2, seed: `rcw${k}` })), gain: -5 },
        { buf: await H.ld(X.cloth, 0, 0.34, { hp: 150 }), at: 0.12, gain: -11 },
        { buf: H.norm(ringB), at: 0.12, gain: -4 },
        { buf: H.run([N.Cs7, N.B6, N.Gs6, N.Fs6, N.E6], 0.045, { seed: `rcs${k}`, t60: 0.4, dur: 0.6, gains: [0, -1, -2, -3, -4], tick: -26 }), at: 0.16, gain: -14 },
      ]);
      out.push(H.cut(H.verb(lib.stereoize(v, { width: 0.3, hp: 600, seed: `rcst${k}` }), 'smallRoom', 0.12, 0.6, `rcv${k}`), 1.0, 0.4));
    }
    await cat.add('starsword_recover', out, { lufs: -21, vol: 1.2, spatial: false, channels: 2, voices: 1, pitch: [0.98, 1.02], sources: [X.cloth] });
  }
}

// ---------------------------------------------------------------------------------------------- other
async function other(lib, ctx, cat, H, keep) {
  // ready_starsword: §1.12 unique ready — the blade sings (a steel ring with a short scrape on it) and a glass-bell
  // chord rolls over it (E6 B6 G#6 F#7 E7 on E5): high, clear, unmistakable; it repeats softly every 2.5 s
  {
    const D = 1.9;
    const scr = await H.ld(X.gongScrape, 0.075, 0.25, { hp: 3000 });
    const v = lib.mix([
      { buf: H.norm(H.bladeRing(N.B5, 1.4, { t60: 1.0, attack: 0.004, seed: 'rdb' })), gain: -7 },
      { buf: H.norm(scr), gain: -16 },
      { buf: H.norm(H.glass(N.E5, D, { seed: 'rd5', t60: 1.5, tick: -20 })), gain: -6 },
      { buf: H.run([N.E6, N.B6, N.Gs6, N.Fs7, N.E7], 0.022, { seed: 'rdc', t60: 1.3, dur: D, gains: [0, -2, -3, -5, -4], pans: [-0.4, 0.4, -0.15, 0.25, 0], tick: -14 }) },
      { buf: H.tinkles(0.6, 8, { lo: 6000, hi: 11000, t60: 0.07, seed: 'rdt' }), at: 0.09, gain: -15 },
    ], { channels: 2 });
    const out = H.cut(H.verb(lib.stereoize(v, { width: 0.35, hp: 900, seed: 'rds' }), 'warehouse', 0.22, 1.6, 'rdv'), D, 0.35);
    await cat.add('ready_starsword', out, { lufs: -19, bus: 'ui', spatial: false, channels: 2, voices: 2, pitch: [1, 1], sources: [X.gongScrape] });
    keep.ready = out;
  }

  // starsword_crisis: 星屏 (§1.12 危機護甲: 瓷器碎裂＋元素尾音) — seven star shards whirl round the player (a whirling
  // whoosh and seven glass pings) and burst (porcelain + glass breaking, a thump, a glass chord), the shards flying
  // off, then the star tail (a falling cosmic hum, a shimmer, one bell)
  {
    const out = [];
    for (let k = 0; k < 2; k++) {
      const D = 1.9, B = 0.25;
      const whirl = lib.automate(H.swoosh(0.32, 0.22, [700, 2600, 1800], { q: 1.4, seed: `crw${k}`, rise: 1.4, fall: 10 }), (t) => 0.55 + 0.45 * Math.sin(2 * Math.PI * 14 * t));
      const tail = lib.automate(lib.eq(H.energy(1.4, [[0, N.B2], [1.4, N.E2]], { fm: -24 }), [{ type: 'lp', f: 900, order: 2 }]), (t) => Math.min(1, t / 0.04) * Math.exp(-t * 2.4));
      const v = lib.mix([
        { buf: H.norm(whirl), gain: -6 },
        { buf: H.run(DIPPER, 0.032, { seed: `crp${k}`, t60: 0.3, dur: 0.5, tick: -24 }), gain: -12 },
        { buf: H.strike(await H.ld(X.plate, 0.02, 1.08, { hp: 200, semis: k ? -1.5 : 0 })), at: B },
        { buf: H.strike(await H.ld(X.shard, 0.01, 0.33, { hp: 1500 })), at: B + 0.03, gain: -5 },
        { buf: H.strike(await H.ld(X.glassH(k + 1), 0, 0.4, { hp: 600, semis: -2 })), at: B + 0.005, gain: -4 },
        { buf: H.boom(`crb${k}`, { f0: 112, f1: 46, decay: 0.42, drive: 2.5 }), at: B, gain: -3 },
        { buf: H.norm(H.run([N.E5, N.B5, N.E6], 0.006, { seed: `crg${k}`, t60: 1.0, dur: 1.2, tick: -30 })), at: B + 0.01, gain: -10 },
        { buf: H.tinkles(1.0, 18, { lo: 2600, hi: 8500, t60: 0.12, seed: `crt${k}`, skew: 1.2 }), at: B + 0.03, gain: -9 },
        { buf: H.norm(tail), at: B + 0.1, gain: -10 },
        { buf: H.norm(H.glass(N.E6, 1.0, { seed: `crl${k}`, t60: 0.9 })), at: B + 0.55, gain: -15 },
      ]);
      out.push(H.shape(H.cut(H.verb(v, 'alley', 0.15, 1.2, `crv${k}`, 1), D, 0.4), -14));
    }
    await cat.add('starsword_crisis', out, { lufs: -14, spatial: true, range: [4, 60], voices: 2, pitch: [0.98, 1.02], sources: [X.plate, X.shard, X.glassH(1)] });
  }

  // starsword_final: KE_FINAL — a small 天劍 drops on the wave's last kill (0.3 s fall): a short falling whistle, the
  // impact (boom, concrete, a clang, a glass chord), a bell, star dust
  {
    const out = [];
    const smash = await H.ld(X.concSmash, 0, 1.0, { hp: 35 });
    const clang = await H.ld(X.clangDeep, 0, 0.8, { hp: 60, semis: -3 });
    for (let k = 0; k < 2; k++) {
      const D = 2.0, B = 0.3;
      const f = (t) => 3000 * Math.pow(0.45, t / B);
      const whistle = lib.automate(lib.mix([{ buf: lib.tone(B, { freq: f }) }, { buf: lib.sweep(lib.noise(B, { seed: `fnw${k}` }), 'bp', f, { q: 5 }), gain: -6 }]), (t) => (t / B) ** 1.5 * (t > B - 0.015 ? Math.max(0, (B - t) / 0.015) : 1));
      const v = lib.mix([
        { buf: H.norm(whistle), gain: -10 },
        { buf: H.boom(`fnb${k}`, { f0: 86, f1: 44, decay: 0.5, drive: 2.5 }), at: B },
        { buf: H.strike(smash), at: B, gain: -5 },
        { buf: H.strike(clang), at: B, gain: -9 },
        { buf: H.norm(H.run([N.E5, N.B5, N.E6], 0.005, { seed: `fng${k}`, t60: 1.1, dur: 1.4, tick: -24 })), at: B + 0.005, gain: -8 },
        { buf: H.norm(await H.tubular(N.E5, 1.5, { t60: 1.4 })), at: B + 0.01, gain: -9 },
        { buf: H.tinkles(1.0, 16, { lo: 2800, hi: 9000, t60: 0.12, seed: `fnt${k}`, skew: 1.2 }), at: B + 0.02, gain: -11 },
      ]);
      out.push(H.shape(H.cut(H.verb(v, 'urban', 0.18, 1.4, `fnv${k}`, 1), D, 0.4), -15));
    }
    await cat.add('starsword_final', out, { lufs: -15, vol: 1.2, spatial: true, range: [8, 100], voices: 1, pitch: [0.99, 1.01], maxHeadMs: 300, sources: [X.concSmash, X.clangDeep, X.tbC5] });
  }
}

/** 星河．夜渡 twin cues (§1.12 雙生版: the originals -4 st with an echo); a twin handler would play `${cue}_night`. */
async function twins(lib, ctx, cat, H, keep) {
  const T = (b) => H.twin(b);
  await cat.add('ready_starsword_night', T(keep.ready), { lufs: -19, bus: 'ui', spatial: false, channels: 2, voices: 2, pitch: [1, 1], note: 'twin: ready_starsword -4 st + echo' });
  await cat.add('starsword_swing_night', keep.swing.slice(0, 4).map((b) => H.shape(lib.fadeOut(lib.slice(T(b), 0, 0.95), 0.3, 'exp'), -15)), { lufs: -15, spatial: false, channels: 2, voices: 3, pitch: [0.97, 1.03], note: 'twin: starsword_swing -4 st + echo' });
  await cat.add('starsword_ult_rise_night', T(keep.rise), { lufs: -15, vol: 1.1, spatial: true, channels: 2, range: [10, 120], voices: 2, pitch: [1, 1], maxHeadMs: 350 });
  await cat.add('starsword_ult_impact_night', H.shape(T(keep.impact), -12.5, { max: 7 }), { lufs: -12.5, maxLimitDb: 6, spatial: true, range: [15, 160], voices: 2, pitch: [1, 1], priority: 3 });
  await cat.add('starsword_ult_bed_night', T(keep.bed), { lufs: -18, spatial: false, channels: 2, voices: 1, pitch: [1, 1] });
  await cat.add('starsword_ult_shatter_night', H.shape(T(keep.shatter), -15), { lufs: -15, vol: 1.2, spatial: true, range: [12, 140], voices: 2, pitch: [1, 1] });
}

/** Reference mixes as the player hears them (logged + previewed, not shipped). */
function references(lib, ctx, H, keep, built) {
  const at = (b, l, t, vol = 1) => ({ buf: H.atLufs(b, l), at: t, gainLin: vol });
  const log = (name, b) => { const L = lib.loudness(b); ctx.log(`  ${name}: ${L.integrated.toFixed(1)} LUFS integrated, momentary max ${L.momentaryMax.toFixed(1)}, short-term max ${L.shortTermMax.toFixed(1)}, peak ${lib.lin2db(lib.peak(b)).toFixed(1)} dBFS`); ctx.preview(name, b); };
  if (built.combo) {
    // 星流三式 connecting: swing (0.9, +0.09 s) + hit (0.9) + ring (0.4) at each blade landing; the wheel lands at 1.4
    const { swing, hit, ring, wheel, kill } = built.combo, parts = [];
    for (const [i, t0] of [0, 0.55].entries()) parts.push(at(swing[i], -15, t0 + 0.09, 0.9), at(hit[i], -15, t0 + 0.2, 0.9), at(ring[i], -20, t0 + 0.2, 0.6));
    parts.push(at(wheel[0], -14.5, 1.1 + 0.135, 0.9), at(hit[2], -15, 1.1 + 0.3, 0.9), at(ring[1], -20, 1.1 + 0.3, 0.6), at(kill[0], -19, 1.1 + 0.3, 0.9));
    log('combo_timeline', lib.mix(parts, { channels: 2 }));
  }
  if (built.slam) {
    // 墜星: charge loop (0.5) through 3 stages (0.6 / 1.2 / 1.8), released at 2.0: swing (rate 0.85 -> pitch), slam
    // at 2.18 (vol 1.2 at stage 3), wave (0.8) + crack (0.6)
    const { charge: c, stage, full, swing, slam, wave, crack } = built.slam;
    const cl = lib.automate(lib.varispeedCurve(lib.concat([c, c]), [[0, 0.8], [1.8, 1.25], [6, 1.25]]), (t) => (t < 2.0 ? 1 : Math.max(0, 1 - (t - 2.0) / 0.1)));
    log('slam_timeline', lib.mix([at(cl, -17, 0, 0.5), at(stage[0], -20, 0.6, 1.5 * 0.6), at(stage[1], -20, 1.2, 1.5 * 0.6), at(full, -17, 1.8, 1.3 * 0.6),
      at(lib.varispeed(swing[0], 0.85), -15, 2.0, 1), at(slam[0], -14, 2.18, 1.2 * 1.12), at(wave[0], -15, 2.18, 0.8), at(crack[0], -16, 2.18, 0.6)], { channels: 2 }));
  }
}

// ---------------------------------------------------------------------------------------------- producer
export async function produce(lib, ctx) {
  const only = process.env.SS_ONLY ? new Set(process.env.SS_ONLY.split(',').map((s) => s.trim())) : null;
  const want = (g) => !only || only.has(g);
  const cat = ctx.category('premium_starsword', { bus: 'sfx' });
  const H = kit(lib, ctx);
  // build log: the pre-shaping of each sound, "natural PLR -> shaped PLR" per variant (the drive is capped)
  const add = cat.add.bind(cat);
  const built = {}, grab = new Map();
  cat.add = (name, v, o) => {
    const s = H.shapeLog.splice(0);
    if (s.length) ctx.log(`  shape ${name} @${s[0][0]}: ${s.map((x) => `${x[1]}->${x[2]}`).join(' ')}`);
    grab.set(name, Array.isArray(v) ? v : [v]);
    return add(name, v, o);
  };
  const keep = {};
  if (want('swing') || want('twin')) await swings(lib, ctx, cat, H, keep);
  if (want('hits')) await hits(lib, ctx, cat, H, keep);
  if (want('charge')) await charge(lib, ctx, cat, H, keep);
  if (want('guard')) await guard(lib, ctx, cat, H, keep);
  if (want('skyspan')) await skyspan(lib, ctx, cat, H, keep);
  if (want('ult') || want('twin')) await ult(lib, ctx, cat, H, keep);
  if (want('view')) await view(lib, ctx, cat, H, keep);
  if (want('other') || want('twin')) await other(lib, ctx, cat, H, keep);
  if (want('twin')) await twins(lib, ctx, cat, H, keep);
  const g = (n) => grab.get(n);
  if (g('starsword_swing') && g('starsword_hit') && g('starsword_wheel')) built.combo = { swing: g('starsword_swing'), hit: g('starsword_hit'), ring: g('starsword_hit_ring'), wheel: g('starsword_wheel'), kill: g('starsword_kill') };
  if (g('starsword_charge') && g('starsword_swing')) built.slam = { charge: g('starsword_charge')[0], stage: g('starsword_charge_stage'), full: g('starsword_charge_full')[0], swing: g('starsword_swing'), slam: g('starsword_slam'), wave: g('starsword_wave'), crack: g('starsword_crack') };
  references(lib, ctx, H, keep, built);
  await cat.write();
}
