// Third-person teammates: the soldier character (assets/characters/soldier.glb, mannequin fallback) holding the
// teammate's current weapon, driven by interpolated network state (or directly by an AI bot, player/bots.js); muzzle
// flashes, tracers and gun sounds for their shots; name tag.
//
// Animation (the soldier's own clips, tools/assets/characters/soldier_anims.mjs) runs on two layers of one mixer:
//   lower body (pelvis + legs): idle_rifle / walk_rifle / run_rifle, crouch_idle / crouch_walk by speed and the crouch
//     flag, timeScale = speed / the clip's treadmill speed (extras.clips[name].speed);
//   upper body (spine and up): the same loco clip (time-synced with the legs) or an overlay - aim / fire / reload,
//     rifle or pistol set by weapon class;
//   full body: downed, revive (kneeling over a teammate), death (clamped; the weapon drops when the body lands).
// Cross-fades are 0.15-0.2 s. After the mixer the aim pitch is spread over spine_01..neck_01, and beyond 15 m the
// LOD1 meshes (bound to the same skeleton) replace LOD0.
// Per weapon: aim / fire are authored on the highest rifle sight line; extras.aimWeld gives the head nod that puts the
// eye on this weapon's sight line (solved at build time against each weapon's stock, sight height formula otherwise).
// During revive the weapon hangs on the back sling (extras.sling, spine_03). The marker band (helmet / left arm,
// material extras.slotTint) takes the teammate's slot colour.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { buildMannequin } from '../zombies/mannequin.js';
import { loadGLB, instanceGLB, shareSkeletons, disposeSkeletons } from '../engine/assets.js';
import { applyHardSurface } from '../gfx/materials.js';
import { WEAPONS } from '../weapons/defs.js';
import { RAMP } from '../fx/fx.js';
import { angleDiff, clamp } from '../engine/util.js';

const SLOT_COLORS = [0x5b7a9a, 0x9a7a4a, 0x6a8a5a, 0x8a5a7a];
const LOWER = /^(pelvis|thigh_[lr]|calf_[lr]|foot_[lr]|ball_[lr])\./;
const FADE = 0.18;
const LOD_DIST = 15;
const ONE_HAND = new Set(['pistol', 'melee']);   // weapon classes held with the pistol clip set
const PITCH_CHAIN = [['spine_01', 0.2], ['spine_02', 0.3], ['spine_03', 0.3], ['neck_01', 0.2]];
const AIM_CHAIN = [['spine_01', 0.5], ['spine_02', 0.3], ['spine_03', 0.2]];
const OVERLAY = /^(aim|fire|reload)_|^idle_pistol$/;   // upper-body clips authored on the standing (idle) pelvis
const _v = new THREE.Vector3(), _ax = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _dq = new THREE.Quaternion();
const _X = new THREE.Vector3(1, 0, 0);
const _m = new THREE.Matrix4();

/** One animation layer: an action per clip restricted to a bone subset, weights ramped towards the current clip. */
class Layer {
  constructor(mixer, clips, filter, tag) {
    this.acts = {};
    this.list = [];
    for (const c of clips) {
      const tracks = c.tracks.filter(filter);
      if (!tracks.length) continue;
      const a = mixer.clipAction(new THREE.AnimationClip(c.name + tag, c.duration, tracks));
      a.weight = 0;
      this.acts[c.name] = a;
      this.list.push([c.name, a]);
    }
    this.cur = null; this.fade = FADE;
  }

  /** Makes `name` the target clip. o: { fade, restart, once, time, phase (keep the old clip's phase) }. */
  set(name, o = {}) {
    const a = this.acts[name];
    if (!a) return null;
    if (name === this.cur && !o.restart) return a;
    const old = this.cur && this.acts[this.cur];
    if (o.restart || a.weight <= 0.001 || !a.isRunning()) {
      a.reset();
      a.time = o.time ?? (o.phase && old ? (old.time / old.getClip().duration) * a.getClip().duration : 0);
    }
    a.setLoop(o.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = !!o.once;
    a.timeScale = 1;
    a.play();
    this.cur = name; this.fade = Math.max(1e-3, o.fade ?? FADE);
    return a;
  }

  get action() { return this.cur ? this.acts[this.cur] : null; }

  update(dt) {
    const k = dt / this.fade;
    let sum = 0;
    for (const [n, a] of this.list) {
      if (n === this.cur) a.weight = Math.min(1, a.weight + k);
      else if (a.weight > 0) { a.weight = Math.max(0, a.weight - k); if (a.weight === 0) a.stop(); }
      sum += a.weight;
    }
    // several clips fading out at once can leave the sum below 1 (the mixer would blend in the bind pose)
    if (sum > 0 && sum < 0.999) for (const [, a] of this.list) if (a.weight > 0) a.weight /= sum;
  }

  /** Debug / QA: this clip only, at time t, no fade. */
  pose(name, t) {
    for (const [n, a] of this.list) if (n !== name) { a.weight = 0; a.stop(); }
    const a = this.set(name, { restart: true, time: t });
    if (a) { a.weight = 1; a.timeScale = 0; }
    return a;
  }
}

export class RemotePlayer {
  constructor(game, { id, name, slot }) {
    this.game = game;
    this.id = id;
    this.name = name;
    this.slot = slot;
    this.pos = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.alive = true; this.downed = false;
    this.crouch = false; this.reloading = false; this.reviving = false; this.aiming = false;
    this.moveSpeed = 0;          // bots: ground speed this frame (m/s); remotes: measured from the interpolated positions
    this.speed = 0;
    this.hp = 100;
    this.buf = [];               // [{ t, x, y, z, yaw, pitch }]
    this.weaponId = null; this.wclass = 'rifle';
    this.clock = 0;
    this.fireUntil = 0; this.aimUntil = 0; this.fireRestart = false; this.fireTs = 1;
    this.reloadT0 = -1; this.reloadUntil = 0; this.reloadDur = 2.4;
    this.dead = false; this.deathT = 0; this.gunDropped = false;
    this.root = new THREE.Group();
    this.root.name = 'remote-' + id;
    game.scene.add(this.root);
    this.ready = this._build();
    this.tag = document.createElement('div');
    this.tag.className = 'nametag';
    this.tag.textContent = name;
    document.getElementById('hud')?.appendChild(this.tag);
  }

  async _build() {
    let src;
    try { src = await loadGLB('characters/soldier.glb'); } catch { src = null; }
    const m = src ? { scene: cloneSkinned(src.scene), animations: src.animations } : buildMannequin(SLOT_COLORS[this.slot % 4]);
    this.model = m.scene;
    this.root.add(this.model);
    this.bones = {};
    this.lod0 = [];
    this.model.traverse((o) => {
      if (o.isBone) this.bones[o.name] = o;
      if (o.isMesh) { o.castShadow = true; if (o.isSkinnedMesh) this.lod0.push(o); if (o.material?.userData?.slotTint) o.material = this._slotMaterial(o.material); }
    });
    this.mixer = new THREE.AnimationMixer(this.model);
    const clips = m.animations || [];
    this.meta = this.model.userData?.clips || {};
    this.actions = {};
    if (src && clips.some((c) => c.name === 'idle_rifle')) {
      // soldier: layered state machine
      this.lower = new Layer(this.mixer, clips.filter((c) => c.name !== 'run'), (t) => LOWER.test(t.name), '@lo');
      this.upper = new Layer(this.mixer, clips.filter((c) => c.name !== 'run'), (t) => !LOWER.test(t.name), '@up');
      this.lower.set('idle_rifle'); this.upper.set('idle_rifle');
      this.lower.action.weight = this.upper.action.weight = 1;
      this.layered = true;
      // the aim / fire / reload overlays were authored on the idle stance's pelvis: over walk / run / crouch legs the
      // spine is turned back to that pelvis orientation so the weapon still points where the teammate looks
      const pq = clips.find((c) => c.name === 'aim_rifle')?.tracks.find((t) => t.name === 'pelvis.quaternion');
      if (pq) this.aimPelvis = new THREE.Quaternion().fromArray(pq.values, 0);
      this.lodReady = this._bindLod1();
    } else {
      for (const c of clips) this.actions[c.name] = this.mixer.clipAction(c);
      this.loco = this.actions.run || this.actions.walk_a;
      this.loco?.play();
    }
  }

  /** The marker material in this teammate's slot colour (SLOT_COLORS, pushed to a saturated, readable band colour). */
  _slotMaterial(src) {
    const m = src.clone();
    const c = new THREE.Color(SLOT_COLORS[(this.slot ?? 0) % SLOT_COLORS.length]);
    const hsl = {};
    c.getHSL(hsl);
    m.color.setHSL(hsl.h, Math.min(1, hsl.s + 0.4), Math.min(0.62, hsl.l + 0.08));
    return m;
  }

  /** LOD1 meshes bound to this instance's skeleton (bone order by name), shown beyond LOD_DIST. */
  async _bindLod1() {
    this.lod1 = [];
    let src;
    try { src = await loadGLB('characters/soldier_lod1.glb'); } catch { return; }
    if (!this.lod0.length) return;
    src.scene.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      const list = o.skeleton.bones.map((b) => this.bones[b.name]);
      if (list.some((b) => !b)) return;
      const mesh = new THREE.SkinnedMesh(o.geometry, o.material?.userData?.slotTint ? this._slotMaterial(o.material) : o.material);
      mesh.name = o.name + '_lod1';
      this.lod0[0].parent.add(mesh);
      mesh.bind(new THREE.Skeleton(list, o.skeleton.boneInverses), o.bindMatrix);
      mesh.visible = false; mesh.frustumCulled = false; mesh.castShadow = true;
      this.lod1.push(mesh);
    });
    shareSkeletons(this.model);   // one bone texture per skin instead of one per mesh
    this.isFar = false;
  }

  async setWeapon(id) {
    if (this.weaponId === id) return;
    this.weaponId = id;
    this.wclass = ONE_HAND.has(WEAPONS[id]?.cat) ? 'pistol' : 'rifle';
    this._returnMag();
    if (this.gun) { this.gun.parent?.remove(this.gun); this.gun = null; }
    try {
      // def.tpModel: a third-person LOD (premium guns whose viewmodel carries 150k triangles of relief)
      const tpm = WEAPONS[id]?.tpModel;
      const g = await (tpm ? instanceGLB(`weapons/${tpm}.glb`).catch(() => instanceGLB(`weapons/${id}.glb`)) : instanceGLB(`weapons/${id}.glb`));
      await this.ready; // the character (and its hand bone) may still be loading
      if (this.weaponId !== id) return;
      // premium guns keep their glow and focus in third person (lite presets, emission x0.5; PREMIUM_WEAPONS §1.5.6)
      const prem = WEAPONS[id]?.premium;
      applyHardSurface(g, prem ? { premium: prem, premiumKey: `p3:${this.id}:${id}`, world: true } : {});
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.gun = g;
      this._attachGun();
    } catch { /* weapon model missing */ }
  }

  /** Weapon into the right hand through the soldier's hand socket (or roughly forward on the mannequin), or onto the
   *  back sling while slung (revive). */
  _attachGun() {
    const g = this.gun;
    if (!g) return;
    this.gunDropped = false;
    const ud = this.model?.userData || {};
    const sling = this.slung && ud.sling ? ud.sling : null;
    const hand = sling ? this.bones?.[sling.bone] : this.bones?.hand_r;
    // cheek weld for this weapon: head nod (rad) that puts the eye on its sight line in aim / fire
    const aw = ud.aimWeld;
    this.weldAngle = 0;
    if (aw && this.wclass !== 'pistol') {
      let a = aw.perWeapon?.[this.weaponId];
      if (a === undefined) {
        const sight = g.getObjectByName('S_optic') || g.getObjectByName('S_sight_rear'), grip = g.getObjectByName('S_grip_r');
        a = sight && grip ? clamp((aw.eyeY - (sight.position.y - grip.position.y) - 0.004) * aw.perMetre, aw.minAngle, aw.maxAngle) : 0;
      }
      this.weldAngle = a;
    }
    if (hand) {
      hand.add(g);
      // soldier.glb exports the weapon frame (origin at the gun's S_grip_r, weapon axes: x right, y up, -z muzzle)
      // in hand_r space as extras.handSocket (in spine_03 space as extras.sling); its clips put the support hand on a
      // rifle handguard / round the strong hand on a pistol
      const s = sling || ud.handSocket;
      if (s) { g.quaternion.fromArray(s.quaternion); g.position.fromArray(s.position); } else {
        g.rotation.set(Math.PI / 2, 0, Math.PI / 2); // mannequin fallback: roughly forward
        g.position.set(0, -0.08, 0.02);
      }
      g.scale.setScalar(1);
    } else this.root.add(g);
    const grip = g.getObjectByName('S_grip_r');
    if (grip) g.position.sub(grip.position.clone().applyQuaternion(g.quaternion));
  }

  push(state, t) {
    this.buf.push({ t, x: state.x, y: state.y, z: state.z, yaw: state.yaw, pitch: state.pitch });
    if (this.buf.length > 30) this.buf.shift();
    this.alive = state.alive !== false;
    this.downed = !!state.downed;
    this.crouch = !!state.crouch;
    this.reloading = !!state.reload;
    this.reviving = !!state.revive;
    this.hp = state.hp ?? this.hp;
    if (state.weapon) this.setWeapon(state.weapon);
  }

  /** Remote shot: muzzle flash at the gun, tracer to the reported end point, positional gunshot, recoil clip. */
  fired(weaponId, end) {
    const def = WEAPONS[weaponId];
    const g = this.game;
    const muzzle = this.gun?.getObjectByName('S_muzzle');
    const from = muzzle ? muzzle.getWorldPosition(new THREE.Vector3()) : this.pos.clone().setY(this.pos.y + 1.4);
    const fwd = muzzle ? new THREE.Vector3(0, 0, -1).transformDirection(muzzle.matrixWorld) : _v.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    // a replayed premium mode (antical.js OVERPHASE_FX: fxMode { until, tracers }) colours flash and tracers
    const om = this.fxMode && this.fxMode.until > g.time ? this.fxMode : null;
    if (def?.flash) g.fx?.muzzle(def.flash, from, fwd, { scale: 0.8, ramp: om ? RAMP.blue : null });
    if (end && om) { const c = om.tracers[om.n++ % om.tracers.length]; g.fx?.glowTracer(from, new THREE.Vector3(end[0], end[1], end[2]), { color: c, glow: c.map((v) => v * 0.4) }); }
    else if (end) g.fx?.tracer(from, new THREE.Vector3(end[0], end[1], end[2]));
    if (def) g.audio?.play(def.sound + (from.distanceTo(g.camera.position) > 40 ? '_far' : '_close'), { pos: from, volume: 0.8 });
    // recoil: auto weapons loop the fire clip at their cadence; single shots restart it (kick on the next frame)
    const clip = this.wclass === 'pistol' ? 'fire_pistol' : 'fire_rifle';
    const si = this.meta?.[clip]?.shotInterval || (this.wclass === 'pistol' ? 0.2 : 0.1);
    if (def?.mode === 'auto') {
      if (this.fireUntil <= this.clock) this.fireRestart = true;
      this.fireTs = clamp(si / (60 / (def.rpm || 600)), 0.6, 1.8);
      this.fireUntil = this.clock + 0.2;
    } else {
      this.fireRestart = true;
      this.fireTs = 1;
      this.fireUntil = this.clock + si * 0.95;
    }
    this.aimUntil = this.clock + 1.4;
  }

  update(dt, renderTime) {
    // interpolate between the two snapshots around renderTime (bots drive pos / yaw directly, buf empty)
    const b = this.buf;
    let raw = this.moveSpeed || 0;
    if (b.length) {
      let i = b.length - 1;
      while (i > 0 && b[i - 1].t > renderTime) i--;
      const s1 = b[i], s0 = b[Math.max(0, i - 1)];
      const span = s1.t - s0.t;
      const u = span > 1e-4 ? Math.min(1, Math.max(0, (renderTime - s0.t) / span)) : 1;
      const px = this.pos.x, pz = this.pos.z;
      this.pos.set(s0.x + (s1.x - s0.x) * u, s0.y + (s1.y - s0.y) * u, s0.z + (s1.z - s0.z) * u);
      this.yaw = s0.yaw + angleDiff(s0.yaw, s1.yaw) * u;
      this.pitch = s0.pitch + (s1.pitch - s0.pitch) * u;
      raw = Math.hypot(this.pos.x - px, this.pos.z - pz) / Math.max(dt, 1e-3);
    }
    this.speed += (Math.min(raw, 8) - this.speed) * Math.min(1, dt * 10);
    // death: a downed teammate who bleeds out plays the death clip and stays; going straight from up to not alive is
    // a peer that left / is not in play yet (hidden, as before)
    if (!this.alive && !this.dead && (this.wasDowned || this.dying)) { this.dead = true; this.deathT = 0; }
    if (this.alive) { if (this.dead) { this.dead = false; this._attachGun(); } this.wasDowned = this.downed; }
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw + Math.PI; // models face +Z, our yaw 0 looks down -Z
    this.root.visible = this.alive || this.dead;
    if (this.layered) this._animate(dt);
    else {
      if (this.loco) this.loco.timeScale = Math.min(1.6, this.speed / 3.5);
      this.root.rotation.z = this.downed ? 1.3 : 0;
      this.mixer?.update(dt);
    }
    // name tag
    const p = _v.set(this.pos.x, this.pos.y + (this.downed || this.dead ? 0.7 : this.crouch ? 1.6 : 2.05), this.pos.z).project(this.game.camera);
    const vis = p.z < 1 && this.alive;
    this.tag.style.display = vis ? '' : 'none';
    if (vis) this.tag.style.transform = `translate(${((p.x * 0.5 + 0.5) * window.innerWidth).toFixed(0)}px, ${((-p.y * 0.5 + 0.5) * window.innerHeight).toFixed(0)}px) translate(-50%, -100%)`;
    this.tag.classList.toggle('down', this.downed);
  }

  /** Picks the clips for this frame, advances the mixer, then pitch, magazine hand-off, weapon drop and LOD. */
  _animate(dt) {
    const L = this.lower, U = this.upper, meta = this.meta;
    if (this.frozen) { this.mixer.update(0); return; } // QA pose (debugPose)
    const t = (this.clock += dt);
    const pistol = this.wclass === 'pistol';
    let pitchK = 0;
    // reload: rising edge of the flag starts the clip, timed to the weapon's reload
    if (this.reloading && !this.wasReloading && this.alive && !this.downed) {
      this.reloadT0 = t;
      this.reloadDur = WEAPONS[this.weaponId]?.reload ?? 2.4;
      this.reloadUntil = t + this.reloadDur;
      this.reloadClip = pistol ? 'reload_pistol' : 'reload_rifle';
      this.reloadStart = true;
    }
    if (!this.reloading && this.wasReloading) this.reloadUntil = Math.min(this.reloadUntil, t);
    this.wasReloading = this.reloading;
    const full = this.dead ? 'death' : this.downed ? 'downed' : this.reviving ? 'revive' : null;
    // revive: both hands work on the casualty, the weapon goes onto the back sling (and back into the hand after)
    const slung = full === 'revive' && !!this.model?.userData?.sling;
    if (slung !== !!this.slung && !this.dead) { this.slung = slung; this._returnMag(); this._attachGun(); }
    if (full) {
      const once = full === 'death';
      const start = L.cur !== full;
      L.set(full, { fade: 0.25, once, restart: start });
      U.set(full, { fade: 0.25, once, restart: start });
      this.reloadUntil = 0; this.fireUntil = 0;
      if (this.dead) this.deathT += dt;
    } else {
      // locomotion by ground speed (hysteresis between the gaits)
      const sp = this.speed, cur = L.cur;
      let lo;
      if (this.crouch) lo = sp > (cur === 'crouch_walk' ? 0.25 : 0.45) ? 'crouch_walk' : 'crouch_idle';
      else if (sp < (cur === 'walk_rifle' || cur === 'run_rifle' ? 0.25 : 0.45)) lo = 'idle_rifle';
      else lo = sp > (cur === 'run_rifle' ? 2.1 : 2.6) ? 'run_rifle' : 'walk_rifle';
      const moving = lo === 'walk_rifle' || lo === 'run_rifle' || lo === 'crouch_walk';
      const la = L.set(lo, { phase: moving && /walk|run/.test(cur || '') });
      const v = meta[lo]?.speed;
      la.timeScale = v > 0 ? clamp(sp / v, 0.55, 1.6) : 1;
      // upper body overlay
      let up = lo, fade = FADE, o = {};
      if (this.reloadUntil > t) {
        up = this.reloadClip; fade = 0.15;
        if (this.reloadStart) { o = { restart: true, once: true }; this.reloadStart = false; }
      } else if (this.fireUntil > t) {
        up = pistol ? 'fire_pistol' : 'fire_rifle';
        fade = /^aim_|^fire_/.test(U.cur || '') ? 0.04 : 0.1;
        if (this.fireRestart) { o = { restart: true }; this.fireRestart = false; }
      } else if (this.aimUntil > t || this.aiming) {
        up = pistol ? 'aim_pistol' : 'aim_rifle';
        fade = /^fire_/.test(U.cur || '') ? 0.06 : 0.16;
      } else if (pistol) up = 'idle_pistol';
      const ua = U.set(up, { fade, ...o });
      if (ua) {
        if (up === lo) { ua.time = la.time; ua.timeScale = la.timeScale; }
        else if (/^fire_/.test(up)) ua.timeScale = this.fireTs;
        else if (/^reload_/.test(up)) ua.timeScale = ua.getClip().duration / Math.max(0.3, this.reloadDur);
        else ua.timeScale = 1;
      }
      pitchK = /^(aim|fire)_/.test(up) ? 1 : 0.5;
    }
    L.update(dt); U.update(dt);
    // the mixer only writes a bone when its animated value changed, so last frame's spine corrections are undone
    // first (else they would pile up on held / constant tracks), and the clean values kept for the next frame
    const kept = this._kept || (this._kept = [...PITCH_CHAIN.map(([n]) => n), 'head'].map((n) => this.bones[n]).filter(Boolean).map((b) => [b, b.quaternion.clone(), false]));
    for (const k of kept) if (k[2]) { k[0].quaternion.copy(k[1]); k[2] = false; }
    this.mixer.update(dt);
    for (const k of kept) k[1].copy(k[0].quaternion);
    if (pitchK) {
      for (const k of kept) k[2] = true;
      let w = 0, wa = 0;
      for (const [n, a] of U.list) if (a.weight > 0) { if (OVERLAY.test(n)) w += a.weight; if (/^(aim|fire)_rifle$/.test(n)) wa += a.weight; }
      this._aimCorrect(Math.min(1, w));
      this._rotateChain(_X, clamp(this.pitch, -0.8, 0.8) * pitchK, PITCH_CHAIN);
      // per-weapon cheek weld: eye onto this weapon's sight line (extras.aimWeld)
      const aw = this.model.userData?.aimWeld;
      if (aw && this.weldAngle && wa > 0.01) this._rotateChain(_X, this.weldAngle * Math.min(1, wa), aw.chain);
    }
    this._magHandoff(t);
    if (this.dead && !this.gunDropped && this.deathT >= (meta.death?.events?.ground ?? 1.0)) this._dropGun();
    // mesh LOD
    if (this.lod1?.length) {
      const far = this.game.camera.position.distanceTo(this.pos) > LOD_DIST;
      if (far !== this.isFar) {
        this.isFar = far;
        for (const m of this.lod0) m.visible = !far;
        for (const m of this.lod1) m.visible = far;
      }
    }
  }

  /**
   * Rotates a bone chain by `angle` about a model-space axis, split by the chain's shares (all about the same axis, so
   * the last bone gets the whole rotation). Used for the aim pitch (+ = looking down, about the lateral axis).
   */
  _rotateChain(axisModel, angle, chain) {
    if (Math.abs(angle) < 1e-4) return;
    this.model.getWorldQuaternion(_q);
    _ax.copy(axisModel).applyQuaternion(_q);
    for (const [n, k] of chain) {
      const b = this.bones[n];
      if (!b?.parent) continue;
      b.parent.getWorldQuaternion(_q2).invert();
      b.quaternion.premultiply(_dq.setFromAxisAngle(_v.copy(_ax).applyQuaternion(_q2), angle * k));
    }
  }

  /** Turns the spine by (authored pelvis) * (current pelvis)^-1, weight w: overlays keep their authored aim. */
  _aimCorrect(w) {
    const pa = this.aimPelvis, pel = this.bones.pelvis;
    if (!pa || !pel || w < 0.01) return;
    _q.copy(pa).multiply(_q2.copy(pel.quaternion).invert()); // pelvis parent (Root) has an identity rotation
    if (_q.w < 0) { _q.x = -_q.x; _q.y = -_q.y; _q.z = -_q.z; _q.w = -_q.w; }
    const angle = 2 * Math.acos(Math.min(1, _q.w)), sn = Math.sqrt(Math.max(0, 1 - _q.w * _q.w));
    if (angle < 1e-3 || sn < 1e-6) return;
    this._rotateChain(new THREE.Vector3(_q.x / sn, _q.y / sn, _q.z / sn), angle * w, AIM_CHAIN);
  }

  /** Reload: between the clip's magOut and magIn events the weapon's magazine rides in the left hand. */
  _magHandoff(t) {
    const active = this.reloadUntil > t && !this.dead && !this.downed;
    const ev = this.meta?.[this.reloadClip]?.events;
    const ct = active && ev ? (t - this.reloadT0) * ((this.meta[this.reloadClip].duration || 2.4) / Math.max(0.3, this.reloadDur)) : -1;
    const want = active && ev && ct >= ev.magOut && ct < ev.magIn;
    if (want && !this.magClone) {
      const m = this.gun?.getObjectByName('mag'), hand = this.bones?.hand_l;
      if (!m || !hand) return;
      hand.updateWorldMatrix(true, false); m.updateWorldMatrix(true, false);
      const c = m.clone();
      _m.copy(hand.matrixWorld).invert().multiply(m.matrixWorld).decompose(c.position, c.quaternion, c.scale);
      hand.add(c);
      m.visible = false;
      this.magClone = c; this.magNode = m;
    } else if (!want && this.magClone) this._returnMag();
  }

  _returnMag() {
    if (!this.magClone) return;
    this.magClone.parent?.remove(this.magClone);
    if (this.magNode) this.magNode.visible = true;
    this.magClone = this.magNode = null;
  }

  /** Death: the weapon leaves the hand when the body lands and lies flat on its side next to it. */
  _dropGun() {
    this.gunDropped = true;
    const g = this.gun;
    if (!g) return;
    this._returnMag();
    g.updateWorldMatrix(true, false);
    const p = g.getWorldPosition(new THREE.Vector3());
    const d = new THREE.Vector3(0, 0, -1).transformDirection(g.matrixWorld).setY(0);
    if (d.lengthSq() < 1e-6) d.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.root.attach(g);
    // world: muzzle along d on the ground plane, rolled onto its right side
    const yaw = Math.atan2(-d.x, -d.z);
    g.quaternion.setFromEuler(new THREE.Euler(0, yaw, Math.PI / 2, 'YXZ')).premultiply(this.root.getWorldQuaternion(_q).invert());
    g.position.copy(this.root.worldToLocal(p.setY(this.pos.y + 0.045)));
  }

  /** QA: holds one clip on both layers at time t (s). */
  debugPose(name, t) {
    if (!this.layered) return null;
    this.frozen = true;
    this.lower.pose(name, t); this.upper.pose(name, t);
    this.mixer.update(0);
    return this.upper.acts[name] || this.lower.acts[name];
  }

  dispose() { this._returnMag(); this.game.scene.remove(this.root); if (this.model) disposeSkeletons(this.model); this.tag.remove(); }
}
