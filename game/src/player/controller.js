// First-person movement: Source/CS-style acceleration + friction + air control, capsule collision
// against the world BVH, crouch, jump, landing impact reporting (for camera dip and sounds).
import * as THREE from 'three';
import { clamp, damp } from '../engine/util.js';

export const MOVE = {
  gravity: 15.2,
  jumpSpeed: 5.4,        // ~0.96 m jump
  accel: 6.5,
  airAccel: 12,
  airCap: 0.75,          // max wish speed in the air (allows strafing, not flying)
  friction: 5.0,
  stopSpeed: 2.0,
  radius: 0.34,
  height: 1.80,
  crouchHeight: 1.20,
  eye: 1.64,
  crouchEye: 1.10,
  crouchSpeed: 0.42,
  stepHeight: 0.45,
};

const _wish = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _push = new THREE.Vector3();
const _prev = new THREE.Vector3();

export class PlayerController {
  constructor(world) {
    this.world = world;
    this.pos = new THREE.Vector3();   // feet
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.crouch = 0;                  // 0 standing .. 1 crouched (smoothed)
    this.crouching = false;
    this.height = MOVE.height;
    this.eyeHeight = MOVE.eye;
    this.landImpact = 0;              // set on the frame of landing: downward speed
    this.groundTime = 0;
    this.airTime = 0;
    this.stepAccum = 0;               // distance walked, drives footsteps + bob
    this.speedScale = 1;              // weapon weight / status effects
    this.knock = new THREE.Vector3(); // external impulses (boss hits) applied next update
    this.noclip = false;
  }

  get eye() { return _a.set(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z); }

  forward(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, -Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  addImpulse(x, y, z) { this.knock.x += x; this.knock.y += y; this.knock.z += z; }

  update(dt, input, maxSpeed) {
    this.landImpact = 0;
    const want = input.held.crouch;
    // can't stand up under a low ceiling
    if (!want && this.crouching) {
      _a.set(this.pos.x, this.pos.y + MOVE.radius, this.pos.z);
      _b.set(this.pos.x, this.pos.y + MOVE.height - MOVE.radius, this.pos.z);
      if (!this.world.collision.sphereHits(_b, MOVE.radius * 0.95)) this.crouching = false;
    } else if (want) this.crouching = true;
    this.crouch = damp(this.crouch, this.crouching ? 1 : 0, 14, dt);
    this.height = MOVE.height + (MOVE.crouchHeight - MOVE.height) * this.crouch;
    this.eyeHeight = MOVE.eye + (MOVE.crouchEye - MOVE.eye) * this.crouch;

    // wish direction from the stick / keys (analog magnitude scales speed)
    const mx = input.move.x, my = input.move.y;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    _wish.set(-sy * my + cy * mx, 0, -cy * my - sy * mx);
    let wishSpeed = Math.min(1, _wish.length()) * maxSpeed * this.speedScale;
    if (_wish.lengthSq() > 1e-6) _wish.normalize();
    if (this.crouching) wishSpeed *= MOVE.crouchSpeed;

    if (this.onGround) {
      // friction
      const speed = Math.hypot(this.vel.x, this.vel.z);
      if (speed > 0) {
        const control = Math.max(speed, MOVE.stopSpeed);
        const drop = control * MOVE.friction * dt;
        const ns = Math.max(0, speed - drop) / speed;
        this.vel.x *= ns; this.vel.z *= ns;
      }
      this._accelerate(_wish, wishSpeed, MOVE.accel, dt);
      if (input.pressed.jump || (input.held.jump && this.groundTime > 0.05 && this.autoJump)) {
        this.vel.y = MOVE.jumpSpeed;
        this.onGround = false;
        this.jumped = true;
      }
    } else {
      this._accelerate(_wish, Math.min(wishSpeed, MOVE.airCap), MOVE.airAccel, dt);
      this.vel.y -= MOVE.gravity * dt;
    }
    if (this.knock.lengthSq() > 0) {
      this.vel.add(this.knock);
      if (this.knock.y > 0.5) this.onGround = false;
      this.knock.set(0, 0, 0);
    }

    // integrate in sub-steps so fast falls / knockbacks cannot tunnel through thin walls
    _prev.copy(this.pos);
    const dist = this.vel.length() * dt;
    const steps = clamp(Math.ceil(dist / (MOVE.radius * 0.8)), 1, 6);
    const h = dt / steps;
    const wasGround = this.onGround;
    let grounded = false;
    const fallSpeed = -this.vel.y;
    for (let i = 0; i < steps; i++) {
      this.pos.addScaledVector(this.vel, h);
      if (this.onGround) this.pos.y -= 0.06; // stick to slopes / stairs going down
      if (this.noclip) continue;
      _a.set(this.pos.x, this.pos.y + MOVE.radius, this.pos.z);
      _b.set(this.pos.x, this.pos.y + this.height - MOVE.radius, this.pos.z);
      this.world.collision.resolveCapsule(_a, _b, MOVE.radius, _push);
      this.pos.set(_a.x, _a.y - MOVE.radius, _a.z);
      if (_push.y > Math.abs(_push.x) + Math.abs(_push.z) * 0.6 && _push.y > 1e-5) {
        grounded = true;
        if (this.vel.y < 0) this.vel.y = 0;
      } else if (_push.y < -1e-5 && this.vel.y > 0) {
        this.vel.y = 0; // head bump
      }
      if (_push.lengthSq() > 1e-10) {
        // remove velocity into the surface
        _a.copy(_push).normalize();
        const into = this.vel.dot(_a);
        if (into < 0) this.vel.addScaledVector(_a, -into);
      }
    }
    if (!grounded && this.onGround && this.vel.y <= 0) {
      // walked off a ledge: undo the stick-down
      this.pos.y += 0.06 * steps;
    }
    this.onGround = grounded;
    if (this.onGround && !wasGround) {
      this.landImpact = fallSpeed;
      this.airTime = 0;
    }
    if (this.onGround) { this.groundTime += dt; this.airTime = 0; } else { this.groundTime = 0; this.airTime += dt; }
    if (this.onGround) this.stepAccum += Math.hypot(this.pos.x - _prev.x, this.pos.z - _prev.z);

    // fell out of the world: back to the last safe point
    if (this.pos.y < (this.world.killY ?? -50)) { this.pos.copy(this.world.safePoint(this.pos)); this.vel.set(0, 0, 0); }
  }

  _accelerate(dir, wishSpeed, accel, dt) {
    const cur = this.vel.x * dir.x + this.vel.z * dir.z;
    const add = wishSpeed - cur;
    if (add <= 0) return;
    const a = Math.min(accel * wishSpeed * dt, add);
    this.vel.x += a * dir.x;
    this.vel.z += a * dir.z;
  }

  get horizontalSpeed() { return Math.hypot(this.vel.x, this.vel.z); }
}
