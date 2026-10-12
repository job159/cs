// Effects facade used by weapons, zombies and the world. Recreates Counter-Strike 2's combat effects from
// frame-by-frame observation (docs/research/06a-cs2-fx.md) with our own procedural textures, plus a
// CSO-style layer for zombie hits and a toolkit for premium weapons (docs/FX.md):
//   muzzle (per weapon class / model, first + third person, viewmodel light), barrel heat smoke, tracers
//   (CS2 look), impacts + bullet-hole decals per surface, directional blood + splatter, gibs, HE explosion,
//   smoke grenade (carvable), molotov, flashbang white-out, casings; beams, lightning, trails, shockwaves.
import * as THREE from 'three';
import { Particles } from './particles.js';
import { FRAME, RAMP, DECAL } from './atlas.js';
import { Decals, DECAL_TINT } from './decals.js';
import { Shells } from './shells.js';
import { LightPool } from './lights.js';
import { Ribbons } from './ribbons.js';
import { SmokeVolumes } from './smokevol.js';
import { Infernos } from './inferno.js';
import { ScreenFX } from './screenfx.js';
import { SURF } from '../world/collision.js';

export { FRAME, RAMP, DECAL, DECAL_TINT };

const R = Math.random;
const rr = (a, b) => a + (b - a) * R();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _t = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();
const _n = new THREE.Vector3();
const _r = new THREE.Vector3();
const _u = new THREE.Vector3();
const _c = new THREE.Vector3();
const _m3 = new THREE.Matrix3();
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

// ------------------------------------------------------------------ muzzle flash styles (06a §2.3)
// k: cloud size (AK = 1, ~14 cm), sets: cloud shapes, aspect: forward stretch, light: light scale,
// sparks: [min, max] unburnt powder, smoke: puff amount, tongue: chance of a long flame tongue,
// side: muzzle-brake side jets, prongs: birdcage prongs (side view), tint: colour multiplier, heat: barrel heat per shot
const STYLE = {
  pistol: { k: 0.55, sets: [1, 2], aspect: 1.2, anchor: 0.45, light: 0.45, vmLight: 0.22, sparks: [1, 2], smoke: 0.6, tongue: 0.1, heat: 0.12, life: 0.9 },
  magnum: { k: 1.0, sets: [0, 1], aspect: 1.25, anchor: 0.4, light: 0.9, vmLight: 0.16, halo: 1.3, sparks: [3, 5], smoke: 1.3, tongue: 0.2, side: 0.2, heat: 0.3, tint: [1, 1.0, 0.82], life: 1.2 },
  smg: { k: 0.8, sets: [1, 2], aspect: 1.3, light: 0.55, sparks: [1, 3], smoke: 0.5, tongue: 0.25, heat: 0.07, tint: [1, 1.03, 0.92] },
  rifle: { k: 1.0, sets: [0, 3], aspect: 1.4, light: 1.0, sparks: [2, 4], smoke: 1, tongue: 0.3, heat: 0.1 },
  mg: { k: 1.0, sets: [0, 2], aspect: 1.4, light: 1.0, sparks: [2, 4], smoke: 1, tongue: 0.3, heat: 0.06 },
  shotgun: { k: 1.25, sets: [0, 2], aspect: 1.25, heatK: 0.8, halo: 1.25, light: 1.4, sparks: [8, 15], smoke: 2.2, tongue: 0.2, heat: 0.35, tint: [1, 0.86, 0.68], life: 1.3, drop: 0.35 },
  sniper: { k: 1.4, sets: [0, 1], aspect: 1.3, halo: 1.5, light: 1.6, sparks: [4, 6], smoke: 2.6, tongue: 0.3, side: 0.5, heat: 0.6, life: 1.3 },
  rocket: { k: 2.2, sets: [0, 3], aspect: 1.5, light: 2.0, sparks: [8, 12], smoke: 6, tongue: 0.5, heat: 0.8, tint: [1, 0.95, 0.85], life: 1.4 },
  suppressed: { k: 0.15, sets: [1], aspect: 1, light: 0.12, sparks: [0, 0], smoke: 0.4, tongue: 0, heat: 0.08, suppressed: true },
};
// per-model refinements (CS2: Glock yellower, UMP the biggest/orangest SMG, M4 tighter + birdcage prongs, AWP brake)
const WEAPON_STYLE = {
  glock: { k: 0.5, tint: [1, 1.08, 0.85] }, usp: { k: 0.55 }, deagle: { k: 0.95 }, revolver: { k: 1.05, side: 0.35 },
  mp5: { k: 0.8 }, uzi: { k: 0.75 }, vector: { k: 0.72, sets: [1] }, ump: { k: 0.92, tint: [1, 0.95, 0.82] },
  akm: { k: 1.0, sets: [0, 3], tint: [1, 0.96, 0.9] }, m4: { k: 0.95, sets: [1, 0, 2], prongs: true, tint: [1, 1.04, 1] },
  scar: { k: 0.85 }, aug: { k: 0.85, sets: [1, 3] },
  m249: { k: 1.0 }, mg42: { k: 0.95, sets: [0, 2] }, m134: { k: 0.7, sets: [1, 2] },
  awp: { k: 1.4, side: 0.5 }, barrett: { k: 1.5, side: 0.8 }, kar98: { k: 1.05, side: 0 },
  m870: { k: 1.25 }, usas: { k: 1.15 }, db: { k: 1.5 },
};
// CS2 tracer looks per class (06a §7.2): visual speed m/s, streak length m, width m, HDR core / glow
const TRACER = {
  pistol: { speed: 280, len: 2.0, w: 0.008, core: [6, 5, 3.6], glow: [2.2, 1.0, 0.32] },
  smg: { speed: 280, len: 2.0, w: 0.008, core: [6, 5, 3.6], glow: [2.2, 1.0, 0.32] },
  rifle: { speed: 320, len: 3.0, w: 0.010, core: [7, 5.6, 3.6], glow: [2.4, 1.1, 0.35] },
  sniper: { speed: 380, len: 4.5, w: 0.015, core: [9, 7.5, 5], glow: [2.6, 1.9, 1.1] },
  mg: { speed: 320, len: 3.2, w: 0.013, core: [8, 5.5, 3], glow: [2.8, 1.1, 0.25] },
  shotgun: { speed: 250, len: 1.2, w: 0.008, core: [4, 3, 1.8], glow: [1.6, 0.6, 0.15] },
  heavy: { speed: 320, len: 3.0, w: 0.016, core: [7, 5.6, 3.6], glow: [2.4, 1.1, 0.35] },
};
/** CS2 tracer cadence (weapons.vdata m_nTracerFrequency): every shot / every 3rd (first always) / none. */
export const TRACER_EVERY = { pistol: 1, sniper: 1, shotgun: 1, mg: 1, rifle: 3, smg: 3, heavy: 0, melee: 0 };

// impact palettes (albedo-ish, lit by the scene)
const DUST = {
  concrete: [0.62, 0.6, 0.56], plaster: [0.85, 0.84, 0.8], tile: [0.8, 0.79, 0.76], metal: [0.5, 0.5, 0.5],
  wood: [0.55, 0.43, 0.3], dirt: [0.4, 0.33, 0.25], sand: [0.72, 0.62, 0.46], glass: [0.8, 0.82, 0.85],
};

/** Picks the temperature ramp matching an HDR colour (premium / special muzzle colours). */
export function rampFor(c) {
  const [r, g, b] = c;
  if (b >= r && b >= g) return r > g * 1.2 ? RAMP.purple : RAMP.blue;
  if (g >= r && g >= b) return RAMP.green;
  return g / Math.max(r, 1e-3) > 0.6 ? RAMP.gold : RAMP.red;
}

export class FX {
  constructor(game, quality) {
    this.game = game;
    this.scene = game.scene;
    this.q = quality || {};
    this.k = THREE.MathUtils.clamp((this.q.particles ?? 3000) / 4000, 0.3, 1.5);
    this.particles = new Particles(this.scene, game.camera, quality, game.renderer);
    this.textures = this.particles.textures;
    this.decals = new Decals(this.scene, this.textures, quality?.decals ?? 160);
    this.shells = new Shells(this.scene, (type, pos, vol) => game.audio?.play(type === '12g' ? 'shell_shotgun' : type === 'link' ? 'shell_link' : 'shell_brass', { pos, volume: 0.5 + vol * 0.5 }), this.particles, { rest: this.k < 0.5 ? 3 : 5 });
    this.lights = new LightPool(this.scene, quality?.maxLights ?? 4);
    this.ribbons = new Ribbons(this.scene, game.camera, { maxVerts: this.k < 0.5 ? 2500 : 6000 });
    this.smokes = new SmokeVolumes(this, { quality: this.k });
    this.infernos = new Infernos(this, { quality: this.k });
    this.screen = new ScreenFX(this);
    this.particles.floorFn = (x, z) => this._floorAt(x, z);
    this._floorCache = new Map();
    this.time = 0;
    this.heat = 0;           // barrel heat of the local gun (CS:GO/CS2 style smoking barrel)
    this.lastShot = -9;
    this.wispT = 0;
    this.heatKind = 'rifle';
    this._lightScan = -1;
    this._zstate = new WeakMap();
    this._bloodDecalT = 0;
    this._bloodDecals = 0;
    this.lightScale = 1;     // multiplier on the scene-light estimate for lit particles / decals
  }

  _floorAt(x, z) {
    // cheap floor estimate for particle bounces: one raycast per ~0.5 m cell, cached for a while
    const kx = Math.round(x * 2), kz = Math.round(z * 2);
    const key = kx * 100003 + kz;
    let e = this._floorCache.get(key);
    if (e === undefined) {
      const col = this.game.world.collision;
      e = col ? col.floorBelow(_t.set(x, this.game.camera.position.y + 1.5, z), 0, 60) : 0;
      if (!isFinite(e)) e = -100;
      if (this._floorCache.size > 4000) this._floorCache.clear();
      this._floorCache.set(key, e);
    }
    return e;
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    this.time += dt;
    this.particles.shared.zoom.value = this.game.zoom || 1;
    this._updateLighting();
    this._updateBarrel(dt);
    this._updateZombies(dt);
    this.smokes.update(dt);
    this.infernos.update(dt);
    this.particles.update(dt);
    this.shells.update(dt);
    this.lights.update(dt);
    this.decals.update(dt);
    this.ribbons.update(dt);
    this.screen.update(dt);
  }

  /** Scene light estimate (sun + hemisphere / ambient + environment) for lit smoke, blood and decals. */
  _updateLighting() {
    const sh = this.particles.shared;
    if (this.time - this._lightScan > 2 || this._lightScan < 0) {
      this._lightScan = this.time;
      let sun = null, hemi = null; const amb = [];
      this.scene.traverse((o) => {
        if (o.isDirectionalLight && (!sun || o.intensity > sun.intensity)) sun = o;
        else if (o.isHemisphereLight && (!hemi || o.intensity > hemi.intensity)) hemi = o;
        else if (o.isAmbientLight) amb.push(o);
      });
      this._sun = sun; this._hemi = hemi; this._amb = amb;
    }
    const cam = this.game.camera;
    const ls = this.lightScale;
    const sunDir = _d.set(0.4, 0.8, 0.3);
    const sunCol = _c.set(0, 0, 0);
    if (this._sun) {
      this._sun.getWorldPosition(_v); this._sun.target.getWorldPosition(_v2);
      sunDir.subVectors(_v, _v2);
      sunCol.set(this._sun.color.r, this._sun.color.g, this._sun.color.b).multiplyScalar(this._sun.intensity / Math.PI * ls);
    }
    sunDir.normalize();
    const env = (this.scene.environment ? (this.scene.environmentIntensity ?? 1) : 0) * ls;
    let ar = 0, ag = 0, ab = 0;
    for (const a of this._amb) { ar += a.color.r * a.intensity / Math.PI; ag += a.color.g * a.intensity / Math.PI; ab += a.color.b * a.intensity / Math.PI; }
    const h = this._hemi, hi = h ? h.intensity / Math.PI * ls : 0;
    const sky = sh.sky.value.set((h ? h.color.r * hi : 0) + ar * ls + env * 0.5, (h ? h.color.g * hi : 0) + ag * ls + env * 0.52, (h ? h.color.b * hi : 0) + ab * ls + env * 0.56);
    const gr = sh.ground.value.set((h ? h.groundColor.r * hi : 0) + ar * ls + env * 0.22, (h ? h.groundColor.g * hi : 0) + ag * ls + env * 0.21, (h ? h.groundColor.b * hi : 0) + ab * ls + env * 0.2);
    sh.sunCol.value.copy(sunCol);
    _m3.setFromMatrix4(cam.matrixWorldInverse);
    sh.sunView.value.copy(sunDir).applyMatrix3(_m3).normalize();
    sh.upView.value.copy(UP).applyMatrix3(_m3).normalize();
    // a camera-facing alpha particle sees roughly half the sun and the average of sky and ground
    sh.sceneLight.value.set(sunCol.x * 0.5 + (sky.x + gr.x) * 0.5, sunCol.y * 0.5 + (sky.y + gr.y) * 0.5, sunCol.z * 0.5 + (sky.z + gr.z) * 0.5);
    const du = this.decals.uniforms;
    du.uSunDir.value.copy(sunDir);
    du.uSun.value = (sunCol.x + sunCol.y + sunCol.z) / 3;
    du.uAmb.value = (sky.x + sky.y + sky.z + gr.x + gr.y + gr.z) / 6 + 0.02;
    du.uFog.value = this.scene.fog?.density ?? 0;
    this.decals.collision = this.game.world.collision;
  }

  _n(count) { const c = count * this.k; return Math.floor(c) + (R() < c - Math.floor(c) ? 1 : 0); }

  // ------------------------------------------------------------------ muzzle flash
  /**
   * Muzzle flash. pos: world position of the muzzle (for vm: the TRUE position of the first-person gun's
   * muzzle socket), dir: barrel direction. opts: vm (first person), weapon (id for per-model style),
   * lightPos, scale, ramp (RAMP row for premium colours), color (HDR tint), suppressed.
   */
  muzzle(kind, pos, dir, { vm = false, weapon = null, lightPos = null, scale = 1, ramp = null, color = null, suppressed = false } = {}) {
    if (color && (ramp === null || ramp === undefined)) { ramp = rampFor(color); color = null; }   // HDR colour -> matching ramp
    const st = { ...(STYLE[suppressed ? 'suppressed' : kind] || STYLE.rifle), ...(!suppressed && WEAPON_STYLE[weapon] || {}) };
    if (vm) {
      this.heat = Math.min(1.6, this.heat + (st.heat ?? 0.1));
      this.lastShot = this.time;
      this.heatKind = kind;
      this._vmMuzzle(st, pos, dir, scale, ramp, color);
    } else this._worldMuzzle(st, pos, dir, scale, ramp, color);
    const lc = ramp === null || ramp === RAMP.gunfire ? 0xff7a30 : ramp === RAMP.blue ? 0x6aa8ff : ramp === RAMP.green ? 0x8dff6a : ramp === RAMP.purple ? 0xc07aff : ramp === RAMP.red ? 0xff5030 : 0xffc060;
    const lp = lightPos || pos;
    if (vm) {
      // two lights: a weak one just above the muzzle that only reaches the gun / hands (inverse-square makes
      // anything stronger blow the viewmodel out), and the environment light ~1.4 m ahead for walls and floor
      // (kept ~0.35 m in front of / above the muzzle: closer, inverse-square would burn the gun white)
      _v.copy(lp).addScaledVector(dir, 0.3); _v.y += 0.1;
      this.lights.flash(_v, lc, (st.vmLight ?? 0.32) * st.light * scale, 2.0, 0.05);
      if (!st.suppressed) { _v.copy(lp).addScaledVector(dir, 1.5); this.lights.flash(_v, lc, 2 * st.light * scale, 5 + st.light * 1.5, 0.05); }
    } else this.lights.flash(lp, lc, 2.6 * st.light * scale, 4, 0.05);
  }

  _vmMuzzle(st, pos, dir, scale, ramp, color) {
    const P = this.particles;
    const cam = this.game.camera;
    const lp = _v.copy(pos).applyMatrix4(cam.matrixWorldInverse);
    const ld = _d.copy(dir).transformDirection(cam.matrixWorldInverse);
    const up = _u.copy(UP).transformDirection(cam.matrixWorldInverse);
    const k = st.k * scale;
    const tint = st.tint || [1, 1, 1];
    const col = color || [1, 1, 1];
    const rp = ramp ?? RAMP.gunfire;
    const bright = 0.85 + R() * 0.3;
    const life = 0.056 * (st.life || 1) * (0.85 + R() * 0.3);
    const x = lp.x, y = lp.y, z = lp.z;
    const sets = st.sets;
    if (st.suppressed) {
      // no fireball: a puff of grey gas, sometimes a tiny orange point
      P.spawn({ vm: true, x, y, z, vx: ld.x * 1.2, vy: ld.y * 1.2 + 0.1, vz: ld.z * 1.2, life: 0.3, size: 0.03, size1: 0.12, sizePow: 0.5, color: [0.8, 0.8, 0.8, 0.2], color1: [0.8, 0.8, 0.8, 0], frame: FRAME.smoke + ((R() * 2) | 0), drag: 3, inertia: 0.6 });
      if (R() < 0.25) P.spawn({ vm: true, additive: true, x, y, z, life: 0.02, size: 0.015, color: [3, 1.2, 0.3, 1], frame: FRAME.glow });
      return;
    }
    // A: small overexposed yellow-white core + A': the big soft peach glow around the whole flash (CS2: the
    // flash reads as a peach-orange glow volume ~3x the front-sight height, only the core clips to white)
    P.spawn({ vm: true, additive: true, x: x + ld.x * 0.012 * k, y: y + ld.y * 0.012 * k, z: z + ld.z * 0.012 * k, life: life * 0.6, size: 0.05 * k, size1: 0.065 * k,
      color: [7 * bright * tint[0] * col[0], 5.6 * bright * tint[1] * col[1], 3.4 * bright * tint[2] * col[2], 1], color1: [2.5 * col[0], 1.1 * col[1], 0.35 * col[2], 0], frame: FRAME.glow });
    const gc = ramp === null || ramp === RAMP.gunfire ? [1.1, 0.55, 0.24] : [col[0] * 0.35, col[1] * 0.35, col[2] * 0.35];
    const hs = st.halo ?? 1;
    const hset = st.sets[(R() * st.sets.length) | 0];
    P.spawn({ vm: true, additive: true, x, y, z, mode: 'align', dir: [ld.x, ld.y, ld.z], aspect: st.aspect * 0.9, anchor: (st.anchor ?? 0.32) * 0.8, mirror: R() < 0.5, rot: (R() - 0.5) * 0.8,
      size: 0.34 * k * hs * (0.9 + R() * 0.2), size1: 0.4 * k * hs, life: life * 0.9, frame: FRAME.muzzle + hset * 4 + 1, ramp: rp, heat: 0.52 * bright, heat1: 0.22,
      color: [tint[0] * col[0], tint[1] * col[1], tint[2] * col[2], 0.7], color1: [tint[0] * col[0], tint[1] * col[1], tint[2] * col[2], 0], colorPow: 0.7 });
    P.spawn({ vm: true, additive: true, x: x + ld.x * 0.04 * k, y: y + ld.y * 0.04 * k, z: z + ld.z * 0.04 * k, life: life * 0.9, size: 0.2 * k * hs, size1: 0.24 * k * hs,
      color: [gc[0] * bright * tint[0], gc[1] * bright * tint[1], gc[2] * bright * tint[2], 1], color1: [gc[0] * 0.3, gc[1] * 0.2, gc[2] * 0.1, 0], colorPow: 0.6, frame: FRAME.glow, rot: R() * 6.28 });
    // B: turbulent fire cloud(s), aligned with the barrel's screen direction, growing out of the muzzle
    const set = sets[(R() * sets.length) | 0];
    P.spawn({ vm: true, additive: true, x, y, z, mode: 'align', dir: [ld.x, ld.y, ld.z], aspect: st.aspect, anchor: st.anchor ?? 0.32, mirror: R() < 0.5, rot: (R() - 0.5) * 0.35,
      size: 0.2 * k * (0.85 + R() * 0.3), size1: 0.26 * k, life, frame: FRAME.muzzle + set * 4, frames: 4, ramp: rp, heat: (st.heatK ?? 0.86) * bright, heat1: 0, heatPow: 0.7,
      color: [tint[0] * col[0], tint[1] * col[1], tint[2] * col[2], 1], color1: [tint[0] * col[0], tint[1] * col[1], tint[2] * col[2], 0.6] });
    if (R() < 0.55) {
      const s2 = sets[(R() * sets.length) | 0];
      const off = 0.05 * k;
      P.spawn({ vm: true, additive: true, x: x + ld.x * off, y: y + ld.y * off, z: z + ld.z * off, mode: 'align', dir: [ld.x, ld.y, ld.z], aspect: st.aspect * 1.1, anchor: 0.25, mirror: R() < 0.5, rot: (R() - 0.5) * 0.6,
        size: 0.13 * k, size1: 0.18 * k, life: life * 0.85, frame: FRAME.muzzle + s2 * 4, frames: 4, ramp: rp, heat: (st.heatK ?? 0.86) * 0.82 * bright, heat1: 0, heatPow: 0.8,
        color: [tint[0] * col[0], tint[1] * col[1], tint[2] * col[2], 0.85], color1: [tint[0], tint[1], tint[2], 0.4] });
    }
    // shotguns: a soft orange cloud sagging below the barrel (CS2 Nova / XM1014: the haze reaches the hands)
    if (st.drop) {
      P.spawn({ vm: true, additive: true, x: x + ld.x * 0.05 * k - up.x * 0.05 * k, y: y + ld.y * 0.05 * k - up.y * 0.05 * k, z: z + ld.z * 0.05 * k - up.z * 0.05 * k, life: life * 1.1,
        size: 0.3 * k, size1: 0.36 * k, color: [0.9 * bright * tint[0], 0.42 * bright * tint[1], 0.14 * bright * tint[2], 1], color1: [0.3, 0.1, 0.02, 0], colorPow: 0.6, frame: FRAME.glow });
    }
    // B': occasional long thin tongue
    if (R() < st.tongue) {
      _t.copy(ld).addScaledVector(up, (R() - 0.5) * 0.25).normalize();
      P.spawn({ vm: true, additive: true, x, y, z, mode: 'align', dir: [_t.x, _t.y, _t.z], aspect: 3.4, anchor: 0.5, size: 0.05 * k, size1: 0.06 * k, life: life * 0.75,
        frame: FRAME.cone + 2, ramp: rp, heat: 1, heat1: 0, color: [col[0], col[1], col[2], 0.9], color1: [col[0], col[1], col[2], 0] });
    }
    // side jets (muzzle brakes: AWP / Deagle-style), horizontal "wings"
    if (st.side) {
      _r.crossVectors(ld, up).normalize();
      for (const s of [-1, 1]) {
        _t.copy(_r).multiplyScalar(s).addScaledVector(ld, 0.36).normalize();
        P.spawn({ vm: true, additive: true, x: x - ld.x * 0.02, y: y - ld.y * 0.02, z: z - ld.z * 0.02, mode: 'align', dir: [_t.x, _t.y, _t.z], aspect: 2.4, anchor: 0.45,
          size: 0.08 * k * st.side, size1: 0.1 * k * st.side, life: life * 0.9, frame: FRAME.cone + ((R() * 2) | 0), ramp: rp, heat: 0.95, heat1: 0, mirror: R() < 0.5, color: [col[0], col[1], col[2], 1], color1: [col[0], col[1], col[2], 0.3] });
      }
    }
    // C: unburnt powder sparks
    const ns = Math.round(rr(st.sparks[0], st.sparks[1]));
    for (let i = 0; i < ns; i++) {
      const sp = 3 + R() * 5;
      _t.set(ld.x + (R() - 0.5) * 0.9, ld.y + (R() - 0.5) * 0.9, ld.z + (R() - 0.5) * 0.9).normalize();
      P.spawn({ vm: true, additive: true, x, y, z, vx: _t.x * sp, vy: _t.y * sp, vz: _t.z * sp, life: rr(0.04, 0.12), size: 0.0025 + R() * 0.002, stretch: 0.006,
        color: [6, 3.2, 1.2, 1], color1: [2, 0.6, 0.1, 1], frame: FRAME.spark, gravity: 6, drag: 2 });
    }
    // D: dim orange afterglow, then the grey muzzle smoke (stays partly in the world while you move)
    P.spawn({ vm: true, additive: true, x: x + ld.x * 0.03 * k, y: y + ld.y * 0.03 * k, z: z + ld.z * 0.03 * k, delay: life * 0.55, life: 0.11, size: 0.17 * k, size1: 0.21 * k,
      color: [col[0], col[1], col[2], 0.55], color1: [col[0], col[1], col[2], 0], ramp: rp, heat: 0.5, heat1: 0.3, frame: FRAME.muzzle + set * 4 + 2, mode: 'align', dir: [ld.x, ld.y, ld.z], aspect: st.aspect, anchor: st.anchor ?? 0.32, mirror: R() < 0.5 });
    const nsm = Math.max(1, Math.round(st.smoke * (0.7 + R() * 0.6)));
    for (let i = 0; i < nsm; i++) {
      const sv = 0.35 + R() * 0.5;
      P.spawn({ vm: true, x: x + ld.x * 0.02, y: y + ld.y * 0.02, z: z + ld.z * 0.02, delay: 0.03 + i * 0.02,
        vx: ld.x * sv + up.x * 0.2 + (R() - 0.5) * 0.1, vy: ld.y * sv + up.y * 0.2 + (R() - 0.5) * 0.1, vz: ld.z * sv + up.z * 0.2 + (R() - 0.5) * 0.1,
        life: rr(0.5, 1.0) * Math.min(1.6, st.life || 1), size: 0.05 * k, size1: (0.26 + R() * 0.12) * k, sizePow: 0.55,
        color: [0.7, 0.55, 0.46, 0.2], color1: [0.72, 0.71, 0.7, 0], colorPow: 0.7, frame: FRAME.smoke + ((R() * 2) | 0), drag: 1.6, spin: (R() - 0.5) * 1.2, inertia: 0.55 });
    }
  }

  _worldMuzzle(st, pos, dir, scale, ramp, color) {
    const P = this.particles;
    const k = st.k * scale;
    const col = color || [1, 1, 1];
    const rp = ramp ?? RAMP.gunfire;
    const life = 0.05 * (st.life || 1);
    if (st.suppressed) {
      P.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: dir.x, vy: dir.y + 0.1, vz: dir.z, life: 0.4, size: 0.05, size1: 0.2, color: [0.8, 0.8, 0.8, 0.22], color1: [0.8, 0.8, 0.8, 0], frame: FRAME.smoke, drag: 3 });
      return;
    }
    // front: 4-prong star + glow; side: flame cone along the barrel (+ birdcage prongs)
    const set = st.sets[(R() * st.sets.length) | 0];
    P.spawn({ additive: true, x: pos.x, y: pos.y, z: pos.z, life: life * 0.7, size: 0.1 * k, size1: 0.12 * k, color: [8 * col[0], 5.5 * col[1], 2.6 * col[2], 1], color1: [2, 0.8, 0.2, 0], frame: FRAME.glow });
    P.spawn({ additive: true, x: pos.x + dir.x * 0.04 * k, y: pos.y + dir.y * 0.04 * k, z: pos.z + dir.z * 0.04 * k, life, size: 0.18 * k, size1: 0.24 * k, frame: FRAME.muzzle + set * 4, frames: 4, ramp: rp, heat: 0.95, heat1: 0.1, color: [col[0], col[1], col[2], 1], color1: [col[0], col[1], col[2], 0.5], rot: R() * 6.28 });
    P.spawn({ additive: true, x: pos.x, y: pos.y, z: pos.z, life: life * 0.8, size: 0.2 * k, size1: 0.24 * k, color: [2.6 * col[0], 1.7 * col[1], 0.8 * col[2], 1], color1: [1, 0.4, 0.1, 0], frame: FRAME.star4, rot: R() * 6.28 });
    P.spawn({ additive: true, x: pos.x, y: pos.y, z: pos.z, mode: 'align', dir: [dir.x, dir.y, dir.z], aspect: 2.6, anchor: 0.47, size: 0.14 * k, size1: 0.16 * k, life, frame: FRAME.cone + ((R() * 2) | 0), ramp: rp, heat: 1, heat1: 0, mirror: R() < 0.5, color: [col[0], col[1], col[2], 1] });
    if (st.prongs) P.spawn({ additive: true, x: pos.x, y: pos.y, z: pos.z, mode: 'align', dir: [dir.x, dir.y, dir.z], aspect: 2.2, anchor: 0.47, size: 0.16 * k, life, color: [5, 3.6, 2, 1], color1: [2, 1, 0.3, 0], frame: FRAME.prongs });
    if (st.side) {
      _r.crossVectors(dir, UP).normalize();
      for (const s of [-1, 1]) {
        _t.copy(_r).multiplyScalar(s).addScaledVector(dir, 0.36).normalize();
        P.spawn({ additive: true, x: pos.x, y: pos.y, z: pos.z, mode: 'align', dir: [_t.x, _t.y, _t.z], aspect: 2.4, anchor: 0.45, size: 0.12 * k * st.side, life, frame: FRAME.cone, ramp: rp, heat: 0.9, heat1: 0 });
      }
    }
    P.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: dir.x * 0.6, vy: dir.y * 0.6 + 0.2, vz: dir.z * 0.6, delay: 0.03, life: 0.8, size: 0.08 * k, size1: 0.5 * k, sizePow: 0.5, color: [0.72, 0.7, 0.68, 0.25], color1: [0.75, 0.75, 0.75, 0], frame: FRAME.smoke + ((R() * 2) | 0), drag: 1.5 });
  }

  /** Barrel smoke after sustained fire: thin wisps curling up from the first-person muzzle. */
  _updateBarrel(dt) {
    this.heat = Math.max(0, this.heat - dt * (this.time - this.lastShot < 0.15 ? 0.05 : 0.22));
    if (this.heat < 0.45 || this.time - this.lastShot < 0.15) return;
    const vm = this.game.vm;
    if (!vm?.weapon || !vm.visible) return;
    this.wispT -= dt;
    if (this.wispT > 0) return;
    this.wispT = rr(0.06, 0.12) / Math.max(0.5, this.k);
    const p = vm.socketWorld('muzzle', _v);
    if (!p) return;
    const cam = this.game.camera;
    p.applyMatrix4(cam.matrixWorldInverse);
    const up = _u.copy(UP).transformDirection(cam.matrixWorldInverse);
    const a = Math.min(1, (this.heat - 0.45) * 1.6);
    const s = 0.012 + R() * 0.01;
    this.particles.spawn({ vm: true, x: p.x, y: p.y + 0.005, z: p.z, vx: up.x * rr(0.12, 0.22) + (R() - 0.5) * 0.04, vy: up.y * rr(0.12, 0.22), vz: up.z * rr(0.12, 0.22) + (R() - 0.5) * 0.04,
      life: rr(1.0, 1.6), size: s, size1: s * 3.2, sizePow: 0.7, mode: 'align', dir: [up.x, up.y, up.z], aspect: 4.5, anchor: 0.4, mirror: R() < 0.5, rot: (R() - 0.5) * 0.4,
      color: [0.78, 0.78, 0.78, 0.24 * a], color1: [0.8, 0.8, 0.8, 0], fadeIn: 0.12, frame: FRAME.wisp, drag: 0.6, inertia: 0.45 });
  }

  // ------------------------------------------------------------------ tracers
  /**
   * Tracer from -> to. opts: cls (TRACER key) or explicit speed/length/width/color (core HDR)/glow (HDR or
   * null), start (m skipped at the muzzle; first person 1.0), carve (thin out smoke along the path).
   */
  tracer(from, to, { cls = 'rifle', color = null, glow = undefined, speed, length, width, start = 1.5 } = {}) {
    const T = TRACER[cls] || TRACER.rifle;
    _v.subVectors(to, from);
    const d = _v.length();
    if (d < start + 0.5) return;
    _v.multiplyScalar(1 / d);
    const sp = speed ?? T.speed, len = length ?? T.len, w = width ?? T.w;
    const core = color || T.core, gl = glow === undefined ? (color ? color.map((c) => c * 0.35) : T.glow) : glow;
    const x = from.x + _v.x * start, y = from.y + _v.y * start, z = from.z + _v.z * start;
    const life = Math.max(0.016, (d - start) / sp);
    const st = len / sp;
    this.particles.spawn({ additive: true, x, y, z, vx: _v.x * sp, vy: _v.y * sp, vz: _v.z * sp, life, size: w, stretch: st, color: [core[0], core[1], core[2], 1], color1: [core[0], core[1], core[2], 1], frame: FRAME.spark });
    if (gl) this.particles.spawn({ additive: true, x, y, z, vx: _v.x * sp, vy: _v.y * sp, vz: _v.z * sp, life, size: w * 2.2, stretch: st * 0.85, color: [gl[0] * 0.22, gl[1] * 0.22, gl[2] * 0.22, 1], color1: [gl[0] * 0.22, gl[1] * 0.22, gl[2] * 0.22, 1], frame: FRAME.spark });
  }

  /** A bullet's full path (every shot, tracer or not): smoke grenades get a tunnel. */
  bulletPath(from, to) { this.smokes.carve(from, to); }

  // ------------------------------------------------------------------ impacts
  /** Bullet impact on the world. opts: decal, big (size/amount multiplier), exit (wall-bang exit side). */
  impact(surf, point, normal, dir, { decal = true, big = 1, exit = false } = {}) {
    const P = this.particles;
    const n = normal;
    const refl = _r.copy(dir).addScaledVector(n, -2 * dir.dot(n)).normalize();
    const camD = point.distanceTo(this.game.camera.position);
    const fewer = camD > 15 ? 0.5 : 1;
    // CS2: impacts stay readable at range -> dust / jets / grit carry `far` and grow in the shader with the viewer's
    // apparent distance (per frame and per viewer, scope zoom included); floor hits fade softly into the ground
    const gnd = n.y > 0.7 ? point.y : null;
    const out = exit ? dir : n;
    const px = point.x + n.x * 0.03, py = point.y + n.y * 0.03, pz = point.z + n.z * 0.03;
    // dust burst: shoots out along the normal (+ a bit of the reflection), most of the growth in the first 0.2 s,
    // then hangs and settles (lit by the scene)
    const dust = (count, c, a, s0, s1, life, speed, { up = 0, grav = -0.05, frame = FRAME.dusty, pow = 0.3 } = {}) => {
      for (let i = 0; i < count; i++) {
        const sp = speed * (0.5 + R() * 0.7);
        P.spawn({ x: px, y: py, z: pz,
          vx: (out.x * 0.85 + refl.x * 0.3 + (R() - 0.5) * 0.7) * sp, vy: (out.y * 0.85 + refl.y * 0.3 + (R() - 0.5) * 0.7) * sp + up, vz: (out.z * 0.85 + refl.z * 0.3 + (R() - 0.5) * 0.7) * sp,
          life: life * (0.75 + R() * 0.5), size: s0 * big, size1: s1 * big * (0.8 + R() * 0.4), sizePow: pow, color: [c[0], c[1], c[2], a], color1: [c[0], c[1], c[2], 0], colorPow: 0.5, fadeIn: 0.03,
          frame: frame === FRAME.dusty ? frame + ((R() * 2) | 0) : frame === FRAME.puff ? frame + ((R() * 4) | 0) : frame, lit: true, drag: 4.5, gravity: grav, spin: (R() - 0.5) * 1.5, far: true, ground: gnd, soft: 0.12 });
      }
    };
    const jet = (c, a, len, w = 0.08) => {
      // fast dense cone along the normal (the first frames of a hit, reads from far away)
      P.spawn({ x: px, y: py, z: pz, mode: 'align', dir: [out.x, out.y, out.z], aspect: 2.4, anchor: 0.42, vx: out.x * 0.5, vy: out.y * 0.5, vz: out.z * 0.5,
        life: 0.3, size: w * big, size1: len * big, sizePow: 0.35, color: [c[0], c[1], c[2], a], color1: [c[0], c[1], c[2], 0], colorPow: 0.8, frame: FRAME.dusty + ((R() * 2) | 0), lit: true, drag: 4, far: true, ground: gnd, soft: 0.08 });
    };
    // fine grit spray: thin fast streaks (sand / concrete grains) in a cone around the normal
    const grit = (count, c, speed, cone = 0.8) => {
      for (let i = 0; i < count; i++) {
        const sp = speed * (0.5 + R() * 0.8);
        P.spawn({ x: px, y: py, z: pz, vx: (out.x + (R() - 0.5) * cone * 2) * sp, vy: (out.y + (R() - 0.3) * cone * 2) * sp, vz: (out.z + (R() - 0.5) * cone * 2) * sp,
          life: rr(0.2, 0.45), size: rr(0.006, 0.012), far: 'sqrt', stretch: 0.018, color: [c[0], c[1], c[2], 0.9], color1: [c[0], c[1], c[2], 0], frame: FRAME.spark, gravity: 9.8, drag: 1.5 });
      }
    };
    const chunks = (count, c, s0, s1, speed, frame = FRAME.rock, cone = 0.9) => {
      for (let i = 0; i < count; i++) {
        const sp = speed * (0.5 + R());
        P.spawn({ x: point.x + n.x * 0.02, y: point.y + n.y * 0.02, z: point.z + n.z * 0.02,
          vx: (out.x + (R() - 0.5) * cone * 2) * sp, vy: (out.y + (R() - 0.25) * cone * 2) * sp, vz: (out.z + (R() - 0.5) * cone * 2) * sp,
          life: rr(0.6, 1.1), size: rr(s0, s1) * Math.sqrt(big), color: [c[0], c[1], c[2], 1], color1: [c[0], c[1], c[2], 1], frame, gravity: 9.8, spin: (R() - 0.5) * 30, collide: true, bounce: 0.25 });
      }
    };
    const sparks = (count, speed, cone = 0.9, along = refl) => {
      for (let i = 0; i < count; i++) {
        const sp = speed * (0.4 + R() * 0.8);
        P.spawn({ additive: true, x: point.x + n.x * 0.01, y: point.y + n.y * 0.01, z: point.z + n.z * 0.01,
          vx: (along.x + (R() - 0.5) * cone) * sp, vy: (along.y + (R() - 0.35) * cone) * sp, vz: (along.z + (R() - 0.5) * cone) * sp,
          life: rr(0.12, 0.35), size: rr(0.006, 0.01), stretch: 0.025, color: [7, 4.5, 2, 1], color1: [2.5, 0.6, 0.08, 1], frame: FRAME.spark, gravity: 9.8, drag: 1, collide: true, bounce: 0.35 });
      }
    };
    const flash = (size, c, frame = FRAME.glow, life = 0.035) => P.spawn({ additive: true, x: px, y: py, z: pz, life, size: size * Math.sqrt(big), far: 'sqrt', color: [c[0], c[1], c[2], 1], color1: [c[0], c[1], c[2], 0], frame, rot: R() * 6.28 });
    const hole = (frame, s0, s1, extra = {}) => { if (decal) this.decals.add(point, n, { frame, size: rr(s0, s1) * (exit ? 1.2 : 1) * Math.max(0.7, Math.sqrt(big)), ...extra }); };
    switch (surf) {
      case SURF.metal: case SURF.grate: {
        const g = surf === SURF.grate ? 0.5 : 1;
        sparks(Math.round(rr(8, 16) * g * Math.min(1.5, big)), 9);
        if (exit) sparks(5, 8, 0.5, dir);
        flash(0.22, [6, 4.2, 2.2], FRAME.glint);
        flash(0.07, [3, 2.2, 1.2]);
        this.lights.flash(_v.set(px, py, pz).addScaledVector(n, 0.25), 0xffb070, 0.5 * big, 2.5, 0.04, 0);
        dust(2, DUST.metal, 0.3, 0.05, 0.3, 0.7, 1.0);
        if (surf === SURF.metal) hole(exit ? DECAL.metalExit : DECAL.metal, 0.09, 0.12, { gloss: 1 });
        else hole(DECAL.metal, 0.05, 0.06);
        break;
      }
      case SURF.wood: {
        const c = DUST.wood;
        dust(this._n(3) + 2, c, 0.66, 0.1, 0.78, 1.2, 2.2);
        jet(c, 0.66, 0.42, 0.09);
        grit(Math.round(6 * fewer), [c[0] * 0.8, c[1] * 0.8, c[2] * 0.8], 4);
        const nc = Math.round(rr(4, 7) * fewer);
        for (let i = 0; i < nc; i++) {
          const sp = 3 * (0.5 + R());
          P.spawn({ x: point.x + n.x * 0.02, y: point.y + n.y * 0.02, z: point.z + n.z * 0.02, vx: (out.x + (R() - 0.5) * 1.6) * sp, vy: (out.y + R() * 0.8) * sp, vz: (out.z + (R() - 0.5) * 1.6) * sp,
            life: rr(0.7, 1.2), size: rr(0.025, 0.05), color: [0.62, 0.48, 0.32, 1], color1: [0.62, 0.48, 0.32, 1], frame: FRAME.splinter, gravity: 9.8, spin: (R() - 0.5) * 25, collide: true, bounce: 0.2 });
        }
        flash(0.05, [1.5, 1.3, 1.0]);
        hole(DECAL.wood, 0.12, 0.15, Math.abs(n.y) < 0.7 ? { rot: Math.PI / 2 + (R() - 0.5) * 0.3 } : {});
        break;
      }
      case SURF.dirt: case SURF.sand: {
        const c = surf === SURF.sand ? DUST.sand : DUST.dirt;
        for (let i = 0; i < this._n(5) + 3; i++) {
          const sp = 1 + R();
          P.spawn({ x: px, y: py, z: pz, vx: (n.x + (R() - 0.5) * 0.7) * sp, vy: 3 + R() * 2.2, vz: (n.z + (R() - 0.5) * 0.7) * sp, life: rr(1.2, 1.8), size: 0.1 * big, size1: 0.75 * big, sizePow: 0.35,
            color: [c[0], c[1], c[2], 0.7], color1: [c[0], c[1], c[2], 0], colorPow: 0.7, frame: FRAME.dusty + (i & 1), lit: true, drag: 3.2, gravity: 1.2, spin: (R() - 0.5) * 1.5, far: true, ground: gnd, soft: 0.15 });
        }
        jet(c, 0.7, 0.4);
        grit(Math.round(10 * fewer), [c[0] * 0.7, c[1] * 0.7, c[2] * 0.7], 4.5, 0.6);
        chunks(Math.round(rr(6, 10) * fewer), [c[0] * 0.75, c[1] * 0.75, c[2] * 0.75], 0.012, 0.026, 3.2, FRAME.clod, 0.6);
        hole(DECAL.sand, 0.14, 0.18);
        break;
      }
      case SURF.glass: {
        dust(1, DUST.glass, 0.25, 0.04, 0.25, 0.6, 0.8);
        const nc = Math.round(rr(8, 14) * fewer);
        for (let i = 0; i < nc; i++) {
          const sp = 3.5 * (0.5 + R());
          const v = R() < 0.5 ? dir : out;
          P.spawn({ x: point.x, y: point.y, z: point.z, vx: (v.x + (R() - 0.5) * 1.2) * sp, vy: (v.y + R() * 0.6) * sp, vz: (v.z + (R() - 0.5) * 1.2) * sp,
            life: rr(0.6, 1.0), size: rr(0.012, 0.03), color: [0.9, 0.95, 1, 0.85], color1: [0.9, 0.95, 1, 0.85], frame: FRAME.shard, gravity: 9.8, spin: (R() - 0.5) * 30, collide: true, bounce: 0.3 });
        }
        sparks(2, 4);
        flash(0.08, [2.5, 2.6, 2.8], FRAME.glint);
        hole(DECAL.glass, 0.24, 0.32);
        break;
      }
      case SURF.water: {
        for (let i = 0; i < this._n(12) + 3; i++) {
          const sp = rr(2.5, 4.5);
          P.spawn({ x: point.x, y: point.y + 0.02, z: point.z, vx: (R() - 0.5) * 0.9 * sp * 0.4, vy: sp, vz: (R() - 0.5) * 0.9 * sp * 0.4, life: rr(0.6, 0.9), size: rr(0.012, 0.022), stretch: 0.02,
            color: [0.85, 0.9, 0.95, 0.8], color1: [0.85, 0.9, 0.95, 0.5], frame: FRAME.drop, gravity: 9.8 });
        }
        P.spawn({ x: point.x, y: point.y, z: point.z, mode: 'align', dir: [0, 1, 0], aspect: 1.6, anchor: 0.45, life: 0.35, size: 0.15, size1: 0.45, sizePow: 0.5, color: [0.9, 0.93, 0.96, 0.75], color1: [0.9, 0.93, 0.96, 0], frame: FRAME.splash, mirror: R() < 0.5 });
        P.spawn({ x: point.x, y: point.y + 0.01, z: point.z, mode: 'flat', dir: [0, 1, 0], life: 0.6, size: 0.1, size1: 0.8, sizePow: 0.5, color: [0.9, 0.93, 0.96, 0.5], color1: [0.9, 0.93, 0.96, 0], frame: FRAME.thinRing });
        dust(2, [0.85, 0.88, 0.9], 0.3, 0.05, 0.4, 0.8, 1.0, { frame: FRAME.puff });
        break;
      }
      case SURF.flesh:
        this.blood(point, n, dir, 1);
        break;
      default: { // concrete, brick, stone, plaster, tile
        const plaster = surf === SURF.tile;
        const c = plaster ? DUST.tile : DUST.concrete;
        dust(this._n(plaster ? 4 : 3) + 2, c, plaster ? 0.74 : 0.68, 0.12, plaster ? 1.1 : 0.95, plaster ? 1.5 : 1.2, 2.4);
        dust(1, c, 0.14, 0.25, plaster ? 1.5 : 1.3, 2.0, 0.6, { grav: 0.12, pow: 0.5 });   // lingering haze
        jet(c, plaster ? 0.78 : 0.72, 0.46, 0.1);
        grit(Math.round(rr(6, 10) * fewer), [c[0] * 0.75, c[1] * 0.75, c[2] * 0.75], 5);
        chunks(Math.round(rr(4, 7) * fewer), [c[0] * 0.7, c[1] * 0.7, c[2] * 0.7], 0.01, 0.024, 3.2);
        if (!plaster && R() < 0.25) sparks(1, 5);
        flash(0.07, [2.5, 2.3, 2]);
        hole(plaster ? DECAL.tile : DECAL.concrete, plaster ? 0.14 : 0.11, plaster ? 0.17 : 0.14);
      }
    }
  }

  // ------------------------------------------------------------------ blood (CS2 shape, CSO brightness)
  /**
   * Blood at a hit point. amount ~ damage scale (1 body, 1.6 head, 2.2 explosive, 3 sever; shotgun pellets
   * 0.5). Directional spray leaving the wound along the bullet, droplets, mist, and directional splatter on
   * the wall / floor behind. opts: color (albedo), acid, head (headshot burst; default guessed from amount).
   */
  blood(point, normal, dir, amount = 1, { color = null, acid = false, head } = {}) {
    const P = this.particles;
    const c = acid ? [0.32, 0.6, 0.06] : color || [0.42, 0.03, 0.025];
    const isHead = head ?? (amount >= 1.5 && amount < 2.1);
    const d = _d.copy(dir).normalize();
    const big = Math.min(3, amount);
    // spray card(s): anchored at the wound, pointing along the bullet
    const nsp = isHead ? 2 : amount >= 2 ? 2 : 1;
    for (let i = 0; i < nsp; i++) {
      _t.copy(d).addScaledVector(_v.set(R() - 0.5, R() - 0.3, R() - 0.5), i ? 0.7 : 0.25).normalize();
      const s0 = (isHead ? 0.32 : 0.26) * (0.6 + 0.4 * Math.sqrt(big)), s1 = (isHead ? 0.8 : 0.62) * (0.6 + 0.4 * Math.sqrt(big));
      P.spawn({ x: point.x + d.x * 0.06, y: point.y + d.y * 0.06, z: point.z + d.z * 0.06, mode: 'align', dir: [_t.x, _t.y, _t.z], aspect: 1.5, anchor: 0.44, mirror: R() < 0.5, rot: (R() - 0.5) * 0.3,
        vx: d.x * 0.8, vy: d.y * 0.8, vz: d.z * 0.8, life: isHead ? 0.45 : 0.36, size: s0, size1: s1, sizePow: 0.45,
        color: [c[0] * 1.35, c[1] * 1.3, c[2] * 1.3, 1], color1: [c[0] * 1.6, c[1] * 2.5, c[2] * 2.5, 0], colorPow: 1.8, frame: FRAME.spray, frames: 4 });
    }
    // small dense burst right at the wound (first frames, reads at range)
    P.spawn({ x: point.x + d.x * 0.04, y: point.y + d.y * 0.04, z: point.z + d.z * 0.04, life: 0.14, size: 0.08 * Math.sqrt(big), size1: 0.22 * Math.sqrt(big), sizePow: 0.5,
      color: [c[0] * 1.6, c[1] * 1.2, c[2] * 1.2, 0.8], color1: [c[0] * 1.8, c[1] * 2, c[2] * 2, 0], frame: FRAME.dusty + ((R() * 2) | 0), lit: true });
    // droplets
    const nd = Math.round((isHead ? 14 : rr(6, 10)) * Math.min(2, amount) * (this.k < 0.5 ? 0.6 : 1));
    for (let i = 0; i < nd; i++) {
      const sp = rr(2, 5);
      P.spawn({ x: point.x, y: point.y, z: point.z, vx: d.x * sp + (R() - 0.5) * 1.6, vy: d.y * sp + 0.5 + R() * 1.0, vz: d.z * sp + (R() - 0.5) * 1.6,
        life: rr(0.35, 0.7), size: rr(0.012, 0.025), stretch: 0.012, color: [c[0] * 0.85, c[1] * 0.7, c[2] * 0.7, 1], color1: [c[0] * 0.7, c[1] * 0.6, c[2] * 0.6, 0.9], frame: FRAME.drop, gravity: 9.8, collide: true, bounce: 0.05 });
    }
    // mist (CS2): an irregular, streaky, see-through spray cloud thrown out of the wound along the bullet that
    // spreads to ~0.8 m and thins into a pale pink haze, gone in ~0.45 s (never a round ball)
    const mc = acid ? [0.4, 0.75, 0.1] : color ? [color[0] * 1.6, color[1] * 1.6, color[2] * 1.6] : [0.78, 0.06, 0.05];
    const sb = Math.sqrt(big) * (isHead ? 1.2 : 1);
    for (let i = 0; i < (isHead ? 3 : 2) + (amount >= 2 ? 1 : 0); i++) {
      _t.copy(d).addScaledVector(_v.set(R() - 0.5, R() - 0.35, R() - 0.5), 0.55).normalize();
      P.spawn({ x: point.x + d.x * 0.03, y: point.y + d.y * 0.03, z: point.z + d.z * 0.03, vx: d.x * 0.5, vy: d.y * 0.5 + 0.08, vz: d.z * 0.5,
        mode: 'align', dir: [_t.x, _t.y, _t.z], aspect: 1.25, anchor: 0.36, mirror: R() < 0.5, rot: (R() - 0.5) * 0.9,
        life: rr(0.38, 0.5), size: 0.22 * sb, size1: (i ? 0.7 : 0.85) * sb, sizePow: 0.4,
        color: [mc[0], mc[1], mc[2], i ? 0.55 : 0.72], color1: [mc[0] * 0.95, mc[1] * 2.6, mc[2] * 2.6, 0], colorPow: 1.1, frame: FRAME.mist[i & 1], drag: 2 });
    }
    // pale pink haze around it
    P.spawn({ x: point.x + d.x * 0.15, y: point.y + d.y * 0.15 + 0.03, z: point.z + d.z * 0.15, vx: d.x * 0.3, vy: 0.1, vz: d.z * 0.3, life: 0.5, size: 0.3 * sb, size1: 1.05 * sb, sizePow: 0.45,
      color: [mc[0], mc[1] * 2, mc[2] * 2, 0.16], color1: [mc[0], mc[1] * 3, mc[2] * 3, 0], frame: FRAME.dusty + ((R() * 2) | 0), lit: true, drag: 2, spin: (R() - 0.5) * 1.5 });
    if (isHead) {
      // CSO: a red flash point so headshots read from far away, plus bits of bone/brain
      P.spawn({ additive: true, x: point.x, y: point.y, z: point.z, life: 0.06, size: 0.14, color: [3, 0.3, 0.2, 1], color1: [1, 0.05, 0.03, 0], frame: FRAME.glow });
      this.gibs(point, d, 3, [0.36, 0.08, 0.07], 0.6);
    }
    // splatter on the wall / floor behind the target (throttled for shotgun pellets)
    const col = this.game.world.collision;
    if (!col) return;
    if (this.time - this._bloodDecalT > 0.06) { this._bloodDecalT = this.time; this._bloodDecals = 0; }
    if (this._bloodDecals >= 2) return;
    this._bloodDecals++;
    const tint = acid ? DECAL_TINT.acid : DECAL_TINT.zombie;
    const sz = 1.4 * Math.min(1.6, 0.75 + amount * 0.25);
    _b.copy(d); _b.y -= R() * 0.27; _b.normalize();
    const hit = col.raycast(point, _b, 3.2);
    if (hit) this.decals.add(hit.point, hit.normal, { frame: R() < 0.5 ? DECAL.blood : (R() < 0.5 ? DECAL.blood2 : DECAL.blood3), size: rr(0.4, 0.8) * sz, along: _b, tint, alpha: 0.95, life: rr(20, 30), fade: 3, gloss: 1 });
    if (R() < 0.6 || isHead) {
      _t.copy(point).addScaledVector(d, rr(0.3, 1.0));
      const down = col.raycast(_t, DOWN, 3);
      if (down) this.decals.add(down.point, down.normal, { frame: R() < 0.6 ? DECAL.blood : DECAL.blood3, size: rr(0.3, 0.6) * sz, along: d, tint, alpha: 0.9, life: rr(20, 30), fade: 3, gloss: 1 });
    }
  }

  /** Flesh chunks (dismemberment / gibs), trailing blood. */
  gibs(point, dir, count = 6, color = [0.3, 0.05, 0.04], speed = 1) {
    const P = this.particles;
    for (let i = 0; i < count; i++) {
      const sp = (2 + R() * 4) * speed;
      P.spawn({ x: point.x, y: point.y, z: point.z, vx: (dir.x + (R() - 0.5) * 1.4) * sp, vy: (0.6 + R()) * sp, vz: (dir.z + (R() - 0.5) * 1.4) * sp,
        life: 1.2 + R(), size: 0.035 + R() * 0.05, color: [color[0], color[1], color[2], 1], color1: [color[0] * 0.7, color[1] * 0.7, color[2] * 0.7, 1], frame: FRAME.clod, gravity: 9.8, spin: (R() - 0.5) * 15, collide: true, bounce: 0.15 });
      if (i < 4) P.spawn({ x: point.x, y: point.y, z: point.z, vx: (dir.x + (R() - 0.5) * 1.4) * sp * 0.8, vy: (0.6 + R()) * sp * 0.8, vz: (dir.z + (R() - 0.5) * 1.4) * sp * 0.8,
        life: 0.6, size: 0.02, stretch: 0.03, color: [0.4, 0.03, 0.025, 1], color1: [0.3, 0.02, 0.02, 0.6], frame: FRAME.drop, gravity: 9.8, collide: true, bounce: 0.05 });
    }
  }

  /** CSO knockback readability: a dust kick at a zombie's feet (also emitted automatically on shoves). */
  knockDust(pos, push, strength = 1) {
    const P = this.particles;
    for (let i = 0; i < Math.max(1, Math.round(2 * strength)); i++) {
      P.spawn({ x: pos.x + (R() - 0.5) * 0.4, y: pos.y + 0.08, z: pos.z + (R() - 0.5) * 0.4, vx: -push.x * 0.15 + (R() - 0.5) * 0.4, vy: 0.3 + R() * 0.3, vz: -push.z * 0.15 + (R() - 0.5) * 0.4,
        life: 0.7 + R() * 0.3, size: 0.25 * strength, size1: 0.8 * strength, sizePow: 0.5, color: [0.42, 0.4, 0.37, 0.5], color1: [0.45, 0.43, 0.4, 0], frame: FRAME.dusty + (i & 1), lit: true, drag: 2.5 });
    }
  }

  _updateZombies(dt) {
    const list = this.game.zombies?.list;
    if (!list) return;
    for (const z of list) {
      if (!z.alive || !z.kvel) continue;
      let s = this._zstate.get(z);
      if (!s) { s = { t: 0, state: z.state }; this._zstate.set(z, s); }
      s.t -= dt;
      const kh = Math.hypot(z.kvel.x, z.kvel.z);
      const grounded = z.groundY === undefined || z.pos.y < z.groundY + 0.08;
      if (z.state === 'stagger' && s.state !== 'stagger' && grounded) this.knockDust(z.pos, z.kvel, 1.2);
      else if (kh > 2.2 && grounded && s.t <= 0) { s.t = 0.12; this.knockDust(z.pos, z.kvel, Math.min(1.4, kh / 4)); }
      s.state = z.state;
    }
  }

  // ------------------------------------------------------------------ explosions & grenades
  /** HE / rocket / bloater explosion. opts: radius (m), scale (visual size), color (tint: green = acid, grey = rubble). */
  explosion(pos, { radius = 5, scale = 1, color = null } = {}) {
    const P = this.particles;
    const s = scale;
    let ramp = RAMP.explosion, rubble = false;
    if (color) {
      if (color[1] > color[0] * 1.1) ramp = RAMP.green;
      else if (color[1] / Math.max(0.01, color[0]) > 0.72) rubble = true;
    }
    const kk = Math.min(1.2, this.k + 0.3);
    const acid = ramp === RAMP.green;
    const col = this.game.world.collision;
    const down = col ? col.raycast(_t.set(pos.x, pos.y + 0.5, pos.z), DOWN, 3) : null;
    const gy = down ? down.point.y : pos.y - 0.3;   // puffs fade softly into the floor instead of being cut by it
    // 1. flash (1-2 frames): big bright glow + a hot point
    P.spawn({ additive: true, x: pos.x, y: pos.y + 0.5 * s, z: pos.z, life: 0.07, size: 3.4 * s, size1: 4.6 * s, color: rubble ? [5, 4.2, 3.4, 1] : acid ? [8, 16, 5, 1] : [24, 19, 13, 1], color1: [5, 3, 1.4, 0], frame: FRAME.glow });
    if (!rubble) P.spawn({ additive: true, x: pos.x, y: pos.y + 0.4 * s, z: pos.z, life: 0.12, size: 1.2 * s, size1: 2.2 * s, color: acid ? [6, 12, 4, 1] : [16, 12, 8, 1], color1: [4, 1.6, 0.4, 0], frame: FRAME.muzzle + ((R() * 4) | 0) * 4, ramp, heat: 1.2, heat1: 0.6, rot: R() * 6.28 });
    // 2. fireball (CS2): one billowy, OPAQUE mass of lit puffs with an emissive temperature core that cools
    //    peach (0.25 s) -> orange (~1 s) -> red-brown (~2 s) -> charcoal smoke; edges cool first (thin = cold)
    const nf = rubble ? 0 : Math.max(8, Math.round(16 * kk));
    for (let i = 0; i < nf; i++) {
      // CS2: the fireball stays rooted to the ground while it billows up (every 4th puff hugs the floor and
      // spreads sideways: the stem / skirt of the blast), the rest rise and swell
      const base = i % 4 === 3;
      if (base) _t.set(R() - 0.5, R() * 0.12, R() - 0.5).normalize();
      else _t.set(R() - 0.5, R() * 0.7 + 0.15, R() - 0.5).normalize();
      const sp = (base ? rr(1.2, 2.4) : rr(1.6, 3.6)) * s, r0 = rr(0.1, 0.45) * s;
      const y0 = base ? Math.max(gy + 0.35 * s, pos.y) : pos.y + 0.35 * s + _t.y * r0;
      P.spawn({ x: pos.x + _t.x * r0, y: y0, z: pos.z + _t.z * r0, vx: _t.x * sp, vy: base ? 0.25 * s : _t.y * sp * 0.9 + 0.6 * s, vz: _t.z * sp,
        life: rr(2.7, 3.3), size: rr(0.8, 1.1) * s, size1: rr(2.4, 3.2) * s, sizePow: 0.3, fadeIn: 0.015,
        color: acid ? [0.1, 0.13, 0.06, 0.97] : [0.11, 0.09, 0.08, 0.97], color1: [0.17, 0.16, 0.15, 0], colorPow: 2.6,
        frame: FRAME.puff + (i % 4), lit: true, ramp, heat: rr(0.76, 0.86), heat1: 0, heatPow: 0.8, drag: 2.6, gravity: -0.45, spin: (R() - 0.5) * 0.8, ground: gy, soft: 0.2 * s });
    }
    // flame licks inside the fireball for the first ~0.4 s (additive flipbook flames)
    if (!rubble) for (let i = 0; i < 4; i++) P.spawn({ additive: true, x: pos.x + (R() - 0.5) * 0.6 * s, y: pos.y + 0.3 * s, z: pos.z + (R() - 0.5) * 0.6 * s, vx: (R() - 0.5) * 2, vy: rr(1.5, 3) * s, vz: (R() - 0.5) * 2,
      life: rr(0.35, 0.5), size: 1.0 * s, size1: 1.9 * s, frame: FRAME.fire, frames: 8, fps: 16, frameOffset: R() * 7, ramp, heat: 1.05, heat1: 0.2, mode: 'align', dir: UP, aspect: 1.3, anchor: 0.35, mirror: R() < 0.5, color: [1, 1, 1, 0.9], color1: [1, 1, 1, 0], drag: 2 });
    // 3. smoke column: charcoal (rubble: grey-brown dust) puffs rising behind the fireball, lingering
    const nsm = Math.max(4, Math.round((rubble ? 12 : 7) * kk));
    for (let i = 0; i < nsm; i++) {
      const a = R() * 6.28, sp = rr(0.5, 1.8) * s;
      const dark = rubble ? [0.42, 0.39, 0.35] : acid ? [0.16, 0.2, 0.1] : [0.13, 0.12, 0.11];
      P.spawn({ x: pos.x + Math.cos(a) * 0.5 * s, y: pos.y + (rubble ? rr(0.6, 1.6) : rr(1.8, 2.8)) * s, z: pos.z + Math.sin(a) * 0.5 * s, vx: Math.cos(a) * sp, vy: rr(0.8, 1.8) * s, vz: Math.sin(a) * sp,
        delay: rubble ? R() * 0.08 : rr(1.0, 1.6), life: rr(3.5, 5.5), size: 1.4 * s, size1: rr(4.2, 5.2) * s, sizePow: 0.5, fadeIn: 0.12,
        color: [dark[0], dark[1], dark[2], rubble ? 0.75 : 0.8], color1: [dark[0] * 1.25, dark[1] * 1.25, dark[2] * 1.25, 0], colorPow: 1.4,
        frame: FRAME.puff + (i % 4), lit: true, drag: 1.1, gravity: -0.3, spin: (R() - 0.5) * 0.6 });
    }
    // 4. dark debris specks + 5. sparks / embers
    for (let i = 0; i < Math.round(rr(16, 24) * kk); i++) {
      const sp = rr(6, 14) * Math.sqrt(s);
      _t.set(R() - 0.5, R() * 0.9 + 0.2, R() - 0.5).normalize();
      P.spawn({ x: pos.x, y: pos.y + 0.3, z: pos.z, vx: _t.x * sp, vy: _t.y * sp, vz: _t.z * sp, life: rr(0.8, 1.6), size: rr(0.02, 0.05) * Math.sqrt(s), color: [0.08, 0.07, 0.06, 1], color1: [0.08, 0.07, 0.06, 1], frame: FRAME.rock, gravity: 9.8, spin: (R() - 0.5) * 20, collide: true, bounce: 0.25 });
    }
    if (!rubble) for (let i = 0; i < Math.round(rr(20, 30) * kk); i++) {
      const sp = rr(5, 16) * Math.sqrt(s);
      _t.set(R() - 0.5, R() * 0.8 + 0.1, R() - 0.5).normalize();
      P.spawn({ additive: true, x: pos.x, y: pos.y + 0.3, z: pos.z, vx: _t.x * sp, vy: _t.y * sp, vz: _t.z * sp, life: rr(0.5, 1.2), size: rr(0.012, 0.02), stretch: 0.025,
        color: acid ? [2, 5, 0.8, 1] : [6, 3, 0.8, 1], color1: acid ? [0.5, 1.5, 0.1, 1] : [3, 0.6, 0.1, 1], frame: FRAME.spark, gravity: 9.8, drag: 0.6, collide: true, bounce: 0.3 });
    }
    // 6. ground dust ring + 7. shock ring + scorch
    if (down) {
      for (let i = 0; i < Math.round(rr(10, 12) * Math.min(1, kk)); i++) {
        const a = (i / 11) * 6.28 + R() * 0.4, sp = rr(4, 7) * Math.sqrt(s);
        P.spawn({ x: pos.x, y: gy + 0.25, z: pos.z, vx: Math.cos(a) * sp, vy: 0.3, vz: Math.sin(a) * sp, life: rr(1.2, 1.8), size: 0.5 * s, size1: 1.8 * s, sizePow: 0.5, color: [0.5, 0.47, 0.42, 0.55], color1: [0.5, 0.47, 0.42, 0], frame: FRAME.dusty + (i & 1), lit: true, drag: 3, ground: gy, soft: 0.3 });
      }
      P.spawn({ x: pos.x, y: gy + 0.06, z: pos.z, mode: 'flat', dir: [0, 1, 0], life: 0.4, size: 0.6, size1: radius * 1.8, sizePow: 0.5, color: [0.55, 0.52, 0.47, 0.35], color1: [0.55, 0.52, 0.47, 0], frame: FRAME.ring });
      this.decals.add(down.point, down.normal, { frame: DECAL.scorch, size: Math.min(2.2, radius * 0.35 + 0.4) * Math.max(0.6, s), alpha: 0.95, fit: false });
    }
    // 8. light (orange, ~0.35 s; a weaker glow lingers while the fireball burns), smoke interaction, screen kick
    const lc = acid ? 0x9aff60 : rubble ? 0xffe0b0 : 0xffa050;
    this.lights.flash(_t.set(pos.x, pos.y + 1, pos.z), lc, (rubble ? 120 : 400) * s, Math.max(10, radius * 2), 0.35);
    if (!rubble) this.lights.flash(_t.set(pos.x, pos.y + 1.4 * s, pos.z), acid ? 0x9aff60 : 0xff7a30, 40 * s, Math.max(8, radius * 1.6), 1.1, 0.15);
    this.smokes.blast(pos, Math.max(2.5, radius * 0.5), 1.5);
    const dc = pos.distanceTo(this.game.camera.position);
    if (dc < radius * 3) { const kf = Math.max(0, 1 - dc / (radius * 3)) * 0.6; this.screen.kick([kf, kf * 0.75, kf * 0.5], 0.18); }
  }

  /** Smoke grenade (CS2): carvable, lit, flood-filling volume. Returns the smoke handle. */
  smoke(pos, opts) { return this.smokes.spawn(pos, opts); }

  /** Molotov / incendiary fire spreading on the floor. Returns the inferno (inferno.stop()). */
  molotov(pos, opts) { return this.infernos.spawn(pos, opts); }

  /** Flashbang: world flash + white-out / afterimage for the local player depending on angle, range and cover. */
  flashbang(pos) {
    const P = this.particles;
    P.spawn({ additive: true, x: pos.x, y: pos.y, z: pos.z, life: 0.05, size: 3.6, size1: 4, color: [40, 40, 42, 1], color1: [10, 10, 12, 0], frame: FRAME.glow });
    P.spawn({ additive: true, x: pos.x, y: pos.y, z: pos.z, life: 0.08, size: 1.2, color: [20, 20, 22, 1], color1: [4, 4, 5, 0], frame: FRAME.star4, rot: R() * 6.28 });
    for (let i = 0; i < 3; i++) P.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: (R() - 0.5) * 0.6, vy: 0.3, vz: (R() - 0.5) * 0.6, delay: 0.04, life: 1.6, size: 0.3, size1: 1.2, sizePow: 0.5, color: [0.85, 0.85, 0.85, 0.35], color1: [0.85, 0.85, 0.85, 0], frame: FRAME.puff + i, lit: true, drag: 1.5 });
    this.lights.flash(pos, 0xf4f6ff, 900, 18, 0.12, 0.03);
    const cam = this.game.camera;
    const cp = _t.setFromMatrixPosition(cam.matrixWorld);
    const dist = cp.distanceTo(pos);
    const col = this.game.world.collision;
    if (col && col.blocked(cp, _v.copy(pos).addScaledVector(_v2.subVectors(cp, pos).normalize(), 0.15))) return;
    cam.getWorldDirection(_v2);
    const ang = Math.acos(THREE.MathUtils.clamp(_v2.dot(_v.subVectors(pos, cp).normalize()), -1, 1)) * 180 / Math.PI;
    const af = ang < 53 ? 1 : ang < 72 ? 0.45 / 1.88 + 0.35 : ang < 101 ? 0.12 : 0.05;
    const df = dist < 12 ? 1 : Math.max(0, 1 - (dist - 12) / 25);
    this.screen.flashbang(Math.min(1, af * df * 1.02));
  }

  // ------------------------------------------------------------------ premium-weapon toolkit (docs/FX.md)
  /** Energy beam (lasers, rail shots). See Ribbons.beam. */
  beam(from, to, opts) { return this.ribbons.beam(from, to, opts); }
  /** Lightning arc / chain (jagged, branching, re-generated). See Ribbons.bolt. */
  bolt(from, to, opts) { return this.ribbons.bolt(from, to, opts); }
  /** Ribbon trail (projectiles; blade slash trails when push(root, tip) is used). See Ribbons.trail. */
  trail(opts) { return this.ribbons.trail(opts); }

  /** Expanding ring. opts: normal (flat ring, e.g. UP for the ground) or null (camera-facing), r1, r0, life, color (HDR), thin. */
  shockwave(pos, { normal = null, r0 = 0.2, r1 = 3, life = 0.4, color = [3, 2, 1.2], thin = true, vm = false } = {}) {
    this.particles.spawn({ additive: true, vm, x: pos.x, y: pos.y, z: pos.z, mode: normal ? 'flat' : 'billboard', dir: normal ? [normal.x, normal.y, normal.z] : undefined,
      life, size: r0 * 2, size1: r1 * 2, sizePow: 0.5, color: [color[0], color[1], color[2], 1], color1: [color[0] * 0.3, color[1] * 0.3, color[2] * 0.3, 0], frame: thin ? FRAME.thinRing : FRAME.ring });
  }

  /** Coloured glowing tracer (energy rifles): tracer() with a fat glow and per-call colours. */
  glowTracer(from, to, { color = [2, 3.5, 9], glow = [0.8, 1.4, 4], width = 0.03, length = 4, speed = 300, start = 0.8 } = {}) {
    this.tracer(from, to, { color, glow, width, length, speed, start });
  }

  /** Spark / glint burst for energy impacts. */
  sparkBurst(pos, { color = [2, 3.5, 8], color1 = [0.4, 0.8, 3], count = 12, speed = 6, glow = 0.35, normal = null } = {}) {
    const P = this.particles;
    for (let i = 0; i < count; i++) {
      _t.set(R() - 0.5, R() - 0.5, R() - 0.5).normalize();
      if (normal && _t.dot(normal) < 0) _t.addScaledVector(normal, -2 * _t.dot(normal));
      const sp = speed * (0.4 + R() * 0.8);
      P.spawn({ additive: true, x: pos.x, y: pos.y, z: pos.z, vx: _t.x * sp, vy: _t.y * sp, vz: _t.z * sp, life: rr(0.15, 0.4), size: 0.012, stretch: 0.02, color: [color[0], color[1], color[2], 1], color1: [color1[0], color1[1], color1[2], 1], frame: FRAME.spark, gravity: 4, drag: 2 });
    }
    if (glow) P.spawn({ additive: true, x: pos.x, y: pos.y, z: pos.z, life: 0.1, size: glow, size1: glow * 1.3, color: [color[0], color[1], color[2], 1], color1: [color1[0], color1[1], color1[2], 0], frame: FRAME.glow });
    P.spawn({ additive: true, x: pos.x, y: pos.y, z: pos.z, life: 0.08, size: glow * 1.6, color: [color[0] * 0.8, color[1] * 0.8, color[2] * 0.8, 1], color1: [0, 0, 0, 0], frame: FRAME.glint, rot: R() * 6.28 });
  }

  /** Clears every transient effect (round restarts). */
  clear() {
    for (const l of this.particles.layers) l.clear();
    this.decals.clear();
  }
}
