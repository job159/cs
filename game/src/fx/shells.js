// Ejected casings: instanced brass / shotgun hulls / MG belt links with rigid-body tumbling (15-25 rev/s,
// CS2), floor bounces with a 'clink' callback, a short specular glint while they fly, then they rest and
// sink away.
import * as THREE from 'three';
import { FRAME } from './atlas.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1), _s2 = new THREE.Vector3();
const _ax = new THREE.Vector3();

function caseGeo(type) {
  if (type === 'link') {
    // M27-style link: a bent strip with two loops (good enough at casing scale)
    const g = new THREE.BoxGeometry(0.013, 0.0025, 0.017);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + Math.cos(p.getX(i) * 180) * 0.0025);
    g.computeVertexNormals();
    return g;
  }
  // lathe profiles in mm (radius, length) along +y, then scaled
  const P = {
    '9mm': [[0, 0], [4.9, 0], [4.9, 1], [4.6, 1.3], [4.75, 19], [4.4, 19], [0, 19]],
    '45': [[0, 0], [6, 0], [6, 1.2], [5.6, 1.5], [6, 23], [5.6, 23], [0, 23]],
    '556': [[0, 0], [4.8, 0], [4.8, 1.1], [4.4, 1.5], [4.7, 36], [3.2, 39], [3.2, 44.7], [2.8, 44.7], [0, 44.7]],
    '762': [[0, 0], [5.6, 0], [5.6, 1.4], [5.1, 1.8], [5.5, 30], [4.2, 33], [4.2, 38.7], [3.8, 38.7], [0, 38.7]],
    '792': [[0, 0], [5.9, 0], [5.9, 1.4], [5.4, 2], [5.9, 48], [4.4, 51], [4.4, 57], [4, 57], [0, 57]],
    '338': [[0, 0], [7.4, 0], [7.4, 1.6], [6.9, 2.2], [7.4, 58], [4.8, 62], [4.8, 69], [4.4, 69], [0, 69]],
    '50': [[0, 0], [10.5, 0], [10.5, 2], [10, 2.6], [10.4, 85], [7, 92], [7, 99], [6.6, 99], [0, 99]],
    '12g': [[0, 0], [10.5, 0], [10.5, 1.4], [10.1, 1.8], [10.2, 70], [9.4, 70], [0, 70]],
  }[type] || [[0, 0], [5, 0], [5, 30], [0, 30]];
  return new THREE.LatheGeometry(P.map(([r, y]) => new THREE.Vector2(r * 0.001, y * 0.001 - 0.01)), 12);
}

const TYPES = ['9mm', '45', '556', '762', '792', '338', '50', '12g', 'link'];

export class Shells {
  constructor(scene, onClink, particles = null, { max = 40, rest = 5 } = {}) {
    this.scene = scene;
    this.onClink = onClink;
    this.particles = particles;
    this.max = max;
    this.restTime = rest;
    this.pools = {};
    const brass = new THREE.MeshStandardMaterial({ color: 0xc89b4e, metalness: 1, roughness: 0.28 });
    const red = new THREE.MeshStandardMaterial({ color: 0x8a1810, metalness: 0, roughness: 0.45 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x2c2d30, metalness: 0.8, roughness: 0.45 });
    for (const t of TYPES) {
      const mesh = new THREE.InstancedMesh(caseGeo(t), t === '12g' ? red : t === 'link' ? steel : brass, max);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(mesh);
      this.pools[t] = { mesh, items: [] };
    }
  }

  /** opts.scale: start size (a first-person ejection right by the eye), growing to 1 over its first 0.5 s */
  spawn(type, pos, vel, floorY, opts = {}) {
    const pool = this.pools[type];
    if (!pool) return;
    if (pool.items.length >= this.max) pool.items.shift();
    // tumble end over end around an axis perpendicular to the case (15-25 rev/s) + a little roll
    const tumble = (95 + Math.random() * 60) * (Math.random() < 0.5 ? -1 : 1);
    const ax = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
    pool.items.push({
      p: pos.clone(), v: vel.clone(), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6)),
      ax, w: tumble, roll: (Math.random() - 0.5) * 30,
      floor: floorY, age: 0, bounces: 0, rest: false, type, scale: opts.scale ?? 1, glint: type !== 'link' && type !== '12g' ? 0.35 : 0, seed: Math.random() * 6,
    });
  }

  update(dt) {
    for (const key in this.pools) {
      const pool = this.pools[key];
      const items = pool.items;
      for (let i = items.length - 1; i >= 0; i--) {
        const s = items[i];
        s.age += dt;
        if (s.age > this.restTime + 1) { items.splice(i, 1); continue; }
        if (!s.rest) {
          s.v.y -= 13 * dt;
          s.v.multiplyScalar(1 - 0.4 * dt);
          s.p.addScaledVector(s.v, dt);
          _q.setFromAxisAngle(s.ax, s.w * dt);
          s.q.premultiply(_q);
          _q.setFromAxisAngle(_ax.set(0, 1, 0).applyQuaternion(s.q), s.roll * dt);
          s.q.premultiply(_q);
          if (s.p.y < s.floor + 0.005) {
            s.p.y = s.floor + 0.005;
            if (Math.abs(s.v.y) > 0.6 && s.bounces < 3) {
              this.onClink?.(s.type, s.p, Math.min(1, Math.abs(s.v.y) / 4));
              s.v.y = -s.v.y * 0.35; s.v.x *= 0.55; s.v.z *= 0.55; s.w *= 0.45; s.roll *= 0.5; s.bounces++;
            } else {
              // lie on the side
              s.rest = true;
              const yaw = Math.random() * 6.283;
              s.q.setFromEuler(new THREE.Euler(Math.PI / 2, 0, yaw, 'YXZ'));
            }
          }
          // specular glint while flying (the tumbling case catches the light a few times)
          if (this.particles && s.age < s.glint) {
            const g = Math.pow(Math.max(0, Math.sin(s.age * Math.abs(s.w) * 0.5 + s.seed)), 18);
            if (g > 0.15) {
              this.particles.spawn({ additive: true, x: s.p.x, y: s.p.y, z: s.p.z, life: 0.03, size: 0.035 * g, color: [3.2 * g, 2.6 * g, 1.6 * g, 1], color1: [0, 0, 0, 1], frame: FRAME.glint, rot: Math.random() * 6.28 });
            }
          }
        } else if (s.age > this.restTime) s.p.y -= dt * 0.05;
      }
      const mesh = pool.mesh;
      for (let i = 0; i < items.length; i++) {
        const sc = items[i].scale;
        _m.compose(items[i].p, items[i].q, sc < 1 ? _s2.setScalar(sc + (1 - sc) * Math.min(1, items[i].age / 0.5)) : _s);
        mesh.setMatrixAt(i, _m);
      }
      mesh.count = items.length;
      if (items.length) mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
