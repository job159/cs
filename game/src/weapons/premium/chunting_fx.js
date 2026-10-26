// E01 春霆神戟．驚蟄 effect primitives (docs/PREMIUM_WEAPONS.md §2 E01): the 放電 arc set (white core in a violet sheath
// that fattens towards the target, re-jittered every 50 ms, a corona + spark fountain + ground crawl where it bites),
// 雷爆, the 驚蟄 storm (stacked billow discs wound round an open eye, a funnel dropping out of it, lit from inside; isobar
// SIGIL under it), the giant strike (the jagged bolt re-striking its channel, a flash that collapses inward, then a glow
// ring, ionised smoke and crawling ground arcs), the javelin's trail, the 雷樁 lightning rod (a real hazard-striped mast
// with a porcelain insulator and a glowing copper crown), KE_CHAR, viewmodel effects that ride their sockets.
// Glow is additive on top of the realistic base layer (dust, rubble, scorch, cracks: §1.1 rule 5).
import * as THREE from 'three';
import { FRAME, DECAL, DECAL_TINT } from '../../fx/fx.js';
import { noiseTexture, GLSL_NOISE } from '../../fx/kitutil.js';
import { applyHardSurface } from '../../gfx/materials.js';

const R = Math.random;
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3(), _r = new THREE.Vector3();

// HDR colours (linear): white-hot core, violet-white arc (glow_arc), deep violet sheath, purple sparks, a little gold
export const COL = {
  white: [8, 8, 10], core: [5.4, 4.6, 9.8], rim: [7.2, 6.8, 9.6], violet: [3.0, 1.5, 8.4], deep: [0.9, 0.35, 4.0], spark: [4.6, 2.4, 9.6], gold: [6.2, 4.4, 1.3],
};
export const k3 = (c, m) => [c[0] * m, c[1] * m, c[2] * m];
/** Plays `name`, or the stock fallback `fb` while the weapon's own bank is not produced yet. */
export function sfx(g, name, fb, o = {}) {
  const a = g?.audio;
  if (!a) return null;
  const n = !a.has || a.has(name) ? name : fb;
  return n ? a.play(n, o) : null;
}
/** fn() after sec of game time (hit-stop slows it like everything else) */
export function after(g, sec, fn) {
  if (!g?.systems) return;
  let t = 0;
  const sys = { update: (dt) => { if ((t += dt) < sec) return; const i = g.systems.indexOf(sys); if (i >= 0) g.systems.splice(i, 1); fn(); } };
  g.systems.push(sys);
}
/** fn(t, dt) every frame for life s (t 0..life); returning false ends it early */
export function track(g, life, fn) {
  if (!g?.systems) return;
  let t = 0;
  const sys = { update: (dt) => { t += dt; if (t > life || fn(Math.min(t, life), dt) === false) { const i = g.systems.indexOf(sys); if (i >= 0) g.systems.splice(i, 1); } } };
  g.systems.push(sys);
  fn(0, 0);
}
const lowQ = (g) => (g.renderer?.qualityName || g.renderer?.quality?.name) === 'low';
/** Gun axes in camera space (viewmodel particles live there). */
export function gunAxes(vm) {
  const q = vm.gunRoot.quaternion;
  _f.set(0, 0, -1).applyQuaternion(q); _u.set(0, 1, 0).applyQuaternion(q); _r.set(1, 0, 0).applyQuaternion(q);
  return { f: _f, u: _u, r: _r };
}
/** First-person arc (camera space) from a to b. */
export function vmArc(g, a, b, { w = 0.003, life = 0.07, k = 1, levels = 3, jitter = 0.24 } = {}) {
  return g.fx?.bolt?.(a.clone(), b.clone(), { vm: true, col: k3(COL.white, 0.6 * k), glow: k3(COL.violet, 0.35 * k), width: w, core: 0.26, levels, jitter, branches: 0, regen: 0.03, life });
}
/**
 * First-person arc whose ends follow the gun while it lives: A() / B() return the camera-space ends each frame (a clip
 * moving the gun 15 cm in 0.1 s left one-shot arcs and particles hanging in the air beside it).
 */
export function vmArcT(g, A, B, o = {}) {
  const a = A(), b = B();
  if (!a || !b) return null;
  const bolt = vmArc(g, a, b, o);
  if (bolt) track(g, o.life ?? 0.07, () => { const p = A(), q = B(); if (p && q) bolt.set(p, q); });
  return bolt;
}
/** A camera-space glow (and optional flat ring facing `dir()`) riding a moving point P() for life s. */
export function vmFlash(g, P, { life = 0.18, size = [0.03, 0.07], col = COL.core, k = 0.3, ring = null } = {}) {
  const Pt = g.fx?.particles;
  if (!Pt) return;
  track(g, life, (t) => {
    const c = P();
    if (!c) return false;
    const u = t / life, s = size[0] + (size[1] - size[0]) * Math.sqrt(u), a = (1 - u) * (1 - u);
    Pt.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, life: 0.03, size: s, size1: s, color: [...k3(col, k * a), 1], color1: [...k3(col, k * a), 0.6], frame: FRAME.glow });
    if (ring) { const d = ring(); Pt.spawn({ additive: true, vm: true, x: c.x, y: c.y, z: c.z, mode: 'flat', dir: [d.x, d.y, d.z], life: 0.03, size: s * 1.3, size1: s * 1.3, color: [...k3(COL.rim, k * a), 1], color1: [...k3(COL.rim, k * a), 0.6], frame: FRAME.thinRing }); }
  });
}
/** World arc from a to b (a one-shot crack). */
export function arc(g, a, b, { w = 0.05, life = 0.12, k = 1, levels = 4, jitter = 0.16, branches = 1 } = {}) {
  return g.fx?.bolt?.(a.clone(), b.clone(), { col: k3(COL.white, 0.62 * k), glow: k3(COL.violet, 0.42 * k), width: w, core: 0.24, levels, jitter, branches, regen: 0.04, life });
}
/** A short arc crawling over the street from p (it hugs the ground, ~len m). */
export function groundCrawl(g, p, len = 1, { k = 0.9, w = 0.05, life = 0.12 } = {}) {
  const a = R() * TAU, d = len * (0.6 + R() * 0.5);
  arc(g, _c.set(p.x, p.y + 0.06, p.z), _a.set(p.x + Math.cos(a) * d, p.y + 0.05, p.z + Math.sin(a) * d), { w, life, k, levels: 4, jitter: 0.14, branches: 1 });
}

// ------------------------------------------------------------------------------------------ 放電: live arcs
/**
 * The discharge: set([[from, to, weight, feet?], ...], dt) every frame. Each link is a jagged white bolt (re-jittered
 * every 50 ms) over a violet glow ribbon that leaves the electrode thin (never a blob over the crosshair) and fattens to
 * ~3x by the target; where it bites: a lasting white-violet corona, a spark fountain, forks crawling over the body and a
 * violet arc snaking over the street under the feet.
 */
export class Arcs {
  constructor(g) { this.g = g; this.bolts = []; this.glows = []; this.t = 0; this.em = 0; }
  set(links, dt) {
    const fx = this.g.fx, P = fx?.particles;
    this.t += dt;
    while (this.bolts.length > links.length) { this.bolts.pop()?.stop(); this.glows.pop()?.stop(); }
    // emitters run at a fixed 40 Hz (the same density at any frame rate)
    let emit = 0;
    for (this.em -= dt; this.em <= 0; this.em += 0.025) emit++;
    links.forEach(([from, to, w, feet], i) => {
      let b = this.bolts[i], gl = this.glows[i];
      if (!b) {
        b = fx?.bolt?.(from.clone(), to.clone(), { col: k3(COL.white, 0.7), glow: k3(COL.violet, 0.42), width: 0.14, core: 0.3, levels: 5, jitter: 0.1, branches: 2, regen: 0.05, life: Infinity });
        if (!b) return;
        this.bolts[i] = b;
      }
      if (!gl) gl = this.glows[i] = fx?.beam?.(from, to, { core: k3(COL.core, 0.22), glow: [0.9, 0.42, 2.6], wCore: 0.05, wGlow: 0.5, life: Infinity, shrink: 1, scroll: 5, wStart: 0.12, ramp: 3 });
      const pulse = 0.75 + 0.45 * Math.abs(Math.sin(this.t * 27 + i * 2.3)), L = from.distanceTo(to);
      b.width = (i === 0 ? 0.15 : 0.12) * w; b.branches = i === 0 ? 2 : 1;
      b.set(from, to);
      if (gl) { gl.wGlow = 0.5 * w * pulse; gl.ramp = Math.max(0.5, L * 0.9); gl.set(from, to); }
      if (!P || !emit) return;
      _f.subVectors(to, from).normalize(); _u.set(0, 1, 0).cross(_f).normalize(); _r.crossVectors(_f, _u);
      for (let e = 0; e < emit; e++) {
        // the bite: a corona that stays lit while held (overlapping short glows) + a hot core flicker
        P.spawn({ additive: true, x: to.x, y: to.y, z: to.z, life: 0.08, size: (0.5 + R() * 0.25) * w, size1: 0.8 * w, color: [...k3(COL.rim, 0.22 * pulse), 1], color1: [...k3(COL.violet, 0.05), 0], frame: FRAME.glow });
        if (R() < 0.5) P.spawn({ additive: true, x: to.x, y: to.y, z: to.z, life: 0.05, size: 0.18 * w, size1: 0.28 * w, color: [...k3(COL.white, 0.5), 1], color1: [...k3(COL.core, 0.1), 0], frame: FRAME.glow });
        // a spark fountain thrown up off the body (and back along the arc a little)
        for (let k = 0; k < 2; k++) {
          const a = R() * TAU, sp = 1.5 + R() * 2.5;
          _c.copy(_u).multiplyScalar(Math.cos(a) * sp).addScaledVector(_r, Math.sin(a) * sp).addScaledVector(_f, -0.8);
          P.spawn({ additive: true, x: to.x, y: to.y, z: to.z, vx: _c.x, vy: Math.abs(_c.y) + 2.5 + R() * 2.5, vz: _c.z, life: 0.16 + R() * 0.18, size: 0.014, color: [...k3(k ? COL.spark : COL.white, 0.7), 1], color1: [...k3(COL.deep, 0.3), 0], frame: FRAME.spark, stretch: 0.03, gravity: 9 });
        }
        // the street under it: a faint violet pool and a crawl now and then
        if (feet) {
          if (R() < 0.35) P.spawn({ additive: true, x: feet.x, y: feet.y + 0.05, z: feet.z, mode: 'flat', dir: [0, 1, 0], life: 0.12, size: 0.9 * w, size1: 1.2 * w, color: [...k3(COL.violet, 0.1), 1], color1: [...k3(COL.deep, 0.02), 0], frame: FRAME.glow });
          if (R() < 0.12) groundCrawl(this.g, feet, 0.7 * w, { w: 0.04, life: 0.09, k: 0.8 });
        }
      }
      // a fork crawling over the body
      if (R() < dt * 10) { _a.set(R() - 0.5, R() - 0.4, R() - 0.5).normalize().multiplyScalar(0.3 + R() * 0.35).add(to); arc(this.g, to, _a, { w: 0.035, life: 0.08, k: 0.85, levels: 3, jitter: 0.26, branches: 0 }); }
    });
  }
  stop() { for (const b of this.bolts) b?.stop(); for (const b of this.glows) b?.stop(); this.bolts.length = 0; this.glows.length = 0; }
}

/**
 * Nothing in reach: 3-4 short forks sprayed in a cone out of the electrode, a crackling corona on it, and now and
 * then a jump to the wall in front (when there is one within reach).
 */
export function freeArc(g, from, dir, { len = 1.8, wall = null, n = 3 + (R() < 0.5 ? 1 : 0) } = {}) {
  _u.set(0, 1, 0).cross(dir).normalize(); _r.crossVectors(dir, _u);
  for (let i = 0; i < n; i++) {
    const a = R() * TAU, s = Math.tan((8 + R() * 22) * Math.PI / 180), d = len * (0.45 + R() * 0.55);
    _a.copy(dir).addScaledVector(_u, Math.cos(a) * s).addScaledVector(_r, Math.sin(a) * s).normalize().multiplyScalar(d).add(from);
    arc(g, from, _a, { w: 0.04 + R() * 0.02, life: 0.05 + R() * 0.05, k: 0.8, levels: 4, jitter: 0.22, branches: R() < 0.4 ? 1 : 0 });
  }
  const P = g.fx?.particles;
  P?.spawn({ additive: true, x: from.x, y: from.y, z: from.z, life: 0.07, size: 0.16 + R() * 0.08, size1: 0.22, color: [...k3(COL.rim, 0.3), 1], color1: [...k3(COL.violet, 0.05), 0], frame: FRAME.glow });
  if (wall) {
    arc(g, from, wall, { w: 0.06, life: 0.09, k: 1, levels: 5, jitter: 0.12, branches: 2 });
    g.fx?.sparkBurst?.(wall.clone(), { color: k3(COL.white, 0.5), color1: k3(COL.violet, 0.4), count: 6, speed: 4, glow: 0.35 });
    P?.spawn({ additive: true, x: wall.x, y: wall.y, z: wall.z, life: 0.1, size: 0.35, size1: 0.5, color: [...k3(COL.white, 0.35), 1], color1: [...k3(COL.violet, 0.04), 0], frame: FRAME.glow });
  }
}

// ------------------------------------------------------------------------------------------ 雷爆
/**
 * The thunder burst at p (radius r): a white-violet core flash (r ~1.2 m, 0.08 s), an expanding ground shock ring and
 * a dust ring, a crown of bolts, 3-4 arcs crawling out over the street, sparks, rubble, a radial crack, scorch.
 */
export function burstFx(g, p, r = 3, { near = 1, seed } = {}) {
  const fx = g.fx;
  if (!fx) return;
  const P = fx.particles, floor = p.y;
  // the core: a white ball that blows out and is gone in a few frames, then a softer violet bloom
  P?.spawn({ additive: true, x: p.x, y: p.y + 0.9, z: p.z, life: 0.08, size: 2.4 * near, size1: 2.9 * near, color: [...k3(COL.white, 0.9), 1], color1: [...k3(COL.rim, 0.2), 0], frame: FRAME.glow });
  P?.spawn({ additive: true, x: p.x, y: p.y + 0.8, z: p.z, life: 0.2, size: 2.6 * near, size1: 4 * near, color: [...k3(COL.violet, 0.3), 1], color1: [...k3(COL.deep, 0.03), 0], frame: FRAME.glow });
  P?.spawn({ additive: true, x: p.x, y: p.y + 0.06, z: p.z, mode: 'flat', dir: [0, 1, 0], life: 0.26, size: r * 0.8, size1: r * 1.6, color: [...k3(COL.core, 0.35), 1], color1: [...k3(COL.deep, 0.02), 0], frame: FRAME.glow });
  fx.shockwave?.(_b.set(p.x, floor + 0.06, p.z), { normal: UP, r0: 0.2, r1: r * 1.25, life: 0.36, color: k3(COL.rim, 0.8), thin: true });
  fx.shockwave?.(_b.set(p.x, floor + 0.08, p.z), { normal: UP, r0: 0.1, r1: r * 0.75, life: 0.24, color: k3(COL.violet, 0.6), thin: false });
  fx.zfx?.ground?.add?.('shock', _b.set(p.x, floor + 0.04, p.z), { r: 0.4, r1: r * 1.4, life: 0.5, col: k3(COL.violet, 0.45), alpha: 0 });
  // the crown: bolts thrown off the centre to the rim and up
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * TAU + R() * 0.5, d = r * (0.6 + R() * 0.5);
    _a.set(p.x + Math.cos(a) * d, floor + 0.1 + R() * 1.6, p.z + Math.sin(a) * d);
    arc(g, _c.set(p.x, floor + 0.9, p.z), _a, { w: 0.08, life: 0.12 + R() * 0.08, k: 1, levels: 4, jitter: 0.14, branches: 1 });
  }
  arc(g, _c.set(p.x, floor + 0.05, p.z), _a.set(p.x + (R() - 0.5), floor + 4 + R() * 2, p.z + (R() - 0.5)), { w: 0.12, life: 0.14, k: 1.1, levels: 5, jitter: 0.1, branches: 2 });
  // arcs crawling out over the street for a moment after
  for (let i = 0; i < 4; i++) after(g, 0.03 + i * 0.06, () => groundCrawl(g, _c.set(p.x + (R() - 0.5) * r * 0.5, floor, p.z + (R() - 0.5) * r * 0.5), r * 0.55, { w: 0.06, life: 0.14, k: 1 }));
  fx.sparkBurst?.(_b.set(p.x, floor + 0.7, p.z), { color: k3(COL.white, 0.7), color1: k3(COL.spark, 0.5), count: 30, speed: 10, glow: 0.9 });
  fx.lights?.flash?.(_b.set(p.x, floor + 1.5, p.z), 0xc9b8ff, lowQ(g) ? 35 : 55, r * 3.2, 0.2);
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + R() * 0.3; fx.knockDust?.(_b.set(p.x + Math.cos(a) * r * 0.4, floor, p.z + Math.sin(a) * r * 0.4), _c.set(Math.cos(a) * 6.5, 0, Math.sin(a) * 6.5), 1.1); }
  rubble(g, _b.set(p.x, floor, p.z), 14, 7);
  fx.zfx?.ground?.add?.('crack', _b.set(p.x, floor + 0.03, p.z), { r: r * 0.45, life: 0.8, col: k3(COL.core, 0.8), alpha: 0, fadeIn: 0.01, fadeOut: 0.7, seed });
  fx.zfx?.ground?.add?.('crack', _b.set(p.x, floor + 0.02, p.z), { r: r * 0.42, life: 4, col: [0.04, 0.035, 0.045], alpha: 0.75, fadeIn: 0.05, fadeOut: 1.5, seed });
  fx.decals?.add(_b.set(p.x, floor, p.z), UP, { frame: DECAL.scorch, size: r * 0.6, tint: DECAL_TINT.scorch, life: 7 });
}
/** realistic flecks of broken paving / grit */
export function rubble(g, p, n, speed) {
  const P = g.fx?.particles;
  if (!P) return;
  for (let i = 0; i < n; i++) {
    const a = R() * TAU, s = speed * (0.4 + R() * 0.6);
    P.spawn({ x: p.x, y: p.y + 0.1, z: p.z, vx: Math.cos(a) * s * 0.5, vy: s * (0.6 + R() * 0.6), vz: Math.sin(a) * s * 0.5, life: 0.9 + R() * 0.6, size: 0.04 + R() * 0.06, color: [0.32, 0.3, 0.28, 1], color1: [0.3, 0.28, 0.26, 1], frame: FRAME.rock, gravity: 14, spin: (R() - 0.5) * 18, collide: true, bounce: 0.25, lit: true });
  }
}

// ------------------------------------------------------------------------------------------ 驚蟄 storm
let _noise = null;
const noiseTex = () => (_noise ||= noiseTexture());
const CLOUD_VERT = /* glsl */`
varying vec2 vUv;
varying float vFacing;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  // how squarely the surface faces the eye (the funnel's sides fade out at its silhouette: no hard cone outline)
  vFacing = abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
}`;
// a ring of billows wound into a slow vortex round an open eye (the bolt's way down), lit violet from inside on flashes
const CLOUD_FRAG = /* glsl */`
uniform float uTime, uA, uFlash, uSpin, uEye;
uniform vec2 uAt;
uniform vec3 uLit;
${GLSL_NOISE}
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float sw = atan(p.y, p.x) + uTime * uSpin * (0.3 + 1.6 * (1.0 - r)) + r * 2.2;
  vec2 q = vec2(cos(sw), sin(sw)) * r;
  float n = fbm2(q * 0.8 + 0.43), n2 = fbm2(q * 2.3 + vec2(uTime * 0.04, 0.29)), n3 = fbm2(q * 5.1 + 0.71);
  // spiral arms: the billows stream inward in bands
  float arms = 0.5 + 0.5 * sin(atan(p.y, p.x) * 3.0 - r * 9.0 + uTime * uSpin * 2.0);
  float dens = smoothstep(0.26, 0.72, n * 0.6 + n2 * 0.4 + n3 * 0.14 + arms * 0.2);
  float eye = smoothstep(uEye, uEye + 0.22, r + (n2 - 0.5) * 0.18);
  float edge = 1.0 - smoothstep(0.55, 1.0, r + (n2 - 0.5) * 0.45);
  float a = clamp(dens * 0.95 + 0.1, 0.0, 1.0) * edge * eye * uA;
  // billow relief: lighter crowns, dark undersides (seen from below the shading reads as volume, not a flat decal)
  vec3 col = mix(vec3(0.025, 0.022, 0.04), vec3(0.15, 0.135, 0.19), smoothstep(0.3, 0.8, n2 * 0.7 + n3 * 0.5));
  float fl = uFlash * exp(-dot(p - uAt, p - uAt) * 2.2);
  col += uLit * (fl * (0.4 + 1.8 * n2 * n3 * 2.0) + uFlash * 0.08 * n);
  // the eye's rim glows as the charge builds (a thin band: the rest of the cloud stays storm grey between flashes)
  col += uLit * 0.22 * uA * smoothstep(uEye + 0.16, uEye, r) * eye * (0.5 + 0.5 * sin(uTime * 23.0 + n * 12.0));
  gl_FragColor = vec4(col * a, a);
}`;
// the funnel hanging out of the eye: wrapped noise streaming down and round, thin at the top and the tip
const FUNNEL_FRAG = /* glsl */`
uniform float uTime, uA, uFlash;
uniform vec3 uLit;
${GLSL_NOISE}
varying vec2 vUv;
varying float vFacing;
void main() {
  float y = vUv.y;
  vec2 q = vec2(vUv.x * 3.0 + uTime * 0.09 + y * 0.35, y * 0.9 - uTime * 0.06);
  float n = fbm2(q), n2 = fbm2(q * 2.7 + 0.31);
  float dens = smoothstep(0.32, 0.72, n * 0.7 + n2 * 0.42);
  float a = dens * smoothstep(0.0, 0.45, y) * (1.0 - smoothstep(0.8, 1.0, y)) * smoothstep(0.05, 0.6, vFacing) * uA * 0.85;
  vec3 col = mix(vec3(0.035, 0.032, 0.045), vec3(0.14, 0.135, 0.16), n2);
  col += uLit * (uFlash * (0.4 + 1.2 * n2) + 0.08 * uA * smoothstep(0.4, 0.0, y) * (0.5 + 0.5 * sin(uTime * 19.0 + n * 9.0)));
  gl_FragColor = vec4(col * a, a);
}`;
const blendPM = { transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor };
function cloudMaterial(spin) {
  return new THREE.ShaderMaterial({
    vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG, ...blendPM,
    uniforms: { tNoise: { value: noiseTex() }, uTime: { value: R() * 50 }, uA: { value: 0 }, uFlash: { value: 0 }, uSpin: { value: spin }, uEye: { value: 0.18 }, uAt: { value: new THREE.Vector2() }, uLit: { value: new THREE.Vector3(...k3(COL.violet, 0.22)) } },
  });
}
function funnelMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: CLOUD_VERT, fragmentShader: FUNNEL_FRAG, ...blendPM,
    uniforms: { tNoise: { value: noiseTex() }, uTime: { value: R() * 50 }, uA: { value: 0 }, uFlash: { value: 0 }, uLit: { value: new THREE.Vector3(...k3(COL.violet, 0.2)) } },
  });
}
// (the radius is a uniform: one program for every storm size)
const SHADE_FRAG = 'uniform float uA, uR; varying vec2 vP; void main() { float d = length(vP) / uR; gl_FragColor = vec4(0.02, 0.015, 0.03, uA * 0.5 * (1.0 - smoothstep(0.35, 1.0, d))); }';
/** Cloud height over the strike for a viewer at eye: inside the vertical field of view when aiming at the street under
 *  it, higher over far throws, and lifted again over a point-blank one (4.5 m overhead read as a purple ceiling). */
export function stormHeight(eye, c) {
  const d = Math.hypot(c.x - eye.x, c.z - eye.z);
  return THREE.MathUtils.clamp(eye.y - c.y + Math.max(d * 0.33, 6.5 - d * 0.4), 4.5, 9.5);
}
/**
 * The storm over c (height h, radius r): three stacked counter-rotating vortex discs with an open eye, a funnel lowering
 * out of the eye, lit billow cards round the rim, cloud-to-cloud flickers and internal flashes that quicken as the
 * strike nears (charge 0..1 by `set`), flash() lights it from inside. lite: fewer layers (medium / low quality).
 */
export function cloudRing(g, c, { h = 6, r = 10, life = 4, lite = false } = {}) {
  const P = g.fx?.particles, fx = g.fx, discs = [];
  const layers = lite ? [[0, r, 0.45], [-0.9, r * 0.62, -0.7]] : [[0.5, r * 1.05, 0.35], [0, r * 0.82, -0.55], [-0.7, r * 0.55, 0.8]];
  for (const [dy, rr, spin] of layers) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(rr, 64).rotateX(Math.PI / 2), cloudMaterial(spin));
    m.position.set(c.x, c.y + h + dy, c.z); m.renderOrder = 19; m.frustumCulled = false;
    g.scene?.add(m); discs.push(m);
  }
  // the funnel: from the lowest disc's eye down towards the crown (it never touches: the bolt is what reaches down)
  const fh = h * 0.42;
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.2, r * 0.05, fh, 40, 6, true), funnelMaterial());
  funnel.position.set(c.x, c.y + h - 0.9 - fh / 2, c.z); funnel.renderOrder = 19; funnel.frustumCulled = false; funnel.scale.y = 0.01;
  g.scene?.add(funnel);
  // its shadow on the street: the light under a thunderhead drops before the strike (the cloud itself is overhead)
  const shade = new THREE.Mesh(new THREE.CircleGeometry(r * 1.05, 48).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, uniforms: { uA: { value: 0 }, uR: { value: r * 1.05 } },
    vertexShader: 'varying vec2 vP; void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: SHADE_FRAG,
  }));
  const fy = g.world?.collision?.floorBelow?.(_a.set(c.x, c.y + 0.5, c.z), 0.2, 30);
  shade.position.set(c.x, (Number.isFinite(fy) ? fy : c.y) + 0.035, c.z); shade.renderOrder = 5; shade.frustumCulled = false;
  g.scene?.add(shade);
  // lit billow cards: the outer wall and a lower skirt drifting round (the cloud's volume from the side)
  const nPuff = lite ? 10 : 18;
  if (P) for (let i = 0; i < nPuff; i++) {
    const a = i / nPuff * TAU + R() * 0.3, low = i % 3 === 0, rr = r * (low ? 0.45 + R() * 0.2 : 0.7 + R() * 0.3), sp = 0.8 + R() * 0.6;
    P.spawn({ x: c.x + Math.cos(a) * rr, y: c.y + h - (low ? 1.2 : 0.3) + (R() - 0.5) * 0.6, z: c.z + Math.sin(a) * rr, vx: -Math.sin(a) * sp, vz: Math.cos(a) * sp, vy: -0.05, life: life * (0.8 + R() * 0.2), delay: R() * 0.3, fadeIn: 0.5,
      size: (low ? 3.5 : 5) + R() * 3, size1: (low ? 5 : 7) + R() * 3, color: [0.07, 0.062, 0.09, 0.55], color1: [0.08, 0.075, 0.1, 0], colorPow: 3, frame: FRAME.puff + (i % 4), lit: true, drag: 0.4, rot: R() * 6 });
  }
  let t = 0, arcT = 0.4, inT = 0.3, dead = false, charge = 0;
  const flash = (k = 1, at = null) => {
    const ux = at ? (at.x - c.x) / r : (R() - 0.5) * 1.2, uz = at ? (at.z - c.z) / r : (R() - 0.5) * 1.2;
    for (const m of discs) { const U = m.material.uniforms; U.uFlash.value = Math.max(U.uFlash.value, k); U.uAt.value.set(ux, uz); }
    funnel.material.uniforms.uFlash.value = Math.max(funnel.material.uniforms.uFlash.value, k * 0.8);
    const p = _a.set(c.x + ux * r, c.y + h - 0.7, c.z + uz * r);
    P?.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.12, size: 4.5 * k, size1: 7 * k, color: [...k3(COL.rim, 0.28 * k), 1], color1: [...k3(COL.deep, 0.05), 0], frame: FRAME.glow });
    if (k >= 0.4) fx?.lights?.flash?.(p, 0xb9a6ff, 30 * k, r * 3, 0.14);
  };
  const sys = {
    update(dt) {
      t += dt;
      const a = Math.min(1, t / 0.6) * Math.min(1, Math.max(0, (life - t) / 0.9));
      for (const m of discs) { const U = m.material.uniforms; U.uTime.value += dt * (1 + charge * 1.5); U.uA.value = a * 0.95; U.uFlash.value = Math.max(0, U.uFlash.value - dt * 10); U.uEye.value = 0.18 - 0.1 * charge; }
      const F = funnel.material.uniforms;
      F.uTime.value += dt * (1 + charge * 2); F.uA.value = a * Math.min(1, charge * 1.6); F.uFlash.value = Math.max(0, F.uFlash.value - dt * 7);
      funnel.scale.y = Math.max(0.01, Math.min(1, charge * 1.3)); funnel.position.y = c.y + h - 0.9 - fh * funnel.scale.y / 2;
      shade.material.uniforms.uA.value = a * (0.4 + 0.6 * charge) * (1 - Math.min(1, discs[0].material.uniforms.uFlash.value));
      // cloud-to-cloud strokes
      if ((arcT -= dt * (1 + charge * 1.4)) <= 0 && t < life - 0.8) {
        arcT = 0.42 + R() * 0.38;
        const a0 = R() * TAU, a1 = a0 + 0.8 + R() * 1.5, r0 = r * (0.3 + R() * 0.55), r1 = r * (0.3 + R() * 0.55), y = c.y + h - 0.6;
        const p0 = new THREE.Vector3(c.x + Math.cos(a0) * r0, y, c.z + Math.sin(a0) * r0), p1 = new THREE.Vector3(c.x + Math.cos(a1) * r1, y - R() * 0.8, c.z + Math.sin(a1) * r1);
        fx?.bolt?.(p0, p1, { col: k3(COL.white, 0.7), glow: k3(COL.violet, 0.5), width: 0.28, core: 0.24, levels: 5, jitter: 0.12, branches: 2, regen: 0.05, life: 0.16 });
        flash(0.45, p0.lerp(p1, 0.5));
      }
      // internal flashes: the cloud lit from inside, quicker and brighter as the strike nears
      if ((inT -= dt) <= 0 && t < life - 0.8) { inT = 0.42 - 0.22 * charge + R() * 0.2; flash(0.18 + 0.4 * charge * R()); }
      if (t >= life) sys.stop();
    },
    set(k) { charge = k; },
    stop() {
      if (dead) return;
      dead = true;
      for (const m of [...discs, funnel, shade]) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); }
      const i = g.systems?.indexOf(sys);
      if (i >= 0) g.systems.splice(i, 1);
    },
  };
  g.systems?.push(sys);
  return { flash, set: sys.set, stop: sys.stop, h, get alive() { return !dead; } };
}

// ------------------------------------------------------------------------------------------ 驚蟄 giant strike
/** how much of a vertical column from a to b crosses the middle of the screen (0 away from it .. 1 dead centre) */
export function centreOf(cam, a, b) {
  const pa = _a.copy(a).project(cam), pb = _b.copy(b).project(cam);
  if (pa.z > 1 && pb.z > 1) return 0;
  const t = Math.abs(pb.y - pa.y) > 1e-4 ? THREE.MathUtils.clamp(-pa.y / (pb.y - pa.y), 0, 1) : 0.5;
  const x = pa.x + (pb.x - pa.x) * t, y = pa.y + (pb.y - pa.y) * t;
  return (1 - THREE.MathUtils.smoothstep(Math.abs(x), 0.12, 0.32)) * (1 - THREE.MathUtils.smoothstep(Math.abs(y), 0.3, 0.6));
}
/**
 * The strike onto p from the storm at height h. Lightning first: the jagged 0.6 m bolt with branches and a white core
 * re-strikes its ionised channel 4 times in 0.25 s (side leaders fork off it); a soft flash column that collapses inward
 * in 0.12 s (never a standing pillar; capped where it crosses the middle of the screen); then what is left on the
 * street: a 6 m ring, a glow ring that cools for 1.5 s, ionised smoke, arcs crawling over the ground for a second, a
 * rolling dust ring, rubble, a deep radial crack cooling into a scorch, cold violet light pulses.
 * near: 0..1 (how close the viewer stands); centre: centreOf() for the column; lite: medium / low quality.
 */
export function giantStrike(g, p, { h = 8, r = 6, near = 1, seed, centre = 0, lite = false } = {}) {
  const fx = g.fx;
  if (!fx) return;
  const cap = 1 - 0.5 * centre, low = lowQ(g);
  const top = new THREE.Vector3(p.x + (R() - 0.5) * 1.2, p.y + h, p.z + (R() - 0.5) * 1.2), foot = p.clone().add(_b.set(0, 0.05, 0));
  const P = fx.particles;
  // the strokes: the first is the fattest and longest, the re-strikes follow the same channel (new jitter each time)
  [0, 0.065, 0.14, 0.22].forEach((t0, i) => after(g, t0, () => {
    const k = (i ? 0.8 - i * 0.08 : 1) * cap * near;
    fx.bolt?.(top, foot, { col: k3(COL.white, 1.15 * k), glow: k3(COL.violet, 0.7 * k), width: i ? 0.5 : 0.62, core: 0.32, levels: 7, jitter: 0.055, branches: i ? 3 : 5, regen: 0.025, life: i ? 0.05 : 0.08 });
    // a side leader forking off to the street
    const s = top.clone().lerp(foot, 0.25 + R() * 0.35);
    fx.bolt?.(s, p.clone().add(_b.set((R() - 0.5) * 3, 0.05, (R() - 0.5) * 3)), { col: k3(COL.white, 0.65 * k), glow: k3(COL.deep, 0.6 * k), width: 0.22, core: 0.22, levels: 5, jitter: 0.1, branches: 1, regen: 0.04, life: 0.06 });
    // each stroke flashes the street and the light
    P?.spawn({ additive: true, x: p.x, y: p.y + 0.08, z: p.z, mode: 'flat', dir: [0, 1, 0], life: 0.1, size: r * (i ? 0.7 : 0.95), size1: r * 1.2, color: [...k3(COL.white, (i ? 0.25 : 0.4) * cap), 1], color1: [...k3(COL.violet, 0.03), 0], frame: FRAME.glow });
    // (a point light this close turns the bodies in the ring into white cut-outs: kept low, violet)
    fx.lights?.flash?.(_b.set(p.x, p.y + 4, p.z), 0xb7a3ff, (low ? 12 : 22) * (i ? 0.55 : 1), 20, 0.09);
  }));
  // the flash column: soft edged, wide, collapsing inward in 0.12 s
  fx.beam?.(top, foot, { core: k3(COL.white, 0.32 * cap * near), glow: k3(COL.violet, 0.22 * cap * near), wCore: 0.3, wGlow: 2.0, life: 0.12, shrink: 0.04 });
  P?.spawn({ additive: true, x: p.x, y: p.y + 1.4, z: p.z, life: 0.08, size: 3.2 * near, size1: 4 * near, color: [...k3(COL.white, 0.22 * near * cap), 1], color1: [...k3(COL.violet, 0.03), 0], frame: FRAME.glow });
  fx.shockwave?.(_b.set(p.x, p.y + 0.06, p.z), { normal: UP, r0: 0.4, r1: r * 1.05, life: 0.45, color: k3(COL.rim, 0.8), thin: true });
  fx.shockwave?.(_b.set(p.x, p.y + 0.1, p.z), { normal: UP, r0: 0.2, r1: r * 0.55, life: 0.3, color: k3(COL.violet, 0.7), thin: false });
  // what stays: a glow ring cooling on the street, the core pool
  fx.zfx?.ground?.add?.('glow', _b.set(p.x, p.y + 0.04, p.z), { r: r * 0.42, life: 1.6, col: k3(COL.violet, 0.5), alpha: 0, fadeIn: 0.02, fadeOut: 1.3 });
  fx.zfx?.ground?.add?.('shock', _b.set(p.x, p.y + 0.05, p.z), { r: r * 0.9, r1: r, life: 1.2, col: k3(COL.rim, 0.35), alpha: 0, fadeIn: 0.02, fadeOut: 1.0 });
  fx.sparkBurst?.(p.clone().add(_b.set(0, 0.3, 0)), { color: k3(COL.white, 0.7), color1: k3(COL.spark, 0.5), count: lite ? 28 : 44, speed: 13, glow: 1.0, normal: UP });
  // a rolling dust ring (kept short of the thrower at 12 m: a full second of dust wall hid the street after the strike)
  for (let i = 0; i < (lite ? 8 : 11); i++) { const a = i / (lite ? 8 : 11) * TAU + R() * 0.2; fx.knockDust?.(_b.set(p.x + Math.cos(a) * 1.4, p.y, p.z + Math.sin(a) * 1.4), _c.set(Math.cos(a) * 6.5, 0, Math.sin(a) * 6.5), 0.9); }
  rubble(g, p, lite ? 14 : 22, 9);
  // arcs crawling out over the ground: a burst at the strike, then fewer and shorter for a second
  for (let i = 0; i < (lite ? 5 : 8); i++) { const a = i / 8 * TAU + R() * 0.4, d = r * (0.5 + R() * 0.45); arc(g, _c.set(p.x, p.y + 0.1, p.z), _a.set(p.x + Math.cos(a) * d, p.y + 0.08, p.z + Math.sin(a) * d), { w: 0.08, life: 0.18 + R() * 0.12, k: 0.9, levels: 5, jitter: 0.12, branches: 1 }); }
  let crawl = 0;
  track(g, 1.1, (t, dt) => {
    if ((crawl -= dt) > 0) return;
    crawl = 0.05 + t * 0.12;
    const a = R() * TAU, d = R() * r * 0.7;
    groundCrawl(g, _c.set(p.x + Math.cos(a) * d, p.y, p.z + Math.sin(a) * d), 1.4 * (1 - t * 0.6), { w: 0.05, life: 0.1, k: 0.85 });
  });
  fx.zfx?.ground?.add?.('crack', _b.set(p.x, p.y + 0.03, p.z), { r: r * 0.55, life: 1.4, col: k3(COL.core, 1.0), alpha: 0, fadeIn: 0.01, fadeOut: 1.2, seed });
  fx.zfx?.ground?.add?.('crack', _b.set(p.x, p.y + 0.02, p.z), { r: r * 0.5, life: 7, col: [0.035, 0.03, 0.04], alpha: 0.85, fadeIn: 0.05, fadeOut: 2.5, seed });
  fx.zfx?.quake?.(p, r * 0.6, { col: k3(COL.violet, 0.35), scale: 1.1, crack: false });
  fx.decals?.add(p, UP, { frame: DECAL.scorch, size: r * 0.75, tint: DECAL_TINT.scorch, life: 10 });
  // ionised smoke off the scorched ring: grey, lit, with a violet glow breathing inside it for the first second
  for (let i = 0; i < (lite ? 5 : 8) && P; i++) {
    const a = R() * TAU, d = R() * r * 0.45, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d, dl = 0.1 + R() * 0.3;
    P.spawn({ x, y: p.y + 0.3, z, vy: 0.8 + R() * 0.6, vx: Math.cos(a) * 0.4, vz: Math.sin(a) * 0.4, life: 2 + R(), delay: dl, size: 1.2, size1: 3.2, color: [0.15, 0.14, 0.17, 0.5], color1: [0.17, 0.16, 0.18, 0], frame: FRAME.puff + (i % 4), lit: true, drag: 1.2 });
    if (i % 2) P.spawn({ additive: true, x, y: p.y + 0.6, z, vy: 0.8, life: 0.7, delay: dl, size: 0.7, size1: 1.4, color: [...k3(COL.violet, 0.025), 1], color1: [...k3(COL.deep, 0.005), 0], frame: FRAME.glow, drag: 1.2 });
  }
  // ozone motes climbing where the column stood
  for (let i = 0; i < (lite ? 8 : 16) && P; i++) { const a = R() * TAU, d = R() * 1.1; P.spawn({ additive: true, x: p.x + Math.cos(a) * d, y: p.y + R() * 1.5, z: p.z + Math.sin(a) * d, vy: 2 + R() * 3, life: 0.6 + R() * 0.6, delay: R() * 0.3, size: 0.05 + R() * 0.05, color: [...k3(COL.rim, 0.5), 1], color1: [...k3(COL.violet, 0.2), 0], frame: FRAME.glint, drag: 0.5 }); }
}

// ------------------------------------------------------------------------------------------ the javelin
/** Two ribbons behind the flying halberd: a violet sheath and a white core line. */
export function javelinTrails(g) {
  const fx = g.fx;
  return [fx?.trail?.({ width: 0.16, life: 0.3, color: [...k3(COL.violet, 0.5), 1], color1: [...k3(COL.deep, 0.2), 0], taper: 0.2, segs: 40, profile: 'soft' }),
    fx?.trail?.({ width: 0.03, life: 0.16, color: [...k3(COL.white, 0.8), 1], color1: [...k3(COL.core, 0.3), 0], taper: 0.2, segs: 24, profile: 'beam' })];
}

// ------------------------------------------------------------------------------------------ 雷樁 lightning rod
let _rodProto = null;
export const ROD_TIP = 2.9;
/** A hazard-striped steel mast (≈2.9 m: it reads at 15 m) on a bolted ground plate with gussets, a porcelain insulator
 *  stack, a copper crown of three prongs round a chrome ball over a glowing corona ring, violet beacon bands; real
 *  materials (hard-surface keys), ≈ 3k triangles. ROD_TIP = the ball. */
export function rodMesh() {
  if (!_rodProto) {
    const grp = new THREE.Group();
    const add = (geo, mat) => { const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial()); m.userData.mat = mat; m.name = 'rod:' + mat; grp.add(m); return m; };
    const lathe = (pts, seg = 20) => new THREE.LatheGeometry(pts.map(([y, r]) => new THREE.Vector2(r, y)), seg);
    add(lathe([[0, 0.24], [0.016, 0.24], [0.028, 0.21], [0.04, 0.07], [0.04, 0]], 28), 'steel_dark');
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + 0.4; add(new THREE.CylinderGeometry(0.016, 0.016, 0.02, 6).translate(Math.cos(a) * 0.18, 0.036, Math.sin(a) * 0.18), 'steel'); }
    // three gussets bracing the mast on the plate
    for (let k = 0; k < 3; k++) { const a = k / 3 * TAU; add(new THREE.BoxGeometry(0.012, 0.2, 0.12).translate(0, 0.13, 0.08).rotateY(a), 'steel_dark'); }
    // striped mast: alternating yellow / black bands, a spike buried below
    for (let k = 0; k < 16; k++) add(new THREE.CylinderGeometry(0.034, 0.034, 0.14, 16).translate(0, 0.11 + k * 0.14, 0), k % 2 ? 'rubber' : 'paint_yellow');
    add(new THREE.ConeGeometry(0.034, 0.4, 10).rotateX(Math.PI).translate(0, -0.2, 0), 'steel_dark');
    // violet beacon bands (the rod is found in a fight by them)
    for (const y of [0.9, 1.6]) add(new THREE.TorusGeometry(0.04, 0.007, 6, 28).rotateX(Math.PI / 2).translate(0, y, 0), 'glow_arc');
    // porcelain insulator stack: five skirts with drip lips
    const sk = [];
    for (let k = 0; k < 5; k++) { const y = 2.28 + k * 0.06; sk.push([y, 0.045], [y + 0.012, 0.1], [y + 0.022, 0.104], [y + 0.03, 0.05]); }
    add(lathe([[2.24, 0.04], ...sk, [2.6, 0.04]], 32), 'porcelain');
    add(lathe([[2.18, 0.036], [2.18, 0.046], [2.24, 0.048], [2.24, 0.036]], 18), 'copper');
    add(lathe([[2.6, 0.036], [2.6, 0.042], [2.68, 0.042], [2.72, 0.022], [2.72, 0.0]], 18), 'copper');
    // the crown: three copper prongs round a chrome ball over a glowing corona ring
    for (let k = 0; k < 3; k++) {
      const a = k / 3 * TAU, cv = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 2.7, 0), new THREE.Vector3(Math.cos(a) * 0.08, 2.8, Math.sin(a) * 0.08), new THREE.Vector3(Math.cos(a) * 0.11, 2.98, Math.sin(a) * 0.11)]);
      add(new THREE.TubeGeometry(cv, 12, 0.009, 7), 'copper');
      add(new THREE.ConeGeometry(0.012, 0.045, 7).translate(Math.cos(a) * 0.11, 3.01, Math.sin(a) * 0.11), 'copper');
    }
    add(new THREE.CylinderGeometry(0.014, 0.018, 0.18, 10).translate(0, 2.8, 0), 'copper');
    add(new THREE.SphereGeometry(0.055, 20, 14).translate(0, ROD_TIP, 0), 'chrome');
    add(new THREE.TorusGeometry(0.1, 0.01, 8, 32).rotateX(Math.PI / 2).translate(0, 2.76, 0), 'glow_arc');
    add(new THREE.TorusGeometry(0.075, 0.008, 8, 32).rotateX(Math.PI / 2).translate(0, 2.84, 0), 'glow_arc');
    for (const m of grp.children) { m.geometry = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry; m.geometry.computeVertexNormals(); }
    applyHardSurface(grp, { world: true });
    _rodProto = grp;
  }
  const o = _rodProto.clone();
  o.userData.tipY = ROD_TIP;
  return o;
}

// ------------------------------------------------------------------------------------------ KE_CHAR
/** Kill: the body chars black under a flickering violet rim, fine arcs crawl over it for 0.5 s, a wisp of smoke. */
export function charKill(g, z, p, { big = false } = {}) {
  const fx = g.fx;
  if (!fx) return;
  fx.zfx?.status?.(z, 'charkill', big ? 1.4 : 1.1);
  fx.particles?.spawn({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.1, size: 0.6, size1: 1.0, color: [...k3(COL.white, 0.35), 1], color1: [...k3(COL.violet, 0.05), 0], frame: FRAME.glow });
  let n = big ? 9 : 6, t = 0;
  const sys = {
    update(dt) {
      t += dt;
      if (n > 0 && (t * 12 | 0) > (big ? 9 : 6) - n) {
        n--;
        const c = z.center ? z.center(_c) : p;
        _a.set(c.x + (R() - 0.5) * 0.6, c.y + (R() - 0.45) * 1.0, c.z + (R() - 0.5) * 0.6);
        arc(g, c, _a, { w: 0.03, life: 0.07 + R() * 0.05, k: 0.75, levels: 3, jitter: 0.28, branches: 0 });
      }
      if (t > 0.55) { const i = g.systems.indexOf(sys); if (i >= 0) g.systems.splice(i, 1); }
    },
  };
  g.systems?.push(sys);
  const fy = z.pos?.y ?? p.y - 1;
  fx.decals?.add(_b.set(z.pos?.x ?? p.x, fy, z.pos?.z ?? p.z), UP, { frame: DECAL.scorch, size: big ? 1.1 : 0.7, tint: DECAL_TINT.scorch, life: 6 });
  for (let i = 0; i < 3; i++) fx.particles?.spawn({ x: p.x + (R() - 0.5) * 0.3, y: p.y + 0.2, z: p.z + (R() - 0.5) * 0.3, vy: 0.5 + R() * 0.4, life: 1.3 + R() * 0.6, delay: 0.25 + i * 0.12, size: 0.16, size1: 0.6, color: [0.1, 0.1, 0.11, 0.5], color1: [0.14, 0.14, 0.15, 0], frame: FRAME.puff + i, lit: true, drag: 1.5 });
}

// ------------------------------------------------------------------------------------------ warm-up
/** The storm's custom materials (discs, funnel, shade) on throwaway meshes, for the equip-time compile. */
export function warmMeshes() {
  const geo = new THREE.PlaneGeometry(0.01, 0.01);
  const shade = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, uniforms: { uA: { value: 0 }, uR: { value: 1 } },
    vertexShader: 'varying vec2 vP; void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: SHADE_FRAG });
  return [cloudMaterial(0.4), funnelMaterial(), shade].map((m) => new THREE.Mesh(geo, m));
}
