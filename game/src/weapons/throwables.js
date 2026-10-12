// Quick-throw grenades (no weapon switch, mobile friendly): frag (HE) and incendiary. Physics arc with
// bounces, fuse or impact detonation, splash damage to zombies, burning ground zones.
import * as THREE from 'three';
import { splash } from './ballistics.js';
import { haptic } from './arsenal.js';

export const THROWABLES = {
  frag: { zh: '破片手雷', price: 300, max: 3, fuse: 1.7, dmg: 320, radius: 6.5, knock: 9, speed: 17, color: 0x4b5536 },
  fire: { zh: '燃燒彈', price: 450, max: 2, impact: true, radius: 4.2, burn: 7, dps: 60, speed: 15, color: 0x7a5a2a },
};

function grenadeMesh(kind) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.038, 14, 10), new THREE.MeshStandardMaterial({ color: THROWABLES[kind].color, roughness: 0.6, metalness: 0.2 }));
  body.scale.y = kind === 'fire' ? 1.5 : 1.15;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.03, 10), new THREE.MeshStandardMaterial({ color: 0x8a8a8a, metalness: 1, roughness: 0.35 }));
  cap.position.y = 0.05;
  g.add(body, cap);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export class Throwables {
  constructor(game) {
    this.game = game;
    this.count = { frag: 2, fire: 0 };
    this.selected = 'frag';
    this.cd = 0;
    this.fireZones = [];
  }

  buy(kind) {
    const t = THROWABLES[kind], m = this.game.match;
    if (!t || !m || !m.canBuy() || this.count[kind] >= t.max || m.money < t.price) { this.game.audio?.play('ui_deny'); return false; }
    m.money -= t.price;
    this.count[kind]++;
    this.game.audio?.play('ui_buy');
    return true;
  }

  throw() {
    const g = this.game;
    let kind = this.selected;
    if (!this.count[kind]) kind = Object.keys(this.count).find((k) => this.count[k] > 0);
    if (!kind || this.cd > 0) { if (!kind) g.hud?.toast('沒有投擲物'); return; }
    this.count[kind]--;
    this.cd = 0.9;
    const t = THROWABLES[kind];
    const cam = g.camera;
    const dir = cam.getWorldDirection(new THREE.Vector3());
    const pos = cam.position.clone().addScaledVector(dir, 0.4).add(new THREE.Vector3(0.12, -0.1, 0).applyQuaternion(cam.quaternion));
    const vel = dir.multiplyScalar(t.speed).add(new THREE.Vector3(0, 3.2, 0)).add(g.player.vel);
    g.vm.lowered = 0.6;
    g.audio?.play('swing', { volume: 0.7 });
    g.audio?.play('grenade_pin', { volume: 0.8 });
    haptic(15);
    const mesh = grenadeMesh(kind);
    const spin = new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10);
    g.projectiles.spawn({
      pos, vel, gravity: 9.8, radius: 0.05, mesh, faceVelocity: false, hitTargets: !!t.impact, life: 8,
      fuse: t.impact ? undefined : t.fuse, bounce: t.impact ? 0 : 0.35,
      onUpdate: (p, dt) => { mesh.rotation.x += spin.x * dt; mesh.rotation.y += spin.y * dt; mesh.rotation.z += spin.z * dt; },
      onBounce: (p) => g.audio?.play('grenade_bounce', { pos: p.pos, volume: Math.min(1, p.vel.length() / 8) }),
      onFuse: (p) => this._detonate(kind, p.pos),
      onHit: (p, point) => { this._detonate(kind, point); return true; },
    });
    g.net?.fxThrow?.(kind, pos, vel);
  }

  _detonate(kind, at) {
    const g = this.game, t = THROWABLES[kind];
    const pos = at.clone();
    const d = pos.distanceTo(g.camera.position);
    if (kind === 'frag') {
      g.fx?.explosion(pos, { radius: t.radius, scale: 1 });
      g.audio?.play(d > 40 ? 'explosion_far' : 'explosion_small', { pos });
      splash(g, pos, t.radius, t.dmg * (g.arsenal?.dmgMul ?? 1), { knock: t.knock, shooter: g.localId, weapon: 'frag' });
      g.addShake(Math.max(0, 0.9 - d / 25));
      if (d < 8) haptic(60);
    } else {
      g.audio?.play('fire_burst', { pos });
      this.fireZones.push({ pos: pos.clone(), r: t.radius, t: t.burn, dps: t.dps, tick: 0 });
      g.fx?.explosion(pos, { radius: t.radius * 0.6, scale: 0.5, color: [1, 0.45, 0.12] });
    }
    g.noise?.(pos, 40);
  }

  update(dt) {
    const g = this.game;
    this.cd = Math.max(0, this.cd - dt);
    if (g.input.state.pressed.grenade) this.throw();
    for (let i = this.fireZones.length - 1; i >= 0; i--) {
      const f = this.fireZones[i];
      f.t -= dt;
      f.tick -= dt;
      if (f.t <= 0) { this.fireZones.splice(i, 1); continue; }
      // flames
      for (let k = 0; k < 3; k++) {
        const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * f.r;
        g.fx?.particles.spawn({ additive: true, x: f.pos.x + Math.cos(a) * r, y: f.pos.y + 0.05, z: f.pos.z + Math.sin(a) * r, vx: 0, vy: 1.2 + Math.random() * 1.5, vz: 0, life: 0.5 + Math.random() * 0.4, size: 0.35, size1: 0.9, color: [5, 2.2, 0.6, 1], color1: [1, 0.25, 0.05, 0], frame: 10, spin: 2 });
      }
      if (Math.random() < dt * 4) g.fx?.particles.spawn({ x: f.pos.x, y: f.pos.y + 1, z: f.pos.z, vx: (Math.random() - 0.5), vy: 1.5, vz: (Math.random() - 0.5), life: 3, size: 1, size1: 4, color: [0.12, 0.1, 0.09, 0.5], color1: [0.2, 0.2, 0.2, 0], frame: 2, drag: 0.8 });
      if (f.tick <= 0) {
        f.tick = 0.25;
        for (const z of g.zombies?.inRadius(f.pos, f.r) || []) {
          z.damage({ amount: f.dps * 0.25 * (g.arsenal?.dmgMul ?? 1), part: 'body', dir: new THREE.Vector3(0, 0, 0), knock: 0, stagger: 0, weapon: 'fire', shooter: g.localId, burn: true });
        }
      }
    }
  }
}
