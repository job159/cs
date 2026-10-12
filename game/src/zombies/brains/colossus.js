// 災厄巨像 → 深淵之翼  COLOSSUS / ABYSS WING — round-10 final boss (~7 m).
// Phase A (ground): stomp rings, spore mortar barrage, tendril pull + sweep, crawler summons.
// 45 %: metamorphosis (invulnerable, wings unfold) -> Phase B (air): circles the arena above the roofs,
//        breath strafes (line telegraphs, leaves acid), dive bombs (lands for a vulnerable window).
// 15 %: wings shredded, crash-lands -> Phase C frenzy on the ground. Chest core is the weak point.
import * as THREE from 'three';
import { BossBrain } from './base.js';
import { rand } from '../../engine/util.js';

const _v = new THREE.Vector3();
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

export class ColossusBrain extends BossBrain {
  constructor(z, mgr) {
    super(z, mgr);
    this.walkSpeed = 1.8;
    this.keepDist = 5;
    this.summonEvery = 32;
    this.weakBoxes = ['chest', 'head'];
    this.weakMul = 1.8;
    const arena = mgr.game.world.def?.bossArenas?.final;
    this.arena = arena ? V(arena.center) : z.pos.clone();
    this.arenaR = arena?.radius ?? 26;
    this.phases = [
      { at: 0.45, enter() { this.metamorphosis(); } },
      { at: 0.15, enter() { this.crash(); } },
    ];
    this.attacks = [
      // ---------------- phase A / C (ground)
      { id: 'stomp', w: 3, cd: 6, max: 14, until: 1, dur: 2.6, recover: 0.6,
        start(a) { a.data.p = this.z.pos.clone(); this.z.playOnce('leap', { speed: 0.55 }); this.fx('teleCircle', { p: a.data.p.toArray(), r: 9, t: 1.2 }); },
        events: [[1.2, function (a) { this.hurtCircle(a.data.p, 9, 34, { knock: 10, lift: 5, jumpable: true }); this.fx('quake', { p: a.data.p.toArray(), r: 9 }); this.fx('teleCircle', { p: a.data.p.toArray(), r: 15, t: 0.8 }); }],
          [2.0, function (a) { this.hurtCircle(a.data.p, 15, 22, { knock: 6, lift: 4, jumpable: true }); this.fx('quake', { p: a.data.p.toArray(), r: 15 }); }]] },
      { id: 'mortar', w: 3, cd: 9, min: 6, max: 60, until: 1, dur: 3.2, recover: 0.6,
        start(a) {
          this.z.playOnce('scream', { speed: 0.7 });
          a.data.targets = this.players().map((p) => p.pos.clone());
          for (let i = 0; i < 2 + (this.mgr.game.match?.players ?? 1); i++) a.data.targets.push(this.z.pos.clone().add(_v.set(rand(-14, 14), 0, rand(-14, 14))));
          for (const t of a.data.targets) this.fx('teleCircle', { p: [t.x, this.ground(t), t.z], r: 3.2, t: 2.4 });
          this.fx('sporeLaunch', { p: this.z.pos.toArray(), to: a.data.targets.map((t) => [t.x, this.ground(t), t.z]) });
        },
        events: [[2.4, function (a) {
          for (const t of a.data.targets) {
            const p = new THREE.Vector3(t.x, this.ground(t), t.z);
            this.hurtCircle(p, 3.2, 26, { knock: 5, explosive: true });
            this.mgr.hazards.push({ pos: p, r: 2.6, t: 6, dps: 7, kind: 'poison' });
          }
        }]] },
      { id: 'pull', w: 2, cd: 14, min: 6, max: 22, until: 1, los: true, dur: 3.6, recover: 0.8,
        start(a) { this.z.playOnce('attack_a', { speed: 0.5 }); this.fx('tendril', { id: this.z.id, t: 2.6 }); this.g.hud?.toast('觸手拉扯！往外跑！', 1600); },
        update(dt, a) {
          if (a.t < 2.6) {
            for (const p of this.players()) {
              const d = p.pos.distanceTo(this.z.pos);
              if (d < 24 && d > 3) this.g.pushPlayer?.(p, _v.copy(this.z.pos).sub(p.pos).setY(0).normalize().multiplyScalar(5.5 * dt * 6));
            }
          }
          return 0;
        },
        events: [[2.6, function () { this.fx('teleCone', { p: this.z.pos.toArray(), yaw: this.z.yaw, r: 9, h: 1.3, t: 0.6 }); }],
          [3.2, function () { this.hurtCone(this.z.pos, this.z.yaw, 9, 1.3, 36, { knock: 12, lift: 5 }); this.fx('quake', { p: this.z.pos.toArray(), r: 6 }); }]] },
      { id: 'sweep', w: 3, cd: 3, max: 7.5, dur: 1.7, recover: 0.4,
        start(a, t) { this.face(t.pos, 1, 99); a.data.yaw = this.z.yaw; this.z.playOnce('attack_b', { speed: 0.6 }); this.fx('teleCone', { p: this.z.pos.toArray(), yaw: a.data.yaw, r: 8, h: 1.1, t: 0.9 }); },
        events: [[0.9, function (a) { this.hurtCone(this.z.pos, a.data.yaw, 8, 1.1, 30, { knock: 10 }); }]] },
      // ---------------- phase B (air)
      { id: 'breath', w: 3, cd: 5, phase: 1, until: 2, dur: 3.4, recover: 0.4,
        start(a, t) {
          const from = new THREE.Vector3(this.z.pos.x, 0, this.z.pos.z);
          from.y = this.ground(from);
          const yaw = Math.atan2(t.pos.x - from.x, t.pos.z - from.z);
          a.data.from = from; a.data.yaw = yaw;
          this.fx('teleLine', { p: from.toArray(), yaw, l: 34, w: 2.6, t: 1.3 });
          this.fx('breathCharge', { id: this.z.id });
        },
        events: [[1.3, function (a) { this.fx('breath', { id: this.z.id, p: a.data.from.toArray(), yaw: a.data.yaw }); }],
          [1.5, function (a) {
            this.hurtLine(a.data.from, a.data.yaw, 34, 2.6, 30, { knock: 4 });
            for (let i = 4; i < 34; i += 6) {
              const p = a.data.from.clone().add(_v.set(Math.sin(a.data.yaw) * i, 0, Math.cos(a.data.yaw) * i));
              p.y = this.ground(p);
              this.mgr.hazards.push({ pos: p, r: 2.2, t: 7, dps: 9, kind: 'acid' });
            }
          }]] },
      { id: 'dive', w: 2, cd: 11, phase: 1, until: 2, dur: 9.0, recover: 0.5,
        start(a, t) { a.data.to = new THREE.Vector3(t.pos.x, this.ground(t.pos), t.pos.z); this.fx('teleCircle', { p: a.data.to.toArray(), r: 6.5, t: 1.6 }); this.fx('screech', { p: this.z.pos.toArray() }); },
        update(dt, a) {
          if (a.t < 1.6) { this.face(a.data.to, dt, 4); return 0; }
          if (!a.data.landed) {
            const u = Math.min(1, (a.t - 1.6) / 0.45);
            this.z.pos.lerp(a.data.to, u * u);
            if (u >= 1) {
              a.data.landed = true; this.flying = false;
              this.hurtCircle(a.data.to, 6.5, 40, { knock: 12, lift: 6, explosive: true });
              this.fx('quake', { p: a.data.to.toArray(), r: 6.5 });
              this.z.playOnce(this.z.actions.stagger ? 'stagger' : 'idle', { speed: 0.6 });
              this.weakMul = 2.6;
              this.g.hud?.toast('深淵之翼落地了！攻擊胸口核心！', 1800);
            }
            return 0;
          }
          if (a.t > 7.6 && !a.data.up) { a.data.up = true; this.flying = true; this.weakMul = 1.8; this.fx('takeoff', { p: this.z.pos.toArray() }); }
          return 0;
        } },
    ];
  }

  metamorphosis() {
    this.invuln = 4.5;
    this.z.playOnce('scream', { speed: 0.5 });
    this.fx('metamorph', { id: this.z.id });
    this.g.hud?.toast('巨像正在蛻變……', 3000);
    this.summon('crawler', 4, 10);
    this.flyIn = 4.5;
  }

  crash() {
    this.flying = false;
    this.invuln = 2.5;
    this.speedMul = 1.5;
    this.attack = null;
    this.fx('crash', { id: this.z.id, p: this.z.pos.toArray() });
    this.g.hud?.toast('雙翼撕裂！最終決戰！', 2600);
  }

  onSummon() { this.z.playOnce('scream', { speed: 0.8 }); this.fx('screech', { p: this.z.pos.toArray() }); this.summon(this.phase >= 1 ? 'runner' : 'crawler', 4 + this.phase * 2, 9); }

  update(dt, target, tdist) {
    if (this.flyIn > 0) {
      this.flyIn -= dt;
      if (this.flyIn <= 0) { this.flying = true; this.orbitA = Math.atan2(this.z.pos.x - this.arena.x, this.z.pos.z - this.arena.z); this.fx('takeoff', { p: this.z.pos.toArray() }); }
      else { this.invuln = Math.max(this.invuln, 0.2); return 0; }
    }
    if (this._unfold) for (const w of this._unfold) w.scale.setScalar(Math.min(1, w.scale.x + dt * 0.8));
    if (this.flying && !this.attack) {
      // circle the arena above the rooftops, facing the centre
      this.orbitA = (this.orbitA ?? 0) + dt * 0.35;
      const tx = this.arena.x + Math.sin(this.orbitA) * this.arenaR, tz = this.arena.z + Math.cos(this.orbitA) * this.arenaR;
      const ty = this.arena.y + 13;
      this.z.pos.x += (tx - this.z.pos.x) * Math.min(1, dt * 1.5);
      this.z.pos.z += (tz - this.z.pos.z) * Math.min(1, dt * 1.5);
      this.z.pos.y += (ty - this.z.pos.y) * Math.min(1, dt * 1.2);
      if (target) this.face(target.pos, dt, 2);
    }
    const sp = super.update(dt, target, tdist);
    return this.flying ? 0 : sp;
  }

  chase(dt, target, tdist) { return this.flying ? 0 : super.chase(dt, target, tdist); }

  // ---------------------------------------------------------------- visuals
  onFx(kind, d) {
    const g = this.g, tele = this.tele;
    switch (kind) {
      case 'teleCone': tele?.cone(V(d.p), d.yaw, d.r, d.h, d.t); break;
      case 'teleLine': tele?.line(V(d.p), d.yaw, d.l, d.w, d.t, { color: 0x7dff2a }); break;
      case 'teleCircle': tele?.circle(V(d.p), d.r, d.t); break;
      case 'screech': g.audio?.play('screamer_scream', { pos: V(d.p), volume: 1.4, pitch: 0.55 }); g.addShake(0.2); break;
      case 'quake': {
        const p = V(d.p);
        g.audio?.play('brute_stomp', { pos: p, volume: 1.5, pitch: 0.7 });
        g.addShake(Math.max(0.2, 1 - p.distanceTo(g.camera.position) / 35));
        g.fx?.particles.spawn({ additive: true, x: p.x, y: p.y + 0.3, z: p.z, life: 0.45, size: 1, size1: d.r * 2.4, color: [2, 1.4, 0.9, 1], color1: [0.5, 0.3, 0.2, 0], frame: 11 });
        for (let i = 0; i < 30; i++) {
          const a = (i / 30) * Math.PI * 2;
          g.fx?.particles.spawn({ x: p.x + Math.cos(a) * 2, y: p.y + 0.3, z: p.z + Math.sin(a) * 2, vx: Math.cos(a) * d.r, vy: 0.8, vz: Math.sin(a) * d.r, life: 1, size: 0.9, size1: 3, color: [0.45, 0.42, 0.38, 0.6], color1: [0.45, 0.42, 0.38, 0], frame: 12, drag: 2 });
        }
        break;
      }
      case 'sporeLaunch': {
        const from = V(d.p); from.y += this.z.height * 0.8;
        g.audio?.play('spitter_spit', { pos: from, volume: 1.4, pitch: 0.6 });
        for (const t of d.to) {
          const to = V(t);
          const time = 2.2;
          const vel = to.clone().sub(from).multiplyScalar(1 / time); vel.y += 0.5 * 9.8 * time;
          const m = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 2.2, 0.35) }));
          g.projectiles?.spawn({ pos: from.clone(), vel, gravity: 9.8, life: time + 0.4, mesh: m, radius: 0.3, hitTargets: false, faceVelocity: false,
            onUpdate: (p) => { if (Math.random() < 0.5) g.fx?.particles.spawn({ x: p.pos.x, y: p.pos.y, z: p.pos.z, life: 0.6, size: 0.3, size1: 0.8, color: [0.35, 0.6, 0.1, 0.5], color1: [0.3, 0.5, 0.1, 0], frame: 1 }); },
            onHit: (p, point) => { g.fx?.explosion(point, { radius: 3.2, scale: 0.6, color: [0.5, 0.95, 0.2] }); g.audio?.play('bloater_pop', { pos: point }); return true; } });
        }
        break;
      }
      case 'tendril': g.audio?.play('crawler_screech', { pos: this.z.pos, volume: 1.2, pitch: 0.5 }); break;
      case 'breathCharge': g.audio?.play('spitter_gurgle', { pos: this.z.pos, volume: 1.5, pitch: 0.5 }); break;
      case 'breath': {
        const from = this.z.center(new THREE.Vector3()); from.y += 1.5;
        const yaw = d.yaw;
        g.audio?.play('fire_burst', { pos: from, volume: 1.4 });
        for (let i = 0; i < 70; i++) {
          const L = (i / 70) * 34;
          const tgt = V(d.p).add(_v.set(Math.sin(yaw) * L, 0, Math.cos(yaw) * L));
          const dir = tgt.sub(from).normalize();
          const sp = 22 + Math.random() * 8;
          g.fx?.particles.spawn({ additive: true, x: from.x, y: from.y, z: from.z, vx: dir.x * sp + (Math.random() - 0.5) * 2, vy: dir.y * sp, vz: dir.z * sp + (Math.random() - 0.5) * 2, life: 0.5 + Math.random() * 0.6, size: 0.6, size1: 2.4, color: [0.9, 2.6, 0.3, 1], color1: [0.2, 0.6, 0.05, 0], frame: 10, drag: 0.6 });
        }
        break;
      }
      case 'takeoff': g.audio?.play('screamer_scream', { pos: V(d.p), pitch: 0.6 }); break;
      case 'metamorph': {
        g.addShake(0.8);
        g.audio?.play('brute_roar', { pos: this.z.pos, volume: 1.6, pitch: 0.5 });
        g.fx?.blood(this.z.center(new THREE.Vector3()), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0), 6);
        g.fx?.gibs(this.z.center(new THREE.Vector3()), new THREE.Vector3(0, 1, 0), 24);
        // wings unfold if the model has them
        const wl = this.z.bones.wing_l || this.z.root.getObjectByName('wing_l'), wr = this.z.bones.wing_r || this.z.root.getObjectByName('wing_r');
        for (const w of [wl, wr]) if (w) { w.scale.setScalar(0.01); this._unfold = (this._unfold || []).concat(w); }
        break;
      }
      case 'crash': g.addShake(1); g.audio?.play('explosion_large', { pos: this.z.pos }); break;
    }
  }
}
