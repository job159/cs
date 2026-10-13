// Shader-drawn ground marks (06b §9.1 #3): warning sweeps, shock rings, heal rings, gear rings, mottled stains,
// scrolling chevron strips, vortex glyphs, radial cracks and soft glows. One instanced quad layer, everything
// procedural (no textures). Premultiplied blending: additive glows (alpha 0) and dark / opaque stains (alpha > 0)
// share the single draw call.
//   const h = ground.add('shock', pos, { r: 0.3, r1: 4, life: 0.4, col: [2, 1.4, 0.8] });   h.stop()
import * as THREE from 'three';

export const GROUND = { telegraph: 0, shock: 1, heal: 2, gear: 3, spot: 4, arrow: 5, glyph: 6, crack: 7, glow: 8 };

const VERT = /* glsl */`
attribute vec4 iP;   // x, y, z, yaw (0 = +z)
attribute vec4 iS;   // radius (arrow: half width), length (arrow), ring width m, kind
attribute vec4 iC;   // HDR colour, opacity
attribute vec4 iX;   // fill, age, seed, variant
varying vec2 vN;     // normalised local coords (circle: -1..1, arrow: x -1..1, y 0..1)
varying vec2 vM;     // local metres
varying vec4 vS;
varying vec4 vC;
varying vec4 vX;
void main() {
  vec2 c = position.xy;
  vec2 l;
  if (abs(iS.w - 5.0) < 0.5) { l = vec2(c.x * iS.x, (c.y * 0.5 + 0.5) * iS.y); vN = vec2(c.x, c.y * 0.5 + 0.5); }
  else { l = c * iS.x * 1.15; vN = c * 1.15; }
  vM = l; vS = iS; vC = iC; vX = iX;
  float cs = cos(iP.w), sn = sin(iP.w);
  vec3 w = vec3(iP.x + l.x * cs + l.y * sn, iP.y, iP.z - l.x * sn + l.y * cs);
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;

const FRAG = /* glsl */`
uniform float uTime;
varying vec2 vN;
varying vec2 vM;
varying vec4 vS;
varying vec4 vC;
varying vec4 vX;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p) { return vn(p) * 0.55 + vn(p * 2.13 + 7.1) * 0.3 + vn(p * 4.71 + 3.3) * 0.15; }
float band(float x, float c, float w) { float k = (x - c) / w; return exp(-k * k); }
void main() {
  float kind = vS.w;
  vec2 p = vN;
  float d = length(p);
  float a01 = atan(p.x, p.y) / 6.2831853 + 0.5;          // 0..1 around, 0.5 = forward
  float e = max(vS.z / max(vS.x, 0.01), 0.006);           // ring width, normalised
  vec3 col = vC.rgb;
  float A = vC.a, fill = vX.x, age = vX.y, seed = vX.z, vr = vX.w;
  vec3 rgb = vec3(0.0);
  float al = 0.0;                                           // darkening (premultiplied alpha)
  if (kind < 0.5) {
    // telegraph: dark translucent disc, bright animated rim, ticks, countdown sweep (vr 0 sector, 1 radial)
    if (d > 1.06) discard;
    float inside = smoothstep(1.0, 0.98, d);
    float n = fbm(vM * 0.9 + seed * 13.0 + vec2(0.0, uTime * 0.3));
    float s = fract(a01 + 0.5);
    float done = vr < 0.5 ? step(s, fill) : step(d, fill);
    float front = vr < 0.5 ? band(s, fill, 0.012 / max(d, 0.15)) * step(0.001, fill) * step(fill, 0.999)
                           : band(d, fill, 0.025) * step(0.001, fill);
    float rim = band(d, 0.985, e * 1.4);
    float ticks = step(fract(a01 * 36.0), 0.22) * smoothstep(0.86, 0.9, d) * smoothstep(0.95, 0.92, d);
    float pulse = 0.8 + 0.2 * sin(uTime * 10.0);
    rgb = col * (inside * (0.05 + 0.1 * n + 0.32 * done * (0.75 + 0.25 * n)) + front * 0.9 * inside + rim * 1.1 * pulse + ticks * 0.45);
    al = inside * (0.18 + 0.12 * done);
  } else if (kind < 1.5) {
    // shock ring: sharp leading band with a soft wake inside
    if (d > 1.1) discard;
    float ring = band(d, 1.0 - e * 0.5, e);
    float wake = smoothstep(1.0 - e * 6.0, 1.0, d) * step(d, 1.0) * 0.35;
    float n = 0.75 + 0.25 * vn(vec2(a01 * 40.0, seed * 9.0));
    rgb = col * (ring * n + wake);
  } else if (kind < 2.5) {
    // heal ring: soft ring + inner glow + a crown of small crosses riding the ring
    if (d > 1.1) discard;
    float ring = band(d, 0.97, e);
    float inner = (1.0 - smoothstep(0.0, 1.0, d)) * 0.18;
    float k = fract(a01 * 8.0) - 0.5;
    float rr = (d - 0.88) * 8.0;
    vec2 q = vec2(k * 6.2831 * 0.88, rr) * 1.0;
    float cross = max(step(abs(q.x), 0.06) * step(abs(q.y), 0.22), step(abs(q.y), 0.06) * step(abs(q.x), 0.22));
    rgb = col * (ring + inner + cross * 0.8);
  } else if (kind < 3.5) {
    // gear: toothed ring with three gaps, rotating (vr = angle), thin inner ring
    if (d > 1.1) discard;
    float ang = fract(a01 + vr / 6.2831853);
    float teeth = step(0.5, fract(ang * 18.0));
    float outer = 0.9 + 0.06 * teeth;
    float g = smoothstep(outer, outer - 0.03, d) * smoothstep(0.74, 0.77, d);
    float gap = step(0.07, abs(fract(ang * 3.0) - 0.5) * 2.0);
    float inner = band(d, 0.62, 0.012);
    rgb = col * (g * gap * 0.9 + inner * 0.7 + band(d, 0.8, 0.12) * 0.15);
  } else if (kind < 4.5) {
    // mottled stain (poison / acid / dark spawn spot): alpha blended, bubbly edge
    float n = fbm(vM * 1.6 + seed * 11.0 + vec2(uTime * 0.05, 0.0));
    float m = smoothstep(1.0, 0.72, d + (n - 0.5) * 0.55);
    if (m <= 0.002) discard;
    float sheen = smoothstep(0.55, 0.85, fbm(vM * 3.2 - seed * 5.0 + uTime * 0.12)) * m;
    al = m * A;
    rgb = col * al + col * sheen * 0.6 * A * vr;           // vr > 0: glowing (acid) sheen on top
    gl_FragColor = vec4(rgb, al);
    return;
  } else if (kind < 5.5) {
    // arrow strip: chevrons scrolling toward the far end, bright side edges, fades out at the tip
    float x = abs(p.x), y = p.y;
    float len = vS.y;
    float edge = smoothstep(0.82, 0.95, x);
    float v = fract((y * len + x * vS.x * 0.9) / 1.4 - uTime * 4.0);   // arrowheads, centre leading
    float chev = smoothstep(0.0, 0.08, v) * smoothstep(0.32, 0.18, v);
    float tip = smoothstep(1.0, 0.85, y) * smoothstep(0.0, 0.04, y);
    float done = step(y, fill);
    rgb = col * tip * (edge * 0.9 + chev * (0.55 + 0.45 * done) + 0.07);
    al = tip * 0.16;
  } else if (kind < 6.5) {
    // vortex glyph: dark core, spiral arms, glowing rim (vr = spin angle)
    if (d > 1.1) discard;
    float arms = sin(atan(p.x, p.y) * 3.0 + log(max(d, 0.02)) * 5.0 - vr);
    float m = smoothstep(1.0, 0.6, d);
    float sp = smoothstep(0.2, 0.9, arms) * m;
    al = m * (0.35 + 0.4 * sp) * A;
    rgb = col * (sp * 0.35 + band(d, 0.95, 0.04) * 0.9) * A;
    gl_FragColor = vec4(rgb, al);
    return;
  } else if (kind < 7.5) {
    // radial cracks + crater stain (slams), alpha only
    if (d > 1.05) discard;
    float n = vn(vec2(d * 5.0, seed * 7.0));
    float ang = a01 * 11.0 + (n - 0.5) * 0.7 + seed * 3.1;
    float w = 0.05 * (1.0 - d) + 0.008;
    float crack = smoothstep(w, w * 0.3, abs(fract(ang) - 0.5) * d * 0.9) * smoothstep(1.0, 0.75, d + vn(vec2(floor(ang), seed)) * 0.4);
    float crater = smoothstep(0.32, 0.0, d) * (0.6 + 0.4 * fbm(vM * 3.0));
    al = clamp(crack * 0.85 + crater * 0.55, 0.0, 0.9) * A;
    gl_FragColor = vec4(col * al, al);
    return;
  } else {
    // soft glow pool
    if (d > 1.1) discard;
    rgb = col * exp(-d * d * 3.0) * (0.85 + 0.15 * fbm(vM * 0.8 + uTime * 0.2));
  }
  gl_FragColor = vec4(rgb * A, al * A);
}`;

export class GroundFX {
  constructor(scene, { max = 48 } = {}) {
    this.max = max;
    this.items = [];
    this.time = { value: 0 };
    const g = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(2, 2);
    g.index = quad.index;
    g.setAttribute('position', quad.attributes.position);
    this.arr = {};
    for (const k of ['iP', 'iS', 'iC', 'iX']) {
      this.arr[k] = new Float32Array(max * 4);
      g.setAttribute(k, new THREE.InstancedBufferAttribute(this.arr[k], 4).setUsage(THREE.DynamicDrawUsage));
    }
    g.instanceCount = 0;
    this.geo = g;
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: { uTime: this.time },
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;     // under smoke / particles, over the floor
    scene.add(this.mesh);
  }

  /**
   * Adds a ground mark. kind: GROUND key. pos: centre on the floor (arrow: start). opts:
   *   r (radius; arrow: half width), r1 (radius at the end of life, eased out), life (s; Infinity until stop()),
   *   col [r,g,b] HDR, alpha, fill (number, or [from, to] over life), rot (yaw), rotV (rad/s: gear / vortex spin),
   *   width (ring band m), len (arrow length m), fadeIn / fadeOut (s), follow (object with .pos or x/z: tracks it),
   *   variant (telegraph: 0 sector sweep, 1 radial; spot: glowing sheen 0..1).
   * Returns a handle: { stop(), t, r, alpha, pos }.
   */
  add(kind, pos, { r = 1, r1 = null, life = 1, col = [1, 1, 1], alpha = 1, fill = 0, rot = 0, rotV = 0, width = 0.08, len = 0, fadeIn = 0.05, fadeOut = 0.25, follow = null, variant = 0, ease = 0.5 } = {}) {
    if (this.items.length >= this.max) {
      // full: drop the oldest finite one (warnings and pools that never end stay)
      const i = this.items.findIndex((it) => isFinite(it.life));
      if (i < 0) return null;
      this.items.splice(i, 1);
    }
    const it = { k: GROUND[kind] ?? kind, pos: new THREE.Vector3(pos.x, pos.y, pos.z), r0: r, r1: r1 ?? r, r, life, col, alpha, fill, rot, rotV, width, len,
      fadeIn, fadeOut, follow, variant, ease, t: 0, seed: Math.random(), ang: 0, stopped: false };
    it.stop = (fade = it.fadeOut) => { if (!it.stopped) { it.stopped = true; it.fadeOut = fade; it.t0 = it.t; } return it; };
    this.items.push(it);
    return it;
  }

  update(dt) {
    this.time.value += dt;
    const A = this.arr;
    let n = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      it.ang += it.rotV * dt;
      // envelope: fade in, fade out over the last `fadeOut` s of a finite life, or after stop()
      let a = it.fadeIn > 0 ? Math.min(1, it.t / it.fadeIn) : 1;
      if (it.stopped) a *= 1 - (it.t - it.t0) / Math.max(1e-3, it.fadeOut);
      else if (isFinite(it.life)) a *= Math.min(1, (it.life - it.t) / Math.max(1e-3, it.fadeOut));
      if (a <= 0 || (!it.stopped && it.t >= it.life)) { this.items.splice(i, 1); continue; }
      const u = isFinite(it.life) ? Math.min(1, it.t / it.life) : 0;
      it.r = it.r0 + (it.r1 - it.r0) * (1 - Math.pow(1 - u, 1 / Math.max(0.05, it.ease)));
      if (it.follow) { const f = it.follow.pos || it.follow; it.pos.x = f.x; it.pos.z = f.z; if (it.followY) it.pos.y = f.y; }
      const fill = Array.isArray(it.fill) ? it.fill[0] + (it.fill[1] - it.fill[0]) * u : it.fill;
      const o = n * 4;
      A.iP[o] = it.pos.x; A.iP[o + 1] = it.pos.y; A.iP[o + 2] = it.pos.z; A.iP[o + 3] = it.rot;
      A.iS[o] = it.r; A.iS[o + 1] = it.len; A.iS[o + 2] = it.width; A.iS[o + 3] = it.k;
      A.iC[o] = it.col[0]; A.iC[o + 1] = it.col[1]; A.iC[o + 2] = it.col[2]; A.iC[o + 3] = it.alpha * Math.max(0, Math.min(1, a));
      A.iX[o] = fill; A.iX[o + 1] = it.t; A.iX[o + 2] = it.seed; A.iX[o + 3] = it.k === GROUND.gear || it.k === GROUND.glyph ? it.ang : it.variant;
      n++;
    }
    this.geo.instanceCount = n;
    if (n) for (const k in A) { const at = this.geo.attributes[k]; at.clearUpdateRanges(); at.addUpdateRange(0, n * 4); at.needsUpdate = true; }
  }

  clear() { this.items.length = 0; this.geo.instanceCount = 0; }
}
