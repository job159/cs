// Fixed pool of point lights for muzzle flashes / explosions / fires. The count never changes at runtime
// (changing the number of lights recompiles every shader in three.js); unused lights sit at intensity 0.
import * as THREE from 'three';

export class LightPool {
  constructor(scene, n = 4) {
    this.lights = [];
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffaa55, 0, 8, 2);
      l.castShadow = false;
      scene.add(l);
      this.lights.push({ light: l, t: 0, dur: 0, peak: 0, decay: 1 });
    }
    this.i = 0;
  }
  /** Flash a light: peak intensity (candela-ish), range metres, duration seconds. */
  flash(pos, color, peak, range, dur = 0.06) {
    if (!this.lights.length) return;
    // reuse the weakest light
    let best = this.lights[0];
    for (const l of this.lights) if (l.light.intensity < best.light.intensity) best = l;
    best.light.position.copy(pos);
    best.light.color.set(color);
    best.light.distance = range;
    best.peak = peak; best.dur = dur; best.t = 0;
    best.light.intensity = peak;
  }
  update(dt) {
    for (const l of this.lights) {
      if (l.dur <= 0) continue;
      l.t += dt;
      const u = l.t / l.dur;
      if (u >= 1) { l.light.intensity = 0; l.dur = 0; continue; }
      l.light.intensity = l.peak * Math.pow(1 - u, 2);
    }
  }
}
