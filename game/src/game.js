// Game: owns the scene, world, local player, zombies, effects and the match; runs the frame.
import * as THREE from 'three';
import { World } from './world/world.js';
import { PlayerController } from './player/controller.js';
import { clamp, Spring3 } from './engine/util.js';
import { Viewmodel } from './player/viewmodel.js';
import { FX } from './fx/fx.js';
import { Projectiles } from './weapons/ballistics.js';
import { Arsenal } from './weapons/arsenal.js';
import { PlayerStatus } from './player/status.js';
import { ZombieManager } from './zombies/manager.js';

export class Game {
  constructor({ renderer, input, audio, hud }) {
    this.renderer = renderer;
    this.input = input;
    this.audio = audio;
    this.hud = hud;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x9aa3a8, 0.006);
    this.scene.background = new THREE.Color(0x9aa3a8);
    this.camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 600);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.world = new World(this.scene);
    this.time = 0;
    this.hfov = 96;         // horizontal FOV setting (degrees)
    this.zoom = 1;          // ADS / scope magnification multiplier (>1 zooms in)
    this.punch = new Spring3(160, 16);   // view punch (recoil, hits) in radians: x pitch, y yaw, z roll
    this.shake = 0;         // trauma 0..1 (squared for shake amplitude)
    this.landDip = new Spring3(90, 11);
    this.systems = [];      // objects with update(dt, t)
    this.localId = 0;
    this.timeScale = 1;
    this.hitStopT = 0;
    this.targets = null;    // zombie manager (raycast/inRadius) once created
  }

  /** Freezes the simulation for a few frames on heavy hits (melee, big kills). */
  hitStop(sec) { this.hitStopT = Math.max(this.hitStopT, sec); }
  noise() {}
  damagePlayer(amount, opts) { return this.status?.damage(amount, opts) ?? 0; }
  playerStatus(kind, time, value) { if (kind === 'slow') this.status?.applySlow(time, value); }
  get playerDead() { return !this.status || !this.status.alive; }

  async loadMap(map) {
    await this.world.load(map, { game: this });
    this.player = new PlayerController(this.world);
    this.player.pos.copy(this.world.playerSpawns[0]);
    this.player.yaw = Math.PI;
    this.status = new PlayerStatus(this);
    this.vm = new Viewmodel(this);
    await this.vm.init();
    this.zombies = new ZombieManager(this);
    await this.zombies.init();
    this.fx = new FX(this, this.renderer.q);
    this.projectiles = new Projectiles(this);
    this.arsenal = new Arsenal(this);
    this.arsenal.give('knife', { select: false });
    this.arsenal.give('glock', { select: false });
    const w = this.arsenal.give(this.startWeapon || 'akm', { select: false });
    if (this.hipOverride && w) w.def = { ...w.def, vm: { hip: this.hipOverride } };
    await this.arsenal.select(w ? Object.keys(this.arsenal.owned).find((k) => this.arsenal.owned[k] === w) | 0 : 1, true);
  }

  addShake(amount) { this.shake = Math.min(1, this.shake + amount); }

  resize(w, h) {
    this.camera.aspect = w / h;
    this._updateFov();
  }

  _updateFov() {
    const a = this.camera.aspect;
    const h = (this.hfov * Math.PI) / 180;
    const v = 2 * Math.atan(Math.tan(h / 2) / a);
    // clamp so tall/narrow windows don't explode the vertical FOV
    const vfov = clamp((v * 180) / Math.PI, 50, 80) / this.zoom;
    if (Math.abs(this.camera.fov - vfov) > 1e-3) { this.camera.fov = vfov; this.camera.updateProjectionMatrix(); }
  }

  frame(dtReal) {
    let dt = dtReal;
    if (this.hitStopT > 0) { this.hitStopT -= dtReal; dt = dtReal * 0.08; }
    this.time += dt;
    const t = this.time;
    const s = this.input.poll();
    const p = this.player;
    if (p) {
      p.yaw -= s.lookX / this.zoom;
      p.pitch = clamp(p.pitch + s.lookY / this.zoom, -1.5, 1.5);
      p.update(dt, s, (this.arsenal?.def?.speed ?? 5.0) * (this.status?.speedMul ?? 1));
      if (p.landImpact > 2.5) this.landDip.impulse(-Math.min(p.landImpact, 14) * 0.09, 0, 0);
    }
    this.world.update(dt, t);
    if (this.arsenal) this.arsenal.update(dt, s);
    this.projectiles?.update(dt);
    if (this.vm && p) {
      this.vm.update(dt, { lookX: s.lookX, lookY: s.lookY, speed: p.horizontalSpeed, onGround: p.onGround,
        landImpact: p.landImpact, crouch: p.crouch, moveX: s.move.x });
    }
    this.status?.update(dt);
    this.zombies?.update(dt);
    for (const sys of [...this.systems]) sys.update(dt, t);
    this.fx?.update(dt);
    this._updateCamera(dt);
    this.hud?.update(dtReal);
    this.touch?.update();
    this.input.endFrame();
  }

  _updateCamera(dt) {
    const p = this.player;
    const cam = this.camera;
    if (!p) return;
    const punch = this.punch.update(dt);
    const dip = this.landDip.update(dt);
    cam.position.set(p.pos.x, p.pos.y + p.eyeHeight + dip.x, p.pos.z);
    this.shake = Math.max(0, this.shake - dt * 1.6);
    const sh = this.shake * this.shake;
    const tt = this.time * 23;
    const sx = sh * 0.045 * (Math.sin(tt * 1.1) + Math.sin(tt * 2.3 + 1.7) * 0.5);
    const sy = sh * 0.045 * (Math.sin(tt * 1.3 + 4.1) + Math.sin(tt * 2.9 + 0.3) * 0.5);
    const sz = sh * 0.06 * Math.sin(tt * 0.9 + 2.2);
    const ar = this.arsenal;
    const rp = ar ? ar.recoilPitch * Math.PI / 180 : 0, ry = ar ? ar.recoilYaw * Math.PI / 180 : 0;
    cam.rotation.set(p.pitch * -1 + rp + punch.x + sx, p.yaw + ry + punch.y + sy, punch.z + sz);
    if (!Number.isFinite(cam.rotation.x + cam.rotation.y + cam.rotation.z + cam.position.x + cam.position.y + cam.position.z)) {
      // never let a bad spring/impulse blank the screen: reset the offending state
      console.warn('camera NaN reset', JSON.stringify({ punch: this.punch.x, dip: this.landDip.x, shake: this.shake, rp: ar?.recoilPitch, ry: ar?.recoilYaw, yaw: p.yaw, pitch: p.pitch, pos: p.pos, vel: p.vel }));
      this.punch.reset(); this.landDip.reset(); this.shake = 0;
      if (ar) { ar.recoilPitch = 0; ar.recoilYaw = 0; }
      if (!Number.isFinite(p.yaw)) p.yaw = 0;
      if (!Number.isFinite(p.pitch)) p.pitch = 0;
      if (!Number.isFinite(p.pos.x + p.pos.y + p.pos.z)) { p.pos.copy(this.world.safePoint()); p.vel.set(0, 0, 0); }
      cam.position.set(p.pos.x, p.pos.y + p.eyeHeight, p.pos.z);
      cam.rotation.set(-p.pitch, p.yaw, 0);
    }
    // ADS zoom + sniper scope overlay
    const def = this.arsenal?.def;
    const aim = this.vm?.aim ?? 0;
    const zt = def?.ads?.zoom ?? (this.vm?.weapon?.has('optic') ? 1.35 : 1.18);
    this.zoom = 1 + (zt - 1) * aim;
    const scoped = def?.ads?.scope && aim > 0.85;
    this.renderer.post.scopeMask = scoped ? 1 : 0;
    if (this.vm) this.vm.visible = !scoped;
    this._updateFov();
    cam.updateMatrixWorld();
    if (this.audio) {
      cam.getWorldDirection(this._fwd || (this._fwd = new THREE.Vector3()));
      this.audio.setListener(cam.position, this._fwd, (this._up || (this._up = new THREE.Vector3())).set(0, 1, 0).applyQuaternion(cam.quaternion));
    }
  }

  render() {
    if (this.debugView) {
      // external view of the viewmodel rig (dev): camera placed relative to the player camera
      const dc = this.debugCam || (this.debugCam = new THREE.PerspectiveCamera(40, 1, 0.01, 100));
      dc.aspect = this.camera.aspect; dc.updateProjectionMatrix();
      const off = { side: [0.75, -0.1, -0.25], top: [0.05, 0.8, -0.3], front: [0.1, -0.05, -1.2], left: [-0.75, -0.1, -0.25] }[this.debugView] || [0.75, 0, 0];
      dc.position.set(...off).applyMatrix4(this.camera.matrixWorld);
      dc.lookAt(new THREE.Vector3(0.05, -0.15, -0.3).applyMatrix4(this.camera.matrixWorld));
      dc.updateMatrixWorld();
      this.vm.vmCam.copy(dc); // vmProj follows the debug camera's projection
      import('./gfx/materials.js').then((m) => m.materialUniforms.vmProj.value.copy(dc.projectionMatrix));
      this.renderer.render(this.scene, dc, this.time);
      return;
    }
    this.renderer.render(this.scene, this.camera, this.time);
  }
}
