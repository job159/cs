// 反災 (anti-calamity) series sounds — docs/PREMIUM_WEAPONS.md §1.12, §2.0.4. Fully synthesized (no sources):
//   ready_dualphase  雙相 ready "鈴": two small bells a fifth apart, the second 60 ms late, meeting in one shimmer
//                    (the two phases locking). Unique ready sound of the series (§1.12: no ready sound repeats).
//   dp_lock          gimbal lock: a hard detent click with a short metallic ping
//   dp_engage        過相 start: shell latch clack, a rising reactor hum (70 -> 150 Hz, driven so phones hear it),
//                    an FM power-up shimmer and an air whoosh
//   dp_vent          steam venting from the opened reactor shells
//   dp_end           過相 end: pressure release hiss over a falling tone
//   node --max-old-space-size=1536 tools/audio/build.mjs --only antical
export async function produce(lib, ctx) {
  const cat = ctx.category('antical');

  // ------------------------------------------------------------------ ready bell (ui, 2D)
  const bell = (base, seed) => lib.partials(1.6, { base, seed, list: [[1, 1, 1.1], [2.76, 0.42, 0.55], [5.4, 0.22, 0.28], [8.93, 0.12, 0.14], [2.0, 0.18, 0.8]] });
  const strike = lib.noiseBurst({ dur: 0.02, decay: 0.006, hp: 5500, seed: 'dp_bell_strike' });
  const ready = (k) => lib.reverb(lib.mix([
    { buf: bell(1568 * k, 'dp_bell_a') }, { buf: strike, gain: -16 },
    { buf: bell(2349 * k, 'dp_bell_b'), at: 0.06, gain: -3 }, { buf: strike, at: 0.06, gain: -18 },
    // both ring on together: a soft beating partial that settles (the phases aligning)
    { buf: lib.applyEnv(lib.tone(1.4, { freq: [[0, 3125 * k], [0.5, 3136 * k]] }), lib.expEnv(1.4, { attack: 0.08, t60: 0.9 })), at: 0.07, gain: -15 },
  ]), 'smallRoom', { wet: 0.22, seed: 'dp_bell_room', length: 0.8 });
  await cat.add('ready_dualphase', [ready(1), ready(1.0035)], { target: 'stinger', lufs: -20, bus: 'ui', spatial: false, channels: 2, voices: 2 });

  // ------------------------------------------------------------------ gimbal lock click
  const lock = (seed) => lib.mix([
    { buf: lib.noiseBurst({ dur: 0.05, decay: 0.012, hp: 1800, lp: 9000, seed: seed + 'n' }) },
    { buf: lib.thump({ f0: 420, f1: 180, sweep: 0.01, decay: 0.05, click: 0.3, seed: seed + 't' }), gain: -6 },
    { buf: lib.partials(0.25, { base: 3400, seed: seed + 'p', list: [[1, 1, 0.09], [1.48, 0.5, 0.06], [2.31, 0.3, 0.04]] }), at: 0.004, gain: -9 },
  ]);
  await cat.add('dp_lock', [lock('dpl1'), lock('dpl2'), lock('dpl3')], { target: 'mech', bus: 'sfx', spatial: true, range: [2, 25], voices: 3, pitch: [0.97, 1.03] });

  // ------------------------------------------------------------------ overphase engage
  const engage = (seed) => {
    const D = 1.0;
    const hum = lib.saturate(lib.mix([
      { buf: lib.tone(D, { type: 'saw', freq: [[0, 70], [0.35, 150], [D, 140]] }), gain: -8 },
      { buf: lib.tone(D, { type: 'sine', freq: [[0, 140], [0.35, 300], [D, 280]] }) },
    ]), { drive: 9 });
    const humE = lib.applyEnv(lib.lp(hum, 2400), lib.envCurve(D, [[0, 0], [0.06, 0.6], [0.32, 1], [0.55, 0.7], [D, 0]]));
    const shimmer = lib.applyEnv(lib.fm(D, { carrier: [[0, 600], [0.4, 1450], [D, 1400]], ratio: 1.5, index: 3, indexDecay: 0.35 }), lib.envCurve(D, [[0, 0], [0.18, 0], [0.4, 1], [D, 0]]));
    const clack = lib.mix([
      { buf: lib.noiseBurst({ dur: 0.06, decay: 0.018, hp: 1200, lp: 8000, seed: seed + 'c' }) },
      { buf: lib.thump({ f0: 260, f1: 90, sweep: 0.02, decay: 0.09, click: 0.4, seed: seed + 'ct' }), gain: -4 },
    ]);
    return lib.mix([
      { buf: clack, gain: -2 },
      { buf: humE, at: 0.02, gain: -3 },
      { buf: shimmer, at: 0.02, gain: -14 },
      { buf: lib.whoosh({ dur: 0.55, f0: 300, f1: 3200, seed: seed + 'w' }), at: 0.05, gain: -8 },
      { buf: lib.noiseBurst({ dur: 0.5, attack: 0.02, decay: 0.35, hp: 2500, lp: 9000, seed: seed + 's' }), at: 0.14, gain: -14 },
    ]);
  };
  await cat.add('dp_engage', [engage('dpe1'), engage('dpe2')], { target: 'stinger', bus: 'sfx', spatial: true, range: [3, 45], voices: 2, pitch: [0.98, 1.02] });

  // ------------------------------------------------------------------ steam vent
  const vent = (seed) => lib.mix([
    { buf: lib.eq(lib.noiseBurst({ dur: 0.75, attack: 0.012, decay: 0.55, color: 'white', seed: seed + 'a' }), [{ type: 'hp', f: 1400, order: 2 }, { type: 'peak', f: 5200, gain: 6, q: 0.8 }, { type: 'lp', f: 11000, order: 2 }]) },
    { buf: lib.noiseBurst({ dur: 0.08, decay: 0.03, hp: 600, lp: 4000, seed: seed + 'b' }), gain: -6 },
  ]);
  await cat.add('dp_vent', [vent('dpv1'), vent('dpv2')], { target: 'foley', bus: 'sfx', spatial: true, range: [2, 25], voices: 2, pitch: [0.96, 1.04] });

  // ------------------------------------------------------------------ overphase end
  const end = (seed) => {
    const D = 1.1;
    const fall = lib.applyEnv(lib.saturate(lib.tone(D, { type: 'sine', freq: [[0, 420], [D, 110]] }), { drive: 6 }), lib.expEnv(D, { attack: 0.01, t60: 0.9 }));
    const hiss = lib.eq(lib.noiseBurst({ dur: D, attack: 0.03, decay: 0.85, seed: seed + 'h' }), [{ type: 'hp', f: 1800, order: 2 }, { type: 'lp', f: 9000, order: 2 }]);
    return lib.mix([{ buf: hiss }, { buf: fall, gain: -10 }, { buf: lock(seed + 'k'), at: 0.62, gain: -6 }]);
  };
  await cat.add('dp_end', [end('dpx1'), end('dpx2')], { target: 'foley', lufs: -21, bus: 'sfx', spatial: true, range: [2, 30], voices: 2 });

  await cat.write();
}
