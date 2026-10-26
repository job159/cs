// M04 焰樞．破限 Pyrecore Unbound (神兵 heavy forge-core cannon, docs/PREMIUM_WEAPONS.md M04 + §1.12) — category
// 'premium_yanshu': every cue game/src/weapons/premium/yanshu.js plays (YANSHU_SOUNDS: its SFX table, the clips' 'snd'
// events, the idle hum, the def's ready cue ready_yanshu), the def.sound contract (yanshu_close / _tail / _far / _mech)
// and the reserved twin 焰樞．零度 (`<cue>_zero`). CC0 recordings from the shared inventory (FFSL rifle near / mid takes,
// a .50 BMG shot, a 40 mm launcher thump, AK / MG foley, anvil-like metal clangs and sheet-metal strikes, fire whooshes
// and a car fire, an acid sizzle, rocket launches, rubble / debris, a plate break, VSCO 2 brass / timpani / bass drum,
// a sung choir) and synthesis.
// Palette: a forge, not a rifle. The shot is a heavy .50-class blast with a deep 「咚」 (the launcher thump and a B♭1
// body) and the ram's steel 「鏘」; the theme is a smith's anvil (additive steel modes as beating doublets) rung on
// B♭; the furnace breathes (flame rumble, 0.6 Hz core breath, a 0.2 Hz swept band); steam and hydraulics move the
// fins, doors and ram; the falcon drones are small turbines with digital eyes (clean sine beeps, FM holo shimmer,
// a synthetic 「kee」); 破限 is a B♭ major brass + choir chord over timpani. Every tuned part sits in B♭ major; cues the
// code plays at a fixed pitch are pre-compensated so they land on it (see PITCH).
//
//   gun      yanshu_close (FFSL / .50 near takes + crack / B♭1 body / sub + the launcher 「咚」 + the ram's steel clank),
//            _tail (street reflections + the anvil ring in the street), _far (mid takes pushed out + the far 咚),
//            _mech (the ram springing home: clack, an air puff, the seat)
//   theme    yanshu_fire (per shot at 0.35: the anvil 「鏘」 on B♭5, the §1.12 6-10 kHz luxury tick, the furnace breath,
//            embers), _hit / _head (the forge round slamming in, a molten tssk; a steel ping on heads), _burst (樞彈
//            burst 0.15 s later: a pop, sparks, the cyan holo ring), _kill (KE_FORGE: 數位「叮」 + holo sweep + sparks)
//   爐環      _ring (噴焰「呼—轟」 + the fire wall racing round), _jets (the door-side slit jets)
//   吸爐震擊  _inhale (0.42 s of suction into the strike), _strike (鍛錘「鏘」 + the shock wave)
//   超載      _beat_click 「喀」/ _beat_hiss 「嘶」/ _beat_clang 「鏘」/ _beat_hum 「嗡」 (the 4 beats, 0.12 s apart),
//            _beam_start / _beam_loop (持續低吼, seamless) / _beam_end, _ram_jet (噴射「轟」) / _ram_slam (the landing),
//            _warn (the last 1.5 s), _cool (fins fall one by one, steam, cooling ticks)
//   破限      §1.12 three layers: _ult_chord (rise 0.4 s: brass + choir bending up 4 st over a timpani roll -> 40-60 Hz
//            impact + anvil -> the B♭ major brass / choir bed with the furnace under it), _seal_snap (封條斷裂聲),
//            _ult_dock (合體的機械聲) + _ult_giant (the triple beam's 轟鳴), _ult_end (release: the beam cut, the deflating
//            breath, the chord resolving low; yanshu_cool plays the mechanics with it), _mini (分機)
//   view     yanshu_idle (loop: §1.12 hum B♭1 / B♭2, a 400-1200 Hz band swept at 0.2 Hz, the 0.6 Hz core breath, embers),
//            _draw_first, _hydraulic, _fin_click, _vent, _drone_in, _roar, _beep, _scan, _ready_beep (數位雙音), _door,
//            _cell, _inspect (§1.12 phrase: an anvil motif over the forge hall), _highfive, _drone_shot, _drone_idle /
//            _drone_beam (loops, not played yet)
//   reload   _reload_out, _reload_vent, _reload_in, _forge (the rare reload's forging strike)
//   other    ready_yanshu (unique: furnace 「轟」, an anvil ting, the 數位雙音 F6 -> B♭6 and the falcon's 「kee」),
//            _crisis (爐壁護盾: the fins slam into a hex wall, glow, 瓷器碎裂 + a fire tail), _final (KE_FINAL forge strike)
//   twin     <cue>_zero for 焰樞．零度 (ready, fire, ult chord / giant / end): -4 st, colder, an echo, a frost glitter
//            (§1.12 雙生版). Not played yet (the twin is reserved).
//
// Mastering: every file within 1 LU of its target at <= -1 dBTP (decoded). Each set is soft-clipped towards the
// peak-to-loudness ratio its target needs (<= 6 dB drive); a ringing cue is mastered lower and lifted by the manifest
// vol. `mmax` levels a cue by its loudest 400 ms as the file plays at its manifest vol, chosen so that after the
// handler's own volume (noted at each cue) it lands where it should against the -12 LUFS shot: theme ~10 dB under,
// hits / drone shots / foley 12-20 dB under, skills near it, 破限 and the ram's landing at or above it. References
// (logged + previewed): five shots, the overload sequence, the 破限.
//
//   node --max-old-space-size=2048 tools/audio/build.mjs --only premium_yanshu
//   dev subset (never into the game folder: a subset run removes the other files of the category):
//   CF_AUDIO_OUT=tools/audio/out/ys-dev YS_ONLY=gun,theme node --max-old-space-size=2048 tools/audio/run-producer.mjs \
//     tools/audio/producers/premium_yanshu.mjs --spectrograms all
import { makeKit } from './weapons.mjs';

const SR = 48000;
let L, ctx, K;
const midi = (m) => 440 * 2 ** ((m - 69) / 12);
const N = {};
for (const [n, m] of Object.entries({ Bb0: 22, F1: 29, Bb1: 34, C2: 36, D2: 38, F2: 41, G2: 43, Bb2: 46, C3: 48, D3: 50, F3: 53, G3: 55, Bb3: 58, C4: 60, D4: 62,
  Eb4: 63, F4: 65, G4: 67, A4: 69, Bb4: 70, C5: 72, D5: 74, Eb5: 75, F5: 77, G5: 79, A5: 81, Bb5: 82, C6: 84, D6: 86, Eb6: 87, E6: 88, F6: 89, G6: 91,
  A6: 93, Bb6: 94, C7: 96, D7: 98, F7: 101, Bb7: 106 })) N[n] = midi(m);
// the playback rates yanshu.js applies to some cues: the file is the design taken through 1 / rate
const PITCH = {
  beep: [1.6, 2.1],            // rare idle gauge: two beeps -> F6 then ~B♭6 (the file sits on F6 / 1.6)
  warn: 1.4,                   // overload's last 1.5 s
  cell: [1.2, 1.35, 1.5, 1.65],// the four charge windows -> B♭5 C6 D6 E6 (file B♭5 / 1.2)
  burst: 1.3,                  // 1.2-1.4
  roar: 0.7, highfive: 1.4,
};

const S = {
  // gun: FFSL near / mid takes and the .50 BMG shot (weapons.mjs sniper50 set), the 40 mm launcher's 「咚」
  cal50: 'fs:668071', tikka: 'ffsl/Tikka/W_29P', m1917: 'ffsl/1917/B_24P', mosin: 'ffsl/Mosin Nagant/M_21P',
  tikkaMid: 'ffsl/Tikka/W_24P', m1917Mid: 'ffsl/1917/B_16P', mosinMid: 'ffsl/Mosin Nagant/M_26P', launcher: 'fs:163458',
  // mechanics / foley
  akCock: 'fs:675008', mgReload: 'fs:363168', bmgRound: 'fs:855580', arHardware: 'fs:393732', helmet: 'fs:675817', gear: 'fs:517150',
  creak: 'fs:119468', groan: 'fs:481787', cloth: 'fs:494797', clothHeavy: 'fs:163164', swing: 'fs:268227', swoosh: 'fs:507466',
  // steel
  clangDeep: 'fs:201094', smith: 'fs:54850', sheet: 'fs:532874', metalHit: 'fs:406562', ping: 'fs:351371', thud: 'fs:640204', metalBang: 'fs:244394',
  metalL: (i) => `kenney_impact/Audio/impactMetal_light_00${i}`, metalM: (i) => `kenney_impact/Audio/impactMetal_medium_00${i}`,
  metalH: (i) => `kenney_impact/Audio/impactMetal_heavy_00${i}`, plateH: (i) => `kenney_impact/Audio/impactPlate_heavy_00${i}`,
  plateL: (i) => `kenney_impact/Audio/impactPlate_light_00${i}`, punch: (i) => `kenney_impact/Audio/impactPunch_heavy_00${i}`,
  // fire, heat, jets
  fireWhoosh: 'fs:260554', fireWhoosh2: 'fs:260555', combust: 'fs:412558', carFire: 'fs:563765', stove: 'fs:532191', sizzle: 'fs:382313',
  rocket: 'fs:521377', missile: 'fs:200459', launch: 'fs:182794',
  // blasts, breakage
  deepBoom: 'fs:258195', grenade: 'fs:609587', expl1: 'fs:523089', debris: 'fs:703247', rubble: 'fs:569510', concrete: 'fs:522099',
  plate: 'fs:565642', glassHit: 'fs:418194',
  // orchestra (VSCO 2) + choir: B♭ major
  tubaBb1: 'fs:374258', tubaF1: 'fs:374255', tbnBb2: 'fs:374014', tbnD3: 'fs:374020', tbnF2: 'fs:374021', tbnF3: 'fs:374022',
  hornD5: 'fs:373248', hornF5: 'fs:373250', hornBb2: 'fs:373252', choirA: 'fs:764329', choirO: 'fs:764339',
  timpBb: 'fs:373919', rollBb: 'fs:373944', bdFff: 'fs:375260', bdFff2: 'fs:375261',
};

// ------------------------------------------------------------------------------------------------ small helpers
const at = (buf, t = 0, gain = 0, pan) => (pan === undefined ? { buf, at: t, gain } : { buf, at: t, gain, pan });
const nrm = (b, db = -1) => L.normalizePeak(b, db);
const mono = (b) => (b.channels === 1 ? b : L.toMono(b));
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const cut = (b, len, fade = 0.3) => L.fadeOut(L.slice(b, 0, Math.min(len, b.duration)), Math.min(len, b.duration) * fade, 'exp');
const rmsOf = (b) => K.rmsOf(b);
const cents = (f, c) => f * 2 ** (c / 1200);
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
/** Slow random flicker in [-1, 1] (low-passed noise), seeded: flame / steam turbulence. */
function turb(dur, seed, hz = 18) {
  const x = L.eq(L.noise(dur + 0.25, { color: 'white', seed }), [{ type: 'lp', f: hz, order: 2 }]).data[0];
  let m = 1e-9; for (const v of x) m = Math.max(m, Math.abs(v));
  return (t) => x[clamp(Math.round(t * SR), 0, x.length - 1)] / m;
}
/** Equal-power pan that moves: p(t) in [-1, 1]. */
function panMove(b, p) {
  const m = mono(b).data[0], n = m.length, l = new Float32Array(n), r = new Float32Array(n);
  for (let i = 0; i < n; i++) { const a = (clamp(p(i / SR), -1, 1) + 1) * Math.PI / 4; l[i] = m[i] * Math.cos(a) * Math.SQRT2; r[i] = m[i] * Math.sin(a) * Math.SQRT2; }
  return new L.Buf([l, r], SR);
}
const env = (b, f) => L.automate(b, f);
/** A synthesized layer that is still sounding when its buffer ends must not stop dead: an exponential tail fade. */
const endFade = (b, sec = 0.02) => L.fadeOut(b, Math.min(sec, b.duration * 0.4), 'exp');
const lvl = (b, ref, dB, win = 0.05) => ({ buf: b, gainLin: rmsOf(L.slice(ref, 0, win)) / Math.max(1e-9, rmsOf(L.slice(b, 0, win))) * L.db2lin(dB) });

// ------------------------------------------------------------------------------------------------ steel
// mode sets [ratio, amp, t60 scale, doublet beat Hz]
// a smith's anvil (the horn and the face): a bright strike tone, a dense run of upper modes that ring nearly as long
// (the 「鏘」), a weak sub-octave body
const ANVIL = [[0.5, 0.2, 1.3, 0.4], [1, 1, 1, 0.8], [1.34, 0.42, 0.8, 1.1], [1.89, 0.66, 0.78, 1.5], [2.47, 0.5, 0.62, 2], [3.12, 0.36, 0.52, 2.6],
  [3.86, 0.3, 0.44, 3.1], [4.73, 0.2, 0.34, 3.7], [5.81, 0.14, 0.27, 4.3], [7.02, 0.09, 0.21, 5], [8.6, 0.06, 0.16, 6]];
// a ceramic armour plate / a fin on its hinge: short, glassy
const PLATE = [[1, 1, 1, 1.2], [1.59, 0.6, 0.6, 1.6], [2.14, 0.5, 0.5, 2.1], [2.65, 0.35, 0.4, 2.6], [3.42, 0.25, 0.3, 3.2], [4.15, 0.15, 0.22, 4]];
// a tensioned steel strap / tine (the seal): one dominant mode with an octave-ish partner
const TINE = [[1, 1, 1, 0.6], [2.02, 0.35, 0.6, 1.2], [2.9, 0.2, 0.4, 1.8], [5.4, 0.08, 0.2, 3]];
/**
 * Additive modal resonator: every mode a slowly beating doublet, its own decay (high modes die first), `bright` dB /
 * octave of tilt, `attack` s of onset. Recursive phasors (fast).
 */
function modal(f, dur, { list = ANVIL, t60 = 1, seed = 'm', beat = 1, bright = 0, attack = 0.0005, maxF = 16000 } = {}) {
  const n = Math.round(dur * SR), o = new Float64Array(n), r = L.rng(L.hashSeed(seed));
  for (const [ratio, a0, tk, bHz] of list) {
    const fr = f * ratio;
    if (fr > maxF) continue;
    const amp = a0 * 10 ** ((bright * Math.log2(ratio)) / 20) * (0.9 + 0.2 * r.next());
    for (const [df, ga, td] of [[0, 1, 1], [bHz * beat * (0.8 + 0.4 * r.next()), 0.6, 0.88]]) {
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
/** The anvil struck: its modes + the hammer's tick + a short splash of inharmonic steel. */
function anvil(f, dur, { t60 = 0.8, seed = 'an', tick = -14, splash = -10, bright = 0, list = ANVIL } = {}) {
  return nrm(L.mix([at(nrm(modal(f, dur, { list, t60, seed, bright }))),
    at(nrm(L.noiseBurst({ dur: 0.012, attack: 0.0002, decay: 0.003, hp: Math.min(9000, f * 2), lp: 15000, seed: seed + 't' })), 0, tick),
    at(nrm(clang(f, { seed: seed + 'c', dur: Math.min(dur, 0.5) })), 0, splash)]));
}
/** The strike's metallic splash: a dense cloud of high inharmonic modes that dies within ~0.2 s. */
function clang(f, { n = 18, lo = 2.6, hi = 15, t60 = 0.16, seed = 'clang', dur = 0.6 } = {}) {
  const r = L.rng(L.hashSeed(seed)), list = [];
  for (let i = 0; i < n; i++) { const ratio = lo * (hi / lo) ** r.next(); if (f * ratio < 15000) list.push([ratio, (0.4 + 0.6 * r.next()) * Math.sqrt(lo / ratio), t60 * (0.35 + 0.9 * r.next()) * (lo / ratio) ** 0.25]); }
  return L.partials(dur, { base: f, list, seed });
}
/** A pressure wave: low-passed noise whose cutoff falls as it passes (the 「轟」 of a shock). */
function airwave(dur, { f0 = 1600, f1 = 110, fall = 0.12, attack = 0.004, seed = 'aw', color = 'pink' } = {}) {
  const s = L.sweep(L.noise(dur, { color, seed }), 'lp', (t) => f1 + (f0 - f1) * Math.exp(-t / fall), { q: 0.8 });
  return nrm(env(s, (t) => Math.min(1, t / attack) * Math.exp(-t * 6.9 / dur)));
}
/** Low impact: a pitched-down thump with harmonics laptop speakers can carry. */
const boom = (seed, { f0 = 72, f1 = 40, sweep = 0.07, decay = 0.55, drive = 2.5, amount = -4 } = {}) => nrm(L.psychoBass(L.thump({ f0, f1, sweep, decay, click: 0.05, drive, seed }), { freq: 110, amount }));
/** A steel latch / hinge click: the tick, a short steel ping, a low knock. */
function latch(seed, { f = 2600, ping = 3400, low = 240, pingDb = -9, lowDb = -7, dur = 0.12 } = {}) {
  return nrm(L.mix([
    at(nrm(L.noiseBurst({ dur: 0.03, attack: 0.0002, decay: 0.006, bp: f, q: 1.2, seed: seed + 'n' }))),
    at(nrm(L.partials(dur, { base: ping, list: [[1, 1, 0.05], [1.47, 0.6, 0.035], [2.21, 0.35, 0.025], [2.93, 0.2, 0.02]], seed: seed + 'p' })), 0.0005, pingDb),
    at(nrm(L.thump({ f0: low * 1.6, f1: low, sweep: 0.004, decay: 0.04, click: 0, drive: 1, seed: seed + 't' })), 0, lowDb),
  ], { length: dur }));
}

// ------------------------------------------------------------------------------------------------ air, fire, machines
/** A turbulent jet of steam / gas: white noise through a broad peak, flickering, attack / hold / exponential release. */
function steam(dur, { seed = 'st', f = 4200, hp = 1400, attack = 0.012, hold = 0.15, rel = 0.35, turbK = 0.4, gain = 5, q = 0.6, lp = 12000 } = {}) {
  const b = L.eq(L.noise(dur, { color: 'white', seed }), [{ type: 'hp', f: hp, order: 2 }, { type: 'peak', f, gain, q }, { type: 'lp', f: lp, order: 2 }]);
  const tr = turb(dur, seed + 't', 22);
  return nrm(env(b, (t) => (t < attack ? t / attack : t < attack + hold ? 1 : Math.exp(-(t - attack - hold) * 6.9 / rel)) * Math.max(0, 1 + turbK * tr(t))));
}
/** Synthetic flame body: a brown-noise rumble, a breathy band, crackle, flickering under env(t). */
function flame(dur, { seed = 'fl', lp = 1100, crack = -16, e = () => 1 } = {}) {
  const rumble = L.eq(L.noise(dur, { color: 'brown', seed }), [{ type: 'hp', f: 45, order: 2 }, { type: 'lp', f: lp, order: 2 }]);
  const breath = L.eq(L.noise(dur, { color: 'pink', seed: seed + 'b' }), [{ type: 'bp', f: 700, q: 0.7 }]);
  const cr = L.crackle(dur, { density: 30, decay: 0.003, hp: 1600, minAmp: 0.15, seed: seed + 'c' });
  const tr = turb(dur, seed + 't', 12);
  return endFade(nrm(env(L.mix([at(nrm(rumble)), at(nrm(breath), 0, -7), at(nrm(cr), 0, crack)]), (t) => e(t) * (0.75 + 0.25 * tr(t)))));
}
/** Servo / pump / turbine whine: a saw + octave at f(t) through a band that follows it, with gear grit. */
function whine(dur, f, { seed = 'wh', band = 2, q = 2.2, h2 = -6, grit = -24 } = {}) {
  const F = L.toFn(f);
  const saw = L.mix([at(L.tone(dur, { type: 'saw', freq: F })), at(L.tone(dur, { type: 'sine', freq: (t) => F(t) * 2 }), 0, h2)]);
  const b = L.sweep(saw, 'bp', (t) => Math.min(15000, F(t) * band), { q });
  return endFade(nrm(L.mix([at(nrm(b)), at(nrm(L.crackle(dur, { density: 60, decay: 0.0015, hp: 3000, seed: seed + "g" })), 0, grit)])));
}
/** Digital beep (the holo / the drones' eyes): a sine with a little 2nd / 3rd, clean edges. */
function beep(f, dur, { h2 = -18, h3 = -16, attack = 0.002, release = 0.015 } = {}) {
  const b = L.mix([at(L.tone(dur, { freq: f })), at(L.tone(dur, { freq: 2 * f }), 0, h2), at(L.tone(dur, { freq: 3 * f }), 0, h3)]);
  return nrm(env(b, (t) => smooth(t / attack) * (t > dur - release ? Math.max(0, (dur - t) / release) : 1)));
}
/** The cyan holo ring: a rising FM shimmer with a fast flutter and a thin swept air. */
function holo(dur, f0, f1, { seed = 'ho', flutter = 30, index = 1.6 } = {}) {
  const fmb = L.fm(dur, { carrier: [[0, f0], [dur, f1]], ratio: 1.5, index, indexDecay: dur });
  const fl = env(fmb, (t) => Math.min(1, t / 0.01) * Math.exp(-t * 4 / dur) * (0.6 + 0.4 * Math.sin(2 * Math.PI * flutter * t)));
  const air = env(L.sweep(L.noise(dur, { color: 'white', seed }), 'bp', (t) => Math.min(14000, f0 * 2 * (f1 / f0) ** (t / dur)), { q: 4 }), (t) => Math.min(1, t / 0.01) * Math.exp(-t * 5 / dur));
  return nrm(L.mix([at(nrm(fl)), at(nrm(air), 0, -10)]));
}
/** A spray of sparks: dense crackle + scattered tiny steel pings, dying. */
function sparks(dur, { seed = 'sp', density = 90, pings = 8, lo = 3200, hi = 8500, fall = 5 } = {}) {
  const r = L.rng(L.hashSeed(seed));
  const parts = [at(nrm(env(L.crackle(dur, { density, decay: 0.0018, hp: 2500, minAmp: 0.2, seed }), (t) => Math.exp(-t * fall / dur))))];
  for (let i = 0; i < pings; i++) {
    const t = r.next() ** 1.6 * dur * 0.8, f = lo * (hi / lo) ** r.next();
    parts.push(at(nrm(L.partials(0.08, { base: f, list: [[1, 1, 0.03], [1.43, 0.4, 0.02]], seed: seed + i })), t, -8 - r.next() * 10 - (t / dur) * 8));
  }
  return nrm(L.mix(parts, { length: dur }));
}
/** The falcon drone's cry 「kee」: a saw through two moving formants, rising then falling. */
function kee(seed, { f = 2900, dur = 0.22 } = {}) {
  const fc = (t) => f * (t < 0.03 ? 0.8 + 0.2 * (t / 0.03) : 1 - 0.28 * ((t - 0.03) / (dur - 0.03))) * (1 + 0.012 * Math.sin(2 * Math.PI * 38 * t));
  const s = L.mix([at(L.tone(dur, { type: 'saw', freq: fc })), at(L.tone(dur, { freq: (t) => fc(t) * 0.5 }), 0, -10)]);
  const v = L.mix([at(L.sweep(s, 'bp', (t) => fc(t) * 1.02, { q: 6 })), at(L.sweep(s, 'bp', (t) => Math.min(15000, fc(t) * 2), { q: 8 }), 0, -8)]);
  return nrm(env(v, (t) => smooth(t / 0.015) * Math.exp(-Math.max(0, t - 0.04) * 9)));
}
/** Power hum: a saw stack at f(t) through tube drive and a low-pass that follows lp(t). */
function powerHum(dur, f, { lp = 1200, drive = 4, harm = [[1, 0], [2, -5], [1.5, -10]] } = {}) {
  const F = L.toFn(f);
  const s = L.mix(harm.map(([k, g], i) => at(L.tone(dur, { type: i ? 'sine' : 'saw', freq: (t) => F(t) * k }), 0, g)));
  return endFade(nrm(L.sweep(L.saturate(s, { drive, type: 'tube' }), 'lp', L.toFn(lp), { q: 0.9 })));
}
/** Metal-on-metal slide (a rail, a cell in its well). */
function scrape(dur, f0, f1, seed) { return nrm(K.scrape(dur, f0, f1, seed)); }

// ------------------------------------------------------------------------------------------------ spaces
const STREET = {
  length: 3.0, predelay: 0.02,
  echoes: { count: 20, t: [0.03, 0.95], gain: [0.18, 0.55], lp: [6000, 1500], spread: [0.003, 0.045], pan: 1 },
  tail: { rt60: 2.1, rtLow: 2.5, rtHigh: 0.6, gain: 0.5, start: 0.06, build: 0.16, lp: 3000, hp: 55 },
};
// the forge hall (inspect, ready, the 破限 bed): a big steel shed, early flutter off the walls, a warm tail
const FORGE = {
  length: 2.6, predelay: 0.012,
  echoes: { count: 18, t: [0.01, 0.22], gain: [0.18, 0.48], lp: [8000, 3000], spread: [0.001, 0.012], pan: 1 },
  flutter: { period: 0.041, count: 8, decay: 0.68, lp: 4500 },
  tail: { rt60: 1.7, rtLow: 2.1, rtHigh: 0.8, gain: 0.6, start: 0.025, build: 0.06, lp: 6000, hp: 70 },
};
/** Dry + a space whose send is high-passed (`hp`): booms stay tight, the room carries the steel. ch 1 or 2. */
function space(b, envr, { wet = 0.4, seed = 'sp', ch = 2, length, hp = 140, dry = 1 } = {}) {
  const x = ch === 1 ? mono(b) : L.setChannels(b, 2);
  const w = L.convolve(L.eq(x, [{ type: 'hp', f: hp, order: 2 }]), L.makeIR(envr, { seed, channels: ch, length }), { wetOnly: true });
  return L.mix([{ buf: x, gainLin: dry }, { buf: w, gainLin: wet }], { channels: ch });
}

// ------------------------------------------------------------------------------------------------ mastering
const META = {};
const plrOf = (b) => L.truePeakDb(b) - L.lufs(b);
/** Soft-clip towards PLR `tgt` (<= `drive` dB); a variant the clipper cannot bring there gets a gentle compressor first. */
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
/**
 * Master + add: each variant soft-clipped towards the PLR the target needs (<= `drive` dB); a cue whose natural crest
 * still needs more is mastered lower and lifted with the manifest vol (<= 1.5). `mmax`: the loudest 400 ms as the file
 * plays at its manifest vol (long ringing cues are levelled by that, not by an average over the ring). Short one-shots
 * get the Vorbis loudness loss pre-compensated; longer ones the codec-aware pre-master (weapons.mjs codecSafe).
 */
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
    let mm = '';
    if (o.mmax != null) {
      const m = out.reduce((a, b) => a + L.loudness(b).momentaryMax - L.lufs(b), 0) / out.length + lufs;
      volDb = o.mmax - m;
      mm = `, momentary max ${m.toFixed(1)} -> ${o.mmax}`;
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
// 2D (local only): stereo. A mono buffer played without a panner is up-mixed to both speakers (+3 dB over its
// one-channel loudness); the equal-power panner of a positional sound keeps a centred mono source at that loudness
const D2 = (o = {}) => ({ spatial: false, channels: 2, ...o });

/** Loop QA: the wrap step against the typical sample step; a 0.2 s window straddling the seam vs the same phase elsewhere. */
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
/** A texture made loopable: render P + X, crossfade X (noise / recordings only; tones go on the 1/P grid instead). */
const loopTex = (b, P, X) => L.loopCrossfade(L.slice(b, 0, P + X), X);
/** Filters on a periodic buffer, in steady state: run fn over two periods and keep the second (a filter starting from
 *  rest at sample 0 breaks the seam: the beam loop's swept low-pass wrapped with a 46x step before this). */
const periodic = (b, fn) => { const P = b.duration; return L.slice(fn(L.concat([b, b])), P, 2 * P); };
const grid = (f, P) => Math.round(f * P) / P;

// ------------------------------------------------------------------------------------------------ the gun
// 樞彈 300 rpm (one round every 0.2 s): a .50-class blast, its body tuned to B♭1, the 40 mm launcher's hollow 「咚」 under
// it and the ram's steel clank 4 ms in (the 8 mm recoil of the hammer block). [source, onset s, { semis, ch }]
const GUN = {
  near: [[S.cal50, 0.010, { ch: 0, semis: -1.5 }], [S.tikka, 0.577, { semis: -3.5, ch: 0 }], [S.m1917, 1.308, { semis: -3.5, ch: 1 }],
    [S.cal50, 0.010, { ch: 1, semis: -2.2 }], [S.tikka, 5.665, { semis: -3.5, ch: 1 }], [S.mosin, 1.034, { semis: -3, ch: 0 }]],
  mid: [[S.tikkaMid, 0.755, -3], [S.m1917Mid, 0.607, -3], [S.mosinMid, 1.138, -2.5]],
  close: { direct: 0.16, len: 0.46, hp: 34, crack: -6.5, plr: 11.2,
    eq: [{ type: 'peak', f: 95, gain: 3, q: 0.8 }, { type: 'peak', f: 260, gain: 1.5, q: 1 }, { type: 'peak', f: 2200, gain: 1.5, q: 1 }],
    bal: { sub: -7, low: -4, lowMid: -5.5, mid: -6, high: -10.5, air: -14 } },
};
/** The close layer (weapons.mjs designClose + the forge's layers): recorded blast (transient clipped first) + crack +
 *  B♭1 body + sub + the launcher's 「咚」 + the ram's clank; parallel compression, psycho-bass, exciter, width, early
 *  room, envelope, tone, band balance, PLR clipper. */
function forgeClose(shot, k, doom, clank, { ch } = {}) {
  const C = GUN.close, r = ctx.rng(`yanshu_close_${k}`), seed = `ysc${k}`;
  let d = K.chan(shot, ch ?? k % 2);
  d = L.slice(d, 0, C.direct + 0.03);
  d = L.eq(d, [{ type: 'hp', f: C.hp, order: 4 }, ...C.eq]);
  d = env(d, (t) => (t < C.direct * 0.45 ? 1 : Math.exp(-(((t - C.direct * 0.45) / (C.direct * 0.32)) ** 1.5))));
  d = L.softClip(L.gain(L.normalizePeak(d, 0), 6), { threshold: -10, ceiling: -1 });
  const lay = (buf, dB, win, t = 0) => ({ ...lvl(buf, d, dB, win), at: t });
  const f = 1 + r.range(-0.03, 0.03);
  const body = L.eq(L.thump({ f0: 165 * f, f1: N.Bb1 * f, sweep: 0.022, decay: 0.2, click: 0, drive: 2.6, seed: seed + 'b' }), [{ type: 'hp', f: 45, order: 2 }]);
  const sub = L.thump({ f0: 74, f1: 36, sweep: 0.035, decay: 0.3, click: 0, drive: 1.2, seed: seed + 's' });
  const layers = [{ buf: d }, lay(K.crack(seed + 'c', {}), C.crack + r.range(-1, 1), 0.006), lay(body, -3.5 + r.range(-0.8, 0.8), 0.05),
    lay(sub, -6.5 + r.range(-1, 1), 0.08), lay(doom, -5 + r.range(-1, 1), 0.08, 0.002), lay(clank, -10 + r.range(-1, 1), 0.03, 0.004)];
  let m = L.normalizePeak(L.mix(layers), 0);
  const pre = 0.004;
  const crushed = L.slice(L.compress(L.pad(m, pre, 0), { threshold: -26, ratio: 6, attack: 0.0008, release: 0.015, knee: 6, makeup: 15, lookahead: 0.002 }), pre);
  m = L.mix([{ buf: m, gainLin: 1 - 0.55 * 0.5 }, { buf: crushed, gainLin: 0.55 }]);
  m = L.psychoBass(m, { freq: 120, amount: -8 });
  m = L.exciter(m, { freq: 2500, drive: 10, amount: -13 });
  m = L.stereoize(m, { width: 0.32, hp: 350, seed: seed + 'st' });
  m = L.reverb(m, 'smallRoom', { wet: 0.2, seed: seed + 'rm', length: 0.45 });
  m = L.slice(m, 0, C.len);
  m = env(m, (t) => (t < C.len * 0.3 ? 1 : Math.pow(1 - (t - C.len * 0.3) / (C.len * 0.7), 2.2)));
  m = L.eq(m, [{ type: 'peak', f: 1700, gain: 2.5, q: 0.55 }, { type: 'hp', f: 32, order: 4 }]);
  m = K.balance(m, C.bal, 0.75);
  return L.pad(K.clipToPLR(m, C.plr, { min: 3, max: 22, threshold: -16 }), 0.003, 0);
}

async function gunSet(cat, keep) {
  ctx.log('-- gun');
  // the launcher's hollow tube thump taken down a fourth (the 「咚」); the ram's clank: sheet steel struck, darkened
  const doom0 = strike(await src(S.launcher, 0, 0.44, { hp: 35, semis: -5 }));
  const doom = L.eq(doom0, [{ type: 'peak', f: 110, gain: 4, q: 0.9 }, { type: 'lp', f: 3500, order: 2 }]);
  const clanks = [strike(await src(S.sheet, 0, 0.6, { hp: 150, semis: -3 })), strike(await src(S.metalH(1), 0, 0.5, { hp: 150, semis: -4 })), strike(await src(S.metalH(3), 0, 0.5, { hp: 150, semis: -3.5 }))];
  const closes = [], log = [];
  for (let k = 0; k < GUN.near.length; k++) {
    const [id, t, o] = GUN.near[k];
    const shot = await K.loadShot(id, t, 0.75, { semis: o.semis });
    let best = null;
    for (let a = 0; a < 4; a++) {
      K.codecLog.length = 0;
      const m = await K.codecSafe(forgeClose(shot, k + a * 101, doom, clanks[k % 3], { ch: o.ch }), -12);
      const info = K.codecLog[0], score = info.limitedDb + Math.max(0, info.decTp + 1.3) * 3 + (Math.abs(info.lufs + 12) > 0.25 ? 50 : 0);
      if (!best || score < best.score) best = { m, info, score, a };
      if (score <= 2) break;
    }
    log.push(`lim ${best.info.limitedDb} dTP ${best.info.decTp} (take ${best.a + 1})`);
    closes.push(best.m);
  }
  ctx.log(`  pre-master yanshu_close: ${log.join(' | ')}`);
  keep.close = closes;
  const srcs = [...new Set([...GUN.near.map((n) => n[0]), ...GUN.mid.map((n) => n[0]), S.launcher, S.sheet, S.metalH(1), S.metalH(3)])];
  await cat.add('yanshu_close', closes, { lufs: -12, quality: 0.6, maxLimitDb: 6, limiter: { release: 0.02 }, spatial: true, range: [12, 60], channels: 2, voices: 4, pitch: [0.97, 1.03], priority: 3, sources: srcs,
    note: '.50-class blast + B♭1 body + launcher 咚 + ram clank (300 rpm)' });
  USED = new Set();
  META.yanshu_close = { lufs: -12, vol: 1, ch: 2 };

  // tail: the street's reflections (rifle takes; the .50 recording carries a bolt clank later) + the anvil ring in it
  const G = { name: 'yanshu', close: { direct: GUN.close.direct }, tail: { len: 2.7, rec: 0, env: STREET }, far: { dist: 240, len: 2.7 } };
  const tails = [], singles = GUN.near.filter((n) => n[0] !== S.cal50);
  for (let k = 0; k < 3; k++) {
    const [id, t0, o] = singles[k];
    const shot = await K.loadShot(id, t0, G.close.direct + G.tail.len + 0.1, { semis: o.semis });
    const t = K.designTail(G, shot, k);
    const ring = L.convolve(modal(N.Bb5 * (1 + k * 0.002), 1.6, { list: ANVIL, t60: 0.9, seed: `tr${k}`, bright: -2 }), L.makeIR('urban', { seed: `tri${k}`, channels: 2 }), { wetOnly: true });
    tails.push(K.trimEnd(L.mix([at(t), { buf: ring, gainLin: rmsOf(t) / Math.max(1e-9, rmsOf(ring)) * L.db2lin(-18), at: 0.02 }], { length: t.duration, channels: 2 })));
  }
  keep.tail = tails;
  await put(cat, 'yanshu_tail', tails, D2({ lufs: -20, voices: 3, pitch: [0.98, 1.02], maxHeadMs: 250, sources: [...new Set(singles.slice(0, 3).map((n) => n[0]))] }));

  // far: the mid takes pushed further + the 咚 carrying (low end travels)
  const fars = [];
  for (let k = 0; k < 3; k++) {
    const [id, t0, s] = GUN.mid[k];
    const shot = await K.loadShot(id, t0, Math.max(0.7, G.far.len + 0.1), { semis: s });
    const f = K.designFar(G, shot, k, true);
    const th = L.convolve(L.airAbsorption(L.mix([at(nrm(L.thump({ f0: 120, f1: N.Bb1, sweep: 0.03, decay: 0.35, drive: 2, seed: `fd${k}` }))), at(doom, 0.002, -4)]), 240),
      L.makeIR('field', { seed: `fdi${k}`, channels: 1 }), { wet: 0.7, dry: 0.5 });
    fars.push(L.mix([at(f), { buf: th, gainLin: rmsOf(f) / Math.max(1e-9, rmsOf(th)) * L.db2lin(-9), at: 0.006 }], { length: f.duration }));
  }
  await put(cat, 'yanshu_far', fars, SP([40, 500], { lufs: -22, voices: 4, pitch: [0.96, 1.04], priority: 2, maxHeadMs: 60, sources: srcs }));

  // mech (2D, played at 0.8 with every shot): the ram springing home — a steel clack, an air puff, the seat
  const mech = [];
  for (let k = 0; k < 4; k++) {
    const [a, z] = [[0.15, 0.71], [2.18, 2.77], [4.40, 4.92], [0.15, 0.71]][k];
    const clack = await K.grab(S.akCock, a, z, { mode: 'peak', post: 0.06, semis: -6 - k * 0.4, hp: 150 });
    const puff = L.noiseBurst({ dur: 0.09, attack: 0.004, decay: 0.05, bp: 3200, q: 0.8, seed: `mp${k}` });
    const seat = L.thump({ f0: 260, f1: 140, sweep: 0.006, decay: 0.05, click: 0.2, drive: 1.5, seed: `ms${k}` });
    const m = L.mix([at(clack, 0.004), at(nrm(puff), 0.03, -9), at(nrm(seat), 0.075, -5), at(latch(`ml${k}`, { f: 2200, ping: 2900, low: 200 }), 0.077, -11)]);
    mech.push(L.pad(L.trimSilence(L.eq(m, [{ type: 'hp', f: 120, order: 2 }]), { threshDb: -55, pre: 0.001, post: 0.02, fadeOutSec: 0.01 }), 0.004, 0));
  }
  USED.add(S.akCock);
  keep.mech = mech;
  await put(cat, 'yanshu_mech', mech, { lufs: -22, spatial: false, channels: 1, voices: 3, pitch: [0.95, 1.05], maxHeadMs: 20 });
}

// ------------------------------------------------------------------------------------------------ theme, hits, burst, kill
async function themeSet(cat, keep) {
  ctx.log('-- theme');
  // yanshu_fire (the handler plays it at 0.35 on every shot): the anvil 「鏘」 on B♭5 (±5 cents: a forged block rings
  // its own note), the §1.12 luxury transient (30 ms, 6-10 kHz, -12 dB), the furnace's breath through the open window
  // (a pink band falling 900 -> 260 Hz), a few embers. High-passed: under ~350 Hz the gun owns the mix.
  const fires = [];
  for (let k = 0; k < 5; k++) {
    const r = ctx.rng(`fire${k}`);
    const ring = anvil(cents(N.Bb5, r.range(-5, 5)), 0.9, { t60: 0.38, seed: `fr${k}`, bright: 2, splash: -10, list: ANVIL.slice(1) });
    const lux = L.mix([at(nrm(L.noiseBurst({ dur: 0.03, decay: 0.01, bp: 8000, q: 1.3, seed: `fl${k}` }))),
      at(nrm(L.partials(0.035, { base: 7000 * (1 + r.range(-0.04, 0.04)), list: [[1, 1, 0.02], [1.29, 0.6, 0.015]], seed: `flp${k}` })), 0, -4)]);
    const breath = env(L.sweep(L.noise(0.4, { color: 'pink', seed: `fb${k}` }), 'bp', (t) => 260 + 640 * Math.exp(-t / 0.08), { q: 0.9 }), (t) => Math.min(1, t / 0.006) * Math.exp(-t * 16));
    const emb = sparks(0.5, { seed: `fe${k}`, density: 40, pings: 3, fall: 6 });
    const p = k % 2 ? 0.15 : -0.15;
    let m = L.mix([at(ring, 0.003, 0, p), at(nrm(lux), 0, -12), at(nrm(breath), 0.004, -8), at(emb, 0.03, -22, -p)], { channels: 2, length: 0.9 });
    m = L.eq(m, [{ type: 'hp', f: 350, order: 4 }]);
    m = L.reverb(m, 'smallRoom', { wet: 0.14, seed: `frr${k}`, length: 0.6 });
    fires.push(cut(m, 0.85, 0.5));
  }
  keep.fire = fires;
  await put(cat, 'yanshu_fire', fires, D2({ lufs: -15, mmax: -15, voices: 3, pitch: [0.997, 1.003], note: 'theme layer on every shot (handler 0.35): the anvil 鏘 on B♭5 + luxury tick + furnace breath' }));

  // yanshu_hit (2D, handler 0.3, one per shot that struck a body): the forge round slamming in — a thick punch, a low
  // 「咚」, a molten 「tssk」 as the hot slug sears
  const hits = [];
  for (let k = 0; k < 4; k++) {
    const pu = strike(await src(S.punch(k), 0, 0.5, { hp: 90, semis: -2 }));
    const dum = nrm(L.thump({ f0: 170, f1: 72, sweep: 0.012, decay: 0.12, click: 0.2, drive: 2, seed: `hd${k}` }));
    const tss = steam(0.16, { seed: `hs${k}`, f: 5200, hp: 2500, attack: 0.004, hold: 0.02, rel: 0.09, turbK: 0.6 });
    const m = L.mix([at(pu), at(dum, 0, -4), at(tss, 0.012, -11)], { length: 0.4 });
    hits.push(L.psychoBass(cut(m, 0.4, 0.5), { freq: 110, amount: -10 }));
  }
  keep.hit = hits;
  await put(cat, 'yanshu_hit', hits, D2({ lufs: -16, mmax: -14.5, voices: 2, pitch: [0.96, 1.04] }));

  // yanshu_head: the same + a bright steel ping and a tiny holo tick on F6
  const heads = [];
  for (let k = 0; k < 3; k++) {
    const pg = strike(await src(S.ping, 0.02, 0.418, { hp: 900, semis: k - 1 }));
    const m = L.mix([at(hits[k]), at(pg, 0.002, -4), at(beep(N.F6, 0.05), 0.01, -16)], { length: 0.45 });
    heads.push(cut(m, 0.45, 0.4));
  }
  await put(cat, 'yanshu_head', heads, D2({ lufs: -15, mmax: -12.5, voices: 2, pitch: [0.98, 1.02] }));

  // yanshu_burst (positional at the struck body, handler 0.45 at pitch 1.2-1.4): 樞彈 bursts 0.15 s after the hit —
  // a compact pop with a short body, a spray of orange-white sparks, the cyan holo ring scanning out. Designed as
  // heard, then taken down by the code's mean rate (1.3).
  const bursts = [];
  for (let k = 0; k < 5; k++) {
    const r = ctx.rng(`burst${k}`);
    const ex = strike(await src(S.expl1, 0, 0.6, { hp: 120, semis: 2 + r.range(-1, 1) }));
    const pop = L.mix([at(nrm(L.noiseBurst({ dur: 0.08, attack: 0.0003, decay: 0.035, color: 'pink', hp: 150, lp: 7000, seed: `bp${k}` }))),
      at(nrm(L.thump({ f0: 190, f1: 80, sweep: 0.012, decay: 0.1, click: 0.3, drive: 2.2, seed: `bt${k}` })), 0, -3)]);
    const sp = sparks(0.55, { seed: `bs${k}`, density: 140, pings: 10, fall: 4 });
    const ring = holo(0.32, cents(N.F6, r.range(-20, 20)), N.Bb6 * 1.5, { seed: `bh${k}`, flutter: 36 });
    let m = L.mix([at(nrm(pop)), at(cut(ex, 0.45, 0.6), 0.001, -3), at(sp, 0.01, -7), at(ring, 0.02, -10)], { length: 0.7 });
    m = L.psychoBass(cut(m, 0.7, 0.5), { freq: 120, amount: -8 });
    bursts.push(L.varispeed(m, 1 / PITCH.burst));
  }
  await put(cat, 'yanshu_burst', bursts, SP([6, 60], { lufs: -14, mmax: -12, voices: 4, pitch: [0.98, 1.02] }));

  // yanshu_kill (KE_FORGE, positional at the body, 0.8 / 0.55 in a crowd, pitch 2 on a headshot): 數位「叮」 on F6 with
  // a B♭6 shimmer, the holo ring sweeping round (a fast pan flutter), the body bursting into sparks, a soft pop
  const kills = [];
  for (let k = 0; k < 4; k++) {
    const ding = L.mix([at(nrm(modal(N.F6, 0.9, { list: [[1, 1, 1, 0.5], [2, 0.18, 0.6, 1], [3, 0.08, 0.4, 1.5]], t60: 0.55, seed: `kd${k}` }))),
      at(nrm(modal(N.Bb6, 0.7, { list: [[1, 1, 1, 0.8]], t60: 0.4, seed: `kb${k}` })), 0.035, -8)]);
    const sweep = holo(0.4, N.Bb5, N.F7, { seed: `kh${k}`, flutter: 24, index: 1.2 });
    const sp = sparks(0.7, { seed: `ks${k}`, density: 160, pings: 12, fall: 4 });
    const pop = nrm(L.mix([at(nrm(L.noiseBurst({ dur: 0.07, decay: 0.03, color: 'pink', hp: 200, lp: 6000, seed: `kp${k}` }))), at(nrm(L.thump({ f0: 160, f1: 80, decay: 0.08, click: 0.2, drive: 2, seed: `kt${k}` })), 0, -4)]));
    let m = L.mix([at(pop, 0, -6), at(ding, 0.004), at(sweep, 0.03, -12), at(sp, 0.006, -12)], { length: 1.0 });
    kills.push(cut(m, 1.0, 0.5));
  }
  await put(cat, 'yanshu_kill', kills, SP([5, 60], { lufs: -16, mmax: -12, voices: 4, pitch: [1, 1], priority: 2 }));
}

// ------------------------------------------------------------------------------------------------ view: idle, draw, drones, inspect
async function viewSet(cat, keep) {
  ctx.log('-- view');
  // yanshu_idle (loop, the handler plays it at 0.1 = ~28 dB under the gun, fades in 0.4 s): §1.12 — the furnace's hum
  // on B♭1 / B♭2 (+ F3), a 400-1200 Hz band swept by a 0.2 Hz LFO (the furnace drawing air), the core's 0.6 Hz breath
  // (the card), embers ticking, the drones' faint turbine whine. Periodic in 10 s: every tone and LFO on the 1/P grid;
  // only the noise / the recorded fire go through the loop crossfade.
  {
    const P = 10, X = 1.5, lfo = (t) => 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.2 * t), breath = (t) => 0.82 + 0.18 * Math.sin(2 * Math.PI * 0.6 * t);
    const hum = L.saturate(L.mix([at(L.tone(P, { freq: grid(N.Bb1, P) })), at(L.tone(P, { freq: grid(N.Bb2, P) }), 0, -3), at(L.tone(P, { freq: grid(N.Bb2, P) + 0.3 }), 0, -9),
      at(L.tone(P, { freq: grid(N.F3, P) }), 0, -12), at(L.tone(P, { freq: grid(N.Bb3, P) }), 0, -18)]), { drive: 3, type: 'tube' });
    const band = L.sweep(L.noise(P + X, { color: 'pink', seed: 'idle_n' }), 'bp', (t) => 400 * 3 ** lfo(t % P), { q: 1.5 });
    const fire = L.eq(await src(S.stove, 20, 20 + P + X, { stereo: true, hp: 300 }), [{ type: 'lp', f: 6000, order: 2 }]);
    const turbine = L.mix([at(L.tone(P, { freq: grid(2790, P) })), at(L.tone(P, { freq: grid(2797, P) })), at(L.tone(P, { freq: grid(4180, P) }), 0, -8)]);
    const v = L.mix([at(periodic(nrm(env(hum, breath)), (b) => L.stereoize(b, { width: 0.15, hp: 200, seed: 'idle_hs' })), 0, -3),
      at(loopTex(L.stereoize(nrm(band), { width: 0.35, hp: 250, seed: 'idle_st' }), P, X), 0, -9),
      at(loopTex(fire, P, X), 0, -21), at(L.toStereo(nrm(turbine)), 0, -40)], { length: P, channels: 2 });
    seamCheck('yanshu_idle', v, 5);
    await put(cat, 'yanshu_idle', v, D2({ lufs: -19, loop: true, voices: 1, pitch: [1, 1] }));
  }
  // yanshu_drone_idle (loop, reserved: no caller yet): one falcon drone hovering — a small turbine (two detuned tones
  // + a blade buzz at 210 Hz), air hiss
  {
    const P = 4, X = 1;
    const tur = L.mix([at(L.tone(P, { freq: grid(2330, P) })), at(L.tone(P, { freq: grid(2336.5, P) }), 0, -2), at(L.tone(P, { freq: grid(3500, P) }), 0, -10),
      at(periodic(L.tone(P, { type: 'saw', freq: grid(210, P) }), (b) => L.eq(b, [{ type: 'bp', f: 1200, q: 1 }])), 0, -8)]);
    const air = L.eq(L.noise(P + X, { color: 'white', seed: 'di_air' }), [{ type: 'bp', f: 5000, q: 0.6 }]);
    const v = L.mix([at(L.toStereo(nrm(tur))), at(loopTex(L.stereoize(nrm(air), { width: 0.4, hp: 1000, seed: 'di_st' }), P, X), 0, -14)], { length: P, channels: 2 });
    seamCheck('yanshu_drone_idle', v, 1);
    await put(cat, 'yanshu_drone_idle', v, D2({ lufs: -26, loop: true, voices: 1, pitch: [1, 1], note: 'reserved (no caller yet)' }));
  }

  // yanshu_draw_first (0.02 s into the 1.7 s first draw, 0.8, over the stock drawHeavy; the clip plays the hydraulics,
  // the fin clicks, the drones and the roar on top): the cannon swung up — a heavy cloth + a slow metal swing, the gun
  // landing in the hands (a steel thunk), and the system waking: a relay, a whine climbing, a 2-note boot chirp
  {
    const D = 1.0;
    const cloth = await src(S.clothHeavy, 0, 0.6, { hp: 100 });
    const sw = cut(await src(S.swing, 0, 1.1, { hp: 120, semis: -6 }), 0.5, 0.5);
    const land = nrm(L.mix([at(strike(await src(S.metalM(2), 0, 0.4, { hp: 120, semis: -6 }))), at(nrm(L.thump({ f0: 180, f1: 85, decay: 0.09, click: 0.2, drive: 2, seed: 'dft' })), 0, -3)]));
    const relay = latch('dfr', { f: 3000, ping: 4200, low: 300 });
    const wake = env(whine(0.6, [[0, 140], [0.45, 520], [0.6, 540]], { seed: 'dfw', band: 2.2 }), (t) => smooth(t / 0.3) * (t > 0.45 ? Math.exp(-(t - 0.45) * 14) : 1));
    const chirp = L.mix([at(beep(N.Bb5, 0.06)), at(beep(N.F6, 0.09), 0.07)]);
    let m = L.mix([at(cloth, 0, -8), at(L.stereoize(sw, { width: 0.35, seed: 'dfs' }), 0.02, -6), at(land, 0.36, -4), at(relay, 0.3, -10, 0.2), at(wake, 0.3, -12), at(chirp, 0.62, -18, 0.25)], { channels: 2, length: D });
    m = cut(space(m, FORGE, { wet: 0.12, seed: 'dfh', length: 1.2 }), D, 0.4);
    await put(cat, 'yanshu_draw_first', m, D2({ lufs: -18, mmax: -16, voices: 1, pitch: [1, 1] }));
  }

  // yanshu_hydraulic (first draw 0.05 s at 0.7; inspect 3.8 s at 0.6): a valve 「tsk」, the pump whining up, fluid
  // hissing through the lines, the actuator bottoming out (a clunk)
  {
    const hyd = [];
    for (let k = 0; k < 2; k++) {
      const D = 0.6, s = 1 + k * 0.06;
      const valve = latch(`hv${k}`, { f: 3800, ping: 5200, low: 400, pingDb: -14 });
      const pump = env(whine(0.42, [[0, 190 * s], [0.3, 320 * s], [0.42, 300 * s]], { seed: `hp${k}`, band: 3, q: 1.6 }), (t) => smooth(t / 0.05) * (t > 0.34 ? Math.exp(-(t - 0.34) * 20) : 1));
      const fluid = steam(0.45, { seed: `hf${k}`, f: 2400, hp: 900, attack: 0.03, hold: 0.25, rel: 0.12, turbK: 0.7, gain: 7, q: 1.2 });
      const clunk = nrm(L.mix([at(strike(await src(S.metalH(k + 2), 0, 0.4, { hp: 100, semis: -7 }))), at(nrm(L.thump({ f0: 220, f1: 110, decay: 0.07, click: 0.2, drive: 2, seed: `hc${k}` })), 0, -4)]));
      const m = L.mix([at(valve, 0, -8), at(pump, 0.02, -6), at(fluid, 0.03, -12), at(clunk, 0.4, -3)], { length: D });
      hyd.push(L.stereoize(cut(m, D, 0.3), { width: 0.25, hp: 400, seed: `hst${k}` }));
    }
    await put(cat, 'yanshu_hydraulic', hyd, D2({ lufs: -19, mmax: -18, voices: 2, pitch: [0.98, 1.02] }));
  }

  // yanshu_fin_click (the first draw's six fins at 0.5, pitch 1 + 0.06 i; the normal draw at 0.35): a fin's hinge
  // latching — the tick, a ceramic plate's short ring, a breath of steam
  {
    const clicks = [];
    for (let k = 0; k < 4; k++) {
      const pl = modal(2050 * (1 + k * 0.04), 0.12, { list: PLATE, t60: 0.05, seed: `fcp${k}` });
      const m = L.mix([at(latch(`fc${k}`, { f: 2700, ping: 3600 + k * 140, low: 260 })), at(nrm(pl), 0.001, -9), at(steam(0.12, { seed: `fcs${k}`, attack: 0.004, hold: 0.01, rel: 0.06 }), 0.006, -18)], { length: 0.14 });
      clicks.push(cut(m, 0.14, 0.4));
    }
    await put(cat, 'yanshu_fin_click', clicks, D2({ lufs: -20, voices: 4, pitch: [0.97, 1.03] }));
  }

  // yanshu_vent (idle, 0.2): a puff of steam out of the door seam, the valve's tick
  {
    const v = [];
    for (let k = 0; k < 3; k++) {
      const m = L.mix([at(latch(`vv${k}`, { f: 3400, ping: 4600, low: 360, pingDb: -16 }), 0, -12), at(steam(0.7, { seed: `vs${k}`, f: 3800 + k * 300, attack: 0.02, hold: 0.12 + k * 0.03, rel: 0.3 }), 0.01)], { length: 0.7 });
      v.push(L.stereoize(cut(m, 0.7, 0.3), { width: 0.4, hp: 800, seed: `vst${k}` }));
    }
    await put(cat, 'yanshu_vent', v, D2({ lufs: -21, mmax: -20, voices: 2, pitch: [0.95, 1.05] }));
  }

  // yanshu_drone_in (first draw 0.9 s at 0.7; the inspect's palm at 0.4, pitch 1.3): the two falcon drones fly in
  // from the screen edges — a small turbine each, dopplering down as it arrives (left, then right), a servo settle and
  // the eyes locking on (two blips)
  {
    const din = [];
    for (let k = 0; k < 2; k++) {
      const pass = (seed, dir) => {
        const D = 0.42;
        const tur = whine(D, (t) => (3400 - 900 * smooth(t / D)) * (1 + k * 0.03), { seed, band: 1.3, q: 3, grit: -30 });
        const air = L.whoosh({ dur: D, f0: 900, f1: 3200, q: 1.6, seed: seed + 'a' });
        const m = env(L.mix([at(nrm(tur), 0, -3), at(nrm(air))]), (t) => smooth(t / 0.25) * (t > 0.3 ? Math.exp(-(t - 0.3) * 12) : 1));
        return panMove(m, (t) => dir * (0.9 - 0.75 * smooth(t / 0.3)));
      };
      const settle = env(whine(0.22, [[0, 1500], [0.22, 1150]], { seed: `ds${k}`, band: 2 }), (t) => Math.sin(Math.PI * clamp(t / 0.22, 0, 1)));
      const m = L.mix([at(pass(`dl${k}`, -1)), at(pass(`dr${k}`, 1), 0.07), at(L.toStereo(settle), 0.36, -12), at(L.toStereo(beep(N.D6, 0.045)), 0.5, -16), at(L.toStereo(beep(N.F6, 0.06)), 0.56, -16)], { channels: 2, length: 0.75 });
      din.push(cut(m, 0.75, 0.25));
    }
    await put(cat, 'yanshu_drone_in', din, D2({ lufs: -17, mmax: -15, voices: 2, pitch: [0.98, 1.02] }));
  }

  // yanshu_roar (first draw 1.35 s, at 0.55 and pitch 0.7): the doors crack 6 mm and the furnace 「轟」s — a gas fire
  // catching (combust), the burner's low roar, the B♭1 core hum swelling through it. Designed as heard, then taken up
  // by 1 / 0.7.
  {
    const D = 1.4;
    const ign = strike(await src(S.combust, 0, 1.6, { hp: 50 }));
    const roar = await src(S.carFire, 4, 4 + D, { hp: 40 });
    const hum = powerHum(D, N.Bb1, { lp: [[0, 200], [0.3, 900], [D, 300]], drive: 5 });
    const rush = env(L.sweep(L.noise(D, { color: 'pink', seed: 'rrs' }), 'bp', (t) => 300 + 1400 * Math.exp(-t / 0.15), { q: 0.8 }), (t) => smooth(t / 0.03) * Math.exp(-t * 4));
    let m = L.mix([at(cut(ign, D, 0.5)), at(env(roar, (t) => smooth(t / 0.15) * Math.exp(-Math.max(0, t - 0.3) * 2.5)), 0, -4), at(env(hum, (t) => smooth(t / 0.25) * Math.exp(-Math.max(0, t - 0.4) * 3)), 0, -8), at(nrm(rush), 0, -10)], { length: D });
    m = L.psychoBass(L.stereoize(cut(m, D, 0.5), { width: 0.35, hp: 250, seed: 'rst' }), { freq: 110, amount: -6 });
    await put(cat, 'yanshu_roar', [L.varispeed(m, 1 / PITCH.roar)], D2({ lufs: -17, mmax: -15, voices: 1, pitch: [1, 1] }));
  }

  // yanshu_beep (the rare idle holo gauge, 0.35 at pitch 1.6, then 0.3 at 2.1): one soft digital bip on F6 / 1.6
  {
    const b = [0, 1].map((k) => L.mix([at(beep(N.F6 / PITCH.beep[0], 0.085, { h2: -20, h3: -18 })), at(nrm(L.fm(0.085, { carrier: N.F6 / PITCH.beep[0] * 2, ratio: 1.5, index: 0.8, indexDecay: 0.03 })), 0, -22 - k * 2)], { length: 0.1 }));
    await put(cat, 'yanshu_beep', b.map((x) => L.reverb(x, 'smallRoom', { wet: 0.12, seed: 'bpr', length: 0.3 })), D2({ lufs: -19, voices: 2, pitch: [1, 1] }));
  }
  // yanshu_ready_beep (every 2.5 s while 破限 is ready, 0.25; the card's 數位雙音): F6 then B♭6, the same two notes
  // ready_yanshu opens with (the engine's ready reminder can land on it)
  {
    const two = (k) => L.reverb(L.mix([at(beep(N.F6, 0.07, { h3: -14 })), at(beep(N.Bb6, 0.11, { h3: -14 }), 0.085)], { length: 0.22 }), 'smallRoom', { wet: 0.15, seed: `rb${k}`, length: 0.35 });
    await put(cat, 'yanshu_ready_beep', [two(0)], D2({ lufs: -17, mmax: -15, bus: 'ui', voices: 1, pitch: [1, 1] }));
  }
  // yanshu_warn (overload's last 1.5 s, every 0.5 s at 0.3, pitch 1.4): a buzzer pair B♭5 -> E (the tritone: heat
  // alarm), square-ish through a low-pass
  {
    const tone = (f, d) => nrm(env(L.eq(L.mix([at(L.tone(d, { type: 'square', freq: f })), at(L.tone(d, { freq: f * 2 }), 0, -10)]), [{ type: 'lp', f: 4000, order: 2 }]), (t) => smooth(t / 0.003) * (t > d - 0.01 ? (d - t) / 0.01 : 1)));
    const w = L.mix([at(tone(N.Bb5 / PITCH.warn, 0.06)), at(tone(N.E6 / PITCH.warn, 0.065), 0.085)], { length: 0.16 });
    await put(cat, 'yanshu_warn', [w], D2({ lufs: -18, voices: 2, pitch: [1, 1] }));
  }
  // yanshu_scan (a drone sweeping its head across, 1.4 s, 0.25): a small servo following the sweep, the eye's holo fan
  // (a fluttering FM shimmer)
  {
    const sc = [];
    for (let k = 0; k < 2; k++) {
      const D = 1.3, sv = whine(D, (t) => 950 + 380 * Math.sin(2 * Math.PI * t / D), { seed: `sv${k}`, band: 2, q: 2.5, grit: -26 });
      const sh = env(L.fm(D, { carrier: (t) => 2400 + 600 * Math.sin(2 * Math.PI * t / D), ratio: 2.01, index: 0.7, indexDecay: 9 }), (t) => (0.5 + 0.5 * Math.sin(2 * Math.PI * 22 * t)) * Math.sin(Math.PI * t / D));
      const m = L.mix([at(env(sv, (t) => Math.sin(Math.PI * clamp(t / D, 0, 1)) ** 0.7)), at(nrm(sh), 0, -14)], { length: D });
      sc.push(panMove(m, (t) => (k ? 0.4 : -0.4) + 0.3 * Math.sin(2 * Math.PI * t / D)));
    }
    await put(cat, 'yanshu_scan', sc, D2({ lufs: -22, mmax: -20, voices: 2, pitch: [0.97, 1.03] }));
  }
  // yanshu_door (inspect 0.95 / 1.75 s at 0.6): a door slides on its rail (gritty steel), stops on its end stop, and
  // the furnace's warm air breathes out
  {
    const doors = [];
    for (let k = 0; k < 3; k++) {
      const sl = env(scrape(0.2, 1900 + k * 150, 1300, `dsl${k}`), (t) => smooth(t / 0.04));
      const stop = nrm(L.mix([at(strike(await src(S.metalL(k + 1), 0, 0.4, { hp: 200, semis: -3 }))), at(latch(`dst${k}`, { f: 2000, ping: 2700, low: 180 }), 0, -6)]));
      const waft = env(flame(0.5, { seed: `dw${k}`, lp: 700, crack: -20 }), (t) => smooth(t / 0.12) * Math.exp(-Math.max(0, t - 0.15) * 7));
      const m = L.mix([at(sl, 0, -4), at(stop, 0.19, -2), at(waft, 0.08, -14)], { length: 0.55 });
      doors.push(L.stereoize(cut(m, 0.55, 0.3), { width: 0.3, hp: 400, seed: `dsx${k}` }));
    }
    await put(cat, 'yanshu_door', doors, D2({ lufs: -19, mmax: -18.5, voices: 2, pitch: [0.97, 1.03] }));
  }
  // yanshu_cell (a charge window lighting: reload x4 at 0.3, pitch 1.2 / 1.35 / 1.5 / 1.65 -> B♭5 C6 D6 E6; inspect
  // 0.5 at 1): an electronic blip that snaps up onto its note + a contact click
  {
    const f = N.Bb5 / PITCH.cell[0];
    const cell = [0, 1, 2].map((k) => L.mix([at(endFade(nrm(env(L.tone(0.09, { freq: (t) => f * (0.92 + 0.08 * smooth(t / 0.012)) }), (t) => smooth(t / 0.002) * Math.exp(-t * 32))), 0.03)),
      at(nrm(L.tone(0.09, { freq: f * 2.01 })), 0, -20), at(latch(`cc${k}`, { f: 4200, ping: 6000, low: 500, pingDb: -18 }), 0, -12)], { length: 0.1 }));
    await put(cat, 'yanshu_cell', cell, D2({ lufs: -20, voices: 4, pitch: [1, 1] }));
  }
  // yanshu_highfive (the rare inspect: both drones knock wings over the palm, 0.7 at pitch 1.4): two small steel wing
  // tips 「叮」 + a puff of sparks. Designed as heard, taken down by 1 / 1.4.
  {
    const hf = [0, 1].map((k) => {
      const m = L.mix([at(nrm(modal(N.D7, 0.35, { list: PLATE, t60: 0.14, seed: `hf${k}a` }))), at(nrm(modal(N.F7 * 0.98, 0.35, { list: PLATE, t60: 0.12, seed: `hf${k}b` })), 0.008, -3),
        at(latch(`hfl${k}`, { f: 4500, ping: 6200, low: 600 }), 0, -8), at(sparks(0.35, { seed: `hfs${k}`, density: 120, pings: 6 }), 0.01, -12)], { length: 0.4 });
      return L.varispeed(L.stereoize(cut(m, 0.4, 0.5), { width: 0.4, hp: 1200, seed: `hfx${k}` }), 1 / PITCH.highfive);
    });
    await put(cat, 'yanshu_highfive', hf, D2({ lufs: -18, mmax: -17, voices: 1, pitch: [1, 1] }));
  }
  // yanshu_drone_shot (2D at 0.22, pitch 0.95-1.05: two drones x 6 a second, x1.6 near): a small cyan bolt — an FM
  // zap falling 3.2 -> 1.4 kHz in 45 ms, a tiny thump, a click. Short and soft-edged: a patter under the gun, never a
  // tick storm.
  {
    const shots = [];
    for (let k = 0; k < 6; k++) {
      const r = ctx.rng(`dsh${k}`), f0 = 3200 * (1 + r.range(-0.06, 0.06));
      const zap = env(L.fm(0.07, { carrier: (t) => 1400 + (f0 - 1400) * Math.exp(-t / 0.018), ratio: 1.5, index: 2.4, indexDecay: 0.02 }), (t) => smooth(t / 0.0015) * Math.exp(-t * 55));
      const th = L.thump({ f0: 320, f1: 160, sweep: 0.006, decay: 0.03, click: 0, drive: 1, seed: `dst${k}` });
      const ck = L.noiseBurst({ dur: 0.008, attack: 0.0002, decay: 0.002, hp: 4500, lp: 12000, seed: `dsc${k}` });
      shots.push(L.mix([at(endFade(nrm(zap), 0.015)), at(nrm(th), 0, -10), at(nrm(ck), 0, -14)], { length: 0.08 }));
    }
    await put(cat, 'yanshu_drone_shot', shots, D2({ lufs: -17, voices: 6, pitch: [0.97, 1.03] }));
  }
  // yanshu_drone_beam (loop, reserved: the drones' thin 破限 beams have no caller yet): a thin hot buzz
  {
    const P = 2, X = 0.5;
    const t1 = env(L.mix([at(L.tone(P, { type: 'saw', freq: grid(N.Bb3, P) })), at(L.tone(P, { freq: grid(N.F6, P) }), 0, -10)]), (t) => 0.75 + 0.25 * Math.sin(2 * Math.PI * 40 * t));
    const hiss = L.eq(L.noise(P + X, { color: 'white', seed: 'dbh' }), [{ type: 'bp', f: 5200, q: 0.8 }]);
    const v = L.mix([at(L.toStereo(nrm(periodic(t1, (b) => L.eq(b, [{ type: 'bp', f: 1800, q: 0.7 }]))))), at(loopTex(L.stereoize(nrm(hiss), { width: 0.3, hp: 1500, seed: 'dbs' }), P, X), 0, -12)], { length: P, channels: 2 });
    seamCheck('yanshu_drone_beam', v, 0.5);
    await put(cat, 'yanshu_drone_beam', v, D2({ lufs: -24, loop: true, voices: 2, pitch: [1, 1], note: 'reserved (no caller yet)' }));
  }
  // yanshu_mini (分機, positional at the caster, 0.6): two mini drones split off — a launch chirp each (a whoosh and a
  // turbine climbing), a pair of blips
  {
    const mi = [0, 1].map((k) => {
      const one = (seed, t0) => L.mix([at(nrm(L.whoosh({ dur: 0.3, f0: 600, f1: 3200, q: 1.8, seed }))), at(env(whine(0.3, [[0, 2000], [0.3, 3600]], { seed: seed + 'w', band: 1.2, q: 3 }), (t) => Math.sin(Math.PI * clamp(t / 0.3, 0, 1))), 0, -6)]);
      return cut(L.mix([at(one(`mi${k}a`)), at(one(`mi${k}b`), 0.12, -1), at(beep(N.D6, 0.04), 0.3, -14), at(beep(N.Bb6, 0.05), 0.36, -14)], { length: 0.6 }), 0.6, 0.3);
    });
    await put(cat, 'yanshu_mini', mi, SP([4, 50], { lufs: -16, mmax: -14, voices: 2, pitch: [0.98, 1.02] }));
  }

  // yanshu_inspect ('world' at 0.01 s of the 4.6 s inspect, 0.6; §1.12: a 2-3 s theme phrase): the forge at dusk — a
  // low furnace bloom with a brass B♭ pad (horn + trombone, very soft), a smith's motif on the tuned anvil (B♭ . F F . B♭
  // then a D-F answer under the hovering drone), resolving on a struck B♭ with the fins rising (3.75). The foley
  // (doors 0.95 / 1.75, the cell 1.3, the drone 2.0, hydraulics 3.8) keeps the gaps.
  {
    const D = 4.5;
    const parts = [];
    const bloom = env(flame(D, { seed: 'ib', lp: 600, crack: -24 }), (t) => smooth(t / 0.6) * (t > 3.6 ? Math.exp(-(t - 3.6) * 3) : 1));
    parts.push(at(L.stereoize(bloom, { width: 0.4, hp: 150, seed: 'ibs' }), 0, -16));
    const pad = L.mix([at(await src(S.hornBb2, 0.3, 4.3, { hp: 60 })), at(await src(S.tbnF2, 0.3, 4.3, { hp: 50 }), 0, -3), at(await src(S.tbnD3, 0.3, 4.3, { hp: 60 }), 0, -6)]);
    parts.push(at(L.stereoize(env(nrm(pad), (t) => smooth(t / 0.9) * (t > 3.0 ? Math.exp(-(t - 3.0) * 2.4) : 1)), { width: 0.3, hp: 200, seed: 'ips' }), 0.05, -20));
    for (const [t, f, g, p] of [[0.004, N.Bb5, -2, -0.2], [0.34, N.F5, -5, -0.1], [0.48, N.F5, -7, -0.1], [0.72, N.Bb5, -3, 0], [2.25, N.D6, -9, 0.25], [2.5, N.F6, -10, 0.3]])
      parts.push(at(anvil(f, 1.4, { t60: 0.7, seed: `ia${t}`, bright: -2, splash: -14 }), t, g, p));
    parts.push(at(anvil(N.Bb4, 2.2, { t60: 1.3, seed: 'iaf', bright: -1, splash: -9 }), 3.72, -2, 0));
    parts.push(at(boom('iab', { f0: 110, f1: N.Bb1, decay: 0.5, amount: -5 }), 3.72, -10));
    let m = L.mix(parts, { channels: 2, length: D });
    m = cut(space(m, FORGE, { wet: 0.3, seed: 'ih', length: 2.2 }), D, 0.25);
    await put(cat, 'yanshu_inspect', m, D2({ lufs: -20, mmax: -17.5, voices: 1, pitch: [1, 1] }));
  }
}

// ------------------------------------------------------------------------------------------------ reload
async function reloadSet(cat, keep) {
  ctx.log('-- reload');
  // yanshu_reload_out (0.48 s into the 2.4 s reload, 0.8): the cell's latch kicks, the contacts part with an electric
  // 「bzzt」, the core dims (a falling blip), the cell scrapes out of its well
  const outs = [];
  for (let k = 0; k < 2; k++) {
    const kick = await K.grab(S.mgReload, 0.05, 0.28, { mode: 'peak', post: 0.08, semis: -2 - k, hp: 150 });
    const bz = env(L.eq(L.mix([at(L.tone(0.08, { type: 'saw', freq: 120 })), at(L.noise(0.08, { color: 'white', seed: `rob${k}` }), 0, -12)]), [{ type: 'bp', f: 1600, q: 0.8 }]), (t) => smooth(t / 0.003) * Math.exp(-t * 40) * (0.6 + 0.4 * Math.sign(Math.sin(2 * Math.PI * 60 * t))));
    const down = env(L.tone(0.16, { freq: (t) => 1200 * (0.33 + 0.67 * Math.exp(-t / 0.05)) }), (t) => smooth(t / 0.004) * Math.exp(-t * 18));
    const sc = env(scrape(0.2, 1400, 900, `ros${k}`), (t) => smooth(t / 0.03));
    const m = L.mix([at(kick), at(nrm(bz), 0.01, -10), at(nrm(down), 0.03, -16), at(sc, 0.08, -8)], { length: 0.45 });
    outs.push(L.stereoize(cut(m, 0.45, 0.3), { width: 0.25, hp: 500, seed: `rox${k}` }));
  }
  USED.add(S.mgReload);
  await put(cat, 'yanshu_reload_out', outs, D2({ lufs: -21, mmax: -19, voices: 1, pitch: [0.98, 1.02] }));
  // yanshu_reload_vent (0.58 s, 0.6): the doors crack and the furnace vents (a big steam puff, the burner's breath)
  const vents = [];
  for (let k = 0; k < 2; k++) {
    const m = L.mix([at(latch(`rv${k}`, { f: 2400, ping: 3100, low: 220 }), 0, -8), at(steam(0.9, { seed: `rvs${k}`, f: 3600, attack: 0.015, hold: 0.25, rel: 0.4, turbK: 0.5 }), 0.012),
      at(env(flame(0.7, { seed: `rvf${k}`, lp: 800, crack: -18 }), (t) => smooth(t / 0.1) * Math.exp(-t * 4)), 0.02, -12)], { length: 0.9 });
    vents.push(L.stereoize(cut(m, 0.9, 0.35), { width: 0.45, hp: 600, seed: `rvx${k}` }));
  }
  await put(cat, 'yanshu_reload_vent', vents, D2({ lufs: -21, mmax: -19.5, voices: 1, pitch: [0.97, 1.03] }));
  // yanshu_reload_in (1.58 s, 0.8): the new cell slides in, seats with a heavy clack, the magnetic lock thunks and the
  // coupling hums up
  const ins = [];
  for (let k = 0; k < 2; k++) {
    const sc = env(scrape(0.14, 900, 1500, `ris${k}`), (t) => smooth(t / 0.03));
    const seat = await K.grab(S.mgReload, 1.50, 1.85, { mode: 'peak', post: 0.1, semis: -2.5 - k * 0.5, hp: 120 });
    const lock = nrm(L.thump({ f0: 200, f1: 100, sweep: 0.008, decay: 0.08, click: 0.3, drive: 2, seed: `ril${k}` }));
    const up = env(powerHum(0.32, (t) => 80 + 36 * smooth(t / 0.25), { lp: [[0, 300], [0.3, 1500]], drive: 3 }), (t) => smooth(t / 0.1) * Math.exp(-Math.max(0, t - 0.2) * 12));
    const m = L.mix([at(sc, 0, -9), at(seat, 0.12), at(lock, 0.13, -6), at(up, 0.16, -14)], { length: 0.55 });
    ins.push(L.stereoize(cut(m, 0.55, 0.3), { width: 0.25, hp: 500, seed: `rix${k}` }));
  }
  USED.add(S.mgReload);
  await put(cat, 'yanshu_reload_in', ins, D2({ lufs: -21, mmax: -19, voices: 1, pitch: [0.98, 1.02] }));
  // yanshu_forge (the rare reload, 1 in 8: the ram knocks once and forges the cell in, 0.9): the anvil 「鏘」, a smith's
  // real blow under it, the thud, sparks
  const forges = [];
  for (let k = 0; k < 2; k++) {
    const sm = strike(await src(S.smith, [0.185, 1.49][k], [0.665, 1.935][k], { hp: 80 }));
    const m = L.mix([at(anvil(N.Bb5 * (1 + k * 0.003), 1.2, { t60: 0.85, seed: `fo${k}`, splash: -8 })), at(cut(sm, 0.4, 0.5), 0, -6), at(boom(`fob${k}`, { f0: 130, f1: 58, decay: 0.3, amount: -5 }), 0, -6),
      at(sparks(0.8, { seed: `fos${k}`, density: 150, pings: 14 }), 0.01, -12)], { length: 1.2 });
    forges.push(L.stereoize(cut(m, 1.2, 0.5), { width: 0.3, hp: 500, seed: `fox${k}` }));
  }
  keep.forge = forges;
  await put(cat, 'yanshu_forge', forges, D2({ lufs: -17, mmax: -15, voices: 1, pitch: [0.99, 1.01] }));
}

// ------------------------------------------------------------------------------------------------ skills: 爐環, 吸爐震擊, 超載
async function skillSet(cat, keep) {
  ctx.log('-- skills');
  // yanshu_ring (爐環, 2D for the caster, positional for others): 噴焰「呼—轟」 — the jets light (a gas 「呼」 rising),
  // the wall of fire bursts out round the caster (a low 「轟」 + the pressure wave) and races round (a flame band
  // circling the stereo field), then crackles down
  const rings = [];
  for (let k = 0; k < 2; k++) {
    const D = 1.5;
    const hoo = env(strike(await src(k ? S.fireWhoosh2 : S.fireWhoosh, 0, 1.2, { hp: 60 })), (t) => smooth(t / 0.18));
    const comb = strike(await src(S.combust, 0, 1.6, { hp: 40 }));
    const hong = L.mix([at(boom(`rgb${k}`, { f0: 85, f1: 40, decay: 0.6, amount: -4 })), at(airwave(0.7, { f0: 2400, f1: 150, fall: 0.1, seed: `rga${k}` }), 0, -4)]);
    const circ = panMove(flame(1.1, { seed: `rgf${k}`, lp: 4200, crack: -10, e: (t) => smooth(t / 0.08) * Math.exp(-t * 2.2) }), (t) => Math.sin(2 * Math.PI * (t * 1.4 + k * 0.25)) * 0.85);
    const tail = await src(S.stove, 30 + k * 7, 31.6 + k * 7, { stereo: true, hp: 300 });
    const lite = L.mix([at(nrm(L.noiseBurst({ dur: 0.03, attack: 0.0003, decay: 0.008, hp: 1200, lp: 9000, seed: `rgl${k}` }))), at(latch(`rgv${k}`, { f: 3000, ping: 4000, low: 300, pingDb: -14 }), 0, -6)]);
    let m = L.mix([at(L.toStereo(lite), 0, -14), at(L.toStereo(cut(hoo, 0.5, 0.4)), 0, -5), at(L.toStereo(cut(comb, 1.2, 0.5)), 0.17, -3), at(L.toStereo(hong), 0.2), at(circ, 0.22, -4),
      at(env(tail, (t) => smooth(t / 0.3) * Math.exp(-t * 2.2)), 0.35, -16)], { channels: 2, length: D });
    m = L.psychoBass(cut(m, D, 0.4), { freq: 110, amount: -5 });
    rings.push(m);
  }
  keep.ring = rings;
  await put(cat, 'yanshu_ring', rings, SP2([8, 80], { lufs: -13, mmax: -11, voices: 2, pitch: [0.98, 1.02], priority: 2 }));
  // yanshu_jets (the caster's gun, 0.8): the door-side slits jet — a gas 「pssh」 each side with flame in it
  const jets = [];
  for (let k = 0; k < 2; k++) {
    const one = (seed) => L.mix([at(steam(0.5, { seed, f: 2800, hp: 700, attack: 0.008, hold: 0.12, rel: 0.2, turbK: 0.6, gain: 4 })), at(flame(0.5, { seed: seed + 'f', lp: 1800, crack: -14, e: (t) => smooth(t / 0.02) * Math.exp(-t * 6) }), 0, -4)]);
    const m = L.mix([at(one(`jl${k}`), 0, 0, -0.7), at(one(`jr${k}`), 0.015, 0, 0.7)], { channels: 2, length: 0.55 });
    jets.push(cut(m, 0.55, 0.4));
  }
  await put(cat, 'yanshu_jets', jets, D2({ lufs: -18, mmax: -16, voices: 1, pitch: [0.97, 1.03] }));

  // yanshu_inhale (吸爐, 0-0.42 s, then the strike): the doors gape, the furnace sucks the cone in — a reversed flame
  // rush, a low-pass opening as the air comes, the intake's pitch climbing — and stops dead at 0.42
  const inh = [];
  for (let k = 0; k < 2; k++) {
    const T = 0.42, D = 0.5;
    const rev = L.reverse(cut(strike(await src(S.fireWhoosh, 0, 1.0, { hp: 60 })), 0.6, 0.2));
    const suck = env(L.sweep(L.noise(T, { color: 'pink', seed: `ins${k}` }), 'lp', (t) => 250 * (4500 / 250) ** (t / T), { q: 1.2 }), (t) => (t / T) ** 2.2);
    const intake = env(powerHum(T, (t) => N.Bb1 * (1 + smooth(t / T)), { lp: [[0, 300], [T, 2400]], drive: 4 }), (t) => (t / T) ** 1.6);
    const wind = panMove(env(L.sweep(L.noise(T, { color: 'white', seed: `inw${k}` }), 'bp', (t) => 500 + 2000 * (t / T), { q: 1.4 }), (t) => (t / T) ** 2), (t) => (k ? 1 : -1) * 0.8 * (1 - t / T));
    const gape = L.mix([at(latch(`ing${k}`, { f: 2200, ping: 3000, low: 200 })), at(scrape(0.12, 1600, 1100, `insc${k}`), 0.01, -4)]);
    const revT = env(L.eq(L.slice(rev, Math.max(0, rev.duration - T)), [{ type: 'hp', f: 140, order: 2 }]), (t) => (t / T) ** 1.8);
    let m = L.mix([at(L.toStereo(gape), 0, -8), at(L.toStereo(revT), 0, -4), at(L.toStereo(nrm(suck)), 0, -3), at(L.toStereo(intake), 0, -8), at(wind, 0, -8)], { channels: 2, length: D });
    m = env(m, (t) => (t < T ? 1 : Math.exp(-(t - T) * 90)));
    inh.push(m);
  }
  keep.inhale = inh;
  await put(cat, 'yanshu_inhale', inh, SP2([8, 80], { lufs: -15, mmax: -14, voices: 1, pitch: [1, 1] }));

  // yanshu_strike (0.42 s: 鍛錘「鏘」 + the shock wave): the ram's face on the anvil of the air — the anvil's B♭4, a real
  // smith's blow and a deep steel clang under it, the 40-60 Hz boom, the pressure wave, a little grit thrown up
  const strikes = [];
  for (let k = 0; k < 2; k++) {
    const D = 1.7;
    const sm = strike(await src(S.smith, [2.918, 4.343][k], [3.279, 4.914][k], { hp: 70 }));
    const deep = strike(await src(S.clangDeep, 0, 1.12, { hp: 40 }));
    const grit = await src(S.rubble, 0, 1.0, { hp: 200 });
    let m = L.mix([at(anvil(N.Bb4 * (1 + k * 0.004), D, { t60: 1.1, seed: `sk${k}`, splash: -6 })), at(cut(sm, 0.4, 0.6), 0, -4), at(cut(deep, 1.1, 0.5), 0, -3),
      at(boom(`skb${k}`, { f0: 90, f1: 44, sweep: 0.05, decay: 0.7, amount: -4 }), 0, -1), at(airwave(1.0, { f0: 3000, f1: 120, fall: 0.12, seed: `ska${k}` }), 0.004, -5), at(grit, 0.06, -16)], { length: D });
    m = L.stereoize(cut(m, D, 0.5), { width: 0.35, hp: 300, seed: `skx${k}` });
    strikes.push(m);
  }
  keep.strike = strikes;
  await put(cat, 'yanshu_strike', strikes, SP2([8, 90], { lufs: -12, mmax: -10, voices: 2, pitch: [0.99, 1.01], priority: 2, maxLimitDb: 6 }));

  // the 4-beat transformation (0.12 s apart; 0.08 on 破限), 2D at 0.8:
  // ① yanshu_beat_click 「喀」: the six fins snapping up in a 35 ms ratchet, the last one heavy, a ceramic ring
  {
    const v = [];
    for (let k = 0; k < 1; k++) {
      const parts = [];
      for (let i = 0; i < 6; i++) parts.push(at(latch(`bc${i}`, { f: 2500 + i * 120, ping: 3300 + i * 160, low: 220 }), i * 0.007, -4 + (i === 5 ? 4 : 0), -0.5 + i * 0.2));
      parts.push(at(nrm(modal(1900, 0.3, { list: PLATE, t60: 0.12, seed: 'bcp' })), 0.036, -6), at(strike(await src(S.metalM(1), 0, 0.4, { hp: 150, semis: -2 })), 0.035, -3));
      v.push(cut(L.mix(parts, { channels: 2, length: 0.32 }), 0.32, 0.4));
    }
    await put(cat, 'yanshu_beat_click', v, D2({ lufs: -17, mmax: -15, voices: 1, pitch: [1, 1] }));
  }
  // ② yanshu_beat_hiss 「嘶」: the doors slide 22 mm apart and the furnace exhales steam
  {
    const m = L.mix([at(L.toStereo(scrape(0.12, 1700, 1200, 'bhs')), 0, -6), at(L.stereoize(steam(0.75, { seed: 'bhh', f: 4600, attack: 0.01, hold: 0.18, rel: 0.35, turbK: 0.5 }), { width: 0.5, hp: 800, seed: 'bhx' }), 0.02)], { channels: 2, length: 0.8 });
    await put(cat, 'yanshu_beat_hiss', [cut(m, 0.8, 0.3)], D2({ lufs: -18, mmax: -16, voices: 1, pitch: [1, 1] }));
  }
  // ③ yanshu_beat_clang 「鏘」: the ram thrusts out 60 mm on its hydraulics and locks: the thrust, a steel clang on F5
  {
    const thrust = env(whine(0.09, [[0, 200], [0.09, 380]], { seed: 'bct', band: 3, q: 1.5 }), (t) => smooth(t / 0.02));
    const m = L.mix([at(L.toStereo(thrust), 0, -10), at(L.toStereo(anvil(N.F5, 0.9, { t60: 0.55, seed: 'bcl', splash: -6 })), 0.085, -2), at(L.toStereo(strike(await src(S.metalH(0), 0, 0.5, { hp: 100, semis: -3 }))), 0.085, -4),
      at(L.toStereo(nrm(L.thump({ f0: 160, f1: 70, decay: 0.12, click: 0.3, drive: 2, seed: 'bcb' }))), 0.085, -6)], { channels: 2, length: 0.95 });
    await put(cat, 'yanshu_beat_clang', [cut(L.stereoize(mono(m), { width: 0.3, hp: 400, seed: 'bcx' }), 0.95, 0.4)], D2({ lufs: -15, mmax: -13, voices: 1, pitch: [1, 1] }));
  }
  // ④ yanshu_beat_hum 「嗡」: the core goes white-hot — a B♭ power chord (B♭1 + F2 + B♭2) whose low-pass opens with a
  // 「vwoom」 (the pitch settling up onto it), a high heat shimmer, fading as the overload's own sounds take over
  {
    const D = 1.7;
    const vw = (t) => 0.94 + 0.06 * smooth(t / 0.15);
    const hum = powerHum(D, (t) => N.Bb1 * vw(t), { lp: [[0, 250], [0.18, 2600], [D, 900]], drive: 5, harm: [[1, 0], [1.5, -4], [2, -3], [3, -12]] });
    const shim = env(L.mix([at(L.tone(D, { freq: N.Bb6 })), at(L.tone(D, { freq: N.Bb6 * 1.003 }), 0, -1), at(L.tone(D, { freq: N.F7 }), 0, -8)]), (t) => smooth(t / 0.2) * Math.exp(-t * 2));
    const m = L.mix([at(L.stereoize(env(hum, (t) => smooth(t / 0.05) * (t > 0.5 ? Math.exp(-(t - 0.5) * 2.2) : 1)), { width: 0.25, hp: 300, seed: 'bhm' })), at(L.toStereo(nrm(shim)), 0, -26)], { channels: 2, length: D });
    await put(cat, 'yanshu_beat_hum', [L.psychoBass(cut(m, D, 0.4), { freq: 110, amount: -4 })], D2({ lufs: -16, mmax: -14, voices: 1, pitch: [1, 1] }));
  }

  // the molten beam (LMB held in overload): yanshu_beam_start (0.9 / positional 0.8), _loop (持續低吼, 0.7 / 0.6),
  // _end (0.7 / 0.6)
  {
    const starts = [];
    for (let k = 0; k < 2; k++) {
      const D = 1.0;
      const kssh = L.mix([at(nrm(L.noiseBurst({ dur: 0.12, attack: 0.0004, decay: 0.05, hp: 1800, lp: 14000, seed: `bsk${k}` }))), at(sparks(0.4, { seed: `bss${k}`, density: 220, pings: 8 }), 0, -6)]);
      const vwoom = powerHum(D, (t) => N.Bb1 * (0.8 + 0.2 * smooth(t / 0.2)), { lp: [[0, 200], [0.22, 3200], [D, 1400]], drive: 6, harm: [[1, 0], [2, -4], [1.5, -6], [0.5, -6]] });
      const siz = await src(S.sizzle, 0.4 + k * 1.5, 1.6 + k * 1.5, { hp: 1500 });
      const rise = env(whine(0.5, [[0, 1200], [0.4, 2300]], { seed: `bsr${k}`, band: 1.3, q: 3 }), (t) => Math.sin(Math.PI * clamp(t / 0.5, 0, 1)));
      const m = L.mix([at(L.toStereo(kssh), 0, -4), at(L.stereoize(env(vwoom, (t) => smooth(t / 0.03) * (t > 0.4 ? Math.exp(-(t - 0.4) * 3) : 1)), { width: 0.3, hp: 300, seed: `bsv${k}` })),
        at(L.toStereo(boom(`bsb${k}`, { f0: 120, f1: 45, decay: 0.4, amount: -4 })), 0, -4), at(L.stereoize(env(siz, (t) => smooth(t / 0.05) * Math.exp(-t * 2)), { width: 0.4, hp: 1500, seed: `bsz${k}` }), 0.04, -12),
        at(L.toStereo(rise), 0.05, -16)], { channels: 2, length: D });
      starts.push(cut(m, D, 0.4));
    }
    keep.beamStart = starts;
    await put(cat, 'yanshu_beam_start', starts, SP2([6, 70], { lufs: -13, mmax: -11, voices: 4, pitch: [0.98, 1.02] }));

    // the loop (P = 3 s): the growl — B♭1 / B♭2 / F2 saws through a tube and a low-pass breathing at 1/3 Hz with a 2 Hz
    // wobble (tones and LFOs on the 1/P grid); the plasma's roar (a car fire), the molten sizzle, a crackle — the
    // recorded / noise layers go through the loop crossfade
    const P = 3, X = 0.6;
    const growl = L.saturate(L.mix([at(L.tone(P, { type: 'saw', freq: grid(N.Bb1, P) })), at(L.tone(P, { type: 'saw', freq: grid(N.Bb1, P) + 1 / P }), 0, -3), at(L.tone(P, { type: 'saw', freq: grid(N.F2, P) }), 0, -5),
      at(L.tone(P, { type: 'saw', freq: grid(N.Bb2, P) }), 0, -7)]), { drive: 6, type: 'tube' });
    const breathe = periodic(growl, (b) => L.stereoize(L.sweep(b, 'lp', (t) => 950 + 400 * Math.sin(2 * Math.PI * t / P) + 200 * Math.sin(2 * Math.PI * 2 * t), { q: 1.1 }), { width: 0.25, hp: 300, seed: 'blg' }));
    const roar = await src(S.carFire, 8, 8 + P + X, { stereo: true, hp: 60 });
    const siz = await src(S.sizzle, 11, 11 + P + X, { hp: 1800 });
    const crk = L.crackle(P + X, { density: 45, decay: 0.002, hp: 2500, minAmp: 0.2, seed: 'blc' });
    const whine2 = L.mix([at(L.tone(P, { freq: grid(N.Bb5, P) })), at(L.tone(P, { freq: grid(N.Bb5, P) + 2 / P }))]);
    let loop = L.mix([at(nrm(breathe)), at(loopTex(roar, P, X), 0, -3),
      at(loopTex(L.stereoize(siz, { width: 0.5, hp: 1500, seed: 'bls' }), P, X), 0, -10), at(loopTex(L.stereoize(nrm(crk), { width: 0.6, hp: 2000, seed: 'blk' }), P, X), 0, -17), at(L.toStereo(nrm(whine2)), 0, -28)], { channels: 2, length: P });
    loop = periodic(loop, (b) => L.psychoBass(L.eq(b, [{ type: 'peak', f: 1500, gain: 2.5, q: 0.7 }]), { freq: 110, amount: -6 }));
    seamCheck('yanshu_beam_loop', loop, 1);
    keep.beamLoop = loop;
    await put(cat, 'yanshu_beam_loop', loop, SP2([6, 70], { lufs: -14, loop: true, voices: 4, pitch: [1, 1], note: 'the overload LMB (replaces the gun): ~-17 LUFS as heard at the handler 0.7' }));

    const ends = [];
    for (let k = 0; k < 2; k++) {
      const D = 1.1;
      const down = powerHum(0.6, (t) => N.Bb1 * (1 - 0.45 * smooth(t / 0.5)), { lp: [[0, 1800], [0.5, 150]], drive: 5 });
      const siz = await src(S.sizzle, 30 + k * 3, 31.2 + k * 3, { hp: 1500 });
      const m = L.mix([at(L.stereoize(env(down, (t) => Math.exp(-t * 4)), { width: 0.25, hp: 300, seed: `bed${k}` })), at(L.stereoize(env(siz, (t) => Math.exp(-t * 3.5)), { width: 0.4, hp: 1500, seed: `bez${k}` }), 0, -10),
        at(L.stereoize(steam(0.5, { seed: `bes${k}`, attack: 0.02, hold: 0.05, rel: 0.3 }), { width: 0.5, hp: 800, seed: `bex${k}` }), 0.05, -14), at(L.toStereo(sparks(0.6, { seed: `bek${k}`, density: 50, pings: 4 })), 0.02, -20)], { channels: 2, length: D });
      ends.push(cut(m, D, 0.5));
    }
    keep.beamEnd = ends;
    await put(cat, 'yanshu_beam_end', ends, SP2([6, 60], { lufs: -18, mmax: -16, voices: 4, pitch: [0.98, 1.02] }));
  }

  // yanshu_ram_jet (樞錘衝撞, 8 m in 0.35 s): 噴射「轟」 — the thrusters light (a rocket's ignition), a low boom, the jet
  // roar driving the dash and the air tearing past
  {
    const jets2 = [];
    for (let k = 0; k < 2; k++) {
      const D = 0.8;
      const rk = strike(await src(k ? S.missile : S.rocket, 0, 1.0, { hp: 60 }));
      const roar = env(flame(0.6, { seed: `rjf${k}`, lp: 3000, crack: -10 }), (t) => smooth(t / 0.03) * (t > 0.38 ? Math.exp(-(t - 0.38) * 9) : 1));
      const pass = panMove(L.whoosh({ dur: 0.45, f0: 400, f1: 2600, q: 1.4, seed: `rjw${k}` }), (t) => (k ? 0.4 : -0.4) * (1 - 2 * t / 0.45));
      const m = L.mix([at(L.toStereo(cut(rk, 0.6, 0.5)), 0, -2), at(L.toStereo(boom(`rjb${k}`, { f0: 95, f1: 42, decay: 0.4, amount: -4 })), 0, -3), at(L.stereoize(roar, { width: 0.35, hp: 400, seed: `rjs${k}` }), 0.01, -4), at(pass, 0.02, -6)], { channels: 2, length: D });
      jets2.push(L.psychoBass(cut(m, D, 0.4), { freq: 110, amount: -5 }));
    }
    keep.ramJet = jets2;
    await put(cat, 'yanshu_ram_jet', jets2, SP2([8, 90], { lufs: -13, mmax: -12, voices: 2, pitch: [0.98, 1.02], priority: 2 }));
  }
  // yanshu_ram_slam (the landing: 300 in 4 m, fire ring, debris, a cracked floor): the ram face into the street — a
  // heavy steel thud and a deep clang, a blast body, the 30-50 Hz boom, the fire ring's whoosh, rubble and debris raining
  {
    const slams = [];
    for (let k = 0; k < 2; k++) {
      const D = 2.3;
      const thud = strike(await src(S.thud, 0.1, 0.75, { hp: 30 }));
      const blast = strike(await src(k ? S.grenade : S.deepBoom, 0, 2.2, { hp: 35 }));
      const deep = strike(await src(S.clangDeep, 0, 1.12, { hp: 40, semis: -2 }));
      const fireR = strike(await src(S.combust, 0, 1.8, { hp: 60 }));
      const deb = await src(S.debris, 0.1, 2.4, { stereo: true, hp: 120 });
      const rub = strike(await src(S.rubble, 0, 1.0, { hp: 150 }));
      let m = L.mix([at(L.toStereo(thud), 0, -2), at(L.toStereo(cut(blast, 2.0, 0.6)), 0.003, -3), at(L.toStereo(cut(deep, 1.0, 0.5)), 0, -5), at(L.toStereo(boom(`rsb${k}`, { f0: 75, f1: 32, sweep: 0.08, decay: 0.9, drive: 3, amount: -3 })), 0),
        at(L.stereoize(cut(fireR, 1.4, 0.5), { width: 0.5, hp: 300, seed: `rsf${k}` }), 0.03, -6), at(deb, 0.12, -11), at(L.toStereo(rub), 0.08, -10), at(L.toStereo(airwave(1.2, { f0: 3200, f1: 100, fall: 0.15, seed: `rsa${k}` })), 0.002, -6)], { channels: 2, length: D });
      slams.push(L.psychoBass(cut(m, D, 0.5), { freq: 110, amount: -4 }));
    }
    keep.ramSlam = slams;
    await put(cat, 'yanshu_ram_slam', slams, SP2([10, 120], { lufs: -11, mmax: -9, voices: 2, pitch: [0.98, 1.02], priority: 3, maxLimitDb: 6 }));
  }
  // yanshu_cool (超載 ends, 0.8): the fins fall back one by one (rear to front, 70 ms apart, from 0.06 s), the doors
  // close (0.25), the furnace vents a long steam (0.3), the core's hum sinks, the hot steel ticks as it cools
  {
    const D = 2.4, parts = [];
    // (0 s: the ram retracts and the door latches release at once: a valve and a short pneumatic breath)
    parts.push(at(L.toStereo(latch('clv', { f: 2800, ping: 3800, low: 260, pingDb: -12 })), 0, -10), at(L.toStereo(steam(0.2, { seed: 'clp', f: 3000, attack: 0.004, hold: 0.03, rel: 0.1 })), 0.002, -14));
    for (let i = 0; i < 6; i++) parts.push(at(latch(`clc${i}`, { f: 2400 - i * 80, ping: 3400 - i * 120, low: 220 }), 0.06 + i * 0.07, -6 - i * 0.6, 0.5 - i * 0.2));
    parts.push(at(L.toStereo(scrape(0.14, 1300, 1800, 'cls')), 0.22, -10), at(L.toStereo(latch('cld', { f: 1900, ping: 2600, low: 170 })), 0.36, -6));
    parts.push(at(L.stereoize(steam(1.6, { seed: 'clst', f: 4000, attack: 0.03, hold: 0.45, rel: 0.7, turbK: 0.5 }), { width: 0.55, hp: 800, seed: 'clsx' }), 0.3, -3));
    parts.push(at(L.toStereo(endFade(env(powerHum(1.3, (t) => N.Bb2 * (1 - 0.5 * smooth(t / 1.1)), { lp: [[0, 1200], [1.2, 200]], drive: 3 }), (t) => Math.exp(-t * 2.4)), 0.4)), 0, -16));
    const r = ctx.rng('cool_ticks');
    for (let i = 0; i < 9; i++) { const t = 0.7 + r.next() * 1.5; parts.push(at(nrm(L.partials(0.05, { base: 3000 + r.next() * 3000, list: [[1, 1, 0.012], [1.6, 0.4, 0.008]], seed: `clt${i}` })), t, -20 - r.next() * 8, r.range(-0.6, 0.6))); }
    const m = cut(L.mix(parts, { channels: 2, length: D }), D, 0.3);
    keep.cool = [m];
    await put(cat, 'yanshu_cool', [m], D2({ lufs: -18, mmax: -16, voices: 1, pitch: [1, 1] }));
  }
}

// ------------------------------------------------------------------------------------------------ 破限 + other
/** The B♭ major brass chord (tuba B♭1, trombones F2 B♭2 D3 F3, horns D5 F5) + the choir's F, from `t0` in the takes. */
async function brassChord(t0, len, { choir = -5, horns = -11, seed = 'bc' } = {}) {
  const parts = [];
  for (const [id, g, hp] of [[S.tubaBb1, 0, 30], [S.tbnF2, -2, 30], [S.tbnBb2, -2, 30], [S.tbnD3, -4, 30], [S.tbnF3, -4, 30], [S.hornD5, horns, 200], [S.hornF5, horns - 1, 200]]) parts.push(at(await src(id, t0, t0 + len, { hp }), 0, g));
  const ch = await src(S.choirA, t0, t0 + len, { stereo: true, hp: 120 });
  const brass = L.stereoize(nrm(L.mix(parts)), { width: 0.35, hp: 220, seed });
  return nrm(L.mix([at(brass), at(ch, 0, choir)], { channels: 2 }));
}

async function ultSet(cat, keep) {
  ctx.log('-- ult');
  // yanshu_seal_snap (破限 0 s): 封條斷裂聲 — the strap creaks under the fins, SNAPS (a high-tension steel tine + a
  // crack), its rivets pop off in a spray, it flares and flutters away burning
  {
    const D = 1.1;
    const creak = cut(await src(S.creak, 0.2, 0.6, { hp: 300, semis: 4 }), 0.14, 0.3);
    const twang = modal(N.D6, 0.6, { list: TINE, t60: 0.28, seed: 'sst' });
    const crack = L.noiseBurst({ dur: 0.02, attack: 0.0002, decay: 0.005, hp: 2000, lp: 15000, seed: 'ssc' });
    const parts = [at(L.toStereo(creak), 0, -10), at(L.toStereo(nrm(crack)), 0.12, -2), at(L.toStereo(nrm(twang)), 0.12, -4), at(L.toStereo(strike(await src(S.metalL(0), 0, 0.4, { hp: 300, semis: 3 }))), 0.12, -6)];
    for (const [i, t] of [0.14, 0.17, 0.215, 0.26].entries()) parts.push(at(latch(`ssr${i}`, { f: 4000 + i * 300, ping: 5200 + i * 400, low: 600, pingDb: -4 }), t, -8 - i, (i % 2 ? 0.6 : -0.6)));
    parts.push(at(L.stereoize(sparks(0.7, { seed: 'sss', density: 200, pings: 12 }), { width: 0.6, hp: 2000, seed: 'ssx' }), 0.13, -9));
    parts.push(at(L.stereoize(env(strike(await src(S.fireWhoosh2, 0, 0.9, { hp: 200 })), (t) => Math.exp(-t * 3)), { width: 0.4, hp: 400, seed: 'ssf' }), 0.15, -8));
    parts.push(at(panMove(L.whoosh({ dur: 0.4, f0: 1500, f1: 600, q: 2, seed: 'ssw' }), (t) => -0.2 + 1.5 * t), 0.16, -10));
    const m = cut(L.mix(parts, { channels: 2, length: D }), D, 0.4);
    keep.seal = [m];
    await put(cat, 'yanshu_seal_snap', [m], SP2([8, 80], { lufs: -14, mmax: -12, voices: 1, pitch: [1, 1], priority: 3 }));
  }

  // yanshu_ult_chord (0.1 s after the snap; §1.12 three layers): RISE 0-0.4 s — a timpani roll swelling, the brass +
  // choir chord bending up 4 st onto B♭ (上升和弦), a riser; IMPACT at 0.4 — the 40-60 Hz boom, the timpani and the bass
  // drum, the anvil 「鏘」 on B♭5, the shock; BED 0.4-4.4 — the B♭ major brass + choir held and dying, the furnace
  // roaring under it, a cyan shimmer on top (the drones' holo). The release is yanshu_ult_end.
  {
    const T = 0.4, D = 4.6;
    const roll = env(await src(S.rollBb, 2, 2 + T + 0.1, { stereo: true, hp: 40 }), (t) => (t / T) ** 2);
    const rchord = await brassChord(0.4, 1.2, { seed: 'ucr' });
    const bend = L.slice(L.varispeedCurve(rchord, (t) => 0.794 + 0.206 * smooth(t / T), { maxRate: 1 }), 0, T + 0.02);
    const riseCh = env(bend, (t) => (t / T) ** 1.6);
    const riser = env(L.sweep(L.noise(T, { color: 'pink', seed: 'ucn' }), 'bp', (t) => 400 * 10 ** (t / T), { q: 1.6 }), (t) => (t / T) ** 2.5);
    const chord = await brassChord(0.05, D - T, { seed: 'ucb' });
    const bed = env(chord, (t) => smooth(t / 0.08) * (t < 1.4 ? 1 : Math.exp(-(t - 1.4) * 1.1)));
    const timp = strike(await src(S.timpBb, 0, 2.5, { hp: 30 }));
    const bd = strike(await src(S.bdFff, 0.05, 2.5, { hp: 25 }));
    const furnace = env(await src(S.carFire, 2, 2 + D - T, { stereo: true, hp: 50 }), (t) => smooth(t / 0.2) * Math.exp(-t * 0.7));
    const shim = env(L.mix([at(holo(D - T, N.Bb6, N.F7, { seed: 'ucs', flutter: 6, index: 0.8 })), at(L.tone(D - T, { freq: N.Bb6 }), 0, -6)]), (t) => smooth(t / 0.4) * Math.exp(-t * 0.9));
    const parts = [at(roll, 0, -6), at(riseCh, 0, -4), at(L.toStereo(nrm(riser)), 0, -14),
      at(L.toStereo(boom('ucbm', { f0: 70, f1: 40, sweep: 0.08, decay: 0.8, drive: 3, amount: -3 })), T), at(L.toStereo(timp), T, -3), at(L.toStereo(bd), T, -4),
      at(L.stereoize(anvil(N.Bb5, 2.2, { t60: 1.4, seed: 'uca', splash: -7 }), { width: 0.3, hp: 600, seed: 'ucax' }), T, -6), at(L.toStereo(airwave(1.0, { f0: 2600, f1: 120, fall: 0.12, seed: 'ucw' })), T, -8),
      at(bed, T, -3), at(furnace, T, -14), at(L.stereoize(nrm(shim), { width: 0.6, hp: 2000, seed: 'ucsx' }), T + 0.1, -22)];
    let m = cut(space(L.mix(parts, { channels: 2, length: D }), FORGE, { wet: 0.25, seed: 'ucf', length: 2.4, hp: 200 }), D, 0.3);
    m = L.psychoBass(m, { freq: 110, amount: -5 });
    keep.chord = [m];
    await put(cat, 'yanshu_ult_chord', [m], SP2([10, 140], { lufs: -13, mmax: -9.5, voices: 1, pitch: [1, 1], priority: 3 }));
  }

  // yanshu_ult_dock (the last 2 s: the drones fly back beside the ram): 合體的機械聲 — two turbines swooping in from
  // the sides, three locks (chk - chk - CHUNK), the coupling's zap climbing
  {
    const D = 1.0;
    const sw = (seed, dir) => panMove(env(whine(0.35, [[0, 2600], [0.35, 1700]], { seed, band: 1.3, q: 3, grit: -28 }), (t) => Math.sin(Math.PI * clamp(t / 0.35, 0, 1))), (t) => dir * (0.9 - 2 * t));
    const lk = async (i, t, g) => [at(L.toStereo(latch(`udl${i}`, { f: 2200, ping: 3000 - i * 300, low: 180 + i * 30 })), t, g), at(L.toStereo(strike(await src(S.metalH(i + 1), 0, 0.5, { hp: 120, semis: -3 - i }))), t, g - 2)];
    const zap = env(L.fm(0.35, { carrier: (t) => 300 + 900 * (t / 0.35), ratio: 2.5, index: 3, indexDecay: 1 }), (t) => smooth(t / 0.3) * (t > 0.3 ? Math.exp(-(t - 0.3) * 40) : 1));
    const parts = [at(sw('uds1', -1), 0, -6), at(sw('uds2', 1), 0.05, -6), ...(await lk(0, 0.33, -6)), ...(await lk(1, 0.43, -6)), ...(await lk(2, 0.58, -1)),
      at(L.toStereo(nrm(L.thump({ f0: 180, f1: 70, decay: 0.15, click: 0.3, drive: 2, seed: 'udt' }))), 0.58, -4), at(L.toStereo(nrm(zap)), 0.6, -14), at(L.toStereo(L.crackle(0.35, { density: 120, decay: 0.0015, hp: 3000, seed: 'udc' })), 0.62, -20)];
    const m = cut(L.mix(parts, { channels: 2, length: D }), D, 0.3);
    await put(cat, 'yanshu_ult_dock', [m], SP2([8, 80], { lufs: -15, mmax: -13, voices: 1, pitch: [1, 1], priority: 3 }));
  }
  // yanshu_ult_giant (0.15 s after the dock, to the 破限's end ~1.85 s later): the triple beam's 轟鳴 — a 0.25 s charge
  // climbing, the ignition (boom + crack), then the roar held: a B♭0 / B♭1 / F1 growl, a rocket's roar and a burning car
  // under it, the sizzle, a three-voice whine (B♭5 D6 F6: three muzzles); faded out by 2.1 s
  {
    const D = 2.3, T = 0.25;
    const charge = env(powerHum(T, (t) => N.Bb1 * (0.6 + 0.4 * (t / T)), { lp: [[0, 400], [T, 3000]], drive: 5 }), (t) => (t / T) ** 2);
    const growl = env(powerHum(D - T, N.Bb1, { lp: (t) => 1300 + 300 * Math.sin(2 * Math.PI * 2.5 * t), drive: 7, harm: [[1, 0], [0.5, -2], [0.75, -5], [2, -4]] }), (t) => smooth(t / 0.03) * (t > 1.5 ? Math.exp(-(t - 1.5) * 6) : 1));
    const rk = env(await src(S.launch, 1.0, 1.0 + D - T, { stereo: true, hp: 40 }), (t) => smooth(t / 0.05) * (t > 1.5 ? Math.exp(-(t - 1.5) * 6) : 1));
    const car = env(await src(S.carFire, 12, 12 + D - T, { stereo: true, hp: 40 }), (t) => smooth(t / 0.1) * (t > 1.5 ? Math.exp(-(t - 1.5) * 6) : 1));
    const siz = env(await src(S.sizzle, 40, 40 + D - T, { hp: 1800 }), (t) => smooth(t / 0.05) * (t > 1.5 ? Math.exp(-(t - 1.5) * 6) : 1));
    const tri = env(L.mix([N.Bb5, N.D6, N.F6].map((f, i) => at(L.fm(D - T, { carrier: (t) => f * (1 + 0.004 * Math.sin(2 * Math.PI * (5 + i) * t)), ratio: 2, index: 0.6, indexDecay: 9 }), 0, -i * 2))), (t) => smooth(t / 0.15) * (t > 1.5 ? Math.exp(-(t - 1.5) * 6) : 1));
    const parts = [at(L.toStereo(latch('ugk', { f: 2400, ping: 3200, low: 200 })), 0, -10), at(L.toStereo(charge), 0, -6), at(L.toStereo(boom('ugb', { f0: 60, f1: 30, sweep: 0.1, decay: 1.0, drive: 3.5, amount: -3 })), T), at(L.toStereo(nrm(L.noiseBurst({ dur: 0.05, attack: 0.0003, decay: 0.015, hp: 1500, seed: 'ugc' }))), T, -4),
      at(L.stereoize(growl, { width: 0.3, hp: 300, seed: 'ugg' }), T, -2), at(rk, T, -6), at(car, T, -9), at(L.stereoize(siz, { width: 0.5, hp: 1500, seed: 'ugs' }), T, -14), at(L.stereoize(nrm(tri), { width: 0.5, hp: 600, seed: 'ugt' }), T, -20),
      at(L.toStereo(airwave(1.2, { f0: 3000, f1: 100, fall: 0.14, seed: 'uga' })), T, -6)];
    const m = L.psychoBass(cut(L.mix(parts, { channels: 2, length: D }), D, 0.2), { freq: 110, amount: -4 });
    keep.giant = [m];
    await put(cat, 'yanshu_ult_giant', [m], SP2([10, 160], { lufs: -11, mmax: -9, voices: 1, pitch: [1, 1], priority: 3, maxLimitDb: 6 }));
  }
  // yanshu_ult_end (破限 ends, 0.9, 2D; yanshu_cool plays the fins / doors / steam with it): §1.12 release — the beam
  // cut off (a growl collapsing), the furnace's long deflating breath (a steam sigh falling), the chord resolving on a
  // low B♭ (tuba + trombone) and dying
  {
    const D = 2.6;
    const cutoff = env(powerHum(0.7, (t) => N.Bb1 * (1 - 0.5 * smooth(t / 0.6)), { lp: [[0, 2000], [0.6, 120]], drive: 5 }), (t) => Math.exp(-t * 3.5));
    const sigh = endFade(env(L.sweep(L.noise(1.8, { color: 'white', seed: 'ues' }), 'bp', (t) => 4200 * (0.3 + 0.7 * Math.exp(-t / 0.6)), { q: 0.7 }), (t) => smooth(t / 0.06) * Math.exp(-t * 1.9)), 0.5);
    const low = L.mix([at(await src(S.tubaBb1, 0.3, 2.6, { hp: 30 })), at(await src(S.tbnF2, 0.3, 2.6, { hp: 40 }), 0, -4)]);
    const res = env(nrm(low), (t) => smooth(t / 0.4) * Math.exp(-Math.max(0, t - 0.5) * 1.8));
    const m = cut(L.mix([at(L.stereoize(cutoff, { width: 0.25, hp: 300, seed: 'uec' })), at(L.stereoize(nrm(sigh), { width: 0.5, hp: 800, seed: 'uesx' }), 0.05, -6), at(L.stereoize(res, { width: 0.3, hp: 200, seed: 'uer' }), 0.25, -8)], { channels: 2, length: D }), D, 0.3);
    keep.ultEnd = [m];
    await put(cat, 'yanshu_ult_end', [m], D2({ lufs: -16, mmax: -14, voices: 1, pitch: [1, 1] }));
  }

  // ready_yanshu (破限 ready: the fanfare at 1, then a reminder at 0.25 every 2.5 s; unique in the game): the core
  // flashes — the furnace's 「轟」 breath — an anvil 「ting」 on B♭6, the 數位雙音 F6 -> B♭6 (the same two notes as
  // yanshu_ready_beep, which can land on it) and the falcon drones' 「kee」 as their eyes turn gold
  {
    const rd = [0, 1].map((k) => k);
    const out = [];
    for (const k of rd) {
      const ign = cut(strike(await src(S.combust, 0, 1.0, { hp: 60 })), 0.7, 0.6);
      const whomp = nrm(L.mix([at(ign), at(nrm(L.thump({ f0: 140, f1: N.Bb1, sweep: 0.03, decay: 0.3, click: 0, drive: 2, seed: `rdt${k}` })), 0, -5)]));
      const ting = anvil(N.Bb6 * (1 + k * 0.002), 1.2, { t60: 0.6, seed: `rda${k}`, bright: -2, splash: -14 });
      const two = L.mix([at(beep(N.F6, 0.07, { h3: -14 })), at(beep(N.Bb6, 0.11, { h3: -14 }), 0.085)]);
      const cry = kee(`rdk${k}`, { f: 2900 * (1 + k * 0.03) });
      let m = L.mix([at(L.stereoize(whomp, { width: 0.3, hp: 300, seed: `rdw${k}` }), 0, -8), at(L.toStereo(ting), 0.02, -3), at(L.toStereo(two), 0.1, -6), at(cry, 0.3, -13, k ? 0.35 : -0.35)], { channels: 2, length: 1.5 });
      m = cut(space(m, FORGE, { wet: 0.22, seed: `rdf${k}`, length: 1.4 }), 1.5, 0.4);
      out.push(m);
    }
    keep.ready = out;
    await put(cat, 'ready_yanshu', out, D2({ lufs: -18, mmax: -14, bus: 'ui', voices: 2, pitch: [1, 1], priority: 3, note: 'unique ready (§1.12): furnace 轟 + anvil ting + 數位雙音 + falcon kee' }));
  }

  // yanshu_crisis (爐壁護盾, positional for others): the killing blow lands (a steel BANG), the six fins fly in and lock
  // into the hex wall (0.12: a double clack, a ceramic ring), the wall heats red (a sizzle and a groan rising), and at
  // 0.85 it bursts — 瓷器碎裂 (ceramic + steel shards) with a fire 「轟」 — then the flames' tail
  {
    const D = 2.6;
    const bang = L.mix([at(strike(await src(S.clangDeep, 0, 1.12, { hp: 40 }))), at(strike(await src(S.metalBang, 0, 1.2, { hp: 60 })), 0, -4), at(boom('crb', { f0: 90, f1: 45, decay: 0.45, amount: -4 }), 0, -3)]);
    const fly = [];
    for (let i = 0; i < 6; i++) fly.push(at(panMove(L.whoosh({ dur: 0.11, f0: 800, f1: 2400, q: 2, seed: `crf${i}` }), () => -0.9 + i * 0.36), i * 0.008, -10));
    const lock = L.mix([at(latch('crl1', { f: 2100, ping: 2800, low: 200 })), at(latch('crl2', { f: 2300, ping: 3100, low: 220 }), 0.03, -2), at(nrm(modal(1750, 0.4, { list: PLATE, t60: 0.2, seed: 'crp' })), 0.03, -6)]);
    const heat = L.mix([at(env(await src(S.sizzle, 60, 60.8, { hp: 1500 }), (t) => (t / 0.73) ** 1.5)), at(env(await src(S.groan, 0.1, 0.9, { hp: 150 }), (t) => smooth(t / 0.5)), 0, -6),
      at(env(powerHum(0.75, (t) => N.Bb2 * (1 + 0.5 * (t / 0.75)), { lp: [[0, 300], [0.75, 1800]], drive: 4 }), (t) => (t / 0.75) ** 2), 0, -8)]);
    const shatter = L.mix([at(strike(await src(S.plate, 0, 1.6, { hp: 150 }))), at(strike(await src(S.glassHit, 0, 0.65, { hp: 300 })), 0.004, -6), at(strike(await src(S.metalL(2), 0, 0.4, { hp: 300 })), 0.02, -8),
      at(strike(await src(S.metalL(4), 0, 0.4, { hp: 300, semis: 2 })), 0.07, -10), at(strike(await src(S.combust, 0, 1.8, { hp: 50 })), 0.01, -3), at(boom('crs', { f0: 80, f1: 38, decay: 0.6, amount: -4 }), 0, -4)]);
    const tail = env(await src(S.stove, 44, 45.8, { stereo: true, hp: 300 }), (t) => smooth(t / 0.2) * Math.exp(-t * 1.6));
    let m = L.mix([at(L.toStereo(bang)), ...fly, at(L.toStereo(lock), 0.12, -4), at(L.toStereo(heat), 0.12, -10), at(L.stereoize(shatter, { width: 0.5, hp: 300, seed: 'crx' }), 0.85, -1),
      at(L.stereoize(sparks(0.8, { seed: 'crk', density: 220, pings: 14 }), { width: 0.6, hp: 2000, seed: 'crkx' }), 0.86, -10), at(tail, 1.0, -14)], { channels: 2, length: D });
    m = L.psychoBass(cut(m, D, 0.3), { freq: 110, amount: -5 });
    await put(cat, 'yanshu_crisis', [m], SP2([8, 90], { lufs: -12, mmax: -10, voices: 1, pitch: [1, 1], priority: 3, maxLimitDb: 6, note: 'voices 1: crisis.js and the yanshu_crisis fx both play it at the same instant' }));
  }
  // yanshu_final (KE_FINAL, the wave's last kill, positional, 0.9): a forge strike there — the anvil on B♭4 / B♭5, the
  // boom, a column of forge light rising (a shimmer climbing, the fire roaring up), the holo ring
  {
    const fin = [];
    for (let k = 0; k < 2; k++) {
      const D = 1.9;
      const rise = env(L.fm(1.0, { carrier: (t) => 800 * 4 ** t, ratio: 1.5, index: 1.2, indexDecay: 1 }), (t) => Math.sin(Math.PI * clamp(t, 0, 1)) ** 0.8);
      const fire = env(strike(await src(S.combust, 0, 1.8, { hp: 60 })), (t) => Math.exp(-t * 1.6));
      const m = L.mix([at(anvil(N.Bb4, D, { t60: 1.2, seed: `fa${k}`, splash: -7 })), at(anvil(N.Bb5, D, { t60: 0.9, seed: `fb${k}`, splash: -10 }), 0.004, -6), at(boom(`fbm${k}`, { f0: 85, f1: 42, decay: 0.6, amount: -4 }), 0, -3),
        at(nrm(rise), 0.05, -14), at(cut(fire, 1.6, 0.5), 0.02, -6), at(holo(0.5, N.F6, N.F7, { seed: `fh${k}` }), 0.06, -14)], { length: D });
      fin.push(cut(m, D, 0.4));
    }
    await put(cat, 'yanshu_final', fin, SP([8, 100], { lufs: -13, mmax: -11, voices: 1, pitch: [1, 1], priority: 2 }));
  }
}

// ------------------------------------------------------------------------------------------------ twin
/** 焰樞．零度 (§1.12 雙生版): the originals -4 st, darker, a dotted echo, and a frost glitter over them. */
async function twinSet(cat, keep) {
  ctx.log('-- twin');
  const T = (b, seed, frost = -24) => {
    let o = L.varispeedSemis(L.setChannels(b, 2), -4);
    o = L.eq(o, [{ type: 'lp', f: 6500, order: 2 }, { type: 'peak', f: 380, gain: 1.5, q: 0.8 }, { type: 'highshelf', f: 3500, gain: -2 }]);
    o = L.saturate(o, { drive: 3, type: 'tube', mix: 0.3 });
    const r = L.rng(L.hashSeed(seed)), gl = [];
    for (let i = 0; i < 14; i++) gl.push(at(nrm(L.partials(0.25, { base: 3000 * 2.4 ** r.next(), list: [[1, 1, 0.09], [2.41, 0.35, 0.05]], seed: seed + i })), r.next() ** 1.5 * Math.min(1.2, o.duration * 0.6), -r.next() * 10, r.range(-0.7, 0.7)));
    const glit = L.mix(gl, { channels: 2 });
    o = L.mix([at(o), { buf: glit, gainLin: rmsOf(o) / Math.max(1e-9, rmsOf(glit)) * L.db2lin(frost) }], { channels: 2 });
    return L.echo(o, { time: 0.21, feedback: 0.36, lp: 2600, hp: 180, mix: 0.4, pingpong: true, length: o.duration + 0.9 });
  };
  if (keep.ready) await put(cat, 'ready_yanshu_zero', keep.ready.map((b, i) => T(b, `zr${i}`)), D2({ lufs: -18, mmax: -14, bus: 'ui', voices: 2, pitch: [1, 1], priority: 3, maxHeadMs: 300, note: 'twin 焰樞．零度 (reserved)' }));
  if (keep.fire) await put(cat, 'yanshu_fire_zero', keep.fire.map((b, i) => cut(T(b, `zf${i}`, -20), 1.2, 0.5)), D2({ lufs: -15, mmax: -15, voices: 3, pitch: [0.997, 1.003], note: 'twin (reserved)' }));
  // (-4 st stretches the riser / charge heads by 26 %: 20 ms of soft lead-in, allowed)
  if (keep.chord) await put(cat, 'yanshu_ult_chord_zero', keep.chord.map((b, i) => T(b, `zc${i}`)), SP2([10, 140], { lufs: -13, mmax: -9.5, voices: 1, pitch: [1, 1], priority: 3, maxHeadMs: 40, note: 'twin (reserved)' }));
  if (keep.giant) await put(cat, 'yanshu_ult_giant_zero', keep.giant.map((b, i) => T(b, `zg${i}`)), SP2([10, 160], { lufs: -11, mmax: -9, voices: 1, pitch: [1, 1], priority: 3, maxLimitDb: 6, maxHeadMs: 40, note: 'twin (reserved)' }));
  if (keep.ultEnd) await put(cat, 'yanshu_ult_end_zero', keep.ultEnd.map((b, i) => T(b, `ze${i}`)), D2({ lufs: -16, mmax: -14, voices: 1, pitch: [1, 1], note: 'twin (reserved)' }));
}

// ------------------------------------------------------------------------------------------------ references
/** Five shots, the overload sequence and the 破限 as the player hears them (handler volumes, manifest vol, code
 *  pitches): logged + previewed (tools/audio/out/premium_yanshu/preview). */
function references(keep) {
  const lv = (name, b, codeVol = 1, pitch = 1, spatialDb = 0) => {
    const m = META[name]; if (!m || !b) return null;
    let x = L.normalizeLufs(L.setChannels(b, m.ch), m.lufs, { ceiling: -1 });
    if (pitch !== 1) x = L.varispeed(x, pitch);
    return { buf: L.setChannels(x, 2), gainLin: m.vol * codeVol * (m.ch === 1 ? Math.SQRT1_2 : 1) * L.db2lin(spatialDb) };
  };
  const log = (name, b) => { const q = L.loudness(b); ctx.log(`  ${name}: ${q.integrated.toFixed(1)} LUFS integrated, momentary max ${q.momentaryMax.toFixed(1)}, short-term max ${q.shortTermMax.toFixed(1)}, peak ${L.lin2db(L.peak(b)).toFixed(1)} dBFS`); ctx.preview(name, b); };
  if (keep.close && keep.tail && keep.fire) {
    const parts = [];
    for (let i = 0; i < 5; i++) {
      const t = i * 0.2;
      parts.push({ ...lv('yanshu_close', keep.close[i % keep.close.length]), at: t }, { ...lv('yanshu_tail', keep.tail[i % keep.tail.length], 0.9), at: t + 0.015 },
        { ...lv('yanshu_fire', keep.fire[i % keep.fire.length], 0.35), at: t }, { ...lv('yanshu_hit', keep.hit?.[i % 4], 0.3), at: t + 0.03 });
      if (keep.mech) parts.push({ ...lv('yanshu_mech', keep.mech[i % keep.mech.length], 0.8), at: t });
    }
    log('ref_five_shots', L.mix(parts.filter((p) => p.buf), { channels: 2 }));
  }
  if (keep.ring && keep.inhale && keep.strike && keep.beamStart && keep.beamLoop) {
    const loop = L.concat([keep.beamLoop, keep.beamLoop]);
    const parts = [{ ...lv('yanshu_ring', keep.ring[0]), at: 0 }, { ...lv('yanshu_inhale', keep.inhale[0]), at: 0.7 }, { ...lv('yanshu_strike', keep.strike[0]), at: 1.12 },
      { ...lv('yanshu_beam_start', keep.beamStart[0], 0.9), at: 2.0 }, { ...lv('yanshu_beam_loop', L.slice(loop, 0, 2.0), 0.7), at: 2.0 }, { ...lv('yanshu_beam_end', keep.beamEnd?.[0], 0.7), at: 4.0 },
      { ...lv('yanshu_ram_jet', keep.ramJet?.[0]), at: 4.6 }, { ...lv('yanshu_ram_slam', keep.ramSlam?.[0]), at: 4.95 }, { ...lv('yanshu_cool', keep.cool?.[0], 0.8), at: 6.4 }];
    log('ref_overload', L.mix(parts.filter((p) => p.buf), { channels: 2 }));
  }
  if (keep.seal && keep.chord && keep.giant && keep.ultEnd) {
    const parts = [{ ...lv('yanshu_seal_snap', keep.seal[0]), at: 0 }, { ...lv('yanshu_ult_chord', keep.chord[0]), at: 0.1 }, { ...lv('yanshu_ult_giant', keep.giant[0]), at: 4.9 },
      { ...lv('yanshu_ult_end', keep.ultEnd[0], 0.9), at: 6.75 }, { ...lv('yanshu_cool', keep.cool?.[0], 0.8), at: 6.75 }];
    log('ref_unbound', L.mix(parts.filter((p) => p.buf), { channels: 2 }));
  }
}

// ------------------------------------------------------------------------------------------------ produce
export async function produce(lib, c) {
  L = lib; ctx = c; K = makeKit(lib, ctx);
  const only = process.env.YS_ONLY ? new Set(process.env.YS_ONLY.split(',').map((s) => s.trim())) : null;
  if (only && !process.env.CF_AUDIO_OUT) throw new Error('YS_ONLY writes a partial category: set CF_AUDIO_OUT to a scratch folder');
  const want = (g) => !only || only.has(g);
  const cat = ctx.category('premium_yanshu', { bus: 'sfx' });
  const keep = {};
  if (want('gun')) await gunSet(cat, keep);
  if (want('theme')) await themeSet(cat, keep);
  if (want('view')) await viewSet(cat, keep);
  if (want('reload')) await reloadSet(cat, keep);
  if (want('skills')) await skillSet(cat, keep);
  if (want('ult') || want('twin')) await ultSet(cat, keep);
  if (want('twin')) await twinSet(cat, keep);
  references(keep);
  await cat.write();
}
