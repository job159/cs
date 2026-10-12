// CS2-style weapon finishes (skins) as procedural object-space shaders (no UVs needed).
// Recipes follow docs/research/05c-cs2-premium-skins.md §5. Finish types:
//   1 fade        anodized airbrushed gradient along the weapon (gold -> magenta -> violet)
//   2 doppler     marbleized black/silver metal under candy colours (phases, ruby, sapphire, black pearl)
//   3 marbleFade  doppler mask + three-colour fade
//   4 caseHard    case-hardened patina: blue / gold / purple cloud blotches on steel (seeded, "blue gem")
//   5 web         crimson web hydrographic (red with black spider webs)
//   6 slaughter   red candy over chrome/aluminium zebra (two glosses)
//   7 tiger       orange-gold anodized with etched tiger stripes
//   8 damascus    layered forged steel
//   9 solid       solid / anodized colour (+ optional metallic flake)
//  10 camo        hydro-dipped camouflage blotches (2–3 colours)
//  11 engraved    gold / silver with engraved arabesque scroll
import * as THREE from 'three';

const C = (h) => new THREE.Color(h);

export const RARITY = {
  common: { zh: '普通', color: '#b0c3d9' }, industrial: { zh: '工業', color: '#5e98d9' }, milspec: { zh: '軍規', color: '#4b69ff' },
  restricted: { zh: '受限', color: '#8847ff' }, classified: { zh: '保密', color: '#d32ce6' }, covert: { zh: '隱密', color: '#eb4b4b' }, rare: { zh: '稀有特殊', color: '#e4ae39' },
};

// colours are sRGB hex; c: up to 4 colours used by the finish type
export const FINISHES = {
  fade: { zh: '漸層之色', en: 'Fade', type: 1, rarity: 'covert', c: ['#e9b949', '#ff3fa4', '#6a4bff'], rough: 0.1, metal: 1 },
  doppler_p1: { zh: '多普勒 一相', en: 'Doppler P1', type: 2, rarity: 'covert', c: ['#5a2b9e', '#2a2f8a', '#7d3cc4'], rough: 0.1, metal: 1 },
  doppler_p2: { zh: '多普勒 二相', en: 'Doppler P2', type: 2, rarity: 'covert', c: ['#ff3fa4', '#9b3ae8', '#ff6fd1'], rough: 0.08, metal: 1 },
  doppler_p3: { zh: '多普勒 三相', en: 'Doppler P3', type: 2, rarity: 'covert', c: ['#1f3c8a', '#1c6d6a', '#2a2f8a'], rough: 0.1, metal: 1 },
  doppler_p4: { zh: '多普勒 四相', en: 'Doppler P4', type: 2, rarity: 'covert', c: ['#2e5cff', '#3b8bff', '#7a4bff'], rough: 0.08, metal: 1 },
  ruby: { zh: '紅寶石', en: 'Ruby', type: 2, rarity: 'rare', c: ['#e0102a', '#ff3355', '#b0081e'], rough: 0.06, metal: 1, gem: 1 },
  sapphire: { zh: '藍寶石', en: 'Sapphire', type: 2, rarity: 'rare', c: ['#1a5bff', '#3d7dff', '#0f3fd4'], rough: 0.06, metal: 1, gem: 1 },
  black_pearl: { zh: '黑珍珠', en: 'Black Pearl', type: 2, rarity: 'rare', c: ['#2b1a4a', '#3a2a7a', '#1a1a3a'], rough: 0.08, metal: 1, gem: 0.6, irid: 1 },
  emerald: { zh: '綠寶石', en: 'Emerald', type: 2, rarity: 'rare', c: ['#0fa84a', '#16d46a', '#0b7a38'], rough: 0.06, metal: 1, gem: 1 },
  gamma_p2: { zh: '伽瑪多普勒', en: 'Gamma Doppler', type: 2, rarity: 'covert', c: ['#1fd36a', '#0e8a6f', '#3bd4b0'], rough: 0.08, metal: 1 },
  marble_fade: { zh: '漸變大理石', en: 'Marble Fade', type: 3, rarity: 'covert', c: ['#e8202a', '#f2c230', '#2a5cff'], rough: 0.08, metal: 1 },
  case_hardened: { zh: '表面淬火', en: 'Case Hardened', type: 4, rarity: 'classified', c: ['#9a9ea4'], rough: 0.26, metal: 1 },
  blue_gem: { zh: '淬火・藍寶', en: 'Case Hardened (Blue Gem)', type: 4, rarity: 'rare', c: ['#9a9ea4'], rough: 0.24, metal: 1, row: 2 },
  crimson_web: { zh: '深紅之網', en: 'Crimson Web', type: 5, rarity: 'covert', c: ['#8e1018', '#0e0e10'], rough: 0.38, metal: 0 },
  slaughter: { zh: '屠夫', en: 'Slaughter', type: 6, rarity: 'covert', c: ['#c4161c'], rough: 0.2, metal: 1 },
  tiger_tooth: { zh: '虎牙', en: 'Tiger Tooth', type: 7, rarity: 'covert', c: ['#e9a13b', '#f3e7cf'], rough: 0.08, metal: 1 },
  damascus: { zh: '大馬士革鋼', en: 'Damascus Steel', type: 8, rarity: 'classified', c: ['#2c2e31', '#a8abb0'], rough: 0.25, metal: 1 },
  gold: { zh: '黃金雕花', en: 'Gold Arabesque', type: 11, rarity: 'covert', c: ['#e3b04b', '#5a3a10'], rough: 0.14, metal: 1 },
  chrome: { zh: '鏡面鍍鉻', en: 'Chrome', type: 9, rarity: 'restricted', c: ['#e8eaee'], rough: 0.05, metal: 1 },
  anodized_red: { zh: '陽極紅', en: 'Anodized Red', type: 9, rarity: 'milspec', c: ['#c0141c'], rough: 0.18, metal: 1 },
  anodized_navy: { zh: '陽極藍', en: 'Anodized Navy', type: 9, rarity: 'milspec', c: ['#1c2f6a'], rough: 0.2, metal: 1 },
  carbon: { zh: '碳纖維', en: 'Carbon Fiber', type: 9, rarity: 'industrial', c: ['#1a1b1e'], rough: 0.25, metal: 0.2, detail: 'carbon' },
  urban_camo: { zh: '城市迷彩', en: 'Urban DDPAT', type: 10, rarity: 'industrial', c: ['#5a5d61', '#8d9196', '#2f3236'], rough: 0.6, metal: 0 },
  forest_camo: { zh: '叢林迷彩', en: 'Forest DDPAT', type: 10, rarity: 'industrial', c: ['#4a5236', '#2e3324', '#7a6e4e'], rough: 0.62, metal: 0 },
  desert_camo: { zh: '沙漠迷彩', en: 'Desert Storm', type: 10, rarity: 'industrial', c: ['#b49a6e', '#8a7350', '#d2c09a'], rough: 0.6, metal: 0 },
};

// materials that receive the finish (others keep their natural look)
export const PAINTABLE = new Set(['steel', 'steel_dark', 'steel_blued', 'alu', 'alu_tan', 'polymer', 'polymer_tan', 'polymer_od', 'polymer_grip',
  'paint_od', 'paint_red', 'paint_yellow', 'paint_white', 'bakelite', 'bakelite_plum', 'carbon', 'gold']);
export const PAINTABLE_MELEE = new Set([...PAINTABLE, 'steel_bright']);

// ------------------------------------------------------------------ baked textures
function hash2(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(N, P, seed) {
  const o = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = (x / N) * P, fy = (y / N) * P, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = hash2(ix % P, iy % P, seed), b = hash2((ix + 1) % P, iy % P, seed), c = hash2(ix % P, (iy + 1) % P, seed), d = hash2((ix + 1) % P, (iy + 1) % P, seed);
    o[y * N + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  return o;
}
function fbm(N, P, oct, seed) {
  const o = new Float32Array(N * N); let amp = 1, tot = 0;
  for (let k = 0; k < oct; k++) { const n = vnoise(N, P << k, seed + k * 13); for (let i = 0; i < o.length; i++) o[i] += n[i] * amp; tot += amp; amp *= 0.5; }
  for (let i = 0; i < o.length; i++) o[i] /= tot;
  return o;
}
function sample(arr, N, x, y) { // wrapped bilinear
  x = ((x % N) + N) % N; y = ((y % N) + N) % N;
  const ix = Math.floor(x), iy = Math.floor(y), tx = x - ix, ty = y - iy, ix1 = (ix + 1) % N, iy1 = (iy + 1) % N;
  return arr[iy * N + ix] * (1 - tx) * (1 - ty) + arr[iy * N + ix1] * tx * (1 - ty) + arr[iy1 * N + ix] * (1 - tx) * ty + arr[iy1 * N + ix1] * tx * ty;
}

let cache = null;
export function finishTextures() {
  if (cache) return cache;
  const N = 256;
  // domain-warped marble (iq): R = silver mask, G = colour selector k, B = secondary field
  const w1 = fbm(N, 3, 5, 31), w2 = fbm(N, 3, 5, 57), w3 = fbm(N, 4, 4, 83);
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    const m = sample(w3, N, x + w1[i] * 2.4 * N * 0.3, y + w2[i] * 2.4 * N * 0.3);
    const silver = 0.5 + 0.5 * Math.sin(9 * m * Math.PI * 0.7 + 3 * w1[i]);
    data[i * 4] = Math.max(0, Math.min(255, silver * 255));
    data[i * 4 + 1] = w2[i] * 255;
    data[i * 4 + 2] = w3[i] * 255;
    data[i * 4 + 3] = m * 255;
  }
  const marble = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  marble.wrapS = marble.wrapT = THREE.RepeatWrapping;
  marble.minFilter = THREE.LinearMipmapLinearFilter; marble.magFilter = THREE.LinearFilter; marble.generateMipmaps = true;
  marble.needsUpdate = true;
  // tempering ramp: 8 colours x 3 rows (gold-ish, balanced, blue-rich)
  const rows = [
    ['#9a9ea4', '#d8c58a', '#c99a4f', '#b07a3a', '#8c5a2e', '#6a3d7a', '#4a3f8c', '#7a8ea3'],
    ['#9a9ea4', '#d8c58a', '#c99a4f', '#8c5a2e', '#6a3d7a', '#2b3f8c', '#4f86c6', '#7a8ea3'],
    ['#9a9ea4', '#8aa0c8', '#4f86c6', '#2b3f8c', '#1e3a9a', '#2b4fb0', '#4f86c6', '#6a7ea8'],
  ];
  const rd = new Uint8Array(8 * 3 * 4);
  rows.forEach((row, r) => row.forEach((hex, i) => { const c = new THREE.Color(hex); const o = (r * 8 + i) * 4; rd[o] = c.r * 255; rd[o + 1] = c.g * 255; rd[o + 2] = c.b * 255; rd[o + 3] = 255; }));
  const ramp = new THREE.DataTexture(rd, 8, 3, THREE.RGBAFormat);
  ramp.colorSpace = THREE.SRGBColorSpace;
  ramp.minFilter = ramp.magFilter = THREE.LinearFilter;
  ramp.needsUpdate = true;
  cache = { marble, ramp };
  return cache;
}

/** Uniform values for a finish + seed (0..999). */
export function finishUniforms(id, seed = 0) {
  const f = FINISHES[id];
  if (!f) return null;
  const r = (k) => { const x = Math.sin((seed + 1) * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  const cols = (f.c || []).map(C);
  while (cols.length < 4) cols.push(cols[cols.length - 1] || C('#888'));
  return {
    type: f.type, c0: cols[0], c1: cols[1], c2: cols[2], c3: cols[3], rough: f.rough, metal: f.metal,
    seedOff: new THREE.Vector3(r(1) * 10, r(2) * 10, r(3) * 10), seedRot: r(4) * Math.PI * 2,
    fadeAng: (-55 - r(5) * 10) * Math.PI / 180, gem: f.gem || 0, irid: f.irid || 0,
    row: f.row ?? (r(6) < 0.08 ? 2 : r(6) < 0.55 ? 1 : 0),
  };
}

/** GLSL injected into the hard-surface fragment shader when FINISH is defined. */
export const FINISH_PARS = /* glsl */`
uniform float fType;
uniform vec3 fC0, fC1, fC2, fC3;
uniform float fRough, fMetal, fSeedRot, fFadeAng, fGem, fIrid, fRow;
uniform vec3 fSeedOff;
uniform vec3 fBoxMin, fBoxMax;
uniform sampler2D tMarble;
uniform sampler2D tRamp;
float fH(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
vec4 fTri(sampler2D t, vec3 p, vec3 w) { return texture2D(t, p.zy) * w.x + texture2D(t, p.xz) * w.y + texture2D(t, p.xy) * w.z; }
`;

export const FINISH_MAIN = /* glsl */`
{
  vec3 fp = vObjPos;
  float cs = cos(fSeedRot), sn = sin(fSeedRot);
  vec3 q = vec3(fp.x * cs - fp.z * sn, fp.y, fp.x * sn + fp.z * cs) + fSeedOff * 0.1;
  vec3 fw = triW(vObjNor);
  vec2 side = vec2(-fp.z, fp.y);                          // side-view plane (s, t)
  vec3 boxS = fBoxMax - fBoxMin;
  vec3 fcol = diffuseColor.rgb; float fr = -1.0; float fm = -1.0;
  if (fType < 1.5) {                                      // fade
    vec2 dir = vec2(cos(fFadeAng), sin(fFadeAng));
    vec2 smin = vec2(-fBoxMax.z, fBoxMin.y), smax = vec2(-fBoxMin.z, fBoxMax.y);
    float lo = min(dot(smin, dir), dot(smax, dir)), hi = max(dot(smin, dir), dot(smax, dir));
    float g = clamp((dot(side, dir) - lo) / max(1e-4, hi - lo) + (grunge.r - 0.5) * 0.06, 0.0, 1.0);
    fcol = mix(mix(fC0, fC1, smoothstep(0.0, 0.55, g)), fC2, smoothstep(0.45, 1.0, g));
    fr = fRough; fm = fMetal;
  } else if (fType < 3.5) {                               // doppler family / marble fade
    vec4 mb = fTri(tMarble, q * 7.0, fw);
    float silver = smoothstep(0.42, 0.62, mb.r);
    silver = mix(silver, 0.65 + 0.35 * silver, fGem);
    vec3 candy;
    if (fType < 2.5) {
      float k = smoothstep(0.3, 0.7, mb.g);
      candy = mix(mix(fC0, fC1, k), fC2, smoothstep(0.65, 0.9, mb.b));
    } else {
      vec2 dir = vec2(cos(fFadeAng + 1.2), sin(fFadeAng + 1.2));
      float g = fract(dot(side, dir) * 2.2 + mb.g * 0.35 + fSeedOff.x * 0.07);
      candy = mix(mix(fC0, fC1, smoothstep(0.0, 0.5, g)), fC2, smoothstep(0.5, 1.0, g));
    }
    if (fIrid > 0.5) { float nv = abs(normalize(vObjNor).x); candy = mix(candy, vec3(0.2, 0.6, 0.55), (1.0 - nv) * 0.45); }
    fcol = mix(vec3(0.105, 0.1, 0.13), candy, silver);
    fr = mix(0.3, fRough, silver); fm = mix(0.75, 1.0, silver);
  } else if (fType < 4.5) {                               // case hardened
    vec4 mb = fTri(tMarble, q * 2.6 + vec3(fSeedOff.y), fw);
    vec4 mb2 = fTri(tMarble, q * 9.0, fw);
    float h = clamp(mb.a * 1.3 - 0.15 + (mb2.b - 0.5) * 0.18 + (vBake.r - 0.5) * 0.25, 0.0, 1.0);
    vec3 temper = texture2D(tRamp, vec2(0.0625 + h * 0.875, (fRow + 0.5) / 3.0)).rgb;
    fcol = mix(fC0, temper, smoothstep(0.12, 0.28, h));
    fr = fRough; fm = 1.0;
  } else if (fType < 5.5) {                               // crimson web
    vec2 c = vec2(-mix(fBoxMin.z, fBoxMax.z, 0.35 + 0.3 * fract(fSeedOff.x)), mix(fBoxMin.y, fBoxMax.y, 0.5));
    vec2 d = (side - c) * (6.0 / max(0.05, boxS.z));
    float rr = length(d), a = atan(d.y, d.x);
    float sector = 6.2831853 / 13.0;
    float f = fract(a / sector) - 0.5;
    float spoke = abs(sin(f * sector)) * rr;
    float poly = rr * cos(f * sector) - 0.22 * 0.6 * (0.25 - f * f) * 4.0;
    float ring = abs(fract(poly / 0.6 + 0.5) - 0.5) * 0.6;
    float wdt = 0.012 + 0.008 * rr;
    float web = 1.0 - smoothstep(wdt, wdt * 1.8, min(spoke, ring));
    web *= fw.x;                                          // only on the flanks
    fcol = mix(fC0, fC1, web); fr = mix(fRough, 0.5, web); fm = 0.0;
  } else if (fType < 6.5) {                               // slaughter
    vec4 mb = fTri(tMarble, q * 4.0, fw);
    float z = sin(q.x * 40.0 + 6.0 * mb.g) + 0.6 * sin(q.y * 22.0 + 5.0 * mb.b);
    float chrome = smoothstep(-0.15, 0.15, z);
    fcol = fC0 * mix(0.72, 1.0, chrome); fr = mix(0.42, 0.07, chrome); fm = 1.0;
  } else if (fType < 7.5) {                               // tiger tooth
    vec4 mb = fTri(tMarble, vec3(q.x * 2.0, q.y * 14.0, q.z * 2.0), fw);
    float stripe = smoothstep(0.58, 0.64, mb.g * 0.7 + mb.b * 0.5);
    fcol = mix(fC0, fC1, stripe); fr = mix(fRough, 0.3, stripe); fm = 1.0;
  } else if (fType < 8.5) {                               // damascus
    vec4 mb = fTri(tMarble, q * 3.0, fw);
    float b = sin(6.2831853 * (fp.y * 90.0 + mb.g * 2.6 + 0.25 * sin(-fp.z * 60.0)));
    float br = smoothstep(-0.25, 0.25, b);
    fcol = mix(fC0, fC1, br); fr = mix(0.46, 0.2, br); fm = 1.0;
  } else if (fType < 9.5) {                               // solid / anodized
    fcol = fC0; fr = fRough; fm = fMetal;
  } else if (fType < 10.5) {                              // camo
    vec4 mb = fTri(tMarble, q * 3.5, fw);
    float a1 = step(0.55, mb.g), a2 = step(0.6, mb.b);
    fcol = mix(mix(fC0, fC1, a1), fC2, a2 * (1.0 - a1 * 0.5)); fr = fRough; fm = fMetal;
  } else {                                                // engraved gold
    vec4 mb = fTri(tMarble, q * 10.0, fw);
    float scroll = abs(sin(mb.a * 40.0 + q.y * 120.0)) ;
    float engr = (1.0 - smoothstep(0.0, 0.18, scroll)) * smoothstep(0.35, 0.6, mb.g);
    fcol = mix(fC0, fC1, engr); fr = mix(fRough, 0.5, engr); fm = mix(1.0, 0.6, engr);
  }
  diffuseColor.rgb = fcol; finR = fr; finM = fm;
}
`;
