// Touch aim assist (CoD-Mobile style): look friction near targets, gentle magnetism while turning or
// firing, and optional auto-fire when the crosshair sits on a target. Desktop (mouse) gets none.
import * as THREE from 'three';

const _f = new THREE.Vector3();
const _t = new THREE.Vector3();

export class AimAssist {
  constructor(game) {
    this.game = game;
    this.enabled = true;
    this.autoFire = false;
    this.strength = 1;
    this.target = null;
    this.autoHeld = false;
    try {
      const s = JSON.parse(localStorage.getItem('cf.settings') || '{}');
      if (s.aimAssist !== undefined) this.enabled = !!s.aimAssist;
      if (s.autoFire !== undefined) this.autoFire = !!s.autoFire;
    } catch { /* defaults */ }
  }

  /** Mutates input state s (lookX/lookY, fire) before the player applies it. */
  apply(s, dt) {
    const g = this.game;
    if (!g.touch || !g.zombies || !this.enabled && !this.autoFire) { this._release(s); return; }
    const cam = g.camera;
    cam.getWorldDirection(_f);
    const def = g.arsenal?.def;
    if (!def || def.cat === 'melee') { this._release(s); return; }
    // best target: smallest angle to the chest (or head if close), within range and a cone
    let best = null, bestAng = 0.2, bestPoint = null;
    for (const z of g.zombies.list) {
      if (!z.alive) continue;
      _t.set(z.pos.x, z.pos.y + z.height * (z.brain ? 0.55 : 0.72), z.pos.z).sub(cam.position);
      const d = _t.length();
      if (d > 70 || d < 0.5) continue;
      const ang = Math.acos(Math.min(1, _t.dot(_f) / d));
      const cone = 0.09 + Math.min(0.12, 2.2 / d); // wider up close
      if (ang < cone && ang < bestAng) { bestAng = ang; best = z; bestPoint = _t.clone().add(cam.position); }
    }
    if (best && !g.zombies.losCheck(best, { pos: g.player.pos })) best = null;
    this.target = best;
    if (!best) { this._release(s); return; }
    if (this.enabled) {
      // friction: slow the look while over a target
      const fr = 1 - 0.38 * this.strength;
      s.lookX *= fr; s.lookY *= fr;
      // magnetism: pull toward the target only while the player turns or shoots (never steals aim at rest)
      const active = Math.abs(s.lookX) + Math.abs(s.lookY) > 1e-4 || s.held.fire;
      if (active) {
        const p = g.player;
        const dx = bestPoint.x - cam.position.x, dy = bestPoint.y - cam.position.y, dz = bestPoint.z - cam.position.z;
        const wantYaw = Math.atan2(-dx, -dz), wantPitch = -Math.atan2(dy, Math.hypot(dx, dz));
        let dyaw = wantYaw - p.yaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
        const k = Math.min(1, dt * 3.2 * this.strength);
        s.lookX -= dyaw * k * 0.5;
        s.lookY += (wantPitch - p.pitch) * k * 0.35;
      }
    }
    if (this.autoFire) {
      const tight = bestAng < 0.05 + Math.min(0.06, 1.2 / Math.max(1, best.pos.distanceTo(cam.position)));
      if (tight && !s.held.fire) { s.held.fire = true; s.pressed.fire = true; this.autoHeld = true; }
      else if (!tight) this._release(s);
    }
  }

  _release(s) {
    if (this.autoHeld) { s.held.fire = false; s.released.fire = true; this.autoHeld = false; }
  }
}
