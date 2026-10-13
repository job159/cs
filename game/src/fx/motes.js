// MOTE falling sprites + TRAIL_DROP (PREMIUM_WEAPONS §1.7.5, §1.17; 05d §7.2): feathers, petals, red paper,
// gold paper (金紙), porcelain shards, ink drops, glowing feathers, embers and frost crystals — the "theme
// particles" spirits break into on exit (§1.7.3 ⑤) and premium tracers / blades shed along their path.
//
// Real 3D tumbling quads (not billboards): each mote spins about its own axis, sways like a falling leaf,
// drifts with the wind, lands (paper / feathers lie flat, shards bounce, ink drops leave a stain decal) and
// shrinks away. Two draw calls: a lit alpha-tested layer (alpha-to-coverage with MSAA) and an emissive additive
// one. Atlas: procedural 8x8 cells (1024², 512² on low / medium) — R shade, G secondary colour mask
// (rachis, gold foil, white porcelain body), B highlight, A coverage.
//   fx.motes.burst('shard', pos, 10, { palette: [[0.1,0.3,0.7], [0.1,0.55,0.3]], speed: 4 })
//   fx.motes.trailDrop(from, to, 'feather', { owner: 'bifang', color: [3, 0.8, 0.2], emit: 1 })
import * as THREE from 'three';
import { rng, hdr } from './kitutil.js';
import { DECAL_TINT } from './decals.js';
import { DECAL } from './atlas.js';

const CELL = { feather: 0, feather2: 1, petal: 2, petal2: 3, paper: 4, goldpaper: 5, strip: 6, shard: 7, shard2: 8, shard3: 9, ink: 10, splat: 11, dot: 12, glow: 13, ember: 14, frost: 15 };

// per kind: cells, quad aspect (w/h), size range (m, height), terminal fall speed (m/s, 0 = ballistic),
// gravity for ballistic, sway amplitude (m) and rate (Hz), spin (rad/s), life, colours, emissive, landing
export const MOTE = {
  feather:   { cells: [0, 1], aspect: 0.32, size: [0.11, 0.17], fall: 0.45, sway: [0.18, 0.4], hz: [0.45, 0.8], spin: [0.4, 1.4], life: [2.6, 3.6], color: [0.92, 0.92, 0.9], color2: [0.75, 0.72, 0.66], land: 'flat' },
  petal:     { cells: [2, 3], aspect: 0.7, size: [0.045, 0.07], fall: 0.75, sway: [0.08, 0.2], hz: [0.9, 1.5], spin: [2, 5], life: [2, 3], color: [0.8, 0.12, 0.22], color2: [0.95, 0.8, 0.7], land: 'flat' },
  paper:     { cells: [4, 6], aspect: 0.62, size: [0.07, 0.11], fall: 1.0, sway: [0.06, 0.16], hz: [1.2, 2.2], spin: [4, 9], life: [2, 3], color: [0.55, 0.04, 0.03], color2: [0.75, 0.55, 0.2], land: 'flat' },
  goldpaper: { cells: [5], aspect: 1, size: [0.07, 0.1], fall: 0.9, sway: [0.06, 0.14], hz: [1, 1.8], spin: [3, 7], life: [2.2, 3.2], color: [0.72, 0.6, 0.38], color2: [1.25, 0.9, 0.32], land: 'flat' },
  shard:     { cells: [7, 8, 9], aspect: 1, size: [0.035, 0.075], fall: 0, gravity: 9.8, spin: [8, 18], life: [1.4, 2.2], color: [0.12, 0.3, 0.75], color2: [0.93, 0.91, 0.86], land: 'bounce' },
  ink:       { cells: [10, 12], aspect: 1, size: [0.018, 0.035], fall: 0, gravity: 9.8, spin: [0, 1], life: [1.2, 1.8], color: [0.03, 0.03, 0.035], color2: [0.03, 0.03, 0.035], land: 'stain' },
  splat:     { cells: [11], aspect: 1, size: [0.05, 0.09], fall: 0.6, sway: [0.03, 0.08], hz: [1, 2], spin: [1, 3], life: [1.2, 1.8], color: [0.03, 0.03, 0.035], color2: [0.03, 0.03, 0.035], land: 'stain' },
  glowfeather: { cells: [13], aspect: 0.32, size: [0.08, 0.14], fall: 0.35, sway: [0.15, 0.35], hz: [0.45, 0.8], spin: [0.4, 1.4], life: [1.8, 2.6], color: [4, 2.6, 0.9], color2: [6, 5, 3], emit: 1, land: 'fade' },
  ember:     { cells: [14], aspect: 1, size: [0.02, 0.04], fall: -0.5, sway: [0.05, 0.15], hz: [1, 2], spin: [0, 0], life: [0.8, 1.6], color: [6, 2.2, 0.5], color2: [6, 2.2, 0.5], emit: 1, land: 'fade' },
  frost:     { cells: [15], aspect: 1, size: [0.03, 0.06], fall: 0.4, sway: [0.05, 0.12], hz: [0.8, 1.4], spin: [1, 3], life: [1.4, 2.2], color: [1.6, 2.2, 3], color2: [3, 3.6, 4.2], emit: 1, land: 'fade' },
};

// ------------------------------------------------------------------ atlas (CPU, per pixel, cached)
const atlasData = new Map();
function buildAtlas(S) {
  if (atlasData.has(S)) return atlasData.get(S);
  const cs = S / 8, out = new Uint8Array(S * S * 4);
  const px = 2 / cs;
  const cov = (d) => Math.min(1, Math.max(0, 0.5 - d / px));
  const h = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const sat = (x) => Math.min(1, Math.max(0, x));
  const shapes = [];
  // feathers: rachis along +y (quill at the bottom), asymmetric vanes with barb grooves and a few splits
  const feather = (v) => (x, y) => {
    const t = (y + 0.86) / 1.8;
    if (t < 0 || t > 1) return null;
    const side = x < 0 ? 0.78 : 1.0;
    let w = 0.86 * Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, t * 1.05))), 0.55) * side;
    const split = h(Math.floor(t * 9 + v * 3) + (x < 0 ? 17 : 0));
    if (split > 0.72) w *= 1 - 0.35 * Math.pow(Math.sin(Math.PI * ((t * 9) % 1)), 2);
    const ax = Math.abs(x);
    const rach = 0.045 * (1 - t * 0.7);
    let d = ax - Math.max(w, rach);
    if (t < 0.08) d = ax - rach;
    const barb = 0.72 + 0.28 * Math.sin((t * 46 - ax * 20 * side) * (1 + v * 0.15));
    const down = t < 0.22 ? 0.55 + 0.45 * t / 0.22 : 1;
    return { a: cov(d) * down, r: barb * (0.85 + 0.15 * (1 - ax)), g: ax < rach ? 1 : 0, b: ax < rach * 0.6 ? 0.6 : 0 };
  };
  const petal = (v) => (x, y) => {
    const t = (y + 1) / 2;
    const w = 0.78 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.92 + 0.04)), 0.8) * (0.55 + 0.45 * t);
    let d = Math.abs(x) - w;
    const nd = 0.2 - Math.hypot(x, y - 1.02);
    if (v === 0) d = Math.max(d, nd);
    d = Math.max(d, y - 0.98);
    const vein = Math.abs(x) < 0.025 + 0.02 * (1 - t) ? 0.85 : 1;
    return { a: cov(d), r: (0.78 + 0.22 * Math.cos(x * 1.6)) * vein * (0.85 + 0.15 * t), g: sat(1 - t * 3.5) * 0.8, b: Math.max(0, Math.cos((x - 0.3) * 3) * 0.3 - 0.1) };
  };
  const paper = (gold) => (x, y) => {
    const e = 0.93 + 0.03 * Math.sin(x * 13 + y * 7);
    const d = Math.max(Math.abs(x), Math.abs(y)) - e;
    const fold = Math.abs(x * 0.7 + y * 0.7 - 0.1) < 0.02 ? 0.82 : 1;
    const fib = 0.92 + 0.08 * h(Math.floor(x * 30) * 7 + Math.floor(y * 6));
    let g = 0, b = 0;
    if (gold) { const s = Math.max(Math.abs(x), Math.abs(y)); g = s < 0.46 ? 1 : 0; b = s < 0.46 && Math.abs(Math.hypot(x, y) - 0.25) < 0.04 ? 0.8 : 0; }
    return { a: cov(d), r: fold * fib, g, b };
  };
  const shard = (v) => {
    const n = 5 + v, pts = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + h(v * 13 + i) * 0.6; const r = 0.6 + 0.38 * h(v * 7 + i * 3); pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    return (x, y) => {
      let d = -1e9;
      for (let i = 0; i < n; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % n];
        const ex = bx - ax, ey = by - ay, l = Math.hypot(ex, ey);
        d = Math.max(d, ((x - ax) * ey - (y - ay) * ex) / l);   // convex polygon SDF (outside > 0)
      }
      d += 0.02 * Math.sin(x * 40 + y * 31);
      const body = d > -0.12 ? 1 : 0;   // white porcelain body showing on the broken edge
      const hl = Math.abs(x * 0.6 - y * 0.8 + 0.15) < 0.06 ? 0.9 : 0;
      return { a: cov(d), r: 0.85 + 0.15 * (y + 1) * 0.5, g: body, b: hl };
    };
  };
  const ink = (v) => (x, y) => {
    let f;
    if (v === 0) f = 0.62 - Math.hypot(x, y * 0.92 + 0.05);
    else if (v === 1) {
      let s = 0;
      const blob = (cx, cy, r) => { const q = r * r / ((x - cx) * (x - cx) + (y - cy) * (y - cy) + 1e-4); s += q; };
      blob(0, 0, 0.42); blob(0.25, 0.2, 0.18); blob(-0.3, 0.1, 0.16); blob(0.05, -0.32, 0.2);
      for (let i = 0; i < 7; i++) { const a = h(i * 3.1) * 6.28, r = 0.6 + 0.3 * h(i * 1.7); blob(Math.cos(a) * r, Math.sin(a) * r, 0.05 + 0.05 * h(i)); }
      f = (s - 1) * 0.12;
    } else f = 0.45 - Math.hypot(x, y);
    return { a: cov(-f), r: 0.9 + 0.1 * Math.hypot(x, y), g: 0, b: v === 0 && Math.hypot(x + 0.22, y - 0.25) < 0.12 ? 0.8 : 0 };
  };
  const glowFeather = (x, y) => { const f = feather(0)(x, y); if (!f) return null; return { a: f.a, r: 0.55 + 0.45 * Math.max(0, 1 - Math.abs(x) * 1.4), g: f.g, b: 0 }; };
  const ember = (x, y) => { const r = Math.hypot(x, y); return { a: Math.exp(-r * r * 6), r: 1, g: Math.exp(-r * r * 30), b: 0 }; };
  const frost = (x, y) => {
    const r = Math.hypot(x, y), a = Math.atan2(y, x);
    const k = Math.PI / 3, aa = ((a % k) + k) % k - k / 2;
    const px2 = r * Math.cos(aa), py2 = Math.abs(r * Math.sin(aa));
    let d = py2 - 0.06 * (1 - px2);
    for (const bx of [0.4, 0.65]) d = Math.min(d, Math.abs(py2 - (px2 - bx) * 0.8) - 0.04 + (px2 < bx || px2 > bx + 0.22 ? 1 : 0));
    d = Math.max(d, r - 0.95);
    return { a: cov(d), r: 1, g: r < 0.15 ? 1 : 0, b: 0 };
  };
  shapes[0] = feather(0); shapes[1] = feather(1); shapes[2] = petal(0); shapes[3] = petal(1);
  shapes[4] = paper(false); shapes[5] = paper(true); shapes[6] = paper(false);
  shapes[7] = shard(0); shapes[8] = shard(1); shapes[9] = shard(2);
  shapes[10] = ink(0); shapes[11] = ink(1); shapes[12] = ink(2);
  shapes[13] = glowFeather; shapes[14] = ember; shapes[15] = frost;
  for (let c = 0; c < shapes.length; c++) {
    const cx = (c % 8) * cs, cy = Math.floor(c / 8) * cs;
    for (let j = 0; j < cs; j++) for (let i = 0; i < cs; i++) {
      const x = ((i + 0.5) / cs) * 2 - 1, y = ((j + 0.5) / cs) * 2 - 1;
      const s = shapes[c](x, y);
      const o = ((cy + j) * S + cx + i) * 4;
      if (!s) continue;
      out[o] = Math.round(sat(s.r) * 255); out[o + 1] = Math.round(sat(s.g) * 255); out[o + 2] = Math.round(sat(s.b) * 255); out[o + 3] = Math.round(sat(s.a) * 255);
    }
  }
  const res = { data: out, S };
  atlasData.set(S, res);
  return res;
}

const VERT = /* glsl */`
attribute vec4 iPos;    // xyz, height (m)
attribute vec4 iRot;    // axis xyz, angle
attribute vec4 iCol;    // colour rgb, aspect
attribute vec4 iCol2;   // colour 2 rgb, cell
uniform float uCols;
varying vec2 vUv;
varying vec3 vC1;
varying vec3 vC2;
varying vec3 vN;
varying vec3 vV;
vec3 rotA(vec3 v, vec3 k, float a) { float c = cos(a), s = sin(a); return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c); }
void main() {
  vec3 ax = normalize(iRot.xyz + vec3(1e-5));
  vec3 p = vec3(position.x * iCol.w, position.y, 0.0) * iPos.w;
  p = rotA(p, ax, iRot.w);
  vec3 n = rotA(vec3(0.0, 0.0, 1.0), ax, iRot.w);
  vec4 mv = viewMatrix * vec4(iPos.xyz + p, 1.0);
  vN = normalize(mat3(viewMatrix) * n);
  vV = -mv.xyz;
  float cell = iCol2.w;
  vec2 c = vec2(mod(cell, uCols), floor(cell / uCols));   // DataTexture: row 0 at v = 0
  vUv = (c + (position.xy + 0.5) * 0.98 + 0.01) / uCols;
  vC1 = iCol.rgb; vC2 = iCol2.rgb;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */`
uniform sampler2D tAtlas;
uniform float uEmit;
uniform vec3 uSceneLight, uSunView, uSunCol;
varying vec2 vUv;
varying vec3 vC1;
varying vec3 vC2;
varying vec3 vN;
varying vec3 vV;
void main() {
  vec4 t = texture2D(tAtlas, vUv);
  vec3 alb = mix(vC1 * t.r, vC2, t.g);
  if (uEmit > 0.5) {
    gl_FragColor = vec4(alb * t.a * (1.0 + t.g), 0.0);
    return;
  }
  if (t.a < 0.02) discard;
  vec3 n = normalize(vN);
  vec3 v = normalize(vV);
  if (dot(n, v) < 0.0) { n = -n; alb *= 0.82; }      // back side: a little darker (paper, petals)
  float sun = max(dot(n, uSunView), 0.0);
  vec3 h = normalize(uSunView + v);
  float spec = pow(max(dot(n, h), 0.0), 40.0) * (0.15 + t.b * 3.0);
  vec3 col = alb * (uSceneLight * 0.9 + uSunCol * sun * 0.9) + uSunCol * spec;
  gl_FragColor = vec4(col, t.a);
}`;

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();

class Pool {
  constructor(max, emit, tex, shared, quad) {
    this.max = max; this.n = 0;
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index; g.setAttribute('position', quad.attributes.position);
    this.pos = new Float32Array(max * 4); this.rot = new Float32Array(max * 4); this.c1 = new Float32Array(max * 4); this.c2 = new Float32Array(max * 4);
    const at = (a) => new THREE.InstancedBufferAttribute(a, 4).setUsage(THREE.DynamicDrawUsage);
    this.attrs = [at(this.pos), at(this.rot), at(this.c1), at(this.c2)];
    ['iPos', 'iRot', 'iCol', 'iCol2'].forEach((k, i) => g.setAttribute(k, this.attrs[i]));
    g.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
      uniforms: { tAtlas: tex, uCols: { value: 8 }, uEmit: { value: emit ? 1 : 0 }, uSceneLight: shared.sceneLight, uSunView: shared.sunView, uSunCol: shared.sunCol },
      transparent: emit, depthWrite: !emit, blending: emit ? THREE.AdditiveBlending : THREE.NormalBlending, alphaTest: emit ? 0 : 0.5,
    });
    if (!emit) this.mat.alphaToCoverage = true;
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = emit ? 23 : 0;
    this.geo = g;
    this.m = [];   // simulation state per slot
  }
}

export class Motes {
  constructor(kit) {
    this.kit = kit;
    this.fx = kit.fx;
    this.game = kit.game;
    const q = kit.quality;
    this.max = q === 'low' ? 60 : q === 'medium' ? 150 : 300;          // §1.14 per-weapon caps
    this.wind = new THREE.Vector3(0.35, 0, 0.12);
    this.owners = new Map();     // TRAIL_DROP: owner -> live count (≤ 24)
    const { data, S } = buildAtlas(q === 'high' || q === 'ultra' ? 1024 : 512);
    const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
    tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.needsUpdate = true;
    this.tex = { value: tex };
    const quad = new THREE.PlaneGeometry(1, 1);
    const shared = this.fx.particles.shared;
    this.solid = new Pool(this.max, false, this.tex, shared, quad);
    this.glow = new Pool(Math.max(40, this.max >> 1), true, this.tex, shared, quad);
    this.game.scene.add(this.solid.mesh, this.glow.mesh);
  }

  /**
   * One mote. kind: MOTE key. opts: vel (Vector3 | [x,y,z]), color / color2 (linear, HDR for emissive kinds),
   * size (m), scale (size multiplier: big spirits shed bigger scraps), life (s), seed, owner (TRAIL_DROP accounting), fall (m/s terminal speed), gravity, emit.
   */
  spawn(kind, pos, opts = {}) {
    const K = MOTE[kind] || MOTE.paper;
    const r = opts.rand || rng(opts.seed ?? (Math.random() * 1e9) | 0);
    const emit = opts.emit ?? K.emit ?? 0;
    const P = emit ? this.glow : this.solid;
    if (P.n >= P.max) this._kill(P, 0);
    const i = P.n++;
    const R = (a) => (Array.isArray(a) ? a[0] + (a[1] - a[0]) * r() : a);
    const v = opts.vel ? (Array.isArray(opts.vel) ? new THREE.Vector3(...opts.vel) : opts.vel.clone()) : new THREE.Vector3();
    const ax = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
    const swayDir = new THREE.Vector3(r() - 0.5, 0, r() - 0.5).normalize();
    const m = {
      kind, K, p: new THREE.Vector3(pos.x, pos.y, pos.z), v, t: 0, life: opts.life ?? R(K.life), size: (opts.size ?? R(K.size)) * (opts.scale ?? 1),
      fall: opts.fall ?? K.fall, grav: opts.gravity ?? K.gravity ?? 0, sway: R(K.sway || 0), hz: R(K.hz || 1), ph: r() * 6.28,
      swayDir, ax, ang: r() * 6.28, spin: R(K.spin) * (r() < 0.5 ? -1 : 1), cell: K.cells[(r() * K.cells.length) | 0],
      landed: false, landT: 0, owner: opts.owner, bounced: 0,
      c1: hdr(opts.color || K.color, 1, new THREE.Vector3()), c2: hdr(opts.color2 || K.color2, 1, new THREE.Vector3()),
    };
    P.m[i] = m;
    if (m.owner !== undefined) this.owners.set(m.owner, (this.owners.get(m.owner) || 0) + 1);
    return m;
  }

  /**
   * count motes from pos. opts: speed (m/s), dir (Vector3 cone axis, default up), spread (0..1 cone), radius (m
   * spawn jitter), palette (array of colours, picked per mote), color, color2, size, life, emit, seed.
   */
  burst(kind, pos, count = 8, opts = {}) {
    const r = rng(opts.seed ?? (Math.random() * 1e9) | 0);
    const n = Math.max(1, Math.round(count * (this.kit.low ? 0.5 : 1)));
    const dir = opts.dir || _UP, sp = opts.speed ?? 2, spread = opts.spread ?? 0.8, rad = opts.radius ?? 0.1;
    for (let k = 0; k < n; k++) {
      _d.set(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(2 * spread).add(dir).normalize().multiplyScalar(sp * (0.4 + 0.6 * r()));
      _v.set(pos.x + (r() - 0.5) * 2 * rad, pos.y + (r() - 0.5) * 2 * rad, pos.z + (r() - 0.5) * 2 * rad);
      const color = opts.palette ? opts.palette[(r() * opts.palette.length) | 0] : opts.color;
      this.spawn(kind, _v, { ...opts, rand: r, vel: _d.clone(), color });
    }
  }

  /**
   * TRAIL_DROP (§1.17): one mote every `spacing` m along from -> to (bullet path / blade arc), drifting down for
   * ~1.2 s. Each owner (weapon) keeps ≤ 24 alive; scoped halves the density. opts as spawn() + spacing, scoped.
   */
  trailDrop(from, to, kind = 'feather', opts = {}) {
    const owner = opts.owner ?? 'local';
    const spacing = (opts.spacing ?? 2) * (opts.scoped ? 2 : 1);
    _d.subVectors(to, from);
    const len = _d.length();
    if (len < 0.01) return 0;
    _d.multiplyScalar(1 / len);
    const r = rng(opts.seed ?? (Math.random() * 1e9) | 0);
    let n = 0;
    for (let s = spacing * (0.3 + 0.5 * r()); s < len; s += spacing) {
      if ((this.owners.get(owner) || 0) >= (opts.max ?? 24)) break;
      _v.copy(from).addScaledVector(_d, s);
      this.spawn(kind, _v, { life: 1.2 + r() * 0.3, ...opts, rand: r, owner, vel: [_d.x * 0.6 + (r() - 0.5) * 0.4, 0.3 + r() * 0.3, _d.z * 0.6 + (r() - 0.5) * 0.4] });
      n++;
    }
    return n;
  }

  _kill(P, i) {
    const m = P.m[i];
    if (m?.owner !== undefined) { const c = (this.owners.get(m.owner) || 1) - 1; if (c > 0) this.owners.set(m.owner, c); else this.owners.delete(m.owner); }
    const last = --P.n;
    if (i !== last) { P.m[i] = P.m[last]; }
    P.m[last] = null;
  }

  update(dt) {
    for (const P of [this.solid, this.glow]) {
      for (let i = P.n - 1; i >= 0; i--) {
        const m = P.m[i];
        m.t += dt;
        if (m.t >= m.life) { this._kill(P, i); continue; }
        this._step(m, dt);
      }
      // write instance data (after compaction the order is stable for this frame)
      for (let i = 0; i < P.n; i++) {
        const m = P.m[i], o = i * 4;
        const shrink = Math.min(1, (m.life - m.t) / 0.3) * Math.min(1, m.t / 0.06 + 0.3);
        P.pos[o] = m.p.x; P.pos[o + 1] = m.p.y; P.pos[o + 2] = m.p.z; P.pos[o + 3] = m.size * shrink;
        P.rot[o] = m.ax.x; P.rot[o + 1] = m.ax.y; P.rot[o + 2] = m.ax.z; P.rot[o + 3] = m.ang;
        P.c1[o] = m.c1.x; P.c1[o + 1] = m.c1.y; P.c1[o + 2] = m.c1.z; P.c1[o + 3] = m.K.aspect;
        P.c2[o] = m.c2.x; P.c2[o + 1] = m.c2.y; P.c2[o + 2] = m.c2.z; P.c2[o + 3] = m.cell;
      }
      P.geo.instanceCount = P.n;
      if (P.n) for (const a of P.attrs) { a.clearUpdateRanges(); a.addUpdateRange(0, P.n * 4); a.needsUpdate = true; }
      P.mesh.visible = P.n > 0;
    }
  }

  _step(m, dt) {
    if (m.landed) { m.landT += dt; return; }
    const K = m.K;
    if (m.fall) {
      // drag towards terminal fall speed + wind, plus a falling-leaf sway (side-to-side, slower at the turns)
      const k = Math.min(1, dt * 3);
      const sw = Math.cos(m.t * m.hz * 6.283 + m.ph);
      m.v.x += (this.wind.x - m.v.x) * k; m.v.z += (this.wind.z - m.v.z) * k;
      m.v.y += (-m.fall * (0.55 + 0.45 * Math.abs(sw)) - m.v.y) * k;
      const vs = m.sway * m.hz * 6.283 * sw;
      m.p.x += (m.v.x + m.swayDir.x * vs) * dt; m.p.y += m.v.y * dt; m.p.z += (m.v.z + m.swayDir.z * vs) * dt;
      m.ang += m.spin * dt * (0.4 + 0.6 * Math.abs(sw));
    } else {
      m.v.y -= m.grav * dt;
      m.v.multiplyScalar(Math.max(0, 1 - 0.4 * dt));
      m.p.addScaledVector(m.v, dt);
      m.ang += m.spin * dt;
    }
    const fy = this.fx._floorAt(m.p.x, m.p.z);
    if (m.p.y < fy + 0.01 && m.v.y < 0) {
      m.p.y = fy + 0.01;
      if (K.land === 'bounce' && m.bounced < 1 && m.v.y < -1.5) { m.bounced++; m.v.y *= -0.3; m.v.x *= 0.5; m.v.z *= 0.5; m.spin *= 0.4; return; }
      if (K.land === 'stain') {
        this.fx.decals.add(_v.set(m.p.x, fy, m.p.z), _UP, { frame: DECAL.splat, size: m.size * 3 + 0.04, tint: DECAL_TINT.none, alpha: 0.9, life: 6, fade: 2, fit: false });
        m.life = Math.min(m.life, m.t + 0.02);
        return;
      }
      if (K.land === 'fade') { m.life = Math.min(m.life, m.t + 0.2); return; }
      // lie flat on the floor (paper, feathers, petals, settled shards) and fade after a while
      m.landed = true; m.ax.set(1, 0, 0); m.ang = Math.PI / 2 + (Math.random() - 0.5) * 0.3; m.p.y = fy + 0.008;
      m.life = Math.min(m.life, m.t + 1.2);
    }
  }

  clear() {
    for (const P of [this.solid, this.glow]) { while (P.n) this._kill(P, P.n - 1); P.geo.instanceCount = 0; P.mesh.visible = false; }
    this.owners.clear();
  }
}
const _UP = new THREE.Vector3(0, 1, 0);
