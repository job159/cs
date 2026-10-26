// 刑天．舞戚 Xingtian Wardancer (神兵 X05 great axe, docs/PREMIUM_WEAPONS.md §2.32 + §1.12) — category
// 'premium_greataxe': every cue game/src/weapons/premium/greataxe.js plays (its SFX table + the clips' 'snd' events),
// the def.sound contract layers (greataxe_close / _tail / _far) and the reserved twin 刑天．夜舞 (`<cue>_night`).
// CC0 recordings from the shared inventory (VSCO 2 bass drum / timpani / gongs / cymbals / F horn, crowd choir, a
// Chinese-opera cymbal, beast roars and war grunts, fire whooshes, sword whooshes, metal clangs, Kenney metal,
// concrete / rubble / debris, explosions, porcelain and glass, flesh / bone) and synthesis. Palette: the Shang bronze
// 鉞 (a thick cast plate: inharmonic modes as slow-beating doublets, 銅鳴), a 銅鉦 (a struck bronze bell-gong with its
// minor-third second tone), the 戰鼓 (the concert bass drum fff + a membrane thump + the beater), the mask's roar (beasts
// through a bronze throat), the molten crimson fire (flame flutter + embers), and the street (concrete, rubble, 40-80 Hz
// booms). Every tuned part sits in D 羽 pentatonic (D F G A C).
//
//   swing    greataxe_swing (斜劈 / 回掄, played c.hit / 2 into the swing: the whoosh peaks 0.13 s in, where the blade
//            lands), _swing_heavy (開山 / the leap: peaks 0.21 s in), greataxe_close / _tail / _far (def.sound contract)
//   hits     _hit (鈍鐵入肉＋銅鳴, once per connecting swing), _hit_flesh (a body), _hit_wall (iron edge on stone),
//            _kill (鈍斬＋銅鉦), _sever (斷肢), _chop_ground (開山 into the street + the fissure running away)
//   天墜     _charge (loop, rate 0.8 -> 1.25 by the handler: a rising growl), _charge_stage (重鼓), _charge_full (the
//            crescent flares, played +2 st), _leap (起跳風聲), _land (the smash), _quake (one shockwave ring 轟)
//   狂旋     _spin_start, _spin (loop: the whirl, a pass every 0.48 s over the vortex and the flame), _spin_hit,
//            _spin_end (the outward burst)
//   迴戚     _throw (the hurl), _fly (loop, positional: the spinning axe), _return (呼嘯由遠而近), _catch (鏘)
//   ult      §1.12 three layers: rise (_ult_roar: 戰吼＋大鼓 with the fire column, _ult_rise: the spirit's underground
//            growl rising) -> 40-60 Hz impact (_ult_impact) -> 北管-style drums, gong, horns and choir (_ult_bed, scored to
//            the 猛志 timeline) + release (_ult_shatter: bronze breaking, the deflating sigh). Beats: _ult_sigil (鉦一聲),
//            _ult_sweep (巨大風切), _ult_chop (the falling chop)
//   view     greataxe_idle (loop: 55 / 73 / 110 Hz + a 400-1200 Hz band swept at 0.2 Hz + the furnace, §1.12), _draw,
//            _draw_first (鐵刃刮石＋銅響＋兩聲重鼓), _roar (the mask), _first_sting (主題「猛志」), _inspect (§1.12: an
//            original 3 s phrase on bronze bells over a slow drum), _jaw (咬合「喀」), _recover (半聲銅鳴)
//   other    ready_greataxe (unique: a war-drum double stroke, the mask's growl, a 鉦), _crisis (干盾: bronze + glaze
//            breaking + the fire tail), _final (KE_FINAL spirit axe)
//   twin     <cue>_night for 刑天．夜舞 (ready, swing, ult roar / rise / impact / bed / shatter): -4 st, darker, an echo
//            (§1.12). Not played yet (the twin is reserved).
//
// Mastering: every file within 1 LU of its target at <= -1 dBTP (decoded). Pre-shaping soft-clips at most ~6 dB of
// drive (logged "natural -> shaped PLR"); ringing cues are mastered lower and lifted with the manifest vol instead of
// being crushed. Logged references: the combo, the leap and the ultimate as the player hears them.
//
//   node --max-old-space-size=2048 tools/audio/build.mjs --only premium_greataxe
//   dev subset (never into the game folder: a subset run removes the other files of the category it writes):
//   CF_AUDIO_OUT=tools/audio/out/ga-dev GA_ONLY=swing,hits node --max-old-space-size=2048 \
//     tools/audio/run-producer.mjs tools/audio/producers/premium_greataxe.mjs --spectrograms all
import { makeKit } from './weapons.mjs';

const SR = 48000;
const NYQ = 17000;
const midi = (m) => 440 * 2 ** ((m - 69) / 12);
// D 羽 pentatonic
const N = {
  D1: midi(26), A1: midi(33), D2: midi(38), F2: midi(41), G2: midi(43), A2: midi(45), C3: midi(48), D3: midi(50), F3: midi(53), G3: midi(55), A3: midi(57),
  C4: midi(60), D4: midi(62), F4: midi(65), G4: midi(67), A4: midi(69), C5: midi(72), D5: midi(74), F5: midi(77), G5: midi(79), A5: midi(81), C6: midi(84), D6: midi(86),
};

// ---------------------------------------------------------------------------------------------- sources
const X = {
  // air / blades
  whoom: 'fs:60024', katana: 'fs:263595', swoosh: 'fs:507466', wind: 'fs:146932',
  // fire
  fireWhoosh: 'fs:244926', fireB: 'fs:260554', fireB2: 'fs:260555', combust: 'fs:412558', crackle: 'fs:181563',
  // drums / bronze percussion
  bdFff: 'fs:375260', bdMuted: 'fs:375265', bdRoll: 'fs:375282', timpRoll: 'fs:373943', timp: 'fs:373919',
  gong: 'fs:375532', gongHard: 'fs:375531', gongScrape: 'fs:375550', gongCh: 'fs:127265', opera: 'fs:452400', crash: 'fs:375497', suspRoll: 'fs:375519',
  // horns / choir
  hornD3: 'fs:373257', hornA3: 'fs:373253', hornDs2: 'fs:373256', choirUh: 'fs:764343', choirA: 'fs:764329',
  // beasts / war voices
  tiger: 'fs:263115', mroar: 'fs:132874', didg: 'fs:204912', snarl: 'fs:342204', mgrowl: 'fs:481642', grunts: 'fs:770124',
  // metal
  clangDeep: 'fs:201094', metalHit: 'fs:406562', metalThud: 'fs:640204', tankDebris: 'fs:530209', chain: 'fs:361798',
  metalH: (k) => `kenney_impact/Audio/impactMetal_heavy_00${k % 5}`, metalL: (k) => `kenney_impact/Audio/impactMetal_light_00${k % 5}`,
  // stone / debris / blasts
  concSmash: 'fs:522099', concHit: 'fs:321477', stoneHeavy: 'fs:513694', rubbleScrape: 'fs:758580', stoneDebris: 'fs:569510', rockFall: 'fs:232137',
  debrisBig: 'fs:703247', debris: 'fs:703248', dirt: 'fs:386799', earth: 'fs:129281', iceCrack: 'fs:342546',
  deepBoom: 'fs:258195', blast: 'fs:523089', longCrash: 'fs:366086',
  // flesh / bone
  chop: 'fs:269483', gash: 'fs:420674', slice: 'fs:504615', meaty: 'fs:779805', wet: 'fs:626405', gross: 'fs:641040', gore: 'fs:641046',
  bone: 'fs:355052', fracture: 'fs:488659', boneSnap: 'fs:578874', neck: 'fs:134025', splat: 'fs:414296', punch: 'fs:399183',
  // glaze / glass
  plate: 'fs:565642', glassBreak: 'fs:221528', shard: 'fs:203381',
  // foley
  cloth: 'fs:494797', clothHeavy: 'fs:163164', wood: 'fs:183453',
};
// the four katana passes in fs:263595
const KATANA = [[0.001, 0.3], [0.521, 0.81], [1.053, 1.35], [1.507, 1.831]];
// fs:770124: seven war grunts "HUH!" ([start, end] s)
const GRUNT = [[0.02, 0.32], [1.03, 1.38], [2.03, 2.43], [3.05, 3.5], [3.97, 4.45], [5.05, 5.48], [6.0, 6.43]];

// ---------------------------------------------------------------------------------------------- toolkit
function kit(lib, ctx) {
  const { Buf } = lib;
  const K = makeKit(lib, ctx);
  const rng = (s) => ctx.rng(s);
  const norm = (b, db = -1) => lib.normalizePeak(b, db);
  const mono = (b) => (b.channels === 1 ? b : lib.toMono(b));
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
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
  const env = (b, pts) => lib.automate(b, pts);
  /** Dry + a room whose send is high-passed (`hp` Hz): booms stay tight, the space carries the body and the air. */
  const verb = (b, room, wet, len, seed, ch = 2, hp = 170) => {
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
  /** A sub-heavy source shortened: it decays with t60 from 20 ms in (booms stay punchy, not a sustained block). */
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
  /**
   * Loop QA: the wrap step against the file's typical sample step, and the level of a 0.2 s window straddling the seam
   * against the same window one rhythmic `period` (s) further on, averaged over the loop (a pulsing loop is louder on
   * its beats: comparing the head with the tail would flag the rhythm, not the seam).
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
  const parts = (dur, base, list, seed) => lib.partials(dur, { base, list: list.filter(([r]) => base * r < NYQ), seed });
  /**
   * 銅鳴: the axe head is a thick cast-bronze plate — inharmonic plate modes, each a close doublet (the casting is not
   * symmetric), so the ring beats slowly; the higher modes die first. Dark and heavy next to a steel blade's ring.
   */
  const PLATE = [[1, 1, 1], [1.51, 0.62, 0.72], [2.03, 0.42, 0.55], [2.78, 0.34, 0.42], [3.44, 0.22, 0.32], [4.39, 0.13, 0.22], [5.62, 0.08, 0.14], [7.1, 0.05, 0.09]];
  function bronze(f0, dur, { seed = 'bz', t60 = 0.8, bright = 1, beat = 0.004, attack = 0 } = {}) {
    const list = [];
    PLATE.forEach(([r, a, k], i) => { const amp = i ? a * bright : a; list.push([r, amp, t60 * k], [r * (1 + beat * (1 + i * 0.5)), amp * 0.6, t60 * k * 0.85]); });
    let b = parts(dur, f0, list, seed);
    if (attack > 0) b = lib.applyEnv(b, lib.envCurve(dur, [[0, 0], [attack, 1], [dur, 1]]));
    return b;
  }
  /**
   * 銅鉦: a struck bronze bell-gong — the hum an octave down, the strike tone, its minor-third second tone (the two-tone
   * bronze of the 編鐘 family), fifth, octave and the high inharmonic set, each as a slow-beating pair, plus the mallet.
   */
  const ZHENG = [[0.5, 0.18, 1.5], [1, 1, 1], [1.19, 0.58, 0.85], [1.5, 0.16, 0.5], [2, 0.42, 0.5], [2.38, 0.24, 0.36], [2.98, 0.14, 0.26], [4.16, 0.09, 0.16], [5.43, 0.05, 0.1]];
  function zheng(f, dur, { seed = 'zh', t60 = 1.6, bright = 1, tick = -16 } = {}) {
    const list = [];
    for (const [r, a, k] of ZHENG) { const amp = r <= 1 ? a : a * bright; list.push([r, amp, t60 * k], [r * 1.0028, amp * 0.5, t60 * k * 0.8]); }
    const t = lib.noiseBurst({ dur: 0.02, attack: 0.0003, decay: 0.004, bp: Math.min(6000, f * 3), q: 0.8, seed: seed + 't' });
    return lib.mix([{ buf: parts(dur, f, list, seed) }, { buf: t, gain: tick }]);
  }
  /** Bronze bells in sequence: notes at i * step (s). */
  function run(notes, step, { seed = 'run', t60 = 1.2, dur = 1.6, gains = [], pans = null, tick = -16, bright = 1, jitter = 0 } = {}) {
    const r = rng(seed);
    return lib.mix(notes.map((f, i) => ({ buf: zheng(f, dur, { seed: `${seed}${i}`, t60, tick, bright }), at: Math.max(0, i * step + (jitter ? r.range(-jitter, jitter) : 0)), gain: gains[i] ?? 0, ...(pans ? { pan: pans[i] } : {}) })), pans ? { channels: 2 } : {});
  }
  /** Smoothed random level in [1 - depth, 1] changing `rate` times a second (a flame's flutter). */
  function flutter(dur, rate, depth, seed) {
    const r = rng(seed), n = Math.ceil(dur * rate) + 3, v = Array.from({ length: n }, () => r.next());
    return (t) => {
      const x = Math.max(0, t) * rate, i = Math.min(n - 2, Math.floor(x)), f = x - i;
      const s = v[i] + (v[i + 1] - v[i]) * (0.5 - 0.5 * Math.cos(Math.PI * f));
      return 1 - depth + depth * s;
    };
  }
  /** The crimson flame: brown + pink noise in a band, fluttering, with a few crackles. Raw: callers envelope it. */
  function flame(dur, { seed = 'fl', lo = 180, hi = 1400, rate = 12, depth = 0.7, crackle = -18 } = {}) {
    const base = lib.mix([{ buf: lib.noise(dur, { color: 'pink', seed: seed + 'p' }) }, { buf: norm(lib.noise(dur, { color: 'brown', seed: seed + 'b' })), gain: -4 }]);
    const band = lib.eq(base, [{ type: 'hp', f: lo, order: 2 }, { type: 'lp', f: hi, order: 2 }]);
    const fl = lib.automate(norm(band), flutter(dur, rate, depth, seed + 'f'));
    const cr = lib.crackle(dur, { density: 36, decay: 0.002, hp: 2400, seed: seed + 'c' });
    return norm(lib.mix([{ buf: fl }, { buf: norm(cr), gain: crackle }]));
  }
  /** Embers and bronze sparks: tiny crackle pops and short bright metal pings, thinning out over `dur`. */
  function embers(dur, n, { seed = 'em', lo = 2600, hi = 7500, t60 = 0.05, skew = 1.4, fall = 8, pops = 0.55 } = {}) {
    const r = rng(seed), out = [];
    for (let i = 0; i < n; i++) {
      const at = Math.pow(r.next(), skew) * dur;
      if (r.next() < pops) out.push({ buf: lib.noiseBurst({ dur: 0.012, attack: 0.0002, decay: 0.0016, hp: 1800, lp: 10000, seed: `${seed}p${i}` }), at, gain: -r.next() * 8 - (at / dur) * fall });
      else { const f = lo * Math.pow(hi / lo, r.next()); out.push({ buf: parts(t60 * 4, f, [[1, 1, t60], [1.51, 0.4, t60 * 0.7], [2.78, 0.25, t60 * 0.5]], `${seed}${i}`), at, gain: -5 - r.next() * 8 - (at / dur) * fall }); }
    }
    return norm(lib.mix(out, { length: dur + t60 * 4 }));
  }
  /** Swept band-noise whoosh peaking at `peak`: centre f0 -> fp (at the peak) -> f1. */
  function swoosh(dur, peak, [f0, fp, f1], { q = 1.6, color = 'pink', seed = 'sw', rise = 2, fall = 6 } = {}) {
    const F = (t) => (t < peak ? f0 * (fp / f0) ** (t / peak) : fp * (f1 / fp) ** ((t - peak) / (dur - peak)));
    const s = lib.sweep(lib.noise(dur, { color, seed }), 'bp', F, { q });
    return lib.automate(s, (t) => (t < peak ? (t / peak) ** rise : Math.exp(-(t - peak) * fall / (dur - peak))));
  }
  /** Low impact: pitched-down thump with harmonics so laptop speakers carry it. */
  const boom = (seed, { f0 = 75, f1 = 42, sweep = 0.06, decay = 0.5, drive = 2.5, amount = -3.5 } = {}) => lib.psychoBass(lib.thump({ f0, f1, sweep, decay, click: 0.1, drive, seed }), { freq: 110, amount });
  /** Brown-noise rumble under `lp` Hz, rising in `a` s and dying with t60. */
  const rumble = (dur, seed, { lp = 200, a = 0.02, t60 = 1.2 } = {}) => lib.automate(lib.eq(lib.noise(dur, { color: 'brown', seed }), [{ type: 'lp', f: lp, order: 2 }, { type: 'hp', f: 30, order: 2 }]), (t) => Math.min(1, t / a) * Math.exp(-t * 6.9 / t60));
  /** The mask's throat: the voice rung through a short cast-bronze resonance (銅鑼泛音 on a roar). */
  function throat(b, f = 300, { wet = 0.55, t60 = 0.22, seed = 'th' } = {}) {
    const ir = norm(bronze(f, t60 * 1.6, { t60, bright: 1.3, seed }), 0);
    const w = lib.convolve(mono(b), ir, { wetOnly: true });
    return lib.mix([{ buf: b }, { buf: lib.scale(w, lib.peak(b) / Math.max(1e-9, lib.peak(w))), gainLin: wet }]);
  }
  // ---- the 戰鼓: the concert bass drum fff (skin + hall) taken short, a membrane thump with its pitch drop, the beater
  const drumCache = new Map();
  async function drumSrc(id) {
    if (!drumCache.has(id)) drumCache.set(id, strike(await ld(id, 0, 3.2, { hp: 25, fadeOut: 0.5 })));
    return drumCache.get(id);
  }
  async function drum(seed, { size = 0, ring = 0.7, f0 = 96, f1 = 52, slap = -12, muted = false, sub = -4 } = {}) {
    const src = await drumSrc(muted ? X.bdMuted : X.bdFff);
    const skin = lib.decay(size ? lib.varispeedSemis(src, size) : src, ring, 0.015);
    const memb = lib.thump({ f0, f1, sweep: 0.05, decay: ring * 0.55, click: 0.2, drive: 2.2, seed: seed + 'm' });
    const beater = lib.noiseBurst({ dur: 0.03, attack: 0.0003, decay: 0.008, bp: 1400, q: 0.7, seed: seed + 'b' });
    return norm(lib.psychoBass(lib.mix([{ buf: norm(skin) }, { buf: norm(memb), gain: sub }, { buf: norm(beater), gain: slap }]), { freq: 100, amount: -5 }));
  }
  /** Twin (夜舞) version: -4 st, darker, a dotted echo (§1.12 雙生版). */
  const twin = (b) => {
    let o = lib.varispeedSemis(b, -4);
    o = lib.eq(o, [{ type: 'lp', f: 6500, order: 2 }, { type: 'peak', f: 360, gain: 1.5, q: 0.8 }]);
    o = lib.saturate(o, { drive: 3, type: 'tube', mix: 0.35 });
    return lib.echo(o, { time: 0.23, feedback: 0.36, lp: 2400, hp: 180, mix: 0.4, pingpong: o.channels === 2, length: o.duration + 0.9 });
  };
  return { K, rng, norm, mono, clamp, smooth, ld, strike, peakTime, alignAt, cut, env, verb, shape, shapeLog, atLufs, tight, panMove, wrap, onGrid, seamCheck,
    parts, bronze, zheng, run, flutter, flame, embers, swoosh, boom, rumble, throat, drum, twin };
}

// ---------------------------------------------------------------------------------------------- swings
/**
 * One heavy axe swing: P = where the head passes (the blow lands), D = length. The head's mass (a sword whoom taken
 * down 5-8 st and a low band swoosh), the edge's air, the crimson crescent burning in the wake (a flame flutter
 * swelling just after the pass), a faint iron sing, a push of air under it, embers thrown off.
 */
async function swingVariant(lib, H, src, k, { P = 0.13, D = 0.66, mass = -5.5, heavy = 1, dir = 1, pan = 0.35, fire = -8, seed = 'sw' } = {}) {
  const r = H.rng(`${seed}${k}`);
  const whoom = lib.varispeedSemis(src.whoom, mass + r.range(-1, 1));
  const air = lib.varispeedSemis(src.air[k % src.air.length], -1.5 - heavy * 0.8 + r.range(-0.5, 0.5));
  const body = H.swoosh(D, P, [110, 340 + 40 * heavy, 100], { q: 0.9, seed: `${seed}b${k}`, rise: 2.4, fall: 4.5 });
  const hiss = H.swoosh(D, P + 0.01, [1400, 4000, 1700], { q: 1.1, color: 'white', seed: `${seed}h${k}`, rise: 3, fall: 8 });
  // the molten edge's sizzle riding the pass (presence: without it the axe reads as a dull thump on laptop speakers)
  const sizzle = H.swoosh(D, P + 0.015, [4500, 8000, 5500], { q: 2, color: 'white', seed: `${seed}z${k}`, rise: 3.5, fall: 10 });
  const fl = lib.automate(H.flame(D, { seed: `${seed}f${k}`, lo: 220, hi: 1700, rate: 15 }), (t) => H.smooth((t - P + 0.05) / 0.07) * Math.exp(-Math.max(0, t - P - 0.02) * 5));
  const sing = lib.automate(H.bronze([N.A4, N.D5, N.F4][k % 3] * 2, D, { t60: 0.32, bright: 0.6, seed: `${seed}r${k}` }), (t) => H.smooth((t - P + 0.03) / 0.04));
  const push = lib.thump({ f0: 88, f1: 46, sweep: 0.06, decay: 0.18, click: 0, drive: 1.4, seed: `${seed}p${k}` });
  const p = (t) => dir * (pan - 2 * pan * H.smooth((t - P + 0.1) / 0.22));
  const moving = H.panMove(lib.mix([H.alignAt(air, P + 0.005, 0), { buf: H.norm(hiss), gain: -4 }, { buf: H.norm(sizzle), gain: -15 }, { buf: H.norm(fl), gain: fire }], { length: D }), p);
  const centre = lib.mix([H.alignAt(H.norm(whoom), P, -1), { buf: H.norm(body), gain: -5 }, { buf: push, at: Math.max(0, P - 0.045), gain: -15 + heavy * 2 }, { buf: H.norm(sing), gain: -25 }], { length: D });
  let v = lib.mix([{ buf: lib.stereoize(centre, { width: 0.2, hp: 350, seed: `${seed}w${k}` }) }, { buf: moving },
    { buf: lib.stereoize(H.embers(0.4, 7, { seed: `${seed}e${k}` }), { width: 0.5, hp: 1500, seed: `${seed}x${k}` }), at: P + 0.03, gain: -23 }], { channels: 2, length: D });
  v = lib.eq(v, [{ type: 'hp', f: 45, order: 2 }, { type: 'peak', f: 150, gain: 2, q: 0.9 }, { type: 'peak', f: 2600, gain: 3, q: 0.8 }, { type: 'highshelf', f: 5000, gain: 2.5 }]);
  return H.cut(H.verb(v, 'urban', 0.1, 0.9, `${seed}v${k}`), D + 0.1, 0.35);
}

async function swings(lib, ctx, cat, H, keep) {
  const src = { whoom: await H.ld(X.whoom, 0, 0.557, { hp: 45 }), air: [] };
  for (const [a, z] of KATANA) src.air.push(await H.ld(X.katana, a, z, { hp: 330 }));
  src.air.push(await H.ld(X.swoosh, 0.2, 0.72, { hp: 300 }));
  // 斜劈 / 回掄 (the handler starts the cue c.hit / 2 = 0.12-0.13 s into the swing: the whoosh peaks 0.13 s in; the
  // two strokes share the name, so the variants alternate their direction across the frame)
  const sw = [];
  for (let k = 0; k < 6; k++) sw.push(H.shape(await swingVariant(lib, H, src, k, { dir: k % 2 ? -1 : 1 }), -15));
  await cat.add('greataxe_swing', sw, { lufs: -15, spatial: false, channels: 2, voices: 3, pitch: [0.96, 1.04], sources: [X.whoom, X.katana, X.swoosh] });
  keep.swing = sw;

  // 開山 / the leap's downstroke (c.hit / 2 = 0.21 s in): an inhale as the axe goes up, a far heavier pass coming
  // straight down the middle, the crescent roaring, the mask's growl riding the blow
  const heavy = [];
  const growl = await H.ld(X.didg, 0.3, 1.0, { hp: 60, semis: -5 });
  for (let k = 0; k < 4; k++) {
    const P = 0.21, D = 0.85;
    const s = await swingVariant(lib, H, src, k + 2, { P, D, mass: -7.5, heavy: 2, pan: 0.12, dir: k % 2 ? -1 : 1, fire: -6, seed: 'swh' });
    const inhale = lib.reverse(H.swoosh(0.16, 0.03, [2600, 1500, 500], { q: 0.9, color: 'white', seed: `swhi${k}`, fall: 3 }));
    const roar = lib.automate(H.flame(D, { seed: `swhf${k}`, lo: 120, hi: 900, rate: 10 }), (t) => H.smooth((t - 0.06) / (P - 0.06)) * Math.exp(-Math.max(0, t - P) * 4));
    const gr = lib.automate(H.throat(growl, N.D4, { wet: 0.4, seed: `swht${k}` }), (t) => H.smooth((t - 0.05) / 0.14) * Math.exp(-Math.max(0, t - P) * 6));
    const v = lib.mix([{ buf: s }, { buf: H.norm(inhale), gain: -17 }, { buf: lib.stereoize(H.norm(roar), { width: 0.3, hp: 300, seed: `swhs${k}` }), gain: -11 }, { buf: H.norm(gr), gain: -17 },
      { buf: H.boom(`swhb${k}`, { f0: 70, f1: 40, sweep: 0.05, decay: 0.3, drive: 2 }), at: P - 0.04, gain: -16 }], { channels: 2 });
    heavy.push(H.shape(H.cut(v, D + 0.1, 0.35), -14.5));
  }
  await cat.add('greataxe_swing_heavy', heavy, { lufs: -14.5, spatial: false, channels: 2, voices: 2, pitch: [0.97, 1.03], sources: [X.whoom, X.katana, X.swoosh, X.didg] });
  keep.swingHeavy = heavy;

  // def.sound contract (a remote "shot" = a swing; a melee special never sends one, so these are a safety net)
  const close = sw.slice(0, 3).map((b) => H.cut(H.mono(b), 0.6, 0.3));
  await cat.add('greataxe_close', close, { lufs: -18, spatial: true, channels: 1, range: [3, 40], voices: 3, pitch: [0.95, 1.05], sources: [X.whoom, X.katana] });
  const tail = sw.slice(0, 2).map((b, k) => lib.fadeIn(H.mono(lib.reverb(lib.slice(b, 0, 0.3), 'alley', { wet: 1, dry: 0, seed: `gat${k}`, length: 0.7, channels: 1 })), 0.02));
  await cat.add('greataxe_tail', tail, { target: 'gunTail', vol: 0.25, spatial: false, channels: 1, voices: 2, pitch: [0.95, 1.05], maxHeadMs: 40, sources: [X.whoom, X.katana] });
  const far = sw.slice(0, 2).map((b) => lib.eq(H.mono(b), [{ type: 'lp', f: 2400, order: 2 }, { type: 'hp', f: 180, order: 2 }]));
  await cat.add('greataxe_far', far, { target: 'gunFar', vol: 0.4, spatial: true, channels: 1, range: [10, 40], voices: 2, pitch: [0.94, 1.06], sources: [X.whoom, X.katana] });
}

// ---------------------------------------------------------------------------------------------- hits
async function hits(lib, ctx, cat, H, keep) {
  // fs:269483: one hard chop at 0.13 s (then the withdraw); fs:420674 / 504615: clean cuts
  const chops = [await H.ld(X.chop, 0.1, 0.62, { hp: 110 }), await H.ld(X.chop, 0.1, 0.62, { hp: 90, semis: -3 })];
  const cuts = [await H.ld(X.gash, 0.01, 0.37, { hp: 260 }), await H.ld(X.slice, 0.05, 0.62, { hp: 240 })];
  const meats = [await H.ld(X.meaty, 0, 0.48, { hp: 70 }), await H.ld(X.wet, 0.07, 0.54, { hp: 70 }), await H.ld(X.gross, 0.0, 0.62, { hp: 70 })];
  const bones = [await H.ld(X.bone, 0, 0.6, { hp: 150 }), await H.ld(X.fracture, 0, 0.32, { hp: 150 }), await H.ld(X.boneSnap, 0, 0.7, { hp: 150 })];
  // greataxe_hit: 鈍鐵入肉＋銅鳴 — the head buries itself: the chop, the meat, a bone giving, the mass behind it
  // (a 1.5 m bronze axe: a deep thump), the bronze body ringing on the blow, the molten edge hissing in the wound
  const hit = [];
  for (let k = 0; k < 6; k++) {
    const r = H.rng(`hit${k}`);
    const hiss = lib.noiseBurst({ dur: 0.22, attack: 0.002, decay: 0.07, hp: 3500, lp: 11000, seed: `hhs${k}` });
    const v = lib.mix([
      { buf: H.strike(lib.varispeedSemis(chops[k % 2], r.range(-3, -1))), gain: -1 },
      { buf: H.strike(lib.varispeedSemis(cuts[k % 2], r.range(-3, -1))), at: 0.002, gain: -7 },
      { buf: H.strike(lib.varispeedSemis(meats[k % 3], r.range(-3, -0.5))), at: 0.004, gain: -2 },
      { buf: H.strike(bones[k % 3]), at: 0.01, gain: -8 },
      { buf: H.boom(`hb${k}`, { f0: 150, f1: 55, sweep: 0.03, decay: 0.17, drive: 2.4 }), gain: -6 },
      { buf: H.K.crack(`hc${k}`, { dur: 0.012, decay: 0.003, hp: 2000 }), gain: -10 },
      { buf: H.norm(H.bronze([N.D4, N.F4, N.A3][k % 3] * r.range(0.99, 1.01), 0.7, { t60: 0.32, bright: 0.9, seed: `hr${k}` })), at: 0.002, gain: -14 },
      { buf: H.norm(hiss), at: 0.012, gain: -21 },
      { buf: H.embers(0.35, 6, { seed: `he${k}` }), at: 0.02, gain: -21 },
    ]);
    const e = lib.eq(v, [{ type: 'peak', f: 240, gain: 3, q: 0.9 }, { type: 'highshelf', f: 6500, gain: -1.5 }]);
    hit.push(H.shape(H.cut(H.verb(e, 'smallRoom', 0.1, 0.4, `hv${k}`, 1), 0.65, 0.45), -16));
  }
  // (the body thump makes it peaky: mastered a dB under and lifted with vol, so the limiter leaves the bite)
  await cat.add('greataxe_hit', hit, { lufs: -16, vol: 1.12, spatial: true, range: [4, 60], voices: 4, pitch: [0.95, 1.05], priority: 2, sources: [X.chop, X.gash, X.slice, X.meaty, X.wet, X.gross, X.bone, X.fracture, X.boneSnap] });
  keep.hit = hit;

  // greataxe_hit_flesh: one body (the handler adds one per body, up to three, pitched 0.88-1.08)
  const flesh = [];
  for (let k = 0; k < 5; k++) {
    const r = H.rng(`hf${k}`);
    const v = lib.mix([{ buf: H.strike(lib.varispeedSemis(chops[k % 2], r.range(-2, 0))), gain: -2 }, { buf: H.strike(meats[k % 3]), at: 0.003, gain: -1 },
      { buf: H.strike(bones[(k + 1) % 3]), at: 0.008, gain: -10 }, { buf: H.boom(`hfb${k}`, { f0: 140, f1: 60, sweep: 0.02, decay: 0.12, drive: 2 }), gain: -8 }]);
    flesh.push(H.shape(H.cut(v, 0.5, 0.45), -17));
  }
  await cat.add('greataxe_hit_flesh', flesh, { lufs: -17, spatial: true, range: [3, 45], voices: 4, pitch: [0.95, 1.05], sources: [X.chop, X.meaty, X.wet, X.gross, X.bone, X.fracture, X.boneSnap] });
  keep.flesh = flesh;

  // greataxe_hit_wall: the iron edge meets a wall / the street — a heavy clang, the bronze ringing, concrete, a stone
  // chip, sparks (the low of the deep clang kept short: the steel 「鏘」 and the bronze lead)
  const wall = [];
  const deep = H.tight(H.strike(await H.ld(X.clangDeep, 0, 0.6, { hp: 90, semis: -3 })), 0.3);
  const conc = await H.ld(X.concHit, 0, 0.47, { hp: 90 });
  const chips = await H.ld(X.stoneDebris, 0, 0.39, { hp: 300 });
  for (let k = 0; k < 5; k++) {
    const r = H.rng(`wall${k}`);
    const sparks = lib.automate(lib.crackle(0.3, { density: 170, decay: 0.002, hp: 3500, seed: `wsp${k}` }), (t) => Math.exp(-t * 12));
    const v = lib.mix([
      { buf: H.strike(await H.ld(X.metalH(k), 0, 0.4, { hp: 140, semis: r.range(-4, -2) })) },
      { buf: H.strike(deep), gain: -6 },
      { buf: H.strike(await H.ld(X.metalL(k + 1), 0, 0.3, { hp: 900, semis: r.range(-2, 0) })), gain: -8 },
      { buf: H.K.crack(`wcr${k}`, { dur: 0.012, decay: 0.003, hp: 2500 }), gain: -9 },
      { buf: H.strike(conc), gain: -4 },
      { buf: H.norm(sparks), at: 0.004, gain: -11 },
      { buf: H.norm(H.bronze([N.D4, N.F4, N.G4, N.A4, N.C5][k] * r.range(0.99, 1.01), 0.9, { t60: 0.55, bright: 1.1, seed: `wr${k}` })), at: 0.002, gain: -8 },
      { buf: H.strike(chips), at: 0.02, gain: -10 },
    ]);
    const e = lib.eq(v, [{ type: 'hp', f: 50, order: 2 }, { type: 'lowshelf', f: 140, gain: -3 }, { type: 'peak', f: 2800, gain: 3, q: 0.8 }]);
    wall.push(H.shape(H.cut(H.verb(e, 'alley', 0.14, 0.7, `wv${k}`, 1), 0.85, 0.45), -18, { max: 6 }));
  }
  await cat.add('greataxe_hit_wall', wall, { lufs: -18, vol: 1.3, spatial: true, range: [3, 50], voices: 3, pitch: [0.95, 1.05], sources: [X.metalH(0), X.metalL(1), X.clangDeep, X.concHit, X.stoneDebris] });

  // greataxe_kill: 鈍斬＋銅鉦 — a bronze bell-gong struck on the pentatonic (two kills one after another climb), a deep
  // drum stroke under it, embers flaring up off the wound
  const kill = [];
  const tones = [[N.D5, N.A5], [N.F5, N.C6], [N.A4, N.D5], [N.G5, N.D6]];
  for (let k = 0; k < 4; k++) {
    const [a, b] = tones[k];
    const flare = lib.automate(H.flame(0.6, { seed: `kf${k}`, lo: 300, hi: 2600, rate: 18 }), (t) => Math.min(1, t / 0.02) * Math.exp(-t * 7));
    const v = lib.mix([
      { buf: H.norm(H.zheng(a, 1.3, { seed: `ka${k}`, t60: 1.0, bright: 1.15, tick: -10 })) },
      { buf: H.norm(H.zheng(b, 1.0, { seed: `kb${k}`, t60: 0.6, tick: -18 })), at: 0.012, gain: -9 },
      { buf: await H.drum(`kd${k}`, { muted: true, size: -2, ring: 0.25, slap: -8 }), gain: -5 },
      { buf: H.norm(flare), at: 0.01, gain: -17 },
      { buf: H.embers(0.6, 12, { seed: `ke${k}`, skew: 1.1 }), at: 0.02, gain: -14 },
    ]);
    kill.push(H.cut(H.verb(v, 'warehouse', 0.16, 1.1, `kv${k}`, 1, 400), 1.25, 0.4));
  }
  await cat.add('greataxe_kill', kill, { lufs: -19, vol: 1.4, spatial: true, range: [5, 50], voices: 3, pitch: [1, 1], sources: [X.bdMuted] });
  keep.kill = kill;

  // greataxe_sever: 斷肢 — the blow goes through: bone snapping, the wet tear, a heavy cut, the molten edge hissing
  const gores = [await H.ld(X.splat, 0, 0.7, { hp: 90 }), await H.ld(X.gore, 0, 0.7, { hp: 90 })];
  const neck = await H.ld(X.neck, 0.53, 1.14, { hp: 150 });
  const sev = [];
  for (let k = 0; k < 4; k++) {
    const r = H.rng(`sev${k}`);
    const v = lib.mix([
      { buf: H.strike(lib.varispeedSemis(cuts[k % 2], r.range(-4, -2))) },
      { buf: H.strike(k % 2 ? neck : bones[k % 3]), at: 0.006, gain: -2 },
      { buf: H.strike(gores[k % 2]), at: 0.012, gain: -4 },
      { buf: H.boom(`svb${k}`, { f0: 125, f1: 52, sweep: 0.03, decay: 0.22, drive: 2 }), gain: -7 },
      { buf: H.norm(lib.noiseBurst({ dur: 0.4, attack: 0.01, decay: 0.12, hp: 3000, lp: 10000, seed: `svh${k}` })), at: 0.02, gain: -19 },
      { buf: H.embers(0.5, 8, { seed: `sve${k}` }), at: 0.03, gain: -18 },
    ]);
    sev.push(H.shape(H.cut(H.verb(v, 'alley', 0.1, 0.6, `svv${k}`, 1), 0.85, 0.45), -17));
  }
  await cat.add('greataxe_sever', sev, { lufs: -17, spatial: true, range: [4, 50], voices: 3, pitch: [0.95, 1.05], sources: [X.gash, X.slice, X.bone, X.fracture, X.boneSnap, X.neck, X.splat, X.gore] });

  // greataxe_chop_ground: 開山 — the axe bites the street 2-3 m ahead: iron into concrete, a 40-80 Hz blow, the street
  // breaking, the bronze ringing low, then the molten fissure tearing 4 m away (18 m/s: ~0.22 s) and burning
  const ground = [];
  {
    const smash = H.tight(await H.ld(X.concSmash, 0, 1.27, { hp: 50 }), 0.45);
    const stone = H.tight(H.strike(await H.ld(X.stoneHeavy, 0.06, 0.9, { hp: 60 })), 0.4);
    const deepB = H.tight(await H.ld(X.deepBoom, 0, 1.6, { hp: 32 }), 0.6);
    const clang = H.tight(await H.ld(X.clangDeep, 0, 1.0, { hp: 90, semis: -4 }), 0.5);
    const scrape = await H.ld(X.rubbleScrape, 0, 1.0, { hp: 120 });
    const fire = H.tight(H.strike(await H.ld(X.combust, 0.35, 1.6, { hp: 60 })), 0.6);
    for (let k = 0; k < 4; k++) {
      const r = H.rng(`cg${k}`), D = 1.9;
      const tear = lib.eq(lib.crackle(0.7, { density: 320, decay: 0.004, hp: 600, minAmp: 0.2, seed: `cgt${k}` }), [{ type: 'lp', f: 7500, order: 2 }]);
      const run = lib.sweep(lib.mix([{ buf: H.norm(tear) }, { buf: H.strike(lib.varispeedSemis(scrape, r.range(-3, 0))), gain: -3 }]), 'lp', (t) => 1200 + 9000 / (1 + t * 8), { q: 0.7 });
      const runE = lib.automate(run, (t) => (t < 0.24 ? 1 / (1 + t * 3) : Math.exp(-(t - 0.24) * 10) / 1.72));
      const v = lib.mix([
        { buf: H.K.crack(`cgc${k}`, { dur: 0.018, decay: 0.005, hp: 1200 }), gain: -2 },
        { buf: H.strike(await H.ld(X.metalH(k + 1), 0, 0.4, { hp: 180, semis: r.range(-6, -4) })), gain: -4 },
        { buf: H.strike(lib.varispeedSemis(clang, r.range(-1, 1))), gain: -6 },
        { buf: H.strike(smash), gain: -1 },
        { buf: H.strike(stone), at: 0.004, gain: -5 },
        { buf: lib.psychoBass(lib.thump({ f0: 125, f1: 48, sweep: 0.035, decay: 0.32, click: 0.3, drive: 3, seed: `cgb${k}` }), { freq: 110, amount: -3 }), gain: -2 },
        { buf: H.strike(deepB), gain: -11 },
        { buf: H.norm(H.bronze(N.D3 * r.range(0.995, 1.005), 1.4, { t60: 0.9, bright: 0.8, seed: `cgr${k}` })), at: 0.003, gain: -13 },
        { buf: H.strike(await H.ld(X.stoneDebris, 0, 0.39, { hp: 250, semis: r.range(-3, 0) })), at: 0.015, gain: -5 },
        { buf: H.norm(runE), at: 0.02, gain: -8 },
        { buf: H.strike(fire), at: 0.03, gain: -10 },
        { buf: H.strike(await H.ld(X.debris, 0.05 + k * 0.3, 1.6 + k * 0.3, { hp: 180, lp: 6000 })), at: 0.08, gain: -11 },
        { buf: H.embers(1.1, 16, { seed: `cge${k}`, skew: 1.3 }), at: 0.04, gain: -13 },
      ]);
      const e = lib.eq(v, [{ type: 'hp', f: 35, order: 2 }, { type: 'lowshelf', f: 90, gain: -2 }, { type: 'peak', f: 1400, gain: 2, q: 0.7 }, { type: 'highshelf', f: 4000, gain: 3 }]);
      ground.push(H.shape(H.cut(H.verb(e, 'urban', 0.2, 1.5, `cgv${k}`, 1), D, 0.4), -15, { max: 6 }));
    }
  }
  // (a transient-led blow: mastered under the explosion target and lifted, so the crack stays above the body)
  await cat.add('greataxe_chop_ground', ground, { lufs: -15, vol: 1.25, maxLimitDb: 6, spatial: true, range: [8, 100], voices: 2, pitch: [0.97, 1.03], priority: 2,
    sources: [X.concSmash, X.stoneHeavy, X.deepBoom, X.clangDeep, X.rubbleScrape, X.combust, X.stoneDebris, X.debris, X.metalH(1)] });
  keep.ground = ground;
}

// ---------------------------------------------------------------------------------------------- 天墜 charge, leap, smash
async function leap(lib, ctx, cat, H, keep) {
  // greataxe_charge: 上升低吼 (loop; the handler plays it at 0.5 and rate 0.8 -> 1.25 over 1.1 s, §1.12 蓄力). The
  // mask growls through bronze while the furnace in its mouth roars up: periodic in P = 3 s (every tone a whole number
  // of cycles: chorus pairs at +-1/3 Hz, the 2 Hz throb, the 1/3 Hz vowel sweep); only the noise textures (the
  // furnace, crackle, a low rumble) go through the loop crossfade.
  {
    const P = 3, L = 3.8, W = 1, q = (f) => H.onGrid(f, P);
    const pair = (f, g, type = 'saw') => [{ buf: lib.tone(P + W, { type, freq: q(f) + 1 / 3 }), gain: g, pan: -0.35 }, { buf: lib.tone(P + W, { type, freq: q(f) - 1 / 3 }), gain: g, pan: 0.35 }];
    let drone = lib.mix([...pair(N.D2, -3), ...pair(N.A2, -6), ...pair(N.D3, -7), ...pair(N.F3, -16, 'triangle')], { channels: 2 });
    drone = lib.saturate(lib.eq(drone, [{ type: 'lp', f: 1300, order: 2 }]), { drive: 4, type: 'tube' });
    // the throat: a formant swept 380 <-> 640 Hz once a period, rung through the bronze
    const vowel = lib.sweep(drone, 'bp', (t) => 510 + 130 * Math.sin(2 * Math.PI * t / P), { q: 1.6 });
    const throb = (t) => 0.78 + 0.22 * Math.sin(2 * Math.PI * 2 * t);
    const body = lib.slice(H.env(lib.mix([{ buf: H.norm(drone), gain: -5 }, { buf: H.norm(vowel), gain: -2 }], { channels: 2 }), throb), W, W + P);
    const sheen = H.env(lib.mix([{ buf: lib.tone(P, { freq: q(N.D4) + 1 / 3 }), pan: -0.4 }, { buf: lib.tone(P, { freq: q(N.D4) - 1 / 3 }), pan: 0.4 }, { buf: lib.tone(P, { freq: q(N.A4) }), gain: -6 }], { channels: 2 }),
      (t) => 0.6 + 0.4 * Math.sin(2 * Math.PI * 6 * t));
    const furnace = lib.stereoize(H.flame(L, { seed: 'chf', lo: 160, hi: 1100, rate: 9, depth: 0.55 }), { width: 0.5, hp: 300, seed: 'chfs' });
    const sparks = lib.crackle(L, { density: 26, decay: 0.003, hp: 4500, minAmp: 0.2, seed: 'chs' });
    const rum = lib.eq(lib.noise(L, { color: 'brown', seed: 'chr', channels: 2 }), [{ type: 'lp', f: 160, order: 2 }, { type: 'hp', f: 35, order: 2 }]);
    const texture = lib.loopCrossfade(lib.mix([{ buf: H.norm(furnace), gain: -8 }, { buf: lib.stereoize(H.norm(sparks), { width: 0.6, hp: 3000, seed: 'chst' }), gain: -19 }, { buf: H.norm(rum), gain: -14 }], { channels: 2, length: L }), L - P);
    const v = lib.mix([{ buf: body }, { buf: H.norm(sheen), gain: -26 }, { buf: texture }], { channels: 2, length: P });
    H.seamCheck('greataxe_charge', v, 0.5);
    await cat.add('greataxe_charge', v, { lufs: -17, loop: true, spatial: false, channels: 2, voices: 1, pitch: [1, 1] });
    keep.charge = v;
  }

  // greataxe_charge_stage: 每階一聲重鼓 — a war-drum stroke, the jaw opening a notch (a bronze clank), a puff of fire
  // from the mouth, the bronze answering
  const stage = [];
  for (let k = 0; k < 2; k++) {
    const puff = lib.automate(H.flame(0.6, { seed: `csf${k}`, lo: 200, hi: 2200, rate: 16 }), (t) => Math.min(1, t / 0.03) * Math.exp(-t * 6));
    const v = lib.mix([
      { buf: await H.drum(`csd${k}`, { size: -1 - k, ring: 0.55, slap: -9 }) },
      { buf: H.strike(await H.ld(X.metalL(k + 2), 0, 0.3, { hp: 500, semis: -4 })), at: 0.015, gain: -12 },
      { buf: H.norm(H.bronze(N.D3, 1.1, { t60: 0.7, bright: 0.8, seed: `csb${k}` })), at: 0.01, gain: -12 },
      { buf: H.norm(puff), at: 0.02, gain: -13 },
      { buf: H.embers(0.6, 8, { seed: `cse${k}` }), at: 0.03, gain: -19 },
    ]);
    stage.push(H.shape(H.cut(H.verb(lib.stereoize(v, { width: 0.3, hp: 600, seed: `css${k}` }), 'warehouse', 0.14, 1.0, `csv${k}`), 1.1, 0.4), -17));
  }
  await cat.add('greataxe_charge_stage', stage, { lufs: -17, vol: 1.3, spatial: false, channels: 2, voices: 2, pitch: [1, 1], sources: [X.bdFff, X.metalL(2)] });
  keep.stage = stage;

  // greataxe_charge_full: 蓄滿變形 (played +2 st by the handler) — a double drum stroke, the jaw thrown wide, the mouth's
  // furnace bursting and the crescent flaring off the edge (a big fire WHOOMPH), a short roar through the bronze, a
  // gong swelling under it
  {
    const D = 1.6;
    const whoomph = H.tight(H.strike(await H.ld(X.fireWhoosh, 0.05, 1.6, { stereo: true, hp: 45 })), 0.9);
    const roar = await H.ld(X.didg, 0.25, 0.75, { hp: 70, semis: -2 });
    const flare = lib.automate(H.flame(D, { seed: 'cff', lo: 260, hi: 3200, rate: 20 }), (t) => H.smooth(t / 0.08) * Math.exp(-t * 2.4));
    const gong = lib.decay(H.strike(await H.ld(X.gongHard, 0.08, 2.5, { hp: 70, lp: 3000, fadeOut: 0.5 })), 1.3, 0.05);
    const v = lib.mix([
      { buf: await H.drum('cfd1', { size: -2, ring: 0.5, slap: -10 }), gain: -2 },
      { buf: await H.drum('cfd2', { size: -3, ring: 0.8, slap: -8 }), at: 0.095 },
      { buf: H.strike(await H.ld(X.metalH(2), 0, 0.4, { hp: 200, semis: -3 })), at: 0.1, gain: -9 },
      { buf: whoomph, at: 0.09, gain: -6 },
      { buf: H.norm(flare), at: 0.1, gain: -9 },
      { buf: H.norm(lib.automate(H.throat(roar, N.D4, { seed: 'cft' }), (t) => Math.min(1, t / 0.03) * Math.exp(-t * 5))), at: 0.1, gain: -10 },
      { buf: H.norm(gong), at: 0.1, gain: -15 },
      { buf: H.norm(H.bronze(N.A2, D, { t60: 1.2, bright: 0.9, seed: 'cfb' })), at: 0.1, gain: -14 },
      { buf: H.embers(1.0, 18, { seed: 'cfe', skew: 1.2 }), at: 0.12, gain: -13 },
    ], { channels: 2 });
    const out = H.shape(H.cut(H.verb(lib.stereoize(v, { width: 0.35, hp: 500, seed: 'cfst' }), 'warehouse', 0.18, 1.4, 'cfv'), D, 0.4), -16);
    await cat.add('greataxe_charge_full', out, { lufs: -16, vol: 1.2, spatial: false, channels: 2, voices: 1, pitch: [1, 1], sources: [X.bdFff, X.fireWhoosh, X.didg, X.gongHard, X.metalH(2)] });
    keep.full = out;
  }

  // greataxe_leap: 起跳風聲 — the push-off (a heavy stamp, grit, the war grunt), the air rushing past rising and held
  // through the 0.45-0.7 s flight, cloth snapping, the crescent roaring overhead
  const lp = [];
  for (let k = 0; k < 2; k++) {
    const D = 1.0;
    const rush = lib.automate(H.swoosh(D, 0.42, [260, 1300, 800], { q: 0.8, seed: `lpr${k}`, rise: 1.6, fall: 2.5 }), (t) => (t > 0.75 ? Math.exp(-(t - 0.75) * 8) : 1));
    const gust = H.env(await H.ld(X.wind, 1.2 + k * 1.1, 2.3 + k * 1.1, { hp: 220, lp: 6000 }), (t) => H.smooth(t / 0.3) * (t > 0.8 ? Math.exp(-(t - 0.8) * 10) : 1));
    const roar = lib.automate(H.flame(D, { seed: `lpf${k}`, lo: 150, hi: 1100, rate: 11 }), (t) => H.smooth((t - 0.1) / 0.4) * (t > 0.75 ? Math.exp(-(t - 0.75) * 8) : 1));
    const v = lib.mix([
      { buf: lib.thump({ f0: 120, f1: 55, sweep: 0.03, decay: 0.16, click: 0.25, drive: 2, seed: `lpt${k}` }), gain: -4 },
      { buf: H.strike(await H.ld(X.dirt, 0.0 + k * 0.4, 0.5 + k * 0.4, { hp: 200 })), gain: -9 },
      { buf: await H.ld(X.grunts, ...GRUNT[1 + k * 2], { hp: 120, semis: -2 }), at: 0.01, gain: -11 },
      { buf: await H.ld(X.clothHeavy, 0, 0.5, { hp: 150 }), at: 0.03, gain: -11 },
      { buf: H.norm(rush), gain: -3 },
      { buf: H.norm(gust), at: 0.05, gain: -9 },
      { buf: H.norm(roar), gain: -12 },
    ], { channels: 2 });
    lp.push(H.shape(H.cut(lib.stereoize(v, { width: 0.4, hp: 400, seed: `lps${k}` }), D, 0.3), -16));
  }
  await cat.add('greataxe_leap', lp, { lufs: -16, spatial: false, channels: 2, voices: 1, pitch: [0.98, 1.02], sources: [X.dirt, X.grunts, X.clothHeavy, X.wind] });
  keep.leap = lp;

  // greataxe_land: 落地巨響 — the axe and the body come down together: iron into the street, a 40-70 Hz blow, a blast
  // of concrete and grit, the bronze ringing low under it, molten cracks bursting outward (fire), a rain of debris
  const land = [];
  {
    const smash = H.tight(await H.ld(X.concSmash, 0, 1.27, { hp: 45 }), 0.55);
    const blast = H.tight(H.strike(await H.ld(X.blast, 0, 1.24, { hp: 55 })), 0.6);
    const deepB = H.tight(H.strike(await H.ld(X.deepBoom, 0, 2.2, { hp: 30 })), 0.9);
    const clang = H.tight(H.strike(await H.ld(X.clangDeep, 0, 1.0, { hp: 70, semis: -5 })), 0.7);
    const fire = H.tight(H.strike(await H.ld(X.fireWhoosh, 0.05, 1.8, { hp: 45 })), 0.8);
    const earth = await H.ld(X.earth, 0.3, 2.4, { hp: 120 });
    for (let k = 0; k < 3; k++) {
      const r = H.rng(`land${k}`), D = 2.3;
      const v = lib.mix([
        { buf: H.K.crack(`ldc${k}`, { dur: 0.02, decay: 0.005, hp: 1100 }), gain: -1 },
        { buf: H.strike(await H.ld(X.metalH(k + 2), 0, 0.4, { hp: 160, semis: r.range(-7, -5) })), gain: -5 },
        { buf: H.strike(clang), gain: -6 },
        { buf: H.strike(smash), gain: -1 },
        { buf: H.strike(blast), gain: -5 },
        { buf: H.boom(`ldb${k}`, { f0: 110, f1: 42, sweep: 0.05, decay: 0.45, drive: 2.6, amount: -3 }), gain: -1 },
        { buf: H.strike(deepB), gain: -8 },
        { buf: H.norm(H.bronze(N.D2 * r.range(0.995, 1.005), 2.0, { t60: 1.3, bright: 1.0, seed: `ldr${k}` })), at: 0.003, gain: -14 },
        { buf: H.strike(fire), at: 0.02, gain: -7 },
        { buf: H.strike(await H.ld(X.stoneDebris, 0, 0.39, { hp: 220, semis: r.range(-4, -1) })), at: 0.012, gain: -4 },
        { buf: H.strike(await H.ld(X.debrisBig, 0.05 + k * 0.3, 2.2 + k * 0.3, { hp: 140 })), at: 0.07, gain: -5 },
        { buf: H.strike(earth), at: 0.15, gain: -12 },
        { buf: H.norm(H.rumble(D, `ldu${k}`, { lp: 180, t60: 1.6 })), gain: -13 },
        { buf: H.embers(1.4, 24, { seed: `lde${k}`, skew: 1.3 }), at: 0.05, gain: -12 },
      ]);
      const e = lib.eq(v, [{ type: 'hp', f: 30, order: 2 }, { type: 'lowshelf', f: 80, gain: -3 }, { type: 'peak', f: 1500, gain: 2.5, q: 0.7 }, { type: 'highshelf', f: 4000, gain: 3 }]);
      land.push(H.shape(H.cut(H.verb(e, 'urban', 0.22, 1.8, `ldv${k}`, 1), D, 0.4), -14, { max: 6 }));
    }
  }
  await cat.add('greataxe_land', land, { lufs: -14, vol: 1.15, maxLimitDb: 6, spatial: true, range: [8, 110], voices: 2, pitch: [0.97, 1.03], priority: 3,
    sources: [X.concSmash, X.blast, X.deepBoom, X.clangDeep, X.fireWhoosh, X.earth, X.stoneDebris, X.debrisBig, X.metalH(2)] });
  keep.land = land;

  // greataxe_quake: 轟 — one shockwave ring rolling out (three of them 0.12 s apart, quieter and lower each; the
  // ultimate's rings too): a fast 40-80 Hz blow, the pressure wave's whump of air, gravel and dust thrown, a rumble
  const quake = [];
  for (let k = 0; k < 4; k++) {
    const r = H.rng(`qk${k}`), D = 1.3;
    const whump = H.swoosh(0.7, 0.05, [70, 260, 60], { q: 0.8, seed: `qkw${k}`, rise: 1.2, fall: 4 });
    const grit = await H.ld(X.debris, 0.1 + k * 0.5, 1.2 + k * 0.5, { hp: 400, lp: 6500 });
    const v = lib.mix([
      { buf: H.boom(`qkb${k}`, { f0: 86 * r.range(0.95, 1.05), f1: 38, sweep: 0.05, decay: 0.38, drive: 2.6, amount: -3 }) },
      { buf: H.norm(whump), gain: -6 },
      { buf: H.K.crack(`qkc${k}`, { dur: 0.02, decay: 0.006, hp: 500, lp: 3500 }), gain: -10 },
      { buf: H.strike(grit), at: 0.02, gain: -5 },
      { buf: H.norm(H.rumble(D, `qkr${k}`, { lp: 170, t60: 0.9 })), gain: -9 },
      { buf: H.norm(lib.automate(lib.eq(lib.noise(0.6, { seed: `qkd${k}` }), [{ type: 'bp', f: 1800, q: 0.6 }]), (t) => Math.min(1, t / 0.02) * Math.exp(-t * 8))), at: 0.01, gain: -18 },
    ]);
    const e = lib.eq(v, [{ type: 'hp', f: 30, order: 2 }, { type: 'peak', f: 180, gain: 2, q: 0.8 }]);
    quake.push(H.shape(H.cut(H.verb(e, 'urban', 0.2, 1.2, `qkv${k}`, 1), D, 0.45), -16));
  }
  await cat.add('greataxe_quake', quake, { lufs: -16, spatial: true, range: [8, 100], voices: 4, pitch: [0.96, 1.04], priority: 2, sources: [X.debris] });
  keep.quake = quake;
}

// ---------------------------------------------------------------------------------------------- 狂旋 whirlwind
async function spin(lib, ctx, cat, H, keep) {
  const src = { whoom: await H.ld(X.whoom, 0, 0.557, { hp: 45 }), air: [] };
  for (const [a, z] of KATANA) src.air.push(await H.ld(X.katana, a, z, { hp: 330 }));
  // greataxe_spin_start: the axe swung out into the whirl, the crescent flaring, the vortex catching
  const start = [];
  const ign = H.tight(H.strike(await H.ld(X.fireB, 0, 1.6, { hp: 50 })), 0.7);
  for (let k = 0; k < 2; k++) {
    const s = await swingVariant(lib, H, src, k + 1, { P: 0.12, D: 0.8, mass: -6.5, heavy: 1.6, dir: -1, pan: 0.5, fire: -5, seed: 'sps' });
    const vortex = lib.automate(lib.sweep(lib.noise(0.9, { color: 'pink', seed: `spv${k}` }), 'bp', (t) => 300 + 500 * H.smooth(t / 0.6), { q: 0.9 }), (t) => H.smooth((t - 0.05) / 0.5) * (t > 0.7 ? Math.exp(-(t - 0.7) * 10) : 1));
    const v = lib.mix([{ buf: s }, { buf: ign, at: 0.08, gain: -9 }, { buf: lib.stereoize(H.norm(vortex), { width: 0.6, hp: 250, seed: `spvs${k}` }), gain: -12 },
      { buf: H.norm(H.bronze(N.A3, 0.8, { t60: 0.5, seed: `spb${k}` })), at: 0.12, gain: -20 }], { channels: 2 });
    start.push(H.shape(H.mono(H.cut(v, 0.9, 0.35)), -15));   // (shaped as the mono file it ships as: a panned pass folds down ~3 dB)
  }
  await cat.add('greataxe_spin_start', start, { lufs: -15, spatial: true, channels: 1, range: [4, 50], voices: 2, pitch: [0.98, 1.02], sources: [X.whoom, X.katana, X.fireB] });

  // greataxe_spin: the whirl (loop, P = 2.4 s = five turns of the 0.48 s pass the clip shows): each turn the axe
  // crosses the front right -> left (a full whoosh, the flame flaring, a faint edge sing), passes behind (darker,
  // quieter, left -> right); under it the vortex (a band of wind swept once a turn), the flame's roar and a low throb
  // at the turn rate. Event trains are folded circularly into P; the noise beds are crossfaded; the throb is on the grid.
  {
    const P = 2.4, T = 0.48, n = 5, X2 = 0.7;
    const events = [];
    for (let i = 0; i < n; i++) {
      const t0 = i * T, r = H.rng(`spp${i}`);
      const air = lib.varispeedSemis(src.air[i % 4], -3 + r.range(-0.6, 0.6));
      const front = lib.mix([H.alignAt(H.norm(lib.varispeedSemis(src.whoom, -6 + r.range(-0.8, 0.8))), 0.16, -2), { buf: H.norm(H.swoosh(0.42, 0.16, [130, 420, 120], { q: 0.9, seed: `spf${i}`, rise: 2.2, fall: 4 })), gain: -4 },
        H.alignAt(air, 0.165, 0), { buf: H.norm(H.swoosh(0.42, 0.17, [1500, 4200, 1800], { q: 1.1, color: 'white', seed: `spa${i}`, rise: 3, fall: 8 })), gain: -6 }, { buf: H.norm(lib.automate(H.flame(0.42, { seed: `spl${i}`, lo: 240, hi: 1800, rate: 16 }), (t) => H.smooth((t - 0.1) / 0.08) * Math.exp(-Math.max(0, t - 0.2) * 9))), gain: -9 },
        { buf: H.norm(lib.automate(H.bronze([N.D5, N.A4, N.F5, N.C5, N.G4][i] * 2, 0.42, { t60: 0.2, bright: 0.5, seed: `spr${i}` }), (t) => H.smooth((t - 0.13) / 0.03))), gain: -26 }], { length: 0.42 });
      events.push({ buf: H.panMove(front, (t) => 0.75 - 1.5 * H.smooth((t - 0.06) / 0.22)), at: t0 + 0.05 });
      const behind = lib.eq(H.swoosh(0.34, 0.12, [120, 300, 110], { q: 0.9, seed: `spk${i}`, rise: 2, fall: 4 }), [{ type: 'lp', f: 800, order: 2 }]);
      events.push({ buf: H.panMove(H.norm(behind), (t) => -0.6 + 1.2 * H.smooth(t / 0.3)), at: t0 + 0.3, gain: -10 });
    }
    const train = H.wrap(lib.mix(events, { channels: 2, length: P + 0.6 }), P);
    const L2 = P + X2;
    const vortex = lib.sweep(lib.noise(L2, { color: 'pink', seed: 'spw', channels: 2 }), 'bp', (t) => 420 + 240 * Math.sin(2 * Math.PI * t / T), { q: 0.9 });
    const fire = lib.stereoize(H.flame(L2, { seed: 'spfl', lo: 150, hi: 900, rate: 10, depth: 0.5 }), { width: 0.5, hp: 300, seed: 'spfs' });
    // the whirlwind's howl: a narrow band of wind whistling up and down once a turn (呼嘯)
    const howl = lib.sweep(lib.noise(L2, { color: 'pink', seed: 'sph', channels: 2 }), 'bp', (t) => 1250 + 450 * Math.sin(2 * Math.PI * (t - 0.12) / T), { q: 4 });
    const beds = lib.loopCrossfade(lib.mix([{ buf: H.norm(vortex), gain: -9 }, { buf: H.norm(fire), gain: -11 }, { buf: H.norm(howl), gain: -17 }], { channels: 2, length: L2 }), X2);
    const throb = lib.automate(lib.mix([{ buf: lib.tone(P, { freq: H.onGrid(N.A1, P) }) }, { buf: lib.tone(P, { freq: H.onGrid(N.A2, P) }), gain: -8 }]), (t) => 0.3 + 0.7 * Math.pow(0.5 + 0.5 * Math.cos(2 * Math.PI * (t - 0.21) / T), 3));
    const v = lib.eq(lib.mix([{ buf: train }, { buf: beds }, { buf: H.norm(throb), gain: -15 }], { channels: 2, length: P }), [{ type: 'hp', f: 40, order: 2 }]);
    H.seamCheck('greataxe_spin', v, T);
    await cat.add('greataxe_spin', v, { lufs: -17, loop: true, spatial: false, channels: 2, voices: 1, pitch: [1, 1], sources: [X.whoom, X.katana] });
    keep.spin = v;
  }

  // greataxe_spin_hit: the whirl tearing through bodies (a tick that connects; pitched 0.9-1.1 by the handler): a fast
  // cut, the meat, a short mass thump and a bronze tick
  const cuts = [await H.ld(X.gash, 0.01, 0.37, { hp: 260 }), await H.ld(X.slice, 0.05, 0.62, { hp: 240 })];
  const meats = [await H.ld(X.meaty, 0, 0.48, { hp: 80 }), await H.ld(X.wet, 0.07, 0.54, { hp: 80 })];
  const sh = [];
  for (let k = 0; k < 5; k++) {
    const r = H.rng(`sph${k}`);
    const v = lib.mix([
      { buf: H.strike(lib.varispeedSemis(cuts[k % 2], r.range(-3, -1))) },
      { buf: H.strike(meats[k % 2]), at: 0.004, gain: -3 },
      { buf: lib.thump({ f0: 140, f1: 62, sweep: 0.02, decay: 0.1, click: 0.2, drive: 2, seed: `sphb${k}` }), gain: -7 },
      { buf: H.norm(H.bronze([N.D5, N.F5, N.A4][k % 3], 0.3, { t60: 0.13, seed: `sphr${k}` })), gain: -17 },
      { buf: H.embers(0.25, 5, { seed: `sphe${k}` }), at: 0.01, gain: -21 },
    ]);
    sh.push(H.shape(H.cut(v, 0.38, 0.45), -17));
  }
  await cat.add('greataxe_spin_hit', sh, { lufs: -17, spatial: false, channels: 1, voices: 3, pitch: [0.96, 1.04], sources: [X.gash, X.slice, X.meaty, X.wet] });

  // greataxe_spin_end: 收旋外爆 — one last wide pass flung outward: the whoosh, a blow and a ring of grit, the flame
  // bursting off the crescent, the vortex released (a falling rush), the bronze ringing out
  const end = [];
  const burst = H.tight(H.strike(await H.ld(X.combust, 0.35, 1.8, { hp: 50 })), 0.8);
  for (let k = 0; k < 2; k++) {
    const D = 1.5;
    const s = await swingVariant(lib, H, src, k + 3, { P: 0.1, D: 0.7, mass: -7, heavy: 2, dir: -1, pan: 0.5, fire: -5, seed: 'spe' });
    const release = H.swoosh(1.0, 0.08, [1100, 700, 140], { q: 0.8, seed: `sper${k}`, rise: 1.5, fall: 3 });
    const v = lib.mix([
      { buf: s },
      { buf: H.boom(`speb${k}`, { f0: 100, f1: 44, sweep: 0.04, decay: 0.38, drive: 2.4 }), at: 0.1, gain: -4 },
      { buf: burst, at: 0.1, gain: -6 },
      { buf: H.strike(await H.ld(X.debris, 0.2 + k * 0.6, 1.4 + k * 0.6, { hp: 300, lp: 7000 })), at: 0.13, gain: -9 },
      { buf: lib.stereoize(H.norm(release), { width: 0.6, hp: 300, seed: `spes${k}` }), at: 0.1, gain: -10 },
      { buf: H.norm(H.bronze(N.D3, 1.3, { t60: 0.9, seed: `sper${k}` })), at: 0.1, gain: -15 },
      { buf: H.embers(1.0, 16, { seed: `spee${k}` }), at: 0.12, gain: -15 },
    ], { channels: 2 });
    const e = lib.eq(v, [{ type: 'peak', f: 2400, gain: 2, q: 0.8 }, { type: 'highshelf', f: 4000, gain: 3 }]);
    end.push(H.shape(H.cut(H.verb(e, 'urban', 0.16, 1.2, `spev${k}`), D, 0.4), -14));
  }
  await cat.add('greataxe_spin_end', end, { lufs: -14, spatial: false, channels: 2, voices: 1, pitch: [0.98, 1.02], sources: [X.whoom, X.katana, X.combust, X.debris] });
}

// ---------------------------------------------------------------------------------------------- 迴戚 the thrown axe
/** A whirring axe: a whoosh each turn (the head) and a lighter one half a turn later (the haft), `rate(t)` turns/s. */
function whirr(lib, H, D, rate, { seed = 'wr', lo = 260, hi = 900, haft = -7 } = {}) {
  const out = [];
  let t = 0, i = 0;
  while (t < D - 1e-6) {
    const f = rate(t), per = 1 / f, r = H.rng(`${seed}${i}`);
    out.push({ buf: H.swoosh(Math.min(0.2, per * 0.9), per * 0.35, [lo, hi * r.range(0.9, 1.1), lo * 0.9], { q: 1.1, seed: `${seed}h${i}`, rise: 2, fall: 5 }), at: t, gain: r.range(-1, 0) });
    out.push({ buf: H.swoosh(Math.min(0.16, per * 0.7), per * 0.3, [lo * 1.3, hi * 1.5, lo * 1.2], { q: 1.3, color: 'white', seed: `${seed}k${i}`, rise: 2, fall: 6 }), at: t + per / 2, gain: haft });
    t += per; i++;
  }
  return lib.mix(out, { length: D + 0.2 });
}

async function thrown(lib, ctx, cat, H, keep) {
  const whoom = await H.ld(X.whoom, 0, 0.557, { hp: 45 });
  // greataxe_throw (starts 0.16 s into the 0.2 s wind-up: the release ~0.04 s in): the hurl — the war grunt, one huge
  // pass, the crescent flaring, then the spinning axe tearing away (its whirr falling in pitch and closing as it goes)
  const th = [];
  for (let k = 0; k < 3; k++) {
    const r = H.rng(`th${k}`), D = 0.95, P = 0.045;
    const away = lib.automate(lib.sweep(whirr(lib, H, D, (t) => 3.6 - t * 0.8, { seed: `thw${k}`, lo: 280, hi: 1000 }), 'lp', (t) => 7000 / (1 + t * 7), { q: 0.7 }), (t) => H.smooth((t - 0.02) / 0.08) / (1 + t * 4));
    const v = lib.mix([
      H.alignAt(H.norm(lib.varispeedSemis(whoom, -6 + r.range(-1, 1))), P, -1),
      { buf: H.norm(H.swoosh(0.5, P, [200, 600, 180], { q: 0.9, seed: `thb${k}`, rise: 1.5, fall: 5 })), gain: -5 },
      { buf: H.norm(H.swoosh(0.5, P + 0.005, [1500, 4500, 1800], { q: 1.1, color: 'white', seed: `tha${k}`, rise: 2.5, fall: 7 })), gain: -6 },
      { buf: await H.ld(X.grunts, ...GRUNT[[3, 5, 6][k]], { hp: 120, semis: -3 }), gain: -12 },
      { buf: H.norm(lib.automate(H.flame(0.6, { seed: `thf${k}`, lo: 250, hi: 2000, rate: 16 }), (t) => Math.min(1, t / 0.03) * Math.exp(-t * 5))), at: P, gain: -11 },
      { buf: H.norm(away), at: 0.06, gain: -4 },
    ], { length: D });
    const e = lib.eq(v, [{ type: 'peak', f: 2600, gain: 2, q: 0.8 }, { type: 'highshelf', f: 4500, gain: 3 }]);
    th.push(H.shape(H.cut(H.panMove(e, (t) => 0.2 * H.smooth(t / 0.3)), D, 0.4), -15));
  }
  await cat.add('greataxe_throw', th, { lufs: -15, spatial: false, channels: 2, voices: 1, pitch: [0.98, 1.02], sources: [X.whoom, X.grunts] });

  // greataxe_fly (loop, at the flying axe): 3.5 turns a second (the disc spins 22 rad/s) — the head's whoom and the
  // haft's lighter whip half a turn later, the flame roaring round the crescent, a low hum beating at the turn rate.
  // P = 2 s = 7 turns: the whoosh train is folded circularly, the flame crossfaded, the hum on the grid.
  {
    const P = 2, X2 = 0.5;
    const train = H.wrap(whirr(lib, H, P, () => 3.5, { seed: 'flw', lo: 300, hi: 950 }), P);   // 7 turns in P, tails folded
    const fire = lib.loopCrossfade(lib.fitLength(H.flame(P + X2, { seed: 'flf', lo: 200, hi: 1500, rate: 14, depth: 0.5 }), P + X2), X2);
    const hum = lib.automate(lib.mix([{ buf: lib.tone(P, { freq: H.onGrid(N.A2, P) }) }, { buf: lib.tone(P, { freq: H.onGrid(N.D3, P) }), gain: -6 }]), (t) => 0.4 + 0.6 * Math.pow(0.5 + 0.5 * Math.cos(2 * Math.PI * 3.5 * t), 2));
    const v = lib.mix([{ buf: H.norm(train) }, { buf: H.norm(fire), gain: -8 }, { buf: H.norm(hum), gain: -16 }], { length: P });
    H.seamCheck('greataxe_fly', v, 1 / 3.5);
    await cat.add('greataxe_fly', v, { lufs: -18, loop: true, spatial: true, channels: 1, range: [6, 60], voices: 2, pitch: [1, 1] });
  }

  // greataxe_return: 呼嘯由遠而近 (played where the axe turns back, ~0.7 s before the catch): the whirr coming home —
  // faster (doppler), brighter and louder as it closes, a rising flame roar, cut off at the hands
  const ret = [];
  for (let k = 0; k < 2; k++) {
    const D = 0.85;
    const w = lib.sweep(whirr(lib, H, D, (t) => 3.2 + t * 1.6, { seed: `rtw${k}`, lo: 300, hi: 1100 }), 'lp', (t) => 1200 * Math.pow(7, t / 0.7), { q: 0.7 });
    const roar = H.flame(D, { seed: `rtf${k}`, lo: 220, hi: 1600, rate: 14 });
    const cresc = (t) => (0.12 + 0.88 * (t / 0.72) ** 2) * (t > 0.72 ? Math.exp(-(t - 0.72) * 30) : 1);
    const v = lib.automate(lib.mix([{ buf: H.norm(w) }, { buf: H.norm(roar), gain: -9 }, { buf: H.norm(H.swoosh(D, 0.7, [400, 2600, 1500], { q: 1, color: 'white', seed: `rts${k}`, rise: 3, fall: 8 })), gain: -12 }], { length: D }), cresc);
    ret.push(lib.fadeIn(v, 0.01));
  }
  await cat.add('greataxe_return', ret, { lufs: -16, vol: 1.1, spatial: true, channels: 1, range: [16, 90], voices: 1, pitch: [0.98, 1.02], maxHeadMs: 40 });

  // greataxe_catch: 金屬入掌「鏘」 — the axe slams into both palms: the last of its whoosh, a leather-and-flesh slap, the
  // haft knocking, a bronze 「鏘」 ringing, the arms giving (a thump), a puff of embers
  const ca = [];
  for (let k = 0; k < 3; k++) {
    const r = H.rng(`ca${k}`);
    const v = lib.mix([
      { buf: H.norm(H.swoosh(0.06, 0.04, [500, 1500, 800], { q: 1, seed: `caw${k}`, rise: 2, fall: 6 })), gain: -9 },
      { buf: H.strike(await H.ld(X.punch, 0, 0.5, { hp: 150, semis: r.range(-3, -1) })), at: 0.035, gain: -3 },
      { buf: lib.thump({ f0: 130, f1: 58, sweep: 0.02, decay: 0.14, click: 0.25, drive: 2, seed: `cat${k}` }), at: 0.035, gain: -5 },
      { buf: H.strike(await H.ld(X.metalL(k + 2), 0, 0.3, { hp: 600, semis: r.range(-3, -1) })), at: 0.036, gain: -4 },
      { buf: H.norm(H.bronze([N.A4, N.D5, N.G4][k] * r.range(0.995, 1.005), 0.8, { t60: 0.55, bright: 1.1, seed: `car${k}` })), at: 0.036, gain: -7 },
      { buf: H.K.crack(`cac${k}`, { dur: 0.01, decay: 0.0025, hp: 2800 }), at: 0.035, gain: -10 },
      { buf: H.strike(await H.ld(X.wood, 0.08, 0.5, { hp: 400 })), at: 0.04, gain: -14 },
      { buf: await H.ld(X.cloth, 0, 0.34, { hp: 150 }), at: 0.05, gain: -14 },
      { buf: H.embers(0.5, 8, { seed: `cae${k}` }), at: 0.05, gain: -17 },
    ]);
    ca.push(H.shape(H.cut(H.verb(lib.stereoize(v, { width: 0.25, hp: 600, seed: `cas${k}` }), 'smallRoom', 0.12, 0.6, `cav${k}`), 0.8, 0.45), -16));
  }
  await cat.add('greataxe_catch', ca, { lufs: -16, vol: 1.1, spatial: false, channels: 2, voices: 1, pitch: [0.97, 1.03], sources: [X.punch, X.metalL(2), X.wood, X.cloth] });
}

// ---------------------------------------------------------------------------------------------- 猛志 ultimate
// Timeline (premium/greataxe.js greataxe_ult, t from the cast): 0 roar (+ the bed from 0.3) | 0.2 sigil, the fire
// column | 0.3 the spirit rises (0.6 s) | 1.35-1.9 the sweep (hit-stop on contact) | 2.52 the chop comes down | 2.72
// the bite (hit-stop 0.12) | 2.85 / 2.98 / 3.11 three rings | 3.3 it breaks apart | 4.0 end.
async function ult(lib, ctx, cat, H, keep) {
  const tiger = await H.ld(X.tiger, 0.98, 2.15, { hp: 60 });
  const mroar = await H.ld(X.mroar, 0, 1.2, { hp: 35 });
  const didg = await H.ld(X.didg, 0.12, 1.6, { hp: 50 });
  // ① 戰吼＋大鼓 (§1.12 layer 1): a great drum stroke, the war cry, the mask roaring through bronze (tiger, beast and
  // the didgeridoo roar taken down), the jaw thrown open; at 0.2 the fire column shoots up out of the mouth (a reversed
  // cymbal sucked into it, a rising flame and zap)
  {
    const D = 1.9, B = 0.2;
    const outs = [];
    const gongHi = lib.decay(H.strike(await H.ld(X.gong, 0.12, 2.0, { stereo: true, hp: 400, fadeOut: 0.4 })), 1.2, 0.03);   // the fire column rings the bronze
    for (let k = 0; k < 2; k++) {
      const cry = await H.ld(X.grunts, ...GRUNT[4 - k], { hp: 90, semis: -4 });
      const voice = H.throat(lib.mix([{ buf: lib.varispeedSemis(tiger, -5 - k) }, { buf: lib.varispeedSemis(mroar, -1), gain: -3 }, { buf: lib.varispeedSemis(didg, -3), gain: -5 }]), N.D4, { wet: 0.5, seed: `urt${k}` });
      const voiceE = lib.automate(voice, (t) => H.smooth(t / 0.06) * (t < 0.45 ? 1 : Math.exp(-(t - 0.45) * 3.5)));
      const cym = lib.reverse(await H.ld(X.crash, 0.04, 0.04 + B, { stereo: true, hp: 300, fadeIn: 0.001, fadeOut: 0.03 }));
      const column = lib.automate(lib.sweep(H.flame(1.0, { seed: `urf${k}`, lo: 150, hi: 4000, rate: 20, depth: 0.5 }), 'bp', (t) => 300 * Math.pow(10, Math.min(1, t / 0.3)), { q: 0.8 }), (t) => Math.min(1, t / 0.04) * Math.exp(-t * 2.6));
      const zap = lib.applyEnv(lib.fm(0.7, { carrier: [[0, 300], [0.35, 1800], [0.7, 2000]], ratio: 1.5, index: 2.5, indexDecay: 0.3 }), lib.expEnv(0.7, { attack: 0.01, t60: 0.6 }));
      const v = lib.mix([
        { buf: await H.drum(`urd${k}`, { size: -3, ring: 1.0, slap: -8 }) },
        { buf: H.norm(voiceE), at: 0.02, gain: -2 },
        { buf: H.norm(cry), at: 0.01, gain: -9 },
        { buf: H.strike(await H.ld(X.metalH(3 + k), 0, 0.4, { hp: 200, semis: -4 })), at: 0.01, gain: -12 },
        { buf: cym, gain: -12 },
        { buf: H.norm(column), at: B, gain: -6 },
        { buf: H.norm(zap), at: B, gain: -16 },
        { buf: await H.drum(`urd2${k}`, { size: -4, ring: 1.2, slap: -10 }), at: B, gain: -3 },
        { buf: H.norm(H.zheng(N.D4, 1.6, { seed: `urz${k}`, t60: 1.4, bright: 0.9 })), at: B, gain: -13 },
        { buf: H.embers(1.2, 20, { seed: `ure${k}`, skew: 1.2 }), at: B + 0.02, gain: -14 },
      ], { channels: 2 });
      const e = lib.eq(lib.mix([{ buf: v }, { buf: H.norm(gongHi), at: B, gain: -14 }], { channels: 2 }), [{ type: 'peak', f: 2400, gain: 2, q: 0.8 }, { type: 'highshelf', f: 4000, gain: 3 }]);
      outs.push(H.shape(H.mono(H.cut(H.verb(e, 'warehouse', 0.2, 1.6, `urv${k}`), D, 0.4)), -14));
    }
    await cat.add('greataxe_ult_roar', outs, { lufs: -14, vol: 1.1, spatial: true, channels: 1, range: [10, 130], voices: 2, pitch: [1, 1], priority: 3, sources: [X.tiger, X.mroar, X.didg, X.grunts, X.crash, X.bdFff, X.metalH(3)] });
    keep.roar = outs[0];
  }

  // the sigil (0.2): 鉦一聲 — the 雲雷紋 seal pressing into the street: a 銅鉦 on D5 with D4 under it, a roll of thunder
  // (cloud-and-thunder) along the spiral, a ring of fire catching round it
  const sigil = [];
  {
    const gongWash = await H.ld(X.gongHard, 0.09, 2.4, { hp: 90, lp: 1700, fadeOut: 0.6 });
    for (let k = 0; k < 2; k++) {
      const D = 1.9;
      const thunder = lib.automate(lib.eq(lib.mix([{ buf: lib.noise(1.4, { color: 'brown', seed: `sgn${k}` }) }, { buf: H.norm(lib.crackle(1.4, { density: 90, decay: 0.006, hp: 300, seed: `sgc${k}` })), gain: -10 }]), [{ type: 'lp', f: 900, order: 2 }, { type: 'hp', f: 40, order: 2 }]),
        (t) => H.smooth(t / 0.15) * Math.exp(-Math.max(0, t - 0.25) * 2.8) * (0.7 + 0.3 * Math.sin(2 * Math.PI * 7 * t)));
      const ring = lib.automate(H.flame(1.2, { seed: `sgf${k}`, lo: 200, hi: 2200, rate: 14 }), (t) => H.smooth(t / 0.25) * Math.exp(-Math.max(0, t - 0.3) * 3));
      const v = lib.mix([
        { buf: H.norm(H.zheng(N.D5, D, { seed: `sga${k}`, t60: 1.6, bright: 1.1, tick: -10 })) },
        { buf: H.norm(H.zheng(N.D4, D, { seed: `sgb${k}`, t60: 1.8 })), at: 0.006, gain: -5 },
        { buf: lib.thump({ f0: 70, f1: 42, sweep: 0.05, decay: 0.5, click: 0, drive: 1.5, seed: `sgt${k}` }), gain: -7 },
        { buf: H.norm(thunder), at: 0.05, gain: -10 },
        { buf: H.norm(ring), at: 0.08, gain: -15 },
        { buf: H.norm(lib.varispeedSemis(gongWash, -2 + k * 0.4)), gain: -15 },
      ]);
      sigil.push(H.cut(H.verb(v, 'warehouse', 0.24, 1.8, `sgv${k}`, 1), D, 0.4));
    }
    await cat.add('greataxe_ult_sigil', sigil, { lufs: -18, vol: 1.4, spatial: true, range: [12, 140], voices: 2, pitch: [0.99, 1.01], sources: [X.gongHard] });
  }

  // ② 地底低吼上升 (0.3, the spirit rises out of the street in 0.6 s): the street cracking and grinding open, a giant
  // growl climbing out of the ground (a beast growl and the didgeridoo roar taken an octave down, rising in pitch),
  // the crimson pillar roaring up, the bronze body swelling
  const rise = [];
  {
    const growl = await H.ld(X.mgrowl, 0.15, 2.0, { hp: 30 });
    const ice = await H.ld(X.iceCrack, 0.45, 2.45, { hp: 150 });
    const grind = await H.ld(X.rubbleScrape, 0, 1.0, { hp: 60, semis: -7 });
    for (let k = 0; k < 2; k++) {
      const D = 1.9;
      const g = lib.varispeedCurve(lib.mix([{ buf: growl }, { buf: lib.varispeedSemis(didg, -4), gain: -4 }]), [[0, 0.62], [0.9, 0.82], [2.5, 0.86]]);
      const gE = lib.automate(H.throat(g, N.D3, { wet: 0.45, seed: `rst${k}` }), (t) => H.smooth(t / 0.5) * (t < 1.1 ? 1 : Math.exp(-(t - 1.1) * 3)));
      const pillar = lib.automate(lib.sweep(H.flame(D, { seed: `rsf${k}`, lo: 120, hi: 2500, rate: 12, depth: 0.5 }), 'lp', (t) => 400 + 3000 * H.smooth(t / 0.7), { q: 0.7 }), (t) => H.smooth(t / 0.55) * Math.exp(-Math.max(0, t - 0.7) * 2.2));
      const cracks = lib.eq(lib.varispeedSemis(lib.slice(ice, k * 0.5, k * 0.5 + 1.4), -9), [{ type: 'lp', f: 6000, order: 2 }, { type: 'peak', f: 800, gain: 3, q: 0.9 }]);
      const v = lib.mix([
        { buf: H.norm(H.rumble(D, `rsr${k}`, { lp: 160, a: 0.4, t60: 2.4 })), gain: -6 },
        { buf: H.norm(cracks), at: 0.02, gain: -7 },
        { buf: H.env(H.norm(lib.concat([grind, grind])), (t) => H.smooth(t / 0.3) * Math.exp(-Math.max(0, t - 0.6) * 3)), gain: -9 },
        { buf: H.norm(gE), gain: -2 },
        { buf: H.norm(pillar), gain: -7 },
        { buf: H.norm(H.bronze(N.D2, D, { t60: 1.6, bright: 0.9, attack: 0.5, seed: `rsb${k}` })), gain: -13 },
        { buf: H.strike(await H.ld(X.debrisBig, 0.4 + k * 0.4, 2.2 + k * 0.4, { hp: 120 })), at: 0.35, gain: -12 },
      ]);
      rise.push(H.shape(lib.fadeIn(H.cut(H.verb(v, 'urban', 0.2, 1.6, `rsv${k}`, 1), D, 0.35), 0.01), -15));
    }
    await cat.add('greataxe_ult_rise', rise, { lufs: -15, vol: 1.1, spatial: true, range: [12, 140], voices: 2, pitch: [1, 1], maxHeadMs: 300, sources: [X.mgrowl, X.didg, X.iceCrack, X.rubbleScrape, X.debrisBig] });
    keep.rise = rise[0];
  }

  // ③ 巨大風切 (1.35 -> 1.9: the 14 m axe sweeps the street; the cue is the start of the sweep): a wall of air far
  // below any swing, the giant head's whoom, its edge cutting, the flame roaring round it, the street's dust thrown
  // up behind, a low bronze 「嗡」 as it passes
  const sweep = [];
  {
    const whoom = await H.ld(X.whoom, 0, 0.557, { hp: 35 });
    for (let k = 0; k < 2; k++) {
      const r = H.rng(`us${k}`), D = 1.5, P = 0.3;
      const air = await H.ld(X.katana, ...KATANA[k * 2], { hp: 300, semis: -6 });
      const roar = H.swoosh(1.0, P, [60, 230, 70], { q: 0.8, seed: `usr${k}`, rise: 1.5, fall: 3.5 });
      const hiss = H.swoosh(0.9, P + 0.01, [1000, 4200, 1600], { q: 1.1, color: 'white', seed: `ush${k}`, rise: 2.5, fall: 7 });
      const fl = lib.automate(H.flame(1.0, { seed: `usf${k}`, lo: 150, hi: 1600, rate: 12 }), (t) => H.smooth((t - 0.08) / (P - 0.08)) * Math.exp(-Math.max(0, t - P) * 3.2));
      const dust = lib.automate(lib.eq(lib.noise(1.2, { color: 'pink', seed: `usd${k}` }), [{ type: 'bp', f: 1100, q: 0.6 }]), (t) => H.smooth((t - P) / 0.15) * Math.exp(-Math.max(0, t - P - 0.1) * 3));
      const v = lib.mix([
        H.alignAt(H.norm(lib.varispeedSemis(whoom, -10 + r.range(-0.5, 0.5))), P, 0),
        { buf: H.norm(roar), gain: -3 }, H.alignAt(air, P + 0.01, -2), { buf: H.norm(hiss), gain: -5 }, { buf: H.norm(fl), gain: -7 },
        { buf: H.norm(H.bronze(N.D2 * r.range(0.995, 1.005), 1.2, { t60: 0.9, attack: 0.05, seed: `usb${k}` })), at: P - 0.04, gain: -12 },
        { buf: H.boom(`usbm${k}`, { f0: 80, f1: 42, decay: 0.35, drive: 2 }), at: P - 0.03, gain: -12 },
        { buf: H.norm(dust), gain: -14 },
        { buf: H.strike(await H.ld(X.rubbleScrape, 0, 1.0, { hp: 200, semis: -2 })), at: P + 0.05, gain: -13 },
      ], { length: D });
      const e = lib.eq(v, [{ type: 'hp', f: 40, order: 2 }, { type: 'lowshelf', f: 110, gain: -1.5 }, { type: 'peak', f: 2000, gain: 2, q: 0.8 }, { type: 'highshelf', f: 4500, gain: 3 }]);
      sweep.push(H.shape(H.cut(H.verb(e, 'urban', 0.18, 1.5, `usv${k}`, 1), D, 0.4), -13.5));
    }
    await cat.add('greataxe_ult_sweep', sweep, { lufs: -13.5, vol: 1.1, spatial: true, range: [12, 140], voices: 2, pitch: [0.98, 1.02], priority: 2, sources: [X.whoom, X.katana, X.rubbleScrape] });
  }

  // ④ the chop coming down (0.2 s before the bite): a falling roar accelerating into the street — the air pressure
  // building under the head, the flame shrieking, the growl swelling — cut off where the impact takes over
  const chop = [];
  for (let k = 0; k < 2; k++) {
    const D = 0.34, B = 0.2;
    const f = (t) => 1500 * Math.pow(0.3, Math.min(t, B) / B);
    const fall = lib.sweep(lib.noise(D, { color: 'pink', seed: `ucn${k}` }), 'bp', f, { q: 1.4 });
    const press = lib.sweep(lib.noise(D, { color: 'brown', seed: `ucp${k}` }), 'lp', (t) => 200 + 1600 * Math.min(1, t / B), { q: 0.8 });
    const gr = lib.varispeedCurve(lib.slice(didg, 0.2, 0.6), [[0, 0.7], [0.3, 0.55]]);
    const cresc = (t) => (0.08 + 0.92 * (Math.min(t, B) / B) ** 2.2) * (t > B ? Math.exp(-(t - B) * 40) : 1);
    const v = lib.automate(lib.mix([{ buf: H.norm(fall) }, { buf: H.norm(press), gain: -3 }, { buf: H.norm(H.flame(D, { seed: `ucf${k}`, lo: 400, hi: 3500, rate: 22 })), gain: -9 }, { buf: H.norm(gr), gain: -8 }], { length: D }), cresc);
    chop.push(lib.fadeIn(v, 0.01));
  }
  await cat.add('greataxe_ult_chop', chop, { lufs: -15, vol: 1.2, spatial: true, range: [12, 140], voices: 2, pitch: [0.99, 1.01], maxHeadMs: 200, sources: [X.didg] });

  // ⑤ the bite (§1.12 layer 2): the 40-60 Hz blow (~0.3 s: a punch, not a held drone), a deep explosion and a blast,
  // the street smashed, the giant iron edge and the bronze body ringing (D2 / D3, beating), a gong struck by the blow,
  // the molten street bursting into fire, debris raining down; the tail is rumble + debris, not sub tone
  const impact = [];
  {
    const deepB = H.tight(H.strike(await H.ld(X.deepBoom, 0, 2.6, { hp: 28 })), 1.3);
    const blast = H.tight(H.strike(await H.ld(X.blast, 0, 1.24, { hp: 45 })), 0.9);
    const smash = H.tight(H.strike(await H.ld(X.concSmash, 0, 1.27, { hp: 45 })), 0.8);
    const clang = H.tight(H.strike(await H.ld(X.clangDeep, 0, 1.12, { hp: 60, semis: -6 })), 1.4);
    const gong = lib.decay(H.strike(await H.ld(X.gongCh, 0, 4.0, { hp: 50, fadeOut: 0.6 })), 2.2, 0.05);
    const fire = H.tight(H.strike(await H.ld(X.fireWhoosh, 0.05, 2.5, { hp: 40 })), 1.2);
    for (let k = 0; k < 2; k++) {
      const D = 3.4;
      const debris = await H.ld(X.debrisBig, 0.05 + k * 0.4, 3.3, { hp: 60 });
      const crash = await H.ld(X.longCrash, 0.3 + k * 1.5, 3.4 + k * 1.5, { hp: 60 });
      const v = lib.mix([
        { buf: H.boom(`uib${k}`, { f0: 96, f1: 46, sweep: 0.06, decay: 0.55, drive: 2, amount: -3 }) },
        { buf: H.strike(deepB), gain: -4 },
        { buf: H.strike(blast), gain: -4 },
        { buf: H.strike(smash), gain: -3 },
        { buf: H.K.crack(`uic${k}`, { dur: 0.02, decay: 0.005, hp: 1200 }), gain: -3 },
        { buf: H.strike(clang), gain: -5 },
        { buf: H.strike(await H.ld(X.metalH(k + 2), 0, 0.4, { hp: 150, semis: -6 })), gain: -7 },
        { buf: H.norm(H.bronze(N.D2 * (k ? 1.004 : 1), D, { t60: 2.0, bright: 1.1, seed: `uir${k}`, beat: 0.005 })), gain: -11 },
        { buf: H.norm(H.bronze(N.D3 * (k ? 0.997 : 1), D, { t60: 1.5, bright: 0.9, seed: `uiq${k}` })), at: 0.004, gain: -14 },
        { buf: H.norm(gong), at: 0.01, gain: -12 },
        { buf: H.strike(fire), at: 0.03, gain: -7 },
        { buf: H.norm(H.rumble(D, `uiru${k}`, { lp: 220, t60: 2.4 })), gain: -12 },
        { buf: H.strike(debris), at: 0.1, gain: -6 },
        { buf: H.strike(crash), at: 0.25, gain: -9 },
        { buf: H.embers(2.0, 32, { seed: `uie${k}`, skew: 1.3 }), at: 0.05, gain: -12 },
      ]);
      const e = lib.eq(v, [{ type: 'hp', f: 28, order: 2 }, { type: 'lowshelf', f: 70, gain: -3 }, { type: 'peak', f: 1800, gain: 2.5, q: 0.7 }, { type: 'highshelf', f: 4000, gain: 2.5 }]);
      impact.push(H.shape(H.cut(H.verb(e, 'urban', 0.22, 2.4, `uiv${k}`, 1), D, 0.4), -14, { max: 5 }));
    }
    await cat.add('greataxe_ult_impact', impact, { lufs: -14, vol: 1.25, maxLimitDb: 6, spatial: true, range: [15, 160], voices: 2, pitch: [0.99, 1.01], priority: 3,
      sources: [X.deepBoom, X.blast, X.concSmash, X.clangDeep, X.gongCh, X.fireWhoosh, X.debrisBig, X.longCrash, X.metalH(2)] });
    keep.impact = impact[0];
  }

  // ⑥ shatter (3.3) + release (§1.12 收尾的洩氣聲): the glazed-bronze giant breaks apart — bronze plates cracking and
  // falling (metal debris, a rain of bronze pings, glaze breaking), the fire guttering out, then the deflating sigh (a
  // falling hiss, a low exhale, the growl's last breath falling D3 -> D2) and one soft drum
  const shatter = [];
  {
    const tank = await H.ld(X.tankDebris, 0, 1.6, { hp: 120 });
    const plate = await H.ld(X.plate, 0.02, 1.08, { hp: 200 });
    const chain = await H.ld(X.chain, 2.0, 4.0, { hp: 800 });
    const breath = await H.ld(X.mgrowl, 2.4, 4.1, { hp: 40 });
    for (let k = 0; k < 2; k++) {
      const r = H.rng(`sh${k}`), D = 3.0;
      const plates = [];
      for (let i = 0; i < 9; i++) plates.push({ buf: H.norm(H.bronze(N.D4 * Math.pow(2, r.range(-0.8, 1.2)), 0.5, { t60: 0.25, bright: 1.2, seed: `shp${k}${i}` })), at: 0.05 + Math.pow(r.next(), 1.4) * 1.6, gain: -12 - r.range(0, 8) });
      const hiss = lib.automate(lib.sweep(lib.noise(2.2, { seed: `shh${k}` }), 'bp', (t) => 3800 * Math.pow(0.08, t / 2.2), { q: 1.0 }), (t) => Math.min(1, t / 0.12) * Math.exp(-t * 1.5));
      const exhale = lib.automate(lib.varispeedCurve(breath, [[0, 0.75], [1.7, 0.5]]), (t) => Math.min(1, t / 0.2) * Math.exp(-t * 1.4));
      const fallT = lib.applyEnv(lib.saturate(lib.tone(2.0, { type: 'saw', freq: [[0, N.D3], [2.0, N.D2]] }), { drive: 3, type: 'tube' }), lib.expEnv(2.0, { attack: 0.05, t60: 1.6 }));
      const embersOut = lib.automate(H.flame(2.4, { seed: `shf${k}`, lo: 180, hi: 1500, rate: 8 }), (t) => Math.exp(-t * 1.8));
      const v = lib.mix([
        { buf: H.strike(lib.varispeedSemis(tank, r.range(-4, -2))) },
        { buf: H.strike(lib.varispeedSemis(plate, -3)), at: 0.02, gain: -4 },
        { buf: H.strike(await H.ld(X.metalH(k + 3), 0, 0.4, { hp: 200, semis: -5 })), gain: -4 },
        { buf: lib.thump({ f0: 80, f1: 42, sweep: 0.05, decay: 0.45, click: 0, drive: 2, seed: `sht${k}` }), gain: -8 },
        { buf: H.norm(chain), at: 0.15, gain: -16 },
        ...plates,
        { buf: H.embers(2.2, 36, { seed: `she${k}`, skew: 1.1, fall: 12 }), at: 0.06, gain: -9 },
        { buf: H.norm(embersOut), gain: -15 },
        { buf: H.norm(hiss), at: 0.45, gain: -13 },
        { buf: H.norm(lib.eq(exhale, [{ type: 'lp', f: 1200, order: 2 }])), at: 0.5, gain: -10 },
        { buf: H.norm(lib.eq(fallT, [{ type: 'lp', f: 700, order: 2 }])), at: 0.55, gain: -19 },
        { buf: await H.drum(`shd${k}`, { size: -4, ring: 1.0, slap: -16 }), at: 1.5, gain: -14 },
      ]);
      shatter.push(H.shape(H.cut(H.verb(v, 'urban', 0.2, 1.8, `shv${k}`, 1), D, 0.35), -15));
    }
    await cat.add('greataxe_ult_shatter', shatter, { lufs: -15, vol: 1.2, spatial: true, range: [12, 140], voices: 2, pitch: [0.99, 1.01], sources: [X.tankDebris, X.plate, X.chain, X.mgrowl, X.metalH(3), X.bdFff] });
    keep.shatter = shatter[0];
  }

  // the bed (§1.12 layer 3; 2D for the caster, starts at 0.3 = the rise): 北管-style war drums and gong. The spirit
  // rises on a drum and the horns' open fifth (D2 A2 D3); strokes quicken into the sweep (1.05: drum + the opera
  // cymbal); a roll of bass drum and suspended cymbal climbs under the raised axe and stops dead before the bite (2.42:
  // drum, gong, the choir and the horns open on D minor); a stroke on each ring; the gong rings out over the shatter
  // (3.0) and the chord dies away.
  let bed;
  {
    const D = 4.6, parts = [];
    const dr = async (at, gain, o = {}) => parts.push({ buf: await H.drum(`bd${parts.length}`, o), at, gain });
    await dr(0, -2, { size: -3, ring: 1.0 });
    await dr(0.5, -9, { size: -1, ring: 0.5, muted: true });
    await dr(0.78, -8, { size: -1, ring: 0.5, muted: true });
    await dr(1.05, -1, { size: -3, ring: 0.9, slap: -8 });
    parts.push({ buf: H.strike(await H.ld(X.opera, 0, 1.0, { stereo: true, hp: 300 })), at: 1.05, gain: -8 });
    await dr(1.3, -8, { size: -1, ring: 0.4, muted: true });
    await dr(1.48, -7, { size: -1, ring: 0.4, muted: true });
    // the roll under the raised axe (1.6 -> 2.4), cut dead 20 ms before the bite
    const roll = await H.ld(X.bdRoll, 1.0, 2.0, { stereo: true, hp: 35 });
    parts.push({ buf: H.env(roll, [[0, -24], [0.6, -6], [0.78, 0], [0.8, -60]]), at: 1.6, gain: -4 });
    const susp = await H.ld(X.suspRoll, 2.4, 3.4, { stereo: true, hp: 400 });
    parts.push({ buf: H.env(susp, [[0, -30], [0.7, -4], [0.78, 0], [0.8, -60]]), at: 1.6, gain: -10 });
    await dr(2.42, 0, { size: -4, ring: 1.4, slap: -8 });
    parts.push({ buf: lib.decay(H.strike(await H.ld(X.gongCh, 0, 4.0, { stereo: true, hp: 45, fadeOut: 0.5 })), 2.6, 0.05), at: 2.42, gain: -4 });
    parts.push({ buf: H.strike(await H.ld(X.crash, 0.04, 2.3, { stereo: true, hp: 250 })), at: 2.42, gain: -12 });
    for (const [i, at] of [2.55, 2.68, 2.81].entries()) await dr(at, -6 - i * 3, { size: -2, ring: 0.5, muted: true });
    // horns: the open fifth from the rise, swelling into the bite, holding D minor (F from the choir) through the rings
    const horn = lib.mix([
      { buf: await H.ld(X.hornDs2, 0.1, 4.7, { stereo: true, hp: 35, semis: -1 }) },
      { buf: await H.ld(X.hornA3, 0.1, 4.7, { stereo: true, hp: 60, semis: -12 }), gain: -3 },
      { buf: await H.ld(X.hornD3, 0.1, 4.7, { stereo: true, hp: 70 }), gain: -2 },
    ], { channels: 2 });
    parts.push({ buf: H.env(horn, [[0, -30], [0.5, -9], [2.3, -4], [2.42, 0], [3.2, -2], [4.2, -40]]), at: 0, gain: -5 });
    const choir = lib.mix([{ buf: await H.ld(X.choirUh, 0.9, 4.6, { stereo: true, hp: 140, semis: -3, lp: 4500 }) }, { buf: await H.ld(X.choirA, 0.4, 4.1, { stereo: true, hp: 160, semis: 0, lp: 4500 }), at: 0.02, gain: -6 }], { channels: 2 });
    parts.push({ buf: H.env(choir, [[0, -40], [0.1, -6], [0.4, 0], [1.2, -2], [1.6, -40]]), at: 2.38, gain: -8 });
    parts.push({ buf: H.norm(H.zheng(N.D5, 2.0, { seed: 'bedz', t60: 1.8 })), at: 3.0, gain: -14 });
    parts.push({ buf: H.norm(lib.decay(H.strike(await H.ld(X.gongScrape, 0.07, 2.0, { stereo: true, hp: 200 })), 1.2)), at: 3.0, gain: -20 });
    let v = lib.mix(parts, { channels: 2, length: D });
    v = H.verb(v, 'warehouse', 0.18, 2.2, 'bedv');
    bed = H.shape(lib.fadeOut(lib.slice(v, 0, D), 0.6, 'exp'), -18);
    await cat.add('greataxe_ult_bed', bed, { lufs: -18, vol: 1.2, spatial: false, channels: 2, voices: 1, pitch: [1, 1],
      sources: [X.bdFff, X.bdMuted, X.bdRoll, X.suspRoll, X.opera, X.gongCh, X.crash, X.hornDs2, X.hornA3, X.hornD3, X.choirUh, X.choirA, X.gongScrape] });
    keep.bed = bed;
  }

  // the whole ultimate as the caster hears it at the handler's volumes (spatial layers ~10 m away, inside their ref
  // distance) — logged and previewed
  const at = (b, l, t, vol = 1) => ({ buf: H.atLufs(b, l), at: t, gainLin: vol });
  const tl = lib.mix([at(keep.roar, -14, 0, 1.1), at(bed, -18, 0.3, 1.2 * 0.8), at(sigil[0], -18, 0.2, 1.4 * 0.9), at(rise[0], -15, 0.3, 1.1), at(sweep[0], -13.5, 1.35, 1.1),
    at(chop[0], -15, 2.52, 1.2), at(keep.impact, -14, 2.72, 1.25 * 1.2), ...[0, 1, 2].map((i) => at(keep.quake?.[i] || keep.impact, -16, 2.85 + i * 0.13, 1 - i * 0.2)),
    at(shatter[0], -15, 3.3, 1.2)], { channels: 2 });
  const L = lib.loudness(tl);
  ctx.log(`  ult timeline: ${L.integrated.toFixed(1)} LUFS integrated, momentary max ${L.momentaryMax.toFixed(1)}, short-term max ${L.shortTermMax.toFixed(1)}, peak ${lib.lin2db(lib.peak(tl)).toFixed(1)} dBFS`);
  ctx.preview('ult_timeline', tl);
}

// ---------------------------------------------------------------------------------------------- the axe's life
async function view(lib, ctx, cat, H, keep) {
  // greataxe_idle: §1.12 idle hum — 55 / 73 / 110 Hz (A1 D2 A2) through a tube, a 400-1200 Hz band of noise swept by a
  // 0.2 Hz LFO, the furnace in the mouth breathing (a slow flame, a few embers), a faint bronze shimmer beating.
  // Periodic in 10 s; only the random textures go through the loop crossfade.
  {
    const P = 10, L = 11.5, q = (f) => H.onGrid(f, P), lfo = (t) => 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.2 * t);
    const hum = lib.saturate(lib.mix([{ buf: lib.tone(P, { freq: q(N.A1) }), gain: -2 }, { buf: lib.tone(P, { freq: q(N.D2) }) }, { buf: lib.tone(P, { freq: q(N.A2) }), gain: -7 }, { buf: lib.tone(P, { freq: q(N.D3) }), gain: -14 }]), { drive: 3, type: 'tube' });
    const shimmer = lib.automate(lib.mix([{ buf: lib.tone(P, { freq: q(N.D5) + 0.2 }) }, { buf: lib.tone(P, { freq: q(N.D5) - 0.2 }) }, { buf: lib.tone(P, { freq: q(N.A5) }), gain: -6 }]), (t) => 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.3 * t));
    const band = lib.sweep(lib.noise(L, { color: 'pink', seed: 'idle_n' }), 'bp', (t) => 400 * Math.pow(3, lfo(t)), { q: 1.6 });
    const furnace = H.flame(L, { seed: 'idle_f', lo: 120, hi: 700, rate: 3, depth: 0.6, crackle: -12 });
    const pops = H.embers(L, 26, { seed: 'idle_e', skew: 1, fall: 0, pops: 0.8 });
    const texture = lib.loopCrossfade(lib.mix([{ buf: lib.stereoize(H.norm(band), { width: 0.35, hp: 250, seed: 'idle_st' }), gain: -7 }, { buf: lib.stereoize(H.norm(furnace), { width: 0.4, hp: 200, seed: 'idle_fs' }), gain: -10 },
      { buf: lib.stereoize(pops, { width: 0.6, hp: 1500, seed: 'idle_ps' }), gain: -24 }], { channels: 2, length: L }), L - P);
    const v = lib.mix([{ buf: H.norm(hum), gain: -4 }, { buf: H.norm(shimmer), gain: -32 }, { buf: texture }], { length: P, channels: 2 });
    H.seamCheck('greataxe_idle', v, 5);
    await cat.add('greataxe_idle', v, { lufs: -20, loop: true, spatial: false, channels: 2, voices: 1, pitch: [1, 1] });
  }

  // greataxe_draw: 銅響 — the axe lifted out of the lower right (a heavy whoosh, the leather grips creaking), the
  // ferrules and lashings clanking as it settles, the cast seam lighting (a soft fire swell, embers)
  {
    const out = [];
    for (let k = 0; k < 2; k++) {
      const D = 0.8;
      const lift = H.swoosh(0.4, 0.2, [150, 480, 160], { q: 1.0, seed: `drw${k}`, rise: 1.8, fall: 4 });
      const seam = lib.automate(H.flame(0.5, { seed: `drf${k}`, lo: 200, hi: 1600, rate: 10 }), (t) => H.smooth(t / 0.15) * Math.exp(-Math.max(0, t - 0.15) * 6));
      const v = lib.mix([
        { buf: H.norm(lift), gain: -5 },
        { buf: await H.ld(X.clothHeavy, 0, 0.5, { hp: 120 }), gain: -12 },
        { buf: H.strike(await H.ld(X.metalL(k + 1), 0, 0.3, { hp: 500, semis: -5 })), at: 0.3, gain: -8 },
        { buf: H.norm(H.bronze(k ? N.A3 : N.D4, 0.8, { t60: 0.6, seed: `drb${k}` })), at: 0.3, gain: -7 },
        { buf: lib.thump({ f0: 110, f1: 60, sweep: 0.02, decay: 0.1, click: 0.2, drive: 1.5, seed: `drt${k}` }), at: 0.3, gain: -12 },
        { buf: H.norm(seam), at: 0.32, gain: -14 },
        { buf: H.embers(0.4, 6, { seed: `dre${k}` }), at: 0.36, gain: -20 },
      ]);
      out.push(H.cut(H.verb(lib.stereoize(v, { width: 0.3, hp: 500, seed: `drs${k}` }), 'smallRoom', 0.12, 0.6, `drv${k}`), D, 0.4));
    }
    await cat.add('greataxe_draw', out, { lufs: -19, vol: 1.1, spatial: false, channels: 2, voices: 1, pitch: [0.98, 1.02], sources: [X.clothHeavy, X.metalL(1)] });
  }

  // greataxe_draw_first (0.034 s into the 1.7 s first draw): 鐵刃刮石＋低沉銅響 — the axe dragged up off the street head
  // first (the iron edge scraping stone, sparks), turned to face the eye (a deep bronze dong at 0.36), then two heavy
  // drums as the eyes light (0.68, 0.84), the furnace rising into the roar at 0.94
  {
    const D = 1.2;
    const rub = await H.ld(X.rubbleScrape, 0, 1.0, { hp: 150 });
    const gscr = await H.ld(X.gongScrape, 0.075, 0.6, { hp: 900, semis: -5 });
    const scrape = lib.automate(lib.mix([{ buf: H.norm(lib.concat([rub, rub])) }, { buf: H.norm(gscr), gain: -6 }, { buf: H.norm(H.K.scrape(0.6, 900, 2600, 'dfs')), gain: -9 }]), (t) => H.smooth(t / 0.05) * (t < 0.55 ? 0.6 + 0.4 * (t / 0.55) : Math.exp(-(t - 0.55) * 18)));
    const sparks = lib.automate(lib.crackle(0.6, { density: 110, decay: 0.002, hp: 3500, seed: 'dfk' }), (t) => (t < 0.5 ? 1 : Math.exp(-(t - 0.5) * 20)));
    const rise = lib.automate(H.flame(0.5, { seed: 'dff', lo: 150, hi: 1800, rate: 12 }), (t) => H.smooth(t / 0.4));
    const v = lib.mix([
      { buf: await H.ld(X.clothHeavy, 0, 0.5, { hp: 80 }), gain: -12 },
      { buf: scrape, at: 0.0, gain: -3 },
      { buf: H.norm(sparks), gain: -16 },
      { buf: H.norm(H.bronze(N.D3, 1.0, { t60: 0.8, seed: 'dfb' })), at: 0.36, gain: -6 },
      { buf: H.strike(await H.ld(X.metalL(3), 0, 0.3, { hp: 300, semis: -6 })), at: 0.36, gain: -12 },
      { buf: await H.drum('dfd1', { size: -2, ring: 0.6, slap: -10 }), at: 0.68, gain: -4 },
      { buf: await H.drum('dfd2', { size: -3, ring: 0.7, slap: -9 }), at: 0.84, gain: -2 },
      { buf: H.norm(rise), at: 0.7, gain: -14 },
    ]);
    const out = H.cut(H.verb(lib.stereoize(v, { width: 0.3, hp: 500, seed: 'dfw' }), 'warehouse', 0.14, 1.2, 'dfv'), D, 0.2);
    await cat.add('greataxe_draw_first', out, { lufs: -18, vol: 1.1, spatial: false, channels: 2, voices: 1, pitch: [1, 1], sources: [X.rubbleScrape, X.gongScrape, X.clothHeavy, X.metalL(3), X.bdFff] });
  }

  // greataxe_roar (first draw, 0.97 s: the jaw thrown open for 0.27 s): the mask roars — a beast through a bronze
  // throat (the 銅鑼泛音), a gong's shimmer struck by it, the furnace bursting out of the mouth, embers
  {
    const D = 1.4;
    const tiger = await H.ld(X.tiger, 1.05, 1.95, { hp: 70, semis: -3 });
    const didg = await H.ld(X.didg, 0.3, 1.2, { hp: 60, semis: -1 });
    const mroar = await H.ld(X.mroar, 0, 1.0, { hp: 40 });
    const voice = lib.automate(H.throat(lib.mix([{ buf: tiger }, { buf: didg, gain: -4 }, { buf: mroar, gain: -5 }]), N.D4, { wet: 0.6, seed: 'rot' }), (t) => H.smooth(t / 0.04) * (t < 0.3 ? 1 : Math.exp(-(t - 0.3) * 5)));
    const gong = lib.decay(H.strike(await H.ld(X.gong, 0.12, 2.0, { stereo: true, hp: 300, fadeOut: 0.4 })), 0.9, 0.03);
    const puff = H.tight(H.strike(await H.ld(X.fireB2, 0, 1.4, { stereo: true, hp: 60 })), 0.7);
    const v = lib.mix([
      { buf: H.norm(voice) },
      { buf: H.norm(gong), at: 0.01, gain: -15 },
      { buf: puff, at: 0.0, gain: -8 },
      { buf: H.norm(lib.automate(H.flame(0.8, { seed: 'rof', lo: 260, hi: 3000, rate: 18 }), (t) => Math.min(1, t / 0.03) * Math.exp(-t * 4))), gain: -12 },
      { buf: H.strike(await H.ld(X.metalL(4), 0, 0.3, { hp: 600, semis: -5 })), gain: -14 },
      { buf: H.embers(0.9, 14, { seed: 'roe' }), at: 0.04, gain: -15 },
    ], { channels: 2 });
    const out = H.shape(H.cut(H.verb(lib.stereoize(v, { width: 0.3, hp: 500, seed: 'ros' }), 'warehouse', 0.16, 1.2, 'rov'), D, 0.4), -16);
    await cat.add('greataxe_roar', out, { lufs: -16, vol: 1.1, spatial: false, channels: 2, voices: 1, pitch: [1, 1], sources: [X.tiger, X.didg, X.mroar, X.gong, X.fireB2, X.metalL(4)] });
  }

  // greataxe_first_sting (1.39 s): 主題「猛志」 — one great drum stroke and a long 銅鉦 tone (D4 with D5 in it), a
  // gong wash, the horns' open fifth low under it and a low choir, embers rising
  {
    const D = 3.0;
    const horn = lib.mix([{ buf: await H.ld(X.hornDs2, 0.1, 3.2, { stereo: true, hp: 35, semis: -1 }) }, { buf: await H.ld(X.hornA3, 0.1, 3.2, { stereo: true, hp: 60, semis: -12 }), gain: -3 }], { channels: 2 });
    const choir = await H.ld(X.choirUh, 0.9, 3.9, { stereo: true, hp: 140, semis: -3, lp: 4000 });
    const v = lib.mix([
      { buf: await H.drum('fsd', { size: -4, ring: 1.3, slap: -8 }) },
      { buf: H.norm(H.zheng(N.D4, D, { seed: 'fsz', t60: 2.6, bright: 0.9 })), at: 0.004, gain: -3 },
      { buf: H.norm(H.zheng(N.D5, 2.4, { seed: 'fsz2', t60: 1.8, tick: -22 })), at: 0.01, gain: -9 },
      { buf: H.norm(lib.decay(H.strike(await H.ld(X.gongCh, 0, 3.5, { stereo: true, hp: 50, fadeOut: 0.6 })), 2.4, 0.05)), gain: -12 },
      { buf: H.env(horn, [[0, -40], [0.25, -4], [1.8, -6], [2.9, -40]]), gain: -10 },
      { buf: H.env(choir, [[0, -40], [0.2, -3], [1.8, -5], [2.8, -40]]), gain: -15 },
      { buf: H.embers(1.6, 18, { seed: 'fse', skew: 0.9 }), at: 0.05, gain: -17 },
    ], { channels: 2 });
    const out = H.cut(H.verb(v, 'warehouse', 0.26, 2.4, 'fsv'), D, 0.35);
    await cat.add('greataxe_first_sting', out, { lufs: -18, vol: 1.3, spatial: false, channels: 2, voices: 1, pitch: [1, 1], sources: [X.bdFff, X.gongCh, X.hornDs2, X.hornA3, X.choirUh] });
  }

  // greataxe_inspect (§1.12: a 2-3 s theme phrase; the cue starts 0.53 s into the 4.4 s inspect): a slow war-drum
  // pulse and an original phrase on bronze bells (A4 D5 C5 A4 G4 .. F4 D4) over a low horn and choir | 1.49 / 1.63 the
  // thumb tests the edge (two short iron scrapes, sparks) | 2.1-2.6 the half turn (two slow whooshes, the tassel's
  // silk swish, a clink of the lashings)
  {
    const D = 3.4;
    const phrase = [[N.A4, 0.25, 0], [N.D5, 0.62, -1], [N.C5, 0.98, -2], [N.A4, 1.3, -2], [N.G4, 1.7, -3], [N.F4, 2.15, -2], [N.D4, 2.55, 0]];
    const notes = phrase.map(([f, at, g], i) => ({ buf: H.zheng(f, 1.8, { seed: `inp${i}`, t60: 1.5, bright: 0.8, tick: -24 }), at, gain: g, pan: -0.3 + i * 0.1 }));
    const drums = [];
    for (const [i, at] of [0.0, 0.62, 1.24, 1.86, 2.48].entries()) drums.push({ buf: await H.drum(`ind${i}`, { size: -3, ring: 0.6, slap: -16, muted: i % 2 === 1 }), at, gain: i === 4 ? -2 : -5 });
    const thumb = (seed) => lib.mix([{ buf: H.norm(H.K.scrape(0.11, 2600, 5200, seed)) }, { buf: H.norm(lib.crackle(0.12, { density: 160, decay: 0.0015, hp: 4000, seed: seed + 'k' })), gain: -8 }]);
    const turn = lib.mix([{ buf: H.swoosh(0.45, 0.2, [260, 900, 300], { q: 1.1, seed: 'inw1' }) }, { buf: H.swoosh(0.45, 0.2, [240, 820, 280], { q: 1.1, seed: 'inw2' }), at: 0.45, gain: -2 }]);
    const silk = H.swoosh(0.35, 0.15, [2500, 5000, 3500], { q: 1.6, color: 'white', seed: 'ins', rise: 1.5, fall: 4 });
    const horn = await H.ld(X.hornD3, 0.2, 3.6, { stereo: true, hp: 70 });
    const v = lib.mix([
      ...drums,
      { buf: lib.mix(notes, { channels: 2 }), gain: -4 },
      { buf: H.env(horn, [[0, -40], [0.5, -6], [2.6, -8], [3.3, -40]]), gain: -20 },
      { buf: H.env(await H.ld(X.choirUh, 1.0, 4.4, { stereo: true, hp: 160, semis: -3, lp: 3500 }), [[0, -40], [0.6, -4], [2.6, -6], [3.3, -40]]), gain: -22 },
      { buf: H.norm(thumb('int1')), at: 1.49, gain: -11 },
      { buf: H.norm(thumb('int2')), at: 1.63, gain: -12 },
      { buf: H.norm(turn), at: 2.08, gain: -15 },
      { buf: H.norm(silk), at: 2.3, gain: -22 },
      { buf: H.strike(await H.ld(X.metalL(2), 0, 0.3, { hp: 900, semis: 3 })), at: 2.55, gain: -22 },
      { buf: await H.ld(X.cloth, 0, 0.34, { hp: 150 }), at: 2.1, gain: -20 },
    ], { channels: 2 });
    const out = H.cut(H.verb(v, 'warehouse', 0.22, 2.0, 'insv'), D, 0.12);
    await cat.add('greataxe_inspect', out, { lufs: -20, vol: 1.2, spatial: false, channels: 2, voices: 1, pitch: [1, 1], sources: [X.bdFff, X.bdMuted, X.hornD3, X.choirUh, X.metalL(2), X.cloth] });
  }

  // greataxe_jaw: 咬合「喀」 — the bronze jaw snapping shut (a hard clack and a heavy bronze clunk), a short huff of the
  // growl, a puff of fire (the ready reminders play it softly, the inspect bites hard)
  {
    const out = [];
    const snarl = await H.ld(X.snarl, 0.4, 1.4, { hp: 90, semis: -4 });
    for (let k = 0; k < 4; k++) {
      const r = H.rng(`jw${k}`);
      const huff = lib.automate(lib.slice(snarl, k * 0.2, k * 0.2 + 0.4), (t) => Math.min(1, t / 0.01) * Math.exp(-t * 9));
      const v = lib.mix([
        { buf: H.strike(await H.ld(X.metalL(k), 0, 0.3, { hp: 700, semis: r.range(-2, 1) })), gain: -3 },
        { buf: H.K.tick(`jwt${k}`, 2200), gain: -6 },
        { buf: H.norm(H.bronze(N.D3 * r.range(0.99, 1.01), 0.5, { t60: 0.18, bright: 1.1, seed: `jwb${k}` })), gain: -4 },
        { buf: lib.thump({ f0: 140, f1: 70, sweep: 0.015, decay: 0.08, click: 0.3, drive: 1.6, seed: `jwh${k}` }), gain: -9 },
        { buf: H.norm(huff), at: 0.01, gain: -12 },
        { buf: H.norm(lib.automate(H.flame(0.35, { seed: `jwf${k}`, lo: 250, hi: 2500, rate: 18 }), (t) => Math.min(1, t / 0.02) * Math.exp(-t * 10))), at: 0.01, gain: -16 },
      ]);
      out.push(H.cut(H.verb(lib.stereoize(v, { width: 0.2, hp: 600, seed: `jws${k}` }), 'smallRoom', 0.1, 0.4, `jwv${k}`), 0.5, 0.45));
    }
    await cat.add('greataxe_jaw', out, { lufs: -19, vol: 1.2, spatial: false, channels: 2, voices: 2, pitch: [0.97, 1.03], sources: [X.metalL(0), X.snarl] });
  }

  // greataxe_recover: 半聲銅鳴 — the axe swung up onto the shoulder (or wrenched out of the street): a low whoosh, a
  // little grit, the bronze ringing and stopped by the hand, the leather creaking, a few embers
  {
    const out = [];
    for (let k = 0; k < 3; k++) {
      const ringB = lib.automate(H.bronze([N.A3, N.D4, N.C4][k], 0.8, { t60: 0.6, seed: `rcr${k}` }), (t) => (t < 0.22 ? 1 : Math.exp(-(t - 0.22) * 16)));
      const v = lib.mix([
        { buf: H.norm(H.swoosh(0.4, 0.15, [180, 600, 220], { q: 1.1, seed: `rcw${k}` })), gain: -5 },
        { buf: H.strike(await H.ld(X.stoneDebris, 0, 0.39, { hp: 500 })), at: 0.02, gain: -18 },
        { buf: await H.ld(X.clothHeavy, 0.05, 0.5, { hp: 150 }), at: 0.1, gain: -12 },
        { buf: H.norm(ringB), at: 0.12, gain: -4 },
        { buf: H.embers(0.5, 7, { seed: `rce${k}` }), at: 0.14, gain: -19 },
      ]);
      out.push(H.cut(H.verb(lib.stereoize(v, { width: 0.3, hp: 600, seed: `rcs${k}` }), 'smallRoom', 0.12, 0.6, `rcv${k}`), 0.9, 0.4));
    }
    await cat.add('greataxe_recover', out, { lufs: -21, vol: 1.2, spatial: false, channels: 2, voices: 1, pitch: [0.98, 1.02], sources: [X.stoneDebris, X.clothHeavy] });
  }
}

// ---------------------------------------------------------------------------------------------- other
async function other(lib, ctx, cat, H, keep) {
  // ready_greataxe: §1.12 unique ready — the war drum's double stroke 「咚咚」 (matching the ready_double haptic), the
  // mask's low growl through bronze, a 銅鉦 on D5 with A5 over it, embers: low, martial, unmistakable (every other
  // ready in the game is a bell, a cry or a chord); it repeats softly every 2.5 s
  {
    const D = 1.7;
    const growl = await H.ld(X.mroar, 0.05, 0.7, { hp: 60, semis: -2 });
    const v = lib.mix([
      { buf: await H.drum('rdd1', { size: -1, ring: 0.35, slap: -8, muted: true }), gain: -4 },
      { buf: await H.drum('rdd2', { size: -2, ring: 0.6, slap: -7 }), at: 0.105 },
      { buf: H.norm(lib.automate(H.throat(growl, N.D4, { wet: 0.5, seed: 'rdt' }), (t) => H.smooth(t / 0.05) * Math.exp(-Math.max(0, t - 0.2) * 5))), at: 0.11, gain: -8 },
      { buf: H.norm(H.zheng(N.D5, D, { seed: 'rdz', t60: 1.2, tick: -12 })), at: 0.11, gain: -6 },
      { buf: H.norm(H.zheng(N.A5, 1.2, { seed: 'rdz2', t60: 0.8, tick: -20 })), at: 0.125, gain: -13 },
      { buf: H.embers(0.8, 12, { seed: 'rde' }), at: 0.13, gain: -16 },
    ], { channels: 2 });
    const out = H.shape(H.cut(H.verb(lib.stereoize(v, { width: 0.3, hp: 700, seed: 'rds' }), 'warehouse', 0.2, 1.5, 'rdv'), D, 0.35), -18);
    await cat.add('ready_greataxe', out, { lufs: -18, bus: 'ui', spatial: false, channels: 2, voices: 2, pitch: [1, 1], priority: 3, sources: [X.bdFff, X.bdMuted, X.mroar] });
    keep.ready = out;
  }

  // greataxe_crisis: 干盾 (§1.12 危機護甲: 瓷器碎裂＋元素尾音) — a glazed bronze shield flashes up and takes the blow (a big
  // bronze BONG and a thud), then bursts into a dozen bronze-and-glaze shards (porcelain and glass breaking, bronze
  // pings, a fire burst), the tail: a falling flame, the growl's huff, the bronze ringing out
  {
    const out = [];
    const huff = await H.ld(X.snarl, 0.5, 1.3, { hp: 90, semis: -5 });
    for (let k = 0; k < 2; k++) {
      const D = 1.9, B = 0.16;
      const tail = lib.automate(H.flame(1.4, { seed: `crf${k}`, lo: 160, hi: 1400, rate: 10 }), (t) => Math.min(1, t / 0.04) * Math.exp(-t * 2.4));
      const v = lib.mix([
        { buf: H.norm(H.bronze(N.D3 * (k ? 1.006 : 1), 1.4, { t60: 1.0, bright: 1.1, seed: `crb${k}` })), gain: -3 },
        { buf: H.strike(await H.ld(X.metalH(k + 1), 0, 0.4, { hp: 150, semis: -4 })), gain: -4 },
        { buf: H.strike(await H.ld(X.metalThud, 0.15, 0.75, { hp: 60 })), gain: -6 },
        { buf: H.strike(await H.ld(X.plate, 0.02, 1.08, { hp: 200, semis: k ? -1.5 : 0 })), at: B },
        { buf: H.strike(await H.ld(X.glassBreak, 0.0, 1.0, { hp: 400, semis: -5 })), at: B + 0.01, gain: -5 },
        { buf: H.strike(await H.ld(X.shard, 0.01, 0.33, { hp: 1500 })), at: B + 0.03, gain: -8 },
        { buf: H.boom(`crbm${k}`, { f0: 110, f1: 46, decay: 0.42, drive: 2.5 }), at: B, gain: -3 },
        { buf: H.strike(await H.ld(X.combust, 0.35, 1.5, { hp: 60 })), at: B + 0.01, gain: -8 },
        { buf: H.embers(1.1, 22, { seed: `cre${k}`, lo: 1800, hi: 6000, pops: 0.35, skew: 1.2 }), at: B + 0.02, gain: -8 },
        { buf: H.norm(tail), at: B + 0.08, gain: -11 },
        { buf: H.norm(lib.automate(huff, (t) => Math.min(1, t / 0.02) * Math.exp(-t * 5))), at: B + 0.1, gain: -13 },
      ]);
      out.push(H.shape(H.cut(H.verb(v, 'alley', 0.15, 1.2, `crv${k}`, 1), D, 0.4), -14));
    }
    await cat.add('greataxe_crisis', out, { lufs: -14, spatial: true, range: [4, 60], voices: 2, pitch: [0.98, 1.02], sources: [X.metalH(1), X.metalThud, X.plate, X.glassBreak, X.shard, X.combust, X.snarl] });
  }

  // greataxe_final: KE_FINAL — a 4 m spirit axe chops down on the wave's last kill (0.28 s fall): a falling roar into the
  // bite (a blow, concrete, a clang), a 銅鉦, the ring of a shockwave and embers
  {
    const out = [];
    const smash = H.tight(H.strike(await H.ld(X.concSmash, 0, 1.0, { hp: 40 })), 0.7);
    const clang = H.tight(H.strike(await H.ld(X.clangDeep, 0, 0.8, { hp: 60, semis: -4 })), 0.8);
    for (let k = 0; k < 2; k++) {
      const D = 2.0, B = 0.28;
      const fall = lib.automate(lib.mix([{ buf: lib.sweep(lib.noise(B, { color: 'pink', seed: `fnw${k}` }), 'bp', (t) => 1600 * Math.pow(0.3, t / B), { q: 1.3 }) }, { buf: H.norm(H.flame(B, { seed: `fnf${k}`, lo: 300, hi: 2500, rate: 20 })), gain: -6 }]),
        (t) => (t / B) ** 2 * (t > B - 0.012 ? Math.max(0, (B - t) / 0.012) : 1));
      const v = lib.mix([
        { buf: H.norm(fall), gain: -8 },
        { buf: H.boom(`fnb${k}`, { f0: 95, f1: 44, decay: 0.42, drive: 2.2 }), at: B },
        { buf: H.strike(smash), at: B, gain: -4 },
        { buf: H.strike(clang), at: B, gain: -7 },
        { buf: H.norm(H.zheng(N.D5, 1.5, { seed: `fnz${k}`, t60: 1.2, tick: -12 })), at: B + 0.005, gain: -7 },
        { buf: H.norm(H.rumble(1.2, `fnr${k}`, { lp: 170, t60: 0.9 })), at: B + 0.1, gain: -12 },
        { buf: H.embers(1.0, 16, { seed: `fne${k}`, skew: 1.2 }), at: B + 0.02, gain: -12 },
      ]);
      const e = lib.eq(v, [{ type: 'hp', f: 32, order: 2 }, { type: 'lowshelf', f: 80, gain: -2.5 }, { type: 'peak', f: 1600, gain: 2, q: 0.7 }]);
      out.push(H.shape(H.cut(H.verb(e, 'urban', 0.18, 1.4, `fnv${k}`, 1), D, 0.4), -15));
    }
    await cat.add('greataxe_final', out, { lufs: -15, vol: 1.2, spatial: true, range: [8, 100], voices: 1, pitch: [0.99, 1.01], maxHeadMs: 300, sources: [X.concSmash, X.clangDeep] });
  }
}

/** 刑天．夜舞 twin cues (§1.12 雙生版: the originals -4 st with an echo); a twin handler would play `${cue}_night`. */
async function twins(lib, ctx, cat, H, keep) {
  const T = (b) => H.twin(b);
  await cat.add('ready_greataxe_night', T(keep.ready), { lufs: -18, bus: 'ui', spatial: false, channels: 2, voices: 2, pitch: [1, 1], priority: 3, note: 'twin: ready_greataxe -4 st + echo' });
  await cat.add('greataxe_swing_night', keep.swing.slice(0, 4).map((b) => H.shape(lib.fadeOut(lib.slice(T(b), 0, 0.95), 0.3, 'exp'), -15)), { lufs: -15, spatial: false, channels: 2, voices: 3, pitch: [0.96, 1.04], note: 'twin: greataxe_swing -4 st + echo' });
  await cat.add('greataxe_ult_roar_night', H.shape(T(keep.roar), -14), { lufs: -14, vol: 1.1, spatial: true, channels: 1, range: [10, 130], voices: 2, pitch: [1, 1], priority: 3 });
  await cat.add('greataxe_ult_rise_night', T(keep.rise), { lufs: -15, vol: 1.1, spatial: true, channels: 1, range: [12, 140], voices: 2, pitch: [1, 1], maxHeadMs: 350 });
  await cat.add('greataxe_ult_impact_night', H.shape(T(keep.impact), -14, { max: 5 }), { lufs: -14, vol: 1.25, maxLimitDb: 6, spatial: true, range: [15, 160], voices: 2, pitch: [1, 1], priority: 3 });
  await cat.add('greataxe_ult_bed_night', T(keep.bed), { lufs: -18, vol: 1.2, spatial: false, channels: 2, voices: 1, pitch: [1, 1] });
  await cat.add('greataxe_ult_shatter_night', H.shape(T(keep.shatter), -15), { lufs: -15, vol: 1.2, spatial: true, range: [12, 140], voices: 2, pitch: [1, 1] });
}

/** Reference mixes as the player hears them (logged + previewed, not shipped). */
function references(lib, ctx, H, keep) {
  const at = (b, l, t, vol = 1) => ({ buf: H.atLufs(b, l), at: t, gainLin: vol });
  const log = (name, b) => { const L = lib.loudness(b); ctx.log(`  ${name}: ${L.integrated.toFixed(1)} LUFS integrated, momentary max ${L.momentaryMax.toFixed(1)}, short-term max ${L.shortTermMax.toFixed(1)}, peak ${lib.lin2db(lib.peak(b)).toFixed(1)} dBFS`); ctx.preview(name, b); };
  if (keep.swing && keep.hit && keep.ground) {
    // 開山三劈 connecting (two bodies a blow): 斜劈 at 0 (cue 0.13, hit 0.26), 回掄 at 0.62 (cue 0.12, hit 0.24), 開山 at
    // 1.24 (cue 0.21, bite 0.42: hit + flesh + chop_ground); a kill on the third
    const parts = [];
    for (const [i, [t0, c]] of [[0, 0.26], [0.62, 0.24]].entries()) parts.push(at(keep.swing[i], -15, t0 + c / 2, 0.95), at(keep.hit[i], -16, t0 + c, 1.12), at(keep.flesh[i], -17, t0 + c, 0.7), at(keep.flesh[i + 1], -17, t0 + c + 0.015, 0.6));
    parts.push(at(keep.swingHeavy[0], -14.5, 1.24 + 0.21, 0.95), at(keep.hit[2], -16, 1.24 + 0.42, 1.12), at(keep.flesh[3], -17, 1.24 + 0.42, 0.9), at(keep.ground[0], -15, 1.24 + 0.42, 1.25), at(keep.kill[0], -19, 1.24 + 0.42, 1.4 * 0.65));
    log('combo_timeline', lib.mix(parts, { channels: 2 }));
  }
  if (keep.charge && keep.land && keep.swingHeavy) {
    // 天墜 at stage 2: the charge loop (0.5, rate 0.8 -> 1.25 over 1.1 s) with its stages (0.55 / 1.1), released at
    // 1.4: the leap (0.9), the downstroke at 0.55 Tf (Tf 0.7), the landing (1.2) and three rings 0.12 s apart
    const c = keep.charge, Tf = 0.7, R = 1.4;
    const cl = lib.automate(lib.varispeedCurve(lib.concat([c, c]), [[0, 0.8], [1.1, 1.25], [6, 1.25]]), (t) => (t < R ? 1 : Math.max(0, 1 - (t - R) / 0.1)));
    log('leap_timeline', lib.mix([at(cl, -17, 0, 0.5), at(keep.stage[0], -17, 0.55, 1.3 * 0.65), at(lib.varispeed(keep.full, 1.122), -16, 1.1, 1.2 * 0.65),
      at(keep.leap[0], -16, R, 0.9), at(keep.swingHeavy[1], -14.5, R + Tf * 0.55, 0.9), at(keep.land[0], -14, R + Tf, 1.15),
      ...[0, 1, 2].map((i) => at(lib.varispeed(keep.quake[i], 1 - i * 0.08), -16, R + Tf + 0.12 * (i + 1), 0.9 - i * 0.2))], { channels: 2 }));
  }
}

// ---------------------------------------------------------------------------------------------- producer
export async function produce(lib, ctx) {
  const only = process.env.GA_ONLY ? new Set(process.env.GA_ONLY.split(',').map((s) => s.trim())) : null;
  const want = (g) => !only || only.has(g);
  const cat = ctx.category('premium_greataxe', { bus: 'sfx' });
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
  if (want('leap') || want('ult')) await leap(lib, ctx, cat, H, keep);
  if (want('spin')) await spin(lib, ctx, cat, H, keep);
  if (want('throw')) await thrown(lib, ctx, cat, H, keep);
  if (want('ult') || want('twin')) await ult(lib, ctx, cat, H, keep);
  if (want('view')) await view(lib, ctx, cat, H, keep);
  if (want('other') || want('twin')) await other(lib, ctx, cat, H, keep);
  if (want('twin')) await twins(lib, ctx, cat, H, keep);
  references(lib, ctx, H, keep);
  await cat.write();
}
