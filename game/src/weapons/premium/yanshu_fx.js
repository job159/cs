// 焰樞．破限 effect pieces (weapons/premium/yanshu.js drives them): the two 隼翼 falcon drones in the viewmodel layer
// (camera space: they hover over the shoulders, follow the gun on springs, scan, shoot, dock beside the ram, perch over the
// palm), the world-space mini drones of the 分機 aura, the square forge crown, the round's burst, the 爐環 fire wall, the
// inhale streaks, fin steam, the holographic furnace gauge (rare idle), the flying seal and the 爐壁護盾 hex wall.
// Every random visual takes an rng so a networked skill replays the same on every client.
import * as THREE from 'three';
import { instanceGLB } from '../../engine/assets.js';
import { applyHardSurface } from '../../gfx/materials.js';
import { FRAME } from '../../fx/fx.js';

const V3 = () => new THREE.Vector3();
const _a = V3(), _b = V3(), _c = V3(), _d = V3(), _e = V3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _eu = new THREE.Euler();
const R = Math.random, TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

// palette (HDR linear)
export const C = {
  ORANGE: [3.6, 1.55, 0.32], HOT: [5.2, 4.6, 3.4], CYAN: [0.7, 2.8, 4.2], SPARK: [3.6, 2.5, 1.0], DEEP: [0.9, 0.28, 0.04], GOLD: [3.6, 2.6, 0.7], RED: [3.4, 0.7, 0.15],
};
const HOLO = '#3fd8ff';
/** world FX brightness against the map's exposure (Lost Town 1.6 turned additive orange cream) */
export const ek = (g) => 1 / Math.pow(Math.max(1, g.renderer?.post?.exposure ?? 1), 0.85);

// ------------------------------------------------------------------------------------------ camera-space helpers
/** a container-space point (viewmodel layer) -> camera space */
export function camOf(g, p, out = V3()) { return out.copy(p).applyMatrix4(g.vm.container.matrix); }
/** where a camera-space point APPEARS in the world (the viewmodel has its own FOV): same depth, re-projected */
export function apparent(g, cp, out = V3()) {
  const vm = g.vm, cam = g.camera, vp = vm.vmCam.projectionMatrix.elements, wp = cam.projectionMatrix.elements;
  out.set(cp.x * vp[0] / wp[0], cp.y * vp[5] / wp[5], cp.z);
  cam.updateMatrixWorld();
  return out.applyMatrix4(cam.matrixWorld);
}
/** world point -> camera space (for aiming a viewmodel drone at a world target) */
const _qi = new THREE.Quaternion(), _cp = V3();
export function toCam(g, p, out = V3()) {
  // from the camera's live transform (its matrixWorldInverse is last frame's until the render: stepped frames read it stale)
  const cam = g.camera;
  cam.updateMatrixWorld();
  cam.getWorldQuaternion(_qi).invert();
  return out.copy(p).sub(cam.getWorldPosition(_cp)).applyQuaternion(_qi);
}

// ------------------------------------------------------------------------------------------ drone model
let _src = null;
/** the drone GLB (one load, cloned per drone) */
export function droneScene() { return (_src ||= instanceGLB('weapons/yanshu_drone.glb').catch((e) => { console.warn('[yanshu] drone model', e); _src = null; return null; })); }
const SOCK = ['muzzle', 'eye', 'thrustL', 'thrustR'];
/** a prepared drone: materials (viewmodel or world), its sockets, the eye materials (tinted per state), wing nodes */
async function makeDrone(def, { viewmodel = true, scale = 1 } = {}) {
  const src = await droneScene();
  if (!src) return null;
  const root = src.clone(true);
  applyHardSurface(root, { viewmodel, wear: 0.4, premium: def.premium, premiumKey: (viewmodel ? 'vm:' : 'w:') + 'yanshu_drone', world: !viewmodel });
  const sock = {}, eyes = [], wings = {};
  root.traverse((o) => {
    if (o.name.startsWith('S_') && SOCK.includes(o.name.slice(2))) sock[o.name.slice(2)] = o.position.clone();
    if (o.name === 'fx_wingL' || o.name === 'fx_wingR') wings[o.name] = { node: o, quat: o.quaternion.clone() };
    // the eye (glow_cyan; the thrusters are glow_teal): one material per premium state, tinted gold when 破限 is ready
    if (o.isMesh && o.material?.userData?.preset === 'glow_cyan' && !eyes.includes(o.material)) eyes.push(o.material);
  });
  const g = new THREE.Group();
  g.add(root);
  root.scale.setScalar(scale);
  g.userData.sock = sock; g.userData.eyes = eyes; g.userData.wings = wings; g.userData.root = root;
  return g;
}

// ------------------------------------------------------------------------------------------ the two viewmodel drones
/**
 * Two falcon drones in the viewmodel layer. `pose(i)` -> the wanted container-space position (the caller mixes the hover
 * anchors, the dock sockets, the inspect palm and the fly-in); they follow on damped springs, bank with their lateral
 * speed, look at `aim[i]` (a world point) or straight ahead, flap their wings a little, trail thruster light.
 */
export class Wing {
  constructor(g, def) {
    this.g = g; this.def = def; this.d = []; this.ready = false; this.visible = true; this.t = 0;
    this.scale = 0.52;
    Promise.all([0, 1].map(() => makeDrone(def, { viewmodel: true, scale: this.scale }))).then((list) => {
      if (this.disposed || list.some((x) => !x)) return;
      list.forEach((obj, i) => {
        obj.visible = false;
        g.vm.container.add(obj);
        obj.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.renderOrder = 2; } });
        this.d.push({ obj, i, pos: V3(), vel: V3(), quat: new THREE.Quaternion(), aim: null, look: V3(0, 0, -1), roll: 0, phase: i * 2.1, flap: 0, scan: 0, scanDir: 1,
          eyeCol: new THREE.Color(HOLO), want: V3(), snap: true, thrT: 0, fire: 0 });
      });
      this.ready = true;
    });
  }
  /** per frame: want(i, out) fills the wanted container-space position; aims[i] world point or null */
  update(dt, want, aims, { eye = null, thrust = 1, k = 9 } = {}) {
    if (!this.ready) return;
    this.t += dt;
    const g = this.g, P = g.fx?.particles;
    for (const d of this.d) {
      d.obj.visible = this.visible;
      if (!this.visible) { d.snap = true; continue; }
      want(d.i, d.want);
      if (d.snap) { d.pos.copy(d.want); d.vel.set(0, 0, 0); d.snap = false; }
      // critically damped spring towards the wanted point
      _a.subVectors(d.want, d.pos).multiplyScalar(k * k * dt);
      d.vel.addScaledVector(_a, 1).multiplyScalar(Math.exp(-2 * k * dt));
      d.pos.addScaledVector(d.vel, dt);
      d.obj.position.copy(d.pos);
      // look: at the aim point (camera space) or ahead, plus the scan sweep; bank with the lateral speed
      const aim = aims?.[d.i];
      if (aim) {
        toCam(g, aim, _b); _b.sub(camOf(g, d.pos, _d)).normalize();
        // the body turns at most 55° off ahead and 30° down (it still fires at a zombie at the player's feet: a drone
        // diving its nose straight down read as a white sliver)
        const yw = clamp(Math.atan2(_b.x, -_b.z), -0.96, 0.96), pt = clamp(Math.asin(clamp(_b.y, -1, 1)), -0.52, 0.3);
        _b.set(Math.sin(yw) * Math.cos(pt), Math.sin(pt), -Math.cos(yw) * Math.cos(pt));
      }
      else _b.set(Math.sin(d.scan) * 0.9, this.pitch ?? -0.3, -1).normalize();   // a little nose-down: their backs (ceramic, orange tips) face the eye
      d.look.lerp(_b, 1 - Math.exp(-10 * dt)).normalize();
      d.roll = damp(d.roll, clamp(-d.vel.x * 2.2, -0.7, 0.7), 6, dt);
      _m.lookAt(_c.set(0, 0, 0), d.look, _e.set(0, 1, 0));   // (+Z away from the look: the nose, -Z, along it)
      d.quat.setFromRotationMatrix(_m).multiply(_q.setFromAxisAngle(_e.set(0, 0, 1), d.roll));
      d.obj.quaternion.copy(d.quat);
      // the wings: a slow hover flap
      const wg = d.obj.userData.wings;
      d.flap = Math.sin(this.t * 7 + d.phase) * 0.08;
      for (const [n, w] of Object.entries(wg)) w.node.quaternion.copy(w.quat).multiply(_q.setFromAxisAngle(_e.set(0, 0, 1), (n === 'fx_wingL' ? -1 : 1) * d.flap));
      // eye colour (cyan, gold when 破限 is ready, white-hot when firing)
      const ec = eye?.(d.i) || HOLO;
      d.eyeCol.set(ec);
      for (const m of d.obj.userData.eyes) m.emissive.copy(d.eyeCol);
      // thruster light: faint cyan flames out of both nozzles
      if (P && thrust > 0 && (d.thrT -= dt) <= 0) {
        d.thrT = 1 / 40;
        for (const s of ['thrustL', 'thrustR']) {
          const sp = this.sockCam(d, s, _a);
          if (!sp) continue;
          _b.set(0, 0, 1).applyQuaternion(d.quat);   // backward out of the nozzle (container space ~ camera space)
          P.spawn({ additive: true, vm: true, x: sp.x, y: sp.y, z: sp.z, vx: _b.x * 0.25 * thrust, vy: _b.y * 0.25 * thrust - 0.02, vz: _b.z * 0.25 * thrust, life: 0.12,
            size: 0.006 * thrust, size1: 0.002, color: [C.CYAN[0] * 0.9, C.CYAN[1] * 0.9, C.CYAN[2] * 0.9, 0.8], color1: [0.1, 0.3, 0.6, 0], frame: FRAME.glow, inertia: 0.8 });
        }
      }
    }
  }
  /** a drone socket in camera space */
  sockCam(d, name, out = V3()) {
    const s = d.obj.userData.sock[name];
    if (!s) return null;
    d.obj.updateMatrix();
    out.copy(s).multiplyScalar(this.scale).applyMatrix4(d.obj.matrix);
    return camOf(this.g, out, out);
  }
  /** where a drone's gun muzzle appears in the world (tracers / beams start there) */
  muzzleWorld(i, out = V3()) {
    const d = this.d[i];
    if (!d) return null;
    const cp = this.sockCam(d, 'muzzle', _e);
    return cp ? apparent(this.g, cp, out) : null;
  }
  /** muzzle flash on drone i (viewmodel layer) */
  flash(i, k = 1, col = C.CYAN) {
    const d = this.d[i], P = this.g.fx?.particles;
    if (!d || !P || !this.visible) return;
    const cp = this.sockCam(d, 'muzzle', _a);
    if (!cp) return;
    P.spawn({ additive: true, vm: true, x: cp.x, y: cp.y, z: cp.z, life: 0.05, size: 0.012 * k, size1: 0.004, color: [col[0] * 1.2, col[1] * 1.2, col[2] * 1.2, 1], color1: [0, 0, 0, 0], frame: FRAME.glow });
    P.spawn({ additive: true, vm: true, x: cp.x, y: cp.y, z: cp.z, life: 0.04, size: 0.01 * k, size1: 0.016 * k, color: [C.HOT[0] * 0.6, C.HOT[1] * 0.6, C.HOT[2] * 0.6, 1], color1: [0, 0, 0, 0], frame: FRAME.star4, rot: R() * 6 });
  }
  /** a quick sideways kick on a shot */
  recoil(i, k = 1) { const d = this.d[i]; if (d) d.vel.addScaledVector(d.look, -0.06 * k); }
  dispose() { this.disposed = true; for (const d of this.d) d.obj.removeFromParent(); this.d.length = 0; }
}

// ------------------------------------------------------------------------------------------ mini drones (分機 aura, world space)
/** a small falcon drone following a player (world space) for `life` s; shoot(target) is the caller's business */
export class MiniDrone {
  constructor(g, def, follow, { life = 10, side = 1 } = {}) {
    this.g = g; this.follow = follow; this.life = life; this.t = 0; this.side = side; this.obj = null; this.pos = V3(); this.alive = true; this.fireT = 0.4;
    makeDrone(def, { viewmodel: false, scale: 0.75 }).then((o) => {
      if (!this.alive || !o) return;
      this.obj = o; g.scene.add(o);
      const f = follow(_a); if (f) this.pos.copy(f).add(_b.set(side * 0.5, 2.0, 0));
      this.obj.position.copy(this.pos);
      g.fx?.sparkBurst?.(this.pos, { color: C.CYAN, color1: [0.2, 0.6, 1.2], count: 10, speed: 3, glow: 0.4 });
    });
  }
  update(dt) {
    if (!this.alive) return false;
    this.t += dt;
    const o = this.obj;
    const f = this.follow(_a);
    if (o && f) {
      // over the shoulder, bobbing
      _b.set(f.x + this.side * 0.45, f.y + 1.95 + Math.sin(this.t * 2.6 + this.side) * 0.04, f.z);
      this.pos.lerp(_b, 1 - Math.exp(-6 * dt));
      o.position.copy(this.pos);
      if (this.aim) { _c.subVectors(this.aim, this.pos); o.rotation.y = damp(o.rotation.y, Math.atan2(-_c.x, -_c.z), 10, dt); }
      if ((this.thrT = (this.thrT ?? 0) - dt) <= 0) {
        this.thrT = 0.05;
        this.g.fx?.particles?.spawn({ additive: true, x: this.pos.x, y: this.pos.y - 0.02, z: this.pos.z, vy: -0.4, life: 0.15, size: 0.04, size1: 0.01, color: [...C.CYAN, 0.7], color1: [0, 0, 0, 0], frame: FRAME.glow });
      }
    }
    if (this.t >= this.life || !f) { this.dispose(true); return false; }
    return true;
  }
  dispose(fx = false) {
    if (!this.alive) return;
    this.alive = false;
    if (fx && this.obj) this.g.fx?.sparkBurst?.(this.pos, { color: C.CYAN, color1: [0.2, 0.6, 1.2], count: 8, speed: 2.5, glow: 0.3 });
    this.obj?.removeFromParent();
  }
}

// ------------------------------------------------------------------------------------------ fire: the square forge crown
/**
 * Muzzle look per shot (card: 橘白方形槍口光，4 片短焰呈十字，中心挖空): out of the ram face four short orange-white tongues
 * in a cross (the face is square), a square of hot light hugging the face's edge, a few sparks thrown off the corners;
 * the centre stays clear. Viewmodel layer; the gun's own fireball is kept small (def.fx.flashScale).
 */
export function crown(g, n, k = 1) {
  const vm = g.vm, P = g.fx?.particles, c0 = vm?.socketCam?.('ram', _a);
  if (!P || !c0) return;
  const f = _b.set(0, 0, -1).applyQuaternion(vm.gunRoot.quaternion);
  const u = _c.set(0, 1, 0).applyQuaternion(vm.gunRoot.quaternion), w = _d.crossVectors(f, u).normalize();
  const rot = (n % 2) * 0.12, kk = Math.sqrt(k) * 1.8;
  // four tongues at the edge midpoints, licking outwards and forwards
  for (let i = 0; i < 4; i++) {
    const a = rot + i * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
    _e.copy(u).multiplyScalar(ca).addScaledVector(w, sa);
    const x = c0.x + _e.x * 0.03 * kk + f.x * 0.005, y = c0.y + _e.y * 0.03 * kk + f.y * 0.005, z = c0.z + _e.z * 0.03 * kk + f.z * 0.005;
    P.spawn({ additive: true, vm: true, x, y, z, mode: 'align', dir: [_e.x * 0.8 + f.x, _e.y * 0.8 + f.y, _e.z * 0.8 + f.z], aspect: 2.2, anchor: 0.45, life: 0.07 * k,
      size: 0.045 * kk, size1: 0.075 * kk, color: [1, 1, 1, 1], frame: FRAME.cone + (i % 2), ramp: 0, heat: 1, heat1: 0.35 });
  }
  // the square of light round the face (a flat ring, turned to the barrel) and a hot flash just off it
  P.spawn({ additive: true, vm: true, x: c0.x + f.x * 0.01, y: c0.y + f.y * 0.01, z: c0.z + f.z * 0.01, mode: 'flat', dir: [-f.x, -f.y, -f.z], life: 0.08 * k, size: 0.05, size1: 0.11 * kk, sizePow: 0.5,
    color: [C.HOT[0] * 0.7, C.HOT[1] * 0.6, C.HOT[2] * 0.4, 1], color1: [C.DEEP[0] * 0.3, C.DEEP[1] * 0.3, 0, 0], frame: FRAME.thinRing, rot: Math.PI / 4 + rot });
  P.spawn({ additive: true, vm: true, x: c0.x + f.x * 0.015, y: c0.y + f.y * 0.015, z: c0.z + f.z * 0.015, mode: 'flat', dir: [-f.x, -f.y, -f.z], life: 0.06 * k, size: 0.07 * kk, size1: 0.12 * kk,
    color: [C.ORANGE[0] * 0.5, C.ORANGE[1] * 0.5, C.ORANGE[2] * 0.5, 0.8], color1: [0, 0, 0, 0], frame: FRAME.ring, rot: Math.PI / 4 });
  // sparks off the corners
  const ns = Math.round(6 * k);
  for (let i = 0; i < ns; i++) {
    const a = Math.PI / 4 + (i % 4) * Math.PI / 2 + (R() - 0.5) * 0.4, L = 0.8 + R() * 0.7;
    _e.copy(u).multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a));
    P.spawn({ additive: true, vm: true, x: c0.x + _e.x * 0.04, y: c0.y + _e.y * 0.04, z: c0.z + _e.z * 0.04, vx: (_e.x * 2.6 + f.x * 1.8) * L, vy: (_e.y * 2.6 + f.y * 1.8) * L + 0.3, vz: (_e.z * 2.6 + f.z * 1.8) * L,
      life: 0.14, size: 0.004, stretch: 0.03 * L, color: [...C.SPARK, 1], color1: [...C.DEEP, 0], frame: FRAME.spark, gravity: 3, drag: 5 });
  }
  // a breath of hot smoke rolling off the face
  P.spawn({ vm: true, x: c0.x + f.x * 0.02, y: c0.y + f.y * 0.02, z: c0.z + f.z * 0.02, vx: f.x * 0.4, vy: 0.08, vz: f.z * 0.4, life: 0.5, size: 0.03, size1: 0.12, sizePow: 0.5,
    color: [0.55, 0.5, 0.46, 0.18], color1: [0.55, 0.5, 0.46, 0], frame: FRAME.smoke, drag: 3, inertia: 0.6 });
  const mw = vm.socketWorld?.('ram', _e);
  if (mw && g.fx?.lights) { mw.addScaledVector(vm.socketDir?.('ram', _a) || _a.set(0, 0, -1), 0.1); g.fx.lights.flash(mw, 0xffa040, 0.8 * k, 1.8, 0.05); }
}

// ------------------------------------------------------------------------------------------ the round's burst (0.15 s after a hit)
/** orange-white sparks + a cyan holographic ring with tick marks (card: 橘白火花＋一圈青色全息環); world space */
export function burstFx(g, p, k = 1, rand = R) {
  const P = g.fx?.particles, fx = g.fx, e = ek(g);
  if (!P) return;
  P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.08, size: 0.9 * k, size1: 0.3, color: [C.HOT[0] * e, C.HOT[1] * e, C.HOT[2] * e, 1], color1: [...C.ORANGE, 0], frame: FRAME.glow });
  P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.32, size: 0.4 * k, size1: 3.4 * k, sizePow: 0.45, color: [C.CYAN[0] * 1.2 * e, C.CYAN[1] * 1.2 * e, C.CYAN[2] * 1.2 * e, 1], color1: [0, 0, 0, 0], frame: FRAME.thinRing, rot: rand() * 6, far: 'sqrt' });
  P.spawn({ additive: true, x: p.x, y: p.y, z: p.z, delay: 0.03, life: 0.34, size: 0.4 * k, size1: 2.2 * k, sizePow: 0.5, color: [C.CYAN[0] * 0.4 * e, C.CYAN[1] * 0.4 * e, C.CYAN[2] * 0.4 * e, 0.7], color1: [0, 0, 0, 0], frame: FRAME.ring, rot: rand() * 6, spin: 3, far: 'sqrt' });
  fx.sparkBurst?.(p, { color: C.SPARK, color1: C.DEEP, count: Math.round(10 * k), speed: 6.5, glow: 0.45 });
  for (let i = 0; i < 2; i++) P.spawn({ x: p.x, y: p.y, z: p.z, vx: (rand() - 0.5) * 1.2, vy: 0.4 + rand() * 0.5, vz: (rand() - 0.5) * 1.2, life: 0.6, size: 0.18 * k, size1: 0.6 * k, sizePow: 0.5,
    color: [0.42, 0.38, 0.34, 0.3], color1: [0.4, 0.38, 0.36, 0], frame: FRAME.dusty + i, lit: true, drag: 3, rot: rand() * 6 });
  fx.lights?.flash(p, 0xffa040, 6 * k, 3.5, 0.08);
}

// ------------------------------------------------------------------------------------------ 爐環 fire wall
/** a 360° wall of fire racing out to r from c: licking flame sheets, a hot floor ring, embers, scorch, light */
export function ringFire(g, c, r, rand = R, k = 1) {
  const P = g.fx?.particles, fx = g.fx, e = ek(g);
  if (!P) return;
  fx.shockwave?.(_a.set(c.x, c.y + 0.06, c.z), { normal: _b.set(0, 1, 0), r0: 0.3, r1: r, life: 0.45, color: [C.ORANGE[0] * e, C.ORANGE[1] * e, C.ORANGE[2] * e], thin: false });
  fx.shockwave?.(_a.set(c.x, c.y + 0.08, c.z), { normal: _b.set(0, 1, 0), r0: 0.2, r1: r * 0.8, life: 0.3, color: [C.HOT[0] * 0.5 * e, C.HOT[1] * 0.5 * e, C.HOT[2] * 0.5 * e], thin: true });
  const n = Math.round(28 * k);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rand() * 0.2, ca = Math.cos(a), sa = Math.sin(a), d = 0.4 + rand() * 0.3, sp = (r - d) / 0.42;
    // a flame sheet riding outwards on the wall front (align up, ramp fire)
    P.spawn({ additive: true, x: c.x + ca * d, y: c.y + 0.1, z: c.z + sa * d, vx: ca * sp, vy: 0.6 + rand() * 0.6, vz: sa * sp, life: 0.42 + rand() * 0.12, drag: 1.2,
      mode: 'align', dir: [0, 1, 0], aspect: 1.5, anchor: 0.1, size: 0.55, size1: 1.05, color: [1, 1, 1, 1], frame: FRAME.flick[i % 4], ramp: 2, heat: 0.95, heat1: 0.15, ground: c.y, soft: 0.2 });
    if (i % 3 === 0) P.spawn({ additive: true, x: c.x + ca * d, y: c.y + 0.3, z: c.z + sa * d, vx: ca * sp * 1.1, vy: 2 + rand() * 2, vz: sa * sp * 1.1, life: 0.7 + rand() * 0.4,
      size: 0.03, size1: 0.01, color: [...C.SPARK, 1], color1: [...C.DEEP, 0], frame: FRAME.spark, stretch: 0.02, gravity: 4, drag: 1.5 });
  }
  P.spawn({ additive: true, x: c.x, y: c.y + 0.05, z: c.z, mode: 'flat', dir: [0, 1, 0], life: 0.35, size: r * 0.5, size1: r * 2.1, sizePow: 0.45, color: [C.ORANGE[0] * 0.35 * e, C.ORANGE[1] * 0.35 * e, C.ORANGE[2] * 0.35 * e, 0.6], color1: [0, 0, 0, 0], frame: FRAME.glow });
  fx.lights?.flash(_a.set(c.x, c.y + 1, c.z), 0xff8a2a, 18, r * 2.5, 0.25);
}

/** the inhale: hot streaks pulled out of the cone into the gun (from far to the eye) */
export function inhaleLines(g, eye, dir, range, cone, rand = R, n = 26) {
  const P = g.fx?.particles;
  if (!P) return;
  const up = _a.set(0, 1, 0), side = _b.crossVectors(dir, up).normalize(), u2 = _c.crossVectors(side, dir).normalize();
  for (let i = 0; i < n; i++) {
    const d = 2 + rand() * (range - 2), a = (rand() - 0.5) * cone * Math.PI / 180, b = (rand() - 0.5) * 0.5;
    _d.copy(dir).applyAxisAngle(u2, a).applyAxisAngle(side, b).multiplyScalar(d).add(eye);
    _d.y -= 0.35 * (d / range);
    _e.subVectors(eye, _d).normalize().multiplyScalar(d / 0.5);
    P.spawn({ additive: true, x: _d.x, y: _d.y, z: _d.z, vx: _e.x, vy: _e.y - 0.4, vz: _e.z, life: 0.38, delay: rand() * 0.12, size: 0.03, stretch: 0.05,
      color: [C.ORANGE[0] * 0.9, C.ORANGE[1] * 0.9, C.ORANGE[2] * 0.9, 0.9], color1: [...C.HOT, 0], frame: FRAME.spark, drag: 0.5 });
    if (i % 3 === 0) P.spawn({ x: _d.x, y: _d.y - 0.6, z: _d.z, vx: _e.x * 0.5, vy: 0.2, vz: _e.z * 0.5, life: 0.6, size: 0.3, size1: 0.7, sizePow: 0.5,
      color: [0.5, 0.45, 0.4, 0.25], color1: [0.5, 0.45, 0.4, 0], frame: FRAME.dusty, lit: true, drag: 1.5, rot: rand() * 6 });
  }
}

// ------------------------------------------------------------------------------------------ viewmodel bits
/** white steam out of the fin slots / the door seams (viewmodel layer); k scales the puff */
export function steam(g, sockets, k = 1) {
  const vm = g.vm, P = g.fx?.particles;
  if (!P) return;
  const up = _b.set(0, 1, 0).applyQuaternion(vm.gunRoot.quaternion);
  for (const s of sockets) {
    const c = vm.socketCam?.(s, _a);
    if (!c) continue;
    for (let i = 0; i < 2; i++) P.spawn({ vm: true, x: c.x + (R() - 0.5) * 0.01, y: c.y, z: c.z + (R() - 0.5) * 0.01, vx: up.x * 0.12 + (R() - 0.5) * 0.06, vy: up.y * 0.18 + 0.05, vz: up.z * 0.12 + (R() - 0.5) * 0.06,
      life: 0.6 + R() * 0.4, size: 0.008 * k, size1: 0.04 * k, sizePow: 0.5, color: [0.9, 0.9, 0.9, 0.32], color1: [0.85, 0.85, 0.85, 0], frame: FRAME.smoke + i, drag: 2.5, inertia: 0.7, spin: (R() - 0.5) * 2 });
  }
}
/** jets of fire out of the door-side slits (爐環 cast), viewmodel layer */
export function slitJets(g, k = 1) {
  const vm = g.vm, P = g.fx?.particles;
  if (!P) return;
  for (const [s, sg] of [['slitL', -1], ['slitR', 1]]) {
    const c = vm.socketCam?.(s, _a);
    if (!c) continue;
    _b.set(sg, 0.9, 0).normalize().applyQuaternion(vm.gunRoot.quaternion);
    for (let i = 0; i < 5; i++) P.spawn({ additive: true, vm: true, x: c.x + (R() - 0.5) * 0.05, y: c.y, z: c.z + (R() - 0.5) * 0.05, vx: _b.x * 0.7, vy: _b.y * 0.7, vz: _b.z * 0.7, life: 0.22, delay: i * 0.02,
      mode: 'align', dir: [_b.x, _b.y, _b.z], aspect: 1.8, anchor: 0.1, size: 0.025 * k, size1: 0.05 * k, color: [1, 1, 1, 1], frame: FRAME.flick[i % 4], ramp: 2, heat: 1, heat1: 0.2, inertia: 0.5 });
  }
}
/** a rising heat shimmer over the fin tower (high quality only): faint warm wisps */
export function heatHaze(g, k = 1) {
  const vm = g.vm, P = g.fx?.particles;
  if (!P || (g.renderer?.q?.particles ?? 3000) < 2500) return;
  const c = vm.socketCam?.('tower', _a);
  if (!c) return;
  P.spawn({ additive: true, vm: true, x: c.x + (R() - 0.5) * 0.06, y: c.y, z: c.z + (R() - 0.5) * 0.06, vy: 0.12, life: 0.7, size: 0.02, size1: 0.06, sizePow: 0.6,
    color: [0.35 * k, 0.12 * k, 0.03 * k, 0.5], color1: [0, 0, 0, 0], frame: FRAME.wisp, mode: 'align', dir: [0, 1, 0], aspect: 2, inertia: 0.8 });
}

/** the holographic furnace gauge (rare idle, §2 card 稀有待機): an arc scale + digits beside the gun, its needle sweeping
 *  into the red for 1.5 s; drawn on a small canvas, additive, viewmodel layer */
export class HoloGauge {
  constructor(g) {
    this.g = g; this.t = -1; this.dur = 2.2;
    const cv = this.cv = document.createElement('canvas');
    cv.width = 256; cv.height = 160;
    this.ctx = cv.getContext('2d');
    this.tex = new THREE.CanvasTexture(cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, color: new THREE.Color(1.6, 1.6, 1.6) });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.069), this.mat);
    this.mesh.renderOrder = 45; this.mesh.visible = false; this.mesh.frustumCulled = false;
    g.vm.container.add(this.mesh);
  }
  show(dur = 2.2) { this.t = 0; this.dur = dur; this.mesh.visible = true; }
  update(dt) {
    if (this.t < 0) return;
    this.t += dt;
    const u = this.t, D = this.dur;
    if (u >= D) { this.t = -1; this.mesh.visible = false; return; }
    const vm = this.g.vm, c = vm.socketCam?.('gauge', _a);
    if (!c) return;
    // beside the gun's gauge, a little up and out, turned to the eye
    this.mesh.position.set(c.x + 0.06, c.y + 0.06, c.z + 0.02).applyMatrix4(_m.copy(vm.container.matrix).invert());
    this.mesh.quaternion.identity();
    const fade = Math.min(1, u / 0.15) * Math.min(1, (D - u) / 0.3), flick = 0.85 + 0.15 * Math.sin(u * 60);
    const s = 0.7 + 0.3 * Math.min(1, u / 0.2);
    this.mesh.scale.set(s, s, 1);
    const ctx = this.ctx, W = 256, H = 160;
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = fade * flick;
    ctx.strokeStyle = HOLO; ctx.fillStyle = HOLO; ctx.lineWidth = 3;
    const cx = W / 2, cy = H * 0.86, Rr = 104;
    // arc scale with ticks, the red zone
    ctx.beginPath(); ctx.arc(cx, cy, Rr, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    for (let i = 0; i <= 20; i++) {
      const a = Math.PI * (1.05 + 0.9 * i / 20), L = i % 5 ? 10 : 18;
      ctx.lineWidth = i % 5 ? 2 : 3;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * Rr, cy + Math.sin(a) * Rr); ctx.lineTo(cx + Math.cos(a) * (Rr - L), cy + Math.sin(a) * (Rr - L)); ctx.stroke();
    }
    ctx.strokeStyle = '#ff5a2a'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(cx, cy, Rr - 5, Math.PI * 1.77, Math.PI * 1.95); ctx.stroke();
    // the needle: sweeps up, sits in the red for 1.5 s, falls back
    const sweep = u < 0.35 ? u / 0.35 : u < 0.35 + 1.5 ? 0.93 + 0.04 * Math.sin(u * 30) : Math.max(0.3, 0.93 - (u - 1.85) * 2);
    const na = Math.PI * (1.05 + 0.9 * clamp(sweep, 0, 1));
    ctx.strokeStyle = sweep > 0.82 ? '#ffb02e' : HOLO; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(na) * (Rr - 14), cy + Math.sin(na) * (Rr - 14)); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 7, 0, TAU); ctx.fill();
    // digits (furnace temperature) with a blinking warning in the red
    const temp = Math.round(400 + 1100 * clamp(sweep, 0, 1));
    ctx.font = 'bold 30px monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = sweep > 0.82 ? '#ffb02e' : HOLO;
    ctx.fillText(`${temp}°C`, cx, cy - 34);
    if (sweep > 0.82 && Math.sin(u * 18) > 0) { ctx.font = 'bold 18px monospace'; ctx.fillText('爐溫 MAX', cx, cy - 66); }
    // scan line
    ctx.globalAlpha = fade * 0.3; ctx.fillStyle = HOLO; ctx.fillRect(0, (u * 220) % H, W, 2);
    ctx.globalAlpha = 1;
    this.tex.needsUpdate = true;
  }
  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mat.dispose(); this.tex.dispose(); }
}

/** the seal strap torn off the spine (破限): a viewmodel copy of fx_seal flung up and away, spinning, burning into sparks */
export class SealFlight {
  constructor(g, node) {
    this.g = g; this.t = 0; this.alive = true;
    const vm = g.vm;
    this.obj = node.clone(true);
    node.updateWorldMatrix(true, false);
    // into container space at its current pose
    _m.copy(vm.container.matrixWorld).invert().multiply(node.matrixWorld);
    _m.decompose(this.obj.position, this.obj.quaternion, this.obj.scale);
    this.obj.visible = true;
    vm.container.add(this.obj);
    const up = V3().set(0, 1, 0).applyQuaternion(vm.gunRoot.quaternion);
    this.vel = up.multiplyScalar(1.6).add(V3(0.55, 0.2, 0.15));
    this.spin = V3(R() * 9 - 4, 7 + R() * 4, R() * 6 - 3);
  }
  update(dt) {
    if (!this.alive) return false;
    this.t += dt;
    const o = this.obj, P = this.g.fx?.particles;
    this.vel.y -= 3.2 * dt;
    o.position.addScaledVector(this.vel, dt);
    o.rotation.x += this.spin.x * dt; o.rotation.y += this.spin.y * dt; o.rotation.z += this.spin.z * dt;
    if (P && this.t > 0.08) {
      camOf(this.g, o.position, _a);
      P.spawn({ additive: true, vm: true, x: _a.x, y: _a.y, z: _a.z, vx: (R() - 0.5) * 0.3, vy: (R() - 0.5) * 0.3, vz: (R() - 0.5) * 0.3, life: 0.25, size: 0.004, stretch: 0.01,
        color: [...C.SPARK, 1], color1: [...C.DEEP, 0], frame: FRAME.spark, drag: 3 });
    }
    // burns into sparks at 0.45 s
    if (this.t > 0.45) {
      if (P) {
        camOf(this.g, o.position, _a);
        for (let i = 0; i < 16; i++) P.spawn({ additive: true, vm: true, x: _a.x, y: _a.y, z: _a.z, vx: (R() - 0.5) * 1.2, vy: (R() - 0.3) * 1.0, vz: (R() - 0.5) * 1.2, life: 0.35, size: 0.004, stretch: 0.015,
          color: [...C.HOT, 1], color1: [...C.ORANGE, 0], frame: FRAME.spark, drag: 2, gravity: 1.5 });
        P.spawn({ additive: true, vm: true, x: _a.x, y: _a.y, z: _a.z, life: 0.12, size: 0.05, size1: 0.02, color: [...C.HOT, 1], color1: [...C.ORANGE, 0], frame: FRAME.glow });
      }
      this.dispose();
      return false;
    }
    return true;
  }
  dispose() { this.alive = false; this.obj.removeFromParent(); }
}

// ------------------------------------------------------------------------------------------ 爐壁護盾 hex wall
/** six fin plates snap into a hexagonal furnace wall in front of the player, glow red-hot, crack into shards */
const _hexMats = {};
function hexMats() {
  if (_hexMats.plate) return _hexMats;
  // half see-through (§1.14 #5: big first-person objects never hide the fight), heating from ceramic white to red-hot
  _hexMats.plate = new THREE.MeshStandardMaterial({ color: 0xe2dfd7, roughness: 0.42, metalness: 0, emissive: new THREE.Color(1, 0.3, 0.06), emissiveIntensity: 0, transparent: true, opacity: 0.5, depthWrite: false });
  _hexMats.seam = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.8, 0.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  return _hexMats;
}
export class HexWall {
  constructor(g, c, yaw, { dist = 1.3, size = 0.9, rand = R } = {}) {
    this.g = g; this.t = 0; this.alive = true; this.rand = rand;
    const M = hexMats();
    this.grp = new THREE.Group();
    this.plates = [];
    for (let i = 0; i < 6; i++) {
      // one wedge of the hexagon (a trapezoid plate from the inner hex to the outer edge)
      const a0 = (i / 6) * TAU + 0.035, a1 = ((i + 1) / 6) * TAU - 0.035, r0 = size * 0.28, r1 = size;   // gaps between the six fins
      const sh = new THREE.Shape([new THREE.Vector2(Math.cos(a0) * r0, Math.sin(a0) * r0), new THREE.Vector2(Math.cos(a0) * r1, Math.sin(a0) * r1),
        new THREE.Vector2(Math.cos(a1) * r1, Math.sin(a1) * r1), new THREE.Vector2(Math.cos(a1) * r0, Math.sin(a1) * r0)]);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1 });
      const m = new THREE.Mesh(geo, M.plate.clone());
      const mid = (a0 + a1) / 2;
      m.userData.dir = new THREE.Vector3(Math.cos(mid), Math.sin(mid), 0);
      m.position.copy(m.userData.dir).multiplyScalar(0.5);   // they fly in from outside
      this.grp.add(m); this.plates.push(m);
    }
    const seam = new THREE.Mesh(new THREE.RingGeometry(size * 0.2, size * 0.26, 6), M.seam.clone());
    seam.position.z = 0.045; this.grp.add(seam); this.seam = seam;
    this.grp.position.set(c.x - Math.sin(yaw) * dist, c.y + 1.15, c.z - Math.cos(yaw) * dist);
    this.grp.rotation.y = yaw;
    g.scene.add(this.grp);
  }
  update(dt) {
    if (!this.alive) return false;
    this.t += dt;
    const t = this.t, P = this.g.fx?.particles;
    for (const m of this.plates) {
      const u = clamp(t / 0.12, 0, 1);
      m.position.copy(m.userData.dir).multiplyScalar(0.5 * (1 - u) * (1 - u));
      const heat = clamp((t - 0.12) / 0.5, 0, 1);
      m.material.emissiveIntensity = heat * 2.6;   // heats to red
      m.material.opacity = 0.5 - 0.15 * heat;
    }
    this.seam.material.opacity = clamp(t / 0.2, 0, 1) * (0.6 + 0.4 * Math.sin(t * 40));
    if (t > 0.85) {
      // crack: the plates burst outwards into shards and sparks
      const fx = this.g.fx, c = this.grp.position;
      fx?.motes?.burst?.('shard', c, 14, { palette: [[0.9, 0.88, 0.84], [1, 0.4, 0.1], [0.3, 0.3, 0.32]], speed: 6, spread: 1, radius: 0.5, seed: (this.rand() * 1e6) | 0 });
      fx?.sparkBurst?.(c, { color: C.HOT, color1: C.RED, count: 24, speed: 8, glow: 0.8 });
      P?.spawn({ additive: true, x: c.x, y: c.y, z: c.z, life: 0.15, size: 2.2, size1: 0.6, color: [...C.HOT, 1], color1: [...C.ORANGE, 0], frame: FRAME.glow });
      this.dispose();
      return false;
    }
    return true;
  }
  dispose() {
    this.alive = false;
    this.grp.removeFromParent();
    for (const m of this.plates) { m.geometry.dispose(); m.material.dispose(); }
    this.seam.geometry.dispose(); this.seam.material.dispose();
  }
}
