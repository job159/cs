// walker_b — "肚漢" Bloated Walker: an older, heavy man (~1.72 m), balding (grey horseshoe fringe on a shiny
// bare scalp), pale bluish "white walker" skin (CC0 reizibarrientos_white_walker_skin hue over the CC0 old
// caucasian male skin's wrinkles), a bloated putrefying belly bursting out of a torn striped shirt, worn jeans,
// bare filthy feet and a LEFT ARM WITH THE SKIN TORN AWAY (painted exposed muscle, tendons, fat rim).
// Silhouette: big gut, head lolling to the right, drooping left shoulder with the red flayed arm.
//
// Everything type-specific lives in this file; the shared lib is untouched:
//  - skin composite: old male skin luminance detail on a cold blue-grey corpse palette (+ a little white-walker
//    chroma), mesh-cavity darkening (creases / folds from the morphed base mesh), blotchy bald scalp
//  - gore: flayed left arm (muscle bellies, fibres, fat layer, curled skin edge), scalp laceration with bone and
//    blood runs, bloody drool, putrefying belly (thin marbled vein network, livor, skin slip), filthy bare feet,
//    livid fingers with black nails
//  - skin under the shirt found by ray casting (the lib's delete_verts-based darkening misses the open collar);
//    the cloth is painted first so the burst-shirt / ripped-sleeve hole edges cast a contact shadow on the skin
//    (cloth.tearField)
//  - dead cataract eyes, horseshoe hair cut from a full hair cap and cropped onto the scalp (cropHair: flush at the
//    bald edge, no helmet rim), pulled teeth, faded denim / low-contrast pinstripe shirt recolour,
//    UV-island dilation (proxy UVs stray past the base islands at toe / finger tips)
//  - burst shirt: V opening down the placket below the 3rd button + front hem ridden up over the sagging gut
//    (cut per texel on the shirt only, never the jeans under its hem: cutShirt), belly hanging over the waistband
//  - wounds painted here (dark maroon / brown crust / yellow fat, mostly matte) instead of the lib's glossy bites;
//    roughness post-pass on the skin ORM (only small wet spots stay glossy)
//  - sparse grey brows painted into the skin (no floating brow cards), toes / nails painted on the bare feet
//  - hitboxes tightened for the gut (the lib's 80th percentile blows the torso capsules up), _seg collar -> torso
//  - albedo values for the in-game read: the mesh-cavity occlusion and the cloth contact shadows go into the skin
//    ORM's occlusion channel (occlusionPass), never multiplied into the albedo on top of it; skin sRGB mean over
//    painted texels ~100-115 (tools/assets/zombies/albedo.mjs)
import * as THREE from 'three';
import { rasterUV, texelSurface, texelAttr } from '../lib/raster.mjs';
import { smoothstep } from '../lib/noise.mjs';
import { computeHitboxes } from '../lib/export.mjs';
import { albedoTracer } from '../lib/albedoTrace.mjs';

const srgb2lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lin2srgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const LUT = new Float32Array(256).map((_, i) => srgb2lin(i / 255));
const toByte = (x) => Math.max(0, Math.min(255, Math.round(lin2srgb(Math.max(0, x)) * 255)));
const lin = (rgb) => rgb.map((v) => srgb2lin(v / 255));
const lumOf = (c) => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
const over = (c, col, a) => { if (!(a > 0)) return; a = Math.min(1, a); c[0] += (col[0] - c[0]) * a; c[1] += (col[1] - c[1]) * a; c[2] += (col[2] - c[2]) * a; };
const mul = (c, col, a) => { if (!(a > 0)) return; a = Math.min(1, a); c[0] *= 1 + (col[0] - 1) * a; c[1] *= 1 + (col[1] - 1) * a; c[2] *= 1 + (col[2] - 1) * a; };
const mix = (a, b, t) => a + (b - a) * t;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const texSize = (s) => Math.max(64, Math.round(s * +(process.env.ZOMBIE_TEX_SCALE || 1)));

const C = {
  // exposed muscle: dark maroon going brown, near-black gaps, coagulated black-brown and dried necrotic patches
  muscle: lin([82, 22, 20]), muscleDark: lin([22, 6, 5]), muscleLight: lin([116, 40, 34]),
  necrotic: lin([46, 25, 17]), coag: lin([28, 13, 9]), fascia: lin([150, 128, 120]), tendon: lin([186, 170, 150]),
  fat: lin([170, 142, 84]), rim: lin([62, 32, 26]),
  // bites / gashes: dark meat, black-brown crust, yellow fat
  meat: lin([74, 18, 16]), meatDeep: lin([26, 7, 6]), crust: lin([38, 21, 13]), woundFat: lin([158, 128, 70]),
  bruise: lin([78, 52, 76]),
  // putrefying belly
  marble: lin([36, 46, 56]), putrid: lin([92, 104, 84]), striae: lin([150, 128, 150]), slip: lin([176, 160, 140]),
  livid: lin([150, 128, 172]),
  mud: lin([40, 33, 25]), sole: lin([20, 16, 13]), ageSpot: lin([104, 92, 84]),
  // corpse skin palette (pale cold blue-grey with grey-green drift)
  cold: lin([136, 145, 158]), sick: lin([132, 142, 124]), nail: lin([44, 38, 42]),
};

/**
 * Limb coordinates along a bone chain: P -> {s, r, ang}. s = segment index + t (0 = chain start, 1 = first joint
 * ...), r = distance to the axis (m), ang = angle around the axis (rad; 0 = the side facing +Z, the frame is
 * parallel-transported down the chain so the angle is continuous across the elbow).
 */
function limbCoords(h, names) {
  const B = h.skeleton.byName;
  const pts = [B[names[0]].head.toArray(), ...names.map((n) => B[n].tail.toArray())];
  const segs = [];
  let f = [0, 0, 1];
  for (let i = 0; i < names.length; i++) {
    const a = pts[i], b = pts[i + 1];
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const L = Math.hypot(...d);
    const ax = d.map((x) => x / L);
    const k = f[0] * ax[0] + f[1] * ax[1] + f[2] * ax[2];
    let ff = [f[0] - ax[0] * k, f[1] - ax[1] * k, f[2] - ax[2] * k];
    const fl = Math.hypot(...ff); ff = ff.map((x) => x / fl);
    const side = [ax[1] * ff[2] - ax[2] * ff[1], ax[2] * ff[0] - ax[0] * ff[2], ax[0] * ff[1] - ax[1] * ff[0]];
    segs.push({ a, ax, L, f: ff, side });
    f = ff;
  }
  const out = { s: 0, r: 0, ang: 0 };
  return (P) => {
    let bestR = 1e9;
    for (let i = 0; i < segs.length; i++) {
      const g = segs[i];
      const vx = P[0] - g.a[0], vy = P[1] - g.a[1], vz = P[2] - g.a[2];
      const t = (vx * g.ax[0] + vy * g.ax[1] + vz * g.ax[2]) / g.L;
      const tc = Math.max(0, Math.min(1, t)) * g.L;
      const qx = vx - g.ax[0] * tc, qy = vy - g.ax[1] * tc, qz = vz - g.ax[2] * tc;
      const r = Math.hypot(qx, qy, qz);
      if (r < bestR - 1e-9) {
        bestR = r;
        out.s = i + t; out.r = r;
        out.ang = Math.atan2(qx * g.side[0] + qy * g.side[1] + qz * g.side[2], qx * g.f[0] + qy * g.f[1] + qz * g.f[2]);
        out.L = g.L;
      }
    }
    return out;
  };
}

export async function build(lib) {
  const N3 = lib.makeNoise(57);
  const opts = lib.merge('bloated', {
    macro: { gender: 1, age: 0.8, height: 0.5, proportions: 0.3, muscle: 0.3, weight: 0.92, race: { caucasian: 1 } },
    modifiers: {
      // gut: stomach-pregnant is already clamped at 1 by the preset; more depth / waist and a slack, sagging
      // belly wall (stomach-tone down) so the gut hangs forward and over the waistband
      'stomach-pregnant-decr-incr': 0.3, 'measure-waist-circ-decr-incr': 0.5, 'torso-scale-depth-decr-incr': 0.3,
      'stomach-tone-decr-incr': -1,
      'neck-double-decr-incr': 0.3, 'head-age-decr-incr': 0.7, 'eye-bag-decr-incr': 0.9, 'eye-bag-height-decr-incr': 0.4,
      'nose-volume-decr-incr': 0.35, 'nose-point-down-up': -0.4, 'ear-lobe-decr-incr': 0.6, 'ear-scale-decr-incr': 0.3,
      'cheek-trans-down-up': -0.6, 'mouth-angles-down-up': -0.6, 'chin-prominent-decr-incr': -0.3,
      'asym-jaw-1-l-r': 0.6, 'asym-mouth-1-l-r': 0.35, 'asym-eye-2-l-r': 0.4,
      'buttocks-volume-decr-incr': 0.3, 'upperarm-fat-decr-incr': 0.25, 'lowerarm-fat-decr-incr': 0.15,
    },
    expression: {
      'mouth-open': 0.5, 'mouth-depression': 0.55, 'mouth-upward-retraction': 0.2, 'neck-platysma': 0.45,
      'eye-left-opened-up': 0.35, 'eye-right-slit': 0.25, 'eyebrows-left-inner-up': 0.3, 'eyebrows-right-down': 0.35,
    },
  });
  const h = await lib.Human.create(opts);
  const B = h.skeleton.byName;

  // ---- anchors used by every procedural mask below
  const eyeL = h.jointPos('joint-l-eye'), eyeR = h.jointPos('joint-r-eye');
  const eyeY = (eyeL[1] + eyeR[1]) / 2, eyeZ = (eyeL[2] + eyeR[2]) / 2;
  const skull = [0, eyeY + 0.015, eyeZ - 0.085];
  const armL = limbCoords(h, ['upperarm_l', 'lowerarm_l']);
  const armR = limbCoords(h, ['upperarm_r', 'lowerarm_r']);
  // belly apex (most forward body vertex on the midline between pelvis and chest)
  let apex = [0, 1, 0];
  for (const v of h.baseObj.groupVerts('body')) {
    const x = h.pos[v * 3], y = h.pos[v * 3 + 1], z = h.pos[v * 3 + 2];
    if (Math.abs(x) < 0.02 && y > B.pelvis.head.y && y < B.spine_03.head.y && z > apex[2]) apex = [x, y, z];
  }
  const kneeL = B.calf_l.head.toArray(), kneeR = B.calf_r.head.toArray();
  const A = lib.anchors(h);
  const neckY = B.neck_01.head.y;
  // scalp laceration on the right crown, running front-to-back
  const gash = (() => {
    const sp = lib.surfacePoint(h, 'head', 0.75, [-0.5, 0.8, 0.25]);
    const n = sp.n;
    const t0 = [0.15, 0.25, 1];
    const k = t0[0] * n[0] + t0[1] * n[1] + t0[2] * n[2];
    let u = [t0[0] - n[0] * k, t0[1] - n[1] * k, t0[2] - n[2] * k];
    const ul = Math.hypot(...u); u = u.map((x) => x / ul);
    const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
    return { p: sp.p, n, u, v, ang: Math.atan2(sp.p[0] - skull[0], sp.p[2] - skull[2]) };
  })();
  // bites (painted here: matte dark meat + crust, not the lib's glossy red crater): the right side of the neck
  // under the ear (the lobe is torn, the rest of the ear cartilage stays) and the left flank
  const bites = [
    { p: nearestBody(h, [-0.075, B.neck_01.head.y + 0.04, B.neck_01.head.z]), r: 0.03, depth: 1.5 },
    { p: lib.surfacePoint(h, 'head', 0.0, [-1, 0.12, -0.05]).p, r: 0.012, depth: 0.8 },
    { p: lib.surfacePoint(h, 'spine_02', 0.5, [0.95, 0, 0.3]).p, r: 0.032, depth: 1.5 },
  ];

  /** Male-pattern baldness: 1 on the bare crown/front of the scalp. `skin` keeps the original forehead. */
  const baldness = (P, skin = false, raw = false) => {
    const dx = P[0] - skull[0], dy = P[1] - skull[1], dz = P[2] - skull[2];
    const l = Math.hypot(dx, dy, dz);
    if (l > 0.2 || l < 1e-6) return raw ? -1 : 0;
    const up = dy / l, fwd = dz / l;
    let thr = 0.32 - 0.16 * fwd;
    if (skin) thr += 0.2 * smoothstep(0.6, 0.95, fwd) * (1 - smoothstep(0.03, 0.06, Math.abs(dx)));
    const n = N3.fbm(P[0] * 22, P[1] * 22, P[2] * 22, 3) * 0.06;
    if (raw) return up - thr + n;
    return skin ? smoothstep(-0.07, 0.05, up - thr + n) : smoothstep(-0.04, 0.04, up - thr + n);
  };

  /** Flayed-arm field: q < 1 inside the exposed muscle, 1..1.25 the torn rim. */
  const FLAY = { s0: 0.42, s1: 1.9, angC: -0.55 };
  const flayQ = (P, a) => {
    if (a.r > 0.13 || a.s < 0.2 || a.s > 2.15) return 9;
    let dA = a.ang - FLAY.angC;
    dA = Math.atan2(Math.sin(dA), Math.cos(dA));
    const halfW = 1.45 + 0.55 * Math.sin(a.s * 2.6 + 0.4) + (a.s > 0.85 && a.s < 1.2 ? 0.5 : 0);
    const qs = Math.abs(a.s - (FLAY.s0 + FLAY.s1) / 2) / ((FLAY.s1 - FLAY.s0) / 2);
    const qa = Math.abs(dA) / halfW;
    // ragged tear: big lobes + jagged small-scale bites + a few skin islands left stuck on the muscle
    const w = N3.fbm(P[0] * 8 + 1, P[1] * 8, P[2] * 8, 3) * 0.32 + N3.fbm(P[0] * 26, P[1] * 26, P[2] * 26, 2) * 0.1
      + N3.noise(P[0] * 70, P[1] * 70, P[2] * 70) * 0.03;
    let q = Math.pow(qs ** 4 + qa ** 4, 0.25) + w;
    const isl = 1 - smoothstep(0.1, 0.16, N3.worley(P[0] * 24 + 5, P[1] * 24, P[2] * 24));
    q += isl * 0.75 * smoothstep(0.6, 0.9, q) * smoothstep(0.0, 0.4, N3.fbm(P[0] * 4, P[1] * 4 + 2, P[2] * 4, 2) + 0.2);
    return q;
  };

  // ---- geometry (bound to the morphed base mesh)
  // the low-poly proxy skull is visibly faceted once it is bald: subdivide the cranium and project the new
  // vertices onto the high-resolution base mesh (rounder silhouette, ~+400 tris)
  const headZone = (p, m = 0) => p[1] > eyeY + 0.025 - m && dist(p, skull) < 0.16 + m && !(Math.abs(p[0]) > 0.066 && p[1] < eyeY + 0.06);
  const body = refineSurface(lib, h, await h.proxyBody('male1591'), headZone);
  const suit = await h.fit('clothes/male_casualsuit03', { name: 'clothes', role: 'cloth' });
  const eyes = await h.fit('eyes/low-poly', { name: 'eyes', role: 'eye', hide: false });
  const teeth = await h.fit('teeth/teeth_base', { name: 'teeth', role: 'teeth', hide: false });
  const hair = await h.fit('hair/short02', { name: 'hair', role: 'hair', hide: false });
  // the brow cards floated off the brow ridge as plastic strips: they are only used as a guide for brows
  // painted into the skin (not exported)
  const browGuide = browField(await h.fit('eyebrows/eyebrow009', { name: 'eyebrows', role: 'hair', hide: false }));
  // decapitation must not carry the shirt collar away: garment vertices never belong to the head segment
  let collarFix = 0;
  for (let v = 0; v < suit.nVerts; v++) if (suit.seg[v] === 1) { suit.seg[v] = 0; collarFix++; }

  // shirt + jeans recolour; the jeans' top edge per x across the front (vertices sampled as denim-blue)
  const shirtBase = recolourSuit(await lib.texture(suit.asset.textures.diffuse, 2048));
  const jeansTopAt = jeansTopLine(suit, shirtBase);
  const jeansTop = jeansTopAt(0);

  // ---- burst shirt: the buttons popped below the 3rd one; the fronts are pulled apart into a V down the placket
  // and the front hem has ridden up over the gut. Signed distance (m, < 0 = open) on the front of the torso.
  const vTop = neckY - 0.25;
  const hemC = jeansTop + 0.075, hemNat = jeansTop - 0.06;
  const openSD = (P, vOnly = false) => {
    if (P[2] < 0.0 || P[1] < jeansTop - 0.12 || P[1] > vTop + 0.06) return 1;
    const ax = Math.abs(P[0]), y = P[1];
    const t = Math.min(1, Math.max(0, (vTop - y) / (vTop - hemC)));
    const halfW = 0.012 + 0.145 * t ** 0.8 + 0.02 * Math.sin(t * 3.1); // bowed out over the gut
    const dV = Math.max(ax - halfW, y - vTop);
    const hem = mix(hemC, hemNat, smoothstep(0.05, 0.24, ax));
    const dH = vOnly ? 1 : y - hem;
    const fade = smoothstep(0.0, 0.06, P[2]); // only on the front: sides / back closed
    return Math.min(dV, dH) * fade + (1 - fade) * 0.05
      + N3.fbm(P[0] * 24 + 3, P[1] * 24, P[2] * 24, 3) * 0.009 + N3.noise(P[0] * 85, P[1] * 85, P[2] * 85) * 0.003;
  };
  const bellyOpen = (P) => openSD(P) < 0 && P[1] > jeansTopAt(P[0]);

  // Skin the clothes no longer cover at all (sleeve torn off the left arm, burst shirt over the belly) is not
  // "covered": no contact-shadow darkening there and the body faces stay.
  const openSkin = (P) => { const a = armL(P); return (a.r < 0.13 && a.s > 0.28) || bellyOpen(P); };
  for (const v of [...h.hidden]) if (openSkin([h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]])) h.hidden.delete(v);
  // The open collar / loose shirt does not list the upper chest in its delete_verts, so the lib's covered-skin
  // darkening missed skin seen through the shirt's tears there (it came out bright). For the paint pass only,
  // every body vertex whose outward normal ray hits the garment within 6 cm also counts as covered (contact
  // shadow + scrapes); the set is restored afterwards so hideCovered() keeps those faces.
  const underSuit = rayCovered(h, suit, 0.06).filter((v) => !h.hidden.has(v) && !openSkin([h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]]));
  for (const v of underSuit) h.hidden.add(v);
  console.log(`  walker_b: ${underSuit.length} extra base vertices under the garment, ${collarFix} collar verts -> torso segment`);

  // fingertips (nails, livid acral skin), toe tips (nails)
  const tips = [];
  for (const s of ['l', 'r']) {
    for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky']) if (B[`${f}_03_${s}`]) tips.push(B[`${f}_03_${s}`].tail.toArray());
  }
  const handC = [B.hand_l.head.toArray(), B.hand_r.head.toArray()];
  const toes = toeTips(h);
  const wristR = B.lowerarm_r.tail.toArray();

  // ---- clothes: striped shirt + jeans (one MakeHuman garment): recoloured (above), then shred
  const biteP = (() => { const v = lib.surfacePoint(h, 'neck_01', 0.15, [-0.75, 0.62, -0.15]); return v.p; })();
  const tear = (P) => {
    let w = 0;
    // left sleeve ripped off below the shoulder (ragged stump)
    const a = armL(P);
    if (a.r < 0.16) w += 2.4 * smoothstep(0.1, 0.32, a.s + N3.fbm(P[0] * 12, P[1] * 12, P[2] * 12, 3) * 0.1);
    // bite on the right shoulder
    w += 0.95 * (1 - smoothstep(0.035, 0.1, dist(P, biteP)));
    // ragged right cuff + elbow
    const r = armR(P);
    if (r.r < 0.13) w += 0.45 * smoothstep(1.45, 1.95, r.s) + 0.3 * Math.max(0, 1 - Math.abs(r.s - 1) * 6);
    // jeans: blown-out right knee, worn-through left knee, frayed hems over the bare feet (steep, so the hems
    // are either cut or intact: no near-threshold band of edge blood up the shins)
    w += 0.75 * Math.max(0, 1 - dist(P, [kneeR[0], kneeR[1] + 0.01, kneeR[2] + 0.06]) * 11);
    w += 0.7 * Math.max(0, 1 - dist(P, [kneeL[0], kneeL[1] - 0.03, kneeL[2] + 0.06]) * 22);
    w += 0.6 * smoothstep(0.1, 0.0, P[1]);
    // fewer random holes right under the collar (they only showed a pale patch of sternum) and around the
    // burst placket (its edge is cut separately)
    w -= 0.45 * smoothstep(neckY - 0.16, neckY - 0.06, P[1]) * smoothstep(0.0, 0.06, P[2]) * (1 - smoothstep(0.08, 0.14, Math.abs(P[0])));
    w -= 0.4 * (1 - smoothstep(0.0, 0.06, openSD(P)));
    // shirt back: a couple of rips
    w += 0.35 * Math.max(0, 1 - dist(P, [0.07, 1.22, -0.16]) * 9);
    return w;
  };
  const SC = shirtBase.width;
  const isDenimAt = (u, v) => {
    const i = (Math.min(SC - 1, Math.round(v * SC)) * SC + Math.min(SC - 1, Math.round(u * SC))) * 4;
    return shirtBase.data[i + 2] > shirtBase.data[i] + 10;
  };
  const cloth = lib.paintCloth(suit, {
    seed: 31, human: h,
    base: shirtBase,
    normal: await lib.texture(suit.asset.textures.normal, 1024),
    ao: await lib.texture(suit.asset.textures.ao, 1024),
    size: 2048, normalSize: 1024, ormSize: 1024,
    fade: 0.3, grime: 0.85, grimeNoise: 0.9, weave: 0.6, yellow: 0.7,
    // the lib's blood (airbrushed collar bib, polka-dot splatter) is replaced by stains painted in `extra`
    blood: { edges: 0.3 },
    tear: { amount: 0.36, scale: 6, fray: 0.8, where: tear, threadColor: [0.42, 0.4, 0.38] },
    extra: (P, Nn, c, u, v) => (isDenimAt(u, v) ? jeansBlood(P, Nn, c) : shirtStains(P, Nn, c)),
  });
  const cut = cutShirt(suit, cloth.albedo, shirtBase, openSD, N3);
  suit.material = lib.material('cloth', { ...cloth, alpha: cloth.alpha, doubleSided: true, pngBits: 6 });

  /** Shirt blood: stains with defined edges and darker dried rims, brown crust at the collar and the right cuff. */
  function shirtStains(P, Nn, c) {
    let s = 0;
    // collar: crusted brown round the neck, worst at the front and the bitten right side
    const dn = Math.hypot(P[0], P[2] - B.neck_01.head.z);
    const collar = (1 - smoothstep(0.02, 0.06, P[1] - (neckY - 0.07))) * smoothstep(neckY - 0.13, neckY - 0.08, P[1]) * (1 - smoothstep(0.1, 0.16, dn));
    // a run of drool / blood from the mouth down the placket, plus a few big stains on the chest and sleeve
    const run = (1 - smoothstep(0.015, 0.045, Math.abs(P[0] - A.mouth[0] + 0.01) + N3.fbm(P[0] * 9, P[1] * 9, P[2] * 9, 3) * 0.04))
      * smoothstep(neckY - 0.36, neckY - 0.18, P[1]) * smoothstep(0.0, 0.05, P[2])
      * smoothstep(-0.15, 0.25, N3.fbm(P[0] * 14 + 1, P[1] * 6, P[2] * 14, 3));
    const blotch = N3.fbm(P[0] * 5 - 7, P[1] * 5, P[2] * 5, 4) + 0.06 * N3.noise(P[0] * 40, P[1] * 40, P[2] * 40);
    s = Math.max(s, smoothstep(0.4, 0.44, run * 0.55 + collar * 0.45 + blotch * 0.5));
    const cuff = (1 - smoothstep(0.05, 0.12, dist(P, wristR))) * smoothstep(-0.1, 0.3, N3.fbm(P[0] * 18, P[1] * 18, P[2] * 18, 3));
    const crust = Math.max(collar * smoothstep(-0.25, 0.25, N3.fbm(P[0] * 26, P[1] * 26, P[2] * 26, 3)), cuff);
    if (s > 0) {
      // dried blood on dark cotton: deep red-brown, the edge (capillary ring) darker still
      const ring = smoothstep(0.38, 0.42, run * 0.55 + collar * 0.45 + blotch * 0.5) * (1 - smoothstep(0.44, 0.52, run * 0.55 + collar * 0.45 + blotch * 0.5));
      over(c, lin([44, 17, 13]), s * 0.62);
      over(c, lin([28, 13, 10]), ring * 0.6);
    }
    over(c, lin([66, 40, 24]), crust * 0.7); // stiff brown crust
  }

  /** Jeans blood: elongated drips and spatter, clustered on the thighs and knees, brown-red and low saturation. */
  function jeansBlood(P, Nn, c) {
    const front = smoothstep(-0.4, 0.3, Nn[2]);
    const thighs = smoothstep(0.42, 0.55, P[1]) * (1 - smoothstep(0.8, 0.9, P[1]));
    const knees = Math.max(1 - smoothstep(0.04, 0.13, dist(P, kneeL)), 1 - smoothstep(0.04, 0.13, dist(P, kneeR)));
    const cl = Math.max(thighs, knees) * front * smoothstep(-0.15, 0.25, N3.fbm(P[0] * 3 + 20, P[1] * 3, P[2] * 3, 2) + 0.15);
    if (cl <= 0) return;
    // drips: thin vertical runs (stretched noise), broken up, fading out downwards
    const drip = smoothstep(0.36, 0.44, N3.noise(P[0] * 130, P[1] * 4 + 3, P[2] * 130)) * smoothstep(0.35, 0.65, N3.noise(P[0] * 20 + 9, P[1] * 12, P[2] * 20) * 0.5 + 0.5);
    // spatter: small drops elongated downwards (clustered by cl), plus a few larger wiped smears
    const sp = (1 - smoothstep(0.08, 0.12, N3.worley(P[0] * 75, P[1] * 30, P[2] * 75))) * smoothstep(0.0, 0.4, N3.fbm(P[0] * 9 + 2, P[1] * 9, P[2] * 9, 2) + 0.1);
    const sf = N3.fbm(P[0] * 7 - 4, P[1] * 3.5, P[2] * 7, 4);
    const smear = smoothstep(0.34, 0.39, sf);
    const b = Math.min(1, Math.max(drip * 0.8, sp * 0.9, smear * 0.7)) * cl;
    over(c, lin([64, 30, 24]), b * 0.8);
    over(c, lin([36, 20, 16]), smear * (1 - smoothstep(0.39, 0.45, sf)) * cl * 0.5); // darker dried rim
  }

  // ---- skin: old male skin detail x cold corpse palette, bald scalp, then corpse treatment + custom gore
  const S = texSize(2048);
  const bellyZone = (P) => P[2] > 0 && Math.abs(P[0]) < 0.3 && P[1] > jeansTop - 0.1 && P[1] < vTop
    ? smoothstep(-0.1, 0.4, P[2] / 0.3) * (1 - smoothstep(0.18, 0.3, Math.abs(P[0]))) : 0;
  const base = await skinBase(lib, h, S, baldness, eyeY, eyeZ, bellyZone);
  const yNavel = apex[1] - 0.02;
  const skin = lib.paintSkin(h, {
    seed: 23, base, size: 2048, normalSize: 1024, ormSize: 1024,
    pallor: 0.35, tint: lin([146, 156, 172]), mottle: 0.85, veins: 1, bruises: 0.5, socket: 1, lips: 1, grime: 0.7,
    coveredDarken: 0.75, coveredShade: 0.22, normalStrength: 2.6, roughness: 0.62, // covered-skin shadow: in the ORM
    blood: { mouth: 0.75, hands: 0.5, splatter: 0.18 },
    extra: (P, Nn, c, st) => {
      // shiny bare scalp (greasy sheen) with blue temple veins showing through
      const b = baldness(P, true);
      if (b > 0) {
        st.ro = mix(st.ro, 0.52 + 0.12 * N3.fbm(P[0] * 20, P[1] * 20, P[2] * 20, 2), b);
        const v = N3.ridged(P[0] * 34 + 2, P[1] * 12, P[2] * 34, 2) * smoothstep(-0.1, 0.4, N3.fbm(P[0] * 6, P[1] * 6 + 3, P[2] * 6, 2));
        over(c, lin([62, 72, 104]), smoothstep(0.6, 0.9, v) * b * 0.5);
        st.h += smoothstep(0.6, 0.9, v) * b * 0.25;
      }
      // sparse, bushy grey brows (painted strands, feathered edges)
      paintBrows(P, Nn, c, st);
      // dirt / dried-blood streaks smeared over the whole body (old wounds, crawling around)
      const smear = smoothstep(0.45, 0.8, N3.fbm(P[0] * 5 + 11, P[1] * 2.2, P[2] * 5, 4));
      over(c, lin([62, 50, 40]), smear * 0.35 * (1 - bellyZone(P) * 0.3));
      // livid acral skin: purple-blue fingers and toes, black-rimmed broken nails, filthy hands
      let dt = 1;
      for (const t of tips) dt = Math.min(dt, dist(P, t));
      const dh = Math.min(dist(P, handC[0]), dist(P, handC[1]));
      if (dh < 0.25) {
        const fing = (1 - smoothstep(0.02, 0.09, dt)) + (1 - smoothstep(0.05, 0.14, dh)) * 0.4;
        mul(c, C.livid.map((x) => x * 1.25), Math.min(1, fing) * 0.65);
        const nail = 1 - smoothstep(0.005, 0.014, dt);
        over(c, C.nail, nail * 0.85);
        over(c, C.mud, smoothstep(0.1, 0.6, N3.fbm(P[0] * 60, P[1] * 60, P[2] * 60, 3)) * (1 - smoothstep(0.04, 0.16, dh)) * 0.55);
        st.ro = mix(st.ro, 0.8, nail);
      }
      // ---- flayed left arm
      const a = armL(P);
      const q = flayQ(P, a);
      if (q < 1.45) paintFlay(P, a, q, c, st);
      // ---- bloated belly: same blue-grey corpse skin as the chest and arms (no busy crumple), soft green-purple
      // marbling low on the flanks and under the overhang, a shallow navel dimple
      const dy = P[1] - yNavel;
      const bz = bellyZone(P);
      if (bz > 0) {
        const front = smoothstep(-0.15, 0.45, Nn[2]);
        const m = bz * front;
        // lit from the front and never shadowed by the shirt: a touch darker so it does not glow
        const kb = 1 - m * 0.36; c[0] *= kb; c[1] *= kb; c[2] *= kb;
        mul(c, lin([206, 212, 230]), smoothstep(-0.2, 0.5, N3.fbm(P[0] * 4 + 8, P[1] * 4, P[2] * 4, 3)) * m * 0.5);
        const low = smoothstep(0.0, -0.14, dy), flank = smoothstep(0.07, 0.2, Math.abs(P[0]));
        const zone = Math.min(1, low * 0.75 + flank * 0.85) * m;
        const blot = smoothstep(-0.25, 0.45, N3.fbm(P[0] * 6 + 3, P[1] * 6, P[2] * 6, 3));
        const l = lumOf(c);
        over(c, [l * 0.92, l * 1.08, l * 0.86], zone * blot * 0.45); // dull grey-green (luminance kept)
        mul(c, C.livid, zone * (1 - blot) * 0.35);
        // faint marbled veins (thin lines, ~40 % of the old network, only where the discoloration is)
        const vn = N3.ridged(P[0] * 9, P[1] * 9, P[2] * 9, 3);
        const vv = smoothstep(0.62, 0.85, vn) * zone * (0.5 + 0.5 * blot);
        over(c, lin([70, 80, 92]).map((x) => x * Math.min(1.2, l / 0.06)), vv * 0.35);
        st.h += vv * 0.05;
        // stretch marks: thin pale-purple arcs on the flanks under the bulge
        const wv = (P[1] + N3.noise(P[0] * 18, P[1] * 4, P[2] * 18) * 0.015 + Math.abs(P[0]) * 0.25) * 230;
        const stripe = smoothstep(0.9, 0.98, Math.abs(Math.sin(wv))) * smoothstep(0.15, 0.6, N3.fbm(P[0] * 9 + 7, P[1] * 9, P[2] * 9, 2)) * smoothstep(0.03, -0.06, dy);
        over(c, C.striae, stripe * flank * m * 0.25);
        st.h -= stripe * flank * m * 0.15;
        // taut, greasy skin over the distended gut (soft sheen, not plastic)
        st.ro = mix(st.ro, 0.5, m * 0.6);
        // underside of the overhang: occluded, livid, pressed against the waistband
        const under = smoothstep(0.1, -0.5, Nn[1]) * smoothstep(-0.02, -0.12, dy);
        mul(c, lin([190, 160, 196]), under * bz * 0.5);
        const wb = 1 - (1 - smoothstep(0.0, 0.04, P[1] - jeansTopAt(P[0]))) * 0.3;
        c[0] *= wb; c[1] *= wb; c[2] *= wb;
        // navel: a shallow dark dimple
        const dnv = Math.hypot(P[0], (dy + 0.005) * 0.8);
        over(c, lin([70, 60, 68]).map((x) => x * Math.min(1.2, l / 0.07)), (1 - smoothstep(0.006, 0.022, dnv)) * 0.5 * front);
        over(c, lin([58, 46, 52]), (1 - smoothstep(0.002, 0.009, dnv)) * 0.35 * front);
        st.h -= (1 - smoothstep(0.004, 0.02, dnv)) * 0.6 * front;
        // a couple of defined blood runs from the chest down onto the gut
        const dr = smoothstep(0.55, 0.7, N3.noise(P[0] * 70, P[1] * 3, P[2] * 70)) * smoothstep(-0.2, 0.08, dy) * m
          * smoothstep(0.1, 0.4, N3.fbm(P[0] * 4, P[1] * 4, P[2] * 4, 2) + 0.2);
        over(c, lin([60, 18, 14]), dr * 0.75);
      }
      // ---- contact shadow of the burst shirt on the gut and of the ripped-off sleeve on the arm: darker,
      // grimier band just inside the opening (the shirt stands off the skin, so the shadow is soft)
      if (openSkin(P)) {
        if (bellyOpen(P)) {
          const sd = openSD(P, true);
          const sh = smoothstep(-0.05, 0.0, sd); // (its shadow: occlusionPass below)
          over(c, lin([60, 52, 46]), smoothstep(-0.02, 0.0, sd) * 0.3);
          st.ro = mix(st.ro, 0.72, sh);
        } else {
          const tf = cloth.tearField(P, Nn);
          if (tf > -0.05) {
            const sh = (1 - smoothstep(0.0, 0.45, tf)) * 0.6 + (1 - smoothstep(0.2, 1.1, tf)) * 0.25;
            over(c, lin([60, 52, 46]), (1 - smoothstep(0.0, 0.3, tf)) * 0.35);
            st.ro = mix(st.ro, 0.75, sh);
          }
        }
      }
      // ---- open collar: the sternum / collarbone skin in the shirt's V sits in its shadow, sweaty and grimy, with
      // bloody drool that ran from the mouth down the throat onto the chest
      if (P[2] > 0.0 && P[1] < A.neck[1] + 0.05 && P[1] > A.neck[1] - 0.2 && Math.abs(P[0]) < 0.16) {
        const v = smoothstep(A.neck[1] + 0.05, A.neck[1] - 0.02, P[1]) * smoothstep(0.16, 0.08, Math.abs(P[0]));
        const g = smoothstep(-0.2, 0.5, N3.fbm(P[0] * 18 + 4, P[1] * 18, P[2] * 18, 3));
        over(c, lin([66, 54, 44]), v * g * 0.6); // grime; the shadow of the collar is in occlusionPass
      }
      {
        const dx = P[0] - A.mouth[0] - 0.006, below = A.mouth[1] - 0.03 - P[1];
        if (below > 0 && below < 0.3 && Math.abs(dx) < 0.06 && P[2] > 0) {
          const streak = smoothstep(0.35, 0.62, N3.noise(dx * 160, P[1] * 5, 8.3)) * (1 - smoothstep(0.02, 0.05, Math.abs(dx))) * (1 - smoothstep(0.1, 0.3, below));
          st.bl = Math.max(st.bl, streak * (1 - smoothstep(0.03, 0.08, below)) * 0.85);
          over(c, lin([56, 18, 14]), streak * smoothstep(0.03, 0.08, below) * 0.75);
        }
      }
      // ---- bites
      for (const w of bites) paintBite(P, w, c, st);
      // ---- scalp laceration on the right crown: split skin, bone showing, dried blood run down the temple
      {
        const d0 = P[0] - gash.p[0], d1 = P[1] - gash.p[1], d2 = P[2] - gash.p[2];
        const r = Math.hypot(d0, d1, d2);
        if (r < 0.14) {
          const al = d0 * gash.u[0] + d1 * gash.u[1] + d2 * gash.u[2];
          const ac = d0 * gash.v[0] + d1 * gash.v[1] + d2 * gash.v[2];
          const t = Math.min(1, Math.abs(al) / 0.048);
          const halfW = 0.0015 + 0.009 * Math.sqrt(Math.max(0, 1 - t * t));
          const jag = N3.noise(P[0] * 90, P[1] * 90, P[2] * 90) * 0.25 + N3.fbm(P[0] * 30, P[1] * 30, P[2] * 30, 2) * 0.2;
          const q = Math.max(Math.abs(al) / 0.05, Math.abs(ac) / halfW) + jag; // lens-shaped split
          if (q < 1) {
            const inner = 1 - smoothstep(0.2, 0.9, q);
            over(c, C.meat, 0.95);
            over(c, C.meatDeep, smoothstep(0.4, 0.95, q) * 0.5 + inner * 0.3);
            over(c, C.crust, smoothstep(0.45, 0.65, N3.fbm(P[0] * 80, P[1] * 80, P[2] * 80, 2) + q * 0.3) * 0.7);
            // skull bone glimpsed at the bottom of the split
            over(c, lin([176, 162, 132]), (1 - smoothstep(0.0, 0.35, q)) * smoothstep(0.3, 0.6, N3.noise(P[0] * 140, P[1] * 140, P[2] * 140) * 0.5 + 0.5) * 0.7);
            st.h -= 1.4 * inner + 0.5;
            st.ro = 0.55;
            st.bl = 0;
          } else if (q < 1.6) {
            const e = (q - 1) / 0.6;
            over(c, C.crust, (1 - smoothstep(0.0, 0.35, e)) * 0.85); // dried black-brown crust on the lips of the cut
            over(c, lin([90, 54, 66]), (1 - e) * 0.45); // swollen, bruised
            st.h += 0.6 * (1 - Math.abs(e - 0.25) / 0.75);
            st.ro = 0.62;
          }
          over(c, C.bruise, (1 - smoothstep(0.02, 0.07, r)) * 0.4);
        }
        // dried blood that ran down from it over the temple, round the eyebrow and down the cheek
        const below = gash.p[1] - P[1];
        if (below > -0.01 && below < 0.2) {
          const hang = Math.atan2(P[0] - skull[0], P[2] - skull[2]);
          let dA = hang - gash.ang; dA = Math.atan2(Math.sin(dA), Math.cos(dA));
          const band = 1 - smoothstep(0.12, 0.3, Math.abs(dA + below * 0.6));
          const streak = smoothstep(0.3, 0.55, N3.noise(dA * 38, P[1] * 4, 3.1)) * band * (1 - smoothstep(0.04, 0.2, below));
          over(c, lin([62, 16, 12]), streak * 0.85);
          st.ro = mix(st.ro, 0.55, streak);
        }
      }
      // ---- bare filthy feet: the cold blue-grey skin still shows; dirt rises from the black soles, caked
      // between the toes, toenails thick, yellow-grey and black-rimmed
      if (P[1] < 0.22) paintFoot(P, Nn, c, st);
    },
  });
  for (const v of underSuit) h.hidden.delete(v);
  if (skin.albedo.width === base.width) dilate(skin.albedo, base.mask, 24);
  // wounds and blood: matte (roughness >= 0.45), only small wet spots keep a gloss
  wetPass(h, skin.orm, (P) => {
    let core = 0, zone = 0;
    for (const w of bites) { const q = dist(P, w.p) / w.r; if (q < 1.6) zone = 1; if (q < 0.85) core = 1; }
    const a = armL(P);
    const q = flayQ(P, a);
    if (q < 1.25) zone = 1;
    if (q < 0.9) core = 1;
    if (dist(P, gash.p) < 0.06) { zone = 1; core = 1; }
    const wet = core && N3.worley(P[0] * 70 + 2, P[1] * 70, P[2] * 70) < 0.09;
    return wet ? -0.3 : zone ? 0.5 : 0.42;
  });
  // occlusion: mesh cavities (creases, sockets, under the gut) + the shirt's contact shadows -> ORM R channel
  occlusionPass(h, skin.orm, (P, Nn, r, tris, i) => {
    const bz = bellyZone(P);
    const cf = smoothstep(0.15, 1.0, texelAttr(r, tris, base.cav.fine, i)) * (1 - bz * 0.6);
    const cb = smoothstep(0.1, 1.0, texelAttr(r, tris, base.cav.broad, i));
    let k = 1 - cf * 0.35 - cb * 0.42;
    if (openSkin(P)) {
      if (bellyOpen(P)) k *= 1 - smoothstep(-0.05, 0.0, openSD(P, true)) * 0.5;
      else {
        const tf = cloth.tearField(P, Nn);
        if (tf > -0.05) k *= 1 - Math.min(0.75, (1 - smoothstep(0.0, 0.45, tf)) * 0.6 + (1 - smoothstep(0.2, 1.1, tf)) * 0.25);
      }
    }
    if (P[2] > 0.0 && P[1] < A.neck[1] + 0.05 && P[1] > A.neck[1] - 0.2 && Math.abs(P[0]) < 0.16) {
      k *= 1 - smoothstep(A.neck[1] + 0.05, A.neck[1] - 0.02, P[1]) * smoothstep(0.16, 0.08, Math.abs(P[0])) * 0.45;
    }
    return k;
  });
  body.material = lib.material('skin', { ...skin });
  const TR = albedoTracer('walker_b');
  TR.snap('skin: composite base', base, body);
  TR.snap('skin: final', skin.albedo, body);
  TR.snap('clothes: final', cloth.albedo, suit);
  TR.report();

  function paintBite(P, w, c, st) {
    const d = dist(P, w.p);
    if (d > w.r * 3) return;
    const q = d / w.r + N3.fbm(P[0] * 45, P[1] * 45, P[2] * 45, 3) * 0.35;
    if (q < 1) {
      // torn crater: dark meat, near-black in the depth, coagulated crust, yellow fat in the torn wall
      const inner = 1 - smoothstep(0.0, 0.85, q);
      const col = [0, 0, 0];
      for (let j = 0; j < 3; j++) col[j] = mix(C.meat[j], C.meatDeep[j], inner * 0.75);
      mul(col, [0.6, 0.5, 0.5], N3.ridged(P[0] * 160, P[1] * 160, P[2] * 160, 2) * 0.5);
      over(col, C.crust, smoothstep(0.45, 0.62, N3.fbm(P[0] * 70 + 5, P[1] * 70, P[2] * 70, 3) + q * 0.25) * 0.8);
      over(col, C.woundFat, smoothstep(0.6, 0.85, q) * (1 - smoothstep(0.1, 0.25, N3.worley(P[0] * 110, P[1] * 110, P[2] * 110))) * 0.6);
      over(c, col, 0.97);
      st.h -= w.depth * (1 - q * q);
      st.ro = 0.55;
      st.bl = 0;
    } else if (q < 1.35) {
      // torn skin lips with dried black-brown crust
      const e = (q - 1) / 0.35;
      over(c, C.crust, (1 - smoothstep(0.1, 0.8, e)) * 0.8);
      st.h += 0.5 * (1 - Math.abs(e - 0.3) / 0.7);
      st.ro = 0.62;
      st.bl = Math.min(st.bl, 0.2);
    }
    over(c, C.bruise, (1 - smoothstep(1.0, 2.6, q)) * 0.4);
    // dried run-off below the wound
    const below = w.p[1] - P[1];
    if (below > 0 && below < w.r * 5 && Math.abs(P[0] - w.p[0]) < w.r * 1.2) {
      const s = smoothstep(0.3, 0.5, N3.noise(P[0] * 150, P[1] * 8, P[2] * 150)) * (1 - below / (w.r * 5));
      over(c, lin([58, 16, 12]), s * 0.8);
    }
  }

  function paintFlay(P, a, q, c, st) {
    // fat layer thickness varies (thin and broken in places, not a neat stripe)
    const fatW = 0.012 + 0.03 * smoothstep(-0.2, 0.5, N3.fbm(P[0] * 30 + 9, P[1] * 30, P[2] * 30, 2));
    if (q < 1) {
      const alongM = a.s * 0.27, crossM = a.ang * Math.max(0.03, a.r);
      // muscle bellies: 2 around the upper arm (biceps / triceps), 4 spiralling ones on the forearm
      const fore = smoothstep(0.85, 1.15, a.s);
      const k = mix(2, 4, fore);
      const phase = a.ang * k / 2 + (a.s - 1) * 0.9 * fore + N3.noise(a.s * 3, a.ang * 0.8, 1.7) * 0.5;
      const g = Math.abs(Math.sin(phase));
      const belly = Math.sqrt(g);
      const groove = 1 - smoothstep(0.0, 0.3, g);
      // striated fibres along the limb, broken by short tears
      const fib = N3.noise(alongM * 30, crossM * 260, 2.2) * 0.6 + N3.noise(alongM * 75, crossM * 620, 5.1) * 0.4;
      const torn = smoothstep(0.55, 0.8, N3.ridged(alongM * 12, crossM * 90, 7.7, 2)) * belly;
      const tendon = smoothstep(1.45, 1.85, a.s) * smoothstep(0.35, 0.85, g) * smoothstep(-0.05, 0.45, N3.noise(crossM * 110, alongM * 5, 3.3));
      const dry = smoothstep(-0.1, 0.5, N3.fbm(P[0] * 9 + 5, P[1] * 9, P[2] * 9, 4));
      const coag = smoothstep(0.3, 0.5, N3.fbm(P[0] * 16 + 3, P[1] * 16, P[2] * 16, 3));
      const col = [0, 0, 0];
      for (let j = 0; j < 3; j++) col[j] = mix(C.muscleDark[j], C.muscle[j], 0.1 + belly * 0.9);
      over(col, C.muscleLight, smoothstep(0.35, 0.8, fib) * belly * 0.25);
      mul(col, [0.5, 0.42, 0.42], smoothstep(-0.1, -0.6, fib) * 0.6);
      mul(col, [0.14, 0.11, 0.11], groove * 0.95); // dark gaps between the muscle bellies
      mul(col, [0.4, 0.3, 0.3], torn * 0.7);
      // dull fascia membranes in patches, sinew over the wrist
      over(col, C.fascia, smoothstep(0.68, 0.9, N3.ridged(P[0] * 36, P[1] * 36, P[2] * 36, 2)) * 0.18 * belly * (1 - dry));
      over(col, C.tendon, tendon * 0.65);
      // dead tissue dries brown-black at the edges and in patches; coagulated black clots; the middle stays wet
      over(col, C.necrotic, dry * 0.7 + smoothstep(0.65, 1, q) * 0.55);
      over(col, C.coag, coag * 0.75);
      over(c, col, 0.98);
      st.h = st.h * 0.1 - 1.6 * (1 - smoothstep(0.85, 1, q) * 0.4) + belly * 1.2 + fib * 0.35 - groove * 1.3 - torn * 0.4 + tendon * 0.3 + coag * 0.3;
      st.ro = mix(0.48, 0.68, Math.max(dry * 0.9, coag, smoothstep(0.75, 1, q)));
      st.bl = 0;
    } else if (q < 1 + fatW) {
      // broken layer of yellowish subcutaneous fat between muscle and skin, blood-stained
      const t = (q - 1) / fatW;
      over(c, C.fat, 0.5 * (1 - t * 0.4));
      mul(c, [0.6, 0.45, 0.4], smoothstep(0.0, 0.6, N3.noise(P[0] * 160, P[1] * 160, P[2] * 160)));
      st.h += 0.2;
      st.ro = 0.55;
      st.bl = 0;
    } else if (q < 1.2) {
      // curled, raised skin edge, dark dried crust
      const t = (q - 1 - fatW) / (0.2 - fatW);
      over(c, C.rim, (1 - t) * 0.6);
      over(c, C.crust, (1 - smoothstep(0.0, 0.5, t)) * 0.5);
      st.h += 1.1 * (1 - Math.abs(t - 0.3) / 0.7);
      st.ro = 0.62;
      st.bl = 0;
    } else {
      over(c, lin([82, 56, 86]), (1 - (q - 1.2) / 0.25) * 0.5); // bruised halo
    }
  }

  function paintBrows(P, Nn, c, st) {
    if (Nn[2] < -0.1 || P[2] < eyeZ - 0.03 || Math.abs(P[1] - eyeY - 0.022) > 0.03) return;
    const g = browGuide[P[0] > 0 ? 0 : 1];
    const ax = Math.abs(P[0]);
    if (ax < g.x0 - 0.004 || ax > g.x1 + 0.006) return;
    const at = g.at(ax);
    const dy = P[1] - at.y;
    const along = (ax - g.x0) / (g.x1 - g.x0); // 0 inner end .. 1 outer end
    const hw = at.hw * mix(1.05, 0.6, smoothstep(0.5, 1.05, along));
    const edge = Math.abs(dy) / hw + N3.fbm(P[0] * 140, P[1] * 140, P[2] * 140, 2) * 0.45;
    const dens = (1 - smoothstep(0.45, 1.05, edge)) * smoothstep(-0.08, 0.12, along) * (1 - smoothstep(0.88, 1.08, along));
    if (dens <= 0) return;
    // strands: slanting up-and-out at the inner end, lying flatter towards the temple; sparse (old man)
    const ang = mix(0.85, 0.12, smoothstep(0.0, 0.7, along));
    const t1 = ax * Math.cos(ang) + dy * Math.sin(ang), t2 = -ax * Math.sin(ang) + dy * Math.cos(ang);
    const str = smoothstep(0.12, 0.42, Math.abs(N3.noise(t1 * 220, t2 * 1300, 4.2)));
    const gap = smoothstep(-0.3, 0.3, N3.fbm(P[0] * 260, P[1] * 260, P[2] * 260, 2) + 0.15);
    const hairA = dens * str * gap;
    const tone = 0.06 + 0.14 * (N3.noise(t1 * 90, t2 * 700, 9.1) * 0.5 + 0.5); // grey value varies hair to hair
    over(c, [tone * 0.97, tone, tone * 1.04], hairA * 0.85);
    over(c, lin([56, 54, 56]), dens * 0.12); // skin under the brow a little darker
    st.h += hairA * 0.25;
    st.ro = mix(st.ro, 0.68, hairA);
  }

  function paintFoot(P, Nn, c, st) {
    const hgt = P[1] + N3.fbm(P[0] * 14, P[1] * 14, P[2] * 14, 3) * 0.025;
    const caked = 1 - smoothstep(0.012, 0.06, hgt);          // caked rim round the sole
    const film = 1 - smoothstep(0.03, 0.2, hgt);              // thin dirt film rising up the foot
    const n = N3.fbm(P[0] * 24 + 4, P[1] * 24, P[2] * 24, 4);
    const l = lumOf(c);
    over(c, C.mud.map((x) => x * Math.min(1.1, l / 0.09)), film * (0.2 + 0.2 * smoothstep(-0.2, 0.4, n)));
    over(c, C.mud, caked * (0.6 + 0.25 * n));
    over(c, lin([70, 56, 40]), caked * smoothstep(0.2, 0.6, N3.fbm(P[0] * 40, P[1] * 40, P[2] * 40, 3)) * 0.35); // dry crust
    over(c, C.sole, smoothstep(-0.2, -0.6, Nn[1]) * 0.92);
    st.ro = mix(st.ro, 0.9, Math.max(caked, film * 0.5));
    st.h += caked * n * 0.4;
    // toes: dark dirt in the gaps between them, thick yellow-grey nails with black rims
    let dT = 1, tt = null;
    for (const t of toes) { const d = dist(P, t.p); if (d < dT) { dT = d; tt = t; } }
    if (!tt || dT > 0.06) return;
    // gaps: the sides of the toes facing their neighbours (lateral normal, in front of the ball, between the
    // outermost toes) are dark with packed dirt
    const ax = Math.abs(P[0]);
    const inner = ax > tt.xIn - 0.002 && ax < tt.xOut + 0.002 ? 1 : 0;
    const row = toes.filter((t) => t.side === tt.side).map((t) => Math.abs(t.p[0])).sort((a, b) => a - b);
    let dGap = 1;
    for (let k = 0; k + 1 < row.length; k++) dGap = Math.min(dGap, Math.abs(ax - (row[k] + row[k + 1]) / 2));
    const fwd = smoothstep(tt.p[2] - 0.04, tt.p[2] - 0.028, P[2]);
    const gap = Math.max(smoothstep(0.35, 0.8, Math.abs(Nn[0])) * inner * 0.5, (1 - smoothstep(0.0012, 0.0035, dGap)) * 0.8) * fwd;
    over(c, lin([30, 25, 22]), gap * 0.75);
    st.h -= gap * 0.6;
    // nail: on top of the toe tip, a rounded plate ~ toe width
    const back = tt.p[2] - P[2];
    const side = Math.abs(P[0] - tt.p[0]);
    const nail = (1 - smoothstep(tt.r * 0.75, tt.r * 1.05, side)) * smoothstep(-0.002, 0.003, back) * (1 - smoothstep(tt.r * 1.6, tt.r * 2.1, back)) * smoothstep(0.1, 0.45, Nn[1] + Nn[2] * 0.5);
    if (nail > 0) {
      over(c, lin([112, 106, 92]).map((x) => x * (0.75 + 0.35 * N3.noise(P[0] * 400, P[1] * 400, P[2] * 400))), nail * 0.8);
      const rim = nail * (1 - smoothstep(0.0, 0.004, back));
      over(c, lin([26, 20, 16]), rim * 0.8);
      st.h += nail * 0.6;
      st.ro = mix(st.ro, 0.55, nail);
    }
  }

  // keep the skin under the burst shirt (and a margin under its edges, it stands off the gut) and under tears
  h.hideCovered(body, (p) => cloth.holeAt(p, 0.1) || (openSD(p) < 0.06 && p[1] > jeansTopAt(p[0]) - 0.01));

  // ---- eyes: milky icy cataracts, yellowed bloodshot sclera
  const eyeTex = await lib.texture('system', 'eyes/materials/brown_eye.png', 512);
  eyes.material = lib.material('eye', { albedo: deadEyes(eyeTex, lib.makeNoise(8)), roughness: 0.18 });
  eyes.extras.noSimplify = true;

  // ---- teeth: rotten, three missing
  pullTeeth(teeth, [[0.009, 'up'], [-0.017, 'up'], [0.004, 'low'], [-0.021, 'low']]);
  const teethTex = await lib.texture(teeth.asset.textures.diffuse, 512);
  teeth.material = lib.material('teeth', { albedo: lib.grungeTexture(teethTex, { seed: 13, tint: [0.82, 0.64, 0.4], darken: 0.3, dirt: 0.65, blood: 0.5, freq: 14 }), roughness: 0.5 });

  // ---- hair: grey, greasy horseshoe fringe (crown cut away), kept clear of the neck bite
  // short02 is a full head of hair built on the hair helper (a few cm above the scalp): cropped close to the
  // skull, and flush with it along the bald edge, so the fringe does not read as a helmet with a hard rim
  cropHair(h, hair, baldness, eyeY);
  const hairTex = await lib.texture(hair.asset.textures.diffuse, 1024);
  hair.material = lib.material('hair', { albedo: fringeHair(hair, hairTex, baldness, N3, bites[0]), alpha: true, roughness: 0.62, doubleSided: true });

  // ---- posture: a heavy-bellied old man sways back at the lumbar spine (belly forward) and juts the head
  // forward, head lolling right; arms held off the gut (the shared clips were authored for a slim body)
  const abduct = (name, deg, sign) => {
    const qw = B[name].world.clone();
    const axis = new THREE.Vector3(0, 0, sign).applyQuaternion(qw.invert()).normalize();
    const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromAxisAngle(axis, deg * Math.PI / 180), 'XYZ');
    return [e.x, e.y, e.z].map((r) => +(r * 180 / Math.PI).toFixed(2));
  };
  const poseOffsets = {
    spine_01: [-12, 0, 0], spine_02: [-6, 0, -2], spine_03: [2, 0, -3],
    neck_01: [-6, 0, -6], head: [-4, -6, -12],
    clavicle_l: [0, 0, -7], clavicle_r: [0, 0, 3],
    upperarm_l: abduct('upperarm_l', 7, 1), upperarm_r: abduct('upperarm_r', 9, -1),
  };

  // ---- hitboxes: the lib's 80th percentile radius turns the gut into a 62 cm ball on spine_01 and the chest
  // capsule sticks out far behind the back; the head capsule ends at the scalp
  const parts = [body, suit, eyes, teeth, hair];
  const hb = computeHitboxes(h, parts.map((p) => p.toRender()));
  const headR = 0.095;
  const setHB = (key, r, len) => {
    hb.hitboxes[key][1] = r;
    hb.capsules[key].radius = r;
    if (len !== undefined) hb.capsules[key].length = +len.toFixed(3);
  };
  setHB('spine', 0.2);
  // chest: the game runs this capsule spine_03 -> neck_01, so its top cap is centred on the neck base; at 0.19 it
  // reached in front of the mouth and jaw (mouth shots counted as chest hits). 0.16 keeps the face to the head box.
  setHB('chest', 0.16);
  setHB('head', headR, Math.max(0.03, h.height - B.head.head.y - headR));

  console.log(`  walker_b: height ${h.height.toFixed(3)} m, belly apex z ${apex[2].toFixed(3)} @ y ${apex[1].toFixed(3)}, jeans top ${jeansTop.toFixed(3)}, shirt faces torn away ${cloth.removedFaces} + ${cut.removed} (placket), toes ${toes.length}`);
  console.log(`  walker_b: poseOffsets ${JSON.stringify(poseOffsets)}`);
  console.log(`  walker_b: hitboxes ${JSON.stringify(hb.hitboxes)}`);
  return {
    human: h,
    parts,
    budget: 9000,
    partBudget: { clothes: 4300, teeth: 400, hair: 750 },
    extras: {
      archetype: 'shambler', gender: 'male', variant: 'bloated old man, flayed left arm',
      hitboxes: hb.hitboxes, capsules: hb.capsules,
      poseOffsets,
    },
    lod1: { budget: 2500, drop: ['teeth', 'eyes'], texScale: 0.5, partBudget: { clothes: 1150, body: 900, hair: 220 } },
  };
}

/**
 * Skin albedo composite on the MakeHuman UV layout: the old caucasian male skin (wrinkles, pores, chest hair)
 * with the hue of the white-walker skin, and a bare, smooth, age-spotted scalp where the crown is bald.
 */
async function skinBase(lib, h, S, baldness, eyeY, eyeZ, bellyZone) {
  const om = await lib.texture('system', 'skins/old_caucasian_male/old_lightskinned_male_diffuse.png', S);
  const ww = await lib.texture('skins03', 'skins/reizibarrientos_white_walker_skin/WhiteWalker.png', S);
  const bp = h.basePart({ name: 'composite' });
  const tris = bp.tris(), nrm = bp.normals();
  const r = rasterUV(tris, h.baseObj.uvs, S, 8);
  const N3 = lib.makeNoise(91);
  const P = [0, 0, 0], Nn = [0, 0, 0];
  const c = [0, 0, 0], w = [0, 0, 0];
  // reference luminance of the old male skin (its pores / wrinkles / chest hair become a detail ratio)
  // (median, so the dark scalp stubble of the source does not brighten everything else)
  const hist = new Uint32Array(256);
  let lcnt = 0;
  for (let i = 0; i < S * S; i += 7) {
    if (r.tri[i] < 0) continue;
    hist[Math.round(om.data[i * 4] * 0.2126 + om.data[i * 4 + 1] * 0.7152 + om.data[i * 4 + 2] * 0.0722)]++; lcnt++;
  }
  let med = 0;
  for (let acc = 0; med < 255 && acc + hist[med] < lcnt / 2; med++) acc += hist[med];
  const REF = LUT[med];
  // mesh cavities of the morphed base mesh: fine creases (eyelids, lips, nostrils, ears, knuckles, skin folds)
  // and broad occlusion (eye sockets, under the chin and the belly, armpits, between fingers and toes)
  const cav = cavityFields(tris, h.pos, nrm);
  // old male luminance detail x a cold blue-grey corpse palette with a little white-walker chroma (lavender
  // in the recesses) and a low-frequency drift towards sickly grey-green: a pale corpse, not a plaster statue
  // (flat: the source's belly hair / pores read as crumpled paper on the stretched gut -> mostly flattened there)
  const compose = (di, drift = 0, flat = 0) => {
    for (let k = 0; k < 3; k++) { c[k] = LUT[om.data[di + k]]; w[k] = LUT[ww.data[di + k]]; }
    const d = 1 + (Math.min(1.3, Math.max(0.3, lumOf(c) / REF)) ** 1.2 - 1) * (1 - flat);
    const wl = lumOf(w) || 1;
    for (let k = 0; k < 3; k++) c[k] = mix(C.cold[k], C.sick[k], drift) * d * mix(1, Math.max(0.7, Math.min(1.4, w[k] / wl)), 0.3);
  };
  // reference forehead colour for the bare scalp
  const fh = [0, 0, 0]; let fn = 0;
  for (let i = 0; i < S * S; i++) {
    if (r.tri[i] < 0 || !r.covered[i]) continue;
    texelSurface(r, tris, h.pos, nrm, i, P, Nn);
    if (P[1] > eyeY + 0.03 && P[1] < eyeY + 0.055 && Math.abs(P[0]) < 0.03 && P[2] > eyeZ - 0.01 && Nn[2] > 0.6) {
      compose(i * 4);
      for (let k = 0; k < 3; k++) fh[k] += c[k];
      fn++;
    }
  }
  for (let k = 0; k < 3; k++) fh[k] /= Math.max(1, fn);
  const out = lib.cloneImage(om);
  const mask = new Uint8Array(S * S);
  for (let i = 0; i < S * S; i++) {
    const di = i * 4;
    compose(di);
    if (r.tri[i] >= 0 && texelSurface(r, tris, h.pos, nrm, i, P, Nn)) {
      mask[i] = 1;
      const bz = bellyZone(P);
      compose(di, smoothstep(-0.25, 0.45, N3.fbm(P[0] * 3 + 7, P[1] * 3, P[2] * 3, 3)) * 0.6, bz * 0.7);
      // creases and occluded folds: darker, purple-grey (dead skin pools colour in the folds)
      const cf = smoothstep(0.15, 1.0, texelAttr(r, tris, cav.fine, i)) * (1 - bz * 0.6);
      mul(c, lin([150, 118, 140]), cf * 0.7);
      // (the cavity occlusion itself, 1 - 0.35 fine - 0.42 broad, goes into the skin ORM: occlusionPass)
      // convex bony / stretched areas a touch lighter and waxier
      over(c, lin([150, 152, 146]).map((q) => q * (lumOf(c) / 0.24)), smoothstep(0.15, 0.8, -texelAttr(r, tris, cav.broad, i)) * 0.15);
      const b = baldness(P, true);
      if (b > 0) {
        const n = N3.fbm(P[0] * 30, P[1] * 30, P[2] * 30, 3);
        // the bare scalp is the forehead's colour, but blotchy (uneven pallor, livid patches) - not a plaster dome
        const k0 = 0.8 + 0.16 * n + 0.12 * N3.fbm(P[0] * 9 + 3, P[1] * 9, P[2] * 9, 3);
        over(c, [fh[0] * k0, fh[1] * k0, fh[2] * k0], b * 0.96);
        mul(c, lin([170, 150, 176]), smoothstep(0.05, 0.55, N3.fbm(P[0] * 5 + 9, P[1] * 5, P[2] * 5, 3)) * b * 0.7);
        mul(c, lin([200, 206, 176]), smoothstep(0.1, 0.6, -N3.fbm(P[0] * 7, P[1] * 7 + 4, P[2] * 7, 3)) * b * 0.5);
        // age / liver spots and a few scabbed scratches on the bare crown
        const sp = (1 - smoothstep(0.1, 0.22, N3.worley(P[0] * 70, P[1] * 70, P[2] * 70))) * smoothstep(-0.1, 0.4, N3.fbm(P[0] * 8 + 2, P[1] * 8, P[2] * 8, 2));
        over(c, C.ageSpot, sp * b * 0.7);
        // greasy dirt smudges
        over(c, lin([74, 64, 54]), smoothstep(0.25, 0.7, N3.fbm(P[0] * 11 + 1, P[1] * 11, P[2] * 11, 4)) * b * 0.4);
        const scr = smoothstep(0.82, 0.95, N3.ridged(P[0] * 30, P[1] * 6, P[2] * 30, 2)) * smoothstep(0.2, 0.6, N3.fbm(P[0] * 6, P[1] * 6, P[2] * 6, 2));
        over(c, lin([110, 40, 38]), scr * b * 0.6);
      }
      if (b < 1 && P[1] > eyeY && P[2] < eyeZ + 0.01 && Math.hypot(P[0], P[2] - eyeZ + 0.085) < 0.13 && !(Math.abs(P[0]) > 0.066 && P[1] < eyeY + 0.045)) {
        // fringe scalp: skin tone with light grey stubble instead of the source skin's dark brown stubble
        const st = smoothstep(0.3, 0.7, N3.noise(P[0] * 900, P[1] * 900, P[2] * 900) * 0.5 + 0.5);
        const k0 = 0.88 + 0.08 * st;
        over(c, [fh[0] * k0, fh[1] * k0, fh[2] * k0 * 1.03], 0.8 * (1 - b));
      }
    }
    out.data[di] = toByte(c[0]); out.data[di + 1] = toByte(c[1]); out.data[di + 2] = toByte(c[2]);
  }
  out.mask = mask;
  out.cav = cav;
  return out;
}

/**
 * Pushes painted colours out of the UV islands (the low-poly proxy's UVs stray a little outside the base mesh
 * islands at toe and finger tips, which otherwise sample unpainted texels): `passes` rings of 4-neighbour
 * averaging into texels where mask == 0.
 */
function dilate(img, mask, passes) {
  const W = img.width, H = img.height, d = img.data;
  let m = mask.slice();
  for (let p = 0; p < passes; p++) {
    const next = m.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (m[i]) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
        if (j < 0 || !m[j]) continue;
        r += d[j * 4]; g += d[j * 4 + 1]; b += d[j * 4 + 2]; n++;
      }
      if (!n) continue;
      d[i * 4] = r / n; d[i * 4 + 1] = g / n; d[i * 4 + 2] = b / n;
      next[i] = 1;
    }
    m = next;
  }
}

/** Faded jeans (greyer, dirtier denim) and an old man's dark brown shirt with tan / cream pinstripes. */
function recolourSuit(img) {
  const out = { width: img.width, height: img.height, data: new Uint8Array(img.data) };
  const c = [0, 0, 0];
  const tan = lin([138, 124, 102]);
  for (let i = 0; i < out.data.length; i += 4) {
    for (let k = 0; k < 3; k++) c[k] = LUT[img.data[i + k]];
    const l = lumOf(c);
    const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
    if (b > r + 18 && b >= g) {
      over(c, [l * 0.95, l, l * 1.08], 0.25); // denim: lose some saturation, darker (dirty, wet)
      c[0] *= 0.76; c[1] *= 0.78; c[2] *= 0.8;
    } else {
      // dark brown ground (sRGB ~61, so the back does not go black under a rim light) with faded tan pinstripes
      // only ~15 % lighter in value: a cheap old shirt washed a hundred times, not a candy-striped one
      const s = smoothstep(0.03, 0.35, l);
      const tgt = 0.046 * (1 + 0.36 * s);
      const hue = [mix(1.3, tan[0] / lumOf(tan), s), 1, mix(0.66, tan[2] / lumOf(tan), s)];
      const hl = lumOf(hue);
      for (let k = 0; k < 3; k++) c[k] = tgt * hue[k] / hl;
    }
    out.data[i] = toByte(c[0]); out.data[i + 1] = toByte(c[1]); out.data[i + 2] = toByte(c[2]);
  }
  return out;
}

/**
 * Top edge of the jeans across the front: highest denim-blue vertex (texel test on the recoloured garment
 * texture) per 2 cm x-bin, as a piecewise-linear function of x.
 */
function jeansTopLine(part, img) {
  const S = img.width, NB = 31, top = new Float32Array(NB).fill(-1);
  part.obj.faces.forEach((f) => f.v.forEach((v, k) => {
    const t = f.t[k];
    const x = Math.min(S - 1, Math.floor(part.obj.uvs[t * 2] * S)), y = Math.min(S - 1, Math.floor((1 - part.obj.uvs[t * 2 + 1]) * S));
    const di = (y * S + x) * 4;
    if (!(img.data[di + 2] > img.data[di] + 10)) return;
    const px = part.pos[v * 3], py = part.pos[v * 3 + 1], pz = part.pos[v * 3 + 2];
    if (pz < 0.0 || Math.abs(px) > 0.3) return;
    const b = Math.round((px + 0.3) / 0.02);
    top[b] = Math.max(top[b], py);
  }));
  for (let pass = 0; pass < NB; pass++) for (let b = 0; b < NB; b++) if (top[b] < 0) top[b] = Math.max(b > 0 ? top[b - 1] : -1, b < NB - 1 ? top[b + 1] : -1);
  return (x) => {
    const f = Math.min(NB - 1, Math.max(0, (x + 0.3) / 0.02));
    const i = Math.floor(f), j = Math.min(NB - 1, i + 1);
    return mix(top[i], top[j], f - i);
  };
}

/**
 * Burst placket: cuts the shirt (never the jeans: triangles are labelled by the garment texture at their UV
 * centroid) where openSD(P) < 0, with a ~7 mm frayed thread fringe, paints a sweat-dark, grimy edge with a dried
 * blood rim on the strained fronts, and deletes shirt faces lying deep inside the opening.
 */
function cutShirt(part, img, base, openSD, N3) {
  const S = img.width, BS = base.width;
  const tris = part.tris(), nrm = part.normals();
  const r = rasterUV(tris, part.obj.uvs, S, 6);
  const uvs = part.obj.uvs;
  const denimUV = (u, v) => {
    const i = (Math.min(BS - 1, Math.floor((1 - v) * BS)) * BS + Math.min(BS - 1, Math.floor(u * BS))) * 4;
    return base.data[i + 2] > base.data[i] + 10;
  };
  const nt = tris.length / 6, denimT = new Uint8Array(nt);
  for (let t = 0; t < nt; t++) {
    let u = 0, v = 0;
    for (let k = 0; k < 3; k++) { const ti = tris[t * 6 + k * 2 + 1]; u += uvs[ti * 2] / 3; v += uvs[ti * 2 + 1] / 3; }
    denimT[t] = denimUV(u, v) ? 1 : 0;
  }
  const P = [0, 0, 0], Nn = [0, 0, 0], c = [0, 0, 0];
  const fw = 0.007;
  let cutTexels = 0;
  for (let i = 0; i < S * S; i++) {
    const t = r.tri[i];
    if (t < 0 || denimT[t]) continue;
    texelSurface(r, tris, part.pos, nrm, i, P, Nn);
    const sd = openSD(P);
    if (sd > 0.06) continue;
    const x = i % S, y = (i / S) | 0;
    let cut = sd < 0;
    if (!cut && sd < fw) {
      const k = sd / fw;
      const tu = Math.abs(N3.noise(x / 6, y * 6 / S, 1.3)), tv = Math.abs(N3.noise(x * 6 / S, y / 6, 2.1));
      cut = Math.min(tu, tv) > 0.07 + 0.9 * k * k * k;
    }
    const di = i * 4;
    if (cut) { img.data[di + 3] = 0; cutTexels++; continue; }
    for (let k = 0; k < 3; k++) c[k] = LUT[img.data[di + k]];
    const e = 1 - smoothstep(0.0, 0.05, sd);
    const kk = 1 - e * 0.4; c[0] *= kk; c[1] *= kk; c[2] *= kk;
    over(c, lin([70, 58, 44]), e * 0.15 * smoothstep(-0.2, 0.4, N3.fbm(P[0] * 20, P[1] * 20, P[2] * 20, 3)));
    const bf = e * 0.62 + N3.fbm(P[0] * 30 + 2, P[1] * 30, P[2] * 30, 3) * 0.4;
    const bl = smoothstep(0.47, 0.52, bf);
    over(c, lin([54, 16, 12]), bl * 0.8);
    over(c, lin([30, 12, 9]), bl * (1 - smoothstep(0.52, 0.6, bf)) * 0.5);
    img.data[di] = toByte(c[0]); img.data[di + 1] = toByte(c[1]); img.data[di + 2] = toByte(c[2]);
  }
  let removed = 0;
  part.obj.faces.forEach((f, fi) => {
    if (!part.keep[fi]) return;
    let u = 0, v = 0;
    f.t.forEach((tt) => { u += uvs[tt * 2] / f.t.length; v += uvs[tt * 2 + 1] / f.t.length; });
    if (denimUV(u, v)) return;
    const pts = f.v.map((vi) => [part.pos[vi * 3], part.pos[vi * 3 + 1], part.pos[vi * 3 + 2]]);
    const cen = [0, 1, 2].map((k) => pts.reduce((a, p) => a + p[k], 0) / pts.length);
    if ([...pts, cen].every((p) => openSD(p) < -0.012)) { part.keep[fi] = 0; removed++; }
  });
  return { removed, cutTexels };
}

/** Closest morphed base-mesh body vertex to p (metres). */
function nearestBody(h, p) {
  let best = null, bd = Infinity;
  for (const v of h.baseObj.groupVerts('body')) {
    const d = (h.pos[v * 3] - p[0]) ** 2 + (h.pos[v * 3 + 1] - p[1]) ** 2 + (h.pos[v * 3 + 2] - p[2]) ** 2;
    if (d < bd) { bd = d; best = [h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]]; }
  }
  return best;
}

/**
 * Roughness post-pass on the skin ORM (green): fn(P) -> v; v >= 0 is a minimum roughness (wounds / blood
 * matte), v < 0 caps the roughness at -v (small wet spots that keep a gloss).
 */
function wetPass(h, orm, fn) {
  const S = orm.width;
  const bp = h.basePart({ name: 'wet' });
  const tris = bp.tris(), nrm = bp.normals();
  const r = rasterUV(tris, h.baseObj.uvs, S, 4);
  const P = [0, 0, 0], Nn = [0, 0, 0];
  for (let i = 0; i < S * S; i++) {
    if (!texelSurface(r, tris, h.pos, nrm, i, P, Nn)) continue;
    const v = fn(P);
    const g = orm.data[i * 4 + 1] / 255;
    orm.data[i * 4 + 1] = Math.round((v < 0 ? Math.min(g, -v) : Math.max(g, v)) * 255);
  }
}

/** Multiplies the skin ORM's occlusion (R) by fn(P, N, raster, tris, texel) on the base-mesh UV layout. */
function occlusionPass(h, orm, fn) {
  const S = orm.width;
  const bp = h.basePart({ name: 'occ' });
  const tris = bp.tris(), nrm = bp.normals();
  const r = rasterUV(tris, h.baseObj.uvs, S, 4);
  const P = [0, 0, 0], Nn = [0, 0, 0];
  for (let i = 0; i < S * S; i++) {
    if (!texelSurface(r, tris, h.pos, nrm, i, P, Nn)) continue;
    orm.data[i * 4] = Math.round(orm.data[i * 4] * Math.max(0, Math.min(1, fn(P, Nn, r, tris, i))));
  }
}

/**
 * Brow guide from the fitted eyebrow cards: per side (0 = left / +x, 1 = right), the brow's x range (|x|) and
 * its centre height / half height along it.
 */
function browField(part) {
  const sides = [[], []];
  for (let v = 0; v < part.nVerts; v++) {
    const p = [part.pos[v * 3], part.pos[v * 3 + 1], part.pos[v * 3 + 2]];
    sides[p[0] > 0 ? 0 : 1].push(p);
  }
  return sides.map((pts) => {
    const ax = pts.map((p) => Math.abs(p[0]));
    const x0 = Math.min(...ax), x1 = Math.max(...ax);
    const NB = 10, ys = new Array(NB).fill(null), hs = new Array(NB).fill(null);
    for (let b = 0; b < NB; b++) {
      const lo = x0 + (x1 - x0) * b / NB - 1e-6, hi = x0 + (x1 - x0) * (b + 1) / NB + 1e-6;
      const yv = pts.filter((p) => Math.abs(p[0]) >= lo && Math.abs(p[0]) <= hi).map((p) => p[1]);
      if (!yv.length) continue;
      ys[b] = (Math.min(...yv) + Math.max(...yv)) / 2; hs[b] = (Math.max(...yv) - Math.min(...yv)) / 2;
    }
    for (let pass = 0; pass < NB; pass++) for (let b = 0; b < NB; b++) if (ys[b] === null) {
      const n = ys[b - 1] ?? ys[b + 1] ?? null;
      if (n !== null) { ys[b] = n; hs[b] = hs[b - 1] ?? hs[b + 1]; }
    }
    return {
      x0, x1,
      at: (a) => {
        const f = Math.min(NB - 1, Math.max(0, (a - x0) / (x1 - x0) * NB - 0.5));
        const i = Math.floor(f), j = Math.min(NB - 1, i + 1);
        return { y: mix(ys[i], ys[j], f - i), hw: Math.max(0.003, mix(hs[i], hs[j], f - i)) };
      },
    };
  });
}

/**
 * Toe tips on the morphed base mesh (it has modelled toes; the low-poly proxy foot is a mitten that samples the
 * same UV layout): per foot, the most-forward vertex per 2 mm x-bin, 5 toes spread over the front edge. Returns
 * [{p, r (half nail width), side, ball (z of the ball joint), xIn, xOut (|x| range of that foot's toes)}].
 */
function toeTips(h) {
  const B = h.skeleton.byName, out = [];
  for (const [s, sgn] of [['l', 1], ['r', -1]]) {
    const ball = B[`ball_${s}`].head;
    const bins = new Map();
    for (const v of h.baseObj.groupVerts('body')) {
      const x = h.pos[v * 3], y = h.pos[v * 3 + 1], z = h.pos[v * 3 + 2];
      if (y > 0.06 || x * sgn < 0.01 || z < ball.z) continue;
      const k = Math.round(x / 0.002);
      const b = bins.get(k);
      if (!b || z > b[2]) bins.set(k, [x, y, z]);
    }
    const keys = [...bins.keys()].sort((a, b) => a - b);
    // the toes are too close for clean peaks: spread 5 toes over the front edge of the foot (big toe medial)
    const zmax = Math.max(...keys.map((k) => bins.get(k)[2]));
    const front = keys.map((k) => bins.get(k)).filter((p) => p[2] > zmax - 0.035).map((p) => Math.abs(p[0]));
    const xIn = Math.min(...front), xOut = Math.max(...front);
    [0.15, 0.41, 0.6, 0.77, 0.91].forEach((f, i) => {
      const ax = mix(xIn, xOut, f);
      let tip = null;
      for (const k of keys) { const p = bins.get(k); if (Math.abs(Math.abs(p[0]) - ax) < 0.004 && (!tip || p[2] > tip[2])) tip = p; }
      if (tip) out.push({ p: [sgn * ax, tip[1], tip[2]], r: i === 0 ? 0.0085 : 0.0052, side: s, ball: ball.z, xIn, xOut });
    });
  }
  return out;
}

/** Removes individual teeth (connected components) nearest to the given x on the upper/lower row (front). */
function pullTeeth(teeth, picks) {
  const n = teeth.nVerts;
  const par = new Int32Array(n).map((_, i) => i);
  const find = (x) => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
  teeth.obj.faces.forEach((f) => { for (let k = 1; k < f.v.length; k++) par[find(f.v[k])] = find(f.v[0]); });
  const comps = new Map();
  for (let i = 0; i < n; i++) { const r = find(i); if (!comps.has(r)) comps.set(r, []); comps.get(r).push(i); }
  const list = [...comps.values()].filter((vs) => vs.length < 400).map((vs) => {
    const c = [0, 0, 0];
    for (const v of vs) for (let k = 0; k < 3; k++) c[k] += teeth.pos[v * 3 + k] / vs.length;
    return { vs, c };
  });
  const midY = list.reduce((a, t) => a + t.c[1], 0) / list.length;
  const gone = new Set();
  for (const [x, row] of picks) {
    let best = null, bd = 1e9;
    for (const t of list) {
      if ((row === 'up') !== (t.c[1] > midY)) continue;
      const d = Math.abs(t.c[0] - x) - t.c[2] * 0.2; // prefer the front of the arch
      if (d < bd) { bd = d; best = t; }
    }
    if (best) best.vs.forEach((v) => gone.add(v));
  }
  let removed = 0;
  teeth.obj.faces.forEach((f, fi) => { if (teeth.keep[fi] && f.v.every((v) => gone.has(v))) { teeth.keep[fi] = 0; removed++; } });
  return removed;
}

/** Silver-grey greasy hair colour keeping the strand luminance variation. */
function greyHair(img, level = 0.8) {
  const out = { width: img.width, height: img.height, data: new Uint8Array(img.data) };
  let sum = 0, cnt = 0;
  for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3] > 128) { sum += LUT[img.data[i]] * 0.3 + LUT[img.data[i + 1]] * 0.6 + LUT[img.data[i + 2]] * 0.1; cnt++; }
  const mean = sum / Math.max(1, cnt) || 0.05;
  const g = lin([166, 169, 174]).map((x) => x * level);
  for (let i = 0; i < img.data.length; i += 4) {
    const l = LUT[img.data[i]] * 0.3 + LUT[img.data[i + 1]] * 0.6 + LUT[img.data[i + 2]] * 0.1;
    const k = img.data[i + 3] > 40 ? 0.25 + 0.8 * Math.min(2, l / mean) : 1;
    out.data[i] = toByte(g[0] * k); out.data[i + 1] = toByte(g[1] * k); out.data[i + 2] = toByte(g[2] * k * 1.02);
  }
  return out;
}

/**
 * Horseshoe fringe: the crown is cut out of the scalp-hugging hair shell (alpha + fully bald faces deleted) and
 * the hair thins out over ~2 cm towards the bald edge (stippled alpha that mips to a soft fade, no hard rim).
 */
function fringeHair(part, img, baldness, N3, bite) {
  const S = img.width;
  const out = greyHair(img, 0.24);
  const tris = part.tris(), nrm = part.normals();
  const r = rasterUV(tris, part.obj.uvs, S, 4);
  const P = [0, 0, 0], Nn = [0, 0, 0];
  // the thinning top edge wanders by 1-2 cm (no straight horizontal line in profile) and fades over ~3 cm
  const edgeRaw = (p) => baldness(p, false, true) + N3.fbm(p[0] * 32 + 5, p[1] * 32, p[2] * 32, 3) * 0.14 + N3.noise(p[0] * 150, p[1] * 150, p[2] * 150) * 0.04;
  const nearBite = (p) => dist(p, bite.p) / bite.r - 1.35 + N3.fbm(p[0] * 60, p[1] * 60, p[2] * 60, 2) * 0.5;
  for (let i = 0; i < S * S; i++) {
    if (!texelSurface(r, tris, part.pos, nrm, i, P, Nn)) continue;
    const raw = edgeRaw(P);
    const density = (1 - smoothstep(-0.42, 0.05, raw)) * 0.9 * smoothstep(0.0, 0.6, nearBite(P));
    const grain = N3.noise(P[0] * 700, P[1] * 700, P[2] * 700) * 0.5 + 0.5;
    const clump = N3.fbm(P[0] * 45, P[1] * 45, P[2] * 45, 3) * 0.25 + N3.fbm(P[0] * 18 + 3, P[1] * 18, P[2] * 18, 2) * 0.2;
    const a = grain + clump < density * 1.15 ? 1 : 0;
    out.data[i * 4 + 3] = Math.round(out.data[i * 4 + 3] * a);
    const e = 1 - smoothstep(0.15, 0.7, density);
    if (e > 0) {
      const k = e * 0.75;
      out.data[i * 4] = Math.round(mix(out.data[i * 4], 128, k));
      out.data[i * 4 + 1] = Math.round(mix(out.data[i * 4 + 1], 134, k));
      out.data[i * 4 + 2] = Math.round(mix(out.data[i * 4 + 2], 146, k));
    }
  }
  let removed = 0;
  part.obj.faces.forEach((f, fi) => {
    if (!part.keep[fi]) return;
    const pts = f.v.map((v) => [part.pos[v * 3], part.pos[v * 3 + 1], part.pos[v * 3 + 2]]);
    if (pts.every((p) => edgeRaw(p) > 0.06 || nearBite(p) < -0.1)) { part.keep[fi] = 0; removed++; }
  });
  return out;
}

/**
 * Pulls the hair shell towards the scalp: every hair vertex is moved along its offset from the closest point of
 * the (morphed, high-resolution) body surface, to `k` of the original height (close crop), and to ~2-3 mm along
 * the bald edge (where `baldness` raw -> 0) so the thinning fringe lies on the skin.
 */
function cropHair(h, part, baldness, eyeY) {
  const hp = h.pos, bodyG = h.baseObj.groupIndex.get('body');
  const bt = [];
  for (const f of h.baseObj.faces) {
    if (f.g !== bodyG || !f.v.every((v) => hp[v * 3 + 1] > eyeY - 0.12)) continue;
    for (let k = 1; k + 1 < f.v.length; k++) bt.push(f.v[0], f.v[k], f.v[k + 1]);
  }
  const pos = part.pos, n = pos.length / 3;
  let moved = 0, sum0 = 0, sum1 = 0;
  for (let i = 0; i < n; i++) {
    const p = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
    let best = Infinity, q = null;
    for (let j = 0; j < bt.length; j += 3) {
      const a = bt[j] * 3, b = bt[j + 1] * 3, c = bt[j + 2] * 3;
      const dx = hp[a] - p[0], dy = hp[a + 1] - p[1], dz = hp[a + 2] - p[2];
      if (dx * dx + dy * dy + dz * dz > 0.0016 + best * 4) continue;
      const w = closestBary(p, hp, a, b, c);
      const qq = [0, 1, 2].map((k) => hp[a + k] * w[0] + hp[b + k] * w[1] + hp[c + k] * w[2]);
      const d = (qq[0] - p[0]) ** 2 + (qq[1] - p[1]) ** 2 + (qq[2] - p[2]) ** 2;
      if (d < best) { best = d; q = qq; }
    }
    if (!q) continue;
    const d = Math.sqrt(best);
    const raw = baldness(p, false, true);
    // close crop everywhere (~45 %), flush near the bald edge
    const edge = smoothstep(-0.3, -0.04, raw);
    const target = Math.max(0.0025, mix(d * 0.45, 0.0025, edge));
    if (target >= d) continue;
    const s = target / d;
    for (let k = 0; k < 3; k++) pos[i * 3 + k] = q[k] + (p[k] - q[k]) * s;
    moved++; sum0 += d; sum1 += target;
  }
  console.log(`  walker_b: hair cropped ${moved}/${n} verts, mean height ${(sum0 / Math.max(1, moved) * 1000).toFixed(1)} -> ${(sum1 / Math.max(1, moved) * 1000).toFixed(1)} mm`);
}

/**
 * Red-green refinement of a proxy Part inside `zone` (position predicate): every triangle fully inside is split
 * into 4, its neighbours into 2-3 (no T-junctions). New vertices are projected onto the high-resolution base
 * mesh (keeping the proxy's local offset from it) and bound to the base triangle they land on, so they morph,
 * skin and get `_seg` like every other vertex. Returns a new Part.
 */
function refineSurface(lib, h, part, zone) {
  const obj = part.obj, pos = part.pos, n0 = pos.length / 3;
  const Pv = (v) => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
  const inR = new Uint8Array(n0);
  for (let v = 0; v < n0; v++) inR[v] = zone(Pv(v)) ? 1 : 0;
  // base-mesh triangles around the zone (projection targets)
  const hp = h.pos, bodyG = h.baseObj.groupIndex.get('body');
  const bt = [];
  for (const f of h.baseObj.faces) {
    if (f.g !== bodyG || !f.v.every((v) => zone([hp[v * 3], hp[v * 3 + 1], hp[v * 3 + 2]], 0.03))) continue;
    for (let k = 1; k + 1 < f.v.length; k++) bt.push(f.v[0], f.v[k], f.v[k + 1]);
  }
  const project = (p) => {
    let best = Infinity, out = null;
    for (let i = 0; i < bt.length; i += 3) {
      const a = bt[i] * 3, b = bt[i + 1] * 3, c = bt[i + 2] * 3;
      const dx = hp[a] - p[0], dy = hp[a + 1] - p[1], dz = hp[a + 2] - p[2];
      if (dx * dx + dy * dy + dz * dz > 0.0009 + best) continue;
      const w = closestBary(p, hp, a, b, c);
      const q = [0, 1, 2].map((k) => hp[a + k] * w[0] + hp[b + k] * w[1] + hp[c + k] * w[2]);
      const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2;
      if (d < best) { best = d; out = { q, tri: [bt[i], bt[i + 1], bt[i + 2]], w }; }
    }
    return out;
  };
  const tris = [];
  obj.faces.forEach((f, fi) => {
    if (!part.keep[fi]) return;
    for (let k = 1; k + 1 < f.v.length; k++) tris.push({ v: [f.v[0], f.v[k], f.v[k + 1]], t: [f.t[0], f.t[k], f.t[k + 1]], g: f.g });
  });
  const ek = (a, b) => (a < b ? a * 1e6 + b : b * 1e6 + a);
  const split = new Set();
  for (const t of tris) if (inR[t.v[0]] && inR[t.v[1]] && inR[t.v[2]]) for (let k = 0; k < 3; k++) split.add(ek(t.v[k], t.v[(k + 1) % 3]));
  const newPos = Array.from(pos), refIdx = Array.from(part.refIdx), refW = Array.from(part.refW);
  const off = new Map();
  const offsetOf = (v) => {
    if (!off.has(v)) { const p = Pv(v), pr = project(p); off.set(v, pr ? [p[0] - pr.q[0], p[1] - pr.q[1], p[2] - pr.q[2]] : [0, 0, 0]); }
    return off.get(v);
  };
  const midV = new Map();
  for (const e of split) {
    const a = Math.floor(e / 1e6), b = e - a * 1e6;
    const pa = Pv(a), pb = Pv(b);
    const m = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2];
    const pr = project(m);
    const idx = newPos.length / 3;
    if (pr) {
      const oa = offsetOf(a), ob = offsetOf(b);
      newPos.push(pr.q[0] + (oa[0] + ob[0]) / 2, pr.q[1] + (oa[1] + ob[1]) / 2, pr.q[2] + (oa[2] + ob[2]) / 2);
      refIdx.push(...pr.tri); refW.push(...pr.w);
    } else {
      newPos.push(...m);
      refIdx.push(part.refIdx[a * 3], part.refIdx[b * 3], part.refIdx[a * 3 + 1]); refW.push(0.5, 0.5, 0);
    }
    midV.set(e, idx);
  }
  const uvs = Array.from(obj.uvs), midT = new Map();
  const uvMid = (ta, tb) => {
    if (ta < 0 || tb < 0) return -1;
    const key = ta < tb ? ta * 1e6 + tb : tb * 1e6 + ta;
    if (!midT.has(key)) { midT.set(key, uvs.length / 2); uvs.push((uvs[ta * 2] + uvs[tb * 2]) / 2, (uvs[ta * 2 + 1] + uvs[tb * 2 + 1]) / 2); }
    return midT.get(key);
  };
  const faces = [];
  for (const t of tris) {
    const sp = [0, 1, 2].map((k) => split.has(ek(t.v[k], t.v[(k + 1) % 3])));
    const n = sp.filter(Boolean).length;
    if (!n) { faces.push(t); continue; }
    const r = n === 1 ? sp.indexOf(true) : n === 2 ? (sp.indexOf(false) + 1) % 3 : 0;
    const V = [0, 1, 2].map((k) => t.v[(k + r) % 3]), T = [0, 1, 2].map((k) => t.t[(k + r) % 3]);
    const M = (k) => midV.get(ek(V[k], V[(k + 1) % 3])), MT = (k) => uvMid(T[k], T[(k + 1) % 3]);
    const F = (v, tt) => faces.push({ v, t: tt, g: t.g });
    if (n === 1) {
      F([V[0], M(0), V[2]], [T[0], MT(0), T[2]]); F([M(0), V[1], V[2]], [MT(0), T[1], T[2]]);
    } else if (n === 2) {
      F([M(0), V[1], M(1)], [MT(0), T[1], MT(1)]); F([V[0], M(0), M(1)], [T[0], MT(0), MT(1)]); F([V[0], M(1), V[2]], [T[0], MT(1), T[2]]);
    } else {
      F([V[0], M(0), M(2)], [T[0], MT(0), MT(2)]); F([M(0), V[1], M(1)], [MT(0), T[1], MT(1)]);
      F([M(2), M(1), V[2]], [MT(2), MT(1), T[2]]); F([M(0), M(1), M(2)], [MT(0), MT(1), MT(2)]);
    }
  }
  const nobj = { ...obj, uvs: Float32Array.from(uvs), faces, positions: null };
  const out = new lib.Part({ name: part.name, role: part.role, obj: nobj, pos: Float32Array.from(newPos), refIdx: Int32Array.from(refIdx), refW: Float32Array.from(refW) });
  out.bindWeights(h.weights, h.skeleton.bones);
  out.asset = part.asset; out.binding = part.binding; out.deleteVerts = part.deleteVerts;
  console.log(`  walker_b: refined ${part.name}: ${tris.length} -> ${faces.length} tris (${split.size} new verts, ${bt.length / 3} base tris)`);
  return out;
}

/** Barycentric weights of the point on triangle (a, b, c) (offsets into pos) closest to p (Ericson). */
function closestBary(p, pos, a, b, c) {
  const abx = pos[b] - pos[a], aby = pos[b + 1] - pos[a + 1], abz = pos[b + 2] - pos[a + 2];
  const acx = pos[c] - pos[a], acy = pos[c + 1] - pos[a + 1], acz = pos[c + 2] - pos[a + 2];
  const apx = p[0] - pos[a], apy = p[1] - pos[a + 1], apz = p[2] - pos[a + 2];
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return [1, 0, 0];
  const bpx = p[0] - pos[b], bpy = p[1] - pos[b + 1], bpz = p[2] - pos[b + 2];
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return [0, 1, 0];
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [1 - v, v, 0]; }
  const cpx = p[0] - pos[c], cpy = p[1] - pos[c + 1], cpz = p[2] - pos[c + 2];
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return [0, 0, 1];
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [1 - w, 0, w]; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return [0, 1 - w, w]; }
  const den = 1 / (va + vb + vc);
  const v = vb * den, w = vc * den;
  return [1 - v - w, v, w];
}

/**
 * Dead eyes painted over the MakeHuman eye texture (two eyeballs; iris / pupil found by saturation): dull
 * yellow-grey sclera with a dense red capillary web that thickens towards the corners, a dark limbal ring and a
 * milky grey-blue cataract over iris and pupil.
 */
function deadEyes(img, N3) {
  const W = img.width, H = img.height;
  const out = { width: W, height: H, data: new Uint8Array(img.data) };
  const c = [0, 0, 0];
  // iris centres / radii from the saturated or very dark texels (two clusters split by the diagonal)
  const acc = [[0, 0, 0], [0, 0, 0]];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx < 40 || (mx - mn) / mx > 0.45) { const k = x < y ? 0 : 1; acc[k][0] += x; acc[k][1] += y; acc[k][2]++; }
  }
  const eyesC = acc.map(([sx, sy, n]) => ({ x: sx / Math.max(1, n), y: sy / Math.max(1, n), R: Math.sqrt(n / Math.PI) }));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    for (let k = 0; k < 3; k++) c[k] = LUT[img.data[i + k]];
    const e = eyesC[x < y ? 0 : 1];
    const dx = x - e.x, dy = y - e.y;
    const d = Math.hypot(dx, dy) / e.R;
    const ang = Math.atan2(dy, dx);
    const u = x / W, v = y / H;
    const sl = Math.min(1.2, lumOf(c) / 0.55);
    if (d > 1.12) {
      // sclera: dull, yellow-grey, bloodshot (denser away from the iris)
      over(c, lin([150, 136, 108]).map((q) => q * sl), 0.9);
      const vein = N3.ridged(u * 34, v * 34, 1.7, 3), vein2 = N3.ridged(u * 80 + 3, v * 80, 4.2, 2);
      const far = smoothstep(1.4, 3.2, d);
      over(c, lin([118, 18, 18]), smoothstep(0.55 - far * 0.15, 0.8, vein) * (0.55 + far * 0.45));
      over(c, lin([130, 30, 26]), smoothstep(0.7, 0.9, vein2) * far * 0.6);
      mul(c, lin([210, 150, 140]), far * 0.5);
    } else if (d > 0.98) {
      over(c, lin([62, 64, 70]), 0.85); // dark limbal ring
    } else {
      // milky cataract: pale grey-blue, faint radial iris fibres, clouded grey pupil
      const fib = N3.noise(ang * 9, d * 3, 2.5) * 0.5 + 0.5;
      const col = lin([116, 124, 130]).map((q) => q * (0.85 + 0.25 * fib) * (1 - 0.3 * smoothstep(0.6, 0.98, d)));
      for (let k = 0; k < 3; k++) c[k] = col[k];
      over(c, lin([84, 90, 96]), (1 - smoothstep(0.22, 0.38, d)) * 0.75);
      over(c, lin([160, 166, 168]), smoothstep(0.3, 0.8, N3.fbm(u * 60, v * 60, 0.5, 3)) * 0.3);
    }
    out.data[i] = toByte(c[0]); out.data[i + 1] = toByte(c[1]); out.data[i + 2] = toByte(c[2]);
  }
  return out;
}


/**
 * Concavity of a triangle mesh per vertex, normalised so ~1 = strong: `fine` = umbrella Laplacian along the
 * normal (1-ring creases), `broad` = offset to a heavily smoothed copy of the surface (folds a few cm wide).
 * Positive = concave (occluded), negative = convex.
 */
function cavityFields(tris, pos, nrm) {
  const n = pos.length / 3;
  const used = new Uint8Array(n);
  const edges = [];
  for (let i = 0; i < tris.length; i += 6) {
    const v = [tris[i], tris[i + 2], tris[i + 4]];
    for (let k = 0; k < 3; k++) { edges.push(v[k], v[(k + 1) % 3]); used[v[k]] = 1; }
  }
  const smoothPos = (src) => {
    const acc = new Float32Array(n * 3), cnt = new Float32Array(n);
    for (let e = 0; e < edges.length; e += 2) {
      const a = edges[e], b = edges[e + 1];
      for (let j = 0; j < 3; j++) { acc[a * 3 + j] += src[b * 3 + j]; acc[b * 3 + j] += src[a * 3 + j]; }
      cnt[a]++; cnt[b]++;
    }
    for (let v = 0; v < n; v++) if (cnt[v]) for (let j = 0; j < 3; j++) acc[v * 3 + j] /= cnt[v]; else for (let j = 0; j < 3; j++) acc[v * 3 + j] = src[v * 3 + j];
    return acc;
  };
  const along = (q) => {
    const out = new Float32Array(n);
    for (let v = 0; v < n; v++) out[v] = used[v] ? (q[v * 3] - pos[v * 3]) * nrm[v * 3] + (q[v * 3 + 1] - pos[v * 3 + 1]) * nrm[v * 3 + 1] + (q[v * 3 + 2] - pos[v * 3 + 2]) * nrm[v * 3 + 2] : 0;
    return out;
  };
  const norm = (a) => {
    const vals = [];
    for (let v = 0; v < n; v++) if (used[v] && a[v] > 0) vals.push(a[v]);
    vals.sort((x, y) => x - y);
    const p = vals[Math.floor(vals.length * 0.92)] || 1;
    for (let v = 0; v < n; v++) a[v] /= p;
    return a;
  };
  const fine = norm(along(smoothPos(pos)));
  let q = pos;
  for (let it = 0; it < 14; it++) q = smoothPos(q);
  const broad = norm(along(q));
  return { fine, broad };
}

/**
 * Base-mesh body vertices whose outward normal ray hits a triangle of `part` within maxD (Moller-Trumbore,
 * triangles bucketed in a uniform grid by their bounding boxes).
 */
function rayCovered(h, part, maxD) {
  const P = part.pos, tris = part.tris();
  const cell = maxD, grid = new Map();
  const key = (x, y, z) => x + ',' + y + ',' + z;
  for (let i = 0; i < tris.length; i += 6) {
    const a = tris[i] * 3, b = tris[i + 2] * 3, c = tris[i + 4] * 3;
    const lo = [0, 1, 2].map((k) => Math.floor(Math.min(P[a + k], P[b + k], P[c + k]) / cell));
    const hi = [0, 1, 2].map((k) => Math.floor(Math.max(P[a + k], P[b + k], P[c + k]) / cell));
    for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
      const k = key(x, y, z);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(i);
    }
  }
  const bp = h.basePart({ name: 'raycover' });
  const nrm = bp.normals();
  const hp = h.pos, out = [];
  for (const v of h.baseObj.groupVerts('body')) {
    const o = [hp[v * 3] + nrm[v * 3] * 0.002, hp[v * 3 + 1] + nrm[v * 3 + 1] * 0.002, hp[v * 3 + 2] + nrm[v * 3 + 2] * 0.002];
    const d = [nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]];
    const cx = Math.floor(o[0] / cell), cy = Math.floor(o[1] / cell), cz = Math.floor(o[2] / cell);
    const seen = new Set();
    let hit = false;
    for (let x = cx - 1; x <= cx + 1 && !hit; x++) for (let y = cy - 1; y <= cy + 1 && !hit; y++) for (let z = cz - 1; z <= cz + 1 && !hit; z++) {
      for (const i of grid.get(key(x, y, z)) || []) {
        if (seen.has(i)) continue;
        seen.add(i);
        const a = tris[i] * 3, b = tris[i + 2] * 3, c = tris[i + 4] * 3;
        const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
        const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
        const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
        if (Math.abs(det) < 1e-12) continue;
        const inv = 1 / det;
        const t0 = [o[0] - P[a], o[1] - P[a + 1], o[2] - P[a + 2]];
        const u = (t0[0] * p[0] + t0[1] * p[1] + t0[2] * p[2]) * inv;
        if (u < 0 || u > 1) continue;
        const q = [t0[1] * e1[2] - t0[2] * e1[1], t0[2] * e1[0] - t0[0] * e1[2], t0[0] * e1[1] - t0[1] * e1[0]];
        const w = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) * inv;
        if (w < 0 || u + w > 1) continue;
        const t = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv;
        if (t > 0 && t < maxD) { hit = true; break; }
      }
    }
    if (hit) out.push(v);
  }
  return out;
}
