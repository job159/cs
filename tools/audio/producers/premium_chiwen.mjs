// 螭吻．吞潮 Chiwen Tidewarden (神兵 M07, docs/PREMIUM_WEAPONS.md M07 card + §1.12) — category 'premium_chiwen':
// every cue the weapon plays (def.sound 'chiwen' + game/src/weapons/premium/chiwen.js SFX), from CC0 recordings
// (tools/audio/sources.d/premium_chiwen.json: water, ice, porcelain, gong / opera cymbal, sea lion / tiger / didgeridoo
// roars, choir; + the shared FFSL / Kenney / Freesound inventory) and synthesis. Palette: a .308 battle rifle under a
// porcelain-and-ice shimmer; water (drops, bubbles, splashes, surf), ice (cracks, crystals), porcelain (glazed scale
// clinks, 開片 shatter), the 螭吻 voice (a sea lion / tiger / didgeridoo roar with a sung formant 吟), 北管 percussion
// (堂鼓 roll, 大鑼, 鈸, rising 小鑼) and a 南管 pipa + 洞簫 phrase. Key D (宮 pentatonic: D E F# A B) for every tuned part.
//
//   gun      chiwen_close / _tail / _far / _mech: Mosin 7.62x54 + AK 7.62x39 stacked, Tikka / M1917 .30 (FFSL near
//            takes) through the weapons kit (makeKit: same designClose / codecSafe / designTail / designFar as every
//            gun), + the §1.12 "貴氣瞬態" (6-10 kHz crystal sparkle, 30 ms, -12 dB) on the close and a faint ice glitter
//            in the street tail. chiwen_fire: the theme layer the handler plays at 0.3 on every shot (a glazed
//            porcelain chime tuned to the pentatonic + a water-drop plink = "水滴泛音").
//   hits     chiwen_hit (water splat, body / wall), chiwen_head (ice crack ping), chiwen_mark (寒潮「叮」),
//            chiwen_mark_burst (碎冰), chiwen_bead (回潮 water bead), chiwen_frost_kill (KE_FROST: 叮 + drops + crystals)
//   view     chiwen_idle (loop: 55/82.5/110 Hz hum + a 400-1200 Hz band of noise swept at 0.2 Hz + trickling water,
//            §1.12 idle hum), chiwen_eyes, chiwen_scales (6 glazed scales clink tail -> head), chiwen_gurgle,
//            chiwen_roar_low (低沉龍吟), chiwen_draw_first (釉瓷輕響), chiwen_bubble, chiwen_splash, chiwen_tank,
//            chiwen_inspect (§1.12: an original 2-3 s 南管 phrase over a sea wash)
//   skills   chiwen_barrier (水幕反衝), chiwen_ray_start / _loop / _end (冰流光束: surf curl + jet + icy chord),
//            chiwen_orb_cast / _pulse (「嗡—咚」) / _burst
//   ult      §1.12 three layers: rise (chiwen_ult_inhale, 0.6 s) -> 40-60 Hz impact (inside chiwen_ult_roar, with the
//            龍吟 and the wave) -> 北管鑼鼓 + choir bed (chiwen_ult_bed, scored to the 3.7 s timeline) -> release
//            (chiwen_ult_end). Beats: chiwen_ult_vortex, _gulp (吞), _bite, _tail, _spit x3 (水爆), _fall.
//   other    ready_chiwen (unique ready, §1.12: a short sung dragon cry with water), chiwen_crisis (瓷器碎裂 + a water
//            vortex tail), chiwen_final (KE_FINAL water column)
//   twin     <cue>_searing for 螭吻．焚海 (ready, fire, ult inhale / roar / bed / end): the originals -4 semitones, darker,
//            with an echo (§1.12). Not played yet (the twin is not built); the handler should prefer `${name}_searing`.
//
// Mastering: every file within 1 LU of its target at <= -1 dBTP (decoded). Pre-shaping soft-clips at most ~3-5 dB of
// drive (the build log prints "natural -> shaped PLR" per sound); peaky cues (chimes, transient impacts) are mastered
// lower and lifted with the manifest vol (<= 1.5) instead of being crushed. The summed ultimate sits ~3 dB (momentary)
// over a sustained burst of the gun (logged as "ult timeline" vs "gun burst reference").
//
//   node --max-old-space-size=1536 tools/audio/build.mjs --only premium_chiwen
//   dev (a subset into a scratch folder — a subset run removes the other files of the folder it writes):
//   CF_AUDIO_OUT=tools/audio/out/chiwen-dev CHIWEN_ONLY=gun,ult node --max-old-space-size=1536 \
//     tools/audio/run-producer.mjs tools/audio/producers/premium_chiwen.mjs --spectrograms all
import { makeKit } from './weapons.mjs';

const SR = 48000;
const CLOSE_QUALITY = 0.6;   // as weapons.mjs: Vorbis q0.6 on close layers (less overshoot on the crack)

// ---------------------------------------------------------------------------------------------- sources
const X = {
  // gun (FFSL near / mid takes)
  mosin: 'ffsl/Mosin Nagant/M_21P', mosinMid: 'ffsl/Mosin Nagant/M_26P', ak: 'ffsl/AK-47/C_28P',
  tikka: 'ffsl/Tikka/W_29P', tikkaMid: 'ffsl/Tikka/W_24P', m1917: 'ffsl/1917/B_24P', akCock: 'fs:675008',
  // water
  bigSplash: 'fs:442773', splash: 'fs:212143', rockSplash: 'fs:583348', tinySplash: 'fs:321490', plop: 'fs:178732',
  waterBullet: 'fs:672574', squish: 'fs:737232', drop: 'fs:683102', dropSplash: 'fs:451126', bubbles: 'fs:539823',
  gurgling: 'fs:213566', gargleUw: 'fs:119915', hose: 'fs:754321', surf: 'fs:482855', crash: 'fs:376799', pour: 'fs:173930',
  // ice / glass / porcelain
  iceCrack: 'fs:342546', iceBreak: 'fs:329744', iceCubes: 'fs:119917', shard: 'fs:203381', mug: 'fs:530233',
  cup: 'fs:389432', plate: 'fs:565642', glassL: (k) => `kenney_impact/Audio/impactGlass_light_00${k}`, bone: 'fs:355052',
  // voices / music
  seaLion: 'fs:849186', tiger: 'fs:263115', didg: 'fs:204912', gong: 'fs:127265', cymbal: 'fs:452400', taiko: 'fs:486141',
  choirA: 'fs:764329', choirO: 'fs:764339', cloth: 'fs:494797', unholster: 'fs:377145',
};
// 宮 pentatonic on D (Hz)
const N = { A4: 440, B4: 493.9, D5: 587.3, E5: 659.3, Fs5: 740, A5: 880, B5: 987.8, D6: 1174.7, Fs6: 1480, A6: 1760, B6: 1975.5, D7: 2349.3, E7: 2637, Fs7: 2960, A7: 3520 };

// Lost Town street for a full-power rifle: a bit longer and later than 'urban' (rolling echo between the shopfronts)
const TIDE_STREET = {
  length: 2.6, predelay: 0.02,
  echoes: { count: 18, t: [0.03, 0.85], gain: [0.18, 0.55], lp: [6000, 1600], spread: [0.003, 0.04], pan: 1 },
  tail: { rt60: 1.9, rtLow: 2.3, rtHigh: 0.6, gain: 0.5, start: 0.06, build: 0.15, lp: 3000, hp: 55 },
};

// ---------------------------------------------------------------------------------------------- gun recipe (weapons.mjs format)
// 螭吻 is a 7.62x51 battle rifle (FAL / SCAR-H class), 450 rpm x 46: heavier than the AK (rifle762), snappier than
// the bolt guns. Mosin near takes (full power) carry the boom, a quieter AK take stacked 1.2 ms behind thickens the
// mid bark; Tikka / M1917 (.30) takes vary the crack. Sub decays stay short (see weapons.mjs: long subs ring in auto).
const GUN = {
  name: 'chiwen',
  near: [
    [X.mosin, 1.034, { semis: 0.7, stack: [X.ak, 0.611, -7, 0.0012, 0.2] }],
    [X.tikka, 0.577, { semis: 0.5, ch: 0 }],
    [X.mosin, 5.020, { semis: 0.7, stack: [X.ak, 3.257, -7, 0.0012, 0.2] }],
    [X.m1917, 6.727, { semis: 0.9, ch: 1 }],
    [X.mosin, 9.156, { semis: 0.7, stack: [X.ak, 6.017, -7, 0.0012, 0.2] }],
    [X.tikka, 5.661, { semis: 0.5, ch: 1 }],
  ],
  mid: [[X.mosinMid, 1.134, { semis: 0.6 }], [X.tikkaMid, 0.751, { semis: 0.5 }], [X.mosinMid, 6.101, { semis: 0.6 }]],
  close: { bal: { sub: -10.5, low: -5, lowMid: -4, mid: -5.5, high: -9, air: -12.5 }, n: 6, direct: 0.12, len: 0.32, hp: 45,
    eq: [{ type: 'peak', f: 180, gain: 2.5, q: 0.9 }, { type: 'peak', f: 600, gain: 1, q: 1 }, { type: 'peak', f: 2700, gain: 2, q: 1.1 }],
    crack: -5, body: { f0: 210, f1: 92, sweep: 0.018, decay: 0.095, gain: -5 }, sub: { f0: 90, f1: 45, decay: 0.1, gain: -10 }, room: 0.17, width: 0.32, plr: 10.6,
    post: [{ type: 'peak', f: 1500, gain: 2.5, q: 0.6 }] },
  tail: { n: 4, len: 2.3, rec: 0, env: TIDE_STREET }, far: { n: 3, dist: 200, len: 2.4 },
};
const MECH = [[X.akCock, 0.15, 0.71, { mode: 'peak', post: 0.085, semis: -1.6 }], [X.akCock, 2.18, 2.77, { mode: 'peak', post: 0.085, semis: -1.9 }], [X.akCock, 4.40, 4.92, { mode: 'peak', post: 0.085, semis: -1.3 }]];

// ---------------------------------------------------------------------------------------------- toolkit
function kit(lib, ctx) {
  const { Buf } = lib;
  const K = makeKit(lib, ctx);
  const rng = (s) => ctx.rng(s);
  const norm = (b, db = -1) => lib.normalizePeak(b, db);
  const mono = (b) => (b.channels === 1 ? b : lib.toMono(b));
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
  const cut = (b, len, fade = 0.3) => lib.fadeOut(lib.slice(b, 0, Math.min(len, b.duration)), Math.min(len, b.duration) * fade, 'exp');
  const env = (b, pts) => lib.automate(b, pts);   // [[t, dB]...] or fn(t) -> linear
  const verb = (b, room, wet, len, seed, ch = 2) => lib.reverb(b, room, { wet, seed, length: len, channels: ch });
  /**
   * Pre-shape for the loudness stage: soft-clip to the peak-to-loudness ratio the target needs (<= ~1 dB limiting),
   * at most `max` dB of drive (deeper clipping squares the sub booms and buries the transients). A cue whose natural
   * PLR needs more is mastered lower and lifted with the manifest `vol` instead (the engine's master limiter is the
   * safety net for stacked peaks). Logs the clip depth: `shape(...)` callers can be audited in the build log.
   */
  const shapeLog = [];
  const shape = (b, lufs, o = {}) => {
    const plr0 = lib.truePeakDb(b) - lib.lufs(b), want = -2.3 - lufs;
    const out = plr0 <= want ? b : K.clipToPLR(b, want, { min: 0, max: 6, threshold: -6, ...o });   // (no clipping when not needed)
    shapeLog.push([lufs, Math.round(plr0 * 10) / 10, Math.round((lib.truePeakDb(out) - lib.lufs(out)) * 10) / 10]);
    return out;
  };
  const atLufs = (b, l) => lib.normalizeLufs(b, l, { ceiling: -1 });

  // ---- synthesis
  /** Minnaert bubble / drop: a sine whose pitch rises as the bubble closes. */
  const bubble = (f0, dur = 0.07, rise = 1.8, seed = 'b') => lib.mix([
    { buf: lib.applyEnv(lib.tone(dur, { freq: [[0, f0], [dur, f0 * rise]] }), lib.expEnv(dur, { attack: 0.0015, t60: dur * 0.85 })) },
    { buf: lib.noiseBurst({ dur: 0.008, decay: 0.002, hp: 2500, seed }), gain: -16 },
  ]);
  /** Scattered crystal pings (ice glitter / glaze shards). */
  function tinkles(dur, n, { lo = 2500, hi = 7000, t60 = 0.12, seed = 't', fall = 8, skew = 1.6 } = {}) {
    const r = rng(seed), parts = [];
    for (let i = 0; i < n; i++) {
      const base = lo * Math.pow(hi / lo, r.next()), at = Math.pow(r.next(), skew) * dur;
      const p = lib.partials(t60 * 3, { base, list: [[1, 1, t60], [2.41, 0.35, t60 * 0.6], [3.87, 0.18, t60 * 0.4]], seed: `${seed}${i}` });
      parts.push({ buf: p, at, gain: -r.next() * 9 - (at / dur) * fall });
    }
    return lib.mix(parts);
  }
  /** Karplus-Strong pluck (pipa): bright excitation, pick-position comb (nasal), tuned by a varispeed trim. */
  function ks(f, dur, { seed = 'ks', pick = 0.12, bright = 0.7, t60 = 1.4 } = {}) {
    const r = rng(seed);
    const P = Math.max(2, Math.floor(SR / f - 0.5)), fAct = SR / (P + 0.5);
    const n = Math.round(dur * SR * fAct / f) + 32, out = new Float32Array(n), line = new Float32Array(P);
    let s = 0;
    for (let i = 0; i < P; i++) { s += bright * ((r.next() * 2 - 1) - s); line[i] = s; }
    const ex = line.slice(), pk = Math.max(1, Math.round(P * pick));
    for (let i = 0; i < P; i++) line[i] = ex[i] - (i >= pk ? ex[i - pk] : 0);
    const g = Math.pow(10, -3 / (t60 * fAct));
    let idx = 0, prev = 0;
    for (let i = 0; i < n; i++) {
      const cur = line[idx], y = g * 0.5 * (cur + prev);
      prev = cur; line[idx] = y; out[i] = y; idx = (idx + 1) % P;
    }
    const b = lib.varispeed(new Buf([out], SR), f / fAct);
    return lib.fadeOut(lib.slice(b, 0, dur), Math.min(0.08, dur * 0.2), 'exp');
  }
  /** 琵琶 note: KS string + plectrum tick + body resonances. */
  const pipa = (f, dur, seed, o = {}) => lib.eq(lib.mix([
    { buf: norm(ks(f, dur, { seed, ...o })) },
    { buf: lib.noiseBurst({ dur: 0.006, decay: 0.0018, hp: 2200, lp: 9000, seed: seed + 'p' }), gain: -14 },
  ]), [{ type: 'hp', f: 150, order: 2 }, { type: 'peak', f: 320, gain: 3, q: 1 }, { type: 'peak', f: 1100, gain: 2, q: 1.2 }, { type: 'peak', f: 3200, gain: 3.5, q: 1.4 }, { type: 'lp', f: 9000, order: 2 }]);
  /** 洞簫: a breathy end-blown flute; fc(t) the pitch, vibrato fades in. */
  function xiao(dur, fc, seed) {
    const f = (t) => fc(t) * (1 + 0.005 * Math.sin(2 * Math.PI * 5.1 * t) * Math.min(1, t / 0.5));
    const body = lib.mix([
      { buf: lib.tone(dur, { freq: f }) }, { buf: lib.tone(dur, { freq: (t) => 2 * f(t) }), gain: -15 }, { buf: lib.tone(dur, { freq: (t) => 3 * f(t) }), gain: -24 },
      { buf: lib.sweep(lib.noise(dur, { color: 'pink', seed }), 'bp', (t) => 2 * f(t), { q: 2.5 }), gain: -16 },
      { buf: lib.noiseBurst({ dur: 0.08, attack: 0.01, decay: 0.06, bp: 2600, q: 1.2, seed: seed + 'c' }), gain: -18 },
    ]);
    return lib.applyEnv(body, lib.envCurve(dur, [[0, 0], [0.14, 0.65], [0.45, 1], [dur - 0.4, 0.85], [dur, 0]]));
  }
  /** Sung formant voice (the 螭吻 吟): saw + a sub-octave growl through three moving formants. */
  function voice(dur, fc, { seed = 'v', f1 = [[0, 450], [1, 650]], f2 = [[0, 900], [1, 1150]], f3 = 2500, vib = 0.012, growl = -12 } = {}) {
    const f = (t) => fc(t) * (1 + vib * Math.sin(2 * Math.PI * 5.4 * t) * Math.min(1, t / 0.3));
    const T = (pts) => { const g = lib.toFn(pts); return (t) => g(t / dur); };
    const src = lib.mix([{ buf: lib.tone(dur, { type: 'saw', freq: f }) }, { buf: lib.tone(dur, { type: 'saw', freq: (t) => f(t) * 0.5 }), gain: growl }]);
    const v = lib.mix([
      { buf: lib.sweep(src, 'bp', T(f1), { q: 5 }) },
      { buf: lib.sweep(src, 'bp', T(f2), { q: 7 }), gain: -3 },
      { buf: lib.eq(src, [{ type: 'bp', f: f3, q: 6 }]), gain: -12 },
    ]);
    return lib.saturate(v, { drive: 4, type: 'tube', mix: 0.5 });
  }
  /** 堂鼓 hit. */
  const drum = (seed, k = 1) => lib.mix([
    { buf: lib.thump({ f0: 200 * k, f1: 112 * k, sweep: 0.012, decay: 0.17, click: 0.3, drive: 1.4, seed }) },
    { buf: lib.noiseBurst({ dur: 0.07, decay: 0.035, bp: 1100, q: 1.1, seed: seed + 'n' }), gain: -11 },
  ]);
  /** Low impact (the 40-60 Hz layer): pitched-down thump with harmonics so laptop speakers carry it. */
  const boom = (seed, { f0 = 75, f1 = 42, sweep = 0.06, decay = 0.5, drive = 2.5 } = {}) => lib.psychoBass(lib.thump({ f0, f1, sweep, decay, click: 0.1, drive, seed }), { freq: 110, amount: -3.5 });
  /** Spray of droplets falling back (rain of drops after a splash). */
  const rain = (dur, seed, density = 90) => lib.applyEnv(lib.mix([
    { buf: lib.crackle(dur, { density, decay: 0.003, hp: 2200, minAmp: 0.15, seed }) },
    { buf: lib.eq(lib.noise(dur, { color: 'pink', seed: seed + 'h' }), [{ type: 'bp', f: 3500, q: 0.6 }]), gain: -14 },
  ]), lib.envCurve(dur, [[0, 0], [dur * 0.15, 1], [dur * 0.5, 0.6], [dur, 0]]));
  /** Twin (焚海) version: -4 st, darker, a dotted echo (§1.12 雙生版). */
  const twin = (b) => {
    let o = lib.varispeedSemis(b, -4);
    o = lib.eq(o, [{ type: 'lp', f: 7000, order: 2 }, { type: 'peak', f: 400, gain: 1.5, q: 0.8 }]);
    o = lib.saturate(o, { drive: 3, type: 'tube', mix: 0.35 });
    return lib.echo(o, { time: 0.19, feedback: 0.38, lp: 2600, hp: 180, mix: 0.42, pingpong: o.channels === 2, length: o.duration + 0.9 });
  };
  return { K, rng, norm, mono, ld, strike, cut, env, verb, shape, shapeLog, atLufs, bubble, tinkles, ks, pipa, xiao, voice, drum, boom, rain, twin };
}

// ---------------------------------------------------------------------------------------------- material banks
/** Porcelain mug strikes (fs:530233): each ring sliced to its next strike, with its fundamental (Hz). */
async function mugBank(lib, ctx, H) {
  const full = await ctx.load(X.mug, { start: 0.9, end: 10.6 });
  const m = H.mono(full);
  const on = lib.detectOnsets(m, { threshold: 12, floorDb: -30, minGap: 0.12 });
  const out = [];
  for (let i = 0; i < on.length; i++) {
    const s = Math.max(0, on[i] - 0.002), e = Math.min(m.duration, (on[i + 1] ?? m.duration) - 0.004, s + 0.6);
    let b = lib.eq(lib.slice(m, s, e), [{ type: 'hp', f: 700, order: 4 }]);
    b = lib.fadeOut(b, Math.min(0.06, b.duration * 0.3), 'exp');
    // fundamental: the strongest spectral peak 1.5-3 kHz
    const { freqs, power } = lib.averageSpectrum(b, { size: 8192 });
    let best = 0, f0 = 2200;
    for (let k = 1; k < power.length; k++) if (freqs[k] > 1500 && freqs[k] < 3000 && power[k] > best) { best = power[k]; f0 = freqs[k]; }
    out.push({ buf: H.norm(b), f0, dur: b.duration });
  }
  ctx.log(`  mug bank: ${out.length} strikes, f0 ${out.map((o) => o.f0.toFixed(0)).join(' ')}`);
  return out;
}
/** A mug strike retuned to `hz` (varispeed: a lower note rings longer, as a bigger bowl would). */
function chime(lib, mug, hz) { return lib.varispeed(mug.buf, hz / mug.f0); }

/** Single bubbles out of fs:539823 (Minnaert chirps), each sliced on its own. */
async function bubbleBank(lib, ctx, H) {
  const m = H.mono(await ctx.load(X.bubbles, { start: 0.15, end: 4.45 }));
  const on = lib.detectOnsets(m, { threshold: 8, floorDb: -26, minGap: 0.05 });
  const out = [];
  for (let i = 0; i < on.length; i++) {
    const s = Math.max(0, on[i] - 0.003), e = Math.min(m.duration, (on[i + 1] ?? m.duration) - 0.003, s + 0.16);
    if (e - s < 0.04) continue;
    const b = lib.fadeOut(lib.eq(lib.slice(m, s, e), [{ type: 'hp', f: 120, order: 2 }]), Math.min(0.03, (e - s) * 0.3), 'exp');
    out.push({ buf: H.norm(b), peak: lib.peak(lib.slice(m, s, e)) });
  }
  out.sort((a, b) => b.peak - a.peak);
  ctx.log(`  bubble bank: ${out.length} bubbles`);
  if (!out.length) throw new Error('no bubbles found in fs:539823');
  for (let i = 0; out.length < 16; i++) out.push(out[i]);   // the cues index up to 15
  return out;
}

// ---------------------------------------------------------------------------------------------- gun
async function gunSet(lib, ctx, cat, H) {
  const { K } = H, G = GUN;
  const near = G.near.map(([id, t, o = {}]) => ({ id, t, ...o }));
  const closes = [], tails = [], fars = [], srcIds = new Set(), preLog = [];
  // §1.12 貴氣瞬態: 6-10 kHz crystal sparkle, 30 ms, -12 dB under the blast's first 30 ms
  const sparkle = (close, seed) => {
    const r = H.rng(seed);
    const n = lib.eq(lib.noiseBurst({ dur: 0.045, attack: 0.0006, decay: 0.03, seed: seed + 'n' }), [{ type: 'hp', f: 6000, order: 4 }, { type: 'lp', f: 10000, order: 4 }]);
    const p = lib.partials(0.05, { base: r.range(6900, 7500), list: [[1, 1, 0.03], [1.19, 0.7, 0.025], [1.34, 0.5, 0.02]], seed: seed + 'p' });
    const s = lib.stereoize(lib.mix([{ buf: H.norm(n) }, { buf: H.norm(p), gain: -4 }]), { width: 0.45, hp: 3000, seed: seed + 's' });
    const g = K.rmsOf(lib.slice(close, 0, 0.033)) / Math.max(1e-9, K.rmsOf(lib.slice(s, 0, 0.03))) * lib.db2lin(-12);
    return lib.mix([{ buf: close }, { buf: s, gainLin: g, at: 0.003 }], { channels: 2 });
  };
  for (let k = 0; k < G.close.n; k++) {
    const s = near[k % near.length];
    const shot = await K.loadShot(s.id, s.t, Math.max(0.6, G.close.direct + 0.1), { semis: s.semis || 0, stack: s.stack });
    const base = k + Math.floor(k / near.length), ch = s.ch ?? base % 2;
    let best = null;
    for (let a = 0; a < 4; a++) {
      K.codecLog.length = 0;
      const m = await K.codecSafe(sparkle(K.designClose(G, shot, base + a * 101, ch), `spk${k}_${a}`), -12, { quality: CLOSE_QUALITY });
      const info = K.codecLog[0];
      const score = info.limitedDb + Math.max(0, info.decTp + 1.3) * 3 + (Math.abs(info.lufs + 12) > 0.25 ? 50 : 0);
      if (!best || score < best.score) best = { m, info, score, a };
      if (score <= 2) break;
    }
    preLog.push(`lim ${best.info.limitedDb} dTP ${best.info.decTp}`);
    closes.push(best.m);
    srcIds.add(s.id); if (s.stack) srcIds.add(s.stack[0]);
  }
  ctx.log(`  pre-master chiwen_close: ${preLog.join(' | ')}`);
  // tails: street reflections + a faint ice glitter in the air (frost hanging after the round, -18 dB)
  const singles = near.filter((s) => !s.burst);
  for (let k = 0; k < G.tail.n; k++) {
    const s = singles[k % singles.length];
    const shot = await K.loadShot(s.id, s.t, G.close.direct + G.tail.len + 0.1, { semis: s.semis || 0, stack: s.stack });
    const t = K.designTail(G, shot, k);
    const gl = H.verb(lib.mix([{ buf: H.tinkles(0.6, 8, { lo: 2800, hi: 6800, t60: 0.16, seed: `tg${k}` }) },
      { buf: lib.eq(lib.noiseBurst({ dur: 0.8, attack: 0.03, decay: 0.6, seed: `ta${k}` }), [{ type: 'hp', f: 5500, order: 2 }]), gain: -12 }]), 'warehouse', 0.55, 1.1, `tgr${k}`);
    const g = K.rmsOf(lib.slice(t, 0, 0.6)) / Math.max(1e-9, K.rmsOf(lib.slice(gl, 0, 0.6))) * lib.db2lin(-18);
    tails.push(lib.mix([{ buf: t }, { buf: gl, gainLin: g, at: 0.035 }], { length: t.duration, channels: 2 }));
  }
  const mid = G.mid.map(([id, t, o = {}]) => ({ id, t, ...o }));
  for (let k = 0; k < G.far.n; k++) {
    const s = mid[k % mid.length];
    const shot = await K.loadShot(s.id, s.t, Math.max(0.7, G.far.len + 0.1), { semis: s.semis || 0 });
    fars.push(K.designFar(G, shot, k, true));
    srcIds.add(s.id);
  }
  const sources = [...srcIds];
  ctx.preview('chiwen_shot', lib.mix([{ buf: H.atLufs(closes[0], -12) }, { buf: H.atLufs(tails[0], -20), at: 0.015, gainLin: 0.9 }], { channels: 2 }));
  // reference for the skills / ultimate: a 2 s burst at 450 rpm as the shooter hears it (close + tail 0.9 + mech 0.8)
  const burst = lib.mix(Array.from({ length: 15 }, (_, i) => [{ buf: H.atLufs(closes[i % closes.length], -12), at: i * 60 / 450 },
    { buf: H.atLufs(tails[i % tails.length], -20), at: i * 60 / 450 + 0.015, gainLin: 0.9 }]).flat(), { channels: 2 });
  const L = lib.loudness(burst);
  ctx.log(`  gun burst reference: ${L.integrated.toFixed(1)} LUFS integrated, momentary max ${L.momentaryMax.toFixed(1)}, short-term max ${L.shortTermMax.toFixed(1)}`);
  ctx.preview('chiwen_burst', burst);
  // _close spatial (teammates within 40 m play it positioned, see weapons.mjs); ref 12 m matches _far at 40 m
  await cat.add('chiwen_close', closes, { lufs: -12, quality: CLOSE_QUALITY, maxLimitDb: 6, limiter: { release: 0.02 }, spatial: true, range: [12, 60], channels: 2, voices: 6, pitch: [0.97, 1.03], priority: 3, sources, note: 'battle rifle + 貴氣瞬態 sparkle' });
  await cat.add('chiwen_tail', tails, { target: 'gunTail', spatial: false, channels: 2, voices: 3, pitch: [0.98, 1.02], sources });
  await cat.add('chiwen_far', fars, { target: 'gunFar', spatial: true, range: [40, 480], voices: 4, pitch: [0.95, 1.04], priority: 2, sources });
  const mech = [];
  for (const [id, a, z, o] of MECH) mech.push(lib.mix([{ buf: await K.grab(id, a, z, { hp: 250, ...o }), at: 0.01 }]));
  await cat.add('chiwen_mech', mech, { target: 'gunMech', spatial: false, channels: 1, voices: 3, pitch: [0.95, 1.05], maxHeadMs: 20, sources: [X.akCock] });
}

/** 潮彈 theme layer (2D, the handler plays it at 0.3 on every shot): a glazed chime + a water-drop plink. */
async function fireTheme(lib, ctx, cat, H, M, B) {
  const notes = [N.Fs6, N.A6, N.B6, N.D7, N.E7, N.Fs7];
  const out = [];
  for (const [k, hz] of notes.entries()) {
    const r = H.rng(`fire${k}`);
    const c = H.cut(chime(lib, M[(k * 5 + 4) % M.length], hz), 0.3, 0.5);
    const bub = lib.varispeedSemis(B[k % Math.min(6, B.length)].buf, r.range(6, 9));
    const splat = H.cut(await H.ld(X.waterBullet, 0, 0.05, { hp: 1800 }), 0.04, 0.6);
    let v = lib.mix([{ buf: H.norm(c) }, { buf: H.norm(bub), at: 0.01, gain: -5 }, { buf: splat, gain: -13 },
      { buf: H.tinkles(0.12, 3, { lo: 6000, hi: 9500, t60: 0.04, seed: `fs${k}` }), at: 0.004, gain: -16 }]);
    v = lib.eq(v, [{ type: 'hp', f: 450, order: 4 }]);   // nothing under the gun's body: an overtone, not a second thump
    v = lib.stereoize(v, { width: 0.3, hp: 1200, seed: `fst${k}` });
    v = H.verb(v, 'smallRoom', 0.22, 0.5, `fr${k}`);
    out.push(H.shape(H.cut(v, 0.34, 0.45), -18, { threshold: -3 }));
  }
  // a ringing chime is peaky (PLR ~17) and must not be clipped: mastered at -18 and lifted by vol 1.5; with the
  // handler's 0.3 it lands at ~-25 LUFS, ~13 dB (22 %) under the -12 LUFS shot (§1.12: 20-30 %)
  await cat.add('chiwen_fire', out, { lufs: -18, vol: 1.5, bus: 'sfx', spatial: false, channels: 2, voices: 4, pitch: [1, 1], sources: [X.mug, X.bubbles, X.waterBullet] });
  return out;
}

// ---------------------------------------------------------------------------------------------- hits
async function hits(lib, ctx, cat, H, M, B) {
  // chiwen_hit: a water round bursting on a body / wall (splat + spray + an ice tick), the 1.5 m splash of 潮彈
  const plops = [[X.waterBullet, 0, 0.16], [X.plop, 0.85, 0.953], [X.squish, 0, 0.42], [X.tinySplash, 0.255, 0.445], [X.plop, 0.95, 1.16], [X.waterBullet, 0, 0.16]];
  const sprays = [await H.ld(X.splash, 0, 0.14, { hp: 700 }), await H.ld(X.tinySplash, 0.255, 0.44, { hp: 900 }), await H.ld(X.bigSplash, 0, 0.3, { hp: 900 })];
  const ice = [await H.ld(X.iceCrack, 0.5, 0.65, { hp: 1500 }), await H.ld(X.iceCrack, 4.0, 4.14, { hp: 1500 }), await H.ld(X.iceCrack, 1.3, 1.42, { hp: 1500 })];
  const hit = [];
  for (const [k, [id, s, e]] of plops.entries()) {
    const r = H.rng(`hit${k}`);
    const body = lib.varispeedSemis(H.strike(await H.ld(id, s, e, { hp: 140 }), -8), k === 5 ? -3 : r.range(-1.5, 1.5));   // on the splat itself
    const v = lib.mix([{ buf: H.norm(body) }, { buf: H.strike(sprays[k % 3]), at: r.range(0.006, 0.015), gain: r.range(-9, -6) },
      { buf: H.strike(ice[k % 3]), at: 0.002, gain: -15 }, { buf: lib.thump({ f0: 190, f1: 95, decay: 0.06, click: 0, seed: `hth${k}` }), gain: -12 }]);
    hit.push(H.shape(H.cut(v, 0.36, 0.5), -20));
  }
  await cat.add('chiwen_hit', hit, { lufs: -20, vol: 1.4, spatial: true, range: [2, 40], voices: 4, pitch: [0.92, 1.08], sources: [X.waterBullet, X.plop, X.squish, X.tinySplash, X.splash, X.bigSplash, X.iceCrack] });

  // chiwen_head: the round cracks ice on the skull — a hard crack, a glass hit, a bright ring and a splat
  const head = [];
  for (let k = 0; k < 4; k++) {
    const r = H.rng(`head${k}`);
    const v = lib.mix([
      { buf: H.strike(ice[k % 3]) }, { buf: H.strike(await H.ld(X.glassL(k), 0, 0.25, { hp: 800 })), gain: -4 },
      { buf: H.cut(chime(lib, M[(k * 3 + 1) % M.length], [N.D7, N.E7, N.Fs7, N.A7][k]), 0.35, 0.6), at: 0.006, gain: -7 },
      { buf: H.strike(sprays[k % 3]), at: 0.008, gain: -9 }, { buf: lib.thump({ f0: 260, f1: 140, decay: 0.05, click: 0.2, seed: `hd${k}` }), gain: -12 },
    ]);
    head.push(H.shape(H.cut(H.verb(v, 'smallRoom', 0.15, 0.4, `hdr${k}`, 1), 0.45, 0.5), -19));
  }
  await cat.add('chiwen_head', head, { lufs: -19, vol: 1.35, spatial: true, range: [3, 50], voices: 3, pitch: [0.96, 1.04], sources: [X.iceCrack, X.glassL(0), X.mug, X.splash] });

  // chiwen_mark: 寒潮「叮」— a clear glazed ding with frost breathing round it (three scales start to circle)
  const mark = [];
  for (const [k, hz] of [N.A6, N.B6, N.D7, N.E7].entries()) {
    const c = chime(lib, M[[0, 1, 0, 1][k]], hz);   // the two isolated strikes ring longest
    const frost = lib.eq(lib.noiseBurst({ dur: 0.5, attack: 0.04, decay: 0.4, seed: `mf${k}` }), [{ type: 'hp', f: 5500, order: 2 }, { type: 'lp', f: 12000, order: 2 }]);
    const v = lib.mix([{ buf: H.norm(c) }, { buf: H.norm(chime(lib, M[1], hz * 2)), at: 0.012, gain: -14 }, { buf: frost, gain: -22 }, { buf: H.tinkles(0.35, 4, { lo: 4000, hi: 8000, t60: 0.08, seed: `mt${k}` }), at: 0.05, gain: -20 }]);
    mark.push(H.shape(H.cut(H.verb(v, 'warehouse', 0.18, 0.8, `mr${k}`, 1), 0.65, 0.5), -23, { threshold: -10 }));
  }
  // a pure ring (PLR ~20): mastered at -23 and lifted by vol 1.5 rather than limited; handler 0.5 -> ~-25.5 LUFS at 6 m
  await cat.add('chiwen_mark', mark, { lufs: -23, vol: 1.5, spatial: true, range: [6, 50], voices: 3, pitch: [0.99, 1.01], sources: [X.mug] });

  // chiwen_mark_burst: 碎冰 — the scales burst: ice breaking, shards, a frost-ring whump, crystal glitter
  // one decisive break each (the sources crack on for 0.5 s: cut to the first fracture, shards + glitter carry the tail)
  const breaks = [[X.iceBreak, 0.18, 0.42], [X.iceBreak, 2.04, 2.3], [X.iceCrack, 4.02, 4.3], [X.iceBreak, 1.03, 1.25], [X.iceCrack, 2.45, 2.68]];
  const burst = [];
  for (const [k, [id, s, e]] of breaks.entries()) {
    const r = H.rng(`mb${k}`);
    const v = lib.mix([
      { buf: H.strike(await H.ld(id, s, e, { hp: 500 })) },
      { buf: H.strike(await H.ld(X.shard, 0.01, 0.33, { hp: 1500, semis: r.range(-2, 2) })), at: 0.01, gain: -6 },
      { buf: H.strike(await H.ld(X.glassL((k + 2) % 5), 0, 0.25, { hp: 1000, semis: -3 })), gain: -7 },
      { buf: H.boom(`mbb${k}`, { f0: 150, f1: 62, sweep: 0.02, decay: 0.2, drive: 1.5 }), gain: -9 },
      { buf: lib.noiseBurst({ dur: 0.3, attack: 0.002, decay: 0.18, hp: 2500, lp: 12000, seed: `mbn${k}` }), gain: -10 },
      { buf: H.tinkles(0.5, 10, { lo: 3000, hi: 8000, t60: 0.1, seed: `mbt${k}` }), at: 0.03, gain: -9 },
    ]);
    burst.push(H.shape(H.cut(H.verb(v, 'alley', 0.16, 0.8, `mbr${k}`, 1), 0.85, 0.5), -19.5));
  }
  await cat.add('chiwen_mark_burst', burst, { lufs: -19.5, vol: 1.5, spatial: true, range: [3, 55], voices: 3, pitch: [0.95, 1.05], sources: [X.iceBreak, X.iceCrack, X.shard, X.glassL(2)] });

  // chiwen_bead: 回潮 — a water bead lifts off the kill and darts away: a bubbling plink + an upward water whoosh
  const bead = [];
  for (let k = 0; k < 4; k++) {
    const r = H.rng(`bead${k}`);
    const v = lib.mix([
      { buf: lib.varispeedSemis(B[(k + 2) % B.length].buf, 4 + k) }, { buf: H.bubble(r.range(900, 1300), 0.09, 2.2, `bd${k}`), at: 0.06, gain: -6 },
      { buf: lib.whoosh({ dur: 0.38, f0: 700, f1: 4200, q: 2.2, seed: `bw${k}` }), at: 0.05, gain: -5 },
      { buf: H.cut(chime(lib, M[(k + 3) % M.length], [N.B6, N.D7, N.E7, N.Fs7][k]), 0.25, 0.6), at: 0.16, gain: -14 },
    ]);
    bead.push(H.shape(H.cut(H.verb(v, 'smallRoom', 0.18, 0.4, `bdr${k}`, 1), 0.55, 0.4), -21.5));
  }
  await cat.add('chiwen_bead', bead, { lufs: -21.5, vol: 1.35, spatial: true, range: [2, 35], voices: 3, pitch: [0.96, 1.04], sources: [X.bubbles, X.mug] });

  // chiwen_frost_kill: KE_FROST — the frozen body SHATTERS into glaze shards: a hard ice / porcelain crack with a low
  // whump under it, a spray of glazed shards and glass, the 「叮」 on top, a few drops after (louder than the mark burst:
  // a kill that removes the body has to land)
  const fk = [];
  const cracks = [[X.iceBreak, 0.18, 0.42], [X.iceBreak, 2.04, 2.3], [X.iceCrack, 4.02, 4.3], [X.iceBreak, 1.03, 1.25], [X.iceCrack, 2.45, 2.68]];
  const cubes = [[1.38, 1.9], [4.66, 4.9], [5.85, 6.3], [2.86, 3.05], [1.6, 2.1]];
  for (const [k, [s, e]] of cubes.entries()) {
    const r = H.rng(`fk${k}`), [cid, c0, c1] = cracks[k];
    const v = lib.mix([
      { buf: H.strike(await H.ld(cid, c0, c1, { hp: 400, semis: r.range(-3, -1) })), gain: 0 },
      { buf: H.strike(ice[k % 3]), at: 0.004, gain: -4 },
      { buf: H.strike(await H.ld(X.glassL((k + 1) % 5), 0, 0.3, { hp: 800, semis: -2 })), at: 0.008, gain: -5 },
      { buf: H.strike(await H.ld(X.shard, 0.01, 0.33, { hp: 1200, semis: r.range(-1, 2) })), at: 0.02, gain: -6 },
      { buf: H.boom(`fkb${k}`, { f0: 140, f1: 55, sweep: 0.025, decay: 0.24, drive: 1.6 }), gain: -6 },
      { buf: H.strike(await H.ld(X.iceCubes, s, e, { hp: 900 })), at: 0.03, gain: -8 },
      { buf: H.tinkles(0.6, 12, { lo: 2600, hi: 8000, t60: 0.14, seed: `fkt${k}` }), at: 0.04, gain: -8 },
      { buf: H.cut(chime(lib, M[k % 2], [N.D7, N.E7, N.A6, N.B6, N.Fs7][k]), 0.5, 0.5), at: 0.05, gain: -9 },
      { buf: H.strike(await H.ld(X.drop, 0.08, 0.3, { hp: 200 })), at: 0.2 + r.range(0, 0.08), gain: -12 },
    ]);
    fk.push(H.shape(H.cut(H.verb(v, 'alley', 0.18, 0.9, `fkr${k}`, 1), 0.95, 0.5), -17));
  }
  await cat.add('chiwen_frost_kill', fk, { lufs: -17, vol: 1.45, spatial: true, range: [3, 60], voices: 4, pitch: [0.96, 1.04], sources: [X.iceBreak, X.iceCrack, X.iceCubes, X.shard, X.glassL(1), X.mug, X.drop] });
}

// ---------------------------------------------------------------------------------------------- viewmodel / presentation
async function view(lib, ctx, cat, H, M, B) {
  // chiwen_idle: §1.12 idle hum — 55/82.5/110 Hz, a 400-1200 Hz band of noise swept by a 0.2 Hz LFO, trickling water.
  // Loops seamlessly at 10 s (two LFO periods; every partial is a whole number of cycles).
  {
    // (the hum is periodic in 10 s and is NOT crossfaded: an equal-power crossfade of a coherent tone swells +3 dB at
    // every loop point; only the noise band and the water, which are random, go through loopCrossfade)
    const P = 10, L = 11, lfo = (t) => 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.2 * t);
    const hum = lib.saturate(lib.mix([{ buf: lib.tone(P, { freq: 55 }) }, { buf: lib.tone(P, { freq: 82.5 }), gain: -7 }, { buf: lib.tone(P, { freq: 110 }), gain: -5 }, { buf: lib.tone(P, { freq: 165 }), gain: -16 }]), { drive: 3, type: 'tube' });
    const band = lib.sweep(lib.noise(L, { color: 'pink', seed: 'idle_n' }), 'bp', (t) => 400 * Math.pow(3, lfo(t)), { q: 1.6 });
    const water = H.env(lib.eq(await H.ld(X.gurgling, 2, 2 + L, { hp: 180, lp: 3200 }), [{ type: 'peak', f: 900, gain: -3, q: 1 }]), (t) => 0.55 + 0.45 * lfo(t + 1.3));
    // (widened before the crossfade: the diffuser's cold start at sample 0 is crossfaded out with the rest)
    const texture = lib.loopCrossfade(lib.stereoize(lib.mix([{ buf: H.norm(band), gain: -6 }, { buf: water, gain: -8 }]), { width: 0.35, hp: 250, seed: 'idle_st' }), L - P);
    const v = lib.mix([{ buf: H.norm(hum), gain: -4 }, { buf: texture }], { length: P, channels: 2 });
    await cat.add('chiwen_idle', v, { lufs: -18, loop: true, spatial: false, channels: 2, voices: 1, pitch: [1, 1], sources: [X.gurgling] });
  }

  // chiwen_eyes: the eyes light (ready edge, with ready_chiwen): a swelling frost shimmer into a bright glazed glint
  {
    const sw = lib.reverse(lib.eq(lib.noiseBurst({ dur: 0.3, attack: 0.001, decay: 0.25, seed: 'ey_s' }), [{ type: 'hp', f: 4500, order: 2 }]));
    const v = lib.mix([{ buf: sw, gain: -8 }, { buf: H.norm(chime(lib, M[0], N.A7)), at: 0.28, gain: -2 }, { buf: H.norm(chime(lib, M[1], N.E7)), at: 0.31, gain: -4 },
      { buf: H.tinkles(0.4, 6, { lo: 5000, hi: 9000, t60: 0.07, seed: 'ey_t' }), at: 0.3, gain: -12 }]);
    await cat.add('chiwen_eyes', [H.cut(H.verb(lib.stereoize(v, { width: 0.4, hp: 1500, seed: 'ey' }), 'warehouse', 0.22, 1, 'eyr'), 1.1, 0.5)], { lufs: -20, spatial: false, channels: 2, voices: 1, pitch: [1, 1], maxHeadMs: 400, sources: [X.mug] });   // a swell by design
  }

  // chiwen_scales: 細碎的瓷片聲＋水聲 — six glazed scale rows lift tail -> head (63 ms apart, the first-draw clip),
  // each a small porcelain clink, climbing the pentatonic; droplets are shaken off
  {
    const out = [];
    for (let k = 0; k < 2; k++) {
      const notes = k ? [N.B6, N.D7, N.E7, N.Fs7, N.A7, N.B6 * 2] : [N.A6, N.B6, N.D7, N.E7, N.Fs7, N.A7];
      const parts = notes.map((hz, i) => ({ buf: H.cut(chime(lib, M[(i * 3 + k) % M.length], hz), 0.16, 0.6), at: i * 0.063, gain: -2 - (5 - i) * 0.6, pan: -0.5 + i * 0.2 }));
      parts.push({ buf: H.strike(await H.ld(X.cup, 0.27, 0.5, { hp: 500, semis: 4 })), at: 0, gain: -9 });
      parts.push({ buf: H.strike(await H.ld(X.tinySplash, 0.255, 0.74, { hp: 700 })), at: 0.14, gain: -8 });
      parts.push({ buf: H.rain(0.5, `sc_r${k}`, 70), at: 0.12, gain: -14 });
      out.push(H.cut(H.verb(lib.mix(parts, { channels: 2 }), 'smallRoom', 0.2, 0.5, `scr${k}`), 0.85, 0.4));
    }
    await cat.add('chiwen_scales', out, { lufs: -20, spatial: false, channels: 2, voices: 1, pitch: [1, 1], sources: [X.mug, X.cup, X.tinySplash] });
  }

  // chiwen_gurgle: 咕嚕水聲 — the water starts to circulate in the glass tube: gurgle + a run of bubbles + a whirl
  {
    const out = [];
    for (let k = 0; k < 3; k++) {
      const r = H.rng(`gu${k}`);
      const g = H.env(await H.ld(X.gurgling, 3 + k * 3.1, 4.4 + k * 3.1, { hp: 150, lp: 5000 }), [[0, -20], [0.15, 0], [1.0, -2], [1.4, -40]]);
      const bubs = B.slice(k * 4, k * 4 + 6).map((b, i) => ({ buf: lib.varispeedSemis(b.buf, r.range(-2, 5)), at: 0.08 + i * r.range(0.09, 0.15), gain: -4 - r.range(0, 6) }));
      const whirl = lib.sweep(lib.noise(1.2, { color: 'pink', seed: `guw${k}` }), 'bp', (t) => 300 + 700 * (t / 1.2) + 120 * Math.sin(2 * Math.PI * 4 * t), { q: 3 });
      const v = lib.mix([{ buf: g }, ...bubs, { buf: H.env(whirl, [[0, -30], [0.5, -4], [1.2, -30]]), gain: -12 }]);
      out.push(H.cut(lib.stereoize(v, { width: 0.3, hp: 400, seed: `gus${k}` }), 1.35, 0.25));
    }
    await cat.add('chiwen_gurgle', out, { lufs: -21, spatial: false, channels: 2, voices: 2, pitch: [0.97, 1.03], sources: [X.gurgling, X.bubbles] });
  }

  // chiwen_roar_low: 低沉龍吟 (first draw, the jaw opens): a sea lion growl and a didgeridoo drone a fifth down, a sung
  // undertone, a little water in the throat
  {
    const out = [];
    for (let k = 0; k < 2; k++) {
      const growl = await H.ld(X.seaLion, k ? 0.78 : 2.08, k ? 1.4 : 2.85, { hp: 60, semis: -5 });
      const didg = await H.ld(X.didg, 0.25, 1.6, { hp: 40, semis: -2, lp: 2500 });
      const sung = H.voice(1.3, (t) => 73.4 * (1 + 0.06 * Math.sin(Math.PI * Math.min(1, t / 1.1))), { seed: `rl${k}`, f1: [[0, 380], [0.5, 560], [1, 420]], f2: [[0, 800], [1, 950]], growl: -8 });
      const v = lib.mix([{ buf: growl }, { buf: H.env(didg, [[0, -30], [0.12, 0], [1.0, -6], [1.35, -40]]), gain: -7 },
        { buf: H.env(H.norm(sung), [[0, -40], [0.15, 0], [1.0, -4], [1.3, -40]]), gain: -10 },
        { buf: H.norm(lib.varispeedSemis(B[k + 1].buf, -9)), at: 0.05, gain: -12 }, { buf: H.boom(`rlb${k}`, { f0: 90, f1: 45, decay: 0.45, drive: 2 }), gain: -12 }]);
      const vv = lib.eq(v, [{ type: 'lowshelf', f: 120, gain: -3 }, { type: 'peak', f: 1200, gain: 3.5, q: 0.8 }]);   // a throat that small speakers can hear
      out.push(H.shape(H.cut(H.verb(vv, 'warehouse', 0.22, 1.4, `rlr${k}`), 1.6, 0.4), -18));
    }
    await cat.add('chiwen_roar_low', out, { lufs: -18, spatial: false, channels: 2, voices: 1, pitch: [0.98, 1.02], sources: [X.seaLion, X.didg, X.bubbles] });
  }

  // chiwen_draw_first: 釉瓷輕響 — the rifle flips in (cloth + handling), a light glazed ring as it settles
  {
    const out = [];
    for (let k = 0; k < 2; k++) {
      const v = lib.mix([
        { buf: await H.ld(X.cloth, 0, 0.34, { hp: 150 }), gain: -4 }, { buf: H.K.swish(0.32, 500, 2600, `dfw${k}`), gain: -6 },
        { buf: H.strike(await H.ld(X.unholster, 0, 0.6, { hp: 200 })), at: 0.05, gain: -6 },
        { buf: H.strike(await H.ld(X.cup, 0.27, 0.78, { hp: 400 })), at: 0.2, gain: -3 },
        { buf: H.norm(chime(lib, M[k], k ? N.E7 : N.D7)), at: 0.205, gain: -8 }, { buf: H.norm(chime(lib, M[1 - k], k ? N.A6 : N.B6)), at: 0.24, gain: -12 },
      ]);
      out.push(H.cut(H.verb(v, 'smallRoom', 0.18, 0.6, `dfr${k}`), 0.9, 0.4));
    }
    await cat.add('chiwen_draw_first', out, { lufs: -20, spatial: false, channels: 2, voices: 1, pitch: [1, 1], sources: [X.cloth, X.unholster, X.cup, X.mug] });
  }

  // chiwen_bubble (「啵」, the 螭吻 blows a bubble) and chiwen_splash (the bubble pops on the glove)
  {
    const bub = [], spl = [];
    for (let k = 0; k < 3; k++) {
      const r = H.rng(`bb${k}`);
      bub.push(H.cut(H.verb(lib.mix([{ buf: lib.varispeedSemis(B[k].buf, -2 + k) }, { buf: H.bubble(r.range(500, 700), 0.12, 1.6, `bbs${k}`), at: 0.03, gain: -8 }]), 'smallRoom', 0.15, 0.3, `bbr${k}`, 1), 0.4, 0.4));
      spl.push(H.cut(H.verb(lib.mix([{ buf: lib.noiseBurst({ dur: 0.01, decay: 0.003, hp: 3000, seed: `sp${k}` }), gain: -6 },
        { buf: H.strike(await H.ld(X.tinySplash, [0.255, 0.9, 1.43][k], [0.44, 1.38, 1.63][k], { hp: 400 })), at: 0.003 },
        { buf: H.bubble(r.range(1500, 2200), 0.05, 1.9, `sps${k}`), at: 0.006, gain: -6 }]), 'smallRoom', 0.15, 0.3, `spr${k}`, 1), 0.45, 0.4));
      spl[k] = H.shape(spl[k], -22);
    }
    await cat.add('chiwen_bubble', bub, { lufs: -22, spatial: false, channels: 1, voices: 2, pitch: [0.95, 1.05], sources: [X.bubbles] });
    await cat.add('chiwen_splash', spl, { lufs: -22, spatial: false, channels: 1, voices: 2, pitch: [0.95, 1.05], sources: [X.tinySplash] });
  }

  // chiwen_tank: the water-tank magazine seats —「咕」one deep glug, a slosh, the latch
  {
    const out = [];
    for (let k = 0; k < 3; k++) {
      const v = lib.mix([
        { buf: H.norm(lib.varispeedSemis(B[k + 3].buf, -10)) }, { buf: H.bubble(170 + k * 20, 0.16, 1.7, `tk${k}`), at: 0.01, gain: -4 },
        { buf: H.env(await H.ld(X.gargleUw, 1 + k * 1.5, 1.6 + k * 1.5, { hp: 100, lp: 3000 }), [[0, -20], [0.05, 0], [0.4, -6], [0.6, -40]]), at: 0.02, gain: -8 },
        { buf: await H.K.grab(X.akCock, 0.15, 0.71, { mode: 'peak', post: 0.06, semis: 1 + k * 0.5, hp: 400 }), at: 0.14, gain: -8 },
      ]);
      out.push(H.cut(H.verb(v, 'smallRoom', 0.14, 0.4, `tkr${k}`, 1), 0.6, 0.35));
    }
    await cat.add('chiwen_tank', out, { lufs: -19, spatial: false, channels: 1, voices: 1, pitch: [0.97, 1.03], sources: [X.bubbles, X.gargleUw, X.akCock] });
  }

  // chiwen_inspect: §1.12 — an original 南管-style phrase (pipa with 輪指 tremolo and a 推 bend, 洞簫 underneath) over a
  // sea wash, 3.3 s; the inspect's sea-mist world change
  {
    const D = 3.4, parts = [];
    const pl = (f, at, dur, g, seed, o) => parts.push({ buf: H.norm(H.pipa(f, dur, seed, o)), at, gain: g });
    pl(N.D5, 0.06, 0.8, -2, 'p1');
    pl(N.E5, 0.34, 0.6, -3, 'p2');
    for (let i = 0; i < 9; i++) pl(N.A5, 0.58 + i * 0.072, 0.3, -4 - i * 0.7 + (i % 2 ? -1.5 : 0), `p3${i}`, { t60: 0.6 });   // 輪指
    // 推: F#5 pushed down to E5 (the string is bent, the note glides)
    parts.push({ buf: H.norm(lib.varispeedCurve(H.pipa(N.Fs5, 0.95, 'p4'), [[0, 1], [0.18, 1], [0.38, N.E5 / N.Fs5], [1, N.E5 / N.Fs5]])), at: 1.3, gain: -3 });
    pl(N.D5, 1.92, 1.45, -1.5, 'p5', { t60: 1.8 }); pl(N.A4, 1.925, 1.4, -7, 'p6', { t60: 1.6 });
    parts.push({ buf: H.norm(chime(lib, M[0], N.D7)), at: 2.6, gain: -14 });                                                  // 泛音 ping
    const fx = (t) => (t < 1.1 ? N.A4 : t < 1.18 ? N.A4 + (N.B4 - N.A4) * (t - 1.1) / 0.08 : t < 1.45 ? N.B4 : t < 1.52 ? N.B4 + (N.A4 - N.B4) * (t - 1.45) / 0.07 : N.A4);
    parts.push({ buf: H.norm(H.xiao(2.6, fx, 'xiao')), at: 0.4, gain: -14 });
    const sea = H.env(await H.ld(X.crash, 0.6, 0.6 + D, { stereo: true, hp: 120, lp: 4500 }), [[0, -30], [0.8, -2], [2.0, 0], [D, -40]]);
    parts.push({ buf: sea, gain: -13 });
    let v = lib.mix(parts, { channels: 2 });
    v = H.verb(lib.stereoize(v, { width: 0.3, hp: 400, seed: 'insp' }), 'warehouse', 0.3, 2.2, 'inspr');
    await cat.add('chiwen_inspect', H.cut(v, D + 0.6, 0.25), { lufs: -20, spatial: false, channels: 2, voices: 1, pitch: [1, 1], maxHeadMs: 100, sources: [X.crash, X.mug] });
  }
}

// ---------------------------------------------------------------------------------------------- skills
async function skills(lib, ctx, cat, H, M, B) {
  // chiwen_barrier: 水幕反衝 — a ring of water bursts up round the caster: whump, two splashes, an outward rush, spray
  {
    const out = [];
    for (let k = 0; k < 3; k++) {
      const r = H.rng(`bar${k}`);
      const v = lib.mix([
        { buf: H.boom(`barb${k}`, { f0: 120, f1: 48, sweep: 0.03, decay: 0.38, drive: 2.5 }), gain: -3 },
        { buf: H.strike(await H.ld(X.bigSplash, 0, 1.1, { stereo: true, hp: 70, semis: r.range(-1.5, 0) })) },
        { buf: H.strike(await H.ld(X.splash, 0, 0.9, { stereo: true, hp: 120 })), at: 0.02, gain: -4 },
        { buf: lib.whoosh({ dur: 0.45, f0: 2200, f1: 450, q: 1.4, seed: `barw${k}` }), at: 0.0, gain: -6 },
        { buf: H.rain(0.9, `barr${k}`, 110), at: 0.15, gain: -10 },
      ], { channels: 2 });
      out.push(H.shape(H.cut(H.verb(v, 'alley', 0.14, 0.8, `barv${k}`), 1.2, 0.45), -16.5));
    }
    await cat.add('chiwen_barrier', out, { lufs: -16.5, vol: 1.25, spatial: true, channels: 2, range: [3, 50], voices: 2, pitch: [0.96, 1.04], sources: [X.bigSplash, X.splash] });
  }

  // 冰流光束 (◎ held, <= 2.5 s): ignition, the sustained curl of surf + jet + an icy chord, the collapse
  {
    const out = [];
    for (let k = 0; k < 2; k++) {
      const r = H.rng(`rs${k}`);
      const shing = lib.mix([280, 420, 560].map((f, i) => ({ buf: lib.applyEnv(lib.tone(0.7, { type: 'triangle', freq: [[0, f * 4], [0.25, f * 6]] }), lib.expEnv(0.7, { attack: 0.01, t60: 0.6 })), gain: -i * 3 })));
      const v = lib.mix([
        { buf: H.boom(`rsb${k}`, { f0: 160, f1: 52, sweep: 0.03, decay: 0.35, drive: 2.5 }), gain: -2 },
        { buf: H.strike(await H.ld(X.iceCrack, [0.5, 4.0][k], [0.68, 4.2][k], { hp: 900 })), gain: -4 },
        { buf: await H.ld(X.hose, 0.55, 1.5, { hp: 200, fadeIn: 0.004 }), at: 0.0, gain: -3 },
        { buf: H.norm(shing), at: 0.02, gain: -10 },
        { buf: lib.whoosh({ dur: 0.5, f0: 1500, f1: 8000, q: 1.5, seed: `rsw${k}` }), gain: -8 },
        { buf: H.env(await H.ld(X.crash, 1.0, 1.9, { stereo: true, hp: 150 }), [[0, -40], [0.1, -3], [0.5, 0], [0.9, -40]]), gain: -4 },
      ], { channels: 2 });
      out.push(H.shape(H.cut(H.verb(lib.stereoize(v, { width: 0.35, hp: 500, seed: `rss${k}` }), 'warehouse', 0.15, 1, `rsr${k}`), 1.0, 0.45), -15));
    }
    await cat.add('chiwen_ray_start', out, { lufs: -15, vol: 1.15, spatial: true, channels: 2, range: [4, 60], voices: 2, pitch: [0.98, 1.02], sources: [X.iceCrack, X.hose, X.crash] });
  }
  {
    // the loop: 3 s, every modulation a whole number of cycles (0.667 Hz swell, 6 Hz shimmer) -> seamless
    const L = 4, P = 3;
    const swell = (t) => 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(2 * Math.PI * (2 / P) * t));
    const jet = lib.eq(await H.ld(X.hose, 2.0, 2.0 + L, { hp: 300 }), [{ type: 'peak', f: 5000, gain: 2, q: 0.7 }]);
    const curl = H.env(await H.ld(X.surf, 3.0, 3.0 + L, { hp: 90, lp: 3000 }), swell);
    const crash = H.env(await H.ld(X.crash, 1.0, 1.0 + L, { stereo: true, hp: 120 }), (t) => 0.5 + 0.5 * swell(t + 0.7));
    // the icy chord is periodic in P (every partial a multiple of 1/3 Hz, chorused +-1/3 Hz) and skips the crossfade
    // (a coherent tone through an equal-power crossfade swells +3 dB); only the recordings / noise are crossfaded
    const chord = lib.mix([[220, 0], [330, -2], [440, -4], [660, -10], [1760, -16]].flatMap(([f, g]) => [
      { buf: lib.tone(P, { freq: f + 1 / 3 }), gain: g, pan: -0.4 }, { buf: lib.tone(P, { freq: f - 1 / 3 }), gain: g, pan: 0.4 }]), { channels: 2 });
    const shimmer = H.env(lib.saturate(chord, { drive: 3, type: 'tube' }), (t) => 0.8 + 0.2 * Math.sin(2 * Math.PI * 6 * t));
    const hiss = H.env(lib.eq(lib.noise(L, { color: 'white', seed: 'rl_h' }), [{ type: 'hp', f: 6000, order: 2 }]), (t) => 0.5 + 0.5 * swell(t + 1.4));
    let v = lib.mix([{ buf: jet, gain: -2 }, { buf: curl, gain: -3 }, { buf: crash, gain: -6 }, { buf: hiss, gain: -22 }], { channels: 2 });
    v = lib.loopCrossfade(lib.stereoize(v, { width: 0.3, hp: 400, seed: 'rl_st' }), L - P);
    v = lib.mix([{ buf: v }, { buf: lib.gain(H.norm(shimmer), -12 + 20 * Math.log10(lib.peak(v))) }], { length: P, channels: 2 });
    await cat.add('chiwen_ray_loop', v, { lufs: -15, loop: true, spatial: true, channels: 2, range: [4, 60], voices: 2, pitch: [1, 1], sources: [X.hose, X.surf, X.crash] });
  }
  {
    const out = [];
    for (let k = 0; k < 2; k++) {
      const fall = lib.applyEnv(lib.mix([{ buf: lib.tone(0.7, { type: 'triangle', freq: [[0, 880], [0.7, 330]] }) }, { buf: lib.tone(0.7, { freq: [[0, 1320], [0.7, 495]] }), gain: -6 }]), lib.expEnv(0.7, { attack: 0.005, t60: 0.6 }));
      const hiss = lib.sweep(lib.noise(0.9, { color: 'white', seed: `re${k}` }), 'bp', (t) => 7000 * Math.pow(0.2, t / 0.9), { q: 1.2 });
      const v = lib.mix([
        { buf: H.strike(await H.ld(X.splash, 0.15, 1.2, { stereo: true, hp: 150 })), gain: -2 },
        { buf: H.env(hiss, [[0, 0], [0.9, -40]]), gain: -6 }, { buf: H.norm(fall), gain: -14 },
        { buf: H.tinkles(0.7, 8, { lo: 2500, hi: 6500, t60: 0.14, seed: `ret${k}` }), at: 0.05, gain: -10 },
      ], { channels: 2 });
      out.push(H.cut(H.verb(v, 'warehouse', 0.16, 1, `rer${k}`), 1.1, 0.45));
    }
    await cat.add('chiwen_ray_end', out, { lufs: -17, spatial: true, channels: 2, range: [4, 55], voices: 2, pitch: [0.98, 1.02], sources: [X.splash] });
  }

  // 潮球: the cast (嗡 swells, the orb is pushed out with a water whoomp), three pulses (咚 + the 嗡 ringing), the burst
  {
    const out = [];
    for (let k = 0; k < 2; k++) {
      const hum = lib.applyEnv(lib.saturate(lib.mix([{ buf: lib.tone(0.9, { freq: [[0, 82], [0.3, 110]] }) }, { buf: lib.tone(0.9, { freq: [[0, 164], [0.3, 220]] }), gain: -6 }]), { drive: 5, type: 'tube' }), lib.envCurve(0.9, [[0, 0], [0.08, 1], [0.5, 0.6], [0.9, 0]]));
      const v = lib.mix([
        { buf: H.norm(lib.eq(hum, [{ type: 'bp', f: 300, q: 0.6 }])), gain: -4 },
        { buf: H.norm(lib.varispeedSemis(B[k].buf, -11)), at: 0.03, gain: -3 },
        { buf: H.strike(await H.ld(X.rockSplash, 0, 0.7, { stereo: true, hp: 120 })), at: 0.05, gain: -5 },
        { buf: lib.whoosh({ dur: 0.35, f0: 400, f1: 1800, q: 1.6, seed: `ocw${k}` }), gain: -8 },
      ], { channels: 2 });
      out.push(H.shape(H.cut(H.verb(v, 'smallRoom', 0.2, 0.6, `ocr${k}`), 0.95, 0.45), -16));
    }
    await cat.add('chiwen_orb_cast', out, { lufs: -16, spatial: true, channels: 2, range: [3, 50], voices: 2, pitch: [0.97, 1.03], sources: [X.bubbles, X.rockSplash] });
  }
  {
    const out = [];
    for (let k = 0; k < 3; k++) {
      const r = H.rng(`op${k}`);
      const f = 70 + k * 3;
      const hum = lib.applyEnv(lib.saturate(lib.mix([{ buf: lib.tone(0.8, { freq: (t) => f * (1 + 0.02 * Math.sin(2 * Math.PI * 7 * t)) }) }, { buf: lib.tone(0.8, { freq: f * 2 }), gain: -5 }, { buf: lib.tone(0.8, { freq: f * 3 }), gain: -11 }]), { drive: 4, type: 'tube' }),
        lib.envCurve(0.8, [[0, 0], [0.03, 0.4], [0.12, 1], [0.8, 0]]));
      const v = lib.mix([
        { buf: H.boom(`opb${k}`, { f0: 115, f1: 50, sweep: 0.03, decay: 0.35, drive: 3 }), gain: -3 },
        { buf: H.strike(await H.ld(X.bigSplash, [0, 0.45, 0.2][k], [0.3, 0.75, 0.5][k], { hp: 200 })), gain: -6 },
        { buf: H.norm(lib.eq(hum, [{ type: 'peak', f: 400, gain: 4, q: 1 }])), at: 0.02, gain: -4 },
        { buf: lib.eq(lib.noiseBurst({ dur: 0.4, attack: 0.005, decay: 0.3, seed: `opn${k}` }), [{ type: 'hp', f: 2000, order: 2 }]), at: 0.01, gain: -14 },
        { buf: H.norm(lib.varispeedSemis(B[k + 4].buf, r.range(-8, -5))), at: 0.04, gain: -10 },
      ]);
      out.push(H.shape(H.cut(H.verb(v, 'smallRoom', 0.16, 0.5, `opr${k}`, 1), 0.85, 0.45), -18.5));
    }
    await cat.add('chiwen_orb_pulse', out, { lufs: -18.5, vol: 1.5, spatial: true, range: [3, 55], voices: 3, pitch: [0.98, 1.02], sources: [X.bigSplash, X.bubbles] });
  }
  {
    const out = [];
    for (let k = 0; k < 2; k++) {
      const pops = B.slice(6, 12).map((b, i) => ({ buf: lib.varispeedSemis(b.buf, 2 + i), at: 0.02 + i * 0.035, gain: -8 }));
      const v = lib.mix([
        { buf: H.boom(`obb${k}`, { f0: 95, f1: 44, sweep: 0.05, decay: 0.4, drive: 3 }), gain: -4 },
        { buf: H.strike(await H.ld(X.bigSplash, 0, 1.6, { hp: 80, semis: k ? -1 : 0.5 })) },
        { buf: H.strike(await H.ld(X.rockSplash, 0, 1.2, { hp: 120 })), at: 0.01, gain: -4 },
        ...pops, { buf: H.rain(1.1, `obr${k}`, 120), at: 0.25, gain: -9 },
      ]);
      out.push(H.shape(H.cut(H.verb(v, 'alley', 0.15, 0.9, `obv${k}`, 1), 1.5, 0.45), -18));
    }
    await cat.add('chiwen_orb_burst', out, { lufs: -18, vol: 1.5, spatial: true, range: [4, 60], voices: 2, pitch: [0.97, 1.03], sources: [X.bigSplash, X.rockSplash, X.bubbles] });
  }
}

// ---------------------------------------------------------------------------------------------- ultimate 吞潮
// Timeline (premium/chiwen.js swallowTide): 0 inhale | 0.3 vortex | 0.6 the 螭吻 bursts out, roars (+ the tail
// breaches at 1.18) | 1.1 吞 pull (gulp) | 1.62 bite (hit-stop 0.1 s) | 1.72 tail slap | 1.92 / 2.32 / 2.72 吐 water
// columns | 3.0 it sinks back, frost | 3.7 end. The bed is scored on that grid (accents up to 1.62 land exactly; later
// ones sit between the caster's hit-stop-delayed timeline and a teammate's).
async function ult(lib, ctx, cat, H, M, B, keep) {
  // ① rise (§1.12 layer 1, 0.4 s+): the 螭吻 draws the sea in — a reversed splash sucked backwards, a rising driven
  // tone (pitch x1.25), breath noise sweeping up; it stops dead as the vortex opens
  let inhale;
  {
    const D = 0.62;
    const suck = lib.reverse(await H.ld(X.bigSplash, 0, D, { stereo: true, hp: 120 }));
    const rise = lib.applyEnv(lib.saturate(lib.mix([{ buf: lib.tone(D, { type: 'saw', freq: [[0, 70], [D, 140]] }) }, { buf: lib.tone(D, { freq: [[0, 140], [D, 280]] }), gain: -3 }]), { drive: 6, type: 'tube' }), lib.envCurve(D, [[0, 0], [0.4, 0.6], [D - 0.03, 1], [D, 0]]));
    const breath = lib.applyEnv(lib.sweep(lib.noise(D, { color: 'pink', seed: 'inh' }), 'bp', (t) => 500 * Math.pow(6, t / D), { q: 1.8 }), lib.envCurve(D, [[0, 0], [D - 0.05, 1], [D, 0]]));
    const v = lib.mix([{ buf: suck, gain: -2 }, { buf: H.norm(lib.sweep(rise, 'lp', (t) => 400 * Math.pow(8, t / D), { q: 1.2 })), gain: -5 }, { buf: H.norm(breath), gain: -6 },
      { buf: H.env(await H.ld(X.gargleUw, 0.5, 0.5 + D, { hp: 100 }), [[0, -30], [D - 0.05, 0], [D, -40]]), gain: -12 }], { channels: 2 });
    inhale = lib.fadeOut(lib.stereoize(v, { width: 0.3, hp: 400, seed: 'inhs' }), 0.015, 'sine');
    await cat.add('chiwen_ult_inhale', inhale, { lufs: -15.5, spatial: true, channels: 2, range: [6, 80], voices: 2, pitch: [1, 1], maxHeadMs: 600, sources: [X.bigSplash, X.gargleUw] });
  }

  // vortex: a whirlpool opens — water swirling through a band that circles faster and faster, a low churn
  const vortex = [];
  {
    const D = 1.6;
    for (let k = 0; k < 2; k++) {
      // the band circles 2 -> 7 times a second (phase = integral of the rate)
      const swirlF = (t) => 700 * Math.pow(2.6, Math.sin(2 * Math.PI * (2 * t + 2.5 * t * t / D)));
      const src = lib.mix([{ buf: await H.ld(X.gurgling, 6 + k * 2, 6 + k * 2 + D, { hp: 150 }) }, { buf: await H.ld(X.hose, 3 + k, 3 + k + D, { hp: 300 }), gain: -6 }, { buf: lib.noise(D, { color: 'pink', seed: `vx${k}` }), gain: -18 }]);
      const sw = lib.sweep(src, 'bp', swirlF, { q: 2.2 });
      const churn = await H.ld(X.surf, 8 + k * 2, 8 + k * 2 + D, { hp: 50, lp: 700 });
      const v = lib.mix([{ buf: H.norm(sw) }, { buf: churn, gain: -5 }, { buf: H.boom(`vxb${k}`, { f0: 80, f1: 45, decay: 0.6, drive: 2 }), gain: -8 }]);
      vortex.push(H.shape(H.env(v, [[0, -24], [0.35, 0], [1.2, -2], [D, -40]]), -18));
    }
    await cat.add('chiwen_ult_vortex', vortex, { lufs: -18, spatial: true, range: [6, 80], voices: 2, pitch: [0.98, 1.02], maxHeadMs: 80, sources: [X.gurgling, X.hose, X.surf] });
  }

  // ② the 螭吻 bursts out and roars (§1.12 layer 2: the 40-60 Hz impact) — tiger + sea lion + didgeridoo voiced as one
  // creature with a sung formant 吟 on top; the sea heaves up with it (wave crash, a splash thrown up, spray)
  const roar = [];
  {
    for (let k = 0; k < 2; k++) {
      const tiger = await H.ld(X.tiger, 0.98, 2.1, { hp: 120, semis: k ? -3 : -2, eq: [{ type: 'peak', f: 1200, gain: 3, q: 0.8 }] });
      const lion = await H.ld(X.seaLion, k ? 0.78 : 2.08, k ? 1.45 : 2.9, { hp: 70, semis: -4 });
      const didg = await H.ld(X.didg, 0.2, 1.9, { hp: 40, semis: -3, lp: 3000 });
      const sung = H.voice(1.5, (t) => (k ? 139 : 147) * (1 + 0.12 * Math.sin(Math.PI * Math.min(1, t / 1.0)) - 0.08 * Math.max(0, t - 1.0)), { seed: `ur${k}`, f1: [[0, 420], [0.4, 700], [1, 520]], f2: [[0, 950], [0.4, 1250], [1, 1000]], growl: -6 });
      const voiceL = lib.mix([{ buf: tiger }, { buf: lion, at: 0.03, gain: -3 }, { buf: H.env(didg, [[0, -30], [0.1, 0], [1.3, -4], [1.7, -40]]), gain: -6 },
        { buf: H.env(H.norm(sung), [[0, -40], [0.15, 0], [1.2, -3], [1.5, -40]]), at: 0.05, gain: -8 }]);
      const creature = lib.saturate(lib.eq(voiceL, [{ type: 'peak', f: 250, gain: 2, q: 0.8 }]), { drive: 3, type: 'tube', mix: 0.4 });
      const v = lib.mix([
        { buf: H.boom(`urb${k}`, { f0: 72, f1: 42, sweep: 0.07, decay: 0.55, drive: 3 }), gain: 0 },
        { buf: H.strike(await H.ld(X.bigSplash, 0, 1.6, { stereo: true, hp: 60, semis: -3 })), gain: -2 },
        { buf: H.env(await H.ld(X.crash, 0.95, 3.2, { stereo: true, hp: 60 }), [[0, -12], [0.15, 0], [1.4, -3], [2.25, -40]]), gain: -3 },
        { buf: H.norm(creature), at: 0.05, gain: -1 },
        { buf: H.rain(1.6, `urr${k}`, 140), at: 0.35, gain: -12 },
      ], { channels: 2 });
      roar.push(H.shape(H.cut(H.verb(lib.stereoize(v, { width: 0.35, hp: 350, seed: `urs${k}` }), 'warehouse', 0.22, 1.8, `urv${k}`), 2.6, 0.35), -15));
    }
    await cat.add('chiwen_ult_roar', roar, { lufs: -15, vol: 1.2, spatial: true, channels: 2, range: [10, 140], voices: 2, pitch: [0.99, 1.01], priority: 3, sources: [X.tiger, X.seaLion, X.didg, X.bigSplash, X.crash] });
  }

  // 吞: everything is dragged into the jaws —「咕嚕」a vast underwater gulp, a falling suction
  const gulp = [];
  {
    for (let k = 0; k < 2; k++) {
      const D = 0.55;
      const gl = B.slice(k * 3, k * 3 + 4).map((b, i) => ({ buf: lib.varispeedSemis(b.buf, -14 + i), at: 0.05 + i * 0.09, gain: -2 - i }));
      const v = lib.mix([
        { buf: lib.reverse(await H.ld(X.splash, 0, D, { hp: 120 })), gain: -4 },
        { buf: H.env(await H.ld(X.gargleUw, 2 + k, 2 + k + D, { hp: 60, semis: -7 }), [[0, -20], [0.1, 0], [D, -10]]), gain: -2 },
        ...gl, { buf: lib.whoosh({ dur: D, f0: 3200, f1: 250, q: 1.4, seed: `ugw${k}` }), gain: -8 },
        { buf: H.boom(`ugb${k}`, { f0: 60, f1: 38, decay: 0.5, drive: 2 }), gain: -10 },
      ]);
      gulp.push(H.shape(lib.fadeOut(v, 0.06, 'exp'), -18));
    }
    await cat.add('chiwen_ult_gulp', gulp, { lufs: -18, spatial: true, range: [6, 80], voices: 2, pitch: [0.98, 1.02], sources: [X.splash, X.gargleUw, X.bubbles] });
  }

  // the bite: the jaws slam shut — a stone-hard porcelain clack, bone, a huge boom, the water slammed flat
  const bite = [];
  {
    for (let k = 0; k < 2; k++) {
      const clack = lib.mix([{ buf: H.strike(await H.ld(X.plate, 0, 0.12, { hp: 300, semis: -6 })) }, { buf: H.strike(await H.ld(X.cup, 0.27, 0.45, { hp: 200, semis: -12 })), gain: -4 }, { buf: H.K.crack(`ubc${k}`), gain: -8 }]);
      const teeth = lib.eq(H.K.crack(`ubt${k}`, { dur: 0.01, decay: 0.003, hp: 1200, lp: 12000 }), [{ type: 'peak', f: 2500, gain: 4, q: 1 }]);
      const v = lib.mix([
        { buf: H.norm(clack), gain: 2 }, { buf: H.norm(teeth), at: 0.012, gain: -4 },
        { buf: H.strike(await H.ld(X.bone, 0, 0.62, { hp: 160, semis: -4 })), at: 0.006, gain: -5 },
        { buf: H.boom(`ubb${k}`, { f0: 100, f1: 46, sweep: 0.04, decay: 0.38, drive: 3 }), at: 0.02, gain: -8 },   // the teeth first, the mass a beat later
        { buf: H.strike(await H.ld(X.bigSplash, 0, 1.0, { hp: 90, semis: -3 })), at: 0.045, gain: -4 },
        { buf: H.rain(0.9, `ubr${k}`, 100), at: 0.15, gain: -12 },
      ]);
      bite.push(H.shape(H.cut(H.verb(v, 'alley', 0.14, 0.9, `ubv${k}`, 1), 1.2, 0.45), -18.5));
    }
    await cat.add('chiwen_ult_bite', bite, { lufs: -18.5, vol: 1.5, spatial: true, range: [8, 110], voices: 2, pitch: [0.98, 1.02], priority: 2, sources: [X.plate, X.cup, X.bone, X.bigSplash] });
  }

  // the fish tail breaches / slaps the water
  const tail = [];
  {
    for (let k = 0; k < 2; k++) {
      const v = lib.mix([
        { buf: H.strike(await H.ld(X.splash, 0, 1.2, { hp: 70, semis: -2 + k })) },
        { buf: H.strike(await H.ld(X.bigSplash, 0, 0.9, { hp: 90 })), at: 0.01, gain: -5 },
        { buf: H.boom(`utb${k}`, { f0: 95, f1: 48, sweep: 0.03, decay: 0.3, drive: 2 }), gain: -9 },
        { buf: H.rain(0.8, `utr${k}`, 90), at: 0.12, gain: -11 },
      ]);
      tail.push(H.shape(H.cut(v, 1.1, 0.45), -20));
    }
    await cat.add('chiwen_ult_tail', tail, { lufs: -20, vol: 1.5, spatial: true, range: [6, 80], voices: 2, pitch: [0.96, 1.04], sources: [X.splash, X.bigSplash] });
  }

  // 吐 x3: water columns erupt (水爆) — boom, a jet roaring up, the column's splash, a rain of drops
  const spit = [];
  {
    const spl = [[X.bigSplash, 0, 1.4], [X.splash, 0, 1.4], [X.rockSplash, 0, 1.5]];
    for (let k = 0; k < 3; k++) {
      const [id, s, e] = spl[k];
      const v = lib.mix([
        { buf: H.boom(`usb${k}`, { f0: 92, f1: 44, sweep: 0.05, decay: 0.48, drive: 3 }), gain: -4 },
        { buf: lib.noiseBurst({ dur: 0.05, attack: 0.0005, decay: 0.025, hp: 900, lp: 9000, seed: `usn${k}` }), gain: -6 },
        { buf: H.env(await H.ld(X.hose, 0.55, 1.9, { hp: 120, semis: -3 - k, fadeIn: 0.003 }), [[0, 0], [0.5, -2], [1.3, -40]]), gain: -3 },
        { buf: lib.whoosh({ dur: 0.7, f0: 300, f1: 2600, q: 1.3, seed: `usw${k}` }), gain: -7 },
        { buf: H.strike(await H.ld(id, s, e, { hp: 70, semis: -1 })), at: 0.03, gain: -1 },
        { buf: H.rain(1.1, `usr${k}`, 140), at: 0.3, gain: -9 },
      ]);
      spit.push(H.shape(H.cut(H.verb(v, 'alley', 0.14, 1, `usv${k}`, 1), 1.5, 0.4), -18));
    }
    await cat.add('chiwen_ult_spit', spit, { lufs: -18, vol: 1.5, spatial: true, range: [8, 110], voices: 3, pitch: [0.97, 1.03], priority: 2, sources: [X.hose, X.bigSplash, X.splash, X.rockSplash] });
  }

  // it sinks back: the water body collapses, the spray freezes (ice cracking, crystal glitter, frost hiss)
  const fall = [];
  {
    for (let k = 0; k < 2; k++) {
      const v = lib.mix([
        { buf: H.env(await H.ld(X.crash, k ? 19.3 : 5.2, k ? 21.5 : 7.4, { hp: 60 }), [[0, -10], [0.12, 0], [1.4, -4], [2.2, -40]]) },
        { buf: H.strike(await H.ld(X.bigSplash, 0.3, 1.8, { hp: 80, semis: -2 })), gain: -3 },
        { buf: H.boom(`ufb${k}`, { f0: 80, f1: 40, decay: 0.6, drive: 2 }), gain: -7 },
        { buf: await H.ld(X.iceCrack, 3.9, 5.1, { hp: 600 }), at: 0.4, gain: -6 },
        { buf: H.tinkles(1.3, 18, { lo: 2600, hi: 7600, t60: 0.15, seed: `uft${k}`, skew: 1 }), at: 0.45, gain: -8 },
        { buf: H.env(lib.eq(lib.noise(1.6, { seed: `ufh${k}` }), [{ type: 'hp', f: 5000, order: 2 }]), [[0, -40], [0.4, -6], [1.6, -40]]), at: 0.3, gain: -16 },
      ]);
      fall.push(H.shape(H.cut(H.verb(v, 'warehouse', 0.15, 1.2, `ufv${k}`, 1), 2.3, 0.4), -16.5));
    }
    await cat.add('chiwen_ult_fall', fall, { lufs: -16.5, spatial: true, range: [8, 110], voices: 2, pitch: [0.98, 1.02], sources: [X.crash, X.bigSplash, X.iceCrack] });
  }

  // ④ release (§1.12 收尾的洩氣聲): the sea breathes out — a falling hiss, a low exhale, a last drop and a soft ding
  let end;
  {
    const D = 1.4;
    const hiss = lib.sweep(lib.noise(D, { seed: 'ue_h' }), 'bp', (t) => 5000 * Math.pow(0.16, t / D), { q: 1.3 });
    const ex = lib.eq(lib.noise(D, { color: 'pink', seed: 'ue_x' }), [{ type: 'lp', f: 600, order: 2 }, { type: 'hp', f: 60, order: 2 }]);
    const tone = lib.applyEnv(lib.tone(D, { type: 'triangle', freq: [[0, 294], [D, 147]] }), lib.expEnv(D, { attack: 0.02, t60: 1.2 }));
    const v = lib.mix([{ buf: H.env(H.norm(hiss), [[0, -6], [0.08, 0], [D, -40]]) }, { buf: H.env(H.norm(ex), [[0, -20], [0.15, 0], [D, -40]]), gain: -6 },
      { buf: H.norm(tone), gain: -16 }, { buf: H.norm(lib.varispeedSemis(B[2].buf, 3)), at: 0.85, gain: -10 }, { buf: H.norm(chime(lib, M[0], N.D7)), at: 0.88, gain: -16 }], { channels: 2 });
    end = H.cut(H.verb(lib.stereoize(v, { width: 0.35, hp: 400, seed: 'ues' }), 'warehouse', 0.2, 1.4, 'uev'), 2.0, 0.4);
    await cat.add('chiwen_ult_end', end, { lufs: -20, spatial: true, channels: 2, range: [6, 80], voices: 2, pitch: [1, 1], sources: [X.bubbles, X.mug] });
  }

  // ③ the bed (§1.12 layer 3): 北管鑼鼓 + a choir — a 堂鼓 roll rising into the cast, 大鑼 + 鈸 + 大鼓 on the burst-out
  // (0.6), 鈸 + drum on the bite (1.62), three rising 小鑼「鏘↗」on the columns, the 大鑼 again as it sinks (3.05); a
  // crowd choir on D + A (Ah / O) under all of it
  let bed;
  {
    const D = 4.6, parts = [];
    // roll: 14 strokes accelerating 0.1 -> 0.03 s, crescendo
    let t = 0;
    for (let i = 0; i < 14; i++) { parts.push({ buf: H.drum(`bd${i}`, 1 + (i % 2) * 0.04), at: t, gain: -16 + i * 0.95 }); t += 0.1 - (0.07 * i) / 13; }
    const gong = async (semis, len, hp = 60, t60 = 2.4) => lib.decay(await H.ld(X.gong, 0, len, { stereo: true, hp, semis, fadeOut: 0.3, eq: [{ type: 'lowshelf', f: 160, gain: -3 }] }), t60, 0.15);
    const cymbal = await H.ld(X.cymbal, 0, 1.0, { stereo: true, hp: 250 });
    const bigDrum = H.strike(await H.ld(X.taiko, 0.42, 0.95, { hp: 40 }));
    const dagong = await gong(-2, 3.6);
    parts.push({ buf: dagong, at: 0.6, gain: -1 }, { buf: H.strike(cymbal), at: 0.6, gain: -3 }, { buf: bigDrum, at: 0.6, gain: -2 });
    parts.push({ buf: H.strike(cymbal), at: 1.62, gain: -5 }, { buf: bigDrum, at: 1.62, gain: -4 });
    // 小鑼: a small gong whose pitch rises after the strike (the 北管 "tang")
    const xiaoluo = lib.varispeedCurve(await gong(14, 0.9, 300, 1.2), [[0, 1], [0.05, 1], [0.2, 1.08], [1, 1.08]]);
    for (const [i, at] of [1.95, 2.35, 2.75].entries()) parts.push({ buf: H.strike(xiaoluo), at, gain: -3 + i });
    parts.push({ buf: await gong(-2.5, 3), at: 3.05, gain: -4 }, { buf: H.strike(cymbal), at: 3.05, gain: -9 });
    // choir: crowd 'Ah' F -> D (-3 st) and 'O' F -> A (+4 st)
    const ch1 = await H.ld(X.choirA, 0.6, 4.8, { stereo: true, hp: 180, semis: -3, lp: 4000 });
    const ch2 = await H.ld(X.choirO, 0.6, 4.2, { stereo: true, hp: 220, semis: 4, lp: 3500 });
    const choir = H.env(lib.mix([{ buf: ch1 }, { buf: ch2, gain: -4 }], { channels: 2 }), [[0, -40], [0.12, -2], [1.0, 0], [1.25, 1.5], [2.4, -1], [3.2, -12], [3.7, -40]]);
    parts.push({ buf: choir, at: 0.55, gain: -6 });
    let v = lib.mix(parts, { channels: 2, length: D });
    v = H.verb(v, 'warehouse', 0.2, 2, 'bedv');
    bed = H.shape(lib.fadeOut(lib.slice(v, 0, D), 0.5, 'exp'), -19);
    await cat.add('chiwen_ult_bed', bed, { lufs: -19, spatial: true, channels: 2, range: [10, 140], voices: 2, pitch: [1, 1], sources: [X.gong, X.cymbal, X.taiko, X.choirA, X.choirO] });
  }
  // the whole ultimate as the caster hears it, at the handler's volumes (preview, not shipped; compare with the
  // gun-burst reference logged by gunSet)
  const at = (b, l, t, vol = 1) => ({ buf: H.atLufs(b, l), at: t, gainLin: vol });
  const tl = lib.mix([at(inhale, -15.5, 0), at(bed, -19, 0, 0.8), at(vortex[0], -18, 0.3, 0.9), at(roar[0], -15, 0.6, 1.2), at(tail[0], -20, 1.18, 0.8 * 1.5),
    at(gulp[0], -18, 1.1, 0.8), at(bite[0], -18.5, 1.62, 1.5), at(tail[1], -20, 1.72, 1.28 * 1.5), at(spit[0], -18, 1.92, 1.5), at(spit[1], -18, 2.32, 1.5), at(spit[2], -18, 2.72, 1.5),
    at(fall[0], -16.5, 3.0, 0.9), at(end, -20, 3.7, 0.7)], { channels: 2 });
  const L = lib.loudness(tl);
  ctx.log(`  ult timeline: ${L.integrated.toFixed(1)} LUFS integrated, momentary max ${L.momentaryMax.toFixed(1)}, short-term max ${L.shortTermMax.toFixed(1)}, peak ${lib.lin2db(lib.peak(tl)).toFixed(1)} dBFS`);
  ctx.preview('ult_timeline', tl);
  keep.ult = { inhale, roar: roar[0], bed, end };
}

// ---------------------------------------------------------------------------------------------- other
async function other(lib, ctx, cat, H, M, B, keep) {
  // ready_chiwen: §1.12 unique ready — a short sung dragon cry (a tiger's roar raised to a 吟, a formant voice rising
  // A4 -> D5), water lifting off the scales, drops falling back
  let ready;
  {
    const D = 1.3;
    const cry = await H.ld(X.tiger, 1.02, 1.9, { hp: 250, semis: 4, eq: [{ type: 'peak', f: 1300, gain: 3, q: 0.9 }] });
    const sung = H.voice(1.0, (t) => (t < 0.25 ? N.A4 * 0.5 + (N.D5 * 0.5 - N.A4 * 0.5) * (t / 0.25) : N.D5 * 0.5 * (1 - 0.05 * Math.max(0, t - 0.6))), { seed: 'rc', f1: [[0, 500], [0.3, 750], [1, 600]], f2: [[0, 1000], [0.3, 1400], [1, 1150]], growl: -14, vib: 0.016 });
    const v = lib.mix([
      { buf: H.norm(chime(lib, M[0], N.D7)), gain: -7 }, { buf: H.norm(chime(lib, M[1], N.A6)), at: 0.015, gain: -10 },
      { buf: H.env(cry, [[0, -12], [0.06, 0], [0.7, -3], [0.88, -40]]), at: 0.03 }, { buf: H.env(H.norm(sung), [[0, -40], [0.1, 0], [0.8, -2], [1.0, -40]]), gain: -6 },
      { buf: H.strike(await H.ld(X.dropSplash, 0, 0.55, { hp: 300 })), at: 0.02, gain: -10 },
      { buf: H.norm(lib.varispeedSemis(B[1].buf, 5)), at: 0.45, gain: -9 }, { buf: H.norm(lib.varispeedSemis(B[3].buf, 8)), at: 0.62, gain: -12 },
      { buf: H.norm(chime(lib, M[0], N.A6)), at: 0.7, gain: -16 },
    ], { channels: 2 });
    ready = H.cut(H.verb(lib.stereoize(v, { width: 0.35, hp: 400, seed: 'rds' }), 'warehouse', 0.26, 1.6, 'rdv'), D + 0.5, 0.35);
    await cat.add('ready_chiwen', ready, { lufs: -19, bus: 'ui', spatial: false, channels: 2, voices: 2, pitch: [1, 1], sources: [X.tiger, X.dropSplash, X.bubbles, X.mug] });
  }

  // chiwen_crisis: 螭吻護甲 (§1.12 危機護甲: 瓷器碎裂 + 元素尾音) — the glaze shatters, a water dragon coils up round
  // the player (a rising circling whoosh, a splash, a short cry)
  {
    const out = [];
    for (let k = 0; k < 2; k++) {
      const r = H.rng(`cr${k}`);
      const coil = lib.whoosh({ dur: 1.0, f0: 350, f1: 2400, q: 1.6, seed: `crw${k}` });
      const v = lib.mix([
        { buf: H.strike(await H.ld(X.plate, 0, 1.05, { stereo: true, hp: 150, semis: k ? -1.5 : 0 })) },
        { buf: H.strike(await H.ld(X.shard, 0.01, 0.33, { hp: 1500 })), at: 0.06, gain: -6 },
        { buf: H.boom(`crb${k}`, { f0: 110, f1: 46, decay: 0.4, drive: 2.5 }), gain: -4 },
        { buf: lib.pan(coil, -0.6), at: 0.12, gain: -4 }, { buf: lib.pan(lib.whoosh({ dur: 0.8, f0: 600, f1: 3000, q: 1.8, seed: `crx${k}` }), 0.6), at: 0.35, gain: -6 },
        { buf: H.strike(await H.ld(X.splash, 0, 1.2, { stereo: true, hp: 100 })), at: 0.2, gain: -4 },
        { buf: H.env(await H.ld(X.tiger, 1.05, 1.9, { hp: 200, semis: -1 }), [[0, -30], [0.08, 0], [0.7, -40]]), at: 0.4, gain: -12 },
        { buf: H.rain(0.9, `crr${k}`, 100), at: 0.45, gain: -12 },
      ], { channels: 2 });
      out.push(H.shape(H.cut(H.verb(v, 'warehouse', 0.18, 1.2, `crv${k}`), 1.7, 0.4), -14));
    }
    await cat.add('chiwen_crisis', out, { lufs: -14, spatial: true, channels: 2, range: [4, 60], voices: 2, pitch: [0.98, 1.02], sources: [X.plate, X.shard, X.splash, X.tiger] });
  }

  // chiwen_final: KE_FINAL — the wave's last kill raises one water column: a jet roaring up, its splash, a bright
  // glazed chord (D + A) ringing over it
  {
    const out = [];
    for (let k = 0; k < 2; k++) {
      const v = lib.mix([
        { buf: H.boom(`fnb${k}`, { f0: 90, f1: 42, decay: 0.45, drive: 2 }), gain: -3 },
        { buf: H.env(await H.ld(X.hose, 0.55, 1.9, { hp: 150, semis: -2 + k }), [[0, 0], [0.6, -2], [1.3, -40]]), gain: -2 },
        { buf: lib.whoosh({ dur: 0.8, f0: 300, f1: 3200, q: 1.3, seed: `fnw${k}` }), gain: -6 },
        { buf: H.strike(await H.ld(X.splash, 0, 1.3, { hp: 90 })), at: 0.05, gain: -2 },
        { buf: H.norm(chime(lib, M[0], N.D7)), at: 0.12, gain: -9 }, { buf: H.norm(chime(lib, M[1], N.A6)), at: 0.14, gain: -11 }, { buf: H.norm(chime(lib, M[0], N.Fs7)), at: 0.17, gain: -14 },
        { buf: H.rain(1.0, `fnr${k}`, 120), at: 0.4, gain: -11 },
      ]);
      out.push(H.shape(H.cut(H.verb(v, 'warehouse', 0.16, 1.2, `fnv${k}`, 1), 1.8, 0.4), -17));
    }
    await cat.add('chiwen_final', out, { lufs: -17, vol: 1.3, spatial: true, range: [5, 80], voices: 1, pitch: [0.99, 1.01], sources: [X.hose, X.splash, X.mug] });
  }
  keep.ready = ready;
}

/** 螭吻．焚海 twin cues (§1.12 雙生版: the originals -4 st with an echo); the twin handler plays `${cue}_searing`. */
async function twins(lib, ctx, cat, H, keep, fire) {
  const T = (b) => H.twin(b);
  await cat.add('ready_chiwen_searing', T(keep.ready), { lufs: -19, bus: 'ui', spatial: false, channels: 2, voices: 2, pitch: [1, 1], note: 'twin: ready_chiwen -4 st + echo' });
  await cat.add('chiwen_fire_searing', fire.map((b) => H.shape(lib.fadeOut(lib.slice(T(b), 0, 0.6), 0.2, 'exp'), -18, { threshold: -3 })), { lufs: -18, vol: 1.5, spatial: false, channels: 2, voices: 4, pitch: [1, 1], note: 'twin: chiwen_fire -4 st + echo' });
  await cat.add('chiwen_ult_inhale_searing', T(keep.ult.inhale), { lufs: -15.5, spatial: true, channels: 2, range: [6, 80], voices: 2, pitch: [1, 1], maxHeadMs: 800 });
  await cat.add('chiwen_ult_roar_searing', T(keep.ult.roar), { lufs: -15, vol: 1.2, spatial: true, channels: 2, range: [10, 140], voices: 2, pitch: [1, 1], priority: 3, maxLimitDb: 6 });
  await cat.add('chiwen_ult_bed_searing', T(keep.ult.bed), { lufs: -19, spatial: true, channels: 2, range: [10, 140], voices: 2, pitch: [1, 1] });
  await cat.add('chiwen_ult_end_searing', T(keep.ult.end), { lufs: -20, spatial: true, channels: 2, range: [6, 80], voices: 2, pitch: [1, 1] });
}

// ---------------------------------------------------------------------------------------------- producer
export async function produce(lib, ctx) {
  const only = process.env.CHIWEN_ONLY ? new Set(process.env.CHIWEN_ONLY.split(',').map((s) => s.trim())) : null;
  const want = (g) => !only || only.has(g);
  const cat = ctx.category('premium_chiwen', { bus: 'sfx' });
  const H = kit(lib, ctx);
  // build log: the pre-shaping of each sound, "natural PLR -> shaped PLR" per variant (the drive is capped at 6 dB)
  const add = cat.add.bind(cat);
  cat.add = (name, v, o) => { const s = H.shapeLog.splice(0); if (s.length) ctx.log(`  shape ${name} @${s[0][0]}: ${s.map((x) => `${x[1]}->${x[2]}`).join(' ')}`); return add(name, v, o); };
  const M = await mugBank(lib, ctx, H), B = await bubbleBank(lib, ctx, H);
  const keep = {};
  if (want('gun')) await gunSet(lib, ctx, cat, H);
  const fire = want('gun') || want('fire') || want('twin') ? await fireTheme(lib, ctx, cat, H, M, B) : null;
  if (want('hits')) await hits(lib, ctx, cat, H, M, B);
  if (want('view')) await view(lib, ctx, cat, H, M, B);
  if (want('skills')) await skills(lib, ctx, cat, H, M, B);
  if (want('ult') || want('twin')) await ult(lib, ctx, cat, H, M, B, keep);
  if (want('other') || want('twin')) await other(lib, ctx, cat, H, M, B, keep);
  if (want('twin')) await twins(lib, ctx, cat, H, keep, fire);
  await cat.write();
}
