# Audio pipeline — 災厄前線 CALAMITY FRONT

Every sound the game plays is **built offline** by small Node scripts ("producers") from CC0 recordings and
synthesis, mastered to fixed loudness targets, encoded to Ogg Vorbis and described by JSON manifests that the
runtime engine (`game/src/engine/audio.js`) loads. Shooting feel is the top priority of the project, so gunshots get
the most care: layered (mech / transient+body / sub / tail), punchy, loud yet clean, distinct per weapon.

**Legal rule.** Only **CC0** material (or sound we synthesize) may be used. Never download, rip or imitate-by-copy
audio from a game, film or any non-CC0 source. Every downloaded file is licence-checked on its own page by
`fetch.mjs` and listed (URL, author, licence, which category used it) in `docs/CREDITS.md`, generated automatically.

```
tools/audio/
  lib/*.mjs          the toolkit (decode/encode, DSP, loudness, reverb, analysis...) — `import * as lib from './lib/index.mjs'`
  sources.mjs        catalogue of CC0 packs + Freesound ids        sources.d/<you>.json   your extra Freesound ids
  fetch.mjs          downloads + verifies + analyses sources -> tools/audio/src/ (gitignored) + src/inventory.json
  producers/*.mjs    one per category family; `export async function produce(lib, ctx)`
  build.mjs          runs producers (one process each), validates manifests, writes index.json, coverage, credits
  run-producer.mjs   runs ONE producer (what build.mjs spawns)
  inspect.mjs        query the inventory, measure files, render spectrograms
  selftest.mjs       toolkit self-test (EBU loudness reference cases, codecs, DSP)
  provenance/*.json  committed: which sources each category used (feeds CREDITS)
  out/               gitignored: QA reports, spectrograms, previews, caches
game/assets/audio/
  index.json                      { "manifests": ["manifest.<category>.json", ...] }
  manifest.<category>.json        { "sounds": { "<name>": { files, vol, pitch, voices, bus, spatial, range, loop } } }
  <category>/<name>[_<n>].ogg     Ogg Vorbis, 48 kHz, q≈0.5
```

## Quick start

```sh
npm install                                                    # pure JS/WASM deps only (no native binaries)
node --max-old-space-size=1536 tools/audio/selftest.mjs       # 80+ checks, ~10 s
node --max-old-space-size=1536 tools/audio/fetch.mjs          # sources -> tools/audio/src/ (~0.7 GB disk, cached, idempotent)
node tools/audio/inspect.mjs find --pack ffsl --tags ak47,near
node --max-old-space-size=1536 tools/audio/build.mjs --only weapons      # run your producer
node --max-old-space-size=1536 tools/audio/build.mjs                     # all producers + validation + coverage
node --max-old-space-size=1536 tools/audio/build.mjs --only _example --out tools/audio/out/example-assets   # the demo
```

**Memory rule (16 GB machine shared with other agents).** Always pass `--max-old-space-size=1536`. Process sources
one at a time: load a slice (`ctx.load(id, { start, end })` or `{ event: k }` — WAV ranges are read from disk without
loading the file), process, hand the result to `cat.add()`, drop references. Never decode a whole library into
an array. Use `ctx.cached()` for expensive intermediates. `build.mjs` runs each producer in its own process.

## 1. Output contract (what the runtime reads)

| Field | Type | Meaning |
|---|---|---|
| `files` | string[] | `"<category>/<file>.ogg"` variants; the engine picks one at random per play |
| `vol` | 0..1.5 | linear gain applied at play time (files are already loudness-normalised, so this is a mix decision) |
| `pitch` | [min, max] | playbackRate jitter range, e.g. `[0.97, 1.03]` (±3 %); `[1, 1]` for UI / music |
| `voices` | int ≥ 1 | max simultaneous instances of this name (oldest is stolen) |
| `bus` | `sfx` `ui` `music` `amb` `voice` | mixer bus (user volume sliders; amb + music duck under gunfire) |
| `spatial` | bool | 3D (equal-power panner, inverse distance, distance low-pass) when played with a position |
| `range` | [ref, max] m | PannerNode `refDistance` / `maxDistance`; the engine culls sounds beyond `max` |
| `loop` | bool | looping (ambience beds, music, minigun spin) |
| `priority` | number, optional | voice-steal priority (higher survives), default 1 |
| `rolloff` | number, optional | PannerNode `rolloffFactor`, default 1 |

- Files: **Ogg Vorbis 48 kHz**, quality 0.5. **Mono for anything spatial.** Stereo only for the local player's own
  gunshot `_close` layer (and `_tail`, played 2D), music and ambience beds.
- One owner per sound name across all manifests (build.mjs errors on duplicates).
- Fallbacks in the engine when a name is missing: `<voice>_<idle|alert|attack|pain|death>` → `zombie_<same>`,
  `<gun>_far` → `<gun>_close`, `impact_*` → `impact_concrete`, `footstep_*` → `footstep_concrete`,
  `headshot_kill` → `killmarker`, `hitmarker_head` → `hitmarker`. Fallbacks are a safety net, not a plan.

### How the game plays guns (`weapons/arsenal.js`, `player/remote.js`)

Local shot: `<sound>_close` (2D, vol 1) + `<sound>_tail` (2D, vol 0.9, **15 ms later**) + `<sound>_mech` (optional,
vol 0.8), `lowAmmo` when the magazine is under 20 %, plus a sidechain duck of music/ambience. Teammates: `<sound>_close`
at their position, or `<sound>_far` when farther than 40 m. So:

- `_close` = transient + body + sub (+ a little early room), dry, ≈ 0.25–0.6 s. Stereo allowed. This is the loudest
  thing in the game and must feel like a slap: crack within the first 5 ms, body to ~80 ms, implied sub (harmonics
  ~80–250 Hz because phone speakers cannot play < 120 Hz). Manifest it **`spatial: true`** (range ≈ `[12, 60]`): the
  local shot passes no position and stays 2D, but teammates' shots pass one — with `spatial: false` the engine ignores
  it and every teammate within 40 m sounds like your own gun. Keep the stereo width mono-safe (single-speaker phones
  play (L+R)/2).
- `_tail` = reflections only (no direct sound), 0.8–2.5 s, stereo, starting quiet; environment = Lost Town streets.
- `_far` = mono, distant version (air absorption, more reflections than direct) for 40 m+.
- `_mech` = action noise (bolt carrier, slide, hammer), short, close-miked.

### Sound names the game already plays

`build.mjs` scans `game/src` (`lib/contract.mjs`) and prints what is missing. Current families:

| Group | Names |
|---|---|
| Guns (`def.sound`) | `pistol` `pistol45` `magnum` `smg9` `smg45` `rifle556` `rifle762` `rifleBolt` `shotgun` `shotgunAuto` `shotgunHeavy` `mg556` `mg762` `minigun` `sniper338` `sniper50` `rocket` `knife` × `_close` `_tail` `_far` (+ optional `_mech`) |
| Gun foley (viewmodel clip events) | `draw` `drawHeavy` `cloth` `pouch` `magRelease` `magOut` `magIn` `magDrop` `slideRelease` `boltBack` `boltForward` `boltUp` `boltDown` `pumpBack` `pumpForward` `shellIn` `shellsDrop` `speedloader` `breakOpen` `breakClose` `coverOpen` `coverClose` `beltIn` `craneOpen` `craneClose` `rocketIn` `swing` `swingHeavy` `dryfire` `lowAmmo` `perfect_reload` |
| Shells | `shell_brass` `shell_shotgun` `shell_link` |
| Impacts / gore | `impact_concrete` `impact_metal` `impact_wood` `impact_dirt` `impact_glass` `impact_water` `impact_flesh` `headshot` `gib` `knife_hit_wall` `knife_hit_flesh` `armor_hit` `body_fall` `debris_fall` `acid_splash` |
| Explosives / heavy | `explosion_small` `explosion_large` `explosion_far` `grenade_pin` `grenade_bounce` `fire_burst` `rocket_fly` `minigun_spin` `minigun_spindown` `saw_launch` `saw_catch` |
| Zombies | `zombie` `runner` `brute` `spitter` `bloater` `crawler` `screamer` × `_idle` `_attack` `_pain` `_death`, plus `brute_roar` `brute_stomp` `brute_charge` `spitter_spit` `spitter_gurgle` `screamer_scream` `crawler_screech` `bloater_pop` |
| Player | `player_pain` `player_downed` `revive` `land` `land_heavy` `footstep_concrete` `footstep_metal` `footstep_wood` `footstep_dirt` `footstep_grate` `footstep_water` |
| UI / match | `ui_click` `ui_back` `ui_buy` `ui_deny` `ui_open` `hitmarker` `hitmarker_head` `killmarker` `headshot_kill` `special_ready` `special_activate` `special_end` `level_up` `round_start` `round_win` `victory` `defeat` `boss_warning` `supply_drop` |
| Ambience | `amb_city_dead` (loop) — more beds may be wired later (wind, fire, sirens, distant horde) |
| Music (`playMusic`) | `calm` `combat_low` `combat_high` `boss` `menu_theme` (loops, bus `music`) |

## 2. Loudness targets

Integrated loudness per ITU-R BS.1770-4 (K-weighted, gated; `selftest.mjs` checks the meter against the EBU Tech 3341
reference cases), true peak ≤ **-1 dBTP** (4× oversampled). Both are measured on the **decoded Ogg** — the file the
game plays: `cat.add()` masters 0.4 dB under the ceiling (`codecMargin`), encodes, decodes, and rescales/re-encodes if
the codec's overshoot still crosses -1 dBTP. Sounds shorter than one 400 ms block are measured over their own duration
("integrated over the sound"). Mono files are measured as one channel.

| Kind | `target` key | LUFS |
|---|---|---|
| gun `_close` | `gunClose` | **-12** (loudest thing in the game) |
| gun `_tail` | `gunTail` | -20 |
| gun `_far` | `gunFar` | -22 |
| gun `_mech`, reload foley, mechanical | `gunMech` / `mech` / `foley` | -22 (allowed range -20…-24) |
| bullet impacts, hits, gore | `impact` / `gore` | -18 / -19 |
| explosions (close / far) | `explosion` / `explosionFar` | -14 / -22 |
| zombie voices, player voice | `voice` | -20 |
| footsteps | `footstep` | -26 |
| UI | `ui` | -22 |
| stingers (round start/win, level up, boss warning) | `stinger` | -18 |
| ambience loops | `amb` | -30 |
| music | `music` | -18 |

QA rules applied to every file (warnings in the build log, table in `tools/audio/out/<category>/report.md`):
loudness within ±1 LU of target, true peak ≤ -1 dBTP, no clipped samples, DC < -50 dB, edges < -45 dBFS (no clicks),
≤ 15 ms leading silence for one-shots (250 ms for `gunTail`, 60 ms for `gunFar` — reflections arrive late by design),
and the limiter may take at most 4 dB (6 dB for `gunClose` / `explosion`) to
reach the target — more means the material is too peaky: shape it first (see recipes).

## 3. Sources

`node tools/audio/fetch.mjs` (idempotent; ~0.7 GB) downloads into `tools/audio/src/` and writes `src/inventory.json`:

- **The Free Firearm Sound Library** (OpenGameArt, CC0; Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney) —
  56 stereo 96 kHz/24-bit WAVs, 23 real guns (pistols, revolvers, SMGs, AK-47, AR-15, SKS, bolt/lever rifles, pump and
  bolt shotguns), each recorded at **near** (front of shooter, L/R pair) and **mid** distance (forward/back), single
  shots plus short/long bursts for automatics. Inventory ids `ffsl/<Gun>/<file>`; tags from the library's master sheet:
  `pistol revolver smg assault-rifle rifle carbine bolt-action pump-action lever-action full-auto semi-auto near mid
  single burst-short burst-long last-round cal-<calibre>` + folder slug (`ak47`, `ar15`, `ppsh`, `mosinnagant`...).
  Know the material: the near takes are a *spaced* L/R pair (correlation ≈ 0.1 — pick one channel or keep stereo;
  averaging them can comb-filter), the first few ms of each shot are clipped in the source, there is wind/handling
  rumble below ~50 Hz (high-pass it), and each event holds the direct blast (~0–100 ms) followed by the outdoor slap
  echoes (~120–250 ms) and a 1–2 s tail. Event times in the inventory cut at -42 dB; load `{ start, end }` to get the
  full tail.
- **Kenney Impact Sounds** (CC0) — clean footsteps (concrete/wood/grass/snow/carpet) and impacts (metal, plate, wood,
  glass, punch, soft, mining, bell, tin).
- **OpenGameArt CC0 packs** — zombie voice packs (`oga_zombies`, `oga_voicefx`, `oga_undead_moans`, `oga_zombie_moans`,
  `oga_hungry_ghoul`, `oga_zombie_pain`), gun reload foley (`oga_gun_reload`, `oga_shotgun_reload`), distant explosion,
  snow/gravel and metal footsteps, fire crackling.
- **Freesound CC0** high-quality Ogg previews (no account needed) — guns, explosions, gun foley, bullet impacts and
  ricochets, flesh/bone/gore, knives, body falls, zombie/creature voices, screams, footsteps (concrete, metal, gravel,
  wood), wind, fire, sirens, harbour water, gulls, city beds, rockets, motors, saws, debris. Ids `fs:<id>`.

Each inventory entry: `{ id, path, pack, title, author, licence: "CC0-1.0", url, tags[], format, duration, channels,
sampleRate, bits, bytes, analysis: { lufs, peakDb, truePeakDb, crestDb, centroidHz, bandsDb, dcDb, stereoCorr,
onsetCount, onsets[], eventCount, events[[start, end]...] } }` (onsets/events in seconds; long files > 150 s have no
events). `suspicious: true` marks Freesound uploads whose title/description mentions films or games: `find()` hides them and
`load()` refuses them. Uploads that were read by hand and are the author's own recordings are cleared in `REVIEWED`
(`tools/audio/sources.mjs`).

**Adding sources.** Search Freesound (CC0 filter is applied and every result is re-verified on its page before
download): `node tools/audio/fetch.mjs --search "metal door slam" --sort downloads --max-dur 5`. Add the ids you want
without touching shared files: `node tools/audio/fetch.mjs --add-fs 123456,234567 --to <your-producer> --tags door,metal`
(writes `tools/audio/sources.d/<your-producer>.json`, fetches, re-analyses, refreshes CREDITS). Prefer authors who
state they recorded the sound themselves.

## 4. Writing a producer

A producer owns one or more **categories** (`game/assets/audio/<category>/` + `manifest.<category>.json`) and nothing
else. File: `tools/audio/producers/<name>.mjs` (names starting with `_` only run with `--only`).

```js
// tools/audio/producers/impacts.mjs
export async function produce(lib, ctx) {
  const cat = ctx.category('impacts', { bus: 'sfx', spatial: true, range: [2, 50] }); // defaults for every add()

  const variants = [];
  for (const e of ctx.sources.find({ pack: 'kenney_impact', tags: ['impactplate'] }).slice(0, 4)) {
    let b = await ctx.load(e.id, { channels: 1 });                    // 48 kHz Buf, provenance recorded
    b = lib.trimSilence(b, { threshDb: -50 });
    const debris = lib.noiseBurst({ dur: 0.25, decay: 0.12, hp: 2500, seed: ctx.rng(e.id).next() });
    b = lib.mix([b, { buf: debris, at: 0.004, gain: -14 }]);          // sample-accurate layering
    variants.push(lib.transientShaper(b, { attack: 4, sustain: -3 }));
  }
  await cat.add('impact_concrete', variants, { target: 'impact', voices: 6, pitch: [0.94, 1.06] });
  await cat.write();                                                  // manifest + QA report + provenance + index.json
}
```

### `ctx` (built by `lib/producer.mjs`)

| Member | Use |
|---|---|
| `ctx.category(name, defaults)` | returns a `Category`; `await cat.add(sound, Buf \| Buf[], opts)`, then `await cat.write()` |
| `ctx.sources.find({ pack, tags, anyTags, text, minDur, maxDur, channels, minRate })` | inventory query (`text` = substring or RegExp over id/title/tags) |
| `ctx.load(id, { start, end \| event, pad, channels, sampleRate })` | load a source (or a slice / detected event) as a 48 kHz `Buf` |
| `ctx.rng(label)` | seeded RNG (`next range int pick sign chance gauss shuffle fork`) — **builds must be reproducible**: never `Math.random()` |
| `ctx.preview(label, buf)` | WAV + spectrogram PNG in `tools/audio/out/<producer>/preview/` (not shipped) |
| `ctx.cached(key, async () => buf)` | disk cache (32-bit float WAV) for expensive intermediates; bump the key when the recipe changes |
| `ctx.log / ctx.warn` | logging |

`cat.add(sound, variants, opts)` finalizes each variant (resample → channel policy → DC removal → **LUFS normalise with
true-peak limiter** → click-free edge fades), encodes Ogg q0.5, decodes it back to re-check the true peak, writes
`<category>/<sound>.ogg` (one variant) or `<sound>_1.ogg … _N.ogg`, measures, QA-checks and logs. Options:
`target` (TARGETS key) or `lufs`; `bus` `spatial` `vol` `pitch` `voices` `range` `loop` `priority` `rolloff`;
`channels` (default 1 when spatial, else keep ≤ 2); `ceiling` (-1); `tolerance` (1 LU); `normalize` (false = keep
level); `maxDuration`; `maxHeadMs`; `maxLimitDb`; `quality`; `codecMargin` (0.4 dB); `limiter` (limiter options);
`sources` (explicit source ids for credits); `note`. Loudness / true peak / clipping are QA'd on the decoded file,
edges and leading silence on the master.

### Toolkit reference (`lib`, all functions are non-mutating: Buf in → new Buf out)

A `Buf` is `{ sampleRate, data: Float32Array[] }` (one array per channel); `Buf.alloc(n, ch)`, `Buf.seconds(s, ch)`,
`Buf.from(arr)`, `.duration .length .channels .clone()`.

| Module | Functions |
|---|---|
| io | `readAudio(file, { sampleRate, channels, start, end })` (WAV/OGG/MP3/FLAC/AIFF), `decodeBytes`, `probe`, `readWavRange`, `writeWav(file, buf, { bits: 16\|24\|32 })`, `encodeOgg / writeOgg(buf, { quality })`, `freeDecoders` |
| resample | `resample(buf, rate)`, `varispeed(buf, rate)`, `varispeedSemis / varispeedCents`, `varispeedCurve(buf, [[t, rate]...])` (spin-up/down, doppler), `timeStretch(buf, factor)` (WSOLA; tails/ambience, not transients) |
| vary | `variations(buf, n, { semis, gainDb, tiltDb, seed, includeOriginal })` (stratified pitch/level/tilt variants), `pickN(list, n, seed)` |
| edit | `slice pad fitLength concat reverse invert scale gain normalizePeak add`; `toMono toStereo setChannels pan width haas stereoCorrelation`; `removeDC fadeIn fadeOut fade automate([[t, dB]]) decay(t60)`; `envelope findActive trimSilence detectOnsets splitOnSilence takes`; `mix([{ buf, at \| atSample, gain \| gainLin, pan }], { length, channels })`, `crossfade loopCrossfade edgeLevels` |
| filters | `eq(buf, [{ type: hp\|lp\|bp\|notch\|ap\|peak\|lowshelf\|highshelf\|hp1\|lp1\|tilt, f, q, gain, order, mix }])`, `hp lp bp peakEq lowShelf highShelf`, `filtfilt` (zero phase), `splitBands(buf, [f1, f2])` (LR4, sums flat), `sweep(buf, type, freq(t), { q })`, `responseDb` |
| loudness | `lufs(buf)`, `loudness(buf)` → `{ integrated, momentaryMax, shortTermMax, lra }`, `truePeak / truePeakDb`, `kWeightCoefs` |
| dynamics | `limit(buf, { ceiling, attack, release })` (true-peak lookahead), `compress(buf, { threshold, ratio, attack, release, knee, makeup, detector, lookahead, mix, sidechain })`, `gate`, `transientShaper(buf, { attack, sustain } \| { bands: [200, 3000], perBand: [...] })`, `saturate(buf, { drive, type: tanh\|atan\|soft\|hard\|tube\|fold\|diode, mix, os })`, `hardClip(buf, ceilingDb, os, { strict })`, `softClip(buf, { threshold, ceiling, strict })`, `psychoBass(buf, { freq, drive, amount })`, `exciter(buf, { freq, drive, amount })` |
| master | `normalizeLufs(buf, lufs, { ceiling })` (→ `.meta { lufs, truePeakDb, gainDb, limitedDb }`), `finalize(buf, { lufs, channels, loop, ... })` |
| space | `ENVIRONMENTS` (`smallRoom warehouse alley urban field harbor tunnel`), `makeIR(env, { seed, channels, length })`, `convolve(buf, ir, { wet, dry, wetOnly, predelay })`, `reverb(buf, env, { wet })`, `gunTail(src, { env, length, head, darken, lp, hp, seed })`, `farLayer(src, { distance, env })`, `stereoize(buf, { width, hp })` (mono-compatible widening), `airAbsorption(buf, metres)`, `airCutoff(metres, db)`, `echo`, `diffuse`, `fftFilter(buf, magFn)` |
| synth | `noise(sec, { color: white\|pink\|brown\|blue\|violet\|velvet })`, `tone(sec, { type, freq })` (band-limited, glides), `thump({ f0, f1, sweep, decay, click, drive })` (sub kick), `noiseBurst`, `whoosh`, `crackle`, `fm`, `partials`, `envCurve adsr expEnv applyEnv silence` |
| analysis | `measure(buf)` (peak, true peak, LUFS, momentary/short-term max, LRA, RMS, crest, DC, clipped, edges, head/tail silence, attack, centroid, band balance, stereo correlation), `formatMeasure`, `checkTarget(m, { lufs })`, `spectrogram(buf, file.png)`, `averageSpectrum` |
| buffer | `Buf SR db2lin lin2db peak rms rng(seed) hashSeed clamp lerp semitonesToRatio mapSamples mapChannels` |

### Recipes

**Gunshot set** (research 03 §4.12 — mech / transient / body / sub / tail; clip the transient *before* limiting).
Tested in `producers/_example.mjs` (all 18 files pass QA; the close layer reaches -12 LUFS with 0 dB of limiting):

```js
// FFSL 'near' takes: spaced stereo pair at the shooter (L/R correlation ≈ 0.1), outdoors. The direct blast is the
// first ~100 ms; the environment's slap echoes arrive ~120-250 ms later; the sources clip on the first few ms.
const src = ctx.sources.find({ pack: 'ffsl', tags: ['ak47', 'near', 'single'] })[0];
for (const [k, ev] of src.analysis.events.filter((e) => e[1] - e[0] > 0.25).slice(0, 6).entries()) {
  const raw = await ctx.load(src.id, { start: Math.max(0, ev[0] - 0.003), end: ev[0] + 1.8 }); // shot + reflections
  const shot = lib.trimSilence(lib.slice(raw, 0, 0.6), { threshDb: -50, pre: 0.001, end: false });
  const tone = lib.eq(shot, [{ type: 'hp', f: 45, order: 4 }, { type: 'peak', f: 160, gain: 2.5, q: 0.9 }, { type: 'peak', f: 3500, gain: 1.5, q: 1.2 }]);
  // _close: direct blast + short early-room body + pitched sub; psychoBass implies the < 120 Hz phones can't play
  const direct = lib.exciter(lib.fadeOut(lib.slice(tone, 0, 0.11), 0.05, 'exp'), { freq: 2500, drive: 10, amount: -10 });
  const body = lib.reverb(direct, 'smallRoom', { wet: 0.18, seed: `room${k}`, length: 0.4 });
  const sub = lib.thump({ f0: 130, f1: 52, sweep: 0.035, decay: 0.2, drive: 1.5, seed: `sub${k}` });
  let close = lib.psychoBass(lib.mix([body, { buf: sub, gain: -11 }], { channels: 2 }), { freq: 120, amount: -7 });
  close = lib.fadeOut(lib.slice(close, 0, 0.26), 0.16, 'exp');
  closes.push(lib.softClip(lib.gain(lib.normalizePeak(close, 0), 12), { threshold: -12, ceiling: -1 })); // density
  // _tail: the recorded reflections (after the blast) + a synthesized street tail
  const recorded = lib.fadeIn(lib.slice(lib.hp(raw, 60, 2), 0.1, raw.duration), 0.03);
  const synth = lib.gunTail(shot, { env: 'urban', length: 1.7, head: 0.1, seed: `tail${k}` });
  tails.push(lib.fadeOut(lib.mix([synth, { buf: recorded, at: 0.085, gain: 3 }], { length: 1.7, channels: 2 }), 0.6, 'exp'));
  fars.push(lib.farLayer(shot, { distance: 180, env: 'urban', seed: `far${k}` }));            // _far: mono, distant
}
await cat.add('rifle762_close', closes, { target: 'gunClose', spatial: false, channels: 2, voices: 6, pitch: [0.97, 1.03], priority: 3 });
await cat.add('rifle762_tail', tails, { target: 'gunTail', spatial: false, channels: 2, voices: 4 });
await cat.add('rifle762_far', fars, { target: 'gunFar', spatial: true, range: [40, 450], voices: 4 });
```

- Why the close layer is short: loudness is integrated over the sound, so a long, decaying `_close` cannot reach
  -12 LUFS without the limiter crushing it (the first version of the example, a 0.42 s cut of the recording with its
  echoes, needed 16 dB of limiting). Keep `_close` to the direct blast + designed body (0.2–0.3 s) and let `_tail`
  carry the space; drive the body into `softClip` until `limitedDb` in the report is near 0.
- Do not raise the recorded echoes (120–250 ms) inside `_close` with compression: it turns the crack into mush.
- 4–8 variants per layer, pitch jitter ±3–5 % (`pitch` in the manifest or `lib.variations`), level ±1–2 dB.
- Character per weapon: calibre → body EQ and sub frequency; SMG = shorter, brighter, tighter tail; shotgun = wider
  low-mid "boom" + longer tail; sniper = huge crack + long rolling tail; pistol = snappy, less sub; MG = heavier body.
- Very high fire-rate weapons (minigun): a loop (`loop: true`) + spin-up/spin-down one-shots, not one sample per round.
- `_mech` layers sit *slightly before* the transient (the game plays all layers at t = 0; bake a few ms of pre-roll
  into `_close` if the mech needs to lead).

**Impacts / gore**: Kenney or Freesound hit + short noise/debris layer + transient shaping; -18 LUFS, mono, spatial,
6–10 variants. **Voices**: trim, pitch/formant variety via `varispeedSemis`, `saturate({ type: 'tube' })` for rasp,
-20 LUFS, mono. **Footsteps**: per surface 6–8 variants, heel/toe from takes(), -26 LUFS. **Ambience**: long take,
`timeStretch` if needed, `loopCrossfade(buf, 2)`, `loop: true`, `bus: 'amb'`, stereo, -30 LUFS.
**Loops with steady tones** (hums, drones, whistles): `loopCrossfade` is equal-power, right for noise but a tone
crossfaded onto a phase-shifted copy of itself dips or swells and smears once per period, and mixing the head onto the
end before the crossfade does not close the seam (it clicks every period). Put every tonal frequency on the 1/P grid
(P = loop length; LFOs and vibrato with whole cycles in P), render the tones exactly P long (cut after filters settle),
crossfade only the noise, sum (`premium_sunbow.mjs` `seamless()` / `seamCheck()`). **Music**: `loop: true`,
`bus: 'music'`, -18 LUFS, stereo, seamless (`loopCrossfade`).

## 5. Build, QA and inspection

- `node tools/audio/build.mjs [--only a,b] [--out dir] [--spectrograms first|all|none] [--strict] [--no-cache]` —
  runs producers, validates every manifest (schema, file names, existence, 48 kHz Ogg, mono-if-spatial), reports
  orphan files, writes `index.json`, prints **contract coverage** (required names present / missing / unreferenced),
  writes `tools/audio/out/build-summary.json` and refreshes CREDITS. `--clean <category>` removes a category.
- Per category: `tools/audio/out/<category>/report.md` (+ `report.json`) and `png/<sound>.png` spectrograms with
  waveform and loudness header. You cannot listen, so look at them: a gunshot `_close` should show a full-band vertical
  crack at t = 0, dense energy below 2 kHz for 50–150 ms and a clean decay; no hard-red clipped waveform blocks.
- `node tools/audio/inspect.mjs <inventory-id | file | manifest> [--event k | --start s --end s] [--events] [--png]`.
- `node tools/audio/selftest.mjs` must stay green when you touch `lib/`.

## 6. Working in parallel (several producer agents)

- Own exactly: `tools/audio/producers/<you>.mjs`, your categories (`game/assets/audio/<cat>/`, `manifest.<cat>.json`,
  `tools/audio/provenance/<cat>.json`) and `tools/audio/sources.d/<you>.json`. Do not edit other producers' files.
- Changes to `lib/` must be backwards compatible and keep `selftest.mjs` passing.
- Run only your producer (`build.mjs --only <you>`); index.json and CREDITS are regenerated from what is on disk,
  so concurrent runs do not lose each other's work.
- Category suggestions: `weapons` (gun layers), `foley` (reload/draw/mech, shells, dryfire, lowAmmo), `impacts`
  (impact_*, headshot, gib, knife_hit_*, armor_hit, body_fall, debris_fall, acid_splash), `explosives` (explosion_*,
  grenade_*, fire_burst, rocket_fly, minigun_spin*, saw_*), `zombies` (voices + specials), `player` (pain, downed,
  revive, land, footsteps), `ui` (ui_*, hitmarkers, killmarker, stingers), `ambience`, `music`.
