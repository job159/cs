// Hard-surface PBR materials for weapons and props built by tools/assets (no UVs needed):
//   - `_bake` vertex attribute: r = AO, g = convex edge (wear), b = cavity (grime), a = per-part random
//   - object-space triplanar detail normals (cast / brushed / stipple / knurl / carbon / fabric)
//   - grunge-modulated edge wear revealing the substrate (bare steel, aluminium, lighter polymer)
//   - procedural wood grain for wooden furniture
//   - optional viewmodel projection: own FOV + depth squeezed into the front of the depth range so the
//     gun never clips into walls while still being lit/shadowed by the real scene.
import * as THREE from 'three';
import { detailTextures } from './detail.js';
import { finishTextures, finishUniforms, FINISH_PARS, FINISH_MAIN, PAINTABLE, PAINTABLE_MELEE } from './finishes.js';

const C = (hex) => new THREE.Color(hex);

/** Material presets. Colors are sRGB hex; rough/metal are 0..1. */
export const MATS = {
  steel:        { color: '#3d3f43', metal: 0.62, rough: 0.52, detail: 'cast', dScale: 46, dStr: 0.30, wear: { color: '#a9abae', metal: 1, rough: 0.3, amount: 0.9 } },
  steel_dark:   { color: '#2c2d30', metal: 0.66, rough: 0.55, detail: 'cast', dScale: 50, dStr: 0.28, wear: { color: '#9a9ca0', metal: 1, rough: 0.32, amount: 0.8 } },
  steel_bright: { color: '#8e9094', metal: 1.00, rough: 0.30, detail: 'brushed', dScale: 30, dStr: 0.25, wear: { color: '#c9cbce', metal: 1, rough: 0.2, amount: 0.6 } },
  steel_blued:  { color: '#1d2129', metal: 0.90, rough: 0.30, detail: 'brushed', dScale: 34, dStr: 0.2, wear: { color: '#a8abb0', metal: 1, rough: 0.24, amount: 0.9 } },
  alu:          { color: '#1c1d1f', metal: 0.55, rough: 0.40, detail: 'cast', dScale: 60, dStr: 0.18, wear: { color: '#c3c6ca', metal: 1, rough: 0.30, amount: 1.0 } },
  alu_tan:      { color: '#8a7656', metal: 0.30, rough: 0.48, detail: 'cast', dScale: 60, dStr: 0.18, wear: { color: '#c3c6ca', metal: 1, rough: 0.30, amount: 0.9 } },
  polymer:      { color: '#1f2022', metal: 0.00, rough: 0.62, detail: 'stipple', dScale: 90, dStr: 0.35, wear: { color: '#3a3b3e', metal: 0, rough: 0.42, amount: 0.7 } },
  polymer_tan:  { color: '#8b7355', metal: 0.00, rough: 0.66, detail: 'stipple', dScale: 90, dStr: 0.32, wear: { color: '#a48d6b', metal: 0, rough: 0.45, amount: 0.6 } },
  polymer_od:   { color: '#4a4d36', metal: 0.00, rough: 0.66, detail: 'stipple', dScale: 90, dStr: 0.32, wear: { color: '#5e6146', metal: 0, rough: 0.45, amount: 0.6 } },
  polymer_grip: { color: '#1b1c1e', metal: 0.00, rough: 0.78, detail: 'stipple', dScale: 160, dStr: 0.6, wear: { color: '#2e2f31', metal: 0, rough: 0.5, amount: 0.5 } },
  rubber:       { color: '#151515', metal: 0.00, rough: 0.88, detail: 'stipple', dScale: 120, dStr: 0.25, wear: { color: '#222', metal: 0, rough: 0.8, amount: 0.2 } },
  wood:         { color: '#6a3519', metal: 0.00, rough: 0.38, detail: 'flat', wood: { dark: '#2e1206', light: '#8a4a22', scale: 6 }, wear: { color: '#a0683a', metal: 0, rough: 0.6, amount: 0.7 } },
  wood_light:   { color: '#a07148', metal: 0.00, rough: 0.55, detail: 'flat', wood: { dark: '#5b3a20', light: '#c1925f', scale: 10 }, wear: { color: '#c8a27a', metal: 0, rough: 0.7, amount: 0.8 } },
  bakelite:     { color: '#2c1b14', metal: 0.00, rough: 0.40, detail: 'cast', dScale: 40, dStr: 0.1, wear: { color: '#5a3a2a', metal: 0, rough: 0.3, amount: 0.6 } },
  bakelite_plum:{ color: '#4c1d13', metal: 0.00, rough: 0.34, detail: 'cast', dScale: 40, dStr: 0.08, wood: { dark: '#240b06', light: '#5e2617', scale: 4, marble: 1 }, wear: { color: '#7a3c28', metal: 0, rough: 0.3, amount: 0.5 } },
  brass:        { color: '#c99a4b', metal: 1.00, rough: 0.30, detail: 'brushed', dScale: 60, dStr: 0.12, wear: { color: '#e6c27f', metal: 1, rough: 0.2, amount: 0.5 } },
  copper:       { color: '#c77a52', metal: 1.00, rough: 0.32, detail: 'flat', wear: { color: '#e09a74', metal: 1, rough: 0.2, amount: 0.5 } },
  chrome:       { color: '#d6d8db', metal: 1.00, rough: 0.07, detail: 'flat', wear: { color: '#e5e5e5', metal: 1, rough: 0.05, amount: 0.2 } },
  gold:         { color: '#e3b04b', metal: 1.00, rough: 0.20, detail: 'brushed', dScale: 50, dStr: 0.12, wear: { color: '#f4d48a', metal: 1, rough: 0.12, amount: 0.5 } },
  carbon:       { color: '#16171a', metal: 0.15, rough: 0.30, detail: 'carbon', dScale: 70, dStr: 0.5, wear: { color: '#2b2c30', metal: 0.2, rough: 0.3, amount: 0.3 } },
  fabric:       { color: '#2f3326', metal: 0.00, rough: 0.92, detail: 'fabric', dScale: 160, dStr: 0.7, wear: { color: '#45493a', metal: 0, rough: 0.95, amount: 0.3 } },
  fabric_black: { color: '#1a1a1b', metal: 0.00, rough: 0.92, detail: 'fabric', dScale: 160, dStr: 0.7, wear: { color: '#2a2a2b', metal: 0, rough: 0.95, amount: 0.3 } },
  paint_od:     { color: '#4b5236', metal: 0.10, rough: 0.55, detail: 'cast', dScale: 40, dStr: 0.15, wear: { color: '#8f9296', metal: 1, rough: 0.3, amount: 1.0 } },
  paint_red:    { color: '#7d1a14', metal: 0.10, rough: 0.45, detail: 'cast', dScale: 40, dStr: 0.15, wear: { color: '#8f9296', metal: 1, rough: 0.3, amount: 1.0 } },
  paint_yellow: { color: '#c9a227', metal: 0.10, rough: 0.5, detail: 'cast', dScale: 40, dStr: 0.15, wear: { color: '#8f9296', metal: 1, rough: 0.3, amount: 1.0 } },
  paint_white:  { color: '#cfd0cc', metal: 0.10, rough: 0.5, detail: 'cast', dScale: 40, dStr: 0.15, wear: { color: '#8f9296', metal: 1, rough: 0.3, amount: 1.0 } },
  ceramic:      { color: '#d9d4c7', metal: 0.00, rough: 0.35, detail: 'flat', wear: { color: '#e8e2d4', metal: 0, rough: 0.3, amount: 0.3 } },
  bone:         { color: '#cdbf9f', metal: 0.00, rough: 0.55, detail: 'cast', dScale: 30, dStr: 0.4, wear: { color: '#e3d7bb', metal: 0, rough: 0.4, amount: 0.5 } },
  glass:        { color: '#0a0c0e', metal: 0.00, rough: 0.04, detail: 'flat', wear: { color: '#0a0c0e', metal: 0, rough: 0.04, amount: 0 }, env: 2.0 },
  lens:         { color: '#120a1c', metal: 0.30, rough: 0.03, detail: 'flat', wear: { color: '#120a1c', metal: 0, rough: 0.03, amount: 0 }, env: 2.5, sheenTint: '#6a3cff' },
  sleeve:       { color: '#4d5240', metal: 0.00, rough: 0.9, detail: 'fabric', dScale: 260, dStr: 0.55, ao: 1, wear: { color: '#5d6250', metal: 0, rough: 0.92, amount: 0.25 } },
  sleeve_dark:  { color: '#353a2c', metal: 0.00, rough: 0.9, detail: 'fabric', dScale: 300, dStr: 0.6, wear: { color: '#454a3a', metal: 0, rough: 0.92, amount: 0.2 } },
  glove:        { color: '#2b2a27', metal: 0.00, rough: 0.72, detail: 'fabric', dScale: 340, dStr: 0.35, wear: { color: '#4a4740', metal: 0, rough: 0.6, amount: 0.5 } },
  glove_cuff:   { color: '#1e1e1d', metal: 0.00, rough: 0.8, detail: 'fabric', dScale: 300, dStr: 0.5, wear: { color: '#333', metal: 0, rough: 0.8, amount: 0.2 } },
  glove_tip:    { color: '#3b352c', metal: 0.00, rough: 0.6, detail: 'cast', dScale: 120, dStr: 0.25, wear: { color: '#5b5141', metal: 0, rough: 0.5, amount: 0.7 } },
  glove_pad:    { color: '#242423', metal: 0.00, rough: 0.75, detail: 'fabric', dScale: 380, dStr: 0.5, wear: { color: '#3a3a38', metal: 0, rough: 0.7, amount: 0.3 } },
  glove_palm:   { color: '#3a352d', metal: 0.00, rough: 0.82, detail: 'stipple', dScale: 200, dStr: 0.5, wear: { color: '#4f483d', metal: 0, rough: 0.7, amount: 0.4 } },
  knuckle:      { color: '#1a1a1a', metal: 0.00, rough: 0.45, detail: 'cast', dScale: 90, dStr: 0.2, wear: { color: '#3a3a3a', metal: 0, rough: 0.35, amount: 0.6 } },
  leather:      { color: '#3a2618', metal: 0.00, rough: 0.6, detail: 'cast', dScale: 70, dStr: 0.35, wear: { color: '#5a3d28', metal: 0, rough: 0.45, amount: 0.6 } },
};
// Emissive presets (energy weapons, reticles, indicator lights). `glow` = HDR intensity.
for (const [name, hex, glow] of [
  ['glow_cyan', '#3fd8ff', 8], ['glow_blue', '#3a6dff', 8], ['glow_red', '#ff3626', 8], ['glow_orange', '#ff8a1e', 8],
  ['glow_purple', '#b54bff', 8], ['glow_green', '#49ff6a', 8], ['glow_gold', '#ffc74a', 7], ['glow_white', '#ffffff', 6],
  ['reticle_red', '#ff2a1a', 14], ['reticle_green', '#36ff4a', 12], ['tritium', '#9dff6a', 4],
]) {
  MATS[name] = { color: '#111', metal: 0, rough: 0.4, detail: 'flat', emissive: hex, glow, wear: { color: '#111', metal: 0, rough: 0.4, amount: 0 }, noBake: true };
}

const shared = {
  vmProj: { value: new THREE.Matrix4() }, // viewmodel projection
  time: { value: 0 },
};
export const materialUniforms = shared;

const VERT_PARS = /* glsl */`
attribute vec4 _bake;
varying vec4 vBake;
varying vec3 vObjPos;
varying vec3 vObjNor;
uniform mat4 vmProj;
`;

const FRAG_PARS = /* glsl */`
varying vec4 vBake;
varying vec3 vObjPos;
varying vec3 vObjNor;
uniform mat4 modelMatrix;
uniform sampler2D tDetail;
uniform sampler2D tGrunge;
uniform sampler2D tWood;
uniform float dScale, dStr;
uniform vec3 wearColor;
uniform float wearMetal, wearRough, wearAmount;
uniform float cavityAmt, aoAmt;
uniform vec3 woodDark, woodLight;
uniform float woodScale, woodOn, woodMarble;
uniform float glowPulse;

vec3 triW(vec3 n) { vec3 w = pow(abs(n), vec3(4.0)); return w / (w.x + w.y + w.z + 1e-5); }
vec4 triTex(sampler2D t, vec3 p, vec3 w) {
  return texture2D(t, p.zy) * w.x + texture2D(t, p.xz) * w.y + texture2D(t, p.xy) * w.z;
}
// whiteout-blended triplanar normal perturbation in object space
vec3 triNormal(sampler2D t, vec3 p, vec3 n, vec3 w) {
  vec3 tx = texture2D(t, p.zy).xyz * 2.0 - 1.0;
  vec3 ty = texture2D(t, p.xz).xyz * 2.0 - 1.0;
  vec3 tz = texture2D(t, p.xy).xyz * 2.0 - 1.0;
  vec3 nx = vec3(0.0, tx.y, tx.x) * sign(n.x);
  vec3 ny = vec3(ty.x, 0.0, ty.y) * sign(n.y);
  vec3 nz = vec3(tz.x, tz.y, 0.0) * sign(n.z);
  return nx * w.x + ny * w.y + nz * w.z;
}
`;

function patch(shader, def, opts) {
  const fin = opts.finishU;
  if (fin) {
    const ft = finishTextures();
    shader.defines = shader.defines || {};
    shader.defines.FINISH = '';
    Object.assign(shader.uniforms, {
      fType: { value: fin.type }, fC0: { value: fin.c0 }, fC1: { value: fin.c1 }, fC2: { value: fin.c2 }, fC3: { value: fin.c3 },
      fRough: { value: fin.rough }, fMetal: { value: fin.metal }, fSeedRot: { value: fin.seedRot }, fFadeAng: { value: fin.fadeAng },
      fGem: { value: fin.gem }, fIrid: { value: fin.irid }, fRow: { value: fin.row }, fSeedOff: { value: fin.seedOff },
      fBoxMin: { value: opts.box?.min || new THREE.Vector3(-0.05, -0.15, -0.5) }, fBoxMax: { value: opts.box?.max || new THREE.Vector3(0.05, 0.15, 0.5) },
      tMarble: { value: ft.marble }, tRamp: { value: ft.ramp },
    });
  }
  const tex = detailTextures();
  const wear = def.wear || {};
  const wood = def.wood;
  Object.assign(shader.uniforms, {
    tDetail: { value: tex.normal[def.detail || 'flat'] },
    tGrunge: { value: tex.grunge },
    tWood: { value: tex.wood },
    dScale: { value: def.dScale ?? 40 },
    dStr: { value: def.dStr ?? 0.0 },
    wearColor: { value: fin ? C('#d6d8db') : C(wear.color || def.color) },
    wearMetal: { value: fin ? 1 : wear.metal ?? def.metal },
    wearRough: { value: wear.rough ?? def.rough },
    wearAmount: { value: (wear.amount ?? 0.6) * (opts.wear ?? 1) },
    cavityAmt: { value: def.cavity ?? 0.6 },
    aoAmt: { value: def.noBake ? 0 : (def.ao ?? 1) },
    woodDark: { value: C(wood?.dark || '#000') },
    woodLight: { value: C(wood?.light || '#000') },
    woodScale: { value: wood?.scale ?? 8 },
    woodOn: { value: wood ? 1 : 0 },
    woodMarble: { value: wood?.marble ? 1 : 0 },
    glowPulse: { value: 0 },
    vmProj: shared.vmProj,
    time: shared.time,
  });
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + VERT_PARS)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      vObjPos = position; vObjNor = normal;
      vBake = _bake;`);
  if (opts.viewmodel) {
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', /* glsl */`
      vec4 mvPosition = vec4( transformed, 1.0 );
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = vmProj * mvPosition;
      gl_Position.z = gl_Position.z * 0.08 - 0.92 * gl_Position.w;`);
  }
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + FRAG_PARS + (fin ? FINISH_PARS : ''))
    .replace('#include <map_fragment>', /* glsl */`#include <map_fragment>
      vec3 tw = triW(vObjNor);
      vec3 tp = vObjPos * dScale;
      vec4 grunge = triTex(tGrunge, vObjPos * 6.0, tw);
      float ao = mix(1.0, vBake.r, aoAmt);
      float partR = vBake.a;
      if (woodOn > 0.5) {
        // grain runs along the gun's long axis (object z)
        vec3 wp = vObjPos * woodScale;
        vec2 wuv = vec2(wp.z * 0.18 + partR * 3.0, (wp.y + wp.x * 0.45) * 1.0);
        vec4 g1 = texture2D(tWood, wuv);
        vec4 g2 = texture2D(tWood, wuv * vec2(0.37, 0.53) + 0.31);
        float grain = woodMarble > 0.5 ? smoothstep(0.25, 0.9, g1.b * 0.6 + g2.b * 0.6 - 0.1) : g1.r;
        vec3 wc = mix(woodLight, woodDark, clamp(grain * 0.8 + g1.g * 0.25, 0.0, 1.0));
        wc *= 0.78 + 0.45 * g2.b;
        diffuseColor.rgb = wc;
      }
      diffuseColor.rgb *= 0.92 + 0.16 * partR;           // tiny per-part tint variation
      float finR = -1.0, finM = -1.0;
      ${fin ? FINISH_MAIN : ''}
      float edge = vBake.g;
      float chip = grunge.a;
      float wearMask = smoothstep(0.5, 0.72, edge * wearAmount * 1.2 + (chip - 0.5) * 0.65 + grunge.g * 0.12 * wearAmount);
      diffuseColor.rgb = mix(diffuseColor.rgb, wearColor, wearMask);
      float cav = vBake.b * cavityAmt + (1.0 - ao) * 0.35;
      vec3 dirt = vec3(0.09, 0.08, 0.065);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.55 + dirt * 0.45, clamp(cav * (0.5 + grunge.b), 0.0, 0.85));
      `)
    .replace('#include <roughnessmap_fragment>', /* glsl */`#include <roughnessmap_fragment>
      if (finR >= 0.0) roughnessFactor = finR;
      roughnessFactor = mix(roughnessFactor, wearRough, wearMask);
      roughnessFactor = clamp(roughnessFactor + (grunge.r - 0.5) * 0.18 + cav * 0.25, 0.04, 1.0);`)
    .replace('#include <metalnessmap_fragment>', /* glsl */`#include <metalnessmap_fragment>
      if (finM >= 0.0) metalnessFactor = finM;
      metalnessFactor = mix(metalnessFactor, wearMetal, wearMask);`)
    .replace('#include <normal_fragment_maps>', /* glsl */`#include <normal_fragment_maps>
      if (dStr > 0.0) {
        vec3 dObj = triNormal(tDetail, tp, vObjNor, tw) * dStr * (1.0 - wearMask * 0.6);
        vec3 dView = mat3(viewMatrix) * (mat3(modelMatrix) * dObj);
        normal = normalize(normal + dView);
      }`)
    .replace('#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
      totalEmissiveRadiance *= 1.0 + glowPulse;`)
    .replace('#include <aomap_fragment>', /* glsl */`
      reflectedLight.indirectDiffuse *= ao;
      reflectedLight.directDiffuse *= mix(1.0, ao, 0.55);
      reflectedLight.directSpecular *= mix(1.0, ao, 0.7);
      #if defined( USE_ENVMAP ) && defined( STANDARD )
        float dotNVao = saturate( dot( geometryNormal, geometryViewDir ) );
        reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNVao, ao, material.roughness );
      #endif`);
}

const cache = new Map();

/**
 * Returns a (cached) material for a preset key. opts: { viewmodel, wear (0..2 multiplier), tint }
 * Unknown keys fall back to steel.
 */
export function hardSurface(key, opts = {}) {
  // finishes (skins) only apply to paintable parts
  const paint = opts.finish && (opts.melee ? PAINTABLE_MELEE : PAINTABLE).has(key);
  if (paint && !opts.finishU) opts = { ...opts, finishU: finishUniforms(opts.finish.id, opts.finish.seed), wear: opts.finish.wear ?? 0.4 };
  if (!paint && opts.finishU) opts = { ...opts, finishU: null };
  const ck = key + (opts.viewmodel ? ':vm' : '') + ':' + (opts.wear ?? 1) + ':' + (opts.tint || '') + (paint ? ':' + opts.finish.id + ':' + (opts.finish.seed || 0) + ':' + (opts.boxKey || '') : '');
  if (cache.has(ck)) return cache.get(ck);
  const def = MATS[key] || MATS.steel;
  const m = new THREE.MeshStandardMaterial({
    name: key,
    color: C(opts.tint || def.color),
    metalness: def.metal,
    roughness: def.rough,
    envMapIntensity: def.env ?? 1,
  });
  if (def.emissive) { m.emissive = C(def.emissive); m.emissiveIntensity = def.glow; }
  m.onBeforeCompile = (shader) => { patch(shader, def, opts); m.userData.shader = shader; };
  m.customProgramCacheKey = () => (opts.viewmodel ? 'hsvm' : 'hs') + (paint ? 'F' : '');
  m.userData.preset = key;
  cache.set(ck, m);
  return m;
}

/** Replaces the materials of a loaded asset (meshes named "<part>:<preset>") with hard-surface presets. */
export function applyHardSurface(root, opts = {}) {
  if (opts.finish && !opts.box) {
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const box = new THREE.Box3();
    root.traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld))); } });
    opts = { ...opts, box, boxKey: box.min.toArray().concat(box.max.toArray()).map((v) => v.toFixed(2)).join(',') };
  }
  root.traverse((o) => {
    if (!o.isMesh) return;
    const key = o.userData.mat || o.material?.name || 'steel';
    if (!o.geometry.attributes._bake) {
      // assets built without a bake: neutral bake so the shader still works
      const n = o.geometry.attributes.position.count;
      const b = new Uint8Array(n * 4).fill(0);
      for (let i = 0; i < n; i++) { b[i * 4] = 255; b[i * 4 + 3] = 128; }
      o.geometry.setAttribute('_bake', new THREE.BufferAttribute(b, 4, true));
    }
    o.material = hardSurface(key, opts);
    o.castShadow = !opts.viewmodel;
    o.receiveShadow = true;
    if (opts.viewmodel) o.frustumCulled = false;
  });
  return root;
}
