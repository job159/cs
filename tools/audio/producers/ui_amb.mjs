// UI, match feedback, stingers and ambience beds — category 'ui_amb' (game/assets/audio/ui_amb/ + manifest.ui_amb.json).
//
//   menu UI      ui_click ui_back ui_open ui_buy ui_deny ui_equip money countdown_tick objective
//   combat HUD   hitmarker hitmarker_head killmarker headshot_kill          (research 03 §4.9: tick / metal ding / thick
//                                                                            thump + low end, audible over -12 LUFS guns)
//                killmark_ding xh_node                                       (pitched by ui/killmarks.js and ui/hud.js)
//   stingers     level_up round_start round_win round_lose boss_warning revive_done achievement
//   world        supply_drop (helicopter pass + crate drop, spatial, timed to match.js: lands 0.65 s, bounces 0.98 s)
//   ambience     amb_city_dead amb_harbor_wind amb_fire amb_warehouse amb_rain   (seamless stereo loops, -30 LUFS)
//
// UI and HUD sounds are designed (synthesis) around real mechanical / coin / cloth recordings; stingers are designed
// (synth brass + metal hits + booms + real siren); ambience beds are layered CC0 field recordings with events placed
// on a circular timeline (wrap-around add) so every loop is sample-exact seamless.
// Set UI_AMB_ONLY=name1,name2 to build a subset while iterating (use build.mjs --out <dir> so the real manifest stays).

let L;            // lib
let SR = 48000;

// ------------------------------------------------------------------------------------------------ small helpers
const at = (buf, t = 0, gain = 0, pan) => (pan === undefined ? { buf, at: t, gain } : { buf, at: t, gain, pan });
const lvl = (b, target) => { const l = L.lufs(b); return Number.isFinite(l) ? L.gain(b, target - l) : b; };
/** Density stage for short one-shots: peaks pushed `drive` dB into a soft clipper (lower crest -> little limiting). */
const dense = (b, drive = 6, threshold = -6) => L.softClip(L.gain(L.normalizePeak(b, 0), drive), { threshold, ceiling: -1 });

// impulse responses are expensive to synthesize: build each (env, seed, channels, length) once
const IRS = new Map();
function ir(env, seed = env, channels = 2, length) {
  const k = `${env}|${seed}|${channels}|${length}`;
  if (!IRS.has(k)) IRS.set(k, L.makeIR(env, { seed, channels, length }));
  return IRS.get(k);
}
/** Convolution reverb with a cached IR; crop (s) trims the output (the IR tail would otherwise lengthen one-shots). */
function rv(b, env, { wet = 0.2, dry = 1, seed = env, channels = 2, length, crop } = {}) {
  const o = L.convolve(b, ir(env, seed, channels, length), { wet, dry });
  return crop ? L.slice(o, 0, Math.min(crop, o.duration)) : o;
}

/** Bank of decaying sine partials (mono). list: [[Hz, amp, t60, { at, attack, glide, glideT }]] */
function bank(dur, list, seed = 'bank') {
  const n = Math.round(dur * SR), o = new Float32Array(n), r = L.rng(seed);
  for (const [f, a, t60, opt = {}] of list) {
    const att = opt.attack ?? 0.0006, k = 6.907755 / t60, g = opt.glide ?? 0, gT = opt.glideT ?? 0.02;
    const i0 = Math.round((opt.at ?? 0) * SR);
    let ph = r.next();
    for (let i = i0; i < n; i++) {
      const t = (i - i0) / SR;
      ph += (f * (1 + g * Math.exp(-t / gT))) / SR;
      if (ph > 1) ph -= Math.floor(ph);
      o[i] += Math.sin(2 * Math.PI * ph) * a * Math.exp(-k * t) * (t < att ? Math.sin((t / att) * Math.PI / 2) : 1);
    }
  }
  return new L.Buf([o], SR);
}

/** Bell / struck-metal partial set. kind: 'bell' (church-ish minor third), 'bar' (free bar), 'chime' (tubular), 'plate'. */
const BELL = {
  bell: [[0.5, 0.35, 1.6], [1, 1, 1.0], [1.19, 0.45, 0.8], [1.5, 0.3, 0.6], [2, 0.5, 0.5], [2.5, 0.22, 0.35], [3.0, 0.18, 0.28], [4.2, 0.1, 0.2]],
  bar: [[1, 1, 1], [2.756, 0.5, 0.45], [5.404, 0.25, 0.22], [8.933, 0.1, 0.12]],
  chime: [[1, 1, 1], [2.0, 0.3, 0.7], [3.01, 0.42, 0.5], [4.16, 0.28, 0.35], [5.43, 0.16, 0.22], [6.79, 0.08, 0.15]],
  plate: [[1, 1, 1], [1.47, 0.7, 0.8], [2.09, 0.55, 0.6], [2.56, 0.4, 0.45], [3.18, 0.3, 0.35], [4.02, 0.2, 0.25]],
};
function bell(base, { kind = 'chime', t60 = 0.8, amp = 1, dur, seed = 'bell', detune = 0.002 } = {}) {
  const r = L.rng(seed);
  const list = BELL[kind].map(([ratio, a, tk]) => [base * ratio * (1 + r.range(-detune, detune)), a * amp, Math.max(0.01, tk * t60)]);
  return bank(dur ?? t60 * 1.3 + 0.02, list, seed);
}

/** Cut everything before the first sample within `db` of the peak (minus 2 ms) — removes pre-noise before a hit. */
function startAt(b, db = -30) {
  const th = L.peak(b) * L.db2lin(db);
  let i0 = b.length;
  for (const d of b.data) for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > th) { i0 = Math.min(i0, i); break; }
  return L.fadeIn(L.sliceSamples(b, Math.max(0, i0 - Math.round(0.002 * SR)), b.length), 0.0015);
}

/** Short filtered noise click (attack 0.2 ms). */
const tick = ({ dur = 0.02, hp = 2000, lp = 12000, t60 = 0.006, seed = 'tick', color = 'white' } = {}) =>
  L.noiseBurst({ dur, hp, lp, decay: t60, attack: 0.0002, seed, color });

/** Military handset: band-limited, driven, a little honky. */
function radio(b, { drive = 10, lo = 380, hi = 3200 } = {}) {
  let x = L.eq(b, [{ type: 'hp', f: lo, order: 4 }, { type: 'lp', f: hi, order: 4 }, { type: 'peak', f: 1800, gain: 4, q: 1.3 }]);
  x = L.saturate(x, { drive, type: 'tube' });
  return L.eq(x, [{ type: 'hp', f: lo * 0.9, order: 2 }, { type: 'lp', f: hi * 1.25, order: 2 }]);
}

/**
 * Synth brass section. notes: [{ f, at, dur, amp (dB), glide: [[t, semis]...] }]. Detuned band-limited saws per
 * note, a filter envelope that opens on the attack ("blat") and settles, slow vibrato, formant EQ and tube drive.
 */
function brass(notes, { attack = 0.05, bright = 7, brightT = 0.3, sustain = 2.4, floorHz = 0, brightHz = 0, voices = 5, detune = 9, vib = 0.0035, seed = 'brass', release = 0.5, drive = 8, growl = 0 } = {}) {
  const r = L.rng(seed);
  const layers = [];
  for (const nt of notes) {
    const d = nt.dur;
    const glide = nt.glide ? L.toFn(nt.glide) : null;
    const parts = [];
    for (let v = 0; v < voices; v++) {
      const cents = (voices > 1 ? (v / (voices - 1)) * 2 - 1 : 0) * detune + r.range(-1.5, 1.5);
      const ratio = Math.pow(2, cents / 1200), vr = 4.6 + r.range(-0.6, 0.6), vp = r.next() * 6.283;
      const fFn = (t) => nt.f * ratio * (glide ? Math.pow(2, glide(t) / 12) : 1) * (1 + vib * Math.min(1, t / 0.35) * Math.sin(6.283 * vr * t + vp));
      parts.push({ buf: L.tone(d, { type: 'saw', freq: fFn, phase: r.next() }), gainLin: 1 / Math.sqrt(voices) });
    }
    let x = L.mix(parts);
    const a = nt.attack ?? attack;
    const env = (t) => (t < a ? t / a : Math.exp(-(t - a) / brightT));
    const cut = (t) => Math.min(16000, Math.max(nt.f * (1 + sustain), floorHz) + (nt.f * bright + brightHz) * env(t));
    x = L.sweep(x, 'lp', cut, { q: 0.85 });
    x = L.sweep(x, 'lp', (t) => cut(t) * 1.4, { q: 0.6 });
    const rel = Math.min(nt.release ?? release, d * 0.7);
    x = L.applyEnv(x, L.envCurve(d, [[0, 0], [a, 1], [a + 0.18, 0.8], [Math.max(a + 0.2, d - rel), 0.66], [d, 0]]));
    if (growl > 0) { const gr = 26 + r.range(-3, 3); x = L.automate(x, (t) => 1 - growl * (0.5 + 0.5 * Math.sin(6.283 * gr * t)) * Math.exp(-t / 0.9)); }
    layers.push({ buf: x, at: nt.at || 0, gain: nt.amp || 0 });
  }
  let out = L.mix(layers);
  out = L.eq(out, [{ type: 'hp', f: 38, order: 2 }, { type: 'peak', f: 620, gain: 3, q: 1.0 }, { type: 'peak', f: 1350, gain: 2, q: 1.3 }, { type: 'highshelf', f: 5000, gain: -4 }]);
  return L.saturate(out, { drive, type: 'tube', mix: 0.55 });
}

/** Exponential riser of swept band-passed noise (ends at `dur`, peak at the end). */
function riser(dur, { f0 = 400, f1 = 5000, q = 1.4, color = 'pink', seed = 'riser', power = 2.5 } = {}) {
  let b = L.noise(dur, { color, seed });
  b = L.sweep(b, 'bp', (t) => f0 * Math.pow(f1 / f0, t / dur), { q });
  return L.applyEnv(b, L.envCurve(dur, (t) => Math.pow(Math.max(0, t / dur), power)));
}

/** Circular add (seamless loops): adds src into dst at t seconds, wrapping past the end. Mutates dst. */
function wrapAdd(dst, src, t, gainDb = 0, panPos) {
  let s = src;
  if (panPos !== undefined && dst.channels === 2) s = L.pan(L.toMono(s), panPos);
  else if (s.channels !== dst.channels) s = L.setChannels(s, dst.channels);
  const g = L.db2lin(gainDb), n = dst.length, o = ((Math.round(t * SR) % n) + n) % n;
  for (let c = 0; c < dst.channels; c++) {
    const d = dst.data[c], x = s.data[Math.min(c, s.channels - 1)];
    for (let i = 0; i < x.length; i++) d[(o + i) % n] += x[i] * g;
  }
}

/** Put a sound at a distance in a space: air absorption + reflections (stereo out). */
function distant(b, { metres = 150, env = 'urban', wet = 0.6, dry = 0.7, seed = 'dist', lp, hp = 60, irLength } = {}) {
  let x = L.airAbsorption(L.toMono(b), metres);
  const specs = [{ type: 'hp', f: hp, order: 2 }];
  if (lp) specs.push({ type: 'lp', f: lp, order: 2 });
  x = L.eq(x, specs);
  return L.convolve(x, ir(env, seed, 2, irLength), { wet, dry });
}

/**
 * Master a short one-shot to `lufs` as it will measure AFTER Vorbis encoding: Vorbis q0.5 shaves 0.5-1.5 dB of
 * (K-weighted) loudness off sub-0.3 s high-frequency clicks. Encode once, measure the decoded loss, pre-compensate.
 * Use with cat.add(..., { lufs, normalize: false }) (cat.add still QA-checks the decoded file against lufs).
 */
async function codecTrim(b, lufs, channels = 1) {
  let m = L.finalize(b, { lufs, ceiling: -1.4, channels });
  const dec = await L.decodeBytes(await L.encodeOgg(m, { quality: 0.5 }), 'trim.ogg');
  const loss = lufs - L.lufs(dec);
  if (Math.abs(loss) > 0.1) {
    m = L.gain(m, loss);
    if (L.truePeakDb(m) > -1.4) m = L.limit(m, { ceiling: -1.4 });
  }
  return m;
}

// ================================================================================================ produce
export async function produce(lib, ctx) {
  L = lib; SR = lib.SR;
  const only = process.env.UI_AMB_ONLY ? new Set(process.env.UI_AMB_ONLY.split(',')) : null;
  const want = (n) => !only || only.has(n);
  const cat = ctx.category('ui_amb', { bus: 'ui', spatial: false, pitch: [1, 1], priority: 2 });
  const load = (id, o = {}) => ctx.load(id, o);
  const mono = async (id, o = {}) => load(id, { ...o, channels: 1 });
  const add = async (name, make, opts) => {
    if (!want(name)) return;
    let bufs = typeof make === 'function' ? await make() : make;
    bufs = Array.isArray(bufs) ? bufs : [bufs];
    const lufs = opts.lufs ?? L.TARGETS[opts.target];
    // short one-shots: pre-compensate the codec's loudness loss (see codecTrim)
    if (!opts.loop && lufs !== undefined && bufs.every((b) => b.duration < 0.35)) {
      const ch = opts.channels ?? ((opts.spatial ?? cat.defaults.spatial) ? 1 : undefined);
      const trimmed = [];
      for (const b of bufs) trimmed.push(await codecTrim(b, lufs, ch)); // sequential: one WASM encoder
      bufs = trimmed;
      opts = { ...opts, lufs, normalize: false };
    }
    // Windows: a file the game's dev server / a browser is reading can refuse the atomic rename (EPERM/EBUSY) for a
    // moment -- wait and retry the whole sound (cat.add only registers it once every variant is written)
    for (let attempt = 1; ; attempt++) {
      try { await cat.add(name, bufs, opts); return; } catch (e) {
        if (!/EPERM|EBUSY|EACCES/.test(e.code || '') || attempt >= 6) throw e;
        ctx.warn(`${name}: ${e.code} writing a file, retry ${attempt}/5`);
        cat.reports = cat.reports.filter((r) => r.sound !== name);
        await new Promise((res) => setTimeout(res, 1500 * attempt));
      }
    }
  };

  // ---------------------------------------------------------------------------------------------- menu UI
  // A hardware push-switch: press (bright tick + damped metal partials + small body) and a quieter release.
  const uiClick = (k, { pitch = 1, body = 610, release = true } = {}) => {
    const r = ctx.rng(`click${k}`), j = pitch * (1 + r.range(-0.025, 0.025));
    const press = L.mix([
      tick({ dur: 0.02, hp: 2600, lp: 11000, t60: 0.0045, seed: `ck${k}` }),
      at(bank(0.06, [[2350 * j, 0.55, 0.028], [3720 * j, 0.42, 0.02], [5950 * j, 0.22, 0.012], [body * j, 0.5, 0.022, { glide: 0.08 }]], `ckb${k}`), 0, -5),
    ]);
    const rel = L.mix([tick({ dur: 0.012, hp: 3500, lp: 12000, t60: 0.003, seed: `ckr${k}` }), at(bank(0.03, [[3080 * j, 0.4, 0.014], [4790 * j, 0.3, 0.009]], `ckrb${k}`), 0, -5)]);
    let b = L.mix([press, release ? at(rel, 0.019 + r.range(0, 0.007), -10) : null].filter(Boolean), { length: 0.08 });
    return L.fadeOut(dense(b, 7), 0.025);
  };
  await add('ui_click', () => [0, 1, 2].map((k) => uiClick(k)), { target: 'ui', voices: 3 });

  // back: two descending clacks, lower and softer than a click (reads as "closing")
  const uiBack = (k) => {
    const r = ctx.rng(`back${k}`), j = 1 + r.range(-0.02, 0.02);
    const a = L.mix([tick({ dur: 0.02, hp: 1600, lp: 8500, t60: 0.005, seed: `bka${k}` }), at(bank(0.07, [[1680 * j, 0.5, 0.03], [2650 * j, 0.32, 0.02], [440 * j, 0.55, 0.03, { glide: 0.12 }]], `bkab${k}`), 0, -4)]);
    const b = L.mix([tick({ dur: 0.016, hp: 1200, lp: 6000, t60: 0.004, seed: `bkb${k}` }), at(bank(0.07, [[1240 * j, 0.5, 0.03], [1960 * j, 0.3, 0.02], [330 * j, 0.55, 0.035]], `bkbb${k}`), 0, -4)]);
    return L.fadeOut(dense(L.mix([a, at(b, 0.05, -2)], { length: 0.14 }), 7), 0.035);
  };
  await add('ui_back', () => [0, 1].map(uiBack), { target: 'ui', voices: 2 });

  // open: short slide (swept noise) into a bright latch
  const uiOpen = (k) => {
    const d = 0.15;
    let slide = L.sweep(L.noise(d, { color: 'pink', seed: `slide${k}` }), 'bp', (t) => 900 * Math.pow(4.2, t / d), { q: 1.8 });
    slide = L.applyEnv(slide, L.envCurve(d, [[0, 0.05], [0.1, 1], [d, 0]]));
    return L.fadeOut(dense(L.mix([at(slide, 0, -5), at(uiClick(10 + k, { pitch: 1.12, body: 700 }), 0.118, -3)], { length: 0.25 }), 4), 0.05);
  };
  await add('ui_open', () => [0, 1].map(uiOpen), { target: 'ui', voices: 2 });

  // buy: "ka-ching", military: a real charging-handle slam (the "ka") + coin spill + a double bell ("ching")
  if (want('ui_buy')) {
    const slam = L.hp(await mono('fs:632822', { start: 0.235, end: 0.5 }), 120, 2);
    const coins = L.hp(await mono('fs:184372', { start: 0.32, end: 0.95 }), 1200, 2);
    const vars = [];
    for (let k = 0; k < 2; k++) {
      const base = [2349, 2217][k];
      const ching = L.mix([at(bell(base, { kind: 'chime', t60: 0.42, seed: `ching${k}` })), at(bell(base * 1.335, { kind: 'chime', t60: 0.5, seed: `ching2${k}` }), 0.07, -2)]);
      let b = L.mix([
        at(L.fadeOut(lvl(slam, -16), 0.08), 0, 0),
        at(L.fadeOut(lvl(coins, -24), 0.25), 0.03, 0),
        at(lvl(ching, -16), 0.045, 0),
        at(L.thump({ f0: 190, f1: 110, sweep: 0.02, decay: 0.08, click: 0, seed: `buyth${k}` }), 0, -16),
      ], { length: 0.72 });
      vars.push(L.fadeOut(rv(dense(b, 4), 'smallRoom', { wet: 0.12, seed: 'ui_room', channels: 1, crop: 0.72 }), 0.2));
    }
    await add('ui_buy', vars, { target: 'ui', voices: 2, sources: ['fs:632822', 'fs:184372'] });
  }

  // deny: two short, low, band-limited buzzes (console error), not annoying when spammed
  if (want('ui_deny')) {
    const buzz = (f, d, seed) => {
      let b = L.mix([L.tone(d, { type: 'square', freq: f }), at(L.tone(d, { type: 'saw', freq: f * 1.007 }), 0, -6)]);
      b = L.eq(b, [{ type: 'lp', f: 2300, order: 2 }, { type: 'peak', f: 650, gain: 5, q: 1.4 }, { type: 'hp', f: 120, order: 2 }]);
      return L.applyEnv(b, L.envCurve(d, [[0, 0], [0.004, 1], [d - 0.02, 0.85], [d, 0]]));
    };
    const b = L.mix([at(buzz(164, 0.075, 'dz1')), at(buzz(147, 0.085, 'dz2'), 0.105), at(tick({ hp: 900, lp: 5000, t60: 0.006, seed: 'dzt' }), 0, -8)], { length: 0.22 });
    await add('ui_deny', [L.fadeOut(radio(b, { drive: 6, lo: 150, hi: 4000 }), 0.02)], { target: 'ui', voices: 1 });
  }

  // equip: cloth flick + sling/metal rattle + a solid latch (real AR-15 handling + jacket rustle)
  if (want('ui_equip')) {
    const cloth = await mono('fs:494797');
    const rattles = [[3.04, 3.24], [6.85, 7.25], [13.98, 14.27]];
    const vars = [];
    for (let k = 0; k < 3; k++) {
      const rt = L.hp(await mono('fs:393732', { start: rattles[k][0], end: rattles[k][1] }), 180, 2);
      const b = L.mix([
        at(L.fadeOut(lvl(L.hp(cloth, 250, 2), -26), 0.1)),
        at(L.fadeOut(lvl(rt, -22), 0.06), 0.035),
        at(uiClick(20 + k, { pitch: 0.82, body: 380, release: false }), 0.16 + k * 0.012, -3),
        at(L.thump({ f0: 160, f1: 90, sweep: 0.02, decay: 0.07, click: 0, seed: `eqth${k}` }), 0.16 + k * 0.012, -14),
      ], { length: 0.36 });
      vars.push(L.fadeOut(b, 0.08));
    }
    await add('ui_equip', vars, { target: 'ui', voices: 2, sources: ['fs:494797', 'fs:393732'] });
  }

  // money: real coins — a coin landing on coins. The bright ring takes (fs:174629, ~95 % of their energy above 8 kHz:
  // alone they read as a thin "tsing") are layered over the first-contact "clink" of single coins from a spill
  // (fs:184372: body at 2-6 kHz), and the 10 kHz+ ring is shelved down.
  if (want('money')) {
    const rings = [[0.0, 0.48], [0.85, 1.3], [2.46, 2.86], [3.87, 4.3], [5.18, 5.62]]; // ~0.45 s each, no front-loaded takes: equal momentary loudness
    // [id, onset s, length s, semitones]: single coins settling at the end of a spill (clean, separated hits)
    const clinks = [['fs:184372', 2.339, 0.26, 0], ['fs:184372', 1.703, 0.26, 0], ['fs:184372', 2.518, 0.26, 0], ['fs:184372', 1.703, 0.26, -1.5], ['fs:184372', 2.339, 0.26, 2]];
    const vars = [];
    for (let k = 0; k < rings.length; k++) {
      let ring = await mono('fs:174629', { start: rings[k][0], end: rings[k][1] });
      ring = L.trimSilence(startAt(ring, -30), { threshDb: -45, pre: 0.001, post: 0.04 });
      const [cid, ct, clen, semis] = clinks[k];
      let clink = await mono(cid, { start: Math.max(0, ct - 0.006), end: ct + clen });
      clink = L.fadeOut(startAt(L.hp(clink, 500, 2), -12), Math.min(0.12, clen * 0.5)); // start on the main hit, not the spill before it
      if (semis) clink = L.varispeedSemis(clink, semis);
      let b = L.mix([at(lvl(clink, -23)), at(lvl(ring, -25), 0.012 + 0.004 * k)]);
      b = L.eq(b, [{ type: 'hp', f: 450, order: 2 }, { type: 'peak', f: 3800, gain: 2.5, q: 0.9 }, { type: 'highshelf', f: 9500, gain: -5 }]);
      b = L.trimSilence(b, { threshDb: -50, pre: 0.001, post: 0.04, start: false });
      vars.push(L.fadeOut(rv(dense(b, 5), 'smallRoom', { wet: 0.1, seed: 'ui_room', channels: 1, crop: Math.min(0.6, b.duration + 0.12) }), 0.08));
    }
    await add('money', vars, { target: 'ui', voices: 3, pitch: [0.97, 1.03], sources: ['fs:174629', 'fs:184372'] });
  }

  // countdown tick: a hard timer tick with a short pitched beep (one file: identical every second, like a clock)
  if (want('countdown_tick')) {
    const b = L.mix([
      tick({ dur: 0.015, hp: 2500, lp: 10000, t60: 0.004, seed: 'cdt' }),
      at(bank(0.14, [[1568, 0.7, 0.09], [3136, 0.18, 0.05], [784, 0.25, 0.05], [4700, 0.1, 0.02]], 'cdb'), 0.001, -3),
      at(L.thump({ f0: 240, f1: 160, sweep: 0.01, decay: 0.04, click: 0, seed: 'cdth' }), 0, -12),
    ], { length: 0.15 });
    await add('countdown_tick', [L.fadeOut(b, 0.04)], { target: 'ui', voices: 2 });
  }

  // objective: field radio — squelch open, two-tone beep, squelch close ("kssht")
  if (want('objective')) {
    const vars = [];
    for (let k = 0; k < 2; k++) {
      const [f1, f2] = [[1046, 1397], [988, 1318]][k];
      const beep = (f, d) => L.applyEnv(L.mix([L.tone(d, { type: 'sine', freq: f }), at(L.tone(d, { type: 'triangle', freq: f * 2 }), 0, -16)]), L.envCurve(d, [[0, 0], [0.004, 1], [d - 0.01, 1], [d, 0]]));
      const hiss = L.eq(L.noise(0.62, { color: 'white', seed: `hiss${k}` }), [{ type: 'bp', f: 2200, q: 0.7 }]);
      const sq1 = L.mix([L.noiseBurst({ dur: 0.05, hp: 500, lp: 6000, decay: 0.05, attack: 0.001, seed: `sq1${k}` }), at(L.crackle(0.05, { density: 300, seed: `cr1${k}`, hp: 1500 }), 0, -6)]);
      const sq2 = L.mix([L.noiseBurst({ dur: 0.11, hp: 400, lp: 7000, decay: 0.12, attack: 0.002, seed: `sq2${k}` }), at(L.crackle(0.1, { density: 220, seed: `cr2${k}`, hp: 1200 }), 0, -4)]);
      let b = L.mix([
        at(sq1, 0, -4),
        at(L.applyEnv(hiss, L.envCurve(0.62, [[0, 0], [0.02, 1], [0.5, 1], [0.6, 0]])), 0.0, -26),
        at(beep(f1, 0.1), 0.045, 0),
        at(beep(f2, 0.15), 0.19, 0),
        at(sq2, 0.385, -3),
      ], { length: 0.56 });
      b = radio(b, { drive: 9 });
      vars.push(L.fadeOut(rv(b, 'smallRoom', { wet: 0.08, seed: 'ui_room', channels: 1, crop: 0.62 }), 0.05));
    }
    await add('objective', vars, { lufs: -20, voices: 1, priority: 4, note: 'radio beep; -20 LUFS (above menu UI: it announces a match event)' });
  }

  // ---------------------------------------------------------------------------------------------- combat HUD
  // hitmarker: research 03 §4.9 — short "tk", 20-40 ms, rate-limited by the HUD. Core = sub-ms noise tick through a
  // 4-5 kHz band + two short metal partials + a tiny low "thock" for weight.
  // Level: it plays on the same frame as the shot that caused it (hud.js, volume 0.7 on the ui bus = -5 dB vs sfx), so
  // it must poke through the gun's own body/tail. Masking check (1/3-octave energy, 16-76 ms after the shot, every
  // gun _close + _tail): at -20 LUFS its strongest band (3.15 kHz, where gun spectra dip) sat 0-3 dB UNDER rifles /
  // MGs / snipers = inaudible while firing. A 50 ms click integrated over its own length also overstates its
  // loudness (momentary -29 vs -22 for hitmarker_head). -15 LUFS puts the 3.15 kHz band 2-11 dB over every gun and
  // keeps the ladder hit < head hit < kill < headshot kill in momentary loudness.
  const hitCore = (k, { j = 1, len = 0.05, weight = -10 } = {}) => {
    const r = ctx.rng(`hit${k}`), q = j * (1 + r.range(-0.02, 0.02));
    const thock = L.hp(bank(len, [[520 * q, 1, 0.018, { glide: 0.3, glideT: 0.005 }]], `hl${k}`), 260, 2);
    return L.mix([
      at(L.eq(tick({ dur: 0.012, hp: 2800, lp: 14000, t60: 0.0035, seed: `ht${k}` }), [{ type: 'peak', f: 4600 * q, gain: 6, q: 1.4 }]), 0, -4),
      at(bank(len, [[3180 * q, 0.7, 0.034], [4720 * q, 0.5, 0.028], [6350 * q, 0.25, 0.016], [8900 * q, 0.1, 0.008]], `hb${k}`), 0, -2),
      at(thock, 0, weight),
    ], { length: len });
  };
  await add('hitmarker', () => [0, 1, 2, 3].map((k) => L.fadeOut(dense(hitCore(k), 6), 0.014)),
    { lufs: -15, voices: 3, priority: 3, pitch: [0.985, 1.015], note: 'combat feedback, -15 LUFS over its 50 ms (momentary ~-24): audible over the shot that caused it' });

  // hitmarker_head: the tick + a bright metallic "ding" (helmet / plate partials around 2.6-5.5 kHz), ~0.22 s; -18 LUFS
  // (momentary ~-20) so a headshot still reads above the louder plain hitmarker
  await add('hitmarker_head', () => [0, 1, 2].map((k) => {
    const r = ctx.rng(`hh${k}`), base = 2650 * (1 + r.range(-0.02, 0.02));
    const ring = bell(base, { kind: 'plate', t60: 0.2, seed: `hhr${k}`, dur: 0.24 });
    const b = L.mix([at(hitCore(10 + k, { j: 1.08, len: 0.06 })), at(ring, 0.002, -5), at(bell(base * 2.03, { kind: 'bar', t60: 0.09, seed: `hhs${k}`, dur: 0.12 }), 0.002, -14)], { length: 0.24 });
    return L.fadeOut(dense(b, 4), 0.08);
  }), { lufs: -18, voices: 3, priority: 3, pitch: [0.985, 1.015], note: 'combat feedback, -18 LUFS (stays above the plain hitmarker)' });

  // killmarker: thick "thock/clank" + low punch with phone-audible harmonics, ~0.3 s
  const killCore = (k) => {
    const r = ctx.rng(`kill${k}`), j = 1 + r.range(-0.03, 0.03);
    const punch = L.thump({ f0: 230 * j, f1: 105 * j, sweep: 0.025, decay: 0.13, click: 0.05, drive: 3, seed: `kp${k}` });
    const clack = L.eq(L.noiseBurst({ dur: 0.06, decay: 0.035, attack: 0.0003, seed: `kc${k}` }), [{ type: 'bp', f: 1150 * j, q: 1.6 }]);
    const clank = bell(1420 * j, { kind: 'bar', t60: 0.14, seed: `kb${k}`, dur: 0.2 });
    const tok = bank(0.2, [[640 * j, 1, 0.075], [1290 * j, 0.45, 0.05], [1935 * j, 0.22, 0.035], [2580 * j, 0.1, 0.02]], `ktok${k}`);
    let b = L.mix([at(hitCore(20 + k, { j: 0.92, len: 0.05, weight: -6 })), at(punch, 0, -13), at(tok, 0, -2), at(clack, 0, -1), at(clank, 0.001, -8)], { length: 0.32 });
    b = L.psychoBass(b, { freq: 120, amount: -6 });
    return dense(L.saturate(b, { drive: 5, type: 'tube', mix: 0.45 }), 5);
  };
  await add('killmarker', () => [0, 1, 2].map((k) => L.fadeOut(killCore(k), 0.12)), { lufs: -18, voices: 3, priority: 4, note: 'combat feedback, -18 LUFS (stinger level)' });

  // headshot_kill: the kill punch + a distinct, longer bright ding (tubular chime ~2 kHz with an octave sparkle)
  await add('headshot_kill', () => [0, 1, 2].map((k) => {
    const r = ctx.rng(`hsk${k}`), base = 1975 * (1 + r.range(-0.015, 0.015));
    const ding = L.mix([bell(base, { kind: 'chime', t60: 0.55, seed: `hd${k}`, dur: 0.7 }), at(bell(base * 2.0, { kind: 'bar', t60: 0.22, seed: `hd2${k}`, dur: 0.3 }), 0, -10)]);
    const b = L.mix([at(killCore(10 + k), 0, -1.5), at(ding, 0.004, -4)], { length: 0.72 });
    return L.fadeOut(b, 0.25);
  }), { lufs: -18, voices: 3, priority: 4, note: 'combat feedback, -18 LUFS' });

  // killmark_ding (ui/killmarks.js): the gem "ding" of a kill mark; the HUD climbs it a semitone per streak kill and
  // stacks a chord (x1.26, x1.5) from the 5th kill, octave up on a headshot -> one clean, steady-pitch chime at C6 so
  // playbackRate 1..3 stays musical and never harsh. -20 LUFS like the hitmarkers (played at volume 0.55).
  await add('killmark_ding', () => {
    // (everything stays under 7.2 kHz: at playbackRate 3 the browser's resampler would fold higher content back down)
    const b = L.mix([at(bell(1046.5, { kind: 'chime', t60: 0.55, seed: 'kmd', detune: 0 })), at(tick({ dur: 0.01, hp: 3500, lp: 7000, t60: 0.003, seed: 'kmt' }), 0, -12),
      at(bank(0.3, [[1046.5 * 4, 0.12, 0.06]], 'kmh'), 0, -6)], { length: 0.7 });
    return [L.fadeOut(rv(b, 'smallRoom', { wet: 0.12, seed: 'ui_room', channels: 1, crop: 0.72 }), 0.2)];
  }, { lufs: -20, voices: 4, priority: 3, note: 'pitched by the HUD (semitone per streak kill, chords) - keep one steady pitch' });

  // xh_node (ui/hud.js onSkillReady): 4 crosshair nodes light 80 ms apart with rising tones (x1, 1.122, 1.26, 1.498):
  // a short soft tonal blip at A5 with a faint tick, so the 4 plays read as a clean major arpeggio
  await add('xh_node', () => {
    const blip = L.mix([bank(0.18, [[880, 1, 0.16, { attack: 0.003 }], [1760, 0.12, 0.08, { attack: 0.003 }], [2640, 0.08, 0.05, { attack: 0.002 }]], 'xhb'),
      at(tick({ dur: 0.008, hp: 3000, lp: 10000, t60: 0.002, seed: 'xht' }), 0, -18)], { length: 0.18 });
    return [L.fadeOut(blip, 0.05)];
  }, { target: 'ui', voices: 4, note: 'pitched by the HUD (0/2/4/7 semitones)' });

  // ---------------------------------------------------------------------------------------------- stingers
  const phoneTilt = (b, low = -4, high = 3) => L.eq(b, [{ type: 'lowshelf', f: 130, gain: low }, { type: 'highshelf', f: 2500, gain: high }]);
  const N = (note) => 440 * Math.pow(2, (note - 69) / 12); // MIDI note -> Hz
  const metalHit = async (semis = -5, which = 0) => {
    const ids = ['fs:201094', 'kenney_impact/Audio/impactMetal_heavy_001', 'kenney_impact/Audio/impactMetal_heavy_003'];
    const id = ids[which];
    let b = await mono(id);
    b = L.trimSilence(b, { threshDb: -50, pre: 0.001, end: false });
    return L.varispeedSemis(b, semis);
  };

  // round_start: tense — a riser into a heavy metallic hit, a dissonant low brass cluster (C + C#) and a pulsing drone
  if (want('round_start')) {
    const T0 = 0.42;
    const rise = L.mix([L.applyEnv(riser(T0, { f0: 300, f1: 4200, seed: 'rs_r', power: 1.6 }), L.envCurve(T0, (t) => 0.25 + 0.75 * t / T0)), at(L.reverse(L.noiseBurst({ dur: T0, hp: 3500, decay: 0.3, seed: 'rs_c' })), 0, -6), at(L.noise(T0, { color: 'pink', seed: 'rs_air', amp: 0.02 }), 0, 0)]);
    const hit = await metalHit(-6, 0);
    const br = brass([{ f: N(48), dur: 2.6 }, { f: N(55), dur: 2.6, amp: -2 }, { f: N(60), dur: 2.6, amp: -3 }, { f: N(61), dur: 2.6, amp: -4 }, { f: N(36), dur: 2.6, amp: -7 }], { attack: 0.035, bright: 8, brightT: 0.22, sustain: 1.6, floorHz: 1000, brightHz: 3000, release: 1.7, seed: 'rs_b', growl: 0.25 });
    const drone = L.applyEnv(L.eq(L.mix([L.tone(2.9, { type: 'saw', freq: N(36) }), L.tone(2.9, { type: 'saw', freq: N(36) * 1.012 })]), [{ type: 'lp', f: 420, order: 2 }]),
      L.envCurve(2.9, (t) => Math.min(1, t / 0.3) * Math.exp(-t / 1.1) * (0.75 + 0.25 * Math.sin(6.283 * 3.2 * t))));
    let b = L.mix([
      at(lvl(rise, -27), 0),
      at(lvl(L.thump({ f0: 120, f1: 40, sweep: 0.07, decay: 1.2, click: 0.25, drive: 2, seed: 'rs_th' }), -23), T0),
      at(lvl(L.lp(hit, 7000, 2), -20), T0),
      at(lvl(br, -17), T0 + 0.01),
      at(lvl(drone, -29), T0 + 0.1),
    ], { length: 3.5 });
    b = rv(b, 'warehouse', { wet: 0.3, seed: 'hall', length: 3.0 });
    b = phoneTilt(L.psychoBass(b, { freq: 110, amount: -6 }));
    await add('round_start', [L.fadeOut(L.slice(b, 0, 3.6), 1.2, 'exp')], { target: 'stinger', voices: 1, priority: 5, sources: ['fs:201094'] });
  }

  // round_win: resolution — timpani-ish hit, a brass pickup (G) into a C major chord, a soft bell shimmer
  if (want('round_win')) {
    const br = brass([
      { f: N(55), at: 0, dur: 0.2, attack: 0.025, release: 0.06, amp: -3 },
      { f: N(48), at: 0.2, dur: 2.3 }, { f: N(55), at: 0.2, dur: 2.3, amp: -2 }, { f: N(60), at: 0.2, dur: 2.3, amp: -2 }, { f: N(64), at: 0.2, dur: 2.3, amp: -4 }, { f: N(36), at: 0.2, dur: 2.3, amp: -6 },
    ], { attack: 0.05, bright: 6, brightT: 0.35, sustain: 2.0, floorHz: 900, brightHz: 1800, release: 1.4, seed: 'rw_b' });
    const shimmer = L.mix([bell(N(84), { kind: 'chime', t60: 1.4, seed: 'rw_s1' }), at(bell(N(88), { kind: 'chime', t60: 1.3, seed: 'rw_s2' }), 0.03, -2), at(bell(N(91), { kind: 'chime', t60: 1.2, seed: 'rw_s3' }), 0.06, -3)]);
    const timp = L.mix([L.thump({ f0: 135, f1: 98, sweep: 0.03, decay: 0.9, click: 0.2, drive: 1, seed: 'rw_t' }), at(L.eq(L.noiseBurst({ dur: 0.1, decay: 0.06, seed: 'rw_tn' }), [{ type: 'bp', f: 350, q: 1 }]), 0, -8)]);
    let b = L.mix([at(lvl(timp, -23), 0.2), at(lvl(br, -17), 0), at(lvl(shimmer, -29), 0.22), at(lvl(L.thump({ f0: 90, f1: 50, decay: 0.5, seed: 'rw_t0' }), -31), 0)], { length: 3.0 });
    b = phoneTilt(rv(b, 'warehouse', { wet: 0.26, seed: 'hall', length: 3.0 }), -3, 2);
    await add('round_win', [L.fadeOut(L.slice(b, 0, 3.2), 1.0, 'exp')], { target: 'stinger', voices: 1, priority: 5 });
  }

  // round_lose: a dark C minor brass chord that sags a semitone, a low boom and a falling sub
  if (want('round_lose')) {
    const sag = [[0, 0], [0.5, 0], [2.4, -1.2]];
    const br = brass([{ f: N(48), dur: 2.8, glide: sag }, { f: N(51), dur: 2.8, amp: -2, glide: sag }, { f: N(55), dur: 2.8, amp: -3, glide: sag }, { f: N(36), dur: 2.8, amp: -4, glide: sag }],
      { attack: 0.09, bright: 4.5, brightT: 0.5, sustain: 1.2, floorHz: 800, brightHz: 1400, release: 1.6, seed: 'rl_b', drive: 7 });
    let b = L.mix([at(lvl(L.thump({ f0: 95, f1: 36, sweep: 0.09, decay: 1.5, click: 0.15, drive: 2, seed: 'rl_th' }), -22), 0), at(lvl(br, -17), 0.02),
      at(lvl(L.lp(await metalHit(-10, 1), 3000, 2), -27), 0)], { length: 3.3 });
    b = L.eq(rv(b, 'warehouse', { wet: 0.32, seed: 'hall', length: 3.0 }), [{ type: 'lp', f: 5000, order: 2 }]);
    b = phoneTilt(L.psychoBass(b, { freq: 110, amount: -6 }), -4, 2);
    await add('round_lose', [L.fadeOut(L.slice(b, 0, 3.6), 1.3, 'exp')], { target: 'stinger', voices: 1, priority: 5, sources: ['kenney_impact/Audio/impactMetal_heavy_001'] });
  }

  // level_up: rank-up — whoosh up into a fast bright arpeggio (bell + brass stab) landing on a C major chord + sub hit
  if (want('level_up')) {
    const notes = [N(67), N(72), N(76), N(79)];
    const arp = L.mix(notes.map((f, i) => at(L.mix([bell(f * 2, { kind: 'chime', t60: 0.35, seed: `lu_b${i}` }), at(L.applyEnv(L.lp(L.tone(0.22, { type: 'saw', freq: f }), f * 5, 2), L.expEnv(0.22, { attack: 0.004, t60: 0.2 })), 0, -6)]), i * 0.065)));
    const t1 = 0.26;
    const chord = brass([{ f: N(60), dur: 1.3 }, { f: N(64), dur: 1.3, amp: -2 }, { f: N(67), dur: 1.3, amp: -2 }, { f: N(72), dur: 1.3, amp: -4 }], { attack: 0.025, bright: 9, brightT: 0.18, sustain: 2.4, floorHz: 1100, brightHz: 2500, release: 0.9, seed: 'lu_c' });
    const sparkle = L.mix([bell(N(96), { kind: 'chime', t60: 0.9, seed: 'lu_s1' }), at(bell(N(100), { kind: 'chime', t60: 0.8, seed: 'lu_s2' }), 0.05, -3)]);
    let b = L.mix([
      at(riser(t1, { f0: 700, f1: 7000, seed: 'lu_r', power: 2 }), 0, -12),
      at(arp, 0.0, -4),
      at(chord, t1, -3),
      at(sparkle, t1 + 0.01, -14),
      at(L.thump({ f0: 170, f1: 70, sweep: 0.03, decay: 0.45, click: 0.1, drive: 1.5, seed: 'lu_th' }), t1, -5),
    ], { length: 1.8 });
    b = rv(b, 'warehouse', { wet: 0.2, seed: 'hall', length: 3.0 });
    await add('level_up', [L.fadeOut(L.slice(b, 0, 2.0), 0.7, 'exp')], { target: 'stinger', voices: 1, priority: 5 });
  }

  // achievement: glittering bell arpeggio (pentatonic) over a soft maj7 pad and a low swell
  if (want('achievement')) {
    const notes = [N(76), N(79), N(81), N(84), N(88), N(91)];
    const glitter = L.mix(notes.map((f, i) => at(bell(f, { kind: 'chime', t60: 1.0 - i * 0.08, seed: `ac_${i}` }), i * 0.048, -i * 0.6)));
    const pad = L.applyEnv(L.mix([N(60), N(64), N(67), N(71)].map((f, i) => at(L.lp(L.tone(1.9, { type: 'triangle', freq: f * (1 + (i - 1.5) * 0.001) }), 2500, 2), 0, -2))),
      L.envCurve(1.9, [[0, 0], [0.25, 1], [0.9, 0.7], [1.9, 0]]));
    let b = L.mix([at(lvl(glitter, -19), 0), at(lvl(pad, -31), 0.02), at(lvl(L.thump({ f0: 130, f1: 65, decay: 0.6, click: 0.05, seed: 'ac_th' }), -31), 0), at(lvl(tick({ hp: 4000, t60: 0.01, seed: 'ac_t' }), -30), 0)], { length: 2.0 });
    b = rv(b, 'smallRoom', { wet: 0.25, seed: 'room2' });
    await add('achievement', [L.fadeOut(L.slice(b, 0, 2.1), 0.8, 'exp')], { lufs: -19, voices: 1, priority: 5 });
  }

  // revive_done: lub-dub heartbeat + a rising two-tone chime (E5 -> B5), warm and short
  if (want('revive_done')) {
    const beat = (s) => L.thump({ f0: 95, f1: 52, sweep: 0.02, decay: 0.14, click: 0.02, drive: 2, seed: s });
    const chime = (f, s) => L.mix([bell(f, { kind: 'chime', t60: 0.6, seed: s }), at(L.applyEnv(L.tone(0.6, { type: 'triangle', freq: f }), L.expEnv(0.6, { attack: 0.006, t60: 0.5 })), 0, -8)]);
    let b = L.mix([at(beat('rv1'), 0, -3), at(beat('rv2'), 0.13, -7), at(chime(N(76), 'rvc1'), 0.04, -4), at(chime(N(83), 'rvc2'), 0.17, -3),
      at(riser(0.2, { f0: 600, f1: 3000, seed: 'rvr' }), 0, -22)], { length: 0.95 });
    b = L.psychoBass(rv(b, 'smallRoom', { wet: 0.18, seed: 'room2' }), { freq: 110, amount: -5 });
    await add('revive_done', [L.fadeOut(L.slice(b, 0, 1.0), 0.35, 'exp')], { lufs: -20, voices: 1, priority: 4 });
  }

  // boss_warning: BRAAM (low brass, tritone, growl) + sub boom + metal impact, and an air-raid style siren wail made by
  // gliding a real (synth-made, CC0) siren tone; a second, lower BRAAM answers.
  if (want('boss_warning')) {
    const braam = (seed, base) => brass([{ f: N(base), dur: 2.4 }, { f: N(base + 7), dur: 2.4, amp: -2 }, { f: N(base + 12), dur: 2.4, amp: -1 }, { f: N(base + 18), dur: 2.4, amp: -3 }, { f: N(base + 24), dur: 2.4, amp: -6 }, { f: N(base - 12), dur: 2.4, amp: -8 }],
      { attack: 0.04, bright: 10, brightT: 0.25, sustain: 1.4, floorHz: 1000, brightHz: 3500, release: 1.6, seed, drive: 12, growl: 0.35, voices: 6, detune: 12 });
    let siren = await mono('fs:324276', { start: 10.62, end: 15.2 });
    siren = L.varispeedCurve(siren, [[0, 0.38], [1.3, 1.0], [2.3, 1.03], [3.5, 0.5]]);
    siren = L.slice(siren, 0, Math.min(siren.duration, 3.6));
    siren = L.applyEnv(L.eq(siren, [{ type: 'hp', f: 180, order: 2 }, { type: 'lp', f: 5000, order: 2 }]), L.envCurve(siren.duration, [[0, 0], [0.3, 0.7], [1.2, 1], [2.6, 0.8], [siren.duration, 0]]));
    siren = distant(siren, { metres: 120, env: 'urban', wet: 0.5, dry: 0.8, seed: 'bw_sd' });
    let b = L.mix([
      at(lvl(braam('bw_b1', 36), -16), 0),
      at(lvl(braam('bw_b2', 35), -19), 1.85),
      at(lvl(L.thump({ f0: 105, f1: 34, sweep: 0.08, decay: 1.6, click: 0.3, drive: 2.5, seed: 'bw_th' }), -22), 0),
      at(lvl(L.thump({ f0: 95, f1: 32, sweep: 0.08, decay: 1.4, click: 0.2, drive: 2.5, seed: 'bw_th2' }), -25), 1.85),
      at(lvl(L.lp(await metalHit(-7, 0), 6000, 2), -20), 0),
      at(lvl(siren, -16.5), 0.2),
    ], { length: 4.4 });
    b = rv(b, 'warehouse', { wet: 0.28, seed: 'hall', length: 3.0 });
    b = phoneTilt(L.psychoBass(b, { freq: 110, amount: -5 }), -5, 3);
    await add('boss_warning', [L.fadeOut(L.slice(b, 0, 4.6), 1.4, 'exp')], { target: 'stinger', voices: 1, priority: 5, sources: ['fs:324276', 'fs:201094'] });
  }

  // ---------------------------------------------------------------------------------------------- supply drop
  // match.js drops the crate from 3 m (g = 14): it lands 0.65 s after play() and bounces back down at ~0.98 s. The
  // helicopter is passing overhead as it is released, then recedes (darker, lower, quieter).
  if (want('supply_drop')) {
    const thudSrc = L.hp(await mono('fs:640204', { start: 0.15, end: 0.7 }), 35, 2);
    const plates = ctx.sources.find({ pack: 'kenney_impact', text: 'impactPlate_heavy' });
    const metals = ctx.sources.find({ pack: 'kenney_impact', text: 'impactMetal_medium' });
    const tins = ctx.sources.find({ pack: 'kenney_impact', text: 'impactTin_medium' });
    const vars = [];
    for (let k = 0; k < 2; k++) {
      const D = 5.2, s0 = [19.9, 23.4][k];
      let heli = await mono('fs:546806', { start: s0, end: s0 + D + 0.3 });
      heli = L.varispeedCurve(heli, [[0, 1.0], [1.0, 1.0], [D, 0.94]]);
      heli = L.slice(heli, 0, D);
      heli = L.sweep(L.hp(heli, 45, 2), 'lp', (t) => 9000 * Math.pow(0.22, Math.min(1, t / D)), { q: 0.7 });
      heli = L.automate(L.fadeIn(heli, 0.22, 'sine'), [[0, -1], [0.5, 0], [1.4, -2.5], [3.0, -9], [D, -24]]);
      const plate = await mono(plates[k % plates.length].id);
      const metal = await mono(metals[(k + 2) % metals.length].id);
      const tin = await mono(tins[k % tins.length].id);
      const thud = L.mix([at(lvl(thudSrc, -14)), at(lvl(plate, -18), 0.003), at(L.thump({ f0: 105, f1: 46, sweep: 0.03, decay: 0.38, click: 0.1, drive: 1.5, seed: `sdth${k}` }), 0, -4)]);
      const bounce = L.mix([at(lvl(metal, -22)), at(L.thump({ f0: 130, f1: 70, decay: 0.15, seed: `sdbn${k}` }), 0, -14)]);
      const fall = L.whoosh({ dur: 0.45, f0: 1800, f1: 500, q: 1.6, seed: `sdw${k}` });
      let b = L.mix([
        at(lvl(heli, -22)),
        at(lvl(fall, -32), 0.2),
        at(L.gain(L.transientShaper(thud, { attack: 2, sustain: -1 }), -2), 0.65),
        at(lvl(tin, -30), 0.67),
        at(bounce, 0.98),
      ], { length: D, channels: 1 });
      b = L.psychoBass(b, { freq: 110, amount: -6 });
      vars.push(L.fadeOut(dense(b, 4), 0.6)); // the crate impact is ~6 dB peakier than the helicopter bed
    }
    await add('supply_drop', vars, { lufs: -18, bus: 'sfx', spatial: true, range: [20, 300], voices: 2, pitch: [0.98, 1.02], priority: 4, sources: ['fs:546806', 'fs:640204', plates[0].id, plates[1].id, metals[2].id, metals[3].id, tins[0].id, tins[1].id],
      note: 'helicopter pass + crate drop timed to match.js (land 0.65 s, bounce 0.98 s); spatial at the crate' });
  }

  // ================================================================================================ ambience beds
  // Seamless loops: continuous layers are cut with `len + xf` seconds and crossfaded into themselves; discrete events
  // are added on a circular timeline (wrapAdd), reverbs of event tracks are folded back over the loop point. Layers
  // are levelled in LUFS relative to each other; cat.add masters the bed to -30 LUFS. Each bed's pre-master mix is
  // cached (bump the bed's version in AMB_V when its recipe changes) because these are the expensive renders.
  const AMB_V = { amb_city_dead: 'v3', amb_harbor_wind: 'v3', amb_fire: 'v3', amb_warehouse: 'v3', amb_rain: 'v4' };
  /** No startling spikes in a bed: transients (pops, drips, clanks) at most `over` dB above its integrated loudness. */
  // (limited with 0.5 s of wrap-around context on both sides so the gain is continuous across the loop point)
  const capPeaks = (b, over = 18) => {
    const P = Math.round(0.5 * SR);
    const ext = L.concat([L.sliceSamples(b, b.length - P, b.length), b, L.sliceSamples(b, 0, P)]);
    return L.sliceSamples(L.limit(ext, { ceiling: L.lufs(b) + over, release: 0.05 }), P, P + b.length);
  };
  const bedLayer = async (id, start, len, xf, { specs, gainLufs, stereoFrom } = {}) => {
    let b;
    if (stereoFrom !== undefined) { // mono source -> decorrelated stereo from two different sections
      const l = await mono(id, { start, end: start + len + xf }), r = await mono(id, { start: stereoFrom, end: stereoFrom + len + xf });
      const n = Math.min(l.length, r.length);
      b = new L.Buf([l.data[0].slice(0, n), r.data[0].slice(0, n)], SR);
    } else b = L.setChannels(await load(id, { start, end: start + len + xf }), 2);
    if (specs) b = L.eq(b, specs);
    b = L.loopCrossfade(b, xf);
    return gainLufs !== undefined ? lvl(b, gainLufs) : b;
  };
  /** Stereo balance (keeps the reverb's width): p -1 = left .. +1 = right. */
  const bal = (b, p = 0) => { const s = L.setChannels(b, 2), gl = Math.min(1, 1 - p) * 0.85 + 0.15, gr = Math.min(1, 1 + p) * 0.85 + 0.15; return new L.Buf([L.scale(new L.Buf([s.data[0]], SR), gl).data[0], L.scale(new L.Buf([s.data[1]], SR), gr).data[0]], SR); };
  /** Convolve a whole (circular) event track with an IR and fold the tail back over the loop point. */
  const loopReverb = (track, irBuf, { wet = 0.5, dry = 1 } = {}) => {
    const y = L.convolve(track, irBuf, { wet, dry });
    const out = L.slice(y, 0, track.duration);
    wrapAdd(out, L.slice(y, track.duration, y.duration), track.duration);
    return out;
  };
  // priority 10: the engine steals the lowest-priority, oldest voice when it runs out — never the ambience bed
  const AMB = { target: 'amb', bus: 'amb', loop: true, channels: 2, voices: 1, quality: 0.5, priority: 10 };
  const FFSL = (name) => ctx.sources.find({ pack: 'ffsl' }).find((e) => e.id.toLowerCase().startsWith(`ffsl/${name.toLowerCase()}`))?.id;
  const KEN = (name) => `kenney_impact/Audio/${name}`;

  // ---- amb_city_dead: dead town at night — air tone + hollow wind, distant sirens, dogs, far gunfire, debris, a far blast
  if (want('amb_city_dead')) {
    const LEN = 60, XF = 4;
    const shots = [['AK-47/C_36P', 0, 24.5, 650, 0.35], ['PPSh/P_22P', 0, 26.3, 780, 0.55], ['SKS/U_19P', 0, 33.2, 520, -0.45], ['SKS/U_19P', 1, 34.7, 520, -0.45], ['Mosin Nagant/M_26P', 1, 52.0, 700, -0.1]]
      .map(([g, ...r]) => [FFSL(g), ...r]).filter(([id]) => id);
    const boomId = ctx.sources.find({ pack: 'oga_distant_explosion' })[0]?.id;
    const srcs = ['fs:427841', 'fs:117611', 'fs:22331', 'fs:568814', 'fs:572365', 'fs:440865', 'fs:333988', 'fs:703248', boomId, ...new Set(shots.map((s) => s[0]))].filter(Boolean);
    const out = await ctx.cached(`amb_city_dead_${AMB_V.amb_city_dead}`, async () => {
      const bed = await bedLayer('fs:427841', 30, LEN, XF, { specs: [{ type: 'hp', f: 35, order: 2 }, { type: 'lowshelf', f: 140, gain: -3 }], gainLufs: -30 });
      const wind = await bedLayer('fs:117611', 2.5, 30, 3, { specs: [{ type: 'hp', f: 90, order: 2 }, { type: 'lp', f: 5000, order: 2 }] });
      const hollow = await bedLayer('fs:22331', 1.0, 30, 3, { specs: [{ type: 'hp', f: 60, order: 2 }] });
      const o = L.mix([at(bed), at(lvl(L.concat([wind, wind]), -38)), at(lvl(L.concat([hollow, L.reverse(hollow)]), -37))], { length: LEN, channels: 2 });
      // sirens (recorded distant, reflecting off buildings), slow fades
      const siren = async (id, s, e, fade) => { let b = await load(id, { start: s, end: e }); b = L.eq(b, [{ type: 'hp', f: 250, order: 2 }, { type: 'lp', f: 4000, order: 2 }]); return L.fadeOut(L.fadeIn(b, fade, 'scurve'), fade, 'scurve'); };
      wrapAdd(o, lvl(await siren('fs:568814', 1.5, 26, 5), -38), 4.0);
      wrapAdd(o, bal(lvl(await siren('fs:572365', 0.8, 15.5, 4), -41), 0.3), 36.0);
      // dogs: bark clusters from one distant recording, pushed further away (air + street reflections)
      for (const [s, e, t, p] of [[0.6, 3.1, 15.5, -0.55], [4.9, 7.0, 29.0, 0.45], [11.3, 13.6, 49.5, -0.2]]) {
        let d = L.fadeOut(L.fadeIn(await mono('fs:440865', { start: s, end: e }), 0.05), 0.2);
        d = distant(L.hp(d, 200, 2), { metres: 120, env: 'urban', wet: 0.55, dry: 0.6, seed: 'city_a', lp: 3500 });
        wrapAdd(o, bal(lvl(d, -36), p), t);
      }
      // far gunfire: real FFSL mid-distance takes moved 500-800 m away (a short exchange + isolated rifle shots)
      for (const [id, ev, t, m, p] of shots) {
        const evs = ctx.sources.get(id).analysis.events;
        const e = evs[ev] || evs[0];
        let s = L.fadeOut(await mono(id, { start: e[0], end: Math.min(e[1] + 1.2, e[0] + 3.5) }), 0.4);
        s = distant(s, { metres: m, env: 'urban', wet: 0.85, dry: 0.45, seed: t > 30 ? 'city_b' : 'city_c', lp: 2500, hp: 70 });
        wrapAdd(o, bal(lvl(s, -37), p), t);
      }
      // debris: distant falling glass/metal and a far crash
      for (const [ev, t, p] of [[1, 11.5, 0.6], [3, 43.0, -0.6]]) {
        const d = distant(await mono('fs:333988', { event: ev }), { metres: 90, env: 'urban', wet: 0.5, dry: 0.7, seed: 'city_a' });
        wrapAdd(o, bal(lvl(d, -40), p), t);
      }
      const crash = distant(L.fadeOut(await mono('fs:703248', { start: 0, end: 3.0 }), 0.5), { metres: 220, env: 'urban', wet: 0.6, dry: 0.5, seed: 'city_b', lp: 3000 });
      wrapAdd(o, bal(lvl(crash, -39), 0.2), 20.0);
      if (boomId) {
        const boom = distant(L.fadeOut(await mono(boomId, { start: 0, end: 1.7 }), 0.4), { metres: 300, env: 'field', wet: 0.6, dry: 0.7, seed: 'field', lp: 1200, hp: 35 });
        wrapAdd(o, lvl(boom, -36), 41.5);
      }
      return o;
    });
    await add('amb_city_dead', [capPeaks(out)], { ...AMB, sources: srcs, note: 'default map bed (game.js)' });
  }

  // ---- amb_harbor_wind: marina wind + rigging, harbour rumble across the water, lapping water, groaning metal, gulls
  if (want('amb_harbor_wind')) {
    const LEN = 48, XF = 4;
    const out = await ctx.cached(`amb_harbor_wind_${AMB_V.amb_harbor_wind}`, async () => {
      const wind = await bedLayer('fs:360633', 2, LEN, XF, { specs: [{ type: 'hp', f: 45, order: 2 }], gainLufs: -31 });
      const rumble = await bedLayer('fs:342878', 210, LEN, XF, { specs: [{ type: 'hp', f: 32, order: 2 }, { type: 'lp', f: 600, order: 2 }], gainLufs: -36 });
      const waves = await bedLayer('fs:443019', 4, LEN, XF, { specs: [{ type: 'hp', f: 70, order: 2 }], gainLufs: -36 });
      const lap = await bedLayer('fs:352356', 100, LEN, XF, { specs: [{ type: 'hp', f: 90, order: 2 }, { type: 'lp', f: 5000, order: 2 }], gainLufs: -40 });
      const o = L.mix([at(wind), at(rumble), at(waves), at(L.width(lap, 0.6))], { length: LEN, channels: 2 });
      // gangplank / hull groans: big slow metal stress, pitched down, in the harbour's echo
      for (const [s, t, p, semis] of [[11.6, 6.0, -0.5, -3], [36.6, 21.5, 0.55, -2], [49.3, 37.0, -0.15, -4]]) {
        let g = await mono('fs:500008', { start: s, end: s + 4.0 });
        g = L.fadeOut(L.fadeIn(L.varispeedSemis(g, semis), 0.4, 'scurve'), 1.2, 'scurve');
        g = distant(L.hp(g, 50, 2), { metres: 40, env: 'harbor', wet: 0.5, dry: 0.8, seed: 'harbor_a' });
        wrapAdd(o, bal(lvl(g, -37), p), t);
      }
      // two barges rubbing (hull creaks) once, low
      const barge = L.fadeOut(L.fadeIn(L.hp(await load('fs:555134', { start: 12, end: 22 }), 40, 2), 1.5, 'scurve'), 2, 'scurve');
      wrapAdd(o, lvl(L.setChannels(barge, 2), -39), 27.0);
      // gulls far off
      for (const [s, e, t, p] of [[10.5, 12.6, 14.0, 0.7], [18.7, 20.3, 42.5, -0.6]]) {
        const g = distant(L.fadeOut(L.fadeIn(await mono('fs:32930', { start: s, end: e }), 0.05), 0.3), { metres: 160, env: 'harbor', wet: 0.45, dry: 0.7, seed: 'harbor_b' });
        wrapAdd(o, bal(lvl(g, -42), p), t);
      }
      return o;
    });
    await add('amb_harbor_wind', [capPeaks(out)], { ...AMB, sources: ['fs:360633', 'fs:342878', 'fs:443019', 'fs:352356', 'fs:500008', 'fs:555134', 'fs:32930'] });
  }

  // ---- amb_fire: burning car/building — roar bed (stretched), dense crackle, sparse loud pops, slow flare-ups
  if (want('amb_fire')) {
    const LEN = 32, XF = 3;
    const out = await ctx.cached(`amb_fire_${AMB_V.amb_fire}`, async () => {
      let roarSrc = L.setChannels(await load('fs:563765', { start: 0.3, end: 17.6 }), 2);
      roarSrc = L.timeStretch(roarSrc, (LEN + XF + 0.5) / roarSrc.duration);
      const roar = lvl(L.loopCrossfade(L.slice(L.hp(roarSrc, 40, 2), 0, LEN + XF), XF), -33);
      const crackle = await bedLayer('fs:414767', 8, LEN, XF, { specs: [{ type: 'hp', f: 150, order: 2 }], gainLufs: -33 });
      const flames = await bedLayer('fs:363092', 0.5, 16, 2, { specs: [{ type: 'hp', f: 45, order: 2 }] });
      const o = L.mix([at(roar), at(crackle), at(lvl(L.concat([flames, L.reverse(flames)]), -37))], { length: LEN, channels: 2 });
      // pops from the stove recording (onsets), scattered with random pan
      const r = ctx.rng('firepops');
      const stove = await mono('fs:532191', { start: 10, end: 40 });
      const onsets = L.detectOnsets(stove, { threshold: 12, floorDb: -40, minGap: 0.25 }).slice(0, 40);
      for (let i = 0, t = 0.7; i < 14 && onsets.length; i++, t += r.range(1.4, 3.2)) {
        const ot = r.pick(onsets);
        const p = L.fadeOut(L.fadeIn(L.slice(stove, Math.max(0, ot - 0.005), ot + 0.35), 0.003), 0.15);
        wrapAdd(o, L.pan(lvl(p, -36 + r.range(-3, 3)), r.range(-0.7, 0.7)), t);
      }
      // flare-ups: low swells of filtered noise (gusts feeding the fire)
      for (const [ft, fp] of [[5.5, -0.3], [19.0, 0.35], [27.5, 0]]) {
        let f = L.eq(L.noise(3.2, { color: 'brown', seed: `flare${ft}`, channels: 2 }), [{ type: 'bp', f: 260, q: 0.6 }]);
        f = L.applyEnv(f, L.envCurve(3.2, [[0, 0], [1.2, 1], [3.2, 0]]));
        wrapAdd(o, bal(lvl(f, -38), fp), ft);
      }
      return o;
    });
    // pops and crackles are naturally ~30 dB over the bed: capPeaks keeps them at most 18 dB above it
    await add('amb_fire', [capPeaks(out)], { ...AMB, sources: ['fs:563765', 'fs:414767', 'fs:363092', 'fs:532191'] });
  }

  // ---- amb_warehouse: machine/room hum, drips in two leak spots, structural metal groans, a far clatter
  if (want('amb_warehouse')) {
    const LEN = 48, XF = 4;
    const out = await ctx.cached(`amb_warehouse_${AMB_V.amb_warehouse}`, async () => {
      const hum = await bedLayer('fs:434507', 12, LEN, XF, { specs: [{ type: 'hp', f: 38, order: 2 }, { type: 'lp', f: 5000, order: 2 }], gainLufs: -33 });
      const room = await bedLayer('fs:240895', 60, LEN, XF, { specs: [{ type: 'hp', f: 45, order: 2 }], gainLufs: -34 });
      const o = L.mix([at(hum), at(room)], { length: LEN, channels: 2 });
      // drips: single drops cut from a dripping-water soundscape on two leak spots, then one pass through the hall IR
      const dripSrc = await mono('fs:234554', { start: 0, end: 32 });
      const drops = L.detectOnsets(dripSrc, { threshold: 10, floorDb: -45, minGap: 0.3 }).map((t) => L.hp(L.fadeOut(L.fadeIn(L.slice(dripSrc, Math.max(0, t - 0.004), t + 0.25), 0.002), 0.08), 300, 2));
      if (drops.length) {
        const ref = L.lufs(drops[0]);
        const track = L.Buf.alloc(LEN * SR, 2, SR);
        const rd = ctx.rng('drips');
        for (const [p, gap, g] of [[-0.5, [2.2, 3.4], 0], [0.6, [3.5, 7.5], -3]]) {
          for (let t = rd.range(0, 2); t < LEN; t += rd.range(gap[0], gap[1])) wrapAdd(track, rd.pick(drops), t, g - ref + rd.range(-2, 2), p);
        }
        wrapAdd(o, lvl(loopReverb(track, ir('warehouse', 'wh_drip', 2, 2.2), { wet: 0.5, dry: 0.9 }), -41), 0);
      }
      // structural groans: bunker door / long creak / gangplank stress, slowed and drowned in the hall
      for (const [id, s, e, t, p, semis] of [['fs:496836', 0.2, 6.5, 6.0, -0.4, -3], ['fs:238289', 0.0, 3.0, 24.0, 0.5, -5], ['fs:500008', 62.0, 66.0, 38.0, 0.1, -7]]) {
        let g = await mono(id, { start: s, end: e });
        g = L.fadeOut(L.fadeIn(L.varispeedSemis(g, semis), 0.3, 'scurve'), 0.8, 'scurve');
        g = L.convolve(L.eq(g, [{ type: 'hp', f: 60, order: 2 }, { type: 'lp', f: 5000, order: 2 }]), ir('warehouse', 'hall'), { wet: 0.55, dry: 0.6 });
        wrapAdd(o, bal(lvl(g, -39), p), t);
      }
      // far clatter somewhere in the building
      const cl = L.convolve(L.lp(await mono('fs:333988', { event: 2 }), 4000, 2), ir('warehouse', 'hall'), { wet: 0.7, dry: 0.4 });
      wrapAdd(o, lvl(cl, -42), 15.0);
      return o;
    });
    await add('amb_warehouse', [capPeaks(out)], { ...AMB, sources: ['fs:434507', 'fs:240895', 'fs:234554', 'fs:496836', 'fs:238289', 'fs:500008', 'fs:333988'] });
  }

  // ---- amb_rain: steady rain (two sections of a mono take -> wide stereo) + rain in trees + sparse gutter drips
  if (want('amb_rain')) {
    const LEN = 32, XF = 3;
    const out = await ctx.cached(`amb_rain_${AMB_V.amb_rain}`, async () => {
      const rainA = await bedLayer('fs:200273', 4, LEN, XF, { specs: [{ type: 'hp', f: 90, order: 2 }], stereoFrom: 52, gainLufs: -31 });
      let atmo = L.setChannels(await load('fs:265627', { start: 0.5, end: 29.0 }), 2);
      atmo = L.timeStretch(atmo, (LEN + XF + 0.2) / atmo.duration);
      atmo = lvl(L.loopCrossfade(L.slice(L.hp(atmo, 70, 2), 0, LEN + XF), XF), -34);
      const o = L.mix([at(rainA), at(atmo)], { length: LEN, channels: 2 });
      const dripSrc = await mono('fs:234554', { start: 0, end: 32 });
      const drops = L.detectOnsets(dripSrc, { threshold: 10, floorDb: -45, minGap: 0.3 }).map((t) => L.hp(L.fadeOut(L.slice(dripSrc, Math.max(0, t - 0.004), t + 0.2), 0.06), 400, 2));
      if (drops.length) {
        const rd = ctx.rng('raindrips');
        for (let t = 0.5; t < LEN; t += rd.range(0.9, 2.6)) wrapAdd(o, L.lp(lvl(rd.pick(drops), -50 + rd.range(-3, 2)), 5000, 2), t, 0, rd.range(-0.8, 0.8));
      }
      return o;
    });
    await add('amb_rain', [capPeaks(out, 15)], { ...AMB, sources: ['fs:200273', 'fs:265627', 'fs:234554'] });
  }

  await cat.write();
}
