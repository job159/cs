// Small procedural mesh effects for zombie / boss / supply FX (06b §9.1 #7, §9.2): one draw call each.
//   Marks    camera-facing icon sprites drawn by SDF, no atlas: healing-cross medallions (CSO voodoo), 4-point
//            sparkles, bubbles, shield (damage reduction), diamond (elite), ring, chevron, glow dot (eyes), 5-point
//            stun star, square glint. CPU-simulated like particles; optional `follow` keeps one on a moving zombie.
//   Pillars  additive light columns (supply crates, boss drops, fly-in), vertical fade + scrolling streaks.
import * as THREE from 'three';

export const MARK = { cross: 0, star: 1, bubble: 2, shield: 3, diamond: 4, ring: 5, chevron: 6, dot: 7, stun: 8, glint: 9 };

const MARK_VERT = /* glsl */`
attribute vec4 iA;   // x, y, z, size (m)
attribute vec4 iC;   // HDR colour, alpha
attribute vec4 iM;   // kind, rotation
varying vec2 vQ;
varying vec4 vC;
varying float vK;
void main() {
  vec4 mv = modelViewMatrix * vec4(iA.xyz, 1.0);
  float c = cos(iM.y), s = sin(iM.y);
  vec2 q = position.xy;
  mv.xy += vec2(c * q.x - s * q.y, s * q.x + c * q.y) * iA.w;
  vQ = q * 2.0; vC = iC; vK = iM.x;
  gl_Position = projectionMatrix * mv;
}`;

const MARK_FRAG = /* glsl */`
varying vec2 vQ;
varying vec4 vC;
varying float vK;
float band(float x, float c, float w) { float k = (x - c) / w; return exp(-k * k); }
float box(vec2 q, vec2 b, float soft) { vec2 d = abs(q) - b; return 1.0 - smoothstep(-soft, soft, max(d.x, d.y)); }
void main() {
  vec2 q = vQ;
  float d = length(q);
  float k = vK, v = 0.0, w = 0.0;   // v: colour intensity, w: white core
  if (k < 0.5) {            // healing cross medallion: hollow ring + bold plus, halo
    float ring = band(d, 0.64, 0.06);
    float plus = max(box(q, vec2(0.4, 0.11), 0.03), box(q, vec2(0.11, 0.4), 0.03));
    v = ring + plus + exp(-d * d * 3.0) * 0.35;
    w = plus * 0.55 + ring * 0.25;
  } else if (k < 1.5) {     // 4-point sparkle
    float l = exp(-abs(q.y) * 38.0) * max(0.0, 1.0 - abs(q.x)) + exp(-abs(q.x) * 38.0) * max(0.0, 1.0 - abs(q.y));
    v = l + exp(-d * d * 22.0) * 1.2;
    w = exp(-d * d * 60.0);
  } else if (k < 2.5) {     // bubble
    v = band(d, 0.72, 0.07) * 0.8 + exp(-dot(q - vec2(-0.32, 0.34), q - vec2(-0.32, 0.34)) * 40.0) * 0.9 + (1.0 - smoothstep(0.0, 0.75, d)) * 0.08;
  } else if (k < 3.5) {     // shield outline (damage reduction)
    float y = q.y;
    float hw = y > 0.15 ? 0.58 : 0.58 * clamp((y + 0.75) / 0.9, 0.0, 1.0);
    float inside = step(abs(q.x), hw) * step(-0.75, y) * step(y, 0.62);
    float edge = inside * (1.0 - step(abs(q.x), hw - 0.12) * step(-0.6, y) * step(y, 0.5));
    v = edge + inside * 0.18;
    w = edge * 0.3;
  } else if (k < 4.5) {     // diamond (elite)
    float m = abs(q.x) + abs(q.y) * 0.8;
    v = band(m, 0.62, 0.06) + (1.0 - smoothstep(0.3, 0.42, m)) * 0.8 + exp(-d * d * 4.0) * 0.2;
    w = (1.0 - smoothstep(0.15, 0.3, m)) * 0.5;
  } else if (k < 5.5) {     // ring
    v = band(d, 0.82, 0.05);
  } else if (k < 6.5) {     // chevron pointing down
    float c = abs(q.y - 0.1 + abs(q.x) * 0.9);
    v = band(c, 0.0, 0.1) * step(abs(q.x), 0.65);
  } else if (k < 7.5) {     // glow dot (eyes, cores)
    v = exp(-d * d * 5.0);
    w = exp(-d * d * 30.0);
  } else if (k < 8.5) {     // 5-point star (stunned)
    float a = atan(q.y, q.x);
    float rr = 0.42 + 0.22 * cos(5.0 * a);
    v = 1.0 - smoothstep(rr - 0.06, rr, d);
    w = v * 0.4;
  } else {                  // square glint
    v = box(q, vec2(0.22), 0.12) + exp(-d * d * 8.0) * 0.4;
    w = box(q, vec2(0.12), 0.05) * 0.6;
  }
  if (v + w < 0.003) discard;
  vec3 col = vC.rgb * v + vec3(dot(vC.rgb, vec3(0.33))) * w;
  gl_FragColor = vec4(col, vC.a);   // AdditiveBlending = src * srcAlpha + dst
}`;

const PILLAR_VERT = /* glsl */`
attribute vec4 iP;   // base x, y, z, radius
attribute vec4 iH;   // height, alpha, seed, taper
attribute vec3 iC;
varying vec3 vC;
varying float vA;
varying float vV;
varying float vU;
varying float vF;
varying float vS;
void main() {
  vec3 p = position;
  float r = iP.w * mix(1.0, iH.w, p.y);
  vec3 w = vec3(iP.x + p.x * r, iP.y + p.y * iH.x, iP.z + p.z * r);
  vec4 mv = viewMatrix * vec4(w, 1.0);
  vec3 n = normalize((viewMatrix * vec4(normal, 0.0)).xyz);
  vF = abs(dot(n, normalize(-mv.xyz)));
  vC = iC; vA = iH.y; vV = p.y; vU = atan(p.x, p.z); vS = iH.z;
  gl_Position = projectionMatrix * mv;
}`;

const PILLAR_FRAG = /* glsl */`
uniform float uTime;
varying vec3 vC;
varying float vA;
varying float vV;
varying float vU;
varying float vF;
varying float vS;
void main() {
  // no pow(): ANGLE / D3D turned the top rim (u -> 0) into NaN pixels that show as black dots
  float u = clamp(1.0 - vV, 0.0, 1.0);
  float fade = u * sqrt(u) * smoothstep(0.0, 0.06, vV);
  float streak = 0.65 + 0.35 * sin(vU * 7.0 + vS * 20.0) * sin(vV * 9.0 - uTime * 3.0 + vS * 5.0);
  float core = vF * vF;
  gl_FragColor = vec4(vC * fade * core * streak, vA);   // additive: src * srcAlpha + dst
}`;

export class Marks {
  constructor(scene, { max = 128 } = {}) {
    this.max = max;
    this.items = [];
    const g = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    g.index = quad.index;
    g.setAttribute('position', quad.attributes.position);
    this.arr = {};
    for (const k of ['iA', 'iC', 'iM']) {
      this.arr[k] = new Float32Array(max * 4);
      g.setAttribute(k, new THREE.InstancedBufferAttribute(this.arr[k], 4).setUsage(THREE.DynamicDrawUsage));
    }
    g.instanceCount = 0;
    this.geo = g;
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: MARK_VERT, fragmentShader: MARK_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 22;
    scene.add(this.mesh);
  }

  /**
   * kind: MARK key. o: x y z, vx vy vz, life, delay, size, size1, color [r,g,b,a] HDR, color1, gravity, drag,
   * spin, rot, follow (object with .pos) + ox oy oz (offset, follows until stop()/life), fadeIn.
   * Returns the mark (m.stop() fades it over 0.2 s).
   */
  add(kind, o) {
    if (this.items.length >= this.max) this.items.shift();
    const m = { k: MARK[kind] ?? kind, x: o.x ?? 0, y: o.y ?? 0, z: o.z ?? 0, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, t: -(o.delay || 0), life: o.life ?? 1,
      s0: o.size ?? 0.3, s1: o.size1 ?? o.size ?? 0.3, c0: o.color || [1, 1, 1, 1], c1: o.color1 || null, g: o.gravity || 0, drag: o.drag || 0, spin: o.spin || 0,
      rot: o.rot ?? 0, follow: o.follow || null, ox: o.ox || 0, oy: o.oy || 0, oz: o.oz || 0, fadeIn: o.fadeIn ?? 0.08, end: -1 };
    m.stop = () => { if (m.end < 0) m.end = m.t; return m; };
    this.items.push(m);
    return m;
  }

  update(dt) {
    const A = this.arr;
    let n = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const m = this.items[i];
      m.t += dt;
      if (m.follow && m.follow.alive === false) m.stop();      // the zombie it marks died
      if (m.t >= m.life || (m.end >= 0 && m.t - m.end > 0.2)) { this.items.splice(i, 1); continue; }
      if (m.t < 0) continue;
      if (m.follow) {
        const p = m.follow.pos || m.follow;
        m.x = p.x + m.ox; m.y = p.y + m.oy; m.z = p.z + m.oz;
      } else {
        const dr = Math.max(0, 1 - m.drag * dt);
        m.vx *= dr; m.vy = m.vy * dr - m.g * dt; m.vz *= dr;
        m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt;
      }
      m.rot += m.spin * dt;
      const u = isFinite(m.life) ? m.t / m.life : 0;
      const c0 = m.c0, c1 = m.c1 || [c0[0], c0[1], c0[2], 0];
      let a = (c0[3] ?? 1) + ((c1[3] ?? 0) - (c0[3] ?? 1)) * u;
      if (m.fadeIn > 0) a *= Math.min(1, m.t / m.fadeIn);
      if (m.end >= 0) a *= Math.max(0, 1 - (m.t - m.end) / 0.2);
      const o = n * 4;
      A.iA[o] = m.x; A.iA[o + 1] = m.y; A.iA[o + 2] = m.z; A.iA[o + 3] = m.s0 + (m.s1 - m.s0) * u;
      A.iC[o] = c0[0] + (c1[0] - c0[0]) * u; A.iC[o + 1] = c0[1] + (c1[1] - c0[1]) * u; A.iC[o + 2] = c0[2] + (c1[2] - c0[2]) * u; A.iC[o + 3] = a;
      A.iM[o] = m.k; A.iM[o + 1] = m.rot;
      n++;
    }
    this.geo.instanceCount = n;
    if (n) for (const k in A) { const at = this.geo.attributes[k]; at.clearUpdateRanges(); at.addUpdateRange(0, n * 4); at.needsUpdate = true; }
  }

  clear() { this.items.length = 0; this.geo.instanceCount = 0; }
}

export class Pillars {
  constructor(scene, { max = 12 } = {}) {
    this.max = max;
    this.items = [];
    this.time = { value: 0 };
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 20, 6, true).translate(0, 0.5, 0);
    const g = new THREE.InstancedBufferGeometry();
    g.index = cyl.index;
    g.setAttribute('position', cyl.attributes.position);
    g.setAttribute('normal', cyl.attributes.normal);
    this.iP = new Float32Array(max * 4); this.iH = new Float32Array(max * 4); this.iC = new Float32Array(max * 3);
    g.setAttribute('iP', new THREE.InstancedBufferAttribute(this.iP, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iH', new THREE.InstancedBufferAttribute(this.iH, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iC', new THREE.InstancedBufferAttribute(this.iC, 3).setUsage(THREE.DynamicDrawUsage));
    g.instanceCount = 0;
    this.geo = g;
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: PILLAR_VERT, fragmentShader: PILLAR_FRAG, uniforms: { uTime: this.time },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 21;
    scene.add(this.mesh);
  }

  /** Light column at pos (base). o: r, h, col [r,g,b] HDR, alpha, life (Infinity until stop()), taper, fadeIn, follow. */
  add(pos, { r = 0.35, h = 2.5, col = [0.15, 0.45, 1.2], alpha = 1, life = Infinity, taper = 0.6, fadeIn = 0.3, follow = null } = {}) {
    if (this.items.length >= this.max) this.items.shift();
    const p = { pos: new THREE.Vector3(pos.x, pos.y, pos.z), r, h, col, alpha, life, taper, fadeIn, follow, t: 0, end: -1, seed: Math.random() };
    p.stop = (fade = 0.5) => { if (p.end < 0) { p.end = p.t; p.fade = fade; } return p; };
    this.items.push(p);
    return p;
  }

  update(dt) {
    this.time.value += dt;
    let n = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.t += dt;
      let a = p.fadeIn > 0 ? Math.min(1, p.t / p.fadeIn) : 1;
      if (p.end >= 0) a *= 1 - (p.t - p.end) / p.fade;
      else if (isFinite(p.life)) a *= Math.min(1, (p.life - p.t) / 0.4);
      if (a <= 0 || (p.end < 0 && p.t >= p.life)) { this.items.splice(i, 1); continue; }
      if (p.follow) { const f = p.follow.pos || p.follow; p.pos.set(f.x, f.y, f.z); }
      const o = n * 4, o3 = n * 3;
      this.iP[o] = p.pos.x; this.iP[o + 1] = p.pos.y; this.iP[o + 2] = p.pos.z; this.iP[o + 3] = p.r;
      this.iH[o] = p.h; this.iH[o + 1] = p.alpha * a; this.iH[o + 2] = p.seed; this.iH[o + 3] = p.taper;
      this.iC[o3] = p.col[0]; this.iC[o3 + 1] = p.col[1]; this.iC[o3 + 2] = p.col[2];
      n++;
    }
    this.geo.instanceCount = n;
    if (n) for (const k of ['iP', 'iH', 'iC']) { const at = this.geo.attributes[k]; at.clearUpdateRanges(); at.addUpdateRange(0, n * at.itemSize); at.needsUpdate = true; }
  }

  clear() { this.items.length = 0; this.geo.instanceCount = 0; }
}
