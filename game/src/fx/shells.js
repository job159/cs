// Ejected casings: instanced brass / shotgun hulls / MG links with simple rigid-body tumbling and
// bounces on the floor height under the ejection point. Emits a 'clink' callback on bounces.
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3(1, 1, 1);
const _p = new THREE.Vector3();

function caseGeo(type) {
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
  const g = new THREE.LatheGeometry(P.map(([r, y]) => new THREE.Vector2(r * 0.001, y * 0.001 - 0.01)), 12);
  return g;
}

export class Shells {
  constructor(scene, onClink) {
    this.scene = scene;
    this.onClink = onClink;
    this.pools = {};
    const brass = new THREE.MeshStandardMaterial({ color: 0xc89b4e, metalness: 1, roughness: 0.32 });
    const red = new THREE.MeshStandardMaterial({ color: 0x8a1810, metalness: 0, roughness: 0.5 });
    for (const t of ['9mm', '45', '556', '762', '792', '338', '50', '12g']) {
      const mesh = new THREE.InstancedMesh(caseGeo(t), t === '12g' ? red : brass, 40);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(mesh);
      this.pools[t] = { mesh, items: [] };
    }
  }

  spawn(type, pos, vel, floorY) {
    const pool = this.pools[type];
    if (!pool) return;
    if (pool.items.length >= 40) pool.items.shift();
    pool.items.push({
      p: pos.clone(), v: vel.clone(), r: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      w: new THREE.Vector3((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 40),
      floor: floorY, age: 0, bounces: 0, rest: false, type,
    });
  }

  update(dt) {
    for (const key in this.pools) {
      const pool = this.pools[key];
      const items = pool.items;
      for (let i = items.length - 1; i >= 0; i--) {
        const s = items[i];
        s.age += dt;
        if (s.age > 6) { items.splice(i, 1); continue; }
        if (!s.rest) {
          s.v.y -= 15 * dt;
          s.v.multiplyScalar(1 - 0.4 * dt);
          s.p.addScaledVector(s.v, dt);
          s.r.x += s.w.x * dt; s.r.y += s.w.y * dt; s.r.z += s.w.z * dt;
          if (s.p.y < s.floor + 0.005) {
            s.p.y = s.floor + 0.005;
            if (Math.abs(s.v.y) > 0.6 && s.bounces < 3) {
              this.onClink?.(s.type, s.p, Math.min(1, Math.abs(s.v.y) / 4));
              s.v.y = -s.v.y * 0.35; s.v.x *= 0.55; s.v.z *= 0.55; s.w.multiplyScalar(0.5); s.bounces++;
            } else {
              s.rest = true; s.r.x = Math.PI / 2; s.r.z = 0;
            }
          }
        } else if (s.age > 5) s.p.y -= dt * 0.05;
      }
      const mesh = pool.mesh;
      for (let i = 0; i < items.length; i++) {
        _m.compose(items[i].p, _q.setFromEuler(items[i].r), _s);
        mesh.setMatrixAt(i, _m);
      }
      mesh.count = items.length;
      if (items.length) mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
