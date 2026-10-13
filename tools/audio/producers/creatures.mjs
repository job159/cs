// Producer: category 'creatures' — zombie / special-infected voices and specials, hounds, the player's own voice,
// footsteps (player + zombies), jump / land, heartbeat and breathing loops.
//
//   node --max-old-space-size=1536 tools/audio/build.mjs --only creatures
//   dev:  CF_AUDIO_OUT=tools/audio/out/creatures-dev CREATURES_ONLY=zombie_idle,brute_roar CREATURES_SHEET=1 \
//         node --max-old-space-size=1536 tools/audio/run-producer.mjs tools/audio/producers/creatures.mjs
//         (CREATURES_SHEET=1 writes one spectrogram contact sheet per sound to tools/audio/out/creatures/preview/;
//          renders are cached per recipe in tools/audio/out/cache/creatures-v/, CREATURES_PRUNE=1 on a full run drops
//          stale entries; several CREATURES_ONLY processes can render disjoint sets in parallel and share the cache)
//
// Every voice starts from a real CC0 vocal performance (zombie / monster voice actors, field-recorded dogs, male
// grunts, female screams; see CREDITS) and is turned into a creature by a per-type "throat" (PROFILES):
//   pitch + formant shift (WSOLA + varispeed for pitch, cepstral spectral-envelope warping for formants: a brute
//   gets a bigger throat, a crawler a smaller one, independently of the pitch), band-limited tube rasp, a jittered
//   sub-audio amplitude flutter (vocal-fry / throat rattle), an envelope-following wet layer (real gurgling / stomach /
//   gore recordings that bubble only while the creature vocalises), an optional sub-octave chest layer, and a
//   phone-speaker EQ (nothing useful < 90 Hz on phones, so weight is implied with 120-300 Hz body + harmonics).
// Specials (roar, spit, pop, screech, scream...) are layered designs on top of the same tools. Variation comes from
// rotating recordings + seeded processing (ctx.rng), never Math.random().

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ONLY = process.env.CREATURES_ONLY ? new Set(process.env.CREATURES_ONLY.split(',')) : null;
const SHEET = !!process.env.CREATURES_SHEET;

// Running game previews of other agents may hold the .ogg files open while we rewrite them; on Windows the atomic
// rename then fails with EPERM/EBUSY for a moment. Retry briefly (process-local; the shared lib is untouched).
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

// ================================================================================================== sources
// Short names for the recordings this producer uses (inventory ids). Slices are [start, end] seconds in the file.
const S = {
  // zombie / monster voice performances
  zMoansNoFx: 'fs:176240', zMoaning: 'fs:58626', zTaodan: 'fs:173128', zMoanMrh: 'fs:426628', zChoke: 'fs:426637',
  zGrowlT5: 'fs:555417', zHitT5: 'fs:555420', zPain2T5: 'fs:555423', zPain5T5: 'fs:555426', zDeathT5: 'fs:555412',
  zDeathJG: 'fs:534602', zGrunts: 'fs:181068', zAttack: 'fs:213509', zRoarTh: 'fs:245223', zNachtmahr: 'fs:618115',
  zGroanMale: 'fs:500555', zGrowlOz1: 'fs:804460', zGrowlOz2: 'fs:804461', zBradsim: 'fs:554936', zMutant: 'fs:396797',
  zRestraint: 'fs:242193', zBurp: 'fs:463721', zHorrific: 'fs:133974', zDemonScream: 'fs:435651', zScreamLola: 'fs:179345',
  zGurgledScream: 'fs:402861', monsterScreams: 'fs:391552', monsterShortRoar: 'fs:132874', angryBeast: 'fs:170454',
  monsterGrowl: 'fs:481642', werewolfBreath: 'fs:261464', snarl: 'fs:42201', groansSlobbers: 'fs:125405',
  oga: (n) => `oga_zombies/zombies/zombie-${n}`,
  vfx: (n) => `oga_voicefx/Voice Effects Zombie-Skeleton-Monster Human Male/${n}`,
  undead: (n) => `oga_undead_moans/undead-${n}`,
  darsycho: 'oga_zombie_moans/darsycho__zombie-moans', ghoul: 'oga_hungry_ghoul/hungry-ghoul', zPainVinrax: 'oga_zombie_pain/zombie_pain',
  // human
  maleScreams: 'fs:556976', maleScreamMulti: 'fs:173944', soldiersAgony: 'fs:166943', grunts3: 'fs:218895', maleGrunts: 'fs:256603',
  grunt1: 'fs:257710', grunt2: 'fs:257709', gruntsMid: 'fs:347337', bigGrunts: 'fs:770124', hurt9: 'fs:413186', gruntPain: 'fs:464486',
  painGrunt09: 'fs:547209', deathMale: 'fs:173126', maleDeath04: 'fs:345456', maleDeathB: 'fs:554443', gasp: 'fs:341908',
  jumpGrunt1: 'fs:808213', jumpGrunt2: 'fs:808215', jumpGrunt3: 'fs:808216',
  breathLoop: 'fs:554907', breathHeavy: 'fs:163383', breathScared: 'fs:554307', breathMed: 'fs:345464', runBreath1: 'fs:716947', runBreath2: 'fs:716948', runBreathLong: 'fs:456037',
  // female
  shrieksWoman: 'fs:320740', screamAnalog: 'fs:35716', screamClara: 'fs:219856', demonWoman: 'fs:333832', shrieker: 'fs:433735',
  demonGrowlF: 'fs:444444', zombieGirl: 'fs:347349', bansheeRpg: 'fs:347339', femZombie1: 'fs:338267', zFemGrunt: 'fs:560592',
  ghostScream: 'fs:469141', bansheeScream: 'fs:400168', bansheeScream2: 'fs:575806', bansheeDeath: 'fs:10347',
  whispersGhostly: 'fs:316797', whispers4: 'fs:193812', whispersCreepy: 'fs:234044',
  // liquids / gore
  gurgling: 'fs:213566', bubbling: 'fs:423959', goreGurgle: 'fs:454622', acidBubbling: 'fs:202094', sizzle: 'fs:382313',
  stomachLong: 'fs:696003', stomach10: 'fs:696405', stomachOld: 'fs:615774', stomachB: 'fs:447911',
  gargleSpit: 'fs:171336', spitting: 'fs:232211', spitBlood1: 'fs:237386', spitBlood2: 'fs:237387', vomit: 'fs:370710',
  waterSquish: 'fs:737232', wetSplat1: 'fs:495118', wetSplat2: 'fs:495117', bloodSquish: 'fs:411671', mudSplat: 'fs:445109',
  goreSplat: 'fs:414296', goreHeart: 'fs:641046', grossGuts: 'fs:222363', goreSounds: 'fs:631895', heavyWet: 'fs:626405',
  slime27: 'fs:433840', grossImpact: 'fs:641040', bigSplash: 'fs:442773', splash: 'fs:212143', chickenSlime: 'fs:211605',
  boneCrunch: 'fs:355052', crunchingBones: 'fs:249811', boneBreaks: 'fs:574752',
  carcass: 'fs:234236', eatingMeat: 'fs:234237', zEating: 'fs:448089', zEatingFlesh: 'fs:236331', fleshBites: 'fs:155973', gutsDrag: 'fs:174634',
  // dogs
  angryDog: 'fs:439535', dogBarkCraig: 'fs:479631', dogBarkAggr: 'fs:332176', dogGrowlQ: 'fs:122183', dogGrowlMono: 'fs:401820',
  dogSnarlSelf: 'fs:190595', dogSnarlStrong: 'fs:341090', dogGrowl2: 'fs:483190', dogBarkSJ: 'fs:483176', dogGrowlDeep: 'fs:404920',
  // foley
  chainmailBag: 'fs:361798', chainmailMetal: 'fs:740037', gearFriction: 'fs:517150', helmetArmor: 'fs:675817',
  scratchDoor: 'fs:109969', scratchClaw: 'fs:593198', scratchWood: 'fs:830466', roaches: 'fs:380769',
  clothHeavy: 'fs:163164', clothRustle: 'fs:334219', clothes1: 'fs:163164', fabric: 'fs:789038', clothSleeve: 'fs:19291',
  heartBeat: 'fs:21409', heartSlow: 'fs:249716', heartBeating: 'fs:273150', heartSingle: 'fs:22440',
  bodyFall: 'fs:504617', bodyFallDirt: 'fs:504626', bodyFallGround: 'fs:395331', humanImpact: 'fs:364690', jumpLanding: 'fs:172960',
  landWav: 'fs:363922', jumpLand: 'fs:572459', landJump: 'fs:540272', jumpLandSeq: 'fs:389678', rubble: 'fs:758580', rockFall: 'fs:232137',
  stoneHeavy: 'fs:513694', metalThud: 'fs:640204', concreteHit: 'fs:321477',
  kenney: (n) => `kenney_impact/Audio/${n}`,
  ogaMetalStep: (n) => `oga_metal_steps/metal_steps_${String(((n - 1) % 25) + 1).padStart(2, '0')}`,
  // footsteps
  stepsConcreteSD: 'fs:465299', stepsRoadBoots: 'fs:456428', stepsSidewalk: 'fs:149234', stepsMetalFloor: 'fs:556715', stepsWalkMetal: 'fs:696374',
  stepsMetalFoley: 'fs:148462', stepsWoodFloor: 'fs:485421', stepsFactoryHall: 'fs:155858', stepsDirtShoe: 'fs:353799', stepsDirtGravel: 'fs:352870',
  stepsGrittyBoots: 'fs:530589', stepsGrateRun: 'fs:786977', stepsMetalIENBA: 'fs:698697', stepsMetalIENBA2: 'fs:834029', stepsPuddle: 'fs:106395',
  stepsPuddle2: 'fs:531566', stepsWaterBoots: 'fs:454623', footDrag: 'fs:221650', feetShuffle: 'fs:272375', shoeScuffle: 'fs:119931',
  footDragDirt2: 'fs:319210', footDragDirt4: 'fs:319204', runBoots: 'fs:235470', runConcrete: 'fs:418545',
};

// ================================================================================================== produce
export async function produce(lib, ctx) {
  const cat = ctx.category('creatures', { bus: 'voice', spatial: true, range: [2, 40] });
  const want = (n) => !ONLY || ONLY.has(n);
  // per-sound provenance: remember which sources each sound's recipe loads (ctx.load records them category-wide)
  const used = new Map(), load0 = ctx.load;
  let cur = null;
  const captures = [];
  ctx.load = (id, o) => { used.get(cur)?.add(id); for (const c of captures) c.add(id); return load0(id, o); };
  // Shared material is built once per process and then served from memory (liquid beds, step / kit pools): only the
  // first sound that asks would see the loads. These helpers remember what they loaded and credit it to every caller
  // (QA: bloater_gurgle, spitter_gurgle, brute_roar, land, revive... were missing their bed / kit sources).
  const memo = new Map();
  const PER_POOL = new Set(['gearTake', 'chainTake']); // one pool whatever the argument
  const tracked = (fname, fn) => async (...a) => {
    const k = PER_POOL.has(fname) ? fname : `${fname}|${JSON.stringify(a[0])}`;
    const cap = new Set();
    captures.push(cap);
    try { return await fn(...a); } finally {
      captures.splice(captures.indexOf(cap), 1);
      const m = memo.get(k) || new Set();
      for (const id of cap) m.add(id);
      memo.set(k, m);
      for (const id of m) { used.get(cur)?.add(id); ctx.sources.used.add(id); }
    }
  };
  const TRACK = new Set(['wetBed', 'bedOf', 'steps', 'gearTake', 'chainTake']);
  const X0 = dsp(lib, ctx);
  for (const f of TRACK) if (typeof X0[f] === 'function') X0[f] = tracked(f, X0[f]); // dsp() calls these through X0
  // section helpers (X.steps, X.gearTake...) are assigned later by the sections: wrap them on assignment
  const X = new Proxy(X0, { set: (t, p, v) => { t[p] = TRACK.has(p) && typeof v === 'function' ? tracked(p, v) : v; return true; } });
  // Variant cache (tools/audio/out/cache/creatures-v/): the key hashes the recipe (make.key, or the sound's own
  // add(...) call text plus everything else in its section: shared section helpers), the manifest options and every
  // DSP helper (dsp.toString(), PROFILES, S), so a change re-renders exactly what it affects. --no-cache bypasses it.
  const usedKeys = new Set();
  const helperHash = hashText(dsp.toString() + JSON.stringify(PROFILES) + JSON.stringify(S, (k, v) => (typeof v === 'function' ? v.toString() : v)));
  const add = async (name, make, opts) => {
    if (!want(name)) return;
    cur = name;
    used.set(name, new Set());
    const t0 = Date.now();
    const recipe = make.key || (section ? `${section.common}|${section.calls.get(name) ?? make.toString()}` : make.toString());
    const key = hashText(`${name}|${recipe}|${JSON.stringify(opts)}|${helperHash}|${section ? 'per-call' : ''}|v${CACHE_V}`);
    usedKeys.add(key);
    let list = ctx.options.noCache ? null : readCache(lib, key);
    if (list) for (const id of list.sources) { used.get(name).add(id); ctx.sources.used.add(id); }
    else {
      // phone tilt + DC high-pass are IIR filters: on a loop they run circularly, else the wrap clicks (filter
      // state at the end != the zero state they start from)
      const post = (b) => X.sanitize(opts.phone !== undefined ? X.phoneMatch(b, opts.phone) : b);
      list = (await make()).map((b) => (opts.loop ? circular(lib, b, post) : post(b)));
      list.sources = [...used.get(name)];
      writeCache(lib, key, list);
    }
    if (MAX_CREST[name]) { const c = list.cached; list = list.map((b) => tameCrest(lib, b, MAX_CREST[name])); list.cached = c; }
    { const c = list.cached; list = list.map((b) => cleanup(lib, b, opts)); list.cached = c; }
    if (SHEET) X.sheet(name, list);
    const { phone, ...wopts } = opts;
    await cat.add(name, list, { ceiling: -1.05, ...wopts, sources: [...used.get(name)].sort() });
    ctx.log(`    (${name}: ${list.length} variants, ${((Date.now() - t0) / 1000).toFixed(1)} s${list.cached ? ', cached' : ''})`);
  };

  // recipes whose closures do not carry their own data (make.key) are keyed by their add(...) call + section helpers
  let section = null;
  await zombieVoices(lib, ctx, X, add);
  section = splitSection(specials.toString());
  await specials(lib, ctx, X, add);
  section = splitSection(playerAndSteps.toString());
  await playerAndSteps(lib, ctx, X, add);
  await cat.write();
  // CREATURES_PRUNE=1 (full runs only): drop cached renders no recipe asked for any more
  if (process.env.CREATURES_PRUNE && !ONLY && fs.existsSync(CACHE_DIR)) {
    let n = 0;
    for (const f of fs.readdirSync(CACHE_DIR)) { if (!usedKeys.has(f.split(/[_.]/)[0])) { fs.unlinkSync(path.join(CACHE_DIR, f)); n++; } }
    ctx.log(`  pruned ${n} stale cache files`);
  }
}

/**
 * Split a section function's source into its `await add('<name>', ...)` calls (balanced-paren scan that skips strings,
 * template literals and comments) and the remaining shared text (section helpers, constants, comments).
 */
function splitSection(src) {
  const calls = new Map();
  let common = '', last = 0;
  const re = /await add\('([a-z0-9_]+)'/g;
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + 'await add'.length, depth = 0;
    const stack = []; // string / template states
    for (; i < src.length; i++) {
      const c = src[i], top = stack[stack.length - 1];
      if (top === '//') { if (c === '\n') stack.pop(); continue; }
      if (top === '/*') { if (c === '*' && src[i + 1] === '/') { stack.pop(); i++; } continue; }
      if (top === "'" || top === '"') { if (c === '\\') i++; else if (c === top) stack.pop(); continue; }
      if (top === '`') { if (c === '\\') i++; else if (c === '`') stack.pop(); else if (c === '$' && src[i + 1] === '{') { stack.push('${'); i++; } continue; }
      if (c === '/' && src[i + 1] === '/') { stack.push('//'); i++; continue; }
      if (c === '/' && src[i + 1] === '*') { stack.push('/*'); i++; continue; }
      if (c === "'" || c === '"' || c === '`') { stack.push(c); continue; }
      if (top === '${' && c === '}') { stack.pop(); continue; }
      if (c === '(' || c === '{' || c === '[') depth++;
      else if (c === ')' || c === '}' || c === ']') { depth--; if (depth === 0 && c === ')') break; }
    }
    common += src.slice(last, m.index);
    calls.set(m[1], src.slice(m.index, i + 1));
    last = i + 1;
    re.lastIndex = last;
  }
  common += src.slice(last);
  return { common, calls };
}

// ================================================================================================== crest control
// Peak-to-loudness ceilings (dB) for one-shots whose single transient would otherwise make the writer's true-peak
// limiter work hard to reach the LUFS target (QA: limiter <= 4 dB). A soft clipper takes exactly the excess off the
// transient (the body, which carries the loudness, stays linear). Applied after the variant cache (cheap, deterministic).
const MAX_CREST = {
  brute_stomp: 17.5, land: 21, land_heavy: 19, jump: 23, zombie_footstep: 24, zombie_run_step: 23,
  footstep_concrete: 23, footstep_metal: 23, footstep_wood: 23, footstep_dirt: 23, footstep_grate: 23, footstep_water: 23,
};
function tameCrest(lib, y, maxCrest) {
  for (let it = 0; it < 5; it++) {
    const crest = lib.lin2db(lib.truePeak(y)) - lib.lufs(y);
    if (!(crest > maxCrest + 0.3)) break;
    y = lib.softClip(lib.normalizePeak(y, 0), { threshold: -2 * (crest - maxCrest) - 1.5, ceiling: -0.3 });
  }
  return y;
}

// ================================================================================================== mastering cleanup
/** Run fn on two back-to-back copies and keep the second: IIR filter state is then continuous across the loop wrap. */
function circular(lib, b, fn) {
  const n = b.length;
  return lib.sliceSamples(fn(lib.concat([b, b])), n, 2 * n);
}

/**
 * Last pass before the writer (after the variant cache, so it is cheap and never stale):
 *   - voice bus: subsonic high-pass (35 Hz, 24 dB/oct). The chest layers / growl beds left 25-40 Hz rumble that no
 *     phone plays and that bosses push into infrasound (the game plays roars / screeches at pitch 0.5).
 *   - one-shots: trim the tail below -60 dB re peak (reverb / fade residue; it only held a voice slot).
 */
function cleanup(lib, y, { loop, bus }) {
  if (bus === 'voice') {
    const hp = (b) => lib.eq(b, [{ type: 'hp', f: 35, order: 4 }]);
    y = loop ? circular(lib, y, hp) : hp(y);
  }
  if (loop) return y;
  const sr = y.sampleRate, th = lib.peak(y) * lib.db2lin(-60);
  let last = 0;
  for (const d of y.data) for (let i = d.length - 1; i > last; i--) if (Math.abs(d[i]) > th) { last = i; break; }
  const end = Math.min(y.length, last + Math.round(0.03 * sr));
  if (y.length - end < Math.round(0.01 * sr)) return y;
  return lib.fadeOut(lib.sliceSamples(y, 0, end), 0.02, 'sine');
}

// ================================================================================================== variant cache
function hashText(s) { return crypto.createHash('sha1').update(s).digest('hex').slice(0, 20); }
// Bump when the meaning of a cached entry changes without its recipe text changing.
//   2: loops post-filtered circularly (seamless wrap); per-sound sources include shared beds / pools
const CACHE_V = 2;
const CACHE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'out', 'cache', 'creatures-v');
function readCache(lib, key) {
  const idx = path.join(CACHE_DIR, `${key}.json`);
  if (!fs.existsSync(idx)) return null;
  try {
    const meta = JSON.parse(fs.readFileSync(idx, 'utf8'));
    const list = [];
    for (let k = 0; k < meta.n; k++) {
      const f = path.join(CACHE_DIR, `${key}_${k}.f32`);
      const raw = fs.readFileSync(f);
      const ch = meta.ch[k], n = raw.length / 4 / ch;
      const all = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
      list.push(new lib.Buf(Array.from({ length: ch }, (_, c) => all.slice(c * n, (c + 1) * n)), 48000));
    }
    list.sources = meta.sources || [];
    list.cached = true;
    return list;
  } catch { return null; }
}
function writeCache(lib, key, list) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  list.forEach((b, k) => {
    const all = new Float32Array(b.length * b.channels);
    b.data.forEach((d, c) => all.set(d, c * b.length));
    fs.writeFileSync(path.join(CACHE_DIR, `${key}_${k}.f32`), Buffer.from(all.buffer));
  });
  fs.writeFileSync(path.join(CACHE_DIR, `${key}.json`), JSON.stringify({ n: list.length, ch: list.map((b) => b.channels), sources: list.sources }));
}

// ================================================================================================== voice profiles
// pitch / formant in semitones (ranges: each variant draws inside), stretch = duration factor, rasp = tube drive (dB)
// into the 250 Hz - 4.5 kHz band, flutter = jittered amplitude modulation (Hz, depth), wet = which liquid bed and its
// level (dB under the voice), sub = sub-octave chest layer level (dB), eq = phone-speaker voicing.
const PROFILES = {
  zombie: { pitch: [-2.2, -0.6], formant: [-2.6, -1.2], stretch: [1.0, 1.12], rasp: 10, raspMix: 0.38, flutter: [34, 0.22], wet: ['gurgle', -21], hp: 85, lp: 9500, body: [180, 2], presence: [2400, 2] },
  runner: { pitch: [-0.6, 0.8], formant: [-0.6, 0.6], stretch: [0.92, 1.0], rasp: 15, raspMix: 0.55, flutter: [58, 0.26], wet: ['gurgle', -24], hp: 110, lp: 11500, body: [220, 1], presence: [3000, 3] },
  brute: { pitch: [-6.5, -4.5], formant: [-5.5, -4], stretch: [1.05, 1.2], rasp: 12, raspMix: 0.42, flutter: [27, 0.3], wet: ['gurgle', -22], sub: -10, hp: 62, lp: 7000, body: [160, 3], presence: [1800, 2], maxSubDb: -11 },
  spitter: { pitch: [-1.6, 0], formant: [-1.2, 0.2], stretch: [1.0, 1.1], rasp: 9, raspMix: 0.3, flutter: [44, 0.18], wet: ['gurgle', -8], hp: 85, lp: 9000, body: [200, 1.5], presence: [2600, 2] },
  bloater: { pitch: [-4.2, -2.6], formant: [-4.4, -3], stretch: [1.08, 1.22], rasp: 7, raspMix: 0.25, flutter: [22, 0.3], wet: ['stomach', -6], sub: -12, hp: 62, lp: 6500, body: [170, 3], presence: [1600, 2], maxSubDb: -11 },
  crawler: { pitch: [3.0, 5.5], formant: [3.0, 5.0], stretch: [0.82, 0.95], rasp: 16, raspMix: 0.5, flutter: [92, 0.32], wet: ['gurgle', -22], hp: 170, lp: 13500, body: [400, 0], presence: [3800, 3] },
  screamer: { pitch: [-0.5, 1.2], formant: [0.4, 1.6], stretch: [1.0, 1.08], rasp: 8, raspMix: 0.22, flutter: [13, 0.14], wet: ['gurgle', -26], hp: 220, lp: 14500, body: [300, 0], presence: [3200, 2] },
  hound: { pitch: [-2.6, -1.2], formant: [-2.4, -1.2], stretch: [1.0, 1.1], rasp: 11, raspMix: 0.4, flutter: [40, 0.2], wet: ['gurgle', -18], hp: 70, lp: 10000, body: [170, 2], presence: [2600, 2] },
};

// ================================================================================================== zombie voices
async function zombieVoices(lib, ctx, X, add) {
  const V = (id, a, b, o = {}) => ({ id, a, b, ...o });
  const vo = { bus: 'voice', target: 'voice', spatial: true, phone: -2 };
  const big = { ...vo, phone: -3 };
  const set = (type, label, pool, o = {}) => { const f = () => X.voiceSet(type, label, pool, o); f.key = JSON.stringify({ type, label, pool, o }, (k, v) => (typeof v === 'function' ? v.toString() : v)); return f; };
  const P = (pitch, formant) => ({ profile: { pitch, formant } });

  // ---------------------------------------------------------------- walker ('zombie' voice: walkers, riot zombies)
  await add('zombie_idle', set('zombie', 'zombie_idle', [
    V(S.zMoansNoFx, 0.72, 3.6, { snap: 0.5 }), V(S.zMoansNoFx, 13.0, 15.8, { snap: 0.5 }), V(S.darsycho, 0.25, 2.99), V(S.darsycho, 3.66, 6.30),
    V(S.undead(1), 0, 2.3), V(S.zGroanMale, 1.0, 4.4, { snap: 0.3 }), V(S.zMoanMrh, 0.26, 3.65), V(S.oga(17), 0, 1.6),
  ], { n: 8, maxDur: 3.2 }), { ...vo, voices: 4, pitch: [0.94, 1.06], range: [2, 32], note: 'walker moans (ambient)' });

  await add('zombie_alert', set('zombie', 'zombie_alert', [
    V(S.oga(10), 0, 0.7), V(S.oga(4), 0, 0.75), V(S.oga(7), 0, 0.6), V(S.zTaodan, 5.79, 7.28), V(S.zTaodan, 9.20, 10.9, { snap: 0.2 }), V(S.zGrowlT5, 0.04, 2.0),
  ], { n: 6, maxDur: 2.0 }), { ...vo, voices: 3, pitch: [0.95, 1.05], range: [2, 38], note: 'walker spots its target: snarl rising' });

  await add('zombie_attack', set('zombie', 'zombie_attack', [
    V(S.oga(1), 0, 0.86), V(S.oga(11), 0, 0.5), V(S.oga(13), 0, 0.56), V(S.oga(21), 0, 1.08), V(S.vfx('zombieYell6'), 0, 0.33), V(S.zHitT5, 0, 0.6),
  ], { n: 6, maxDur: 1.1 }), { ...vo, voices: 4, pitch: [0.94, 1.06], range: [2, 34], note: 'lunge / swipe snarl' });

  await add('zombie_pain', set('zombie', 'zombie_pain', [
    V(S.zPain2T5, 0, 1.18), V(S.zPain5T5, 0, 0.83), V(S.zGrunts, 15.71, 16.16), V(S.zGrunts, 18.84, 19.18), V(S.oga(24), 0, 0.33), V(S.vfx('zombieYell10'), 0, 0.5),
  ], { n: 6, maxDur: 1.0 }), { ...vo, voices: 3, pitch: [0.93, 1.07], range: [2, 32] });

  await add('zombie_death', set('zombie', 'zombie_death', [
    V(S.vfx('zombieDeath1'), 0, 0.64), V(S.vfx('zombieDeath2'), 0, 0.63), V(S.vfx('zombieDeath3'), 0, 0.81), V(S.vfx('zombieDeath4'), 0, 0.77),
    V(S.zDeathT5, 0, 0.7), V(S.zGroanMale, 30.57, 32.82),
  ], { n: 6, maxDur: 2.2, death: true }), { ...vo, voices: 4, pitch: [0.94, 1.05], range: [2, 34] });

  // ---------------------------------------------------------------- runner (fast infected: raspy, frantic, higher)
  await add('runner_idle', set('runner', 'runner_idle', [
    V(S.werewolfBreath, 4.37, 6.91), V(S.werewolfBreath, 21.86, 24.6, { snap: 0.2 }), V(S.werewolfBreath, 29.31, 30.67), V(S.werewolfBreath, 30.73, 32.06),
  ], { n: 4, maxDur: 2.4 }), { ...vo, voices: 3, pitch: [0.94, 1.08], range: [2, 30], note: 'agitated snarling pants' });
  await add('runner_attack', set('runner', 'runner_attack', [
    V(S.ghoul, 21.81, 22.65), V(S.ghoul, 24.92, 25.88), V(S.ghoul, 26.48, 27.65), V(S.maleScreams, 9.50, 10.08, P([-2.5, -1.5], [-2.2, -1.2])),
  ], { n: 4, maxDur: 1.2 }), { ...vo, voices: 4, pitch: [0.95, 1.06], range: [2, 36] });
  await add('runner_pain', set('runner', 'runner_pain', [
    V(S.maleScreams, 7.92, 8.45, P([-2, -1], [-2, -1])), V(S.maleScreams, 10.95, 11.57, P([-2, -1], [-2, -1])),
    V(S.maleScreams, 12.53, 13.10, P([-2, -1], [-2, -1])), V(S.zGrunts, 10.73, 11.13),
  ], { n: 4, maxDur: 0.8 }), { ...vo, voices: 3, pitch: [0.94, 1.07], range: [2, 32] });
  await add('runner_death', set('runner', 'runner_death', [
    V(S.zGurgledScream, 0, 1.55, P([-3, -2], [-2, -1])), V(S.maleScreams, 4.03, 6.38, P([-2, -1], [-2, -1])),
    V(S.ghoul, 23.31, 24.31), V(S.maleScreamMulti, 21.42, 23.14, P([-2.5, -1.5], [-2, -1])),
  ], { n: 4, maxDur: 2.0, death: true }), { ...vo, voices: 3, pitch: [0.95, 1.05], range: [2, 34] });

  // ---------------------------------------------------------------- brute (tank: huge throat, chest, slow)
  await add('brute_idle', set('brute', 'brute_idle', [
    V(S.zGroanMale, 5.80, 9.2, { snap: 0.3 }), V(S.zGroanMale, 15.43, 18.8, { snap: 0.3 }), V(S.monsterGrowl, 0.10, 3.46, P([-3, -2], [-3, -2])),
    V(S.zMoansNoFx, 20.0, 23.0, { snap: 0.5 }),
  ], { n: 4, maxDur: 3.2 }), { ...big, voices: 2, pitch: [0.95, 1.04], range: [4, 45], note: 'deep groaning breaths' });
  await add('brute_attack', set('brute', 'brute_attack', [
    V(S.monsterScreams, 17.75, 19.95, P([-3, -2], [-3, -2])), V(S.monsterShortRoar, 0.09, 1.31, P([-2, -1], [-2.5, -1.5])),
    V(S.angryBeast, 10.46, 11.58, P([-2.5, -1.5], [-2.5, -1.5])), V(S.zRoarTh, 0.21, 1.9, P([-4, -3], [-4, -3])),
  ], { n: 4, maxDur: 1.6 }), { ...big, voices: 3, pitch: [0.95, 1.05], range: [4, 50] });
  await add('brute_pain', set('brute', 'brute_pain', [
    V(S.grunts3, 0, 0.54), V(S.grunts3, 5.79, 6.19), V(S.maleGrunts, 0.28, 0.96), V(S.bigGrunts, 3.98, 4.39),
  ], { n: 4, maxDur: 0.9 }), { ...big, voices: 2, pitch: [0.95, 1.05], range: [4, 45] });
  await add('brute_death', set('brute', 'brute_death', [
    V(S.monsterScreams, 37.65, 39.71, P([-3, -2], [-3, -2])), V(S.monsterScreams, 64.12, 66.42, P([-3, -2], [-3, -2])),
    V(S.zGroanMale, 33.74, 35.73), V(S.monsterScreams, 69.14, 71.23, P([-3, -2], [-3, -2])),
  ], { n: 4, maxDur: 2.6, death: true }), { ...big, voices: 2, pitch: [0.96, 1.04], range: [4, 55] });

  // ---------------------------------------------------------------- spitter (phlegm, bile, gurgling throat)
  await add('spitter_idle', set('spitter', 'spitter_idle', [
    V(S.zTaodan, 11.54, 14.2, { snap: 0.2 }), V(S.zTaodan, 20.20, 22.9, { snap: 0.3 }), V(S.zNachtmahr, 27.17, 30.23), V(S.zBurp, 0.07, 2.34),
  ], { n: 4, maxDur: 2.8 }), { ...vo, voices: 3, pitch: [0.94, 1.06], range: [2, 32] });
  await add('spitter_attack', set('spitter', 'spitter_attack', [
    V(S.oga(12), 0, 0.79), V(S.oga(19), 0, 0.98), V(S.zNachtmahr, 1.20, 2.38), V(S.zTaodan, 0.54, 2.13),
  ], { n: 4, maxDur: 1.3 }), { ...vo, voices: 3, pitch: [0.95, 1.06], range: [2, 34] });
  await add('spitter_pain', set('spitter', 'spitter_pain', [
    V(S.zNachtmahr, 6.17, 6.59), V(S.zTaodan, 3.25, 3.54), V(S.zTaodan, 5.25, 5.49), V(S.zGrunts, 23.04, 23.57),
  ], { n: 4, maxDur: 0.8 }), { ...vo, voices: 3, pitch: [0.94, 1.07], range: [2, 30] });
  await add('spitter_death', set('spitter', 'spitter_death', [
    V(S.zChoke, 0.35, 2.26), V(S.vomit, 3.90, 5.47, P([-2, -1], [-1.5, -0.5])), V(S.zNachtmahr, 31.51, 32.95), V(S.zTaodan, 16.20, 17.84),
  ], { n: 4, maxDur: 2.2, death: true }), { ...vo, voices: 3, pitch: [0.95, 1.05], range: [2, 34] });

  // ---------------------------------------------------------------- bloater (swollen: deep, bubbling belly)
  await add('bloater_idle', set('bloater', 'bloater_idle', [
    V(S.zBurp, 0.07, 2.34, P([-2.5, -1.5], [-3, -2])), V(S.darsycho, 11.60, 14.56), V(S.darsycho, 14.80, 15.72, P([-3, -2], [-3.5, -2.5])),
    V(S.zMoaning, 2.0, 5.0, { snap: 0.4 }),
  ], { n: 4, maxDur: 3.0 }), { ...big, voices: 2, pitch: [0.95, 1.05], range: [3, 34] });
  await add('bloater_attack', set('bloater', 'bloater_attack', [
    V(S.oga(15), 0, 0.88), V(S.oga(18), 0, 1.1), V(S.oga(20), 0, 0.96), V(S.zNachtmahr, 3.60, 4.66),
  ], { n: 4, maxDur: 1.3 }), { ...big, voices: 2, pitch: [0.95, 1.05], range: [3, 36] });
  await add('bloater_pain', set('bloater', 'bloater_pain', [
    V(S.oga(3), 0, 0.58), V(S.oga(5), 0, 0.5), V(S.oga(6), 0, 0.54), V(S.darsycho, 10.41, 11.30),
  ], { n: 4, maxDur: 0.9 }), { ...big, voices: 2, pitch: [0.94, 1.06], range: [3, 32] });
  await add('bloater_death', set('bloater', 'bloater_death', [
    V(S.vomit, 2.50, 3.74, P([-3, -2], [-3, -2])), V(S.darsycho, 9.29, 10.26), V(S.oga(16), 0, 1.44), V(S.zGroanMale, 39.06, 40.72, P([-3.5, -2.5], [-4, -3])),
  ], { n: 4, maxDur: 2.0, death: true }), { ...big, voices: 2, pitch: [0.95, 1.05], range: [3, 36] });

  // ---------------------------------------------------------------- crawler (small, fast, insect-like)
  await add('crawler_idle', set('crawler', 'crawler_idle', [
    V(S.zChoke, 0.35, 2.26), V(S.zHorrific, 0.28, 2.49), V(S.zGrowlOz1, 0.13, 2.4, { snap: 0.2 }), V(S.zNachtmahr, 4.93, 6.07),
  ], { n: 4, maxDur: 2.2 }), { ...vo, voices: 3, pitch: [0.93, 1.08], range: [2, 28] });
  await add('crawler_attack', set('crawler', 'crawler_attack', [
    V(S.zBradsim, 5.07, 6.38), V(S.zGrunts, 6.58, 6.94), V(S.zMutant, 0.22, 1.32), V(S.zRestraint, 21.81, 23.04),
  ], { n: 4, maxDur: 1.1 }), { ...vo, voices: 3, pitch: [0.94, 1.08], range: [2, 32] });
  await add('crawler_pain', set('crawler', 'crawler_pain', [
    V(S.zGrunts, 2.02, 2.37), V(S.zGrunts, 5.44, 5.80), V(S.zGrunts, 7.60, 7.96), V(S.oga(9), 0, 0.88),
  ], { n: 4, maxDur: 0.7 }), { ...vo, voices: 3, pitch: [0.93, 1.08], range: [2, 28] });
  await add('crawler_death', set('crawler', 'crawler_death', [
    V(S.zBradsim, 0.11, 2.4, { snap: 0.2 }), V(S.zChoke, 2.76, 3.46), V(S.zRestraint, 13.09, 14.11), V(S.zGrowlOz2, 0.38, 2.2, { snap: 0.2 }),
  ], { n: 4, maxDur: 1.8, death: true }), { ...vo, voices: 3, pitch: [0.94, 1.06], range: [2, 30] });

  // ---------------------------------------------------------------- screamer (female banshee)
  await add('screamer_idle', set('screamer', 'screamer_idle', [
    V(S.demonGrowlF, 1.06, 4.0, { snap: 0.3 }), V(S.demonGrowlF, 10.0, 13.0, { snap: 0.4 }), V(S.bansheeRpg, 0.28, 1.40), V(S.bansheeRpg, 14.83, 16.36),
  ], { n: 4, maxDur: 3.0 }), { ...vo, voices: 2, pitch: [0.95, 1.05], range: [3, 36], note: 'female: hissing, sobbing growls' });
  await add('screamer_attack', set('screamer', 'screamer_attack', [
    V(S.bansheeRpg, 4.28, 5.20), V(S.bansheeRpg, 8.46, 9.64), V(S.zombieGirl, 8.48, 8.77), V(S.zombieGirl, 6.91, 7.82),
  ], { n: 4, maxDur: 1.3 }), { ...vo, voices: 2, pitch: [0.96, 1.05], range: [3, 40] });
  await add('screamer_pain', set('screamer', 'screamer_pain', [
    V(S.zombieGirl, 9.30, 10.10), V(S.bansheeRpg, 12.46, 12.83), V(S.zombieGirl, 2.08, 2.87), V(S.femZombie1, 1.13, 2.03),
  ], { n: 4, maxDur: 0.9 }), { ...vo, voices: 2, pitch: [0.95, 1.06], range: [3, 36] });
  await add('screamer_death', set('screamer', 'screamer_death', [
    V(S.bansheeDeath, 1.55, 3.80), V(S.bansheeRpg, 9.79, 11.82), V(S.zombieGirl, 10.79, 11.73), V(S.demonWoman, 0.11, 3.18),
  ], { n: 4, maxDur: 2.6, death: true }), { ...vo, voices: 2, pitch: [0.96, 1.04], range: [3, 45] });
}

// ================================================================================================== specials
async function specials(lib, ctx, X, add) {
  // ---------------------------------------------------------------- section helpers
  /**
   * Heavy footfall (brute): pitched sub thump + a real heavy body-fall / stone impact + punch + debris rattle, with
   * the low end implied as 120-300 Hz harmonics for phones. size scales length and pitch.
   */
  X.stomp = async (seed, { size = 1 } = {}) => {
    const r = ctx.rng(seed);
    const th = lib.thump({ f0: 120 / Math.pow(size, 0.3), f1: 36, sweep: 0.035, decay: 0.3 * size, click: 0.1, drive: 2.5, seed: `${seed}:t` });
    const falls = [[S.bodyFallDirt, 0.12, 1.32], [S.stoneHeavy, 0, 1.1], [S.bodyFallGround, 0, 0.8]];
    const fl = falls[r.int(0, falls.length - 1)];
    let fall = lib.normalizePeak(await X.take(fl[0], fl[1], fl[2], { hp: 40 }), -2);
    fall = lib.fadeOut(lib.slice(fall, 0, Math.min(fall.duration, 0.32)), 0.16, 'exp');
    fall = lib.varispeedSemis(fall, -1 - r.next() * 2.5, { quality: 'fast' });
    const punch = lib.normalizePeak(await X.take(S.kenney(`impactPunch_heavy_00${r.int(0, 4)}`), 0, 1), -3);
    const deb = lib.normalizePeak(await X.take(r.next() < 0.5 ? S.rubble : S.rockFall, 0, 1, { hp: 300 }), -3);
    // ground resonance: low rumble ringing on after the impact (gives the footfall weight and body)
    let rum = lib.eq(lib.noise(0.6 * size + 0.2, { color: 'brown', seed: `${seed}:r` }), [{ type: 'lp', f: 220, order: 4 }, { type: 'hp', f: 45, order: 2 }]);
    rum = lib.decay(lib.fadeIn(lib.normalizePeak(rum, -3), 0.01), 0.55 * size);
    let y = lib.mix([{ buf: th, gain: -1 }, { buf: fall, gain: -3 }, { buf: punch, gain: -7 }, { buf: deb, at: 0.025 + r.next() * 0.03, gain: -11 }, { buf: rum, at: 0.004, gain: -9 }], { channels: 1 });
    y = lib.psychoBass(y, { freq: 110, amount: -2 });
    y = lib.eq(y, [{ type: 'hp', f: 32, order: 2 }, { type: 'peak', f: 170, gain: 3, q: 0.9 }, { type: 'lp', f: 9000, order: 2 }]);
    y = lib.softClip(lib.normalizePeak(y, 0), { threshold: -14, ceiling: -0.5 });
    return lib.fadeOut(lib.slice(y, 0, Math.min(y.duration, 0.7 * size + 0.1)), 0.25, 'exp');
  };

  const V = (id, a, b, o = {}) => ({ id, a, b, ...o });
  const P = (pitch, formant, more = {}) => ({ profile: { pitch, formant, ...more } });
  const vo = { bus: 'voice', spatial: true, phone: -2 };
  const sfx = { bus: 'sfx', spatial: true };

  // ---------------------------------------------------------------- walker feeding on a corpse (loop)
  await add('zombie_eat', async () => {
    const rip = await X.take(S.carcass, 10.0, 18.5, { trim: null, hp: 90, autoFade: false });
    const chew = await X.take(S.eatingMeat, 0.5, 9.0, { trim: null, hp: 90, autoFade: false });
    const parts = [{ buf: lib.normalizePeak(rip, -3) }, { buf: lib.normalizePeak(chew, -3), gain: -4 }];
    // muffled feeding growls (mouth full)
    const gr = [[S.oga(22), 0, 0.67], [S.oga(23), 0, 0.81], [S.zGrunts, 19.91, 20.39]];
    for (let i = 0; i < gr.length; i++) {
      let g = lib.normalizePeak(await X.take(gr[i][0], gr[i][1], gr[i][2]), -3);
      g = await X.zombify(g, 'zombie', `eat${i}`);
      parts.push({ buf: lib.eq(g, [{ type: 'lp', f: 1800, order: 2 }]), at: [1.1, 3.8, 6.0][i], gain: -9 });
    }
    const y = lib.mix(parts, { length: 8.5, channels: 1 });
    return [X.loop(lib.eq(y, [{ type: 'hp', f: 90, order: 2 }]), 1.0)];
  }, { ...vo, target: 'voice', lufs: -23, loop: true, voices: 2, pitch: [0.96, 1.04], range: [2, 20], note: 'loop: walker feeding (tearing, chewing, muffled growls)' });

  // ---------------------------------------------------------------- runner: frenzied scream when it starts sprinting
  await add('runner_scream', () => X.voiceSet('runner', 'runner_scream', [
    V(S.zScreamLola, 0.15, 2.66), V(S.zDemonScream, 0.09, 2.08, P([-1, 0], [-1, 0])), V(S.maleScreams, 0.61, 3.03, P([-2.5, -1.5], [-2.2, -1.2])), V(S.ghoul, 0.04, 2.01),
  ], { n: 4, maxDur: 2.3, profile: { rasp: 17, raspMix: 0.62 }, post: (y, k) => X.double(y, { semis: -5, formant: -4, delay: 0.012, gainDb: -8, seed: `rs${k}` }) }),
  { ...vo, lufs: -19, voices: 3, pitch: [0.96, 1.04], range: [4, 60], priority: 1.5 });

  await add('runner_breath', async () => {
    let a = await X.take(S.werewolfBreath, 0.16, 4.75, { trim: null, autoFade: false });
    a = await X.zombify(lib.normalizePeak(a, -3), 'runner', 'rb', { profile: { pitch: [0.3, 0.3], formant: [0.4, 0.4], stretch: [1, 1], raspMix: 0.4, wet: ['gurgle', -20] } });
    let h = await X.take(S.runBreath2, 0.06, 3.86, { trim: null, hp: 120, autoFade: false });
    h = X.flutter(X.shift(lib.normalizePeak(h, -3), -3, -2.5, 1.2), { rate: 55, depth: 0.25, seed: 'rbh' });
    const n = Math.min(a.duration, h.duration);
    const loop = lib.mix([{ buf: lib.fitLength(a, n) }, { buf: lib.fitLength(h, n), gain: -5 }]);
    return [X.loop(lib.eq(loop, [{ type: 'hp', f: 120, order: 2 }]), 0.5)];
  }, { ...vo, target: 'voice', lufs: -24, loop: true, voices: 2, pitch: [0.97, 1.03], range: [2, 22], note: 'loop: sprinting runner panting' });

  // ---------------------------------------------------------------- brute: roar, stomp, charge
  await add('brute_roar', async () => {
    const cores = [[0.06, 3.21], [10.41, 13.7], [55.41, 58.7]];
    const out = [];
    for (let k = 0; k < cores.length; k++) {
      let core = lib.normalizePeak(await X.take(S.monsterScreams, cores[k][0], cores[k][1], { snap: k ? 0.3 : 0 }), -3);
      core = await X.zombify(core, 'brute', `roar${k}`, { profile: { pitch: [-3.2, -2.4], formant: [-3.6, -2.8], stretch: [1.05, 1.12], sub: -7, raspMix: 0.5 } });
      // second throat: a different roar an octave-ish lower, following the core's envelope
      let two = lib.normalizePeak(await X.take(k === 1 ? S.angryBeast : S.zRoarTh, k === 1 ? 2.21 : 0.21, k === 1 ? 5.6 : 3.78), -3);
      two = X.shift(two, -5, -5, core.duration / two.duration);
      two = lib.eq(two, [{ type: 'lp', f: 2600, order: 2 }]);
      let y = lib.mix([{ buf: core }, { buf: lib.fitLength(two, core.duration), gainLin: (X.rms(core) / Math.max(1e-9, X.rms(two))) * lib.db2lin(-7) }]);
      // lion-like rumble from a deep real growl, gated by the roar
      y = X.follow(y, await X.bedOf(S.dogGrowlDeep, 5.06, 8.27), { gainDb: -9, lo: 60, hi: 900, power: 1.2, seed: `roarg${k}` });
      y = lib.reverb(y, 'urban', { wet: 0.13, seed: `roarv${k}`, channels: 1, length: 1.2 });
      y = lib.fadeOut(y, Math.min(0.6, y.duration * 0.25), 'exp');
      out.push(lib.trimSilence(y, { threshDb: -55, post: 0.08 }));
    }
    return out;
  }, { ...vo, lufs: -18, voices: 2, pitch: [0.97, 1.03], range: [8, 110], priority: 2, note: 'brute war roar (before a charge)' });

  await add('brute_stomp', async () => {
    const out = [];
    for (let k = 0; k < 3; k++) out.push(await X.stomp(`stomp${k}`, { size: 1 }));
    return out;
  }, { ...sfx, target: 'impact', lufs: -21, voices: 3, pitch: [0.93, 1.05], range: [6, 75], priority: 1.5, phone: -4, note: 'brute footfall that shakes the camera' });

  await add('brute_charge', async () => {
    const out = [];
    // two genuinely different runs (QA: the old pair measured 0.9 dB apart in spectrum, envelope r 0.99 = one sound):
    //   A: six even strides accelerating, short effort grunt on the first stride
    //   B: a heavy-light gallop (seven strides, paired), other huff takes, a growl that swells into a roar
    const RUNS = [
      { gaps: [0.40, 0.36, 0.33, 0.30, 0.28, 0.27], huffs: [[2.06, 2.85], [2.92, 3.49], [7.42, 7.99]], huffEvery: 2,
        bel: [42.95, 43.72], belAt: 0.02, belGain: -4, belPitch: [-3, -2.5] },
      { gaps: [0.22, 0.36, 0.20, 0.33, 0.19, 0.31, 0.18], huffs: [[13.10, 13.64], [26.29, 26.93], [10.02, 10.81]], huffEvery: 3,
        bel: [30.45, 32.0], belAt: 0.0, belGain: -5, belPitch: [-2.5, -2], belFade: 0.5 },
    ];
    for (let k = 0; k < RUNS.length; k++) {
      const R = RUNS[k];
      const r = ctx.rng(`charge${k}`);
      const parts = [];
      let t = 0.0;
      const gaps = R.gaps;
      for (let i = 0; i < gaps.length; i++) {
        // gallop: the lead foot of each pair lands harder
        const lead = k === 0 || i % 2 === 0;
        const st = await X.stomp(`charge${k}:${i}`, { size: (0.75 + 0.05 * i) * (lead ? 1 : 0.85) });
        parts.push({ buf: st, at: t, gain: -3 + i * 0.6 - (lead ? 0 : 3) });
        if (i % R.huffEvery === 0) {
          const [a, b] = R.huffs[(i / R.huffEvery) % R.huffs.length];
          let huff = lib.normalizePeak(await X.take(S.werewolfBreath, a, b, { hp: 80 }), -3);
          huff = X.rasp(X.shift(huff, -6, -5.5, 1.1), { drive: 12, mix: 0.45 });
          // the breath takes are cut out of one long performance: release them (QA saw a 12 dB / 40 ms drop at the cut)
          huff = lib.fadeOut(huff, Math.min(0.3, huff.duration * 0.45), 'exp');
          parts.push({ buf: lib.eq(huff, [{ type: 'lp', f: 3500, order: 2 }]), at: t + 0.05, gain: -9 });
        }
        t += gaps[i] * (0.95 + 0.1 * r.next());
      }
      // effort bellow on top of the first strides
      let bel = lib.normalizePeak(await X.take(S.monsterScreams, R.bel[0], R.bel[1]), -3);
      bel = await X.zombify(bel, 'brute', `bellow${k}`, { profile: { pitch: R.belPitch, formant: [-3.5, -3], sub: -9 } });
      // B's take is cut mid-roar: let it die away over 0.5 s (the 260 ms auto edge fade read as a tape cut)
      if (R.belFade) bel = lib.fadeOut(bel, Math.min(R.belFade, bel.duration * 0.4), 'exp');
      parts.push({ buf: bel, at: R.belAt, gain: R.belGain });
      // ground rumble swelling under the run
      let rum = lib.noise(t + 0.6, { color: 'brown', seed: `rum${k}` });
      rum = lib.eq(rum, [{ type: 'lp', f: 140, order: 4 }, { type: 'hp', f: 35, order: 2 }]);
      rum = lib.automate(lib.normalizePeak(rum, -14), [[0, -30], [0.5, -6], [t, 0], [t + 0.6, -40]]);
      parts.push({ buf: lib.psychoBass(rum, { freq: 110, amount: -2 }), at: 0 });
      let y = lib.mix(parts, { channels: 1 });
      y = lib.softClip(lib.normalizePeak(y, 0), { threshold: -8, ceiling: -0.5 });
      out.push(lib.fadeOut(y, 0.35, 'exp'));
    }
    return out;
  }, { ...sfx, target: 'impact', lufs: -18, voices: 2, pitch: [0.97, 1.03], range: [8, 90], priority: 2, phone: -4, note: 'brute charge: accelerating stomps, huffs, bellow, ground rumble' });

  // ---------------------------------------------------------------- spitter: wind-up gurgle and the spit
  await add('spitter_gurgle', async () => {
    const out = [];
    const takes = [[0.45, 1.95], [2.55, 4.05]];
    for (let k = 0; k < 2; k++) {
      let g = lib.normalizePeak(await X.take(S.gargleSpit, takes[k][0], takes[k][1], { snap: 0.15 }), -3);
      // the throat "charges": pitch rises over the gurgle
      g = lib.varispeedCurve(g, [[0, 0.88], [g.duration * 0.9, 1.08]]);
      let v = lib.normalizePeak(await X.take(S.zChoke, 2.76, 3.46), -3);
      v = await X.zombify(v, 'spitter', `sg${k}`, { profile: { pitch: [-2, -1], wet: ['gurgle', -4] } });
      let y = lib.mix([{ buf: X.follow(g, await X.wetBed('gurgle'), { gainDb: -3, seed: `sgw${k}` }) }, { buf: v, at: g.duration * 0.45, gain: -3 }]);
      y = X.voiceEq(y, PROFILES.spitter);
      out.push(lib.fadeOut(y, 0.2, 'exp'));
    }
    return out;
  }, { ...vo, target: 'voice', lufs: -21, voices: 2, pitch: [0.96, 1.04], range: [2, 30], note: 'spit wind-up: bile gurgling up the throat' });

  await add('spitter_spit', async () => {
    const out = [];
    const spits = [[S.spitBlood1, 5.16, 5.94], [S.spitting, 0.20, 0.52], [S.spitBlood1, 0.14, 0.68]];
    const hawks = [[S.gargleSpit, 4.3, 4.9], [S.vomit, 0.70, 1.20], [S.gargleSpit, 1.2, 1.7]];
    for (let k = 0; k < 3; k++) {
      let hawk = lib.normalizePeak(await X.take(hawks[k][0], hawks[k][1], hawks[k][2], { snap: 0.1 }), -3);
      hawk = lib.fadeOut(X.rasp(X.shift(hawk, -1.5, -1), { drive: 10, mix: 0.35 }), 0.08, 'exp');
      let spit = lib.normalizePeak(await X.take(spits[k][0], spits[k][1], spits[k][2]), -1);
      spit = lib.eq(spit, [{ type: 'hp', f: 200, order: 2 }, { type: 'peak', f: 900, gain: 3, q: 0.8 }]);
      const sq = lib.normalizePeak(await X.take(k === 1 ? S.wetSplat1 : S.waterSquish, 0, 0.5), -3);
      const wh = lib.whoosh({ dur: 0.32, f0: 2400, f1: 600, q: 2, seed: `spw${k}` });
      const at = Math.min(0.42, hawk.duration * 0.85);
      let y = lib.mix([{ buf: hawk, gain: -4 }, { buf: spit, at }, { buf: sq, at: at + 0.01, gain: -9 }, { buf: wh, at: at + 0.05, gain: -14 }], { channels: 1 });
      out.push(lib.fadeOut(y, 0.12, 'exp'));
    }
    return out;
  }, { ...vo, target: 'voice', lufs: -19, voices: 3, pitch: [0.95, 1.06], range: [2, 36], note: 'hawk + acid spit launch' });

  await add('acid_splash', async () => {
    const out = [];
    const splats = [[S.waterSquish, 0, 0.45], [S.wetSplat2, 0, 0.5], [S.mudSplat, 0, 0.42]];
    for (let k = 0; k < 3; k++) {
      const sp = lib.normalizePeak(await X.take(splats[k][0], splats[k][1], splats[k][2]), -1);
      const sl = lib.normalizePeak(await X.take(S.splash, 0, 0.9, { hp: 250 }), -3);
      let sz = await X.take(S.sizzle, 12 + k * 21, 13.6 + k * 21, { trim: null, hp: 1200 });
      sz = lib.fadeOut(lib.fadeIn(lib.normalizePeak(sz, -3), 0.03), 0.9, 'exp');
      let bub = await X.take(S.acidBubbling, 0.04, 1.6, { trim: null, hp: 300 });
      bub = lib.fadeOut(lib.fadeIn(lib.normalizePeak(bub, -3), 0.05), 0.6, 'exp');
      let y = lib.mix([{ buf: sp }, { buf: sl, at: 0.004, gain: -6 }, { buf: sz, at: 0.025, gain: -1 }, { buf: bub, at: 0.1, gain: -8 }], { channels: 1 });
      y = lib.softClip(lib.normalizePeak(y, 0), { threshold: -13, ceiling: -0.5 });
      out.push(lib.fadeOut(lib.slice(y, 0, Math.min(y.duration, 1.3)), 0.35, 'exp'));
    }
    return out;
  }, { ...sfx, target: 'impact', lufs: -18, voices: 4, pitch: [0.93, 1.07], range: [2, 35], phone: -2.5, note: 'acid glob lands: splat + hiss + bubbling' });

  // ---------------------------------------------------------------- bloater: wet belly loop and the big pop
  await add('bloater_gurgle', async () => {
    let st = await X.take(S.stomachLong, 14.0, 21.5, { trim: null, hp: 40, autoFade: false });
    st = lib.psychoBass(lib.normalizePeak(st, -3), { freq: 130, amount: -1 });
    let st2 = await X.take(S.stomach10, 2.0, 9.5, { trim: null, hp: 40, autoFade: false });
    st2 = lib.psychoBass(lib.normalizePeak(st2, -3), { freq: 130, amount: -2 });
    const g = lib.eq(X.bed(await X.wetBed('gurgle'), 7.5, 'bg'), [{ type: 'hp', f: 200, order: 2 }, { type: 'lp', f: 2500, order: 2 }]);
    let groan = lib.normalizePeak(await X.take(S.zBurp, 0.07, 2.34), -3);
    groan = await X.zombify(groan, 'bloater', 'bgg', { profile: { pitch: [-4, -4], formant: [-4.5, -4.5] } });
    let y = lib.mix([{ buf: st }, { buf: st2, gain: -3 }, { buf: lib.normalizePeak(g, -3), gain: -4 }, { buf: lib.eq(groan, [{ type: 'lp', f: 2000, order: 2 }]), at: 2.2, gain: -9 }], { length: 7.5, channels: 1 });
    y = lib.eq(y, [{ type: 'hp', f: 45, order: 2 }, { type: 'peak', f: 260, gain: 3, q: 0.8 }]);
    return [X.loop(y, 1.0)];
  }, { ...vo, target: 'voice', lufs: -25, loop: true, voices: 2, pitch: [0.96, 1.04], range: [2, 20], phone: -3.5, note: 'loop: bloated belly churning' });

  await add('bloater_pop', async () => {
    const out = [];
    const hits = [[S.goreSplat, 0, 1.4], [S.goreHeart, 0, 1.1], [S.grossImpact, 0, 1.1]];
    for (let k = 0; k < 3; k++) {
      const r = ctx.rng(`pop${k}`);
      const th = lib.thump({ f0: 150, f1: 36, sweep: 0.05, decay: 0.42, click: 0.45, drive: 3, seed: `popt${k}` });
      const hit = lib.normalizePeak(await X.take(hits[k][0], hits[k][1], hits[k][2]), -1);
      let guts = await X.take(S.grossGuts, 4 + k * 9, 5.6 + k * 9, { snap: 0.2 });
      guts = lib.fadeOut(lib.normalizePeak(guts, -3), 0.5, 'exp');
      const spl = lib.normalizePeak(await X.take(S.bigSplash, 0, 1.6, { hp: 120 }), -2);
      const bone = lib.normalizePeak(await X.take(S.boneCrunch, 0, 0.9), -3);
      const air = lib.noiseBurst({ dur: 0.3, decay: 0.14, lp: 1400, color: 'pink', seed: `popa${k}` });
      const parts = [{ buf: th, gain: -2 }, { buf: hit, at: 0.002 }, { buf: air, gain: -6 }, { buf: spl, at: 0.01, gain: -5 }, { buf: bone, at: 0.006, gain: -13 }, { buf: guts, at: 0.12, gain: -8 }];
      // splatter raining down after the burst
      for (let i = 0; i < 5; i++) {
        const d = lib.normalizePeak(await X.take(i % 2 ? S.slime27 : S.bloodSquish, 0, 0.6), -3);
        parts.push({ buf: X.shift(d, (r.next() * 6 - 3), 0), at: 0.28 + i * 0.13 + r.next() * 0.08, gain: -14 - r.next() * 6 });
      }
      let y = lib.mix(parts, { channels: 1 });
      y = lib.psychoBass(y, { freq: 110, amount: -3 });
      y = lib.softClip(lib.normalizePeak(y, 0), { threshold: -9, ceiling: -0.5 });
      out.push(lib.fadeOut(y, 0.4, 'exp'));
    }
    return out;
  }, { ...sfx, target: 'explosion', lufs: -16, voices: 3, pitch: [0.95, 1.05], range: [5, 75], priority: 2, phone: -4, note: 'bloater bursts: wet blast, guts, splatter rain' });

  // ---------------------------------------------------------------- crawler: screech + skitter loop
  await add('crawler_screech', () => X.voiceSet('crawler', 'crawler_screech', [
    V(S.zMutant, 0.22, 1.32), V(S.zRestraint, 21.81, 23.04), V(S.ghoul, 2.27, 4.45, { snap: 0.1 }), V(S.zHorrific, 0.28, 2.49),
  ], { n: 4, maxDur: 1.6, profile: { pitch: [4.5, 6.5], formant: [4, 5.5], raspMix: 0.6 }, post: async (y, k) => X.clicks(X.double(y, { semis: 5, formant: 4, delay: 0.007, gainDb: -10, seed: `cs${k}` }), `csk${k}`) }),
  { ...vo, lufs: -19, voices: 3, pitch: [0.95, 1.06], range: [3, 45], priority: 1.5 });

  await add('crawler_skitter', async () => {
    let ro = await X.take(S.roaches, 6.0, 10.0, { trim: null, hp: 300, autoFade: false });
    let sc = await X.take(S.scratchClaw, 2.0, 7.0, { trim: null, hp: 300, autoFade: false });
    sc = lib.varispeed(sc, 1.25);
    let sw = await X.take(S.scratchWood, 1.0, 5.0, { trim: null, hp: 300, autoFade: false });
    const ck = lib.crackle(4.0, { density: 26, minAmp: 0.2, maxAmp: 1, decay: 0.003, hp: 1800, seed: 'skc' });
    let y = lib.mix([{ buf: lib.normalizePeak(ro, -3) }, { buf: lib.normalizePeak(sc, -3), gain: -3 }, { buf: lib.normalizePeak(sw, -3), gain: -6 }, { buf: lib.normalizePeak(ck, -3), gain: -12 }], { length: 4.0, channels: 1 });
    y = lib.eq(y, [{ type: 'hp', f: 250, order: 2 }, { type: 'peak', f: 2500, gain: 2, q: 0.8 }]);
    return [X.loop(y, 0.6)];
  }, { ...sfx, target: 'voice', lufs: -25, loop: true, voices: 2, pitch: [0.94, 1.06], range: [2, 18], phone: -2, note: 'loop: claws skittering on concrete' });

  // ---------------------------------------------------------------- screamer: the stunning wail + chant loop
  await add('screamer_scream', async () => {
    const cores = [[S.shrieksWoman, 4.33, 7.77], [S.screamAnalog, 1.70, 5.05], [S.bansheeScream2, 0.38, 3.9]];
    const out = [];
    for (let k = 0; k < 3; k++) {
      let core = lib.normalizePeak(await X.take(cores[k][0], cores[k][1], cores[k][2]), -3);
      core = await X.zombify(core, 'screamer', `ss${k}`, { profile: { pitch: [0, 0.8], formant: [1, 2], raspMix: 0.3, rasp: 10 } });
      const hi = lib.eq(X.shift(core, 7, 5), [{ type: 'hp', f: 1500, order: 2 }]);
      let wail = lib.normalizePeak(await X.take(S.bansheeScream, 3 + k * 5, 3 + k * 5 + core.duration, { trim: null, snap: 0 }), -3);
      wail = lib.eq(X.shift(wail, -5, -3), [{ type: 'lp', f: 3200, order: 2 }]);
      let y = lib.mix([{ buf: core }, { buf: hi, gainLin: (X.rms(core) / Math.max(1e-9, X.rms(hi))) * lib.db2lin(-9) }, { buf: lib.fitLength(lib.fade(wail, 0.25, 0.6), core.duration), gainLin: (X.rms(core) / Math.max(1e-9, X.rms(wail))) * lib.db2lin(-10) }]);
      const tri = lib.eq(X.shift(core, 6, 6), [{ type: 'hp', f: 900, order: 2 }]);
      y = lib.mix([{ buf: y }, { buf: tri, at: 0.02, gainLin: (X.rms(core) / Math.max(1e-9, X.rms(tri))) * lib.db2lin(-11) }], { length: y.duration });
      y = X.ring(y, { freq: 63 + k * 11, mix: 0.18 });
      y = X.flutter(y, { rate: 17, depth: 0.3, jitter: 0.25, shape: 1, seed: `ssf${k}` });
      y = lib.exciter(y, { freq: 3000, drive: 10, amount: -12 });
      y = lib.reverb(y, 'alley', { wet: 0.22, seed: `ssr${k}`, channels: 1, length: 1.6 });
      out.push(lib.fadeOut(lib.trimSilence(y, { threshDb: -55, post: 0.1 }), 0.6, 'exp'));
    }
    return out;
  }, { ...vo, lufs: -18, voices: 2, pitch: [0.98, 1.02], range: [8, 100], priority: 2, note: 'screamer banshee wail (stuns)' });

  await add('screamer_chant', async () => {
    let w1 = await X.take(S.whispersGhostly, 2.0, 9.0, { trim: null, hp: 150, autoFade: false });
    w1 = lib.reverse(X.shift(lib.normalizePeak(w1, -3), -2, -1));
    let w2 = await X.take(S.whispers4, 1.86, 8.17, { trim: null, hp: 150, autoFade: false });
    w2 = lib.reverse(lib.normalizePeak(w2, -3));
    let dr = await X.take(S.bansheeScream, 6.0, 10.0, { trim: null, autoFade: false });
    dr = X.shift(lib.normalizePeak(dr, -3), -7, -4, 1.75);
    dr = X.flutter(lib.eq(dr, [{ type: 'lp', f: 2400, order: 2 }, { type: 'hp', f: 150, order: 2 }]), { rate: 4.5, depth: 0.4, jitter: 0.3, shape: 1, seed: 'chf' });
    let y = lib.mix([{ buf: w1 }, { buf: w2, at: 0.4, gain: -3 }, { buf: dr, gain: -8 }], { length: 7.0, channels: 1 });
    y = lib.reverb(y, 'warehouse', { wet: 0.3, seed: 'chr', channels: 1, length: 2.0 });
    y = lib.slice(y, 0.2, 7.2);
    return [X.loop(lib.eq(y, [{ type: 'hp', f: 140, order: 2 }]), 1.2)];
  }, { ...vo, target: 'voice', lufs: -24, loop: true, voices: 1, pitch: [0.98, 1.02], range: [3, 30], note: 'loop: reversed whispers over a low wail (screamer nearby)' });

  // ---------------------------------------------------------------- riot zombie armour
  await add('riot_armor_clank', async () => {
    const out = [];
    const helm = [[1.59, 2.02], [10.49, 10.99], [24.05, 24.48]];
    const chainT = lib.takes(await X.take(S.chainmailBag, 0, 23.2, { trim: null, hp: 200 }), { threshDb: -30, minSilence: 0.08 }).sort((a, b) => lib.peak(b) - lib.peak(a)).slice(0, 6);
    const gearT = lib.takes(await X.take(S.gearFriction, 0, 33.6, { trim: null, hp: 150 }), { threshDb: -30, minSilence: 0.08 }).sort((a, b) => lib.peak(b) - lib.peak(a)).slice(0, 6);
    for (let k = 0; k < 3; k++) {
      const h = lib.normalizePeak(await X.take(S.helmetArmor, helm[k][0], helm[k][1]), -1);
      const plate = lib.eq(lib.normalizePeak(await X.take(S.kenney(`impactPlate_light_00${k + 1}`), 0, 1), -3), [{ type: 'lp', f: 3500, order: 2 }]);
      const ch = lib.normalizePeak(lib.slice(chainT[k * 2 % chainT.length], 0, 0.5), -3);
      const gr = lib.normalizePeak(lib.slice(gearT[k % gearT.length], 0, 0.6), -3);
      let y = lib.mix([{ buf: h }, { buf: plate, at: 0.004, gain: -7 }, { buf: ch, at: 0.012, gain: -8 }, { buf: gr, at: 0.0, gain: -12 }], { channels: 1 });
      out.push(lib.fadeOut(lib.slice(y, 0, Math.min(y.duration, 0.6)), 0.15, 'exp'));
    }
    return out;
  }, { ...sfx, target: 'foley', lufs: -21, voices: 3, pitch: [0.94, 1.06], range: [2, 26], phone: -2.5, note: 'riot zombie armour plates / helmet rattling' });

  // ---------------------------------------------------------------- infected hounds
  await add('hound_growl', () => X.voiceSet('hound', 'hound_growl', [
    V(S.dogGrowlMono, 8.79, 10.73), V(S.dogSnarlSelf, 1.88, 3.32), V(S.dogGrowl2, 0.42, 1.47), V(S.dogSnarlStrong, 11.06, 12.98),
  ], { n: 3, maxDur: 2.0 }), { ...vo, target: 'voice', voices: 3, pitch: [0.94, 1.06], range: [2, 30] });
  await add('hound_bark', () => X.voiceSet('hound', 'hound_bark', [
    V(S.dogBarkAggr, 0.13, 1.02), V(S.dogBarkSJ, 0.52, 0.99), V(S.dogBarkCraig, 23.42, 23.91), V(S.dogBarkAggr, 1.08, 1.48),
  ], { n: 3, maxDur: 1.0, profile: { wet: ['gurgle', -20] } }), { ...vo, target: 'voice', voices: 3, pitch: [0.94, 1.06], range: [3, 50] });
  await add('hound_attack', () => X.voiceSet('hound', 'hound_attack', [
    V(S.angryDog, 2.0, 3.4, { snap: 0.25 }), V(S.dogSnarlStrong, 2.70, 4.2), V(S.angryDog, 9.0, 10.4, { snap: 0.25 }),
  ], { n: 3, maxDur: 1.4, profile: { raspMix: 0.5 } }), { ...vo, target: 'voice', voices: 3, pitch: [0.95, 1.05], range: [2, 36] });
}

// ================================================================================================== player + footsteps
async function playerAndSteps(lib, ctx, X, add) {
  // ---------------------------------------------------------------- section helpers
  /**
   * Single footsteps from a walking / running take: onsets (fast/slow envelope ratio), each cut to `len` (or up to
   * the next step), then only the steps within -6/+4 dB of the median peak are kept (drops scuffs and bumps).
   */
  const stepCache = {};
  X.steps = async (id, a, b, { len = 0.32, hp = 70, minGap = 0.22, pre = 0.015 } = {}) => {
    const key = `${id}:${a}:${b}:${len}:${hp}:${minGap}`;
    if (stepCache[key]) return stepCache[key];
    const x = await X.take(id, a, b, { hp, trim: null, autoFade: false });
    const on = lib.detectOnsets(x, { threshold: 9, floorDb: -30, minGap });
    const out = [];
    for (let i = 0; i < on.length; i++) {
      const t0 = Math.max(0, on[i] - pre);
      const t1 = Math.min(x.duration, i + 1 < on.length ? Math.min(on[i] + len, on[i + 1] - 0.01) : on[i] + len);
      if (t1 - t0 < len * 0.6) continue;
      // one step = one strike: flag takes with a second hit (next step, heel-toe slap, bump) >= -4.4 dB after 70 ms
      const st0 = lib.slice(x, t0, t1);
      const env = lib.envelope(st0, { attack: 0.0005, release: 0.02 });
      const i70 = Math.round((on[i] - t0 + 0.07) * x.sampleRate);
      let p1 = 0, p2 = 0;
      for (let j = 0; j < env.length; j++) { if (j < i70) p1 = Math.max(p1, env[j]); else p2 = Math.max(p2, env[j]); }
      st0.double = p2 > p1 * 0.6;
      let st = lib.fadeIn(st0, 0.004);
      st.double = st0.double;
      st = lib.fadeOut(st, Math.min(0.06, st.duration * 0.3), 'exp');
      st.peakDb = lib.lin2db(lib.peak(st));
      out.push(st);
    }
    const pk = out.map((q) => q.peakDb).sort((p, q) => p - q), med = pk[pk.length >> 1];
    const lvl = out.filter((q) => q.peakDb > med - 6 && q.peakDb < med + 4);
    const single = lvl.filter((q) => !q.double);
    const res = single.length >= 3 ? single : lvl; // ringing surfaces (metal) keep their tails
    if (!res.length) throw new Error(`no steps found in ${id} ${a}-${b}`);
    return (stepCache[key] = res);
  };

  /** Pick n items spread evenly over a pool (sources interleaved so variants alternate recordings). */
  X.spread = (pool, n, seed) => {
    const by = new Map();
    for (const p of pool) { const k = p.src || ''; if (!by.has(k)) by.set(k, []); by.get(k).push(p); }
    const lists = [...by.values()], inter = [];
    for (let i = 0; inter.length < pool.length; i++) for (const l of lists) if (i < l.length) inter.push(l[i]);
    const off = ctx.rng(seed).next();
    return Array.from({ length: n }, (_, k) => inter[Math.floor(((k + off) * inter.length) / n) % inter.length]);
  };

  /** Short kit / gear rattles (tactical gear friction, chainmail chunks), loudest takes first. */
  const kitTakes = {};
  const kitOf = async (id, dur) => {
    if (!kitTakes[id]) {
      const all = await X.take(id, 0, dur, { trim: null, hp: 150, autoFade: false });
      kitTakes[id] = lib.takes(all, { threshDb: -30, minSilence: 0.08 }).filter((t) => t.duration > 0.08).sort((p, q) => lib.peak(q) - lib.peak(p)).slice(0, 16);
    }
    return kitTakes[id];
  };
  X.gearTake = async (k) => { const t = await kitOf(S.gearFriction, 33.6); const b = t[k % t.length]; return lib.fadeOut(lib.slice(b, 0, Math.min(b.duration, 0.5)), 0.1, 'exp'); };
  X.chainTake = async (k) => { const t = await kitOf(S.chainmailBag, 23.2); const b = t[k % t.length]; return lib.fadeOut(lib.slice(b, 0, Math.min(b.duration, 0.5)), 0.1, 'exp'); };

  const sfx = { bus: 'sfx', spatial: true };
  const vo = { bus: 'voice', spatial: true, phone: -2 };

  // ---------------------------------------------------------------- footsteps (soldier boots; teammates are spatial)
  // Each variant = one real boot step (onset-detected in long walking takes, level-matched, heel strike first) plus a
  // short surface layer for definition and a whisper of kit (cloth / gear) so steps read as "armed soldier".
  const fo = { ...sfx, target: 'footstep', voices: 6, pitch: [0.95, 1.05], range: [1, 22], phone: -2.5 };
  const kit = async (seed) => {
    const r = ctx.rng(seed);
    const cl = [[S.clothRustle, 0, 1.7], [S.clothes1, 0, 1.0], [S.fabric, 0, 0.5], [S.clothSleeve, 0, 2.7]][r.int(0, 3)];
    let c = await X.take(cl[0], cl[1], cl[2], { hp: 400 });
    c = lib.slice(c, r.next() * Math.max(0, c.duration - 0.3), Math.min(c.duration, 0.3 + r.next() * Math.max(0, c.duration - 0.3)));
    return lib.fadeOut(lib.fadeIn(lib.normalizePeak(c, -3), 0.02), 0.12, 'exp');
  };
  const steps = (surface, takes, layer, o = {}) => async () => {
    const pool = [];
    for (const t of takes) pool.push(...(await X.steps(t[0], t[1], t[2], { len: o.len ?? 0.32, hp: o.hp ?? 70 })).map((b) => ({ b, src: t[0] })));
    const pick = X.spread(pool, 6, `steps:${surface}`);
    const out = [];
    for (let k = 0; k < 6; k++) {
      const r = ctx.rng(`${surface}:${k}`);
      let y = lib.normalizePeak(pick[k].b, -3);
      const parts = [{ buf: y }];
      if (layer) {
        const l = await layer(k, r);
        if (l) parts.push({ buf: l, at: 0.011, gain: o.layerDb ?? -9 }); // layer transient (4 ms pre-roll) on the step's (15 ms)
      }
      parts.push({ buf: await kit(`${surface}:kit:${k}`), at: 0.01 + r.next() * 0.03, gain: o.kitDb ?? -20 });
      y = lib.mix(parts, { channels: 1 });
      y = lib.eq(y, [{ type: 'hp', f: o.hp ?? 70, order: 2 }, ...(o.eq || [])]);
      y = lib.softClip(lib.normalizePeak(y, 0), { threshold: -12, ceiling: -0.5 });
      out.push(lib.fadeOut(lib.slice(y, 0, Math.min(y.duration, o.len ?? 0.32)), 0.08, 'exp'));
    }
    return out;
  };
  const kenney = (name) => async (k) => lib.normalizePeak(await X.take(S.kenney(`${name}_00${k % 5}`), 0, 1, { hp: 80 }), -3);

  await add('footstep_concrete', steps('concrete', [[S.stepsConcreteSD, 2, 40], [S.stepsRoadBoots, 2, 30], [S.stepsSidewalk, 1, 27]], kenney('footstep_concrete'), { eq: [{ type: 'peak', f: 180, gain: 1.5, q: 1 }] }), fo);
  await add('footstep_metal', steps('metal', [[S.stepsMetalFloor, 1, 19], [S.stepsWalkMetal, 0.5, 12.5], [S.stepsMetalFoley, 2, 30]], async (k) => lib.normalizePeak(await X.take(S.ogaMetalStep(k * 3 + 2), 0, 0.3, { hp: 150 }), -3), { layerDb: -8, len: 0.36 }), fo);
  await add('footstep_wood', steps('wood', [[S.stepsWoodFloor, 0.5, 17.5], [S.stepsFactoryHall, 2, 40]], kenney('footstep_wood'), { layerDb: -10, eq: [{ type: 'peak', f: 220, gain: 2, q: 1 }] }), fo);
  await add('footstep_dirt', steps('dirt', [[S.stepsDirtShoe, 0, 6.2], [S.stepsDirtGravel, 1, 34], [S.stepsGrittyBoots, 0, 11]], null, { len: 0.36 }), fo);
  await add('footstep_grate', steps('grate', [[S.stepsGrateRun, 0, 8.6], [S.stepsMetalIENBA, 0, 10.2], [S.stepsMetalIENBA2, 0, 5.3]], async (k) => {
    // the grate's own rattle: a bright, short metallic ring
    const b = lib.normalizePeak(await X.take(S.ogaMetalStep(k * 4 + 1), 0, 0.3, { hp: 600 }), -3);
    return lib.varispeedSemis(b, 4 + (k % 3), { quality: 'fast' });
  }, { layerDb: -10, len: 0.38, eq: [{ type: 'peak', f: 3200, gain: 2, q: 1 }] }), fo);
  await add('footstep_water', steps('water', [[S.stepsPuddle, 0, 7], [S.stepsPuddle2, 0, 11], [S.stepsWaterBoots, 0, 10]], null, { len: 0.42, hp: 90 }), { ...fo, note: 'shallow water / puddles' });

  // ---------------------------------------------------------------- zombie footsteps
  await add('zombie_footstep', async () => {
    const thumps = await X.steps(S.stepsConcreteSD, 2, 40, { len: 0.3, hp: 60 });
    const drags = [[S.footDrag, 0, 9.5], [S.feetShuffle, 0, 6], [S.shoeScuffle, 0, 9.3], [S.footDragDirt2, 0, 12.8], [S.footDragDirt4, 0, 15.8]];
    const out = [];
    for (let k = 0; k < 6; k++) {
      const r = ctx.rng(`zf${k}`);
      const d = drags[k % drags.length];
      const dr = await X.steps(d[0], d[1], d[2], { len: 0.5, hp: 120, minGap: 0.3 });
      let drag = lib.normalizePeak(dr[(k * 3 + 1) % dr.length], -3);
      drag = lib.fadeOut(lib.fadeIn(drag, 0.03), 0.25, 'exp');
      let th = lib.varispeedSemis(lib.normalizePeak(thumps[(k * 5 + 2) % thumps.length], -3), -3 - r.next() * 2, { quality: 'fast' });
      th = lib.eq(th, [{ type: 'lp', f: 2500, order: 2 }]);
      let y = lib.mix([{ buf: th }, { buf: drag, at: 0.04 + r.next() * 0.05, gain: -4 }], { channels: 1 });
      y = lib.eq(y, [{ type: 'hp', f: 70, order: 2 }, { type: 'peak', f: 160, gain: 2, q: 1 }]);
      out.push(lib.fadeOut(lib.slice(y, 0, Math.min(y.duration, 0.6)), 0.15, 'exp'));
    }
    return out;
  }, { ...fo, lufs: -27, voices: 8, range: [1, 18], phone: -3, note: 'walker: heavy limp step + dragged foot' });

  await add('zombie_run_step', async () => {
    const pool = [...(await X.steps(S.runBoots, 0, 14, { len: 0.22, hp: 70 })), ...(await X.steps(S.runConcrete, 0, 12.5, { len: 0.22, hp: 70 }))];
    const pick = X.spread(pool.map((b) => ({ b })), 6, 'zrs');
    const out = [];
    for (let k = 0; k < 6; k++) {
      const r = ctx.rng(`zrs${k}`);
      let st = lib.varispeedSemis(lib.normalizePeak(pick[k].b, -3), -1.5 - r.next() * 1.5, { quality: 'fast' });
      // bare, wet slap of a rotten foot on top of the shoe
      const slap = lib.normalizePeak(await X.take(S.kenney(`impactSoft_medium_00${k % 5}`), 0, 1, { hp: 150 }), -3);
      let y = lib.mix([{ buf: st }, { buf: slap, at: 0.013, gain: -8 }], { channels: 1 });
      y = lib.eq(y, [{ type: 'hp', f: 70, order: 2 }, { type: 'peak', f: 200, gain: 2, q: 1 }]);
      out.push(lib.fadeOut(lib.slice(y, 0, Math.min(y.duration, 0.26)), 0.07, 'exp'));
    }
    return out;
  }, { ...fo, lufs: -26, voices: 8, range: [1, 24], note: 'runner sprint steps' });

  // ---------------------------------------------------------------- jump / land
  await add('jump', async () => {
    const pool = await X.steps(S.stepsConcreteSD, 2, 40, { len: 0.2, hp: 90 });
    const out = [];
    for (let k = 0; k < 2; k++) {
      const scuff = lib.normalizePeak(pool[(k * 7 + 3) % pool.length], -3);
      const cl = lib.normalizePeak(await X.take(k ? S.fabric : S.clothRustle, 0, k ? 0.5 : 0.6, { hp: 300 }), -3);
      const gr = lib.normalizePeak(await X.gearTake(k), -3);
      let y = lib.mix([{ buf: scuff }, { buf: cl, at: 0.02, gain: -7 }, { buf: gr, at: 0.05, gain: -12 }], { channels: 1 });
      out.push(lib.fadeOut(lib.slice(y, 0, Math.min(y.duration, 0.45)), 0.12, 'exp'));
    }
    return out;
  }, { ...fo, lufs: -25, voices: 2, note: 'push-off scuff + kit' });

  await add('land', async () => {
    const pool = await X.steps(S.stepsConcreteSD, 2, 40, { len: 0.3, hp: 60 });
    const out = [];
    for (let k = 0; k < 3; k++) {
      const r = ctx.rng(`land${k}`);
      const a = lib.normalizePeak(pool[(k * 4 + 1) % pool.length], -3), b = lib.normalizePeak(pool[(k * 4 + 6) % pool.length], -3);
      const imp = lib.normalizePeak(await X.take([S.humanImpact, S.landJump, S.jumpLand][k], 0, 0.6, { hp: 70 }), -3);
      const gr = lib.normalizePeak(await X.gearTake(k + 3), -3);
      let y = lib.mix([{ buf: a }, { buf: b, at: 0.018 + r.next() * 0.02, gain: -2 }, { buf: imp, at: 0.012, gain: -7 }, { buf: gr, at: 0.03, gain: -11 }], { channels: 1 });
      y = lib.eq(y, [{ type: 'hp', f: 60, order: 2 }, { type: 'peak', f: 150, gain: 2.5, q: 1 }]);
      out.push(lib.fadeOut(lib.slice(y, 0, Math.min(y.duration, 0.5)), 0.15, 'exp'));
    }
    return out;
  }, { ...fo, lufs: -23, voices: 2, phone: -3, note: 'boots land after a jump' });

  await add('land_heavy', async () => {
    const pool = await X.steps(S.stepsConcreteSD, 2, 40, { len: 0.3, hp: 50 });
    const out = [];
    for (let k = 0; k < 2; k++) {
      const a = lib.normalizePeak(pool[(k * 5 + 2) % pool.length], -3);
      const th = lib.thump({ f0: 105, f1: 42, sweep: 0.03, decay: 0.22, click: 0.2, drive: 2, seed: `lh${k}` });
      const jl = lib.normalizePeak(await X.take(S.jumpLanding, 0, 0.46, { hp: 60 }), -3);
      const fall = lib.normalizePeak(await X.take(S.bodyFallGround, 0, 0.8, { hp: 60 }), -3);
      const gr = lib.normalizePeak(await X.gearTake(k + 6), -3);
      const ch = lib.normalizePeak(await X.chainTake(k), -3);
      let gru = lib.normalizePeak(await X.take(k ? S.jumpGrunt3 : S.jumpGrunt1, 0, 0.4, { hp: 120 }), -3);
      let y = lib.mix([{ buf: a }, { buf: th, at: 0.015, gain: -4 }, { buf: jl, at: 0.012, gain: -5 }, { buf: fall, at: 0.013, gain: -8 }, { buf: gr, at: 0.02, gain: -9 }, { buf: ch, at: 0.03, gain: -13 }, { buf: gru, at: 0.06, gain: -9 }], { channels: 1 });
      y = lib.psychoBass(y, { freq: 110, amount: -4 });
      y = lib.softClip(lib.normalizePeak(y, 0), { threshold: -9, ceiling: -0.5 });
      out.push(lib.fadeOut(lib.slice(y, 0, Math.min(y.duration, 0.6)), 0.22, 'exp'));
    }
    return out;
  }, { ...fo, lufs: -21, voices: 2, phone: -4, note: 'hard landing from height: impact + kit clatter + grunt' });

  // ---------------------------------------------------------------- the player's own voice (male soldier)
  const human = (b, o = {}) => {
    let y = lib.eq(b, [{ type: 'hp', f: o.hp ?? 95, order: 4 }, { type: 'peak', f: 300, gain: -1.5, q: 1 }, { type: 'peak', f: 2800, gain: 2, q: 0.9 }, { type: 'lp', f: 12000, order: 2 }]);
    y = lib.saturate(y, { drive: 4, type: 'tube', mix: 0.25, os: 1 });
    return X.comp(y, { threshold: -24, ratio: 2.2 });
  };
  await add('player_pain', async () => {
    const takes = [[S.grunts3, 9.75, 10.13], [S.gruntPain, 0.08, 0.48], [S.painGrunt09, 0, 0.32], [S.grunts3, 11.14, 11.42], [S.bigGrunts, 6.02, 6.43]];
    const out = [];
    for (const [k, t] of takes.entries()) out.push(lib.fadeOut(human(lib.normalizePeak(await X.take(t[0], t[1], t[2]), -3)), 0.06, 'exp'));
    return out;
  }, { ...vo, target: 'voice', voices: 2, pitch: [0.97, 1.03], range: [2, 30], note: 'player hurt grunt' });

  await add('player_death', async () => {
    const takes = [[S.maleDeath04, 0.06, 0.92], [S.maleDeathB, 0.09, 0.85]];
    const out = [];
    for (const [k, t] of takes.entries()) {
      const v = human(lib.normalizePeak(await X.take(t[0], t[1], t[2]), -3));
      let ex = lib.normalizePeak(await X.take(S.breathScared, k ? 14.44 : 2.79, k ? 14.93 : 3.23, { hp: 150 }), -3);
      ex = lib.fadeOut(X.shift(ex, -2, -1, 1.3), 0.3, 'exp');
      out.push(lib.mix([{ buf: v }, { buf: ex, at: v.duration * 0.85, gain: -10 }], { channels: 1 }));
    }
    return out;
  }, { ...vo, target: 'voice', lufs: -19, voices: 1, pitch: [0.98, 1.02], range: [2, 36] });

  await add('player_downed', async () => {
    const groans = [[S.gruntsMid, 4.08, 5.18], [S.gruntsMid, 0.49, 1.50]];
    const out = [];
    for (let k = 0; k < 2; k++) {
      const v = human(lib.normalizePeak(await X.take(groans[k][0], groans[k][1], groans[k][2]), -3));
      const fall = lib.normalizePeak(await X.take(k ? S.bodyFall : S.bodyFallGround, 0, k ? 1.1 : 0.8, { hp: 60 }), -3);
      const gr = lib.normalizePeak(await X.gearTake(k + 9), -3);
      const ch = lib.normalizePeak(await X.chainTake(k + 2), -3);
      let y = lib.mix([{ buf: fall }, { buf: gr, at: 0.01, gain: -6 }, { buf: ch, at: 0.04, gain: -12 }, { buf: v, at: 0.12, gain: 0 }], { channels: 1 });
      out.push(lib.fadeOut(y, 0.3, 'exp'));
    }
    return out;
  }, { ...vo, target: 'voice', lufs: -19, voices: 2, pitch: [0.98, 1.02], range: [2, 40], note: 'drop to the ground + pained groan' });

  await add('revive', async () => {
    const out = [];
    for (let k = 0; k < 2; k++) {
      let g = lib.normalizePeak(await X.take(k ? S.breathScared : S.gasp, k ? 2.79 : 0.3, k ? 3.23 : 0.75, { hp: 140 }), -3);
      let ex = lib.normalizePeak(await X.take(S.breathMed, k ? 3.2 : 0.4, k ? 4.6 : 1.9, { hp: 140, snap: 0.2 }), -3);
      ex = lib.fadeOut(ex, 0.4, 'exp');
      const cl = lib.normalizePeak(await X.take(S.clothHeavy, 0, 1.7, { hp: 200 }), -3);
      const gr = lib.normalizePeak(await X.gearTake(k + 12), -3);
      let y = lib.mix([{ buf: cl, gain: -8 }, { buf: gr, at: 0.05, gain: -14 }, { buf: g, at: 0.15 }, { buf: ex, at: 0.15 + g.duration + 0.05, gain: -5 }], { channels: 1 });
      out.push(lib.fadeOut(lib.eq(y, [{ type: 'hp', f: 100, order: 2 }]), 0.3, 'exp'));
    }
    return out;
  }, { ...vo, target: 'voice', lufs: -21, voices: 2, pitch: [0.98, 1.02], range: [2, 30], note: 'back on your feet: gasp, exhale, kit' });

  // ---------------------------------------------------------------- low-health loops (2D)
  await add('heartbeat', async () => {
    const lub0 = lib.normalizePeak(await X.take(S.heartSlow, 0.0, 0.45, { hp: 25, trim: -50 }), -3);
    const dub0 = lib.normalizePeak(await X.take(S.heartSlow, 0.48, 0.74, { hp: 25, trim: -50 }), -3);
    const beat = (b, seed) => {
      // phones can't play the 55-70 Hz fundamental: imply it with harmonics + a pitched knock
      let y = lib.psychoBass(b, { freq: 100, drive: 16, amount: 2 });
      const th = lib.thump({ f0: 110, f1: 60, sweep: 0.02, decay: 0.12, click: 0, drive: 3, seed });
      y = lib.mix([{ buf: y }, { buf: th, gain: -5 }], { channels: 1 });
      return lib.eq(y, [{ type: 'hp', f: 30, order: 2 }, { type: 'peak', f: 140, gain: 4, q: 0.9 }, { type: 'lp', f: 1200, order: 2 }]);
    };
    const period = 60 / 82, beats = 4, parts = [];
    for (let i = 0; i < beats; i++) {
      const g = [0, -1, -0.4, -1.3][i];
      parts.push({ buf: beat(lub0, `hb${i}`), at: i * period, gain: g });
      parts.push({ buf: beat(dub0, `hd${i}`), at: i * period + 0.29, gain: g - 4 });
    }
    // render one extra beat so the loop crossfade has material
    parts.push({ buf: beat(lub0, 'hb4'), at: beats * period }, { buf: beat(dub0, 'hd4'), at: beats * period + 0.29, gain: -4 });
    const y = lib.mix(parts, { length: beats * period + 0.25, channels: 1 });
    return [X.loop(y, 0.25)];
  }, { bus: 'sfx', spatial: false, channels: 1, target: 'foley', lufs: -23, loop: true, voices: 1, pitch: [1, 1], range: [1, 1], phone: -6, note: 'loop: low-health heartbeat, 82 bpm' });

  await add('breath_tired', async () => {
    let b = await X.take(S.breathLoop, 0, 5.2, { trim: null, hp: 120, autoFade: false });
    b = lib.eq(b, [{ type: 'lp', f: 11000, order: 2 }, { type: 'peak', f: 2500, gain: 1.5, q: 0.8 }]);
    return [X.loop(b, 0.35)];
  }, { bus: 'voice', spatial: false, channels: 1, target: 'voice', lufs: -26, loop: true, voices: 1, pitch: [1, 1], range: [1, 1], note: 'loop: exhausted panting (sprint / low stamina)' });
}

// ================================================================================================== DSP toolkit
// Producer-local DSP (the shared lib stays untouched): STFT, cepstral formant warping, pitch shifting, rasp, flutter,
// envelope-following wet layers, voice-set builder, contact sheets.
function dsp(lib, ctx) {
  const { Buf } = lib;
  const SR = 48000;
  const X = {};
  const rmsOf = (d) => { let s = 0; for (let i = 0; i < d.length; i++) s += d[i] * d[i]; return Math.sqrt(s / Math.max(1, d.length)); };
  X.rms = (b) => rmsOf(lib.toMono(b).data[0]);

  /** Mono from a source: decorrelated pairs keep their louder channel (averaging would comb-filter). */
  X.mono = (b) => {
    if (b.channels === 1) return b;
    if (lib.stereoCorrelation(b) > 0.5) return lib.toMono(b);
    return new Buf([rmsOf(b.data[0]) >= rmsOf(b.data[1]) ? b.data[0] : b.data[1]], b.sampleRate);
  };

  /**
   * Load a slice as clean mono: DC removed, rumble high-passed, silence trimmed, click-free edges.
   * snap (s): move both cut points to the quietest 20 ms inside ±snap (cuts in a continuous performance land
   * between syllables / breaths instead of mid-vowel). Edges that are still loud get a natural fade (in 70 ms,
   * out 260 ms) so a slice never starts or stops like a tape edit.
   */
  X.take = async (id, a, b, { hp = 55, trim = -42, pre = 0.004, post = 0.04, fade = 0.012, snap = 0, autoFade = true } = {}) => {
    const e = ctx.sources.get(id);
    const a0 = Math.max(0, a - snap), b0 = Math.min(e.duration, b + snap);
    let x = await ctx.load(id, { start: a0, end: b0 });
    x = X.mono(x);
    x = lib.removeDC(x);
    if (hp) x = lib.eq(x, [{ type: 'hp', f: hp, order: 2 }]);
    if (snap > 0) {
      const sr = x.sampleRate, d = x.data[0], w = Math.round(0.02 * sr), hopS = Math.round(0.005 * sr);
      const quiet = (t0, t1) => {
        let best = t0, bestE = Infinity;
        for (let i = Math.max(0, Math.round(t0 * sr)); i + w <= Math.min(d.length, Math.round(t1 * sr)); i += hopS) {
          let s = 0; for (let j = 0; j < w; j++) s += d[i + j] * d[i + j];
          if (s < bestE) { bestE = s; best = (i + w / 2) / sr; }
        }
        return best;
      };
      const sa = quiet(0, Math.min(x.duration, (a - a0) + snap)), sb = quiet(Math.max(0, (b - a0) - snap), x.duration);
      if (sb - sa > 0.2) x = lib.slice(x, sa, sb);
    }
    if (trim !== null) x = lib.trimSilence(x, { threshDb: trim, pre, post, fadeInSec: 0.002, fadeOutSec: fade });
    if (autoFade) x = X.edgeFade(x);
    return x;
  };

  /** Fade edges that are still loud relative to the slice peak (in: 70 ms sine, out: 260 ms exp). */
  X.edgeFade = (x, { inSec = 0.07, outSec = 0.26 } = {}) => {
    const sr = x.sampleRate, d = lib.toMono(x).data[0], pk = lib.peak(x) || 1;
    const win = (i0, i1) => { let s = 0, n = 0; for (let i = Math.max(0, i0); i < Math.min(d.length, i1); i++) { s += d[i] * d[i]; n++; } return Math.sqrt(s / Math.max(1, n)) / pk; };
    // trimSilence keeps a few ms of pre-roll / 40 ms of tail, so a natural onset / ending is quiet in these windows
    const head = win(0, Math.round(0.004 * sr)), tail = win(d.length - Math.round(0.02 * sr), d.length);
    if (lib.lin2db(head) > -26) x = lib.fadeIn(x, Math.min(inSec, x.duration * 0.2), 'sine');
    if (lib.lin2db(tail) > -30) x = lib.fadeOut(x, Math.min(outSec, x.duration * 0.35), 'exp');
    return x;
  };

  /** Guard against NaN / denormals and DC before handing a variant to the writer. */
  X.sanitize = (b) => {
    for (const d of b.data) for (let i = 0; i < d.length; i++) if (!Number.isFinite(d[i])) d[i] = 0;
    return lib.removeDC(b);
  };

  // ------------------------------------------------------------------------------------------ STFT
  /** Overlap-add STFT processing: fn(re, im, frame) edits the spectrum in place (keep conjugate symmetry). */
  X.stft = (b, fn, { N = 2048, hop = N / 4 } = {}) => new Buf(b.data.map((x) => {
    const L = x.length, xp = new Float32Array(L + 2 * N);
    xp.set(x, N);
    const y = new Float64Array(xp.length), wn = new Float64Array(xp.length);
    const w = lib.hann(N), re = new Float64Array(N), im = new Float64Array(N);
    for (let s = 0, f = 0; s + N <= xp.length; s += hop, f++) {
      for (let i = 0; i < N; i++) { re[i] = xp[s + i] * w[i]; im[i] = 0; }
      lib.fft(re, im);
      fn(re, im, f);
      lib.fft(re, im, true);
      for (let i = 0; i < N; i++) { y[s + i] += (re[i] / N) * w[i]; wn[s + i] += w[i] * w[i]; }
    }
    const o = new Float32Array(L);
    for (let i = 0; i < L; i++) { const k = wn[i + N]; o[i] = k > 1e-6 ? y[i + N] / k : 0; }
    return o;
  }), b.sampleRate);

  /** Smooth log-magnitude spectral envelope by cepstral liftering (natural log, bins 0..N/2). */
  const cep = { N: 0 };
  function logEnvelope(re, im, N, lifter, out) {
    if (cep.N !== N) { cep.N = N; cep.r = new Float64Array(N); cep.i = new Float64Array(N); }
    const cr = cep.r, ci = cep.i;
    for (let k = 0; k < N; k++) { cr[k] = 0.5 * Math.log(re[k] * re[k] + im[k] * im[k] + 1e-14); ci[k] = 0; }
    lib.fft(cr, ci, true);
    for (let n = 0; n < N; n++) { cr[n] /= N; ci[n] = 0; }
    // tapered lifter (half-Hann over the top quarter) avoids ringing in the envelope
    for (let n = 1; n < N / 2; n++) {
      const w = n <= lifter * 0.75 ? 1 : n >= lifter ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * (n - lifter * 0.75) / (lifter * 0.25));
      cr[n] *= w; cr[N - n] *= w;
    }
    cr[N / 2] = 0;
    lib.fft(cr, ci);
    for (let k = 0; k <= N / 2; k++) out[k] = cr[k];
  }

  /**
   * Formant shift by spectral-envelope warping: ratio > 1 = smaller throat (formants up), < 1 = bigger.
   * Pitch and timing are untouched (only a smooth, time-varying EQ is applied), so it stays artefact-light.
   */
  X.formant = (b, ratio, { lifter = 44, N = 2048, maxDb = 22 } = {}) => {
    if (Math.abs(ratio - 1) < 0.004) return b;
    const E = new Float64Array(N / 2 + 1), lim = (maxDb / 20) * Math.LN10, half = N / 2;
    return X.stft(b, (re, im) => {
      logEnvelope(re, im, N, lifter, E);
      for (let k = 0; k <= half; k++) {
        const src = k / ratio, k0 = Math.floor(src), fr = src - k0;
        const e2 = k0 >= half ? E[half] - 0.5 * (src - half) / half : E[k0] * (1 - fr) + E[k0 + 1] * fr;
        let d = e2 - E[k];
        d = d > lim ? lim : d < -lim ? -lim : d;
        const g = Math.exp(d);
        re[k] *= g; im[k] *= g;
        if (k > 0 && k < half) { re[N - k] *= g; im[N - k] *= g; }
      }
    }, { N });
  };

  /**
   * Pitch shift (semitones) with independent formant shift (semitones, relative to the original) and duration factor.
   * varispeed moves pitch + formants together, WSOLA restores (or sets) the duration, envelope warping re-places the
   * formants.
   */
  X.shift = (b, pitch = 0, formant = pitch, stretch = 1) => {
    const r = Math.pow(2, pitch / 12);
    let y = Math.abs(pitch) > 0.01 ? lib.varispeed(b, r, { quality: 'fast' }) : b;
    const target = b.duration * stretch;
    const f = target / y.duration;
    if (Math.abs(f - 1) > 0.004) y = lib.timeStretch(y, f, { frame: 0.04, tolerance: 0.012 });
    const fr = Math.pow(2, formant / 12) / r;
    if (Math.abs(fr - 1) > 0.004) y = X.formant(y, fr);
    return y;
  };

  /** Envelope-following amplitude flutter: jittered pulse train at `rate` Hz (vocal fry / throat rattle). */
  X.flutter = (b, { rate = 40, depth = 0.25, jitter = 0.3, shape = 2, seed = 'flutter' } = {}) => {
    if (!depth) return b;
    const r = ctx.rng(seed), n = b.length, sr = b.sampleRate, m = new Float32Array(n);
    let ph = r.next(), f = rate, tgt = rate, mean = 0;
    for (let i = 0; i < n; i++) {
      if (i % 240 === 0) tgt = rate * (1 + jitter * (r.next() * 2 - 1));
      f += (tgt - f) * 0.004;
      ph += f / sr; if (ph >= 1) ph -= 1;
      const p = Math.pow(0.5 - 0.5 * Math.cos(2 * Math.PI * ph), shape);
      m[i] = p; mean += p;
    }
    mean /= Math.max(1, n);
    const k = 1 / Math.max(1e-6, 1 - depth + depth * mean);
    return new Buf(b.data.map((d) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = d[i] * (1 - depth + depth * m[i]) * k; return o; }), sr);
  };

  /** Rasp: tube-saturate the voice band and blend it back (throat distortion without fizzy top end). */
  X.rasp = (b, { drive = 10, mix = 0.4, lo = 250, hi = 4500, type = 'tube' } = {}) => {
    if (!mix) return b;
    const band = lib.eq(b, [{ type: 'hp', f: lo, order: 2 }, { type: 'lp', f: hi, order: 2 }]);
    let s = lib.saturate(lib.normalizePeak(band, 0), { drive, type, os: 1 });
    s = lib.eq(s, [{ type: 'lp', f: hi * 1.4, order: 2 }, { type: 'hp', f: lo * 0.7, order: 1 }]);
    const g = X.rms(band) / Math.max(1e-9, X.rms(s));
    return lib.mix([{ buf: b }, { buf: s, gainLin: g * mix * 1.2 }, { buf: band, gainLin: -mix * 0.6 }]);
  };

  /** Loop / crop a bed to `sec` seconds starting at a seeded offset (bed must be mono). */
  X.bed = (bed, sec, seed = 'bed') => {
    const n = Math.round(sec * SR), r = ctx.rng(seed);
    const out = new Float32Array(n), src = bed.data[0];
    let o = 0, p = Math.floor(r.next() * Math.max(1, src.length - n));
    while (o < n) {
      const take = Math.min(n - o, src.length - p);
      out.set(src.subarray(p, p + take), o);
      o += take; p = 0;
    }
    return new Buf([out], SR);
  };

  /**
   * Envelope-following layer: `bed` (gurgle, stomach, breath...) plays only while `voice` is loud. gainDb = level
   * relative to the voice (RMS). The bed is band-limited so it reads as wetness, not as a second voice.
   */
  X.follow = (voice, bed, { gainDb = -12, lo = 250, hi = 4000, attack = 0.012, release = 0.09, power = 1.4, seed = 'follow' } = {}) => {
    let w = X.bed(bed, voice.duration, seed);
    w = lib.eq(w, [{ type: 'hp', f: lo, order: 2 }, { type: 'lp', f: hi, order: 2 }]);
    const e = lib.envelope(voice, { attack, release });
    let pk = 0; for (let i = 0; i < e.length; i++) if (e[i] > pk) pk = e[i];
    const d = w.data[0];
    for (let i = 0; i < d.length; i++) d[i] *= Math.pow(e[i] / (pk || 1), power);
    const g = (X.rms(voice) / Math.max(1e-9, X.rms(w))) * lib.db2lin(gainDb);
    return lib.mix([{ buf: voice }, { buf: w, gainLin: g }]);
  };

  /** Sub-octave chest layer (pitch -12, low-passed) mixed `gainDb` under the voice. */
  X.chest = (b, gainDb = -10, lp = 320) => {
    let s = X.shift(b, -12, -12, 1);
    s = lib.eq(s, [{ type: 'lp', f: lp, order: 4 }, { type: 'hp', f: 65, order: 2 }]);
    s = lib.saturate(s, { drive: 6, type: 'tube', os: 1 });
    const g = (X.rms(b) / Math.max(1e-9, X.rms(s))) * lib.db2lin(gainDb);
    return lib.mix([{ buf: b }, { buf: lib.fitLength(s, b.duration), gainLin: g }]);
  };

  /** Phone-speaker voicing + glue compression. */
  X.voiceEq = (b, p) => {
    const specs = [{ type: 'hp', f: p.hp, order: 4 }, { type: 'lp', f: p.lp, order: 2 }, { type: 'peak', f: 420, gain: -2, q: 1.1 }];
    if (p.body?.[1]) specs.push({ type: 'peak', f: p.body[0], gain: p.body[1], q: 0.9 });
    if (p.presence?.[1]) specs.push({ type: 'peak', f: p.presence[0], gain: p.presence[1], q: 0.8 });
    const y = X.balance(lib.eq(b, specs), { maxSubDb: p.maxSubDb ?? -14 });
    return X.comp(y, { threshold: -22, ratio: 2.5 });
  };

  /**
   * Phone balance: phone speakers reproduce nothing useful under ~110 Hz, so a variant whose energy sits down there
   * would be quiet in game while measuring "on target". If the share below `freq` exceeds `maxSubDb` (RMS, relative to
   * the whole), shelve it down to that share and re-imply the weight as 120-600 Hz harmonics (psycho-acoustic bass).
   */
  X.balance = (y, { maxSubDb = -14, freq = 115 } = {}) => {
    const low = lib.eq(y, [{ type: 'lp', f: freq, order: 4 }]);
    const r = lib.lin2db(X.rms(low) / Math.max(1e-9, X.rms(y)));
    if (!(r > maxSubDb)) return y;
    const cut = Math.max(-24, (maxSubDb - r) * 1.15);
    let z = lib.eq(y, [{ type: 'lowshelf', f: freq, gain: cut, q: 0.7 }]);
    z = lib.psychoBass(z, { freq, drive: 14, amount: -3, lp: 600, keepSub: true });
    return z;
  };

  /** Liquid beds for X.follow, loaded once (mono, rumble removed). */
  const beds = {};
  X.wetBed = async (kind) => {
    if (beds[kind]) return beds[kind];
    const take = (id, a, b) => X.take(id, a, b, { hp: 120, trim: null });
    let parts;
    if (kind === 'gurgle') parts = [await take(S.gurgling, 0, 15.9), await take(S.goreGurgle, 0, 9.9), await take(S.bubbling, 0, 7.8)];
    else if (kind === 'stomach') parts = [await take(S.stomachLong, 0, 30), await take(S.stomach10, 0, 13.2)];
    else throw new Error(`wetBed ${kind}`);
    const cat = lib.concat(parts.map((p) => lib.normalizePeak(p, -3)));
    return (beds[kind] = cat);
  };

  /**
   * The creature throat: shift -> rasp -> flutter -> wet layer -> chest -> voicing. `v` = variation draws (0..1).
   */
  X.zombify = async (b, type, seed, o = {}) => {
    const p = { ...PROFILES[type], ...(o.profile || {}) };
    const r = ctx.rng(`${type}:${seed}`);
    const at = (rg) => (Array.isArray(rg) ? rg[0] + (rg[1] - rg[0]) * r.next() : rg);
    let y = X.shift(b, at(p.pitch), at(p.formant), at(p.stretch));
    if (p.rasp) y = X.rasp(y, { drive: p.rasp + (r.next() * 4 - 2), mix: p.raspMix });
    if (p.flutter) y = X.flutter(y, { rate: p.flutter[0] * (0.85 + 0.3 * r.next()), depth: p.flutter[1], seed: `${seed}:fl` });
    if (p.wet) y = X.follow(y, await X.wetBed(p.wet[0]), { gainDb: p.wet[1] + (r.next() * 3 - 1.5), seed: `${seed}:wet` });
    if (p.sub) y = X.chest(y, p.sub);
    y = X.voiceEq(y, p);
    return y;
  };

  /**
   * Build n variants for a voice sound from a pool of slices. Each variant = one slice (rotating) through the type's
   * throat with its own seeded draw; long slices are cut to maxDur with a natural fade.
   */
  X.voiceSet = async (type, label, pool, { n = pool.length, maxDur = 3, death = false, rattle = death, profile, post } = {}) => {
    const out = [];
    for (let k = 0; k < n; k++) {
      const s = pool[k % pool.length];
      let b = lib.normalizePeak(await X.take(s.id, s.a, s.b, { snap: s.snap ?? 0 }), -3);
      if (b.duration > maxDur) b = lib.fadeOut(lib.slice(b, 0, maxDur), Math.min(0.5, maxDur * 0.3), 'exp');
      let y = await X.zombify(b, type, `${label}:${k}`, { profile: { ...(profile || {}), ...(s.profile || {}) } });
      if (rattle) y = await X.deathRattle(y, type, `${label}:${k}`);
      if (death) y = lib.fadeOut(y, Math.min(0.4, y.duration * 0.35), 'exp');
      if (post) y = await post(y, k);
      y = lib.trimSilence(y, { threshDb: -52, pre: 0.003, post: 0.05, fadeOutSec: 0.03 });
      out.push(lib.fadeOut(y, Math.min(0.12, y.duration * 0.1), 'exp'));
    }
    return out;
  };

  /**
   * Death rattle: a wet, pitched-down exhale (real raspy breaths through the gurgle bed) that carries on after the
   * last cry, so deaths end in a collapse instead of a cut.
   */
  const RATTLES = [[2.06, 2.85], [2.92, 3.49], [7.42, 7.99], [13.10, 13.64], [26.29, 26.93], [10.02, 10.81]];
  X.deathRattle = async (voice, type, seed) => {
    const r = ctx.rng(`rattle:${seed}`);
    const [a, b] = RATTLES[Math.floor(r.next() * RATTLES.length)];
    let br = lib.normalizePeak(await X.take(S.werewolfBreath, a, b, { hp: 90 }), -3);
    const p = PROFILES[type] || PROFILES.zombie;
    br = X.shift(br, p.pitch[0] - 2.5, p.formant[0] - 1.5, 1.35);
    br = X.follow(br, await X.wetBed('gurgle'), { gainDb: -2, lo: 200, hi: 3000, seed: `${seed}:rw` });
    br = lib.eq(br, [{ type: 'hp', f: Math.max(90, p.hp), order: 2 }, { type: 'lp', f: 4200, order: 2 }]);
    br = lib.fadeOut(lib.fadeIn(br, 0.06), br.duration * 0.6, 'exp');
    const g = (X.rms(voice) / Math.max(1e-9, X.rms(br))) * lib.db2lin(-7 + r.next() * 2);
    return lib.mix([{ buf: voice }, { buf: br, at: Math.max(0, voice.duration * 0.72), gainLin: g }]);
  };

  /**
   * Cheap RMS compressor: gain computed on 2.5 ms blocks (attack/release smoothed in dB, soft knee), interpolated per
   * sample. Same musical result as a per-sample detector at a fraction of the cost.
   */
  X.comp = (b, { threshold = -22, ratio = 2.5, knee = 6, attack = 0.006, release = 0.12, makeup = 0 } = {}) => {
    const sr = b.sampleRate, B = Math.round(0.0025 * sr), n = b.length, nb = Math.ceil(n / B);
    const g = new Float32Array(nb + 1);
    const ac = Math.exp(-B / (attack * sr)), rc = Math.exp(-B / (release * sr));
    let gs = 0;
    for (let j = 0; j < nb; j++) {
      let s = 0, c = 0;
      for (const d of b.data) for (let i = j * B; i < Math.min(n, (j + 1) * B); i++) { s += d[i] * d[i]; c++; }
      const x = 10 * Math.log10(s / Math.max(1, c) + 1e-12), over = x - threshold;
      const y = 2 * over < -knee ? x : 2 * Math.abs(over) <= knee ? x + (1 / ratio - 1) * (over + knee / 2) ** 2 / (2 * knee) : threshold + over / ratio;
      const gr = y - x;
      gs = gr < gs ? ac * gs + (1 - ac) * gr : rc * gs + (1 - rc) * gr;
      g[j] = Math.pow(10, (gs + makeup) / 20);
    }
    g[nb] = g[nb - 1];
    return new Buf(b.data.map((d) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) { const p = i / B - 0.5, j = Math.max(0, Math.floor(p)), f = Math.min(1, Math.max(0, p - j)); o[i] = d[i] * (g[j] * (1 - f) + g[Math.min(nb, j + 1)] * f); } return o; }), sr);
  };

  /** Ring modulation blend (inharmonic, metallic sidebands at f +- freq): unsettling, unnatural throat. */
  X.ring = (y, { freq = 70, mix = 0.2 } = {}) => new Buf(y.data.map((d) => { const o = new Float32Array(d.length), w = 2 * Math.PI * freq / y.sampleRate; for (let i = 0; i < d.length; i++) o[i] = d[i] * (1 - mix + mix * Math.sin(w * i) * 1.41); return o; }), y.sampleRate);

  /** Second throat: a pitch/formant-shifted copy, slightly late, `gainDb` under the original (RMS-matched). */
  X.double = (y, { semis = -5, formant = semis, delay = 0.01, gainDb = -8 } = {}) => {
    const d = X.shift(y, semis, formant);
    const g = (X.rms(y) / Math.max(1e-9, X.rms(d))) * lib.db2lin(gainDb);
    return lib.mix([{ buf: y }, { buf: d, at: delay, gainLin: g }], { length: y.duration + delay });
  };

  /** Small-speaker loudness proxy: LUFS after a 350 Hz high-pass and 9 kHz low-pass (phones play nothing below). */
  X.phoneL = (b) => lib.lufs(lib.eq(b, [{ type: 'hp', f: 350, order: 2 }, { type: 'lp', f: 9000, order: 2 }]));

  /**
   * Phone match: the writer normalises full-band LUFS, so a variant whose energy sits in the chest (80-350 Hz) or
   * below plays quiet on a phone while measuring "on target". While (phone LUFS - LUFS) is more than 0.5 dB under
   * `target`, tilt it: shelve the low end down and lift the 2 kHz presence region. Variants of one sound end up with
   * the same phone level (measured: dark bloater / brute takes went from -5.3 to -3.4 dB against a -3 dB target).
   */
  X.phoneMatch = (y, target = -2.5) => {
    for (let it = 0; it < 5; it++) {
      const gap = X.phoneL(y) - lib.lufs(y);
      if (!Number.isFinite(gap) || !(gap < target - 0.5)) break;
      const ex = target - gap;
      y = lib.eq(y, [{ type: 'lowshelf', f: 220, gain: -Math.min(8, ex), q: 0.7 }, { type: 'peak', f: 2200, gain: Math.min(5, ex * 0.6), q: 0.6 }]);
    }
    return y;
  };

  /** Seamless loop (equal-power crossfade of the tail into the head). */
  X.loop = (b, xf = 0.8) => lib.loopCrossfade(lib.removeDC(b, { mode: 'mean' }), xf);

  /** A mono bed (cached) from a source range, for X.follow. */
  X.bedOf = async (id, a, b) => {
    const k = `${id}@${a}-${b}`;
    if (!beds[k]) beds[k] = lib.normalizePeak(await X.take(id, a, b, { hp: 40, trim: null, autoFade: false }), -3);
    return beds[k];
  };

  /** Insect-like clicks riding the voice envelope (crawler). */
  X.clicks = (y, seed, gainDb = -13) => {
    const c = lib.crackle(y.duration + 0.05, { density: 110, minAmp: 0.15, maxAmp: 1, decay: 0.0022, hp: 2600, seed });
    return X.follow(y, lib.normalizePeak(c, -3), { gainDb, lo: 2200, hi: 14000, power: 1, seed });
  };

  /** Dev: one spectrogram contact sheet per sound (all variants, peak-normalised, 0.25 s apart). */
  X.sheet = (name, list) => {
    const parts = [];
    let t = 0;
    for (const b of list) { const m = lib.toMono(b); parts.push({ buf: lib.normalizePeak(m, -1), at: t }); t += m.duration + 0.25; }
    ctx.preview(`${name}`, lib.mix(parts, { channels: 1 }));
  };

  return X;
}
