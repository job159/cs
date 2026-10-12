// 屠宰者 THE BUTCHER — round-5 mid-boss (~4 m). Cleaver arm, charging rams, leaping slams, thrown
// debris and summoning roars. 60 %: rage (cleaver glows, faster, double charge, back tumour exposed as a
// weak point). 30 %: frenzy combos.
import * as THREE from 'three';
import { BossBrain } from './base.js';
import { rand } from '../../engine/util.js';

const _v = new THREE.Vector3();
let rockGeo = null, rockMat = null; // shared by every thrown rock (no GPU buffers per throw)

export class ButcherBrain extends BossBrain {
  constructor(z, mgr) {
    super(z, mgr);
    this.walkSpeed = 2.6;
    this.keepDist = 3.2;
    this.summonEvery = 28;
    this.weakBoxes = ['head'];
    this.weakMul = 2;
    this.phases = [
      { at: 0.6, enter() { this.rage(); } },
      { at: 0.3, enter() { this.speedMul = 1.4; this.fx('frenzy'); this.g.hud?.toast('屠宰者陷入狂亂！', 2200); } },
    ];
    this.attacks = [
      { id: 'swipe', w: 4, cd: 2.2, max: 5.2, dur: 1.5, recover: 0.4,
        start(a, t) { this.face(t.pos, 1, 99); a.data.yaw = this.z.yaw; this.z.playOnce('attack_b', { speed: 0.75 }); this.fx('teleCone', { p: this.z.pos.toArray(), yaw: a.data.yaw, r: 5.4, h: 0.85, t: 0.8 }); },
        events: [[0.8, function (a) { this.hurtCone(this.z.pos, a.data.yaw, 5.4, 0.85, 30, { knock: 7 }); this.fx('whoosh', { p: this.z.pos.toArray() }); }]] },
      { id: 'charge', w: 3, cd: 7, min: 7, max: 28, los: true, dur: 3.2, recover: 0.8,
        start(a, t) {
          this.face(t.pos, 1, 99);
          a.data.dir = _v.set(t.pos.x - this.z.pos.x, 0, t.pos.z - this.z.pos.z).normalize().clone();
          a.data.yaw = Math.atan2(a.data.dir.x, a.data.dir.z);
          a.data.count = this.phase >= 1 ? 2 : 1;
          this.z.playOnce('idle', { speed: 0.5 });
          this.fx('teleLine', { p: this.z.pos.toArray(), yaw: a.data.yaw, l: 24, w: 1.8, t: 1.0 });
          this.fx('roar', { p: this.z.pos.toArray() });
        },
        update(dt, a) {
          if (a.t < 1.0) { this.face(_v.copy(this.z.pos).add(a.data.dir), dt, 6); return 0; }
          if (a.data.stopped) return 0;
          if (!a.data.running) { a.data.running = true; this.z.running = true; this.z.setLoco(true); }
          const sp = 15 * this.speedMul;
          const bx = this.z.pos.x, bz = this.z.pos.z;
          this.z._move(a.data.dir.x * sp * dt, a.data.dir.z * sp * dt, this.mgr);
          const moved = Math.hypot(this.z.pos.x - bx, this.z.pos.z - bz);
          // trample whoever is in the way
          this.hurtCircle(this.z.pos, 2.2, a.data.hit ? 0 : 38, { knock: 13, lift: 4, onHit: () => { a.data.hit = true; } });
          if (moved < sp * dt * 0.25 || a.t > 2.6) {
            a.data.stopped = true;
            this.z.running = false; this.z.setLoco(false);
            if (moved < sp * dt * 0.25) { // slammed into a wall: stunned, back exposed
              this.stunT = 2.2;
              this.z.playOnce(this.z.actions.stagger ? 'stagger' : 'hit_front', { speed: 0.6 });
              this.fx('impact', { p: this.z.pos.toArray(), big: 1 });
              this.g.hud?.toast('屠宰者撞牆暈眩！集火！', 1800);
            } else if (--a.data.count > 0) {
              // second charge (rage)
              const t = this.randomPlayer();
              if (t) this.start(this.attacks.find((x) => x.id === 'charge'), t);
              this.attack.data.count = 1;
            }
          }
          return sp;
        } },
      { id: 'slam', w: 3, cd: 6, max: 10, dur: 2.0, recover: 0.6,
        start(a) { a.data.p = this.z.pos.clone(); this.z.playOnce('leap', { speed: 0.7 }); this.fx('teleCircle', { p: a.data.p.toArray(), r: 7.5, t: 1.1 }); },
        events: [[1.1, function (a) {
          this.hurtCircle(a.data.p, 7.5, 28, { knock: 9, lift: 5, jumpable: true, onHit: (p) => { if (p.local) this.g.arsenal?.jam?.(1.5); } });
          this.fx('quake', { p: a.data.p.toArray(), r: 7.5 });
        }]] },
      { id: 'throw', w: 2, cd: 8, min: 9, max: 38, los: true, dur: 2.3, recover: 0.5,
        start(a, t) {
          this.face(t.pos, 1, 99);
          a.data.to = t.pos.clone();
          this.z.playOnce('attack_a', { speed: 0.7 });
          this.fx('teleCircle', { p: a.data.to.toArray(), r: 3.4, t: 2.0 });
        },
        events: [[0.7, function (a) {
          const from = this.z.center(new THREE.Vector3()); from.y += 1.2;
          this.fx('throw', { from: from.toArray(), to: a.data.to.toArray(), t: 1.3 });
        }], [2.0, function (a) { this.hurtCircle(a.data.to, 3.4, 32, { knock: 8, lift: 4, explosive: true }); }]] },
    ];
  }

  rage() {
    this.speedMul = 1.25;
    this.weakBoxes = ['head', 'chest'];
    this.weakMul = 2.4;
    this.invuln = 1.6;
    this.z.playOnce('scream', { speed: 0.8 });
    this.fx('rage', { p: this.z.pos.toArray() });
    this.g.hud?.toast('屠宰者暴怒了！背部腫瘤外露', 2400);
  }

  onSummon() {
    this.z.playOnce('scream', { speed: 0.9 });
    this.fx('roar', { p: this.z.pos.toArray() });
    this.summon('runner', 3 + Math.floor(rand(0, 3)) + this.phase, 7);
  }

  // ---------------------------------------------------------------- visuals (host + clients)
  onFx(kind, d) {
    const g = this.g, tele = this.tele;
    const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    switch (kind) {
      case 'teleCone': tele?.cone(V(d.p), d.yaw, d.r, d.h, d.t); break;
      case 'teleLine': tele?.line(V(d.p), d.yaw, d.l, d.w, d.t); break;
      case 'teleCircle': tele?.circle(V(d.p), d.r, d.t); break;
      case 'whoosh': g.audio?.play('swingHeavy', { pos: V(d.p), volume: 1.2, pitch: 0.6 }); break;
      case 'roar': g.audio?.play('brute_roar', { pos: V(d.p), volume: 1.3, pitch: 0.8 }); g.addShake(0.25); break;
      case 'impact': g.audio?.play('explosion_small', { pos: V(d.p) }); g.addShake(0.6); g.fx?.impact(0, V(d.p).setY(d.p[1] + 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0), { big: 3, decal: false }); break;
      case 'quake': {
        const p = V(d.p);
        g.audio?.play('brute_stomp', { pos: p, volume: 1.4 });
        g.audio?.play('explosion_small', { pos: p, volume: 0.8 });
        const dist = p.distanceTo(g.camera.position);
        g.addShake(Math.max(0.15, 0.9 - dist / 25));
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          g.fx?.particles.spawn({ x: p.x + Math.cos(a) * 1.5, y: p.y + 0.2, z: p.z + Math.sin(a) * 1.5, vx: Math.cos(a) * 9, vy: 0.6, vz: Math.sin(a) * 9, life: 0.8, size: 0.6, size1: 2.2, color: [0.5, 0.47, 0.42, 0.55], color1: [0.5, 0.47, 0.42, 0], frame: 12, drag: 2.5 });
        }
        g.fx?.particles.spawn({ additive: true, x: p.x, y: p.y + 0.2, z: p.z, life: 0.35, size: 1, size1: d.r * 2.2, color: [2.5, 1.6, 1, 1], color1: [0.6, 0.4, 0.2, 0], frame: 11 });
        g.fx?.decals.add(p.clone().setY(p.y + 0.02), new THREE.Vector3(0, 1, 0), { frame: 15, size: 5, tint: 3, alpha: 0.8 });
        break;
      }
      case 'throw': {
        const from = V(d.from), to = V(d.to);
        const t = d.t;
        const vel = to.clone().sub(from).multiplyScalar(1 / t); vel.y += 0.5 * 12 * t;
        const rock = new THREE.Mesh(rockGeo || (rockGeo = new THREE.DodecahedronGeometry(0.55, 0)), rockMat || (rockMat = new THREE.MeshStandardMaterial({ color: 0x5b5752, roughness: 0.95 })));
        rock.castShadow = true;
        g.audio?.play('swingHeavy', { pos: from, pitch: 0.5 });
        g.projectiles?.spawn({ pos: from, vel, gravity: 12, life: t + 0.5, mesh: rock, radius: 0.5, hitTargets: false, faceVelocity: false,
          onUpdate: (p, dt) => { rock.rotation.x += dt * 6; rock.rotation.z += dt * 4; },
          onHit: (p, point) => { g.fx?.explosion(point, { radius: 3.4, scale: 0.7, color: [0.6, 0.5, 0.4] }); g.audio?.play('debris_fall', { pos: point }); return true; } });
        break;
      }
      case 'rage':
        g.audio?.play('brute_roar', { pos: V(d.p), volume: 1.5, pitch: 0.7 });
        g.addShake(0.5);
        this.z.root.traverse((o) => { if (o.isMesh && o.material?.emissive) { o.material = o.material.clone(); o.material.emissive.set(0x8a1a05); o.material.emissiveIntensity = 0.6; } });
        break;
      case 'frenzy': g.audio?.play('brute_roar', { pos: this.z.pos, volume: 1.5, pitch: 0.9 }); break;
    }
  }
}
