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
import { applyHardSurface, materialUniforms } from '../gfx/materials.js';
import { ArmRig, basisQuat } from './ik.js';
import { ClipPlayer } from './clip.js';
import { rightGrip, LEFT_GRIPS } from './grips.js';
import { Spring3, damp, clamp, lerp, ease } from '../engine/util.js';

const D = Math.PI / 180;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const _arr = [0, 0, 0];

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
        this.parts[o.name] = { node: o, pos: o.position.clone(), quat: o.quaternion.clone(), extras: o.userData };
      }
    });
    applyHardSurface(scene, { viewmodel: true, wear: def.wear ?? 1 });
    // grip rake from the grip_r socket rotation magnitude (authoring axis conventions vary)
    const g = this.sockets.grip_r;
    this.rake = g ? 2 * Math.acos(Math.min(1, Math.abs(g.quat.w))) : 18 * D;
    if (this.rake < 5 * D || this.rake > 40 * D) this.rake = 18 * D;
    // magazine drop copy for reload debris
    this.box = new THREE.Box3().setFromObject(scene);
  }
  socket(name) { return this.sockets[name]; }
  has(name) { return !!this.sockets[name]; }
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
  }

  async init() {
    const arms = await instanceGLB('arms.glb');
    applyHardSurface(arms, { viewmodel: true });
    this.arms = new ArmRig(arms, this.container);
  }

  async setWeapon(id, def = {}) {
    const scene = await instanceGLB(`weapons/${id}.glb`);
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
    }[grip] || [0.105, -0.17, -0.27, 1, -2.5, -2];
    const h = vm.hip || HIP;
    this.hip.pos.set(h[0], h[1], h[2]);
    this.hip.rot.set((h[3] ?? 1) * D, (h[4] ?? -2.5) * D, (h[5] ?? -2) * D);
    this.adsRelief = vm.relief ?? (w.has('optic') ? 0.2 : grip === 'pistol' ? 0.27 : 0.17);
    this.supportGrip = LEFT_GRIPS[w.meta.support] || LEFT_GRIPS.handguard;
    this.rightGrip = rightGrip(this.rake);
    this._computeAds();
    this.setAnchor('R', 'grip_r', 0);
    this.setAnchor('L', w.meta.support === 'none' || !w.has('grip_l') ? 'rest' : 'grip_l', 0);
    this.arms.setPose('R', 'grip', 0);
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
  }

  // ------------------------------------------------------------------ socket queries (world space)

  /** True world position of a socket on the first-person gun (lights, sounds). */
  socketWorld(name, out = new THREE.Vector3()) {
    const s = this.weapon?.socket(name);
    if (!s) return null;
    return out.copy(s.pos).applyMatrix4(this.weapon.root.matrixWorld);
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
  stopClip() { this.clip.stop(); this._resolve?.(); this._resolve = null; this.setAnchor('L', this.defaultLeft(), 0.15); this.setAnchor('R', 'grip_r', 0.1); }
  defaultLeft() { return this.weapon && this.weapon.has('grip_l') && this.weapon.meta.support !== 'none' ? 'grip_l' : 'rest'; }

  /** Per-shot recoil impulse (viewmodel only; the camera kick is applied by the weapon logic). */
  kick({ back = 0.035, up = 4, side = 0.8, roll = 2.5 } = {}) {
    const ads = 1 - this.aim * 0.55;
    this.kickPos.impulse((Math.random() - 0.5) * 0.12 * ads, 0.05 * ads, back * 30 * ads);
    this.kickRot.impulse(up * D * 18 * ads, (Math.random() - 0.5) * side * D * 30 * ads, (Math.random() - 0.5) * roll * D * 30 * ads);
  }

  /** Animates a part for a short reciprocation (bolt / slide on each shot). */
  cycle(part, dur = 0.07) {
    const ps = this.partState[part] || (this.partState[part] = { v: 0 });
    ps.cycle = dur; ps.cycleT = 0;
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
    const breathe = Math.sin(this.time * 1.7) * 0.0012 * hipW;
    if (ctx.landImpact > 2) this.land.impulse(0, -Math.min(ctx.landImpact, 12) * 0.03, 0);
    const land = this.land.update(dt);
    const kp = this.kickPos.update(dt), kr = this.kickRot.update(dt);
    const crouch = ctx.crouch || 0;
    const strafeRoll = -ctx.moveX * 2.2 * D * hipW;

    // base pose: hip <-> ADS
    const hipQ = _q.setFromEuler(this.hip.rot);
    const grip = w.socket('grip_r')?.pos || _v2.set(0, -0.05, 0);
    const hipPos = _v.copy(this.hip.pos).sub(_v2.copy(grip).applyQuaternion(hipQ));
    const baseQ = _q2.copy(hipQ).slerp(this.ads.quat, ease.inOutQuad(aim));
    const basePos = hipPos.lerp(this.ads.pos, ease.inOutQuad(aim));

    // offsets (applied in camera space, rotations about the grip)
    let ox = swayP.x * hipW + bobX + kp.x * 0.01, oy = swayP.y * hipW + bobY + breathe + land.y * hipW - crouch * 0.012 * hipW + kp.y * 0.01, oz = kp.z * 0.001 * 30;
    let rx = sway.x * hipW + kr.x + crouch * 1.5 * D * hipW, ry = sway.y * hipW + kr.y, rz = sway.z * hipW + kr.z + bobRoll + strafeRoll - crouch * 4 * D * hipW;
    oz = kp.z;
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

    this._updateParts(dt);
    w.root.updateMatrixWorld(true);
    this._updateHands(dt);
    this.arms.update(dt);

    // viewmodel projection
    const cam = this.camera;
    this.vmCam.aspect = cam.aspect;
    this.vmCam.fov = this.fov - aim * (this.weapon.has('optic') ? 12 : 8);
    this.vmCam.updateProjectionMatrix();
    materialUniforms.vmProj.value.copy(this.vmCam.projectionMatrix);
    this.container.visible = this.visible;
  }

  _updateParts(dt) {
    const w = this.weapon;
    for (const [name, part] of Object.entries(w.parts)) {
      const ps = this.partState[name] || (this.partState[name] = { v: 0 });
      let v = ps.v || 0;
      if (ps.cycle) {
        ps.cycleT += dt;
        const u = ps.cycleT / ps.cycle;
        v = Math.max(v, u < 0.35 ? u / 0.35 : Math.max(0, 1 - (u - 0.35) / 0.65));
        if (u >= 1) ps.cycle = 0;
      }
      const tv = this.clipWeight > 0.001 ? this.clip.sample(name, undefined) : undefined;
      if (typeof tv === 'number') v = Math.max(v, tv);
      const node = part.node;
      node.position.copy(part.pos);
      node.quaternion.copy(part.quat);
      const ex = part.extras || {};
      if (name === 'bolt' || name === 'slide' || name === 'pump') {
        node.position.z += v * (ex.travel ?? 0.08);
        if (ex.lift && name === 'bolt') {
          // bolt-action: lift the handle first (first 35 % of travel), then slide
          const lift = Math.min(1, v / 0.35), slide = Math.max(0, (v - 0.35) / 0.65);
          node.position.copy(part.pos); node.position.z += slide * (ex.travel ?? 0.09);
          node.quaternion.multiply(_q.setFromAxisAngle(_v.set(0, 0, 1), lift * ex.lift * D));
        }
      } else if (name === 'trigger') node.quaternion.multiply(_q.setFromAxisAngle(_v.set(1, 0, 0), -v * 14 * D));
      else if (name === 'hammer') node.quaternion.multiply(_q.setFromAxisAngle(_v.set(1, 0, 0), v * 40 * D));
      else if (name === 'cover') node.quaternion.multiply(_q.setFromAxisAngle(_v.set(1, 0, 0), v * 75 * D));
      else if (name === 'breech') node.quaternion.multiply(_q.setFromAxisAngle(_v.set(1, 0, 0), -v * 32 * D));
      else if (name === 'crane') node.quaternion.multiply(_q.setFromAxisAngle(_v.set(0, 0, 1), v * 80 * D));
      else if (name === 'barrels' || name === 'cylinder') node.quaternion.multiply(_q.setFromAxisAngle(_v.set(0, 0, 1), ps.spin || 0));
      // free-form offsets from clips: <part>.pos (m, gun space) and <part>.rot (deg)
      if (this.clipWeight > 0.001) {
        const p = this.clip.sample(name + '.pos', _arr);
        if (p) { node.position.x += p[0]; node.position.y += p[1]; node.position.z += p[2]; }
        const r = this.clip.sample(name + '.rot', _arr);
        if (r) node.quaternion.multiply(_q.setFromEuler(_e.set(r[0] * D, r[1] * D, r[2] * D)));
        const vis = this.clip.sample(name + '.vis');
        if (typeof vis === 'number') node.visible = vis > 0.5; else node.visible = true;
      } else node.visible = true;
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
    let gripDef;
    const partPos = (pname, sock) => {
      // live position of a moving part (optionally at a socket that moves with it), gun space
      const part = w.parts[pname];
      if (!part) return null;
      const ref = sock && w.socket(sock) ? w.socket(sock).pos : part.pos;
      return ref.clone().sub(part.pos).applyQuaternion(part.node.quaternion).add(part.node.position);
    };
    if (name === 'grip_r') { gripDef = this.rightGrip; socketPos = w.socket('grip_r')?.pos; }
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
    F = _v.copy(gripDef.F).applyQuaternion(gq);
    N = _v2.copy(gripDef.N).applyQuaternion(gq);
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
