// Weapons producer — category 'weapons': every gun's layered shot set (close / tail / far / mech), the minigun's
// spin loops, the rocket launcher, the knife, and all weapon foley (reload / draw / bolt / pump / shells / dryfire /
// low-ammo). Built from CC0 recordings (The Free Firearm Sound Library near + mid takes, Freesound CC0 gun
// recordings and gun foley) plus synthesized layers (crack, body punch, sub, rooms and street tails).
//
//   node --max-old-space-size=1536 tools/audio/build.mjs --only weapons
//   dev (subset into a scratch folder; WEAPONS_LAYERS=close,tail,far,mech; WEAPONS_PREVIEW=1 writes close+tail mixes):
//   CF_AUDIO_OUT=tools/audio/out/weapons-dev WEAPONS_ONLY=rifle762,foley node --max-old-space-size=1536 \
//     tools/audio/run-producer.mjs tools/audio/producers/weapons.mjs --spectrograms all
//
// Layer contract (docs/AUDIO.md §1): <set>_close = stereo, dry, the loudest thing in the game (-12 LUFS); 2D for the
// local shot, positional (spatial:true, range [12, 60]) when a teammate within 40 m fires;
// <set>_tail = reflections only, 2D stereo, played 15 ms after the close (-20 LUFS); <set>_far = mono, spatial,
// teammates beyond 40 m (-22 LUFS); <set>_mech = action noise, 2D (-22 LUFS).
//
// Character per weapon comes from (1) which real gun recordings feed it, (2) the designed body/sub punch (frequency,
// decay, level vs the recording's energy), (3) the EQ curve, (4) the close-layer length, (5) tail length/space.
//
// Gain staging of a close layer (see designClose): recorded blast (transient soft-clipped first) + crack + body +
// sub, levelled by ENERGY against the recording -> parallel compression (dense body, intact crack) -> psycho-bass
// harmonics (phones cannot play < 120 Hz) -> exciter -> mono-compatible width -> early room -> envelope -> tone ->
// partial match to a per-weapon band-share signature -> soft clipper (band-limited to 17 kHz) driven to a fixed
// peak-to-loudness ratio -> codec-aware pre-master (encode/decode probe; the take that Vorbis needs the least extra
// limiting for wins), so the shipped, DECODED file sits at -12 LUFS / <= -1 dBTP with ~0-3 dB of limiting (capped, see
// codecSafe; close layers are encoded at q0.6, see CLOSE_QUALITY).

const SR = 48000;
// Close layers (the loudest, most transient files in the game) are encoded at Vorbis q0.6 instead of q0.5: q0.5 put
// 0.6-1.3 dB of inter-sample overshoot on their crack (decoded true peak), which had to be bought back with limiting;
// at q0.6 it is 0.0-0.3 dB on most takes, for ~1 KB more per file. Everything else stays at q0.5.
const CLOSE_QUALITY = 0.6;

// ---------------------------------------------------------------------------------------------- sources
const F = {
  walther: 'ffsl/Walther PPQ/X_39P', waltherMid: 'ffsl/Walther PPQ/X_31P',
  bersa: 'ffsl/Bersa/F_47P', bersaMid: 'ffsl/Bersa/F_41P',
  m1911: 'ffsl/1911/A_42P', m1911Mid: 'ffsl/1911/A_34P',
  sw642: 'ffsl/Smith & Wesson 642/V_27P', sw642Mid: 'ffsl/Smith & Wesson 642/V_22P',
  cg: 'ffsl/Carl Gustav M45/G_31P', cgBurst: 'ffsl/Carl Gustav M45/G_33P', cgLong: 'ffsl/Carl Gustav M45/G_35P', cgMid: 'ffsl/Carl Gustav M45/G_20P',
  ppsh: 'ffsl/PPSh/P_30P', ppshMid: 'ffsl/PPSh/P_16P',
  ak: 'ffsl/AK-47/C_28P', akBurst: 'ffsl/AK-47/C_29P', akMid: 'ffsl/AK-47/C_31P', akMidBurst: 'ffsl/AK-47/C_34P',
  ar: 'ffsl/AR-15/D_32P', arMid: 'ffsl/AR-15/D_24P',
  sks: 'ffsl/SKS/U_14P', sksMid: 'ffsl/SKS/U_19P',
  nova: 'ffsl/Nova/O_21P', novaMid: 'ffsl/Nova/O_17P',
  m12: 'ffsl/Model 12/K_22P', m12Mid: 'ffsl/Model 12/K_17P',
  cd: 'ffsl/CD/H_21P', cdMid: 'ffsl/CD/H_16P',
  mossberg: 'ffsl/Mossberg/N_30P', mossbergMid: 'ffsl/Mossberg/N_26P',
  mosin: 'ffsl/Mosin Nagant/M_21P', mosinMid: 'ffsl/Mosin Nagant/M_26P',
  arisaka: 'ffsl/Arisaka/E_25P', arisakaMid: 'ffsl/Arisaka/E_18P',
  marlin: 'ffsl/Marlin 336/I_22P', marlinMid: 'ffsl/Marlin 336/I_17P',
  w1894: 'ffsl/Model 1894/L_23P', w1894Mid: 'ffsl/Model 1894/L_17P',
  tikka: 'ffsl/Tikka/W_29P', tikkaMid: 'ffsl/Tikka/W_24P',
  m1917: 'ffsl/1917/B_24P', m1917Mid: 'ffsl/1917/B_16P',
  savage: 'ffsl/Savage 10 .300 Blackout/T_27P', savageMid: 'ffsl/Savage 10 .300 Blackout/T_17P',
  deagle: 'fs:712310', cal50: 'fs:668071', cal50mg: 'fs:239138', m16: 'fs:238916', ar50y: 'fs:427597',
  // foley / mechanics
  m16reload: 'fs:725397', arReload: 'fs:815879', arVarious: 'fs:263513', arHardware: 'fs:393732', akCock: 'fs:675008', akReload: 'fs:674742',
  uzi: 'fs:677160', glock: 'fs:393734', browning: 'fs:674744', m1911reload: 'fs:396331', mgReload: 'fs:363168',
  mauser: 'fs:802673', mosinBolt: 'fs:370345', bolt22: 'fs:620928', lever: 'fs:153560', revolverReload: 'fs:177863', revolverCock: 'fs:240698',
  revolverClicks: 'fs:677159', revolverEject: 'fs:693125', revolverDry: 'fs:501562', bmgRound: 'fs:855580',
  sgRack: 'oga_shotgun_reload/ShotgunSounds/Rack', sgChamber: 'oga_shotgun_reload/ShotgunSounds/Shell in Chamber', sg4: 'oga_shotgun_reload/ShotgunSounds/4 Shell Reload',
  sg5: 'oga_shotgun_reload/ShotgunSounds/5 Shell Reload',
  sgFirst: 'oga_shotgun_reload/ShotgunSounds/First Shell', sgNext: 'oga_shotgun_reload/ShotgunSounds/Subsequent Shells', sgCock: 'oga_gun_reload/shotguncock_0',
  arReload2: 'oga_gun_reload/assaultriflereload1_0', gunReload: 'oga_gun_reload/gunreload1',
  holster: 'fs:388819', unholster: 'fs:377145', unholster2: 'fs:688765',
  cloth1: 'fs:19291', cloth2: 'fs:334219', clothHeavy: 'fs:163164', jacket: 'fs:494797', fabric: 'fs:789038',
  swing1: 'fs:268227', swing2: 'fs:268226', swoosh: 'fs:263595', swooshFast: 'fs:507466', sword: 'fs:60024', knifeWhoosh: 'fs:389690',
  casings: 'fs:318964', casing30: 'fs:205126', casingDrop: 'fs:210102', bullet30: 'fs:460859', sgShells: 'fs:620929', sgEject: 'fs:147261',
  rocketLaunch: 'fs:521377', missile: 'fs:200459', atMissile: 'fs:184274', motor: 'fs:125401',
};
const K_ = (n) => `kenney_impact/Audio/${n}`; // Kenney Impact Sounds ids

// Lost Town streets with a longer rolling echo field (big rifles): more, later reflections + a longer diffuse tail
const URBAN_LONG = {
  length: 3.0, predelay: 0.02,
  echoes: { count: 20, t: [0.03, 0.95], gain: [0.18, 0.55], lp: [6000, 1500], spread: [0.003, 0.045], pan: 1 },
  tail: { rt60: 2.1, rtLow: 2.5, rtHigh: 0.6, gain: 0.5, start: 0.06, build: 0.16, lp: 3000, hp: 55 },
};

// ---------------------------------------------------------------------------------------------- gun recipes
// near: [sourceId, onset s, { semis, burst, stack: [id, t, gainDb, delaySec, semis] }] — shots for _close (and _tail
//   unless burst); mid: mid-distance takes for _far.
// close: direct (s of recorded blast kept), len (close layer length), hp + eq (on the recording), crack / nwave /
//   blast / body / sub (designed layers; gain = dB vs the recording's energy), room (early room wet), width,
//   post (tone EQ before the clipper), plr (peak-to-loudness ratio the clipper is driven to).
//   Sub decays are short on purpose: the parallel compressor (+15 dB makeup) and the PLR clipper lift the 40-200 ms
//   decay ~11 dB, which exhumes a long sine sub as a pitched 50-60 Hz ring under the gun ("drum kit" timbre, a
//   droning low end in auto fire). Low-band periodicity over 40-200 ms (normalised autocorrelation) was 0.7-0.8 on
//   the rifles/MGs at T60 0.13-0.18 s; at ~0.08-0.10 s it is ~0.45 (the near recordings' own range) with the same
//   punch energy in the first 40 ms (sub gain +1.5-2 dB to compensate).
// tail: len, env (preset or params), rec (dB of the recorded reflections vs the synthesized street tail).
// far: dist (m of air), len.  mix: manifest decisions (voices, pitch, vol, farRange, closeRange...).
//
// Mix hierarchy (vol): single-shot loudness (400 ms momentary max of close + tail) rises pistol < .45 < rifles <
// magnum / shotguns / snipers; light guns (9 mm / .45 pistols and SMGs) sit 1-1.4 dB under the rifles so the heavy
// guns read as heavier. The minigun plays a 77 ms pop per round at 2400 rpm; at vol 1 its sustained level matches
// the other belt-fed guns (it was the quietest automatic at 0.7). Its tail gets 6 voices: at 25 ms per round 2 voices
// stole each tail after 50 ms, before its first reflection (~55 ms) arrived, so sustained fire had no space at all.
// Width: close layers stay <= 0.32. Single-speaker phones fold to (L+R)/2 = the mid; at width 0.45 the AWP's mono
// fold lost 3 dB more than a correlated layer (it played quieter than the pistol on a mono phone).
const P = (o) => o;
export const GUNS = [
  P({
    name: 'pistol', // Nightwatch-9 (Glock-like 9 mm): snappy, bright, short; light body, little sub
    near: [[F.walther, 1.407], [F.walther, 6.444], [F.walther, 10.660], [F.bersa, 0.334], [F.bersa, 4.410]],
    mid: [[F.waltherMid, 1.085], [F.waltherMid, 5.243], [F.bersaMid, 0.438]],
    close: { bal: { sub: -26, low: -12, lowMid: -6, mid: -3, high: -8, air: -12 }, n: 5, direct: 0.075, len: 0.22, hp: 75, eq: [{ type: 'peak', f: 230, gain: 2, q: 1 }, { type: 'peak', f: 2900, gain: 2.5, q: 1.1 }, { type: 'highshelf', f: 9000, gain: -1.5 }],
      crack: -6, body: { f0: 300, f1: 140, sweep: 0.012, decay: 0.05, gain: -8 }, sub: { f0: 125, f1: 58, decay: 0.06, gain: -14 }, room: 0.13, width: 0.26 },
    tail: { n: 3, len: 1.4, rec: -1 }, far: { n: 2, dist: 140, len: 1.7 },
    mech: 'pistol', mix: { voices: 4, vol: 0.85, pitch: [0.96, 1.04], farRange: [30, 320] },
  }),
  P({
    name: 'pistol45', // Warden .45 (USP-like): deeper thump, rounder crack than the 9 mm
    near: [[F.m1911, 0.941], [F.m1911, 5.002], [F.bersa, 0.334, { semis: -1.6 }], [F.walther, 6.444, { semis: -1.8 }]],
    mid: [[F.m1911Mid, 1.542], [F.m1911Mid, 6.655]],
    close: { bal: { sub: -20, low: -8, lowMid: -5, mid: -3.5, high: -11, air: -16 }, n: 4, direct: 0.085, len: 0.25, hp: 60, eq: [{ type: 'peak', f: 170, gain: 3, q: 0.9 }, { type: 'peak', f: 2200, gain: 1.5, q: 1 }, { type: 'highshelf', f: 7000, gain: -2 }],
      crack: -8, body: { f0: 220, f1: 105, sweep: 0.015, decay: 0.075, gain: -6 }, sub: { f0: 105, f1: 52, decay: 0.08, gain: -12 }, room: 0.15, width: 0.28,
      post: [{ type: 'peak', f: 1400, gain: 2.5, q: 0.6 }] },
    tail: { n: 3, len: 1.5, rec: -1 }, far: { n: 2, dist: 140, len: 1.8 },
    mech: 'pistol45', mix: { voices: 4, vol: 0.9, pitch: [0.96, 1.04], farRange: [30, 320] },
  }),
  P({
    name: 'magnum', // Sandhawk .50 / Viper .44: the biggest handgun — hard crack + chesty boom + long room
    // (shot/mic-channel picks: the combinations that survive Vorbis without needing extra limiting)
    near: [[F.sw642, 6.219, { ch: 1 }], [F.deagle, 0.006], [F.m1911, 0.941, { semis: -3, ch: 1 }], [F.sw642, 0.805, { semis: -1.5, ch: 0 }], [F.sw642, 6.219, { ch: 0 }]],
    mid: [[F.sw642Mid, 0.673], [F.sw642Mid, 5.506], [F.m1911Mid, 1.542, { semis: -2 }]],
    close: { bal: { sub: -12, low: -5, lowMid: -6, mid: -6, high: -9, air: -12 }, n: 5, direct: 0.12, len: 0.34, hp: 45, eq: [{ type: 'peak', f: 140, gain: 3, q: 0.8 }, { type: 'peak', f: 420, gain: -1.5, q: 1 }, { type: 'peak', f: 3200, gain: 2.5, q: 1 }],
      crack: -5, body: { f0: 185, f1: 80, sweep: 0.02, decay: 0.13, gain: -4 }, sub: { f0: 92, f1: 48, decay: 0.17, gain: -10 }, room: 0.2, width: 0.3, plr: 10.6 },
    tail: { n: 3, len: 2.1, rec: 0 }, far: { n: 3, dist: 170, len: 2.2 },
    mix: { voices: 3, pitch: [0.96, 1.03], farRange: [40, 420] },
  }),
  P({
    name: 'smg9', // Hornet-9 / Rattler-9 (MP5 / Uzi): tight, quick, mid-forward bark; short tail for 800-950 rpm
    near: [[F.cg, 0.310], [F.cg, 3.501], [F.cg, 6.728], [F.cgBurst, 4.253, { burst: true }], [F.cgLong, 4.926, { burst: true }]],
    mid: [[F.cgMid, 0.348], [F.cgMid, 2.259], [F.cgMid, 5.267]],
    close: { bal: { sub: -28, low: -14, lowMid: -6, mid: -2.5, high: -9, air: -13 }, n: 5, direct: 0.06, len: 0.17, hp: 80, eq: [{ type: 'peak', f: 260, gain: 1.5, q: 1 }, { type: 'peak', f: 1300, gain: 2, q: 1 }, { type: 'peak', f: 3600, gain: 2, q: 1.2 }],
      crack: -8, body: { f0: 290, f1: 140, sweep: 0.012, decay: 0.045, gain: -9 }, sub: { f0: 115, f1: 56, decay: 0.055, gain: -16.5 }, room: 0.11, width: 0.24 },
    tail: { n: 3, len: 1.15, rec: -2 }, far: { n: 2, dist: 140, len: 1.6 },
    mech: 'smg9', mix: { voices: 6, vol: 0.85, pitch: [0.96, 1.04], farRange: [30, 320] },
  }),
  P({
    name: 'smg45', // Stinger-45 / Hound-45 (Vector / UMP): lower, thuddier .45 rounds at a high rate
    near: [[F.ppsh, 0.969, { semis: -1.6 }], [F.ppsh, 4.387, { semis: -1.6 }], [F.ppsh, 8.243, { semis: -1.6 }], [F.ppsh, 11.421, { semis: -1.6 }], [F.ppsh, 15.090, { semis: -1.6 }]],
    mid: [[F.ppshMid, 5.251, { semis: -1.5 }], [F.ppshMid, 9.047, { semis: -1.5 }], [F.ppshMid, 13.000, { semis: -1.5 }]],
    close: { bal: { sub: -16, low: -6, lowMid: -4, mid: -6, high: -13, air: -18 }, n: 5, direct: 0.065, len: 0.19, hp: 65, eq: [{ type: 'peak', f: 180, gain: 3, q: 0.9 }, { type: 'peak', f: 900, gain: 1, q: 1 }, { type: 'highshelf', f: 6000, gain: -2.5 }],
      crack: -9, body: { f0: 215, f1: 100, sweep: 0.014, decay: 0.065, gain: -6 }, sub: { f0: 100, f1: 50, decay: 0.07, gain: -12.5 }, room: 0.12, width: 0.26,
      post: [{ type: 'peak', f: 1300, gain: 2.5, q: 0.6 }] },
    tail: { n: 3, len: 1.25, rec: -2 }, far: { n: 2, dist: 140, len: 1.6 },
    mech: 'smg45', mix: { voices: 6, vol: 0.85, pitch: [0.96, 1.04], farRange: [30, 320] },
  }),
  P({
    name: 'rifle762', // Steppe-47 (AKM): heavy, barky low-mid, rough
    near: [[F.ak, 0.611], [F.ak, 3.257], [F.ak, 6.021], [F.ak, 9.156], [F.akBurst, 5.521, { burst: true }]],
    mid: [[F.akMid, 0.346], [F.akMid, 4.410], [F.akMidBurst, 5.166, { burst: true }]],
    close: { bal: { sub: -12, low: -6, lowMid: -3, mid: -6.5, high: -14, air: -18 }, n: 5, direct: 0.1, len: 0.26, hp: 50, eq: [{ type: 'peak', f: 210, gain: 2.5, q: 0.9 }, { type: 'peak', f: 700, gain: 1.5, q: 1.1 }, { type: 'peak', f: 2600, gain: 1, q: 1.2 }, { type: 'highshelf', f: 8000, gain: -1.5 }],
      crack: -8, body: { f0: 235, f1: 112, sweep: 0.016, decay: 0.085, gain: -7 }, sub: { f0: 100, f1: 50, decay: 0.1, gain: -12 }, room: 0.15, width: 0.3 },
    tail: { n: 3, len: 1.8, rec: 0 }, far: { n: 3, dist: 180, len: 2.1 },
    mech: 'rifle762', mix: { voices: 6, pitch: [0.97, 1.03], farRange: [40, 450] },
  }),
  P({
    name: 'rifle556', // Sentry-4 / Falcon-L / Aquila (M4 / SCAR / AUG): sharper, brighter crack, tighter low end
    near: [[F.ar, 0.704], [F.ar, 5.647], [F.m16, 0.000], [F.arMid, 0.584], [F.savage, 4.968, { semis: 1 }]],
    mid: [[F.arMid, 0.584], [F.arMid, 3.910], [F.ar50y, 0.596]],
    close: { bal: { sub: -15, low: -8, lowMid: -7.5, mid: -4.5, high: -7.5, air: -11 }, n: 5, direct: 0.09, len: 0.24, hp: 60, eq: [{ type: 'peak', f: 240, gain: 1.5, q: 1 }, { type: 'peak', f: 450, gain: -1.5, q: 1.2 }, { type: 'peak', f: 1900, gain: 1, q: 1 }, { type: 'peak', f: 3800, gain: 2.5, q: 1.1 }],
      crack: -6, body: { f0: 275, f1: 132, sweep: 0.013, decay: 0.065, gain: -9 }, sub: { f0: 110, f1: 55, decay: 0.08, gain: -14 }, room: 0.14, width: 0.32,
      post: [{ type: 'peak', f: 2200, gain: 3, q: 0.6 }] },
    tail: { n: 3, len: 1.7, rec: 0 }, far: { n: 3, dist: 180, len: 2.0 },
    mech: 'rifle556', mix: { voices: 6, pitch: [0.97, 1.03], farRange: [40, 450] },
  }),
  P({
    name: 'shotgun', // Breacher-12 (870 pump): wide low-mid boom, long street tail
    near: [[F.nova, 0.431], [F.nova, 3.465], [F.m12, 0.842], [F.m12, 7.445], [F.nova, 0.431, { semis: -0.8 }]],
    mid: [[F.novaMid, 0.694], [F.novaMid, 3.708], [F.m12Mid, 0.907], [F.m12Mid, 7.057]],
    close: { bal: { sub: -10, low: -5, lowMid: -4.5, mid: -6, high: -12, air: -17 }, n: 5, direct: 0.14, len: 0.4, hp: 45, eq: [{ type: 'peak', f: 120, gain: 3, q: 0.8 }, { type: 'peak', f: 300, gain: 1, q: 1 }, { type: 'peak', f: 2000, gain: 1.5, q: 1 }],
      crack: -9, body: { f0: 170, f1: 75, sweep: 0.02, decay: 0.15, gain: -4 }, sub: { f0: 85, f1: 45, decay: 0.2, gain: -9 }, room: 0.2, width: 0.32, plr: 10.8 },
    tail: { n: 3, len: 2.2, rec: 0 }, far: { n: 3, dist: 170, len: 2.3 },
    mix: { voices: 3, pitch: [0.96, 1.03], farRange: [40, 420] },
  }),
  P({
    name: 'shotgunAuto', // Squall-20 (USAS-12): tighter, drier, a mechanical bolt slam every shot
    near: [[F.mossberg, 1.697], [F.mossberg, 4.961], [F.cd, 0.464], [F.cd, 3.075]],
    mid: [[F.mossbergMid, 0.786], [F.mossbergMid, 4.574], [F.mossbergMid, 7.948], [F.cdMid, 0.607]],
    close: { bal: { sub: -12, low: -6, lowMid: -5, mid: -4.5, high: -11, air: -16 }, n: 4, direct: 0.11, len: 0.32, hp: 55, eq: [{ type: 'peak', f: 160, gain: 2, q: 0.9 }, { type: 'peak', f: 1200, gain: 2, q: 0.8 }, { type: 'highshelf', f: 6000, gain: -1 }],
      crack: -8, body: { f0: 190, f1: 85, sweep: 0.018, decay: 0.11, gain: -5 }, sub: { f0: 90, f1: 46, decay: 0.12, gain: -10.5 }, room: 0.16, width: 0.3 },
    tail: { n: 3, len: 1.9, rec: 0 }, far: { n: 3, dist: 170, len: 2.1 },
    mech: 'shotgunAuto', mix: { voices: 4, pitch: [0.96, 1.03], farRange: [40, 420] },
  }),
  P({
    name: 'shotgunHeavy', // Twin Thunder (double barrel): two recordings stacked, pitched down: the biggest boom
    // (band balance: with mid at -9 dB of the energy it played 2 dB under every other heavy gun on a phone speaker)
    near: [[F.m12, 0.842, { semis: -1.3, stack: [F.cd, 3.075, -4, 0.003, -1] }], [F.m12, 7.445, { semis: -1.3, stack: [F.nova, 0.431, -4, 0.0025, -1] }],
      [F.cd, 0.464, { semis: -1.5, stack: [F.m12, 0.842, -5, 0.003, -1.5] }], [F.cd, 3.075, { semis: -1.2, stack: [F.nova, 3.465, -4, 0.002, -1] }]],
    mid: [[F.m12Mid, 0.907, { semis: -1.3 }], [F.cdMid, 4.117, { semis: -1.3 }], [F.m12Mid, 7.057, { semis: -1.3 }]],
    close: { bal: { sub: -7, low: -5, lowMid: -5, mid: -6.5, high: -13, air: -17 }, n: 4, direct: 0.16, len: 0.45, hp: 40, eq: [{ type: 'peak', f: 110, gain: 3.5, q: 0.8 }, { type: 'peak', f: 250, gain: 1.5, q: 1 }, { type: 'peak', f: 1800, gain: 1, q: 1 }],
      crack: -8, body: { f0: 150, f1: 64, sweep: 0.022, decay: 0.2, gain: -3 }, sub: { f0: 76, f1: 40, decay: 0.26, gain: -7.5 }, room: 0.24, width: 0.32, plr: 11 },
    tail: { n: 3, len: 2.5, rec: 0 }, far: { n: 3, dist: 160, len: 2.5 },
    mix: { voices: 2, pitch: [0.96, 1.03], farRange: [40, 450] },
  }),
  P({
    name: 'mg556', // Bulwark-249 (M249): heavier than the M4, belt-fed rattle in the mech layer
    near: [[F.sks, 3.577], [F.sks, 6.755], [F.sks, 10.211], [F.sks, 13.291], [F.sks, 16.778]],
    mid: [[F.sksMid, 2.614], [F.sksMid, 8.016], [F.sksMid, 12.786]],
    close: { bal: { sub: -11, low: -5, lowMid: -6, mid: -4, high: -10, air: -14 }, n: 5, direct: 0.09, len: 0.23, hp: 55, eq: [{ type: 'peak', f: 230, gain: 2.5, q: 0.9 }, { type: 'peak', f: 1000, gain: 1, q: 1 }, { type: 'peak', f: 2600, gain: 2, q: 1 }],
      crack: -7, body: { f0: 250, f1: 115, sweep: 0.015, decay: 0.06, gain: -6 }, sub: { f0: 100, f1: 50, decay: 0.065, gain: -10.5 }, room: 0.15, width: 0.3 },
    tail: { n: 3, len: 1.6, rec: 0 }, far: { n: 3, dist: 190, len: 2.0 },
    mech: 'mg556', mix: { voices: 6, pitch: [0.97, 1.03], farRange: [40, 480] },
  }),
  P({
    name: 'mg762', // Buzzsaw-42 (MG42, 1150 rpm): short heavy rips that blur into a tearing buzz
    near: [[F.arisaka, 0.524], [F.arisaka, 4.030], [F.marlin, 0.740], [F.marlin, 7.004], [F.w1894, 0.573, { semis: -1 }]],
    mid: [[F.arisakaMid, 0.372], [F.arisakaMid, 4.487], [F.marlinMid, 6.844], [F.w1894Mid, 0.596]],
    close: { bal: { sub: -10, low: -4, lowMid: -7, mid: -7, high: -9, air: -12 }, n: 5, direct: 0.075, len: 0.2, hp: 50, eq: [{ type: 'peak', f: 200, gain: 3, q: 0.9 }, { type: 'peak', f: 1000, gain: 1.5, q: 1 }, { type: 'highshelf', f: 7000, gain: -2 }],
      crack: -7, body: { f0: 215, f1: 95, sweep: 0.014, decay: 0.07, gain: -5 }, sub: { f0: 95, f1: 48, decay: 0.08, gain: -10.5 }, room: 0.13, width: 0.32,
      post: [{ type: 'peak', f: 1500, gain: 3, q: 0.6 }] },
    tail: { n: 3, len: 1.6, rec: 0 }, far: { n: 3, dist: 190, len: 2.0 },
    mech: 'mg762', mix: { voices: 7, pitch: [0.97, 1.03], farRange: [40, 480] },
  }),
  P({
    name: 'minigun', // Cyclone-134 (2400 rpm = one round every 25 ms): very short pops that fuse into a roar
    near: [[F.ar, 0.704], [F.ar, 5.647], [F.sks, 3.577], [F.sks, 6.755], [F.cg, 0.310], [F.ak, 0.611]],
    mid: [[F.arMid, 0.584], [F.sksMid, 2.614]],
    close: { bal: { sub: -24, low: -12, lowMid: -5, mid: -3.5, high: -10, air: -13 }, n: 6, direct: 0.035, len: 0.075, hp: 70, eq: [{ type: 'peak', f: 230, gain: 2, q: 1 }, { type: 'peak', f: 2500, gain: 2, q: 1 }],
      crack: -6, body: { f0: 240, f1: 120, sweep: 0.01, decay: 0.03, gain: -6 }, room: 0.08, width: 0.3, plr: 9.5 },
    tail: { n: 2, len: 1.1, rec: -3 }, far: { n: 2, dist: 180, len: 0.45 },
    mix: { voices: 10, vol: 1, pitch: [0.95, 1.05], tailVoices: 6, farRange: [40, 480] },
  }),
  P({
    name: 'sniper338', // Longbow-338 (AWP): supersonic snap + huge boom + long rolling street echo
    near: [[F.tikka, 0.577, { ch: 0 }], [F.tikka, 5.665, { ch: 1 }], [F.m1917, 6.731, { ch: 1 }], [F.savage, 4.968, { semis: -1, ch: 0 }], [F.savage, 4.968, { semis: -1, ch: 1 }]],
    mid: [[F.tikkaMid, 0.755], [F.tikkaMid, 5.377], [F.m1917Mid, 0.607], [F.m1917Mid, 5.972]],
    close: { bal: { sub: -10, low: -5, lowMid: -7, mid: -6, high: -8, air: -11 }, n: 5, direct: 0.15, len: 0.46, hp: 40, eq: [{ type: 'peak', f: 150, gain: 2, q: 0.9 }, { type: 'peak', f: 2600, gain: 3, q: 1 }, { type: 'highshelf', f: 8000, gain: 1 }],
      crack: -4, nwave: -2, body: { f0: 180, f1: 75, sweep: 0.02, decay: 0.15, gain: -4 }, sub: { f0: 85, f1: 42, decay: 0.22, gain: -8.5 }, room: 0.18, width: 0.3, plr: 11.2 },
    tail: { n: 3, len: 2.7, rec: 0, env: URBAN_LONG }, far: { n: 3, dist: 260, len: 2.8 },
    mix: { voices: 2, pitch: [0.97, 1.02], farRange: [50, 700] },
  }),
  P({
    name: 'sniper50', // Anvil-50 (Barrett .50): muzzle-brake blast, massive low end, heavy action slam
    near: [[F.cal50, 0.010, { ch: 0 }], [F.tikka, 0.577, { semis: -2.5, ch: 0 }], [F.m1917, 1.308, { semis: -2.5, ch: 1 }], [F.cal50mg, 0.002, { burst: true, ch: 0 }], [F.tikka, 5.665, { semis: -2.5, ch: 1 }]],
    mid: [[F.tikkaMid, 0.755, { semis: -2.5 }], [F.m1917Mid, 0.607, { semis: -2.5 }], [F.mosinMid, 1.138, { semis: -2 }]],
    close: { bal: { sub: -7, low: -4, lowMid: -6, mid: -6, high: -11, air: -14 }, n: 5, direct: 0.16, len: 0.5, hp: 36, eq: [{ type: 'peak', f: 110, gain: 3, q: 0.8 }, { type: 'peak', f: 300, gain: 1.5, q: 1 }, { type: 'peak', f: 2200, gain: 2, q: 1 }],
      crack: -5, blast: -3, body: { f0: 155, f1: 64, sweep: 0.022, decay: 0.18, gain: -3 }, sub: { f0: 72, f1: 38, decay: 0.3, gain: -6.5 }, room: 0.22, width: 0.32, plr: 11.4 },
    tail: { n: 3, len: 2.9, rec: 0, env: URBAN_LONG }, far: { n: 3, dist: 280, len: 3.0 },
    mech: 'sniper50', mix: { voices: 2, pitch: [0.97, 1.02], farRange: [50, 800] },
  }),
  P({
    name: 'rifleBolt', // Hunter-98 (Kar98k): woody full-power rifle boom, less snap than the AWP
    near: [[F.mosin, 1.034], [F.mosin, 5.020], [F.mosin, 9.156], [F.mosin, 14.137]],
    mid: [[F.mosinMid, 1.138], [F.mosinMid, 6.105], [F.mosinMid, 10.743]],
    close: { bal: { sub: -10, low: -5, lowMid: -4, mid: -6, high: -12, air: -16 }, n: 4, direct: 0.13, len: 0.4, hp: 45, eq: [{ type: 'peak', f: 180, gain: 2, q: 0.9 }, { type: 'peak', f: 450, gain: 1.5, q: 1 }, { type: 'peak', f: 2400, gain: 2, q: 1 }],
      crack: -6, body: { f0: 195, f1: 85, sweep: 0.018, decay: 0.12, gain: -5 }, sub: { f0: 90, f1: 45, decay: 0.17, gain: -10 }, room: 0.17, width: 0.3, plr: 10.8 },
    tail: { n: 3, len: 2.3, rec: 0 }, far: { n: 3, dist: 220, len: 2.5 },
    mix: { voices: 3, pitch: [0.97, 1.03], farRange: [50, 600] },
  }),
];

// ---------------------------------------------------------------------------------------------- mech layers
// Short action noise played with every shot (vol 0.8): bolt carrier / slide / hammer clack, 10 ms after the shot.
// clip: [id, start, end, { mode: 'peak' | 'first' | 'whole', pre, post, semis, hp, lp }]
const MECH = {
  pistol: [[F.glock, 10.88, 11.08, { mode: 'peak', post: 0.06, semis: 1 }], [F.glock, 15.67, 15.85, { mode: 'peak', post: 0.06, semis: 1.5 }], [F.glock, 24.82, 25.01, { mode: 'peak', post: 0.06, semis: 0.5 }]],
  pistol45: [[F.browning, 5.44, 5.79, { mode: 'peak', post: 0.07, semis: -1 }], [F.browning, 6.65, 7.02, { mode: 'peak', post: 0.07, semis: -1.5 }], [F.m1911reload, 0, 0.56, { mode: 'peak', post: 0.07, semis: -1 }]],
  smg9: [[F.uzi, 3.38, 3.70, { mode: 'peak', post: 0.05, semis: 2 }], [F.uzi, 2.95, 3.35, { mode: 'peak', post: 0.05, semis: 2.5 }], [F.arVarious, 1.55, 1.78, { mode: 'peak', post: 0.05, semis: 2 }]],
  smg45: [[F.arVarious, 2.83, 3.10, { mode: 'peak', post: 0.06, semis: -1 }], [F.uzi, 1.56, 2.24, { mode: 'peak', post: 0.06, semis: -1 }], [F.arVarious, 4.24, 4.45, { mode: 'peak', post: 0.06, semis: -1.5 }]],
  rifle762: [[F.akCock, 0.15, 0.71, { mode: 'peak', post: 0.08, semis: -1 }], [F.akCock, 2.18, 2.77, { mode: 'peak', post: 0.08, semis: -1.3 }], [F.akCock, 4.40, 4.92, { mode: 'peak', post: 0.08, semis: -0.7 }]],
  rifle556: [[F.arReload, 1.65, 1.88, { mode: 'peak', post: 0.06, semis: 1 }], [F.arVarious, 4.24, 4.45, { mode: 'peak', post: 0.06, semis: 0.5 }], [F.m16reload, 4.75, 5.30, { mode: 'peak', post: 0.06, semis: 1 }]],
  shotgunAuto: [[F.akCock, 0.15, 0.71, { mode: 'peak', post: 0.09, semis: -4 }], [F.akCock, 2.18, 2.77, { mode: 'peak', post: 0.09, semis: -4.5 }], [F.uzi, 3.38, 3.70, { mode: 'peak', post: 0.09, semis: -4 }]],
  mg556: [[F.mgReload, 0.05, 0.28, { mode: 'peak', post: 0.08, semis: 0.5 }], [F.mgReload, 1.50, 1.85, { mode: 'peak', post: 0.08, semis: 1 }], [F.akCock, 4.40, 4.92, { mode: 'peak', post: 0.07, semis: 1 }]],
  mg762: [[F.mgReload, 1.50, 1.85, { mode: 'peak', post: 0.05, semis: 2 }], [F.mgReload, 0.05, 0.28, { mode: 'peak', post: 0.05, semis: 1.5 }], [F.arVarious, 2.83, 3.10, { mode: 'peak', post: 0.05, semis: 0 }]],
  sniper50: [[F.mauser, 1.15, 1.40, { mode: 'peak', post: 0.12, semis: -4 }], [F.mgReload, 1.50, 1.85, { mode: 'peak', post: 0.12, semis: -3 }], [F.akCock, 0.15, 0.71, { mode: 'peak', post: 0.12, semis: -5 }]],
};

// ---------------------------------------------------------------------------------------------- foley
// Viewmodel clip events play these 2D at vol 0.9 (game/src/player/clips.js); magDrop / shells / swings are spatial.
// Each sound: { lufs, n, variants: [[clip...], ...] (layers mixed per variant), spatial, range, voices, pitch, post }
// A clip: [id, start, end, opts] (see grab()) or a function (k, rng) => Buf for synthesized layers.
const FOLEY = {
  draw: { lufs: -22, variants: [[[F.unholster, 0, 1.11, { maxLen: 0.5 }]], [[F.unholster2, 0, 0.7, { maxLen: 0.5 }]], [[F.holster, 0, 0.8, { maxLen: 0.5, semis: 1 }]]] },
  drawHeavy: { lufs: -21, variants: [
    [[F.clothHeavy, 0, 0.6, { maxLen: 0.45 }], [F.arVarious, 2.20, 2.48, { mode: 'peak', post: 0.18, semis: -3, at: 0.12, gain: -3 }]],
    [[F.cloth1, 0.3, 1.0, { maxLen: 0.45 }], [F.mgReload, 0.05, 0.28, { mode: 'peak', post: 0.2, semis: -2, at: 0.1, gain: -2 }]],
    [[F.jacket, 0, 0.34], [F.akReload, 0.84, 1.27, { mode: 'peak', post: 0.18, semis: -2, at: 0.08, gain: -3 }]],
  ] },
  cloth: { lufs: -26, variants: [[[F.cloth1, 0.47, 1.0, { maxLen: 0.42 }]], [[F.clothHeavy, 0.1, 0.5]], [[F.jacket, 0, 0.34]], [[F.fabric, 0, 0.48]], [[F.cloth2, 0.0, 0.46, { fadeIn: 0.025, fadeOut: 0.14 }]]] },
  magRelease: { lufs: -24, variants: [[[F.arHardware, 13.43, 13.56, { mode: 'peak', pre: 0.004, post: 0.07 }]], [[F.arHardware, 15.08, 15.21, { mode: 'peak', pre: 0.004, post: 0.08 }]], [[F.glock, 5.87, 5.95, { mode: 'peak', pre: 0.004, post: 0.06 }]], [[F.glock, 26.95, 27.03, { mode: 'peak', pre: 0.004, post: 0.06 }]]] },
  magOut: { lufs: -22, variants: [[[F.m16reload, 0.38, 0.78]], [[F.arReload, 0.02, 0.39]], [[F.akReload, 0.14, 0.45]], [[F.uzi, 0.03, 0.5]]] },
  magIn: { lufs: -21, variants: [[[F.m16reload, 2.0, 2.84, { mode: 'peak', pre: 0.16, post: 0.2 }]], [[F.arReload, 0.57, 0.93, { mode: 'peak', pre: 0.12, post: 0.2 }]], [[F.akReload, 0.84, 1.28, { mode: 'peak', pre: 0.06, post: 0.2 }]], [[F.arReload2, 1.04, 1.47, { mode: 'peak', pre: 0.08, post: 0.2 }]]] },
  magDrop: { lufs: -21, spatial: true, range: [1.5, 25], voices: 3, pitch: [0.92, 1.08], variants: [
    [[K_('impactPlate_light_000'), 0, 1], [K_('impactGeneric_light_001'), 0, 1, { at: 0.07, gain: -8 }]],
    [[K_('impactPlate_light_002'), 0, 1], [K_('impactPlate_light_003'), 0, 1, { at: 0.11, gain: -10, semis: 2 }]],
    [[K_('impactMetal_light_001'), 0, 1, { semis: -3 }], [K_('impactGeneric_light_003'), 0, 1, { at: 0.05, gain: -6 }]],
    [[K_('impactPlate_medium_001'), 0, 1, { semis: 2 }], [K_('impactPlate_light_004'), 0, 1, { at: 0.09, gain: -9, semis: 3 }]],
  ] },
  pouch: { lufs: -25, variants: [
    [[F.fabric, 0, 0.48], [K_('impactSoft_medium_000'), 0, 1, { at: 0.06, gain: -6 }]],
    [[F.jacket, 0, 0.34], [K_('impactSoft_medium_002'), 0, 1, { at: 0.04, gain: -6 }]],
    [[F.cloth1, 0.4, 0.8], [K_('impactSoft_medium_003'), 0, 1, { at: 0.05, gain: -5 }]],
  ] },
  boltBack: { lufs: -22, variants: [[[F.arReload, 1.34, 1.57, { mode: 'peak', pre: 0.03, post: 0.15 }]], [[F.m16reload, 4.08, 4.62, { mode: 'first', post: 0.3 }]], [[F.mauser, 0.48, 0.74, { mode: 'peak', pre: 0.05, post: 0.15 }]], [[F.akCock, 0.15, 0.71, { mode: 'first', post: 0.22 }]]] },
  boltForward: { lufs: -21, variants: [[[F.arReload, 1.65, 1.88, { mode: 'peak', pre: 0.03, post: 0.17 }]], [[F.m16reload, 4.75, 5.30, { mode: 'peak', pre: 0.03, post: 0.25 }]], [[F.mauser, 1.0, 1.36, { mode: 'peak', pre: 0.1, post: 0.15 }]], [[F.akCock, 2.18, 2.77, { mode: 'peak', pre: 0.03, post: 0.2 }]]] },
  boltUp: { lufs: -24, variants: [[[F.mauser, 0.08, 0.39]], [[F.mosinBolt, 0.08, 0.28]], [[F.bolt22, 0.12, 0.29, { semis: -2 }]]] },
  boltDown: { lufs: -23, variants: [[[F.mauser, 1.44, 1.64]], [[F.mosinBolt, 1.14, 1.42, { mode: 'peak', post: 0.15 }]], [[F.bolt22, 1.28, 1.47, { semis: -2 }]]] },
  slideRelease: { lufs: -21, variants: [[[F.glock, 10.88, 11.08, { mode: 'peak', pre: 0.01, post: 0.14 }]], [[F.glock, 15.67, 15.85, { mode: 'peak', pre: 0.01, post: 0.14 }]], [[F.browning, 5.44, 5.79, { mode: 'peak', pre: 0.02, post: 0.16 }]], [[F.browning, 6.65, 7.02, { mode: 'peak', pre: 0.02, post: 0.16 }]]] },
  shellIn: { lufs: -22, variants: [[[F.sg4, 1.14, 1.81, { mode: 'peak', pre: 0.1, post: 0.17 }]], [[F.sg5, 0.45, 0.98, { mode: 'peak', pre: 0.1, post: 0.17 }]], [[F.sg5, 1.95, 2.6, { mode: 'peak', pre: 0.1, post: 0.17 }]], [[F.sgFirst, 0.34, 0.96, { mode: 'peak', pre: 0.1, post: 0.17 }]]] },
  pumpBack: { lufs: -21, variants: [[[F.sgRack, 0.6, 1.09, { mode: 'first', post: 0.2 }]], [[F.sgCock, 0.04, 0.48, { mode: 'first', post: 0.17 }]], [[F.m12, 4.24, 4.42, { mode: 'peak', pre: 0.02, post: 0.07, hp: 160, ch: 0 }]]] },
  pumpForward: { lufs: -20, variants: [[[F.sgRack, 0.6, 1.09, { mode: 'peak', pre: 0.03, post: 0.18 }]], [[F.sgCock, 0.04, 0.48, { mode: 'peak', pre: 0.03, post: 0.18 }]], [[F.m12, 4.76, 5.0, { mode: 'peak', pre: 0.05, post: 0.14, hp: 160, ch: 0 }]]] },
  breakOpen: { lufs: -22, variants: [
    [[F.lever, 0, 0.24, { semis: -4 }], [K_('impactMetal_heavy_000'), 0, 1, { semis: -5, gain: -10, at: 0.01 }]],
    [[F.lever, 0.3, 0.68, { mode: 'first', post: 0.22, semis: -4.5 }], [K_('impactMetal_heavy_002'), 0, 1, { semis: -6, gain: -10 }]],
    [[F.revolverCock, 1.55, 1.85, { semis: -6 }], [K_('impactMetal_heavy_001'), 0, 1, { semis: -5, gain: -9 }]],
  ] },
  breakClose: { lufs: -21, variants: [
    [[F.mauser, 1.15, 1.40, { mode: 'peak', post: 0.18, semis: -3 }], [K_('impactPlate_heavy_000'), 0, 1, { semis: -4, gain: -9, maxLen: 0.18 }]],
    [[F.akCock, 0.15, 0.71, { mode: 'peak', post: 0.18, semis: -3.5 }], [K_('impactPlate_heavy_002'), 0, 1, { semis: -4, gain: -9, maxLen: 0.18 }]],
    [[F.lever, 0.3, 0.68, { mode: 'peak', post: 0.2, semis: -3 }], [K_('impactPlate_heavy_003'), 0, 1, { semis: -3, gain: -10, maxLen: 0.18 }]],
  ] },
  coverOpen: { lufs: -22, variants: [[[F.mgReload, 0.91, 1.25]], [[F.arVarious, 3.43, 3.90, { semis: -4 }]], [[F.uzi, 1.95, 2.36, { semis: -3 }]]] },
  coverClose: { lufs: -20, variants: [[[F.mgReload, 1.51, 1.85, { mode: 'peak', pre: 0.03, post: 0.15 }]], [[F.arVarious, 2.83, 3.10, { mode: 'peak', pre: 0.02, post: 0.15, semis: -4 }]], [[F.akReload, 0.84, 1.28, { mode: 'peak', pre: 0.03, post: 0.15, semis: -3 }]]] },
  beltIn: { lufs: -22, variants: [
    [[F.mgReload, 0.05, 0.28], (k, r, lib, kit) => ({ buf: kit.jingle(0.28, 7, `belt_${k}`), gain: -7 })],
    [[F.bmgRound, 0, 0.33, { semis: -2 }], (k, r, lib, kit) => ({ buf: kit.jingle(0.3, 8, `belt_${k}`), gain: -7 })],
    [[F.arVarious, 0.2, 0.53, { semis: -2 }], (k, r, lib, kit) => ({ buf: kit.jingle(0.26, 6, `belt_${k}`), gain: -7 })],
  ] },
  craneOpen: { lufs: -24, variants: [[[F.revolverReload, 0.74, 0.97]], [[F.revolverCock, 0.33, 0.56]], [[F.revolverClicks, 0.07, 0.48, { mode: 'peak', post: 0.12 }]]] },
  craneClose: { lufs: -21, variants: [[[F.revolverClicks, 0.07, 0.48, { mode: 'peak', pre: 0.01, post: 0.14 }]], [[F.revolverCock, 1.55, 1.85, { mode: 'peak', pre: 0.01, post: 0.15 }]], [[F.revolverReload, 1.43, 1.66, { mode: 'peak', pre: 0.01, post: 0.14 }]]] },
  shellsDrop: { lufs: -23, variants: [[[F.revolverEject, 0, 1.5, { maxLen: 1.45, fadeOut: 0.2 }]], [[F.casings, 11.18, 11.94], [F.casings, 4.66, 5.27, { at: 0.06, gain: -3 }]], [[F.casing30, 0.45, 1.3], [F.casings, 8.51, 8.99, { at: 0.08, gain: -4 }]]] },
  speedloader: { lufs: -22, variants: [[[F.revolverReload, 1.43, 1.67], [F.revolverReload, 2.0, 2.17, { at: 0.16, gain: -3 }]], [[F.revolverReload, 2.0, 2.37]], [[F.revolverClicks, 0.23, 0.6]]] },
  rocketIn: { lufs: -21, variants: [
    [(k, r, lib, kit) => kit.scrape(0.32, 900, 2600, `rk_${k}`), [K_('impactPlate_heavy_001'), 0, 1, { semis: -5, at: 0.28 }], [K_('impactMetal_heavy_003'), 0, 1, { semis: -6, at: 0.29, gain: -6 }]],
    [(k, r, lib, kit) => kit.scrape(0.36, 700, 2200, `rk_${k}`), [K_('impactPlate_heavy_004'), 0, 1, { semis: -6, at: 0.32 }], [F.mgReload, 1.50, 1.85, { mode: 'peak', post: 0.15, semis: -5, at: 0.31, gain: -4 }]],
    [(k, r, lib, kit) => kit.scrape(0.28, 1000, 3000, `rk_${k}`), [K_('impactPlate_heavy_002'), 0, 1, { semis: -4, at: 0.25 }], [K_('impactMetal_heavy_004'), 0, 1, { semis: -5, at: 0.26, gain: -7 }]],
  ] },
  swing: { lufs: -22, spatial: true, range: [2, 30], voices: 3, pitch: [0.93, 1.07], variants: [
    [[F.swing1, 0, 1.1, { mode: 'peak', pre: 0.22, post: 0.14, hp: 250 }]], [[F.swooshFast, 0, 0.92, { mode: 'peak', pre: 0.2, post: 0.15, hp: 250 }]], [[F.sword, 0, 0.56, { hp: 350 }]], [(k, r, lib, kit) => kit.swish(0.28, 900, 4200, `sw_${k}`)], [(k, r, lib, kit) => kit.swish(0.32, 700, 3200, `sw_${k}`)],
  ] },
  swingHeavy: { lufs: -20, spatial: true, range: [3, 40], voices: 3, pitch: [0.94, 1.06], variants: [
    [[F.swing2, 0, 0.83, { semis: -3, hp: 150 }], (k, r, lib, kit) => ({ buf: kit.swish(0.5, 260, 1400, `swh_${k}`), gain: -3 })],
    [[F.swing1, 0, 1.1, { mode: 'peak', pre: 0.3, post: 0.2, semis: -4, hp: 150 }], (k, r, lib, kit) => ({ buf: kit.swish(0.55, 220, 1200, `swh_${k}`), gain: -3 })],
    [[F.swoosh, 0, 0.7, { mode: 'peak', pre: 0.25, post: 0.2, semis: -3, hp: 150 }], (k, r, lib, kit) => ({ buf: kit.swish(0.5, 240, 1300, `swh_${k}`), gain: -3 })],
  ] },
  dryfire: { lufs: -23, variants: [[[F.revolverDry, 8.55, 8.66, { mode: 'peak', post: 0.06 }]], [[F.revolverDry, 14.89, 14.99, { mode: 'peak', post: 0.06 }]], [[F.revolverDry, 8.81, 9.04, { mode: 'peak', post: 0.08 }]], [[F.arHardware, 1.60, 1.65, { gain: 0 }], (k, r, lib, kit) => kit.tick(`dry_${k}`, 3400)]] },
  lowAmmo: { lufs: -24, variants: [[(k, r, lib, kit) => kit.hollowClick(`low_${k}`, 1)], [(k, r, lib, kit) => kit.hollowClick(`low_${k}`, 1.06)], [(k, r, lib, kit) => kit.hollowClick(`low_${k}`, 0.95)]] },
  shell_brass: { lufs: -27, spatial: true, range: [1, 14], voices: 6, pitch: [0.9, 1.1], variants: [
    [[F.casing30, 0.45, 1.3, { maxLen: 0.7 }]], [[F.casing30, 2.88, 3.7, { maxLen: 0.7 }]], [[F.casing30, 7.07, 7.95, { maxLen: 0.7 }]],
    [[F.casings, 4.66, 5.27, { maxLen: 0.6 }]], [[F.casings, 11.18, 11.94, { maxLen: 0.7 }]], [[F.casingDrop, 9.92, 10.82, { maxLen: 0.7 }]],
  ] },
  shell_shotgun: { lufs: -26, spatial: true, range: [1, 14], voices: 4, pitch: [0.92, 1.08], variants: [
    [[F.sgEject, 1.08, 1.75, { maxLen: 0.6 }]], [[F.sgEject, 2.71, 3.45, { maxLen: 0.6 }]], [[F.sgEject, 6.52, 7.28, { maxLen: 0.6 }]], [[F.sgShells, 0.06, 0.95, { maxLen: 0.6 }]],
  ] },
  shell_link: { lufs: -29, spatial: true, range: [1, 12], voices: 6, pitch: [0.9, 1.12], variants: [
    [[F.casings, 0.09, 0.22, { semis: 4 }], [F.casings, 8.51, 8.63, { semis: 5, at: 0.07, gain: -8 }]],
    [[F.casings, 23.23, 23.34, { semis: 4 }], [F.casings, 26.28, 26.39, { semis: 6, at: 0.09, gain: -9 }]],
    [[F.casings, 26.28, 26.39, { semis: 3 }], [F.casings, 0.09, 0.22, { semis: 6, at: 0.06, gain: -10 }]],
    [[F.casings, 8.51, 8.63, { semis: 5 }], [F.casings, 23.23, 23.34, { semis: 7, at: 0.08, gain: -9 }]],
  ] },
};

// ---------------------------------------------------------------------------------------------- kit
export function makeKit(lib, ctx) {
  const { Buf } = lib;
  const shotCache = new Map();
  const rmsOf = (b) => { let s = 0, n = 0; for (const d of b.data) { for (let i = 0; i < d.length; i++) s += d[i] * d[i]; n += d.length; } return Math.sqrt(s / Math.max(1, n)); };
  const peakIdx = (b) => { let p = 0, pi = 0; for (const d of b.data) for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > p) { p = a; pi = i; } } return { p, pi }; };

  /** Index of the first sample above rel * (peak of the first `win` samples). */
  function onsetIdx(buf, rel = 0.2, win = buf.length) {
    const n = Math.min(buf.length, win);
    let p = 0;
    for (const d of buf.data) for (let i = 0; i < n; i++) { const a = Math.abs(d[i]); if (a > p) p = a; }
    const th = p * rel;
    for (let i = 0; i < n; i++) for (const d of buf.data) if (Math.abs(d[i]) > th) return i;
    return 0;
  }

  /** One channel (0 = left, 1 = right) as a mono Buf (mono sources return their only channel). */
  const chan = (buf, c) => new Buf([buf.data[Math.min(c, buf.channels - 1)].slice()], buf.sampleRate);

  /** Load a shot `dur` s long, aligned so the blast starts 0.6 ms in (searches 50 ms from t - 12 ms). */
  async function loadShot(id, t, dur, { semis = 0, stack } = {}) {
    const key = `${id}@${t}@${dur}@${semis}@${stack ? stack.join(',') : ''}`;
    if (shotCache.has(key)) return shotCache.get(key);
    const t0 = Math.max(0, t - 0.012);
    let raw = await ctx.load(id, { start: t0, end: t + dur * 1.2 + 0.05 });
    if (raw.channels === 1) raw = lib.toStereo(raw);
    const i0 = onsetIdx(raw, 0.2, Math.round(0.05 * SR));
    raw = lib.sliceSamples(raw, Math.max(0, i0 - Math.round(0.0006 * SR)), raw.length);
    raw = lib.fadeIn(raw, 0.0004, 'sine');
    if (semis) raw = lib.varispeedSemis(raw, semis);
    raw = lib.fitLength(raw, dur);
    if (stack) { // a second recording layered on top (double-barrel weight)
      const [sid, st, gDb, delay, sSemis = 0] = stack;
      const s2 = await loadShot(sid, st, dur, { semis: sSemis });
      raw = lib.mix([{ buf: raw }, { buf: lib.scale(s2, rmsOf(lib.slice(raw, 0, 0.08)) / Math.max(1e-9, rmsOf(lib.slice(s2, 0, 0.08)))), gain: gDb, at: delay }], { length: dur, channels: 2 });
    }
    if (shotCache.size > 24) shotCache.delete(shotCache.keys().next().value);
    shotCache.set(key, raw);
    return raw;
  }

  /** Short sharp crack (muzzle transient restorer): band-limited noise burst, a few ms. */
  const crack = (seed, { dur = 0.012, decay = 0.0035, hp = 1800, lp = 15000 } = {}) => lib.noiseBurst({ dur, attack: 0.0002, decay, hp, lp, seed });

  /** Supersonic N-wave snap (sniper crack). */
  function nWave(ms = 1.1, seed = 'nw') {
    const n = Math.round(ms / 1000 * SR), o = new Float32Array(n + 64);
    for (let i = 0; i < n; i++) o[i] = 1 - 2 * (i / n);
    const b = lib.eq(new Buf([o], SR), [{ type: 'hp', f: 900, order: 2 }, { type: 'lp', f: 16000, order: 2 }]);
    return lib.mix([b, { buf: crack(seed, { dur: 0.006, decay: 0.0015, hp: 3000 }), gain: -6 }]);
  }

  /**
   * Drive into the soft clipper just hard enough that the result's peak-to-loudness ratio (true peak - LUFS) is
   * `plr` dB: the final loudness stage (-12 LUFS at -1 dBTP => PLR ~11) then needs almost no limiting, and every
   * variant gets the same density whatever its source level. Search on the drive (dB), see below.
   */
  function clipToPLR(m, plr, { min = 3, max = 22, threshold = -10, lp = 17000 } = {}) {
    const n0 = lib.normalizePeak(m, 0);
    const run = (drive) => {
      let o = lib.softClip(lib.gain(n0, drive), { threshold, ceiling: -1, strict: true });
      // DC from asymmetric clipping (1st-order 12 Hz HP: barely moves peaks) + band-limit to 17 kHz: Vorbis q0.5
      // drops that band anyway, and clipper harmonics up there are what made the decoded file overshoot by 2-3 dB
      o = lib.eq(o, [{ type: 'hp1', f: 12 }, { type: 'lp', f: lp, order: 2 }]);
      return { o, p: lib.truePeakDb(o) - lib.lufs(o) };
    };
    // PLR(drive) is not monotonic: past a point, harder clipping raises the inter-sample overshoot faster than the
    // loudness. Coarse scan for the first drive that reaches the target (else keep the drive with the lowest PLR),
    // then refine by bisection.
    let prev = null, best = null, hit = null;
    for (let dv = min; dv <= max + 1e-9; dv += 2) {
      const r = run(dv);
      r.drive = dv;
      if (!best || r.p < best.p) best = r;
      if (r.p <= plr) { hit = r; break; }
      prev = r;
    }
    if (!hit) return best.o;
    if (!prev) return hit.o;
    let lo = prev.drive, hi = hit.drive;
    best = hit;
    for (let it = 0; it < 4; it++) {
      const mid = (lo + hi) / 2, r = run(mid);
      if (r.p > plr) lo = mid; else { hi = mid; best = r; }
    }
    return best.o;
  }

  // -------------------------------------------------------------------------------------------- close layer
  function designClose(G, shot, k, ch) {
    const C = G.close, r = ctx.rng(`${G.name}_close_${k}`);
    let d = chan(shot, ch ?? k % 2);
    const js = r.range(-0.25, 0.25);
    if (Math.abs(js) > 0.02) d = lib.varispeedSemis(d, js);
    d = lib.slice(d, 0, C.direct + 0.03);
    d = lib.eq(d, [{ type: 'hp', f: C.hp ?? 50, order: 4 }, ...(C.eq || [])]);
    d = lib.automate(d, (t) => (t < C.direct * 0.45 ? 1 : Math.exp(-(((t - C.direct * 0.45) / (C.direct * 0.32)) ** 1.5))));
    // clip the recorded transient FIRST (the source spikes are already clipped; shaving them buys loudness and
    // keeps the attack sharp instead of letting the final limiter duck the whole crack)
    d = lib.softClip(lib.gain(lib.normalizePeak(d, 0), C.clip ?? 6), { threshold: -10, ceiling: -1 });
    // designed layers are levelled against the recording's ENERGY (not its peak): gain in dB relative to the
    // recording's RMS over the same window
    const lay = (buf, dB, win) => ({ buf, gainLin: (rmsOf(lib.slice(d, 0, win)) / Math.max(1e-9, rmsOf(lib.slice(buf, 0, win)))) * lib.db2lin(dB) });
    const layers = [{ buf: d }];
    if (C.crack != null) layers.push(lay(crack(`${G.name}_cr_${k}`), C.crack + r.range(-1, 1), 0.006));
    if (C.nwave != null) layers.push(lay(nWave(1.0 + r.range(-0.15, 0.15), `${G.name}_nw_${k}`), C.nwave, 0.003));
    if (C.blast != null) layers.push(lay(lib.noiseBurst({ dur: 0.06, attack: 0.0003, decay: 0.03, hp: 200, lp: 7000, color: 'pink', seed: `${G.name}_bl_${k}` }), C.blast, 0.03));
    if (C.body) {
      const B = C.body, f = 1 + r.range(-0.06, 0.06);
      const body = lib.eq(lib.thump({ f0: B.f0 * f, f1: B.f1 * f, sweep: B.sweep ?? 0.015, decay: B.decay, click: 0, drive: B.drive ?? 2.5, seed: `${G.name}_body_${k}` }), [{ type: 'hp', f: 70, order: 2 }]);
      layers.push(lay(body, B.gain + r.range(-0.8, 0.8), 0.05));
    }
    if (C.sub) {
      const S = C.sub;
      layers.push(lay(lib.thump({ f0: S.f0, f1: S.f1, sweep: S.sweep ?? 0.035, decay: S.decay, click: 0, drive: 1.2, seed: `${G.name}_sub_${k}` }), S.gain + r.range(-1, 1), 0.08));
    }
    let m = lib.normalizePeak(lib.mix(layers), 0);
    // parallel ("New York") compression: a crushed copy under the dry layers = dense body, intact crack. Fast
    // release: the gain recovers as the blast decays, so the body sustains; lookahead + pre-roll stop the first
    // transient from overshooting
    const Cp = { threshold: -26, ratio: 6, attack: 0.0008, release: 0.015, knee: 6, makeup: 15, mix: 0.55, lookahead: 0.002, ...(C.comp || {}) };
    if (Cp.mix > 0) {
      const pre = 0.004;
      const crushed = lib.slice(lib.compress(lib.pad(m, pre, 0), { threshold: Cp.threshold, ratio: Cp.ratio, attack: Cp.attack, release: Cp.release, knee: Cp.knee, makeup: Cp.makeup, lookahead: Cp.lookahead }), pre);
      m = lib.mix([{ buf: m, gainLin: 1 - Cp.mix * 0.5 }, { buf: crushed, gainLin: Cp.mix }]);
    }
    m = lib.psychoBass(m, { freq: 120, amount: C.psycho ?? -10 });
    m = lib.exciter(m, { freq: C.exFreq ?? 2500, drive: 10, amount: C.excite ?? -12 });
    m = lib.stereoize(m, { width: C.width ?? 0.3, hp: 350, seed: `${G.name}_st_${k}` });
    if (C.room) m = lib.reverb(m, 'smallRoom', { wet: C.room, seed: `${G.name}_room_${k}`, length: 0.4 });
    m = lib.slice(m, 0, C.len);
    m = lib.automate(m, (t) => (t < C.len * 0.3 ? 1 : Math.pow(1 - (t - C.len * 0.3) / (C.len * 0.7), 2.2)));
    // tone (phone-first: keep the 0.6-3 kHz bark level with the low-mids), then remove what no speaker plays —
    // BEFORE the clipper: the clipper is the last waveform-shaping stage (filtering after it re-creates overshoot)
    m = lib.eq(m, [...(C.post || [{ type: 'peak', f: 1700, gain: 3, q: 0.55 }]), { type: 'hp', f: C.finalHp ?? 38, order: 4 }]);
    if (C.bal) m = balance(m, C.bal, C.balAmount ?? 0.75);
    // 3 ms of lead-in: the mastering stage's click-guard fade never touches the crack, and Vorbis' pre-echo of the
    // crack (half a short block) stays off sample 0 of the decoded file
    return lib.pad(clipToPLR(m, C.plr ?? 10.3, { min: C.minDrive ?? 3, max: C.maxDrive ?? 22, threshold: C.clipTh ?? -16 }), C.leadIn ?? 0.003, 0);
  }

  /**
   * Codec-aware pre-master for dense close layers. Clipped, transient-heavy gunshots overshoot by 1-3 dB through
   * Vorbis (pre-echo on the crack), differently per variant. Master to the target loudness, encode + decode, measure
   * this variant's own overshoot, and re-master with exactly that much extra headroom (fast-release true-peak
   * limiter), so cat.add() finds the file already at target and the DECODED file lands at ~-1 dBTP without a
   * loudness-eating post-encode rescale.
   */
  async function codecSafe(buf, lufs, { release = 0.02, quality = CLOSE_QUALITY, maxLimDb = 3 } = {}) {
    // (the final encode in cat.add() sees a marginally different buffer, so keep ~0.3 dB of safety)
    // Limiting is capped: these layers are already clipped flat, so each dB the ceiling drops costs 3-5 dB of
    // limiting (sniper338: ceiling -1.4 -> -3.1 took the limiter from 0.9 to 8.9 dB — a squashed crack the category QA
    // never saw, because cat.add() found the file already at target). Past `maxLimDb` keep the last master and let
    // cat.add()'s post-encode rescale take the residual overshoot out of the loudness instead (a few tenths of a LU).
    let ceil = -1.4, keep = null;
    for (let it = 0; it < 5; it++) {
      const out = lib.normalizeLufs(buf, lufs, { ceiling: ceil, limiter: { release }, maxIter: 16 });
      if (keep && out.meta.limitedDb > maxLimDb) break;
      const dec = await lib.decodeBytes(await lib.encodeOgg(out, { quality }), 'probe.ogg');
      const decTp = lib.truePeakDb(dec);
      keep = { out, ceil, decTp };
      if (decTp <= -1.3) break;
      ceil = Math.min(ceil - 0.1, -1.3 - (decTp - lib.truePeakDb(out)));
    }
    const { out, decTp } = keep;
    codecLog.push({ lufs: Math.round(out.meta.lufs * 100) / 100, ceiling: Math.round(keep.ceil * 100) / 100, limitedDb: Math.round(out.meta.limitedDb * 100) / 100, decTp: Math.round(decTp * 100) / 100 });
    return out;
  }
  const codecLog = [];

  // -------------------------------------------------------------------------------------------- tonal balance
  const BANDS = [['sub', 20, 60], ['low', 60, 150], ['lowMid', 150, 600], ['mid', 600, 3000], ['high', 3000, 8000], ['air', 8000, 20000]];
  /** Energy share of each band in dB (same bands as analysis.measure().bandsDb). */
  function bandShares(buf) {
    const { freqs, power } = lib.averageSpectrum(buf, { size: 2048 });
    const e = Object.fromEntries(BANDS.map(([k]) => [k, 1e-12]));
    let tot = 1e-12;
    for (let i = 1; i < power.length; i++) { tot += power[i]; for (const [k, lo, hi] of BANDS) if (freqs[i] >= lo && freqs[i] < hi) e[k] += power[i]; }
    return Object.fromEntries(Object.entries(e).map(([k, v]) => [k, 10 * Math.log10(v / tot)]));
  }
  /**
   * Partial spectral matching towards a per-weapon band-share target (dB): big recordings (boomy rifles/shotguns)
   * get their low end reined in and their 0.6-8 kHz presence restored so they still read on phone speakers, while
   * `amount` < 1 keeps each recording's own colour. The mid band (600-3k) is the reference.
   */
  function balance(buf, target, amount = 0.65, iters = 2) {
    const EQ = { sub: { type: 'lowshelf', f: 55 }, low: { type: 'peak', f: 100, q: 1.1 }, lowMid: { type: 'peak', f: 300, q: 0.8 }, high: { type: 'peak', f: 4800, q: 0.9 }, air: { type: 'highshelf', f: 9500 } };
    let b = buf;
    for (let it = 0; it < iters; it++) {
      const s = bandShares(b);
      const ref = (target.mid ?? -5) - s.mid;
      const specs = [];
      for (const [k, spec] of Object.entries(EQ)) {
        if (target[k] === undefined) continue;
        const g = Math.max(-10, Math.min(6, ((target[k] - s[k]) - ref) * amount));
        if (Math.abs(g) > 0.3) specs.push({ ...spec, gain: g });
      }
      if (!specs.length) break;
      b = lib.eq(b, specs);
    }
    return b;
  }

  // -------------------------------------------------------------------------------------------- tail layer
  function designTail(G, shot, k) {
    const T = G.tail, C = G.close, L = T.len;
    const from = C.direct * 0.85;
    let rec = lib.slice(shot, from, from + L);
    rec = lib.eq(rec, [{ type: 'hp', f: T.hp ?? 90, order: 2 }, { type: 'lp', f: T.lp ?? 9000, order: 2 }, { type: 'lowshelf', f: 220, gain: -2 }]);
    rec = lib.fadeIn(rec, 0.035, 'sine');
    const head = lib.eq(lib.slice(chan(shot, k % 2), 0, C.direct), [{ type: 'hp', f: 60, order: 2 }]);
    const syn = lib.gunTail(head, { env: T.env ?? 'urban', length: L, head: Math.min(0.12, C.direct), seed: `${G.name}_tail_${k}`, darken: T.darken ?? 40, hp: 70 });
    const g = rmsOf(syn) / Math.max(1e-9, rmsOf(rec)) * lib.db2lin(T.rec ?? 0);
    let t = lib.mix([{ buf: syn }, { buf: rec, gainLin: g, at: Math.max(0, from - 0.015) }], { length: L, channels: 2 });
    t = lib.automate(t, (x) => (x < L * 0.45 ? 1 : Math.cos(((x - L * 0.45) / (L * 0.55)) * Math.PI / 2) ** 2));
    return t;
  }

  // -------------------------------------------------------------------------------------------- far layer
  function designFar(G, src, k, isMid) {
    const Fr = G.far, L = Fr.len ?? 2;
    const m = lib.eq(chan(src, k % 2), [{ type: 'hp', f: 70, order: 2 }]);
    let out;
    if (isMid) {
      // the mid-distance take already holds real distance + reflections: push it further (air + more reflections)
      const body = lib.airAbsorption(lib.slice(m, 0, L), Fr.dist * 0.7);
      const refl = lib.toMono(lib.gunTail(lib.slice(m, 0, 0.25), { env: Fr.env ?? 'urban', length: Math.max(L, 0.6), head: 0.12, seed: `${G.name}_fart_${k}`, stereo: false, darken: Fr.dist * 0.6 }));
      const g = rmsOf(body) / Math.max(1e-9, rmsOf(refl)) * lib.db2lin(Fr.refl ?? -3);
      out = lib.mix([{ buf: body }, { buf: refl, gainLin: g, at: 0.01 }], { length: L, channels: 1 });
      out = lib.eq(out, [{ type: 'lowshelf', f: 220, gain: 3 }, { type: 'peak', f: 900, gain: 1.5, q: 0.8 }]);
    } else {
      out = lib.farLayer(lib.slice(m, 0, 0.3), { distance: Fr.dist, env: Fr.env ?? 'urban', seed: `${G.name}_far_${k}`, length: L });
    }
    out = lib.automate(out, (x) => (x < L * 0.4 ? 1 : Math.cos(((x - L * 0.4) / (L * 0.6)) * Math.PI / 2) ** 2));
    // tame the first transient so the -22 LUFS stage does not lean on the limiter; 5 ms lead-in keeps the codec's
    // pre-echo of the distant blast off sample 0 (a step there clicks; 5 ms is nothing next to 120 ms+ of travel time)
    return lib.pad(clipToPLR(out, Fr.plr ?? 19, { min: 0, max: 12 }), 0.005, 0);
  }

  // -------------------------------------------------------------------------------------------- clips (foley)
  /**
   * Load a slice of a source as mono and cut it: mode 'whole' (trim silence), 'peak' (from `pre` before the
   * loudest sample to `post` after it), 'first' (from the first onset to `post` after it). Options: semis, hp, lp,
   * maxLen (s, fade out), trimDb, gain/at (used by the layer mixer).
   */
  async function grab(id, start, end, o = {}) {
    // `ch`: take one mic of a spaced pair (FFSL near takes: averaging L/R comb-filters) instead of the mono downmix
    let b = o.ch != null ? chan(await ctx.load(id, { start, end }), o.ch) : await ctx.load(id, { start, end, channels: 1 });
    if (o.mode === 'peak' || o.mode === 'first') {
      const { p, pi } = peakIdx(b);
      let i = pi;
      if (o.mode === 'first') { const th = p * lib.db2lin(o.rel ?? -14); i = 0; while (i < b.length && Math.abs(b.data[0][i]) < th) i++; }
      const pre = Math.round((o.pre ?? 0.006) * SR), post = Math.round((o.post ?? 0.12) * SR);
      // walk back from the hit to where it rises out of the floor (keeps the start of the transient)
      const a0 = Math.max(0, i - pre);
      b = lib.sliceSamples(b, a0, Math.min(b.length, i + post));
    }
    b = lib.trimSilence(b, { threshDb: o.trimDb ?? -48, pre: 0.002, post: 0.03, fadeOutSec: 0.015 });
    if (o.semis) b = lib.varispeedSemis(b, o.semis);
    if (o.maxLen && b.duration > o.maxLen) b = lib.fadeOut(lib.slice(b, 0, o.maxLen), Math.min(0.12, o.maxLen * 0.35), 'exp');
    b = lib.eq(b, [{ type: 'hp', f: o.hp ?? 70, order: 2 }, ...(o.lp ? [{ type: 'lp', f: o.lp, order: 2 }] : [])]);
    // fade-out scaled to the clip (a fixed 12 ms fade on a clip cut while still sounding ends with an audible chop)
    if (o.fadeIn) b = lib.fadeIn(b, o.fadeIn, 'sine');
    b = lib.fade(b, 0.001, o.fadeOut ?? Math.min(0.06, Math.max(0.012, b.duration * 0.18)));
    return lib.normalizePeak(b, -1);
  }

  /** Build one foley variant from layer specs (clips or synth functions), each layer peak-normalised then gained. */
  async function layered(specs, k, seed, kit) {
    const r = ctx.rng(seed);
    const parts = [];
    for (const s of specs) {
      let b, at = 0, gain = 0;
      if (typeof s === 'function') { b = s(k, r, lib, kit); if (!(b instanceof lib.Buf)) ({ buf: b, at = 0, gain = 0 } = b); }
      else { const [id, a, z, o = {}] = s; b = await grab(id, a, z, o); at = o.at ?? 0; gain = o.gain ?? 0; }
      parts.push({ buf: lib.normalizePeak(b, -1), at, gain });
    }
    let m = lib.mix(parts);
    m = lib.trimSilence(m, { threshDb: -55, pre: 0.001, post: 0.03, fadeOutSec: 0.01 });
    // 4 ms lead-in: most foley starts on its transient, and Vorbis smears a few ms of pre-echo in front of it, which
    // would otherwise land on sample 0 of the decoded file as a step (click)
    return lib.pad(m, 0.004, 0);
  }

  // -------------------------------------------------------------------------------------------- synth foley bits
  /** Tiny metal jingle (belt links): `count` short pitched pings spread over `dur`. */
  function jingle(dur, count, seed) {
    const r = lib.rng(lib.hashSeed(seed));
    const parts = [];
    for (let i = 0; i < count; i++) {
      const base = 2400 + r.next() * 3200;
      const p = lib.partials(0.08, { base, list: [[1, 1, 0.03], [1.62, 0.5, 0.02], [2.71, 0.3, 0.012]], seed: `${seed}_${i}` });
      parts.push({ buf: lib.mix([p, { buf: lib.noiseBurst({ dur: 0.01, decay: 0.002, hp: 3000, seed: `${seed}_n${i}` }), gain: -6 }]), at: (i / count) * dur * 0.8 + r.next() * 0.02, gain: -3 - r.next() * 9 });
    }
    return lib.mix(parts);
  }
  /** Metal-on-metal slide (rocket into tube). */
  function scrape(dur, f0, f1, seed) {
    const n = lib.noise(dur, { color: 'pink', seed });
    const s = lib.sweep(n, 'bp', (t) => f0 * Math.pow(f1 / f0, t / dur), { q: 4 });
    const grit = lib.crackle(dur, { density: 90, decay: 0.002, hp: 2500, seed: `${seed}_g` });
    const env = lib.envCurve(dur, [[0, 0], [dur * 0.15, 1], [dur * 0.85, 0.8], [dur, 0]]);
    return lib.applyEnv(lib.mix([s, { buf: grit, gain: -16 }]), env);
  }
  /** Air swish (knife / melee). */
  function swish(dur, f0, f1, seed) {
    const w = lib.whoosh({ dur, f0, f1, q: 1.8, seed });
    const hi = lib.whoosh({ dur: dur * 0.8, f0: f0 * 3, f1: f1 * 2.5, q: 3, seed: `${seed}_h` });
    return lib.mix([w, { buf: hi, at: dur * 0.12, gain: -9 }]);
  }
  /** A small dry trigger tick. */
  function tick(seed, f = 3000) {
    return lib.mix([lib.noiseBurst({ dur: 0.02, decay: 0.003, bp: f, q: 3, seed }), { buf: lib.partials(0.03, { base: f * 0.8, list: [[1, 1, 0.008], [2.3, 0.4, 0.005]], seed: `${seed}_p` }), gain: -8 }]);
  }
  /** Low-ammo cue: a hollow, slightly higher-pitched spring click (CS-style "almost empty" tick). */
  function hollowClick(seed, k = 1) {
    const ping = lib.partials(0.14, { base: 1850 * k, list: [[1, 1, 0.06], [1.48, 0.45, 0.04], [2.6, 0.25, 0.02]], seed: `${seed}_p` });
    const tok = lib.partials(0.1, { base: 640 * k, list: [[1, 1, 0.045], [2.05, 0.3, 0.03]], seed: `${seed}_t` });
    const clk = lib.noiseBurst({ dur: 0.012, decay: 0.0025, bp: 2600 * k, q: 2.5, seed: `${seed}_c` });
    return lib.eq(lib.mix([{ buf: clk }, { buf: ping, gain: -9, at: 0.001 }, { buf: tok, gain: -7 }]), [{ type: 'hp', f: 300, order: 2 }]);
  }

  return { codecLog, onsetIdx, chan, loadShot, crack, nWave, rmsOf, clipToPLR, balance, codecSafe, designClose, designTail, designFar, grab, layered, jingle, scrape, swish, tick, hollowClick };
}

// ---------------------------------------------------------------------------------------------- specials
/** Minigun extras: spin loop (motor whine; the game varies its playbackRate 0.6-1.1), spin-down, firing loop. */
async function minigunExtras(lib, ctx, cat, K) {
  // motor: a steady stretch of a real electric motor + synthesized gear whine and barrel-cluster rattle
  const motor = lib.eq(await ctx.load(F.motor, { start: 3.0, end: 6.2, channels: 1 }), [{ type: 'hp', f: 150, order: 2 }, { type: 'peak', f: 2200, gain: 2, q: 0.8 }]);
  const L = 3.0;
  const whine = lib.mix([
    { buf: lib.tone(L, { type: 'saw', freq: (t) => 410 * (1 + 0.004 * Math.sin(2 * Math.PI * 3.1 * t)) }), gain: -8 },
    { buf: lib.tone(L, { type: 'sine', freq: (t) => 1230 * (1 + 0.003 * Math.sin(2 * Math.PI * 2.3 * t)) }), gain: -14 },
  ]);
  const whineF = lib.eq(whine, [{ type: 'bp', f: 900, q: 0.7 }]);
  // barrel cluster rattle: band-passed noise amplitude-modulated at the barrel passing rate (~48 Hz)
  const rat = lib.eq(lib.noise(L, { color: 'pink', seed: 'mg_rat' }), [{ type: 'bp', f: 1800, q: 1.2 }]);
  const am = new Float32Array(rat.length);
  for (let i = 0; i < am.length; i++) { const t = i / SR; am[i] = 0.55 + 0.45 * Math.max(0, Math.sin(2 * Math.PI * 48 * t)) ** 3; }
  const rattle = lib.applyEnv(rat, am);
  const air = lib.eq(lib.noise(L, { color: 'pink', seed: 'mg_air' }), [{ type: 'bp', f: 600, q: 0.8 }]);
  let spin = lib.mix([{ buf: lib.fitLength(motor, L), gain: 0 }, { buf: whineF, gain: -6 }, { buf: rattle, gain: -10 }, { buf: air, gain: -16 }], { length: L });
  spin = lib.loopCrossfade(spin, 0.6);
  await cat.add('minigun_spin', spin, { lufs: -22, loop: true, spatial: false, channels: 1, voices: 1, pitch: [1, 1], sources: [F.motor] });
  // spin-down: the loop decelerating to a stop + a final mechanical settle
  const long = lib.concat([spin, spin]);
  let down = lib.varispeedCurve(long, [[0, 1.05], [0.5, 0.75], [1.0, 0.42], [1.5, 0.18], [1.9, 0.08]], { maxSeconds: 2 });
  down = lib.slice(down, 0, 1.9);
  down = lib.automate(down, [[0, 0], [0.9, -4], [1.5, -14], [1.9, -40]]);
  const clunk = await K.grab(F.mgReload, 1.50, 1.85, { mode: 'peak', post: 0.18, semis: -3 });
  down = lib.mix([{ buf: down }, { buf: clunk, at: 1.25, gain: -16 }]);
  down = lib.fadeOut(down, 0.25, 'exp');
  await cat.add('minigun_spindown', down, { lufs: -23, spatial: false, channels: 1, voices: 1, pitch: [0.98, 1.02], sources: [F.motor, F.mgReload] });
  // firing loop (not wired yet: the game currently plays minigun_close per round): 40 rounds/s of short pops
  // over a crushed rumble bed, seamless 1.2 s loop
  const G = GUNS.find((g) => g.name === 'minigun');
  const pops = [];
  for (let k = 0; k < 6; k++) { const s = G.near[k]; const shot = await K.loadShot(s[0], s[1], 0.6, s[2] || {}); pops.push(lib.toMono(K.designClose(G, shot, k + 10))); }
  const r = ctx.rng('minigun_fire');
  const FL = 1.8, layers = [];
  for (let t = 0, i = 0; t < FL; t += 0.025, i++) layers.push({ buf: pops[r.int(0, pops.length - 1)], at: t + r.range(-0.002, 0.002), gain: r.range(-2.5, 0) });
  let fire = lib.mix(layers, { length: FL + 0.1 });
  const bed = lib.eq(lib.reverb(fire, 'urban', { wet: 0.25, dry: 0, seed: 'mg_bed', channels: 1 }), [{ type: 'lp', f: 2500, order: 2 }]);
  fire = lib.mix([{ buf: fire }, { buf: lib.toMono(bed), gain: -4 }], { length: FL, channels: 1 });
  fire = lib.loopCrossfade(lib.stereoize(fire, { width: 0.3, seed: 'mg_fire' }), 0.4);
  fire = K.clipToPLR(fire, 9, { min: 0, max: 12 });
  await cat.add('minigun_fire', fire, { target: 'gunClose', loop: true, spatial: false, channels: 2, voices: 1, pitch: [1, 1], vol: 0.8, note: 'optional sustained-fire loop (not referenced by the game yet)' });
}

/** Rocket launcher: launch close/tail/far + looping motor for the projectile (rocket_fly). */
async function rocketSet(lib, ctx, cat, K) {
  const closes = [], tails = [], fars = [];
  const launches = [[F.rocketLaunch, 0, 1.2], [F.missile, 0, 1.25], [F.atMissile, 9.98, 11.4]];
  for (let k = 0; k < 3; k++) {
    const r = ctx.rng(`rocket_${k}`);
    const [id, a, z] = launches[k];
    let rec = lib.eq(await ctx.load(id, { start: a, end: z, channels: 1 }), [{ type: 'hp', f: 60, order: 2 }]);
    rec = lib.normalizePeak(lib.trimSilence(rec, { threshDb: -40, pre: 0.002, end: false }), -1);
    // tube "thoomp": back-blast thump + a broadband ignition blast, then the motor roar ramps up and away
    const thump = lib.thump({ f0: 130, f1: 55, sweep: 0.025, decay: 0.18, drive: 3, seed: `rk_th_${k}` });
    const blast = lib.noiseBurst({ dur: 0.25, attack: 0.0005, decay: 0.09, hp: 150, lp: 8000, color: 'pink', seed: `rk_bl_${k}` });
    const roarN = lib.eq(lib.noise(1.1, { color: 'pink', seed: `rk_roar_${k}` }), [{ type: 'bp', f: 900, q: 0.6 }]);
    const roar = lib.applyEnv(lib.mix([roarN, { buf: lib.crackle(1.1, { density: 140, decay: 0.003, hp: 1200, seed: `rk_cr_${k}` }), gain: -6 }]), lib.envCurve(1.1, [[0, 0], [0.05, 1], [0.35, 0.8], [1.1, 0]]));
    let m = lib.mix([{ buf: thump, gain: -8 }, { buf: blast, gain: -4 }, { buf: rec, at: 0.004, gain: 0 }, { buf: roar, at: 0.03, gain: -6 + r.range(-1, 1) }], { length: 1.1 });
    m = lib.psychoBass(m, { freq: 120, amount: -8 });
    m = lib.stereoize(m, { width: 0.4, seed: `rk_st_${k}` });
    m = lib.reverb(m, 'smallRoom', { wet: 0.16, seed: `rk_room_${k}`, length: 0.4 });
    m = lib.slice(m, 0, 1.0);
    m = lib.automate(m, (t) => (t < 0.35 ? 1 : Math.pow(1 - (t - 0.35) / 0.65, 2)));
    m = lib.eq(m, [{ type: 'peak', f: 1500, gain: 2, q: 0.6 }, { type: 'hp', f: 36, order: 4 }]);
    m = K.balance(m, { sub: -12, low: -6, lowMid: -5, mid: -5, high: -10, air: -15 }, 0.6);
    closes.push(await K.codecSafe(lib.pad(K.clipToPLR(m, 11.5), 0.003, 0), -12)); // lead-in: codec pre-echo off sample 0
    const head = lib.slice(lib.toMono(m), 0, 0.25);
    tails.push(lib.automate(lib.gunTail(head, { env: 'urban', length: 2.2, head: 0.2, seed: `rk_tail_${k}`, darken: 40 }), (x) => (x < 1 ? 1 : Math.cos(((x - 1) / 1.2) * Math.PI / 2) ** 2)));
    fars.push(lib.pad(K.clipToPLR(lib.farLayer(lib.slice(lib.toMono(m), 0, 0.6), { distance: 200, env: 'urban', seed: `rk_far_${k}`, length: 2.4 }), 19, { min: 0, max: 12 }), 0.005, 0));
  }
  const srcs = launches.map((l) => l[0]);
  await cat.add('rocket_close', closes, { target: 'gunClose', quality: CLOSE_QUALITY, limiter: { release: 0.02 }, spatial: true, range: [12, 60], channels: 2, voices: 2, pitch: [0.97, 1.03], priority: 3, maxLimitDb: 6, sources: srcs });
  await cat.add('rocket_tail', tails, { target: 'gunTail', spatial: false, channels: 2, voices: 2, pitch: [0.98, 1.02], sources: srcs });
  await cat.add('rocket_far', fars, { target: 'gunFar', spatial: true, range: [40, 500], voices: 3, pitch: [0.96, 1.04], priority: 2, sources: srcs });
  // projectile motor: the sustained roar of a real anti-tank missile + crackle, seamless loop, mono / spatial
  const L = 2.4;
  let roar = lib.eq(await ctx.load(F.atMissile, { start: 1.2, end: 1.2 + L + 0.8, channels: 1 }), [{ type: 'hp', f: 80, order: 2 }, { type: 'peak', f: 1200, gain: 2, q: 0.7 }]);
  roar = lib.normalizePeak(roar, -1);
  const fizz = lib.eq(lib.crackle(L + 0.8, { density: 220, decay: 0.002, hp: 1500, seed: 'rk_fly_cr' }), [{ type: 'lp', f: 9000, order: 2 }]);
  const rumble = lib.eq(lib.noise(L + 0.8, { color: 'brown', seed: 'rk_fly_rb' }), [{ type: 'lp', f: 220, order: 2 }, { type: 'hp', f: 45, order: 2 }]);
  let fly = lib.mix([{ buf: roar }, { buf: fizz, gain: -14 }, { buf: lib.normalizePeak(rumble, -1), gain: -12 }], { length: L + 0.8 });
  fly = lib.loopCrossfade(fly, 0.8);
  await cat.add('rocket_fly', fly, { lufs: -18, loop: true, spatial: true, channels: 1, range: [4, 140], voices: 4, pitch: [0.97, 1.03], sources: [F.atMissile] });
}

/** Knife set (remote players' melee "shots" use <sound>_close/_far; the local knife plays swing/swingHeavy). */
async function knifeSet(lib, ctx, cat, K) {
  const closes = [], tails = [], fars = [];
  const clips = [[F.knifeWhoosh, 0, 1.32], [F.sword, 0, 0.56], [F.swooshFast, 0, 0.92], [F.swing1, 0, 1.1]];
  for (let k = 0; k < clips.length; k++) {
    const [id, a, z] = clips[k];
    const w = await K.grab(id, a, z, { maxLen: 0.4, hp: 200 });
    const syn = K.swish(0.3, 900, 4200, `kn_${k}`);
    closes.push(lib.mix([{ buf: w }, { buf: lib.normalizePeak(syn, -1), gain: -8 }]));
    if (k < 2) {
      fars.push(lib.eq(lib.mix([{ buf: w }, { buf: lib.normalizePeak(syn, -1), gain: -6 }]), [{ type: 'lp', f: 2500, order: 2 }, { type: 'hp', f: 200, order: 2 }]));
      tails.push(lib.fadeIn(lib.toMono(lib.reverb(lib.slice(w, 0, 0.2), 'alley', { wet: 1, dry: 0, seed: `kn_t_${k}`, length: 0.5, channels: 1 })), 0.02));
    }
  }
  const srcs = clips.map((c) => c[0]);
  await cat.add('knife_close', closes, { lufs: -22, spatial: true, channels: 1, range: [2, 30], voices: 3, pitch: [0.94, 1.06], sources: srcs });
  await cat.add('knife_tail', tails, { lufs: -32, spatial: false, channels: 1, voices: 2, pitch: [0.95, 1.05], maxHeadMs: 40, sources: srcs });
  await cat.add('knife_far', fars, { lufs: -30, spatial: true, channels: 1, range: [10, 40], voices: 2, pitch: [0.94, 1.06], sources: srcs });
}

// ---------------------------------------------------------------------------------------------- producer
export async function produce(lib, ctx) {
  const only = process.env.WEAPONS_ONLY ? new Set(process.env.WEAPONS_ONLY.split(',').map((s) => s.trim())) : null;
  const want = (n) => !only || only.has(n);
  const layersOnly = process.env.WEAPONS_LAYERS ? new Set(process.env.WEAPONS_LAYERS.split(',')) : null; // dev filter
  const wantLayer = (l) => !layersOnly || layersOnly.has(l);
  const cat = ctx.category('weapons', { bus: 'sfx' });
  const K = makeKit(lib, ctx);

  // ------------------------------------------------------------ guns: close / tail / far / mech
  for (const G of GUNS) {
    if (!want(G.name)) continue;
    ctx.log(`-- ${G.name}`);
    const M = G.mix || {};
    const closes = [], tails = [], fars = [];
    const srcIds = new Set();
    const near = G.near.map(([id, t, o = {}]) => ({ id, t, ...o }));
    const closeLufs = M.closeLufs ?? (G.close.len > 0.38 ? -12.5 : -12); // long closes: more energy at -12.5 than any rifle
    const preLog = [];
    // close: cycle through the shots, alternating the mic channel (spaced pair = two different takes)
    for (let k = 0; k < (wantLayer('close') ? G.close.n : 0); k++) {
      const s = near[k % near.length];
      const shot = await K.loadShot(s.id, s.t, Math.max(0.6, G.close.direct + 0.1), { semis: s.semis || 0, stack: s.stack });
      // codec-aware pre-master (see codecSafe). A few takes of the designed variant (different jitter seeds, same
      // shot + mic channel): keep the one Vorbis needs the least extra limiting for
      const base = k + Math.floor(k / near.length), ch = s.ch ?? base % 2;
      let best = null;
      for (let a = 0; a < 4; a++) {
        K.codecLog.length = 0;
        const m = await K.codecSafe(K.designClose(G, shot, base + a * 101, ch), closeLufs);
        const info = K.codecLog[0];
        const score = info.limitedDb + Math.max(0, info.decTp + 1.3) * 3 + (Math.abs(info.lufs - closeLufs) > 0.25 ? 50 : 0);
        if (!best || score < best.score) best = { m, info, score, a };
        if (score <= 2) break;
      }
      preLog.push(`lim ${best.info.limitedDb} dTP ${best.info.decTp} (take ${best.a + 1})`);
      closes.push(best.m);
      srcIds.add(s.id); if (s.stack) srcIds.add(s.stack[0]);
    }
    // tails from single shots only (bursts would carry the next rounds)
    const singles = near.filter((s) => !s.burst);
    for (let k = 0; k < (wantLayer('tail') ? G.tail.n : 0); k++) {
      const s = singles[k % singles.length];
      const shot = await K.loadShot(s.id, s.t, G.close.direct + G.tail.len + 0.1, { semis: s.semis || 0, stack: s.stack });
      tails.push(K.designTail(G, shot, k));
    }
    // far: mid-distance takes (real distance) when available
    const mid = (G.mid || []).map(([id, t, o = {}]) => ({ id, t, ...o }));
    for (let k = 0; k < (wantLayer('far') ? G.far.n : 0); k++) {
      const s = mid.length ? mid[k % mid.length] : singles[k % singles.length];
      const shot = await K.loadShot(s.id, s.t, Math.max(0.7, (G.far.len ?? 2) + 0.1), { semis: s.semis || 0 });
      fars.push(K.designFar(G, shot, k, !!mid.length));
      srcIds.add(s.id);
    }
    const sources = [...srcIds];
    if (process.env.WEAPONS_PREVIEW && closes.length && tails.length) { // dev: what the player hears (close + tail 15 ms later at 0.9)
      const c = lib.normalizeLufs(closes[0], -12, { ceiling: -1 }), t = lib.normalizeLufs(tails[0], -20, { ceiling: -1 });
      ctx.preview(`${G.name}_shot`, lib.mix([{ buf: c }, { buf: t, at: 0.015, gainLin: 0.9 }], { channels: 2 }));
    }
    if (preLog.length) ctx.log(`  pre-master ${G.name}_close: ${preLog.join(' | ')}`);
    // _close is spatial: the local shot is played without a position (2D, the stereo file as is), but teammates
    // within 40 m play the same name WITH a position (player/remote.js) — spatial:false made every teammate's gun
    // sound like your own, inside your head. Stereo into the equal-power PannerNode is well defined (it pans the pair).
    // refDistance 12 m: at 40 m the inverse model gives -10.5 dB, i.e. -12 LUFS - 10.5 ~ the -22 LUFS _far layer
    // (ref 30-50 m) the game switches to there, so crossing 40 m does not jump in level.
    if (closes.length) await cat.add(`${G.name}_close`, closes, { lufs: closeLufs, quality: CLOSE_QUALITY, maxLimitDb: 6, limiter: { release: 0.02 }, spatial: true, range: M.closeRange ?? [12, 60], channels: 2, voices: M.voices ?? 6, pitch: M.pitch ?? [0.97, 1.03], vol: M.vol ?? 1, priority: 3, sources });
    if (tails.length) await cat.add(`${G.name}_tail`, tails, { target: 'gunTail', spatial: false, channels: 2, voices: M.tailVoices ?? 3, pitch: [0.98, 1.02], sources });
    if (fars.length) await cat.add(`${G.name}_far`, fars, { target: 'gunFar', spatial: true, range: M.farRange ?? [40, 450], voices: 4, pitch: [0.95, 1.04], priority: 2, sources });
    // mech: action clack, 10 ms after the shot (under the blast's decay, where the ear catches it)
    if (G.mech && wantLayer('mech')) {
      const specs = MECH[G.mech], vars = [];
      for (const [k, [id, a, z, o]] of specs.entries()) {
        let b = await K.grab(id, a, z, { hp: 250, ...o });
        b = lib.mix([{ buf: b, at: 0.01 }]);
        vars.push(b);
      }
      await cat.add(`${G.name}_mech`, vars, { target: 'gunMech', spatial: false, channels: 1, voices: 3, pitch: [0.95, 1.05], maxHeadMs: 20, sources: specs.map((s) => s[0]) });
    }
  }

  // ------------------------------------------------------------ specials
  if (want('minigun_extra')) await minigunExtras(lib, ctx, cat, K);
  if (want('rocket')) await rocketSet(lib, ctx, cat, K);
  if (want('knife')) await knifeSet(lib, ctx, cat, K);

  // ------------------------------------------------------------ foley
  if (want('foley')) {
    for (const [name, S] of Object.entries(FOLEY)) {
      ctx.log(`-- ${name}`);
      const vars = [], srcs = new Set();
      for (const [k, specs] of S.variants.entries()) {
        // spiky metal (tinkles, clicks): shave the spikes so the loudness stage does not lean on the limiter
        vars.push(K.clipToPLR(await K.layered(specs, k, `${name}_${k}`, K), (-1.4 - S.lufs) + 2, { min: 0, max: 14, threshold: -6 }));
        for (const s of specs) if (Array.isArray(s)) srcs.add(s[0]);
      }
      await cat.add(name, vars, {
        lufs: S.lufs, spatial: !!S.spatial, channels: 1, range: S.range ?? [1, 1], voices: S.voices ?? 2,
        pitch: S.pitch ?? [0.96, 1.04], sources: [...srcs], maxLimitDb: 5, limiter: { release: 0.012 },
      });
    }
  }

  await cat.write();
}
