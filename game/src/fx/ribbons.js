// Ribbon effects for premium / special weapons (CSO-style): one dynamic additive mesh in the world and one
// in viewmodel space (child of the camera, drawn through the viewmodel projection).
//   trail  – nodes pushed every frame (projectile streaks, blade slash trails between root and tip)
//   beam   – straight energy beam with a hot core, a soft glow and scrolling bands
//   bolt   – jagged lightning (midpoint displacement + branches), regenerated every `regen` seconds
// Geometry is expanded on the CPU (camera-facing strips, or explicit two-edge ribbons for blades).
import * as THREE from 'three';
import { materialUniforms } from '../gfx/materials.js';

const VERT = /* glsl */`
attribute vec4 color;
attribute vec3 prm;     // x profile (0 soft, 1 beam core+glow, 2 blade slash, 3 feather, 4 crescent), y core ratio, z band scroll
uniform float uVm;
uniform mat4 vmProj;
varying vec4 vColor;
varying vec2 vUv;
varying vec3 vPrm;
varying float vFade;
void main() {
  vColor = color; vUv = uv; vPrm = prm;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFade = uVm > 0.5 ? 1.0 : clamp((-mv.z - 0.1) / 0.5, 0.0, 1.0);
  if (uVm > 0.5) { gl_Position = vmProj * mv; gl_Position.z = gl_Position.z * 0.08 - 0.92 * gl_Position.w; }
  else gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */`
uniform float uTime;
varying vec4 vColor;
varying vec2 vUv;
varying vec3 vPrm;
varying float vFade;
float hash(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  float v = abs(vUv.y * 2.0 - 1.0);
  vec3 col = vColor.rgb;
  float a;
  if (vPrm.x < 0.5) {
    a = exp(-v * v * 3.5);
  } else if (vPrm.x < 1.5) {
    float k = 1.0 / max(vPrm.y * vPrm.y, 1e-4);
    float core = exp(-v * v * k * 2.5);
    float glow = exp(-v * v * 4.0) * 0.5;
    float band = vPrm.z > 0.0 ? 0.8 + 0.2 * sin((vUv.x - uTime * vPrm.z) * 6.2832) : 1.0;
    col = mix(col * 0.6, vec3(dot(col, vec3(0.33))) * 1.4 + col * 0.5, core);
    a = (core + glow) * band;
  } else if (vPrm.x > 6.5) {
    // katana (M02 sabre cuts): a crisp white-hot line along the tip edge and only a faint streaked wake behind it (a
    // cut of light, not a sheet), the newest node whitest, the tail in the trail's tail colour
    float t = vUv.y, u = vUv.x;
    float streak = 0.6 + 0.4 * hash(floor(t * 34.0 + floor(u * 8.0) * 7.0));
    float edge = smoothstep(0.9, 0.975, t) * smoothstep(1.0, 0.985, t);
    float body = smoothstep(0.35, 0.95, t) * smoothstep(1.0, 0.93, t) * streak * 0.32;
    float lead = exp(-u * 10.0);
    col = mix(col, vec3(dot(col, vec3(0.3))) * 1.4 + col * 0.3, min(1.0, lead * 0.8 + edge * 0.5));
    a = (edge * 1.6 + body) * (0.6 + 0.8 * lead) * (1.0 - smoothstep(0.5, 1.0, u));
  } else if (vPrm.x > 4.5) {
    // prism (X06 sabre cuts): the band fills the blade's sweep (t 0 root .. 1 tip edge) in a saturated body colour;
    // white only in the leading ~20 % (u 0 = newest node) and along a hairline at the tip edge; a thin spectral
    // fringe just inside that edge (5 = red outermost, 6 = violet outermost: 虹 / 霓, the colour order reversed)
    float t = vUv.y, u = vUv.x;
    float streak = 0.8 + 0.2 * hash(floor(t * 26.0 + floor(u * 5.0) * 7.0));
    a = smoothstep(0.02, 0.6, t) * smoothstep(1.0, 0.965, t) * streak * (0.4 + 0.6 * t);
    float rim = smoothstep(0.9, 0.975, t) * smoothstep(1.0, 0.98, t);
    float lead = 1.0 - smoothstep(0.08, 0.22, u);
    vec3 white = vec3(dot(col, vec3(0.3))) * 1.25 + col * 0.3;
    float x = clamp((t - 0.82) / 0.14, 0.0, 1.0);
    float h = vPrm.x > 5.5 ? 0.78 * x : 0.78 * (1.0 - x);          // hue 0 red .. 0.78 violet
    vec3 spec = clamp(vec3(abs(h * 6.0 - 3.0) - 1.0, 2.0 - abs(h * 6.0 - 2.0), 2.0 - abs(h * 6.0 - 4.0)), 0.0, 1.0);
    float fr = exp(-pow((t - 0.89) * 16.0, 2.0)) * (1.0 - 0.6 * lead);
    float lum = max(max(col.r, col.g), col.b);
    col = mix(col, white, max(lead * smoothstep(0.35, 0.9, t), rim * 0.85)) + spec * lum * 0.9 * fr;
    a = a * (0.7 + 0.6 * lead) + rim * 0.9 + fr * 0.5;
    a *= 1.0 - smoothstep(0.6, 1.0, u);
  } else if (vPrm.x > 3.5) {
    // crescent (energy blade arcs, X02): alpha weighted to the outer half (v 0 root .. 1 tip edge), a white-hot leading
    // edge (u 0 = the newest node), a feathered tail and cap -- an arc of light, not a sheet hanging off the blade
    float t = vUv.y, u = vUv.x;
    float streak = 0.75 + 0.25 * hash(floor(t * 30.0 + floor(u * 6.0) * 7.0));
    a = smoothstep(0.3, 0.96, t) * smoothstep(1.0, 0.95, t) * streak * (0.35 + 0.65 * t);
    a += smoothstep(0.88, 0.975, t) * smoothstep(1.0, 0.975, t) * 1.2;
    float lead = exp(-u * 9.0);
    col = mix(col, vec3(dot(col, vec3(0.3))) * 1.3 + col * 0.35, lead * smoothstep(0.6, 0.95, t));
    a *= (0.55 + 0.9 * lead) * (1.0 - smoothstep(0.55, 1.0, u));
  } else if (vPrm.x > 2.5) {
    // feather-vein shaft (M03 焚天光): a hot rachis, a soft wide vane and herringbone barbs (chevrons sloping back
    // from the axis) scrolling down the shaft
    float k = 1.0 / max(vPrm.y * vPrm.y, 1e-4);
    float core = exp(-v * v * k * 2.5);
    float vane = exp(-v * v * 2.6);
    float barb = smoothstep(0.35, 0.9, 0.5 + 0.5 * sin((vUv.x * 1.7 - v * 1.25 - uTime * vPrm.z) * 6.2832));
    barb *= smoothstep(0.08, 0.3, v) * (1.0 - smoothstep(0.7, 1.0, v));
    col = mix(col * 0.55, vec3(dot(col, vec3(0.33))) * 1.4 + col * 0.5, core);
    a = core + vane * (0.22 + 0.55 * barb);
  } else {
    // blade slash: v = 0 at the root edge, 1 at the tip edge; bright, sharp tip edge with streaks
    float t = vUv.y;
    float streak = 0.65 + 0.35 * hash(floor(t * 24.0));
    a = smoothstep(0.0, 0.85, t) * smoothstep(1.0, 0.93, t) * streak;
    a += smoothstep(0.86, 0.97, t) * smoothstep(1.0, 0.97, t) * 1.5;
  }
  gl_FragColor = vec4(col * a * vColor.a * vFade, 1.0);
}`;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _t = new THREE.Vector3();
const _e = new THREE.Vector3();
const _s = new THREE.Vector3();
const _n = new THREE.Vector3();
const R = Math.random;

class Batch {
  constructor(maxVerts, vm, timeU) {
    this.max = maxVerts;
    this.pos = new Float32Array(maxVerts * 3);
    this.col = new Float32Array(maxVerts * 4);
    this.uv = new Float32Array(maxVerts * 2);
    this.prm = new Float32Array(maxVerts * 3);
    this.index = new Uint16Array(maxVerts * 3);
    const g = new THREE.BufferGeometry();
    const at = (arr, n) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    this.attrs = [at(this.pos, 3), at(this.col, 4), at(this.uv, 2), at(this.prm, 3)];
    g.setAttribute('position', this.attrs[0]); g.setAttribute('color', this.attrs[1]); g.setAttribute('uv', this.attrs[2]); g.setAttribute('prm', this.attrs[3]);
    this.idx = new THREE.BufferAttribute(this.index, 1).setUsage(THREE.DynamicDrawUsage);
    g.setIndex(this.idx);
    g.setDrawRange(0, 0);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uVm: { value: vm ? 1 : 0 }, vmProj: materialUniforms.vmProj, uTime: timeU },
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = vm ? 43 : 21;
    this.nv = 0; this.ni = 0;
    this.eye = new THREE.Vector3();
  }
  begin(eye) { this.nv = 0; this.ni = 0; this.eye.copy(eye); }
  /** Camera-facing strip through pts (Vector3[]) with per-point width w(i), colour c(i) -> [r,g,b,a]. */
  strip(pts, n, w, c, profile, coreRatio = 0.25, scroll = 0, uScale = 1) {
    if (n < 2 || this.nv + n * 2 > this.max) return;
    const base = this.nv;
    let u = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(n - 1, i + 1)];
      _t.subVectors(p1, p0);
      _e.subVectors(p, this.eye);
      _s.crossVectors(_t, _e);
      const l = _s.length();
      if (l < 1e-8) _s.set(0, 1, 0); else _s.multiplyScalar(1 / l);
      if (i > 0) u += p.distanceTo(pts[i - 1]) * uScale;
      const hw = w(i) * 0.5, cc = c(i);
      this._vert(p.x + _s.x * hw, p.y + _s.y * hw, p.z + _s.z * hw, cc, u, 0, profile, coreRatio, scroll);
      this._vert(p.x - _s.x * hw, p.y - _s.y * hw, p.z - _s.z * hw, cc, u, 1, profile, coreRatio, scroll);
    }
    for (let i = 0; i < n - 1; i++) { const k = base + i * 2; this._tri(k, k + 1, k + 2); this._tri(k + 1, k + 3, k + 2); }
  }
  /** Two-edge ribbon (blade trails): roots[i] -> tips[i]. */
  edges(roots, tips, n, c, profile) {
    if (n < 2 || this.nv + n * 2 > this.max) return;
    const base = this.nv;
    for (let i = 0; i < n; i++) {
      const cc = c(i), u = i / (n - 1);
      this._vert(roots[i].x, roots[i].y, roots[i].z, cc, u, 0, profile, 0, 0);
      this._vert(tips[i].x, tips[i].y, tips[i].z, cc, u, 1, profile, 0, 0);
    }
    for (let i = 0; i < n - 1; i++) { const k = base + i * 2; this._tri(k, k + 1, k + 2); this._tri(k + 1, k + 3, k + 2); }
  }
  _vert(x, y, z, c, u, v, prof, core, scroll) {
    const i = this.nv++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.col[i * 4] = c[0]; this.col[i * 4 + 1] = c[1]; this.col[i * 4 + 2] = c[2]; this.col[i * 4 + 3] = c[3] ?? 1;
    this.uv[i * 2] = u; this.uv[i * 2 + 1] = v;
    this.prm[i * 3] = prof; this.prm[i * 3 + 1] = core; this.prm[i * 3 + 2] = scroll;
  }
  _tri(a, b, c) { const i = this.ni; this.index[i] = a; this.index[i + 1] = b; this.index[i + 2] = c; this.ni += 3; }
  end() {
    this.geo.setDrawRange(0, this.ni);
    if (!this.ni) return;
    const ranges = [[this.attrs[0], 3], [this.attrs[1], 4], [this.attrs[2], 2], [this.attrs[3], 3]];
    for (const [a, s] of ranges) { a.clearUpdateRanges(); a.addUpdateRange(0, this.nv * s); a.needsUpdate = true; }
    this.idx.clearUpdateRanges(); this.idx.addUpdateRange(0, this.ni); this.idx.needsUpdate = true;
  }
}

function lerpC(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, (a[3] ?? 1) + ((b[3] ?? 1) - (a[3] ?? 1)) * t]; }

export class Ribbons {
  constructor(scene, camera, { maxVerts = 6000 } = {}) {
    this.camera = camera;
    this.time = { value: 0 };
    this.world = new Batch(maxVerts, false, this.time);
    this.vmb = new Batch(Math.min(2048, maxVerts), true, this.time);
    scene.add(this.world.mesh);
    camera.add(this.vmb.mesh);
    this.items = [];
    this._pts = Array.from({ length: 80 }, () => new THREE.Vector3());
  }

  /**
   * Trail: t.push(a [, b]) every frame; b given = blade ribbon from a (root) to b (tip).
   * opts: width (m, camera-facing trails), life (s, node lifetime), color [r,g,b,a] (HDR) at the head,
   * color1 at the tail, taper (width at the tail, 0..1), segs (max nodes), profile ('soft'|'beam'|'slash'|'crescent'|
   * 'prism'|'prismRev': a saturated blade band with a white lead + tip hairline and a spectral fringe), vm.
   */
  trail({ width = 0.06, life = 0.25, color = [4, 3, 2, 1], color1 = null, taper = 0, segs = 24, profile = 'soft', vm = false } = {}) {
    const t = { kind: 'trail', nodes: [], width, life, color, color1: color1 || [color[0], color[1], color[2], 0], taper, segs, vm, profile: PROFILE[profile] ?? 0, stopped: false, age: 0 };
    t.push = (a, b = null) => {
      if (t.stopped) return t;
      t.nodes.unshift({ a: a.clone(), b: b ? b.clone() : null, t: 0 });
      if (t.nodes.length > t.segs) t.nodes.length = t.segs;
      return t;
    };
    t.stop = () => { t.stopped = true; return t; };
    this.items.push(t);
    return t;
  }

  /**
   * Energy beam; returns { set(from, to), stop() }. opts: core [r,g,b], glow [r,g,b], wCore, wGlow, life, shrink, scroll,
   * vm, pattern ('bands' | 'feather': herringbone barbs), wStart (width fraction at `from`) + ramp (m to full width:
   * a fat shaft that stays thin where it leaves the gun)
   */
  beam(from, to, { core = [3, 4, 8], glow = [0.6, 0.8, 2.4], wCore = 0.03, wGlow = 0.2, life = 0.3, shrink = 0.4, scroll = 0, vm = false, pattern = 'bands', wStart = 1, ramp = 0 } = {}) {
    const b = { kind: 'beam', from: from.clone(), to: to.clone(), core, glow, wCore, wGlow, life, shrink, scroll, vm, age: 0, stopped: false, prof: pattern === 'feather' ? 3 : 1, wStart, ramp };
    b.set = (f, t) => { b.from.copy(f); b.to.copy(t); return b; };
    b.stop = () => { b.age = Math.max(b.age, b.life); return b; };
    this.items.push(b);
    return b;
  }

  /**
   * Lightning: jagged polyline from -> to, regenerated every `regen` s. opts: col (core HDR), glow (outer HDR),
   * width (glow width m), core (core ratio), levels (subdivisions, 2^levels segments), jitter (fraction of length),
   * branches, regen, life, vm. Returns { set(from, to), stop() }.
   */
  bolt(from, to, { col = [4, 5, 9], glow = [1, 1.6, 4], width = 0.12, core = 0.18, levels = 4, jitter = 0.1, branches = 2, regen = 0.05, life = 0.3, vm = false } = {}) {
    const b = { kind: 'bolt', from: from.clone(), to: to.clone(), col, glow, width, core, levels, jitter, branches, regen, life, vm, age: 0, rt: 0, paths: [], stopped: false };
    b.set = (f, t) => { b.from.copy(f); b.to.copy(t); return b; };
    b.stop = () => { b.age = Math.max(b.age, b.life); return b; };
    this._regen(b);
    this.items.push(b);
    return b;
  }

  _regen(b) {
    const n = 1 << b.levels;
    const main = [];
    for (let i = 0; i <= n; i++) main.push(new THREE.Vector3().lerpVectors(b.from, b.to, i / n));
    const len = b.from.distanceTo(b.to);
    _n.subVectors(b.to, b.from).normalize();
    // midpoint displacement
    for (let step = n >> 1, amp = b.jitter * len; step >= 1; step >>= 1, amp *= 0.55) {
      for (let i = step; i < n; i += step * 2) {
        const m = main[i].lerpVectors(main[i - step], main[i + step], 0.5);
        _a.set(R() - 0.5, R() - 0.5, R() - 0.5);
        _a.addScaledVector(_n, -_a.dot(_n)).normalize().multiplyScalar((R() - 0.5) * 2 * amp);
        m.add(_a);
      }
    }
    b.paths = [{ pts: main, w: 1 }];
    for (let k = 0; k < b.branches; k++) {
      const i0 = 1 + Math.floor(R() * (n - 2));
      const start = main[i0];
      const dir = new THREE.Vector3().subVectors(main[Math.min(n, i0 + 2)], start).normalize();
      dir.x += (R() - 0.5) * 1.4; dir.y += (R() - 0.5) * 1.4; dir.z += (R() - 0.5) * 1.4;
      dir.normalize();
      const bl = len * (0.15 + R() * 0.25);
      const m = 4;
      const pts = [];
      for (let i = 0; i <= m; i++) {
        const p = start.clone().addScaledVector(dir, (bl * i) / m);
        if (i) p.add(_a.set(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(bl * 0.25));
        pts.push(p);
      }
      b.paths.push({ pts, w: 0.55 });
    }
  }

  update(dt) {
    this.time.value += dt;
    const cam = this.camera;
    this.world.begin(_b.setFromMatrixPosition(cam.matrixWorld));
    this.vmb.begin(_b.set(0, 0, 0));
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      const B = it.vm ? this.vmb : this.world;
      it.age += dt;
      if (it.kind === 'trail') {
        for (const nd of it.nodes) nd.t += dt;
        while (it.nodes.length && it.nodes[it.nodes.length - 1].t > it.life) it.nodes.pop();
        if (it.stopped && !it.nodes.length) { this.items.splice(i, 1); continue; }
        const n = it.nodes.length;
        if (n < 2) continue;
        const col = (k) => { const f = it.nodes[k].t / it.life; const c = lerpC(it.color, it.color1, f); c[3] *= 1 - f; return c; };
        if (it.nodes[0].b) {
          const roots = it.nodes.map((nd) => nd.a), tips = it.nodes.map((nd) => nd.b);
          B.edges(roots, tips, n, col, it.profile || 2);
        } else {
          const pts = it.nodes.map((nd) => nd.a);
          B.strip(pts, n, (k) => it.width * (1 - (1 - it.taper) * (it.nodes[k].t / it.life)), col, it.profile, 0.3);
        }
      } else if (it.kind === 'beam') {
        if (it.age >= it.life) { this.items.splice(i, 1); continue; }
        const f = it.age / it.life;
        const wk = 1 - (1 - it.shrink) * f;
        const a = 1 - f * f;
        const L = it.from.distanceTo(it.to), segs = Math.min(40, Math.max(2, Math.ceil(L / 2)));
        for (let k = 0; k <= segs; k++) this._pts[k].lerpVectors(it.from, it.to, k / segs);
        const c = [it.core[0] * 0.5 + it.glow[0], it.core[1] * 0.5 + it.glow[1], it.core[2] * 0.5 + it.glow[2], a];
        const wf = it.ramp > 0 ? (k) => { const x = Math.min(1, (k / segs) * L / it.ramp); return it.wStart + (1 - it.wStart) * x * x * (3 - 2 * x); } : () => 1;
        B.strip(this._pts, segs + 1, (k) => it.wGlow * wk * wf(k), () => c, it.prof, Math.max(0.05, it.wCore / it.wGlow), it.scroll, 0.5);
      } else if (it.kind === 'bolt') {
        if (it.age >= it.life) { this.items.splice(i, 1); continue; }
        it.rt += dt;
        if (it.rt >= it.regen) { it.rt = 0; this._regen(it); }
        const f = it.age / it.life;
        const a = f < 0.7 ? 1 : 1 - (f - 0.7) / 0.3;
        const flick = 0.75 + 0.25 * Math.sin(this.time.value * 90 + i);
        const c = [it.col[0] * 0.4 + it.glow[0], it.col[1] * 0.4 + it.glow[1], it.col[2] * 0.4 + it.glow[2], a * flick];
        for (const p of it.paths) B.strip(p.pts, p.pts.length, (k) => it.width * p.w * (k === 0 || k === p.pts.length - 1 ? 0.6 : 1), () => c, 1, it.core);
      }
    }
    this.world.end();
    this.vmb.end();
  }
}

const PROFILE = { soft: 0, beam: 1, slash: 2, crescent: 4, prism: 5, prismRev: 6, katana: 7 };
