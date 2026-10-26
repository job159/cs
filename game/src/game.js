// Game: owns the scene, world, local player, zombies, effects and the match; runs the frame.
import * as THREE from 'three';
import { World } from './world/world.js';
import { PlayerController } from './player/controller.js';
import { clamp, Spring3 } from './engine/util.js';
import { Viewmodel } from './player/viewmodel.js';
import { FX } from './fx/fx.js';
import { Projectiles } from './weapons/ballistics.js';
import { Arsenal } from './weapons/arsenal.js';
import './weapons/premium/chiwen.js';   // M07 螭吻．吞潮 (registers its special, skills, clips, crosshair, kill mark)
import './weapons/premium/starsword.js';   // X02 星河．斬嶽 (premium melee: special, skills, clips, crosshair, kill mark)
import './weapons/premium/sunbow.js';      // X03 彤弓．落陽 (great bow: own trigger, arrows, skills, clips, crosshair, kill mark)
import './weapons/premium/staff.js';       // X04 應龍．御霆 (magic staff: own trigger, mana, homing darts, skills, clips, crosshair, kill mark)
import './weapons/premium/greataxe.js';    // X05 刑天．舞戚 (great axe: own melee, leap smash, whirlwind, thrown axe, war spirit, clips, crosshair, kill mark)
import './weapons/premium/twinblades.js';  // X06 虹霓．雙絕 (dual sabres: own blade pose layer, combo, dash, parry, blade storm, lotus ult, clips, crosshair, kill mark)
import './weapons/premium/pulao.js';       // M08 蒲牢．鐘吼 (pump gun: bell shells, knell, 108-bell ultimate, clips, crosshair, kill mark)
import { PlayerStatus } from './player/status.js';
import { ZombieManager } from './zombies/manager.js';
import { Match } from './match/match.js';
import { AimAssist } from './player/aimassist.js';
import { Throwables } from './weapons/throwables.js';
import { BotSquad } from './player/bots.js';
import { RemotePlayer } from './player/remote.js';
import { WEAPONS, registerWeapon, isListed } from './weapons/defs.js';
import { SURF_NAMES } from './world/collision.js';

const _down = new THREE.Vector3(), _feet = new THREE.Vector3(), _stepHit = {};
const _specHead = new THREE.Vector3(), _specBack = new THREE.Vector3(), _specHit = {};
// what the player's systems see while dead: no movement, firing, throwing, using (only reads, never written)
const IDLE_INPUT = { move: { x: 0, y: 0 }, lookX: 0, lookY: 0, held: {}, pressed: {}, released: {} };
// all a downed player can still do (last stand with the sidearm): no switching, jumping, throwing, buying, crates
const LAST_STAND = ['fire', 'alt', 'reload', 'crouch', 'special', 'inspect'];
const STEP_SURF = { concrete: 'concrete', tile: 'concrete', glass: 'concrete', metal: 'metal', grate: 'grate', wood: 'wood', dirt: 'dirt', sand: 'dirt', water: 'water', flesh: 'dirt' };

export class Game {
  constructor({ renderer, input, audio, hud }) {
    this.renderer = renderer;
    this.input = input;
    this.audio = audio;
    this.hud = hud;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x9aa3a8, 0.006);
    this.scene.background = new THREE.Color(0x9aa3a8);
    this.camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 600);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.world = new World(this.scene);
    this.time = 0;
    this.hfov = 96;         // horizontal FOV setting (degrees)
    this.zoom = 1;          // ADS / scope magnification multiplier (>1 zooms in)
    this.punch = new Spring3(160, 16);   // view punch (recoil, hits) in radians: x pitch, y yaw, z roll
    this.shake = 0;         // trauma 0..1 (squared for shake amplitude)
    this.landDip = new Spring3(90, 11);
    this.systems = [];      // objects with update(dt, t)
    this.localId = 0;
    this.timeScale = 1;
    this.hitStopT = 0;
    this.targets = null;    // zombie manager (raycast/inRadius) once created
    // dev / QA hooks (headless tests drive these through window.__cf.game.debug)
    this.debug = {
      WEAPONS, registerWeapon,
      spawnRemote: (opts = {}) => new RemotePlayer(this, { id: opts.id ?? 900 + Math.floor(Math.random() * 99), name: opts.name || '測試隊友', slot: opts.slot ?? 1 }),
      addBots: (n = 3) => { this.bots = new BotSquad(this, Math.min(3, n)); return this.bots; },
    };
  }

  /** Player footsteps by ground surface (one per stride, quiet when crouching), the jump push-off and landing thuds. */
  _footsteps(p) {
    const au = this.audio;
    if (!au) return;
    if (p.jumped) { p.jumped = false; au.play('jump', { volume: 0.7 }); }
    if (p.landImpact > 3) {
      au.play(p.landImpact > 9 ? 'land_heavy' : 'land', { volume: Math.min(1, p.landImpact / 8) });
      p.stepAccum = 0;
      return;
    }
    const spd = p.horizontalSpeed;
    if (!p.onGround || p.stepAccum < (spd > 4.2 ? 2.0 : 1.6)) return;
    p.stepAccum = 0;
    if (spd < 1.2) return;
    _down.set(0, -1, 0);
    _feet.set(p.pos.x, p.pos.y + 0.3, p.pos.z);
    const hit = this.world.collision?.raycast(_feet, _down, 1.2, _stepHit);
    const surf = STEP_SURF[SURF_NAMES[hit?.surf ?? 0]] || 'concrete';
    au.play('footstep_' + surf, { volume: (p.crouch ? 0.3 : 0.55) * Math.min(1, spd / 5) });
  }

  /**
   * Map ambience: the bed (map.json `ambience`: a sound name or [[name, volume], ...] layers; default the dead-city
   * bed: air tone, hollow wind, far sirens / dogs / gunfire, debris) plus a positional crackle loop at every burning
   * prop of the map's fx (fx.smoke entries with `fire`: Lost Town's burning sedan and barrel), sized by the fire.
   */
  _ambience() {
    const a = this.audio, def = this.world.def || {};
    const bed = def.ambience || 'amb_city_dead';
    for (const l of Array.isArray(bed) ? bed : [bed]) {
      const [name, volume = 1] = Array.isArray(l) ? l : [l];
      a.play(name, { loop: true, bus: 'amb', volume });
    }
    for (const s of def.fx?.smoke || []) {
      if (!(s.fire > 0) || !s.pos || s.pos[1] > 30) continue;   // skyline fires are part of the bed
      const w = s.fireWidth ?? 0.5;
      a.play('fire_spot', { pos: { x: s.pos[0], y: s.pos[1] + 0.5, z: s.pos[2] }, loop: true, volume: clamp(s.fire / 10, 0.5, 1.3), range: [1.5 + w * 1.5, 12 + w * 18] });
    }
  }

  /** Low health: a heartbeat while under 30 % and recently hit (or downed), fading out on recovery / death. */
  _lowHealthAudio() {
    const st = this.status, a = this.audio;
    if (!st || !a?.ctx) return;
    const low = st.alive && (st.downed || (st.hp < st.maxHp * (this._heart ? 0.36 : 0.3) && this.time - st.lastHitAt < 8));
    if (low && !this._heart) this._heart = a.play('heartbeat', { loop: true, volume: 0.8, fadeIn: 0.6 });
    else if (!low && this._heart) { this._heart.stop(1.2); this._heart = null; }
  }

  /** Freezes the simulation for a few frames on heavy hits (melee, big kills). */
  hitStop(sec) { this.hitStopT = Math.max(this.hitStopT, sec); }
  noise() {}
  /** Everyone zombies can target: local player, network teammates, AI bots. */
  playerList() {
    const st = this.status;
    const list = this.net ? this.net.playerList() : [{ id: this.localId, pos: this.player.pos, alive: !!st?.alive && !st.downed, downed: !!st?.downed, local: true }];
    if (this.bots) list.push(...this.bots.players());
    return list;
  }

  /** Damage a player: the local one directly, remote ones through the network (host only). */
  damagePlayer(amount, opts = {}) {
    const target = opts.player;
    if (target?.bot) { this.bots?.damage(target.id, amount); return amount; }
    if (target && target.id !== undefined && target.id !== this.localId) { this.net?.sendPlayerDamage(target.id, amount, opts); return amount; }
    return this.status?.damage(amount, opts) ?? 0;
  }
  /** Push a player (boss pulls / knock-ups): local directly, remote through the network. */
  pushPlayer(target, v) {
    if (target && target.id !== undefined && target.id !== this.localId) { this.net?.sendPlayerPush(target.id, v); return; }
    this.player?.addImpulse(v.x, v.y, v.z);
  }
  /**
   * Gets a downed teammate up (`by`: the reviver's id): AI bots directly, us through our status, a remote
   * player on its own client through NetSync's 'rv' event (host only: bots, the only callers for remotes, live there).
   */
  revivePlayer(entry, by = this.localId, hp = 50) {
    if (entry.bot) entry.bot.revive();
    else if (entry.local || entry.id === this.localId) { if (this.status?.downed) this.status.revive(hp); }
    else if (this.net?.host) this.net.events.push(['rv', by, entry.id]);
  }
  /** Hold use next to a downed AI bot to revive it (remote players: NetSync._reviveUpdate). */
  _botRevive(dt, s) {
    const st = this.status, p = this.player;
    let near = null, nd = 2;
    if (p && st?.alive && !st.downed && this.bots) for (const b of this.bots.bots) {
      const d = b.downed ? b.pos.distanceTo(p.pos) : Infinity;
      if (d < nd) { nd = d; near = b; }
    }
    if (near !== this.reviveBot) { this.reviveBot = near; this.reviveHold = 0; }
    if (!near) return;
    this.reviveHold = s.held.use ? this.reviveHold + dt : 0;
    if (this.reviveHold >= 2.5) { this.reviveHold = 0; near.revive(); return; }
    this.hud?.setPrompt(this.reviveHold > 0 ? `救援 ${near.name}… ${Math.floor((this.reviveHold / 2.5) * 100)}%` : `按住 E 救援 ${near.name}`);
  }
  playerStatus(kind, time, value) { if (kind === 'slow') this.status?.applySlow(time, value); }
  get playerDead() { return !this.status || !this.status.alive; }
  onZombieKilled(z, info) {
    this.match?.onKill(z, info);
    const bot = this.bots?.bots.find((b) => b.id === info?.shooter);
    if (bot) this.hud?.killFeed(bot.name, info.weapon || 'ump', z.def.zh, !!info.headshot);
  }
  onPlayerDowned() { this.hud?.toast('你倒下了！', 2000); }
  /** Bled out: frame() locks every action and spectates until a revive sets status.alive again. */
  onPlayerDied() {
    this.audio?.play('player_death');
    this.specIdx = 0;
    if (this.vm) this.vm.aimTarget = 0;
    if (this.arsenal) { this.arsenal.burstLeft = 0; this.arsenal.fireBuffer = 0; }
    this.hud?.setPrompt('');                 // (the shop closes itself: Match.canBuy() is false while dead)
    this.hud?.toast('你陣亡了　回合結束後復活', 3000);
  }
  /** Went down: remember the weapon in hand and draw the sidearm (the knife without one). */
  _lastStand() {
    const ar = this.arsenal;
    this._downSlot = ar?.pendingSlot ?? ar?.slot ?? 1;
    const slot = ar?.owned[2] ? 2 : 3;
    if (ar?.owned[slot]) ar.select(slot);
  }
  /** Downed input: the LAST_STAND actions, movement and look (crawling); everything else reads as released. */
  _lastStandInput(s) {
    const m = this._lsInput || (this._lsInput = { move: { x: 0, y: 0 }, lookX: 0, lookY: 0, held: {}, pressed: {}, released: {} });
    m.move.x = s.move.x; m.move.y = s.move.y; m.lookX = s.lookX; m.lookY = s.lookY;
    for (const a of LAST_STAND) { m.held[a] = s.held[a]; m.pressed[a] = s.pressed[a]; m.released[a] = s.released[a]; }
    return m;
  }

  async loadMap(map) {
    await this.loadWorld(map);
    await this.loadPlayer();
  }

  /** Level only (the menu backdrop renders a world-only game; loadPlayer() can follow later). */
  async loadWorld(map) {
    if (this.worldMap === map) return;
    await this.world.load(map, { game: this });
    this.worldMap = map;
  }

  /** Player, viewmodel, zombies, match and weapons on top of a loaded world. progress(0..1) optional. */
  async loadPlayer(progress) {
    this.player = new PlayerController(this.world);
    const spawns = this.world.playerSpawns;
    this.player.pos.copy(spawns[(this.spawnIndex | 0) % spawns.length] || spawns[0]);
    this.player.yaw = this.world.def?.playerSpawnYaws?.[(this.spawnIndex | 0) % spawns.length] ?? Math.PI; // map packages carry a yaw per spawn
    this.status = new PlayerStatus(this);
    this.aim = new AimAssist(this);
    this.vm = new Viewmodel(this);
    await this.vm.init();
    progress?.(0.4);
    this.zombies = new ZombieManager(this);
    await this.zombies.init();
    progress?.(0.8);
    if (this.matchOptions) { this.match = new Match(this, this.matchOptions); this.match.start(); }
    if (this.matchOptions?.bots > 0) this.bots = new BotSquad(this, Math.min(3, this.matchOptions.bots));
    this.fx = new FX(this, this.renderer.q);
    this.projectiles = new Projectiles(this);
    this.throwables = new Throwables(this);
    this.arsenal = new Arsenal(this);
    // the knife has no model in this build (defs.js WIP): slot 3 would equip an invisible gun that never finishes loading
    if (isListed(WEAPONS.knife)) this.arsenal.give('knife', { select: false });
    this.arsenal.give('glock', { select: false });
    const w = this.arsenal.give(this.startWeapon || 'akm', { select: false });
    if (this.hipOverride && w) w.def = { ...w.def, vm: { hip: this.hipOverride } };
    await this.arsenal.select(w ? Object.keys(this.arsenal.owned).find((k) => this.arsenal.owned[k] === w) | 0 : 1, true);
  }

  addShake(amount) { this.shake = Math.min(1, this.shake + amount); }

  resize(w, h) {
    this.camera.aspect = w / h;
    this._updateFov();
  }

  _updateFov() {
    const a = this.camera.aspect;
    const h = (this.hfov * Math.PI) / 180;
    const v = 2 * Math.atan(Math.tan(h / 2) / a);
    // clamp so tall/narrow windows don't explode the vertical FOV
    const vfov = clamp((v * 180) / Math.PI, 50, 80) / this.zoom;
    if (Math.abs(this.camera.fov - vfov) > 1e-3) { this.camera.fov = vfov; this.camera.updateProjectionMatrix(); }
  }

  frame(dtReal) {
    let dt = dtReal;
    if (this.hitStopT > 0) { this.hitStopT -= dtReal; dt = dtReal * 0.08; }
    this.time += dt;
    const t = this.time;
    const s = this.input.poll();
    const p = this.player;
    // bled out: spectating until revived (round end / wipe retry); look orbits the camera, nothing else acts
    const dead = !!this.status && !this.status.alive, down = !!this.status?.downed;
    // downed: sidearm out for the last stand; back to the previous weapon once on our feet again
    if (down && this._downSlot == null) this._lastStand();
    else if (!down && !dead && this._downSlot != null) { this.arsenal?.select(this._downSlot); this._downSlot = null; }
    const si = dead ? IDLE_INPUT : down ? this._lastStandInput(s) : s;
    if (!dead) this.aim?.apply(s, dt);
    if (p) {
      // look speed follows the zoom; settings 開鏡靈敏度 (adsSens) scales it further while aiming
      const lookK = (1 + ((this.adsSens ?? 1) - 1) * Math.min(1, this.vm?.aim ?? 0)) / this.zoom;
      p.yaw -= s.lookX * lookK;
      p.pitch = clamp(p.pitch + s.lookY * lookK, -1.5, 1.5);
      p.update(dt, si, (this.arsenal?.def?.speed ?? 5.0) * (this.status?.speedMul ?? 1) * (this.match?.speedMul ?? 1));
      if (p.landImpact > 2.5) this.landDip.impulse(-Math.min(p.landImpact, 14) * 0.09, 0, 0);
      this._footsteps(p);
    }
    // ambience bed for the map (needs the audio context, which only exists after the first user gesture)
    if (!this._ambStarted && this.audio?.ready && this.audio.ctx) {
      this._ambStarted = true;
      this._ambience();
    }
    this._lowHealthAudio();
    this.world.update(dt, t);
    if (this.arsenal) this.arsenal.update(dt, si);   // timers / recoil / spin-down keep running
    this.projectiles?.update(dt);
    if (dead || down) s.pressed.grenade = false;     // Throwables reads the input itself (its fire zones keep burning)
    this.throwables?.update(dt);
    if (this.vm && p) {
      this.vm.update(dt, { lookX: s.lookX, lookY: s.lookY, speed: p.horizontalSpeed, onGround: p.onGround,
        landImpact: p.landImpact, crouch: p.crouch, moveX: s.move.x });
    }
    this.status?.update(dt);
    this.zombies?.update(dt);
    this.match?.update(dt);
    this.net?.update(dt);
    this.bots?.update(dt);
    this._botRevive(dt, s);
    // adrenaline self-revive is the solo fallback (design); with human teammates they revive each other
    if (this.status?.downed && this.match && this.match.selfRevives > 0 && !this.net?.remotes.size) {
      this.hud?.setPrompt(`按 E 使用腎上腺素自救（剩 ${this.match.selfRevives}）`);
      if (s.pressed.use) { this.match.selfRevives--; this.status.revive(40); this.hud?.setPrompt(''); }
    }
    // touch use button: shown while a use prompt is up (supply crate, revives, self-revive)
    const canUse = !!this.hud?.promptUse;
    if (this.touch && canUse !== this._canUse) { this._canUse = canUse; this.touch.el.classList.toggle('can-use', canUse); }
    for (const sys of [...this.systems]) sys.update(dt, t);
    this.fx?.update(dt);
    this._updateCamera(dt);
    if (dead && s.pressed.fire) this.specIdx = (this.specIdx | 0) + 1; // next teammate to spectate
    if (s.pressed.buy && !dead && !down) this.shop?.toggle();
    if (this.shop?.open && !this.match?.canBuy()) this.shop.close();
    this.perks?.update(dtReal);
    this.hud?.update(dtReal);
    this.touch?.update();
    this.input.endFrame();
  }

  _updateCamera(dt) {
    const p = this.player;
    const cam = this.camera;
    if (!p) return;
    const punch = this.punch.update(dt);
    const dip = this.landDip.update(dt);
    cam.position.set(p.pos.x, p.pos.y + p.eyeHeight + dip.x, p.pos.z);
    this.shake = Math.max(0, this.shake - dt * 1.6);
    const sh = this.shake * this.shake;
    const tt = this.time * 23;
    const sx = sh * 0.045 * (Math.sin(tt * 1.1) + Math.sin(tt * 2.3 + 1.7) * 0.5);
    const sy = sh * 0.045 * (Math.sin(tt * 1.3 + 4.1) + Math.sin(tt * 2.9 + 0.3) * 0.5);
    const sz = sh * 0.06 * Math.sin(tt * 0.9 + 2.2);
    const ar = this.arsenal;
    const rp = ar ? ar.recoilPitch * Math.PI / 180 : 0, ry = ar ? ar.recoilYaw * Math.PI / 180 : 0;
    cam.rotation.set(p.pitch * -1 + rp + punch.x + sx, p.yaw + ry + punch.y + sy, punch.z + sz);
    if (this.status && !this.status.alive) this._spectate(cam);
    if (!Number.isFinite(cam.rotation.x + cam.rotation.y + cam.rotation.z + cam.position.x + cam.position.y + cam.position.z)) {
      // never let a bad spring/impulse blank the screen: reset the offending state
      console.warn('camera NaN reset', JSON.stringify({ punch: this.punch.x, dip: this.landDip.x, shake: this.shake, rp: ar?.recoilPitch, ry: ar?.recoilYaw, yaw: p.yaw, pitch: p.pitch, pos: p.pos, vel: p.vel }));
      this.punch.reset(); this.landDip.reset(); this.shake = 0;
      if (ar) { ar.recoilPitch = 0; ar.recoilYaw = 0; }
      if (!Number.isFinite(p.yaw)) p.yaw = 0;
      if (!Number.isFinite(p.pitch)) p.pitch = 0;
      if (!Number.isFinite(p.pos.x + p.pos.y + p.pos.z)) { p.pos.copy(this.world.safePoint()); p.vel.set(0, 0, 0); }
      cam.position.set(p.pos.x, p.pos.y + p.eyeHeight, p.pos.z);
      cam.rotation.set(-p.pitch, p.yaw, 0);
    }
    // ADS zoom + sniper scope overlay
    const def = this.arsenal?.def;
    const aim = this.vm?.aim ?? 0;
    const zt = def?.ads?.zoom ?? (this.vm?.weapon?.has('optic') ? 1.35 : 1.18);
    this.zoom = 1 + (zt - 1) * aim;
    const scoped = def?.ads?.scope && aim > 0.85;
    this.renderer.post.scopeMask = scoped ? 1 : 0;
    if (this.vm) this.vm.visible = !scoped && !this.playerDead;
    this._updateFov();
    cam.updateMatrixWorld();
    if (this.audio) {
      cam.getWorldDirection(this._fwd || (this._fwd = new THREE.Vector3()));
      this.audio.setListener(cam.position, this._fwd, (this._up || (this._up = new THREE.Vector3())).set(0, 1, 0).applyQuaternion(cam.quaternion));
    }
  }

  /** Dead: third-person orbit around a living teammate / bot (look orbits, fire cycles), else a low death cam. */
  _spectate(cam) {
    const p = this.player;
    const mates = this.playerList().filter((q) => !q.local && q.alive);
    const m = mates.length ? mates[(this.specIdx | 0) % mates.length] : null;
    this.spectating = m ? m.bot?.name || this.net?.remotes.get(m.id)?.name || '隊友' : '';
    if (!m) { cam.position.y = p.pos.y + 0.4; return; }
    const cp = Math.cos(p.pitch);
    _specBack.set(Math.sin(p.yaw) * cp, Math.sin(p.pitch), Math.cos(p.yaw) * cp);
    _specHead.set(m.pos.x, m.pos.y + 1.55, m.pos.z);
    const hit = this.world.collision?.raycast(_specHead, _specBack, 3.2, _specHit);
    cam.position.copy(_specHead).addScaledVector(_specBack, hit ? Math.max(0.2, hit.dist - 0.25) : 3);
  }

  render() {
    if (this.debugView) {
      // external view of the viewmodel rig (dev): camera placed relative to the player camera
      const dc = this.debugCam || (this.debugCam = new THREE.PerspectiveCamera(40, 1, 0.01, 100));
      dc.aspect = this.camera.aspect; dc.updateProjectionMatrix();
      const off = { side: [0.75, -0.1, -0.25], top: [0.05, 0.8, -0.3], front: [0.1, -0.05, -1.2], left: [-0.75, -0.1, -0.25] }[this.debugView] || [0.75, 0, 0];
      dc.position.set(...off).applyMatrix4(this.camera.matrixWorld);
      dc.lookAt(new THREE.Vector3(0.05, -0.15, -0.3).applyMatrix4(this.camera.matrixWorld));
      dc.updateMatrixWorld();
      this.vm.vmCam.copy(dc); // vmProj follows the debug camera's projection
      import('./gfx/materials.js').then((m) => m.materialUniforms.vmProj.value.copy(dc.projectionMatrix));
      this.renderer.render(this.scene, dc, this.time);
      return;
    }
    this.renderer.render(this.scene, this.camera, this.time);
  }

  /**
   * Tears the game down so the next match (or the menu backdrop) starts clean: network replication,
   * DOM UI, sounds and every GPU resource of the scene (shared cached assets are simply re-uploaded
   * by the next game that uses them).
   */
  dispose() {
    this.disposed = true;
    try { this.net?.dispose?.(); } catch (e) { console.warn(e); }
    try { this.fx?.particles?.dispose?.(); } catch (e) { console.warn(e); } // FX atlas render targets
    this.touch?.dispose?.();
    this.shop?.el?.remove();
    this.perks?.el?.remove();
    const hudRoot = document.getElementById('hud');
    if (hudRoot) hudRoot.innerHTML = '';
    // every sound of this game stops; the music carries on into the menus (the menu theme, unless the results
    // stinger already queued it)
    const a = this.audio;
    if (a) { for (const v of [...a.voices]) if (v !== a.music) v.stop?.(0.25); a.playMusic?.('menu_theme'); }
    const seen = new Set();
    const tex = (t) => { if (t && t.isTexture && !t.isRenderTargetTexture && !seen.has(t)) { seen.add(t); t.dispose(); } };
    this.scene.traverse((o) => {
      if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        if (seen.has(m)) continue;
        seen.add(m);
        for (const v of Object.values(m)) tex(v);
        if (m.uniforms) for (const u of Object.values(m.uniforms)) tex(u?.value);
        m.dispose();
      }
      if (o.isLight && o.shadow?.map) { o.shadow.map.dispose(); o.shadow.map = null; }
    });
    tex(this.scene.environment);
    tex(this.scene.background);
    this.scene.clear();
    this.renderer.gl.renderLists?.dispose?.();
  }
}
