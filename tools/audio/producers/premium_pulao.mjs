// M08 蒲牢．鐘吼 Pulao Bellroar (神兵 pump shotgun, docs/PREMIUM_WEAPONS.md M08 + §1.12) — category 'premium_pulao':
// every cue game/src/weapons/premium/pulao.js plays (its SFX table; the clips' 'snd' events use the stock pump / shell /
// cloth foley), the def.sound contract (pulao_close / _tail / _far), the def's ready cue (ready_pulao) and the
// reserved twin 蒲牢．暮鼓 (`<cue>_dusk`). Palette: 蒲牢 is the dragon on a bell's crown that loves to roar, so the
// voice of the weapon is cast bronze — a temple bell (additive: every mode a slowly beating doublet, the 「嗡—嗡」 of
// a big bell), small gilt bells, the 撞木 log, gongs and the opera cymbal of 北管 — plus the dragon (a tiger roar and a
// didgeridoo roar taken down, an angry beast's growl, a sung 吟, all rung through a bronze throat). Every tuned part sits
// in C 宮 pentatonic (C D E G A); the code's pitch steps (a whole tone per toll, the ult's PENTA ratios, x1.5 on the
// small bells, x0.75 on the distant ready bell) land on it.
//
//   gun      pulao_close (FFSL pump-gun takes + crack / body / sub + the blast rung through the bronze bell mouth, C5),
//            pulao_tail (street reflections + the mouth's ring in the street), pulao_far (distance + a far bell)
//   theme    pulao_fire (per shot, ~10 dB under the gun: the bell mouth's C5 ring, the 30 ms 6-10 kHz luxury tick,
//            the crown's sound rings leaving), pulao_hit / pulao_head (a volley that hit: the sound wave passing through
//            a body; brighter, with a cyan glint, on a headshot)
//   feel     pulao_kill (叮 G5, headshots play it x2: G6; a punch and three concentric rings)
//   bells    pulao_bell_load / pulao_flick (a gilt bell on F5: the code's x1.5 / x1.68 / x1.89 sound C6 D6 E6),
//            pulao_bells (F5 + C6: x1.5 then x1.89 gives C-E-G-B), pulao_clink, pulao_ready_bell (一聲遠鐘 on F3: x0.75
//            sounds C3), pulao_mark (警世 outline lock), pulao_armor (鐘聲護體 +5)
//   dragon   pulao_roar (低沉龍吟: viewmodel and the ult's every third toll), pulao_roar_low (警世), pulao_bite
//   鐘彈     pulao_bellshot (the slug: a heavier shot + 「鏘」 + gold burst + a pulsing sound-wave wake),
//            pulao_bell_whoosh (falling bell, peaks 0.3 s in where it lands), pulao_bell_land, pulao_toll (the 3 m bell:
//            G3, x1 / x1.12 / x1.26 = G A B), pulao_pillar (上升音: the sound pillars toss)
//   警世     pulao_knell (one 8 m toll, G2, the biggest single strike)
//   百八鐘   §1.12 three layers: pulao_ult_inhale (rise 0.4 s: the dragon's inhale, a chord 0.8 -> 1.25) ->
//            pulao_ult_slam (40-60 Hz impact) -> pulao_ult_bed (北管 鑼鼓 + choir scored to the toll timeline) + release
//            (pulao_ult_tail: 餘音 and the deflating breath). Beats: pulao_ult_creak (鐘架吱嘎), pulao_ult_toll (the 6 m
//            bell on C3; PENTA x1 .. x3 = C3 D3 E3 G3 A3 C4 D4 E4 G4), pulao_ult_shatter (32 bronze shards)
//   other    ready_pulao (unique: a temple bell whose bloom turns into the dragon's 吼), pulao_crisis (金鐘罩: glaze
//            breaking on the bronze, the clamp, the cyan tail), pulao_final (KE_FINAL: gold column, a small bell
//            dropping), pulao_idle (§1.12 hum loop), pulao_draw_first, pulao_inspect (南管: 拍板 + 琵琶 phrase that the
//            three flicked bells continue), pulao_pump_flick
//   twin     <cue>_dusk for 蒲牢．暮鼓 (ready, toll, ult toll / slam / bed / shatter): -4 st + echo (§1.12) with the
//            evening drum under it. Not played yet (the twin is reserved).
//
// Mastering: within 1 LU of target at <= -1 dBTP (decoded). Each variant is soft-clipped towards the peak-to-loudness
// ratio its target needs (<= 6 dB of drive); a ringing cue that still needs more is mastered lower and lifted with the
// manifest vol (logged). References: the shot, the 鐘彈 and the 百八鐘 as the player hears them (preview + loudness).
//
//   node --max-old-space-size=2048 tools/audio/build.mjs --only premium_pulao
//   dev subset (never into the game folder: a subset run removes the other files of the category):
//   CF_AUDIO_OUT=tools/audio/out/pl-dev PL_ONLY=gun,theme node --max-old-space-size=2048 tools/audio/run-producer.mjs \
//     tools/audio/producers/premium_pulao.mjs --spectrograms all
import { makeKit } from './weapons.mjs';

const SR = 48000;
let L, ctx, K;
const midi = (m) => 440 * 2 ** ((m - 69) / 12);
const N = {};
for (const [n, m] of Object.entries({ C1: 24, G1: 31, C2: 36, G2: 43, A2: 45, C3: 48, D3: 50, E3: 52, F3: 53, G3: 55, A3: 57, C4: 60, D4: 62, E4: 64, G4: 67,
  A4: 69, C5: 72, D5: 74, E5: 76, F5: 77, G5: 79, A5: 81, C6: 84, D6: 86, E6: 88, G6: 91, A6: 93, C7: 96 })) N[n] = midi(m);
const TONE = 2 ** (2 / 12);                        // pulao.js TONE: a whole tone per toll
const PENTA = [1, 1.125, 1.25, 1.5, 1.667, 2, 2.25, 2.5, 3];   // pulao.js 百八鐘 pitches
// pulao.js toll times: 1.05 s, then intervals quickening 0.4 -> 0.2 s
const TOLLS = (() => { const t = [1.05]; for (let j = 0; j < 8; j++) t.push(t[j] + 0.4 - 0.2 * (j / 7)); return t; })();

const S = {
  // FFSL pump guns: near (spaced pair at the shooter) and mid takes
  nova: 'ffsl/Nova/O_21P', m12: 'ffsl/Model 12/K_22P', moss: 'ffsl/Mossberg/N_30P', cd: 'ffsl/CD/H_21P',
  novaMid: 'ffsl/Nova/O_17P', m12Mid: 'ffsl/Model 12/K_17P', mossMid: 'ffsl/Mossberg/N_26P',
  // bronze: real bells, gongs, the opera cymbal
  bellK: (i) => `kenney_impact/Audio/impactBell_heavy_00${i}`, gongCN: 'fs:127265', gongHard: 'fs:375531', gongScrape: 'fs:375550',
  opera: 'fs:452400', crash: 'fs:375497', cymRoll: 'fs:375519', clang: 'fs:201094', bangMetal: 'fs:244394',
  metalL: (i) => `kenney_impact/Audio/impactMetal_light_00${i}`, metalH: (i) => `kenney_impact/Audio/impactMetal_heavy_00${i}`,
  wood: (i) => `kenney_impact/Audio/impactWood_light_00${i}`, woodH: (i) => `kenney_impact/Audio/impactWood_heavy_00${i}`,
  punch: (i) => `kenney_impact/Audio/impactPunch_heavy_00${i}`,
  // drums, choir
  bdFff: 'fs:375260', bdFff2: 'fs:375261', timpRoll: 'fs:373943', choirA: 'fs:764329', choirB: 'fs:764330', choirO: 'fs:764339',
  // the dragon
  tiger: 'fs:263115', didg: 'fs:204912', beast: 'fs:170454', snarl: 'fs:342204', breath: 'fs:261464',
  // the street, breakage
  concrete: 'fs:522099', rubble: 'fs:569510', debris: 'fs:703247', deep: 'fs:258195', glass: 'fs:244238', plate: 'fs:565642', teacup: 'fs:389432',
  shards: 'fs:333988',
  // foley
  creakLong: 'fs:238289', creak: 'fs:119468', groan: 'fs:481787', chain: 'fs:361798', cloth: 'fs:494797', clothHeavy: 'fs:163164', swoosh: 'fs:60024',
};

// ------------------------------------------------------------------------------------------------ small helpers
const at = (buf, t = 0, gain = 0, pan) => (pan === undefined ? { buf, at: t, gain } : { buf, at: t, gain, pan });
const nrm = (b, db = -1) => L.normalizePeak(b, db);
const mono = (b) => (b.channels === 1 ? b : L.toMono(b));
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const cut = (b, len, fade = 0.3) => L.fadeOut(L.slice(b, 0, Math.min(len, b.duration)), Math.min(len, b.duration) * fade, 'exp');
const rmsOf = (b) => K.rmsOf(b);
let USED = new Set();                             // sources loaded since the last put() (per-sound credits)
const memo = new Map();
/** A source slice: mono (or one channel / stereo kept), pitched, filtered, faded, peak -1 dBFS. Memoised. */
async function src(id, start, end, { ch, stereo = false, hp = 40, lp, semis = 0, fadeIn = 0.002, fadeOut } = {}) {
  USED.add(id);
  const key = JSON.stringify([id, start, end, ch, stereo, hp, lp, semis, fadeIn, fadeOut]);
  if (memo.has(key)) return memo.get(key);
  let b = await ctx.load(id, { start, end });
  if (ch != null) b = K.chan(b, ch); else if (!stereo) b = L.toMono(b); else if (b.channels === 1) b = L.toStereo(b);
  if (semis) b = L.varispeedSemis(b, semis);
  b = L.eq(b, [{ type: 'hp', f: hp, order: 2 }, ...(lp ? [{ type: 'lp', f: lp, order: 2 }] : [])]);
  b = nrm(L.fadeOut(L.fadeIn(b, fadeIn, 'sine'), fadeOut ?? Math.min(0.05, b.duration * 0.2), 'exp'));
  if (memo.size > 60) memo.delete(memo.keys().next().value);
  memo.set(key, b);
  return b;
}
/** Start a slice at its transient (first sample within `rel` dB of its peak, walked back to where it rises). */
function strike(b, rel = -20) {
  const th = L.peak(b) * L.db2lin(rel);
  let i = 0;
  outer: for (; i < b.length; i++) for (const d of b.data) if (Math.abs(d[i]) > th) break outer;
  const lim = Math.max(0, i - Math.round(0.004 * SR));
  let j = i;
  while (j > lim && b.data.some((d) => Math.abs(d[j - 1]) > th * 0.08)) j--;
  return L.fadeIn(L.sliceSamples(b, j, b.length), 0.0008, 'sine');
}
/** A smooth random wobble in [-1, 1] (three detuned sines), seeded. */
function wobble(seed, hz = [3.7, 7.3, 12.9]) {
  const r = L.rng(L.hashSeed(seed)), ph = hz.map(() => r.next() * 6.283), w = hz.map((_, i) => 1 / (i + 1)), sum = w.reduce((a, b) => a + b, 0);
  return (t) => hz.reduce((a, f, i) => a + Math.sin(6.283 * f * t + ph[i]) * w[i], 0) / sum;
}
/** Equal-power pan that moves: p(t) in [-1, 1] (the centre sums to the source). */
function panMove(b, p) {
  const m = mono(b).data[0], n = m.length, l = new Float32Array(n), r = new Float32Array(n);
  for (let i = 0; i < n; i++) { const a = (clamp(p(i / SR), -1, 1) + 1) * Math.PI / 4; l[i] = m[i] * Math.cos(a) * Math.SQRT2; r[i] = m[i] * Math.sin(a) * Math.SQRT2; }
  return new L.Buf([l, r], SR);
}

// ------------------------------------------------------------------------------------------------ bronze
// mode sets [ratio, amp, t60 scale, doublet beat Hz]
// the temple bell (梵鐘 / 大鐘): a deep hum that outlasts everything, the strike tone, a minor-third second tone (the
// melancholy of cast bronze), fifth, octave and a long inharmonic run; the beats get faster up the series
const TEMPLE = [
  [0.5, 0.4, 1.45, 0.32], [1, 1, 1, 0.75], [1.19, 0.34, 0.72, 1.05], [1.5, 0.22, 0.55, 1.4], [2, 0.6, 0.5, 1.8], [2.42, 0.3, 0.42, 2.3],
  [2.97, 0.25, 0.34, 2.8], [3.58, 0.17, 0.27, 3.2], [4.28, 0.13, 0.21, 3.7], [5.16, 0.09, 0.16, 4.3], [6.25, 0.065, 0.12, 5], [7.55, 0.045, 0.09, 6], [9.1, 0.03, 0.07, 7],
];
// small gilt bells (the rack, the clapper beads): brighter, a short hum, dense upper modes
const GILT = [[0.5, 0.15, 1.2, 0.6], [1, 1, 1, 1.4], [1.2, 0.42, 0.7, 2], [1.5, 0.3, 0.55, 2.4], [2, 0.62, 0.5, 3], [2.52, 0.24, 0.32, 3.6], [3.01, 0.2, 0.24, 4.2], [4.1, 0.11, 0.15, 5], [5.3, 0.06, 0.1, 6]];
/**
 * A cast bronze bell, additive: every mode a slowly beating doublet (the casting is never quite round), its own decay
 * (high modes die first), `bright` dB / octave of tilt, `attack` s of onset ramp. Recursive phasors (fast).
 */
function bellCore(f, dur, { list = TEMPLE, t60 = 3, seed = 'bell', beat = 1, bright = 0, attack = 0.0006, maxF = 15000 } = {}) {
  const n = Math.round(dur * SR), o = new Float64Array(n), r = L.rng(L.hashSeed(seed));
  for (const [ratio, a0, tk, bHz] of list) {
    const fr = f * ratio;
    if (fr > maxF) continue;
    const amp = a0 * 10 ** ((bright * Math.log2(ratio)) / 20) * (0.9 + 0.2 * r.next());
    for (const [df, ga, td] of [[0, 1, 1], [bHz * beat * (0.8 + 0.4 * r.next()), 0.62, 0.88]]) {
      const T = Math.max(0.005, t60 * tk * td), d = Math.exp(-6.907755 / (T * SR)), w = 2 * Math.PI * (fr + df) / SR;
      const cw = Math.cos(w), sw = Math.sin(w), m = Math.min(n, Math.ceil(T * 3 * SR)), ph = r.next() * 2 * Math.PI;
      let c = Math.cos(ph), s = Math.sin(ph), g = amp * ga;
      for (let i = 0; i < m; i++) { o[i] += s * g; const c2 = c * cw - s * sw; s = s * cw + c * sw; c = c2; g *= d; }
    }
  }
  const na = Math.max(1, Math.round(attack * SR)), out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = o[i] * (i < na ? Math.sin((i / na) * Math.PI / 2) : 1);
  return new L.Buf([out], SR);
}
/** A struck bell: the modes + a filtered strike tick (small bells). */
const ding = (f, dur, o = {}) => L.mix([at(nrm(bellCore(f, dur, { list: GILT, ...o }))), at(nrm(L.noiseBurst({ dur: 0.012, decay: 0.003, hp: Math.min(9000, f * 1.6), lp: 15000, seed: (o.seed || 'd') + 't' })), 0, o.tick ?? -18)]);
/** The strike's metallic splash: a dense cloud of high inharmonic modes that dies within ~0.2 s. */
function clang(f, { n = 18, lo = 2.6, hi = 15, t60 = 0.16, seed = 'clang', dur = 0.6 } = {}) {
  const r = L.rng(L.hashSeed(seed)), list = [];
  for (let i = 0; i < n; i++) { const ratio = lo * (hi / lo) ** r.next(); if (f * ratio < 15000) list.push([ratio, (0.4 + 0.6 * r.next()) * Math.sqrt(lo / ratio), t60 * (0.35 + 0.9 * r.next()) * (lo / ratio) ** 0.25]); }
  return L.partials(dur, { base: f, list, seed });
}
/** The toll's air: a shove of low-passed noise whose cutoff falls as the wave passes (the 「轟」 of the shockwave). */
function airwave(dur, { f0 = 1600, f1 = 110, fall = 0.12, attack = 0.004, seed = 'aw', color = 'pink' } = {}) {
  const s = L.sweep(L.noise(dur, { color, seed }), 'lp', (t) => f1 + (f0 - f1) * Math.exp(-t / fall), { q: 0.8 });
  return nrm(L.automate(s, (t) => Math.min(1, t / attack) * Math.exp(-t * 6.9 / dur)));
}
/** Low impact: a pitched-down thump with harmonics laptop speakers can carry. */
const boom = (seed, { f0 = 72, f1 = 40, sweep = 0.07, decay = 0.55, drive = 2.5, amount = -4 } = {}) => nrm(L.psychoBass(L.thump({ f0, f1, sweep, decay, click: 0.05, drive, seed }), { freq: 110, amount }));
/** 撞木: the log that strikes a temple bell — the concert bass drum's dull skin taken short, a wood knock, the thud. */
async function beam(seed, { semis = -3, ring = 0.26, k = 0 } = {}) {
  const skin = L.decay(strike(await src(S.bdFff, 0.05, 1.4, { hp: 30, semis })), ring, 0.012);
  const wood = strike(await src(S.woodH(k % 5), 0, 0.5, { hp: 80, semis: -5 }));
  const knock = L.noiseBurst({ dur: 0.06, attack: 0.0004, decay: 0.018, color: 'pink', hp: 120, lp: 1400, seed: seed + 'k' });
  return nrm(L.mix([at(nrm(skin)), at(wood, 0, -5), at(nrm(knock), 0, -9)]));
}
/** The bronze throat: a voice rung through a short cast-bronze resonance. */
function throat(b, f, { wet = 0.5, t60 = 0.22, seed = 'th' } = {}) {
  const ir = nrm(bellCore(f, t60 * 1.6, { list: GILT, t60, seed, bright: 1 }), 0);
  const w = L.convolve(mono(b), ir, { wetOnly: true });
  return L.mix([at(b), { buf: L.scale(w, L.peak(b) / Math.max(1e-9, L.peak(w))), gainLin: wet }]);
}
/** The 暮鼓 / ult drum: the concert bass drum fff whole, a membrane thump with its pitch drop, the beater. */
async function bigDrum(seed, { semis = 0, ring = 0.7, sub = -5, k = 0 } = {}) {
  const skin = L.decay(strike(await src(k % 2 ? S.bdFff2 : S.bdFff, 0.05, 3, { hp: 25, semis })), ring, 0.015);
  const memb = L.thump({ f0: 96, f1: 50, sweep: 0.05, decay: ring * 0.55, click: 0.2, drive: 2.2, seed: seed + 'm' });
  const beater = L.noiseBurst({ dur: 0.03, attack: 0.0003, decay: 0.008, bp: 1400, q: 0.7, seed: seed + 'b' });
  return nrm(L.psychoBass(L.mix([at(nrm(skin)), at(nrm(memb), 0, sub), at(nrm(beater), 0, -13)]), { freq: 100, amount: -5 }));
}

// ------------------------------------------------------------------------------------------------ spaces
// a temple yard between buildings: bright early echoes off walls, a long tail (bells hang in it)
const YARD = {
  length: 3.6, predelay: 0.02,
  echoes: { count: 14, t: [0.03, 0.6], gain: [0.15, 0.45], lp: [7000, 2200], spread: [0.003, 0.03], pan: 1 },
  tail: { rt60: 2.6, rtLow: 3.0, rtHigh: 1.2, gain: 0.55, start: 0.05, build: 0.15, lp: 5500, hp: 70 },
};
// a bronze hall (inspect, ready, first draw)
const HALL = {
  length: 2.6, predelay: 0.018,
  echoes: { count: 16, t: [0.02, 0.32], gain: [0.18, 0.42], lp: [7500, 3000], spread: [0.002, 0.02], pan: 1 },
  tail: { rt60: 2.0, rtLow: 2.3, rtHigh: 1.1, gain: 0.55, start: 0.03, build: 0.1, lp: 6500, hp: 90 },
};
/** Dry + a space whose send is high-passed (`hp`): booms stay tight, the room carries the bronze. ch 1 or 2. */
function space(b, env, { wet = 0.4, seed = 'sp', ch = 1, length, hp = 140, dry = 1 } = {}) {
  const x = ch === 1 ? mono(b) : L.setChannels(b, 2);
  const w = L.convolve(L.eq(x, [{ type: 'hp', f: hp, order: 2 }]), L.makeIR(env, { seed, channels: ch, length }), { wetOnly: true });
  return L.mix([{ buf: x, gainLin: dry }, { buf: w, gainLin: wet }], { channels: ch });
}

// ------------------------------------------------------------------------------------------------ mastering
const META = {};
/**
 * Master + add: each variant soft-clipped towards the peak-to-loudness ratio the target needs (<= `drive` dB); a cue
 * whose natural crest still needs more is mastered lower (all variants together) and lifted with the manifest vol
 * (<= 1.5). Short one-shots get the Vorbis loudness loss pre-compensated (premium_bifang). Sources since the last
 * call are credited to this sound.
 */
const plrOf = (b) => L.truePeakDb(b) - L.lufs(b);
/** Soft-clip towards PLR `tgt` (<= `drive` dB); a variant the clipper cannot bring there (a dominant strike over a long
 *  ring) gets a gentle compressor first, so one peaky take does not set the level of the whole set. */
function shapeTo(b, tgt, drive) {
  if (plrOf(b) <= tgt) return b;
  let o = K.clipToPLR(b, tgt, { min: 0, max: drive, threshold: -6 }), p = plrOf(o);
  if (p > tgt + 0.5) {
    const c = L.slice(L.compress(L.pad(L.normalizePeak(b, -1), 0.004, 0), { threshold: -18, ratio: 2.5, attack: 0.002, release: 0.08, knee: 6, lookahead: 0.003 }), 0.004);
    const o2 = K.clipToPLR(c, tgt, { min: 0, max: drive, threshold: -6 }), p2 = plrOf(o2);
    if (p2 < p - 0.3) { o = o2; p = p2; }
  }
  return o;
}
async function put(cat, name, bufs, o) {
  bufs = (Array.isArray(bufs) ? bufs : [bufs]).filter(Boolean);
  const spatial = o.spatial ?? true, ch = o.channels ?? (spatial ? 1 : 2), want = o.lufs;
  let out = bufs.map((b) => L.setChannels(b, ch)), lufs = want, volDb = 0;
  if (!o.loop) {
    out = out.map((b) => shapeTo(b, -2.0 - want, o.drive ?? 6));
    const plr = out.map(plrOf);
    const reach = -0.7 - Math.max(...plr);         // ~0.7 dB of limiting at the -1.4 dBTP master
    if (reach < want - 0.05) lufs = Math.max(want - 6, Math.floor(reach * 10) / 10);
    volDb = want - lufs;
    // `mmax`: long ringing cues are levelled by their loudest 400 ms as heard (momentary max x vol), not by an
    // integrated loudness averaged over the ring (three overlapping tolls at an integrated target came out at
    // -3 LUFS momentary, 9 dB over a shot)
    let mm = '';
    if (o.mmax != null) {
      const m = out.reduce((a, b) => a + L.loudness(b).momentaryMax - L.lufs(b), 0) / out.length + lufs;
      volDb = o.mmax - m;
      mm = `, momentary max ${m.toFixed(1)} -> ${o.mmax} as heard`;
    }
    ctx.log(`  ${name}: PLR ${plr.map((x) => x.toFixed(1)).join(' ')}${lufs < want ? `  -> mastered at ${lufs} LUFS` : ''}${mm}, vol ${volDb >= 0 ? '+' : ''}${volDb.toFixed(1)} dB`);
    if (out.every((b) => b.duration < 0.4)) {
      const fin = [];
      for (const b of out) {
        let m = L.finalize(b, { lufs, ceiling: -1.4, channels: ch });
        const loss = lufs - L.lufs(await L.decodeBytes(await L.encodeOgg(m, { quality: 0.5 }), 'trim.ogg'));
        if (Math.abs(loss) > 0.1) { m = L.gain(m, loss); if (L.truePeakDb(m) > -1.4) m = L.limit(m, { ceiling: -1.4 }); }
        fin.push(m);
      }
      out = fin; o = { ...o, normalize: false };
    } else {
      // codec-aware pre-master (weapons.mjs codecSafe): bright, clipped bronze overshoots 1-2 dB through Vorbis, which
      // cat.add() would otherwise take back out of the loudness (pulao_fire_5 landed 2 LU short)
      const fin = [];
      for (const b of out) { K.codecLog.length = 0; fin.push(await K.codecSafe(b, lufs, { quality: o.quality ?? 0.5, release: 0.015 })); }
      out = fin;
    }
  }
  const vRaw = (o.vol ?? 1) * L.db2lin(volDb), vol = Math.round(Math.min(1.5, vRaw) * 100) / 100;
  if (vRaw > 1.505) ctx.warn(`${name}: vol wanted ${vRaw.toFixed(2)}, capped at 1.5`);
  META[name] = { lufs, vol, ch };
  const sources = o.sources ?? [...USED];
  USED = new Set();
  const { drive, mmax, ...rest } = o;
  const opts = { ...rest, lufs, vol, channels: ch, spatial, sources, ...(o.loop ? {} : { limiter: { release: 0.015, ...(o.limiter || {}) } }) };
  for (let attempt = 1; ; attempt++) {
    try { return await cat.add(name, out, opts); } catch (e) {
      if (!/EPERM|EBUSY|EACCES/.test(e.code || '') || attempt >= 6) throw e;
      ctx.warn(`${name}: ${e.code} writing a file, retry ${attempt}/5`);
      cat.reports = cat.reports.filter((r) => r.sound !== name);
      await new Promise((res) => setTimeout(res, 1500 * attempt));
    }
  }
}
const SP = (range, o = {}) => ({ spatial: true, channels: 1, range, ...o });      // positional (mono)
const SP2 = (range, o = {}) => ({ spatial: true, channels: 2, range, ...o });     // 2D for the caster, positional for others
// 2D (local only): always stereo. A mono buffer played without a panner is up-mixed to both speakers (+3 dB over its
// one-channel loudness); the equal-power panner of a positional sound keeps a centred mono source at that loudness
const D2 = (o = {}) => ({ spatial: false, channels: 2, ...o });

// ------------------------------------------------------------------------------------------------ the gun
const GUN = {
  // [source, onset s, semis]: pump-gun takes, a touch down for the bronze's weight
  near: [[S.nova, 0.431, -0.7], [S.m12, 0.842, -0.9], [S.moss, 1.697, -0.8], [S.nova, 3.465, -0.8], [S.m12, 7.445, -1.0]],
  mid: [[S.novaMid, 0.694, -0.7], [S.m12Mid, 0.907, -0.9], [S.mossMid, 4.574, -0.8]],
  close: { direct: 0.14, len: 0.4, hp: 45, crack: -8.5, plr: 10.8, eq: [{ type: 'peak', f: 120, gain: 3, q: 0.8 }, { type: 'peak', f: 300, gain: 1, q: 1 }, { type: 'peak', f: 2000, gain: 1.5, q: 1 }],
    bal: { sub: -10, low: -5, lowMid: -4.5, mid: -5.5, high: -11.5, air: -16.5 } },
};
/** The bell mouth's resonance (C5 gilt bronze, short): what the blast is rung through. */
const bloomIR = (seed = 'bloom') => nrm(bellCore(N.C5, 0.4, { list: GILT, t60: 0.2, seed, bright: 0.5 }), 0);
/**
 * The close layer (weapons.mjs designClose + one layer of our own): recorded blast (transient clipped first) + crack +
 * body + sub + the first 40 ms of the blast rung through the bronze bell mouth; parallel compression, psycho-bass,
 * exciter, width, early room, envelope, tone, band balance, PLR clipper.
 */
function bellClose(shot, k, ir, { bloom = -9, plr } = {}) {
  const C = GUN.close, r = ctx.rng(`pulao_close_${k}`), seed = `plc${k}`;
  let d = K.chan(shot, k % 2);
  d = L.slice(d, 0, C.direct + 0.03);
  d = L.eq(d, [{ type: 'hp', f: C.hp, order: 4 }, ...C.eq]);
  d = L.automate(d, (t) => (t < C.direct * 0.45 ? 1 : Math.exp(-(((t - C.direct * 0.45) / (C.direct * 0.32)) ** 1.5))));
  d = L.softClip(L.gain(L.normalizePeak(d, 0), 6), { threshold: -10, ceiling: -1 });
  const lay = (buf, dB, win, t = 0) => ({ buf, at: t, gainLin: (rmsOf(L.slice(d, 0, win)) / Math.max(1e-9, rmsOf(L.slice(buf, 0, win)))) * L.db2lin(dB) });
  const f = 1 + r.range(-0.05, 0.05);
  const body = L.eq(L.thump({ f0: 168 * f, f1: 72 * f, sweep: 0.02, decay: 0.15, click: 0, drive: 2.5, seed: seed + 'b' }), [{ type: 'hp', f: 70, order: 2 }]);
  const sub = L.thump({ f0: 84, f1: 43, sweep: 0.035, decay: 0.16, click: 0, drive: 1.2, seed: seed + 's' });
  const ring = L.eq(L.convolve(L.slice(d, 0, 0.04), ir, { wetOnly: true }), [{ type: 'hp', f: 300, order: 2 }]);
  const layers = [{ buf: d }, lay(K.crack(seed + 'c', {}), C.crack + r.range(-1, 1), 0.006), lay(body, -4.5 + r.range(-0.8, 0.8), 0.05),
    lay(sub, -9.5 + r.range(-1, 1), 0.08), lay(ring, bloom + r.range(-1, 1), 0.1, 0.001)];
  let m = L.normalizePeak(L.mix(layers), 0);
  const pre = 0.004;
  const crushed = L.slice(L.compress(L.pad(m, pre, 0), { threshold: -26, ratio: 6, attack: 0.0008, release: 0.015, knee: 6, makeup: 15, lookahead: 0.002 }), pre);
  m = L.mix([{ buf: m, gainLin: 1 - 0.55 * 0.5 }, { buf: crushed, gainLin: 0.55 }]);
  m = L.psychoBass(m, { freq: 120, amount: -9 });
  m = L.exciter(m, { freq: 2500, drive: 10, amount: -12 });
  m = L.stereoize(m, { width: 0.3, hp: 350, seed: seed + 'st' });
  m = L.reverb(m, 'smallRoom', { wet: 0.18, seed: seed + 'rm', length: 0.4 });
  m = L.slice(m, 0, C.len);
  m = L.automate(m, (t) => (t < C.len * 0.3 ? 1 : Math.pow(1 - (t - C.len * 0.3) / (C.len * 0.7), 2.2)));
  m = L.eq(m, [{ type: 'peak', f: 1700, gain: 3, q: 0.55 }, { type: 'hp', f: 38, order: 4 }]);
  m = K.balance(m, C.bal, 0.75);
  return L.pad(K.clipToPLR(m, plr ?? C.plr, { min: 3, max: 22, threshold: -16 }), 0.003, 0);
}

async function gunSet(cat, keep) {
  ctx.log('-- gun');
  const ir = bloomIR();
  const closes = [], log = [];
  for (let k = 0; k < GUN.near.length; k++) {
    const [id, t, s] = GUN.near[k];
    const shot = await K.loadShot(id, t, 0.75, { semis: s });
    let best = null;
    for (let a = 0; a < 4; a++) {
      K.codecLog.length = 0;
      const m = await K.codecSafe(bellClose(shot, k + a * 101, ir), -12);
      const info = K.codecLog[0], score = info.limitedDb + Math.max(0, info.decTp + 1.3) * 3 + (Math.abs(info.lufs + 12) > 0.25 ? 50 : 0);
      if (!best || score < best.score) best = { m, info, score, a };
      if (score <= 2) break;
    }
    log.push(`lim ${best.info.limitedDb} dTP ${best.info.decTp} (take ${best.a + 1})`);
    closes.push(best.m);
  }
  ctx.log(`  pre-master pulao_close: ${log.join(' | ')}`);
  keep.close = closes;
  const srcs = [...new Set([...GUN.near.map((n) => n[0]), ...GUN.mid.map((n) => n[0])])];
  await cat.add('pulao_close', closes, { lufs: -12, quality: 0.6, maxLimitDb: 6, limiter: { release: 0.02 }, spatial: true, range: [12, 60], channels: 2, voices: 4, pitch: [0.97, 1.03], priority: 3, sources: srcs });
  USED = new Set();
  META.pulao_close = { lufs: -12, vol: 1 };

  // tail: the street's reflections + the bell mouth's ring heard in them
  const G = { name: 'pulao', close: { direct: GUN.close.direct }, tail: { len: 2.3, rec: 0 }, far: { dist: 170, len: 2.3 } };
  const tails = [];
  for (let k = 0; k < 3; k++) {
    const [id, t0, s] = GUN.near[k];
    const shot = await K.loadShot(id, t0, G.close.direct + G.tail.len + 0.1, { semis: s });
    const t = K.designTail(G, shot, k);
    const ring = L.convolve(bellCore(N.C5 * (1 + k * 0.002), 1.4, { list: GILT, t60: 0.8, seed: `tr${k}`, bright: -2 }), L.makeIR('urban', { seed: `tri${k}`, channels: 2 }), { wetOnly: true });
    tails.push(K.trimEnd(L.mix([at(t), { buf: ring, gainLin: rmsOf(t) / Math.max(1e-9, rmsOf(ring)) * L.db2lin(-15), at: 0.02 }], { length: t.duration, channels: 2 })));
  }
  keep.tail = tails;
  await put(cat, 'pulao_tail', tails, D2({ lufs: -20, voices: 3, pitch: [0.98, 1.02], maxHeadMs: 250, sources: srcs }));

  // far: the mid takes pushed further + the bell carrying (bells are heard far beyond the shot)
  const fars = [];
  for (let k = 0; k < 3; k++) {
    const [id, t0, s] = GUN.mid[k];
    const shot = await K.loadShot(id, t0, Math.max(0.7, G.far.len + 0.1), { semis: s });
    const f = K.designFar(G, shot, k, true);
    let bl = L.airAbsorption(bellCore(N.C5, 2.0, { list: GILT, t60: 1.2, seed: `fb${k}` }), 170);
    bl = L.convolve(bl, L.makeIR('field', { seed: `fbi${k}`, channels: 1 }), { wet: 0.8, dry: 0.35 });
    fars.push(L.mix([at(f), { buf: bl, gainLin: rmsOf(f) / Math.max(1e-9, rmsOf(bl)) * L.db2lin(-10), at: 0.012 }], { length: f.duration }));
  }
  await put(cat, 'pulao_far', fars, SP([40, 420], { lufs: -22, voices: 4, pitch: [0.96, 1.04], priority: 2, maxHeadMs: 60, sources: srcs }));
}

// ------------------------------------------------------------------------------------------------ theme layer + hits
async function themeSet(cat, keep) {
  ctx.log('-- theme');
  // pulao_fire: the bell mouth rings its own note (C5: a cast bell rings the same note every time, ±6 cents), the
  // §1.12 luxury transient (30 ms, 6-10 kHz, -12 dB) and the crown's three sound rings leaving (a short ring-modulated
  // band sweep). High-passed: under ~400 Hz the gun owns the mix.
  const fires = [];
  for (let k = 0; k < 5; k++) {
    const r = ctx.rng(`fire${k}`), f = N.C5 * 2 ** (r.range(-6, 6) / 1200);
    const ring = bellCore(f, 1.2, { list: GILT, t60: 0.8, seed: `fr${k}`, bright: -1.5 });
    const lux = L.mix([at(nrm(L.noiseBurst({ dur: 0.03, decay: 0.01, bp: 8000, q: 1.3, seed: `fl${k}` }))),
      at(nrm(L.partials(0.035, { base: 7000 * (1 + r.range(-0.04, 0.04)), list: [[1, 1, 0.02], [1.29, 0.6, 0.015]], seed: `flp${k}` })), 0, -4)]);
    const rate = 30 + r.range(-3, 3);
    const rings = L.automate(L.sweep(L.noise(0.16, { color: 'pink', seed: `fw${k}` }), 'bp', (t) => 2000 * Math.exp(-t / 0.06) + 520, { q: 1.4 }),
      (t) => Math.min(1, t / 0.003) * Math.exp(-t * 26) * (0.55 + 0.45 * Math.cos(2 * Math.PI * rate * t)));
    const p = k % 2 ? 0.18 : -0.18;
    let m = L.mix([at(nrm(ring), 0.004, 0, p), at(nrm(lux), 0, -12), at(nrm(rings), 0.002, -11, -p)], { channels: 2, length: 1.2 });
    m = L.eq(m, [{ type: 'hp', f: 400, order: 4 }]);
    m = L.reverb(m, 'smallRoom', { wet: 0.14, seed: `frr${k}`, length: 0.6 });
    fires.push(cut(m, 1.15, 0.5));
  }
  keep.fire = fires;
  await put(cat, 'pulao_fire', fires, D2({ lufs: -13, mmax: -12, voices: 3, pitch: [0.997, 1.003], note: 'theme layer on every shot (handler volume 0.32): the bell mouth rings C5' }));

  // pulao_hit: a volley that hit (handler 0.32): a dull bronze 「咚」 (G4, the sound wave passing through), the punch, a
  // short ring of air
  const hits = [];
  for (let k = 0; k < 4; k++) {
    const r = ctx.rng(`hit${k}`);
    const tong = bellCore(N.G4 * 2 ** (r.range(-8, 8) / 1200), 0.6, { list: TEMPLE, t60: 0.32, seed: `ht${k}`, bright: -2 });
    const pu = strike(await src(S.punch(k), 0, 0.5, { hp: 120 }));
    const wv = airwave(0.18, { f0: 2400, f1: 300, fall: 0.04, seed: `hw${k}` });
    let m = L.mix([at(nrm(tong), 0.003), at(pu, 0, -4), at(wv, 0.002, -10)], { length: 0.55 });
    hits.push(L.psychoBass(cut(m, 0.55, 0.5), { freq: 110, amount: -10 }));
  }
  await put(cat, 'pulao_hit', hits, D2({ lufs: -16, mmax: -14, voices: 2, pitch: [0.97, 1.03] }));
  // pulao_head: brighter — a C6 / G6 gilt dyad, a glassy cyan 「叮」 and a crisp crack over the punch
  const heads = [];
  for (let k = 0; k < 3; k++) {
    const dy = L.mix([at(nrm(bellCore(N.C6, 0.8, { list: GILT, t60: 0.45, seed: `hd${k}` }))), at(nrm(bellCore(N.G6, 0.8, { list: GILT, t60: 0.38, seed: `hd2${k}` })), 0.006, -4)]);
    const glint = L.partials(0.25, { base: 5200 + k * 260, list: [[1, 1, 0.07], [1.37, 0.6, 0.05], [1.93, 0.35, 0.035]], seed: `hg${k}` });
    const crack = L.noiseBurst({ dur: 0.012, attack: 0.0002, decay: 0.003, hp: 3000, lp: 14000, seed: `hc${k}` });
    const pu = strike(await src(S.punch((k + 2) % 5), 0, 0.5, { hp: 150 }));
    let m = L.mix([at(nrm(dy), 0.002), at(nrm(glint), 0.004, -9), at(nrm(crack), 0, -8), at(pu, 0, -7)], { length: 0.75 });
    heads.push(cut(m, 0.75, 0.5));
  }
  await put(cat, 'pulao_head', heads, D2({ lufs: -15, mmax: -13, voices: 2, pitch: [0.98, 1.02] }));

  // pulao_kill (KE_BELL, positional; a headshot plays it x2): 叮 G5 + a punch + three concentric rings of air + sparks
  const kills = [];
  for (let k = 0; k < 4; k++) {
    const r = ctx.rng(`kill${k}`);
    const dg = ding(N.G5 * 2 ** (r.range(-5, 5) / 1200), 1.3, { t60: 1.0, seed: `kd${k}`, bright: -0.5, tick: -14 });
    const nom = bellCore(N.G5 * 2, 0.6, { list: GILT.slice(1, 6), t60: 0.3, seed: `kn${k}` });
    const punch = L.thump({ f0: 170, f1: 70, sweep: 0.02, decay: 0.12, drive: 3, seed: `kp${k}` });
    const ringsB = L.mix([0, 0.07, 0.14].map((t, i) => at(airwave(0.16, { f0: 1800 - i * 300, f1: 260, fall: 0.03, seed: `kr${k}${i}` }), t, -i * 3)));
    const sparks = L.automate(L.crackle(0.3, { density: 80, decay: 0.0015, hp: 4000, seed: `ks${k}` }), (t) => Math.exp(-t * 10));
    let m = L.mix([at(dg), at(nrm(nom), 0.002, -10), at(nrm(punch), 0, -6), at(nrm(ringsB), 0.004, -9), at(nrm(sparks), 0.01, -20)], { length: 1.3 });
    m = space(L.psychoBass(m, { freq: 110, amount: -10 }), YARD, { wet: 0.22, seed: `kv${k}`, length: 1.4 });
    kills.push(cut(m, 1.3, 0.45));
  }
  await put(cat, 'pulao_kill', kills, SP([4, 50], { lufs: -17, mmax: -13, voices: 4, pitch: [1, 1], priority: 2 }));
}

// ------------------------------------------------------------------------------------------------ the little bells
async function bellSet(cat, keep) {
  ctx.log('-- bells');
  // pulao_bell_load: a gilt bell on F5 (played x1.5 / x1.68 / x1.89: C6 D6 E6) lights: the strike, the gold shimmer
  // swelling a moment after (the clapper bead turning gilt)
  const loads = [];
  for (let k = 0; k < 3; k++) {
    const b = ding(N.F5 * 2 ** ((k - 1) * 3 / 1200), 1.5, { t60: 1.1, seed: `bl${k}`, tick: -16 });
    const sh = bellCore(N.F5 * 4, 0.9, { list: [[1, 1, 1, 3], [1.33, 0.6, 0.7, 4], [1.78, 0.35, 0.5, 5]], t60: 0.6, attack: 0.04, seed: `bls${k}` });
    let m = L.mix([at(b, 0, 0, -0.1), at(nrm(sh), 0.02, -17, 0.25)], { channels: 2 });
    loads.push(cut(L.reverb(m, 'smallRoom', { wet: 0.16, seed: `blr${k}`, length: 0.7 }), 1.5, 0.45));
  }
  await put(cat, 'pulao_bell_load', loads, D2({ lufs: -18, mmax: -14, voices: 3, pitch: [1, 1] }));

  // pulao_bells (ring3, played x1.5 and 60 ms later x1.89): F5 + C6 struck together on the rack + the clappers' jingle
  const rings = [];
  for (let k = 0; k < 2; k++) {
    const r = ctx.rng(`br${k}`);
    const a = ding(N.F5, 1.6, { t60: 1.1, seed: `bra${k}`, tick: -15 }), b = ding(N.C6, 1.6, { t60: 1.0, seed: `brb${k}`, tick: -15 });
    const jing = L.mix([0, 1, 2].map((i) => at(bellCore(N.F5 * [1, 1.5, 2][i] * (1 + r.range(-0.004, 0.004)), 0.2, { list: GILT, t60: 0.07, seed: `brj${k}${i}` }), 0.028 + i * 0.019, -9 - i * 2)));
    let m = L.mix([at(a, 0, 0, -0.3), at(b, 0.016 + r.range(0, 0.008), -2, 0.3), at(nrm(jing), 0, -10, 0)], { channels: 2 });
    rings.push(cut(L.reverb(m, 'smallRoom', { wet: 0.16, seed: `brr${k}`, length: 0.7 }), 1.6, 0.45));
  }
  await put(cat, 'pulao_bells', rings, D2({ lufs: -18, mmax: -14, voices: 4, pitch: [1, 1] }));

  // pulao_flick (inspect / rare idle; x1.5 .. x1.89): a fingernail tick, the F5 bell rung softer and longer
  const flicks = [];
  for (let k = 0; k < 3; k++) {
    const nail = L.noiseBurst({ dur: 0.008, attack: 0.0002, decay: 0.0018, bp: 3600, q: 1.6, seed: `fn${k}` });
    const b = ding(N.F5 * 2 ** ((k - 1) * 2 / 1200), 1.9, { t60: 1.4, seed: `fb${k}`, tick: -22, bright: -1 });
    let m = L.mix([at(nrm(nail), 0, -6), at(b, 0.004, 0)], { channels: 2 });
    flicks.push(cut(L.reverb(m, 'smallRoom', { wet: 0.18, seed: `fr${k}`, length: 0.8 }), 1.9, 0.45));
  }
  await put(cat, 'pulao_flick', flicks, D2({ lufs: -19, mmax: -14, voices: 3, pitch: [1, 1] }));

  // pulao_clink: two small bells knocking as they swing (handler 0.12): dull, short, untuned
  const clinks = [];
  for (let k = 0; k < 4; k++) {
    const r = ctx.rng(`ck${k}`), f = N.F5 * 2 ** (r.range(-3, 5) / 12);
    const a = bellCore(f, 0.3, { list: GILT, t60: 0.12, seed: `cka${k}`, bright: -3 }), b = bellCore(f * 1.27, 0.3, { list: GILT, t60: 0.09, seed: `ckb${k}`, bright: -3 });
    const t = L.noiseBurst({ dur: 0.01, decay: 0.002, bp: 2600, q: 1.2, seed: `ckt${k}` });
    clinks.push(cut(L.mix([at(nrm(a)), at(nrm(b), 0.004, -4), at(nrm(t), 0, -10)], { length: 0.3 }), 0.3, 0.5));
  }
  await put(cat, 'pulao_clink', clinks, D2({ lufs: -22, mmax: -18, voices: 2, pitch: [0.95, 1.05] }));

  // pulao_ready_bell (一聲遠鐘, played x0.75 = C3): a temple bell across the town — soft strike, air, mostly the yard
  const far = [];
  for (let k = 0; k < 2; k++) {
    // (bright -1.5 / 150 m of air: at -3 dB per octave and 260 m it was all 87 / 175 Hz, a hum laptops cannot play)
    const core = bellCore(N.F3, 3.4, { list: TEMPLE, t60: 3.0, seed: `rb${k}`, bright: -1.5, attack: 0.01 });
    let m = L.mix([at(nrm(core)), at(await beam(`rbb${k}`, { k }), 0, -16)]);
    m = L.psychoBass(L.airAbsorption(m, 150), { freq: 110, amount: -9 });
    m = space(m, YARD, { wet: 0.9, dry: 0.5, seed: `rby${k}`, ch: 2, length: 3.4, hp: 90 });
    far.push(cut(m, 3.4, 0.4));
  }
  await put(cat, 'pulao_ready_bell', far, D2({ lufs: -18, mmax: -14, voices: 2, pitch: [1, 1] }));

  // pulao_mark (警世: elites outlined): a two-note gilt lock (A5, E6) over a soft bronze 「咚」 and a spinning-ring shimmer
  const marks = [];
  for (let k = 0; k < 2; k++) {
    const a = ding(N.A5, 0.9, { t60: 0.6, seed: `ma${k}`, tick: -14 }), e = ding(N.E6, 0.9, { t60: 0.7, seed: `me${k}`, tick: -14 });
    const spin = L.automate(L.partials(0.7, { base: 2637, list: [[1, 1, 0.6], [1.19, 0.7, 0.5]], seed: `ms${k}` }), (t) => Math.min(1, t / 0.05) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 14 * t)));
    const tong = bellCore(N.C4, 0.7, { list: TEMPLE, t60: 0.5, seed: `mt${k}`, bright: -3 });
    let m = L.mix([at(a, 0, 0, -0.25), at(e, 0.075, -1, 0.25), at(nrm(spin), 0.06, -16), at(nrm(tong), 0, -11)], { channels: 2 });
    marks.push(cut(L.reverb(m, 'smallRoom', { wet: 0.15, seed: `mr${k}`, length: 0.6 }), 1.0, 0.5));
  }
  await put(cat, 'pulao_mark', marks, D2({ lufs: -19, mmax: -14, voices: 1, pitch: [1, 1] }));

  // pulao_armor (鐘聲護體 +5, handler 0.35): a warm bronze swell, a gold 「鏘」 of air, one high ping
  const arm = [];
  for (let k = 0; k < 2; k++) {
    const hum = bellCore(N.C4, 0.8, { list: TEMPLE, t60: 0.6, seed: `ah${k}`, bright: -3, attack: 0.03 });
    const sh = L.automate(L.sweep(L.noise(0.5, { color: 'white', seed: `as${k}` }), 'bp', (t) => 4000 * 2 ** (t / 0.25), { q: 3 }), (t) => Math.min(1, t / 0.06) * Math.exp(-Math.max(0, t - 0.06) * 9));
    const p = ding(N.E6, 0.6, { t60: 0.4, seed: `ap${k}`, tick: -20 });
    arm.push(cut(L.mix([at(nrm(hum)), at(nrm(sh), 0, -12), at(p, 0.04, -6)], { length: 0.75 }), 0.75, 0.5));
  }
  await put(cat, 'pulao_armor', arm, D2({ lufs: -20, mmax: -14, voices: 1, pitch: [0.99, 1.01] }));
}

// ------------------------------------------------------------------------------------------------ the dragon
/**
 * 蒲牢's roar: a tiger's roar taken down (f0 ~100 -> ~75 Hz), a didgeridoo roar for the drone, an angry beast's growl
 * for the grit, a sung 吟 on the roar's contour through an 'o' vowel, all rung through a bronze throat, a little tube.
 */
async function dragonRoar(k, { semis = -5, len = 1.5, low = 0, seed = 'roar', sing = -15, grit = -9 } = {}) {
  const r = ctx.rng(seed + k);
  const tiger = await src(S.tiger, 0.98, 2.12, { hp: 55, semis: semis + r.range(-0.6, 0.6) });
  const d0 = 0.12 + (k % 3) * 0.35, didg = await src(S.didg, d0, d0 + len * 0.9, { hp: 40, semis: -2 + low });
  const b0 = 2.0 + (k % 3) * 1.3, beast = await src(S.beast, b0, b0 + len * 0.8, { hp: 80, semis: -3 + low });
  const f0 = N.C3 * 2 ** (low / 12), P = L.toFn([[0, f0 * 0.93], [0.16, f0 * 1.03], [len * 0.55, f0], [len, f0 * 0.88]]), vib = wobble(seed + 'v' + k, [5.2, 5.9]);
  const voice = L.eq(L.tone(len, { type: 'saw', freq: (t) => P(t) * (1 + 0.012 * vib(t)) }), [{ type: 'hp', f: 90, order: 2 }, { type: 'peak', f: 450, gain: 10, q: 2 },
    { type: 'peak', f: 820, gain: 7, q: 2.5 }, { type: 'lp', f: 2400, order: 2 }]);
  let m = L.mix([at(tiger), at(didg, 0.02, -7), at(beast, 0.03, grit), at(nrm(voice), 0.05, sing)], { length: len });
  m = throat(m, N.C4 * 2 ** (low / 12), { wet: 0.42, seed: seed + 't' + k });
  m = L.automate(m, (t) => smooth(t / 0.07) * (t < len * 0.62 ? 1 : Math.max(0, 1 - (t - len * 0.62) / (len * 0.38)) ** 1.6));
  m = L.saturate(m, { drive: 3, type: 'tube', mix: 0.3 });
  return L.psychoBass(L.slice(m, 0, len), { freq: 110, amount: -7 });
}
async function dragonSet(cat, keep) {
  ctx.log('-- dragon');
  const roars = [];
  for (let k = 0; k < 3; k++) roars.push(cut(space(await dragonRoar(k, { semis: [-5, -5.6, -4.6][k] }), YARD, { wet: 0.2, seed: `rv${k}`, length: 1.6 }), 1.9, 0.35));
  keep.roar = roars;
  await put(cat, 'pulao_roar', roars, SP([8, 90], { lufs: -16, mmax: -12, voices: 3, pitch: [0.97, 1.03], priority: 2 }));
  // 警世: lower and shorter, more growl, a sub under it
  const lows = [];
  for (let k = 0; k < 2; k++) {
    const r = await dragonRoar(k + 1, { semis: -8.5 + k * 0.6, len: 1.1, low: -3, grit: -6, sing: -13, seed: 'roarL' });
    lows.push(cut(space(L.mix([at(r), at(boom(`rls${k}`, { f0: 62, f1: 38, decay: 0.5 }), 0.02, -9)]), YARD, { wet: 0.22, seed: `rlv${k}`, length: 1.6 }), 1.5, 0.35));
  }
  await put(cat, 'pulao_roar_low', lows, SP([8, 90], { lufs: -16, mmax: -13, voices: 2, pitch: [0.98, 1.02] }));

  // pulao_bite (rare inspect): the jaw snaps shut on the finger — two bronze teeth clacks, a short ping, a tiny snarl,
  // the hand jerking back
  const bites = [];
  for (let k = 0; k < 2; k++) {
    const c1 = strike(await src(S.metalL(k), 0, 0.3, { hp: 400, semis: 3 })), c2 = strike(await src(S.metalL(k + 2), 0, 0.3, { hp: 400, semis: 5 }));
    const ping = bellCore(N.D5, 0.3, { list: GILT, t60: 0.14, seed: `bp${k}` });
    const sn = await src(S.snarl, 0.16 + k * 0.2, 0.46 + k * 0.2, { hp: 200, semis: 2 });
    const jerk = K.swish(0.14, 600, 2400, `bj${k}`);
    bites.push(cut(L.mix([at(c1, 0), at(c2, 0.011, -3), at(nrm(ping), 0.004, -12), at(L.fadeOut(sn, 0.12, 'exp'), 0.02, -6), at(nrm(jerk), 0.03, -11)], { length: 0.5 }), 0.5, 0.5));
  }
  await put(cat, 'pulao_bite', bites, D2({ lufs: -18, mmax: -14, voices: 1, pitch: [0.98, 1.02] }));
}

// ------------------------------------------------------------------------------------------------ the big bells
/**
 * One toll of a big bell: the bronze (TEMPLE modes), the strike's metallic splash, a real bell's attack under it
 * (Kenney heavy bell, its own ring cut short so it never fights the tuning), a Chinese gong's wash high-passed (the
 * 銅鳴 shimmer), the 撞木 log, the shockwave's air and a sub boom; psycho-bass; the yard.
 */
// band shares for the big bells: the bronze's 150 Hz - 3 kHz modes lead (the first pass put 70 % of the energy under
// 150 Hz with the gong's wash over the rest: a crash, not a bell, and little a laptop could play)
const TOLL_BAL = { sub: -14, low: -7.5, lowMid: -4.5, mid: -5, high: -11, air: -18 };
async function bigToll(k, { f = N.C3, t60 = 3.2, dur = 4.4, seed = 'toll', size = 1, ch = 1, env = YARD, wet = 0.45, waveDb = -9, subDb = -9, gongDb = -27, clangDb = -13, kbDb = -11, beamDb = -7, bright = 0, hum = 1 } = {}) {
  const r = ctx.rng(seed + k), list = hum === 1 ? TEMPLE : TEMPLE.map((p, i) => (i ? p : [p[0], p[1] * hum, p[2], p[3]]));
  const core = bellCore(f * 2 ** (r.range(-4, 4) / 1200), dur, { list, t60, seed: `${seed}c${k}`, bright });
  const spl = clang(f, { seed: `${seed}k${k}`, t60: 0.18 });
  const kb = L.decay(strike(await src(S.bellK(k % 5), 0, 1.2, { hp: 60, semis: -6 - size * 2 })), 0.22, 0.01);
  // the gong only as the strike's shimmer (1.2 s): left to ring, the balance stage lifted its wash over the bronze
  const g = L.fadeOut(L.slice(await src(S.gongCN, 0.03, 3.4, { hp: 400, lp: 3200, semis: -2 - size * 2 }), 0, 1.2), 0.9, 'exp');
  const bm = await beam(`${seed}b${k}`, { k });
  const aw = airwave(0.9 * size, { seed: `${seed}w${k}`, f0: 1500, f1: 95, fall: 0.1 * size });
  const bo = boom(`${seed}s${k}`, { f0: 70 / Math.sqrt(size), f1: 39, decay: 0.5 * size });
  let m = L.mix([at(nrm(core)), at(nrm(spl), 0, clangDb), at(kb, 0, kbDb), at(L.fadeIn(g, 0.008), 0.004, gongDb), at(bm, 0, beamDb), at(aw, 0.003, waveDb), at(bo, 0, subDb)], { length: dur });
  m = K.balance(L.psychoBass(m, { freq: 110, amount: -9 }), TOLL_BAL, 0.6);
  m = space(m, env, { wet, seed: `${seed}y${k}`, ch, hp: 150, length: Math.min(3.6, dur) });
  return cut(m, dur, 0.35);
}
async function bellShellSet(cat, keep) {
  ctx.log('-- bellshell');
  // pulao_bellshot (鐘彈 fire, 2D for the caster): a heavier shot through the bell mouth, 「鏘」 (a struck G4 bronze +
  // the deep clang + a real bell's metal), a gold burst, and the slug's wake: a whoosh pulsing with sound rings
  const ir = bloomIR('bloomB');
  const shots = [];
  for (let k = 0; k < 3; k++) {
    const r = ctx.rng(`bs${k}`);
    const [id, t] = [[S.cd, 0.464], [S.m12, 0.842], [S.nova, 3.465]][k];
    USED.add(id);
    const shot = await K.loadShot(id, t, 0.75, { semis: -2 });
    const blast = bellClose(shot, 300 + k, ir, { bloom: -6, plr: 11.5 });
    const jiang = L.mix([at(nrm(bellCore(N.G4, 1.4, { list: GILT, t60: 0.9, seed: `bsj${k}`, bright: 1 }))), at(nrm(clang(N.G4, { seed: `bsc${k}`, t60: 0.12, hi: 12 })), 0, -6),
      at(strike(await src(S.clang, 0, 1.1, { hp: 120, semis: 3 })), 0, -5), at(strike(await src(S.metalH(k), 0, 0.6, { hp: 300, semis: -2 })), 0, -8)]);
    const burst = L.automate(L.partials(0.5, { base: 4200, list: [[1, 1, 0.3], [1.31, 0.8, 0.26], [1.62, 0.6, 0.22], [2.07, 0.4, 0.18], [2.3, 0.3, 0.15]], seed: `bsb${k}` }), (t) => Math.min(1, t / 0.015));
    const rate = (t) => 38 - 24 * Math.min(1, t / 0.3);
    let ph = 0;
    const wake = L.automate(L.sweep(L.noise(0.4, { color: 'pink', seed: `bsw${k}` }), 'bp', (t) => 2600 * Math.exp(-t / 0.18) + 600, { q: 1.3 }),
      (t) => { ph += rate(t) / SR; return Math.min(1, t / 0.02) * Math.exp(-t * 7) * (0.45 + 0.55 * Math.cos(2 * Math.PI * ph)); });
    let m = L.mix([at(blast), at(L.stereoize(nrm(jiang), { width: 0.3, hp: 400, seed: `bsst${k}` }), 0.004, -5), at(nrm(burst), 0.01, -16 + r.range(-1, 1)), at(nrm(wake), 0.03, -12)], { channels: 2, length: 1.4 });
    m = space(m, YARD, { wet: 0.16, seed: `bsy${k}`, ch: 2, length: 1.6, hp: 200 });
    shots.push(cut(m, 1.4, 0.55));
  }
  keep.bellshot = shots;
  await put(cat, 'pulao_bellshot', shots, SP2([12, 80], { lufs: -12, mmax: -9.5, voices: 2, pitch: [0.98, 1.02], priority: 3, maxLimitDb: 6 }));

  // pulao_bell_whoosh: the bell falling 6 m — air rushing through its mouth rings its modes (resonant noise), the
  // rush rising to 0.3 s where it lands, then gone; a low mass approaching under it
  const whs = [];
  for (let k = 0; k < 2; k++) {
    const D = 0.42, P = 0.3, n = L.noise(D, { color: 'pink', seed: `bw${k}` });
    const res = L.eq(n, TEMPLE.slice(1, 9).map(([q]) => ({ type: 'peak', f: N.C3 * q * (1 + k * 0.01), gain: 14, q: 9 })));
    const rush = L.sweep(n, 'lp', (t) => 400 * (2600 / 400) ** Math.min(1, t / P), { q: 0.9 });
    const low = L.eq(L.noise(D, { color: 'brown', seed: `bwl${k}` }), [{ type: 'lp', f: 180, order: 2 }, { type: 'hp', f: 35, order: 2 }]);
    const env = (t) => (t < P ? (t / P) ** 2.4 : Math.exp(-(t - P) * 45));
    whs.push(L.automate(L.mix([at(nrm(rush)), at(nrm(res), 0, -6), at(nrm(low), 0, -6)]), env));
  }
  keep.whoosh = whs;
  await put(cat, 'pulao_bell_whoosh', whs, SP([8, 70], { lufs: -17, mmax: -15, voices: 3, pitch: [0.97, 1.03], maxHeadMs: 400 }));

  // pulao_bell_land: the bronze rim meets the street — the deep clang, a muffled 「咚」 (C3, damped), concrete, rubble,
  // a boom and the dust
  const lands = [];
  for (let k = 0; k < 2; k++) {
    const dong = bellCore(N.C3, 1.4, { list: TEMPLE, t60: 0.7, seed: `ld${k}`, bright: -4 });
    const cl = strike(await src(S.clang, 0, 1.1, { hp: 50, semis: -2 + k }));
    const con = strike(await src(S.concrete, 0, 1.28, { hp: 80, semis: -3 }));
    const rub = await src(S.rubble, 0, 0.4, { hp: 150 });
    const dust = L.noiseBurst({ dur: 0.7, attack: 0.01, decay: 0.4, color: 'pink', hp: 400, lp: 5000, seed: `lds${k}` });
    let m = L.mix([at(nrm(dong)), at(cl, 0, -3), at(con, 0.002, -5), at(rub, 0.012, -9), at(boom(`ldb${k}`, { f0: 80, f1: 42, decay: 0.45 }), 0, -5), at(nrm(dust), 0.02, -13)]);
    m = space(L.psychoBass(m, { freq: 110, amount: -8 }), YARD, { wet: 0.28, seed: `ldy${k}`, length: 1.6 });
    lands.push(cut(m, 1.5, 0.45));
  }
  await put(cat, 'pulao_bell_land', lands, SP([10, 90], { lufs: -15, mmax: -12, voices: 3, pitch: [0.97, 1.03] }));

  // pulao_toll: the 3 m spirit bell on G3 (x1 / x1.12 / x1.26 = G A B; crisis x0.8, KE_FINAL x1.5 = D4)
  const tolls = [];
  for (let k = 0; k < 3; k++) tolls.push(await bigToll(k, { f: N.G3, t60: 3.0, dur: 4.2, seed: 'toll' }));
  keep.toll = tolls;
  await put(cat, 'pulao_toll', tolls, SP([15, 160], { lufs: -14, mmax: -13, voices: 6, pitch: [1, 1], priority: 3 }));

  // pulao_pillar (上升音): two cyan sound pillars rise and toss — a bell chord gliding up an octave and more, a rising
  // band of air pulsing with sound rings, the two tosses' thumps, a sparkle at the top
  const pills = [];
  for (let k = 0; k < 2; k++) {
    const D = 1.15;
    const chord = L.mix([N.C3, N.G3, N.C4, N.E4].map((f, i) => at(nrm(bellCore(f, D, { list: TEMPLE.slice(1, 6), t60: 2, seed: `pc${k}${i}`, attack: 0.05 })), 0, -i * 2)));
    const glide = L.varispeedCurve(chord, [[0, 0.75], [0.6, 1.7], [D * 2, 1.9]]);
    let ph = 0;
    const air = L.automate(L.sweep(L.noise(D, { color: 'pink', seed: `pa${k}` }), 'bp', (t) => 220 * (3800 / 220) ** Math.min(1, t / 0.6), { q: 1.6 }),
      (t) => { ph += (10 + 28 * Math.min(1, t / 0.6)) / SR; return smooth(t / 0.4) * (t < 0.6 ? 1 : Math.exp(-(t - 0.6) * 5)) * (0.5 + 0.5 * Math.cos(2 * Math.PI * ph)); });
    const toss = L.mix([0, 0.035].map((t, i) => at(L.thump({ f0: 150, f1: 58, sweep: 0.02, decay: 0.14, drive: 2.5, seed: `pt${k}${i}` }), t, -i * 2)));
    const top = L.mix([N.C6, N.E6, N.G6].map((f, i) => at(ding(f, 0.6, { t60: 0.4, seed: `pp${k}${i}`, tick: -20 }), 0.5 + i * 0.09, -i * 2)));
    let m = L.mix([at(nrm(L.slice(glide, 0, D)), 0, -3), at(nrm(air), 0, -4), at(nrm(toss), 0, -6), at(nrm(top), 0, -15)], { length: D });
    pills.push(cut(space(m, YARD, { wet: 0.25, seed: `py${k}`, length: 1.4 }), 1.4, 0.4));
  }
  await put(cat, 'pulao_pillar', pills, SP([10, 90], { lufs: -16, mmax: -13, voices: 2, pitch: [0.98, 1.02] }));
}

async function knellSet(cat, keep) {
  ctx.log('-- knell');
  // pulao_knell (警世): one great toll round the caster on G2 (the deepest strike of the set), a heavier log, the air
  // ring rushing outwards across the stereo field, a cyan shimmer spreading with it
  const ks = [];
  for (let k = 0; k < 2; k++) {
    const t = await bigToll(k + 7, { f: N.G2, t60: 4.0, dur: 4.8, seed: 'knell', size: 1.35, ch: 2, wet: 0.5, waveDb: -7, subDb: -7, beamDb: -5, gongDb: -24, bright: 1 });
    const ringOut = L.width(L.stereoize(airwave(1.0, { f0: 2400, f1: 160, fall: 0.18, seed: `kno${k}` }), { width: 0.8, hp: 200, seed: `knos${k}` }), 1.4);
    const cyan = L.automate(L.partials(1.4, { base: 3136, list: [[1, 1, 0.9], [1.12, 0.7, 0.8], [1.5, 0.5, 0.6], [2, 0.3, 0.5]], seed: `knc${k}` }), (t) => smooth(t / 0.08) * (0.7 + 0.3 * Math.sin(2 * Math.PI * 6 * t)));
    ks.push(cut(L.mix([at(t), at(ringOut, 0.004, -10), at(L.stereoize(nrm(cyan), { width: 0.6, hp: 1000, seed: `kncs${k}` }), 0.02, -24)], { channels: 2 }), 4.8, 0.4));
  }
  keep.knell = ks;
  await put(cat, 'pulao_knell', ks, SP2([15, 160], { lufs: -13, mmax: -10, voices: 2, pitch: [1, 1], priority: 3 }));
}

// ------------------------------------------------------------------------------------------------ 百八鐘
/** 小鑼: a small flat gong whose pitch rises after the strike (the 「台」 of 北管 / opera percussion). */
function xiaoluo(seed, { f = 640, rise = 1.22, dur = 0.7 } = {}) {
  const F = (t) => f * (1 + (rise - 1) * (1 - Math.exp(-t / 0.05)));
  const parts = [[1, 1, 0.45], [1.52, 0.5, 0.3], [2.13, 0.35, 0.22], [2.9, 0.2, 0.14]].map(([q, a, t60]) => at(L.applyEnv(L.tone(dur, { freq: (t) => F(t) * q }), L.expEnv(dur, { attack: 0.0005, t60 })), 0, L.lin2db(a)));
  const hit = L.noiseBurst({ dur: 0.02, decay: 0.004, bp: f * 3, q: 0.8, seed: seed + 'h' });
  return nrm(L.mix([...parts, at(nrm(hit), 0, -10)]));
}
async function ultSet(cat, keep) {
  ctx.log('-- ult');
  // pulao_ult_inhale (§1.12 layer 1, the gun to the sky): the dragon breathes in (a beast's breath, down, its swell
  // shaped to 0.4 s), a bell chord rising 0.8 -> 1.25, the air sucked up into it, a cyan shimmer climbing
  const inh = [];
  for (let k = 0; k < 2; k++) {
    const D = 0.62, P = 0.4;
    const br = await src(S.breath, [8.6, 5.48][k], [9.4, 5.95][k], { hp: 90, semis: -6, stereo: true });
    const brE = L.automate(L.fitLength(br, D), (t) => (t < P ? smooth(t / P) ** 1.4 : Math.exp(-(t - P) * 18)));
    const chord = L.mix([N.C3, N.G3, N.C4].map((f, i) => at(L.tone(D, { type: i ? 'sine' : 'saw', freq: f }), 0, -i * 3)));
    const rise = L.automate(L.varispeedCurve(L.eq(L.fitLength(chord, D * 1.4), [{ type: 'lp', f: 1800, order: 2 }]), [[0, 0.8], [P, 1.25], [2, 1.25]]),
      (t) => (t < P ? (t / P) ** 2 : Math.exp(-(t - P) * 22)));
    const suck = L.automate(L.sweep(L.noise(D, { color: 'pink', seed: `ius${k}` }), 'bp', (t) => 250 * (3200 / 250) ** Math.min(1, t / P), { q: 1.2 }), (t) => (t < P ? (t / P) ** 2.2 : Math.exp(-(t - P) * 20)));
    const sh = L.automate(L.varispeedCurve(L.partials(D * 1.4, { base: 2093, list: [[1, 1, 3], [1.5, 0.6, 3], [2, 0.4, 3]], seed: `ish${k}` }), [[0, 0.8], [P, 1.25], [2, 1.25]]), (t) => (t < P ? (t / P) ** 3 : Math.exp(-(t - P) * 14)));
    let m = L.mix([at(brE, 0, -2), at(L.stereoize(nrm(L.slice(rise, 0, D)), { width: 0.3, seed: `iss${k}` }), 0, -8), at(L.stereoize(nrm(suck), { width: 0.5, seed: `isk${k}` }), 0, -5),
      at(L.stereoize(nrm(L.slice(sh, 0, D)), { width: 0.6, hp: 1000, seed: `ish2${k}` }), 0, -20)], { channels: 2, length: D });
    inh.push(L.fadeOut(m, 0.08, 'exp'));
  }
  keep.inhale = inh;
  await put(cat, 'pulao_ult_inhale', inh, SP2([12, 100], { lufs: -16, mmax: -14, voices: 1, pitch: [1, 1], maxHeadMs: 400 }));

  // pulao_ult_creak (鐘架吱嘎, the bell appearing high above): the frame's iron groaning under it, a chain, the bronze
  // humming into being (a reversed bell bloom)
  const crs = [];
  for (let k = 0; k < 2; k++) {
    const a = await src(S.creakLong, 0.1 + k * 0.6, 1.5 + k * 0.6, { hp: 90, semis: -6 });
    const b = await src(S.creak, [0.0, 1.45][k], [1.2, 2.6][k], { hp: 150, semis: -4 });
    const ch = await src(S.chain, 0.88 + k * 0.3, 1.4 + k * 0.3, { hp: 600, semis: -3 });
    const bloom = L.reverse(L.slice(bellCore(N.C3, 1.0, { list: TEMPLE, t60: 1.6, seed: `crb${k}`, bright: -4 }), 0, 0.9));
    let m = L.mix([at(L.fadeOut(a, 0.3, 'exp')), at(L.fadeOut(b, 0.3, 'exp'), 0.18, -4), at(L.fadeOut(ch, 0.2, 'exp'), 0.1, -12), at(nrm(L.fadeIn(bloom, 0.3)), 0.35, -9)]);
    crs.push(cut(space(m, YARD, { wet: 0.3, seed: `cry${k}`, length: 1.8 }), 1.6, 0.4));
  }
  keep.creak = crs;
  await put(cat, 'pulao_ult_creak', crs, SP([10, 100], { lufs: -18, mmax: -16, voices: 1, pitch: [0.98, 1.02] }));

  // pulao_ult_slam (§1.12 layer 2: 40-60 Hz, 0.3 s): the 6 m bell over the street — a sub impact 62 -> 38 Hz, a deep
  // explosion, the metallic bang, concrete, the rim's dull 「咚」 on C2, a blast of air, debris raining after
  const slams = [];
  for (let k = 0; k < 2; k++) {
    const D = 2.6;
    const sub = nrm(L.psychoBass(L.thump({ f0: 62, f1: 38, sweep: 0.08, decay: 0.42, click: 0.1, drive: 2.5, seed: `ss${k}` }), { freq: 100, amount: -3 }));
    const deep = await src(S.deep, 0, 2.6, { hp: 28, stereo: true });
    const bang = strike(await src(S.bangMetal, 0.03, 2.3, { hp: 40, semis: -2 - k, stereo: true }));
    const con = strike(await src(S.concrete, 0, 1.28, { hp: 70, semis: -4 }));
    const deb = await src(S.debris, 0.05, 3.9, { hp: 120, stereo: true });
    // (the rim's C2 dong rang 2 s at -6 dB: a drone, not an impact)
    const dong = bellCore(N.C2, D, { list: TEMPLE, t60: 0.8, seed: `sd${k}`, bright: 1 });
    const aw = airwave(1.2, { f0: 1200, f1: 70, fall: 0.15, seed: `saw${k}` });
    let m = L.mix([at(sub, 0, 0), at(deep, 0, -6), at(bang, 0, -5), at(con, 0.003, -8), at(nrm(dong), 0.004, -13), at(L.stereoize(aw, { width: 0.6, seed: `saws${k}` }), 0.002, -7),
      at(L.fadeIn(deb, 0.05), 0.16, -13)], { channels: 2, length: D });
    slams.push(cut(space(m, YARD, { wet: 0.25, seed: `sy${k}`, ch: 2, length: 2.6, hp: 180 }), D, 0.4));
  }
  keep.slam = slams;
  await put(cat, 'pulao_ult_slam', slams, SP2([15, 180], { lufs: -13, mmax: -9, voices: 1, pitch: [1, 1], priority: 3, maxLimitDb: 6 }));

  // pulao_ult_toll: the 6 m bell (C3, played on PENTA up to x3 = G4): bigger, wider and longer than the 鐘彈 bell
  const uts = [];
  for (let k = 0; k < 3; k++) uts.push(await bigToll(k + 3, { f: N.C3, t60: 4.2, dur: 5.0, seed: 'ultToll', size: 1.3, ch: 2, wet: 0.55, waveDb: -10, subDb: -12, gongDb: -24, bright: 2, hum: 0.6 }));
  keep.ultToll = uts;
  await put(cat, 'pulao_ult_toll', uts, SP2([15, 180], { lufs: -15, mmax: -16, voices: 9, pitch: [1, 1], priority: 3 }));

  // pulao_ult_shatter: the ninth toll bursts the bell into 32 bronze shards — the metallic bang, glass and glaze taken
  // down into bronze, a crash cymbal's wash, the cracked bell's last strike (detuned, short), shards whizzing out
  // across the field, a sub, the fragments raining after
  const shs = [];
  for (let k = 0; k < 2; k++) {
    const D = 2.8, r = ctx.rng(`sh${k}`);
    const bang = strike(await src(S.bangMetal, 0.03, 2.3, { hp: 60, semis: 1 - k, stereo: true }));
    const gl = strike(await src(S.glass, 0.15, 1.61, { hp: 200, semis: -6, stereo: true }));
    const pl = strike(await src(S.plate, 0.0, 1.1, { hp: 200, semis: -7 }));
    const cr = strike(await src(S.crash, 0.0, 2.6, { hp: 300, lp: 7000, semis: -6, stereo: true }));
    const cracked = bellCore(N.C4, 1.2, { list: TEMPLE.map(([q, a, t, b]) => [q * (1 + r.range(-0.03, 0.03)), a, t, b * 4]), t60: 0.5, seed: `shc${k}`, bright: 1 });
    const zings = [];
    for (let i = 0; i < 18; i++) {
      const d = 0.06 + r.next() * 0.08, f0 = 3200 + r.next() * 2500;
      zings.push(at(L.automate(L.sweep(L.noise(d, { color: 'white', seed: `shz${k}${i}` }), 'bp', (t) => f0 * Math.exp(-t / d * 1.2), { q: 5 }), (t) => Math.sin(Math.PI * t / d)), 0.01 + r.next() ** 1.5 * 0.45, -r.next() * 9, r.range(-0.9, 0.9)));
    }
    const fall = await src(S.shards, 0.95, 3.06, { hp: 250, semis: -4, stereo: true });
    let m = L.mix([at(bang, 0, -2), at(gl, 0.004, -6), at(pl, 0.006, -8), at(cr, 0.002, -9), at(nrm(cracked), 0, -5, 0), at(nrm(L.mix(zings, { channels: 2 })), 0, -11),
      at(boom(`shb${k}`, { f0: 75, f1: 40, decay: 0.6 }), 0, -6, 0), at(L.fadeIn(fall, 0.05), 0.35, -15)], { channels: 2, length: D });
    shs.push(cut(space(m, YARD, { wet: 0.3, seed: `shy${k}`, ch: 2, length: 3, hp: 200 }), D, 0.4));
  }
  keep.shatter = shs;
  await put(cat, 'pulao_ult_shatter', shs, SP2([15, 180], { lufs: -13, mmax: -9.5, voices: 1, pitch: [1, 1], priority: 3, maxLimitDb: 6 }));

  // pulao_ult_tail (release, +0.1 s): 餘音 — the nine tolls' ghost hanging as a C E G A C cloud, the dragon's breath
  // going out of it (the deflate), a few gilt motes
  const tails = [];
  for (let k = 0; k < 2; k++) {
    const D = 5, r = ctx.rng(`ut${k}`);
    const cloud = L.mix([N.C3, N.E3, N.G3, N.A3, N.C4].map((f, i) => at(nrm(bellCore(f, D, { list: TEMPLE.slice(0, 7), t60: 4.5, attack: 0.18, seed: `utc${k}${i}`, bright: -4 })), 0.02 * i, -i * 1.5, [-0.6, 0.4, -0.2, 0.6, 0][i])), { channels: 2 });
    const ex = await src(S.breath, [5.48, 2.0][k], [5.95, 2.5][k], { hp: 100, lp: 2600, semis: -7 });
    const fall = L.automate(L.sweep(L.noise(1.6, { color: 'pink', seed: `utf${k}` }), 'bp', (t) => 1600 * (220 / 1600) ** Math.min(1, t / 1.4), { q: 1.1 }), (t) => smooth(t / 0.08) * Math.exp(-t * 2.4));
    const motes = L.mix(Array.from({ length: 8 }, (_, i) => at(bellCore([N.C6, N.E6, N.G6, N.A6][i % 4], 0.5, { list: GILT.slice(1, 5), t60: 0.3, seed: `utm${k}${i}` }), 0.2 + r.next() * 2.2, -r.next() * 8 - i, r.range(-0.8, 0.8))), { channels: 2 });
    let m = L.mix([at(cloud, 0, -1), at(L.stereoize(L.fadeOut(ex, 0.3, 'exp'), { width: 0.4, seed: `utes${k}` }), 0.05, -7), at(L.stereoize(nrm(fall), { width: 0.5, seed: `utfs${k}` }), 0.02, -9),
      at(nrm(motes), 0, -22)], { channels: 2, length: D });
    tails.push(cut(space(m, YARD, { wet: 0.5, seed: `uty${k}`, ch: 2, length: 3.6 }), D, 0.55));
  }
  keep.ultTail = tails;
  await put(cat, 'pulao_ult_tail', tails, SP2([15, 160], { lufs: -18, mmax: -16, voices: 1, pitch: [1, 1] }));

  // pulao_ult_bed (§1.12 layer 3, played at the cast, scored to pulao.js's timeline): a timpani roll and a cymbal roll
  // swelling to the slam (0.98), the big drum + 大鑼 on it and the choir rising (C and G); 北管 鑼鼓 on every toll
  // (TOLLS: the drum on each, the opera 鈔 on the even ones, the rising 小鑼 on the odd ones, quickening with them);
  // on the ninth the shatter (3.51) the drum, the gong and the choir's peak, then the release
  const beds = [];
  {
    const D = 6.6, SLAM = 0.98, BR = TOLLS[8] + 0.06;
    const timp = await src(S.timpRoll, 1.0, 1.0 + 1.1 * 1.335, { hp: 35, semis: -5, stereo: true });
    const timpE = L.automate(L.slice(timp, 0, SLAM + 0.05), (t) => 0.15 + 0.85 * smooth(t / SLAM) ** 1.5);
    const cym = await src(S.cymRoll, 0.2, 0.2 + 1.2, { hp: 300, stereo: true });
    const cymE = L.automate(L.slice(cym, 0, SLAM + 0.02), (t) => smooth(t / SLAM) ** 2.5);
    const gong = await src(S.gongCN, 0.02, 6.4, { hp: 120, semis: -3, stereo: true });
    const choir = async (id, semis, len) => { const r = 2 ** (semis / 12); return src(id, 1.45, 1.45 + len * r + 0.05, { hp: 100, semis, stereo: true, fadeIn: 0.15 }); };
    const chC = await choir(S.choirA, -5, 4.6), chG = await choir(S.choirB, 2, 4.4), chO = await choir(S.choirO, -5, 4.6);
    const chEnv = (t) => { const u = t; return u < 0 ? 0 : smooth(u / 0.3) * (0.55 + 0.45 * smooth((u - 0.4) / (BR - SLAM - 0.4))) * (u < BR - SLAM + 0.3 ? 1 : Math.max(0, 1 - (u - (BR - SLAM + 0.3)) / 1.6)); };
    const ch = L.automate(L.mix([at(chC), at(chG, 0.04, -4), at(chO, 0.02, -5)], { channels: 2 }), chEnv);
    const parts = [at(timpE, 0, -6), at(cymE, 0, -12), at(await bigDrum('bd0', { ring: 0.9 }), SLAM, -2), at(L.fadeIn(gong, 0.005), SLAM + 0.005, -8), at(ch, SLAM, -2)];
    for (let i = 0; i < 9; i++) {
      const t = TOLLS[i];
      parts.push(at(await bigDrum(`bdt${i}`, { ring: 0.4, semis: i % 2 ? 1 : 0, k: i, sub: -9 }), t, -13 + i * 0.4));
      if (i % 2) parts.push(at(strike(await src(S.opera, 0, 1.05, { hp: 250, stereo: true })), t + 0.005, -14 + i * 0.4, -0.35));
      else parts.push(at(xiaoluo(`xl${i}`, { f: 600 * (1 + i * 0.02) }), t + 0.003, -15 + i * 0.3, 0.35));
    }
    // the climax drum answers the shatter 40 ms late: struck on the same sample, its thump and the shatter's boom summed
    // in phase (+4 dBFS peaks in the as-heard reference)
    parts.push(at(await bigDrum('bdx', { ring: 1.1, semis: -1 }), BR + 0.04, -3), at(strike(await src(S.gongHard, 0.08, 6, { hp: 60, semis: -2, stereo: true })), BR + 0.012, -5));
    let m = L.mix(parts, { channels: 2, length: D });
    m = K.balance(m, { sub: -15, low: -9, lowMid: -5, mid: -5, high: -10, air: -16 }, 0.5);
    m = space(m, YARD, { wet: 0.3, seed: 'bedy', ch: 2, length: 3.6, hp: 160 });
    beds.push(cut(m, D, 0.3));
  }
  keep.bed = beds;
  await put(cat, 'pulao_ult_bed', beds, SP2([15, 160], { lufs: -18, mmax: -16, voices: 1, pitch: [1, 1], priority: 2, maxHeadMs: 30 }));
}

// ------------------------------------------------------------------------------------------------ other
async function otherSet(cat, keep) {
  ctx.log('-- other');
  // ready_pulao (unique ready cue, ui): a temple bell's bloom swelling in reverse into its strike (C3 + a C6 gilt
  // sparkle), and in its ring the dragon's short 「吼」 through the bronze
  const readys = [];
  for (let k = 0; k < 2; k++) {
    const D = 2.2;
    const swell = L.reverse(L.slice(bellCore(N.C4, 0.5, { list: TEMPLE, t60: 1.2, seed: `rs${k}`, bright: -1 }), 0, 0.26));
    const toll = L.mix([at(nrm(bellCore(N.C3, D, { list: TEMPLE, t60: 2.4, seed: `rt${k}`, bright: -1 }))), at(nrm(clang(N.C3, { seed: `rc${k}`, t60: 0.14 })), 0, -14), at(await beam(`rbm${k}`, { k }), 0, -8)]);
    const sp = ding(N.C6, 1.4, { t60: 1.1, seed: `rsp${k}`, tick: -16 });
    const ro = await dragonRoar(k + 4, { semis: -6 - k * 0.5, len: 0.62, seed: 'readyRoar', sing: -12 });
    let m = L.mix([at(nrm(L.fadeIn(swell, 0.2)), 0, -4), at(toll, 0.26, 0), at(sp, 0.262, -9, 0.2), at(ro, 0.36, -5, -0.1)], { channels: 2, length: D + 0.26 });
    readys.push(cut(space(m, HALL, { wet: 0.3, seed: `rh${k}`, ch: 2, length: 2.2 }), D + 0.26, 0.45));
  }
  keep.ready = readys;
  await put(cat, 'ready_pulao', readys, { lufs: -18, mmax: -13, bus: 'ui', spatial: false, channels: 2, voices: 2, pitch: [1, 1], priority: 3, maxHeadMs: 300 });

  // pulao_crisis (金鐘罩): the bell drops over the player (a short rush), the lethal blow breaks like glaze on the bronze,
  // the bell closes round the player (C3, damped, the enclosed ring of the cavity), a cyan shimmer and the shove of air
  const crs = [];
  for (let k = 0; k < 2; k++) {
    const D = 2.4;
    const rush = L.automate(L.sweep(L.noise(0.12, { color: 'pink', seed: `cr${k}` }), 'bp', (t) => 2600 * Math.exp(-t / 0.06) + 400, { q: 1.4 }), (t) => (t < 0.08 ? (t / 0.08) ** 2 : Math.exp(-(t - 0.08) * 60)));
    const clamp_ = bellCore(N.C3, D, { list: TEMPLE, t60: 1.6, seed: `crc${k}`, bright: -2 });
    const cavity = L.automate(L.eq(L.noise(0.6, { color: 'pink', seed: `crv${k}` }), TEMPLE.slice(0, 6).map(([q]) => ({ type: 'peak', f: N.C3 * q, gain: 16, q: 12 }))), (t) => Math.exp(-t * 8));
    const pl = strike(await src(S.plate, 0.0, 1.1, { hp: 300, semis: -2 }));
    const cup = strike(await src(S.teacup, 0.25, 0.8, { hp: 500 }));
    const cyan = L.automate(L.mix([N.C6, N.E6, N.G6].map((f, i) => at(bellCore(f, 1.8, { list: GILT.slice(1, 5), t60: 1.4, attack: 0.05, seed: `crs${k}${i}` }), 0, -i * 2))), (t) => 0.75 + 0.25 * Math.sin(2 * Math.PI * 6 * t));
    const bm = await beam(`crb${k}`, { k, ring: 0.2 });
    let m = L.mix([at(nrm(rush), 0, -8), at(nrm(clamp_), 0.08, -2), at(nrm(cavity), 0.08, -12), at(bm, 0.08, -9), at(pl, 0.085, -4, -0.2), at(cup, 0.1, -10, 0.3),
      at(L.stereoize(nrm(cyan), { width: 0.5, hp: 800, seed: `crcs${k}` }), 0.12, -15), at(airwave(0.6, { f0: 1400, f1: 120, fall: 0.08, seed: `cra${k}` }), 0.09, -9)], { channels: 2, length: D });
    crs.push(cut(space(L.psychoBass(m, { freq: 110, amount: -9 }), YARD, { wet: 0.3, seed: `cry${k}`, ch: 2, length: 2.4 }), D, 0.4));
  }
  keep.crisis = crs;
  await put(cat, 'pulao_crisis', crs, SP2([10, 90], { lufs: -15, mmax: -11, voices: 2, pitch: [1, 1], priority: 3, maxHeadMs: 100 }));

  // pulao_final (KE_FINAL; the toll itself is pulao_toll x1.5 at 0.32 s): the gold column rising (a soft C5 G5 C6 swell,
  // a rising band of air), a small bell whistling down 3 m and landing at 0.25 s
  const fins = [];
  for (let k = 0; k < 2; k++) {
    const D = 1.5;
    const col = L.mix([N.C5, N.G5, N.C6].map((f, i) => at(nrm(bellCore(f, D, { list: GILT.slice(1, 6), t60: 1.2, attack: 0.25, seed: `fc${k}${i}` })), 0, -i * 2)));
    const up = L.automate(L.sweep(L.noise(D, { color: 'pink', seed: `fu${k}` }), 'bp', (t) => 800 * (5000 / 800) ** Math.min(1, t / 0.5), { q: 1.5 }), (t) => smooth(t / 0.3) * Math.exp(-Math.max(0, t - 0.3) * 4));
    const whistle = L.automate(L.sweep(L.noise(0.26, { color: 'white', seed: `fw${k}` }), 'bp', (t) => 3000 - 1600 * (t / 0.26), { q: 6 }), (t) => (t / 0.26) ** 2);
    const land = L.mix([at(nrm(bellCore(N.G5, 0.6, { list: GILT, t60: 0.25, seed: `fl${k}` }))), at(strike(await src(S.metalL(k + 1), 0, 0.3, { hp: 600, semis: 2 })), 0, -6)]);
    let m = L.mix([at(nrm(col), 0, -6), at(nrm(up), 0, -10), at(nrm(whistle), 0, -12), at(land, 0.25, -3)], { length: D });
    fins.push(cut(space(m, YARD, { wet: 0.3, seed: `fy${k}`, length: 1.6 }), D, 0.4));
  }
  await put(cat, 'pulao_final', fins, SP([10, 120], { lufs: -17, mmax: -15, voices: 2, pitch: [1, 1] }));

  // pulao_pump_flick (ready pump, before the bells ring): the wrist flicks the gun — a short swish, the cloth, the
  // furniture rattling
  const pfs = [];
  for (let k = 0; k < 3; k++) {
    const sw = await src(S.swoosh, 0.02, 0.4, { hp: 300, semis: 3 + k });
    const cl = await src(S.cloth, 0.0, 0.3, { hp: 200 });
    const rat = strike(await src(S.metalL((k + 3) % 5), 0, 0.25, { hp: 800, semis: 4 }));
    pfs.push(cut(L.mix([at(L.fadeOut(sw, 0.1, 'exp')), at(cl, 0.01, -6), at(rat, 0.09, -12)], { length: 0.34 }), 0.34, 0.45));
  }
  await put(cat, 'pulao_pump_flick', pfs, D2({ lufs: -21, mmax: -17, voices: 1, pitch: [0.96, 1.04] }));
}

// ------------------------------------------------------------------------------------------------ view (idle, draw, inspect)
/** Plucked 琵琶 (Karplus-Strong, fractional delay, a bright pick) with the instrument's nasal twang in the body EQ. */
function pipa(f, dur, { t60 = 1.3, bright = 0.85, seed = 'pipa' } = {}) {
  const n = Math.round(dur * SR), y = new Float32Array(n), r = L.rng(L.hashSeed(seed));
  const D = SR / f - 0.5, damp = Math.exp(-6.9078 / (t60 * f)), exc = Math.round(D);
  let lpx = 0;
  for (let i = 0; i < n; i++) {
    let x = 0;
    if (i < exc) { lpx = bright * (r.next() * 2 - 1) + (1 - bright) * lpx; x = lpx; }
    const di = i - D;
    let fb = 0;
    if (di >= 1) { const k = Math.floor(di), fr = di - k; fb = damp * 0.5 * ((y[k] * (1 - fr) + y[k + 1] * fr) + (y[k - 1] * (1 - fr) + y[k] * fr)); }
    y[i] = x + fb;
  }
  const b = L.eq(new L.Buf([y], SR), [{ type: 'hp', f: f * 0.7, order: 2 }, { type: 'peak', f: 320, gain: 3, q: 1.2 }, { type: 'peak', f: 1250, gain: 3, q: 1.4 }, { type: 'peak', f: 3200, gain: 3.5, q: 1.6 }, { type: 'lp', f: 7500, order: 2 }]);
  const pick = L.noiseBurst({ dur: 0.006, decay: 0.0015, hp: 2000, lp: 9000, seed: seed + 'p' });
  return nrm(L.mix([at(nrm(L.fadeOut(b, Math.min(0.2, dur * 0.3), 'exp'))), at(nrm(pick), 0, -14)]));
}
/** 拍板: the clapper's boards — a real wood knock with a flam and the hard click on top. */
async function paiban(seed, k = 0) {
  const w = strike(await src(S.wood(k % 5), 0, 0.4, { hp: 300, semis: 2 }));
  const cl = L.noiseBurst({ dur: 0.02, attack: 0.0002, decay: 0.004, bp: 2600, q: 1.5, seed });
  return nrm(L.mix([at(w), at(w, 0.024, -5), at(nrm(cl), 0, -6), at(nrm(cl), 0.024, -10)]));
}
async function viewSet(cat, keep) {
  ctx.log('-- view');
  // pulao_idle (§1.12 hum, handler volume 0.1 = ~28 dB under the gun): the bell's sympathetic hum (C2 / C3 + a C3 0.2 Hz
  // beat, G3, C4) through a tube, a 400-1200 Hz band swept at 0.2 Hz (the liner's sound ring breathing), a faint gilt
  // shimmer. Periodic in 10 s: every tone and LFO on the 1/P grid; only the noise goes through the loop crossfade.
  {
    const P = 10, Lx = 11.5, q = (f) => Math.round(f * P) / P, lfo = (t) => 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.2 * t);
    const hum = L.saturate(L.mix([at(L.tone(P, { freq: q(N.C2) }), 0, -2), at(L.tone(P, { freq: q(N.C3) })), at(L.tone(P, { freq: q(N.C3) + 0.2 }), 0, -4), at(L.tone(P, { freq: q(N.G3) }), 0, -10),
      at(L.tone(P, { freq: q(N.C4) }), 0, -15)]), { drive: 3, type: 'tube' });
    const breathe = L.automate(hum, (t) => 0.8 + 0.2 * Math.sin(2 * Math.PI * 0.1 * t));
    const shimmer = L.automate(L.mix([at(L.tone(P, { freq: q(N.C6) + 0.3 })), at(L.tone(P, { freq: q(N.C6) - 0.3 })), at(L.tone(P, { freq: q(N.G6) }), 0, -6)]), (t) => 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.3 * t));
    const band = L.sweep(L.noise(Lx, { color: 'pink', seed: 'idle_n' }), 'bp', (t) => 400 * 3 ** lfo(t), { q: 1.6 });
    const texture = L.loopCrossfade(L.stereoize(nrm(band), { width: 0.35, hp: 250, seed: 'idle_st' }), Lx - P);
    const v = L.mix([at(L.stereoize(nrm(breathe), { width: 0.15, hp: 200, seed: 'idle_hs' }), 0, -4), at(L.toStereo(nrm(shimmer)), 0, -34), at(texture, 0, -8)], { length: P, channels: 2 });
    seamCheck('pulao_idle', v, 5);
    await put(cat, 'pulao_idle', v, D2({ lufs: -20, loop: true, voices: 1, pitch: [1, 1] }));
  }

  // pulao_draw_first (from 0.028 s of the 1.4 s first draw; the clip plays the pump, the three bell lights at 0.39 /
  // 0.50 / 0.62 and the roar at 0.87): the gun flipped up (cloth, a heavy swish, the bells jingling), a bronze drone
  // swelling into the roar, the cyan ring surfacing in the mouth (0.87), and at 1.25 the bell's 餘音
  {
    const D = 3.0;
    const cloth = await src(S.clothHeavy, 0, 0.5, { hp: 100 });
    const lift = L.automate(L.sweep(L.noise(0.36, { color: 'pink', seed: 'dfl' }), 'bp', (t) => (t < 0.18 ? 150 * (480 / 150) ** (t / 0.18) : 480 * (160 / 480) ** ((t - 0.18) / 0.18)), { q: 1.0 }), (t) => (t < 0.18 ? (t / 0.18) ** 1.8 : Math.exp(-(t - 0.18) * 14)));
    const jing = L.mix([0.12, 0.17, 0.24, 0.29].map((t, i) => at(bellCore(N.F5 * [1, 1.5, 1.12, 2][i], 0.3, { list: GILT, t60: 0.1, seed: `dfj${i}` }), t, -6 - i * 2)));
    const drone = L.automate(L.eq(L.saturate(L.mix([at(L.tone(0.6, { type: 'saw', freq: N.C2 })), at(L.tone(0.6, { type: 'saw', freq: N.G2 }), 0, -4)]), { drive: 3, type: 'tube' }), [{ type: 'lp', f: 520, order: 2 }]),
      (t) => smooth(t / 0.5) ** 2 * (t < 0.5 ? 1 : Math.exp(-(t - 0.5) * 30)));
    const swell = L.reverse(L.slice(bellCore(N.C3, 0.6, { list: TEMPLE, t60: 1.5, seed: 'dfs', bright: -3 }), 0, 0.5));
    const cyan = L.automate(L.mix([at(bellCore(N.C6, 0.6, { list: GILT.slice(1, 5), t60: 0.5, attack: 0.08, seed: 'dfc1' })), at(bellCore(N.G6, 0.6, { list: GILT.slice(1, 5), t60: 0.5, attack: 0.1, seed: 'dfc2' }), 0.03, -3),
      at(nrm(L.sweep(L.noise(0.5, { color: 'white', seed: 'dfcn' }), 'bp', (t) => 2000 * (7000 / 2000) ** Math.min(1, t / 0.3), { q: 3 })), 0, -6)]), (t) => smooth(t / 0.12) * Math.exp(-Math.max(0, t - 0.12) * 5));
    const after = L.mix([at(nrm(bellCore(N.C3, 1.7, { list: TEMPLE, t60: 2.6, seed: 'dfa', bright: -3, attack: 0.02 }))), at(await beam('dfab', { ring: 0.15 }), 0, -18)]);
    let m = L.mix([at(cloth, 0, -8), at(L.stereoize(nrm(lift), { width: 0.4, seed: 'dfls' }), 0, -4), at(nrm(jing), 0, -16, 0.3), at(nrm(drone), 0.36, -12), at(nrm(L.fadeIn(swell, 0.2)), 0.37, -13),
      at(L.stereoize(nrm(cyan), { width: 0.5, hp: 800, seed: 'dfcs' }), 0.86, -14), at(after, 1.24, -5)], { channels: 2, length: D });
    m = cut(space(m, HALL, { wet: 0.25, seed: 'dfh', ch: 2, length: 2.2 }), D, 0.4);
    keep.drawFirst = m;
    await put(cat, 'pulao_draw_first', m, D2({ lufs: -18, mmax: -14, voices: 1, pitch: [1, 1] }));
  }

  // pulao_inspect (§1.12: 九子 get an original 南管 phrase; from 0.084 s of the 4.2 s inspect): 拍板, a bronze bloom as the
  // world dims, the 琵琶 rising G4 A4 C5 into a 輪指 tremolo on E5 — the three flicked bells (C6 D6 E6 at 1.30 / 1.55 /
  // 1.81) carry the line on up — an answer falling D5 C5 A4, a deep bronze 「咚」 under the roar (2.86), 拍板 again and the
  // 琵琶 resolving on C4 with a soft bell over the closing pump
  {
    const D = 4.9;
    const parts = [at(await paiban('pb0', 0), 0, -4, -0.1)];
    parts.push(at(nrm(bellCore(N.C3, 2.6, { list: TEMPLE, t60: 2.4, attack: 0.18, seed: 'ib', bright: -3 })), 0.1, -12));
    for (const [t, f, g, p] of [[0.32, N.G4, -2, -0.2], [0.56, N.A4, -2, -0.1], [0.8, N.C5, -1, 0]]) parts.push(at(pipa(f, 1.4, { seed: `ip${t}` }), t, g, p));
    for (let i = 0; i < 7; i++) parts.push(at(pipa(N.E5, 0.9, { seed: `ipt${i}`, t60: 0.8 }), 0.98 + i * 0.04, -3 - Math.abs(i - 2) * 1.2, 0.05));
    for (const [t, f, g] of [[2.15, N.D5, -3], [2.4, N.C5, -3], [2.62, N.A4, -4]]) parts.push(at(pipa(f, 1.3, { seed: `ipa${t}` }), t, g, 0.15));
    parts.push(at(nrm(L.mix([at(nrm(bellCore(N.C2, 2.2, { list: TEMPLE, t60: 2.0, seed: 'id', bright: -4 }))), at(await beam('idb', { ring: 0.2 }), 0, -6)])), 2.84, -8));
    parts.push(at(await paiban('pb1', 1), 3.2, -7, -0.1));
    parts.push(at(pipa(N.G4, 1.2, { seed: 'ipg' }), 3.42, -4, -0.1), at(pipa(N.C4, 1.6, { seed: 'ipc', t60: 1.8 }), 3.86, -2, 0));
    parts.push(at(ding(N.C5, 1.4, { t60: 1.2, seed: 'ic', tick: -22 }), 3.88, -12, 0.2));
    let m = L.mix(parts, { channels: 2, length: D });
    m = cut(space(m, HALL, { wet: 0.32, seed: 'ih', ch: 2, length: 2.4 }), D, 0.25);
    await put(cat, 'pulao_inspect', m, D2({ lufs: -19, mmax: -15, voices: 1, pitch: [1, 1] }));
  }
}
/** Loop QA (greataxe): the wrap step against the typical sample step; a 0.2 s window straddling the seam vs the same phase elsewhere. */
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

// ------------------------------------------------------------------------------------------------ twin
/** 蒲牢．暮鼓 (§1.12 雙生版): the originals -4 st, darker, a dotted echo, with the evening drum (暮鼓) struck under them. */
async function twinSet(cat, keep) {
  ctx.log('-- twin');
  const T = async (b, drumDb = -5, k = 0) => {
    let o = L.varispeedSemis(b, -4);
    o = L.eq(o, [{ type: 'lp', f: 6500, order: 2 }, { type: 'peak', f: 360, gain: 1.5, q: 0.8 }]);
    o = L.saturate(o, { drive: 3, type: 'tube', mix: 0.3 });
    o = L.echo(o, { time: 0.23, feedback: 0.36, lp: 2400, hp: 180, mix: 0.4, pingpong: o.channels === 2, length: o.duration + 0.9 });
    if (drumDb != null) o = L.mix([at(o), at(await bigDrum(`dusk${k}`, { ring: 0.9, semis: -2, k }), 0, drumDb)], { channels: o.channels });
    return o;
  };
  if (keep.ready) await put(cat, 'ready_pulao_dusk', [await T(keep.ready[0], -6, 0), await T(keep.ready[1], -6, 1)], { lufs: -18, mmax: -13, bus: 'ui', spatial: false, channels: 2, voices: 2, pitch: [1, 1], priority: 3, maxHeadMs: 300, note: 'twin 蒲牢．暮鼓 (reserved)' });
  if (keep.toll) await put(cat, 'pulao_toll_dusk', [await T(keep.toll[0], -4, 2), await T(keep.toll[1], -4, 3)], SP([15, 160], { lufs: -14, mmax: -13, voices: 6, pitch: [1, 1], priority: 3, note: 'twin: 鼓彈 strike (reserved)' }));
  if (keep.ultToll) await put(cat, 'pulao_ult_toll_dusk', [await T(keep.ultToll[0], -4, 4), await T(keep.ultToll[1], -4, 5)], SP2([15, 180], { lufs: -15, mmax: -16, voices: 9, pitch: [1, 1], priority: 3 }));
  if (keep.slam) await put(cat, 'pulao_ult_slam_dusk', await T(keep.slam[0], -3, 6), SP2([15, 180], { lufs: -13, mmax: -9, voices: 1, pitch: [1, 1], priority: 3, maxLimitDb: 6 }));
  if (keep.bed) await put(cat, 'pulao_ult_bed_dusk', await T(keep.bed[0], null), SP2([15, 160], { lufs: -18, mmax: -16, voices: 1, pitch: [1, 1], priority: 2, maxHeadMs: 30 }));
  if (keep.shatter) await put(cat, 'pulao_ult_shatter_dusk', await T(keep.shatter[0], -4, 7), SP2([15, 180], { lufs: -13, mmax: -9.5, voices: 1, pitch: [1, 1], priority: 3, maxLimitDb: 6 }));
}

// ------------------------------------------------------------------------------------------------ references
/** The shot, the 鐘彈 and the 百八鐘 as the player hears them (handler volumes, manifest vol, code pitches): logged + previewed. */
function references(keep) {
  const lv = (name, b, codeVol = 1, pitch = 1) => {
    const m = META[name]; if (!m || !b) return null;
    let x = L.normalizeLufs(L.setChannels(b, m.ch), m.lufs, { ceiling: -1 });
    if (pitch !== 1) x = L.varispeed(x, pitch);
    // a positional mono file through the equal-power panner at the centre: -3 dB a side
    return { buf: L.setChannels(x, 2), gainLin: m.vol * codeVol * (m.ch === 1 ? Math.SQRT1_2 : 1) };
  };
  const log = (name, b) => { const q = L.loudness(b); ctx.log(`  ${name}: ${q.integrated.toFixed(1)} LUFS integrated, momentary max ${q.momentaryMax.toFixed(1)}, short-term max ${q.shortTermMax.toFixed(1)}, peak ${L.lin2db(L.peak(b)).toFixed(1)} dBFS`); ctx.preview(name, b); };
  if (keep.close && keep.tail && keep.fire) {
    const parts = [];
    for (let i = 0; i < 3; i++) parts.push({ ...lv('pulao_close', keep.close[i]), at: i * 0.8 }, { ...lv('pulao_tail', keep.tail[i], 0.9), at: i * 0.8 + 0.015 }, { ...lv('pulao_fire', keep.fire[i], 0.32), at: i * 0.8 });
    log('ref_three_shots', L.mix(parts, { channels: 2 }));
  }
  if (keep.bellshot && keep.toll) {
    const t0 = 0.1;  // flight
    const parts = [{ ...lv('pulao_bellshot', keep.bellshot[0]), at: 0 }];
    for (let i = 0; i < 3; i++) parts.push({ ...lv('pulao_toll', keep.toll[i % keep.toll.length], 1, TONE ** i), at: t0 + 0.4 * (i + 1) });
    log('ref_bellshell', L.mix(parts.filter((p) => p.buf), { channels: 2 }));
  }
  if (keep.ultToll && keep.bed && keep.slam && keep.shatter) {
    const parts = [{ ...lv('pulao_ult_inhale', keep.inhale?.[0]), at: 0 }, { ...lv('pulao_ult_bed', keep.bed[0], 0.8), at: 0 }, { ...lv('pulao_ult_slam', keep.slam[0]), at: 0.98 },
      { ...lv('pulao_ult_creak', keep.creak?.[0], 0.9), at: 0.3 }, { ...lv('pulao_bell_whoosh', keep.whoosh?.[0]), at: 0.7 }];
    TOLLS.forEach((t, i) => parts.push({ ...lv('pulao_ult_toll', keep.ultToll[i % keep.ultToll.length], 1, PENTA[i]), at: t }));
    if (keep.roar) for (const i of [2, 5, 8]) parts.push({ ...lv('pulao_roar', keep.roar[i % 3]), at: TOLLS[i] });
    parts.push({ ...lv('pulao_ult_shatter', keep.shatter[0]), at: TOLLS[8] + 0.06 }, { ...lv('pulao_ult_tail', keep.ultTail?.[0], 0.8), at: TOLLS[8] + 0.16 });
    log('ref_ult_108', L.mix(parts.filter((p) => p.buf), { channels: 2 }));
  }
}

// ------------------------------------------------------------------------------------------------ produce
export async function produce(lib, c) {
  L = lib; ctx = c; K = makeKit(lib, ctx);
  const only = process.env.PL_ONLY ? new Set(process.env.PL_ONLY.split(',').map((s) => s.trim())) : null;
  if (only && !process.env.CF_AUDIO_OUT) throw new Error('PL_ONLY writes a partial category: set CF_AUDIO_OUT to a scratch folder');
  const want = (g) => !only || only.has(g);
  const cat = ctx.category('premium_pulao', { bus: 'sfx' });
  const keep = {};
  if (want('gun')) await gunSet(cat, keep);
  if (want('theme')) await themeSet(cat, keep);
  if (want('bells')) await bellSet(cat, keep);
  if (want('dragon') || want('ult')) await dragonSet(cat, keep);
  if (want('bellshell')) await bellShellSet(cat, keep);
  if (want('knell')) await knellSet(cat, keep);
  if (want('ult') || want('twin')) await ultSet(cat, keep);
  if (want('other') || want('twin')) await otherSet(cat, keep);
  if (want('view')) await viewSet(cat, keep);
  if (want('twin')) await twinSet(cat, keep);
  references(keep);
  await cat.write();
}
