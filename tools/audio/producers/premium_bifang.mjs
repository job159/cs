// M03 畢方．焚翼 Bifang Pyrewing / 鬼車．晦翼 Guiche Gloomwing — category 'premium_bifang' (docs/PREMIUM_WEAPONS.md M03,
// §1.12). CC0 recordings (FFSL shotguns + gun foley, Freesound fire / choir / tubular bells / gong / cymbal roll / taiko /
// glass / cloth / swoosh / stone / flesh, Kenney impacts) plus synthesis. The crane is 原創合成 as the card asks: a buzzy
// syrinx source on a pitch contour with the coiled trachea's roll, a biphonic second voice, formants and breath.
// Theme palette: bronze 銅鈴 + jade 玉磬 bells and plucked 琴弦 in F major pentatonic (the choir recordings sing F),
// flame breath ("呼"), porcelain and gold. Everything big carries a low layer with harmonics (psychoBass) and a space.
//
//   gun     bifang_close/_tail/_far/_mech   incendiary scatter cannon: heavy FFSL shotgun takes + a flame "fwump" and a
//                                            feather whip in the body, the -12 LUFS slap of the game's loudest guns
//           guiche_*                        the same design 4 semitones down, an echo in the tail / far (§1.12 twin rule:
//                                            the arsenal plays def.sound layers without the handler's twin treatment)
//   theme   bifang_fire                     per shot, ~12 dB under the gun: a pentatonic bell note, the flame "呼" and a
//                                            30 ms 6-10 kHz luxury transient (§1.12 普攻)
//   feel    bifang_hit_heavy bifang_sizzle (灼羽 per target per volley) bifang_kill bifang_soul
//   ready   ready_bifang (a short crane call over two bells) / ready_guiche (the same -4 st + echo, baked: specials.js
//           plays def.premium.ready.sfx directly)
//   skills  bifang_wing_open _wing_loop _beam_ready _wing_close _beam _feather_rain _feather_hit _crane_cry
//   ult     bifang_ult_rise (inhale 0.6 s) -> bifang_ult_pillar (40-60 Hz impact + choir / bell / gong bed) ->
//           bifang_crane_cry -> bifang_ult_flap | bifang_scream (鬼車夜啼) -> bifang_ult_dive -> bifang_ult_end (bell
//           tail + deflate): the three-layer ultimate of §1.12
//   crisis  bifang_cocoon (porcelain shatter + wings snapping shut + the fire tail)
//   foley   bifang_idle (hum loop) _draw _swish _feather _gate_open _cell_out _cell_in _gate_close _bell _click _inspect
// The handler (weapons/premium/bifang.js) plays every bifang_* cue through sfx(): 鬼車 hears them -4 st with a 0.17 s
// echo at runtime. bifang_soul is played at pitch 0.7 by the code: it is rendered 1/0.7 fast so it lands as designed.
//
//   node --max-old-space-size=2048 tools/audio/build.mjs --only premium_bifang
//   dev subset (never into the game folder: a subset run deletes the other files of the category):
//   CF_AUDIO_OUT=tools/audio/out/pb-dev PB_ONLY=gun,theme node --max-old-space-size=2048 tools/audio/run-producer.mjs \
//     tools/audio/producers/premium_bifang.mjs --spectrograms all
import { makeKit } from './weapons.mjs';

const SR = 48000;
let L, ctx, K;

const S = {
  m12: 'ffsl/Model 12/K_22P', nova: 'ffsl/Nova/O_21P', cd: 'ffsl/CD/H_21P',
  m12Mid: 'ffsl/Model 12/K_17P', novaMid: 'ffsl/Nova/O_17P', cdMid: 'ffsl/CD/H_16P',
  akCock: 'fs:675008', uzi: 'fs:677160', akReload: 'fs:674742', arReload: 'fs:815879', arHardware: 'fs:393732',
  combust: 'fs:412558', whooshA: 'fs:260554', whooshB: 'fs:260555', crackle: 'fs:363092', fireLog: 'fs:181563', sizzle: 'fs:382313',
  choirA: 'fs:764329', choirB: 'fs:764330', bellC4: 'fs:374273', bellC5: 'fs:374274', gong: 'fs:375532', gongHard: 'fs:375531',
  cymRoll: 'fs:375519', crash: 'fs:375497', taiko: 'fs:486140', shriek: 'fs:433735', banshee: 'fs:400168',
  glass: 'fs:221528', glass2: 'fs:244238', glass3: 'fs:202093',
  cape: 'fs:494797', clothHeavy: 'fs:163164', swoosh: 'fs:507466', swing: 'fs:268227',
  stone: 'fs:476117', stoneHeavy: 'fs:513694', flesh: 'fs:423301', fleshSlice: 'fs:504615',
  tink: 'kenney_impact/Audio/impactGlass_light_00', plate: 'kenney_impact/Audio/impactPlate_light_00',
};
const midi = (m) => 440 * 2 ** ((m - 69) / 12);
// F major pentatonic, F5 .. F7
const PENTA = [77, 79, 81, 84, 86, 89, 91, 93, 96, 98, 101].map(midi);
const TW = -4;                                    // the twin: semitones (§1.12 / the card: 降 4 個半音)

// ------------------------------------------------------------------------------------------------ small helpers
const at = (buf, t = 0, gain = 0, pan) => (pan === undefined ? { buf, at: t, gain } : { buf, at: t, gain, pan });
const nrm = (b, db = -1) => L.normalizePeak(b, db);
/** A smooth random wobble in [-1, 1] (three detuned sines), seeded. */
function wobble(seed, hz = [3.7, 7.3, 12.9]) {
  const r = L.rng(L.hashSeed(seed)), ph = hz.map(() => r.next() * 6.283), w = hz.map((_, i) => 1 / (i + 1));
  const sum = w.reduce((a, b) => a + b, 0);
  return (t) => hz.reduce((a, f, i) => a + Math.sin(6.283 * f * t + ph[i]) * w[i], 0) / sum;
}
/** Peaks shaved by the soft clipper so the loudness stage needs no limiting at all: on dense, bass-heavy material the
 *  true-peak limiter's 60 ms release keeps pulling (+1.2 dB of gain into it cost 3 dB of loudness on a feather hit). */
function dense(b, lufs, extra = -0.2) {
  const want = (-1.4 - lufs) + extra, plr = (x) => L.truePeakDb(x) - L.lufs(x);
  let o = K.clipToPLR(b, want, { min: 0, max: 16, threshold: -6 }), got = plr(o);
  if (got > want + 0.3) {
    // the clipper alone cannot get there (a few dominant low cycles): even the body out with a fast compressor first
    const c = L.compress(L.pad(L.normalizePeak(b, -1), 0.004, 0), { threshold: -20, ratio: 3, attack: 0.001, release: 0.05, knee: 6, lookahead: 0.003 });
    const o2 = K.clipToPLR(L.slice(c, 0.004), want, { min: 0, max: 16, threshold: -6 }), g2 = plr(o2);
    if (g2 < got) { o = o2; got = g2; }
  }
  if (got > want + 0.5) ctx.log(`    (clipper reached PLR ${got.toFixed(1)} of ${want.toFixed(1)})`);
  return o;
}
// Band-share targets (dB of energy per band, the weapons.mjs balance() bands): weighty but present. The first pass of
// the wing / flap / dive sounds put 70 % of their energy under 150 Hz: a boom with no definition.
const BAL = {
  big: { sub: -13, low: -7, lowMid: -5, mid: -4.5, high: -9, air: -14 },
  hit: { sub: -15, low: -8, lowMid: -5, mid: -4.5, high: -8, air: -13 },
};
const tone = (b, t, amount = 0.7) => K.balance(b, BAL[t] || t, amount);
/** Load a source slice (mono unless ch = 2), high-passed, peak-normalised. */
async function src(id, start, end, { ch = 1, hp = 60, lp, semis = 0, rate } = {}) {
  let b = await ctx.load(id, { start, end, ...(ch === 1 ? { channels: 1 } : {}) });
  if (ch === 2 && b.channels === 1) b = L.toStereo(b);
  if (semis) b = L.varispeedSemis(b, semis);
  if (rate) b = L.varispeed(b, rate);
  b = L.eq(b, [{ type: 'hp', f: hp, order: 2 }, ...(lp ? [{ type: 'lp', f: lp, order: 2 }] : [])]);
  return nrm(L.fadeOut(L.fadeIn(b, 0.002), Math.min(0.05, b.duration * 0.2), 'exp'));
}

// open-air temple courtyard: a long, fairly bright space for the spirit (bells and the crane hang in it)
const COURT = {
  length: 3.4, predelay: 0.03,
  echoes: { count: 12, t: [0.04, 0.6], gain: [0.15, 0.45], lp: [7500, 2600], spread: [0.004, 0.03], pan: 1 },
  tail: { rt60: 2.5, rtLow: 2.7, rtHigh: 1.3, gain: 0.6, start: 0.05, build: 0.16, lp: 6500, hp: 110 },
};
/** Dry + courtyard (+ an octave-up "shimmer" of the send: the ethereal halo of the spirit sounds). */
function space(b, { wet = 0.35, seed = 'sp', shimmer = -16, env = COURT, ch = 1, length } = {}) {
  const ir = L.makeIR(env, { seed, channels: ch, length });
  const out = L.convolve(b, ir, { wet, dry: 1 });
  if (shimmer == null) return out;
  const up = L.varispeed(L.toMono(b), 2);
  const sh = L.convolve(L.eq(up, [{ type: 'hp', f: 1200, order: 2 }]), L.makeIR(env, { seed: seed + 'h', channels: ch, length }), { wetOnly: true });
  return L.mix([at(out), at(sh, 0.02, shimmer + 20 * Math.log10(L.peak(out) / Math.max(1e-9, L.peak(sh))))], { channels: ch });
}

// ------------------------------------------------------------------------------------------------ instruments
// partial sets [ratio, amp, t60 scale]
const BELL = {
  // 銅鈴 bronze: hum, prime, tierce, quint, nominal ... warm and long, the hum outlasting the rest
  bronze: [[0.5, 0.22, 1.6], [1, 1, 1], [1.2, 0.4, 0.7], [1.5, 0.26, 0.55], [2, 0.6, 0.5], [2.52, 0.2, 0.3], [3.01, 0.15, 0.22], [4.1, 0.08, 0.14], [5.3, 0.05, 0.09]],
  // 玉磬 chime stone: a pure fundamental, sparse inharmonic overtones that die fast
  jade: [[1, 1, 1], [2.76, 0.32, 0.38], [5.4, 0.15, 0.16], [8.93, 0.06, 0.08]],
  // 鈴 small jingle: dense, short, bright
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
/** Plucked 琴弦 (Karplus-Strong, fractional delay) with a small wooden body: the theme's string voice. */
function pluck(f, dur, { t60 = 1.6, bright = 0.6, seed = 'pluck' } = {}) {
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
  const b = L.eq(new L.Buf([y], SR), [{ type: 'hp', f: f * 0.6, order: 2 }, { type: 'peak', f: 260, gain: 3, q: 1.2 }, { type: 'peak', f: 2400, gain: 2, q: 1 }, { type: 'lp', f: 6500, order: 2 }]);
  return nrm(L.fadeOut(b, Math.min(0.2, dur * 0.3), 'exp'));
}

const CRANE_F = [[1250, 7, 1.6], [2550, 5, 2], [3900, 3, 2.4]];
/**
 * Crane call (原創合成): band-limited saw + narrow pulse on a breakpoint pitch contour with vibrato and jitter, the
 * rolled "rrr" of the coiled trachea (amplitude roll at `roll` Hz), a biphonic second voice a fifth up, tracheal
 * formants, breath noise through the same envelope, a little tube rasp.
 */
function crane({ pts, env, dur, roll = 26, rollDepth = 0.55, vib = 0.01, vibHz = 6, fifth = -14, breath = -20, rasp = 6, seed = 'crane', formants = CRANE_F, bright = 0 } = {}) {
  const P = L.toFn(pts), E = L.toFn(env), j = wobble(seed + 'j'), w = wobble(seed + 'v', [vibHz, vibHz * 1.07]);
  const fq = (t) => P(t) * (1 + vib * w(t) + 0.007 * j(t));
  const saw = L.tone(dur, { type: 'saw', freq: fq });
  const pul = L.tone(dur, { type: 'pulse', pulseWidth: 0.2, freq: fq });
  const up = L.tone(dur, { type: 'saw', freq: (t) => fq(t) * 1.503 });
  let v = L.mix([at(saw), at(pul, 0, -6), at(up, 0, fifth)]);
  v = L.eq(v, [{ type: 'hp', f: 420, order: 2 }, ...formants.map(([f, g, q]) => ({ type: 'peak', f, gain: g, q })), { type: 'highshelf', f: 4500, gain: bright }, { type: 'lp', f: 6800, order: 2 }]);
  const n = v.length, am = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / SR; am[i] = Math.max(0, E(t)) * (1 - rollDepth * 0.5 * (1 - Math.cos(6.283 * roll * t + 0.8 * Math.sin(6.283 * 2.3 * t)))); }
  v = L.applyEnv(v, am);
  const br = L.applyEnv(L.eq(L.noise(dur, { color: 'pink', seed: seed + 'b' }), [{ type: 'bp', f: 2600, q: 0.6 }]), am);
  // (the asymmetric tube demodulates the roll: its 20-30 Hz envelope comes out as rumble, high-passed away)
  return L.hp(L.saturate(L.mix([at(nrm(v)), at(nrm(br), 0, breath)]), { drive: rasp, type: 'tube', mix: 0.5 }), 280, 4);
}
// the main call: a short "ko" then the long rolling "rrooo" that climbs and settles (k varies pitch / roll / timing)
function craneMain(k, { f = 1, dur = 1.05, roll = 26, seed = 'cm' } = {}) {
  const r = L.rng(L.hashSeed(seed + k)), s = f * (1 + r.range(-0.03, 0.03)), u = 1 + r.range(-0.06, 0.06);
  return crane({ dur, roll: roll + r.range(-2.5, 2.5), seed: seed + k,
    pts: [[0, 640 * s], [0.05 * u, 720 * s], [0.11 * u, 690 * s], [0.16 * u, 700 * s], [0.2 * u, 770 * s], [0.27 * u, 905 * s], [0.5, 885 * s], [0.8 * dur, 860 * s], [0.92 * dur, 800 * s], [dur, 730 * s]],
    env: [[0, 0], [0.012, 1], [0.1 * u, 0.8], [0.125 * u, 0.04], [0.165 * u, 0.04], [0.185 * u, 0.7], [0.27 * u, 1], [0.72 * dur, 0.85], [0.92 * dur, 0.4], [dur, 0]] });
}

/** Flame roar / "呼": a swept band of pink noise with a flicker (burning gas never holds still) and a little crackle. */
function roar(dur, { f0 = 400, f1 = 1000, f2, q = 0.9, flicker = 0.4, crack = -18, seed = 'roar', env } = {}) {
  const fr = f2 ? (t) => (t < dur / 2 ? f0 * (f1 / f0) ** (t / (dur / 2)) : f1 * (f2 / f1) ** ((t - dur / 2) / (dur / 2))) : (t) => f0 * (f1 / f0) ** (t / dur);
  let b = L.sweep(L.noise(dur, { color: 'pink', seed }), 'bp', fr, { q });
  const j = wobble(seed + 'f', [7, 13, 21]);
  b = L.automate(b, (t) => Math.max(0, 1 + flicker * j(t)));
  b = L.mix([at(nrm(b)), at(nrm(L.crackle(dur, { density: 70, decay: 0.003, hp: 2200, seed: seed + 'c' })), 0, crack)]);
  const E = env ? L.toFn(env) : L.toFn([[0, 0], [dur * 0.3, 1], [dur, 0]]);
  return L.automate(b, (t) => Math.max(0, E(t)) ** 1.5);
}
/** One wing beat: an air "whump" (low-passed noise, cutoff falling as the wing stops), feather flutter on the stroke
 *  (dense clicks through a 2-6 kHz band), a low thump, and a cape-flap recording for the body. */
async function wing({ size = 1, seed = 'wing', cloth = true } = {}) {
  const D = 0.32 * size + 0.1;
  const air = L.applyEnv(L.sweep(L.noise(D, { color: 'pink', seed: seed + 'a' }), 'lp', (t) => (900 / size) * Math.exp(-t / (0.12 * size)) + 160, { q: 0.9 }),
    L.envCurve(D, [[0, 0], [0.035 * size, 1], [0.12 * size, 0.55], [D, 0]]));
  const fl = L.applyEnv(L.eq(L.crackle(D, { density: 900, decay: 0.0012, hp: 1800, seed: seed + 'f' }), [{ type: 'bp', f: 3600, q: 0.6 }]),
    L.envCurve(D, [[0, 0], [0.03 * size, 1], [0.1 * size, 0.6], [0.22 * size, 0], [D, 0]]));
  const th = L.thump({ f0: 110 / Math.sqrt(size), f1: 48, sweep: 0.03, decay: 0.12 * size, drive: 2, seed: seed + 't' });
  const parts = [at(nrm(air)), at(nrm(fl), 0.008, -9), at(nrm(th), 0.01, -9 + 3 * Math.log2(size))];
  if (cloth) parts.push(at(await src(S.cape, 0, 0.335, { hp: 140, semis: -4 * Math.log2(size) - 1 }), 0, -3));
  return L.mix(parts);
}
/** Sung "ah" (synthetic, for pitches the recorded choir cannot reach without turning chipmunk): detuned saws with
 *  vibrato through soprano /a/ formants (800 / 1150 / 2900 Hz) and a breath of noise. */
function ahh(f, dur, { voices = 5, seed = 'ah', vib = 0.009 } = {}) {
  const r = L.rng(L.hashSeed(seed)), parts = [];
  for (let i = 0; i < voices; i++) {
    const d = 1 + r.range(-0.006, 0.006), w = wobble(seed + i, [5 + r.range(-0.6, 0.6), 0.7]);
    parts.push(at(L.tone(dur, { type: 'saw', freq: (t) => f * d * (1 + vib * w(t)), phase: r.next() }), 0, -r.range(0, 3)));
  }
  const air = L.eq(L.noise(dur, { color: 'pink', seed: seed + 'n' }), [{ type: 'bp', f: 2900, q: 1.2 }]);
  const b = L.eq(L.mix([...parts, at(nrm(air), 0, -18)]), [{ type: 'hp', f: f * 0.7, order: 2 }, { type: 'peak', f: 800, gain: 12, q: 2.5 }, { type: 'peak', f: 1150, gain: 9, q: 3 },
    { type: 'peak', f: 2900, gain: 7, q: 4 }, { type: 'lp', f: 5200, order: 2 }]);
  return nrm(b);
}
/** Choir "ahh" (CC0 crowd singing F) pitched by `semis`, `dur` s of the sustained middle, faded in / out. */
async function choir(semis, dur, { which = 0, start = 1.0, fadeIn = 0.12, fadeOut = 0.4 } = {}) {
  const r = 2 ** (semis / 12);
  const b = await src(which ? S.choirB : S.choirA, start, start + dur * r + 0.05, { hp: 160, rate: r });
  return L.fadeOut(L.fadeIn(L.slice(b, 0, dur), fadeIn, 'sine'), fadeOut, 'sine');
}

// ------------------------------------------------------------------------------------------------ the gun
const PYRE = {
  // [source, onset s, semis]: heavy shotgun takes, pitched down a touch for the cannon's weight
  near: [[S.m12, 0.842, -1], [S.cd, 3.075, -1.2], [S.nova, 3.465, -0.8], [S.m12, 7.445, -1.4], [S.cd, 0.464, -1]],
  mid: [[S.m12Mid, 0.907, -1], [S.cdMid, 4.117, -1.2], [S.novaMid, 3.708, -0.8]],
  close: { direct: 0.12, len: 0.36, hp: 48, crack: -8, plr: 10.6, eq: [{ type: 'peak', f: 140, gain: 2.5, q: 0.8 }, { type: 'peak', f: 1100, gain: 1.5, q: 0.9 }, { type: 'highshelf', f: 7000, gain: -1 }],
    bal: { sub: -11, low: -5, lowMid: -4.5, mid: -5, high: -11, air: -16 }, balTwin: { sub: -10, low: -4.5, lowMid: -4.5, mid: -5.5, high: -12.5, air: -18 } },
};
/**
 * The close layer (weapons.mjs designClose, plus two layers of our own): recorded blast (transient clipped first) +
 * crack + body + sub + the flame "fwump" of the crest fan + a feather whip as the 8 pellets leave; parallel compression,
 * psycho-bass, exciter, width, early room, envelope, tone, band balance, PLR clipper. `semis` scales every designed
 * frequency and duration (the recording was loaded at that pitch already): the twin is the same gun 4 st down.
 */
function pyreClose(shot, k, semis = 0) {
  const C = PYRE.close, q = 2 ** (semis / 12), r = ctx.rng(`pyre_close_${semis}_${k}`), seed = `pc${semis}_${k}`;
  const direct = C.direct / q, len = C.len / q;
  let d = K.chan(shot, k % 2);
  d = L.slice(d, 0, direct + 0.03);
  d = L.eq(d, [{ type: 'hp', f: C.hp * q, order: 4 }, ...C.eq.map((e) => ({ ...e, f: e.f * q }))]);
  d = L.automate(d, (t) => (t < direct * 0.45 ? 1 : Math.exp(-(((t - direct * 0.45) / (direct * 0.32)) ** 1.5))));
  d = L.softClip(L.gain(L.normalizePeak(d, 0), 6), { threshold: -10, ceiling: -1 });
  const lay = (buf, dB, win, t = 0) => ({ buf, at: t, gainLin: (K.rmsOf(L.slice(d, 0, win)) / Math.max(1e-9, K.rmsOf(L.slice(buf, 0, win)))) * L.db2lin(dB) });
  const f = (1 + r.range(-0.05, 0.05)) * q;
  const body = L.eq(L.thump({ f0: 175 * f, f1: 74 * f, sweep: 0.02 / q, decay: 0.13 / q, click: 0, drive: 2.5, seed: seed + 'b' }), [{ type: 'hp', f: 70 * q, order: 2 }]);
  const sub = L.thump({ f0: 84 * q, f1: 43 * q, sweep: 0.035 / q, decay: 0.11 / q, click: 0, drive: 1.2, seed: seed + 's' });
  // the crest fan's flame "fwump": a pink burst in the 250-1800 Hz band, swelling ~4 ms after the crack
  const fw = L.eq(L.noiseBurst({ dur: 0.18 / q, attack: 0.004, decay: 0.1 / q, color: 'pink', seed: seed + 'f' }), [{ type: 'hp', f: 250 * q, order: 2 }, { type: 'peak', f: 560 * f, gain: 6, q: 0.8 }, { type: 'lp', f: 1800 * q, order: 2 }]);
  // eight feathers leaving: a short airy whip 2.4 -> 6.5 kHz
  const whip = L.whoosh({ dur: 0.09 / q, f0: 2400 * q, f1: 6500 * q, q: 1.4, seed: seed + 'w' });
  const layers = [{ buf: d }, lay(K.crack(seed + 'c', { dur: 0.012 / q, decay: 0.0035 / q, hp: 1800 * q }), C.crack + r.range(-1, 1), 0.006),
    lay(body, -5 + r.range(-0.8, 0.8), 0.05), lay(sub, -10.5 + r.range(-1, 1), 0.08), lay(fw, -6.5 + r.range(-1, 1), 0.06, 0.004 / q), lay(whip, -16, 0.05 / q, 0.012 / q)];
  let m = L.normalizePeak(L.mix(layers), 0);
  const pre = 0.004;
  const crushed = L.slice(L.compress(L.pad(m, pre, 0), { threshold: -26, ratio: 6, attack: 0.0008, release: 0.015, knee: 6, makeup: 15, lookahead: 0.002 }), pre);
  m = L.mix([{ buf: m, gainLin: 1 - 0.55 * 0.5 }, { buf: crushed, gainLin: 0.55 }]);
  m = L.psychoBass(m, { freq: 120, amount: -9 });
  m = L.exciter(m, { freq: 2500 * q, drive: 10, amount: -12 });
  m = L.stereoize(m, { width: 0.3, hp: 350, seed: seed + 'st' });
  m = L.reverb(m, 'smallRoom', { wet: 0.17, seed: seed + 'rm', length: 0.4 });
  m = L.slice(m, 0, len);
  m = L.automate(m, (t) => (t < len * 0.3 ? 1 : Math.pow(1 - (t - len * 0.3) / (len * 0.7), 2.2)));
  m = L.eq(m, [{ type: 'peak', f: 1700 * q, gain: 3, q: 0.55 }, { type: 'hp', f: 38, order: 4 }]);
  m = K.balance(m, semis ? C.balTwin : C.bal, 0.75);
  return L.pad(K.clipToPLR(m, C.plr, { min: 3, max: 22, threshold: -16 }), 0.003, 0);
}
/** The twin's echo (§1.12 "加回聲"): the blast again at +170 ms (the handler's sfx echo time) and +340 ms, band-limited,
 *  diffused and darker each time: a ghost of the shot, not a second shot. Mixed into an existing tail. */
function twinEcho(tail, shot, { at0 = 0.155, lufs = -20, peakDb = -15.5, mono = false } = {}) {
  let e = L.slice(L.toMono(shot), 0, 0.16);
  e = L.fadeOut(L.eq(e, [{ type: 'hp', f: 260, order: 2 }, { type: 'lp', f: 2800, order: 2 }]), 0.06, 'exp');
  e = L.diffuse(e, { stages: 5, minMs: 1.5, maxMs: 11, seed: 'twe' });
  const e2 = L.eq(L.diffuse(e, { stages: 4, minMs: 2, maxMs: 16, seed: 'twe2' }), [{ type: 'lp', f: 1600, order: 2 }]);
  const ch = mono ? 1 : 2;
  const rms10 = (b) => { const x = L.toMono(b).data[0], w = 480; let best = 0; for (let i = 0; i + w <= x.length; i += 120) { let s = 0; for (let j = 0; j < w; j++) s += x[i + j] * x[i + j]; best = Math.max(best, s / w); } return 10 * Math.log10(best + 1e-20); };
  let g = 0, out = tail;
  for (let it = 0; it < 3; it++) {
    const eS = mono ? e : L.pan(e, -0.35), e2S = mono ? e2 : L.pan(e2, 0.35);
    out = L.mix([at(tail), at(eS, at0, g), at(e2S, at0 + 0.17, g - 6)], { channels: ch });
    const norm = lufs - L.lufs(out);                 // the file will be normalised to `lufs`
    const now = rms10(L.gain(L.slice(L.mix([at(eS, 0, g)], { channels: ch }), 0, 0.2), norm));
    g += peakDb - now;
  }
  return out;
}

async function gunSets(cat) {
  for (const [name, semis] of [['bifang', 0], ['guiche', TW]]) {
    ctx.log(`-- ${name} gun (${semis} st)`);
    const closes = [], tails = [], fars = [], log = [];
    const near = PYRE.near.map(([id, t, s]) => ({ id, t, semis: s + semis }));
    for (let k = 0; k < near.length; k++) {
      const s = near[k];
      const shot = await K.loadShot(s.id, s.t, 0.75, { semis: s.semis });
      let best = null;
      for (let a = 0; a < 4; a++) {
        K.codecLog.length = 0;
        const m = await K.codecSafe(pyreClose(shot, k + a * 101, semis), -12);
        const info = K.codecLog[0];
        const score = info.limitedDb + Math.max(0, info.decTp + 1.3) * 3 + (Math.abs(info.lufs + 12) > 0.25 ? 50 : 0);
        if (!best || score < best.score) best = { m, info, score, a };
        if (score <= 2) break;
      }
      log.push(`lim ${best.info.limitedDb} dTP ${best.info.decTp} (take ${best.a + 1})`);
      closes.push(best.m);
    }
    ctx.log(`  pre-master ${name}_close: ${log.join(' | ')}`);
    const q = 2 ** (semis / 12);
    const G = { name: `${name}`, close: { direct: PYRE.close.direct / q }, tail: { len: 2.1 / q, rec: 0, darken: 40 }, far: { dist: 170, len: 2.2 / q } };
    for (let k = 0; k < 3; k++) {
      const s = near[[0, 1, 2][k]];
      const shot = await K.loadShot(s.id, s.t, G.close.direct + G.tail.len + 0.1, { semis: s.semis });
      let t = K.designTail(G, shot, k);
      if (semis) t = K.trimEnd(twinEcho(t, shot));
      tails.push(t);
    }
    for (let k = 0; k < 3; k++) {
      const [id, t0, s0] = PYRE.mid[k];
      const shot = await K.loadShot(id, t0, Math.max(0.7, G.far.len + 0.1), { semis: s0 + semis });
      let f = K.designFar(G, shot, k, true);
      if (semis) f = twinEcho(f, shot, { at0: 0.17, lufs: -22, peakDb: -20, mono: true });
      fars.push(f);
    }
    // mech: the beak's jaw and the open bolt (cut from a real AK charging handle, pitched down) + a porcelain-and-gold tink
    const mechs = [];
    for (const [k, [a, z, ms]] of [[0.15, 0.71, -4], [2.18, 2.77, -4.5], [4.41, 4.95, -3.5]].entries()) {
      const b = await K.grab(S.akCock, a, z, { mode: 'peak', post: 0.09, semis: ms + semis, hp: 250 });
      const tink = L.eq(bell(3150 * q * (1 + k * 0.04), { kind: 'jade', t60: 0.07, seed: `mt${k}`, strike: -10 }), [{ type: 'hp', f: 1500 * q, order: 2 }]);
      mechs.push(L.mix([at(b, 0.01), at(nrm(tink), 0.014, -11)]));
    }
    const srcs = [...new Set([...PYRE.near.map((n) => n[0]), ...PYRE.mid.map((n) => n[0])])];
    await cat.add(`${name}_close`, closes, { lufs: -12, quality: 0.6, maxLimitDb: 6, limiter: { release: 0.02 }, spatial: true, range: [12, 60], channels: 2, voices: 4, pitch: [0.97, 1.03], priority: 3, sources: srcs });
    await cat.add(`${name}_tail`, tails, { target: 'gunTail', spatial: false, channels: 2, voices: 3, pitch: [0.98, 1.02], sources: srcs });
    await cat.add(`${name}_far`, fars, { target: 'gunFar', spatial: true, range: [40, 420], voices: 4, pitch: [0.95, 1.04], priority: 2, sources: srcs });
    await cat.add(`${name}_mech`, mechs, { target: 'gunMech', spatial: false, channels: 1, voices: 3, pitch: [0.95, 1.05], maxHeadMs: 20, sources: [S.akCock] });
  }
}

// ------------------------------------------------------------------------------------------------ produce
export async function produce(lib, c) {
  L = lib; ctx = c; K = makeKit(lib, ctx);
  const only = process.env.PB_ONLY ? new Set(process.env.PB_ONLY.split(',').map((s) => s.trim())) : null;
  if (only && !process.env.CF_AUDIO_OUT) throw new Error('PB_ONLY writes a partial category: set CF_AUDIO_OUT to a scratch folder');
  const want = (g) => !only || only.has(g);
  const cat = ctx.category('premium_bifang', { bus: 'sfx' });
  // short one-shots lose 0.5-1.5 dB of loudness in Vorbis: pre-compensate (ui_amb.mjs codecTrim); EPERM retry for a
  // file the dev server is reading
  const add = async (name, bufs, opts) => {
    bufs = (Array.isArray(bufs) ? bufs : [bufs]).filter(Boolean);
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
      // codec-aware pre-master (weapons.mjs codecSafe): clipped, dense material overshoots 1-2 dB through Vorbis, and
      // cat.add() would take that back out of the loudness (a feather hit landed at -17.2 for -16). In the final
      // channel layout first: a stereo mix folded to mono afterwards peaks differently
      const ch = opts.channels ?? ((opts.spatial ?? true) ? 1 : undefined), out = [];
      K.codecLog.length = 0;
      for (const b of bufs) out.push(await K.codecSafe(ch ? L.setChannels(b, ch) : b, lufs, { quality: opts.quality ?? 0.5, release: 0.015 }));
      const lim = K.codecLog.map((c) => c.limitedDb);
      if (Math.max(...lim) > 0.5) ctx.log(`  pre-master ${name}: limiter ${lim.join(' / ')} dB`);
      bufs = out;
    }
    // fast limiter release (the weapons.mjs foley / close setting): at the default 60 ms the limiter kept pulling on
    // dense, bass-heavy hits and cost them 2-3 LU it then could not give back
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
  // voices: 鬼車 plays every bifang_* cue twice (the echo copy 0.17 s later), so the caps leave room for both (a crane
  // cry for the ultimate was dropped while the wings' cry and its echo still held both of 2 voices)
  const SP = (range, o = {}) => ({ spatial: true, channels: 1, range, ...o });       // positional (mono)
  const D2 = (o = {}) => ({ spatial: false, ...o });                                   // 2D (local only)

  if (want('gun')) await gunSets({ add });
  if (want('theme')) await themeSet(add, D2);
  if (want('feel')) await feelSet(add, SP, D2);
  if (want('ready')) await readySet(add);
  if (want('skills')) await skillSet(add, SP, D2);
  if (want('ult')) await ultSet(add, SP);
  if (want('foley')) await foleySet(add, SP, D2);
  await cat.write();
}

// ------------------------------------------------------------------------------------------------ theme layer (per shot)
async function themeSet(add, D2) {
  // the flame "呼" of the crest fan: a burst of the CC0 combustion take (rumble removed) under a synthesized breath
  const comb = await src(S.combust, 0.0, 0.5, { hp: 260, lp: 7000 });
  const out = [];
  const notes = [PENTA[5], PENTA[6], PENTA[7], PENTA[8], PENTA[9]];         // F6 G6 A6 C7 D7: any run of shots is in key
  for (let k = 0; k < notes.length; k++) {
    const r = ctx.rng(`fire${k}`), f = notes[k];
    const b1 = bell(f, { kind: 'bronze', t60: 0.55, seed: `fb${k}`, strike: -20, tilt: -2.5 });
    const b2 = bell(f * 2.003, { kind: 'tiny', t60: 0.16, seed: `fs${k}`, strike: -24 });
    // 貴氣瞬態: 30 ms of 6-10 kHz (a filtered tick + two short high partials)
    const lux = L.mix([at(nrm(L.noiseBurst({ dur: 0.03, decay: 0.01, bp: 8000, q: 1.3, seed: `fl${k}` }))),
      at(nrm(L.partials(0.035, { base: 7200 * (1 + r.range(-0.03, 0.03)), list: [[1, 1, 0.02], [1.29, 0.6, 0.015]], seed: `flp${k}` })), 0, -4)]);
    const hu = L.mix([at(nrm(roar(0.3, { f0: 700, f1: 1500, f2: 520, q: 1.1, flicker: 0.3, crack: -22, seed: `fh${k}`, env: [[0, 0], [0.03, 1], [0.12, 0.6], [0.3, 0]] }))),
      at(L.fadeOut(L.slice(comb, 0.01 + k * 0.02, 0.3 + k * 0.02), 0.15, 'exp'), 0, -5)]);
    const p = k % 2 ? 0.22 : -0.22;
    // the bell leads (the gun underneath owns everything below ~400 Hz: a theme layer there is only mud)
    let m = L.mix([at(b1, 0, 0, p), at(b2, 0.002, -10, -p), at(lux, 0, -8), at(L.toStereo(hu), 0.006, -8)], { channels: 2, length: 0.62 });
    m = L.eq(m, [{ type: 'hp', f: 420, order: 4 }]);
    out.push(dense(L.fadeOut(m, 0.2, 'exp'), -14));
  }
  await add('bifang_fire', out, D2({ lufs: -14, channels: 2, voices: 4, pitch: [0.995, 1.005], sources: [S.combust], note: 'theme layer on every shot (handler volume 0.32): ~12 dB under the gun' }));
}

// ------------------------------------------------------------------------------------------------ hit / kill feel
async function feelSet(add, SP, D2) {
  // point-blank volley (5+ pellets in one body): a meaty slap, the flames catching, a short sizzle
  // (the visceral take holds single impacts at 0.82 / 1.19 / 1.90 s; its first 0.15 s is a triple)
  const slice = await src(S.fleshSlice, 0.125, 0.6, { hp: 150 });
  const siz = await src(S.sizzle, 0.3, 1.2, { hp: 1800 });
  const heavy = [];
  for (let k = 0; k < 4; k++) {
    const r = ctx.rng(`hh${k}`), t0 = [0.818, 1.19, 1.89, 0.818][k];
    const flesh = await src(S.flesh, t0, t0 + 0.3, { hp: 90, semis: k === 3 ? -1.5 : 0 });
    const th = L.thump({ f0: 150, f1: 58, sweep: 0.02, decay: 0.12, drive: 3, seed: `hht${k}` });
    const fw = L.eq(L.noiseBurst({ dur: 0.25, attack: 0.006, decay: 0.12, color: 'pink', seed: `hhf${k}` }), [{ type: 'hp', f: 220, order: 2 }, { type: 'peak', f: 700, gain: 6, q: 0.8 }, { type: 'lp', f: 2600, order: 2 }]);
    let m = L.mix([at(flesh, 0, -1), at(L.slice(slice, k * 0.02, 0.3 + k * 0.02), 0.003, -8), at(nrm(th), 0, -6),
      at(nrm(fw), 0.012, -5), at(L.fadeOut(L.slice(siz, k * 0.15, k * 0.15 + 0.4), 0.2, 'exp'), 0.05, -14 + r.range(-1, 1))], { length: 0.45 });
    m = tone(L.psychoBass(m, { freq: 120, amount: -8 }), 'hit');
    heavy.push(dense(L.fadeOut(m, 0.15, 'exp'), -17));
  }
  await add('bifang_hit_heavy', heavy, D2({ lufs: -17, vol: 1.5, channels: 1, voices: 3, pitch: [0.95, 1.05], sources: [S.flesh, S.fleshSlice, S.sizzle] }));

  // 灼羽 hit layer (card: 燃燒的滋滋聲), once per target per volley, positional: the feathers catching on the body --
  // a short fat sizzle, a dry crackle and a tiny bell tick on top (the bell is the weapon's voice in every hit)
  const siz2 = await src(S.sizzle, 0.2, 1.7, { hp: 700 });
  const crk = await src(S.crackle, 0.1, 1.3, { hp: 1100 });
  const sizz = [];
  for (let k = 0; k < 5; k++) {
    const r = ctx.rng(`sz${k}`);
    const tick = bell(PENTA[7 + (k % 3)] * 2, { kind: 'tiny', t60: 0.09, seed: `szb${k}`, strike: -10 });
    const a = L.fadeOut(L.slice(siz2, k * 0.24, k * 0.24 + 0.34), 0.2, 'exp');
    const c = L.fadeOut(L.slice(crk, k * 0.2, k * 0.2 + 0.2), 0.1, 'exp');
    const m = L.mix([at(nrm(a), 0, 0), at(nrm(c), 0.008, -6 + r.range(-1, 1)), at(nrm(tick), 0.003, -11)], { length: 0.38 });
    sizz.push(dense(L.fadeOut(m, 0.12, 'exp'), -19));
  }
  await add('bifang_sizzle', sizz, SP([4, 40], { lufs: -19, vol: 1.2, voices: 4, pitch: [0.94, 1.06], sources: [S.sizzle, S.crackle] }));

  // kill sting (叮＋鈴 + the flame): a bright bronze strike, a shake of small bells, a rising flare and a low punch
  const kills = [];
  for (let k = 0; k < 3; k++) {
    const r = ctx.rng(`ks${k}`), f = PENTA[8 + (k % 2)];
    const ding = bell(f, { kind: 'bronze', t60: 0.9, seed: `kd${k}`, strike: -12, tilt: -1 });
    const jingle = L.mix([0, 1, 2, 3, 4].map((i) => at(bell(PENTA[7 + ((i + k) % 4)] * 2 * (1 + r.range(-0.01, 0.01)), { kind: 'tiny', t60: 0.12, seed: `kj${k}${i}`, strike: -8 }), 0.012 + i * 0.026 + r.range(0, 0.008), -6 - i * 1.5)));
    const flare = roar(0.45, { f0: 500, f1: 2200, q: 1, flicker: 0.35, seed: `kf${k}`, env: [[0, 0], [0.06, 1], [0.2, 0.5], [0.45, 0]] });
    const punch = L.thump({ f0: 190, f1: 80, sweep: 0.02, decay: 0.11, drive: 3, seed: `kp${k}` });
    let m = L.mix([at(ding, 0, 0, 0.12), at(jingle, 0, -5, -0.2), at(L.toStereo(nrm(flare)), 0.01, -8), at(L.toStereo(nrm(punch)), 0, -9)], { channels: 2, length: 1.0 });
    m = L.reverb(m, 'smallRoom', { wet: 0.14, seed: `kr${k}`, length: 0.5 });
    kills.push(L.fadeOut(L.slice(m, 0, 1.0), 0.35, 'exp'));
  }
  await add('bifang_kill', kills, D2({ lufs: -17, channels: 2, voices: 3, pitch: [0.99, 1.01], priority: 3 }));

  // 鬼車 KE_SOUL: the ghost-fire wisp lands in the gun: a reversed bell swell sucked in, a soft hollow "whoom", a glassy
  // chime. Rendered 1/0.7 fast: the handler plays it at pitch 0.7 (x 0.794 for the twin)
  const souls = [];
  for (let k = 0; k < 2; k++) {
    const bl = bell(PENTA[6 + k], { kind: 'jade', t60: 0.8, seed: `sb${k}`, strike: -30 });
    const swell = L.reverse(L.slice(L.convolve(bl, L.makeIR(COURT, { seed: `sr${k}`, channels: 1, length: 1.2 }), { wet: 1, dry: 0.4 }), 0, 0.9));
    const whoom = L.eq(L.whoosh({ dur: 0.35, f0: 300, f1: 900, q: 1.6, seed: `sw${k}` }), [{ type: 'lp', f: 2500, order: 2 }]);
    const chime = bell(PENTA[9 - k], { kind: 'jade', t60: 0.6, seed: `sc${k}`, strike: -14 });
    let m = L.mix([at(L.fadeIn(nrm(swell), 0.2), 0, -3), at(nrm(whoom), 0.7, -6), at(chime, 0.88, -4)], { length: 1.7 });
    m = L.varispeed(L.fadeOut(m, 0.4, 'exp'), 1 / 0.7);
    souls.push(m);
  }
  await add('bifang_soul', souls, D2({ lufs: -19, vol: 1.25, channels: 1, voices: 4, pitch: [0.98, 1.02] }));
}

// ------------------------------------------------------------------------------------------------ ready (unique per §1.12)
async function readySet(add) {
  // 就緒: a short bright crane call "kroo!" answered by a bronze F6 and a jade D7 (a sixth: the 反災 ready is two bells a
  // fifth apart, §1.12 wants no ready sound repeated), in the courtyard
  const make = (k) => {
    const call = crane({ dur: 0.36, roll: 24, seed: `rc${k}`, pts: [[0, 820], [0.05, 960], [0.2, 1010], [0.36, 900]], env: [[0, 0], [0.01, 1], [0.24, 0.85], [0.36, 0]], bright: 2 });
    const b1 = bell(PENTA[5], { kind: 'bronze', t60: 1.5, seed: `rb${k}`, strike: -14 }), b2 = bell(PENTA[9], { kind: 'jade', t60: 1.2, seed: `rj${k}`, strike: -14 });
    let m = L.mix([at(L.toStereo(nrm(call)), 0, -1), at(b1, 0.16, -5, -0.3), at(b2, 0.22, -6, 0.3)], { channels: 2 });
    m = space(m, { wet: 0.28, seed: `rs${k}`, shimmer: -20, ch: 2, length: 1.8 });
    return L.fadeOut(L.slice(m, 0, 2.0), 0.6, 'exp');
  };
  const vars = [make(0), make(1)];
  await add('ready_bifang', vars, { lufs: -18, bus: 'ui', spatial: false, channels: 2, voices: 2, pitch: [1, 1], priority: 3 });
  // the twin: the same cue 4 st down with the 0.17 s echo baked (specials.js plays the def's ready cue directly)
  const tw = vars.map((v) => {
    const d = L.varispeedSemis(v, TW);
    return L.mix([at(d), at(L.eq(d, [{ type: 'lp', f: 3500, order: 2 }]), 0.17, -9.4), at(L.eq(d, [{ type: 'lp', f: 2200, order: 2 }]), 0.34, -16)], { channels: 2 });
  });
  await add('ready_guiche', tw, { lufs: -18, bus: 'ui', spatial: false, channels: 2, voices: 2, pitch: [1, 1], priority: 3 });
}

// ------------------------------------------------------------------------------------------------ skills
async function skillSet(add, SP, D2) {
  // the crane's call (first draw, wings spread, the descent): the full "ko-rrooo" with the courtyard and its halo
  const cries = [];
  for (let k = 0; k < 3; k++) cries.push(L.fadeOut(L.slice(space(craneMain(k, { seed: 'cry' }), { wet: 0.42, seed: `cs${k}`, shimmer: -15 }), 0, 2.6), 0.9, 'exp'));
  await add('bifang_crane_cry', cries, SP([10, 160], { lufs: -16, voices: 4, pitch: [0.98, 1.02], priority: 3 }));

  // ◎ 焚翼 spread "轟": a flame ignition roar, the wings snapping open (two beats), a low boom, a sparkle of bells
  const ign = await src(S.whooshA, 0.0, 1.2, { hp: 140, lp: 9000 });
  const opens = [];
  for (let k = 0; k < 2; k++) {
    const w1 = await wing({ size: 1.4, seed: `wo${k}` });
    const boom = L.thump({ f0: 120, f1: 44, sweep: 0.05, decay: 0.35, drive: 3, seed: `wob${k}` });
    const sparkle = L.mix([0, 1, 2, 3, 4, 5].map((i) => at(bell(PENTA[5 + i], { kind: 'tiny', t60: 0.35, seed: `wos${k}${i}`, strike: -10 }), 0.08 + i * 0.035, -4 - i)));
    let m = L.mix([at(nrm(w1), 0, -1), at(L.fadeOut(L.slice(ign, 0.02 + k * 0.05, 0.9 + k * 0.05), 0.4, 'exp'), 0.01, -2),
      at(nrm(roar(0.8, { f0: 300, f1: 1400, f2: 500, q: 0.8, seed: `wor${k}`, env: [[0, 0], [0.05, 1], [0.3, 0.6], [0.8, 0]] })), 0.02, -6), at(nrm(boom), 0.01, -5), at(sparkle, 0, -10)], { length: 1.1 });
    m = tone(L.psychoBass(m, { freq: 110, amount: -7 }), 'big');
    opens.push(dense(L.fadeOut(m, 0.4, 'exp'), -15));
  }
  await add('bifang_wing_open', opens, SP([4, 60], { lufs: -15, voices: 3, pitch: [0.97, 1.03], sources: [S.whooshA, S.cape] }));

  // ◎ held: the steady roar of the burning wings, a slow wing sway, a faint bell drone (seamless 4 s loop)
  {
    const D = 4.6, xf = 0.6;
    const fire = await src(S.crackle, 3.0, 3.0 + D, { hp: 300 });
    const body = roar(D, { f0: 380, f1: 520, q: 0.7, flicker: 0.3, crack: -14, seed: 'wl', env: [[0, 1], [D, 1]] });
    const sway = L.mix([at(await wing({ size: 0.8, seed: 'wl1', cloth: false }), 0.6, -10), at(await wing({ size: 0.8, seed: 'wl2', cloth: false }), 2.6, -11)], { length: D });
    const drone = L.automate(L.mix([at(bell(PENTA[0], { kind: 'jade', t60: 9, dur: D, beat: 0.0009, seed: 'wld1', strike: -60 })), at(bell(PENTA[3], { kind: 'jade', t60: 9, dur: D, beat: 0.0011, seed: 'wld2', strike: -60 }), 0, -3)]), (t) => 0.75 + 0.25 * Math.sin(6.283 * t / (D - xf)));
    let m = L.mix([at(nrm(body), 0, -2), at(fire, 0, -4), at(sway), at(nrm(drone), 0, -20)], { length: D });
    m = L.loopCrossfade(L.hp(m, 160, 2), xf);   // (a bed under the gunfire: its low end would only mask the shots)
    await add('bifang_wing_loop', m, SP([4, 40], { lufs: -21, loop: true, voices: 2, pitch: [1, 1], sources: [S.crackle] }));
  }

  // the "fold now" cue: one clear jade bell and a fast rising arpeggio of small bells (the fans flaring), stereo, UI bus
  const readyB = [];
  for (let k = 0; k < 2; k++) {
    const arp = L.mix([5, 7, 8, 10].map((n, i) => at(bell(PENTA[n], { kind: 'tiny', t60: 0.4, seed: `ba${k}${i}`, strike: -12 }), i * 0.03, -2 - i, (i - 1.5) * 0.25)), { channels: 2 });
    const big = bell(PENTA[9 - k], { kind: 'jade', t60: 1.4, seed: `bj${k}`, strike: -10 });
    const inhale = L.whoosh({ dur: 0.25, f0: 800, f1: 4000, q: 1.5, seed: `bi${k}` });
    let m = L.mix([at(arp, 0, -3), at(L.toStereo(big), 0.12, 0), at(L.toStereo(nrm(inhale)), 0, -14)], { channels: 2 });
    readyB.push(L.fadeOut(L.slice(L.reverb(m, 'smallRoom', { wet: 0.2, seed: `br${k}`, length: 0.6 }), 0, 1.4), 0.5, 'exp'));
  }
  await add('bifang_beam_ready', readyB, D2({ lufs: -19, bus: 'ui', channels: 2, voices: 2, pitch: [1, 1], priority: 3 }));

  // wings fold forward into a beak: a fast feather swoop and the bones' gold clack
  const closes = [];
  for (let k = 0; k < 2; k++) {
    const sw = await src(S.swoosh, 0.2, 0.72, { hp: 250, semis: -2 - k });
    const fl = await wing({ size: 0.7, seed: `wc${k}`, cloth: true });
    const clack = await K.grab(S.akCock, [0.15, 2.18][k], [0.71, 2.77][k], { mode: 'peak', post: 0.08, semis: -2, hp: 300 });
    let m = L.mix([at(sw, 0, -3), at(nrm(fl), 0.04, -4), at(clack, 0.19, -6), at(bell(PENTA[4], { kind: 'jade', t60: 0.2, seed: `wck${k}` }), 0.195, -16)], { length: 0.6 });
    closes.push(L.fadeOut(L.toStereo(m), 0.18, 'exp'));
  }
  await add('bifang_wing_close', closes, D2({ lufs: -19, channels: 2, voices: 2, pitch: [0.97, 1.03], sources: [S.swoosh, S.akCock, S.cape] }));

  // 焚天光 (鬼車: 晦天墜 = this, -4 st + echo): ignition crack + low boom, a high choir "啊——" (octave + fifth stack),
  // the beam's sizzling roar with rings racing down it (8 rising pings), fading with the beam (1.2 s + 0.35)
  {
    // the recorded choir an octave and a fifth up (C5 / F5), the synthetic sopranos on top (A5 + C6)
    const chA = await choir(12, 1.6, { which: 0, start: 1.2, fadeIn: 0.05, fadeOut: 0.5 });
    const chB = await choir(7, 1.5, { which: 1, start: 1.4, fadeIn: 0.08, fadeOut: 0.5 });
    const env = (D) => (b) => L.fadeOut(L.fadeIn(b, 0.06, 'sine'), D * 0.4, 'sine');
    const chC = L.mix([at(env(1.4)(ahh(PENTA[2], 1.4, { seed: 'bah1' }))), at(env(1.3)(ahh(PENTA[3], 1.3, { seed: 'bah2' })), 0.04, -3)]);
    const siz = await src(S.sizzle, 10.4, 12.4, { hp: 1500 });
    const beams = [];
    for (let k = 0; k < 2; k++) {
      const crack = L.mix([at(nrm(L.noiseBurst({ dur: 0.05, decay: 0.012, hp: 1500, lp: 14000, seed: `bk${k}` }))), at(nrm(L.thump({ f0: 160, f1: 52, sweep: 0.03, decay: 0.4, drive: 4, seed: `bb${k}` })), 0, -3)]);
      // 低頻轟鳴: a rumble of low noise that breathes with the beam (a tonal hum here read as a drone, not a blast)
      const rumble = L.automate(L.eq(L.noise(1.7, { color: 'brown', seed: `bru${k}` }), [{ type: 'hp', f: 38, order: 2 }, { type: 'lp', f: 320, order: 2 }]),
        (t) => (t < 0.03 ? t / 0.03 : Math.exp(-Math.max(0, t - 0.9) * 4)) * (1 + 0.3 * Math.sin(6.283 * 7 * t)));
      const body = roar(1.7, { f0: 900, f1: 2400, f2: 700, q: 0.7, flicker: 0.45, crack: -12, seed: `bm${k}`, env: [[0, 0], [0.03, 1], [1.1, 0.8], [1.7, 0]] });
      const rings = L.mix([...Array(8)].map((_, i) => at(L.whoosh({ dur: 0.14, f0: 1500 + i * 300, f1: 5000 + i * 400, q: 3, seed: `bri${k}${i}` }), 0.05 + i * 0.15, -4 - (i > 5 ? (i - 5) * 3 : 0))));
      const choirs = L.mix([at(chA, 0.03, -k), at(chB, 0.06, -3), at(nrm(chC), 0.05, -5)]);
      let m = L.mix([at(crack, 0, 0), at(nrm(rumble), 0.01, -8), at(nrm(body), 0.02, -9), at(nrm(choirs), 0.02, -4),
        at(L.fadeOut(L.slice(siz, k * 0.3, 1.5 + k * 0.3), 0.5, 'exp'), 0.05, -13), at(nrm(rings), 0, -13)], { length: 1.9 });
      m = tone(L.psychoBass(m, { freq: 110, amount: -6 }), 'big', 0.6);
      m = space(m, { wet: 0.22, seed: `bs${k}`, shimmer: -22, length: 1.6 });
      beams.push(dense(L.fadeOut(L.slice(m, 0, 2.2), 0.6, 'exp'), -13));
    }
    await add('bifang_beam', beams, SP([10, 150], { lufs: -13, voices: 3, pitch: [0.98, 1.02], priority: 3, sources: [S.choirA, S.choirB, S.sizzle] }));
  }

  // ★ 羽落 cast: a "shing", an upward rush into the sky and a descending cascade of bells (the feathers coming down)
  const rains = [];
  for (let k = 0; k < 2; k++) {
    const rush = L.whoosh({ dur: 0.55, f0: 350, f1: 4200, q: 1.2, seed: `fr${k}` });
    const shing = L.mix([at(bell(PENTA[10], { kind: 'tiny', t60: 0.5, seed: `fsh${k}`, strike: -6 })), at(nrm(L.noiseBurst({ dur: 0.2, decay: 0.08, hp: 5000, seed: `fsn${k}` })), 0, -10)]);
    const cascade = L.mix([10, 9, 8, 7, 6, 5, 4, 3].map((n, i) => at(bell(PENTA[n], { kind: 'bronze', t60: 0.7, seed: `fc${k}${i}`, strike: -14 }), 0.25 + i * 0.12 + (i % 2) * 0.02, -3 - i * 0.8)));
    let m = L.mix([at(shing, 0, -2), at(nrm(rush), 0.02, -4), at(nrm(cascade), 0.0, -7)], { length: 1.9 });
    rains.push(L.fadeOut(L.slice(space(m, { wet: 0.3, seed: `frs${k}`, shimmer: -18, length: 1.5 }), 0, 2.2), 0.6, 'exp'));
  }
  await add('bifang_feather_rain', rains, SP([6, 70], { lufs: -17, voices: 3, pitch: [0.98, 1.02] }));

  // each burning feather lance landing: a 25 ms falling zip, a stone-cracking thud, a flame burst, a sizzle tail
  // (three takes of the stone impact + a heavier one; the street's low end is the boom's job, the takes are high-passed)
  const stones = [await src(S.stone, 0.0, 0.46, { hp: 130 }), await src(S.stone, 1.0, 1.46, { hp: 130 }), await src(S.stoneHeavy, 0.07, 0.75, { hp: 110 }), await src(S.stone, 2.0, 2.45, { hp: 130 })];
  const siz2 = await src(S.sizzle, 28.2, 30.2, { hp: 1800 });
  const hits = [];
  for (let k = 0; k < 6; k++) {
    const r = ctx.rng(`fh${k}`);
    const zip = L.whoosh({ dur: 0.05, f0: 6000, f1: 1800, q: 2, seed: `fz${k}` });
    const thud = stones[k % 4];
    const fw = L.eq(L.noiseBurst({ dur: 0.35, attack: 0.008, decay: 0.16, color: 'pink', seed: `ff${k}` }), [{ type: 'hp', f: 200, order: 2 }, { type: 'peak', f: 650, gain: 6, q: 0.8 }, { type: 'lp', f: 3000, order: 2 }]);
    const boom = L.thump({ f0: 140, f1: 52, sweep: 0.025, decay: 0.16, drive: 3, seed: `fbm${k}` });
    let m = L.mix([at(nrm(zip), 0, -14), at(thud, 0.025, -2 + r.range(-1, 1)), at(nrm(boom), 0.025, -9), at(nrm(fw), 0.03, -5),
      at(L.fadeOut(L.slice(siz2, k * 0.25, k * 0.25 + 0.5), 0.25, 'exp'), 0.08, -15), at(bell(PENTA[3 + (k % 5)], { kind: 'tiny', t60: 0.15, seed: `ft${k}` }), 0.027, -18)], { length: 0.7 });
    m = tone(L.psychoBass(m, { freq: 120, amount: -8 }), 'hit');
    hits.push(dense(L.fadeOut(m, 0.25, 'exp'), -18));
  }
  await add('bifang_feather_hit', hits, SP([5, 60], { target: 'impact', vol: 1.5, voices: 8, pitch: [0.93, 1.07], sources: [S.stone, S.stoneHeavy, S.sizzle] }));
}

// ------------------------------------------------------------------------------------------------ the ultimate
async function ultSet(add, SP) {
  // ① 吸氣式上升音 (0 -> 0.6 s): a cymbal roll swelling (its crescendo, sped up), a breath drawn in, a rising tone
  // 0.8 -> 1.25 of F3 (§1.12 charge rule), cut on the downbeat where the pillar lands
  // (the swell: a crash cymbal reversed into the downbeat, and the loud end of a recorded roll crescendo)
  const crash = await src(S.crash, 0.0, 1.4, { hp: 300 });
  const roll = await src(S.cymRoll, 5.6, 6.4, { hp: 400 });
  const rises = [];
  for (let k = 0; k < 2; k++) {
    const D = 0.62;
    const rev = L.slice(L.reverse(L.slice(crash, 0.005 + k * 0.01, 0.95)), 0.95 - D - 0.005, 0.95);
    const cym = L.mix([at(nrm(rev)), at(L.automate(L.slice(roll, 0, D), (t) => (t / D) ** 2.2), 0, -6)]);
    const breath = L.applyEnv(L.sweep(L.noise(D, { color: 'pink', seed: `ub${k}` }), 'bp', (t) => 400 * (3200 / 400) ** (t / D), { q: 1.4 }), L.envCurve(D, [[0, 0], [D * 0.85, 1], [D, 0.6]]));
    const tone = L.automate(L.saturate(L.mix([at(L.tone(D, { type: 'saw', freq: (t) => 174.6 * (0.8 + 0.45 * (t / D) ** 1.5) })), at(L.tone(D, { type: 'sine', freq: (t) => 349.2 * (0.8 + 0.45 * (t / D) ** 1.5) }), 0, -3)]), { drive: 6 }), (t) => (t / D) ** 1.8);
    const rb = L.reverse(L.slice(bell(PENTA[0], { kind: 'bronze', t60: 1.2, seed: `urb${k}` }), 0, D));
    let m = L.mix([at(nrm(cym), 0, -2), at(nrm(breath), 0, -5), at(L.lp(nrm(tone), 2500), 0, -9), at(nrm(rb), 0, -10)], { length: D + 0.03 });
    m = L.fadeOut(m, 0.03, 'sine');
    rises.push(m);
  }
  await add('bifang_ult_rise', rises, SP([10, 120], { lufs: -16, voices: 3, pitch: [1, 1], maxHeadMs: 600, sources: [S.crash, S.cymRoll] }));

  // ②③ the pillar lands (t = 0.6): a 40-60 Hz impact (0.3 s, with harmonics), taiko + gong (鑼鼓), the fire column roaring
  // up, then the bed: choir F major (F / A / C / F) and tubular bells, swelling and fading by ~3.4 s
  const taiko = await src(S.taiko, 0.0, 0.7, { hp: 40 });
  const gong = await src(S.gong, 0.12, 4.0, { hp: 60 });
  const bellC5 = await src(S.bellC5, 0.0, 3.5, { hp: 200, semis: 5 });     // C5 -> F5
  const bellC4 = await src(S.bellC4, 0.0, 3.5, { hp: 150, semis: 5 });     // C4 -> F4
  const cF = await choir(0, 3.2, { which: 0, start: 1.0, fadeIn: 0.25, fadeOut: 1.2 });
  const cA = await choir(4, 3.0, { which: 1, start: 1.2, fadeIn: 0.3, fadeOut: 1.2 });
  const cC = await choir(7, 3.0, { which: 0, start: 2.4, fadeIn: 0.35, fadeOut: 1.1 });
  const cF2 = await choir(12, 2.8, { which: 1, start: 2.0, fadeIn: 0.4, fadeOut: 1.0 });
  const ign = await src(S.whooshB, 0.0, 1.6, { hp: 120 });
  const pillars = [];
  for (let k = 0; k < 2; k++) {
    const sub = L.saturate(L.thump({ f0: 62, f1: 41, sweep: 0.06, decay: 0.32, dur: 0.5, drive: 1.5, seed: `ps${k}` }), { drive: 3, type: 'tube', mix: 0.4 });
    const crack = L.mix([at(nrm(L.noiseBurst({ dur: 0.08, decay: 0.02, hp: 800, lp: 12000, seed: `pc${k}` }))), at(nrm(L.thump({ f0: 220, f1: 70, sweep: 0.02, decay: 0.12, drive: 3, seed: `pt${k}` })), 0, -2)]);
    const column = roar(2.0, { f0: 250, f1: 1600, f2: 600, q: 0.7, flicker: 0.4, crack: -14, seed: `pr${k}`, env: [[0, 0], [0.05, 1], [0.8, 0.6], [2.0, 0]] });
    const bed = L.mix([at(cF, 0.05, 0), at(cA, 0.1, -3), at(cC, 0.12, -3), at(cF2, 0.2, -8), at(bellC4, 0.0, -5), at(bellC5, 0.02, -7)], { length: 3.5 });
    let m = L.mix([at(nrm(sub), 0, -1), at(crack, 0, -4), at(taiko, 0, -4), at(gong, 0.01, -6), at(L.fadeOut(ign, 0.6, 'exp'), 0.0, -7), at(nrm(column), 0.02, -10),
      at(nrm(bed), 0.05, -14 - k)], { length: 3.6 });
    m = tone(L.psychoBass(m, { freq: 100, amount: -5 }), 'big', 0.6);
    m = space(m, { wet: 0.3, seed: `pp${k}`, shimmer: -20, length: 2.4 });
    pillars.push(dense(L.fadeOut(L.slice(m, 0, 4.2), 1.2, 'exp'), -13));
  }
  await add('bifang_ult_pillar', pillars, SP([12, 220], { lufs: -13, voices: 3, pitch: [1, 1], priority: 4, sources: [S.taiko, S.gong, S.bellC4, S.bellC5, S.choirA, S.choirB, S.whooshB] }));

  // ④ 畢方 wing beat (t = 1.15, with the 80 ms hit stop): a giant "轟": two pitched-down wing strokes, a sub boom, an air
  // blast, a storm of feathers, the fire gusting
  const flaps = [];
  for (let k = 0; k < 2; k++) {
    const w1 = await wing({ size: 2.6, seed: `uf${k}` }), w2 = await wing({ size: 1.8, seed: `uf2${k}` });
    const boom = L.saturate(L.thump({ f0: 90, f1: 38, sweep: 0.06, decay: 0.55, dur: 0.8, drive: 2, seed: `ufb${k}` }), { drive: 4, type: 'tube', mix: 0.5 });
    const blast = L.applyEnv(L.eq(L.noise(1.0, { color: 'pink', seed: `ufa${k}` }), [{ type: 'lp', f: 1400, order: 2 }, { type: 'hp', f: 60, order: 2 }]), L.envCurve(1.0, [[0, 0], [0.02, 1], [0.15, 0.5], [1.0, 0]]));
    const storm = L.applyEnv(L.eq(L.crackle(1.2, { density: 1400, decay: 0.0015, hp: 1500, seed: `ufs${k}` }), [{ type: 'bp', f: 4200, q: 0.5 }]), L.envCurve(1.2, [[0, 0], [0.05, 1], [0.4, 0.5], [1.2, 0]]));
    const gust = roar(1.1, { f0: 220, f1: 900, f2: 300, q: 0.7, flicker: 0.5, seed: `ufg${k}`, env: [[0, 0], [0.06, 1], [0.5, 0.5], [1.1, 0]] });
    let m = L.mix([at(nrm(w1), 0, 0), at(nrm(w2), 0.03, -5), at(nrm(boom), 0.005, -2), at(nrm(blast), 0, -6), at(nrm(storm), 0.02, -12), at(nrm(gust), 0.04, -7)], { length: 1.4 });
    m = tone(L.psychoBass(m, { freq: 100, amount: -4 }), 'big');
    m = L.reverb(m, 'urban', { wet: 0.22, seed: `ufr${k}`, length: 1.4, channels: 1 });
    flaps.push(dense(L.fadeOut(L.slice(m, 0, 1.6), 0.6, 'exp'), -12));
  }
  await add('bifang_ult_flap', flaps, SP([12, 200], { lufs: -12, vol: 1.2, voices: 3, pitch: [0.97, 1.03], priority: 4, sources: [S.cape] }));

  // ④' 鬼車夜啼 (the twin's signature; played -4 st + echo by the handler): nine heads shrieking at once (synthesized cries,
  // harsher, detuned across two octaves) over a CC0 shriek, three shock pulses (the three rings), a black gust
  const shriek = await src(S.shriek, 0.05, 1.9, { hp: 300 });
  const banshee = await src(S.banshee, 1.0, 2.8, { hp: 300 });
  const screams = [];
  for (let k = 0; k < 2; k++) {
    const r = ctx.rng(`sc${k}`), heads = [];
    for (let i = 0; i < 9; i++) {
      const f = 520 * 2 ** ((i - 4) / 6) * (1 + r.range(-0.03, 0.03)), D = 1.25 + r.range(-0.15, 0.15);
      heads.push(at(crane({ dur: D, roll: 30 + r.range(-6, 6), rollDepth: 0.6, rasp: 9, fifth: -8, breath: -19, seed: `sh${k}${i}`, bright: 3,
        pts: [[0, f * 0.9], [0.08, f * 1.35], [0.4, f * 1.25], [D * 0.8, f * 1.1], [D, f * 0.8]], env: [[0, 0], [0.02, 1], [D * 0.6, 0.8], [D, 0]] }), r.range(0, 0.09), -6 - Math.abs(i - 4) * 0.8, (i - 4) / 5));
    }
    const pulses = L.mix([0, 0.12, 0.24].map((t, i) => at(nrm(L.thump({ f0: 110, f1: 40, sweep: 0.04, decay: 0.3, drive: 3, seed: `sp${k}${i}` })), t, -i * 2)));
    const gust = roar(1.6, { f0: 200, f1: 700, f2: 250, q: 0.6, flicker: 0.6, seed: `sg${k}`, env: [[0, 0], [0.1, 1], [1.6, 0]] });
    let m = L.toMono(L.mix([...heads, at(L.toStereo(shriek), 0.02, -4), at(L.toStereo(banshee), 0.1, -12), at(L.toStereo(nrm(pulses)), 0, -3), at(L.toStereo(nrm(gust)), 0, -9)], { channels: 2, length: 1.9 }));
    m = L.reverb(m, COURT, { wet: 0.3, seed: `ss${k}`, length: 1.6, channels: 1 });
    screams.push(dense(L.fadeOut(L.slice(m, 0, 2.3), 0.7, 'exp'), -14));
  }
  await add('bifang_scream', screams, SP([12, 200], { lufs: -14, voices: 2, pitch: [0.98, 1.02], priority: 4, sources: [S.shriek, S.banshee] }));

  // ⑤ the dive (t = 1.8, 1.2 s low over the street): a doppler rush past, the flame jet roaring behind, feathers, a whistle
  const jet = await src(S.whooshB, 0.0, 2.4, { hp: 150 });
  const fireLog = await src(S.fireLog, 4.0, 6.0, { hp: 250 });
  const dives = [];
  for (let k = 0; k < 2; k++) {
    const D = 1.7;
    const rush = L.varispeedCurve(L.sweep(L.noise(D * 1.4, { color: 'pink', seed: `dv${k}` }), 'bp', (t) => 700 + 900 * Math.sin(Math.min(1, t / (D * 1.2)) * Math.PI), { q: 0.8 }), [[0, 1.2], [0.6, 1.15], [0.85, 0.8], [D, 0.75]], { maxSeconds: D });
    const env = (t) => (t < 0.7 ? (t / 0.7) ** 1.5 : Math.exp(-(t - 0.7) * 2.2));
    const whistle = L.automate(L.tone(D, { type: 'sine', freq: (t) => (t < 0.7 ? 1200 + 800 * t / 0.7 : 2000 - 1100 * Math.min(1, (t - 0.7) / 0.4)) }), (t) => env(t) * 0.5);
    let m = L.mix([at(L.automate(nrm(rush), env), 0, -2), at(L.fadeOut(L.slice(jet, 0.1 + k * 0.2, 0.1 + k * 0.2 + D), 0.6, 'exp'), 0.2, -4), at(L.fadeIn(L.slice(fireLog, 0, D), 0.3), 0.3, -10),
      at(nrm(await wing({ size: 1.6, seed: `dw${k}` })), 0.55, -6), at(whistle, 0, -20)], { length: D + 0.2 });
    m = tone(L.psychoBass(m, { freq: 110, amount: -6 }), 'big');
    dives.push(dense(L.fadeOut(m, 0.6, 'exp'), -15));
  }
  await add('bifang_ult_dive', dives, SP([10, 160], { lufs: -15, voices: 3, pitch: [0.97, 1.03], sources: [S.whooshB, S.fireLog] }));

  // ⑥ exit (t = 3.0): the bird bursts into fire feathers: a soft whoomp, the bell chord's long tail (F6 C7 F7), and the
  // deflate (洩氣聲): breath let go, falling from 3 kHz to 500 Hz
  const ends = [];
  for (let k = 0; k < 2; k++) {
    const chord = L.mix([at(bell(PENTA[5], { kind: 'bronze', t60: 2.4, seed: `ue1${k}`, strike: -12 }), 0, 0), at(bell(PENTA[8], { kind: 'jade', t60: 2.0, seed: `ue2${k}`, strike: -14 }), 0.05, -3), at(bell(PENTA[10], { kind: 'jade', t60: 1.4, seed: `ue3${k}`, strike: -14 }), 0.1, -7)]);
    const deflate = L.applyEnv(L.sweep(L.noise(1.0, { color: 'pink', seed: `ud${k}` }), 'bp', (t) => 3000 * (500 / 3000) ** t, { q: 1.2 }), L.envCurve(1.0, [[0, 0], [0.06, 1], [0.5, 0.5], [1.0, 0]]));
    const whoomp = L.mix([at(nrm(roar(0.6, { f0: 250, f1: 900, f2: 300, q: 0.8, seed: `uw${k}`, env: [[0, 0], [0.04, 1], [0.6, 0]] }))), at(nrm(L.thump({ f0: 120, f1: 48, decay: 0.25, drive: 3, seed: `ut${k}` })), 0, -4)]);
    let m = L.mix([at(whoomp, 0, -3), at(nrm(chord), 0.02, -4), at(nrm(deflate), 0.15, -8)], { length: 2.6 });
    ends.push(L.fadeOut(L.slice(space(m, { wet: 0.32, seed: `uesp${k}`, shimmer: -16, length: 2.0 }), 0, 3.2), 1.0, 'exp'));
  }
  await add('bifang_ult_end', ends, SP([10, 140], { lufs: -17, voices: 3, pitch: [0.99, 1.01] }));
}

// ------------------------------------------------------------------------------------------------ crisis + foley
async function foleySet(add, SP, D2) {
  // 羽衣 crisis armour: porcelain shattering (glass takes + porcelain partials), the wings snapping shut around the
  // player (thump + feather swoop), then the element's tail: fire whoosh up and a bell (§1.12 危機護甲)
  const g1 = await src(S.glass, 0.33, 1.1, { hp: 400 }), g2 = await src(S.glass2, 0.17, 1.2, { hp: 400 }), g3 = await src(S.glass3, 0.15, 1.2, { hp: 400 });
  const cocoon = [];
  for (let k = 0; k < 2; k++) {
    const shards = L.mix([0, 1, 2, 3, 4, 5].map((i) => at(bell(2400 * 2 ** (i / 5 + k * 0.1), { kind: 'jade', t60: 0.25, seed: `cs${k}${i}`, strike: -6, beat: 0 }), i * 0.018, -6 - i)));
    const snap = await wing({ size: 1.2, seed: `cw${k}` });
    const tail = roar(0.9, { f0: 300, f1: 1800, f2: 600, q: 0.8, seed: `ct${k}`, env: [[0, 0], [0.08, 1], [0.9, 0]] });
    let m = L.mix([at([g1, g2, g3][k], 0, -1), at([g3, g1][k], 0.03, -6), at(nrm(shards), 0, -6), at(nrm(snap), 0, -3),
      at(nrm(L.thump({ f0: 150, f1: 55, decay: 0.2, drive: 3, seed: `cth${k}` })), 0, -6), at(nrm(tail), 0.3, -6), at(bell(PENTA[7], { kind: 'bronze', t60: 1.2, seed: `cb${k}` }), 0.32, -9)], { length: 1.6 });
    m = tone(L.psychoBass(m, { freq: 120, amount: -8 }), 'hit');
    cocoon.push(dense(L.fadeOut(m, 0.5, 'exp'), -15));
  }
  await add('bifang_cocoon', cocoon, SP([4, 50], { lufs: -15, voices: 3, pitch: [0.98, 1.02], priority: 3, sources: [S.glass, S.glass2, S.glass3, S.cape] }));

  // 待機 hum (§1.12): 87 Hz (F2) sine + 2nd harmonic, a band of noise 400-1200 Hz swept by a 0.2 Hz LFO, and a very
  // light flame breathing in and out (seamless 5 s loop = one LFO period)
  {
    const D = 5.0;
    const sine = L.mix([at(L.tone(D, { type: 'sine', freq: 87.31 })), at(L.tone(D, { type: 'sine', freq: 174.61 }), 0, -9), at(L.tone(D, { type: 'sine', freq: 261.9 }), 0, -16)]);
    const band = L.sweep(L.noise(D, { color: 'pink', seed: 'ih' }), 'bp', (t) => 700 * 1.7 ** Math.sin(6.283 * 0.2 * t), { q: 1.6 });
    const breathE = (t) => 0.35 + 0.65 * Math.max(0, Math.sin(6.283 * 0.4 * t)) ** 2;
    const flame = L.automate(L.mix([at(nrm(roar(D, { f0: 500, f1: 600, q: 0.8, flicker: 0.25, crack: -10, seed: 'ifl', env: [[0, 1], [D, 1]] })))]), breathE);
    let m = L.mix([at(nrm(sine), 0, -3), at(nrm(band), 0, -8), at(nrm(flame), 0, -12)], { length: D });
    // seamless: everything above repeats at 5 s (0.2 / 0.4 Hz, harmonics of 0.2 Hz); the noise edges are crossfaded
    const loop = L.loopCrossfade(L.mix([at(m), at(L.slice(m, 0, 0.4), D)], { length: D + 0.4 }), 0.4);
    await add('bifang_idle', loop, D2({ lufs: -24, loop: true, channels: 1, voices: 1, pitch: [1, 1] }));
  }

  // the theme bell (first draw's last beat, the reload's gate, inspect): a bronze F6 and a jade C7 a breath later
  const bells = [0, 1].map((k) => L.fadeOut(L.slice(L.reverb(L.mix([at(bell(PENTA[5], { kind: 'bronze', t60: 1.3, seed: `tb${k}`, strike: -12 }), 0, 0, -0.15),
    at(bell(PENTA[8] * (1 + k * 0.002), { kind: 'jade', t60: 1.0, seed: `tj${k}`, strike: -14 }), 0.07, -5, 0.2)], { channels: 2 }), 'smallRoom', { wet: 0.2, seed: `tr${k}`, length: 0.8 }), 0, 1.7), 0.5, 'exp'));
  await add('bifang_bell', bells, D2({ lufs: -20, channels: 2, voices: 3, pitch: [0.99, 1.01] }));

  // the feather clicking home (inspect): a tiny gold click, a porcelain tink, a sparkle
  const clicks = [0, 1].map((k) => L.mix([at(nrm(L.noiseBurst({ dur: 0.012, decay: 0.002, bp: 3600, q: 2.5, seed: `ck${k}` }))), at(bell(4200 + k * 300, { kind: 'jade', t60: 0.12, seed: `ckt${k}`, strike: -20 }), 0.002, -6),
    at(bell(PENTA[9 + k], { kind: 'tiny', t60: 0.35, seed: `cks${k}`, strike: -20 }), 0.02, -10)], { length: 0.45 }));
  await add('bifang_click', clicks.map((b) => dense(L.fadeOut(b, 0.15, 'exp'), -20)), D2({ lufs: -20, channels: 1, voices: 3, pitch: [0.97, 1.03] }));

  // first draw (0-0.4 s 瓷與金屬輕響): the heavy gun coming up (cloth + gear), porcelain tinks, a gold ring
  const cloth = await src(S.clothHeavy, 0.0, 0.6, { hp: 120 });
  const tk = [await src(`${S.tink}0`, 0, 0.21, { hp: 400, semis: 9 }), await src(`${S.tink}2`, 0, 0.21, { hp: 400, semis: 11 })];
  const plate = await src(`${S.plate}1`, 0, 0.6, { hp: 300, semis: 7 });
  const draws = [];
  for (let k = 0; k < 2; k++) {
    const gear = await K.grab(S.arHardware, [1.0, 4.99][k], [1.26, 5.16][k], { mode: 'peak', post: 0.1, hp: 200 });
    let m = L.mix([at(cloth, 0, -6), at(gear, 0.05, -3), at(tk[k], 0.16, -6), at(tk[1 - k], 0.24, -10), at(plate, 0.2, -12), at(bell(2793 * (1 + k * 0.03), { kind: 'bronze', t60: 0.5, seed: `dg${k}`, strike: -10 }), 0.17, -14)], { length: 0.8 });
    draws.push(L.fadeOut(m, 0.25, 'exp'));
  }
  await add('bifang_draw', draws, D2({ lufs: -21, channels: 1, voices: 3, pitch: [0.97, 1.03], sources: [S.clothHeavy, S.arHardware, `${S.tink}0`, `${S.tink}2`, `${S.plate}1`] }));

  // 「颯」: the wings spreading (first draw, inspect): a bright fast swoosh and a feather flutter
  const swishes = [];
  for (let k = 0; k < 2; k++) {
    const sw = await src(S.swoosh, 0.22, 0.7, { hp: 600, semis: 3 + k });
    let m = L.mix([at(sw, 0, -1), at(nrm(await wing({ size: 0.6, seed: `ss${k}`, cloth: false })), 0.02, -6), at(bell(PENTA[10], { kind: 'tiny', t60: 0.3, seed: `ssb${k}`, strike: -20 }), 0.06, -16)], { length: 0.55 });
    swishes.push(dense(L.fadeOut(m, 0.15, 'exp'), -20));
  }
  await add('bifang_swish', swishes, D2({ lufs: -20, channels: 1, voices: 3, pitch: [0.96, 1.04], sources: [S.swoosh] }));

  // feathers folding / rustling (first draw fold, rare idle, ready shiver)
  const feathers = [];
  for (let k = 0; k < 3; k++) {
    const capeF = await src(S.cape, 0, 0.335, { hp: 500, semis: 2 + k * 1.5 });
    const fl = L.applyEnv(L.eq(L.crackle(0.4, { density: 600, decay: 0.0015, hp: 2500, seed: `fe${k}` }), [{ type: 'bp', f: 5000, q: 0.6 }]), L.envCurve(0.4, [[0, 0], [0.05, 1], [0.25, 0.3], [0.4, 0]]));
    feathers.push(L.fadeOut(L.mix([at(capeF, 0, 0), at(nrm(fl), 0.01, -8)], { length: 0.42 }), 0.12, 'exp'));
  }
  await add('bifang_feather', feathers, D2({ lufs: -24, channels: 1, voices: 3, pitch: [0.95, 1.05], sources: [S.cape] }));

  // reload (匣、蓋、鈴): the side gate flips open, the spent feather cell comes out smoking, the new one seats with a rising
  // charge, the gate slapped shut (the bell follows from the clip)
  const tink0 = tk[0];
  const gOpen = [], cOut = [], cIn = [], gClose = [];
  for (let k = 0; k < 2; k++) {
    const latch = await K.grab(S.akReload, [0.0, 0.84][k], [0.45, 1.42][k], { mode: 'peak', post: 0.1, hp: 250 });
    gOpen.push(L.fadeOut(L.mix([at(latch, 0, 0), at(tink0, 0.012, -12), at(bell(1975, { kind: 'jade', t60: 0.15, seed: `go${k}` }), 0.01, -18)], { length: 0.3 }), 0.08, 'exp'));
    const rel = await K.grab(S.arReload, [0.0, 0.576][k], [0.42, 0.96][k], { mode: 'peak', post: 0.12, hp: 250 });
    const hiss = L.eq(L.noiseBurst({ dur: 0.6, attack: 0.02, decay: 0.4, seed: `ch${k}` }), [{ type: 'hp', f: 2500, order: 2 }, { type: 'peak', f: 6000, gain: 5, q: 0.8 }]);
    const glassSlide = L.eq(L.whoosh({ dur: 0.18, f0: 2500, f1: 1200, q: 3, seed: `cgs${k}` }), [{ type: 'hp', f: 900, order: 2 }]);
    cOut.push(L.fadeOut(L.mix([at(rel, 0, 0), at(nrm(glassSlide), 0.02, -12), at(nrm(hiss), 0.06, -14)], { length: 0.7 }), 0.25, 'exp'));
    const seat = await K.grab(S.arReload, [1.353, 1.658][k], [1.6, 1.87][k], { mode: 'peak', post: 0.1, hp: 200 });
    const charge = L.automate(L.mix([at(L.tone(0.4, { type: 'sine', freq: (t) => 349 * (1 + t * 1.5) })), at(L.tone(0.4, { type: 'sine', freq: (t) => 698 * (1 + t * 1.5) }), 0, -8)]), (t) => (t < 0.05 ? t / 0.05 : Math.exp(-(t - 0.05) * 7)));
    cIn.push(L.fadeOut(L.mix([at(nrm(L.whoosh({ dur: 0.12, f0: 1200, f1: 3200, q: 3, seed: `ci${k}` })), 0, -14), at(seat, 0.08, 0), at(tk[k], 0.085, -12), at(nrm(charge), 0.09, -16)], { length: 0.55 }), 0.15, 'exp'));
    const slap = await K.grab(S.akCock, [2.18, 4.41][k], [2.77, 4.95][k], { mode: 'peak', post: 0.1, semis: -3, hp: 200 });
    gClose.push(L.fadeOut(L.mix([at(slap, 0, 0), at(nrm(L.thump({ f0: 240, f1: 110, decay: 0.07, drive: 2, seed: `gc${k}` })), 0, -8), at(tk[1 - k], 0.006, -10), at(plate, 0.004, -14)], { length: 0.45 }), 0.12, 'exp'));
  }
  const RL = { lufs: -21, channels: 1, voices: 3, pitch: [0.97, 1.03] };
  await add('bifang_gate_open', gOpen, D2({ ...RL, sources: [S.akReload] }));
  await add('bifang_cell_out', cOut, D2({ ...RL, sources: [S.arReload] }));
  await add('bifang_cell_in', cIn, D2({ ...RL, sources: [S.arReload] }));
  await add('bifang_gate_close', gClose, D2({ ...RL, lufs: -20, sources: [S.akCock] }));

  // inspect 主題短樂句 (§1.12, 2-3 s): a plucked-string line in F pentatonic answered by bells, original, soft
  const phrase = [];
  const lines = [[[2, 0], [4, 0.24], [5, 0.48], [7, 0.84], [5, 1.08], [8, 1.5]], [[4, 0], [5, 0.22], [7, 0.44], [8, 0.8], [7, 1.02], [9, 1.44]]];
  for (let k = 0; k < 2; k++) {
    const notes = lines[k].map(([n, t], i) => at(pluck(PENTA[n] / 2, 1.6, { t60: 1.4, bright: 0.3, seed: `ip${k}${i}` }), t, i === lines[k].length - 1 ? -1 : -3, (i % 3 - 1) * 0.3));
    const answer = at(bell(PENTA[lines[k].at(-1)[0]], { kind: 'jade', t60: 1.6, seed: `ib${k}`, strike: -16 }), 1.52, -8, 0.15);
    let m = L.mix([...notes, answer], { channels: 2, length: 3.0 });
    m = L.reverb(m, COURT, { wet: 0.22, seed: `ir${k}`, length: 1.5 });
    phrase.push(L.fadeOut(L.slice(m, 0, 3.0), 0.8, 'exp'));
  }
  await add('bifang_inspect', phrase, D2({ lufs: -21, channels: 2, voices: 2, pitch: [1, 1] }));
}
