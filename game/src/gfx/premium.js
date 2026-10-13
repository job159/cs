// Premium (克金) shader layer for hard-surface materials — docs/PREMIUM_WEAPONS.md §1.5.
//
// Eight shader presets (§1.5.4), each a fixed set of PREMIUM_* defines compiled into the hard-surface
// program (materials.js patch()). Every pattern samples the rest weapon-root position `aRest` (§1.5.8), so
// it is continuous across parts at rest and sticks to a part when it moves.
//   pv_metal   RIM SWEEP LEAF     gold / chrome / bronze / gold leaf (pLeaf 0 = no leaf)
//   pv_glaze   RIM SWEEP SHARD IRID   porcelain, lacquer, 交趾陶 glaze, 剪黏 / cloisonné / crackle shards
//   pv_energy  RIM VEIN           every glow_* part: breathing rim + pulses flowing rear -> front
//   pv_crystal RIM GEM IRID       faceted gems, orbs, beast eyes
//   pv_core    CORE               parallax interior of a clear capsule (or a backlit skin, pCoreSkin 1)
//   pv_holo    HOLO               additive hologram panels / wing cards / shields
//   pv_ghost   RIM DISSOLVE GHOST translucent glaze spirits, dissolve in / out
//   pv_rune    RUNE               scrolling seal-script strips (u, v from aRest: gunkit has no UVs)
//
// Per weapon instance a PremiumState owns the state-driven uniforms (pCharge, pFlash, pRimStr, pSeed, breath
// phase, twin colour shift...) shared by all of that instance's premium materials; the weapon logic drives it
// with setMeter / setReady / setSkill / reloadStart / reloadEnd / fire / draw (§1.5.5, §1.7, §1.17).
// tickPremium(dt) (called once per frame by the viewmodel) advances every live state and kill counter.
import * as THREE from 'three';

const C = (h) => new THREE.Color(h);

/** Preset -> defines. `lite` = third-person / world / low-quality version (§1.5.6, §1.14); null = plain material. */
export const PRESETS = {
  pv_metal: { defs: ['RIM', 'SWEEP', 'LEAF'], lite: ['RIM', 'SWEEP'] },
  pv_glaze: { defs: ['RIM', 'SWEEP', 'SHARD', 'IRID'], lite: null },
  pv_energy: { defs: ['RIM', 'VEIN'], lite: ['RIM', 'VEIN'] },
  pv_crystal: { defs: ['RIM', 'GEM', 'IRID'], lite: null },
  pv_core: { defs: ['CORE'], lite: null },
  pv_holo: { defs: ['HOLO'], lite: null, blend: 'add' },
  pv_ghost: { defs: ['RIM', 'DISSOLVE', 'GHOST'], lite: null, blend: 'alpha' },
  pv_rune: { defs: ['RUNE'], lite: null },
};

/** Default preset derived from a material key (§1.5.4); standard materials get none. */
export function presetForKey(key) {
  if (key.startsWith('glow_')) return 'pv_energy';
  if (key === 'gold' || key === 'gold_leaf' || key === 'bronze_aged' || key === 'chrome' || key === 'black_chrome') return 'pv_metal';
  if (key === 'porcelain' || key.startsWith('lacquer_') || key.startsWith('glaze_')) return 'pv_glaze';
  if (key === 'crystal') return 'pv_crystal';
  return null;
}

// Element palettes (§1.6). sRGB hex; `twin` = the dual element (draw colour shift, EX versions).
export const ELEMENTS = {
  inferno: { base: '#1b1414', trim: '#c8902e', core: '#ffb43a', rim: '#ff5a1f', mote: '#ffd27a', accent: ['#3a2a26'], twin: 'frost' },
  frost: { base: '#e8f4ff', trim: '#b9c7d6', core: '#6fe3ff', rim: '#2f8bff', mote: '#ffffff', accent: ['#bfe9ff'], twin: 'inferno' },
  storm: { base: '#141a26', trim: '#9aa6b8', core: '#7fd8ff', rim: '#e8f6ff', mote: '#8a5cff', accent: ['#ffe27a'], twin: 'void' },
  radiant: { base: '#f3efe6', trim: '#e3b04b', core: '#fff2b0', rim: '#ffc74a', mote: '#fffbe0', accent: ['#6ec8ff'], twin: 'void' },
  void: { base: '#0c0b10', trim: '#8c6a2a', core: '#b54bff', rim: '#ff3fb4', mote: '#6a3cff', accent: ['#3fffe0'], twin: 'radiant' },
  soul: { base: '#15161c', trim: '#d1a542', core: '#3a6dff', rim: '#b54bff', mote: '#49ff9a', accent: ['#d1a542'], twin: 'radiant' },
  demonic: { base: '#120a0a', trim: '#c9a24a', core: '#ff2a3a', rim: '#ff4b2b', mote: '#ffb070', accent: ['#c9a24a'], twin: 'radiant' },
  cosmic: { base: '#0d1238', trim: '#cfd6e6', core: '#7aa8ff', rim: '#c66bff', mote: '#fff6d8', accent: ['#ffcf6a'], twin: 'inferno' },
  cyber: { base: '#e6e3dc', trim: '#e2571a', core: '#ffb02e', rim: '#3fd8ff', mote: '#ffcf7a', accent: ['#2a2d33', '#121316'], twin: 'frost' },
  jade: { base: '#f1efe7', trim: '#d9a948', core: '#1fa37a', rim: '#7dffb8', mote: '#c8ffe0', accent: ['#ff7a5c'], twin: 'demonic' },
  lunar: { base: '#b3122a', trim: '#f2c14e', core: '#ffd36b', rim: '#ff7a2f', mote: '#fff1b8', accent: ['#19a59a', '#2350b5', '#c88a2a'], twin: 'lunar_night' },
  lunar_night: { base: '#121012', trim: '#c9ccd1', core: '#9ef2ff', rim: '#3fd8ff', mote: '#e8f6ff', accent: ['#3a4a5a', '#6a7480', '#c9ccd1'], twin: 'lunar' },
};

/** Resolved palette of a premium config: { base, trim, core, rim, mote, accent[], twin (hex), shard[4] }. */
export function resolvePalette(cfg = {}) {
  const el = ELEMENTS[Array.isArray(cfg.element) ? cfg.element[0] : cfg.element] || ELEMENTS.radiant;
  const p = { ...el, ...(cfg.palette || {}) };
  const accent = Array.isArray(p.accent) ? p.accent : [p.accent || el.accent[0]];
  const twinEl = ELEMENTS[el.twin];
  const twin = (cfg.palette && cfg.palette.twin) || (twinEl ? twinEl.rim : p.rim);
  const shard = cfg.shard || [p.base, accent[0], accent[1] || p.trim, accent[2] || p.core];
  return { ...p, accent, twin, shard };
}

// ------------------------------------------------------------------ rune atlas (original seal-like glyphs)

let runeTex = null;
/** 1024 x 64 atlas of 16 procedurally drawn seal-script-like glyphs (original; R = ink). */
export function runeTexture() {
  if (runeTex) return runeTex;
  const W = 1024, H = 64, G = 64;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  let s = 90731;
  const r = () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 | 0) >>> 0) / 4294967296;
  g.strokeStyle = '#fff'; g.lineCap = 'square'; g.lineJoin = 'miter';
  for (let k = 0; k < 16; k++) {
    // seal glyphs: orthogonal strokes on a 6x6 lattice inside a 52 px square, often mirror-symmetric
    const ox = k * G + 8, oy = 7, cell = 50 / 5, sym = r() < 0.6;
    g.lineWidth = 4.2;
    const walk = (n) => {
      let x = Math.floor(r() * 6), y = Math.floor(r() * 6);
      const pts = [[x, y]];
      for (let i = 0; i < n; i++) {
        if (r() < 0.5) x = Math.max(0, Math.min(5, x + (r() < 0.5 ? -1 : 1) * (1 + Math.floor(r() * 3))));
        else y = Math.max(0, Math.min(5, y + (r() < 0.5 ? -1 : 1) * (1 + Math.floor(r() * 3))));
        pts.push([x, y]);
      }
      return pts;
    };
    const strokes = 3 + Math.floor(r() * 3);
    for (let i = 0; i < strokes; i++) {
      const pts = walk(2 + Math.floor(r() * 4));
      for (const mirror of sym ? [false, true] : [false]) {
        g.beginPath();
        pts.forEach(([x, y], j) => { const px = ox + (mirror ? 5 - x : x) * cell, py = oy + y * cell; j ? g.lineTo(px, py) : g.moveTo(px, py); });
        g.stroke();
      }
    }
    if (r() < 0.45) { g.lineWidth = 3; g.strokeRect(ox - 3, oy - 3, 56, 56); }   // seal frame on some glyphs
  }
  runeTex = new THREE.CanvasTexture(cv);
  runeTex.wrapS = THREE.RepeatWrapping; runeTex.wrapT = THREE.ClampToEdgeWrapping;
  runeTex.minFilter = THREE.LinearMipmapLinearFilter; runeTex.magFilter = THREE.LinearFilter;
  runeTex.colorSpace = THREE.NoColorSpace;
  runeTex.anisotropy = 4;
  return runeTex;
}

// ------------------------------------------------------------------ per-preset material parameters

/** Material-level defaults (spec defaults in parentheses of §1.5.3), overridable per weapon / per part. */
const PARAM_DEFAULTS = {
  rimPower: 3.5, veinFreq: 12, veinSpeed: 0.5, veinAxis: 0, shine: 2, sweepT: 4, leaf: 0, leafScale: 180,
  shardScale: 0, groutW: 0.8, groutMetal: 0, irid: 0, iridScale: 45, iridCool: 0, gem: 1, coreSkin: 0, runeSpeed: 0.15,
  runeAxis: 0, runeOrigin: [0, 0, 0], runeWidth: 0.006, flashMask: 1, coreMode: -1, coreScale: 1,
};
const KEY_DEFAULTS = {
  gold_leaf: { leaf: 1 }, crystal: { irid: 0.22 }, bronze_aged: { shine: 1.4 }, black_chrome: { shine: 2.6 },
  porcelain: { shine: 1.6 }, glaze_black: { irid: 0.12 },
};

/**
 * Parameters for one material: defaults < key defaults < weapon cfg.pv[preset] < weapon cfg.pvKey[material key]
 * < part extras.pv. pvKey gives each glaze its own values (M07 開片: shardPal = the glaze's own colour x4, so the
 * crackle shows only its lines on cobalt and white scales alike).
 */
export function premiumParams(preset, key, cfg = {}, part = {}) {
  return { ...PARAM_DEFAULTS, ...(KEY_DEFAULTS[key] || {}), ...((cfg.pv || {})[preset] || {}), ...((cfg.pvKey || {})[key] || {}), ...part };
}

/** Uniform objects for a material (material-level params + the instance's shared state uniforms). */
export function premiumUniforms(state, prm) {
  const u = state.u;
  const f = (v) => ({ value: v });
  return {
    pCharge: u.pCharge, pFlash: u.pFlash, pRimStr: u.pRimStr, pBreath: u.pBreath, pTwin: u.pTwin, pGlowMul: u.pGlowMul,
    pSeed: u.pSeed, pRimColor: u.pRimColor, pTwinColor: u.pTwinColor, pDissolve: u.pDissolve, pOpacity: u.pOpacity,
    // coreTint per part: one weapon can hold a gold-orange focus gem and a furnace capsule of another colour (M03)
    pCoreTint: prm.coreTint ? f(C(prm.coreTint)) : u.pCoreTint, pHoloColor: u.pHoloColor, pEdgeColor: u.pEdgeColor, pRuneColor: u.pRuneColor,
    pPal: prm.shardPal ? f(prm.shardPal.map((h) => C(h))) : u.pPal, pIridCool: f(prm.iridCool),
    pGrout: prm.grout ? f(C(prm.grout)) : u.pGrout, pCoreMode: prm.coreMode >= 0 ? f(prm.coreMode) : u.pCoreMode,
    pBox: f(new THREE.Vector4(-0.5, 0.2, -0.15, 0.1)),
    pRimPower: f(prm.rimPower), pVeinFreq: f(prm.veinFreq), pVeinSpeed: f(prm.veinSpeed), pVeinAxis: f(prm.veinAxis),
    pShine: f(prm.shine), pSweepT: f(prm.sweepT), pLeaf: f(prm.leaf), pLeafScale: f(prm.leafScale),
    pShardScale: f(prm.shardScale), pGroutW: f(prm.groutW), pGroutMetal: f(prm.groutMetal), pIrid: f(prm.irid),
    pIridScale: f(prm.iridScale), pGem: f(prm.gem), pCoreSkin: f(prm.coreSkin), pCoreScale: f(prm.coreScale), pRuneSpeed: f(prm.runeSpeed),
    pRuneAxis: f(prm.runeAxis), pRuneOrigin: f(new THREE.Vector3(...prm.runeOrigin)), pRuneWidth: f(prm.runeWidth),
    pFlashMask: f(prm.flashMask), pDpr: f(Math.min(3, globalThis.devicePixelRatio || 1)), tRunes: f(runeTexture()),
  };
}

// ------------------------------------------------------------------ instance state (§1.5.5, §1.7, §1.17)

const live = new Set();
const states = new Map();
let nextId = 1;
const _c = new THREE.Color();

export class PremiumState {
  /** cfg = weapon def.premium ({ element, palette, pv, seed, ready: { layer: { glowMul } } ... }); world = third person (emissive x0.5). */
  constructor(cfg = {}, { key = null, world = false } = {}) {
    this.id = nextId++;
    this.key = key || 'pv' + this.id;
    this.cfg = cfg;
    this.world = world;
    const pal = this.palette = resolvePalette(cfg);
    const f = (v) => ({ value: v });
    this.u = {
      pCharge: f(0.35), pFlash: f(0), pRimStr: f(0.8), pBreath: f(0), pTwin: f(0), pGlowMul: f(world ? 0.5 : 1),
      pSeed: f(((cfg.seed ?? 0) % 1000) / 1000), pDissolve: f(0), pOpacity: f(cfg.opacity ?? 0.85), pCoreMode: f(cfg.coreMode ?? 0),
      pRimColor: f(C(pal.rim)), pTwinColor: f(C(pal.twin)), pCoreTint: f(C(pal.core)), pHoloColor: f(C(cfg.holo || pal.rim)),
      pEdgeColor: f(C(pal.core)), pRuneColor: f(C(cfg.rune || pal.core)), pGrout: f(C(cfg.grout || '#8a857a')),
      pPal: f(pal.shard.map((h) => C(h))),
    };
    this.rimColor = C(pal.rim);
    this.meter = 0; this.ready = false; this.skill = false; this.inspect = false;
    this.reloading = 0;      // 0 idle, 1 reloading (dim), 2 recovering
    this.recoverT = 0;
    this.flashV = 0; this.flashRate = 12;
    this.remindT = 0;
    this.twinT = 1;          // draw colour shift progress (1 = done)
    this.onReady = null;     // hook (kind: 'ready' | 'remind') for HUD border / sound / haptics in sync
    // external drive (the viewmodel's clip `glow` tweens / arsenal stateGlow): non-null values win over the
    // state's own easing for that frame; pFlash adds as max. vmDriven: the viewmodel applies the ready glow layer
    this.override = { pCharge: null, pRimStr: null, pFlash: 0 };
    this.vmDriven = false;
    live.add(this);
  }

  /** Meter 0..1 (idle charge 0.35 + 0.4 x meter, breath 0.4 / 0.6 Hz by tier). */
  setMeter(x) { this.meter = Math.max(0, Math.min(1, x)); }
  setReady(on) {
    if (on && !this.ready) { this.remindT = 2.5; this.onReady?.('ready'); }
    this.ready = !!on;
  }
  setSkill(on) { this.skill = !!on; }
  /** Reload dims the weapon within 0.15 s (§1.5.5: it "breathes"); reloadEnd brings it back over 0.3 s. */
  reloadStart() { this.reloading = 1; }
  reloadEnd() { if (this.reloading) { this.reloading = 2; this.recoverT = 0.3; } }
  /** Whole-weapon flash (fire: 1 over 80 ms; ready reminder 0.3). Parts with flashMask 0 ignore it. */
  fire(strength = 1, dur = 0.08) { if (strength >= this.flashV) { this.flashV = strength; this.flashRate = strength / dur; } }
  /** Draw colour shift: rim / glow start at the twin colour and return to their own over 0.25 s, then flash 0.4. */
  draw() { this.twinT = 0; }
  /** World-changing inspect: rim x1.5. */
  setInspect(on) { this.inspect = !!on; }
  setDissolve(x) { this.u.pDissolve.value = x; }
  setCoreMode(m) { this.u.pCoreMode.value = m; }

  update(dt) {
    const u = this.u;
    // charge / rim targets
    // cfg.idle.charge [base, slope]: anti-calamity series keep their glow low until ready (§1.4 ③: ≤ 5 %)
    const ic = this.cfg.idle?.charge;
    let charge = this.skill || this.ready ? 1 : (ic?.[0] ?? 0.35) + (ic?.[1] ?? 0.4) * this.meter;
    let rim = this.skill ? 2.5 : this.ready ? 2.0 : 0.8;
    let k = 6;
    if (this.reloading === 1) { charge = 0.2; rim = 0.6; k = 30; }
    else if (this.reloading === 2) { k = 12; if ((this.recoverT -= dt) <= 0) this.reloading = 0; }
    if (this.inspect) rim *= 1.5;
    const a = 1 - Math.exp(-k * dt);
    u.pCharge.value += (charge - u.pCharge.value) * a;
    u.pRimStr.value += (rim - u.pRimStr.value) * (1 - Math.exp(-10 * dt));
    // breathing: 0.4 / 0.6 / 1.2 Hz (empty / charging / full) — phase accumulator so tier changes never jump
    const hz = this.skill || this.ready ? 1.2 : this.meter < 0.34 ? 0.4 : 0.6;
    u.pBreath.value = (u.pBreath.value + dt * hz) % 1;
    // ready reminder every 2.5 s
    if (this.ready) {
      if ((this.remindT -= dt) <= 0) { this.remindT += 2.5; this.fire(0.3, 0.3); this.onReady?.('remind'); }
    }
    const glow = this.ready && !this.vmDriven ? (this.cfg.ready?.layer?.glowMul ?? 1.5) : 1;
    u.pGlowMul.value = (this.world ? 0.5 : 1) * glow;
    const o = this.override;
    if (o.pCharge !== null) u.pCharge.value = o.pCharge;
    if (o.pRimStr !== null) u.pRimStr.value = o.pRimStr * (this.inspect ? 1.5 : 1);
    // draw colour shift
    if (this.twinT < 1) {
      this.twinT = Math.min(1, this.twinT + dt / 0.25);
      u.pTwin.value = 1 - this.twinT;
      if (this.twinT >= 1) this.fire(0.4, 0.15);
    } else u.pTwin.value = 0;
    this.flashV = Math.max(0, this.flashV - this.flashRate * dt);
    u.pFlash.value = Math.max(this.flashV, o.pFlash || 0);
  }

  dispose() { live.delete(this); if (states.get(this.key) === this) states.delete(this.key); }
}

/** Get-or-create the state for a key ('vm:<id>', 'p3:<player>:<id>', ...), so materials stay cached per key. */
export function premiumState(key, cfg = {}, opts = {}) {
  let s = states.get(key);
  if (!s || s.cfg !== cfg) { s?.dispose(); s = new PremiumState(cfg, { ...opts, key }); states.set(key, s); }
  return s;
}

/** Presets a set of weapon defs can use (loading-screen warm-up): explicit maps + the key-derived four. */
export function presetsInUse(defs) {
  const out = new Set();
  for (const d of defs) {
    if (!d?.premium) continue;
    for (const p of Object.values(d.premium.presets || {})) out.add(p);
    for (const p of d.premium.warm || []) out.add(p);
    for (const p of ['pv_metal', 'pv_glaze', 'pv_energy', 'pv_crystal']) out.add(p);
  }
  return [...out].filter((p) => PRESETS[p]);
}

/** Anything with update(dt) that should tick with the premium states (kill counters...). */
export function addTicker(t) { live.add(t); }
export function removeTicker(t) { live.delete(t); }
/** Advance every live premium state / counter. Called once per frame (viewmodel update). */
export function tickPremium(dt) { for (const s of live) s.update(dt); }

// ------------------------------------------------------------------ GLSL

/** Shared fragment helpers: hashes, 2D / biplanar Voronoi, HSV (premium, finishes, pearl materials). */
export const GFX_NOISE = /* glsl */`
#if defined(PREMIUM) || defined(FINISH) || defined(HS_PEARL)
float pH21(vec2 p) { p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
vec2 pH22(vec2 p) { vec3 a = fract(p.xyx * vec3(213.897, 653.453, 253.098)); a += dot(a, a.yzx + 79.76); return fract(vec2(a.x * a.y, a.z * a.x)); }
vec3 pH33(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
// 2D Voronoi: x = F1, y = (F2 - F1) / 2 (distance-to-border proxy), z = cell hash
vec3 pVor(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0; vec2 id = i;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 r = g + 0.08 + pH22(i + g) * 0.84 - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = i + g; } else if (d < d2) d2 = d;
  }
  d1 = sqrt(d1);
  return vec3(d1, (sqrt(d2) - d1) * 0.5, pH21(id + 0.37));
}
// biplanar Voronoi (iq): the two dominant projection planes, narrow pow 8 blend; the cell id comes from the
// dominant plane (shards break on hard edges like real 剪黏 does)
vec3 pBiVor(vec3 p, vec3 n) {
  n = abs(n);
  ivec3 ma = (n.x > n.y && n.x > n.z) ? ivec3(0, 1, 2) : (n.y > n.z) ? ivec3(1, 2, 0) : ivec3(2, 0, 1);
  ivec3 mi = (n.x < n.y && n.x < n.z) ? ivec3(0, 1, 2) : (n.y < n.z) ? ivec3(1, 2, 0) : ivec3(2, 0, 1);
  ivec3 me = ivec3(3) - mi - ma;
  vec3 a = pVor(vec2(p[ma.y], p[ma.z]) + float(ma.x) * 17.31);
  vec3 b = pVor(vec2(p[me.y], p[me.z]) + float(me.x) * 17.31);
  vec2 w = clamp((vec2(n[ma.x], n[me.x]) - 0.5773) / (1.0 - 0.5773), 0.0, 1.0);
  w = pow(w + 1e-4, vec2(8.0));
  float s = w.x + w.y;
  return vec3((a.x * w.x + b.x * w.y) / s, (a.y * w.x + b.y * w.y) / s, w.x >= w.y ? a.z : b.z);
}
vec3 fRgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
vec3 fHsv2rgb(vec3 c) { vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0); return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y); }
#endif
`;

/** Fragment declarations (after `#include <common>`, after GFX_NOISE). */
export const PREMIUM_PARS = /* glsl */`
#ifdef PREMIUM
uniform float pCharge, pFlash, pRimStr, pBreath, pTwin, pGlowMul, pSeed, pFlashMask;
uniform vec3 pRimColor, pTwinColor;
uniform vec4 pBox;                 // rest-space bounds: zmin, zmax, ymin, ymax
#endif
#ifdef PREMIUM_RIM
uniform float pRimPower;
#endif
#ifdef PREMIUM_VEIN
uniform float pVeinFreq, pVeinSpeed, pVeinAxis;
#endif
#ifdef PREMIUM_SWEEP
uniform float pShine, pSweepT;
#endif
#ifdef PREMIUM_LEAF
uniform float pLeaf, pLeafScale;
#endif
#ifdef PREMIUM_SHARD
uniform float pShardScale, pGroutW, pGroutMetal;
uniform vec3 pPal[4];
uniform vec3 pGrout;
#endif
#ifdef PREMIUM_IRID
uniform float pIrid, pIridScale, pIridCool;
#endif
#ifdef PREMIUM_GEM
uniform float pGem;
#endif
#if defined(PREMIUM_CORE) || defined(PREMIUM_RUNE)
uniform sampler2D tRunes;
#endif
#if defined(PREMIUM_CORE) || defined(PREMIUM_GEM)
uniform vec3 pCoreTint;
#endif
#ifdef PREMIUM_CORE
uniform float pCoreMode, pCoreSkin, pCoreScale;   // pCoreScale: pattern density (small capsules want finer water / lava)
vec3 pCoreLayer(vec2 uv, float i) {
  float t = time;
  vec3 c = vec3(0.0);
  if (pCoreMode < 0.5) {            // galaxy: two-tone nebula + twinkling stars
    float neb = texture2D(tGrunge, uv * 2.5 + vec2(t * 0.006 * (i + 1.0), 0.0)).r;
    float neb2 = texture2D(tGrunge, uv * 1.3 - vec2(t * 0.004, i * 0.31)).b;
    vec2 sg = uv * (160.0 - 30.0 * i) + i * 7.3;
    vec2 sc = floor(sg); vec2 so = pH22(sc) * 0.7 + 0.15;
    float st = step(0.8, pH21(sc + 3.1)) * smoothstep(0.12, 0.0, length(fract(sg) - so)) * (0.6 + 0.4 * sin(t * 3.0 + so.x * 40.0));
    c = mix(pCoreTint, pCoreTint.bgr, smoothstep(0.4, 0.7, neb2)) * pow(neb, 2.5) * 2.6 + vec3(1.0, 0.95, 0.85) * st * 3.0;
  } else if (pCoreMode < 1.5) {     // cloud
    float cl = texture2D(tGrunge, uv * 3.0 + vec2(t * 0.025 * (i + 1.0), t * 0.01)).r;
    c = pCoreTint * smoothstep(0.35, 0.75, cl) * 1.4;
  } else if (pCoreMode < 2.5) {     // water: drifting caustic lines flowing towards the muzzle
    vec2 q = uv * 5.0 + vec2(t * 0.08 * (i + 1.0), 0.0);
    float a = texture2D(tGrunge, q).b, b = texture2D(tGrunge, q * 1.37 + vec2(0.0, t * 0.05)).b;
    c = pCoreTint * pow(max(0.0, 1.0 - abs(a - b) * 4.0), 6.0) * 1.8 + pCoreTint * 0.15;
  } else if (pCoreMode < 3.5) {     // lava: dark crust, glowing cracks
    vec3 v = pVor(uv * 60.0 + vec2(t * 0.05, 0.0) + i * 3.7);
    c = pCoreTint * ((1.0 - smoothstep(0.0, 0.09, v.y)) * 2.5 + 0.08 * v.z);
  } else {                          // lightning: thin ridges that flicker
    float n = texture2D(tGrunge, uv * 4.0 + floor(t * 12.0) * 0.137).r;
    float bolt = 1.0 - smoothstep(0.0, 0.015, abs(n - 0.5));
    c = pCoreTint * bolt * step(0.55, fract(sin(floor(t * 9.0) * 91.7 + i) * 43758.5)) * 4.0 + pCoreTint * 0.06;
  }
  return c;
}
#endif
#ifdef PREMIUM_HOLO
uniform vec3 pHoloColor;
uniform float pOpacity, pDpr;
#endif
#ifdef PREMIUM_DISSOLVE
uniform float pDissolve;
uniform vec3 pEdgeColor;
#endif
#if defined(PREMIUM_GHOST) && !defined(PREMIUM_HOLO)
uniform float pOpacity;
#endif
#ifdef PREMIUM_RUNE
uniform float pRuneSpeed, pRuneAxis, pRuneWidth;
uniform vec3 pRuneOrigin, pRuneColor;
#endif
`;

/** Albedo stage (end of map_fragment, after the finish block). Leaves pRoughMix / pMetalMix for later. */
export const PREMIUM_ALBEDO = /* glsl */`
#ifdef PREMIUM
  float pRoughMix = 0.0, pRoughTo = 0.0, pMetalMix = 0.0, pMetalTo = 0.0, pCell = 0.0, pLeafId = 0.0, pDisE = 1.0, pShardMono = 0.0;
  #ifdef PREMIUM_DISSOLVE
  {
    // grunge fbm, biased bottom -> top so spirits build up from the ground (§1.7.3 ③)
    float hb = clamp((vRest.y - pBox.z) / max(0.01, pBox.w - pBox.z), 0.0, 1.0);
    vec4 dn = triTex(tGrunge, vRest * 4.0, tw);
    float n = clamp((dn.r * 0.6 + dn.b * 0.4 - 0.3) / 0.4, 0.0, 1.0);
    n = mix(n, 1.0 - hb, 0.55);
    pDisE = n - (pDissolve * 1.12 - 0.06);
    if (pDisE < 0.0) discard;
  }
  #endif
  #ifdef PREMIUM_SHARD
  if (pShardScale > 0.0) {
    // 剪黏 / cloisonné / crackle: biplanar Voronoi shards, one palette colour each, grout lines (absolute scale).
    // A one-colour palette = crackle glaze (開片, M07): warped (irregular) cells that do not vary, hairline cracks
    // of uneven width and darkness UNDER a continuous glossy glaze (no matte grout, no per-shard facets)
    float mono = step(length(pPal[0] - pPal[1]) + length(pPal[0] - pPal[2]) + length(pPal[0] - pPal[3]), 1e-3);
    vec3 sp = vRest * pShardScale + pSeed * 7.13;
    sp += mono * 0.42 * sin(sp.yzx * 0.53 + sp.zxy * 0.31);
    vec3 sv = pBiVor(sp, vObjNor);
    pCell = sv.z;
    float k = floor(sv.z * 4.0);
    vec3 sc = k < 0.5 ? pPal[0] : k < 1.5 ? pPal[1] : k < 2.5 ? pPal[2] : pPal[3];
    sc *= 1.0 + (0.24 - 0.21 * mono) * (fract(sv.z * 13.7) - 0.5);
    float gw = pGroutW * 0.001 * pShardScale * mix(1.0, 0.45 + 1.1 * fract(sv.z * 7.31), mono);
    float aa = fwidth(sv.y) * 1.5 + 1e-4;
    float far = smoothstep(0.35, 0.8, length(fwidth(sp)));   // cells < ~2 px: fade to flat
    float grout = (1.0 - smoothstep(gw - aa, gw + aa, sv.y)) * (1.0 - far);
    grout *= mix(1.0, 0.35 + 0.5 * fract(sv.z * 3.17), mono);
    diffuseColor.rgb = mix(sc, pGrout, grout);
    // glazed shards are glossy dielectrics whatever the part's base material; grout is matte (or gold wire);
    // crackle lines lie under the glaze, so the surface stays glossy
    pRoughMix = 1.0; pRoughTo = mix(0.17, pGroutMetal > 0.5 ? 0.28 : 0.85, grout * (1.0 - mono));
    pMetalMix = 1.0; pMetalTo = grout * pGroutMetal;
    pShardMono = mono;
  }
  #endif
  #ifdef PREMIUM_LEAF
  if (pLeaf > 0.0) {
    // broken gold leaf: flakes with their own brightness / roughness, darker bronze in the cracks
    vec3 lv = pBiVor(vRest * pLeafScale + pSeed * 3.1, vObjNor);
    pLeafId = lv.z;
    float crack = (1.0 - smoothstep(0.0, 0.035 + fwidth(lv.y), lv.y)) * (1.0 - smoothstep(0.3, 0.8, length(fwidth(vRest * pLeafScale))));
    diffuseColor.rgb *= mix(1.0, 0.84 + 0.32 * fract(lv.z * 31.7), pLeaf);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.5, 0.36, 0.22), crack * pLeaf * 0.85);
    pRoughMix = pLeaf; pRoughTo = 0.1 + 0.2 * fract(lv.z * 7.31) + crack * 0.3;
  }
  #endif
  #ifdef PREMIUM_CORE
  if (pCoreSkin < 0.5) diffuseColor.rgb *= 0.12;        // dark capsule interior; the light comes from emission
  #endif
#endif
`;

/** After normal_fragment_maps: facet / flake normals, view-dependent colour, roughness overrides. */
export const PREMIUM_NORMAL = /* glsl */`
#ifdef PREMIUM
  #ifdef PREMIUM_GEM
  { vec3 fn = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition))); normal = normalize(mix(normal, fn, 0.9));
    diffuseColor.rgb = mix(diffuseColor.rgb, pCoreTint * 0.3, 0.7); }
  #endif
  #ifdef PREMIUM_LEAF
  if (pLeaf > 0.0) { vec3 tl = (pH33(vec3(pLeafId * 97.0, pSeed * 13.0, 3.1)) - 0.5) * 0.32 * pLeaf; normal = normalize(normal + mat3(viewMatrix) * (mat3(modelMatrix) * tl)); }
  #endif
  #ifdef PREMIUM_SHARD
  if (pShardScale > 0.0 && pShardMono < 0.5) { vec3 tl = (pH33(vec3(pCell * 113.0, 7.7, pSeed * 5.0)) - 0.5) * 0.1; normal = normalize(normal + mat3(viewMatrix) * (mat3(modelMatrix) * tl)); }
  #endif
  float pNdv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  #ifdef PREMIUM_IRID
  if (pIrid > 0.0) {
    // thin-film look (cosine palette): hue follows the view angle and a per-cell offset
    float cell = pCell;
    if (cell == 0.0) { vec2 q = vec2(-vRest.z, vRest.y) * pIridScale; cell = pH21(floor(vec2(q.x + q.y, q.x - q.y))); pCell = cell; }
    vec3 ir = 0.5 + 0.5 * cos(6.2831853 * (vec3(0.0, 0.33, 0.67) + (1.0 - pNdv) * 1.1 + cell * 0.35 + pSeed * 0.21));
    ir.r *= 1.0 - 0.8 * pIridCool;   // iridCool 1: cyan-green-blue sheen only, never pink (frost, §1.6 v1.2)
    float l = max(0.3, dot(diffuseColor.rgb, vec3(0.333)));
    diffuseColor.rgb = mix(diffuseColor.rgb, ir * l * 1.5, pIrid);
  }
  #endif
  if (pRoughMix > 0.0) roughnessFactor = clamp(mix(roughnessFactor, pRoughTo, pRoughMix), 0.04, 1.0);
  if (pMetalMix > 0.0) metalnessFactor = mix(metalnessFactor, pMetalTo, pMetalMix);
#endif
`;

/** After emissivemap_fragment: everything that glows. */
export const PREMIUM_EMIT = /* glsl */`
#ifdef PREMIUM
  {
    vec3 rimC = mix(pRimColor, pTwinColor, pTwin);
    float br = 0.75 + 0.25 * sin(6.2831853 * pBreath);
    float fres = pow(1.0 - pNdv, 3.0);
    #ifdef PREMIUM_VEIN
    {
      // light pulses flowing rear -> front along -Z (or around the part's local Z axis: bells, rings)
      float ax = pVeinAxis > 0.5 ? atan(vObjPos.y, vObjPos.x) * length(vObjPos.xy) : -vRest.z;
      float ph = fract(ax * pVeinFreq - time * pVeinSpeed * (0.6 + 0.8 * pCharge) * pVeinFreq + pSeed);
      float pulse = smoothstep(0.0, 0.12, ph) * (1.0 - smoothstep(0.12, 0.55, ph));
      totalEmissiveRadiance *= (0.12 + 0.88 * pCharge * pCharge + pulse * (0.15 + 0.6 * pCharge)) * (0.85 + 0.15 * br);
    }
    #endif
    // twin colour shift (draw) and the ready glow layer act on the part's own emission
    totalEmissiveRadiance = mix(totalEmissiveRadiance, dot(totalEmissiveRadiance, vec3(0.3333)) * pTwinColor * 1.5, pTwin) * pGlowMul;
    #ifdef PREMIUM_RIM
    fres = pow(1.0 - pNdv, pRimPower);
    // x0.5: much of a viewmodel is seen at grazing angles, a full-strength rim washes the materials out
    totalEmissiveRadiance += rimC * fres * pRimStr * br * pGlowMul * 0.5;
    #endif
    totalEmissiveRadiance += rimC * pFlash * pFlashMask * (0.25 + 1.6 * fres);
    #ifdef PREMIUM_SWEEP
    {
      // a diagonal sheen crossing the weapon every pSweepT s (rests 20 % of the cycle)
      float sw = fract(time / pSweepT + pSeed * 0.37);
      float s0 = -pBox.y - 0.25, s1 = -pBox.x + 0.25;
      float d = (-vRest.z * 0.86 + vRest.y * 0.5) - mix(s0, s1, sw / 0.8);
      float shine = exp(-d * d * 5000.0) * step(sw, 0.8);   // ~1 cm band; bloom adds the halo
      totalEmissiveRadiance += vec3(1.0, 0.93, 0.75) * shine * pShine * (0.3 + 0.5 * sqrt(1.0 - pNdv)) * (0.7 + 0.3 * pCharge);
    }
    #endif
    #ifdef PREMIUM_IRID
    if (pIrid > 0.0) {   // occasional per-cell glint
      float gl = step(0.985, fract(pCell * 37.0 + floor(time * 3.0) * 0.137));
      totalEmissiveRadiance += vec3(1.0) * gl * 3.0 * pIrid;
    }
    #endif
    #ifdef PREMIUM_GEM
    {
      // light from inside the stone + a facet star every ~3 s
      float tw = fract(time / 3.0 + pSeed);
      float star = smoothstep(0.0, 0.03, tw) * (1.0 - smoothstep(0.03, 0.12, tw));
      vec3 fn = floor(normal * 3.0);
      float facet = step(0.55, pH21(fn.xy + fn.z * 7.0));
      totalEmissiveRadiance += mix(pCoreTint, pTwinColor, pTwin) * pGem * pow(pNdv, 3.0) * 1.4 * (0.5 + 0.8 * pCharge) * pGlowMul;
      totalEmissiveRadiance += vec3(1.0, 0.97, 0.9) * star * facet * 5.0 * pGem;
    }
    #endif
    #ifdef PREMIUM_CORE
    {
      // 2-3 parallax layers in the part's rest (-Z, Y) plane, looked at through the capsule wall
      vec3 vd = -normalize(vViewPosition);
      vec3 od = inverseTransformDirection(inverseTransformDirection(vd, viewMatrix), modelMatrix);
      vec2 base = vec2(-vObjPos.z, vObjPos.y) * pCoreScale;
      vec2 off = vec2(-od.z, od.y) / max(0.3, abs(od.x));
      vec3 cc = vec3(0.0);
      for (int i = 0; i < 3; i++) {
        float fi = float(i);
        cc += pCoreLayer(base + off * (0.004 + 0.006 * fi) * pCoreScale, fi) * (1.0 - 0.3 * fi);
      }
      if (pCoreSkin > 0.5) {
        // backlit skin (drum hide, paper lantern): pattern shows through, rune marks stay as silhouettes
        float m = texture2D(tRunes, vec2(-vObjPos.z * 6.0, vObjPos.y * 6.0 + 0.5)).r;
        totalEmissiveRadiance += cc * pCharge * 0.8 * (1.0 - 0.85 * m) * pGlowMul;
      } else totalEmissiveRadiance += cc * (0.4 + 0.6 * pCharge) * pGlowMul;
    }
    #endif
    #ifdef PREMIUM_RUNE
    {
      vec3 rp = vRest - pRuneOrigin;
      float au, av;
      if (pRuneAxis < 1.5 && pRuneAxis > 0.5) {
        // stele: glyph columns stacked down +Y, one glyph per pRuneWidth
        float along = -rp.y / pRuneWidth - time * pRuneSpeed * 16.0;
        au = (floor(along) + clamp(-rp.z / pRuneWidth + 0.5, 0.0, 1.0)) / 16.0;
        av = 1.0 - fract(along);
        if (abs(rp.z) > pRuneWidth * 0.5) av = -1.0;
      } else {
        float along = pRuneAxis < 0.5 ? -rp.z : atan(rp.y, rp.x) * length(rp.xy);
        float lat = pRuneAxis < 0.5 ? rp.y : -rp.z;
        au = along / pRuneWidth / 16.0 - time * pRuneSpeed;
        av = lat / pRuneWidth + 0.5;
      }
      float g = (av > 0.0 && av < 1.0) ? texture2D(tRunes, vec2(au, av)).r : 0.0;
      float flick = 0.8 + 0.2 * step(0.35, fract(sin(floor(au * 16.0) * 91.7 + floor(time * 6.0)) * 43758.5));
      totalEmissiveRadiance += pRuneColor * g * flick * (0.35 + 0.65 * pCharge) * 4.0 * pGlowMul;
    }
    #endif
    #ifdef PREMIUM_DISSOLVE
    totalEmissiveRadiance += pEdgeColor * (1.0 - smoothstep(0.0, 0.06, pDisE)) * 8.0 * step(0.001, pDissolve);
    #endif
  }
  #ifdef PREMIUM_HOLO
  float holoH = pow(1.0 - pNdv, 2.0);
  float holoScan = 0.6 + 0.4 * sin(gl_FragCoord.y / pDpr * 1.4 - time * 14.0);
  float holoSw = 1.0 - smoothstep(0.0, 0.03, abs(fract(vRest.y * 1.2 - time * 0.4) - 0.5));
  float holoFl = 0.88 + 0.12 * step(0.5, fract(sin(floor(time * 20.0)) * 43758.5453));
  float holoA = (0.12 + 0.88 * holoH) * holoScan * holoFl * pOpacity;
  vec3 holoC = mix(pHoloColor, pTwinColor, pTwin) * (1.0 + holoSw * 2.0 + pFlash * 2.0) * pGlowMul;
  #endif
#endif
`;

/** After opaque_fragment: transparent presets. */
export const PREMIUM_OUT = /* glsl */`
#ifdef PREMIUM_HOLO
  gl_FragColor = vec4(holoC, clamp(holoA + holoSw * 0.4, 0.0, 1.0));
#endif
#ifdef PREMIUM_GHOST
  gl_FragColor.a = pOpacity * (0.35 + 0.65 * pow(1.0 - pNdv, 1.5));
#endif
`;
