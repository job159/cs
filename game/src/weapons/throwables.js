// Quick-throw grenades (G, no weapon switch): frag (HE) and incendiary. A first-person throw (player/clips.js
// throwClip: the gun ducks, the left hand takes the grenade off the vest, the gun hand hooks the pin out / the rag is
// lit, overhand throw), then a physics arc with bounces, fuse or impact detonation, splash damage to zombies,
// burning ground zones. Models: weapons/he.glb, weapons/fire.glb (tools/assets/weapons/he.mjs, fire.mjs) for the
// hand, the projectile and the kill-feed icon (kills report weapon 'he' / 'fire').
import * as THREE from 'three';
import { splash } from './ballistics.js';
import { haptic } from './arsenal.js';
import { loadGLB } from '../engine/assets.js';
import { applyHardSurface } from '../gfx/materials.js';
import { throwClip, THROW } from '../player/clips.js';
import { FRAME, RAMP } from '../fx/atlas.js';

// icon: the weapon id kills report (hud kill feed: weapons/<icon>.glb); model: the GLB in hand and in flight
export const THROWABLES = {
  frag: { zh: '破片手雷', price: 300, max: 3, fuse: 1.7, dmg: 320, radius: 6.5, knock: 9, speed: 17, color: 0x4b5536, model: 'he', icon: 'he' },
  fire: { zh: '燃燒彈', price: 450, max: 2, impact: true, radius: 4.2, burn: 7, dps: 60, speed: 15, color: 0x7a5a2a, model: 'fire', icon: 'fire' },
};

// in the left hand (hand frame: -Z fingers, -Y palm normal): the frag sits in the palm, fuse up between thumb and
// index; the molotov is held by the neck, rag up past the thumb. pivot: model offset that puts its centre of mass on
// the spin axis in flight
const handRot = (x, y, z, tilt) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...x), new THREE.Vector3(...y), new THREE.Vector3(...z)))
  .premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...tilt)));
const HELD = {
  // spoon against the palm (grenade -Z -> hand +Y), fuse along the fingers, pull ring facing out
  frag: { offset: [0.004, -0.058, -0.046], rot: handRot([-1, 0, 0], [0, 0, -1], [0, -1, 0], [0.25, 0, 0.35]), pivot: [0, -0.0315, 0] },
  // by the neck (socket `center`, 15 cm up the bottle): the neck leaves the fist between thumb and index (hand
  // +X / -Z), so the rag stands up when the hand is presented and the base hangs below the fist
  fire: { offset: [-0.106, -0.043, 0.061], rot: handRot([-0.7071, 0, -0.7071], [0.7071, 0, -0.7071], [0, -1, 0], [0, 0, 0]), pivot: [0, -0.085, 0] },
};
const WEAPON_HANDS = new Set(['dual', 'bow']);   // grips whose weapon the left hand itself holds: it drops out of view
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3();

/** Stand-in mesh while the GLBs load (or if they are missing). */
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
    this.pending = null;     // { kind, t } a throw asked for while the gun was busy (reload, draw...)
    this.act = null;         // the throw in progress: { kind, t, clip, held, pinned, released }
    // models for the hand (viewmodel materials) and the flight (world materials), prepared once per kind
    this.tpl = {};
    for (const [k, t] of Object.entries(THROWABLES)) {
      loadGLB(`weapons/${t.model}.glb`).then((gl) => {
        const world = gl.scene.clone(true), vm = gl.scene.clone(true);
        applyHardSurface(world, {});
        applyHardSurface(vm, { viewmodel: true });
        vm.traverse((o) => { if (o.userData?.part) o.userData.rest = o.position.clone(); });   // pin / spoon / rag come back each throw
        this.tpl[k] = { world, vm, pivot: new THREE.Vector3(...HELD[k].pivot) };
      }).catch(() => {});
    }
  }

  buy(kind) {
    const t = THROWABLES[kind], m = this.game.match;
    if (!t || !m || !m.canBuy() || this.count[kind] >= t.max || m.money < t.price) { this.game.audio?.play('ui_deny'); return false; }
    m.money -= t.price;
    this.count[kind]++;
    this.game.audio?.play('ui_buy');
    return true;
  }

  /** G: throw the selected grenade (else whatever is left). Waits for a busy gun (reload, draw) to come free. */
  throw() {
    const g = this.game;
    let kind = this.selected;
    if (!this.count[kind]) kind = Object.keys(this.count).find((k) => this.count[k] > 0);
    if (!kind) { g.hud?.toast('沒有投擲物'); return; }
    if (this.act || this.cd > 0) return;
    this.pending = { kind, t: 0 };
  }

  /** The gun is free for the throw clip: idle (an inspect / idle fidget is cut; reloads, draws, swings finish first). */
  _ready() {
    const ar = this.game.arsenal;
    if (!ar?.current || !this.game.vm?.arms) return true;
    return ar.state === 'idle';
  }

  _start(kind) {
    const g = this.game, vm = g.vm, ar = g.arsenal;
    if (!this.count[kind]) return;
    this.count[kind]--;
    this.cd = THROW.dur;
    const tpl = this.tpl[kind];
    const a = this.act = { kind, t: 0, clip: null, held: null, pinned: false, released: false, flame: 0 };
    if (vm?.arms && ar?.current && vm.weapon) {
      vm.aimTarget = 0;
      const full = WEAPON_HANDS.has(vm.weapon.meta.grip) || vm.weapon.dual;
      a.clip = ar.playClip(throwClip(vm, { full }), { duration: THROW.dur, lock: true });
      if (tpl) {
        // the grenade rides in the left hand (shown once the hand is back from the vest); parts reset
        const held = a.held = tpl.vm;
        held.traverse((o) => { if (o.userData?.rest) { o.position.copy(o.userData.rest); o.rotation.set(0, 0, 0); o.visible = true; } });
        vm.hold(held, 'L', { offset: HELD[kind].offset, rot: HELD[kind].rot });
        vm.held.show = false;
      }
    } else if (vm) vm.dip = 0.6;   // no hands to animate: the old duck
    g.audio?.play('pouch', { volume: 0.55 });
    haptic(8);
  }

  /** Throw step by the clip beats: grenade in hand, pin / rag, release; a cut clip (weapon switch) throws at once. */
  _step(dt) {
    const g = this.game, vm = g.vm, a = this.act, T = THROW.dur;
    a.t += dt;
    const u = a.t / T;
    const cut = a.clip && vm?.clip.clip !== a.clip && !a.released;
    const held = a.held;
    if (held && vm.held?.obj === held) {
      vm.held.show = u >= THROW.show && !a.released;
      // frag: the pin slides out toward the gun hand, then it is gone; molotov: the rag catches and burns
      if (a.kind === 'frag') {
        const pin = held.getObjectByName('pin');
        if (pin?.userData.rest) {
          // pulled straight out of the fuse (local +z = the ring side), then it tumbles off and is gone
          const k = (a.t - THROW.pin * T) / 0.05;
          const out = THREE.MathUtils.clamp(k, 0, 1), fly = Math.max(0, k - 1);
          pin.position.copy(pin.userData.rest).add(_v.set(0.015 * fly, -0.03 * fly * fly, 0.035 * out + 0.02 * fly));
          pin.rotation.set(fly * 1.4, 0, -fly * 0.8);
          pin.visible = k < 1.8;
        }
      } else if (u >= THROW.pin && !a.released) this._wick(a, dt);
    }
    if (!a.pinned && u >= THROW.pin) {
      a.pinned = true;
      if (a.kind === 'frag') { g.audio?.play('grenade_pin', { volume: 0.85 }); g.audio?.play('shell_brass', { volume: 0.22, pitch: 1.5, delay: 0.32 }); }
      else g.audio?.play('fire_burst', { volume: 0.25, pitch: 1.6 });
      haptic(6);
    }
    if (!a.cocked && u >= THROW.cock) { a.cocked = true; g.audio?.play('cloth', { volume: 0.5 }); }
    if (!a.released && (u >= THROW.release || cut)) {
      a.released = true;
      if (vm?.held?.obj === held) vm.held.show = false;
      this._launch(a.kind);
    }
    if (a.t >= T || (a.released && cut)) {
      if (vm?.held?.obj === held) vm.hold(null);
      this.act = null;
    }
  }

  /** A lit molotov rag in first person: small flames and embers off the wick (viewmodel-space particles). */
  _wick(a, dt) {
    const g = this.game, P = g.fx?.particles;
    if (!P || !a.held?.visible) return;
    a.flame -= dt;
    if (a.flame > 0) return;
    a.flame = 0.035;
    const wick = a.held.getObjectByName('S_wick');
    if (!wick) return;
    wick.getWorldPosition(_v).applyMatrix4(g.camera.matrixWorldInverse);   // camera (viewmodel particle) space
    P.spawn({ vm: true, additive: true, x: _v.x, y: _v.y + 0.01, z: _v.z, vy: 0.15, life: 0.11, size: 0.05, size1: 0.065, frame: FRAME.fire, frames: 8, fps: 30, frameOffset: Math.random() * 7,
      ramp: RAMP.flame, heat: 1, heat1: 0.35, rot: (Math.random() - 0.5) * 0.5, mirror: Math.random() < 0.5, color: [1, 1, 1, 0.95], color1: [1, 1, 1, 0] });
    P.spawn({ vm: true, additive: true, x: _v.x, y: _v.y, z: _v.z, life: 0.05, size: 0.07, color: [2.6, 1.2, 0.35, 0.7], color1: [1.2, 0.4, 0.08, 0], frame: FRAME.glow });
    if (Math.random() < 0.4) P.spawn({ vm: true, additive: true, x: _v.x, y: _v.y, z: _v.z, vx: (Math.random() - 0.5) * 0.1, vy: 0.25, vz: (Math.random() - 0.5) * 0.1, life: 0.25, size: 0.003, stretch: 0.01, color: [5, 2, 0.5, 1], color1: [2, 0.4, 0.05, 1], frame: FRAME.spark });
  }

  /** Release: the grenade leaves the left hand (just left of the crosshair) on the throw arc. */
  _launch(kind) {
    const g = this.game, t = THROWABLES[kind];
    const cam = g.camera;
    const dir = cam.getWorldDirection(new THREE.Vector3());
    // from the apparent release point, pulled back in front of a wall we are hugging
    const pos = cam.position.clone().add(_w.set(-0.1, -0.02, -0.42).applyQuaternion(cam.quaternion));
    const col = g.world?.collision;
    if (col) {
      _d.subVectors(pos, cam.position);
      const L = _d.length(), hit = col.raycast(cam.position, _d.normalize(), L + 0.08);
      if (hit) pos.copy(cam.position).addScaledVector(_d, Math.max(0.05, hit.dist - 0.1));
    }
    const vel = dir.clone().multiplyScalar(t.speed).add(new THREE.Vector3(0, 3.2, 0)).add(g.player.vel);
    g.audio?.play('swingHeavy', { volume: 0.75, pitch: 1.25 });
    g.punch?.impulse(-0.09, 0.02, 0.05);   // the body follows the throw: a short dip of the view
    haptic(15);
    const tpl = this.tpl[kind];
    const mesh = tpl ? tpl.world.clone(true) : grenadeMesh(kind);
    if (tpl) {
      // spin about the grenade's own centre; a frag's pin is gone and its spoon flies off
      const pivot = new THREE.Group();
      mesh.position.copy(tpl.pivot);
      if (kind === 'frag') { const pin = mesh.getObjectByName('pin'); if (pin) pin.visible = false; const sp = mesh.getObjectByName('spoon'); if (sp) sp.visible = false; }
      pivot.add(mesh);
      this._spoon(kind, pos, vel);
      return this._fly(kind, pivot, pos, vel);
    }
    return this._fly(kind, mesh, pos, vel);
  }

  /** The frag's safety lever pops off on release, tumbling away. */
  _spoon(kind, pos, vel) {
    const tpl = this.tpl[kind], g = this.game;
    const src = kind === 'frag' && tpl?.world.getObjectByName('spoon');
    if (!src) return;
    const sp = new THREE.Group();
    const m = src.clone(true);
    m.position.set(0, 0, 0);
    sp.add(m);
    const v = vel.clone().multiplyScalar(0.55).add(new THREE.Vector3((Math.random() - 0.5) * 2, 2.2, (Math.random() - 0.5) * 2));
    const spin = new THREE.Vector3(Math.random() * 30 - 15, Math.random() * 30 - 15, Math.random() * 30 - 15);
    g.projectiles.spawn({ pos: pos.clone(), vel: v, gravity: 9.8, radius: 0.02, mesh: sp, faceVelocity: false, hitTargets: false, life: 1.6, fuse: 1.6, bounce: 0.3,
      onUpdate: (p, dt) => { sp.rotation.x += spin.x * dt; sp.rotation.y += spin.y * dt; sp.rotation.z += spin.z * dt; },
      onBounce: (p) => { if (p.vel.lengthSq() > 4) g.audio?.play('shell_brass', { pos: p.pos, volume: 0.35, pitch: 0.8 }); } });
  }

  _fly(kind, mesh, pos, vel) {
    const g = this.game, t = THROWABLES[kind];
    const spin = new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10);
    let fT = 0;
    g.projectiles.spawn({
      pos, vel, gravity: 9.8, radius: 0.05, mesh, faceVelocity: false, hitTargets: !!t.impact, life: 8,
      fuse: t.impact ? undefined : t.fuse, bounce: t.impact ? 0 : 0.35,
      onUpdate: (p, dt) => {
        mesh.rotation.x += spin.x * dt; mesh.rotation.y += spin.y * dt; mesh.rotation.z += spin.z * dt;
        // a molotov burns in flight: a small flame trail off the rag
        if (kind === 'fire' && (fT -= dt) <= 0) {
          fT = 0.03;
          g.fx?.particles.spawn({ additive: true, x: p.pos.x, y: p.pos.y + 0.08, z: p.pos.z, vy: 0.4, life: 0.22, size: 0.12, size1: 0.2, frame: FRAME.fire, frames: 8, fps: 20, frameOffset: Math.random() * 7,
            ramp: RAMP.flame, heat: 1, heat1: 0.2, mode: 'align', dir: [0, 1, 0], aspect: 1.3, anchor: 0.3, color: [1, 1, 1, 0.85], color1: [1, 1, 1, 0] });
        }
      },
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
      g.fx?.explosion(pos, { radius: t.radius, scale: 1.1 });
      g.audio?.play(d > 40 ? 'explosion_far' : 'explosion_small', { pos });
      splash(g, pos, t.radius, t.dmg * (g.arsenal?.dmgMul ?? 1), { knock: t.knock, shooter: g.localId, weapon: t.icon });
      g.addShake(Math.max(0, 0.9 - d / 25));
      if (d < 8) haptic(60);
    } else {
      g.audio?.play('fire_burst', { pos });
      g.audio?.play('impact_glass', { pos, volume: 0.9 });
      this.fireZones.push({ pos: pos.clone(), r: t.radius, t: t.burn, dps: t.dps, tick: 0 });
      g.fx?.molotov(pos, { radius: t.radius, duration: t.burn });   // CS2 inferno: spreading flames, smoke, light, scorch
    }
    g.noise?.(pos, 40);
  }

  update(dt) {
    const g = this.game;
    this.cd = Math.max(0, this.cd - dt);
    if (g.input.state.pressed.grenade) this.throw();
    if (this.pending) {
      this.pending.t += dt;
      const st = g.status;
      if (this.pending.t > 3 || (st && (!st.alive || st.downed))) this.pending = null;
      else if (this._ready()) { const k = this.pending.kind; this.pending = null; this._start(k); }
    }
    if (this.act) this._step(dt);
    for (let i = this.fireZones.length - 1; i >= 0; i--) {
      const f = this.fireZones[i];
      f.t -= dt;
      f.tick -= dt;
      if (f.t <= 0) { this.fireZones.splice(i, 1); continue; }
      // (flames, smoke and light are drawn by fx.molotov)
      if (f.tick <= 0) {
        f.tick = 0.25;
        for (const z of g.zombies?.inRadius(f.pos, f.r) || []) {
          z.damage({ amount: f.dps * 0.25 * (g.arsenal?.dmgMul ?? 1), part: 'body', dir: new THREE.Vector3(0, 0, 0), knock: 0, stagger: 0, weapon: THROWABLES.fire.icon, shooter: g.localId, burn: true });
        }
      }
    }
  }
}
