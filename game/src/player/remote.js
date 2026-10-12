// Third-person teammates: a skinned character (mannequin until the soldier model exists) holding the
// teammate's current weapon, driven by interpolated network state; muzzle flashes, tracers and gun
// sounds for their shots; name tag; downed pose.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { buildMannequin } from '../zombies/mannequin.js';
import { loadGLB, instanceGLB } from '../engine/assets.js';
import { applyHardSurface } from '../gfx/materials.js';
import { WEAPONS } from '../weapons/defs.js';
import { angleDiff } from '../engine/util.js';

const SLOT_COLORS = [0x5b7a9a, 0x9a7a4a, 0x6a8a5a, 0x8a5a7a];
const _v = new THREE.Vector3();

export class RemotePlayer {
  constructor(game, { id, name, slot }) {
    this.game = game;
    this.id = id;
    this.name = name;
    this.slot = slot;
    this.pos = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.alive = true; this.downed = false;
    this.hp = 100;
    this.buf = [];               // [{ t, x, y, z, yaw, pitch }]
    this.weaponId = null;
    this.root = new THREE.Group();
    this.root.name = 'remote-' + id;
    game.scene.add(this.root);
    this._build();
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
    this.model.traverse((o) => { if (o.isBone) this.bones[o.name] = o; if (o.isMesh) o.castShadow = true; });
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const c of m.animations || []) this.actions[c.name] = this.mixer.clipAction(c);
    this.loco = this.actions.run || this.actions.walk_a;
    this.loco?.play();
  }

  async setWeapon(id) {
    if (this.weaponId === id) return;
    this.weaponId = id;
    if (this.gun) { this.gun.parent?.remove(this.gun); this.gun = null; }
    try {
      const g = await instanceGLB(`weapons/${id}.glb`);
      if (this.weaponId !== id) return;
      applyHardSurface(g, {});
      this.gun = g;
      const hand = this.bones.hand_r;
      if (hand) {
        hand.add(g);
        // hold roughly forward; the soldier model will provide a proper hand socket later
        g.rotation.set(Math.PI / 2, 0, Math.PI / 2);
        g.position.set(0, -0.08, 0.02);
      } else this.root.add(g);
      const grip = g.getObjectByName('S_grip_r');
      if (grip) g.position.sub(grip.position.clone().applyEuler(g.rotation));
    } catch { /* weapon model missing */ }
  }

  push(state, t) {
    this.buf.push({ t, x: state.x, y: state.y, z: state.z, yaw: state.yaw, pitch: state.pitch });
    if (this.buf.length > 30) this.buf.shift();
    this.alive = state.alive !== false;
    this.downed = !!state.downed;
    this.hp = state.hp ?? this.hp;
    if (state.weapon) this.setWeapon(state.weapon);
  }

  /** Remote shot: muzzle flash at the gun, tracer to the reported end point, positional gunshot. */
  fired(weaponId, end) {
    const def = WEAPONS[weaponId];
    const g = this.game;
    const muzzle = this.gun?.getObjectByName('S_muzzle');
    const from = muzzle ? muzzle.getWorldPosition(new THREE.Vector3()) : this.pos.clone().setY(this.pos.y + 1.4);
    if (def?.flash) g.fx?.muzzle(def.flash, from, _v.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)), { scale: 0.8 });
    if (end) g.fx?.tracer(from, new THREE.Vector3(end[0], end[1], end[2]));
    if (def) g.audio?.play(def.sound + (from.distanceTo(g.camera.position) > 40 ? '_far' : '_close'), { pos: from, volume: 0.8 });
  }

  update(dt, renderTime) {
    // interpolate between the two snapshots around renderTime
    const b = this.buf;
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
      const speed = Math.hypot(this.pos.x - px, this.pos.z - pz) / Math.max(dt, 1e-3);
      if (this.loco) this.loco.timeScale = Math.min(1.6, speed / 3.5);
    }
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw + Math.PI; // models face +Z, our yaw 0 looks down -Z
    this.root.rotation.z = this.downed ? 1.3 : 0;
    this.root.visible = this.alive;
    this.mixer?.update(dt);
    // name tag
    const p = _v.set(this.pos.x, this.pos.y + 2.05, this.pos.z).project(this.game.camera);
    const vis = p.z < 1 && this.alive;
    this.tag.style.display = vis ? '' : 'none';
    if (vis) this.tag.style.transform = `translate(${((p.x * 0.5 + 0.5) * window.innerWidth).toFixed(0)}px, ${((-p.y * 0.5 + 0.5) * window.innerHeight).toFixed(0)}px) translate(-50%, -100%)`;
    this.tag.classList.toggle('down', this.downed);
  }

  dispose() { this.game.scene.remove(this.root); this.tag.remove(); }
}
