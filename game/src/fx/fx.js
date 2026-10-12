// Effects facade used by weapons, zombies and the world: muzzle flashes (first person + third person),
// tracers, surface impacts, blood, explosions, decals, casings and flash lights.
import * as THREE from 'three';
import { Particles } from './particles.js';
import { FRAME } from './atlas.js';
import { Decals, DECAL_TINT } from './decals.js';
import { Shells } from './shells.js';
import { LightPool } from './lights.js';
import { SURF } from '../world/collision.js';

const R = Math.random;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _t = new THREE.Vector3();
const _b = new THREE.Vector3();

// Muzzle flash presets: core/star sizes (m), side-flash length factor, smoke puffs, light peak
const FLASH = {
  pistol: { core: 0.07, star: 0.12, side: 0.08, smoke: 1, light: 4, sparks: 2 },
  magnum: { core: 0.12, star: 0.26, side: 0.2, smoke: 3, light: 8, sparks: 6 },
  smg: { core: 0.08, star: 0.15, side: 0.12, smoke: 1, light: 5, sparks: 2 },
  rifle: { core: 0.1, star: 0.2, side: 0.2, smoke: 2, light: 6, sparks: 3 },
  mg: { core: 0.12, star: 0.24, side: 0.24, smoke: 2, light: 7, sparks: 3 },
  shotgun: { core: 0.15, star: 0.34, side: 0.3, smoke: 4, light: 9, sparks: 10 },
  sniper: { core: 0.14, star: 0.3, side: 0.42, smoke: 5, light: 10, sparks: 6 },
  rocket: { core: 0.25, star: 0.3, side: 0.5, smoke: 10, light: 12, sparks: 12 },
};

export class FX {
  constructor(game, quality) {
    this.game = game;
    this.scene = game.scene;
    this.particles = new Particles(this.scene, game.camera, quality);
    this.decals = new Decals(this.scene, this.particles.atlas, quality?.decals ?? 160, this.particles.shared.ambient);
    this.shells = new Shells(this.scene, (type, pos, vol) => game.audio?.play(type === '12g' ? 'shell_shotgun' : 'shell_brass', { pos, volume: 0.5 + vol * 0.5 }));
    this.lights = new LightPool(this.scene, quality?.maxLights ?? 4);
    this.particles.floorFn = (x, z) => this._floorAt(x, z);
    this._floorCache = { x: 1e9, z: 1e9, y: 0 };
  }

  _floorAt(x, z) {
    // cheap floor estimate for particle bounces: cache one raycast per ~1 m cell
    const c = this._floorCache;
    if (Math.abs(c.x - x) > 1 || Math.abs(c.z - z) > 1) {
      c.x = x; c.z = z;
      c.y = this.game.world.collision ? this.game.world.collision.floorBelow(_t.set(x, this.game.camera.position.y + 1, z), 0, 60) : 0;
      if (!isFinite(c.y)) c.y = -100;
    }
    return c.y;
  }

  update(dt) {
    this.particles.update(dt);
    this.shells.update(dt);
    this.lights.update(dt);
  }

  /**
   * Muzzle flash. pos: world position of the muzzle, dir: barrel direction, vm: render through the
   * viewmodel projection (local player's gun). lightPos: true world position for the flash light.
   */
  muzzle(kind, pos, dir, { vm = false, lightPos = null, scale = 1, color = null } = {}) {
    const f = FLASH[kind] || FLASH.rifle;
    const s = scale;
    const P = this.particles;
    const hot = color || [6, 3.4, 1.4, 1];
    P.spawn({ vm, additive: true, x: pos.x, y: pos.y, z: pos.z, life: 0.045, size: f.core * 2.2 * s, size1: f.core * 2.6 * s, color: hot, frame: FRAME.glow });
    P.spawn({ vm, additive: true, x: pos.x + dir.x * f.star * 0.3, y: pos.y + dir.y * f.star * 0.3, z: pos.z + dir.z * f.star * 0.3, life: 0.04, size: f.star * s * (0.85 + R() * 0.3), size1: f.star * s * 1.1, color: [hot[0] * 0.7, hot[1] * 0.7, hot[2] * 0.7, 1], frame: R() < 0.5 ? FRAME.flash : FRAME.flash2, rot: R() * 6.28 });
    // forward cone: a velocity-stretched quad along the barrel
    const fw = f.side * 18 * s;
    P.spawn({ vm, additive: true, x: pos.x + dir.x * f.side * 0.5, y: pos.y + dir.y * f.side * 0.5, z: pos.z + dir.z * f.side * 0.5, vx: dir.x * fw, vy: dir.y * fw, vz: dir.z * fw, life: 0.035, size: f.core * 1.1 * s, color: [hot[0] * 0.6, hot[1] * 0.55, hot[2] * 0.5, 1], frame: FRAME.flashSide, stretch: 0.05 });
    for (let i = 0; i < f.sparks; i++) {
      const sp = 8 + R() * 10;
      P.spawn({ vm: false, additive: true, x: (lightPos || pos).x, y: (lightPos || pos).y, z: (lightPos || pos).z,
        vx: (dir.x + (R() - 0.5) * 0.4) * sp, vy: (dir.y + (R() - 0.5) * 0.4) * sp, vz: (dir.z + (R() - 0.5) * 0.4) * sp,
        life: 0.08 + R() * 0.08, size: 0.012, color: [5, 2.6, 0.9, 1], frame: FRAME.spark, stretch: 0.02, gravity: 6 });
    }
    const sm = lightPos || pos;
    for (let i = 0; i < f.smoke; i++) {
      P.spawn({ additive: false, x: sm.x + dir.x * 0.05, y: sm.y + dir.y * 0.05, z: sm.z + dir.z * 0.05,
        vx: dir.x * (0.6 + R() * 0.8) + (R() - 0.5) * 0.3, vy: dir.y * 0.6 + 0.25 + R() * 0.2, vz: dir.z * (0.6 + R() * 0.8) + (R() - 0.5) * 0.3,
        life: 0.9 + R() * 0.8, size: 0.05 * s, size1: 0.45 * s, color: [0.75, 0.74, 0.72, 0.22], color1: [0.7, 0.7, 0.7, 0], frame: FRAME.smoke, drag: 1.5, spin: (R() - 0.5) * 1.5 });
    }
    this.lights.flash(lightPos || pos, kind === 'rocket' ? 0xffb070 : 0xffa860, f.light * 6, 6 + f.light * 0.5, 0.05);
  }

  tracer(from, to, { color = [9, 6.5, 3, 1], speed = 420, width = 0.018 } = {}) {
    _v.subVectors(to, from);
    const d = _v.length();
    if (d < 2) return;
    _v.multiplyScalar(1 / d);
    this.particles.spawn({ additive: true, x: from.x + _v.x * 1.2, y: from.y + _v.y * 1.2, z: from.z + _v.z * 1.2,
      vx: _v.x * speed, vy: _v.y * speed, vz: _v.z * speed, life: Math.max(0.02, (d - 1.5) / speed), size: width, color, color1: color, frame: FRAME.spark, stretch: 0.011 });
  }

  /** Bullet impact on the world. */
  impact(surf, point, normal, dir, { decal = true, big = 1 } = {}) {
    const P = this.particles;
    const n = normal;
    const refl = _v2.copy(dir).addScaledVector(n, -2 * dir.dot(n)).normalize();
    const spawnDust = (count, col, size, speed, life) => {
      for (let i = 0; i < count; i++) {
        P.spawn({ x: point.x + n.x * 0.04, y: point.y + n.y * 0.04, z: point.z + n.z * 0.04,
          vx: (n.x * 0.8 + refl.x * 0.3 + (R() - 0.5) * 0.7) * speed, vy: (n.y * 0.8 + refl.y * 0.3 + (R() - 0.5) * 0.7) * speed + 0.2, vz: (n.z * 0.8 + refl.z * 0.3 + (R() - 0.5) * 0.7) * speed,
          life: life * (0.7 + R() * 0.6), size: size * 0.4 * big, size1: size * 1.6 * big, color: col, color1: [col[0], col[1], col[2], 0], frame: R() < 0.5 ? FRAME.dust : FRAME.smoke2, drag: 3.5, gravity: 0.3, spin: (R() - 0.5) * 2 });
      }
    };
    const spawnChunks = (count, col, size, speed) => {
      for (let i = 0; i < count; i++) {
        P.spawn({ x: point.x + n.x * 0.02, y: point.y + n.y * 0.02, z: point.z + n.z * 0.02,
          vx: (n.x + (R() - 0.5) * 1.2) * speed * (0.5 + R()), vy: (n.y + (R() - 0.2) * 1.2) * speed * (0.5 + R()), vz: (n.z + (R() - 0.5) * 1.2) * speed * (0.5 + R()),
          life: 0.6 + R() * 0.6, size: size * (0.5 + R()), color: col, color1: [col[0], col[1], col[2], 1], frame: FRAME.chunk, gravity: 9.8, spin: (R() - 0.5) * 20, collide: true });
      }
    };
    const spawnSparks = (count, speed) => {
      for (let i = 0; i < count; i++) {
        const sp = speed * (0.4 + R());
        P.spawn({ additive: true, x: point.x, y: point.y, z: point.z,
          vx: (refl.x + (R() - 0.5) * 0.9) * sp, vy: (refl.y + (R() - 0.3) * 0.9) * sp, vz: (refl.z + (R() - 0.5) * 0.9) * sp,
          life: 0.12 + R() * 0.25, size: 0.008, color: [6, 3.2, 1, 1], color1: [3, 0.8, 0.1, 1], frame: FRAME.spark, stretch: 0.03, gravity: 9.8, collide: true });
      }
    };
    switch (surf) {
      case SURF.metal: case SURF.grate:
        spawnSparks(10 * big, 9);
        P.spawn({ additive: true, x: point.x + n.x * 0.02, y: point.y + n.y * 0.02, z: point.z + n.z * 0.02, life: 0.05, size: 0.18 * big, color: [4, 2.5, 1, 1], frame: FRAME.glow });
        spawnDust(1, [0.45, 0.44, 0.42, 0.35], 0.2, 0.8, 0.6);
        if (decal) this.decals.add(point, n, { frame: FRAME.hole, size: 0.06 + R() * 0.02, tint: DECAL_TINT.none });
        break;
      case SURF.wood:
        spawnChunks(5 * big, [0.36, 0.25, 0.14, 1], 0.02, 3);
        spawnDust(2, [0.42, 0.34, 0.24, 0.45], 0.22, 1.0, 0.9);
        if (decal) this.decals.add(point, n, { frame: FRAME.hole, size: 0.07 + R() * 0.03 });
        break;
      case SURF.dirt: case SURF.sand:
        spawnChunks(6 * big, [0.25, 0.2, 0.15, 1], 0.018, 3);
        spawnDust(4, [0.42, 0.36, 0.28, 0.55], 0.35, 1.6, 1.3);
        break;
      case SURF.glass:
        spawnChunks(8 * big, [0.8, 0.85, 0.9, 0.8], 0.015, 3.5);
        spawnSparks(2, 4);
        if (decal) this.decals.add(point, n, { frame: FRAME.hole, size: 0.09 });
        break;
      case SURF.water:
        for (let i = 0; i < 10; i++) P.spawn({ x: point.x, y: point.y, z: point.z, vx: (R() - 0.5) * 1.5, vy: 2 + R() * 3, vz: (R() - 0.5) * 1.5, life: 0.6, size: 0.04, size1: 0.1, color: [0.85, 0.9, 0.95, 0.6], color1: [0.85, 0.9, 0.95, 0], frame: FRAME.drop, gravity: 9.8 });
        spawnDust(2, [0.85, 0.88, 0.9, 0.35], 0.3, 1.0, 0.8);
        break;
      case SURF.flesh:
        this.blood(point, n, dir, 1);
        break;
      default: // concrete, tile
        spawnChunks(5 * big, [0.42, 0.41, 0.39, 1], 0.016, 3.2);
        spawnDust(3, [0.55, 0.54, 0.51, 0.5], 0.3, 1.3, 1.2);
        spawnSparks(1, 5);
        if (decal) this.decals.add(point, n, { frame: FRAME.hole, size: 0.07 + R() * 0.03 });
    }
  }

  /** Blood burst at a hit point; amount ~ damage scale (1 normal, 2 headshot, 3 gib). Also splatters the world behind. */
  blood(point, normal, dir, amount = 1, { color = [0.42, 0.02, 0.012], acid = false } = {}) {
    const P = this.particles;
    const c = acid ? [0.35, 0.6, 0.05] : color;
    const drops = Math.round(8 * amount);
    for (let i = 0; i < drops; i++) {
      const sp = 1.5 + R() * 3.5 * amount;
      P.spawn({ x: point.x, y: point.y, z: point.z,
        vx: (dir.x * 0.8 + normal.x * 0.4 + (R() - 0.5)) * sp, vy: (dir.y * 0.5 + normal.y * 0.3 + R() * 0.8) * sp, vz: (dir.z * 0.8 + normal.z * 0.4 + (R() - 0.5)) * sp,
        life: 0.45 + R() * 0.5, size: 0.02 + R() * 0.035 * amount, color: [c[0], c[1], c[2], 1], color1: [c[0] * 0.7, c[1] * 0.7, c[2] * 0.7, 0.8], frame: FRAME.drop, gravity: 9.8, stretch: 0.012, collide: true });
    }
    for (let i = 0; i < 2 + amount; i++) {
      P.spawn({ x: point.x, y: point.y, z: point.z, vx: dir.x * 0.6 + (R() - 0.5) * 0.6, vy: 0.2 + R() * 0.4, vz: dir.z * 0.6 + (R() - 0.5) * 0.6,
        life: 0.5 + R() * 0.5, size: 0.12 * amount, size1: 0.5 + 0.3 * amount, color: [c[0], c[1], c[2], 0.55], color1: [c[0], c[1], c[2], 0], frame: FRAME.mist, drag: 2.5, spin: (R() - 0.5) * 2 });
    }
    // splatter on the wall/floor behind the target
    const col = this.game.world.collision;
    if (col) {
      _b.copy(dir).normalize();
      _b.y -= 0.15 + R() * 0.2;
      _b.normalize();
      const hit = col.raycast(point, _b, 3.5);
      if (hit) this.decals.add(hit.point, hit.normal, { frame: FRAME.splat, size: 0.4 + R() * 0.5 * amount, tint: acid ? DECAL_TINT.acid : DECAL_TINT.blood, alpha: 0.9 });
      const down = col.raycast(point, _t.set(0, -1, 0), 3);
      if (down && R() < 0.6) this.decals.add(down.point, down.normal, { frame: FRAME.splat, size: 0.3 + R() * 0.4 * amount, tint: acid ? DECAL_TINT.acid : DECAL_TINT.blood, alpha: 0.85 });
    }
  }

  /** Flesh chunks (dismemberment / gibs). */
  gibs(point, dir, count = 6, color = [0.3, 0.05, 0.04]) {
    for (let i = 0; i < count; i++) {
      const sp = 2 + R() * 4;
      this.particles.spawn({ x: point.x, y: point.y, z: point.z, vx: (dir.x + (R() - 0.5) * 1.4) * sp, vy: (0.6 + R()) * sp, vz: (dir.z + (R() - 0.5) * 1.4) * sp,
        life: 1.2 + R(), size: 0.035 + R() * 0.05, color: [color[0], color[1], color[2], 1], color1: [color[0], color[1], color[2], 1], frame: FRAME.chunk, gravity: 9.8, spin: (R() - 0.5) * 15, collide: true });
    }
  }

  explosion(pos, { radius = 5, scale = 1, color = [1, 0.55, 0.22] } = {}) {
    const P = this.particles;
    const s = scale;
    P.spawn({ additive: true, x: pos.x, y: pos.y + 0.3, z: pos.z, life: 0.18, size: 3 * s, size1: 5 * s, color: [25 * color[0], 25 * color[1], 25 * color[2], 1], frame: FRAME.glow });
    for (let i = 0; i < 14; i++) {
      const a = R() * 6.28, sp = 2 + R() * 5;
      P.spawn({ additive: true, x: pos.x, y: pos.y + 0.4, z: pos.z, vx: Math.cos(a) * sp * s, vy: (1 + R() * 3) * s, vz: Math.sin(a) * sp * s,
        life: 0.45 + R() * 0.35, size: 0.7 * s, size1: 2.2 * s, color: [8 * color[0], 8 * color[1], 8 * color[2], 1], color1: [1.2, 0.3, 0.05, 0], frame: FRAME.flame, drag: 3, spin: (R() - 0.5) * 3 });
    }
    for (let i = 0; i < 16; i++) {
      const a = R() * 6.28, sp = 1 + R() * 3;
      P.spawn({ x: pos.x + (R() - 0.5), y: pos.y + 0.5 + R(), z: pos.z + (R() - 0.5), vx: Math.cos(a) * sp, vy: 1.2 + R() * 1.6, vz: Math.sin(a) * sp,
        life: 2.5 + R() * 2.5, size: 1.2 * s, size1: 5 * s, color: [0.16, 0.15, 0.14, 0.75], color1: [0.3, 0.29, 0.28, 0], frame: R() < 0.5 ? FRAME.smoke : FRAME.smoke2, drag: 1.2, gravity: -0.15, spin: (R() - 0.5) * 0.8 });
    }
    for (let i = 0; i < 24; i++) {
      const sp = 6 + R() * 14;
      P.spawn({ additive: true, x: pos.x, y: pos.y + 0.3, z: pos.z, vx: (R() - 0.5) * sp, vy: R() * sp * 0.8, vz: (R() - 0.5) * sp,
        life: 0.5 + R() * 0.8, size: 0.02, color: [6, 3, 0.8, 1], color1: [3, 0.6, 0.1, 1], frame: FRAME.ember, stretch: 0.02, gravity: 9.8, collide: true });
    }
    for (let i = 0; i < 12; i++) {
      const sp = 4 + R() * 8;
      P.spawn({ x: pos.x, y: pos.y + 0.2, z: pos.z, vx: (R() - 0.5) * sp, vy: 2 + R() * sp * 0.6, vz: (R() - 0.5) * sp,
        life: 1 + R(), size: 0.06 + R() * 0.08, color: [0.12, 0.1, 0.09, 1], color1: [0.12, 0.1, 0.09, 1], frame: FRAME.chunk, gravity: 9.8, spin: (R() - 0.5) * 20, collide: true });
    }
    P.spawn({ additive: true, x: pos.x, y: pos.y + 0.3, z: pos.z, life: 0.3, size: 0.5, size1: radius * 2.4, color: [3, 2, 1.2, 1], color1: [1, 0.6, 0.3, 0], frame: FRAME.ring });
    this.lights.flash(_t.set(pos.x, pos.y + 1, pos.z), 0xffa050, 400 * s, radius * 4, 0.35);
    const col = this.game.world.collision;
    if (col) {
      const down = col.raycast(_t.set(pos.x, pos.y + 0.5, pos.z), _v.set(0, -1, 0), 3);
      if (down) this.decals.add(down.point, down.normal, { frame: FRAME.splat, size: radius * 0.9, tint: DECAL_TINT.scorch, alpha: 0.9 });
    }
  }
}
