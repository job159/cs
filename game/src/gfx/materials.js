// Hard-surface PBR materials for weapons and props built by tools/assets (no UVs needed):
//   - `_bake` vertex attribute: r = AO, g = convex edge (wear), b = cavity (grime), a = per-part random
//   - `aRest` vertex attribute (weapons with a finish / premium layer): rest position in weapon-root space,
//     so patterns are continuous across parts at rest and stick to moving parts (PREMIUM_WEAPONS §1.5.8)
//   - object-space triplanar detail normals (cast / brushed / stipple / knurl / carbon / fabric)
//   - grunge-modulated edge wear revealing the substrate (bare steel, aluminium, lighter polymer)
//   - procedural wood grain for wooden furniture
//   - finishes (finishes.js), premium presets (premium.js), the kill counter display (counter.js)
//   - optional viewmodel projection: own FOV + depth squeezed into the front of the depth range so the
//     gun never clips into walls while still being lit/shadowed by the real scene; viewmodel materials
//     also get the studio environment (vmenv.js)
import * as THREE from 'three';
import { detailTextures } from './detail.js';
import { finishTextures, finishUniforms, finishShared, ensureNoise3D, finishId, finishDef, FINISH_PARS, FINISH_MAIN, FINISH_NORMAL,
  PAINTABLE, PAINTABLE_MELEE, REGION, WOOD } from './finishes.js';
import { PRESETS, presetForKey, premiumParams, premiumUniforms, premiumState, PremiumState, GFX_NOISE, PREMIUM_PARS, PREMIUM_ALBEDO,
  PREMIUM_NORMAL, PREMIUM_EMIT, PREMIUM_OUT } from './premium.js';
import { COUNTER_PARS, COUNTER_EMIT, KillCounter, mountKillCounter } from './counter.js';
import { vmEnv, VMENV_PARS, VMENV_LIGHT } from './vmenv.js';

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
  // premium materials (PREMIUM_WEAPONS §1.5.2); presets are derived from the key (premium.js presetForKey)
  porcelain:    { color: '#f3efe6', metal: 0, rough: 0.24, detail: 'flat', env: 1.4, wear: { color: '#d9d2c2', metal: 0, rough: 0.6, amount: 0.25 } },
  lacquer_red:  { color: '#9a1420', metal: 0, rough: 0.2, detail: 'flat', env: 1.3, wear: { color: '#3a1a12', metal: 0, rough: 0.5, amount: 0.35 } },
  lacquer_black:{ color: '#121012', metal: 0, rough: 0.18, detail: 'flat', env: 1.3, wear: { color: '#5a3a24', metal: 0, rough: 0.5, amount: 0.35 } },
  glaze_black:  { color: '#141214', metal: 0, rough: 0.16, detail: 'flat', env: 1.3, wear: { color: '#6a5a48', metal: 0, rough: 0.6, amount: 0.25 } },
  gold_leaf:    { color: '#e8b54a', metal: 1, rough: 0.18, detail: 'brushed', dScale: 50, dStr: 0.08, wear: { color: '#7a5a2e', metal: 1, rough: 0.4, amount: 0.4 } },
  bronze_aged:  { color: '#7a5a2e', metal: 1, rough: 0.42, detail: 'cast', dScale: 40, dStr: 0.25, cavity: 1.0, cavCol: '#3f6a58', wear: { color: '#c8995a', metal: 1, rough: 0.25, amount: 0.6 } },
  obsidian:     { color: '#0f0d12', metal: 0.2, rough: 0.12, detail: 'flat', wear: { color: '#2a2630', metal: 0.2, rough: 0.2, amount: 0.2 } },
  black_chrome: { color: '#1a1a1e', metal: 1, rough: 0.1, detail: 'flat', wear: { color: '#9a9ca0', metal: 1, rough: 0.15, amount: 0.4 } },
  glaze_cobalt: { color: '#244aa5', metal: 0, rough: 0.18, detail: 'flat', env: 1.3, wear: { color: '#d9d2c2', metal: 0, rough: 0.6, amount: 0.25 } },
  glaze_jade:   { color: '#2f8f4e', metal: 0, rough: 0.18, detail: 'flat', wear: { color: '#d9d2c2', metal: 0, rough: 0.6, amount: 0.25 } },
  glaze_ochre:  { color: '#c98a1b', metal: 0, rough: 0.2, detail: 'flat', wear: { color: '#d9d2c2', metal: 0, rough: 0.6, amount: 0.25 } },
  glaze_aubergine: { color: '#5b2b5e', metal: 0, rough: 0.2, detail: 'flat', wear: { color: '#d9d2c2', metal: 0, rough: 0.6, amount: 0.25 } },
  crystal:      { color: '#bfe6ff', metal: 0.2, rough: 0.08, detail: 'flat', env: 1.6, wear: { color: '#bfe6ff', metal: 0.2, rough: 0.08, amount: 0 } },
  glass_clear:  { color: '#0a0c0e', metal: 0, rough: 0.04, detail: 'flat', env: 2, opacity: 0.3, fres: 1, wear: { color: '#0a0c0e', metal: 0, rough: 0.04, amount: 0 }, noBake: true },
  jade:         { color: '#3a8f72', metal: 0, rough: 0.22, detail: 'flat', fres: 0.6, wear: { color: '#7fbfa4', metal: 0, rough: 0.3, amount: 0.2 } },
  paper_oil:    { color: '#d9b98a', metal: 0, rough: 0.5, detail: 'fabric', dScale: 220, dStr: 0.15, selfLit: 0.12, wear: { color: '#b8956a', metal: 0, rough: 0.6, amount: 0.3 } },
  silk_red:     { color: '#a5121e', metal: 0, rough: 0.7, detail: 'fabric', dScale: 300, dStr: 0.4, wear: { color: '#c23a3e', metal: 0, rough: 0.7, amount: 0.2 } },
  pearl:        { color: '#ece8e2', metal: 0.1, rough: 0.2, detail: 'flat', pearl: 0.2, wear: { color: '#d8d2c8', metal: 0.1, rough: 0.3, amount: 0.2 } },
  stone_slate:  { color: '#4a4f52', metal: 0, rough: 0.75, detail: 'cast', dScale: 14, dStr: 0.6, wear: { color: '#6a7074', metal: 0, rough: 0.8, amount: 0.5 } },
  paint_safety: { color: '#e2571a', metal: 0.1, rough: 0.45, detail: 'cast', dScale: 40, dStr: 0.15, wear: { color: '#8f9296', metal: 1, rough: 0.3, amount: 1.0 } },
  ceramic_armor:{ color: '#e6e3dc', metal: 0, rough: 0.42, detail: 'stipple', dScale: 220, dStr: 0.12, wear: { color: '#b8b4aa', metal: 0, rough: 0.6, amount: 0.4 } },
  anod_whale:   { color: '#1f3f6a', metal: 0.6, rough: 0.32, detail: 'cast', dScale: 60, dStr: 0.12, wear: { color: '#c3c6ca', metal: 1, rough: 0.3, amount: 0.8 } },
  anod_magpie:  { color: '#1b3a8a', metal: 0.6, rough: 0.3, detail: 'cast', dScale: 60, dStr: 0.12, wear: { color: '#c3c6ca', metal: 1, rough: 0.3, amount: 0.8 } },
};
// Emissive presets (energy weapons, reticles, indicator lights). `glow` = HDR intensity.
for (const [name, hex, glow] of [
  ['glow_cyan', '#3fd8ff', 8], ['glow_blue', '#3a6dff', 8], ['glow_red', '#ff3626', 8], ['glow_orange', '#ff8a1e', 8],
  ['glow_purple', '#b54bff', 8], ['glow_green', '#49ff6a', 8], ['glow_gold', '#ffc74a', 7], ['glow_white', '#ffffff', 6],
  ['reticle_red', '#ff2a1a', 14], ['reticle_green', '#36ff4a', 12], ['tritium', '#9dff6a', 4],
  ['glow_vermilion', '#ff5a2a', 8], ['glow_jade', '#7dffb8', 7], ['glow_magenta', '#ff3fb4', 8], ['glow_lime', '#9dff3a', 8],
  ['glow_ice', '#6fe3ff', 8], ['glow_sun', '#fff2b0', 7], ['glow_vfd', '#4dffd2', 3], ['glow_teal', '#3fffe0', 7], ['glow_arc', '#d6ccff', 8],
]) {
  MATS[name] = { color: '#111', metal: 0, rough: 0.4, detail: 'flat', emissive: hex, glow, wear: { color: '#111', metal: 0, rough: 0.4, amount: 0 }, noBake: true };
}
MATS.glow_vfd.color = '#05090a'; MATS.glow_vfd.rough = 0.12;   // dark VFD glass

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
#if defined(FINISH) || defined(PREMIUM)
attribute vec3 aRest;
varying vec3 vRest;
#endif
`;

const FRAG_PARS = /* glsl */`
varying vec4 vBake;
varying vec3 vObjPos;
varying vec3 vObjNor;
#if defined(FINISH) || defined(PREMIUM)
varying vec3 vRest;
#endif
uniform mat4 modelMatrix;
uniform float time;
uniform sampler2D tDetail;
uniform sampler2D tGrunge;
uniform sampler2D tWood;
uniform float dScale, dStr;
uniform vec3 wearColor;
uniform float wearMetal, wearRough, wearAmount;
uniform float cavityAmt, aoAmt, selfLit;
uniform vec3 cavCol;
uniform vec3 woodDark, woodLight;
uniform float woodScale, woodOn, woodMarble;
uniform float glowPulse;
#ifdef HS_PEARL
uniform float hsPearl;
#endif
#ifdef HS_FRES
uniform float hsFres;
#endif

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

const PRESET_DEFS = (pv, lite) => (pv ? (lite ? PRESETS[pv].lite : PRESETS[pv].defs) : null);

function patch(shader, def, opts) {
  const fin = opts.finishU;
  const defs = shader.defines = shader.defines || {};
  const tex = detailTextures();
  if (fin) {
    const ft = finishTextures();
    ensureNoise3D();
    defs.FINISH = ''; defs.FTYPE = fin.type; defs.FWEAR = fin.wearStyle;
    if (fin.sfxMask & 1) defs.FINISH_PEARL = '';
    if (fin.sfxMask & 2) defs.FINISH_GLITTER = '';
    const b = opts.box;
    Object.assign(shader.uniforms, {
      fC0: { value: fin.c0 }, fC1: { value: fin.c1 }, fC2: { value: fin.c2 }, fC3: { value: fin.c3 },
      fRough: { value: fin.rough }, fMetal: { value: fin.metal }, fSeedRot: { value: fin.seedRot }, fFadeAng: { value: fin.fadeAng },
      fGem: { value: fin.gem }, fIrid: { value: fin.irid }, fRow: { value: fin.row }, fSeedOff: { value: fin.seedOff }, fPat: { value: fin.pat },
      fWebs: { value: fin.webs }, fKnife: { value: opts.melee ? 1.6 : 1 }, fPlay: { value: -1 }, uRegion: { value: opts.region ?? 0 },
      fWear: { value: fin.wear }, fScratch: { value: fin.scratch }, fDur: { value: fin.dur },
      fPearl: { value: fin.pearl }, fGlit: { value: fin.glit }, fGlitScale: { value: fin.glitScale }, fRainbow: { value: fin.rainbow }, fGlitTint: { value: fin.glitTint },
      fBoxMin: { value: b?.min || new THREE.Vector3(-0.05, -0.15, -0.5) }, fBoxMax: { value: b?.max || new THREE.Vector3(0.05, 0.15, 0.5) },
      tMarble: { value: ft.marble }, tNoise3D: finishShared.tNoise3D, fVol: finishShared.fVol,
    });
  }
  const pvDefs = PRESET_DEFS(opts.pv, opts.lite);
  if (pvDefs) {
    defs.PREMIUM = '';
    for (const d of pvDefs) defs['PREMIUM_' + d] = '';
    const pu = premiumUniforms(opts.state, opts.pvParams);
    const fb = opts.fullBox;
    if (fb) pu.pBox.value.set(fb.min.z, fb.max.z, fb.min.y, fb.max.y);
    Object.assign(shader.uniforms, pu);
  }
  if (opts.counter) { defs.KILLCOUNTER = ''; Object.assign(shader.uniforms, opts.counter.u); }
  if (def.pearl) { defs.HS_PEARL = ''; shader.uniforms.hsPearl = { value: def.pearl }; }
  if (def.fres) { defs.HS_FRES = ''; shader.uniforms.hsFres = { value: def.fres }; }
  if (opts.vmEnv) { defs.VM_ENV = ''; Object.assign(shader.uniforms, vmEnv.u); }
  const detail = fin?.detail || def.detail || 'flat';
  const wear = def.wear || {};
  const wood = def.wood;
  Object.assign(shader.uniforms, {
    tDetail: { value: tex.normal[detail] },
    tGrunge: { value: tex.grunge },
    tWood: { value: tex.wood },
    dScale: { value: fin?.detail ? 26 : def.dScale ?? 40 },     // finish weave: ~2.4 mm carbon twill
    // polished candy / chrome finishes hide most of the casting texture; paints keep some of it
    dStr: { value: fin?.detail ? 0.75 : (def.dStr ?? 0.0) * (fin ? (fin.metal > 0.9 && fin.rough < 0.2 ? 0.2 : 0.7) : 1) },
    wearColor: { value: C(wear.color || def.color) },
    wearMetal: { value: wear.metal ?? def.metal },
    wearRough: { value: wear.rough ?? def.rough },
    // finishes run their own multi-layer wear from the float; the generic edge wear is off for them
    wearAmount: { value: fin ? 0 : (wear.amount ?? 0.6) * (opts.wear ?? 1) },
    cavityAmt: { value: fin ? fin.grime : def.cavity ?? 0.6 },
    cavCol: { value: def.cavCol ? C(def.cavCol) : new THREE.Color(0.09, 0.08, 0.065) },
    aoAmt: { value: def.noBake ? 0 : (def.ao ?? 1) },
    selfLit: { value: def.selfLit ?? 0 },
    woodDark: { value: C(wood?.dark || '#000') },
    woodLight: { value: C(wood?.light || '#000') },
    woodScale: { value: wood?.scale ?? 8 },
    woodOn: { value: wood && !fin ? 1 : 0 },
    woodMarble: { value: wood?.marble ? 1 : 0 },
    glowPulse: { value: 0 },
    vmProj: shared.vmProj,
    time: shared.time,
  });
  const rest = fin || pvDefs;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + VERT_PARS)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      vObjPos = position; vObjNor = normal;
      vBake = _bake;${rest ? '\n      vRest = aRest;' : ''}`);
  if (opts.viewmodel) {
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', /* glsl */`
      vec4 mvPosition = vec4( transformed, 1.0 );
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = vmProj * mvPosition;
      gl_Position.z = gl_Position.z * 0.08 - 0.92 * gl_Position.w;`);
  }
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + FRAG_PARS + GFX_NOISE + FINISH_PARS + PREMIUM_PARS + COUNTER_PARS + VMENV_PARS)
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
      ${pvDefs ? PREMIUM_ALBEDO : ''}
      float edge = vBake.g;
      float chip = grunge.a;
      float wearMask = smoothstep(0.5, 0.72, edge * wearAmount * 1.2 + (chip - 0.5) * 0.65 + grunge.g * 0.12 * wearAmount) * step(0.001, wearAmount);
      diffuseColor.rgb = mix(diffuseColor.rgb, wearColor, wearMask);
      float cav = vBake.b * cavityAmt + (1.0 - ao) * 0.35;
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.55 + cavCol * 0.45, clamp(cav * (0.5 + grunge.b), 0.0, 0.85));
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
      }
      ${fin ? FINISH_NORMAL : ''}
      ${pvDefs ? PREMIUM_NORMAL : ''}
      #if defined(HS_PEARL) || defined(HS_FRES)
      float hsF = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
      #endif
      #ifdef HS_PEARL
      { vec3 hsv = fRgb2hsv(diffuseColor.rgb); hsv.x = fract(hsv.x + hsPearl * hsF); hsv.y = max(hsv.y, 0.06); diffuseColor.rgb = fHsv2rgb(hsv); }
      #endif
      #ifdef HS_FRES
      { float f3 = hsF * hsF * hsF; diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 2.2 + 0.04, f3 * hsFres); diffuseColor.a = mix(diffuseColor.a, 1.0, f3); }
      #endif`)
    .replace('#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
      totalEmissiveRadiance *= 1.0 + glowPulse;
      totalEmissiveRadiance += diffuseColor.rgb * selfLit;
      ${opts.counter ? COUNTER_EMIT : ''}
      ${pvDefs ? PREMIUM_EMIT : ''}`)
    .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n' + (opts.vmEnv ? VMENV_LIGHT : ''))
    .replace('#include <opaque_fragment>', '#include <opaque_fragment>\n' + (pvDefs ? PREMIUM_OUT : ''))
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
let premiumLite = false;
/** Low quality keeps only pv_metal (no leaf) and pv_energy on weapons (§1.14). */
export function setPremiumQuality(q) { premiumLite = q === 'low'; }

/**
 * Returns a (cached) material for a preset key.
 * opts: { viewmodel, wear (0..2 multiplier), tint, finish: { id, seed, float }, melee, region,
 *         pv (preset), state (PremiumState), pvx (part extras.pv), lite, box, fullBox, counter }
 * Unknown keys fall back to steel.
 */
export function hardSurface(key, opts = {}) {
  const def = MATS[key] || MATS.steel;
  // finishes (skins) only apply to paintable parts
  const paint = !!(opts.finish && (opts.melee ? PAINTABLE_MELEE : PAINTABLE).has(key));
  if (paint && !opts.finishU) opts = { ...opts, finishU: finishUniforms(opts.finish.id, opts.finish.seed, opts.finish.float ?? (opts.finish.wear !== undefined ? opts.finish.wear / 2 : null), opts.finish.sfx) };
  if (!paint && opts.finishU) opts = { ...opts, finishU: null };
  if (opts.viewmodel && vmEnv.studio && opts.vmEnv !== false) opts = { ...opts, vmEnv: true };
  let pv = opts.pv && PRESETS[opts.pv] && opts.state ? opts.pv : null;
  const lite = !!(opts.lite || (premiumLite && pv));
  if (pv && !PRESET_DEFS(pv, lite)) pv = null;
  if (pv) opts = { ...opts, pv, lite, pvParams: premiumParams(pv, key, opts.state.cfg, opts.pvx) };
  else if (opts.pv) opts = { ...opts, pv: null };
  const fu = opts.finishU;
  const progKey = (opts.viewmodel ? 'hsvm' : 'hs') + (opts.vmEnv ? 'E' : '') + (fu ? `F${fu.type}.${fu.wearStyle}.${fu.sfxMask}` : '')
    + (pv ? ':' + pv + (lite ? '-' : '') : '') + (def.pearl ? 'P' : '') + (def.fres ? 'R' : '') + (opts.counter ? 'K' : '');
  const ck = key + (opts.viewmodel ? ':vm' : '') + ':' + (opts.wear ?? 1) + ':' + (opts.tint || '') + (opts.vmEnv ? ':E' : '')
    + (fu ? ':' + fu.id + ':' + (opts.finish.seed || 0) + ':' + fu.float.toFixed(4) + ':' + (opts.region ?? '') + ':' + (opts.boxKey || '') + (opts.melee ? ':m' : '') + (opts.finish.sfx ? JSON.stringify(opts.finish.sfx) : '') : '')
    + (pv ? ':' + pv + (lite ? '-' : '') + ':' + opts.state.id + ':' + JSON.stringify(opts.pvx || {}) + ':' + (opts.fullBoxKey || '') : '');
  if (!opts.counter && cache.has(ck)) return cache.get(ck);
  const m = new THREE.MeshStandardMaterial({
    name: key,
    color: C(opts.tint || def.color),
    metalness: def.metal,
    roughness: def.rough,
    envMapIntensity: def.env ?? 1,
  });
  if (def.emissive) { m.emissive = C(def.emissive); m.emissiveIntensity = def.glow; }
  if (def.opacity !== undefined) { m.transparent = true; m.opacity = def.opacity; m.depthWrite = false; }
  const blend = pv && PRESETS[pv].blend;
  if (blend) {
    m.transparent = true; m.depthWrite = false;
    if (blend === 'add') m.blending = THREE.AdditiveBlending;
  }
  if (opts.vmEnv) { m.envMap = vmEnv.studio; m.envMapRotation = vmEnv.rotation; }
  m.onBeforeCompile = (shader) => { patch(shader, def, opts); m.userData.shader = shader; };
  m.customProgramCacheKey = () => progKey;
  m.userData.preset = key;
  if (pv) m.userData.pv = pv;
  if (!opts.counter) cache.set(ck, m);
  return m;
}

// ------------------------------------------------------------------ asset application

const _m = new THREE.Matrix4();

/** Part node (gunkit group with userData.part) of a mesh, or null. */
function partOf(o, root) {
  let p = o.parent;
  while (p && p !== root && !p.userData?.part) p = p.parent;
  return p && p.userData?.part ? p : null;
}

/** Adds `aRest` (rest position in root space) to a mesh's geometry, once (clones share geometry and rest). */
function ensureRest(o, inv) {
  const g = o.geometry;
  if (g.attributes.aRest) return;
  _m.multiplyMatrices(inv, o.matrixWorld);
  const p = g.attributes.position, a = new Float32Array(p.count * 3), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(_m); a[i * 3] = v.x; a[i * 3 + 1] = v.y; a[i * 3 + 2] = v.z; }
  g.setAttribute('aRest', new THREE.BufferAttribute(a, 3));
}

function boxOf(meshes, inv) {
  const box = new THREE.Box3();
  for (const o of meshes) {
    o.geometry.computeBoundingBox();
    box.union(o.geometry.boundingBox.clone().applyMatrix4(_m.multiplyMatrices(inv, o.matrixWorld)));
  }
  return box;
}
const boxKey = (b) => b.min.toArray().concat(b.max.toArray()).map((v) => v.toFixed(3)).join(',');

/**
 * Replaces the materials of a loaded asset (meshes named "<part>:<preset>") with hard-surface presets.
 * opts: { viewmodel, wear, melee,
 *   finish: { id, seed (0..999), float (0..1), regions? } — CS2-style skin on paintable parts (§3),
 *   premium: def.premium | PremiumState — premium presets per material key / part extras.pv (§1.5),
 *   premiumKey, lite / world (default: third person = lite presets, emissive x0.5 unless viewmodel),
 *   counter: { kills, boss, other } — mounts a 斬數計 (§3.6) }
 * Sets root.userData.premiumState / root.userData.killCounter when created.
 */
export function applyHardSurface(root, opts = {}) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const meshes = [];
  root.traverse((o) => { if (o.isMesh && !o.name.startsWith('kc_')) meshes.push(o); });
  const fdef = opts.finish ? finishDef(opts.finish.id) : null;
  const fin = fdef ? { ...opts.finish, id: finishId(opts.finish.id) } : null;
  const prem = opts.premium || null;
  const meta = root.userData?.weapon ? root.userData : root.children.find((c) => c.userData?.weapon)?.userData || {};
  let box = opts.box, fullBox = null;
  if (fin || prem) {
    for (const o of meshes) ensureRest(o, inv);
    if (!box) {
      if (meta.paintBox) box = new THREE.Box3(new THREE.Vector3(...meta.paintBox[0]), new THREE.Vector3(...meta.paintBox[1]));
      else {
        // body parts only, paintable meshes only: wings / blades / mags must not stretch the pattern box (§1.5.8 #3)
        const P = opts.melee ? PAINTABLE_MELEE : PAINTABLE;
        const body = meshes.filter((o) => { const p = partOf(o, root); const k = o.userData.mat || o.material?.name; return (!p || p.name === 'body') && P.has(k); });
        box = boxOf(body.length ? body : meshes, inv);
      }
    }
    fullBox = boxOf(meshes, inv);
  }
  let state = null;
  if (prem) {
    const id = meta.weapon || root.name;
    state = prem instanceof PremiumState ? prem : premiumState(opts.premiumKey || (opts.viewmodel ? 'vm:' : 'w:') + id, prem, { world: opts.world ?? !opts.viewmodel });
    root.userData.premiumState = state;
  }
  const bk = box ? boxKey(box) : '', fbk = fullBox ? boxKey(fullBox) : '';
  for (const o of meshes) {
    const key = o.userData.mat || o.material?.name || 'steel';
    if (!o.geometry.attributes._bake) {
      // assets built without a bake: neutral bake so the shader still works
      const n = o.geometry.attributes.position.count;
      const b = new Uint8Array(n * 4).fill(0);
      for (let i = 0; i < n; i++) { b[i * 4] = 255; b[i * 4 + 3] = 128; }
      o.geometry.setAttribute('_bake', new THREE.BufferAttribute(b, 4, true));
    }
    const part = partOf(o, root);
    const pname = part?.name || 'body';
    const mo = { viewmodel: opts.viewmodel, wear: opts.wear, tint: opts.tint, melee: opts.melee, box, boxKey: bk };
    if (fin && !pname.startsWith('fx_')) {
      // per-region finish (Gunsmith-style combos); wood is painted only when the finish defines regions[1]
      const region = part?.userData?.region ?? REGION[key] ?? 0;
      const rid = fin.regions?.[region] ?? fdef.regions?.[region];
      if (!(WOOD.has(key) && rid === undefined)) mo.finish = rid ? { ...fin, id: rid } : fin;
      mo.region = region;
    }
    if (state && !mo.finish) {
      const pvx = part?.userData?.pv || null;
      const preset = pvx?.preset || state.cfg.presets?.[key] || presetForKey(key);
      if (preset) { mo.pv = preset; mo.state = state; mo.pvx = pvx; mo.lite = opts.lite ?? !opts.viewmodel; mo.fullBox = fullBox; mo.fullBoxKey = fbk; }
    }
    o.material = hardSurface(key, mo);
    o.castShadow = !opts.viewmodel;
    o.receiveShadow = true;
    if (opts.viewmodel) o.frustumCulled = false;
  }
  if (opts.counter) {
    const kc = new KillCounter({ ...opts.counter, viewmodel: opts.viewmodel }, (k, o) => hardSurface(k, o));
    mountKillCounter(root, kc, box);
    root.userData.killCounter = kc;
  }
  return root;
}

/**
 * Adds hidden meshes using the given premium presets (and finish styles) under `parent`, so the loading-screen
 * compile (renderer.compileAsync of the scene) builds their programs before the first draw (§1.5.4).
 * presets: ['pv_glaze', ...]; finishes: [finish ids]. Returns the group (remove it after compiling, or keep).
 */
export function premiumWarmup(parent, { presets = Object.keys(PRESETS), finishes = [], viewmodel = true, world = true } = {}) {
  const g = new THREE.Group();
  g.name = 'gfx-warmup';
  const geo = new THREE.BoxGeometry(0.001, 0.001, 0.001);
  const n = geo.attributes.position.count;
  geo.setAttribute('_bake', new THREE.BufferAttribute(new Uint8Array(n * 4).fill(128), 4, true));
  geo.setAttribute('aRest', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const rep = { pv_metal: 'gold', pv_glaze: 'porcelain', pv_energy: 'glow_cyan', pv_crystal: 'crystal', pv_core: 'glow_ice', pv_holo: 'glow_cyan', pv_ghost: 'porcelain', pv_rune: 'bronze_aged' };
  const state = premiumState('warmup', {});
  const add = (mat) => { const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.frustumCulled = false; g.add(m); };
  for (const p of presets) {
    if (viewmodel) add(hardSurface(rep[p] || 'gold', { viewmodel: true, pv: p, state }));
    if (world && PRESETS[p]?.lite) add(hardSurface(rep[p] || 'gold', { pv: p, state, lite: true }));
  }
  for (const id of finishes) if (viewmodel) add(hardSurface('steel', { viewmodel: true, finish: { id, seed: 0 } }));
  g.visible = false;
  parent.add(g);
  return g;
}
