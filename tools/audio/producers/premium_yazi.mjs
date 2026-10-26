// 睚眥．裂魂 Yazi Soulrend (神兵 M02 ring-pommel long sabre + cinnabar scabbard, docs/PREMIUM_WEAPONS.md M02 + §1.12) —
// category 'premium_yazi': every cue game/src/weapons/premium/yazi.js plays (its SFX table, the clips' 'snd' events, the
// idle hum, the def's ready cue), the def.sound contract layers (yazi_close / _tail / _far) and the reserved twin
// 睚眥．白刃 (`<cue>_white`). CC0 recordings from the shared inventory (sword / katana passes, leather holsters, cloth,
// flesh / bone, stone / debris / blasts, a Chinese opera cymbal and an opera gong, VSCO 2 gongs / cymbals / drums /
// timpani / cello, dog and beast snarls, a tiger, fire, porcelain) and synthesis.
// Palette: the long mirror-steel sabre rings on G (G5 at the edge, G4 in its body: free-free bar modes as doublets); the
// scabbard's bronze mouth on D; the beast 睚眥 (a jackal's body, a dragon's head) snarls and snorts through a bronze
// throat; the crimson soul-energy is a fine electric sizzle; and the skills are played by the shadow-puppet theatre's
// 北管 band: an original synthetic 嗩吶 (suona: no recording), 小鑼 (the small opera gong whose pitch bends UP, 「鏘↗」),
// 大鑼 (the big one that bends DOWN, 「匡↘」), 鈸 (the opera cymbal), 拍板 (the clapper, 「八」), 堂鼓 (the drum), 碰鈴 (the
// cup bells, 「叮」); the inspect is a 南管-style phrase (琵琶 + 洞簫 + 拍板). Every tuned part sits in G 羽 (G B♭ C D F).
//
//   cuts     yazi_swing (袈裟 / 橫: the cue is delayed c.hit * 0.4, so the pass peaks 0.084 s in), _swing_heavy (兜割: the
//            raise, 鼻息, the 1.5 m lunge, straight down the middle; peaks 0.15 s in), yazi_close / _tail / _far (contract)
//   hits     _hit (2D under every connecting cut: the bite, the blade's G ring, the cut bleeding red, the §1.12 luxury
//            tick), _hit_flesh (one per body), _hit_wall (長刀擊石「鏘」), _kill (碰鈴「叮」 + the soul torn out), _sever,
//            _soul (KE_SOUL: the red wisp flying into the blade), _blood (reserved: the rare 報 drops landing)
//   居合      _unsheathe (出鞘), _sheathe (納刀「咔」), _koiguchi (鯉口を切る), _charge (loop, rate 0.8 -> 1.25 by the
//            handler: the beast's throat, a heartbeat, the scabbard's red current), _charge_stage (a seal strip
//            igniting), _charge_full (the third strip, 小鑼, the jaw), _issen (一閃: the dash-cut; mono, teammates hear it
//            where it starts), _issen_ring (2D: 「鏘——」 the long ring + the four screen slashes), _issen_burst (the bodies
//            burst a beat later), _parry (清脆「叮」), _parry_cymbal (鈸)
//   睚眥必報  _vengeance (大鑼「匡」 + the seal stamped), _reflect (the crimson thread + 報 on the attacker), _vengeance_end
//   裂魂      §1.12 three layers: rise (_ult_cast: 0.4 s, the inhale and the blade raised in red lightning) -> 40-60 Hz
//            impact (_ult_boom) -> the 北管 band (_ult_bed, scored to the 1.9 s timeline) + release (_ult_sheathe: 入鞘
//            「咔」, the deflating sigh, the puppets burning to paper ash). Beats: _ult_puppet (皮影翻板「啪」), _ult_suona
//            (一聲短促的嗩吶), _ult_seal (報印落下), _ult_slash (x6, pitched 0.9 -> 1.15 by the handler; also KE_FINAL),
//            _ult_issen (一閃穿心)
//   view     yazi_idle (loop: §1.12 hum + the runes breathing at 0.5 Hz + the beast's slow breath), _draw, _draw_first,
//            _first_sting (亮相「八—匡」), _inspect (§1.12: an original 南管-style phrase), _growl (低沉獸鼻息 / 短獸吼),
//            _flick (血振り), _recover (收招)
//   other    ready_yazi (unique: the jaw's 「喀」, the small opera gong bending up, a snarl's breath), _crisis (怒目:
//            瓷器碎裂 + the 360° draw + the crimson tail), _final (KE_FINAL: a puppet swordsman rises, the 報 seal flashes)
//   twin     <cue>_white for 睚眥．白刃 (ready, cuts, the issen ring, ult cast / boom / bed / sheathe): -4 st, colder, an
//            echo (§1.12 雙生版). Not played yet (the twin is reserved).
//
// Mastering: every file within 1 LU of its target at <= -1 dBTP (decoded). Pre-shaping soft-clips at most ~6 dB of
// drive (logged "natural -> shaped PLR"); ringing cues are mastered lower and lifted with the manifest vol instead of
// being crushed. Logged references: the 三段斬 combo, the 居合 stance -> 一閃, and the ultimate as the player hears them.
//
//   node --max-old-space-size=2048 tools/audio/build.mjs --only premium_yazi
//   dev subset (never into the game folder: a subset run removes the other files of the category it writes):
//   CF_AUDIO_OUT=tools/audio/out/yz-dev YZ_ONLY=cuts,hits node --max-old-space-size=2048 \
//     tools/audio/run-producer.mjs tools/audio/producers/premium_yazi.mjs --spectrograms all
import { makeKit } from './weapons.mjs';

const SR = 48000;
const NYQ = 17000;                 // partials above this are dropped (Vorbis q0.5 cuts there anyway; no aliasing)
const midi = (m) => 440 * 2 ** ((m - 69) / 12);
// G 羽 (the B♭ 宮 pentatonic): N.G4, N.Bb4 ... (pitch classes G B♭ C D F), SCALE ascending
const PC = { C: 0, D: 2, F: 5, G: 7, Bb: 10 };
const N = {};
for (let o = 1; o <= 8; o++) for (const [k, pc] of Object.entries(PC)) N[`${k}${o}`] = midi(12 * (o + 1) + pc);
const SCALE = Object.values(N).sort((a, b) => a - b);
/** n consecutive scale notes from f (inclusive), every `step`-th */
const sc = (f, n, step = 1) => { const i = SCALE.findIndex((x) => x >= f * 0.999); return Array.from({ length: n }, (_, k) => SCALE[Math.min(SCALE.length - 1, i + k * step)]); };
const YA = N.G5, YA_LO = N.G4;     // the sabre: the edge's ring and the long body's
const SAYA = N.D5;                 // the scabbard's bronze mouth / the guard
// band-share targets (dB, analysis bands) every variant of a family is matched towards: one colour across sources
const BAL = {
  swing: { low: -12, lowMid: -4, mid: -5, high: -8, air: -13.5 },   // a long, heavy blade: more body than the twin sabres
  hit: { low: -8, lowMid: -8, mid: -5, high: -5.5, air: -13 },
  cut: { low: -10, lowMid: -8.5, mid: -5, high: -5.5, air: -12.5 },
};

// ---------------------------------------------------------------------------------------------- sources
const X = {
  // air / blades
  katana: 'fs:263595', swordSw: 'fs:471097', swoosh: 'fs:507466', swingA: 'fs:268227', whoom: 'fs:60024', slash: 'fs:35213', wind: 'fs:146932',
  // the scabbard's leather / lacquer, cloth
  holster: 'fs:388819', unholster: 'fs:377145', unholster2: 'fs:688765', cloth: 'fs:494797', clothHeavy: 'fs:163164',
  // metal / wood (Kenney)
  metalHit: 'fs:406562', clangDeep: 'fs:201094',
  metalL: (k) => `kenney_impact/Audio/impactMetal_light_00${k % 5}`, metalM: (k) => `kenney_impact/Audio/impactMetal_medium_00${k % 5}`,
  metalH: (k) => `kenney_impact/Audio/impactMetal_heavy_00${k % 5}`, woodL: (k) => `kenney_impact/Audio/impactWood_light_00${k % 5}`,
  woodM: (k) => `kenney_impact/Audio/impactWood_medium_00${k % 5}`, punch: (k) => `kenney_impact/Audio/impactPunch_medium_00${k % 5}`,
  punchH: (k) => `kenney_impact/Audio/impactPunch_heavy_00${k % 5}`,
  // flesh / bone
  gash: 'fs:420674', slice: 'fs:504615', chop: 'fs:269483', meaty: 'fs:779805', wet: 'fs:626405', gross: 'fs:641040', gore: 'fs:641046', splat: 'fs:414296',
  wetSplat1: 'fs:495118', wetSplat2: 'fs:495117', fracture: 'fs:488659', boneSnap: 'fs:578874', neck: 'fs:134025', crunch: 'fs:355052',
  // stone / debris / blasts
  concHit: 'fs:321477', concSmash: 'fs:522099', stoneDebris: 'fs:569510', debrisBig: 'fs:703247', dirt: 'fs:386799', deepBoom: 'fs:258195', blast: 'fs:523089',
  // porcelain / glass (怒目 crisis: 瓷器碎裂)
  plate: 'fs:565642', glassBreak: 'fs:221528', shard: 'fs:203381',
  // the beast: dog / beast snarls (the jackal), a tiger (the dragon's chest), a werewolf's breath (the snort), breathing
  snarlDog: 'fs:190595', snarlLow: 'fs:42201', snarlDog2: 'fs:341090', tiger: 'fs:263115', sniff: 'fs:261464', breath: 'fs:163383',
  // fire / paper ash
  combust: 'fs:412558', fireWhoosh: 'fs:260554', fireAsh: 'fs:508110',
  // the theatre band (北管): a Chinese opera cymbal and gong, VSCO 2 gongs / cymbals / drums / timpani, cello
  opera: 'fs:452400', gongCh: 'fs:127265', gongHard: 'fs:375531', crash: 'fs:375497', suspHard: 'fs:375506', tom: 'fs:375378',
  bdFff: 'fs:375260', bdMuted: 'fs:375265', timpAs2: 'fs:373919', timpRoll: 'fs:373944', celloG2: 'fs:372839', celloTremD3: 'fs:372845',
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
  // the sources each cue used (credits): ld() and the cached loaders note their ids, the cat.add wrapper takes them
  const used = new Set();
  const note = (id) => { used.add(id); };
  /**
   * A source slice: one channel (ch) or the mono fold (or stereo kept), pitched, filtered, faded, peak -1 dBFS. The
   * default fade-out is 12 % of the slice (a short cut of a longer recording must not stop dead).
   */
  async function ld(id, s, e, { ch, stereo = false, hp = 30, lp, semis = 0, fadeIn = 0.002, fadeOut, eq = [] } = {}) {
    note(id);
    let b = await ctx.load(id, { start: s, end: e });
    if (ch != null) b = new Buf([b.data[Math.min(ch, b.channels - 1)].slice()], b.sampleRate);
    else if (!stereo) b = mono(b);
    if (semis) b = lib.varispeedSemis(b, semis);
    b = lib.eq(b, [{ type: 'hp', f: hp, order: 2 }, ...(lp ? [{ type: 'lp', f: lp, order: 2 }] : []), ...eq]);
    return norm(lib.fade(b, fadeIn, Math.min(fadeOut ?? Math.max(0.012, b.duration * 0.12), b.duration / 3), 'sine'));
  }
  /** A source loaded once and reused (the id still credited to every cue that uses it). */
  const memo = new Map();
  async function once(key, id, fn) {
    note(id);
    if (!memo.has(key)) memo.set(key, await fn());
    return memo.get(key);
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
    return lib.mix([{ buf: ch === 1 ? mono(b) : b }, { buf: w, gainLin: wet }], { channels: ch });
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

  // ---- synthesis: the sabre
  /** Additive partials [[ratio, amp, t60]...], partials over NYQ dropped. */
  const parts = (dur, base, list, seed) => lib.partials(dur, { base, list: list.filter(([r]) => base * r < NYQ), seed });
  /**
   * 刀鳴: the long sabre's ring — free-free bar modes (1 : 2.756 : 5.404 : 8.933 : 13.34), each a close doublet (the
   * blade's two bending planes), so the ring shimmers; the high modes die first. A long, heavy blade: darker than a
   * thin one (`bright` < 1 by default) and a slower beat.
   */
  function blade(f0, dur, { seed = 'bl', t60 = 1.0, bright = 0.85, beat = 0.0028, attack = 0 } = {}) {
    const modes = [1, 2.756, 5.404, 8.933, 13.34], amp = [1, 0.55, 0.3, 0.15, 0.07], list = [];
    modes.forEach((r, i) => { const a = amp[i] * (i ? bright : 1), t = t60 / (1 + i * 0.95); list.push([r, a, t], [r * (1 + beat * (i + 1)), a * 0.6, t * 0.85]); });
    let b = parts(dur, f0, list, seed);
    if (attack > 0) b = lib.applyEnv(b, lib.envCurve(dur, [[0, 0], [attack, 1], [dur, 1]]));
    return b;
  }
  /**
   * The cut's edge in the air (the white-hot trail): a steel sine set gliding with the blade's doppler — up `up` st to
   * the pass (`peak`), falling `down` st away.
   */
  function edge(dur, peak, f0, { up = 2, down = -7, sharp = 2, fall = 7, beat = 0.005 } = {}) {
    const f = (t) => f0 * 2 ** ((t < peak ? -1.5 + (up + 1.5) * (t / peak) : up + (down - up) * Math.min(1, (t - peak) / Math.max(1e-3, dur - peak))) / 12);
    const e = (t) => (t < peak ? (t / peak) ** sharp : Math.exp(-(t - peak) * fall / Math.max(1e-3, dur - peak)));
    const layers = [];
    for (const [r, a] of [[1, 1], [0.5, 0.35], [2.756, 0.32], [5.404, 0.12], [2, 0.14]]) {
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
  /** A blade spinning: a whoosh every half turn (the blade, then the lighter ring-pommel side), `rate(t)` turns / s. */
  function whirr(D, rate, { seed = 'wr', lo = 300, hi = 1200, ring = -7 } = {}) {
    const out = [];
    let t = 0, i = 0;
    while (t < D - 1e-6) {
      const f = rate(t), per = 1 / f, r = rng(`${seed}${i}`);
      const d1 = Math.min(0.24, per * 0.9), d2 = Math.min(0.18, per * 0.7);
      out.push({ buf: swoosh(d1, Math.min(per * 0.35, d1 * 0.45), [lo, hi * r.range(0.9, 1.1), lo * 0.9], { q: 1.2, seed: `${seed}h${i}`, rise: 2, fall: 5 }), at: t, gain: r.range(-1, 0) });
      out.push({ buf: swoosh(d2, Math.min(per * 0.3, d2 * 0.45), [lo * 1.4, hi * 1.6, lo * 1.3], { q: 1.4, color: 'white', seed: `${seed}k${i}`, rise: 2, fall: 6 }), at: t + per / 2, gain: ring });
      t += per; i++;
    }
    return lib.mix(out, { length: D + 0.25 });
  }
  /**
   * 鞘走り: the blade running in its lacquered wood scabbard — the blade's back rasping on the bronze mouth (noise rung
   * through the blade's modes, the bands gliding as the contact slides), the wood's dry friction fluttering with the
   * grain, a little grit; it swells to the exit (out: then the blade rings free) or runs home (in).
   */
  function saya(dur, f, { dir = 'out', seed = 'sy', ring = -5, t60 = 0.9, glide = 0.07, wood = -5, grit = -14, bright = 0.85 } = {}) {
    const modes = [2.756, 5.404, 8.933].map((r) => f * r).filter((x) => x < NYQ * 0.85);
    const nz = lib.noise(dur, { color: 'white', seed });
    const g = dir === 'out' ? glide : -glide;
    const bands = modes.map((m, i) => ({ buf: norm(lib.sweep(nz, 'bp', (t) => m * (1 + g * t / dur), { q: 14 })), gain: -i * 2.5 }));
    const grain = (t) => 0.55 + 0.45 * Math.abs(Math.sin(2 * Math.PI * 47 * t) * Math.sin(2 * Math.PI * 9 * t + 1));
    const woodN = lib.automate(lib.eq(lib.noise(dur, { color: 'pink', seed: seed + 'w' }), [{ type: 'bp', f: 850, q: 0.7 }, { type: 'hp', f: 250, order: 2 }]), grain);
    const hiss = lib.eq(lib.noise(dur, { color: 'white', seed: seed + 'h' }), [{ type: 'hp', f: 4000, order: 2 }]);
    const gr = lib.crackle(dur, { density: 150, decay: 0.0014, hp: 2500, seed: seed + 'g' });
    const shp = dir === 'out'
      ? (t) => (0.18 + 0.82 * smooth(t / (dur * 0.88))) * (t > dur * 0.9 ? Math.max(0, (dur - t) / (dur * 0.1)) : 1)
      : (t) => (0.35 + 0.65 * smooth(t / (dur * 0.5))) * (t > dur * 0.94 ? Math.max(0, (dur - t) / (dur * 0.06)) : 1);
    const fr = norm(lib.automate(lib.mix([...bands, { buf: norm(woodN), gain: wood }, { buf: norm(hiss), gain: -9 }, { buf: norm(gr), gain: grit }]), shp));
    if (dir === 'in') return fr;
    const rg = blade(f, Math.max(0.6, t60 * 1.5), { t60, bright, seed: seed + 'r' });
    return lib.mix([{ buf: fr }, { buf: norm(rg), at: dur * 0.9, gain: ring }]);
  }
  /**
   * 鯉口 / 鍔: the guard against the scabbard's bronze mouth — a tight double click (the press, then the habaki leaving
   * or meeting its seat `dbl` s later), a short bronze ping on D, a woody tock of the hollow scabbard.
   */
  function click(seed, { f = SAYA, dbl = 0.02, ring = -12, tock = -8, bright = 1, first = -3 } = {}) {
    const c1 = lib.noiseBurst({ dur: 0.01, attack: 0.0001, decay: 0.0011, hp: 2200, lp: 15000, seed: seed + 'a' });
    const c2 = lib.noiseBurst({ dur: 0.012, attack: 0.0001, decay: 0.0016, bp: 4200, q: 1.1, seed: seed + 'b' });
    const ping = parts(0.7, f * 2, [[1, 1, 0.24], [1.006, 0.6, 0.2], [2.32, 0.5 * bright, 0.12], [3.9, 0.3 * bright, 0.07], [5.6, 0.15 * bright, 0.04]], seed + 'p');
    const tk = parts(0.14, 380, [[1, 1, 0.04], [2.1, 0.5, 0.022], [3.4, 0.3, 0.013], [0.55, 0.4, 0.05]], seed + 't');
    return norm(lib.mix([{ buf: c1, gain: first }, { buf: c2, at: dbl }, { buf: norm(ping), at: dbl, gain: ring }, { buf: norm(tk), at: dbl * 0.5, gain: tock }]));
  }

  // ---- synthesis: the beast and its crimson energy
  /** 鼻息: the beast's nostrils blowing — two nasal formants of noise, the nostrils fluttering, a pressure thump. */
  function snort(seed, { dur = 0.42, f1 = 470, f2 = 1350, flutter = 33, decay = 0.24, attack = 0.012 } = {}) {
    const nz = lib.noise(dur, { color: 'pink', seed });
    const v = lib.mix([{ buf: norm(lib.eq(nz, [{ type: 'bp', f: f1, q: 2.2 }])) }, { buf: norm(lib.eq(nz, [{ type: 'bp', f: f2, q: 3 }])), gain: -3 },
      { buf: norm(lib.eq(nz, [{ type: 'hp', f: 2500, order: 2 }])), gain: -11 }]);
    const fl = (t) => 0.62 + 0.38 * Math.sin(2 * Math.PI * flutter * t + 2 * Math.sin(2 * Math.PI * 7 * t));
    const e = (t) => Math.min(1, t / attack) * Math.exp(-t * 6.9 / decay) * fl(t);
    const th = lib.thump({ f0: 110, f1: 60, sweep: 0.03, decay: 0.1, click: 0, drive: 1.2, seed: seed + 'p' });
    return norm(lib.mix([{ buf: lib.automate(norm(v), e) }, { buf: th, gain: -11 }]));
  }
  /** The beast's snarls, trimmed to their attacks (dog snarls = the jackal, the beast's snarling, a low snarl). */
  async function snarlSrc() {
    return once('snarls', X.snarlDog, async () => {
      const out = [];
      // (the snarl.wav takes and the dog's growls / its snarling burst; the self-made dog snarl only before it clips)
      for (const [id, s, e] of [[X.snarlLow, 0.06, 0.95], [X.snarlLow, 1.64, 2.35], [X.snarlLow, 2.6, 3.5], [X.snarlDog2, 0.03, 1.5], [X.snarlDog2, 2.69, 3.9], [X.snarlDog2, 3.97, 4.7],
        [X.snarlDog, 2.05, 2.5], [X.snarlLow, 0.9, 1.55]]) {
        out.push(strike(await ld(id, s, e, { hp: 75, lp: 9000, fadeOut: 0.08 }), -14));
      }
      return out;
    }).then((v) => { for (const id of [X.snarlLow, X.snarlDog2]) note(id); return v; });
  }
  async function tigerSrc() { return once('tiger', X.tiger, async () => strike(await ld(X.tiger, 0, 2.6, { hp: 40, fadeOut: 0.3 }), -16)); }
  /**
   * 睚眥 (a jackal's body, a dragon's head): a snarl taken down a few semitones through a bigger throat (two formants of
   * a bronze-lined throat, a tube's rasp), the tiger an octave under it for the dragon's chest.
   */
  async function beast(k, len, { semis = -4, chest = -9, seed = 'bs', rasp = 0.4, throat = 420 } = {}) {
    const S = await snarlSrc(), T = await tigerSrc(), r = rng(`${seed}${k}`);
    let s = lib.varispeedSemis(S[k % S.length], semis + r.range(-0.6, 0.6));
    s = lib.eq(cut(s, len, 0.35), [{ type: 'peak', f: throat, gain: 4, q: 1.4 }, { type: 'peak', f: throat * 2.6, gain: 2.5, q: 1.8 }, { type: 'peak', f: 2600, gain: 3, q: 1.2 }, { type: 'lowshelf', f: 160, gain: 1 }, { type: 'lp', f: 8000, order: 2 }]);
    s = lib.saturate(norm(s), { drive: 2.5, type: 'tube', mix: rasp });
    const ch = lib.eq(cut(lib.varispeedSemis(lib.slice(T, r.range(0, 0.4), T.duration), -9 + r.range(-0.5, 0.5)), len, 0.4), [{ type: 'lp', f: 900, order: 2 }, { type: 'hp', f: 45, order: 2 }]);
    return norm(lib.mix([{ buf: norm(s) }, { buf: norm(ch), gain: chest }]));
  }
  /**
   * 赤電: the crimson soul-energy — a fine electric crackle over a flickering sizzle band and the ragged buzz of the arc
   * (a hard-clipped saw formed round 1.8 kHz), all flickering together.
   */
  function sizzle(dur, { seed = 'sz', density = 220, hp = 2500, buzz = -15, f = 112, hiss = -11 } = {}) {
    const cr = lib.crackle(dur, { density, decay: 0.0012, hp, minAmp: 0.15, seed });
    const hs = lib.eq(lib.noise(dur, { color: 'white', seed: seed + 'h' }), [{ type: 'bp', f: 6200, q: 0.7 }]);
    const flick = (t) => 0.4 + 0.6 * Math.abs(Math.sin(2 * Math.PI * 9 * t + 3 * Math.sin(2 * Math.PI * 2.3 * t)));
    const bz = lib.eq(lib.saturate(lib.tone(dur, { type: 'saw', freq: (t) => f * (1 + 0.04 * Math.sin(2 * Math.PI * 5 * t)) }), { drive: 4, type: 'hard', mix: 1 }), [{ type: 'bp', f: 1800, q: 0.6 }]);
    return norm(lib.fadeOut(lib.mix([{ buf: norm(cr) }, { buf: lib.automate(norm(hs), flick), gain: hiss }, { buf: lib.automate(norm(bz), flick), gain: buzz }]), Math.min(0.25, dur * 0.3), 'exp'));
  }
  /** Blood flying as mist: a short wet spray of noise (the cut bleeding red). */
  const spray = (dur, seed, { f = 2600, t60 = 0.16 } = {}) => lib.automate(lib.eq(lib.noise(dur, { color: 'white', seed }), [{ type: 'bp', f, q: 0.8 }]), (t) => Math.min(1, t / 0.004) * Math.exp(-t * 6.9 / t60) * (0.7 + 0.3 * Math.sin(2 * Math.PI * 61 * t)));

  // ---- synthesis: the theatre band (北管 / 南管), all original
  /** 碰鈴: two small brass cup bells struck rim to rim — a pure high 「叮」 with its fast-dying set, the pair a hair apart (a shimmer). */
  function ling(f, dur, { seed = 'lg', t60 = 1.6, bright = 1, tick = -14 } = {}) {
    const R = [[1, 1, 1], [2.32, 0.28, 0.42], [3.86, 0.16, 0.25], [5.6, 0.07, 0.14]], list = [];
    for (const [r, a, k] of R) { const amp = r === 1 ? a : a * bright; list.push([r, amp, t60 * k], [r * 1.0035, amp * 0.45, t60 * k * 0.9]); }
    const t = lib.noiseBurst({ dur: 0.01, attack: 0.0002, decay: 0.0018, bp: Math.min(9000, f * 1.8), q: 1.2, seed: seed + 't' });
    return lib.mix([{ buf: parts(dur, f, list, seed) }, { buf: t, gain: tick }]);
  }
  /**
   * 戲曲鑼: a flat opera gong struck with a wooden board. 小鑼 (small): the main mode bends UP ~`glide` st right after the
   * strike (「鏘↗」); 大鑼 (big, glide < 0): it bends DOWN (「匡↘」) with a noisy shimmer. Inharmonic modes as slow-beating
   * doublets (the higher modes bend less and die first), the board's knock, a band of noise rung by the plate.
   */
  function luo(f, dur, { glide = 3, gt = 0.08, seed = 'lu', t60 = 1.2, bright = 1, knock = -14, wash = -16, big = false } = {}) {
    const R = big
      ? [[1, 1, 1], [1.47, 0.55, 0.75], [1.98, 0.5, 0.6], [2.44, 0.36, 0.45], [2.96, 0.28, 0.36], [3.6, 0.2, 0.28], [4.3, 0.13, 0.2], [5.15, 0.08, 0.14]]
      : [[1, 1, 1], [1.56, 0.3, 0.5], [2.21, 0.24, 0.36], [2.9, 0.15, 0.26], [3.75, 0.1, 0.18], [4.8, 0.06, 0.12]];
    const g = (t) => 1 - Math.exp(-t / gt);
    const layers = [];
    R.forEach(([r, a, k], i) => {
      if (f * r * 1.1 > NYQ) return;
      const gl = glide * (i === 0 ? 1 : 0.55 / (1 + i * 0.3));
      const amp = i === 0 ? a : a * bright, T = t60 * k;
      for (const [dt, w] of [[1, 1], [1.0042 + i * 0.0007, 0.55]]) {
        const tn = lib.tone(dur, { freq: (t) => f * r * dt * 2 ** (gl * g(t) / 12) });
        layers.push({ buf: lib.automate(tn, (t) => Math.min(1, t / 0.0012) * Math.exp(-t * 6.9078 / T)), gainLin: amp * w });
      }
    });
    const ws = lib.automate(lib.eq(lib.noise(dur, { color: big ? 'pink' : 'white', seed: seed + 'n' }), [{ type: 'bp', f: f * (big ? 3.2 : 2.4), q: 0.7 }]), (t) => Math.min(1, t / 0.003) * Math.exp(-t * 6.9 / (t60 * (big ? 0.45 : 0.25))));
    const kn = lib.mix([{ buf: lib.noiseBurst({ dur: 0.03, attack: 0.0002, decay: 0.005, bp: big ? 1100 : 1800, q: 0.9, seed: seed + 'k' }) }, { buf: parts(0.06, big ? 160 : 320, [[1, 1, 0.03], [2.3, 0.4, 0.02]], seed + 'kt'), gain: -6 }]);
    return norm(lib.mix([{ buf: norm(lib.mix(layers)) }, { buf: norm(ws), gain: wash }, { buf: norm(kn), gain: knock }]));
  }
  /** 拍板 / 梆子: hardwood slabs clapped — a needle-sharp click, wooden modes ringing for a few tens of ms, a hollow body. */
  function ban(seed, { f = 1250, t60 = 0.07, click: ck = -4, body = -8 } = {}) {
    const c = lib.noiseBurst({ dur: 0.012, attack: 0.0001, decay: 0.0012, hp: 1500, lp: 14000, seed: seed + 'c' });
    const m = parts(0.25, f, [[1, 1, t60], [1.63, 0.7, t60 * 0.8], [2.71, 0.45, t60 * 0.55], [3.9, 0.25, t60 * 0.4]], seed);
    const b = parts(0.2, f * 0.36, [[1, 1, t60 * 1.3], [2.2, 0.3, t60 * 0.6]], seed + 'b');
    return norm(lib.mix([{ buf: c, gain: ck }, { buf: norm(m) }, { buf: norm(b), gain: body }]));
  }
  /**
   * 嗩吶 (an original synthetic double reed): a band-limited saw + narrow pulse on one continuous pitch line — a tongued
   * scoop into each note from below, legato slides, the vibrato opening a beat after the attack, a slow wander, the 哭腔
   * fall off a note's end — through the bell's formants, driven hard, with the reed's breath noise.
   * notes: [{ t, d, f, f1 (glide to), slide (s, from the previous note), scoop (cents), fall (st), fallT, vib, depth, amp }]
   */
  function suona(notes, { seed = 'sn', vib = 6.3, depth = 28, breath = -24, drive = 3.5, len } = {}) {
    const end = len ?? Math.max(...notes.map((n) => n.t + n.d + (n.fall ? (n.fallT ?? 0.25) : 0) + 0.06));
    const idx = (t) => { let k = 0; for (let i = 0; i < notes.length; i++) if (notes[i].t <= t) k = i; return k; };
    const wander = norm(lib.eq(lib.noise(end + 0.1, { color: 'brown', seed: seed + 'd' }), [{ type: 'lp', f: 3, order: 2 }]), 0).data[0];
    const legatoIn = (k) => k > 0 && notes[k - 1].t + notes[k - 1].d >= notes[k].t - 1e-3;
    const freq = (t) => {
      const k = idx(t), n = notes[k], u = Math.max(0, t - n.t);
      let base = n.f1 ? n.f * (n.f1 / n.f) ** smooth(u / n.d) : n.f;
      if (n.slide && k > 0) base = notes[k - 1].f * (base / notes[k - 1].f) ** smooth(u / n.slide);
      let c = n.slide ? 0 : -(n.scoop ?? 70) * Math.exp(-u / 0.014);
      if (n.fall && u > n.d) c -= n.fall * 100 * smooth((u - n.d) / (n.fallT ?? 0.25));
      c += (n.depth ?? depth) * smooth((u - (n.vibAt ?? 0.09)) / 0.12) * Math.sin(2 * Math.PI * (n.vib ?? vib) * t);
      c += 6 * wander[Math.min(wander.length - 1, Math.round(t * SR))];
      return base * 2 ** (c / 1200);
    };
    const amp = (t) => {
      const k = idx(t), n = notes[k], u = t - n.t, nx = notes[k + 1];
      if (u < 0) return 0;
      const a0 = legatoIn(k) ? 1 - 0.3 * Math.exp(-u / 0.012) : Math.min(1, u / 0.008);
      const bite = 1 + 0.45 * Math.exp(-u / 0.05);
      const legOut = nx && nx.t <= n.t + n.d + 1e-3;
      let rel = 1;
      if (!legOut) {
        const e = n.t + n.d + (n.fall ? (n.fallT ?? 0.25) : 0);
        if (n.fall && u > n.d) rel *= 1 - 0.75 * smooth((u - n.d) / (n.fallT ?? 0.25));
        if (t > e) rel *= Math.max(0, 1 - (t - e) / 0.045);
      }
      return (n.amp ?? 1) * a0 * bite * rel;
    };
    const saw = lib.tone(end, { type: 'saw', freq });
    const pul = lib.tone(end, { type: 'pulse', freq, pulseWidth: 0.3 });
    let x = lib.automate(lib.mix([{ buf: saw }, { buf: pul, gain: -5 }]), amp);
    x = lib.eq(x, [{ type: 'hp', f: 380, order: 2 }, { type: 'lowshelf', f: 600, gain: -4 }, { type: 'peak', f: 1250, gain: 8, q: 1.3 }, { type: 'peak', f: 2700, gain: 6, q: 1.6 },
      { type: 'peak', f: 3900, gain: 4, q: 2.2 }, { type: 'highshelf', f: 7500, gain: -4 }]);
    x = lib.saturate(norm(x, -3), { drive, type: 'tanh', mix: 0.6 });
    const br = lib.automate(lib.eq(lib.noise(end, { color: 'white', seed: seed + 'b' }), [{ type: 'bp', f: 2600, q: 0.9 }]), amp);
    return norm(lib.eq(lib.mix([{ buf: norm(x) }, { buf: norm(br), gain: breath }]), [{ type: 'lp', f: 12000, order: 2 }]));
  }
  /** 洞簫: a breathy end-blown bamboo flute — a soft near-sine, a chiff of air at the attack, breath round the note, a late slow vibrato. */
  function xiao(f, dur, { seed = 'xo', vib = 4.6, depth = 14, att = 0.12, rel = 0.35, breath = -13 } = {}) {
    const freq = (t) => f * 2 ** ((depth * smooth((t - 0.25) / 0.3) * Math.sin(2 * Math.PI * vib * t)) / 1200);
    const e = (t) => smooth(t / att) * (t > dur - rel ? Math.max(0, (dur - t) / rel) : 1);
    const tn = lib.mix([{ buf: lib.tone(dur, { freq }) }, { buf: lib.tone(dur, { freq: (t) => 2 * freq(t) }), gain: -15 }, { buf: lib.tone(dur, { freq: (t) => 3 * freq(t) }), gain: -24 }]);
    const air = lib.eq(lib.noise(dur, { color: 'pink', seed }), [{ type: 'bp', f: f * 1.5, q: 1.1 }]);
    const chiff = lib.noiseBurst({ dur: 0.09, attack: 0.004, decay: 0.03, bp: Math.min(9000, f * 3), q: 1.5, seed: seed + 'c' });
    return norm(lib.mix([{ buf: lib.automate(tn, e) }, { buf: lib.automate(norm(air), e), gain: breath }, { buf: chiff, gain: -15 }]));
  }
  /**
   * A plucked string (Karplus-Strong, fractional delay; `pick` = the plucking point: a comb on the excitation, near the
   * bridge = thin and bright), a small soundboard.
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
  /** 琵琶: a pear-lute string plucked near the bridge (bright, twangy), the nail's tick, a hollow body. */
  function pipa(f, dur, { seed = 'pp', t60 = 1.4 } = {}) {
    const s = pluck(f, dur, { t60, bright: 0.85, pick: 0.09, seed, lp: 9500 });
    const nail = lib.noiseBurst({ dur: 0.008, decay: 0.0012, bp: 4500, q: 1, seed: seed + 'n' });
    return norm(lib.eq(lib.mix([{ buf: s }, { buf: nail, gain: -13 }]), [{ type: 'peak', f: 430, gain: 2, q: 1.2 }, { type: 'peak', f: 3300, gain: 2, q: 1 }]));
  }
  /** 輪指: the pipa's tremolo — the fingers rolled over one string, `rate` plucks / s for `d` s, fading `fall` dB. */
  function lun(f, d, { rate = 14, seed = 'ln', fall = 7 } = {}) {
    const out = [], r = rng(seed), n = Math.max(1, Math.round(d * rate));
    for (let i = 0; i < n; i++) out.push({ buf: pipa(f, 0.5, { seed: `${seed}${i}`, t60: 0.7 }), at: i / rate + r.range(-0.004, 0.004), gain: -(i / n) * fall + r.range(-1.5, 0) - (i ? 2 : 0) });
    return lib.mix(out);
  }
  /** 皮影翻板「啪」: a panel of oiled hide flipped up taut on its rod — a flat crack of air, the hide's papery flutter, the bamboo's knock. */
  function hide(seed, { f = 1400, flutter = -10, rod = -9 } = {}) {
    const slap = lib.noiseBurst({ dur: 0.05, attack: 0.0003, decay: 0.009, bp: f, q: 0.8, seed: seed + 's' });
    const low = lib.noiseBurst({ dur: 0.06, attack: 0.0005, decay: 0.014, lp: 600, seed: seed + 'l' });
    const fl = lib.automate(lib.eq(lib.noise(0.2, { color: 'pink', seed: seed + 'f' }), [{ type: 'bp', f: 2600, q: 1.2 }]), (t) => Math.min(1, t / 0.004) * Math.exp(-t * 26) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 70 * t)));
    const knock = parts(0.12, 640 * rng(seed).range(0.9, 1.15), [[1, 1, 0.04], [2.6, 0.4, 0.025], [4.4, 0.2, 0.015]], seed + 'k');
    return norm(lib.mix([{ buf: slap }, { buf: low, gain: -6 }, { buf: norm(fl), gain: flutter, at: 0.002 }, { buf: norm(knock), gain: rod, at: 0.004 }]));
  }
  /** 報: a great seal pressed — the blow (a low thump), the wood block's knock, the paper's crunch. */
  function stamp(seed, { size = 1, crunch = -10 } = {}) {
    const th = lib.thump({ f0: 140 / size, f1: 52 / Math.sqrt(size), sweep: 0.035, decay: 0.22 * size, click: 0.3, drive: 2, seed: seed + 't' });
    const knock = parts(0.2, 300 / size, [[1, 1, 0.05], [2.2, 0.5, 0.03], [3.7, 0.25, 0.02]], seed + 'k');
    const paper = lib.automate(lib.crackle(0.12, { density: 900, decay: 0.0008, hp: 1800, seed: seed + 'p' }), (t) => Math.exp(-t * 40));
    return norm(lib.mix([{ buf: th }, { buf: norm(knock), gain: -6 }, { buf: norm(paper), gain: crunch }]));
  }
  /** Low impact: a pitched-down thump with harmonics so laptop speakers carry it. */
  const boom = (seed, { f0 = 75, f1 = 42, sweep = 0.06, decay = 0.5, drive = 2.5, amount = -3.5 } = {}) => lib.psychoBass(lib.thump({ f0, f1, sweep, decay, click: 0.1, drive, seed }), { freq: 110, amount });
  /** Brown-noise rumble under `lp` Hz, rising in `a` s and dying with t60. */
  const rumble = (dur, seed, { lp = 200, a = 0.02, t60 = 1.2 } = {}) => lib.automate(lib.eq(lib.noise(dur, { color: 'brown', seed }), [{ type: 'lp', f: lp, order: 2 }, { type: 'hp', f: 30, order: 2 }]), (t) => Math.min(1, t / a) * Math.exp(-t * 6.9 / t60));
  /** §1.12 「貴氣瞬態」: a 30 ms 6-10 kHz glint (a band of noise + a 7 kHz ping), mixed ~12 dB under the hit. */
  const lux = (seed) => lib.mix([{ buf: lib.noiseBurst({ dur: 0.03, attack: 0.0004, decay: 0.006, bp: 8000, q: 1.1, seed }) }, { buf: parts(0.05, 7040, [[1, 1, 0.03], [1.41, 0.4, 0.02]], seed + 'p'), gain: -6 }]);
  /** Dust thrown up: a band of pink noise opening and settling. */
  const dust = (dur, seed, { f = 1100, a = 0.03, t60 = 0.6 } = {}) => lib.automate(lib.eq(lib.noise(dur, { color: 'pink', seed }), [{ type: 'bp', f, q: 0.6 }]), (t) => Math.min(1, t / a) * Math.exp(-t * 6.9 / t60));

  // ---- recordings used across cues
  /** 鈸: the opera cymbal (a Chinese opera's crash, recorded in a park) over a VSCO crash; open or choked (`len`). */
  async function bo({ semis = 0, len = 1.2, t60 = 0.9, seed = 'bo', vsco = -6 } = {}) {
    const op = await once('opera', X.opera, async () => strike(await ld(X.opera, 0, 1.09, { stereo: true, hp: 200, fadeOut: 0.15 })));
    const cr = await once('crash', X.crash, async () => strike(await ld(X.crash, 0, 3.0, { stereo: true, hp: 300, fadeOut: 0.4 })));
    const r = rng(seed);
    const v = lib.mix([{ buf: lib.varispeedSemis(op, semis + r.range(-0.4, 0.4)) }, { buf: lib.varispeedSemis(cr, semis + 1 + r.range(-0.5, 0.5)), gain: vsco }], { channels: 2 });
    return norm(lib.decay(cut(v, len, 0.3), t60, 0.03));
  }
  /** The opera gong (a big one, recorded) under the synthetic 大鑼, retuned by `semis`. */
  async function gongRec(semis = 0, len = 3.0, t60 = 2.0) {
    const g = await once('gongCh', X.gongCh, async () => strike(await ld(X.gongCh, 0, 5.0, { stereo: true, hp: 45, fadeOut: 0.6 })));
    return norm(lib.decay(cut(lib.varispeedSemis(g, semis), len, 0.3), t60, 0.05));
  }
  /** 堂鼓: a tight drum (a VSCO snare with its snares off) with a pitched body under it. */
  async function gu(seed, { semis = 0, ring = 0.22, body = -5 } = {}) {
    const s = await once('tom', X.tom, async () => strike(await ld(X.tom, 0.0, 0.7, { stereo: false, hp: 60, fadeOut: 0.1 })));
    const th = lib.thump({ f0: 230 * 2 ** (semis / 12), f1: 150 * 2 ** (semis / 12), sweep: 0.02, decay: ring, click: 0.2, drive: 1.5, seed });
    return norm(lib.mix([{ buf: lib.varispeedSemis(s, semis + 2) }, { buf: th, gain: body }]));
  }
  /** Twin (白刃) version: -4 st, colder and brighter (less low-mid warmth, a silver top), a dotted echo (§1.12 雙生版). */
  const twin = (b) => {
    let o = lib.varispeedSemis(b, -4);
    o = lib.eq(o, [{ type: 'hp', f: 70, order: 2 }, { type: 'peak', f: 300, gain: -2, q: 0.8 }, { type: 'highshelf', f: 5000, gain: 2.5 }]);
    return lib.echo(o, { time: 0.21, feedback: 0.34, lp: 4200, hp: 250, mix: 0.38, pingpong: o.channels === 2, length: o.duration + 0.9 });
  };
  return { K, rng, norm, mono, clamp, smooth, used, note, ld, once, strike, peakTime, alignAt, cut, env, verb, shape, shapeLog, atLufs, tight, panMove, wrap, onGrid, seamless, seamCheck,
    parts, blade, edge, swoosh, whirr, saya, click, snort, snarlSrc, beast, sizzle, spray, ling, luo, ban, suona, xiao, pluck, pipa, lun, hide, stamp, boom, rumble, lux, dust, bo, gongRec, gu, twin };
}

// ---------------------------------------------------------------------------------------------- cuts
/** air sources for the passes: the four katana passes, a sword swing, a clean fast swoosh, a swing */
async function airSources(H) {
  return H.once('air', X.katana, async () => {
    const air = [];
    for (const [a, z] of KATANA) air.push(await H.ld(X.katana, a, z, { hp: 220 }));
    air.push(await H.ld(X.swordSw, 1.7, 2.3, { hp: 180 }));
    air.push(await H.ld(X.swoosh, 0.2, 0.72, { hp: 220 }));
    air.push(await H.ld(X.swingA, 0, 1.1, { hp: 200 }));
    return { whoom: await H.ld(X.whoom, 0, 0.557, { hp: 45 }), air };
  }).then((v) => { for (const id of [X.swordSw, X.swoosh, X.swingA, X.whoom]) H.note(id); return v; });
}
/**
 * One sabre pass: P = where the 820 mm blade crosses the middle of the view (the cut lands), D = length. A long,
 * heavy blade: the sword air slowed, a deep body, the edge's whistle and hiss; the white-hot trail (the blade's own
 * G zing gliding with the doppler, a breath of crimson sizzle behind it: the §1.12 theme layer, ~25 %); a push; the
 * luxury tick. dir +1 sweeps left -> right, -1 right -> left (subtle: the cue serves both cuts).
 */
function swingVariant(lib, H, src, k, { P = 0.084, D = 0.56, heavy = 0, dir = 1, pan = 0.22, seed = 'sw', trail = -12 } = {}) {
  const r = H.rng(`${seed}${k}`);
  const air = lib.varispeedSemis(src.air[k % src.air.length], -1.5 - heavy * 2 + r.range(-0.7, 0.7));
  const whoom = lib.varispeedSemis(src.whoom, -2 - heavy * 3 + r.range(-0.8, 0.8));
  const hiss = H.swoosh(D, P + 0.004, [1300, 4200 * r.range(0.92, 1.08), 1900], { q: 1.1, color: 'white', seed: `${seed}h${k}`, rise: 3, fall: 10 });
  const whistle = H.swoosh(D, P + 0.002, [1000, 2000 * r.range(0.94, 1.06), 950], { q: 8, seed: `${seed}w${k}`, rise: 2.5, fall: 12 });
  const body = H.swoosh(D, P, [100, 280 + heavy * 70, 95], { q: 0.9, seed: `${seed}b${k}`, rise: 2.2, fall: 7 });
  const zing = H.edge(D, P + 0.006, YA * r.range(0.997, 1.003), { up: 2, down: -7, fall: 6 });
  const red = lib.automate(H.sizzle(D, { seed: `${seed}z${k}`, density: 160, buzz: -18 }), (t) => H.smooth((t - P + 0.01) / 0.03) * Math.exp(-Math.max(0, t - P) * 11));
  const push = lib.thump({ f0: 120, f1: 60, sweep: 0.03, decay: 0.09 + heavy * 0.05, click: 0, drive: 1.3, seed: `${seed}p${k}` });
  const p = (t) => dir * (pan - 2 * pan * H.smooth((t - P + 0.05) / 0.12));
  const moving = H.panMove(lib.mix([H.alignAt(air, P, 0), { buf: H.norm(hiss), gain: -6 }, { buf: H.norm(whistle), gain: -15 }, { buf: H.norm(zing), gain: trail }, { buf: H.norm(red), gain: trail - 7 }], { length: D }), p);
  const centre = lib.mix([H.alignAt(H.norm(whoom), P, -2 + heavy * 2), { buf: H.norm(body), gain: -7 + heavy * 2 }, { buf: push, at: Math.max(0, P - 0.02), gain: -14 + heavy * 4 },
    { buf: H.lux(`${seed}x${k}`), at: P, gain: -16 }], { length: D });
  let v = lib.mix([{ buf: lib.stereoize(centre, { width: 0.15, hp: 400, seed: `${seed}c${k}` }) }, { buf: moving }], { channels: 2, length: D });
  v = lib.eq(v, [{ type: 'hp', f: 50, order: 2 }, { type: 'peak', f: 160, gain: 2, q: 0.9 }, { type: 'peak', f: 2800, gain: 2, q: 0.8 }, { type: 'highshelf', f: 7000, gain: 0.5 }]);
  v = H.K.balance(v, BAL.swing, 0.8);
  return H.cut(H.verb(v, 'urban', 0.09, 0.8, `${seed}v${k}`), D, 0.35);
}

async function cuts(lib, ctx, cat, H, keep) {
  const src = await airSources(H);
  // 袈裟 / 橫 (the same cue for both: the handler starts it c.hit * 0.4 = 0.056 s in, so the pass peaks 0.084 s in)
  const sw = [];
  for (let k = 0; k < 6; k++) sw.push(H.shape(swingVariant(lib, H, src, k, { dir: k % 2 ? 1 : -1 }), -16));
  await cat.add('yazi_swing', sw, { lufs: -16, spatial: false, channels: 2, voices: 3, pitch: [0.98, 1.02], maxHeadMs: 40 });
  keep.swing = sw;

  await airSources(H);   // (credits: the cached sources again for this cue)
  // 兜割 (cue 0.1 s in, the cleave lands 0.25: peak 0.15 s in): the blade raised overhead (a short reversed draw of air),
  // the beast's 鼻息, the 1.5 m lunge (the body rushing forward), the long blade coming straight down the middle — the
  // air a few st lower, a heavy body, the 3 m crescent (the zing an octave down + a hotter sizzle), a weighty push
  const heavy = [];
  for (let k = 0; k < 4; k++) {
    const P = 0.15, D = 0.9, r = H.rng(`swh${k}`);
    const cut = swingVariant(lib, H, src, k + 2, { P, D, heavy: 1, dir: 0, seed: 'swh', trail: -10 });
    const raise = lib.reverse(H.swoosh(0.12, 0.03, [2400, 1200, 400], { q: 1, color: 'white', seed: `swhr${k}`, fall: 3 }));
    const lunge = H.swoosh(0.4, 0.12, [140, 520 * r.range(0.9, 1.1), 160], { q: 0.8, seed: `swhl${k}`, rise: 1.6, fall: 4 });
    const crescent = H.edge(0.7, 0.012, YA_LO * r.range(0.997, 1.003), { up: 1, down: -9, fall: 5 });
    const hot = lib.automate(H.sizzle(0.6, { seed: `swhz${k}`, density: 260, buzz: -13 }), (t) => H.smooth(t / 0.02) * Math.exp(-t * 6));
    const v = lib.mix([
      { buf: cut },
      { buf: H.norm(raise), gain: -16 },
      { buf: lib.stereoize(H.snort(`swhs${k}`, { dur: 0.3, decay: 0.16 }), { width: 0.2, hp: 600, seed: `swhss${k}` }), at: 0.0, gain: -15 },
      { buf: lib.stereoize(H.norm(lunge), { width: 0.25, hp: 300, seed: `swhls${k}` }), at: 0.02, gain: -9 },
      { buf: lib.stereoize(H.norm(crescent), { width: 0.35, hp: 500, seed: `swhcs${k}` }), at: P - 0.006, gain: -13 },
      { buf: lib.stereoize(H.norm(hot), { width: 0.5, hp: 2000, seed: `swhzs${k}` }), at: P, gain: -20 },
      { buf: H.boom(`swhb${k}`, { f0: 110, f1: 50, sweep: 0.04, decay: 0.2, drive: 1.8 }), at: P - 0.012, gain: -12 },
    ], { channels: 2 });
    heavy.push(H.shape(H.cut(v, D, 0.35), -15));
  }
  await cat.add('yazi_swing_heavy', heavy, { lufs: -15, spatial: false, channels: 2, voices: 2, pitch: [0.98, 1.02], maxHeadMs: 60 });
  keep.heavy = heavy;

  await airSources(H);
  // def.sound contract (a remote "shot" = a cut; the special never sends one, so these are a safety net)
  const close = [sw[0], sw[1], sw[2]].map((b) => H.cut(H.mono(b), 0.45, 0.3));
  await cat.add('yazi_close', close, { lufs: -18, spatial: true, channels: 1, range: [3, 40], voices: 3, pitch: [0.95, 1.05], maxHeadMs: 40 });
  const tail = [sw[0], sw[1]].map((b, k) => lib.fadeIn(H.mono(lib.reverb(lib.slice(b, 0, 0.25), 'alley', { wet: 1, dry: 0, seed: `yzt${k}`, length: 0.7, channels: 1 })), 0.02));
  await cat.add('yazi_tail', tail, { from: 'yazi_swing', target: 'gunTail', vol: 0.25, spatial: false, channels: 1, voices: 2, pitch: [0.95, 1.05], maxHeadMs: 60 });
  const far = [sw[3], sw[4]].map((b) => lib.eq(H.mono(b), [{ type: 'lp', f: 2600, order: 2 }, { type: 'hp', f: 200, order: 2 }]));
  await cat.add('yazi_far', far, { from: 'yazi_swing', target: 'gunFar', vol: 0.4, spatial: true, channels: 1, range: [10, 40], voices: 2, pitch: [0.94, 1.06], maxHeadMs: 60 });
}

// ---------------------------------------------------------------------------------------------- hits
async function hitSources(H) {
  return H.once('hitsrc', X.gash, async () => ({
    cuts: [await H.ld(X.gash, 0.01, 0.37, { hp: 260 }), await H.ld(X.slice, 0.05, 0.62, { hp: 240 }), await H.ld(X.chop, 0.0, 0.5, { hp: 200 })],
    meats: [await H.ld(X.meaty, 0, 0.48, { hp: 80 }), await H.ld(X.wet, 0.07, 0.54, { hp: 80 }), await H.ld(X.gross, 0.0, 0.62, { hp: 80 })],
    bones: [await H.ld(X.fracture, 0, 0.32, { hp: 180 }), await H.ld(X.boneSnap, 0, 0.7, { hp: 180 }), await H.ld(X.crunch, 0, 0.5, { hp: 200 })],
  })).then((v) => { for (const id of [X.slice, X.chop, X.meaty, X.wet, X.gross, X.fracture, X.boneSnap, X.crunch]) H.note(id); return v; });
}

async function hits(lib, ctx, cat, H, keep) {
  const S = await hitSources(H);
  // yazi_hit (2D, once per connecting cut; 0.8 light / 1.0 heavy and the draw's landing): a long edge biting deep —
  // the slice 「嗤」, the chop, the meat, the bone, the mass of the blow, the blade ringing on the contact (G5 over G4),
  // the cut turning blood red (a wet spray + a crimson flash of sizzle), the §1.12 luxury tick on the front
  const hit = [];
  for (let k = 0; k < 6; k++) {
    const r = H.rng(`hit${k}`);
    const v = lib.mix([
      { buf: H.strike(lib.varispeedSemis(S.cuts[k % 3], r.range(-1, 1))) },
      { buf: H.strike(lib.varispeedSemis(S.cuts[(k + 1) % 3], r.range(-2, 0))), at: 0.004, gain: -8 },
      { buf: H.strike(S.meats[k % 3]), at: 0.003, gain: -3 },
      { buf: H.strike(S.bones[k % 3]), at: 0.008, gain: -13 },
      { buf: lib.thump({ f0: 150, f1: 58, sweep: 0.03, decay: 0.12, click: 0.25, drive: 2, seed: `hb${k}` }), gain: -4 },
      { buf: H.K.crack(`hc${k}`, { dur: 0.01, decay: 0.0025, hp: 2500 }), gain: -9 },
      { buf: H.norm(H.blade(YA * r.range(0.998, 1.002), 0.7, { t60: 0.3, seed: `hr${k}` })), at: 0.002, gain: -14 },
      { buf: H.norm(H.blade(YA_LO, 0.6, { t60: 0.22, bright: 0.6, seed: `hl${k}` })), at: 0.002, gain: -17 },
      { buf: H.norm(H.spray(0.3, `hp${k}`)), at: 0.01, gain: -15 },
      { buf: H.norm(lib.automate(H.sizzle(0.25, { seed: `hz${k}`, density: 300, buzz: -14 }), (t) => Math.exp(-t * 16))), at: 0.006, gain: -19 },
      { buf: H.lux(`hx${k}`), gain: -13 },
    ]);
    const e = H.K.balance(lib.eq(v, [{ type: 'hp', f: 50, order: 2 }, { type: 'peak', f: 200, gain: 2, q: 0.9 }, { type: 'peak', f: 3200, gain: 1.5, q: 0.9 }]), BAL.hit, 0.75);
    hit.push(H.shape(H.cut(lib.stereoize(H.verb(e, 'smallRoom', 0.08, 0.4, `hv${k}`, 1), { width: 0.25, hp: 1200, seed: `hst${k}` }), 0.55, 0.45), -16));
  }
  await cat.add('yazi_hit', hit, { lufs: -16, spatial: false, channels: 2, voices: 4, pitch: [0.97, 1.03], priority: 2 });
  keep.hit = hit;

  await hitSources(H);
  // yazi_hit_flesh: one body (up to three a cut, pitched 0.95-1.1 by the handler): the cut, the meat, a bone, a thump
  const flesh = [];
  for (let k = 0; k < 5; k++) {
    const r = H.rng(`hf${k}`);
    const v = lib.mix([{ buf: H.strike(lib.varispeedSemis(S.cuts[k % 3], r.range(-1.5, 0.5))) }, { buf: H.strike(S.meats[(k + 1) % 3]), at: 0.003, gain: -2 },
      { buf: H.strike(S.bones[k % 3]), at: 0.008, gain: -13 }, { buf: lib.thump({ f0: 140, f1: 62, sweep: 0.02, decay: 0.08, click: 0.2, drive: 1.8, seed: `hfb${k}` }), gain: -9 },
      { buf: H.norm(H.spray(0.25, `hfs${k}`)), at: 0.01, gain: -17 }]);
    flesh.push(H.shape(H.cut(H.K.balance(v, BAL.cut, 0.7), 0.45, 0.45), -17));
  }
  await cat.add('yazi_hit_flesh', flesh, { lufs: -17, spatial: true, range: [3, 45], voices: 5, pitch: [0.97, 1.03] });
  keep.flesh = flesh;

  // yazi_hit_wall: the long edge on stone — 「鏘」 (the blade ringing G5 over its body's G4, a heavier steel strike than
  // a light blade), a stone tick and chips, sparks
  const wall = [];
  const conc = await H.ld(X.concHit, 0, 0.47, { hp: 140 });
  const chips = await H.ld(X.stoneDebris, 0, 0.39, { hp: 380 });
  for (let k = 0; k < 5; k++) {
    const r = H.rng(`wall${k}`);
    const sparks = lib.automate(lib.crackle(0.35, { density: 190, decay: 0.0018, hp: 4000, seed: `wsp${k}` }), (t) => Math.exp(-t * 12));
    const v = lib.mix([
      { buf: H.strike(await H.ld(X.metalM(k), 0, 0.35, { hp: 300, semis: r.range(0, 2) })) },
      { buf: H.strike(await H.ld(X.metalHit, 0, 0.3, { hp: 400, semis: r.range(-1, 1) })), gain: -4 },
      { buf: H.norm(H.blade(YA * r.range(0.998, 1.002), 1.1, { t60: 0.6, bright: 1.1, seed: `wr${k}` })), at: 0.002, gain: -6 },
      { buf: H.norm(H.blade(YA_LO, 0.9, { t60: 0.45, seed: `wl${k}` })), at: 0.002, gain: -11 },
      { buf: H.K.crack(`wcr${k}`, { dur: 0.01, decay: 0.0025, hp: 3000 }), gain: -8 },
      { buf: H.strike(conc), gain: -6 },
      { buf: H.norm(sparks), at: 0.004, gain: -12 },
      { buf: H.strike(chips), at: 0.015, gain: -11 },
    ]);
    const e = lib.eq(v, [{ type: 'hp', f: 80, order: 2 }, { type: 'peak', f: 2800, gain: 2, q: 0.8 }]);
    wall.push(H.shape(H.cut(H.verb(e, 'alley', 0.14, 0.8, `wv${k}`, 1), 0.85, 0.45), -18, { max: 6 }));
  }
  await cat.add('yazi_hit_wall', wall, { lufs: -18, vol: 1.3, spatial: true, range: [3, 50], voices: 3, pitch: [0.96, 1.04] });

  // yazi_kill (≤ 2 a cut, 0.04 s apart): 碰鈴「叮」 on the scale (two kills climb), the soul torn out of the body (a
  // breath of voice rushing out and away), the sabre's ring, a soft low knock, a crimson flicker
  const kill = [];
  const notes = [N.D7, N.F7, N.G7, N.Bb6];
  for (let k = 0; k < 4; k++) {
    const f = notes[k];
    const nz = lib.noise(0.7, { color: 'pink', seed: `ks${k}` });
    const sigh = lib.automate(lib.mix([{ buf: H.norm(lib.sweep(nz, 'bp', (t) => 700 * 2 ** (-0.8 * H.smooth(t / 0.5)), { q: 3 })) }, { buf: H.norm(lib.sweep(nz, 'bp', (t) => 1500 * 2 ** (-0.6 * H.smooth(t / 0.5)), { q: 4 })), gain: -4 }]),
      (t) => H.smooth(t / 0.05) * Math.exp(-t * 5.5));
    const v = lib.mix([
      { buf: H.norm(H.ling(f, 1.6, { t60: 1.3, seed: `kl${k}` })) },
      { buf: H.norm(H.ling(f * 1.5, 1.2, { t60: 0.9, seed: `kl2${k}`, tick: -30 })), at: 0.005, gain: -13 },
      { buf: H.norm(H.blade(YA, 1.0, { t60: 0.6, seed: `kb${k}` })), gain: -12 },
      { buf: H.norm(sigh), at: 0.01, gain: -15 },
      { buf: lib.thump({ f0: 120, f1: 55, sweep: 0.03, decay: 0.12, click: 0, drive: 1.5, seed: `kk${k}` }), gain: -13 },
      { buf: H.norm(lib.automate(H.sizzle(0.4, { seed: `kz${k}`, density: 120 }), (t) => Math.exp(-t * 9))), gain: -22 },
    ]);
    kill.push(H.cut(H.verb(v, 'warehouse', 0.18, 1.2, `kv${k}`, 1, 500), 1.4, 0.4));
  }
  await cat.add('yazi_kill', kill, { lufs: -19, vol: 1.4, spatial: true, range: [5, 50], voices: 3, pitch: [1, 1] });
  keep.kill = kill;

  await hitSources(H);
  // yazi_sever: 斷肢 — the edge goes clean through: a fast cut, bone snapping, the wet tear, the blade's zing
  const gores = [await H.ld(X.splat, 0, 0.7, { hp: 100 }), await H.ld(X.gore, 0, 0.7, { hp: 100 })];
  const neck = await H.ld(X.neck, 0.53, 1.14, { hp: 150 });
  const zingRec = await H.ld(X.slash, 0.3, 0.49, { hp: 2500 });
  const sev = [];
  for (let k = 0; k < 4; k++) {
    const r = H.rng(`sev${k}`);
    const v = lib.mix([
      { buf: H.strike(lib.varispeedSemis(S.cuts[k % 3], r.range(-1, 1))) },
      { buf: H.strike(k % 2 ? neck : S.bones[k % 3]), at: 0.006, gain: -2 },
      { buf: H.strike(gores[k % 2]), at: 0.012, gain: -5 },
      { buf: lib.thump({ f0: 125, f1: 52, sweep: 0.03, decay: 0.18, click: 0.2, drive: 2, seed: `svb${k}` }), gain: -7 },
      { buf: H.strike(zingRec), at: 0.004, gain: -12 },
      { buf: H.norm(H.blade(YA, 0.7, { t60: 0.32, seed: `svr${k}` })), at: 0.004, gain: -17 },
      { buf: H.norm(H.spray(0.4, `svs${k}`, { t60: 0.3 })), at: 0.015, gain: -14 },
    ]);
    sev.push(H.shape(H.cut(H.verb(H.K.balance(v, BAL.cut, 0.7), 'alley', 0.1, 0.6, `svv${k}`, 1), 0.85, 0.45), -17));
  }
  await cat.add('yazi_sever', sev, { lufs: -17, spatial: true, range: [4, 50], voices: 3, pitch: [0.95, 1.05] });

  // yazi_soul (KE_SOUL: positional at the body, played at 0.5; the wisp flies 0.42-0.52 s into the blade): a ghost's
  // breath rising off the body — a sung "oo-ah" of noise through two moving formants and a thin tone gliding G5 -> D6
  // with a tremble, the wisp's whoosh, ember crackles riding it, and a soft absorbing 「叮」 as it reaches the blade
  const soul = [];
  for (let k = 0; k < 3; k++) {
    const D = 0.85, r = H.rng(`so${k}`);
    const nz = lib.noise(D, { color: 'pink', seed: `son${k}` });
    const f1 = (t) => 340 * 2 ** (1.0 * H.smooth(t / 0.4)), f2 = (t) => 880 * 2 ** (0.7 * H.smooth(t / 0.4));
    const voice = lib.mix([{ buf: H.norm(lib.sweep(nz, 'bp', f1, { q: 5 })) }, { buf: H.norm(lib.sweep(nz, 'bp', f2, { q: 6 })), gain: -3 }]);
    const tn = lib.tone(D, { freq: (t) => YA * 2 ** ((7 * H.smooth(t / 0.42) + 30 / 100 * Math.sin(2 * Math.PI * 7.5 * t)) / 12) });
    const e = (t) => H.smooth(t / 0.12) * (t > 0.42 ? Math.exp(-(t - 0.42) * 9) : 1);
    const v = lib.mix([
      { buf: H.norm(lib.automate(voice, e)), gain: -4 },
      { buf: H.norm(lib.automate(tn, e)), gain: -14 },
      { buf: H.norm(H.swoosh(D, 0.36, [300, 1700 * r.range(0.9, 1.1), 700], { q: 1.1, seed: `sow${k}`, rise: 1.6, fall: 7 })), gain: -6 },
      { buf: H.norm(lib.automate(lib.crackle(D, { density: 50, decay: 0.002, hp: 3000, seed: `soc${k}` }), e)), gain: -16 },
      { buf: H.norm(H.ling(N.D7, 0.6, { t60: 0.4, seed: `sol${k}`, tick: -30 })), at: 0.45, gain: -15 },
    ], { length: D });
    soul.push(H.cut(H.verb(v, 'urban', 0.14, 0.7, `sov${k}`, 1), D, 0.3));
  }
  await cat.add('yazi_soul', soul, { lufs: -20, vol: 1.3, spatial: true, range: [4, 40], voices: 3, pitch: [0.96, 1.04], maxHeadMs: 60 });

  // yazi_blood (reserved: the rare 報 drops falling as blood spots): dark drops pattering on the street
  const blood = [];
  const pats = [await H.ld(X.wetSplat1, 0.06, 0.49, { hp: 300 }), await H.ld(X.wetSplat2, 0.01, 0.4, { hp: 300 })];
  for (let k = 0; k < 2; k++) {
    const r = H.rng(`bd${k}`), parts = [];
    for (let i = 0; i < 9; i++) parts.push({ buf: lib.varispeedSemis(H.strike(pats[(i + k) % 2]), 4 + r.range(0, 6)), at: Math.pow(i / 9, 1.3) * 0.45 + r.range(0, 0.02), gain: -r.range(0, 9) });
    blood.push(H.cut(lib.mix(parts), 0.8, 0.35));
  }
  await cat.add('yazi_blood', blood, { lufs: -22, spatial: true, range: [3, 30], voices: 2, pitch: [0.95, 1.05] });
}

// ---------------------------------------------------------------------------------------------- 居合 iai
async function iai(lib, ctx, cat, H, keep) {
  const S = await hitSources(H);
  const src = await airSources(H);
  H.used.clear();   // (credited where they are used)
  const grip = await H.ld(X.unholster, 0.08, 0.5, { hp: 200 });
  // yazi_unsheathe (出鞘; the first draw, the inspect; the stance start at pitch 1.2 / vol 0.5): the hand closing on the
  // grip, the thumb's tick at the mouth, 0.15 s of steel running out of lacquered wood, the blade ringing free, its air
  const uns = [];
  for (let k = 0; k < 3; k++) {
    const r = H.rng(`un${k}`), D = 0.95;
    const v = lib.mix([
      { buf: grip, gain: -14 },
      { buf: H.click(`unc${k}`, { dbl: 0.012, ring: -16, tock: -10 }), gain: -9 },
      { buf: H.norm(H.saya(0.16, YA * r.range(0.997, 1.003), { seed: `uns${k}`, ring: -4, t60: 0.95 })), at: 0.01 },
      { buf: H.norm(H.swoosh(0.35, 0.16, [400, 1500, 600], { q: 1.1, seed: `unw${k}` })), at: 0.02, gain: -11 },
      { buf: H.norm(H.blade(YA_LO, 1.0, { t60: 0.7, bright: 0.7, seed: `unl${k}` })), at: 0.16, gain: -15 },
    ], { length: D });
    uns.push(H.cut(lib.stereoize(H.verb(v, 'smallRoom', 0.12, 0.6, `unv${k}`, 1), { width: 0.3, hp: 900, seed: `unst${k}` }), D, 0.35));
  }
  await cat.add('yazi_unsheathe', uns, { lufs: -18, vol: 1.1, spatial: false, channels: 2, voices: 2, pitch: [0.98, 1.02] });
  keep.unsheathe = uns;

  // yazi_sheathe (納刀「咔」: the stance's 0.15 s, the 收招 half home, the inspect): played the moment the blade is home —
  // the last few cm of slide, then the guard seated against the bronze mouth (a tight double click, the bronze ping on
  // D), the lacquered scabbard's hollow tock, a leather snap, the fittings and the tassel settling
  const sh = [];
  const snapRec = await H.ld(X.holster, 0.8, 0.96, { hp: 300 });
  for (let k = 0; k < 4; k++) {
    const r = H.rng(`sh${k}`);
    const slide = lib.slice(H.saya(0.12, YA, { dir: 'in', seed: `shs${k}` }), 0.085, 0.12);
    const v = lib.mix([
      { buf: lib.fadeIn(H.norm(slide), 0.003), gain: -8 },
      { buf: H.click(`shc${k}`, { dbl: 0.009 + r.range(0, 0.004), ring: -9, tock: -5, first: -6 }), at: 0.012 },
      { buf: H.strike(snapRec), at: 0.013, gain: -9 },
      { buf: H.strike(await H.ld(X.metalL(k + 1), 0, 0.2, { hp: 1800, semis: 5 + r.range(0, 2) })), at: 0.02, gain: -14 },
      { buf: lib.thump({ f0: 170, f1: 90, sweep: 0.015, decay: 0.06, click: 0.2, drive: 1.4, seed: `sht${k}` }), at: 0.012, gain: -12 },
      { buf: H.norm(H.K.jingle(0.18, 4, `shj${k}`)), at: 0.035, gain: -20 },
    ]);
    sh.push(H.shape(H.cut(lib.stereoize(H.verb(v, 'smallRoom', 0.12, 0.5, `shv${k}`, 1), { width: 0.25, hp: 1000, seed: `shst${k}` }), 0.6, 0.4), -18));
  }
  await cat.add('yazi_sheathe', sh, { lufs: -18, vol: 1.1, spatial: false, channels: 2, voices: 2, pitch: [0.98, 1.02] });
  keep.sheathe = sh;

  // yazi_koiguchi (鯉口を切る: the first draw, the stance at full, the inspect): the thumb pushing the guard — the press
  // and the habaki leaving its seat (a tight double click), 3 cm of steel rasping out, the guard's bronze ring, the red
  // sparks spitting at the mouth, a firm low knock
  const kg = [];
  for (let k = 0; k < 3; k++) {
    const r = H.rng(`kg${k}`);
    const v = lib.mix([
      { buf: H.click(`kgc${k}`, { dbl: 0.018 + r.range(0, 0.004), ring: -8, tock: -7, first: -2 }) },
      { buf: H.norm(H.saya(0.05, YA, { seed: `kgs${k}`, ring: -10, t60: 0.5 })), at: 0.022, gain: -12 },
      { buf: H.strike(await H.ld(X.metalL(k + 2), 0, 0.2, { hp: 2000, semis: 7 })), at: 0.018, gain: -12 },
      { buf: H.norm(lib.automate(H.sizzle(0.25, { seed: `kgz${k}`, density: 400, buzz: -20 }), (t) => Math.exp(-t * 14))), at: 0.02, gain: -15 },
      { buf: lib.thump({ f0: 150, f1: 70, sweep: 0.02, decay: 0.08, click: 0.25, drive: 1.6, seed: `kgt${k}` }), at: 0.018, gain: -10 },
    ]);
    kg.push(H.shape(H.cut(lib.stereoize(H.verb(v, 'smallRoom', 0.12, 0.5, `kgv${k}`, 1), { width: 0.25, hp: 1200, seed: `kgst${k}` }), 0.65, 0.4), -18));
  }
  await cat.add('yazi_koiguchi', kg, { lufs: -18, vol: 1.15, spatial: false, channels: 2, voices: 2, pitch: [0.98, 1.02] });
  keep.koiguchi = kg;

  // yazi_charge (the stance's loop, played at 0.45, rate 0.8 -> 1.25 by the handler: §1.12 蓄力 低頻上升): the beast's
  // throat humming low (G1 / G2 / D3 through a bronze throat, a ragged growl on it at 23 + 31 Hz), its heart beating
  // (two lub-dubs a loop: faster as the rate climbs), the scabbard's seals humming G4 / D5, the red current crackling
  // at the mouth, a low breath. Periodic in P = 2 s.
  {
    const P = 2, X2 = 0.5, W = 0.5, L = P + X2, q = (f) => H.onGrid(f, P);
    const rough = (t) => 0.62 + 0.25 * Math.sin(2 * Math.PI * q(23) * t) + 0.13 * Math.sin(2 * Math.PI * q(31) * t + 1.3);
    const throat = lib.automate(lib.mix([{ buf: lib.tone(W + P, { type: 'saw', freq: q(N.G1) }), gain: -4 }, { buf: lib.tone(W + P, { type: 'saw', freq: q(N.G2) }), gain: -3 }, { buf: lib.tone(W + P, { type: 'saw', freq: q(N.D3) }), gain: -10 }]), rough);
    const thr = lib.saturate(lib.eq(throat, [{ type: 'hp', f: 38, order: 2 }, { type: 'lowshelf', f: 120, gain: -5 }, { type: 'peak', f: 340, gain: 7, q: 1.4 }, { type: 'peak', f: 820, gain: 6, q: 1.8 }, { type: 'lp', f: 2800, order: 2 }]), { drive: 3, type: 'tube', mix: 0.5 });
    const seals = lib.automate(lib.mix([{ buf: lib.tone(W + P, { freq: q(N.G4) }) }, { buf: lib.tone(W + P, { freq: q(N.G4) + 1 / P }), gain: -3 }, { buf: lib.tone(W + P, { freq: q(N.D5) }), gain: -6 }]),
      (t) => 0.6 + 0.4 * Math.sin(2 * Math.PI * t / P));
    const beat = (s) => lib.mix([{ buf: lib.thump({ f0: 68, f1: 40, sweep: 0.04, decay: 0.16, click: 0.05, drive: 1.6, seed: `chb${s}` }) }, { buf: lib.thump({ f0: 62, f1: 38, sweep: 0.04, decay: 0.13, click: 0.03, drive: 1.4, seed: `chc${s}` }), at: 0.19, gain: -4 }]);
    const heart = H.wrap(lib.psychoBass(lib.mix([{ buf: beat(0) }, { buf: beat(1), at: P / 2, gain: -1 }], { length: P + 0.5 }), { freq: 110, amount: -4 }), P);
    const tonal = lib.mix([{ buf: H.norm(thr), gain: -4 }, { buf: H.norm(seals), gain: -16 }, { buf: lib.pad(H.norm(heart), W, 0), gain: -4 }]);
    const cur = H.sizzle(L, { seed: 'chz', density: 70, buzz: -12, hiss: -16 });
    const breath = lib.automate(lib.eq(lib.noise(L, { color: 'brown', seed: 'chr' }), [{ type: 'lp', f: 500, order: 2 }, { type: 'hp', f: 60, order: 2 }]), (t) => 0.55 + 0.45 * Math.sin(2 * Math.PI * t / P));
    const noisy = lib.mix([{ buf: lib.stereoize(H.norm(cur), { width: 0.6, hp: 2000, seed: 'chzs' }), gain: -13 }, { buf: lib.stereoize(H.norm(breath), { width: 0.3, hp: 150, seed: 'chrs' }), gain: -15 }], { channels: 2, length: L });
    const v = H.seamless(P, X2, noisy, tonal, W);
    H.seamCheck('yazi_charge', v, 1);
    await cat.add('yazi_charge', v, { lufs: -18, loop: true, spatial: false, channels: 2, voices: 1, pitch: [1, 1] });
    keep.charge = v;
  }

  // yazi_charge_stage (stages 1 / 2, pitched 1 / 1.12 by the handler): a seal strip on the scabbard igniting — the
  // talisman catching (a quick flare of fire), the crimson crackle running along it, a 碰鈴 on G6, the scabbard's tock,
  // the heart's one hard beat
  const flareRec = await H.ld(X.combust, 0, 0.45, { hp: 160, fadeOut: 0.1 });   // (its low whump only: the ignition)
  const stg = [];
  for (let k = 0; k < 2; k++) {
    const D = 1.2;
    const v = lib.mix([
      { buf: H.norm(lib.automate(flareRec, (t) => Math.min(1, t / 0.01) * Math.exp(-t * 9))), gain: -10 },
      { buf: H.norm(H.swoosh(0.2, 0.05, [1500, 4500, 3000], { q: 1.2, color: 'white', seed: `stw${k}`, rise: 2, fall: 6 })), gain: -12 },
      { buf: H.norm(lib.automate(H.sizzle(0.6, { seed: `stz${k}`, density: 350 }), (t) => Math.min(1, t / 0.01) * Math.exp(-t * 6))), at: 0.01, gain: -12 },
      { buf: H.norm(H.ling(N.G6, 1.1, { t60: 0.9, seed: `stl${k}` })), at: 0.012, gain: -5 },
      { buf: H.ban(`stb${k}`, { f: 900, t60: 0.06 }), gain: -12 },
      { buf: lib.thump({ f0: 70, f1: 42, sweep: 0.04, decay: 0.2, click: 0.05, drive: 1.6, seed: `stt${k}` }), gain: -8 },
    ]);
    stg.push(H.cut(lib.stereoize(H.verb(v, 'smallRoom', 0.15, 0.8, `stv${k}`, 1), { width: 0.35, hp: 1200, seed: `stst${k}` }), D, 0.4));
  }
  await cat.add('yazi_charge_stage', stg, { lufs: -18, vol: 1.2, spatial: false, channels: 2, voices: 2, pitch: [1, 1] });
  keep.stage = stg;

  // yazi_charge_full (stage 3, pitched 1.24; the koiguchi plays with it): the third strip and the whole scabbard
  // flaring, 小鑼「鏘↗」, the 睚眥 jaw snapping open, the beast's growl swelling under it, the three seals' chord
  const full = [];
  for (let k = 0; k < 2; k++) {
    const D = 1.6;
    const v = lib.mix([
      { buf: H.norm(lib.automate(flareRec, (t) => Math.min(1, t / 0.008) * Math.exp(-t * 4))), gain: -7 },
      { buf: H.norm(H.luo(N.D6 * 0.75, 1.5, { glide: 3.2, gt: 0.07, t60: 1.2, seed: `fl${k}` })), at: 0.005, gain: -3 },
      { buf: H.click(`flj${k}`, { f: N.G4, dbl: 0.012, ring: -10, tock: -4 }), gain: -8 },
      { buf: H.norm(await H.beast(k + 3, 0.7, { semis: -6, seed: 'flb' })), at: 0.03, gain: -13 },
      { buf: H.norm(lib.automate(H.sizzle(1.0, { seed: `flz${k}`, density: 380, buzz: -12 }), (t) => Math.min(1, t / 0.01) * Math.exp(-t * 3.5))), gain: -11 },
      ...[N.G6, N.Bb6, N.D7].map((f, i) => ({ buf: H.norm(H.ling(f, 1.4, { t60: 1.1, seed: `fll${k}${i}`, tick: -24 })), at: 0.01 + i * 0.012, gain: -14 - i })),
      { buf: lib.thump({ f0: 75, f1: 40, sweep: 0.05, decay: 0.3, click: 0.05, drive: 1.8, seed: `flt${k}` }), gain: -7 },
    ]);
    full.push(H.shape(H.cut(lib.stereoize(H.verb(v, 'warehouse', 0.15, 1.2, `flv${k}`, 1), { width: 0.4, hp: 1000, seed: `flst${k}` }), D, 0.35), -17));
  }
  await cat.add('yazi_charge_full', full, { lufs: -17, vol: 1.2, spatial: false, channels: 2, voices: 1, pitch: [1, 1] });
  keep.full = full;

  // yazi_issen (一閃: 2D for the caster, positional for teammates — mono): the blade torn out of the scabbard at full
  // speed (the guard's crack, a violent run of steel), the air splitting, 6 m in 0.15 s (the rush past the ears and the
  // wind of it), one flat cut across the whole front, the white edge streaking, the landing's scuff
  const iss = [];
  await airSources(H);
  for (let k = 0; k < 3; k++) {
    const r = H.rng(`is${k}`), D = 1.2;
    const rush = lib.automate(H.swoosh(D, 0.08, [220, 1500 * r.range(0.9, 1.1), 320], { q: 0.7, seed: `isr${k}`, rise: 1.5, fall: 3.5 }), (t) => (t > 0.5 ? Math.exp(-(t - 0.5) * 6) : 1));
    const gust = lib.automate(await H.ld(X.wind, 1.2 + k * 1.3, 2.2 + k * 1.3, { hp: 220, lp: 7000 }), (t) => H.smooth(t / 0.04) * Math.exp(-t * 4));
    const v = lib.mix([
      { buf: H.click(`isc${k}`, { dbl: 0.008, ring: -14, tock: -8, first: -1 }), gain: -6 },
      { buf: H.norm(H.saya(0.06, YA, { seed: `iss${k}`, ring: -6, t60: 0.6, glide: 0.12 })), at: 0.004, gain: -3 },
      { buf: H.K.crack(`isk${k}`, { dur: 0.022, decay: 0.006, hp: 700, lp: 7000 }), at: 0.03, gain: -6 },
      { buf: H.boom(`isb${k}`, { f0: 130, f1: 50, sweep: 0.03, decay: 0.2, drive: 2 }), at: 0.03, gain: -5 },
      { buf: H.norm(rush), gain: -2 },
      { buf: H.norm(gust), at: 0.04, gain: -11 },
      H.alignAt(lib.varispeedSemis(src.air[k % 4], -2.5), 0.1, -3),
      H.alignAt(H.norm(lib.varispeedSemis(src.whoom, -4)), 0.1, -5),
      { buf: H.norm(H.edge(0.7, 0.09, YA, { up: 3, down: -9, fall: 5 })), gain: -10 },
      { buf: H.norm(lib.automate(H.sizzle(0.7, { seed: `isz${k}`, density: 260, buzz: -12 }), (t) => H.smooth((t - 0.06) / 0.03) * Math.exp(-Math.max(0, t - 0.09) * 6))), gain: -15 },
      { buf: H.strike(await H.ld(X.dirt, 0.1 + k * 0.4, 0.5 + k * 0.4, { hp: 280 })), at: 0.17, gain: -14 },
      { buf: H.lux(`isx${k}`), at: 0.03, gain: -14 },
    ], { length: D });
    iss.push(H.shape(H.cut(H.verb(v, 'urban', 0.1, 0.8, `isv${k}`, 1), D, 0.35), -15));
  }
  // (a bright, transient-led rush: the codec overshoots it, so mastered 1 dB under and lifted with vol)
  await cat.add('yazi_issen', iss, { lufs: -15, vol: 1.12, spatial: true, channels: 1, range: [6, 60], voices: 2, pitch: [0.98, 1.02], priority: 3 });
  keep.issen = iss;

  // yazi_issen_ring (2D, 0.05 s after: the local player only): 「鏘——」 the long tail of the draw — the sabre ringing on
  // G for seconds (G5 over G4, the doublets beating, the high modes shimmering off), its octave answer in the scabbard's
  // bronze, and the four white-to-red screen slashes streaking across the stereo field (0.03 s apart, the first L -> R
  // full width), a wide street reverb
  const ring = [];
  const zingRec = await H.ld(X.slash, 0.3, 0.49, { hp: 2000 });
  for (let k = 0; k < 2; k++) {
    const D = 3.0;
    const steel = lib.mix([{ buf: H.strike(await H.ld(X.metalL(k + 3), 0, 0.6, { hp: 600, semis: 2 })) }, { buf: H.strike(await H.ld(X.metalHit, 0, 0.6, { hp: 500, semis: 3 })), gain: -4 }, { buf: H.strike(zingRec), gain: -6 }]);
    const slashes = [0, 1, 2, 3].map((i) => {
      const dir = i % 2 ? -1 : 1, w = i ? 0.55 : 0.9;
      const z = lib.mix([{ buf: H.norm(H.edge(0.45, 0.03, YA * 2 ** ((-2 * i) / 12), { up: 2, down: -10, fall: 7 })) }, { buf: H.norm(H.swoosh(0.4, 0.03, [2500, 6500, 3000], { q: 1.6, color: 'white', seed: `rgs${k}${i}`, rise: 2, fall: 8 })), gain: -6 }]);
      return { buf: H.panMove(z, (t) => dir * w * (-1 + 2 * H.smooth(t / 0.12))), at: 0.03 * i, gain: -6 - i * 2 };
    });
    const v = lib.mix([
      ...slashes,
      { buf: lib.pan(H.norm(H.blade(YA, D, { t60: 2.2, bright: 1.05, beat: 0.0022, seed: `rga${k}` })), 0.15), gain: 0 },
      { buf: lib.pan(H.norm(H.blade(YA_LO, D, { t60: 1.8, bright: 0.8, seed: `rgb${k}` })), -0.15), at: 0.003, gain: -5 },
      { buf: H.norm(H.blade(N.D6, 2.0, { t60: 1.2, bright: 0.9, seed: `rgc${k}` })), at: 0.006, gain: -15 },
      { buf: lib.stereoize(H.norm(steel), { width: 0.4, hp: 1500, seed: `rgm${k}` }), gain: -9 },
      { buf: lib.stereoize(H.norm(lib.automate(H.sizzle(1.2, { seed: `rgz${k}`, density: 140, buzz: -18 }), (t) => Math.exp(-t * 3))), { width: 0.7, hp: 2000, seed: `rgzs${k}` }), gain: -22 },
    ], { channels: 2 });
    ring.push(H.cut(H.verb(v, 'urban', 0.22, 2.2, `rgv${k}`, 2, 400), D, 0.5));
  }
  await cat.add('yazi_issen_ring', ring, { lufs: -18, vol: 1.3, spatial: false, channels: 2, voices: 1, pitch: [1, 1] });
  keep.ring = ring;

  // yazi_issen_burst (2D, 0.12 s after the landing): the bodies the draw passed burst at once — a sharp crack, five
  // wet bursts inside 70 ms, bone, the dark blood mist, a deep whump, a choked 鈸 「七」 on the beat, the crimson flare
  const bur = [];
  await hitSources(H);
  for (let k = 0; k < 2; k++) {
    const r = H.rng(`bu${k}`), D = 1.3;
    const bursts = [0, 0.016, 0.03, 0.049, 0.07].map((t, i) => ({ buf: H.strike(lib.varispeedSemis(i % 2 ? S.meats[(k + i) % 3] : S.cuts[(k + i) % 3], r.range(-2, 1))), at: t, gain: [0, -2, -3, -4, -6][i] }));
    const v = lib.mix([
      { buf: H.K.crack(`buc${k}`, { dur: 0.012, decay: 0.003, hp: 2000 }), gain: -5 },
      ...bursts,
      { buf: H.strike(await H.ld(k % 2 ? X.gore : X.splat, 0, 0.7, { hp: 100 })), at: 0.02, gain: -5 },
      { buf: H.strike(S.bones[k % 3]), at: 0.03, gain: -11 },
      { buf: H.norm(H.spray(0.7, `bus${k}`, { t60: 0.5, f: 1800 })), at: 0.01, gain: -11 },
      { buf: H.boom(`bub${k}`, { f0: 100, f1: 44, sweep: 0.04, decay: 0.32, drive: 2.3 }), gain: -3 },
      { buf: await H.bo({ len: 0.35, t60: 0.18, seed: `buo${k}` }), at: 0.004, gain: -12 },
      { buf: H.norm(lib.automate(H.sizzle(0.8, { seed: `buz${k}`, density: 300, buzz: -12 }), (t) => Math.min(1, t / 0.01) * Math.exp(-t * 5))), gain: -14 },
    ], { channels: 2 });
    const e = lib.eq(v, [{ type: 'hp', f: 40, order: 2 }, { type: 'peak', f: 2600, gain: 1.5, q: 0.8 }]);
    bur.push(H.shape(H.cut(H.verb(e, 'urban', 0.14, 1.2, `buv${k}`), D, 0.4), -16, { max: 6 }));
  }
  await cat.add('yazi_issen_burst', bur, { lufs: -16, vol: 1.2, maxLimitDb: 6, spatial: false, channels: 2, voices: 1, pitch: [0.98, 1.02], priority: 3 });
  keep.burst = bur;

  // yazi_parry (完美彈反: 2D for the caster, positional for teammates — mono): 清脆「叮」 — the blow turned at the mouth:
  // a bright steel strike, a pair of 碰鈴 high and pure (G6 + D7), the sabre and the bronze mouth ringing, the weight of
  // it (a low thump), the world slowing (a falling air sweep)
  const par = [];
  for (let k = 0; k < 2; k++) {
    const D = 2.2;
    const slow = H.swoosh(1.0, 0.02, [6000, 3000, 360], { q: 0.9, seed: `pas${k}`, rise: 1, fall: 2.5 });
    const v = lib.mix([
      { buf: H.strike(await H.ld(X.metalL(k + 1), 0, 0.3, { hp: 1500, semis: 6 })), gain: -5 },
      { buf: H.K.crack(`pac${k}`, { dur: 0.008, decay: 0.002, hp: 4000 }), gain: -6 },
      { buf: H.strike(await H.ld(X.metalM(k + 2), 0, 0.35, { hp: 250, semis: 2 })), gain: -10 },
      { buf: H.norm(H.ling(N.G6, D, { t60: 1.9, seed: `pal${k}`, tick: -10 })) },
      { buf: H.norm(H.ling(N.D7, D, { t60: 1.6, seed: `pam${k}`, tick: -16 })), at: 0.004, gain: -3 },
      { buf: H.norm(H.blade(YA, D, { t60: 1.6, bright: 1.1, seed: `par${k}` })), at: 0.002, gain: -7 },
      { buf: H.norm(H.blade(SAYA, 1.6, { t60: 1.0, seed: `pab${k}` })), at: 0.004, gain: -11 },
      { buf: lib.thump({ f0: 125, f1: 48, sweep: 0.04, decay: 0.28, click: 0.15, drive: 2, seed: `pat${k}` }), gain: -7 },
      { buf: H.norm(slow), at: 0.01, gain: -16 },
    ]);
    par.push(H.shape(H.cut(H.verb(v, 'warehouse', 0.2, 2.0, `pav${k}`, 1), D, 0.4), -16));
  }
  await cat.add('yazi_parry', par, { lufs: -16, vol: 1.4, spatial: true, channels: 1, range: [5, 60], voices: 1, pitch: [1, 1], priority: 3 });
  keep.parry = par;

  // yazi_parry_cymbal (0.03 s after, the caster only): the band answers — 鈸 (the opera cymbal) crashed open over a
  // hard-mallet suspended cymbal, wide
  const cym = [];
  const susp = await H.ld(X.suspHard, 0.1, 2.6, { stereo: true, hp: 400 });
  for (let k = 0; k < 2; k++) {
    const v = lib.mix([{ buf: await H.bo({ len: 1.8, t60: 1.1, seed: `cy${k}`, semis: k ? -0.5 : 0.3 }) }, { buf: H.strike(susp), gain: -9 }, { buf: lib.thump({ f0: 140, f1: 70, sweep: 0.02, decay: 0.08, click: 0.2, drive: 1.3, seed: `cyt${k}` }), gain: -16 }], { channels: 2 });
    cym.push(H.cut(H.verb(v, 'warehouse', 0.18, 1.6, `cyv${k}`), 1.9, 0.4));
  }
  await cat.add('yazi_parry_cymbal', cym, { lufs: -18, vol: 1.2, spatial: false, channels: 2, voices: 1, pitch: [0.99, 1.01] });
  keep.cymbal = cym;
}

// ---------------------------------------------------------------------------------------------- 睚眥必報 vengeance
async function venge(lib, ctx, cat, H, keep) {
  const S = await hitSources(H);
  H.used.clear();
  // yazi_vengeance (2D for the caster, positional for teammates — mono): 「匡↘」 — the big opera gong and the cymbal
  // together (the opera's 匡, a G3 gong bending down), the 報 seal stamped on the street, a crimson ring racing outward,
  // a low blow, red motes crackling up
  const vg = [];
  for (let k = 0; k < 2; k++) {
    const D = 2.6;
    const v = lib.mix([
      { buf: H.norm(H.luo(N.G3, D, { big: true, glide: -3.5, gt: 0.35, t60: 2.2, seed: `vgl${k}`, knock: -10, wash: -12 })) },
      { buf: H.mono(await H.gongRec(-2 + k * 0.5, 2.6, 1.8)), gain: -7 },
      { buf: H.mono(await H.bo({ len: 1.4, t60: 0.8, seed: `vgb${k}` })), gain: -5 },
      { buf: H.stamp(`vgs${k}`, { size: 1.2 }), gain: -3 },
      { buf: H.norm(H.swoosh(0.7, 0.08, [180, 850, 260], { q: 0.9, seed: `vgw${k}`, rise: 1.5, fall: 4 })), gain: -9 },
      { buf: H.boom(`vgo${k}`, { f0: 82, f1: 42, sweep: 0.05, decay: 0.45, drive: 2 }), gain: -8 },
      { buf: H.norm(lib.automate(H.sizzle(1.6, { seed: `vgz${k}`, density: 120, buzz: -16 }), (t) => H.smooth(t / 0.05) * Math.exp(-t * 2))), at: 0.03, gain: -17 },
    ]);
    vg.push(H.shape(H.cut(H.verb(lib.eq(v, [{ type: 'hp', f: 35, order: 2 }]), 'urban', 0.18, 1.8, `vgv${k}`, 1), D, 0.4), -17, { max: 6 }));
  }
  await cat.add('yazi_vengeance', vg, { lufs: -17, vol: 1.4, spatial: true, channels: 1, range: [6, 70], voices: 2, pitch: [0.99, 1.01], priority: 3 });
  keep.venge = vg;

  // yazi_reflect (the caster only, every blow returned): the crimson thread snapping out (a zip climbing in 50 ms, a
  // whip's crack), the arc's zap, the 報 stamped on the attacker (a small seal, a little 小鑼), the blow landing on it
  const rf = [];
  await hitSources(H);
  for (let k = 0; k < 4; k++) {
    const r = H.rng(`rf${k}`);
    const zip = lib.automate(lib.saturate(lib.tone(0.08, { freq: (t) => 300 * (2600 / 300) ** (t / 0.06) }), { drive: 3, type: 'tanh' }), (t) => Math.min(1, t / 0.005) * (t > 0.055 ? Math.max(0, (0.08 - t) / 0.025) : 1));
    const v = lib.mix([
      { buf: H.norm(zip), gain: -10 },
      { buf: H.K.crack(`rfc${k}`, { dur: 0.012, decay: 0.002, hp: 1500 }), at: 0.05, gain: -2 },
      { buf: H.norm(lib.automate(H.sizzle(0.3, { seed: `rfz${k}`, density: 500, buzz: -8 }), (t) => Math.min(1, t / 0.004) * Math.exp(-t * 14))), at: 0.01, gain: -9 },
      { buf: H.stamp(`rfs${k}`, { size: 0.8 }), at: 0.06, gain: -5 },
      { buf: H.norm(H.luo(N.D6 * 0.75 * r.range(0.98, 1.02), 0.9, { glide: 2.5, gt: 0.06, t60: 0.7, seed: `rfl${k}` })), at: 0.06, gain: -11 },
      { buf: H.strike(S.meats[k % 3]), at: 0.062, gain: -4 },
      { buf: H.strike(lib.varispeedSemis(S.cuts[k % 3], -1)), at: 0.06, gain: -8 },
      { buf: lib.thump({ f0: 140, f1: 55, sweep: 0.03, decay: 0.14, click: 0.2, drive: 1.8, seed: `rft${k}` }), at: 0.06, gain: -6 },
    ]);
    rf.push(H.shape(H.cut(lib.stereoize(H.verb(v, 'smallRoom', 0.12, 0.6, `rfv${k}`, 1), { width: 0.3, hp: 1000, seed: `rfst${k}` }), 0.85, 0.4), -16));
  }
  await cat.add('yazi_reflect', rf, { lufs: -16, spatial: false, channels: 2, voices: 3, pitch: [0.97, 1.03], priority: 2 });

  // yazi_vengeance_end (4 s later, the caster only): the vow released — the beast's long exhale, the red current
  // dying, a tone sinking D5 -> G4, a soft breath of air outward
  const ve = [];
  for (let k = 0; k < 2; k++) {
    const D = 1.6;
    const sink = lib.automate(lib.mix([{ buf: lib.tone(D, { freq: (t) => N.D5 * (N.G4 / N.D5) ** H.smooth(t / 0.9) }) }, { buf: lib.tone(D, { freq: (t) => 2.756 * N.D5 * (N.G4 / N.D5) ** H.smooth(t / 0.9) }), gain: -12 }]), (t) => Math.min(1, t / 0.03) * Math.exp(-t * 3));
    const v = lib.mix([
      { buf: lib.stereoize(H.snort(`ves${k}`, { dur: 0.9, decay: 0.6, attack: 0.05, flutter: 26 }), { width: 0.3, hp: 500, seed: `vess${k}` }), gain: -3 },
      { buf: lib.stereoize(H.norm(lib.automate(H.sizzle(1.4, { seed: `vez${k}`, density: 140 }), (t) => Math.exp(-t * 2.5))), { width: 0.6, hp: 2000, seed: `vezs${k}` }), gain: -15 },
      { buf: lib.pan(H.norm(sink), 0), gain: -15 },
      { buf: lib.stereoize(H.norm(H.swoosh(0.9, 0.15, [500, 900, 200], { q: 0.9, seed: `vew${k}`, rise: 1.4, fall: 3 })), { width: 0.4, hp: 300, seed: `vews${k}` }), gain: -11 },
    ], { channels: 2 });
    ve.push(H.cut(H.verb(v, 'smallRoom', 0.12, 0.8, `vev${k}`), D, 0.4));
  }
  await cat.add('yazi_vengeance_end', ve, { lufs: -20, vol: 1.1, spatial: false, channels: 2, voices: 1, pitch: [0.98, 1.02] });
}

// ---------------------------------------------------------------------------------------------- 裂魂 ultimate
// Beats (yazi.js ULT, 1.9 s): 0 cast (the blade raised, red lightning), 0.2 the bed starts (delay 0.2) + the puppets rise
// (+ the suona 0.05 later), 0.4 the seal + pillar, 0.4 -> 0.9 six puppet cuts every 0.1 s, 1.0 the draw through the
// middle, 1.12 the impact (ring of red), 1.3 the blade half home (the puppets fall to ash), 1.9 the end.
const ULT = { puppet: 0.2, suona: 0.25, seal: 0.4, cut: (i) => 0.4 + 0.1 * i, draw: 1.0, hit: 1.12, sheathe: 1.3, end: 1.9, bed: 0.2 };

async function ult(lib, ctx, cat, H, keep) {
  const S = await hitSources(H);
  const src = await airSources(H);
  H.used.clear();
  // ① yazi_ult_cast (§1.12 layer 1, the 0.4 s rise; 2D for the caster, positional for teammates — mono): the blade
  // raised upright before the face (a quick run of steel, its air), the beast drawing breath (a snort taken backwards),
  // red lightning crawling up the blade (the crackle swelling), a reversed 大鑼 swelling into 0.4, a tone climbing an
  // octave G2 -> G3 through a tube; it breaks at 0.4 with a crack
  const cast = [];
  for (let k = 0; k < 2; k++) {
    const D = 0.85, B = 0.4;
    const gong = H.luo(N.G3, 1.2, { big: true, glide: -3, gt: 0.3, t60: 1.6, seed: `ucg${k}` });
    const rev = lib.fadeIn(lib.slice(lib.reverse(gong), 1.2 - B, 1.2), 0.06);
    const up = lib.automate(lib.saturate(lib.mix([{ buf: lib.tone(D, { type: 'saw', freq: (t) => N.G2 * 2 ** Math.min(1, t / B) }) }, { buf: lib.tone(D, { type: 'saw', freq: (t) => N.D3 * 2 ** Math.min(1, t / B) }), gain: -4 }]), { drive: 3, type: 'tube', mix: 0.5 }),
      (t) => (t < B ? (t / B) ** 2 : Math.exp(-(t - B) * 14)));
    const inhale = lib.reverse(H.snort(`uci${k}`, { dur: 0.45, decay: 0.3, attack: 0.02 }));
    const v = lib.mix([
      { buf: H.norm(H.saya(0.08, YA, { seed: `ucs${k}`, ring: -6, t60: 0.6 })), gain: -9 },
      { buf: H.norm(H.swoosh(0.3, 0.1, [300, 1300, 500], { q: 1, seed: `ucw${k}` })), gain: -11 },
      { buf: H.norm(lib.fadeIn(inhale, 0.05)), at: Math.max(0, B - inhale.duration), gain: -8 },
      { buf: H.norm(lib.automate(H.sizzle(D, { seed: `ucz${k}`, density: 420, buzz: -10 }), (t) => (t < B ? 0.15 + 0.85 * (t / B) ** 1.5 : Math.exp(-(t - B) * 9)))), gain: -9 },
      { buf: H.norm(rev), gain: -5 },
      { buf: H.norm(lib.eq(up, [{ type: 'lp', f: 3500, order: 2 }])), gain: -10 },
      { buf: H.K.crack(`ucc${k}`, { dur: 0.015, decay: 0.004, hp: 1500 }), at: B, gain: -9 },
      { buf: lib.thump({ f0: 95, f1: 48, sweep: 0.04, decay: 0.2, click: 0, drive: 1.5, seed: `uct${k}` }), at: B, gain: -11 },
    ], { length: D });
    cast.push(H.shape(H.cut(H.verb(v, 'warehouse', 0.15, 1.0, `ucv${k}`, 1), D, 0.35), -15));
  }
  await cat.add('yazi_ult_cast', cast, { lufs: -15, vol: 1.1, spatial: true, channels: 1, range: [10, 120], voices: 2, pitch: [1, 1], priority: 3, maxHeadMs: 60 });
  keep.cast = cast;

  // yazi_ult_puppet (0.2, at the middle): 皮影翻板「啪」 — the 拍板 cueing the scene (「八」), then six hide panels flipped
  // up on their rods inside 0.1 s (a scatter of flat slaps, papery flutters, bamboo knocks), the hide rustling, the air
  // of them rising, the dust at their feet
  const pup = [];
  const rustle = await H.ld(X.clothHeavy, 0, 0.6, { hp: 200 });
  for (let k = 0; k < 2; k++) {
    const r = H.rng(`up${k}`), D = 1.0;
    const slaps = [0, 0.017, 0.031, 0.052, 0.068, 0.092].map((t, i) => ({ buf: H.hide(`ups${k}${i}`, { f: r.range(1100, 1900), rod: -8 - r.range(0, 4) }), at: 0.01 + t + r.range(-0.004, 0.004), gain: -r.range(0, 4) }));
    const v = lib.mix([
      { buf: H.ban(`upb${k}`, { f: 1350 }), gain: -2 },
      ...slaps,
      { buf: H.norm(H.swoosh(0.4, 0.09, [300, 1500, 600], { q: 1, seed: `upw${k}` })), at: 0.01, gain: -6 },
      { buf: rustle, at: 0.02, gain: -7 },
      { buf: lib.varispeedSemis(rustle, 3), at: 0.06, gain: -10 },
      { buf: H.norm(H.dust(0.6, `upd${k}`, { t60: 0.4 })), at: 0.03, gain: -12 },
      { buf: lib.thump({ f0: 120, f1: 60, sweep: 0.03, decay: 0.12, click: 0.1, drive: 1.4, seed: `upt${k}` }), at: 0.01, gain: -12 },
    ], { length: D });
    pup.push(H.shape(H.cut(H.verb(v, 'urban', 0.14, 0.8, `upv${k}`, 1), D, 0.35), -17));
  }
  await cat.add('yazi_ult_puppet', pup, { lufs: -17, vol: 1.35, spatial: true, channels: 1, range: [12, 140], voices: 2, pitch: [0.99, 1.01] });
  keep.puppet = pup;

  // yazi_ult_suona (0.25, at the middle): 一聲短促的嗩吶 — a grace note, a run up the scale and one long wailing G6 that
  // falls away (the 哭腔); two phrasings
  const sn = [];
  const phrases = [
    [{ t: 0, d: 0.045, f: N.C6, scoop: 120 }, { t: 0.045, d: 0.08, f: N.D6 }, { t: 0.125, d: 0.07, f: N.F6 }, { t: 0.195, d: 0.36, f: N.G6, depth: 38, fall: 4, fallT: 0.24 }],
    [{ t: 0, d: 0.05, f: N.Bb5, scoop: 140 }, { t: 0.05, d: 0.11, f: N.D6 }, { t: 0.16, d: 0.42, f: N.G6, slide: 0.05, depth: 34, fall: 3, fallT: 0.22 }],
  ];
  for (let k = 0; k < 2; k++) {
    const s = H.suona(phrases[k], { seed: `usn${k}` });
    sn.push(H.cut(H.verb(s, 'urban', 0.16, 0.9, `usv${k}`, 1, 400), s.duration + 0.5, 0.4));
  }
  await cat.add('yazi_ult_suona', sn, { lufs: -17, vol: 1.3, spatial: true, channels: 1, range: [12, 140], voices: 1, pitch: [1, 1] });
  keep.suona = sn;

  // yazi_ult_seal (0.4, at the middle): 報印落下 — the blood-red seal stamped in the air: 「匡↘」 (the big gong on D3 and
  // the cymbal together, the recorded gong under them), the great seal's blow, the bass drum, and the pillar of blood
  // light slamming down (a falling roar of noise, the sizzle of it, a rumble)
  const seal = [];
  const bd = await H.ld(X.bdFff, 0.07, 3.0, { hp: 30, fadeOut: 0.5 });
  for (let k = 0; k < 2; k++) {
    const D = 2.6;
    const pillar = lib.automate(lib.sweep(lib.noise(1.0, { color: 'pink', seed: `slp${k}` }), 'bp', (t) => 2600 * (220 / 2600) ** Math.min(1, t / 0.25), { q: 0.8 }), (t) => Math.min(1, t / 0.01) * Math.exp(-t * 4));
    const v = lib.mix([
      { buf: H.norm(H.luo(N.D3, D, { big: true, glide: -4, gt: 0.3, t60: 2.4, seed: `sll${k}`, knock: -8, wash: -11 })) },
      { buf: H.mono(await H.gongRec(-7 + k * 0.4, 2.6, 2.0)), gain: -8 },
      { buf: H.mono(await H.bo({ len: 1.6, t60: 0.9, seed: `slb${k}` })), gain: -7 },
      { buf: H.stamp(`sls${k}`, { size: 1.6, crunch: -12 }), gain: -2 },
      { buf: H.tight(H.strike(bd), 1.0), gain: -6 },
      { buf: H.norm(pillar), gain: -10 },
      { buf: H.norm(lib.automate(H.sizzle(1.0, { seed: `slz${k}`, density: 260, buzz: -10 }), (t) => Math.min(1, t / 0.02) * Math.exp(-t * 3.5))), gain: -14 },
      { buf: H.norm(H.rumble(D, `slr${k}`, { lp: 180, t60: 1.6 })), gain: -12 },
    ]);
    const e = lib.eq(v, [{ type: 'hp', f: 32, order: 2 }, { type: 'lowshelf', f: 120, gain: -2 }, { type: 'peak', f: 2200, gain: 1.5, q: 0.8 }]);
    seal.push(H.shape(H.cut(H.verb(e, 'urban', 0.2, 2.0, `slv${k}`, 1), D, 0.4), -16, { max: 6 }));
  }
  await cat.add('yazi_ult_seal', seal, { lufs: -16, vol: 1.3, maxLimitDb: 6, spatial: true, channels: 1, range: [12, 140], voices: 2, pitch: [0.99, 1.01], priority: 3 });
  keep.seal = seal;

  // yazi_ult_slash (x6, every 0.1 s, pitched 0.9 -> 1.15 by the handler; at each puppet): a hide swordsman's cut — the
  // flat figure's arm swishing (a lighter air, a papery flutter), its blade biting (the cut, the meat), a thin red zing
  const sl = [];
  await hitSources(H); await airSources(H);
  for (let k = 0; k < 4; k++) {
    const r = H.rng(`sl${k}`), D = 0.55, P = 0.035;
    const flut = lib.automate(lib.eq(lib.noise(D, { color: 'pink', seed: `slf${k}` }), [{ type: 'bp', f: 2400, q: 1.1 }]), (t) => H.smooth(t / P) * Math.exp(-Math.max(0, t - P) * 18) * (0.55 + 0.45 * Math.sin(2 * Math.PI * 64 * t)));
    const v = lib.mix([
      H.alignAt(lib.varispeedSemis(src.air[(k + 1) % src.air.length], 1.5 + r.range(-0.5, 0.5)), P, 0),
      { buf: H.norm(flut), gain: -11 },
      { buf: H.strike(lib.varispeedSemis(S.cuts[k % 3], r.range(-1, 1))), at: P + 0.004, gain: -2 },
      { buf: H.strike(S.meats[k % 3]), at: P + 0.006, gain: -7 },
      { buf: H.norm(H.edge(0.4, P, YA, { up: 2, down: -8, fall: 8 })), gain: -15 },
      { buf: lib.thump({ f0: 140, f1: 62, sweep: 0.02, decay: 0.07, click: 0.2, drive: 1.5, seed: `slt${k}` }), at: P, gain: -11 },
    ], { length: D });
    sl.push(H.shape(H.cut(H.K.balance(v, BAL.cut, 0.6), D, 0.4), -17));
  }
  await cat.add('yazi_ult_slash', sl, { lufs: -17, vol: 1.2, spatial: true, channels: 1, range: [8, 100], voices: 6, pitch: [0.99, 1.01] });
  keep.slash = sl;

  // yazi_ult_issen (1.0; 2D for the caster, positional for teammates — mono): 一閃穿心 — the issen made huge: the
  // guard's crack, the full run of steel, the air split wide open, the rush through the middle, a giant flat cut and
  // its white edge streaking out across the whole view
  const ui = [];
  await airSources(H);
  for (let k = 0; k < 2; k++) {
    const r = H.rng(`ui${k}`), D = 1.3;
    const rush = lib.automate(H.swoosh(D, 0.07, [160, 1300 * r.range(0.9, 1.1), 260], { q: 0.65, seed: `uir${k}`, rise: 1.4, fall: 3 }), (t) => (t > 0.55 ? Math.exp(-(t - 0.55) * 5) : 1));
    const v = lib.mix([
      { buf: H.click(`uic${k}`, { dbl: 0.008, ring: -12, tock: -6, first: 0 }), gain: -9 },
      { buf: H.norm(H.saya(0.07, YA_LO, { seed: `uis${k}`, ring: -4, t60: 0.9, glide: 0.14, bright: 1 })), gain: -2 },
      { buf: H.K.crack(`uik${k}`, { dur: 0.03, decay: 0.008, hp: 500, lp: 7000 }), at: 0.025, gain: -7 },
      { buf: H.boom(`uib${k}`, { f0: 110, f1: 44, sweep: 0.04, decay: 0.28, drive: 2.2 }), at: 0.025, gain: -6 },
      { buf: H.norm(rush), gain: -2 },
      H.alignAt(lib.varispeedSemis(src.air[4], -4), 0.09, -2),
      H.alignAt(H.norm(lib.varispeedSemis(src.whoom, -6)), 0.09, -4),
      { buf: H.norm(H.edge(0.9, 0.08, YA_LO, { up: 3, down: -10, fall: 4 })), gain: -8 },
      { buf: H.norm(H.edge(0.8, 0.085, YA, { up: 2, down: -9, fall: 5 })), gain: -12 },
      { buf: H.norm(lib.automate(H.sizzle(0.9, { seed: `uiz${k}`, density: 380, buzz: -10 }), (t) => H.smooth((t - 0.05) / 0.03) * Math.exp(-Math.max(0, t - 0.08) * 4))), gain: -13 },
      { buf: H.lux(`uix${k}`), at: 0.025, gain: -13 },
    ], { length: D });
    ui.push(H.shape(H.cut(H.verb(v, 'urban', 0.12, 1.0, `uiv${k}`, 1), D, 0.35), -15));
  }
  await cat.add('yazi_ult_issen', ui, { lufs: -15, vol: 1.25, spatial: true, channels: 1, range: [10, 120], voices: 2, pitch: [0.99, 1.01], priority: 3 });
  keep.ultIssen = ui;

  // ② yazi_ult_boom (§1.12 layer 2: the 40-60 Hz blow, 1.12, at the middle): the ring of red tearing out across the
  // street — a deep punch (~0.3 s, not a drone), a blast, the big gong and the cymbal struck by it (匡), the street
  // cracking and its debris, the red wave's sizzle, a rumble
  const bm = [];
  {
    const deepB = H.tight(H.strike(await H.ld(X.deepBoom, 0, 2.6, { hp: 28 })), 1.0);
    const blast = H.tight(H.strike(await H.ld(X.blast, 0, 1.24, { hp: 40 })), 0.7);
    const smash = H.tight(H.strike(await H.ld(X.concSmash, 0, 1.0, { hp: 50 })), 0.6);
    for (let k = 0; k < 2; k++) {
      const D = 2.8;
      const wave = lib.automate(lib.sweep(lib.noise(1.2, { color: 'pink', seed: `bmw${k}` }), 'bp', (t) => 300 * (1800 / 300) ** Math.min(1, t / 0.3), { q: 0.8 }), (t) => Math.min(1, t / 0.01) * Math.exp(-t * 4));
      const v = lib.mix([
        { buf: H.K.crack(`bmc${k}`, { dur: 0.02, decay: 0.005, hp: 1200 }), gain: -4 },
        { buf: H.boom(`bmb${k}`, { f0: 62, f1: 42, sweep: 0.06, decay: 0.42, drive: 2.4, amount: -2.5 }), gain: -2 },
        { buf: H.strike(deepB), gain: -8 },
        { buf: H.strike(blast), gain: -5 },
        { buf: H.norm(H.luo(N.G2 * 1.5, D, { big: true, glide: -4.5, gt: 0.25, t60: 2.4, seed: `bml${k}`, knock: -10 })), at: 0.005, gain: -4 },
        { buf: H.mono(await H.bo({ len: 1.8, t60: 1.0, seed: `bmo${k}`, semis: -1 })), at: 0.008, gain: -5 },
        { buf: H.mono(await H.gongRec(-5, 2.4, 1.8)), at: 0.006, gain: -9 },
        { buf: H.strike(smash), at: 0.01, gain: -6 },
        { buf: H.strike(await H.ld(X.debrisBig, 0.05 + k * 0.4, 2.6 + k * 0.4, { hp: 80 })), at: 0.08, gain: -9 },
        { buf: H.norm(wave), gain: -10 },
        { buf: H.norm(lib.automate(H.sizzle(1.4, { seed: `bmz${k}`, density: 300, buzz: -10 }), (t) => Math.min(1, t / 0.02) * Math.exp(-t * 3))), gain: -14 },
        { buf: H.norm(H.rumble(D, `bmr${k}`, { lp: 200, t60: 2.0 })), gain: -12 },
        { buf: H.lux(`bmx${k}`), gain: -13 },
      ], { length: D });
      const e = lib.eq(v, [{ type: 'hp', f: 32, order: 2 }, { type: 'lowshelf', f: 70, gain: -3.5 }, { type: 'peak', f: 2000, gain: 2, q: 0.7 }, { type: 'highshelf', f: 5000, gain: 2 }]);
      bm.push(H.shape(H.cut(H.verb(e, 'urban', 0.22, 2.2, `bmv${k}`, 1), D, 0.4), -15, { max: 6 }));
    }
    await cat.add('yazi_ult_boom', bm, { lufs: -15, vol: 1.4, maxLimitDb: 6, spatial: true, channels: 1, range: [15, 160], voices: 2, pitch: [0.99, 1.01], priority: 3 });
    keep.boom = bm;
  }

  // yazi_ult_sheathe (1.3, the caster only; §1.12 release): 入鞘「咔」 the blade half home, then the deflating sigh (a hiss
  // falling 3 kHz -> 250 Hz, the beast's low exhale), the puppets falling back and burning into paper ash (flutters
  // thinning, the paper crackling, a soft flare), the small gong ringing it closed
  const ush = [];
  const ash = await H.ld(X.fireAsh, 3.0, 5.2, { hp: 400 });
  for (let k = 0; k < 2; k++) {
    const D = 2.4;
    const hiss = lib.automate(lib.sweep(lib.noise(1.8, { seed: `ush${k}` }), 'bp', (t) => 3000 * (250 / 3000) ** (t / 1.8), { q: 1.0 }), (t) => Math.min(1, t / 0.12) * Math.exp(-t * 1.7));
    const flutters = lib.mix([0, 0.06, 0.13, 0.21, 0.3, 0.4].map((t, i) => ({ buf: H.hide(`ushf${k}${i}`, { f: 1200 + i * 120, flutter: -4, rod: -14 }), at: 0.12 + t, gain: -8 - i * 1.5 })));
    const v = lib.mix([
      { buf: H.click(`usc${k}`, { dbl: 0.01, ring: -8, tock: -5, first: -4 }) },
      { buf: lib.thump({ f0: 160, f1: 80, sweep: 0.015, decay: 0.08, click: 0.2, drive: 1.4, seed: `ust${k}` }), gain: -10 },
      { buf: lib.stereoize(H.norm(hiss), { width: 0.5, hp: 300, seed: `ushs${k}` }), at: 0.05, gain: -11 },
      { buf: lib.stereoize(H.snort(`use${k}`, { dur: 1.0, decay: 0.7, attack: 0.08, flutter: 22, f1: 380, f2: 1100 }), { width: 0.3, hp: 400, seed: `uses${k}` }), at: 0.08, gain: -10 },
      { buf: lib.stereoize(H.norm(flutters), { width: 0.6, hp: 600, seed: `usfs${k}` }), gain: -6 },
      { buf: lib.stereoize(H.norm(lib.automate(ash, (t) => H.smooth(t / 0.3) * Math.exp(-t * 1.3))), { width: 0.6, hp: 800, seed: `usas${k}` }), at: 0.2, gain: -12 },
      { buf: lib.pan(H.norm(H.luo(N.G5 * 0.75, 1.6, { glide: 2, gt: 0.08, t60: 1.2, seed: `usl${k}`, knock: -20 })), 0.15), at: 0.35, gain: -17 },
    ], { channels: 2 });
    ush.push(H.cut(H.verb(v, 'urban', 0.14, 1.2, `usv${k}`), D, 0.35));
  }
  await cat.add('yazi_ult_sheathe', ush, { lufs: -17, vol: 1.2, spatial: false, channels: 2, voices: 1, pitch: [1, 1] });
  keep.ultSheathe = ush;

  // ③ yazi_ult_bed (§1.12 layer 3; 2D for the caster, starts 0.2 s in and plays out, at 0.8): the 北管 band, scored to the
  // beats (bed time = ult time - 0.2). A cello G2 swell and a D3 tremolo for the floor; the 堂鼓 rolling, faster and
  // faster, from the puppets to the draw; a suona holding D6 over the cuts, rising to G6; on each puppet cut 小鑼 「鏘↗」
  // and a choked 鈸 「七」 by turns; everything cut dead 20 ms before the draw (頓); the 拍板 「台」 on the draw; on the
  // impact 「匡！」: the big gong, the cymbal, the bass drum and the timpani, the suona wailing G6 and falling; the small
  // gong closing it at the sheathe; the gong and cymbals ringing out.
  let bed;
  {
    const D = 3.0, b = (t) => t - ULT.bed, parts = [];
    const stop = b(ULT.draw) - 0.02, hit = b(ULT.hit);
    const cello = await H.ld(X.celloG2, 0.3, 4.0, { stereo: true, hp: 45, semis: 1 });
    parts.push({ buf: H.env(cello, [[0, -40], [0.25, -12], [stop - 0.05, -6], [stop, -60]]), gain: -10 });
    parts.push({ buf: H.env(lib.slice(cello, 1.0, 3.8), [[0, -4], [0.6, -8], [1.6, -28], [1.8, -60]]), at: hit, gain: -9 });
    const trem = await H.ld(X.celloTremD3, 0.3, 2.5, { stereo: true, hp: 80 });
    parts.push({ buf: H.env(trem, [[0, -40], [0.2, -16], [stop - 0.05, -8], [stop, -60]]), gain: -12 });
    // the drum roll: accelerating 7 -> 18 strokes / s, swelling, alternate hands a little apart
    {
      let t = 0.02, i = 0;
      while (t < stop - 0.02) {
        const u = t / stop, rate = 9 + 15 * u * u;
        parts.push({ buf: lib.pan(await H.gu(`bdg${i}`, { semis: i % 2 ? 0.6 : 0 }), i % 2 ? 0.2 : -0.2), at: t, gain: -18 + 10 * u + (i % 2 ? -1.5 : 0) });
        t += 1 / rate; i++;
      }
    }
    // the cuts: 小鑼 / 鈸 by turns
    for (let i = 0; i < 6; i++) {
      const t = b(ULT.cut(i));
      if (i % 2 === 0) parts.push({ buf: lib.pan(H.luo(N.D6 * 0.75 * 2 ** (i / 24), 0.9, { glide: 3, gt: 0.06, t60: 0.6, seed: `bdl${i}` }), -0.25), at: t, gain: -12 + i * 0.4 });
      else parts.push({ buf: await H.bo({ len: 0.3, t60: 0.14, seed: `bdc${i}`, semis: i * 0.2 }), at: t, gain: -15 + i * 0.4 });
    }
    // the suona: D6 held over the cuts (a slow trill to F6 on the last two), up to G6 into the stop; the wail on the impact
    const s1 = H.suona([{ t: 0, d: 0.32, f: N.D6, scoop: 90, depth: 24 }, { t: 0.32, d: 0.06, f: N.F6, slide: 0.02 }, { t: 0.38, d: 0.06, f: N.D6, slide: 0.02 }, { t: 0.44, d: stop - b(ULT.seal) - 0.44, f: N.G6, slide: 0.08, depth: 30 }], { seed: 'bds1', len: stop - b(ULT.seal) + 0.06 });
    parts.push({ buf: lib.pan(H.env(s1, [[0, -2], [stop - b(ULT.seal) - 0.03, 0], [stop - b(ULT.seal), -60]]), 0.1), at: b(ULT.seal), gain: -9 });
    const s2 = H.suona([{ t: 0, d: 0.04, f: N.F6, scoop: 100 }, { t: 0.04, d: 0.5, f: N.G6, depth: 40, fall: 5, fallT: 0.5 }], { seed: 'bds2' });
    parts.push({ buf: lib.pan(s2, 0.1), at: hit + 0.02, gain: -8 });
    // 頓 -> the draw: the clapper 「台」
    parts.push({ buf: lib.pan(H.ban('bdban', { f: 1400 }), 0), at: b(ULT.draw), gain: -6 });
    // 「匡！」
    parts.push({ buf: lib.pan(H.luo(N.D3, 2.4, { big: true, glide: -4, gt: 0.3, t60: 2.4, seed: 'bdk' }), -0.1), at: hit, gain: -4 });
    parts.push({ buf: await H.gongRec(-7, 2.0, 1.8), at: hit, gain: -10 });
    parts.push({ buf: await H.bo({ len: 1.8, t60: 1.1, seed: 'bdk2' }), at: hit, gain: -6 });
    parts.push({ buf: lib.decay(H.strike(await H.ld(X.bdFff, 0.07, 3.0, { stereo: true, hp: 30, fadeOut: 0.5 })), 1.0, 0.03), at: hit, gain: -5 });
    parts.push({ buf: lib.decay(H.strike(await H.ld(X.timpAs2, 0, 3.0, { stereo: true, hp: 35, semis: -3, fadeOut: 0.5 })), 1.2, 0.05), at: hit, gain: -6 });
    // the sheathe: the small gong 「才」 and the clapper
    parts.push({ buf: lib.pan(H.luo(N.G5 * 0.75, 1.2, { glide: 2.5, gt: 0.06, t60: 0.9, seed: 'bdsh' }), 0.25), at: b(ULT.sheathe), gain: -13 });
    parts.push({ buf: lib.pan(H.ban('bdban2', { f: 1300 }), 0), at: b(ULT.sheathe), gain: -11 });
    let v = lib.mix(parts, { channels: 2, length: D });
    v = H.verb(v, 'warehouse', 0.16, 2.0, 'bedv');
    bed = H.shape(lib.fadeOut(lib.slice(v, 0, D), 0.7, 'exp'), -18);
    await cat.add('yazi_ult_bed', bed, { lufs: -18, vol: 1.3, spatial: false, channels: 2, voices: 1, pitch: [1, 1] });
    keep.bed = bed;
  }

  // the whole ultimate as the caster hears it at the handler's volumes (the spatial layers ~6 m away) — logged + previewed
  const at = (b, l, t, vol = 1) => ({ buf: H.atLufs(b, l), at: t, gainLin: vol });
  const tl = lib.mix([at(cast[0], -15, 0, 1.1), at(bed, -18, ULT.bed, 1.3 * 0.8), at(pup[0], -17, ULT.puppet, 1.35 * 0.8), at(sn[0], -17, ULT.suona, 1.3 * 0.9 * 0.8), at(seal[0], -16, ULT.seal, 1.3 * 0.8),
    ...Array.from({ length: 6 }, (_, i) => at(lib.varispeed(sl[i % 4], 0.9 + 0.05 * i), -17, ULT.cut(i), 1.2 * 0.7 * 0.8)), at(ui[0], -15, ULT.draw, 1.25),
    at(bm[0], -15, ULT.hit, 1.4 * 1.1 * 0.9), at(ush[0], -17, ULT.sheathe, 1.2 * 0.9)], { channels: 2 });
  const Lt = lib.loudness(tl);
  ctx.log(`  ult timeline: ${Lt.integrated.toFixed(1)} LUFS integrated, momentary max ${Lt.momentaryMax.toFixed(1)}, short-term max ${Lt.shortTermMax.toFixed(1)}, peak ${lib.lin2db(lib.peak(tl)).toFixed(1)} dBFS`);
  ctx.preview('ult_timeline', tl);
}

// ---------------------------------------------------------------------------------------------- the sabre's life
async function view(lib, ctx, cat, H, keep) {
  const src = await airSources(H);
  H.used.clear();
  // yazi_growl (低沉獸鼻息 on the first draw, 短獸吼 on the ready beat, after the vengeance cast; 2D): the 睚眥's snort and
  // a short snarl through its bronze throat, the dragon's chest under it
  const gr = [];
  for (let k = 0; k < 4; k++) {
    const r = H.rng(`gr${k}`), D = 0.95;
    const v = lib.mix([
      { buf: H.snort(`grs${k}`, { dur: 0.35, decay: 0.2 }), gain: -4 },
      { buf: H.norm(await H.beast(k, 0.85, { semis: -3.5 + r.range(-1, 1), seed: 'grb' })), at: 0.06 },
    ], { length: D });
    gr.push(H.shape(H.cut(lib.stereoize(H.verb(v, 'smallRoom', 0.12, 0.6, `grv${k}`, 1), { width: 0.25, hp: 700, seed: `grst${k}` }), D, 0.4), -18));
  }
  await cat.add('yazi_growl', gr, { lufs: -18, vol: 1.1, spatial: false, channels: 2, voices: 1, pitch: [0.97, 1.03] });
  keep.growl = gr;

  // yazi_idle (loop; played at 0.07 with a 0.4 s fade-in): §1.12 idle hum — G1 / G2 / D3 through a tube, a 400-1200 Hz
  // band swept by a 0.2 Hz LFO, the runes' G6 ring breathing at 0.5 Hz, the beast's slow breath twice a loop, a rare red
  // ember crackle. Periodic in 10 s; only the random textures go through the crossfade.
  {
    const P = 10, L = 11.5, q = (f) => H.onGrid(f, P), lfo = (t) => 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.2 * t);
    const W = 0.5, hum = lib.slice(lib.saturate(lib.mix([{ buf: lib.tone(W + P, { freq: q(N.G1) }) }, { buf: lib.tone(W + P, { freq: q(N.G2) }), gain: -3 }, { buf: lib.tone(W + P, { freq: q(N.D3) }), gain: -10 }, { buf: lib.tone(W + P, { freq: q(N.G3) }), gain: -16 }]), { drive: 3, type: 'tube' }), W, W + P);
    const runes = lib.automate(lib.mix([{ buf: lib.tone(P, { freq: q(N.G6) + 0.2 }) }, { buf: lib.tone(P, { freq: q(N.G6) - 0.2 }) }, { buf: lib.tone(P, { freq: q(N.G6 * 2.756) }), gain: -14 }]), (t) => 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 0.5 * t)) ** 2);
    const breath = lib.automate(lib.eq(lib.noise(P, { color: 'brown', seed: 'idb' }), [{ type: 'lp', f: 650, order: 2 }, { type: 'hp', f: 70, order: 2 }]), (t) => Math.max(0, Math.sin(2 * Math.PI * 0.2 * t)) ** 3);
    const band = lib.sweep(lib.noise(L, { color: 'pink', seed: 'idle_n' }), 'bp', (t) => 400 * Math.pow(3, lfo(t)), { q: 1.6 });
    const embers = lib.crackle(L, { density: 1.2, decay: 0.003, hp: 2500, minAmp: 0.3, seed: 'idle_e' });
    const texture = lib.loopCrossfade(lib.mix([{ buf: lib.stereoize(H.norm(band), { width: 0.35, hp: 250, seed: 'idle_st' }), gain: -9 }, { buf: lib.stereoize(H.norm(embers), { width: 0.6, hp: 2000, seed: 'idle_es' }), gain: -32 }], { channels: 2, length: L }), L - P);
    const wrapB = H.wrap(lib.mix([{ buf: breath }], { length: P }), P);
    const v = lib.mix([{ buf: H.norm(hum), gain: -4 }, { buf: lib.pan(H.norm(runes), 0.2), gain: -27 }, { buf: lib.stereoize(H.norm(wrapB), { width: 0.2, hp: 200, seed: 'idle_bs' }), gain: -16 }, { buf: texture }], { length: P, channels: 2 });
    H.seamCheck('yazi_idle', v, 5);
    await cat.add('yazi_idle', v, { lufs: -18, loop: true, spatial: false, channels: 2, voices: 1, pitch: [1, 1] });
  }

  // yazi_draw (0.35 s clip, cue 7 ms in): out of the scabbard at the left hip — the thumb's tick, a quick run of steel,
  // the blade swung across to rest (its air), the edge ringing, the grip's leather
  {
    const out = [];
    const lea = await H.ld(X.unholster2, 0, 0.45, { hp: 300 });
    for (let k = 0; k < 2; k++) {
      const D = 0.85;
      const v = lib.mix([
        { buf: H.click(`drc${k}`, { dbl: 0.01, ring: -14, tock: -9 }), gain: -10 },
        { buf: H.norm(H.saya(0.1, YA, { seed: `drs${k}`, ring: -5, t60: 0.8 })), at: 0.006, gain: -2 },
        { buf: H.panMove(H.norm(H.swoosh(0.35, 0.13, [280, 1100, 380], { q: 1.1, seed: `drw${k}` })), (t) => -0.4 + 0.6 * H.smooth(t / 0.25)), at: 0.03, gain: -8 },
        { buf: lea, gain: -16 },
        { buf: H.norm(H.blade(YA_LO, 0.9, { t60: 0.6, seed: `drl${k}` })), at: 0.11, gain: -16 },
      ], { channels: 2 });
      out.push(H.cut(H.verb(v, 'smallRoom', 0.12, 0.6, `drv${k}`), D, 0.4));
    }
    await cat.add('yazi_draw', out, { lufs: -19, vol: 1.1, spatial: false, channels: 2, voices: 1, pitch: [0.98, 1.02] });
  }

  // yazi_draw_first (cue 0.024 s into the 1.2 s first draw; the koiguchi 0.336, the unsheathe 0.396, the growl 0.72 and
  // the sting 0.84 are their own cues): the cinnabar scabbard rising from the lower left (the heavy cloth, the bronze
  // fittings and the tassel's beads), the blade's full roll after the draw (0.42-0.64: two passes of air and the red
  // trail's hiss), the eyes lighting and the runes running collar -> point (0.7-0.95: a climbing crimson sizzle and a
  // G tone rising to D)
  {
    const D = 1.25;
    const roll = lib.automate(H.whirr(0.3, () => 3.4, { seed: 'dfr', lo: 260, hi: 1100, ring: -6 }), (t) => H.smooth(t / 0.04) * (t > 0.24 ? Math.exp(-(t - 0.24) * 16) : 1));
    const runes = lib.fadeOut(lib.automate(lib.mix([{ buf: H.sizzle(0.6, { seed: 'dfz', density: 300, buzz: -14 }) }, { buf: lib.tone(0.6, { freq: (t) => N.G5 * 2 ** (7 * Math.min(1, t / 0.25) / 12) }), gain: -10 }]), (t) => H.smooth(t / 0.2) * (t > 0.25 ? Math.exp(-(t - 0.25) * 12) : 1)), 0.1, 'exp');
    const v = lib.mix([
      { buf: await H.ld(X.clothHeavy, 0, 0.5, { hp: 150, fadeOut: 0.25 }), gain: -12 },
      { buf: H.panMove(H.norm(H.swoosh(0.35, 0.16, [220, 800, 300], { q: 1.1, seed: 'dfw' })), (t) => -0.5 + 0.4 * H.smooth(t / 0.3)), gain: -11 },
      { buf: lib.pan(H.norm(H.K.jingle(0.22, 5, 'dfj')), -0.35), at: 0.2, gain: -19 },
      { buf: lib.pan(H.strike(await H.ld(X.woodL(2), 0, 0.2, { hp: 400 })), -0.35), at: 0.27, gain: -16 },
      { buf: lib.stereoize(H.norm(roll), { width: 0.4, hp: 400, seed: 'dfrs' }), at: 0.42, gain: -9 },
      { buf: lib.stereoize(H.norm(lib.automate(H.sizzle(0.3, { seed: 'dft', density: 200 }), (t) => H.smooth(t / 0.05) * Math.exp(-t * 7))), { width: 0.6, hp: 2000, seed: 'dfts' }), at: 0.44, gain: -20 },
      { buf: lib.stereoize(H.norm(runes), { width: 0.4, hp: 1500, seed: 'dfrz' }), at: 0.7, gain: -16 },
    ], { channels: 2 });
    await cat.add('yazi_draw_first', H.cut(H.verb(v, 'smallRoom', 0.12, 0.8, 'dfv'), D, 0.3), { lufs: -19, vol: 1.1, spatial: false, channels: 2, voices: 1, pitch: [1, 1] });
  }

  // yazi_first_sting (0.84 s into the first draw): 亮相「八—匡」 — the clapper (「八」), a breath, then the opera's 匡: the
  // big gong bending down on G3 with the cymbal and the drum, the sabre ringing G over it, a low drum under all
  {
    const D = 2.6, K2 = 0.24;
    const v = lib.mix([
      { buf: lib.pan(H.ban('fsb', { f: 1350 }), 0), gain: -3 },
      { buf: lib.pan(H.luo(N.G3, 2.3, { big: true, glide: -3.5, gt: 0.3, t60: 2.2, seed: 'fsl' }), -0.1), at: K2, gain: -2 },
      { buf: await H.gongRec(-2, 2.2, 1.8), at: K2, gain: -11 },
      { buf: await H.bo({ len: 1.6, t60: 1.0, seed: 'fsc' }), at: K2, gain: -6 },
      { buf: lib.pan(await H.gu('fsg', { semis: -2, ring: 0.3 }), 0), at: K2, gain: -6 },
      { buf: lib.decay(H.strike(await H.ld(X.bdMuted, 0.07, 1.8, { stereo: true, hp: 35 })), 0.6, 0.03), at: K2, gain: -8 },
      { buf: lib.pan(H.norm(H.blade(YA, 2.0, { t60: 1.6, bright: 1, seed: 'fsr' })), 0.25), at: K2 + 0.01, gain: -9 },
      { buf: lib.pan(H.norm(H.blade(YA_LO, 2.0, { t60: 1.4, seed: 'fsr2' })), -0.25), at: K2 + 0.012, gain: -13 },
    ], { channels: 2 });
    await cat.add('yazi_first_sting', H.shape(H.cut(H.verb(v, 'warehouse', 0.18, 1.8, 'fsv'), D, 0.35), -18), { lufs: -18, vol: 1.2, spatial: false, channels: 2, voices: 1, pitch: [1, 1] });
  }

  // yazi_inspect (cue 0.35 s into the 4.4 s inspect, §1.12 檢視: an original 南管-style phrase on G 羽): the 拍板 opens
  // it with the pipa climbing G4 B♭4 C5 into a tremolo D5 while the light runs down the temper line, the 洞簫 enters
  // under it on D5; the pipa answers F5 D5 C5 (the sheathe / koiguchi / draw are their own cues), a soft whirr as the
  // blade spins in the fingers (1.94-2.64), the phrase settles on G (the clapper, the pipa's G4 + G3), and as the 睚眥's
  // eyes light (3.25) a 碰鈴 「叮」 over the sabre's ring
  {
    const D = 4.1;
    const v = lib.mix([
      { buf: lib.pan(H.ban('inb1', { f: 1300 }), 0), gain: -8 },
      { buf: lib.pan(H.pipa(N.G4, 1.6, { seed: 'inp1' }), -0.2), at: 0.0, gain: -4 },
      { buf: lib.pan(H.pipa(N.Bb4, 1.4, { seed: 'inp2' }), -0.15), at: 0.2, gain: -5 },
      { buf: lib.pan(H.pipa(N.C5, 1.4, { seed: 'inp3' }), -0.1), at: 0.4, gain: -5 },
      { buf: lib.pan(H.lun(N.D5, 0.65, { seed: 'inl1', rate: 15 }), -0.05), at: 0.6, gain: -5 },
      { buf: lib.pan(H.xiao(N.D5, 1.5, { seed: 'inx1' }), 0.25), at: 0.65, gain: -10 },
      { buf: lib.pan(H.pipa(N.F5, 1.2, { seed: 'inp4' }), 0), at: 1.3, gain: -5 },
      { buf: lib.pan(H.pipa(N.D5, 1.2, { seed: 'inp5' }), -0.05), at: 1.5, gain: -6 },
      { buf: lib.pan(H.pipa(N.C5, 1.4, { seed: 'inp6' }), -0.1), at: 1.7, gain: -6 },
      { buf: lib.pan(H.xiao(N.C5, 0.9, { seed: 'inx2' }), 0.25), at: 1.75, gain: -12 },
      { buf: lib.pan(H.norm(lib.automate(H.whirr(0.7, () => 1.43, { seed: 'inw', lo: 350, hi: 1300, ring: -6 }), (t) => H.smooth(t / 0.05) * (t > 0.6 ? Math.exp(-(t - 0.6) * 14) : 1))), 0.3), at: 1.94, gain: -17 },
      { buf: lib.pan(H.lun(N.Bb4, 0.4, { seed: 'inl2', rate: 14 }), -0.1), at: 2.1, gain: -7 },
      { buf: lib.pan(H.ban('inb2', { f: 1300 }), 0), at: 2.62, gain: -9 },
      { buf: lib.pan(H.pipa(N.G4, 1.6, { seed: 'inp7', t60: 1.8 }), -0.15), at: 2.62, gain: -4 },
      { buf: lib.pan(H.pipa(N.G3, 1.6, { seed: 'inp8', t60: 2.0 }), -0.25), at: 2.63, gain: -7 },
      { buf: lib.pan(H.xiao(N.G4, 1.2, { seed: 'inx3', rel: 0.6 }), 0.25), at: 2.66, gain: -13 },
      { buf: lib.pan(H.norm(H.ling(N.D7, 0.9, { t60: 1.0, seed: 'inl' })), 0.1), at: 3.25, gain: -10 },
      { buf: lib.pan(H.norm(H.blade(YA, 0.9, { t60: 0.7, seed: 'inr' })), -0.1), at: 3.26, gain: -18 },
    ], { channels: 2 });
    await cat.add('yazi_inspect', H.cut(H.verb(v, 'warehouse', 0.2, 1.8, 'inv'), D, 0.2), { lufs: -20, vol: 1.2, spatial: false, channels: 2, voices: 1, pitch: [1, 1] });
  }

  // yazi_flick (血振り: the recover's flick, the rare idle; at the downward snap): the blade snapped down hard (a short
  // sharp pass), the blood leaving it, the drops spattering the street a moment later
  {
    const out = [];
    const pats = [await H.ld(X.wetSplat1, 0.06, 0.49, { hp: 400 }), await H.ld(X.wetSplat2, 0.01, 0.4, { hp: 400 })];
    await airSources(H);
    for (let k = 0; k < 3; k++) {
      const r = H.rng(`fk${k}`), D = 0.75;
      const drops = lib.mix([0, 0.025, 0.06].map((t, i) => ({ buf: lib.varispeedSemis(H.strike(pats[(k + i) % 2]), 3 + i * 2 + r.range(0, 2)), at: t, gain: -i * 3 })));
      const v = lib.mix([
        H.alignAt(lib.varispeedSemis(src.air[(k + 4) % src.air.length], 2 + r.range(-0.5, 0.5)), 0.03, -2),
        { buf: H.norm(H.swoosh(0.25, 0.03, [600, 2600, 900], { q: 1.4, color: 'white', seed: `fkh${k}`, rise: 2, fall: 9 })), gain: -9 },
        { buf: H.norm(H.spray(0.2, `fks${k}`, { t60: 0.12, f: 3000 })), at: 0.03, gain: -14 },
        { buf: lib.stereoize(H.norm(drops), { width: 0.5, hp: 500, seed: `fkd${k}` }), at: 0.14 + k * 0.03, gain: -12 },
      ], { channels: 2 });
      out.push(H.cut(H.verb(v, 'smallRoom', 0.1, 0.5, `fkv${k}`), D, 0.4));
    }
    await cat.add('yazi_flick', out, { lufs: -20, vol: 1.1, spatial: false, channels: 2, voices: 1, pitch: [0.97, 1.03] });
  }

  // yazi_recover (收招, 0.9 s into the 1.6 s clip, with the half sheathe): the blade laid back across the lower frame —
  // the grip's leather turning in the hand, the ring pommel's tassel swinging (its beads), a soft ring, a breath of cloth
  {
    const out = [];
    for (let k = 0; k < 3; k++) {
      const D = 1.0;
      const v = lib.mix([
        { buf: await H.ld(X.cloth, 0, 0.34, { hp: 150 }), gain: -10 },
        { buf: H.panMove(H.norm(H.swoosh(0.4, 0.15, [250, 700, 300], { q: 1, seed: `rcw${k}` })), (t) => 0.3 - 0.4 * H.smooth(t / 0.3)), gain: -12 },
        { buf: lib.pan(H.norm(H.K.jingle(0.25, 5, `rcj${k}`)), 0.3), at: 0.08, gain: -16 },
        { buf: lib.pan(H.norm(H.blade(YA, 0.9, { t60: 0.6, seed: `rcr${k}` })), 0.2), at: 0.1, gain: -18 },
      ], { channels: 2 });
      out.push(H.cut(H.verb(v, 'smallRoom', 0.12, 0.6, `rcv${k}`), D, 0.4));
    }
    await cat.add('yazi_recover', out, { lufs: -21, vol: 1.1, spatial: false, channels: 2, voices: 1, pitch: [0.98, 1.02] });
  }
}

// ---------------------------------------------------------------------------------------------- other
async function other(lib, ctx, cat, H, keep) {
  // ready_yazi: §1.12 unique ready — 「喀—鏘↗」: the 睚眥's bronze jaw snapping open, the small opera gong struck and bending
  // up a minor third (no other weapon has it), a 碰鈴 glint over it, the beast's short snarling breath under it, the
  // crimson current flickering (it repeats softly every 2.5 s)
  {
    const D = 1.6;
    const v = lib.mix([
      { buf: lib.pan(H.click('rdj', { f: N.G4, dbl: 0.01, ring: -8, tock: -3, first: 0 }), 0) },
      { buf: lib.pan(H.norm(H.luo(N.D6, 1.5, { glide: 3.2, gt: 0.07, t60: 1.2, seed: 'rdl', knock: -12 })), 0.12), at: 0.025, gain: 0 },
      { buf: lib.pan(H.norm(H.ling(N.G7, 1.2, { t60: 0.9, seed: 'rdg', tick: -20 })), -0.25), at: 0.028, gain: -15 },
      { buf: lib.stereoize(H.norm(lib.eq(await H.beast(5, 0.45, { semis: -2, seed: 'rdb' }), [{ type: 'hp', f: 180, order: 2 }])), { width: 0.3, hp: 600, seed: 'rdbs' }), at: 0.01, gain: -12 },
      { buf: lib.stereoize(H.norm(lib.automate(H.sizzle(0.6, { seed: 'rdz', density: 260 }), (t) => H.smooth(t / 0.02) * Math.exp(-t * 6))), { width: 0.6, hp: 2000, seed: 'rdzs' }), at: 0.02, gain: -20 },
      { buf: H.lux('rdx'), gain: -16 },
    ], { channels: 2 });
    const out = H.shape(H.cut(H.verb(v, 'warehouse', 0.18, 1.3, 'rdv'), D, 0.35), -18);
    await cat.add('ready_yazi', out, { lufs: -18, bus: 'ui', spatial: false, channels: 2, voices: 2, pitch: [1, 1], priority: 3 });
    keep.ready = out;
  }

  // yazi_crisis: 怒目 (§1.12 危機護甲: 瓷器碎裂＋元素尾音) — the blade tears itself out (a crack, a run of steel) and
  // cuts all round in one turn (a whirl of air circling), the ring of red light (the sizzle racing out), the glaze
  // shattering (a plate and glass breaking, shards), and the crimson tail: the beast's snarl, the big gong bending down
  {
    const out = [];
    for (let k = 0; k < 2; k++) {
      const D = 2.0, B = 0.09;
      const turn = lib.automate(H.whirr(0.5, (t) => 2 + 2 * t, { seed: `crw${k}`, lo: 320, hi: 1300, ring: -5 }), (t) => H.smooth(t / 0.03) * (t > 0.4 ? Math.exp(-(t - 0.4) * 12) : 1));
      const v = lib.mix([
        { buf: H.click(`crc${k}`, { dbl: 0.008, ring: -12, tock: -6, first: 0 }), gain: -6 },
        { buf: H.norm(H.saya(0.06, YA, { seed: `crs${k}`, ring: -6, t60: 0.6, glide: 0.12 })), at: 0.004, gain: -6 },
        { buf: H.norm(turn), at: 0.04, gain: -4 },
        { buf: H.strike(await H.ld(X.plate, 0.02, 1.08, { hp: 250, semis: k ? 1 : 0 })), at: B, gain: -1 },
        { buf: H.strike(await H.ld(X.glassBreak, 0.3, 1.3, { hp: 400, semis: -2 })), at: B + 0.02, gain: -6 },
        { buf: H.strike(await H.ld(X.shard, 0.01, 0.33, { hp: 1500 })), at: B + 0.07, gain: -10 },
        { buf: H.boom(`crb${k}`, { f0: 105, f1: 45, decay: 0.4, drive: 2.3 }), at: B, gain: -3 },
        { buf: H.norm(lib.automate(H.sizzle(1.2, { seed: `crz${k}`, density: 320, buzz: -10 }), (t) => Math.min(1, t / 0.01) * Math.exp(-t * 3))), at: B, gain: -11 },
        { buf: H.norm(await H.beast(k + 1, 0.9, { semis: -5, seed: 'crb' })), at: B + 0.12, gain: -9 },
        { buf: H.norm(H.luo(N.G3, 1.6, { big: true, glide: -3.5, gt: 0.3, t60: 1.6, seed: `crl${k}` })), at: B + 0.1, gain: -12 },
      ]);
      out.push(H.shape(H.cut(H.verb(v, 'alley', 0.15, 1.3, `crv${k}`, 1), D, 0.4), -16));
    }
    await cat.add('yazi_crisis', out, { lufs: -16, vol: 1.3, spatial: true, channels: 1, range: [4, 60], voices: 2, pitch: [0.98, 1.02] });
  }

  // yazi_final (KE_FINAL, at the body; its puppet cuts 0.25 s later with _ult_slash): a puppet swordsman propped up over
  // the body (a hide slap, its rod, the air), the small 報 seal flashing over it (小鑼「鏘↗」, a stamp), the pillar of
  // red light dropping (a falling roar, the sizzle), a low blow
  {
    const out = [];
    for (let k = 0; k < 2; k++) {
      const D = 1.8;
      const pillar = lib.automate(lib.sweep(lib.noise(0.9, { color: 'pink', seed: `fnp${k}` }), 'bp', (t) => 2400 * (260 / 2400) ** Math.min(1, t / 0.22), { q: 0.8 }), (t) => Math.min(1, t / 0.01) * Math.exp(-t * 4.5));
      const v = lib.mix([
        { buf: H.hide(`fnh${k}`, { f: 1500, rod: -6 }), gain: -5 },
        { buf: H.norm(H.swoosh(0.4, 0.08, [300, 1400, 600], { q: 1, seed: `fnw${k}` })), gain: -8 },
        { buf: H.norm(H.luo(N.D6 * 0.75, 1.4, { glide: 3, gt: 0.07, t60: 1.1, seed: `fnl${k}` })), at: 0.02, gain: -4 },
        { buf: H.stamp(`fns${k}`, { size: 1.0 }), at: 0.02, gain: -9 },
        { buf: H.norm(pillar), at: 0.02, gain: -6 },
        { buf: H.norm(lib.automate(H.sizzle(1.2, { seed: `fnz${k}`, density: 250, buzz: -12 }), (t) => Math.min(1, t / 0.02) * Math.exp(-t * 3.5))), at: 0.02, gain: -11 },
        { buf: H.boom(`fnb${k}`, { f0: 90, f1: 45, decay: 0.35, drive: 2 }), at: 0.02, gain: -10 },
      ]);
      out.push(H.shape(H.cut(H.verb(lib.eq(v, [{ type: 'hp', f: 40, order: 2 }]), 'urban', 0.16, 1.3, `fnv${k}`, 1), D, 0.4), -17, { max: 6 }));
    }
    await cat.add('yazi_final', out, { lufs: -17, vol: 1.45, spatial: true, channels: 1, range: [8, 100], voices: 1, pitch: [0.99, 1.01] });
  }
}

/** 睚眥．白刃 twin cues (§1.12 雙生版: the originals -4 st with an echo, colder); a twin handler would play `${cue}_white`. */
async function twins(lib, ctx, cat, H, keep) {
  const T = (b) => H.twin(b);
  await cat.add('ready_yazi_white', T(keep.ready), { from: 'ready_yazi', lufs: -18, bus: 'ui', spatial: false, channels: 2, voices: 2, pitch: [1, 1], priority: 3, note: 'twin: ready_yazi -4 st + echo' });
  await cat.add('yazi_swing_white', keep.swing.slice(0, 4).map((b) => H.shape(lib.fadeOut(lib.slice(T(b), 0, 0.9), 0.3, 'exp'), -16)), { from: 'yazi_swing', lufs: -16, spatial: false, channels: 2, voices: 3, pitch: [0.98, 1.02], maxHeadMs: 50, note: 'twin: yazi_swing -4 st + echo' });
  await cat.add('yazi_swing_heavy_white', keep.heavy.slice(0, 2).map((b) => H.shape(lib.fadeOut(lib.slice(T(b), 0, 1.2), 0.35, 'exp'), -15)), { from: 'yazi_swing_heavy', lufs: -15, spatial: false, channels: 2, voices: 2, pitch: [0.98, 1.02], maxHeadMs: 80 });
  await cat.add('yazi_issen_ring_white', T(keep.ring[0]), { from: 'yazi_issen_ring', lufs: -18, vol: 1.3, spatial: false, channels: 2, voices: 1, pitch: [1, 1] });
  await cat.add('yazi_ult_cast_white', H.shape(T(keep.cast[0]), -15), { from: 'yazi_ult_cast', lufs: -15, vol: 1.1, spatial: true, channels: 1, range: [10, 120], voices: 2, pitch: [1, 1], priority: 3, maxHeadMs: 80 });
  await cat.add('yazi_ult_boom_white', H.shape(T(keep.boom[0]), -15, { max: 6 }), { from: 'yazi_ult_boom', lufs: -15, vol: 1.4, maxLimitDb: 6, spatial: true, channels: 1, range: [15, 160], voices: 2, pitch: [1, 1], priority: 3 });
  await cat.add('yazi_ult_bed_white', T(keep.bed), { from: 'yazi_ult_bed', lufs: -18, vol: 1.3, spatial: false, channels: 2, voices: 1, pitch: [1, 1] });
  await cat.add('yazi_ult_sheathe_white', T(keep.ultSheathe[0]), { from: 'yazi_ult_sheathe', lufs: -17, vol: 1.2, spatial: false, channels: 2, voices: 1, pitch: [1, 1] });
}

/** Reference mixes as the player hears them (logged + previewed, not shipped). */
function references(lib, ctx, H, keep) {
  const at = (b, l, t, vol = 1) => ({ buf: H.atLufs(b, l), at: t, gainLin: vol });
  const log = (name, b) => { const L = lib.loudness(b); ctx.log(`  ${name}: ${L.integrated.toFixed(1)} LUFS integrated, momentary max ${L.momentaryMax.toFixed(1)}, short-term max ${L.shortTermMax.toFixed(1)}, peak ${lib.lin2db(lib.peak(b)).toFixed(1)} dBFS`); ctx.preview(name, b); };
  if (keep.swing && keep.heavy && keep.hit && keep.flesh && keep.kill) {
    // 三段斬 at the chain limit: 袈裟 at 0, 橫 at 0.38, 兜割 at 0.76 (swing cue at t0 + hit * 0.4, the bite at t0 + hit),
    // two bodies a cut, a kill on 橫 and the cleave; 收招 at 1.36 (the flick 0.24 * 1.6 in, the half sheathe 0.88 in)
    const parts = [];
    for (const [i, [t0, h]] of [[0, 0.14], [0.38, 0.14]].entries()) {
      parts.push(at(keep.swing[i], -16, t0 + h * 0.4, 0.9), at(keep.hit[i], -16, t0 + h, 0.8), at(keep.flesh[i], -17, t0 + h, 0.7), at(keep.flesh[i + 1], -17, t0 + h + 0.015, 0.6));
      if (i === 1) parts.push(at(keep.kill[0], -19, t0 + h, 1.4 * 0.6));
    }
    const t2 = 0.76;
    parts.push(at(keep.heavy[0], -15, t2 + 0.1, 0.9), at(keep.hit[2], -16, t2 + 0.25, 1), at(keep.flesh[2], -17, t2 + 0.25, 0.7), at(keep.kill[1], -19, t2 + 0.25, 1.4 * 0.6), at(keep.kill[2], -19, t2 + 0.29, 1.4 * 0.6));
    if (keep.sheathe) parts.push(at(keep.sheathe[0], -18, 1.36 + 0.88, 1.1 * 0.9));
    log('combo_timeline', lib.mix(parts, { channels: 2 }));
  }
  if (keep.unsheathe && keep.charge && keep.issen && keep.ring && keep.burst) {
    // 居合: the stance (the unsheathe at 1.2 / 0.5, home at 0.15), the charge loop at 0.45 (rate 0.8 -> 1.25 over 1.2 s),
    // the stages at 0.55 / 0.95 / 1.35 (+ the koiguchi), released at 1.6: the draw, its ring 0.05 later, three pass cuts,
    // the bite on the far side (0.15 s) and the burst 0.12 s after it
    const c = keep.charge, rate = [[0, 0.8], [1.2, 1.25], [6, 1.25]];
    const cl = lib.automate(lib.varispeedCurve(lib.concat([c, c]), rate), (t) => (t < 1.45 ? 1 : Math.max(0, 1 - (t - 1.45) / 0.08)));
    const parts = [at(lib.varispeed(keep.unsheathe[0], 1.2), -18, 0, 1.1 * 0.5), at(keep.sheathe[0], -18, 0.15, 1.1 * 0.9), at(cl, -18, 0.15, 0.45),
      at(keep.stage[0], -18, 0.55, 1.2 * 0.6), at(lib.varispeed(keep.stage[1], 1.12), -18, 0.95, 1.2 * 0.6), at(lib.varispeed(keep.full[0], 1.24), -17, 1.35, 1.2 * 0.6), at(keep.koiguchi[0], -18, 1.35, 1.15 * 0.8),
      at(keep.issen[0], -15, 1.6, 1.12), at(keep.ring[0], -18, 1.65, 1.3 * 0.9), ...[1.66, 1.7, 1.73].map((t, i) => at(keep.flesh[i], -17, t, 0.6)),
      at(keep.hit[0], -16, 1.75, 1), at(keep.burst[0], -16, 1.87, 1.2 * 0.9)];
    log('iai_timeline', lib.mix(parts, { channels: 2 }));
  }
}

// ---------------------------------------------------------------------------------------------- producer
export async function produce(lib, ctx) {
  const only = process.env.YZ_ONLY ? new Set(process.env.YZ_ONLY.split(',').map((s) => s.trim())) : null;
  const want = (g) => !only || only.has(g);
  const cat = ctx.category('premium_yazi', { bus: 'sfx' });
  const H = kit(lib, ctx);
  // build log: the pre-shaping of each sound, "natural PLR -> shaped PLR" per variant (the drive is capped); every cue
  // credits the sources its layers loaded
  const add = cat.add.bind(cat), srcOf = {};
  cat.add = (name, v, o = {}) => {
    const s = H.shapeLog.splice(0);
    if (s.length) ctx.log(`  shape ${name} @${s[0][0]}: ${s.map((x) => `${x[1]}->${x[2]}`).join(' ')}`);
    const sources = [...new Set([...(o.sources || []), ...H.used, ...(o.from ? srcOf[o.from] || [] : [])])];
    H.used.clear();
    srcOf[name] = sources;
    if (o.from) { o = { ...o }; delete o.from; }
    return add(name, v, sources.length ? { ...o, sources } : o);
  };
  const keep = {};
  if (want('cuts') || want('twin')) await cuts(lib, ctx, cat, H, keep);
  if (want('hits')) await hits(lib, ctx, cat, H, keep);
  if (want('iai') || want('twin')) await iai(lib, ctx, cat, H, keep);
  if (want('venge')) await venge(lib, ctx, cat, H, keep);
  if (want('ult') || want('twin')) await ult(lib, ctx, cat, H, keep);
  if (want('view')) await view(lib, ctx, cat, H, keep);
  if (want('other') || want('twin')) await other(lib, ctx, cat, H, keep);
  if (want('twin')) await twins(lib, ctx, cat, H, keep);
  references(lib, ctx, H, keep);
  await cat.write();
}
