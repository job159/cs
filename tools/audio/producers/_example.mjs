// Example producer: proves the pipeline end-to-end and shows the idioms (see docs/AUDIO.md §4). NOT shipped —
// names starting with '_' only run via --only, and this one refuses to write into game/assets/audio:
//   node --max-old-space-size=1536 tools/audio/build.mjs --only _example --out tools/audio/out/example-assets
//
// It builds one category 'example' with:
//   example_blip      a fully synthesized UI blip (3 variants)                        -> ui bus, 2D
//   example_ak_close  AK-47 close layer from real recordings (FFSL near-mic shots)   -> 2D stereo, -12 LUFS
//   example_ak_tail   outdoor street tail generated from the same shots              -> 2D stereo, -20 LUFS
//   example_ak_far    distant version for teammates > 40 m                           -> 3D mono, -22 LUFS
//   example_impact    Kenney metal hit + synthesized debris layer                     -> 3D mono, -18 LUFS
export async function produce(lib, ctx) {
  if (lib.paths.AUDIO_IS_DEFAULT) throw new Error('_example is a demo: run it with --out tools/audio/out/example-assets');
  const cat = ctx.category('example');

  // ------------------------------------------------------------------ 1. pure synthesis (no sources)
  const blip = lib.mix([
    lib.applyEnv(lib.tone(0.09, { type: 'triangle', freq: [[0, 1320], [0.09, 1180]] }), lib.expEnv(0.09, { attack: 0.002, t60: 0.08 })),
    { buf: lib.applyEnv(lib.tone(0.09, { type: 'sine', freq: 2640 }), lib.expEnv(0.09, { attack: 0.001, t60: 0.03 })), gain: -12 },
  ]);
  await cat.add('example_blip', lib.variations(blip, 3, { seed: 'blip', semis: [-0.3, 0.3], gainDb: [0, 0] }), { target: 'ui', bus: 'ui' });

  // ------------------------------------------------------------------ 2. a gunshot set from real recordings
  // The Free Firearm Sound Library 'near' takes: a spaced stereo pair at the shooter, one shot per detected event,
  // recorded outdoors — the direct blast is the first ~100 ms, the environment's slap echoes arrive ~120-250 ms later.
  // So: '_close' = direct blast + designed body/sub (dry, dense, short); '_tail' = the recorded reflections + a
  // synthesized street tail; '_far' = distance-filtered version for teammates.
  const src = ctx.sources.find({ pack: 'ffsl', tags: ['ak47', 'near', 'single'] })[0];
  if (!src) throw new Error('FFSL AK-47 near/single not in the inventory (run tools/audio/fetch.mjs)');
  const events = (src.analysis?.events || []).filter((ev) => ev[1] - ev[0] > 0.25);
  ctx.log(`  using ${src.id} (${src.title}): ${events.length} usable shots`);
  const closes = [], tails = [], fars = [];
  for (let k = 0; k < Math.min(4, events.length); k++) {
    const t0 = events[k][0];
    const raw = await ctx.load(src.id, { start: Math.max(0, t0 - 0.003), end: t0 + 1.8 }); // 48 kHz stereo, shot + reflections
    const shot = lib.trimSilence(lib.slice(raw, 0, 0.6), { threshDb: -50, pre: 0.001, end: false });
    const tone = lib.eq(shot, [{ type: 'hp', f: 45, order: 4 }, { type: 'peak', f: 160, gain: 2.5, q: 0.9 }, { type: 'peak', f: 3500, gain: 1.5, q: 1.2 }]);
    // close: direct blast (110 ms) + a short early-room body + a pitched sub thump; phones cannot reproduce < 120 Hz,
    // so psychoBass adds the harmonics that imply it. Drive into a soft clipper BEFORE the loudness stage: the
    // crack survives and the file reaches -12 LUFS with no limiting (research 03 §4.12: clip, then limit).
    const direct = lib.exciter(lib.fadeOut(lib.slice(tone, 0, 0.11), 0.05, 'exp'), { freq: 2500, drive: 10, amount: -10 }); // crack
    const body = lib.reverb(direct, 'smallRoom', { wet: 0.18, seed: `ak_room_${k}`, length: 0.4 });
    const sub = lib.thump({ f0: 130, f1: 52, sweep: 0.035, decay: 0.2, drive: 1.5, seed: `ak_sub_${k}` });
    let close = lib.mix([body, { buf: sub, gain: -11 }], { channels: 2 });
    close = lib.psychoBass(close, { freq: 120, amount: -7 });
    close = lib.fadeOut(lib.slice(close, 0, 0.26), 0.16, 'exp');
    close = lib.softClip(lib.gain(lib.normalizePeak(close, 0), 12), { threshold: -12, ceiling: -1 });
    closes.push(close);
    // tail: the real recorded reflections (after the direct blast) blended with a synthesized street tail
    const recorded = lib.fadeIn(lib.slice(lib.hp(raw, 60, 2), 0.1, raw.duration), 0.03, 'sine');
    const synth = lib.gunTail(shot, { env: 'urban', length: 1.7, head: 0.1, seed: `ak_tail_${k}` });
    tails.push(lib.fadeOut(lib.mix([{ buf: synth }, { buf: recorded, at: 0.085, gain: 3 }], { length: 1.7, channels: 2 }), 0.6, 'exp'));
    fars.push(lib.farLayer(shot, { distance: 180, env: 'urban', seed: `ak_far_${k}` }));
    if (k === 0) ctx.preview('ak_close_plus_tail', lib.mix([lib.normalizeLufs(close, -12), { buf: lib.normalizeLufs(tails[0], -20), at: 0.015, gain: -1 }]));
  }
  await cat.add('example_ak_close', closes, { target: 'gunClose', spatial: false, channels: 2, voices: 6, pitch: [0.97, 1.03], priority: 3, sources: [src.id] });
  await cat.add('example_ak_tail', tails, { target: 'gunTail', spatial: false, channels: 2, voices: 4, sources: [src.id] });
  await cat.add('example_ak_far', fars, { target: 'gunFar', spatial: true, range: [40, 450], voices: 4, sources: [src.id] });

  // ------------------------------------------------------------------ 3. a recorded hit + synthesized layer
  const hits = ctx.sources.find({ pack: 'kenney_impact', text: /impactMetal_medium/ }).slice(0, 3);
  const impacts = [];
  for (const h of hits) {
    const r = ctx.rng(h.id);
    const hit = lib.trimSilence(await ctx.load(h.id, { channels: 1 }), { threshDb: -55 });
    const grit = lib.noiseBurst({ dur: 0.18, decay: 0.07, hp: 3000, lp: 11000, seed: `grit_${r.int(0, 1e6)}` });
    const layered = lib.transientShaper(lib.mix([hit, { buf: grit, at: 0.002, gain: -16 }]), { attack: 3, sustain: 2 });
    impacts.push(lib.softClip(lib.gain(lib.normalizePeak(layered, 0), 6), { threshold: -12, ceiling: -1 })); // tame the ring's spikes
  }
  await cat.add('example_impact', impacts, { target: 'impact', spatial: true, range: [2, 45], voices: 6, pitch: [0.94, 1.06] });

  await cat.write();
}
