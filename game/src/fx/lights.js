// Fixed pool of point lights for muzzle flashes / explosions / fires. The count never changes at runtime
// (changing the number of lights recompiles every shader in three.js); unused lights sit at intensity 0.
//   flash(pos, color, peak, range, dur)  one-shot: holds the peak for the first frame, then (1-u)^2
//   hold(key, pos, color, intensity, range) / release(key)  persistent keyed lights (fires), updated per frame
import * as THREE from 'three';

export class LightPool {
  constructor(scene, n = 4) {
    this.lights = [];
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffaa55, 0, 8, 2);
      l.castShadow = false;
      scene.add(l);
      this.lights.push({ light: l, t: 0, dur: 0, peak: 0, key: null, hold: 0 });
    }
  }

  _pick() {
    let best = null;
    for (const l of this.lights) {
      if (l.key) continue;
      if (!best || l.light.intensity < best.light.intensity) best = l;
    }
    return best;
  }

  /** One-shot flash: peak intensity (candela), range metres, duration seconds (after a 1-frame hold). */
  flash(pos, color, peak, range, dur = 0.06, hold = 1 / 60) {
    const best = this._pick();
    if (!best) return;
    best.light.position.copy(pos);
    best.light.color.set(color);
    best.light.distance = range;
    best.peak = peak; best.dur = dur; best.t = 0; best.hold = hold;
    best.light.intensity = peak;
  }

  /** Persistent light owned by `key` (fires, burning zombies...). Call every frame; release() when done. */
  hold(key, pos, color, intensity, range) {
    let l = this.lights.find((x) => x.key === key);
    if (!l) {
      // never take the last free light (muzzle flashes need one)
      const free = this.lights.filter((x) => !x.key);
      if (free.length <= 1) return false;
      l = this._pick();
      l.key = key; l.dur = 0;
    }
    l.light.position.copy(pos);
    l.light.color.set(color);
    l.light.distance = range;
    l.light.intensity = intensity;
    return true;
  }

  release(key) {
    for (const l of this.lights) if (l.key === key) { l.key = null; l.light.intensity = 0; l.dur = 0; }
  }

  update(dt) {
    for (const l of this.lights) {
      if (l.key || l.dur <= 0) continue;
      if (l.hold > 0) { l.hold -= dt; continue; }
      l.t += dt;
      const u = l.t / l.dur;
      if (u >= 1) { l.light.intensity = 0; l.dur = 0; continue; }
      l.light.intensity = l.peak * (1 - u) * (1 - u);
    }
  }
}
