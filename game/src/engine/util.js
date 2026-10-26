// Small math helpers shared by gameplay and presentation code.
import * as THREE from 'three';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randSign = () => (Math.random() < 0.5 ? -1 : 1);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

// Gaussian-ish random in [-1, 1] (sum of uniforms), for spread cones that cluster in the centre.
export const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Damped harmonic spring on a scalar. k stiffness, c damping. */
export class Spring {
  constructor(k = 120, c = 14) { this.k = k; this.c = c; this.x = 0; this.v = 0; this.target = 0; }
  impulse(v) { this.v += v; }
  update(dt) {
    // semi-implicit Euler in sub-steps for stability with stiff springs
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const a = -this.k * (this.x - this.target) - this.c * this.v;
      this.v += a * h;
      this.x += this.v * h;
    }
    return this.x;
  }
  reset(x = 0) { this.x = x; this.v = 0; }
}

/** Spring on a Vector3 (each axis independent). */
export class Spring3 {
  constructor(k = 120, c = 14) { this.k = k; this.c = c; this.x = new THREE.Vector3(); this.v = new THREE.Vector3(); this.target = new THREE.Vector3(); }
  impulse(x, y, z) { this.v.x += x; this.v.y += y; this.v.z += z; }
  update(dt) {
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      for (const ax of ['x', 'y', 'z']) {
        const a = -this.k * (this.x[ax] - this.target[ax]) - this.c * this.v[ax];
        this.v[ax] += a * h;
        this.x[ax] += this.v[ax] * h;
      }
    }
    return this.x;
  }
  reset() { this.x.set(0, 0, 0); this.v.set(0, 0, 0); }
}

/** Seeded PRNG (mulberry32) for deterministic generation and network-shared randomness. */
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fixed-size ring pool: get() returns the next object, recycling the oldest. */
export class Ring {
  constructor(n, make) { this.items = Array.from({ length: n }, (_, i) => make(i)); this.i = 0; }
  get() { const o = this.items[this.i]; this.i = (this.i + 1) % this.items.length; return o; }
}

// Easing curves for authored animation.
export const ease = {
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inCubic: (t) => t * t * t,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  outElastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1),
  outExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
};

// ---- loading without long main-thread tasks
// `await` on an already settled promise (a cached model, a finished compile) only queues a microtask: a load made of
// such awaits runs as ONE task, however long, and nothing else gets the main thread meanwhile (input, rendering, the
// multiplayer link's keepalives and timers). These yield to the event loop for real.
let _yq = null;
/** Resolves in a new task (MessageChannel: not clamped to 4 ms like nested setTimeout, not paused in a hidden tab). */
export function yieldTask() {
  if (typeof MessageChannel === 'undefined') return new Promise((r) => setTimeout(r, 0));
  if (!_yq) {
    const ch = new MessageChannel(), q = [];
    ch.port1.onmessage = () => q.shift()?.();
    _yq = { q, port: ch.port2 };
  }
  return new Promise((r) => { _yq.q.push(r); _yq.port.postMessage(0); });
}

/**
 * Time slicer for long loops: `const slice = slicer(8); for (...) { work(); await slice(); }` yields once `budget` ms
 * of work have run since the last yield (cheap otherwise). slice.reset() starts a new slice.
 */
export function slicer(budget = 8) {
  let t0 = performance.now();
  const slice = async () => {
    if (performance.now() - t0 < budget) return;
    await yieldTask();
    t0 = performance.now();
  };
  slice.reset = () => { t0 = performance.now(); };
  return slice;
}
