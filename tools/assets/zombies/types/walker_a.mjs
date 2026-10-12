// walker_a — "工裝屍" Shambler: adult male, gaunt and hunched, torn blue work overalls over a filthy T-shirt,
// CC0 zombie skin (sohh_female_zombie_skin, skins03) + procedural corpse pallor, veins, sunken eyes, blood,
// a bite on the left neck and a gash on the right forearm, milky eyes, rotten teeth, mangy hair.
export async function build(lib) {
  const opts = lib.merge('gaunt', 'hunched', {
    macro: { gender: 1, age: 0.62, height: 0.55, proportions: 0.4, race: { caucasian: 1 } },
    modifiers: { 'mouth-scale-horiz-decr-incr': 0.15, 'eye-bag-decr-incr': 0.6, 'nose-hump-decr-incr': 0.3 },
    expression: { 'mouth-open': 0.55, 'mouth-upward-retraction': 0.25, 'eyebrows-left-down': 0.4, 'eyebrows-right-down': 0.4 },
  });
  const h = await lib.Human.create(opts);

  // ---- geometry (bound to the morphed base mesh)
  const body = await h.proxyBody('male1591');
  const suit = await h.fit('clothes/male_worksuit01', { name: 'worksuit', role: 'cloth' });
  const shoes = await h.fit('clothes/shoes01', { name: 'shoes', role: 'cloth' });
  const eyes = await h.fit('eyes/low-poly', { name: 'eyes', role: 'eye', hide: false });
  const teeth = await h.fit('teeth/teeth_base', { name: 'teeth', role: 'teeth', hide: false });
  const brows = await h.fit('eyebrows/eyebrow001', { name: 'eyebrows', role: 'hair', hide: false });
  const hair = await h.fit('hair/short04', { name: 'hair', role: 'hair', hide: false });

  // ---- skin: CC0 zombie skin + corpse treatment
  const skinSrc = 'skins/sohh_female_zombie_skin/';
  const skin = lib.paintSkin(h, {
    seed: 11,
    base: await lib.texture('skins03', skinSrc + 'sohh_Zombie_Female_diffuse.png', 2048),
    bump: await lib.texture('skins03', skinSrc + 'sohh_Zombie_Female_bump.png', 2048),
    bumpStrength: 5, normalStrength: 2.4,
    pallor: 0.45, tint: [0.36, 0.42, 0.33], mottle: 0.6, veins: 0.75, bruises: 0.5, socket: 0.9, lips: 0.8, grime: 0.55,
    blood: { mouth: 1, hands: 0.8, splatter: 0.25 },
    wounds: [
      { bone: 'neck_01', t: 0.2, dir: [0.9, 0.15, 0.25], r: 0.04, kind: 'bite', depth: 2.2 },
      { bone: 'lowerarm_r', t: 0.45, dir: [0.1, 0.4, 1], r: 0.03, kind: 'gash' },
      { bone: 'spine_02', t: 0.4, dir: [0.75, 0, 0.6], r: 0.05, kind: 'bite', depth: 2 },
    ],
  });
  body.material = lib.material('skin', { ...skin });

  // ---- clothes: shredded overalls + shirt, stained, with frayed holes
  const tear = (P, N) => {
    // sleeves, shirt front, knees and hems tear more; right side of the belly has a big rip over the wound
    const knee = Math.max(0, 1 - Math.abs(P[1] - 0.5) * 7) * 0.25;
    const hem = Math.max(0, 1 - P[1] * 5) * 0.3;
    const chest = Math.max(0, 1 - Math.abs(P[1] - 1.3) * 6) * 0.12;
    const belly = Math.max(0, 1 - Math.hypot(P[0] - 0.13, (P[1] - 1.08) * 0.8, P[2] - 0.12) * 9) * 0.5;
    return knee + hem + chest + belly;
  };
  const cloth = lib.paintCloth(suit, {
    seed: 21, human: h,
    base: await lib.texture(suit.asset.textures.diffuse, 2048),
    normal: await lib.texture(suit.asset.textures.normal, 1024),
    ao: await lib.texture(suit.asset.textures.ao, 1024),
    size: 2048, normalSize: 1024, ormSize: 1024,
    fade: 0.5, grime: 0.85, weave: 1, yellow: 0.8,
    blood: { collar: 1, hands: 0.5, splatter: 0.55, edges: 0.5 },
    tear: { amount: 0.42, scale: 5.5, fray: 0.8, where: tear, threadColor: [0.62, 0.6, 0.55] },
  });
  suit.material = lib.material('cloth', { ...cloth, alpha: cloth.alpha, doubleSided: true, pngBits: 6 });
  // body faces under intact cloth go away; under holes they stay visible
  h.hideCovered(body, (p) => cloth.holeAt(p, 0.1));

  const shoeTex = await lib.texture(shoes.asset.textures.diffuse, 1024);
  shoes.material = lib.material('cloth', {
    albedo: lib.grungeTexture(shoeTex, { seed: 3, darken: 0.55, dirt: 0.9, blood: 0.25, tint: [0.42, 0.4, 0.38] }),
    normal: shoes.asset.textures.normal ? await lib.texture(shoes.asset.textures.normal, 512) : null,
    roughness: 0.85,
  });

  // ---- eyes / teeth / hair
  const eyeTex = await lib.texture('system', 'eyes/materials/brown_eye.png', 512);
  eyes.material = lib.material('eye', { ...lib.paintEyes(eyeTex, { style: 'milky', bloodshot: 0.9 }), roughness: 0.15 });
  const teethTex = await lib.texture(teeth.asset.textures.diffuse, 512);
  teeth.material = lib.material('teeth', { albedo: lib.grungeTexture(teethTex, { seed: 9, tint: [0.85, 0.7, 0.45], darken: 0.25, dirt: 0.5, blood: 0.45, freq: 14 }), roughness: 0.45 });
  const hairTex = await lib.texture(hair.asset.textures.diffuse, 512);
  const hairImg = lib.thinHair(hair, lib.grungeTexture(hairTex, { seed: 4, darken: 0.25, dirt: 0.5, blood: 0.15, tint: [0.8, 0.78, 0.72] }), { amount: 0.12, scale: 22, seed: 2 });
  hair.material = lib.material('hair', { albedo: hairImg, alpha: true, roughness: 0.8, doubleSided: true });
  const browTex = await lib.texture(brows.asset.textures.diffuse, 256);
  brows.material = lib.material('hair', { albedo: lib.grungeTexture(browTex, { darken: 0.3 }), alpha: true, roughness: 0.8 });
  brows.extras.noSimplify = true;
  eyes.extras.noSimplify = true;

  return {
    human: h,
    parts: [body, suit, shoes, eyes, teeth, brows, hair],
    budget: 9000,
    partBudget: { worksuit: 4300, shoes: 700, teeth: 420, hair: 800 },
    extras: { poseOffsets: opts.poseOffsets, archetype: 'shambler', gender: 'male' },
    lod1: { budget: 2500, drop: ['teeth', 'eyebrows', 'eyes'], texScale: 0.5, partBudget: { worksuit: 1150, body: 800, shoes: 160, hair: 250 } },
  };
}
