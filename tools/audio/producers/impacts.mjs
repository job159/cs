// Producer: category 'impacts' — bullet impacts per surface, flesh / gore, ricochets and fly-bys, knife and melee hits,
// explosions, grenade bounce, molotov ignite, debris, body falls, armour hits and the kill-confirm thump.
//
//   node --max-old-space-size=1536 tools/audio/build.mjs --only impacts
//   (dev: CF_AUDIO_OUT=tools/audio/out/impacts-dev IMPACTS_ONLY=headshot,gib node tools/audio/run-producer.mjs tools/audio/producers/impacts.mjs)
//
// Every sound is a layered design: a real CC0 recording carries the identity (Freesound / Kenney, see CREDITS) and
// synthesized layers add what recordings at this size lack — a crisp first-millisecond crack for definition at
// distance, debris/grit scatter, a pitched low thump plus psycho-acoustic harmonics so phones (no output < 120 Hz)
// still feel the weight. Variation comes from rotating recordings + seeded synthesis, never from Math.random().
// Peaky material is shaped with a soft clipper BEFORE loudness normalisation (research 03 §4.12: clip, then limit),
// so the true-peak limiter in cat.add() has almost nothing left to do.
// Mastering review (2026-10-12): body hits / falls / dirt / explosions are tilted to a common phone-speaker balance
// (H.tilt: the Kenney "heavy" punches are ~100 Hz sine booms that vanish on phones and made flesh hits 2-8 dB apart there);
// resonant rings in bodies that should be noise are notched (H.detone); variants share one length where the
// loudness meter's 400 ms block grid would otherwise normalise them over different windows (H.trimTails).

import fs from 'node:fs';

const ONLY = process.env.IMPACTS_ONLY ? new Set(process.env.IMPACTS_ONLY.split(',')) : null;

// Running game previews (dev server + headless browsers of other agents) read these .ogg files while we rebuild them;
// on Windows a reader's open handle makes the atomic rename-over fail with EPERM/EBUSY for a moment. Retry briefly.
// Process-local (this producer runs in its own process); the shared lib is untouched.
{
  const rename0 = fs.renameSync;
  const nap = new Int32Array(new SharedArrayBuffer(4));
  fs.renameSync = (from, to) => {
    for (let i = 0; ; i++) {
      try { return rename0(from, to); } catch (e) {
        if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code) || i >= 50) throw e;
        Atomics.wait(nap, 0, 0, 80 + i * 20);
      }
    }
  };
}

export async function produce(lib, ctx) {
  const cat = ctx.category('impacts', { bus: 'sfx', spatial: true });
  const H = helpers(lib, ctx);
  const want = (n) => !ONLY || ONLY.has(n);
  // per-sound provenance: remember which sources each sound's recipe loads (ctx.load records them category-wide)
  const used = new Map(), load0 = ctx.load;
  ctx.load = (id, o) => { used.get(H.cur)?.add(id); return load0(id, o); };
  const add = async (name, variants, opts) => {
    if (!want(name)) return;
    H.cur = name;
    used.set(name, new Set());
    const list = H.trimTails(await variants(), { uniform: opts.uniform });
    delete opts.uniform;
    await cat.add(name, list, { ...opts, sources: [...used.get(name)].sort() });
  };

  // ------------------------------------------------------------------------------------------------ bullet impacts
  await add('impact_concrete', () => impactConcrete(lib, ctx, H), { target: 'impact', voices: 8, pitch: [0.93, 1.07], range: [2, 45], note: 'bullet into concrete/stone/tile' });
  await add('impact_metal', () => impactMetal(lib, ctx, H), { target: 'impact', voices: 8, pitch: [0.94, 1.06], range: [2, 55], note: 'bullet into steel (also grates)' });
  await add('impact_wood', () => impactWood(lib, ctx, H), { target: 'impact', lufs: -19, voices: 6, pitch: [0.93, 1.07], range: [2, 45] });
  await add('impact_dirt', () => impactDirt(lib, ctx, H), { target: 'impact', lufs: -19, voices: 6, pitch: [0.92, 1.08], range: [2, 40], note: 'dirt and sand' });
  await add('impact_glass', () => impactGlass(lib, ctx, H), { target: 'impact', uniform: true, voices: 4, pitch: [0.95, 1.05], range: [2, 50] });
  await add('impact_water', () => impactWater(lib, ctx, H), { target: 'impact', lufs: -19, voices: 4, pitch: [0.92, 1.08], range: [2, 40] });
  await add('ricochet', () => ricochet(lib, ctx, H), { target: 'impact', lufs: -19, uniform: true, voices: 3, pitch: [0.92, 1.08], range: [3, 60] });
  await add('bullet_whiz', () => bulletWhiz(lib, ctx, H), { target: 'impact', lufs: -22, voices: 3, pitch: [0.9, 1.1], range: [1, 22], note: 'near-miss fly-by (supersonic snap + doppler whistle)' });

  // ------------------------------------------------------------------------------------------------ flesh / gore
  // 0.22 s long: -16 LUFS over its length = -18.4 LUFS over a 400 ms window, i.e. the short-term loudness of the
  // -18 LUFS / 0.4 s surface impacts (the meter integrates a sub-400 ms sound over its own length)
  await add('impact_flesh', () => impactFlesh(lib, ctx, H), { target: 'impact', lufs: -16, voices: 8, pitch: [0.93, 1.07], range: [3, 50], priority: 1.5 });
  await add('headshot', () => headshot(lib, ctx, H), { target: 'impact', lufs: -16, voices: 4, pitch: [0.95, 1.05], range: [4, 60], priority: 2, note: 'crunchy wet crack + skull pop' });
  await add('gib', () => gib(lib, ctx, H), { target: 'gore', lufs: -18, voices: 3, pitch: [0.94, 1.06], range: [3, 45], priority: 1.5 });
  await add('blood_splat', () => bloodSplat(lib, ctx, H), { target: 'gore', lufs: -21, voices: 4, pitch: [0.9, 1.1], range: [2, 25] });
  await add('bone_crunch', () => boneCrunch(lib, ctx, H), { target: 'gore', voices: 3, pitch: [0.93, 1.07], range: [2, 30] });
  await add('knife_hit_flesh', () => knifeFlesh(lib, ctx, H), { target: 'impact', voices: 3, pitch: [0.94, 1.06], range: [2, 30] });
  await add('knife_hit_wall', () => knifeWall(lib, ctx, H), { target: 'impact', voices: 3, pitch: [0.94, 1.06], range: [2, 30] });
  await add('melee_heavy_hit', () => meleeHeavy(lib, ctx, H), { target: 'impact', lufs: -17, voices: 3, pitch: [0.94, 1.06], range: [2, 40] });
  await add('armor_hit', () => armorHit(lib, ctx, H), { target: 'impact', voices: 3, pitch: [0.95, 1.05], range: [2, 30], note: 'armour absorbing a hit (player plate carrier / armoured zombies)' });
  await add('body_fall', () => bodyFall(lib, ctx, H), { target: 'impact', lufs: -19, voices: 4, pitch: [0.92, 1.06], range: [3, 40] });
  await add('kill_confirm_thud', () => killThud(lib, ctx, H), { target: 'ui', bus: 'ui', spatial: false, channels: 1, voices: 2, pitch: [0.98, 1.02], range: [1, 1], note: 'subtle low thump layered under the kill marker' });

  // ------------------------------------------------------------------------------------------------ explosives
  // Integrated -16 / -15 LUFS over 2-3.7 s still peaks at about -11 LUFS momentary (400 ms), a few dB above a -12 LUFS
  // gunshot close layer (-13..-15 momentary). Pushing them louder only clipped the blast into a flat block. Their size
  // over distance comes from a larger ref distance instead: full level within 15 / 18 m, -6 dB at 30 / 36 m, and at the
  // 40 m hand-over to explosion_far the two are within ~1.5 dB of each other.
  await add('explosion_small', () => explosionSmall(lib, ctx, H), { target: 'explosion', lufs: -16, voices: 4, pitch: [0.95, 1.04], range: [15, 220], priority: 3, note: 'frag grenade' });
  await add('explosion_large', () => explosionLarge(lib, ctx, H), { target: 'explosion', lufs: -15, voices: 3, pitch: [0.95, 1.03], range: [18, 300], priority: 3, note: 'rocket / barrel / boss crash' });
  await add('explosion_far', () => explosionFar(lib, ctx, H), { target: 'explosionFar', voices: 3, pitch: [0.94, 1.04], range: [40, 600], priority: 2 });
  await add('grenade_bounce', () => grenadeBounce(lib, ctx, H), { target: 'foley', lufs: -20, voices: 4, pitch: [0.92, 1.08], range: [2, 30] });
  await add('fire_burst', () => fireBurst(lib, ctx, H), { target: 'impact', lufs: -16, voices: 3, pitch: [0.95, 1.05], range: [4, 70], note: 'molotov: bottle smash + ignition' });
  await add('debris_fall', () => debrisFall(lib, ctx, H), { target: 'impact', lufs: -19, voices: 3, pitch: [0.94, 1.06], range: [4, 60] });

  const d = H.drives.map((x) => x[0]).sort((a, b) => a - b);
  if (d.length) ctx.log(`  soft-clip drive before mastering: median ${d[d.length >> 1].toFixed(1)} dB, max ${d[d.length - 1].toFixed(1)} dB over ${d.length} files`);
  if (process.env.IMPACTS_DEBUG) for (const [dr, n] of [...H.drives].sort((a, b) => b[0] - a[0]).slice(0, 15)) ctx.log(`    drive ${dr.toFixed(1)} dB  ${n}`);
  await cat.write();
}

// ================================================================================================== helpers
function helpers(lib, ctx) {
  const { Buf } = lib;
  const rmsOf = (d) => { let s = 0; for (let i = 0; i < d.length; i++) s += d[i] * d[i]; return Math.sqrt(s / Math.max(1, d.length)); };
  const H = {
    /** Mono from a source: spaced / decorrelated pairs keep their louder channel (averaging would comb-filter). */
    mono(b, ch = 'auto') {
      if (b.channels === 1) return b;
      if (ch === 'L') return new Buf([b.data[0]], b.sampleRate);
      if (ch === 'R') return new Buf([b.data[1]], b.sampleRate);
      if (ch === 'auto' && lib.stereoCorrelation(b) < 0.7) {
        return new Buf([rmsOf(b.data[0]) >= rmsOf(b.data[1]) ? b.data[0] : b.data[1]], b.sampleRate);
      }
      return lib.toMono(b);
    },
    /** Load a slice of a source as a mono 48 kHz Buf (+ optional high-pass for handling rumble). */
    async load(id, s, e, { ch = 'auto', hp = 35 } = {}) {
      let b = await ctx.load(id, { start: s, end: e });
      b = H.mono(b, ch);
      if (hp) b = lib.hp(b, hp, 2);
      return b;
    },
    /** Start right at the transient (1.5 ms pre-roll); threshold relative to the slice's peak. */
    align(b, threshDb = -36) { return lib.trimSilence(b, { threshDb, pre: 0.0015, end: false, fadeInSec: 0.0008 }); },
    /** Cut to `dur` seconds with a natural exponential-looking release over the last `fade` seconds. */
    fit(b, dur, fade) { const d = Math.min(dur, b.duration); return lib.fadeOut(lib.slice(b, 0, d), Math.min(fade ?? d * 0.6, d * 0.95), 'exp'); },
    /** Peak-normalise to 0 dBFS. */
    norm(b) { return lib.normalizePeak(b, 0); },
    /** Peak-to-loudness ratio (dB): true peak - integrated LUFS. */
    plr(b) { return lib.lin2db(lib.truePeak(b)) - lib.lufs(b); },
    /**
     * Density stage before mastering. A short hit's loudness IS its first ~100 ms, so the true-peak limiter in
     * cat.add() cannot raise it without flattening the whole hit (it loses ~1 dB of loudness per dB limited). So:
     * 1. lift the body/decay relative to the spike (transient shaper, 'sustain' dB) — beefier, more natural than clipping;
     * 2. the smallest soft-clip drive that brings the peak-to-loudness ratio to what -1 dBTP at `lufs` allows.
     * The clipper's knee only shaves the attack spike above the body (research 03 §4.12: clip, then limit).
     */
    shape(b, lufs, { sustain = 3, minDrive = 1, maxDrive = 15, thr = -10, margin = 0.4 } = {}) {
      const want = -1.4 - lufs - margin;
      let x = lib.normalizePeak(b, 0);
      if (sustain) x = lib.normalizePeak(lib.transientShaper(x, { sustain }), 0);
      const run = (d) => lib.softClip(lib.gain(x, d), { threshold: thr, ceiling: -1 });
      let y = run(minDrive);
      const p0 = H.plr(x);
      if (H.plr(y) > want) {
        let lo = minDrive, hi = maxDrive;
        y = run(hi);
        if (H.plr(y) <= want) { for (let i = 0; i < 7; i++) { const m = (lo + hi) / 2; if (H.plr(run(m)) > want) lo = m; else hi = m; } y = run(hi); }
        H.drives.push([hi, H.cur]);
        if (process.env.IMPACTS_DEBUG || H.plr(y) > want + 1) ctx.log(`    shape ${H.cur}: PLR ${p0.toFixed(1)} -> ${H.plr(y).toFixed(1)} (want ${want.toFixed(1)}) drive ${hi.toFixed(1)} dB`);
      } else H.drives.push([minDrive, H.cur]);
      return y;
    },
    drives: [],
    /**
     * Cut dead air shared by all variants of a sound: every variant is cut to ONE common length = the latest point where
     * any variant is still within 60 dB of its peak (+30 ms, sine fade), never below 0.4 s and never longer than it was.
     * One common length matters: the loudness meter integrates a sub-400 ms sound over its length and a longer one over
     * 400 ms blocks every 100 ms, so variants of different lengths would be normalised over different windows and play
     * at different perceived levels (a 0.42 s and a 0.53 s glass hit at the same LUFS differ by ~2.5 dB short-term).
     */
    trimTails(list, { threshDb = -60, minLen = 0.4, uniform = false } = {}) {
      const sr = list[0].sampleRate;
      const need = Math.max(...list.map((b) => Math.min(b.length, lib.findActive(b, { threshDb }).end + Math.round(0.03 * sr))), Math.round(minLen * sr));
      // uniform: cut every variant to the shortest one, so all are measured over the same window (sounds whose variants
      // straddle the 0.5 s point would otherwise be integrated over 1 vs 2 blocks: ~2-3 dB apart short-term)
      const len = uniform ? Math.min(need, ...list.map((b) => b.length)) : need;
      const fade = uniform ? 0.06 : 0.025;
      return list.map((b) => {
        // past ~1 s the meter's gate drops near-silent blocks anyway: long sounds lose their own dead tail individually
        const own = b.duration > 1 ? Math.max(Math.round(1 * sr), Math.min(b.length, lib.findActive(b, { threshDb }).end + Math.round(0.03 * sr))) : len;
        const L = Math.min(len, own);
        return b.length > L + Math.round(0.005 * sr) ? lib.fadeOut(lib.sliceSamples(b, 0, L), fade, 'sine') : b;
      });
    },
    /**
     * Phone-speaker loss (dB): integrated loudness minus the loudness through a phone-like response (4th-order 200 Hz
     * high-pass + 4 dB shelf cut under 400 Hz). A boomy hit loses 6-8 dB on a phone and reads weak and inconsistent.
     */
    phoneLoss(b) { return lib.lufs(b) - lib.lufs(lib.eq(b, [{ type: 'hp', f: 200, order: 4 }, { type: 'lowshelf', f: 400, gain: -4 }])); },
    /**
     * Tilt the low end (low-shelf cut at `f`) until the phone loss is at most `target` dB, so every variant of a sound
     * keeps the same mid-range "read" on small speakers (the final LUFS normalisation then lifts the mids).
     */
    tilt(b, target, { f = 160, maxCut = -15 } = {}) {
      if (H.phoneLoss(b) <= target) return b;
      const run = (g) => lib.eq(b, [{ type: 'lowshelf', f, gain: g }]);
      let lo = maxCut, hi = 0; // lo: enough cut (loss <= target), hi: not enough
      if (H.phoneLoss(run(lo)) > target) return run(lo);
      for (let i = 0; i < 8; i++) { const m = (lo + hi) / 2; if (H.phoneLoss(run(m)) > target) hi = m; else lo = m; }
      if (process.env.IMPACTS_DEBUG) ctx.log(`    tilt ${H.cur}: low-shelf ${lo.toFixed(1)} dB @ ${f} Hz -> phone loss ${H.phoneLoss(run(lo)).toFixed(1)} dB`);
      return run(lo);
    },
    /**
     * Notch out resonant rings that stick > minProm dB out of their third-octave neighbourhood (a stone that "bonks"
     * at 380 Hz, a bottle "clunk" in a window pane): bullet strikes on concrete / wood / dirt / flesh are noise, not notes.
     */
    detone(b, { minProm = 12, fmin = 150, fmax = 9000, maxCuts = 3, q = 7, skip = 0.008, passes = 2 } = {}) {
      let y = b;
      for (let pass = 0; pass < passes; pass++) {
        const s = lib.slice(y, Math.min(skip, y.duration / 4), y.duration);
        const { freqs, power } = lib.averageSpectrum(s, { size: 8192 });
        const db = Array.from(power, (p) => 10 * Math.log10(p + 1e-20));
        const found = [];
        for (let k = 3; k < db.length - 3; k++) {
          if (freqs[k] < fmin || freqs[k] > fmax || !(db[k] > db[k - 1] && db[k] >= db[k + 1])) continue;
          const win = db.slice(Math.max(1, Math.floor(k / 1.26)), Math.min(db.length, Math.ceil(k * 1.26) + 1)).sort((u, v) => u - v);
          const prom = db[k] - win[win.length >> 1];
          if (prom > minProm) found.push([freqs[k], prom]);
        }
        found.sort((u, v) => v[1] - u[1]);
        const cuts = [];
        for (const [f, p] of found) { if (cuts.length >= maxCuts) break; if (cuts.every((c) => Math.abs(Math.log2(c.f / f)) > 0.15)) cuts.push({ type: 'peak', f, gain: -Math.min(20, p - 6), q }); }
        if (!cuts.length) break;
        if (process.env.IMPACTS_DEBUG) ctx.log(`    detone ${H.cur}: ${cuts.map((c) => `${Math.round(c.f)} Hz ${c.gain.toFixed(0)} dB`).join(', ')}`);
        y = lib.eq(y, cuts);
      }
      return y;
    },
    /** Drop everything up to `pre` s before the absolute peak (for sounds that swell into their hit). */
    fromPeak(b, pre = 0.006) { const t = H.peakAt(b); return lib.fadeIn(lib.slice(b, Math.max(0, t - pre), b.duration), Math.min(pre, 0.004), 'sine'); },
    /** Time (s) of the absolute peak. */
    peakAt(b) { let m = 0, k = 0; for (const d of b.data) for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > m) { m = a; k = i; } } return k / b.sampleRate; },
    /** Up to n peak times separated by >= gap s, strongest first, then sorted by time. */
    peaks(b, n, gap = 0.2) {
      const env = lib.envelope(b, { attack: 0.0005, release: 0.03 });
      const sr = b.sampleRate, taken = [];
      const idx = Array.from(env.keys()).sort((x, y) => env[y] - env[x]);
      for (const i of idx) {
        if (taken.length >= n) break;
        if (env[i] < env[idx[0]] * 0.05) break;
        if (taken.every((j) => Math.abs(j - i) > gap * sr)) taken.push(i);
      }
      return taken.sort((x, y) => x - y).map((i) => i / sr);
    },
    // ---------------------------------------------------------------- synthesized layers
    /** Bright broadband snap: the first milliseconds of a bullet strike. */
    crack(seed, { dur = 0.03, decay = 0.006, hp = 2500, lp = 15000 } = {}) { return lib.noiseBurst({ dur, attack: 0.0002, decay, hp, lp, seed }); },
    /** Resonant knock ("tock"/"chip") at frequency f. */
    tock(seed, f, { q = 5, decay = 0.025 } = {}) {
      const dur = decay * 1.6 + 0.01;
      const ex = lib.noiseBurst({ dur, attack: 0.0001, decay: 0.002, seed });
      return lib.applyEnv(lib.eq(ex, [{ type: 'bp', f, q }, { type: 'bp', f, q: q * 0.6 }]), lib.expEnv(dur, { attack: 0.0003, t60: decay }));
    },
    /** Scatter of small particles (debris, grit, dirt spray), density in events/s, decaying over `decay` (t60). */
    grit(seed, { dur = 0.3, density = 250, decay = 0.25, hp = 2500, lp = 12000, tick = 0.0015, attack = 0.003 } = {}) {
      let c = lib.crackle(dur, { density, decay: tick, hp, seed, minAmp: 0.04, maxAmp: 1 });
      if (lp) c = lib.lp(c, lp, 2);
      return lib.applyEnv(c, lib.expEnv(dur, { attack, t60: decay }));
    },
    /** Soft noise puff (dust, air push). */
    puff(seed, { dur = 0.3, decay = 0.2, hp = 300, lp = 3000, color = 'pink', attack = 0.003 } = {}) {
      return lib.noiseBurst({ dur, attack, decay, color, hp, lp, seed });
    },
    /** Pitched low thump (weight), mildly driven so it has harmonics phones can reproduce. */
    thud(seed, { f0 = 160, f1 = 70, sweep = 0.02, decay = 0.12, drive = 1, click = 0 } = {}) {
      return lib.thump({ f0, f1, sweep, decay, drive, click, seed });
    },
    /** Inharmonic metal ring: list of [ratio, amp, t60]. */
    ring(seed, base, list, dur = 0.5) { return lib.partials(dur, { base, list, seed }); },
    /** Random slice of a decoded buffer (length len, seeded). */
    sliceRand(b, len, r, from = 0) { const s = from + r.range(0, Math.max(0, b.duration - len - from)); return lib.slice(b, s, s + len); },
    /** Mix helper: layers [{ buf, at, gain }] -> mono. */
    mix(layers, length) { return lib.mix(layers.filter((l) => l && l.buf), { channels: 1, length }); },
    /** Phone-speaker low end: add harmonics implying the band under `freq`. */
    weight(b, freq = 120, amount = -5) { return lib.psychoBass(b, { freq, amount, drive: 14 }); },
    kenney: (name) => `kenney_impact/Audio/${name}`,
  };
  return H;
}

// ================================================================================================== bullet impacts
async function impactConcrete(lib, ctx, H) {
  // recorded stone/concrete hits carry the material; a synthetic crack + chip + grit + dust make it a bullet strike
  const bodies = [
    ['fs:569510', 0, 0.38], ['fs:321477', 0, 0.45], ['fs:476117', 0, 0.45], ['fs:321478', 0, 0.6],
    ['fs:476117', 1.0, 1.45], ['fs:513694', 0.08, 0.5], ['fs:476117', 2.0, 2.4], ['fs:569510', 0, 0.38],
  ];
  const out = [];
  for (const [k, [id, s, e]] of bodies.entries()) {
    const r = ctx.rng(`concrete${k}`);
    let body = H.align(await H.load(id, s, e, { hp: 130 }), -30);
    if (id === 'fs:569510') body = lib.eq(body, [{ type: 'peak', f: 1900, gain: -9, q: 5 }]); // tame the stone's 1.9 kHz ring
    body = lib.varispeedSemis(body, k === 7 ? 3.2 : r.range(-1.5, 1.5));
    body = lib.eq(body, [{ type: 'hp', f: 160, order: 2 }, { type: 'lowshelf', f: 300, gain: -2 }, { type: 'peak', f: r.range(1800, 2800), gain: 3, q: 1 }]);
    body = H.detone(body, { minProm: 11, fmax: 12000 }); // fs:476117 bonks at ~380 Hz, fs:569510 rings at 1.9 kHz, fs:321478 at 5.5 kHz
    const v = H.mix([
      { buf: H.norm(body), gain: 0 },
      { buf: H.norm(H.crack(`cc${k}`, { hp: r.range(2200, 3500), decay: r.range(0.004, 0.008) })), gain: -7 }, // the clipper shaves this spike anyway: keep it from driving the body into the knee
      { buf: H.norm(H.tock(`ct${k}`, r.range(1300, 2400), { q: 4, decay: r.range(0.015, 0.03) })), gain: -9 },
      { buf: H.norm(H.grit(`cg${k}`, { dur: 0.35, density: r.range(250, 450), decay: r.range(0.15, 0.25), hp: 3000 })), at: 0.004, gain: -15 },
      { buf: H.norm(H.puff(`cp${k}`, { dur: 0.35, decay: 0.22, hp: 500, lp: 3500 })), at: 0.002, gain: -21 },
      { buf: H.norm(H.thud(`cl${k}`, { f0: r.range(240, 300), f1: r.range(120, 150), decay: 0.05 })), gain: -13 },
    ]);
    out.push(H.shape(H.fit(v, 0.4, 0.28), -18, { sustain: 6 }));
  }
  return out;
}

async function impactMetal(lib, ctx, H) {
  // real bullet strikes on steel (fs:144444, clipped transients -> soft-clipped) + an inharmonic plate ring for the
  // characteristic "ptang"; two variants use the heavy ping recording instead of the synthetic ring
  const times = [6.587, 7.12, 8.896, 9.251, 10.966, 11.985, 7.437, 8.173];
  const out = [];
  for (const [k, t] of times.entries()) {
    const r = ctx.rng(`metal${k}`);
    let body = H.align(await H.load('fs:144444', t - 0.006, t + 0.42, { hp: 180 }), -24);
    body = H.fit(body, 0.4, 0.3);
    body = lib.softClip(H.norm(body), { threshold: -6, ceiling: -0.5 });
    const base = r.range(1700, 3300);
    const ring = k % 4 === 3
      ? lib.varispeedSemis(H.align(await H.load('fs:351371', 0.02, 0.42, { hp: 300 }), -30), r.range(-2, 2))
      : H.ring(`mr${k}`, base, [[1, 1, r.range(0.25, 0.45)], [1.47, 0.6, 0.22], [2.09, 0.45, 0.16], [2.76, 0.35, 0.12], [3.91, 0.2, 0.07]], 0.5);
    const v = H.mix([
      { buf: H.norm(body), gain: 0 },
      { buf: H.norm(H.crack(`mc${k}`, { hp: 3000, decay: 0.004 })), gain: -6 },
      { buf: H.norm(ring), at: 0.0015, gain: k % 4 === 3 ? -5 : r.range(-13, -10) },
      { buf: H.norm(H.grit(`mg${k}`, { dur: 0.25, density: 200, decay: 0.15, hp: 4000 })), at: 0.003, gain: -20 },
    ]);
    out.push(H.shape(H.fit(lib.eq(v, [{ type: 'hp', f: 220, order: 2 }]), 0.5, 0.35), -18));
  }
  return out;
}

async function impactWood(lib, ctx, H) {
  // hard mid-range "thock" (rocks hitting wood — Kenney's wood hits are 60-150 Hz crate booms, so they only add a
  // little low-mid knock) + splinter crackle from real wood cracking
  const prim = [
    ['fs:319226', 0.15, 0.36, 0], ['fs:319228', 0.08, 0.26, 0], ['fs:319227', 0.05, 0.3, 0], ['fs:183453', 1.0, 1.4, 0],
    ['fs:319226', 0.15, 0.36, -2.5], ['fs:319228', 0.08, 0.26, 2], ['fs:183453', 0.06, 0.6, -1], ['fs:319227', 0.05, 0.3, -2],
  ];
  const splinterSrc = H.mono(await ctx.load('fs:183451', { start: 0.1, end: 1.45 }));
  const branch = H.align(await H.load('fs:164472', 0.05, 0.63, { hp: 400 }), -30);
  const out = [];
  for (const [k, [id, s, e, semis]] of prim.entries()) {
    const r = ctx.rng(`wood${k}`);
    const raw = await H.load(id, s, e, { hp: 120 });
    let body = k === 6 ? H.fromPeak(raw, 0.006) : H.align(raw, -30);
    body = lib.varispeedSemis(body, semis + r.range(-0.8, 0.8));
    const knock = H.align(await H.load(H.kenney(`impactWood_light_00${k % 5}`), 0, 0.27, { hp: 150 }), -30);
    const splinter = k % 3 === 2 ? branch : lib.hp(H.sliceRand(splinterSrc, 0.16, r), 1500, 2);
    const v = H.mix([
      { buf: H.norm(lib.eq(body, [{ type: 'peak', f: r.range(700, 1100), gain: 3, q: 1.2 }])), gain: 0 },
      { buf: H.norm(knock), gain: r.range(-9, -6) },
      { buf: H.norm(H.crack(`wc${k}`, { hp: 2000, decay: 0.005, lp: 12000 })), gain: -8 },
      { buf: H.norm(lib.fadeOut(lib.fadeIn(splinter, 0.004), 0.06, 'exp')), at: r.range(0.004, 0.012), gain: r.range(-14, -10) },
      { buf: H.norm(H.grit(`wg${k}`, { dur: 0.3, density: 160, decay: 0.15, hp: 2000, lp: 9000 })), at: 0.006, gain: -20 },
    ]);
    out.push(H.shape(H.fit(lib.eq(v, [{ type: 'hp', f: 130, order: 2 }]), 0.32, 0.22), -19));
  }
  return out;
}

async function impactDirt(lib, ctx, H) {
  // dull "thup" into soil + a rain of dirt particles + a dusty "pff"
  const thuds = [
    ['fs:319214', 0.25, 0.42], ['fs:445109', 0.0, 0.36], ['fs:319214', 3.74, 3.92], ['fs:789388', 0.236, 0.8],
    ['fs:319214', 5.47, 5.63], ['fs:319222', 0.21, 0.6], ['fs:319214', 10.26, 10.46], ['fs:319214', 13.56, 13.73],
  ];
  const out = [];
  for (const [k, [id, s, e]] of thuds.entries()) {
    const r = ctx.rng(`dirt${k}`);
    let body = H.align(await H.load(id, s, e, { hp: 70 }), -30);
    body = lib.varispeedSemis(body, r.range(-2, 1));
    const v = H.mix([
      { buf: H.norm(lib.eq(body, [{ type: 'peak', f: 300, gain: 2, q: 0.8 }])), gain: 0 },
      { buf: H.norm(H.crack(`dc${k}`, { hp: 1600, lp: 8000, decay: 0.004 })), gain: -11 },
      { buf: H.norm(H.thud(`dl${k}`, { f0: r.range(170, 210), f1: 85, decay: 0.06, drive: 2 })), gain: -10 },
      { buf: H.norm(H.puff(`dp${k}`, { dur: 0.35, decay: 0.2, hp: 250, lp: 2600 })), at: 0.002, gain: -11 },
      { buf: H.norm(H.grit(`dg${k}`, { dur: 0.5, density: r.range(250, 400), decay: r.range(0.3, 0.42), hp: 1200, lp: 7000, attack: 0.02 })), at: 0.012, gain: -13 },
    ]);
    out.push(H.shape(H.tilt(H.weight(H.fit(v, 0.5, 0.35), 120, -8), 2.5), -19, { sustain: 5 }));
  }
  return out;
}

async function impactGlass(lib, ctx, H) {
  // crack of the pane + shatter + a few late tinkles of falling shards
  const cracks = [['fs:221528', 0.33, 0.8], ['fs:418194', 0, 0.56], ['fs:806423', 0, 0.66], [H.kenney('impactGlass_heavy_000'), 0, 0.24], ['fs:608677', 0, 0.5], [H.kenney('impactGlass_heavy_003'), 0, 0.17]];
  const shatters = [['fs:244238', 0.2, 1.4], ['fs:202093', 0.26, 1.28], ['fs:249549', 0.86, 1.9]];
  const shatterBufs = [];
  for (const [id, s, e] of shatters) shatterBufs.push(lib.hp(H.mono(await ctx.load(id, { start: s, end: e })), 2200, 2));
  const tinkle = H.align(await H.load('fs:203381', 0, 0.33, { hp: 2500 }), -30);
  const out = [];
  for (const [k, [id, s, e]] of cracks.entries()) {
    const r = ctx.rng(`glass${k}`);
    let crack = H.align(await H.load(id, s, e, { hp: id.startsWith('kenney') ? 1000 : 400 }), -30);
    // Kenney's heavy glass is a bottle: its 620-650 Hz "clunk" note dominated two variants (a window pane is all clink)
    if (id.startsWith('kenney')) crack = H.detone(lib.hp(crack, 1500, 4), { fmin: 300, fmax: 1600, minProm: 8 });
    const sh = H.sliceRand(shatterBufs[k % 3], 0.45, r, 0.05);
    const light = H.align(await H.load(H.kenney(`impactGlass_light_00${k % 5}`), 0, 0.21, { hp: 1500 }), -30);
    const v = H.mix([
      { buf: lib.softClip(H.norm(crack), { threshold: -6, ceiling: -0.5 }), gain: 0 },
      { buf: H.norm(H.crack(`gc${k}`, { hp: 4000, decay: 0.003 })), gain: -6 },
      // the de-clunked Kenney cracks are thinner: sit their shatter lower so the crack still leads
      { buf: H.norm(lib.fadeOut(lib.fadeIn(sh, 0.01), 0.25, 'exp')), at: r.range(0.012, 0.03), gain: r.range(-9, -6) - (id.startsWith('kenney') ? 3 : 0) },
      { buf: H.norm(tinkle), at: r.range(0.16, 0.3), gain: -15 },
      { buf: H.norm(light), at: r.range(0.08, 0.2), gain: -14 },
    ]);
    out.push(H.shape(H.fit(lib.eq(v, [{ type: 'hp', f: 350, order: 2 }]), 0.7, 0.45), -18));
  }
  return out;
}

async function impactWater(lib, ctx, H) {
  // "thwip/plup" entry + spray + a bubble blip
  const plops = [['fs:672574', 0, 0.16], ['fs:178732', 0.86, 1.13], ['fs:672574', 0, 0.16], ['fs:178732', 1.235, 1.48], ['fs:737232', 0, 0.42], ['fs:321490', 0.16, 0.74]];
  const spray = [['fs:398032', 0.02, 0.6], ['fs:321490', 0.16, 0.74], ['fs:212143', 0.0, 0.6]];
  const sprayBufs = [];
  for (const [id, s, e] of spray) sprayBufs.push(H.align(await H.load(id, s, e, { hp: 700 }), -30));
  const out = [];
  for (const [k, [id, s, e]] of plops.entries()) {
    const r = ctx.rng(`water${k}`);
    let body = H.align(await H.load(id, s, e, { hp: 120 }), -30);
    body = lib.varispeedSemis(body, k === 2 ? -3 : r.range(-1.5, 1.5));
    const f0 = r.range(450, 700);
    const blip = lib.applyEnv(lib.tone(0.06, { type: 'sine', freq: [[0, f0], [0.05, f0 * r.range(2.2, 2.8)]] }), lib.expEnv(0.06, { attack: 0.002, t60: 0.05 }));
    const v = H.mix([
      { buf: H.norm(body), gain: 0 },
      { buf: H.norm(sprayBufs[k % 3]), at: r.range(0.008, 0.02), gain: r.range(-8, -5) },
      { buf: H.norm(H.crack(`wc${k}`, { hp: 3000, decay: 0.003 })), gain: -14 },
      { buf: H.norm(blip), at: r.range(0.02, 0.05), gain: -15 },
      { buf: H.norm(H.thud(`wl${k}`, { f0: 200, f1: 110, decay: 0.05 })), gain: -14 },
    ]);
    out.push(H.shape(H.fit(v, 0.55, 0.4), -19, { sustain: 5 }));
  }
  return out;
}

async function ricochet(lib, ctx, H) {
  // real ricochets (harmonic descending whine) with the whine lifted by parallel compression + a synthetic tumbling
  // whine so the "pyeww" reads on small speakers
  const src = [['fs:30932', 0.016, 0.52], ['fs:30932', 0.982, 1.62], ['fs:30932', 1.62, 2.35], ['fs:505238', 0.57, 1.25]];
  const out = [];
  for (const [k, [id, s, e]] of src.entries()) {
    const r = ctx.rng(`ric${k}`);
    let b = H.align(await H.load(id, s, e, { hp: 350 }), -30);
    b = lib.softClip(H.norm(b), { threshold: -8, ceiling: -0.5 });
    const lifted = lib.compress(lib.hp(b, 900, 2), { threshold: -34, ratio: 4, attack: 0.002, release: 0.12, knee: 6, makeup: 0 });
    const T = r.range(0.45, 0.65), f0 = r.range(2600, 4200), drop = r.range(0.45, 0.62);
    const glide = [[0, f0], [T * 0.25, f0 * (1 - (1 - drop) * 0.55)], [T, f0 * drop]];
    let whine = lib.mix([
      lib.tone(T, { type: 'sine', freq: glide }),
      { buf: lib.tone(T, { type: 'sine', freq: glide.map(([t, f]) => [t, f * 1.51]) }), gain: -7 },
      { buf: lib.tone(T, { type: 'sine', freq: glide.map(([t, f]) => [t, f * 2.03]) }), gain: -12 },
    ]);
    // tumbling: fast amplitude flutter + bell envelope
    const fl = r.range(35, 70), env = new Float32Array(whine.length);
    for (let i = 0; i < env.length; i++) { const t = i / 48000; env[i] = Math.min(1, t / 0.01) * Math.exp(-t * 6.5 / T) * (0.75 + 0.25 * Math.sin(2 * Math.PI * fl * t)); }
    whine = lib.applyEnv(whine, env);
    const v = H.mix([
      { buf: H.norm(b), gain: 0 },
      { buf: H.norm(lifted), gain: -6 },
      { buf: H.norm(whine), at: r.range(0.01, 0.03), gain: r.range(-13, -10) },
      { buf: H.norm(H.crack(`rc${k}`, { hp: 3500, decay: 0.004 })), gain: -8 },
    ]);
    out.push(H.shape(H.fit(v, k === 3 ? 0.49 : 0.8, k === 3 ? 0.3 : 0.55), -19)); // #4's whine is short; < 0.5 s also keeps its gated loudness stable
  }
  return out;
}

async function bulletWhiz(lib, ctx, H) {
  // supersonic snap (N-wave) + band-passed doppler whoosh + a faint whistle; one variant uses the recorded fly-by
  const out = [];
  const real = H.align(await H.load('fs:855248', 0, 0.08, { hp: 300 }), -30);
  const subsonic = H.align(await H.load('fs:789222', 0.0, 0.53, { hp: 300 }), -40);
  for (let k = 0; k < 4; k++) {
    const r = ctx.rng(`whiz${k}`);
    const T = r.range(0.22, 0.32);
    // N-wave: sharp rise, linear fall through zero, sharp return (~1 ms) -> high-passed into a "tsk"
    const nLen = Math.round(r.range(0.0007, 0.0012) * 48000), nw = new Float32Array(nLen + 4);
    for (let i = 0; i < nLen; i++) nw[i + 1] = 1 - 2 * (i / nLen);
    const nwave = lib.eq(new lib.Buf([nw], 48000), [{ type: 'hp', f: 900, order: 2 }]);
    const fA = r.range(5000, 7000), fB = r.range(1600, 2400), peakT = r.range(0.025, 0.05);
    const noise = lib.noise(T, { color: 'white', seed: `wn${k}` });
    let wh = lib.sweep(noise, 'bp', (t) => (t < peakT ? fA : fB + (fA - fB) * Math.exp(-(t - peakT) / 0.035)), { q: 3.5 });
    const env = new Float32Array(wh.length);
    for (let i = 0; i < env.length; i++) { const t = i / 48000; env[i] = t < peakT ? (t / peakT) ** 2 : Math.exp(-(t - peakT) * 14); }
    wh = lib.applyEnv(wh, env);
    const ws = lib.applyEnv(lib.tone(T, { type: 'sine', freq: [[0, fA * 0.55], [peakT, fA * 0.5], [peakT + 0.05, fB * 0.8], [T, fB * 0.7]] }), env);
    const v = H.mix([
      k === 1 ? { buf: H.norm(real), gain: 0 } : { buf: H.norm(nwave), at: peakT * 0.6, gain: k === 3 ? -6 : 0 },
      k !== 1 && { buf: H.norm(H.crack(`wk${k}`, { dur: 0.02, decay: 0.006, hp: 1800, lp: 12000 })), at: peakT * 0.6, gain: k === 3 ? -8 : -2 },
      { buf: H.norm(wh), gain: k === 3 ? -10 : -8 },
      { buf: H.norm(ws), gain: -20 },
      k === 3 && { buf: H.norm(subsonic), gain: 0 },
    ]);
    out.push(H.shape(H.fit(v, k === 3 ? 0.5 : T, 0.15), -22, { sustain: 0 })); // keep the snap: a quieter whoosh, not a flattened crack
  }
  return out;
}

// ================================================================================================== flesh / gore
async function impactFlesh(lib, ctx, H) {
  // The most-played sound of the game (every body hit). A tight, meaty "thwack": the wet hit of designed
  // bullet-into-meat impacts (cut at their impact peak) carries the identity; a real punch / meat-slap recording gives
  // the mid "smack" that phone speakers reproduce; a padded low-mid body (Kenney medium punch, 150-600 Hz) and a short
  // pitched knock with harmonics give weight without a sub "boom" (the Kenney *heavy* punches are 60-140 Hz sine booms
  // that vanish on phones and read as a kick drum on headphones); entry "tk" + squelch on top. Each variant's low end is
  // then tilted to the same phone-speaker balance so no hit reads weaker than its siblings.
  const visc = H.mono(await ctx.load('fs:423301', {}));
  const hits = H.peaks(visc, 7, 0.25);
  const punches = H.mono(await ctx.load('fs:241950', {}));
  const punchT = H.peaks(lib.hp(punches, 300, 2), 8, 0.4);
  const smacks = [
    () => H.load('fs:779805', 0, 0.4, { hp: 160 }), () => lib.slice(punches, punchT[1] - 0.004, punchT[1] + 0.25),
    () => H.load('fs:399183', 0.07, 0.38, { hp: 160 }), () => lib.slice(punches, punchT[3] - 0.004, punchT[3] + 0.25),
    () => H.load('fs:390462', 0, 0.4, { hp: 160 }), () => lib.slice(punches, punchT[5] - 0.004, punchT[5] + 0.25),
  ];
  const bodies = ['impactPunch_medium_000', 'impactPunch_medium_001', 'impactPunch_medium_002', 'impactPunch_medium_003', 'impactPunch_medium_001', 'impactPunch_medium_000'];
  const splats = [['fs:495117', 0, 0.5], ['fs:232135', 0, 0.15], ['fs:641040', 0, 0.5], ['fs:495118', 0, 0.6], ['fs:411671', 0.05, 0.3], ['fs:232135', 0, 0.15]];
  const out = [];
  for (let k = 0; k < 6; k++) {
    const r = ctx.rng(`flesh${k}`);
    const t = hits[k % hits.length];
    // stop before the next designed hit's pre-swell creeps in (~170 ms after each hit)
    let wet = lib.eq(lib.fadeOut(H.align(lib.slice(visc, t - 0.012, t + 0.16), -24), 0.05, 'exp'), [{ type: 'hp', f: 110, order: 2 }, { type: 'peak', f: r.range(1500, 2400), gain: 3, q: 1 }]);
    wet = H.detone(wet, { minProm: 12 });
    const smack = lib.eq(H.align(await smacks[k](), -30), [{ type: 'hp', f: 180, order: 2 }, { type: 'peak', f: r.range(700, 1100), gain: 3, q: 0.9 }]);
    const body = H.fit(H.align(await H.load(H.kenney(bodies[k]), 0, 0.3, { hp: 110 }), -30), 0.16, 0.12);
    const sp = H.align(await H.load(...splats[k], { hp: 250 }), -30);
    const v = H.mix([
      { buf: H.norm(wet), gain: 0 },
      { buf: H.norm(H.fit(smack, 0.18, 0.14)), gain: r.range(-6, -4) },
      { buf: H.norm(body), gain: r.range(-6, -4) },
      { buf: H.norm(sp), at: r.range(0.008, 0.02), gain: r.range(-11, -8) },
      { buf: H.norm(H.crack(`fc${k}`, { hp: 3000, decay: 0.003, dur: 0.012 })), gain: -13 },
      { buf: H.norm(H.thud(`fl${k}`, { f0: r.range(220, 260), f1: 100, sweep: 0.015, decay: 0.05, drive: 3 })), gain: -9 },
    ], 0.22); // common length: a sub-400 ms sound is measured over its length, so equal length = equal energy per variant
    out.push(H.shape(H.tilt(H.weight(H.fit(v, 0.22, 0.16), 140, -8), 3), -16, { sustain: 2 }));
  }
  return out;
}

async function headshot(lib, ctx, H) {
  // the most rewarding sound of the game: a crisp bony CRACK (celery snap + synthetic snap) with a hollow skull pop,
  // a wet burst right behind it and a low punch underneath
  const snaps = [['fs:574752', 0.35, 0.6], ['fs:574752', 7.05, 7.3], ['fs:574752', 1.18, 1.46], ['fs:574752', 7.73, 8.0]];
  const pops = [['fs:488659', 0, 0.32], ['fs:355052', 0, 0.45], ['fs:144159', 0.15, 0.6], ['fs:192146', 0.1, 0.5]];
  const wets = [['fs:641046', 0.0, 0.45], ['fs:697829', 0.12, 0.55], ['fs:414296', 0.0, 0.5], ['fs:641040', 0, 0.5]];
  const out = [];
  for (let k = 0; k < 4; k++) {
    const r = ctx.rng(`head${k}`);
    const snap = H.align(await H.load(...snaps[k], { hp: 400 }), -24);
    const pop = H.align(await H.load(...pops[k], { hp: 250 }), -24);
    const wet = H.align(await H.load(...wets[k], { hp: 150 }), -24);
    const low = H.align(await H.load('fs:511194', 0.04, 0.5, { hp: 40 }), -30);
    const v = H.mix([
      { buf: H.norm(lib.eq(snap, [{ type: 'peak', f: 3200, gain: 3, q: 1 }])), gain: 0 },
      { buf: H.norm(H.crack(`hc${k}`, { hp: 3500, decay: 0.004, dur: 0.02 })), gain: -5 },
      { buf: H.norm(H.tock(`ht${k}`, r.range(900, 1300), { q: 3, decay: 0.03 })), at: 0.002, gain: -8 },
      { buf: H.norm(pop), at: r.range(0.006, 0.012), gain: -5 },
      { buf: lib.softClip(H.norm(wet), { threshold: -8, ceiling: -1 }), at: r.range(0.02, 0.032), gain: r.range(-6, -4) }, // crack first, then the splat
      { buf: H.norm(lib.varispeedSemis(low, r.range(-1, 1.5))), at: 0.004, gain: -9 },
      { buf: H.norm(H.thud(`hl${k}`, { f0: 190, f1: 75, decay: 0.1, drive: 2 })), gain: -9 },
    ], 0.46); // one length for all four: < 0.5 s keeps each in a single 400 ms loudness block (0.44 vs 0.5 s measured 3 dB apart)
    out.push(H.shape(H.weight(H.fit(v, 0.46, 0.32), 120, -6), -16, { sustain: 0 }));
  }
  return out;
}

async function gib(lib, ctx, H) {
  // splatter burst + bone snap + wet tearing + chunks landing
  const rip = H.mono(await ctx.load('fs:234236', {}));
  const ripT = H.peaks(rip, 4, 0.6);
  const splats = [['fs:414296', 0, 0.9], ['fs:641046', 0.0, 0.9], ['fs:641040', 0, 0.9], ['fs:414296', 0, 0.9]];
  const snaps = [['fs:574752', 3.59, 4.2], ['fs:574752', 5.51, 5.93], ['fs:574752', 2.52, 2.83], ['fs:215140', 0.2, 0.9]];
  const extra = [['fs:385965', 0.05, 1.0], ['fs:269483', 0.0, 1.0], ['fs:385965', 0.05, 1.0], ['fs:504615', 0.05, 0.7]];
  const chunk = H.align(await H.load('fs:232135', 0, 0.15, { hp: 200 }), -30);
  const out = [];
  for (let k = 0; k < 4; k++) {
    const r = ctx.rng(`gib${k}`);
    const sp = H.align(await H.load(...splats[k], { hp: 80 }), -24);
    const sn = H.align(await H.load(...snaps[k], { hp: 400 }), -24);
    const ex = H.align(await H.load(...extra[k], { hp: 200 }), -30);
    const t = ripT[k % ripT.length];
    const tear = lib.hp(H.align(lib.slice(rip, t - 0.02, t + 0.4), -30), 200, 2);
    const v = H.mix([
      { buf: lib.softClip(H.norm(k === 3 ? lib.varispeedSemis(sp, -2) : sp), { threshold: -8, ceiling: -1 }), gain: 0 },
      { buf: H.norm(sn), at: 0.004, gain: r.range(-7, -4) },
      { buf: H.norm(tear), at: r.range(0.04, 0.08), gain: -5 },
      { buf: H.norm(ex), at: r.range(0.02, 0.06), gain: -9 },
      { buf: H.norm(H.thud(`gl${k}`, { f0: 160, f1: 60, decay: 0.15, drive: 2 })), gain: -6 },
      { buf: H.norm(lib.varispeedSemis(chunk, r.range(-3, 0))), at: r.range(0.28, 0.4), gain: -14 },
      { buf: H.norm(lib.varispeedSemis(chunk, r.range(-5, -1))), at: r.range(0.45, 0.6), gain: -18 },
    ]);
    out.push(H.shape(H.weight(H.fit(v, 0.85, 0.5), 120, -6), -18));
  }
  return out;
}

async function bloodSplat(lib, ctx, H) {
  const sets = [
    [['fs:495117', 0, 0.52], ['fs:232135', 0, 0.15], 0.04],
    [['fs:495118', 0, 0.66], ['fs:237386', 7.62, 7.9], 0.01],
    [['fs:414296', 2.24, 2.5], ['fs:445109', 0, 0.36], 0.0],
  ];
  const out = [];
  for (const [k, [a, b, at]] of sets.entries()) {
    const A = H.align(await H.load(...a, { hp: 150 }), -30);
    const B = H.align(await H.load(...b, { hp: 150 }), -30);
    const v = H.mix([{ buf: H.norm(A), gain: 0 }, { buf: H.norm(B), at, gain: -7 }, { buf: H.norm(H.puff(`bp${k}`, { dur: 0.2, decay: 0.12, hp: 400, lp: 2500 })), gain: -18 }]);
    out.push(H.shape(H.fit(v, 0.5, 0.3), -21));
  }
  return out;
}

async function boneCrunch(lib, ctx, H) {
  const sets = [
    [['fs:355052', 0, 0.62], ['fs:574752', 7.73, 8.0], -6],
    [['fs:192146', 0.1, 0.7], ['fs:574752', 0.35, 0.6], -4],
    [['fs:215140', 0.2, 0.95], ['fs:144159', 0.15, 0.6], -6],
  ];
  const out = [];
  for (const [k, [a, b, g]] of sets.entries()) {
    const A = H.align(await H.load(...a, { hp: 120 }), -30);
    const B = H.align(await H.load(...b, { hp: 300 }), -24);
    const v = H.mix([
      { buf: H.norm(A), gain: 0 },
      { buf: H.norm(B), at: 0.002, gain: g },
      { buf: H.norm(H.thud(`bl${k}`, { f0: 170, f1: 80, decay: 0.08, drive: 1.5 })), gain: -10 },
    ]);
    out.push(H.shape(H.weight(H.fit(v, 0.65, 0.4), 120, -8), -19));
  }
  return out;
}

async function knifeFlesh(lib, ctx, H) {
  const stabs = [['fs:179222', 0.15, 0.56], ['fs:411742', 0.36, 0.78], ['fs:504615', 0.05, 0.7], ['fs:420674', 0.0, 0.37]];
  const out = [];
  for (const [k, s] of stabs.entries()) {
    const r = ctx.rng(`kf${k}`);
    // slash recordings swell into their hit: start a few ms before the peak (the swing is its own sound)
    const raw = await H.load(...s, { hp: 120 });
    const stab = k >= 2 ? H.fromPeak(raw, 0.008) : H.align(raw, -30);
    const punch = H.align(await H.load(H.kenney(`impactPunch_medium_00${k}`), 0, 0.4, { hp: 50 }), -30);
    const v = H.mix([
      { buf: lib.softClip(H.norm(stab), { threshold: -8, ceiling: -1 }), gain: 0 },
      { buf: H.norm(punch), gain: r.range(-6, -4) },
      { buf: H.norm(await H.load('fs:232135', 0, 0.15, { hp: 300 })), at: r.range(0.01, 0.03), gain: -12 },
      { buf: H.norm(H.thud(`kl${k}`, { f0: 170, f1: 80, decay: 0.07 })), gain: -12 },
    ]);
    out.push(H.shape(H.weight(H.fit(v, 0.48, 0.3), 120, -8), -18));
  }
  return out;
}

async function knifeWall(lib, ctx, H) {
  // steel blade into concrete: a recorded thrust/stone hit + a short blade "tink" + chips
  const out = [];
  const thrust = H.align(await H.load('fs:504618', 0.1, 0.77, { hp: 120 }), -30);
  const stone = H.align(await H.load('fs:569510', 0, 0.3, { hp: 200 }), -30);
  const conc = H.align(await H.load('fs:321477', 0, 0.4, { hp: 150 }), -30);
  const blades = [H.kenney('impactMetal_light_001'), H.kenney('impactMetal_light_003'), H.kenney('impactMetal_light_000')];
  for (let k = 0; k < 3; k++) {
    const r = ctx.rng(`kw${k}`);
    // a blade into stone goes 'tchk' with a SHORT ring; Kenney's light metal hits ring on for 300 ms like a dropped can
    const blade = lib.decay(H.align(await H.load(blades[k], 0, 0.35, { hp: 600 }), -30), 0.14, 0.01);
    const base = k === 0 ? thrust : k === 1 ? stone : conc;
    const tink = H.ring(`kt${k}`, r.range(2800, 4200), [[1, 1, 0.18], [1.73, 0.5, 0.1], [2.6, 0.3, 0.06]], 0.3);
    const v = H.mix([
      { buf: H.norm(lib.varispeedSemis(base, r.range(-1, 1.5))), gain: 0 },
      { buf: H.norm(blade), gain: k === 0 ? -9 : -8 },
      { buf: H.norm(tink), at: 0.001, gain: -15 },
      { buf: H.norm(H.crack(`kc${k}`, { hp: 2500, decay: 0.004 })), gain: -8 },
      { buf: H.norm(H.grit(`kg${k}`, { dur: 0.3, density: 250, decay: 0.16, hp: 3000 })), at: 0.004, gain: -17 },
    ]);
    out.push(H.shape(H.fit(lib.eq(v, [{ type: 'hp', f: 150, order: 2 }]), 0.5, 0.35), -18));
  }
  return out;
}

async function meleeHeavy(lib, ctx, H) {
  const sets = [['fs:399183', 0.07, 0.38], ['fs:390462', 0, 0.67], ['fs:779805', 0, 0.4]];
  const bodies = [H.kenney('impactPunch_medium_001'), H.kenney('impactPunch_medium_003'), H.kenney('impactPunch_medium_000')]; // low-mid body, not a sub boom
  const low = H.mono(await ctx.load('fs:241950', { start: 4.6, end: 5.1 }));
  const out = [];
  for (const [k, s] of sets.entries()) {
    const r = ctx.rng(`mh${k}`);
    const hit = H.align(await H.load(...s, { hp: 60 }), -30);
    const body = H.align(await H.load(bodies[k], 0, 0.5, { hp: 45 }), -30);
    // weight comes from a SHORT pitched thump + harmonics; the mid "smack" of the recording stays on top
    const v = H.mix([
      { buf: lib.softClip(H.norm(lib.eq(hit, [{ type: 'peak', f: 1200, gain: 3, q: 0.8 }])), { threshold: -8, ceiling: -1 }), gain: 0 },
      { buf: H.norm(H.fit(body, 0.25, 0.18)), gain: -6 },
      { buf: H.norm(H.fit(H.align(low, -30), 0.2, 0.15)), gain: -10 },
      { buf: H.norm(H.thud(`ml${k}`, { f0: r.range(160, 190), f1: 70, decay: 0.07, drive: 3 })), gain: -10 },
      { buf: H.norm(lib.noiseBurst({ dur: 0.06, decay: 0.035, bp: r.range(700, 1100), q: 0.7, seed: `ms${k}` })), gain: -8 },
      { buf: H.norm(H.puff(`mp${k}`, { dur: 0.12, decay: 0.06, hp: 1500, lp: 6000 })), gain: -16 },
    ]);
    out.push(H.shape(H.tilt(H.weight(H.fit(lib.eq(v, [{ type: 'hp', f: 55, order: 2 }]), 0.38, 0.26), 120, -4), 2.5), -17));
  }
  return out;
}

async function armorHit(lib, ctx, H) {
  // padded "thwack" on a plate carrier: soft heavy hit + hard plate tock + fabric burst + ceramic tick
  const plates = ['impactPlate_light_001', 'impactPlate_light_003', 'impactPlate_medium_001']; // the 'heavy' plates are ~100 Hz booms
  const softs = ['impactPunch_medium_000', 'impactPunch_medium_001', 'impactPunch_medium_003'];
  const out = [];
  for (let k = 0; k < 3; k++) {
    const r = ctx.rng(`armor${k}`);
    const plate = H.align(await H.load(H.kenney(plates[k]), 0, 0.5, { hp: 120 }), -30);
    // the plate's hard "thwack" leads (mid-range reads on phones); the padded body is only a short low support
    const soft = H.fit(H.align(await H.load(H.kenney(softs[k]), 0, 0.5, { hp: 150 }), -30), 0.2, 0.15);
    const v = H.mix([
      { buf: H.norm(lib.eq(H.fit(plate, 0.28, 0.2), [{ type: 'peak', f: r.range(900, 1400), gain: 3, q: 0.8 }])), gain: 0 },
      { buf: H.norm(soft), gain: -5 },
      { buf: H.norm(lib.noiseBurst({ dur: 0.05, decay: 0.03, bp: r.range(900, 1500), q: 0.7, seed: `as${k}` })), gain: -7 },
      { buf: H.norm(lib.noiseBurst({ dur: 0.08, decay: 0.045, bp: r.range(2200, 3200), q: 0.8, seed: `af${k}` })), at: 0.003, gain: -12 },
      { buf: H.norm(H.ring(`ar${k}`, r.range(2200, 2800), [[1, 1, 0.05], [2.3, 0.5, 0.03]], 0.1)), gain: -17 },
      { buf: H.norm(H.thud(`al${k}`, { f0: 170, f1: 95, decay: 0.05, drive: 1.5 })), gain: -13 },
    ]);
    out.push(H.shape(H.fit(lib.eq(v, [{ type: 'hp', f: 100, order: 2 }]), 0.3, 0.2), -18));
  }
  return out;
}

async function bodyFall(lib, ctx, H) {
  // corpse on the street: torso thud + flesh slap + a late limb/head knock
  const mains = [['fs:504617', 0.11, 1.12], ['fs:395331', 0, 0.83], ['fs:504626', 0.08, 1.43], ['fs:187136', 0.3, 0.96]];
  // padded torso slap in the 150-600 Hz band (Kenney's impactSoft_heavy / impactPunch_heavy are ~100 Hz sine booms)
  const slaps = ['impactPunch_medium_002', 'impactPunch_medium_000', 'impactPunch_medium_003', 'impactPunch_medium_001'];
  const late = H.align(await H.load('fs:82027', 0, 0.35, { hp: 60 }), -30);
  const out = [];
  for (const [k, m] of mains.entries()) {
    const r = ctx.rng(`fall${k}`);
    const main = H.align(await H.load(...m, { hp: 40 }), -36);
    const slap = H.align(await H.load(H.kenney(slaps[k]), 0, 0.5, { hp: 90 }), -30);
    const v = H.mix([
      { buf: H.norm(main), gain: 0 },
      { buf: H.norm(slap), at: r.range(0.0, 0.01), gain: r.range(-9, -7) },
      { buf: H.norm(H.thud(`bt${k}`, { f0: r.range(130, 150), f1: 55, decay: 0.14, drive: 2.5 })), gain: -11 },
      { buf: H.norm(lib.varispeedSemis(late, r.range(-3, 2))), at: r.range(0.16, 0.26), gain: r.range(-14, -10) },
      { buf: H.norm(H.grit(`bg${k}`, { dur: 0.4, density: 120, decay: 0.3, hp: 1500, lp: 7000 })), at: 0.01, gain: -24 },
    ]);
    out.push(H.shape(H.tilt(H.weight(H.fit(v, 1.0, 0.6), 120, -5), 3), -19));
  }
  return out;
}

async function killThud(lib, ctx, H) {
  // synthesized: a short tuned sub punch + harmonics (audible on phones) + a felt "puff"
  const out = [];
  for (let k = 0; k < 2; k++) {
    const t = H.thud(`kt${k}`, { f0: k ? 150 : 135, f1: k ? 60 : 55, sweep: 0.03, decay: 0.2, drive: 2.5, click: 0.04 });
    const v = H.mix([
      { buf: H.norm(t), gain: 0 },
      { buf: H.norm(H.puff(`kp${k}`, { dur: 0.12, decay: 0.07, hp: 120, lp: 900 })), gain: -16 },
    ]);
    out.push(H.shape(H.weight(H.fit(v, 0.28, 0.2), 130, -2), -22));
  }
  return out;
}

// ================================================================================================== explosives
/** Shared explosion layers: snap, pitched sub + harmonics, debris rain. */
function blastLayers(lib, H, seed, { sub = [110, 38, 0.6], debrisDur = 1.6, debrisAt = 0.18, crackGain = -6 } = {}) {
  return [
    { buf: H.norm(H.crack(`${seed}c`, { dur: 0.08, decay: 0.022, hp: 1100, lp: 12000 })), gain: crackGain },
    { buf: H.norm(H.thud(`${seed}s`, { f0: sub[0], f1: sub[1], sweep: 0.06, decay: sub[2], drive: 2 })), gain: -4 },
    { buf: H.norm(H.grit(`${seed}d`, { dur: debrisDur, density: 70, decay: debrisDur * 0.75, hp: 1500, lp: 7000, attack: 0.08, tick: 0.003 })), at: debrisAt, gain: -16 },
  ];
}

async function explosionSmall(lib, ctx, H) {
  const dirt = lib.hp(H.mono(await ctx.load('fs:703248', { start: 0.25, end: 2.2 })), 300, 2);
  const out = [];
  const mains = [
    async () => H.load('fs:609587', 0, 2.4, { ch: 'L', hp: 30 }),
    async () => lib.varispeedSemis(await H.load('fs:609587', 0, 2.4, { ch: 'R', hp: 30 }), -1.5),
    async () => H.mix([{ buf: H.norm(await H.load('fs:523089', 0, 1.24, { hp: 30 })), gain: 0 }, { buf: H.norm(lib.lp(await H.load('fs:258195', 0, 2.2, { hp: 25 }), 220, 2)), gain: -7 }]),
  ];
  for (let k = 0; k < 3; k++) {
    const r = ctx.rng(`exs${k}`);
    const main = lib.fadeOut(H.align(await mains[k](), -30), 0.6, 'exp');
    const v = H.mix([
      { buf: H.norm(main), gain: 0 },
      ...blastLayers(lib, H, `exs${k}`, { sub: [r.range(100, 125), 38, 0.6] }),
      { buf: H.norm(lib.fadeIn(dirt, 0.15, 'sine')), at: r.range(0.2, 0.3), gain: -15 },
    ]);
    const room = lib.reverb(v, 'urban', { wet: 0.12, seed: `exr${k}`, channels: 1, length: 1.6 });
    out.push(H.shape(H.tilt(H.weight(H.fit(room, 2.4, 1.6), 110, -3), 5, { f: 120, maxCut: -9 }), -16, { sustain: 1 }));
  }
  return out;
}

async function explosionLarge(lib, ctx, H) {
  const debris = lib.hp(H.mono(await ctx.load('fs:703247', { start: 0.0, end: 3.4 })), 120, 2);
  const crash = lib.hp(H.mono(await ctx.load('fs:366086', { start: 0.0, end: 3.5 })), 100, 2);
  const tank = H.align(await H.load('fs:530209', 0, 1.6, { hp: 200 }), -30);
  const fire = H.align(await H.load('fs:412558', 0, 2.5, { hp: 60 }), -30);
  const mains = [
    async () => H.load('fs:398283', 0, 3.05, { ch: 'L', hp: 28 }),
    async () => H.load('fs:516914', 0.3, 4.6, { hp: 28 }),
    async () => H.load('fs:563010', 0.62, 4.9, { hp: 28 }),
  ];
  const out = [];
  for (let k = 0; k < 3; k++) {
    const r = ctx.rng(`exl${k}`);
    const main = lib.fadeOut(H.align(await mains[k](), -24), 0.8, 'exp');
    const v = H.mix([
      { buf: H.norm(main), gain: 0 },
      ...blastLayers(lib, H, `exl${k}`, { sub: [r.range(80, 95), 30, 1.3], debrisDur: 3, debrisAt: 0.3, crackGain: -5 }),
      { buf: H.norm(lib.fadeIn(k === 1 ? crash : debris, 0.2, 'sine')), at: r.range(0.3, 0.45), gain: -11 },
      k === 0 && { buf: H.norm(tank), at: 0.25, gain: -14 },                    // barrel: metal shrapnel rain
      k !== 1 && { buf: H.norm(lib.saturate(fire, { drive: 6, type: 'tube' })), at: 0.04, gain: -10 }, // fireball roar
    ]);
    const room = lib.reverb(v, 'urban', { wet: 0.14, seed: `exlr${k}`, channels: 1, length: 2.2 });
    out.push(H.shape(H.tilt(H.weight(H.fit(room, 3.8, 2.6), 110, -2), 6, { f: 120, maxCut: -9 }), -15, { sustain: 1 }));
  }
  return out;
}

async function explosionFar(lib, ctx, H) {
  // distant recordings are almost pure sub (nothing a phone plays): keep them as the body, add the band-limited mid
  // "pop" of a grenade heard from 250 m and harmonics that imply the rumble
  const grenade = lib.fadeOut(H.align(await H.load('fs:609587', 0, 1.6, { ch: 'L' }), -30), 0.6, 'exp');
  const blast = H.align(await H.load('fs:523089', 0, 1.24), -30);
  const fars = [
    lib.farLayer(grenade, { distance: 220, env: 'urban', seed: 'exf0', length: 3.2, direct: 0.55 }),
    lib.farLayer(blast, { distance: 340, env: 'field', seed: 'exf1', length: 3.4, direct: 0.4, lowBoost: 5 }),
  ];
  const mains = [['fs:209769', 7.78, 10.4], ['oga_distant_explosion/NenadSimic - Muffled Distant Explosion', 0, 4.0]];
  const out = [];
  for (const [k, m] of mains.entries()) {
    const main = lib.fadeOut(H.align(await H.load(...m, { hp: 30 }), -30), 0.9, 'exp');
    const v = H.mix([
      { buf: H.norm(main), gain: 0 },
      { buf: H.norm(fars[k]), at: k ? 0.012 : 0.0, gain: k ? -2 : -4 },
      { buf: H.norm(H.thud(`efs${k}`, { f0: k ? 62 : 74, f1: 35, sweep: 0.1, decay: k ? 1.5 : 1.1, drive: 1.5 })), gain: -8 },
    ]);
    out.push(H.shape(H.tilt(H.weight(H.fit(lib.lp(v, 2500, 2), 3.5, 2.4), 140, 0), 6, { f: 120, maxCut: -9 }), -22));
  }
  return out;
}

async function grenadeBounce(lib, ctx, H) {
  // a steel body (~400 g) clunking on concrete: dull clank + short ring + concrete tick; one variant double-bounces
  const metals = [H.kenney('impactMetal_heavy_000'), 'fs:259553', H.kenney('impactMetal_heavy_002')];
  const out = [];
  for (let k = 0; k < 3; k++) {
    const r = ctx.rng(`gb${k}`);
    const m = H.align(await (k === 1 ? H.load('fs:259553', 0.15, 0.34, { hp: 150 }) : H.load(metals[k], 0, 0.36, { hp: 150 })), -30);
    const tin = H.align(await H.load(H.kenney(`impactTin_medium_00${k + 1}`), 0, 0.2, { hp: 200 }), -30);
    const gen = H.align(await H.load(H.kenney(`impactGeneric_light_00${k}`), 0, 0.14, { hp: 150 }), -30);
    const ring = H.ring(`gbr${k}`, r.range(1100, 1600), [[1, 1, 0.12], [2.32, 0.4, 0.07], [3.7, 0.2, 0.04]], 0.2);
    const one = H.mix([
      { buf: H.norm(m), gain: 0 },
      { buf: H.norm(gen), gain: -5 },
      { buf: H.norm(tin), gain: -9 },
      { buf: H.norm(ring), at: 0.001, gain: -13 },
      { buf: H.norm(H.crack(`gbc${k}`, { hp: 2500, decay: 0.003, dur: 0.015 })), gain: -10 },
    ]);
    const v = k === 2 ? H.mix([{ buf: one }, { buf: lib.varispeedSemis(one, 1.2), at: r.range(0.09, 0.12), gain: -9 }]) : one;
    out.push(H.shape(H.fit(v, 0.32, 0.22), -20));
  }
  return out;
}

async function fireBurst(lib, ctx, H) {
  // molotov: bottle smash, then the petrol catching — a low "fwoomp" with a synthesized flame roar on top (the CC0
  // fire whooshes are almost all < 150 Hz) — then crackle
  const smashes = [['fs:202093', 0.24, 1.3], ['fs:244238', 0.18, 1.4], ['fs:221528', 0.33, 0.8]];
  const whooshes = [['fs:260554', 0, 1.95], ['fs:412558', 0, 2.5], ['fs:260555', 0, 1.9]];
  const crack = lib.hp(H.mono(await ctx.load('fs:563765', { start: 3, end: 6 })), 150, 2);
  const out = [];
  for (let k = 0; k < 3; k++) {
    const r = ctx.rng(`fire${k}`);
    const smash = H.align(await H.load(...smashes[k], { hp: 500 }), -30);
    const wh = H.align(await H.load(...whooshes[k], { hp: 90 }), -30);
    const T = 1.6;
    // flame roar: pink noise through a slowly rising band-pass with flutter, swelling in ~120 ms
    const roarN = lib.noise(T, { color: 'pink', seed: `fr${k}` });
    let roar = lib.sweep(roarN, 'bp', (t) => 500 + 900 * Math.min(1, t / 0.15) * Math.exp(-t / 1.2), { q: 0.7 });
    const env = new Float32Array(roar.length);
    for (let i = 0; i < env.length; i++) { const t = i / 48000; env[i] = Math.min(1, (t / 0.12) ** 1.5) * Math.exp(-t * 2.2) * (0.8 + 0.2 * Math.sin(2 * Math.PI * 13 * t + k)); }
    roar = lib.applyEnv(roar, env);
    const v = H.mix([
      { buf: lib.softClip(H.norm(smash), { threshold: -6, ceiling: -1 }), gain: -1 },
      { buf: H.norm(lib.saturate(wh, { drive: 8, type: 'tube' })), at: r.range(0.03, 0.06), gain: -6 },
      { buf: H.norm(roar), at: 0.04, gain: -1 },
      { buf: H.norm(H.thud(`fl${k}`, { f0: 95, f1: 45, sweep: 0.05, decay: 0.45, drive: 2 })), at: 0.04, gain: -6 },
      { buf: H.norm(lib.fadeIn(H.sliceRand(crack, 1.8, r), 0.3, 'sine')), at: 0.35, gain: -10 },
      { buf: H.norm(H.grit(`fg${k}`, { dur: 1.8, density: 45, decay: 1.6, hp: 1500, lp: 9000, tick: 0.004 })), at: 0.2, gain: -14 },
    ]);
    out.push(H.shape(H.weight(H.fit(v, 2.3, 1.4), 120, -3), -16));
  }
  return out;
}

async function debrisFall(lib, ctx, H) {
  // rubble landing: an immediate chunk impact, then the cascade of smaller pieces
  const out = [];
  const a = H.align(await H.load('fs:703247', 0, 3.0, { hp: 60 }), -30);
  const b = H.align(await H.load('fs:703248', 0, 2.6, { hp: 60 }), -30);
  const c = H.align(await H.load('fs:758580', 0, 1.0, { hp: 60 }), -30);
  const d = H.align(await H.load('fs:232137', 0, 0.73, { hp: 80 }), -30);
  const chunk = H.align(await H.load('fs:476117', 2.0, 2.4, { hp: 80 }), -30);          // a stone slab hit (2 ms attack)
  out.push(H.shape(H.fit(H.mix([
    { buf: H.norm(lib.varispeedSemis(chunk, -3)), gain: -2 },                           // first chunk lands at once
    { buf: H.norm(H.crack('dfc', { dur: 0.05, decay: 0.012, hp: 1200, lp: 9000 })), gain: -9 },
    { buf: H.norm(a), at: 0.03 },
    { buf: H.norm(H.grit('df0', { dur: 2, density: 50, decay: 1.6, hp: 2000, lp: 8000, tick: 0.003 })), at: 0.1, gain: -18 },
  ]), 2.8, 1.6), -19));
  out.push(H.shape(H.fit(H.mix([{ buf: H.norm(c) }, { buf: H.norm(b), at: 0.05, gain: -2 }, { buf: H.norm(d), at: 0.6, gain: -8 }]), 2.6, 1.5), -19));
  return out;
}
