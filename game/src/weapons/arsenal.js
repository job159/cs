// The local player's weapons: inventory slots, switching, firing modes, spread, recoil, reloads and all
// first-person feedback (viewmodel kick, muzzle flash, casings, tracers, sounds, haptics).
import * as THREE from 'three';
import { WEAPONS, slotOf } from './defs.js';
import { fireBullet, splash } from './ballistics.js';
import { drawClip, holsterClip, inspectClip, reloadClipFor, shellStart, shellInsert, shellEnd, pumpCycle, boltCycle, knifeSlash, knifeStab } from '../player/clips.js';
import { gauss, clamp, DEG } from '../engine/util.js';
import { hardSurface } from '../gfx/materials.js';

const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _o = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

const DRAW_TIME = { pistol: 0.45, smg: 0.6, rifle: 0.75, shotgun: 0.75, mg: 1.1, sniper: 0.9, heavy: 1.2, melee: 0.4, grenade: 0.4 };

export function haptic(ms) {
  try { window.NativeBridge?.vibrate?.(ms); } catch { /* not on Android */ }
  if (!window.NativeBridge && navigator.vibrate && matchMedia('(pointer: coarse)').matches) navigator.vibrate(ms);
}

class WeaponState {
  constructor(def) {
    this.def = def;
    this.ammo = def.mag;
    this.reserve = def.reserve;
    this.bloom = 0;
    this.shots = 0;          // shots in the current spray (recoil pattern index)
    this.burstMode = false;
    this.needsCycle = false; // pump / bolt
    this.spin = 0;           // minigun barrel spin 0..1
    this.slideLocked = false;
  }
}

export class Arsenal {
  constructor(game) {
    this.game = game;
    this.vm = game.vm;
    this.owned = {};          // slot -> WeaponState
    this.slot = 1;
    this.current = null;
    this.state = 'none';      // none | draw | idle | reload | cycle | holster | melee
    this.timer = 0;
    this.fireCd = 0;
    this.burstLeft = 0;
    this.recoilPitch = 0;     // degrees, applied to the camera
    this.recoilYaw = 0;
    this.sinceShot = 10;
    this.dmgMul = 1;
    this.reloadMul = 1;
    this.pendingSlot = null;
    this.reloadToken = 0;
    this.lastClick = 0;
    this.knifeDir = 1;
    this.spinSound = null;
  }

  /** Weapon jam (boss shockwaves): no firing for `t` seconds. */
  jam(t) {
    this.jamT = Math.max(this.jamT || 0, t);
    this.game.hud?.toast('武器卡彈！', 1000);
    this.game.audio?.play('dryfire');
    this.vm.kick({ back: 0.05, up: 10, side: 4, roll: 12 });
  }

  give(id, { select = true } = {}) {
    const def = WEAPONS[id];
    if (!def) return null;
    const ws = new WeaponState(def);
    const slot = slotOf(def);
    this.owned[slot] = ws;
    if (select) this.select(slot, true);
    return ws;
  }

  get def() { return this.current?.def; }

  async select(slot, instant = false) {
    const ws = this.owned[slot];
    if (!ws || (ws === this.current && this.state !== 'holster')) return;
    this.reloadToken++;
    this.pendingSlot = slot;
    if (this.current && !instant) {
      this.state = 'holster';
      this.vm.stopClip();
      this.vm.play(holsterClip(), { duration: 0.18 });
      this.timer = 0.18;
      this._spinStop();
      return;
    }
    await this._equip(slot);
  }

  async _equip(slot) {
    const ws = this.owned[slot];
    this.pendingSlot = null;
    this.slot = slot;
    this.current = ws;
    this.state = 'loading';
    this.vm.aimTarget = 0;
    await this.vm.setWeapon(ws.def.id, ws.def);
    if (this.current !== ws) return;
    const t = (ws.def.draw ?? DRAW_TIME[ws.def.cat] ?? 0.7);
    this.state = 'draw';
    this.timer = t;
    this.vm.play(drawClip(ws.def.cat === 'mg' || ws.def.cat === 'heavy'), { duration: t, onEvent: (n, a) => this._clipEvent(n, a) });
    if (ws.slideLocked) this.vm.partState.slide = { v: 1 };
    this.game.hud?.weaponChanged?.(ws);
  }

  // ------------------------------------------------------------------ frame

  update(dt, s) {
    const ws = this.current;
    this.sinceShot += dt;
    this.fireCd = Math.max(0, this.fireCd - dt);
    // recoil recovery once the spray pauses
    if (ws) {
      const r = ws.def.recoil || {};
      const pause = this.sinceShot > Math.max(0.12, 60 / (ws.def.rpm || 600) * 1.6);
      if (pause) {
        const rec = (r.recover ?? 12) * dt;
        this.recoilPitch = Math.max(0, this.recoilPitch - rec * (1 + this.recoilPitch * 0.08));
        this.recoilYaw *= Math.max(0, 1 - 6 * dt);
        if (this.sinceShot > 0.35) ws.shots = 0; // spray pattern restarts after a pause (integer index)
      }
      ws.bloom = Math.max(0, ws.bloom - (ws.def.spread?.[6] ?? 8) * dt);
    }
    // slot switching
    for (let k = 1; k <= 5; k++) if (s.pressed['slot' + k] && this.owned[k]) this.select(k);
    if (s.pressed.next || s.pressed.prev) this._cycleSlot(s.pressed.next ? 1 : -1);
    if (this.state === 'holster') {
      this.timer -= dt;
      if (this.timer <= 0 && this.pendingSlot) this._equip(this.pendingSlot);
      return;
    }
    if (!ws || this.state === 'loading') return;
    const def = ws.def;

    if (this.state === 'draw' || this.state === 'reload' || this.state === 'cycle' || this.state === 'melee') {
      this.timer -= dt;
      if (this.state === 'reload' && def.reloadStyle === 'shell' || this.state === 'reload' && this.shellReload) {
        // tube reloads can be interrupted by firing once at least one shell is in
        if (s.pressed.fire && ws.ammo > 0 && !this.shellEnding) { this._endShellReload(ws, true); }
      }
      if (this.timer <= 0) this._finishState(ws);
      else { this._updateSpin(dt, s, ws); return; }
    }

    // ADS (sniper scopes + rifles). Desktop: hold; touch UI translates its toggle into held state.
    this.vm.aimTarget = s.held.alt && def.cat !== 'melee' && def.cat !== 'heavy' ? 1 : (def.cat === 'heavy' && s.held.alt ? 1 : 0);
    if (s.pressed.reload) this.reload();
    if (s.pressed.inspect && this.state === 'idle') { this.vm.play(inspectClip(), { duration: 2.6 }); }

    if (def.mode === 'melee') { this._melee(s, ws); return; }
    this._updateSpin(dt, s, ws);

    // trigger logic
    if (s.pressed.special && def.alt === 'burst') { ws.burstMode = !ws.burstMode; this.game.audio?.play('ui_click'); this.game.hud?.toast?.(ws.burstMode ? '三連發' : '半自動'); }
    const wantsFire = def.mode === 'auto' ? s.held.fire : s.pressed.fire || (this.fireBuffer > 0);
    this.fireBuffer = Math.max(0, (this.fireBuffer || 0) - dt);
    if (s.pressed.fire && this.fireCd > 0) this.fireBuffer = 0.12; // buffer taps slightly early
    if (this.burstLeft > 0) {
      if (this.fireCd <= 0) { this._fire(ws); this.burstLeft--; this.fireCd = 60 / (def.burstRpm || 1000); if (this.burstLeft === 0) this.fireCd = 60 / def.rpm; }
      return;
    }
    if (this.jamT > 0) { this.jamT -= dt; return; }
    if (wantsFire && this.fireCd <= 0) {
      if (ws.needsCycle) return;
      if (ws.ammo <= 0) {
        if (s.pressed.fire || this.fireBuffer > 0) { this.game.audio?.play('dryfire'); this.fireBuffer = 0; }
        if (ws.reserve > 0) this.reload();
        return;
      }
      if (def.spinUp && ws.spin < 1) return;
      this.fireBuffer = 0;
      if (ws.burstMode && def.burst) { this.burstLeft = def.burst - 1; this._fire(ws); this.fireCd = 60 / (def.burstRpm || 1000); return; }
      this._fire(ws);
      this.fireCd = 60 / def.rpm;
      if (def.mode === 'pump' || def.mode === 'bolt') ws.needsCycle = true;
    }
    if (ws.needsCycle && this.fireCd <= 60 / def.rpm - 0.12 && ws.ammo > 0 && this.state === 'idle') this._cycle(ws);
  }

  _cycleSlot(d) {
    const slots = Object.keys(this.owned).map(Number).sort();
    if (!slots.length) return;
    const i = slots.indexOf(this.slot);
    this.select(slots[(i + d + slots.length) % slots.length]);
  }

  _finishState(ws) {
    const prev = this.state;
    this.state = 'idle';
    if (prev === 'reload' && this.shellReload) { this._shellStep(ws); return; }
    if (prev === 'cycle') ws.needsCycle = false;
  }

  _updateSpin(dt, s, ws) {
    const def = ws.def;
    if (!def.spinUp) return;
    const want = (s.held.fire || s.held.alt) && this.state === 'idle' && ws.ammo > 0;
    ws.spin = clamp(ws.spin + (want ? dt / def.spinUp : -dt / (def.spinUp * 1.6)), 0, 1);
    const ps = this.vm.partState.barrels || (this.vm.partState.barrels = { v: 0, spin: 0 });
    ps.spin = (ps.spin || 0) + ws.spin * dt * 60;
    if (ws.spin > 0.02 && !this.spinSound) this.spinSound = this.game.audio?.play('minigun_spin', { loop: true, volume: 0.6 });
    if (this.spinSound) { this.spinSound.setRate?.(0.6 + ws.spin * 0.5); this.spinSound.setVolume?.(0.3 + ws.spin * 0.5); if (ws.spin <= 0.02) this._spinStop(); }
  }
  _spinStop() { if (this.spinSound) { this.spinSound.stop(0.3); this.spinSound = null; this.game.audio?.play('minigun_spindown'); } }

  // ------------------------------------------------------------------ firing

  /** Current spread cone (degrees) for the HUD crosshair and shots. */
  spreadDeg() {
    const ws = this.current;
    if (!ws) return 0;
    const sp = ws.def.spread || [1, 0.2, 1, 4, 0.3, 4, 8];
    const p = this.game.player;
    const aim = this.vm.aim;
    let a = sp[0] + (sp[1] - sp[0]) * aim;
    const speedFrac = Math.min(1, p.horizontalSpeed / 5);
    a += sp[2] * speedFrac * (1 - aim * 0.6);
    if (!p.onGround) a += sp[3];
    if (p.crouching) a *= 0.75;
    a += ws.bloom * (1 - aim * 0.4);
    return a;
  }

  _fire(ws) {
    const def = ws.def;
    const g = this.game;
    const cam = g.camera;
    ws.ammo--;
    this.sinceShot = 0;
    ws.shots++;
    const spread = this.spreadDeg() * DEG;
    ws.bloom = Math.min(def.spread?.[5] ?? 5, ws.bloom + (def.spread?.[4] ?? 0.3));
    cam.getWorldDirection(_dir);
    _right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    _up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const origin = _o.copy(cam.position);
    const pellets = def.pellets || 1;
    let anyHit = false, kills = 0, head = false;
    const muzzleApparent = this.vm.socketApparent('muzzle', _p);
    for (let i = 0; i < pellets; i++) {
      // pellets: uniform-ish disc; single bullets: centre-weighted
      const r = pellets > 1 ? Math.sqrt(Math.random()) * spread : Math.abs(gauss()) * spread;
      const a = Math.random() * Math.PI * 2;
      const d = new THREE.Vector3().copy(_dir).addScaledVector(_right, Math.cos(a) * Math.tan(r)).addScaledVector(_up, Math.sin(a) * Math.tan(r)).normalize();
      if (def.projectile) { this._launch(ws, origin, d); continue; }
      const res = fireBullet(g, origin, d, def, {
        shooter: g.localId, dmgMul: this.dmgMul,
        onHit: (info, r2, target) => g.hud?.onHit?.(info, r2, target),
      });
      if (res.hits) anyHit = true;
      kills += res.kills;
      if (res.headshot) head = true;
      this._lastEnd = res.end;
      if (def.tracer && (ws.shots % def.tracer === 0 || pellets > 1 && i < 2) && muzzleApparent) g.fx?.tracer(muzzleApparent, res.end);
    }
    // ---- feedback
    const rc = def.recoil || {};
    const first = ws.shots <= 1 ? (rc.first ?? 1) : 1;
    const pat = rc.pattern ? (rc.pattern[(ws.shots - 1) % rc.pattern.length] ?? 0) : (Math.random() - 0.5) * 2;
    const upK = (rc.up ?? 1) * first * (1 - this.vm.aim * 0.25) * (0.85 + Math.random() * 0.3);
    this.recoilPitch = Math.min(rc.upMax ?? 10, this.recoilPitch + upK);
    this.recoilYaw += (rc.side ?? 0.5) * (pat * 0.8 + (Math.random() - 0.5) * 0.6);
    g.punch.impulse(-upK * DEG * 6, (Math.random() - 0.5) * (rc.side ?? 0.5) * DEG * 5, (Math.random() - 0.5) * DEG * 3 * upK);
    this.vm.kick(def.kick || {});
    if (this.vm.weapon?.parts.slide) { this.vm.cycle('slide', 0.065); if (ws.ammo === 0) { ws.slideLocked = true; setTimeout(() => { if (ws.slideLocked) this.vm.partState.slide = { v: 1 }; }, 80); } }
    else if (this.vm.weapon?.parts.bolt && def.mode === 'auto' && (this.vm.weapon.meta.chargeSide === 'right' || this.vm.weapon.meta.chargeSide === 'left')) this.vm.cycle('bolt', 60 / def.rpm * 0.8);
    if (this.vm.weapon?.parts.trigger) this.vm.cycle('trigger', 0.09);
    if (this.vm.weapon?.parts.hammer) this.vm.cycle('hammer', 0.12);
    const mz = this.vm.socketWorld('muzzle', _p);
    if (mz && def.flash) {
      const dirW = this.vm.socketDir('muzzle', new THREE.Vector3());
      g.fx?.muzzle(def.flash, mz, dirW, { vm: true, lightPos: muzzleApparent || mz });
    }
    if (def.shell && def.mode !== 'pump' && def.mode !== 'bolt') this._ejectShell(def.shell);
    // audio: close layer (2D), tail, mechanics
    const au = g.audio;
    if (au) {
      au.play(def.sound + '_close', { volume: 1 });
      au.play(def.sound + '_tail', { volume: 0.9, delay: 0.015 });
      if (au.has(def.sound + '_mech')) au.play(def.sound + '_mech', { volume: 0.8 });
      if (ws.ammo <= Math.ceil(def.mag * 0.2) && ws.ammo > 0 && def.mag > 5) au.play('lowAmmo', { volume: 0.5 });
      au.duckFor(Math.min(0.7, 0.25 + (def.dmg * (def.pellets || 1)) / 400), 0.3);
    }
    haptic(def.cat === 'sniper' || def.cat === 'heavy' ? 45 : def.cat === 'shotgun' ? 35 : def.cat === 'pistol' ? 14 : 10);
    g.addShake(def.cat === 'shotgun' ? 0.22 : def.cat === 'sniper' || def.cat === 'heavy' ? 0.3 : def.cat === 'mg' ? 0.07 : 0.05);
    g.noise?.(g.camera.position, 30);
    g.net?.onLocalFire?.(def.id, origin, _dir, this._lastEnd);
    if (ws.ammo === 0 && ws.reserve > 0 && def.mode !== 'pump' && def.mode !== 'bolt') setTimeout(() => { if (this.current === ws && this.state === 'idle' && ws.ammo === 0) this.reload(); }, 220);
  }

  _ejectShell(type) {
    const g = this.game;
    const ep = this.vm.socketApparent('eject', _p);
    if (!ep) return;
    const data = this.vm.weapon.socket('eject')?.data || {};
    const d = data.dir ? new THREE.Vector3(data.dir[2] ?? 1, data.dir[1] ?? 0.6, -(data.dir[0] ?? 0.15)) : new THREE.Vector3(1, 0.6, 0.15);
    d.normalize().applyQuaternion(this.vm.gunRoot.getWorldQuaternion(_q));
    const sp = 2.2 + Math.random() * 1.2;
    const v = d.multiplyScalar(sp).add(g.player.vel);
    v.y += 0.8;
    const floorY = g.world.collision.floorBelow(ep, 0.2, 5);
    g.fx?.shells.spawn(type, ep.clone(), v, isFinite(floorY) ? floorY : g.player.pos.y);
  }

  _launch(ws, origin, dir) {
    const def = ws.def;
    const g = this.game;
    if (def.projectile === 'rocket') {
      const start = (this.vm.socketApparent('muzzle', new THREE.Vector3()) || origin.clone()).addScaledVector(dir, 0.3);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.5, 8).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4a5236, roughness: 0.6 }));
      let trailT = 0;
      const sound = g.audio?.play('rocket_fly', { pos: start, loop: true });
      g.projectiles.spawn({
        pos: start, vel: dir.clone().multiplyScalar(45), gravity: 1.2, life: 6, mesh, radius: 0.08,
        onUpdate: (p, dt) => {
          trailT += dt;
          sound?.setPos(p.pos);
          if (p.age > 0.08 && p.vel.length() < 140) p.vel.addScaledVector(p.vel.clone().normalize(), 70 * dt);
          while (trailT > 0.012) {
            trailT -= 0.012;
            g.fx?.particles.spawn({ x: p.pos.x, y: p.pos.y, z: p.pos.z, vx: (Math.random() - 0.5) * 0.6, vy: 0.3 + Math.random() * 0.3, vz: (Math.random() - 0.5) * 0.6, life: 1.6 + Math.random(), size: 0.15, size1: 1.1, color: [0.55, 0.54, 0.52, 0.45], color1: [0.6, 0.6, 0.6, 0], frame: 1, drag: 1.2, spin: 1 });
            g.fx?.particles.spawn({ additive: true, x: p.pos.x, y: p.pos.y, z: p.pos.z, life: 0.06, size: 0.35, color: [8, 4, 1.5, 1], frame: 0 });
          }
        },
        onHit: (p, point) => {
          g.fx?.explosion(point, { radius: def.splash, scale: 1.2 });
          g.audio?.play('explosion_large', { pos: point });
          splash(g, point, def.splash, def.dmg, { knock: def.knock, shooter: g.localId, weapon: def.id });
          const d = point.distanceTo(g.camera.position);
          g.addShake(Math.max(0, 0.9 - d / 30));
          if (d < def.splash) g.damagePlayer?.(def.dmg * 0.25 * (1 - d / def.splash), { explosive: true, from: point });
          return true;
        },
        onEnd: () => sound?.stop(0.1),
      });
      this.vm.partState.rocket = { v: 0 };
    }
  }

  // ------------------------------------------------------------------ cycling (pump / bolt)

  _cycle(ws) {
    const def = ws.def;
    this.state = 'cycle';
    const t = def.boltTime ?? (60 / def.rpm) * 0.8;
    this.timer = t;
    const clip = def.mode === 'bolt' ? boltCycle() : pumpCycle();
    this.vm.play(clip, { duration: t, onEvent: (n, a) => this._clipEvent(n, a) });
  }

  // ------------------------------------------------------------------ reloads

  reload() {
    const ws = this.current;
    if (!ws || this.state !== 'idle' || ws.ammo >= ws.def.mag || ws.reserve <= 0 || ws.def.mode === 'melee') return;
    const def = ws.def;
    const empty = ws.ammo === 0;
    this.vm.aimTarget = 0;
    const style = def.reloadStyle === 'shell' ? 'shell' : (this.vm.weapon?.meta.reload || 'mag');
    if (style === 'shell_tube' || style === 'shell' || def.mode === 'pump' && style !== 'drum') {
      this.shellReload = true; this.shellEnding = false; this.shellNeedsPump = empty || ws.needsCycle;
      this.state = 'reload';
      const t = (def.reloadStart ?? 0.4) * this.reloadMul;
      this.timer = t;
      this.shellPhase = 'start';
      this.vm.play(shellStart(), { duration: t, onEvent: (n, a) => this._clipEvent(n, a) });
      return;
    }
    this.shellReload = false;
    const t = (empty ? def.reloadEmpty ?? def.reload : def.reload) * this.reloadMul;
    this.state = 'reload';
    this.timer = t;
    this._reloadApplied = false;
    const clip = reloadClipFor(this.vm, style, empty);
    this.vm.play(clip, { duration: t, onEvent: (n, a) => this._clipEvent(n, a) });
  }

  _shellStep(ws) {
    const def = ws.def;
    if (this.shellPhase === 'end') { this.shellReload = false; this.state = 'idle'; ws.needsCycle = false; return; }
    if (ws.ammo >= def.mag || ws.reserve <= 0 || this.shellEnding) { this._endShellReload(ws); return; }
    this.shellPhase = 'insert';
    this.state = 'reload';
    const t = def.reload * this.reloadMul;
    this.timer = t;
    this.vm.play(shellInsert(), { duration: t, onEvent: (n, a) => this._clipEvent(n, a) });
  }

  _endShellReload(ws, interrupted = false) {
    this.shellEnding = true;
    this.shellPhase = 'end';
    this.state = 'reload';
    const pump = this.shellNeedsPump;
    const t = (def(ws).reloadEnd ?? 0.45) * (pump ? 1.6 : 1) * this.reloadMul;
    this.timer = interrupted ? t * 0.6 : t;
    this.vm.play(shellEnd(this.vm, { pump }), { duration: this.timer, onEvent: (n, a) => this._clipEvent(n, a) });
  }

  _clipEvent(name, arg) {
    const g = this.game;
    const ws = this.current;
    if (name === 'snd') g.audio?.play(arg, { volume: 0.9 });
    else if (name === 'ammo' && ws) {
      const need = ws.def.mag - ws.ammo;
      const take = Math.min(need, ws.reserve);
      ws.ammo += take; ws.reserve -= take;
      ws.slideLocked = false;
      ws.needsCycle = false;
      if (this.vm.partState.slide) this.vm.partState.slide.v = 0;
      g.hud?.ammoChanged?.();
    } else if (name === 'ammo1' && ws) {
      if (ws.reserve > 0 && ws.ammo < ws.def.mag) { ws.ammo++; ws.reserve--; g.hud?.ammoChanged?.(); }
    } else if (name === 'shellOut' && ws?.def.shell) {
      for (let i = 0; i < (arg || 1); i++) this._ejectShell(ws.def.shell);
    } else if (name === 'magDrop') {
      // a real magazine falls to the floor (not for tactical reloads with ammo left)
      if (ws && ws.ammo === 0) this._dropMag();
    } else if (name === 'hit') this._meleeHit();
  }

  _dropMag() {
    const g = this.game;
    const part = this.vm.weapon?.parts.mag;
    if (!part) return;
    const clone = part.node.clone(true);
    const wp = this.vm.socketApparent('magwell', new THREE.Vector3()) || g.camera.position.clone();
    clone.position.copy(wp);
    clone.quaternion.copy(this.vm.gunRoot.getWorldQuaternion(new THREE.Quaternion()));
    clone.scale.setScalar(0.85);
    // world materials: swap viewmodel materials for regular ones
    clone.traverse((o) => { if (o.isMesh) { o.material = hardSurface(o.material.userData.preset || 'steel'); o.frustumCulled = true; o.castShadow = true; } });
    g.scene.add(clone);
    const floorY = g.world.collision.floorBelow(wp, 0.2, 5);
    const vel = new THREE.Vector3((Math.random() - 0.5) * 0.4, -0.5, 0.2).applyQuaternion(g.camera.quaternion).add(g.player.vel);
    const spin = new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
    let t = 0, landed = false;
    const sys = { update: (dt) => {
      t += dt;
      if (!landed) {
        vel.y -= 15 * dt;
        clone.position.addScaledVector(vel, dt);
        clone.rotation.x += spin.x * dt; clone.rotation.y += spin.y * dt; clone.rotation.z += spin.z * dt;
        if (clone.position.y < floorY + 0.02) { clone.position.y = floorY + 0.02; landed = true; g.audio?.play('magDrop', { pos: clone.position }); }
      }
      if (t > 8) { g.scene.remove(clone); g.systems.splice(g.systems.indexOf(sys), 1); }
    } };
    g.systems.push(sys);
  }

  // ------------------------------------------------------------------ melee

  _melee(s, ws) {
    const def = ws.def;
    if (this.state !== 'idle') return;
    if (s.pressed.fire || (s.held.fire && this.fireCd <= 0)) {
      if (this.fireCd > 0) return;
      this.state = 'melee';
      const t = 60 / def.rpm;
      this.timer = t;
      this.fireCd = t;
      this.meleeHeavy = false;
      this.knifeDir = -this.knifeDir;
      this.vm.play(knifeSlash(this.knifeDir), { duration: t, onEvent: (n, a) => this._clipEvent(n, a) });
    } else if (s.pressed.alt) {
      this.state = 'melee';
      const t = def.heavy?.time ?? 0.9;
      this.timer = t;
      this.fireCd = t;
      this.meleeHeavy = true;
      this.vm.play(knifeStab(), { duration: t, onEvent: (n, a) => this._clipEvent(n, a) });
    }
  }

  _meleeHit() {
    const g = this.game;
    const ws = this.current;
    if (!ws) return;
    const def = ws.def;
    const heavy = this.meleeHeavy;
    const range = heavy ? def.heavy?.range ?? 2 : def.range?.[0] ?? 1.8;
    const dmg = heavy ? def.heavy?.dmg ?? def.dmg * 2.5 : def.dmg;
    g.camera.getWorldDirection(_dir);
    // a short fan of rays so slashes are forgiving
    const hitTargets = new Set();
    let hitWorld = null;
    for (const yaw of heavy ? [0] : [-0.35, -0.17, 0, 0.17, 0.35]) {
      const d = _dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw * this.knifeDir);
      const wh = g.world.collision.raycast(g.camera.position, d, range);
      const maxD = wh ? wh.dist : range;
      const th = g.targets?.raycast(g.camera.position, d, maxD)[0];
      if (th && !hitTargets.has(th.target)) {
        hitTargets.add(th.target);
        const backstab = th.target.isBackTo?.(g.camera.position) ? 2 : 1;
        const res = th.target.damage({ amount: dmg * backstab * (th.part === 'head' ? def.head ?? 2 : 1) * this.dmgMul, part: th.part, point: th.point, normal: th.normal, dir: d, dist: th.dist, knock: def.knock * (heavy ? 2 : 1), stagger: heavy ? 1 : def.stagger, weapon: def.id, shooter: g.localId, melee: true, headshot: th.part === 'head' });
        g.hud?.onHit?.({ amount: dmg, part: th.part, headshot: th.part === 'head' }, res, th.target);
        g.audio?.play('knife_hit_flesh', { pos: th.point });
        g.hitStop?.(heavy ? 0.06 : 0.035);
        g.addShake(heavy ? 0.2 : 0.1);
        haptic(heavy ? 35 : 18);
      } else if (wh && !hitWorld) hitWorld = { wh: { ...wh, point: wh.point.clone(), normal: wh.normal.clone() }, d };
    }
    if (!hitTargets.size && hitWorld) {
      g.fx?.impact(hitWorld.wh.surf, hitWorld.wh.point, hitWorld.wh.normal, hitWorld.d, { big: 0.6 });
      g.audio?.play('knife_hit_wall', { pos: hitWorld.wh.point });
      haptic(12);
    }
  }
}

function def(ws) { return ws.def; }
