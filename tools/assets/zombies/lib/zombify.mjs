// Zombie-ification helpers. All masks are procedural and evaluated on the 3D rest-pose surface (metres) through
// a UV raster of the part, so they are seamless across UV islands and consistent between skin and clothes.
//   paintSkin(human, opts)          -> { albedo, normal, orm }   (skin texture set on the standard MakeHuman UVs)
//   paintCloth(part, opts)          -> { albedo, normal, orm, holeAt(p) } (+ deletes fully torn faces)
//   paintEyes(img, opts)            -> { albedo, emissiveMap? }   (milky / bloodshot / glowing)
//   grungeTexture(img, opts)        -> img (teeth, hair, shoes: UV-space dirt / blood / tint, no 3D lookup)
//   thinHair(part, img, opts)       -> img with mangy alpha holes
import { rasterUV, texelSurface, texelAttr } from './raster.mjs';
import { makeNoise, rng, smoothstep, clamp01, mix } from './noise.mjs';
import { createImage, cloneImage, resize, normalFromHeight, luminance, blurField, sample } from './image.mjs';

// build.mjs --preview sets ZOMBIE_TEX_SCALE=0.5: every painted texture is made at half size (4x faster)
const sz = (v, def) => Math.max(64, Math.round((v || def) * +(process.env.ZOMBIE_TEX_SCALE || 1)));
const srgb2lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lin2srgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const LUT = new Float32Array(256).map((_, i) => srgb2lin(i / 255));
const toByte = (x) => Math.max(0, Math.min(255, Math.round(lin2srgb(Math.max(0, x)) * 255)));

/** Blend helpers working in linear colour. */
const over = (c, col, a) => { if (a <= 0) return; a = Math.min(1, a); c[0] += (col[0] - c[0]) * a; c[1] += (col[1] - c[1]) * a; c[2] += (col[2] - c[2]) * a; };
const mul = (c, col, a) => { if (a <= 0) return; a = Math.min(1, a); c[0] *= 1 + (col[0] - 1) * a; c[1] *= 1 + (col[1] - 1) * a; c[2] *= 1 + (col[2] - 1) * a; };
const lumOf = (c) => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
const lin = (rgb) => rgb.map((v) => srgb2lin(v / 255));

export const COLORS = {
  bloodFresh: lin([96, 4, 6]), bloodDry: lin([58, 7, 8]), bloodBlack: lin([28, 8, 6]),
  flesh: lin([120, 28, 30]), fleshDeep: lin([58, 10, 12]), fat: lin([196, 160, 120]),
  bruise: lin([70, 40, 72]), bruiseYellow: lin([150, 140, 70]), vein: lin([55, 60, 92]),
  grime: lin([70, 58, 44]), mud: lin([52, 44, 34]), socket: lin([48, 30, 40]), lips: lin([88, 70, 84]),
};

/**
 * Finds the outer body surface point along `dir` from a point on a bone (t = 0 head .. 1 tail).
 * Returns {p:[x,y,z], n:[x,y,z]} on the base mesh body.
 */
export function surfacePoint(human, bone, t, dir) {
  const b = human.skeleton.byName[bone];
  const o = b.head.clone().lerp(b.tail, t);
  const d = [dir[0], dir[1], dir[2]];
  const dl = Math.hypot(...d); d[0] /= dl; d[1] /= dl; d[2] /= dl;
  const body = human.baseObj.groupVerts('body');
  let best = null, bestProj = -1;
  for (const v of body) {
    const x = human.pos[v * 3] - o.x, y = human.pos[v * 3 + 1] - o.y, z = human.pos[v * 3 + 2] - o.z;
    const proj = x * d[0] + y * d[1] + z * d[2];
    if (proj <= 0) continue;
    const perp = Math.hypot(x - proj * d[0], y - proj * d[1], z - proj * d[2]);
    if (perp > 0.02 + proj * 0.15) continue;
    if (proj > bestProj) { bestProj = proj; best = v; }
  }
  if (best === null) return { p: [o.x, o.y, o.z], n: d };
  return { p: [human.pos[best * 3], human.pos[best * 3 + 1], human.pos[best * 3 + 2]], n: d };
}

/** Common anchor points of a human (metres). */
export function anchors(human) {
  const mouthUp = human.jointPos ? centroid(human, 'helper-upper-teeth') : null;
  const mouthLo = centroid(human, 'helper-lower-teeth');
  const mouth = [(mouthUp[0] + mouthLo[0]) / 2, (mouthUp[1] + mouthLo[1]) / 2, (mouthUp[2] + mouthLo[2]) / 2 + 0.02];
  return {
    eyeL: human.jointPos('joint-l-eye'), eyeR: human.jointPos('joint-r-eye'),
    mouth,
    head: human.skeleton.byName.head.head.toArray(),
    neck: human.skeleton.byName.neck_01.head.toArray(),
    handL: human.skeleton.byName.hand_l.head.toArray(), handR: human.skeleton.byName.hand_r.head.toArray(),
    height: human.height,
  };
}
function centroid(human, group) {
  const s = human.baseObj.groupVerts(group);
  const p = [0, 0, 0];
  for (const v of s) for (let k = 0; k < 3; k++) p[k] += human.pos[v * 3 + k] / s.size;
  return p;
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Skin painter.
 * @param o.base      Image (albedo, any size; resampled to o.size)
 * @param o.bump      optional grey height Image (e.g. sohh bump), o.bumpStrength
 * @param o.size      albedo size (2048), o.normalSize (1024), o.ormSize (1024)
 * @param o.pallor    0..1 desaturate towards o.tint (linear rgb) ; o.mottle 0..1
 * @param o.veins, o.bruises, o.grime, o.socket, o.lips (0..1 strengths)
 * @param o.coveredDarken  0..1 skin under the clothes (seen through tears): pigment + shadow (ORM AO 1 - 0.6 cv);
 *                  o.coveredShade = how much of that shadow is also multiplied into the albedo (default 0.62)
 * @param o.blood     { mouth 0..1, hands 0..1, drips 0..1, splatter 0..1 }
 * @param o.wounds    [{bone, t, dir:[x,y,z], r, kind:'bite'|'gash'|'hole', depth}]
 * @param o.extra     optional (P, N, c(linear rgb, mutable), state{height, rough}) => void for custom effects
 */
export function paintSkin(human, o = {}) {
  const S = sz(o.size, 2048);
  const seed = o.seed ?? 1;
  const N3 = makeNoise(seed);
  const body = human.basePart({ name: 'paint' });
  const tris = body.tris();
  const nrm = body.normals();
  const r = rasterUV(tris, human.baseObj.uvs, S, 8);
  const base = o.base.width === S ? o.base : resize(o.base, S, S);
  const out = cloneImage(base);
  const height = new Float32Array(S * S);
  const rough = new Float32Array(S * S).fill(o.roughness ?? 0.62);
  const ao = new Float32Array(S * S).fill(1);
  const A = anchors(human);
  const wounds = (o.wounds || []).map((w) => ({ ...w, ...surfacePoint(human, w.bone, w.t ?? 0.5, w.dir || [0, 0, 1]), r: w.r || 0.035 }));
  const tint = o.tint || lin([168, 178, 160]);
  const P = [0, 0, 0], Nn = [0, 0, 0], c = [0, 0, 0];
  const blood = o.blood || {};
  const covered = new Float32Array(human.pos.length / 3);
  for (const v of human.hidden || []) covered[v] = 1;
  const coveredDarken = human.hidden?.size ? (o.coveredDarken ?? 0.7) : 0;
  for (let i = 0; i < S * S; i++) {
    if (!texelSurface(r, tris, human.pos, nrm, i, P, Nn)) continue;
    const di = i * 4;
    c[0] = LUT[base.data[di]]; c[1] = LUT[base.data[di + 1]]; c[2] = LUT[base.data[di + 2]];
    let h = 0, ro = rough[i];
    if (coveredDarken) {
      const cv = texelAttr(r, tris, covered, i) * coveredDarken;
      if (cv > 0) {
        // skin under clothes (seen through tears): darker, grimy, scraped and bruised
        // (strongly darkened: it sits in the contact shadow of the garment, which is what makes tears read as holes)
        const sc = N3.fbm(P[0] * 30 + 3, P[1] * 30, P[2] * 30, 3);
        over(c, COLORS.bloodDry, smoothstep(0.15, 0.5, sc) * cv * 0.6);
        over(c, COLORS.bruise, smoothstep(0.0, 0.4, -sc) * cv * 0.4);
        // (the shadow part is also written to the ORM occlusion below: types that export that AO and want it only
        // there pass a small o.coveredShade so the albedo keeps just the grime / bruise pigment)
        const k = 1 - cv * (o.coveredShade ?? 0.62); c[0] *= k; c[1] *= k; c[2] *= k;
        ao[i] = 1 - cv * 0.6;
      }
    }
    // pallor: desaturate towards a grey-green corpse tone, keep luminance structure
    if (o.pallor) {
      const l = lumOf(c) / (lumOf(tint) || 1);
      over(c, [tint[0] * l, tint[1] * l, tint[2] * l], o.pallor);
      const dk = 1 - 0.18 * o.pallor;
      c[0] *= dk; c[1] *= dk; c[2] *= dk;
    }
    // mottling: blotchy livor / discoloration
    if (o.mottle) {
      const m = N3.fbm(P[0] * 7, P[1] * 7, P[2] * 7, 4);
      const m2 = N3.fbm(P[0] * 19 + 3, P[1] * 19, P[2] * 19, 3);
      mul(c, lin([150, 150, 175]), smoothstep(0.05, 0.6, m) * o.mottle * 0.7);
      mul(c, lin([200, 210, 170]), smoothstep(0.1, 0.7, -m2) * o.mottle * 0.5);
    }
    // veins: ridged noise network, stronger on neck / temples / chest / inner arms
    if (o.veins) {
      const region = clamp01(1.2 - Math.abs(P[1] - A.neck[1]) * 4) * 0.8 + clamp01(1 - dist(P, A.head) * 6) * 0.6 + 0.35;
      const v = N3.ridged(P[0] * 26, P[1] * 9, P[2] * 26, 3);
      const gate = smoothstep(-0.1, 0.45, N3.fbm(P[0] * 4 + 9, P[1] * 4, P[2] * 4, 2));
      const vv = smoothstep(0.55, 0.85, v) * gate * region * o.veins;
      over(c, COLORS.vein, vv * 0.7);
      h += vv * 0.6;
    }
    // bruises
    if (o.bruises) {
      const b = N3.fbm(P[0] * 5 + 31, P[1] * 5, P[2] * 5 - 7, 3);
      const core = smoothstep(0.35, 0.65, b) * o.bruises;
      const rim = smoothstep(0.2, 0.4, b) * (1 - smoothstep(0.4, 0.6, b)) * o.bruises;
      mul(c, COLORS.bruiseYellow.map((x) => x * 4), rim * 0.35);
      over(c, COLORS.bruise, core * 0.55);
    }
    // sunken dark eye sockets
    if (o.socket) {
      const d = Math.min(dist(P, A.eyeL), dist(P, A.eyeR));
      const s = (1 - smoothstep(0.012, 0.042, d)) * o.socket;
      const below = (1 - smoothstep(0.0, 0.03, Math.abs(P[1] - (A.eyeL[1] - 0.018)))) * (1 - smoothstep(0.01, 0.045, d)) * o.socket;
      over(c, COLORS.socket, s * 0.75 + below * 0.25);
      mul(c, lin([200, 120, 120]), (1 - smoothstep(0.012, 0.022, d)) * o.socket * 0.5);
      h -= s * 0.6;
    }
    // bluish lips
    if (o.lips) {
      const d = dist(P, A.mouth);
      const l = (1 - smoothstep(0.012, 0.03, d)) * o.lips;
      over(c, COLORS.lips, l * 0.6);
    }
    // grime: dirt build-up low on the body, hands, plus noisy patches
    if (o.grime) {
      const low = 1 - smoothstep(0.05, 0.9, P[1] / A.height);
      const hands = Math.max(1 - smoothstep(0.03, 0.12, dist(P, A.handL)), 1 - smoothstep(0.03, 0.12, dist(P, A.handR)));
      const n = N3.fbm(P[0] * 11 - 3, P[1] * 11, P[2] * 11, 4);
      const g = clamp01((smoothstep(-0.2, 0.6, n) * 0.6 + low * 0.5 + hands * 0.5) * o.grime);
      over(c, COLORS.grime, g * 0.55);
      ro = mix(ro, 0.85, g * 0.6);
    }
    // blood around the mouth: smear on lips/chin + drips running down the chin and neck
    let bl = 0;
    if (blood.mouth) {
      const dx = P[0] - A.mouth[0], dy = P[1] - A.mouth[1], dz = P[2] - A.mouth[2];
      const front = smoothstep(-0.2, 0.4, Nn[2]);
      const smear = (1 - smoothstep(0.015, 0.05, Math.hypot(dx * 1.1, dy * 1.4, dz))) * smoothstep(-0.3, 0.6, N3.fbm(P[0] * 60, P[1] * 60, P[2] * 60, 3) + 0.6);
      const streak = N3.noise(P[0] * 140, P[1] * 9, P[2] * 140);
      // drips: vertical streaks below the mouth corners, fading out ~20 cm down
      const drip = (dy < 0.01 && dy > -0.2 ? 1 + dy / 0.2 : 0) * (1 - smoothstep(0.02, 0.05, Math.abs(dx))) * smoothstep(0.25, 0.55, streak);
      bl = Math.max(bl, (smear + drip * 0.9) * front * blood.mouth);
    }
    if (blood.hands) {
      const dh = Math.min(dist(P, A.handL), dist(P, A.handR));
      const reach = 1 - smoothstep(0.06, 0.2, dh);
      const n = N3.fbm(P[0] * 30 + 5, P[1] * 30, P[2] * 30, 4);
      bl = Math.max(bl, reach * smoothstep(-0.15, 0.35, n) * blood.hands);
    }
    if (blood.splatter) {
      const n = N3.worley(P[0] * 38, P[1] * 38, P[2] * 38);
      const g = smoothstep(0.25, 0.75, N3.fbm(P[0] * 3 + 1, P[1] * 3, P[2] * 3, 2) + 0.3);
      bl = Math.max(bl, (1 - smoothstep(0.12, 0.2, n)) * g * blood.splatter);
    }
    // wounds
    for (const w of wounds) {
      const d = dist(P, w.p);
      if (d > w.r * 3.5) continue;
      const warp = N3.fbm(P[0] * 45, P[1] * 45, P[2] * 45, 3) * 0.35;
      const q = d / w.r + warp;
      const kind = w.kind || 'bite';
      if (q < 1) {
        // raw flesh crater
        const inner = 1 - smoothstep(0.0, 0.85, q);
        const fib = N3.ridged(P[0] * 160, P[1] * 160, P[2] * 160, 2);
        over(c, COLORS.flesh, 0.95);
        over(c, COLORS.fleshDeep, inner * 0.8 + fib * 0.25);
        if (kind === 'bite') {
          const tooth = N3.worley(P[0] * 120, P[1] * 120, P[2] * 120);
          if (q > 0.65) over(c, COLORS.fat, (1 - smoothstep(0.1, 0.25, tooth)) * 0.4);
        }
        h -= (w.depth ?? 1.6) * (1 - q * q);
        ro = 0.22;
      } else if (q < 1.25) {
        over(c, lin([140, 70, 70]), (1 - smoothstep(1, 1.25, q)) * 0.8); // torn rim
        h += 0.5 * (1 - Math.abs(q - 1.1) / 0.15);
        ro = 0.35;
      }
      // bruising halo and blood run-off below the wound
      over(c, COLORS.bruise, (1 - smoothstep(1.0, 2.6, q)) * 0.45);
      const below = w.p[1] - P[1];
      if (below > 0 && below < w.r * 6 && Math.abs(P[0] - w.p[0]) < w.r * 1.3) {
        const s = N3.noise(P[0] * 150, P[1] * 8, P[2] * 150);
        bl = Math.max(bl, smoothstep(0.2, 0.5, s) * (1 - below / (w.r * 6)) * 0.95);
      }
      bl = Math.max(bl, (1 - smoothstep(0.9, 1.6, q)) * 0.8);
    }
    if (o.extra) { const st = { h, ro, bl }; o.extra(P, Nn, c, st); h = st.h; ro = st.ro; bl = st.bl; }
    if (bl > 0) {
      const age = smoothstep(-0.3, 0.5, N3.noise(P[0] * 20 + 70, P[1] * 20, P[2] * 20));
      const bc = [mix(COLORS.bloodFresh[0], COLORS.bloodDry[0], age), mix(COLORS.bloodFresh[1], COLORS.bloodDry[1], age), mix(COLORS.bloodFresh[2], COLORS.bloodDry[2], age)];
      over(c, bc, bl * 0.92);
      ro = mix(ro, mix(0.22, 0.5, age), bl);
      h += bl * 0.15;
    }
    out.data[di] = toByte(c[0]); out.data[di + 1] = toByte(c[1]); out.data[di + 2] = toByte(c[2]);
    height[i] = h;
    rough[i] = ro;
  }
  // height: painted features (blurred a touch) + source bump or albedo high-pass (pores, wrinkles)
  let hf = blurField(height, S, S, 1, 1);
  const lum = o.bump ? luminance(o.bump.width === S ? o.bump : resize(o.bump, S, S)) : luminance(base);
  const low = blurField(lum, S, S, o.bump ? 6 : 3, 2);
  const detail = o.bumpStrength ?? (o.bump ? 6 : 3);
  for (let i = 0; i < hf.length; i++) hf[i] = hf[i] * 1.2 + (lum[i] - low[i]) * detail * (o.bumpSign ?? 1);
  const NS = sz(o.normalSize, 1024);
  const hfS = NS === S ? hf : downField(hf, S, NS);
  const normal = normalFromHeight(hfS, NS, NS, (o.normalStrength ?? 2.2) * NS / 1024);
  const OS = sz(o.ormSize, 512);
  const orm = createImage(OS, OS, [255, 160, 0, 255]);
  const rS = downField(rough, S, OS), aS = downField(ao, S, OS);
  for (let i = 0; i < OS * OS; i++) { orm.data[i * 4] = Math.round(clamp01(aS[i]) * 255); orm.data[i * 4 + 1] = Math.round(clamp01(rS[i]) * 255); }
  return { albedo: out, normal, orm };
}

function downField(f, S, D) {
  if (S === D) return f;
  const k = S / D, out = new Float32Array(D * D);
  for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
    let a = 0;
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) a += f[(y * k + j) * S + x * k + i];
    out[y * D + x] = a / (k * k);
  }
  return out;
}

/**
 * Cloth painter + tearing.
 * @param part      cloth Part (its own UV layout)
 * @param o.base    albedo Image (with or without alpha), o.normal (Image|null), o.ao (Image|null)
 * @param o.size    texture size (default = 2048), o.normalSize (1024)
 * @param o.tear    { amount 0..1, scale (noise freq, default 6), where(P,N)->0..1 extra weight, seed, fray 0..1 }
 * @param o.fade, o.grime, o.blood {collar, splatter, hands, drips}, o.burn, o.wetness
 * @param o.human   for anchors (mouth / hands) when blood is used
 * @returns {albedo, normal, orm, holeAt(P)->bool, alpha:boolean}
 */
export function paintCloth(part, o = {}) {
  const S = sz(o.size, 2048);
  const N3 = makeNoise(o.seed ?? 7);
  const tris = part.tris();
  const nrm = part.normals();
  const r = rasterUV(tris, part.obj.uvs, S, 6);
  const base = o.base.width === S ? o.base : resize(o.base, S, S);
  const out = cloneImage(base);
  const rough = new Float32Array(S * S).fill(o.roughness ?? 0.9);
  const tear = o.tear || null;
  const A = o.human ? anchors(o.human) : null;
  const blood = o.blood || {};
  const tearField = (P, Nn) => {
    if (!tear) return -1;
    const sc = tear.scale ?? 6;
    // vertically stretched noise -> rips rather than round holes; a warp adds ragged, uneven outlines
    const st = tear.stretch ?? 0.45;
    const wx = N3.noise(P[0] * sc * 3, P[1] * sc * 3, P[2] * sc * 3 + 5) * 0.05;
    let f = N3.fbm((P[0] + wx) * sc, P[1] * sc * st, (P[2] - wx) * sc, 5) * 0.5 + 0.5; // 0..1
    f += (tear.where ? tear.where(P, Nn) : 0);
    return f - (1 - (tear.amount ?? 0.3) * 0.62);
  };
  // inner layers (e.g. the T-shirt under the overall's bib): vertices whose outward normal ray hits the same
  // garment within 4 cm are occluded -> painted dark so tears in the outer layer read as holes, not patches
  const inner = o.innerDarken === 0 ? null : innerLayer(part, tris, nrm);
  const P = [0, 0, 0], Nn = [0, 0, 0], c = [0, 0, 0];
  let anyCut = false;
  for (let i = 0; i < S * S; i++) {
    if (!texelSurface(r, tris, part.pos, nrm, i, P, Nn)) continue;
    const di = i * 4;
    c[0] = LUT[base.data[di]]; c[1] = LUT[base.data[di + 1]]; c[2] = LUT[base.data[di + 2]];
    let ro = rough[i];
    const x = i % S, y = (i / S) | 0;
    const u = x / S, v = y / S;
    // fade + desaturate (old, sun-bleached, filthy)
    if (o.fade) {
      const l = lumOf(c);
      over(c, [l * 1.02, l, l * 0.92], o.fade * 0.55);
      const dk = 1 - 0.25 * o.fade * (0.6 + 0.4 * N3.fbm(P[0] * 3, P[1] * 3, P[2] * 3, 2));
      c[0] *= dk; c[1] *= dk; c[2] *= dk;
    }
    // weave / thread detail in UV space (flat textures like the white shirt get fabric structure)
    // yellowed / sweat-stained light fabric (only affects bright texels: the white shirt, not the denim)
    if (o.yellow) {
      const l = lumOf(c);
      const k = smoothstep(0.35, 0.75, l) * o.yellow * (0.6 + 0.4 * N3.fbm(P[0] * 6 + 2, P[1] * 6, P[2] * 6, 3));
      over(c, [l * 0.78, l * 0.66, l * 0.45], k * 0.8);
    }
    if (o.weave) {
      const w = Math.sin(u * S * 0.9) * Math.sin(v * S * 0.9) * 0.5 + N3.noise(u * 900, v * 900, 0.5) * 0.5;
      const k = 1 + w * 0.06 * o.weave;
      c[0] *= k; c[1] *= k; c[2] *= k;
    }
    // grime: hem / knees / lower body + noisy patches + sweat stains near armpits/collar
    if (o.grime) {
      const hgt = A ? P[1] / A.height : P[1] / 1.75;
      const low = 1 - smoothstep(0.0, 0.55, hgt);
      const n = N3.fbm(P[0] * 9 + 11, P[1] * 9, P[2] * 9, 5);
      const g = clamp01(low * 0.7 + smoothstep(-0.1, 0.7, n) * (o.grimeNoise ?? 0.6)) * o.grime;
      over(c, COLORS.grime, g * 0.6);
      const mud = smoothstep(0.35, 0.75, N3.fbm(P[0] * 14, P[1] * 4, P[2] * 14, 3) + low * 0.5 - 0.2) * o.grime;
      over(c, COLORS.mud, mud * 0.5 * low);
      ro = mix(ro, 0.95, g * 0.5);
    }
    // blood
    let bl = 0;
    if (A && blood.collar) {
      // a soaked "bib" running down from the chin: wide at the collar, narrowing and fading towards the belly,
      // ragged outline from low-frequency noise, drip streaks along the lower edge
      const dx = P[0] - A.mouth[0], dy = A.mouth[1] - P[1];
      const front = smoothstep(-0.2, 0.35, Nn[2]);
      const len = 0.42 * blood.collar;
      const width = 0.11 * (1 - smoothstep(0.05, len, dy)) + 0.035;
      const edgeN = N3.fbm(P[0] * 9, P[1] * 9, P[2] * 9, 4) * 0.05;
      const soak = dy > 0.06 ? (1 - smoothstep(width - 0.02, width + 0.02, Math.abs(dx) + edgeN)) * (1 - smoothstep(len * 0.6, len, dy + edgeN)) : 0;
      const streak = N3.noise(P[0] * 90, P[1] * 4, P[2] * 90);
      const drips = dy > 0.06 && dy < len * 1.5 ? smoothstep(0.35, 0.6, streak) * (1 - smoothstep(0.02, width + 0.03, Math.abs(dx))) * (1 - dy / (len * 1.5)) : 0;
      bl = Math.max(bl, (soak * 0.95 + drips * 0.8) * front * Math.min(1, blood.collar));
    }
    if (A && blood.hands) {
      const dh = Math.min(dist(P, A.handL), dist(P, A.handR));
      bl = Math.max(bl, (1 - smoothstep(0.08, 0.3, dh)) * smoothstep(0, 0.5, N3.fbm(P[0] * 20, P[1] * 20, P[2] * 20, 3) + 0.2) * blood.hands);
    }
    if (blood.splatter) {
      const wv = N3.worley(P[0] * 30 + 4, P[1] * 30, P[2] * 30);
      const g = smoothstep(0.3, 0.8, N3.fbm(P[0] * 2.5 + 8, P[1] * 2.5, P[2] * 2.5, 2) + 0.35);
      bl = Math.max(bl, (1 - smoothstep(0.1, 0.22, wv)) * g * blood.splatter);
      // larger soaked stains with a dark dried rim (capillary ring)
      const st = N3.fbm(P[0] * 4 - 5, P[1] * 4, P[2] * 4, 4);
      const stain = smoothstep(0.42, 0.5, st) * blood.splatter;
      const ring = smoothstep(0.4, 0.44, st) * (1 - smoothstep(0.44, 0.5, st)) * blood.splatter;
      bl = Math.max(bl, stain * 0.8);
      over(c, COLORS.bloodBlack, ring * 0.5);
    }
    // tearing: cut alpha with frayed thread fringe; dark burnt/dirty edge band
    let alpha = base.data[di + 3] / 255;
    if (tear) {
      const f = tearField(P, Nn);
      // frayed fringe: inside a narrow band around each hole only thin warp/weft threads survive (more of
      // them further from the hole); thread lines run along the UV axes, ~6 texels apart
      const fw = (tear.fray ?? 0.6) * 0.03; // ~1 cm band at the default noise scale
      let cut = f > 0;
      if (!cut && f > -fw) {
        const t = -f / fw;
        const tu = Math.abs(N3.noise(u * S / 6, v * 6, 1.3)), tv = Math.abs(N3.noise(u * 6, v * S / 6, 2.1));
        cut = Math.min(tu, tv) > 0.07 + 0.9 * t * t * t;
      }
      if (cut) { alpha = 0; anyCut = true; }
      else {
        // surviving threads in the fray band show the pale undyed yarn (denim weft) when threadColor is set
        if (f > -fw && tear.threadColor) over(c, tear.threadColor, (1 + f / fw) * 0.6);
        const edge = 1 - smoothstep(0, fw * 3, -f);
        mul(c, [0.6, 0.58, 0.55], edge * 0.6);
        bl = Math.max(bl, edge * (blood.edges ?? 0.4) * smoothstep(0, 0.5, N3.noise(P[0] * 40, P[1] * 40, P[2] * 40) + 0.3));
      }
    }
    if (bl > 0) {
      const age = smoothstep(-0.4, 0.4, N3.noise(P[0] * 15 + 40, P[1] * 15, P[2] * 15));
      const bc = [mix(COLORS.bloodFresh[0], COLORS.bloodDry[0], age), mix(COLORS.bloodFresh[1], COLORS.bloodDry[1], age), mix(COLORS.bloodFresh[2], COLORS.bloodDry[2], age)];
      // blood soaks into fabric: multiply-ish on light cloth, over on dark
      over(c, bc, Math.min(1, bl) * 0.85);
      ro = mix(ro, mix(0.35, 0.75, age), Math.min(1, bl));
    }
    if (inner) {
      const k = texelAttr(r, tris, inner, i) * (o.innerDarken ?? 0.75);
      if (k > 0) { over(c, COLORS.grime, k * 0.3); c[0] *= 1 - k; c[1] *= 1 - k; c[2] *= 1 - k; }
    }
    if (o.extra) o.extra(P, Nn, c, u, v);
    out.data[di] = toByte(c[0]); out.data[di + 1] = toByte(c[1]); out.data[di + 2] = toByte(c[2]);
    out.data[di + 3] = Math.round(alpha * 255);
    rough[i] = ro;
  }
  // gutter texels keep alpha from their source island texel (rasterUV padded), uncovered areas -> opaque
  // delete faces that are torn away completely (all corners + centroid deep inside a hole)
  let removed = 0;
  if (tear) {
    const pos = part.pos;
    part.obj.faces.forEach((f, fi) => {
      if (!part.keep[fi]) return;
      const pts = f.v.map((vi) => [pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]]);
      const cen = [0, 1, 2].map((k) => pts.reduce((a, p) => a + p[k], 0) / pts.length);
      if ([...pts, cen].every((p) => tearField(p, [0, 0, 1]) > 0.06)) { part.keep[fi] = 0; removed++; }
    });
  }
  const NS = sz(o.normalSize, 1024);
  const normal = o.normal ? resize(o.normal, NS, NS) : null;
  const OS = sz(o.ormSize, 1024);
  const orm = createImage(OS, OS, [255, 230, 0, 255]);
  const ao = o.ao ? resize(o.ao, OS, OS) : null;
  const rS = downField(rough, S, OS);
  for (let i = 0; i < OS * OS; i++) {
    orm.data[i * 4] = ao ? ao.data[i * 4] : 255;
    orm.data[i * 4 + 1] = Math.round(clamp01(rS[i]) * 255);
  }
  return {
    albedo: out, normal, orm, alpha: anyCut || o.alpha === true, removedFaces: removed,
    holeAt: (p, margin = 0.08) => tear ? tearField(p, [0, 0, 1]) > -margin : false,
    tearField,
  };
}

/** Per-vertex 0/1: does a ray along the vertex normal hit the same mesh within maxDist (brute force)? */
function innerLayer(part, tris, nrm, maxDist = 0.04) {
  const pos = part.pos, n = part.nVerts, out = new Float32Array(n);
  const nt = tris.length / 6;
  const T = new Float32Array(nt * 9);
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) for (let a = 0; a < 3; a++) T[t * 9 + k * 3 + a] = pos[tris[t * 6 + k * 2] * 3 + a];
  const used = new Uint8Array(n);
  for (let t = 0; t < tris.length; t += 2) used[tris[t]] = 1;
  for (let v = 0; v < n; v++) {
    if (!used[v]) continue;
    const ox = pos[v * 3] + nrm[v * 3] * 0.003, oy = pos[v * 3 + 1] + nrm[v * 3 + 1] * 0.003, oz = pos[v * 3 + 2] + nrm[v * 3 + 2] * 0.003;
    const dx = nrm[v * 3], dy = nrm[v * 3 + 1], dz = nrm[v * 3 + 2];
    for (let t = 0; t < nt; t++) {
      const b = t * 9;
      // quick reject: triangle centroid far from the ray origin
      const cx = (T[b] + T[b + 3] + T[b + 6]) / 3 - ox, cy = (T[b + 1] + T[b + 4] + T[b + 7]) / 3 - oy, cz = (T[b + 2] + T[b + 5] + T[b + 8]) / 3 - oz;
      if (cx * cx + cy * cy + cz * cz > 0.0064) continue;
      const e1x = T[b + 3] - T[b], e1y = T[b + 4] - T[b + 1], e1z = T[b + 5] - T[b + 2];
      const e2x = T[b + 6] - T[b], e2y = T[b + 7] - T[b + 1], e2z = T[b + 8] - T[b + 2];
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-12) continue;
      const inv = 1 / det;
      const sx = ox - T[b], sy = oy - T[b + 1], sz = oz - T[b + 2];
      const uu = (sx * px + sy * py + sz * pz) * inv;
      if (uu < 0 || uu > 1) continue;
      const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
      const vv = (dx * qx + dy * qy + dz * qz) * inv;
      if (vv < 0 || uu + vv > 1) continue;
      const d = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (d > 0 && d < maxDist) { out[v] = 1; break; }
    }
  }
  return out;
}

/**
 * Eyes: the MakeHuman eye texture has two eyeballs with saturated irises. style 'milky' (cataract haze),
 * 'bloodshot', 'glow' (emissive iris), 'dead' (dull grey). Returns {albedo, emissiveMap|null}.
 */
export function paintEyes(img, o = {}) {
  const N3 = makeNoise(o.seed ?? 3);
  const out = cloneImage(img);
  const W = img.width, H = img.height;
  const glow = o.style === 'glow';
  const em = glow ? createImage(W, H, [0, 0, 0, 255]) : null;
  const c = [0, 0, 0];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    c[0] = LUT[img.data[i]]; c[1] = LUT[img.data[i + 1]]; c[2] = LUT[img.data[i + 2]];
    const mx = Math.max(...c), mn = Math.min(...c);
    const sat = mx > 0 ? (mx - mn) / mx : 0;
    const l = lumOf(c);
    const iris = smoothstep(0.35, 0.6, sat) * smoothstep(0.004, 0.02, mx);
    const pupil = 1 - smoothstep(0.004, 0.02, l);
    const sclera = (1 - iris) * (1 - pupil) * smoothstep(0.25, 0.45, l);
    const u = x / W, v = y / H;
    // bloodshot sclera: red capillaries + yellowing
    const vein = N3.ridged(u * 40, v * 40, 1.7, 3);
    over(c, lin([175, 160, 118]), sclera * 0.45 * (o.yellow ?? 1));
    const dk = 1 - sclera * 0.4 - iris * 0.2;
    c[0] *= dk; c[1] *= dk; c[2] *= dk;
    over(c, lin([150, 20, 20]), sclera * smoothstep(0.5, 0.8, vein) * (o.bloodshot ?? 0.7));
    if (o.style === 'milky' || o.style === 'dead') {
      const haze = o.style === 'milky' ? lin([205, 212, 214]) : lin([120, 118, 112]);
      over(c, haze, iris * (o.style === 'milky' ? (o.haze ?? 0.5) : 0.5) + pupil * 0.3);
      if (o.style === 'milky') over(c, lin([150, 160, 170]), pupil * 0.25);
    }
    if (glow) {
      const col = o.color || [1, 0.55, 0.1];
      over(c, col, iris * 0.7);
      const k = Math.max(iris, pupil * 0.7);
      em.data[i] = toByte(col[0] * k); em.data[i + 1] = toByte(col[1] * k); em.data[i + 2] = toByte(col[2] * k);
    }
    out.data[i] = toByte(c[0]); out.data[i + 1] = toByte(c[1]); out.data[i + 2] = toByte(c[2]);
  }
  return { albedo: out, emissiveMap: em };
}

/** UV-space grunge: tint / darken / dirt / blood blotches (for teeth, shoes, hair, gear). */
export function grungeTexture(img, o = {}) {
  const N3 = makeNoise(o.seed ?? 11);
  const out = cloneImage(img);
  const W = img.width, H = img.height;
  const c = [0, 0, 0];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    c[0] = LUT[img.data[i]]; c[1] = LUT[img.data[i + 1]]; c[2] = LUT[img.data[i + 2]];
    const u = x / W * (o.freq ?? 8), v = y / H * (o.freq ?? 8);
    if (o.tint) mul(c, o.tint, o.tintAmount ?? 1);
    if (o.darken) { const k = 1 - o.darken; c[0] *= k; c[1] *= k; c[2] *= k; }
    if (o.dirt) over(c, COLORS.grime, smoothstep(-0.2, 0.6, N3.fbm(u, v, 0.3, 4)) * o.dirt);
    if (o.blood) {
      const b = smoothstep(0.25, 0.6, N3.fbm(u * 1.7 + 9, v * 1.7, 1.1, 4)) * o.blood;
      over(c, COLORS.bloodDry, b * 0.85);
    }
    if (o.match) o.match(c, x / W, y / H, img.data[i + 3]);
    out.data[i] = toByte(c[0]); out.data[i + 1] = toByte(c[1]); out.data[i + 2] = toByte(c[2]);
  }
  return out;
}

/** Mangy hair: punches alpha holes (3D noise on the hair mesh surface) and darkens/dirties the rest. */
export function thinHair(part, img, o = {}) {
  const S = img.width;
  const N3 = makeNoise(o.seed ?? 5);
  const tris = part.tris();
  const nrm = part.normals();
  const r = rasterUV(tris, part.obj.uvs, S, 4);
  const out = cloneImage(img);
  const P = [0, 0, 0], Nn = [0, 0, 0];
  for (let i = 0; i < S * S; i++) {
    if (!texelSurface(r, tris, part.pos, nrm, i, P, Nn)) continue;
    const n = N3.fbm(P[0] * (o.scale ?? 18), P[1] * (o.scale ?? 18), P[2] * (o.scale ?? 18), 4);
    const t = 1 - 2 * (o.amount ?? 0.3); // amount 0 = intact, 0.5 = half the scalp, 1 = bald
    const hole = smoothstep(t - 0.05, t + 0.05, n);
    out.data[i * 4 + 3] = Math.round(out.data[i * 4 + 3] * (1 - hole));
  }
  return out;
}

export { rng };
