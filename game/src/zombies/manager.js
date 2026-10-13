// Zombie runtime: spawning, flow-field chasing, separation, attacks, specials, animation with distance
// LOD, bone hitboxes for bullets, part damage, knockback/stagger, decapitation / dismemberment, deaths.
// Implements the `game.targets` interface used by weapons (raycast / inRadius).
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { loadGLB, shareSkeletons, disposeSkeletons } from '../engine/assets.js';
import { ZOMBIES, DEFAULT_HITBOXES, PART_OF, SEVER } from './defs.js';
import { buildMannequin } from './mannequin.js';
import { STANDINS, buildStandin, standinBases } from './standins.js';
import { NavGrid, NAV } from '../world/nav.js';
import { pick, rand, clamp, angleDiff, damp } from '../engine/util.js';
import { Telegraphs } from './telegraph.js';
import { retargetClips } from './retarget.js';
import { patchShell } from '../fx/zfx.js';
import { ButcherBrain } from './brains/butcher.js';
import { ColossusBrain } from './brains/colossus.js';

const BRAINS = { butcher: ButcherBrain, colossus: ColossusBrain };

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _flow = new THREE.Vector3();
const _hitN = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const AXES = ['x', 'y', 'z'];
let spitGeo = null, spitMat = null; // shared by every spit projectile (a mesh per shot, never new GPU buffers)
const NAV_STEP = 0.55;     // = world/nav.js STEP (max height step between cells the flow field links)

let nextId = 1;

class Zombie {
  constructor(mgr, type, def, model, clips, pos) {
    this.mgr = mgr;
    this.id = nextId++;
    this.type = type;
    this.def = def;
    this.root = model.scene;
    this.root.position.copy(pos);
    this.pos = this.root.position;
    this.vel = new THREE.Vector3();
    this.kvel = new THREE.Vector3();        // knockback velocity
    this.yaw = rand(0, Math.PI * 2);
    this.maxHp = def.hp * (mgr.hpMul || 1);
    this.hp = this.maxHp;
    this.alive = true;
    this.state = 'chase';
    this.stateT = 0;
    this.atkCd = rand(0, 0.6);
    this.specialCd = rand(1, 4);
    this.speedMul = 1;
    this.walkSpeed = rand(def.walk[0], def.walk[1]);
    this.running = Math.random() < (def.runChance || 0) * (mgr.runBias || 1);
    this.radius = def.radius;
    this.height = model.height || def.height;
    this.armor = def.armor || 0;
    this.flinch = new THREE.Vector3();      // procedural upper-body flinch (radians)
    this.flinchV = new THREE.Vector3();
    this.lastHitAt = -9;
    this.limbDamage = Object.create(null);
    this.severed = new Set();
    this.animAcc = 0;
    this.visible = true;
    this.voiceT = rand(2, 9);
    this.puppet = false;
    this.netBuf = [];
    if (def.brain && BRAINS[def.brain]) this.brain = new BRAINS[def.brain](this, mgr);
    this.target = null;
    this.deathT = 0;
    this.stride = 1;                        // root scale the locomotion clips stretch over (spawn sets it)
    // bones
    this.bones = {};
    this.root.traverse((o) => { if (o.isBone) this.bones[o.name] = o; if (o.isSkinnedMesh) { o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true; } });
    this.hitboxes = [];
    const hb = model.hitboxes || DEFAULT_HITBOXES;
    for (const [name, spec] of Object.entries(hb)) {
      const [bone, r, toBone] = spec;
      const b0 = this.bones[bone];
      if (!b0) continue;
      const child = toBone ? this.bones[toBone] : (DEFAULT_HITBOXES[name]?.[2] ? this.bones[DEFAULT_HITBOXES[name][2]] : null);
      this.hitboxes.push({ name, part: PART_OF[name] || 'body', b0, b1: child || null, r: r * (model.scale || 1), p0: new THREE.Vector3(), p1: new THREE.Vector3() });
    }
    // animation
    this.mixer = new THREE.AnimationMixer(this.root);
    this.actions = {};
    for (const c of clips) this.actions[c.name] = this.mixer.clipAction(c);
    const A = def.anim;
    this.locoClip = this._clip(pick(A.walk));
    this.runClip = this._clip(A.run) || this.locoClip;
    this.loco = this.actions[this.running ? this.runClip : this.locoClip];
    if (this.loco) { this.loco.time = rand(0, this.loco.getClip().duration); this.loco.play(); }
    this.action = this.loco;
  }

  _clip(name) {
    if (!name) return null;
    if (this.actions[name]) return name;
    // fall back to any locomotion-ish clip we have
    for (const n of ['walk_a', 'walk_b', 'run', 'idle']) if (this.actions[n]) return n;
    return null;
  }

  get zfx() { return this.mgr.game.fx?.zfx; }

  playOnce(name, { fade = 0.12, speed = 1, net = true } = {}) {
    if (net && !this.puppet && this.alive) this.mgr.net?.zombieAnim(this, name, speed);
    // CSO cues keyed on the clips the host replicates ('za'): crawler pounce, the end of a brute charge
    if (this.alive && this.def.leap && name === (this.def.anim.leap || 'leap')) this.zfx?.leapCue(this);
    if (this._charging) { this._charging = false; this._chargeEnd = this.mgr.time; this.zfx?.chargeImpact(this.pos, 0.8); }
    const a = this.actions[this.actions[name] ? name : this._clip(name)];
    if (!a) return null;
    a.reset();
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.timeScale = speed;
    a.enabled = true;
    a.setEffectiveWeight(1);
    if (this.action && this.action !== a) a.crossFadeFrom(this.action, fade, false);
    a.play();
    this.action = a;
    return a;
  }

  setLoco(running) {
    const name = running ? this.runClip : this.locoClip;
    const a = this.actions[name];
    if (!a) return;
    if (this.action === a) return;
    if (!this.puppet && this.alive) this.mgr.net?.zombieLoco?.(this, running); // puppets leave their one-shot too
    // brute charge wind-up (host: _special just set chargeDir; clients: the host's 'zl' run = 1 — a puppet whose
    // stagger clip ends before the host's 'zl' 0 re-enters the run loco, hence the cooldown)
    if (running && this.def.charge && this.alive && !this._charging && this.mgr.time - (this._chargeEnd ?? -9) > 2) {
      this._charging = true;
      this.zfx?.bruteCharge(this, this.puppet ? null : this.chargeDir, { len: this.def.charge.speed * 2 });
    }
    a.reset(); a.setLoop(THREE.LoopRepeat, Infinity); a.enabled = true; a.setEffectiveWeight(1);
    if (this.action) a.crossFadeFrom(this.action, 0.25, false);
    a.play();
    this.action = a;
    this.loco = a;
  }

  center(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + this.height * 0.55, this.pos.z); }
  distanceTo(p) { return this.center(_a).distanceTo(p); }
  isBackTo(from) {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const dx = from.x - this.pos.x, dz = from.z - this.pos.z;
    return fx * dx + fz * dz < -0.3 * Math.hypot(dx, dz);
  }

  updateHitboxes() {
    for (const h of this.hitboxes) {
      h.b0.getWorldPosition(h.p0);
      if (h.b1) h.b1.getWorldPosition(h.p1); else h.p1.copy(h.p0).addScaledVector(UP, h.r * 0.6);
    }
    this.hbFrame = this.mgr.frame;
  }

  /** Applies a hit. info: { amount, part, point, normal, dir, knock, stagger, weapon, shooter, headshot, explosive, melee, box } */
  damage(info) {
    if (!this.alive) return { killed: false, damage: 0 };
    const mgr = this.mgr, g = mgr.game;
    // clients send the raw shot: the host applies brain / armour / purge multipliers once, with its own state
    // (a puppet's brain never updates, so its invuln / stun / phase weak points are stale); `amount` below is prediction only
    if (this.puppet && info.amount > 0) mgr.net?.sendHit(this, info, info.amount);
    let amount = info.amount * (this.brain ? this.brain.damageMul(info) : 1);
    if (amount <= 0) { g.fx?.impact(1, info.point || this.center(_v2), info.normal || _hitN.copy(info.dir || UP).negate(), info.dir || UP, { decal: false, big: 0.5 }); return { killed: false, damage: 0 }; }
    // directional armour (riot): bullets from the front are mostly stopped unless they hit the head
    const fa = this.def.frontArmor;
    if (fa && !info.explosive && info.dir) {
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      const facing = -(fx * info.dir.x + fz * info.dir.z); // >0: shot comes from the front
      if (facing > fa.cone) {
        amount *= info.part === 'head' ? 1 - fa.headReduce : 1 - fa.reduce;
        g.fx?.impact(1, info.point || this.center(_v2), info.normal || _hitN.copy(info.dir).negate(), info.dir, { decal: false, big: 0.5 });
        g.audio?.play('armor_hit', { pos: info.point || this.pos, volume: 0.8 });
        info.armored = true;
      }
    }
    amount *= mgr.dmgTakenMul || 1;
    if (this.purgeT > 0) amount *= this.purgeMul || 1.1;
    this.hp -= amount;
    this.lastHitAt = mgr.time;
    if (info.burn) this.zfx?.status(this, 'burning', 0.9);
    const dir = info.dir || _v.set(0, 0, 1);
    // knockback (CSO-style shove) and upper-body flinch
    const kres = 1 - (this.def.knockRes || 0);
    const kn = (info.knock || 0.5) * kres;
    this.kvel.x += dir.x * kn * 1.2; this.kvel.z += dir.z * kn * 1.2;
    const lx = Math.cos(this.yaw) * dir.x - Math.sin(this.yaw) * dir.z; // dir in local frame
    const lz = Math.sin(this.yaw) * dir.x + Math.cos(this.yaw) * dir.z;
    const fl = Math.min(1.2, 0.25 + amount / 60) * (1 - (this.def.staggerRes || 0) * 0.7);
    this.flinchV.x += lz * fl * 9; this.flinchV.z += -lx * fl * 9;
    if (info.part === 'head') this.flinchV.y += fl * 6;
    if ((info.stagger || 0) * (1 - (this.def.staggerRes || 0)) > 0.6 && this.state !== 'stagger' && this.hp > 0 && amount > this.maxHp * 0.12) {
      this.state = 'stagger'; this.stateT = 0;
      const hitClip = this.actions.stagger ? 'stagger' : (lz > 0 ? 'hit_back' : 'hit_front');
      this.playOnce(hitClip, { fade: 0.08, speed: 1.2 });
    }
    // blood
    const amt = info.part === 'head' ? 1.6 : info.explosive ? 2.2 : 1;
    if (!info.armored && !info.burn) g.fx?.blood(info.point || this.center(_v2), info.normal || _hitN.copy(dir).negate(), dir, amt * (info.pellets > 1 ? 0.5 : 1), { acid: this.type === 'spitter' });
    // gore: limb damage accumulates; big hits sever
    if (info.box && SEVER[info.box] && !this.severed.has(SEVER[info.box].bone)) {
      this.limbDamage[info.box] = (this.limbDamage[info.box] || 0) + amount;
      const big = amount > this.maxHp * 0.45 || (info.pellets > 1 && amount > 18);
      if ((info.box === 'head' || info.box === 'neck') ? (this.hp <= 0 && (amount > 55 || info.explosive)) : (big && this.limbDamage[info.box] > this.maxHp * 0.5)) {
        this.sever(info.box, dir);
      }
    }
    let killed = false;
    if (this.hp <= 0) { killed = true; if (this.puppet) this.predictedDeath = mgr.time; this.die(info); }
    else if (mgr.time - (this.painAt || -9) > 0.6 && Math.random() < 0.5) { this.painAt = mgr.time; g.audio?.play((this.def.voice || 'zombie') + '_pain', { pos: this.pos }); }
    if (info.part === 'head') g.audio?.play('headshot', { pos: info.point || this.pos, volume: killed ? 1 : 0.7 });
    else g.audio?.play('impact_flesh', { pos: info.point || this.pos, volume: 0.8 });
    if (!this.target && info.shooter !== undefined) this.mgr.alertAround(this.pos, 12);
    return { killed, damage: amount, headshot: info.part === 'head' };
  }

  sever(box, dir) {
    const s = SEVER[box];
    const bone = this.bones[s.bone], stump = this.bones[s.stump];
    if (!bone || this.severed.has(s.bone)) return;
    this.severed.add(s.bone);
    if (!this.puppet) this.mgr.net?.zombieSever(this, box, dir);
    bone.getWorldPosition(_a);
    bone.scale.setScalar(0.0001);
    const g = this.mgr.game;
    // gore cap at the joint
    const cap = new THREE.Mesh(this.mgr.capGeo, this.mgr.capMat);
    cap.position.copy(bone.position);
    cap.scale.setScalar(s.bone === 'head' ? 1.4 : 1);
    stump.add(cap);
    g.fx?.blood(_a, _b.copy(dir).negate(), dir, 3);
    g.fx?.gibs(_a, dir, s.bone === 'head' ? 10 : 6);
    g.audio?.play(s.bone === 'head' ? 'headshot' : 'gib', { pos: _a });
    // spurting stump for a while
    this.spurt = { bone: stump, offset: bone.position.clone(), t: s.bone === 'head' ? 1.6 : 0.9 };
    if (s.bone === 'head') this.headless = true;
  }

  die(info) {
    if (!this.alive) return;
    this.alive = false;
    this.state = 'dead';
    this.stateT = 0;
    const mgr = this.mgr;
    mgr.alive--;
    const dir = info.dir || _v.set(0, 0, 1);
    const lz = Math.sin(this.yaw) * dir.x + Math.cos(this.yaw) * dir.z; // + = shot from behind (pushes forward)
    const clip = lz > 0 ? 'death_front' : 'death_back';
    this.playOnce(this.actions[clip] ? clip : 'death_back', { fade: 0.1, speed: 1 + Math.random() * 0.2, net: false });
    const push = info.explosive ? 7 : Math.min(5, (info.knock || 1) * 1.4);
    this.kvel.x += dir.x * push; this.kvel.z += dir.z * push;
    if (info.explosive) { this.kvel.y = 3 + Math.random() * 2; }
    mgr.game.audio?.play((this.def.voice || 'zombie') + '_death', { pos: this.pos });
    mgr.game.audio?.play('body_fall', { pos: this.pos, delay: 0.7, volume: 0.8 });
    this.zfx?.killFlash(this);
    if (this.def.boss) this.zfx?.bossDeath(this);
    // CSO venom guard: a headshot kill doesn't blow the bloater up, it deflates (rewards the precise shot)
    const popped = this.def.explode && (info.part === 'head' || info.headshot) && !info.explosive;
    if (popped) this.zfx?.bloaterDeflate(this);
    if (this.puppet) return;
    if (this.def.explode && !popped) mgr.explode(this);
    mgr.onKilled(this, info);
  }

  /** Client side: follow the host's snapshots (interpolated with a small delay). */
  _puppetUpdate(dt, mgr) {
    const b = this.netBuf;
    const rt = mgr.renderTime;
    if (b.length) {
      let i = b.length - 1;
      while (i > 0 && b[i - 1].t > rt) i--;
      const s1 = b[i], s0 = b[Math.max(0, i - 1)];
      const span = s1.t - s0.t;
      const u = span > 1e-4 ? Math.min(1.2, Math.max(0, (rt - s0.t) / span)) : 1;
      const px = this.pos.x, pz = this.pos.z;
      if (this.alive || !this.predictedDeath) {
        this.pos.x = s0.x + (s1.x - s0.x) * u + this.kvel.x * 0.02;
        this.pos.z = s0.z + (s1.z - s0.z) * u + this.kvel.z * 0.02;
        this.pos.y = s0.y + (s1.y - s0.y) * u;
        this.yaw = s0.yaw + angleDiff(s0.yaw, s1.yaw) * Math.min(1, u);
      }
      const speed = Math.hypot(this.pos.x - px, this.pos.z - pz) / Math.max(dt, 1e-3);
      // run flag from the newest row, on change only: the host's 'zl' events (applied on arrival, ahead of the
      // interpolated stream) set it too, and an older row must not flip it back
      const run = b[b.length - 1].run;
      if (run !== undefined && !!run !== this.netRun) { this.netRun = !!run; this.running = this.netRun; if (this.alive && this.action === this.loco) this.setLoco(this.running); }
      if (this.alive && this.loco && this.action === this.loco) {
        const nominal = (this.running ? this.def.nominal.run : this.def.nominal.walk) * this.stride;
        this.loco.timeScale = speed > 0.1 ? clamp(speed / nominal, 0.5, 1.8) : 0.35;
      }
      // predicted death the host never confirmed: bring it back
      if (!this.alive && this.predictedDeath && s1.st !== 4 && mgr.time - this.predictedDeath > 1.4 && s1.t > rt - 0.2) {
        this.alive = true; this.predictedDeath = 0; this.state = 'chase'; this.hp = Math.max(1, s1.hp * this.maxHp); mgr.alive++;
        this.setLoco(this.running);
      }
    }
    // a finished one-shot (attack, stagger, special, boss move: clamped on its last frame) goes back to walking;
    // the host's 'zl' usually comes first, this covers clips it never cancels and our own predicted staggers
    const a = this.action;
    if (this.alive && a && a.loop === THREE.LoopOnce && (a.paused || !a.enabled)) {
      this.state = 'chase';
      if (a === this.loco) this.action = null; // the clip fell back to the loco clip itself (missing animation)
      this.setLoco(this.running);
    }
    this.kvel.multiplyScalar(Math.exp(-7 * dt));
    if (!this.alive) {
      this.deathT += dt;
      if (this.deathT > 5) this.pos.y -= dt * 0.35;
      return this.deathT < 7;
    }
    this.root.rotation.y = this.yaw;
    return true;
  }

  update(dt, mgr) {
    this.stateT += dt;
    const g = mgr.game;
    const d = this.def;
    if (this.purgeT > 0) this.purgeT -= dt;
    if (this.puppet) {
      if (this.spurt) { this.spurt.t -= dt; if (this.spurt.t <= 0) this.spurt = null; }
      return this._puppetUpdate(dt, mgr);
    }
    // ---- knockback integration (with nav clamping); a flying boss brain owns its altitude
    const air = this.alive && this.brain?.flying;
    if (air) this.kvel.set(0, 0, 0);
    else if (this.kvel.lengthSq() > 1e-4 || this.pos.y > (this.groundY ?? this.pos.y) + 0.01) {
      this._move(this.kvel.x * dt, this.kvel.z * dt, mgr);
      if (this.kvel.y || this.pos.y > (this.groundY ?? this.pos.y) + 0.01) {
        this.kvel.y -= 15 * dt;
        this.pos.y += this.kvel.y * dt;
        if (this.pos.y <= this.groundY) { this.pos.y = this.groundY; this.kvel.y = 0; }
      }
      const fr = Math.exp(-(this.alive ? 7 : 4) * dt);
      this.kvel.x *= fr; this.kvel.z *= fr;
    }
    if (this.spurt) {
      this.spurt.t -= dt;
      if (Math.random() < dt * 30) {
        this.spurt.bone.localToWorld(_a.copy(this.spurt.offset));
        g.fx?.particles.spawn({ x: _a.x, y: _a.y, z: _a.z, vx: (Math.random() - 0.5) * 1.2, vy: 1.5 + Math.random() * 2, vz: (Math.random() - 0.5) * 1.2, life: 0.6, size: 0.03, color: [0.4, 0.02, 0.01, 1], color1: [0.3, 0.01, 0.01, 0.8], frame: 7, gravity: 9.8, stretch: 0.01, collide: true });
      }
      if (this.spurt.t <= 0) this.spurt = null;
    }
    if (!this.alive) {
      this.deathT += dt;
      if (this.deathT > 5) this.pos.y -= dt * 0.35;
      return this.deathT < 7;
    }
    if (this.hasteT > 0) { this.hasteT -= dt; if (this.hasteT <= 0) this.speedMul = 1; }
    if (this.noDirectT > 0) this.noDirectT -= dt;
    // ---- target selection (nearest standing player; a downed one ranks as if 3x farther, bosses ignore them)
    const players = this.brain ? mgr.players() : mgr.targets();
    let best = null, bd = 1e9, bw = 1e9;
    for (const p of players) { const dd = p.pos.distanceToSquared(this.pos), w = p.downed ? dd * 9 : dd; if (w < bw) { bw = w; bd = dd; best = p; } }
    this.target = best;
    const tdist = Math.sqrt(bd);
    // ---- voice
    this.voiceT -= dt;
    if (this.voiceT <= 0) { this.voiceT = rand(4, 10); if (tdist < 30 && mgr.voiceBudget-- > 0) g.audio?.play((d.voice || 'zombie') + (tdist < 8 ? '_attack' : '_idle'), { pos: this.pos, volume: 0.9 }); }
    // ---- boss brains replace the default behaviour entirely
    if (this.brain) {
      const sp = this.brain.update(dt, best, tdist);
      if (this.loco && this.action === this.loco) this.loco.timeScale = sp > 0.05 ? clamp(sp / (this.running ? d.nominal.run : d.nominal.walk) / (this.root.scale.x || 1), 0.4, 1.6) : 0.4;
      if (!this.brain.flying && this.state !== 'dead') this.groundY = mgr.nav ? mgr.nav.heightAt(this.pos.x, this.pos.z, this.pos.y) : this.pos.y;
      if (!this.brain.flying && this.pos.y > this.groundY + 0.05 && !this.kvel.y) this.pos.y = damp(this.pos.y, this.groundY, 6, dt);
      this.root.rotation.y = this.yaw;
      return true;
    }
    // ---- specials
    this.specialCd -= dt;
    if (this.state === 'chase' && best && !best.downed && this.specialCd <= 0) this._special(best, tdist, mgr);
    // ---- states
    let speed = 0;
    if (this.state === 'stagger') {
      if (this.stateT > 0.55) { this.state = 'chase'; this.setLoco(this.running); }
    } else if (this.state === 'attack') {
      if (!this.atkHitDone && this.stateT >= d.atkTime * d.atkHit) {
        this.atkHitDone = true;
        if (best && tdist < d.atkRange + 0.45) g.damagePlayer?.(d.dmg * (mgr.dmgMul || 1), { from: this.pos, zombie: this, player: best });
      }
      this._face(best ? best.pos : null, dt, 6);
      if (this.stateT >= d.atkTime) { this.state = 'chase'; this.setLoco(this.running); this.atkCd = 0.25 + Math.random() * 0.4; }
    } else if (this.state === 'special') {
      speed = this._specialUpdate(dt, mgr, best, tdist);
    } else if (this.state === 'chase') {
      this.atkCd -= dt;
      if (best && tdist < d.atkRange && this.atkCd <= 0 && Math.abs(best.pos.y - this.pos.y) < 1.6) {
        this.state = 'attack'; this.stateT = 0; this.atkHitDone = false;
        this.playOnce(pick(d.anim.attack), { fade: 0.1, speed: (this.actions[d.anim.attack[0]]?.getClip().duration || 1) / d.atkTime });
        g.audio?.play((d.voice || 'zombie') + '_attack', { pos: this.pos, volume: 0.9 });
      } else if (best) {
        // keep-away types hold a distance band, but only while they can see the target (short memory: no
        // flicker at corners); without sight they keep following the flow field instead of parking behind a wall
        if (this.seenT > 0) this.seenT -= dt;
        if (d.keepAway && tdist < d.keepAway[1] && mgr.losCheck(this, best)) this.seenT = 0.75;
        let goal = 1;
        if (d.keepAway && this.seenT > 0) goal = tdist < d.keepAway[0] ? -1 : tdist < d.keepAway[1] ? 0 : 1;
        speed = (this.running ? d.run : this.walkSpeed) * this.speedMul * (mgr.speedMul || 1);
        if (goal === 0) speed = 0;
        const dir = this._steer(best, tdist, mgr, goal < 0);
        if (dir && speed > 0) {
          this._face(_v2.copy(this.pos).add(dir), dt, this.running ? 7 : 4);
          // move along our facing (smooth turns instead of instant strafing)
          const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
          const align = Math.max(0.2, fx * dir.x + fz * dir.z);
          this._move(fx * speed * align * dt, fz * speed * align * dt, mgr);
          speed *= align;
          if (goal > 0 && tdist > d.atkRange + 0.5) this._progress(speed * dt, mgr);
        } else this._face(best.pos, dt, 4);
      }
    }
    // separation from neighbours + players
    mgr.separate(this, dt);
    // ---- animation (rate-limited by distance)
    const loco = this.loco;
    if (loco && this.action === loco) {
      const nominal = (this.running ? d.nominal.run : d.nominal.walk) * this.stride;
      loco.timeScale = speed > 0.05 ? clamp(speed / nominal, 0.5, 1.8) : 0.35;
    }
    this.root.rotation.y = this.yaw;
    return true;
  }

  _face(p, dt, rate) {
    if (!p) return;
    const want = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    this.yaw += angleDiff(this.yaw, want) * Math.min(1, rate * dt);
  }

  /** Movement direction: direct line when close and visible, otherwise the flow field. */
  _steer(target, tdist, mgr, away) {
    const nav = mgr.nav;
    if (away) return _flow.set(this.pos.x - target.pos.x, 0, this.pos.z - target.pos.z).normalize();
    // eye-level LOS alone passes over low cover (crates, barriers): the straight line must also be walkable
    if (tdist < 7 && !(this.noDirectT > 0) && mgr.losCheck(this, target) && mgr.directPath(this, target)) return _flow.set(target.pos.x - this.pos.x, 0, target.pos.z - this.pos.z).normalize();
    if (nav) {
      const f = mgr.flowDir(this.pos.x, this.pos.z, this.pos.y, _flow);
      if (f) return f;
    }
    return _flow.set(target.pos.x - this.pos.x, 0, target.pos.z - this.pos.z).normalize();
  }

  _move(dx, dz, mgr) {
    const nav = mgr.nav;
    const nx = this.pos.x + dx, nz = this.pos.z + dz;
    if (!nav) { this.pos.x = nx; this.pos.z = nz; this.groundY = 0; if (this.alive) this.pos.y = 0; return; }
    const ok = (x, z) => { const k = nav.index(x, z); return k >= 0 && nav.walkable(k) && Math.abs(nav.heights[k] - this.pos.y) < 0.75; };
    if (ok(nx, nz)) { this.pos.x = nx; this.pos.z = nz; }
    else if (ok(nx, this.pos.z)) this.pos.x = nx;
    else if (ok(this.pos.x, nz)) this.pos.z = nz;
    else { this.kvel.x *= -0.2; this.kvel.z *= -0.2; }
    const gy = nav.heightAt(this.pos.x, this.pos.z, this.pos.y);
    this.groundY = gy;
    if (this.alive && this.kvel.y === 0 && !this.brain?.flying) this.pos.y = damp(this.pos.y, gy, 18, 1 / 60);
  }

  /** Chasing but going nowhere (pinned on something the direct line misses, crowd jam): flow field for a while. */
  _progress(step, mgr) {
    const t = mgr.time;
    if (t - (this.progAt ?? -9) > 1.2) { this.progAt = t; this.progX = this.pos.x; this.progZ = this.pos.z; this.progExp = 0; return; }
    this.progExp += step;
    if (t - this.progAt < 0.8) return;
    if (this.progExp > 0.3 && Math.hypot(this.pos.x - this.progX, this.pos.z - this.progZ) < this.progExp * 0.25) this.noDirectT = 1.5;
    this.progAt = t; this.progX = this.pos.x; this.progZ = this.pos.z; this.progExp = 0;
  }

  // ---------------------------------------------------------------- specials
  _special(target, tdist, mgr) {
    const d = this.def, g = mgr.game;
    if (d.charge && tdist > d.charge.range[0] && tdist < d.charge.range[1] && mgr.losCheck(this, target)) {
      this.state = 'special'; this.stateT = 0; this.special = 'charge'; this.specialCd = d.charge.cd;
      this.chargeDir = new THREE.Vector3(target.pos.x - this.pos.x, 0, target.pos.z - this.pos.z).normalize();
      this.setLoco(true);
      g.audio?.play('brute_roar', { pos: this.pos });
      g.audio?.play('brute_charge', { pos: this.pos, delay: 0.5 });
      return;
    }
    if (d.leap && tdist > d.leap.range[0] && tdist < d.leap.range[1] && mgr.losCheck(this, target)) {
      this.state = 'special'; this.stateT = 0; this.special = 'leap'; this.specialCd = d.leap.cd;
      this.leapDir = new THREE.Vector3(target.pos.x - this.pos.x, 0, target.pos.z - this.pos.z).normalize();
      this.playOnce(d.anim.leap || 'leap', { fade: 0.08 });
      this.kvel.set(0, 4.2, 0);
      this.pos.y += 0.05;
      g.audio?.play('crawler_screech', { pos: this.pos });
      return;
    }
    if (d.spit && tdist < 22 && tdist > 4 && mgr.losCheck(this, target)) {
      this.state = 'special'; this.stateT = 0; this.special = 'spit'; this.specialCd = d.spit.cd * rand(0.8, 1.3);
      this.playOnce(d.anim.spit || 'spit', { fade: 0.1 });
      g.audio?.play('spitter_gurgle', { pos: this.pos });
      return;
    }
    if (d.scream && tdist < d.scream.radius) {
      this.state = 'special'; this.stateT = 0; this.special = 'scream'; this.specialCd = d.scream.cd;
      this.playOnce(d.anim.scream || 'scream', { fade: 0.15 });
      g.audio?.play('screamer_scream', { pos: this.pos, volume: 1.2 });
      return;
    }
    this.specialCd = 1 + Math.random() * 2;
  }

  _specialUpdate(dt, mgr, target, tdist) {
    const d = this.def, g = mgr.game;
    if (this.special === 'charge') {
      const sp = this.stateT < 0.6 ? 0 : d.charge.speed;
      this._face(_v2.copy(this.pos).add(this.chargeDir), dt, 2);
      if (sp > 0) {
        const bx = this.pos.x, bz = this.pos.z;
        this._move(this.chargeDir.x * sp * dt, this.chargeDir.z * sp * dt, mgr);
        const moved = Math.hypot(this.pos.x - bx, this.pos.z - bz);
        if (target && tdist < 1.6 && !this.chargeHit) {
          this.chargeHit = true;
          g.damagePlayer?.(d.charge.dmg * (mgr.dmgMul || 1), { from: this.pos, zombie: this, player: target, knock: this.chargeDir.clone().multiplyScalar(d.charge.knock).setY(3) });
          g.addShake(0.6);
        }
        if (moved < sp * dt * 0.3 || this.stateT > 2.6 || this.chargeHit) {
          if (moved < sp * dt * 0.3) { g.addShake(Math.max(0, 0.5 - this.pos.distanceTo(g.camera.position) / 30)); g.audio?.play('brute_stomp', { pos: this.pos }); }
          this.state = 'stagger'; this.stateT = 0.1; this.chargeHit = false;
          this.playOnce(this.actions.stagger ? 'stagger' : 'idle', { fade: 0.1 });
        }
      }
      return sp;
    }
    if (this.special === 'leap') {
      if (this.stateT < 0.65) {
        this._move(this.leapDir.x * d.leap.speed * dt, this.leapDir.z * d.leap.speed * dt, mgr);
        if (target && tdist < 1.4 && !this.leapHit) { this.leapHit = true; g.damagePlayer?.(d.leap.dmg * (mgr.dmgMul || 1), { from: this.pos, zombie: this, player: target }); }
        return d.leap.speed;
      }
      this.leapHit = false;
      this.state = 'chase'; this.setLoco(true);
      return 0;
    }
    if (this.special === 'spit') {
      if (target) this._face(target.pos, dt, 6);
      if (!this.spat && this.stateT > 0.55) {
        this.spat = true;
        mgr.spit(this, target);
      }
      if (this.stateT > 1.1) { this.spat = false; this.state = 'chase'; this.setLoco(this.running); }
      return 0;
    }
    if (this.special === 'scream') {
      if (!this.screamed && this.stateT > 0.5) {
        this.screamed = true;
        mgr.scream(this);
      }
      if (this.stateT > 1.6) { this.screamed = false; this.state = 'chase'; this.setLoco(this.running); }
      return 0;
    }
    this.state = 'chase';
    return 0;
  }

  /** Procedural flinch layered on top of the animation (call after mixer update). */
  applyFlinch(dt) {
    const f = this.flinch, fv = this.flinchV;
    const mag = Math.abs(f.x) + Math.abs(f.y) + Math.abs(f.z) + Math.abs(fv.x) + Math.abs(fv.y) + Math.abs(fv.z);
    if (!(mag > 1e-4)) { f.set(0, 0, 0); fv.set(0, 0, 0); return; } // settled (or NaN): nothing left to amplify
    // semi-implicit Euler with this spring is only stable below ~0.1 s steps: LOD'd zombies arrive with
    // 4-8 frames at once, so substep at <= 1/60 s
    const k = 120, c = 13, n = Math.min(16, Math.max(1, Math.ceil(dt * 60 - 1e-3))), h = dt / n;
    for (let i = 0; i < n; i++) for (const ax of AXES) {
      fv[ax] += (-k * f[ax] - c * fv[ax]) * h;
      f[ax] += fv[ax] * h;
    }
    f.clampScalar(-1.5, 1.5); fv.clampScalar(-30, 30);
    if (Math.abs(f.x) + Math.abs(f.z) + Math.abs(f.y) < 1e-3) return;
    const sp = this.bones.spine_02 || this.bones.spine_01;
    const head = this.bones.head;
    if (sp) sp.quaternion.multiply(_q.setFromEuler(new THREE.Euler(this.flinch.x * 0.6, 0, this.flinch.z * 0.6)));
    const sp3 = this.bones.spine_03;
    if (sp3) sp3.quaternion.multiply(_q.setFromEuler(new THREE.Euler(this.flinch.x * 0.4, 0, this.flinch.z * 0.4)));
    if (head) head.quaternion.multiply(_q.setFromEuler(new THREE.Euler(this.flinch.x * 0.5 - this.flinch.y * 0.6, 0, this.flinch.z * 0.5)));
  }
}

export class ZombieManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.alive = 0;
    this.time = 0;
    this.frame = 0;
    this.models = new Map();   // model id -> { gltf scene, hitboxes, height }
    this.clips = [];
    this.hpMul = 1; this.dmgMul = 1; this.speedMul = 1; this.runBias = 1;
    this.capGeo = new THREE.SphereGeometry(0.06, 10, 8);
    this.capMat = new THREE.MeshStandardMaterial({ color: 0x4a0806, roughness: 0.35, metalness: 0 });
    this.root = new THREE.Group();
    this.root.name = 'zombies';
    game.scene.add(this.root);
    this.hash = new Map();
    this.fieldT = 0;
    this.nav = null;
    this.voiceBudget = 3;
    this.losCache = new Map();
    this.hazards = [];         // acid pools / poison clouds: { pos, r, t, dps, kind }
    this.telegraphs = new Telegraphs(game.scene);
    this.authority = true;     // false on network clients: zombies are puppets of the host
    this.net = null;           // NetSync (multiplayer) or null
    this.byId = new Map();
    this.renderTime = 0;       // client interpolation clock (host time minus a delay)
    game.targets = this;
  }

  async init({ types = Object.keys(ZOMBIES) } = {}) {
    // animation library (real) or mannequin clips (fallback)
    try {
      const a = await loadGLB('zombies/anims.glb');
      this.animSrc = a;
      this.clips = a.animations;
    } catch { this.clips = []; }
    const need = new Set();
    for (const t of types) for (const m of ZOMBIES[t]?.models || []) need.add(m);
    await Promise.all([...need].map((m) => this._loadModel(m)));
    await this._buildStandins([...need]);
    this._warmup();
    // navigation
    const w = this.game.world;
    this.nav = w.nav || (w.collision ? NavGrid.build(w.collision, w.bounds, 0.5) : null);
    w.nav = this.nav;
  }

  async _loadModel(id) {
    if (this.models.has(id)) return this.models.get(id);
    let entry;
    try {
      const g = await loadGLB(`zombies/${id}.glb`);
      const ex = g.scene.userData || {};
      entry = { scene: g.scene, hitboxes: ex.hitboxes, height: ex.height, scale: 1, clips: g.animations, poseOffsets: ex.poseOffsets || null };
      if (entry.poseOffsets) {
        // per-frame additive local rotations (hunched spines etc.), degrees XYZ
        entry.poseQ = Object.entries(entry.poseOffsets).map(([bone, e]) => [bone, new THREE.Quaternion().setFromEuler(new THREE.Euler(e[0] * Math.PI / 180, e[1] * Math.PI / 180, e[2] * Math.PI / 180))]);
      }
      try { entry.lod1 = (await loadGLB(`zombies/${id}_lod1.glb`)).scene; } catch { entry.lod1 = null; }
    } catch {
      entry = { missing: true };   // not built (yet): a stand-in (zombies/standins.js) or another model replaces it
    }
    this.models.set(id, entry);
    return entry;
  }

  /** Real model entry (loaded from its own GLB)? */
  _real(id) { const e = this.models.get(id); return !!e && !e.missing && !e.standin && !e.fallback; }

  /** Builds stand-ins for every requested model id whose GLB is missing (zombies/standins.js recipes). */
  async _buildStandins(ids) {
    const missing = ids.filter((m) => this.models.get(m)?.missing && STANDINS[m]);
    if (!missing.length) return;
    const bases = new Set();
    for (const m of missing) for (const b of standinBases(m)) bases.add(b);
    await Promise.all([...bases].map((b) => this._loadModel(b)));
    for (const m of missing) {
      const b = STANDINS[m].base.find((x) => this._real(x));
      if (!b) continue;
      try { this.models.set(m, buildStandin(m, STANDINS[m], this.models.get(b), b)); } catch (e) { console.warn('zombie stand-in failed', m, e); }
    }
  }

  /**
   * Load-time warm-up. One hidden, shell-patched instance of every loaded model (LOD0 + LOD1) under the zombie
   * root: the loading screen's compileAsync(scene) prepares hidden meshes too, so the first spawn of a type
   * (stand-in grades, boss materials) never stalls on shader compiles mid-round (the colossus' first frame went
   * from ~1.5 s to ~0.1 s on desktop). Never rendered; dropped on the first update().
   */
  _warmup() {
    if (this.warm) return;
    this.warm = new THREE.Group();
    this.warm.name = 'zombie-warmup';
    this.warm.visible = false;
    for (const e of this.models.values()) {
      if (e.missing || e.fallback) continue;
      // the clip retarget too (~0.1-0.3 s per model): a boss entrance must not freeze the round
      if (!e.standin && this.animSrc && !e.retargeted) {
        try { e.retargeted = retargetClips(this.animSrc.animations, this.animSrc.scene, e.scene); } catch (err) { console.warn('retarget failed', err); e.retargeted = this.clips; }
      }
      for (const src of [e.scene, e.lod1]) {
        if (!src) continue;
        const s = cloneSkinned(src);
        s.traverse((o) => { if (o.isSkinnedMesh) o.frustumCulled = false; });
        patchShell(s);
        this.warm.add(s);
      }
    }
    this.root.add(this.warm);
    // and the GPU texture uploads (2k maps: the first visible frame of a model paid ~0.1-0.5 s for them)
    const gl = this.game.renderer?.gl;
    if (gl?.initTexture) {
      const seen = new Set();
      this.warm.traverse((o) => {
        if (!o.isMesh) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap']) {
            const t = m?.[k];
            if (t?.isTexture && !seen.has(t)) { seen.add(t); try { gl.initTexture(t); } catch { /* uploaded on first use instead */ } }
          }
        }
      });
    }
  }

  /**
   * Model id for a new zombie: the requested one (network spawns) if usable, else one of the type's models that
   * loaded or has a stand-in (bosses: the first, i.e. their own model when it exists); any real model if the type
   * has none; the mannequin only when no zombie model loaded at all.
   */
  _pickModel(def, want) {
    const ok = (m) => { const e = this.models.get(m); return !!e && !e.missing; };
    if (want && ok(want)) return want;
    const c = def.models.filter(ok);
    if (c.length) return def.boss ? c[0] : pick(c);
    for (const [m, e] of this.models) if (!e.missing && !e.fallback) return m;
    if (!this.models.has('mannequin')) {
      const mm = buildMannequin();
      this.models.set('mannequin', { scene: mm.scene, hitboxes: null, height: 1.75, scale: 1, clips: mm.animations, fallback: true });
    }
    return 'mannequin';
  }

  players() {
    const g = this.game;
    if (g.playerList) return g.playerList().filter((p) => p.alive);
    return g.player && !g.playerDead ? [{ pos: g.player.pos, id: g.localId, alive: true }] : [];
  }
  /** Melee targets: standing players plus downed ones (hits on those shorten their bleed-out). */
  targets() {
    const g = this.game;
    return g.playerList ? g.playerList().filter((p) => p.alive || p.downed) : this.players();
  }

  spawn(type, pos, opts = {}) {
    const def = ZOMBIES[type];
    if (!def) return null;
    // bosses use their own model whenever it loaded; the ids after it (and stand-ins) are only fallbacks
    const mid = this._pickModel(def, opts.model);
    const entry = this.models.get(mid);
    if (!entry) return null;
    const scene = cloneSkinned(entry.scene);
    const lod0 = [], lod1 = [];
    scene.traverse((o) => { if (o.isSkinnedMesh) lod0.push(o); });
    if (entry.lod1 && lod0.length) {
      // bind the low-poly meshes to this zombie's own skeleton (bone order by name)
      const bones = {};
      scene.traverse((o) => { if (o.isBone) bones[o.name] = o; });
      entry.lod1.traverse((o) => {
        if (!o.isSkinnedMesh) return;
        const list = o.skeleton.bones.map((b) => bones[b.name]);
        if (list.some((b) => !b)) return;
        const m = new THREE.SkinnedMesh(o.geometry, o.material);
        m.name = o.name + '_lod1';
        const sk = new THREE.Skeleton(list, o.skeleton.boneInverses);
        lod0[0].parent.add(m);
        m.bind(sk, o.bindMatrix);
        m.visible = false;
        m.frustumCulled = false;
        lod1.push(m);
      });
    }
    shareSkeletons(scene);   // one bone texture per skin and zombie instead of one per mesh
    // library clips are retargeted once per model (rest poses / armature orientation may differ); a stand-in shares
    // its base model's (same rest rotations and pelvis: only bone scales / offsets the clips never key differ)
    const src = (entry.standinOf && this.models.get(entry.standinOf)) || entry;
    if (!src.fallback && this.animSrc && !src.retargeted) {
      try { src.retargeted = retargetClips(this.animSrc.animations, this.animSrc.scene, src.scene); } catch (e) { console.warn('retarget failed', e); src.retargeted = this.clips; }
    }
    const clips = !src.fallback && src.retargeted ? src.retargeted : entry.clips;
    // root scale: a stand-in's own; a boss on a borrowed model / stand-in / the mannequin is scaled up to its real size
    let rs = entry.scale || 1;
    if (def.boss && (entry.standin || entry.fallback || mid !== def.models[0])) rs = def.fallbackScale || rs;
    const z = new Zombie(this, type, def, { scene, hitboxes: entry.hitboxes, height: entry.height, scale: rs }, clips, pos);
    if (rs !== 1) z.root.scale.setScalar(rs);
    z.stride = rs;   // longer legs, longer steps: locomotion clips play slower for the same ground speed
    if (entry.severed) for (const b of entry.severed) z.severed.add(b);   // limbs the model never had (legless crawler)
    if (opts.hpMul) { z.maxHp *= opts.hpMul; z.hp = z.maxHp; }
    if (opts.elite) this._makeElite(z, opts.elite);
    if (this.nav) { const k = this.nav.nearestWalkable(pos.x, pos.z, 10); if (k >= 0) { this.nav.cellCenter(k, _v); z.pos.set(_v.x, _v.y, _v.z); z.groundY = _v.y; } }
    if (opts.id) z.id = opts.id;
    z.lod0 = lod0; z.lod1 = lod1;
    z.shell = patchShell(scene);   // per-zombie status-shell uniforms (fx/zfx.js: berserk, healed, burning, elite...)
    z.poseQ = entry.poseQ ? entry.poseQ.map(([b, q]) => [z.bones[b], q]).filter(([b]) => b) : null;
    if (def.boss) { z.height = def.height; z.radius = def.radius; }
    if (opts.puppet) { z.puppet = true; if (opts.running !== undefined) { z.running = opts.running; z.setLoco(z.running); } }
    z.modelId = mid;
    this.root.add(scene);
    this.list.push(z);
    this.byId.set(z.id, z);
    this.alive++;
    if (!z.puppet) this.net?.zombieSpawned(z, opts);
    return z;
  }

  /** Client: apply one host snapshot row { id, x, y, z, yaw, st, hp, run } at host time t. */
  pushSnapshot(row, t) {
    const z = this.byId.get(row.id);
    if (!z) return;
    z.netBuf.push({ t, x: row.x, y: row.y, z: row.z, yaw: row.yaw, st: row.st, hp: row.hp, run: row.run });
    if (z.netBuf.length > 20) z.netBuf.shift();
    if (z.alive && !z.predictedDeath) z.hp = row.hp * z.maxHp;
  }

  /** Client: the host says this zombie died. */
  netDeath(id, info) {
    const z = this.byId.get(id);
    if (!z) return;
    if (z.alive) z.die(info);
    z.predictedDeath = 0;
  }

  _makeElite(z) {
    z.elite = true;
    z.maxHp *= 3; z.hp = z.maxHp;
    z.walkSpeed *= 1.2;
    // look: the purple elite rim + diamond marker (fx/zfx.js, keyed on z.elite); on top of a stand-in's own scale
    z.root.scale.multiplyScalar(1.12);
    for (const h of z.hitboxes) h.r *= 1.12;
    z.height *= 1.12; z.stride *= 1.12;
  }

  /** Whole-body status tint (fx/zfx.js SHELL kinds: burning, frozen, poisoned, hardened, berserk, healed...) for dur s. */
  status(z, kind, dur = 1) { this.game.fx?.zfx?.status(z, kind, dur); }

  /**
   * Steering direction (unit, xz) down the nav flow field; null if there is no downhill step.
   * Only follows edges NavGrid.computeField itself links (walkable, height step <= STEP, no diagonal
   * corner cutting): NavGrid.flowDir checks none of those and steers into ledges the field routes around.
   * y = mover height, the reference when its own cell isn't walkable (knockback / spawn against a wall).
   */
  flowDir(x, z, y, out) {
    const nav = this.nav, k = nav ? nav.index(x, z) : -1;
    if (k < 0) return null;
    const { w, h, dist, heights, flags } = nav;
    const walk = nav.walkable(k), hk = walk ? heights[k] : y;
    let best = walk ? dist[k] : 0x7fffffff, bk = -1;
    const i = k % w, j = (k / w) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
      const nk = nj * w + ni;
      if (dist[nk] >= best || !(flags[nk] & NAV.WALK)) continue;
      if (hk != null && Math.abs(heights[nk] - hk) > NAV_STEP) continue;
      if (di && dj && (!(flags[j * w + ni] & NAV.WALK) || !(flags[nj * w + i] & NAV.WALK))) continue;
      best = dist[nk]; bk = nk;
    }
    if (bk < 0) return null;
    nav.cellCenter(bk, out);
    out.x -= x; out.z -= z; out.y = 0;
    const l = Math.hypot(out.x, out.z);
    return l < 1e-4 ? null : out.multiplyScalar(1 / l);
  }

  /**
   * Host: the playable region = cells the flow field links to the player spawns (static, so a player hopping onto
   * a crate — an island in the live field — never makes the arena itself look unreachable). null without nav.
   */
  _home() {
    const nav = this.nav;
    if (!nav) return null;
    if (this.homeNav !== nav) {
      this.homeNav = nav;
      nav.computeField(this.game.world.playerSpawns || []);
      const home = new Uint8Array(nav.dist.length);
      let n = 0;
      for (let k = 0; k < home.length; k++) if (nav.dist[k] < 0x7fffffff) { home[k] = 1; n++; }
      this.home = n ? home : null;
      this.fieldT = 0;           // dist now holds this field: the live one is rebuilt next update
    }
    return this.home;
  }

  /** Host: centre of the playable cell nearest to (x, z) within r metres (square rings), or null. */
  reachableNear(x, z, r = 8, out = new THREE.Vector3()) {
    const home = this._home(), nav = this.nav;
    if (!home) return null;
    const { w, h } = nav;
    const i0 = Math.floor((x - nav.ox) / nav.cell), j0 = Math.floor((z - nav.oz) / nav.cell);
    const R = Math.ceil(r / nav.cell);
    for (let rad = 0; rad <= R; rad++) {
      let bk = -1, bd = 1e9;
      const test = (i, j) => {
        if (i < 0 || j < 0 || i >= w || j >= h || !home[j * w + i]) return;
        const d = (i - i0) * (i - i0) + (j - j0) * (j - j0);
        if (d < bd) { bd = d; bk = j * w + i; }
      };
      for (let d = -rad; d <= rad; d++) { test(i0 + d, j0 - rad); if (rad) test(i0 + d, j0 + rad); }
      for (let d = -rad + 1; d < rad; d++) { test(i0 - rad, j0 + d); test(i0 + rad, j0 + d); }
      if (bk >= 0) return nav.cellCenter(bk, out);
    }
    return null;
  }

  /**
   * Host failsafe: a zombie off the playable region (summoned / crash-landed past the arena wall, knocked onto a
   * crate top) never reaches anyone and the round only ends at 0 left: after 4 s it is moved to a spawner (else the
   * nearest playable cell). Flying / attacking bosses and leaps in flight pause the clock.
   */
  _unstick(z, dt) {
    const home = this.home;
    if (!home || !z.alive || z.puppet || z.brain?.flying || z.brain?.attack || z.state === 'special') return;
    const k = this.nav.index(z.pos.x, z.pos.z);
    if (k >= 0 && home[k]) { z.lostT = 0; return; }
    if ((z.lostT = (z.lostT || 0) + dt) < 4) return;
    z.lostT = 0;
    const sp = this.game.match?._pickSpawner?.();
    const p = (sp && this.reachableNear(sp.x, sp.z, 6)) || this.reachableNear(z.pos.x, z.pos.z, 60);
    if (p) { z.pos.copy(p); z.groundY = p.y; z.kvel.set(0, 0, 0); }
  }

  alertAround(pos, r) { for (const z of this.list) if (z.alive && !z.target && z.pos.distanceTo(pos) < r) z.voiceT = Math.min(z.voiceT, 0.3); }

  losCheck(z, target) {
    // cached per zombie for a few frames
    const key = z.id;
    const c = this.losCache.get(key);
    if (c && this.frame - c.f < 6) return c.v;
    const col = this.game.world.collision;
    const v = col ? !col.blocked(_a.set(z.pos.x, z.pos.y + 1.4, z.pos.z), _b.set(target.pos.x, target.pos.y + 1.4, target.pos.z)) : true;
    this.losCache.set(key, { f: this.frame, v });
    return v;
  }

  /**
   * Is the straight xz segment to the target walkable on the nav grid (every cell walkable, height steps the
   * flow field would take)? Cached per zombie like losCheck. The last ~0.75 m is skipped: a player hugging
   * cover usually stands in an eroded, unwalkable cell.
   */
  directPath(z, target) {
    const nav = this.nav;
    if (!nav) return true;
    if (z.dpF !== undefined && this.frame - z.dpF < 6) return z.dpV;
    const dx = target.pos.x - z.pos.x, dz = target.pos.z - z.pos.z, D = Math.hypot(dx, dz), L = D - 0.75;
    const step = nav.cell * 0.5;
    let pk = nav.index(z.pos.x, z.pos.z), h = nav.walkable(pk) ? nav.heights[pk] : z.pos.y, v = true;
    for (let s = step; s < L && v; s += step) {
      const k = nav.index(z.pos.x + (dx / D) * s, z.pos.z + (dz / D) * s);
      if (k === pk) continue;
      if (!nav.walkable(k) || Math.abs(nav.heights[k] - h) > NAV_STEP) v = false;
      else { h = nav.heights[k]; pk = k; }
    }
    z.dpF = this.frame; z.dpV = v;
    return v;
  }

  separate(z, dt) {
    const cell = Math.floor(z.pos.x) + ',' + Math.floor(z.pos.z);
    void cell;
    const r0 = z.radius;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const arr = this.hash.get((Math.floor(z.pos.x) + dx) * 73856093 ^ (Math.floor(z.pos.z) + dz) * 19349663);
      if (!arr) continue;
      for (const o of arr) {
        if (o === z || !o.alive) continue;
        const ddx = z.pos.x - o.pos.x, ddz = z.pos.z - o.pos.z;
        const d2 = ddx * ddx + ddz * ddz, rr = r0 + o.radius;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (rr - d) * 0.5;
          z._move((ddx / d) * push, (ddz / d) * push, this);
        }
      }
    }
    // players: never overlap the capsule
    for (const p of this.players()) {
      const ddx = z.pos.x - p.pos.x, ddz = z.pos.z - p.pos.z;
      const d2 = ddx * ddx + ddz * ddz, rr = r0 + 0.36;
      if (d2 < rr * rr && d2 > 1e-6 && Math.abs(p.pos.y - z.pos.y) < 1.5) {
        const d = Math.sqrt(d2), push = rr - d;
        z._move((ddx / d) * push * 0.8, (ddz / d) * push * 0.8, this);
      }
    }
  }

  _rebuildHash() {
    this.hash.clear();
    for (const z of this.list) {
      if (!z.alive) continue;
      const k = Math.floor(z.pos.x) * 73856093 ^ Math.floor(z.pos.z) * 19349663;
      let arr = this.hash.get(k);
      if (!arr) this.hash.set(k, (arr = []));
      arr.push(z);
    }
  }

  update(dt) {
    this.time += dt;
    this.frame++;
    // the load-time warm-up instances (_warmup) are done once the game runs: the loading screen compiled them
    if (this.warm?.parent) this.warm.removeFromParent();
    // the live count drives round end / spawn caps: recount it so it can never drift (stale kills, predicted deaths)
    let n = 0;
    for (const z of this.list) if (z.alive) n++;
    this.alive = n;
    this.voiceBudget = Math.min(3, this.voiceBudget + dt * 0.8);
    // shared flow field toward the nearest players, refreshed a few times per second
    this.fieldT -= dt;
    if (this.authority && this.nav && this.fieldT <= 0) {
      this._home();
      this.fieldT = 0.3;
      let ps = this.players();
      if (!ps.length) ps = this.targets();   // everyone down: the horde still closes in
      if (ps.length) this.nav.computeField(ps.map((p) => p.pos));
    }
    this._rebuildHash();
    this._updateHazards(dt);
    this.telegraphs.update(dt);
    const cam = this.game.camera;
    const frustum = this.frustum || (this.frustum = new THREE.Frustum());
    const pm = this._pm || (this._pm = new THREE.Matrix4());
    pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pm);
    const sphere = this._sphere || (this._sphere = new THREE.Sphere());
    for (let i = this.list.length - 1; i >= 0; i--) {
      const z = this.list[i];
      const keep = z.update(dt, this);
      if (!keep) { this.root.remove(z.root); z.mixer.stopAllAction(); disposeSkeletons(z.root); this.list.splice(i, 1); this.byId.delete(z.id); continue; }
      if (this.authority) this._unstick(z, dt);
      // animation LOD: near & visible every frame, far / off-screen less often
      sphere.center.set(z.pos.x, z.pos.y + z.height * 0.5, z.pos.z); sphere.radius = z.height;
      const vis = frustum.intersectsSphere(sphere);
      z.root.visible = vis || z.state === 'dead';
      const dist = z.pos.distanceTo(cam.position);
      const every = !vis ? 8 : dist < 15 ? 1 : dist < 35 ? 2 : 4;
      z.animAcc += dt;
      if ((this.frame + z.id) % every === 0 || !z.alive && z.deathT < 1.5) {
        const step = z.animAcc; // real elapsed time since the last pose (not dt*every)
        z.mixer.update(step);
        z.animAcc = 0;
        if (z.poseQ) for (const [b, q] of z.poseQ) b.quaternion.multiply(q);
        z.applyFlinch(step);
      }
      // mesh LOD + shadow casting by distance (bosses always full detail)
      const far = !z.def.boss && z.lod1?.length && dist > 22;
      if (far !== z.isFar) {
        z.isFar = far;
        for (const m of z.lod0 || []) m.visible = !far;
        for (const m of z.lod1 || []) m.visible = far;
      }
      const shadow = dist < 18 || z.def.boss;
      if (shadow !== z.castsShadow) { z.castsShadow = shadow; z.root.traverse((o) => { if (o.isSkinnedMesh) o.castShadow = shadow; }); }
    }
  }

  // ---------------------------------------------------------------- targets interface
  raycast(origin, dir, maxDist) {
    const out = [];
    for (const z of this.list) {
      if (!z.alive) continue;
      // broad phase: vertical cylinder wide enough for the limbs (scaled stand-ins / elites, bosses' arm spans)
      const r = z.radius + 0.45 * Math.max(1, z.root.scale.x) + (z.def.boss ? z.height * 0.35 : 0);
      const ox = origin.x - z.pos.x, oz = origin.z - z.pos.z;
      const a = dir.x * dir.x + dir.z * dir.z;
      const b = 2 * (ox * dir.x + oz * dir.z);
      const c = ox * ox + oz * oz - r * r;
      let t0 = 0;
      if (a > 1e-8) {
        const disc = b * b - 4 * a * c;
        if (disc < 0) continue;
        t0 = (-b - Math.sqrt(disc)) / (2 * a);
        const t1 = (-b + Math.sqrt(disc)) / (2 * a);
        if (t1 < 0 || t0 > maxDist) continue;
      } else if (c > 0) continue;
      if (z.hbFrame !== this.frame) z.updateHitboxes();
      let best = null;
      for (const h of z.hitboxes) {
        if (h.name === 'head' && z.headless) continue;
        const t = rayCapsule(origin, dir, h.p0, h.p1, h.r);
        if (t >= 0 && t <= maxDist && (!best || t < best.t)) best = { t, h };
      }
      if (best) {
        const point = origin.clone().addScaledVector(dir, best.t);
        // normal: from the capsule axis to the point
        closestOnSegment(point, best.h.p0, best.h.p1, _a);
        const normal = point.clone().sub(_a).normalize();
        out.push({ target: z, dist: best.t, point, normal, part: best.h.part, box: best.h.name });
      }
    }
    out.sort((p, q) => p.dist - q.dist);
    // weapons pass info.box through damage(); attach it here
    for (const h of out) {
      const z = h.target, box = h.box;
      h.target = { __proto__: null, alive: true, armor: z.armor, damage: (info) => z.damage({ ...info, box }), center: (o) => z.center(o), distanceTo: (p) => z.distanceTo(p), isBackTo: (p) => z.isBackTo(p), zombie: z };
    }
    return out;
  }

  _updateHazards(dt) {
    const g = this.game, zfx = g.fx?.zfx;
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      if (zfx && !h.vis) h.vis = zfx.hazard(h);     // mottled ground stain + glow (fx/zfx.js)
      h.t -= dt;
      if (h.t <= 0) { h.vis?.stop(); this.hazards.splice(i, 1); continue; }
      if (zfx) zfx.hazardTick(h, dt);               // low poison mist + bubbles
      // fallback wisps scale with the pool's area (a spitter puddle is r 1.6; boss pools are 2.2-2.6)
      else for (let n = dt * 12 * Math.max(1, h.r * h.r / 2.56); n > 0; n--) if (n >= 1 || Math.random() < n) {
        const a = Math.random() * 6.28, r = Math.random() * h.r;
        const acid = h.kind === 'acid';
        g.fx?.particles.spawn({ x: h.pos.x + Math.cos(a) * r, y: h.pos.y + 0.05, z: h.pos.z + Math.sin(a) * r, vx: 0, vy: 0.3 + Math.random() * 0.4, vz: 0, life: 1.2, size: 0.2, size1: 0.8, color: acid ? [0.35, 0.65, 0.08, 0.35] : [0.4, 0.5, 0.15, 0.3], color1: [0.3, 0.4, 0.1, 0], frame: 1, drag: 1 });
      }
      for (const p of this.players()) {
        if (this.authority && h.dps > 0 && Math.hypot(p.pos.x - h.pos.x, p.pos.z - h.pos.z) < h.r && Math.abs(p.pos.y - h.pos.y) < 1.5) g.damagePlayer?.(h.dps * dt, { from: h.pos, dot: true, acid: true, player: p });
      }
    }
  }

  inRadius(center, r) { return this.list.filter((z) => z.alive && z.distanceTo(center) < r + z.radius); }

  // ---------------------------------------------------------------- special attacks
  spit(z, target) {
    const g = this.game;
    if (this.authority) this.net?.fx('spit', { id: z.id, to: target.pos.toArray() });
    const from = z.center(new THREE.Vector3()); from.y += 0.35;
    // aimed at the feet: the lob lands where the warning sweep is (aimed at the chest with no target collision it
    // flew on and splashed ~5 m behind a player standing still)
    const to = target.pos.clone(); to.y += 0.15;
    const dist = from.distanceTo(to);
    const t = dist / z.def.spit.speed;
    const vel = to.sub(from).multiplyScalar(1 / t); vel.y += 0.5 * 9.8 * t * 0.6;
    const mesh = new THREE.Mesh(spitGeo || (spitGeo = new THREE.SphereGeometry(0.09, 8, 6)), spitMat || (spitMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 2.4, 0.3) })));
    g.audio?.play('spitter_spit', { pos: from });
    // CSO-style read: a green countdown sweep where it will land, a glowing tail, an acid pool on impact
    const zfx = g.fx?.zfx;
    const warn = zfx?.spitWarn(target.pos, 1.8, t);
    const trail = zfx?.spitTrail();
    g.projectiles.spawn({
      pos: from, vel, gravity: 9.8 * 0.6, life: 4, mesh, radius: 0.1, hitTargets: false, faceVelocity: false,
      onUpdate: (p, dt) => {
        if (trail) trail.tick(p.pos, dt);
        else if (Math.random() < 0.6) g.fx?.particles.spawn({ x: p.pos.x, y: p.pos.y, z: p.pos.z, vx: 0, vy: -0.3, vz: 0, life: 0.4, size: 0.06, size1: 0.02, color: [0.4, 0.8, 0.08, 0.9], frame: 7, gravity: 4 });
      },
      onEnd: () => { trail?.stop(); warn?.stop(0.12); },
      onHit: (p, point, normal) => {
        g.fx?.blood(point, normal, p.vel.clone().normalize(), 1.5, { acid: true });
        zfx?.acidSplash(point, normal, 1.6, z.def.spit.pool);
        g.audio?.play('acid_splash', { pos: point });
        for (const pl of this.players()) {
          if (this.authority && pl.pos.distanceTo(point) < 1.6 + 0.4) g.damagePlayer?.(z.def.spit.dmg * (this.dmgMul || 1), { from: point, acid: true, player: pl });
        }
        this.hazards.push({ pos: point.clone(), r: 1.6, t: z.def.spit.pool, dps: z.def.spit.dmg * 0.35, kind: 'acid' });
        return true;
      },
    });
  }

  scream(z) {
    const g = this.game;
    if (this.authority) this.net?.fx('scream', { id: z.id });
    const sd = z.def.scream, hd = z.def.heal;
    const zfx = g.fx?.zfx;
    if (zfx) { zfx.screamWave(z, sd.radius, sd.slowTime); zfx.healPulse(z, hd.radius, null, 5); }   // same healed set as below
    else g.fx?.particles.spawn({ additive: true, x: z.pos.x, y: z.pos.y + 1.6, z: z.pos.z, life: 0.5, size: 0.5, size1: sd.radius * 1.6, color: [1.2, 0.6, 2.0, 1], color1: [0.4, 0.2, 0.8, 0], frame: 11 });
    // every client slows its own player (the host does the same for itself)
    const d = g.player ? g.player.pos.distanceTo(z.pos) : 1e9;
    if (d < sd.radius) g.playerStatus?.('slow', sd.slowTime * (1 - d / sd.radius * 0.5), sd.slow);
    if (!this.authority) return;
    for (const o of this.list) {
      if (!o.alive || o === z) continue;
      if (o.pos.distanceTo(z.pos) < hd.radius) { o.hp = Math.min(o.maxHp, o.hp + hd.perSec * 3); o.speedMul = hd.haste; o.hasteT = 5; }
    }
  }

  explode(z) {
    const g = this.game, e = z.def.explode;
    if (this.authority) this.net?.fx('explode', { id: z.id });
    const p = z.center(new THREE.Vector3());
    if (g.fx?.zfx) g.fx.zfx.bloaterBurst(p, e.radius, z.pos.y);   // venom-guard style layers (06b §9.4.2)
    else { g.fx?.explosion(p, { radius: e.radius, scale: 0.9, color: [0.55, 0.9, 0.25] }); g.fx?.blood(p, UP, UP, 4, { acid: true }); g.fx?.gibs(p, UP, 14, [0.25, 0.35, 0.08]); }
    g.audio?.play('bloater_pop', { pos: p, volume: 1.2 });
    for (const pl of this.players()) {
      const d = pl.pos.distanceTo(p);
      if (this.authority && d < e.radius) g.damagePlayer?.(e.dmg * (1 - d / e.radius) * (this.dmgMul || 1), { from: p, explosive: true, player: pl });
    }
    if (this.authority) for (const o of this.list) if (o.alive && o !== z && o.pos.distanceTo(p) < e.radius) o.damage({ amount: e.dmg * 2, part: 'body', dir: o.pos.clone().sub(p).normalize(), knock: 6, stagger: 1, explosive: true });
    this.hazards.push({ pos: p.clone().setY(z.pos.y), r: e.radius * 0.7, t: e.poison, dps: 6, kind: 'poison' });
    z.root.visible = false;
    z.deathT = 6.9;
  }

  onKilled(z, info) {
    this.net?.zombieKilled(z, info);
    this.game.onZombieKilled?.(z, info);
  }

  /** Drops every zombie at once (wipe retry). Stale references (hits in flight, bot targets) see them dead. */
  clear() {
    for (const z of this.list) { z.alive = false; z.state = 'dead'; z.mixer.stopAllAction(); this.root.remove(z.root); disposeSkeletons(z.root); }
    this.list.length = 0;
    this.byId.clear();
    this.hash.clear();
    this.losCache.clear();
    for (const h of this.hazards) h.vis?.stop();
    this.hazards.length = 0;
    this.telegraphs.clear();
    if (this.dangers) this.dangers.length = 0;   // (the bots' copy of the telegraphs)
    this.alive = 0;
    if (this.authority) this.net?.zombiesCleared?.(); // clients drop their puppets
  }
}

/** Ray vs capsule (segment p0-p1, radius r): returns entry distance or -1. Approximate at the caps. */
function rayCapsule(o, d, p0, p1, r) {
  // closest points between the ray and the segment
  const ux = p1.x - p0.x, uy = p1.y - p0.y, uz = p1.z - p0.z;
  const wx = o.x - p0.x, wy = o.y - p0.y, wz = o.z - p0.z;
  const a = d.x * d.x + d.y * d.y + d.z * d.z;
  const b = d.x * ux + d.y * uy + d.z * uz;
  const c = ux * ux + uy * uy + uz * uz;
  const dd = d.x * wx + d.y * wy + d.z * wz;
  const e = ux * wx + uy * wy + uz * wz;
  const den = a * c - b * b;
  let s = den > 1e-9 ? (b * e - c * dd) / den : 0; // ray param
  let t = c > 1e-9 ? (e + b * s) / c : 0;          // segment param
  t = Math.max(0, Math.min(1, t));
  // recompute s for the clamped t
  const qx = p0.x + ux * t, qy = p0.y + uy * t, qz = p0.z + uz * t;
  s = (d.x * (qx - o.x) + d.y * (qy - o.y) + d.z * (qz - o.z)) / a;
  if (s < 0) s = 0;
  const px = o.x + d.x * s - qx, py = o.y + d.y * s - qy, pz = o.z + d.z * s - qz;
  const dist2 = px * px + py * py + pz * pz;
  if (dist2 > r * r) return -1;
  return Math.max(0, s - Math.sqrt(r * r - dist2));
}

function closestOnSegment(p, a, b, out) {
  const ab = _v2.subVectors(b, a);
  const l2 = ab.lengthSq();
  const t = l2 > 1e-9 ? Math.max(0, Math.min(1, _v.subVectors(p, a).dot(ab) / l2)) : 0;
  return out.copy(a).addScaledVector(ab, t);
}
