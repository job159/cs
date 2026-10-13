// First-person viewmodel: gun + IK arms in camera space, procedural motion layers and action clips.
//
// Rendering: all viewmodel meshes live under the camera in the real scene (so they receive the real
// lights and shadows) but their materials project with `vmProj` (own FOV) and squeeze depth into the
// front of the depth buffer, so the gun never clips into walls.
//
// Pose pipeline per frame:
//   base   = blend(hip pose, ADS pose, aim)                       gun root transform in camera space
//   offset = sway + bob + breathing + landing + crouch + recoil + clip tracks  (rotations about the grip)
//   hands  = IK to anchors (sockets on the posed gun, the magazine, a pouch...), blended on switches
import * as THREE from 'three';
import { instanceGLB } from '../engine/assets.js';
import { applyHardSurface, materialUniforms, MATS, premiumWarmup } from '../gfx/materials.js';
import { initVmEnv, updateVmEnv } from '../gfx/vmenv.js';
import { tickPremium, presetsInUse } from '../gfx/premium.js';
import { WEAPONS } from '../weapons/defs.js';
import { ArmRig, basisQuat } from './ik.js';
import { ClipPlayer } from './clip.js';
import { rightGrip, mirrorGrip, LEFT_GRIPS, FREE_GRIPS, freeGrip } from './grips.js';
import { Spring3, damp, clamp, lerp, ease } from '../engine/util.js';

const D = Math.PI / 180;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const _arr = [0, 0, 0];
const _free = { pos: new THREE.Vector3(), F: new THREE.Vector3(), N: new THREE.Vector3(), grip: null };

// Part motion axes: 'x' | 'y' | 'z' (three, part-local = gun axes at rest), 's' | 't' | 'w' (gunkit), [s, t, w]
const AX = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1], w: [1, 0, 0], t: [0, 1, 0], s: [0, 0, -1] };
const axisOf = (a, def) => (Array.isArray(a) ? new THREE.Vector3(a[2], a[1], -a[0]) : new THREE.Vector3(...(AX[a] || AX[def]))).normalize();
const hashName = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0) / 4294967296; };

/**
 * Automatic motion of an fx_* part from its GLB extras (premium spec §1.7.1 idle: hover 2-4 mm over 2-3 s with
 * staggered phases, rings 20-40 deg/s). Keys (all optional, combinable):
 *   spin: axis, speed (rad/s, default 0.5) | rate (deg/s)        continuous rotation (setSpin scales it)
 *   step: deg, stepT (s, default 1), stepAxis                     clock-like ticks (sundial disc, hex plates)
 *   hover: amp m | true (3 mm), period (s, 2.5), hoverAxis         floating bob, phase from `order` / name
 *   open: deg (hinge about `hinge`, default 'x') | [s, t, w] m     opened by the part amount 0..1 (setPart,
 *   lift: m (< 0.5: slide up) | deg (>= 0.5: hinge about x)          clip scalar track `<part>`)
 *   swing: 'pendulum' | pendulum: true, len (m, 0.03)              hangs under its pivot, swings with the gun
 *   order: i                                                        stagger for setPart() on a prefix and hover
 */
function partMotion(name, ex) {
  if (!/(^|_)fx_/.test(name) || !ex) return null;
  const m = { phase: (ex.order ?? hashName(name) * 7) * 1.7 };
  if (ex.spin) { m.spin = axisOf(ex.spin, 'z'); m.omega = ex.speed ?? (ex.rate != null ? ex.rate * D : 0.5); }
  if (ex.step) { m.step = ex.step * D; m.stepT = ex.stepT ?? 1; m.stepAxis = axisOf(ex.stepAxis || 'z', 'z'); }
  if (ex.hover) { m.hover = typeof ex.hover === 'number' ? ex.hover : 0.003; m.period = ex.period ?? 2.5; m.hoverAxis = axisOf(ex.hoverAxis || 'y', 'y'); }
  if (Array.isArray(ex.open)) m.slide = new THREE.Vector3(ex.open[2], ex.open[1], -ex.open[0]);
  else if (typeof ex.open === 'number') { m.hinge = axisOf(ex.hinge || 'x', 'x'); m.angle = ex.open * D; }
  if (typeof ex.lift === 'number') {
    if (ex.lift < 0.5) m.slide = (m.slide || new THREE.Vector3()).add(new THREE.Vector3(0, ex.lift, 0));
    else if (!m.hinge) { m.hinge = axisOf('x'); m.angle = ex.lift * D; }
  }
  if (ex.swing === 'pendulum' || ex.pendulum) m.pend = { len: ex.len ?? 0.03, ax: 0, az: 0, vx: 0, vz: 0 };
  return m.spin || m.step || m.hover || m.slide || m.hinge || m.pend ? m : null;
}

/** A weapon model prepared for first person: parts, sockets, rest transforms. */
export class WeaponView {
  constructor(id, scene, def = {}) {
    this.id = id;
    this.root = scene;
    this.def = def;
    this.meta = {};
    scene.traverse((o) => { if (o.userData && o.userData.weapon) this.meta = o.userData; });
    this.parts = {};
    this.sockets = {};
    scene.traverse((o) => {
      if (o.name.startsWith('S_')) {
        this.sockets[o.name.slice(2)] = { pos: o.position.clone(), quat: o.quaternion.clone(), data: o.userData || {} };
      } else if (o.userData && o.userData.part) {
        this.parts[o.name] = { node: o, pos: o.position.clone(), quat: o.quaternion.clone(), scale: o.scale.clone(), extras: o.userData,
          base: o.name.replace(/^[LR]_/, ''), motion: partMotion(o.name, o.userData) };
      }
    });
    // dual wielding (§1.8.1, grip 'dual'): L_* / R_* part sets; 'muzzle' / 'eject' resolve to the gun firing next,
    // and the grip / muzzle / eject sockets of a side ride on its L_gun / R_gun part (per-hand recoil)
    this.dual = this.meta.grip === 'dual';
    this.side = 'r';
    if (this.dual) {
      for (const [k, s] of Object.entries(this.sockets)) {
        const side = k === 'grip_l' || /_l$/.test(k) ? 'L' : k === 'grip_r' || /_r$/.test(k) ? 'R' : null;
        if (side && this.parts[side + '_gun']) s.part = side + '_gun';
      }
    }
    const gr = this.sockets.grip_r?.pos, gl = this.sockets.grip_l?.pos;
    this.pivot = this.dual && gr && gl ? gr.clone().add(gl).multiplyScalar(0.5) : gr || null;
    // def.premium -> premium shader presets + PremiumState (gfx/premium.js); def.finish = { id, seed, float, counter }
    applyHardSurface(scene, { viewmodel: true, wear: def.wear ?? 1, premium: def.premium, finish: def.finish, counter: def.finish?.counter });
    this.premium = scene.userData.premiumState || null;   // drive with setMeter / setReady / fire / reloadStart...
    this.counter = scene.userData.killCounter || null;    // 斬數計: counter.kill({ boss })
    // emissive materials of this gun (clip `glow` events scale them; cached materials are shared, so the
    // viewmodel restores their base intensity when the gun is put away)
    const seen = new Set();
    this.glowMats = [];
    scene.traverse((o) => {
      const m = o.isMesh && o.material;
      if (!m || seen.has(m) || !(m.emissiveIntensity > 0) || !m.emissive || m.emissive.getHex() === 0) return;
      seen.add(m);
      this.glowMats.push({ m, base: MATS[m.userData.preset]?.glow ?? m.emissiveIntensity });
    });
    // grip rake from the grip_r socket rotation magnitude (authoring axis conventions vary)
    const g = this.sockets.grip_r;
    this.rake = g ? 2 * Math.acos(Math.min(1, Math.abs(g.quat.w))) : 18 * D;
    if (this.rake < 5 * D || this.rake > 40 * D) this.rake = 18 * D;
    // magazine drop copy for reload debris
    this.box = new THREE.Box3().setFromObject(scene);
  }
  socket(name) { return this.sockets[name] || (this.dual ? this.sockets[name + '_' + this.side] : undefined); }
  has(name) { return !!this.socket(name); }
  /** Part by name; dual guns resolve a bare name ('slide') to the side firing next ('R_slide'). */
  part(name) { return this.parts[name] || (this.dual ? this.parts[this.side.toUpperCase() + '_' + name] : undefined); }
  partName(name) { return this.parts[name] || !this.dual ? name : this.side.toUpperCase() + '_' + name; }
}

export class Viewmodel {
  constructor(game) {
    this.game = game;
    this.camera = game.camera;
    this.container = new THREE.Group();
    this.container.name = 'viewmodel';
    this.camera.add(this.container);
    this.gunRoot = new THREE.Group();
    this.container.add(this.gunRoot);
    this.vmCam = new THREE.PerspectiveCamera(52, 1, 0.01, 20);
    this.fov = 52;
    this.arms = null;
    this.weapon = null;
    this.aim = 0;            // 0 hip .. 1 ADS (smoothed)
    this.aimTarget = 0;
    this.sway = new Spring3(90, 12);
    this.swayPos = new Spring3(80, 11);
    this.kickPos = new Spring3(260, 18);
    this.kickRot = new Spring3(220, 15);
    this.land = new Spring3(110, 10);
    this.bobPhase = 0;
    this.bobAmp = 0;
    this.time = 0;
    this.clip = new ClipPlayer();
    this.clipWeight = 0;
    this.anchors = { R: { name: 'grip_r', from: null, t: 1, dur: 0 }, L: { name: 'grip_l', from: null, t: 1, dur: 0 } };
    this.handPos = { R: new THREE.Vector3(), L: new THREE.Vector3() };
    this.handQuat = { R: new THREE.Quaternion(), L: new THREE.Quaternion() };
    this.hip = { pos: new THREE.Vector3(0.11, -0.16, -0.30), rot: new THREE.Euler(1.2 * D, -2.5 * D, -2 * D) };
    this.partState = {};     // name -> { v (travel/angle 0..1), pos[], rot[] }
    this.lowered = 0;        // 0..1 holster amount (draw / switch)
    this.visible = true;
    this.inspect = 0;
    // premium layers (spec §1.7.2, §1.5.5). glowState is what clip `glow` events drive: `emissive` scales the gun's
    // glow_* materials here; pCharge / pRimStr / pFlash are read by the premium shader (and readyW for its ready boost)
    this.readyLayer = null;  // { breathMul 1.4, jitterHz 0.5, jitterDeg 0.6, glowMul 1.5, idleExtra } or null
    this.readyW = 0;         // smoothed 0..1 weight of the ready layer
    this.glowState = { emissive: 1, pCharge: 0.35, pRimStr: 0.8, pFlash: 0 };
    this.stateGlow = null;   // { pCharge, pRimStr } targets from the weapon state (arsenal), eased into glowState
    this._glowTw = [];
    this._glowMat = {};      // per material key emissive multiplier (glow events with `mat`)
    this.clipHide = 0;       // vmHide from the playing clip: 0 shown, 1 gun hidden, 2 gun + arms hidden
    this.hideT = 0; this.hideMode = 1;   // hideFor(): timed hide that outlives clips
    this.afterUpdate = null; // (dt) => void, runs once gun and hands are posed (arsenal: blade trails)
    this.handKick = { R: new Spring3(240, 15), L: new Spring3(240, 15) };  // dual: per-hand recoil (rad)
    this._follow = null;     // dual: the other hand's delayed sympathy kick
    this._swayOff = new THREE.Vector3();   // sway + bob offset of this frame (free hand anchors follow it)
    this._gunPrev = null; this._gunVel = new THREE.Vector3(); this._gunAcc = new THREE.Vector3();
  }

  async init() {
    // studio env map for every first-person material (§1.5.6); premium presets compile with the scene (§1.5.4)
    if (this.game.renderer?.gl) initVmEnv(this.game.renderer.gl);
    const arms = await instanceGLB('arms.glb');
    applyHardSurface(arms, { viewmodel: true });
    this.arms = new ArmRig(arms, this.container);
    const presets = presetsInUse(Object.values(WEAPONS));
    if (presets.length) premiumWarmup(this.container, { presets });
  }

  /** Studio reflections follow yaw, inspect fill (clip track `env` 0..1 or vm.inspect), premium state drive. */
  _updateEnv(dt) {
    const insp = Math.max(this.inspect || 0, this.clipWeight > 0.001 ? this.clip.sample('env') ?? 0 : 0);
    updateVmEnv(dt, { camera: this.camera, scene: this.game.scene, inspect: insp });
    const w = this.weapon;
    if (this._envWeapon !== w) { this._envWeapon?.counter?.dispose(); this._envWeapon = w; }
    const st = w?.premium;
    if (st) {
      // clip `glow` tweens and the arsenal's stateGlow (anim track) win over the state's own easing
      const tw = this._glowTw || [], sg = this.stateGlow, gs = this.glowState || {};
      const on = (u) => tw.some((t) => t.u === u && !t.mat) || sg?.[u] != null;
      st.override.pCharge = on('pCharge') ? gs.pCharge : null;
      st.override.pRimStr = on('pRimStr') ? gs.pRimStr : null;
      st.override.pFlash = gs.pFlash || 0;
      st.vmDriven = true;
    }
    tickPremium(dt);
  }

  async setWeapon(id, def = {}) { return this.useScene(id, await instanceGLB(`weapons/${id}.glb`), def); }

  /** Installs a loaded weapon scene (setWeapon; tests and procedural weapons pass their own). */
  useScene(id, scene, def = {}) {
    this._resetPremium();
    if (this.weapon) this.gunRoot.remove(this.weapon.root);
    const w = new WeaponView(id, scene, def);
    this.weapon = w;
    this.gunRoot.add(w.root);
    this.partState = {};
    const vm = def.vm || {};
    const grip = w.meta.grip || 'rifle';
    // default hip placement by grip class (position of the grip_r socket in camera space)
    const HIP = {
      pistol: [0.095, -0.13, -0.33, 1.5, -4, -1],
      rifle: [0.135, -0.165, -0.35, 1.5, -4.5, -3],
      bullpup: [0.13, -0.165, -0.25, 1.5, -4.5, -3],
      mg: [0.14, -0.18, -0.33, 1.5, -4.5, -3.5],
      heavy: [0.14, -0.19, -0.3, 1.0, -4, -2],
      melee: [0.12, -0.17, -0.3, 10, -12, -10],
      bow: [0.0, -0.1, -0.35, 0, 0, 0],
      dual: [0.0, -0.14, -0.33, 1.5, 0, 0],   // dual: the midpoint between the two grips
    }[grip] || [0.105, -0.17, -0.27, 1, -2.5, -2];
    const h = vm.hip || HIP;
    this.hip.pos.set(h[0], h[1], h[2]);
    this.hip.rot.set((h[3] ?? 1) * D, (h[4] ?? -2.5) * D, (h[5] ?? -2) * D);
    this.adsRelief = vm.relief ?? (w.has('optic') ? 0.2 : grip === 'pistol' ? 0.27 : 0.17);
    this.supportGrip = LEFT_GRIPS[w.meta.support] || LEFT_GRIPS.handguard;
    this.rightGrip = rightGrip(this.rake);
    // dual: each hand holds its own pistol one-handed, the left one mirrored
    if (w.dual) { this.rightGrip.pose = 'gripOne'; this.supportGrip = mirrorGrip(this.rightGrip); }
    this._computeAds();
    this.setAnchor('R', 'grip_r', 0);
    this.setAnchor('L', w.meta.support === 'none' || !w.has('grip_l') ? 'rest' : 'grip_l', 0);
    this.arms.setPose('R', this.rightGrip.pose, 0);
    this.arms.setPose('L', this.supportGrip.pose, 0);
    return w;
  }

  get rake() { return this.weapon ? this.weapon.rake : 18 * D; }

  /** ADS transform: sight line on the camera axis, rear sight / optic `adsRelief` in front of the eye. */
  _computeAds() {
    const w = this.weapon;
    const ads = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
    let rear, front;
    if (w.has('optic')) { rear = w.socket('optic').pos.clone(); front = rear.clone().add(new THREE.Vector3(0, 0, -0.2)); }
    else if (w.has('sight_rear') && w.has('sight_front')) { rear = w.socket('sight_rear').pos.clone(); front = w.socket('sight_front').pos.clone(); }
    else { rear = new THREE.Vector3(0, 0.06, 0); front = new THREE.Vector3(0, 0.06, -0.4); }
    const dir = front.clone().sub(rear).normalize();
    ads.quat.setFromUnitVectors(dir, new THREE.Vector3(0, 0, -1));
    ads.pos.set(0, 0, -this.adsRelief).sub(rear.clone().applyQuaternion(ads.quat));
    this.ads = ads;
  }

  /** Switches a hand to an anchor with a blend: grip_r, grip_l, magwell, mag, charge, pouch, rest, shell... */
  setAnchor(side, name, dur = 0.15) {
    const a = this.anchors[side];
    if (a.name === name) return;
    a.from = { pos: this.handPos[side].clone(), quat: this.handQuat[side].clone() };
    a.name = name; a.t = dur > 0 ? 0 : 1; a.dur = dur;
    // free grips bring their own finger pose (palm / grenade / point)
    const fg = name && typeof name === 'object' ? name : FREE_GRIPS[name];
    if (fg) this.arms?.setPose(side, fg.pose || 'relaxed', Math.max(0.08, dur));
  }

  // ------------------------------------------------------------------ socket queries (world space)

  /** Socket position in gun space, following the part it rides on (dual: L_gun / R_gun recoil). */
  _socketGun(s, out) {
    out.copy(s.pos);
    const p = s.part && this.weapon.parts[s.part];
    if (p) out.sub(p.pos).applyQuaternion(_q.copy(p.quat).invert().premultiply(p.node.quaternion)).add(p.node.position);
    return out;
  }

  /** True world position of a socket on the first-person gun (lights, sounds). */
  socketWorld(name, out = new THREE.Vector3()) {
    const s = this.weapon?.socket(name);
    if (!s) return null;
    return this._socketGun(s, out).applyMatrix4(this.weapon.root.matrixWorld);
  }

  /** Socket position in camera space (viewmodel-layer particles and ribbons are children of the camera). */
  socketCam(name, out = new THREE.Vector3()) {
    const s = this.weapon?.socket(name);
    if (!s) return null;
    return this._socketGun(s, out).applyMatrix4(this.weapon.root.matrix).applyMatrix4(this.gunRoot.matrix).applyMatrix4(this.container.matrix);
  }

  /** World direction of the gun's barrel (-Z of the gun root). */
  socketDir(name, out = new THREE.Vector3()) {
    return out.set(0, 0, -1).applyQuaternion(this.gunRoot.getWorldQuaternion(_q));
  }

  /**
   * Where a socket APPEARS in the world: the viewmodel is drawn with its own FOV, so its true position
   * does not line up with world-space effects. Re-project through the world camera at the same depth.
   */
  socketApparent(name, out = new THREE.Vector3()) {
    if (!this.socketWorld(name, out)) return null;
    const cam = this.camera;
    out.applyMatrix4(cam.matrixWorldInverse);           // camera space
    const z = out.z;
    const vp = this.vmCam.projectionMatrix.elements, wp = cam.projectionMatrix.elements;
    out.x *= vp[0] / wp[0];
    out.y *= vp[5] / wp[5];
    out.z = z;
    return out.applyMatrix4(cam.matrixWorld);
  }

  // ------------------------------------------------------------------ actions

  /** Plays an action clip; returns a promise resolved at the end. */
  play(clip, { duration, onEvent } = {}) {
    this._resolve?.();          // the interrupted clip's promise settles too
    this._resolve = null;
    this.clipHide = 0;          // vmHide is scoped to the clip that set it
    return new Promise((resolve) => {
      this.clip.play(clip, {
        duration,
        onEvent: (name, arg) => {
          if (name === 'anchorL') this.setAnchor('L', arg[0], arg[1] ?? 0.15);
          else if (name === 'anchorR') this.setAnchor('R', arg[0], arg[1] ?? 0.15);
          else if (name === 'poseL') this.arms.setPose('L', arg, 0.12);
          else if (name === 'poseR') this.arms.setPose('R', arg, 0.12);
          onEvent?.(name, arg);
        },
      });
      this._resolve = resolve;
    });
  }
  stopClip() {
    this.clip.stop(); this._resolve?.(); this._resolve = null; this.clipHide = 0;
    this.setAnchor('L', this.defaultLeft(), 0.15); this.setAnchor('R', 'grip_r', 0.1);
    // an interrupted clip may have left a reload / gesture finger pose behind
    if (this.arms && this.supportGrip) { this.arms.setPose('L', this.supportGrip.pose, 0.12); this.arms.setPose('R', this.rightGrip?.pose || 'grip', 0.1); }
  }
  defaultLeft() { return this.weapon && this.weapon.has('grip_l') && this.weapon.meta.support !== 'none' ? 'grip_l' : 'rest'; }

  /** Per-shot recoil impulse (viewmodel only; the camera kick is applied by the weapon logic). */
  kick({ back = 0.035, up = 4, side = 0.8, roll = 2.5 } = {}) {
    const ads = 1 - this.aim * 0.55;
    const w = this.weapon;
    // dual (§1.8.1): the firing hand rises 6-9 deg and turns out 2 deg, the other follows 1 deg 50 ms later;
    // the next shot comes from the other gun (the side flips at the start of the next update)
    const k = w?.dual ? 0.35 : 1;
    if (w?.dual) {
      const S = w.side === 'l' ? 'L' : 'R', out = S === 'R' ? -1 : 1;
      // impulse (rad/s) = 36 x the target peak angle (the 240 / 15 spring peaks ~28 ms later, measured)
      this.handKick[S].impulse((6 + Math.random() * 3) * D * 36, out * 2 * D * 36, 0);
      this._follow = { S: S === 'R' ? 'L' : 'R', t: 0.05, out: -out };
      this._dualFlip = true;
    }
    this.kickPos.impulse((Math.random() - 0.5) * 0.12 * ads * k, 0.05 * ads * k, back * 30 * ads * k);
    this.kickRot.impulse(up * D * 18 * ads * k, (Math.random() - 0.5) * side * D * 30 * ads * k, (Math.random() - 0.5) * roll * D * 30 * ads * k);
  }

  /** Animates a part for a short reciprocation (bolt / slide on each shot). */
  cycle(part, dur = 0.07) {
    part = this.weapon?.partName(part) ?? part;
    const ps = this.partState[part] || (this.partState[part] = { v: 0 });
    ps.cycle = dur; ps.cycleT = 0;
  }

  // ------------------------------------------------------------------ premium layers (PREMIUM_WEAPONS §1.7.2, §4.2 row 0.3)

  /** Ready overlay layer on top of idle / attacks (no separate animation set): null switches it off. */
  setReadyLayer(layer) { if (layer) this._layer = layer; this.readyLayer = layer || null; }

  /**
   * Glow tween (clip event `glow`). u: 'emissive' (default; multiplier on the gun's glow_* materials, `mat`
   * limits it to one material key) or a premium shader state 'pCharge' | 'pRimStr' | 'pFlash'.
   */
  glowTo(to, sec = 0.2, { u = 'emissive', mat = null } = {}) {
    const key = u + ':' + (mat || '');
    const cur = mat ? this._glowMat[mat] ?? 1 : this.glowState[u] ?? 0;
    this._glowTw = this._glowTw.filter((t) => t.key !== key);
    this._glowTw.push({ key, u, mat, from: cur, to, t: 0, dur: Math.max(0, sec) });
  }

  /**
   * Opens an fx_* part (extras `open` / `lift`) to v 0..1 over sec. `name` ending in '*' drives every part with
   * that prefix, each delayed by its extras.order × stagger (fins rising one after another).
   */
  setPart(name, v, sec = 0.25, stagger = 0.03) {
    const w = this.weapon;
    if (!w) return;
    const names = name.endsWith('*') ? Object.keys(w.parts).filter((k) => k.startsWith(name.slice(0, -1))) : [w.partName(name)];
    for (const k of names) {
      const ps = this.partState[k] || (this.partState[k] = { v: 0 });
      ps.tw = { from: ps.v || 0, to: v, t: -(w.parts[k]?.extras?.order ?? 0) * (name.endsWith('*') ? stagger : 0), dur: Math.max(1e-3, sec) };
    }
  }
  /** Scales an fx_* part's spin rate (eased); 0 stops it. */
  setSpin(name, mul) { const k = this.weapon?.partName(name) ?? name; (this.partState[k] || (this.partState[k] = { v: 0 })).spinMul = mul; }
  /** Hides the gun (mode 1) or gun + arms (mode 2) for sec seconds, independent of clips (summons). */
  hideFor(sec, mode = 1) { this.hideT = sec; this.hideMode = mode; }

  /** Puts the current gun's shared materials back and clears per-weapon premium state. */
  _resetPremium() {
    for (const g of this.weapon?.glowMats || []) g.m.emissiveIntensity = g.base;
    this.readyLayer = null; this.readyW = 0;
    this.glowState = { emissive: 1, pCharge: 0.35, pRimStr: 0.8, pFlash: 0 };
    this._glowTw = []; this._glowMat = {}; this.stateGlow = null;
    this.clipHide = 0; this.hideT = 0;
    this.handKick.R.reset(); this.handKick.L.reset(); this._follow = null; this._dualFlip = false;
  }

  _updateGlow(dt) {
    const tw = this._glowTw;
    // weapon state (§1.5.5, set by the arsenal) eases pCharge / pRimStr; a running clip tween wins
    const sg = this.stateGlow;
    if (sg) for (const u in sg) if (!tw.some((t) => t.u === u && !t.mat)) this.glowState[u] = damp(this.glowState[u] ?? sg[u], sg[u], 14, dt);
    for (let i = tw.length - 1; i >= 0; i--) {
      const t = tw[i];
      t.t += dt;
      const u = t.dur > 0 ? Math.min(1, t.t / t.dur) : 1;
      const v = t.from + (t.to - t.from) * ease.inOutQuad(u);
      if (t.mat) this._glowMat[t.mat] = v; else this.glowState[t.u] = v;
      if (u >= 1) tw.splice(i, 1);
    }
    const ready = 1 + ((this._layer?.glowMul ?? 1.5) - 1) * this.readyW;
    const e = this.glowState.emissive * ready;
    for (const g of this.weapon.glowMats) g.m.emissiveIntensity = g.base * e * (this._glowMat[g.m.userData.preset] ?? 1);
  }

  /** Two-axis damped pendulum hanging under the part's pivot: apparent gravity (gravity - gun acceleration). */
  _pendulum(p, node, dt) {
    // world gravity -> camera space -> gun space
    _v3.set(0, -9.8, 0).applyQuaternion(_q2.copy(this.camera.quaternion).invert()).sub(this._gunAcc)
      .applyQuaternion(_q2.copy(this.gunRoot.quaternion).invert());
    const gl = Math.max(1, _v3.length());
    const eqX = Math.atan2(-_v3.z, -_v3.y), eqZ = Math.atan2(_v3.x, -_v3.y);
    const w2 = gl / p.len, c = 2 * 0.12 * Math.sqrt(w2);
    const n = Math.max(1, Math.ceil(dt * Math.sqrt(w2) / 0.15)), h = dt / n;
    for (let i = 0; i < n; i++) {
      p.vx += (w2 * Math.sin(eqX - p.ax) - c * p.vx) * h; p.ax += p.vx * h;
      p.vz += (w2 * Math.sin(eqZ - p.az) - c * p.vz) * h; p.az += p.vz * h;
    }
    p.ax = clamp(p.ax, -1.2, 1.2); p.az = clamp(p.az, -1.2, 1.2);
    node.quaternion.multiply(_q.setFromEuler(_e.set(p.ax, 0, p.az, 'XZY')));
  }

  // ------------------------------------------------------------------ frame

  update(dt, ctx) {
    if (!this.weapon || !this.arms) return;
    this.time += dt;
    materialUniforms.time.value = this.time;
    const w = this.weapon;
    this.clip.update(dt);
    if (this.clip.done && this._resolve) { const r = this._resolve; this._resolve = null; r(); }
    const clipOn = this.clip.active;
    this.clipWeight = damp(this.clipWeight, clipOn ? 1 : 0, clipOn ? 30 : 12, dt);
    if (!clipOn) this.clipHide = 0;
    this.hideT = Math.max(0, this.hideT - dt);
    this.readyW = damp(this.readyW, this.readyLayer ? 1 : 0, 4, dt);
    // quick-throw dip (Throwables sets `dip`): the gun ducks out of the way and comes back up
    this.dip = Math.max(0, (this.dip || 0) - dt * 1.4);
    this.lowered = damp(this.lowered, this.dip, 18, dt);
    if (w.dual) {
      if (this._dualFlip) { w.side = w.side === 'r' ? 'l' : 'r'; this._dualFlip = false; }
      const f = this._follow;
      if (f && (f.t -= dt) <= 0) { this.handKick[f.S].impulse(1 * D * 36, f.out * 0.5 * D * 36, 0); this._follow = null; }
    }

    // aim
    this.aim = damp(this.aim, this.aimTarget, this.aimTarget > this.aim ? 14 : 12, dt);
    const aim = this.aim;
    const hipW = 1 - aim * 0.85;

    // sway from look input (opposite to the turn), clamped
    const lx = clamp(ctx.lookX * 60, -6, 6), ly = clamp(ctx.lookY * 60, -6, 6);
    this.sway.target.set(-ly * 0.9 * D, -lx * 1.4 * D, -lx * 0.9 * D);
    this.swayPos.target.set(-lx * 0.004, ly * 0.003, 0);
    const sway = this.sway.update(dt), swayP = this.swayPos.update(dt);

    // walk bob (figure eight) scaled by ground speed
    const spd = ctx.onGround ? Math.min(1, ctx.speed / 5) : 0;
    this.bobAmp = damp(this.bobAmp, spd, 8, dt);
    this.bobPhase += dt * (ctx.speed * 1.75 + 0.2);
    const b = this.bobAmp * hipW;
    const bobX = Math.sin(this.bobPhase) * 0.0085 * b;
    const bobY = -Math.abs(Math.cos(this.bobPhase)) * 0.009 * b + 0.004 * b;
    const bobRoll = Math.sin(this.bobPhase) * 1.4 * D * b;
    const L = this._layer || {}, rw = this.readyW;   // ready layer: deeper breathing + a slow tremor
    const breathe = Math.sin(this.time * 1.7) * 0.0012 * hipW * (1 + ((L.breathMul ?? 1.4) - 1) * rw);
    if (ctx.landImpact > 2) this.land.impulse(0, -Math.min(ctx.landImpact, 12) * 0.03, 0);
    const land = this.land.update(dt);
    const kp = this.kickPos.update(dt), kr = this.kickRot.update(dt);
    const crouch = ctx.crouch || 0;
    const strafeRoll = -ctx.moveX * 2.2 * D * hipW;

    // base pose: hip <-> ADS
    const hipQ = _q.setFromEuler(this.hip.rot);
    const grip = w.pivot || _v2.set(0, -0.05, 0);
    const hipPos = _v.copy(this.hip.pos).sub(_v2.copy(grip).applyQuaternion(hipQ));
    const baseQ = _q2.copy(hipQ).slerp(this.ads.quat, ease.inOutQuad(aim));
    const basePos = hipPos.lerp(this.ads.pos, ease.inOutQuad(aim));

    // offsets (applied in camera space, rotations about the grip)
    let ox = swayP.x * hipW + bobX + kp.x * 0.01, oy = swayP.y * hipW + bobY + breathe + land.y * hipW - crouch * 0.012 * hipW + kp.y * 0.01, oz = kp.z * 0.001 * 30;
    let rx = sway.x * hipW + kr.x + crouch * 1.5 * D * hipW, ry = sway.y * hipW + kr.y, rz = sway.z * hipW + kr.z + bobRoll + strafeRoll - crouch * 4 * D * hipW;
    oz = kp.z;
    if (rw > 0.001) {
      const ph = this.time * 2 * Math.PI * (L.jitterHz ?? 0.5), j = (L.jitterDeg ?? 0.6) * D * rw * hipW;
      rx += Math.sin(ph) * j; ry += Math.sin(ph * 1.31 + 1.7) * j * 0.7; rz += Math.sin(ph * 0.77 + 0.4) * j * 0.5;
    }
    this._swayOff.set(ox, oy, oz);
    if (this.clipWeight > 0.001) {
      const cw = this.clipWeight;
      const p = this.clip.sample('gunPos', _arr);
      if (p) { ox += p[0] * cw; oy += p[1] * cw; oz += p[2] * cw; }
      const r = this.clip.sample('gunRot', _arr);
      if (r) { rx += r[0] * D * cw; ry += r[1] * D * cw; rz += r[2] * D * cw; }
    }
    // holster / draw: drop and tilt the gun down out of view
    const lw = this.lowered;
    oy -= lw * 0.25; rx -= lw * 35 * D; rz += lw * 10 * D;

    // compose: gun = T(base + o) * T(pivot) * R(offset) * T(-pivot) * R(base)... implemented in camera space
    const offQ = _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ'));
    const pivotCam = _v2.copy(grip).applyQuaternion(baseQ).add(basePos); // grip position in camera space
    const gr = this.gunRoot;
    gr.quaternion.copy(offQ).multiply(baseQ);
    gr.position.copy(basePos).sub(pivotCam).applyQuaternion(offQ).add(pivotCam);
    gr.position.x += ox; gr.position.y += oy; gr.position.z += oz;
    gr.updateMatrix();
    // gun acceleration in camera space (pendulum parts swing from it)
    if (this._gunPrev && dt > 1e-4) {
      _v3.subVectors(gr.position, this._gunPrev).divideScalar(dt);
      this._gunAcc.lerp(_v.subVectors(_v3, this._gunVel).divideScalar(dt).clampLength(0, 60), Math.min(1, dt * 30));
      this._gunVel.copy(_v3);
    }
    (this._gunPrev ||= new THREE.Vector3()).copy(gr.position);

    this._updateParts(dt);
    w.root.updateMatrixWorld(true);
    this._updateHands(dt);
    this.arms.update(dt);
    this._updateGlow(dt);
    this._updateEnv(dt);

    // viewmodel projection
    const cam = this.camera;
    this.vmCam.aspect = cam.aspect;
    this.vmCam.fov = this.fov - aim * (this.weapon.has('optic') ? 12 : 8);
    this.vmCam.updateProjectionMatrix();
    materialUniforms.vmProj.value.copy(this.vmCam.projectionMatrix);
    this.container.visible = this.visible;
    const hide = Math.max(this.clipHide, this.hideT > 0 ? this.hideMode : 0);
    gr.visible = hide < 1;
    this.arms.model.visible = hide < 2;
    this.afterUpdate?.(dt);
  }

  _updateParts(dt) {
    const w = this.weapon;
    const clipW = this.clipWeight > 0.001;
    for (const [name, part] of Object.entries(w.parts)) {
      const ps = this.partState[name] || (this.partState[name] = { v: 0 });
      if (ps.tw) {
        // setPart() tween (staggered parts start with a negative t)
        const tw = ps.tw;
        tw.t += dt;
        const u = clamp(tw.t / tw.dur, 0, 1);
        ps.v = tw.from + (tw.to - tw.from) * (tw.to > tw.from ? ease.outBack(u, 1.4) : ease.inOutCubic(u));
        if (u >= 1) { ps.v = tw.to; ps.tw = null; }
      }
      let v = ps.v || 0;
      if (ps.cycle) {
        ps.cycleT += dt;
        const u = ps.cycleT / ps.cycle;
        v = Math.max(v, u < 0.35 ? u / 0.35 : Math.max(0, 1 - (u - 0.35) / 0.65));
        if (u >= 1) ps.cycle = 0;
      }
      const tv = clipW ? this.clip.sample(name, undefined) : undefined;
      if (typeof tv === 'number') v = Math.max(v, tv);
      const node = part.node;
      node.position.copy(part.pos);
      node.quaternion.copy(part.quat);
      node.scale.copy(part.scale);
      const ex = part.extras || {};
      const base = part.base;   // dual guns: 'R_slide' moves like 'slide'
      if (base === 'bolt' || base === 'slide' || base === 'pump') {
        node.position.z += v * (ex.travel ?? 0.08);
        if (ex.lift && base === 'bolt') {
          // bolt-action: lift the handle first (first 35 % of travel), then slide
          const lift = Math.min(1, v / 0.35), slide = Math.max(0, (v - 0.35) / 0.65);
          node.position.copy(part.pos); node.position.z += slide * (ex.travel ?? 0.09);
          node.quaternion.multiply(_q.setFromAxisAngle(_v.set(0, 0, 1), lift * ex.lift * D));
        }
      } else if (base === 'trigger') node.quaternion.multiply(_q.setFromAxisAngle(_v.set(1, 0, 0), -v * 14 * D));
      else if (base === 'hammer') node.quaternion.multiply(_q.setFromAxisAngle(_v.set(1, 0, 0), v * 40 * D));
      else if (base === 'cover') node.quaternion.multiply(_q.setFromAxisAngle(_v.set(1, 0, 0), v * 75 * D));
      else if (base === 'breech') node.quaternion.multiply(_q.setFromAxisAngle(_v.set(1, 0, 0), -v * 32 * D));
      else if (base === 'crane') node.quaternion.multiply(_q.setFromAxisAngle(_v.set(0, 0, 1), v * 80 * D));
      else if (base === 'barrels' || base === 'cylinder') node.quaternion.multiply(_q.setFromAxisAngle(_v.set(0, 0, 1), ps.spin || 0));
      else if (base === 'gun' && w.dual) {
        // per-hand recoil of a dual gun about its grip pivot
        const k = this.handKick[name[0]]?.update(dt);
        if (k) node.quaternion.multiply(_q.setFromEuler(_e.set(k.x, k.y, 0)));
      }
      const mo = part.motion;
      if (mo) {
        // fx_* automatic motions (GLB extras): open amount v drives hinge / slide; idle hover, spin, ticks, pendulum
        if (mo.hover) node.position.addScaledVector(mo.hoverAxis, Math.sin(this.time * 2 * Math.PI / mo.period + mo.phase) * mo.hover * (ps.hoverMul ?? 1));
        if (mo.slide) node.position.addScaledVector(mo.slide, v);
        if (mo.hinge) node.quaternion.multiply(_q.setFromAxisAngle(mo.hinge, v * mo.angle));
        if (mo.spin) {
          ps.spinW = damp(ps.spinW ?? ps.spinMul ?? 1, ps.spinMul ?? 1, 3, dt);
          ps.spinA = ((ps.spinA || 0) + mo.omega * ps.spinW * dt) % (Math.PI * 2);
          node.quaternion.multiply(_q.setFromAxisAngle(mo.spin, ps.spinA));
        }
        if (mo.step) {
          ps.stepT = (ps.stepT || 0) + dt * (ps.spinMul ?? 1);
          const i = Math.floor(ps.stepT / mo.stepT), f = Math.min(1, (ps.stepT - i * mo.stepT) / Math.min(0.14, mo.stepT * 0.5));
          node.quaternion.multiply(_q.setFromAxisAngle(mo.stepAxis, ((i + ease.outBack(f, 2)) * mo.step) % (Math.PI * 2)));
        }
        if (mo.pend) this._pendulum(mo.pend, node, dt);
      }
      // free-form offsets from clips: <part>.pos (m, gun space), <part>.rot (deg), <part>.scale, <part>.vis
      let vis;
      if (clipW) {
        const p = this.clip.sample(name + '.pos', _arr);
        if (p) { node.position.x += p[0]; node.position.y += p[1]; node.position.z += p[2]; }
        const r = this.clip.sample(name + '.rot', _arr);
        if (r) node.quaternion.multiply(_q.setFromEuler(_e.set(r[0] * D, r[1] * D, r[2] * D)));
        const s = this.clip.sample(name + '.scale', _arr);
        if (typeof s === 'number') node.scale.multiplyScalar(s);
        else if (s) { node.scale.x *= s[0]; node.scale.y *= s[1]; node.scale.z *= s[2]; }
        vis = this.clip.sample(name + '.vis');
      }
      node.visible = typeof vis === 'number' ? vis > 0.5 : !ps.hidden;
    }
  }

  /** World(container)-space wrist transform for a hand anchor. */
  _anchorTransform(side, name, outPos, outQuat) {
    const w = this.weapon;
    const gm = this.gunRoot.matrix; // gun root in container space
    const gq = this.gunRoot.quaternion;
    let F, N, palm, socketPos;
    if (name === 'rest' || !name) {
      // hand lowered out of view
      outPos.set(side === 'L' ? -0.2 : 0.2, -0.42, -0.12);
      basisQuat(_v.set(0, 0.2, -1), _v2.set(side === 'L' ? 0.7 : -0.7, 0.3, 0), outQuat);
      return;
    }
    if (name === 'pouch') {
      outPos.set(-0.16, -0.46, -0.05);
      basisQuat(_v.set(0.2, -0.6, -0.8), _v2.set(0.8, 0, 0.3), outQuat);
      return;
    }
    const fg = freeGrip(name, side, _free);
    if (fg) {
      // camera-space gesture / held-item anchor riding on this frame's sway and bob
      basisQuat(fg.F, _v3.copy(fg.N).negate(), outQuat);
      outPos.copy(fg.pos).add(this._swayOff).addScaledVector(fg.N, -fg.grip.palm[0]).addScaledVector(fg.F, -fg.grip.palm[1]);
      return;
    }
    let gripDef;
    let rel = null;   // dual: rotation of the hand's gun part away from its rest pose
    if (w.dual && (name === 'grip_r' || name === 'grip_l')) {
      const s = w.socket(name), p = s?.part && w.parts[s.part];
      if (p) {
        gripDef = name === 'grip_r' ? this.rightGrip : this.supportGrip;
        socketPos = this._socketGun(s, new THREE.Vector3());
        rel = _q2.copy(p.quat).invert().premultiply(p.node.quaternion);
      }
    }
    const partPos = (pname, sock) => {
      // live position of a moving part (optionally at a socket that moves with it), gun space
      const part = w.parts[pname];
      if (!part) return null;
      const ref = sock && w.socket(sock) ? w.socket(sock).pos : part.pos;
      return ref.clone().sub(part.pos).applyQuaternion(part.node.quaternion).add(part.node.position);
    };
    if (gripDef) { /* dual grip resolved above */ }
    else if (name === 'grip_r') { gripDef = this.rightGrip; socketPos = w.socket('grip_r')?.pos; }
    else if (name === 'grip_l') {
      gripDef = this.supportGrip; socketPos = w.socket('grip_l')?.pos?.clone();
      // the support hand rides on a pump forend
      if (socketPos && w.parts.pump) socketPos.z += (this.partState.pump?.v || 0) * (w.parts.pump.extras.travel ?? 0.08);
    }
    else if (name === 'mag') { gripDef = LEFT_GRIPS.mag; socketPos = partPos('mag', 'magwell'); }
    else if (name === 'shell') { gripDef = LEFT_GRIPS.shell; socketPos = partPos('shell') || w.socket('eject')?.pos; }
    else if (name === 'muzzle') { gripDef = LEFT_GRIPS.shell; socketPos = w.socket('muzzle')?.pos; }
    else if (name === 'pistol_cup') { gripDef = LEFT_GRIPS.pistol_cup; socketPos = w.socket('grip_l')?.pos || w.socket('grip_r')?.pos; }
    else if (name === 'charge') {
      gripDef = side === 'R' ? LEFT_GRIPS.boltR : (w.meta.chargeSide === 'left' ? LEFT_GRIPS.chargeLeft : LEFT_GRIPS.charge);
      const c = w.socket('charge');
      socketPos = c ? c.pos.clone() : null;
      if (c && w.parts.bolt) {
        const bp = partPos('bolt', 'charge');
        if (bp) socketPos = bp;
      }
    } else {
      gripDef = LEFT_GRIPS[name] || LEFT_GRIPS.handguard;
      socketPos = w.socket(name)?.pos;
    }
    if (!socketPos) socketPos = w.socket('grip_l')?.pos || new THREE.Vector3(0, -0.03, -0.25);
    F = _v.copy(gripDef.F);
    N = _v2.copy(gripDef.N);
    if (rel) { F.applyQuaternion(rel); N.applyQuaternion(rel); }
    F.applyQuaternion(gq);
    N.applyQuaternion(gq);
    const sp = socketPos.clone().applyMatrix4(gm);
    // hand basis: -Z = fingers, -Y = palm normal
    const up = N.clone().negate();
    basisQuat(F, up, outQuat);
    // mirror for the left hand: the left model is mirrored in X, so its palm normal convention is identical
    palm = gripDef.palm;
    outPos.copy(sp).addScaledVector(N, -palm[0]).addScaledVector(F, -palm[1]);
  }

  _updateHands(dt) {
    for (const side of ['R', 'L']) {
      const a = this.anchors[side];
      const pos = this.handPos[side], quat = this.handQuat[side];
      this._anchorTransform(side, a.name, pos, quat);
      if (a.t < 1 && a.from) {
        a.t = Math.min(1, a.t + dt / a.dur);
        const u = ease.inOutCubic(a.t);
        pos.lerpVectors(a.from.pos, pos, u);
        quat.slerpQuaternions(a.from.quat, quat, u);
      }
      this.arms.solve(side, pos, quat);
    }
  }
}
