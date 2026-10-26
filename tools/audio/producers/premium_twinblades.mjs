// 虹霓．雙絕 Hongni Prismedge (神兵 X06 dual sabres, docs/PREMIUM_WEAPONS.md §2.33 + §1.12) — category
// 'premium_twinblades': every cue game/src/weapons/premium/twinblades.js plays (its SFX table + the clips' 'snd' events,
// the idle hum, the def's ready cue), the def.sound contract layers (twinblades_close / _tail / _far) and the reserved
// twin 虹霓．夜曜 (`<cue>_night`). CC0 recordings from the shared inventory (sword / knife whooshes and a slash, metal
// and glass impacts, a tea cup, porcelain and glass breaks, flesh / bone, stone / debris / blasts, VSCO 2 timpani /
// tubular bells / gong / cymbals / bass drum / cello and violin tremolo on A and E, a crowd choir) and synthesis.
// Palette: two thin steel sabres that ring a major third apart (虹 the right one on A, 霓 the left one on C#: every
// clash, kill and cross-cut sounds the 「雙絕」 dyad), the prism (分光: glass glints running across the pentatonic — the
// 虹 run falls, the 霓 run climbs, 色序相反 — and a flanged "iridescent" sheen of bright noise), the projected edges
// (a crystalline sine zing with doppler), 玻璃磬 glass chime stones and a plucked zither for the theme. Every tuned part
// sits in A 宮 pentatonic (A B C# E F#).
//
//   swing    twinblades_swing_r / _swing_l (疾虹 ①–④: the cue is delayed c.hit * 0.4, so the pass peaks 0.05 s in; the
//            虹 pass sweeps right -> left, the 霓 pass left -> right), _swing_cross (交虹 ⑤: both from the shoulders,
//            peaking 0.13 s in where the blades cross), twinblades_close / _tail / _far (def.sound contract)
//   hits     _hit (2D under every connecting cut: 嗤 + the bite + the blade ringing + the §1.12 luxury tick), _hit_flesh
//            (one per body), _hit_wall (刃擊石「鏘」), _kill (雙聲刀鳴 + 分光碎屑), _sever (斷肢), _clash (雙刀交擊「錚」＋和聲)
//   虹橋/虹貫 _wave (the X wave tearing away), _wave_hit, _dash_charge (loop, rate 0.85 -> 1.2 by the handler: two
//            Shepard-Risset glass hums a major third apart that rise for ever + an inhale), _dash (拔刀斬 + 破風),
//            _aftercut (後斬: one delayed 「錚」 and every body bursting at once)
//   交虹      _guard_up (「鏘」 the cross locks), _block, _parry (清亮「叮」), _flurry (霓返: eight cuts, eight rising rings)
//   虹輪      _storm_start, _storm (loop: six blades orbiting, each humming its own note), _storm_hit, _storm_end
//   ult      §1.12 three layers: rise (_ult_cast: 0.4 s inhale into the throw) -> 40-60 Hz impact (_ult_bloom) -> bells,
//            strings, timpani and choir in A (_ult_bed, scored to the 千刃蓮華 timeline) + release (_ult_shatter: the
//            rainbow porcelain raining down, the deflating sigh). Beats: _ult_throw (雙刀破空), _ult_sigil (磬一聲),
//            _ult_rise (地底刀鳴上升), _ult_petal (x12, pitched 0.85 -> 1.29 by the handler), _ult_spin (旋風), _catch (接刀)
//   view     twinblades_idle (loop: 55 / 69 Hz two-tone hum + a 400-1200 Hz band swept at 0.2 Hz + the two edges
//            breathing at 0.6 Hz out of phase, §1.12), _draw, _draw_first (高低兩聲出鞘 + 雙聲刀鳴), _first_sting (主題
//            「雙絕」: a zither strum and two 磬 a major third apart), _inspect (§1.12: an original 3 s phrase), _link
//            (環扣「喀」), _recover (收招: two spins, the blood flicked off, two rings)
//   other    ready_twinblades (unique: two glass 磬 a major third apart struck together + a seven-colour glint run),
//            _crisis (虹障: 瓷器碎裂 + the prism tail), _final (KE_FINAL: two sky blades cross-cut)
//   twin     <cue>_night for 虹霓．夜曜 (ready, swings, ult cast / bloom / bed / shatter): -4 st, darker, an echo (§1.12).
//            Not played yet (the twin is reserved).
//
// Mastering: every file within 1 LU of its target at <= -1 dBTP (decoded). Pre-shaping soft-clips at most ~6 dB of
// drive (logged "natural -> shaped PLR"); ringing cues are mastered lower and lifted with the manifest vol instead of
// being crushed. Logged references: the 疾虹五連, the 虹貫 dash and the ultimate as the player hears them.
//
//   node --max-old-space-size=2048 tools/audio/build.mjs --only premium_twinblades
//   dev subset (never into the game folder: a subset run removes the other files of the category it writes):
//   CF_AUDIO_OUT=tools/audio/out/tb-dev TB_ONLY=swing,hits node --max-old-space-size=2048 \
//     tools/audio/run-producer.mjs tools/audio/producers/premium_twinblades.mjs --spectrograms all
import { makeKit } from './weapons.mjs';

const SR = 48000;
const NYQ = 17000;                 // partials above this are dropped (Vorbis q0.5 cuts there anyway; no aliasing)
const midi = (m) => 440 * 2 ** ((m - 69) / 12);
// A 宮 pentatonic: N.A5, N.Cs6 ... (pitch classes A B C# E F#), PENTA ascending
const PC = { A: 9, B: 11, Cs: 1, E: 4, Fs: 6 };
const N = {};
for (let o = 1; o <= 8; o++) for (const [k, pc] of Object.entries(PC)) N[`${k}${o}`] = midi(12 * (o + 1) + pc);
const PENTA = Object.values(N).sort((a, b) => a - b);
/** n consecutive pentatonic notes from f (inclusive), every `step`-th */
const pent = (f, n, step = 1) => { const i = PENTA.findIndex((x) => x >= f * 0.999); return Array.from({ length: n }, (_, k) => PENTA[Math.min(PENTA.length - 1, i + k * step)]); };
const HONG = N.A5, NI = N.Cs6;     // the two sabres' rings: 虹 on A, 霓 a major third up
// the six 虹輪 spirit blades, warm / cool alternating (each hums its own note)
const SIX = [N.A4, N.Cs5, N.E5, N.Fs5, N.A5, N.Cs6];
// band-share targets (dB, analysis bands) every variant of a family is matched towards: one colour across sources
const BAL = {
  swing: { low: -16, lowMid: -4, mid: -5, high: -7.5, air: -12 },   // lighter and brighter than the greatsword / axe passes
  hit: { low: -9, lowMid: -9, mid: -5, high: -5, air: -13 },
  cut: { low: -11, lowMid: -9, mid: -5, high: -5, air: -12 },     // per-body layers (flesh, sever, wave / storm cuts)
  block: { low: -6, lowMid: -9, mid: -4, high: -9, air: -18 },
};

// ---------------------------------------------------------------------------------------------- sources
const X = {
  // air / blades
  whoom: 'fs:60024', katana: 'fs:263595', swoosh: 'fs:507466', slash: 'fs:35213', knifeWh: 'fs:389690', wind: 'fs:146932',
  // metal / glass / porcelain
  metalHit: 'fs:406562', cup: 'fs:389432', plate: 'fs:565642', shard: 'fs:203381', glassBreak: 'fs:221528', glassSmash: 'fs:244238',
  glassBreak2: 'fs:249549', bottle: 'fs:202093', iceCrack: 'fs:342546',
  metalL: (k) => `kenney_impact/Audio/impactMetal_light_00${k % 5}`, metalM: (k) => `kenney_impact/Audio/impactMetal_medium_00${k % 5}`,
  metalH: (k) => `kenney_impact/Audio/impactMetal_heavy_00${k % 5}`, glassL: (k) => `kenney_impact/Audio/impactGlass_light_00${k % 5}`,
  glassM: (k) => `kenney_impact/Audio/impactGlass_medium_00${k % 5}`, punch: (k) => `kenney_impact/Audio/impactPunch_medium_00${k % 5}`,
  punchH: (k) => `kenney_impact/Audio/impactPunch_heavy_00${k % 5}`,
  // flesh / bone
  gash: 'fs:420674', slice: 'fs:504615', meaty: 'fs:779805', wet: 'fs:626405', gross: 'fs:641040', gore: 'fs:641046', splat: 'fs:414296',
  fracture: 'fs:488659', boneSnap: 'fs:578874', neck: 'fs:134025',
  // stone / debris / blasts
  concHit: 'fs:321477', concSmash: 'fs:522099', stoneDebris: 'fs:569510', rubbleScrape: 'fs:758580', debrisBig: 'fs:703247', debris: 'fs:703248',
  dirt: 'fs:386799', deepBoom: 'fs:258195', blast: 'fs:523089',
  // VSCO 2 orchestra + crowd choir (sung near F: -8 / -4 / -1 st = A / C# / E)
  celloTremA3: 'fs:372841', vlnTremA4: 'fs:374600', vlnTremE5: 'fs:374606', timpRoll: 'fs:373944', timpAs2: 'fs:373919', timpCs3: 'fs:373920',
  timpE3: 'fs:373921', bdFff: 'fs:375260', bdMuted: 'fs:375265', gong: 'fs:375532', crash: 'fs:375497', suspRoll: 'fs:375519', tbC5: 'fs:374274',
  choirA: 'fs:764329', choirA2: 'fs:764330', choirU: 'fs:764341',
  // foley
  cloth: 'fs:494797', clothHeavy: 'fs:163164',
};
// the four katana passes in fs:263595
const KATANA = [[0.001, 0.3], [0.521, 0.81], [1.053, 1.35], [1.507, 1.831]];

// ---------------------------------------------------------------------------------------------- toolkit
function kit(lib, ctx) {
  const { Buf } = lib;
  const K = makeKit(lib, ctx);
  const rng = (s) => ctx.rng(s);
  const norm = (b, db = -1) => lib.normalizePeak(b, db);
  const mono = (b) => (b.channels === 1 ? b : lib.toMono(b));
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  /**
   * A source slice: one channel (ch) or the mono fold (or stereo kept), pitched, filtered, faded, peak -1 dBFS. The
   * default fade-out is 12 % of the slice (a short cut of a longer recording must not stop dead).
   */
  async function ld(id, s, e, { ch, stereo = false, hp = 30, lp, semis = 0, fadeIn = 0.002, fadeOut, eq = [] } = {}) {
    let b = await ctx.load(id, { start: s, end: e });
    if (ch != null) b = new Buf([b.data[Math.min(ch, b.channels - 1)].slice()], b.sampleRate);
    else if (!stereo) b = mono(b);
    if (semis) b = lib.varispeedSemis(b, semis);
    b = lib.eq(b, [{ type: 'hp', f: hp, order: 2 }, ...(lp ? [{ type: 'lp', f: lp, order: 2 }] : []), ...eq]);
    return norm(lib.fade(b, fadeIn, Math.min(fadeOut ?? Math.max(0.012, b.duration * 0.12), b.duration / 3), 'sine'));
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
  /** Dry + a room whose send is high-passed (`hp` Hz): the thumps stay tight, the space carries the rings and the air. */
  const verb = (b, room, wet, len, seed, ch = 2, hp = 200) => {
    const w = lib.reverb(lib.eq(b, [{ type: 'hp', f: hp, order: 2 }]), room, { wet: 1, dry: 0, seed, length: len, channels: ch });
    return lib.mix([{ buf: b }, { buf: w, gainLin: wet }], { channels: ch });
  };
  /**
   * Pre-shape for the loudness stage: soft-clip to the peak-to-loudness ratio the target needs (<= ~1 dB limiting),
   * at most `max` dB of drive. A cue whose natural PLR needs more is mastered lower and lifted with the manifest vol.
   */
  const shapeLog = [];
  const shape = (b, lufs, o = {}) => {
    const plr0 = lib.truePeakDb(b) - lib.lufs(b), want = -2.3 - lufs;
    const out = plr0 <= want ? b : K.clipToPLR(b, want, { min: 0, max: 6, threshold: -6, ...o });
    shapeLog.push([lufs, Math.round(plr0 * 10) / 10, Math.round((lib.truePeakDb(out) - lib.lufs(out)) * 10) / 10]);
    return out;
  };
  const atLufs = (b, l) => lib.normalizeLufs(b, l, { ceiling: -1 });
  /** A sub-heavy source shortened: it decays with t60 from 20 ms in. */
  const tight = (b, t60) => lib.decay(b, t60, 0.02);
  /** Equal-power pan that moves: p(t) in [-1, 1] (mono-safe: the centre sums to the source). */
  function panMove(b, p) {
    const m = mono(b).data[0], n = m.length, L = new Float32Array(n), R = new Float32Array(n);
    for (let i = 0; i < n; i++) { const a = (clamp(p(i / SR), -1, 1) + 1) * Math.PI / 4; L[i] = m[i] * Math.cos(a) * Math.SQRT2; R[i] = m[i] * Math.sin(a) * Math.SQRT2; }
    return new Buf([L, R], SR);
  }
  /** Fold a buffer circularly into P seconds (an event train whose tails wrap onto the head: a seamless loop). */
  function wrap(b, P) {
    const n = Math.round(P * SR);
    return new Buf(b.data.map((d) => { const o = new Float32Array(n); for (let i = 0; i < d.length; i++) o[i % n] += d[i]; return o; }), SR);
  }
  const onGrid = (f, P) => Math.round(f * P) / P;
  /** Loop: the noise beds crossfaded over X, the tonal layer (rendered W + P, every tone on the 1/P grid) cut at W. */
  function seamless(P, X2, noisy, tonal, W = 0.5) {
    const a = lib.loopCrossfade(lib.fitLength(noisy, P + X2), X2);
    return tonal ? lib.mix([{ buf: a }, { buf: lib.slice(tonal, W, W + P) }], { length: P, channels: Math.max(a.channels, tonal.channels) }) : a;
  }
  /**
   * Loop QA: the wrap step against the file's typical sample step, and the level of a 0.2 s window straddling the seam
   * against the same window one rhythmic `period` further on, averaged over the loop.
   */
  function seamCheck(name, b, period = 0) {
    const d = mono(b).data[0], n = d.length, h = Math.round(0.1 * SR);
    let step = 0; for (let i = 1; i < n; i++) step += Math.abs(d[i] - d[i - 1]); step /= n - 1;
    const r = (c) => { let s = 0; for (let i = c - h; i < c + h; i++) { const x = d[((i % n) + n) % n]; s += x * x; } return 10 * Math.log10(s / (2 * h) + 1e-20); };
    const ps = Math.round((period || 0.2) * SR), refs = [];
    for (let c = ps; c < n - h; c += ps) refs.push(r(c));
    const jump = Math.abs(d[0] - d[n - 1]) / Math.max(1e-9, step), lv = r(0) - refs.reduce((a, x) => a + x, 0) / Math.max(1, refs.length);
    ctx.log(`  loop ${name}: wrap step x${jump.toFixed(1)}, seam window ${lv >= 0 ? '+' : ''}${lv.toFixed(1)} dB against the same phase elsewhere`);
    if (jump > 4 || Math.abs(lv) > 2.5) ctx.warn(`${name}: loop seam (step x${jump.toFixed(1)}, ${lv.toFixed(1)} dB)`);
  }

  // ---- synthesis
  /** Additive partials [[ratio, amp, t60]...], partials over NYQ dropped. */
  const parts = (dur, base, list, seed) => lib.partials(dur, { base, list: list.filter(([r]) => base * r < NYQ), seed });
  /**
   * 刀鳴: a thin steel sabre's ring — free-free bar modes (1 : 2.756 : 5.404 : 8.933 : 13.34), each a close doublet (the
   * blade's two bending planes), so the ring shimmers; the high modes die first. Tuned to the note it rings on.
   */
  function blade(f0, dur, { seed = 'bl', t60 = 1.0, bright = 1, beat = 0.0035, attack = 0 } = {}) {
    const modes = [1, 2.756, 5.404, 8.933, 13.34], amp = [1, 0.5, 0.3, 0.17, 0.09], list = [];
    modes.forEach((r, i) => { const a = amp[i] * (i ? bright : 1), t = t60 / (1 + i * 0.9); list.push([r, a, t], [r * (1 + beat * (i + 1)), a * 0.6, t * 0.85]); });
    let b = parts(dur, f0, list, seed);
    if (attack > 0) b = lib.applyEnv(b, lib.envCurve(dur, [[0, 0], [attack, 1], [dur, 1]]));
    return b;
  }
  /** A struck crystal glass: wine-glass modes (1 : 2.32 : 4.25 : 6.63 : 9.4) as slow-shimmering doublets + a tick. */
  function glass(f, dur, { seed = 'gl', t60 = 1.4, bright = 1, tick = -18, attack = 0 } = {}) {
    const R = [[1, 1, 1], [2.32, 0.36, 0.5], [4.25, 0.16, 0.28], [6.63, 0.07, 0.16], [9.4, 0.035, 0.1]], list = [];
    for (const [r, a, k] of R) { const amp = r === 1 ? a : a * bright; list.push([r, amp, t60 * k], [r * 1.0025, amp * 0.5, t60 * k * 0.8]); }
    let p = parts(dur, f, list, seed);
    if (attack > 0) p = lib.applyEnv(p, lib.envCurve(dur, [[0, 0], [attack, 1], [dur, 1]]));
    const t = lib.noiseBurst({ dur: 0.012, decay: 0.0025, hp: Math.min(9000, f * 3), lp: 16000, seed: seed + 't' });
    return lib.mix([{ buf: p }, { buf: t, gain: attack > 0 ? -60 : tick }]);
  }
  /**
   * 玻璃磬: a struck glass chime stone — a long pure fundamental, the stone's faint inharmonic set (1.505, 2.76, 3.98,
   * 5.4, 7.3) dying fast, slow-beating pairs, and the hard mallet's 「叩」 (a short band of noise + a low tock).
   */
  function qing(f, dur, { seed = 'qg', t60 = 2.2, bright = 1, tick = -12 } = {}) {
    const R = [[1, 1, 1], [1.505, 0.1, 0.32], [2.76, 0.34, 0.36], [3.98, 0.12, 0.22], [5.4, 0.16, 0.16], [7.3, 0.06, 0.1]], list = [];
    for (const [r, a, k] of R) { const amp = r === 1 ? a : a * bright; list.push([r, amp, t60 * k], [r * 1.0018, amp * 0.45, t60 * k * 0.85]); }
    const t = lib.noiseBurst({ dur: 0.016, attack: 0.0002, decay: 0.003, bp: Math.min(7000, f * 2.4), q: 0.9, seed: seed + 't' });
    const tock = parts(0.08, f * 0.5, [[1, 1, 0.03], [2.3, 0.4, 0.02]], seed + 'k');
    return lib.mix([{ buf: parts(dur, f, list, seed) }, { buf: t, gain: tick }, { buf: tock, gain: tick - 8 }]);
  }
  /** 分光 glints: tiny glass pings in order (a rainbow run), `step` s apart, each a little quieter (`fall` dB). */
  function glints(notes, step, { seed = 'gt', t60 = 0.16, fall = 1.2, jitter = 0.002, pans = null } = {}) {
    const r = rng(seed);
    return lib.mix(notes.map((f, i) => ({ buf: parts(t60 * 3, f, [[1, 1, t60], [2.32, 0.3, t60 * 0.5], [4.25, 0.12, t60 * 0.3]], `${seed}${i}`),
      at: Math.max(0, i * step + r.range(-jitter, jitter)), gain: -i * fall + r.range(-1.5, 0), ...(pans ? { pan: pans[i] } : {}) })), pans ? { channels: 2 } : {});
  }
  /** Scattered crystal pings (porcelain / glass dust): n pings over dur, thinning out. */
  function tinkles(dur, n, { lo = 2500, hi = 8000, t60 = 0.12, seed = 'tk', fall = 8, skew = 1.6 } = {}) {
    const r = rng(seed), out = [];
    for (let i = 0; i < n; i++) {
      const base = lo * Math.pow(hi / lo, r.next()), at = Math.pow(r.next(), skew) * dur;
      out.push({ buf: parts(t60 * 3, base, [[1, 1, t60], [2.41, 0.35, t60 * 0.6], [3.87, 0.18, t60 * 0.4]], `${seed}${i}`), at, gain: -r.next() * 9 - (at / dur) * fall });
    }
    return lib.mix(out, { length: dur + t60 * 3 });
  }
  /**
   * The iridescent sheen (分光): bright noise through a feedback comb whose delay moves (d(t) s) — a moving harmonic
   * series of resonances sweeping through the band like light through a prism.
   */
  function sheen(dur, { seed = 'sh', d = (t) => 0.0004 + 0.0025 * (0.5 - 0.5 * Math.cos(2 * Math.PI * 1.5 * t)), fb = 0.72, hp = 2200, lp = 14000 } = {}) {
    const x = lib.eq(lib.noise(dur, { color: 'white', seed }), [{ type: 'hp', f: hp, order: 2 }, { type: 'lp', f: lp, order: 2 }]).data[0];
    const n = x.length, y = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const j = i - d(i / SR) * SR, k = Math.floor(j), f = j - k;
      const yd = k >= 1 ? y[k] * (1 - f) + y[Math.min(k + 1, i - 1)] * f : 0;
      y[i] = x[i] + fb * yd;
    }
    return norm(lib.fadeOut(lib.eq(new Buf([y], SR), [{ type: 'hp', f: hp * 0.8, order: 2 }]), Math.min(0.12, dur * 0.25), 'sine'));
  }
  /**
   * The projected edge (the coloured trail): a crystalline sine set gliding with the blade's doppler — up `up` st to
   * the pass (`peak`), falling `down` st away. 虹 warm (sub-octave, octave, a soft fifth), 霓 cool (bar modes, airy).
   */
  function edge(dur, peak, f0, { up = 2, down = -6, warm = true, sharp = 2, fall = 7, beat = 0.006 } = {}) {
    const f = (t) => f0 * 2 ** ((t < peak ? -1.5 + (up + 1.5) * (t / peak) : up + (down - up) * Math.min(1, (t - peak) / Math.max(1e-3, dur - peak))) / 12);
    const e = (t) => (t < peak ? (t / peak) ** sharp : Math.exp(-(t - peak) * fall / Math.max(1e-3, dur - peak)));
    const list = warm ? [[1, 1], [0.5, 0.3], [1.5, 0.22], [2, 0.3], [3, 0.1]] : [[1, 1], [2, 0.18], [2.756, 0.38], [4, 0.12], [5.404, 0.16]];
    const layers = [];
    for (const [r, a] of list) {
      if (f0 * r * 1.3 > NYQ) continue;
      layers.push({ buf: lib.tone(dur, { freq: (t) => f(t) * r }), gainLin: a }, { buf: lib.tone(dur, { freq: (t) => f(t) * r * (1 + beat) }), gainLin: a * 0.6 });
    }
    return lib.automate(lib.mix(layers), e);
  }
  /** Swept band-noise whoosh peaking at `peak`: centre f0 -> fp (at the peak) -> f1. */
  function swoosh(dur, peak, [f0, fp, f1], { q = 1.6, color = 'pink', seed = 'sw', rise = 2, fall = 6 } = {}) {
    const F = (t) => (t < peak ? f0 * (fp / f0) ** (t / peak) : fp * (f1 / fp) ** ((t - peak) / (dur - peak)));
    const s = lib.sweep(lib.noise(dur, { color, seed }), 'bp', F, { q });
    return lib.automate(s, (t) => (t < peak ? (t / peak) ** rise : Math.exp(-(t - peak) * fall / (dur - peak))));
  }
  /**
   * 出鞘 / 刃擦: steel sliding on steel — noise rung through the blade's own modes (narrow bands gliding as the contact
   * point slides), a bright hiss and grit swelling to the tip, then the blade ringing free.
   */
  function shing(dur, f, { seed = 'sg', ring = -4, t60 = 0.8, bright = 1, glide = 0.06, grit = -14 } = {}) {
    const modes = [2.756, 5.404, 8.933].map((r) => f * r).filter((x) => x < NYQ * 0.85);
    const nz = lib.noise(dur, { color: 'white', seed });
    const bands = modes.map((m, i) => ({ buf: norm(lib.sweep(nz, 'bp', (t) => m * (1 + glide * t / dur), { q: 16 })), gain: -i * 2 }));
    const hiss = lib.eq(lib.noise(dur, { color: 'white', seed: seed + 'h' }), [{ type: 'hp', f: 3500, order: 2 }]);
    const gr = lib.crackle(dur, { density: 160, decay: 0.0015, hp: 3000, seed: seed + 'g' });
    const fr = lib.automate(lib.mix([...bands, { buf: norm(hiss), gain: -7 }, { buf: norm(gr), gain: grit }]),
      (t) => (0.15 + 0.85 * smooth(t / (dur * 0.85))) * (t > dur * 0.88 ? Math.max(0, (dur - t) / (dur * 0.12)) : 1));
    const rg = blade(f, Math.max(0.5, t60 * 1.4), { t60, bright, seed: seed + 'r' });
    return lib.mix([{ buf: norm(fr) }, { buf: norm(rg), at: dur * 0.86, gain: ring }]);
  }
  /** Spinning sabres: a whoosh every half turn (the blade, then the lighter ring-pommel side), `rate(t)` turns / s. */
  function whirr(D, rate, { seed = 'wr', lo = 400, hi = 1500, ring = -7 } = {}) {
    const out = [];
    let t = 0, i = 0;
    while (t < D - 1e-6) {
      const f = rate(t), per = 1 / f, r = rng(`${seed}${i}`);
      const d1 = Math.min(0.2, per * 0.9), d2 = Math.min(0.16, per * 0.7);   // (peaks kept inside: slow spins)
      out.push({ buf: swoosh(d1, Math.min(per * 0.35, d1 * 0.45), [lo, hi * r.range(0.9, 1.1), lo * 0.9], { q: 1.2, seed: `${seed}h${i}`, rise: 2, fall: 5 }), at: t, gain: r.range(-1, 0) });
      out.push({ buf: swoosh(d2, Math.min(per * 0.3, d2 * 0.45), [lo * 1.4, hi * 1.6, lo * 1.3], { q: 1.4, color: 'white', seed: `${seed}k${i}`, rise: 2, fall: 6 }), at: t + per / 2, gain: ring });
      t += per; i++;
    }
    return lib.mix(out, { length: D + 0.2 });
  }
  /** Low impact: pitched-down thump with harmonics so laptop speakers carry it. */
  const boom = (seed, { f0 = 75, f1 = 42, sweep = 0.06, decay = 0.5, drive = 2.5, amount = -3.5 } = {}) => lib.psychoBass(lib.thump({ f0, f1, sweep, decay, click: 0.1, drive, seed }), { freq: 110, amount });
  /** Brown-noise rumble under `lp` Hz, rising in `a` s and dying with t60. */
  const rumble = (dur, seed, { lp = 200, a = 0.02, t60 = 1.2 } = {}) => lib.automate(lib.eq(lib.noise(dur, { color: 'brown', seed }), [{ type: 'lp', f: lp, order: 2 }, { type: 'hp', f: 30, order: 2 }]), (t) => Math.min(1, t / a) * Math.exp(-t * 6.9 / t60));
  /** §1.12 「貴氣瞬態」: a 30 ms 6-10 kHz glint (a band of noise + a 7 kHz ping), mixed ~12 dB under the hit. */
  const lux = (seed) => lib.mix([{ buf: lib.noiseBurst({ dur: 0.03, attack: 0.0004, decay: 0.006, bp: 8000, q: 1.1, seed }) }, { buf: parts(0.05, 7040, [[1, 1, 0.03], [1.41, 0.4, 0.02]], seed + 'p'), gain: -6 }]);
  /** Dust thrown up: a band of pink noise opening and settling. */
  const dust = (dur, seed, { f = 1100, a = 0.03, t60 = 0.6 } = {}) => lib.automate(lib.eq(lib.noise(dur, { color: 'pink', seed }), [{ type: 'bp', f, q: 0.6 }]), (t) => Math.min(1, t / a) * Math.exp(-t * 6.9 / t60));
  /**
   * A plucked zither string (Karplus-Strong, fractional delay; `pick` = the plucking point: a comb on the excitation, near
   * the bridge = thin and bright), a small soundboard.
   */
  function pluck(f, dur, { t60 = 1.8, bright = 0.7, pick = 0.14, seed = 'pl', lp = 8000 } = {}) {
    const n = Math.round(dur * SR), y = new Float32Array(n), r = rng(seed);
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
    const b = lib.eq(new Buf([y], SR), [{ type: 'hp', f: f * 0.55, order: 2 }, { type: 'peak', f: 280, gain: 2.5, q: 1 }, { type: 'peak', f: 2600, gain: 2.5, q: 1.1 }, { type: 'lp', f: lp, order: 2 }]);
    return norm(lib.fadeOut(b, Math.min(0.15, dur * 0.3), 'exp'));
  }
  /**
   * A Shepard-Risset glissando: `oct` sine partials an octave apart sliding up an octave every T s under a fixed window
   * on log-frequency — a tone that rises for ever, exactly periodic in T (each partial's phase is a function of its
   * frequency alone).
   */
  function shepard(dur, { f0 = 55, T = 2, oct = 7, centre = 4, width = 1.2 } = {}) {
    const n = Math.round(dur * SR), o = new Float32Array(n), K2 = T / Math.LN2;
    for (let k = 0; k < oct; k++) for (let i = 0; i < n; i++) {
      const t = i / SR, u = (k + t / T) % oct, f = f0 * 2 ** u;
      const a = Math.exp(-(((u - centre) / width) ** 2)) * Math.sin(Math.PI * u / oct) ** 2;
      o[i] += a * Math.sin(2 * Math.PI * ((K2 * f) % 1e6));
    }
    return norm(new Buf([o], SR));
  }
  /** Tubular bell (VSCO 2 C5 take) retuned to `hz`, cut to `len` s with a decay. */
  let tbSrc = null;
  async function tubular(hz, len = 2.2, { t60 = 2.4, hp = 150 } = {}) {
    if (!tbSrc) tbSrc = strike(await ld(X.tbC5, 0, 5, { stereo: true, hp: 80, fadeOut: 0.6 }));
    const b = lib.varispeed(tbSrc, hz / 523.25);
    return lib.decay(lib.eq(cut(b, len, 0.3), [{ type: 'hp', f: hp, order: 2 }]), t60, 0.05);
  }
  /** Twin (夜曜) version: -4 st, darker, a dotted echo (§1.12 雙生版). */
  const twin = (b) => {
    let o = lib.varispeedSemis(b, -4);
    o = lib.eq(o, [{ type: 'lp', f: 7000, order: 2 }, { type: 'peak', f: 380, gain: 1.5, q: 0.8 }]);
    o = lib.saturate(o, { drive: 3, type: 'tube', mix: 0.3 });
    return lib.echo(o, { time: 0.19, feedback: 0.36, lp: 2800, hp: 200, mix: 0.4, pingpong: o.channels === 2, length: o.duration + 0.9 });
  };
  return { K, rng, norm, mono, clamp, smooth, ld, strike, peakTime, alignAt, cut, env, verb, shape, shapeLog, atLufs, tight, panMove, wrap, onGrid, seamless, seamCheck,
    parts, blade, glass, qing, glints, tinkles, sheen, edge, swoosh, shing, whirr, boom, rumble, lux, dust, pluck, shepard, tubular, twin };
}

// ---------------------------------------------------------------------------------------------- swings
/** air sources for the passes: the four katana passes, a clean fast swoosh, a knife slash, a small knife whoosh */
async function airSources(H) {
  const air = [];
  for (const [a, z] of KATANA) air.push(await H.ld(X.katana, a, z, { hp: 380 }));
  air.push(await H.ld(X.swoosh, 0.2, 0.72, { hp: 350 }));
  air.push(await H.ld(X.slash, 0.0, 0.27, { hp: 450 }));
  air.push(await H.ld(X.knifeWh, 0.4, 0.8, { hp: 500 }));
  return { whoom: await H.ld(X.whoom, 0, 0.557, { hp: 60 }), air };
}
/**
 * One sabre pass: P = where the blade crosses the middle of the view (the cut lands), D = length. A thin, fast blade:
 * the sword air sped up, the edge's narrow whistle, the hiss, a little body; the coloured trail (the edge zing, the
 * sheen and the glint run: 虹 falls, 霓 climbs) burning after the pass; a light push; the §1.12 luxury tick.
 * hand 'R' sweeps right -> left, 'L' left -> right; panFn overrides the sweep.
 */
function swingVariant(lib, H, src, k, { hand = 'R', P = 0.05, D = 0.46, heavy = 0, pan = 0.55, seed = 'sw', trail = -11, panFn = null } = {}) {
  const r = H.rng(`${seed}${hand}${k}`), R = hand === 'R', f0 = (R ? HONG : NI) * r.range(0.997, 1.003);
  const air = lib.varispeedSemis(src.air[k % src.air.length], (R ? 1 : 2.5) - heavy * 2 + r.range(-0.7, 0.7));
  const whoom = lib.varispeedSemis(src.whoom, (R ? 0.5 : 2) - heavy * 3 + r.range(-0.8, 0.8));
  const hiss = H.swoosh(D, P + 0.004, R ? [1700, 5200, 2300] : [2300, 7200, 3000], { q: 1.2, color: 'white', seed: `${seed}h${hand}${k}`, rise: 3, fall: 10 });
  const whistle = H.swoosh(D, P + 0.002, R ? [1500, 2700 * r.range(0.94, 1.06), 1400] : [2000, 3600 * r.range(0.94, 1.06), 1800], { q: 9, seed: `${seed}w${hand}${k}`, rise: 2.5, fall: 12 });
  const body = H.swoosh(D, P, [140, 380 + heavy * 80, 120], { q: 0.9, seed: `${seed}b${hand}${k}`, rise: 2.2, fall: 8 });
  const zing = H.edge(D, P + 0.006, f0, { warm: R, up: 2, down: -6, fall: 6 });
  const run = H.glints(R ? pent(N.A6, 6).reverse() : pent(N.Cs7, 6), 0.02, { seed: `${seed}g${hand}${k}`, t60: 0.15 });
  const sh = lib.automate(H.sheen(D, { seed: `${seed}s${hand}${k}`, d: R ? (t) => 0.0004 + 0.006 * t : (t) => Math.max(0.0003, 0.0032 - 0.006 * t) }),
    (t) => H.smooth((t - P + 0.012) / 0.03) * Math.exp(-Math.max(0, t - P) * 9));
  const push = lib.thump({ f0: 130, f1: 70, sweep: 0.03, decay: 0.07, click: 0, drive: 1.2, seed: `${seed}p${hand}${k}` });
  const p = panFn || ((t) => (R ? 1 : -1) * (pan - 2 * pan * H.smooth((t - P + 0.05) / 0.11)));
  const moving = H.panMove(lib.mix([H.alignAt(air, P, 0), { buf: H.norm(hiss), gain: -5 }, { buf: H.norm(whistle), gain: -15 }, { buf: H.norm(zing), gain: trail }, { buf: H.norm(sh), gain: -17 }], { length: D }), p);
  const centre = lib.mix([H.alignAt(H.norm(whoom), P, -4 + heavy * 2), { buf: H.norm(body), gain: -8 + heavy * 2 }, { buf: push, at: Math.max(0, P - 0.02), gain: -16 + heavy * 4 },
    { buf: H.lux(`${seed}x${hand}${k}`), at: P, gain: -16 }], { length: D });
  let v = lib.mix([{ buf: lib.stereoize(centre, { width: 0.15, hp: 400, seed: `${seed}c${hand}${k}` }) }, { buf: moving },
    { buf: lib.stereoize(H.norm(run), { width: 0.6, hp: 2000, seed: `${seed}r${hand}${k}` }), at: P + 0.012, gain: -21 }], { channels: 2, length: D });
  v = lib.eq(v, [{ type: 'hp', f: 60, order: 2 }, { type: 'peak', f: 180, gain: 1.5, q: 0.9 }, { type: 'peak', f: 3200, gain: 2.5, q: 0.8 }, { type: 'highshelf', f: 6000, gain: R ? 1 : 2.5 }]);
  v = H.K.balance(v, { ...BAL.swing, high: BAL.swing.high + (R ? 0 : 1), air: BAL.swing.air + (R ? 0 : 1.5) }, 0.8);   // 霓 a shade brighter
  return H.cut(H.verb(v, 'urban', 0.08, 0.7, `${seed}v${hand}${k}`), D, 0.35);
}

async function swings(lib, ctx, cat, H, keep) {
  const src = await airSources(H);
  // 疾虹 ①③ (虹) and ②④ (霓): the handler starts the cue c.hit * 0.4 = 0.032-0.036 s into the cut, so the pass
  // peaks 0.05 s in (the hit frame); every variant is a different air source / pitch / whistle
  for (const hand of ['R', 'L']) {
    const out = [];
    for (let k = 0; k < 6; k++) out.push(H.shape(swingVariant(lib, H, src, k + (hand === 'L' ? 3 : 0), { hand }), -16));
    await cat.add(`twinblades_swing_${hand.toLowerCase()}`, out, { lufs: -16, spatial: false, channels: 2, voices: 3, pitch: [0.98, 1.02], sources: [X.whoom, X.katana, X.swoosh, X.slash, X.knifeWh] });
    keep[`swing${hand}`] = out;
  }

  // 交虹 ⑤ (cue 0.088 s in, the blades cross at 0.22: the passes peak 0.132 s in): the two sabres raised over the
  // shoulders (a short in-breath of air), then both coming down and in from either side to the middle, heavier
  const cross = [];
  for (let k = 0; k < 4; k++) {
    const P = 0.132, D = 0.62;
    const a = swingVariant(lib, H, src, k, { hand: 'R', P, D, heavy: 1, seed: 'swx', panFn: (t) => 0.65 * (1 - H.smooth((t - P + 0.07) / 0.09)) });
    const b = swingVariant(lib, H, src, k + 3, { hand: 'L', P: P + 0.004, D, heavy: 1, seed: 'swx', panFn: (t) => -0.65 * (1 - H.smooth((t - P + 0.07) / 0.09)) });
    const raise = lib.reverse(H.swoosh(0.12, 0.03, [2600, 1400, 500], { q: 1, color: 'white', seed: `swxr${k}`, fall: 3 }));
    const whump = H.boom(`swxb${k}`, { f0: 120, f1: 55, sweep: 0.04, decay: 0.16, drive: 1.8 });
    const v = lib.mix([{ buf: a, gain: -1 }, { buf: b, gain: -1 }, { buf: H.norm(raise), gain: -18 }, { buf: whump, at: P - 0.015, gain: -14 }], { channels: 2 });
    cross.push(H.shape(H.cut(v, D, 0.35), -15));
  }
  await cat.add('twinblades_swing_cross', cross, { lufs: -15, spatial: false, channels: 2, voices: 2, pitch: [0.98, 1.02], sources: [X.whoom, X.katana, X.swoosh, X.slash, X.knifeWh] });
  keep.cross = cross;

  // def.sound contract (a remote "shot" = a cut; the special never sends one, so these are a safety net)
  const close = [keep.swingR[0], keep.swingL[0], keep.swingR[1]].map((b) => H.cut(H.mono(b), 0.42, 0.3));
  await cat.add('twinblades_close', close, { lufs: -18, spatial: true, channels: 1, range: [3, 40], voices: 3, pitch: [0.95, 1.05], sources: [X.whoom, X.katana] });
  const tail = [keep.swingR[0], keep.swingL[0]].map((b, k) => lib.fadeIn(H.mono(lib.reverb(lib.slice(b, 0, 0.25), 'alley', { wet: 1, dry: 0, seed: `tbt${k}`, length: 0.7, channels: 1 })), 0.02));
  await cat.add('twinblades_tail', tail, { target: 'gunTail', vol: 0.25, spatial: false, channels: 1, voices: 2, pitch: [0.95, 1.05], maxHeadMs: 40, sources: [X.whoom, X.katana] });
  const far = [keep.swingR[2], keep.swingL[2]].map((b) => lib.eq(H.mono(b), [{ type: 'lp', f: 2600, order: 2 }, { type: 'hp', f: 200, order: 2 }]));
  await cat.add('twinblades_far', far, { target: 'gunFar', vol: 0.4, spatial: true, channels: 1, range: [10, 40], voices: 2, pitch: [0.94, 1.06], sources: [X.whoom, X.katana] });
}

// ---------------------------------------------------------------------------------------------- hits
async function hitSources(H) {
  return {
    cuts: [await H.ld(X.gash, 0.01, 0.37, { hp: 300 }), await H.ld(X.slice, 0.05, 0.62, { hp: 260 }), await H.ld(X.slash, 0.02, 0.26, { hp: 500 })],
    meats: [await H.ld(X.meaty, 0, 0.48, { hp: 90 }), await H.ld(X.wet, 0.07, 0.54, { hp: 90 }), await H.ld(X.gross, 0.0, 0.62, { hp: 90 })],
    bones: [await H.ld(X.fracture, 0, 0.32, { hp: 200 }), await H.ld(X.boneSnap, 0, 0.7, { hp: 200 })],
  };
}

async function hits(lib, ctx, cat, H, keep) {
  const S = await hitSources(H);
  // twinblades_hit (2D, once per connecting cut; the handler pitches it 0.96 for 虹 / 1.08 for 霓): a thin edge
  // biting — the slice 「嗤」, the meat, a punch of mass, the blade ringing on the contact, a prism zap (a short glint
  // run + sheen burst) and the §1.12 luxury tick on the front
  const hit = [];
  for (let k = 0; k < 6; k++) {
    const r = H.rng(`hit${k}`), f = k % 2 ? NI : HONG;
    const v = lib.mix([
      { buf: H.strike(lib.varispeedSemis(S.cuts[k % 3], r.range(0, 2))) },
      { buf: H.strike(lib.varispeedSemis(S.cuts[(k + 1) % 3], r.range(1, 3))), at: 0.004, gain: -9 },
      { buf: H.strike(S.meats[k % 3]), at: 0.003, gain: -4 },
      { buf: H.strike(S.bones[k % 2]), at: 0.008, gain: -15 },
      { buf: lib.thump({ f0: 165, f1: 70, sweep: 0.025, decay: 0.09, click: 0.25, drive: 2, seed: `hb${k}` }), gain: -5 },
      { buf: H.K.crack(`hc${k}`, { dur: 0.01, decay: 0.0025, hp: 2500 }), gain: -9 },
      { buf: H.norm(H.blade(f, 0.6, { t60: 0.24, bright: 1.1, seed: `hr${k}` })), at: 0.002, gain: -15 },
      { buf: H.norm(H.glints(k % 2 ? pent(N.A7, 4) : pent(N.A7, 4).reverse(), 0.011, { seed: `hg${k}`, t60: 0.1 })), at: 0.006, gain: -19 },
      { buf: H.norm(lib.automate(H.sheen(0.2, { seed: `hs${k}`, d: (t) => 0.0006 + 0.004 * t }), (t) => Math.exp(-t * 18))), at: 0.004, gain: -21 },
      { buf: H.lux(`hx${k}`), gain: -13 },
    ]);
    const e = H.K.balance(lib.eq(v, [{ type: 'hp', f: 55, order: 2 }, { type: 'peak', f: 220, gain: 2, q: 0.9 }, { type: 'peak', f: 3500, gain: 2, q: 0.9 }]), BAL.hit, 0.75);
    hit.push(H.shape(H.cut(lib.stereoize(H.verb(e, 'smallRoom', 0.08, 0.35, `hv${k}`, 1), { width: 0.25, hp: 1200, seed: `hst${k}` }), 0.5, 0.45), -16));
  }
  await cat.add('twinblades_hit', hit, { lufs: -16, spatial: false, channels: 2, voices: 4, pitch: [0.97, 1.03], priority: 2, sources: [X.gash, X.slice, X.slash, X.meaty, X.wet, X.gross, X.fracture, X.boneSnap] });
  keep.hit = hit;

  // twinblades_hit_flesh: one body (up to three a cut, pitched 0.95-1.25 by the handler; also the dash's pass cuts)
  const flesh = [];
  for (let k = 0; k < 5; k++) {
    const r = H.rng(`hf${k}`);
    const v = lib.mix([{ buf: H.strike(lib.varispeedSemis(S.cuts[k % 3], r.range(-1, 1))) }, { buf: H.strike(S.meats[(k + 1) % 3]), at: 0.003, gain: -2 },
      { buf: H.strike(S.bones[k % 2]), at: 0.008, gain: -14 }, { buf: lib.thump({ f0: 150, f1: 70, sweep: 0.02, decay: 0.07, click: 0.2, drive: 1.8, seed: `hfb${k}` }), gain: -10 }]);
    flesh.push(H.shape(H.cut(H.K.balance(v, BAL.cut, 0.7), 0.42, 0.45), -17));
  }
  await cat.add('twinblades_hit_flesh', flesh, { lufs: -17, spatial: true, range: [3, 45], voices: 5, pitch: [0.97, 1.03], sources: [X.gash, X.slice, X.slash, X.meaty, X.wet, X.gross, X.fracture, X.boneSnap] });
  keep.flesh = flesh;

  // twinblades_hit_wall: the sabre's edge on stone — a thin steel 「鏘」 (the blade ringing high, not a heavy clang), a
  // stone tick and chips, sparks
  const wall = [];
  const conc = await H.ld(X.concHit, 0, 0.47, { hp: 150 });
  const chips = await H.ld(X.stoneDebris, 0, 0.39, { hp: 400 });
  for (let k = 0; k < 5; k++) {
    const r = H.rng(`wall${k}`), f = k % 2 ? NI : HONG;
    const sparks = lib.automate(lib.crackle(0.3, { density: 190, decay: 0.0018, hp: 4000, seed: `wsp${k}` }), (t) => Math.exp(-t * 14));
    const v = lib.mix([
      { buf: H.strike(await H.ld(X.metalL(k), 0, 0.3, { hp: 700, semis: r.range(1, 3) })) },
      { buf: H.strike(await H.ld(X.metalHit, 0, 0.3, { hp: 500, semis: r.range(1, 3) })), gain: -5 },
      { buf: H.norm(H.blade(f, 0.9, { t60: 0.5, bright: 1.25, seed: `wr${k}` })), at: 0.002, gain: -6 },
      { buf: H.K.crack(`wcr${k}`, { dur: 0.01, decay: 0.0025, hp: 3000 }), gain: -8 },
      { buf: H.strike(conc), gain: -7 },
      { buf: H.norm(sparks), at: 0.004, gain: -12 },
      { buf: H.strike(chips), at: 0.015, gain: -12 },
    ]);
    const e = lib.eq(v, [{ type: 'hp', f: 90, order: 2 }, { type: 'peak', f: 3000, gain: 2, q: 0.8 }]);
    wall.push(H.shape(H.cut(H.verb(e, 'alley', 0.14, 0.7, `wv${k}`, 1), 0.75, 0.45), -18, { max: 6 }));
  }
  await cat.add('twinblades_hit_wall', wall, { lufs: -18, vol: 1.3, spatial: true, range: [3, 50], voices: 3, pitch: [0.96, 1.04], sources: [X.metalL(0), X.metalHit, X.concHit, X.stoneDebris] });

  // twinblades_kill: 雙聲刀鳴 — the two sabres answering each other (虹, then 霓 28 ms later) on a pentatonic pair, the
  // KE_PRISM chips (a glint run up the spectrum, a glass sprinkle, the sheen), a soft low whump under it
  const kill = [];
  const pairs = [[N.A5, N.Cs6], [N.B5, N.E6], [N.Cs6, N.Fs6], [N.E6, N.A6]];
  for (let k = 0; k < 4; k++) {
    const [a, b] = pairs[k];
    const v = lib.mix([
      { buf: H.norm(H.blade(a, 1.3, { t60: 0.95, bright: 1.1, seed: `ka${k}` })), gain: -1 },
      { buf: H.norm(H.blade(b, 1.3, { t60: 0.95, bright: 1.15, seed: `kb${k}` })), at: 0.028, gain: -2 },
      { buf: H.K.crack(`kc${k}`, { dur: 0.008, decay: 0.002, hp: 3500 }), gain: -12 },
      { buf: H.norm(H.glass(a * 2, 0.8, { t60: 0.5, seed: `kg${k}` })), at: 0.03, gain: -13 },
      { buf: H.norm(H.glints(pent(a * 2, 7), 0.014, { seed: `kr${k}`, t60: 0.14 })), at: 0.02, gain: -13 },
      { buf: H.strike(await H.ld(X.glassL(k), 0, 0.25, { hp: 1500, semis: 5 })), at: 0.035, gain: -17 },
      { buf: H.norm(lib.automate(H.sheen(0.5, { seed: `ks${k}`, d: (t) => 0.0003 + 0.005 * t }), (t) => Math.min(1, t / 0.02) * Math.exp(-t * 8))), at: 0.02, gain: -19 },
      { buf: lib.thump({ f0: 110, f1: 55, sweep: 0.03, decay: 0.14, click: 0, drive: 1.5, seed: `kt${k}` }), gain: -12 },
    ]);
    kill.push(H.cut(H.verb(v, 'warehouse', 0.18, 1.1, `kv${k}`, 1, 500), 1.25, 0.4));
  }
  await cat.add('twinblades_kill', kill, { lufs: -19, vol: 1.4, spatial: true, range: [5, 50], voices: 3, pitch: [1, 1], sources: [X.glassL(0)] });
  keep.kill = kill;

  // twinblades_sever: 斷肢 — the edge goes clean through: a fast cut, bone snapping, the wet tear, the blade's zing
  const gores = [await H.ld(X.splat, 0, 0.7, { hp: 100 }), await H.ld(X.gore, 0, 0.7, { hp: 100 })];
  const neck = await H.ld(X.neck, 0.53, 1.14, { hp: 160 });
  const zingRec = await H.ld(X.slash, 0.3, 0.49, { hp: 2500 });
  const sev = [];
  for (let k = 0; k < 4; k++) {
    const r = H.rng(`sev${k}`);
    const v = lib.mix([
      { buf: H.strike(lib.varispeedSemis(S.cuts[k % 3], r.range(-1, 1))) },
      { buf: H.strike(k % 2 ? neck : S.bones[k % 2]), at: 0.006, gain: -2 },
      { buf: H.strike(gores[k % 2]), at: 0.012, gain: -5 },
      { buf: lib.thump({ f0: 130, f1: 55, sweep: 0.03, decay: 0.16, click: 0.2, drive: 2, seed: `svb${k}` }), gain: -8 },
      { buf: H.strike(zingRec), at: 0.004, gain: -12 },
      { buf: H.norm(H.blade(k % 2 ? NI : HONG, 0.6, { t60: 0.3, seed: `svr${k}` })), at: 0.004, gain: -17 },
    ]);
    sev.push(H.shape(H.cut(H.verb(H.K.balance(v, BAL.cut, 0.7), 'alley', 0.1, 0.6, `svv${k}`, 1), 0.8, 0.45), -17));
  }
  await cat.add('twinblades_sever', sev, { lufs: -17, spatial: true, range: [4, 50], voices: 3, pitch: [0.95, 1.05], sources: [X.gash, X.slice, X.slash, X.fracture, X.boneSnap, X.neck, X.splat, X.gore] });

  // twinblades_clash: 雙刀交擊「錚」＋和聲 (交虹 ⑤ as the blades cross, the first draw, the ready rub) — a bright steel
  // strike, both sabres ringing the major third (虹 a little right, 霓 a little left), the overtone chord above them
  // (glass A6 C#7 E7), a starburst of glints up and back, a small low knock
  const clash = [];
  const cup = await H.ld(X.cup, 0.27, 0.7, { hp: 600, semis: 2 });
  for (let k = 0; k < 3; k++) {
    const r = H.rng(`cl${k}`);
    const burst = [...pent(N.A7, 4), ...pent(N.A7, 3).reverse()];
    const v = lib.mix([
      { buf: H.strike(await H.ld(X.metalL(k + 2), 0, 0.3, { hp: 900, semis: r.range(2, 4) })), gain: -2 },
      { buf: H.strike(cup), gain: -11 },
      { buf: H.K.crack(`clc${k}`, { dur: 0.008, decay: 0.002, hp: 3500 }), gain: -6 },
      { buf: H.norm(H.blade(HONG * r.range(0.998, 1.002), 1.6, { t60: 1.3, bright: 1.1, seed: `clr${k}` })), gain: -3, pan: 0.35 },
      { buf: H.norm(H.blade(NI * r.range(0.998, 1.002), 1.6, { t60: 1.3, bright: 1.15, seed: `cll${k}` })), at: 0.004, gain: -3, pan: -0.35 },
      { buf: H.norm(H.glass(N.A6, 1.4, { t60: 1.0, seed: `clg1${k}` })), at: 0.008, gain: -16, pan: 0.2 },
      { buf: H.norm(H.glass(N.Cs7, 1.4, { t60: 0.9, seed: `clg2${k}` })), at: 0.01, gain: -17, pan: -0.2 },
      { buf: H.norm(H.glass(N.E7, 1.2, { t60: 0.8, seed: `clg3${k}` })), at: 0.012, gain: -20 },
      { buf: H.norm(H.glints(burst, 0.013, { seed: `clb${k}`, t60: 0.12, fall: 0.6, pans: burst.map((_, i) => Math.sin(i * 1.7) * 0.6) })), at: 0.008, gain: -18 },
      { buf: lib.thump({ f0: 150, f1: 75, sweep: 0.02, decay: 0.08, click: 0.2, drive: 1.5, seed: `clt${k}` }), gain: -14 },
    ], { channels: 2 });
    clash.push(H.cut(H.verb(v, 'warehouse', 0.14, 1.4, `clv${k}`), 1.5, 0.4));
  }
  await cat.add('twinblades_clash', clash, { lufs: -17, vol: 1.2, spatial: false, channels: 2, voices: 2, pitch: [0.99, 1.01], sources: [X.metalL(2), X.cup] });
  keep.clash = clash;
}

// ---------------------------------------------------------------------------------------------- 虹橋 / 虹貫
async function dash(lib, ctx, cat, H, keep) {
  const S = await hitSources(H);
  const src = await airSources(H);
  // twinblades_wave (虹橋, local 2D / teammates positional): the X of two crescents released at the crossing and tearing
  // away down the street at 18 m/s for 9 m — the release (both edges' zing, a forward whoosh, a low push), then its own
  // crystalline hum flying away (the dyad dopplering down, the band closing with distance), a glittering wake, and
  // the faint glassy dispersal at 9 m (0.5 s)
  const wave = [];
  for (let k = 0; k < 3; k++) {
    const r = H.rng(`wv${k}`), D = 1.0;
    const away = (t) => 1 / (1 + t * 7);
    const hum = lib.automate(lib.mix([{ buf: lib.tone(D, { freq: (t) => HONG * 2 ** (-1.2 * Math.min(1, t / 0.5) / 12) }) }, { buf: lib.tone(D, { freq: (t) => NI * 2 ** (-1.2 * Math.min(1, t / 0.5) / 12) }), gain: -1 },
      { buf: lib.tone(D, { freq: (t) => HONG * 2.756 * 2 ** (-1.2 * Math.min(1, t / 0.5) / 12) }), gain: -12 }]), (t) => H.smooth(t / 0.02) * away(t) * (t > 0.5 ? Math.exp(-(t - 0.5) * 9) : 1) * (0.8 + 0.2 * Math.sin(2 * Math.PI * 23 * t)));
    const roar = lib.sweep(lib.automate(lib.noise(D, { color: 'pink', seed: `wvn${k}` }), (t) => H.smooth(t / 0.03) * away(t) * (t > 0.5 ? Math.exp(-(t - 0.5) * 8) : 1)), 'bp', (t) => 1600 / (1 + t * 3), { q: 0.8 });
    const sh = lib.automate(H.sheen(D, { seed: `wvs${k}`, d: (t) => 0.0004 + 0.004 * t }), (t) => H.smooth(t / 0.03) * away(t) * (t > 0.5 ? Math.exp(-(t - 0.5) * 8) : 1));
    const wake = H.glints(pent(N.A6, 8).map((f, i) => (i % 2 ? f : f * 2)), 0.055, { seed: `wvg${k}`, t60: 0.14, fall: 2 });
    const v = lib.mix([
      H.alignAt(lib.varispeedSemis(src.air[k + 4], 1 + r.range(-0.5, 0.5)), 0.03, -2),
      { buf: H.norm(H.edge(0.6, 0.02, HONG, { warm: true, up: 1, down: -9, fall: 5 })), gain: -7 },
      { buf: H.norm(H.edge(0.6, 0.024, NI, { warm: false, up: 1, down: -9, fall: 5 })), gain: -8 },
      { buf: H.norm(H.swoosh(0.7, 0.04, [300, 1500, 400], { q: 0.8, seed: `wvw${k}`, rise: 1.5, fall: 5 })), gain: -5 },
      { buf: lib.thump({ f0: 120, f1: 60, sweep: 0.03, decay: 0.12, click: 0.1, drive: 1.6, seed: `wvt${k}` }), gain: -11 },
      { buf: H.norm(hum), at: 0.02, gain: -11 },
      { buf: H.norm(roar), at: 0.02, gain: -10 },
      { buf: H.norm(sh), at: 0.01, gain: -15 },
      { buf: H.norm(wake), at: 0.06, gain: -19 },
      { buf: H.norm(H.tinkles(0.35, 8, { seed: `wvd${k}`, lo: 3000, hi: 8000 })), at: 0.5, gain: -24 },
      { buf: H.lux(`wvx${k}`), gain: -14 },
    ], { length: D });
    wave.push(H.shape(H.cut(H.verb(v, 'urban', 0.12, 0.9, `wvv${k}`, 1), D, 0.35), -16.5));
  }
  // (a release and a decaying flight: mastered 1.5 dB under and lifted with vol, so the limiter leaves the attack)
  await cat.add('twinblades_wave', wave, { lufs: -16.5, vol: 1.19, spatial: true, range: [6, 60], voices: 3, pitch: [0.98, 1.02], priority: 2, sources: [X.swoosh, X.slash, X.knifeWh] });
  keep.wave = wave;

  // twinblades_wave_hit: the X crescent slicing a body (≤ 3, pitched 0.95-1.15): a fast cut, a glass zap, the meat
  const wh = [];
  for (let k = 0; k < 4; k++) {
    const r = H.rng(`wh${k}`);
    const v = lib.mix([{ buf: H.strike(lib.varispeedSemis(S.cuts[k % 3], r.range(1, 3))) }, { buf: H.strike(S.meats[k % 3]), at: 0.004, gain: -4 },
      { buf: H.strike(await H.ld(X.glassL(k + 1), 0, 0.25, { hp: 1500, semis: 3 })), gain: -10 },
      { buf: H.norm(H.glints(pent(N.Cs7, 4), 0.01, { seed: `whg${k}`, t60: 0.09 })), at: 0.004, gain: -16 },
      { buf: lib.thump({ f0: 150, f1: 70, sweep: 0.02, decay: 0.06, click: 0.2, drive: 1.6, seed: `wht${k}` }), gain: -11 }]);
    wh.push(H.shape(H.cut(H.K.balance(v, BAL.cut, 0.7), 0.4, 0.45), -17));
  }
  await cat.add('twinblades_wave_hit', wh, { lufs: -17, spatial: true, range: [3, 45], voices: 3, pitch: [0.97, 1.03], sources: [X.gash, X.slice, X.slash, X.meaty, X.wet, X.gross, X.glassL(1)] });

  // twinblades_dash_charge (虹貫 stance, loop; the handler plays it at 0.5 and rate 0.85 -> 1.2 over 0.6 s): 吸氣式上升
  // 音 — two Shepard-Risset glass hums a major third apart (虹 right, 霓 left) rising for ever, an inhale of air (three
  // noise bands climbing the same way), the projected blades' fizz, a slow two-beat pulse. Periodic in P = 2 s.
  {
    const P = 2, X2 = 0.5, W = 0.5, L = P + X2;
    const shA = H.shepard(W + P, { f0: H.onGrid(N.A1, P), T: P, oct: 7, centre: 4.1, width: 1.0 });
    const shC = H.shepard(W + P, { f0: H.onGrid(N.Cs2, P), T: P, oct: 7, centre: 3.8, width: 1.0 });
    const glassy = (b) => lib.eq(lib.saturate(b, { drive: 3, type: 'tube', mix: 0.35 }), [{ type: 'hp', f: 120, order: 2 }]);
    const pulse = H.wrap(lib.mix([0, 1].map((i) => ({ buf: lib.thump({ f0: 80, f1: 46, sweep: 0.04, decay: 0.3, click: 0, drive: 1.4, seed: `dcp${i}` }), at: i * P / 2, gain: i ? -3 : 0 })), { length: P + 0.5 }), P);
    const tonal = lib.mix([{ buf: H.norm(glassy(shA)), gain: -4, pan: 0.3 }, { buf: H.norm(glassy(shC)), gain: -5, pan: -0.3 },
      { buf: lib.pad(H.norm(lib.psychoBass(pulse, { freq: 110, amount: -6 })), W, 0), gain: -9 }], { channels: 2 });
    // the inhale: three bands of pink noise an octave apart sliding up an octave per P under a window (a noise Shepard)
    const inhale = [];
    for (let b = 0; b < 3; b++) {
      const u = (t) => (b + t / P) % 3;
      const band = lib.sweep(lib.noise(L, { color: 'pink', seed: `dci${b}` }), 'bp', (t) => 600 * 2 ** u(t), { q: 1.6 });
      inhale.push({ buf: lib.automate(band, (t) => Math.sin(Math.PI * u(t) / 3) ** 2) });
    }
    const fizz = lib.automate(lib.crackle(L, { density: 70, decay: 0.0012, hp: 5000, minAmp: 0.15, seed: 'dcf' }), (t) => 0.6 + 0.4 * Math.sin(2 * Math.PI * 6 * t));
    const noisy = lib.mix([{ buf: lib.stereoize(H.norm(lib.mix(inhale)), { width: 0.5, hp: 300, seed: 'dcis' }), gain: -5 }, { buf: lib.stereoize(H.norm(fizz), { width: 0.7, hp: 3000, seed: 'dcfs' }), gain: -15 }], { channels: 2, length: L });
    const v = H.seamless(P, X2, noisy, tonal, W);
    H.seamCheck('twinblades_dash_charge', v, 1);
    await cat.add('twinblades_dash_charge', v, { lufs: -18, loop: true, spatial: false, channels: 2, voices: 1, pitch: [1, 1] });
    keep.charge = v;
  }

  // twinblades_dash (虹貫, local 2D / teammates positional at the start): 拔刀斬＋破風 — both sabres drawn out of the
  // left-hip stance (two quick shings 30 ms apart), the air cracking open, the rush of 8 m in 0.2 s past the ears, the
  // two edges streaking (zings falling away), the sheen, a scuff of grit as the feet land
  const dsh = [];
  for (let k = 0; k < 3; k++) {
    const r = H.rng(`ds${k}`), D = 1.0;
    const rush = lib.automate(H.swoosh(D, 0.1, [260, 1600 * r.range(0.9, 1.1), 380], { q: 0.7, seed: `dsr${k}`, rise: 1.5, fall: 3.5 }), (t) => (t > 0.5 ? Math.exp(-(t - 0.5) * 6) : 1));
    const gust = lib.automate(await H.ld(X.wind, 1.2 + k * 1.3, 2.2 + k * 1.3, { hp: 250, lp: 7000 }), (t) => H.smooth(t / 0.04) * Math.exp(-t * 4));
    const sh = lib.automate(H.sheen(0.6, { seed: `dss${k}`, d: (t) => 0.0003 + 0.006 * t }), (t) => H.smooth(t / 0.05) * Math.exp(-Math.max(0, t - 0.08) * 7));
    const v = lib.mix([
      { buf: H.norm(H.shing(0.07, HONG, { seed: `dsa${k}`, ring: -8, t60: 0.5 })), gain: -5 },
      { buf: H.norm(H.shing(0.065, NI, { seed: `dsb${k}`, ring: -8, t60: 0.5 })), at: 0.03, gain: -6 },
      { buf: H.K.crack(`dsc${k}`, { dur: 0.022, decay: 0.006, hp: 700, lp: 7000 }), at: 0.03, gain: -7 },
      { buf: H.boom(`dsb${k}`, { f0: 140, f1: 55, sweep: 0.03, decay: 0.16, drive: 2 }), at: 0.03, gain: -6 },
      { buf: H.norm(rush), gain: -2 },
      { buf: H.norm(gust), at: 0.04, gain: -11 },
      H.alignAt(lib.varispeedSemis(src.air[k % 4], -1), 0.09, -4),
      { buf: H.norm(H.edge(0.6, 0.07, HONG, { warm: true, up: 3, down: -9, fall: 5 })), gain: -9 },
      { buf: H.norm(H.edge(0.6, 0.09, NI, { warm: false, up: 3, down: -9, fall: 5 })), gain: -10 },
      { buf: H.norm(sh), gain: -14 },
      { buf: H.norm(H.glints(pent(N.A6, 8), 0.035, { seed: `dsg${k}`, t60: 0.12, fall: 1.5 })), at: 0.06, gain: -20 },
      { buf: H.strike(await H.ld(X.dirt, 0.1 + k * 0.4, 0.5 + k * 0.4, { hp: 300 })), at: 0.22, gain: -14 },
      { buf: H.lux(`dsx${k}`), at: 0.03, gain: -14 },
    ], { length: D });
    dsh.push(H.shape(H.cut(H.verb(v, 'urban', 0.1, 0.8, `dsv${k}`, 1), D, 0.35), -14));
  }
  await cat.add('twinblades_dash', dsh, { lufs: -14, spatial: true, range: [6, 60], voices: 2, pitch: [0.98, 1.02], priority: 2, sources: [X.wind, X.katana, X.dirt] });
  keep.dash = dsh;

  // twinblades_aftercut (後斬, 0.3 s after the dash: every body passed bursts at once, the handler adds _hit): one
  // delayed 「錚」 (both sabres ringing the dyad over the low octave), a sharp strike, a burst of five cuts within 70 ms,
  // the gore, a prism explosion (glass, a glint run, the sheen) and a weighty whump
  const after = [];
  const smash = await H.ld(X.glassSmash, 0.18, 0.9, { hp: 500, semis: 2 });
  for (let k = 0; k < 3; k++) {
    const r = H.rng(`ac${k}`), D = 1.8;
    const slashes = [0, 0.018, 0.034, 0.05, 0.072].map((t, i) => ({ buf: H.strike(lib.varispeedSemis(S.cuts[(k + i) % 3], r.range(-1, 2))), at: t, gain: [0, -2, -3, -4, -6][i] }));
    const v = lib.mix([
      { buf: H.strike(await H.ld(X.metalL(k + 1), 0, 0.3, { hp: 800, semis: r.range(3, 5) })), gain: -4 },
      { buf: H.K.crack(`acc${k}`, { dur: 0.012, decay: 0.003, hp: 2500 }), gain: -5 },
      { buf: H.norm(H.blade(N.A4, D, { t60: 1.1, bright: 1.2, seed: `aca${k}` })), gain: -4 },
      { buf: H.norm(H.blade(HONG, D, { t60: 1.2, bright: 1.1, seed: `acr${k}` })), at: 0.003, gain: -5 },
      { buf: H.norm(H.blade(NI, D, { t60: 1.2, bright: 1.15, seed: `acl${k}` })), at: 0.012, gain: -5 },
      ...slashes,
      { buf: H.strike(S.meats[k % 3]), at: 0.02, gain: -6 },
      { buf: H.strike(await H.ld(k % 2 ? X.gore : X.splat, 0, 0.7, { hp: 100 })), at: 0.03, gain: -7 },
      { buf: H.strike(smash), at: 0.01, gain: -11 },
      { buf: H.norm(H.glints(pent(N.A6, 9), 0.016, { seed: `acg${k}`, t60: 0.16, fall: 0.8 })), at: 0.01, gain: -13 },
      { buf: H.norm(lib.automate(H.sheen(0.8, { seed: `acs${k}`, d: (t) => 0.0003 + 0.004 * t }), (t) => Math.min(1, t / 0.01) * Math.exp(-t * 5))), gain: -13 },
      { buf: H.boom(`acb${k}`, { f0: 115, f1: 48, sweep: 0.04, decay: 0.32, drive: 2.4 }), gain: -3 },
      { buf: H.lux(`acx${k}`), gain: -12 },
    ], { length: D });
    const e = lib.eq(v, [{ type: 'hp', f: 40, order: 2 }, { type: 'peak', f: 2800, gain: 2, q: 0.8 }]);
    after.push(H.shape(H.cut(H.verb(e, 'urban', 0.16, 1.4, `acv${k}`, 1), D, 0.4), -16, { max: 6 }));
  }
  // (a transient-led burst with a long ring: mastered 2 dB under and lifted with vol)
  await cat.add('twinblades_aftercut', after, { lufs: -16, vol: 1.4, maxLimitDb: 6, spatial: true, range: [6, 70], voices: 2, pitch: [0.99, 1.01], priority: 3,
    sources: [X.metalL(1), X.gash, X.slice, X.slash, X.meaty, X.splat, X.gore, X.glassSmash] });
  keep.after = after;
}

// ---------------------------------------------------------------------------------------------- 交虹 guard / 霓返
async function guard(lib, ctx, cat, H, keep) {
  const src = await airSources(H);
  // twinblades_guard_up: 「鏘」 — both sabres swept in to cross (two short whooshes from either side), steel sliding on
  // steel into the lock (a short shing, a hard tick), the dyad ringing low under the hand, the prism veil swelling
  const gu = [];
  for (let k = 0; k < 2; k++) {
    const D = 0.85;
    const veil = lib.mix([{ buf: H.glass(N.A6, D, { t60: 1.2, attack: 0.15, seed: `gva${k}` }) }, { buf: H.glass(N.Cs7, D, { t60: 1.1, attack: 0.18, seed: `gvc${k}` }), gain: -2 }]);
    const sh = lib.automate(H.sheen(D, { seed: `gus${k}`, d: (t) => 0.002 + 0.0015 * Math.sin(2 * Math.PI * 2 * t) }), (t) => H.smooth((t - 0.1) / 0.15) * Math.exp(-Math.max(0, t - 0.3) * 5));
    const v = lib.mix([
      { buf: H.panMove(H.norm(H.swoosh(0.2, 0.06, [500, 2400, 700], { q: 1.2, seed: `guw1${k}` })), (t) => 0.5 - 0.5 * H.smooth(t / 0.1)), gain: -8 },
      { buf: H.panMove(H.norm(H.swoosh(0.2, 0.065, [600, 2800, 800], { q: 1.2, seed: `guw2${k}` })), (t) => -0.5 + 0.5 * H.smooth(t / 0.1)), at: 0.01, gain: -8 },
      { buf: H.norm(H.shing(0.07, HONG, { seed: `gus${k}`, ring: -10, t60: 0.5 })), at: 0.05, gain: -6 },
      { buf: H.strike(await H.ld(X.metalL(k + 3), 0, 0.3, { hp: 1500, semis: 5 })), at: 0.12, gain: -7 },
      { buf: H.K.tick(`gut${k}`, 2600), at: 0.12, gain: -10 },
      { buf: lib.thump({ f0: 160, f1: 75, sweep: 0.02, decay: 0.07, click: 0.2, drive: 1.5, seed: `gub${k}` }), at: 0.118, gain: -13 },
      { buf: H.norm(H.blade(HONG, 0.9, { t60: 0.6, seed: `gur${k}` })), at: 0.12, gain: -11, pan: 0.3 },
      { buf: H.norm(H.blade(NI, 0.9, { t60: 0.6, seed: `gul${k}` })), at: 0.122, gain: -11, pan: -0.3 },
      { buf: H.norm(veil), at: 0.1, gain: -19 },
      { buf: lib.stereoize(H.norm(sh), { width: 0.5, hp: 2500, seed: `gust${k}` }), gain: -21 },
      { buf: await H.ld(X.cloth, 0, 0.34, { hp: 150 }), gain: -18 },
    ], { channels: 2 });
    gu.push(H.cut(H.verb(v, 'smallRoom', 0.12, 0.6, `guv${k}`), D, 0.4));
  }
  await cat.add('twinblades_guard_up', gu, { lufs: -18, vol: 1.2, spatial: false, channels: 2, voices: 1, pitch: [0.98, 1.02], sources: [X.metalL(3), X.cloth] });

  // twinblades_block: a blow taken on the crossed blades — the steel jolt (medium plate + a metallic hit), the weight of
  // the arm behind it, the dyad rung and damped by the grip, sparks
  const bl = [];
  for (let k = 0; k < 5; k++) {
    const r = H.rng(`bl${k}`);
    const sparks = lib.automate(lib.crackle(0.3, { density: 200, decay: 0.0018, hp: 3800, seed: `bls${k}` }), (t) => Math.exp(-t * 13));
    const v = lib.mix([
      { buf: H.strike(await H.ld(X.metalM(k), 0, 0.4, { hp: 200, semis: r.range(0, 2) })) },
      { buf: H.strike(await H.ld(X.metalHit, 0, 0.3, { hp: 300, semis: r.range(-1, 1) })), gain: -5 },
      { buf: lib.thump({ f0: 150, f1: 60, sweep: 0.03, decay: 0.13, click: 0.25, drive: 2, seed: `blt${k}` }), gain: -5 },
      { buf: H.tight(H.strike(await H.ld(X.punchH(k), 0, 0.4, { hp: 120 })), 0.2), gain: -9 },
      { buf: H.norm(H.blade(HONG, 0.6, { t60: 0.32, bright: 1.2, seed: `blr${k}` })), at: 0.002, gain: -8, pan: 0.3 },
      { buf: H.norm(H.blade(NI, 0.6, { t60: 0.32, bright: 1.2, seed: `bll${k}` })), at: 0.004, gain: -9, pan: -0.3 },
      { buf: H.strike(await H.ld(X.metalL(k + 1), 0, 0.25, { hp: 1500, semis: 3 })), gain: -8 },
      { buf: H.norm(sparks), at: 0.004, gain: -13 },
      { buf: H.norm(H.glints(pent(N.Cs7, 3), 0.012, { seed: `blg${k}`, t60: 0.08 })), at: 0.006, gain: -21 },
    ], { channels: 2 });
    bl.push(H.shape(H.cut(H.verb(lib.stereoize(H.K.balance(v, BAL.block, 0.75), { width: 0.2, hp: 800, seed: `blst${k}` }), 'smallRoom', 0.1, 0.5, `blv${k}`), 0.65, 0.45), -16));
  }
  await cat.add('twinblades_block', bl, { lufs: -16, vol: 1.1, spatial: false, channels: 2, voices: 2, pitch: [0.97, 1.03], sources: [X.metalM(0), X.metalHit, X.punchH(0)] });

  // twinblades_parry (完美格擋): 清亮「叮」 — the blades struck clean: a bright strike, both rings an octave up (A6 + C#7)
  // with E7 glass and a glass 磬 under them, a low thump for the weight, the world slowing (a falling air sweep), the
  // starburst of glints round the spectrum
  const par = [];
  const cup = await H.ld(X.cup, 0.27, 0.7, { hp: 600, semis: 4 });
  for (let k = 0; k < 2; k++) {
    const D = 2.2;
    const burst = [...pent(N.A6, 7), ...pent(N.A6, 6).reverse()];
    const slow = H.swoosh(0.9, 0.02, [6000, 3000, 380], { q: 0.9, seed: `pas${k}`, rise: 1, fall: 2.5 });
    const sh = lib.automate(H.sheen(1.1, { seed: `pash${k}`, d: (t) => 0.0003 + 0.005 * t }), (t) => H.smooth(t / 0.1) * Math.exp(-Math.max(0, t - 0.12) * 3.2));
    const v = lib.mix([
      { buf: H.strike(await H.ld(X.metalL(k + 1), 0, 0.3, { hp: 1500, semis: 6 })), gain: -6 },
      { buf: H.K.crack(`pac${k}`, { dur: 0.008, decay: 0.002, hp: 4000 }), gain: -6 },
      { buf: H.strike(cup), gain: -12 },
      { buf: H.strike(await H.ld(X.metalM(k + 2), 0, 0.35, { hp: 250, semis: 2 })), gain: -11 },
      { buf: H.norm(H.blade(N.A6, D, { t60: 1.8, bright: 1.25, seed: `par${k}` })), gain: 0, pan: 0.3 },
      { buf: H.norm(H.blade(N.Cs7, D, { t60: 1.8, bright: 1.25, seed: `pal${k}` })), at: 0.003, gain: -1, pan: -0.3 },
      { buf: H.norm(H.glass(N.E7, D, { t60: 1.5, seed: `pag${k}` })), at: 0.006, gain: -9 },
      { buf: H.norm(H.qing(N.A5, D, { t60: 1.8, seed: `paq${k}` })), gain: -8 },
      { buf: lib.thump({ f0: 125, f1: 50, sweep: 0.04, decay: 0.26, click: 0.15, drive: 2, seed: `pat${k}` }), gain: -8 },
      { buf: H.norm(slow), at: 0.01, gain: -17 },
      { buf: lib.stereoize(H.norm(sh), { width: 0.6, hp: 2500, seed: `pass${k}` }), gain: -16 },
      { buf: H.norm(H.glints(burst, 0.012, { seed: `pab${k}`, t60: 0.14, fall: 0.5, pans: burst.map((_, i) => Math.cos(i * 0.9) * 0.7) })), at: 0.01, gain: -14 },
    ], { channels: 2 });
    par.push(H.shape(H.cut(H.verb(v, 'warehouse', 0.22, 2.0, `pav${k}`), D, 0.4), -16));
  }
  await cat.add('twinblades_parry', par, { lufs: -16, vol: 1.4, spatial: false, channels: 2, voices: 1, pitch: [1, 1], priority: 3, sources: [X.metalL(1), X.cup] });
  keep.parry = par;

  // twinblades_flurry (霓返: 8 cuts in 0.55 s, alternating hands — the clip puts them 0.022 + i * 0.058 s in): a windmill
  // of short passes swinging round, each with its blade ringing one step higher (八聲遞升: A5 .. C#7), the last pair
  // left ringing; the handler adds _hit_flesh per connecting cut
  const fl = [];
  for (let k = 0; k < 2; k++) {
    const D = 1.2, notes = pent(N.A5, 8), parts = [];
    for (let i = 0; i < 8; i++) {
      const hand = i % 2 ? 'L' : 'R', t0 = 0.022 + i * 0.0578;
      const s = swingVariant(lib, H, src, i + k * 2, { hand, P: 0.03, D: 0.3, seed: `fl${k}`, trail: -14, pan: 0.6 });
      parts.push({ buf: s, at: t0, gain: -2 - (i % 2) * 0.5 });
      parts.push({ buf: lib.pan(H.norm(H.blade(notes[i], 0.9, { t60: i === 7 ? 1.0 : 0.45, bright: 1.1, seed: `flr${k}${i}` })), hand === 'R' ? 0.25 : -0.25), at: t0 + 0.03, gain: -13 + i * 0.4 });
    }
    parts.push({ buf: H.norm(H.swoosh(0.7, 0.3, [280, 900, 300], { q: 0.9, seed: `flw${k}`, rise: 1.4, fall: 3 })), gain: -14 });
    parts.push({ buf: lib.thump({ f0: 120, f1: 60, sweep: 0.03, decay: 0.12, click: 0.1, drive: 1.6, seed: `flt${k}` }), gain: -12 });
    parts.push({ buf: lib.pan(H.norm(H.blade(N.A6, 1.2, { t60: 1.0, seed: `flz${k}` })), 0.2), at: 0.5, gain: -14 });
    const v = lib.mix(parts, { channels: 2, length: D });
    fl.push(H.shape(H.cut(H.verb(v, 'urban', 0.1, 0.9, `flv${k}`), D, 0.35), -15));
  }
  await cat.add('twinblades_flurry', fl, { lufs: -15, spatial: false, channels: 2, voices: 1, pitch: [1, 1], sources: [X.whoom, X.katana, X.swoosh, X.slash, X.knifeWh] });
  keep.flurry = fl;
}

// ---------------------------------------------------------------------------------------------- 虹輪 blade storm
async function storm(lib, ctx, cat, H, keep) {
  const src = await airSources(H);
  const S = await hitSources(H);
  // twinblades_storm_start: the sabres flung out wide (a double outward pass), the six spirit blades leaving them one
  // after another (six short shings on their own notes, a glass ping each), the ring catching into orbit (a whirr
  // spinning up), their chord swelling, a low push
  const st = [];
  for (let k = 0; k < 2; k++) {
    const D = 1.2;
    const sep = SIX.map((f, i) => ({ buf: H.norm(lib.mix([{ buf: H.shing(0.05, f, { seed: `sts${k}${i}`, ring: -5, t60: 0.35 }) }, { buf: H.glass(f * 2, 0.6, { t60: 0.4, seed: `stg${k}${i}` }), at: 0.045, gain: -8 }])), at: 0.1 + i * 0.04, gain: -9 - (i % 2) }));
    const orbit = lib.automate(H.whirr(0.95, (t) => 2 + 4 * H.smooth(t / 0.6), { seed: `stw${k}`, lo: 500, hi: 1700 }), (t) => H.smooth(t / 0.2) * (t > 0.6 ? Math.exp(-(t - 0.6) * 5) : 1));
    const chord = lib.mix(SIX.map((f, i) => ({ buf: H.glass(f * 2, 1.0, { t60: 1.0, attack: 0.25, seed: `stc${k}${i}` }), gain: -i * 0.8 })));
    const v = lib.mix([
      H.alignAt(lib.varispeedSemis(src.air[k], 0.5), 0.07, -4),
      H.alignAt(lib.varispeedSemis(src.air[k + 4], 2), 0.085, -5),
      { buf: H.norm(H.swoosh(0.45, 0.08, [220, 900, 260], { q: 0.9, seed: `stb${k}` })), gain: -6 },
      ...sep,
      { buf: H.norm(orbit), at: 0.25, gain: -6 },
      { buf: H.norm(chord), at: 0.3, gain: -13 },
      { buf: H.boom(`stt${k}`, { f0: 110, f1: 52, sweep: 0.04, decay: 0.2, drive: 1.8 }), at: 0.07, gain: -11 },
      { buf: H.lux(`stx${k}`), at: 0.08, gain: -15 },
    ], { length: D });
    st.push(H.shape(H.cut(H.verb(v, 'urban', 0.12, 0.9, `stv${k}`, 1), D, 0.35), -16.5));
  }
  await cat.add('twinblades_storm_start', st, { lufs: -16.5, vol: 1.19, spatial: true, range: [6, 50], voices: 2, pitch: [0.99, 1.01], sources: [X.katana, X.swoosh] });
  keep.stormStart = st;

  // twinblades_storm (loop, P = 1.2 s = one turn at 300°/s; local 2D / teammates positional): six blades round the
  // caster, each humming its own note (錯開音高, a slow beat in each pair), louder and brighter as it sweeps through the
  // front (a whoosh coloured by its note), a darker pass behind; a vortex band fluttering at the pass rate, the 雙虹
  // aura's faint sheen. Tones on the 1/P grid, swish trains folded into P, the noise beds crossfaded.
  {
    const P = 1.2, X2 = 0.4, W = 0.4, L = P + X2;
    const hums = [];
    for (let i = 0; i < 6; i++) {
      const f = H.onGrid(SIX[i], P), ph = i / 6;
      const front = (t) => (0.5 + 0.5 * Math.cos(2 * Math.PI * ((t - W) / P - ph))) ** 2;   // (rendered W + P, cut at W)
      const hum = lib.mix([{ buf: lib.tone(W + P, { freq: f }) }, { buf: lib.tone(W + P, { freq: f + 1 / P }), gain: -4 }, { buf: lib.tone(W + P, { freq: H.onGrid(f * 2.756, P) }), gain: -14 }]);
      hums.push({ buf: lib.automate(hum, (t) => 0.35 + 0.65 * front(t)), gain: -i * 0.6 });
    }
    const tonal = lib.mix(hums);
    const events = [];
    for (let i = 0; i < 6; i++) {
      const t0 = i * P / 6, warm = i % 2 === 0, r = H.rng(`stp${i}`);
      events.push({ buf: H.norm(H.swoosh(0.26, 0.08, warm ? [420, 1500 * r.range(0.95, 1.05), 500] : [600, 2300 * r.range(0.95, 1.05), 700], { q: 1.3, seed: `stf${i}`, rise: 2, fall: 6 })), at: t0, gain: -2 });
      events.push({ buf: H.norm(H.swoosh(0.2, 0.06, [3000, 6500, 3500], { q: 2, color: 'white', seed: `sth${i}`, rise: 3, fall: 9 })), at: t0 + 0.004, gain: -14 });
      events.push({ buf: lib.eq(H.norm(H.swoosh(0.22, 0.08, [180, 450, 160], { q: 1, seed: `stk${i}` })), [{ type: 'lp', f: 900, order: 2 }]), at: t0 + P / 2, gain: -13 });
    }
    const train = H.wrap(lib.mix(events, { length: P + 0.5 }), P);
    const vortex = lib.automate(lib.sweep(lib.noise(L, { color: 'pink', seed: 'stv' }), 'bp', (t) => 520 + 160 * Math.sin(2 * Math.PI * t * 6 / P), { q: 0.9 }), (t) => 0.7 + 0.3 * Math.sin(2 * Math.PI * t * 6 / P));
    const aura = H.sheen(L, { seed: 'sta', d: (t) => 0.0018 + 0.0012 * Math.sin(2 * Math.PI * t / P), fb: 0.6 });
    const noisy = lib.mix([{ buf: H.norm(vortex), gain: -12 }, { buf: H.norm(aura), gain: -25 }], { length: L });
    let v = H.seamless(P, X2, noisy, lib.mix([{ buf: H.norm(tonal), gain: -9 }]), W);
    v = lib.eq(lib.mix([{ buf: v }, { buf: train, gain: -1 }], { length: P }), [{ type: 'hp', f: 90, order: 2 }]);
    H.seamCheck('twinblades_storm', v, P / 6);
    await cat.add('twinblades_storm', v, { lufs: -18, loop: true, spatial: true, channels: 1, range: [6, 50], voices: 2, pitch: [1, 1] });
    keep.storm = v;
  }

  // twinblades_storm_hit (2D, at most every 0.09 s while the ring cuts; pitched 0.9-1.2): 嗤 — a quick cut, a glass tick,
  // a little meat and mass
  const sh = [];
  for (let k = 0; k < 6; k++) {
    const r = H.rng(`sth${k}`);
    const v = lib.mix([{ buf: H.strike(lib.varispeedSemis(S.cuts[k % 3], r.range(2, 4))) }, { buf: H.strike(await H.ld(X.glassL(k), 0, 0.25, { hp: 1800, semis: 4 })), at: 0.002, gain: -11 },
      { buf: H.strike(S.meats[k % 3]), at: 0.004, gain: -8 }, { buf: lib.thump({ f0: 170, f1: 80, sweep: 0.02, decay: 0.05, click: 0.2, drive: 1.5, seed: `stht${k}` }), gain: -12 },
      { buf: H.norm(H.glints([SIX[k] * 4, SIX[(k + 2) % 6] * 4], 0.01, { seed: `sthg${k}`, t60: 0.08 })), at: 0.004, gain: -17 }]);
    sh.push(H.shape(H.cut(H.K.balance(v, BAL.cut, 0.7), 0.3, 0.45), -17));
  }
  await cat.add('twinblades_storm_hit', sh, { lufs: -17, spatial: false, channels: 1, voices: 3, pitch: [0.97, 1.03], sources: [X.gash, X.slice, X.slash, X.meaty, X.wet, X.gross, X.glassL(0)] });

  // twinblades_storm_end: the six blades dissolve — a soft outward breath, their chord bending down and fading, the
  // glints falling down the pentatonic, a glassy dispersal
  const en = [];
  for (let k = 0; k < 2; k++) {
    const D = 1.4;
    const bend = lib.automate(lib.mix(SIX.map((f, i) => ({ buf: lib.tone(D, { freq: (t) => f * 2 * (1 - 0.06 * Math.min(1, t / 0.8)) }), gain: -i }))), (t) => Math.min(1, t / 0.02) * Math.exp(-t * 3.2));
    const v = lib.mix([
      { buf: H.norm(H.swoosh(0.6, 0.1, [900, 500, 160], { q: 0.9, seed: `ste${k}`, rise: 1.5, fall: 3 })), gain: -6 },
      { buf: H.norm(bend), gain: -12 },
      { buf: H.norm(H.glints(SIX.map((f) => f * 4).reverse(), 0.06, { seed: `steg${k}`, t60: 0.3, fall: 1 })), at: 0.03, gain: -9 },
      { buf: H.norm(lib.automate(H.sheen(1.0, { seed: `stes${k}`, d: (t) => 0.0006 + 0.006 * t }), (t) => Math.min(1, t / 0.05) * Math.exp(-t * 3.5))), gain: -15 },
      { buf: H.norm(H.tinkles(0.9, 12, { seed: `stet${k}`, lo: 2500, hi: 7000 })), at: 0.1, gain: -16 },
    ], { length: D });
    en.push(H.cut(H.verb(v, 'urban', 0.14, 1.0, `stev${k}`, 1), D, 0.4));
  }
  await cat.add('twinblades_storm_end', en, { lufs: -19, vol: 1.2, spatial: true, range: [6, 50], voices: 2, pitch: [0.99, 1.01] });
}

// ---------------------------------------------------------------------------------------------- 千刃蓮華 ultimate
// Beats (twinblades.js ULT): 0 cast + bed, 0.09 the throw, 0.25 the lotus sigil, 0.35 twelve petals rise (0.55 s),
// petal i closes at 0.974 + 0.121 i (pitch 0.85 + 0.04 i), 2.35 the spin, 2.95 the bloom (+0.1 the shatter), 3.5 the
// catch (twice, 0.06 s apart), 3.9 the end (the bed stops with a 0.4 s fade).
const ULT = { throw: 0.09, sigil: 0.25, rise: 0.35, petal: (i) => 0.974 + 0.1208 * i, spin: 2.35, bloom: 2.95, catch: 3.5, end: 3.9 };

async function ult(lib, ctx, cat, H, keep) {
  const src = await airSources(H);
  // ① twinblades_ult_cast (§1.12 layer 1, 0.4 s rise; local 2D / teammates positional): the sabres crossed overhead
  // (a light clack, the dyad), an inhale — a reversed glass chord, a sheen whose comb climbs, a whoosh opening upwards, a
  // tone gliding up an octave — breaking at 0.4 s into a bright shing and a glint burst as the lotus opens
  const cast = [];
  for (let k = 0; k < 2; k++) {
    const D = 1.1, B = 0.4;
    const chord = lib.mix([N.A5, N.Cs6, N.E6, N.A6].map((f, i) => ({ buf: H.glass(f, 1.2, { t60: 1.2, seed: `cg${k}${i}` }), gain: -i })));
    const rev = lib.fadeIn(lib.slice(lib.reverse(chord), 1.2 - B, 1.2), 0.05);
    const up = lib.automate(lib.mix([{ buf: lib.tone(D, { freq: (t) => N.A4 * 2 ** Math.min(1, t / B) }) }, { buf: lib.tone(D, { freq: (t) => N.Cs5 * 2 ** Math.min(1, t / B) }), gain: -2 },
      { buf: lib.tone(D, { freq: (t) => N.A4 * 2.756 * 2 ** Math.min(1, t / B) }), gain: -12 }]), (t) => (t < B ? (t / B) ** 2 : Math.exp(-(t - B) * 10)));
    const sh = lib.automate(H.sheen(D, { seed: `cs${k}`, d: (t) => Math.max(0.0002, 0.004 - 0.009 * Math.min(t, B)) }), (t) => (t < B ? (t / B) ** 1.6 : Math.exp(-(t - B) * 7)));
    const v = lib.mix([
      { buf: H.strike(await H.ld(X.metalL(k + 4), 0, 0.3, { hp: 1200, semis: 4 })), gain: -12 },
      { buf: H.norm(H.blade(HONG, 0.6, { t60: 0.3, seed: `ccr${k}` })), gain: -16 },
      { buf: H.norm(H.blade(NI, 0.6, { t60: 0.3, seed: `ccl${k}` })), at: 0.003, gain: -16 },
      { buf: H.norm(rev), gain: -5 },
      { buf: H.norm(H.swoosh(D, B, [300, 3000, 1500], { q: 0.8, seed: `cw${k}`, rise: 3, fall: 8 })), gain: -8 },
      { buf: H.norm(up), gain: -10 },
      { buf: H.norm(sh), gain: -11 },
      { buf: H.norm(H.shing(0.05, N.A6, { seed: `csh${k}`, ring: -4, t60: 0.9 })), at: B - 0.04, gain: -7 },
      { buf: H.norm(H.glints(pent(N.A6, 8), 0.012, { seed: `cgl${k}`, t60: 0.2, fall: 0.6 })), at: B, gain: -12 },
      { buf: lib.thump({ f0: 100, f1: 50, sweep: 0.04, decay: 0.2, click: 0, drive: 1.5, seed: `ct${k}` }), at: B, gain: -12 },
    ], { length: D });
    cast.push(H.shape(H.cut(H.verb(v, 'warehouse', 0.16, 1.2, `cv${k}`, 1), D, 0.35), -15));
  }
  await cat.add('twinblades_ult_cast', cast, { lufs: -15, vol: 1.1, spatial: true, range: [10, 120], voices: 2, pitch: [1, 1], priority: 3, maxHeadMs: 60, sources: [X.metalL(4)] });
  keep.cast = cast;

  // twinblades_ult_throw (0.09): both sabres hurled (the arms' release: two big passes), then spinning away (their whirr
  // slowing and closing as they fly, the trails' zings falling)
  const th = [];
  for (let k = 0; k < 2; k++) {
    const D = 0.95, P = 0.035;
    const away = lib.automate(lib.sweep(H.whirr(D, (t) => 9 - t * 3, { seed: `thw${k}`, lo: 500, hi: 1800 }), 'lp', (t) => 8000 / (1 + t * 6), { q: 0.7 }), (t) => H.smooth((t - 0.02) / 0.06) / (1 + t * 4));
    const v = lib.mix([
      H.alignAt(lib.varispeedSemis(src.air[k], -1), P, 0),
      H.alignAt(lib.varispeedSemis(src.air[k + 2], 0.5), P + 0.025, -1),
      H.alignAt(H.norm(lib.varispeedSemis(src.whoom, -2)), P, -4),
      { buf: H.norm(away), gain: -6 },
      { buf: H.norm(H.edge(0.8, 0.05, HONG, { warm: true, up: 1, down: -8, fall: 5 })), gain: -11 },
      { buf: H.norm(H.edge(0.8, 0.07, NI, { warm: false, up: 1, down: -8, fall: 5 })), gain: -12 },
      { buf: H.norm(H.glints(pent(N.A6, 8).reverse(), 0.05, { seed: `thg${k}`, t60: 0.14, fall: 1.4 })), at: 0.08, gain: -19 },
    ], { length: D });
    th.push(H.shape(H.cut(v, D, 0.35), -16));
  }
  await cat.add('twinblades_ult_throw', th, { lufs: -16, vol: 1.12, spatial: true, range: [10, 120], voices: 2, pitch: [0.99, 1.01], sources: [X.whoom, X.katana, X.swoosh] });

  // twinblades_ult_sigil (0.25, at the lotus): 磬一聲 — a glass chime stone on A4 over A3, the lotus drawn round (twelve
  // glass pings circling the pentatonic, a sheen sweeping round once), a soft low settle
  const sigil = [];
  for (let k = 0; k < 2; k++) {
    const D = 2.2;
    const ring = [...pent(N.A6, 6), ...pent(N.A6, 6).reverse()];
    const v = lib.mix([
      { buf: H.norm(H.qing(N.A4, D, { seed: `sga${k}`, t60: 2.0, tick: -9 })) },
      { buf: H.norm(H.qing(N.A3, D, { seed: `sgb${k}`, t60: 2.4 })), at: 0.004, gain: -7 },
      { buf: H.norm(H.glints(ring, 0.032, { seed: `sgr${k}`, t60: 0.3, fall: 0.4 })), at: 0.04, gain: -15 },
      { buf: H.norm(lib.automate(H.sheen(1.3, { seed: `sgs${k}`, d: (t) => 0.0004 + 0.003 * (0.5 - 0.5 * Math.cos(2 * Math.PI * t / 1.2)) }), (t) => H.smooth(t / 0.1) * Math.exp(-t * 2.5))), at: 0.03, gain: -19 },
      { buf: lib.thump({ f0: 75, f1: 45, sweep: 0.05, decay: 0.45, click: 0, drive: 1.4, seed: `sgt${k}` }), gain: -9 },
    ]);
    sigil.push(H.cut(H.verb(v, 'warehouse', 0.22, 1.8, `sgv${k}`, 1, 300), D, 0.4));
  }
  await cat.add('twinblades_ult_sigil', sigil, { lufs: -18, vol: 1.4, spatial: true, range: [12, 140], voices: 2, pitch: [0.99, 1.01] });
  keep.sigil = sigil;

  // twinblades_ult_rise (0.35, the petals rise 0.55 s, staggered 25 ms): 地底刀鳴上升 — the street cracking and grinding
  // open, twelve great blades sliding up out of it (twelve shings, warm / cool alternating, climbing), a rumble swelling,
  // and the standing lotus ringing its chord (the big blades: A3 C#4 E4 + glass)
  const rise = [];
  {
    const ice = await H.ld(X.iceCrack, 0.45, 2.45, { hp: 150 });
    const grind = await H.ld(X.rubbleScrape, 0, 1.0, { hp: 80, semis: -5 });
    const chips = await H.ld(X.stoneDebris, 0, 0.39, { hp: 300 });
    for (let k = 0; k < 2; k++) {
      const D = 2.0;
      const sl = [];
      for (let i = 0; i < 12; i++) sl.push({ buf: H.norm(H.shing(0.34, (i % 2 ? N.Cs4 : N.A3) * 2 ** (i / 30), { seed: `rss${k}${i}`, ring: -9, t60: 0.7, glide: 0.12 })), at: 0.02 + i * 0.025, gain: -10 - (i % 3) });
      const v = lib.mix([
        { buf: H.norm(lib.eq(lib.varispeedSemis(lib.slice(ice, k * 0.5, k * 0.5 + 1.4), -7), [{ type: 'lp', f: 6000, order: 2 }, { type: 'peak', f: 900, gain: 3, q: 0.9 }])), gain: -8 },
        { buf: H.env(H.norm(lib.concat([grind, grind])), (t) => H.smooth(t / 0.2) * Math.exp(-Math.max(0, t - 0.5) * 3)), gain: -11 },
        { buf: H.strike(chips), at: 0.03, gain: -11 },
        ...sl,
        { buf: H.norm(H.rumble(D, `rsr${k}`, { lp: 160, a: 0.4, t60: 2.0 })), gain: -7 },
        { buf: H.norm(lib.psychoBass(lib.automate(lib.tone(D, { freq: (t) => 40 + 30 * Math.min(1, t / 0.55) }), (t) => H.smooth(t / 0.4) * Math.exp(-Math.max(0, t - 0.6) * 4)), { freq: 110, amount: -4 })), gain: -9 },
        { buf: H.norm(H.blade(N.A3, 1.5, { t60: 1.3, bright: 1.2, seed: `rsa${k}` })), at: 0.55, gain: -9 },
        { buf: H.norm(H.blade(N.Cs4, 1.5, { t60: 1.3, bright: 1.2, seed: `rsc${k}` })), at: 0.56, gain: -10 },
        { buf: H.norm(H.blade(N.E4, 1.4, { t60: 1.2, bright: 1.2, seed: `rse${k}` })), at: 0.57, gain: -12 },
        { buf: H.norm(H.glass(N.A6, 1.2, { t60: 1.0, seed: `rsg${k}` })), at: 0.57, gain: -17 },
      ], { length: D });
      rise.push(H.shape(H.cut(H.verb(v, 'urban', 0.2, 1.6, `rsv${k}`, 1), D, 0.35), -15));
    }
    await cat.add('twinblades_ult_rise', rise, { lufs: -15, vol: 1.1, spatial: true, range: [12, 140], voices: 2, pitch: [1, 1], maxHeadMs: 60, sources: [X.iceCrack, X.rubbleScrape, X.stoneDebris] });
    keep.rise = rise[0];
  }

  // twinblades_ult_petal (x12, 0.12 s apart, pitched 0.85 -> 1.29 by the handler): one 3.8 m blade slashing across the
  // lotus — a giant pass (the sword air down 4-6 st, a deep body), its edge (a shing, a short metallic ring kept a little
  // inharmonic so the climbing pitch never fights the bed's bells), dust thrown along the lane
  const petal = [];
  for (let k = 0; k < 3; k++) {
    const r = H.rng(`pt${k}`), D = 0.75, P = 0.035;
    const v = lib.mix([
      H.alignAt(H.norm(lib.varispeedSemis(src.whoom, -6 + r.range(-0.5, 0.5))), P, 0),
      H.alignAt(lib.varispeedSemis(src.air[k], -4 + r.range(-0.5, 0.5)), P, -3),
      { buf: H.norm(H.swoosh(D, P, [80, 300, 90], { q: 0.8, seed: `ptb${k}`, rise: 2, fall: 5 })), gain: -5 },
      { buf: H.norm(H.swoosh(D, P + 0.005, [1500, 4500, 2000], { q: 1.1, color: 'white', seed: `pth${k}`, rise: 3, fall: 9 })), gain: -6 },
      { buf: H.norm(H.shing(0.03, N.A4, { seed: `pts${k}`, ring: -6, t60: 0.5, bright: 1.3 })), at: P - 0.02, gain: -4 },
      { buf: H.norm(H.blade(N.A4 * r.range(0.99, 1.01), 0.7, { t60: 0.55, bright: 1.35, beat: 0.012, seed: `ptr${k}` })), at: P, gain: -7 },
      { buf: H.norm(H.dust(0.6, `ptd${k}`, { t60: 0.45 })), at: P + 0.03, gain: -13 },
      { buf: lib.thump({ f0: 95, f1: 50, sweep: 0.04, decay: 0.15, click: 0.1, drive: 1.6, seed: `ptt${k}` }), at: P, gain: -9 },
    ], { length: D });
    petal.push(H.shape(H.cut(v, D, 0.4), -16));
  }
  await cat.add('twinblades_ult_petal', petal, { lufs: -16, vol: 1.1, spatial: true, range: [12, 140], voices: 6, pitch: [0.99, 1.01], sources: [X.whoom, X.katana, X.swoosh] });
  keep.petal = petal;

  // twinblades_ult_spin (2.35 -> the bloom at 2.95): 旋風 — twelve blades whirling round the centre and pulling in: the
  // whirr accelerating, a vortex band and a howl climbing, a tone gliding up an octave, a suck of air into the centre,
  // cut dead where the bloom takes over
  const spinOut = [];
  for (let k = 0; k < 2; k++) {
    const D = 0.62, B = 0.6;
    const wh = H.whirr(D, (t) => 7 + 22 * (t / B) ** 1.5, { seed: `spw${k}`, lo: 300, hi: 1300, ring: -5 });
    const vort = lib.sweep(lib.noise(D, { color: 'pink', seed: `spv${k}` }), 'bp', (t) => 300 * 5 ** (t / B), { q: 0.9 });
    const howl = lib.sweep(lib.noise(D, { color: 'pink', seed: `sph${k}` }), 'bp', (t) => 900 * 2.6 ** (t / B), { q: 5 });
    const up = lib.mix([{ buf: lib.tone(D, { freq: (t) => N.A3 * 2 ** (t / B) }) }, { buf: lib.tone(D, { freq: (t) => N.E4 * 2 ** (t / B) }), gain: -4 }, { buf: lib.tone(D, { freq: (t) => N.A4 * 2 ** (t / B) }), gain: -8 }]);
    const cres = (t) => (0.2 + 0.8 * (Math.min(t, B) / B) ** 1.8) * (t > B - 0.012 ? Math.max(0, (D - t) / (D - B + 0.012)) : 1);
    const v = lib.automate(lib.mix([{ buf: H.norm(wh) }, { buf: H.norm(vort), gain: -5 }, { buf: H.norm(howl), gain: -13 }, { buf: H.norm(lib.saturate(up, { drive: 3, type: 'tube', mix: 0.4 })), gain: -12 },
      { buf: H.norm(lib.reverse(H.swoosh(0.18, 0.04, [2500, 1200, 300], { q: 0.9, seed: `sps${k}`, fall: 3 }))), at: B - 0.17, gain: -6 }], { length: D }), cres);
    spinOut.push(lib.fadeIn(v, 0.01));
  }
  await cat.add('twinblades_ult_spin', spinOut, { lufs: -15, vol: 1.1, spatial: true, range: [12, 140], voices: 2, pitch: [1, 1], maxHeadMs: 80 });
  keep.spin = spinOut[0];

  // ② twinblades_ult_bloom (§1.12 layer 2, 2.95): 花心綻放 — a 40-60 Hz blow (~0.3 s: a punch, not a drone), a deep blast,
  // a glass explosion, the twelve blades' chord rung all at once (A3 C#4 E4 + the two sabres + glass A6 C#7 E7), a white
  // flash of sheen, a burst of glints up the spectrum, the street's debris and a rumble
  const bloom = [];
  {
    const deepB = H.tight(H.strike(await H.ld(X.deepBoom, 0, 2.6, { hp: 28 })), 1.2);
    const blast = H.tight(H.strike(await H.ld(X.blast, 0, 1.24, { hp: 45 })), 0.8);
    const smash = H.strike(await H.ld(X.glassSmash, 0.18, 1.6, { hp: 300 }));
    const bottle = H.strike(await H.ld(X.bottle, 0.16, 1.3, { hp: 400, semis: 2 }));
    for (let k = 0; k < 2; k++) {
      const D = 2.8;
      const v = lib.mix([
        { buf: H.K.crack(`bmc${k}`, { dur: 0.02, decay: 0.005, hp: 1200 }), gain: -4 },
        { buf: H.boom(`bmb${k}`, { f0: 92, f1: 46, sweep: 0.06, decay: 0.55, drive: 2.2, amount: -3 }) },
        { buf: H.strike(deepB), gain: -5 },
        { buf: H.strike(blast), gain: -5 },
        { buf: smash, at: 0.004, gain: -6 },
        { buf: bottle, at: 0.03, gain: -10 },
        { buf: H.norm(H.blade(N.A3, D, { t60: 2.0, bright: 1.1, seed: `bma${k}` })), gain: -5 },
        { buf: H.norm(H.blade(N.Cs4, D, { t60: 2.0, bright: 1.1, seed: `bmc4${k}` })), at: 0.004, gain: -6 },
        { buf: H.norm(H.blade(N.E4, D, { t60: 1.8, bright: 1.1, seed: `bme${k}` })), at: 0.008, gain: -7 },
        { buf: H.norm(H.blade(HONG, D, { t60: 1.6, seed: `bmr${k}` })), at: 0.01, gain: -9 },
        { buf: H.norm(H.blade(NI, D, { t60: 1.6, seed: `bml${k}` })), at: 0.012, gain: -9 },
        { buf: H.norm(lib.mix([N.A6, N.Cs7, N.E7].map((f, i) => ({ buf: H.glass(f, D, { t60: 1.6, seed: `bmg${k}${i}` }), gain: -i * 1.5 })))), at: 0.012, gain: -12 },
        { buf: H.norm(lib.automate(H.sheen(1.0, { seed: `bms${k}`, d: (t) => 0.0002 + 0.005 * t }), (t) => Math.min(1, t / 0.008) * Math.exp(-t * 4))), gain: -12 },
        { buf: H.norm(H.glints(pent(N.A6, 12), 0.014, { seed: `bmgl${k}`, t60: 0.2, fall: 0.5 })), at: 0.02, gain: -15 },
        { buf: H.strike(await H.ld(X.debrisBig, 0.05 + k * 0.4, 2.6 + k * 0.4, { hp: 80 })), at: 0.08, gain: -8 },
        { buf: H.norm(H.rumble(D, `bmr${k}`, { lp: 200, t60: 2.0 })), gain: -12 },
        { buf: H.lux(`bmx${k}`), gain: -12 },
      ], { length: D });
      const e = lib.eq(v, [{ type: 'hp', f: 28, order: 2 }, { type: 'lowshelf', f: 70, gain: -2.5 }, { type: 'peak', f: 2000, gain: 2, q: 0.7 }, { type: 'highshelf', f: 5000, gain: 2 }]);
      bloom.push(H.shape(H.cut(H.verb(e, 'urban', 0.22, 2.2, `bmv${k}`, 1), D, 0.4), -14, { max: 5 }));
    }
    await cat.add('twinblades_ult_bloom', bloom, { lufs: -14, vol: 1.25, maxLimitDb: 6, spatial: true, range: [15, 160], voices: 2, pitch: [0.99, 1.01], priority: 3,
      sources: [X.deepBoom, X.blast, X.glassSmash, X.bottle, X.debrisBig] });
    keep.bloom = bloom[0];
  }

  // twinblades_ult_shatter (bloom + 0.1; §1.12 release): the twelve petals breaking into rainbow porcelain — glass and a
  // plate breaking, shards bouncing, a long rain of glints thinning out, the prism sheen falling — then the deflating
  // sigh (a hiss falling 3 kHz -> 250 Hz, a low exhale, a glass tone sliding down) and a soft 磬 dyad resolving it
  const shatter = [];
  {
    const br2 = await H.ld(X.glassBreak2, 0, 2.7, { hp: 200, semis: -2 });
    const br = H.strike(await H.ld(X.glassBreak, 0.3, 1.5, { hp: 300 }));
    const plate = H.strike(await H.ld(X.plate, 0.02, 1.08, { hp: 300, semis: 2 }));
    const shard = await H.ld(X.shard, 0.01, 0.33, { hp: 1500 });
    for (let k = 0; k < 2; k++) {
      const D = 3.3;
      const hiss = lib.automate(lib.sweep(lib.noise(1.8, { seed: `shh${k}` }), 'bp', (t) => 3000 * (250 / 3000) ** (t / 1.8), { q: 1.0 }), (t) => Math.min(1, t / 0.15) * Math.exp(-t * 1.6));
      const exhale = lib.automate(lib.eq(lib.noise(1.6, { color: 'brown', seed: `she${k}` }), [{ type: 'lp', f: 500, order: 2 }, { type: 'hp', f: 60, order: 2 }]), (t) => Math.min(1, t / 0.25) * Math.exp(-t * 2));
      const slide = lib.automate(lib.tone(1.4, { freq: (t) => N.A5 * 2 ** (-Math.min(1, t / 1.2)) }), (t) => Math.min(1, t / 0.05) * Math.exp(-t * 2.4));
      const v = lib.mix([
        { buf: H.strike(br2) },
        { buf: br, at: 0.02, gain: -4 },
        { buf: plate, at: 0.03, gain: -5 },
        ...[0.15, 0.42, 0.7, 1.05].map((t, i) => ({ buf: lib.varispeedSemis(shard, i * 1.5 - 1), at: t + k * 0.04, gain: -11 - i * 2 })),
        { buf: H.norm(H.tinkles(2.6, 44, { seed: `sht${k}`, lo: 2200, hi: 8500, t60: 0.14, fall: 14, skew: 1.5 })), at: 0.05, gain: -8 },
        { buf: H.norm(lib.automate(H.sheen(2.0, { seed: `shs${k}`, d: (t) => 0.0003 + 0.004 * t }), (t) => Math.min(1, t / 0.05) * Math.exp(-t * 1.7))), gain: -15 },
        { buf: H.norm(hiss), at: 0.5, gain: -12 },
        { buf: H.norm(exhale), at: 0.55, gain: -15 },
        { buf: H.norm(slide), at: 0.6, gain: -21 },
        { buf: H.norm(H.qing(N.A5, 1.8, { t60: 1.6, seed: `shq1${k}` })), at: 1.25, gain: -16 },
        { buf: H.norm(H.qing(N.Cs6, 1.8, { t60: 1.6, seed: `shq2${k}` })), at: 1.25, gain: -17 },
      ], { length: D });
      shatter.push(H.shape(H.cut(H.verb(v, 'urban', 0.2, 1.8, `shv${k}`, 1), D, 0.35), -16));
    }
    await cat.add('twinblades_ult_shatter', shatter, { lufs: -16, vol: 1.35, spatial: true, range: [12, 140], voices: 2, pitch: [0.99, 1.01], sources: [X.glassBreak2, X.glassBreak, X.plate, X.shard] });
    keep.shatter = shatter[0];
  }

  // ③ twinblades_ult_bed (§1.12 layer 3; 2D for the caster from t = 0, played at 0.6, stopped at 3.9 with a 0.4 s fade):
  // A, scored to the beats. A timpani stroke and the cellos' tremolo on A3 at the cast; a tubular bell for the sigil; the
  // violins' A4 tremolo swelling as the petals rise; one glass bell per petal climbing the pentatonic A4 .. B6 (twelve),
  // muted drum pulses under every other one; at the spin the timpani roll, the suspended cymbal, the violins
  // up on E5 and the choir swelling, all cut dead 20 ms before the bloom; the bloom: timpani + bass drum + gong + crash,
  // the choir's A major (A / C# / E), tubular bells A4 C#5 E5 and the cellos again, dying away under the shatter.
  let bed;
  {
    const D = 4.6, parts = [];
    const timpA = H.strike(await H.ld(X.timpAs2, 0, 4.0, { stereo: true, hp: 35, semis: -1, fadeOut: 0.5 }));
    parts.push({ buf: lib.decay(timpA, 1.4, 0.05), at: 0, gain: -8 });
    const cello = await H.ld(X.celloTremA3, 0.25, 7.2, { stereo: true, hp: 60 });
    parts.push({ buf: H.env(cello, [[0, -40], [0.25, -14], [0.9, -9], [2.35, -7], [2.88, -2], [2.93, -60]]), at: 0, gain: -4 });
    parts.push({ buf: H.env(lib.slice(cello, 3.0, 6.9), [[0, -6], [0.6, -9], [1.5, -30], [1.6, -60]]), at: ULT.bloom, gain: -6 });
    parts.push({ buf: await H.tubular(N.A4, 2.0, { t60: 1.8 }), at: ULT.sigil, gain: -13 });
    const vlnA = await H.ld(X.vlnTremA4, 0.3, 3.2, { stereo: true, hp: 150 });
    parts.push({ buf: H.env(vlnA, [[0, -40], [0.55, -14], [1.95, -8], [2.53, -2], [2.58, -60]]), at: ULT.rise, gain: -8 });
    const vlnE = await H.ld(X.vlnTremE5, 0.3, 1.2, { stereo: true, hp: 200 });
    parts.push({ buf: H.env(vlnE, [[0, -40], [0.35, -10], [0.56, -3], [0.58, -60]]), at: ULT.spin, gain: -10 });
    // the petals: glass bells climbing, warm / cool alternating sides, muted drum under every other one
    const climb = pent(N.A4, 12);
    const muted = lib.decay(H.strike(await H.ld(X.bdMuted, 0, 1.2, { stereo: true, hp: 40 })), 0.5, 0.03);
    for (let i = 0; i < 12; i++) {
      parts.push({ buf: lib.pan(H.norm(H.glass(climb[i], 1.4, { t60: 1.1, seed: `bdg${i}`, tick: -14 })), i % 2 ? -0.4 : 0.4), at: ULT.petal(i), gain: -16 + i * 0.4 });
      if (i % 2 === 0) parts.push({ buf: muted, at: ULT.petal(i), gain: -16 + i * 0.3 });
    }
    // the spin: rolls and swells into the bloom, cut dead 20 ms before it
    const roll = await H.ld(X.timpRoll, 1.0, 2.0, { stereo: true, hp: 35, semis: -1 });
    parts.push({ buf: H.env(roll, [[0, -26], [0.5, -6], [0.57, 0], [0.58, -60]]), at: ULT.spin, gain: -6 });
    const susp = await H.ld(X.suspRoll, 2.4, 3.4, { stereo: true, hp: 400 });
    parts.push({ buf: H.env(susp, [[0, -30], [0.5, -4], [0.57, 0], [0.58, -60]]), at: ULT.spin, gain: -12 });
    const choirUp = await H.ld(X.choirU, 0.4, 2.0, { stereo: true, hp: 100, semis: -8, lp: 4500 });
    parts.push({ buf: H.env(choirUp, [[0, -40], [0.5, -8], [0.57, -2], [0.58, -60]]), at: ULT.spin, gain: -10 });
    // the bloom
    parts.push({ buf: lib.decay(timpA, 1.6, 0.05), at: ULT.bloom, gain: 0 });
    parts.push({ buf: lib.decay(H.strike(await H.ld(X.bdFff, 0, 3.0, { stereo: true, hp: 30, fadeOut: 0.5 })), 1.2, 0.03), at: ULT.bloom, gain: -3 });
    parts.push({ buf: lib.decay(H.strike(await H.ld(X.gong, 0, 4.0, { stereo: true, hp: 45, fadeOut: 0.5 })), 2.4, 0.05), at: ULT.bloom, gain: -7 });
    parts.push({ buf: H.strike(await H.ld(X.crash, 0.04, 2.3, { stereo: true, hp: 300 })), at: ULT.bloom, gain: -13 });
    const choir = lib.mix([{ buf: await H.ld(X.choirA, 0.5, 2.2, { stereo: true, hp: 120, semis: -8, lp: 4500 }) }, { buf: await H.ld(X.choirA2, 0.5, 2.6, { stereo: true, hp: 140, semis: -4, lp: 4500 }), gain: -3 },
      { buf: await H.ld(X.choirA, 1.0, 3.0, { stereo: true, hp: 160, semis: -1, lp: 4500 }), gain: -5 }], { channels: 2 });
    parts.push({ buf: H.env(choir, [[0, -12], [0.04, 0], [0.5, -3], [1.3, -18], [1.6, -60]]), at: ULT.bloom, gain: -8 });
    for (const [i, f] of [N.A4, N.Cs5, N.E5].entries()) parts.push({ buf: lib.pan(await H.tubular(f, 1.6, { t60: 1.6 }), [0, -0.35, 0.35][i]), at: ULT.bloom + i * 0.006, gain: -11 - i });
    let v = lib.mix(parts, { channels: 2, length: D });
    v = H.verb(v, 'warehouse', 0.18, 2.2, 'bedv');
    bed = H.shape(lib.fadeOut(lib.slice(v, 0, D), 0.6, 'exp'), -18);
    await cat.add('twinblades_ult_bed', bed, { lufs: -18, vol: 1.3, spatial: false, channels: 2, voices: 1, pitch: [1, 1],
      sources: [X.timpAs2, X.celloTremA3, X.tbC5, X.vlnTremA4, X.vlnTremE5, X.bdMuted, X.timpRoll, X.suspRoll, X.choirU, X.bdFff, X.gong, X.crash, X.choirA, X.choirA2] });
    keep.bed = bed;
  }

  // twinblades_catch (the ult's end: twice, 0.06 s apart, the second at pitch 1.1; also the rare 收招): 「啪」 the grip
  // slapped into the palm, a leather creak, the ring pommel and its jade bead jingling, the blade ringing short, a glint
  const ca = [];
  for (let k = 0; k < 3; k++) {
    const r = H.rng(`ca${k}`);
    const slap = lib.noiseBurst({ dur: 0.035, attack: 0.0005, decay: 0.008, bp: 1800, q: 0.7, seed: `cas${k}` });
    const v = lib.mix([
      { buf: H.strike(await H.ld(X.punch(k), 0, 0.3, { hp: 250, lp: 7000, semis: r.range(2, 4) })), gain: -3 },
      { buf: H.norm(slap), gain: -6 },
      { buf: await H.ld(X.cloth, 0, 0.3, { hp: 200 }), at: 0.01, gain: -15 },
      { buf: H.norm(H.K.jingle(0.12, 4, `caj${k}`)), at: 0.012, gain: -15 },
      { buf: H.norm(H.blade(k % 2 ? NI : HONG, 0.6, { t60: 0.35, seed: `car${k}` })), at: 0.004, gain: -10 },
      { buf: H.norm(H.glints(pent(k % 2 ? N.Cs7 : N.A7, 3), 0.014, { seed: `cag${k}`, t60: 0.1 })), at: 0.01, gain: -19 },
      { buf: lib.thump({ f0: 160, f1: 80, sweep: 0.015, decay: 0.06, click: 0.3, drive: 1.5, seed: `cat${k}` }), gain: -10 },
    ]);
    ca.push(H.shape(H.cut(lib.stereoize(H.verb(v, 'smallRoom', 0.1, 0.4, `cav${k}`, 1), { width: 0.25, hp: 1000, seed: `cast${k}` }), 0.55, 0.45), -18));
  }
  await cat.add('twinblades_catch', ca, { lufs: -18, vol: 1.2, spatial: false, channels: 2, voices: 3, pitch: [0.98, 1.02], sources: [X.punch(0), X.cloth] });
  keep.catch = ca;

  // the whole ultimate as the caster hears it at the handler's volumes (the spatial layers ~10 m away) — logged + previewed
  const at = (b, l, t, vol = 1) => ({ buf: H.atLufs(b, l), at: t, gainLin: vol });
  const tl = lib.mix([at(cast[0], -15, 0, 1.1), at(bed, -18, 0, 1.3 * 0.6), at(th[0], -16, ULT.throw, 1.12), at(sigil[0], -18, ULT.sigil, 1.4 * 0.9), at(rise[0], -15, ULT.rise, 1.1 * 0.9),
    ...Array.from({ length: 12 }, (_, i) => at(lib.varispeed(petal[i % 3], 0.85 + 0.04 * i), -16, ULT.petal(i), 1.1 * 0.7)), at(spinOut[0], -15, ULT.spin, 1.1 * 0.9),
    at(bloom[0], -14, ULT.bloom, 1.25), at(shatter[0], -16, ULT.bloom + 0.1, 1.35 * 0.8), at(ca[0], -18, ULT.catch, 1.2), at(lib.varispeed(ca[1], 1.1), -18, ULT.catch + 0.06, 1.2 * 0.8)], { channels: 2 });
  const Lt = lib.loudness(tl);
  ctx.log(`  ult timeline: ${Lt.integrated.toFixed(1)} LUFS integrated, momentary max ${Lt.momentaryMax.toFixed(1)}, short-term max ${Lt.shortTermMax.toFixed(1)}, peak ${lib.lin2db(lib.peak(tl)).toFixed(1)} dBFS`);
  ctx.preview('ult_timeline', tl);
}

// ---------------------------------------------------------------------------------------------- the sabres' life
async function view(lib, ctx, cat, H, keep) {
  const src = await airSources(H);
  // twinblades_idle: §1.12 idle hum — the two-tone hum (55 Hz A1 + 69.3 Hz C#2, A2 over them) through a tube, a
  // 400-1200 Hz band of noise swept by a 0.2 Hz LFO, the two edges breathing at 0.6 Hz out of phase (虹 A6 right, 霓 C#7
  // left, like the pearls), a few prism motes. Periodic in 10 s; only the random textures go through the crossfade.
  {
    const P = 10, L = 11.5, q = (f) => H.onGrid(f, P), lfo = (t) => 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.2 * t);
    const hum = lib.saturate(lib.mix([{ buf: lib.tone(P, { freq: q(N.A1) }) }, { buf: lib.tone(P, { freq: q(N.Cs2) }), gain: -2 }, { buf: lib.tone(P, { freq: q(N.A2) }), gain: -8 }, { buf: lib.tone(P, { freq: q(N.E3) }), gain: -16 }]), { drive: 3, type: 'tube' });
    const edgeR = lib.automate(lib.mix([{ buf: lib.tone(P, { freq: q(N.A6) + 0.2 }) }, { buf: lib.tone(P, { freq: q(N.A6) - 0.2 }) }, { buf: lib.tone(P, { freq: q(N.A6 * 2.756) }), gain: -12 }]), (t) => 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 0.6 * t)) ** 2);
    const edgeL = lib.automate(lib.mix([{ buf: lib.tone(P, { freq: q(N.Cs7) + 0.2 }) }, { buf: lib.tone(P, { freq: q(N.Cs7) - 0.2 }) }, { buf: lib.tone(P, { freq: q(N.Cs7 * 2.756) }), gain: -12 }]), (t) => 0.3 + 0.7 * (0.5 - 0.5 * Math.sin(2 * Math.PI * 0.6 * t)) ** 2);
    const band = lib.sweep(lib.noise(L, { color: 'pink', seed: 'idle_n' }), 'bp', (t) => 400 * Math.pow(3, lfo(t)), { q: 1.6 });
    const motes = H.tinkles(L, 9, { seed: 'idle_m', lo: 3000, hi: 8000, t60: 0.2, fall: 0, skew: 1 });
    const texture = lib.loopCrossfade(lib.mix([{ buf: lib.stereoize(H.norm(band), { width: 0.35, hp: 250, seed: 'idle_st' }), gain: -8 }, { buf: lib.stereoize(H.norm(motes), { width: 0.7, hp: 2000, seed: 'idle_ms' }), gain: -30 }], { channels: 2, length: L }), L - P);
    const v = lib.mix([{ buf: H.norm(hum), gain: -4 }, { buf: lib.pan(H.norm(edgeR), 0.4), gain: -25 }, { buf: lib.pan(H.norm(edgeL), -0.4), gain: -26 }, { buf: texture }], { length: P, channels: 2 });
    H.seamCheck('twinblades_idle', v, 5);
    await cat.add('twinblades_idle', v, { lufs: -20, loop: true, spatial: false, channels: 2, voices: 1, pitch: [1, 1] });
  }

  // twinblades_draw (0.45 s clip, cue 0.01 s in): both sabres up from below the frame — two quick shings (虹 low and right,
  // 霓 high and left, 35 ms apart), the air of the lift, the grips' leather, the edges lighting (a faint sheen)
  {
    const out = [];
    for (let k = 0; k < 2; k++) {
      const D = 0.8;
      const v = lib.mix([
        { buf: lib.pan(H.norm(H.shing(0.11, HONG, { seed: `drr${k}`, ring: -6, t60: 0.55 })), 0.35), gain: -3 },
        { buf: lib.pan(H.norm(H.shing(0.1, NI, { seed: `drl${k}`, ring: -6, t60: 0.55 })), -0.35), at: 0.035, gain: -4 },
        { buf: lib.stereoize(H.norm(H.swoosh(0.3, 0.1, [300, 1100, 400], { q: 1.1, seed: `drw${k}` })), { width: 0.5, hp: 300, seed: `drws${k}` }), gain: -9 },
        { buf: await H.ld(X.cloth, 0, 0.34, { hp: 150 }), gain: -15 },
        { buf: lib.stereoize(H.norm(lib.automate(H.sheen(0.5, { seed: `drs${k}`, d: (t) => 0.003 - 0.004 * t }), (t) => H.smooth((t - 0.1) / 0.1) * Math.exp(-Math.max(0, t - 0.2) * 6))), { width: 0.6, hp: 2500, seed: `drss${k}` }), gain: -21 },
      ], { channels: 2 });
      out.push(H.cut(H.verb(v, 'smallRoom', 0.12, 0.6, `drv${k}`), D, 0.4));
    }
    await cat.add('twinblades_draw', out, { lufs: -19, vol: 1.1, spatial: false, channels: 2, voices: 1, pitch: [0.98, 1.02], sources: [X.cloth] });
  }

  // twinblades_draw_first (cue 0.032 s into the 1.6 s first draw; the clash at 0.43 and the sting at 1.15 are their own
  // cues): 高低兩聲出鞘 as the pair flips up from the lower corners (0-0.3), then (0.74) the sabres swung apart — two
  // passes outward, the edges lighting from root to tip (zings, a climbing sheen), 雙聲刀鳴 (the dyad, beating), the two
  // dragon jaws snapping open (0.87 / 0.885)
  {
    const D = 1.25, A = 0.74;
    const v = lib.mix([
      { buf: H.panMove(H.norm(H.swoosh(0.3, 0.1, [250, 1000, 300], { q: 1.1, seed: 'dfw1' })), (t) => 0.6 - 0.4 * H.smooth(t / 0.2)), gain: -8 },
      { buf: H.panMove(H.norm(H.swoosh(0.3, 0.1, [300, 1200, 350], { q: 1.1, seed: 'dfw2' })), (t) => -0.6 + 0.4 * H.smooth(t / 0.2)), at: 0.03, gain: -8 },
      { buf: lib.pan(H.norm(H.shing(0.14, HONG, { seed: 'dfs1', ring: -5, t60: 0.7 })), 0.4), gain: -3 },
      { buf: lib.pan(H.norm(H.shing(0.14, NI, { seed: 'dfs2', ring: -5, t60: 0.7 })), -0.4), at: 0.05, gain: -3 },
      { buf: await H.ld(X.clothHeavy, 0, 0.5, { hp: 150, fadeOut: 0.25 }), gain: -17 },
      { buf: swingVariant(lib, H, src, 1, { hand: 'R', P: 0.05, D: 0.45, seed: 'dfa', panFn: (t) => 0.1 + 0.5 * H.smooth(t / 0.1) }), at: A, gain: -7 },
      { buf: swingVariant(lib, H, src, 4, { hand: 'L', P: 0.05, D: 0.45, seed: 'dfa', panFn: (t) => -0.1 - 0.5 * H.smooth(t / 0.1) }), at: A + 0.01, gain: -7 },
      { buf: lib.pan(H.norm(H.blade(HONG, 1.2, { t60: 1.1, bright: 1.1, seed: 'dfr1' })), 0.35), at: A + 0.06, gain: -4 },
      { buf: lib.pan(H.norm(H.blade(NI, 1.2, { t60: 1.1, bright: 1.15, seed: 'dfr2' })), -0.35), at: A + 0.07, gain: -4 },
      { buf: lib.stereoize(H.norm(lib.automate(H.sheen(0.5, { seed: 'dfsh', d: (t) => Math.max(0.0003, 0.004 - 0.008 * t) }), (t) => H.smooth(t / 0.15) * Math.exp(-Math.max(0, t - 0.2) * 5))), { width: 0.6, hp: 2500, seed: 'dfss' }), at: A, gain: -17 },
      { buf: lib.pan(H.strike(await H.ld(X.metalL(3), 0, 0.2, { hp: 2000, semis: 7 })), 0.3), at: 0.87, gain: -16 },
      { buf: lib.pan(H.strike(await H.ld(X.metalL(4), 0, 0.2, { hp: 2000, semis: 8 })), -0.3), at: 0.885, gain: -17 },
    ], { channels: 2 });
    await cat.add('twinblades_draw_first', H.cut(H.verb(v, 'smallRoom', 0.12, 0.8, 'dfv'), D, 0.3), { lufs: -19, vol: 1.1, spatial: false, channels: 2, voices: 1, pitch: [1, 1], sources: [X.clothHeavy, X.metalL(3), X.katana, X.swoosh] });
  }

  // twinblades_first_sting (主題「雙絕」, 1.15 s into the first draw; also the rare inspect): an upward zither strum (A3 C#4
  // E4 A4), then the two glass 磬 a major third apart — A5, C#6 0.2 s later — ringing together over a soft timpani A2, a
  // glint run climbing out of them
  {
    const D = 2.6;
    const strum = [N.A3, N.Cs4, N.E4, N.A4].map((f, i) => ({ buf: lib.pan(H.pluck(f, 2.0, { t60: 1.6, seed: `fsp${i}` }), -0.3 + i * 0.2), at: i * 0.035, gain: -1 - i * 0.7 }));
    const v = lib.mix([
      ...strum,
      { buf: lib.pan(H.norm(H.qing(N.A5, 2.2, { t60: 2.0, seed: 'fsq1' })), 0.25), at: 0.16, gain: -2 },
      { buf: lib.pan(H.norm(H.qing(N.Cs6, 2.2, { t60: 2.0, seed: 'fsq2' })), -0.25), at: 0.36, gain: -2 },
      { buf: lib.decay(H.strike(await H.ld(X.timpAs2, 0, 3.0, { stereo: true, hp: 35, semis: -1, fadeOut: 0.5 })), 1.4, 0.05), at: 0.16, gain: -13 },
      { buf: lib.pan(H.norm(H.qing(N.A3, 2.2, { t60: 2.0, seed: 'fsq0', tick: -20 })), 0), at: 0.16, gain: -15 },
      { buf: H.norm(H.glints(pent(N.A6, 9), 0.022, { seed: 'fsg', t60: 0.25, fall: 0.7, pans: pent(N.A6, 9).map((_, i) => -0.5 + i * 0.12) })), at: 0.4, gain: -16 },
      { buf: lib.stereoize(H.norm(lib.automate(H.sheen(1.2, { seed: 'fssh', d: (t) => 0.0004 + 0.003 * t }), (t) => H.smooth(t / 0.2) * Math.exp(-t * 2.5))), { width: 0.6, hp: 2500, seed: 'fsss' }), at: 0.36, gain: -25 },
    ], { channels: 2 });
    await cat.add('twinblades_first_sting', H.cut(H.verb(v, 'warehouse', 0.2, 2.0, 'fsv'), D, 0.3), { lufs: -19, vol: 1.3, spatial: false, channels: 2, voices: 1, pitch: [1, 1], sources: [X.timpAs2] });
  }

  // twinblades_inspect (cue 0.44 s into the 4.4 s inspect, §1.12 檢視 主題短樂句, original): the flats turned to the eye
  // (a sheen sweeping each one, a zither rising E4 F#4 A4), the right sabre spun once in the hand (0.7-1.56: a whirr,
  // the zither answering C#5 B4 A4), the ring pommels hooked together (2.02: its own cue) and both pearls lighting (2.2:
  // the 磬 dyad A5 + C#6 over a zither A3), ringing out
  {
    const D = 3.2;
    const notes = [[N.E4, 0.0, -0.3], [N.Fs4, 0.18, -0.1], [N.A4, 0.36, 0.1], [N.Cs5, 0.75, 0.3], [N.B4, 1.05, 0.1], [N.A4, 1.35, -0.1], [N.A3, 2.2, 0], [N.E4, 2.24, 0.2]];
    const sweepR = lib.automate(H.sheen(0.6, { seed: 'insr', d: (t) => 0.0004 + 0.004 * t }), (t) => Math.sin(Math.PI * Math.min(1, t / 0.6)) ** 2);
    const sweepL = lib.automate(H.sheen(0.6, { seed: 'insl', d: (t) => 0.0044 - 0.004 * t }), (t) => Math.sin(Math.PI * Math.min(1, t / 0.6)) ** 2);
    const spin = H.whirr(0.86, () => 1.25, { seed: 'insw', lo: 450, hi: 1400, ring: -6 });
    const v = lib.mix([
      ...notes.map(([f, t, p], i) => ({ buf: lib.pan(H.pluck(f, 2.0, { t60: i >= 6 ? 2.2 : 1.4, bright: 0.6, seed: `inp${i}` }), p), at: t, gain: -6 - (i === 6 ? 2 : 0) })),
      { buf: lib.pan(H.norm(sweepR), 0.35), at: 0.02, gain: -20 },
      { buf: lib.pan(H.norm(sweepL), -0.35), at: 0.3, gain: -20 },
      { buf: lib.pan(H.norm(lib.automate(spin, (t) => H.smooth(t / 0.05) * (t > 0.75 ? Math.exp(-(t - 0.75) * 12) : 1))), 0.3), at: 0.7, gain: -14 },
      { buf: lib.pan(H.norm(H.blade(HONG, 1.0, { t60: 0.6, seed: 'inr' })), 0.3), at: 1.56, gain: -16 },
      { buf: lib.pan(H.norm(H.qing(N.A5, 1.6, { t60: 1.6, seed: 'inq1', tick: -16 })), 0.25), at: 2.2, gain: -8 },
      { buf: lib.pan(H.norm(H.qing(N.Cs6, 1.6, { t60: 1.6, seed: 'inq2', tick: -16 })), -0.25), at: 2.2, gain: -9 },
      { buf: await H.ld(X.cloth, 0, 0.34, { hp: 150 }), at: 0.68, gain: -20 },
    ], { channels: 2 });
    await cat.add('twinblades_inspect', H.cut(H.verb(v, 'warehouse', 0.2, 1.8, 'inv'), D, 0.2), { lufs: -20, vol: 1.2, spatial: false, channels: 2, voices: 1, pitch: [1, 1], sources: [X.cloth] });
  }

  // twinblades_link (2.46 s into the inspect): 環扣「喀」 — the two ring pommels hooking together: a hard click and its
  // little echo 25 ms later, the jade beads jingling, a low knock, a faint rainbow shimmer as the arch forms
  {
    const out = [];
    for (let k = 0; k < 2; k++) {
      const v = lib.mix([
        { buf: H.strike(await H.ld(X.metalL(k), 0, 0.25, { hp: 1200, semis: 4 })), gain: -2 },
        { buf: H.K.tick(`lkt${k}`, 2800), gain: -6 },
        { buf: H.strike(await H.ld(X.metalL(k + 2), 0, 0.2, { hp: 1500, semis: 6 })), at: 0.025, gain: -9 },
        { buf: H.norm(H.K.jingle(0.2, 5, `lkj${k}`)), at: 0.03, gain: -14 },
        { buf: lib.thump({ f0: 170, f1: 90, sweep: 0.015, decay: 0.05, click: 0.3, drive: 1.4, seed: `lkb${k}` }), gain: -12 },
        { buf: H.norm(H.glints(pent(N.A6, 7), 0.03, { seed: `lkg${k}`, t60: 0.3, fall: 0.6 })), at: 0.08, gain: -20 },
      ]);
      out.push(H.shape(H.cut(lib.stereoize(H.verb(v, 'smallRoom', 0.12, 0.5, `lkv${k}`, 1), { width: 0.3, hp: 1200, seed: `lks${k}` }), 0.9, 0.4), -19));
    }
    await cat.add('twinblades_link', out, { lufs: -19, vol: 1.1, spatial: false, channels: 2, voices: 1, pitch: [0.99, 1.01], sources: [X.metalL(0), X.metalL(2)] });
  }

  // twinblades_recover (收招, cue 0.09 s into the 0.9 s clip): each sabre spun once in its hand (虹 0.02-0.47, 霓 0.05-0.5:
  // a whirr each, right and left), the blood flicked off (a wet spatter), the two rings as they snap back to the stance
  {
    const out = [];
    const spat = await H.ld(X.wet, 0.07, 0.54, { hp: 400 });
    for (let k = 0; k < 3; k++) {
      const D = 1.1;
      const w1 = lib.automate(H.whirr(0.45, () => 2.2, { seed: `rcw1${k}`, lo: 500, hi: 1600 }), (t) => H.smooth(t / 0.05) * (t > 0.4 ? Math.exp(-(t - 0.4) * 20) : 1));
      const w2 = lib.automate(H.whirr(0.45, () => 2.2, { seed: `rcw2${k}`, lo: 600, hi: 1900 }), (t) => H.smooth(t / 0.05) * (t > 0.4 ? Math.exp(-(t - 0.4) * 20) : 1));
      const drops = lib.mix([0, 0.03, 0.05].map((t, i) => ({ buf: lib.varispeedSemis(spat, 2 + i * 2), at: t, gain: -i * 4 })));
      const v = lib.mix([
        { buf: lib.pan(H.norm(w1), 0.4), at: 0.02, gain: -10 },
        { buf: lib.pan(H.norm(w2), -0.4), at: 0.05, gain: -10 },
        { buf: lib.stereoize(H.norm(H.strike(drops)), { width: 0.6, hp: 600, seed: `rcd${k}` }), at: 0.2 + k * 0.03, gain: -19 },
        { buf: lib.pan(H.norm(H.blade(HONG, 1.0, { t60: 0.7, seed: `rcr${k}` })), 0.35), at: 0.47, gain: -8 },
        { buf: lib.pan(H.norm(H.blade(NI, 1.0, { t60: 0.7, seed: `rcl${k}` })), -0.35), at: 0.5, gain: -8 },
        { buf: await H.ld(X.cloth, 0, 0.34, { hp: 150 }), at: 0.45, gain: -18 },
      ], { channels: 2 });
      out.push(H.cut(H.verb(v, 'smallRoom', 0.12, 0.6, `rcv${k}`), D, 0.4));
    }
    await cat.add('twinblades_recover', out, { lufs: -21, vol: 1.2, spatial: false, channels: 2, voices: 1, pitch: [0.98, 1.02], maxHeadMs: 60, sources: [X.wet, X.cloth] });
  }
}

// ---------------------------------------------------------------------------------------------- other
async function other(lib, ctx, cat, H, keep) {
  // ready_twinblades: §1.12 unique ready — two glass 磬 a major third apart (A6 + C#7) struck together, a second pair a
  // hair sharp beating against them (an iridescent shimmer), the sabres answering an octave down, and a seven-colour
  // glint run leaping up from them: bright, glassy, unmistakable (it repeats softly every 2.5 s)
  {
    const D = 1.9;
    const run7 = pent(N.A7, 7);
    const v = lib.mix([
      { buf: lib.pan(H.norm(H.qing(N.A6, D, { t60: 1.6, seed: 'rdq1', tick: -10 })), 0.25) },
      { buf: lib.pan(H.norm(H.qing(N.Cs7, D, { t60: 1.6, seed: 'rdq2', tick: -10 })), -0.25), gain: -1 },
      { buf: lib.pan(H.norm(H.glass(N.A6 * 1.003, D, { t60: 1.2, seed: 'rdg1' })), -0.3), gain: -12 },
      { buf: lib.pan(H.norm(H.glass(N.Cs7 * 1.003, D, { t60: 1.2, seed: 'rdg2' })), 0.3), gain: -13 },
      { buf: lib.pan(H.norm(H.blade(HONG, 1.2, { t60: 0.8, seed: 'rdr' })), 0.35), at: 0.004, gain: -13 },
      { buf: lib.pan(H.norm(H.blade(NI, 1.2, { t60: 0.8, seed: 'rdl' })), -0.35), at: 0.006, gain: -13 },
      { buf: H.norm(H.glints(run7, 0.016, { seed: 'rdgl', t60: 0.22, fall: 0.6, pans: run7.map((_, i) => -0.6 + i * 0.2) })), at: 0.012, gain: -12 },
      { buf: H.lux('rdx'), gain: -15 },
    ], { channels: 2 });
    const out = H.shape(H.cut(H.verb(v, 'warehouse', 0.2, 1.5, 'rdv'), D, 0.35), -18);
    await cat.add('ready_twinblades', out, { lufs: -18, bus: 'ui', spatial: false, channels: 2, voices: 2, pitch: [1, 1], priority: 3 });
    keep.ready = out;
  }

  // twinblades_crisis: 虹障 (§1.12 危機護甲: 瓷器碎裂＋元素尾音) — two crossed spirit blades flash up (a shing, the dyad),
  // take the blow (a steel jolt and a heavy thud), burst into twelve prism shards (a plate and glass breaking, shards,
  // a sprinkle), and the prism's tail: glints falling, the sheen, a glass chord fading
  {
    const out = [];
    for (let k = 0; k < 2; k++) {
      const D = 1.9, B = 0.1;
      const v = lib.mix([
        { buf: H.norm(H.shing(0.06, HONG, { seed: `crs${k}`, ring: -4, t60: 0.6 })), gain: -6 },
        { buf: H.norm(H.blade(NI, 0.8, { t60: 0.5, seed: `crn${k}` })), at: 0.05, gain: -10 },
        { buf: H.strike(await H.ld(X.metalH(k + 1), 0, 0.4, { hp: 200, semis: 2 })), at: B },
        { buf: H.strike(await H.ld(X.metalHit, 0, 0.3, { hp: 300 })), at: B, gain: -5 },
        { buf: H.boom(`crb${k}`, { f0: 110, f1: 46, decay: 0.4, drive: 2.4 }), at: B, gain: -2 },
        { buf: H.strike(await H.ld(X.plate, 0.02, 1.08, { hp: 250, semis: k ? 1 : 0 })), at: B + 0.01, gain: -1 },
        { buf: H.strike(await H.ld(X.glassBreak, 0.3, 1.3, { hp: 400, semis: -2 })), at: B + 0.02, gain: -5 },
        { buf: H.strike(await H.ld(X.shard, 0.01, 0.33, { hp: 1500 })), at: B + 0.06, gain: -9 },
        { buf: H.norm(H.tinkles(1.0, 16, { seed: `crt${k}`, lo: 2500, hi: 8000 })), at: B + 0.04, gain: -11 },
        { buf: H.norm(H.glints(pent(N.A6, 9).reverse(), 0.045, { seed: `crg${k}`, t60: 0.25, fall: 0.8 })), at: B + 0.1, gain: -11 },
        { buf: H.norm(lib.automate(H.sheen(1.2, { seed: `crsh${k}`, d: (t) => 0.0003 + 0.005 * t }), (t) => Math.min(1, t / 0.03) * Math.exp(-t * 2.8))), at: B + 0.03, gain: -14 },
        { buf: H.norm(lib.mix([N.A6, N.Cs7, N.E7].map((f, i) => ({ buf: H.glass(f, 1.5, { t60: 1.2, seed: `crc${k}${i}` }), gain: -i })))), at: B + 0.08, gain: -15 },
      ]);
      out.push(H.shape(H.cut(H.verb(v, 'alley', 0.15, 1.2, `crv${k}`, 1), D, 0.4), -15));
    }
    await cat.add('twinblades_crisis', out, { lufs: -15, vol: 1.12, spatial: true, range: [4, 60], voices: 2, pitch: [0.98, 1.02], sources: [X.metalH(1), X.metalHit, X.plate, X.glassBreak, X.shard] });
  }

  // twinblades_final: KE_FINAL — two 4 m spirit blades cross-cut the last kill from the sky (0.25 s fall): two falling
  // whistles converging, then the crossed 「錚」 (the dyad an octave down over the sabres' own), a blow, the street
  // cracking, a ring of sheen and glints, a rumble
  {
    const out = [];
    const smash = H.tight(H.strike(await H.ld(X.concSmash, 0, 1.0, { hp: 50 })), 0.6);
    for (let k = 0; k < 2; k++) {
      const D = 2.1, B = 0.25;
      const fallR = lib.automate(lib.mix([{ buf: lib.tone(B + 0.02, { freq: (t) => 3000 * (900 / 3000) ** (t / B) }) }, { buf: lib.sweep(lib.noise(B + 0.02, { color: 'pink', seed: `fnn${k}` }), 'bp', (t) => 2600 * (700 / 2600) ** (t / B), { q: 1.4 }), gain: -2 }]),
        (t) => (t / B) ** 2 * (t > B - 0.01 ? Math.max(0, (B + 0.01 - t) / 0.02) : 1));
      const fallL = lib.automate(lib.mix([{ buf: lib.tone(B + 0.02, { freq: (t) => 3700 * (1100 / 3700) ** (t / B) }) }, { buf: lib.sweep(lib.noise(B + 0.02, { color: 'pink', seed: `fnm${k}` }), 'bp', (t) => 3200 * (850 / 3200) ** (t / B), { q: 1.4 }), gain: -2 }]),
        (t) => (t / B) ** 2 * (t > B - 0.01 ? Math.max(0, (B + 0.01 - t) / 0.02) : 1));
      const v = lib.mix([
        { buf: H.norm(fallR), gain: -9 },
        { buf: H.norm(fallL), gain: -10 },
        { buf: H.norm(H.blade(N.A4, 1.8, { t60: 1.4, bright: 1.2, seed: `fna${k}` })), at: B, gain: -2 },
        { buf: H.norm(H.blade(N.Cs5, 1.8, { t60: 1.4, bright: 1.2, seed: `fnc${k}` })), at: B + 0.006, gain: -3 },
        { buf: H.norm(H.blade(HONG, 1.5, { t60: 1.1, seed: `fnr${k}` })), at: B + 0.003, gain: -7 },
        { buf: H.norm(H.blade(NI, 1.5, { t60: 1.1, seed: `fnl${k}` })), at: B + 0.008, gain: -7 },
        { buf: H.strike(await H.ld(X.metalL(k + 1), 0, 0.3, { hp: 800, semis: 3 })), at: B, gain: -5 },
        { buf: H.K.crack(`fnk${k}`, { dur: 0.015, decay: 0.004, hp: 1500 }), at: B, gain: -5 },
        { buf: H.boom(`fnb${k}`, { f0: 100, f1: 45, decay: 0.42, drive: 2.2 }), at: B, gain: -1 },
        { buf: H.strike(smash), at: B, gain: -7 },
        { buf: H.strike(await H.ld(X.stoneDebris, 0, 0.39, { hp: 250 })), at: B + 0.015, gain: -9 },
        { buf: H.norm(lib.automate(H.sheen(0.9, { seed: `fns${k}`, d: (t) => 0.0003 + 0.005 * t }), (t) => Math.min(1, t / 0.01) * Math.exp(-t * 4.5))), at: B, gain: -13 },
        { buf: H.norm(H.glints([...pent(N.A6, 6), ...pent(N.A6, 6).reverse()], 0.03, { seed: `fng${k}`, t60: 0.25, fall: 0.5 })), at: B + 0.03, gain: -15 },
        { buf: H.norm(H.rumble(1.4, `fnr${k}`, { lp: 170, t60: 1.0 })), at: B + 0.05, gain: -13 },
      ]);
      const e = lib.eq(v, [{ type: 'hp', f: 32, order: 2 }, { type: 'lowshelf', f: 80, gain: -2 }, { type: 'peak', f: 2000, gain: 2, q: 0.7 }]);
      out.push(H.shape(H.cut(H.verb(e, 'urban', 0.18, 1.4, `fnv${k}`, 1), D, 0.4), -15));
    }
    await cat.add('twinblades_final', out, { lufs: -15, vol: 1.2, spatial: true, range: [8, 100], voices: 1, pitch: [0.99, 1.01], maxHeadMs: 260, sources: [X.concSmash, X.metalL(1), X.stoneDebris] });
  }
}

/** 虹霓．夜曜 twin cues (§1.12 雙生版: the originals -4 st with an echo); a twin handler would play `${cue}_night`. */
async function twins(lib, ctx, cat, H, keep) {
  const T = (b) => H.twin(b);
  await cat.add('ready_twinblades_night', T(keep.ready), { lufs: -18, bus: 'ui', spatial: false, channels: 2, voices: 2, pitch: [1, 1], priority: 3, note: 'twin: ready_twinblades -4 st + echo' });
  for (const hand of ['R', 'L']) {
    await cat.add(`twinblades_swing_${hand.toLowerCase()}_night`, keep[`swing${hand}`].slice(0, 4).map((b) => H.shape(lib.fadeOut(lib.slice(T(b), 0, 0.85), 0.3, 'exp'), -16)),
      { lufs: -16, spatial: false, channels: 2, voices: 3, pitch: [0.98, 1.02], note: `twin: twinblades_swing_${hand.toLowerCase()} -4 st + echo` });
  }
  await cat.add('twinblades_ult_cast_night', H.shape(T(keep.cast[0]), -15), { lufs: -15, vol: 1.1, spatial: true, range: [10, 120], voices: 2, pitch: [1, 1], priority: 3, maxHeadMs: 80 });
  await cat.add('twinblades_ult_bloom_night', H.shape(T(keep.bloom), -14, { max: 5 }), { lufs: -14, vol: 1.25, maxLimitDb: 6, spatial: true, range: [15, 160], voices: 2, pitch: [1, 1], priority: 3 });
  await cat.add('twinblades_ult_bed_night', T(keep.bed), { lufs: -18, vol: 1.3, spatial: false, channels: 2, voices: 1, pitch: [1, 1] });
  await cat.add('twinblades_ult_shatter_night', H.shape(T(keep.shatter), -16), { lufs: -16, vol: 1.35, spatial: true, range: [12, 140], voices: 2, pitch: [1, 1] });
}

/** Reference mixes as the player hears them (logged + previewed, not shipped). */
function references(lib, ctx, H, keep) {
  const at = (b, l, t, vol = 1) => ({ buf: H.atLufs(b, l), at: t, gainLin: vol });
  const log = (name, b) => { const L = lib.loudness(b); ctx.log(`  ${name}: ${L.integrated.toFixed(1)} LUFS integrated, momentary max ${L.momentaryMax.toFixed(1)}, short-term max ${L.shortTermMax.toFixed(1)}, peak ${lib.lin2db(lib.peak(b)).toFixed(1)} dBFS`); ctx.preview(name, b); };
  if (keep.swingR && keep.hit && keep.clash && keep.wave) {
    // 疾虹五連 tapped at the chain limit (each cut starts as the last ends), two bodies a cut, a kill on ② and ⑤:
    // swing cue at t0 + hit * 0.4, the bite at t0 + hit (hit 0.96 / 1.08 by hand), flesh per body; ⑤ the clash + the wave
    const parts = [], steps = [[0, 'R', 0.08], [0.25, 'L', 0.08], [0.5, 'R', 0.09], [0.77, 'L', 0.09]];
    for (const [i, [t0, h, c]] of steps.entries()) {
      parts.push(at(keep[`swing${h}`][i], -16, t0 + c * 0.4, 0.9), at(lib.varispeed(keep.hit[i], h === 'L' ? 1.08 : 0.96), -16, t0 + c, 0.8),
        at(keep.flesh[i], -17, t0 + c, 0.7), at(keep.flesh[i + 1], -17, t0 + c + 0.015, 0.6));
      if (i === 1) parts.push(at(keep.kill[0], -19, t0 + c, 1.4 * 0.6));
    }
    const X0 = 1.04;
    parts.push(at(keep.cross[0], -15, X0 + 0.088, 0.9), at(keep.clash[0], -17, X0 + 0.222, 1.2), at(keep.hit[2], -16, X0 + 0.22, 1), at(keep.wave[0], -16.5, X0 + 0.22, 0.9 * 1.19),
      at(keep.flesh[2], -17, X0 + 0.22, 0.7), at(keep.kill[1], -19, X0 + 0.22, 1.4 * 0.6), at(keep.kill[2], -19, X0 + 0.26, 1.4 * 0.6));
    log('combo_timeline', lib.mix(parts, { channels: 2 }));
  }
  if (keep.charge && keep.dash && keep.after) {
    // 虹貫: the stance held 0.9 s (the charge loop at 0.5, rate 0.85 -> 1.2 over 0.6 s), the dash, three pass cuts, the
    // after-cut 0.3 s after the 0.2 s dash (+ _hit)
    const c = keep.charge;
    const cl = lib.automate(lib.varispeedCurve(lib.concat([c, c]), [[0, 0.85], [0.6, 1.2], [6, 1.2]]), (t) => (t < 0.9 ? 1 : Math.max(0, 1 - (t - 0.9) / 0.08)));
    log('dash_timeline', lib.mix([at(cl, -18, 0, 0.5), at(keep.dash[0], -14, 0.9, 1), ...[0.95, 1.0, 1.05].map((t, i) => at(lib.varispeed(keep.flesh[i], 1.15), -17, t, 0.6)),
      at(keep.after[0], -16, 1.4, 1.4), at(keep.hit[0], -16, 1.4, 1)], { channels: 2 }));
  }
}

// ---------------------------------------------------------------------------------------------- producer
export async function produce(lib, ctx) {
  const only = process.env.TB_ONLY ? new Set(process.env.TB_ONLY.split(',').map((s) => s.trim())) : null;
  const want = (g) => !only || only.has(g);
  const cat = ctx.category('premium_twinblades', { bus: 'sfx' });
  const H = kit(lib, ctx);
  // build log: the pre-shaping of each sound, "natural PLR -> shaped PLR" per variant (the drive is capped)
  const add = cat.add.bind(cat);
  cat.add = (name, v, o) => {
    const s = H.shapeLog.splice(0);
    if (s.length) ctx.log(`  shape ${name} @${s[0][0]}: ${s.map((x) => `${x[1]}->${x[2]}`).join(' ')}`);
    return add(name, v, o);
  };
  const keep = {};
  if (want('swing') || want('twin')) await swings(lib, ctx, cat, H, keep);
  if (want('hits')) await hits(lib, ctx, cat, H, keep);
  if (want('dash')) await dash(lib, ctx, cat, H, keep);
  if (want('guard')) await guard(lib, ctx, cat, H, keep);
  if (want('storm')) await storm(lib, ctx, cat, H, keep);
  if (want('ult') || want('twin')) await ult(lib, ctx, cat, H, keep);
  if (want('view')) await view(lib, ctx, cat, H, keep);
  if (want('other') || want('twin')) await other(lib, ctx, cat, H, keep);
  if (want('twin')) await twins(lib, ctx, cat, H, keep);
  references(lib, ctx, H, keep);
  await cat.write();
}
